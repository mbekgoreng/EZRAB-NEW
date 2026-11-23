/**
 * DED drawing-vision — deterministic geometry-based QTO (spec §5/§8, increment I4).
 *
 * Pure functions. The vision/LLM layer proposes dimensions; THIS module is the
 * only place a geometry quantity is computed, and every arithmetic step goes
 * through SafeDecimalEngine (4-decimal scaled integers). There is no raw
 * `*` / `+` / `-` / `/` on quantity values anywhere below.
 *
 * Rules (from types.ts + the v2 DedQuantityEngine MISSING_QTY behaviour):
 * - Missing / non-finite / negative input -> `quantity: null`, status
 *   UNRESOLVED, with the missing input named in `assumptions`. Never 0 for a
 *   missing input.
 * - `formula` is display-only. It is never parsed or evaluated; the value
 *   comes from SafeDecimalEngine.
 * - `VERIFIED` is never set here — confidence alone caps at HIGH_CONFIDENCE
 *   (see `statusFromConfidence` in types.ts).
 * - Dimensions arrive in millimetres (drawing convention) and are converted
 *   to metres deterministically (÷ 1000 via safeDivide, 4 decimals).
 * - Quantities are rounded to 4 decimals (SafeDecimalEngine's native scale).
 *
 * NOTE on the SafeDecimalEngine API trap (D-39/NEW-09): `safeAdd` is variadic
 * and has NO decimals parameter — a third argument would be added literally.
 * All rounding here goes through `safeRound` / the decimals param of
 * `safeMultiply` / `safeDivide`, never through `safeAdd`.
 */

import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';
import { statusFromConfidence } from './types';
import type { EvidenceRecord, GeometryQuantity, GeometryQuantityKind } from './types';

/** Options shared by every QTO function: traceability + input-evidence quality. */
export interface QtoOptions {
  /** Override the generated id (default: `qto-<kind>-<n>`, sequential per process). */
  id?: string;
  sourcePages?: number[];
  evidence?: EvidenceRecord[];
  assumptions?: string[];
  /**
   * 0..1 confidence of the INPUT evidence (not of the arithmetic — that is
   * exact). Defaults to 1. Drives the review status via `statusFromConfidence`
   * (caps at HIGH_CONFIDENCE; VERIFIED needs explicit verification).
   */
  confidence?: number;
}

/** One rectangular opening (door/window/vent) to deduct from a wall. */
export interface OpeningDimension {
  widthMm: number | null | undefined;
  heightMm: number | null | undefined;
}

let qtoCounter = 0;

function nextId(kind: GeometryQuantityKind): string {
  qtoCounter += 1;
  return `qto-${kind.toLowerCase()}-${qtoCounter}`;
}

function resolveId(kind: GeometryQuantityKind, opts?: QtoOptions): string {
  return opts?.id ?? nextId(kind);
}

function resolveConfidence(opts?: QtoOptions): number {
  const c = opts?.confidence;
  if (typeof c === 'number' && Number.isFinite(c) && c >= 0 && c <= 1) return c;
  return 1;
}

/** A dimension is usable only when it is a finite number >= 0. Zero is a real value, not missing. */
function isValidDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Millimetres -> metres, deterministically (÷ 1000, 4 decimals). */
function mmToMetres(mm: number): number {
  return SafeDecimalEngine.safeDivide(mm, 1000, 4);
}

/** Metres for display in formulas: 3 decimals (millimetre precision). */
function fmtM(m: number): string {
  return m.toFixed(3);
}

/** A computed quantity for display in formulas: 4 decimals, no trailing noise. */
function fmtQty(q: number): string {
  return String(SafeDecimalEngine.safeRound(q, 4));
}

function missingNote(missing: string[]): string {
  return `Input tidak tersedia atau tidak valid: ${missing.join(', ')} — kuantitas tidak dihitung (bukan 0).`;
}

function unresolvedQuantity(
  kind: GeometryQuantityKind,
  unit: string,
  formula: string,
  inputs: Record<string, number | string>,
  reasons: string[],
  opts?: QtoOptions,
): GeometryQuantity {
  return {
    id: resolveId(kind, opts),
    kind,
    quantity: null,
    unit,
    formula,
    inputs,
    sourcePages: [...(opts?.sourcePages ?? [])],
    evidence: [...(opts?.evidence ?? [])],
    assumptions: [...(opts?.assumptions ?? []), ...reasons],
    confidence: 0,
    status: 'UNRESOLVED',
  };
}

