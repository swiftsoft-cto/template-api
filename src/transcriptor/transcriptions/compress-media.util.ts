/**
 * Extrai e comprime apenas o ÁUDIO de vídeo ou áudio para transcrição.
 * Vídeo → extrai faixa de áudio (-vn) e reencoda em M4A.
 * Áudio → reencoda em M4A com bitrate calculado.
 * Reduz drasticamente o tamanho (vídeo tem muito mais MB que áudio).
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

function runCmd(
  cmd: string,
  args: string[],
  { silent = true }: { silent?: boolean } = {},
): Promise<{ out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: silent ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let out = '';
    let err = '';
    if (silent) {
      p.stdout?.on('data', (d) => (out += d.toString()));
      p.stderr?.on('data', (d) => (err += d.toString()));
    }
    p.on('error', (e: NodeJS.ErrnoException) => {
      if (e?.code === 'ENOENT')
        reject(new Error(`${cmd.toUpperCase()}_NOT_FOUND`));
      else reject(e);
    });
    p.on('close', (code) => {
      if (code === 0) resolve({ out, err });
      else reject(new Error(`${cmd} exited ${code}\n${err}`));
    });
  });
}

async function ffprobeDurationSeconds(inputPath: string): Promise<number> {
  const { out } = await runCmd('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ]).catch(() => {
    throw new Error('ffprobe failed - is ffmpeg installed?');
  });
  const parts = out.trim().split('\n');
  const line = parts[parts.length - 1]?.trim() ?? '';
  const s = parseFloat(line);
  if (!Number.isFinite(s) || s <= 0) {
    throw new Error(`Could not read duration: "${line}"`);
  }
  return s;
}

function safeNum(n: unknown, min: number, fallback: number): number {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? ''));
  return Number.isFinite(v) && v >= min ? v : fallback;
}

/**
 * Extrai apenas o áudio (vídeo → áudio) e comprime para ~ratio do tamanho original.
 * @param buffer Buffer do arquivo original (vídeo ou áudio)
 * @param mimeType MIME type (opcional)
 * @param sourceFileName Nome do arquivo (para inferir extensão)
 * @param ratio Proporção do tamanho alvo (0.10 = 10% = 90% de redução)
 * @returns Buffer em M4A (só áudio)
 */
export async function compressMediaForTranscription(
  buffer: Buffer,
  mimeType: string | undefined,
  sourceFileName: string,
  ratio = 0.1,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const targetRatio = safeNum(ratio, 0.01, 0.1);

  const ext = path.extname(sourceFileName) || '.mp4';
  const inputExt = ext.startsWith('.') ? ext : `.${ext}`;
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'compress-transcribe-'),
  );
  const inputPath = path.join(tmpDir, `input${inputExt}`);
  const outputPath = path.join(tmpDir, 'output.m4a');

  try {
    await fs.writeFile(inputPath, buffer);
  } catch (e) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }

  try {
    const stat = await fs.stat(inputPath);
    const inputBytes = stat.size;
    const targetBytes = Math.max(200_000, Math.floor(inputBytes * targetRatio));
    const duration = await ffprobeDurationSeconds(inputPath);
    const totalKbps = (targetBytes * 8) / duration / 1000;

    const audioKbps = Math.min(128, Math.max(48, Math.floor(totalKbps)));

    await runCmd('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-ac',
      '1',
      '-c:a',
      'aac',
      '-b:a',
      `${audioKbps}k`,
      '-movflags',
      '+faststart',
      outputPath,
    ]);

    const outBuffer = await fs.readFile(outputPath);
    return { buffer: outBuffer, mimeType: 'audio/mp4' };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
