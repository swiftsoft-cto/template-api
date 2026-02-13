import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private mailer: MailerService) {}

  async sendLoginUnlockEmail(to: string, unlockUrl: string, blockUrl?: string) {
    this.logger.log(
      `[MAIL_SERVICE] Enviando email de login unlock para: ${to}`,
    );

    try {
      const result = await this.mailer.sendMail({
        to,
        subject: 'Verificação de tentativa de login',
        html: `
          <div style="font-family: Arial, sans-serif; line-height:1.5">
            <h2>Foi você que tentou acessar sua conta?</h2>
            <p>Detectamos várias tentativas de login com este e-mail.</p>
            <p>Confirme abaixo:</p>
            <p>
              <a href="${unlockUrl}" 
                 style="background:#2563eb;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;display:inline-block;margin-right:8px">
                 Sim, fui eu
              </a>
              ${
                blockUrl
                  ? `<a href="${blockUrl}" 
                       style="background:#ef4444;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;display:inline-block">
                       Não fui eu
                     </a>`
                  : ''
              }
            </p>
            <hr />
            <small>Estes links expiram em ${process.env.EMAIL_TOKEN_TTL || '15m'}.</small>
          </div>
        `,
      });

      this.logger.log(
        `[MAIL_SERVICE] Email de login unlock enviado com sucesso para: ${to}. MessageId: ${result.messageId}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `[MAIL_SERVICE] Erro ao enviar email de login unlock para ${to}:`,
        error,
      );
      throw error;
    }
  }

  // NOVO: e-mail de verificação
  async sendEmailVerificationEmail(to: string, verifyUrl: string) {
    this.logger.log(`[MAIL_SERVICE] Enviando email de verificação para: ${to}`);

    try {
      const result = await this.mailer.sendMail({
        to,
        subject: 'Confirme seu e-mail',
        html: `
          <div style="font-family: Arial, sans-serif; line-height:1.5">
            <h2>Confirme seu e-mail</h2>
            <p>Para terminar seu cadastro, confirme seu e-mail clicando no botão abaixo:</p>
            <p>
              <a href="${verifyUrl}"
                 style="background:#16a34a;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;display:inline-block">
                 Confirmar e-mail
               </a>
             </p>
             <hr />
             <small>Este link expira em ${process.env.EMAIL_TOKEN_TTL || '15m'}.</small>
           </div>
         `,
      });

      this.logger.log(
        `[MAIL_SERVICE] Email de verificação enviado com sucesso para: ${to}. MessageId: ${result.messageId}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `[MAIL_SERVICE] Erro ao enviar email de verificação para ${to}:`,
        error,
      );
      throw error;
    }
  }

  async sendNewDeviceApprovalEmail(
    to: string,
    approveUrl: string,
    blockUrl: string, // << NOVO
    ipInfo?: string,
    uaInfo?: string,
  ) {
    this.logger.log(
      `[MAIL_SERVICE] Enviando email de aprovação de novo dispositivo para: ${to}`,
    );
    this.logger.log(
      `[MAIL_SERVICE] Device info - IP: ${ipInfo}, UA: ${uaInfo}`,
    );

    try {
      const result = await this.mailer.sendMail({
        to,
        subject: 'Novo acesso detectado - confirme para continuar',
        html: `
          <div style="font-family: Arial, sans-serif; line-height:1.5">
            <h2>Novo dispositivo/IP tentando acessar sua conta</h2>
            <p>Detectamos um acesso a partir de um novo dispositivo ou rede.</p>
            ${ipInfo ? `<p><strong>IP (sub-rede):</strong> ${ipInfo}</p>` : ''}
            ${uaInfo ? `<p><strong>Dispositivo:</strong> ${uaInfo}</p>` : ''}
            <p>Isso foi você?</p>
            <p>
              <a href="${approveUrl}"
                 style="background:#0ea5e9;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;display:inline-block;margin-right:8px">
                 Sim, fui eu
              </a>
              <a href="${blockUrl}"
                 style="background:#ef4444;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;display:inline-block">
                 Não fui eu
              </a>
            </p>
            <hr />
            <small>Links expiram em ${process.env.EMAIL_TOKEN_TTL || '15m'}.</small>
          </div>
        `,
      });

      this.logger.log(
        `[MAIL_SERVICE] Email de aprovação de novo dispositivo enviado com sucesso para: ${to}. MessageId: ${result.messageId}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `[MAIL_SERVICE] Erro ao enviar email de aprovação de novo dispositivo para ${to}:`,
        error,
      );
      throw error;
    }
  }

  async sendPasswordResetEmail(to: string, resetUrl: string) {
    this.logger.log(
      `[MAIL_SERVICE] Enviando email de reset de senha para: ${to}`,
    );

    try {
      const result = await this.mailer.sendMail({
        to,
        subject: 'Redefinir sua senha',
        html: `
          <div style="font-family: Arial, sans-serif; line-height:1.5">
            <h2>Redefinição de senha</h2>
            <p>Recebemos um pedido para redefinir a sua senha.</p>
            <p>Se foi você, clique no botão abaixo para continuar:</p>
            <p>
              <a href="${resetUrl}"
                 style="background:#9333ea;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;display:inline-block">
                 Redefinir senha
               </a>
            </p>
            <p>Se você não solicitou, ignore este e-mail.</p>
            <hr />
            <small>Este link expira em ${process.env.PASSWORD_RESET_TTL || process.env.EMAIL_TOKEN_TTL || '15m'}.</small>
          </div>
        `,
      });

      this.logger.log(
        `[MAIL_SERVICE] Email de reset de senha enviado com sucesso para: ${to}. MessageId: ${result.messageId}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `[MAIL_SERVICE] Erro ao enviar email de reset de senha para ${to}:`,
        error,
      );
      throw error;
    }
  }
}
