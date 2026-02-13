import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LevelFormat,
  LineRuleType,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TableLayoutType,
  TextRun,
  TextWrappingType,
  UnderlineType,
  VerticalAlign,
  VerticalPositionAlign,
  VerticalPositionRelativeFrom,
  WidthType,
} from 'docx';
import { JSDOM } from 'jsdom';
import * as path from 'node:path';
import * as fs from 'node:fs';
import axios from 'axios';
import sharp from 'sharp';

type InheritedRunStyle = {
  font?: string;
  sizeHalfPt?: number; // docx usa half-points
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  color?: string;
};

export class HtmlDocxConverter {
  private static DEFAULT_FONT = 'Arial';
  private static DEFAULT_SIZE_PT = 9;

  // Constantes para lista
  private static OL_REF = 'ol-default';
  private static MAX_LIST_LEVEL = 8;

  /**
   * Garante número finito (evita NaN/Infinity que pode corromper o DOCX).
   * Aceita strings tipo "595.3", "595.3pt", " 70 " etc (parseFloat).
   */
  private static safeNumber(input: unknown, fallback: number = 0): number {
    const s = String(input ?? '').trim();
    if (!s) return fallback;
    const n = parseFloat(s.replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }

  // ---------- utils de unidade ----------
  private static ptToTwip(pt: number) {
    return Math.round(pt * 20);
  }
  private static ptToPx(pt: number) {
    return Math.round(pt * (96 / 72)); // 1pt = 1/72in; 96dpi
  }

  /**
   * Converte pontos para tamanho de borda OOXML (eighths of a point).
   * No Word/DOCX, o atributo w:sz das bordas é medido em 1/8 de ponto.
   * Ex: 0.75pt = 0.75 × 8 = 6 eighths
   */
  private static ptToBorderSz(pt: number): number {
    // OOXML: border size = 1/8 pt
    return Math.max(0, Math.round(pt * 8));
  }

  private static cmToTwip(cm: number) {
    // 1cm = 28.3464567 pt; 1pt = 20 twips
    return Math.round(cm * 28.3464567 * 20);
  }

  private static cmToEmu(cm: number) {
    // 1 inch = 2.54cm; 1 inch = 914400 EMUs
    return Math.round((cm / 2.54) * 914400);
  }

  private static cmToPx(cm: number) {
    // 1in = 2.54cm; 96px = 1in
    return Math.round((cm / 2.54) * 96);
  }

  private static parseCss(styleStr?: string | null): Record<string, string> {
    const out: Record<string, string> = {};
    const s = (styleStr || '').trim();
    if (!s) return out;
    for (const part of s.split(';')) {
      const [k, ...rest] = part.split(':');
      if (!k || rest.length === 0) continue;
      const key = k.trim().toLowerCase();
      const val = rest.join(':').trim();
      if (key) out[key] = val;
    }
    return out;
  }

  private static parseBoxToPt(
    css: Record<string, string>,
    base: 'margin' | 'padding',
  ): {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
    hasAny: boolean;
  } {
    const hasAny =
      css[base] != null ||
      css[`${base}-top`] != null ||
      css[`${base}-right`] != null ||
      css[`${base}-bottom`] != null ||
      css[`${base}-left`] != null;

    let top = this.parseCssSizeToPt(css[`${base}-top`]);
    let right = this.parseCssSizeToPt(css[`${base}-right`]);
    let bottom = this.parseCssSizeToPt(css[`${base}-bottom`]);
    let left = this.parseCssSizeToPt(css[`${base}-left`]);

    if (
      (top == null || right == null || bottom == null || left == null) &&
      css[base]
    ) {
      const parts = css[base]
        .trim()
        .split(/\s+/)
        .map((p) => this.parseCssSizeToPt(p) ?? 0);

      if (parts.length === 1) {
        top = right = bottom = left = parts[0];
      } else if (parts.length === 2) {
        top = bottom = parts[0];
        right = left = parts[1];
      } else if (parts.length === 3) {
        top = parts[0];
        right = left = parts[1];
        bottom = parts[2];
      } else if (parts.length >= 4) {
        top = parts[0];
        right = parts[1];
        bottom = parts[2];
        left = parts[3];
      }
    }

    return { top, right, bottom, left, hasAny };
  }

  private static getInheritedRunStyle(el: HTMLElement): InheritedRunStyle {
    const chain: HTMLElement[] = [];
    let p = el.parentElement;
    while (p) {
      chain.unshift(p);
      p = p.parentElement;
    }
    let acc: InheritedRunStyle | undefined = undefined;
    for (const anc of chain) {
      acc = this.extractRunStyle(anc, acc);
    }
    return acc ?? {};
  }

  private static mapVerticalAlign(
    val?: string | null,
  ): (typeof VerticalAlign)[keyof typeof VerticalAlign] | undefined {
    const v = (val || '').toLowerCase().trim();
    if (v === 'top') return VerticalAlign.TOP;
    if (v === 'middle' || v === 'center') return VerticalAlign.CENTER;
    if (v === 'bottom') return VerticalAlign.BOTTOM;
    return undefined;
  }

  private static parsePercent(val: string): number | undefined {
    const m = val.match(/(\d+(?:\.\d+)?)%/);
    if (!m) return undefined;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) ? n : undefined;
  }

  private static parseCssNumber(val?: string): number | undefined {
    if (!val) return undefined;
    const m = val.match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : undefined;
  }

  private static parseCssSizeToPt(val?: string): number | undefined {
    if (!val) return undefined;
    const n = this.parseCssNumber(val);
    if (n == null) return undefined;

    const lower = val.toLowerCase().trim();
    if (lower.endsWith('pt')) return n;
    if (lower.endsWith('px')) return n * 0.75; // 96px = 72pt
    if (lower.endsWith('rem')) return n * 12; // fallback (se aparecer)
    if (lower.endsWith('em')) return n * this.DEFAULT_SIZE_PT;
    // se vier só número, não assume pt aqui
    return undefined;
  }

