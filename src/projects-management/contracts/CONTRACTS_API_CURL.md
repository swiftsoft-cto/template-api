# Comandos cURL - API de Contratos

Este documento contém exemplos de comandos cURL para os endpoints do módulo de Contratos:
- Modelos de contrato (HTML template)
- Contratos (instâncias renderizadas com placeholders)

## Autenticação

Todos os endpoints requerem autenticação JWT. Substitua `YOUR_ACCESS_TOKEN` pelo token válido.

**Base URL:** `http://localhost:22211` (ajuste conforme necessário)

**Permissões sugeridas (seguindo padrão do projeto):**
- `projects.read` - leituras (GET)
- `projects.manage` - escritas (POST, PATCH, DELETE)

---

# 1) Modelos de Contrato (Templates)

## 1.1 Criar template
**POST** `/contracts/templates`

Body:
- `name` (string) obrigatório
- `description` (string) opcional
- `projectId` (uuid) opcional (template específico por projeto)
- `templateHtml` (string) obrigatório (HTML com placeholders `{{PLACEHOLDER}}`)

```bash
curl -X POST "http://localhost:22211/contracts/templates" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "name": "Contrato de Desenvolvimento (Padrão)",
    "description": "Modelo padrão para projetos de software",
    "templateHtml": "<h1>CONTRATO</h1><p>Cliente: {{CUSTOMER_NAME}}</p><div>{{SCOPE_HTML}}</div>"
  }'
```

## 1.2 Listar templates
**GET** `/contracts/templates`

Query:
- `projectId` (uuid, opcional)
- `page` (number, opcional, default 1)
- `limit` (number, opcional, default 20, max 100)
- `orderBy` (`createdAt`|`updatedAt`, opcional)
- `order` (`asc`|`desc`, opcional)

```bash
curl -X GET "http://localhost:22211/contracts/templates?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 1.3 Buscar template por ID
**GET** `/contracts/templates/:id`

```bash
curl -X GET "http://localhost:22211/contracts/templates/123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 1.4 Atualizar template
**PATCH** `/contracts/templates/:id`

```bash
curl -X PATCH "http://localhost:22211/contracts/templates/123e4567-e89b-12d3-a456-426614174000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "templateHtml": "<h1>CONTRATO</h1><p>Cliente: {{CUSTOMER_NAME}}</p><p>CNPJ: {{CUSTOMER_CNPJ}}</p><div>{{SCOPE_HTML}}</div>"
  }'
```

## 1.5 Deletar template (soft delete)
**DELETE** `/contracts/templates/:id`

```bash
curl -X DELETE "http://localhost:22211/contracts/templates/123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

# 2) Contratos (Instâncias)

## 2.1 Preview de contrato (sem salvar)
**POST** `/contracts/preview`

Renderiza o contrato sem salvar no banco. Útil para visualizar o resultado antes de criar.

Body:
- `projectId` (uuid) obrigatório
- `customerId` (uuid) obrigatório
- `templateId` (uuid) obrigatório
- `scopeId` (uuid) opcional (escopo já gerado em `/projects/scopes`)
- `title` (string) opcional
- `variables` (obj string->string) opcional (placeholders extra/override)

Response:
- `contractHtml` (string) - HTML renderizado
- `unresolvedPlaceholders` (string[]) - Lista de placeholders não resolvidos
- `variables` (obj) - Mapa completo de variáveis usadas na renderização
- `title` (string) - Título gerado ou fornecido

```bash
curl -X POST "http://localhost:22211/contracts/preview" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "projectId": "111e4567-e89b-12d3-a456-426614174000",
    "customerId": "222e4567-e89b-12d3-a456-426614174000",
    "templateId": "333e4567-e89b-12d3-a456-426614174000",
    "scopeId": "444e4567-e89b-12d3-a456-426614174000",
    "variables": {
      "CONTRACT_CITY": "Londrina/PR"
    }
  }'
