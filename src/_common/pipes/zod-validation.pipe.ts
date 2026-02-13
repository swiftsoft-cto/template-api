import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
  Type,
} from '@nestjs/common';
import { ZodError, ZodIssue, ZodSchema } from 'zod';
import { I18nService, I18nContext } from 'nestjs-i18n';

interface ZodSchemaType extends Type<any> {
  schema: ZodSchema;
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private i18n: I18nService) {}

  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !(metatype as ZodSchemaType).schema) {
      return value;
    }

    try {
      return await (metatype as ZodSchemaType).schema.parseAsync(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const translatedErrors: Record<string, string> = {};
        const lang = I18nContext.current()?.lang;

        for (const err of error.errors as ZodIssue[]) {
          const key = err.path.join('.');
          const i18nKey = err.message;
          const { ...args } = err;
          let translated = String(
            await this.i18n.translate(i18nKey, { lang, args }),
          );
          if (translated === i18nKey) translated = i18nKey;
          translatedErrors[key] = translated;
        }

        const summary = await this.i18n.translate('validation.failed', {
          lang,
        });
        throw new BadRequestException({
          statusCode: 400,
          message: summary,
          errors: translatedErrors,
        });
      }
      throw error;
    }
  }
}
