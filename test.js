// send-test.js
const nodemailer = require('nodemailer');

(async () => {
  // === EDITE AQUI ===
  const SMTP_USER = 'john.due.soft@gmail.com';
  const SMTP_PASS = 'liah jvxn rsqu gsjt'; // ex: 'abcdefghijklmnop' (16 chars)
  const TO        = 'hms.swiftsoft@gmail.com';

  // Tente primeiro SSL nativo (465). Se não funcionar, troque para false para usar 587+STARTTLS
  const USE_SSL_465 = true;

  // Apenas para diagnóstico local. NÃO USE EM PRODUÇÃO.
  const INSECURE_TEST_ONLY = false;

  const baseConfig = {
    host: 'smtp.gmail.com',
    port: USE_SSL_465 ? 465 : 587,
    secure: USE_SSL_465,            // true = SMTPS (465); false = STARTTLS (587)
    auth: { user: SMTP_USER, pass: SMTP_PASS.replace(/\s+/g, '') },
    logger: true,
    debug: true,
    // Em 587, força TLS e define SNI/cipher mínimos
    requireTLS: !USE_SSL_465,
    tls: {
      servername: 'smtp.gmail.com',
      minVersion: 'TLSv1.2',
      ...(INSECURE_TEST_ONLY ? { rejectUnauthorized: false } : {})
    }
  };

  const transporter = nodemailer.createTransport(baseConfig);

  try {
    await transporter.verify();
    console.log('✅ Conexão SMTP OK. Enviando e-mail...');

    const info = await transporter.sendMail({
      from: `"Seu App" <${SMTP_USER}>`,
      to: TO,
      subject: 'Teste SMTP (Nodemailer + Gmail)',
      text: 'Se você recebeu, o SMTP está funcionando.',
      html: '<h1>Funcionou!</h1><p>E-mail de teste via <b>Nodemailer</b>.</p>'
    });

    console.log('📨 Enviado! messageId:', info.messageId);
    console.log('🧾 Resposta do servidor:', info.response);
  } catch (err) {
    console.error('❌ Falha ao enviar:', err && (err.stack || err.message || err));
    if (String(err).includes('self-signed certificate')) {
      console.error('👉 Diagnóstico: há interceptação TLS (antivírus/proxy) ou cadeia de certificados inválida.');
      console.error('   - Tente porta 465 (secure:true) se ainda não tentou.');
      console.error('   - Desative “HTTPS/SSL scanning” no antivírus ou adicione exceção para node.exe.');
      console.error('   - Para teste rápido, defina INSECURE_TEST_ONLY=true (NÃO em produção).');
    }
    if (String(err).includes('Username and Password not accepted')) {
      console.error('👉 Use SENHA DE APP (2FA ativo) e cole sem espaços.');
    }
  }
})();