```

## 2.2 Criar contrato
**POST** `/contracts`

Body:
- `projectId` (uuid) obrigatório
- `customerId` (uuid) obrigatório
- `templateId` (uuid) obrigatório
- `scopeId` (uuid) opcional (escopo já gerado em `/projects/scopes`)
- `title` (string) opcional
- `variables` (obj string->string) opcional (placeholders extra/override)

**Nota:** O campo `unresolvedPlaceholders` é salvo automaticamente no banco quando há placeholders não resolvidos.

```bash
curl -X POST "http://localhost:22211/contracts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "projectId": "111e4567-e89b-12d3-a456-426614174000",
    "customerId": "222e4567-e89b-12d3-a456-426614174000",
    "templateId": "333e4567-e89b-12d3-a456-426614174000",
    "scopeId": "444e4567-e89b-12d3-a456-426614174000",
    "variables": {
      "CONTRACT_CITY": "Londrina/PR"
    }
  }'
```

## 2.3 Listar contratos
**GET** `/contracts`

Query:
- `projectId` (uuid, opcional)
- `customerId` (uuid, opcional)
- `templateId` (uuid, opcional)
- `status` (`draft`|`final`|`signed`|`canceled`, opcional)
- `page` (number, opcional, default 1)
- `limit` (number, opcional, default 20, max 100)
- `orderBy` (`createdAt`|`updatedAt`, opcional)
- `order` (`asc`|`desc`, opcional)

```bash
curl -X GET "http://localhost:22211/contracts?projectId=111e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 2.4 Buscar contrato por ID
**GET** `/contracts/:id`

```bash
curl -X GET "http://localhost:22211/contracts/555e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 2.5 Atualizar contrato
**PATCH** `/contracts/:id`

Permite:
- trocar `scopeId` (ou remover setando `null`)
- alterar `variables`
- alterar `status`
- alterar `isLocked` (bloquear/desbloquear contrato)
- sobrescrever `contractHtml` manualmente (caso queira editar no CKEditor)

**Validação de status "final":**
- Se você tentar definir o status como `"final"` e ainda existirem placeholders não resolvidos no HTML, a requisição será rejeitada com erro 400.
- O campo `unresolvedPlaceholders` é atualizado automaticamente após cada atualização.

**Bloqueio e assinatura:**
- Contratos com `status="signed"` (assinado) **não podem ser editados** (exceto para bloqueio).
- Contratos com `isLocked=true` (bloqueado) **não podem ser editados** (exceto para desbloqueio).
- **Não é possível** marcar como `"signed"` se o contrato estiver bloqueado (`isLocked=true`).
- **Não é possível** desbloquear um contrato que já está assinado (`status="signed"`).
- Você pode **bloquear** um contrato mesmo se ele já estiver assinado (para maior segurança).

```bash
# Marcar como final
curl -X PATCH "http://localhost:22211/contracts/555e4567-e89b-12d3-a456-426614174000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "status": "final",
    "variables": { "CONTRACT_CITY": "Cambé/PR" }
  }'

# Bloquear contrato (impede edições)
curl -X PATCH "http://localhost:22211/contracts/555e4567-e89b-12d3-a456-426614174000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "isLocked": true
  }'

# Desbloquear contrato (permite edições novamente)
curl -X PATCH "http://localhost:22211/contracts/555e4567-e89b-12d3-a456-426614174000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "isLocked": false
  }'

# Marcar como assinado (após isso, não pode mais editar)
curl -X PATCH "http://localhost:22211/contracts/555e4567-e89b-12d3-a456-426614174000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "status": "signed"
  }'

# Associar documento do Autentique ao contrato (antes de enviar para assinatura)
curl -X PATCH "http://localhost:22211/contracts/555e4567-e89b-12d3-a456-426614174000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "autentiqueDocumentId": "89c7d2ab31f9f5a13b3d20ecf53319af387e54d240ae7be993"
  }'
```

## 2.6 Deletar contrato (soft delete)
**DELETE** `/contracts/:id`

```bash
curl -X DELETE "http://localhost:22211/contracts/555e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

# 2.7 Webhook Autentique
**POST** `/contracts/webhook/autentique`

Endpoint para receber webhooks do Autentique e marcar automaticamente contratos como assinados quando o cliente assinar o documento.

