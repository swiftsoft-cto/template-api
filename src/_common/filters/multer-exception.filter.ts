import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { I18nService, I18nContext } from 'nestjs-i18n';

@Catch()
export class MulterExceptionFilter implements ExceptionFilter {
  constructor(private i18n: I18nService) {}

  async catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const lang = I18nContext.current(host)?.lang;

    // Verifica se é um erro do multer
    if (exception.code === 'LIMIT_FILE_SIZE') {
      const status = HttpStatus.PAYLOAD_TOO_LARGE;
      const message = await this.i18n.translate('common.file_too_large', {
        lang,
        args: { limit: '10MB' },
      });

      return response.status(status).json({
        statusCode: status,
        message,
        error: 'Payload Too Large',
      });
    }

    // Verifica se é um PayloadTooLargeException do NestJS
    if (exception.status === HttpStatus.PAYLOAD_TOO_LARGE) {
      const message = await this.i18n.translate('common.file_too_large', {
        lang,
        args: { limit: '10MB' },
      });

      return response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message,
        error: 'Payload Too Large',
      });
    }

    // Se não for um erro do multer, não trata (deixa outros filtros tratarem)
    throw exception;
  }
}
