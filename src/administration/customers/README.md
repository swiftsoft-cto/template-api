# Módulo Customers

Este módulo gerencia clientes (pessoas físicas e jurídicas) com suas respectivas estruturas de dados relacionadas.

## Funcionalidades

### Clientes (PF/PJ)
- **POST** `/customers` - Criar novo cliente
- **GET** `/customers/:id?tree=true` - Buscar cliente (com opção de árvore completa)
- **PATCH** `/customers/:id` - Atualizar cliente
- **DELETE** `/customers/:id` - Deletar cliente
- **PATCH** `/customers/:customerId/company` - Atualizar dados cadastrais da empresa (quando o cliente for do tipo COMPANY)

### Endereços do Cliente
Detecção automática se é pessoa ou empresa:
- **GET** `/customers/:customerId/addresses` - Listar endereços
- **POST** `/customers/:customerId/addresses` - Adicionar endereço
- **PATCH** `/customers/:customerId/addresses/:addressId` - Atualizar endereço
- **DELETE** `/customers/:customerId/addresses/:addressId` - Deletar endereço

### Pessoas Ligadas a uma Empresa
- **GET** `/customers/:customerId/people` - Listar pessoas vinculadas
- **POST** `/customers/:customerId/people` - Vincular pessoa (por personId/cpf ou criar nova)
- **DELETE** `/customers/:customerId/people/:personId` - Desvincular pessoa

### Filiais de um Cliente
- **GET** `/customers/:customerId/branches` - Listar filiais do cliente (PF ou PJ)
- **POST** `/customers/:customerId/branches` - Criar/associar filial (aceita `{ createCustomer }`, `{ existingCustomerId }` ou payload de Customer direto)
- **POST** `/customers/:customerId/branches/:childId` - Vincular filial existente (atalho sem body)
- **DELETE** `/customers/:customerId/branches/:childId` - Desvincular filial

### Coleções por Tipo (Opcional)
- **GET** `/customers/companies?q=termo` - Listar empresas (busca por nome, razão social, nome fantasia ou CNPJ)
- **GET** `/customers/companies?search=termo` - Alternativa compatível com `?search=` (mesmo comportamento)
- **GET** `/customers/people?q=termo` - Listar pessoas físicas (busca por nome ou CPF)
- **GET** `/customers/people?search=termo` - Alternativa compatível com `?search=` (mesmo comportamento)

## Estrutura de Dados

### Customer
- `id`: Identificador único
- `kind`: Tipo (PERSON ou COMPANY)
- `displayName`: Nome de exibição
- `isActive`: Status ativo/inativo
- `createdAt`: Data de criação
- `updatedAt`: Data de atualização

### CustomerPerson (Pessoa Física)
- `customerId`: Referência ao customer
- `fullName`: Nome completo
- `cpf`: CPF (apenas dígitos)
- `rg`: RG (opcional)
- `birthDate`: Data de nascimento (opcional)
- `email`: Email (opcional)
- `phone`: Telefone (opcional)

### CustomerCompany (Pessoa Jurídica)
- `customerId`: Referência ao customer
- `legalName`: Razão social
- `tradeName`: Nome fantasia (opcional)
- `cnpj`: CNPJ (apenas dígitos)
- `stateRegistration`: Inscrição estadual (opcional)
- `municipalRegistration`: Inscrição municipal (opcional)
- `email`: Email (opcional)
- `phone`: Telefone (opcional)

**Campos cadastrais adicionais (opcionais)**
- `status`: Situação cadastral (ex.: `ACTIVE`)
- `openingDate`: Data de abertura (Date) — enviar no POST como `DD/MM/YYYY`
- `legalNature`: Natureza jurídica (ex.: `206-2 - Sociedade Empresária Limitada`)
- `size`: Porte (ex.: `MICRO EMPRESA`)
- `mainActivity`: Atividade econômica principal
- `secondaryActivities`: Lista de atividades econômicas secundárias (string[])

### CustomerBranch (Filial de Cliente)
- `parentId`: `Customer.id` do cliente "pai"
- `childId`: `Customer.id` do cliente "filial"
- `since`: Data de início (opcional)
- `until`: Data de fim (opcional)
- `note`: Observação (opcional)

### Address
- `id`: Identificador único
- `addressType`: Tipo de endereço **(A|P|C|E)**  
  **A** = alternativo, **P** = pessoal, **C** = comercial, **E** = entrega
- `label`: Rótulo personalizado (opcional)
- `isPrimary`: Se é o endereço principal
- `street`: Rua
- `number`: Número (opcional)
- `complement`: Complemento (opcional)
- `district`: Bairro (opcional)
- `city`: Cidade
- `state`: Estado
- `postalCode`: CEP
- `country`: País (padrão: Brasil)
- `reference`: Referência (opcional)
- `personId`: Referência à pessoa (se aplicável)
- `companyId`: Referência à empresa (se aplicável)

### CompanyPersonLink
- `companyId`: Referência à empresa
- `personId`: Referência à pessoa
- `role`: Função/cargo (opcional)
- `isPrimary`: Se é o contato principal
- `isLegalRepresentative`: Se é representante legal
- `startedOn`: Data de início (opcional)
- `endedOn`: Data de fim (opcional)

## Validações

- CPF deve ter exatamente 11 dígitos
- CNPJ deve ter exatamente 14 dígitos
- Apenas um endereço pode ser marcado como primário por cliente
- Apenas uma pessoa pode ser marcada como principal por empresa
- Validação de email quando fornecido
- Validação de datas quando fornecidas

## Transações

Todas as operações que envolvem múltiplas tabelas são executadas em transações para garantir consistência dos dados.

## Exemplos de Uso

