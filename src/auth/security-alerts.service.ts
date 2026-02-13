import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../_common/redis/redis.service';
import { MailService } from '../_common/mail/mail.service';
import * as crypto from 'node:crypto';
import { createHash } from 'node:crypto';
import { parseTTL } from './utils/ttl-parser';
import { deviceHash } from './utils/ip.util';
import * as bcrypt from 'bcryptjs';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import { User } from '../administration/users/user.entity';
import { RefreshToken } from './refresh-token.entity';
import { TrustedDevice } from './trusted-device.entity';
import { BlacklistedDevice } from './blacklisted-device.entity';

type UnlockPayload = {
  typ: 'login_unlock';
  email: string;
  emailKeyHash: string;
  ipKeyHash?: string; // << novo
  jti: string;
};

// NOVO payload
type SuspiciousLoginPayload = {
  typ: 'login_report';
  email: string;
  emailKeyHash: string;
  ipKeyHash?: string;
  subnet?: string;
  ua?: string;
  jti: string;
};

// NOVO
type VerifyPayload = {
  typ: 'email_verify';
  uid: string; // user id
  email: string;
  jti: string;
  // NOVO: para pré-aprovar o device que tentou logar
  devHash?: string;
  subnet?: string;
  ua?: string;
};

// NOVO: aprovação de novo dispositivo
type DeviceApprovePayload = {
  typ: 'device_approve';
  uid: string;
  email: string;
  subnet: string;
  ua: string;
  devHash: string;
  jti: string;
};

// NOVO payload
type DeviceRejectPayload = {
  typ: 'device_reject';
  uid: string;
  email: string;
  subnet: string;
  ua: string;
  devHash: string;
  jti: string;
};

type PasswordResetPayload = {
  typ: 'pwd_reset';
  uid: string;
  email: string;
  jti: string;
};

@Injectable()
export class SecurityAlertsService {
  private readonly logger = new Logger(SecurityAlertsService.name);

  constructor(
    private jwt: JwtService,
    private redis: RedisService,
    private mail: MailService,
    private dataSource: DataSource,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(TrustedDevice)
    private readonly trustedDeviceRepo: Repository<TrustedDevice>,
    @InjectRepository(BlacklistedDevice)
    private readonly blacklistedDeviceRepo: Repository<BlacklistedDevice>,
  ) {}

