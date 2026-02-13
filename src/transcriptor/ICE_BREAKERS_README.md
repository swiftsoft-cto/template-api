# Ice Breakers (Quebra-gelos) para Transcrições

## Visão Geral

Os Ice Breakers são perguntas sugeridas geradas **automaticamente** pela IA com base no conteúdo de uma transcrição. Eles ajudam o usuário a explorar e entender melhor o conteúdo transcrito, fornecendo pontos de partida interessantes para conversas ou análises.

## ✨ Geração Automática

**IMPORTANTE**: Os ice breakers são gerados automaticamente quando uma transcrição é concluída! Você não precisa chamar o endpoint de geração manualmente.

### Como Funciona

1. **Upload da Transcrição**: Usuário faz upload de um arquivo de áudio/vídeo
2. **Processamento**: O sistema processa a transcrição em background
3. **Conclusão**: Quando o status muda para `done`, o sistema automaticamente:
   - Gera 5 perguntas quebra-gelo via GPT-4o
   - Salva no banco de dados
   - Tudo em background, sem bloquear o fluxo
4. **Disponibilização**: As perguntas ficam imediatamente disponíveis no endpoint GET

### Quando São Gerados

- ✅ Automaticamente após cada transcrição ser concluída
- ✅ Apenas se ainda não existirem ice breakers para aquela transcrição
- ✅ Em background, sem afetar o tempo de resposta da API
- ✅ Falhas na geração não afetam a transcrição (são logadas e ignoradas)

## Características

- **Geração Automática**: As perguntas são geradas pela LLM (GPT-4o) analisando o conteúdo completo da transcrição
- **Personalizadas**: Cada conjunto de perguntas é específico para o conteúdo da transcrição
- **Quantidade Configurável**: É possível gerar de 3 a 10 perguntas por transcrição (padrão: 5)
- **Substituição**: Gerar novos ice breakers substitui os anteriores automaticamente

## Endpoints

### 1. Listar Ice Breakers

```bash
GET /transcriptions/:id/ice-breakers
```

**Autenticação**: Requer JWT token
**Permissão**: `transcriptions.read`

**Resposta**:
```json
{
  "data": [
    {
      "id": "uuid",
      "transcriptionId": "uuid",
      "question": "Qual foi o principal tema discutido?",
      "order": 0,
      "createdAt": "2026-02-06T10:00:00.000Z"
    },
    {
      "id": "uuid",
      "transcriptionId": "uuid",
      "question": "Quais foram as decisões tomadas?",
      "order": 1,
      "createdAt": "2026-02-06T10:00:00.000Z"
    }
  ]
}
```

### 2. Gerar Ice Breakers (Manual - Opcional)

⚠️ **Nota**: Este endpoint é opcional, pois os ice breakers são gerados automaticamente. Use apenas para:
- Regenerar perguntas com quantidade diferente
- Substituir perguntas existentes por novas

```bash
POST /transcriptions/:id/ice-breakers/generate
Content-Type: application/json

{
  "count": 7  // opcional, padrão: 5, min: 3, max: 10
}
```

**Autenticação**: Requer JWT token
**Permissão**: `transcriptions.create`

**Requisitos**:
- A transcrição deve estar com status `done`
- O usuário deve ser o proprietário da transcrição
- **Substitui** os ice breakers existentes

**Resposta**:
```json
{
  "data": [
    {
      "id": "uuid",
      "transcriptionId": "uuid",
      "question": "Qual foi o contexto da conversa?",
      "order": 0,
      "createdAt": "2026-02-06T10:00:00.000Z"
    }
  ]
}
```

## Fluxo de Uso

### Integração com Front-end

1. **Após criar uma transcrição**:
   ```typescript
   // Criar a transcrição
   const transcription = await createTranscription(audioFile);
   
   // Aguardar o processamento
   await waitForTranscriptionDone(transcription.id);
   
   // ✅ Ice breakers já foram gerados automaticamente!
   // Basta buscar:
   const { data: iceBreakers } = await getIceBreakers(transcription.id);
   ```

