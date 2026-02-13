import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { RedisService } from '../../_common/redis/redis.service';
import { createHash } from 'node:crypto';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly WINDOW_MS = 60 * 1000; // 1 min
  private readonly MAX_REQUESTS = 5;

  constructor(
    private i18n: I18nService,
    private redis: RedisService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.path === '/auth/refresh' && request.method === 'POST') {
      const lang = I18nContext.current()?.lang;
      const raw = this.getKey(request);
      const key = createHash('sha256').update(raw).digest('hex');
      const counterKey = `rl:refresh:cnt:${key}`;
      const windowSec = Math.ceil(this.WINDOW_MS / 1000);

      try {
        const count = await this.redis.incrWithTTL(counterKey, windowSec);
        if (count > this.MAX_REQUESTS) {
          const message = await this.i18n.translate(
            'auth.rate_limit_exceeded',
            { lang },
          );
          throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
        }
      } catch {
        // fail-open se Redis indisponível
      }
    }

    return next.handle();
  }

  private getKey(request: Request): string {
    const ip =
      (request.ips?.[0] ?? request.ip) ||
      request.connection.remoteAddress ||
      'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';
    return `refresh:${ip}:${userAgent}`;
  }
}
