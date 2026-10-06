/**
 * EXTRACT OFFICIAL — AHSP Bina Marga item parser (Lampiran II SE DJBK 47/2026)
 *
 * Document structure, established empirically from the extracted cache:
 *
 *   [detail pages]   first page carries the item header:
 *                      "I.144 Kereb Penghubung Tegak Menurun ... (9.2.(22r))"
 *                      "No. U R A I A N KODE KOEF. SATUAN KETERANGAN"
 *                      "I. ASUMSI" ... "3. TENAGA" ...
 *                      "... Didapat Harga Satuan Pekerjaan : Rp. X /Buah"
 *
 *   [analisa page]   immediately AFTER the detail pages:
 *                      "PERKIRAAN HARGA JUMLAH"
 *                      "A. TENAGA / 1. Pekerja L01 jam 0,72 27.643,54 19.983,28"
 *                      "JUMLAH HARGA TENAGA  30.996,78"
 *                      "E. OVERHEAD & PROFIT 10,0 % x D 160.264,66"
 *                      "F. HARGA SATUAN PEKERJAAN ( D + E ) 1.762.911,28"
 *
 * So an item = one header page + N detail pages + one analisa page, in that order.
 * Items are paired by position: each analisa page belongs to the most recent header.
 *
 * Output: docs/_audit/lampiran2-official-items.json
 *
 * Read-only with respect to the PDF. Deterministic.
 *
 * Usage: npx tsx scripts/extractOfficialAhsp.ts [--dump-serial I.144]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const CACHE = path.join(process.cwd(), 'docs', '_audit', 'lampiran2-pages.jsonl');
const OUT_DIR = path.join(process.cwd(), 'docs', '_audit');
const OUT_PATH = path.join(OUT_DIR, 'lampiran2-official-items.json');

interface PageRecord { page: number; chars: number; lines: string[] }

export interface OfficialComponent {
  componentType: 'TENAGA' | 'BAHAN' | 'PERALATAN';
  index: number;
  name: string;
  code: string;
  unit: string;
  coefficient: number;
  unitPrice: number;
  total: number;
  raw: string;
}

export interface OfficialItem {
  serial: string;
  code: string;
  /** Code with whitespace removed — the form used for cross-dataset matching. */
  codeNormalized: string;
  name: string;
  unit: string | null;
  headerPage: number;
  printedPage: number | null;
  analisaPage: number | null;
  /** Number format of the analysis table — Lampiran II mixes ID and US formats. */
  numberFormat: NumberFormat | null;
  components: OfficialComponent[];
  totalLabor: number | null;
  totalMaterial: number | null;
  totalEquipment: number | null;
  totalABC: number | null;
  overheadProfitPercent: number | null;
  overheadProfitAmount: number | null;
  hargaSatuan: number | null;
  warnings: string[];
}

function loadCache(): PageRecord[] {
  if (!fs.existsSync(CACHE)) {
    console.error(`Cache not found: ${CACHE}\nRun: npx tsx scripts/extractLampiranII.ts`);
    process.exit(1);
  }
  return fs
    .readFileSync(CACHE, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as PageRecord);
}

/**
 * Lampiran II mixes TWO number formats, and they differ at item level:
 *  - most analysis tables are Indonesian  -> 0,2914 | 27.643,54 | 8.055,76
 *  - a minority of items are US           -> 0.0402 | 27,643.54 | 1,110.18
 *     (confirmed on page 624, item 5.1.(1b))
 *
 * Assuming one format silently corrupts coefficients: the coefficient "1.2613"
 * became 12613 under a naive "strip all dots" rule. Format is therefore detected
 * per analysis table, never guessed per document.
 */
type NumberFormat = 'ID' | 'US';

const US_DECIMAL_RE = /\d{1,3}(?:,\d{3})+\.\d{2}/g;
const ID_DECIMAL_RE = /\d{1,3}(?:\.\d{3})+,\d{2}/g;

