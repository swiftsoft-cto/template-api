# Comandos cURL - API de AI Usage

Este documento contém exemplos de comandos cURL para todos os endpoints disponíveis no módulo de AI Usage (Uso de IA).

## Autenticação

Todos os endpoints requerem autenticação JWT. Substitua `YOUR_ACCESS_TOKEN` pelo token de acesso válido.

**Base URL:** `http://localhost:3000` (ajuste conforme necessário)

---

## 1. Listar Registros de Uso de IA

**GET** `/ai/usage`

Retorna uma lista paginada de registros de uso de IA com suporte a filtros, ordenação e paginação.

### Parâmetros de Query (Opcionais)

- `model` (string, opcional) - Filtrar por modelo de IA (ex: `gpt-4`, `gpt-3.5-turbo`)
- `userId` (string, opcional) - Filtrar por ID do usuário
- `kind` (string, opcional) - Filtrar por tipo de chamada (ex: `chat.completions`, `chat.completions.text`)
- `limit` (number, opcional) - Número máximo de registros por página (1-500, padrão: 50)
- `offset` (number, opcional) - Número de registros a pular para paginação (padrão: 0)
- `from` (string, opcional) - Data inicial no formato ISO (ex: `2024-01-01T00:00:00.000Z`)
- `to` (string, opcional) - Data final no formato ISO (ex: `2024-12-31T23:59:59.999Z`)
- `order` (string, opcional) - Ordenação: `asc` ou `desc` (padrão: `desc`)

### Exemplo Básico

```bash
curl -X GET "http://localhost:3000/ai/usage" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Paginação

```bash
curl -X GET "http://localhost:3000/ai/usage?limit=20&offset=0" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo Filtrando por Modelo

```bash
curl -X GET "http://localhost:3000/ai/usage?model=gpt-4" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo Filtrando por Usuário

```bash
curl -X GET "http://localhost:3000/ai/usage?userId=user-123" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo Filtrando por Tipo (Kind)

```bash
curl -X GET "http://localhost:3000/ai/usage?kind=chat.completions" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Filtro de Data

```bash
curl -X GET "http://localhost:3000/ai/usage?from=2024-01-01T00:00:00.000Z&to=2024-12-31T23:59:59.999Z" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Múltiplos Filtros

```bash
curl -X GET "http://localhost:3000/ai/usage?model=gpt-4&userId=user-123&kind=chat.completions&limit=50&offset=0&order=desc" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada (200 OK)

```json
{
  "total": 150,
  "limit": 50,
  "offset": 0,
  "order": "desc",
  "totalCostUsd": 12.45,
  "calls": 150,
  "promptTokens": 45000,
  "completionTokens": 23000,
  "cachedTokens": 5000,
  "totalTokens": 73000,
  "costUsd": 12.45,
  "items": [
    {
      "id": "1234567890-abc123",
      "kind": "chat.completions",
      "model": "gpt-4",
      "userId": "user-123",
      "userName": "João Silva",
      "requestId": "req-456",
      "callName": "createCategory",
      "promptTokens": 500,
      "completionTokens": 250,
      "cachedTokens": 100,
      "totalTokens": 750,
      "costUsd": 0.025,
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": "1234567891-def456",
      "kind": "chat.completions.text",
      "model": "gpt-3.5-turbo",
      "userId": "user-456",
      "userName": "Maria Santos",
      "requestId": "req-789",
      "callName": "analyzeData",
      "promptTokens": 300,
      "completionTokens": 150,
      "cachedTokens": 50,
      "totalTokens": 500,
      "costUsd": 0.001,
      "createdAt": "2024-01-15T10:25:00.000Z"
    }
  ]
}
```

---

## 2. Obter Resumo de Uso de IA

**GET** `/ai/usage/summary`

Retorna um resumo agregado do uso de IA com estatísticas globais, por modelo, por usuário ou combinações específicas.

### Parâmetros de Query (Opcionais)

- `model` (string, opcional) - Filtrar resumo por modelo específico
- `userId` (string, opcional) - Filtrar resumo por usuário específico
- `kind` (string, opcional) - Filtrar resumo por tipo de chamada
- `topModels` (number, opcional) - Número de top modelos a retornar (1-50, padrão: 10)
- `topUsers` (number, opcional) - Número de top usuários a retornar (1-50, padrão: 10)

### Exemplo Básico (Resumo Global)

```bash
curl -X GET "http://localhost:3000/ai/usage/summary" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada - Resumo Global (200 OK)

