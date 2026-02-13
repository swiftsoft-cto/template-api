import { Injectable } from '@nestjs/common';
import { RedisService } from '../_common/redis/redis.service';
import { createHash, randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountBlock } from './account-block.entity';
import { AccountBlockLog } from './account-block-log.entity';

export type BlockInfo = {
  blockedAt: string; // ISO
  blockedBy?: string; // userId do ator
  reason?: string;
  until?: string | null; // ISO
};

export type BlockStatus = 'active' | 'unblocked' | 'expired';
export type BlockAction = 'block' | 'unblock' | 'expire';

function emailHash(email: string) {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

@Injectable()
export class AccountBlockService {
  constructor(
    private redis: RedisService,
    @InjectRepository(AccountBlock) private abRepo: Repository<AccountBlock>,
    @InjectRepository(AccountBlockLog)
    private logRepo: Repository<AccountBlockLog>,
  ) {}

  // ------- Redis keys -------
  private keyByUser(userId: string) {
    return `auth:adminblock:user:${userId}`;
  }
  private keyByEmailHash(hash: string) {
    return `auth:adminblock:email:${hash}`;
  }

  private secondsUntil(until?: string | null): number | undefined {
    if (!until) return undefined;
    const ms = new Date(until).getTime() - Date.now();
    if (ms <= 0) return 1;
    return Math.ceil(ms / 1000);
  }

  // ------- Redis (enforcement) -------
  async getBlockByEmail(email: string) {
    const raw = await this.redis.get(this.keyByEmailHash(emailHash(email)));
    return raw ? (JSON.parse(raw) as BlockInfo) : null;
  }
  async getBlockByUser(userId: string) {
    const raw = await this.redis.get(this.keyByUser(userId));
    return raw ? (JSON.parse(raw) as BlockInfo) : null;
  }
  async isBlockedEmail(email: string) {
    return !!(await this.getBlockByEmail(email));
  }
  async isBlockedUser(userId: string) {
    return !!(await this.getBlockByUser(userId));
  }

  // ------- DB helpers -------
  private async logEvent(ev: {
    action: BlockAction;
    userId?: string | null;
    email?: string | null;
    emailHash?: string | null;
    actorId?: string | null;
    reason?: string | null;
    until?: Date | null;
  }) {
    await this.logRepo.save(
      this.logRepo.create({
        action: ev.action,
        userId: ev.userId ?? null,
        email: ev.email ?? null,
        emailHash: ev.emailHash ?? null,
        actorId: ev.actorId ?? null,
        reason: ev.reason ?? null,
        until: ev.until ?? null,
      }),
    );
  }

  private async createDbBlock(params: {
    userId?: string | null;
    email?: string | null;
    blockedBy?: string | null;
    reason?: string | null;
    until?: Date | null;
  }) {
    const emailPlain = params.email?.toLowerCase().trim() || null;
    const eh = emailPlain ? emailHash(emailPlain) : null;

    const row = await this.abRepo.save(
      this.abRepo.create({
        id: randomUUID(),
        userId: params.userId ?? null,
        email: emailPlain,
        emailHash: eh,
        reason: params.reason ?? null,
        blockedById: params.blockedBy ?? null,
        blockedAt: new Date(),
        until: params.until ?? null,
        status: 'active',
      }),
    );

    await this.logEvent({
      action: 'block',
      userId: row.userId ?? null,
      email: row.email ?? null,
      emailHash: row.emailHash ?? null,
      actorId: params.blockedBy ?? null,
      reason: row.reason ?? null,
      until: row.until ?? null,
    });

    return row;
  }

  private async closeActiveBlocks(where: {
    userId?: string;
    email?: string;
    statusTo: BlockStatus;
    actorId?: string | null;
  }) {
    const emailPlain = where.email?.toLowerCase().trim();
    const eh = emailPlain ? emailHash(emailPlain) : null;

    const qb = this.abRepo
      .createQueryBuilder()
      .update(AccountBlock)
      .set({
        status: where.statusTo,
        unblockedAt: new Date(),
        unblockedById: where.actorId ?? null,
      })
      .where('status = :st', { st: 'active' });

    if (where.userId) qb.andWhere('user_id = :uid', { uid: where.userId });
    if (eh) qb.andWhere('email_hash = :eh', { eh });

    const res = await qb.execute();

    if ((res.affected ?? 0) > 0) {
      await this.logEvent({
        action: where.statusTo === 'expired' ? 'expire' : 'unblock',
        userId: where.userId ?? null,
        email: emailPlain ?? null,
        emailHash: eh ?? null,
        actorId: where.actorId ?? null,
      });
    }
    return res.affected ?? 0;
  }

  // ------- API pública -------
  async blockByUser(userId: string, info: BlockInfo, userEmail?: string) {
    const ttl = this.secondsUntil(info.until ?? null);
    const payload = JSON.stringify(info);
    await this.redis.set(this.keyByUser(userId), payload, ttl);
    if (userEmail) {
      await this.redis.set(
        this.keyByEmailHash(emailHash(userEmail)),
        payload,
        ttl,
      );
    }
    await this.createDbBlock({
      userId,
      email: userEmail ?? null,
      blockedBy: info.blockedBy ?? null,
      reason: info.reason ?? null,
      until: info.until ? new Date(info.until) : null,
    });
  }

  async blockByEmail(email: string, info: BlockInfo) {
    const ttl = this.secondsUntil(info.until ?? null);
    const payload = JSON.stringify(info);

    await this.redis.set(this.keyByEmailHash(emailHash(email)), payload, ttl);

    // Tentativa de vincular a userId se existir (opcional: não é crítico)
    // Sem Prisma aqui; o vínculo pode ser feito quando o user existir.

    await this.createDbBlock({
      userId: null,
      email,
      blockedBy: info.blockedBy ?? null,
      reason: info.reason ?? null,
      until: info.until ? new Date(info.until) : null,
    });
  }

  async unblockByUser(userId: string, userEmail?: string) {
    await this.redis.del(this.keyByUser(userId));
    if (userEmail)
      await this.redis.del(this.keyByEmailHash(emailHash(userEmail)));
    await this.closeActiveBlocks({ userId, statusTo: 'unblocked' });
  }

  async unblockByEmail(email: string, actorId?: string) {
    await this.redis.del(this.keyByEmailHash(emailHash(email)));
    await this.closeActiveBlocks({
      email,
      statusTo: 'unblocked',
      actorId: actorId ?? null,
    });
  }

  async listBlocks(q: {
    page: number;
    limit: number;
    search?: string;
    sortBy: 'blockedAt' | 'until' | 'email' | 'userName';
    sortOrder: 'asc' | 'desc';
  }) {
    const skip = (q.page - 1) * q.limit;

    const qb = this.abRepo
      .createQueryBuilder('ab')
      .leftJoinAndSelect('ab.user', 'u')
      .leftJoinAndSelect('ab.blockedBy', 'actor')
      .where('ab.status = :st', { st: 'active' });

    if (q.search) {
      qb.andWhere(
        `(ab.email ILIKE :s OR ab.reason ILIKE :s OR u.name ILIKE :s OR actor.name ILIKE :s)`,
        { s: `%${q.search}%` },
      );
    }

    if (q.sortBy === 'userName') {
      qb.orderBy('u.name', q.sortOrder.toUpperCase() as 'ASC' | 'DESC');
    } else {
      qb.orderBy(`ab.${q.sortBy}`, q.sortOrder.toUpperCase() as 'ASC' | 'DESC');
    }

    qb.skip(skip).take(q.limit);

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
        hasNextPage: q.page * q.limit < total,
        hasPreviousPage: q.page > 1,
      },
    };
  }

  async listHistory(q: {
    page: number;
    limit: number;
    search?: string;
    sortBy: 'createdAt' | 'action';
    sortOrder: 'asc' | 'desc';
  }) {
    const skip = (q.page - 1) * q.limit;

    const qb = this.logRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.user', 'u')
      .leftJoinAndSelect('l.actor', 'actor');

    if (q.search) {
      qb.where(
        `(l.email ILIKE :s OR l.reason ILIKE :s OR u.name ILIKE :s OR actor.name ILIKE :s)`,
        { s: `%${q.search}%` },
      );
    }

    qb.orderBy(`l.${q.sortBy}`, q.sortOrder.toUpperCase() as 'ASC' | 'DESC')
      .skip(skip)
      .take(q.limit);

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
        hasNextPage: q.page * q.limit < total,
        hasPreviousPage: q.page > 1,
      },
    };
  }
}
