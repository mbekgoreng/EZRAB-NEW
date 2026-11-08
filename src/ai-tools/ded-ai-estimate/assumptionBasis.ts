/**
 * TINGKAT ASUMSI BERLABEL — DED AI Estimate (keputusan owner 2026-11-08).
 *
 * Masalah yang diselesaikan: pada gambar DED nyata (kasus rumah 1 lantai,
 * 2026-10-27 → 2026-11-08) angka dimensi keseluruhan rusak di lapisan teks
 * PDF (glif CAD terpisah), sehingga parser dimensi deterministik gagal dan
 * SEMUA item menjadi UNRESOLVED / total Rp0 — padahal label ukuran pada
 * nama elemen, jadwal unit, dan dimensi denah yang dinyatakan model SELAMAT
 * dan dapat ditunjuk.
 *
 * Modul ini mengevaluasi dasar terstruktur DARI KELUARAN MODEL ITU SENDIRI
 * secara mekanis (tanpa memanggil model, tanpa membaca DED):
 *
 *   A. DERIVASI TERSTRUKTUR — raw.derivation dengan inputs bernilai +
 *      satuan eksplisit per input. Setiap nilai dimensi WAJIB terjangkar:
 *      angka yang sama (dalam skala m/cm/mm) harus muncul pada teks item
 *      itu sendiri (name/specification/dimensions/quantityFormula/
 *      sourceEvidence). Input yang tidak terjangkar = dasar ditolak.
 *   B. SATUAN DIASUMSIKAN — dimensi ambigu-satuan BOLEH menjadi dasar
 *      hanya bila model menyatakan satuannya secara eksplisit lewat
 *      raw.dimensionUnitAssumption ('mm'|'cm'|'m'). Tercatat di derivation
 *      sebagai ASUMSI SATUAN, bukan fakta DED. Diameter-saja tetap gugur.
 *   C. JADWAL UNIT — pola "KODE = N Unit" pada teks jadwal yang dikutip
 *      model (sourceEvidence/specification) dijumlahkan mekanis; bila
 *      model juga memberi quantity, nilainya harus SAMA dengan jumlah
 *      jadwal, selain itu dasar ditolak.
 *
 * Hasil lolos = kuantitas terisi berlabel ASSUMPTION + derivation trail
 * lengkap (rumus + nilai masukan + asal). Angka telanjang (raw.quantity
 * tanpa satu pun dasar di atas) TIDAK pernah lolos dari modul ini.
 *
 * Modul ini MURNI: tidak mengubah apa pun. Keputusan memakai hasilnya
 * (hanya mode FULL_AI) ada di convertAiItem (service.ts). Mode DATABASE
 * tidak pernah memanggil jalur ini.
 */

import { parseDimensionsString, shapeForUnit, attemptQuantityWithAssumedUnit, type QuantityShape } from './quantity';
import type { DerivationInput, DerivationTrail } from './derivation';

export type AssumptionBasisKind = 'DERIVASI_TERSTRUKTUR' | 'SATUAN_DIASUMSIKAN' | 'JADWAL_UNIT';

export interface AssumptionBasisResult {
  kind: AssumptionBasisKind;
  quantity: number;
  /** Rumus terbaca: nilai masukan + hasil + asal dasar. */
  quantityFormula: string;
  derivation: DerivationTrail;
  /** Penjelasan singkat untuk quantityNote item. */
  note: string;
}

export interface AssumptionBasisContext {
  /** Satuan item (raw.units) — bentuk hasil harus cocok dengan ini. */
  units: string;
  /** String dimensi efektif (raw.dimensions || raw.quantityFormula). */
  dimensionString: string | null;
  /** Hasil parser deterministik: satuan dimensi tidak jelas. */
  ambiguousUnit: boolean;
  /** Hasil parser deterministik: hanya diameter yang tercantum. */
  diameterOnly: boolean;
}

const LENGTH_FACTORS: Record<string, number> = { m: 1, cm: 0.01, mm: 0.001 };
const COUNT_UNITS = new Set(['', 'unit', 'bh', 'buah', 'set', 'titik', 'ls']);

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function fmt(n: number): string {
  return String(round4(n)).replace('.', ',');
}