```json
{
  "global": {
    "calls": 1250,
    "promptTokens": 450000,
    "completionTokens": 230000,
    "cachedTokens": 50000,
    "totalTokens": 730000,
    "costUsd": 124.50,
    "updatedAt": "2024-01-15T12:00:00.000Z"
  },
  "byModel": [
    {
      "model": "gpt-4",
      "calls": 800,
      "promptTokens": 320000,
      "completionTokens": 180000,
      "cachedTokens": 40000,
      "totalTokens": 540000,
      "costUsd": 115.20,
      "updatedAt": "2024-01-15T12:00:00.000Z"
    },
    {
      "model": "gpt-3.5-turbo",
      "calls": 450,
      "promptTokens": 130000,
      "completionTokens": 50000,
      "cachedTokens": 10000,
      "totalTokens": 190000,
      "costUsd": 9.30,
      "updatedAt": "2024-01-15T12:00:00.000Z"
    }
  ],
  "byUser": [
    {
      "userId": "user-123",
      "calls": 450,
      "promptTokens": 180000,
      "completionTokens": 90000,
      "cachedTokens": 20000,
      "totalTokens": 290000,
      "costUsd": 0,
      "updatedAt": "2024-01-15T12:00:00.000Z"
    },
    {
      "userId": "user-456",
      "calls": 320,
      "promptTokens": 120000,
      "completionTokens": 60000,
      "cachedTokens": 15000,
      "totalTokens": 195000,
      "costUsd": 0,
      "updatedAt": "2024-01-15T12:00:00.000Z"
    }
  ]
}
```

### Exemplo Filtrando por Modelo Específico

```bash
curl -X GET "http://localhost:3000/ai/usage/summary?model=gpt-4" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada - Por Modelo (200 OK)

```json
{
  "global": {
    "calls": 1250,
    "promptTokens": 450000,
    "completionTokens": 230000,
    "cachedTokens": 50000,
    "totalTokens": 730000,
    "costUsd": 124.50,
    "updatedAt": "2024-01-15T12:00:00.000Z"
  },
  "model": {
    "key": "gpt-4",
    "calls": 800,
    "promptTokens": 320000,
    "completionTokens": 180000,
    "cachedTokens": 40000,
    "totalTokens": 540000,
    "costUsd": 115.20,
    "updatedAt": "2024-01-15T12:00:00.000Z"
  }
}
```

### Exemplo Filtrando por Usuário Específico

```bash
curl -X GET "http://localhost:3000/ai/usage/summary?userId=user-123" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada - Por Usuário (200 OK)

```json
{
  "global": {
    "calls": 1250,
    "promptTokens": 450000,
    "completionTokens": 230000,
    "cachedTokens": 50000,
    "totalTokens": 730000,
    "costUsd": 124.50,
    "updatedAt": "2024-01-15T12:00:00.000Z"
  },
  "user": {
    "key": "user-123",
    "calls": 450,
    "promptTokens": 180000,
    "completionTokens": 90000,
    "cachedTokens": 20000,
    "totalTokens": 290000,
    "costUsd": 0,
    "updatedAt": "2024-01-15T12:00:00.000Z"
  }
}
```

### Exemplo Filtrando por Modelo e Usuário

