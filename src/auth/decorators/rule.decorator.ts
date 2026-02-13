import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { RulesGuard } from '../guards/rules.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

export const RULES_META = 'required_rules';
export type RuleMatch = 'any' | 'all';

export function Rule(
  rules: string | string[],
  match: RuleMatch = 'any',
): MethodDecorator {
  const value = Array.isArray(rules) ? rules : [rules];
  return applyDecorators(
    SetMetadata(RULES_META, { rules: value, match }),
    UseGuards(RulesGuard), // já acopla o guard neste handler
  );
}

/**
 * Açúcar: combina JWT + RulesGuard numa tacada só.
 * Use: @Authz('users.read') ao invés de @UseGuards(JwtAuthGuard, RulesGuard) + @Rule(...)
 */
export function Authz(
  rules: string | string[],
  match: RuleMatch = 'any',
): MethodDecorator {
  return applyDecorators(UseGuards(JwtAuthGuard), Rule(rules, match));
}