  /**
   * Extrai o tamanho da borda do CSS.
   * Suporta: border-width, border (shorthand), border-top/bottom/left/right
   */
  private static parseBorderWidth(
    css: Record<string, string>,
  ): number | undefined {
    // Tenta border-width primeiro (mais específico)
    if (css['border-width']) {
      return this.parseCssSizeToPt(css['border-width']);
    }

    // Tenta border (shorthand: "0.75pt solid #000")
    if (css['border']) {
      const borderValue = css['border'].trim();
      // Se contém "none" ou "0", não tem borda
      if (borderValue.includes('none') || borderValue === '0') {
        return 0;
      }
      // Extrai o primeiro valor (tamanho) do shorthand
      const parts = borderValue.split(/\s+/);
      for (const part of parts) {
        const size = this.parseCssSizeToPt(part);
        if (size != null) {
          return size;
        }
      }
    }

    // Tenta bordas individuais (border-top, border-right, etc.)
    const individualBorders = [
      'border-top',
      'border-right',
      'border-bottom',
      'border-left',
    ];
    for (const borderProp of individualBorders) {
      if (css[borderProp]) {
        const borderValue = css[borderProp].trim();
        if (borderValue.includes('none') || borderValue === '0') {
          continue;
        }
        const parts = borderValue.split(/\s+/);
        for (const part of parts) {
          const size = this.parseCssSizeToPt(part);
          if (size != null) {
            return size;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Converte cor CSS para formato hex do docx (sem #).
   * Suporta: #RRGGBB, #RGB, rgb(r,g,b), e nomes de cores comuns.
   */
  private static parseCssColorToHex(val?: string): string | undefined {
    if (!val) return undefined;
    const trimmed = val.trim().toLowerCase();

    // Hex com #: #RRGGBB ou #RGB
    const hexMatch = trimmed.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
    if (hexMatch) {
      const hex = hexMatch[1];
      // Se for formato curto (#RGB), expande para #RRGGBB
      if (hex.length === 3) {
        return hex
          .split('')
          .map((c) => c + c)
          .join('');
      }
      return hex;
    }

    // rgb(r, g, b) ou rgba(r, g, b, a)
    const rgbMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      const r = Number(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = Number(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = Number(rgbMatch[3]).toString(16).padStart(2, '0');
      return r + g + b;
    }

    // Nomes de cores comuns
    const colorMap: Record<string, string> = {
      yellow: 'ffff00',
      red: 'ff0000',
      green: '008000',
      blue: '0000ff',
      black: '000000',
      white: 'ffffff',
      gray: '808080',
      grey: '808080',
      orange: 'ffa500',
      purple: '800080',
      pink: 'ffc0cb',
      cyan: '00ffff',
      magenta: 'ff00ff',
      lime: '00ff00',
      maroon: '800000',
      navy: '000080',
      olive: '808000',
      teal: '008080',
      silver: 'c0c0c0',
      aqua: '00ffff',
      fuchsia: 'ff00ff',
    };

    return colorMap[trimmed] || undefined;
  }

  // ---------- imagem ----------
  private static async downloadFromStorage(
    fileId: string,
  ): Promise<Buffer | null> {
    const baseURL = process.env.STORAGE_BASE_URL;
    const apiKey = process.env.STORAGE_API_KEY;

    if (!fileId || !baseURL || !apiKey) return null;

    try {
      const res = await axios.get(`/files/${fileId}/stream`, {
        baseURL,
        headers: { 'x-api-key': apiKey },
        responseType: 'arraybuffer',
        timeout: 15000,
        validateStatus: () => true,
      });

      if (res.status >= 400) return null;

      const data: any = res.data;
      return Buffer.isBuffer(data) ? data : Buffer.from(data);
    } catch {
      return null;
    }
  }

  /**
   * Converte SVG para PNG usando sharp com opacidade aplicada
   * @param svgPath Caminho do arquivo SVG
   * @param opacity Opacidade (0.0 a 1.0), onde 1.0 = totalmente opaco, 0.1 = 90% transparente
   */
  private static async convertSvgToPng(
    svgPath: string,
    opacity: number = 1.0,
  ): Promise<Buffer | null> {
    try {
      if (!fs.existsSync(svgPath)) return null;
      const svgBuffer = fs.readFileSync(svgPath);

      // Converte SVG para PNG
      let image = sharp(svgBuffer).png().ensureAlpha();

      // Se precisar aplicar opacidade, processa o buffer de pixels
      if (opacity < 1.0) {
        const { data, info } = await image
          .raw()
          .ensureAlpha()
          .toBuffer({ resolveWithObject: true });
        const { width, height, channels } = info;

        // Multiplica o canal alpha (índice 3 de cada pixel) pela opacidade
        for (let i = 3; i < data.length; i += channels) {
          data[i] = Math.round(data[i] * opacity);
        }

        // Cria nova imagem com alpha modificado
        image = sharp(data, { raw: { width, height, channels } }).png();
      }

      return await image.toBuffer();
    } catch (error) {
      console.error('Erro ao converter SVG para PNG:', error);
      // Fallback: converte sem aplicar opacidade
      try {
        const svgBuffer = fs.readFileSync(svgPath);
        return await sharp(svgBuffer).png().toBuffer();
      } catch {
        return null;
      }
    }
  }

  private static async buildImageBuffer(src: string): Promise<Buffer | null> {
    if (!src) return null;

    // Data URI
    if (/^data:/.test(src)) {
      const match = src.match(/^data:[^;]+;base64,(.+)$/);
      if (match?.[1]) {
        try {
          return Buffer.from(match[1], 'base64');
        } catch {
          return null;
        }
      }
    }

    // URL http(s)
    if (/^https?:\/\//.test(src)) {
      try {
        const response = await axios.get(src, {
          responseType: 'arraybuffer',
          timeout: 15000,
        });
        return Buffer.from(response.data);
      } catch {
        return null;
      }
    }

    // Caminhos relativos de assets (ex.: /ai/topic-specifics/{id}/assets/{fileId})
    const assetMatch = src.match(
      /\/ai\/topic-specifics\/[^/]+\/assets\/([^/?#]+)/i,
    );
    if (assetMatch?.[1]) {
      const buf = await this.downloadFromStorage(assetMatch[1]);
      if (buf) return buf;
    }

    // paths locais
    const candidates = [
      src,
      path.resolve(process.cwd(), src),
      path.resolve(process.cwd(), src.replace(/^\/+/, '')),
      path.resolve(
        process.cwd(),
        'public',
        src.replace(/^\/public\//, '').replace(/^\/+/, ''),
      ),
    ];

    for (const p of candidates) {
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile())
          return fs.readFileSync(p);
      } catch {}
    }

    return null;
  }

  /**
   * Obtém dimensões (px) declaradas no elemento IMG (width/height ou style).
   * Se não houver valor, retorna undefined.
   */
  private static getImgDeclaredSizePx(imgEl: HTMLImageElement): {
    widthPx?: number;
    heightPx?: number;
  } {
    const css = this.parseCss(imgEl.getAttribute('style'));

    const widthPt =
      this.parseCssSizeToPt(css['width']) ||
      this.parseCssSizeToPt(imgEl.getAttribute('width') || undefined);
    const heightPt =
      this.parseCssSizeToPt(css['height']) ||
      this.parseCssSizeToPt(imgEl.getAttribute('height') || undefined);

    return {
      widthPx: widthPt != null ? this.ptToPx(widthPt) : undefined,
      heightPx: heightPt != null ? this.ptToPx(heightPt) : undefined,
    };
  }

  // ---------- estilos de RUN ----------
  private static extractRunStyle(
    el: HTMLElement,
    inherited?: InheritedRunStyle,
  ): InheritedRunStyle {
    const css = this.parseCss(el.getAttribute('style'));
    const tag = el.tagName.toLowerCase();

    const fontFamily = css['font-family'];
    const font = fontFamily
      ? fontFamily
          .split(',')[0]
          .trim()
          .replace(/^['"]|['"]$/g, '')
      : inherited?.font || this.DEFAULT_FONT;

    const fontSizePt = this.parseCssSizeToPt(css['font-size']);
    const sizeHalfPt = fontSizePt
      ? Math.round(fontSizePt * 2)
      : (inherited?.sizeHalfPt ?? Math.round(this.DEFAULT_SIZE_PT * 2));

    const bold =
      tag === 'b' ||
      tag === 'strong' ||
      tag === 'th' || // ✅ <th> deve ser bold por padrão
      /bold|700|800|900/i.test(css['font-weight'] || '') ||
      inherited?.bold;

    const italics =
      tag === 'i' ||
      tag === 'em' ||
      /italic/i.test(css['font-style'] || '') ||
      inherited?.italics;

    const underline =
      tag === 'u' ||
      /underline/i.test(css['text-decoration'] || '') ||
      inherited?.underline;

    const colorMatch = (css['color'] || '').match(
      /#?([0-9a-f]{3}|[0-9a-f]{6})/i,
    );
    const color = colorMatch ? colorMatch[1] : inherited?.color;

    return { font, sizeHalfPt, bold, italics, underline, color };
  }

  private static normalizeText(text: string) {
    // não "trimar" tudo (isso cola palavras). Só normaliza NBSP e múltiplos espaços.
    return text.replace(/\u00A0/g, ' ').replace(/[ \t]+/g, ' ');
  }

  private static nodeToRuns(
    node: Node,
    inherited?: InheritedRunStyle,
  ): TextRun[] {
    const runs: TextRun[] = [];

    if (node.nodeType === 3) {
      const raw = node.textContent ?? '';
      const text = this.normalizeText(raw);
      if (text.length) {
        runs.push(
          new TextRun({
            text,
            font: inherited?.font || this.DEFAULT_FONT,
            size: inherited?.sizeHalfPt ?? Math.round(this.DEFAULT_SIZE_PT * 2),
            bold: inherited?.bold,
            italics: inherited?.italics,
            underline: inherited?.underline
              ? { type: UnderlineType.SINGLE }
              : undefined,
            color: inherited?.color,
          }),
        );
      }
      return runs;
    }

    if (node.nodeType !== 1) return runs;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      runs.push(new TextRun({ break: 1 }));
      return runs;
    }

    // ✅ CRÍTICO: listas são tratadas separadamente, não aqui
    if (tag === 'ol' || tag === 'ul') return runs;

    // ignora lixo do CKEditor
    if (tag === 'svg' || tag === 'path') return runs;
    if (el.classList.contains('ck-widget__type-around')) return runs;
    if (el.classList.contains('ck-widget__resizer')) return runs;

    const merged = this.extractRunStyle(el, inherited);

    // links (opcional) — aqui só mantém texto por simplicidade
    if (tag === 'a') {
      for (const child of Array.from(el.childNodes))
        runs.push(...this.nodeToRuns(child, merged));
      return runs;
    }

    // inline comuns
    for (const child of Array.from(el.childNodes)) {
      runs.push(...this.nodeToRuns(child, merged));
    }

    return runs;
  }

  // ---------- helpers de alinhamento ----------
  private static mapTextAlignToDocx(
    val?: string | null,
  ): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
    const a = (val || '')
      .toLowerCase()
      .replace(/!important/g, '')
      .trim();

    if (!a) return undefined;

    if (a === 'center') return AlignmentType.CENTER;
    if (a === 'right' || a === 'end') return AlignmentType.RIGHT;
    if (a === 'justify' || a === 'both') return AlignmentType.JUSTIFIED;
    if (a === 'left' || a === 'start') return AlignmentType.LEFT;

    return undefined;
  }

  private static resolveParagraphAlignment(
    el: HTMLElement,
  ): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
    // 1) inline style já parseado pelo browser/jsdom
    const inline = this.mapTextAlignToDocx((el as any).style?.textAlign);
    if (inline) return inline;

    // 2) style=""
    const css = this.parseCss(el.getAttribute('style'));
    const fromStyleAttr = this.mapTextAlignToDocx(css['text-align']);
    if (fromStyleAttr) return fromStyleAttr;

    // 3) atributo align=""
    const fromAlignAttr = this.mapTextAlignToDocx(el.getAttribute('align'));
    if (fromAlignAttr) return fromAlignAttr;

    // 4) classes comuns (CKEditor / utilitários)
    if (
      el.classList.contains('text-align-center') ||
      el.classList.contains('ck-align-center')
    ) {
      return AlignmentType.CENTER;
    }
    if (
      el.classList.contains('text-align-right') ||
      el.classList.contains('ck-align-right')
    ) {
      return AlignmentType.RIGHT;
    }
    if (
      el.classList.contains('text-align-justify') ||
      el.classList.contains('ck-align-justify')
    ) {
      return AlignmentType.JUSTIFIED;
    }

    // 5) herança: text-align é herdável — sobe nos pais
    let p = el.parentElement;
    while (p) {
      const pInline = this.mapTextAlignToDocx((p as any).style?.textAlign);
      if (pInline) return pInline;

      const pCss = this.parseCss(p.getAttribute('style'));
      const pFromStyle = this.mapTextAlignToDocx(pCss['text-align']);
      if (pFromStyle) return pFromStyle;

      p = p.parentElement;
    }

    return undefined; // deixa cair no padrão do documento, se você quiser
  }

  // ---------- helper para extrair line-height ----------
  private static extractLineHeightSpacing(
    el: HTMLElement,
    useDefault: boolean = true,
  ): any {
    const spacing: any = {};
    const css = this.parseCss(el.getAttribute('style'));
    const lineHeightRaw = (css['line-height'] || '').trim();

    if (lineHeightRaw) {
      const asPt = this.parseCssSizeToPt(lineHeightRaw);
      if (asPt != null) {
        spacing.line = this.ptToTwip(asPt);
        spacing.lineRule = LineRuleType.EXACT;
      } else {
        const unitless = this.parseCssNumber(lineHeightRaw);
        if (unitless != null && unitless > 0) {
          spacing.line = Math.round(240 * unitless);
          spacing.lineRule = LineRuleType.AUTO;
        }
      }
    } else if (useDefault) {
      // Aplica line-height padrão 1.15 quando não há line-height definido
      spacing.line = Math.round(240 * 1.15); // 1.15 * 240 = 276
      spacing.lineRule = LineRuleType.AUTO;
    }

    return spacing;
  }

  // ---------- estilos de PARÁGRAFO ----------
  private static paragraphFromP(
    pEl: HTMLElement,
    inheritedRun?: InheritedRunStyle,
  ): Paragraph {
    const css = this.parseCss(pEl.getAttribute('style'));
    const alignment = this.resolveParagraphAlignment(pEl) ?? AlignmentType.LEFT;

    // ✅ margin-top/bottom => spacing before/after
    const m = this.parseBoxToPt(css, 'margin');
    const spacing: any = {};

    // extrai line-height do próprio elemento ou herda do pai
    const lineHeightSpacing = this.extractLineHeightSpacing(pEl, true);
    if (Object.keys(lineHeightSpacing).length > 0) {
      Object.assign(spacing, lineHeightSpacing);
    } else {
      // tenta herdar line-height do pai (útil para td com line-height)
      let parent = pEl.parentElement;
      while (parent && !Object.keys(spacing).length) {
        const parentLineHeight = this.extractLineHeightSpacing(parent, false);
        if (Object.keys(parentLineHeight).length > 0) {
          Object.assign(spacing, parentLineHeight);
          break;
        }
        parent = parent.parentElement;
      }
      // Se não encontrou nenhum line-height nos pais, aplica o padrão 1.15
      if (!Object.keys(spacing).length) {
        spacing.line = Math.round(240 * 1.15);
        spacing.lineRule = LineRuleType.AUTO;
      }
    }

    // se o HTML explicitou margin (mesmo 0), aplica
    if (m.hasAny) {
      spacing.before = this.ptToTwip(m.top ?? 0);
      spacing.after = this.ptToTwip(m.bottom ?? 0);
    }

    const textIndentPt = this.parseCssSizeToPt(css['text-indent']);
    const marginLeftPt = this.parseCssSizeToPt(css['margin-left']);

    const inherited = inheritedRun ?? this.getInheritedRunStyle(pEl);
    const merged = this.extractRunStyle(pEl, inherited);
    const runs = this.nodeToRuns(pEl, merged);

    // p vazio do CKEditor (<br data-cke-filler>)
    const hasRealText = runs.length > 0;

    // Extrai background-color e aplica shading
    const backgroundColor = this.parseCssColorToHex(css['background-color']);
    const shading = backgroundColor
      ? {
          type: ShadingType.SOLID,
          color: backgroundColor,
        }
      : undefined;

    return new Paragraph({
      alignment,
      indent: {
        left: marginLeftPt != null ? this.ptToTwip(marginLeftPt) : undefined,
        firstLine:
          textIndentPt != null ? this.ptToTwip(textIndentPt) : undefined,
      },
      spacing: Object.keys(spacing).length ? spacing : undefined,
      shading,
      children: hasRealText && runs.length ? runs : [new TextRun(' ')],
    });
  }

  private static paragraphFromHeading(hEl: HTMLElement): Paragraph {
    const tag = hEl.tagName.toLowerCase();
    const n = Number(tag.replace('h', ''));
    const heading =
      n === 1
        ? HeadingLevel.HEADING_1
        : n === 2
          ? HeadingLevel.HEADING_2
          : n === 3
            ? HeadingLevel.HEADING_3
            : n === 4
              ? HeadingLevel.HEADING_4
              : n === 5
                ? HeadingLevel.HEADING_5
                : HeadingLevel.HEADING_6;

    const alignment = this.resolveParagraphAlignment(hEl) ?? AlignmentType.LEFT;

    const runs = this.nodeToRuns(hEl, this.extractRunStyle(hEl));
    return new Paragraph({
      heading,
      alignment,
      children: runs.length ? runs : [new TextRun(' ')],
    });
  }

  // ---------- Helper: extrai apenas o conteúdo "inline" do LI (ignorando sublistas) ----------
  private static liInlineRuns(
    li: HTMLLIElement,
    inherited?: InheritedRunStyle,
  ): TextRun[] {
    const liStyle = this.extractRunStyle(li as any, inherited);
    const runs: TextRun[] = [];

    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === 1) {
        const cEl = child as HTMLElement;
        const t = cEl.tagName.toLowerCase();
        if (t === 'ol' || t === 'ul') continue; // ✅ não mistura texto de sublista
      }
      runs.push(...this.nodeToRuns(child, liStyle));
    }

    return runs;
  }

  // ---------- Helper: converte OL/UL recursivamente (sem duplicar, com níveis) ----------
  private static listToParagraphs(
    listEl: HTMLElement,
    level = 0,
    inherited?: InheritedRunStyle,
  ): Paragraph[] {
    const tag = listEl.tagName.toLowerCase();
    const isOrdered = tag === 'ol';
    const lvl = Math.max(0, Math.min(this.MAX_LIST_LEVEL, level));

    const out: Paragraph[] = [];
    const liEls = Array.from(
      listEl.querySelectorAll(':scope > li'),
    ) as HTMLLIElement[];

    const listSpacing = this.extractLineHeightSpacing(listEl, true);

    for (const li of liEls) {
      const runs = this.liInlineRuns(li, inherited);

      const pCfg: any = {
        alignment: this.resolveParagraphAlignment(li) ?? AlignmentType.LEFT,
        spacing: Object.keys(listSpacing).length ? listSpacing : undefined,
        children: runs.length ? runs : [new TextRun(' ')],
      };

      if (isOrdered) {
        pCfg.numbering = { reference: this.OL_REF, level: lvl };
        // indent/hanging vem da definição de numbering (no Document)
      } else {
        pCfg.bullet = { level: lvl };
        pCfg.indent = {
          left: this.ptToTwip(18 * (lvl + 1)),
          hanging: this.ptToTwip(9),
        };
      }

      out.push(new Paragraph(pCfg));

      // sublistas diretas do item -> nível + 1
      const nested = Array.from(
        li.querySelectorAll(':scope > ol, :scope > ul'),
      ) as HTMLElement[];
      for (const nl of nested) {
        out.push(
          ...this.listToParagraphs(
            nl,
            lvl + 1,
            this.extractRunStyle(li as any, inherited),
          ),
        );
      }
    }

    return out;
  }

  // ---------- processa conteúdo de célula de tabela ----------
  private static processTableCellContent(cellEl: HTMLElement): Paragraph[] {
    const inherited = this.extractRunStyle(
      cellEl,
      this.getInheritedRunStyle(cellEl),
    );
    const out: Paragraph[] = [];

    // Importante: <td> pode ter conteúdo "inline" solto (ex.: <strong>Label:</strong> texto).
    // Se criarmos um parágrafo por nó, isso vira "quebra de linha" indesejada.
    // Então agrupamos nós inline em um único parágrafo e só "flush" quando encontrar blocos reais.
    const currentRuns: TextRun[] = [];
    const flush = () => {
      if (!currentRuns.length) return;
      out.push(
        new Paragraph({
          alignment:
            this.resolveParagraphAlignment(cellEl) ?? AlignmentType.LEFT,
          spacing: this.extractLineHeightSpacing(cellEl, true),
          children: currentRuns.splice(0, currentRuns.length),
        }),
      );
    };

    // percorre os filhos diretos pra manter ordem (p / ol / ul / texto / inline)
    for (const child of Array.from(cellEl.childNodes)) {
      if (child.nodeType === 3) {
        const txt = this.normalizeText(child.textContent ?? '');
        // ignora apenas whitespace/indentação do HTML
        if (!txt.trim()) continue;
        currentRuns.push(...this.nodeToRuns(child, inherited));
        continue;
      }

      if (child.nodeType !== 1) continue;
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (tag === 'p') {
        flush();
        out.push(this.paragraphFromP(el, inherited));
        continue;
      }

      if (tag === 'ol' || tag === 'ul') {
        flush();
        out.push(...this.listToParagraphs(el, 0, inherited));
        continue;
      }

      // blocos genéricos (div/section) — processa recursivamente mantendo a mesma regra
      if (tag === 'div' || tag === 'section') {
        flush();
        out.push(...this.processTableCellContent(el));
        continue;
      }

      // inline genéricos (strong, span, etc.): agrega no parágrafo corrente
      currentRuns.push(...this.nodeToRuns(el, inherited));
    }

    flush();

    if (!out.length) {
      const runs = this.nodeToRuns(cellEl, inherited);
      out.push(
        new Paragraph({ children: runs.length ? runs : [new TextRun(' ')] }),
      );
    }

    return out;
  }

  // ---------- tabela simples (signature-table) ----------
  private static tableFromHtml(
    tableEl: HTMLTableElement,
    contentWidthTwip: number,
  ): Table {
    const rows: TableRow[] = [];

    // ✅ pega thead/tbody/tfoot diretos (em ordem) e suporta múltiplos tbodies
    const trEls = Array.from(
      tableEl.querySelectorAll(
        ':scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr',
      ),
    ) as HTMLTableRowElement[];

    // Se não tem thead/tbody/tfoot, pega todas as tr diretas
    if (trEls.length === 0) {
      trEls.push(...Array.from(tableEl.querySelectorAll('tr')));
    }

    // Verifica se é uma tabela de assinatura (sem bordas)
    const isSignatureTable =
      tableEl.classList.contains('signature-table') ||
      (tableEl.getAttribute('style') || '').includes('border: none');

    // Processa colgroup para larguras (será usado para gerar columnWidths)
    const colgroup = tableEl.querySelector('colgroup');

    // Detecta tamanho da borda da tabela (pega da primeira célula que tiver borda)
    // Usa 0.75pt como padrão (valor comum para bordas de tabela)
    let tableBorderSize = 0.75; // padrão
    for (const tr of trEls) {
      const firstCell = tr.querySelector('td, th');
      if (firstCell) {
        const cellCss = this.parseCss(firstCell.getAttribute('style'));
        const detectedBorder = this.parseBorderWidth(cellCss);
        if (detectedBorder != null && detectedBorder > 0) {
          tableBorderSize = detectedBorder;
          break;
        }
      }
    }

    // Garante que não seja maior que 0.75pt (evita bordas muito grossas)
    if (tableBorderSize > 0.75) {
      tableBorderSize = 0.75;
    }

    for (const tr of trEls) {
      const tds = Array.from(tr.querySelectorAll('td, th'));
      const cells: TableCell[] = [];

      for (const td of tds) {
        const cellCss = this.parseCss(td.getAttribute('style'));

        // Processa conteúdo da célula (pode ter parágrafos, listas, etc.)
        const cellParagraphs = this.processTableCellContent(td as HTMLElement);

        // Extrai padding da célula
        const paddingTop = this.parseCssSizeToPt(cellCss['padding-top']) ?? 4;
        const paddingRight =
          this.parseCssSizeToPt(cellCss['padding-right']) ?? 4;
        const paddingBottom =
          this.parseCssSizeToPt(cellCss['padding-bottom']) ?? 4;
        const paddingLeft = this.parseCssSizeToPt(cellCss['padding-left']) ?? 4;

        // Extrai colspan e rowspan
        const colspan = this.safeNumber(td.getAttribute('colspan'), 1);

        const cellConfig: any = {
          children: cellParagraphs,
          columnSpan:
            colspan > 1 ? Math.max(1, Math.round(colspan)) : undefined,
          // Nota: docx pode não suportar rowSpan diretamente, então removemos por enquanto
          // rowSpan: rowspan > 1 ? Math.max(1, Math.round(rowspan)) : undefined,
          margins: {
            top: this.ptToTwip(paddingTop),
            right: this.ptToTwip(paddingRight),
            bottom: this.ptToTwip(paddingBottom),
            left: this.ptToTwip(paddingLeft),
          },
        };

        // Aplica vertical-align do HTML no DOCX
        const vAlign = this.mapVerticalAlign(cellCss['vertical-align']);
        if (vAlign) {
          cellConfig.verticalAlign = vAlign;
        }

        // border-top:none em célula
        const bt = (cellCss['border-top'] || '').toLowerCase();
        if (bt.includes('none')) {
          cellConfig.borders = {
            ...(cellConfig.borders || {}),
            top: { style: BorderStyle.NONE, size: 0 },
          };
        }

        // Não aplica bordas nas células individuais
        // As bordas serão aplicadas na tabela para evitar duplicação
        if (isSignatureTable) {
          cellConfig.borders = {
            top: { size: 0, style: BorderStyle.NONE },
            bottom: { size: 0, style: BorderStyle.NONE },
            left: { size: 0, style: BorderStyle.NONE },
            right: { size: 0, style: BorderStyle.NONE },
          };
        }

        cells.push(new TableCell(cellConfig));
      }

      rows.push(new TableRow({ children: cells }));
    }

    // Calcula largura da tabela em twips
    const tableCss = this.parseCss(tableEl.getAttribute('style'));
    const widthStr = (
      tableCss['width'] ||
      tableEl.getAttribute('width') ||
      ''
    ).trim();

    let tableWidthTwip = contentWidthTwip;

    // width: 100% / xx%
    const pct = this.parsePercent(widthStr);
    if (pct != null) {
      // Usa Math.round para evitar desalinhamento de subpixels
      tableWidthTwip = Math.round(contentWidthTwip * (pct / 100));
    } else {
      // width em pt/px
      const wPt = this.parseCssSizeToPt(widthStr);
      if (wPt != null) {
        tableWidthTwip = this.ptToTwip(wPt);
      }
    }

    // clamp (não deixa maior que a área útil) e garante valor inteiro
    tableWidthTwip = Math.max(
      1,
      Math.min(contentWidthTwip, Math.round(tableWidthTwip)),
    );

    // Reduz 1px (15 twips) da largura para evitar que a borda direita ultrapasse o layout
    // 1px ≈ 0.75pt ≈ 15 twips (assumindo 96 DPI: 1px = 72/96pt = 0.75pt = 15 twips)
    // Aplica a redução ANTES de calcular as colunas para garantir que seja efetiva
    const onePxInTwips = 15;
    if (tableWidthTwip > onePxInTwips) {
      tableWidthTwip = tableWidthTwip - onePxInTwips;
    }

    // colgroup -> porcentagens
    let gridTwips: number[] | undefined;

    if (colgroup) {
      const cols = Array.from(colgroup.querySelectorAll('col'));
      const percents: number[] = [];
      for (const col of cols) {
        const css = this.parseCss(col.getAttribute('style'));
        const p = this.parsePercent(css['width'] || '');
        if (p != null) percents.push(p);
      }

      if (percents.length) {
        const tw: number[] = [];
        let acc = 0;
        // Calcula larguras usando Math.floor para evitar ultrapassar a largura total
        for (let i = 0; i < percents.length; i++) {
          const w = Math.floor((tableWidthTwip * percents[i]) / 100);
          tw.push(w);
          acc += w;
        }
        // Ajusta a diferença de arredondamento na última coluna para garantir soma exata
        // Isso garante que a borda direita fique alinhada corretamente
        const diff = tableWidthTwip - acc;
        if (tw.length > 0) {
          tw[tw.length - 1] += diff;
        }
        gridTwips = tw;
      }
    }

    // se não tem colgroup, distribui igualmente pelo máximo de colunas (considera colspan)
    if (!gridTwips) {
      let maxCols = 1;
      for (const tr of Array.from(tableEl.querySelectorAll('tr'))) {
        let cols = 0;
        for (const td of Array.from(tr.querySelectorAll('td, th'))) {
          cols += Math.max(1, this.safeNumber(td.getAttribute('colspan'), 1));
        }
        maxCols = Math.max(maxCols, cols);
      }
      // Usa Math.floor para evitar ultrapassar a largura total
      const base = Math.floor(tableWidthTwip / maxCols);
      const tw = Array.from({ length: maxCols }, () => base);
      // Ajusta a diferença de arredondamento na última coluna para garantir soma exata
      // Isso garante que a borda direita fique alinhada corretamente
      const total = base * maxCols;
      const diff = tableWidthTwip - total;
      if (tw.length > 0) {
        tw[tw.length - 1] += diff;
      }
      gridTwips = tw;
    }

    const tableConfig: any = {
      width: { size: tableWidthTwip, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: gridTwips,
      rows,
    };

    // Configura bordas da tabela
    if (isSignatureTable) {
      // Remove bordas se for tabela de assinatura
      tableConfig.borders = {
        top: { size: 0, style: BorderStyle.NONE },
        bottom: { size: 0, style: BorderStyle.NONE },
        left: { size: 0, style: BorderStyle.NONE },
        right: { size: 0, style: BorderStyle.NONE },
        insideHorizontal: { size: 0, style: BorderStyle.NONE },
        insideVertical: { size: 0, style: BorderStyle.NONE },
      };
    } else {
      // Aplica bordas uniformes na tabela
      // IMPORTANTE: O tamanho da borda no DOCX é medido em "eighths of a point" (1/8 pt)
      // 0.75pt = 0.75 × 8 = 6 eighths
      const borderPt = tableBorderSize; // ex: 0.75 vindo do CSS
      const borderSz = this.ptToBorderSz(borderPt); // 0.75pt -> 6 eighths

      tableConfig.borders = {
        top: { size: borderSz, style: BorderStyle.SINGLE },
        bottom: { size: borderSz, style: BorderStyle.SINGLE },
        left: { size: borderSz, style: BorderStyle.SINGLE },
        right: { size: borderSz, style: BorderStyle.SINGLE },
        insideHorizontal: { size: borderSz, style: BorderStyle.SINGLE },
        insideVertical: { size: borderSz, style: BorderStyle.SINGLE },
      };
    }

    return new Table(tableConfig);
  }

  // ---------- coleta de blocos recursiva ----------
  private static collectBlocks(root: HTMLElement): Array<HTMLElement> {
    const out: HTMLElement[] = [];

    const walk = (el: HTMLElement) => {
      const tag = el.tagName.toLowerCase();

      // ignora "chrome" do CKEditor
      if (el.classList.contains('ck-widget__type-around')) return;
      if (el.classList.contains('ck-widget__resizer')) return;
      if (tag === 'svg' || tag === 'path') return;

      // ignora header/footer IMG no fluxo (eles viram header/footer do DOCX)
      if (el.id === 'doc-header-img' || el.id === 'doc-footer-img') return;

      // blocos que viram elementos DOCX diretamente
      if (
        tag === 'p' ||
        /^h[1-6]$/.test(tag) ||
        tag === 'img' ||
        tag === 'table' ||
        tag === 'ol' ||
        tag === 'ul'
      ) {
        out.push(el);
        return;
      }

      // div: pode conter parágrafos, listas ou outros elementos
      // Se tem parágrafos diretos ou listas, processa o conteúdo
      // Se não tem, desce nos filhos
      if (tag === 'div') {
        const hasDirectContent =
          el.querySelector(':scope > p') ||
          el.querySelector(':scope > ol') ||
          el.querySelector(':scope > ul') ||
          el.querySelector(':scope > table');

        if (hasDirectContent) {
          // Processa filhos diretamente
          for (const child of Array.from(el.children)) {
            walk(child as HTMLElement);
          }
        } else {
          // Se não tem conteúdo direto, pode ser container - desce
          for (const child of Array.from(el.children)) {
            walk(child as HTMLElement);
          }
        }
        return;
      }

      // figures do ckeditor: podem conter img ou table
      if (tag === 'figure') {
        const img = el.querySelector('img');
        const table = el.querySelector('table');
        if (table) out.push(table as any);
        else if (img) out.push(img as any);
        else {
          for (const child of Array.from(el.children))
            walk(child as HTMLElement);
        }
        return;
      }

      // containers (article/body/etc): desce
      for (const child of Array.from(el.children)) walk(child as HTMLElement);
    };

    walk(root);
    return out;
  }

  // ---------- seção: tamanho e margens ----------
  private static buildSectionProps(articleEl: HTMLElement) {
    // Preferir data-* do html-lite (valores em twips)
    const pageWtw = this.safeNumber(
      articleEl.getAttribute('data-page-w-tw'),
      0,
    );
    const pageHtw = this.safeNumber(
      articleEl.getAttribute('data-page-h-tw'),
      0,
    );

    // Se não tiver em twips, tenta converter de pontos
    let finalPageWtw = pageWtw;
    let finalPageHtw = pageHtw;
    if (!finalPageWtw || !finalPageHtw) {
      const pageWpt = this.safeNumber(
        articleEl.getAttribute('data-page-w-pt'),
        0,
      );
      const pageHpt = this.safeNumber(
        articleEl.getAttribute('data-page-h-pt'),
        0,
      );
      if (pageWpt && !finalPageWtw) finalPageWtw = this.ptToTwip(pageWpt);
      if (pageHpt && !finalPageHtw) finalPageHtw = this.ptToTwip(pageHpt);
    }

    // Fallback padrão A4 se não tiver nada
    if (!finalPageWtw || !finalPageHtw) {
      finalPageWtw = this.ptToTwip(595.3); // A4 width
      finalPageHtw = this.ptToTwip(841.9); // A4 height
    }

    const headerMarginPt = this.safeNumber(
      articleEl.getAttribute('data-header-margin-pt'),
      0,
    );
    const footerMarginPt = this.safeNumber(
      articleEl.getAttribute('data-footer-margin-pt'),
      0,
    );
    const gutterPt = this.safeNumber(
      articleEl.getAttribute('data-gutter-pt'),
      0,
    );

    // padding do article = margens da página
    const css = this.parseCss(articleEl.getAttribute('style'));

    // Prioriza padding-top, padding-right, padding-bottom, padding-left individuais
    let topPt: number | undefined = this.parseCssSizeToPt(css['padding-top']);
    let rightPt: number | undefined = this.parseCssSizeToPt(
      css['padding-right'],
    );
    let bottomPt: number | undefined = this.parseCssSizeToPt(
      css['padding-bottom'],
    );
    let leftPt: number | undefined = this.parseCssSizeToPt(css['padding-left']);

    // Fallback: se não tiver padding individual, tenta ler padding único
    if (
      topPt == null &&
      rightPt == null &&
      bottomPt == null &&
      leftPt == null
    ) {
      const pad = (css['padding'] || '').trim();
      if (pad) {
        const parts = pad
          .split(/\s+/)
          .map((p) => this.parseCssSizeToPt(p) ?? 0);
        if (parts.length === 1) {
          topPt = rightPt = bottomPt = leftPt = parts[0];
        } else if (parts.length === 2) {
          topPt = bottomPt = parts[0];
          rightPt = leftPt = parts[1];
        } else if (parts.length === 3) {
          topPt = parts[0];
          rightPt = leftPt = parts[1];
          bottomPt = parts[2];
        } else if (parts.length >= 4) {
          topPt = parts[0];
          rightPt = parts[1];
          bottomPt = parts[2];
          leftPt = parts[3];
        }
      }
    }

    // Garante valores finitos e válidos
    const topMarginTwip =
      topPt != null && Number.isFinite(topPt)
        ? this.ptToTwip(topPt)
        : this.ptToTwip(70.9);
    const rightMarginTwip =
      rightPt != null && Number.isFinite(rightPt)
        ? this.ptToTwip(rightPt)
        : this.ptToTwip(28.35); // 1cm
    const bottomMarginTwip =
      bottomPt != null && Number.isFinite(bottomPt)
        ? this.ptToTwip(bottomPt)
        : this.ptToTwip(56.7);
    const leftMarginTwip =
      leftPt != null && Number.isFinite(leftPt)
        ? this.ptToTwip(leftPt)
        : this.ptToTwip(28.35); // 1cm

    return {
      page: {
        size: {
          width: finalPageWtw,
          height: finalPageHtw,
        },
        margin: {
          top: topMarginTwip,
          right: rightMarginTwip,
          bottom: bottomMarginTwip,
          left: leftMarginTwip,
          // sempre números finitos (evita DOCX inválido)
          header: this.ptToTwip(this.safeNumber(headerMarginPt, 0)),
          footer: this.ptToTwip(this.safeNumber(footerMarginPt, 0)),
          gutter: this.ptToTwip(this.safeNumber(gutterPt, 0)),
        },
      },
    };
  }

  // ---------- convert ----------
  static async convert(html: string): Promise<Buffer> {
    const dom = new JSDOM(html);
    const docHtml = dom.window.document;

    const footerImgEl = docHtml.querySelector(
      '#doc-footer-img',
    ) as HTMLImageElement | null;

    let article = docHtml.querySelector('article') as HTMLElement;

    // Se não houver article, cria um padrão
    if (!article) {
      article = docHtml.createElement('article');
      article.setAttribute('data-html-lite', '1');
      article.setAttribute('data-page-w-pt', '595.3');
      article.setAttribute('data-page-h-pt', '841.9');
      article.setAttribute('data-page-w-tw', '11906');
      article.setAttribute('data-page-h-tw', '16838');
      article.setAttribute('data-header-margin-pt', '0');
      article.setAttribute('data-footer-margin-pt', '28.35');
      article.setAttribute('data-gutter-pt', '0');
      article.setAttribute('data-page-size', 'A4');
      article.setAttribute('data-landscape', 'false');
      article.setAttribute(
        'style',
        'border:1px solid #000;white-space:normal;font-size:11pt;box-sizing:border-box;margin:0 auto;background:white;width:595.3pt;min-height:841.9pt;padding-top:56.7pt;padding-right:28.35pt;padding-bottom:56.7pt;padding-left:28.35pt',
      );

      // Move todo o conteúdo do body para dentro do article
      while (docHtml.body.firstChild) {
        article.appendChild(docHtml.body.firstChild);
      }
      docHtml.body.appendChild(article);
    }

    // conteúdo real geralmente está no .ck-content (teu caso)
    const contentRoot =
      (article.querySelector('.ck-content') as HTMLElement) ||
      (article as HTMLElement);

    const blocks = this.collectBlocks(contentRoot);

    // prepara elementos docx do corpo
    const children: Array<Paragraph | Table> = [];

    // Calcula contentWidthTwip usando as mesmas margens da seção
    // Isso garante que a tabela não extrapole as margens do documento
    const sectionPropsForWidth = this.buildSectionProps(article);
    const pageWidthTwip = sectionPropsForWidth.page.size.width;
    const leftMarginTwip = sectionPropsForWidth.page.margin.left;
    const rightMarginTwip = sectionPropsForWidth.page.margin.right;
    const contentWidthTwip = pageWidthTwip - leftMarginTwip - rightMarginTwip;

    for (const b of blocks) {
      const tag = b.tagName.toLowerCase();

      if (tag === 'p') {
        children.push(this.paragraphFromP(b));
        continue;
      }

      if (/^h[1-6]$/.test(tag)) {
        children.push(this.paragraphFromHeading(b));
        continue;
      }

      if (tag === 'img') {
        const imgEl = b as HTMLImageElement;
        if (imgEl.id === 'doc-header-img' || imgEl.id === 'doc-footer-img')
          continue;

        const src = imgEl.getAttribute('src') || '';
        const buf = await this.buildImageBuffer(src);
        if (!buf) continue;

        // tenta respeitar width:100% (usa "conteúdo" aproximado)
        const pageWpt = this.safeNumber(
          article.getAttribute('data-page-w-pt'),
          595.3,
        );
        const cssArticle = this.parseCss(article.getAttribute('style'));

        // Prioriza padding-left e padding-right individuais
        let leftPt = this.parseCssSizeToPt(cssArticle['padding-left']) ?? 0;
        let rightPt = this.parseCssSizeToPt(cssArticle['padding-right']) ?? 0;

        // Fallback: se não tiver padding individual, tenta ler padding único
        if (leftPt === 0 && rightPt === 0) {
          const pad = (cssArticle['padding'] || '').trim();
          if (pad) {
            const parts = pad
              .split(/\s+/)
              .map((p) => this.parseCssSizeToPt(p) ?? 0);
            if (parts.length >= 4) {
              leftPt = parts[3];
              rightPt = parts[1];
            } else if (parts.length >= 2) {
              leftPt = rightPt = parts[1];
            } else if (parts.length === 1) {
              leftPt = rightPt = parts[0];
            }
          }
        }

        // fallback rápido: largura ~ pageW - (margens laterais)
        // (se padding não existir, usa 550 como antes)
        let widthPx = 550;
        if (leftPt > 0 || rightPt > 0) {
          const contentWpt = pageWpt - leftPt - rightPt;
          const computed = this.ptToPx(contentWpt);
          if (Number.isFinite(computed) && computed > 0) widthPx = computed;
        }
        // nunca deixe 0/NaN (Word pode recusar abrir)
        widthPx = Math.max(1, Math.round(widthPx));
        const heightPx = Math.max(1, Math.round(widthPx * 0.12)); // aproxima

        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: buf,
                transformation: {
                  width: widthPx,
                  height: heightPx,
                }, // aproxima
              }),
            ],
          }),
        );
        continue;
      }

      if (tag === 'ol' || tag === 'ul') {
        children.push(
          ...this.listToParagraphs(
            b,
            0,
            this.extractRunStyle(b, this.getInheritedRunStyle(b)),
          ),
        );
        continue;
      }

      if (tag === 'table') {
        // Ignora margins da tabela (não adiciona espaçamento antes/depois)
        // Tabelas não devem ter margin-top ou margin-bottom na conversão

        children.push(this.tableFromHtml(b as any, contentWidthTwip));

        continue;
      }
    }

    if (children.length === 0)
      children.push(new Paragraph({ children: [new TextRun(' ')] }));

    // Footer buffer
    const footerBuffer = footerImgEl?.src
      ? await this.buildImageBuffer(footerImgEl.src)
      : null;

    // Sempre carrega a logo padrão do cabeçalho
    const logoPath = path.join(process.cwd(), 'public', 'logo', 'ss.png');
    const logoBuffer = await this.buildImageBuffer(logoPath);

    // Carrega e converte a marca d'água vertical (SVG para PNG) com 90% de transparência (10% opacidade)
    const watermarkSvgPath = path.join(
      process.cwd(),
      'public',
      'logo',
      'ss-vertical.svg',
    );
    const watermarkBuffer = await this.convertSvgToPng(watermarkSvgPath, 0.1); // 0.1 = 10% opacidade = 90% transparência

    const footerW = Math.max(1, Math.round(this.cmToPx(14.98)));
    const footerH = Math.max(1, Math.round(this.cmToPx(1.12)));
    const sectionProps = this.buildSectionProps(article);

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: this.DEFAULT_FONT,
              size: this.DEFAULT_SIZE_PT * 2, // half-points
            },
          },
        },
      },
      numbering: {
        config: [
          {
            reference: this.OL_REF,
            levels: Array.from({ length: this.MAX_LIST_LEVEL + 1 }, (_, i) => ({
              level: i,
              format: LevelFormat.DECIMAL,
              text: `%${i + 1}.`,
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: {
                    left: this.ptToTwip(18 * (i + 1)),
                    hanging: this.ptToTwip(9),
                  },
                },
              },
            })),
          },
        ],
      },
      sections: [
        {
          properties: sectionProps,
          headers:
            logoBuffer || watermarkBuffer
              ? {
                  default: new Header({
                    children: [
                      // Logo do cabeçalho (se existir)
                      ...(logoBuffer
                        ? [
                            new Paragraph({
                              // Centraliza verticalmente no header
                              // Altura da logo: 0.73cm, altura típica do header: ~1.2-1.5cm
                              // Espaço antes para centralizar: aproximadamente 0.35-0.4cm
                              spacing: {
                                before: this.cmToTwip(0.35), // Espaço superior para centralizar verticalmente
                                after: 0,
                                line: 240,
                              },
                              indent: { left: 0, right: 0 },
                              alignment: AlignmentType.LEFT,
                              children: [
                                new ImageRun({
                                  data: logoBuffer,
                                  transformation: {
                                    // Tamanho absoluto conforme especificado:
                                    // Largura: 1,3 cm (absoluta)
                                    // Altura: 0,73 cm (absoluta)
                                    width: Math.max(
                                      1,
                                      Math.round(this.cmToPx(1.3)),
                                    ),
                                    height: Math.max(
                                      1,
                                      Math.round(this.cmToPx(0.73)),
                                    ),
                                  },
                                }),
                              ],
                            }),
                          ]
                        : []),
                      // Marca d'água (se existir) - aparece em todas as páginas
                      ...(watermarkBuffer
                        ? [
                            new Paragraph({
                              spacing: { before: 0, after: 0 },
                              children: [
                                new ImageRun({
                                  data: watermarkBuffer,
                                  transformation: {
                                    // Tamanho absoluto: 7,8 cm x 1,63 cm
                                    width: Math.max(
                                      1,
                                      Math.round(this.cmToPx(7.8)),
                                    ),
                                    height: Math.max(
                                      1,
                                      Math.round(this.cmToPx(1.63)),
                                    ),
                                  },
                                  floating: {
                                    horizontalPosition: {
                                      relative:
                                        HorizontalPositionRelativeFrom.MARGIN,
                                      align: HorizontalPositionAlign.CENTER,
                                      offset: 0,
                                    },
                                    verticalPosition: {
                                      relative:
                                        VerticalPositionRelativeFrom.PAGE,
                                      align: VerticalPositionAlign.CENTER,
                                      offset: 0,
                                    },
                                    wrap: {
                                      type: TextWrappingType.NONE,
                                    },
                                  },
                                }),
                                new TextRun(' '),
                              ],
                            }),
                          ]
                        : []),
                    ],
                  }),
                }
              : {},
          footers: footerBuffer
            ? {
                default: new Footer({
                  children: [
                    new Paragraph({
                      spacing: { before: 0, after: 0, line: 240 },
                      indent: { left: 0, right: 0 },
                      alignment: AlignmentType.CENTER,
                      children: [
                        new ImageRun({
                          data: footerBuffer,
                          transformation: {
                            // Tamanho absoluto do footer: 14,98 cm x 1,12 cm
                            width: footerW,
                            height: footerH,
                          },
                        }),
                      ],
                    }),
                  ],
                }),
              }
            : {},
          children,
        },
      ],
    });

    return Packer.toBuffer(doc);
  }
}
