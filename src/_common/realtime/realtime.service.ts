import { Injectable } from '@nestjs/common';
import { WebSocketServer as WSServer, WebSocket } from 'ws';

export type ScopedRealtime = {
  /** Mensagem livre (equivalente a um console.log direcionado). */
  log: (message: string, meta?: any) => void;
  /** Marca entrada em uma fase (ex.: '0', '0.25', '0.5', '1', '2', '2.5'...). */
  phase: (code: string, label?: string, meta?: any) => void;
  /** Mensagem relacionada à IA — sempre prefixada com "Analisando..." */
  ai: (reason: string, meta?: any) => void;
  /** Retorna uma função no estilo console.log(...) já direcionada ao usuário. */
  console: () => (message: string, meta?: any) => void;
};

@Injectable()
export class RealtimeService {
  private server?: WSServer;
  /** userId -> Set<WebSocket> */
  private readonly userToClients = new Map<string, Set<WebSocket>>();
  /** client -> userId */
  private readonly clientToUser = new Map<WebSocket, string>();

  setServer(server: WSServer) {
    this.server = server;
  }

  registerClient(userId: string, client: WebSocket) {
    let set = this.userToClients.get(userId);
    if (!set) {
      set = new Set<WebSocket>();
      this.userToClients.set(userId, set);
    }
    set.add(client);
    this.clientToUser.set(client, userId);
  }

  unregisterClient(client: WebSocket) {
    const userId = this.clientToUser.get(client);
    if (!userId) return;
    this.clientToUser.delete(client);
    const set = this.userToClients.get(userId);
    if (set) {
      set.delete(client);
      if (set.size === 0) this.userToClients.delete(userId);
    }
  }

  emitToUser(userId: string, event: string, payload: any) {
    const set = this.userToClients.get(userId);
    if (!set || set.size === 0) return;
    const frame = JSON.stringify({ event, data: payload });
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(frame);
        } catch {
          // ignora falhas de envio individuais
        }
      }
    }
  }

  scoped(userId: string, runId?: string): ScopedRealtime {
    const emit = (payload: any) =>
      this.emitToUser(userId, 'case:progress', payload);

    const base = () => ({
      ts: new Date().toISOString(),
      runId: runId ?? null,
    });

    const log = (message: string, meta?: any) =>
      emit({ ...base(), kind: 'log', message, meta: meta ?? null });

    const phase = (code: string, label?: string, meta?: any) =>
      emit({
        ...base(),
        kind: 'phase',
        code,
        message: label ? `Fase ${code}: ${label}` : `Fase ${code}`,
        meta: meta ?? null,
      });

    const ai = (reason: string, meta?: any) =>
      emit({
        ...base(),
        kind: 'ai',
        message: `Analisando... ${reason}`,
        meta: meta ?? null,
      });

    const consoleFn = () => (message: string, meta?: any) => log(message, meta);

    return { log, phase, ai, console: consoleFn };
  }
}
