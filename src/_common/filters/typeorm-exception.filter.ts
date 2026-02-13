import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch(QueryFailedError)
export class TypeOrmExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let field: string | undefined;

    // Postgres unique violation
    if (exception?.driverError?.code === '23505') {
      status = HttpStatus.CONFLICT;
      message = 'Campo já existe';
      // se quiser, parseie exception.detail para extrair o campo
    }

    res
      .status(status)
      .json({ statusCode: status, message, ...(field ? { field } : {}) });
  }
}
