import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class StorageClientService {
  private readonly apiKey: string;
  private readonly logger = new Logger(StorageClientService.name);

  constructor(
    private http: HttpService,
    cfg: ConfigService,
  ) {
    const base = cfg.get<string>('STORAGE_BASE_URL');
    this.apiKey = cfg.get<string>('STORAGE_API_KEY') || '';
    if (!base) throw new Error('STORAGE_BASE_URL não definido');
    if (!this.apiKey) throw new Error('STORAGE_API_KEY não definido');
  }

  async upload(
    file: any,
    folder = 'avatars',
    compress = false,
    isPrivate = true,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FormData = require('form-data');
    const form = new FormData();

    // Suporte para stream ou buffer
    if (file.stream) {
      form.append('file', file.stream, {
        filename: file.originalname,
        contentType: file.mimetype,
      });
    } else {
      form.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });
    }

    form.append('folder', folder);
    if (compress) {
      form.append('compress', 'true');
    }
    if (isPrivate) {
      form.append('private', 'true');
    }

    const res = await lastValueFrom(
      this.http.post('/files', form, {
        headers: { 'x-api-key': this.apiKey, ...form.getHeaders() },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: () => true,
      }),
    );
    if (res.status >= 400) {
      throw new Error(
        `Storage upload failed (${res.status}): ${JSON.stringify(res.data)}`,
      );
    }
    return res.data; // { id, key, streamUrl, ... }
  }

  async delete(fileId: string) {
    const res = await lastValueFrom(
      this.http.delete(`/files/${fileId}`, {
        headers: { 'x-api-key': this.apiKey },
        validateStatus: () => true,
      }),
    );
    if (res.status >= 400) {
      throw new Error(
        `Storage delete failed (${res.status}): ${JSON.stringify(res.data)}`,
      );
    }
    return res.data;
  }

  /**
   * Faz pipe do stream de áudio/vídeo para a resposta HTTP.
   * Suporta Range requests (206 Partial Content) para permitir seek no player.
   * @param fileId - ID do arquivo no storage
   * @param res - Response do Express
   * @param opts - String (nome do arquivo para download) ou { download?, range? }
   */
  async pipeStreamToResponse(
    fileId: string,
    res: any,
    opts?: string | { download?: string; range?: string },
  ) {
    const download = typeof opts === 'string' ? opts : opts?.download;
    const range = typeof opts === 'object' ? opts?.range : undefined;

    const headers: Record<string, string> = { 'x-api-key': this.apiKey };
    if (range) headers['Range'] = range;

    const axiosRes = await lastValueFrom(
      this.http.get(`/files/${fileId}/stream`, {
        headers,
        responseType: 'stream',
        params: download ? { download } : undefined,
        validateStatus: () => true,
      }),
    );
    if (axiosRes.status >= 400) {
      res.status(axiosRes.status);
      if (axiosRes.headers['content-type'])
        res.setHeader('Content-Type', axiosRes.headers['content-type']);
      // axiosRes.data é um stream quando responseType: 'stream'; fazer pipe em vez de .json()
      (axiosRes.data as NodeJS.ReadableStream).pipe(res);
      return;
    }
    res.status(axiosRes.status);
    if (axiosRes.headers['content-type'])
      res.setHeader('Content-Type', axiosRes.headers['content-type']);
    if (axiosRes.headers['content-length'])
      res.setHeader('Content-Length', axiosRes.headers['content-length']);
    if (axiosRes.headers['content-range'])
      res.setHeader('Content-Range', axiosRes.headers['content-range']);
    if (axiosRes.headers['accept-ranges'])
      res.setHeader('Accept-Ranges', axiosRes.headers['accept-ranges']);
    if (axiosRes.headers['content-disposition'])
      res.setHeader(
        'Content-Disposition',
        axiosRes.headers['content-disposition'],
      );
    axiosRes.data.pipe(res);
  }

  /**
   * Baixa o arquivo inteiro como Buffer (útil para parsers como DOCX -> HTML).
   * Usa o mesmo endpoint de stream, porém com responseType 'arraybuffer'.
   */
  async getBuffer(fileId: string, download?: string): Promise<Buffer> {
    const axiosRes = await lastValueFrom(
      this.http.get(`/files/${fileId}/stream`, {
        headers: { 'x-api-key': this.apiKey },
        responseType: 'arraybuffer',
        params: download ? { download } : undefined,
        maxContentLength: Infinity as any,
        maxBodyLength: Infinity as any,
        validateStatus: () => true,
      }),
    );
    if (axiosRes.status >= 400) {
      throw new Error(
        `Storage getBuffer failed (${axiosRes.status}): ${Buffer.isBuffer(axiosRes.data) ? '<binary>' : JSON.stringify(axiosRes.data)}`,
      );
    }
    const data: any = axiosRes.data; // ArrayBuffer
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
  }

  // Aliases por compatibilidade
  async downloadBuffer(fileId: string, download?: string): Promise<Buffer> {
    return this.getBuffer(fileId, download);
  }

  async getFileBuffer(fileId: string, download?: string): Promise<Buffer> {
    return this.getBuffer(fileId, download);
  }
}
