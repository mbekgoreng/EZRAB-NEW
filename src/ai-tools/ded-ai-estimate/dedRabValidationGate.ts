/**
 * DED RAB Validation Gate — port LIVE (advisory-first), Phase B.
 *
 * Ported from `src/ded-rab-v2/validation/dedRabValidationGate.ts` (487 lines,
 * COPY — the v2 file is untouched). The ported gate never sees a live item
 * type directly: three thin adapters normalize `DedAiItem`, `FullAiItem`
 * and `AiEstimateWorkItem` (Magic AI) into one `GateItemInput`.
 *
 * Gate numbering follows the v2 `gatesBreakdown` array (readiness report
 * §2/§6.2). NOTE on the owner's supplement numbering: the supplement's
 * "Gate 7" uses the v2 source's INLINE comment numbering, where Gate 7 =
 * "Quantity & Deterministic QTO Check". That substance lives in report
 * Gates 3 (Quantity & QTO) + 12 (Deterministic Calculation) here; report
 * Gate 7 is Version Match. Where the two numberings differ, the SUBSTANCE
 * (the described rule) governs — see the per-gate comments below.
 *
 * Owner-mandated fixes vs v2 (readiness §5.2, defects 1–7):
 * 1. "RAB READY RULE" REMOVED. No official AHSP + valid AI price + spec
 *    NEVER becomes `isAhspVerified = true` / code 'AI-ESTIMATE'. In
 *    DATABASE mode it is BLOCKING (`MISSING_AHSP`); in FULL_AI mode it
 *    passes only as a LABELED ASSUMPTION (`assumptionLabeled: true`,
 *    never plain READY without the flag).
 * 2. `provenance.priceVerification.verified` is derived from price source
 *    ONLY — true only for `AHSP_2026` + a code that is in the official
 *    catalog; false (→ NEEDS_VERIFICATION) for `AI_ESTIMATE`, market
 *    references and `USER_INPUT`.
 * 3. Gate 7 (Version Match) is a REAL check against the target AHSP
 *    database version (caller passes `AHSP_DATABASE_VERSION`, currently
 *    '2026.1' — never bumped here) or `NOT_EVALUATED`. Never a vacuous PASS.
 * 4. Gate 9 breakdown bug fixed: the breakdown FAILs only when an actual
 *    error condition holds (missing components present, INCOMPLETE
 *    composition, malformed breakdown entries) — never merely because the
 *    item is unverified. Gate 9 also validates the ACTUAL breakdown data
 *    and its relationship to the match status (a RESOLVED match that still
 *    lists missing components is inconsistent → FAIL).
 * 5. Gate 4 m²↔m allowance DROPPED (fail closed). Catalog code 3.9.4.9
 *    exists ("Pemasangan 1 m' lantai homogenous tile unpolish uk. 60x60
 *    cm", unit m') — it prices a floor-tile item per linear metre — but
 *    that does NOT establish that an m² DED quantity may be priced at
 *    Rp/m'. A general m²↔m equivalence has no catalog basis, so no
 *    dimensional conversion is assumed. An unverified dimensional
 *    conversion is a FAIL; a case where compatibility cannot be
 *    established at all (blank unit, or no AHSP unit to compare against)
 *    is `NOT_EVALUATED`.
 * 6. Gate 8 K/fc′ logic DELETED and delegated to Candidate A:
 *    `checkGradeCompatibility` from `ded-canonical/concreteGradeGate.ts`.
 *    No second grade checker exists in this file.
 * 7. Gate 5/6 are policy-aware (`'DATABASE' | 'FULL_AI'`).
 *
 * Further owner rules:
 * - Gate 1 runs the ported live `semanticClassifier` (owner ACC 2026-11-25,
 *   file ke-4 — `./semanticClassifier`, a copy of the v2 module; the v2
 *   file is untouched). CONSTRUCTION_WORK → PASS; a confident non-work
 *   entity → BLOCKING FAIL with the classifier's own reason; UNKNOWN →
 *   `NOT_EVALUATED` (the classifier's own uncertainty, never a fabricated
 *   label); blank name → `NOT_APPLICABLE`.
 * - Quantity is NEVER called deterministic merely because it is > 0.
 *   Gate 3 stays minimal (presence/positivity); all reasonableness defers
 *   to live `reasonableness.ts` (no second envelope). Gate 12
 *   (Deterministic Calculation) PASSES only when the arithmetic is
 *   consistent AND calculation provenance + an applicable formula are
 *   actually available (quantityFormula / derivation with validationStatus
 *   'ok' / formula / steps). Arithmetic consistent but without provenance
 *   → `NOT_EVALUATED`, never a determinism claim.
 * - Magic AI items carry no AHSP fields: gates 5/6/7/9/10 are
 *   `NOT_APPLICABLE` (never FAIL, never silent PASS); gates
 *   1/2/3/4/11/12/13 still evaluate.
 * - Gate 13 on a `DedAiItem` (no warnings field) maps to
 *   `quantityReview.severity === 'HIGH'` or `stage === 'REJECTED'`;
 *   else `NOT_EVALUATED`.
 * - ADVISORY-FIRST: this module never persists, never mutates its input,
 *   never changes totals. `rabEligible` means "no BLOCKING failure" only.
 */

import type { CanonicalDedMatch } from '../ded-canonical/canonicalDedPricing';
import { checkGradeCompatibility } from '../ded-canonical/concreteGradeGate';
import { semanticClassifier } from './semanticClassifier';
import { dedUnitSafetyGate } from '../../ded-rab-v3/ahsp/dedUnitSafetyGate';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import type { DedAiItem } from './types';
import type { FullAiItem } from '../ded-full-ai/types';
import type { AiEstimateWorkItem } from '../../ai-estimate/types';

/** Pricing policy — mirrors `resolveDedPriceWithCanonical`. */
export type DedGatePolicy = 'DATABASE' | 'FULL_AI';

export type GateStatus = 'PASS' | 'FAIL' | 'NOT_EVALUATED' | 'NOT_APPLICABLE';
export type GateSeverity = 'BLOCKING' | 'WARNING' | 'INFORMATION';

export interface LiveGateResult {
  gate: number;
  name: string;
  status: GateStatus;
  severity: GateSeverity;
  reason: string;
}

/**
 * Validation status — v2 gate's status vocabulary (the v2 `ValidationStatus`
 * union itself lives in `ded-rab-v2/types.ts` and is NOT imported here;
 * this port is self-contained so v2 can retire without touching it).
 */
