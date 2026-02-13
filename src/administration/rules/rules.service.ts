import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { RulesListInput } from './rules.schema';
import { Rule } from './rule.entity';
import { RoleRule } from '../roles/role-rule.entity';

type RuleRow = { id: string; name: string; description: string | null };

@Injectable()
export class RulesService {
  constructor(
    @InjectRepository(Rule)
    private ruleRepo: Repository<Rule>,
    @InjectRepository(RoleRule)
    private roleRuleRepo: Repository<RoleRule>,
    private i18n: I18nService,
  ) {}

  private getLang() {
    return I18nContext.current()?.lang;
  }

  private getModuleFromName(name: string) {
    const p = (name || '').split('.');
    return p.length ? p[0] : 'general';
    // se no futuro houver coluna "module" no banco, prefira ela aqui
  }

  async listAll(q: RulesListInput) {
    const lang = this.getLang();

    const queryBuilder = this.ruleRepo
      .createQueryBuilder('rule')
      .where('rule.deletedAt IS NULL');

    if (q.search) {
      queryBuilder.andWhere(
        '(LOWER(rule.name) LIKE LOWER(:search) OR LOWER(rule.description) LIKE LOWER(:search))',
        { search: `%${q.search}%` },
      );
    }

    // se quiser filtrar por módulo, inferimos pelo prefixo do name
    if (q.module) {
      queryBuilder.andWhere('LOWER(rule.name) LIKE LOWER(:module)', {
        module: `${q.module}.%`,
      });
    }

    const rows = await queryBuilder
      .select(['rule.id', 'rule.name', 'rule.description'])
      .orderBy('rule.name', 'ASC')
      .getMany();

    if (q.flat) {
      const message = rows.length
        ? await this.i18n.translate('roles.rules_listed', { lang })
        : await this.i18n.translate('roles.rules_empty', { lang });

      // flat = lista simples
      return { message, data: rows };
    }

    // agrupa por módulo (prefixo do name)
    const groupsMap = new Map<string, RuleRow[]>();
    for (const r of rows) {
      const mod = this.getModuleFromName(r.name);
      const arr = groupsMap.get(mod) ?? [];
      arr.push(r);
      groupsMap.set(mod, arr);
    }

    const data = Array.from(groupsMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([module, rules]) => ({ module, rules }));

    const message = data.length
      ? await this.i18n.translate('roles.rules_listed', { lang })
      : await this.i18n.translate('roles.rules_empty', { lang });

    return { message, data };
  }
}
