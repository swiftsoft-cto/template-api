# Comandos cURL - API de Projetos

Este documento contém exemplos de comandos cURL para todos os endpoints disponíveis no módulo de Projetos.

## Autenticação

Todos os endpoints requerem autenticação JWT. Substitua `YOUR_ACCESS_TOKEN` pelo token de acesso válido.

**Base URL:** `http://localhost:22211` (ajuste conforme necessário)

**Permissões necessárias:**
- `projects.read` - Para operações de leitura (GET)
- `projects.manage` - Para operações de escrita (POST, PATCH, DELETE)

---

## 1. Listar Projetos (com Paginação)

**GET** `/projects`

Retorna uma lista paginada de projetos com suporte a busca, filtros e ordenação.

### Parâmetros de Query

- `q` ou `search` (string, opcional) - Termo de busca (busca em nome, código, descrição e cliente)
- `page` (number, opcional, padrão: 1) - Número da página
- `limit` (number, opcional, padrão: 20, máximo: 100) - Itens por página
- `orderBy` (string, opcional, padrão: 'createdAt') - Campo para ordenação: `createdAt`, `updatedAt`, `projectName`, `projectCode`
- `order` (string, opcional, padrão: 'desc') - Ordem: `asc` ou `desc`
- `customerId` (string UUID, opcional) - Filtrar por ID do cliente

### Exemplo Básico

```bash
curl -X GET "http://localhost:22211/projects" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Paginação

```bash
curl -X GET "http://localhost:22211/projects?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Busca

```bash
curl -X GET "http://localhost:22211/projects?q=sistema" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Filtro por Cliente

```bash
curl -X GET "http://localhost:22211/projects?customerId=123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Ordenação

```bash
curl -X GET "http://localhost:22211/projects?orderBy=projectName&order=asc" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo Completo (Busca + Paginação + Ordenação + Filtro)

```bash
curl -X GET "http://localhost:22211/projects?q=software&page=1&limit=20&orderBy=createdAt&order=desc&customerId=123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada

```json
{
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "projectName": "Sistema de Gestão",
      "projectCode": "SG-001",
      "description": "Sistema completo de gestão empresarial",
      "projectType": "SOFTWARE",
      "customerId": "123e4567-e89b-12d3-a456-426614174001",
      "createdAt": "2025-12-17T18:00:00.000Z",
      "updatedAt": "2025-12-17T18:00:00.000Z",
      "deletedAt": null,
      "customer": {
        "id": "123e4567-e89b-12d3-a456-426614174001",
        "displayName": "Empresa XYZ"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## 2. Criar Projeto

**POST** `/projects`

Cria um novo projeto no sistema.

### Body (JSON)

- `projectName` (string, obrigatório) - Nome do projeto
- `projectCode` (string, obrigatório) - Código único do projeto
- `description` (string, opcional) - Descrição do projeto
- `projectType` (enum, opcional, padrão: 'SOFTWARE') - Tipo do projeto: `SOFTWARE`, `MAINTENANCE`, `EVOLUTION`, `RESEARCH_DEVELOPMENT`, `CONSULTING`, `AGENTS_AI`, `OTHER`
- `customerId` (string UUID, obrigatório) - ID do cliente associado

### Exemplo Básico

```bash
curl -X POST "http://localhost:3000/projects" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "projectName": "Sistema de Gestão",
    "projectCode": "SG-001",
    "description": "Sistema completo de gestão empresarial",
    "projectType": "SOFTWARE",
    "customerId": "123e4567-e89b-12d3-a456-426614174001"
  }'
```

### Exemplo Mínimo (sem descrição)

```bash
curl -X POST "http://localhost:3000/projects" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "projectName": "Projeto de Manutenção",
    "projectCode": "PM-001",
    "projectType": "MAINTENANCE",
    "customerId": "123e4567-e89b-12d3-a456-426614174001"
  }'
