import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, QueryFailedError } from 'typeorm';
import { RedisService } from '../../_common/redis/redis.service';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { Role } from './role.entity';
import { User } from '../users/user.entity';
import { Company } from '../company/company.entity';
import { Rule } from '../rules/rule.entity';
import { UserRule } from '../users/user-rule.entity';
import { RoleRule } from './role-rule.entity';
import { DepartmentRole } from '../departments/department-role.entity';
import { Department } from '../departments/department.entity';
import {
  CreateRoleInput,
  UpdateRoleInput,
  RolePaginationInput,
} from './roles.schema';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Company)
    private companyRepo: Repository<Company>,
    @InjectRepository(Rule)
    private ruleRepo: Repository<Rule>,
    @InjectRepository(UserRule)
    private userRuleRepo: Repository<UserRule>,
    @InjectRepository(RoleRule)
    private roleRuleRepo: Repository<RoleRule>,
    @InjectRepository(DepartmentRole)
    private departmentRoleRepo: Repository<DepartmentRole>,
    @InjectRepository(Department)
    private departmentRepo: Repository<Department>,
    private redis: RedisService,
    private i18n: I18nService,
  ) {}

  private readonly ADMIN_ROLE_NAME =
    process.env.ADMIN_ROLE_NAME ?? 'Administrador';

  private getLang() {
    return I18nContext.current()?.lang;
  }

  private async countAdminsInCompany(companyId: string): Promise<number> {
    const adminRole = await this.roleRepo.findOne({
      where: {
        companyId,
        name: this.ADMIN_ROLE_NAME,
        deletedAt: null as any,
      },
      select: { id: true },
    });
    if (!adminRole) return 0;
    return this.userRepo.count({
      where: {
        companyId,
        roleId: adminRole.id,
        deletedAt: null as any,
      },
    });
  }

  private async requesterCompanyId(requesterId: string) {
    const me = await this.userRepo.findOne({
      where: { id: requesterId, deletedAt: null },
      select: { companyId: true },
    });
    return me?.companyId ?? null;
  }

  private async requireUserInCompanyOrThrow(
    userId: string,
    requesterId: string,
  ) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);
    const target = await this.userRepo.findOne({
      where: { id: userId, deletedAt: null } as any,
      select: { id: true, companyId: true } as any,
    });
    if (!target) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }
    if (
      requesterCompanyId &&
      (target as any).companyId !== requesterCompanyId
    ) {
      throw new ConflictException(
        await this.i18n.translate('roles.user_not_in_company', { lang }),
      );
    }
    return target as any;
  }

  // ---------- user <-> extra rules (additive) ----------
  async listUserExtraRules(userId: string, requesterId: string) {
    const lang = this.getLang();
    await this.requireUserInCompanyOrThrow(userId, requesterId);

    const rows = await this.userRuleRepo
      .createQueryBuilder('ur')
      .innerJoin(Rule, 'r', 'r.id = ur.rule_id')
      .where('ur.user_id = :uid', { uid: userId })
      .andWhere('ur.revoked_at IS NULL')
      .andWhere('(ur.expires_at IS NULL OR ur.expires_at > now())')
      .andWhere('r.deleted_at IS NULL')
      .select('r.id', 'id')
      .addSelect('r.name', 'name')
      .addSelect('r.description', 'description')
      .addSelect('ur.source', 'source')
      .addSelect('ur.expires_at', 'expiresAt')
      .orderBy('r.name', 'ASC')
      .getRawMany();

    const message = await this.i18n.translate('roles.rules_listed', { lang });
    return { message, data: rows };
  }
  //Aplicar uma Rule direto ao User
  async addRuleToUser(
    userId: string,
    ruleId: string,
    requesterId: string,
    opts?: { source?: 'manual' | 'payment'; expiresAt?: Date | null },
  ) {
    const lang = this.getLang();
    await this.requireUserInCompanyOrThrow(userId, requesterId);

    const rule = await this.ruleRepo.findOne({
      where: { id: ruleId, deletedAt: null } as any,
      select: { id: true } as any,
    });
    if (!rule) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    const existing = await this.userRuleRepo.findOne({
      where: { userId, ruleId } as any,
      select: { id: true, expiresAt: true } as any,
    });

    let nextExpiresAt: Date | null = existing?.expiresAt ?? null;
    if (typeof opts?.expiresAt !== 'undefined') {
      if (opts.expiresAt && existing?.expiresAt) {
        nextExpiresAt =
          existing.expiresAt.getTime() > opts.expiresAt.getTime()
            ? existing.expiresAt
            : opts.expiresAt;
      } else {
        nextExpiresAt = opts.expiresAt ?? null;
      }
    }

    await this.userRuleRepo.upsert(
      {
        id: existing?.id ?? crypto.randomUUID(),
        userId,
        ruleId,
        source: opts?.source ?? 'manual',
        expiresAt: nextExpiresAt,
        revokedAt: null,
      } as any,
      ['userId', 'ruleId'],
    );

    await this.redis.del(`authz:rules:${userId}`);

    const message = await this.i18n.translate('roles.rule_linked', { lang });
    return { message };
  }

  async removeRuleFromUser(
    userId: string,
    ruleId: string,
    requesterId: string,
  ) {
    const lang = this.getLang();
    await this.requireUserInCompanyOrThrow(userId, requesterId);

    await this.userRuleRepo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: () => 'now()' } as any)
      .where('user_id = :uid AND rule_id = :rid AND revoked_at IS NULL', {
        uid: userId,
        rid: ruleId,
      })
      .execute();

    await this.redis.del(`authz:rules:${userId}`);

    const message = await this.i18n.translate('roles.rule_unlinked', { lang });
    return { message };
  }

  async updateRuleForUser(
    userId: string,
    ruleId: string,
    requesterId: string,
    opts: { source?: 'manual' | 'payment'; expiresAt?: Date | null },
  ) {
    const lang = this.getLang();
    await this.requireUserInCompanyOrThrow(userId, requesterId);

    const existing = await this.userRuleRepo.findOne({
      where: { userId, ruleId, revokedAt: null } as any,
      select: { id: true } as any,
    });
    if (!existing) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    const updateData: Record<string, unknown> = {};
    if (opts.source !== undefined) updateData.source = opts.source;
    if (opts.expiresAt !== undefined) updateData.expiresAt = opts.expiresAt;

    if (Object.keys(updateData).length) {
      await this.userRuleRepo.update({ userId, ruleId }, updateData as any);
    }

    await this.redis.del(`authz:rules:${userId}`);

    const message = await this.i18n.translate('roles.rule_updated', { lang });
    return { message };
  }

  async create(data: CreateRoleInput, requesterId: string) {
    const lang = this.getLang();
    const companyId = await this.requesterCompanyId(requesterId);
    if (!companyId) {
      throw new ConflictException(
        await this.i18n.translate('roles.user_not_in_company', { lang }),
      );
    }

    try {
      const role = this.roleRepo.create({
        id: crypto.randomUUID(),
        name: data.name,
        companyId,
        description: data.description ?? null,
      } as any);
      const row = await this.roleRepo.save(role);
      const message = await this.i18n.translate('roles.created', { lang });
      return { message, data: row };
    } catch (error) {
      // Postgres duplicate key
      if (
        error instanceof QueryFailedError &&
        (error as any).driverError?.code === '23505'
      ) {
        throw new ConflictException(
          await this.i18n.translate('roles.name_already_exists', { lang }),
        );
      }
      throw error;
    }
  }

  async list(q: RolePaginationInput, requesterId: string) {
    const lang = this.getLang();
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = q;
    const requesterCompanyId = await this.requesterCompanyId(requesterId);

    const qb = this.roleRepo
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.company', 'company')
      .where('role.deletedAt IS NULL');

    if (requesterCompanyId) {
      qb.andWhere('role.companyId = :cid', { cid: requesterCompanyId });
    }
    if (search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('role.name ILIKE :s', { s: `%${search}%` });
        }),
      );
    }

    const orderMap: Record<string, string> = {
      createdAt: 'role.createdAt',
      name: 'role.name',
    };
    qb.orderBy(
      orderMap[sortBy] ?? 'role.createdAt',
      (sortOrder || 'desc').toUpperCase() as 'ASC' | 'DESC',
    )
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    const pagination = {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    };

    const message =
      rows.length > 0
        ? await this.i18n.translate('roles.listed', { lang })
        : await this.i18n.translate('roles.empty', { lang });

    return { message, data: rows, pagination };
  }

  async findOne(id: string, requesterId: string) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);

    const qb = this.roleRepo
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.company', 'company')
      .where('role.id = :id', { id })
      .andWhere('role.deletedAt IS NULL');
    if (requesterCompanyId)
      qb.andWhere('role.companyId = :cid', { cid: requesterCompanyId });

    const row = await qb.getOne();
    if (!row) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    const message = await this.i18n.translate('roles.found', { lang });
    return { message, data: row };
  }

  async update(id: string, data: UpdateRoleInput, requesterId: string) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);

    const exists = await this.roleRepo.findOne({
      where: {
        id,
        deletedAt: null,
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      } as any,
    });
    if (!exists) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    try {
      await this.roleRepo.update(
        { id },
        {
          name: data.name ?? exists.name,
          description:
            typeof data.description === 'undefined'
              ? exists.description
              : (data.description ?? null),
        },
      );

      const row = await this.roleRepo.findOne({ where: { id } });

      // Invalida cache de todos os usuários desse role
      const users = await this.userRepo.find({
        where: { roleId: id, deletedAt: null } as any,
        select: { id: true } as any,
      });
      await Promise.all(
        users.map((u) => this.redis.del(`authz:rules:${(u as any).id}`)),
      );

      const message = await this.i18n.translate('roles.updated', { lang });
      return { message, data: row };
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as any).driverError?.code === '23505'
      ) {
        throw new ConflictException(
          await this.i18n.translate('roles.name_already_exists', { lang }),
        );
      }
      throw error;
    }
  }

  async remove(id: string, requesterId: string) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);
    const role = await this.roleRepo.findOne({
      where: {
        id,
        deletedAt: null,
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      } as any,
    });
    if (!role) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    await this.roleRepo.update({ id }, { deletedAt: new Date() as any });

    // Invalida cache dos usuários que tinham esse role
    const users = await this.userRepo.find({
      where: { roleId: id } as any,
      select: { id: true } as any,
    });
    await Promise.all(
      users.map((u) => this.redis.del(`authz:rules:${(u as any).id}`)),
    );

    const message = await this.i18n.translate('roles.deleted', { lang });
    return { message };
  }

  // ---------- user <-> role ----------
  async listUsers(roleId: string, requesterId: string) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);
    const role = await this.roleRepo.findOne({
      where: {
        id: roleId,
        deletedAt: null,
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      } as any,
    });
    if (!role) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    // Select mínimo (sem campos sensíveis)
    const users = await this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.name', 'u.createdAt', 'u.updatedAt'])
      .where('u.deletedAt IS NULL')
      .andWhere('u.roleId = :rid', { rid: roleId })
      .orderBy('u.createdAt', 'DESC')
      .getMany();

    const message = await this.i18n.translate('roles.users_listed', { lang });
    return { message, data: users };
  }

  async setUserRole(userId: string, roleId: string, requesterId: string) {
    const lang = this.getLang();

    const user = await this.userRepo.findOne({
      where: { id: userId, deletedAt: null } as any,
      relations: ['role'],
      select: {
        id: true,
        companyId: true,
        roleId: true,
        role: { id: true, name: true },
      } as any,
    });
    const newRole = await this.roleRepo.findOne({
      where: { id: roleId, deletedAt: null } as any,
      select: { id: true, companyId: true, name: true } as any,
    });

    if (!user || !newRole) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    if (!user.companyId || user.companyId !== newRole.companyId) {
      throw new ConflictException(
        await this.i18n.translate('roles.user_not_in_company', { lang }),
      );
    }

    const currentRole = (user as any).role;
    const isCurrentlyAdmin = currentRole?.name === this.ADMIN_ROLE_NAME;
    const willBeAdmin = newRole.name === this.ADMIN_ROLE_NAME;
    const isSelf = userId === requesterId;

    if (isSelf && isCurrentlyAdmin && !willBeAdmin) {
      throw new ConflictException(
        await this.i18n.translate('roles.cannot_remove_own_admin_role', {
          lang,
        }),
      );
    }

    if (isCurrentlyAdmin && !willBeAdmin && !isSelf) {
      const adminCount = await this.countAdminsInCompany(user.companyId!);
      if (adminCount <= 1) {
        throw new ConflictException(
          await this.i18n.translate('roles.last_admin_cannot_change', { lang }),
        );
      }
    }

    await this.userRepo.update({ id: user.id }, { roleId: newRole.id } as any);

    await this.redis.del(`authz:rules:${user.id}`);

    const message = await this.i18n.translate('roles.user_linked', { lang });
    const warning =
      isCurrentlyAdmin && !willBeAdmin && !isSelf
        ? await this.i18n.translate('roles.admin_removed_warning', { lang })
        : undefined;
    return warning ? { message, warning } : { message };
  }

  async clearUserRole(userId: string, requesterId: string) {
    const lang = this.getLang();

    const user = await this.userRepo.findOne({
      where: { id: userId, deletedAt: null } as any,
      relations: ['role'],
      select: {
        id: true,
        companyId: true,
        role: { id: true, name: true },
      } as any,
    });

    if (!user) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    const currentRole = (user as any).role;
    const isCurrentlyAdmin = currentRole?.name === this.ADMIN_ROLE_NAME;
    const isSelf = userId === requesterId;

    if (isSelf && isCurrentlyAdmin) {
      throw new ConflictException(
        await this.i18n.translate('roles.cannot_remove_own_admin_role', {
          lang,
        }),
      );
    }

    if (isCurrentlyAdmin && !isSelf) {
      const adminCount = await this.countAdminsInCompany(user.companyId!);
      if (adminCount <= 1) {
        throw new ConflictException(
          await this.i18n.translate('roles.last_admin_cannot_change', { lang }),
        );
      }
    }

    await this.userRepo.update({ id: userId }, { roleId: null } as any);

    await this.redis.del(`authz:rules:${userId}`);

    const message = await this.i18n.translate('roles.user_unlinked', { lang });
    const warning = isCurrentlyAdmin
      ? await this.i18n.translate('roles.admin_removed_warning', { lang })
      : undefined;
    return warning ? { message, warning } : { message };
  }

  async getUserRole(userId: string) {
    const lang = this.getLang();

    const user = await this.userRepo.findOne({
      where: { id: userId, deletedAt: null } as any,
      relations: ['role'],
      select: {
        id: true,
        role: {
          id: true,
          name: true,
          description: true,
          companyId: true,
        } as any,
      } as any,
    });
    if (!user) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    const message = await this.i18n.translate('roles.user_roles_listed', {
      lang,
    });
    return { message, data: user.role };
  }

  // ---------- role <-> rule ----------
  async listRoleRules(roleId: string, requesterId: string) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);
    const role = await this.roleRepo.findOne({
      where: {
        id: roleId,
        deletedAt: null,
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      } as any,
    });
    if (!role) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    const rules = await this.ruleRepo
      .createQueryBuilder('r')
      .innerJoin(RoleRule, 'rr', 'rr.rule_id = r.id AND rr.role_id = :rid', {
        rid: roleId,
      })
      .where('r.deletedAt IS NULL')
      .orderBy('r.name', 'ASC')
      .getMany();

    const message = await this.i18n.translate('roles.rules_listed', { lang });
    return { message, data: rules };
  }

  async addRuleToRole(roleId: string, ruleId: string, requesterId: string) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);
    const role = await this.roleRepo.findOne({
      where: {
        id: roleId,
        deletedAt: null,
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      } as any,
      select: { id: true } as any,
    });
    const rule = await this.ruleRepo.findOne({
      where: { id: ruleId, deletedAt: null } as any,
      select: { id: true } as any,
    });
    if (!role || !rule) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    // upsert pela PK composta
    await this.roleRuleRepo.upsert({ roleId, ruleId }, ['roleId', 'ruleId']);

    // Invalida cache de todos os usuários deste role
    const users = await this.userRepo.find({
      where: { roleId } as any,
      select: { id: true } as any,
    });
    await Promise.all(
      users.map((u) => this.redis.del(`authz:rules:${(u as any).id}`)),
    );

    const message = await this.i18n.translate('roles.rule_linked', { lang });
    return { message };
  }

  async removeRuleFromRole(
    roleId: string,
    ruleId: string,
    requesterId: string,
  ) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);
    const role = await this.roleRepo.findOne({
      where: {
        id: roleId,
        deletedAt: null,
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      } as any,
    });
    if (!role) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    await this.roleRuleRepo.delete({ roleId, ruleId });

    // Invalida cache de todos os usuários deste role
    const users = await this.userRepo.find({
      where: { roleId } as any,
      select: { id: true } as any,
    });
    await Promise.all(
      users.map((u) => this.redis.del(`authz:rules:${(u as any).id}`)),
    );

    const message = await this.i18n.translate('roles.rule_unlinked', { lang });
    return { message };
  }

  /**
   * Helper para pegar as regras do usuário (com cache)
   * Aproveita o Redis já usado pelo guard e expõe um método reutilizável
   */
  async getUserRules(userId: string): Promise<string[]> {
    const cacheKey = `authz:rules:${userId}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    const me = await this.userRepo.findOne({
      where: { id: userId, deletedAt: null } as any,
      select: { roleId: true } as any,
    });

    const acc = new Set<string>();

    // 1) regras via ROLE
    if (me?.roleId) {
      const rows = await this.ruleRepo
        .createQueryBuilder('r')
        .innerJoin(RoleRule, 'rr', 'rr.rule_id = r.id AND rr.role_id = :rid', {
          rid: me.roleId,
        })
        .where('r.deletedAt IS NULL')
        .select(['r.name'])
        .orderBy('r.name', 'ASC')
        .getMany();
      for (const r of rows) acc.add(r.name);
    }

    // 2) regras EXTRAS por usuário (pagamento / liberação pontual)
    const extra = await this.userRuleRepo
      .createQueryBuilder('ur')
      .innerJoin(Rule, 'r', 'r.id = ur.rule_id')
      .where('ur.user_id = :uid', { uid: userId })
      .andWhere('ur.revoked_at IS NULL')
      .andWhere('(ur.expires_at IS NULL OR ur.expires_at > now())')
      .andWhere('r.deleted_at IS NULL')
      .select('r.name', 'name')
      .addSelect('ur.expires_at', 'expiresAt')
      .getRawMany<{ name: string; expiresAt: Date | null }>();

    let earliestExpiry: Date | null = null;
    for (const row of extra) {
      if (row?.name) acc.add(String(row.name));
      const exp = row?.expiresAt ? new Date(row.expiresAt) : null;
      if (
        exp &&
        (!earliestExpiry || exp.getTime() < earliestExpiry.getTime())
      ) {
        earliestExpiry = exp;
      }
    }

    const rules = Array.from(acc).sort((a, b) => a.localeCompare(b));

    // cache "best-effort"
    let ttlSeconds = 5 * 60;
    if (earliestExpiry) {
      const diffSec = Math.floor(
        (earliestExpiry.getTime() - Date.now()) / 1000,
      );
      if (diffSec > 0) ttlSeconds = Math.min(ttlSeconds, Math.max(5, diffSec));
    }
    try {
      await this.redis.set(cacheKey, JSON.stringify(rules), ttlSeconds);
    } catch {}

    return rules;
  }

  // ---------- role <-> department ----------
  async listDepartments(roleId: string, requesterId: string) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);

    const role = await this.roleRepo.findOne({
      where: {
        id: roleId,
        deletedAt: null,
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      } as any,
      select: { id: true } as any,
    });
    if (!role) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    const rows = await this.departmentRoleRepo
      .createQueryBuilder('dr')
      .innerJoinAndSelect('dr.department', 'd')
      .where('dr.roleId = :rid', { rid: roleId })
      .andWhere('d.deletedAt IS NULL')
      .orderBy('d.name', 'ASC')
      .getMany();

    const departments = rows
      .map((r) => r.department)
      .filter(Boolean)
      .map((d: any) => ({
        id: d.id,
        name: d.name,
        description: d.description ?? null,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }));

    const message = await this.i18n.translate('roles.departments_listed', {
      lang,
    });
    return { message, data: departments };
  }

  async addDepartment(
    roleId: string,
    departmentId: string,
    requesterId: string,
  ) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);

    const role = await this.roleRepo.findOne({
      where: {
        id: roleId,
        deletedAt: null,
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      } as any,
      select: { id: true, companyId: true } as any,
    });
    const dept = await this.departmentRepo.findOne({
      where: { id: departmentId, deletedAt: null } as any,
      select: { id: true, companyId: true } as any,
    });
    if (!role || !dept) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    if (role.companyId !== dept.companyId) {
      throw new ConflictException(
        await this.i18n.translate('departments.different_company', { lang }),
      );
    }

    await this.departmentRoleRepo.upsert({ departmentId, roleId } as any, [
      'departmentId',
      'roleId',
    ]);

    const message = await this.i18n.translate('roles.department_linked', {
      lang,
    });
    return { message };
  }

  async removeDepartment(
    roleId: string,
    departmentId: string,
    requesterId: string,
  ) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);

    const role = await this.roleRepo.findOne({
      where: {
        id: roleId,
        deletedAt: null,
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      } as any,
      select: { id: true } as any,
    });
    if (!role) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    await this.departmentRoleRepo.delete({ roleId, departmentId } as any);

    const message = await this.i18n.translate('roles.department_unlinked', {
      lang,
    });
    return { message };
  }
}
