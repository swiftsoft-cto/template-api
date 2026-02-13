import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import {
  createNotificationSchema,
  notificationPaginationSchema,
  markAsReadSchema,
} from './notifications.schema';
import { Authz } from '../auth/decorators/rule.decorator';
import { User } from '../_common/decorators/user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class CreateNotificationDto {
  static schema = createNotificationSchema;
}

class NotificationPaginationDto {
  static schema = notificationPaginationSchema;
}

class MarkAsReadDto {
  static schema = markAsReadSchema;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Cria uma nova notificação
   * Endpoint para uso interno do sistema (pode ser chamado por outros módulos)
   */
  @Post()
  @Authz('notifications.create')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateNotificationDto) {
    return this.notificationsService.create(body as any);
  }

  /**
   * Lista notificações do usuário autenticado
   */
  @Get()
  @Authz('notifications.read')
  async findAll(
    @Query() query: NotificationPaginationDto,
    @User('userId') userId: string,
  ) {
    return this.notificationsService.findAll(userId, query);
  }

  /**
   * Busca uma notificação específica
   */
  @Get(':id')
  @Authz('notifications.read')
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User('userId') userId: string,
  ) {
    return this.notificationsService.findOne(id, userId);
  }

  /**
   * Marca uma notificação como lida ou não lida
   */
  @Patch(':id/read')
  @Authz('notifications.update')
  async markAsRead(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: MarkAsReadDto,
    @User('userId') userId: string,
  ) {
    return this.notificationsService.markAsRead(
      id,
      userId,
      (body as any).read ?? true,
    );
  }

  /**
   * Marca todas as notificações do usuário como lidas
   */
  @Post('mark-all-read')
  @Authz('notifications.update')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@User('userId') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  /**
   * Conta notificações não lidas do usuário
   */
  @Get('unread/count')
  @Authz('notifications.read')
  async countUnread(
    @User('userId') userId: string,
    @Query('entity') entity?: string,
  ) {
    const count = await this.notificationsService.countUnread(userId, entity);
    return {
      message: 'Contagem de notificações não lidas',
      data: { count },
    };
  }

  /**
   * Remove uma notificação (soft delete)
   */
  @Delete(':id')
  @Authz('notifications.delete')
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User('userId') userId: string,
  ) {
    return this.notificationsService.remove(id, userId);
  }
}
