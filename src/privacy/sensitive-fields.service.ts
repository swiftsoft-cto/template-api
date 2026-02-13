import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../_common/redis/redis.service';
import { RolesService } from '../administration/roles/roles.service';
import { SensitiveField } from './sensitive-field.entity';
import {
  CreateSensitiveFieldInput,
  UpdateSensitiveFieldInput,
  SFPaginationInput,
} from './sensitive-fields.schema';

type Access = 'read' | 'write';

@Injectable()
export class SensitiveFieldsService {
  constructor(
    @InjectRepository(SensitiveField)
    private sensitiveFieldRepo: Repository<SensitiveField>,
    private redis: RedisService,
    private roles: RolesService,
  ) {}

  // Gate único por entidade (pode expandir no futuro)
  private readonly ENTITY_PII_READ_RULE: Record<string, string> = {
    User: 'users.read.pii',
  };
  private readonly ENTITY_PII_WRITE_RULE: Record<string, string> = {
    User: 'users.write.pii', // mantenho simétrico para escrita; ajuste se não quiser gate de write
  };

  private cacheKey(entity: string, companyId?: string | null) {
    return `privacy:sf:${entity}:${companyId ?? 'global'}`;
  }

  private effectiveCacheKey(entity: string, companyId?: string | null) {
    return `privacy:sf:effective:${entity}:${companyId ?? 'global'}`;
  }

