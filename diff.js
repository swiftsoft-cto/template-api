#!/usr/bin/env node
// scripts/diff-head.js
// Mostra o diff entre o commit informado (ou HEAD por padrão) e o estado atual da árvore de trabalho.
// Ignora package-lock.json e yarn.lock
// Sempre grava o resultado em diff.txt (sem saída no terminal)

const { execFileSync } = require('child_process');
const fs = require('fs');

function runGit(args, opts = {}) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString();
    throw new Error(msg.trim());
  }
}

function insideRepo() {
  try {
    return runGit(['rev-parse', '--is-inside-work-tree']).trim() === 'true';
  } catch {
    return false;
  }
}

function headExists() {
  try {
    runGit(['rev-parse', '--verify', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

function getUntrackedFiles() {
  try {
    const out = runGit(['ls-files', '--others', '--exclude-standard']);
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// remove ANSI escape codes
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

function main() {
  if (!insideRepo()) {
    fs.writeFileSync('diff.txt', 'Erro: não parece ser um repositório Git.\n', 'utf8');
    process.exit(1);
  }

  const argv = process.argv.slice(2);
  const nameOnly = argv.includes('--name-only');
  const includeUntracked = !argv.includes('--no-untracked');

  // primeiro argumento que não é opção (--...) é considerado commit/tag/branch base
  const commitArg = argv.find(a => !a.startsWith('--'));

  // Base (commit fornecido, HEAD ou árvore vazia)
  let baseRef = 'HEAD';
  if (commitArg) {
    baseRef = commitArg;
  } else if (!headExists()) {
    baseRef = runGit(['hash-object', '-t', 'tree', '/dev/null']).trim();
  }

  // Arquivos a ignorar
  const ignore = ['package-lock.json', 'yarn.lock', 'diff.js', 'diff.txt', 'AI_TEMPLATES_OPTIMIZATION.md', 'OAB_FIELD_DOCUMENTATION.md', 'PGVECTOR_SETUP.md', 'prisma',
     'render.js', 'scripts' ];

  // Diff principal (tracked)
  const diffArgs = ['diff', '-M', '-C', '--no-ext-diff', '--color=never', baseRef, '--', '.'];
  if (nameOnly) diffArgs.push('--name-only');
  diffArgs.push(...ignore.map(f => `:(exclude)${f}`));

  let output = '';
  try {
    output += runGit(diffArgs);
  } catch (e) {
    output += e.message || '';
  }

  // Untracked (opcional)
  if (includeUntracked) {
    const untracked = getUntrackedFiles().filter(f => !ignore.includes(f));
    if (nameOnly) {
      if (untracked.length) {
        output += (output && !output.endsWith('\n') ? '\n' : '') + untracked.join('\n') + '\n';
      }
    } else {
      for (const file of untracked) {
        try {
          const patch = runGit(['diff', '--no-index', '--color=never', '--', '/dev/null', file]);
          if (patch && patch.trim()) {
            output += (output && !output.endsWith('\n') ? '\n' : '') + patch;
          }
        } catch (e) {
          const msg = e.message || '';
          if (msg.trim()) {
            output += (output && !output.endsWith('\n') ? '\n' : '') + msg + '\n';
          }
        }
      }
    }
  }

  if (!output.trim()) {
    output = 'Nenhuma diferença (ignorando package-lock.json e yarn.lock).\n';
  }

  // Salva somente no arquivo (sem imprimir no terminal)
  fs.writeFileSync('diff.txt', stripAnsi(output), 'utf8');
}

main();