/** Detect the format of an analysis table from its unambiguous 2-decimal tokens. */
function detectNumberFormat(lines: string[]): NumberFormat {
  let us = 0;
  let id = 0;
  for (const l of lines) {
    us += (l.match(US_DECIMAL_RE) || []).length;
    id += (l.match(ID_DECIMAL_RE) || []).length;
  }
  return us > id ? 'US' : 'ID';
}

/** Indonesian number format: 1.234.567,89 (dot = thousands, comma = decimal). */
function parseIdNumber(s: string, fmt: NumberFormat = 'ID'): number | null {
  if (!s) return null;
  const t = s.replace(/\s/g, '');
  if (!/^-?[\d.,]+$/.test(t)) return null;
  const cleaned = fmt === 'US' ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(/,/g, '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Extract the printed page number from the "- 4069 -" running header. */
function printedPageOf(lines: string[]): number | null {
  for (const l of lines.slice(0, 4)) {
    const m = l.match(/^-\s*(\d+)\s*-$/);
    if (m) return Number(m[1]);
  }
  return null;
}

const SERIAL_RE = /^([A-Z]{1,3})\.(\d{1,3})\s+(\S.*)$/;
const TABLE_HEADER_RE = /^No\.?\s+U\s*R\s*A\s*I\s*A\s*N/;

/**
 * Shape of an AHSP code as printed in the document.
 *
 * Real examples, from simplest to nastiest:
 *   2.1.(1)              simple
 *   2.3.(3a)             letter suffix
 *   3.2.(2a1)            letter + digit suffix
 *   7.2.(7).65.50-60     nested parenthetical AND a hyphen range
 *   7.2.(10).16,5        decimal COMMA inside the code
 *   9.2 (35)             the document itself prints a space where a dot belongs
 *
 * The charset is deliberately tight (digits, dots, commas, parens, hyphens,
 * lowercase, spaces). `isValidAhspCode` additionally demands a separator, so a
 * bare "7" can never qualify — every one of the 61 "bare numeric" codes produced
 * by the first, looser pattern was a truncation of a longer code.
 */
const AHSP_CODE_RE = /^[0-9][0-9.,()a-z\s-]*[0-9a-z)]$/;

interface ParenGroup {
  start: number;
  end: number;
  inner: string;
}

/** Every balanced parenthesised group, innermost closed first. */
function balancedGroups(s: string): ParenGroup[] {
  const out: ParenGroup[] = [];
  const stack: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') stack.push(i);
    else if (ch === ')') {
      const open = stack.pop();
      if (open === undefined) continue;
      out.push({ start: open, end: i, inner: s.slice(open + 1, i) });
    }
  }
  return out;
}

