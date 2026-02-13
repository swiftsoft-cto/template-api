import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { RedisService } from '../../_common/redis/redis.service';
import { RolesService } from '../../administration/roles/roles.service';
import { RULES_META, RuleMatch } from '../decorators/rule.decorator';

// Super rule para bypass total (configurável por .env)
const SUPER_RULE = process.env.SUPER_RULE;

@Injectable()
export class RulesGuard implements CanActivate {
  private readonly logger = new Logger(RulesGuard.name);

  constructor(
    private reflector: Reflector,
    private i18n: I18nService,
    private redis: RedisService,
    private rolesService: RolesService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const lang = I18nContext.current()?.lang;

    const meta = this.reflector.get<{ rules: string[]; match: RuleMatch }>(
      RULES_META,
      ctx.getHandler(),
    );

    // Se não há rules declaradas, não há o que checar.
    if (!meta || !meta.rules?.length) return true;

    if (!user?.userId) {
      throw new ForbiddenException(
        await this.i18n.translate('auth.unauthorized', { lang }),
      );
    }

    // Reutiliza o método centralizado do RolesService
    const userRules = await this.rolesService.getUserRules(user.userId);

    // 3) checa match

    // BYPASS: se o usuário tem a "super regra", concede acesso a tudo
    if (SUPER_RULE && userRules?.includes(SUPER_RULE)) {
      return true;
    }

    const needed = meta.rules;
    const hasAll = needed.every((n) => userRules!.includes(n));
    const hasAny = needed.some((n) => userRules!.includes(n));

    const ok = meta.match === 'all' ? hasAll : hasAny;
    if (!ok) {
      // Log do cargo e permissão necessária
      const requiredPermissions =
        meta.match === 'all' ? needed.join(' E ') : needed.join(' OU ');

      this.logger.warn(
        JSON.stringify({
          event: 'insufficient_permissions',
          userId: user.userId,
          userEmail: user.email,
          userPermissions: userRules,
          requiredPermissions,
          matchType: meta.match,
          endpoint: `${req.method} ${req.path}`,
          timestamp: new Date().toISOString(),
        }),
      );

      throw new ForbiddenException(
        await this.i18n.translate('auth.insufficient_permissions', { lang }),
      );
    }

    return true;
  }
}
