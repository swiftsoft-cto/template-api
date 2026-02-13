// extract.js
// Node 18+
// Dependências: jszip, fast-xml-parser
//
// Uso:
//   node extract.js <arquivo.docx> [saida.json] [--dump-xml [dir]]

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { XMLParser } = require('fast-xml-parser');

const argv = process.argv;
const [, , inputPathArg, outputPathArg] = argv;

if (!inputPathArg) {
  console.error('Uso: node extract.js <arquivo.docx> [saida.json] [--dump-xml [dir]]');
  process.exit(1);
}

// flags extras
let dumpXmlRequested = false;
let dumpXmlDirArg = null;
for (let i = 3; i < argv.length; i++) {
  const a = argv[i];
  if (!a) continue;
  if (a === '--dump-xml') {
    dumpXmlRequested = true;
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { dumpXmlDirArg = next; i++; }
  } else if (a.startsWith('--dump-xml=')) {
    dumpXmlRequested = true;
    dumpXmlDirArg = a.slice('--dump-xml='.length);
  }
}

const docxPath = path.resolve(inputPathArg);
const defaultOut = path.join(
  path.dirname(docxPath),
  path.basename(docxPath, path.extname(docxPath)) + '.json'
);
const outPath = (outputPathArg && !outputPathArg.startsWith('--'))
  ? path.resolve(outputPathArg)
  : defaultOut;

const defaultDumpDir = path.join(
  path.dirname(docxPath),
  path.basename(docxPath, path.extname(docxPath)) + '_xml'
);
const dumpDir = dumpXmlDirArg ? path.resolve(dumpXmlDirArg) : defaultDumpDir;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  allowBooleanAttributes: true,
  // preserva espaços e xml:space="preserve"
  trimValues: false,
});