### Criar Pessoa Física
```json
POST /customers
{
  "kind": "PERSON",
  "displayName": "João Silva",
  "person": {
    "fullName": "João Silva",
    "cpf": "12345678901",
    "email": "joao@email.com",
    "addresses": [{
      "addressType": "P",
      "street": "Rua das Flores",
      "number": "123",
      "city": "São Paulo",
      "state": "SP",
      "postalCode": "01234567",
      "isPrimary": true
    }]
  }
}
```

### Criar Empresa
```json
POST /customers
{
  "kind": "COMPANY",
  "displayName": "SWIFT SOFT LTDA",
  "company": {
    "legalName": "SWIFT SOFT LTDA",
    "cnpj": "54.390.046/0001-93",
    "email": "contato@swiftsoft.com.br",
    "status": "ACTIVE",
    "openingDate": "19/03/2024",
    "legalNature": "206-2 - Sociedade Empresária Limitada",
    "size": "MICRO EMPRESA",
    "mainActivity": "Desenvolvimento e licenciamento de programas de computador customizáveis",
    "secondaryActivities": [
      "Desenvolvimento de programas de computador sob encomenda",
      "Desenvolvimento e licenciamento de programas de computador não-customizáveis",
      "Reparação e manutenção de computadores e de equipamentos periféricos"
    ]
  }
}
```

### Criar Filial de um Cliente

#### Opção 1: Formato padrão (com wrapper `createCustomer`)
```json
POST /customers/:customerId/branches
{
  "createCustomer": {
    "kind": "COMPANY",
    "displayName": "ACME COMERCIAL FILIAL CURITIBA LTDA",
    "company": {
      "legalName": "ACME COMERCIAL FILIAL CURITIBA LTDA",
      "tradeName": "ACME CURITIBA",
      "cnpj": "11.222.333/0002-55",
      "email": "filial@acme.com.br",
      "phone": "(41) 9999-9999",
      "addresses": [
        {
          "addressType": "C",
          "isPrimary": true,
          "street": "Av. Sete de Setembro",
          "city": "Curitiba",
          "state": "PR",
          "postalCode": "80000000"
        }
      ]
    }
  },
  "note": "Filial Sul"
}
```

#### Opção 2: Payload "curto" (Customer direto, sem wrapper)
```json
POST /customers/:customerId/branches
{
  "kind": "COMPANY",
  "displayName": "ACME COMERCIAL FILIAL CURITIBA LTDA",
  "company": {
    "legalName": "ACME COMERCIAL FILIAL CURITIBA LTDA",
    "tradeName": "ACME CURITIBA",
    "cnpj": "11.222.333/0002-55",
    "email": "filial@acme.com.br",
    "phone": "(41) 9999-9999",
    "addresses": [...]
  },
  "note": "Filial Sul"
}
```

#### Opção 3: Vincular filial existente (com body)
```json
POST /customers/:customerId/branches
{
  "existingCustomerId": "<id de um Customer já existente>",
  "note": "Matriz"
}
```

#### Opção 4: Vincular filial existente (atalho sem body)
```bash
POST /customers/:parentId/branches/:childId
# Sem body necessário - apenas vincula o childId como filial do parentId
```

### Vincular Pessoa a Empresa
```json
POST /customers/:customerId/people
{
  "cpf": "12345678901",
  "role": "Diretor",
  "isPrimary": true,
  "isLegalRepresentative": true
}
```

### Buscar Pessoas Físicas
```
GET /customers/people?q=João
GET /customers/people?q=12345678901
GET /customers/people?q=123456
```

### Buscar Empresas
```
GET /customers/companies?q=SWIFT
GET /customers/companies?q=54390046000193
GET /customers/companies?q=543900
```

### Atualizar dados de Empresa
```json
PATCH /customers/:customerId/company
{
  "phone": "(41) 9824-3692 / (0000) 0000-0001",
  "email": "contato@swiftsoft.com.br",
  "status": "ATIVA",
  "openingDate": "2024-03-20",
  "legalNature": "206-2 - Sociedade Empresária Limitada",
  "size": "MICRO EMPRESA",
  "mainActivity": "62.02-3-00 - Desenvolvimento e licenciamento de programas de computador customizáveis",
  "secondaryActivities": [
    "62.01-5-01 - Desenvolvimento de programas de computador sob encomenda"
  ]
}
```
> Observação: openingDate aceita DD/MM/YYYY ou YYYY-MM-DD.

## Notas rápidas

- A rota de atualização **PATCH /customers/:id** altera apenas `displayName` e `isActive`. Para campos da empresa use **PATCH /customers/:customerId/company**.
- **`openingDate`** também é aceita em **YYYY-MM-DD**.
- **`secondaryActivities`** é armazenado como **array** (`text[]`) no Postgres via Prisma (`String[] @db.Text[]`).
- Todos os novos campos são **opcionais**; você pode enviar apenas alguns deles.
- `cnpj` com máscara é aceito; internamente é salvo **sem** pontuação (14 dígitos).
- **Busca flexível**: `/customers/people?q=` ou `?search=` busca por nome ou CPF (completo ou parcial).
- **Busca flexível**: `/customers/companies?q=` ou `?search=` busca por nome, razão social, nome fantasia ou CNPJ (completo ou parcial).
- **Filiais de cliente**: Use `POST /customers/:customerId/branches` para criar/vincular outra entrada de `Customer` como filial daquele cliente.
- **Atalho para vincular filial**: Use `POST /customers/:parentId/branches/:childId` (sem body) para vincular uma filial existente rapidamente.
- **Payload retrocompatível**: A rota de criar filial aceita 3 formatos: wrapper `createCustomer`, `existingCustomerId` ou payload de Customer direto (sem wrapper).
