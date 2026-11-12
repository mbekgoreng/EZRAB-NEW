/**
 * qtoBridge.ts — INTEGRASI QTO (AI Intelligence Overhaul Fase 4 —
 * Construction Intelligence).
 *
 * Hasil QTO (volume/dimensi) masuk ke konteks kanonis & validasi
 * rantai spek (volumeBasis) — TANPA mengubah aritmetika QTO apa pun.
 * Modul ini hanya MEMBACA kuantitas QTO/DED dan MEMBANDINGKANNYA
 * dengan dimensi pengguna; ketidakcocokan DILAPORKAN (bukan dibungkam,
 * bukan dikoreksi diam-diam).
 *
 * Sumber QTO yang diterima (bentuk umum, bukan satu pipeline):
 *  - item DED kanonis (`DedAiItem`: quantity + derivation.inputs
 *    bersumber DED/USER/ASSUMPTION);
 *  - item generik `{ description, quantity, unit }`.
 *
 * Pemeriksaan:
 *  - volume/kuantitas vs dimensi pengguna (L×W×tebal/kedalaman) —
 *    selisih >10% → MISMATCH (dilaporkan dengan kedua angka);
 *  - kuantitas null → MISSING (bukan 0 — selaras QuantitySanityGate);
 *  - input derivasi bersumber ASSUMPTION → ditandai eksplisit;
 *  - unit tak cocok dengan dimensi (mis. m³ diminta, m² diterima) →
 *    UNIT_MISMATCH (kalkulasi diblokir, CON-11).
 */

export interface QtoItemLike {
  description: string;
  quantity: number | null;
  unit: string;
  /** Input derivasi (DED): nilai + sumber DED/USER/ASSUMPTION. */
  derivationInputs?: Array<{ name: string; value: number; unit: string; source: string }>;
  /** Catatan kuantitas dari DED (bila ada). */
  quantityNote?: string | null;
}

export interface QtoUserDimensions {
  lengthM?: number | null;
  widthM?: number | null;
  depthM?: number | null;
  heightM?: number | null;
  buildingAreaM2?: number | null;
  landAreaM2?: number | null;
  thicknessM?: number | null;
  floors?: number | null;
}

export type QtoCheckVerdict = 'OK' | 'MISMATCH' | 'MISSING' | 'ASSUMPTION' | 'UNIT_MISMATCH' | 'CANNOT_CHECK';

export interface QtoCheck {
  description: string;
  quantity: number | null;
  unit: string;
  verdict: QtoCheckVerdict;
  detail: string;
  /** Volume yang diharapkan dari dimensi pengguna (bila dapat dihitung). */
  expectedFromUserDimensions: number | null;
}

const TOLERANCE = 0.1;

