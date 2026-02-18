import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull, Brackets } from 'typeorm';
import { RedisService } from '../../_common/redis/redis.service';
import { I18nService, I18nContext } from 'nestjs-i18n';
import {
  CreateUserInput,
  UpdateUserInput,
  PaginationInput,
} from './users.schema';
import { SensitiveFieldsService } from '../../privacy/sensitive-fields.service';
import { createHash } from 'node:crypto';
import { User } from './user.entity';
import { Role } from '../roles/role.entity';
import { Department } from '../departments/department.entity';
import { DepartmentRole } from '../departments/department-role.entity';
import { RefreshToken } from '../../auth/refresh-token.entity';
import { AccountBlock } from '../../auth/account-block.entity';

import * as bcrypt from 'bcryptjs';

function emailHash(email: string) {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(Role) private rolesRepo: Repository<Role>,
    @InjectRepository(Department) private deptRepo: Repository<Department>,
    @InjectRepository(DepartmentRole)
    private deptRoleRepo: Repository<DepartmentRole>,
    @InjectRepository(RefreshToken) private rtRepo: Repository<RefreshToken>,
    @InjectRepository(AccountBlock) private abRepo: Repository<AccountBlock>,
    private redis: RedisService,
    private i18n: I18nService,
    private sfService: SensitiveFieldsService,
  ) {}

  private readonly ADMIN_ROLE_NAME =
    process.env.ADMIN_ROLE_NAME ?? 'Administrador';

  private getLang() {
    return I18nContext.current()?.lang;
  }

  private async countAdminsInCompany(companyId: string): Promise<number> {
    const adminRole = await this.rolesRepo.findOne({
      where: { companyId, name: this.ADMIN_ROLE_NAME, deletedAt: IsNull() },
      select: { id: true },
    } as any);
    if (!adminRole) return 0;
    return this.usersRepo.count({
      where: {
        companyId,
        roleId: adminRole.id,
        deletedAt: IsNull(),
      } as any,
    });
  }

  private readonly BASE_SELECT = {
    id: true,
    name: true,
    email: true,
    phone: true,
    avatarFileId: true,
    emailVerifiedAt: true,
    createdAt: true,
    updatedAt: true,
    // NUNCA exponha password, deletedAt etc.
  } as const;

  private readonly ROLE_SELECT = {
    id: true,
    name: true,
    description: true,
    companyId: true,
  } as const;

  private async requesterCompanyId(requesterId: string) {
    const me = await this.usersRepo.findOne({
      where: { id: requesterId, deletedAt: IsNull() },
      select: { companyId: true, id: true } as any,
    } as any);
    return (me as any)?.companyId ?? null;
  }

  private async buildUserSelectDynamic(
    requesterId: string,
    targetUserId?: string,
  ) {
    const companyId = await this.requesterCompanyId(requesterId);

    // sensíveis ATIVOS que o requester pode LER
    const allowed = await this.sfService.getAllowedFields(
      'User',
      requesterId,
      companyId,
      'read',
      targetUserId,
    );

    // mapa EFETIVO (ativos/inativos) resolvido por company
    const effective = await this.sfService.getEffectiveMap('User', companyId);

    // traduz para colunas usando PROPRIEDADES (camelCase) para TypeORM alias corretos
    // isso evita erros como "distinctAlias.u_created_at does not exist"
    const allCols = {
      id: 'u.id',
      name: 'u.name',
      email: 'u.email',
      phone: 'u.phone',
      cpf: 'u.cpf',
      cnpj: 'u.cnpj',
      birthdate: 'u.birthdate',
      postalCode: 'u.postalCode',
      address: 'u.address',
      addressState: 'u.addressState',
      addressCity: 'u.addressCity',
      addressNeighborhood: 'u.addressNeighborhood',
      service: 'u.service',
      avatarFileId: 'u.avatarFileId',
      emailVerifiedAt: 'u.emailVerifiedAt',
      createdAt: 'u.createdAt',
      updatedAt: 'u.updatedAt',
    } as const;

    const selectSet = new Set<string>(Object.values(allCols));

    // 2) garante INATIVOS (se quiser tratá-los como comuns)
    for (const [field, cfg] of Object.entries(effective)) {
      if (!cfg.active && allCols[field as keyof typeof allCols]) {
        selectSet.add(allCols[field as keyof typeof allCols]);
      }
    }

    // 3) SUBTRAÇÃO: remove sensíveis ATIVOS não permitidos
    for (const [field, cfg] of Object.entries(effective)) {
      if (
        cfg.active &&
        !allowed.has(field) &&
        allCols[field as keyof typeof allCols]
      ) {
        selectSet.delete(allCols[field as keyof typeof allCols]);
      }
    }

    // 4) inclui explicitamente os ATIVOS permitidos (se não estavam no base)
    for (const f of allowed) {
      if (allCols[f as keyof typeof allCols]) {
        selectSet.add(allCols[f as keyof typeof allCols]);
      }
    }
    return Array.from(selectSet);
  }

  async sanitizeUpdatePayload(payload: any, requesterId: string) {
    const companyId = await this.requesterCompanyId(requesterId);
    // remove do body o que é sensível e não pode escrever
    return this.sfService.sanitizeWritePayload(
      'User',
      payload,
      requesterId,
      companyId,
    );
  }

  async create(data: CreateUserInput, currentUserId: string) {
    const lang = this.getLang();

    // DEBUG: Log dos dados recebidos para criação
    console.log('🔍 [DEBUG] UsersService.create - Dados recebidos:', {
      data: JSON.stringify(data, null, 2),
    });

    // Normaliza o e-mail
    const email = data.email.toLowerCase().trim();

    // Verifica se já existe um usuário com o email (incluindo soft-deleted)
    const existing = await this.usersRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.deleted_at'])
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .limit(1)
      .getRawOne<{ u_id: string; u_deleted_at: Date | null }>();

    if (existing) {
      const deletedAt = (existing as any).u_deleted_at;
      if (!deletedAt) {
        throw new ConflictException(
          await this.i18n.translate('users.email_already_exists', { lang }),
        );
      } else {
        throw new ConflictException(
          await this.i18n.translate('users.email_soft_deleted', { lang }),
        );
      }
    }

    // 👇 NOVO: busca o usuário atual para obter companyId
    const currentUser = await this.usersRepo.findOneOrFail({
      where: { id: currentUserId, deletedAt: IsNull() },
      select: { companyId: true, id: true } as any,
    } as any);

    // 👇 NOVO: valida o role e garante que pertence à mesma empresa do usuário atual
    const role = await this.rolesRepo.findOneOrFail({
      where: { id: (data as any).roleId, deletedAt: IsNull() },
      select: { id: true, companyId: true } as any,
    } as any);

    // Valida se o role pertence à mesma empresa do usuário atual
    if (
      (currentUser as any).companyId &&
      (currentUser as any).companyId !== (role as any).companyId
    ) {
      throw new ConflictException(
        await this.i18n.translate('roles.user_not_in_company', { lang }),
      );
    }

    // Hash da senha antes de salvar
    const hash = await bcrypt.hash(data.password, 12);

    const toSave: Partial<User> = {
      id: crypto.randomUUID(),
      name: data.name,
      email,
      phone: data.phone ?? null,
      cpf: data.cpf ?? null,
      birthdate: data.birthdate ?? null,
      password: hash,
      companyId: (currentUser as any).companyId || (role as any).companyId,
      roleId: role.id,
    };
    await this.usersRepo.insert(toSave as any);

    const cols = await this.buildUserSelectDynamic(currentUserId);
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .leftJoin('u.role', 'r')
      .addSelect(cols)
      .addSelect(['r.id', 'r.name', 'r.description', 'r.companyId'])
      .where('u.id = :id', { id: toSave.id })
      .getRawAndEntities()
      .then(({ entities }) => entities[0]);

    const message = await this.i18n.translate('users.created', { lang });
    return { message, data: user };
  }

  async findAll(query: PaginationInput) {
    // legado simples com BASE_SELECT
    const lang = this.getLang();
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const qb = this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.role', 'r')
      .where('u.deleted_at IS NULL');
    if (search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('u.name ILIKE :s', { s: `%${search}%` }).orWhere(
            'u.email ILIKE :s',
            { s: `%${search}%` },
          );
        }),
      );
    }
    qb.orderBy(`u.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC')
      .skip(skip)
      .take(limit);
    const [usersRaw, total] = await qb.getManyAndCount();

    // 2) Junta todos os roleIds existentes e resolve os departamentos em lote
    const roleIds = Array.from(
      new Set(usersRaw.map((u: any) => u.role?.id).filter(Boolean)),
    );

    let deptByRole = new Map<
      string,
      Array<{ id: string; name: string; description: string | null }>
    >();
    if (roleIds.length) {
      // pega department_roles e departments numa tacada
      const drs = await this.deptRoleRepo.find({
        where: { roleId: In(roleIds as string[]) },
        relations: ['department'],
      });

      deptByRole = drs.reduce((map, dr) => {
        const arr = map.get(dr.roleId) ?? [];
        if (dr.department) {
          arr.push({
            id: (dr.department as any).id,
            name: (dr.department as any).name,
            description: (dr.department as any).description ?? null,
          });
        }
        map.set(dr.roleId, arr);
        return map;
      }, new Map<string, Array<{ id: string; name: string; description: string | null }>>());
    }

    // 3) Monta a saída final com role + departments
    const users = usersRaw.map((u: any) => ({
      ...u,
      role: u.role ?? null,
      departments: u.role?.id ? (deptByRole.get(u.role.id) ?? []) : [],
    }));

    const totalPages = Math.ceil(total / limit);
    const pagination = {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };

    const message =
      users.length > 0
        ? await this.i18n.translate('users.listed', { lang })
        : await this.i18n.translate('users.empty', { lang });

    return { message, data: users, pagination };
  }

  async findOne(id: string) {
    const lang = this.getLang();

    // 1) usuário + role
    const user = await this.usersRepo.findOneOrFail({
      where: { id, deletedAt: IsNull() } as any,
      relations: ['role'],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarFileId: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        role: {
          id: true,
          name: true,
          description: true,
          companyId: true,
        } as any,
      } as any,
    } as any);

    // 2) departamentos do role (se houver)
    let departments: Array<{
      id: string;
      name: string;
      description: string | null;
    }> = [];
    if ((user as any).role?.id) {
      const drs = await this.deptRoleRepo.find({
        where: { roleId: (user as any).role.id },
        relations: ['department'],
      });
      departments = drs
        .map((dr) => dr.department)
        .filter(Boolean)
        .map((d: any) => ({
          id: d.id,
          name: d.name,
          description: d.description ?? null,
        }));
    }

    const message = await this.i18n.translate('users.found', { lang });
    return {
      message,
      data: {
        ...(user as any),
        role: (user as any).role ?? null,
        departments,
      },
    };
  }

  /**
   * DEPRECATED: não use. Mantido só por compat.
   * Remova quando todos os chamadores migrarem para updateDynamic().
   *
   * @deprecated Use updateDynamic() instead
   */
  async update(id: string, data: UpdateUserInput) {
    // usa o próprio usuário como requester (só é seguro para "meu perfil");
    // não use para admins atualizando terceiros.
    const sanitized = await this.sanitizeUpdatePayload(data as any, id);
    return this.updateDynamic(id, sanitized as any, { requesterId: id });
  }

  async remove(id: string, requesterId: string) {
    const lang = this.getLang();

    const user = await this.usersRepo.findOne({
      where: { id } as any,
      relations: ['role'],
      select: {
        id: true,
        companyId: true,
        deletedAt: true,
        role: { id: true, name: true },
      },
    } as any);

    if (!user) {
      throw new NotFoundException(
        await this.i18n.translate('users.not_found', { lang, args: { id } }),
      );
    }

    if ((user as any).deletedAt) {
      throw new ConflictException(
        await this.i18n.translate('users.already_deleted', { lang }),
      );
    }

    const role = (user as any).role;
    const isAdmin = role?.name === this.ADMIN_ROLE_NAME;
    const isSelf = id === requesterId;

    if (isSelf && isAdmin) {
      throw new ConflictException(
        await this.i18n.translate('roles.cannot_remove_own_admin_role', {
          lang,
        }),
      );
    }

    if (isAdmin && !isSelf) {
      const adminCount = await this.countAdminsInCompany(
        (user as any).companyId,
      );
      if (adminCount <= 1) {
        throw new ConflictException(
          await this.i18n.translate('users.last_admin_cannot_remove', { lang }),
        );
      }
    }

    // Soft delete e revoga todos os RTs
    await this.usersRepo.update({ id }, { deletedAt: new Date() as any });
    await this.rtRepo
      .createQueryBuilder()
      .update()
      .set({ revoked: true })
      .where({ userId: id, revoked: false })
      .execute();

    // Limpa cache de regras do usuário (higiene)
    await this.redis.del(`authz:rules:${id}`);

    const message = await this.i18n.translate('users.deleted', { lang });
    const warning =
      isAdmin && !isSelf
        ? await this.i18n.translate('users.admin_removed_warning', { lang })
        : undefined;
    return warning ? { message, warning } : { message };
  }

  /**
   * Busca usuário por email (campos públicos apenas)
   * NÃO retorna password - use findUserForAuth() para autenticação
   */
  async findByEmail(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    return this.usersRepo.findOne({
      where: { email: normalizedEmail, deletedAt: IsNull() } as any,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarFileId: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      } as any,
    } as any);
  }

  /**
   * Método interno para autenticação (retorna com password)
   * Use apenas no AuthService
   */
  async findUserForAuth(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    return this.usersRepo.findOne({
      where: { email: normalizedEmail, deletedAt: IsNull() } as any,
    } as any);
  }

  // ===== MÉTODOS DINÂMICOS PARA CAMPOS SENSÍVEIS =====

  async findAllDynamic(query: PaginationInput, ctx: { requesterId: string }) {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const requesterCompanyId = await this.requesterCompanyId(ctx.requesterId);

    // Aplica filtragem de campos sensíveis
    const selectFields = await this.buildUserSelectDynamic(ctx.requesterId);

    const qb = this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.role', 'r')
      .where('u.deleted_at IS NULL');

    // Aplica select dinâmico baseado em campos sensíveis
    if (selectFields.length > 0) {
      qb.select(selectFields)
        // garante campos mínimos do role, já que usamos leftJoinAndSelect
        .addSelect(['r.id', 'r.name', 'r.description']);
    }
    if (requesterCompanyId)
      qb.andWhere('u.company_id = :cid', { cid: requesterCompanyId });
    if (search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('u.name ILIKE :s', { s: `%${search}%` }).orWhere(
            'u.email ILIKE :s',
            { s: `%${search}%` },
          );
        }),
      );
    }
    // ordenação prioritária por "não bloqueados" não é trivial sem subquery; aplicamos sort padrão
    qb.orderBy(
      `u.${sortBy}`,
      (sortOrder.toUpperCase() as 'ASC' | 'DESC') ?? 'DESC',
    )
      .skip((page - 1) * limit)
      .take(limit);
    const [usersRaw, total] = await qb.getManyAndCount();

    // departamentos (igual ao seu código atual)
    const roleIds = Array.from(
      new Set(usersRaw.map((u: any) => u.role?.id).filter(Boolean)),
    );
    let deptByRole = new Map<
      string,
      Array<{ id: string; name: string; description: string | null }>
    >();
    if (roleIds.length) {
      const drs = await this.deptRoleRepo.find({
        where: { roleId: In(roleIds as string[]) },
        relations: ['department'],
      });
      deptByRole = drs.reduce((m, dr) => {
        const arr = m.get(dr.roleId) ?? [];
        if (dr.department) {
          arr.push({
            id: (dr.department as any).id,
            name: (dr.department as any).name,
            description: (dr.department as any).description ?? null,
          });
        }
        m.set(dr.roleId, arr);
        return m;
      }, new Map<string, Array<{ id: string; name: string; description: string | null }>>());
    }

    // ids e hashes dos e-mails que vieram no select (se o requester puder ver e-mail)
    const userIds = usersRaw.map((u: any) => u.id);
    const emailHashes = usersRaw
      .map((u: any) => (u.email ? emailHash(u.email) : null))
      .filter(Boolean) as string[];

    // busca os bloqueios ativos de uma vez (por userId OU por emailHash)
    const blockRows = await this.abRepo.find({
      where: [
        { status: 'active', userId: In(userIds as string[]) },
        ...(emailHashes.length
          ? [{ status: 'active', emailHash: In(emailHashes) } as any]
          : []),
      ],
      relations: ['blockedBy'],
      order: { blockedAt: 'DESC' },
    });

    // indexa para lookup O(1)
    const blockByUserId = new Map<string, any>();
    const blockByHash = new Map<string, any>();
    for (const b of blockRows) {
      if (b.userId && !blockByUserId.has(b.userId))
        blockByUserId.set(b.userId, b);
      if (b.emailHash && !blockByHash.has(b.emailHash))
        blockByHash.set(b.emailHash, b);
    }

    // monta a saída final acrescentando a flag
    const data = usersRaw.map((u: any) => {
      const h = u.email ? emailHash(u.email) : null;
      const b = blockByUserId.get(u.id) || (h ? blockByHash.get(h) : null);

      return {
        ...u,
        role: u.role ?? null,
        departments: u.role?.id ? (deptByRole.get(u.role.id) ?? []) : [],
        isBlocked: !!b,
        blockInfo: b
          ? {
              blockedAt: b.blockedAt,
              until: b.until,
              reason: b.reason,
              blockedBy: b.blockedBy, // { id, name }
            }
          : null,
      };
    });

    return {
      message: await this.i18n.translate('users.listed', {
        lang: I18nContext.current()?.lang,
      }),
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOneDynamic(id: string, requesterId?: string) {
    // Se não tiver requesterId, busca todos os campos (compatibilidade)
    const selectFields = requesterId
      ? await this.buildUserSelectDynamic(requesterId, id)
      : undefined;

    // Converte as colunas SQL para um objeto de select do TypeORM
    // Campos não sensíveis (cnpj, postalCode, address, etc.) são sempre incluídos
    // Campos sensíveis (email, phone, cpf, birthdate) dependem das permissões
    const selectObj = selectFields
      ? {
          id: true,
          name: true,
          email: selectFields.includes('u.email'),
          phone: selectFields.includes('u.phone'),
          cpf: selectFields.includes('u.cpf'),
          cnpj: true, // Campo não sensível, sempre incluído
          birthdate: selectFields.includes('u.birthdate'),
          postalCode: true, // Campo não sensível, sempre incluído
          address: true, // Campo não sensível, sempre incluído
          addressState: true, // Campo não sensível, sempre incluído
          addressCity: true, // Campo não sensível, sempre incluído
          addressNeighborhood: true, // Campo não sensível, sempre incluído
          service: true, // Campo não sensível, sempre incluído
          avatarFileId: true,
          emailVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
          companyId: true,
          roleId: true,
          tokenVersion: true,
        }
      : undefined;

    const user = await this.usersRepo.findOneOrFail({
      where: { id, deletedAt: IsNull() } as any,
      relations: ['role'],
      select: selectObj as any,
    } as any);

    let departments: Array<{
      id: string;
      name: string;
      description: string | null;
    }> = [];
    if ((user as any).role?.id) {
      const drs = await this.deptRoleRepo.find({
        where: { roleId: (user as any).role.id },
        relations: ['department'],
      });
      departments = drs
        .map((dr) => dr.department)
        .filter(Boolean)
        .map((d: any) => ({
          id: d.id,
          name: d.name,
          description: d.description ?? null,
        }));
    }

    // tenta obter hash do e-mail (mesmo que não esteja no select dinâmico)
    let hash: string | null = null;
    if ((user as any).email) {
      hash = emailHash((user as any).email);
    } else {
      const raw = await this.usersRepo.findOne({
        where: { id, deletedAt: IsNull() } as any,
        select: { email: true } as any,
      } as any);
      if (raw?.email) hash = emailHash(raw.email);
    }

    const activeBlock = await this.abRepo.findOne({
      where: [
        { status: 'active', userId: id },
        ...(hash ? [{ status: 'active', emailHash: hash } as any] : []),
      ],
      relations: ['blockedBy'],
      order: { blockedAt: 'DESC' },
    });

    return {
      message: await this.i18n.translate('users.found', {
        lang: I18nContext.current()?.lang,
      }),
      data: {
        ...(user as any),
        role: (user as any).role ?? null,
        departments,
        isBlocked: !!activeBlock,
        blockInfo: activeBlock
          ? {
              blockedAt: activeBlock.blockedAt,
              until: activeBlock.until,
              reason: activeBlock.reason,
              blockedBy: activeBlock.blockedBy,
            }
          : null,
      },
    };
  }

  async updateDynamic(
    id: string,
    data: UpdateUserInput,
    ctx: { requesterId: string },
  ) {
    // seu update existente (revogação de tokens, troca de email etc.) permanece.
    // Apenas NÃO copie campos sensíveis não permitidos (já sanitizado na controller)
    // e mantenha o select dinâmico no retorno:

    // DEBUG: Log dos dados recebidos no UsersService
    console.log('🔍 [DEBUG] UsersService.updateDynamic - Dados recebidos:', {
      id,
      data: JSON.stringify(data, null, 2),
    });

    const current = await this.usersRepo.findOneOrFail({
      where: { id, deletedAt: IsNull() } as any,
      select: { email: true, companyId: true, roleId: true, id: true } as any,
    } as any);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.cpf !== undefined) updateData.cpf = data.cpf;
    if ((data as any).cnpj !== undefined)
      updateData.cnpj = (data as any).cnpj ?? null;
    if (data.birthdate !== undefined)
      updateData.birthdate = data.birthdate ?? null;
    if ((data as any).postalCode !== undefined)
      updateData.postalCode = (data as any).postalCode ?? null;
    if ((data as any).address !== undefined)
      updateData.address = (data as any).address ?? null;
    if ((data as any).addressState !== undefined)
      updateData.addressState = (data as any).addressState ?? null;
    if ((data as any).addressCity !== undefined)
      updateData.addressCity = (data as any).addressCity ?? null;
    if ((data as any).addressNeighborhood !== undefined)
      updateData.addressNeighborhood =
        (data as any).addressNeighborhood ?? null;
    if ((data as any).service !== undefined)
      updateData.service = (data as any).service ?? null;

    // DEBUG: Log dos dados que serão atualizados no banco
    console.log(
      '🔍 [DEBUG] UsersService.updateDynamic - Dados para atualização no banco:',
      {
        updateData: JSON.stringify(updateData, null, 2),
      },
    );

    let shouldRevokeTokens = false;
    let roleChanged = false;
    let adminRemovedWarning = false;
    let roleChangeSkippedOwnAdmin = false;

    if (data.password) {
      const hash = await bcrypt.hash(data.password, 12);
      updateData.password = hash;
      shouldRevokeTokens = true;
    }

    if (typeof data.email !== 'undefined') {
      const normalized = data.email.toLowerCase().trim();
      if (normalized !== ((current as any)?.email ?? '').toLowerCase()) {
        updateData.email = normalized;
        updateData.emailVerifiedAt = null;
        shouldRevokeTokens = true;
      }
    }

    if ((data as any).roleId !== undefined) {
      const newRoleId = (data as any).roleId;
      const currentRoleId = (current as any).roleId;
      const companyId = (current as any).companyId;
      const isSelf = id === ctx.requesterId;

      let currentRoleName: string | null = null;
      if (currentRoleId) {
        const cr = await this.rolesRepo.findOne({
          where: { id: currentRoleId } as any,
          select: { name: true } as any,
        });
        currentRoleName = (cr as any)?.name ?? null;
      }

      const isCurrentlyAdmin = currentRoleName === this.ADMIN_ROLE_NAME;

      if (newRoleId === null) {
        if (isSelf && isCurrentlyAdmin) {
          roleChangeSkippedOwnAdmin = true;
          // Não aplica alteração de role; resto do update segue normalmente
        } else         if (isCurrentlyAdmin && !isSelf) {
          const adminCount = await this.countAdminsInCompany(companyId);
          if (adminCount <= 1) {
            throw new ConflictException(
              await this.i18n.translate('roles.last_admin_cannot_change', {
                lang: this.getLang(),
              }),
            );
          }
        }
        if (!roleChangeSkippedOwnAdmin) {
          updateData.roleId = null;
          roleChanged = currentRoleId !== null;
          adminRemovedWarning = isCurrentlyAdmin && !isSelf;
        }
      } else {
        const role = await this.rolesRepo.findOneOrFail({
          where: { id: newRoleId, deletedAt: IsNull() } as any,
          select: { id: true, companyId: true, name: true } as any,
        } as any);
        if (companyId && companyId !== (role as any).companyId) {
          throw new ConflictException(
            await this.i18n.translate('roles.user_not_in_company', {
              lang: this.getLang(),
            }),
          );
        }
        const willBeAdmin = (role as any).name === this.ADMIN_ROLE_NAME;
        if (isSelf && isCurrentlyAdmin && !willBeAdmin) {
          roleChangeSkippedOwnAdmin = true;
          // Não aplica alteração de role; resto do update segue normalmente
        } else         if (isCurrentlyAdmin && !willBeAdmin && !isSelf) {
          const adminCount = await this.countAdminsInCompany(companyId);
          if (adminCount <= 1) {
            throw new ConflictException(
              await this.i18n.translate('roles.last_admin_cannot_change', {
                lang: this.getLang(),
              }),
            );
          }
        }
        if (!roleChangeSkippedOwnAdmin) {
          updateData.roleId = role.id;
          if (!companyId) updateData.companyId = (role as any).companyId;
          roleChanged = currentRoleId !== role.id;
          adminRemovedWarning = isCurrentlyAdmin && !willBeAdmin && !isSelf;
        }
      }
    }

    await this.usersRepo.update({ id }, updateData);
    const user = await this.usersRepo.findOne({
      where: { id, deletedAt: IsNull() } as any,
      relations: ['role'],
    } as any);

    // Aplicar select dinâmico se necessário
    await this.buildUserSelectDynamic(ctx.requesterId, id);

    if (shouldRevokeTokens) {
      await this.rtRepo
        .createQueryBuilder()
        .update()
        .set({ revoked: true })
        .where({ userId: id, revoked: false })
        .execute();
      await this.usersRepo
        .createQueryBuilder()
        .update()
        .set({ tokenVersion: () => `"token_version" + 1` })
        .where({ id })
        .execute();
    }

    if (roleChanged) {
      await this.redis.del(`authz:rules:${id}`);
    }

    let message = await this.i18n.translate('users.updated', {
      lang: I18nContext.current()?.lang,
    });
    const warning = adminRemovedWarning
      ? await this.i18n.translate('roles.admin_removed_warning', {
          lang: I18nContext.current()?.lang,
        })
      : roleChangeSkippedOwnAdmin
        ? await this.i18n.translate('roles.cannot_remove_own_admin_role', {
            lang: I18nContext.current()?.lang,
          })
        : undefined;
    if (roleChangeSkippedOwnAdmin && warning) {
      message = warning;
    }
    return {
      message,
      ...(warning && { warning }),
      data: user,
    };
  }

  // ===== helpers usados na controller =====
  async updateAvatarId(id: string, fileId: string) {
    await this.usersRepo.update({ id }, { avatarFileId: fileId });
  }

  async getAvatarMeta(id: string) {
    return this.usersRepo.findOne({
      where: { id, deletedAt: IsNull() } as any,
      select: { avatarFileId: true, id: true } as any,
    } as any);
  }

  async getBasicForBlock(id: string) {
    return this.usersRepo.findOne({
      where: { id, deletedAt: IsNull() } as any,
      select: { id: true, email: true } as any,
    } as any);
  }
}