// ---------- utils ----------
function ensureArray(x) { return !x ? [] : (Array.isArray(x) ? x : [x]); }
function toPoints(halfPts) {
  if (halfPts == null) return null;
  const n = Number(halfPts);
  return Number.isNaN(n) ? null : n / 2;
}
function dxaToPoints(dxa) {
  if (dxa == null) return null;
  const n = Number(dxa);
  return Number.isNaN(n) ? null : n / 20; // twips -> pt
}
function normalizeAlign(val) {
  if (!val) return null;
  const map = { both: 'justify', justified: 'justify', distribute: 'justify', center: 'center', left: 'left', right: 'right' };
  return map[val] || val;
}
function isOn(prop) {
  if (prop == null) return false;
  if (prop === true) return true;
  if (prop === false) return false;
  if (prop === '') return true;
  if (typeof prop === 'object') {
    const v = prop['@_val'];
    if (v == null) return true;
    const s = String(v).toLowerCase();
    return !['0', 'false', 'off', 'none', 'nil', 'no'].includes(s);
  }
  const s = String(prop).toLowerCase();
  if (s === '') return true;
  return !['0', 'false', 'off', 'none', 'nil', 'no'].includes(s);
}
function getUnderlineStyle(u) {
  if (u == null) return null;
  if (u === true || u === '') return 'single';
  if (typeof u === 'object') {
    const v = u['@_val'];
    if (v == null) return 'single';
    const s = String(v).toLowerCase();
    if (['0', 'false', 'off', 'none', 'nil', 'no'].includes(s)) return null;
    return s || 'single';
  }
  const s = String(u).toLowerCase();
  if (['0', 'false', 'off', 'none', 'nil', 'no'].includes(s)) return null;
  return s || 'single';
}
function normHex(val) {
  if (!val) return null;
  let s = String(val).trim().replace(/^#/, '').toLowerCase();
  if (s === 'auto' || s === 'none') return null;
  if (s.length === 3) s = s.split('').map(ch => ch + ch).join('');
  if (!/^[0-9a-f]{6}$/.test(s)) return null;
  return s;
}

// ---------- theme (fontes + cores) ----------
function parseTheme(themeXml) {
  if (!themeXml) return {};
  const obj = parser.parse(themeXml);
  const scheme = obj?.theme?.themeElements?.fontScheme;
  const clrScheme = obj?.theme?.themeElements?.clrScheme;

  // fontes
  const major = scheme?.majorFont?.latin?.['@_typeface'] || null;
  const minor = scheme?.minorFont?.latin?.['@_typeface'] || null;

  // cores
  const themeColors = {};
  if (clrScheme) {
    for (const key of Object.keys(clrScheme)) {
      const node = clrScheme[key];
      if (!node || typeof node !== 'object') continue;
      const srgb = node?.srgbClr?.['@_val'];
      const last = node?.sysClr?.['@_lastClr'];
      const hex = normHex(srgb || last);
      if (hex) themeColors[key] = hex;
    }
  }

  return {
    majorAscii: major, majorHAnsi: major,
    minorAscii: minor, minorHAnsi: minor,
    themeColors
  };
}
function fontFromRFonts(rFonts, themeMap) {
  if (!rFonts) return null;
  const explicit = rFonts['@_ascii'] || rFonts['@_hAnsi'];
  if (explicit) return String(explicit).trim();
  const thAscii = rFonts['@_asciiTheme'];
  const thHAnsi = rFonts['@_hAnsiTheme'];
  if (thAscii && themeMap?.[thAscii]) return String(themeMap[thAscii]).trim();
  if (thHAnsi && themeMap?.[thHAnsi]) return String(themeMap[thHAnsi]).trim();
  return null;
}
function colorFromRPr(rPr, themeMap) {
  const c = rPr?.color;
  if (!c) return null;
  const val = normHex(c['@_val']);
  if (val) return val;
  const themeKey = c['@_themeColor'];
  if (themeKey && themeMap?.themeColors?.[themeKey]) return themeMap.themeColors[themeKey];
  return null;
}
function highlightFromRPr(rPr) {
  // highlight nominal
  const h = rPr?.highlight;
  let name = null;
  if (h != null) {
    if (typeof h === 'object') name = (h['@_val'] || '').toString();
    else if (h === '') name = 'yellow';
    else name = String(h);
  }
  // fallback via shading fill
  const shFill = rPr?.shd?.['@_fill'];
  const fillHex = normHex(shFill);
  let hex = null;

  if (name && name.toLowerCase() !== 'none') {
    const map = {
      yellow: 'ffff00', green: '00ff00', cyan: '00ffff',
      magenta: 'ff00ff', blue: '0000ff', red: 'ff0000',
      black: '000000', white: 'ffffff',
      darkblue: '000080', darkcyan: '008080', darkgreen: '008000',
      darkmagenta: '800080', darkred: '800000', darkyellow: '808000',
      lightgray: 'd3d3d3', darkgray: 'a9a9a9'
    };
    hex = map[name.toLowerCase()] || null;
  }
  return hex || fillHex || null;
}

// ---------- styles + defaults ----------
function spacingFromPPr(pPr) {
  const sp = pPr?.spacing;
  if (!sp) return null;
  const lineRule = sp['@_lineRule'] || 'auto';
  let line = null;
  if (sp['@_line'] != null) {
    const raw = Number(sp['@_line']);
    if (Number.isFinite(raw)) {
      line = (String(lineRule).toLowerCase() === 'auto') ? (raw / 240) : dxaToPoints(raw);
    }
  }
  const before = sp['@_before'] != null ? dxaToPoints(Number(sp['@_before'])) : null;
  const after = sp['@_after'] != null ? dxaToPoints(Number(sp['@_after'])) : null;
  return { line, lineRule, before, after };
}

function parseStyles(xml, themeMap) {
  const base = { byId: new Map(), byName: new Map(), defaultParaStyleId: null, docDefaults: {} };
  if (!xml) return base;

  const obj = parser.parse(xml);
  const styles = ensureArray(obj?.styles?.style);
  const byId = new Map();
  const byName = new Map();
  let defaultParaStyleId = null;

  const docDefaults = {};
  const rDef = obj?.styles?.docDefaults?.rPrDefault?.rPr;
  const pDef = obj?.styles?.docDefaults?.pPrDefault?.pPr;
  if (rDef) {
    docDefaults.rBold = isOn(rDef?.b) || isOn(rDef?.bCs) || null;
    docDefaults.rItalic = isOn(rDef?.i) || isOn(rDef?.iCs) || null;
    docDefaults.rUnderline = getUnderlineStyle(rDef?.u) || null;
    docDefaults.rSize = rDef?.sz?.['@_val'] || null;
    docDefaults.rFont = fontFromRFonts(rDef?.rFonts, themeMap) || null;
    docDefaults.rColor = colorFromRPr(rDef, themeMap) || null;
    docDefaults.rHighlight = highlightFromRPr(rDef) || null;
  }
  if (pDef) {
    docDefaults.pAlign = pDef?.jc?.['@_val'] || null;
    const sp = spacingFromPPr(pDef);
    if (sp) docDefaults.pSpacing = sp;
  }

  for (const s of styles) {
    const id = s?.['@_styleId'];
    const name = s?.name?.['@_val'] || null;
    const basedOn = s?.basedOn?.['@_val'] || null;

    const isPara = (s?.['@_type'] || '').toLowerCase() === 'paragraph';
    const isDefault = s?.['@_default'] === '1';
    if (isPara && isDefault && id) defaultParaStyleId = id;

    const pJc = s?.pPr?.jc?.['@_val'] || null;
    const pSpacing = spacingFromPPr(s?.pPr || {});

    const rPr = s?.rPr || {};
    const bold = isOn(rPr?.b) || isOn(rPr?.bCs) ? true : null;
    const italic = isOn(rPr?.i) || isOn(rPr?.iCs) ? true : null;
    const underline = getUnderlineStyle(rPr?.u) || null;
    const sz = rPr?.sz?.['@_val'] || null;
    const fontFamily = fontFromRFonts(rPr?.rFonts, themeMap);
    const rColor = colorFromRPr(rPr, themeMap) || null;
    const rHighlight = highlightFromRPr(rPr) || null;

    byId.set(id, {
      id, name, basedOn,
      pAlign: pJc,
      pSpacing: pSpacing || null,
      rBold: bold, rItalic: italic, rUnderline: underline,
      rSize: sz, rFont: fontFamily, rColor, rHighlight
    });
    if (name) byName.set(name.toLowerCase(), id);
  }

  const resolved = new Map();
  function resolve(id, seen = new Set()) {
    if (!id || !byId.has(id)) return { ...docDefaults };
    if (resolved.has(id)) return resolved.get(id);
    if (seen.has(id)) return { ...docDefaults };
    seen.add(id);
    const cur = byId.get(id);
    const baseRes = resolve(cur.basedOn, seen);
    const merged = {
      id: cur.id,
      name: cur.name || baseRes.name || null,
      pAlign: cur.pAlign || baseRes.pAlign || docDefaults.pAlign || null,
      pSpacing: cur.pSpacing || baseRes.pSpacing || docDefaults.pSpacing || null,
      rBold: cur.rBold ?? baseRes.rBold ?? docDefaults.rBold ?? null,
      rItalic: cur.rItalic ?? baseRes.rItalic ?? docDefaults.rItalic ?? null,
      rUnderline: cur.rUnderline || baseRes.rUnderline || docDefaults.rUnderline || null,
      rSize: cur.rSize || baseRes.rSize || docDefaults.rSize || null,
      rFont: cur.rFont || baseRes.rFont || docDefaults.rFont || null,
      rColor: cur.rColor || baseRes.rColor || docDefaults.rColor || null,
      rHighlight: cur.rHighlight || baseRes.rHighlight || docDefaults.rHighlight || null,
    };
    resolved.set(id, merged);
    return merged;
  }
  for (const id of byId.keys()) resolve(id);

  return { byId: resolved, byName, defaultParaStyleId, docDefaults };
}

// ---------- numbering ----------
function parseNumbering(xml) {
  const base = { numIdToAbs: new Map(), abs: new Map(), overrides: new Map() };
  if (!xml) return base;
  const obj = parser.parse(xml);
  const abstractNums = ensureArray(obj?.numbering?.abstractNum);
  const nums = ensureArray(obj?.numbering?.num);

  const abs = new Map();
  for (const an of abstractNums) {
    const absId = an['@_abstractNumId'];
    const lvls = new Map();
    for (const lvl of ensureArray(an.lvl)) {
      const ilvl = Number(lvl['@_ilvl'] || 0);
      const numFmt = String(lvl.numFmt?.['@_val'] || '').toLowerCase() || null;
      const lvlText = lvl.lvlText?.['@_val'] || null;
      const start = Number(lvl.start?.['@_val'] || 1);
      const suff = (lvl.suff?.['@_val'] || '').toLowerCase() || null;
      const pInd = lvl.pPr?.ind || {};
      const ind = {
        left: dxaToPoints(pInd['@_left']),
        firstLine: dxaToPoints(pInd['@_firstLine']),
        hanging: dxaToPoints(pInd['@_hanging'])
      };
      lvls.set(ilvl, { numFmt, lvlText, start, suff, ind });
    }
    abs.set(absId, { lvls });
  }

  const numIdToAbs = new Map();
  const overrides = new Map();
  for (const n of nums) {
    const numId = n['@_numId'];
    const absId = n?.abstractNumId?.['@_val'];
    if (absId != null) numIdToAbs.set(numId, absId);

    const map = new Map();
    for (const ov of ensureArray(n.lvlOverride)) {
      const ilvl = Number(ov['@_ilvl'] || 0);
      const st = ov.startOverride?.['@_val'];
      if (st != null) map.set(ilvl, { start: Number(st) });
    }
    if (map.size) overrides.set(numId, map);
  }

  return { numIdToAbs, abs, overrides };
}

function toRoman(n, upper = true) {
  if (!Number.isFinite(n) || n <= 0) return String(n);
  const romans = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let s = '';
  for (const [v, sym] of romans) while (n >= v) { s += sym; n -= v; }
  return upper ? s : s.toLowerCase();
}
function toAlpha(n, upper = false) {
  if (!Number.isFinite(n) || n <= 0) return String(n);
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode((n % 26) + 97) + s; n = Math.floor(n / 26); }
  return upper ? s.toUpperCase() : s;
}
function formatNumberByFmt(n, fmt) {
  switch ((fmt || '').toLowerCase()) {
    case 'decimal': return String(n);
    case 'lowerletter': return toAlpha(n, false);
    case 'upperletter': return toAlpha(n, true);
    case 'lowerroman': return toRoman(n, false);
    case 'upperroman': return toRoman(n, true);
    default: return String(n);
  }
}
function buildMarker(abstract, level, countersArr) {
  const lvlInfo = abstract?.lvls?.get(level) || null;
  if (!lvlInfo) return { marker: null, numFmt: null, type: null, suffix: null };

  const { numFmt, lvlText, suff } = lvlInfo;

  if (numFmt === 'bullet') {
    const marker = lvlText || '•';
    return { marker, numFmt, type: 'bulleted', suffix: suff || null };
  }

  let marker = (lvlText || '%' + (level + 1)).replace(/%(\d+)/g, (_, g1) => {
    const refLvl = Number(g1) - 1;
    const val = countersArr[refLvl] || 0;
    const fmtForRef = abstract?.lvls?.get(refLvl)?.numFmt || 'decimal';
    return formatNumberByFmt(val, fmtForRef);
  });

  return { marker, numFmt, type: 'numbered', suffix: suff || null };
}

