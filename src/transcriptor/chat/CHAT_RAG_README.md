# Chat com RAG (Retrieval Augmented Generation)

Sistema de chat inteligente que permite conversar sobre transcrições usando IA com contexto completo.
Agora com **busca vetorial (embeddings + pgvector)** para recuperar os segmentos mais relevantes.

## 🎯 Funcionalidades Implementadas

### ✅ RAG (Retrieval Augmented Generation)
- **Contexto da Transcrição**: Inclui segmentos relevantes da transcrição no prompt
- **Histórico do Chat**: Mantém contexto das mensagens anteriores (últimas 20)
- **Citações Automáticas**: Extrai timestamps mencionados e cria citações
- **Modelo**: `gpt-4o-mini` (rápido e econômico)
- **Busca Vetorial**: usa `pgvector` para selecionar os segmentos mais similares à pergunta

### ✅ Gestão de Threads
- Cada transcrição pode ter múltiplas conversas (threads)
- Thread criado automaticamente na primeira mensagem
- Soft delete de threads (mantém histórico)

### ✅ Tracking de Uso
- Registra automaticamente uso de IA via `AiUsageService`
- Rastreia: tokens, custo, modelo, usuário
- CallName: `transcription.chat`

## 🔌 Endpoints

### 1. **Listar Threads**
```http
GET /transcriptions/:transcriptionId/chat/threads
```

**Resposta:**
```json
{
  "data": [
    {
      "id": "uuid",
      "transcriptionId": "uuid",
      "title": null,
      "createdAt": "2026-02-07T..."
    }
  ]
}
```

### 2. **Listar Mensagens de um Thread**
```http
GET /transcriptions/:transcriptionId/chat/threads/:threadId/messages
```

**Resposta:**
```json
{
  "data": [
    {
      "id": "uuid",
      "role": "user",
      "message": "Qual foi o principal tema discutido?",
      "citations": null,
      "createdAt": "2026-02-07T..."
    },
    {
      "id": "uuid",
      "role": "assistant",
      "message": "O principal tema foi... [00:05:23]",
      "citations": [
        {
          "segmentId": "123",
          "startTime": "00:05:23",
          "endTime": "00:05:45",
          "snippet": "Trecho do texto mencionado..."
        }
      ],
      "createdAt": "2026-02-07T..."
    }
  ]
}
```

### 3. **Enviar Mensagem (Chat)**
```http
POST /transcriptions/:transcriptionId/chat/messages
Content-Type: application/json

{
  "message": "Qual foi o principal tema discutido?",
  "threadId": "uuid-opcional"
}
```

**Resposta:**
```json
{
  "threadId": "uuid",
  "assistant": {
    "message": "O principal tema foi...",
    "citations": [
      {
        "segmentId": "123",
        "startTime": "00:05:23",
        "endTime": "00:05:45",
        "snippet": "Trecho..."
      }
    ]
  }
}
```

**Observações:**
- Se `threadId` não for fornecido, cria um novo thread automaticamente
- Se fornecido, continua a conversa no thread existente
- A resposta inclui o `threadId` para futuras mensagens

### 4. **Deletar Thread**
```http
DELETE /transcriptions/:transcriptionId/chat/threads/:threadId
```

**Resposta:**
```json
{
  "ok": true,
  "message": "Thread deletado com sucesso"
}
```

**Características:**
- ✅ Soft delete (mantém dados para auditoria)
- ✅ Remove thread e torna mensagens inacessíveis
- ✅ Valida propriedade (somente dono da transcrição)

## 🧠 Como Funciona o RAG

### 1. Preparação do Contexto

```typescript
// 1. Busca segmentos relevantes da transcrição (até 50)
const relevantSegments = getRelevantSegments(transcription, userMessage, 50);

// 2. Busca histórico de mensagens anteriores (últimas 20)
const historyMessages = await findPreviousMessages(threadId, 20);

// 3. Monta contexto formatado
const context = {
  transcrição: "título, duração, segmentos...",
  histórico: "conversas anteriores...",
  pergunta: "pergunta atual do usuário"
};
```

### 2. Prompt Estruturado

```
Você é um assistente especializado em analisar transcrições de áudio/vídeo.

# TRANSCRIÇÃO
Título: Reunião de Planejamento
Duração: 1800s

## Trechos:
[00:00:15 - 00:00:23] João: Bom dia a todos...
[00:00:25 - 00:00:45] Maria: Vamos começar...
...

# HISTÓRICO DA CONVERSA
Usuário: Quem participou da reunião?
Assistente: Participaram João e Maria...

# INSTRUÇÕES
- Responda APENAS com base na transcrição fornecida
- Cite timestamps específicos [HH:MM:SS]
- Seja direto e objetivo

# PERGUNTA DO USUÁRIO
Qual foi o principal tema discutido?
```

### 3. Geração da Resposta

```typescript
const response = await aiOrchestrator.generateStrictText(prompt, 'gpt-4o-mini', {
  maxTokens: 1000,
  temperature: 0.7,
  userId,
  callName: 'transcription.chat',
});
```

### 4. Extração de Citações

```typescript
// Busca timestamps [HH:MM:SS] na resposta
const timestampRegex = /\[(\d{1,2}:\d{2}:\d{2})\]/g;
const matches = response.matchAll(timestampRegex);

// Cria citações com os segmentos correspondentes
for (const match of matches) {
  const segment = findSegmentByTimestamp(match[1]);
  citations.push({
    segmentId: segment.id,
    startTime: segment.startTime,
    endTime: segment.endTime,
    snippet: segment.text.slice(0, 200)
  });
}
```

