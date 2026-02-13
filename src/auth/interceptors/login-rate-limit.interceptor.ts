import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { Request } from 'express';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { RedisService } from '../../_common/redis/redis.service';
import { SecurityAlertsService } from '../security-alerts.service';
import { createHash } from 'node:crypto';
import { ipToSubnet } from '../utils/ip.util';

@Injectable()
export class LoginRateLimitInterceptor implements NestInterceptor {
  // janelas/limites
  private readonly WINDOW_MS = 15 * 60 * 1000; // 15 min (contador)
  private readonly MAX_ATTEMPTS_IP = 5; // 5 falhas por IP+UA
  private readonly MAX_ATTEMPTS_EMAIL = 5; // 5 falhas por e-mail (ajuste aqui se quiser 3)
  private readonly LOCK_DURATION_MS = 10 * 60 * 1000; // 10 min (bloqueio)

  constructor(
    private i18n: I18nService,
    private redis: RedisService,
    private alerts: SecurityAlertsService, // <— novo
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!(req.path === '/auth/login' && req.method === 'POST')) {
      return next.handle();
    }

    const lang = I18nContext.current()?.lang;
    const emailPlain = (req.body?.email ?? '').toLowerCase();
    const ipKeyHash = this.hashKey(this.getIpKey(req));
    const emailKeyHash = emailPlain
      ? this.hashKey(`login:email:${emailPlain}`)
      : undefined;