// ---------- runs ----------
function collectRuns(p) {
  const runs = [];
  if (p?.r) runs.push(...ensureArray(p.r));
  if (p?.hyperlink) {
    for (const h of ensureArray(p.hyperlink)) {
      if (h?.r) runs.push(...ensureArray(h.r));
    }
  }
  return runs;
}

function extractTextFromRun(r) {
  const pieces = [];
  if (r?.t != null) {
    for (const t of ensureArray(r.t)) {
      if (typeof t === 'string') {
        pieces.push(t);
      } else if (t?.['#text'] != null) {
        pieces.push(t['#text']);
      }
    }
  }
  if (r?.tab) {
    const q = ensureArray(r.tab).length || 1;
    pieces.push('\t'.repeat(q));
  }
  if (r?.br) {
    const q = ensureArray(r.br).length || 1;
    pieces.push('\n'.repeat(q));
  }
  return pieces.join('');
}

// formatação efetiva (sem usar pPr.rPr diretamente)
function resolveRunEffectiveFormatting(r, p, styles, styleResolvedPara, themeMap) {
  const rPr = r?.rPr || {};
  const rStyleId = rPr?.rStyle?.['@_val'] || null;
  const charStyle = rStyleId ? (styles.byId.get(rStyleId) || styles.docDefaults || {}) : (styles.docDefaults || {});

  // bold
  let bold;
  if (rPr.hasOwnProperty('b') || rPr.hasOwnProperty('bCs')) {
    bold = isOn(rPr.b) || isOn(rPr.bCs);
  } else if (charStyle.rBold != null) {
    bold = !!charStyle.rBold;
  } else if (styleResolvedPara.rBold != null) {
    bold = !!styleResolvedPara.rBold;
  } else {
    bold = !!styles.docDefaults.rBold;
  }

  // italic
  let italic;
  if (rPr.hasOwnProperty('i') || rPr.hasOwnProperty('iCs')) {
    italic = isOn(rPr.i) || isOn(rPr.iCs);
  } else if (charStyle.rItalic != null) {
    italic = !!charStyle.rItalic;
  } else if (styleResolvedPara.rItalic != null) {
    italic = !!styleResolvedPara.rItalic;
  } else {
    italic = !!styles.docDefaults.rItalic;
  }

  // underline
  let underlineStyle;
  if (rPr.hasOwnProperty('u')) {
    underlineStyle = getUnderlineStyle(rPr.u);
  } else if (charStyle.rUnderline != null) {
    underlineStyle = charStyle.rUnderline;
  } else if (styleResolvedPara.rUnderline != null) {
    underlineStyle = styleResolvedPara.rUnderline;
  } else {
    underlineStyle = styles.docDefaults.rUnderline || null;
  }

  // tamanho
  let sizeHalfPts = null;
  if (rPr?.sz?.['@_val'] != null) {
    sizeHalfPts = rPr.sz['@_val'];
  } else if (charStyle.rSize) {
    sizeHalfPts = charStyle.rSize;
  } else if (styleResolvedPara.rSize) {
    sizeHalfPts = styleResolvedPara.rSize;
  } else {
    sizeHalfPts = styles.docDefaults.rSize || null;
  }

  // fonte
  const runFont = fontFromRFonts(rPr?.rFonts, themeMap);
  const fontFamily = runFont || charStyle.rFont || styleResolvedPara.rFont || styles.docDefaults.rFont || null;

  // cor da fonte
  const color =
    colorFromRPr(rPr, themeMap) ||
    charStyle.rColor ||
    styleResolvedPara.rColor ||
    styles.docDefaults.rColor ||
    null;

  // realce (highlight) -> hex
  const highlight =
    highlightFromRPr(rPr) ||
    charStyle.rHighlight ||
    styleResolvedPara.rHighlight ||
    styles.docDefaults.rHighlight ||
    null;

  return { bold, italic, underline: !!underlineStyle, underlineStyle, sizeHalfPts, fontFamily, color, highlight };
}

