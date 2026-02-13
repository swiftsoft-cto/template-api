# Exemplo de Integração - Enviar Tracking quando Contrato for Assinado

## Passo 1: Adicionar TrackingModule ao ContractsModule

```typescript
// src/projects-management/contracts/contracts.module.ts
import { TrackingModule } from '../../_common/tracking/tracking.module';

@Module({
  imports: [
    // ... outros imports
    TrackingModule,
  ],
  // ...
})
export class ContractsModule {}
```

## Passo 2: Injetar TrackingService no ContractsService

```typescript
// src/projects-management/contracts/contracts.service.ts
import { TrackingService } from '../../_common/tracking/tracking.service';

@Injectable()
export class ContractsService {
  constructor(
    // ... outros services
    private readonly trackingService: TrackingService,
  ) {}
}
```

## Passo 3: Criar método helper para determinar estágio

```typescript
private determineCurrentStage(
  project: Project,
  scope?: ProjectScope | null,
  contract?: Contract | null,
): TrackingData['currentStage'] {
  if (contract?.status === 'signed') {
    return 'contrato-assinado';
  }
  if (contract?.status === 'final') {
    return 'contrato-finalizado';
  }
  if (contract?.id) {
    return 'contrato';
  }
  if (scope?.status === 'finalized') {
    return 'escopo-finalizado';
  }
  if (scope?.id) {
    return 'escopo';
  }
  return 'projeto';
}
```

## Passo 4: Adicionar notificação no método notifyContractSigned

```typescript
private async notifyContractSigned(contract: Contract): Promise<void> {
  try {
    // ... código existente de notificação ...

    // Buscar dados completos do projeto
    const project = await this.projectRepo.findOne({
      where: { id: contract.projectId },
      relations: ['customer'],
    });

    if (!project) {
      return;
    }

    const customer = (project as any).customer;
    
    // Buscar escopo se existir
    const scope = contract.scopeId
      ? await this.scopeRepo.findOne({
          where: { id: contract.scopeId },
        })
      : null;

    // Determinar estágio atual
    const currentStage = this.determineCurrentStage(project, scope, contract);

    // Buscar telefone do cliente (assumindo que está em algum lugar)
    // Você precisará adaptar isso conforme sua estrutura
    const customerPhone = customer?.phone || customer?.person?.phone;
    
    if (customerPhone) {
      // Enviar tracking por WhatsApp
      await this.trackingService.sendTrackingByWhatsApp(
        customerPhone,
        {
          projectId: project.id,
          projectName: project.projectName,
          customerName: customer.displayName,
          badge: 'INTERNO',
          currentStage,
          projectCreatedAt: project.createdAt,
          scopeCreatedAt: scope?.createdAt,
          scopeFinalizedAt:
            scope?.status === 'finalized' ? scope.updatedAt : undefined,
          contractCreatedAt: contract.createdAt,
          contractFinalizedAt:
            contract.status === 'final' ? contract.updatedAt : undefined,
          contractSignedAt:
            contract.status === 'signed' ? contract.updatedAt : undefined,
        },
        `Status do projeto "${project.projectName}"`,
      );
    }
  } catch (error) {
    // Não deve quebrar o fluxo principal se o tracking falhar
    this.logger.error(
      `Erro ao enviar tracking por WhatsApp: ${error?.message || error}`,
    );
  }
}
```

## Notas importantes

- ⚠️ Você precisará adaptar a busca do telefone do cliente conforme sua estrutura de dados
- ⚠️ O tracking é enviado de forma assíncrona e não bloqueia o fluxo principal
- ⚠️ Certifique-se de que o WhatsApp está pronto antes de chamar `sendTrackingByWhatsApp`