function resolvedQuantity(
  kind: GeometryQuantityKind,
  unit: string,
  quantity: number,
  formula: string,
  inputs: Record<string, number | string>,
  opts?: QtoOptions,
): GeometryQuantity {
  const confidence = resolveConfidence(opts);
  return {
    id: resolveId(kind, opts),
    kind,
    quantity: SafeDecimalEngine.safeRound(quantity, 4),
    unit,
    formula,
    inputs,
    sourcePages: [...(opts?.sourcePages ?? [])],
    evidence: [...(opts?.evidence ?? [])],
    assumptions: [...(opts?.assumptions ?? [])],
    confidence,
    status: statusFromConfidence(confidence),
  };
}

/** Length: mm -> m. */
export function qtoLength(
  lengthMm: number | null | undefined,
  opts?: QtoOptions,
): GeometryQuantity {
  const inputs: Record<string, number | string> = {};
  if (lengthMm !== null && lengthMm !== undefined) inputs.panjang_mm = lengthMm;
  if (!isValidDimension(lengthMm)) {
    return unresolvedQuantity('LENGTH', 'm', 'panjang (?)', inputs, [missingNote(['panjang (mm)'])], opts);
  }
  const m = mmToMetres(lengthMm);
  inputs.panjang_m = m;
  return resolvedQuantity('LENGTH', 'm', m, `${lengthMm} mm = ${fmtM(m)} m`, inputs, opts);
}

/** Rectangular area: L × W (mm inputs -> m²). */
export function qtoArea(
  lengthMm: number | null | undefined,
  widthMm: number | null | undefined,
  opts?: QtoOptions,
): GeometryQuantity {
  const inputs: Record<string, number | string> = {};
  if (lengthMm !== null && lengthMm !== undefined) inputs.panjang_mm = lengthMm;
  if (widthMm !== null && widthMm !== undefined) inputs.lebar_mm = widthMm;
  const lValid = isValidDimension(lengthMm);
  const wValid = isValidDimension(widthMm);
  if (!lValid || !wValid) {
    const missing: string[] = [];
    if (!lValid) missing.push('panjang (mm)');
    if (!wValid) missing.push('lebar (mm)');
    const l = lValid ? fmtM(mmToMetres(lengthMm)) : '?';
    const w = wValid ? fmtM(mmToMetres(widthMm)) : '?';
    return unresolvedQuantity('AREA', 'm2', `${l} × ${w}`, inputs, [missingNote(missing)], opts);
  }
  const lM = mmToMetres(lengthMm);
  const wM = mmToMetres(widthMm);
  inputs.panjang_m = lM;
  inputs.lebar_m = wM;
  const area = SafeDecimalEngine.safeMultiply(lM, wM, 4);
  return resolvedQuantity('AREA', 'm2', area, `${fmtM(lM)} × ${fmtM(wM)}`, inputs, opts);
}

/** Rectangular perimeter: 2 × (L + W) (mm inputs -> m). */
export function qtoPerimeter(
  lengthMm: number | null | undefined,
  widthMm: number | null | undefined,
  opts?: QtoOptions,
): GeometryQuantity {
  const inputs: Record<string, number | string> = {};
  if (lengthMm !== null && lengthMm !== undefined) inputs.panjang_mm = lengthMm;
  if (widthMm !== null && widthMm !== undefined) inputs.lebar_mm = widthMm;
  const lValid = isValidDimension(lengthMm);
  const wValid = isValidDimension(widthMm);
  if (!lValid || !wValid) {
    const missing: string[] = [];
    if (!lValid) missing.push('panjang (mm)');
    if (!wValid) missing.push('lebar (mm)');
    const l = lValid ? fmtM(mmToMetres(lengthMm)) : '?';
    const w = wValid ? fmtM(mmToMetres(widthMm)) : '?';
    return unresolvedQuantity('PERIMETER', 'm', `2 × (${l} + ${w})`, inputs, [missingNote(missing)], opts);
  }
  const lM = mmToMetres(lengthMm);
  const wM = mmToMetres(widthMm);
  inputs.panjang_m = lM;
  inputs.lebar_m = wM;
  const half = SafeDecimalEngine.safeAdd(lM, wM);
  const perimeter = SafeDecimalEngine.safeMultiply(2, half, 4);
  return resolvedQuantity('PERIMETER', 'm', perimeter, `2 × (${fmtM(lM)} + ${fmtM(wM)})`, inputs, opts);
}