// junta runs adjacentes com mesmo estilo
function pushInline(inlines, style, text) {
  if (text == null || text === '') return;
  const last = inlines[inlines.length - 1];
  const key = JSON.stringify(style);
  const lastKey = last ? JSON.stringify(last.style) : null;
  if (last && key === lastKey) {
    last.content += text;
  } else {
    inlines.push({ style, content: text });
  }
}

// ---------- Relationships (headers/footers) ----------
async function parseDocRels(zip) {
  const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
  if (!relsXml) return new Map();
  const obj = parser.parse(relsXml);
  const arr = ensureArray(obj?.Relationships?.Relationship);
  const map = new Map();
  for (const r of arr) {
    const id = r?.['@_Id'];
    const target = r?.['@_Target'];
    if (!id || !target) continue;
    const normalized = path.posix.normalize(path.posix.join('word', target));
    map.set(id, normalized);
  }
  return map;
}

// ---------- bloco genérico (corpo/cabeçalho/rodapé) ----------
function extractBlocksFromParagraphArray(paragraphs, styles, numbering, themeMap) {
  const blocks = [];
  const numState = new Map(); // numId -> { counters: number[], lastLevel: number }

  for (const p of paragraphs) {
    const pStyleIdRaw = p?.pPr?.pStyle?.['@_val'] || null;
    const pStyleId = pStyleIdRaw || styles.defaultParaStyleId || null;
    const styleResolved = pStyleId ? (styles.byId.get(pStyleId) || styles.docDefaults || {}) : (styles.docDefaults || {});
    const pAlign = normalizeAlign(p?.pPr?.jc?.['@_val'] || styleResolved.pAlign || styles.docDefaults.pAlign || null);

    const pInd = p?.pPr?.ind || {};
    const indent = {
      left: dxaToPoints(pInd['@_left']),
      firstLine: dxaToPoints(pInd['@_firstLine']),
      hanging: dxaToPoints(pInd['@_hanging'])
    };

    const spacing = spacingFromPPr(p?.pPr || {}) || styleResolved.pSpacing || styles.docDefaults.pSpacing || null;

    // listas
    let list = null;
    const numPr = p?.pPr?.numPr;
    if (numPr?.numId?.['@_val'] != null) {
      const numId = String(numPr.numId['@_val']);
      const ilvl = Number(numPr?.ilvl?.['@_val'] || 0);
      const absId = numbering.numIdToAbs.get(numId);
      const abstract = numbering.abs.get(absId);

      const ovLvl = numbering.overrides.get(numId)?.get(ilvl);
      const startOverride = ovLvl?.start;

      const st = numState.get(numId) || { counters: [], lastLevel: -1 };
      for (let d = ilvl + 1; d < st.counters.length; d++) st.counters[d] = 0;

      const current = st.counters[ilvl] || 0;
      const baseStart = startOverride ?? (abstract?.lvls?.get(ilvl)?.start ?? 1);
      st.counters[ilvl] = current > 0 ? current + 1 : baseStart;
      st.lastLevel = ilvl;
      numState.set(numId, st);

      const { marker, numFmt, type, suffix } = buildMarker(abstract, ilvl, st.counters);

      const lvlInd = abstract?.lvls?.get(ilvl)?.ind;
      const left = indent.left ?? lvlInd?.left ?? null;
      const firstLine = indent.firstLine ?? lvlInd?.firstLine ?? null;
      const hanging = indent.hanging ?? lvlInd?.hanging ?? null;

      list = { numId, absId, level: ilvl, type, numFmt, marker, suffix: suffix || null };
      if (left != null || firstLine != null || hanging != null) {
        indent.left = left; indent.firstLine = firstLine; indent.hanging = hanging;
      }
    }

    // runs -> inlines
    const runs = collectRuns(p);
    const inlines = [];
    for (const r of runs) {
      const text = extractTextFromRun(r);
      if (!text) continue;
      const eff = resolveRunEffectiveFormatting(r, p, styles, styleResolved, themeMap);
      const styleInline = {
        bold: !!eff.bold,
        italic: !!eff.italic,
        underline: !!eff.underline,
        underlineStyle: eff.underline ? eff.underlineStyle : null,
        fontSize: toPoints(eff.sizeHalfPts),
        fontFamily: eff.fontFamily ? String(eff.fontFamily).trim().toLowerCase() : null,
        color: eff.color || null,
        highlight: eff.highlight || null,
      };
      pushInline(inlines, styleInline, text);
    }

    const content = inlines.map(x => x.content).join('');

    const styleName = styleResolved?.name || null;
    const blockStyle = {};
    if (pAlign) blockStyle.textAlign = pAlign;
    if (indent.left != null || indent.firstLine != null || indent.hanging != null) {
      blockStyle.indent = indent;
    }
    if (spacing) blockStyle.spacing = spacing;

    blocks.push({
      style: blockStyle,
      ...(list ? { list } : {}),
      inlines,
      content,
      styleId: pStyleIdRaw || null,
      styleName
    });
  }

  return blocks;
}

