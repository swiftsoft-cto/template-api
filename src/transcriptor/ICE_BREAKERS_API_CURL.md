# Ice Breakers API - Exemplos CURL

Este documento contém exemplos de requisições CURL para os endpoints de Ice Breakers (quebra-gelos) da API de Transcrições.

## ⚡ Geração Automática

**IMPORTANTE**: Os ice breakers são gerados **automaticamente** quando uma transcrição é concluída! Você não precisa chamar o endpoint de geração manualmente em condições normais.

**Como funciona:**
1. Você faz upload de um arquivo de áudio/vídeo via `POST /transcriptions`
2. O sistema processa a transcrição em background
3. Quando concluída (`status: 'done'`), o sistema gera automaticamente 5 perguntas via GPT-4o
4. As perguntas ficam imediatamente disponíveis via `GET /transcriptions/:id/ice-breakers`

**Use o endpoint de geração manual apenas para:**
- Regenerar com quantidade diferente de perguntas
- Substituir perguntas existentes por novas

## Variáveis de Ambiente

```bash
export API_URL="http://localhost:3000"
export ACCESS_TOKEN="seu-jwt-token-aqui"
export TRANSCRIPTION_ID="uuid-da-transcricao"
```

## 1. Listar Ice Breakers

Retorna todas as perguntas quebra-gelo de uma transcrição.

```bash
curl -X GET \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/ice-breakers" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json"
```

**Resposta de Sucesso (200)**:
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "transcriptionId": "660e8400-e29b-41d4-a716-446655440001",
      "question": "Qual foi o principal tema discutido na reunião?",
      "order": 0,
      "createdAt": "2026-02-06T10:30:00.000Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "transcriptionId": "660e8400-e29b-41d4-a716-446655440001",
      "question": "Quais foram as decisões tomadas?",
      "order": 1,
      "createdAt": "2026-02-06T10:30:00.000Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "transcriptionId": "660e8400-e29b-41d4-a716-446655440001",
      "question": "Quem são os responsáveis pelas ações definidas?",
      "order": 2,
      "createdAt": "2026-02-06T10:30:00.000Z"
    }
  ]
}
```

**Erros Possíveis**:
- `401 Unauthorized`: Token inválido ou ausente
- `403 Forbidden`: Sem permissão `transcriptions.read`
- `404 Not Found`: Transcrição não encontrada ou não pertence ao usuário

## 2. Gerar Ice Breakers

Gera novas perguntas quebra-gelo usando IA baseadas no conteúdo da transcrição.

### Exemplo 1: Gerar com quantidade padrão (5 perguntas)

```bash
curl -X POST \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/ice-breakers/generate" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Exemplo 2: Gerar com quantidade personalizada

```bash
curl -X POST \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/ice-breakers/generate" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "count": 7
  }'
```

### Exemplo 3: Gerar quantidade mínima (3 perguntas)

```bash
curl -X POST \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/ice-breakers/generate" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "count": 3
  }'
```

### Exemplo 4: Gerar quantidade máxima (10 perguntas)

```bash
curl -X POST \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/ice-breakers/generate" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "count": 10
  }'
```

**Resposta de Sucesso (200)**:
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "transcriptionId": "660e8400-e29b-41d4-a716-446655440001",
      "question": "Quais foram os pontos principais abordados?",
      "order": 0,
      "createdAt": "2026-02-06T11:00:00.000Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440011",
      "transcriptionId": "660e8400-e29b-41d4-a716-446655440001",
      "question": "Há algum prazo importante mencionado?",
      "order": 1,
      "createdAt": "2026-02-06T11:00:00.000Z"
    }
    // ... mais perguntas
  ]
}
```

**Erros Possíveis**:
- `400 Bad Request`: 
  - Transcrição ainda está em processamento (`status !== 'done'`)
  - Validação falhou (count < 3 ou > 10)
- `401 Unauthorized`: Token inválido ou ausente
- `403 Forbidden`: Sem permissão `transcriptions.create`
- `404 Not Found`: Transcrição não encontrada ou não pertence ao usuário
- `500 Internal Server Error`: Falha na geração pela LLM

## 3. Fluxo Completo de Uso (Com Geração Automática)

### Passo 1: Upload e criação da transcrição

```bash
curl -X POST \
  "${API_URL}/transcriptions" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -F "file=@reuniao.mp3" \
  -F "title=Reunião de Planejamento" \
  -F "diarizationEnabled=true"
```

**Resposta**: Guarde o `id` da transcrição retornado.

### Passo 2: Aguardar processamento

```bash
# Verificar status periodicamente
curl -X GET \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

Aguarde até que `status` seja `"done"`.

### Passo 3: ✅ Ice breakers já foram gerados automaticamente!

Basta listar:

```bash
curl -X GET \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/ice-breakers" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

**Resposta**: Você receberá ~5 perguntas geradas automaticamente.

### Passo 4: (Opcional) Regenerar com quantidade diferente

Se quiser mais ou menos perguntas, ou simplesmente perguntas novas:

```bash
curl -X POST \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/ice-breakers/generate" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "count": 7
  }'
```

### Passo 5: Usar uma pergunta para iniciar um chat

```bash
curl -X POST \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/chat" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Quais foram os pontos principais abordados?"
  }'
```

## 4. Testes e Validações

### Teste 1: Validar quantidade mínima

```bash
# Deve retornar erro 400 (count < 3)
curl -X POST \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/ice-breakers/generate" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "count": 2
  }' \
  -v
```

### Teste 2: Validar quantidade máxima

```bash
# Deve retornar erro 400 (count > 10)
curl -X POST \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/ice-breakers/generate" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "count": 11
  }' \
  -v
```

### Teste 3: Tentar gerar para transcrição em processamento

```bash
# Criar transcrição e tentar gerar imediatamente (deve falhar)
TRANSCRIPTION_ID=$(curl -X POST \
  "${API_URL}/transcriptions" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -F "file=@audio.mp3" \
  -F "title=Test" \
  | jq -r '.id')

# Deve retornar erro 400
curl -X POST \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/ice-breakers/generate" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -v
```

### Teste 4: Substituição de ice breakers

```bash
# Gerar primeira vez
curl -X POST \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/ice-breakers/generate" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"count": 3}'

# Listar (deve ter 3 perguntas)
curl -X GET \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/ice-breakers" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"

# Gerar novamente
curl -X POST \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/ice-breakers/generate" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"count": 5}'

# Listar novamente (deve ter 5 perguntas novas)
curl -X GET \
  "${API_URL}/transcriptions/${TRANSCRIPTION_ID}/ice-breakers" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

## 5. Monitoramento de Uso de IA

Para monitorar o uso da IA nas gerações de ice breakers:

```bash
# Ver uso geral de IA
curl -X GET \
  "${API_URL}/ai-usage?kind=chat.completions" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"

# Ver uso específico do usuário
curl -X GET \
  "${API_URL}/ai-usage?callName=transcription.icebreakers.generate" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

## Notas Importantes

1. **Custo**: Cada geração consome tokens da API do OpenAI (GPT-4o)
2. **Tempo**: A geração pode levar de 3 a 10 segundos dependendo do tamanho da transcrição
3. **Substituição**: Gerar novos ice breakers remove os anteriores automaticamente
4. **Limite**: Transcrições muito longas são truncadas em 50.000 caracteres
5. **Requisito**: A transcrição deve estar com `status: "done"` para gerar ice breakers
