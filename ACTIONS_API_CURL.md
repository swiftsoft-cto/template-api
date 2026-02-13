# Comandos cURL - API de Actions (Módulos AI)

Este documento contém exemplos de comandos cURL para todos os endpoints disponíveis no módulo de Actions (Módulos AI, Submódulos e Actions).

## Autenticação

Todos os endpoints requerem autenticação JWT. Substitua `YOUR_ACCESS_TOKEN` pelo token de acesso válido.

**Base URL:** `http://localhost:3000` (ajuste conforme necessário)

---

## 1. Listar Módulos AI

**GET** `/actions/modules`

Retorna uma lista resumida de todos os módulos AI ativos com seus submódulos.

### Exemplo Básico

```bash
curl -X GET "http://localhost:3000/actions/modules" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada

```json
{
  "message": "Módulos AI listados com sucesso",
  "data": [
    {
      "key": "financial",
      "name": "Módulo Financeiro",
      "description": "Módulo para gerenciamento de categorias e subcategorias financeiras",
      "submodules": [
        {
          "key": "category",
          "name": "Categorias"
        },
        {
          "key": "subcategory",
          "name": "Subcategorias"
        }
      ]
    }
  ]
}
```

---

## 2. Obter Contexto Completo de um Módulo

**GET** `/actions/modules/:moduleKey`

Retorna o contexto completo de um módulo específico, incluindo todos os submódulos e suas actions com detalhes completos.

### Parâmetros

- **Path Parameter:**
  - `moduleKey` (string, obrigatório) - Chave do módulo (ex: `financial`)

### Exemplo Básico

```bash
curl -X GET "http://localhost:3000/actions/modules/financial" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Módulo Inexistente

