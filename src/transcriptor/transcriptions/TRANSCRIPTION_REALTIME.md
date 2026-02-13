# Transcrições - Realtime via WebSocket

Notificações em tempo real quando transcrições terminam (sucesso ou erro), permitindo que o usuário saiba imediatamente sem precisar fazer polling.

## 🎯 Cenário de Uso

- **Múltiplas transcrições na fila**: O usuário pode enviar várias transcrições ao mesmo tempo
- **Entrada/saída da aplicação**: Ao retornar, o usuário vê o `status` no registro (flag persistida)
- **Realtime**: WebSocket avisa quando cada transcrição termina, sem precisar recarregar a lista

## 📡 Evento WebSocket

### Nome do Evento

```
transcription:status
```

### Payload

```json
{
  "event": "transcription:status",
  "data": {
    "id": "uuid-da-transcricao",
    "status": "done",
    "title": "reuniao_planejamento",
    "errorMessage": null,
    "at": "2026-02-07T15:30:00.000Z"
  }
}
```

**Campos:**

| Campo        | Tipo     | Descrição                                              |
|-------------|----------|--------------------------------------------------------|
| `id`        | `string` | UUID da transcrição                                   |
| `status`    | `'done' \| 'error'` | Status final                         |
| `title`    | `string \| null`    | Título/base do arquivo                   |
| `errorMessage` | `string \| null` | Mensagem de erro (apenas quando `status === 'error'`) |
| `at`       | `string` | ISO 8601 - timestamp do evento                         |

## 🔌 Conexão WebSocket

**Path:** `/ws`

**Autenticação** (uma das opções):

- Query: `?token=JWT`
- Header: `Authorization: Bearer JWT`
- Cookie: `access_token=JWT`
- Subprotocol: `bearer, JWT` ou apenas o token

**Exemplo (browser):**

```javascript
const token = 'seu-jwt-token';
const ws = new WebSocket(
  `wss://api.exemplo.com/ws?token=${token}`
  // ou
  // `wss://api.exemplo.com/ws`,
  // ['bearer', token]
);

ws.onmessage = (event) => {
  const frame = JSON.parse(event.data);
  if (frame.event === 'transcription:status') {
    const { id, status, title, errorMessage } = frame.data;
    if (status === 'done') {
      console.log(`Transcrição pronta: ${title} (${id})`);
      // Atualizar UI, mostrar toast, redirecionar, etc.
    } else if (status === 'error') {
      console.error(`Transcrição falhou: ${title} - ${errorMessage}`);
    }
  }
};
```

## 🗄️ Flag no Registro (Status Persistente)

A transcrição já possui o campo `status` no banco:

| Status       | Significado                                   |
|-------------|-----------------------------------------------|
| `processing`| Em processamento                              |
| `done`      | Concluída com sucesso                         |
| `error`     | Falhou (ver `errorMessage`)                   |

**Quando o usuário entrar/sair da aplicação:**

1. **GET /transcriptions** – Lista retorna `status` para cada transcrição
2. **GET /transcriptions/:id** – Detalhe retorna `status` completo
3. O frontend pode filtrar/exibir indicadores: "Processando...", "Pronto", "Erro"

Não é necessário polling: ao retornar à aplicação, basta carregar a lista e checar o `status`.

## 📍 Onde o Evento é Emitido

1. **Arquivo único (≤ 25 MB)** – Após transcrição concluída
2. **Chunks (> 25 MB)** – Após todos os chunks processados
3. **Erro no background** – No `.catch()` do processamento

## 🔄 Fluxo Completo

```
1. Usuário faz POST /transcriptions (upload)
   → Resposta imediata com id, status: 'processing'

2. Processamento em background
   → Status permanece 'processing'

3a. Sucesso
   → UPDATE status = 'done'
   → emitToUser(userId, 'transcription:status', { id, status: 'done', ... })
   → Auto-gera ice breakers

3b. Erro
   → UPDATE status = 'error', errorMessage = '...'
   → emitToUser(userId, 'transcription:status', { id, status: 'error', ... })

4. Frontend (conectado ao WS) recebe o evento
   → Mostra toast: "Transcrição X está pronta!"
   → Atualiza lista ou redireciona
```

## 📋 Checklist Frontend

- [ ] Conectar ao WebSocket `/ws` com JWT ao carregar a app
- [ ] Escutar evento `transcription:status`
- [ ] Para `status === 'done'`: toast/notificação + atualizar estado
- [ ] Para `status === 'error'`: toast de erro
- [ ] Ao entrar na app: carregar `GET /transcriptions` e exibir `status` de cada item
- [ ] Opcional: polling leve como fallback se WS desconectar