// ---------- Page / Sections ----------
function guessPaperNameTwip(w, h) {
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  const W = Math.min(w, h);
  const H = Math.max(w, h);
  const TOL = 40; // twips
  const known = [
    { name: 'A5', w: 8391, h: 11906 },
    { name: 'A4', w: 11906, h: 16838 },
    { name: 'A3', w: 16838, h: 23811 },
    { name: 'Letter', w: 12240, h: 15840 },
    { name: 'Legal', w: 12240, h: 20160 },
    { name: 'Tabloid', w: 15840, h: 24480 },
  ];
  for (const k of known) {
    if (Math.abs(W - k.w) <= TOL && Math.abs(H - k.h) <= TOL) return k.name;
  }
  return null;
}

async function loadHeaderFooterBlocks(zip, relMap, refs, tagName, styles, numbering, themeMap) {
  // tagName: 'header' ou 'footer'
  const out = {};
  for (const ref of ensureArray(refs)) {
    const type = (ref?.['@_type'] || 'default').toLowerCase(); // default|first|even
    const relId = ref?.['@_id'];
    if (!relId) continue;
    const target = relMap.get(relId);
    if (!target) continue;
    const xml = await zip.file(target)?.async('string');
    if (!xml) continue;
    const obj = parser.parse(xml);
    const root = tagName === 'header' ? obj?.hdr : obj?.ftr;
    const paragraphs = ensureArray(root?.p);
    const blocks = extractBlocksFromParagraphArray(paragraphs, styles, numbering, themeMap);
    out[type] = { blocks };
  }
  return out;
}

