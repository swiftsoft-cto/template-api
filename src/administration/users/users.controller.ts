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
  Put,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  Req,
  UseFilters,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UsersService } from './users.service';
import {
  createUserSchema,
  updateUserSchema,
  paginationSchema,
  addExtraRuleSchema,
  updateExtraRuleSchema,
} from './users.schema';
import { Authz } from '../../auth/decorators/rule.decorator';
import { User } from '../../_common/decorators/user.decorator';
import { RolesService } from '../roles/roles.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AccountBlockService } from '../../auth/account-block.service';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { StorageClientService } from '../../_common/storage-client/storage-client.service';
import { MulterExceptionFilter } from '../../_common/filters/multer-exception.filter';

class CreateUserDto {
  static schema = createUserSchema;
}
class UpdateUserDto {
  static schema = updateUserSchema;
}
class PaginationDto {
  static schema = paginationSchema;
}
class AddExtraRuleDto {
  static schema = addExtraRuleSchema;
}
class UpdateExtraRuleDto {
  static schema = updateExtraRuleSchema;
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly blocks: AccountBlockService,
    private readonly i18n: I18nService,
    private readonly storage: StorageClientService,
  ) {}

  @Post()
  @Authz('users.create')
  @HttpCode(HttpStatus.CREATED)
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async create(
    @UploadedFile() avatar: any,
    @Body() body: CreateUserDto,
    @User('userId') currentUserId: string,
  ) {
    const result = await this.usersService.create(body as any, currentUserId);
    const createdUserId = (result as any)?.data?.id;
    if (avatar && createdUserId) {
      // upload no Storage com compressão
      const saved = await this.storage.upload(avatar, 'avatars', true);
      await this.usersService.updateAvatarId(createdUserId, saved.id);
      (result as any).data.avatarFileId = saved.id;
      (result as any).data.avatarStream = saved.streamUrl;
    }
    return result;
  }

  @Get()
  @Authz('users.read')
  async findAll(
    @Query() query: PaginationDto,
    @User('userId') requesterId: string,
  ) {
    // decide por campo, não mais boolean
    return this.usersService.findAllDynamic(query, { requesterId });
  }

  @Get(':id')
  @Authz('users.read')
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User('userId') requesterId: string,
  ) {
    return this.usersService.findOneDynamic(id, requesterId);
  }

  @Get('me/profile')
  @UseGuards(JwtAuthGuard)
  async getMyProfile(@User('userId') requesterId: string) {
    return this.usersService.findOneDynamic(requesterId, requesterId);
  }

  @Get('me/extra-rules')
  @UseGuards(JwtAuthGuard)
  async getMyExtraRules(@User('userId') userId: string) {
    return this.rolesService.listUserExtraRules(userId, userId);
  }

  @Patch(':id')
  @Authz('users.update')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() avatar: any,
    @Body() raw: any,
    @User('userId') requesterId: string,
  ) {
    // se houver avatar novo, vamos precisar do antigo para limpeza
    let previous: { avatarFileId: string | null } | null = null;
    if (avatar) {
      previous = await this.usersService.getAvatarMeta(id);
    }
    // Sanitiza dinamicamente conforme tabela/regras
    const bodySanitized = await this.usersService.sanitizeUpdatePayload(
      raw,
      requesterId,
    );
    const body = await UpdateUserDto.schema.parseAsync(bodySanitized);
    const result = await this.usersService.updateDynamic(id, body, {
      requesterId,
    });
    if (avatar) {
      const saved = await this.storage.upload(avatar, 'avatars', true);
      await this.usersService.updateAvatarId(id, saved.id);
      // remove avatar anterior se existir
      if (previous?.avatarFileId) {
        try {
          await this.storage.delete(previous.avatarFileId);
        } catch {}
      }
      (result as any).data.avatarFileId = saved.id;
    }
    return result;
  }

  @Delete(':id')
  @Authz('users.delete')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.remove(id);
  }

  // Relacionamentos com role
  @Get(':id/role')
  @Authz('users.role.read')
  getUserRole(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rolesService.getUserRole(id);
  }

  @Get(':id/extra-rules')
  @Authz('users.read')
  getUserExtraRules(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User('userId') requesterId: string,
  ) {
    return this.rolesService.listUserExtraRules(id, requesterId);
  }

  @Post(':id/extra-rules')
  @Authz('users.update')
  @HttpCode(HttpStatus.CREATED)
  addUserExtraRule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AddExtraRuleDto,
    @User('userId') requesterId: string,
  ) {
    const { ruleId, source, expiresAt } = body as any;
    return this.rolesService.addRuleToUser(id, ruleId, requesterId, {
      source,
      expiresAt: expiresAt ?? null,
    });
  }

  @Patch(':id/extra-rules/:ruleId')
  @Authz('users.update')
  updateUserExtraRule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
    @Body() body: UpdateExtraRuleDto,
    @User('userId') requesterId: string,
  ) {
    const { source, expiresAt } = body as any;
    return this.rolesService.updateRuleForUser(id, ruleId, requesterId, {
      ...(source !== undefined && { source }),
      ...(expiresAt !== undefined && { expiresAt }),
    });
  }

  @Delete(':id/extra-rules/:ruleId')
  @Authz('users.update')
  removeUserExtraRule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
    @User('userId') requesterId: string,
  ) {
    return this.rolesService.removeRuleFromUser(id, ruleId, requesterId);
  }

  @Put(':id/role/:roleId')
  @Authz('users.role.update')
  setRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
  ) {
    return this.rolesService.setUserRole(id, roleId);
  }

  @Delete(':id/role')
  @Authz('users.role.delete')
  clearRole(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rolesService.clearUserRole(id);
  }

  // BLOQUEAR ACESSO (ADMIN)
  @Put(':id/block')
  @Authz('users.block_access')
  async blockUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User('userId') adminId: string,
    @Body() body: { reason?: string; until?: string | null },
  ) {
    const lang = I18nContext.current()?.lang;
    const user = await this.usersService.getBasicForBlock(id);
    if (!user) {
      return {
        message: await this.i18n.translate('users.not_found', { lang }),
      };
    }
    const info = {
      blockedAt: new Date().toISOString(),
      blockedBy: adminId,
      reason: body?.reason,
      until: body?.until ?? null,
    };
    await this.blocks.blockByUser(user.id, info, user.email);
    return {
      message:
        (await this.i18n.translate('auth.account_blocked', { lang })) ||
        'Conta bloqueada.',
      data: { userId: user.id, ...info },
    };
  }

  // DESBLOQUEAR ACESSO (ADMIN)
  @Delete(':id/block')
  @Authz('users.unblock_access')
  async unblockUser(@Param('id', new ParseUUIDPipe()) id: string) {
    const user = await this.usersService.getBasicForBlock(id);
    if (user) await this.blocks.unblockByUser(user.id, user.email);
    return { message: 'Conta desbloqueada.' };
  }

  // ===== Avatar: atualização e leitura =====
  @Put(':id/avatar')
  @Authz('users.avatar.update')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async updateAvatar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() avatar: any,
  ) {
    if (!avatar) {
      throw new BadRequestException('Arquivo de avatar não fornecido.');
    }

    // Busca avatar anterior para limpeza
    const previous = await this.usersService.getAvatarMeta(id);

    // Faz upload do novo avatar
    const saved = await this.storage.upload(avatar, 'avatars', true);
    await this.usersService.updateAvatarId(id, saved.id);

    // Remove avatar anterior se existir
    if (previous?.avatarFileId) {
      try {
        await this.storage.delete(previous.avatarFileId);
      } catch {}
    }

    return {
      message: 'Avatar atualizado com sucesso.',
      data: {
        avatarFileId: saved.id,
        avatarStream: saved.streamUrl,
      },
    };
  }

  @Get(':id/avatar')
  @Authz('users.avatar.read')
  async streamAvatar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('download') download: string,
    @Query('v') version: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = await this.usersService.getAvatarMeta(id);

    if (!user?.avatarFileId) {
      return res.status(404).json({ message: 'Usuário sem avatar.' });
    }

    const currentVersion = user.avatarFileId;
    const etag = `"${currentVersion}"`;

    res.setHeader('ETag', etag);
    res.setHeader('Vary', 'Authorization');

    // 1) Se veio com a VERSÃO correta, sirva 200 + immutable (primeira vez baixa, depois nem revalida)
    if (version === currentVersion) {
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      return this.storage.pipeStreamToResponse(
        user.avatarFileId,
        res,
        download,
      );
    }

    // 2) Se NÃO veio com versão, mas o cliente mandou If-None-Match igual, devolva 304
    if (req.headers['if-none-match'] === etag) {
      res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
      return res.status(304).end();
    }

    // 3) Sem versão e sem ETag igual -> sirva 200 e peça revalidação futura
    res.setHeader('Cache-Control', 'private, no-cache');
    return this.storage.pipeStreamToResponse(user.avatarFileId, res, download);
  }
}
