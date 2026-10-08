/**
 * DED AI ESTIMATE — Quantity Calculator (src/ai-tools/ded-ai-estimate/quantity.ts)
 * Deterministic quantity computation from DED geometry/context. This owns ALL
 * arithmetic for quantities. The AI may give a formula or dimension string, but
 * the actual numbers are computed here, in code. Never fabricated, never coerces
 * null→0.
 */

export interface QtyInputs {
  length?: number;
  width?: number;
  height?: number;
  depth?: number;
  area?: number;
  volume?: number;
  count?: number;
  factor?: number;
}

export function parseDimensionsString(input: string | undefined): number[] {
  if (!input) return [];
  const nums = (input.match(/-?\d+(?:[,.]\d+)?/g) || []).map((n) => Number(n.replace(',', '.')));
  return nums.filter((n) => Number.isFinite(n));
}

export type QuantityShape = 'VOLUME' | 'AREA' | 'LENGTH' | 'COUNT';

export function computeQuantity(
  shape: QuantityShape,
  inputs: QtyInputs,
  formula: string
): { quantity: number | null; formula: string } {
  if (typeof inputs.volume === 'number' && Number.isFinite(inputs.volume) && inputs.volume > 0) {
    return { quantity: inputs.volume, formula: `${formula} (volume eksplisit ${inputs.volume})` };
  }
  if (shape === 'AREA' && typeof inputs.area === 'number' && Number.isFinite(inputs.area) && inputs.area > 0) {
    return { quantity: inputs.area, formula: `${formula} (luas eksplisit ${inputs.area})` };
  }
  if (shape === 'COUNT' && typeof inputs.count === 'number' && Number.isFinite(inputs.count) && inputs.count > 0) {
    return { quantity: inputs.count, formula: `${formula} (jumlah eksplisit ${inputs.count})` };
  }

  const l = inputs.length;
  const w = inputs.width;
  const h = inputs.height;
  const d = inputs.depth;

  if (shape === 'VOLUME') {
    if (typeof l === 'number' && typeof w === 'number' && typeof h === 'number' && Number.isFinite(l + w + h)) {
      return { quantity: l * w * h, formula: `${formula} (= ${l} × ${w} × ${h})` };
    }
    if (typeof l === 'number' && typeof w === 'number' && typeof d === 'number' && Number.isFinite(l + w + d)) {
      return { quantity: l * w * d, formula: `${formula} (= ${l} × ${w} × ${d})` };
    }
  }

  if (shape === 'AREA') {
    if (typeof l === 'number' && typeof w === 'number' && Number.isFinite(l + w)) {
      return { quantity: l * w, formula: `${formula} (= ${l} × ${w})` };
    }
    if (typeof l === 'number' && typeof h === 'number' && Number.isFinite(l + h)) {
      return { quantity: l * h, formula: `${formula} (= ${l} × ${h})` };
    }
  }

  if (shape === 'LENGTH' && typeof l === 'number' && Number.isFinite(l)) {
    return { quantity: l, formula: `${formula} (= panjang ${l})` };
  }

  return { quantity: null, formula };
}

export const UNIT_SHAPE: Record<string, QuantityShape> = {
  'm3': 'VOLUME',
  'm2': 'AREA',
  "m'": 'LENGTH',
  m1: 'LENGTH',
  m: 'LENGTH',
  unit: 'COUNT',
  bh: 'COUNT',
  set: 'COUNT',
  l: 'VOLUME',
  titik: 'COUNT',
};

export function shapeForUnit(unit: string): QuantityShape {
  return UNIT_SHAPE[unit?.toLowerCase()] || 'COUNT';
}

/**
 * Deteksi penanda satuan panjang eksplisit pada string dimensi.
 * "12000 x 8000 mm" -> 0.001, "120 x 80 cm" -> 0.01, "12 x 8 m" -> 1.
 * Tanpa penanda eksplisit, faktor 1 (meter, perilaku lama) + flag ambiguous.
 */
export function detectLengthUnitFactor(dimensionString: string): { factor: number; unit: string | null } {
  const lower = ` ${dimensionString.toLowerCase()} `;
  // Hindari false positive: "mm" jangan cocok di dalam kata lain.
  if (/[^a-z]mm[^a-z]/.test(lower)) return { factor: 0.001, unit: 'mm' };
  if (/[^a-z]cm[^a-z]/.test(lower)) return { factor: 0.01, unit: 'cm' };
  if (/[^a-z]m[^a-z]/.test(lower)) return { factor: 1, unit: 'm' };
  return { factor: 1, unit: null };
}

export function attemptQuantityFromDimensionString(
  unit: string,
  dimensionString: string | undefined
): { quantity: number | null; formula: string } {
  if (!dimensionString) return { quantity: null, formula: '' };
  const nums = parseDimensionsString(dimensionString);
  if (nums.length === 0) return { quantity: null, formula: dimensionString };

  const { factor, unit: dimUnit } = detectLengthUnitFactor(dimensionString);
  const scaled = nums.map((n) => n * factor);

  const shape = shapeForUnit(unit);
  const [a, b, c] = scaled;
  const res = computeQuantity(shape, { length: a, width: b, height: c }, dimensionString);
  const formula = res.formula || dimensionString;
  // Catat konversi agar transparan di UI (provenance).
  const annotated = dimUnit && dimUnit !== 'm'
    ? `${formula} [konversi ${dimUnit}→m]`
    : formula;
  return { quantity: res.quantity, formula: annotated };
}
