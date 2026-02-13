# API de Notificações - CURL para Postman

## Variáveis do Postman
- `{{URL}}` - URL base da API (ex: `http://localhost:3000`)
- `{{bearer}}` - Token JWT de autenticação

---

## 1. Criar Notificação

```bash
curl --location '{{URL}}/notifications' \
--header 'Authorization: Bearer {{bearer}}' \
--header 'Content-Type: application/json' \
--data '{
    "userId": "uuid-do-usuario",
    "title": "Nova transação financeira",
    "message": "Uma nova transação foi registrada no sistema",
    "entity": "finance",
    "registerId": "5550d260-36c1-4a6e-a290-6dbd501e594b"
}'
```

---

## 2. Listar Notificações do Usuário

```bash
curl --location '{{URL}}/notifications?page=1&limit=10&read=false&entity=finance&search=transação&sortBy=createdAt&sortOrder=desc' \
--header 'Authorization: Bearer {{bearer}}'
```

**Query Parameters opcionais:**
- `page=1` - Número da página
- `limit=10` - Itens por página (máximo: 100)
- `search=transação` - Busca por título ou mensagem
- `read=false` - Filtrar por lidas (true/false)
- `entity=finance` - Filtrar por entidade
- `sortBy=createdAt` - Campo para ordenação (createdAt, readAt, title)
- `sortOrder=desc` - Ordem (asc, desc)

---

## 3. Buscar Notificação Específica

```bash
curl --location '{{URL}}/notifications/5550d260-36c1-4a6e-a290-6dbd501e594b' \
--header 'Authorization: Bearer {{bearer}}'
```

---

## 4. Marcar Notificação como Lida

```bash
curl --location --request PATCH '{{URL}}/notifications/5550d260-36c1-4a6e-a290-6dbd501e594b/read' \
--header 'Authorization: Bearer {{bearer}}' \
--header 'Content-Type: application/json' \
--data '{
    "read": true
}'
```

**Para marcar como não lida:**
```bash
curl --location --request PATCH '{{URL}}/notifications/5550d260-36c1-4a6e-a290-6dbd501e594b/read' \
--header 'Authorization: Bearer {{bearer}}' \
--header 'Content-Type: application/json' \
--data '{
    "read": false
}'
```

---

## 5. Marcar Todas as Notificações como Lidas

```bash
curl --location --request POST '{{URL}}/notifications/mark-all-read' \
--header 'Authorization: Bearer {{bearer}}'
```

---

## 6. Contar Notificações Não Lidas

```bash
curl --location '{{URL}}/notifications/unread/count' \
--header 'Authorization: Bearer {{bearer}}'
```

**Com filtro por entidade:**
```bash
curl --location '{{URL}}/notifications/unread/count?entity=finance' \
--header 'Authorization: Bearer {{bearer}}'
```

---

## 7. Remover Notificação

```bash
curl --location --request DELETE '{{URL}}/notifications/5550d260-36c1-4a6e-a290-6dbd501e594b' \
--header 'Authorization: Bearer {{bearer}}'
```

---

## Exemplos de Uso

### Exemplo 1: Criar notificação sobre financeiro
```bash
curl --location '{{URL}}/notifications' \
--header 'Authorization: Bearer {{bearer}}' \
--header 'Content-Type: application/json' \
--data '{
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "title": "Nova transação criada",
    "message": "Uma nova transação no valor de R$ 1.500,00 foi registrada",
    "entity": "finance",
    "registerId": "5550d260-36c1-4a6e-a290-6dbd501e594b"
}'
```

### Exemplo 2: Listar apenas notificações não lidas
```bash
curl --location '{{URL}}/notifications?read=false&page=1&limit=20' \
--header 'Authorization: Bearer {{bearer}}'
```

### Exemplo 3: Buscar notificações de uma entidade específica
```bash
curl --location '{{URL}}/notifications?entity=finance&sortBy=createdAt&sortOrder=desc' \
--header 'Authorization: Bearer {{bearer}}'
```

### Exemplo 4: Buscar notificações por termo
```bash
curl --location '{{URL}}/notifications?search=transação&page=1&limit=10' \
--header 'Authorization: Bearer {{bearer}}'
```

---

## Permissões Necessárias

| Endpoint | Permissão |
|----------|-----------|
| POST `/notifications` | `notifications.create` |
| GET `/notifications` | `notifications.read` |
| GET `/notifications/:id` | `notifications.read` |
| PATCH `/notifications/:id/read` | `notifications.update` |
| POST `/notifications/mark-all-read` | `notifications.update` |
| GET `/notifications/unread/count` | `notifications.read` |
| DELETE `/notifications/:id` | `notifications.delete` |

---

## Respostas de Exemplo

### Criar Notificação (201 Created)
```json
{
  "message": "Notificação criada com sucesso",
  "data": {
    "id": "5550d260-36c1-4a6e-a290-6dbd501e594b",
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "title": "Nova transação financeira",
    "message": "Uma nova transação foi registrada no sistema",
    "entity": "finance",
    "registerId": "5550d260-36c1-4a6e-a290-6dbd501e594b",
    "read": false,
    "readAt": null,
    "createdAt": "2025-12-30T16:00:00.000Z",
    "updatedAt": "2025-12-30T16:00:00.000Z"
  }
}
```

### Listar Notificações (200 OK)
```json
{
  "message": "Notificações listadas com sucesso",
  "data": [
    {
      "id": "5550d260-36c1-4a6e-a290-6dbd501e594b",
      "userId": "123e4567-e89b-12d3-a456-426614174000",
      "title": "Nova transação financeira",
      "message": "Uma nova transação foi registrada no sistema",
      "entity": "finance",
      "registerId": "5550d260-36c1-4a6e-a290-6dbd501e594b",
      "read": false,
      "readAt": null,
      "createdAt": "2025-12-30T16:00:00.000Z",
      "updatedAt": "2025-12-30T16:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

### Contar Não Lidas (200 OK)
```json
{
  "message": "Contagem de notificações não lidas",
  "data": {
    "count": 5
  }
}
```