async function sectionFromSectPr(sectPr, zip, relMap, styles, numbering, themeMap) {
  if (!sectPr) return null;

  const pgSz = sectPr.pgSz || {};
  const wTwip = Number(pgSz['@_w'] || NaN);
  const hTwip = Number(pgSz['@_h'] || NaN);
  const widthPt = Number.isFinite(wTwip) ? dxaToPoints(wTwip) : null;
  const heightPt = Number.isFinite(hTwip) ? dxaToPoints(hTwip) : null;
  let orientation = (pgSz['@_orient'] || '').toLowerCase();
  if (!orientation) {
    if (Number.isFinite(wTwip) && Number.isFinite(hTwip)) {
      orientation = (wTwip > hTwip) ? 'landscape' : 'portrait';
    } else {
      orientation = 'portrait';
    }
  }

  const sizeName = (Number.isFinite(wTwip) && Number.isFinite(hTwip))
    ? guessPaperNameTwip(wTwip, hTwip)
    : null;

  const pgMar = sectPr.pgMar || {};
  const margins = {
    top: dxaToPoints(pgMar['@_top']),
    right: dxaToPoints(pgMar['@_right']),
    bottom: dxaToPoints(pgMar['@_bottom']),
    left: dxaToPoints(pgMar['@_left']),
    header: dxaToPoints(pgMar['@_header']),
    footer: dxaToPoints(pgMar['@_footer']),
    gutter: dxaToPoints(pgMar['@_gutter']),
  };

  const headerRefs = ensureArray(sectPr.headerReference);
  const footerRefs = ensureArray(sectPr.footerReference);

  const headers = await loadHeaderFooterBlocks(zip, relMap, headerRefs, 'header', styles, numbering, themeMap);
  const footers = await loadHeaderFooterBlocks(zip, relMap, footerRefs, 'footer', styles, numbering, themeMap);

  return {
    page: {
      size: {
        widthTwip: Number.isFinite(wTwip) ? wTwip : null,
        heightTwip: Number.isFinite(hTwip) ? hTwip : null,
        widthPt, heightPt,
        name: sizeName,
      },
      orientation,
    },
    margins,
    headers,
    footers,
  };
}

