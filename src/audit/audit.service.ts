import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { AuditLog, AuditAction } from './entities/audit-log.entity';

export type AuditMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditRepo: Repository<AuditLog>,
  ) {}

  async record(params: {
    userId: string | null;
    action: AuditAction;
    entity: string;
    entityId: string;
    before?: any;
    after?: any;
    meta?: AuditMeta;
  }) {
    const log: Partial<AuditLog> = {
      id: crypto.randomUUID(),
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      before: params.before ?? null,
      after: params.after ?? null,
      ip: params.meta?.ip ?? null,
      userAgent: params.meta?.userAgent ?? null,
    };
    await this.auditRepo.insert(log as any);
    return log;
  }
}
