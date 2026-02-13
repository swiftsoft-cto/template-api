# Comandos cURL - API de Chat e Chat History

Este documento contém exemplos de comandos cURL para todos os endpoints disponíveis no módulo de Chat e Chat History.

## Autenticação

Todos os endpoints requerem autenticação JWT. Substitua `YOUR_ACCESS_TOKEN` pelo token de acesso válido.

**Base URL:** `http://localhost:3000` (ajuste conforme necessário)

---

## 1. Enviar Mensagem ao Chat

**POST** `/chat`

Envia uma mensagem ao chat e recebe uma resposta da IA com possíveis ações executadas.

### Parâmetros

- **Body (JSON):**
  - `message` (string, obrigatório) - Mensagem do usuário

### Exemplo Básico

```bash
curl -X POST "http://localhost:3000/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "message": "Crie a categoria Despesas"
  }'
```

### Exemplo com Mensagem Complexa

```bash
curl -X POST "http://localhost:3000/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "message": "Crie a categoria Despesas e a subcategoria Alimentação dentro dela"
  }'
```

### Resposta Esperada

```json
{
  "reply": "Vou criar a categoria \"Despesas\" e, em seguida, a subcategoria \"Alimentação\" dentro dela.",
  "checklist": [
    {
      "id": "step_1",
      "title": "Criar categoria Despesas",
      "description": "Criar a categoria principal onde as subcategorias de despesas serão organizadas.",
      "status": "success",
      "actions": [...],
      "results": [...]
    },
    {
      "id": "step_2",
      "title": "Criar subcategoria Alimentação",
      "description": "Criar a subcategoria ligada à categoria Despesas.",
      "status": "success",
      "actions": [...],
      "results": [...]
    }
  ],
  "finalAnalysis": "Concluí o plano: a categoria \"Despesas\" e a subcategoria \"Alimentação\" foram criadas com sucesso.",
  "actions": [...],
  "results": [...]
}
```

---

## 2. Obter Histórico de Chat

**GET** `/chat/history`

Retorna o histórico de conversas do usuário autenticado com paginação e filtros opcionais.

### Query Parameters

- `page` (number, opcional, padrão: 1) - Número da página (mínimo: 1)
- `limit` (number, opcional, padrão: 20) - Itens por página (mínimo: 1, máximo: 100)
- `search` (string, opcional) - Busca por texto na mensagem do usuário ou resposta da IA
- `actionType` (string, opcional) - Filtrar por tipo de ação (ex: `financial.category.create`)
- `dateFrom` (ISO datetime, opcional) - Data inicial do intervalo (formato: `2024-01-01T00:00:00.000Z`)
- `dateTo` (ISO datetime, opcional) - Data final do intervalo (formato: `2024-12-31T23:59:59.999Z`)
- `sortBy` (enum, opcional, padrão: `createdAt`) - Campo para ordenação: `createdAt` | `userMessage` | `reply`
- `sortOrder` (enum, opcional, padrão: `desc`) - Ordem de classificação: `asc` | `desc`

### Exemplo Básico - Listagem Simples

```bash
curl -X GET "http://localhost:3000/chat/history" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Paginação

```bash
curl -X GET "http://localhost:3000/chat/history?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Busca por Texto

```bash
curl -X GET "http://localhost:3000/chat/history?search=Alimentação" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo Filtrando por Tipo de Ação

```bash
curl -X GET "http://localhost:3000/chat/history?actionType=financial.category.create" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Filtro de Data

```bash
curl -X GET "http://localhost:3000/chat/history?dateFrom=2024-01-01T00:00:00.000Z&dateTo=2024-12-31T23:59:59.999Z" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Ordenação Personalizada

```bash
curl -X GET "http://localhost:3000/chat/history?sortBy=userMessage&sortOrder=asc" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo Completo com Todos os Filtros

```bash
curl -X GET "http://localhost:3000/chat/history?page=1&limit=50&search=Despesas&actionType=financial.category.create&dateFrom=2024-01-01T00:00:00.000Z&dateTo=2024-12-31T23:59:59.999Z&sortBy=createdAt&sortOrder=desc" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada

```json
{
  "page": 1,
  "limit": 20,
  "total": 100,
  "totalPages": 5,
  "hasNextPage": true,
  "hasPreviousPage": false,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "userMessage": "Crie a categoria Despesas",
      "reply": "Vou criar a categoria \"Despesas\"...",
      "actionsType": ["financial.category.create"],
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

## Notas Importantes

1. **Autenticação Obrigatória**: Todos os endpoints requerem um token JWT válido no header `Authorization: Bearer <token>`.

2. **Content-Type**: O endpoint POST requer o header `Content-Type: application/json`.

3. **Validação**: 
   - A mensagem no POST deve ter pelo menos 1 caractere.
   - Os parâmetros de paginação são validados automaticamente (page >= 1, limit entre 1 e 100).

4. **Permissões**: Algumas ações executadas pelo chat podem requerer permissões específicas do usuário (ex: `financial.categories.manage`, `financial.subcategories.read`).

5. **Histórico Automático**: Todas as conversas são automaticamente salvas no histórico quando uma mensagem é enviada ao chat.

6. **Filtros de Data**: Use o formato ISO 8601 para as datas (`YYYY-MM-DDTHH:mm:ss.sssZ`).

---

## Exemplos de Uso em Sequência

### 1. Enviar uma mensagem ao chat

```bash
curl -X POST "http://localhost:3000/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"message": "Liste todas as categorias financeiras"}'
```

### 2. Consultar o histórico imediatamente após

```bash
curl -X GET "http://localhost:3000/chat/history?page=1&limit=1&sortBy=createdAt&sortOrder=desc" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Troubleshooting

### Erro 401 (Unauthorized)
- Verifique se o token JWT está correto e não expirou.
- Certifique-se de que o header está no formato: `Authorization: Bearer <token>`

### Erro 400 (Bad Request)
- Verifique se o JSON do body está bem formatado.
- Certifique-se de que a mensagem não está vazia.
- Verifique se os parâmetros de query estão no formato correto.

### Erro 403 (Forbidden)
- O usuário pode não ter permissões suficientes para executar determinadas ações.
- Verifique as regras/permissões do usuário.

