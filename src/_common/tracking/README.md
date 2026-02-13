# Módulo de Tracking

Módulo para gerar e enviar tracking visual do fluxo de projeto (Projeto → Escopo → Contrato) por WhatsApp.

## Características

- ✅ Gera HTML visual com timeline do processo
- ✅ Usa Puppeteer para gerar screenshot
- ✅ Envia automaticamente por WhatsApp
- ✅ Mostra em qual etapa o processo se encontra
- ✅ Formatação automática de datas em português

## Uso

### 1. Importar o serviço

```typescript
import { TrackingService } from '../../_common/tracking/tracking.service';

@Injectable()
export class MeuService {
  constructor(private readonly trackingService: TrackingService) {}
}
```

### 2. Enviar tracking

```typescript
await this.trackingService.sendTrackingByWhatsApp(
  '5511999999999', // Número do WhatsApp
  {
    projectId: 'uuid-do-projeto',
    projectName: 'Sistema de Gestão',
    customerName: 'Empresa XYZ',
    badge: 'INTERNO', // Opcional
    currentStage: 'contrato-assinado', // Estágio atual
    projectCreatedAt: new Date('2024-01-15'),
    scopeCreatedAt: new Date('2024-01-16'),
    scopeFinalizedAt: new Date('2024-01-20'),
    contractCreatedAt: new Date('2024-01-21'),
    contractFinalizedAt: new Date('2024-01-22'),
    contractSignedAt: new Date('2024-01-23'),
  },
  'Status do seu projeto', // Legenda opcional
);
```

## Estágios disponíveis

- `projeto` - Projeto criado
- `escopo` - Escopo em análise
- `escopo-finalizado` - Escopo finalizado
- `contrato` - Contrato criado
- `contrato-finalizado` - Contrato finalizado
- `contrato-assinado` - Contrato assinado

## Exemplo completo

```typescript
import { Injectable } from '@nestjs/common';
import { TrackingService, TrackingData } from '../../_common/tracking/tracking.service';

@Injectable()
export class ContractsService {
  constructor(private readonly trackingService: TrackingService) {}

  async notificarTrackingContratoAssinado(
    project: Project,
    customer: Customer,
    contract: Contract,
    customerPhone: string,
  ) {
    // Determina o estágio atual
    let currentStage: TrackingData['currentStage'] = 'projeto';
    
    if (contract.status === 'signed') {
      currentStage = 'contrato-assinado';
    } else if (contract.status === 'final') {
      currentStage = 'contrato-finalizado';
    } else if (contract.id) {
      currentStage = 'contrato';
    } else if (project.scope?.status === 'finalized') {
      currentStage = 'escopo-finalizado';
    } else if (project.scope?.id) {
      currentStage = 'escopo';
    }

    // Envia tracking
    await this.trackingService.sendTrackingByWhatsApp(
      customerPhone,
      {
        projectId: project.id,
        projectName: project.projectName,
        customerName: customer.displayName,
        badge: 'INTERNO',
        currentStage,
        projectCreatedAt: project.createdAt,
        scopeCreatedAt: project.scope?.createdAt,
        scopeFinalizedAt: project.scope?.status === 'finalized' ? project.scope.updatedAt : undefined,
        contractCreatedAt: contract.createdAt,
        contractFinalizedAt: contract.status === 'final' ? contract.updatedAt : undefined,
        contractSignedAt: contract.status === 'signed' ? contract.updatedAt : undefined,
      },
      `Status do projeto "${project.projectName}"`,
    );
  }
}
```

## Notas

- O screenshot é gerado temporariamente e removido após o envio
- As datas são formatadas automaticamente em português (ex: "15 de jan, 14:30")
- O HTML é renderizado com JavaScript, então o Puppeteer aguarda a renderização completa
- O módulo depende do `WhatsAppModule` estar configurado e pronto