/** Rectangular-prism volume: L × W × H (mm inputs -> m³). */
export function qtoVolume(
  lengthMm: number | null | undefined,
  widthMm: number | null | undefined,
  heightMm: number | null | undefined,
  opts?: QtoOptions,
): GeometryQuantity {
  const inputs: Record<string, number | string> = {};
  if (lengthMm !== null && lengthMm !== undefined) inputs.panjang_mm = lengthMm;
  if (widthMm !== null && widthMm !== undefined) inputs.lebar_mm = widthMm;
  if (heightMm !== null && heightMm !== undefined) inputs.tinggi_mm = heightMm;
  const lValid = isValidDimension(lengthMm);
  const wValid = isValidDimension(widthMm);
  const hValid = isValidDimension(heightMm);
  if (!lValid || !wValid || !hValid) {
    const missing: string[] = [];
    if (!lValid) missing.push('panjang (mm)');
    if (!wValid) missing.push('lebar (mm)');
    if (!hValid) missing.push('tinggi (mm)');
    const l = lValid ? fmtM(mmToMetres(lengthMm)) : '?';
    const w = wValid ? fmtM(mmToMetres(widthMm)) : '?';
    const h = hValid ? fmtM(mmToMetres(heightMm)) : '?';
    return unresolvedQuantity('VOLUME', 'm3', `${l} × ${w} × ${h}`, inputs, [missingNote(missing)], opts);
  }
  const lM = mmToMetres(lengthMm);
  const wM = mmToMetres(widthMm);
  const hM = mmToMetres(heightMm);
  inputs.panjang_m = lM;
  inputs.lebar_m = wM;
  inputs.tinggi_m = hM;
  const area = SafeDecimalEngine.safeMultiply(lM, wM, 4);
  const volume = SafeDecimalEngine.safeMultiply(area, hM, 4);
  return resolvedQuantity('VOLUME', 'm3', volume, `${fmtM(lM)} × ${fmtM(wM)} × ${fmtM(hM)}`, inputs, opts);
}

/** Discrete count (doors, columns, fixtures…). Must be a non-negative integer. */
export function qtoCount(count: number | null | undefined, opts?: QtoOptions): GeometryQuantity {
  const inputs: Record<string, number | string> = {};
  if (count !== null && count !== undefined) inputs.jumlah = count;
  if (
    typeof count !== 'number' ||
    !Number.isFinite(count) ||
    count < 0 ||
    !Number.isInteger(count)
  ) {
    return unresolvedQuantity(
      'COUNT',
      'unit',
      'jumlah (?)',
      inputs,
      [missingNote(['jumlah (bilangan bulat ≥ 0)'])],
      opts,
    );
  }
  return resolvedQuantity('COUNT', 'unit', count, `${count} unit`, inputs, opts);
}

/**
 * Total surface area of a rectangular prism: 2 × (L×W + L×H + W×H)
 * (mm inputs -> m²). Used for e.g. formwork / coating / cladding take-off
 * of a box-shaped element.
 */
export function qtoSurfaceArea(
  lengthMm: number | null | undefined,
  widthMm: number | null | undefined,
  heightMm: number | null | undefined,
  opts?: QtoOptions,
): GeometryQuantity {
  const inputs: Record<string, number | string> = {};
  if (lengthMm !== null && lengthMm !== undefined) inputs.panjang_mm = lengthMm;
  if (widthMm !== null && widthMm !== undefined) inputs.lebar_mm = widthMm;
  if (heightMm !== null && heightMm !== undefined) inputs.tinggi_mm = heightMm;
  const lValid = isValidDimension(lengthMm);
  const wValid = isValidDimension(widthMm);
  const hValid = isValidDimension(heightMm);
  if (!lValid || !wValid || !hValid) {
    const missing: string[] = [];
    if (!lValid) missing.push('panjang (mm)');
    if (!wValid) missing.push('lebar (mm)');
    if (!hValid) missing.push('tinggi (mm)');
    const l = lValid ? fmtM(mmToMetres(lengthMm)) : '?';
    const w = wValid ? fmtM(mmToMetres(widthMm)) : '?';
    const h = hValid ? fmtM(mmToMetres(heightMm)) : '?';
    return unresolvedQuantity(
      'SURFACE_AREA',
      'm2',
      `2 × (${l} × ${w} + ${l} × ${h} + ${w} × ${h})`,
      inputs,
      [missingNote(missing)],
      opts,
    );
  }
  const lM = mmToMetres(lengthMm);
  const wM = mmToMetres(widthMm);
  const hM = mmToMetres(heightMm);
  inputs.panjang_m = lM;
  inputs.lebar_m = wM;
  inputs.tinggi_m = hM;
  const lw = SafeDecimalEngine.safeMultiply(lM, wM, 4);
  const lh = SafeDecimalEngine.safeMultiply(lM, hM, 4);
  const wh = SafeDecimalEngine.safeMultiply(wM, hM, 4);
  inputs.sisi_lw_m2 = lw;
  inputs.sisi_lh_m2 = lh;
  inputs.sisi_wh_m2 = wh;
  const half = SafeDecimalEngine.safeAdd(lw, lh, wh);
  const surface = SafeDecimalEngine.safeMultiply(2, half, 4);
  return resolvedQuantity(
    'SURFACE_AREA',
    'm2',
    surface,
    `2 × (${fmtM(lM)} × ${fmtM(wM)} + ${fmtM(lM)} × ${fmtM(hM)} + ${fmtM(wM)} × ${fmtM(hM)})`,
    inputs,
    opts,
  );
}

