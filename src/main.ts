import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import { I18nService } from 'nestjs-i18n';
import { ZodValidationPipe } from './_common/pipes/zod-validation.pipe';
import { ContentLanguageInterceptor } from './_common/interceptors/content-language.interceptor';
import { RequestLoggerInterceptor } from './_common/interceptors/request-logger.interceptor';
import { corsConfig } from './_config/cors.config';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import * as express from 'express';

async function bootstrap() {
  // Log de configuração do heap
  console.log('🔧 Configuração do Node.js:');
  console.log('  execArgv:', process.execArgv);
  console.log('  NODE_OPTIONS:', process.env.NODE_OPTIONS);
  console.log(
    '  max-old-space-size:',
    process.env.NODE_OPTIONS?.includes('--max-old-space-size')
      ? 'Configurado'
      : 'Não configurado',
  );

  // Validação de variáveis de ambiente críticas
  const requiredEnvVars = [
    'ACCESS_TOKEN_SECRET',
    'DATABASE_URL',
    'EMAIL_TOKEN_SECRET',
    'ACCESS_TOKEN_TTL',
    'REFRESH_TOKEN_TTL',
    'PASSWORD_RESET_SECRET',
    'ALLOWED_ORIGINS',
    'TRUST_IPV4_PREFIX',
    'TRUST_IPV6_PREFIX',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASS',
    'MAIL_FROM',
    'APP_WEB_URL',
    'SUPER_RULE',
  ];
  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName],
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`,
    );
  }

  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // Desabilitar para configurar manualmente com limite maior
  });

  // Configurar limite do body parser para requisições grandes (ex: scope HTML)
  const instance = app.getHttpAdapter().getInstance();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bodyParser = require('body-parser');

  // Middleware para capturar raw body do webhook Autentique (antes do parsing JSON)
  // Necessário para validação HMAC correta
  // Usa bodyParser.raw() apenas para essa rota específica
  instance.use(
    '/contracts/webhook/autentique',
    bodyParser.raw({ type: 'application/json', limit: '20mb' }),
    (req: any, res: any, next: any) => {
      // Salva o raw body e parseia para req.body
      if (Buffer.isBuffer(req.body)) {
        const rawBodyString = req.body.toString('utf8');
        req.rawBody = Buffer.from(rawBodyString, 'utf8');
        try {
          req.body = JSON.parse(rawBodyString);
        } catch {
          return res.status(400).json({ error: 'Invalid JSON' });
        }
      }
      next();
    },
  );

  // Body parser padrão para outras rotas
  instance.use(bodyParser.json({ limit: '20mb' }));
  instance.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));

  app.useWebSocketAdapter(new WsAdapter(app));

  // Configurar trust proxy de forma mais segura
  instance.set('trust proxy', 1);

  // Middleware de debug para CORS (apenas em desenvolvimento)
  if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
      // Mascara headers sensíveis
      const safeHeaders = { ...req.headers };
      if (safeHeaders.authorization) {
        safeHeaders.authorization = '***MASKED***';
      }
      if (safeHeaders.cookie) {
        safeHeaders.cookie = '***MASKED***';
      }

      next();
    });
  }

  // Configurar CORS
  app.enableCors(corsConfig);

  // Configurar cookie parser
  app.use(cookieParser());

  // Servir arquivos estáticos da pasta public em /public/*
  const publicPath = join(process.cwd(), 'public');
  instance.use('/public', express.static(publicPath));

  // Obter instância do i18n
  const i18n = app.get(I18nService);

  // Configurar pipes, filters e interceptors globais
  app.useGlobalPipes(new ZodValidationPipe(i18n as any));
  app.useGlobalInterceptors(
    new ContentLanguageInterceptor(),
    new RequestLoggerInterceptor(),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Servidor rodando na porta ${port}`);
}
bootstrap();
