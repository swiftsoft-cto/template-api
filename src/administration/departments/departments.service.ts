import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, QueryFailedError } from 'typeorm';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { randomUUID } from 'node:crypto';
import { Department } from './department.entity';
import { DepartmentRole } from './department-role.entity';
import { User } from '../users/user.entity';
import { Company } from '../company/company.entity';
import { Role } from '../roles/role.entity';
import {
  CreateDepartmentInput,
  UpdateDepartmentInput,
  DepartmentPaginationInput,
} from './departments.schema';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private departmentRepo: Repository<Department>,
    @InjectRepository(DepartmentRole)
    private departmentRoleRepo: Repository<DepartmentRole>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Company)
    private companyRepo: Repository<Company>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    private i18n: I18nService,
  ) {}

  private getLang() {
    return I18nContext.current()?.lang;
  }

  // 🔸 novo: pega companyId do usuário logado
  private async requesterCompanyId(requesterId: string) {
    const me = await this.userRepo.findOne({
      where: { id: requesterId, deletedAt: null },
      select: { companyId: true },
    });
    return me?.companyId ?? null;
  }

  async create(data: CreateDepartmentInput, requesterId: string) {
    const lang = this.getLang();
    const companyId = await this.requesterCompanyId(requesterId);
    if (!companyId) {
      throw new ConflictException(
        await this.i18n.translate('departments.user_not_in_company', { lang }),
      );
    }

    try {
      // valida/resolve responsável pela assinatura (mesma empresa)
      let signatureUserId: string | null = null;
      if (typeof (data as any).signatureUserId !== 'undefined') {
        const uid = (data as any).signatureUserId;
        if (uid !== null) {
          const u = await this.userRepo.findOne({
            where: { id: uid, deletedAt: null } as any,
            select: { id: true, companyId: true } as any,
          } as any);
          if (!u) {
            throw new NotFoundException(
              await this.i18n.translate('users.not_found', { lang }),
            );
          }
          if ((u as any).companyId !== companyId) {
            throw new ForbiddenException(
              await this.i18n.translate('departments.different_company', {
                lang,
              }),
            );
          }
          signatureUserId = uid;
        }
      }
      const department = this.departmentRepo.create({
        id: (global as any).crypto?.randomUUID?.() ?? randomUUID(),
        name: data.name,
        companyId, // 👈 inferido do requester
        description: data.description ?? null,
        signatureUserId,
      });
      const row = await this.departmentRepo.save(department);
      const message = await this.i18n.translate('departments.created', {
        lang,
      });
      return { message, data: row };
    } catch (error) {
      // Postgres duplicate key
      if (
        error instanceof QueryFailedError &&
        (error as any).driverError?.code === '23505'
      ) {
        throw new ConflictException(
          await this.i18n.translate('departments.name_already_exists', {
            lang,
          }),
        );
      }
      throw error;
    }
  }

  async list(q: DepartmentPaginationInput, requesterId: string) {
    const lang = this.getLang();
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = q;

    const requesterCompanyId = await this.requesterCompanyId(requesterId);

    const qb = this.departmentRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.company', 'c')
      .where('d.deletedAt IS NULL');

    if (requesterCompanyId) {
      qb.andWhere('d.companyId = :cid', { cid: requesterCompanyId });
    }
    if (search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('d.name ILIKE :s', { s: `%${search}%` });
        }),
      );
    }

    const orderMap: Record<string, string> = {
      createdAt: 'd.createdAt',
      name: 'd.name',
    };
    qb.orderBy(
      orderMap[sortBy] ?? 'd.createdAt',
      (sortOrder || 'desc').toUpperCase() as 'ASC' | 'DESC',
    )
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

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
      rows.length > 0
        ? await this.i18n.translate('departments.listed', { lang })
        : await this.i18n.translate('departments.empty', { lang });

    return { message, data: rows, pagination };
  }

  async findOne(id: string, requesterId: string) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);

    const qb = this.departmentRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.company', 'c')
      .leftJoinAndSelect('d.signatureUser', 'su')
      .leftJoinAndSelect('su.role', 'r')
      .where('d.id = :id', { id })
      .andWhere('d.deletedAt IS NULL');
    if (requesterCompanyId)
      qb.andWhere('d.companyId = :cid', { cid: requesterCompanyId });

    const row = await qb.getOne();
    if (!row) {
      throw new NotFoundException(
        await this.i18n.translate('departments.not_found', { lang }),
      );
    }

    // Mapeia apenas os campos básicos necessários para evitar dados sensíveis
    const data = {
      id: row.id,
      companyId: row.companyId,
      name: row.name,
      signatureUserId: row.signatureUserId,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
      company: row.company
        ? {
            id: row.company.id,
            name: row.company.name,
            tradeName: row.company.tradeName,
            cnpj: row.company.cnpj,
            email: row.company.email,
            phone: row.company.phone,
            website: row.company.website,
            signatureUserId: row.company.signatureUserId,
            createdAt: row.company.createdAt,
            updatedAt: row.company.updatedAt,
            deletedAt: row.company.deletedAt,
          }
        : null,
      signatureUser: row.signatureUser
        ? {
            id: row.signatureUser.id,
            name: row.signatureUser.name,
            email: row.signatureUser.email,
            avatarFileId: row.signatureUser.avatarFileId,
            role: row.signatureUser.role
              ? {
                  id: row.signatureUser.role.id,
                  name: row.signatureUser.role.name,
                  description: row.signatureUser.role.description,
                }
              : null,
          }
        : null,
    };

    const message = await this.i18n.translate('departments.found', { lang });
    return { message, data };
  }

  async update(id: string, data: UpdateDepartmentInput, requesterId: string) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);

    const exists = await this.departmentRepo.findOne({
      where: {
        id,
        deletedAt: null,
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      } as any,
    });
    if (!exists) {
      throw new NotFoundException(
        await this.i18n.translate('departments.not_found', { lang }),
      );
    }

    try {
      // tratar/validar signatureUserId em update
      let nextSignatureUserId: string | null | undefined = undefined;
      if (typeof (data as any).signatureUserId !== 'undefined') {
        const uid = (data as any).signatureUserId;
        if (uid === null) {
          nextSignatureUserId = null;
        } else {
          const u = await this.userRepo.findOne({
            where: { id: uid, deletedAt: null } as any,
            select: { id: true, companyId: true } as any,
          } as any);
          if (!u) {
            throw new NotFoundException(
              await this.i18n.translate('users.not_found', { lang }),
            );
          }
          if ((u as any).companyId !== (exists as any).companyId) {
            throw new ForbiddenException(
              await this.i18n.translate('departments.different_company', {
                lang,
              }),
            );
          }
          nextSignatureUserId = uid;
        }
      }
      await this.departmentRepo.update(
        { id },
        {
          name: data.name ?? exists.name,
          description:
            typeof data.description === 'undefined'
              ? exists.description
              : (data.description ?? null),
          signatureUserId:
            typeof nextSignatureUserId === 'undefined'
              ? (exists as any).signatureUserId
              : nextSignatureUserId,
        },
      );
      const row = await this.departmentRepo.findOne({ where: { id } });

      const message = await this.i18n.translate('departments.updated', {
        lang,
      });
      return { message, data: row };
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as any).driverError?.code === '23505'
      ) {
        throw new ConflictException(
          await this.i18n.translate('departments.name_already_exists', {
            lang,
          }),
        );
      }
      throw error;
    }
  }

  async remove(id: string, requesterId: string) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);

    const exists = await this.departmentRepo.findOne({
      where: {
        id,
        deletedAt: null,
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      } as any,
    });
    if (!exists) {
      throw new NotFoundException(
        await this.i18n.translate('departments.not_found', { lang }),
      );
    }

    await this.departmentRepo.update({ id }, { deletedAt: new Date() as any });

    const message = await this.i18n.translate('departments.deleted', { lang });
    return { message };
  }

  async addRole(deptId: string, roleId: string, requesterId: string) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);

    const dept = await this.departmentRepo.findOne({
      where: {
        id: deptId,
        deletedAt: null,
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      } as any,
      select: { id: true, companyId: true } as any,
    });
    const role = await this.roleRepo.findOne({
      where: { id: roleId, deletedAt: null } as any,
      select: { id: true, companyId: true } as any,
    });
    if (!dept || !role) {
      throw new NotFoundException(
        await this.i18n.translate('departments.not_found', { lang }),
      );
    }

    if (dept.companyId !== role.companyId) {
      throw new ConflictException(
        await this.i18n.translate('departments.different_company', { lang }),
      );
    }

    await this.departmentRoleRepo.upsert(
      { departmentId: deptId, roleId } as any,
      ['departmentId', 'roleId'],
    );

    const message = await this.i18n.translate('departments.role_linked', {
      lang,
    });
    return { message };
  }

  async removeRole(deptId: string, roleId: string, requesterId: string) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);

    const dept = await this.departmentRepo.findOne({
      where: {
        id: deptId,
        deletedAt: null,
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      } as any,
      select: { id: true } as any,
    });
    if (!dept) {
      throw new NotFoundException(
        await this.i18n.translate('departments.not_found', { lang }),
      );
    }

    await this.departmentRoleRepo.delete({
      departmentId: deptId,
      roleId,
    } as any);

    const message = await this.i18n.translate('departments.role_unlinked', {
      lang,
    });
    return { message };
  }

  async listRoles(deptId: string, requesterId: string) {
    const lang = this.getLang();
    const requesterCompanyId = await this.requesterCompanyId(requesterId);

    const dept = await this.departmentRepo.findOne({
      where: {
        id: deptId,
        deletedAt: null,
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      } as any,
      select: { id: true } as any,
    });
    if (!dept) {
      throw new NotFoundException(
        await this.i18n.translate('departments.not_found', { lang }),
      );
    }

    const roles = await this.roleRepo
      .createQueryBuilder('r')
      .innerJoin(
        DepartmentRole,
        'dr',
        'dr.role_id = r.id AND dr.department_id = :did',
        { did: deptId },
      )
      .where('r.deletedAt IS NULL')
      .orderBy('r.name', 'ASC')
      .getMany();

    const message = await this.i18n.translate('departments.roles_listed', {
      lang,
    });
    return { message, data: roles };
  }
}