  async sendLoginUnlock(
    email: string,
    emailKeyHash: string,
    ipKeyHash?: string,
    subnet?: string, // + NOVO
    ua?: string, // + NOVO
  ) {
    const jti = crypto.randomUUID();
    const token = await this.jwt.signAsync(
      {
        typ: 'login_unlock',
        email,
        emailKeyHash,
        ipKeyHash,
        jti,
      } as UnlockPayload,
      {
        secret: process.env.EMAIL_TOKEN_SECRET!,
        expiresIn: process.env.EMAIL_TOKEN_TTL || '15m',
      },
    );

    // + NOVO: token "não fui eu"
    const jtiReport = crypto.randomUUID();
    const reportToken = await this.jwt.signAsync(
      {
        typ: 'login_report',
        email,
        emailKeyHash,
        ipKeyHash,
        subnet,
        ua,
        jti: jtiReport,
      } as SuspiciousLoginPayload,
      {
        secret: process.env.EMAIL_TOKEN_SECRET!,
        expiresIn: process.env.EMAIL_TOKEN_TTL || '15m',
      },
    );

    const base = process.env.APP_WEB_URL?.replace(/\/+$/, '') || '';
    const unlockUrl = `${base}/unlock#t=${encodeURIComponent(token)}`;
    const blockUrl = `${base}/report-login#t=${encodeURIComponent(reportToken)}`;

    this.logger.log(`[LOGIN_UNLOCK] Tentando enviar email para: ${email}`);
    this.logger.log(`[LOGIN_UNLOCK] URLs geradas - Unlock: ${unlockUrl}`);
    this.logger.log(`[LOGIN_UNLOCK] URLs geradas - Block: ${blockUrl}`);

    try {
      await this.mail.sendLoginUnlockEmail(email, unlockUrl, blockUrl);
      this.logger.log(
        `[LOGIN_UNLOCK] Email enviado com sucesso para: ${email}`,
      );
    } catch (error) {
      this.logger.error(
        `[LOGIN_UNLOCK] Erro ao enviar email para ${email}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Valida o token e limpa lock+contadores.
   * Retorna true se desbloqueou algo.
   */
  async unlockLogin(token: string): Promise<boolean> {
    let payload: UnlockPayload;
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: process.env.EMAIL_TOKEN_SECRET!,
      });
      if (payload.typ !== 'login_unlock') throw new Error('invalid type');
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    // uso único
    const usedKey = `unlock:jti:${payload.jti}`;
    if (await this.redis.get(usedKey)) {
      throw new UnauthorizedException('Token já utilizado');
    }
    await this.redis.set(usedKey, '1', 60 * 60);

    // chaves por e-mail (do payload)
    const emailCnt = `rl:login:cnt:${payload.emailKeyHash}`;
    const emailLock = `rl:login:lock:${payload.emailKeyHash}`;

    // chaves por IP (se vier no token)
    const ipCnt = payload.ipKeyHash
      ? `rl:login:cnt:${payload.ipKeyHash}`
      : undefined;
    const ipLock = payload.ipKeyHash
      ? `rl:login:lock:${payload.ipKeyHash}`
      : undefined;

    // HARDENING: também tenta limpar uma possível chave antiga calculada do e-mail diretamente
    const legacyHash = createHash('sha256')
      .update(`login:email:${payload.email.toLowerCase()}`)
      .digest('hex');
    const legacyCnt = `rl:login:cnt:${legacyHash}`;
    const legacyLock = `rl:login:lock:${legacyHash}`;

    const results = await Promise.all([
      this.redis.del(emailCnt),
      this.redis.del(emailLock),
      ...(ipCnt ? [this.redis.del(ipCnt)] : []),
      ...(ipLock ? [this.redis.del(ipLock)] : []),
      this.redis.del(legacyCnt),
      this.redis.del(legacyLock),
      // opcional: remover dedupe de e-mail para permitir reenviar alerta
      this.redis.del(`rl:login:mailsent:${payload.emailKeyHash}`),
    ]);

    const removed = results.reduce((a, b) => a + (b || 0), 0);
    this.logger.log(
      `unlockLogin: removed ${removed} keys for ${payload.email}`,
    );
    return removed > 0;
  }

  // + NOVO: tratar o clique em "Não fui eu"
  async reportSuspiciousLogin(token: string): Promise<boolean> {
    let payload: SuspiciousLoginPayload;
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: process.env.EMAIL_TOKEN_SECRET!,
      });
      if (payload.typ !== 'login_report') throw new Error('invalid type');
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    // uso único
    const usedKey = `loginreport:jti:${payload.jti}`;
    if (await this.redis.get(usedKey)) {
      throw new UnauthorizedException('Token já utilizado');
    }
    await this.redis.set(usedKey, '1', 60 * 60);

    // tente localizar o usuário; se não existir, finaliza de forma silenciosa (sem enumeration)
    const normalizedEmail = payload.email.toLowerCase().trim();
    const user = await this.userRepo.findOne({
      where: { email: normalizedEmail, deletedAt: IsNull() },
      select: { id: true } as any,
    });
    if (!user) return true;

    // se temos dados do dispositivo, coloca em blacklist e remove da whitelist
    if (payload.subnet && payload.ua) {
      const devHash = deviceHash(payload.subnet, payload.ua);
      await this.trustedDeviceRepo.update(
        { userId: user.id, deviceHash: devHash, deletedAt: IsNull() } as any,
        { deletedAt: new Date() } as any,
      );
      await this.blacklistedDeviceRepo.upsert(
        {
          userId: user.id,
          deviceHash: devHash,
          userAgent: payload.ua,
          ipSubnet: payload.subnet,
          deletedAt: null,
        } as any,
        { conflictPaths: ['userId', 'deviceHash'] as any },
      );
    }

    // hardening: revoga todos os RTs e incrementa versão para matar ATs
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(RefreshToken)
        .update(
          { userId: user.id, revoked: false } as any,
          { revoked: true } as any,
        );
      await manager
        .getRepository(User)
        .increment({ id: user.id }, 'tokenVersion', 1);
    });

    // (opcional) disparar e-mail de redefinição:
    // await this.sendPasswordReset(payload.email);

    return true;
  }

  // ============= VERIFICAÇÃO DE E-MAIL =============

  async sendEmailVerification(
    userId: string,
    email: string,
    subnet?: string,
    ua?: string,
  ) {
    const jti = crypto.randomUUID();
    const devHash = subnet && ua ? deviceHash(subnet, ua) : undefined;

    const token = await this.jwt.signAsync(
      {
        typ: 'email_verify',
        uid: userId,
        email,
        jti,
        devHash,
        subnet,
        ua,
      } as VerifyPayload,
      {
        secret: process.env.EMAIL_TOKEN_SECRET!,
        expiresIn: process.env.EMAIL_TOKEN_TTL || '15m',
      },
    );

    // (opcional) dedupe por usuário+device p/ permitir e-mails de devices diferentes
    const ttlSec = Math.ceil(
      parseTTL(process.env.EMAIL_TOKEN_TTL || '15m') / 1000,
    );
    const dedupeKey = `emailverify:mailsent:${userId}:${devHash ?? 'none'}`;
    const existingDedupe = await this.redis.get(dedupeKey);

    if (!existingDedupe) {
      const base = process.env.APP_WEB_URL?.replace(/\/+$/, '') || '';
      const verifyUrl = `${base}/verify#t=${encodeURIComponent(token)}`;

      this.logger.log(
        `[EMAIL_VERIFICATION] Tentando enviar email para: ${email} (userId: ${userId})`,
      );
      this.logger.log(`[EMAIL_VERIFICATION] URL gerada: ${verifyUrl}`);

      try {
        await this.mail.sendEmailVerificationEmail(email, verifyUrl);
        await this.redis.set(dedupeKey, '1', ttlSec);
        this.logger.log(
          `[EMAIL_VERIFICATION] Email enviado com sucesso para: ${email}`,
        );
      } catch (error) {
        this.logger.error(
          `[EMAIL_VERIFICATION] Erro ao enviar email para ${email}:`,
          error,
        );
        throw error;
      }
    } else {
      this.logger.log(
        `[EMAIL_VERIFICATION] Email já enviado recentemente para userId: ${userId}, pulando envio`,
      );
    }
  }

  async verifyEmail(token: string): Promise<boolean> {
    let payload: VerifyPayload;
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: process.env.EMAIL_TOKEN_SECRET!,
      });
      if (payload.typ !== 'email_verify') throw new Error('invalid type');
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    const usedKey = `verify:jti:${payload.jti}`;
    if (await this.redis.get(usedKey)) {
      throw new UnauthorizedException('Token já utilizado');
    }
    await this.redis.set(usedKey, '1', 60 * 60);

