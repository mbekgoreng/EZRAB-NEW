/**
 * PARSE + NORMALIZE — SE DJBK No. 47/SE/Dk/2026 AHSP attachments.
 *
 * Consumes the RAW page layer (`data/ahsp2026/raw/*.raw.jsonl`) and produces the
 * NORMALIZED layer (`data/ahsp2026/normalized/ahsp_2026_normalized.json`).
 *
 * Design rules (master prompt §2, §11, §19, §28):
 *   - Nothing is invented. A field that cannot be read from the source is left
 *     empty and the record is flagged `needs_review`.
 *   - The coefficient is preserved twice: `coefficient` (numeric, normalized) and
 *     `coefficient_raw` (exactly as printed, e.g. "0,150").
 *   - Component type is taken from the DOCUMENT SECTION it appears under
 *     (Tenaga Kerja / Bahan / Peralatan), never guessed from a code prefix.
 *   - No prices are carried into the normalized item (§13).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { RawPage, readJsonl } from './core';
import {
  AHSPComponent, AHSPField, ResourceType, CALCULATION_TEMPLATE, REGULATION,
} from './types';

const RAW_DIR = path.join(process.cwd(), 'data', 'ahsp2026', 'raw');

/* ------------------------------------------------------------------ */
/* Number helpers                                                      */
/* ------------------------------------------------------------------ */

/**
 * Parse a number printed in Indonesian convention ('.' = thousands, ',' = decimal).
 * Returns null when the token is not a plain number.
 */
export function parseIdNumber(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '');
  if (!s) return null;
  if (!/^[-+]?[\d.,]+$/.test(s)) return null;
  let t = s;
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(/,/g, '.');
  } else {
    // No comma: dots are thousands separators when they group 3 digits.
    t = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Units that may legitimately appear in the `Satuan` column of an AHSP table. */
const UNIT_TOKENS = new Set([
  'OH', 'OJ', 'jam', 'Jam', 'hari', 'Hari', 'bulan', 'tahun',
  'm', "m'", 'm1', 'm2', 'm3', 'm4', 'km', 'cm', 'mm', 'mm2', 'cm2', 'm2/hari', 'm3/hari',
  'kg', 'ton', 'kwintal', 'liter', 'ltr', 'L', 'ml', 'sak', 'zak', 'batang', 'btg',
  'lembar', 'keping', 'buah', 'bh', 'unit', 'ls', 'set', 'titik', 'ha', 'orang',
  'kali', 'pcs', 'roll', 'meter', 'lot', 'paket', 'trip', 'rit', 'hari/orang',
  'unit/jam', 'm3/jam', 'm2/jam', 'ton/km', 'ton-km', 'orang/hari', 'OH/hari',
  'm1/hari', 'unit/hari', 'titik/hari', 'm/hari', 'km/hari', 'liter/jam', 'kg/jam',
  'jam/hari', 'kali/hari', 'bulan/hari', 'bln', 'lusin', 'kantong', 'drum', 'galon',
  'tangki', 'boks', 'karung', 'gulung', 'bungkus', 'pak', 'tablet', 'sampel', 'stok',
  'bulan/orang', 'hari/bulan', 'orang/bulan', 'kali/tahun', 'kali/proyek', 'm2/unit',
]);

const NUM_RE = /^[-+]?\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^[-+]?\d+(?:,\d+)?$/;

function isNumericToken(s: string): boolean {
  return NUM_RE.test(s.trim());
}

/** Resource code as printed in the Satuan Daya / Kode column, e.g. L.01, M.23, E.05. */
const RES_CODE_RE = /^[A-Z]{1,2}\.\d{1,2}[a-z]?$/;

/* ------------------------------------------------------------------ */
/* Row parsers                                                         */
/* ------------------------------------------------------------------ */

export interface RawComponentRow {
  index: number | null;
  name: string;
  code: string;
  unit: string;
  coefficient_raw: string;
  trailing: string;
}

/**
 * Parse one analysis-table component row.
 *
 * Two layouts occur across the attachments:
 *   SDA   : `<n> <name> <code> <unit> <coefficient> [<unit price> <total price>]`
 *   CK    : `<name> <code> <unit> <coefficient>`            (no index column)
 *
 * Strategy: locate the LAST unit token that is immediately followed by a number.
 * That pair is the (Satuan, Koefisien) columns — everything after it is the price
 * columns (present only in some tables) and everything before it is index/name/code.
 * Using "last unit followed by a number" is what makes the priced and un-priced
 * layouts parse identically.
 */
export function parseComponentRow(line: string): RawComponentRow | null {
  const s = line.trim();
  if (!s) return null;

  const tokens = s.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length < 3) return null;

  // Find the rightmost (unit, number) pair.
  let unitIdx = -1;
  for (let j = tokens.length - 2; j >= 0; j--) {
    if (UNIT_TOKENS.has(tokens[j]) && isNumericToken(tokens[j + 1])) { unitIdx = j; break; }
  }
  if (unitIdx < 1) return null;

  const unit = tokens[unitIdx];
  const coefficient_raw = tokens[unitIdx + 1];

  // Code column (optional) sits immediately before the unit.
  let code = '';
  let nameEnd = unitIdx;
  const codeCandidate = tokens[unitIdx - 1];
  if (RES_CODE_RE.test(codeCandidate)) { code = codeCandidate; nameEnd = unitIdx - 1; }

  // Index column (optional, SDA only) is the leading token.
  let index: number | null = null;
  let nameStart = 0;
  if (/^\d{1,3}$/.test(tokens[0]) && nameEnd > 1) { index = Number(tokens[0]); nameStart = 1; }

  const name = tokens.slice(nameStart, nameEnd).join(' ').trim();
  // A name may legitimately be empty here: some layouts print the resource name on
  // its own line and the `<code> <unit> <coefficient>` columns on the next. The
  // caller re-attaches the buffered name. Without a code there is nothing to anchor
  // the row, so reject.
  if (!name && !code) return null;
  // A "name" that is only a number is a layout artefact, not a resource.
  if (name && /^[\d.,]+$/.test(name)) return null;
  // Reject list markers from narrative rows ("a tanah subur : 75").
  if (/^[a-z]\s/.test(name)) return null;
  // A trailing colon means this is a narrative fragment, not a resource row.
  if (/:$/.test(name)) return null;

  return {
    index,
    name,
    code,
    unit,
    coefficient_raw,
    trailing: tokens.slice(unitIdx + 2).join(' '),
  };
}

