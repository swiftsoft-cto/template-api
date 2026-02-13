import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { TranscriptionsService } from '../transcriptions/transcriptions.service';

export type MeetCaptionSegment = {
  speaker: string;
  text: string;
  imageUrl?: string;
  startTimeMs?: number;
};

type FetchMeetResult = {
  requestedUrl: string;
  finalUrl: string;
  clicked: boolean;
  clickSelector?: string | null;
  snippet: string | null;
  /** Indica que a reunião foi iniciada e o browser permanece aberto para capturar transcrição */
  meetingStarted?: boolean;
  message?: string;
  /** Segmentos iniciais de transcrição (imagem, nome, texto) no momento do retorno */
  segments?: MeetCaptionSegment[];
};

@Injectable()
export class MeetService {
  private readonly logger = new Logger(MeetService.name);

  constructor(
    @Inject(forwardRef(() => TranscriptionsService))
    private transcriptionsService: TranscriptionsService,
  ) {}

  private validateMeetUrl(raw: string): URL {
    let url: URL;

    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('URL inválida');
    }

    if (url.protocol !== 'https:') {
      throw new BadRequestException('A URL precisa ser HTTPS');
    }

    const meetOk =
      url.hostname === 'meet.google.com' &&
      /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(url.pathname);
    const workspaceOk =
      url.hostname === 'workspace.google.com' &&
      /^\/products\/meet/.test(url.pathname);
    if (!meetOk && !workspaceOk) {
      throw new BadRequestException(
        'Somente meet.google.com/xxx-xxxx-xxx ou workspace.google.com/products/meet são permitidos',
      );
    }