    // Verifica se o e-mail atual do usuário ainda é o mesmo do token
    const user = await this.userRepo.findOne({
      where: { id: payload.uid, deletedAt: IsNull() },
      select: { email: true } as any,
    });
    if (!user || user.email.toLowerCase() !== payload.email.toLowerCase()) {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    // marca e-mail como verificado (apenas se não estiver soft-deleted)
    const updateRes = await this.userRepo.update(
      {
        id: payload.uid,
        deletedAt: IsNull(),
        email: payload.email.toLowerCase(),
      } as any,
      { emailVerifiedAt: new Date() } as any,
    );
    if (!updateRes.affected) {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    // NOVO: se o token traz devHash, aprove o device automaticamente
    if (payload.devHash) {
      await this.trustedDeviceRepo.upsert(
        {
          userId: payload.uid,
          deviceHash: payload.devHash,
          lastSeen: new Date(),
          userAgent: payload.ua ?? '',
          ipSubnet: payload.subnet ?? '',
          deletedAt: null,
        } as any,
        { conflictPaths: ['userId', 'deviceHash'] as any },
      );

      // limpa dedupe do e-mail de "novo device", caso tenha sido enviado também
      await this.redis.del(
        `deviceapprove:mailsent:${payload.uid}:${payload.devHash}`,
      );
    }

    // permite futuros reenvios de verificação
    await this.redis.del(`emailverify:mailsent:${payload.uid}:none`);

    this.logger.log(
      `Email verified for user ${payload.uid} (${payload.email})`,
    );
    return true;
  }

  // ============= NOVO DISPOSITIVO/IP =============
  async isTrustedDevice(userId: string, subnet: string, ua: string) {
    const devHash = deviceHash(subnet, ua);
    const found = await this.trustedDeviceRepo.findOne({
      where: { userId, deviceHash: devHash, deletedAt: IsNull() } as any,
      select: { id: true } as any,
    });
    return { trusted: !!found, devHash };
  }

  async sendNewDeviceApproval(
    userId: string,
    email: string,
    subnet: string,
    ua: string,
  ): Promise<{ approveUrl: string; blockUrl: string; devHash: string } | void> {
    const devHash = deviceHash(subnet, ua);
    const ttlSec = Math.ceil(
      parseTTL(process.env.EMAIL_TOKEN_TTL || '15m') / 1000,
    );
    const dedupeKey = `deviceapprove:mailsent:${userId}:${devHash}`;
    if (await this.redis.get(dedupeKey)) return;

    const jtiApprove = crypto.randomUUID();
    const approveToken = await this.jwt.signAsync(
      {
        typ: 'device_approve',
        uid: userId,
        email,
        subnet,
        ua,
        devHash,
        jti: jtiApprove,
      } as DeviceApprovePayload,
      {
        secret: process.env.EMAIL_TOKEN_SECRET!,
        expiresIn: process.env.EMAIL_TOKEN_TTL || '15m',
      },
    );

    const jtiReject = crypto.randomUUID();
    const rejectToken = await this.jwt.signAsync(
      {
        typ: 'device_reject',
        uid: userId,
        email,
        subnet,
        ua,
        devHash,
        jti: jtiReject,
      } as DeviceRejectPayload,
      {
        secret: process.env.EMAIL_TOKEN_SECRET!,
        expiresIn: process.env.EMAIL_TOKEN_TTL || '15m',
      },
    );

    const base = process.env.APP_WEB_URL?.replace(/\/+$/, '') || '';
    const approveUrl = `${base}/approve-device#t=${encodeURIComponent(approveToken)}`;
    const blockUrl = `${base}/reject-device#t=${encodeURIComponent(rejectToken)}`;

    this.logger.log(
      `[NEW_DEVICE] Tentando enviar email para: ${email} (userId: ${userId})`,
    );
    this.logger.log(`[NEW_DEVICE] Device info - Subnet: ${subnet}, UA: ${ua}`);
    this.logger.log(`[NEW_DEVICE] URLs geradas - Approve: ${approveUrl}`);
    this.logger.log(`[NEW_DEVICE] URLs geradas - Reject: ${blockUrl}`);

    try {
      await this.mail.sendNewDeviceApprovalEmail(
        email,
        approveUrl,
        blockUrl,
        subnet,
        ua,
      );
      await this.redis.set(dedupeKey, '1', ttlSec);
      this.logger.log(`[NEW_DEVICE] Email enviado com sucesso para: ${email}`);
    } catch (error) {
      this.logger.error(
        `[NEW_DEVICE] Erro ao enviar email para ${email}:`,
        error,
      );
      throw error;
    }

    return { approveUrl, blockUrl, devHash };
  }

  async approveDevice(token: string): Promise<boolean> {
    let payload: DeviceApprovePayload;
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: process.env.EMAIL_TOKEN_SECRET!,
      });
      if (payload.typ !== 'device_approve') throw new Error('invalid type');
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    const usedKey = `deviceapprove:jti:${payload.jti}`;
    if (await this.redis.get(usedKey)) {
      throw new UnauthorizedException('Token já utilizado');
    }
    await this.redis.set(usedKey, '1', 60 * 60);