/** Section markers inside an AHSP analysis table. */
const SECTION_RE = {
  labor: /^A\s*\.?\s*Tenaga Kerja\b/i,
  material: /^B\s*\.?\s*Bahan\b/i,
  equipment: /^C\s*\.?\s*Peralatan\b/i,
};
const SECTION_END_RE = /^(Jumlah Harga|Jumlah Harga Tenaga|JUMLAH HARGA)/i;
const TABLE_FOOTER_RE = /^[DEF]\s+Jumlah Harga|^[EF]\s+Biaya Umum|^[F]\s+Harga Satuan Pekerjaan/i;
const TABLE_HEADER_RE = /No\.?\s+Uraian\s+Kode\s+Satuan\s+Koefisien/i;

type SectionKey = 'labor' | 'material' | 'equipment' | null;

/* ------------------------------------------------------------------ */
/* Generic analysis-table walker                                       */
/* ------------------------------------------------------------------ */

export interface ParsedAnalysis {
  code: string;
  description: string;
  unit: string;
  source_page: number;
  components: { labor: AHSPComponent[]; material: AHSPComponent[]; equipment: AHSPComponent[] };
  notes: string[];
  issues: string[];
}

interface WalkerOptions {
  /** Matches an item header line and yields the code + the rest of the line. */
  headerRe: RegExp;
  /** Guard: reject a header candidate (e.g. a section heading). */
  isRealItem?: (lines: string[], i: number) => boolean;
  /** Extract a unit from the description (e.g. "1 m2 ..." → "m2"). */
  unitFromDescription?: (desc: string) => string;
  /** Called for every confirmed item header — lets a field collect section headings. */
  onHeading?: (code: string, text: string, page: number) => void;
}

/**
 * Walk a document's reconstructed lines, splitting it into AHSP analysis items.
 *
 * Items are delimited by header lines. Component rows are classified by the
 * section marker they fall under, so no code-prefix guessing is involved.
 */
