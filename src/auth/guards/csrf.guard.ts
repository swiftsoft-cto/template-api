import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { I18nService, I18nContext } from 'nestjs-i18n';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private i18n: I18nService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Verifica se é uma requisição para /auth/refresh
    if (request.path === '/auth/refresh' && request.method === 'POST') {
      const origin = request.headers.origin;
      const referer = request.headers.referer;

      // Em produção, validação mais rigorosa
      if (process.env.NODE_ENV === 'production') {
        // Verifica se a origem é permitida (usar variável de ambiente)
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
          'http://localhost:5173',
          'http://localhost:3000',
        ];
        if (origin && !allowedOrigins.includes(origin)) {
          const lang = I18nContext.current()?.lang;
          throw new UnauthorizedException(
            await this.i18n.translate('auth.csrf_origin_not_allowed', { lang }),
          );
        }

        // Verifica se o referer é do mesmo domínio
        if (referer && origin) {
          const refererUrl = new URL(referer);
          const originUrl = new URL(origin);
          if (refererUrl.origin !== originUrl.origin) {
            const lang = I18nContext.current()?.lang;
            throw new UnauthorizedException(
              await this.i18n.translate('auth.csrf_referer_mismatch', { lang }),
            );
          }
        }
      }

      // Verifica se o header X-Requested-With está presente (proteção básica)
      if (!request.headers['x-requested-with']) {
        const lang = I18nContext.current()?.lang;
        throw new UnauthorizedException(
          await this.i18n.translate('auth.csrf_missing_header', { lang }),
        );
      }
    }

    return true;
  }
}
