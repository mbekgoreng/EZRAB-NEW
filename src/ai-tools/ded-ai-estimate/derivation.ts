/**
 * PHASE 3C — Derivation trail builders untuk kuantitas turunan.
 * Setiap fungsi mengembalikan jejak audit terstruktur.
 * Digunakan untuk rumah 1 lantai / Type 36. Kategori lain menyusul.
 */
import { DedAiItem } from './types';

export interface DerivationInput {
  name: string;
  value: number;
  unit: string;
  source: 'DED' | 'USER' | 'ASSUMPTION';
}

export interface DerivationTrail {
  formulaType: string;
  inputs: DerivationInput[];
  normalizedInputs?: Array<{ name: string; value: number; unit: string }>;
  result: number | null;
  resultUnit: string;
  validationStatus: string;
  notes?: string;
}

/**
 * Kolom beton: jumlah × lebar × panjang × tinggi
 * Contoh: 12 × 0.15 × 0.15 × 3 = 0.81 m³
 */
export function deriveKolomVolume(
  count: number | null,
  width: number | null,
  length: number | null,
  height: number | null,
  countSource: 'DED' | 'USER' | 'ASSUMPTION' = 'ASSUMPTION'
): DerivationTrail {
  const inputs: DerivationInput[] = [];
  if (count !== null) inputs.push({ name: 'jumlah_kolom', value: count, unit: 'bh', source: countSource });
  if (width !== null) inputs.push({ name: 'lebar', value: width, unit: 'm', source: 'DED' });
  if (length !== null) inputs.push({ name: 'panjang', value: length, unit: 'm', source: 'DED' });
  if (height !== null) inputs.push({ name: 'tinggi', value: height, unit: 'm', source: 'DED' });

  const missing = [];
  if (count === null) missing.push('jumlah_kolom');
  if (width === null) missing.push('lebar');
  if (length === null) missing.push('panjang');
  if (height === null) missing.push('tinggi');

  if (missing.length > 0) {
    return {
      formulaType: 'kolom_volume',
      inputs,
      result: null,
      resultUnit: 'm3',
      validationStatus: `rejected: input kurang (${missing.join(', ')})`,
      notes: 'Jangan membuat kuantitas final jika input belum tersedia.',
    };
  }

  const result = count! * width! * length! * height!;
  return {
    formulaType: 'kolom_volume',
    inputs,
    normalizedInputs: inputs.map((i) => ({ name: i.name, value: i.value, unit: i.unit })),
    result: Math.round(result * 10000) / 10000,
    resultUnit: 'm3',
    validationStatus: 'ok',
    notes: `${count} × ${width} × ${length} × ${height} = ${result.toFixed(4)} m³`,
  };
}

/**
 * Dinding netto: (panjang × tinggi) - bukaan
 * Bukaan HARUS dari data terverifikasi, bukan persentase default.
 */
export function deriveDindingNetto(
  length: number | null,
  height: number | null,
  bukaan: number | null,
  bukaanSource: 'DED' | 'USER' | 'ASSUMPTION' = 'ASSUMPTION'
): DerivationTrail {
  const inputs: DerivationInput[] = [];
  if (length !== null) inputs.push({ name: 'panjang', value: length, unit: 'm', source: 'DED' });
  if (height !== null) inputs.push({ name: 'tinggi', value: height, unit: 'm', source: 'DED' });
  if (bukaan !== null) inputs.push({ name: 'luas_bukaan', value: bukaan, unit: 'm2', source: bukaanSource });

  if (length === null || height === null) {
    return {
      formulaType: 'dinding_netto',
      inputs,
      result: null,
      resultUnit: 'm2',
      validationStatus: 'rejected: panjang atau tinggi tidak tersedia',
    };
  }

  const bruto = length * height;
  if (bukaan === null) {
    return {
      formulaType: 'dinding_bruto',
      inputs,
      result: Math.round(bruto * 100) / 100,
      resultUnit: 'm2',
      validationStatus: 'ok (bruto, bukaan belum diketahui)',
      notes: `Bruto ${bruto.toFixed(2)} m². Bukaan tidak diketahui — tampilkan sebagai bruto atau tandai netto belum terverifikasi. JANGAN kurangi dengan persentase default tanpa persetujuan.`,
    };
  }

  const netto = bruto - bukaan;
  return {
    formulaType: 'dinding_netto',
    inputs,
    result: Math.round(netto * 100) / 100,
    resultUnit: 'm2',
    validationStatus: 'ok',
    notes: `Bruto ${bruto.toFixed(2)} - bukaan ${bukaan.toFixed(2)} (${bukaanSource}) = ${netto.toFixed(2)} m²`,
  };
}

/**
 * Plester: luas_bidang × jumlah_sisi
 * Jumlah sisi HARUS sesuai cakupan aktual, jangan asumsikan 2 untuk semua.
 */
export function derivePlester(
  luasBidang: number | null,
  jumlahSisi: number | null,
  sisiSource: 'DED' | 'USER' | 'ASSUMPTION' = 'ASSUMPTION'
): DerivationTrail {
  const inputs: DerivationInput[] = [];
  if (luasBidang !== null) inputs.push({ name: 'luas_bidang', value: luasBidang, unit: 'm2', source: 'DED' });
  if (jumlahSisi !== null) inputs.push({ name: 'jumlah_sisi', value: jumlahSisi, unit: 'sisi', source: sisiSource });

  if (luasBidang === null || jumlahSisi === null) {
    return {
      formulaType: 'plester',
      inputs,
      result: null,
      resultUnit: 'm2',
      validationStatus: 'rejected: luas bidang atau jumlah sisi tidak tersedia',
      notes: 'Jangan asumsikan 2 sisi untuk semua dinding tanpa dasar.',
    };
  }

  const result = luasBidang * jumlahSisi;
  return {
    formulaType: 'plester',
    inputs,
    result: Math.round(result * 100) / 100,
    resultUnit: 'm2',
    validationStatus: 'ok',
    notes: `${luasBidang} m² × ${jumlahSisi} sisi = ${result.toFixed(2)} m²`,
  };
}