export function walkAnalyses(pages: RawPage[], opts: WalkerOptions): ParsedAnalysis[] {
  const out: ParsedAnalysis[] = [];
  // Flatten to (line, page) pairs — tables cross page boundaries.
  const flat: { line: string; page: number }[] = [];
  for (const p of pages) for (const l of p.raw_lines) flat.push({ line: l, page: p.source_page });

  let cur: ParsedAnalysis | null = null;
  let section: SectionKey = null;
  let lastComponent: AHSPComponent | null = null;
  let descOpen = false; // still collecting the (possibly wrapped) item description
  let nameBuffer: string[] = []; // name fragments printed before their (unit, coefficient) row

  const flush = () => {
    if (cur) {
      // Drop the trailing lines of the previous table that leaked into the description.
      cur.description = cur.description.replace(/\s+/g, ' ').trim();
      out.push(cur);
    }
    cur = null;
    section = null;
    lastComponent = null;
    descOpen = false;
    nameBuffer = [];
  };

  for (let i = 0; i < flat.length; i++) {
    const { line, page } = flat[i];
    const s = line.trim();
    if (!s) continue;

    // Skip running page numbers / document furniture.
    if (/^-\s*\d+\s*-?$/.test(s) || /^\d{1,4}$/.test(s)) continue;

    const hm = opts.headerRe.exec(s);
    if (hm && (!opts.isRealItem || opts.isRealItem(flat.map((f) => f.line), i))) {
      flush();
      const code = hm[1];
      let desc = hm[2] ?? '';
      cur = {
        code,
        description: desc,
        unit: opts.unitFromDescription ? opts.unitFromDescription(desc) : '',
        source_page: page,
        components: { labor: [], material: [], equipment: [] },
        notes: [],
        issues: [],
      };
      descOpen = true;
      continue;
    }

    if (!cur) {
      // Collect section headings so callers can build a division/category map.
      if (opts.onHeading) {
        const h = /^([A-Z]\.\d+(?:\.\w+)*|\d+(?:\.\d+)+)\s+(\S.*)$/.exec(s);
        if (h) opts.onHeading(h[1], h[2], page);
      }
      continue;
    }

    // --- inside an item ---

    // Table captions / column headers end the description block.
    if (TABLE_HEADER_RE.test(s)) { descOpen = false; nameBuffer = []; continue; }
    if (/^Harga\s+(Satuan|Jumlah)|^No\.?\s+Uraian|^\(Rp\)|^\d\s+\d\s+\d\s+\d|^No\.?\s+Uraian\s+Kode/.test(s)) {
      descOpen = false; nameBuffer = []; continue;
    }

    if (SECTION_RE.labor.test(s)) { section = 'labor'; descOpen = false; nameBuffer = []; continue; }
    if (SECTION_RE.material.test(s)) { section = 'material'; descOpen = false; nameBuffer = []; continue; }
    if (SECTION_RE.equipment.test(s)) { section = 'equipment'; descOpen = false; nameBuffer = []; continue; }
    if (SECTION_END_RE.test(s)) { section = null; descOpen = false; nameBuffer = []; continue; }
    if (TABLE_FOOTER_RE.test(s)) { section = null; descOpen = false; nameBuffer = []; continue; }

    if (descOpen) {
      // Continuation of the wrapped item description (only before the table body).
      cur.description += ' ' + s;
      if (!cur.unit && opts.unitFromDescription) {
        const u = opts.unitFromDescription(cur.description);
        if (u) cur.unit = u;
      }
      continue;
    }

    if (section) {
      const row = parseComponentRow(s);
      if (row) {
        const type: ResourceType = section === 'labor' ? 'labor' : section === 'material' ? 'material' : 'equipment';
        const coef = parseIdNumber(row.coefficient_raw);
        // Re-attach name fragments printed on their own line just above, dropping
        // the buffer when the row already repeats it (avoids "Mandor Mandor").
        let buf = nameBuffer.join(' ').replace(/\s+/g, ' ').trim();
        if (buf && row.name.toLowerCase().startsWith(buf.toLowerCase())) buf = '';
        const fullName = (buf ? `${buf} ${row.name}` : row.name).replace(/\s+/g, ' ').trim();
        if (!fullName) cur.issues.push(`resource name unreadable (code ${row.code || 'n/a'}, page ${page})`);
        const comp: AHSPComponent = {
          resource_code: row.code,
          resource_name: fullName,
          resource_type: type,
          unit: row.unit,
          coefficient: coef,
          coefficient_raw: row.coefficient_raw,
          source_page: page,
          raw: (buf ? buf + ' ⏎ ' : '') + s,
        };
        if (coef === null) cur.issues.push(`coefficient unreadable: "${row.coefficient_raw}" (${fullName})`);
        cur.components[section].push(comp);
        lastComponent = comp;
        nameBuffer = [];
      } else if (isNameFragment(s)) {
        // A resource name may wrap ABOVE its (unit, coefficient) row:
        //   "Fly ash (Kemasan 20"   ← printed above  → buffer, prepend
        //   "2   M.35 kg 113 ..."   ← the row itself
        // Only the prepend direction is used: appending trailing lines proved to
        // attach neighbouring resources far more often than it helped.
        nameBuffer.push(stripTrailingColumns(s));
        if (nameBuffer.length > 3) nameBuffer.shift();
      }
      continue;
    }

    // Notes / remarks between the description and the table (e.g. "Catatan: ...").
    if (/^(Catatan|Keterangan|Ket)\b/i.test(s)) cur.notes.push(s);
  }
  flush();
  return out;
}

/**
 * A line that may be a wrapped fragment of a resource name: short, mostly
 * alphabetic, not a section marker, not a numeric-only line.
 */
function isNameFragment(s: string): boolean {
  if (s.length > 70) return false;
  if (/^\d+([.,]\d+)?$/.test(s)) return false;
  // Pure roman numerals are column artefacts in the two-column layouts.
  if (/^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/.test(s)) return false;
  if (s.length < 3) return false;
  if (/^(JUMLAH|Jumlah|Sub\s*total|Subtotal|Catatan|Tabel|DIVISI|BAB|LAMPIRAN)/i.test(s)) return false;
  // Reject lines dominated by digits (price rows, page furniture).
  const digits = (s.match(/\d/g) || []).length;
  if (digits > s.replace(/\s/g, '').length * 0.4) return false;
  return /^[A-Za-z(]/.test(s);
}

/**
 * Strip trailing resource-code / unit tokens from a buffered name fragment.
 * Handles layouts where the code+unit columns land on the fragment line, e.g.
 * "Tukang Listrik/Elektronik L.02 OH" → "Tukang Listrik/Elektronik".
 */
function stripTrailingColumns(s: string): string {
  const tokens = s.split(/\s+/);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (RES_CODE_RE.test(last) || UNIT_TOKENS.has(last)) { tokens.pop(); continue; }
    break;
  }
  return tokens.join(' ').trim();
}

