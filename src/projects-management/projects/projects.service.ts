import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError, Brackets, IsNull, In } from 'typeorm';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { Project, ProjectType } from './project.entity';
import { Customer } from '../../administration/customers/entities/customer.entity';
import { User } from '../../administration/users/user.entity';
import { Rule } from '../../administration/rules/rule.entity';
import { RoleRule } from '../../administration/roles/role-rule.entity';
import { CreateProjectDto, UpdateProjectDto } from './projects.schema';
import { ListProjectsDto } from './dto/list-projects.dto';
import { NotificationsService } from '../../notifications/notifications.service';
import { TrackingService } from '../../_common/tracking/tracking.service';

@Injectable()
export class ProjectsService {
  // Mapeamento de tipos de projeto para nomes legíveis
  private readonly projectTypeNames: Record<ProjectType, string> = {
    [ProjectType.SOFTWARE]: 'Software',
    [ProjectType.MAINTENANCE]: 'Manutenção',
    [ProjectType.EVOLUTION]: 'Evolução',
    [ProjectType.RESEARCH_DEVELOPMENT]: 'Pesquisa e Desenvolvimento',
    [ProjectType.CONSULTING]: 'Consultoria',
    [ProjectType.AGENTS_AI]: 'Agente de IA',
    [ProjectType.OTHER]: 'Outro',
  };

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Rule)
    private readonly ruleRepo: Repository<Rule>,
    @InjectRepository(RoleRule)
    private readonly roleRuleRepo: Repository<RoleRule>,
    private readonly i18n: I18nService,
    private readonly notificationsService: NotificationsService,
    private readonly trackingService: TrackingService,
  ) {}

  private getLang() {
    return I18nContext.current()?.lang;
  }

  /**
   * Busca todos os usuários que têm uma regra específica
   */
  private async getUsersByRule(ruleName: string): Promise<User[]> {
    // 1. Buscar a regra pelo nome
    const rule = await this.ruleRepo.findOne({
      where: { name: ruleName, deletedAt: IsNull() },
    });

    if (!rule) {
      return [];
    }

    // 2. Buscar todos os roles que têm essa regra
    const roleRules = await this.roleRuleRepo.find({
      where: { ruleId: rule.id },
    });

    if (roleRules.length === 0) {
      return [];
    }

    const roleIds = roleRules.map((rr) => rr.roleId);

    // 3. Buscar todos os usuários que têm esses roles
    const users = await this.userRepo.find({
      where: {
        roleId: In(roleIds),
        deletedAt: IsNull(),
      },
      select: { id: true, name: true },
    });

    return users;
  }

  // Traduz erros de constraint única (Postgres 23505) em 409
  private async rethrowUniqueConflict(
    err: unknown,
    field: string,
  ): Promise<never> {
    const isDup =
      err instanceof QueryFailedError &&
      (err as any).driverError?.code === '23505';
    if (
      isDup ||
      (err instanceof Error && err.message.includes('duplicate key'))
    ) {
      const lang = this.getLang();
      const message = await this.i18n.translate('common.field_already_exists', {
        lang,
        args: { field },
      });

      throw new ConflictException({ message, field });
    }
    throw err;
  }

  async create(dto: CreateProjectDto, createdByUserId: string) {
    const lang = this.getLang();

    // Verificar se o cliente existe
    const customer = await this.customerRepo.findOne({
      where: { id: dto.customerId },
    });
    if (!customer) {
      throw new NotFoundException(
        await this.i18n.translate('customers.not_found', { lang }),
      );
    }

    try {
      const project = this.projectRepo.create({
        projectName: dto.projectName,
        projectCode: dto.projectCode,
        description: dto.description ?? null,
        projectType: dto.projectType,
        customerId: dto.customerId,
        createdById: createdByUserId,
      });

      const saved = await this.projectRepo.save(project);

      // Buscar nome do usuário que criou o projeto
      const createdByUser = await this.userRepo.findOne({
        where: { id: createdByUserId, deletedAt: IsNull() },
        select: { name: true },
      });
      const creatorName = createdByUser?.name || 'Usuário';

      const projectTypeName =
        this.projectTypeNames[dto.projectType] || 'Projeto';
      const customerName = customer.displayName;

      // Coletar todos os IDs de usuários que devem receber notificação
      const userIdsToNotify = new Set<string>();

      // Adicionar o criador do customer (se existir)
      if (customer.createdById) {
        userIdsToNotify.add(customer.createdById);
      }

      // Adicionar todos os gestores de projetos
      const projectManagers = await this.getUsersByRule('projects.manager');
      projectManagers.forEach((manager) => {
        userIdsToNotify.add(manager.id);
      });

      // Criar notificações para todos os usuários únicos
      if (userIdsToNotify.size > 0) {
        const uniqueUserIds = Array.from(userIdsToNotify);
        await this.notificationsService.createMany(
          uniqueUserIds,
          'Novo projeto criado',
          `Um novo projeto do tipo "${projectTypeName}" foi criado para o cliente "${customerName}" por ${creatorName}.`,
          'project',
          saved.id,
        );

        // Enviar tracking por WhatsApp (assíncrono, não bloqueia resposta)
        setImmediate(() => {
          this.trackingService
            .sendTrackingToUsers(
              uniqueUserIds,
              {
                projectId: saved.id,
                projectName: saved.projectName,
                customerName,
                badge: 'INTERNO',
                currentStage: 'projeto',
                projectCreatedAt: saved.createdAt,
              },
              `Novo projeto "${saved.projectName}" criado`,
            )
            .catch((error) => {
              // Não deve quebrar o fluxo principal se o tracking falhar
              console.error('Erro ao enviar tracking por WhatsApp:', error);
            });
        });
      }

      return saved;
    } catch (err) {
      await this.rethrowUniqueConflict(err, 'projectCode');
      throw err;
    }
  }

  async findAll(params: ListProjectsDto) {
    const {
      q,
      search,
      page = 1,
      limit = 20,
      orderBy = 'createdAt',
      order = 'desc',
      customerId,
    } = params;

    // Garantir que page e limit sejam números
    const pageNum = typeof page === 'string' ? parseInt(page, 10) : page;
    const limitNum = typeof limit === 'string' ? parseInt(limit, 10) : limit;

    const skip = (pageNum - 1) * limitNum;
    const searchTerm = (q ?? search ?? '').trim();

    const qb = this.projectRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.customer', 'c')
      .where('p.deletedAt IS NULL');

    // Filtro por cliente
    if (customerId) {
      qb.andWhere('p.customerId = :customerId', { customerId });
    }

    // Busca por termo
    if (searchTerm) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('p.projectName ILIKE :s', { s: `%${searchTerm}%` })
            .orWhere('p.projectCode ILIKE :s', { s: `%${searchTerm}%` })
            .orWhere('p.description ILIKE :s', { s: `%${searchTerm}%` })
            .orWhere('c.displayName ILIKE :s', { s: `%${searchTerm}%` });
        }),
      );
    }

    // Ordenação
    const orderMap: Record<string, string> = {
      createdAt: 'p.createdAt',
      updatedAt: 'p.updatedAt',
      projectName: 'p.projectName',
      projectCode: 'p.projectCode',
    };

    qb.orderBy(
      orderMap[orderBy] ?? 'p.createdAt',
      (order || 'desc').toUpperCase() as 'ASC' | 'DESC',
    )
      .skip(skip)
      .take(limitNum);

    const [projects, total] = await qb.getManyAndCount();

    return {
      data: projects,
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

  async findOne(id: string) {
    const lang = this.getLang();
    const project = await this.projectRepo.findOne({
      where: { id },
      relations: ['customer'],
    });

    if (!project) {
      throw new NotFoundException(
        await this.i18n.translate('projects.not_found', { lang }),
      );
    }

    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    const lang = this.getLang();
    const project = await this.projectRepo.findOne({ where: { id } });

    if (!project) {
      throw new NotFoundException(
        await this.i18n.translate('projects.not_found', { lang }),
      );
    }

    // Verificar se o cliente existe (se foi fornecido)
    if (dto.customerId && dto.customerId !== project.customerId) {
      const customer = await this.customerRepo.findOne({
        where: { id: dto.customerId },
      });
      if (!customer) {
        throw new NotFoundException(
          await this.i18n.translate('customers.not_found', { lang }),
        );
      }
    }

    try {
      await this.projectRepo.update(
        { id },
        {
          projectName: dto.projectName ?? project.projectName,
          projectCode: dto.projectCode ?? project.projectCode,
          description:
            typeof dto.description === 'undefined'
              ? project.description
              : dto.description,
          projectType: dto.projectType ?? project.projectType,
          customerId: dto.customerId ?? project.customerId,
        },
      );

      return this.projectRepo.findOne({
        where: { id },
        relations: ['customer'],
      });
    } catch (err) {
      await this.rethrowUniqueConflict(err, 'projectCode');
      throw err;
    }
  }

  async remove(id: string) {
    const lang = this.getLang();
    const project = await this.projectRepo.findOne({ where: { id } });

    if (!project) {
      throw new NotFoundException(
        await this.i18n.translate('projects.not_found', { lang }),
      );
    }

    // Soft delete
    await this.projectRepo.update({ id }, { deletedAt: new Date() as any });

    return { message: 'Project deleted successfully' };
  }
}
