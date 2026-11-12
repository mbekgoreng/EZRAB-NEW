/**
 * structuredSpec.ts — SKEMA SPESIFIKASI TERSTRUKTUR v2
 * (Rantai Spesifikasi → RAB, Fase 2 Bagian A, 2026-11-12).
 *
 * Modul MURNI: tipe + tabel kunci + validasi. TIDAK mengimpor apa pun
 * dari questionnaire/universalIntake (bahkan bukan `import type` dari
 * modul yang ber-siklus) — agar bisa diimpor dari mana saja tanpa
 * risiko siklus impor runtime.
 *
 * Satu spek = satu jawaban/fakta pengguna yang sudah terstruktur:
 * `{ key, kind, label, value, unit?, status, source, updatedAt,
 * supersedes? }`. Hanya jawaban pengguna yang menjadi CONFIRMED
 * (aturan kuesioner yang sudah ada); asumsi/rekomendasi dicadangkan
 * untuk Bagian B, dan UNRESOLVED untuk yang dilewati pengguna.
 */

/** Jenis isi spek — menentukan bentuk `value` yang sah. */
export type SpecKind = 'material' | 'dimension' | 'count' | 'scope' | 'quality' | 'condition';

/** Status kebenaran spek. */
export type SpecStatus = 'CONFIRMED' | 'ASSUMPTION' | 'RECOMMENDATION' | 'UNRESOLVED';

/** Satu spesifikasi terstruktur. */
export interface StructuredSpec {
  key: string;
  kind: SpecKind;
  label: string;
  value: string | number | string[] | boolean | null;
  unit?: string;
  status: SpecStatus;
  source: 'kuesioner' | 'percakapan' | 'default-template' | 'DED';
  updatedAt: string;
  supersedes?: string | null;
  /**
   * Provenans sumber spek (GATE 4 / 5D — INTEGRASI DED/QTO):
   * jejak dokumen asal yang dapat dibaca manusia, mis.
   * `DED "gambar-kerja.pdf" hal. 2 · item "Galian tanah"`.
   * Hanya diisi spek bersumber DED (oleh dedUnderstanding);
   * bila sumber tidak menyebut halaman/bagian, dicatat seadanya —
   * TIDAK PERNAH dikarang. Opsional agar spek lama tetap valid.
   */
  provenance?: string;
}

/* ------------------------------------------------------------------ */
/* Tabel kunci (SPEC_KEY_META)                                         */
/* ------------------------------------------------------------------ */

/**
 * Metadata kanonis per kunci spek: kind + family (pengelompokan untuk
 * Bagian B — BUKAN family taksonomi subkategori) + label manusiawi.
 *
 * Cakupan: SEMUA kunci definisi kuesioner di questionnaire.ts (29
 * kunci) + 4 kunci percakapan (kandang-type, warehouse-system,
 * bridge-type, new-construction) + 'budget' + 5 kunci dimensi DED
 * (Fase 4 — pemahaman DED, sumber 'DED') = 39 kunci.
 *
 * Keputusan kind yang TIDAK eksplisit di tugas (didokumentasikan,
 * bukan diam-diam):
 * - `building-foundation` → 'scope': pilihannya adalah sistem
 *   pondasi (foot plat / batu kali / bore pile), bukan satu material.
 * - `building-roof-type` → 'scope': pilihannya adalah jenis/sistem
 *   atap (dak / genteng / spandek-galvalum / kombinasi), berbeda dari
 *   `kandang-roof-material` / `warehouse-roof` yang memang 'material'.
 * - `pool-type` → 'scope': tipe sirkulasi (skimmer/overflow) adalah
 *   pilihan sistem, bukan material.
 * - `pool-deck` → 'scope': "dengan/tanpa deck" adalah pilihan cakupan.
 * - `warehouse-system` → 'scope': pilihan sistem struktur
 *   (portal frame / truss).
 * - `bridge-type` → 'scope': pilihan tipe jembatan — MESKIPUN nilai
 *   opsinya bernama material ('beton'/'baja'/'kayu'), yang dipilih
 *   adalah sistem struktur jembatannya, seperti `kandang-type`.
 * - `new-construction` → 'condition': baru vs eksisting adalah
 *   kondisi proyek. CATATAN: saat ini TIDAK ADA penulis yang mengisi
 *   `ctx.answers['new-construction']` (extract hanya menyetel boolean
 *   `ctx.isNewConstruction`, yang sengaja BUKAN sumber derivasi —
 *   sumber kanonis hanya questionnaire.answers + ctx.answers +
 *   ctx.budget); spek ini muncul hanya bila suatu jalur kelak
 *   mencatat jawaban string-nya.
 * - `building-bedrooms` → 'count', unit 'kamar tidur' (seperti
 *   `kandang-capacity` → 'count', unit 'ekor').
 * - `budget` → 'condition', unit 'IDR', nilai NUMERIK (rupiah).
 *   Ini satu-satunya pengecualian aturan "condition = string":
 *   lihat `validateStructuredSpecs` — validator menerima number
 *   HANYA untuk kunci 'budget'.
 * - `kandang-floor` / `warehouse-floor` → 'material' (pilihan material
 *   lantai), BUKAN 'condition' — sesuai arahan tugas.
 * - `landscape-vegetation` (multi) → 'condition' dengan value
 *   string[] (vegetasi yang direncanakan adalah kondisi tapak).
 */
