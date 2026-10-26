import type { NationalAHSPItem } from '../../data/nationalCostDatabase/types';

/**
 * AHSP Custom milik user (bukan katalog resmi PUPR 2026).
 *
 * Disimpan di localStorage browser ini saja (kunci `ezrab_custom_ahsp_v1`),
 * mengikuti pola store lokal lain (mis. antrean review harga pasar).
 * Sengaja TIDAK menyentuh katalog resmi: item custom selalu ber-domain
 * 'CUSTOM', status 'UNVERIFIED', dan sumber 'AHSP Custom Pengguna' sehingga
 * tidak pernah tampil sebagai harga resmi AHSP 2026.
 *
 * Aturan integritas:
 * - Kode custom tidak boleh sama dengan kode resmi katalog maupun kode
 *   custom lain (normalisasi: trim + huruf kecil) — karena pemilihan bulk
 *   di modal memakai kode sebagai kunci, duplikat akan memilih item yang
 *   salah.
 * - Harga kosong = null ("Belum ada harga"), BUKAN 0. Harga 0 eksplisit
 *   tetap 0 (harga nyata Rp0, mis. item gratis dari user sendiri).
 */

export interface CustomAhspInput {
  code: string;
  name: string;
  unit: string;
  /** Null = harga belum diisi user. */
  unitPrice: number | null;
  /** Nama kategori di dalam grup CUSTOM (boleh diketik bebas). */
  category: string;
}

export interface CustomAhspRecord extends CustomAhspInput {
  id: string;
  createdAt: string;
}

const CUSTOM_AHSP_STORAGE_KEY = 'ezrab_custom_ahsp_v1';

function isRecord(value: unknown): value is CustomAhspRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.code === 'string' &&
    typeof r.name === 'string' &&
    typeof r.unit === 'string' &&
    typeof r.category === 'string' &&
    (r.unitPrice === null || typeof r.unitPrice === 'number')
  );
}

/** Muat daftar AHSP custom user (kosong bila belum ada / data rusak). */
export function loadCustomAhsp(): CustomAhspRecord[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(CUSTOM_AHSP_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord);
  } catch {
    return [];
  }
}

/** Simpan daftar AHSP custom user (diam bila storage tidak tersedia). */
export function saveCustomAhsp(records: CustomAhspRecord[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CUSTOM_AHSP_STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* storage penuh / privat — daftar tetap hidup di state modal sesi ini */
  }
}

/** Normalisasi kode untuk perbandingan duplikat. */
export function normalizeAhspCode(code: string): string {
  return code.trim().toLowerCase();
}

/**
 * Validasi input form AHSP custom. Mengembalikan pesan error Bahasa
 * Indonesia, atau null bila valid. `takenCodes` = kode-kode yang sudah
 * dipakai (resmi + custom), sudah dinormalisasi.
 */
export function validateCustomAhspInput(
  input: CustomAhspInput,
  takenCodes: string[],
): string | null {
  const code = input.code.trim();
  const name = input.name.trim();
  const unit = input.unit.trim();
  if (!code) return 'Kode AHSP wajib diisi.';
  if (!name) return 'Uraian pekerjaan wajib diisi.';
  if (!unit) return 'Satuan wajib diisi.';
  if (
    input.unitPrice !== null &&
    (!Number.isFinite(input.unitPrice) || input.unitPrice < 0)
  ) {
    return 'Harga satuan harus berupa angka ≥ 0, atau dikosongkan bila belum ada harga.';
  }
  if (takenCodes.includes(normalizeAhspCode(code))) {
    return `Kode "${code}" sudah dipakai (katalog resmi / custom lain). Pakai kode yang berbeda.`;
  }
  return null;
}

/** Buat record custom baru dari input form yang sudah tervalidasi. */
export function createCustomAhspRecord(
  input: CustomAhspInput,
): CustomAhspRecord {
  return {
    id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    code: input.code.trim(),
    name: input.name.trim(),
    unit: input.unit.trim(),
    unitPrice: input.unitPrice,
    category: input.category.trim() || 'AHSP Custom',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Ubah record custom menjadi NationalAHSPItem agar bisa lewat jalur tabel +
 * tambah-item yang sama dengan item resmi. Penanda kejujuran: domain
 * 'CUSTOM', normativeStatus 'Custom', status 'UNVERIFIED', sumber
 * 'AHSP Custom Pengguna', tanpa komponen (harga = harga yang diketik user,
 * bukan hasil resolver katalog).
 */
export function customAhspToNationalItem(
  rec: CustomAhspRecord,
): NationalAHSPItem {
  return {
    id: `CUSTOM-${rec.id}`,
    code: rec.code,
    codeNormalized: rec.code,
    name: rec.name,
    unit: rec.unit,
    unitRaw: rec.unit,
    domain: 'CUSTOM',
    category: rec.category,
    version: 'CUSTOM',
    year: new Date(rec.createdAt).getFullYear() || new Date().getFullYear(),
    normativeStatus: 'Custom',
    method: 'Manual',
    sourceId: 'CUSTOM_USER',
    sourceDocument: 'AHSP Custom Pengguna',
    status: 'UNVERIFIED',
    laborComponents: [],
    materialComponents: [],
    equipmentComponents: [],
    totalLabor: null,
    totalMaterial: null,
    totalEquipment: null,
    unitPrice: rec.unitPrice,
    lastUpdated: rec.createdAt,
    // Tanpa skor pipeline (bukan data hasil pipeline resmi).
    dataQualityScore: 0,
  };
}
