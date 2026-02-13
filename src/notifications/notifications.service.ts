import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Brackets } from 'typeorm';
import { I18nService, I18nContext } from 'nestjs-i18n';
import * as crypto from 'node:crypto';
import {
  CreateNotificationInput,
  NotificationPaginationInput,
} from './notifications.schema';
import { Notification } from './notification.entity';
import { RealtimeService } from '../_common/realtime/realtime.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationsRepo: Repository<Notification>,
    private i18n: I18nService,
    private realtime: RealtimeService,
  ) {}

  private getLang() {
    return I18nContext.current()?.lang;
  }

  /**
   * Cria uma nova notificação
   * Método genérico que pode ser usado por qualquer módulo do sistema
   */
  async create(data: CreateNotificationInput) {
    const lang = this.getLang();

    const notification: Partial<Notification> = {
      id: crypto.randomUUID(),
      userId: data.userId,
      title: data.title,
      message: data.message,
      entity: data.entity ?? null,
      registerId: data.registerId ?? null,
      read: false,
      readAt: null,
    };

    await this.notificationsRepo.insert(notification as any);

    const created = await this.notificationsRepo.findOne({
      where: { id: notification.id },
      relations: ['user'],
    });

    // Emite notificação em tempo real via WebSocket
    this.realtime.emitToUser(data.userId, 'notification:new', {
      id: created?.id,
      title: created?.title,
      message: created?.message,
      entity: created?.entity,
      registerId: created?.registerId,
      read: created?.read,
      createdAt: created?.createdAt,
    });

    // Emite atualização do contador de não lidas
    const unreadCount = await this.countUnread(data.userId);
    this.realtime.emitToUser(data.userId, 'notification:unread_count', {
      count: unreadCount,
    });

    const message = await this.i18n.translate('notifications.created', {
      lang,
    });
    return { message, data: created };
  }

  /**
   * Cria múltiplas notificações de uma vez
   * Útil para notificar vários usuários sobre o mesmo evento
   */
  async createMany(
    userIds: string[],
    title: string,
    message: string,
    entity?: string | null,
    registerId?: string | null,
  ) {
    const lang = this.getLang();

    if (userIds.length === 0) {
      throw new BadRequestException(
        await this.i18n.translate('notifications.userIds_required', { lang }),
      );
    }

    const notifications: Partial<Notification>[] = userIds.map((userId) => ({
      id: crypto.randomUUID(),
      userId,
      title,
      message,
      entity: entity ?? null,
      registerId: registerId ?? null,
      read: false,
      readAt: null,
    }));

    await this.notificationsRepo.insert(notifications as any);

    // Emite notificações em tempo real para cada usuário
    const userIdsSet = new Set(userIds);
    for (const userId of userIdsSet) {
      // Envia a notificação criada para este usuário
      this.realtime.emitToUser(userId, 'notification:new', {
        title,
        message,
        entity: entity ?? null,
        registerId: registerId ?? null,
        read: false,
      });

      // Atualiza contador de não lidas
      const unreadCount = await this.countUnread(userId);
      this.realtime.emitToUser(userId, 'notification:unread_count', {
        count: unreadCount,
      });
    }

    const translatedMessage = await this.i18n.translate(
      'notifications.created_many',
      {
        lang,
        args: { count: notifications.length },
      },
    );
    return {
      message: translatedMessage,
      data: { count: notifications.length },
    };
  }

  /**
   * Lista notificações de um usuário com paginação e filtros
   */
  async findAll(userId: string, query: NotificationPaginationInput) {
    const lang = this.getLang();
    const {
      page = 1,
      limit = 10,
      search,
      read,
      entity,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const qb = this.notificationsRepo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NULL');

    if (read !== undefined) {
      qb.andWhere('n.read = :read', { read });
    }

    if (entity) {
      qb.andWhere('n.entity = :entity', { entity });
    }

    if (search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('n.title ILIKE :s', { s: `%${search}%` }).orWhere(
            'n.message ILIKE :s',
            { s: `%${search}%` },
          );
        }),
      );
    }

    qb.orderBy(`n.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC')
      .skip(skip)
      .take(limit);

    const [notifications, total] = await qb.getManyAndCount();

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
      notifications.length > 0
        ? await this.i18n.translate('notifications.listed', { lang })
        : await this.i18n.translate('notifications.empty', { lang });

    return { message, data: notifications, pagination };
  }

  /**
   * Busca uma notificação específica
   */
  async findOne(id: string, userId: string) {
    const lang = this.getLang();

    const notification = await this.notificationsRepo.findOne({
      where: { id, userId, deletedAt: IsNull() },
      relations: ['user'],
    });

    if (!notification) {
      throw new NotFoundException(
        await this.i18n.translate('notifications.not_found', {
          lang,
          args: { id },
        }),
      );
    }

    const message = await this.i18n.translate('notifications.found', { lang });
    return { message, data: notification };
  }

  /**
   * Marca uma notificação como lida ou não lida
   */
  async markAsRead(id: string, userId: string, read: boolean = true) {
    const lang = this.getLang();

    const notification = await this.notificationsRepo.findOne({
      where: { id, userId, deletedAt: IsNull() },
    });

    if (!notification) {
      throw new NotFoundException(
        await this.i18n.translate('notifications.not_found', {
          lang,
          args: { id },
        }),
      );
    }

    await this.notificationsRepo.update(
      { id },
      {
        read,
        readAt: read ? new Date() : null,
      },
    );

    const updated = await this.notificationsRepo.findOne({
      where: { id },
      relations: ['user'],
    });

    // Emite atualização da notificação via WebSocket
    this.realtime.emitToUser(userId, 'notification:updated', {
      id: updated?.id,
      read: updated?.read,
      readAt: updated?.readAt,
    });

    // Atualiza contador de não lidas
    const unreadCount = await this.countUnread(userId);
    this.realtime.emitToUser(userId, 'notification:unread_count', {
      count: unreadCount,
    });

    const message = read
      ? await this.i18n.translate('notifications.marked_as_read', { lang })
      : await this.i18n.translate('notifications.marked_as_unread', { lang });

    return { message, data: updated };
  }

  /**
   * Marca todas as notificações de um usuário como lidas
   */
  async markAllAsRead(userId: string) {
    const lang = this.getLang();

    const result = await this.notificationsRepo
      .createQueryBuilder()
      .update()
      .set({
        read: true,
        readAt: () => 'CURRENT_TIMESTAMP',
      })
      .where('user_id = :userId', { userId })
      .andWhere('deleted_at IS NULL')
      .andWhere('read = false')
      .execute();

    // Emite atualização via WebSocket
    this.realtime.emitToUser(userId, 'notification:all_read', {
      affected: result.affected ?? 0,
    });

    // Atualiza contador de não lidas (deve ser 0 agora)
    this.realtime.emitToUser(userId, 'notification:unread_count', {
      count: 0,
    });

    const message = await this.i18n.translate(
      'notifications.all_marked_as_read',
      {
        lang,
        args: { count: result.affected ?? 0 },
      },
    );

    return { message, data: { affected: result.affected ?? 0 } };
  }

  /**
   * Remove uma notificação (soft delete)
   */
  async remove(id: string, userId: string) {
    const lang = this.getLang();

    const notification = await this.notificationsRepo.findOne({
      where: { id, userId, deletedAt: IsNull() },
    });

    if (!notification) {
      throw new NotFoundException(
        await this.i18n.translate('notifications.not_found', {
          lang,
          args: { id },
        }),
      );
    }

    await this.notificationsRepo.update(
      { id },
      { deletedAt: new Date() as any },
    );

    // Emite remoção da notificação via WebSocket
    this.realtime.emitToUser(userId, 'notification:deleted', {
      id,
    });

    // Atualiza contador de não lidas
    const unreadCount = await this.countUnread(userId);
    this.realtime.emitToUser(userId, 'notification:unread_count', {
      count: unreadCount,
    });

    const message = await this.i18n.translate('notifications.deleted', {
      lang,
    });
    return { message };
  }

  /**
   * Conta notificações não lidas de um usuário
   */
  async countUnread(userId: string, entity?: string) {
    const qb = this.notificationsRepo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .andWhere('n.deleted_at IS NULL')
      .andWhere('n.read = false');

    if (entity) {
      qb.andWhere('n.entity = :entity', { entity });
    }

    return qb.getCount();
  }

  /**
   * Busca notificações por entidade e registro
   * Útil para encontrar todas as notificações relacionadas a um registro específico
   */
  async findByEntityAndRegister(
    entity: string,
    registerId: string,
    userId?: string,
  ) {
    const qb = this.notificationsRepo
      .createQueryBuilder('n')
      .where('n.entity = :entity', { entity })
      .andWhere('n.register_id = :registerId', { registerId })
      .andWhere('n.deleted_at IS NULL');

    if (userId) {
      qb.andWhere('n.user_id = :userId', { userId });
    }

    return qb.getMany();
  }
}
