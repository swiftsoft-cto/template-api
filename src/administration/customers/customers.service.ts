import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  QueryFailedError,
  Brackets,
  In,
  IsNull,
  EntityManager,
} from 'typeorm';
import { I18nService, I18nContext } from 'nestjs-i18n';
import * as CustomerEntities from './entities';
import {
  CompanyPersonRefDto,
  CreateCompanyNestedDto,
  CreateCustomerDto,
  CreatePersonNestedDto,
} from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CreateAddressDto } from './dto/address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { LinkPersonDto } from './dto/link-person.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(CustomerEntities.Customer)
    private readonly customerRepo: Repository<CustomerEntities.Customer>,
    @InjectRepository(CustomerEntities.CustomerPerson)
    private readonly customerPersonRepo: Repository<CustomerEntities.CustomerPerson>,
    @InjectRepository(CustomerEntities.CustomerCompany)
    private readonly customerCompanyRepo: Repository<CustomerEntities.CustomerCompany>,
    @InjectRepository(CustomerEntities.Address)
    private readonly addressRepo: Repository<CustomerEntities.Address>,
    @InjectRepository(CustomerEntities.CustomerBranch)
    private readonly customerBranchRepo: Repository<CustomerEntities.CustomerBranch>,
    @InjectRepository(CustomerEntities.CompanyPersonLink)
    private readonly companyPersonLinkRepo: Repository<CustomerEntities.CompanyPersonLink>,
    private readonly dataSource: DataSource,
    private readonly httpService: HttpService,
    private readonly i18n: I18nService,
  ) {}

  // -------------- Utils --------------
  private onlyDigits(v: string) {
    return (v ?? '').replace(/\D+/g, '');
  }
  private ensureCpf(v?: string) {
    // Antes: retornava undefined e deixava passar até o Prisma
    // Agora: falha cedo com 400, mensagem clara
    if (v === undefined || v === null || String(v).trim() === '') {
      throw new BadRequestException('CPF is required');
    }
    const d = this.onlyDigits(v);
    if (d.length !== 11)
      throw new BadRequestException('Invalid CPF (11 dígitos)');
    return d;
  }
  private ensureCnpj(v?: string) {
    if (!v) return undefined;
    const d = this.onlyDigits(v);
    if (d.length !== 14)
      throw new BadRequestException('Invalid CNPJ (14 dígitos)');
    return d;
  }
  // Aceita 'DD/MM/YYYY' ou 'YYYY-MM-DD'
  private parseDateFlexible(s?: string) {
    if (!s) return null;
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) {
      const [, dd, mm, yyyy] = br;
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      // manter como meia-noite local
      const [, yyyy, mm, dd] = iso;
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    }
    throw new BadRequestException(
      'Invalid date format (use DD/MM/YYYY or YYYY-MM-DD)',
    );
  }

  // Traduz erros de constraint única (Postgres 23505) em 409 + { field }
  private async rethrowUniqueConflict(
    err: unknown,
    fallbackFieldPath: string,
    fieldValue?: string,
  ): Promise<never> {
    const isDup =
      err instanceof QueryFailedError &&
      (err as any).driverError?.code === '23505';
    if (
      isDup ||
      (err instanceof Error && err.message.includes('duplicate key'))
    ) {
      let field = fallbackFieldPath;
      if (/cpf/i.test(err.message)) field = 'person.cpf';
      if (/cnpj/i.test(err.message)) field = 'company.cnpj';

      const lang = I18nContext.current()?.lang;
      const message = await this.i18n.translate('common.field_already_exists', {
        lang,
        args: { field: fieldValue || field },
      });

      throw new ConflictException({ message, field });
    }
    throw err;
  }

  private async getOwnerByCustomerId(
    manager: EntityManager,
    customerId: string,
  ) {
    const c = await manager.findOne(CustomerEntities.Customer, {
      where: { id: customerId },
    });
    if (!c) throw new NotFoundException('Customer not found');
    if (c.kind === CustomerEntities.CustomerKind.PERSON) {
      const person = await manager.findOne(CustomerEntities.CustomerPerson, {
        where: { customerId },
      });
      if (!person)
        throw new NotFoundException(
          'Person payload not found for this customer',
        );
      return { kind: 'PERSON' as const, person, company: null };
    } else {
      const company = await manager.findOne(CustomerEntities.CustomerCompany, {
        where: { customerId },
      });
      if (!company)
        throw new NotFoundException(
          'Company payload not found for this customer',
        );
      return { kind: 'COMPANY' as const, person: null, company };
    }
  }

  // -------------- Create customer (nested) --------------
  async createCustomer(dto: CreateCustomerDto, createdById?: string) {
    if (dto.kind === CustomerEntities.CustomerKind.PERSON && !dto.person) {
      throw new BadRequestException(
        'person payload is required for kind=PERSON',
      );
    }
    if (dto.kind === CustomerEntities.CustomerKind.COMPANY && !dto.company) {
      throw new BadRequestException(
        'company payload is required for kind=COMPANY',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      // Evita displayName vazio: usa fullName/legalName como fallback
      const displayName =
        (dto.displayName ?? '').trim() ||
        (dto.kind === 'PERSON'
          ? (dto.person!.fullName ?? '').trim()
          : (dto.company!.legalName ?? '').trim());

      const customer = manager.create(CustomerEntities.Customer, {
        kind: dto.kind,
        displayName,
        createdById: createdById ?? null,
      });
      await manager.save(customer);

      if (dto.kind === CustomerEntities.CustomerKind.PERSON) {
        await this.createPersonUnder(manager, customer.id, dto.person!);
      } else {
        await this.createCompanyUnder(manager, customer.id, dto.company!);
      }

      return this.includeCustomerTree(manager, customer.id);
    });
  }

  // --------- Customer-level branches helpers ---------
  private async assertNoCycleCustomer(
    manager: EntityManager,
    parentId: string,
    childId: string,
  ) {
    if (parentId === childId)
      throw new BadRequestException('Customer cannot be its own branch');
    // sobe cadeia de pais a partir do parent até a raiz verificando child
    let cursor: string | null = parentId;
    while (cursor) {
      if (cursor === childId) {
        // child é ancestral de parent -> criaria ciclo
        throw new BadRequestException(
          'Hierarchy cycle detected (customer branches)',
        );
      }
      const up = await manager.findOne(CustomerEntities.CustomerBranch, {
        where: { childId: cursor },
        select: { parentId: true } as any,
      });
      cursor = up?.parentId ?? null;
    }
  }

  // -------------- Read/Update/Delete --------------
  async getCustomer(id: string, opts?: { tree?: boolean }) {
    const exists = await this.customerRepo.findOne({ where: { id } });
    if (!exists) throw new NotFoundException('Customer not found');
    if (!opts?.tree) return exists;
    return this.includeCustomerTree(this.dataSource.manager, id);
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto) {
    return this.dataSource.transaction(async (manager) => {
      const exists = await manager.findOne(CustomerEntities.Customer, {
        where: { id },
      });
      if (!exists) throw new NotFoundException('Customer not found');

      // Determina displayName: prioriza dto.displayName, depois dto.fullName (se pessoa), depois o existente
      let displayName = exists.displayName;
      if (dto.displayName !== undefined) {
        displayName = dto.displayName;
      } else if (
        dto.fullName !== undefined &&
        exists.kind === CustomerEntities.CustomerKind.PERSON
      ) {
        displayName = dto.fullName;
      }

      // Atualiza campos básicos do customer
      const customerData: Partial<CustomerEntities.Customer> = {
        displayName,
        isActive:
          typeof dto.isActive === 'undefined' ? exists.isActive : dto.isActive,
      };

      await manager.update(CustomerEntities.Customer, { id }, customerData);

      // Se for pessoa e houver campos de pessoa no DTO, atualiza CustomerPerson
      if (
        exists.kind === CustomerEntities.CustomerKind.PERSON &&
        (dto.fullName !== undefined ||
          dto.cpf !== undefined ||
          dto.rg !== undefined ||
          dto.birthDate !== undefined ||
          dto.email !== undefined ||
          dto.phone !== undefined)
      ) {
        const owner = await this.getOwnerByCustomerId(manager, id);
        if (!owner.person)
          throw new NotFoundException(
            'Person payload not found for this customer',
          );

        const personData: Partial<CustomerEntities.CustomerPerson> = {};

        if (dto.fullName !== undefined) {
          personData.fullName = dto.fullName;
        }

        if (dto.cpf !== undefined) {
          personData.cpf = this.ensureCpf(dto.cpf)!;
        }

        if (dto.rg !== undefined) {
          personData.rg = dto.rg ?? null;
        }

        if (dto.birthDate !== undefined) {
          personData.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
        }

        if (dto.email !== undefined) {
          personData.email =
            dto.email && dto.email.trim() !== '' ? dto.email : null;
        }

        if (dto.phone !== undefined) {
          personData.phone = dto.phone ?? null;
        }

        try {
          await manager.update(
            CustomerEntities.CustomerPerson,
            { id: owner.person.id },
            personData,
          );
        } catch (err) {
          const cpfValue = dto.cpf ? this.ensureCpf(dto.cpf) : undefined;
          await this.rethrowUniqueConflict(err, 'person.cpf', cpfValue);
        }
      }

      // Retorna o agregado completo
      return this.includeCustomerTree(manager, id);
    });
  }

  /**
   * Ativa automaticamente o cliente (Customer.isActive=true) e, quando o cliente for do tipo
   * EMPRESA, também ativa os clientes do tipo PESSOA vinculados via CompanyPersonLink.
   *
   * Regras:
   * - Sempre ativa o próprio customerId recebido
   * - Se for COMPANY: ativa todas as pessoas vinculadas (links não deletados e não encerrados)
   * - Idempotente: pode ser chamado várias vezes sem efeitos colaterais
   */
  async activateCustomerCascade(
    customerId: string,
    opts?: { manager?: EntityManager },
  ): Promise<{ activatedCustomerIds: string[] }> {
    const manager = opts?.manager ?? this.dataSource.manager;
    const customerRepo = manager.getRepository(CustomerEntities.Customer);
    const companyRepo = manager.getRepository(CustomerEntities.CustomerCompany);
    const personRepo = manager.getRepository(CustomerEntities.CustomerPerson);
    const linkRepo = manager.getRepository(CustomerEntities.CompanyPersonLink);

    const customer = await customerRepo.findOne({
      where: { id: customerId } as any,
      select: { id: true, kind: true } as any,
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const idsToActivate = new Set<string>([customerId]);

    if (customer.kind === CustomerEntities.CustomerKind.COMPANY) {
      const company = await companyRepo.findOne({
        where: { customerId } as any,
        select: { id: true } as any,
      });

      // Se por algum motivo não houver payload de empresa, ativa só o customer raiz
      if (company?.id) {
        const now = new Date();
        const links = await linkRepo
          .createQueryBuilder('l')
          .select(['l.personId'])
          .where('l.companyId = :companyId', { companyId: company.id })
          .andWhere('l.deletedAt IS NULL')
          .andWhere(
            new Brackets((qb) => {
              qb.where('l.endedOn IS NULL').orWhere('l.endedOn > :now', {
                now,
              });
            }),
          )
          .getMany();

        const personIds = links.map((l) => l.personId).filter(Boolean);
        if (personIds.length > 0) {
          const persons = await personRepo.find({
            where: { id: In(personIds) } as any,
            select: { customerId: true } as any,
          });
          for (const p of persons) {
            if (p.customerId) idsToActivate.add(p.customerId);
          }
        }
      }
    }

    await customerRepo.update(
      { id: In(Array.from(idsToActivate)) } as any,
      { isActive: true } as any,
    );

    return { activatedCustomerIds: Array.from(idsToActivate) };
  }

  // -------------- Update empresa (PATCH /customers/:customerId/company) --------------
  async updateCompanyForCustomer(customerId: string, dto: UpdateCompanyDto) {
    return this.dataSource.transaction(async (manager) => {
      const owner = await this.getOwnerByCustomerId(manager, customerId);
      if (owner.kind !== 'COMPANY')
        throw new BadRequestException('Customer is not a company');

      const data: Partial<CustomerEntities.CustomerCompany> = {
        legalName: dto.legalName ?? owner.company!.legalName,
        tradeName:
          typeof dto.tradeName === 'undefined'
            ? owner.company!.tradeName
            : (dto.tradeName ?? null),
        cnpj: dto.cnpj ? this.ensureCnpj(dto.cnpj)! : owner.company!.cnpj,
        stateRegistration:
          typeof dto.stateRegistration === 'undefined'
            ? owner.company!.stateRegistration
            : (dto.stateRegistration ?? null),
        municipalRegistration:
          typeof dto.municipalRegistration === 'undefined'
            ? owner.company!.municipalRegistration
            : (dto.municipalRegistration ?? null),
        email:
          typeof dto.email === 'undefined'
            ? owner.company!.email
            : (dto.email ?? null),
        phone:
          typeof dto.phone === 'undefined'
            ? owner.company!.phone
            : (dto.phone ?? null),
        status:
          typeof dto.status === 'undefined'
            ? owner.company!.status
            : (dto.status ?? null),
        openingDate:
          typeof dto.openingDate === 'undefined'
            ? owner.company!.openingDate
            : this.parseDateFlexible(dto.openingDate),
        legalNature:
          typeof dto.legalNature === 'undefined'
            ? owner.company!.legalNature
            : (dto.legalNature ?? null),
        size:
          typeof dto.size === 'undefined'
            ? owner.company!.size
            : (dto.size ?? null),
        mainActivity:
          typeof dto.mainActivity === 'undefined'
            ? owner.company!.mainActivity
            : (dto.mainActivity ?? null),
        secondaryActivities:
          typeof dto.secondaryActivities === 'undefined'
            ? owner.company!.secondaryActivities
            : (dto.secondaryActivities ?? null),
      };

      try {
        await manager.update(
          CustomerEntities.CustomerCompany,
          { id: owner.company!.id },
          data,
        );
      } catch (err) {
        const cnpjValue = dto.cnpj ? this.ensureCnpj(dto.cnpj) : undefined;
        await this.rethrowUniqueConflict(err, 'company.cnpj', cnpjValue);
      }

      // Retorna o agregado completo para o frontend já refletir as mudanças
      return this.includeCustomerTree(manager, customerId);
    });
  }

  async deleteCustomer(id: string) {
    const exists = await this.customerRepo.findOne({ where: { id } });
    if (!exists) throw new NotFoundException('Customer not found');
    await this.customerRepo.softDelete({ id });
    return { message: 'Customer deleted' };
  }

  async listAllCustomers(params: {
    q?: string;
    search?: string;
    page?: number;
    limit?: number;
    orderBy?: 'createdAt' | 'updatedAt' | 'displayName';
    order?: 'asc' | 'desc';
    includeHierarchy?: boolean;
  }) {
    const {
      q,
      search,
      page = 1,
      limit = 20,
      orderBy = 'createdAt',
      order = 'desc',
      includeHierarchy = false,
    } = params;

    // Garantir que page e limit sejam números
    const pageNum = typeof page === 'string' ? parseInt(page, 10) : page;
    const limitNum = typeof limit === 'string' ? parseInt(limit, 10) : limit;

    const skip = (pageNum - 1) * limitNum;
    const searchTerm = (q ?? search ?? '').trim();
    const digitsOnly = this.onlyDigits(searchTerm);

    const qb = this.customerRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.person', 'p')
      .leftJoinAndSelect('c.company', 'cc')
      .where('1=1');

    if (searchTerm) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('c.displayName ILIKE :s', { s: `%${searchTerm}%` })
            .orWhere('p.fullName ILIKE :s', { s: `%${searchTerm}%` })
            .orWhere('cc.legalName ILIKE :s', { s: `%${searchTerm}%` })
            .orWhere('cc.tradeName ILIKE :s', { s: `%${searchTerm}%` });
        }),
      );
      if (digitsOnly.length === 11) {
        qb.orWhere('p.cpf = :cpf', { cpf: digitsOnly });
      } else if (digitsOnly.length === 14) {
        qb.orWhere('cc.cnpj = :cnpj', { cnpj: digitsOnly });
      } else if (digitsOnly.length > 0) {
        qb.orWhere('p.cpf LIKE :cpfPart', {
          cpfPart: `%${digitsOnly}%`,
        }).orWhere('cc.cnpj LIKE :cnpjPart', { cnpjPart: `%${digitsOnly}%` });
      }
    }

    // clone para contagem ANTES de aplicar groupBy/selects extras
    const countQb = qb.clone();

    if (includeHierarchy) {
      // joins para descobrir matriz/filial
      qb
        // brp: onde ESTE customer é pai (tem filiais)
        .leftJoin('customer_branch', 'brp', 'brp.parent_id = c.id')
        // brc: onde ESTE customer é filho (tem uma matriz)
        .leftJoin('customer_branch', 'brc', 'brc.child_id = c.id')
        .leftJoin('customer', 'parent', 'parent.id = brc.parent_id')
        .addSelect('COUNT(DISTINCT brp.id)', 'children_count')
        .addSelect('COUNT(DISTINCT brc.id)', 'parent_links_count')
        .addSelect('parent.id', 'parent_id')
        .addSelect('parent.display_name', 'parent_display_name')
        // group by necessário por causa dos COUNT/joins
        .groupBy('c.id, p.id, cc.id, parent.id, parent.display_name');
    }

    qb.orderBy(
      `c.${orderBy}`,
      (order || 'desc').toUpperCase() as 'ASC' | 'DESC',
    )
      .skip(skip)
      .take(limitNum);

    let customers: CustomerEntities.Customer[] = [];
    let total = 0;

    if (includeHierarchy) {
      const { entities, raw } = await qb.getRawAndEntities();
      // contagem (sem groupBy/joins) para paginação correta
      total = await countQb.getCount();
      // mesclar flags nos entities
      customers = entities.map((e, i) => {
        const r = raw[i] || {};
        if (e.kind === CustomerEntities.CustomerKind.COMPANY) {
          const childrenCount = Number(r.children_count ?? 0);
          const parentLinks = Number(r.parent_links_count ?? 0);
          const isFilial = parentLinks > 0;
          const isMatriz = !isFilial && childrenCount > 0;
          const parent =
            isFilial && r.parent_id
              ? {
                  id: r.parent_id as string,
                  displayName: r.parent_display_name as string,
                }
              : null;
          // anexar campos computados no próprio objeto (sem quebrar shape atual)
          return Object.assign(e, {
            isMatriz,
            isFilial,
            parent,
            childrenCount,
          }) as any;
        }
        // PERSON: flags falsas
        return Object.assign(e, {
          isMatriz: false,
          isFilial: false,
          parent: null,
          childrenCount: 0,
        }) as any;
      });
    } else {
      const res = await qb.getManyAndCount();
      customers = res[0];
      total = res[1];
    }

    return {
      data: customers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasNext: pageNum * limitNum < total,
        hasPrev: pageNum > 1,
      },
    };
  }

  async listByKind(kind: 'PERSON' | 'COMPANY', q?: string) {
    const searchTerm = (q ?? '').trim();
    const digitsOnly = this.onlyDigits(searchTerm);
    if (kind === 'PERSON') return this.searchPeople(searchTerm, digitsOnly);
    return this.searchCompanies(searchTerm, digitsOnly);
  }

  private async searchPeople(searchTerm: string, digitsOnly: string) {
    const qb = this.customerRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.person', 'p')
      .where('c.kind = :k', { k: 'PERSON' });

    if (searchTerm) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('c.displayName ILIKE :s', { s: `%${searchTerm}%` }).orWhere(
            'p.fullName ILIKE :s',
            { s: `%${searchTerm}%` },
          );
        }),
      );
    }
    if (digitsOnly.length === 11) {
      qb.orWhere('p.cpf = :cpf', { cpf: digitsOnly });
    } else if (digitsOnly.length > 0 && digitsOnly.length < 11) {
      qb.orWhere('p.cpf LIKE :cpfPart', { cpfPart: `%${digitsOnly}%` });
    }

    qb.orderBy('c.createdAt', 'DESC').take(100);
    return qb.getMany();
  }

  private async searchCompanies(searchTerm: string, digitsOnly: string) {
    const qb = this.customerRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.company', 'cc')
      // vínculos de filialidade:
      // brp: registros onde ESTA empresa é PAI (tem filiais)
      .leftJoin('customer_branch', 'brp', 'brp.parent_id = c.id')
      // brc: registros onde ESTA empresa é FILHA (tem uma matriz)
      .leftJoin('customer_branch', 'brc', 'brc.child_id = c.id')
      // pegar dados da matriz (se existir) para exibir no item da filial
      .leftJoin('customer', 'parent', 'parent.id = brc.parent_id')
      // contagens e dados extras
      .addSelect('COUNT(DISTINCT brp.id)', 'children_count')
      .addSelect('COUNT(DISTINCT brc.id)', 'parent_links_count')
      .addSelect('parent.id', 'parent_id')
      .addSelect('parent.display_name', 'parent_display_name')
      .where('c.kind = :k', { k: 'COMPANY' });

    if (searchTerm) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('c.displayName ILIKE :s', { s: `%${searchTerm}%` })
            .orWhere('cc.legalName ILIKE :s', { s: `%${searchTerm}%` })
            .orWhere('cc.tradeName ILIKE :s', { s: `%${searchTerm}%` });
        }),
      );
    }
    if (digitsOnly.length === 14) {
      qb.orWhere('cc.cnpj = :cnpj', { cnpj: digitsOnly });
    } else if (digitsOnly.length > 0 && digitsOnly.length < 14) {
      qb.orWhere('cc.cnpj LIKE :cnpjPart', { cnpjPart: `%${digitsOnly}%` });
    }

    // group by necessário por causa dos COUNT/joins adicionais
    qb.groupBy('c.id, cc.id, parent.id, parent.display_name')
      .orderBy('c.createdAt', 'DESC')
      .take(100);

    const { entities, raw } = await qb.getRawAndEntities();
    // combinar entidades com os campos computados
    return entities.map((e, i) => {
      const r = raw[i] || {};
      const childrenCount = Number(r.children_count ?? 0);
      const parentLinks = Number(r.parent_links_count ?? 0);
      const isFilial = parentLinks > 0;
      const isMatriz = !isFilial && childrenCount > 0;
      const parent =
        isFilial && r.parent_id
          ? {
              id: r.parent_id as string,
              displayName: r.parent_display_name as string,
            }
          : null;
      return {
        ...e,
        // 🔎 novas flags no item:
        isMatriz,
        isFilial,
        parent, // se for filial, indica quem é a matriz
        childrenCount, // nº de filiais (se for matriz)
      } as any;
    });
  }

  // (helper de Prisma removido)

  // -------------- Addresses (nested in /customers/:id/addresses) --------------
  async listAddresses(customerId: string) {
    const owner = await this.getOwnerByCustomerId(
      this.dataSource.manager,
      customerId,
    );
    if (owner.kind === 'PERSON') {
      return this.addressRepo.find({
        where: { personId: owner.person!.id } as any,
      });
    }
    return this.addressRepo.find({
      where: { companyId: owner.company!.id } as any,
    });
  }

  async addAddressForCustomer(customerId: string, dto: CreateAddressDto) {
    if (!dto || !dto.addressType)
      throw new BadRequestException('addressType is required');

    return this.dataSource.transaction(async (manager) => {
      const owner = await this.getOwnerByCustomerId(manager, customerId);

      const created = await manager.save(
        manager.create(CustomerEntities.Address, {
          addressType: dto.addressType as any,
          label: dto.label ?? null,
          isPrimary: dto.isPrimary ?? false,
          street: dto.street,
          number: dto.number ?? null,
          complement: dto.complement ?? null,
          district: dto.district ?? null,
          city: dto.city,
          state: dto.state,
          postalCode: dto.postalCode,
          country: dto.country ?? 'Brasil',
          reference: dto.reference ?? null,
          personId: owner.kind === 'PERSON' ? owner.person!.id : null,
          companyId: owner.kind === 'COMPANY' ? owner.company!.id : null,
        }),
      );

      // garantir único primário por dono
      if (created.isPrimary) {
        if (owner.kind === 'PERSON') {
          await manager
            .createQueryBuilder()
            .update(CustomerEntities.Address)
            .set({ isPrimary: false })
            .where('person_id = :pid AND id <> :id', {
              pid: owner.person!.id,
              id: created.id,
            })
            .execute();
        } else {
          await manager
            .createQueryBuilder()
            .update(CustomerEntities.Address)
            .set({ isPrimary: false })
            .where('company_id = :cid AND id <> :id', {
              cid: owner.company!.id,
              id: created.id,
            })
            .execute();
        }
      }
      return created;
    });
  }

  async updateAddressForCustomer(
    customerId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const owner = await this.getOwnerByCustomerId(manager, customerId);

      const addr = await manager.findOne(CustomerEntities.Address, {
        where: { id: addressId },
      });
      if (!addr) throw new NotFoundException('Address not found');
      const belongs =
        (owner.kind === 'PERSON' && addr.personId === owner.person!.id) ||
        (owner.kind === 'COMPANY' && addr.companyId === owner.company!.id);
      if (!belongs)
        throw new ForbiddenException(
          'Address does not belong to this customer',
        );

      await manager.update(
        CustomerEntities.Address,
        { id: addressId },
        {
          addressType: (dto.addressType as any) ?? addr.addressType,
          label:
            typeof dto.label === 'undefined' ? addr.label : (dto.label ?? null),
          isPrimary:
            typeof dto.isPrimary === 'undefined'
              ? addr.isPrimary
              : !!dto.isPrimary,
          street: dto.street ?? addr.street,
          number:
            typeof dto.number === 'undefined'
              ? addr.number
              : (dto.number ?? null),
          complement:
            typeof dto.complement === 'undefined'
              ? addr.complement
              : (dto.complement ?? null),
          district:
            typeof dto.district === 'undefined'
              ? addr.district
              : (dto.district ?? null),
          city: dto.city ?? addr.city,
          state: dto.state ?? addr.state,
          postalCode: dto.postalCode ?? addr.postalCode,
          country: dto.country ?? addr.country,
          reference:
            typeof dto.reference === 'undefined'
              ? addr.reference
              : (dto.reference ?? null),
        },
      );
      const updated = await manager.findOne(CustomerEntities.Address, {
        where: { id: addressId },
      });

      if (dto.isPrimary) {
        if (owner.kind === 'PERSON') {
          await manager
            .createQueryBuilder()
            .update(CustomerEntities.Address)
            .set({ isPrimary: false })
            .where('person_id = :pid AND id <> :id', {
              pid: owner.person!.id,
              id: updated!.id,
            })
            .execute();
        } else {
          await manager
            .createQueryBuilder()
            .update(CustomerEntities.Address)
            .set({ isPrimary: false })
            .where('company_id = :cid AND id <> :id', {
              cid: owner.company!.id,
              id: updated!.id,
            })
            .execute();
        }
      }

      return updated;
    });
  }

  async deleteAddressForCustomer(customerId: string, addressId: string) {
    return this.dataSource.transaction(async (manager) => {
      const owner = await this.getOwnerByCustomerId(manager, customerId);
      const addr = await manager.findOne(CustomerEntities.Address, {
        where: { id: addressId },
      });
      if (!addr) throw new NotFoundException('Address not found');
      const belongs =
        (owner.kind === 'PERSON' && addr.personId === owner.person!.id) ||
        (owner.kind === 'COMPANY' && addr.companyId === owner.company!.id);
      if (!belongs)
        throw new ForbiddenException(
          'Address does not belong to this customer',
        );
      await manager.delete(CustomerEntities.Address, { id: addressId });
      return { message: 'Address deleted' };
    });
  }

  // -------------- Company ↔ People (nested in /customers/:companyCustomerId/people) --------------
  async listCompanyPeople(companyCustomerId: string) {
    const owner = await this.getOwnerByCustomerId(
      this.dataSource.manager,
      companyCustomerId,
    );
    if (owner.kind !== 'COMPANY')
      throw new BadRequestException('Customer is not a company');
    return this.companyPersonLinkRepo.find({
      where: { companyId: owner.company!.id, deletedAt: IsNull() } as any,
      relations: ['person', 'person.customer'],
      order: { isPrimary: 'DESC', createdAt: 'DESC' } as any,
    });
  }

  async linkPersonToCompanyByCustomerId(
    companyCustomerId: string,
    dto: LinkPersonDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const owner = await this.getOwnerByCustomerId(manager, companyCustomerId);
      if (owner.kind !== 'COMPANY')
        throw new BadRequestException('Customer is not a company');

      // localizar ou criar a pessoa
      let person = null;
      if (dto.personId) {
        person = await manager.findOne(CustomerEntities.CustomerPerson, {
          where: { id: dto.personId },
        });
        if (!person) throw new NotFoundException('Person not found');
      } else if (dto.cpf) {
        const cpf = this.ensureCpf(dto.cpf);
        person = await manager.findOne(CustomerEntities.CustomerPerson, {
          where: { cpf },
        });
        if (!person) throw new NotFoundException('Person (by CPF) not found');
      } else if (dto.createPerson) {
        // cria novo customer PERSON + payload
        const newCustomer = await manager.save(
          manager.create(CustomerEntities.Customer, {
            kind: CustomerEntities.CustomerKind.PERSON,
            displayName: dto.createPerson.fullName,
          }),
        );
        person = await this.createPersonUnder(
          manager,
          newCustomer.id,
          dto.createPerson,
        );
      } else {
        throw new BadRequestException('Provide personId, cpf or createPerson');
      }

      // cria/atualiza o vínculo (emula upsert por (companyId, personId))
      let link = await manager.findOne(CustomerEntities.CompanyPersonLink, {
        where: { companyId: owner.company!.id, personId: person.id } as any,
      });
      if (!link) {
        link = await manager.save(
          manager.create(CustomerEntities.CompanyPersonLink, {
            companyId: owner.company!.id,
            personId: person.id,
            role: dto.role ?? null,
            isPrimary: dto.isPrimary ?? false,
            isLegalRepresentative: dto.isLegalRepresentative ?? false,
          }),
        );
      } else {
        await manager.update(
          CustomerEntities.CompanyPersonLink,
          { id: link.id },
          {
            role:
              typeof dto.role === 'undefined' ? link.role : (dto.role ?? null),
            isPrimary:
              typeof dto.isPrimary === 'undefined'
                ? link.isPrimary
                : !!dto.isPrimary,
            isLegalRepresentative:
              typeof dto.isLegalRepresentative === 'undefined'
                ? link.isLegalRepresentative
                : !!dto.isLegalRepresentative,
          },
        );
        link = await manager.findOne(CustomerEntities.CompanyPersonLink, {
          where: { id: link.id },
        });
      }

      // garantir único primary
      if (dto.isPrimary) {
        await manager
          .createQueryBuilder()
          .update(CustomerEntities.CompanyPersonLink)
          .set({ isPrimary: false })
          .where('company_id = :cid AND person_id <> :pid', {
            cid: owner.company!.id,
            pid: person.id,
          })
          .execute();
      }

      return link;
    });
  }

  async unlinkPersonFromCompany(companyCustomerId: string, personId: string) {
    return this.dataSource.transaction(async (manager) => {
      const owner = await this.getOwnerByCustomerId(manager, companyCustomerId);
      if (owner.kind !== 'COMPANY')
        throw new BadRequestException('Customer is not a company');
      await manager.delete(CustomerEntities.CompanyPersonLink, {
        companyId: owner.company!.id,
        personId,
      } as any);
      return { message: 'Person unlinked from company' };
    });
  }

  // -------------- Branches (customer-level) --------------
  async listBranches(customerId: string) {
    await this.getOwnerByCustomerId(this.dataSource.manager, customerId);
    const branches = await this.customerBranchRepo.find({
      where: { parentId: customerId } as any,
      relations: [
        'child',
        'child.company',
        'child.company.links',
        'child.company.links.person',
        'child.company.links.person.customer',
      ],
      order: { since: 'DESC' } as any,
    });
    // manter só o contato primário (se houver)
    for (const b of branches) {
      if (b.child?.company?.links?.length) {
        b.child.company.links = b.child.company.links
          .filter((l: any) => !l.deletedAt)
          .filter((l) => l.isPrimary)
          .slice(0, 1);
      }
    }
    return branches;
  }

  async createBranchByCustomerId(
    parentCustomerId: string,
    dto: CreateBranchDto | any, // aceita payload "cru" também
  ) {
    return this.dataSource.transaction(async (manager) => {
      // valida cliente pai
      await this.getOwnerByCustomerId(manager, parentCustomerId);

      // Log opcional para debug (pode remover depois)
      // console.debug('[createBranchByCustomerId] dto IN:', JSON.stringify(dto));

      // 👇 Adaptação: se o body veio no formato de criação de Customer (sem createCustomer),
      // convertemos on-the-fly para o shape esperado pela rota de filiais.
      // Preserva note/since/until se tiverem vindo juntos.
      if (!dto?.existingCustomerId && !dto?.createCustomer) {
        const raw = dto || {};
        const looksLikeCustomer =
          (raw?.kind === 'PERSON' || raw?.kind === 'COMPANY') &&
          (raw?.person || raw?.company);
        if (looksLikeCustomer) {
          const { note, since, until, ...customerPayload } = raw;
          dto = {
            createCustomer: customerPayload, // { kind, displayName, person|company, ... }
            note,
            since,
            until,
          } as CreateBranchDto;
        }
      }

      let childId: string | null = null;
      if (dto.existingCustomerId) {
        const c = await this.customerRepo.findOne({
          where: { id: dto.existingCustomerId },
        });
        if (!c) throw new NotFoundException('Branch customer not found');
        childId = c.id;
      } else if (dto.createCustomer) {
        const cDto = dto.createCustomer;
        const displayName =
          (cDto.displayName ?? '').trim() ||
          (cDto.kind === 'PERSON'
            ? (cDto.person!.fullName ?? '').trim()
            : (cDto.company!.legalName ?? '').trim());
        const created = await manager.save(
          manager.create(CustomerEntities.Customer, {
            kind: cDto.kind,
            displayName,
          }),
        );
        if (cDto.kind === 'PERSON') {
          await this.createPersonUnder(manager, created.id, cDto.person!);
        } else {
          await this.createCompanyUnder(manager, created.id, cDto.company!);
        }
        childId = created.id;
      } else {
        throw new BadRequestException(
          'Provide existingCustomerId or createCustomer',
        );
      }

      await this.assertNoCycleCustomer(manager, parentCustomerId, childId);

      const createdLink = await manager.save(
        manager.create(CustomerEntities.CustomerBranch, {
          parentId: parentCustomerId,
          childId,
          note: dto.note ?? null,
          since: dto.since ? new Date(dto.since) : null,
          until: dto.until ? new Date(dto.until) : null,
        }),
      );
      return createdLink;
    });
  }

  async removeBranch(parentCustomerId: string, childCustomerId: string) {
    return this.dataSource.transaction(async (manager) => {
      // valida cliente pai
      await this.getOwnerByCustomerId(manager, parentCustomerId);

      // verifica se a filial existe
      const branch = await this.customerBranchRepo.findOne({
        where: { parentId: parentCustomerId, childId: childCustomerId } as any,
      });

      if (!branch) {
        throw new NotFoundException('Branch relationship not found');
      }

      // remove o vínculo
      await manager.delete(CustomerEntities.CustomerBranch, { id: branch.id });

      return { message: 'Branch relationship removed successfully' };
    });
  }

  // -------------- Helpers de criação nested --------------
  private async createPersonUnder(
    manager: EntityManager,
    customerId: string,
    p: CreatePersonNestedDto,
  ) {
    const cpf = this.ensureCpf(p.cpf)!;
    let person;
    try {
      person = await manager.save(
        manager.create(CustomerEntities.CustomerPerson, {
          customerId,
          fullName: p.fullName,
          cpf,
          rg: p.rg ?? null,
          birthDate: p.birthDate ? new Date(p.birthDate) : null,
          email: p.email ?? null,
          phone: p.phone ?? null,
        }),
      );
    } catch (err) {
      await this.rethrowUniqueConflict(err, 'person.cpf', cpf);
    }

    // endereços
    if (p.addresses?.length) {
      for (const a of p.addresses) {
        const created = await manager.save(
          manager.create(CustomerEntities.Address, {
            addressType: a.addressType as any,
            label: a.label ?? null,
            isPrimary: a.isPrimary ?? false,
            street: a.street,
            number: a.number ?? null,
            complement: a.complement ?? null,
            district: a.district ?? null,
            city: a.city,
            state: a.state,
            postalCode: a.postalCode,
            country: a.country ?? 'Brasil',
            reference: a.reference ?? null,
            personId: person.id,
            companyId: null,
          }),
        );
        if (created.isPrimary) {
          await manager
            .createQueryBuilder()
            .update(CustomerEntities.Address)
            .set({ isPrimary: false })
            .where('person_id = :pid AND id <> :id', {
              pid: person.id,
              id: created.id,
            })
            .execute();
        }
      }
    }

    return person;
  }

  private async createCompanyUnder(
    manager: EntityManager,
    customerId: string,
    c: CreateCompanyNestedDto,
  ) {
    const cnpj = this.ensureCnpj(c.cnpj)!;
    let company;
    try {
      company = await manager.save(
        manager.create(CustomerEntities.CustomerCompany, {
          // CustomerCompany.id é PrimaryColumn (sem geração). Use o mesmo id do Customer.
          id: customerId,
          customerId,
          legalName: c.legalName,
          tradeName: c.tradeName ?? null,
          cnpj,
          stateRegistration: c.stateRegistration ?? null,
          municipalRegistration: c.municipalRegistration ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
          status: c.status ?? null,
          openingDate: this.parseDateFlexible(c.openingDate),
          legalNature: c.legalNature ?? null,
          size: c.size ?? null,
          mainActivity: c.mainActivity ?? null,
          secondaryActivities: c.secondaryActivities ?? [],
        }),
      );
    } catch (err) {
      await this.rethrowUniqueConflict(err, 'company.cnpj', cnpj);
    }

    // addresses da empresa
    if (c.addresses?.length) {
      for (const a of c.addresses) {
        const created = await manager.save(
          manager.create(CustomerEntities.Address, {
            addressType: a.addressType as any,
            label: a.label ?? null,
            isPrimary: a.isPrimary ?? false,
            street: a.street,
            number: a.number ?? null,
            complement: a.complement ?? null,
            district: a.district ?? null,
            city: a.city,
            state: a.state,
            postalCode: a.postalCode,
            country: a.country ?? 'Brasil',
            reference: a.reference ?? null,
            companyId: company.id,
            personId: null,
          }),
        );
        if (created.isPrimary) {
          await manager
            .createQueryBuilder()
            .update(CustomerEntities.Address)
            .set({ isPrimary: false })
            .where('company_id = :cid AND id <> :id', {
              cid: company.id,
              id: created.id,
            })
            .execute();
        }
      }
    }

    // pessoas vinculadas
    if (c.people?.length) {
      for (const ref of c.people) {
        await this.applyCompanyPersonRef(manager, company.id, ref);
      }
    }

    return company;
  }

  private async applyCompanyPersonRef(
    manager: EntityManager,
    companyId: string,
    ref: CompanyPersonRefDto,
  ) {
    let person = null;
    if (ref.personId) {
      person = await manager.findOne(CustomerEntities.CustomerPerson, {
        where: { id: ref.personId },
      });
      if (!person) throw new NotFoundException('Person not found');
    } else if (ref.cpf) {
      const cpf = this.ensureCpf(ref.cpf);
      person = await manager.findOne(CustomerEntities.CustomerPerson, {
        where: { cpf },
      });
      if (!person) throw new NotFoundException('Person (by CPF) not found');
    } else if (ref.createPerson) {
      const newCustomer = await manager.save(
        manager.create(CustomerEntities.Customer, {
          kind: CustomerEntities.CustomerKind.PERSON,
          displayName: ref.createPerson.fullName,
        }),
      );
      person = await this.createPersonUnder(
        manager,
        newCustomer.id,
        ref.createPerson,
      );
    } else {
      throw new BadRequestException(
        'Provide personId, cpf or createPerson in company.people[]',
      );
    }

    // emula upsert por (companyId, personId)
    let link = await manager.findOne(CustomerEntities.CompanyPersonLink, {
      where: { companyId, personId: person.id } as any,
    });
    if (!link) {
      link = await manager.save(
        manager.create(CustomerEntities.CompanyPersonLink, {
          companyId,
          personId: person.id,
          role: ref.role ?? null,
          isPrimary: ref.isPrimary ?? false,
          isLegalRepresentative: ref.isLegalRepresentative ?? false,
          startedOn: ref.startedOn ? new Date(ref.startedOn) : null,
          endedOn: ref.endedOn ? new Date(ref.endedOn) : null,
        }),
      );
    } else {
      await manager.update(
        CustomerEntities.CompanyPersonLink,
        { id: link.id },
        {
          role:
            typeof ref.role === 'undefined' ? link.role : (ref.role ?? null),
          isPrimary:
            typeof ref.isPrimary === 'undefined'
              ? link.isPrimary
              : !!ref.isPrimary,
          isLegalRepresentative:
            typeof ref.isLegalRepresentative === 'undefined'
              ? link.isLegalRepresentative
              : !!ref.isLegalRepresentative,
          startedOn: ref.startedOn ? new Date(ref.startedOn) : link.startedOn,
          endedOn: ref.endedOn ? new Date(ref.endedOn) : link.endedOn,
        },
      );
      link = await manager.findOne(CustomerEntities.CompanyPersonLink, {
        where: { id: link.id },
      });
    }

    if (ref.isPrimary) {
      await manager
        .createQueryBuilder()
        .update(CustomerEntities.CompanyPersonLink)
        .set({ isPrimary: false })
        .where('company_id = :cid AND person_id <> :pid', {
          cid: companyId,
          pid: person.id,
        })
        .execute();
    }
    return link;
  }

  // -------------- Tree (GET /customers/:id?tree=true) --------------
  private async includeCustomerTree(
    manager: EntityManager,
    customerId: string,
  ) {
    // IMPORTANTE: usar o manager da transação para todas as leituras
    const base = await manager.findOne(CustomerEntities.Customer, {
      where: { id: customerId },
    });
    if (!base) throw new NotFoundException('Customer not found');

    if (base.kind === 'PERSON') {
      const person = await manager.findOne(CustomerEntities.CustomerPerson, {
        where: { customerId },
        relations: ['addresses'] as any,
      });
      const branches = await manager.find(CustomerEntities.CustomerBranch, {
        where: { parentId: customerId } as any,
      });
      return { ...base, person, branches };
    }

    const company = await manager.findOne(CustomerEntities.CustomerCompany, {
      where: { customerId },
      relations: [
        'addresses',
        'links',
        'links.person',
        'links.person.addresses',
        'links.person.customer',
      ] as any,
      order: { links: { isPrimary: 'DESC', createdAt: 'DESC' } } as any,
    });
    // Exclui links soft-deleted (TypeORM pode incluí-los em relations)
    if (company?.links?.length) {
      company.links = company.links.filter((l: any) => !l.deletedAt);
    }

    // 👇 NOVO: buscar o vínculo onde ESTE customer é o filho (filial)
    const parentLink = await manager.findOne(CustomerEntities.CustomerBranch, {
      where: { childId: customerId } as any,
      relations: ['parent'] as any,
    });

    const branches = await manager.find(CustomerEntities.CustomerBranch, {
      where: { parentId: customerId } as any,
      relations: [
        'child',
        'child.company',
        'child.company.links',
        'child.company.links.person',
        'child.company.links.person.customer',
      ] as any,
    });
    for (const b of branches) {
      if (b.child?.company?.links?.length) {
        b.child.company.links = b.child.company.links
          .filter((l: any) => !l.deletedAt)
          .filter((l) => l.isPrimary)
          .slice(0, 1);
      }
    }

    // encaixar no mesmo formato que o front já espera (company.parent.customer)
    return {
      ...base,
      company: {
        ...company,
        parent: parentLink ? { customer: parentLink.parent } : undefined,
      },
      branches,
    };
  }

  // -------------- Consulta CNPJ na Receita Federal --------------
  async consultCnpj(cnpj: string) {
    // Valida o CNPJ
    const cleanCnpj = this.ensureCnpj(cnpj);

    try {
      // Consulta na API da Receita Federal
      const response = await firstValueFrom(
        this.httpService.get(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`),
      );

      const data = response.data;

      // Verifica se a empresa foi encontrada
      if (data.status === 'ERROR') {
        throw new NotFoundException('CNPJ não encontrado na Receita Federal');
      }

      // Retorna os dados formatados
      return {
        cnpj: cleanCnpj,
        razaoSocial: data.nome,
        nomeFantasia: data.fantasia || null,
        situacao: data.situacao,
        dataSituacao: data.data_situacao,
        motivoSituacao: data.motivo_situacao || null,
        naturezaJuridica: data.natureza_juridica,
        porte: data.porte,
        abertura: data.abertura,
        atividadePrincipal: {
          codigo: data.atividade_principal?.[0]?.code || null,
          descricao: data.atividade_principal?.[0]?.text || null,
        },
        atividadesSecundarias:
          data.atividades_secundarias?.map((atv: any) => ({
            codigo: atv.code,
            descricao: atv.text,
          })) || [],
        endereco: {
          logradouro: data.logradouro,
          numero: data.numero,
          complemento: data.complemento || null,
          bairro: data.bairro,
          municipio: data.municipio,
          uf: data.uf,
          cep: data.cep,
          pais: data.pais || 'Brasil',
        },
        contato: {
          telefone: data.telefone || null,
          email: data.email || null,
        },
        capitalSocial: data.capital_social || null,
        ultimaAtualizacao: data.ultima_atualizacao,
        extra: data.extra || null,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      // Trata erros de rede ou API
      if (error.response?.status === 404) {
        throw new NotFoundException('CNPJ não encontrado na Receita Federal');
      }

      if (error.response?.status === 429) {
        throw new BadRequestException(
          'Limite de consultas excedido. Tente novamente em alguns minutos.',
        );
      }

      throw new BadRequestException(
        'Erro ao consultar CNPJ na Receita Federal. Tente novamente mais tarde.',
      );
    }
  }
}