function isValidAhspCode(s: string): boolean {
  if (!s || s.length > 28) return false;
  if (!AHSP_CODE_RE.test(s)) return false;
  // A real code is hierarchical; a bare number is a truncation artefact.
  return /[.,(]/.test(s);
}

/**
 * The AHSP code in a description.
 *
 * LONGEST valid candidate wins, which fixes two failure modes at once:
 *   - nesting: inside `(7.2.(7).65.50-60)` the inner `(7)` also parses, but the
 *     parent is longer and is the real code;
 *   - repeats: a page can print the code twice ("NO.(5.1.(1b)) : 5.1.(1b)"),
 *     where a "last match wins" rule picked the shorter fragment.
 */
function extractAhspCode(joined: string): string {
  let best = '';
  for (const g of balancedGroups(joined)) {
    const inner = g.inner.replace(/\s+/g, ' ').trim();
    if (!isValidAhspCode(inner)) continue;
    if (inner.length >= best.length) best = inner;
  }
  return best;
}

/** Whitespace-free form used for cross-dataset matching. */
function normalizeCode(code: string): string {
  return code.replace(/\s+/g, '');
}

/** Strip the trailing "(code)" parenthetical from a description, nesting-aware. */
function stripTrailingCode(name: string, code: string): string {
  if (!code) return name;
  for (const g of balancedGroups(name)) {
    if (g.inner.replace(/\s+/g, ' ').trim() !== code) continue;
    // Only strip when the group actually ends the description (allowing
    // trailing punctuation and whitespace, and a wrapped continuation).
    const tail = name.slice(g.end + 1).trim();
    if (tail === '' || /^[,;:\s]*$/.test(tail) || tail.length <= 2) {
      return name.slice(0, g.start).trim();
    }
  }
  return name;
}

interface HeaderScan {
  serial: string;
  name: string;
  code: string;
}

/**
 * A page starts a new item when one of its first few lines is a serial header
 * ("I.144 Kereb ...") AND the page also carries the AHSP column header.
 * Requiring both prevents matching prose lines that merely begin with "I.144".
 */
function scanHeader(rec: PageRecord): HeaderScan | null {
  const hasTableHeader = rec.lines.some((l) => TABLE_HEADER_RE.test(l));
  if (!hasTableHeader) return null;

  for (let i = 0; i < Math.min(5, rec.lines.length); i++) {
    const m = rec.lines[i].match(SERIAL_RE);
    if (!m) continue;

    const serial = `${m[1]}.${m[2]}`;
    const rest = m[3];

    // The AHSP code sits in parentheses, usually at the end of the description,
    // possibly wrapping onto the following line(s). See AHSP_CODE_RE for the
    // full list of shapes the document actually uses.
    const joined = [rest, rec.lines[i + 1] || '', rec.lines[i + 2] || ''].join(' ');
    const code = extractAhspCode(joined);

    // Name = description with the trailing code parenthetical removed.
    // The description itself can wrap across lines, so grow it only until the
    // code group is complete — appending further lines would pull in the next
    // section header and defeat the trailing-strip test.
    const cand = [rest, rec.lines[i + 1] || '', rec.lines[i + 2] || ''];
    const hasCode = (s: string) =>
      balancedGroups(s).some((g) => g.inner.replace(/\s+/g, ' ').trim() === code);
    let desc = cand[0];
    if (code && !hasCode(desc)) {
      for (let k = 1; k < cand.length; k++) {
        if (!cand[k]) break;
        desc = `${desc} ${cand[k]}`.replace(/\s+/g, ' ').trim();
        if (hasCode(desc)) break;
      }
    }
    // Rejoin a number range split by the line wrap ("50-\n60 m" -> "50-60 m").
    desc = desc.replace(/(\d)-\s+(\d)/g, '$1-$2');
    let name = stripTrailingCode(desc, code);
    name = name.replace(/[,;:\s]+$/, '').trim();

    return { serial, name, code };
  }
  return null;
}

/**
 * Parse one analisa page.
 *
 * Row shape after coordinate reconstruction:
 *   1. Pekerja L01 jam 0,72 27.643,54 19.983,28
 *   1 Pekerja L01 jam 0,0607 27.643,54 1.678,60     <- index WITHOUT a dot
 *   2. FLAT BED TRUCK 4 TON E11 Jam 0,047 410.265,86 19.177,81
 *   3. Alat Bantu Ls 1,000 0,00 0,00                <- code column empty
 *
 * The dot after the row index is optional in the source document (both styles occur),
 * so the pattern allows it. Parse from the right: total, unitPrice, coefficient,
 * unit, code, name.
 */
const ROW_RE = /^(\d{1,2})\.?\s+(.+?)\s+(\S+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/;
const COMPONENT_CODE_RE = /^[A-Z]{1,3}\d{1,3}[A-Za-z']{0,6}$/;

function parseAnalisaPage(rec: PageRecord): {
  components: OfficialComponent[];
  totalLabor: number | null;
  totalMaterial: number | null;
  totalEquipment: number | null;
  totalABC: number | null;
  overheadProfitPercent: number | null;
  overheadProfitAmount: number | null;
  hargaSatuan: number | null;
  warnings: string[];
} {
  const components: OfficialComponent[] = [];
  const warnings: string[] = [];
  const fmt = detectNumberFormat(rec.lines);
  let section: OfficialComponent['componentType'] | null = null;
  let totalLabor: number | null = null;
  let totalMaterial: number | null = null;
  let totalEquipment: number | null = null;
  let totalABC: number | null = null;
  let overheadProfitPercent: number | null = null;
  let overheadProfitAmount: number | null = null;
  let hargaSatuan: number | null = null;

  for (const line of rec.lines) {
    const t = line.trim();

    if (/^A\.\s*TENAGA/i.test(t)) { section = 'TENAGA'; continue; }
    if (/^B\.\s*BAHAN/i.test(t)) { section = 'BAHAN'; continue; }
    if (/^C\.\s*PERALATAN/i.test(t)) { section = 'PERALATAN'; continue; }

    if (/^JUMLAH HARGA TENAGA/i.test(t)) {
      totalLabor = parseIdNumber(t.replace(/^JUMLAH HARGA TENAGA/i, '').trim(), fmt);
      continue;
    }
    if (/^JUMLAH HARGA BAHAN/i.test(t)) {
      totalMaterial = parseIdNumber(t.replace(/^JUMLAH HARGA BAHAN/i, '').trim(), fmt);
      continue;
    }
    if (/^JUMLAH HARGA PERALATAN/i.test(t)) {
      totalEquipment = parseIdNumber(t.replace(/^JUMLAH HARGA PERALATAN/i, '').trim(), fmt);
      continue;
    }
    if (/^D\.\s*JUMLAH HARGA TENAGA/i.test(t)) {
      const nums = t.match(/([\d.]+,\d{2})\s*$/);
      if (nums) totalABC = parseIdNumber(nums[1], fmt);
      continue;
    }
    if (/^E\.\s*OVERHEAD/i.test(t)) {
      const pct = t.match(/([\d.,]+)\s*%/);
      if (pct) overheadProfitPercent = parseIdNumber(pct[1], fmt);
      const nums = t.match(/([\d.]+,\d{2})\s*$/);
      if (nums) overheadProfitAmount = parseIdNumber(nums[1], fmt);
      continue;
    }
    if (/^F\.\s*HARGA SATUAN PEKERJAAN/i.test(t)) {
      const nums = t.match(/([\d.]+,\d{2})\s*$/);
      if (nums) hargaSatuan = parseIdNumber(nums[1], fmt);
      // Everything after F is the boilerplate note. Stop reading components here so
      // numbered note lines can never be mistaken for component rows.
      section = null;
      continue;
    }

    if (!section) continue;

    const m = t.match(ROW_RE);
    if (!m) {
      // A short, unnumbered line inside a component block is a wrapped component
      // name (e.g. "beton diameter dalam 40 cm"). Append it to the previous row
      // rather than inventing a new component.
      const last = components[components.length - 1];
      const looksLikeRowAttempt = /^\d{1,2}\.?\s/.test(t);
      if (last && !looksLikeRowAttempt && t.length <= 70 && !/^[A-F]\.\s/.test(t)) {
        last.name = `${last.name} ${t}`.replace(/\s+/g, ' ').trim();
        last.raw = `${last.raw} ⏎ ${t}`;
      } else if (looksLikeRowAttempt && t.length > 12) {
        // Report, never guess — the parser must not invent a coefficient.
        warnings.push(`baris komponen tidak terbaca: ${t.slice(0, 90)}`);
      }
      continue;
    }

    const [, idxStr, nameRaw, unit, coefStr, priceStr, totalStr] = m;
    let name = nameRaw.trim();
    let code = '';

    // The code column may be empty; when present it is the last token of the name.
    const nameParts = name.split(/\s+/);
    if (nameParts.length > 1 && COMPONENT_CODE_RE.test(nameParts[nameParts.length - 1])) {
      code = nameParts[nameParts.length - 1];
      name = nameParts.slice(0, -1).join(' ');
    }

    const coefficient = parseIdNumber(coefStr, fmt);
    const unitPrice = parseIdNumber(priceStr, fmt);
    const total = parseIdNumber(totalStr, fmt);

    if (coefficient === null || unitPrice === null || total === null) {
      warnings.push(`angka tidak valid: ${t.slice(0, 90)}`);
      continue;
    }

    components.push({
      componentType: section,
      index: Number(idxStr),
      name,
      code,
      unit,
      coefficient,
      unitPrice,
      total,
      raw: t,
    });
  }

  // Arithmetic self-check: components must sum to the reported section totals.
  const sumBy = (type: OfficialComponent['componentType']) =>
    components.filter((c) => c.componentType === type).reduce((a, c) => a + c.total, 0);

  const checks: [string, number, number | null][] = [
    ['TENAGA', sumBy('TENAGA'), totalLabor],
    ['BAHAN', sumBy('BAHAN'), totalMaterial],
    ['PERALATAN', sumBy('PERALATAN'), totalEquipment],
  ];
  for (const [label, sum, reported] of checks) {
    if (reported !== null && Math.abs(sum - reported) > 1.0) {
      warnings.push(`jumlah ${label} tidak cocok: komponen=${sum.toFixed(2)} vs dokumen=${reported.toFixed(2)}`);
    }
  }

  if (totalABC !== null) {
    const computed = (totalLabor ?? 0) + (totalMaterial ?? 0) + (totalEquipment ?? 0);
    if (Math.abs(computed - totalABC) > 2.0) {
      warnings.push(`total A+B+C tidak cocok: hitung=${computed.toFixed(2)} vs dokumen=${totalABC.toFixed(2)}`);
    }
  }

  return {
    components,
    totalLabor,
    totalMaterial,
    totalEquipment,
    totalABC,
    overheadProfitPercent,
    overheadProfitAmount,
    hargaSatuan,
    warnings,
  };
}

/** Item unit from the detail page: "Rp. 1.762.911,28 /Buah". */
function scanItemUnit(rec: PageRecord): string | null {
  for (const l of rec.lines) {
    const m = l.match(/Rp\.?\s*[\d.,]+\s*\/\s*(\S+)\s*$/);
    if (m) return m[1];
  }
  return null;
}

function main() {
  const cache = loadCache();
  const items: OfficialItem[] = [];
  let current: OfficialItem | null = null;
  let headerPages = 0;
  let analisaPages = 0;
  let orphanAnalisa = 0;

  for (const rec of cache) {
    const header = scanHeader(rec);
    if (header) {
      headerPages += 1;
      current = {
        serial: header.serial,
        code: header.code,
        codeNormalized: normalizeCode(header.code),
        name: header.name,
        unit: scanItemUnit(rec),
        headerPage: rec.page,
        printedPage: printedPageOf(rec.lines),
        analisaPage: null,
        numberFormat: null,
        components: [],
        totalLabor: null,
        totalMaterial: null,
        totalEquipment: null,
        totalABC: null,
        overheadProfitPercent: null,
        overheadProfitAmount: null,
        hargaSatuan: null,
        warnings: [],
      };
      items.push(current);
      continue;
    }

    const isAnalisa = rec.lines.some((l) => /PERKIRAAN HARGA JUMLAH/i.test(l))
      && rec.lines.some((l) => /F\.\s*HARGA SATUAN PEKERJAAN/i.test(l));

    if (isAnalisa) {
      analisaPages += 1;
      if (!current) { orphanAnalisa += 1; continue; }
      if (current.analisaPage !== null) {
        // A second analisa before a new header: treat as a new unknown item.
        orphanAnalisa += 1;
        continue;
      }
      const parsed = parseAnalisaPage(rec);
      current.analisaPage = rec.page;
      current.numberFormat = detectNumberFormat(rec.lines);
      current.components = parsed.components;
      current.totalLabor = parsed.totalLabor;
      current.totalMaterial = parsed.totalMaterial;
      current.totalEquipment = parsed.totalEquipment;
      current.totalABC = parsed.totalABC;
      current.overheadProfitPercent = parsed.overheadProfitPercent;
      current.overheadProfitAmount = parsed.overheadProfitAmount;
      current.hargaSatuan = parsed.hargaSatuan;
      current.warnings = parsed.warnings;
      continue;
    }

    // Continuation detail page — may still carry the item unit.
    if (current && current.unit === null) {
      const u = scanItemUnit(rec);
      if (u) current.unit = u;
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'Lampiran II SE DJBK No. 47/SE/Dk/2026 — AHSP Bidang Bina Marga',
    sourceFile: 'Lampiran-II-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Bina-Marga.pdf',
    totalPages: cache.length,
    headerPages,
    analisaPages,
    orphanAnalisa,
    items,
  }, null, 1));

  // ---- diagnostics ----
  const withAnalisa = items.filter((i) => i.analisaPage !== null);
  const withPrice = items.filter((i) => i.hargaSatuan !== null);
  const withComponents = items.filter((i) => i.components.length > 0);
  const withWarnings = items.filter((i) => i.warnings.length > 0);
  const noCode = items.filter((i) => !i.code);

  console.log('='.repeat(78));
  console.log('EXTRACT OFFICIAL — AHSP BINA MARGA');
  console.log('='.repeat(78));
  console.log(`  halaman cache          : ${cache.length}`);
  console.log(`  halaman header item    : ${headerPages}`);
  console.log(`  halaman analisa        : ${analisaPages}`);
  console.log(`  analisa tanpa induk    : ${orphanAnalisa}`);
  console.log('');
  console.log(`  item terbentuk         : ${items.length}`);
  console.log(`    punya halaman analisa: ${withAnalisa.length}`);
  console.log(`    punya komponen       : ${withComponents.length}`);
  console.log(`    punya harga satuan   : ${withPrice.length}`);
  console.log(`    tanpa kode AHSP      : ${noCode.length}`);
  console.log(`    ada peringatan       : ${withWarnings.length}`);
  const usItems = items.filter((i) => i.numberFormat === 'US');
  console.log(`    format angka US      : ${usItems.length}`);
  console.log(`    format angka ID      : ${items.filter((i) => i.numberFormat === 'ID').length}`);
  console.log('');
  const totalComponents = items.reduce((a, i) => a + i.components.length, 0);
  console.log(`  total baris komponen   : ${totalComponents}`);
  console.log('');

  const serials = new Set(items.map((i) => i.serial));
  console.log(`  serial unik            : ${serials.size}`);
  const codeSet = new Set(items.map((i) => i.code).filter(Boolean));
  console.log(`  kode AHSP unik         : ${codeSet.size}`);
  console.log('');

  // Sample distribution of component types
  const byType: Record<string, number> = {};
  for (const i of items) for (const c of i.components) byType[c.componentType] = (byType[c.componentType] || 0) + 1;
  console.log('  distribusi jenis komponen:', byType);
  console.log('');

  const dumpSerial = process.argv.includes('--dump-serial')
    ? process.argv[process.argv.indexOf('--dump-serial') + 1]
    : null;
  if (dumpSerial) {
    const it = items.find((i) => i.serial === dumpSerial);
    console.log(`--- DUMP ${dumpSerial} ---`);
    console.log(JSON.stringify(it, null, 2).slice(0, 4000));
    console.log('');
  }

  console.log('  10 item pertama:');
  for (const i of items.slice(0, 10)) {
    console.log(`    ${i.serial.padEnd(7)} code=${(i.code || '(none)').padEnd(14)} page=${i.headerPage}/analisa=${i.analisaPage ?? '-'} comps=${String(i.components.length).padStart(2)} harga=${i.hargaSatuan ?? '-'}`);
  }
  console.log('');
  console.log(`>> ${path.relative(process.cwd(), OUT_PATH)}`);
}

main();
