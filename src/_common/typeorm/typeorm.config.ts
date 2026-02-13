// E:\workspace\clientes\otj\api\src\_common\typeorm\typeorm.config.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';
import { join } from 'path';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (
        cfg: ConfigService,
      ): DataSourceOptions & { autoLoadEntities: boolean } => {
        const urlStr = cfg.get<string>('DATABASE_URL')!;
        const url = new URL(urlStr);
        const synchronize = cfg.get<string>('SYNCHRONIZE') === 'true';
        const migrationsRun = cfg.get<string>('MIGRATIONS_RUN') === 'true';
        const schemaFromUrl = url.searchParams.get('schema') ?? undefined; // do Prisma (ignorado pelo pg)
        const schema =
          cfg.get<string>('DB_SCHEMA') || schemaFromUrl || 'public';

        return {
          type: 'postgres',
          host: url.hostname,
          port: Number(url.port || 5432),
          username: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password),
          database: url.pathname.replace(/^\//, ''),
          schema, // <- define explicitamente o schema
          synchronize, // <- lido do .env como boolean
          migrationsRun, // opcional, se usar migrations
          autoLoadEntities: true, // <- carrega entidades registradas via forFeature(...)
          // fallback extra para entities que não estejam em módulos
          entities: [join(__dirname, '..', '..', '**/*.entity.{js,ts}')],
          logging:
            cfg.get<string>('TYPEORM_LOGGING') === 'true'
              ? ['error', 'warn']
              : false,
        } as any;
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class TypeOrmConfigModule {}
