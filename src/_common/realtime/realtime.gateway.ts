import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { IncomingMessage } from 'http';
import { WebSocketServer as WSServer, WebSocket } from 'ws';
import * as jwt from 'jsonwebtoken';
import * as cookie from 'cookie';
import { RealtimeService } from './realtime.service';

const ALLOWLIST = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

@WebSocketGateway({ path: '/ws' })
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: WSServer;

  constructor(private readonly rt: RealtimeService) {}

  afterInit(server: WSServer) {
    this.rt.setServer(server);
  }

  private extractToken(req: IncomingMessage): string | null {
    (req as any).__token_source = undefined;

    try {
      const u = new URL(req.url ?? '', 'http://local');
      const q = u.searchParams.get('token');
      if (q && q.trim()) {
        (req as any).__token_source = 'query';
        return q.trim();
      }
    } catch {}

    const authHeader = String(req.headers?.authorization ?? '');
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token) {
        (req as any).__token_source = 'authorization';
        return token;
      }
    }

    const rawCookie = req.headers?.cookie;
    if (rawCookie) {
      try {
        const parsed = cookie.parse(rawCookie);
        const value = parsed['access_token'];
        if (typeof value === 'string' && value.trim()) {
          (req as any).__token_source = 'cookie';
          return decodeURIComponent(value.trim());
        }
      } catch {}
    }

    const proto = String(req.headers?.['sec-websocket-protocol'] ?? '');
    if (proto) {
      const parts = proto
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const bearerIdx = parts.findIndex((p) => p.toLowerCase() === 'bearer');
      if (bearerIdx >= 0 && parts[bearerIdx + 1]) {
        (req as any).__token_source = 'subprotocol';
        return parts[bearerIdx + 1];
      }
      if (parts.length === 1 && parts[0].length > 20) {
        (req as any).__token_source = 'subprotocol';
        return parts[0];
      }
    }

    return null;
  }

  handleConnection(client: WebSocket, ...args: any[]) {
    const req = args[0] as IncomingMessage;
    const origin = String(req.headers?.origin ?? '');

    if (process.env.NODE_ENV === 'production' && ALLOWLIST.length) {
      if (!origin || !ALLOWLIST.includes(origin)) {
        this.close(client, 4403, 'CORS origin not allowed');
        return;
      }
    }

    try {
      const token = this.extractToken(req);
      if (!token) {
        // eslint-disable-next-line no-console
        console.warn('[ws] unauthorized: no token', {
          path: req.url,
          origin: req.headers.origin,
        });
        this.close(client, 4401, 'Unauthorized');
        return;
      }
      const secret = process.env.ACCESS_TOKEN_SECRET;
      if (!secret) {
        this.close(client, 4500, 'Server misconfig');
        return;
      }
      const payload: any = jwt.verify(token, secret, { algorithms: ['HS256'] });
      const userId = (
        payload?.userId ||
        payload?.sub ||
        payload?.id ||
        ''
      ).trim();
      if (!userId) {
        console.warn('[ws] unauthorized: no userId claim', {
          source: (req as any).__token_source,
        });
        this.close(client, 4401, 'Unauthorized');
        return;
      }
      (client as any).userId = userId;
      this.rt.registerClient(userId, client);
      client.on('close', () => this.rt.unregisterClient(client));
    } catch (error: any) {
      console.warn('[ws] unauthorized: jwt verify failed', {
        source: (req as any).__token_source,
        err: error?.message,
      });
      this.close(client, 4401, 'Unauthorized');
    }
  }

  handleDisconnect(client: WebSocket) {
    this.rt.unregisterClient(client);
  }

  private close(client: WebSocket, code: number, reason: string) {
    try {
      client.close(code, reason);
    } catch {
      client.terminate?.();
    }
  }
}