**⚠️ Este endpoint não requer autenticação JWT, mas valida a assinatura HMAC do webhook.**

**Headers:**
- `x-autentique-signature` (obrigatório) - Assinatura HMAC do webhook

**Variável de ambiente necessária:**
- `AUTENTIQUE_WEBHOOK_SECRET` - Secret configurado no painel do Autentique para validação HMAC

**Eventos processados:**
- `signature.accepted` - Quando uma assinatura é aceita
- `document.finished` - Quando todas as assinaturas do documento são concluídas

**Como funciona:**
1. Configure o campo `autentiqueDocumentId` no contrato (via PATCH) com o ID do documento criado no Autentique
2. Configure o webhook no painel do Autentique apontando para: `https://sua-api.com/contracts/webhook/autentique`
3. Quando o cliente assinar, o webhook é enviado
4. O sistema busca o contrato pelo `autentiqueDocumentId`
5. O contrato é automaticamente marcado como `status="signed"`

**Exemplo de payload recebido:**
```json
{
  "event": {
    "type": "signature.accepted",
    "data": {
      "document": "89c7d2ab31f9f5a13b3d20ecf53319af387e54d240ae7be993",
      "public_id": "7f25d72b-6155-11ef-9dae-0242ac170004",
      "signed": "2024-08-26T18:03:27.000000Z"
    }
  }
}
```

**Nota:** O endpoint retorna 200 imediatamente e processa o webhook de forma assíncrona para garantir resposta rápida ao Autentique.

---

# 3) Placeholders suportados (gerados automaticamente)

## 3.1 Customer (Cliente)
Placeholders principais:
- `{{CUSTOMER_NAME}}` - Nome de exibição do cliente (displayName)
- `{{CUSTOMER_ID}}` - ID único do cliente (UUID)
- `{{CUSTOMER_KIND}}` - Tipo de cliente (`PERSON` ou `COMPANY`)
- `{{CUSTOMER_IS_ACTIVE}}` - Status ativo/inativo
- `{{CUSTOMER_CNPJ}}` - CNPJ do cliente formatado (XX.XXX.XXX/XXXX-XX) - disponível apenas quando `CUSTOMER_KIND` = `COMPANY`
- `{{CUSTOMER_ADDRESS}}` - Endereço completo formatado da empresa (disponível apenas quando `CUSTOMER_KIND` = `COMPANY`)
- `{{CUSTOMER_ADDRESS_CITY}}` - Cidade do endereço primário da empresa (disponível apenas quando `CUSTOMER_KIND` = `COMPANY`)
- `{{CUSTOMER_ADDRESS_STATE}}` - Estado do endereço primário da empresa (disponível apenas quando `CUSTOMER_KIND` = `COMPANY`)

Também disponíveis dinamicamente: `{{CUSTOMER_DISPLAY_NAME}}`, `{{CUSTOMER_CREATED_AT}}`, `{{CUSTOMER_UPDATED_AT}}`, etc.

## 3.2 Person (Pessoa Física relacionada)
**Disponível quando o customer é COMPANY (empresa) com pessoas relacionadas, ou quando o customer é PERSON diretamente.**

Placeholders principais:
- `{{PERSON_NAME}}` - Nome completo da pessoa (fullName) formatado (primeira letra maiúscula, resto minúsculas, exceto preposições "de", "do", "da", "dos", "das")
- `{{PERSON_FULL_NAME}}` - Nome completo (mesmo que PERSON_NAME)
- `{{PERSON_NAME_UPPERCASE}}` - Nome completo em CAIXA ALTA (todas as letras maiúsculas)
- `{{PERSON_CPF}}` - CPF da pessoa formatado (XXX.XXX.XXX-XX)
- `{{PERSON_RG}}` - RG da pessoa
- `{{PERSON_EMAIL}}` - Email da pessoa
- `{{PERSON_PHONE}}` - Telefone da pessoa
- `{{PERSON_ID}}` - ID único da pessoa
- `{{PERSON_BIRTH_DATE}}` - Data de nascimento (formatada pt-BR)
- `{{PERSON_ADDRESS}}` - Endereço completo formatado (rua, número, complemento, bairro, cidade, estado, CEP)
- `{{PERSON_ADDRESS_CITY}}` - Cidade do endereço primário
- `{{PERSON_ADDRESS_STATE}}` - Estado do endereço primário

