# Instalação do Módulo WhatsApp

## Dependências necessárias

Execute o seguinte comando para instalar as dependências:

```bash
npm install whatsapp-web.js qrcode-terminal
```

## O que será instalado

- **whatsapp-web.js**: Biblioteca principal para interagir com WhatsApp Web
- **qrcode-terminal**: Biblioteca para exibir QR Code no terminal (opcional, mas recomendado)

## Após a instalação

1. Inicie a aplicação
2. Na primeira inicialização, um QR Code será exibido no console
3. Escaneie o QR Code com o WhatsApp no celular:
   - Abra o WhatsApp
   - Vá em **Configurações > Aparelhos conectados > Conectar um aparelho**
   - Escaneie o QR Code
4. A sessão será salva automaticamente em `.wwebjs_auth/`

## Pronto!

Após escanear o QR Code, o módulo estará pronto para uso em qualquer parte da aplicação.

