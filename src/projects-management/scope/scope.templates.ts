export const SCOPE_BOX_TEMPLATE = `
<table style="width:100%; border-collapse:collapse; line-height: 1.15">
  <tbody>
    <tr>
      <td style="border:1px solid #000; padding:10px;text-align:center; font-weight:700; margin:0 0 10px 0; vertical-align: middle; ">
        ESCOPO DO PROJETO
      </td>
    </tr>
    <tr>
      <td style="border:none; padding:10px;">
        <ol style="margin:0; padding-left:18px; line-height: 1.15">
        <li>
          <strong>Contexto e objetivo</strong>
          <ul>
            <li><strong>Nome do projeto:</strong> {{project_name}}</li>
            <li style="text-align: justify;"><strong>Objetivo:</strong> {{project_goal}}</li>
            <li style="text-align: justify;"><strong>Público-alvo:</strong> {{audience_type}} ({{audience_description}})</li>
            <li><strong>Tipo:</strong> {{product_type}} (SaaS: {{is_saas}}, White-label: {{is_whitelabel}})</li>
          </ul>
        </li>

        <li>
          <strong>Plataformas e canais</strong>
          <ul>
            <li><strong>Web:</strong> {{web_required}} (Responsivo: {{web_responsive}}, PWA: {{web_pwa}})</li>
            <li><strong>Mobile:</strong> {{mobile_required}} (iOS: {{ios}}, Android: {{android}}, Tipo: {{mobile_type}})</li>
            <li><strong>Ambientes:</strong> {{environments}}</li>
          </ul>
        </li>

        <li>
          <strong>Usuários, perfis e permissões</strong>
          <ul>
            <li><strong>Perfis:</strong> {{roles_list}}</li>
            <li><strong>Autenticação:</strong> {{auth_method}}</li>
            <li><strong>Permissões:</strong> {{permission_model}}</li>
            <li><strong>Auditoria:</strong> {{audit_required}}</li>
          </ul>
        </li>

        <li>
          <strong>Módulos do projeto (lista)</strong>
          <ul>
            {{modules_scope_list}}
          </ul>
        </li>

        <li>
          <strong>Entregáveis</strong>
          <ul>
            <li>Aplicação nas plataformas definidas</li>
            <li>Painel administrativo (quando aplicável)</li>
            <li>Integrações descritas neste documento</li>
            <li>Documentação mínima de operação (deploy, backups e suporte)</li>
          </ul>
        </li>

        <li>
          <strong>Fora de escopo</strong>
          <ul>
            <li style="text-align: justify;">{{out_of_scope}}</li>
          </ul>
        </li>
      </ol>
      </td>
    </tr>
  </tbody>
</table>
`.trim();

export const SPECS_BOX_TEMPLATE = `
<table style="width:100%; border-collapse:collapse; margin:0 0 14px 0; line-height: 1.15">
  <tbody>
    <tr>
      <td style="border:1px solid #000; padding:10px;text-align:center; font-weight:700; margin:0 0 10px 0; vertical-align: middle; ">
        ESPECIFICAÇÕES FUNCIONAIS DO SOFTWARE
      </td>
    </tr>
    <tr>
      <td style="border: none; padding:10px;">
        <p style="margin:0 0 10px 0; text-align: justify;">{{solution_summary}}</p>
        <ol style="margin:0; padding-left:18px; line-height: 1.15">
        <li>
          <strong>Jornada principal</strong>
          <ul>
            {{main_journey_steps}}
            <li style="text-align: justify;"><strong>Resultado esperado:</strong> {{main_journey_outcome}}</li>
          </ul>
        </li>

        <li>
          <strong>Módulos e funcionalidades</strong>

          <p style="margin:8px 0;"><em>Obs.: itens marcados como "**A DEFINIR (PO)**" devem ser completados pelo Product Owner.</em></p>

          <div style="margin:8px 0 10px 0; text-align: justify;">
            {{modules_narrative}}
          </div>

          <p style="font-weight:700; margin:10px 0 6px 0;">Relação de funcionalidades do software:</p>
          <ol style="margin:0; padding-left:18px;">
            {{functionalities_list}}
          </ol>
        </li>
      </ol>
      </td>
    </tr>
  </tbody>
</table>
`.trim();