  async list(q: SFPaginationInput) {
    const queryBuilder = this.sensitiveFieldRepo
      .createQueryBuilder('sf')
      .where('sf.deletedAt IS NULL');

    if (q.entity) {
      queryBuilder.andWhere('sf.entity = :entity', { entity: q.entity });
    }
    if (q.companyId) {
      queryBuilder.andWhere('sf.companyId = :companyId', {
        companyId: q.companyId,
      });
    }
    if (typeof q.active === 'boolean') {
      queryBuilder.andWhere('sf.active = :active', { active: q.active });
    }

    // Adiciona pesquisa por moduleName e label
    if (q.search) {
      queryBuilder.andWhere(
        '(sf.moduleName ILIKE :search OR sf.label ILIKE :search OR sf.entity ILIKE :search OR sf.field ILIKE :search)',
        { search: `%${q.search}%` },
      );
    }

    const [rows, total] = await Promise.all([
      queryBuilder
        .skip((q.page - 1) * q.limit)
        .take(q.limit)
        .orderBy('sf.createdAt', 'DESC')
        .getMany(),
      queryBuilder.getCount(),
    ]);

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

  async getOne(id: string) {
    const row = await this.sensitiveFieldRepo.findOne({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Sensitive field not found');
    return { data: row };
  }

  async create(data: CreateSensitiveFieldInput) {
    // Validação de unicidade
    if (!data.companyId) {
      const exists = await this.sensitiveFieldRepo.findOne({
        where: {
          entity: data.entity,
          field: data.field,
          companyId: null,
          deletedAt: null,
        },
      });
      if (exists)
        throw new ConflictException(
          'Campo global já definido para esta entidade/field.',
        );
    } else {
      const exists = await this.sensitiveFieldRepo.findOne({
        where: {
          entity: data.entity,
          field: data.field,
          companyId: data.companyId,
          deletedAt: null,
        },
      });
      if (exists)
        throw new ConflictException('Campo já definido para esta empresa.');
    }

    const createData = {
      entity: data.entity,
      field: data.field,
      moduleName: data.moduleName || null,
      label: data.label,
      description: data.description,
      readRule: data.readRule,
      writeRule: data.writeRule,
      active: data.active,
      companyId: data.companyId || null,
    };
    const row = await this.sensitiveFieldRepo.save(createData);
    await this.redis.del(this.cacheKey(row.entity, row.companyId));
    await this.redis.del(this.effectiveCacheKey(row.entity, row.companyId));
    return { data: row };
  }

  async update(id: string, data: UpdateSensitiveFieldInput) {
    const prev = await this.sensitiveFieldRepo.findOneOrFail({
      where: { id, deletedAt: null },
    });
    const row = await this.sensitiveFieldRepo.save({
      ...prev,
      ...data,
    });
    await this.redis.del(this.cacheKey(prev.entity, prev.companyId));
    await this.redis.del(this.effectiveCacheKey(prev.entity, prev.companyId));
    if (prev.entity !== row.entity || prev.companyId !== row.companyId) {
      await this.redis.del(this.cacheKey(row.entity, row.companyId));
      await this.redis.del(this.effectiveCacheKey(row.entity, row.companyId));
    }
    return { data: row };
  }

  async remove(id: string) {
    const prev = await this.sensitiveFieldRepo.findOneOrFail({
      where: { id, deletedAt: null },
    });
    await this.sensitiveFieldRepo.softDelete(id);
    await this.redis.del(this.cacheKey(prev.entity, prev.companyId));
    await this.redis.del(this.effectiveCacheKey(prev.entity, prev.companyId));
    return { ok: true };
  }

  /**
   * Obtém MAPEAMENTO de campos sensíveis ativos p/ entity, resolvendo override por companyId.
   * Política: se existir (entity, field, companyId=X), ele vence o global (companyId=null) daquele field.
   */
  async getActiveMap(entity: string, companyId?: string | null) {
    // Reaproveita o mapa efetivo e filtra só os ativos
    const eff = await this.getEffectiveMap(entity, companyId);
    const active: Record<
      string,
      { readRule?: string | null; writeRule?: string | null }
    > = {};
    for (const [field, cfg] of Object.entries(eff)) {
      if (cfg.active)
        active[field] = {
          readRule: cfg.readRule ?? null,
          writeRule: cfg.writeRule ?? null,
        };
    }
    return active;
  }

  /**
   * Mapa EFETIVO (com ativo/inativo), já resolvendo override por companyId.
   * Se existir (entity, field, companyId=X), ele vence o global (companyId=null).
   */
  async getEffectiveMap(
    entity: string,
    companyId?: string | null,
  ): Promise<
    Record<
      string,
      { active: boolean; readRule?: string | null; writeRule?: string | null }
    >
  > {
    const key = this.effectiveCacheKey(entity, companyId);
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);

    const query = this.sensitiveFieldRepo
      .createQueryBuilder('sf')
      .where('sf.entity = :entity', { entity })
      .andWhere('sf.deletedAt IS NULL')
      .andWhere('(sf.companyId IS NULL OR sf.companyId = :companyId)', {
        companyId: companyId || null,
      })
      .orderBy('sf.companyId', 'ASC')
      .addOrderBy('sf.createdAt', 'ASC');

    const rows = await query.getMany();

    const map: Record<
      string,
      { active: boolean; readRule?: string | null; writeRule?: string | null }
    > = {};
    for (const r of rows) {
      map[r.field] = {
        active: !!r.active,
        readRule: r.readRule ?? null,
        writeRule: r.writeRule ?? null,
      };
    }
    await this.redis.set(key, JSON.stringify(map), 60); // TTL 60s
    return map;
  }

  /**
   * Retorna o SET de campos sensíveis que o requester PODE LER/ESCREVER.
   */
  async getAllowedFields(
    entity: string,
    requesterId: string,
    companyId?: string | null,
    access: Access = 'read',
    targetUserId?: string, // quem está sendo lido/alterado
  ) {
    const effective = await this.getEffectiveMap(entity, companyId);
    // Considera somente os SENSÍVEIS ATIVOS
    const map: Record<
      string,
      { readRule?: string | null; writeRule?: string | null }
    > = {};
    for (const [field, cfg] of Object.entries(effective)) {
      if (cfg.active)
        map[field] = {
          readRule: cfg.readRule ?? null,
          writeRule: cfg.writeRule ?? null,
        };
    }
    const rules = await this.roles.getUserRules(requesterId);
    const out = new Set<string>();

    // Verifica se o usuário tem a SUPER_RULE (bypass total)
    const SUPER_RULE = process.env.SUPER_RULE ?? 'administrator';
    if (rules.includes(SUPER_RULE)) {
      // Se tem SUPER_RULE, retorna todos os campos sensíveis
      for (const field of Object.keys(map)) {
        out.add(field);
      }
      return out;
    }

    // OWN-DATA: leitura do próprio registro
    const isOwnData = targetUserId && requesterId === targetUserId;
    if (isOwnData && access === 'read') {
      for (const field of Object.keys(map)) out.add(field);
      return out;
    }

    for (const [field, cfg] of Object.entries(map)) {
      // Gate único por ENTIDADE (se definido) ou cai na regra específica do campo
      const entityGate =
        access === 'read'
          ? this.ENTITY_PII_READ_RULE[entity]
          : this.ENTITY_PII_WRITE_RULE[entity];
      const required =
        entityGate ?? (access === 'read' ? cfg.readRule : cfg.writeRule);

      if (!required || rules.includes(required)) {
        out.add(field);
      }
    }
    return out;
  }

  /**
   * Remove do payload quaisquer chaves sensíveis que o requester NÃO pode escrever.
   */
  async sanitizeWritePayload<T extends Record<string, any>>(
    entity: string,
    payload: T,
    requesterId: string,
    companyId?: string | null,
  ): Promise<Partial<T>> {
    const rules = await this.roles.getUserRules(requesterId);

    // Verifica se o usuário tem a SUPER_RULE (bypass total)
    const SUPER_RULE = process.env.SUPER_RULE ?? 'administrator';
    if (rules.includes(SUPER_RULE)) {
      // Se tem SUPER_RULE, retorna o payload completo sem sanitização
      return payload;
    }

    const allowed = await this.getAllowedFields(
      entity,
      requesterId,
      companyId,
      'write',
    );
    const map = await this.getActiveMap(entity, companyId);
    const clone: any = { ...payload };
    for (const key of Object.keys(map)) {
      if (!allowed.has(key)) delete clone[key];
    }
    return clone;
  }
}
