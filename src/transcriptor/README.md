# Módulo Transcriptor

Este módulo gerencia transcrições de áudio/vídeo com recursos avançados de IA.

## Arquitetura

O módulo está organizado em **submódulos** para melhor manutenibilidade e separação de responsabilidades:

```
src/transcriptor/
├── transcriptions/              # Core - CRUD de transcrições
│   ├── transcriptions.controller.ts
│   ├── transcriptions.service.ts
│   ├── transcriptions.module.ts
│   ├── dtos/
│   │   └── transcriptions.dto.ts
│   └── entities/
│       └── transcriptor.entity.ts
├── icebreakers/                 # Perguntas quebra-gelo
│   ├── icebreakers.controller.ts
│   ├── icebreakers.service.ts
│   ├── icebreakers.module.ts
│   ├── dtos/
│   │   └── icebreakers.dto.ts
│   └── entities/
│       └── transcriptor-ice-breaker.entity.ts
├── comments/                    # Comentários
│   ├── comments.controller.ts
│   ├── comments.service.ts
│   ├── comments.module.ts
│   ├── dtos/
│   │   └── comments.dto.ts
│   └── entities/
│       └── transcriptor-comment.entity.ts
├── chat/                        # Chat com IA
│   ├── chat.controller.ts
│   ├── chat.service.ts
│   ├── chat.module.ts
│   ├── dtos/
│   │   └── chat.dto.ts
│   └── entities/
│       └── transcriptor-chat.entity.ts
├── insights/                    # Insights automáticos
│   ├── insights.controller.ts
│   ├── insights.service.ts
│   ├── insights.module.ts
│   ├── dtos/
│   │   └── insights.dto.ts
│   └── entities/
│       └── transcriptor-insight.entity.ts
├── summaries/                   # Resumos personalizados
│   ├── summaries.controller.ts
│   ├── summaries.service.ts
│   ├── summaries.module.ts
│   ├── dtos/
│   │   └── summaries.dto.ts
│   └── entities/
│       └── transcriptor-summary.entity.ts
├── share/                       # Compartilhamento público
│   ├── share.controller.ts
│   ├── share.service.ts
│   ├── share.module.ts
│   ├── dtos/
│   │   └── share.dto.ts
│   └── entities/
│       └── transcriptor-share.entity.ts
└── transcriptor.module.ts       # Módulo principal
```

## Submódulos

### 1. Transcriptions (Core)

**Responsabilidade**: CRUD de transcrições, edição de segmentos, gestão de speakers, tags e streaming de mídia.

**Características**:
- ✅ **Realtime**: Emite evento WebSocket `transcription:status` quando transcrição termina (done/error)
- ✅ **Flag de Status**: Campo `status` no registro (`processing` | `done` | `error`) para consulta ao retornar à app
- ✅ **Múltiplas na Fila**: Suporta várias transcrições simultâneas; WS avisa quando cada uma concluir

**Endpoints principais**:
- `GET /transcriptions` - Listar transcrições
- `POST /transcriptions` - Criar nova transcrição (upload de áudio)
- `GET /transcriptions/:id` - Detalhes da transcrição
- `PATCH /transcriptions/:id` - Atualizar transcrição
- `DELETE /transcriptions/:id` - Deletar transcrição
- `PATCH /transcriptions/:id/segments/:segmentId` - Editar segmento
- `POST /transcriptions/:id/speakers` - Atualizar labels de speakers
- `GET /transcriptions/:id/media/stream` - Stream do áudio original

### 2. Ice Breakers

**Responsabilidade**: Gerar e gerenciar perguntas quebra-gelo automaticamente via LLM.

**Características**:
- ✅ **Geração Automática**: Cria 5 perguntas automaticamente após transcrição concluída
- ✅ **Inteligente**: Verifica se já existem ice breakers antes de gerar
- ✅ **Background**: Executa sem bloquear o retorno da transcrição
- ✅ **Baseado em IA**: Usa `gpt-4o` para gerar perguntas contextuais

**Endpoints principais**:
- `GET /transcriptions/:id/ice-breakers` - Listar perguntas
- `POST /transcriptions/:id/ice-breakers/generate` - Gerar novas perguntas manualmente

### 3. Comments

