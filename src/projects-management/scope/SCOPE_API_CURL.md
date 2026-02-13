# Comandos cURL - API de Escopo de Projeto

Este documento contém exemplos de comandos cURL para todos os endpoints disponíveis no módulo de Escopo de Projeto.

## Autenticação

Todos os endpoints requerem autenticação JWT. Substitua `YOUR_ACCESS_TOKEN` pelo token de acesso válido.

**Base URL:** `http://localhost:22211` (ajuste conforme necessário)

**Permissões necessárias:**
- `projects.read` - Para operações de leitura (GET)
- `projects.manage` - Para operações de escrita (POST, PATCH, DELETE)

---

## 1. Gerar Escopo de Projeto

**POST** `/projects/scopes`

Cria um novo escopo de projeto a partir de um brief em linguagem natural. A IA analisa o texto e gera um HTML formatado seguindo o template de contrato formal.

### Body (JSON)

- `projectId` (string UUID, obrigatório) - ID do projeto associado
- `briefText` (string, obrigatório) - Texto em linguagem natural descrevendo o projeto

### Exemplo Básico

```bash
curl -X POST "http://localhost:22211/projects/scopes" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "projectId": "123e4567-e89b-12d3-a456-426614174000",
    "briefText": "Preciso de um sistema de gestão de vendas para minha empresa. O sistema deve ter cadastro de clientes, produtos, pedidos e relatórios. Vai ser usado pela equipe de vendas e gestores. Precisa funcionar no navegador e ser responsivo para mobile. Vou precisar de login com e-mail e senha. Quero notificações por e-mail quando um pedido for aprovado."
  }'
```

### Exemplo Completo (Brief Detalhado)

```bash
curl -X POST "http://localhost:22211/projects/scopes" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "projectId": "123e4567-e89b-12d3-a456-426614174000",
    "briefText": "Sistema de gestão de vendas B2B

Nome: VendasPro
Objetivo: Automatizar o processo de vendas desde o cadastro de clientes até a entrega, reduzindo tempo de processamento em 60%.

Público-alvo: B2B (empresas que vendem para outras empresas)

Plataformas:
- Web responsiva (deve funcionar bem no mobile)
- Não precisa de app nativo por enquanto

Usuários:
- Administrador: gerencia tudo
- Vendedor: cadastra clientes, cria pedidos
- Gestor: aprova pedidos, vê relatórios

Módulos principais:
1. Cadastro de clientes (nome, CNPJ, endereço, contato)
2. Cadastro de produtos (nome, código, preço, estoque)
3. Criação de pedidos (seleciona cliente, produtos, quantidade)
4. Aprovação de pedidos (gestor aprova ou rejeita)
5. Relatórios de vendas (por período, vendedor, cliente)

Notificações:
- E-mail quando pedido for aprovado
- E-mail quando pedido for rejeitado

Integrações:
- Precisa integrar com sistema de estoque via API
- Enviar dados para Google Analytics

Pagamentos:
- Não terá pagamento no sistema (processo manual externo)

Infraestrutura:
- Hospedagem na AWS
- Banco de dados PostgreSQL
- Backup diário"
  }'
```

### Resposta Esperada (201 Created)

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174002",
  "projectId": "123e4567-e89b-12d3-a456-426614174000",
  "userId": "123e4567-e89b-12d3-a456-426614174001",
  "briefText": "Preciso de um sistema de gestão de vendas...",
  "scopeHtml": "<h2>ESCOPO DO PROJETO</h2>...",
  "version": 1,
  "createdAt": "2025-12-17T18:00:00.000Z",
  "updatedAt": "2025-12-17T18:00:00.000Z",
  "deletedAt": null
}
```

### Erros Possíveis

- **400 Bad Request** - Dados inválidos ou campos obrigatórios faltando
- **404 Not Found** - Projeto não encontrado
- **500 Internal Server Error** - Erro na geração do escopo pela IA

---

## 2. Listar Escopos de Projeto

**GET** `/projects/scopes`

Retorna uma lista paginada de escopos de projeto com suporte a filtros e ordenação.

### Parâmetros de Query

- `projectId` (string UUID, opcional) - Filtrar por ID do projeto
- `name` (string, opcional) - Filtrar por nome do scope (busca parcial, case-insensitive)
- `status` (string, opcional) - Filtrar por status: `created`, `in_review`, `finalized`
- `page` (number, opcional, padrão: 1) - Número da página
- `limit` (number, opcional, padrão: 20, máximo: 100) - Itens por página
- `orderBy` (string, opcional, padrão: 'createdAt') - Campo para ordenação: `createdAt`, `updatedAt`
- `order` (string, opcional, padrão: 'desc') - Ordem: `asc` ou `desc`

### Exemplo Básico

```bash
curl -X GET "http://localhost:22211/projects/scopes" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Filtro por Projeto