```

### Exemplo com Todos os Campos

```bash
curl -X POST "http://localhost:3000/projects" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "projectName": "P&D de IA",
    "projectCode": "PD-001",
    "description": "Projeto de pesquisa e desenvolvimento em inteligência artificial",
    "projectType": "RESEARCH_DEVELOPMENT",
    "customerId": "123e4567-e89b-12d3-a456-426614174001"
  }'
```

### Resposta Esperada (201 Created)

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "projectName": "Sistema de Gestão",
  "projectCode": "SG-001",
  "description": "Sistema completo de gestão empresarial",
  "projectType": "SOFTWARE",
  "customerId": "123e4567-e89b-12d3-a456-426614174001",
  "createdAt": "2025-12-17T18:00:00.000Z",
  "updatedAt": "2025-12-17T18:00:00.000Z",
  "deletedAt": null
}
```

### Erros Possíveis

- **400 Bad Request** - Dados inválidos ou campos obrigatórios faltando
- **409 Conflict** - Código do projeto já existe (único)
- **404 Not Found** - Cliente não encontrado

---

## 3. Buscar Projeto por ID

**GET** `/projects/:id`

Retorna os detalhes de um projeto específico.

### Parâmetros

- **Path Parameter:**
  - `id` (string UUID, obrigatório) - ID do projeto

### Exemplo Básico

```bash
curl -X GET "http://localhost:3000/projects/123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada (200 OK)

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "projectName": "Sistema de Gestão",
  "projectCode": "SG-001",
  "description": "Sistema completo de gestão empresarial",
  "projectType": "SOFTWARE",
  "customerId": "123e4567-e89b-12d3-a456-426614174001",
  "createdAt": "2025-12-17T18:00:00.000Z",
  "updatedAt": "2025-12-17T18:00:00.000Z",
  "deletedAt": null,
  "customer": {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "displayName": "Empresa XYZ",
    "kind": "COMPANY"
  }
}
```

### Erros Possíveis

- **404 Not Found** - Projeto não encontrado

---

## 4. Atualizar Projeto

**PATCH** `/projects/:id`

Atualiza parcialmente um projeto existente. Todos os campos são opcionais.

### Parâmetros

- **Path Parameter:**
  - `id` (string UUID, obrigatório) - ID do projeto

### Body (JSON)

- `projectName` (string, opcional) - Nome do projeto
- `projectCode` (string, opcional) - Código único do projeto
- `description` (string, opcional, pode ser `null`) - Descrição do projeto
- `projectType` (enum, opcional) - Tipo do projeto: `SOFTWARE`, `MAINTENANCE`, `EVOLUTION`, `RESEARCH_DEVELOPMENT`, `CONSULTING`, `AGENTS_AI`, `OTHER`
- `customerId` (string UUID, opcional) - ID do cliente associado

### Exemplo - Atualizar Nome

```bash
curl -X PATCH "http://localhost:3000/projects/123e4567-e89b-12d3-a456-426614174000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "projectName": "Sistema de Gestão Atualizado"
  }'
```

### Exemplo - Atualizar Descrição

```bash
curl -X PATCH "http://localhost:3000/projects/123e4567-e89b-12d3-a456-426614174000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "description": "Nova descrição do projeto"
  }'
```

### Exemplo - Atualizar Tipo

```bash
curl -X PATCH "http://localhost:3000/projects/123e4567-e89b-12d3-a456-426614174000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "projectType": "EVOLUTION"
  }'
```

### Exemplo - Remover Descrição (null)

```bash
curl -X PATCH "http://localhost:3000/projects/123e4567-e89b-12d3-a456-426614174000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "description": null
  }'
```

### Exemplo - Atualizar Múltiplos Campos

```bash
curl -X PATCH "http://localhost:3000/projects/123e4567-e89b-12d3-a456-426614174000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "projectName": "Sistema de Gestão v2",
    "description": "Versão atualizada do sistema",
    "projectType": "EVOLUTION"
  }'
```

