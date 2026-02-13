// render.js
// Node 18+
// Dependência: docx
//
// Uso:
//   node render.js <entrada.json> <saida.docx>

const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  UnderlineType,
  LevelFormat,
  LevelSuffix,
  ShadingType,
  LineRuleType,
  Header,
  Footer,
  PageOrientation,
} = require("docx");

const [, , inArg, outArg] = process.argv;
if (!inArg || !outArg) {
  console.error("Uso: node render.js <entrada.json> <saida.docx>");
  process.exit(1);
}

const inPath = path.resolve(inArg);
const outPath = path.resolve(outArg);

// ---------- helpers ----------
function ptToHalfPoints(pt) {
  if (pt == null) return undefined;
  const n = Number(pt);
  return Number.isNaN(n) ? undefined : Math.round(n * 2); // 12pt -> 24
}
function ptToTwip(pt) {
  if (pt == null) return undefined;
  const n = Number(pt);
  return Number.isNaN(n) ? undefined : Math.round(n * 20); // 1pt -> 20 twips
}
function mapAlign(a) {
  switch ((a || "").toLowerCase()) {
    case "center":
      return AlignmentType.CENTER;
    case "right":
      return AlignmentType.RIGHT;
    case "justify":
      return AlignmentType.JUSTIFIED;
    case "left":
    default:
      return AlignmentType.LEFT;
  }
}
function mapUnderline(uStyle, enabled) {
  if (!enabled) return undefined;
  const v = (uStyle || "single").toLowerCase();
  switch (v) {
    case "double":
      return { type: UnderlineType.DOUBLE };
    case "dotted":
      return { type: UnderlineType.DOTTED };
    case "dash":
      return { type: UnderlineType.DASH };
    case "dotdash":
      return { type: UnderlineType.DOT_DASH };
    case "dotdotdash":
      return { type: UnderlineType.DOT_DOT_DASH };
    case "thick":
      return { type: UnderlineType.THICK };
    case "wavy":
    case "wave":
      return { type: UnderlineType.WAVY };
    case "words":
      return { type: UnderlineType.WORDS };
    case "single":
    default:
      return { type: UnderlineType.SINGLE };
  }
}
function hexToDocxColor(hex) {
  if (!hex) return undefined;
  let s = String(hex).trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return undefined;
  return s.toUpperCase();
}
function runOptsFromInlineStyle(style = {}) {
  const color = hexToDocxColor(style.color);
  const highlightHex = hexToDocxColor(style.highlight);

  const base = {
    bold: !!style.bold,
    italics: !!style.italic,
    underline: mapUnderline(style.underlineStyle, style.underline),
    size: ptToHalfPoints(style.fontSize),
    font: style.fontFamily || undefined,
    color: color,
  };

  if (highlightHex) {
    base.shading = {
      type: ShadingType.CLEAR,
      fill: highlightHex, // fundo
      color: "auto", // cor do padrão (mantém automático)
    };
  }

  return base;
}
function makeRunsFromInline(inline) {
  const baseOpts = runOptsFromInlineStyle(inline?.style);
  const text = String(inline?.content ?? "");

  if (text.includes("\n")) {
    const parts = text.split("\n");
    const runs = [];
    parts.forEach((part, idx) => {
      runs.push(
        new TextRun({
          ...baseOpts,
          text: part,
          break: idx > 0 ? 1 : undefined,
        })
      );
    });
    return runs;
  }
  return [new TextRun({ ...baseOpts, text })];
}
function sameText(a, b) {
  return String(a || "").trim() === String(b || "").trim();
}

function mapLineRule(rule) {
  switch ((rule || "auto").toLowerCase()) {
    case "exact":
    case "exactly":
      return LineRuleType.EXACT;
    case "atleast":
    case "at_least":
      return LineRuleType.AT_LEAST;
    case "auto":
    default:
      return LineRuleType.AUTO;
  }
}
function spacingToDocx(spacing) {
  if (!spacing) return undefined;
  const out = {};
  const rule = mapLineRule(spacing.lineRule);

  // line:
  // - quando 'auto' → multiplicador * 240
  // - quando 'exact'/'atLeast' → pontos -> twips
  if (spacing.line != null) {
    if (rule === LineRuleType.AUTO) {
      const mult = Number(spacing.line);
      if (Number.isFinite(mult)) out.line = Math.round(mult * 240);
    } else {
      out.line = ptToTwip(spacing.line);
    }
    out.lineRule = rule;
  }

  if (spacing.before != null) out.before = ptToTwip(spacing.before);
  if (spacing.after != null) out.after = ptToTwip(spacing.after);

  return out;
}

function mapOrientation(o) {
  return String(o || "").toLowerCase() === "landscape"
    ? PageOrientation.LANDSCAPE
    : PageOrientation.PORTRAIT;
}

function hasOwnKeys(obj) {
  return obj && typeof obj === "object" && Object.keys(obj).length > 0;
}

