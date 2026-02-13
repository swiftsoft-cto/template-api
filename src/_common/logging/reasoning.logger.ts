import { Logger } from '@nestjs/common';

type ReasonPayload = {
  type?: 'reasoning';
  scope: string;
  traceId?: string;
  step?: string;
  status?: 'ok' | 'error' | 'needs_ocr' | string;
  message: string; // frase para usuário final (mínimo de termos técnicos)
  details?: Record<string, any>; // (opcional) números/contagens
};

export class ReasoningLogger {
  private base = new Logger('REASONING');

  constructor(
    private scope: string,
    private traceId?: string,
  ) {}

  step(message: string, step?: string, details?: Record<string, any>) {
    const payload: ReasonPayload = {
      type: 'reasoning',
      scope: this.scope,
      traceId: this.traceId,
      step,
      message,
      details,
    };
    this.base.log(JSON.stringify(payload));
  }

  end(status: ReasonPayload['status'] = 'ok', details?: Record<string, any>) {
    const payload: ReasonPayload = {
      type: 'reasoning',
      scope: this.scope,
      traceId: this.traceId,
      status,
      message: status === 'ok' ? 'Concluído.' : 'Finalizado.',
      details,
    };
    this.base.log(JSON.stringify(payload));
  }

  error(userMessage: string, details?: Record<string, any>) {
    const payload: ReasonPayload = {
      type: 'reasoning',
      scope: this.scope,
      traceId: this.traceId,
      status: 'error',
      message: userMessage,
      details,
    };
    this.base.error(JSON.stringify(payload));
  }
}

export function makeReasoning(scope: string, traceId?: string) {
  return new ReasoningLogger(scope, traceId);
}
