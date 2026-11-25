/**
 * OfficialAhspRepository — THE single authoritative AHSP source for EZRAB.
 * =======================================================================
 *
 * SOURCE OF TRUTH: `ALL_OFFICIAL_AHSP_ITEMS` (masterRegistry → AHSP_2026_CANONICAL
 * + OFFICIAL_SMKK_2026_ITEMS). This module does NOT copy or re-derive that dataset;
 * it is a thin, indexed access layer over the one array.
 *
 * WHY THIS EXISTS
 * ---------------
 * EZRAB previously had two AHSP reads:
 *   - the MATCHER used `getAHSPDatabase()` (legacy view, localStorage-overlaid), and
 *   - the VALIDATOR/PRICE used `ALL_OFFICIAL_AHSP_ITEMS` (canonical).
 * Those two could disagree, so a match could be produced that the validator then
 * rejected — e.g. "Pondasi Batu Kali" → `A.3.2.1.2`, a 2022 code that does NOT
 * exist in the 2026 catalog.
 *
 * THE INVARIANT THIS MODULE ENFORCES (§14):
 *
 *     MATCHED  =>  OFFICIAL_CATALOG_CONTAINS(selectedAhspId)
 *
 * If a code is not in `ALL_OFFICIAL_AHSP_ITEMS`, it can never be reported as a
 * MATCH. There is no legacy fallback, no synthetic code, no localStorage overlay.
 */

import { NationalAHSPItem } from './types';
import { ALL_OFFICIAL_AHSP_ITEMS } from './masterRegistry';
import { isQuarantined, excludeQuarantined } from './ahspQuarantine';
import { resolveCodeAlias } from './ahspCodeAliases';
import { getCorrections } from './ahspDescriptionCorrections';

/**
 * Apply Phase 2E description corrections overlay to an item.
 * Returns a shallow copy with corrected name/unit/material/equipment names.
 * Prices, coefficients, and identity are NEVER touched.
 */
function applyCorrections(item: NationalAHSPItem): NationalAHSPItem {
  const corrections = getCorrections(item.code);
  if (corrections.length === 0) return item;
  const copy: NationalAHSPItem = {
    ...item,
    materialComponents: item.materialComponents.map(m => ({ ...m })),
    equipmentComponents: item.equipmentComponents.map(m => ({ ...m })),
  };
  for (const c of corrections) {
    if (c.field === 'name') copy.name = c.newValue;
    else if (c.field === 'unit') copy.unit = c.newValue;
    else if (c.field === 'materialName' && copy.materialComponents[c.materialIndex ?? 0]) {
      copy.materialComponents[c.materialIndex ?? 0] = {
        ...copy.materialComponents[c.materialIndex ?? 0],
        name: c.newValue,
      };
    }
    // Owner-approved mechanism extension (2026-11-08, Phase B §4.1):
    // equipment component names, identical semantics to materialName.
    else if (c.field === 'equipmentName' && copy.equipmentComponents[c.equipmentIndex ?? 0]) {
      copy.equipmentComponents[c.equipmentIndex ?? 0] = {
        ...copy.equipmentComponents[c.equipmentIndex ?? 0],
        name: c.newValue,
      };
    }
  }
  return copy;
}

/** Normalise a code for comparison (official codes mix "." and "()" and "a/b" suffixes). */
function normCode(code: unknown): string {
  return String(code ?? '').toLowerCase().trim();
}

/**
 * WB-05 (Fast Track 2026-11-24): kata kueri yang BUKAN identitas
 * pekerjaan — cermin STOPWORDS chatSearch.ts (hanya kata yang bisa
 * lolos saringan panjang kata > 2 di searchOfficialAhsp). Kata-kata
 * ini tidak pernah menjadi bukti kecocokan nyata.
 */
const SEARCH_STOPWORDS = new Set([
  'harga', 'harganya', 'berapa', 'berapakah', 'apa', 'itu', 'ini',
  'adalah', 'untuk', 'dari', 'dengan', 'pada', 'dalam', 'bagaimana',
  'gimana', 'mohon', 'tolong', 'saya', 'mau', 'cari', 'carikan',
  'search', 'ahsp', 'kode', 'pekerjaan', 'pemasangan', 'pembuatan',
  'pasang', 'buatkan', 'satuan', 'jika', 'kalau', 'apabila', 'tidak',
  'ada', 'tersedia', 'ditemukan', 'sebuah', 'satu', 'dong', 'kah',
  'sih', 'aja', 'saja', 'yang', 'dan', 'atau', 'per', 'campuran',
  'cocok', 'sesuai', 'tepat', 'bagus', 'benar', 'baik', 'ideal',
]);

/** WB-05: token satuan bukan identitas pekerjaan (cermin UNIT_TOKENS chatSearch.ts). */
const SEARCH_UNIT_TOKENS = new Set(['m2', 'm3', 'kg', "m'", 'buah', 'unit', 'titik', 'ls', 'm']);

