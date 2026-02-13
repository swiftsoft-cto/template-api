import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  Query,
  Param,
  Delete,
  Put,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  UpdateMeDto,
} from './auth.schema';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { Authz } from './decorators/rule.decorator';
import { RateLimitInterceptor } from './interceptors/rate-limit.interceptor';
import { LoginRateLimitInterceptor } from './interceptors/login-rate-limit.interceptor';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { Response, Request } from 'express';
import { parseTTL } from './utils/ttl-parser';
import { SecurityAlertsService } from './security-alerts.service';
import { AccountBlockService } from './account-block.service';
import { RedisService } from '../_common/redis/redis.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { Company } from '../administration/company/company.entity';
import { TrustedDevice } from './trusted-device.entity';
import { BlacklistedDevice } from './blacklisted-device.entity';
import { User } from '../administration/users/user.entity';
import { WhitelistListDto, BlacklistListDto } from './devices.schema';

import {
  HttpException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { ipToSubnet, deviceHash } from './utils/ip.util';
import { User as UserDecorator } from '../_common/decorators/user.decorator';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../administration/users/users.service';
import { RolesService } from '../administration/roles/roles.service';
import { BlocksListDto, BlocksHistoryListDto } from './blocks.schema';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private i18n: I18nService,
    private alerts: SecurityAlertsService,
    private blocks: AccountBlockService,
    private redis: RedisService,
    @InjectRepository(Company) private companies: Repository<Company>,
    @InjectRepository(TrustedDevice)
    private trustedRepo: Repository<TrustedDevice>,
    @InjectRepository(BlacklistedDevice)
    private blackRepo: Repository<BlacklistedDevice>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    private jwtService: JwtService,
    private usersService: UsersService,
    private rolesService: RolesService,
  ) {}

  @UseInterceptors(LoginRateLimitInterceptor)
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { email, password } = body;

    // Gera reqId para correlação de logs
    const reqId = crypto.randomUUID();
    const ip =
      (req.ips?.[0] ?? req.ip) || req.connection.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || '';
    const result = await this.auth.login(email, password, reqId, ip, ua);

    // Configuração de cookie mais segura
    const ttl = process.env.REFRESH_TOKEN_TTL ?? '7d';
    const cookieBase = {
      httpOnly: true,
      sameSite: 'strict' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/auth/refresh',
      maxAge: parseTTL(ttl), // agora acompanha o .env
    };

    if (result.data.refreshToken) {
      res.cookie('rt', result.data.refreshToken, cookieBase);
    }

    // Decodifica o token para obter expiração
    const decodedToken = this.jwtService.decode(result.data.accessToken) as any;
    const now = Math.floor(Date.now() / 1000);
    const exp = decodedToken?.exp || 0;
    const remainingSeconds = Math.max(0, exp - now);

    // Converte para horas, minutos e segundos
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    // Perfil com SELECT dinâmico (campos sensíveis liberados p/ o próprio usuário)
    const userId = result.data.user.id;
    const { data: userSafe } = await this.usersService.findOneDynamic(userId);

    // company e rules (userSafe já tem role + departments)
    const companyId =
      (userSafe as any)?.role?.companyId ??
      (userSafe as any)?.companyId ??
      null;
    const [company, rules] = await Promise.all([
      companyId
        ? this.companies.findOne({
            where: { id: companyId, deletedAt: null as any },
            select: {
              id: true,
              name: true,
              tradeName: true,
              website: true,
            } as any,
          })
        : Promise.resolve(null),
      this.rolesService.getUserRules(userId),
    ]);

    return {
      serviceToken: result.data.accessToken,
      user: {
        ...userSafe, // <- já filtrado por campos sensíveis
        company,
        rules,
      },
      expiresIn: {
        hours,
        minutes,
        seconds,
      },
    };
  }

  @UseGuards(CsrfGuard)
  @UseInterceptors(RateLimitInterceptor)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const lang = I18nContext.current()?.lang;
    const providedRt = (req as any).cookies?.rt;
    if (!providedRt) {
      throw new UnauthorizedException(
        await this.i18n.translate('auth.missing_refresh', { lang }),
      );
    }

    // Gera reqId para correlação de logs
    const reqId = crypto.randomUUID();
    const ip =
      (req.ips?.[0] ?? req.ip) || req.connection.remoteAddress || 'unknown';

    const ua = req.headers['user-agent'] || '';
    const result = await this.auth.refresh(providedRt, reqId, ip, ua);

    const ttl = process.env.REFRESH_TOKEN_TTL ?? '7d';
    const cookieBase = {
      httpOnly: true,
      sameSite: 'strict' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/auth/refresh',
      maxAge: parseTTL(ttl), // agora acompanha o .env
    };

    if (result.data.refreshToken) {
      res.cookie('rt', result.data.refreshToken, cookieBase);
      delete (result.data as any).refreshToken;
    }
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const lang = I18nContext.current()?.lang;
    const providedRt = (req as any).cookies?.rt;

    // Gera reqId para correlação de logs
    const reqId = crypto.randomUUID();
    const ip =
      (req.ips?.[0] ?? req.ip) || req.connection.remoteAddress || 'unknown';

    await this.auth.logout(req.user.userId, providedRt, reqId, ip);

    // Limpa apenas o cookie rt
    res.clearCookie('rt', {
      path: '/auth/refresh',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });

    return { message: await this.i18n.translate('auth.logged_out', { lang }) };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@UserDecorator('userId') userId: string, @Req() req: any) {
    const { data: meSafe } = await this.usersService.findOneDynamic(userId);

    const companyId =
      (meSafe as any)?.role?.companyId ?? (meSafe as any)?.companyId ?? null;
    const [company, rules] = await Promise.all([
      companyId
        ? this.companies.findOne({
            where: { id: companyId, deletedAt: null as any },
            select: {
              id: true,
              name: true,
              tradeName: true,
              website: true,
            } as any,
          })
        : Promise.resolve(null),
      this.rolesService.getUserRules(userId),
    ]);

    // Calcula expiração do AT exatamente como antes
    const now = Math.floor(Date.now() / 1000);
    const exp = req.user.exp;
    const remainingSeconds = Math.max(0, exp - now);
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    return {
      data: {
        ...meSafe, // <- já contém role + departments e está filtrado por sensibilidade
        company,
        rules,
      },
      expiresIn: { hours, minutes, seconds },
    };
  }

  // API endpoint para desbloquear login
  @Post('unlock')
  async unlockApi(@Body() body: { token: string }) {
    const lang = I18nContext.current()?.lang;

    try {
      const ok = await this.alerts.unlockLogin(body.token);
      const message = ok
        ? await this.i18n.translate('devices.unlock.success', { lang })
        : await this.i18n.translate('devices.unlock.invalid_token', { lang });

      return {
        success: ok,
        message,
      };
    } catch (error) {
      const errorMessage = await this.i18n.translate('devices.unlock.error', {
        lang,
      });
      throw new UnauthorizedException(error.message || errorMessage);
    }
  }

  // NOVO: confirmação de e-mail - API endpoint
  @Post('verify')
  async verifyApi(@Body() body: { token: string }) {
    const lang = I18nContext.current()?.lang;

    try {
      const ok = await this.alerts.verifyEmail(body.token);
      const message = ok
        ? await this.i18n.translate('devices.verify.success', { lang })
        : await this.i18n.translate('devices.verify.invalid_token', { lang });

      return {
        success: ok,
        message,
      };
    } catch (error) {
      const errorMessage = await this.i18n.translate('devices.verify.error', {
        lang,
      });
      throw new UnauthorizedException(error.message || errorMessage);
    }
  }

  // NOVO: aprovar novo dispositivo/IP (API endpoint)
  @Post('approve-device')
  async approveDeviceApi(@Body() body: { token: string }) {
    const lang = I18nContext.current()?.lang;

    try {
      const ok = await this.alerts.approveDevice(body.token);
      const message = ok
        ? await this.i18n.translate('devices.approve.success', { lang })
        : await this.i18n.translate('devices.approve.invalid_token', { lang });

      return {
        success: ok,
        message,
      };
    } catch (error) {
      const errorMessage = await this.i18n.translate('devices.approve.error', {
        lang,
      });
      throw new UnauthorizedException(error.message || errorMessage);
    }
  }

  // Reenviar aprovação de novo dispositivo (somente fora de produção)
  @Post('devices/resend-approve')
  async resendApprove(@Body() body: { email: string }, @Req() req: Request) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Endpoint não disponível em produção');
    }
    const lang = I18nContext.current()?.lang;

    // rate-limit simples por IP+UA (5 por 15min)
    const ip =
      (req.ips?.[0] ?? req.ip) || req.connection.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || 'unknown';
    const rlKey = `rl:resenddev:${ip}:${ua}`;
    try {
      const count = await this.redis.incrWithTTL(rlKey, 15 * 60);
      if (count > 5) {
        const message = await this.i18n.translate('auth.rate_limit_exceeded', {
          lang,
        });
        throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch {}

    const email = (body.email || '').toLowerCase().trim();
    if (!email) throw new BadRequestException('Email é obrigatório');

    // Não vazar enumeração de usuários
    const user = await this.usersRepo.findOne({
      where: { email, deletedAt: null as any },
      select: { id: true, email: true } as any,
    });
    if (!user) {
      return { message: 'Se o e-mail existir, enviaremos novamente.' };
    }

    const subnet = ipToSubnet(ip);
    const devHash = deviceHash(subnet, ua);
    // limpa dedupe para permitir reenvio agora
    await this.redis.del(`deviceapprove:mailsent:${user.id}:${devHash}`);

    const sent = await this.alerts.sendNewDeviceApproval(
      user.id,
      user.email,
      subnet,
      ua,
    );
    return {
      message: 'Reenvio solicitado. Verifique sua caixa de entrada (e Spam).',
      debug: sent, // visível só porque não é produção
    };
  }

  // Endpoint de teste para verificar configuração de email
  @Get('test-email-config')
  @Authz('administrator')
  async testEmailConfig() {
    // Só disponível em desenvolvimento
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Endpoint não disponível em produção');
    }

    return {
      smtp: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE,
        user: process.env.SMTP_USER ? '***CONFIGURADO***' : 'NÃO CONFIGURADO',
        pass: process.env.SMTP_PASS ? '***CONFIGURADO***' : 'NÃO CONFIGURADO',
      },
      mail: {
        from: process.env.MAIL_FROM,
      },
      app: {
        webUrl: process.env.APP_WEB_URL,
      },
    };
  }

  // Endpoint para limpar dedupe de email (apenas para testes)
  @Get('clear-email-dedupe')
  @Authz('administrator')
  async clearEmailDedupe(@Query('email') email: string) {
    // Só disponível em desenvolvimento
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Endpoint não disponível em produção');
    }
    if (!email) {
      return { error: 'Email é obrigatório' };
    }

    // Busca o usuário para obter o ID
    const user = await this.usersRepo.findOne({
      where: { email: email.toLowerCase(), deletedAt: null as any },
      select: { id: true, email: true } as any,
    });

    if (!user) {
      return { error: 'Usuário não encontrado' };
    }

    // Remove a chave de dedupe
    const dedupeKey = `pwdreset:mailsent:${user.id}`;
    await this.redis.del(dedupeKey);

    return {
      success: true,
      message: `Dedupe removido para usuário ${user.id}`,
      email: user.email,
    };
  }

  // Endpoint para verificar token sem consumi-lo
  @Post('token/check')
  async checkToken(
    @Body()
    body: {
      type: 'verify' | 'unlock' | 'approve' | 'reject' | 'report' | 'reset';
      token: string;
    },
  ) {
    try {
      let payload: any;

      // Verifica apenas a assinatura e expiração, sem consumir o token
      switch (body.type) {
        case 'verify':
          payload = await this.jwtService.verifyAsync(body.token, {
            secret: process.env.EMAIL_TOKEN_SECRET!,
          });
          if (payload.typ !== 'email_verify') throw new Error('invalid type');
          break;

        case 'unlock':
          payload = await this.jwtService.verifyAsync(body.token, {
            secret: process.env.EMAIL_TOKEN_SECRET!,
          });
          if (payload.typ !== 'login_unlock') throw new Error('invalid type');
          break;

        case 'approve':
          payload = await this.jwtService.verifyAsync(body.token, {
            secret: process.env.EMAIL_TOKEN_SECRET!,
          });
          if (payload.typ !== 'device_approve') throw new Error('invalid type');
          break;

        case 'reject':
          payload = await this.jwtService.verifyAsync(body.token, {
            secret: process.env.EMAIL_TOKEN_SECRET!,
          });
          if (payload.typ !== 'device_reject') throw new Error('invalid type');
          break;

        case 'report':
          payload = await this.jwtService.verifyAsync(body.token, {
            secret: process.env.EMAIL_TOKEN_SECRET!,
          });
          if (payload.typ !== 'login_report') throw new Error('invalid type');
          break;

        case 'reset':
          payload = await this.jwtService.verifyAsync(body.token, {
            secret:
              process.env.PASSWORD_RESET_SECRET ||
              process.env.EMAIL_TOKEN_SECRET!,
          });
          if (payload.typ !== 'pwd_reset') throw new Error('invalid type');
          break;

        default:
          return { valid: false, reason: 'invalid type' };
      }

      // Verifica se o token já foi usado (sem consumi-lo)
      let usedKey: string;
      switch (body.type) {
        case 'verify':
          usedKey = `verify:jti:${payload.jti}`;
          break;
        case 'unlock':
          usedKey = `unlock:jti:${payload.jti}`;
          break;
        case 'approve':
          usedKey = `deviceapprove:jti:${payload.jti}`;
          break;
        case 'reject':
          usedKey = `devreject:jti:${payload.jti}`;
          break;
        case 'report':
          usedKey = `loginreport:jti:${payload.jti}`;
          break;
        case 'reset':
          usedKey = `pwdreset:jti:${payload.jti}`;
          break;
      }

      const isUsed = await this.redis.get(usedKey);

      return {
        valid: !isUsed,
        reason: isUsed ? 'used' : undefined,
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return { valid: false, reason: 'expired' };
      }
      return { valid: false, reason: 'invalid' };
    }
  }

  // 2) Solicitar e-mail de reset (público, sem revelar se e-mail existe)
  @Post('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto, @Req() req: Request) {
    const lang = I18nContext.current()?.lang;
    const ip =
      (req.ips?.[0] ?? req.ip) || req.connection.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || 'unknown';

    // Rate limit simples por IP+UA (5 por 15min)
    const rawKey = `rl:pwdreset:${ip}:${ua}`;
    const ttlSec = 15 * 60;
    try {
      const count = await this.redis.incrWithTTL(rawKey, ttlSec);
      if (count > 5) {
        const message = await this.i18n.translate('auth.rate_limit_exceeded', {
          lang,
        });
        throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch {
      // fail-open se Redis indisponível
    }

    // === BLOQUEIO POR DEVICE/IP NA BLACKLIST (sem vazar existência do e-mail) ===
    try {
      const subnet = ipToSubnet(ip);
      const devHash = deviceHash(subnet, ua);

      const userForReset = await this.usersRepo.findOne({
        where: { email: body.email.toLowerCase(), deletedAt: null as any },
        select: { id: true } as any,
      });

      if (userForReset) {
        const isBlocked = await this.blackRepo.findOne({
          where: {
            userId: userForReset.id,
            deviceHash: devHash,
            deletedAt: null as any,
          },
          select: { id: true } as any,
        });

        if (isBlocked) {
          // Comportamento padrão: "drop" silencioso (não envia e-mail, retorna 200)
          if (process.env.PWDRESET_BLOCKSTRATEGY !== 'forbid') {
            return {
              message: await this.i18n.translate(
                'auth.password_reset_email_sent',
                { lang },
              ),
            };
          }
          // Opcional (STRICT): retornar 403
          throw new ForbiddenException(
            await this.i18n.translate('auth.device_blocked', { lang }),
          );
        }
      }
    } catch {
      /* fail-open seguro aqui não deve quebrar a rota */
    }

    await this.alerts.sendPasswordReset(body.email);

    return {
      message: await this.i18n.translate('auth.password_reset_email_sent', {
        lang,
      }),
    };
  }

  // 3) Aplicar a nova senha (público)
  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto, @Req() req: Request) {
    const lang = I18nContext.current()?.lang;

    // RL por IP+UA, ex.: 10 req/min
    const ip =
      (req.ips?.[0] ?? req.ip) || req.connection.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || 'unknown';
    const rlKey = `rl:pwdapply:${ip}:${ua}`;
    try {
      const count = await this.redis.incrWithTTL(rlKey, 60);
      if (count > 10) {
        const message = await this.i18n.translate('auth.rate_limit_exceeded', {
          lang,
        });
        throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch {}

    // === BLOQUEIO POR DEVICE/IP NA BLACKLIST (token-locked) ===
    try {
      // verificamos o token só para obter o uid; o serviço vai verificar de novo
      const payload: any = await this.jwtService.verifyAsync(body.token, {
        secret:
          process.env.PASSWORD_RESET_SECRET || process.env.EMAIL_TOKEN_SECRET!,
      });
      if (payload?.typ === 'pwd_reset' && payload?.uid) {
        const subnet = ipToSubnet(ip);
        const devHash = deviceHash(subnet, ua);

        const isBlocked = await this.blackRepo.findOne({
          where: {
            userId: payload.uid,
            deviceHash: devHash,
            deletedAt: null as any,
          },
          select: { id: true } as any,
        });

        if (isBlocked) {
          throw new ForbiddenException(
            await this.i18n.translate('auth.device_blocked', { lang }),
          );
        }
      }
    } catch {
      // se o token for inválido/expirado, o fluxo original já responde 401 depois
    }

    // fluxo original
    try {
      await this.alerts.resetPassword(body.token, body.password);
      return {
        message: await this.i18n.translate('auth.password_reset_success', {
          lang,
        }),
      };
    } catch {
      throw new UnauthorizedException(
        await this.i18n.translate('auth.password_reset_invalid', { lang }),
      );
    }
  }

  // NOVO: rejeitar dispositivo (blacklist) - API endpoint
  @Post('reject-device')
  async rejectDeviceApi(@Body() body: { token: string }) {
    const lang = I18nContext.current()?.lang;

    try {
      const ok = await this.alerts.rejectDevice(body.token);
      const message = ok
        ? await this.i18n.translate('devices.reject.success', { lang })
        : await this.i18n.translate('devices.reject.invalid_token', { lang });

      return {
        success: ok,
        message,
      };
    } catch (error) {
      const errorMessage = await this.i18n.translate('devices.reject.error', {
        lang,
      });
      throw new UnauthorizedException(error.message || errorMessage);
    }
  }

  // ------ LISTAGEM PAGINADA (WHITELIST) ------
  @UseGuards(JwtAuthGuard)
  @Get('devices/whitelist')
  async listWhitelist(@Req() req: any, @Query() q: WhitelistListDto) {
    const userId = req.user.userId;
    const lang = I18nContext.current()?.lang;

    const skip = (q.page - 1) * q.limit;

    const qb = this.trustedRepo
      .createQueryBuilder('t')
      .where('t.user_id = :uid', { uid: userId })
      .andWhere('t.deleted_at IS NULL');

    if (q.search) {
      qb.andWhere('(t.user_agent ILIKE :s OR t.ip_subnet ILIKE :s)', {
        s: `%${q.search}%`,
      });
    }

    qb.orderBy(`t.${q.sortBy}`, q.sortOrder.toUpperCase() as 'ASC' | 'DESC')
      .skip(skip)
      .take(q.limit);

    const [rows, total] = await qb.getManyAndCount();

    const totalPages = Math.ceil(total / q.limit);
    const message =
      rows.length > 0
        ? await this.i18n.translate('devices.whitelist.listed', { lang })
        : await this.i18n.translate('devices.whitelist.empty', { lang });

    return {
      message,
      data: rows,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages,
        hasNextPage: q.page < totalPages,
        hasPreviousPage: q.page > 1,
      },
    };
  }

  // ------ LISTAGEM PAGINADA (BLACKLIST) ------
  @UseGuards(JwtAuthGuard)
  @Get('devices/blacklist')
  async listBlacklist(@Req() req: any, @Query() q: BlacklistListDto) {
    const userId = req.user.userId;
    const lang = I18nContext.current()?.lang;

    const skip = (q.page - 1) * q.limit;

    const qb = this.blackRepo
      .createQueryBuilder('b')
      .where('b.user_id = :uid', { uid: userId })
      .andWhere('b.deleted_at IS NULL');

    if (q.search) {
      qb.andWhere('(b.user_agent ILIKE :s OR b.ip_subnet ILIKE :s)', {
        s: `%${q.search}%`,
      });
    }

    qb.orderBy(`b.${q.sortBy}`, q.sortOrder.toUpperCase() as 'ASC' | 'DESC')
      .skip(skip)
      .take(q.limit);

    const [rows, total] = await qb.getManyAndCount();

    const totalPages = Math.ceil(total / q.limit);
    const message =
      rows.length > 0
        ? await this.i18n.translate('devices.blacklist.listed', { lang })
        : await this.i18n.translate('devices.blacklist.empty', { lang });

    return {
      message,
      data: rows,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages,
        hasNextPage: q.page < totalPages,
        hasPreviousPage: q.page > 1,
      },
    };
  }

  // ------ HISTORY (WHITELIST) ------
  @UseGuards(JwtAuthGuard)
  @Get('devices/whitelist/history')
  async listWhitelistHistory(@Req() req: any, @Query() q: WhitelistListDto) {
    const userId = req.user.userId;
    const lang = I18nContext.current()?.lang;

    const skip = (q.page - 1) * q.limit;

    const qb = this.trustedRepo
      .createQueryBuilder('t')
      .where('t.user_id = :uid', { uid: userId });

    if (q.search) {
      qb.andWhere('(t.user_agent ILIKE :s OR t.ip_subnet ILIKE :s)', {
        s: `%${q.search}%`,
      });
    }

    qb.orderBy(`t.${q.sortBy}`, q.sortOrder.toUpperCase() as 'ASC' | 'DESC')
      .skip(skip)
      .take(q.limit);

    const [rows, total] = await qb.getManyAndCount();

    const totalPages = Math.ceil(total / q.limit);
    const message =
      rows.length > 0
        ? await this.i18n.translate('devices.whitelist.history_listed', {
            lang,
          })
        : await this.i18n.translate('devices.whitelist.history_empty', {
            lang,
          });

    return {
      message,
      data: rows,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages,
        hasNextPage: q.page < totalPages,
        hasPreviousPage: q.page > 1,
      },
    };
  }

  // ------ HISTORY (BLACKLIST) ------
  @UseGuards(JwtAuthGuard)
  @Get('devices/blacklist/history')
  async listBlacklistHistory(@Req() req: any, @Query() q: BlacklistListDto) {
    const userId = req.user.userId;
    const lang = I18nContext.current()?.lang;

    const skip = (q.page - 1) * q.limit;

    const qb = this.blackRepo
      .createQueryBuilder('b')
      .where('b.user_id = :uid', { uid: userId });

    if (q.search) {
      qb.andWhere('(b.user_agent ILIKE :s OR b.ip_subnet ILIKE :s)', {
        s: `%${q.search}%`,
      });
    }

    qb.orderBy(`b.${q.sortBy}`, q.sortOrder.toUpperCase() as 'ASC' | 'DESC')
      .skip(skip)
      .take(q.limit);

    const [rows, total] = await qb.getManyAndCount();

    const totalPages = Math.ceil(total / q.limit);
    const message =
      rows.length > 0
        ? await this.i18n.translate('devices.blacklist.history_listed', {
            lang,
          })
        : await this.i18n.translate('devices.blacklist.history_empty', {
            lang,
          });

    return {
      message,
      data: rows,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages,
        hasNextPage: q.page < totalPages,
        hasPreviousPage: q.page > 1,
      },
    };
  }

  // NOVO: remover da whitelist (soft delete)
  @UseGuards(JwtAuthGuard)
  @Delete('devices/whitelist/:id')
  async removeWhitelist(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    const lang = I18nContext.current()?.lang;

    await this.trustedRepo.update(
      { id, userId, deletedAt: null as any },
      { deletedAt: () => 'NOW()' as any },
    );

    const message = await this.i18n.translate('devices.whitelist.removed', {
      lang,
    });
    return { message, ok: true };
  }

  // NOVO: remover da blacklist (soft delete)
  @UseGuards(JwtAuthGuard)
  @Delete('devices/blacklist/:id')
  async removeBlacklist(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    const lang = I18nContext.current()?.lang;

    await this.blackRepo.update(
      { id, userId, deletedAt: null as any },
      { deletedAt: () => 'NOW()' as any },
    );

    const message = await this.i18n.translate('devices.blacklist.removed', {
      lang,
    });
    return { message, ok: true };
  }

  // NOVO: restaurar da whitelist (soft delete)
  @UseGuards(JwtAuthGuard)
  @Post('devices/whitelist/:id/restore')
  async restoreWhitelist(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    const lang = I18nContext.current()?.lang;

    await this.trustedRepo.update(
      { id, userId, deletedAt: Not(IsNull()) },
      { deletedAt: null as any },
    );

    const message = await this.i18n.translate('devices.whitelist.restored', {
      lang,
    });
    return { message, ok: true };
  }

  // NOVO: restaurar da blacklist (soft delete)
  @UseGuards(JwtAuthGuard)
  @Post('devices/blacklist/:id/restore')
  async restoreBlacklist(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    const lang = I18nContext.current()?.lang;

    await this.blackRepo.update(
      { id, userId, deletedAt: Not(IsNull()) },
      { deletedAt: null as any },
    );

    const message = await this.i18n.translate('devices.blacklist.restored', {
      lang,
    });
    return { message, ok: true };
  }

  // + NOVO - API endpoint
  @Post('report-login')
  async reportLoginApi(@Body() body: { token: string }) {
    const lang = I18nContext.current()?.lang;

    try {
      const ok = await this.alerts.reportSuspiciousLogin(body.token);
      const message = ok
        ? await this.i18n.translate('devices.report.success', { lang })
        : await this.i18n.translate('devices.report.invalid_token', { lang });

      return {
        success: ok,
        message,
      };
    } catch (error) {
      const errorMessage = await this.i18n.translate('devices.report.error', {
        lang,
      });
      throw new UnauthorizedException(error.message || errorMessage);
    }
  }

  // ------------------- ALTERAR SENHA -------------------
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @UserDecorator('userId') userId: string,
    @Body() body: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const lang = I18nContext.current()?.lang;

    // Rate-limit simples por usuário (5 por 10 min)
    try {
      const count = await this.redis.incrWithTTL(
        `rl:chpwd:user:${userId}`,
        10 * 60,
      );
      if (count > 5) {
        const message = await this.i18n.translate('auth.rate_limit_exceeded', {
          lang,
        });
        throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch {}

    // Carrega senha hash atual
    const row = await this.usersRepo.findOne({
      where: { id: userId, deletedAt: null as any },
      select: { password: true } as any,
    });

    if (!row) {
      throw new UnauthorizedException(
        await this.i18n.translate('auth.user_not_found_or_deleted', { lang }),
      );
    }

    const ok = await bcrypt.compare(body.currentPassword, row.password);
    if (!ok) {
      // Erro específico é aceitável aqui (rota autenticada)
      throw new BadRequestException(
        (await this.i18n.translate('auth.invalid_credentials', { lang })) ||
          'Senha atual incorreta',
      );
    }

    // Transação única para evitar duplicação de revogação/incremento
    const hash = await bcrypt.hash(body.newPassword, 12);

    // Atualiza senha e incrementa versão do token
    await this.usersRepo
      .createQueryBuilder()
      .update(User)
      .set({
        password: hash,
        tokenVersion: () => `"token_version" + 1`,
      })
      .where({ id: userId })
      .execute();

    // Revoga todos os refresh tokens
    await this.auth.logout(userId);

    // Boa prática: limpar cookie de RT
    res.clearCookie('rt', {
      path: '/auth/refresh',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });

    return {
      message: await this.i18n.translate('auth.password_changed', { lang }),
    };
  }

  // ------------------- ATUALIZAR MEUS DADOS -------------------
  @UseGuards(JwtAuthGuard)
  @Put('me')
  async updateMe(
    @UserDecorator('userId') userId: string,
    @UserDecorator('email') currentEmail: string,
    @Body() body: UpdateMeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const lang = I18nContext.current()?.lang;

    // Rate-limit simples por usuário (10 por 10 min)
    try {
      const count = await this.redis.incrWithTTL(
        `rl:meupd:user:${userId}`,
        10 * 60,
      );
      if (count > 10) {
        const message = await this.i18n.translate('auth.rate_limit_exceeded', {
          lang,
        });
        throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch {}

    // Monta os campos permitidos (só inclui campos que foram explicitamente enviados)
    const updateData: any = {};
    if (typeof body.name !== 'undefined') updateData.name = body.name;
    if (typeof body.phone !== 'undefined') updateData.phone = body.phone;
    if (typeof body.cpf !== 'undefined') updateData.cpf = body.cpf ?? null;
    if (typeof body.cnpj !== 'undefined') updateData.cnpj = body.cnpj ?? null;
    if (typeof body.birthdate !== 'undefined')
      updateData.birthdate = body.birthdate ?? null;
    if (typeof body.postalCode !== 'undefined')
      updateData.postalCode = body.postalCode ?? null;
    if (typeof body.address !== 'undefined')
      updateData.address = body.address ?? null;
    if (typeof body.addressState !== 'undefined')
      updateData.addressState = body.addressState ?? null;
    if (typeof body.addressCity !== 'undefined')
      updateData.addressCity = body.addressCity ?? null;
    if (typeof body.addressNeighborhood !== 'undefined')
      updateData.addressNeighborhood = body.addressNeighborhood ?? null;
    if (typeof body.service !== 'undefined')
      updateData.service = body.service ?? null;

    let emailChanged = false;
    if (typeof body.email !== 'undefined') {
      const normalized = body.email.toLowerCase().trim();
      if (normalized !== (currentEmail || '').toLowerCase()) {
        // Segurança: exigir senha atual para troca de e-mail (já validado via Zod, mas rechecamos)
        if (!body.currentPassword) {
          throw new BadRequestException(
            await this.i18n.translate('validation.password.required', { lang }),
          );
        }
        // Verifica senha atual
        const row = await this.usersRepo.findOne({
          where: { id: userId, deletedAt: null as any },
          select: { password: true } as any,
        });
        if (
          !row ||
          !(await bcrypt.compare(body.currentPassword, row.password))
        ) {
          throw new BadRequestException(
            (await this.i18n.translate('auth.invalid_credentials', { lang })) ||
              'Senha atual incorreta',
          );
        }

        updateData.email = normalized;
        // UsersService.updateDynamic() já: zera emailVerifiedAt e revoga tokens
        emailChanged = true;
      }
    }

    // 👇 NOVO: sanitiza no banco/Redis e aplica update dinâmico
    const sanitized = await this.usersService.sanitizeUpdatePayload(
      updateData,
      userId,
    );
    await this.usersService.updateDynamic(userId, sanitized as any, {
      requesterId: userId,
    });

    // Se e-mail mudou, dispara verificação + limpa cookie (mantém seu fluxo atual)
    if (emailChanged && body.email) {
      const ip =
        (req.ips?.[0] ?? req.ip) || req.connection.remoteAddress || 'unknown';
      const ua = req.headers['user-agent'] || '';
      const subnet = ipToSubnet(ip);
      await this.alerts.sendEmailVerification(userId, body.email, subnet, ua);
      res.clearCookie('rt', {
        path: '/auth/refresh',
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
      });
    }

    // 👇 NOVO: retorna o perfil com SELECT dinâmico
    const { data: meSafe } = await this.usersService.findOneDynamic(userId);

    return {
      message: await this.i18n.translate('users.updated', { lang }),
      data: meSafe,
    };
  }

  // Opcional: bloquear por e-mail quando não há userId
  @UseGuards(JwtAuthGuard)
  @Put('block-by-email')
  @Authz('users.block_access')
  async blockByEmail(
    @Body() body: { email: string; reason?: string; until?: string | null },
    @UserDecorator('userId') adminId: string,
  ) {
    const info = {
      blockedAt: new Date().toISOString(),
      blockedBy: adminId,
      reason: body.reason,
      until: body.until ?? null,
    };
    await this.blocks.blockByEmail(body.email, info);
    return {
      message: 'Conta bloqueada por e-mail (flag no Redis).',
      data: { email: body.email, ...info },
    };
  }

  // Desbloquear por e-mail
  @UseGuards(JwtAuthGuard)
  @Delete('block-by-email')
  @Authz('users.unblock_access')
  async unblockByEmail(
    @Query('email') email: string,
    @UserDecorator('userId') adminId: string,
  ) {
    const lang = I18nContext.current()?.lang;
    await this.blocks.unblockByEmail(email, adminId);
    return {
      message: await this.i18n.translate('auth.email_block_removed', { lang }),
      data: { email },
    };
  }

  // ------ LISTAR BLOQUEIOS ATIVOS ------
  @UseGuards(JwtAuthGuard)
  @Get('blocks')
  @Authz('users.block_access')
  async listBlocks(@Query() q: BlocksListDto) {
    const lang = I18nContext.current()?.lang;
    const { data, pagination } = await this.blocks.listBlocks(q);
    return {
      message: data.length
        ? await this.i18n.translate('auth.blocks_listed', { lang })
        : await this.i18n.translate('auth.blocks_empty', { lang }),
      data,
      pagination,
    };
  }

  // ------ HISTÓRICO/AUDITORIA ------
  @UseGuards(JwtAuthGuard)
  @Get('blocks/history')
  @Authz('users.block_access')
  async listBlockHistory(@Query() q: BlocksHistoryListDto) {
    const lang = I18nContext.current()?.lang;
    const { data, pagination } = await this.blocks.listHistory(q);
    return {
      message: data.length
        ? await this.i18n.translate('auth.blocks_history_listed', { lang })
        : await this.i18n.translate('auth.blocks_history_empty', { lang }),
      data,
      pagination,
    };
  }
}