export type LiveValidationStatus =
  | 'READY'
  | 'INVALID'
  | 'AMBIGUOUS'
  | 'MISSING_AHSP'
  | 'SPECIFICATION_MISMATCH'
  | 'UNIT_MISMATCH'
  | 'MISSING_QUANTITY'
  | 'MISSING_PRICE'
  | 'NEEDS_REVIEW'
  | 'COMPONENT_MISSING'
  | 'RESOURCE_MISSING';

export type LiveConfidenceRating = 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_MATCH';

/** One breakdown entry as carried by `CanonicalDedMatch.missingComponents`. */
export interface GateMissingComponent {
  type?: string;
  code: string;
  name: string;
  unit?: string;
}

/**
 * Normalized gate input (readiness §4.2). One deviation from the report's
 * sketch: `missingComponents` keeps the structured `{code, name}` entries
 * instead of plain strings, because Gate 9 must validate the ACTUAL
 * breakdown data (well-formedness + its relationship to the match status),
 * not merely the existence of a non-empty list. `undefined` means "no
 * breakdown data was supplied at all" (≠ an empty, i.e. complete, list).
 */
export interface GateItemInput {
  name: string;
  category: string;
  specification?: string;
  unit: string;
  quantity: number | null;
  quantitySource: string;
  ahspCode?: string;
  ahspMatch?: CanonicalDedMatch;
  ahspStatus?: 'MATCHED' | 'AMBIGUOUS' | 'NOT_FOUND';
  unitPrice: number | null;
  priceSource: string;
  subtotal: number | null;
  sourcePages: number[];
  evidence: string[];
  /** undefined = no breakdown data supplied; [] = complete breakdown. */
  missingComponents?: GateMissingComponent[];
  warnings?: unknown[];
  policy: DedGatePolicy;
  /**
   * true when the source shape CAN carry AHSP fields (DedAiItem /
   * FullAiItem). false for Magic AI (`AiEstimateWorkItem`), where AHSP
   * gates are NOT_APPLICABLE rather than FAIL/NOT_EVALUATED.
   */
  hasAhspFields: boolean;
  /** Calculation provenance for Gate 12 (report numbering). */
  quantityFormula?: string;
  /** `derivation.validationStatus` ('ok' | 'rejected: …'), DedAiItem only. */
  derivationValidationStatus?: string;
  /** Ordered calculation steps, FullAiItem only. */
  formulaSteps?: string[];
  /** `DedAiItem.quantityReview.severity`, DedAiItem only. */
  quantityReviewSeverity?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  /** `DedAiItem.stage`, DedAiItem only. */
  stage?: string;
  /** `FullAiItem.exclusionReason`, FullAiItem only. */
  exclusionReason?: string | null;
}

export interface LiveGateValidationResult {
  rabEligible: boolean;
  validationStatus: LiveValidationStatus;
  confidenceRating: LiveConfidenceRating;
  confidenceScore: number;
  validationErrors: string[];
  /** Per-gate results, report numbering 1–13. */
  gates: LiveGateResult[];
  /** BLOCKING failures (the finalize report lists these, with reasons). */
  blockingFailures: LiveGateResult[];
  /** WARNING failures (reviewable, never blocking). */
  warningFailures: LiveGateResult[];
  /**
   * FULL_AI only: true when the item passes WITHOUT an official AHSP,
   * as a labeled assumption. `validationStatus` is never plain READY
   * without this flag being visible alongside it.
   */
  assumptionLabeled: boolean;
  assumptionNote?: string;
  provenance: {
    workDescription: string;
    matchedAhspCode: string;
    matchedAhspName: string;
    ahspVersion: string;
    officialUnit: string;
    specificationMatch: { dedSpec: string; ahspSpec: string; isCompatible: boolean | null };
    unitMatch: { dedUnit: string; ahspUnit: string; isCompatible: boolean | null };
    matchReasons: string[];
    sourceDocumentTrace: { pageNumber: number; evidenceId: string };
    priceVerification: { source: string; verified: boolean; unitPrice: number | null };
    databaseVerified: boolean;
    priceSource: string;
  };
  // Compatibility aliases (v2 shape).
  isValid: boolean;
  status: LiveValidationStatus;
  errors: string[];
}

export interface ValidateGateOptions {
  /**
   * Target AHSP database version for Gate 7 (Version Match), e.g.
   * `AHSP_DATABASE_VERSION` ('2026.1'). When omitted, Gate 7 reports
   * `NOT_EVALUATED` — the gate never invents a target version, and
   * never reports a vacuous PASS.
   */
  targetAhspVersion?: string;
}

// ---------------------------------------------------------------------------
// Adapters (live item shapes → GateItemInput)
// ---------------------------------------------------------------------------

/** `DedAiItem` (`ded-ai-estimate/types.ts:210`). */
export function adaptDedAiItem(item: DedAiItem, policy: DedGatePolicy): GateItemInput {
  const evidence: string[] = [];
  if (item.sourceEvidence && item.sourceEvidence.trim().length > 0) {
    evidence.push(item.sourceEvidence);
  }
  if (item.visionEvidence && item.visionEvidence.length > 0) {
    evidence.push(`vision-evidence:${item.visionEvidence.length}`);
  }
  const ahspStatus =
    item.ahspMatch?.status === 'RESOLVED' || item.ahspMatch?.status === 'INCOMPLETE_COMPONENTS'
      ? 'MATCHED'
      : item.ahspMatch?.status === 'NEEDS_REVIEW'
        ? 'AMBIGUOUS'
        : item.ahspMatch
          ? 'NOT_FOUND'
          : undefined;
  return {
    name: item.name,
    category: item.category,
    specification: item.specification,
    unit: item.units,
    quantity: item.quantity,
    quantitySource: item.quantitySource,
    ahspCode: item.ahspCode,
    ahspMatch: item.ahspMatch,
    ahspStatus,
    unitPrice: item.unitPrice,
    priceSource: item.priceSource,
    subtotal: item.subtotal,
    sourcePages: item.sourcePages ?? [],
    evidence,
    missingComponents: item.ahspMatch?.missingComponents?.map((c) => ({
      type: c.type,
      code: c.code,
      name: c.name,
      unit: c.unit,
    })),
    policy,
    hasAhspFields: true,
    quantityFormula: item.quantityFormula,
    derivationValidationStatus: item.derivation?.validationStatus,
    quantityReviewSeverity: item.quantityReview?.severity,
    stage: item.stage,
  };
}

