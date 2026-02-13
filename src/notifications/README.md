# Módulo de Notificações

Módulo genérico para gerenciamento de notificações no sistema. Permite criar notificações para usuários específicos, associadas a entidades e registros do sistema.

## Características

- ✅ Genérico e reutilizável em qualquer módulo do sistema
- ✅ Suporte a associação com entidades e registros específicos
- ✅ Paginação e filtros avançados
- ✅ Marcação de notificações como lidas/não lidas
- ✅ Contagem de notificações não lidas
- ✅ Soft delete
- ✅ **Notificações em tempo real via WebSocket**
- ✅ **Suporte a múltiplas instâncias via Redis Pub/Sub**
- ✅ Internacionalização (i18n) em pt-BR, en e es

## Estrutura

```
src/notifications/
├── notification.entity.ts      # Entidade TypeORM
├── notifications.schema.ts     # Schemas de validação Zod
├── notifications.service.ts    # Lógica de negócio
├── notifications.controller.ts # Endpoints HTTP
├── notifications.module.ts     # Módulo NestJS
└── README.md                   # Esta documentação
```

## Como Usar em Outros Módulos

### 1. Importar o NotificationsModule

No módulo onde você deseja usar notificações, importe o `NotificationsModule`:

```typescript
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    // ... outros imports
    NotificationsModule,
  ],
  // ...
})
export class SeuModulo {}
```

### 2. Injetar o NotificationsService

No seu service, injete o `NotificationsService`:

```typescript
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SeuService {
  constructor(
    // ... outros serviços
    private notificationsService: NotificationsService,
  ) {}

  async algumMetodo() {
    // ... sua lógica
    
    // Criar notificação
    await this.notificationsService.create({
      userId: 'id-do-usuario',
      title: 'Nova transação financeira',
      message: 'Uma nova transação foi registrada no sistema',
      entity: 'finance',
      registerId: '5550d260-36c1-4a6e-a290-6dbd501e594b',
    });
  }
}
```

## Exemplos de Uso

### Exemplo 1: Notificação sobre Financeiro

```typescript
// No módulo de financeiro
async criarTransacao(dados: CreateTransactionDto) {
  const transacao = await this.transactionsRepo.save(dados);
  
  // Notificar o usuário responsável
  await this.notificationsService.create({
    userId: transacao.userId,
    title: 'Nova transação criada',
    message: `Uma nova transação no valor de R$ ${transacao.amount} foi criada`,
    entity: 'finance',
    registerId: transacao.id,
  });
  
  return transacao;
}
```

### Exemplo 2: Notificar Todos os Usuários de um Departamento

```typescript
async notificarDepartamento(departmentId: string, titulo: string, mensagem: string) {
  const usuarios = await this.usersRepo.find({
    where: { departmentId },
  });
  
  const userIds = usuarios.map(u => u.id);
  
  await this.notificationsService.createMany(
    userIds,
    titulo,
    mensagem,
    'department',
    departmentId,
  );
}
```

## Endpoints da API

### Criar Notificação
```
POST /notifications
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": "uuid-do-usuario",
  "title": "Título da notificação",
  "message": "Mensagem da notificação",
  "entity": "finance", // opcional
  "registerId": "uuid-do-registro" // opcional
}
```

### Listar Notificações do Usuário
```
GET /notifications?page=1&limit=10&read=false&entity=finance
Authorization: Bearer <token>
```

Parâmetros de query:
- `page`: Número da página (padrão: 1)
- `limit`: Itens por página (padrão: 10, máximo: 100)
- `search`: Busca por título ou mensagem
- `read`: Filtrar por lidas (true/false)
- `entity`: Filtrar por entidade
- `sortBy`: Campo para ordenação (createdAt, readAt, title)
- `sortOrder`: Ordem (asc, desc)

### Buscar Notificação Específica
```
GET /notifications/:id
Authorization: Bearer <token>
```

### Marcar como Lida
```
PATCH /notifications/:id/read
Authorization: Bearer <token>
Content-Type: application/json

{
  "read": true
}
```

### Marcar Todas como Lidas
```
POST /notifications/mark-all-read
Authorization: Bearer <token>
```

### Contar Não Lidas
```
GET /notifications/unread/count?entity=finance
Authorization: Bearer <token>
```

### Remover Notificação
```
DELETE /notifications/:id
Authorization: Bearer <token>
```

## Métodos do Service Disponíveis

### `create(data: CreateNotificationInput)`
Cria uma única notificação.

### `createMany(userIds, title, message, entity?, registerId?)`
Cria múltiplas notificações para vários usuários de uma vez.

### `findAll(userId, query: NotificationPaginationInput)`
Lista notificações de um usuário com paginação e filtros.