    // 1) PRÉ-CHEQUE: se já está bloqueado, retorna 429 com minutos restantes
    return from(this.precheckLocks(lang, ipKeyHash, emailKeyHash)).pipe(
      // segue pro handler do login
      // 2) Pós-checagem: só conta falhas (401) e aplica bloqueio quando estourar
      //    Caso o limite estoure, trocamos a resposta por 429 com "minutos restantes"
      //    Senão, propagamos o erro original.
      switchMap(() => next.handle()),
      catchError((err) =>
        from(
          this.handleLoginError(
            err,
            lang,
            ipKeyHash,
            req, // + NOVO
            emailKeyHash,
            emailPlain,
          ),
        ),
      ),
      // 3) Se o login foi bem-sucedido, limpa os contadores
      switchMap(async (result) => {
        await this.handleLoginSuccess(ipKeyHash, emailKeyHash);
        return result;
      }),
    );
  }

  // ---------- helpers ----------

  private hashKey(s: string) {
    return createHash('sha256').update(s).digest('hex');
  }

  private getIpKey(request: Request): string {
    const ip =
      (request.ips?.[0] ?? request.ip) ||
      request.connection.remoteAddress ||
      'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';
    return `login:ip:${ip}:${userAgent}`;
  }

  private async precheckLocks(
    lang: string | undefined,
    ipKeyHash: string,
    emailKeyHash?: string,
  ) {
    // Verifica bloqueio por e-mail E por IP (se qualquer um estiver ativo, bloqueia)
    const [ttlEmail, ttlIp] = await Promise.all([
      emailKeyHash
        ? this.redis.ttl(`rl:login:lock:${emailKeyHash}`)
        : Promise.resolve(0),
      this.redis.ttl(`rl:login:lock:${ipKeyHash}`),
    ]);

    const ttl = Math.max(ttlEmail, ttlIp);
    if (ttl > 0) {
      const minutes = Math.max(1, Math.ceil(ttl / 60));
      const message = await this.i18n.translate('auth.login_locked', {
        lang,
        args: { minutes },
      });
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async handleLoginError(
    err: any,
    lang: string | undefined,
    ipKeyHash: string,
    req: Request, // + NOVO
    emailKeyHash?: string,
    emailPlain?: string,
  ) {
    // Só contamos se foi uma falha de autenticação (401)
    if (!(err instanceof UnauthorizedException)) {
      // qualquer outro erro: deixa passar
      throw err;
    }

    const windowSec = Math.ceil(this.WINDOW_MS / 1000);
    const lockSec = Math.ceil(this.LOCK_DURATION_MS / 1000);

    const keysToProcess: Array<{ cnt: string; lock: string; max: number }> = [
      {
        cnt: `rl:login:cnt:${ipKeyHash}`,
        lock: `rl:login:lock:${ipKeyHash}`,
        max: this.MAX_ATTEMPTS_IP,
      },
    ];
    if (emailKeyHash) {
      keysToProcess.push({
        cnt: `rl:login:cnt:${emailKeyHash}`,
        lock: `rl:login:lock:${emailKeyHash}`,
        max: this.MAX_ATTEMPTS_EMAIL,
      });
    }

    let lockedNow = false;
    let lockedByEmail = false;
    let warningMessage = '';

    try {
      for (const k of keysToProcess) {
        const current = await this.redis.incrWithTTL(k.cnt, windowSec);

        // Verifica se chegou a 3 tentativas para mostrar aviso (mas não na última)
        if (current >= 3 && current < k.max) {
          const remaining = k.max - current;
          warningMessage = await this.i18n.translate('auth.login_warning', {
            lang,
            args: { remaining },
          });
        }

        if (current >= k.max) {
          const isIpKey = k.lock.includes(':ip:');

          // Se temos email, não cria lock por IP; deixa só por e-mail
          if (isIpKey && emailKeyHash) {
            continue;
          }

          await this.redis.set(k.lock, '1', lockSec);
          lockedNow = true;
          if (!isIpKey) lockedByEmail = true;
        }
      }
    } catch {
      // fail-open se o Redis der problema
    }

    if (lockedNow) {
      // Se bloqueou por e-mail, dispara notificação (com dedupe)
      if (lockedByEmail && emailKeyHash && emailPlain) {
        const mailDedupeKey = `rl:login:mailsent:${emailKeyHash}`;
        const alreadySent = await this.redis.get(mailDedupeKey);
        if (!alreadySent) {
          // tenta enviar; não falha o fluxo se der erro
          try {
            const ip =
              (req?.ips?.[0] ?? req?.ip) ||
              req?.connection.remoteAddress ||
              'unknown';
            const ua = req?.headers['user-agent'] || 'unknown';
            const subnet = ipToSubnet(ip);

            await this.alerts.sendLoginUnlock(
              emailPlain,
              emailKeyHash,
              ipKeyHash,
              subnet, // + NOVO
              ua, // + NOVO
            );
          } catch {
            // Log silencioso - não falha o fluxo se e-mail der erro
          }
          await this.redis.set(mailDedupeKey, '1', lockSec); // evita spam
        }
      }

      const minutes = Math.max(1, Math.ceil(lockSec / 60));
      const message = await this.i18n.translate('auth.login_locked', {
        lang,
        args: { minutes },
      });
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }

    // Se tem aviso, cria uma nova exceção com a mensagem combinada
    if (warningMessage) {
      const originalMessage = err.message;
      const combinedMessage = `${originalMessage}. ${warningMessage}`;
      throw new UnauthorizedException(combinedMessage);
    }

    // ainda não atingiu o limite: devolve a falha 401 original
    throw err;
  }

  private async handleLoginSuccess(ipKeyHash: string, emailKeyHash?: string) {
    try {
      const keysToClear: string[] = [
        // sempre limpe por IP
        `rl:login:cnt:${ipKeyHash}`,
        `rl:login:lock:${ipKeyHash}`,
      ];

      if (emailKeyHash) {
        // e também por e-mail (mais o dedupe do e-mail de alerta)
        keysToClear.push(
          `rl:login:cnt:${emailKeyHash}`,
          `rl:login:lock:${emailKeyHash}`,
          `rl:login:mailsent:${emailKeyHash}`,
        );
      }

      // dispara tudo em paralelo
      await Promise.all(keysToClear.map((k) => this.redis.del(k)));
    } catch {
      // não falhe o fluxo se não conseguir limpar
    }
  }
}
