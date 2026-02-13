import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export const corsConfig: CorsOptions = {
  origin: true, // reflete o Origin da requisição
  credentials: true, // permite cookies / Authorization

  // se você não definir `methods`, o cors usa:
  // "GET,HEAD,PUT,PATCH,POST,DELETE"
  // methods: undefined,

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name',
    'x-lang',
    'Accept-Language',
  ],

  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};
