import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis, { Redis as RedisClient } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClient;

  constructor() {
    const host = process.env.REDIS_HOST ?? '127.0.0.1';
    const port = Number(process.env.REDIS_PORT ?? 6379);
    const password = process.env.REDIS_PASSWORD ?? undefined;
    const db = Number(process.env.REDIS_DB ?? 0);

    this.client = new Redis({
      host,
      port,
      db,
      password,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });

    this.client.on('error', (err) =>
      this.logger.error(`Redis error: ${err.message}`),
    );
    this.client.on('connect', () => this.logger.log('Redis connecting...'));
    this.client.on('ready', () => this.logger.log('Redis ready'));
    this.client.on('close', () => this.logger.warn('Redis connection closed'));

    this.client.connect().catch((e) => {
      this.logger.error('Failed to connect to Redis on startup', e.stack);
    });
  }

  getClient(): RedisClient {
    return this.client;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // Helpers:
  async incrWithTTL(key: string, ttlSeconds: number): Promise<number> {
    const pipeline = this.client.multi();
    pipeline.incr(key);
    pipeline.expire(key, ttlSeconds, 'NX'); // só seta TTL se não houver
    const [incrRes] = await pipeline.exec();
    return (incrRes as any)[1] as number;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<'OK' | null> {
    return ttlSeconds
      ? this.client.set(key, value, 'EX', ttlSeconds)
      : this.client.set(key, value);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }
}
