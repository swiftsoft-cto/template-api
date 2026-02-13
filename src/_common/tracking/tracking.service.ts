import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../../administration/users/user.entity';

export interface TrackingData {
  projectId: string;
  projectName: string;
  customerName: string;
  scopeName?: string; // Nome do escopo (quando disponível)
  contractTitle?: string; // Título do contrato (quando disponível)
  badge?: string; // "INTERNO" ou outro
  currentStage:
    | 'projeto'
    | 'escopo'
    | 'escopo-finalizado'
    | 'contrato'
    | 'contrato-finalizado'
    | 'contrato-assinado';
  projectCreatedAt?: Date;
  scopeCreatedAt?: Date;
  scopeFinalizedAt?: Date;
  contractCreatedAt?: Date;
  contractFinalizedAt?: Date;
  contractSignedAt?: Date;
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);
  private readonly tempDir: string;
  private readonly pendingSends = new Set<string>(); // Evita envios duplicados simultâneos

  constructor(
    private readonly whatsappService: WhatsAppService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    this.tempDir = join(process.cwd(), 'temp', 'tracking');
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Formata data para exibição
   */
  private formatDate(date?: Date): string {
    if (!date) return '';
    return format(date, "d 'de' MMM, HH:mm", { locale: ptBR });
  }

  /**
   * Gera o HTML do tracking baseado nos dados
   */
  private generateTrackingHTML(data: TrackingData): string {
    const items: any[] = [];

    // Item: Projeto
    items.push({
      id: 'projeto',
      kind: 'stage',
      title: 'Projeto',
      desc: `Projeto "${data.projectName}" criado para o cliente ${data.customerName}.`,
      date: this.formatDate(data.projectCreatedAt),
    });

    // Item: Escopo
    const scopeChildren: any[] = [];
    if (data.scopeCreatedAt) {
      scopeChildren.push({
        id: 'escopo-1',
        kind: 'log',
        desc: data.scopeName
          ? `Escopo "${data.scopeName}" em análise técnica.`
          : 'Escopo em análise técnica.',
        date: this.formatDate(data.scopeCreatedAt),
      });
    }
    if (data.scopeFinalizedAt) {
      scopeChildren.push({
        id: 'escopo-2',
        kind: 'log',
        desc: data.scopeName
          ? `Escopo "${data.scopeName}" finalizado e aprovado internamente.`
          : 'Escopo finalizado e aprovado internamente.',
        date: this.formatDate(data.scopeFinalizedAt),
      });
    }

    items.push({
      id: 'escopo',
      kind: 'stage',
      title: 'Escopo',
      desc:
        scopeChildren.length > 0
          ? data.scopeName
            ? `Escopo "${data.scopeName}" em andamento.`
            : 'Escopo em andamento.'
          : 'Aguardando criação do escopo.',
      date: '',
      children: scopeChildren.length > 0 ? scopeChildren : undefined,
    });

    // Item: Contrato
    const contractChildren: any[] = [];
    if (data.contractCreatedAt) {
      contractChildren.push({
        id: 'contrato-1',
        kind: 'log',
        desc: data.contractTitle
          ? `Contrato "${data.contractTitle}" criado.`
          : 'Contrato criado.',
        date: this.formatDate(data.contractCreatedAt),
      });
    }
    if (data.contractFinalizedAt) {
      contractChildren.push({
        id: 'contrato-2',
        kind: 'log',
        desc: data.contractTitle
          ? `Contrato "${data.contractTitle}" finalizado (revisado).`
          : 'Contrato finalizado (revisado).',
        date: this.formatDate(data.contractFinalizedAt),
      });
    }
    if (data.contractSignedAt) {
      contractChildren.push({
        id: 'contrato-3',
        kind: 'log',
        desc: data.contractTitle
          ? `Contrato "${data.contractTitle}" assinado.`
          : 'Contrato assinado.',
        date: this.formatDate(data.contractSignedAt),
      });
    }

    items.push({
      id: 'contrato',
      kind: 'stage',
      title: 'Contrato',
      desc:
        contractChildren.length > 0
          ? data.contractTitle
            ? `Contrato "${data.contractTitle}".`
            : 'Fluxo de contrato.'
          : 'Aguardando criação do contrato.',
      date: '',
      children: contractChildren.length > 0 ? contractChildren : undefined,
    });

    // ETA
    items.push({
      id: 'eta',
      kind: 'eta',
      desc: this.getEtaMessage(data.currentStage),
    });

    // Determina o currentId baseado no estágio atual
    let currentId = 'projeto';
    if (data.currentStage === 'escopo') {
      currentId = 'escopo-1';
    } else if (data.currentStage === 'escopo-finalizado') {
      currentId = 'escopo-2';
    } else if (data.currentStage === 'contrato') {
      currentId = 'contrato-1';
    } else if (data.currentStage === 'contrato-finalizado') {
      currentId = 'contrato-2';
    } else if (data.currentStage === 'contrato-assinado') {
      currentId = 'contrato-3';
    }

    // Monta o título dinamicamente baseado no estágio atual
    let title = `${data.projectName} • ${data.customerName}`;

    // Se estiver na etapa de escopo ou mais avançado, inclui o nome do escopo
    if (
      data.scopeName &&
      (data.currentStage === 'escopo' ||
        data.currentStage === 'escopo-finalizado' ||
        data.currentStage === 'contrato' ||
        data.currentStage === 'contrato-finalizado' ||
        data.currentStage === 'contrato-assinado')
    ) {
      title = `${data.projectName} • ${data.scopeName} • ${data.customerName}`;
    }

    // Se já tiver contrato, inclui o título do contrato
    if (
      data.contractTitle &&
      (data.currentStage === 'contrato' ||
        data.currentStage === 'contrato-finalizado' ||
        data.currentStage === 'contrato-assinado')
    ) {
      // Se tiver escopo, inclui escopo também
      if (data.scopeName) {
        title = `${data.projectName} • ${data.scopeName} • ${data.contractTitle} • ${data.customerName}`;
      } else {
        title = `${data.projectName} • ${data.contractTitle} • ${data.customerName}`;
      }
    }

    const trackingData = {
      title,
      badge: data.badge || 'INTERNO',
      currentId,
      items,
    };

    return this.getHTMLTemplate(trackingData);
  }

  /**
   * Retorna mensagem ETA baseada no estágio atual
   */
  private getEtaMessage(stage: TrackingData['currentStage']): string {
    switch (stage) {
      case 'projeto':
        return 'Aguardando criação do escopo';
      case 'escopo':
        return 'Aguardando finalização do escopo';
      case 'escopo-finalizado':
        return 'Aguardando criação do contrato';
      case 'contrato':
        return 'Aguardando finalização do contrato';
      case 'contrato-finalizado':
        return 'Aguardando assinatura do contrato';
      case 'contrato-assinado':
        return 'Processo concluído';
      default:
        return 'Aguardando próxima atualização';
    }
  }

  /**
   * Template HTML completo
   */
  private getHTMLTemplate(data: any): string {
    return `<!doctype html>
<html lang="pt-br">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tracking</title>
    <style>
        :root {
            --bg: #f3f4f6;
            --card: #ffffff;
            --title: #222;
            --text: #6f6f6f;
            --muted: #b9b9b9;
            --muted-2: #cfcfcf;
            --primary: #2fa86f;
            --primary-dark: #159a61;
            --line-gray: #d9d9d9;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            background: var(--bg);
            font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, Arial;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            display: flex;
            justify-content: center;
            padding: 24px 12px;
        }

        .card {
            width: 380px;
            background: var(--card);
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, .06);
            padding: 14px 14px 10px 14px;
        }

        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 2px 2px 10px 2px;
        }

        .header .h-title {
            font-size: 18px;
            font-weight: 700;
            color: var(--title);
            letter-spacing: .1px;
        }

        .badge {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            font-weight: 800;
            color: var(--primary-dark);
            letter-spacing: .2px;
            white-space: nowrap;
        }

        .badge svg {
            width: 14px;
            height: 14px;
            fill: var(--primary-dark);
        }

        .timeline {
            position: relative;
            padding: 6px 6px 8px 44px;
        }

        .line {
            position: absolute;
            left: 18px;
            width: 3px;
            border-radius: 999px;
            background: var(--line-gray);
        }

        .line--progress {
            background: var(--primary);
        }

        .marker {
            position: absolute;
            left: 19px;
            transform: translate(-50%, 0);
            z-index: 3;
        }

        .marker--start {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--primary);
        }

        .marker--current {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #fff;
            border: 2px solid var(--primary);
            box-shadow: 0 0 0 4px #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
        }

        .marker--current span {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--primary-dark);
        }

        .marker--end {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #fff;
            border: 2px solid var(--line-gray);
        }

        .item {
            margin: 0 0 18px 0;
        }

        .item .i-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--muted);
            margin-bottom: 6px;
        }

        .item .i-desc {
            font-size: 13.5px;
            line-height: 1.45;
            color: var(--text);
            margin-bottom: 6px;
            max-width: 280px;
        }

        .item .i-date {
            font-size: 12px;
            color: var(--muted);
        }

        .item--current .i-title {
            color: var(--primary-dark);
            font-weight: 800;
        }

        .item--log .i-title {
            display: none;
        }

        .item--log .i-desc {
            color: #767676;
            margin-bottom: 6px;
        }

        .item--eta {
            margin-top: 2px;
            margin-bottom: 6px;
        }

        .item--eta .i-title {
            display: none;
        }

        .item--eta .i-desc {
            font-size: 18px;
            font-weight: 600;
            color: var(--muted-2);
            line-height: 1.2;
            margin: 0;
            max-width: 320px;
        }

        .item--eta .i-date {
            display: none;
        }

        .item--subcurrent .i-desc {
            color: #4f4f4f;
        }

        .item--subcurrent .i-date {
            color: #9b9b9b;
        }
    </style>
</head>
<body>
    <div class="card" id="card"></div>
    <script>
        const data = ${JSON.stringify(data)};

        const card = document.getElementById("card");

        card.innerHTML = \`
            <div class="header">
                <div class="h-title">\${escapeHtml(data.title)}</div>
                <div class="badge" aria-label="badge">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M13 2L3 14h7l-1 8 12-14h-7l-1-6z"></path>
                    </svg>
                    <span>\${escapeHtml(data.badge || "")}</span>
                </div>
            </div>
            <div class="timeline" id="timeline">
                <div class="line line--base" id="lineBase"></div>
                <div class="line line--progress" id="lineProgress"></div>
                <div class="marker marker--start" id="mStart"></div>
                <div class="marker marker--current" id="mCurrent"><span></span></div>
                <div class="marker marker--end" id="mEnd"></div>
                <div id="items"></div>
            </div>
        \`;

        const timeline = document.getElementById("timeline");
        const itemsEl = document.getElementById("items");

        const idx = buildIndex(data.items);
        const markerId = idx.parentByChild.get(data.currentId) || data.currentId;
        const progressTargetId = data.currentId;

        for (const parent of data.items) {
            renderItem(parent, { role: "parent" });
            if (Array.isArray(parent.children)) {
                for (const child of parent.children) {
                    renderItem(child, { role: "child", parentId: parent.id });
                }
            }
        }

        function renderItem(it, ctx) {
            const isEta = it.kind === "eta";
            const isLog = it.kind === "log";
            const isMarker = (ctx.role === "parent" && it.id === markerId);
            const isProgressTarget = (it.id === progressTargetId);

            const cls = isEta ? "item item--eta" : isLog ? "item item--log" : "item";
            const node = document.createElement("div");
            node.className = cls + (isMarker ? " item--current" : "") + (isProgressTarget && ctx.role === "child" ? " item--subcurrent" : "");
            node.dataset.id = it.id;
            if (ctx.parentId) node.dataset.parentId = ctx.parentId;

            const titleHtml = it.title && !isLog && !isEta ? \`<div class="i-title">\${escapeHtml(it.title)}</div>\` : "";
            const descHtml = it.desc ? \`<div class="i-desc">\${escapeHtml(it.desc)}</div>\` : "";
            const dateHtml = it.date ? \`<div class="i-date">\${escapeHtml(it.date)}</div>\` : "";

            node.innerHTML = \`\${titleHtml}\${descHtml}\${dateHtml}\`;
            itemsEl.appendChild(node);
        }

        function position() {
            const lineBase = document.getElementById("lineBase");
            const lineProgress = document.getElementById("lineProgress");
            const mStart = document.getElementById("mStart");
            const mCurrent = document.getElementById("mCurrent");
            const mEnd = document.getElementById("mEnd");

            const flatIds = flattenIds(data.items);
            if (!flatIds.length) return;

            const startEl = timeline.querySelector(\`[data-id="\${cssEscape(flatIds[0])}"]\`);
            const markerEl = timeline.querySelector(\`[data-id="\${cssEscape(markerId)}"]\`);
            const targetEl = timeline.querySelector(\`[data-id="\${cssEscape(progressTargetId)}"]\`) || markerEl;
            const endEl = timeline.querySelector(\`[data-id="\${cssEscape(flatIds[flatIds.length - 1])}"]\`);

            if (!startEl || !markerEl || !targetEl || !endEl) return;

            const yStart = anchorY(timeline, startEl);
            const yMarker = anchorY(timeline, markerEl);
            const yTarget = anchorY(timeline, targetEl);
            const yEnd = anchorY(timeline, endEl) + 14;

            lineBase.style.top = yStart + "px";
            lineBase.style.height = Math.max(0, (yEnd - yStart)) + "px";

            const progressEnd = Math.min(yEnd - 28, yTarget + 22);
            lineProgress.style.top = yStart + "px";
            lineProgress.style.height = Math.max(0, (progressEnd - yStart)) + "px";

            mStart.style.top = (yStart - 2) + "px";
            mCurrent.style.top = (yMarker - 7) + "px";
            mEnd.style.top = (yEnd - 6) + "px";
        }

        function anchorY(container, itemEl) {
            const c = container.getBoundingClientRect();
            const title = itemEl.querySelector(".i-title");
            const desc = itemEl.querySelector(".i-desc");
            const pick = (title && title.getClientRects().length) ? title : (desc && desc.getClientRects().length) ? desc : itemEl;
            const r = pick.getBoundingClientRect();
            return (r.top - c.top) + 2;
        }

        function buildIndex(items) {
            const parentByChild = new Map();
            for (const p of items) {
                if (Array.isArray(p.children)) {
                    for (const ch of p.children) parentByChild.set(ch.id, p.id);
                }
            }
            return { parentByChild };
        }

        function flattenIds(items) {
            const out = [];
            for (const p of items) {
                out.push(p.id);
                if (Array.isArray(p.children)) {
                    for (const ch of p.children) out.push(ch.id);
                }
            }
            return out;
        }

        function escapeHtml(str) {
            return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
        }
        function cssEscape(s) {
            return String(s).replace(/"/g, '\\\\"');
        }

        position();
        setTimeout(position, 50);
        setTimeout(position, 250);
    </script>
</body>
</html>`;
  }

  /**
   * Gera screenshot do HTML usando Puppeteer
   */
  private async generateScreenshot(html: string): Promise<string> {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Aguarda um pouco para garantir que o JavaScript executou
      await new Promise((resolve) => setTimeout(resolve, 500));

      const screenshotPath = join(this.tempDir, `tracking-${Date.now()}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        type: 'png',
      });

      return screenshotPath;
    } finally {
      await browser.close();
    }
  }

  /**
   * Envia tracking por WhatsApp
   */
  async sendTrackingByWhatsApp(
    phoneNumber: string,
    data: TrackingData,
    caption?: string,
  ): Promise<void> {
    // Criar chave única para evitar envios duplicados simultâneos
    const sendKey = `${phoneNumber}-${data.projectId}-${data.currentStage}`;

    // Se já está enviando para este telefone/projeto/estágio, ignora
    if (this.pendingSends.has(sendKey)) {
      this.logger.debug(`Envio duplicado ignorado: ${sendKey}`);
      return;
    }

    this.pendingSends.add(sendKey);

    try {
      this.logger.log(
        `Gerando tracking HTML para projeto ${data.projectId}...`,
      );

      // Gera o HTML
      const html = this.generateTrackingHTML(data);

      // Gera screenshot
      this.logger.log('Gerando screenshot do tracking...');
      const screenshotPath = await this.generateScreenshot(html);

      try {
        // Envia por WhatsApp
        await this.whatsappService.sendMessage({
          phoneNumber,
          imagePath: screenshotPath,
          caption: caption || `Status do projeto "${data.projectName}"`,
        });

        this.logger.log(`Tracking enviado com sucesso para ${phoneNumber}`);
      } finally {
        // Remove arquivo temporário
        if (existsSync(screenshotPath)) {
          unlinkSync(screenshotPath);
        }
        // Remove da lista de envios pendentes
        this.pendingSends.delete(sendKey);
      }
    } catch (error) {
      this.pendingSends.delete(sendKey);
      this.logger.error(
        `Erro ao enviar tracking por WhatsApp: ${error?.message || error}`,
      );
      throw error;
    }
  }

  /**
   * Envia tracking para múltiplos usuários por seus IDs
   * Remove duplicatas automaticamente usando Set
   */
  async sendTrackingToUsers(
    userIds: string[],
    data: TrackingData,
    caption?: string,
  ): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    try {
      // Remove duplicatas usando Set
      const uniqueUserIds = Array.from(new Set(userIds));

      this.logger.debug(
        `Enviando tracking para ${uniqueUserIds.length} usuários únicos (projeto: ${data.projectId})`,
      );

      // Buscar usuários com telefone
      const users = await this.userRepo.find({
        where: uniqueUserIds.map((id) => ({ id })),
        select: { id: true, phone: true },
      });

      // Filtrar apenas usuários com telefone válido
      const usersWithPhone = users.filter(
        (u) => u.phone && u.phone.trim().length > 0,
      );

      if (usersWithPhone.length === 0) {
        this.logger.warn(
          `Nenhum usuário com telefone encontrado para enviar tracking`,
        );
        return;
      }

      // Remover duplicatas de telefone (mesmo telefone = uma única mensagem)
      const phoneMap = new Map<string, User>();
      usersWithPhone.forEach((user) => {
        const phone = user.phone!.trim();
        if (!phoneMap.has(phone)) {
          phoneMap.set(phone, user);
        }
      });

      const uniquePhones = Array.from(phoneMap.values());

      // Enviar para cada telefone único (evita duplicação)
      const promises = uniquePhones.map((user) =>
        this.sendTrackingByWhatsApp(user.phone!, data, caption).catch(
          (error) => {
            this.logger.error(
              `Erro ao enviar tracking para usuário ${user.id}: ${error?.message || error}`,
            );
          },
        ),
      );

      await Promise.all(promises);
    } catch (error) {
      this.logger.error(
        `Erro ao enviar tracking para usuários: ${error?.message || error}`,
      );
    }
  }
}