export const SPEC_KEY_META: Record<string, { kind: SpecKind; family: string; label: string }> = {
  /* --- Kandang & peternakan --- */
  'kandang-capacity': { kind: 'count', family: 'kandang', label: 'Kapasitas kandang (jumlah ekor)' },
  'kandang-roof-material': { kind: 'material', family: 'kandang', label: 'Material penutup atap kandang' },
  'kandang-floor': { kind: 'material', family: 'kandang', label: 'Jenis lantai kandang' },
  'kandang-facilities': { kind: 'scope', family: 'kandang', label: 'Fasilitas tambahan kandang' },
  'kandang-manure': { kind: 'condition', family: 'kandang', label: 'Pengelolaan kotoran ternak' },
  /* --- Gudang & industri --- */
  'warehouse-roof': { kind: 'material', family: 'gudang', label: 'Material penutup atap gudang' },
  'warehouse-floor': { kind: 'material', family: 'gudang', label: 'Jenis lantai gudang' },
  'warehouse-loading': { kind: 'scope', family: 'gudang', label: 'Fasilitas loading gudang' },
  /* --- Gedung --- */
  'building-foundation': { kind: 'scope', family: 'gedung', label: 'Jenis pondasi / kondisi tanah' },
  'building-roof-type': { kind: 'scope', family: 'gedung', label: 'Jenis atap bangunan' },
  'building-finish-grade': { kind: 'quality', family: 'gedung', label: 'Grade finishing bangunan' },
  'building-mep-scope': { kind: 'scope', family: 'gedung', label: 'Cakupan instalasi MEP' },
  'building-bedrooms': { kind: 'count', family: 'gedung', label: 'Jumlah kamar tidur per unit' },
  /* --- Jalan --- */
  'road-pavement': { kind: 'material', family: 'jalan', label: 'Jenis perkerasan jalan' },
  'road-traffic': { kind: 'condition', family: 'jalan', label: 'Kelas lalu lintas jalan' },
  'road-subgrade': { kind: 'condition', family: 'jalan', label: 'Kondisi tanah dasar jalan' },
  'road-drainage': { kind: 'scope', family: 'jalan', label: 'Drainase pendamping jalan' },
  /* --- Drainase --- */
  'drainage-material': { kind: 'material', family: 'drainage', label: 'Material saluran drainase' },
  'drainage-flow': { kind: 'condition', family: 'drainage', label: 'Arah aliran & tujuan buang drainase' },
  'drainage-cover': { kind: 'condition', family: 'drainage', label: 'Penutup saluran drainase' },
  /* --- Kolam --- */
  'pool-type': { kind: 'scope', family: 'kolam', label: 'Tipe kolam (skimmer/overflow)' },
  'pool-finish': { kind: 'material', family: 'kolam', label: 'Finishing kolam' },
  'pool-deck': { kind: 'scope', family: 'kolam', label: 'Deck kolam' },
  /* --- Landscape --- */
  'landscape-vegetation': { kind: 'condition', family: 'landscape', label: 'Vegetasi / softscape landscape' },
  'landscape-irrigation': { kind: 'condition', family: 'landscape', label: 'Sistem penyiraman landscape' },
  'landscape-lighting': { kind: 'condition', family: 'landscape', label: 'Penerangan landscape' },
  /* --- Renovasi --- */
  'renovation-condition': { kind: 'condition', family: 'renovasi', label: 'Kondisi eksisting renovasi' },
  'renovation-finish-grade': { kind: 'quality', family: 'renovasi', label: 'Grade finishing renovasi' },
  'renovation-mep': { kind: 'scope', family: 'renovasi', label: 'Perbaikan instalasi renovasi' },
  /* --- Kunci percakapan (questionDefsFor, bukan definisi kuesioner) --- */
  'kandang-type': { kind: 'scope', family: 'kandang', label: 'Tipe kandang (terbuka/tertutup)' },
  'warehouse-system': { kind: 'scope', family: 'gudang', label: 'Sistem struktur gudang (portal frame/truss)' },
  'bridge-type': { kind: 'scope', family: 'jembatan', label: 'Tipe jembatan' },
  'new-construction': { kind: 'condition', family: 'percakapan', label: 'Status pembangunan (baru/eksisting)' },
  /* --- Anggaran --- */
  budget: { kind: 'condition', family: 'anggaran', label: 'Batas anggaran' },
  /* --- Dimensi dari DED (Fase 4 — pemahaman DED; sumber 'DED') --- */
  'ded-length': { kind: 'dimension', family: 'ded', label: 'Panjang (dari DED)' },
  'ded-width': { kind: 'dimension', family: 'ded', label: 'Lebar (dari DED)' },
  'ded-height': { kind: 'dimension', family: 'ded', label: 'Tinggi (dari DED)' },
  'ded-area': { kind: 'dimension', family: 'ded', label: 'Luas (dari DED)' },
  'ded-volume': { kind: 'dimension', family: 'ded', label: 'Volume (dari DED)' },
};

