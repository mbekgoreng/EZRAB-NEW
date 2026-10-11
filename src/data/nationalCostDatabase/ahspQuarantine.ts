/**
 * EZRAB AHSP 2026 — QUARANTINE REGISTRY (Phase 2E)
 * =================================================
 * Quarantine, don't delete. Proven-invalid records stay in the database
 * with full provenance, but are excluded from normal search and AI matching.
 *
 * RULES:
 * - Quarantined items are NEVER returned by search/AI matching as candidates.
 * - The original record and provenance are preserved (recoverable).
 * - Quarantine requires PROOF (Phase 2C/2D audit), never suspicion alone.
 * - Wiremesh M6–M10 are NOT quarantined as variants — they are distinct
 *   physical items (Phase 2D §B.1). Only exact duplicates are quarantined.
 * - METADATA_ONLY items are NOT quarantined and NOT marked verified.
 */

export interface QuarantineRecord {
  code: string;
  reason: 'PARSING_ARTIFACT' | 'EXACT_DUPLICATE';
  /** What this record actually is / duplicates. */
  detail: string;
  /** The valid item that should be used instead (if any). */
  supersededBy?: string;
  /** Where the proof lives. */
  provenance: string;
  confidence: 'HIGH' | 'MEDIUM';
}

/**
 * Proven parsing artifacts (Phase 2D §3.1). All HIGH confidence.
 * NOTE: quarantine is REVERSIBLE. Permanent deletion needs owner approval.
 */
const ARTIFACT_QUARANTINE: QuarantineRecord[] = [
  {
    code: '1.000',
    reason: 'PARSING_ARTIFACT',
    detail: 'Kode = potongan "1.000 USGPM" (kapasitas pompa); uraian = fragmen "USGPM"; satuan kosong',
    supersededBy: '5.6.4.2',
    provenance: 'Phase 2D §3.1 — 4 koefisien labor identik persis 5.6.4.2',
    confidence: 'HIGH',
  },
  {
    code: '1.250',
    reason: 'PARSING_ARTIFACT',
    detail: 'Kode = potongan "1.250 USGPM"; pola OCR-confusion 8→3 pada 2 digit',
    supersededBy: '5.6.4.4',
    provenance: 'Phase 2D §3.1 — workbook memuat nilai benar',
    confidence: 'HIGH',
  },
  {
    code: '2.000',
    reason: 'PARSING_ARTIFACT',
    detail: 'Kode = potongan "2.000 m3"; koefisien+harga identik 1.2.1.1.3; status VERIFIED menyesatkan',
    supersededBy: '1.2.1.1.3',
    provenance: 'Phase 2D §3.1',
    confidence: 'HIGH',
  },
  {
    code: '5.4.8.5',
    reason: 'PARSING_ARTIFACT',
    detail: 'Uraian = merge 3 blok teks (Chlorine Meter + header seksi 5.5 + nama item 5.5.1.1)',
    provenance: 'Phase 2D §3.1 — tidak ada di workbook; tidak dapat direkonstruksi pasti',
    confidence: 'HIGH',
  },
];

/**
 * Exact internal duplicates (Phase 2D §3.7). Proven via components JSON —
 * only source_page differs. Keep ONE representative, quarantine the rest.
 */
const DUPLICATE_QUARANTINE: QuarantineRecord[] = [
  { code: '6.1.3.7', reason: 'EXACT_DUPLICATE', detail: 'Duplikat persis Tube Settler', supersededBy: '8.3.1.6', provenance: 'Phase 2D §3.7 — components JSON identik', confidence: 'HIGH' },
  { code: '8.3.8.3', reason: 'EXACT_DUPLICATE', detail: 'Duplikat persis Box Culvert 80x80x100', supersededBy: '8.3.2.4', provenance: 'Phase 2D §3.7 — components JSON identik', confidence: 'HIGH' },
  { code: '5.5.2.39', reason: 'EXACT_DUPLICATE', detail: 'Duplikat persis Exhaust Louvre 800x400', supersededBy: '5.5.2.37', provenance: 'Phase 2D §3.7 — components JSON identik', confidence: 'HIGH' },
  { code: '5.5.2.42', reason: 'EXACT_DUPLICATE', detail: 'Duplikat persis Exhaust Louvre 800x400', supersededBy: '5.5.2.37', provenance: 'Phase 2D §3.7 — components JSON identik', confidence: 'HIGH' },
  { code: '3.5.2.2.2', reason: 'EXACT_DUPLICATE', detail: 'Duplikat persis plafon serat semen/GRC', supersededBy: '3.5.2.2.1', provenance: 'Phase 2D §3.7 — components JSON identik', confidence: 'HIGH' },
  { code: '3.5.2.2.3', reason: 'EXACT_DUPLICATE', detail: 'Duplikat persis plafon serat semen/GRC', supersededBy: '3.5.2.2.1', provenance: 'Phase 2D §3.7 — components JSON identik', confidence: 'HIGH' },
];

export const QUARANTINE_REGISTRY: QuarantineRecord[] = [
  ...ARTIFACT_QUARANTINE,
  ...DUPLICATE_QUARANTINE,
];

const quarantineMap = new Map<string, QuarantineRecord>(
  QUARANTINE_REGISTRY.map(q => [q.code, q]),
);

/** True if the code is quarantined (excluded from search/AI matching). */
export function isQuarantined(code: string): boolean {
  return quarantineMap.has(code.trim());
}

/** Get the quarantine record for a code, if quarantined. */
export function getQuarantineRecord(code: string): QuarantineRecord | undefined {
  return quarantineMap.get(code.trim());
}

/**
 * Filter helper: remove quarantined items from a candidate list.
 * Preserves the original array; returns a new filtered array.
 */
export function excludeQuarantined<T extends { code: string }>(items: T[]): T[] {
  return items.filter(i => !isQuarantined(i.code));
}

/** All quarantined codes (for audit UI). */
export function listQuarantinedCodes(): string[] {
  return QUARANTINE_REGISTRY.map(q => q.code);
}
