/**
 * wilayah — database wilayah administratif Indonesia ASLI untuk pemilih
 * bertingkat Informasi Proyek (Provinsi → Kabupaten/Kota → Kecamatan →
 * Desa/Kelurahan).
 *
 * SUMBER DATA: paket data terbuka `idn-area-data` v4.0.1 (berbasis
 * peraturan Kemendagri terbaru), divendor sebagai JSON statis di
 * `src/data/wilayah/` pada 2026-11-06:
 * - 38 provinsi, 514 kabupaten/kota, 7.285 kecamatan, 83.762 desa/kelurahan.
 * - Setiap entri membawa KODE Kemendagri (mis. Jawa Timur "35",
 *   Kabupaten Probolinggo "35.13", Kraksaan "35.13.14").
 * - Nama kabupaten/kota memakai nama resmi BERPREFIKS ("Kabupaten
 *   Probolinggo", "Kota Probolinggo") — sama seperti yang tertulis di
 *   dokumen resmi. `indonesiaRegions.ts` (tanpa prefiks) tetap dipakai
 *   resolusi indeks harga level provinsi; nama provinsinya identik.
 *
 * villages.json (±3,5 MB) TIDAK dimuat di bundle awal: diimpor dinamis
 * hanya saat pemilih desa pertama kali dibutuhkan, lalu di-cache.
 */

import provincesJson from './wilayah/provinces.json';
import regenciesJson from './wilayah/regencies.json';
import districtsJson from './wilayah/districts.json';

export interface WilayahEntry {
  code: string;
  name: string;
}
export interface WilayahChildEntry extends WilayahEntry {
  parentCode: string;
}

type ProvRow = [string, string];
type ChildRow = [string, string, string];

const PROVINCES: WilayahEntry[] = (provincesJson as ProvRow[]).map(([code, name]) => ({ code, name }));
const REGENCIES: WilayahChildEntry[] = (regenciesJson as ChildRow[]).map(
  ([code, parentCode, name]) => ({ code, parentCode, name })
);
const DISTRICTS: WilayahChildEntry[] = (districtsJson as ChildRow[]).map(
  ([code, parentCode, name]) => ({ code, parentCode, name })
);

export const WILAYAH_COUNTS = {
  provinces: PROVINCES.length,
  regencies: REGENCIES.length,
  districts: DISTRICTS.length,
} as const;

export function getProvinces(): WilayahEntry[] {
  return PROVINCES;
}

export function getRegencies(provinceCode: string): WilayahChildEntry[] {
  return REGENCIES.filter((r) => r.parentCode === provinceCode);
}

export function getDistricts(regencyCode: string): WilayahChildEntry[] {
  return DISTRICTS.filter((d) => d.parentCode === regencyCode);
}

export function findProvince(code: string): WilayahEntry | undefined {
  return PROVINCES.find((p) => p.code === code);
}
export function findRegency(code: string): WilayahChildEntry | undefined {
  return REGENCIES.find((r) => r.code === code);
}
export function findDistrict(code: string): WilayahChildEntry | undefined {
  return DISTRICTS.find((d) => d.code === code);
}

let villagesCache: WilayahChildEntry[] | null = null;
let villagesPromise: Promise<WilayahChildEntry[]> | null = null;

/** Muat seluruh desa/kelurahan (impor dinamis, sekali, lalu cache). */
export function loadAllVillages(): Promise<WilayahChildEntry[]> {
  if (villagesCache) return Promise.resolve(villagesCache);
  if (!villagesPromise) {
    villagesPromise = import('./wilayah/villages.json').then((mod) => {
      const rows = (mod.default as unknown as ChildRow[]).map(
        ([code, parentCode, name]) => ({ code, parentCode, name })
      );
      villagesCache = rows;
      return rows;
    });
  }
  return villagesPromise;
}

export async function getVillages(districtCode: string): Promise<WilayahChildEntry[]> {
  const all = await loadAllVillages();
  return all.filter((v) => v.parentCode === districtCode);
}

export async function findVillage(code: string): Promise<WilayahEntry | undefined> {
  const all = await loadAllVillages();
  return all.find((v) => v.code === code);
}

/* — Pencocokan nilai lama (teks bebas) —
 * Proyek lama menyimpan provinsi/kabupaten sebagai teks bebas ("Jawa
 * Timur", "Probolinggo", "jawa timur"). Fungsi-fungsi ini mencocokkan
 * teks itu ke entri berkode agar pemilih bisa menampilkan pilihan yang
 * setara TANPA membuang nilai lama: bila tidak ada yang cocok, pemanggil
 * mempertahankan teks aslinya.
 */
const norm = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, ' ');

export function matchProvinceByName(name: string): WilayahEntry | undefined {
  const n = norm(name);
  if (!n) return undefined;
  return PROVINCES.find((p) => norm(p.name) === n);
}

export function matchRegencyByName(
  name: string,
  provinceCode?: string
): WilayahChildEntry | undefined {
  const n = norm(name);
  if (!n) return undefined;
  const pool = provinceCode ? getRegencies(provinceCode) : REGENCIES;
  const bare = n.replace(/^(kabupaten|kab\.?|kota)\s+/i, '');
  return (
    pool.find((r) => norm(r.name) === n) ??
    pool.find((r) => norm(r.name).replace(/^(kabupaten|kota)\s+/i, '') === bare)
  );
}

export function matchDistrictByName(
  name: string,
  regencyCode: string
): WilayahChildEntry | undefined {
  const n = norm(name);
  if (!n) return undefined;
  return getDistricts(regencyCode).find((d) => norm(d.name) === n);
}

export async function matchVillageByName(
  name: string,
  districtCode: string
): Promise<WilayahChildEntry | undefined> {
  const n = norm(name);
  if (!n) return undefined;
  const list = await getVillages(districtCode);
  return list.find((v) => norm(v.name) === n);
}
