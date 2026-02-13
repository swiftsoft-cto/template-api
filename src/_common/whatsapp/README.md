# Módulo WhatsApp

Módulo simples para disparo de mensagens WhatsApp usando `whatsapp-web.js`.

## Instalação

```bash
npm install whatsapp-web.js qrcode-terminal
```

## Características

- ✅ Envio de mensagens de texto
- ✅ Envio de imagens (arquivo local ou URL)
- ✅ Suporte a legenda nas imagens
- ✅ Gerenciamento automático de sessão (persistência)
- ✅ Módulo global (disponível em toda a aplicação)
- ✅ Sem banco de dados (apenas disparo)

## Uso

### 1. Importar o serviço em qualquer módulo

```typescript
import { Injectable } from '@nestjs/common';
import { WhatsAppService } from '../../_common/whatsapp/whatsapp.service';

@Injectable()
export class MeuService {
  constructor(private readonly whatsappService: WhatsAppService) {}

  async enviarNotificacao() {
    await this.whatsappService.sendMessage({
      phoneNumber: '5511999999999', // Código do país + DDD + número
      text: 'Olá! Esta é uma mensagem de teste.',
    });
  }
}
```

### 2. Enviar apenas texto

```typescript
await this.whatsappService.sendText('5511999999999', 'Mensagem de texto');
```

### 3. Enviar apenas imagem (arquivo local)

```typescript
await this.whatsappService.sendImage(
  '5511999999999',
  '/caminho/para/imagem.jpg',
  'Legenda da imagem (opcional)',
);
```

### 4. Enviar imagem de URL

```typescript
await this.whatsappService.sendImageFromUrl(
  '5511999999999',
  'https://example.com/imagem.jpg',
  'Legenda da imagem (opcional)',
);
```

### 5. Enviar texto e imagem juntos

```typescript
await this.whatsappService.sendMessage({
  phoneNumber: '5511999999999',
  text: 'Veja esta imagem!',
  imagePath: '/caminho/para/imagem.jpg',
  caption: 'Legenda da imagem',
});
```

### 6. Enviar texto e imagem de URL

```typescript
await this.whatsappService.sendMessage({
  phoneNumber: '5511999999999',
  text: 'Veja esta imagem!',
  imageUrl: 'https://example.com/imagem.jpg',
  caption: 'Legenda da imagem',
});
```

## Formato do número de telefone

O número deve estar no formato: **código do país + DDD + número**

Exemplos:
- Brasil: `5511999999999` (55 = código do país, 11 = DDD, 999999999 = número)
- EUA: `11234567890` (1 = código do país, 1234567890 = número)

O serviço automaticamente formata o número se necessário.

## Primeira inicialização

Na primeira vez que o módulo for inicializado, será gerado um QR Code no console. Você precisa:

1. Abrir o WhatsApp no celular
2. Ir em **Configurações > Aparelhos conectados > Conectar um aparelho**
3. Escanear o QR Code exibido no console

Após escanear, a sessão será salva automaticamente em `.wwebjs_auth/` e você não precisará escanear novamente (a menos que a sessão expire).

## Verificar se está pronto

```typescript
if (this.whatsappService.isClientReady()) {
  // Cliente está pronto para enviar mensagens
}
```

## Estrutura de arquivos

```
src/_common/whatsapp/
├── whatsapp.module.ts    # Módulo NestJS (global)
├── whatsapp.service.ts   # Serviço principal
└── README.md             # Esta documentação
```

## Notas importantes

- ⚠️ A sessão é salva localmente em `.wwebjs_auth/`
- ⚠️ Não há auditoria ou log de mensagens enviadas
- ⚠️ O módulo é inicializado automaticamente quando a aplicação inicia
- ⚠️ Se o WhatsApp desconectar, será necessário escanear o QR Code novamente