/** `FullAiItem` (`ded-full-ai/types.ts:110`). */
export function adaptFullAiItem(item: FullAiItem, policy: DedGatePolicy): GateItemInput {
  const evidence: string[] = [];
  if (item.visionEvidence && item.visionEvidence.length > 0) {
    evidence.push(`vision-evidence:${item.visionEvidence.length}`);
  }
  const ahspStatus =
    item.price.ahspMatch?.status === 'RESOLVED' ||
    item.price.ahspMatch?.status === 'INCOMPLETE_COMPONENTS'
      ? 'MATCHED'
      : item.price.ahspMatch?.status === 'NEEDS_REVIEW'
        ? 'AMBIGUOUS'
        : item.price.ahspMatch
          ? 'NOT_FOUND'
          : undefined;
  return {
    name: item.name,
    category: item.category,
    specification: item.description,
    unit: item.quantity.unit,
    quantity: item.quantity.value,
    quantitySource: item.quantity.provenance,
    ahspCode: item.price.ahspCode,
    ahspMatch: item.price.ahspMatch,
    ahspStatus,
    unitPrice: item.price.unitPrice,
    priceSource: item.price.source,
    subtotal: item.subtotal,
    sourcePages: item.sourcePages ?? item.quantity.sourcePages ?? [],
    evidence,
    missingComponents: item.price.ahspMatch?.missingComponents?.map((c) => ({
      type: c.type,
      code: c.code,
      name: c.name,
      unit: c.unit,
    })),
    policy,
    hasAhspFields: true,
    quantityFormula: item.quantity.formula ?? item.quantityAudit?.formula,
    formulaSteps: item.quantity.steps,
    exclusionReason: item.exclusionReason,
  };
}