**Responsabilidade**: Comentários vinculados a timestamps ou segmentos da transcrição.

**Endpoints principais**:
- `GET /transcriptions/:id/comments` - Listar comentários
- `POST /transcriptions/:id/comments` - Criar comentário
- `PATCH /transcriptions/:id/comments/:commentId` - Atualizar comentário
- `DELETE /transcriptions/:id/comments/:commentId` - Deletar comentário

### 4. Chat

**Responsabilidade**: Chat interativo com a transcrição usando IA com RAG (Retrieval Augmented Generation).

**Características**:
- ✅ **RAG Implementado**: Usa contexto da transcrição + histórico do chat
- ✅ **Citações Automáticas**: Extrai e referencia timestamps mencionados
- ✅ **Histórico Contextual**: Mantém últimas 20 mensagens para contexto
- ✅ **Tracking de Uso**: Registra automaticamente via `AiUsageService`
- ✅ **Soft Delete**: Threads podem ser deletados mantendo auditoria

**Endpoints principais**:
- `GET /transcriptions/:id/chat/threads` - Listar threads de chat
- `GET /transcriptions/:id/chat/threads/:threadId/messages` - Mensagens de um thread
- `POST /transcriptions/:id/chat/messages` - Enviar mensagem e receber resposta da IA
- `DELETE /transcriptions/:id/chat/threads/:threadId` - Deletar thread (soft delete)

**Documentação Completa**: Ver [chat/CHAT_RAG_README.md](./chat/CHAT_RAG_README.md)

### 5. Insights

**Responsabilidade**: Gerar insights automáticos (tópicos, action items, etc).

**Endpoints principais**:
- `GET /transcriptions/:id/insights` - Listar insights gerados
- `POST /transcriptions/:id/insights` - Gerar novos insights

### 6. Summaries

**Responsabilidade**: Criar resumos personalizados baseados em prompts do usuário.

**Endpoints principais**:
- `GET /transcriptions/:id/summaries` - Listar resumos
- `POST /transcriptions/:id/summary` - Gerar novo resumo

### 7. Share

**Responsabilidade**: Criar e gerenciar links de compartilhamento público.

**Endpoints principais**:
- `POST /transcriptions/:id/share-links` - Criar link de compartilhamento
- `DELETE /transcriptions/:id/share-links/:token` - Revogar link
- `GET /share/:token` - Acessar transcrição compartilhada (público)
- `GET /share/:token/media/stream` - Stream de mídia compartilhada (público)

## Dependências entre Submódulos

- Todos os submódulos (exceto `transcriptions`) dependem de `Transcriptor` entity para validar propriedade
- Os serviços são exportados para possível reuso futuro
- Cada submódulo é independente e pode ser testado isoladamente

## Benefícios da Arquitetura

1. **Separação de responsabilidades**: Cada submódulo tem uma responsabilidade clara
2. **Manutenibilidade**: Mais fácil encontrar e modificar código específico
3. **Testabilidade**: Submódulos podem ser testados independentemente
4. **Escalabilidade**: Novos recursos podem ser adicionados como novos submódulos
5. **Clareza**: A estrutura reflete a arquitetura da API

## Status de Implementação

### ✅ Concluído
- ✅ **Chat com RAG**: Implementado com contexto completo da transcrição + histórico
- ✅ **Ice Breakers**: Geração automática após transcrição (5 perguntas via gpt-4o)
- ✅ **Transcrições**: Upload, processamento e edição completos
- ✅ **Comments**: CRUD completo de comentários
- ✅ **Share**: Links públicos de compartilhamento
- ✅ **Summaries**: Geração de resumos (placeholder)

### ⏳ Próximos Passos

- [ ] **Busca Semântica no Chat**: Implementar embeddings para busca vetorial de segmentos
- [ ] **Streaming de Respostas**: SSE para respostas em tempo real
- [ ] **Insights com IA**: Substituir placeholder por análise real via LLM
- [ ] **Título Automático de Threads**: Gerar título baseado na primeira mensagem
- [ ] **Cache de Embeddings**: Pré-calcular embeddings dos segmentos
- [ ] **Testes Unitários**: Para cada submódulo
- [ ] **Testes de Integração**: Fluxos completos
- [ ] **Documentação Swagger/OpenAPI**: Para todos os endpoints