/**
 * Net wall area: gross wall area minus every opening deduction.
 * Each deduction is listed individually in `inputs` (`bukaan_N_luas_m2`).
 * Mirrors the live `deriveDindingNetto` rule: no deduction is ever assumed —
 * an opening with missing/invalid dimensions fails the whole quantity
 * (UNRESOLVED) instead of being silently skipped, and a deduction total
 * larger than the gross area is inconsistent geometry (UNRESOLVED), never a
 * negative area.
 */
export function qtoWallNetArea(
  wallLengthMm: number | null | undefined,
  wallHeightMm: number | null | undefined,
  openings: OpeningDimension[] | null | undefined,
  opts?: QtoOptions,
): GeometryQuantity {
  const inputs: Record<string, number | string> = {};
  if (wallLengthMm !== null && wallLengthMm !== undefined) inputs.panjang_dinding_mm = wallLengthMm;
  if (wallHeightMm !== null && wallHeightMm !== undefined) inputs.tinggi_dinding_mm = wallHeightMm;

  const openingList = openings ?? [];
  const missing: string[] = [];
  const lValid = isValidDimension(wallLengthMm);
  const hValid = isValidDimension(wallHeightMm);
  if (!lValid) missing.push('panjang dinding (mm)');
  if (!hValid) missing.push('tinggi dinding (mm)');

  // Validate every opening up front; keep only fully-validated dimensions.
  const validated: { wMm: number; hMm: number }[] = [];
  openingList.forEach((op, i) => {
    const label = `bukaan ke-${i + 1}`;
    const w = op?.widthMm;
    const h = op?.heightMm;
    const wValid = isValidDimension(w);
    const hValidOp = isValidDimension(h);
    if (!wValid) missing.push(`${label} lebar (mm)`);
    if (!hValidOp) missing.push(`${label} tinggi (mm)`);
    if (wValid && hValidOp) validated.push({ wMm: w, hMm: h });
  });

  if (!lValid || !hValid || missing.length > 0) {
    const l = lValid ? fmtM(mmToMetres(wallLengthMm)) : '?';
    const h = hValid ? fmtM(mmToMetres(wallHeightMm)) : '?';
    const deductions = openingList
      .map((op) => {
        const w = op?.widthMm;
        const hh = op?.heightMm;
        const wTxt = isValidDimension(w) ? fmtM(mmToMetres(w)) : '?';
        const hTxt = isValidDimension(hh) ? fmtM(mmToMetres(hh)) : '?';
        return `${wTxt} × ${hTxt}`;
      })
      .join(' − ');
    const formula = deductions.length > 0 ? `${l} × ${h} − ${deductions}` : `${l} × ${h}`;
    return unresolvedQuantity('AREA', 'm2', formula, inputs, [missingNote(missing)], opts);
  }

  const lM = mmToMetres(wallLengthMm);
  const hM = mmToMetres(wallHeightMm);
  inputs.panjang_dinding_m = lM;
  inputs.tinggi_dinding_m = hM;
  const gross = SafeDecimalEngine.safeMultiply(lM, hM, 4);
  inputs.luas_bruto_m2 = gross;
  inputs.jumlah_bukaan = validated.length;

  const deductions: number[] = [];
  const deductionTerms: string[] = [];
  validated.forEach((op, i) => {
    const wM = mmToMetres(op.wMm);
    const hM = mmToMetres(op.hMm);
    const area = SafeDecimalEngine.safeMultiply(wM, hM, 4);
    inputs[`bukaan_${i + 1}_lebar_mm`] = op.wMm;
    inputs[`bukaan_${i + 1}_tinggi_mm`] = op.hMm;
    inputs[`bukaan_${i + 1}_luas_m2`] = area;
    deductions.push(area);
    deductionTerms.push(`${fmtM(wM)} × ${fmtM(hM)}`);
  });
  const totalDeduction = deductions.length > 0 ? SafeDecimalEngine.safeAdd(...deductions) : 0;
  inputs.total_bukaan_m2 = totalDeduction;

  const formula =
    deductionTerms.length > 0
      ? `${fmtM(lM)} × ${fmtM(hM)} − ${deductionTerms.join(' − ')}`
      : `${fmtM(lM)} × ${fmtM(hM)}`;

  const net = SafeDecimalEngine.safeSubtract(gross, totalDeduction);
  if (net < 0) {
    return unresolvedQuantity(
      'AREA',
      'm2',
      formula,
      inputs,
      [
        `Total luas bukaan (${fmtQty(totalDeduction)} m²) melebihi luas bruto dinding (${fmtQty(gross)} m²) — geometri tidak konsisten, kuantitas tidak dihitung (bukan nilai negatif).`,
      ],
      opts,
    );
  }
  return resolvedQuantity('AREA', 'm2', net, formula, inputs, opts);
}