```bash
curl -X GET "http://localhost:3000/actions/modules/inexistente" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada (Sucesso)

```json
{
  "message": "Contexto do módulo obtido com sucesso",
  "data": {
    "key": "financial",
    "name": "Módulo Financeiro",
    "description": "Módulo para gerenciamento de categorias e subcategorias financeiras",
    "submodules": [
      {
        "key": "category",
        "name": "Categorias",
        "description": "Gerenciamento de categorias financeiras",
        "basePath": "/financial/categories",
        "actions": [
          {
            "id": "uuid",
            "key": "createCategory",
            "name": "Criar categoria",
            "description": "Cria uma nova categoria financeira",
            "method": "POST",
            "path": "/financial/categories",
            "actionType": "financial.category.create",
            "kind": "internal",
            "permissionRule": "financial.categories.manage",
            "requestSchema": {
              "type": "object",
              "properties": {
                "name": {
                  "type": "string",
                  "description": "Nome da categoria"
                },
                "description": {
                  "type": "string",
                  "description": "Descrição da categoria"
                }
              },
              "required": ["name"]
            },
            "responseSchema": {
              "type": "object",
              "properties": {
                "message": {
                  "type": "string"
                },
                "data": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "name": {
                      "type": "string"
                    },
                    "description": {
                      "type": "string"
                    },
                    "createdAt": {
                      "type": "string"
                    },
                    "updatedAt": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          {
            "id": "uuid",
            "key": "listCategories",
            "name": "Listar categorias",
            "description": "Lista todas as categorias financeiras com paginação e filtros",
            "method": "GET",
            "path": "/financial/categories",
            "actionType": "financial.category.list",
            "kind": "internal",
            "permissionRule": "financial.categories.read",
            "requestSchema": { ... },
            "responseSchema": { ... }
          }
        ]
      }
    ]
  }
}
```

### Resposta Esperada (Módulo Não Encontrado)

```json
{
  "message": "Módulo não encontrado ou inativo",
  "data": null
}
```

---

## 3. Listar Submódulos

**GET** `/actions/submodules`

Retorna uma lista paginada de submódulos AI com filtros e busca.

### Query Parameters

- `page` (number, opcional, padrão: 1) - Número da página (mínimo: 1)
- `limit` (number, opcional, padrão: 10) - Itens por página (mínimo: 1, máximo: 100)
- `search` (string, opcional) - Busca por nome, key ou descrição do submódulo
- `moduleKey` (string, opcional) - Filtrar por chave do módulo (ex: `financial`)
- `sortBy` (enum, opcional, padrão: `name`) - Campo para ordenação: `name` | `key`
- `sortOrder` (enum, opcional, padrão: `asc`) - Ordem de classificação: `asc` | `desc`

### Exemplo Básico - Listagem Simples

```bash
curl -X GET "http://localhost:3000/actions/submodules" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Paginação

```bash
curl -X GET "http://localhost:3000/actions/submodules?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Busca por Nome

```bash
curl -X GET "http://localhost:3000/actions/submodules?search=categoria" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo Filtrando por Módulo

```bash
curl -X GET "http://localhost:3000/actions/submodules?moduleKey=financial" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Ordenação Personalizada

```bash
curl -X GET "http://localhost:3000/actions/submodules?sortBy=key&sortOrder=desc" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo Completo com Todos os Filtros

```bash
curl -X GET "http://localhost:3000/actions/submodules?page=1&limit=50&search=categoria&moduleKey=financial&sortBy=name&sortOrder=asc" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada

```json
{
  "message": "Submódulos listados com sucesso",
  "data": [
    {
      "id": "uuid",
      "key": "category",
      "name": "Categorias",
      "description": "Gerenciamento de categorias financeiras",
      "basePath": "/financial/categories",
      "module": {
        "key": "financial",
        "name": "Módulo Financeiro"
      },
      "isActive": true
    },
    {
      "id": "uuid",
      "key": "subcategory",
      "name": "Subcategorias",
      "description": "Gerenciamento de subcategorias financeiras",
      "basePath": "/financial/subcategories",
      "module": {
        "key": "financial",
        "name": "Módulo Financeiro"
      },
      "isActive": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 2,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

---

## 4. Listar Actions

**GET** `/actions/`

Retorna uma lista paginada de actions AI com filtros e busca.

### Query Parameters

- `page` (number, opcional, padrão: 1) - Número da página (mínimo: 1)
- `limit` (number, opcional, padrão: 10) - Itens por página (mínimo: 1, máximo: 100)
- `search` (string, opcional) - Busca por nome, key, actionType ou descrição da action
- `moduleKey` (string, opcional) - Filtrar por chave do módulo (ex: `financial`)
- `submoduleKey` (string, opcional) - Filtrar por chave do submódulo (ex: `category`)
- `sortBy` (enum, opcional, padrão: `name`) - Campo para ordenação: `name` | `key` | `actionType`
- `sortOrder` (enum, opcional, padrão: `asc`) - Ordem de classificação: `asc` | `desc`

### Exemplo Básico - Listagem Simples

```bash
curl -X GET "http://localhost:3000/actions/" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Paginação

```bash
curl -X GET "http://localhost:3000/actions/?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Busca por Nome

```bash
curl -X GET "http://localhost:3000/actions/?search=criar" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo Filtrando por Módulo

```bash
curl -X GET "http://localhost:3000/actions/?moduleKey=financial" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo Filtrando por Submódulo

```bash
curl -X GET "http://localhost:3000/actions/?submoduleKey=category" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo Filtrando por Módulo e Submódulo

```bash
curl -X GET "http://localhost:3000/actions/?moduleKey=financial&submoduleKey=category" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo com Ordenação por ActionType

```bash
curl -X GET "http://localhost:3000/actions/?sortBy=actionType&sortOrder=asc" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Exemplo Completo com Todos os Filtros

```bash
curl -X GET "http://localhost:3000/actions/?page=1&limit=50&search=criar&moduleKey=financial&submoduleKey=category&sortBy=name&sortOrder=asc" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resposta Esperada

```json
{
  "message": "Actions listadas com sucesso",
  "data": [
    {
      "id": "uuid",
      "key": "createCategory",
      "name": "Criar categoria",
      "description": "Cria uma nova categoria financeira",
      "kind": "internal",
      "method": "POST",
      "path": "/financial/categories",
      "actionType": "financial.category.create",
      "externalBaseUrl": null,
      "permissionRule": "financial.categories.manage",
      "requestSchema": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Nome da categoria"
          },
          "description": {
            "type": "string",
            "description": "Descrição da categoria"
          }
        },
        "required": ["name"]
      },
      "responseSchema": {
        "type": "object",
        "properties": {
          "message": {
            "type": "string"
          },
          "data": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "description": {
                "type": "string"
              },
              "createdAt": {
                "type": "string"
              },
              "updatedAt": {
                "type": "string"
              }
            }
          }
        }
      },
      "submodule": {
        "key": "category",
        "name": "Categorias"
      },
      "module": {
        "key": "financial",
        "name": "Módulo Financeiro"
      },
      "isActive": true
    },
    {
      "id": "uuid",
      "key": "listCategories",
      "name": "Listar categorias",
      "description": "Lista todas as categorias financeiras com paginação e filtros",
      "kind": "internal",
      "method": "GET",
      "path": "/financial/categories",
      "actionType": "financial.category.list",
      "externalBaseUrl": null,
      "permissionRule": "financial.categories.read",
      "requestSchema": { ... },
      "responseSchema": { ... },
      "submodule": {
        "key": "category",
        "name": "Categorias"
      },
      "module": {
        "key": "financial",
        "name": "Módulo Financeiro"
      },
      "isActive": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

---

## Notas Importantes

1. **Autenticação Obrigatória**: Todos os endpoints requerem um token JWT válido no header `Authorization: Bearer <token>`.

2. **Validação de Parâmetros**: 
   - Os parâmetros de paginação são validados automaticamente (page >= 1, limit entre 1 e 100).
   - Os valores de `sortBy` e `sortOrder` são validados contra os valores permitidos.

3. **Filtros de Busca**: 
   - A busca (`search`) é case-insensitive e busca em múltiplos campos:
     - **Submódulos**: nome, key e descrição
     - **Actions**: nome, key, actionType e descrição

4. **Filtros Combinados**: 
   - Você pode combinar múltiplos filtros na mesma requisição.
   - Para actions, você pode filtrar por `moduleKey` e `submoduleKey` simultaneamente.

5. **Ordenação**: 
   - A ordenação padrão é por `name` em ordem `asc`.
   - Para actions, você pode ordenar por `name`, `key` ou `actionType`.

6. **Registros Ativos**: 
   - Apenas módulos, submódulos e actions com `isActive: true` são retornados.
   - Módulos inativos não aparecem nos resultados, mesmo que seus submódulos/actions estejam ativos.

---

## Exemplos de Uso em Sequência

### 1. Listar todos os módulos disponíveis

```bash
curl -X GET "http://localhost:3000/actions/modules" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 2. Obter detalhes completos do módulo financeiro

```bash
curl -X GET "http://localhost:3000/actions/modules/financial" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 3. Listar submódulos do módulo financeiro

```bash
curl -X GET "http://localhost:3000/actions/submodules?moduleKey=financial" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 4. Listar todas as actions de categorias

```bash
curl -X GET "http://localhost:3000/actions/?moduleKey=financial&submoduleKey=category" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 5. Buscar actions que contenham "criar" no nome

```bash
curl -X GET "http://localhost:3000/actions/?search=criar" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Troubleshooting

### Erro 401 (Unauthorized)
- Verifique se o token JWT está correto e não expirou.
- Certifique-se de que o header está no formato: `Authorization: Bearer <token>`

### Erro 400 (Bad Request)
- Verifique se os parâmetros de query estão no formato correto.
- Certifique-se de que os valores de `sortBy` e `sortOrder` são válidos.
- Verifique se `page` >= 1 e `limit` está entre 1 e 100.

### Erro 404 (Not Found)
- Para o endpoint `/actions/modules/:moduleKey`, verifique se a chave do módulo existe e está ativa.

### Nenhum Resultado Retornado
- Verifique se os filtros aplicados não estão muito restritivos.
- Certifique-se de que existem módulos/submódulos/actions ativos no sistema.
- Tente remover alguns filtros para verificar se há dados disponíveis.

---

## Estrutura de Dados

### Módulo (Module)
```typescript
{
  key: string;              // Chave técnica única (ex: "financial")
  name: string;             // Nome amigável (ex: "Módulo Financeiro")
  description?: string;      // Descrição opcional
  submodules: Array<{       // Lista de submódulos
    key: string;
    name: string;
  }>;
}
```

### Submódulo (Submodule)
```typescript
{
  id: string;               // UUID
  key: string;             // Chave técnica (ex: "category")
  name: string;            // Nome amigável (ex: "Categorias")
  description?: string;     // Descrição opcional
  basePath?: string;       // Base path HTTP (ex: "/financial/categories")
  module: {                // Informações do módulo pai
    key: string;
    name: string;
  };
  isActive: boolean;        // Status de ativação
}
```

### Action
```typescript
{
  id: string;              // UUID
  key: string;             // Chave técnica (ex: "createCategory")
  name: string;            // Nome amigável (ex: "Criar categoria")
  description?: string;    // Descrição opcional
  kind: "internal" | "http"; // Tipo de action
  method?: string;         // Método HTTP (ex: "POST", "GET")
  path?: string;           // Caminho HTTP (ex: "/financial/categories")
  actionType?: string;      // Tipo de action para execução (ex: "financial.category.create")
  externalBaseUrl?: string; // URL base para actions HTTP externas
  permissionRule?: string;  // Regra de permissão necessária
  requestSchema?: object;   // Schema JSON para validação de request
  responseSchema?: object;  // Schema JSON para documentação de response
  submodule: {             // Informações do submódulo pai
    key: string;
    name: string;
  };
  module: {                // Informações do módulo pai
    key: string;
    name: string;
  };
  isActive: boolean;         // Status de ativação
}
```

---

## Casos de Uso Comuns

### Descobrir quais actions estão disponíveis para um módulo

```bash
# 1. Obter contexto completo do módulo
curl -X GET "http://localhost:3000/actions/modules/financial" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Filtrar actions por tipo de operação (criar, listar, atualizar, remover)

```bash
# Buscar todas as actions de criação
curl -X GET "http://localhost:3000/actions/?search=create" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Buscar todas as actions de listagem
curl -X GET "http://localhost:3000/actions/?search=list" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Verificar permissões necessárias para executar actions

```bash
# Listar actions e verificar o campo permissionRule
curl -X GET "http://localhost:3000/actions/?moduleKey=financial" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" | jq '.data[] | {name, permissionRule}'
```

