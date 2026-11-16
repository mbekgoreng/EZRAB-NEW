/**
 * EZRAB — UNIFORM DHSP READER (MASTER PRICING §3, I-9)
 * ====================================================
 *
 * The two official DHSP maps have DIFFERENT value shapes — a known
 * fragility (P0 2026-10-26):
 *   - Bina Marga (adapter):  Map<code, number>            (bare price)
 *   - Cipta Karya:           Map<code, DhspEntry object>  ({ unitPrice, sourceSheet, sourceRow, ... })
 *
 * This module is the SINGLE uniform read layer: every consumer reads DHSP
 * through `getDhspEntry()` and gets the same shape regardless of family.
 * Normalization happens HERE (read layer), never by editing generated
 * files and never by rewriting the maps.
 *
 * Normalization rules (no value invented):
 *   - BM number n  → { unitPrice: n, family: BINA_MARGA, sourceSheet:
 *     'MASTER_AHSP_BINA_MARGA_2026' (the adapter's own sheet label),
 *     sourceRow: null, name/unit/overheadAmount/isLeaf: null } — the
 *     adapter map carries no sheet/row/name; null is the honest value.
 *   - CK object    → fields mapped 1:1.
 * Lookup order mirrors the resolver exactly (PriceResolver2026):
 *   BM-domain item → BM map first (code, then codeNormalized), then CK;
 *   other domains  → CK map first, then BM.
 *
 * STATUS (§3): the reader + its tests are the §6 seam. The resolver keeps
 * its own inline handling for now (golden-sensitive path — rewiring it to
 * this reader is §6 work, with the golden suites as the guard). The
 * equivalence test (masterPricingCanonicalModel) proves reader output
 * equals the resolver's DHSP-derived values for every map entry, so the
 * §6 rewire is a pure refactor with a test already waiting for it.
 */

import { OFFICIAL_CK_2026_DHSP_MAP } from './officialCiptaKaryaDhsp2026';
import { OFFICIAL_BM_2026_DHSP_MAP } from './binaMarga2026Adapter';

/** One DHSP entry in uniform shape, regardless of source family. */
export interface UniformDhspEntry {
  code: string;
  /** DHSP unit price (HSP). Null when the entry carries no price. */
  unitPrice: number | null;
  family: 'BINA_MARGA' | 'CIPTA_KARYA';
  /** Source sheet label. Null for BM (adapter map carries none beyond its own label — see below). */
  sourceSheet: string | null;
  /** Source workbook row. Null for BM. */
  sourceRow: number | null;
  /** Entry name. Null for BM. */
  name: string | null;
  /** Entry unit. Null for BM. */
  unit: string | null;
  /** Overhead+profit amount where the source states it. Null for BM. */
  overheadAmount: number | null;
  /** True for leaf (priced) CK entries. Null for BM. */
  isLeaf: boolean | null;
  /** Provenance label in the resolver's format. */
  provenanceSource: string;
}

export type DhspFamily = 'BINA_MARGA' | 'CIPTA_KARYA';

function fromBm(code: string, price: number): UniformDhspEntry {
  return {
    code,
    unitPrice: price,
    family: 'BINA_MARGA',
    sourceSheet: 'MASTER_AHSP_BINA_MARGA_2026',
    sourceRow: null,
    name: null,
    unit: null,
    overheadAmount: null,
    isLeaf: null,
    provenanceSource: 'SE DJBK No. 47/SE/Dk/2026 Lampiran V (MASTER_AHSP_BINA_MARGA_2026)',
  };
}

function fromCk(code: string, e: {
  unitPrice: number | null;
  sourceSheet: string;
  sourceRow: number;
  name: string;
  unit: string;
  isLeaf: boolean;
}): UniformDhspEntry {
  return {
    code,
    unitPrice: e.unitPrice,
    family: 'CIPTA_KARYA',
    sourceSheet: e.sourceSheet,
    sourceRow: e.sourceRow,
    name: e.name,
    unit: e.unit,
    overheadAmount: null, // CK DHSP entries carry no overheadAmount field
    isLeaf: e.isLeaf,
    provenanceSource: `SE DJBK No. 47/SE/Dk/2026 (${e.sourceSheet}, Baris ${e.sourceRow})`,
  };
}

/**
 * Uniform DHSP lookup. `domain` selects the lookup order (same as the
 * resolver); `codeNormalized` is tried against the BM map only (same as
 * the resolver). Returns null when neither map has the code.
 */
export function getDhspEntry(
  code: string,
  domain?: string,
  codeNormalized?: string | null
): UniformDhspEntry | null {
  // Mirrors the resolver's lookup EXACTLY, including its `||` semantics:
  // a falsy BM value (0) falls through to codeNormalized / CK, the same
  // way the resolver treats it as missing. Do not "fix" this to `??`
  // here — the §6 rewire must be behavior-preserving, and any change to
  // falsy handling belongs in the resolver change itself, guarded by goldens.
  const bmRaw =
    OFFICIAL_BM_2026_DHSP_MAP.get(code) ||
    (codeNormalized && OFFICIAL_BM_2026_DHSP_MAP.get(codeNormalized));
  const ckRaw = OFFICIAL_CK_2026_DHSP_MAP.get(code);

  // NOTE: the `&&` above can return `codeNormalized` itself when it is
  // falsy (null/""), so bmRaw is `number | "" | null | undefined` — the
  // typeof check keeps only genuine map prices. A null/"" bmRaw must
  // yield NO entry: passing it to fromBm would fabricate a BM entry
  // whose (truthy) object would shadow a valid CK fallback.
  const bmEntry = typeof bmRaw === 'number' ? fromBm(code, bmRaw) : null;
  const ckEntry = ckRaw ? fromCk(code, ckRaw) : null;

  if (domain === 'BINA_MARGA') return bmEntry || ckEntry;
  return ckEntry || bmEntry;
}

/** Convenience: just the DHSP unit price (null when no entry or no price). */
export function getDhspPrice(
  code: string,
  domain?: string,
  codeNormalized?: string | null
): number | null {
  return getDhspEntry(code, domain, codeNormalized)?.unitPrice ?? null;
}

/** Map sizes (diagnostics — same maps the resolver reads). */
export function getDhspMapSizes(): { binaMarga: number; ciptaKarya: number } {
  return {
    binaMarga: OFFICIAL_BM_2026_DHSP_MAP.size,
    ciptaKarya: OFFICIAL_CK_2026_DHSP_MAP.size,
  };
}
