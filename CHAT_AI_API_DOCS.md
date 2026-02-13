# Documentação da API de Chat e IA

Documentação completa dos endpoints de Chat e IA para integração no frontend.

## 📋 Índice

- [Informações Gerais](#informações-gerais)
- [Endpoints](#endpoints)
  - [POST /chat - Enviar Mensagem](#post-chat---enviar-mensagem)
  - [GET /chat/history - Obter Histórico](#get-chathistory---obter-histórico)
- [Estruturas de Dados](#estruturas-de-dados)
- [Exemplos de Uso](#exemplos-de-uso)
- [Códigos de Erro](#códigos-de-erro)

---

## Informações Gerais

### Base URL

```
http://localhost:3000
```

**Nota:** Ajuste conforme o ambiente (desenvolvimento, staging, produção).

### Autenticação

Todos os endpoints requerem autenticação JWT. O token deve ser enviado no header:

```
Authorization: Bearer <seu_token_jwt>
```

### Content-Type

Para requisições POST, use:

```
Content-Type: application/json
```

---

## Endpoints

### POST /chat - Enviar Mensagem

Envia uma mensagem ao chat e recebe uma resposta da IA com possíveis ações executadas.

**URL:** `/chat`

**Método:** `POST`

**Autenticação:** ✅ Obrigatória (JWT)

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <token>
```

#### Request Body

```typescript
{
  message: string; // Obrigatório, mínimo 1 caractere
}
```

**Exemplo:**
```json
{
  "message": "Crie a categoria Despesas e a subcategoria Alimentação dentro dela"
}
```

#### Response (200 OK)

```typescript
{
  reply: string;                    // Resposta textual da IA
  checklist: ChecklistItem[];        // Lista de etapas do plano executado
  finalAnalysis?: string | null;     // Análise final opcional
  actions: GenericAction[];         // Todas as ações executadas (flattened)
  results: ActionResult[];          // Resultados de todas as ações
}
```

**Estrutura de ChecklistItem:**
```typescript
{
  id: string;                       // ID único da etapa
  title: string;                    // Título da etapa
  description?: string;             // Descrição opcional
  status: 'success' | 'failed';     // Status da execução
  actions: GenericAction[];         // Ações desta etapa
  results: ActionResult[];          // Resultados desta etapa
}
```

**Estrutura de GenericAction:**
```typescript
{
  type: string;                     // Tipo da ação (ex: "financial.category.create")
  input: Record<string, any>;       // Parâmetros da ação
}
```

**Estrutura de ActionResult:**
```typescript
{
  action: GenericAction;             // Ação executada
  internalActionId?: string;        // ID da action interna (se aplicável)
  externalActionId?: string;         // ID da action HTTP (se aplicável)
  result?: any;                     // Resultado da execução
  error?: string;                   // Mensagem de erro (se houver)
}
```

#### Exemplo de Resposta Completa

```json
{
  "reply": "Vou criar a categoria \"Despesas\" e, em seguida, a subcategoria \"Alimentação\" dentro dela.",
  "checklist": [
    {
      "id": "step_1",
      "title": "Criar categoria Despesas",
      "description": "Criar a categoria principal onde as subcategorias de despesas serão organizadas.",
      "status": "success",
      "actions": [
        {
          "type": "financial.category.create",
          "input": {
            "name": "Despesas",
            "description": null
          }
        }
      ],
      "results": [
        {
          "action": {
            "type": "financial.category.create",
            "input": {
              "name": "Despesas",
              "description": null
            }
          },
          "internalActionId": "uuid-da-action",
          "result": {
            "message": "Categoria criada com sucesso",
            "data": {
              "id": "550e8400-e29b-41d4-a716-446655440000",
              "name": "Despesas",
              "description": null,
              "createdAt": "2024-01-15T10:30:00.000Z",
              "updatedAt": "2024-01-15T10:30:00.000Z"
            }
          }
        }
      ]
    },
    {
      "id": "step_2",
      "title": "Criar subcategoria Alimentação",
      "description": "Criar a subcategoria ligada à categoria Despesas.",
      "status": "success",
      "actions": [
        {
          "type": "financial.subcategory.create",
          "input": {
            "categoryId": "550e8400-e29b-41d4-a716-446655440000",
            "name": "Alimentação",
            "description": null
          }
        }
      ],
      "results": [
        {
          "action": {
            "type": "financial.subcategory.create",
            "input": {
              "categoryId": "550e8400-e29b-41d4-a716-446655440000",
              "name": "Alimentação",
              "description": null
            }
          },
          "internalActionId": "uuid-da-action",
          "result": {
            "message": "Subcategoria criada com sucesso",
            "data": {
              "id": "660e8400-e29b-41d4-a716-446655440001",
              "categoryId": "550e8400-e29b-41d4-a716-446655440000",
              "name": "Alimentação",
              "description": null,
              "createdAt": "2024-01-15T10:30:01.000Z"
            }
          }
        }
      ]
    }
  ],
  "finalAnalysis": "Concluí o plano: a categoria \"Despesas\" e a subcategoria \"Alimentação\" foram criadas com sucesso.",
  "actions": [
    {
      "type": "financial.category.create",
      "input": {
        "name": "Despesas",
        "description": null
      }
    },
    {
      "type": "financial.subcategory.create",
      "input": {
        "categoryId": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Alimentação",
        "description": null
      }
    }
  ],
  "results": [
    {
      "action": {
        "type": "financial.category.create",
        "input": {
          "name": "Despesas",
          "description": null
        }
      },
      "internalActionId": "uuid-da-action",
      "result": {
        "message": "Categoria criada com sucesso",
        "data": { /* ... */ }
      }
    },
    {
      "action": {
        "type": "financial.subcategory.create",
        "input": {
          "categoryId": "550e8400-e29b-41d4-a716-446655440000",
          "name": "Alimentação",
          "description": null
        }
      },
      "internalActionId": "uuid-da-action",
      "result": {
        "message": "Subcategoria criada com sucesso",
        "data": { /* ... */ }
      }
    }
  ]
}
```

#### Resposta quando não há ações (apenas conversa)

```json
{
  "reply": "Entendi sua pergunta. Posso ajudá-lo com informações sobre categorias financeiras.",
  "checklist": [],
  "finalAnalysis": null,
  "actions": [],
  "results": []
}
```

#### Resposta de Erro

```json
{
  "reply": "Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.",
  "checklist": [],
  "finalAnalysis": null,
  "actions": [],
  "results": [
    {
      "error": "Erro ao processar mensagem",
      "details": "Mensagem de erro detalhada"
    }
  ]
}
```

---

### GET /chat/history - Obter Histórico

Retorna o histórico de conversas do usuário autenticado com paginação e filtros opcionais.

**URL:** `/chat/history`

**Método:** `GET`

**Autenticação:** ✅ Obrigatória (JWT)

**Headers:**
```
Authorization: Bearer <token>
```

#### Query Parameters

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|-------------|--------|-----------|
| `page` | number | Não | `1` | Número da página (mínimo: 1) |
| `limit` | number | Não | `20` | Itens por página (mínimo: 1, máximo: 100) |
| `search` | string | Não | - | Busca por texto na mensagem do usuário ou resposta da IA |
| `actionType` | string | Não | - | Filtrar por tipo de ação (ex: `financial.category.create`) |
| `dateFrom` | string (ISO 8601) | Não | - | Data inicial do intervalo (ex: `2024-01-01T00:00:00.000Z`) |
| `dateTo` | string (ISO 8601) | Não | - | Data final do intervalo (ex: `2024-12-31T23:59:59.999Z`) |
| `sortBy` | enum | Não | `createdAt` | Campo para ordenação: `createdAt` \| `userMessage` \| `reply` |
| `sortOrder` | enum | Não | `desc` | Ordem de classificação: `asc` \| `desc` |

#### Response (200 OK)

```typescript
{
  page: number;              // Página atual
  limit: number;             // Itens por página
  total: number;             // Total de registros
  totalPages: number;         // Total de páginas
  hasNextPage: boolean;      // Tem próxima página
  hasPreviousPage: boolean;  // Tem página anterior
  data: ChatHistoryItem[];  // Lista de itens do histórico
}
```

**Estrutura de ChatHistoryItem:**
```typescript
{
  id: string;                    // UUID do registro
  userId: string;                // UUID do usuário
  userMessage: string;           // Mensagem enviada pelo usuário
  reply: string;                // Resposta da IA
  actionsType: string[];         // Lista de tipos de ações executadas
  createdAt: Date;               // Data de criação (ISO 8601)
}
```

#### Exemplo de Resposta

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
      "id": "770e8400-e29b-41d4-a716-446655440000",
      "userId": "880e8400-e29b-41d4-a716-446655440000",
      "userMessage": "Crie a categoria Despesas",
      "reply": "Vou criar a categoria \"Despesas\"...",
      "actionsType": ["financial.category.create"],
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": "770e8400-e29b-41d4-a716-446655440001",
      "userId": "880e8400-e29b-41d4-a716-446655440000",
      "userMessage": "Liste todas as categorias",
      "reply": "Aqui estão todas as categorias...",
      "actionsType": ["financial.category.list"],
      "createdAt": "2024-01-15T10:25:00.000Z"
    }
  ]
}
```

---

## Estruturas de Dados

### ChecklistItem

```typescript
interface ChecklistItem {
  id: string;
  title: string;
  description?: string;
  status: 'success' | 'failed';
  actions: GenericAction[];
  results: ActionResult[];
}
```

### GenericAction

```typescript
interface GenericAction {
  type: string;                    // Tipo da ação (ex: "financial.category.create")
  input: Record<string, any>;      // Parâmetros da ação
}
```

### ActionResult

```typescript
interface ActionResult {
  action: GenericAction;
  internalActionId?: string;       // ID da action interna (se kind = 'internal')
  externalActionId?: string;       // ID da action HTTP (se kind = 'http')
  result?: any;                    // Resultado da execução
  error?: string;                  // Mensagem de erro (se houver)
}
```

### ChatHistoryItem

```typescript
interface ChatHistoryItem {
  id: string;
  userId: string;
  userMessage: string;
  reply: string;
  actionsType: string[];
  createdAt: Date;
}
```

### ChatResponse

```typescript
interface ChatResponse {
  reply: string;
  checklist: ChecklistItem[];
  finalAnalysis?: string | null;
  actions: GenericAction[];
  results: ActionResult[];
}
```

### ChatHistoryResponse

```typescript
interface ChatHistoryResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  data: ChatHistoryItem[];
}
```

---

## Exemplos de Uso

### JavaScript/TypeScript (Fetch API)

#### Enviar Mensagem

```typescript
async function sendChatMessage(message: string, token: string) {
  const response = await fetch('http://localhost:3000/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ message })
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

// Uso
const result = await sendChatMessage(
  'Crie a categoria Despesas',
  'seu_token_jwt'
);
console.log(result);
```

#### Obter Histórico

```typescript
async function getChatHistory(
  token: string,
  options?: {
    page?: number;
    limit?: number;
    search?: string;
    actionType?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: 'createdAt' | 'userMessage' | 'reply';
    sortOrder?: 'asc' | 'desc';
  }
) {
  const params = new URLSearchParams();
  
  if (options?.page) params.append('page', options.page.toString());
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.search) params.append('search', options.search);
  if (options?.actionType) params.append('actionType', options.actionType);
  if (options?.dateFrom) params.append('dateFrom', options.dateFrom);
  if (options?.dateTo) params.append('dateTo', options.dateTo);
  if (options?.sortBy) params.append('sortBy', options.sortBy);
  if (options?.sortOrder) params.append('sortOrder', options.sortOrder);

  const url = `http://localhost:3000/chat/history?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

// Uso
const history = await getChatHistory('seu_token_jwt', {
  page: 1,
  limit: 20,
  search: 'Despesas',
  sortBy: 'createdAt',
  sortOrder: 'desc'
});
console.log(history);
```

### Axios

#### Enviar Mensagem

```typescript
import axios from 'axios';

async function sendChatMessage(message: string, token: string) {
  const response = await axios.post(
    'http://localhost:3000/chat',
    { message },
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  return response.data;
}
```

#### Obter Histórico

```typescript
import axios from 'axios';

async function getChatHistory(token: string, params?: any) {
  const response = await axios.get(
    'http://localhost:3000/chat/history',
    {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params
    }
  );
  
  return response.data;
}
```

### React Hook Example

```typescript
import { useState, useCallback } from 'react';
import axios from 'axios';

interface ChatResponse {
  reply: string;
  checklist: any[];
  finalAnalysis?: string | null;
  actions: any[];
  results: any[];
}

export function useChat(token: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (message: string): Promise<ChatResponse> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.post(
        'http://localhost:3000/chat',
        { message },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      return response.data;
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Erro ao enviar mensagem';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  return { sendMessage, loading, error };
}

// Uso no componente
function ChatComponent() {
  const token = 'seu_token_jwt';
  const { sendMessage, loading, error } = useChat(token);
  const [response, setResponse] = useState<ChatResponse | null>(null);

  const handleSend = async () => {
    try {
      const result = await sendMessage('Crie a categoria Despesas');
      setResponse(result);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <button onClick={handleSend} disabled={loading}>
        {loading ? 'Enviando...' : 'Enviar Mensagem'}
      </button>
      {error && <p>Erro: {error}</p>}
      {response && <pre>{JSON.stringify(response, null, 2)}</pre>}
    </div>
  );
}
```

---

## Códigos de Erro

### 400 Bad Request

**Causas:**
- Body JSON mal formatado
- Campo `message` vazio ou ausente
- Parâmetros de query inválidos (ex: `page < 1`, `limit > 100`)

**Exemplo:**
```json
{
  "statusCode": 400,
  "message": "message must be at least 1 character"
}
```

### 401 Unauthorized

**Causas:**
- Token JWT ausente
- Token JWT inválido ou expirado

**Exemplo:**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 403 Forbidden

**Causas:**
- Usuário não tem permissão para executar determinadas ações
- Ações requerem permissões específicas que o usuário não possui

**Exemplo:**
```json
{
  "statusCode": 403,
  "message": "Você não tem permissão para executar a ação: financial.category.create"
}
```

### 500 Internal Server Error

**Causas:**
- Erro interno do servidor
- Erro ao processar resposta da IA
- Erro ao executar ações

**Exemplo:**
```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

---

## Notas Importantes

### 1. Histórico Automático

Todas as conversas são **automaticamente salvas** no histórico quando uma mensagem é enviada ao chat. Não é necessário fazer uma chamada adicional para salvar.

### 2. Permissões

Algumas ações executadas pelo chat podem requerer permissões específicas do usuário. Exemplos:
- `financial.category.create` - Criar categorias
- `financial.category.read` - Listar categorias
- `financial.subcategory.manage` - Gerenciar subcategorias

### 3. Múltiplas Ações

Você pode solicitar múltiplas operações em uma única mensagem. A IA executará todas na ordem lógica definida no checklist.

### 4. Validação

Os dados são validados tanto pela estrutura JSON da IA quanto pelos schemas Zod dos services, garantindo máxima segurança.

### 5. Formato de Data

Use o formato **ISO 8601** para filtros de data:
```
2024-01-01T00:00:00.000Z
```

### 6. Timeout

As requisições de chat podem levar alguns segundos devido ao processamento da IA. Configure timeouts adequados no frontend (recomendado: 60-120 segundos).

### 7. Actions Internas vs HTTP

- **Actions Internas** (`kind = 'internal'`): Executadas diretamente nos services do backend
- **Actions HTTP** (`kind = 'http'`): Fazem chamadas HTTP para endpoints externos

Ambos os tipos aparecem na resposta com os campos `internalActionId` ou `externalActionId` respectivamente.

---

## Exemplos de Mensagens

### Criar Categoria

```
"Crie a categoria Despesas"
```

### Criar Múltiplas Categorias

```
"Crie as categorias Receitas, Despesas e Investimentos"
```

### Criar Categoria com Subcategoria

```
"Crie a categoria Despesas e a subcategoria Alimentação dentro dela"
```

### Listar Categorias

```
"Liste todas as categorias financeiras"
```

### Buscar Categoria

```
"Mostre os detalhes da categoria Despesas"
```

### Atualizar Categoria

```
"Atualize a categoria Despesas para ter a descrição 'Categoria para todas as despesas'"
```

### Deletar Categoria

```
"Remova a categoria Despesas"
```

### Operações Complexas

```
"Crie a categoria Despesas, depois crie as subcategorias Alimentação e Transporte dentro dela, e por fim liste todas as categorias"
```

---

## Suporte

Para dúvidas ou problemas, consulte:
- Logs do servidor para erros detalhados
- Documentação do backend para entender as actions disponíveis
- Schema de validação para entender os formatos esperados

