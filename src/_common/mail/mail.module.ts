import { Module, Global } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { MailService } from './mail.service';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [
    ConfigModule,
    MailerModule.forRootAsync({
      useFactory: () => ({
        transport: {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
          // ⚠️ Só use isso em dev/homol: permite cert autoassinado
          ...(process.env.SMTP_ALLOW_INVALID_CERT === 'true'
            ? { tls: { rejectUnauthorized: false } }
            : {}),
        },
        defaults: {
          from: process.env.MAIL_FROM || 'No-Reply <no-reply@example.com>',
        },
      }),
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
