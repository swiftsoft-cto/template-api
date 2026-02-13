import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggerInterceptor.name);

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const { method, url } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log(`${method} ${url} -> ${Date.now() - start}ms`),
        error: (err) =>
          this.logger.error(
            `${method} ${url} ERR(${Date.now() - start}ms): ${err?.message}`,
          ),
      }),
    );
  }
}
