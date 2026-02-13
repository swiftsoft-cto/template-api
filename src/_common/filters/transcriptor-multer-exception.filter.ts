import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { I18nService, I18nContext } from 'nestjs-i18n';

const TRANSCRIPTOR_FILE_LIMIT = '600MB';

@Catch()
export class TranscriptorMulterExceptionFilter implements ExceptionFilter {
  constructor(private i18n: I18nService) {}

  async catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const lang = I18nContext.current(host)?.lang;

    if (exception.code === 'LIMIT_FILE_SIZE') {
      const status = HttpStatus.PAYLOAD_TOO_LARGE;
      const message = await this.i18n.translate('common.file_too_large', {
        lang,
        args: { limit: TRANSCRIPTOR_FILE_LIMIT },
      });

      return response.status(status).json({
        statusCode: status,
        message,
        error: 'Payload Too Large',
      });
    }

    if (exception.status === HttpStatus.PAYLOAD_TOO_LARGE) {
      const message = await this.i18n.translate('common.file_too_large', {
        lang,
        args: { limit: TRANSCRIPTOR_FILE_LIMIT },
      });

      return response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message,
        error: 'Payload Too Large',
      });
    }

    throw exception;
  }
}