**Lógica de seleção:**
- Quando o customer é COMPANY: busca o person que é **representante legal** (`isLegalRepresentative=true`) ou **principal** (`isPrimary=true`), ou o primeiro disponível.
- Quando o customer é PERSON: usa os dados do próprio customer.

Também disponíveis dinamicamente: `{{PERSON_CREATED_AT}}`, `{{PERSON_UPDATED_AT}}`, etc.

## 3.3 Project (Projeto)
Placeholders principais:
- `{{PROJECT_NAME}}` - Nome do projeto (projectName)
- `{{PROJECT_CODE}}` - Código único do projeto
- `{{PROJECT_ID}}` - ID único do projeto (UUID)
- `{{PROJECT_TYPE}}` - Tipo do projeto (`SOFTWARE`, `MAINTENANCE`, `EVOLUTION`, `RESEARCH_DEVELOPMENT`, `OTHER`)
- `{{PROJECT_DESCRIPTION}}` - Descrição do projeto

Também disponíveis dinamicamente: `{{PROJECT_CREATED_AT}}`, `{{PROJECT_UPDATED_AT}}`, etc.

## 3.4 Scope (Escopo - opcional)
- `{{SCOPE_HTML}}` - HTML completo do escopo (se existir). Se não existir, vira string vazia.
- `{{SCOPE_ID}}` - ID único do escopo (UUID)
- `{{SCOPE_VERSION}}` - Versão do escopo (número)

## 3.5 Contract (Contrato)
- `{{CONTRACT_ID}}` - ID único do contrato (UUID) - disponível após criação
- `{{CONTRACT_TITLE}}` - Título do contrato
- `{{CONTRACT_STATUS}}` - Status do contrato (`draft`, `final`, `signed`, `canceled`)

## 3.6 Variáveis extras (customizadas)
Você pode enviar `variables` no create/update do contrato:
- Qualquer chave `FOO_BAR` poderá ser usada como `{{FOO_BAR}}` no template
- Se a chave colidir com placeholders nativos (ex.: `CUSTOMER_NAME`), `variables` tem **prioridade** (override).

---

# 4) Validações e Comportamentos

## 4.1 Placeholders não resolvidos
- O campo `unresolvedPlaceholders` (array de strings) é salvo automaticamente no banco quando há placeholders não resolvidos.
- Este campo é atualizado sempre que o contrato é criado ou atualizado.
- Placeholders não resolvidos permanecem no HTML renderizado (úteis para revisão/edição manual).

## 4.2 Status "final"
- **Não é possível** definir o status como `"final"` se ainda existirem placeholders não resolvidos no HTML.
- A API retornará erro 400 com a lista de placeholders não resolvidos.
- Isso garante que contratos marcados como "final" estejam completamente renderizados.

## 4.3 Snapshot de template e escopo
- Quando um contrato é criado, são salvos snapshots do template e do escopo.
- Isso garante que mesmo se o template ou escopo forem editados depois, o contrato mantém a versão original usada na renderização.

## 4.4 Bloqueio e proteção de edição
- **Campo `isLocked`**: Permite bloquear um contrato para impedir edições.
  - Quando `isLocked=true`, o contrato não pode ser editado ou deletado (exceto para desbloqueio).
  - Um contrato bloqueado não pode ser marcado como `"signed"`.
  
- **Status `signed`**: Quando um contrato está assinado (`status="signed"`), ele não pode ser editado ou deletado.
  - Um contrato assinado não pode ser desbloqueado (mesmo que `isLocked=false` seja enviado).

- **Fluxo recomendado:**
  1. Criar contrato (status: `draft`, isLocked: `false`)
  2. Editar até finalizar (status: `final`)
  3. Bloquear para revisão (isLocked: `true`) - opcional
  4. Marcar como assinado (status: `signed`) - após isso, não pode mais editar

