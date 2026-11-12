/**
 * projectTaxonomy.ts — TAKSONOMI PROYEK UNIVERSAL (AI Intelligence
 * Overhaul Fase 4 — Construction Intelligence, direktif owner
 * 2026-11-12 Part 15 Fase 4 + Part 5.3).
 *
 * Taksonomi sebagai DATA, bukan hardcode per keluarga di logika:
 * 19 keluarga direktif dipetakan ke subkategori yang SUDAH ADA di
 * `universalIntake.ts` (SUBCATEGORIES) + status dukungan per keluarga
 * yang DIHITUNG dari katalog hidup (catalogCoverage), bukan dikarang.
 *
 * Status dukungan:
 *  - 'didukung' — ≥1 template khusus subkategori itu.
 *  - 'parsial'  — hanya template kategori (tanpa template khusus).
 *  - 'GAP'      — 0 template pada kategori mana pun (jujur: lift &
 *    eskalator, playground — sesuai matriks cakupan audit Fase 0).
 *
 * Modul ini MURNI (tanpa efek samping, tanpa singleton). Ia TIDAK
 * mengubah taksonomi intake, TIDAK menambah subkategori, dan TIDAK
 * mengubah harga/katalog apa pun.
 */

import {
  SUBCATEGORIES,
  catalogCoverage,
  type CoverageEntry,
} from './universalIntake';

export type FamilySupport = 'didukung' | 'parsial' | 'GAP';

export interface ProjectFamily {
  /** Id keluarga direktif Part 5.3 (stabil, dipakai tes + laporan). */
  id: string;
  label: string;
  /** Subkategori intake yang sudah ada (id SUBCATEGORIES). */
  subcategoryIds: string[];
  /** Catatan dukungan / batas yang diketahui (bukan karangan harga). */
  note: string;
}

/**
 * 19 keluarga direktif Part 5.3. Pemetaan ke subkategori intake yang
 * sudah ada — bila satu keluarga tidak punya subkategori yang cocok,
 * `subcategoryIds` KOSONG dan dukungannya GAP (jujur, bukan dipaksa).
 */
export const PROJECT_FAMILIES: readonly ProjectFamily[] = [
  { id: 'residensial', label: 'Residensial', subcategoryIds: ['rumah', 'apartemen'], note: 'Rumah tinggal & hunian bertingkat.' },
  { id: 'komersial', label: 'Komersial', subcategoryIds: ['komersial', 'hotel', 'kantor'], note: 'Ruko, mall, hotel, perkantoran.' },
  { id: 'industri', label: 'Industri', subcategoryIds: ['gudang-industri'], note: 'Pabrik, workshop, cold storage.' },
  { id: 'gudang', label: 'Gudang', subcategoryIds: ['gudang-industri'], note: 'Gudang & bangunan industri (satu disiplin dengan industri).' },
  { id: 'jalan', label: 'Jalan', subcategoryIds: ['jalan', 'jalan-aspal', 'jalan-beton', 'jalan-lingkungan', 'jalan-tol', 'dinding-penahan', 'pekerjaan-tanah'], note: 'Subtipe perkerasan diklarifikasi, tidak diasumsikan diam-diam (CHAT-04). Dinding penahan & pekerjaan tanah adalah paket infrastruktur jalan/tanah satu disiplin ini.' },
  { id: 'jembatan', label: 'Jembatan', subcategoryIds: ['jembatan', 'gorong-gorong', 'pelindung-pantai'], note: 'Jembatan, gorong-gorong/box culvert, dan pelindung pantai/dermaga (satu disiplin sipil-air).' },
  { id: 'drainase', label: 'Drainase', subcategoryIds: ['drainase', 'gorong-gorong'], note: 'Drainase & saluran.' },
  { id: 'irigasi', label: 'Irigasi', subcategoryIds: ['irigasi', 'bendung', 'irigasi-landscape'], note: 'Saluran irigasi, bendung, irigasi landscape.' },
  { id: 'sekolah', label: 'Sekolah', subcategoryIds: ['sekolah'], note: 'Sekolah & fasilitas pendidikan.' },
  { id: 'fasilitas-publik', label: 'Fasilitas publik', subcategoryIds: ['bangunan-publik'], note: 'Masjid, aula, gedung serbaguna, balai.' },
  { id: 'rumah-sakit', label: 'Rumah sakit', subcategoryIds: ['kesehatan'], note: 'Rumah sakit, klinik, puskesmas.' },
  { id: 'peternakan', label: 'Peternakan', subcategoryIds: ['kandang'], note: 'Kandang & peternakan (sapi, ayam, kambing).' },
  { id: 'unggas', label: 'Unggas', subcategoryIds: ['kandang'], note: 'Kandang unggas — satu disiplin kandang; kapasitas per ekor dicatat di spek.' },
  { id: 'kolam', label: 'Kolam', subcategoryIds: ['kolam'], note: 'Kolam & water feature — klasifikasi MANDIRI, bukan subordinat rumah (CHAT-05).' },
  { id: 'landscape', label: 'Landscape', subcategoryIds: ['landscape-umum', 'taman-kota', 'landscape-komersial', 'landscape-resort', 'landscape-perumahan', 'hardscape', 'jogging-track', 'playground', 'pagar-gerbang', 'irigasi-landscape'], note: 'Termasuk taman — frasa "taman…" tanpa kata landscape/lanskap tetap routing ke sini (E-T1). Playground tetap GAP (0 template katalog).' },
  { id: 'renovasi', label: 'Renovasi', subcategoryIds: ['renovasi', 'pemeliharaan', 'pembongkaran', 'interior', 'finishing', 'fasad', 'pintu-jendela'], note: 'Renovasi / rehabilitasi / restorasi & pekerjaan terkait.' },
  { id: 'utilitas', label: 'Utilitas', subcategoryIds: ['plumbing', 'listrik', 'fire-protection', 'hvac', 'komunikasi-data', 'mep-umum', 'lift'], note: 'MEP & utilitas. Lift & eskalator GAP (0 template katalog) — tetap dinyatakan jujur, bukan dikarang.' },
  { id: 'multi-gedung', label: 'Multi-gedung', subcategoryIds: ['rumah', 'apartemen', 'kantor', 'komersial', 'sekolah', 'kesehatan', 'gudang-industri', 'bangunan-publik', 'bangunan-umum'], note: 'Proyek gabungan beberapa bangunan — tiap bangunan menyimpan lantainya sendiri (CHAT-03, multiBuilding.ts).' },
  { id: 'campuran', label: 'Campuran', subcategoryIds: ['rumah', 'komersial', 'kolam', 'landscape-umum', 'drainase', 'jalan', 'gudang-industri', 'pondasi', 'struktur-atap', 'waterproofing', 'struktur-baja', 'struktur-beton'], note: 'Gedung campuran — komponen fungsional terpisah per disiplin (CON-02). Paket pekerjaan mandiri (pondasi, atap, struktur beton/baja, waterproofing) juga tercakup di sini sebagai proyek paket tunggal.' },
] as const;

