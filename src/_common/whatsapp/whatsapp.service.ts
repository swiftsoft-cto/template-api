import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as qrcode from 'qrcode-terminal';

export interface SendMessageOptions {
  phoneNumber: string; // Número no formato: 5511999999999 (código do país + DDD + número)
  text?: string;
  imagePath?: string; // Caminho local para a imagem
  imageUrl?: string; // URL da imagem (será baixada)
  caption?: string; // Legenda para a imagem
}

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);
  private client: Client | null = null;
  private isReady = false;
  private sessionPath: string;

  constructor(private config: ConfigService) {
    // Define o caminho para salvar a sessão
    const sessionDir = join(process.cwd(), '.wwebjs_auth');
    this.sessionPath = sessionDir;

    // Cria o diretório se não existir
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }
  }

  private get isWhatsAppEnabled(): boolean {
    const v = this.config.get<string>('WHATSAPP_ENABLED');
    if (v === undefined || v === '') return true;
    return /^(1|true|yes|on)$/i.test(v.trim());
  }

  async onModuleInit() {
    if (!this.isWhatsAppEnabled) {
      this.logger.log('WhatsApp desabilitado (WHATSAPP_ENABLED=false).');
      return;
    }
    await this.initializeClient();
  }

  private async initializeClient() {
    try {
      this.logger.log('Inicializando cliente WhatsApp...');

      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: this.sessionPath,
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
          ],
        },
      });

      // Evento: QR Code gerado
      this.client.on('qr', (qr) => {
        this.logger.log('QR Code gerado. Escaneie com o WhatsApp:');
        qrcode.generate(qr, { small: true });
      });

      // Evento: Autenticação realizada
      this.client.on('authenticated', () => {
        this.logger.log('Autenticação realizada com sucesso!');
      });

      // Evento: Autenticação falhou
      this.client.on('auth_failure', (msg) => {
        this.logger.error(`Falha na autenticação: ${msg}`);
        this.isReady = false;
      });

      // Evento: Cliente pronto
      this.client.on('ready', () => {
        this.logger.log('Cliente WhatsApp está pronto!');
        this.isReady = true;
      });

      // Evento: Cliente desconectado
      this.client.on('disconnected', (reason) => {
        this.logger.warn(`Cliente desconectado: ${reason}`);
        this.isReady = false;
      });

      // Evento: Erro
      this.client.on('error', (error) => {
        this.logger.error(`Erro no cliente WhatsApp: ${error.message}`);
      });

      // Inicializa o cliente
      await this.client.initialize();
    } catch (error) {
      this.logger.error(
        `Erro ao inicializar cliente WhatsApp: ${error?.message || error}`,
      );
      throw error;
    }
  }

  /**
   * Verifica se o cliente está pronto
   */
  private ensureReady(): void {
    if (!this.client || !this.isReady) {
      throw new Error(
        'Cliente WhatsApp não está pronto. Aguarde a inicialização.',
      );
    }
  }

  /**
   * Formata o número de telefone para o formato do WhatsApp
   * Remove caracteres especiais e garante formato: código do país + DDD + número
   */
  private formatPhoneNumber(phoneNumber: string): string {
    // Remove todos os caracteres não numéricos
    const cleaned = phoneNumber.replace(/\D/g, '');

    if (!cleaned || cleaned.length < 10) {
      throw new Error(`Número de telefone inválido: ${phoneNumber}`);
    }

    // Se não começar com código do país (55 para Brasil), adiciona
    if (!cleaned.startsWith('55') && cleaned.length === 11) {
      return `55${cleaned}`;
    }

    // Se já começa com 55, retorna como está
    if (cleaned.startsWith('55') && cleaned.length >= 12) {
      return cleaned;
    }

    // Se tem 10 ou 11 dígitos sem código do país, assume Brasil
    if (cleaned.length === 10 || cleaned.length === 11) {
      return `55${cleaned}`;
    }

    return cleaned;
  }

  /**
   * Tenta enviar mensagem, se falhar com "No LID", tenta sem o dígito 9
   */
  private async sendMessageWithRetry(
    phoneNumber: string,
    sendFn: (chatId: string) => Promise<void>,
  ): Promise<void> {
    const formattedNumber = this.formatPhoneNumber(phoneNumber);
    let chatId = `${formattedNumber}@c.us`;

    try {
      await sendFn(chatId);
      return;
    } catch (error: any) {
      // Se o erro for "No LID for user", tenta sem o dígito 9 (celular brasileiro)
      if (
        error?.message?.includes('No LID for user') ||
        error?.message?.includes('LID')
      ) {
        // Se o número tem 13 dígitos (55 + DDD(2) + 9 + número(8)), tenta remover o 9
        // Formato: 55 + DDD + 9 + número = 13 dígitos
        // Exemplo: 5541998702327 -> 554198702327 (remove o 9 na posição 4)
        if (formattedNumber.length === 13 && formattedNumber.startsWith('55')) {
          // Remove o dígito 9 após o DDD (posição 4, índice 4)
          const without9 =
            formattedNumber.slice(0, 4) + formattedNumber.slice(5);
          chatId = `${without9}@c.us`;
          this.logger.log(
            `Tentando novamente sem o dígito 9: ${without9} (original: ${formattedNumber})...`,
          );

          try {
            await sendFn(chatId);
            this.logger.log(
              `Mensagem enviada com sucesso para ${without9} (sem dígito 9)`,
            );
            return;
          } catch {
            // Se ainda falhar, lança erro informativo
            throw new Error(
              `Número ${formattedNumber} (e ${without9}) não encontrado no WhatsApp. Certifique-se de que o número está nos seus contatos do WhatsApp.`,
            );
          }
        }
        // Se não for número brasileiro de 13 dígitos, apenas lança o erro original
        throw new Error(
          `Número ${formattedNumber} não encontrado no WhatsApp. Certifique-se de que o número está nos seus contatos do WhatsApp.`,
        );
      }
      throw error;
    }
  }

  /**
   * Envia uma mensagem de texto
   */
  async sendText(phoneNumber: string, text: string): Promise<void> {
    this.ensureReady();

    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      this.logger.log(`Enviando mensagem de texto para ${formattedNumber}...`);

      await this.sendMessageWithRetry(phoneNumber, async (chatId) => {
        await this.client!.sendMessage(chatId, text);
      });

      this.logger.log(`Mensagem enviada com sucesso para ${formattedNumber}`);
    } catch (error) {
      this.logger.error(
        `Erro ao enviar mensagem de texto: ${error?.message || error}`,
      );
      throw error;
    }
  }

  /**
   * Envia uma imagem
   */
  async sendImage(
    phoneNumber: string,
    imagePath: string,
    caption?: string,
  ): Promise<void> {
    this.ensureReady();

    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);

      // Verifica se o arquivo existe
      if (!existsSync(imagePath)) {
        throw new Error(`Arquivo de imagem não encontrado: ${imagePath}`);
      }

      const media = MessageMedia.fromFilePath(imagePath);

      this.logger.log(`Enviando imagem para ${formattedNumber}...`);

      await this.sendMessageWithRetry(phoneNumber, async (chatId) => {
        await this.client!.sendMessage(chatId, media, { caption });
      });

      this.logger.log(`Imagem enviada com sucesso para ${formattedNumber}`);
    } catch (error) {
      this.logger.error(`Erro ao enviar imagem: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Baixa uma imagem de uma URL e envia
   */
  async sendImageFromUrl(
    phoneNumber: string,
    imageUrl: string,
    caption?: string,
  ): Promise<void> {
    this.ensureReady();

    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);

      this.logger.log(`Baixando imagem de ${imageUrl}...`);
      const media = await MessageMedia.fromUrl(imageUrl);

      this.logger.log(`Enviando imagem para ${formattedNumber}...`);

      await this.sendMessageWithRetry(phoneNumber, async (chatId) => {
        await this.client!.sendMessage(chatId, media, { caption });
      });

      this.logger.log(`Imagem enviada com sucesso para ${formattedNumber}`);
    } catch (error) {
      this.logger.error(
        `Erro ao enviar imagem de URL: ${error?.message || error}`,
      );
      throw error;
    }
  }

  /**
   * Envia mensagem com texto e/ou imagem
   * Método principal para uso em outros módulos
   */
  async sendMessage(options: SendMessageOptions): Promise<void> {
    this.ensureReady();

    const { phoneNumber, text, imagePath, imageUrl, caption } = options;

    try {
      // Se tiver imagem, envia a imagem (com caption se fornecido, senão usa text como caption)
      if (imagePath) {
        await this.sendImage(
          phoneNumber,
          imagePath,
          caption || text || undefined,
        );
      } else if (imageUrl) {
        await this.sendImageFromUrl(
          phoneNumber,
          imageUrl,
          caption || text || undefined,
        );
      } else if (text) {
        // Se não tiver imagem, envia apenas o texto
        await this.sendText(phoneNumber, text);
      }
      // Não envia texto separado se já foi enviado como caption da imagem
    } catch (error) {
      this.logger.error(`Erro ao enviar mensagem: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Verifica se o cliente está pronto
   */
  isClientReady(): boolean {
    return this.isReady;
  }

  /**
   * Desconecta o cliente
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      this.logger.log('Desconectando cliente WhatsApp...');
      await this.client.destroy();
      this.client = null;
      this.isReady = false;
    }
  }
}