// ---------- numbering config (listas reais) ----------
const FMT_MAP = {
  decimal: LevelFormat.DECIMAL,
  lowerletter: LevelFormat.LOWER_LETTER,
  upperletter: LevelFormat.UPPER_LETTER,
  lowerroman: LevelFormat.LOWER_ROMAN,
  upperroman: LevelFormat.UPPER_ROMAN,
  bullet: LevelFormat.BULLET,
};

const SUF_MAP = {
  tab: LevelSuffix.TAB,
  space: LevelSuffix.SPACE,
  nothing: LevelSuffix.NONE,
};

function collectNumberingConfig(blocks) {
  // numId -> { reference, levels: Map(level -> levelOptions) }
  const byNum = new Map();

  for (const b of blocks) {
    if (!b?.list) continue;
    const { numId, level, numFmt, marker, suffix } = b.list;
    const ref = `list_${numId}`;
    const firstInlineStyle = (b.inlines?.[0]?.style) || {};
    const indent = b.style?.indent || {};

    const cfg = byNum.get(numId) || { reference: ref, levels: new Map() };

    if (!cfg.levels.has(level)) {
      // texto do marcador (%1., %2., ... ou bullet)
      let textPattern;
      if ((numFmt || "").toLowerCase() === "bullet") {
        textPattern = marker && marker.trim() ? marker.trim() : "•";
      } else {
        const punct =
          (marker && /[^0-9a-z]+$/i.test(marker) && marker.match(/[^0-9a-z]+$/i)[0]) ||
          ".";
        textPattern = `%${level + 1}${punct}`;
      }

      cfg.levels.set(level, {
        level,
        format: FMT_MAP[(numFmt || "").toLowerCase()] || LevelFormat.DECIMAL,
        text: textPattern,
        alignment: AlignmentType.LEFT,
        suffix: SUF_MAP[(suffix || "tab").toLowerCase()] ?? LevelSuffix.TAB,
        style: {
          paragraph: {
            indent: {
              left: ptToTwip(indent.left ?? 36),
              hanging: ptToTwip(indent.hanging ?? 18),
              firstLine: ptToTwip(indent.firstLine ?? undefined),
            },
          },
          run: {
            font: firstInlineStyle.fontFamily || undefined,
            size: ptToHalfPoints(firstInlineStyle.fontSize),
            bold: !!firstInlineStyle.bold,
            italics: !!firstInlineStyle.italic,
            underline: mapUnderline(
              firstInlineStyle.underlineStyle,
              firstInlineStyle.underline
            ),
            color: hexToDocxColor(firstInlineStyle.color),
          },
        },
      });
    }

    byNum.set(numId, cfg);
  }

  // transforma em config consumível pelo docx
  return Array.from(byNum.values()).map((cfg) => ({
    reference: cfg.reference,
    levels: Array.from(cfg.levels.values()).sort((a, b) => a.level - b.level),
  }));
}

// ---------- paragraph ----------
function paragraphFromBlock(block, numberingRefsByNumId) {
  const style = block?.style || {};
  const indent = style.indent || {};
  const inlinesSrc =
    Array.isArray(block?.inlines) && block.inlines.length
      ? block.inlines
      : [{ style: {}, content: block?.content || "" }];

  const runs = [];
  for (const inline of inlinesSrc) {
    const rs = makeRunsFromInline(inline);
    rs.forEach((r) => runs.push(r));
  }

  const paraOpts = {
    children: runs,
    alignment: mapAlign(style.textAlign),
    indent: {
      left: ptToTwip(indent.left),
      firstLine: ptToTwip(indent.firstLine),
      hanging: ptToTwip(indent.hanging),
    },
  };

  // espaçamento de parágrafo (linha/before/after)
  const spacing = spacingToDocx(style.spacing);
  if (spacing) paraOpts.spacing = spacing;

  // Se for lista, aplica numbering real
  if (block?.list?.numId != null) {
    const numId = String(block.list.numId);
    const reference = numberingRefsByNumId.get(numId);
    if (reference) {
      paraOpts.numbering = {
        reference,
        level: block.list.level || 0,
      };
    }
  }

  return new Paragraph(paraOpts);
}

function paragraphsFromBlocks(blocks, numberingRefsByNumId) {
  const out = [];
  for (const blk of blocks || []) {
    out.push(paragraphFromBlock(blk, numberingRefsByNumId));
  }
  return out;
}

// ---------- headers / footers ----------
function buildHeaderFooterObjects(secMeta, numberingRefsByNumId) {
  const headers = {};
  const footers = {};

  if (secMeta?.headers) {
    if (secMeta.headers.default?.blocks) {
      headers.default = new Header({
        children: paragraphsFromBlocks(
          secMeta.headers.default.blocks,
          numberingRefsByNumId
        ),
      });
    }
    if (secMeta.headers.first?.blocks) {
      headers.first = new Header({
        children: paragraphsFromBlocks(
          secMeta.headers.first.blocks,
          numberingRefsByNumId
        ),
      });
    }
    if (secMeta.headers.even?.blocks) {
      headers.even = new Header({
        children: paragraphsFromBlocks(
          secMeta.headers.even.blocks,
          numberingRefsByNumId
        ),
      });
    }
  }
  if (secMeta?.footers) {
    if (secMeta.footers.default?.blocks) {
      footers.default = new Footer({
        children: paragraphsFromBlocks(
          secMeta.footers.default.blocks,
          numberingRefsByNumId
        ),
      });
    }
    if (secMeta.footers.first?.blocks) {
      footers.first = new Footer({
        children: paragraphsFromBlocks(
          secMeta.footers.first.blocks,
          numberingRefsByNumId
        ),
      });
    }
    if (secMeta.footers.even?.blocks) {
      footers.even = new Footer({
        children: paragraphsFromBlocks(
          secMeta.footers.even.blocks,
          numberingRefsByNumId
        ),
      });
    }
  }

  return {
    headers: hasOwnKeys(headers) ? headers : undefined,
    footers: hasOwnKeys(footers) ? footers : undefined,
  };
}