## 📊 Monitoramento de Uso

Toda interação é registrada automaticamente:

```typescript
await aiUsage.record({
  kind: 'chat.completions.text',
  model: 'gpt-4o-mini',
  userId,
  callName: 'transcription.chat',
  promptTokens: 1234,
  completionTokens: 567,
  cachedTokens: 100,
  totalTokens: 1801,
});
```

Consulte uso via:
```http
GET /ai-usage?callName=transcription.chat
GET /ai-usage?userId=uuid&callName=transcription.chat
```

## 🔄 Fluxo Completo de Uma Conversa

```
1. Usuário envia primeira mensagem
   POST /transcriptions/:id/chat/messages
   { "message": "Sobre o que é esta transcrição?" }
   
2. Sistema:
   - Cria novo thread automaticamente
   - Busca segmentos da transcrição
   - Monta prompt com contexto
   - Envia para LLM (gpt-4o-mini)
   - Extrai citações da resposta
   - Salva mensagens (user + assistant)
   - Registra uso de IA
   
3. Usuário continua conversa
   POST /transcriptions/:id/chat/messages
   { "message": "Me fale mais sobre isso", "threadId": "uuid" }
   
4. Sistema:
   - Busca thread existente
   - Carrega histórico (últimas 20 mensagens)
   - Inclui histórico no prompt
   - Mantém contexto da conversa
   - Gera resposta considerando histórico
```

## 🚀 Melhorias Futuras

### Busca Semântica
Atualmente retorna os primeiros N segmentos. Melhorias possíveis:

```typescript
// TODO: Implementar busca vetorial
private async getRelevantSegments(
  transcription: Transcriptor,
  userMessage: string,
  limit = 50,
) {
  // 1. Gerar embedding da pergunta
  const questionEmbedding = await generateEmbedding(userMessage);
  
  // 2. Buscar segmentos mais similares (cosine similarity)
  const segments = await vectorSearch(questionEmbedding, limit);
  
  return segments;
}
```

### Título Automático do Thread
```typescript
// TODO: Gerar título baseado na primeira mensagem
async generateThreadTitle(firstMessage: string): Promise<string> {
  return aiOrchestrator.generateStrictText(
    `Gere um título curto (máx 50 chars) para uma conversa que começa com: "${firstMessage}"`,
    'gpt-4o-mini'
  );
}
```

### Cache de Embeddings
- Pré-calcular embeddings dos segmentos
- Armazenar em banco vetorial (pgvector, Pinecone, etc)
- Busca muito mais rápida

### Variáveis de ambiente (novas)

```bash
# modelo de embedding (1536 dims)
AI_EMBEDDING_MODEL=text-embedding-3-small

# topK de segmentos similares
AI_RAG_TOP_K=10

# janela de contexto (±N segmentos a partir do topK)
AI_RAG_WINDOW=2

# concorrência para indexação de embeddings
AI_EMBEDDING_CONCURRENCY=4
```

### Streaming de Respostas
```typescript
// TODO: Implementar SSE para streaming
async *chatStream(userId, transcriptionId, dto) {
  const stream = await openai.chat.completions.create({
    stream: true,
    // ...
  });
  
  for await (const chunk of stream) {
    yield chunk.choices[0]?.delta?.content || '';
  }
}
```

## ⚙️ Configuração

Variáveis de ambiente relevantes:

```bash
# Chave da OpenAI (obrigatória)
OPENAI_API_KEY=sk-...

# Limites de prompt
AI_PROMPT_CHAR_LIMIT=120000

# Timeouts
AI_TIMEOUT_MS=20000

# Modelo padrão
AI_CHECKLIST_MODEL=gpt-4o-mini

# Auditoria de prompts
AI_LOG_PROMPTS=1
AI_LOG_DIR=./storage/ai-prompts
```

## 🔒 Segurança

- ✅ Autenticação JWT obrigatória
- ✅ Validação de propriedade (userId)
- ✅ Soft delete (auditoria completa)
- ✅ Rate limiting via guards do NestJS
- ✅ Logs de auditoria automáticos

## 📝 Exemplos de Uso

### Perguntas Típicas

**Resumo:**
```
"Me faça um resumo desta transcrição"
"Quais foram os principais pontos discutidos?"
```

**Busca Específica:**
```
"Em que momento falaram sobre o projeto X?"
"Quem mencionou o prazo de entrega?"
```

**Análise:**
```
"Quais foram as decisões tomadas?"
"Houve algum conflito ou discordância?"
```

**Contexto:**
```
"O que foi dito antes de [00:15:30]?"
"Quem respondeu à pergunta da Maria?"
```

### Conversas Contextuais

```
User: Sobre o que é esta reunião?
AI: Esta é uma reunião de planejamento do Q1 2026...

User: Quem participou?
AI: Participaram João (gerente), Maria (desenvolvedora)...

User: O que João disse sobre prazos?
AI: João mencionou em [00:15:23] que os prazos são apertados...
```

## 🐛 Tratamento de Erros

```typescript
try {
  assistantText = await aiOrchestrator.generateStrictText(...);
} catch (error) {
  logger.error(`[Chat RAG] Erro: ${error?.message}`);
  assistantText = 'Desculpe, ocorreu um erro. Tente novamente.';
}
```

Erros comuns:
- `OPENAI_API_KEY não configurada`
- `AI_REQUEST_TIMEOUT` (timeout de 20s)
- `EMPTY_MODEL_OUTPUT` (resposta vazia do modelo)
- `JSON_PARSE_ERROR` (erro de parsing - não aplicável a texto)