```bash
curl -X GET "http://localhost:22211/projects/scopes?projectId=123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Paginação

```bash
curl -X GET "http://localhost:22211/projects/scopes?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Ordenação

```bash
curl -X GET "http://localhost:22211/projects/scopes?orderBy=updatedAt&order=desc" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Filtro por Nome

```bash
curl -X GET "http://localhost:22211/projects/scopes?name=Software" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo Completo (Filtro + Paginação + Ordenação)

```bash
curl -X GET "http://localhost:22211/projects/scopes?projectId=123e4567-e89b-12d3-a456-426614174000&name=Software&page=1&limit=20&orderBy=createdAt&order=desc" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada

```json
{
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174002",
      "projectId": "123e4567-e89b-12d3-a456-426614174000",
      "userId": "123e4567-e89b-12d3-a456-426614174001",
      "briefText": "Preciso de um sistema de gestão de vendas...",
      "scopeHtml": "<h2>ESCOPO DO PROJETO</h2>...",
      "version": 1,
      "createdAt": "2025-12-17T18:00:00.000Z",
      "updatedAt": "2025-12-17T18:00:00.000Z",
      "deletedAt": null,
      "project": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "projectName": "Sistema de Gestão",
        "projectCode": "SG-001"
      },
      "user": {
        "id": "123e4567-e89b-12d3-a456-426614174001",
        "name": "João Silva",
        "email": "joao@example.com"
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

## 3. Buscar Escopo por ID

**GET** `/projects/scopes/:id`

Retorna os detalhes de um escopo específico, incluindo o HTML gerado.

### Parâmetros

- **Path Parameter:**
  - `id` (string UUID, obrigatório) - ID do escopo

### Exemplo Básico

```bash
curl -X GET "http://localhost:22211/projects/scopes/123e4567-e89b-12d3-a456-426614174002" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada (200 OK)

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174002",
  "projectId": "123e4567-e89b-12d3-a456-426614174000",
  "userId": "123e4567-e89b-12d3-a456-426614174001",
  "briefText": "Preciso de um sistema de gestão de vendas...",
  "scopeHtml": "<h2>ESCOPO DO PROJETO</h2>\n<ol>\n  <li>\n    <strong>Contexto e objetivo</strong>\n    <ul>\n      <li><strong>Nome do projeto:</strong> VendasPro</li>\n      <li><strong>Objetivo:</strong> Automatizar o processo de vendas...</li>\n      ...\n    </ul>\n  </li>\n  ...\n</ol>",
  "version": 1,
  "createdAt": "2025-12-17T18:00:00.000Z",
  "updatedAt": "2025-12-17T18:00:00.000Z",
  "deletedAt": null,
  "project": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "projectName": "Sistema de Gestão",
    "projectCode": "SG-001"
  },
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "name": "João Silva",
    "email": "joao@example.com"
  }
}
```

### Erros Possíveis

- **404 Not Found** - Escopo não encontrado

---

## 4. Atualizar Escopo de Projeto

**PATCH** `/projects/scopes/:id`

Atualiza parcialmente um escopo existente. Se o `briefText` for atualizado, o HTML será regenerado automaticamente pela IA.

### Parâmetros

- **Path Parameter:**
  - `id` (string UUID, obrigatório) - ID do escopo

### Body (JSON)

- `briefText` (string, opcional) - Novo texto do brief (se fornecido, o HTML será regenerado)
- `scopeHtml` (string, opcional) - HTML do escopo (edição manual)

### Exemplo - Atualizar Brief (Regenera HTML)

```bash
curl -X PATCH "http://localhost:22211/projects/scopes/123e4567-e89b-12d3-a456-426614174002" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "briefText": "Sistema atualizado com novas funcionalidades: agora precisa de integração com WhatsApp para notificações e suporte a múltiplos idiomas."
  }'
```

### Exemplo - Editar HTML Manualmente

```bash
curl -X PATCH "http://localhost:22211/projects/scopes/123e4567-e89b-12d3-a456-426614174002" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "scopeHtml": "<h2>ESCOPO DO PROJETO</h2><p>Conteúdo editado manualmente no CKEditor...</p>"
  }'
```

### Exemplo - Atualizar Ambos

```bash
curl -X PATCH "http://localhost:22211/projects/scopes/123e4567-e89b-12d3-a456-426614174002" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "briefText": "Novo brief atualizado",
    "scopeHtml": "<h2>ESCOPO DO PROJETO</h2><p>HTML editado...</p>"
  }'
```

### Resposta Esperada (200 OK)

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174002",
  "projectId": "123e4567-e89b-12d3-a456-426614174000",
  "userId": "123e4567-e89b-12d3-a456-426614174001",
  "briefText": "Sistema atualizado com novas funcionalidades...",
  "scopeHtml": "<h2>ESCOPO DO PROJETO</h2>...",
  "version": 1,
  "createdAt": "2025-12-17T18:00:00.000Z",
  "updatedAt": "2025-12-17T18:30:00.000Z",
  "deletedAt": null,
  "project": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "projectName": "Sistema de Gestão",
    "projectCode": "SG-001"
  },
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "name": "João Silva",
    "email": "joao@example.com"
  }
}
```

### Erros Possíveis

- **400 Bad Request** - Dados inválidos
- **404 Not Found** - Escopo não encontrado
- **500 Internal Server Error** - Erro na regeneração do escopo pela IA (se briefText foi atualizado)

---

## 5. Deletar Escopo de Projeto

**DELETE** `/projects/scopes/:id`

Realiza soft delete de um escopo (marca como deletado, mas não remove do banco).

### Parâmetros

- **Path Parameter:**
  - `id` (string UUID, obrigatório) - ID do escopo

### Exemplo Básico

```bash
curl -X DELETE "http://localhost:22211/projects/scopes/123e4567-e89b-12d3-a456-426614174002" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada (200 OK)

