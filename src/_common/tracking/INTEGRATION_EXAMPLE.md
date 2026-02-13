# Exemplo de Integração - Tracking com WhatsApp

## Passo 1: Adicionar TrackingModule ao seu módulo

```typescript
// src/seu-modulo/seu-modulo.module.ts
import { TrackingModule } from '../../_common/tracking/tracking.module';

@Module({
  imports: [
    // ... outros imports
    TrackingModule,
  ],
  // ...
})
export class SeuModulo {}
```

## Passo 2: Injetar TrackingService no seu Service

```typescript
// src/seu-modulo/seu-modulo.service.ts
import { TrackingService } from '../../_common/tracking/tracking.service';

@Injectable()
export class SeuService {
  constructor(
    // ... outros services
    private readonly trackingService: TrackingService,
  ) {}
}
```

## Passo 3: Enviar tracking por WhatsApp

```typescript
await this.trackingService.sendTrackingByWhatsApp(
  customerPhone,
  {
    projectId: 'uuid',
    projectName: 'Nome do Projeto',
    customerName: 'Nome do Cliente',
    badge: 'INTERNO',
    currentStage: 'projeto',
    projectCreatedAt: new Date(),
    // ... demais campos conforme necessário
  },
  'Assunto da mensagem',
);
```

## Notas importantes

- ⚠️ O tracking é enviado de forma assíncrona e não bloqueia o fluxo principal
- ⚠️ Certifique-se de que o WhatsApp está pronto antes de chamar `sendTrackingByWhatsApp`
