# Configuração de Variáveis de Ambiente

Para que a sincronização do banco de dados funcione corretamente, você precisa definir as seguintes variáveis de ambiente:

## Variáveis Obrigatórias

### Banco de Dados
- `DATABASE_URL`: URL de conexão com o PostgreSQL
- `SYNCHRONIZE`: Define se o TypeORM deve sincronizar automaticamente o schema (true/false)
- `MIGRATIONS_RUN`: Define se deve executar migrations automaticamente (true/false) - opcional
- `DB_SCHEMA`: Define o schema do banco (padrão: 'public') - opcional
- `TYPEORM_LOGGING`: Define se deve logar queries do TypeORM (true/false, padrão: true) - opcional

### JWT
- `ACCESS_TOKEN_SECRET`: Chave secreta para tokens de acesso
- `EMAIL_TOKEN_SECRET`: Chave secreta para tokens de email
- `ACCESS_TOKEN_TTL`: Tempo de vida do token de acesso (em segundos)
- `REFRESH_TOKEN_TTL`: Tempo de vida do token de refresh (em segundos)
- `PASSWORD_RESET_SECRET`: Chave secreta para reset de senha

### CORS
- `ALLOWED_ORIGINS`: Origens permitidas separadas por vírgula
- `TRUST_IPV4_PREFIX`: Prefixo IPv4 confiável
- `TRUST_IPV6_PREFIX`: Prefixo IPv6 confiável

### SMTP
- `SMTP_HOST`: Host do servidor SMTP
- `SMTP_PORT`: Porta do servidor SMTP
- `SMTP_SECURE`: Se deve usar SSL/TLS (true/false)
- `SMTP_USER`: Usuário do SMTP
- `SMTP_PASS`: Senha do SMTP
- `MAIL_FROM`: Email remetente

### Aplicação
- `APP_WEB_URL`: URL da aplicação web
- `SUPER_RULE`: Regra de super administrador

## Exemplo de Configuração

Crie um arquivo `.env` na raiz do projeto com:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
SYNCHRONIZE=true
MIGRATIONS_RUN=false
DB_SCHEMA=public
TYPEORM_LOGGING=true
ACCESS_TOKEN_SECRET=your_secret_here
EMAIL_TOKEN_SECRET=your_email_secret_here
ACCESS_TOKEN_TTL=3600
REFRESH_TOKEN_TTL=86400
PASSWORD_RESET_SECRET=your_reset_secret_here
ALLOWED_ORIGINS=http://localhost:3000
TRUST_IPV4_PREFIX=127.0.0.1/8
TRUST_IPV6_PREFIX=::1/128
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
MAIL_FROM=noreply@yourapp.com
APP_WEB_URL=http://localhost:3000
SUPER_RULE=super_admin
PORT=3000
NODE_ENV=development
```

## Problema Resolvido

O problema estava na configuração do TypeORM no arquivo `src/_common/typeorm/typeorm.config.ts`. 
A configuração anterior tinha vários problemas:

1. **Synchronize hardcoded**: Estava definido como `false`, ignorando a variável de ambiente
2. **Falta de autoLoadEntities**: Não carregava entidades registradas via `forFeature()`
3. **Schema não definido**: Não especificava o schema explicitamente
4. **URL parsing inadequado**: Não extraía componentes da URL corretamente

### Nova Configuração Robusta

A nova configuração resolve todos esses problemas:

```typescript
return {
  type: 'postgres',
  host: url.hostname,
  port: Number(url.port || 5432),
  username: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ''),
  schema,                      // <- define explicitamente o schema
  synchronize,                 // <- lido do .env como boolean
  migrationsRun,               // opcional, se usar migrations
  autoLoadEntities: true,      // <- carrega entidades registradas via forFeature(...)
  entities: [join(__dirname, '..', '..', '**/*.entity.{js,ts}')], // fallback
  logging: cfg.get<string>('TYPEORM_LOGGING') !== 'false',
} as any;
```

### Benefícios da Nova Configuração

✅ **Synchronize funcional**: Respeita a variável `SYNCHRONIZE=true`  
✅ **AutoLoadEntities**: Carrega automaticamente entidades de todos os módulos  
✅ **Schema explícito**: Define o schema corretamente (resolve problemas com Prisma URLs)  
✅ **URL parsing robusto**: Extrai componentes da URL corretamente  
✅ **Fallback de entidades**: Carrega entidades mesmo se não estiverem em módulos  
✅ **Logging configurável**: Permite controlar logs do TypeORM  
✅ **Suporte a migrations**: Opção de executar migrations automaticamente  

Agora o TypeORM criará as tabelas automaticamente quando `SYNCHRONIZE=true` estiver definido!

## Script de Seed

O projeto inclui um script de seed (`scripts/seed.ts`) que popula o banco com dados iniciais:

### Dados Criados pelo Seed

- **Rules**: Todas as regras básicas do sistema (users.read, roles.manage, etc.)
- **Company**: Empresa padrão configurável via variáveis de ambiente
- **Super Role**: Role "Super Administrador" com todas as permissões
- **Super User**: Usuário administrador padrão
- **Department**: Departamento "Geral" padrão

### Variáveis de Ambiente para Seed

```env
# Configurações da empresa
SEED_COMPANY_NAME=Empresa Padrão
SEED_COMPANY_TRADENAME=Empresa Padrão
SEED_COMPANY_EMAIL=contato@empresa.local

# Configurações do super usuário
SEED_SUPER_USER_NAME=Super Usuário
SEED_SUPER_USER_EMAIL=admin@empresa.local
SEED_SUPER_USER_PASSWORD=admin123

# Regra super (usada pelo sistema)
SUPER_RULE=administrator
```

### Executar o Seed

```bash
# Executar seed completo
npm run seed

# Ou usar o alias
npm run seed:full
```

### Características do Script

✅ **Idempotente**: Pode ser executado múltiplas vezes sem problemas  
✅ **Upsert**: Atualiza dados existentes ou cria novos  
✅ **Soft Delete**: Restaura registros deletados se necessário  
✅ **TypeORM**: Usa TypeORM em vez de Prisma para compatibilidade  
✅ **UUIDs**: Gera IDs válidos para PostgreSQL  
✅ **Logging**: Mostra progresso detalhado da execução  

O script é seguro para executar em qualquer ambiente e não causará problemas com dados existentes.
