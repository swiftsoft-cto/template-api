# Configuração de SMTP para Desenvolvimento

## Problema Resolvido
O erro "self-signed certificate in certificate chain" no POST /auth/login foi corrigido com duas melhorias:

1. **Suporte a certificados autoassinados em dev/homol**
2. **Tratamento de erros de envio de e-mail sem quebrar o login**

## Configurações de Ambiente

### Para Desenvolvimento Local (com Mailpit/Mailhog)
```env
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_ALLOW_INVALID_CERT=false
MAIL_FROM=No-Reply <no-reply@localhost>
```

### Para Servidor de Desenvolvimento com Certificado Autoassinado
```env
SMTP_HOST=your-dev-server.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user
SMTP_PASS=your-password
SMTP_ALLOW_INVALID_CERT=true
MAIL_FROM=No-Reply <no-reply@your-domain.com>
```

### Para Produção (NUNCA usar SMTP_ALLOW_INVALID_CERT=true)
```env
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user
SMTP_PASS=your-password
SMTP_ALLOW_INVALID_CERT=false
MAIL_FROM=No-Reply <no-reply@your-domain.com>
```

## Configuração de Portas SMTP
- **Porta 465**: `SMTP_SECURE=true` (SSL/TLS)
- **Porta 587**: `SMTP_SECURE=false` (STARTTLS)
- **Porta 25**: `SMTP_SECURE=false` (sem criptografia)

## Testando a Configuração

### 1. Usando Mailpit (Recomendado para Dev)
```bash
# Instalar Mailpit via Docker
docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit

# Configurar .env
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_ALLOW_INVALID_CERT=false
```

Acesse http://localhost:8025 para ver os e-mails enviados.

### 2. Testando o Fluxo de Login
1. Tente fazer login com usuário não verificado
2. Deve receber 403 "e-mail não verificado" (sem erro 500)
3. Tente fazer login com dispositivo não confiável
4. Deve receber 403 "verificação de dispositivo necessária" (sem erro 500)

## Logs de Debug
Os erros de envio de e-mail agora são logados como warnings:
```
sendEmailVerification falhou: self-signed certificate in certificate chain
sendNewDeviceApproval falhou: self-signed certificate in certificate chain
```

## Segurança
- `SMTP_ALLOW_INVALID_CERT=true` **NUNCA** deve ser usado em produção
- Em produção, configure adequadamente os certificados SSL/TLS do servidor SMTP
- Use sempre SMTP com autenticação em produção