/** `AiEstimateWorkItem` (`ai-estimate/types.ts:147`, Magic AI — no AHSP fields). */
export function adaptMagicAiItem(item: AiEstimateWorkItem, policy: DedGatePolicy): GateItemInput {
  const evidence: string[] = [];
  if (item.sourceEvidence && item.sourceEvidence.trim().length > 0) {
    evidence.push(item.sourceEvidence);
  }
  return {
    name: item.workName ?? item.item ?? '',
    category: item.category,
    specification: item.specification,
    unit: item.unit,
    quantity: item.quantity,
    quantitySource: item.quantitySource,
    unitPrice: item.unitPrice ?? null,
    priceSource: item.priceSource,
    subtotal: item.subtotal ?? null,
    sourcePages: item.sourcePages ?? [],
    evidence,
    warnings: Array.isArray(item.warnings) ? item.warnings : undefined,
    policy,
    hasAhspFields: false,
    quantityFormula: item.formula,
  };
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

const GATE_NAMES: Record<number, string> = {
  1: 'Construction Work Check',
  2: 'Source Trace Check',
  3: 'Quantity & QTO Check',
  4: 'Unit Compatibility Check',
  5: 'AHSP Candidate Check',
  6: 'Official AHSP Catalog Validation',
  7: 'Version Match Check',
  8: 'Specification Compatibility Check',
  9: 'AHSP Components Existence',
  10: 'Resource Price Validity',
  11: 'Price Validity Check',
  12: 'Deterministic Calculation Verified',
  13: 'No Critical Audit Error',
};

function result(
  gate: number,
  status: GateStatus,
  severity: GateSeverity,
  reason: string,
): LiveGateResult {
  return { gate, name: GATE_NAMES[gate], status, severity, reason };
}

/** v2 brick/foundation conflict rules, kept verbatim (grade logic removed). */
function checkBrickAndFoundationConflicts(
  dedText: string,
  ahspName: string,
): { isCompatible: boolean; reason: string } {
  const text = dedText.toLowerCase();
  const ahsp = ahspName.toLowerCase();
  if (
    text.includes('bata merah') &&
    (ahsp.includes('bata ringan') || ahsp.includes('hebel') || ahsp.includes('batako'))
  ) {
    return {
      isCompatible: false,
      reason:
        'Ketidakcocokan spesifikasi material: Gambar menentukan "Bata Merah", namun AHSP terpetakan ke "Bata Ringan / Batako".',
    };
  }
  if (
    (text.includes('bata ringan') || text.includes('hebel')) &&
    ahsp.includes('bata merah')
  ) {
    return {
      isCompatible: false,
      reason:
        'Ketidakcocokan spesifikasi material: Gambar menentukan "Bata Ringan / Hebel", namun AHSP terpetakan ke "Bata Merah".',
    };
  }
  if (
    (text.includes('batu kali') || text.includes('batu belah')) &&
    ahsp.includes('beton bertulang') &&
    !ahsp.includes('pondasi batu')
  ) {
    return {
      isCompatible: false,
      reason:
        'Ketidakcocokan spesifikasi pondasi: Gambar menentukan "Pondasi Batu Kali", namun AHSP terpetakan ke "Pondasi Beton".',
    };
  }
  return { isCompatible: true, reason: 'Spesifikasi teknis kompatibel.' };
}

/**
 * Two version strings are compatible when they name the same database
 * release: equal, or one is the other's major release ('2026' vs
 * '2026.1'). Anything else is a real mismatch, not a silent pass.
 */
function versionsCompatible(target: string, actual: string): boolean {
  const t = target.trim();
  const a = actual.trim();
  if (!t || !a) return false;
  if (t === a) return true;
  const tMajor = t.split('.')[0];
  const aMajor = a.split('.')[0];
  return tMajor === aMajor && (t.startsWith(aMajor) || a.startsWith(tMajor));
}

export function validateDedRabItem(
  input: GateItemInput,
  opts: ValidateGateOptions = {},
): LiveGateValidationResult {
  const errors: string[] = [];
  const matchReasons: string[] = [];
  const gates: LiveGateResult[] = [];
  const policy = input.policy;

  const name = (input.name ?? '').trim();
  const dedText = `${input.name ?? ''} ${input.specification ?? ''}`.trim();
  const ahspCode = (input.ahspCode ?? input.ahspMatch?.matchedCode ?? '').trim();
  const ahspName = (input.ahspMatch?.matchedName ?? '').trim();
  const ahspUnit = (input.ahspMatch?.unit ?? '').trim();
  const candidates = input.ahspMatch?.candidates ?? [];
  const matchStatus = input.ahspMatch?.status;

  const isAiCustom =
    Boolean(ahspCode) && ahspCode.toUpperCase().startsWith('AI-CUSTOM-');
  const hasMultipleCandidates =
    Boolean(candidates.length > 1 && !input.ahspMatch?.matchedCode) ||
    input.ahspStatus === 'AMBIGUOUS';
  const hasAnyAhsp = Boolean(ahspCode) || Boolean(input.ahspMatch);
  const inOfficialCatalog = Boolean(ahspCode) && officialAhspRepository.hasOfficialAhsp(ahspCode);
  const isAiPrice = input.priceSource === 'AI_ESTIMATE';
  const isOfficialPrice = input.priceSource === 'AHSP_2026';
  const qty = input.quantity;
  const isQtyValid =
    typeof qty === 'number' && Number.isFinite(qty) && qty > 0;
  const unitPrice = input.unitPrice;
  const isPriceValid =
    typeof unitPrice === 'number' && Number.isFinite(unitPrice) && unitPrice > 0;

  // --- Gate 1: Construction Work (live semanticClassifier — owner ACC 2026-11-25) ---
  // v2 semantics preserved: classify(name, category) → CONSTRUCTION_WORK +
  // isRabEligible = PASS; a confident non-work entity (room / title / note /
  // reference) = BLOCKING FAIL with the classifier's own reason (v2 pushed
  // an error in the same case); UNKNOWN = NOT_EVALUATED — the classifier's
  // own uncertainty, never a fabricated label. Blank name = nothing to
  // classify at all.
  if (!name) {
    gates.push(
      result(
        1,
        'NOT_APPLICABLE',
        'INFORMATION',
        'Tidak ada nama item untuk diklasifikasi — Gate 1 tidak berlaku.',
      ),
    );
  } else {
    const semantic = semanticClassifier.classify(name, input.category);
    const entityType = semantic.fact.entityType;
    const isWork = semantic.isRabEligible && entityType === 'CONSTRUCTION_WORK';
    if (isWork) {
      gates.push(
        result(
          1,
          'PASS',
          'BLOCKING',
          'Terklasifikasi sebagai aktivitas pekerjaan konstruksi fisik yang terukur (CONSTRUCTION_WORK).',
        ),
      );
      matchReasons.push('Terklasifikasi sebagai aktivitas pekerjaan konstruksi fisik yang terukur (CONSTRUCTION_WORK).');
    } else if (entityType === 'UNKNOWN') {
      gates.push(
        result(
          1,
          'NOT_EVALUATED',
          'INFORMATION',
          semantic.rejectReason ??
            `Teks ("${name}") tidak dapat diklasifikasi — bukan keputusan, butuh tinjauan.`,
        ),
      );
    } else {
      gates.push(
        result(
          1,
          'FAIL',
          'BLOCKING',
          semantic.rejectReason ?? `"${name}" bukan item pekerjaan konstruksi.`,
        ),
      );
    }
  }

  // --- Gate 2: Source Trace (WARNING) ---
  const hasSourceTrace =
    input.sourcePages.length > 0 && input.evidence.length > 0;
  if (hasSourceTrace) {
    gates.push(
      result(
        2,
        'PASS',
        'WARNING',
        `Trace visual: Hal ${input.sourcePages.join(', ')} / ${input.evidence.length} bukti.`,
      ),
    );
    matchReasons.push(`Trace bukti visual terhubung pada halaman ${input.sourcePages.join(', ')}.`);
  } else {
    gates.push(
      result(
        2,
        'FAIL',
        'WARNING',
        'Trace bukti visual (Source Page / Evidence) tidak lengkap.',
      ),
    );
    errors.push('Trace bukti visual (Source Page / Evidence ID) tidak lengkap.');
  }

  // --- Gate 3: Quantity & QTO — presence/positivity ONLY (supplement Gate 7
  // substance, first half). Determinism is Gate 12's job; reasonableness
  // defers to live reasonableness.ts — no second envelope here. ---
  if (isQtyValid) {
    gates.push(
      result(3, 'PASS', policy === 'DATABASE' ? 'BLOCKING' : 'WARNING', `Qty terisi: ${qty} ${input.unit}.`),
    );
    matchReasons.push(`Volume pekerjaan terisi: ${qty} ${input.unit}.`);
  } else {
    gates.push(
      result(
        3,
        'FAIL',
        policy === 'DATABASE' ? 'BLOCKING' : 'WARNING',
        'Volume pekerjaan (Quantity / QTO) belum terhitung atau bernilai kosong/nol.',
      ),
    );
    errors.push('Volume pekerjaan (Quantity / QTO) belum terhitung atau bernilai kosong/nol.');
  }

  // --- Gate 4: Unit Compatibility ---
  // Live unit-safety rules first (dedUnitSafetyGate), then the live
  // normalizer / compatibility check. The v2 m²↔m allowance is DROPPED
  // (fail closed — see header note 5). Unverified dimensional conversion
  // = FAIL; compatibility that cannot be established at all = NOT_EVALUATED.
  if (!input.unit || !input.unit.trim()) {
    gates.push(
      result(
        4,
        'NOT_EVALUATED',
        'INFORMATION',
        'Satuan tidak dinyatakan — kompatibilitas satuan tidak dapat ditetapkan.',
      ),
    );
  } else {
    const engCheck = dedUnitSafetyGate.validateWorkItemEngineeringUnit(
      input.name,
      input.unit,
    );
    if (!engCheck.isValid) {
      gates.push(
        result(
          4,
          'FAIL',
          'BLOCKING',
          engCheck.rejectionReason || 'ENGINEERING_UNIT_INVALID',
        ),
      );
      errors.push(engCheck.rejectionReason || 'ENGINEERING_UNIT_INVALID');
    } else if (!ahspUnit) {
      // No AHSP unit to compare against (Magic AI, or unmatched item):
      // the engineering check passed, but compatibility itself cannot be
      // established — NOT_EVALUATED, never a silent PASS.
      gates.push(
        result(
          4,
          'NOT_EVALUATED',
          'INFORMATION',
          'Tidak ada satuan AHSP pembanding — kompatibilitas satuan tidak dapat ditetapkan (cek engineering lolos).',
        ),
      );
    } else {
      const compat = dedUnitSafetyGate.verifyUnitCompatibility(input.unit, ahspUnit);
      if (compat.isCompatible) {
        gates.push(
          result(
            4,
            'PASS',
            'BLOCKING',
            `Satuan kompatibel: ${input.unit} vs ${ahspUnit} (ternormalisasi ${compat.normQtyUnit} vs ${compat.normAhspUnit}).`,
          ),
        );
        matchReasons.push(`Satuan pekerjaan kompatibel: ${input.unit} vs ${ahspUnit}.`);
      } else {
        gates.push(
          result(
            4,
            'FAIL',
            'BLOCKING',
            compat.rejectionReason ||
              `Ketidakcocokan satuan teknis: Satuan DED adalah "${input.unit}", sedangkan satuan AHSP adalah "${ahspUnit}". Konversi dimensional tidak dapat diasumsikan secara otomatis.`,
          ),
        );
        errors.push(
          compat.rejectionReason ||
            `Ketidakcocokan satuan teknis (Unit Mismatch): Satuan DED adalah "${input.unit}", sedangkan satuan AHSP adalah "${ahspUnit}".`,
        );
      }
    }
  }

  // --- Gate 5: AHSP Candidate ---
  // Magic AI: NOT_APPLICABLE. Otherwise: AI-CUSTOM synthetics and
  // AMBIGUOUS multi-candidates are BLOCKING FAILs. No AHSP data at all is
  // NOT_EVALUATED here — Gate 6 carries the missing-AHSP verdict.
  if (!input.hasAhspFields) {
    gates.push(
      result(
        5,
        'NOT_APPLICABLE',
        'INFORMATION',
        'Item Magic AI tidak membawa field AHSP — Gate 5 tidak berlaku.',
      ),
    );
  } else if (isAiCustom) {
    gates.push(
      result(
        5,
        'FAIL',
        'BLOCKING',
        'Kode AHSP berasal dari fallback sintetis AI (AI-CUSTOM). Kode sintetis dilarang keras masuk ke RAB resmi.',
      ),
    );
    errors.push('Kode AHSP berasal dari fallback sintetis AI (AI-CUSTOM). Kode sintetis dilarang keras masuk ke RAB resmi.');
  } else if (hasMultipleCandidates) {
    gates.push(
      result(
        5,
        'FAIL',
        'BLOCKING',
        `Terdapat ${candidates.length || 'beberapa'} kandidat AHSP resmi yang valid. Perlu konfirmasi pilihan dari pengguna.`,
      ),
    );
    errors.push(
      `Terdapat ${candidates.length || 'beberapa'} kandidat AHSP resmi yang valid. Perlu konfirmasi pilihan dari pengguna.`,
    );
  } else if (hasAnyAhsp) {
    gates.push(
      result(5, 'PASS', 'BLOCKING', `Kandidat AHSP: ${ahspCode || matchStatus || 'terpetakan'}.`),
    );
    matchReasons.push(`Kandidat AHSP: ${ahspCode || matchStatus || 'terpetakan'}.`);
  } else {
    gates.push(
      result(
        5,
        'NOT_EVALUATED',
        'INFORMATION',
        'Tidak ada kandidat AHSP untuk dinilai (lihat Gate 6).',
      ),
    );
  }

  // --- Gate 6: Official AHSP Catalog (policy-aware; RAB READY RULE REMOVED) ---
  let assumptionLabeled = false;
  let assumptionNote: string | undefined;
  if (!input.hasAhspFields) {
    gates.push(
      result(
        6,
        'NOT_APPLICABLE',
        'INFORMATION',
        'Item Magic AI tidak membawa field AHSP — Gate 6 tidak berlaku.',
      ),
    );
  } else if (inOfficialCatalog) {
    gates.push(
      result(
        6,
        'PASS',
        'BLOCKING',
        `Terverifikasi dalam katalog resmi PUPR (${ahspCode}).`,
      ),
    );
    matchReasons.push(`Kode AHSP resmi terverifikasi: ${ahspCode} (${ahspName || '—'}).`);
  } else if (hasAnyAhsp) {
    // A claimed code that is NOT in the official catalog is a false claim
    // in both policies — BLOCKING, never laundered into an assumption.
    gates.push(
      result(
        6,
        'FAIL',
        'BLOCKING',
        `Kode AHSP "${ahspCode || matchStatus || '—'}" tidak terdaftar dalam database resmi AHSP.`,
      ),
    );
    errors.push(`Kode AHSP "${ahspCode || matchStatus || '—'}" tidak terdaftar dalam database resmi AHSP.`);
  } else if (policy === 'DATABASE') {
    gates.push(
      result(
        6,
        'FAIL',
        'BLOCKING',
        'Analisa Harga Satuan Pekerjaan (AHSP) resmi belum ditemukan dalam katalog PUPR 2026.',
      ),
    );
    errors.push('Analisa Harga Satuan Pekerjaan (AHSP) resmi belum ditemukan dalam katalog PUPR 2026.');
  } else {
    // FULL_AI: passes ONLY as a labeled assumption — never as plain READY,
    // never as verified. The assumption flag travels with the result.
    assumptionLabeled = true;
    assumptionNote =
      'Tanpa AHSP resmi — harga estimasi AI diterima sebagai ASUMSI berlabel (bukan harga terverifikasi database).';
    gates.push(
      result(6, 'PASS', 'WARNING', assumptionNote),
    );
    matchReasons.push(assumptionNote);
  }

  // --- Gate 7: Version Match (report numbering) — real check or NOT_EVALUATED ---
  const targetVersion = opts.targetAhspVersion?.trim();
  if (!input.hasAhspFields) {
    gates.push(
      result(
        7,
        'NOT_APPLICABLE',
        'INFORMATION',
        'Item Magic AI tidak membawa field AHSP — Gate 7 tidak berlaku.',
      ),
    );
  } else if (!targetVersion) {
    gates.push(
      result(
        7,
        'NOT_EVALUATED',
        'INFORMATION',
        'Tidak ada versi target AHSP yang diberikan — kecocokan versi tidak dapat diperiksa.',
      ),
    );
  } else if (!input.ahspMatch || !input.ahspMatch.period) {
    gates.push(
      result(
        7,
        'NOT_EVALUATED',
        'INFORMATION',
        'Match AHSP tidak membawa informasi versi/periode — kecocokan versi tidak dapat diperiksa.',
      ),
    );
  } else if (versionsCompatible(targetVersion, input.ahspMatch.period)) {
    gates.push(
      result(
        7,
        'PASS',
        'WARNING',
        `Versi AHSP cocok: periode match ${input.ahspMatch.period} vs database ${targetVersion}.`,
      ),
    );
    matchReasons.push(`Versi AHSP terverifikasi: periode ${input.ahspMatch.period} (database ${targetVersion}).`);
  } else {
    gates.push(
      result(
        7,
        'FAIL',
        'WARNING',
        `Versi AHSP "${input.ahspMatch.period}" tidak kompatibel dengan versi database target "${targetVersion}".`,
      ),
    );
    errors.push(`Versi AHSP "${input.ahspMatch.period}" tidak kompatibel dengan versi database target "${targetVersion}".`);
  }

  // --- Gate 8: Specification Compatibility (Candidate A owns grade logic) ---
  if (!input.hasAhspFields) {
    gates.push(
      result(
        8,
        'NOT_APPLICABLE',
        'INFORMATION',
        'Item Magic AI tidak membawa spesifikasi AHSP pembanding — Gate 8 tidak berlaku.',
      ),
    );
  } else if (!ahspName) {
    gates.push(
      result(
        8,
        'NOT_EVALUATED',
        'INFORMATION',
        'Nama pekerjaan AHSP belum tersedia — kompatibilitas spesifikasi tidak dapat diperiksa.',
      ),
    );
  } else {
    const conflict = checkBrickAndFoundationConflicts(dedText, ahspName);
    if (!conflict.isCompatible) {
      gates.push(result(8, 'FAIL', 'BLOCKING', conflict.reason));
      errors.push(conflict.reason);
    } else {
      // Candidate A: any grade contradiction (incl. cross-system K vs fc′,
      // and graded-input vs ungraded-candidate) vetoes the match.
      const grade = checkGradeCompatibility(dedText, ahspName);
      if (!grade.compatible) {
        gates.push(result(8, 'FAIL', 'BLOCKING', grade.reason));
        errors.push(grade.reason);
      } else {
        gates.push(
          result(
            8,
            'PASS',
            'BLOCKING',
            `Spesifikasi teknis sesuai: ${input.specification || input.name}.`,
          ),
        );
        matchReasons.push(`Spesifikasi teknis sesuai: ${input.specification || input.name}.`);
      }
    }
  }

  // --- Gate 9: AHSP Components Existence (+ breakdown-data validation) ---
  // FIXED v2 bug: FAIL only on an actual error condition — never merely
  // because the item is unverified. Validates the ACTUAL breakdown data
  // (`missingComponents`) and its relationship to the match status.
  if (!input.hasAhspFields) {
    gates.push(
      result(
        9,
        'NOT_APPLICABLE',
        'INFORMATION',
        'Item Magic AI tidak membawa field AHSP — Gate 9 tidak berlaku.',
      ),
    );
  } else if (!input.ahspMatch) {
    gates.push(
      result(
        9,
        'NOT_EVALUATED',
        'INFORMATION',
        'Tidak ada match AHSP — tidak ada data breakdown untuk divalidasi (lihat Gate 6).',
      ),
    );
  } else if (input.missingComponents === undefined) {
    // Breakdown data itself is absent (legacy match shape): nothing to
    // validate — NOT_EVALUATED, never an invented PASS or FAIL.
    gates.push(
      result(
        9,
        'NOT_EVALUATED',
        'INFORMATION',
        'Data breakdown komponen tidak tersedia pada match — keberadaan komponen tidak dapat divalidasi.',
      ),
    );
  } else {
    const malformed = input.missingComponents.filter(
      (c) => !c || !String(c.code ?? '').trim() || !String(c.name ?? '').trim(),
    );
    if (malformed.length > 0) {
      gates.push(
        result(
          9,
          'FAIL',
          'WARNING',
          `Data breakdown tidak valid: ${malformed.length} entri komponen hilang tanpa kode/nama.`,
        ),
      );
      errors.push(`Data breakdown tidak valid: ${malformed.length} entri komponen hilang tanpa kode/nama.`);
    } else if (input.missingComponents.length > 0) {
      const listed = input.missingComponents.map((c) => `${c.code} (${c.name})`).join(', ');
      const inconsistent =
        matchStatus === 'RESOLVED'
          ? ' — tidak konsisten dengan status RESOLVED.'
          : '.';
      gates.push(
        result(
          9,
          'FAIL',
          'WARNING',
          `Komponen AHSP belum lengkap: ${input.missingComponents.length} komponen belum terharga (${listed})${inconsistent}`,
        ),
      );
      errors.push(
        `Komponen AHSP (bahan, upah, alat) belum lengkap: ${input.missingComponents.length} komponen belum terharga (${listed}).`,
      );
    } else if (matchStatus === 'INCOMPLETE_COMPONENTS') {
      gates.push(
        result(
          9,
          'FAIL',
          'WARNING',
          'Status match INCOMPLETE_COMPONENTS — komposisi AHSP belum lengkap.',
        ),
      );
      errors.push('Komponen AHSP (bahan, upah, alat) tidak lengkap (INCOMPLETE_COMPONENTS).');
    } else if (matchStatus === 'RESOLVED') {
      gates.push(
        result(9, 'PASS', 'WARNING', 'Komposisi AHSP FULL — seluruh komponen terharga.'),
      );
      matchReasons.push('Komponen AHSP tersedia (komposisi FULL).');
    } else {
      // NEEDS_REVIEW / NO_MATCH / INVALID: the breakdown is not settled —
      // nothing validated, nothing invented.
      gates.push(
        result(
          9,
          'NOT_EVALUATED',
          'INFORMATION',
          `Status match ${matchStatus ?? '—'} — breakdown komponen belum final dan tidak dapat divalidasi.`,
        ),
      );
    }
  }

  // --- Gate 10: Resource Price Validity ---
  // Live data carries missing resources only as `missingComponents`
  // (same source as Gate 9, different question: are all resources priced?).
  if (!input.hasAhspFields) {
    gates.push(
      result(
        10,
        'NOT_APPLICABLE',
        'INFORMATION',
        'Item Magic AI tidak membawa field AHSP — Gate 10 tidak berlaku.',
      ),
    );
  } else if (!input.ahspMatch || input.missingComponents === undefined) {
    gates.push(
      result(
        10,
        'NOT_EVALUATED',
        'INFORMATION',
        'Tidak ada data komponen AHSP — validitas harga resource tidak dapat diperiksa.',
      ),
    );
  } else if (input.missingComponents.length > 0) {
    gates.push(
      result(
        10,
        'FAIL',
        'WARNING',
        `Terdapat ${input.missingComponents.length} resource yang belum memiliki harga dalam komponen AHSP.`,
      ),
    );
    errors.push(
      `Terdapat ${input.missingComponents.length} resource yang belum memiliki harga dalam komponen AHSP.`,
    );
  } else {
    gates.push(
      result(10, 'PASS', 'WARNING', 'Seluruh resource dalam komponen AHSP telah memiliki harga valid.'),
    );
    matchReasons.push('Seluruh resource dalam komponen AHSP telah memiliki harga valid.');
  }

  // --- Gate 11: Price Validity ---
  if (isPriceValid) {
    gates.push(
      result(
        11,
        'PASS',
        'BLOCKING',
        isAiPrice
          ? `Harga estimasi AI: Rp ${Number(unitPrice).toLocaleString('id-ID')} (AI_ESTIMATE — bukan harga terverifikasi).`
          : `Harga resmi: Rp ${Number(unitPrice).toLocaleString('id-ID')} (${input.priceSource}).`,
      ),
    );
    matchReasons.push(
      isAiPrice
        ? `Harga satuan estimasi AI: Rp ${Number(unitPrice).toLocaleString('id-ID')} (AI_ESTIMATE).`
        : `Harga satuan resmi: Rp ${Number(unitPrice).toLocaleString('id-ID')} (${input.priceSource}).`,
    );
  } else {
    gates.push(
      result(
        11,
        'FAIL',
        'BLOCKING',
        'Harga satuan pekerjaan belum tersedia dari database harga proyek atau katalog resmi.',
      ),
    );
    errors.push('Harga satuan pekerjaan belum tersedia dari database harga proyek atau katalog resmi.');
  }

  // --- Gate 12: Deterministic Calculation (supplement Gate 7, second half) ---
  // Deterministic ONLY when (a) the arithmetic is consistent AND (b)
  // calculation provenance + an applicable formula are actually available
  // and verified. qty > 0 alone never proves determinism.
  const hasFormula =
    Boolean(input.quantityFormula && input.quantityFormula.trim().length > 0) ||
    Boolean(input.formulaSteps && input.formulaSteps.length > 0);
  const derivationRejected = Boolean(
    input.derivationValidationStatus &&
      input.derivationValidationStatus.toLowerCase().startsWith('rejected'),
  );
  const derivationOk = input.derivationValidationStatus === 'ok';
  const hasProvenance = hasFormula || derivationOk;
  if (!isQtyValid || !isPriceValid || input.subtotal == null) {
    gates.push(
      result(
        12,
        'FAIL',
        'BLOCKING',
        'Total harga pekerjaan (quantity × unit price) tidak menghasilkan nilai deterministik yang valid.',
      ),
    );
    if (isQtyValid && isPriceValid) {
      errors.push('Total harga pekerjaan (quantity × unit price) tidak menghasilkan nilai deterministik yang valid.');
    }
  } else if (derivationRejected) {
    gates.push(
      result(
        12,
        'FAIL',
        'BLOCKING',
        `Derivasi kuantitas ditolak: ${input.derivationValidationStatus}.`,
      ),
    );
    errors.push(`Derivasi kuantitas ditolak: ${input.derivationValidationStatus}.`);
  } else {
    const expected = qty! * unitPrice!;
    const tolerance = Math.max(1, Math.abs(expected) * 0.005);
    if (Math.abs(input.subtotal - expected) > tolerance) {
      gates.push(
        result(
          12,
          'FAIL',
          'BLOCKING',
          `Subtotal tidak konsisten: ${qty} × Rp ${Number(unitPrice).toLocaleString('id-ID')} = Rp ${expected.toLocaleString('id-ID')}, tetapi subtotal tercatat Rp ${Number(input.subtotal).toLocaleString('id-ID')}.`,
        ),
      );
      errors.push(
        `Subtotal tidak konsisten dengan quantity × harga satuan (${qty} × ${unitPrice} ≠ ${input.subtotal}).`,
      );
    } else if (!hasProvenance) {
      // Arithmetic is consistent, but no formula/derivation proves HOW the
      // quantity was computed — determinism cannot be validated.
      gates.push(
        result(
          12,
          'NOT_EVALUATED',
          'INFORMATION',
          'Aritmetik konsisten tetapi provenance perhitungan (formula/derivasi) tidak tersedia — determinisme tidak dapat divalidasi.',
        ),
      );
    } else {
      gates.push(
        result(
          12,
          'PASS',
          'BLOCKING',
          `Kalkulasi terverifikasi: ${qty} × Rp ${Number(unitPrice).toLocaleString('id-ID')} = Rp ${Number(input.subtotal).toLocaleString('id-ID')} (formula tersedia).`,
        ),
      );
      matchReasons.push(
        `Kalkulasi deterministik terverifikasi: ${qty} × Rp ${Number(unitPrice).toLocaleString('id-ID')} = Rp ${Number(input.subtotal).toLocaleString('id-ID')}.`,
      );
    }
  }

  // --- Gate 13: No Critical Audit Error ---
  if (input.hasAhspFields && input.warnings === undefined && input.exclusionReason === undefined) {
    // DedAiItem: no warnings field — map to quantityReview / stage.
    if (input.quantityReviewSeverity === 'HIGH' || input.stage === 'REJECTED') {
      gates.push(
        result(
          13,
          'FAIL',
          'WARNING',
          input.stage === 'REJECTED'
            ? 'Item berstage REJECTED — ada temuan audit kritis.'
            : 'Quantity review berkategori HIGH — ada temuan audit kritis.',
        ),
      );
      errors.push('Item memiliki temuan audit kritis yang harus diselesaikan sebelum masuk RAB.');
    } else {
      gates.push(
        result(
          13,
          'NOT_EVALUATED',
          'INFORMATION',
          'Tidak ada sinyal audit kritis (quantityReview/stage) yang dapat diperiksa — bukan klaim "audit bersih".',
        ),
      );
    }
  } else if (!input.hasAhspFields && input.warnings === undefined) {
    gates.push(
      result(
        13,
        'NOT_EVALUATED',
        'INFORMATION',
        'Tidak ada daftar warnings — temuan audit tidak dapat diperiksa.',
      ),
    );
  } else if (input.exclusionReason != null) {
    gates.push(
      result(
        13,
        'FAIL',
        'WARNING',
        `Item dikecualikan dari total: ${input.exclusionReason}.`,
      ),
    );
    errors.push(`Item dikecualikan dari total: ${input.exclusionReason}.`);
  } else if (!input.hasAhspFields && input.exclusionReason === undefined) {
    // Magic AI path with a warnings array (or an empty one).
    const warnings = (input.warnings ?? []) as unknown[];
    const critical = warnings.some((w) =>
      String(w ?? '')
        .toLowerCase()
        .match(/critical|fatal|conflict/),
    );
    if (critical) {
      gates.push(
        result(
          13,
          'FAIL',
          'WARNING',
          'Item memiliki warning kritis yang harus diselesaikan sebelum masuk RAB.',
        ),
      );
      errors.push('Item memiliki warning kritis yang harus diselesaikan sebelum masuk RAB.');
    } else {
      gates.push(
        result(13, 'PASS', 'WARNING', 'Audit bersih tanpa warning kritis.'),
      );
    }
  } else {
    // FullAiItem without an exclusion reason: no critical-audit signal.
    gates.push(
      result(
        13,
        'NOT_EVALUATED',
        'INFORMATION',
        'Tidak ada sinyal audit kritis yang dapat diperiksa — bukan klaim "audit bersih".',
      ),
    );
  }

  // --- Overall verdict (v2 precedence, advisory: only BLOCKING fails block) ---
  const byGate = new Map(gates.map((g) => [g.gate, g]));
  const blockingFailures = gates.filter((g) => g.status === 'FAIL' && g.severity === 'BLOCKING');
  const warningFailures = gates.filter((g) => g.status === 'FAIL' && g.severity === 'WARNING');
  const rabEligible = blockingFailures.length === 0;

  let validationStatus: LiveValidationStatus = 'READY';
  let confidenceRating: LiveConfidenceRating = 'HIGH';
  if (byGate.get(5)?.status === 'FAIL' && hasMultipleCandidates) {
    validationStatus = 'AMBIGUOUS';
    confidenceRating = 'MEDIUM';
  } else if (
    byGate.get(5)?.status === 'FAIL' ||
    byGate.get(6)?.status === 'FAIL'
  ) {
    validationStatus = 'MISSING_AHSP';
    confidenceRating = 'LOW';
  } else if (byGate.get(8)?.status === 'FAIL') {
    validationStatus = 'SPECIFICATION_MISMATCH';
    confidenceRating = 'LOW';
  } else if (byGate.get(4)?.status === 'FAIL') {
    validationStatus = 'UNIT_MISMATCH';
    confidenceRating = 'LOW';
  } else if (byGate.get(3)?.status === 'FAIL') {
    validationStatus = 'MISSING_QUANTITY';
    confidenceRating = 'MEDIUM';
  } else if (byGate.get(11)?.status === 'FAIL') {
    validationStatus = 'MISSING_PRICE';
    confidenceRating = 'MEDIUM';
  } else if (byGate.get(2)?.status === 'FAIL') {
    validationStatus = 'NEEDS_REVIEW';
    confidenceRating = 'MEDIUM';
  } else if (byGate.get(9)?.status === 'FAIL') {
    validationStatus = 'COMPONENT_MISSING';
    confidenceRating = 'MEDIUM';
  } else if (byGate.get(10)?.status === 'FAIL') {
    validationStatus = 'RESOURCE_MISSING';
    confidenceRating = 'MEDIUM';
  } else if (byGate.get(12)?.status === 'FAIL') {
    validationStatus = 'NEEDS_REVIEW';
    confidenceRating = 'MEDIUM';
  } else if (byGate.get(13)?.status === 'FAIL') {
    validationStatus = 'NEEDS_REVIEW';
    confidenceRating = 'LOW';
  } else if (assumptionLabeled) {
    validationStatus = 'READY';
    confidenceRating = 'MEDIUM';
  } else {
    validationStatus = 'READY';
    confidenceRating = 'HIGH';
  }

  // `verified` is derived from price source ONLY (defect 2): true only for
  // an official AHSP_2026 price whose code is in the official catalog.
  const verified = isOfficialPrice && inOfficialCatalog;
  const confidenceScore =
    confidenceRating === 'HIGH' ? 0.95 : confidenceRating === 'MEDIUM' ? 0.75 : confidenceRating === 'LOW' ? 0.4 : 0.0;

  return {
    rabEligible,
    validationStatus,
    confidenceRating,
    confidenceScore,
    validationErrors: errors,
    gates,
    blockingFailures,
    warningFailures,
    assumptionLabeled,
    assumptionNote,
    provenance: {
      workDescription: input.name,
      matchedAhspCode: ahspCode || '—',
      matchedAhspName: ahspName || 'Belum terpetakan',
      ahspVersion: opts.targetAhspVersion ?? 'AHSP PUPR 2026 (SE DJBK No. 47/SE/Dk/2026)',
      officialUnit: ahspUnit || input.unit || 'm³',
      specificationMatch: {
        dedSpec: input.specification || input.name,
        ahspSpec: ahspName,
        isCompatible: byGate.get(8)?.status === 'PASS' ? true : byGate.get(8)?.status === 'FAIL' ? false : null,
      },
      unitMatch: {
        dedUnit: input.unit,
        ahspUnit: ahspUnit || input.unit,
        isCompatible: byGate.get(4)?.status === 'PASS' ? true : byGate.get(4)?.status === 'FAIL' ? false : null,
      },
      matchReasons,
      sourceDocumentTrace: {
        pageNumber: input.sourcePages?.[0] || 1,
        evidenceId: input.evidence?.[0] || '—',
      },
      priceVerification: {
        source: isAiPrice
          ? 'EZRAB AI Price Estimation Engine'
          : input.priceSource || 'PRICE_NOT_FOUND',
        verified,
        unitPrice: input.unitPrice ?? null,
      },
      databaseVerified: inOfficialCatalog && !isAiPrice && !isAiCustom,
      priceSource: input.priceSource || 'PRICE_NOT_FOUND',
    },
    isValid: rabEligible,
    status: validationStatus,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Convenience wrappers (live items → gate)
// ---------------------------------------------------------------------------

export function validateDedAiItem(
  item: DedAiItem,
  policy: DedGatePolicy,
  opts: ValidateGateOptions = {},
): LiveGateValidationResult {
  return validateDedRabItem(adaptDedAiItem(item, policy), opts);
}

export function validateFullAiItem(
  item: FullAiItem,
  policy: DedGatePolicy,
  opts: ValidateGateOptions = {},
): LiveGateValidationResult {
  return validateDedRabItem(adaptFullAiItem(item, policy), opts);
}

export function validateMagicAiItem(
  item: AiEstimateWorkItem,
  policy: DedGatePolicy,
  opts: ValidateGateOptions = {},
): LiveGateValidationResult {
  return validateDedRabItem(adaptMagicAiItem(item, policy), opts);
}

/** One-line gate summary for display: "Gate 5, 6 BLOCKING: …". */
export function blockingSummary(result: LiveGateValidationResult): string {
  if (result.blockingFailures.length === 0) return '';
  return result.blockingFailures
    .map((g) => `Gate ${g.gate} (${g.name}): ${g.reason}`)
    .join(' | ');
}
