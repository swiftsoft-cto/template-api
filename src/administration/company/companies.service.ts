import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { UpdateCompanyInput } from './companies.schema';
import { Company } from './company.entity';
import { User } from '../users/user.entity';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private companyRepo: Repository<Company>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private i18n: I18nService,
  ) {}

  private get lang() {
    return I18nContext.current()?.lang;
  }

  private readonly SELECT = {
    id: true,
    name: true,
    tradeName: true,
    website: true,
    phone: true,
    cnpj: true,
    signatureUserId: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  /**
   * Resolve a empresa "da instância" para o usuário atual:
   *  - Se o usuário tiver companyId, usa ele
   *  - Caso contrário, pega a primeira empresa não deletada (instância single-tenant)
   */
  private async resolveCompanyIdFor(userId: string): Promise<string> {
    const me = await this.userRepo.findOne({
      where: { id: userId, deletedAt: null } as any,
      select: { companyId: true } as any,
    });

    if (me?.companyId) return me.companyId;

    // fallback: primeira empresa da instância (porque só existe uma)
    const first = await this.companyRepo.findOne({
      where: { deletedAt: null } as any,
      select: { id: true } as any,
      order: { createdAt: 'asc' },
    });

    if (!first) {
      throw new NotFoundException(
        await this.i18n.translate('companies.not_found', { lang: this.lang }),
      );
    }
    return first.id;
  }

  async getMyCompany(userId: string) {
    const companyId = await this.resolveCompanyIdFor(userId);
    const row = await this.companyRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.signatureUser', 'su')
      .leftJoinAndSelect('su.role', 'r')
      .leftJoinAndSelect('r.departments', 'dr')
      .leftJoinAndSelect('dr.department', 'd')
      .where('c.id = :id', { id: companyId })
      .andWhere('c.deletedAt IS NULL')
      .select([
        'c.id',
        'c.name',
        'c.tradeName',
        'c.cnpj',
        'c.email',
        'c.phone',
        'c.website',
        'c.signatureUserId',
        'c.createdAt',
        'c.updatedAt',
        'su.id',
        'su.name',
        'su.email',
        'su.avatarFileId',
        'r.id',
        'r.name',
        'r.description',
        'd.id',
        'd.name',
      ])
      .getOne();

    if (!row) {
      throw new NotFoundException(
        await this.i18n.translate('companies.not_found', { lang: this.lang }),
      );
    }
    const message = await this.i18n.translate('companies.found', {
      lang: this.lang,
    });
    return { message, data: row };
  }

  async updateMyCompany(userId: string, data: UpdateCompanyInput) {
    const companyId = await this.resolveCompanyIdFor(userId);

    const updateData: any = {};
    if (typeof data.name !== 'undefined') updateData.name = data.name;
    if (typeof data.tradeName !== 'undefined')
      updateData.tradeName = data.tradeName;
    if (typeof data.website !== 'undefined') updateData.website = data.website;
    if (typeof data.phone !== 'undefined') updateData.phone = data.phone;
    if (typeof data.cnpj !== 'undefined') updateData.cnpj = data.cnpj;
    // responsável pela assinatura (validar se é da mesma empresa)
    if (typeof (data as any).signatureUserId !== 'undefined') {
      const uid = (data as any).signatureUserId;
      if (uid === null) {
        updateData.signatureUserId = null;
      } else {
        const u = await this.userRepo.findOne({
          where: { id: uid, deletedAt: null } as any,
          select: { id: true, companyId: true } as any,
        } as any);
        if (!u) {
          throw new NotFoundException(
            await this.i18n.translate('users.not_found', { lang: this.lang }),
          );
        }
        if ((u as any).companyId !== companyId) {
          throw new ConflictException(
            'Usuário responsável não pertence à empresa',
          );
        }
        updateData.signatureUserId = uid;
      }
    }

    await this.companyRepo.update({ id: companyId }, updateData);
    const row = await this.companyRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.signatureUser', 'su')
      .leftJoinAndSelect('su.role', 'r')
      .leftJoinAndSelect('r.departments', 'dr')
      .leftJoinAndSelect('dr.department', 'd')
      .where('c.id = :id', { id: companyId })
      .select([
        'c.id',
        'c.name',
        'c.tradeName',
        'c.cnpj',
        'c.email',
        'c.phone',
        'c.website',
        'c.signatureUserId',
        'c.createdAt',
        'c.updatedAt',
        'su.id',
        'su.name',
        'su.email',
        'su.avatarFileId',
        'r.id',
        'r.name',
        'r.description',
        'd.id',
        'd.name',
      ])
      .getOne();

    const message = await this.i18n.translate('companies.updated', {
      lang: this.lang,
    });
    return { message, data: row };
  }
}