function normUnit(u: string): string {
  return (u || '').toLowerCase().replace(/[²³]/g, (m) => (m === '²' ? '2' : '3')).replace(/'/g, '').replace(/\s+/g, '');
}

/** Kata kunci volume (m³) yang dapat diturunkan dari L×W×kedalaman/tebal. */
const VOLUME_KEYWORDS = [
  'galian', 'urugan', 'timbunan', 'beton', 'pondasi', 'sloof', 'kolom', 'balok',
  'plat', 'pelat', 'dak', 'cor', 'pasangan batu',
];
/** Kata kunci luas (m²) yang dapat diturunkan dari L×W / luas bangunan. */
const AREA_KEYWORDS = [
  'dinding', 'plester', 'acian', 'cat', 'lantai', 'plafon', 'atap', 'keramik',
  'paving', 'pasangan dinding',
];

/**
 * Volume/luas yang diharapkan dari dimensi pengguna untuk satu item,
 * atau null bila tidak dapat diturunkan (bukan kegagalan — dinyatakan
 * CANNOT_CHECK di pemanggil).
 */
export function expectedQuantityFromDimensions(
  item: QtoItemLike,
  dims: QtoUserDimensions,
): { expected: number | null; basis: string | null } {
  const desc = item.description.toLowerCase();
  const unit = normUnit(item.unit);
  if (unit === 'm3' && VOLUME_KEYWORDS.some((k) => desc.includes(k))) {
    if (dims.lengthM != null && dims.widthM != null && dims.depthM != null) {
      return { expected: dims.lengthM * dims.widthM * dims.depthM, basis: `panjang × lebar × kedalaman (${dims.lengthM}×${dims.widthM}×${dims.depthM} m)` };
    }
    if (dims.buildingAreaM2 != null && dims.thicknessM != null) {
      return { expected: dims.buildingAreaM2 * dims.thicknessM, basis: `luas bangunan × tebal (${dims.buildingAreaM2} m² × ${dims.thicknessM} m)` };
    }
    return { expected: null, basis: null };
  }
  if (unit === 'm2' && AREA_KEYWORDS.some((k) => desc.includes(k))) {
    if (dims.lengthM != null && dims.widthM != null) {
      return { expected: dims.lengthM * dims.widthM, basis: `panjang × lebar (${dims.lengthM}×${dims.widthM} m)` };
    }
    if (dims.buildingAreaM2 != null) {
      return { expected: dims.buildingAreaM2, basis: `luas bangunan (${dims.buildingAreaM2} m²)` };
    }
    return { expected: null, basis: null };
  }
  return { expected: null, basis: null };
}

export function checkQtoAgainstUserDimensions(
  items: QtoItemLike[],
  dims: QtoUserDimensions,
  opts?: { requestedUnitByDescription?: Record<string, string> },
): QtoCheck[] {
  const out: QtoCheck[] = [];
  for (const item of items) {
    // 1. Kuantitas null = MISSING (bukan 0).
    if (item.quantity == null || !Number.isFinite(item.quantity)) {
      out.push({
        description: item.description,
        quantity: null,
        unit: item.unit,
        verdict: 'MISSING',
        detail: `Kuantitas tidak ada (null) — dinyatakan hilang, bukan 0.${item.quantityNote ? ` Catatan DED: ${item.quantityNote}` : ''}`,
        expectedFromUserDimensions: null,
      });
      continue;
    }
    // 2. Gerbang unit (CON-11): unit yang diminta vs unit item.
    const requested = opts?.requestedUnitByDescription?.[item.description];
    if (requested && normUnit(requested) !== normUnit(item.unit)) {
      out.push({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        verdict: 'UNIT_MISMATCH',
        detail: `Unit tidak cocok: diminta "${requested}", QTO memakai "${item.unit}" — kalkulasi memakai kuantitas ini DIBLOKIR.`,
        expectedFromUserDimensions: null,
      });
      continue;
    }
    // 3. Input derivasi bersumber asumsi → ditandai (tetap diperiksa angkanya).
    const assumptionInputs = (item.derivationInputs ?? []).filter((i) => i.source === 'ASSUMPTION');
    // 4. Bandingkan dengan dimensi pengguna bila dapat diturunkan.
    const { expected, basis } = expectedQuantityFromDimensions(item, dims);
    if (expected == null) {
      out.push({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        verdict: assumptionInputs.length > 0 ? 'ASSUMPTION' : 'CANNOT_CHECK',
        detail: assumptionInputs.length > 0
          ? `Tidak dapat dibandingkan dengan dimensi pengguna (dimensi dasar tidak lengkap); kuantitas memakai ${assumptionInputs.length} input ASUMSI: ${assumptionInputs.map((i) => `${i.name}=${i.value}${i.unit}`).join(', ')}.`
          : 'Tidak dapat dibandingkan dengan dimensi pengguna (dimensi dasar tidak lengkap atau item bukan volume/luas yang dapat diturunkan) — bukan kesalahan, hanya tidak terverifikasi.',
        expectedFromUserDimensions: null,
      });
      continue;
    }
    const diff = Math.abs(item.quantity - expected) / expected;
    if (diff <= TOLERANCE) {
      out.push({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        verdict: assumptionInputs.length > 0 ? 'ASSUMPTION' : 'OK',
        detail: `Cocok dengan dimensi pengguna (${basis} = ${expected.toFixed(2)} ${item.unit}; selisih ${(diff * 100).toFixed(1)}%).${assumptionInputs.length > 0 ? ` Namun memakai input ASUMSI: ${assumptionInputs.map((i) => `${i.name}=${i.value}${i.unit}`).join(', ')}.` : ''}`,
        expectedFromUserDimensions: expected,
      });
    } else {
      out.push({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        verdict: 'MISMATCH',
        detail: `TIDAK COCOK dengan dimensi pengguna: QTO ${item.quantity} ${item.unit} vs ${basis} = ${expected.toFixed(2)} ${item.unit} (selisih ${(diff * 100).toFixed(0)}% > 10%) — dilaporkan, bukan dikoreksi diam-diam.`,
        expectedFromUserDimensions: expected,
      });
    }
  }
  return out;
}

/** Baris QTO untuk konteks kanonis (FAKTA PROYEK) — mismatch tidak dibungkam. */
export function formatQtoCheckLines(checks: QtoCheck[]): string[] {
  if (checks.length === 0) return [];
  const lines = ['Hasil QTO vs dimensi pengguna (volume/dimensi — aritmetika QTO tidak diubah):'];
  for (const c of checks) {
    lines.push(`• [${c.verdict}] ${c.description}: ${c.quantity == null ? 'kuantitas hilang' : `${c.quantity} ${c.unit}`} — ${c.detail}`);
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Wiring Fase 5 — QTO → konteks kanonis                               */
/*                                                                     */
/* `buildQtoSection` menghasilkan teks seksi QTO untuk builder         */
/* kanonis (canonicalContext.qtoSection) dari hasil pemeriksaan        */
/* `checkQtoAgainstUserDimensions` yang sudah ada.                     */
/* ------------------------------------------------------------------ */

/** Seksi QTO siap tempel ke builder kanonis (cap ditegakkan builder). */
export function buildQtoSection(checks: QtoCheck[]): string {
  return formatQtoCheckLines(checks).join('\n');
}

/** Jalan pintas: item + dimensi pengguna → seksi QTO siap tempel. */
export function qtoItemsToSection(items: QtoItemLike[], dims: QtoUserDimensions): string {
  return buildQtoSection(checkQtoAgainstUserDimensions(items, dims));
}
