import { Logger } from '@nestjs/common';

type Ctx = {
  traceId?: string;
  scope?: string;
  logger?: Logger | Console;
  level?: 'debug' | 'log' | 'warn' | 'error';
};
const N = BigInt(1_000_000);

export function startTimer(ctx: Ctx = {}) {
  const base = process.hrtime.bigint();
  const log = (label: string, extra: Record<string, any> = {}) => {
    const now = process.hrtime.bigint();
    const t_ms = Number((now - base) / N);
    const payload = {
      t_ms,
      label,
      traceId: ctx.traceId,
      scope: ctx.scope,
      ...extra,
    };
    const L: any = ctx.logger || console;
    const lvl = ctx.level || 'debug';
    (L[lvl] || L.log).call(
      L,
      `[⏱] ${ctx.scope || ''} ${label}`,
      JSON.stringify(payload),
    );
    return t_ms;
  };
  return { log, end: (extra: Record<string, any> = {}) => log('end', extra) };
}

export function since(t0: bigint) {
  return Number((process.hrtime.bigint() - t0) / N);
}

export function now() {
  return process.hrtime.bigint();
}