export const MILESTONES_BOX_TEMPLATE = `
<table style="width:100%; border-collapse:collapse; margin:0 0 14px 0; line-height: 1.15">
  <tr>
    <td colspan="5" style="border:1px solid #000; padding:10px; text-align:center; font-weight:700; margin:0 0 10px 0; vertical-align: middle;">
      CRONOGRAMA MACRO (ESTIMATIVA)
    </td>
  </tr>
  <tr>
    <th style="border:1px solid #000; padding:6px;">ID</th>
    <th style="border:1px solid #000; padding:6px;">Módulo</th>
    <th style="border:1px solid #000; padding:6px;">Pontos</th>
    <th style="border:1px solid #000; padding:6px;">Início</th>
    <th style="border:1px solid #000; padding:6px;">Fim</th>
  </tr>
  <tbody>
    {{milestones_table_rows}}
  </tbody>
</table>
`.trim();

export const REQ_BOX_TEMPLATE = `
<p>&nbsp;</p>
<table style="width:100%; border-collapse:collapse; line-height: 1.15">
  <tbody>
    <tr>
      <td style="border:1px solid #000; padding:10px;text-align:center; font-weight:700; margin:0 0 10px 0; vertical-align: middle; ">
        REQUISITOS E INFRAESTRUTURA PARA GARANTIA
        DO DESENVOLVIMENTO E OPERAÇÃO DO SOFTWARE OBJETO DO CONTRATO
      </td>
    </tr>
    <tr>
      <td style="border: none; padding:10px;">
        <ol style="margin:0; padding-left:18px; line-height: 1.15">
        <li>
          É condição de desenvolvimento, aplicação e operação do software objeto deste instrumento, a disponibilização pelo CLIENTE, dos seguintes pontos:
          <ol type="a" style="margin:0; padding-left:18px;">
            <li>Acesso aos sistemas/softwares/documentações de sua operação que permitam a integração ou captação de dados para desenvolvimento, aplicação e operação do software a ser desenvolvido{{client_systems_access}};</li>
            <li>Indicação de responsáveis (pontos focais) com autoridade para validação, homologação e aceite por módulo/sprint{{client_focal_points}};</li>
            <li>Disponibilização de credenciais e variáveis de ambiente necessárias (PostgreSQL, Redis, SMTP, JWT, OpenAI, S3/AWS e URLs públicas){{client_env_vars}};</li>
            <li>Fornecimento de dados de teste e documentos amostrais suficientes para os cenários mínimos de validação{{client_test_data}};</li>
            <li>Prévia de templates, layouts e termos legais aplicáveis à geração e publicação de documentos/PDFs{{client_templates_legal}};</li>
            <li>Diretrizes e políticas de segurança, privacidade e LGPD (inclusive DLP) aplicáveis ao tratamento dos dados{{client_security_policies}};</li>
            <li>Janela de disponibilidade em horário comercial para testes integrados, homologação e correções, com acesso dos desenvolvedores quando necessário{{client_availability_window}};</li>
            <li>Acesso aos ambientes de homologação e produção do CLIENTE, quando aplicável, para fins de integração e verificação técnica{{client_env_access}}.</li>
          </ol>
        </li>

        <li>
          É condição de desenvolvimento, aplicação e operação do software objeto deste instrumento, a entrega, da seguinte infraestrutura mínima, de responsabilidade do CLIENTE:
          <ol type="a" style="margin:0; padding-left:18px;">
            <li>Máquina Virtual de Aplicação (APP/API) ou PaaS equivalente: {{infra_app_vm_specs}};</li>
            <li>Banco de Dados PostgreSQL dedicado: {{infra_db_specs}};</li>
            <li>AWS S3: {{infra_s3_specs}};</li>
            <li>Provedor SMTP transacional: {{infra_smtp_specs}};</li>
            <li>DNS e certificados TLS válidos para os domínios/ambientes (dev, homolog, prod), incluindo subdomínios para API e WebSocket: {{infra_dns_tls_specs}};</li>
            <li>Ambiente de execução para Backend (Node.js LTS/NestJS) e Frontend (React/Vite), quando auto-hospedados pelo CLIENTE, com CORS configurado e portas liberadas: {{infra_runtime_specs}};</li>
            <li>Ferramentas de observabilidade (logs e métricas) com acesso ao CONTRATADO: {{infra_observability_specs}};</li>
            <li>Políticas de segurança de rede (firewall/VPN/allowlists) que permitam o tráfego necessário entre frontend, API, WebSocket e serviços gerenciados: {{infra_network_security_specs}};</li>
            <li>Conta e faturamento AWS ativos para o uso de S3, VM e eventuais serviços correlatos: {{infra_billing_specs}};</li>
            <li>Repositório Git e/ou pipeline CI/CD do CLIENTE, quando requerido para deploy nos ambientes-alvo: {{infra_cicd_specs}}.</li>
          </ol>
        </li>
      </ol>
      </td>
    </tr>
  </tbody>
</table>
`.trim();