function normUnit(u: unknown): string {
  return String(u ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function inputSource(v: unknown): 'DED' | 'USER' | 'ASSUMPTION' {
  return v === 'DED' || v === 'USER' ? v : 'ASSUMPTION';
}

type Role = 'count' | 'width' | 'height' | 'length' | 'other';

function roleOf(name: string): Role {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/jumlah|count|banyak|^n\d*$/.test(n)) return 'count';
  if (/lebar|width|^b\d*$/.test(n)) return 'width';
  if (/tinggi|height|^h\d*$|^t\d*$/.test(n)) return 'height';
  if (/panjang|length|^l\d*$|^p\d*$/.test(n)) return 'length';
  return 'other';
}

interface NormInput {
  raw: DerivationInput;
  role: Role;
  /** Nilai dalam meter untuk input panjang; nilai apa adanya untuk count. */
  meters: number | null;
  count: number | null;
}

/** Teks jangkar: semua teks item yang ditulis model sendiri. */
function anchorTextOf(raw: any): string {
  return [raw?.name, raw?.specification, raw?.dimensions, raw?.quantityFormula, raw?.sourceEvidence]
    .filter((s) => typeof s === 'string')
    .join(' \n ');
}

function numbersClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.01);
}

/**
 * Nilai (meter) terjangkar bila angka yang sama muncul pada teks item
 * dalam salah satu skala penulisannya (m, cm, atau mm).
 */
function isAnchored(anchorNumbers: number[], valueMeters: number): boolean {
  return anchorNumbers.some(
    (n) => numbersClose(n, valueMeters) || numbersClose(n, valueMeters * 100) || numbersClose(n, valueMeters * 1000),
  );
}

function isCountAnchored(anchorNumbers: number[], count: number): boolean {
  return anchorNumbers.some((n) => numbersClose(n, count));
}

// ---------------------------------------------------------------------------
// Kanal A — derivasi terstruktur dengan satuan eksplisit per input.
// ---------------------------------------------------------------------------

const VOLUME_TYPES = new Set(['sloof_volume', 'balok_volume', 'penampang_panjang', 'kolom_volume', 'volume_penampang']);
const AREA_TYPES = new Set(['luas_dimensi', 'luas']);
const PERIMETER_TYPES = new Set(['keliling']);
const LENGTH_SUM_TYPES = new Set(['panjang_total']);
const COUNT_TYPES = new Set(['jumlah_terjadwal', 'jadwal_unit', 'jumlah_unit']);