```json
{
  "message": "Scope deleted successfully"
}
```

### Erros Possíveis

- **404 Not Found** - Escopo não encontrado

---

## Estrutura do HTML Gerado

O HTML gerado pela IA segue um template formal de contrato com três seções principais:

1. **ESCOPO DO PROJETO**
   - Contexto e objetivo
   - Plataformas e canais
   - Usuários, perfis e permissões
   - Entregáveis
   - Fora de escopo

2. **ESPECIFICAÇÕES FUNCIONAIS DO SOFTWARE**
   - Jornada principal
   - Módulos e funcionalidades
   - Pagamentos e cobrança
   - Notificações e comunicação
   - Relatórios e dashboards
   - Integrações
   - Cronograma macro (tabela)

3. **REQUISITOS E INFRAESTRUTURA PARA GARANTIA DO DESENVOLVIMENTO E OPERAÇÃO DO SOFTWARE OBJETO DO CONTRATO**
   - Responsabilidades do cliente
   - Infraestrutura e ambientes
   - Segurança e conformidade
   - Operação, backups e suporte

O HTML está pronto para ser usado diretamente no CKEditor para edição posterior.

---

## Notas Importantes

1. **Geração Automática**: Quando você cria um escopo ou atualiza o `briefText`, a IA analisa o texto e gera automaticamente o HTML formatado.

2. **Versões**: Cada escopo tem um número de versão. Ao criar um novo escopo para o mesmo projeto, a versão é incrementada automaticamente.

3. **Soft Delete**: A exclusão de escopos é feita via soft delete, ou seja, o registro não é removido fisicamente do banco, apenas marcado como deletado (`deletedAt` preenchido).

4. **Registro de Uso de IA**: Todas as chamadas de geração de escopo são registradas no sistema de uso de IA, incluindo o `userId` e `userName` do usuário que fez a requisição.

5. **Edição Manual**: Você pode editar o HTML manualmente através do campo `scopeHtml` no endpoint de atualização, sem regenerar a partir do brief.

6. **Modelo de IA**: O modelo usado para geração pode ser configurado através da variável de ambiente `AI_SCOPE_MODEL` (padrão: `gpt-4o`).

---

## Exemplos de Fluxo Completo

### Criar, Listar, Atualizar e Deletar

```bash
# 1. Criar escopo
SCOPE_ID=$(curl -X POST "http://localhost:22211/projects/scopes" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "projectId": "123e4567-e89b-12d3-a456-426614174000",
    "briefText": "Sistema de gestão de vendas..."
  }' | jq -r '.id')

# 2. Listar escopos
curl -X GET "http://localhost:22211/projects/scopes" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 3. Buscar escopo específico
curl -X GET "http://localhost:22211/projects/scopes/$SCOPE_ID" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 4. Atualizar brief (regenera HTML)
curl -X PATCH "http://localhost:22211/projects/scopes/$SCOPE_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "briefText": "Brief atualizado com novas funcionalidades..."
  }'

# 5. Deletar escopo
curl -X DELETE "http://localhost:22211/projects/scopes/$SCOPE_ID" \
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
- **500 Internal Server Error** - Erro interno do servidor (geralmente relacionado à geração de IA)

---

## Dicas de Uso

1. **Brief Detalhado**: Quanto mais detalhado for o `briefText`, melhor será a qualidade do HTML gerado. Inclua informações sobre plataformas, usuários, módulos, integrações, etc.

2. **Revisão Manual**: Sempre revise o HTML gerado e ajuste manualmente se necessário usando o endpoint de atualização.

3. **Versionamento**: Use o campo `version` para rastrear diferentes versões do escopo do mesmo projeto.

4. **Filtros**: Use o parâmetro `projectId` na listagem para ver apenas os escopos de um projeto específico.

