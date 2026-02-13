import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { Observable } from 'rxjs';

@Injectable()
export class ContentLanguageInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const res = ctx.switchToHttp().getResponse();
    const lang = I18nContext.current()?.lang;
    if (lang) res.setHeader('Content-Language', lang);
    return next.handle();
  }
}
