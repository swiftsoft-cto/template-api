import {
  BadRequestException,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError, IsNull, In } from 'typeorm';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { ProjectScope } from './scope.entity';
import { Project } from '../projects/project.entity';
import { User } from '../../administration/users/user.entity';
import { Rule } from '../../administration/rules/rule.entity';
import { RoleRule } from '../../administration/roles/role-rule.entity';
import {
  CreateProjectScopeDto,
  UpdateProjectScopeDto,
  ListProjectScopeDto,
} from './scope.schema';
import { AiOrchestratorService } from '../../_ai/ai-orchestrator.service';
import {
  REQ_BOX_TEMPLATE,
  SCOPE_BOX_TEMPLATE,
  SPECS_BOX_TEMPLATE,
  MILESTONES_BOX_TEMPLATE,
} from './scope.templates';
import { NotificationsService } from '../../notifications/notifications.service';
import { TrackingService } from '../../_common/tracking/tracking.service';

@Injectable()
export class ProjectScopeService {
  constructor(
    @InjectRepository(ProjectScope)
    private readonly scopeRepo: Repository<ProjectScope>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Rule)
    private readonly ruleRepo: Repository<Rule>,
    @InjectRepository(RoleRule)
    private readonly roleRuleRepo: Repository<RoleRule>,
    private readonly i18n: I18nService,
    private readonly aiOrchestrator: AiOrchestratorService,
    private readonly notificationsService: NotificationsService,
    private readonly trackingService: TrackingService,
  ) {}

  // ===================== REGRAS CANÔNICAS =====================
  private readonly REQUIRED_MODULES = [
    {
      name: 'Fundação do projeto',
      description:
        "Módulo responsável pela criação da infraestrutura de nuvem, incluindo a provisão de VPS KVM para ambientes de stage e produção. Este módulo deve incluir hardening de segurança, configuração de firewall e implementação de TLS utilizando Traefik ou Caddy com certificados Let's Encrypt. Além disso, deve ser configurado o ambiente de CI/CD utilizando GitHub Actions para automação de build, testes, push de imagens e deploy. Backups diários da VPS e dumps noturnos do MySQL devem ser realizados, com retenções de 7 a 30 dias. A observabilidade deve ser garantida através de ferramentas como Prometheus, Grafana e Loki, com alertas configurados para uptime, erros 5xx, uso de CPU/RAM e espaço em disco.",
    },
    {
      name: 'Autenticação',
      description:
        'Módulo que implementa o sistema de autenticação e segurança do software. Este módulo deve permitir login e gerenciamento de sessões utilizando JWT (access e refresh tokens) e senhas criptografadas com bcrypt. Deve incluir a geração de API Keys com escopo e expiração, que serão utilizadas nas requisições. O controle de acesso deve ser gerenciado através de RBAC (Role-Based Access Control), definindo papéis como Administrador, Pedagógico, Comercial e Financeiro. Um Audit Log deve registrar todas as ações sensíveis, incluindo quem fez o que e quando, com detalhes sobre a rota, método, status e ator. Os endpoints principais devem incluir /auth/login, /auth/refresh, /auth/logout, /auth/me e /keys.',
    },
    {
      name: 'Amazon S3 (armazenamento de arquivos)',
      description:
        'Módulo de integração com Amazon S3 para armazenamento de arquivos. Este módulo permitirá o upload, download e gerenciamento de arquivos armazenados na nuvem, garantindo a segurança e a integridade dos dados. As funcionalidades incluirão a criação de buckets, configuração de permissões de acesso e a implementação de políticas de retenção de dados. O módulo também deve contemplar a integração com o sistema de autenticação para garantir que apenas usuários autorizados possam acessar ou manipular os arquivos armazenados.',
    },
  ];

  /**
   * Deriva módulos adicionais a partir do brief quando a IA não listar todos.
   * Evita duplicar nomes já presentes.
   */
  private deriveModulesFromBrief(briefText: string, already: Set<string>) {
    const addIfMissing = (name: string, description: string) => {
      if (!already.has(name)) {
        derived.push({ name, description, hasInsufficientInfo: false });
        already.add(name);
      }
    };

    const bt = String(briefText || '').toLowerCase();
    const derived: Array<{
      name: string;
      description: string;
      hasInsufficientInfo: boolean;
    }> = [];

    // 2.3 Sistema Administrativo Base (Painel ADM)
    if (bt.includes('painel adm') || bt.includes('sistema administrativo')) {
      addIfMissing(
        'Sistema Administrativo Base (Painel ADM)',
        'Módulo que fornece a interface administrativa para gestão de usuários e monitoramento do sistema. Este painel deve permitir a criação, edição e desativação de usuários, reset de senha e atribuição de papéis. Deve incluir dashboard técnico com saúde do servidor, uso de créditos/API e feed de audit log. A autorização deve ser aplicada na UI conforme RBAC e a performance alvo deve ser inferior a 300ms p95 em stage.',
      );
    }

    // Setup de Banco de Dados (MySQL)
    if (bt.includes('mysql') || bt.includes('banco de dados')) {
      addIfMissing(
        'Banco de Dados & Migrações (MySQL)',
        'Módulo responsável por modelagem e governança de dados incluindo criação das tabelas (users, roles, permissions, role_permissions, api_keys, audit_logs, sessions, students, mentorship_sessions), migrações idempotentes, índices em FKs e rotina de backup/restore validada.',
      );
    }

    // IA Mentora (RAG)
    if (
      bt.includes('rag') ||
      bt.includes('ia mentora') ||
      bt.includes('clone da carol')
    ) {
      addIfMissing(
        'IA Mentora (RAG)',
        'Módulo de recuperação aumentada por geração (RAG) com ingestão de aulas/livros, chunking e vetorização em base vetorial (pgvector/Qdrant). Deve prover API de consulta com retorno de contexto/citações e políticas de resposta aderentes ao "jeito Carol".',
      );
    }

    // WhatsApp + Whisper
    if (
      bt.includes('whatsapp') ||
      bt.includes('whisper') ||
      bt.includes('áudio')
    ) {
      addIfMissing(
        'WhatsApp (Conector & Voz)',
        'Conector oficial do WhatsApp com webhooks assinados para recepção/envio de mensagens, vinculação de número a student_id e transcrição de áudio via Whisper. Inclui retentativas e política anti-duplicidade.',
      );
    }

    // Integrações Sponte, Pipedrive, Google Workspace
    if (bt.includes('sponte')) {
      addIfMissing(
        'Integração Sponte',
        'Sincronização de dados acadêmicos e financeiros do aluno (progresso, pendências) com reconciliação e relatórios de divergência. Jobs periódicos e/ou webhooks conforme disponibilidade.',
      );
    }
    if (bt.includes('pipedrive')) {
      addIfMissing(
        'Integração Pipedrive',
        'Conector para deals, persons e organizations; webhooks para mudanças de estágio e playbooks comerciais dirigidos pela interação no WhatsApp/IA.',
      );
    }
    if (bt.includes('google workspace') || bt.includes('drive')) {
      addIfMissing(
        'Integração Google Drive',
        'Indexação de pastas/arquivos e metadados no Drive, com controle de permissão e ingestão para o mecanismo de RAG, tornando os conteúdos pesquisáveis.',
      );
    }

    return derived;
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

  private escapeRegExp(s: string) {
    return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Extrai módulos de uma tabela de cronograma no brief (se existir)
   * Procura por padrões como tabelas markdown ou listas numeradas
   */
  private extractModulesFromCronograma(briefText: string): string[] {
    const modules: string[] = [];

    // Padrão 1: Tabela markdown com coluna "Módulo"
    const markdownTableRegex =
      /\|.*?Módulo.*?\|[\s\S]*?\|[-\s|]+\|[\s\S]*?((?:\|[^|\n]+\|[\s\S]*?)+)/i;
    const tableMatch = briefText.match(markdownTableRegex);

    if (tableMatch) {
      const tableContent = tableMatch[1];
      const rows = tableContent.split('\n').filter((line) => {
        const trimmed = line.trim();
        return (
          trimmed.startsWith('|') &&
          trimmed.length > 2 &&
          !trimmed.match(/^[\s|:\-]+$/) && // Não é linha separadora
          !trimmed.match(/Módulo|Pessoas|Meses|Hrs|TOTAL/i)
        ); // Não é cabeçalho
      });

      for (const row of rows) {
        const cols = row
          .split('|')
          .map((c) => c.trim())
          .filter((c) => c);
        if (cols.length > 0) {
          const moduleName = cols[0];
          // Ignorar linhas que são claramente não-módulos
          if (
            moduleName &&
            !moduleName.match(/^[\d\s\-]+$/) && // Não é só números
            !moduleName.match(/^(TOTAL|Subtotal|[\u2014\-]|N\/A)$/i)
          ) {
            modules.push(moduleName);
          }
        }
      }
    }

    // Padrão 2: Lista numerada antes ou depois de "CRONOGRAMA"
    if (modules.length === 0) {
      const cronogramaSection = briefText.match(/CRONOGRAMA[\s\S]{0,2000}/i);
      if (cronogramaSection) {
        const sectionText = cronogramaSection[0];
        // Procurar por padrões como "1. Nome do módulo" ou "1) Nome do módulo"
        const numberedListRegex = /(?:^|\n)\s*\d+[\.\)]\s*([^\n]+)/gm;
        const matches = sectionText.matchAll(numberedListRegex);

        for (const match of matches) {
          const moduleName = match[1].trim();
          // Filtrar nomes muito curtos ou que são claramente não-módulos
          if (
            moduleName.length > 3 &&
            !moduleName.match(
              /^(Módulo|Pessoas|Meses|Hrs|TOTAL|[\u2014\-]|N\/A)$/i,
            )
          ) {
            modules.push(moduleName);
          }
        }
      }
    }

    // Padrão 3: Lista após "Módulo" ou "Módulos:"
    if (modules.length === 0) {
      const modulesSectionRegex =
        /(?:Módulos?|CRONOGRAMA)[:\s]*\n((?:\s*\d+[\.\)]\s*[^\n]+\n?)+)/i;
      const modulesMatch = briefText.match(modulesSectionRegex);
      if (modulesMatch) {
        const listText = modulesMatch[1];
        const listItems = listText.match(/(?:^|\n)\s*\d+[\.\)]\s*([^\n]+)/gm);
        if (listItems) {
          for (const item of listItems) {
            const moduleName = item.replace(/^\s*\d+[\.\)]\s*/, '').trim();
            if (moduleName.length > 3) {
              modules.push(moduleName);
            }
          }
        }
      }
    }

    return modules;
  }

  private renderTemplate(html: string, vars: Record<string, string>): string {
    let out = String(html ?? '');
    for (const [k, v] of Object.entries(vars ?? {})) {
      const re = new RegExp(`\\{\\{\\s*${this.escapeRegExp(k)}\\s*\\}\\}`, 'g');
      out = out.replace(re, String(v ?? ''));
    }
    return out;
  }

  private vOrPo(v: any): string {
    const s = String(v ?? '').trim();
    return s.length ? s : '**A DEFINIR (PO)**';
  }

  private toYesNo(v: any): string {
    const s = String(v ?? '')
      .trim()
      .toLowerCase();
    if (!s) return '**A DEFINIR (PO)**';
    if (['sim', 'yes', 'true', '1'].includes(s)) return 'Sim';
    if (['não', 'nao', 'no', 'false', '0'].includes(s)) return 'Não';
    return this.vOrPo(v);
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

  // ===================== PROMPTS (4 chamadas) =====================

  private baseContractRules(): string {
    return `
Você é um especialista em análise de requisitos de software e redação de escopos de projeto formais (estilo contrato).

REGRAS GERAIS:
- Use APENAS informações suportadas pelo brief.
- Se algo não estiver explícito, responda "**A DEFINIR (PO)**".
- Não invente nomes, integrações, dados, horários ou SLAs.
- Linguagem formal, objetiva, orientada a contrato.

REGRA DE OURO:
- Classifique o projeto como:
  (1) "LANDING_PAGE/INSTITUCIONAL" ou
  (2) "SISTEMA/APLICAÇÃO"

MÓDULOS OBRIGATÓRIOS (SE "SISTEMA/APLICAÇÃO"):
- "Fundação do projeto"
- "Autenticação"
- "Amazon S3 (armazenamento de arquivos)"

PAGAMENTOS (ANÁLISE OBRIGATÓRIA):
- Sempre diga se existe cobrança (Sim/Não). Se Não, preencha como "Não se aplica".
`.trim();
  }

  private buildSpecsPrompt(briefText: string): string {
    // Detectar se há uma tabela de cronograma no brief
    const hasCronogramaTable = /CRONOGRAMA|Módulo.*Pessoas.*Meses.*Hrs/i.test(
      briefText,
    );

    // Extrair módulos da tabela se existir
    const cronogramaModules = hasCronogramaTable
      ? this.extractModulesFromCronograma(briefText)
      : [];

    const cronogramaInstruction =
      cronogramaModules.length > 0
        ? `
⚠️ ATENÇÃO CRÍTICA - TABELA DE CRONOGRAMA DETECTADA:
O brief contém uma tabela de cronograma com os seguintes módulos:
${cronogramaModules.map((m, i) => `${i + 1}. ${m}`).join('\n')}

REGRA ABSOLUTA: Você DEVE usar EXATAMENTE estes módulos, nesta ordem, com estes nomes.
- NÃO altere os nomes dos módulos
- NÃO reordene os módulos
- NÃO adicione módulos extras
- NÃO remova módulos
- Use os IDs sequenciais (1, 2, 3...) na mesma ordem da lista acima
- Se o projeto for "SISTEMA/APLICAÇÃO", verifique se os módulos obrigatórios já estão na lista; se não estiverem, adicione-os mantendo a ordem original

Os módulos obrigatórios para "SISTEMA/APLICAÇÃO" são:
1. Fundação do projeto
2. Autenticação
3. Amazon S3 (armazenamento de arquivos)

Se algum módulo obrigatório não estiver na lista acima, adicione-o mantendo a ordem original dos módulos da tabela.
`
        : '';

    return `
${this.baseContractRules()}

TAREFA (CHAMADA 1/4): Gerar APENAS as "ESPECIFICAÇÕES FUNCIONAIS" em JSON estruturado.

BRIEF:
---
${briefText}
---
${cronogramaInstruction}

IMPORTANTE:
- PROIBIDO criar nomes fictícios para o sistema (ex.: "X-ADM"). O nome/descrição deve vir do brief; se não existir, "**A DEFINIR (PO)**".
- EXTRAIA do brief a descrição inicial do projeto em "solutionSummary" (uma frase, estilo contrato).
- Você DEVE retornar "modules" como lista de objetos com:
  - id (inteiro começando em 1, NÃO use 0),
  - name (nome do módulo - DEVE ser EXATAMENTE como especificado acima se houver tabela de cronograma),
  - description (texto contratual corrido DETALHADO, podendo ter quebras de linha),
  - hasInsufficientInfo (boolean: true se não houver informações suficientes no brief para descrever o módulo adequadamente).

REGRAS PARA DESCRIÇÃO DE MÓDULOS:
- A descrição DEVE ser DETALHADA e ESPECÍFICA, não genérica.
- Evite descrições vagas como "Integração com sistemas existentes" ou "Módulo de gestão".
- Inclua: quais funcionalidades específicas, quais dados serão manipulados, quais ações o usuário poderá realizar, quais regras de negócio principais, quais integrações específicas (se aplicável).
- Exemplo BOM: "Módulo de gestão de clientes que permite cadastrar, editar e consultar informações de clientes (nome, CPF/CNPJ, endereço, telefone, e-mail). O usuário poderá criar novos clientes através de formulário, buscar clientes por nome/CPF, visualizar histórico de interações e exportar lista em Excel. Integra com API de validação de CPF/CNPJ e sistema de e-mail para envio de boletos."
- Exemplo RUIM: "Módulo de gestão de clientes para gerenciar informações de clientes."
- Se o brief não fornecer informações suficientes para criar uma descrição detalhada e específica, marque "hasInsufficientInfo" como true e ainda assim tente descrever o máximo possível baseado no nome do módulo e contexto geral do projeto.

${
  cronogramaModules.length === 0
    ? `
- Use EXATAMENTE os módulos do brief. Não invente "Relatórios e Análises" se isso não estiver no brief.
- Se o brief trouxer uma lista "Relação de funcionalidades", use-a como fonte principal dos nomes/ordem/ids.
- Se o projeto for "SISTEMA/APLICAÇÃO", inclua SEMPRE os 3 módulos obrigatórios (na lista) **nesta ordem**: 1) Fundação do projeto, 2) Autenticação, 3) Amazon S3 (armazenamento de arquivos).
`
    : ''
}
- "mainJourneySteps" deve ser uma lista de passos (strings), sem HTML.
- "integrationsList" deve ser uma lista de integrações (strings). Se não houver, use "**A DEFINIR (PO)**".

RETORNE SOMENTE JSON VÁLIDO (sem markdown/explicação).
`.trim();
  }

  private buildScopePrompt(briefText: string, modules: string[]): string {
    return `
${this.baseContractRules()}

TAREFA (CHAMADA 2/4): Gerar APENAS o "ESCOPO DO PROJETO" (sem especificações) em JSON estruturado.

BRIEF:
---
${briefText}
---

MÓDULOS CANÔNICOS (não altere, não reordene, não adicione):
${modules.map((m, i) => `${i + 1}. ${m}`).join('\n')}

IMPORTANTE:
- Você deve preencher campos de contexto/objetivo/plataformas/usuários e "fora de escopo".
- NÃO invente módulos; a lista já foi fornecida.
- Para fora de escopo, se não houver, use "**A DEFINIR (PO)**".

RETORNE SOMENTE JSON VÁLIDO (sem markdown/explicação).
`.trim();
  }

  private buildMilestonesPrompt(modules: string[]): string {
    return `
Você é um especialista em planejamento macro de projeto.

TAREFA (CHAMADA 3/4): Gerar APENAS o cronograma macro por módulos (por esforço relativo).

⚠️ REGRAS CRÍTICAS E OBRIGATÓRIAS:
- Use EXATAMENTE os módulos fornecidos abaixo (mesmos nomes e mesma ordem).
- NÃO altere os nomes dos módulos
- NÃO reordene os módulos
- NÃO adicione módulos extras
- NÃO remova módulos
- Cada linha deve ter: module (string exata do nome), points (inteiro), start (string), end (string)
- Não normalize pontos; utilize valores inteiros coerentes por módulo.
- start e end DEVEM ser preenchidos quando possível (ex.: "Jan/2026").
- Não inclua texto extra.

MÓDULOS OBRIGATÓRIOS (use EXATAMENTE estes nomes e nesta ordem):
${modules.map((m, i) => `${i + 1}. ${m}`).join('\n')}

VALIDAÇÃO ANTES DE RETORNAR:
- [ ] Todos os ${modules.length} módulos estão presentes?
- [ ] Os nomes dos módulos estão EXATAMENTE iguais aos fornecidos?
- [ ] A ordem dos módulos está correta?
- [ ] Todos possuem "points" inteiros e "start" / "end" preenchidos?

RETORNE SOMENTE JSON VÁLIDO (sem markdown/explicação).
`.trim();
  }

  private buildInfraPrompt(briefText: string): string {
    return `
${this.baseContractRules()}

TAREFA (CHAMADA 4/4): Gerar APENAS "REQUISITOS E INFRAESTRUTURA" em JSON estruturado.

BRIEF:
---
${briefText}
---

TEXTO PADRÃO (use este padrão, a menos que o brief especifique algo diferente):

1. Condições do CLIENTE:
a) Acesso aos sistemas/softwares/documentações... (sem complemento adicional)
b) Indicação de responsáveis (pontos focais)... (sem complemento adicional)
c) Disponibilização de credenciais e variáveis... (sem complemento adicional)
d) Fornecimento de dados de teste... (sem complemento adicional)
e) Prévia de templates, layouts e termos legais... (sem complemento adicional)
f) Diretrizes e políticas de segurança... (sem complemento adicional)
g) Janela de disponibilidade... (sem complemento adicional)
h) Acesso aos ambientes... (sem complemento adicional)

2. Infraestrutura mínima:
a) Máquina Virtual: CPU 4 vCPU, 16 GB RAM (recomendado 16 GB se houver picos de geração de PDF/IA), 80–100 GB SSD, Ubuntu Server 22.04 LTS, IP público, Apache (reverse proxy/TLS), PM2, Node.js v20; portas 80/443 expostas e egress para S3/OpenAI/SMTP
b) Banco de Dados PostgreSQL: gerenciado (ex.: RDS) ou em VM própria com 2–4 vCPU, 8–16 GB RAM, 100 GB SSD (IOPS provisionado conforme volume), backups automáticos e política de retenção
c) AWS S3: bucket nomeado, região definida, CORS e versionamento habilitados, bem como usuário IAM com política mínima (Put/Get/Head/Delete) restrita aos prefixos do projeto, e chaves de acesso ativas
d) Provedor SMTP transacional: host, porta, TLS/STARTTLS, credenciais com limites compatíveis ao envio de e-mails de confirmação/recuperação/operacionais
e) DNS e certificados TLS: válidos para os domínios/ambientes (dev, homolog, prod), incluindo subdomínios para API e WebSocket
f) Ambiente de execução: Backend (Node.js LTS/NestJS) e Frontend (React/Vite), quando auto-hospedados pelo CLIENTE, com CORS configurado e portas liberadas
g) Ferramentas de observabilidade: logs e métricas com acesso ao CONTRATADO (ex.: Sentry/OTel/Prometheus/alternativas), para acompanhamento e suporte
h) Políticas de segurança de rede: firewall/VPN/allowlists que permitam o tráfego necessário entre frontend, API, WebSocket e serviços gerenciados
i) Conta e faturamento AWS: ativos para o uso de S3, VM e eventuais serviços correlatos
j) Repositório Git e/ou pipeline CI/CD: do CLIENTE, quando requerido para deploy nos ambientes-alvo

IMPORTANTE:
- Para os campos "client*": se o brief não especificar complemento adicional, retorne string vazia "". Se especificar, retorne apenas o complemento (ex.: ": com acesso via VPN").
- Para os campos "infra*": retorne o texto completo conforme padrão acima, a menos que o brief especifique algo diferente.
  - Se for padrão: retorne o texto completo (ex.: ": CPU 4 vCPU, 16 GB RAM...")
  - Se o brief especificar diferente: adapte o texto (ex.: se brief diz "GCP", retorne ": GCP equivalente com CPU 4 vCPU...")
- NÃO use "**A DEFINIR (PO)**" - sempre use o padrão ou a variação do brief.
- Todos os campos são obrigatórios (retorne pelo menos string vazia "").

RETORNE SOMENTE JSON VÁLIDO (sem markdown/explicação).
`.trim();
  }

  // ===================== SCHEMAS (Structured Outputs) =====================

  private specsSchema() {
    return {
      name: 'project_specs',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          solutionSummary: { type: 'string' }, // Ex.: "Desenvolvimento de software personalizado..."
          productType: { type: 'string' }, // LANDING_PAGE/INSTITUCIONAL | SISTEMA/APLICAÇÃO
          mainJourneySteps: { type: 'array', items: { type: 'string' } },
          mainJourneyOutcome: { type: 'string' },
          modules: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'integer' }, // 1..n
                name: { type: 'string' }, // "Fundação do projeto"
                description: { type: 'string' }, // Texto corrido contratual detalhado (pode ter quebras de linha)
                hasInsufficientInfo: { type: 'boolean' }, // true se não houver informações suficientes no brief
              },
              required: ['id', 'name', 'description', 'hasInsufficientInfo'],
            },
          },
          integrationsList: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'solutionSummary',
          'productType',
          'mainJourneySteps',
          'mainJourneyOutcome',
          'modules',
          'integrationsList',
        ],
      },
    };
  }

  private scopeSchema() {
    return {
      name: 'project_scope',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          projectName: { type: 'string' },
          projectGoal: { type: 'string' },
          audienceType: { type: 'string' },
          audienceDescription: { type: 'string' },
          productType: { type: 'string' },
          isSaas: { type: 'string' },
          isWhitelabel: { type: 'string' },
          webRequired: { type: 'string' },
          webResponsive: { type: 'string' },
          webPwa: { type: 'string' },
          mobileRequired: { type: 'string' },
          ios: { type: 'string' },
          android: { type: 'string' },
          mobileType: { type: 'string' },
          environments: { type: 'string' },
          rolesList: { type: 'string' },
          authMethod: { type: 'string' },
          permissionModel: { type: 'string' },
          auditRequired: { type: 'string' },
          outOfScope: { type: 'string' },
        },
        required: [
          'projectName',
          'projectGoal',
          'audienceType',
          'audienceDescription',
          'productType',
          'isSaas',
          'isWhitelabel',
          'webRequired',
          'webResponsive',
          'webPwa',
          'mobileRequired',
          'ios',
          'android',
          'mobileType',
          'environments',
          'rolesList',
          'authMethod',
          'permissionModel',
          'auditRequired',
          'outOfScope',
        ],
      },
    };
  }

  private milestonesSchema() {
    return {
      name: 'project_milestones',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rows: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                module: { type: 'string' },
                points: { type: 'integer', minimum: 0, maximum: 10000 },
                start: { type: 'string' },
                end: { type: 'string' },
              },
              required: ['module', 'points', 'start', 'end'],
            },
          },
        },
        required: ['rows'],
      },
    };
  }

  private infraSchema() {
    return {
      name: 'project_infra',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          clientSystemsAccess: { type: 'string' }, // Complemento adicional ou ""
          clientFocalPoints: { type: 'string' },
          clientEnvVars: { type: 'string' },
          clientTestData: { type: 'string' },
          clientTemplatesLegal: { type: 'string' },
          clientSecurityPolicies: { type: 'string' },
          clientAvailabilityWindow: { type: 'string' },
          clientEnvAccess: { type: 'string' },

          infraAppVmSpecs: { type: 'string' }, // Especificações completas ou padrão
          infraDbSpecs: { type: 'string' },
          infraS3Specs: { type: 'string' },
          infraSmtpSpecs: { type: 'string' },
          infraDnsTlsSpecs: { type: 'string' },
          infraRuntimeSpecs: { type: 'string' },
          infraObservabilitySpecs: { type: 'string' },
          infraNetworkSecuritySpecs: { type: 'string' },
          infraBillingSpecs: { type: 'string' },
          infraCicdSpecs: { type: 'string' },
        },
        required: [
          'clientSystemsAccess',
          'clientFocalPoints',
          'clientEnvVars',
          'clientTestData',
          'clientTemplatesLegal',
          'clientSecurityPolicies',
          'clientAvailabilityWindow',
          'clientEnvAccess',
          'infraAppVmSpecs',
          'infraDbSpecs',
          'infraS3Specs',
          'infraSmtpSpecs',
          'infraDnsTlsSpecs',
          'infraRuntimeSpecs',
          'infraObservabilitySpecs',
          'infraNetworkSecuritySpecs',
          'infraBillingSpecs',
          'infraCicdSpecs',
        ],
      },
    };
  }

  // ===================== RENDER HELPERS =====================

  private renderModulesNarrative(modules: any[]): string {
    const list = Array.isArray(modules) ? modules : [];
    return list
      .sort((a, b) => Number(a?.id ?? 1) - Number(b?.id ?? 1))
      .map((m) => {
        const id =
          Number.isFinite(m?.id) && m.id >= 1
            ? String(m.id)
            : '**A DEFINIR (PO)**';
        const name = this.vOrPo(m?.name);
        const desc = this.vOrPo(m?.description).replace(/\n/g, '<br/>');
        const hasInsufficientInfo = Boolean(m?.hasInsufficientInfo);

        let warningHtml = '';
        if (hasInsufficientInfo) {
          warningHtml =
            '<br/><span class="attention"><strong>⚠ ATENÇÃO:</strong> Não foram encontradas informações suficientes no brief para criar uma descrição detalhada deste módulo. É necessário que o Product Owner forneça mais detalhes sobre as funcionalidades, dados manipulados, ações do usuário e regras de negócio específicas deste módulo para que ambas as partes (CLIENTE e CONTRATADO) tenham clareza sobre o que precisa ser desenvolvido.</span>';
        }

        return `<p style="margin:0 0 8px 0; text-align: justify; line-height: 1.15;"><strong>${id}. ${name}</strong><br/>${desc}${warningHtml}</p>`;
      })
      .join('\n');
  }

  private renderFunctionalitiesList(modules: any[]): string {
    const list = Array.isArray(modules) ? modules : [];
    return list
      .sort((a, b) => Number(a?.id ?? 1) - Number(b?.id ?? 1))
      .map((m) => {
        const id =
          Number.isFinite(m?.id) && m.id >= 1
            ? String(m.id)
            : '**A DEFINIR (PO)**';
        return `<li>${this.vOrPo(m?.name)} (${id})</li>`;
      })
      .join('\n');
  }

  private renderInfraValue(v: any, fieldName?: string): string {
    const s = String(v ?? '').trim();

    // Para campos client*: se vazio, não adiciona nada (texto já está completo no template)
    // Se tiver conteúdo, adiciona ": " antes
    if (!fieldName || !fieldName.startsWith('infra_')) {
      return s ? `: ${s}` : '';
    }

    // Para campos infra*: se vazio, retorna texto padrão; se tiver conteúdo, usa o conteúdo
    // O template já tem ": " antes do placeholder
    if (!s) {
      // Valores padrão para campos infra quando vazio
      const defaults: Record<string, string> = {
        infra_app_vm_specs:
          'CPU 4 vCPU, 16 GB RAM (recomendado 16 GB se houver picos de geração de PDF/IA), 80–100 GB SSD, Ubuntu Server 22.04 LTS, IP público, Apache (reverse proxy/TLS), PM2, Node.js v20; portas 80/443 expostas e egress para S3/OpenAI/SMTP',
        infra_db_specs:
          'gerenciado (ex.: RDS) ou em VM própria com 2–4 vCPU, 8–16 GB RAM, 100 GB SSD (IOPS provisionado conforme volume), backups automáticos e política de retenção',
        infra_s3_specs:
          'bucket nomeado, região definida, CORS e versionamento habilitados, bem como usuário IAM com política mínima (Put/Get/Head/Delete) restrita aos prefixos do projeto, e chaves de acesso ativas',
        infra_smtp_specs:
          'host, porta, TLS/STARTTLS, credenciais com limites compatíveis ao envio de e-mails de confirmação/recuperação/operacionais',
        infra_dns_tls_specs:
          'válidos para os domínios/ambientes (dev, homolog, prod), incluindo subdomínios para API e WebSocket',
        infra_runtime_specs:
          'Backend (Node.js LTS/NestJS) e Frontend (React/Vite), quando auto-hospedados pelo CLIENTE, com CORS configurado e portas liberadas',
        infra_observability_specs:
          'logs e métricas com acesso ao CONTRATADO (ex.: Sentry/OTel/Prometheus/alternativas), para acompanhamento e suporte',
        infra_network_security_specs:
          'firewall/VPN/allowlists que permitam o tráfego necessário entre frontend, API, WebSocket e serviços gerenciados',
        infra_billing_specs:
          'ativos para o uso de S3, VM e eventuais serviços correlatos',
        infra_cicd_specs:
          'do CLIENTE, quando requerido para deploy nos ambientes-alvo',
      };
      return defaults[fieldName] || '';
    }
    return s;
  }

  private renderModulesScopeList(modules: string[]): string {
    return (modules ?? []).map((m) => `<li>${this.vOrPo(m)}</li>`).join('\n');
  }

  private renderMilestonesRows(modules: string[], rows: any[]): string {
    // Indexa linhas retornadas pela IA
    const byModule = new Map<string, any>();
    for (const r of rows ?? []) {
      if (r?.module) byModule.set(String(r.module), r);
    }

    // Defaults fixos para os 3 módulos obrigatórios, se ausentes/incompletos
    const FIXED_DEFAULTS: Record<
      string,
      { points: number; start: string; end: string }
    > = {
      'Fundação do projeto': { points: 40, start: 'Jan/2026', end: 'Jan/2026' },
      Autenticação: { points: 40, start: 'Jan/2026', end: 'Jan/2026' },
      'Amazon S3 (armazenamento de arquivos)': {
        points: 80,
        start: 'Jan/2026',
        end: 'Jan/2026',
      },
    };

    const out: string[] = [];
    for (let i = 0; i < (modules?.length ?? 0); i++) {
      const name = String(modules[i]);
      const r = byModule.get(name) || {};
      const fix = FIXED_DEFAULTS[name];

      const pointsVal =
        Number.isFinite(r?.points) && r.points >= 0
          ? Number(r.points)
          : fix
            ? fix.points
            : 0;
      const startVal = String(r?.start || fix?.start || '');
      const endVal = String(r?.end || fix?.end || '');

      const points = String(pointsVal);
      const start = startVal;
      const end = endVal;

      out.push(
        `<tr>
  <td style="border:1px solid #000; padding:6px;">${i + 1}</td>
  <td style="border:1px solid #000; padding:6px;">${this.vOrPo(name)}</td>
  <td style="border:1px solid #000; padding:6px;">${points}</td>
  <td style="border:1px solid #000; padding:6px;">${start}</td>
  <td style="border:1px solid #000; padding:6px;">${end}</td>
</tr>`,
      );
    }
    return out.join('\n');
  }

  private renderLiList(items: string[]): string {
    const arr = (items ?? [])
      .map((x) => String(x ?? '').trim())
      .filter(Boolean);
    if (!arr.length) return `<li>**A DEFINIR (PO)**</li>`;
    return arr.map((x) => `<li>${x}</li>`).join('\n');
  }

  async generateScope(
    briefText: string,
    userId: string,
    userName?: string,
  ): Promise<string> {
    try {
      // ===================== CHAMADA 1/4: ESPECIFICAÇÕES =====================
      const specs = await this.aiOrchestrator.generateStrictJson(
        this.buildSpecsPrompt(briefText),
        process.env.AI_SCOPE_SPECS_MODEL ||
          process.env.AI_SCOPE_MODEL ||
          'gpt-4o-mini',
        {
          maxTokens: 5000,
          timeoutMs: 60000,
          retries: 2,
          jsonSchema: this.specsSchema(),
          userId,
          userName,
          callName: 'Especificações do Projeto',
        },
      );

      // ---------- ENFORCE módulos obrigatórios + DERIVADOS DO BRIEF ----------
      const incomingModules: any[] = Array.isArray(specs?.modules)
        ? specs.modules
        : [];

      // set para checar duplicidade por nome exato
      const seen = new Set<string>();

      // (1) Começa com os 3 obrigatórios
      const list: any[] = this.REQUIRED_MODULES.map((req) => {
        seen.add(req.name);
        return {
          name: req.name,
          description: req.description,
          hasInsufficientInfo: false,
        };
      });

      // (2) Deriva módulos a partir do brief e adiciona se não existirem
      const derived = this.deriveModulesFromBrief(briefText, seen);
      list.push(...derived);

      // (3) Adiciona quaisquer módulos que a IA trouxe e que ainda não estejam presentes
      for (const m of incomingModules) {
        const name = String(m?.name ?? '').trim();
        if (!name) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        list.push({
          name,
          description:
            String(m?.description ?? '').trim() || '**A DEFINIR (PO)**',
          hasInsufficientInfo: Boolean(m?.hasInsufficientInfo),
        });
      }

      // (4) Numera todos (1..n) respeitando a ordem definida acima
      const modulesObjs: any[] = list.map((m, idx) => ({
        id: idx + 1,
        name: m.name,
        description: m.description,
        hasInsufficientInfo: Boolean(m.hasInsufficientInfo),
      }));
      const modulesNames: string[] = modulesObjs
        .sort((a, b) => Number(a?.id ?? 0) - Number(b?.id ?? 0))
        .map((m) => String(m?.name ?? '').trim())
        .filter(Boolean);

      // ===================== CHAMADA 2/4: ESCOPO =====================
      const scope = await this.aiOrchestrator.generateStrictJson(
        this.buildScopePrompt(briefText, modulesNames),
        process.env.AI_SCOPE_SCOPE_MODEL ||
          process.env.AI_SCOPE_MODEL ||
          'gpt-4o-mini',
        {
          maxTokens: 2500,
          timeoutMs: 60000,
          retries: 2,
          jsonSchema: this.scopeSchema(),
          userId,
          userName,
          callName: 'Escopo do Projeto',
        },
      );

      // ===================== CHAMADA 3/4: CRONOGRAMA =====================
      const milestones = await this.aiOrchestrator.generateStrictJson(
        this.buildMilestonesPrompt(modulesNames),
        process.env.AI_SCOPE_MILESTONES_MODEL || 'gpt-4o-mini',
        {
          maxTokens: 1200,
          timeoutMs: 60000,
          retries: 2,
          jsonSchema: this.milestonesSchema(),
          userId,
          userName,
          callName: 'Cronograma do Projeto',
        },
      );

      // ===================== CHAMADA 4/4: REQUISITOS/INFRA =====================
      const infra = await this.aiOrchestrator.generateStrictJson(
        this.buildInfraPrompt(briefText),
        process.env.AI_SCOPE_INFRA_MODEL ||
          process.env.AI_SCOPE_MODEL ||
          'gpt-4o-mini',
        {
          maxTokens: 2500,
          timeoutMs: 60000,
          retries: 2,
          jsonSchema: this.infraSchema(),
          userId,
          userName,
          callName: 'Infraestrutura do Projeto',
        },
      );

      // ===================== RENDER FINAL (HTML FIXO) =====================
      const modulesScopeListHtml = this.renderModulesScopeList(modulesNames);
      const modulesNarrativeHtml = this.renderModulesNarrative(modulesObjs);
      const functionalitiesListHtml =
        this.renderFunctionalitiesList(modulesObjs);

      const mainJourneyStepsHtml = this.renderLiList(specs?.mainJourneySteps);

      const milestonesRowsHtml = this.renderMilestonesRows(
        modulesNames,
        milestones?.rows,
      );

      const scopeHtml = this.renderTemplate(SCOPE_BOX_TEMPLATE, {
        project_name: this.vOrPo(scope?.projectName),
        project_goal: this.vOrPo(scope?.projectGoal),
        audience_type: this.vOrPo(scope?.audienceType),
        audience_description: this.vOrPo(scope?.audienceDescription),
        product_type: this.vOrPo(scope?.productType),
        is_saas: this.vOrPo(scope?.isSaas),
        is_whitelabel: this.vOrPo(scope?.isWhitelabel),
        web_required: this.vOrPo(scope?.webRequired),
        web_responsive: this.vOrPo(scope?.webResponsive),
        web_pwa: this.vOrPo(scope?.webPwa),
        mobile_required: this.vOrPo(scope?.mobileRequired),
        ios: this.vOrPo(scope?.ios),
        android: this.vOrPo(scope?.android),
        mobile_type: this.vOrPo(scope?.mobileType),
        environments: this.vOrPo(scope?.environments),
        roles_list: this.vOrPo(scope?.rolesList),
        auth_method: this.vOrPo(scope?.authMethod),
        permission_model: this.vOrPo(scope?.permissionModel),
        audit_required: this.vOrPo(scope?.auditRequired),
        out_of_scope: this.vOrPo(scope?.outOfScope),
        modules_scope_list: modulesScopeListHtml,
      });

      const specsHtml = this.renderTemplate(SPECS_BOX_TEMPLATE, {
        solution_summary: this.vOrPo(specs?.solutionSummary),
        main_journey_steps: mainJourneyStepsHtml,
        main_journey_outcome: this.vOrPo(specs?.mainJourneyOutcome),
        modules_narrative: modulesNarrativeHtml,
        functionalities_list: functionalitiesListHtml,
      });

      const milestonesHtml = this.renderTemplate(MILESTONES_BOX_TEMPLATE, {
        milestones_table_rows: milestonesRowsHtml,
      });

      const reqHtml = this.renderTemplate(REQ_BOX_TEMPLATE, {
        client_systems_access: this.renderInfraValue(
          infra?.clientSystemsAccess,
        ),
        client_focal_points: this.renderInfraValue(infra?.clientFocalPoints),
        client_env_vars: this.renderInfraValue(infra?.clientEnvVars),
        client_test_data: this.renderInfraValue(infra?.clientTestData),
        client_templates_legal: this.renderInfraValue(
          infra?.clientTemplatesLegal,
        ),
        client_security_policies: this.renderInfraValue(
          infra?.clientSecurityPolicies,
        ),
        client_availability_window: this.renderInfraValue(
          infra?.clientAvailabilityWindow,
        ),
        client_env_access: this.renderInfraValue(infra?.clientEnvAccess),

        infra_app_vm_specs: this.renderInfraValue(
          infra?.infraAppVmSpecs,
          'infra_app_vm_specs',
        ),
        infra_db_specs: this.renderInfraValue(
          infra?.infraDbSpecs,
          'infra_db_specs',
        ),
        infra_s3_specs: this.renderInfraValue(
          infra?.infraS3Specs,
          'infra_s3_specs',
        ),
        infra_smtp_specs: this.renderInfraValue(
          infra?.infraSmtpSpecs,
          'infra_smtp_specs',
        ),
        infra_dns_tls_specs: this.renderInfraValue(
          infra?.infraDnsTlsSpecs,
          'infra_dns_tls_specs',
        ),
        infra_runtime_specs: this.renderInfraValue(
          infra?.infraRuntimeSpecs,
          'infra_runtime_specs',
        ),
        infra_observability_specs: this.renderInfraValue(
          infra?.infraObservabilitySpecs,
          'infra_observability_specs',
        ),
        infra_network_security_specs: this.renderInfraValue(
          infra?.infraNetworkSecuritySpecs,
          'infra_network_security_specs',
        ),
        infra_billing_specs: this.renderInfraValue(
          infra?.infraBillingSpecs,
          'infra_billing_specs',
        ),
        infra_cicd_specs: this.renderInfraValue(
          infra?.infraCicdSpecs,
          'infra_cicd_specs',
        ),
      });

      const attentionStyle = `<style>
/* Padronização visual do HTML gerado (CKEditor/HTML fragment) */
table, tbody, tr, td, th,
ol, ul, li,
p, div, span,
strong, em {
  line-height: 1.15;
}

.attention {
  background-color: yellow;
  padding: 4px 8px;
  display: inline-block;
  margin-top: 4px;
}
</style>`;

      return `${attentionStyle}\n${scopeHtml}\n\n${specsHtml}\n\n${milestonesHtml}\n\n${reqHtml}`.trim();
    } catch (error: any) {
      const lang = this.getLang();
      try {
        await this.i18n.translate('common.error', { lang });
      } catch {
        // Ignoramos falhas na tradução apenas para mensagem de fallback
      }
      throw new InternalServerErrorException(
        `Falha ao gerar escopo: ${error?.message || 'Erro desconhecido'}`,
      );
    }
  }

  async create(dto: CreateProjectScopeDto, userId: string, userName?: string) {
    const lang = this.getLang();

    // Verificar se o projeto existe
    const project = await this.projectRepo.findOne({
      where: { id: dto.projectId },
    });
    if (!project) {
      throw new NotFoundException(
        await this.i18n.translate('projects.not_found', { lang }),
      );
    }

    // Verificar se o usuário existe
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(
        await this.i18n.translate('users.not_found', { lang }),
      );
    }

    // Gerar o HTML do escopo usando IA
    const scopeHtml = await this.generateScope(dto.briefText, userId, userName);

    // Buscar a última versão do escopo para este projeto
    const lastScope = await this.scopeRepo.findOne({
      where: { projectId: dto.projectId, deletedAt: null as any },
      order: { version: 'DESC' },
    });

    const nextVersion = lastScope ? lastScope.version + 1 : 1;

    try {
      const scope = this.scopeRepo.create({
        projectId: dto.projectId,
        userId,
        name: dto.name,
        title: dto.title ?? null,
        briefText: dto.briefText,
        scopeHtml,
        status: 'created',
        version: nextVersion,
      });

      const saved = await this.scopeRepo.save(scope);
      return saved;
    } catch (err) {
      await this.rethrowUniqueConflict(err, 'scope');
      throw err;
    }
  }

  async findAll(params: ListProjectScopeDto) {
    const {
      projectId,
      status,
      name,
      page = 1,
      limit = 20,
      orderBy = 'createdAt',
      order = 'desc',
    } = params;

    const pageNum = typeof page === 'string' ? parseInt(page, 10) : page;
    const limitNum = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    const skip = (pageNum - 1) * limitNum;

    const qb = this.scopeRepo
      .createQueryBuilder('ps')
      .leftJoinAndSelect('ps.project', 'p')
      .leftJoinAndSelect('ps.user', 'u')
      .where('ps.deletedAt IS NULL');

    if (projectId) {
      qb.andWhere('ps.projectId = :projectId', { projectId });
    }
    if (status) {
      qb.andWhere('ps.status = :status', { status });
    }
    if (name) {
      qb.andWhere('ps.name ILIKE :name', { name: `%${name}%` });
    }

    const orderMap: Record<string, string> = {
      createdAt: 'ps.createdAt',
      updatedAt: 'ps.updatedAt',
    };

    qb.orderBy(
      orderMap[orderBy] ?? 'ps.createdAt',
      (order || 'desc').toUpperCase() as 'ASC' | 'DESC',
    )
      .skip(skip)
      .take(limitNum);

    const [scopes, total] = await qb.getManyAndCount();

    return {
      data: scopes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasNext: pageNum * limitNum < total,
        hasPrev: pageNum > 1,
      },
    };
  }

  async findOne(id: string) {
    const lang = this.getLang();
    const scope = await this.scopeRepo.findOne({
      where: { id },
      relations: ['project', 'user'],
    });

    if (!scope) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    return scope;
  }

  async update(
    id: string,
    dto: UpdateProjectScopeDto,
    userId: string,
    userName?: string,
  ) {
    const lang = this.getLang();
    const scope = await this.scopeRepo.findOne({ where: { id } });

    if (!scope) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    let scopeHtml = scope.scopeHtml;

    // Se o briefText foi atualizado, regenerar o HTML
    if (dto.briefText) {
      scopeHtml = await this.generateScope(dto.briefText, userId, userName);
    }

    try {
      const oldStatus = scope.status;
      const newStatus =
        (dto as any).status ?? (scope as any).status ?? 'created';

      await this.scopeRepo.update(
        { id },
        {
          name: dto.name !== undefined ? dto.name : scope.name,
          title: dto.title !== undefined ? dto.title : scope.title,
          briefText: dto.briefText ?? scope.briefText,
          scopeHtml: dto.scopeHtml ?? scopeHtml,
          status: newStatus,
        },
      );

      // Notificar gestores quando o status mudar para "in_review"
      if (oldStatus !== 'in_review' && newStatus === 'in_review') {
        const updatedScope = await this.scopeRepo.findOne({
          where: { id },
          relations: ['project', 'user'],
        });

        if (updatedScope) {
          const projectName = updatedScope.project?.projectName || 'Projeto';
          const scopeName = updatedScope.name || 'Escopo';
          const creatorName = updatedScope.user?.name || 'Usuário';

          // Buscar todos os gestores de projetos
          const projectManagers = await this.getUsersByRule('projects.manager');
          if (projectManagers.length > 0) {
            const managerIds = projectManagers.map((u) => u.id);

            await this.notificationsService.createMany(
              managerIds,
              'Escopo aguardando análise',
              `O escopo "${scopeName}" do projeto "${projectName}" foi enviado para análise por ${creatorName}.`,
              'scope',
              updatedScope.id,
            );
          }
        }
      }

      // Notificar quando o status mudar para "finalized"
      if (oldStatus !== 'finalized' && newStatus === 'finalized') {
        const updatedScope = await this.scopeRepo.findOne({
          where: { id },
          relations: ['project', 'user', 'project.customer'],
        });

        if (updatedScope && updatedScope.project) {
          const project = updatedScope.project;
          const customer = (project as any).customer;
          const projectName = project.projectName || 'Projeto';
          const customerName = customer?.displayName || 'Cliente';
          const scopeName = updatedScope.name || 'Escopo';

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

          // 3. Adicionar quem criou o escopo
          if (updatedScope.userId) {
            userIdsToNotify.add(updatedScope.userId);
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
              'Escopo finalizado - Contrato disponível',
              `O escopo "${scopeName}" do projeto "${projectName}" do cliente "${customerName}" foi finalizado. Já é possível criar um contrato.`,
              'scope',
              updatedScope.id,
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
                    scopeName,
                    badge: 'INTERNO',
                    currentStage: 'escopo-finalizado',
                    projectCreatedAt: project.createdAt,
                    scopeCreatedAt: updatedScope.createdAt,
                    scopeFinalizedAt: updatedScope.updatedAt,
                  },
                  `Escopo "${scopeName}" finalizado`,
                )
                .catch((error) => {
                  // Não deve quebrar o fluxo principal se o tracking falhar
                  console.error('Erro ao enviar tracking por WhatsApp:', error);
                });
            });
          }
        }
      }

      return this.scopeRepo.findOne({
        where: { id },
        relations: ['project', 'user'],
      });
    } catch (err) {
      await this.rethrowUniqueConflict(err, 'scope');
      throw err;
    }
  }

  async remove(id: string) {
    const lang = this.getLang();
    const scope = await this.scopeRepo.findOne({ where: { id } });

    if (!scope) {
      throw new NotFoundException(
        await this.i18n.translate('common.not_found', { lang }),
      );
    }

    // Soft delete
    await this.scopeRepo.update({ id }, { deletedAt: new Date() as any });

    return { message: 'Scope deleted successfully' };
  }
}