2. **Exibir na UI**:
   ```typescript
   // Buscar ice breakers existentes
   const { data: iceBreakers } = await getIceBreakers(transcriptionId);
   
   // Renderizar como botões clicáveis
   iceBreakers.forEach(ib => {
     renderQuestionButton(ib.question, () => {
       // Ao clicar, usar a pergunta para iniciar um chat
       startChat(transcriptionId, ib.question);
     });
   });
   ```

### Exemplo de UI

```
┌─────────────────────────────────────────────────┐
│ Transcrição: Reunião de Planejamento            │
├─────────────────────────────────────────────────┤
│                                                  │
│ Perguntas sugeridas:                            │
│                                                  │
│ [?] Qual foi o principal objetivo da reunião?   │
│ [?] Quais foram as decisões tomadas?            │
│ [?] Quem são os responsáveis por cada ação?     │
│ [?] Qual é o prazo para as entregas?            │
│ [?] Houve algum ponto de atenção mencionado?    │
│                                                  │
└─────────────────────────────────────────────────┘
```

## Como funciona a geração

1. **Análise do Conteúdo**: O sistema extrai todos os segmentos da transcrição
2. **Preparação do Contexto**: Monta um texto com os falantes e suas falas
3. **Prompt para LLM**: Envia um prompt estruturado para o GPT-4o pedindo perguntas específicas
4. **Validação**: Valida a resposta da LLM
5. **Armazenamento**: Salva as perguntas no banco de dados com ordem sequencial

## Exemplo de Prompt Enviado para LLM

```
Você é um assistente que analisa transcrições de áudio/vídeo e gera perguntas interessantes que podem ser feitas sobre o conteúdo.

Transcrição:
"""
João Silva: Bom dia a todos. Vamos começar nossa reunião de planejamento...
Maria Santos: Obrigada João. Sobre o projeto X...
"""

Gere EXATAMENTE 5 perguntas quebra-gelo (ice breakers) que um usuário poderia fazer sobre esta transcrição.

As perguntas devem:
- Ser específicas ao conteúdo da transcrição
- Ajudar o usuário a explorar pontos importantes do conteúdo
- Ser variadas (diferentes aspectos do conteúdo)
- Ser diretas e claras
- Não mencionar "na transcrição" ou "no áudio/vídeo" (apenas pergunte sobre o conteúdo)

Retorne no formato JSON:
{
  "questions": [
    "Primeira pergunta aqui?",
    "Segunda pergunta aqui?",
    ...
  ]
}
```

## Rastreamento de Uso

Todas as chamadas à LLM são automaticamente rastreadas pelo sistema:

- **Serviço**: `AiOrchestratorService`
- **Modelo**: GPT-4o
- **Categoria**: `transcription.icebreakers.generate`
- **Métricas**: tokens de prompt, tokens de completion, custo estimado

## Auditoria

Toda geração de ice breakers é registrada no audit log:

```json
{
  "action": "CREATE",
  "entity": "transcription.icebreakers",
  "entityId": "transcription-uuid",
  "before": null,
  "after": {
    "count": 5,
    "questions": ["...", "...", "..."]
  }
}
```

## Limitações e Considerações

1. **Tamanho do Texto**: Transcrições muito longas (>50k caracteres) são truncadas para não exceder limites de tokens
2. **Status da Transcrição**: Só funciona com transcrições finalizadas (`status: 'done'`)
3. **Substituição Automática**: Gerar novos ice breakers remove os anteriores (soft delete)
4. **Custo de Tokens**: Cada geração consome tokens da API do OpenAI (rastreados via `AiUsageService`)

## Benefícios

- **Melhora a Experiência do Usuário**: Oferece pontos de partida claros para explorar o conteúdo
- **Descoberta de Conteúdo**: Ajuda a identificar aspectos importantes que podem passar despercebidos
- **Economia de Tempo**: Usuário não precisa pensar em perguntas iniciais
- **Personalização**: Cada transcrição tem perguntas específicas ao seu conteúdo