function evaluateStructuredDerivation(raw: any, ctx: AssumptionBasisContext): AssumptionBasisResult | null {
  const d = raw?.derivation;
  if (!d || typeof d !== 'object' || !Array.isArray(d.inputs)) return null;
  const formulaType = String(d.formulaType || '');
  const shape = shapeForUnit(ctx.units);

  const kindShape: QuantityShape | null = VOLUME_TYPES.has(formulaType)
    ? 'VOLUME'
    : AREA_TYPES.has(formulaType)
      ? 'AREA'
      : PERIMETER_TYPES.has(formulaType) || LENGTH_SUM_TYPES.has(formulaType)
        ? 'LENGTH'
        : COUNT_TYPES.has(formulaType)
          ? 'COUNT'
          : null;
  if (kindShape === null || kindShape !== shape) return null;

  // Normalisasi input: panjang WAJIB satuan eksplisit; count WAJIB satuan hitung.
  const norm: NormInput[] = [];
  for (const i of d.inputs) {
    if (!i || typeof i.name !== 'string' || typeof i.value !== 'number' || !Number.isFinite(i.value) || i.value <= 0) {
      return null;
    }
    const role = roleOf(i.name);
    const unit = normUnit(i.unit);
    const entry: DerivationInput = { name: i.name, value: i.value, unit: String(i.unit ?? ''), source: inputSource(i.source) };
    if (role === 'count') {
      if (!COUNT_UNITS.has(unit)) return null;
      norm.push({ raw: entry, role, meters: null, count: i.value });
    } else if (role === 'width' || role === 'height' || role === 'length') {
      const factor = LENGTH_FACTORS[unit];
      if (factor === undefined) return null; // satuan dimensi tidak eksplisit → bukan dasar terstruktur
      norm.push({ raw: entry, role, meters: i.value * factor, count: null });
    } else {
      return null; // input tak dikenal perannya → tidak dapat diverifikasi mekanis
    }
  }
  if (norm.length === 0) return null;

  const anchorNumbers = parseDimensionsString(anchorTextOf(raw));
  const byRole = (r: Role) => norm.filter((n) => n.role === r);
  const countInput = byRole('count')[0] ?? null;
  const multiplier = countInput ? countInput.count! : 1;

  // Jangkar: setiap nilai dimensi (dan pengali jumlah, bila ada) harus
  // muncul pada teks item itu sendiri.
  for (const n of norm) {
    if (n.meters !== null && !isAnchored(anchorNumbers, n.meters)) return null;
    if (n.count !== null && countInput === n && kindShape !== 'COUNT' && !isCountAnchored(anchorNumbers, n.count)) return null;
  }

  let quantity: number | null = null;
  let formulaParts = '';
  const resultUnit = shape === 'VOLUME' ? 'm3' : shape === 'AREA' ? 'm2' : shape === 'LENGTH' ? 'm' : 'unit';

  if (kindShape === 'VOLUME') {
    const w = byRole('width')[0];
    const h = byRole('height')[0];
    const l = byRole('length')[0];
    if (!w || !h || !l) return null;
    quantity = w.meters! * h.meters! * l.meters! * multiplier;
    formulaParts = `${fmt(w.meters!)} × ${fmt(h.meters!)} × ${fmt(l.meters!)}${countInput ? ` × ${fmt(multiplier)}` : ''}`;
  } else if (kindShape === 'AREA') {
    const l = byRole('length')[0];
    const w = byRole('width')[0];
    if (!l || !w) return null;
    quantity = l.meters! * w.meters! * multiplier;
    formulaParts = `${fmt(l.meters!)} × ${fmt(w.meters!)}${countInput ? ` × ${fmt(multiplier)}` : ''}`;
  } else if (kindShape === 'LENGTH' && PERIMETER_TYPES.has(formulaType)) {
    const l = byRole('length')[0];
    const w = byRole('width')[0];
    if (!l || !w) return null;
    quantity = 2 * (l.meters! + w.meters!);
    formulaParts = `2 × (${fmt(l.meters!)} + ${fmt(w.meters!)})`;
  } else if (kindShape === 'LENGTH') {
    const lengths = byRole('length');
    if (lengths.length === 0) return null;
    quantity = lengths.reduce((acc, n) => acc + n.meters!, 0) * multiplier;
    formulaParts = lengths.map((n) => fmt(n.meters!)).join(' + ') + (countInput ? ` × ${fmt(multiplier)}` : '');
  } else {
    // COUNT dari derivation: setiap input harus input hitung; nama berkode
    // (mis. J3) wajib muncul pada teks item.
    if (norm.some((n) => n.role !== 'count')) return null;
    const anchorText = anchorTextOf(raw).toUpperCase();
    for (const n of norm) {
      const code = /[A-Za-z]\d+/.exec(n.raw.name);
      if (code && !anchorText.includes(code[0].toUpperCase())) return null;
    }
    quantity = norm.reduce((acc, n) => acc + n.count!, 0);
    formulaParts = norm.map((n) => `${n.raw.name} = ${fmt(n.count!)}`).join(' + ');
    // Konsistensi: quantity model (bila ada) harus sama dengan jumlah jadwal.
    if (typeof raw.quantity === 'number' && Number.isFinite(raw.quantity) && raw.quantity !== quantity) return null;
  }

  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) return null;
  quantity = round4(quantity);

  const derivation: DerivationTrail = {
    formulaType,
    inputs: norm.map((n) => n.raw),
    normalizedInputs: norm.map((n) => ({
      name: n.raw.name,
      value: n.meters !== null ? round4(n.meters) : n.count!,
      unit: n.meters !== null ? 'm' : n.raw.unit || 'unit',
    })),
    result: quantity,
    resultUnit,
    validationStatus: 'ok (tingkat asumsi berlabel — dasar terstruktur terverifikasi mekanis)',
    notes:
      'Kuantitas tingkat ASUMSI (mode Full AI): dihitung dari inputs terstruktur keluaran model; ' +
      'setiap nilai dimensi terjangkar pada teks item (nama/spesifikasi/dimensi/bukti) dan satuannya eksplisit per input. ' +
      'Bukan fakta DED terverifikasi — label ASSUMPTION dipertahankan.',
  };

  return {
    kind: 'DERIVASI_TERSTRUKTUR',
    quantity,
    quantityFormula: `${formulaParts} = ${fmt(quantity)} ${resultUnit} — asumsi terstruktur (derivation '${formulaType}'; input dalam meter hasil konversi satuan eksplisit per input; nilai terjangkar pada teks item)`,
    derivation,
    note: `Kuantitas asumsi berlabel: dihitung dari derivation terstruktur model (rumus + input + satuan eksplisit, terjangkar pada teks item).`,
  };
}

// ---------------------------------------------------------------------------
// Kanal C — jadwal unit pada teks yang dikutip model.
// ---------------------------------------------------------------------------