/* ------------------------------------------------------------------ */
/* SDA — Lampiran IV                                                   */
/* ------------------------------------------------------------------ */

const SDA_HEADER_RE = /^([A-Z]\.\d+(?:\.\w+)*)\s+(\S.*)$/;

/** True when the table header follows within a few lines → a real AHSP item. */
function followedByTable(lines: string[], i: number, window = 12): boolean {
  for (let k = i + 1; k <= Math.min(i + window, lines.length - 1); k++) {
    const t = lines[k].trim();
    if (!t) continue;
    if (TABLE_HEADER_RE.test(t)) return true;
    // A sibling/child AHSP code before any table header → this is a section heading.
    if (/^[A-Z]\.\d/.test(t)) return false;
  }
  return false;
}

/** Unit token as printed at the start of the description, e.g. "1 m2 ...", "Bongkar 1 m3 ...". */
function unitFromDescription(desc: string): string {
  const m = /(?:^|\s)(m2|m3|m1|m'|m|kg|ton|buah|unit|ls|set|bh|ha|km|cm|mm|liter|OH|jam|titik|batang|lembar)\b/i.exec(desc);
  return m ? m[1] : '';
}

export interface SdaInventoryRow {
  no: number;
  code: string;
  description: string;
  unit: string;
  normative: string;
  source_page: number;
  /** Set when the source printed the row without a code — never invented. */
  code_missing_in_source?: boolean;
}

/**
 * Parse the "Daftar Kode AHSP" index (pages 5–50) — the authoritative inventory.
 *
 * The annex prints rows numbered 1..1556. Phase 0.5 forensics found that **row
 * 810 is printed without a code** — the KODE column is blank in the source
 * (`810 Pondasi Tiang Bor ∅ 180 cm m' Informatif`, between 809 `A.3.06.5d` and
 * 811 `A.3.06.6a`). The row is kept with `code: ''` and flagged
 * `code_missing_in_source`; the code is NOT reconstructed, because guessing
 * `A.3.06.5e` from the neighbour pattern would be fabrication (§2).
 */
export function parseSdaInventory(pages: RawPage[]): SdaInventoryRow[] {
  const idx = pages.filter((p) => p.source_page >= 5 && p.source_page <= 50);
  const rows: SdaInventoryRow[] = [];
  const rowRe = /^(\d{1,4})\s+([A-Z]\.\d+(?:\.\w+)*)\s+(.*?)\s+([A-Za-z0-9'"²³\/\.\-]{1,14}|-)\s+(Normatif|Informatif)\s*$/;
  const codeLessRe = /^(\d{1,4})\s+(?!Normatif|Informatif)(.*?)\s+([A-Za-z0-9'"²³\/\.\-]{1,14})\s+(Normatif|Informatif)\s*$/;
  for (const p of idx) {
    for (const l of p.raw_lines) {
      const s = l.trim();
      const m = rowRe.exec(s);
      if (m) {
        rows.push({
          no: Number(m[1]),
          code: m[2],
          description: m[3].replace(/\s+/g, ' ').trim(),
          unit: m[4] === '-' ? '' : m[4],
          normative: m[5],
          source_page: p.source_page,
        });
      } else {
        const c = codeLessRe.exec(s);
        if (c && /^[A-Z]/.test(c[2])) {
          rows.push({
            no: Number(c[1]),
            code: '',
            description: c[2].replace(/\s+/g, ' ').trim(),
            unit: c[3],
            normative: c[4],
            source_page: p.source_page,
            code_missing_in_source: true,
          });
        } else if (rows.length > 0) {
          // Wrapped description continuation of the previous inventory row.
          const prev = rows[rows.length - 1];
          if (/^[A-Za-z0-9(]/.test(s) && !/^\d{1,4}\s+[A-Z]\./.test(s) && s.length < 90) {
            prev.description = `${prev.description} ${s}`.replace(/\s+/g, ' ').trim();
          }
        }
      }
    }
  }
  return rows;
}

export function parseSda(pages: RawPage[]): { inventory: SdaInventoryRow[]; analyses: ParsedAnalysis[]; headings: Map<string, string> } {
  const inventory = parseSdaInventory(pages);
  const headings = new Map<string, string>();
  const analyses = walkAnalyses(pages.filter((p) => p.source_page >= 51), {
    headerRe: SDA_HEADER_RE,
    isRealItem: (lines, i) => followedByTable(lines, i),
    unitFromDescription,
    onHeading: (code, text) => { if (!headings.has(code)) headings.set(code, text); },
  });
  return { inventory, analyses, headings };
}

/* ------------------------------------------------------------------ */
/* Cipta Karya — Lampiran VI                                           */
/* ------------------------------------------------------------------ */

const CK_HEADER_RE = /^(\d+(?:\.\d+)+(?:[a-z]|\.[a-z])?)\s+(\S.*)$/;

export const CK_DIVISIONS: Record<string, string> = {
  '1': 'DIVISI 1 - PERSIAPAN LAPANGAN / SITE WORK',
  '2': 'DIVISI 2 - PEKERJAAN STRUKTUR',
  '3': 'DIVISI 3 - PEKERJAAN ARSITEKTUR',
  '4': 'DIVISI 4 - PEKERJAAN LANSEKAP',
  '5': 'DIVISI 5 - PEKERJAAN MEKANIKAL DAN ELEKTRIKAL',
  '6': 'DIVISI 6 - PEKERJAAN PLAMBING',
  '7': 'DIVISI 7 - JALAN PADA PERMUKIMAN',
  '8': 'DIVISI 8 - DRAINASE JALAN',
  '9': 'DIVISI 9 - JARINGAN PIPA DI LUAR GEDUNG',
  '10': 'DIVISI 10 - SISTEM STRUKTUR RISHA',
};

/**
 * A CK line is a real item only when the analysis table header follows it.
 *
 * Descriptions wrap over 1–3 lines, so plain text between the code line and the
 * table header is expected. The only disqualifier is another code line: that
 * means the candidate is a section heading whose children come first.
 */
function ckIsRealItem(lines: string[], i: number, window = 10): boolean {
  for (let k = i + 1; k <= Math.min(i + window, lines.length - 1); k++) {
    const t = lines[k].trim();
    if (!t) continue;
    if (TABLE_HEADER_RE.test(t)) return true;
    if (CK_HEADER_RE.test(t)) return false; // child code first → section heading
    // otherwise: wrapped description text / table caption → keep scanning
  }
  return false;
}

export function parseCiptaKarya(pages: RawPage[]): ParsedAnalysis[] {
  return walkAnalyses(pages.filter((p) => p.source_page >= 158), {
    headerRe: CK_HEADER_RE,
    isRealItem: ckIsRealItem,
    unitFromDescription,
  });
}

export interface CkIndexRow {
  code: string;
  description: string;
  unit: string;
  type: string;   // Normatif | Informatif
  status: string; // Tetap | Baru | ...
  source_page: number;
}

/**
 * Parse the "DAFTAR ISI TABEL AHSP BIDANG CIPTA KARYA" index (pages 45–157).
 *
 * This is the attachment's own authoritative inventory — the code list the SE
 * itself publishes. Column order is Kode | Uraian Pekerjaan | Satuan | Tipe AHSP
 * | Status, and the description wraps around the code row (lines above AND below),
 * so both are buffered and re-joined.
 *
 * ── Phase 0.5 forensic fix ────────────────────────────────────────────────────
 * The annex prints **2,841** status-bearing index rows. The original regex only
 * matched 2,803 — 38 rows (a PARSER_ERROR) were lost to three layout quirks:
 *
 *   1. letter-suffixed codes   `2.2.1.1.1a  < 12 mm, cara Manual … kg Normatif Tetap`
 *                              `2.2.1.1.4.a  kg Normatif`
 *   2. code-less unit rows     `4.1.1.1   Informatif Tetap`        (no Satuan printed)
 *   3. codes wrapped mid-column — the page-102/103 Kabel Tray block prints
 *                              `5.1.1.12.10` + `0` on the following line, i.e. the
 *                              real code is `5.1.1.12.100`. The wrapped digit is
 *                              printed in the source; re-joining it is recovery,
 *                              not invention.
 *
 * `unwrapCkCodeDigits` performs (3); the widened `rowRe` handles (1) and (2).
 */
export function parseCiptaKaryaIndex(pages: RawPage[]): CkIndexRow[] {
  const idx = pages.filter((p) => p.source_page >= 45 && p.source_page <= 157);
  const rows: CkIndexRow[] = [];
  const rowRe = /^(\d+(?:\.\d+)+(?:[a-z]|\.[a-z])?)\s+(.*?)\s*(?:(\S+)\s+)?(Normatif|Informatif)(?:\s+(\S+))?\s*$/;

  const furniture = /^-\s*\d+\s*-?$|^Kode\s+Uraian|^Tipe$|^AHSP$|^DIVISI\b|^BAB\b|^[IVX]+\s+[A-Z]|^\d+(?:\.\d+)*\s+[A-Z][A-Z\s/&.,()-]*$/;
  const isFragment = (s: string) => !furniture.test(s) && !/^\d+(?:\.\d+)+\s/.test(s) && s.length < 120;

  let pending: string[] = [];
  let post: string[] = [];
  let cur: CkIndexRow | null = null;

  const finalize = () => {
    if (!cur) return;
    cur.description = [cur.description, ...post].join(' ').replace(/\s+/g, ' ').trim();
    rows.push(cur);
    cur = null;
  };

  for (const p of idx) {
    const lines = prejoinCkWrappedRows(p.raw_lines.map((l) => l.trim()).filter(Boolean));
    for (const s of lines) {
      if (!s) continue;
      const m = rowRe.exec(s);
      if (m) {
        finalize();
        cur = {
          code: m[1],
          description: [...pending, m[2]].join(' ').replace(/\s+/g, ' ').trim(),
          unit: m[3] ?? '',
          type: m[4],
          status: m[5] ?? '',
          source_page: p.source_page,
        };
        pending = [];
        post = [];
      } else if (isFragment(s)) {
        if (cur) post.push(s); else pending.push(s);
      }
    }
  }
  finalize();
  return rows;
}

/**
 * Re-join index rows that the PDF broke across lines because the code column was
 * too narrow (page 102/103, Kabel Tray block):
 *
 *   `5.1.1.12.10  Pemasangan 1 Unit Kabel Tray (Vertikal)`
 *   `unit Normatif Tetap`              ← the row's Satuan + Tipe, on its own line
 *   `0  500 x 100 mm TRU OCP`          ← the wrapped last digit + description
 *
 * becomes
 *
 *   `5.1.1.12.100  Pemasangan 1 Unit Kabel Tray (Vertikal)  unit Normatif Tetap`
 *   `500 x 100 mm TRU OCP`
 *
 * Both the digit and the unit/status text already exist in the source — this is
 * recovery, not invention. The transform only fires when a bare code+description
 * line is immediately followed by a `Satuan + Normatif/Informatif` line, which is
 * exactly the shape the annex produces and nothing else does.
 */
function prejoinCkWrappedRows(lines: string[]): string[] {
  const codeNoStatus = /^(\d+(?:\.\d+)+)\s+(\S.*)$/;
  const statusOnly = /^\S+\s+(Normatif|Informatif)(?:\s+\S+)?$/;
  const digitLead = /^(\d)\s+(\S.*)$/;

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const a = codeNoStatus.exec(lines[i]);
    const b = i + 1 < lines.length ? statusOnly.exec(lines[i + 1]) : null;
    if (a && b) {
      let code = a[1];
      let next = i + 2 < lines.length ? lines[i + 2] : '';
      const d = next ? digitLead.exec(next) : null;
      if (d) { code = `${code}${d[1]}`; next = d[2]; }
      out.push(`${code}  ${a[2]}  ${lines[i + 1].trim()}`);
      if (next) out.push(next);
      i += d ? 2 : 1;
      continue;
    }
    out.push(lines[i]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* SMKK — Lampiran III                                                 */
/* ------------------------------------------------------------------ */

export interface SmkkRow {
  code: string;
  description: string;
  unit: string;
  quantity: string;
  acceptance: string;
  evidence: string;
  source_page: number;
  raw: string;
}

/**
 * Parse the "Tabel III.1 KOMPONEN BIAYA KESELAMATAN KONSTRUKSI" tables.
 *
 * Columns (left→right): NO | PENERAPAN SMKK | SATUAN UKURAN | KUANTITAS |
 *                       HARGA SATUAN | TOTAL | KEBERTERIMAAN | BUKTI DUKUNG
 *
 * The table has no explicit codes; the source's own NO. hierarchy is used as the
 * code (e.g. "2.a"), and the risk tier is prefixed ("KECIL"/"SEDANG"/"BESAR").
 */
export function parseSmkk(pages: RawPage[]): SmkkRow[] {
  const rows: SmkkRow[] = [];
  const body = pages.filter((p) => p.source_page >= 30 && p.source_page <= 73);

  // Detect the risk tier from the table caption.
  let tier = '';
  const counters = { main: 0, letter: 0, roman: 0 };
  let pending: SmkkRow | null = null;

  const rowStartRe = /^(\d{1,2}|[a-z]|\d{1,2}\))\s+(\S.*)$/;
  const subtotalRe = /^(Sub\s*total|Subtotal|Jumlah)\b/i;
  const headerNoise = /^(RINCIAN BIAYA|NO\.|PENERAPAN SMKK|I II III|Tabel III)/;

  for (const p of body) {
    for (const l of p.raw_lines) {
      const s = l.trim();
      if (!s) continue;
      if (/^-\s*\d+\s*-?$/.test(s)) continue;

      const cap = /TINGKAT RISIKO KESELAMATAN KONSTRUKSI (KECIL|SEDANG|BESAR)/i.exec(s);
      if (cap) {
        // A new risk tier is a new table: the NO. hierarchy restarts at 1.
        if (cap[1].toUpperCase() !== tier) {
          tier = cap[1].toUpperCase();
          counters.main = 0; counters.letter = 0; counters.roman = 0;
          if (pending) { rows.push(pending); pending = null; }
        }
        continue;
      }
      if (headerNoise.test(s)) continue;

      if (subtotalRe.test(s)) {
        if (pending) { rows.push(pending); pending = null; }
        counters.letter = 0; counters.roman = 0;
        continue;
      }

      const m = rowStartRe.exec(s);
      if (m) {
        if (pending) { rows.push(pending); pending = null; }
        let code: string;
        if (/^\d{1,2}$/.test(m[1]) && Number(m[1]) <= 12) {
          counters.main = Number(m[1]); counters.letter = 0; counters.roman = 0;
          code = String(counters.main);
        } else if (/^[a-z]$/.test(m[1])) {
          counters.letter = m[1].charCodeAt(0) - 96; counters.roman = 0;
          code = `${counters.main}.${m[1]}`;
        } else {
          counters.roman += 1;
          code = `${counters.main}.${String.fromCharCode(96 + Math.max(1, counters.letter))}.${m[1].replace(')', '')}`;
        }
        const rest = m[2];
        // The unit is the first standalone unit token in the row.
        const um = /(?:^|\s{1,2})(Buah|buah|Unit|unit|Set|set|Orang|orang|Kali|kali|m2|m3|m1|m|ls|Ls|Paket|paket|Titik|titik|Lembar|lembar|Batang|batang|Roll|roll|Bulan|bulan|Hari|hari|Lot|lot)(?:\s|$)/.exec(rest);
        const unit = um ? um[1] : '';
        const desc = um ? rest.slice(0, um.index).trim() : rest;
        const tail = um ? rest.slice(um.index + um[1].length).trim() : '';
        pending = {
          code: tier ? `${tier}-${code}` : code,
          description: desc,
          unit,
          quantity: tail,
          acceptance: '',
          evidence: '',
          source_page: p.source_page,
          raw: s,
        };
      } else if (pending) {
        // Continuation of a wrapped SMKK row. The URAIAN column has already been
        // captured up to the Satuan token, so everything that follows belongs to
        // the later columns (KUANTITAS / KEBERTERIMAAN / BUKTI DUKUNG) — appending
        // it to the description would interleave unrelated columns.
        if (pending.quantity.length < 220) pending.quantity = `${pending.quantity} ${s}`.replace(/\s+/g, ' ').trim();
        pending.raw += ` ⏎ ${s}`;
      }
    }
  }
  if (pending) rows.push(pending);
  return rows;
}

/* ------------------------------------------------------------------ */
/* Bina Marga — Lampiran V (reuses the existing verified extraction)   */
/* ------------------------------------------------------------------ */

export interface BmOfficialItem {
  code: string;
  name: string;
  unit: string | null;
  headerPage: number;
  analisaPage: number | null;
  components: any[];
  totalLabor: number | null;
  totalMaterial: number | null;
  totalEquipment: number | null;
  overheadProfitPercent: number | null;
  hargaSatuan: number | null;
  warnings: string[];
  [k: string]: any;
}

export function loadBinaMargaOfficial(): BmOfficialItem[] {
  const p = path.join(process.cwd(), 'docs', '_audit', 'lampiran2-official-items.json');
  if (!fs.existsSync(p)) return [];
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return (d.items ?? []) as BmOfficialItem[];
}

export interface BmIndexRow {
  serial: string;
  code: string;
  description: string;
  unit: string;
  status: string;
  source_page: number;
}

/**
 * Parse the Bina Marga "NO / KODE / URAIAN / SATUAN / NORMATIF-INFORMATIF" index
 * (pages 4–30 of Lampiran V) — the attachment's own published code list.
 *
 * ── Phase 0.5 forensic fix ────────────────────────────────────────────────────
 * The original implementation required the code to be shaped `\d+\.\d+\.\(…\)`
 * and the status to sit on the same line. That silently dropped 129 of the 1,137
 * index rows (a PARSER_ERROR, not a source gap). The rows it lost were:
 *   • plain codes             — `A.1 1.2 Mobilisasi Lumsum Informatif`
 *   • suffixed codes          — `G.47 7.2.(5c).30   Buah Informatif`
 *   • code-less rows          — `A.7 Sistem Manajemen Keselamatan Konstruksi (SMKK) Informatif`
 *   • status on the line ABOVE (two-column wrap) — `B.9 2.3.(1)   Meter Panjang`
 *
 * The row model below therefore keys on the **serial** (`A.1`, `B.32`, `G.51`),
 * which every index row carries, and treats the code / unit / status as optional
 * fields discovered within the row's line group.
 */
export function parseBinaMargaIndex(): BmIndexRow[] {
  const pages = readRaw('binamarga').filter((p) => p.source_page >= 4 && p.source_page <= 30);
  return parseBinaMargaIndexFrom(pages.map((p) => ({ page: p.source_page, lines: p.raw_lines })));
}

const BM_SERIAL_RE = /^([A-Z]\.\d+)\s+(.*)$/;
/** `1.2` · `2.3.(1)` · `7.2.(5c).30` · `7.2.(9).16,5` */
const BM_CODE_RE = /^(?:\d+(?:\.\d+)*\.\([^)]*\)(?:\.\d+(?:,\d+)?)*|\d+(?:\.\d+)+)(?=\s|$)/;
const BM_STATUS_RE = /\s*(Normatif|Informatif)\s*$/;

/** Unit phrases printed in the SATUAN column, longest first. */
const BM_UNIT_PHRASES = [
  'Meter Panjang', 'Meter Kubik', 'Meter Persegi',
  'Lumsum', 'Lumpsum', 'Kilogram', 'Buah', 'Titik', 'Liter', 'persegi', 'Ton', 'Jam', 'km',
];

/**
 * Split a row's text (status already removed) into `{code, unit, description}`.
 * The unit is the longest known unit phrase that ends the text; anything before
 * it on the row is the description fragment.
 */
function splitBmRow(rest: string): { code: string; unit: string; desc: string } {
  let t = rest.trim();
  let code = '';
  const cm = BM_CODE_RE.exec(t);
  if (cm) { code = cm[0]; t = t.slice(cm[0].length).trim(); }

  let unit = '';
  for (const p of BM_UNIT_PHRASES) {
    if (t.length >= p.length && t.toLowerCase().endsWith(p.toLowerCase())) {
      // must start at a token boundary
      const cut = t.length - p.length;
      if (cut === 0 || /\s/.test(t[cut - 1])) { unit = t.slice(cut).trim(); t = t.slice(0, cut).trim(); break; }
    }
  }
  return { code, unit, desc: t };
}

/**
 * Find a Bina Marga AHSP code that the annex printed inside a wrapped description
 * because the KODE column was too narrow.
 *
 * Accepts `7.12.(3).200.30`, `7.6.(11).400.40`, `10.1.10b)`, `7.2.(8).65.50-`.
 * Requires at least two dotted numeric groups (or a parenthesised group) so that
 * ordinary dimension numbers (`400`, `0.45`, `16,5`) are never promoted.
 * Returns the code and the description with that token removed.
 */
export function promoteEmbeddedBmCode(desc: string): { code: string; rest: string } | null {
  const tokens = desc.split(/\s+/);
  const isCode = (t: string) =>
    /^\d+(?:\.\d+){2,}[a-z]?\)?$/.test(t) ||
    /^\d+\.\d+\.\([^)]*\)(?:\.\d+(?:,\d+)?)*[-)]?$/.test(t);
  for (let i = 0; i < tokens.length; i++) {
    if (isCode(tokens[i])) {
      const code = tokens[i].replace(/\)$/, '').replace(/-$/, '');
      const rest = tokens.filter((_, k) => k !== i).join(' ').replace(/\s+/g, ' ').trim();
      return { code, rest };
    }
  }
  return null;
}

/** Core row walker — exported so the forensic stage can run the same logic. */
export function parseBinaMargaIndexFrom(pages: { page: number; lines: string[] }[]): BmIndexRow[] {  const furniture = /^-\s*\d+\s*-?$|^DAFTAR ISI|^NO KODE URAIAN|^NORMATIF\s*\/?$|^INFORMATIF$|^NO\s|^URAIAN\s|^SATUAN\s*$/;

  const rows: BmIndexRow[] = [];
  let cur: BmIndexRow | null = null;
  /** Lines seen since the previous serial row — resolved once we know the next row. */
  let between: string[] = [];

  const finish = (postLines: string[]) => {
    if (!cur) return;
    const extra = postLines.join(' ').replace(/\s+/g, ' ').trim();
    cur.description = `${cur.description} ${extra}`.replace(/\s+/g, ' ').trim();
    // Phase 0.5: 25 index rows print their KODE inside the wrapped description
    // (the code column wrapped and interleaved with the URAIAN text), e.g.
    //   `G.51   Buah Informatif` / `60  bentang nominal 50-60 m, Penyediaan`
    //   / `7.2.(8).65.50-  Unit Pracetak Gelagar Beton Pratekan …`
    // The code is printed by the source — promoting it is recovery, not invention.
    if (!cur.code) {
      const promoted = promoteEmbeddedBmCode(cur.description);
      if (promoted) { cur.code = promoted.code; cur.description = promoted.rest; }
    }
    rows.push(cur);
    cur = null;
  };

  for (const pg of pages) {
    for (const raw of pg.lines) {
      const s = raw.trim();
      if (!s || furniture.test(s)) continue;

      const sm = BM_SERIAL_RE.exec(s);
      if (sm) {
        // The row's own leading text may sit on the line(s) above it: either a
        // `Satuan + Normatif/Informatif` fragment (two-column wrap) or a line that
        // carries the row's KODE (printed above the serial, e.g. `7.2.(7).65.50-`).
        // Everything before the last such line closes the previous row.
        let pendingIdx = -1;
        for (let k = between.length - 1; k >= 0; k--) {
          if (BM_STATUS_RE.test(between[k]) || promoteEmbeddedBmCode(between[k])) { pendingIdx = k; break; }
        }
        const prevPost = pendingIdx >= 0 ? between.slice(0, pendingIdx) : between;
        const pending = pendingIdx >= 0 ? between.slice(pendingIdx) : [];
        finish(prevPost);

        const rest0 = sm[2];
        let status = '';
        let rest = rest0;
        const inline = BM_STATUS_RE.exec(rest0);
        if (inline) { status = inline[1]; rest = rest0.slice(0, inline.index).trim(); }
        else if (pending.length) {
          const pm = BM_STATUS_RE.exec(pending[pending.length - 1]);
          if (pm) status = pm[1];
        }

        // The pending line's status suffix is not part of the description.
        const pendingText = pending
          .map((l, i) => (i === pending.length - 1 ? l.replace(BM_STATUS_RE, '') : l))
          .join(' ');

        const { code, unit, desc } = splitBmRow(rest);
        cur = {
          serial: sm[1],
          code,
          description: `${pendingText} ${desc}`.replace(/\s+/g, ' ').trim(),
          unit,
          status,
          source_page: pg.page,
        };
        between = [];
      } else if (cur || true) {
        between.push(s);
      }
    }
  }
  finish(between);
  return rows;
}

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

export function readRaw(key: string): RawPage[] {
  const p = path.join(RAW_DIR, `${key}_raw.jsonl`);
  if (!fs.existsSync(p)) throw new Error(`missing raw layer: ${p} — run extract first`);
  return readJsonl<RawPage>(p);
}

export { CALCULATION_TEMPLATE, REGULATION };