### Resposta Esperada (200 OK)

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "projectName": "Sistema de Gestão v2",
  "projectCode": "SG-001",
  "description": "Versão atualizada do sistema",
  "projectType": "EVOLUTION",
  "customerId": "123e4567-e89b-12d3-a456-426614174001",
  "createdAt": "2025-12-17T18:00:00.000Z",
  "updatedAt": "2025-12-17T18:30:00.000Z",
  "deletedAt": null,
  "customer": {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "displayName": "Empresa XYZ"
  }
}
```

### Erros Possíveis

- **400 Bad Request** - Dados inválidos
- **404 Not Found** - Projeto ou cliente não encontrado
- **409 Conflict** - Código do projeto já existe (se atualizado)

---

## 5. Deletar Projeto

**DELETE** `/projects/:id`

Realiza soft delete de um projeto (marca como deletado, mas não remove do banco).

### Parâmetros

- **Path Parameter:**
  - `id` (string UUID, obrigatório) - ID do projeto

### Exemplo Básico

```bash
curl -X DELETE "http://localhost:3000/projects/123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada (200 OK)

```json
{
  "message": "Project deleted successfully"
}
```

### Erros Possíveis

- **404 Not Found** - Projeto não encontrado

---

## Tipos de Projeto (ProjectType)

Os seguintes valores são aceitos para o campo `projectType`:

- `SOFTWARE` - Projeto de software
- `MAINTENANCE` - Projeto de manutenção
- `EVOLUTION` - Projeto de evolução
- `RESEARCH_DEVELOPMENT` - Projeto de pesquisa e desenvolvimento (P&D)
- `CONSULTING` - Projeto de consultoria
- `AGENTS_AI` - Projeto de agentes de IA
- `OTHER` - Outro tipo de projeto

---

## Notas Importantes

1. **Soft Delete**: A exclusão de projetos é feita via soft delete, ou seja, o registro não é removido fisicamente do banco, apenas marcado como deletado (`deletedAt` preenchido).

2. **Código Único**: O campo `projectCode` deve ser único no sistema. Tentativas de criar ou atualizar com um código já existente resultarão em erro 409.

3. **Relacionamento com Cliente**: Todo projeto deve estar associado a um cliente válido. O `customerId` deve ser um UUID válido de um cliente existente.

4. **Paginação**: A listagem de projetos retorna no máximo 100 itens por página (parâmetro `limit`).

5. **Busca**: A busca (`q` ou `search`) procura nos campos: `projectName`, `projectCode`, `description` e `customer.displayName`.

6. **Ordenação**: Os campos disponíveis para ordenação são: `createdAt`, `updatedAt`, `projectName`, `projectCode`.

---

## Exemplos de Fluxo Completo

### Criar, Listar, Atualizar e Deletar

```bash
# 1. Criar projeto
PROJECT_ID=$(curl -X POST "http://localhost:3000/projects" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "projectName": "Novo Projeto",
    "projectCode": "NP-001",
    "projectType": "SOFTWARE",
    "customerId": "123e4567-e89b-12d3-a456-426614174001"
  }' | jq -r '.id')

# 2. Listar projetos
curl -X GET "http://localhost:3000/projects" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 3. Buscar projeto específico
curl -X GET "http://localhost:3000/projects/$PROJECT_ID" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 4. Atualizar projeto
curl -X PATCH "http://localhost:3000/projects/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "description": "Descrição atualizada"
  }'

# 5. Deletar projeto
curl -X DELETE "http://localhost:3000/projects/$PROJECT_ID" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Códigos de Status HTTP

- **200 OK** - Operação realizada com sucesso
- **201 Created** - Recurso criado com sucesso
- **400 Bad Request** - Dados inválidos na requisição
- **401 Unauthorized** - Token de autenticação inválido ou ausente
- **403 Forbidden** - Usuário não tem permissão para a operação
- **404 Not Found** - Recurso não encontrado
- **409 Conflict** - Conflito (ex: código de projeto duplicado)
- **500 Internal Server Error** - Erro interno do servidor