function evaluateScheduleCount(raw: any, ctx: AssumptionBasisContext): AssumptionBasisResult | null {
  if (shapeForUnit(ctx.units) !== 'COUNT') return null;
  const text = [raw?.sourceEvidence, raw?.specification]
    .filter((s) => typeof s === 'string')
    .join(' \n ');
  if (!text) return null;
  const re = /([A-Za-z]{1,3}\d{1,2})\s*=\s*(\d+)\s*(?:unit|bh|buah|set)\b/gi;
  const entries = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const code = m[1].toUpperCase();
    const count = Number(m[2]);
    if (entries.has(code) && entries.get(code) !== count) return null; // jadwal bertentangan → tolak
    entries.set(code, count);
  }
  if (entries.size === 0) return null;
  const total = [...entries.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  // Konsistensi: quantity model (bila ada) harus sama dengan jumlah jadwal.
  if (typeof raw.quantity === 'number' && Number.isFinite(raw.quantity) && raw.quantity !== total) return null;

  const inputs: DerivationInput[] = [...entries.entries()].map(([code, count]) => ({
    name: code,
    value: count,
    unit: 'unit',
    source: 'ASSUMPTION' as const,
  }));
  const derivation: DerivationTrail = {
    formulaType: 'jadwal_unit',
    inputs,
    normalizedInputs: inputs.map((i) => ({ name: i.name, value: i.value, unit: 'unit' })),
    result: total,
    resultUnit: 'unit',
    validationStatus: 'ok (tingkat asumsi berlabel — jadwal unit terbaca pada teks kutipan model)',
    notes:
      'Kuantitas tingkat ASUMSI (mode Full AI): jumlah unit dijumlahkan mekanis dari jadwal yang dikutip model ' +
      'di sourceEvidence/specification. Jadwal itu sendiri belum diverifikasi ke berkas DED oleh lapisan ini.',
  };
  return {
    kind: 'JADWAL_UNIT',
    quantity: total,
    quantityFormula: `${inputs.map((i) => `${i.name} = ${i.value} unit`).join(' + ')} = ${total} unit — asumsi dari jadwal unit yang dikutip model`,
    derivation,
    note: 'Kuantitas asumsi berlabel: jumlah unit dari jadwal yang dikutip model (dijumlahkan mekanis, konsisten dengan quantity model).',
  };
}

// ---------------------------------------------------------------------------
// Kanal B — dimensi ambigu-satuan + satuan yang dinyatakan model sebagai asumsi.
// ---------------------------------------------------------------------------

function evaluateAssumedUnit(raw: any, ctx: AssumptionBasisContext): AssumptionBasisResult | null {
  if (!ctx.ambiguousUnit || ctx.diameterOnly || !ctx.dimensionString) return null;
  if (shapeForUnit(ctx.units) === 'COUNT') return null;
  const declared = typeof raw?.dimensionUnitAssumption === 'string' ? raw.dimensionUnitAssumption.trim().toLowerCase() : '';
  if (declared !== 'mm' && declared !== 'cm' && declared !== 'm') return null;

  const res = attemptQuantityWithAssumedUnit(ctx.units, ctx.dimensionString, declared);
  if (res.quantity === null || !Number.isFinite(res.quantity) || res.quantity <= 0) return null;
  const quantity = round4(res.quantity);
  const nums = parseDimensionsString(ctx.dimensionString);
  const derivation: DerivationTrail = {
    formulaType: 'dimensi_satuan_diasumsikan',
    inputs: nums.map((n, i) => ({
      name: `dimensi_${i + 1}`,
      value: n,
      unit: declared,
      source: 'ASSUMPTION' as const,
    })),
    normalizedInputs: nums.map((n, i) => ({
      name: `dimensi_${i + 1}`,
      value: round4(n * LENGTH_FACTORS[declared]),
      unit: 'm',
    })),
    result: quantity,
    resultUnit: shapeForUnit(ctx.units) === 'VOLUME' ? 'm3' : shapeForUnit(ctx.units) === 'AREA' ? 'm2' : 'm',
    validationStatus: 'ok (tingkat asumsi berlabel — satuan dimensi diasumsikan model)',
    notes:
      `Satuan dimensi "${declared}" adalah ASUMSI yang dinyatakan model lewat dimensionUnitAssumption — ` +
      'BUKAN fakta DED. Dimensi mentah tanpa satuan tetap ditolak sebagai dimensi; nilai ini hanya sah sebagai asumsi berlabel.',
  };
  return {
    kind: 'SATUAN_DIASUMSIKAN',
    quantity,
    quantityFormula: res.formula,
    derivation,
    note: `Kuantitas asumsi berlabel: satuan dimensi "${declared}" dinyatakan model sebagai asumsi (bukan fakta DED) dan tercatat di derivation.`,
  };
}

/**
 * Evaluasi semua kanal dasar asumsi. Mengembalikan null bila TIDAK ADA
 * dasar terstruktur yang dapat diverifikasi mekanis — pemanggil wajib
 * mempertahankan UNRESOLVED (angka telanjang tidak pernah lolos).
 */
export function evaluateAssumptionBasis(raw: any, ctx: AssumptionBasisContext): AssumptionBasisResult | null {
  return (
    evaluateStructuredDerivation(raw, ctx) ??
    evaluateScheduleCount(raw, ctx) ??
    evaluateAssumedUnit(raw, ctx)
  );
}