// dump auxiliar
async function dumpWordXml(zip, targetDir) {
  const fileNames = Object.keys(zip.files)
    .filter(n => n.startsWith('word/') && (n.endsWith('.xml') || n.endsWith('.rels')));
  if (!fileNames.length) {
    console.error('[dump-xml] Nenhum XML encontrado na pasta word/.');
    return;
  }
  for (const name of fileNames) {
    const outFile = path.join(targetDir, name.replace(/\//g, path.sep));
    const outFolder = path.dirname(outFile);
    if (outFolder !== path.parse(outFolder).root) {
      await fs.promises.mkdir(outFolder, { recursive: true });
    }
    const content = await zip.file(name).async('string');
    await fs.promises.writeFile(outFile, content, 'utf8');
  }
  console.error(`[dump-xml] XMLs extraídos para: ${targetDir}`);
}

// ---------- main ----------
async function main() {
  const data = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(data);

  if (dumpXmlRequested) {
    const parsedDump = path.parse(dumpDir);
    if (dumpDir !== parsedDump.root) {
      await fs.promises.mkdir(dumpDir, { recursive: true });
    }
    await dumpWordXml(zip, dumpDir);
  }

  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) {
    console.error('document.xml não encontrado no .docx');
    process.exit(2);
  }
  const themeXml = await zip.file('word/theme/theme1.xml')?.async('string');
  const stylesXml = await zip.file('word/styles.xml')?.async('string');
  const numberingXml = await zip.file('word/numbering.xml')?.async('string');

  const themeMap = parseTheme(themeXml);
  const styles = parseStyles(stylesXml, themeMap);
  const numbering = parseNumbering(numberingXml);
  const relMap = await parseDocRels(zip);

  const doc = parser.parse(documentXml);
  const body = doc?.document?.body;

  // 1) Corpo -> blocks
  const paragraphs = ensureArray(body?.p);
  const blocks = extractBlocksFromParagraphArray(paragraphs, styles, numbering, themeMap);

  // 2) Seções (sectPr no pPr e/ou body.sectPr)
  const sections = [];
  for (const p of paragraphs) {
    const sectPr = p?.pPr?.sectPr;
    if (sectPr) {
      const sec = await sectionFromSectPr(sectPr, zip, relMap, styles, numbering, themeMap);
      if (sec) sections.push(sec);
    }
  }
  if (body?.sectPr) {
    const lastSec = await sectionFromSectPr(body.sectPr, zip, relMap, styles, numbering, themeMap);
    if (lastSec) sections.push(lastSec);
  }

  // 3) Título (heurística simples)
  let title = null;
  const titleIdxByStyle = blocks.findIndex(b => {
    const n = (b.styleName || '').toLowerCase();
    const id = (b.styleId || '').toLowerCase();
    return n.includes('title') || n.includes('título') || id === 'title';
  });
  if (titleIdxByStyle >= 0) {
    title = { style: { textAlign: blocks[titleIdxByStyle].style?.textAlign || null }, content: blocks[titleIdxByStyle].content };
  } else {
    const titleIdxHeuristic = blocks.findIndex(b =>
      b.style?.textAlign === 'center' &&
      (b.content || '').trim().length >= 8
    );
    if (titleIdxHeuristic >= 0) {
      title = { style: { textAlign: 'center' }, content: blocks[titleIdxHeuristic].content };
    }
  }

  const result = { ...(title ? { title } : {}), blocks, ...(sections.length ? { sections } : {}) };

  const outDir = path.dirname(outPath);
  const parsed = path.parse(outDir);
  if (outDir !== parsed.root) {
    await fs.promises.mkdir(outDir, { recursive: true });
  }
  await fs.promises.writeFile(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(outPath);
}

main().catch(err => {
  console.error('Erro ao processar .docx:', err);
  process.exit(3);
});