    return url;
  }

  private readonly WORKSPACE_MEET_URL =
    'https://workspace.google.com/products/meet/';

  /** Link "Abrir o app" na página do workspace Meet */
  private readonly ABRIR_APP_SELECTORS = [
    '::-p-text(Abrir o app)',
    'a[data-g-action="sign in"]',
    'a[href*="accounts.google.com/ServiceLogin"]',
    '//a[.//span[contains(., "Abrir o app")]]',
  ];

  /** User-Agent de Chrome real para evitar detecção pelo Google Meet como navegador incompatível */
  private readonly CHROME_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  /** Espera inicial após carregar a página. */
  private readonly MEET_INITIAL_DELAY_MS = 2_000;

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private resolveSelector(selector: string): string {
    return selector.startsWith('//') || selector.startsWith('(')
      ? `::-p-xpath(${selector})`
      : selector;
  }

  private async paintElement(
    el: Awaited<ReturnType<Page['$']>>,
  ): Promise<void> {
    if (el) {
      await el.evaluate((node) => {
        const el = node as HTMLElement;
        el.style.backgroundColor = '#ff6600';
        el.style.outline = '3px solid #ff6600';
      });
      await this.sleep(300);
    }
  }

  /** Input email na página accounts.google.com */
  private readonly GOOGLE_EMAIL_SELECTORS = [
    'input[type="email"]',
    'input[name="identifier"]',
    'input#identifierId',
  ];
  /** Input senha na página accounts.google.com */
  private readonly GOOGLE_PASSWORD_SELECTORS = [
    'input[type="password"]',
    'input[name="password"]',
    'input[type="password"][name="Passwd"]',
  ];
  /** Botão "Pedir para participar" ou "Participar agora" na sala do Meet */
  private readonly MEET_PEDIR_PARTICIPAR_SELECTORS = [
    '::-p-text(Participar agora)',
    '::-p-text(Pedir para participar)',
    '//button[contains(., "Participar agora")]',
    '//button[contains(., "Pedir para participar")]',
  ];
  /** Botão "Participar agora" em diálogo (pode aparecer após Pedir para participar) */
  private readonly MEET_PARTICIPAR_AGORA_DIALOG_SELECTORS = [
    'button[data-mdc-dialog-action="ok"]',
    '//button[@data-mdc-dialog-action="ok"]//span[contains(., "Participar agora")]/..',
  ];
  /** Botão "Negar o acesso ao microfone e à câmera" na sala do Meet */
  private readonly MEET_NEGAR_ACESSO_SELECTORS = [
    '::-p-text(Negar o acesso ao microfone e à câmera)',
    '//button[contains(., "Negar o acesso ao microfone e à câmera")]',
    'button[data-mdc-dialog-action="cancel"]',
  ];
  private readonly GOOGLE_AVANCAR_SELECTORS = [
    '::-p-text(Avançar)',
    '//button[.//span[contains(., "Avançar")]]',
    'button[jsname="LgbsSe"]',
  ];

  private async clickAbrirApp(
    page: Page,
    browser: Browser,
    userId: string,
  ): Promise<{ loginPage: Page | null }> {
    for (const selector of this.ABRIR_APP_SELECTORS) {
      try {
        const resolved = this.resolveSelector(selector);
        const el = await page.waitForSelector(resolved, {
          timeout: 15_000,
          visible: true,
        });
        if (el) {
          const popupPromise = Promise.race([
            browser.waitForTarget((t) =>
              t.url().includes('accounts.google.com'),
            ),
            this.sleep(10_000).then(() => null),
          ]);
          await this.paintElement(el);
          await el.click();
          this.logger.log(
            `[${userId}] Puppeteer: clique em "Abrir o app" realizado`,
          );
          const target = await popupPromise;
          const loginPage = target ? await target.page() : null;
          return { loginPage: loginPage ?? null };
        }
      } catch {
        this.logger.debug(
          `[${userId}] Puppeteer: seletor "${selector}" não encontrado, tentando próximo`,
        );
      }
    }
    return { loginPage: null };
  }

  private async fillGoogleLogin(page: Page, userId: string): Promise<boolean> {
    const email = process.env.EMAIL_MEET;
    if (!email) {
      this.logger.warn(
        `[${userId}] Puppeteer: EMAIL_MEET não configurado, pulando preenchimento`,
      );
      return false;
    }
    for (const selector of this.GOOGLE_EMAIL_SELECTORS) {
      try {
        const el = await page.waitForSelector(selector, {
          timeout: 15_000,
          visible: true,
        });
        if (el) {
          await this.paintElement(el);
          await el.click();
          await page.keyboard.type(email, { delay: 50 });
          this.logger.log(
            `[${userId}] Puppeteer: email preenchido com ${email}`,
          );
          await this.sleep(300);
          for (const btnSel of this.GOOGLE_AVANCAR_SELECTORS) {
            try {
              const resolved = this.resolveSelector(btnSel);
              const btn = await page.waitForSelector(resolved, {
                timeout: 5_000,
                visible: true,
              });
              if (btn) {
                await this.paintElement(btn);
                await btn.click();
                this.logger.log(
                  `[${userId}] Puppeteer: clique em "Avançar" realizado`,
                );
                await page
                  .waitForNetworkIdle({ idleTime: 1000 })
                  .catch(() => {});
                const passOk = await this.fillGooglePassword(page, userId);
                return passOk;
              }
            } catch {
              // próximo seletor
            }
          }
          return false;
        }
      } catch {
        // próximo seletor de email
      }
    }
    return false;
  }

  private async fillGooglePassword(
    page: Page,
    userId: string,
  ): Promise<boolean> {
    const password = process.env.PASS_MEET;
    if (!password) {
      this.logger.warn(
        `[${userId}] Puppeteer: PASS_MEET não configurado, pulando senha`,
      );
      return false;
    }
    for (const selector of this.GOOGLE_PASSWORD_SELECTORS) {
      try {
        const el = await page.waitForSelector(selector, {
          timeout: 15_000,
          visible: true,
        });
        if (el) {
          await this.paintElement(el);
          await el.click();
          await page.keyboard.type(password, { delay: 50 });
          this.logger.log(`[${userId}] Puppeteer: senha preenchida`);
          await this.sleep(300);
          for (const btnSel of this.GOOGLE_AVANCAR_SELECTORS) {
            try {
              const resolved = this.resolveSelector(btnSel);
              const btn = await page.waitForSelector(resolved, {
                timeout: 5_000,
                visible: true,
              });
              if (btn) {
                await this.paintElement(btn);
                await btn.click();
                this.logger.log(
                  `[${userId}] Puppeteer: clique em "Avançar" (senha) realizado`,
                );
                await page
                  .waitForNetworkIdle({ idleTime: 1000 })
                  .catch(() => {});
                return true;
              }
            } catch {
              // próximo seletor
            }
          }
          return false;
        }
      } catch {
        // próximo seletor de senha
      }
    }
    return false;
  }

  private async clickNegarAcesso(page: Page, userId: string): Promise<boolean> {
    for (const selector of this.MEET_NEGAR_ACESSO_SELECTORS) {
      try {
        const resolved = this.resolveSelector(selector);
        const el = await page.waitForSelector(resolved, {
          timeout: 5_000,
          visible: true,
        });
        if (el) {
          await this.paintElement(el);
          await el.click();
          this.logger.log(
            `[${userId}] Puppeteer: clique em "Negar o acesso ao microfone e à câmera" realizado`,
          );
          await page.waitForNetworkIdle({ idleTime: 1000 }).catch(() => {});
          return true;
        }
      } catch {
        this.logger.debug(
          `[${userId}] Puppeteer: seletor "${selector}" (Negar acesso) não encontrado`,
        );
      }
    }
    return false;
  }

  /** Botão "Mais opções" (3 pontinhos) no Meet */
  private readonly MEET_MAIS_OPCOES_SELECTORS = [
    'button[aria-label="Mais opções"]',
    'button[jsname="NakZHc"]',
  ];
  /** Aba "Legendas" nas configurações do Meet */
  private readonly MEET_LEGENDAS_TAB_SELECTORS = [
    'button[aria-label="Legendas"]',
    'button[jsname="z4Tpl"]',
  ];
  /** Combobox "Idioma da reunião" - clicar abre o dropdown */
  private readonly MEET_IDIOMA_COMBO_SELECTORS = [
    '::-p-aria(Idioma da reunião)',
    'div[jsname="oYxtQd"][role="combobox"]',
    'div[role="combobox"][aria-labelledby*="ucc"]',
    'div[role="combobox"][aria-controls]',
    'div[jsname="O1htCb"]',
  ];
  /** Opção "Português (Brasil)" no dropdown de idiomas (li role="option") */
  private readonly MEET_PT_BR_SELECTORS = [
    'li[role="option"][data-value="pt-BR"]',
    'li[role="option"][aria-label="Português (Brasil)"]',
    'li[data-value="pt-BR"]',
    'li[aria-label="Português (Brasil)"]',
    '::-p-aria(Português (Brasil))',
    '::-p-text(Português (Brasil))',
    '//li[@role="option" and .//span[contains(., "Português (Brasil)")]]',
  ];
  /** Botão fechar dialog */
  private readonly MEET_FECHAR_DIALOG_SELECTORS = [
    'button[aria-label="Fechar caixa de diálogo"]',
    'button[data-mdc-dialog-action="close"]',
  ];
  /** Opção "Configurações" no menu do Meet */
  private readonly MEET_CONFIGURACOES_SELECTORS = [
    '::-p-text(Configurações)',
    'li[jsname="dq27Te"]',
    '//li[.//span[contains(., "Configurações")]]',
  ];
  /** Botão "Ativar legendas" no Meet */
  private readonly MEET_LEGENDAS_SELECTORS = [
    'button[aria-label="Ativar legendas"]',
    'button[jsname="r8qRAd"]',
    '::-p-aria(Ativar legendas)',
  ];
  /** Painel "Pessoas" na sala do Meet (aparece após entrar) */
  private readonly MEET_PESSOAS_SELECTORS = [
    'div[jsname="nav9Xe"]',
    'div.ABWBsf[jsname="nav9Xe"]',
    '//div[@jsname="nav9Xe"]',
  ];
  private readonly MEET_PESSOAS_POLL_INTERVAL_MS = 1_500;
  private readonly MEET_PESSOAS_MAX_WAIT_MS = 120_000;

  /**
   * Alterna entre verificar botão "Participar agora" (diálogo) e painel "Pessoas".
   * O diálogo pode demorar ou não aparecer; às vezes o painel Pessoas surge direto.
   * Continua até clicar no painel Pessoas.
   */
  private async waitParticiparAgoraOrPessoas(
    page: Page,
    userId: string,
  ): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < this.MEET_PESSOAS_MAX_WAIT_MS) {
      // 1. Verificar se o botão "Participar agora" em diálogo apareceu
      for (const selector of this.MEET_PARTICIPAR_AGORA_DIALOG_SELECTORS) {
        try {
          const resolved = this.resolveSelector(selector);
          const el = await page.$(resolved);
          if (el) {
            const visible = await el.evaluate(
              (n) => (n as HTMLElement).offsetParent !== null,
            );
            if (visible) {
              await this.paintElement(el);
              await el.click();
              this.logger.log(
                `[${userId}] Puppeteer: clique em "Participar agora" (diálogo) realizado`,
              );
              await page.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
              await this.sleep(500);
              break;
            }
          }
        } catch {
          // próximo seletor
        }
      }

      // 2. Verificar se o painel Pessoas apareceu (ou apareceu direto)
      for (const selector of this.MEET_PESSOAS_SELECTORS) {
        try {
          const resolved = this.resolveSelector(selector);
          const el = await page.$(resolved);
          if (el) {
            const visible = await el.evaluate(
              (n) => (n as HTMLElement).offsetParent !== null,
            );
            if (visible) {
              await this.paintElement(el);
              await el.click();
              this.logger.log(
                `[${userId}] Puppeteer: clique em painel "Pessoas" realizado`,
              );
              await page.waitForNetworkIdle({ idleTime: 1000 }).catch(() => {});
              return true;
            }
          }
        } catch {
          // próximo seletor
        }
      }

      this.logger.debug(
        `[${userId}] Puppeteer: aguardando "Participar agora" ou painel "Pessoas" (${this.MEET_PESSOAS_POLL_INTERVAL_MS}ms)`,
      );
      await this.sleep(this.MEET_PESSOAS_POLL_INTERVAL_MS);
    }
    return false;
  }

  /** Container de legendas/transcrição no Meet */
  private readonly MEET_CAPTIONS_CONTAINER = 'div[jsname="dsyhDe"]';
  /** Itens de transcrição: div.nMcdL com speaker (span.NWpY1d) e texto (div.ygicle.VbkSUe) */
  private readonly MEET_CAPTION_ITEMS = 'div.nMcdL.bj4p3b';
  /** Intervalo de polling para verificar fim da reunião (1 pessoa = acabou) */
  private readonly MEET_END_POLL_INTERVAL_MS = 10_000;

  private async waitAndClickPessoas(
    page: Page,
    userId: string,
  ): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < this.MEET_PESSOAS_MAX_WAIT_MS) {
      for (const selector of this.MEET_PESSOAS_SELECTORS) {
        try {
          const resolved = this.resolveSelector(selector);
          const el = await page.$(resolved);
          if (el) {
            const visible = await el.evaluate(
              (n) => (n as HTMLElement).offsetParent !== null,
            );
            if (visible) {
              await this.paintElement(el);
              await el.click();
              this.logger.log(
                `[${userId}] Puppeteer: clique em painel "Pessoas" realizado`,
              );
              await page.waitForNetworkIdle({ idleTime: 1000 }).catch(() => {});
              return true;
            }
          }
        } catch {
          // próximo seletor
        }
      }
      this.logger.debug(
        `[${userId}] Puppeteer: painel "Pessoas" ainda não visível, aguardando ${this.MEET_PESSOAS_POLL_INTERVAL_MS}ms`,
      );
      await this.sleep(this.MEET_PESSOAS_POLL_INTERVAL_MS);
    }
    return false;
  }

  private async clickMaisOpcoes(page: Page, userId: string): Promise<boolean> {
    for (const selector of this.MEET_MAIS_OPCOES_SELECTORS) {
      try {
        const resolved = this.resolveSelector(selector);
        const el = await page.waitForSelector(resolved, {
          timeout: 3_000,
          visible: true,
        });
        if (el) {
          await this.paintElement(el);
          await el.click();
          this.logger.log(
            `[${userId}] Puppeteer: clique em "Mais opções" realizado`,
          );
          await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {});
          return true;
        }
      } catch {
        this.logger.debug(
          `[${userId}] Puppeteer: seletor "${selector}" (Mais opções) não encontrado`,
        );
      }
    }
    return false;
  }

  private async clickWithPaint(
    page: Page,
    selectors: string[],
    logMsg: string,
    userId: string,
    timeout = 4_000,
    options?: { scrollIntoView?: boolean },
  ): Promise<boolean> {
    for (const selector of selectors) {
      try {
        const resolved = this.resolveSelector(selector);
        const el = await page.waitForSelector(resolved, {
          timeout,
          visible: true,
        });
        if (el) {
          if (options?.scrollIntoView) {
            await el.evaluate((n) =>
              (n as HTMLElement).scrollIntoView({ block: 'center' }),
            );
            await this.sleep(200);
          }
          await this.paintElement(el);
          await el.click();
          this.logger.log(`[${userId}] Puppeteer: ${logMsg}`);
          await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {});
          return true;
        }
      } catch {
        // próximo seletor
      }
    }
    return false;
  }

  private async clickIdiomaCombo(page: Page, userId: string): Promise<boolean> {
    const maxWait = 10_000;
    const interval = 400;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      for (const selector of this.MEET_IDIOMA_COMBO_SELECTORS) {
        try {
          const resolved = this.resolveSelector(selector);
          const el = await page.$(resolved);
          if (el) {
            const box = await el.boundingBox();
            const visible =
              box && box.width > 0 && box.height > 0
                ? await el.evaluate(
                    (n) =>
                      (n as HTMLElement).offsetParent !== null &&
                      (n as HTMLElement).getBoundingClientRect().width > 0,
                  )
                : false;
            if (visible) {
              await this.paintElement(el);
              await el.click();
              this.logger.log(
                `[${userId}] Puppeteer: clique em "Idioma da reunião" realizado`,
              );
              await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {});
              return true;
            }
          }
        } catch {
          // próximo seletor
        }
      }
      this.logger.debug(
        `[${userId}] Puppeteer: combobox "Idioma da reunião" ainda não visível, aguardando ${interval}ms`,
      );
      await this.sleep(interval);
    }
    return false;
  }

  /**
   * Extrai segmentos de transcrição do HTML de legendas do Meet.
   */
  private async extractMeetCaptions(page: Page): Promise<MeetCaptionSegment[]> {
    try {
      const segments = await page.evaluate(
        ({ container, items }) => {
          const root = document.querySelector(container);
          if (!root) return [];
          const els = root.querySelectorAll(items);
          const out: Array<{
            speaker: string;
            text: string;
            imageUrl?: string;
            startTimeMs?: number;
          }> = [];
          els.forEach((el) => {
            const speakerEl = el.querySelector('span.NWpY1d');
            const textEl = el.querySelector('div.ygicle.VbkSUe');
            const imgEl = el.querySelector('img');
            const speaker = speakerEl?.textContent?.trim() ?? '';
            const text = textEl?.textContent?.trim() ?? '';
            if (!text) return;
            const imageUrl = imgEl?.getAttribute('src') ?? undefined;
            let startTimeMs: number | undefined;
            const iml = imgEl?.getAttribute('data-iml');
            if (iml) {
              const n = parseFloat(iml);
              if (!Number.isNaN(n)) startTimeMs = n;
            }
            out.push({ speaker, text, imageUrl, startTimeMs });
          });
          return out;
        },
        {
          container: this.MEET_CAPTIONS_CONTAINER,
          items: this.MEET_CAPTION_ITEMS,
        },
      );
      return segments;
    } catch {
      return [];
    }
  }

  /**
   * Conta quantas pessoas estão no painel Pessoas.
   * Lê o número do elemento div.MKVSQd (ex: "2" = 2 colaboradores).
   * Retorna 0 se não conseguir ler; 1 = só o usuário (reunião acabou).
   */
  private async getMeetPeopleCount(page: Page): Promise<number> {
    try {
      const count = await page.evaluate(() => {
        const countEl = document.querySelector('div.MKVSQd');
        if (countEl) {
          const txt = countEl.textContent?.trim() ?? '';
          const n = parseInt(txt, 10);
          if (!Number.isNaN(n) && n >= 0) return n;
        }
        return 0;
      });
      return typeof count === 'number' ? count : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Polling até a reunião acabar (1 pessoa), extrai transcrição e salva.
   */
  private async pollMeetUntilEnd(
    page: Page,
    browser: Browser,
    userId: string,
    meetUrl: string,
    meetCode: string,
  ): Promise<void> {
    const maxIterations = 8640;
    for (let i = 0; i < maxIterations; i++) {
      await this.sleep(this.MEET_END_POLL_INTERVAL_MS);
      try {
        const peopleCount = await this.getMeetPeopleCount(page);
        if (peopleCount === 1) {
          this.logger.log(
            `[${userId}] Meet: reunião encerrada (${peopleCount} pessoa). Extraindo transcrição.`,
          );
          const segments = await this.extractMeetCaptions(page);
          const title = `Meet ${meetCode}`;
          const sourceFileName = `meet-${meetCode}.html`;
          const created =
            await this.transcriptionsService.createFromMeetTranscription(
              userId,
              {
                title,
                sourceFileName,
                meetUrl,
                segments,
              },
            );
          this.logger.log(
            `[${userId}] Transcrição Meet salva: ${created.id} (${segments.length} segmentos)`,
          );
          break;
        }
      } catch (err: any) {
        this.logger.warn(
          `[${userId}] pollMeetUntilEnd erro: ${err?.message ?? err}`,
        );
      }
    }
    try {
      await browser.close();
    } catch (e) {
      this.logger.warn(`browser.close error: ${(e as Error)?.message}`);
    }
  }

  private async clickConfiguracoes(
    page: Page,
    userId: string,
  ): Promise<boolean> {
    for (const selector of this.MEET_CONFIGURACOES_SELECTORS) {
      try {
        const resolved = this.resolveSelector(selector);
        const el = await page.waitForSelector(resolved, {
          timeout: 3_000,
          visible: true,
        });
        if (el) {
          await this.paintElement(el);
          await el.click();
          this.logger.log(
            `[${userId}] Puppeteer: clique em "Configurações" realizado`,
          );
          await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {});
          return true;
        }
      } catch {
        this.logger.debug(
          `[${userId}] Puppeteer: seletor "${selector}" (Configurações) não encontrado`,
        );
      }
    }
    return false;
  }

  private async clickAtivarLegendas(
    page: Page,
    userId: string,
  ): Promise<boolean> {
    for (const selector of this.MEET_LEGENDAS_SELECTORS) {
      try {
        const resolved = this.resolveSelector(selector);
        const el = await page.waitForSelector(resolved, {
          timeout: 4_000,
          visible: true,
        });
        if (el) {
          await this.paintElement(el);
          await el.click();
          this.logger.log(
            `[${userId}] Puppeteer: clique em "Ativar legendas" realizado`,
          );
          await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {});
          return true;
        }
      } catch {
        this.logger.debug(
          `[${userId}] Puppeteer: seletor "${selector}" (Ativar legendas) não encontrado`,
        );
      }
    }
    return false;
  }

  private async clickPedirParticipar(
    page: Page,
    userId: string,
  ): Promise<boolean> {
    for (const selector of this.MEET_PEDIR_PARTICIPAR_SELECTORS) {
      try {
        const resolved = this.resolveSelector(selector);
        const el = await page.waitForSelector(resolved, {
          timeout: 5_000,
          visible: true,
        });
        if (el) {
          await this.paintElement(el);
          await el.click();
          this.logger.log(
            `[${userId}] Puppeteer: clique em "Participar agora" / "Pedir para participar" realizado`,
          );
          await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {});
          return true;
        }
      } catch {
        this.logger.debug(
          `[${userId}] Puppeteer: seletor "${selector}" (Pedir para participar) não encontrado`,
        );
      }
    }
    return false;
  }

  async fetchMeetPage(
    userId: string,
    rawUrl: string,
    opts?: {
      clickSelector?: string | null;
      headless?: boolean;
      keepOpen?: boolean;
    },
  ): Promise<FetchMeetResult> {
    const timeoutMs = 30_000;
    const useCustomSelector = !!opts?.clickSelector?.trim();
    const navUrl = useCustomSelector
      ? this.validateMeetUrl(rawUrl)
      : new URL(this.WORKSPACE_MEET_URL);
    const headless =
      opts?.headless ??
      !(
        process.env.PUPPETEER_HEADLESS === 'false' ||
        process.env.PUPPETEER_HEADLESS === '0'
      );
    let browser: Browser | undefined;
    let meetingStarted = false;

    try {
      this.logger.log(
        `[${userId}] Puppeteer: abrindo URL (headless=${headless}): ${navUrl.toString()}`,
      );

      const launchOpts: Parameters<typeof puppeteer.launch>[0] = {
        headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
        ],
      };

      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }

      browser = await puppeteer.launch(launchOpts);
      const page = await browser.newPage();

      await page.setDefaultNavigationTimeout(timeoutMs);
      await page.setUserAgent(this.CHROME_UA);

      await page.goto(navUrl.toString(), {
        waitUntil: 'networkidle2',
      });

      await this.sleep(this.MEET_INITIAL_DELAY_MS);
      let currentPage = page;
      let finalUrl = page.url();
      let clicked = false;
      let usedSelector: string | null = null;

      if (useCustomSelector) {
        const clickSelector = opts!.clickSelector!.trim();
        const resolved = this.resolveSelector(clickSelector);
        const el = await page.$(resolved);
        if (el) {
          await el.click();
          clicked = true;
          usedSelector = clickSelector;
        }
      } else {
        const { loginPage } = await this.clickAbrirApp(page, browser, userId);
        if (loginPage) {
          clicked = true;
          usedSelector = 'Abrir o app';
          const loginOk = await this.fillGoogleLogin(loginPage, userId);
          if (loginOk) {
            usedSelector = 'Abrir o app + login';
            await loginPage
              .waitForFunction(
                () =>
                  /myaccount\.google\.com|meet\.google\.com/.test(
                    window.location.href,
                  ),
                { timeout: 15_000 },
              )
              .catch(() => {});
            try {
              const meetUrl = this.validateMeetUrl(rawUrl);
              await loginPage.goto(meetUrl.toString(), {
                waitUntil: 'networkidle2',
              });
              currentPage = loginPage;
              finalUrl = loginPage.url();
              this.logger.log(
                `[${userId}] Puppeteer: redirecionado para Meet ${meetUrl.toString()}`,
              );
              await this.sleep(1_500);
              const negarOk = await this.clickNegarAcesso(loginPage, userId);
              if (negarOk) {
                usedSelector = 'Abrir o app + login + Negar acesso';
                await this.sleep(1_000);
                const pedirOk = await this.clickPedirParticipar(
                  loginPage,
                  userId,
                );
                if (pedirOk) {
                  usedSelector =
                    'Abrir o app + login + Negar + Pedir para participar';
                  await this.sleep(1_000);
                  const pessoasOk = await this.waitParticiparAgoraOrPessoas(
                    loginPage,
                    userId,
                  );
                  if (pessoasOk) {
                    usedSelector =
                      'Abrir o app + login + Negar + Pedir + Pessoas';
                    await this.sleep(500);
                    const legendasOk = await this.clickAtivarLegendas(
                      loginPage,
                      userId,
                    );
                    if (legendasOk) {
                      usedSelector =
                        'Abrir o app + login + Negar + Pedir + Pessoas + Legendas';
                      await this.sleep(300);
                      const maisOk = await this.clickMaisOpcoes(
                        loginPage,
                        userId,
                      );
                      if (maisOk) {
                        await this.sleep(300);
                        const configOk = await this.clickConfiguracoes(
                          loginPage,
                          userId,
                        );
                        if (configOk) {
                          usedSelector =
                            'Abrir o app + login + Negar + Pedir + Pessoas + Legendas + Config';
                          await this.sleep(300);
                          const tabOk = await this.clickWithPaint(
                            loginPage,
                            this.MEET_LEGENDAS_TAB_SELECTORS,
                            'clique em aba "Legendas" realizado',
                            userId,
                          );
                          if (tabOk) {
                            await this.sleep(500);
                            const comboOk = await this.clickIdiomaCombo(
                              loginPage,
                              userId,
                            );
                            if (comboOk) {
                              await this.sleep(400);
                              await loginPage.keyboard.type('por');
                              await this.sleep(200);
                              await loginPage.keyboard.press('Enter');
                              const ptOk = true;
                              if (ptOk) {
                                await this.sleep(200);
                                await this.clickWithPaint(
                                  loginPage,
                                  this.MEET_FECHAR_DIALOG_SELECTORS,
                                  'clique em "Fechar" realizado',
                                  userId,
                                );
                                meetingStarted = true;
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            } catch {
              this.logger.debug(
                `[${userId}] Puppeteer: url da request não é Meet válido, pulando navegação`,
              );
            }
          }
        }
      }

      if (meetingStarted && opts?.keepOpen) {
        const meetMatch = finalUrl.match(
          /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i,
        );
        const meetCode = meetMatch?.[1] ?? 'meet';
        const segments = await this.extractMeetCaptions(currentPage);
        void this.pollMeetUntilEnd(
          currentPage,
          browser,
          userId,
          finalUrl,
          meetCode,
        ).catch((e) =>
          this.logger.error(
            `[${userId}] pollMeetUntilEnd falhou: ${(e as Error)?.message}`,
          ),
        );
        return {
          requestedUrl: rawUrl,
          finalUrl,
          clicked,
          clickSelector: usedSelector || null,
          snippet: null,
          meetingStarted: true,
          message:
            'Reunião iniciada. A transcrição será salva automaticamente ao final.',
          segments: segments.length > 0 ? segments : undefined,
        };
      }

      const body = await currentPage.content();
      const snippet = body
        ? body.replace(/\s+/g, ' ').trim().slice(0, 1200)
        : null;

      return {
        requestedUrl: rawUrl,
        finalUrl,
        clicked,
        clickSelector: usedSelector || null,
        snippet,
      };
    } catch (err: any) {
      const msg = String(err?.message ?? err);

      if (msg.includes('Timeout') || msg.includes('timeout')) {
        throw new BadRequestException('Timeout ao acessar a URL do Meet');
      }

      this.logger.warn(`fetchMeetPage error: ${msg}`);
      throw new BadRequestException(`Falha ao acessar a URL: ${msg}`);
    } finally {
      if (browser) {
        if (meetingStarted && opts?.keepOpen) {
          this.logger.log(
            `[${userId}] Puppeteer: reunião iniciada, browser mantido aberto para capturar transcrição`,
          );
        } else if (opts?.keepOpen) {
          browser.disconnect();
          this.logger.log(
            `[${userId}] Puppeteer: keepOpen=true, aba mantida aberta`,
          );
        } else {
          await browser.close().catch((e) => {
            this.logger.warn(`browser.close error: ${e?.message ?? e}`);
          });
        }
      }
    }
  }
}
