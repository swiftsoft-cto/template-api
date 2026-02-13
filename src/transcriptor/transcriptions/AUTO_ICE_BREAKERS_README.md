# Geração Automática de Ice Breakers

Funcionalidade que gera automaticamente perguntas quebra-gelo após a conclusão de cada transcrição.

## 🎯 Como Funciona

### Fluxo Automático

```
1. Usuário faz upload de áudio
   POST /transcriptions (file: audio.mp3)
   
2. Sistema processa transcrição em background
   - Divide em chunks se necessário
   - Envia para OpenAI Whisper
   - Extrai segmentos com timestamps
   - Atualiza status para "done"
   
3. ✨ Geração Automática de Ice Breakers
   - Verifica se já existem ice breakers
   - Se não existir, gera 5 perguntas automaticamente
   - Usa gpt-4o para criar perguntas contextuais
   - Executa em background (não bloqueia)
   
4. Usuário consulta ice breakers
   GET /transcriptions/:id/ice-breakers
   { data: [{ question: "...", ... }] }
```

## 📍 Implementação

### Localização no Código

**Arquivo**: `src/transcriptor/transcriptions/transcriptions.service.ts`

**Método**: `autoGenerateIceBreakers(userId, transcriptionId)`

**Chamadas** (2 locais):
1. Linha ~548: Após transcrição de arquivo único (≤ 25 MB)
2. Linha ~656: Após transcrição com chunks (> 25 MB)

### Código da Chamada

```typescript
await this.aiUsage.record({
  kind: 'transcription',
  model: usedModel,
  userId,
  requestId: id,
  callName: 'transcriptions.create',
  promptTokens: acc,
});

// ✅ Gera ice breakers automaticamente após conclusão
void this.autoGenerateIceBreakers(userId, id);
```

### Método Completo

```typescript
/**
 * Gera ice breakers automaticamente após a transcrição ser concluída.
 * Executa em background (fire-and-forget) para não bloquear o fluxo principal.
 */
private async autoGenerateIceBreakers(
  userId: string,
  transcriptionId: string,
): Promise<void> {
  try {
    this.logger.log(
      `[Auto Ice Breakers] Iniciando geração automática para transcrição ${transcriptionId}`,
    );

    // Verifica se já existem ice breakers
    const existing = await this.iceBreakersService['iceBreakersRepo'].count({
      where: { transcriptionId, deletedAt: IsNull() },
    });

    if (existing > 0) {
      this.logger.log(
        `[Auto Ice Breakers] Transcrição ${transcriptionId} já possui ${existing} ice breakers`,
      );
      return;
    }

    // Gera 5 ice breakers automaticamente
    await this.iceBreakersService.generate(
      userId,
      transcriptionId,
      { count: 5 },
      undefined, // sem auditMeta
    );

    this.logger.log(
      `[Auto Ice Breakers] Ice breakers gerados para ${transcriptionId}`,
    );
  } catch (error) {
    this.logger.error(
      `[Auto Ice Breakers] Erro: ${error?.message}`,
    );
    // Não propaga erro para não quebrar fluxo
  }
}
```

## 🔧 Características

### ✅ Inteligente
- Verifica se já existem ice breakers antes de gerar
- Não duplica se o usuário já gerou manualmente

### ✅ Assíncrono (Fire-and-Forget)
```typescript
void this.autoGenerateIceBreakers(userId, id);
//  ^ Não aguarda conclusão (não bloqueia resposta)
```

### ✅ Tolerante a Falhas
- Se der erro, apenas loga
- Não quebra o fluxo de transcrição
- Transcrição é marcada como "done" mesmo se ice breakers falharem

### ✅ Sem Poluir Auditoria
- Passa `undefined` como `auditMeta`
- Não cria registros de auditoria desnecessários

## 📊 Quantidade de Perguntas

**Padrão**: 5 perguntas

**Configurável**: Sim, através do DTO `{ count: 5 }`

**Modelo**: `gpt-4o` (definido no `IceBreakersService`)

## 🔄 Integração entre Módulos

### Arquitetura

```
TranscriptionsModule
  ├─ imports: [IceBreakersModule] (forwardRef)
  └─ TranscriptionsService
       └─ injects: IceBreakersService (forwardRef)
            └─ chama: generate(userId, id, { count: 5 })
```

### Forward Reference

Usa `forwardRef` para resolver dependência circular:

```typescript
// Module
imports: [
  forwardRef(() => IceBreakersModule),
]

// Service
@Inject(forwardRef(() => IceBreakersService))
private iceBreakersService: IceBreakersService,
```

## 📝 Logs

### Sucesso
```
[Nest] INFO  [TranscriptionsService] Transcrição concluída para abc-123
[Nest] INFO  [TranscriptionsService] [Auto Ice Breakers] Iniciando geração...
[Nest] INFO  [TranscriptionsService] [Auto Ice Breakers] Ice breakers gerados...
```

### Já Existe
```
[Nest] INFO  [TranscriptionsService] [Auto Ice Breakers] Transcrição abc-123 já possui 5 ice breakers. Pulando...
```

### Erro
```
[Nest] ERROR [TranscriptionsService] [Auto Ice Breakers] Erro ao gerar: ...
```

## 🎛️ Desabilitar (Opcional)

Se quiser desabilitar a geração automática, basta comentar as 2 linhas:

```typescript
// void this.autoGenerateIceBreakers(userId, id);
```

Ou adicionar uma flag de ambiente:

```typescript
// .env
AUTO_GENERATE_ICE_BREAKERS=false

// Código
if (this.shouldAutoGenerate()) {
  void this.autoGenerateIceBreakers(userId, id);
}

private shouldAutoGenerate(): boolean {
  return process.env.AUTO_GENERATE_ICE_BREAKERS !== 'false';
}
```

## 🧪 Testando

### 1. Criar Transcrição
```bash
curl -X POST http://localhost:3000/transcriptions \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@audio.mp3"
```

### 2. Aguardar Processamento
```bash
# Status: processing -> done
curl http://localhost:3000/transcriptions/$ID \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Verificar Ice Breakers (Automático)
```bash
curl http://localhost:3000/transcriptions/$ID/ice-breakers \
  -H "Authorization: Bearer $TOKEN"

# Resposta esperada:
{
  "data": [
    { "question": "Qual foi o principal tema discutido?", ... },
    { "question": "Quem participou da reunião?", ... },
    { "question": "Quais decisões foram tomadas?", ... },
    { "question": "Houve algum prazo mencionado?", ... },
    { "question": "Qual foi o próximo passo definido?", ... }
  ]
}
```

## ⚡ Performance

- **Impacto**: Mínimo (executa em background)
- **Tempo**: ~2-5 segundos após transcrição
- **Custo**: ~1000 tokens por transcrição (gpt-4o)
- **Rastreamento**: Via `AiUsageService` com callName `transcription.icebreakers.auto`

## 🔗 Relacionado

- **Geração Manual**: `POST /transcriptions/:id/ice-breakers/generate`
- **Listar**: `GET /transcriptions/:id/ice-breakers`
- **Documentação**: `src/transcriptor/icebreakers/`
