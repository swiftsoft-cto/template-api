import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { AccountBlockService } from '../account-block.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { User } from '../../administration/users/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private i18n: I18nService,
    private blocks: AccountBlockService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.ACCESS_TOKEN_SECRET,
    });
  }

  async validate(payload: any) {
    const lang = I18nContext.current()?.lang;

    // Confirma que o usuário ainda existe e não está soft-deleted
    const user = await this.userRepo.findOne({
      where: { id: payload.sub, deletedAt: IsNull() },
      select: { id: true, email: true, name: true, tokenVersion: true } as any,
    });

    if (!user) {
      throw new UnauthorizedException(
        await this.i18n.translate('auth.user_not_found_or_deleted', { lang }),
      );
    }

    // NOVO: versão do token precisa bater com a versão atual do usuário
    if ((payload as any).vs !== (user as any).tokenVersion) {
      throw new UnauthorizedException(
        await this.i18n.translate('auth.session_revoked', { lang }),
      );
    }
    // Se a conta está bloqueada administrativamente, nega acesso
    if (await this.blocks.isBlockedUser(user.id)) {
      throw new UnauthorizedException(
        (await this.i18n.translate('auth.account_blocked', { lang })) ||
          'Conta bloqueada.',
      );
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      exp: payload.exp, // Inclui o timestamp de expiração
    };
  }
}