### `findOne(id, userId)`
Busca uma notificação específica.

### `markAsRead(id, userId, read?)`
Marca uma notificação como lida ou não lida.

### `markAllAsRead(userId)`
Marca todas as notificações de um usuário como lidas.

### `countUnread(userId, entity?)`
Conta notificações não lidas de um usuário.

### `findByEntityAndRegister(entity, registerId, userId?)`
Busca todas as notificações relacionadas a uma entidade e registro específicos.

### `remove(id, userId)`
Remove uma notificação (soft delete).

## Permissões Necessárias

Para usar os endpoints, o usuário precisa ter as seguintes permissões:

- `notifications.create` - Criar notificações
- `notifications.read` - Ler notificações
- `notifications.update` - Atualizar notificações (marcar como lida)
- `notifications.delete` - Remover notificações

## Estrutura da Entidade

```typescript
{
  id: string;              // UUID
  userId: string;          // UUID do usuário destinatário
  title: string;           // Título da notificação
  message: string;         // Mensagem da notificação
  entity: string | null;   // Nome da entidade (ex: "finance", "legal")
  registerId: string | null; // ID do registro na entidade
  read: boolean;           // Se foi lida
  readAt: Date | null;     // Data de leitura
  createdAt: Date;         // Data de criação
  updatedAt: Date;         // Data de atualização
  deletedAt: Date | null;  // Data de remoção (soft delete)
}
```

## Eventos WebSocket

O módulo de notificações emite eventos em tempo real via WebSocket quando ações são realizadas. Isso permite que o frontend atualize automaticamente a interface do usuário sem necessidade de polling.

### `notification:new`
Emitido quando uma nova notificação é criada.

```json
{
  "event": "notification:new",
  "data": {
    "id": "uuid",
    "title": "Título da notificação",
    "message": "Mensagem da notificação",
    "entity": "finance",
    "registerId": "uuid-do-registro",
    "read": false,
    "createdAt": "2025-12-30T16:00:00.000Z"
  }
}
```

### `notification:updated`
Emitido quando uma notificação é atualizada (marcada como lida/não lida).

```json
{
  "event": "notification:updated",
  "data": {
    "id": "uuid",
    "read": true,
    "readAt": "2025-12-30T16:00:00.000Z"
  }
}
```

### `notification:all_read`
Emitido quando todas as notificações são marcadas como lidas.

```json
{
  "event": "notification:all_read",
  "data": {
    "affected": 5
  }
}
```

### `notification:deleted`
Emitido quando uma notificação é removida.

```json
{
  "event": "notification:deleted",
  "data": {
    "id": "uuid"
  }
}
```

### `notification:unread_count`
Emitido sempre que o contador de notificações não lidas é atualizado.

```json
{
  "event": "notification:unread_count",
  "data": {
    "count": 3
  }
}
```

### Exemplo de Uso no Frontend

```javascript
// Conectar ao WebSocket
const ws = new WebSocket('ws://localhost:3000/ws?token=SEU_TOKEN');

ws.onmessage = (event) => {
  const { event: eventType, data } = JSON.parse(event.data);
  
  switch (eventType) {
    case 'notification:new':
      // Adicionar notificação à lista
      addNotificationToList(data);
      // Atualizar badge de notificações
      updateNotificationBadge();
      break;
      
    case 'notification:unread_count':
      // Atualizar contador de não lidas
      updateUnreadCount(data.count);
      break;
      
    case 'notification:updated':
      // Atualizar notificação na lista
      updateNotificationInList(data);
      break;
      
    case 'notification:deleted':
      // Remover notificação da lista
      removeNotificationFromList(data.id);
      break;
  }
};
```

## Suporte a Múltiplas Instâncias

O sistema de notificações em tempo real suporta múltiplas instâncias do servidor através do Redis Pub/Sub. Quando uma notificação é criada em uma instância, ela é automaticamente propagada para todas as outras instâncias, garantindo que os usuários recebam notificações independentemente de qual servidor processou a requisição.

### Configuração

As seguintes variáveis de ambiente controlam o comportamento do Redis:

- `REALTIME_REDIS_ENABLED`: Habilita/desabilita Redis Pub/Sub (padrão: `true`)
- `REALTIME_REDIS_CHANNEL_PREFIX`: Prefixo dos canais Redis (padrão: `realtime:user:`)
- `REDIS_HOST`: Host do Redis (padrão: `127.0.0.1`)
- `REDIS_PORT`: Porta do Redis (padrão: `6379`)
- `REDIS_PASSWORD`: Senha do Redis (opcional)
- `REDIS_DB`: Número do banco de dados Redis (padrão: `0`)