/**
 * Sum same-kind / same-unit quantities across floors (or any grouping).
 * Mismatched kind/unit, a null member, or an empty list -> quantity-null
 * UNRESOLVED, never a wrong sum. Confidence is the weakest member's;
 * a CONFLICT member propagates CONFLICT to the total.
 *
 * NOTE: for an empty list there is no kind/unit to report, so the result
 * carries placeholder kind AREA / unit m2 — stated in its assumptions.
 */
export function aggregateFloors(quantities: GeometryQuantity[]): GeometryQuantity {
  if (quantities.length === 0) {
    return unresolvedQuantity(
      'AREA',
      'm2',
      '—',
      { jumlah_lantai: 0 },
      [
        'Tidak ada kuantitas lantai untuk diagregasi (daftar kosong). Jenis AREA / satuan m2 di atas hanya placeholder — tidak ada input yang menentukannya.',
      ],
      undefined,
    );
  }

  const kind = quantities[0].kind;
  const unit = quantities[0].unit;
  const sourcePages = [...new Set(quantities.flatMap((q) => q.sourcePages))].sort((a, b) => a - b);
  const evidence = quantities.flatMap((q) => q.evidence);
  const memberAssumptions = [...new Set(quantities.flatMap((q) => q.assumptions))];
  const traceOpts: QtoOptions = { sourcePages, evidence, assumptions: memberAssumptions };

  const mismatched = quantities.filter((q) => q.kind !== kind || q.unit !== unit);
  if (mismatched.length > 0) {
    const kinds = [...new Set(quantities.map((q) => `${q.kind} (${q.unit})`))].join(', ');
    const inputs: Record<string, number | string> = { jumlah_lantai: quantities.length };
    quantities.forEach((q, i) => {
      inputs[`lantai_${i + 1}`] = q.quantity === null ? 'null' : q.quantity;
    });
    return unresolvedQuantity(
      kind,
      unit,
      quantities.map((q) => (q.quantity === null ? '?' : fmtQty(q.quantity))).join(' + '),
      inputs,
      [
        `Jenis/satuan tidak cocok untuk agregasi (${kinds}) — penjumlahan dibatalkan, kuantitas tidak dihitung.`,
      ],
      traceOpts,
    );
  }

  const nullMembers = quantities.filter((q) => q.quantity === null);
  if (nullMembers.length > 0) {
    const inputs: Record<string, number | string> = { jumlah_lantai: quantities.length };
    quantities.forEach((q, i) => {
      inputs[`lantai_${i + 1}`] = q.quantity === null ? 'null' : q.quantity;
    });
    return unresolvedQuantity(
      kind,
      unit,
      quantities.map((q) => (q.quantity === null ? '?' : fmtQty(q.quantity))).join(' + '),
      inputs,
      [
        `Kuantitas lantai tidak lengkap: ${nullMembers.length} dari ${quantities.length} bernilai null — total tidak dihitung (bukan 0).`,
      ],
      traceOpts,
    );
  }

  const values = quantities.map((q) => q.quantity as number);
  const total = SafeDecimalEngine.safeAdd(...values);
  const inputs: Record<string, number | string> = { jumlah_lantai: quantities.length };
  values.forEach((v, i) => {
    inputs[`lantai_${i + 1}`] = v;
  });
  const confidence = Math.min(...quantities.map((q) => q.confidence));
  const hasConflict = quantities.some((q) => q.status === 'CONFLICT');
  return {
    id: nextId(kind),
    kind,
    quantity: SafeDecimalEngine.safeRound(total, 4),
    unit,
    formula: values.map((v) => fmtQty(v)).join(' + '),
    inputs,
    sourcePages,
    evidence,
    assumptions: memberAssumptions,
    confidence,
    status: hasConflict ? 'CONFLICT' : statusFromConfidence(confidence),
  };
}
