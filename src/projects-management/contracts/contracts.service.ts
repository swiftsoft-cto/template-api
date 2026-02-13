import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  Repository,
  QueryFailedError,
  IsNull,
  In,
} from 'typeorm';
import { I18nService, I18nContext } from 'nestjs-i18n';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Contract } from './contract.entity';
import { ContractTemplate } from './contract-template.entity';
import {
  CreateContractDto,
  CreateContractTemplateDto,
  ListContractsDto,
  ListContractTemplatesDto,
  UpdateContractDto,
  UpdateContractTemplateDto,
  PreviewContractDto,
} from './contracts.schema';
import { Project } from '../projects/project.entity';
import { Customer } from '../../administration/customers/entities/customer.entity';
import { ProjectScope } from '../scope/scope.entity';
import { User } from '../../administration/users/user.entity';
import { Rule } from '../../administration/rules/rule.entity';
import { RoleRule } from '../../administration/roles/role-rule.entity';
import { CustomersService } from '../../administration/customers/customers.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { TrackingService } from '../../_common/tracking/tracking.service';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    @InjectRepository(ContractTemplate)
    private readonly templateRepo: Repository<ContractTemplate>,
    @InjectRepository(Contract)
    private readonly contractRepo: Repository<Contract>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(ProjectScope)
    private readonly scopeRepo: Repository<ProjectScope>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Rule)
    private readonly ruleRepo: Repository<Rule>,
    @InjectRepository(RoleRule)
    private readonly roleRuleRepo: Repository<RoleRule>,
    private readonly i18n: I18nService,
    private readonly customersService: CustomersService,
    private readonly notificationsService: NotificationsService,
    private readonly trackingService: TrackingService,
  ) {}

  // ===================== Software template (tabela de níveis) =====================
  private readonly SOFTWARE_LEVELS = {
    startup: { value: 3397, label: 'Startup', hours: 20 },
    business: { value: 5799, label: 'Business', hours: 40 },
    advanced: { value: 10699, label: 'Advanced', hours: 80 },
    premium: { value: 17999, label: 'Premium', hours: 160 }, // Outsourcing
  } as const;

  /**
   * Coerção tolerante para número (aceita "20000,00", "20.000,00", "R$ 20.000,00", etc.)
   */
  private coerceNumber(input: any): number {
    if (typeof input === 'number') return input;
    if (typeof input === 'string') {
      let s = input.trim();
      if (!s) return Number.NaN;
      // remove "R$", espaços e NBSP
      s = s.replace(/R\$/gi, '').replace(/[\s\u00A0]/g, '');
      // remove separador de milhar "." e troca decimal "," por "."
      s = s.replace(/\./g, '').replace(/,/g, '.');
      return Number(s);
    }
    return Number(input);
  }

  private getLang() {
    return I18nContext.current()?.lang;
  }

  /**
   * Busca todos os usuários que têm uma regra específica
   */
  private async getUsersByRule(ruleName: string): Promise<User[]> {
    // 1. Buscar a regra pelo nome
    const rule = await this.ruleRepo.findOne({
      where: { name: ruleName, deletedAt: IsNull() },
    });

    if (!rule) {
      return [];
    }

    // 2. Buscar todos os roles que têm essa regra
    const roleRules = await this.roleRuleRepo.find({
      where: { ruleId: rule.id },
    });

    if (roleRules.length === 0) {
      return [];
    }

    const roleIds = roleRules.map((rr) => rr.roleId);

    // 3. Buscar todos os usuários que têm esses roles
    const users = await this.userRepo.find({
      where: {
        roleId: In(roleIds),
        deletedAt: IsNull(),
      },
      select: { id: true, name: true },
    });

    return users;
  }

  private resolveSofficePath(): string | null {
    const fromEnv = (process.env.LIBRE_OFFICE_EXE ?? '').trim();
    const tryPreferCom = (p: string): string => {
      // No Windows, prefira o soffice.com (console) quando existir: costuma ser mais estável em headless/execFile.
      if (process.platform !== 'win32') return p;
      const lower = p.toLowerCase();
      if (lower.endsWith('\\soffice.exe') || lower.endsWith('/soffice.exe')) {
        const com = p.replace(/soffice\.exe$/i, 'soffice.com');
        try {
          if (fs.existsSync(com)) return com;
        } catch {
          // ignora
        }
      }
      return p;
    };

    if (fromEnv && fs.existsSync(fromEnv)) return tryPreferCom(fromEnv);

    if (process.platform !== 'win32') return null;

    const candidates = [
      // tenta o caminho curto (8.3) e os caminhos padrão
      path.join(
        process.env['PROGRAMFILES(X86)'] || '',
        'LIBREO~1/program/soffice.exe',
      ),
      path.join(
        process.env['PROGRAMFILES(X86)'] || '',
        'LibreOffice/program/soffice.exe',
      ),
      path.join(
        process.env.PROGRAMFILES_X86 || '',
        'LibreOffice/program/soffice.exe',
      ),
      path.join(
        process.env.PROGRAMFILES || '',
        'LibreOffice/program/soffice.exe',
      ),
      'C:/Program Files/LibreOffice/program/soffice.exe',
      'C:/Program Files/LibreOffice/program/soffice.com',
    ].filter(Boolean);

    for (const p of candidates) {
      try {
        if (p && fs.existsSync(p)) return tryPreferCom(p);
      } catch {
        // ignora
      }
    }
    return null;
  }

  private async rethrowUniqueConflict(
    err: unknown,
    field: string,
  ): Promise<never> {
    const isDup =
      err instanceof QueryFailedError &&
      (err as any).driverError?.code === '23505';
    if (
      isDup ||
      (err instanceof Error && err.message.includes('duplicate key'))
    ) {
      const lang = this.getLang();
      const message = await this.i18n.translate('common.field_already_exists', {
        lang,
        args: { field },
      });
      throw new BadRequestException({ message, field });
    }
    throw err;
  }

  private toSnakeUpper(input: string): string {
    const s = String(input ?? '').trim();
    if (!s) return '';
    return s
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[\s\-]+/g, '_')
      .replace(/[^\w]/g, '_')
      .replace(/_+/g, '_')
      .toUpperCase();
  }

  /**
   * Formata CPF: XXX.XXX.XXX-XX
   */
  private formatCPF(cpf: string | null | undefined): string {
    if (!cpf) return '';
    const digits = String(cpf).replace(/\D/g, '');
    if (digits.length !== 11) return String(cpf); // Retorna original se não tiver 11 dígitos
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }

  /**
   * Formata CNPJ: XX.XXX.XXX/XXXX-XX
   */
  private formatCNPJ(cnpj: string | null | undefined): string {
    if (!cnpj) return '';
    const digits = String(cnpj).replace(/\D/g, '');
    if (digits.length !== 14) return String(cnpj); // Retorna original se não tiver 14 dígitos
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }

  /**
   * Formata CEP: XXXXX-XXX
   */
  private formatPostalCode(cep: string | null | undefined): string {
    if (!cep) return '';
    const digits = String(cep).replace(/\D/g, '');
    if (digits.length !== 8) return String(cep); // Retorna original se não tiver 8 dígitos
    return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
  }

  /**
   * Formata nome próprio: primeira letra maiúscula, resto minúsculas
   * Exceção para palavras "de", "do", "da" que permanecem minúsculas
   * Exemplo: "joão da silva" -> "João da Silva"
   */
  private formatPersonName(name: string | null | undefined): string {
    if (!name) return '';
    const lowerWords = ['de', 'do', 'da', 'dos', 'das'];
    return String(name)
      .split(/\s+/)
      .map((word) => {
        const lowerWord = word.toLowerCase();
        if (lowerWords.includes(lowerWord)) {
          return lowerWord;
        }
        return (
          lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1).toLowerCase()
        );
      })
      .join(' ');
  }

  /**
   * Converte número para extenso em português
   */
  private numberToWords(value: number): string {
    const unidades = [
      '',
      'um',
      'dois',
      'três',
      'quatro',
      'cinco',
      'seis',
      'sete',
      'oito',
      'nove',
      'dez',
      'onze',
      'doze',
      'treze',
      'quatorze',
      'quinze',
      'dezesseis',
      'dezessete',
      'dezoito',
      'dezenove',
    ];
    const dezenas = [
      '',
      '',
      'vinte',
      'trinta',
      'quarenta',
      'cinquenta',
      'sessenta',
      'setenta',
      'oitenta',
      'noventa',
    ];
    const centenas = [
      '',
      'cento',
      'duzentos',
      'trezentos',
      'quatrocentos',
      'quinhentos',
      'seiscentos',
      'setecentos',
      'oitocentos',
      'novecentos',
    ];

    if (value === 0) return 'zero';
    if (value < 0) return 'menos ' + this.numberToWords(-value);

    let result = '';

    // Milhões
    if (value >= 1000000) {
      const milhoes = Math.floor(value / 1000000);
      result += this.numberToWords(milhoes);
      result += milhoes === 1 ? ' milhão' : ' milhões';
      value = value % 1000000;
      if (value > 0) result += ' ';
    }

    // Milhares
    if (value >= 1000) {
      const milhares = Math.floor(value / 1000);
      if (milhares === 1) {
        result += 'mil';
      } else {
        result += this.numberToWords(milhares) + ' mil';
      }
      value = value % 1000;
      if (value > 0) result += ' ';
    }

    // Centenas
    if (value >= 100) {
      const centena = Math.floor(value / 100);
      if (value === 100) {
        result += 'cem';
      } else {
        result += centenas[centena];
      }
      value = value % 100;
      if (value > 0) result += ' ';
    }

    // Dezenas e unidades
    if (value >= 20) {
      const dezena = Math.floor(value / 10);
      result += dezenas[dezena];
      value = value % 10;
      if (value > 0) result += ' e ';
    }

    if (value > 0) {
      result += unidades[value];
    }

    return result;
  }

  /**
   * Converte valor monetário para extenso
   */
  private valueToWords(value: number): string {
    const reais = Math.floor(value);
    const centavos = Math.round((value - reais) * 100);

    let result = '';

    if (reais > 0) {
      result += this.numberToWords(reais);
      result += reais === 1 ? ' real' : ' reais';
    }

    if (centavos > 0) {
      if (reais > 0) result += ' e ';
      result += this.numberToWords(centavos);
      result += centavos === 1 ? ' centavo' : ' centavos';
    }

    if (reais === 0 && centavos === 0) {
      result = 'zero reais';
    }

    // Capitaliza primeira letra
    return result.charAt(0).toUpperCase() + result.slice(1);
  }

  /**
   * Formata data por extenso em português
   */
  private formatDateExt(date: Date = new Date()): string {
    const meses = [
      'janeiro',
      'fevereiro',
      'março',
      'abril',
      'maio',
      'junho',
      'julho',
      'agosto',
      'setembro',
      'outubro',
      'novembro',
      'dezembro',
    ];

    const dia = date.getDate();
    const mes = meses[date.getMonth()];
    const ano = date.getFullYear();

    return `${dia} de ${mes} de ${ano}`;
  }

  private extractPlaceholderKeys(html: string): string[] {
    const src = String(html ?? '');
    const re = /\{\{\s*([A-Z0-9_]{1,120})\s*\}\}/g;
    const keys = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      keys.add(String(m[1] ?? '').trim());
    }
    return [...keys];
  }

  /**
   * Verifica se o customer tem pessoa disponível (para placeholders PERSON_*)
   */
  private hasPersonAvailable(customer: any): boolean {
    if (!customer) return false;

    // Se o customer é PERSON, sempre tem pessoa
    if (customer.kind === 'PERSON' && customer.person) {
      return true;
    }

    // Se o customer é COMPANY, verifica se tem pessoa relacionada
    if (customer.kind === 'COMPANY' && customer.company) {
      const company = customer.company;
      if (company.links && Array.isArray(company.links)) {
        // Verifica se há pelo menos uma pessoa relacionada
        return company.links.some((link: any) => link.person);
      }
    }

    return false;
  }

  /**
   * Filtra placeholders PERSON_* da lista de não resolvidos se não houver pessoa disponível
   */
  private filterOptionalPersonPlaceholders(
    unresolved: string[],
    customer: any,
  ): string[] {
    const hasPerson = this.hasPersonAvailable(customer);
    if (hasPerson) {
      // Se tem pessoa, mantém todos os placeholders não resolvidos
      return unresolved;
    }

    // Se não tem pessoa, remove placeholders PERSON_* da lista
    return unresolved.filter((key) => !key.startsWith('PERSON_'));
  }

  /**
   * Renderiza placeholders no formato {{PLACEHOLDER}}.
   * - Só substitui placeholders com chave presente no map
   * - Placeholders desconhecidos permanecem no HTML (útil para revisão/edição)
   */
  private renderPlaceholders(
    html: string,
    vars: Record<string, string>,
  ): string {
    const src = String(html ?? '');
    const map = vars ?? {};
    return src.replace(/\{\{\s*([A-Z0-9_]{1,120})\s*\}\}/g, (m, k) => {
      const key = String(k ?? '').trim();
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        return String(map[key] ?? '');
      }
      return m;
    });
  }

  /**
   * Processa o HTML de contratos do tipo "Software" preenchendo:
   * - ✅ Tabela de níveis (marcando X no nível correspondente ao valor)
   * - ✅ Linha "INVESTIMENTO": se monthlyValue > 17.999,00, substitui o valor na coluna Premium
   * - ✅ Tabela "PRAZO FORMA DE PAGAMENTO": gera lista de parcelas a partir de firstPaymentDay + monthsCount
   * - ✅ Detalhamento do preço: preenche horas mensais e investimento mensal
   *
   * Observação:
   * - As regras são independentes: pode atualizar só investimento, só parcelas, ou ambos.
   */
  private processSoftwareContractHtml(
    html: string,
    monthlyValue: number | null,
    monthsCount?: number | null,
    firstPaymentDay?: any | null,
  ): string {
    let out = String(html ?? '');
    if (!out.trim()) return out;

    const mv = this.coerceNumber(monthlyValue ?? 0);
    let selectedLevel: keyof typeof this.SOFTWARE_LEVELS | null = null;
    if (Number.isFinite(mv) && mv > 0) {
      selectedLevel = this.pickSoftwareLevelByMonthlyValue(mv);
      out = this.applySoftwareInvestmentTable(out, selectedLevel, mv);
    }

    // Detalhamento do preço (horas mensais e investimento mensal)
    if (selectedLevel && Number.isFinite(mv) && mv > 0) {
      out = this.applySoftwarePriceDetails(out, selectedLevel, mv);
    }

    // Parcelas (PRAZO FORMA DE PAGAMENTO)
    out = this.applySoftwarePaymentSchedule(out, firstPaymentDay, monthsCount);

    return out;
  }

  private escapeRegExpLocal(s: string) {
    return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private formatBRL(value: number): string {
    const v = Number(value ?? 0);
    const fixed = (Number.isFinite(v) ? v : 0).toFixed(2);
    const [intPart, decPart] = fixed.split('.');
    const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `R$ ${withThousands},${decPart}`;
  }

  private pickSoftwareLevelByMonthlyValue(
    monthlyValue: number,
  ): keyof typeof this.SOFTWARE_LEVELS {
    const mv = this.coerceNumber(monthlyValue ?? 0);
    const levels = this.SOFTWARE_LEVELS;
    let selected: keyof typeof levels = 'startup';
    let minDiff = Math.abs(mv - levels.startup.value);
    (Object.keys(levels) as Array<keyof typeof levels>).forEach((k) => {
      const diff = Math.abs(mv - levels[k].value);
      if (diff < minDiff) {
        minDiff = diff;
        selected = k;
      }
    });
    return selected;
  }

  /**
   * Aplica as regras solicitadas na tabela:
   * - marca "( X )" na linha "PROJETO CONTRATADO" na coluna do nível selecionado
   * - se monthlyValue > 17.999,00, troca o valor na linha "INVESTIMENTO" na coluna Premium
   *
   * Implementação robusta (sem depender de "<" entre textos), funcionando mesmo com <p>, <br>, etc.
   */
  private applySoftwareInvestmentTable(
    html: string,
    selectedLevel: keyof typeof this.SOFTWARE_LEVELS,
    monthlyValue: number,
  ): string {
    let out = String(html ?? '');
    if (!out.trim()) return out;

    // 1) Marca o X no "PROJETO CONTRATADO"
    out = this.updateFirstRowContainingLabel(
      out,
      'PROJETO CONTRATADO',
      (row) => this.updateProjectContractedRow(row, selectedLevel),
      { onlyFirstCell: true, minCells: 5 },
    );

    // 2) Sempre substitui o valor do INVESTIMENTO na MESMA coluna marcada (nível selecionado)
    //    (ex.: digitou 20.000,00 -> marca Premium e troca o valor da coluna Premium para 20.000,00)
    const formatted = this.formatBRL(monthlyValue);
    out = this.updateFirstRowContainingLabel(
      out,
      'INVESTIMENTO',
      (row) =>
        this.updateInvestmentRowSelectedCell(row, selectedLevel, formatted),
      { onlyFirstCell: true, minCells: 5 },
    );

    return out;
  }

  /**
   * Atualiza apenas a PRIMEIRA <tr> que contenha o label (tolerante a tags entre palavras).
   */
  private updateFirstRowContainingLabel(
    html: string,
    label: string,
    updater: (rowHtml: string) => string,
    opts?: { onlyFirstCell?: boolean; minCells?: number },
  ): string {
    const src = String(html ?? '');
    let updated = false;

    // regex de linha (tr)
    const trRe = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;

    // regex de célula (td/th)
    const cellRe = /<(td|th)\b[^>]*>[\s\S]*?<\/\1>/i;

    // label tolerante (permite tags e &nbsp; entre palavras)
    const parts = String(label ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => this.escapeRegExpLocal(p));
    const joiner = '(?:\\s|&nbsp;|\\u00A0|<[^>]+>)*';
    const labelRe = new RegExp(parts.join(joiner), 'i');

    return src.replace(trRe, (row) => {
      if (updated) return row;

      // se pediram um mínimo de células, valida antes
      if (opts?.minCells) {
        const allCells = row.match(/<(td|th)\b[^>]*>[\s\S]*?<\/\1>/gi) ?? [];
        if (allCells.length < opts.minCells) return row;
      }

      // por padrão, para labels de linha (ex.: INVESTIMENTO), confere a 1ª célula
      if (opts?.onlyFirstCell) {
        const firstCell = row.match(cellRe)?.[0] ?? '';
        if (!firstCell || !labelRe.test(firstCell)) return row;
      } else {
        if (!labelRe.test(row)) return row;
      }

      updated = true;
      try {
        return updater(row);
      } catch {
        return row;
      }
    });
  }

  /**
   * Reescreve células (<td>/<th>) mantendo exatamente o resto da <tr>.
   */
  private mapRowCells(
    rowHtml: string,
    mapper: (cellHtml: string, cellIndex: number, totalCells: number) => string,
  ): string {
    const row = String(rowHtml ?? '');
    const cellRe = /<(td|th)\b[^>]*>[\s\S]*?<\/\1>/gi;
    const matches = [...row.matchAll(cellRe)];
    if (!matches.length) return row;

    const total = matches.length;
    let out = '';
    let last = 0;

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const start = m.index ?? 0;
      const end = start + m[0].length;
      out += row.slice(last, start);
      out += mapper(m[0], i, total);
      last = end;
    }
    out += row.slice(last);
    return out;
  }

  private setCellCheckbox(cellHtml: string, checked: boolean): string {
    const cell = String(cellHtml ?? '');
    const m = cell.match(/^<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>$/i);
    if (!m) return cell;
    const tag = m[1];
    const attrs = m[2] ?? '';
    let inner = m[3] ?? '';

    // limpa qualquer X anterior na primeira ocorrência
    inner = inner.replace(/\(\s*X\s*\)/gi, '( )');

    // se não houver parênteses, não inventa (mantém), mas tenta inserir X se der
    if (/\(\s*[^)]*\)/.test(inner)) {
      inner = inner.replace(/\(\s*[^)]*\)/, checked ? '( X )' : '( )');
    } else if (checked) {
      inner = `${inner} ( X )`;
    }

    return `<${tag}${attrs}>${inner}</${tag}>`;
  }

  private updateProjectContractedRow(
    rowHtml: string,
    selectedLevel: keyof typeof this.SOFTWARE_LEVELS,
  ): string {
    const idxMap: Record<keyof typeof this.SOFTWARE_LEVELS, number> = {
      startup: 1,
      business: 2,
      advanced: 3,
      premium: 4,
    };
    const selectedIdx = idxMap[selectedLevel];

    return this.mapRowCells(rowHtml, (cell, idx) => {
      // célula 0 é o label ("PROJETO CONTRATADO"), as próximas 4 são as colunas
      if (idx >= 1 && idx <= 4) {
        return this.setCellCheckbox(cell, idx === selectedIdx);
      }
      return cell;
    });
  }

  private replaceCurrencyInCell(
    cellHtml: string,
    formattedBRL: string,
  ): string {
    const cell = String(cellHtml ?? '');
    const m = cell.match(/^<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>$/i);
    if (!m) return cell;
    const tag = m[1];
    const attrs = m[2] ?? '';
    let inner = m[3] ?? '';

    // troca "R$ 17.999,00" (tolerante a espaço normal, &nbsp; e NBSP)
    const currencyRe = /R\$(?:\s|&nbsp;|\u00A0)*[\d.]+,\d{2}/gi;
    if (currencyRe.test(inner)) {
      inner = inner.replace(currencyRe, formattedBRL);
    } else {
      // fallback: se o template tiver apenas o número
      const numOnly = formattedBRL.replace(/^R\$\s*/i, '');
      inner = inner.replace(/[\d.]+,\d{2}/g, numOnly);
    }

    return `<${tag}${attrs}>${inner}</${tag}>`;
  }

  /**
   * Define o valor do INVESTIMENTO dentro da célula de forma robusta,
   * mesmo se o HTML estiver quebrado em spans/ps/brs.
   *
   * Estratégia:
   * - tenta substituir "R$ 17.999,00" se estiver inteiro no HTML
   * - se não achar, tenta substituir o PRIMEIRO <p>...</p> (mantendo attrs do <p>)
   * - se tiver <br>, troca tudo antes do primeiro <br> pelo valor formatado
   * - fallback: seta conteúdo como "R$ xx.xxx,xx" + mantém "mensais" se existir
   */
  private setInvestmentCellValue(
    cellHtml: string,
    formattedBRL: string,
  ): string {
    const cell = String(cellHtml ?? '');
    const m = cell.match(/^<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>$/i);
    if (!m) return cell;

    const tag = m[1];
    const attrs = m[2] ?? '';
    let inner = m[3] ?? '';

    // 1) caminho rápido: tenta substituir moeda/número dentro do inner (quando está "inteiro")
    const replacedFast = this.replaceCurrencyInCell(
      `<${tag}${attrs}>${inner}</${tag}>`,
      formattedBRL,
    );
    if (replacedFast !== `<${tag}${attrs}>${inner}</${tag}>`) {
      return replacedFast;
    }

    // Captura sufixo "Mensais/mensais" se existir (preserva casing)
    const mensaisMatch = inner.match(/mensais/i);
    const mensais = mensaisMatch ? mensaisMatch[0] : '';

    // 2) Se houver <p>, troca o PRIMEIRO <p>...</p> pelo valor formatado
    if (/<p\b/i.test(inner)) {
      let did = false;
      inner = inner.replace(/<p\b([^>]*)>[\s\S]*?<\/p>/i, (_block, pAttrs) => {
        did = true;
        return `<p${pAttrs}>${formattedBRL}</p>`;
      });
      if (did) return `<${tag}${attrs}>${inner}</${tag}>`;
      // se falhar, cai para próximos fallbacks
    }

    // 3) Se houver <br>, troca tudo ANTES do primeiro <br> pelo valor formatado
    const lower = inner.toLowerCase();
    const brIdx = lower.indexOf('<br');
    if (brIdx >= 0) {
      const rest = inner.slice(brIdx); // mantém o <br ...> e tudo depois (inclui styling do "mensais")
      inner = `${formattedBRL}${rest}`;
      return `<${tag}${attrs}>${inner}</${tag}>`;
    }

    // 4) fallback final: seta texto simples, preservando "mensais" se existia
    inner = mensais ? `${formattedBRL} ${mensais}` : `${formattedBRL}`;
    return `<${tag}${attrs}>${inner}</${tag}>`;
  }

  private updateInvestmentRowSelectedCell(
    rowHtml: string,
    selectedLevel: keyof typeof this.SOFTWARE_LEVELS,
    formattedBRL: string,
  ): string {
    const idxMap: Record<keyof typeof this.SOFTWARE_LEVELS, number> = {
      startup: 1,
      business: 2,
      advanced: 3,
      premium: 4,
    };
    const selectedIdx = idxMap[selectedLevel];

    return this.mapRowCells(rowHtml, (cell, idx) => {
      // célula 0 é o label ("INVESTIMENTO"), as próximas 4 são as colunas
      if (idx === selectedIdx)
        return this.setInvestmentCellValue(cell, formattedBRL);
      return cell;
    });
  }

  private updateInvestmentRowPremiumCell(
    rowHtml: string,
    formattedBRL: string,
  ): string {
    return this.mapRowCells(rowHtml, (cell, idx) => {
      // índice 4 = coluna Premium (considerando: 0 label + 4 colunas)
      if (idx === 4) return this.replaceCurrencyInCell(cell, formattedBRL);
      return cell;
    });
  }

  // ===================== Parcelas / Datas =====================
  private daysInMonthUTC(year: number, month0: number): number {
    return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  }

  private addMonthsClampedUTC(date: Date, months: number): Date {
    const y = date.getUTCFullYear();
    const m0 = date.getUTCMonth();
    const d = date.getUTCDate();

    const total = m0 + months;
    const y2 = y + Math.floor(total / 12);
    const m2 = ((total % 12) + 12) % 12;

    const maxDay = this.daysInMonthUTC(y2, m2);
    const d2 = Math.min(d, maxDay);
    return new Date(Date.UTC(y2, m2, d2));
  }

  private formatDateBRShort(date: Date): string {
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yy = String(date.getUTCFullYear() % 100).padStart(2, '0');
    return `${dd}/${mm}/${yy}`;
  }

  /**
   * Parse flexível do firstPaymentDay:
   * - Date
   * - ISO: YYYY-MM-DD
   * - BR: DD/MM/YY ou DD/MM/YYYY
   * - Número (dia do mês): 1..31 => usa próxima ocorrência a partir de hoje (UTC)
   */
  private parseFirstPaymentDate(input: any): Date | null {
    if (input === null || input === undefined) return null;

    // Date
    if (input instanceof Date && !Number.isNaN(input.getTime())) {
      return new Date(
        Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()),
      );
    }

    // Número direto
    if (typeof input === 'number' && Number.isFinite(input)) {
      const day = Math.trunc(input);
      if (day < 1 || day > 31) return null;

      const now = new Date();
      let y = now.getUTCFullYear();
      let m0 = now.getUTCMonth();
      const today = now.getUTCDate();

      // se já passou o dia no mês atual, vai pro próximo mês
      if (today > day) {
        m0 += 1;
        if (m0 >= 12) {
          m0 = 0;
          y += 1;
        }
      }

      const maxDay = this.daysInMonthUTC(y, m0);
      const d = Math.min(day, maxDay);
      return new Date(Date.UTC(y, m0, d));
    }

    // String
    if (typeof input === 'string') {
      const s = input.trim();
      if (!s) return null;

      // "15"
      if (/^\d{1,2}$/.test(s)) return this.parseFirstPaymentDate(Number(s));

      // ISO YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [yy, mm, dd] = s.split('-').map((x) => Number(x));
        if (!yy || !mm || !dd) return null;
        const maxDay = this.daysInMonthUTC(yy, mm - 1);
        return new Date(Date.UTC(yy, mm - 1, Math.min(dd, maxDay)));
      }

      // BR DD/MM/YY ou DD/MM/YYYY
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
        const [ddS, mmS, yyS] = s.split('/');
        const dd = Number(ddS);
        const mm = Number(mmS);
        let yy = Number(yyS);
        if (!dd || !mm || !yy) return null;
        if (yyS.length === 2) yy = 2000 + yy; // 26 => 2026
        const maxDay = this.daysInMonthUTC(yy, mm - 1);
        return new Date(Date.UTC(yy, mm - 1, Math.min(dd, maxDay)));
      }

      // fallback: tenta Date.parse (último recurso)
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) {
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      }
    }

    return null;
  }

  private buildInstallmentsHtml(first: Date, count: number): string {
    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
      const dt = this.addMonthsClampedUTC(first, i);
      lines.push(`${i + 1}ª parcela ${this.formatDateBRShort(dt)};`);
    }
    return lines.join('<br>\n');
  }

  private makeLooseLabelRegex(label: string): RegExp {
    const parts = String(label ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => this.escapeRegExpLocal(p));
    const joiner = '(?:\\s|&nbsp;|\\u00A0|<[^>]+>)*';
    return new RegExp(parts.join(joiner), 'i');
  }

  private cellContainsLabel(cellHtml: string, label: string): boolean {
    const re = this.makeLooseLabelRegex(label);
    return re.test(String(cellHtml ?? ''));
  }

  /**
   * Seta o conteúdo da célula que contém "Data de Vencimento:"
   * preservando o <strong>... e inserindo a lista de parcelas após um <br>.
   */
  private setDueDatesCellValue(
    cellHtml: string,
    installmentsHtml: string,
  ): string {
    const cell = String(cellHtml ?? '');
    const m = cell.match(/^<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>$/i);
    if (!m) return cell;
    const tag = m[1];
    const attrs = m[2] ?? '';
    const inner = m[3] ?? '';

    // tenta capturar o prefixo com strong e br
    const prefixRe =
      /(<strong\b[^>]*>\s*Data(?:\s|&nbsp;|\u00A0|<[^>]+>)*de(?:\s|&nbsp;|\u00A0|<[^>]+>)*Vencimento\s*:\s*<\/strong>\s*(?:<br\b[^>]*>\s*)?)/i;
    const mm = inner.match(prefixRe);
    if (mm) {
      const prefix = mm[1];
      return `<${tag}${attrs}>${prefix}${installmentsHtml}</${tag}>`;
    }

    // fallback: força estrutura
    return `<${tag}${attrs}><strong>Data de Vencimento:</strong><br>${installmentsHtml}</${tag}>`;
  }

  private updatePaymentDueDatesRow(
    rowHtml: string,
    installmentsHtml: string,
  ): string {
    return this.mapRowCells(rowHtml, (cell) => {
      if (this.cellContainsLabel(cell, 'Data de Vencimento')) {
        return this.setDueDatesCellValue(cell, installmentsHtml);
      }
      return cell;
    });
  }

  /**
   * Aplica a lista de parcelas na tabela "PRAZO FORMA DE PAGAMENTO" (célula Data de Vencimento).
   */
  private applySoftwarePaymentSchedule(
    html: string,
    firstPaymentDay: any | null | undefined,
    monthsCount: number | null | undefined,
  ): string {
    const count = Math.trunc(this.coerceNumber(monthsCount ?? 0));
    if (!Number.isFinite(count) || count <= 0) return String(html ?? '');

    const first = this.parseFirstPaymentDate(firstPaymentDay);
    if (!first) return String(html ?? '');

    const installmentsHtml = this.buildInstallmentsHtml(first, count);

    // Atualiza a PRIMEIRA linha que contenha "Data de Vencimento"
    return this.updateFirstRowContainingLabel(
      String(html ?? ''),
      'Data de Vencimento',
      (row) => this.updatePaymentDueDatesRow(row, installmentsHtml),
      { minCells: 3 },
    );
  }

  /**
   * Preenche os campos de detalhamento do preço:
   * - Número total de horas mensais (baseado no nível)
   * - Investimento mensal (valor formatado)
   */
  private applySoftwarePriceDetails(
    html: string,
    selectedLevel: keyof typeof this.SOFTWARE_LEVELS,
    monthlyValue: number,
  ): string {
    let out = String(html ?? '');
    if (!out.trim()) return out;

    const level = this.SOFTWARE_LEVELS[selectedLevel];
    const hoursPerMonth = level.hours;
    const formattedValue = this.formatBRL(monthlyValue);

    // Substitui "Número total de horas mensais: 0 horas mensais."
    out = out.replace(
      /(<strong[^>]*>Número total de horas mensais:\s*<\/strong>)\s*0+\s*horas mensais\.?/gi,
      `$1 ${hoursPerMonth} horas mensais.`,
    );

    // Também tenta sem strong (caso o HTML seja diferente)
    out = out.replace(
      /Número total de horas mensais:\s*0+\s*horas mensais\.?/gi,
      `Número total de horas mensais: ${hoursPerMonth} horas mensais.`,
    );

    // Substitui "Investimento mensal: R$0.000,00 mensais."
    // Aceita diferentes formatos: R$0.000,00, R$ 0.000,00, R$0,00, etc.
    out = out.replace(
      /(<strong[^>]*>Investimento mensal:\s*<\/strong>)\s*R\$\s*0+[.,]0*\,?0*0*\s*mensais\.?/gi,
      `$1 ${formattedValue} mensais.`,
    );

    // Também tenta sem strong
    out = out.replace(
      /Investimento mensal:\s*R\$\s*0+[.,]0*\,?0*0*\s*mensais\.?/gi,
      `Investimento mensal: ${formattedValue} mensais.`,
    );

    // Substitui no detalhamento do preço também (se existir)
    // "*Detalhamento do preço em caso de contratação de projeto Premium: R$ 00.000,00 mensais."
    const levelLabel = level.label;
    out = out.replace(
      /\*\s*Detalhamento do preço[^:]*:\s*R\$\s*0+[.,]0*\,?0*0*\s*mensais\.?/gi,
      `*Detalhamento do preço em caso de contratação de projeto ${levelLabel}: ${formattedValue} mensais.`,
    );

    return out;
  }

  private isPrimitive(v: any) {
    return (
      v === null ||
      v === undefined ||
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean'
    );
  }

  private buildAutoPlaceholders(params: {
    customer?: any | null;
    project?: any | null;
    projectId?: string | null;
    scope?: any | null;
    user?: any | null; // Para contratos de colaborador
    contract?: Partial<Contract> | null;
    monthlyValue?: number | null;
    monthsCount?: number | null;
    firstPaymentDay?: number | null;
  }): Record<string, string> {
    const out: Record<string, string> = {};
    const customer = params.customer ?? {};
    const project = params.project ?? {};
    const projectId = params.projectId;
    const user = params.user ?? {};

    // CUSTOMER_* (mapeamentos específicos + dinâmico)
    // Mapeamentos mais comuns primeiro
    out.CUSTOMER_NAME = customer.displayName
      ? String(customer.displayName)
      : '';
    out.CUSTOMER_ID = customer.id ? String(customer.id) : '';
    out.CUSTOMER_KIND = customer.kind ? String(customer.kind) : '';
    out.CUSTOMER_IS_ACTIVE =
      customer.isActive !== undefined ? String(customer.isActive) : '';

    // CNPJ e endereço do customer quando for COMPANY
    if (customer.kind === 'COMPANY' && customer.company) {
      const company = customer.company;
      out.CUSTOMER_CNPJ = this.formatCNPJ(company.cnpj);

      // Endereço primário da company
      if (company.addresses && Array.isArray(company.addresses)) {
        const primaryAddress =
          company.addresses.find((addr: any) => addr.isPrimary === true) ||
          company.addresses[0];

        if (primaryAddress) {
          // Monta endereço completo
          const addressParts: string[] = [];
          if (primaryAddress.street) addressParts.push(primaryAddress.street);
          if (primaryAddress.number) addressParts.push(primaryAddress.number);
          if (primaryAddress.complement)
            addressParts.push(primaryAddress.complement);
          if (primaryAddress.district)
            addressParts.push(primaryAddress.district);
          if (primaryAddress.city) addressParts.push(primaryAddress.city);
          if (primaryAddress.state) addressParts.push(primaryAddress.state);
          if (primaryAddress.postalCode)
            addressParts.push(`CEP: ${primaryAddress.postalCode}`);

          out.CUSTOMER_ADDRESS = addressParts.join(', ');
          out.CUSTOMER_ADDRESS_CITY = primaryAddress.city
            ? String(primaryAddress.city)
            : '';
          out.CUSTOMER_ADDRESS_STATE = primaryAddress.state
            ? String(primaryAddress.state)
            : '';
        }
      }
    }

    // Campos dinâmicos (todos os campos primitivos)
    for (const [k, v] of Object.entries(customer)) {
      if (!this.isPrimitive(v)) continue;
      const key = `CUSTOMER_${this.toSnakeUpper(k)}`;
      // Só adiciona se ainda não foi mapeado explicitamente acima
      if (!Object.prototype.hasOwnProperty.call(out, key)) {
        out[key] = v === null || v === undefined ? '' : String(v);
      }
    }

    // PERSON_* (para customer person relacionado a company)
    // Quando o customer é COMPANY, busca o person principal ou representante legal
    if (customer.kind === 'COMPANY' && customer.company) {
      const company = customer.company;
      let primaryPerson: any = null;

      // Busca person principal (isPrimary=true) ou representante legal (isLegalRepresentative=true)
      if (company.links && Array.isArray(company.links)) {
        // Prioridade: 1) representante legal, 2) principal, 3) primeiro da lista
        primaryPerson =
          company.links.find(
            (link: any) => link.person && link.isLegalRepresentative === true,
          )?.person ||
          company.links.find(
            (link: any) => link.person && link.isPrimary === true,
          )?.person ||
          company.links.find((link: any) => link.person)?.person;
      }

      if (primaryPerson) {
        // Mapeamentos específicos do person
        const formattedName = this.formatPersonName(primaryPerson.fullName);
        out.PERSON_NAME = formattedName;
        out.PERSON_FULL_NAME = formattedName;
        out.PERSON_CPF = this.formatCPF(primaryPerson.cpf);
        out.PERSON_RG = primaryPerson.rg ? String(primaryPerson.rg) : '';
        out.PERSON_EMAIL = primaryPerson.email
          ? String(primaryPerson.email)
          : '';
        out.PERSON_PHONE = primaryPerson.phone
          ? String(primaryPerson.phone)
          : '';
        out.PERSON_ID = primaryPerson.id ? String(primaryPerson.id) : '';
        out.PERSON_BIRTH_DATE = primaryPerson.birthDate
          ? new Date(primaryPerson.birthDate).toLocaleDateString('pt-BR')
          : '';

        // Endereço primário do person
        if (primaryPerson.addresses && Array.isArray(primaryPerson.addresses)) {
          const primaryAddress =
            primaryPerson.addresses.find(
              (addr: any) => addr.isPrimary === true,
            ) || primaryPerson.addresses[0];

          if (primaryAddress) {
            // Monta endereço completo
            const addressParts: string[] = [];
            if (primaryAddress.street) addressParts.push(primaryAddress.street);
            if (primaryAddress.number) addressParts.push(primaryAddress.number);
            if (primaryAddress.complement)
              addressParts.push(primaryAddress.complement);
            if (primaryAddress.district)
              addressParts.push(primaryAddress.district);
            if (primaryAddress.city) addressParts.push(primaryAddress.city);
            if (primaryAddress.state) addressParts.push(primaryAddress.state);
            if (primaryAddress.postalCode)
              addressParts.push(`CEP: ${primaryAddress.postalCode}`);

            out.PERSON_ADDRESS = addressParts.join(', ');
            out.PERSON_ADDRESS_CITY = primaryAddress.city
              ? String(primaryAddress.city)
              : '';
            out.PERSON_ADDRESS_STATE = primaryAddress.state
              ? String(primaryAddress.state)
              : '';
          }
        }

        // Campos dinâmicos do person (todos os campos primitivos)
        for (const [k, v] of Object.entries(primaryPerson)) {
          if (!this.isPrimitive(v)) continue;
          const key = `PERSON_${this.toSnakeUpper(k)}`;
          // Só adiciona se ainda não foi mapeado explicitamente acima
          if (!Object.prototype.hasOwnProperty.call(out, key)) {
            out[key] = v === null || v === undefined ? '' : String(v);
          }
        }

        // Define PERSON_NAME_UPPERCASE após o loop dinâmico para garantir que não seja sobrescrito
        // Usa o fullName original, ou o formattedName como fallback
        const nameForUppercase =
          (primaryPerson.fullName
            ? String(primaryPerson.fullName).trim()
            : formattedName.trim()) || '';
        out.PERSON_NAME_UPPERCASE = nameForUppercase.toUpperCase();
      }
    } else if (customer.kind === 'PERSON' && customer.person) {
      // Se o customer já for PERSON, usa diretamente
      const person = customer.person;
      const formattedName = this.formatPersonName(person.fullName);
      out.PERSON_NAME = formattedName;
      out.PERSON_FULL_NAME = formattedName;
      out.PERSON_CPF = this.formatCPF(person.cpf);
      out.PERSON_RG = person.rg ? String(person.rg) : '';
      out.PERSON_EMAIL = person.email ? String(person.email) : '';
      out.PERSON_PHONE = person.phone ? String(person.phone) : '';
      out.PERSON_ID = person.id ? String(person.id) : '';
      out.PERSON_BIRTH_DATE = person.birthDate
        ? new Date(person.birthDate).toLocaleDateString('pt-BR')
        : '';

      // Endereço primário do person
      if (person.addresses && Array.isArray(person.addresses)) {
        const primaryAddress =
          person.addresses.find((addr: any) => addr.isPrimary === true) ||
          person.addresses[0];

        if (primaryAddress) {
          // Monta endereço completo
          const addressParts: string[] = [];
          if (primaryAddress.street) addressParts.push(primaryAddress.street);
          if (primaryAddress.number) addressParts.push(primaryAddress.number);
          if (primaryAddress.complement)
            addressParts.push(primaryAddress.complement);
          if (primaryAddress.district)
            addressParts.push(primaryAddress.district);
          if (primaryAddress.city) addressParts.push(primaryAddress.city);
          if (primaryAddress.state) addressParts.push(primaryAddress.state);
          if (primaryAddress.postalCode)
            addressParts.push(`CEP: ${primaryAddress.postalCode}`);

          out.PERSON_ADDRESS = addressParts.join(', ');
          out.PERSON_ADDRESS_CITY = primaryAddress.city
            ? String(primaryAddress.city)
            : '';
          out.PERSON_ADDRESS_STATE = primaryAddress.state
            ? String(primaryAddress.state)
            : '';
        }
      }

      // Campos dinâmicos do person
      for (const [k, v] of Object.entries(person)) {
        if (!this.isPrimitive(v)) continue;
        const key = `PERSON_${this.toSnakeUpper(k)}`;
        if (!Object.prototype.hasOwnProperty.call(out, key)) {
          out[key] = v === null || v === undefined ? '' : String(v);
        }
      }

      // Define PERSON_NAME_UPPERCASE após o loop dinâmico para garantir que não seja sobrescrito
      // Usa o fullName original, ou o formattedName como fallback
      const nameForUppercase =
        (person.fullName
          ? String(person.fullName).trim()
          : formattedName.trim()) || '';
      out.PERSON_NAME_UPPERCASE = nameForUppercase.toUpperCase();
    }

    // PROJECT_* (mapeamentos específicos + dinâmico)
    // Mapeamentos mais comuns primeiro
    out.PROJECT_NAME = project.projectName ? String(project.projectName) : '';
    out.PROJECT_CODE = project.projectCode ? String(project.projectCode) : '';
    // Usa project.id se disponível, caso contrário usa projectId passado como parâmetro
    out.PROJECT_ID = project?.id
      ? String(project.id)
      : projectId
        ? String(projectId)
        : '';
    out.PROJECT_TYPE = project.projectType ? String(project.projectType) : '';
    out.PROJECT_DESCRIPTION = project.description
      ? String(project.description)
      : '';

    // Campos dinâmicos (todos os campos primitivos)
    for (const [k, v] of Object.entries(project)) {
      if (!this.isPrimitive(v)) continue;
      const key = `PROJECT_${this.toSnakeUpper(k)}`;
      // Só adiciona se ainda não foi mapeado explicitamente acima
      if (!Object.prototype.hasOwnProperty.call(out, key)) {
        out[key] = v === null || v === undefined ? '' : String(v);
      }
    }

    // Scope (opcional)
    const scope = params.scope ?? null;
    out.SCOPE_HTML = scope?.scopeHtml ? String(scope.scopeHtml) : '';
    out.SCOPE_ID = scope?.id ? String(scope.id) : '';
    out.SCOPE_VERSION =
      scope?.version !== undefined ? String(scope.version) : '';

    // Contract meta (opcional)
    const contract = params.contract ?? null;
    out.CONTRACT_ID = contract?.id ? String(contract.id) : '';
    out.CONTRACT_TITLE = contract?.title ? String(contract.title) : '';
    out.CONTRACT_STATUS = contract?.status ? String(contract.status) : '';

    // COLABORATOR_* (para contratos de colaborador)
    if (user && user.id) {
      // Mapeamentos específicos do colaborador
      const formattedName = this.formatPersonName(user.name);
      out.COLABORATOR_NAME = formattedName;
      out.COLABORATOR_FULL_NAME = formattedName;
      out.COLABORATOR_NAME_UPPERCASE = user.name
        ? String(user.name).trim().toUpperCase()
        : '';
      out.COLABORATOR_EMAIL = user.email ? String(user.email) : '';
      out.COLABORATOR_PHONE = user.phone ? String(user.phone) : '';
      out.COLABORATOR_ID = user.id ? String(user.id) : '';
      out.COLABORATOR_CPF = user.cpf ? this.formatCPF(user.cpf) : '';
      out.COLABORATOR_CNPJ = user.cnpj ? this.formatCNPJ(user.cnpj) : '';
      out.COLABORATOR_BIRTH_DATE = user.birthdate
        ? new Date(user.birthdate).toLocaleDateString('pt-BR')
        : '';

      // Campos de endereço
      out.COLABORATOR_ADDRESS = user.address ? String(user.address) : '';
      out.COLABORATOR_ADDRESS_STATE = user.addressState
        ? String(user.addressState)
        : '';
      out.COLABORATOR_ADDRESS_CITY = user.addressCity
        ? String(user.addressCity)
        : '';
      out.COLABORATOR_ADDRESS_NEIGHBORHOOD = user.addressNeighborhood
        ? String(user.addressNeighborhood)
        : '';
      out.COLABORATOR_POSTAL_CODE = user.postalCode
        ? this.formatPostalCode(user.postalCode)
        : '';

      // Serviço que o colaborador presta
      out.COLABORATOR_SERVICE = user.service ? String(user.service) : '';
      out.COLABORATOR_SERVICE_UPPERCASE = user.service
        ? String(user.service).trim().toUpperCase()
        : '';

      // Campos dinâmicos do colaborador (todos os campos primitivos)
      for (const [k, v] of Object.entries(user)) {
        if (!this.isPrimitive(v)) continue;
        const key = `COLABORATOR_${this.toSnakeUpper(k)}`;
        // Só adiciona se ainda não foi mapeado explicitamente acima
        if (!Object.prototype.hasOwnProperty.call(out, key)) {
          out[key] = v === null || v === undefined ? '' : String(v);
        }
      }
    }

    // Placeholders de valor e data (disponíveis para todos os contratos)
    const monthlyValue = params.monthlyValue ?? null;
    const monthsCount = params.monthsCount ?? null;
    const firstPaymentDay = params.firstPaymentDay ?? null;

    // Valor mensal
    if (monthlyValue !== null && monthlyValue !== undefined) {
      out.COLABORATOR_VALUE = this.formatBRL(monthlyValue);
      out.COLABORATOR_VALUE_EXT = this.valueToWords(monthlyValue);
    } else {
      out.COLABORATOR_VALUE = '';
      out.COLABORATOR_VALUE_EXT = '';
    }

    // Quantidade de meses (vigência)
    if (monthsCount !== null && monthsCount !== undefined) {
      out.CONTRACT_VALIDITY = String(monthsCount);
      out.CONTRACT_VALIDITY_EXT = this.numberToWords(monthsCount);
      // Capitaliza primeira letra
      out.CONTRACT_VALIDITY_EXT =
        out.CONTRACT_VALIDITY_EXT.charAt(0).toUpperCase() +
        out.CONTRACT_VALIDITY_EXT.slice(1);
    } else {
      out.CONTRACT_VALIDITY = '';
      out.CONTRACT_VALIDITY_EXT = '';
    }

    // Dia do primeiro pagamento
    if (firstPaymentDay !== null && firstPaymentDay !== undefined) {
      out.FIRST_PAYMENT_DAY = String(firstPaymentDay);
      out.FIRST_PAYMENT_DAY_EXT = this.numberToWords(firstPaymentDay);
      // Capitaliza primeira letra
      out.FIRST_PAYMENT_DAY_EXT =
        out.FIRST_PAYMENT_DAY_EXT.charAt(0).toUpperCase() +
        out.FIRST_PAYMENT_DAY_EXT.slice(1);
    } else {
      out.FIRST_PAYMENT_DAY = '';
      out.FIRST_PAYMENT_DAY_EXT = '';
    }

    // Data por extenso (data atual)
    out.DATA_EXT = this.formatDateExt(new Date());

    return out;
  }

  // ---------------- Templates ----------------
  async createTemplate(dto: CreateContractTemplateDto, userId?: string) {
    // Verifica se já existe um template com o mesmo nome e projectId
    // (permitindo múltiplos templates com mesmo nome quando projectId é null)
    if (dto.projectId) {
      const existing = await this.templateRepo.findOne({
        where: {
          name: dto.name,
          projectId: dto.projectId,
          deletedAt: null,
        },
      });
      if (existing) {
        const lang = this.getLang();
        const message = await this.i18n.translate(
          'common.field_already_exists',
          {
            lang,
            args: { field: 'name' },
          },
        );
        throw new BadRequestException({ message, field: 'name' });
      }
    }

    const entity = this.templateRepo.create({
      name: dto.name,
      description: dto.description ?? null,
      projectId: dto.projectId ?? null,
      userId: userId ?? null,
      templateHtml: dto.templateHtml,
    });

    try {
      return await this.templateRepo.save(entity);
    } catch (e) {
      await this.rethrowUniqueConflict(e, 'name');
    }
  }

  async listTemplates(query: ListContractTemplatesDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const orderBy = query.orderBy ?? 'createdAt';
    const order = (query.order ?? 'desc').toUpperCase() as 'ASC' | 'DESC';

    const where: any = { deletedAt: null };
    if (query.projectId) where.projectId = query.projectId;

    const [data, total] = await this.templateRepo.findAndCount({
      where,
      relations: { project: true, user: true },
      order:
        orderBy === 'updatedAt' ? { updatedAt: order } : { createdAt: order },
      take: limit,
      skip,
    });

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: skip + data.length < total,
        hasPrev: page > 1,
      },
    };
  }

  async findOneTemplate(id: string) {
    const tpl = await this.templateRepo.findOne({
      where: { id, deletedAt: null },
      relations: { project: true, user: true },
    });
    if (!tpl) throw new NotFoundException('Contract template not found');
    return tpl;
  }

  async updateTemplate(id: string, dto: UpdateContractTemplateDto) {
    const tpl = await this.findOneTemplate(id);
    if (dto.name !== undefined) tpl.name = dto.name;
    if (dto.description !== undefined)
      tpl.description = dto.description ?? null;
    if (dto.projectId !== undefined) {
      tpl.projectId = dto.projectId ?? null;
      // Limpa o relacionamento para forçar o TypeORM a atualizar
      tpl.project = undefined;
    }
    if (dto.templateHtml !== undefined) tpl.templateHtml = dto.templateHtml;

    try {
      return await this.templateRepo.save(tpl);
    } catch (e) {
      await this.rethrowUniqueConflict(e, 'name');
    }
  }

  async removeTemplate(id: string) {
    const tpl = await this.findOneTemplate(id);
    await this.templateRepo.softRemove(tpl);
    return { message: 'Contract template deleted successfully' };
  }

  // ---------------- Contracts ----------------
  /**
   * Preview de contrato sem salvar.
   * Retorna o HTML renderizado e lista de placeholders não resolvidos.
   */
  async previewContract(dto: PreviewContractDto) {
    // Validar que pelo menos projectId/customerId OU userId foi fornecido
    if (!dto.projectId && !dto.customerId && !dto.userId) {
      throw new BadRequestException({
        message:
          'É necessário fornecer projectId e customerId, ou userId para contratos de colaborador',
        field: 'projectId',
      });
    }

    let project: Project | null = null;
    if (dto.projectId) {
      project = await this.projectRepo.findOne({
        where: { id: dto.projectId } as any,
      });
      if (!project) throw new NotFoundException('Project not found');
    }

    let customer: Customer | null = null;
    if (dto.customerId) {
      customer = await this.customerRepo.findOne({
        where: { id: dto.customerId } as any,
        relations: [
          'person',
          'person.addresses',
          'company',
          'company.addresses',
          'company.links',
          'company.links.person',
          'company.links.person.addresses',
        ],
      });
      if (!customer) throw new NotFoundException('Customer not found');
    }

    let user: User | null = null;
    if (dto.userId) {
      user = await this.userRepo.findOne({
        where: { id: dto.userId } as any,
      });
      if (!user) throw new NotFoundException('User not found');
    }

    const tpl = await this.templateRepo.findOne({
      where: { id: dto.templateId, deletedAt: null },
    });
    if (!tpl) throw new NotFoundException('Contract template not found');

    let scope: ProjectScope | null = null;
    if (dto.scopeId) {
      if (!dto.projectId) {
        throw new BadRequestException({
          message: 'scopeId requer projectId',
          field: 'scopeId',
        });
      }
      scope = await this.scopeRepo.findOne({
        where: { id: dto.scopeId, deletedAt: null } as any,
      });
      if (!scope) throw new NotFoundException('Scope not found');
      if (String(scope.projectId) !== String(dto.projectId)) {
        throw new BadRequestException({
          message: 'scopeId does not belong to the provided projectId',
          field: 'scopeId',
        });
      }
    }

    const title =
      dto.title ??
      `${tpl.name}${customer?.displayName ? ` - ${customer.displayName}` : user?.name ? ` - ${user.name}` : ''}`;

    // placeholders auto + overrides
    const auto = this.buildAutoPlaceholders({
      customer: customer ?? null,
      project: project ?? null,
      projectId: dto.projectId ?? null,
      scope,
      user: user ?? null,
      contract: { title },
      monthlyValue: dto.monthlyValue ?? null,
      monthsCount: dto.monthsCount ?? null,
      firstPaymentDay: dto.firstPaymentDay ?? null,
    });
    const overrides = dto.variables ?? {};
    const vars: Record<string, string> = { ...auto, ...overrides };

    let contractHtml = this.renderPlaceholders(tpl.templateHtml, vars);

    // Processa HTML para contratos Software
    const isSoftwareTemplate =
      tpl.name?.toLowerCase().includes('software') ?? false;
    if (
      isSoftwareTemplate &&
      ((dto.monthlyValue !== null && dto.monthlyValue !== undefined) ||
        (dto.monthsCount !== null && dto.monthsCount !== undefined) ||
        (dto.firstPaymentDay !== null && dto.firstPaymentDay !== undefined))
    ) {
      contractHtml = this.processSoftwareContractHtml(
        contractHtml,
        dto.monthlyValue,
        dto.monthsCount ?? null,
        dto.firstPaymentDay ?? null,
      );
    }

    const unresolved = this.extractPlaceholderKeys(contractHtml).filter(
      (k) => !vars[k],
    );

    return {
      contractHtml,
      unresolvedPlaceholders: unresolved,
      variables: vars,
      title,
    };
  }

  async createContract(dto: CreateContractDto, createdBy?: string) {
    // Validar que pelo menos projectId/customerId OU userId foi fornecido
    if (!dto.projectId && !dto.customerId && !dto.userId) {
      throw new BadRequestException({
        message:
          'É necessário fornecer projectId e customerId, ou userId para contratos de colaborador',
        field: 'projectId',
      });
    }

    let project: Project | null = null;
    if (dto.projectId) {
      project = await this.projectRepo.findOne({
        where: { id: dto.projectId } as any,
        relations: ['customer'],
      });
      if (!project) throw new NotFoundException('Project not found');
    }

    let customer: Customer | null = null;
    if (dto.customerId) {
      customer = await this.customerRepo.findOne({
        where: { id: dto.customerId } as any,
        relations: [
          'person',
          'person.addresses',
          'company',
          'company.addresses',
          'company.links',
          'company.links.person',
          'company.links.person.addresses',
        ],
      });
      if (!customer) throw new NotFoundException('Customer not found');

      // opcional: garantir consistência projeto->cliente (se o projeto já tem customer_id)
      if (project) {
        const projectCustomerId =
          (project as any)?.customerId ?? (project as any)?.customer_id;
        if (
          projectCustomerId &&
          String(projectCustomerId) !== String(dto.customerId)
        ) {
          throw new BadRequestException({
            message: 'customerId does not match the project customer',
            field: 'customerId',
          });
        }
      }
    }

    let user: User | null = null;
    if (dto.userId) {
      user = await this.userRepo.findOne({
        where: { id: dto.userId } as any,
      });
      if (!user) throw new NotFoundException('User not found');
    }

    const tpl = await this.templateRepo.findOne({
      where: { id: dto.templateId, deletedAt: null },
    });
    if (!tpl) throw new NotFoundException('Contract template not found');

    let scope: ProjectScope | null = null;
    if (dto.scopeId) {
      if (!dto.projectId) {
        throw new BadRequestException({
          message: 'scopeId requer projectId',
          field: 'scopeId',
        });
      }
      scope = await this.scopeRepo.findOne({
        where: { id: dto.scopeId, deletedAt: null } as any,
      });
      if (!scope) throw new NotFoundException('Scope not found');
      if (String(scope.projectId) !== String(dto.projectId)) {
        throw new BadRequestException({
          message: 'scopeId does not belong to the provided projectId',
          field: 'scopeId',
        });
      }
      // Validação: scope deve estar com status "finalized" para criar contrato
      if (scope.status !== 'finalized') {
        const lang = this.getLang();
        throw new BadRequestException({
          message:
            (await this.i18n.translate('contracts.scope_not_finalized', {
              lang,
            })) ||
            'Não é possível criar um contrato com um escopo que não esteja finalizado',
          field: 'scopeId',
        });
      }
    }

    const title =
      dto.title ??
      `${tpl.name}${customer?.displayName ? ` - ${customer.displayName}` : user?.name ? ` - ${user.name}` : ''}`;

    // placeholders auto + overrides
    const auto = this.buildAutoPlaceholders({
      customer: customer ?? null,
      project: project ?? null,
      projectId: dto.projectId ?? null,
      scope,
      user: user ?? null,
      contract: { title },
      monthlyValue: dto.monthlyValue ?? null,
      monthsCount: dto.monthsCount ?? null,
      firstPaymentDay: dto.firstPaymentDay ?? null,
    });
    const overrides = dto.variables ?? {};
    const vars: Record<string, string> = { ...auto, ...overrides };

    let contractHtml = this.renderPlaceholders(tpl.templateHtml, vars);

    // Processa HTML para contratos Software
    const isSoftwareTemplate =
      tpl.name?.toLowerCase().includes('software') ?? false;
    if (
      isSoftwareTemplate &&
      ((dto.monthlyValue !== null && dto.monthlyValue !== undefined) ||
        (dto.monthsCount !== null && dto.monthsCount !== undefined) ||
        (dto.firstPaymentDay !== null && dto.firstPaymentDay !== undefined))
    ) {
      contractHtml = this.processSoftwareContractHtml(
        contractHtml,
        dto.monthlyValue,
        dto.monthsCount ?? null,
        dto.firstPaymentDay ?? null,
      );
    }

    const unresolved = this.extractPlaceholderKeys(contractHtml).filter(
      (k) => !vars[k],
    );

    const entity = this.contractRepo.create({
      projectId: dto.projectId ?? null,
      customerId: dto.customerId ?? null,
      userId: dto.userId ?? null,
      templateId: dto.templateId,
      scopeId: dto.scopeId ?? null,
      createdBy: createdBy ?? null,
      title,
      status: 'draft',
      isLocked: false,
      templateHtmlSnapshot: tpl.templateHtml,
      scopeHtmlSnapshot: scope?.scopeHtml ?? null,
      contractHtml,
      variablesJson: dto.variables ?? null,
      unresolvedPlaceholders: unresolved.length > 0 ? unresolved : null,
      monthlyValue: dto.monthlyValue ?? null,
      monthsCount: dto.monthsCount ?? null,
      firstPaymentDay: dto.firstPaymentDay ?? null,
    });

    const saved = await this.contractRepo.save(entity);

    // Se o contrato for criado com status 'signed' (improvável mas possível via código direto),
    // atualiza a flag do projeto. Por padrão criamos como 'draft', então isso só aconteceria
    // se alguém modificasse manualmente o código acima.
    // Vamos deixar isso aqui para garantir consistência caso o status padrão mude no futuro
    if (saved.status === 'signed') {
      if (saved.projectId) {
        await this.updateProjectHasSignedContractFlag(saved.projectId);
      }
      if (saved.customerId) {
        await this.activateCustomersForSignedContract(saved.customerId);
      }
    }

    // Notificar por WhatsApp quando o contrato é criado (apenas para contratos com projeto)
    if (project && customer) {
      try {
        // Usar o customer já buscado anteriormente no método
        const projectName = project.projectName || 'Projeto';
        const customerName = customer.displayName || 'Cliente';
        const contractTitle = saved.title || 'Contrato';

        // Coletar todos os IDs de usuários que devem receber notificação
        const userIdsToNotify = new Set<string>();

        // 1. Adicionar quem criou o customer
        if (customer?.createdById) {
          userIdsToNotify.add(customer.createdById);
        }

        // 2. Adicionar quem criou o projeto
        if ((project as any).createdById) {
          userIdsToNotify.add((project as any).createdById);
        }

        // 3. Adicionar quem criou o escopo (se existir)
        if (scope?.userId) {
          userIdsToNotify.add(scope.userId);
        }

        // 4. Adicionar gestores de projetos
        const projectManagers = await this.getUsersByRule('projects.manager');
        projectManagers.forEach((manager) => {
          userIdsToNotify.add(manager.id);
        });

        // Enviar tracking por WhatsApp para todos os usuários únicos (assíncrono, não bloqueia resposta)
        if (userIdsToNotify.size > 0) {
          const uniqueUserIds = Array.from(userIdsToNotify);
          setImmediate(() => {
            this.trackingService
              .sendTrackingToUsers(
                uniqueUserIds,
                {
                  projectId: project.id,
                  projectName,
                  customerName,
                  scopeName: scope?.name,
                  contractTitle,
                  badge: 'INTERNO',
                  currentStage: 'contrato',
                  projectCreatedAt: project.createdAt,
                  scopeCreatedAt: scope?.createdAt,
                  scopeFinalizedAt:
                    scope?.status === 'finalized' ? scope.updatedAt : undefined,
                  contractCreatedAt: saved.createdAt,
                },
                `Contrato "${contractTitle}" criado`,
              )
              .catch((error) => {
                // Não deve quebrar o fluxo principal se o tracking falhar
                this.logger.error(
                  `Erro ao enviar tracking por WhatsApp (contrato criado): ${error?.message || error}`,
                );
              });
          });
        }
      } catch (error) {
        // Não deve quebrar o fluxo principal se a notificação falhar
        this.logger.error(
          `Erro ao notificar sobre contrato criado: ${error?.message || error}`,
        );
      }
    }

    const full = await this.contractRepo.findOne({
      where: { id: saved.id } as any,
      relations: {
        project: true,
        customer: true,
        user: true,
        template: true,
        scope: true,
        createdByUser: true,
      },
    });

    return {
      ...full,
      unresolvedPlaceholders: unresolved,
    };
  }

  async listContracts(query: ListContractsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const orderBy = query.orderBy ?? 'createdAt';
    const order = (query.order ?? 'desc').toUpperCase() as 'ASC' | 'DESC';

    const qb = this.contractRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.project', 'project')
      .leftJoinAndSelect('c.customer', 'customer')
      .leftJoinAndSelect('c.template', 'template')
      .leftJoinAndSelect('c.scope', 'scope')
      .leftJoinAndSelect('c.createdByUser', 'createdByUser')
      .where('c.deletedAt IS NULL');

    if (query.projectId)
      qb.andWhere('c.projectId = :projectId', { projectId: query.projectId });
    if (query.customerId)
      qb.andWhere('c.customerId = :customerId', {
        customerId: query.customerId,
      });
    if (query.templateId)
      qb.andWhere('c.templateId = :templateId', {
        templateId: query.templateId,
      });
    if (query.status)
      qb.andWhere('c.status = :status', { status: query.status });

    qb.orderBy(orderBy === 'updatedAt' ? 'c.updatedAt' : 'c.createdAt', order)
      .skip(skip)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: skip + data.length < total,
        hasPrev: page > 1,
      },
    };
  }

  async findOneContract(id: string) {
    const c = await this.contractRepo.findOne({
      where: { id, deletedAt: null } as any,
      relations: {
        project: true,
        customer: true,
        template: true,
        scope: true,
        createdByUser: true,
      },
    });
    if (!c) throw new NotFoundException('Contract not found');
    return c;
  }

  /**
   * Verifica se o contrato pode ser editado.
   * Não pode editar se estiver bloqueado (isLocked=true) ou assinado (status='signed').
   */
  private checkCanEdit(contract: Contract, action: string = 'editar'): void {
    if (contract.isLocked) {
      throw new BadRequestException({
        message: `Cannot ${action} contract: contract is locked`,
        field: 'isLocked',
      });
    }
    if (contract.status === 'signed') {
      throw new BadRequestException({
        message: `Cannot ${action} contract: contract is already signed`,
        field: 'status',
      });
    }
  }

  /**
   * Atualiza contrato.
   * - Se trocar template/customer/project/scope/variables, re-renderiza usando o template snapshot atual (ou novo template).
   * - Se enviar contractHtml, sobrescreve manualmente e não re-renderiza por placeholders.
   * - Valida placeholders não resolvidos se status for "final".
   * - Não permite edições se o contrato estiver bloqueado (isLocked=true) ou assinado (status='signed').
   */
  async updateContract(id: string, dto: UpdateContractDto) {
    const c = await this.findOneContract(id);

    // Caso comum e crítico: marcar como assinado via PATCH apenas com status.
    // Fazemos transacional para garantir consistência (contrato + projeto + clientes).
    const isOnlyStatus =
      dto.status !== undefined && Object.keys(dto).length === 1;
    if (dto.status === 'signed' && isOnlyStatus) {
      return await this.markContractAsSignedTransactional(id, {
        reason: 'manual_status_patch',
      });
    }

    // Verificar se está tentando apenas bloquear/desbloquear
    const isOnlyLocking =
      dto.isLocked !== undefined &&
      Object.keys(dto).filter((k) => k !== 'isLocked').length === 0;
    const isMarkingAsSigned = dto.status === 'signed';

    // Se está tentando marcar como signed mas está bloqueado, não permite
    if (isMarkingAsSigned && c.isLocked) {
      throw new BadRequestException({
        message: 'Cannot mark contract as signed: contract is locked',
        field: 'status',
      });
    }

    // Se está tentando desbloquear um contrato assinado, não permite
    if (dto.isLocked === false && c.status === 'signed') {
      throw new BadRequestException({
        message: 'Cannot unlock contract: contract is already signed',
        field: 'isLocked',
      });
    }

    // Se não for apenas bloqueio/desbloqueio, verifica se pode editar
    if (!isOnlyLocking) {
      this.checkCanEdit(c, 'update');
    }

    // override manual primeiro (se vier)
    if (dto.contractHtml) {
      const prevStatus = c.status;
      c.contractHtml = dto.contractHtml;
      if (dto.title !== undefined) c.title = dto.title ?? null;
      if (dto.status) {
        // Se mudando para "final", validar placeholders não resolvidos
        if (dto.status === 'final') {
          // Buscar customer para verificar se tem pessoa
          const customer = await this.customerRepo.findOne({
            where: { id: c.customerId } as any,
            relations: [
              'person',
              'company',
              'company.links',
              'company.links.person',
            ],
          });

          const unresolved = this.extractPlaceholderKeys(c.contractHtml);
          // Filtrar placeholders PERSON_* se não houver pessoa disponível
          const requiredUnresolved = this.filterOptionalPersonPlaceholders(
            unresolved,
            customer,
          );

          if (requiredUnresolved.length > 0) {
            const lang = this.getLang();
            const message = await this.i18n.translate(
              'contracts.unresolved_placeholders',
              {
                lang,
                args: { placeholders: requiredUnresolved.join(', ') },
              },
            );
            throw new BadRequestException({
              message:
                message ||
                `Cannot set status to 'final' with unresolved placeholders: ${requiredUnresolved.join(', ')}`,
              field: 'status',
              unresolvedPlaceholders: requiredUnresolved,
            });
          }
        }
        c.status = dto.status as any;
      }
      if (dto.variables !== undefined) c.variablesJson = dto.variables ?? null;
      if (dto.isLocked !== undefined) c.isLocked = dto.isLocked;
      if (dto.autentiqueDocumentId !== undefined)
        c.autentiqueDocumentId = dto.autentiqueDocumentId ?? null;

      // Atualizar unresolvedPlaceholders baseado no HTML atual
      const vars = c.variablesJson ?? {};
      const unresolved = this.extractPlaceholderKeys(c.contractHtml).filter(
        (k) => !vars[k],
      );
      c.unresolvedPlaceholders = unresolved.length > 0 ? unresolved : null;

      const saved = await this.contractRepo.save(c);

      // Se status mudou (ex.: draft/final/signed/canceled), atualiza flag do projeto
      if (dto.status && saved.projectId) {
        await this.updateProjectHasSignedContractFlag(saved.projectId);
      }

      // Notificar quando o status mudar para "final"
      if (prevStatus !== 'final' && saved.status === 'final') {
        await this.notifyContractFinalized(saved);
      }

      // Se virou signed, ativa clientes (empresa + pessoa vinculada) e notifica
      if (prevStatus !== 'signed' && saved.status === 'signed') {
        if (saved.customerId) {
          await this.activateCustomersForSignedContract(saved.customerId);
        }
        await this.notifyContractSigned(saved);
      }

      return saved;
    }

    const nextProjectId = dto.projectId ?? c.projectId;
    const nextCustomerId = dto.customerId ?? c.customerId;
    const nextUserId = dto.userId ?? c.userId;
    const nextTemplateId = dto.templateId ?? c.templateId;
    const nextScopeId =
      dto.scopeId !== undefined
        ? dto.scopeId === null
          ? null
          : dto.scopeId
        : c.scopeId;

    // Validar que pelo menos projectId/customerId OU userId foi fornecido
    if (!nextProjectId && !nextCustomerId && !nextUserId) {
      throw new BadRequestException({
        message:
          'É necessário fornecer projectId e customerId, ou userId para contratos de colaborador',
        field: 'projectId',
      });
    }

    let project: Project | null = null;
    if (nextProjectId) {
      project = await this.projectRepo.findOne({
        where: { id: nextProjectId } as any,
      });
      if (!project) throw new NotFoundException('Project not found');
    }

    let customer: Customer | null = null;
    if (nextCustomerId) {
      customer = await this.customerRepo.findOne({
        where: { id: nextCustomerId } as any,
        relations: [
          'person',
          'person.addresses',
          'company',
          'company.addresses',
          'company.links',
          'company.links.person',
          'company.links.person.addresses',
        ],
      });
      if (!customer) throw new NotFoundException('Customer not found');

      // opcional: garantir consistência projeto->cliente (se o projeto já tem customer_id)
      if (project) {
        const projectCustomerId =
          (project as any)?.customerId ?? (project as any)?.customer_id;
        if (
          projectCustomerId &&
          String(projectCustomerId) !== String(nextCustomerId)
        ) {
          throw new BadRequestException({
            message: 'customerId does not match the project customer',
            field: 'customerId',
          });
        }
      }
    }

    let user: User | null = null;
    if (nextUserId) {
      user = await this.userRepo.findOne({
        where: { id: nextUserId } as any,
      });
      if (!user) throw new NotFoundException('User not found');
    }

    const tpl = await this.templateRepo.findOne({
      where: { id: nextTemplateId, deletedAt: null } as any,
    });
    if (!tpl) throw new NotFoundException('Contract template not found');

    let scope: ProjectScope | null = null;
    if (nextScopeId) {
      if (!nextProjectId) {
        throw new BadRequestException({
          message: 'scopeId requer projectId',
          field: 'scopeId',
        });
      }
      scope = await this.scopeRepo.findOne({
        where: { id: nextScopeId, deletedAt: null } as any,
      });
      if (!scope) throw new NotFoundException('Scope not found');
      if (String(scope.projectId) !== String(nextProjectId)) {
        throw new BadRequestException({
          message: 'scopeId does not belong to the provided projectId',
          field: 'scopeId',
        });
      }
    }

    if (dto.title !== undefined) c.title = dto.title ?? null;
    if (dto.isLocked !== undefined) c.isLocked = dto.isLocked;
    if (dto.autentiqueDocumentId !== undefined)
      c.autentiqueDocumentId = dto.autentiqueDocumentId ?? null;

    // Validar placeholders não resolvidos se status for "final"
    if (dto.status === 'final') {
      // Re-renderizar primeiro para obter o HTML atualizado
      const variables =
        dto.variables !== undefined ? dto.variables : (c.variablesJson ?? {});
      const title =
        c.title ??
        `${tpl.name}${customer?.displayName ? ` - ${customer.displayName}` : user?.name ? ` - ${user.name}` : ''}`;
      const auto = this.buildAutoPlaceholders({
        customer: customer ?? null,
        project: project ?? null,
        projectId: nextProjectId ?? null,
        scope,
        user: user ?? null,
        contract: { id: c.id, title, status: 'final' },
        monthlyValue: dto.monthlyValue ?? c.monthlyValue ?? null,
        monthsCount: dto.monthsCount ?? c.monthsCount ?? null,
        firstPaymentDay: dto.firstPaymentDay ?? c.firstPaymentDay ?? null,
      });
      const overrides = variables ?? {};
      const vars: Record<string, string> = { ...auto, ...overrides };
      const previewHtml = this.renderPlaceholders(tpl.templateHtml, vars);
      const unresolved = this.extractPlaceholderKeys(previewHtml).filter(
        (k) => !vars[k],
      );

      // Filtrar placeholders PERSON_* se não houver pessoa disponível (apenas se houver customer)
      const requiredUnresolved = customer
        ? this.filterOptionalPersonPlaceholders(unresolved, customer)
        : unresolved;

      if (requiredUnresolved.length > 0) {
        const lang = this.getLang();
        const message = await this.i18n.translate(
          'contracts.unresolved_placeholders',
          {
            lang,
            args: { placeholders: requiredUnresolved.join(', ') },
          },
        );
        throw new BadRequestException({
          message:
            message ||
            `Cannot set status to 'final' with unresolved placeholders: ${requiredUnresolved.join(', ')}`,
          field: 'status',
          unresolvedPlaceholders: requiredUnresolved,
        });
      }
    }

    if (dto.status) c.status = dto.status as any;

    c.projectId = nextProjectId;
    c.customerId = nextCustomerId;
    c.userId = nextUserId;
    c.templateId = nextTemplateId;
    c.scopeId = nextScopeId;

    // snapshot atualiza se trocar template/scope
    c.templateHtmlSnapshot = tpl.templateHtml;
    c.scopeHtmlSnapshot = scope?.scopeHtml ?? null;

    const variables =
      dto.variables !== undefined
        ? dto.variables
        : (c.variablesJson ?? undefined);
    c.variablesJson = variables ?? null;

    const title =
      c.title ??
      `${tpl.name}${(customer as any)?.name ? ` - ${(customer as any).name}` : ''}`;
    const auto = this.buildAutoPlaceholders({
      customer,
      project,
      projectId: nextProjectId,
      scope,
      contract: { id: c.id, title, status: c.status },
      monthlyValue: dto.monthlyValue ?? c.monthlyValue ?? null,
      monthsCount: dto.monthsCount ?? c.monthsCount ?? null,
      firstPaymentDay: dto.firstPaymentDay ?? c.firstPaymentDay ?? null,
    });
    const overrides = variables ?? {};
    const vars: Record<string, string> = { ...auto, ...overrides };

    let contractHtml = this.renderPlaceholders(tpl.templateHtml, vars);

    // Processa HTML para contratos Software
    const isSoftwareTemplate =
      tpl.name?.toLowerCase().includes('software') ?? false;
    const monthlyValue = dto.monthlyValue ?? c.monthlyValue;
    const monthsCount = dto.monthsCount ?? c.monthsCount;
    const firstPaymentDay = dto.firstPaymentDay ?? c.firstPaymentDay;
    if (
      isSoftwareTemplate &&
      ((monthlyValue !== null && monthlyValue !== undefined) ||
        (monthsCount !== null && monthsCount !== undefined) ||
        (firstPaymentDay !== null && firstPaymentDay !== undefined))
    ) {
      contractHtml = this.processSoftwareContractHtml(
        contractHtml,
        monthlyValue,
        monthsCount ?? null,
        firstPaymentDay ?? null,
      );
    }

    c.contractHtml = contractHtml;

    // Atualizar campos de pagamento se fornecidos
    if (dto.monthlyValue !== undefined)
      c.monthlyValue = dto.monthlyValue ?? null;
    if (dto.monthsCount !== undefined) c.monthsCount = dto.monthsCount ?? null;
    if (dto.firstPaymentDay !== undefined)
      c.firstPaymentDay = dto.firstPaymentDay ?? null;

    // Atualizar unresolvedPlaceholders
    const unresolved = this.extractPlaceholderKeys(c.contractHtml).filter(
      (k) => !vars[k],
    );
    c.unresolvedPlaceholders = unresolved.length > 0 ? unresolved : null;

    const oldStatus = c.status;
    const savedContract = await this.contractRepo.save(c);

    // Atualiza a flag do projeto quando o status muda
    // Isso garante que a flag reflita corretamente se há contratos assinados
    if (savedContract.projectId) {
      await this.updateProjectHasSignedContractFlag(savedContract.projectId);
    }

    // Notificar quando o status mudar para "final"
    if (oldStatus !== 'final' && savedContract.status === 'final') {
      await this.notifyContractFinalized(savedContract);
    }

    // Se virou signed, ativa clientes (empresa + pessoa vinculada) e notifica
    if (oldStatus !== 'signed' && savedContract.status === 'signed') {
      if (savedContract.customerId) {
        await this.activateCustomersForSignedContract(savedContract.customerId);
      }
      await this.notifyContractSigned(savedContract);
    }

    return savedContract;
  }

  async removeContract(id: string) {
    const c = await this.findOneContract(id);
    this.checkCanEdit(c, 'delete');
    const projectId = c.projectId;
    await this.contractRepo.softRemove(c);

    // Atualiza a flag do projeto após deletar o contrato (apenas se houver projeto)
    if (projectId) {
      await this.updateProjectHasSignedContractFlag(projectId);
    }

    return { message: 'Contract deleted successfully' };
  }

  /**
   * Notifica usuários quando um contrato é finalizado
   */
  private async notifyContractFinalized(contract: Contract): Promise<void> {
    try {
      // Apenas notificar se houver projeto (contratos de colaborador não têm notificações de tracking)
      if (!contract.projectId) {
        return;
      }

      // Buscar projeto com customer e scope
      const project = await this.projectRepo.findOne({
        where: { id: contract.projectId },
        relations: ['customer'],
      });

      if (!project) {
        return;
      }

      const customer = (project as any).customer;
      const projectName = project.projectName || 'Projeto';
      const customerName = customer?.displayName || 'Cliente';
      const contractTitle = contract.title || 'Contrato';

      // Coletar todos os IDs de usuários que devem receber notificação
      const userIdsToNotify = new Set<string>();

      // 1. Adicionar quem criou o customer
      if (customer?.createdById) {
        userIdsToNotify.add(customer.createdById);
      }

      // 2. Adicionar quem criou o projeto
      if ((project as any).createdById) {
        userIdsToNotify.add((project as any).createdById);
      }

      // 3. Adicionar quem criou o escopo (se existir) e buscar dados do escopo
      let scope: ProjectScope | null = null;
      if (contract.scopeId) {
        scope = await this.scopeRepo.findOne({
          where: { id: contract.scopeId },
        });
        if (scope?.userId) {
          userIdsToNotify.add(scope.userId);
        }
      }

      // 4. Adicionar gestores de projetos
      const projectManagers = await this.getUsersByRule('projects.manager');
      projectManagers.forEach((manager) => {
        userIdsToNotify.add(manager.id);
      });

      // Criar notificações para todos os usuários únicos
      if (userIdsToNotify.size > 0) {
        const uniqueUserIds = Array.from(userIdsToNotify);
        await this.notificationsService.createMany(
          uniqueUserIds,
          'Contrato finalizado',
          `O contrato "${contractTitle}" do projeto "${projectName}" do cliente "${customerName}" foi finalizado.`,
          'contract',
          contract.id,
        );

        // Enviar tracking por WhatsApp (assíncrono, não bloqueia resposta)
        setImmediate(() => {
          this.trackingService
            .sendTrackingToUsers(
              uniqueUserIds,
              {
                projectId: project.id,
                projectName,
                customerName,
                scopeName: scope?.name,
                contractTitle,
                badge: 'INTERNO',
                currentStage: 'contrato-finalizado',
                projectCreatedAt: project.createdAt,
                scopeCreatedAt: scope?.createdAt,
                scopeFinalizedAt:
                  scope?.status === 'finalized' ? scope.updatedAt : undefined,
                contractCreatedAt: contract.createdAt,
                contractFinalizedAt: contract.updatedAt,
              },
              `Contrato "${contractTitle}" finalizado`,
            )
            .catch((error) => {
              // Não deve quebrar o fluxo principal se o tracking falhar
              this.logger.error(
                `Erro ao enviar tracking por WhatsApp (contrato finalizado): ${error?.message || error}`,
              );
            });
        });
      }
    } catch (error) {
      // Não deve quebrar o fluxo principal se a notificação falhar
      this.logger.error(
        `Erro ao notificar sobre contrato finalizado: ${error?.message || error}`,
      );
    }
  }

  /**
   * Notifica usuários quando um contrato é assinado
   */
  private async notifyContractSigned(contract: Contract): Promise<void> {
    try {
      // Apenas notificar se houver projeto (contratos de colaborador não têm notificações de tracking)
      if (!contract.projectId) {
        return;
      }

      // Buscar projeto com customer e scope
      const project = await this.projectRepo.findOne({
        where: { id: contract.projectId },
        relations: ['customer'],
      });

      if (!project) {
        return;
      }

      const customer = (project as any).customer;
      const projectName = project.projectName || 'Projeto';
      const customerName = customer?.displayName || 'Cliente';
      const contractTitle = contract.title || 'Contrato';

      // Coletar todos os IDs de usuários que devem receber notificação
      const userIdsToNotify = new Set<string>();

      // 1. Adicionar quem criou o customer
      if (customer?.createdById) {
        userIdsToNotify.add(customer.createdById);
      }

      // 2. Adicionar quem criou o projeto
      if ((project as any).createdById) {
        userIdsToNotify.add((project as any).createdById);
      }

      // 3. Adicionar quem criou o escopo (se existir) e buscar dados do escopo
      let scope: ProjectScope | null = null;
      if (contract.scopeId) {
        scope = await this.scopeRepo.findOne({
          where: { id: contract.scopeId },
        });
        if (scope?.userId) {
          userIdsToNotify.add(scope.userId);
        }
      }

      // 4. Adicionar gestores de projetos
      const projectManagers = await this.getUsersByRule('projects.manager');
      projectManagers.forEach((manager) => {
        userIdsToNotify.add(manager.id);
      });

      // Criar notificações para todos os usuários únicos
      if (userIdsToNotify.size > 0) {
        const uniqueUserIds = Array.from(userIdsToNotify);
        await this.notificationsService.createMany(
          uniqueUserIds,
          'Contrato assinado',
          `O contrato "${contractTitle}" do projeto "${projectName}" do cliente "${customerName}" foi assinado.`,
          'contract',
          contract.id,
        );

        // Enviar tracking por WhatsApp (assíncrono, não bloqueia resposta)
        setImmediate(() => {
          this.trackingService
            .sendTrackingToUsers(
              uniqueUserIds,
              {
                projectId: project.id,
                projectName,
                customerName,
                scopeName: scope?.name,
                contractTitle,
                badge: 'INTERNO',
                currentStage: 'contrato-assinado',
                projectCreatedAt: project.createdAt,
                scopeCreatedAt: scope?.createdAt,
                scopeFinalizedAt:
                  scope?.status === 'finalized' ? scope.updatedAt : undefined,
                contractCreatedAt: contract.createdAt,
                contractFinalizedAt:
                  contract.status === 'final' ? contract.updatedAt : undefined,
                contractSignedAt: contract.updatedAt,
              },
              `Contrato "${contractTitle}" assinado`,
            )
            .catch((error) => {
              // Não deve quebrar o fluxo principal se o tracking falhar
              this.logger.error(
                `Erro ao enviar tracking por WhatsApp (contrato assinado): ${error?.message || error}`,
              );
            });
        });
      }
    } catch (error) {
      // Não deve quebrar o fluxo principal se a notificação falhar
      this.logger.error(
        `Erro ao notificar sobre contrato assinado: ${error?.message || error}`,
      );
    }
  }

  /**
   * Atualiza a flag hasSignedContract do projeto baseado nos contratos assinados
   */
  private async updateProjectHasSignedContractFlag(
    projectId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const contractRepo = manager
      ? manager.getRepository(Contract)
      : this.contractRepo;
    const projectRepo = manager
      ? manager.getRepository(Project)
      : this.projectRepo;

    const signedContractsCount = await contractRepo.count({
      where: {
        projectId,
        status: 'signed',
        deletedAt: null,
      } as any,
    });

    const hasSignedContract = signedContractsCount > 0;

    await projectRepo.update({ id: projectId } as any, {
      hasSignedContract,
    });

    this.logger.debug(
      `Project ${projectId} hasSignedContract updated to ${hasSignedContract}`,
    );
  }

  private async activateCustomersForSignedContract(
    customerId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.customersService.activateCustomerCascade(customerId, {
      manager,
    });
  }

  private async markContractAsSignedTransactional(
    contractId: string,
    opts?: { reason?: string; signerEmail?: string },
  ): Promise<Contract> {
    return await this.contractRepo.manager.transaction(async (manager) => {
      const contractRepo = manager.getRepository(Contract);

      const contract = await contractRepo.findOne({
        where: { id: contractId, deletedAt: null } as any,
      });
      if (!contract) throw new NotFoundException('Contract not found');

      // Idempotência
      if (contract.status === 'signed') return contract;

      if (contract.isLocked) {
        throw new BadRequestException({
          message: 'Cannot mark contract as signed: contract is locked',
          field: 'status',
        });
      }

      contract.status = 'signed';
      const saved = await contractRepo.save(contract);

      if (saved.projectId) {
        await this.updateProjectHasSignedContractFlag(saved.projectId, manager);
      }
      if (saved.customerId) {
        await this.activateCustomersForSignedContract(
          saved.customerId,
          manager,
        );
      }

      // Notificar sobre contrato assinado (fora da transação para evitar problemas)
      // Usar setTimeout para executar após a transação ser commitada
      setImmediate(() => {
        this.notifyContractSigned(saved).catch((err) => {
          this.logger.error(
            `Erro ao notificar sobre contrato assinado (markContractAsSignedTransactional): ${err?.message || err}`,
          );
        });
      });

      if (opts?.reason) {
        this.logger.log(
          `Contract ${saved.id} marked as signed (${opts.reason})${
            opts.signerEmail ? ` signer=${opts.signerEmail}` : ''
          }`,
        );
      }

      return saved;
    });
  }

  /**
   * Verifica a assinatura HMAC do webhook do Autentique
   * Usa SHA256 conforme documentação do Autentique
   */
  verifyAutentiqueSignature(
    signature: string | undefined,
    payload: string,
    secret: string,
  ): boolean {
    if (!signature) {
      console.log('❌ Assinatura não fornecida no header');
      return false;
    }

    try {
      const calculatedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      console.log('🔍 Debug assinatura HMAC:', {
        signatureRecebida: signature,
        signatureCalculada: calculatedSignature,
        signatureLength: signature.length,
        calculatedLength: calculatedSignature.length,
        secretLength: secret.length,
      });

      // Tenta comparar diretamente (string)
      if (signature === calculatedSignature) {
        console.log('✅ Assinatura válida (comparação string)');
        return true;
      }

      // Tenta comparar como hex
      try {
        const sigBuffer = Buffer.from(signature, 'hex');
        const calcBuffer = Buffer.from(calculatedSignature, 'hex');

        // Se os tamanhos são diferentes, não são iguais
        if (sigBuffer.length !== calcBuffer.length) {
          console.log('❌ Tamanhos diferentes:', {
            sigBufferLength: sigBuffer.length,
            calcBufferLength: calcBuffer.length,
          });
          return false;
        }

        const isValid = crypto.timingSafeEqual(sigBuffer, calcBuffer);
        if (isValid) {
          console.log('✅ Assinatura válida (comparação buffer hex)');
        } else {
          console.log('❌ Assinatura inválida (comparação buffer hex)');
        }
        return isValid;
      } catch {
        // Se não for hex válido, já tentou comparação string acima
        console.log(
          '⚠️ Erro ao tentar converter para hex, mas já tentou comparação string',
        );
        return false;
      }
    } catch (error) {
      console.error('❌ Erro ao verificar assinatura:', error);
      this.logger.warn('Error verifying Autentique webhook signature:', error);
      return false;
    }
  }

  /**
   * Processa webhook do Autentique e marca contrato como assinado quando apropriado
   * Só marca como assinado se o email do signatário NÃO contiver "swiftsoft"
   */
  async handleAutentiqueWebhook(payload: any): Promise<void> {
    const eventType = payload?.event?.type;
    const eventData = payload?.event?.data;

    if (!eventType || !eventData) {
      this.logger.warn('Invalid webhook payload structure');
      return;
    }

    // Processa apenas eventos relevantes para assinatura
    if (
      eventType === 'signature.accepted' ||
      eventType === 'document.finished'
    ) {
      let documentId: string | null = null;

      // Extrai o ID do documento conforme o tipo de evento
      if (eventType === 'signature.accepted') {
        documentId = eventData?.document || null;
      } else if (eventType === 'document.finished') {
        documentId = eventData?.id || eventData?.object?.id || null;
      }

      if (!documentId) {
        this.logger.warn(`No document ID found in ${eventType} event`);
        return;
      }

      // Extrai o email do signatário
      const signerEmail = eventData?.user?.email || eventData?.email || null;
      console.log(
        '🚀 ~ ContractsService ~ handleAutentiqueWebhook ~ signerEmail:',
        signerEmail,
      );

      if (!signerEmail) {
        this.logger.warn(`No signer email found in ${eventType} event`);
        return;
      }

      // Verifica se o email contém "swiftsoft" (case insensitive)
      // Só marca como assinado se o email NÃO contiver "swiftsoft"
      const emailLower = String(signerEmail).toLowerCase();
      if (emailLower.includes('swiftsoft')) {
        this.logger.log(
          `Contract signing ignored - signer email contains 'swiftsoft': ${signerEmail}`,
        );
        return;
      }

      // Busca o contrato pelo autentiqueDocumentId
      const contract = await this.contractRepo.findOne({
        where: { autentiqueDocumentId: documentId, deletedAt: null } as any,
      });

      if (!contract) {
        this.logger.warn(
          `Contract not found for Autentique document ID: ${documentId}`,
        );
        return;
      }

      // Se já estiver assinado, ignora (idempotência)
      if (contract.status === 'signed') {
        this.logger.debug(
          `Contract ${contract.id} already signed, ignoring event`,
        );
        return;
      }

      // Marca como assinado (transacional: contrato + projeto + clientes)
      await this.markContractAsSignedTransactional(contract.id, {
        reason: 'autentique_webhook',
        signerEmail,
      });

      this.logger.log(
        `Contract ${contract.id} marked as signed via Autentique webhook (signer: ${signerEmail})`,
      );
    }
  }

  /**
   * Converte o HTML do contrato para DOCX e retorna o buffer.
   * Também salva o arquivo em uma pasta local para testes.
   */
  async exportContractToDocx(contractId: string): Promise<Buffer> {
    const contract = await this.findOneContract(contractId);

    // Valida se o HTML do contrato existe e não está vazio
    if (!contract.contractHtml || contract.contractHtml.trim().length === 0) {
      throw new BadRequestException(
        'O contrato não possui conteúdo HTML para converter. Certifique-se de que o contrato foi gerado corretamente.',
      );
    }

    const { HtmlDocxConverter } = await import('./html-docx-converter');
    const buffer = await HtmlDocxConverter.convert(contract.contractHtml);

    // Valida se o buffer foi gerado corretamente
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException(
        'Falha ao gerar o documento DOCX. O conteúdo pode estar vazio ou inválido.',
      );
    }

    return buffer;
  }

  async exportContractToPdf(contractId: string): Promise<Buffer> {
    const contract = await this.findOneContract(contractId);

    if (!contract.contractHtml || !contract.contractHtml.trim()) {
      throw new BadRequestException(
        'O contrato não possui conteúdo HTML para converter. Certifique-se de que o contrato foi gerado corretamente.',
      );
    }

    // Converte HTML diretamente para PDF usando Puppeteer
    // Muito mais simples e confiável que LibreOffice
    try {
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath:
          process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
      });

      try {
        const page = await browser.newPage();
        // Aumenta o timeout de navegação para 120 segundos (2 minutos)
        page.setDefaultNavigationTimeout(120000);
        page.setDefaultTimeout(120000);

        // Carrega as imagens para base64
        const logoPath = path.join(process.cwd(), 'public', 'logo', 'ss.png');
        const watermarkSvgPath = path.join(
          process.cwd(),
          'public',
          'logo',
          'ss-vertical.svg',
        );

        let logoBase64 = '';
        let watermarkBase64 = '';

        // Converte logo para base64
        if (fs.existsSync(logoPath)) {
          const logoBuffer = fs.readFileSync(logoPath);
          logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
        }

        // Converte marca d'água SVG para PNG com opacidade aplicada (10% = 90% transparência)
        if (fs.existsSync(watermarkSvgPath)) {
          const sharp = await import('sharp');
          const svgBuffer = fs.readFileSync(watermarkSvgPath);

          // Converte SVG para PNG
          const image = sharp.default(svgBuffer).png().ensureAlpha();

          // Aplica opacidade de 10% (90% transparência)
          const { data, info } = await image
            .raw()
            .ensureAlpha()
            .toBuffer({ resolveWithObject: true });
          const { width, height, channels } = info;

          // Multiplica o canal alpha (índice 3 de cada pixel) pela opacidade (0.1 = 10%)
          for (let i = 3; i < data.length; i += channels) {
            data[i] = Math.round(data[i] * 0.1);
          }

          // Cria nova imagem com alpha modificado
          const finalWatermark = await sharp
            .default(data, {
              raw: { width, height, channels },
            })
            .png()
            .toBuffer();

          watermarkBase64 = `data:image/png;base64,${finalWatermark.toString('base64')}`;
        }

        // Prepara HTML completo com estilos inline para melhor renderização
        // Remove espaços extras e normaliza o HTML
        const cleanedHtml = contract.contractHtml
          .replace(/^\s+|\s+$/g, '') // remove espaços no início/fim
          .replace(/\n\s*\n\s*\n/g, '\n') // remove múltiplas linhas vazias
          .trim();

        const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4;
      margin: 2cm 1cm 2cm 1cm;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #000;
      position: relative;
    }
    body > *:first-child {
      margin-top: 0 !important;
      padding-top: 0 !important;
    }
    table {
      border-collapse: collapse;
      width: calc(100% - 1px);
      max-width: calc(100% - 1px);
      margin: 0 !important;
      margin-top: 0 !important;
      margin-bottom: 0 !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
    td, th {
      border: 0.75pt solid #000;
      padding: 4pt;
      font-size: 9pt;
    }
    p {
      margin: 4pt 0;
    }
    p:first-child {
      margin-top: 0;
    }
    p:last-child {
      margin-bottom: 0;
    }
    .pdf-watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: -1;
      pointer-events: none;
      width: 7.8cm;
      height: 1.63cm;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  ${watermarkBase64 ? `<img src="${watermarkBase64}" class="pdf-watermark" alt="Watermark">` : ''}
  ${cleanedHtml}
</body>
</html>`;

        await page.setContent(fullHtml, {
          waitUntil: 'networkidle0',
          timeout: 120000, // 120 segundos (2 minutos)
        });

        // Prepara header template com logo à esquerda (aparece em todas as páginas)
        const headerTemplate = logoBase64
          ? `<div style="width: 100%; padding-top: 0.35cm; padding-left: 1cm; text-align: left; font-size: 0;">
               <img src="${logoBase64}" style="height: 0.73cm; width: 1.3cm; object-fit: contain; display: inline-block;" alt="Logo">
             </div>`
          : '';

        const pdfBuffer = await page.pdf({
          format: 'A4',
          margin: {
            top: '1.5cm', // Reduzido para dar espaço ao header
            right: '1cm',
            bottom: '2cm',
            left: '1cm',
          },
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: !!logoBase64,
          headerTemplate: headerTemplate,
          footerTemplate: '<div></div>',
        });

        await browser.close();

        if (!pdfBuffer || pdfBuffer.length === 0) {
          throw new BadRequestException(
            'Falha ao gerar o PDF. O documento resultante está vazio.',
          );
        }

        return Buffer.from(pdfBuffer);
      } catch (error) {
        await browser.close();
        throw error;
      }
    } catch (error: any) {
      this.logger.error(
        'Erro ao converter HTML para PDF com Puppeteer:',
        error,
      );

      let errorMessage =
        'Falha ao converter contrato para PDF. Verifique se Puppeteer está instalado corretamente.';

      if (error?.message) {
        errorMessage = `Erro na conversão: ${error.message}`;
      }

      throw new BadRequestException(errorMessage);
    }
  }
}