```bash
curl -X GET "http://localhost:3000/ai/usage/summary?model=gpt-4&userId=user-123" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada - Por Modelo e Usuário (200 OK)

```json
{
  "global": {
    "calls": 1250,
    "promptTokens": 450000,
    "completionTokens": 230000,
    "cachedTokens": 50000,
    "totalTokens": 730000,
    "costUsd": 124.50,
    "updatedAt": "2024-01-15T12:00:00.000Z"
  },
  "model": {
    "key": "gpt-4",
    "calls": 800,
    "promptTokens": 320000,
    "completionTokens": 180000,
    "cachedTokens": 40000,
    "totalTokens": 540000,
    "costUsd": 115.20,
    "updatedAt": "2024-01-15T12:00:00.000Z"
  },
  "user": {
    "key": "user-123",
    "calls": 450,
    "promptTokens": 180000,
    "completionTokens": 90000,
    "cachedTokens": 20000,
    "totalTokens": 290000,
    "costUsd": 0,
    "updatedAt": "2024-01-15T12:00:00.000Z"
  },
  "modelUser": {
    "model": "gpt-4",
    "userId": "user-123",
    "calls": 300,
    "promptTokens": 120000,
    "completionTokens": 60000,
    "cachedTokens": 15000,
    "totalTokens": 195000,
    "costUsd": 41.60,
    "updatedAt": "2024-01-15T12:00:00.000Z"
  }
}
```

### Exemplo com Top Models e Top Users Personalizados

```bash
curl -X GET "http://localhost:3000/ai/usage/summary?topModels=5&topUsers=5" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Estrutura de Dados

### AiUsageRecord

```typescript
{
  id: string;                    // ID único do registro
  kind: string;                  // Tipo de chamada (ex: "chat.completions")
  model: string;                 // Modelo de IA usado
  userId?: string;               // ID do usuário (opcional)
  userName?: string;             // Nome do usuário (opcional)
  requestId?: string;            // ID da requisição (opcional)
  callName?: string;             // Nome da chamada/função (opcional)
  promptTokens?: number;         // Tokens do prompt
  completionTokens?: number;     // Tokens da completação
  cachedTokens?: number;         // Tokens cacheados
  totalTokens?: number;          // Total de tokens
  costUsd?: number;              // Custo em dólares (calculado)
  createdAt: string;             // Data de criação (ISO 8601)
}
```

### AiUsageListResponse

```typescript
{
  total: number;                 // Total de registros encontrados (após filtros)
  limit: number;                 // Limite de registros por página
  offset: number;                // Offset para paginação
  order: "asc" | "desc";         // Ordenação
  totalCostUsd: number;          // Custo total em dólares
  calls: number;                 // Total de chamadas (ignora paginação)
  promptTokens: number;          // Soma de prompt tokens
  completionTokens: number;      // Soma de completion tokens
  cachedTokens: number;          // Soma de cached tokens
  totalTokens: number;           // Soma de total tokens
  costUsd: number;               // Alias para totalCostUsd
  items: AiUsageRecordWithCost[]; // Array de registros
}
```

### AiUsageAgg

```typescript
{
  calls: number;                 // Número de chamadas
  promptTokens: number;          // Soma de prompt tokens
  completionTokens: number;      // Soma de completion tokens
  cachedTokens: number;          // Soma de cached tokens
  totalTokens: number;           // Soma de total tokens
  costUsd?: number;              // Custo total em dólares
  updatedAt: string;             // Data da última atualização (ISO 8601)
}
```

---

## Códigos de Erro

### 401 Unauthorized

Token de autenticação inválido ou ausente.

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 400 Bad Request

Parâmetros de query inválidos.

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "path": ["limit"],
      "message": "Number must be between 1 and 500"
    }
  ]
}
```

### 500 Internal Server Error

Erro interno do servidor.

```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

---

## Notas Importantes

1. **Autenticação**: Todos os endpoints requerem um token JWT válido no header `Authorization`.

2. **Paginação**: O endpoint `/ai/usage` suporta paginação através dos parâmetros `limit` e `offset`. O máximo de registros por página é 500.

3. **Filtros**: Os filtros podem ser combinados. Por exemplo, você pode filtrar por `model` e `userId` simultaneamente.

4. **Ordenação**: Os registros são ordenados por data de criação. Use `order=asc` para ordem crescente e `order=desc` para ordem decrescente.

5. **Custos**: Os custos em dólares são calculados automaticamente com base no modelo e na quantidade de tokens utilizados.

6. **Datas**: Use o formato ISO 8601 para os parâmetros `from` e `to` (ex: `2024-01-01T00:00:00.000Z`).

7. **Top Lists**: No endpoint `/ai/usage/summary`, as listas `byModel` e `byUser` são ordenadas por `totalTokens` em ordem decrescente.

8. **Resumo por Usuário**: Quando um resumo é filtrado apenas por `userId` (sem `model`), o `costUsd` pode retornar 0, pois não é possível calcular o custo exato sem saber qual modelo foi usado em cada chamada.


