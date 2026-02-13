import {
  Injectable,
  UnauthorizedException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../administration/users/users.service';
import * as bcrypt from 'bcryptjs';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { SecurityAlertsService } from './security-alerts.service';
import { AccountBlockService } from './account-block.service';
import { addTTLToDate } from './utils/ttl-parser';
import * as crypto from 'node:crypto';
import { createHash } from 'node:crypto';
import { ipToSubnet, deviceHash } from './utils/ip.util';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RefreshToken } from './refresh-token.entity';
import { User } from '../administration/users/user.entity';
import { BlacklistedDevice } from './blacklisted-device.entity';
import { TrustedDevice } from './trusted-device.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private jwt: JwtService,
    private usersService: UsersService,
    private i18n: I18nService,
    private alerts: SecurityAlertsService,
    private blocks: AccountBlockService,
    private dataSource: DataSource,
    @InjectRepository(RefreshToken) private rtRepo: Repository<RefreshToken>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(BlacklistedDevice)
    private blRepo: Repository<BlacklistedDevice>,
    @InjectRepository(TrustedDevice) private wlRepo: Repository<TrustedDevice>,
  ) {}

  private getLang() {
    return I18nContext.current()?.lang;
  }

  private async signAccessToken(user: {
    id: string;
    email: string;
    tokenVersion: number;
  }) {
    return this.jwt.signAsync(
      { sub: user.id, email: user.email, vs: user.tokenVersion },
      {
        secret: process.env.ACCESS_TOKEN_SECRET,
        expiresIn: process.env.ACCESS_TOKEN_TTL || '15m',
      },
    );
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findUserForAuth(email);
    if (!user) return null;
    const ok = await bcrypt.compare(password, (user as any).password);
    return ok ? user : null;
  }

  async login(
    email: string,
    password: string,
    reqId?: string,
    ip?: string,
    ua?: string,
  ) {
    const lang = this.getLang();
    const normalizedEmail = email.toLowerCase().trim();

    // 1) block por e-mail
    const adminBlockByEmail =
      await this.blocks.getBlockByEmail(normalizedEmail);
    if (adminBlockByEmail) {
      const when = new Date(adminBlockByEmail.blockedAt).toLocaleString(
        'pt-BR',
      );
      const msg =
        (await this.i18n.translate('auth.account_blocked', { lang })) ||
        `Conta bloqueada em ${when}.`;
      throw new ForbiddenException(msg);
    }

    const subnet = ipToSubnet(ip);
    const uaSafe = ua ?? '';
    const devHash = deviceHash(subnet, uaSafe);

    const existingUser =
      await this.usersService.findUserForAuth(normalizedEmail);
    if (existingUser) {
      // 1b) block por userId
      const adminBlockByUser = await this.blocks.getBlockByUser(
        existingUser.id,
      );
      if (adminBlockByUser) {
        const when = new Date(adminBlockByUser.blockedAt).toLocaleString(
          'pt-BR',
        );
        const msg =
          (await this.i18n.translate('auth.account_blocked', { lang })) ||
          `Conta bloqueada em ${when}.`;
        throw new ForbiddenException(msg);
      }
      // blacklist
      const blocked = await this.blRepo.findOne({
        where: {
          userId: existingUser.id,
          deviceHash: devHash,
          deletedAt: null as any,
        },
        select: { id: true } as any,
      });
      if (blocked) {
        throw new ForbiddenException(
          await this.i18n.translate('auth.device_blocked', { lang }),
        );
      }
    }

    const user = await this.validateUser(normalizedEmail, password);
    if (!user) {
      const emailHash = createHash('sha256')
        .update(email.toLowerCase().trim())
        .digest('hex')
        .substring(0, 8);

      this.logger.warn(
        JSON.stringify({
          event: 'login_failed',
          emailHash,
          reqId,
          ip,
          timestamp: new Date().toISOString(),
        }),
      );
      throw new UnauthorizedException(
        await this.i18n.translate('auth.invalid_credentials', { lang }),
      );
    }

    if (!(user as any).emailVerifiedAt) {
      try {
        await this.alerts.sendEmailVerification(
          user.id,
          user.email,
          subnet,
          uaSafe,
        );
      } catch (e: any) {
        this.logger.warn(`sendEmailVerification falhou: ${e?.message || e}`);
      }
      // Mesmo que o e-mail falhe, mantemos a regra de exigir verificação
      throw new ForbiddenException(
        await this.i18n.translate('auth.email_not_verified', { lang }),
      );
    }

    const trust = await this.alerts.isTrustedDevice(user.id, subnet, uaSafe);
    if (!trust.trusted) {
      let dbg: any = null;
      try {
        const sent = await this.alerts.sendNewDeviceApproval(
          user.id,
          user.email,
          subnet,
          uaSafe,
        );
        if (process.env.NODE_ENV !== 'production') dbg = sent || null;
      } catch (e: any) {
        this.logger.warn(`sendNewDeviceApproval falhou: ${e?.message || e}`);
      }
      const msg = await this.i18n.translate(
        'auth.new_device_verification_required',
        { lang },
      );
      if (process.env.NODE_ENV !== 'production') {
        throw new ForbiddenException({
          message: msg,
          code: 'NEW_DEVICE',
          debug: dbg,
        });
      }
      throw new ForbiddenException(msg);
    }

    let newPlainRT = '';
    let updatedUser!: { id: string; email: string; tokenVersion: number };

    // Transação atômica
    await this.dataSource.transaction(async (manager) => {
      // revoga TODOS os RTs anteriores
      await manager
        .getRepository(RefreshToken)
        .update({ userId: user.id, revoked: false }, { revoked: true });
      // incrementa versão
      const inc = await manager
        .getRepository(User)
        .createQueryBuilder()
        .update(User)
        .set({ tokenVersion: () => `"token_version" + 1` })
        .where({ id: user.id })
        .returning(['id', 'email', 'token_version'])
        .execute();

      const row = inc.raw?.[0];
      updatedUser = {
        id: row?.id ?? user.id,
        email: row?.email ?? user.email,
        tokenVersion: row?.token_version ?? (user as any).tokenVersion + 1,
      };

      // cria novo RT
      const id = crypto.randomUUID();
      const secret = crypto.randomUUID();
      const tokenHash = await bcrypt.hash(secret, 12);
      const ttl = process.env.REFRESH_TOKEN_TTL || '7d';
      const expiresAt = addTTLToDate(ttl);

      await manager.getRepository(RefreshToken).insert({
        id,
        userId: user.id,
        tokenHash,
        deviceHash: trust.devHash,
        expiresAt,
        revoked: false,
      });

      newPlainRT = `${id}.${secret}`;
    });

    const accessToken = await this.signAccessToken(updatedUser);
    const refreshToken = newPlainRT;

    this.logger.log(
      JSON.stringify({
        event: 'login_success',
        userId: user.id,
        email,
        reqId,
        ip,
        timestamp: new Date().toISOString(),
      }),
    );

    // Atualiza lastSeen do trusted device
    await this.wlRepo
      .createQueryBuilder()
      .update(TrustedDevice)
      .set({ lastSeen: () => 'NOW()' })
      .where({ userId: user.id, deviceHash: trust.devHash })
      .execute();

    const message = await this.i18n.translate('auth.login_success', { lang });
    const publicUser = { ...user } as any;
    delete publicUser.password;
    return { message, data: { user: publicUser, accessToken, refreshToken } };
  }

  async refresh(providedRt: string, reqId?: string, ip?: string, ua?: string) {
    const lang = this.getLang();
    if (!providedRt) {
      throw new UnauthorizedException(
        await this.i18n.translate('auth.missing_refresh', { lang }),
      );
    }

    const [id, secret] = providedRt.split('.');
    if (!id || !secret) {
      throw new UnauthorizedException(
        await this.i18n.translate('auth.refresh_invalid', { lang }),
      );
    }

    const token = await this.rtRepo.findOne({ where: { id } });
    if (!token || token.expiresAt < new Date()) {
      throw new UnauthorizedException(
        await this.i18n.translate('auth.refresh_invalid', { lang }),
      );
    }
    if (token.revoked) {
      // revoga o resto por segurança
      await this.rtRepo.update(
        { userId: token.userId, revoked: false },
        { revoked: true },
      );
      throw new UnauthorizedException(
        await this.i18n.translate('auth.refresh_invalid', { lang }),
      );
    }

    const ok = await bcrypt.compare(secret, token.tokenHash);
    if (!ok) {
      throw new UnauthorizedException(
        await this.i18n.translate('auth.refresh_invalid', { lang }),
      );
    }

    const user = await this.usersRepo.findOne({
      where: { id: token.userId, deletedAt: null as any },
    });
    if (!user) {
      throw new UnauthorizedException(
        await this.i18n.translate('auth.refresh_invalid', { lang }),
      );
    }

    // admin block corta refresh
    const adminBlock = await this.blocks.getBlockByUser(user.id);
    if (adminBlock) {
      await this.rtRepo.update(
        { userId: user.id, revoked: false },
        { revoked: true },
      );
      throw new ForbiddenException(
        (await this.i18n.translate('auth.account_blocked', { lang })) ||
          'Conta bloqueada.',
      );
    }

    const subnet = ipToSubnet(ip);
    const uaSafe = ua ?? '';
    const trust = await this.alerts.isTrustedDevice(user.id, subnet, uaSafe);

    const blocked = await this.blRepo.findOne({
      where: {
        userId: user.id,
        deviceHash: trust.devHash,
        deletedAt: null as any,
      },
      select: { id: true } as any,
    });
    if (blocked) {
      await this.rtRepo.update(
        { userId: user.id, revoked: false },
        { revoked: true },
      );
      throw new ForbiddenException(
        await this.i18n.translate('auth.device_blocked', { lang }),
      );
    }

    if ((token as any).deviceHash !== trust.devHash) {
      this.logger.warn(
        JSON.stringify({
          event: 'refresh_device_mismatch',
          userId: user.id,
          tokenDeviceHash: (token as any).deviceHash,
          currentDeviceHash: trust.devHash,
          reqId,
          ip,
          timestamp: new Date().toISOString(),
        }),
      );
      await this.rtRepo.update(
        { userId: user.id, revoked: false },
        { revoked: true },
      );
      throw new UnauthorizedException(
        await this.i18n.translate('auth.refresh_invalid', { lang }),
      );
    }

    if (!trust.trusted) {
      let dbg: any = null;
      try {
        const sent = await this.alerts.sendNewDeviceApproval(
          user.id,
          user.email,
          subnet,
          uaSafe,
        );
        if (process.env.NODE_ENV !== 'production') dbg = sent || null;
      } catch (e: any) {
        this.logger.warn(
          `sendNewDeviceApproval (refresh) falhou: ${e?.message || e}`,
        );
      }
      const msg = await this.i18n.translate(
        'auth.new_device_verification_required',
        { lang },
      );
      if (process.env.NODE_ENV !== 'production') {
        throw new ForbiddenException({
          message: msg,
          code: 'NEW_DEVICE',
          debug: dbg,
        });
      }
      throw new ForbiddenException(msg);
    }

    // rotação atômica
    const newPlain = await this.dataSource.transaction(async (manager) => {
      const newId = crypto.randomUUID();
      const newSecret = crypto.randomUUID();
      const newTokenHash = await bcrypt.hash(newSecret, 12);
      const ttl = process.env.REFRESH_TOKEN_TTL || '7d';
      const expiresAt = addTTLToDate(ttl);

      const revoke = await manager
        .getRepository(RefreshToken)
        .createQueryBuilder()
        .update(RefreshToken)
        .set({ revoked: true, replacedById: newId })
        .where('id = :id AND revoked = :rv', { id, rv: false })
        .execute();

      if ((revoke.affected ?? 0) !== 1) {
        throw new UnauthorizedException(
          await this.i18n.translate('auth.refresh_invalid', { lang }),
        );
      }

      await manager.getRepository(RefreshToken).insert({
        id: newId,
        userId: token.userId,
        tokenHash: newTokenHash,
        deviceHash: (token as any).deviceHash,
        expiresAt,
        revoked: false,
      });

      return `${newId}.${newSecret}`;
    });

    this.logger.log(
      JSON.stringify({
        event: 'token_refreshed',
        userId: user.id,
        oldTokenId: id,
        reqId,
        ip,
        timestamp: new Date().toISOString(),
      }),
    );

    await this.wlRepo
      .createQueryBuilder()
      .update(TrustedDevice)
      .set({ lastSeen: () => 'NOW()' })
      .where({ userId: user.id, deviceHash: trust.devHash })
      .execute();

    const accessToken = await this.signAccessToken({
      id: user.id,
      email: user.email,
      tokenVersion: (user as any).tokenVersion,
    });

    const message = await this.i18n.translate('auth.token_refreshed', { lang });
    return { message, data: { accessToken, refreshToken: newPlain } };
  }

  async logout(
    userId: string,
    providedRt?: string,
    reqId?: string,
    ip?: string,
  ) {
    const lang = this.getLang();

    if (providedRt) {
      const [id] = providedRt.split('.');
      if (id) {
        await this.rtRepo.update(
          { id, userId, revoked: false },
          { revoked: true },
        );
      }
    } else {
      await this.rtRepo.update({ userId, revoked: false }, { revoked: true });
    }

    await this.usersRepo
      .createQueryBuilder()
      .update(User)
      .set({ tokenVersion: () => `"token_version" + 1` })
      .where({ id: userId })
      .execute();

    this.logger.log(
      JSON.stringify({
        event: 'logout',
        userId,
        tokenId: providedRt ? providedRt.split('.')[0] : 'all',
        reqId,
        ip,
        timestamp: new Date().toISOString(),
      }),
    );

    const message = await this.i18n.translate('auth.logged_out', { lang });
    return { message };
  }

  // Housekeeping
  async cleanupExpiredTokens() {
    const res = await this.rtRepo
      .createQueryBuilder()
      .delete()
      .from(RefreshToken)
      .where('expires_at < NOW()')
      .execute();
    return res.affected ?? 0;
  }
}