    // Upsert como confiável (reativa se estava soft-deleted)
    await this.trustedDeviceRepo.upsert(
      {
        userId: payload.uid,
        deviceHash: payload.devHash,
        lastSeen: new Date(),
        userAgent: payload.ua,
        ipSubnet: payload.subnet,
        deletedAt: null,
      } as any,
      { conflictPaths: ['userId', 'deviceHash'] as any },
    );

    // limpa dedupe para permitir novos e-mails futuramente
    await this.redis.del(
      `deviceapprove:mailsent:${payload.uid}:${payload.devHash}`,
    );

    this.logger.log(
      `Device approved for user ${payload.uid} (${payload.subnet})`,
    );
    return true;
  }

  // NOVO: rejeitar dispositivo => blacklist + remove whitelist
  async rejectDevice(token: string): Promise<boolean> {
    let payload: DeviceRejectPayload;
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: process.env.EMAIL_TOKEN_SECRET!,
      });
      if (payload.typ !== 'device_reject') throw new Error('invalid type');
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    const usedKey = `devreject:jti:${payload.jti}`;
    if (await this.redis.get(usedKey)) {
      throw new UnauthorizedException('Token já utilizado');
    }
    await this.redis.set(usedKey, '1', 60 * 60);

    // 1) remove se por acaso estava na whitelist (soft delete)
    await this.trustedDeviceRepo.update(
      {
        userId: payload.uid,
        deviceHash: payload.devHash,
        deletedAt: IsNull(),
      } as any,
      { deletedAt: new Date() } as any,
    );

    // 2) inclui na blacklist (idempotente via unique, soft delete se existir)
    await this.blacklistedDeviceRepo.upsert(
      {
        userId: payload.uid,
        deviceHash: payload.devHash,
        userAgent: payload.ua,
        ipSubnet: payload.subnet,
        deletedAt: null,
      } as any,
      { conflictPaths: ['userId', 'deviceHash'] as any },
    );

    // 3) Revoga todas as sessões ativas (como no reportSuspiciousLogin)
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(RefreshToken)
        .update(
          { userId: payload.uid, revoked: false } as any,
          { revoked: true } as any,
        );
      await manager
        .getRepository(User)
        .increment({ id: payload.uid }, 'tokenVersion', 1);
    });

    this.logger.warn(
      `Device REJECTED and blacklisted for user ${payload.uid} (${payload.subnet})`,
    );
    // permitir novos e-mails no futuro para esse device
    await this.redis.del(
      `deviceapprove:mailsent:${payload.uid}:${payload.devHash}`,
    );
    return true;
  }

  // ============= RESET DE SENHA =============

  async sendPasswordReset(email: string) {
    // Normaliza o e-mail
    const normalizedEmail = email.toLowerCase().trim();

    // não revela existência do e-mail (user enumeration safe)
    const user = await this.userRepo.findOne({
      where: { email: normalizedEmail, deletedAt: IsNull() },
      select: { id: true, email: true } as any,
    });

    if (!user) {
      return; // silencia
    }

    console.log(
      `[PASSWORD_RESET] Usuário encontrado: ID=${user.id}, Email=${user.email}`,
    );

    const jti = crypto.randomUUID();

    const token = await this.jwt.signAsync(
      {
        typ: 'pwd_reset',
        uid: user.id,
        email: user.email,
        jti,
      } as PasswordResetPayload,
      {
        secret:
          process.env.PASSWORD_RESET_SECRET || process.env.EMAIL_TOKEN_SECRET!,
        expiresIn:
          process.env.PASSWORD_RESET_TTL ||
          process.env.EMAIL_TOKEN_TTL ||
          '15m',
      },
    );

    const ttlMs = parseTTL(
      process.env.PASSWORD_RESET_TTL || process.env.EMAIL_TOKEN_TTL || '15m',
    );
    const ttlSec = Math.ceil(ttlMs / 1000);

    // dedupe simples por usuário (evita spam)
    const dedupeKey = `pwdreset:mailsent:${user.id}`;
    const existingDedupe = await this.redis.get(dedupeKey);
    if (existingDedupe) {
      console.log(
        `[PASSWORD_RESET] Email já enviado recentemente para usuário ${user.id}`,
      );
      return;
    }

    const base = process.env.APP_WEB_URL?.replace(/\/+$/, '') || '';
    const resetUrl = `${base}/reset#t=${encodeURIComponent(token)}`;

    this.logger.log(
      `[PASSWORD_RESET] Tentando enviar email para: ${user.email} (userId: ${user.id})`,
    );
    this.logger.log(`[PASSWORD_RESET] URL gerada: ${resetUrl}`);

    try {
      await this.mail.sendPasswordResetEmail(user.email, resetUrl);
      await this.redis.set(dedupeKey, '1', ttlSec);

      this.logger.log(
        `[PASSWORD_RESET] Email enviado com sucesso para: ${user.email}`,
      );
    } catch (error) {
      this.logger.error(
        `[PASSWORD_RESET] Erro ao enviar email para ${user.email}:`,
        error,
      );
      throw error;
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    let payload: PasswordResetPayload;
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret:
          process.env.PASSWORD_RESET_SECRET || process.env.EMAIL_TOKEN_SECRET!,
      });
      if (payload.typ !== 'pwd_reset') throw new Error('invalid type');
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    // uso único por jti
    const usedKey = `pwdreset:jti:${payload.jti}`;
    if (await this.redis.get(usedKey)) {
      throw new UnauthorizedException('Token já utilizado');
    }
    await this.redis.set(usedKey, '1', 60 * 60);

    const user = await this.userRepo.findOne({
      where: { id: payload.uid, deletedAt: IsNull() },
      select: { id: true } as any,
    });
    if (!user) {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    const hash = await bcrypt.hash(newPassword, 12);

    // Transação: troca a senha, incrementa a versão (mata AT), revoga todos RTs
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(User)
        .update({ id: user.id } as any, { password: hash } as any);
      await manager
        .getRepository(User)
        .increment({ id: user.id }, 'tokenVersion', 1);
      await manager
        .getRepository(RefreshToken)
        .update(
          { userId: user.id, revoked: false } as any,
          { revoked: true } as any,
        );
    });

    // libera novos envios no futuro
    await this.redis.del(`pwdreset:mailsent:${user.id}`);
    return true;
  }
}
