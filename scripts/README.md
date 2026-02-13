# Script de Seed Completo

Este script garante que toda a estrutura necessária para o sistema funcionar esteja criada:

- ✅ **Regras** (incluindo SUPER_RULE)
- ✅ **Empresa** 
- ✅ **Departamentos**
- ✅ **Roles** (Administrador e Gestor)
- ✅ **Vínculos Role-Rule**
- ✅ **Vínculos Role-Department**
- ✅ **Usuário Admin** (com e-mail verificado)

## 🚀 Como Usar

### Execução Rápida
```bash
npm run seed
# ou
npm run seed:full
```

### Execução Direta
```bash
ts-node scripts/seed.ts
```

### Via Prisma
```bash
npx prisma db seed
```

## ⚙️ Variáveis de Ambiente (Opcionais)

Todas as variáveis são opcionais e têm defaults seguros:

### Empresa
```env
SEED_COMPANY_NAME=Minha Empresa
SEED_COMPANY_TRADENAME=Minha Empresa LTDA
SEED_COMPANY_EMAIL=contato@minhaempresa.com
```

### Departamentos
```env
SEED_DEPARTMENTS=Administração,Operações,TI,Recursos Humanos
```

### Roles
```env
SEED_ADMIN_ROLE_NAME=Administrador
SEED_MANAGER_ROLE_NAME=Gestor
```

### Usuário Admin
```env
SEED_USER_EMAIL=admin@empresa.com
SEED_USER_PASSWORD=Senha@123456!
SEED_USER_NAME=Administrador
SEED_USER_PHONE=(11) 99999-8888
SEED_USER_BIRTHDATE=1990-01-01
```

### Comportamento
```env
SEED_OVERWRITE=true  # Força atualização de dados existentes
SUPER_RULE=administrator  # Deve bater com a regra "super"
```

## 🔄 Comportamento Idempotente

O script é **idempotente** - pode ser executado múltiplas vezes sem problemas:

- ✅ **Cria** se não existir
- ✅ **Reativa** se estiver soft-deleted
- ✅ **Atualiza** se `SEED_OVERWRITE=true`
- ✅ **Preserva** dados existentes por padrão

## 🎯 Estrutura Criada

### Regras
- `administrator` (SUPER_RULE) - Bypass total
- `users.*` - Gerenciamento de usuários
- `roles.*` - Gerenciamento de roles
- `departments.*` - Gerenciamento de departamentos
- `company.*` - Gerenciamento da empresa

### Roles
- **Administrador**: Acesso total (SUPER_RULE)
- **Gestor**: Acesso limitado (users.read/create/update, roles.read, etc.)

### Departamentos
- **Administração** (padrão)
- **Operações** (padrão)
- + outros definidos em `SEED_DEPARTMENTS`

### Usuário Admin
- **E-mail**: `codehs07@gmail.com` (padrão)
- **Senha**: `Admin@123456!` (padrão)
- **E-mail verificado**: ✅ (pronto para login)
- **Role**: Administrador
- **Company**: Vinculado à empresa criada

## 🔗 Vínculos Automáticos

- Todos os **roles** são vinculados a todos os **departamentos**
- **Usuário admin** é vinculado ao **role Administrador**
- **Role Administrador** recebe a **SUPER_RULE**

## 🎉 Resultado

Após executar o seed, você pode:

1. **Fazer login** via `/auth/login` com as credenciais do usuário admin
2. **Usar todas as funcionalidades** do sistema
3. **Gerenciar usuários, roles e departamentos** via API

## 🔧 Personalização

Para granularidade diferente nos vínculos, edite:

- **Role-Rule**: Arrays `adminRuleSet` e `managerRuleSet` na função `ensureRoles()`
- **Role-Department**: Lógica na função `linkRoleToDepartments()`

Exemplo: Vincular apenas o role "Administrador" ao depto "Administração":
```typescript
// Em linkRoleToDepartments()
if (d.name === 'Administração' && roleId === adminRoleId) {
  // vincular
}
```