export function familyById(id: string | null): ProjectFamily | null {
  if (!id) return null;
  return PROJECT_FAMILIES.find((f) => f.id === id) ?? null;
}

/** Keluarga yang memuat satu subkategori intake (bisa >1 keluarga). */
export function familiesForSubcategory(subcategoryId: string): ProjectFamily[] {
  return PROJECT_FAMILIES.filter((f) => f.subcategoryIds.includes(subcategoryId));
}

export interface FamilySupportEntry {
  family: ProjectFamily;
  support: FamilySupport;
  /** Cakupan per subkategori anggota (dihitung dari katalog hidup). */
  coverage: CoverageEntry[];
  /** Alasan status (dihitung, bukan dikarang). */
  reason: string;
}

/**
 * Status dukungan per keluarga — DIHITUNG dari matriks cakupan katalog
 * hidup: 'didukung' bila ≥1 anggota berstatus 'didukung'; 'parsial'
 * bila ≥1 anggota 'sebagian' dan tak ada yang 'didukung'; 'GAP' bila
 * semua anggota 'tidak-ada' (atau keluarga tanpa subkategori).
 */
export function familySupportReport(): FamilySupportEntry[] {
  const coverage = catalogCoverage();
  const byId = new Map(coverage.map((c) => [c.subcategoryId, c]));
  return PROJECT_FAMILIES.map((family) => {
    const cov = family.subcategoryIds
      .map((id) => byId.get(id))
      .filter((c): c is CoverageEntry => c != null);
    let support: FamilySupport;
    let reason: string;
    if (cov.length === 0) {
      support = 'GAP';
      reason = 'Keluarga ini tidak memetakan ke subkategori intake mana pun — belum ada dukungan katalog.';
    } else if (cov.some((c) => c.support === 'didukung')) {
      support = 'didukung';
      const n = cov.filter((c) => c.support === 'didukung').length;
      reason = `${n} dari ${cov.length} subkategori anggota punya template khusus di katalog.`;
    } else if (cov.some((c) => c.support === 'sebagian')) {
      support = 'parsial';
      reason = 'Katalog punya template pada kategori anggota, tetapi belum ada template khusus subkategori ini.';
    } else {
      support = 'GAP';
      reason = 'Tidak ada template katalog pada kategori subkategori anggota — bagian ini tidak dikarang.';
    }
    return { family, support, coverage: cov, reason };
  });
}

/**
 * Validasi taksonomi sebagai DATA (dipakai suite Fase 4):
 *  - tiap id di `subcategoryIds` harus ada di SUBCATEGORIES;
 *  - tiap SUBCATEGORIES harus dimiliki ≥1 keluarga (tak ada yatim);
 *  - id keluarga unik.
 * Mengembalikan daftar masalah (kosong = valid).
 */
export function validateProjectTaxonomy(): string[] {
  const problems: string[] = [];
  const known = new Set(SUBCATEGORIES.map((s) => s.id));
  const seenFamily = new Set<string>();
  const covered = new Set<string>();
  for (const f of PROJECT_FAMILIES) {
    if (seenFamily.has(f.id)) problems.push(`id keluarga ganda: ${f.id}`);
    seenFamily.add(f.id);
    for (const id of f.subcategoryIds) {
      if (!known.has(id)) problems.push(`keluarga ${f.id} memetakan ke subkategori tak dikenal: ${id}`);
      covered.add(id);
    }
  }
  for (const s of SUBCATEGORIES) {
    if (!covered.has(s.id)) problems.push(`subkategori yatim (tak dimiliki keluarga mana pun): ${s.id}`);
  }
  return problems;
}

/** Subkategori yang JUJUR GAP (0 template) — lift & eskalator, playground. */
export function gapSubcategories(): CoverageEntry[] {
  return catalogCoverage().filter((c) => c.support === 'tidak-ada');
}

/** Satu baris laporan per keluarga, untuk laporan / prompt. */
export function formatFamilySupportLines(): string[] {
  return familySupportReport().map(
    (e) => `• ${e.family.label}: ${e.support.toUpperCase()} — ${e.reason}`,
  );
}
