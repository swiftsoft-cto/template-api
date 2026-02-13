import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageClientService } from './storage-client.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        baseURL: cfg.get<string>('STORAGE_BASE_URL'),
        timeout: 15000,
      }),
    }),
  ],
  providers: [StorageClientService],
  exports: [StorageClientService],
})
export class StorageClientModule {}