function sectionPropertiesFromMeta(secMeta) {
  if (!secMeta?.page && !secMeta?.margins) return undefined;

  let widthTwip, heightTwip, orientation, margin;
  if (secMeta.page) {
    // Preferimos twips do JSON; se vierem em pt, convertemos
    const wT = Number(secMeta.page.size?.widthTwip);
    const hT = Number(secMeta.page.size?.heightTwip);
    const wP = Number(secMeta.page.size?.widthPt);
    const hP = Number(secMeta.page.size?.heightPt);

    widthTwip = Number.isFinite(wT) ? wT : ptToTwip(wP);
    heightTwip = Number.isFinite(hT) ? hT : ptToTwip(hP);
    orientation = mapOrientation(secMeta.page.orientation);
  }

  if (secMeta.margins) {
    margin = {
      top: ptToTwip(secMeta.margins.top),
      right: ptToTwip(secMeta.margins.right),
      bottom: ptToTwip(secMeta.margins.bottom),
      left: ptToTwip(secMeta.margins.left),
      header: ptToTwip(secMeta.margins.header),
      footer: ptToTwip(secMeta.margins.footer),
      gutter: ptToTwip(secMeta.margins.gutter),
    };
  }

  const page = {};
  if (widthTwip != null && heightTwip != null) {
    page.size = {
      width: widthTwip,
      height: heightTwip,
      orientation,
    };
  }
  if (margin) page.margin = margin;

  return hasOwnKeys(page) ? { page } : undefined;
}

// ---------- main ----------
(async () => {
  const json = JSON.parse(fs.readFileSync(inPath, "utf8"));
  const bodyBlocks = Array.isArray(json.blocks) ? json.blocks : [];

  // Seções vindas do extract (A4/margens/orientação + headers/footers)
  const sectionsMeta = Array.isArray(json.sections) ? json.sections : [];
  const primarySectionMeta = sectionsMeta[0] || null;

  // Colete blocks que podem influenciar a configuração de numbering (inclui cabeçalhos/rodapés)
  const hfBlocks = [];
  if (primarySectionMeta) {
    const hdr = primarySectionMeta.headers || {};
    const ftr = primarySectionMeta.footers || {};
    for (const k of ["default", "first", "even"]) {
      if (hdr[k]?.blocks) hfBlocks.push(...hdr[k].blocks);
      if (ftr[k]?.blocks) hfBlocks.push(...ftr[k].blocks);
    }
  }

  // constrói configs de listas e um mapa numId->reference
  const numberingConfig = collectNumberingConfig([...bodyBlocks, ...hfBlocks]);
  const numberingRefsByNumId = new Map(
    numberingConfig.map((c) => {
      const numId = c.reference.replace(/^list_/, ""); // só para consulta reversa
      return [numId, c.reference];
    })
  );

  // Título (evita duplicar se for igual ao 1º bloco)
  const paragraphs = [];
  const firstBlockContent = bodyBlocks[0]?.content ?? null;
  const shouldRenderTitle =
    !!json.title?.content &&
    !(firstBlockContent && sameText(json.title.content, firstBlockContent));

  if (shouldRenderTitle) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: json.title.content })],
        alignment: mapAlign(json.title?.style?.textAlign),
      })
    );
  }

  // Blocos (corpo)
  paragraphs.push(...paragraphsFromBlocks(bodyBlocks, numberingRefsByNumId));

  // Propriedades de seção e headers/footers (apenas a primeira seção do JSON)
  const sectionProps = sectionPropertiesFromMeta(primarySectionMeta);
  const { headers, footers } = buildHeaderFooterObjects(
    primarySectionMeta,
    numberingRefsByNumId
  );

  const docSections = [
    {
      ...(sectionProps ? { properties: sectionProps } : {}),
      ...(headers ? { headers } : {}),
      ...(footers ? { footers } : {}),
      children: paragraphs,
    },
  ];

  const doc = new Document({
    numbering: { config: numberingConfig },
    sections: docSections,
  });

  const buffer = await Packer.toBuffer(doc);
  const dir = path.dirname(outPath);
  if (dir !== path.parse(dir).root) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
  fs.writeFileSync(outPath, buffer);
  console.log(outPath);
})().catch((err) => {
  console.error("Erro ao gerar DOCX:", err);
  process.exit(2);
});