const SPEC_STATUSES: readonly string[] = ['CONFIRMED', 'ASSUMPTION', 'RECOMMENDATION', 'UNRESOLVED'];
const SPEC_SOURCES: readonly string[] = ['kuesioner', 'percakapan', 'default-template', 'DED'];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/**
 * Validasi ketat bentuk array spek — fail-closed: bentuk apa pun yang
 * tidak sah → `null` (bukan perbaikan tebakan, bukan buang diam-diam
 * entri yang rusak).
 *
 * Aturan per entri:
 * - objek dengan `key` string yang ADA di SPEC_KEY_META (key tak
 *   dikenal → null);
 * - `kind` cocok dengan META kunci itu (tidak cocok → null);
 * - `status` salah satu dari 4; `source` salah satu dari 3;
 * - `value` bertipe sesuai kind: material/scope/quality/condition →
 *   string | string[] | null; count/dimension → number (finite) |
 *   null; boolean SELALU ditolak (tidak ada kunci yang memakai
 *   boolean); PENGECUALIAN: kunci 'budget' (kind 'condition')
 *   menerima number finite — nilainya rupiah, unit 'IDR';
 * - `updatedAt` string tanggal ISO yang valid (Date.parse finite);
 * - `unit`/`supersedes`, bila ada, harus string (supersedes boleh
 *   null); `label` harus string.
 * - `provenance` (GATE 4 / 5D), bila ada, harus string.
 *
 * Medan lain yang tidak dikenal pada entri DITOLERANSI (kompatibilitas
 * maju — Bagian B boleh menambah anotasi tanpa memecahkan validator).
 *
 * Sukses → mengembalikan array YANG SAMA (bukan kopian dalam).
 */
export function validateStructuredSpecs(raw: unknown): StructuredSpec[] | null {
  if (!Array.isArray(raw)) return null;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.key !== 'string') return null;
    const meta = SPEC_KEY_META[e.key];
    if (!meta) return null; // key tak dikenal — fail-closed
    if (e.kind !== meta.kind) return null; // kind tak cocok dengan META
    if (typeof e.label !== 'string') return null;
    if (typeof e.status !== 'string' || !SPEC_STATUSES.includes(e.status)) return null;
    if (typeof e.source !== 'string' || !SPEC_SOURCES.includes(e.source)) return null;
    if (typeof e.updatedAt !== 'string' || !Number.isFinite(Date.parse(e.updatedAt))) return null;
    if (e.unit !== undefined && typeof e.unit !== 'string') return null;
    if (e.supersedes !== undefined && e.supersedes !== null && typeof e.supersedes !== 'string') return null;
    if (e.provenance !== undefined && typeof e.provenance !== 'string') return null;
    const v = e.value;
    if (meta.kind === 'count' || meta.kind === 'dimension') {
      if (!(v === null || (typeof v === 'number' && Number.isFinite(v)))) return null;
    } else {
      // material / scope / quality / condition: string | string[] | null,
      // boolean selalu ditolak — kecuali 'budget' yang bernilai number (IDR).
      if (e.key === 'budget') {
        if (!(v === null || typeof v === 'string' || isStringArray(v) || (typeof v === 'number' && Number.isFinite(v)))) return null;
      } else if (!(v === null || typeof v === 'string' || isStringArray(v))) {
        return null;
      }
    }
  }
  return raw as StructuredSpec[];
}

/* ------------------------------------------------------------------ */
/* GATE 4 (5D) — predikat spek DED                                     */
/* ------------------------------------------------------------------ */

/**
 * Satu entri spek DED yang sah: lolos `validateStructuredSpecs`
 * (kunci dikenal di META, kind cocok, status/source sah, nilai
 * bertipe benar) DAN bersumber 'DED'. Dipakai penyaring per-entri
 * (bukan fail-closed seluruh array) di `deriveStructuredSpecs`
 * aturan (g) dan di `sanitizeDedSpecs` (dedQtoIntegration) — satu
 * entri DED yang rusak tidak boleh membuang seluruh spek DED yang
 * sah, dan tidak boleh pula lolos sebagai spek (dibuang, dicatat
 * pemanggil bila relevan).
 */
export function isValidDedSpec(entry: unknown): entry is StructuredSpec {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if ((entry as { source?: unknown }).source !== 'DED') return false;
  return validateStructuredSpecs([entry]) !== null;
}
