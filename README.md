<p align="center"> <a href="#" target="_blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a> </p> <p align="center"> <a href="https://www.npmjs.com/package/your-package" target="_blank"><img src="https://img.shields.io/npm/v/your-package.svg" alt="NPM Version" /></a> <a href="https://github.com/your-org/your-repo/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/your-package.svg" alt="License" /></a> <a href="https://www.npmjs.com/package/your-package" target="_blank"><img src="https://img.shields.io/npm/dm/your-package.svg" alt="Downloads" /></a> <a href="https://circleci.com/gh/your-org/your-repo" target="_blank"><img src="https://img.shields.io/circleci/build/github/your-org/your-repo/master" alt="CircleCI" /></a> <a href="https://coveralls.io/github/your-org/your-repo?branch=main" target="_blank"><img src="https://coveralls.io/repos/github/your-org/your-repo/badge.svg?branch=main" alt="Coverage" /></a>

  Um template de aplicação backend em NestJS integrando Prisma, Zod e i18n para validação robusta, internacionalização e arquitetura limpa.

 ## 🚀 Configuração do projeto

 ```bash
 # Instalar dependências
 $ npm install

 # Criar arquivo .env
 $ cp .env.example .env
 # Edite DATABASE_URL, PORT etc. em .env
 ```

 ## 🛠️ Como executar

 ```bash
 # desenvolvimento
 $ npm run start:dev

 # produção
 $ npm run build
 $ npm run start:prod
 ```

 ## ✅ Testes

 ```bash
 # testes unitários
 $ npm run test

 # testes e2e
 $ npm run test:e2e

 # relatório de cobertura
 $ npm run test:cov
 ```

 ## 📦 Deploy

 Consulte as [docs de Deploy do NestJS](https://docs.nestjs.com/deployment) para práticas recomendadas.

 ---

 ## 📚 Guia de Boas Práticas e Manutenção

 Siga estes passos ao manter ou adicionar novas funcionalidades ao módulo **Users** (use o mesmo padrão em outros módulos):

 1. **Schemas Zod & DTOs**
    - Defina estruturas de dados e regras de validação em `users.schema.ts` usando Zod com chaves de i18n (`{ message: 'validation.required' }`).
    - Aplique `preprocess`/`transform` para normalizar campos (`'' → null`, strings de data → `Date`, etc.).
    - Exporte a classe DTO com schema estático e o tipo inferido:
      ```ts
      export class CreateUserDto { static schema = createUserSchema }
      export type CreateUserInput = z.infer<typeof createUserSchema
      ```
 2. **Pipe de Validação Global**
    - Em `main.ts`, existe `ZodValidationPipe`, injetando `I18nService`:
      ```ts
      const i18n = app.get(I18nService);
      app.useGlobalPipes(new ZodValidationPipe(i18n));
      ```
    - O pipe parseia automaticamente qualquer DTO com `static schema` e lança `BadRequestException` traduzido.

 3. **Internacionalização via cabeçalho**
 
    - Configurado `I18nModule` com `AcceptLanguageResolver` (e opcionais Query/Custom-Header).
    - O cliente define o idioma no header `Accept-Language` (ou via `?lang=xx`).
    - **Não** leia manualmente cabeçalhos nos controllers — o `I18nService` já determina o locale.
 1. **Camada de Serviço Limpa**
    - Injetar `PrismaService` e `I18nService` nos serviços.
    - Realizar toda a lógica de negócio ali:
      - Hash de senha antes de `create`/`update`.
      - Definir `publicSelect` para omitir campos sensíveis.
    - Retornar resposta uniforme:
      ```ts
      const user = await this.prisma.user.create({...});
      const message = await this.i18n.translate('users.created');
      return { message, data: user };
      ```
 2. **Filtro Único para Erros do Prisma**
    - Em `main.ts`, registre apenas `PrismaExceptionFilter`:
      ```ts
      app.useGlobalFilters(new PrismaExceptionFilter(i18n));
      ```
    - Tratar códigos conhecidos do Prisma:
      - `P2025` → 404 `common.not_found`
      - `P2002` → 409 `common.already_exists`
      - Default → 500 `common.database_error`
 3. **Controllers Enxutos**
    - Controllers apenas roteiam para o serviço:
      ```ts
      @Post() create(@Body() dto: CreateUserDto) { return svc.create(dto) }
      ```
    - **Nada** de validação ou tratamento de erros nos controllers — pipes e filters cobrem isso.
 4. **Chaves de Tradução Consistentes**
    - Mantenha seus JSONs de locale em `src/i18n/{pt-BR,en,es}/`:
      - `common.json`: `not_found`, `already_exists`, `database_error`, `validation_failed`
      - `users.json`: `created`, `listed`, `found`, `updated`, `deleted`
 5. **Formato Uniforme de Resposta**
    - **Sempre** responder com:
      ```jsonc
      {
        "message": "Mensagem traduzida",
        "data": {/* objeto ou array resultante */}
      }
      ```
    - Isso simplifica a integração com clientes.
 ---

 **Mantenha este guia à mão** sempre que trabalhar em qualquer módulo. Seguir essas práticas garante um código manutenível, escalável e internacionalizado.

# API OTJ

## Funcionalidades

### Acesso aos Próprios Dados Sensíveis

O sistema agora permite que usuários acessem seus próprios dados sensíveis através do endpoint `/users/me/profile`. Esta funcionalidade é controlada pela regra `users.read.pii`.

#### Como funciona:

1. **Regra de Autorização**: A regra `users.read.pii` permite que o usuário acesse dados sensíveis
2. **Endpoint**: `GET /users/me/profile` - Retorna os dados do usuário logado incluindo campos sensíveis

#### Exemplo de uso:

```bash
# Fazer login para obter o token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'

# Acessar próprios dados (incluindo campos sensíveis)
curl -X GET http://localhost:3000/users/me/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Resposta esperada:

```json
{
  "message": "Usuário encontrado",
  "data": {
    "id": "user-id",
    "name": "Nome do Usuário",
    "email": "user@example.com",
    "phone": "(11) 99999-9999",
    "cpf": "12345678901",        // Campo sensível - só retorna se for o próprio usuário
    "birthdate": "1990-01-01",   // Campo sensível - só retorna se for o próprio usuário
    "emailVerifiedAt": "2024-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "role": {
      "id": "role-id",
      "name": "Administrador",
      "description": "Acesso administrativo",
      "companyId": "company-id"
    },
    "departments": [
      {
        "id": "dept-id",
        "name": "Administração",
        "description": "Departamento administrativo"
      }
    ]
  }
}
```

#### Configuração:

Para que um usuário possa acessar seus próprios dados sensíveis, ele deve ter a regra `users.own` atribuída ao seu role. Esta regra é automaticamente incluída nos roles de Administrador e Gestor durante o seed.

**Nota sobre a SUPER_RULE**: Usuários com a regra `administrator` (SUPER_RULE) têm acesso total a todos os dados sensíveis de qualquer usuário, sem restrições. Esta regra bypassa todas as verificações de campos sensíveis.

#### Campos Sensíveis:

Os seguintes campos são considerados sensíveis e só são retornados se o usuário tiver a regra `users.own` ou `administrator`:
- `cpf` - CPF do usuário
- `birthdate` - Data de nascimento

#### Hierarquia de Acesso:

1. **SUPER_RULE (administrator)**: Acesso total a todos os dados sensíveis de qualquer usuário
2. **users.read.pii**: Acesso a dados sensíveis de usuários (se configurado)
3. **Sem regras específicas**: Apenas dados públicos

### Gerenciamento de Campos Sensíveis

O sistema permite gerenciar campos sensíveis através do endpoint `/privacy/sensitive-fields`.

#### Endpoint de Listagem com Filtros:

```bash
# Listar campos sensíveis com paginação
GET /privacy/sensitive-fields?page=1&limit=10

