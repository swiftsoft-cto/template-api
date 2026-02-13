# Exemplos de Uso do Módulo WhatsApp

## Exemplo 1: Enviar notificação simples

```typescript
import { Injectable } from '@nestjs/common';
import { WhatsAppService } from '../../_common/whatsapp/whatsapp.service';

@Injectable()
export class NotificationService {
  constructor(private readonly whatsappService: WhatsAppService) {}

  async notificarCliente(phoneNumber: string, message: string) {
    try {
      await this.whatsappService.sendMessage({
        phoneNumber,
        text: message,
      });
    } catch (error) {
      console.error('Erro ao enviar WhatsApp:', error);
    }
  }
}
```

## Exemplo 2: Enviar imagem com legenda

```typescript
async enviarComprovante(phoneNumber: string, imagePath: string) {
  await this.whatsappService.sendMessage({
    phoneNumber,
    imagePath,
    caption: 'Seu comprovante de pagamento',
  });
}
```

## Exemplo 3: Enviar texto e imagem separados

```typescript
async enviarNotificacaoCompleta(phoneNumber: string) {
  await this.whatsappService.sendMessage({
    phoneNumber,
    text: 'Olá! Veja sua fatura em anexo.',
    imagePath: '/caminho/para/fatura.pdf',
    caption: 'Fatura do mês',
  });
}
```

## Exemplo 4: Verificar se está pronto antes de enviar

```typescript
async enviarSePronto(phoneNumber: string, message: string) {
  if (!this.whatsappService.isClientReady()) {
    throw new Error('WhatsApp não está pronto. Aguarde a inicialização.');
  }

  await this.whatsappService.sendMessage({
    phoneNumber,
    text: message,
  });
}
```

## Exemplo 5: Enviar imagem de URL

```typescript
async enviarImagemDaWeb(phoneNumber: string) {
  await this.whatsappService.sendMessage({
    phoneNumber,
    imageUrl: 'https://example.com/imagem.jpg',
    caption: 'Imagem da web',
  });
}
```

## Exemplo 6: Integração com outros módulos

```typescript
// Em um service de contratos, por exemplo
import { WhatsAppService } from '../../_common/whatsapp/whatsapp.service';

@Injectable()
export class ContractsService {
  constructor(
    private readonly whatsappService: WhatsAppService,
    // ... outros services
  ) {}

  async notificarContratoAssinado(contract: Contract, customerPhone: string) {
    // Envia notificação por WhatsApp
    await this.whatsappService.sendMessage({
      phoneNumber: customerPhone,
      text: `Seu contrato "${contract.title}" foi assinado com sucesso!`,
    });
  }
}
```

