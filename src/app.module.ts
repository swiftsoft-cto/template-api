import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './audit/audit.module';
import { TranscriptorModule } from './transcriptor/transcriptor.module';
import {
  I18nModule,
  AcceptLanguageResolver,
  QueryResolver,
  CookieResolver,
  HeaderResolver,
} from 'nestjs-i18n';
import { join } from 'path';
import { existsSync } from 'fs';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './administration/users/users.module';
import { AuthModule } from './auth/auth.module';
import { TypeOrmConfigModule } from './_common/typeorm/typeorm.config';
import { RedisModule } from './_common/redis/redis.module';
import { MailModule } from './_common/mail/mail.module';
import { CompaniesModule } from './administration/company/companies.module';
import { DepartmentsModule } from './administration/departments/departments.module';
import { RolesModule } from './administration/roles/roles.module';
import { RulesModule } from './administration/rules/rules.module';
import { SensitiveFieldsModule } from './privacy/sensitive-fields.module';
import { CustomersModule } from './administration/customers/customers.module';
import { RealtimeModule } from './_common/realtime/realtime.module';
import { ProjectsModule } from './projects-management/projects/projects.module';
import { ScopeModule } from './projects-management/scope/scope.module';
import { ContractsModule } from './projects-management/contracts/contracts.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WhatsAppModule } from './_common/whatsapp/whatsapp.module';
import { TrackingModule } from './_common/tracking/tracking.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmConfigModule,
    I18nModule.forRoot({
      fallbackLanguage: 'pt-BR',
      loaderOptions: {
        path: (() => {
          const i18nCandidates = [
            join(__dirname, 'i18n'), // ex.: dist/src/i18n  (quando __dirname = dist/src)
            join(__dirname, '..', 'i18n'), // ex.: dist/i18n      (quando __dirname = dist/src)
            join(process.cwd(), 'dist', 'src', 'i18n'),
            join(process.cwd(), 'src', 'i18n'),
          ];
          const found = i18nCandidates.find((p) => existsSync(p));
          if (!found) {
            throw new Error(
              `i18n: nenhum diretório encontrado. Execute "npm run build" ou verifique: ${i18nCandidates.join(', ')}`,
            );
          }
          return found;
        })(),
        watch: process.env.NODE_ENV !== 'production',
      },
      // resolvers em ordem de prioridade
      resolvers: [
        // ?lang=en ou ?locale=en
        { use: QueryResolver, options: ['lang', 'locale'] },
        // Cookie "lang=en"
        new CookieResolver(['lang']),
        // Header custom "x-lang: en" (opcional)
        new HeaderResolver(['x-lang']),
        // "Accept-Language: en-US,en;q=0.9"
        AcceptLanguageResolver,
      ],
      // mapeia variantes regionais para o pacote base
      fallbacks: {
        pt: 'pt-BR',
        'pt-*': 'pt-BR',
        'en-*': 'en',
        'es-*': 'es',
      },
    }),
    RedisModule,
    MailModule,
    UsersModule,
    AuthModule,
    CompaniesModule,
    DepartmentsModule,
    RolesModule,
    RulesModule,
    SensitiveFieldsModule,
    CustomersModule,
    ProjectsModule,
    ScopeModule,
    ContractsModule,
    NotificationsModule,
    RealtimeModule,
    WhatsAppModule,
    TrackingModule,
    AuditModule,
    TranscriptorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