# Filtrar por entidade
GET /privacy/sensitive-fields?entity=User

# Filtrar por empresa
GET /privacy/sensitive-fields?companyId=company-uuid

# Filtrar por status ativo
GET /privacy/sensitive-fields?active=true

# Pesquisar por texto (moduleName, label, entity, field)
GET /privacy/sensitive-fields?search=Usu
```

#### Parâmetros de Filtro:

- `page`: Número da página (padrão: 1)
- `limit`: Itens por página (padrão: 10)
- `entity`: Filtrar por entidade específica
- `companyId`: Filtrar por empresa específica
- `active`: Filtrar por status ativo/inativo
- `search`: Pesquisar por texto em:
  - `moduleName` - Nome do módulo
  - `label` - Rótulo do campo
  - `entity` - Nome da entidade
  - `field` - Nome do campo

#### Exemplo de Resposta:

```json
{
  "data": [
    {
      "id": "field-uuid",
      "entity": "User",
      "field": "cpf",
      "moduleName": "users",
      "label": "CPF",
      "description": "CPF do usuário",
      "readRule": "users.read.pii",
      "writeRule": "users.write.pii",
      "active": true,
      "companyId": null,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
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

#### Permissões Necessárias:

- **Visualizar**: `privacy.read`
- **Gerenciar**: `privacy.manage`