/** WB-06: kata berbentuk kode AHSP (3.7.4, B.38, 2.3.(21a), 1.000). */
function isCodeWord(w: string): boolean {
  return /^[\da-z]+(\.[\da-z()]+)+$/i.test(w);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class OfficialAhspRepositoryImpl {
  private readonly items: NationalAHSPItem[];
  /** code.toLowerCase() → item */
  private readonly byCode: Map<string, NationalAHSPItem>;
  /**
   * WB-04 (Fast Track 2026-11-24): standardCode.toLowerCase() → item.
   * Bina Marga memakai dua skema kode: kode huruf (B.38) sebagai `code`
   * dan kode parenthesized (2.3.(21a)) sebagai `standardCode`. Tanpa
   * indeks ini, 1.134 dari 1.137 kode parenthesized salah dilaporkan
   * NOT_FOUND. First-wins seperti byCode (2 standardCode dipakai
   * bersama, keduanya merujuk item yang sama esensinya).
   */
  private readonly byStandardCode: Map<string, NationalAHSPItem>;

  constructor() {
    // Single backing store — the canonical array itself, never duplicated.
    this.items = ALL_OFFICIAL_AHSP_ITEMS;
    this.byCode = new Map();
    this.byStandardCode = new Map();
    for (const it of this.items) {
      const key = normCode(it.code);
      if (key && !this.byCode.has(key)) this.byCode.set(key, it);
      const std = normCode(it.standardCode);
      if (std && !this.byStandardCode.has(std)) this.byStandardCode.set(std, it);
    }
  }

  /** Every official item. Treat as read-only. */
  public getAllOfficialAhsp(): readonly NationalAHSPItem[] {
    return this.items;
  }

  /**
   * Active items only — excludes quarantined records (Phase 2E).
   * Use this for search candidates, AI matching, and UI lists.
   * getAllOfficialAhsp() remains the raw complete dataset (for audits/tests).
   */
  public getActiveOfficialAhsp(): NationalAHSPItem[] {
    // Phase 2H P2 fix: apply description corrections so bulk consumers see
    // the same corrected names as getOfficialAhsp()/searchOfficialAhsp().
    return excludeQuarantined([...this.items]).map(applyCorrections);
  }

  /**
   * Exact code lookup. Resolves aliases first (Phase 2E), then looks up
   * by `code`, then by `standardCode` (WB-04: kode parenthesized Bina
   * Marga, mis. '2.3.(21a)' → B.38). Returns undefined when the code is
   * absent from the official catalog. Quarantined codes return undefined
   * (use getQuarantineRecord for audit); the §14 gate is applied to the
   * RESOLVED item (karantina dicek pada kode huruf item itu).
   */
  public getOfficialAhsp(code: string): NationalAHSPItem | undefined {
    if (!code) return undefined;
    const resolved = resolveCodeAlias(code);
    if (isQuarantined(resolved)) return undefined;
    const item =
      this.byCode.get(normCode(resolved)) ??
      this.byStandardCode.get(normCode(resolved));
    if (!item) return undefined;
    if (isQuarantined(item.code)) return undefined;
    // Phase 2E: apply PDF-verified description corrections overlay.
    return applyCorrections(item);
  }

  /**
   * THE GATE (§14). True iff `code` exists in the official catalog.
   * Aliases resolve to their canonical code; parenthesized Bina Marga
   * codes resolve via `standardCode` (WB-04). Quarantined codes return
   * false. Every MATCHED result in the matcher must satisfy this.
   */
  public hasOfficialAhsp(code: string): boolean {
    if (!code) return false;
    const resolved = resolveCodeAlias(code);
    if (isQuarantined(resolved)) return false;
    if (this.byCode.has(normCode(resolved))) return true;
    const viaStd = this.byStandardCode.get(normCode(resolved));
    return !!viaStd && !isQuarantined(viaStd.code);
  }

  /** Official item count (diagnostics / assertions). */
  public get size(): number {
    return this.items.length;
  }

  /**
   * Text search over the official catalog ONLY (§4, §6). Returns ranked candidates;
   * never auto-selects. Callers must apply their own spec/unit guards and review.
   *
   * WB-05 (Fast Track 2026-11-24): relevance floor, ported from the
   * searchChatAhsp discipline — an item is returned ONLY if at least
   * one query CONTENT term (non-stopword, non-unit) really matches it:
   * whole-word in the title, or an anchored code match. Zero-real-match
   * queries (e.g. 'harga ACP per m2' — 'harga'/'per' stopwords, 'acp'
   * in no title) return []. This also stops the +25 building-domain
   * bonus from deciding ties among zero-real-match items. Scoring
   * steps (+10/+5/+40/+100) are UNCHANGED — canonicalDedPricing's
   * SCORE_FLOOR/Gate-C calibration depends on them.
   */
  public searchOfficialAhsp(
    query: string,
    opts: { limit?: number; domain?: string; unit?: string; preferBuildingDomain?: boolean } = {}
  ): Array<{ item: NationalAHSPItem; score: number }> {
    const rawQ = String(query ?? '').trim();
    if (!rawQ) return [];
    // Phase 2E: resolve alias so typo/variant codes search the canonical record.
    const resolvedQ = resolveCodeAlias(rawQ);
    const q = resolvedQ.toLowerCase();
    const words = q.split(/\s+/).filter((w) => w.length > 2);
    // Also search the raw query: if user typed an alias, match the canonical code too.
    const rawWords = rawQ.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const limit = opts.limit ?? 10;
    const isDemolitionQuery = /bongkar|pembongkaran|bongkaran/.test(q);
    const preferBuilding = opts.preferBuildingDomain !== false;

    // WB-05: tanpa satu pun istilah konten, tidak ada kecocokan nyata
    // yang mungkin (mis. "harga per m2" — semua kata stopword/satuan).
    const contentTerms = words.filter(
      (w) => !SEARCH_STOPWORDS.has(w) && !SEARCH_UNIT_TOKENS.has(w)
    );
    if (contentTerms.length === 0) return [];
    // Pola batas kata per istilah konten (dikompilasi sekali, bukan
    // per item): "per" tidak cocok dengan "persiapan".
    const contentChecks = contentTerms.map((term) => ({
      term,
      isCode: isCodeWord(term),
      re: isCodeWord(term)
        ? null
        : new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`, 'i'),
    }));

    const scored: Array<{ item: NationalAHSPItem; score: number }> = [];
    for (const it of this.items) {
      // Phase 2E: quarantined items never appear as search candidates.
      if (isQuarantined(it.code)) continue;
      if (opts.domain && it.domain !== opts.domain) continue;
      const title = String((it as any).title || it.name || '').toLowerCase();
      const isDemolitionItem = /bongkaran|pembongkaran|dibongkar|bongkar\b/.test(title);
      if (isDemolitionItem && !isDemolitionQuery) continue; // Never propose demolition for new work

      const itemUnit = String(it.unit || '').toLowerCase();
      const code = normCode(it.code);
      const stdCode = normCode((it as NationalAHSPItem).standardCode);
      // WB-05: kategori DIKELUARKAN dari haystack — "per" cocok dengan
      // teks kategori ("Persiapan", "Perkerasan") dan memberi skor palsu.
      const hay = `${code} ${title} ${itemUnit}`;
      // WB-06: pencocokan kode berjangkar — kode sama persis, awalan
      // bertitik (3.7 ⊏ 3.7.4), atau standardCode sama persis.
      // '3.7.4' TIDAK LAGI cocok dengan '4.1.3.7.4' (substring).
      const codeMatches = (w: string): boolean =>
        code === w || code.startsWith(`${w}.`) || (stdCode !== '' && stdCode === w);
      let score = 0;
      if (title === q) score += 100;
      for (const w of words) {
        if (isCodeWord(w)) {
          if (codeMatches(w)) score += 10;
        } else if (hay.includes(w)) {
          score += 10;
        }
      }
      // Also match raw query words (covers alias codes typed by user).
      for (const w of rawWords) {
        if (w === q) continue;
        if (isCodeWord(w)) {
          if (codeMatches(w)) score += 5;
        } else if (hay.includes(w)) {
          score += 5;
        }
      }
      // Whole-query substring is a strong signal.
      if (title.includes(q)) score += 40;

      // WB-05: gerbang relevansi — minimal satu istilah konten harus
      // cocok NYATA (kata utuh pada judul, atau kode berjangkar).
      let realMatch = title === q;
      if (!realMatch) {
        for (const c of contentChecks) {
          if (c.isCode ? codeMatches(c.term) : c.re!.test(title)) {
            realMatch = true;
            break;
          }
        }
      }
      if (score > 0 && realMatch) {
        // Prioritize building domain (CIPTA_KARYA) for residential & building projects
        if (preferBuilding && it.domain === 'CIPTA_KARYA') {
          score += 25;
        }

        // Unit compatibility check if unit specified
        if (opts.unit) {
          const reqUnit = opts.unit.toLowerCase().replace(/[\^²³']/g, (m) => (m === '²' ? '2' : m === '³' ? '3' : "'"));
          const candUnit = itemUnit.replace(/[\^²³']/g, (m) => (m === '²' ? '2' : m === '³' ? '3' : "'"));
          if (reqUnit === candUnit) {
            score += 30; // Direct unit match
          } else if (
            (reqUnit.startsWith('m2') && !candUnit.startsWith('m2')) ||
            (reqUnit.startsWith('m3') && !candUnit.startsWith('m3')) ||
            (reqUnit.startsWith('kg') && !candUnit.startsWith('kg'))
          ) {
            score -= 40; // Severe penalty for incompatible dimensional unit
          }
        }

        if (score > 0) scored.push({ item: applyCorrections(it), score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}

export const officialAhspRepository = new OfficialAhspRepositoryImpl();
export type OfficialAhspRepository = OfficialAhspRepositoryImpl;

/**
 * Backwards-compatible re-export of the canonical array, so consumers that imported
 * `ALL_OFFICIAL_AHSP_ITEMS` from here get the exact same (single) dataset.
 */
export { ALL_OFFICIAL_AHSP_ITEMS };
