/**
 * wbsArtifact — ARTEFAK WBS EKSPLISIT antar-stage (P3D, FULL REPAIR
 * 2026-11-13; audit Autonomous Estimation §A.2 Stage B + §E Tahap 2.4).
 *
 * Masalah yang ditutup: sebelum P3D, WBS nyata di draft HANYA implisit
 * (efek samping pemilihan template) — tidak ada artefak yang dapat
 * dirujuk tahap berikutnya (QTO → AHSP → biaya), dan empat taksonomi
 * tumpang-tindih tanpa peta (19 keluarga `projectTaxonomy` vs 12
 * `WORK_CATEGORIES` vs 8 katalog WBS DED vs 6+ WBS konseptual).
 *
 * Modul ini MURNI (struktur data + builder deterministik — BUKAN engine
 * baru, BUKAN pipeline baru, BUKAN taksonomi baru):
 * - SATU artefak `WbsArtifact`: daftar node paket pekerjaan dengan ID
 *   STABIL (`wbs:<scopeId>`) yang dirujuk item draft, QTO, dan cek
 *   kelengkapan; dibangun dari spesifikasi terstruktur + template yang
 *   dipilih (part draft) + WBS konseptual subkategori (bila ada).
 * - SATU peta eksplisit `SCOPE_TAXONOMY_MAP`: scope universal (18, dari
 *   `SCOPE_GROUPS` — labelnya DICERMINKAN di sini + dijaga tes, karena
 *   modul ini tidak boleh mengimpor universalRab) → WORK_CATEGORIES
 *   (12, diimpor langsung — bukan salinan) → kode kelompok katalog WBS
 *   DED (`WBS_CATALOGS`, diimpor langsung) → label konseptual
 *   (`conceptualWbsFor`, diimpor langsung). Keluarga taksonomi 19
 *   (`PROJECT_FAMILIES`) TIDAK diimpor di sini: projectTaxonomy menarik
 *   universalIntake yang mengimpor universalRab (siklus impor) — famili
 *   ditempel per artefak oleh pemanggil (`familyIdFromSpecs`) dan
 *   konsistensinya dijaga tes, bukan modul ini. Peta ini SEBAGIAN
 *   dengan jujur: scope non-gedung (jalan, jembatan, …) TIDAK punya
 *   padanan WORK_CATEGORIES (kategori itu khusus bangunan) dan
 *   kelompok "Persiapan" DED TIDAK punya scope (tak ada scope
 *   persiapan) — keduanya dicatat null/kosong, bukan dipaksa.
 * - Cakupan node dihitung dari TIGA sinyal, dari kuat ke lemah:
 *   (1) item MILIK node (part draft berscope itu) → LENGKAP;
 *   (2) item TERKLASIFIKASI ke node (kelompok DED via `classifyToWbs`
 *   yang sudah ada, ATAU token kata kunci scope eksplisit di
 *   `SCOPE_KEYWORDS`) → TERCAKUP — sinyal heuristik, tidak pernah
 *   dipakai membuat item atau angka, hanya menandai "pekerjaan ini
 *   sudah ada di dalam part lain" (mis. item pondasi di dalam part
 *   gedung tunggal);
 *   (3) tidak ada keduanya → KOSONG (gap — harus diisi item atau
 *   dikecualikan eksplisit). DIKECUALIKAN = keputusan eksplisit
 *   (supresi sistem dari `suppressedScopes` pemanggil, atau koreksi
 *   pengguna) — selalu menang atas sinyal cakupan.
 * - Koreksi pengguna DIPERTAHANKAN saat regenerasi: builder menerima
 *   `previousArtifact` dan membawa pengecualian/note `by: 'user'`
 *   (berkunci ID node stabil) ke artefak baru; node yang scope-nya
 *   sudah tidak ada di proyek dibuang bersama koreksinya (scope itu
 *   sudah pergi — membangkitkannya lagi adalah karangan).
 *
 * Batas yang dijaga: modul ini TIDAK mengimpor specChain, universalRab,
 * projectTaxonomy, atau questionnaire (siklus impor / graf berat);
 * supresi scope + familyId + subcategoryId DIBERIKAN pemanggil.
 * TIDAK ada harga/koefisien/volum di sini — WBS adalah struktur,
 * bukan BOQ (prinsip yang sama dengan `conceptualWbs.ts`).
 */

import type { StructuredSpec } from './structuredSpec';
import { SPEC_KEY_META, latestSpecsByKey } from './structuredSpec';
import { WORK_CATEGORIES } from '../../data/mockData';
import { WBS_CATALOGS } from '../ded-ai-estimate/wbsCatalog';
import { conceptualWbsFor } from './conceptualWbs';
import { classifyToWbs } from '../ded-ai-estimate/wbsClassifier';

/* ------------------------------------------------------------------ */
/* Tipe                                                                */
/* ------------------------------------------------------------------ */

/**
 * Status kelengkapan satu node WBS.
 * - LENGKAP: punya ≥1 item milik sendiri (part berscope itu).
 * - TERCAKUP: tanpa item milik, tapi ≥1 item draft terklasifikasi ke
 *   node ini (kelompok DED / kata kunci) — pekerjaan itu ADA di draft,
 *   hanya di dalam part lain. Lolos cek kelengkapan, dengan catatan.
 * - KOSONG: tanpa item milik maupun terklasifikasi — gap.
 * - DIKECUALIKAN: dikecualikan eksplisit (supresi sistem / koreksi
 *   pengguna) — lolos cek kelengkapan karena keputusannya tercatat.
 */
export type WbsNodeStatus = 'LENGKAP' | 'TERCAKUP' | 'KOSONG' | 'DIKECUALIKAN';

/** Dari mana node ini berasal (jejak, bukan klaim kebenaran). */
export type WbsNodeSource = 'template' | 'spek' | 'konseptual' | 'koreksi-user';

export interface WbsExclusion {
  reason: string;
  by: 'user' | 'sistem';
  at?: string;
}

export interface WbsArtifactNode {
  /** ID stabil antar-regenerasi: `wbs:<scopeId>`. */
  id: string;
  scopeId: string;
  label: string;
  source: WbsNodeSource;
  /** Keluarga taksonomi 19 per artefak (ditempel pemanggil). */
  familyId: string | null;
  /** Padanan WORK_CATEGORIES (12) — kosong = tak ada padanan. */
  workCategories: string[];
  /** Katalog DED utama scope ini (kunci WBS_CATALOGS) / null. */
  dedCatalog: string | null;
  /** Kode kelompok DED scope ini (kelompok saja, bukan subkelompok). */
  dedGroupCodes: string[];
  /** Baris WBS konseptual asal node ini (bila dari konseptual). */
  conceptualLabel: string | null;
  templateIds: string[];
  /** Kunci spek yang memetakan ke scope ini (terbaru per kunci). */
  specKeys: string[];
  status: WbsNodeStatus;
  /** ID item draft efektif MILIK node ini (part berscope sama). */
  itemIds: string[];
  /** ID item draft yang terklasifikasi ke node ini (di part lain). */
  classifiedItemIds: string[];
  exclusion?: WbsExclusion;
  /** True bila node ini pernah dikoreksi pengguna — dipertahankan. */
  userCorrected?: boolean;
  correctionNote?: string;
}

export interface WbsArtifact {
  version: 1;
  familyId: string | null;
  subcategoryId: string | null;
  templateIds: string[];
  nodes: WbsArtifactNode[];
  generatedAt: string;
}

/** Satu part draft (bentuk struktural minimal — tanpa impor universalRab). */
export interface WbsPartInput {
  scopeId: string;
  scopeLabel: string;
  templateId: string;
  templateName: string;
  /** Item efektif part ini, dengan ID FINAL (`templateId::id` — sama
   *  seperti `effectiveItems` di universalRab). */
  items: Array<{ id: string; description: string; unit: string }>;
}

export interface BuildWbsArtifactInput {
  specs: StructuredSpec[];
  parts: WbsPartInput[];
  familyId?: string | null;
  subcategoryId?: string | null;
  /** Scope yang disupresi (dihitung pemanggil via `suppressedScopes`). */
  suppressedScopeIds?: string[];
  /** Artefak sebelumnya — koreksi pengguna dibawa ke artefak baru. */
  previousArtifact?: WbsArtifact | null;
}

/* ------------------------------------------------------------------ */
/* Label scope — CERMIN SCOPE_GROUPS (universalRab).                   */
/*                                                                     */
/* Cermin sadar (pola yang sama dengan cermin classifyParam di         */
/* specChain): modul ini tidak boleh mengimpor universalRab (siklus). */
/* Bila label kanonis berubah, cermin ini wajib diperbarui bersama —   */
/* dijaga tes P3D §0 (membandingkan dengan SCOPE_GROUPS langsung).    */
/* ------------------------------------------------------------------ */

export const SCOPE_LABELS: Readonly<Record<string, string>> = {
  jalan: 'Jalan & Perkerasan',
  drainase: 'Drainase & Saluran',
  jembatan: 'Jembatan & Struktur Khusus',
  irigasi: 'Irigasi & Sumber Daya Air',
  pondasi: 'Pondasi & Geoteknik',
  struktur: 'Struktur Beton & Baja',
  atap: 'Atap & Waterproofing',
  finishing: 'Finishing & Interior',
  gedung: 'Gedung & Bangunan',
  mep: 'Mekanikal, Elektrikal & Plumbing',
  sanitasi: 'Sanitasi & Air Limbah',
  lanskap: 'Lanskap, Pagar & Halaman',
  renovasi: 'Renovasi & Rehabilitasi',
  demolisi: 'Demolisi & Pembongkaran',
  pelabuhan: 'Pelabuhan & Pesisir',
  olahraga: 'Fasilitas Olahraga',
  pertanian: 'Pertanian & Perkebunan',
  tanah: 'Pekerjaan Tanah',
};

export const WBS_SCOPE_IDS: readonly string[] = Object.keys(SCOPE_LABELS);

export function wbsNodeId(scopeId: string): string {
  return `wbs:${scopeId}`;
}

/* ------------------------------------------------------------------ */
/* SPEC_FAMILY_TO_SCOPE — family spek (SPEC_KEY_META) → scope WBS.    */
/*                                                                     */
/* Cermin niat `familyIdFromSpecs` (specChain) pada tingkat scope:     */
/* family 'kandang' → scope 'pertanian' (template kandang berkategori  */
/* PERTANIAN_PERKEBUNAN), 'gudang' → 'gedung' (template gudang         */
/* berkategori GEDUNG/INDUSTRI), 'kolam' → 'olahraga' (kolam renang   */
/* berkategori FASILITAS_OLAHRAGA). Family 'ded'/'anggaran'/           */
/* 'percakapan' tidak memetakan ke scope (bukan paket pekerjaan).      */
/* Dijaga tes P3D §0.                                                  */
/* ------------------------------------------------------------------ */

export const SPEC_FAMILY_TO_SCOPE: Readonly<Record<string, string | null>> = {
  kandang: 'pertanian',
  gudang: 'gedung',
  gedung: 'gedung',
  jalan: 'jalan',
  drainage: 'drainase',
  kolam: 'olahraga',
  landscape: 'lanskap',
  renovasi: 'renovasi',
  jembatan: 'jembatan',
  ded: null,
  anggaran: null,
  percakapan: null,
};

/** Scope WBS untuk satu kunci spek (null bila bukan paket pekerjaan). */
export function scopeForSpecKey(specKey: string): string | null {
  const meta = SPEC_KEY_META[specKey];
  if (!meta) return null;
  return SPEC_FAMILY_TO_SCOPE[meta.family] ?? null;
}

/* ------------------------------------------------------------------ */
/* SCOPE_TAXONOMY_MAP — peta eksplisit antar-taksonomi (inti P3D).    */
/*                                                                     */
/* Satu baris per scope universal (18). `workCategories` memakai       */
/* LABEL PERSIS dari WORK_CATEGORIES (divalidasi `validateTaxonomyMap` */
/* terhadap daftar hidup — bukan salinan yang bisa menyimpang).        */
/* `dedGroupCodes` memakai kode KELOMPOK persis dari WBS_CATALOGS      */
/* (divalidasi terhadap katalog hidup; satu kelompok = satu scope —    */
/* anti duplikasi, prinsip wbsCatalog).                                */
/*                                                                     */
/* Kejujuran peta (didokumentasikan, bukan dipaksa):                   */
/* - Scope non-gedung (jalan/drainase/jembatan/irigasi/demolisi/       */
/*   pelabuhan/olahraga/pertanian) → workCategories KOSONG: 12         */
/*   WORK_CATEGORIES adalah kategori BANGUNAN, tak ada padanannya.     */
/* - 'gedung' & 'renovasi' → SELURUH 12 kategori: paket gedung/        */
/*   renovasi melintasi semua kategori bangunan (bukan satu).          */
/* - Kelompok "Persiapan" DED (BGN-01, JLN-01, DRN-01, JMB-01,         */
/*   BDM-01, IRG-01) TIDAK dipetakan: tak ada scope persiapan.         */
/* - 'sanitasi' → dedGroupCodes KOSONG: DRN-03-D (jaringan pipa)       */
/*   adalah SUBKELOMPOK di bawah DRN-03 (drainase) — sanitasi tak      */
/*   punya kelompok sendiri di katalog DED.                            */
/* - 'gedung' → dedGroupCodes KOSONG: part gedung memiliki itemnya     */
/*   langsung; item-item itu terklasifikasi ke kelompok BGN lain      */
/*   (pondasi/struktur/atap/…) dan kelompok itu yang mengklaimnya      */
/*   sebagai TERCAKUP — memberi kode ke gedung akan mengklaim semua.   */
/* ------------------------------------------------------------------ */

export interface ScopeTaxonomyRow {
  scopeId: string;
  workCategories: string[];
  dedCatalog: string | null;
  dedGroupCodes: string[];
}

const ALL_WORK_CATEGORIES: string[] = [...WORK_CATEGORIES];

export const SCOPE_TAXONOMY_MAP: readonly ScopeTaxonomyRow[] = [
  { scopeId: 'jalan', workCategories: [], dedCatalog: 'JALAN', dedGroupCodes: ['JLN-04', 'JLN-05', 'JLN-06', 'JLN-07', 'JLN-08'] },
  { scopeId: 'drainase', workCategories: [], dedCatalog: 'BANGUNAN AIR', dedGroupCodes: ['DRN-03', 'JLN-03'] },
  { scopeId: 'jembatan', workCategories: [], dedCatalog: 'JEMBATAN', dedGroupCodes: ['JMB-02', 'JMB-03'] },
  { scopeId: 'irigasi', workCategories: [], dedCatalog: 'IRIGASI', dedGroupCodes: ['IRG-03', 'IRG-04', 'IRG-05', 'IRG-06', 'IRG-07', 'IRG-08', 'IRG-09', 'BDM-03', 'BDM-04', 'BDM-05', 'BDM-06', 'BDM-07', 'BDM-08', 'BDM-09', 'BDM-10', 'BDM-11', 'BDM-12', 'BDM-13', 'BDM-14', 'BDM-15'] },
  { scopeId: 'pondasi', workCategories: ['Pekerjaan Tanah & Pondasi'], dedCatalog: 'BANGUNAN', dedGroupCodes: ['BGN-03'] },
  { scopeId: 'struktur', workCategories: ['Pekerjaan Struktur Beton Bertulang'], dedCatalog: 'BANGUNAN', dedGroupCodes: ['BGN-04'] },
  { scopeId: 'atap', workCategories: ['Pekerjaan Atap & Rangka Baja Ringan'], dedCatalog: 'BANGUNAN', dedGroupCodes: ['BGN-06'] },
  { scopeId: 'finishing', workCategories: ['Pekerjaan Dinding & Plesteran', 'Pekerjaan Lantai & Keramik', 'Pekerjaan Plafon & Partisi', 'Pekerjaan Pintu, Jendela & Kaca', 'Pekerjaan Pengecatan'], dedCatalog: 'BANGUNAN', dedGroupCodes: ['BGN-05', 'BGN-07', 'BGN-08', 'BGN-09', 'BGN-12'] },
  { scopeId: 'gedung', workCategories: ALL_WORK_CATEGORIES, dedCatalog: 'BANGUNAN', dedGroupCodes: [] },
  { scopeId: 'mep', workCategories: ['Pekerjaan Instalasi Plumbing & Sanitasi', 'Pekerjaan Instalasi Elektrikal'], dedCatalog: 'BANGUNAN', dedGroupCodes: ['BGN-10'] },
  { scopeId: 'sanitasi', workCategories: ['Pekerjaan Instalasi Plumbing & Sanitasi'], dedCatalog: 'BANGUNAN AIR', dedGroupCodes: [] },
  { scopeId: 'lanskap', workCategories: ['Pekerjaan Finishing & Eksterior'], dedCatalog: 'BANGUNAN', dedGroupCodes: ['BGN-11'] },
  { scopeId: 'renovasi', workCategories: ALL_WORK_CATEGORIES, dedCatalog: 'BANGUNAN', dedGroupCodes: [] },
  { scopeId: 'demolisi', workCategories: [], dedCatalog: null, dedGroupCodes: [] },
  { scopeId: 'pelabuhan', workCategories: [], dedCatalog: null, dedGroupCodes: [] },
  { scopeId: 'olahraga', workCategories: [], dedCatalog: null, dedGroupCodes: [] },
  { scopeId: 'pertanian', workCategories: [], dedCatalog: null, dedGroupCodes: [] },
  { scopeId: 'tanah', workCategories: ['Pekerjaan Tanah & Pondasi'], dedCatalog: 'BANGUNAN', dedGroupCodes: ['BGN-02', 'JLN-02', 'DRN-02', 'BDM-02', 'IRG-02'] },
];

const TAXONOMY_BY_SCOPE = new Map(SCOPE_TAXONOMY_MAP.map((r) => [r.scopeId, r]));

export function scopeTaxonomyRow(scopeId: string): ScopeTaxonomyRow | null {
  return TAXONOMY_BY_SCOPE.get(scopeId) ?? null;
}

/** Kelompok DED → scope (balikan peta; satu kelompok = satu scope). */
const SCOPE_BY_DED_GROUP = new Map<string, string>();
for (const row of SCOPE_TAXONOMY_MAP) {
  for (const code of row.dedGroupCodes) SCOPE_BY_DED_GROUP.set(code, row.scopeId);
}

export function scopeForDedGroupCode(code: string): string | null {
  return SCOPE_BY_DED_GROUP.get(code) ?? null;
}

/**
 * Validasi peta taksonomi terhadap daftar/katalog HIDUP (dipakai tes
 * P3D §0 + dapat dipakai verifikator): scope dikenal; label kategori
 * ADA di WORK_CATEGORIES; kode kelompok ADA di WBS_CATALOGS; tak ada
 * kode kelompok ganda antar-scope. Kosong = valid.
 */
export function validateTaxonomyMap(): string[] {
  const problems: string[] = [];
  const knownCategories = new Set(WORK_CATEGORIES);
  const knownCodes = new Set<string>();
  for (const nodes of Object.values(WBS_CATALOGS)) {
    for (const n of nodes) knownCodes.add(n.code);
  }
  const seenCodes = new Map<string, string>();
  for (const row of SCOPE_TAXONOMY_MAP) {
    if (!(row.scopeId in SCOPE_LABELS)) problems.push(`scope tak dikenal di peta: ${row.scopeId}`);
    for (const c of row.workCategories) {
      if (!knownCategories.has(c)) problems.push(`scope ${row.scopeId}: kategori tak ada di WORK_CATEGORIES: "${c}"`);
    }
    if (row.dedCatalog !== null && !(row.dedCatalog in WBS_CATALOGS)) {
      problems.push(`scope ${row.scopeId}: katalog DED tak dikenal: ${row.dedCatalog}`);
    }
    for (const code of row.dedGroupCodes) {
      if (!knownCodes.has(code)) problems.push(`scope ${row.scopeId}: kode kelompok DED tak ada di katalog: ${code}`);
      const prev = seenCodes.get(code);
      if (prev && prev !== row.scopeId) problems.push(`kode kelompok DED ganda: ${code} di scope ${prev} dan ${row.scopeId}`);
      seenCodes.set(code, row.scopeId);
    }
  }
  const mapped = new Set(SCOPE_TAXONOMY_MAP.map((r) => r.scopeId));
  for (const id of WBS_SCOPE_IDS) {
    if (!mapped.has(id)) problems.push(`scope tanpa baris peta: ${id}`);
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* SCOPE_KEYWORDS — token khas per scope untuk sinyal TERCAKUP.        */
/*                                                                     */
/* Heuristik EKSPLISIT (bukan klasifikasi diam-diam): dipakai HANYA    */
/* untuk menandai node tanpa item milik sebagai TERCAKUP ("pekerjaan   */
/* ini sudah ada di dalam part lain") — tidak pernah membuat item,     */
/* volume, atau angka. Token dipilih SPESIFIK agar tidak mencuri:      */
/* 'dinding' saja TIDAK dipakai (akan mencuri 'dinding penahan' milik  */
/* lanskap dan 'dinding geser' milik struktur) — dipakai frasa         */
/* 'pasangan dinding'/'dinding bata'. 'gedung' sengaja TANPA token     */
/* (part gedung memiliki itemnya langsung; token akan mengklaim        */
/* semua). 'renovasi' hanya token renovasi eksplisit.                  */
/* ------------------------------------------------------------------ */

export const SCOPE_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  jalan: ['jalan', 'perkerasan', 'aspal', 'hotmix', 'paving blok', 'marka', 'kanstin', 'bahu jalan'],
  drainase: ['drainase', 'u-ditch', 'uditch', 'saluran', 'gorong-gorong', 'box culvert'],
  jembatan: ['jembatan', 'abutment', 'girder', 'gelagar', 'oprit', 'pier'],
  irigasi: ['irigasi', 'bendung', 'bendungan', 'saluran irigasi', 'pintu air', 'sifon', 'spillway', 'pelimpah'],
  pondasi: ['pondasi', 'foot plat', 'footplat', 'tiang pancang', 'bore pile', 'bored pile', 'sumuran', 'strauss'],
  struktur: ['sloof', 'kolom', 'balok', 'pelat lantai', 'ringbalk', 'pembesian', 'bekisting', 'pengecoran', 'struktur beton', 'tangga beton', 'dinding geser'],
  atap: ['atap', 'genteng', 'rangka atap', 'penutup atap', 'spandek', 'galvalum', 'waterproofing', 'talang'],
  finishing: ['pasangan dinding', 'dinding bata', 'plester', 'acian', 'lantai', 'keramik', 'plafon', 'partisi', 'kusen', 'pintu', 'jendela', 'pengecatan', 'cat tembok', 'granit'],
  gedung: [],
  mep: ['listrik', 'elektrikal', 'plumbing', 'sanitair', 'pompa air', 'perpipaan', 'hvac', 'instalasi air', 'hydrant', 'panel listrik'],
  sanitasi: ['septictank', 'septic tank', 'tangki septik', 'sumur resapan', 'ipal', 'kloset', 'wastafel', 'floor drain'],
  lanskap: ['pagar', 'gerbang', 'halaman', 'taman', 'carport', 'parkir', 'lanskap', 'landscape', 'dinding penahan', 'tembok penahan'],
  renovasi: ['renovasi', 'rehabilitasi', 'restorasi'],
  demolisi: ['demolisi', 'pembongkaran', 'bongkar'],
  pelabuhan: ['pelabuhan', 'dermaga', 'turap', 'breakwater', 'tetrapod'],
  olahraga: ['lapangan', 'stadion', 'futsal', 'kolam renang', 'badminton'],
  pertanian: ['kandang', 'sawah', 'greenhouse', 'kebun'],
  tanah: ['galian', 'urugan', 'timbunan', 'pemadatan', 'cut and fill', 'pekerjaan tanah'],
};

const normText = (s: string): string => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function matchesScopeKeywords(description: string, scopeId: string): boolean {
  const text = normText(description);
  if (!text) return false;
  for (const kw of SCOPE_KEYWORDS[scopeId] ?? []) {
    // 'pintu' tidak boleh mencuri 'pintu air' (irigasi) untuk finishing.
    if (kw === 'pintu' && text.includes('pintu air')) continue;
    if (text.includes(kw)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* conceptualLineScope — baris WBS konseptual → scope (aturan          */
/* berurutan; null = baris itu bukan paket pekerjaan berscope —        */
/* persiapan/survei/pembersihan/serah terima/pengujian).               */
/*                                                                     */
/* Urutan penting: 'pekerjaan luar' dicek sebelum 'drainase' (baris    */
/* "Pekerjaan luar (pagar, carport, drainase lingkungan)" adalah       */
/* lanskap, bukan drainase); 'abutment'/'gelagar'/'pilar'/'oprit'/     */
/* 'railing' dicek sebelum 'pondasi'/'struktur' (bagian jembatan,      */
/* bukan paket pondasi/struktur umum); 'elektrikal' sebelum            */
/* 'drainase' (utilitas gudang adalah MEP).                            */
/* ------------------------------------------------------------------ */

export function conceptualLineScope(line: string): string | null {
  const t = normText(line);
  if (!t) return null;
  if (t.includes('pekerjaan luar')) return 'lanskap';
  if (t.includes('persiapan') || t.includes('pematangan lahan')) return null;
  if (t.includes('survei') || t.includes('serah terima') || t.includes('pengujian')) return null;
  if (t.includes('pembersihan')) return null;
  if (t.includes('abutment') || t.includes('gelagar') || t.includes('girder') || t.includes('pilar') || t.includes('oprit') || t.includes('railing') || t.includes('rambu')) return 'jembatan';
  if (t.includes('pondasi')) return 'pondasi';
  if (t.includes('struktur')) return 'struktur';
  if (t.includes('atap')) return 'atap';
  if (t.includes('waterproofing')) return 'atap';
  if (t.includes('bongkar')) return 'demolisi';
  if (t.includes('perbaikan') || t.includes('penggantian')) return 'renovasi';
  if (t.includes('galian') || t.includes('pekerjaan tanah')) return 'tanah';
  if (t.includes('dinding') || t.includes('lantai') || t.includes('finishing') || t.includes('pintu') || t.includes('jendela') || t.includes('pengecatan') || t.includes('plester')) return 'finishing';
  if (t.includes('sanitair') || t.includes('plumbing') || t.includes('elektrikal') || t.includes('listrik') || t.includes('sirkulasi') || t.includes('filter') || t.includes('pompa') || t.includes('air minum')) return 'mep';
  if (t.includes('drainase') || t.includes('limbah')) return 'drainase';
  if (t.includes('pagar') || t.includes('sekat') || t.includes('deck')) return 'lanskap';
  if (t.includes('irigasi')) return 'irigasi';
  return null;
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

function specTextValue(spec: StructuredSpec): string {
  const v = spec.value;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.join(', ');
  return '';
}

/** Alasan supresi sistem per scope (dari spek yang menyebabkannya). */
function suppressionReason(scopeId: string, specs: StructuredSpec[]): string {
  if (scopeId === 'drainase') {
    const ds = specs.find((s) => s.key === 'road-drainage');
    const v = ds ? specTextValue(ds) : '';
    return v
      ? `Drainase tidak dibangun sebagai paket sendiri — jawaban spek drainase jalan: "${v}".`
      : 'Drainase tidak dibangun sebagai paket sendiri (supresi sistem).';
  }
  if (scopeId === 'atap') {
    return 'Atap sudah tercakup komponen template keluarga (kandang/gudang) — tidak dibuat paket atap terpisah.';
  }
  return `Paket ${SCOPE_LABELS[scopeId] ?? scopeId} disupresi sistem (bukan bagian draft ini).`;
}

function emptyNode(input: {
  scopeId: string;
  label: string;
  source: WbsNodeSource;
  familyId: string | null;
  conceptualLabel: string | null;
}): WbsArtifactNode {
  const row = scopeTaxonomyRow(input.scopeId);
  return {
    id: wbsNodeId(input.scopeId),
    scopeId: input.scopeId,
    label: input.label,
    source: input.source,
    familyId: input.familyId,
    workCategories: row ? [...row.workCategories] : [],
    dedCatalog: row?.dedCatalog ?? null,
    dedGroupCodes: row ? [...row.dedGroupCodes] : [],
    conceptualLabel: input.conceptualLabel,
    templateIds: [],
    specKeys: [],
    status: 'KOSONG',
    itemIds: [],
    classifiedItemIds: [],
  };
}

/**
 * Bangun artefak WBS dari spek terstruktur + part draft.
 *
 * Urutan node deterministik: scope part (urutan part) → scope spek
 * (urutan abjad scope) → scope konseptual (urutan baris) → scope
 * supresi tanpa node (urutan abjad scope). ID node stabil
 * (`wbs:<scopeId>`) sehingga koreksi pengguna + rujukan QTO/AHSP
 * bertahan antar-regenerasi.
 */
export function buildWbsArtifact(input: BuildWbsArtifactInput): WbsArtifact {
  const specs = latestSpecsByKey(input.specs ?? []);
  const familyId = input.familyId ?? null;
  const parts = input.parts ?? [];
  const suppressed = new Set(input.suppressedScopeIds ?? []);
  const nodes = new Map<string, WbsArtifactNode>();
  const ensure = (scopeId: string, label: string, source: WbsNodeSource, conceptualLabel: string | null): WbsArtifactNode => {
    let n = nodes.get(scopeId);
    if (!n) {
      n = emptyNode({ scopeId, label, source, familyId, conceptualLabel });
      nodes.set(scopeId, n);
    }
    return n;
  };

  /* (1) Node dari part template (scope yang benar-benar dibangun). */
  for (const part of parts) {
    const node = ensure(part.scopeId, part.scopeLabel || SCOPE_LABELS[part.scopeId] || part.scopeId, 'template', null);
    if (part.templateId && !node.templateIds.includes(part.templateId)) node.templateIds.push(part.templateId);
    for (const it of part.items ?? []) {
      if (!node.itemIds.includes(it.id)) node.itemIds.push(it.id);
    }
  }

  /* (2) Node dari spek (scope yang disebut spek tapi tak ada partnya). */
  const specKeysByScope = new Map<string, string[]>();
  for (const s of specs) {
    const scopeId = scopeForSpecKey(s.key);
    if (!scopeId) continue;
    const list = specKeysByScope.get(scopeId) ?? [];
    if (!list.includes(s.key)) list.push(s.key);
    specKeysByScope.set(scopeId, list);
  }
  for (const scopeId of [...specKeysByScope.keys()].sort()) {
    const node = ensure(scopeId, SCOPE_LABELS[scopeId] ?? scopeId, 'spek', null);
    node.specKeys = [...(specKeysByScope.get(scopeId) ?? [])];
  }
  // Spek juga ditempel ke node part (penelusuran spek → paket).
  for (const [scopeId, keys] of specKeysByScope) {
    const node = nodes.get(scopeId);
    if (node) node.specKeys = [...keys];
  }

  /* (3) Node dari WBS konseptual subkategori (bila ada). */
  const conceptualLines = conceptualWbsFor(input.subcategoryId ?? null) ?? [];
  for (const line of conceptualLines) {
    const scopeId = conceptualLineScope(line);
    if (!scopeId) continue;
    const node = ensure(scopeId, SCOPE_LABELS[scopeId] ?? scopeId, 'konseptual', line);
    if (node.source !== 'template' && node.source !== 'spek' && !node.conceptualLabel) node.conceptualLabel = line;
    if (!node.conceptualLabel) node.conceptualLabel = line;
  }

  /* (4) Supresi: node yang disupresi menjadi DIKECUALIKAN (keputusan
   * eksplisit tercatat); scope supresi tanpa node tetap dibuatkan node
   * agar keputusannya terlihat + stabil. */
  for (const scopeId of [...suppressed].sort()) {
    const node = ensure(scopeId, SCOPE_LABELS[scopeId] ?? scopeId, 'spek', null);
    node.status = 'DIKECUALIKAN';
    node.exclusion = { reason: suppressionReason(scopeId, specs), by: 'sistem' };
  }

  /* (5) Cakupan: item terklasifikasi (DED + kata kunci) untuk node
   * tanpa item milik. Katalog klasifikasi = katalog DED scope part
   * pertama (fallback 'BANGUNAN' — classifyToWbs sendiri sudah
   * fallback lintas katalog bila tak ada yang cocok). */
  const allItems: Array<{ id: string; description: string; ownerScopeId: string }> = [];
  for (const part of parts) {
    for (const it of part.items ?? []) allItems.push({ id: it.id, description: it.description, ownerScopeId: part.scopeId });
  }
  const firstRow = parts.length > 0 ? scopeTaxonomyRow(parts[0].scopeId) : null;
  const projectType = firstRow?.dedCatalog ?? 'BANGUNAN';
  for (const node of nodes.values()) {
    if (node.itemIds.length > 0) {
      // Part yang TERBANGUN menang atas supresi sistem: supresi
      // mencegah pembuatan part, jadi part yang ada + berisi item
      // berarti supresi itu basi (draft sendiri membantahnya) —
      // pengecualian sistem dibuang, status LENGKAP. Pengecualian
      // PENGGUNA tidak tersentuh di sini (diterapkan langkah 6 dan
      // tetap menang atas item milik — pengguna boleh membuang paket
      // yang sudah dibangun).
      if (node.exclusion?.by === 'sistem') delete node.exclusion;
      node.status = 'LENGKAP';
      continue;
    }
    if (node.status === 'DIKECUALIKAN') continue;
    const classified: string[] = [];
    for (const it of allItems) {
      if (it.ownerScopeId === node.scopeId) continue; // sudah milik (tak terjadi di cabang ini)
      let hit = false;
      if (node.dedGroupCodes.length > 0) {
        const cls = classifyToWbs({ name: it.description, category: '' } as never, projectType);
        const code = cls.node ? (cls.node.level === 'kelompok' ? cls.node.code : cls.node.parentCode) : undefined;
        if (code && node.dedGroupCodes.includes(code)) hit = true;
      }
      if (!hit && matchesScopeKeywords(it.description, node.scopeId)) hit = true;
      if (hit && !classified.includes(it.id)) classified.push(it.id);
    }
    node.classifiedItemIds = classified;
    node.status = classified.length > 0 ? 'TERCAKUP' : 'KOSONG';
  }
  // Node DIKECUALIKAN tetap mencatat item terklasifikasi (jejak — item
  // di dalam part lain tidak dihapus oleh supresi scope).
  for (const node of nodes.values()) {
    if (node.status !== 'DIKECUALIKAN') continue;
    const classified: string[] = [];
    for (const it of allItems) {
      if (it.ownerScopeId === node.scopeId) continue;
      let hit = false;
      if (node.dedGroupCodes.length > 0) {
        const cls = classifyToWbs({ name: it.description, category: '' } as never, projectType);
        const code = cls.node ? (cls.node.level === 'kelompok' ? cls.node.code : cls.node.parentCode) : undefined;
        if (code && node.dedGroupCodes.includes(code)) hit = true;
      }
      if (!hit && matchesScopeKeywords(it.description, node.scopeId)) hit = true;
      if (hit && !classified.includes(it.id)) classified.push(it.id);
    }
    node.classifiedItemIds = classified;
  }

  /* (6) Koreksi pengguna dari artefak sebelumnya (berkunci ID node):
   * pengecualian by-user + note dibawa; pengecualian user MENANG atas
   * status hitungan. Node yang sudah tidak ada dibuang (scope pergi). */
  const prev = input.previousArtifact ?? null;
  if (prev) {
    for (const prevNode of prev.nodes ?? []) {
      const node = nodes.get(prevNode.scopeId);
      if (!node) continue;
      if (prevNode.userCorrected) {
        node.userCorrected = true;
        if (prevNode.correctionNote) node.correctionNote = prevNode.correctionNote;
      }
      if (prevNode.exclusion?.by === 'user') {
        node.exclusion = { ...prevNode.exclusion };
        node.status = 'DIKECUALIKAN';
        node.userCorrected = true;
      }
    }
  }

  return {
    version: 1,
    familyId,
    subcategoryId: input.subcategoryId ?? null,
    templateIds: [...new Set(parts.map((p) => p.templateId).filter(Boolean))],
    nodes: [...nodes.values()],
    generatedAt: new Date().toISOString(),
  };
}

/** Cari node berdasarkan ID stabil (`wbs:<scopeId>`) atau scopeId. */
export function wbsNodeById(artifact: WbsArtifact | null | undefined, idOrScope: string): WbsArtifactNode | null {
  if (!artifact) return null;
  const id = idOrScope.startsWith('wbs:') ? idOrScope : wbsNodeId(idOrScope);
  return artifact.nodes.find((n) => n.id === id) ?? null;
}

/**
 * Koreksi pengguna: kecualikan satu node (alasan wajib — pengecualian
 * tanpa alasan tidak dicatat). Mengembalikan artefak BARU (artefak
 * lama tidak diubah); node ditandai `userCorrected` sehingga
 * regenerasi berikutnya mempertahankannya (lihat builder langkah 6).
 * Melempar bila node tidak ditemukan (kesalahan pemrograman).
 */
export function excludeWbsNode(artifact: WbsArtifact, nodeId: string, reason: string): WbsArtifact {
  const target = wbsNodeById(artifact, nodeId);
  if (!target) throw new Error(`Node WBS tidak ditemukan: ${nodeId}`);
  if (!reason || !reason.trim()) throw new Error('Alasan pengecualian wajib diisi.');
  return {
    ...artifact,
    nodes: artifact.nodes.map((n) =>
      n.id === target.id
        ? {
            ...n,
            status: 'DIKECUALIKAN' as const,
            exclusion: { reason: reason.trim(), by: 'user' as const, at: new Date().toISOString() },
            userCorrected: true,
          }
        : n,
    ),
  };
}

/**
 * Koreksi pengguna: catat note pada satu node (mis. "pakai material
 * X — sudah dikonfirmasi owner"). Note dibawa regenerasi berikutnya.
 * Melempar bila node tidak ditemukan.
 */
export function annotateWbsNode(artifact: WbsArtifact, nodeId: string, note: string): WbsArtifact {
  const target = wbsNodeById(artifact, nodeId);
  if (!target) throw new Error(`Node WBS tidak ditemukan: ${nodeId}`);
  if (!note || !note.trim()) throw new Error('Catatan koreksi wajib diisi.');
  return {
    ...artifact,
    nodes: artifact.nodes.map((n) =>
      n.id === target.id
        ? { ...n, userCorrected: true, correctionNote: note.trim() }
        : n,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* S6 (§6 FINAL INTEGRITY REPAIR, P3D-O4 + P5-O3) — pemetaan WBS      */
/* per item: kode tervalidasi + status asosiasi CONFIRMED /            */
/* PROVISIONAL / UNMAPPED.                                             */
/*                                                                     */
/* Bukti desain (probe S6 atas draft nyata, bukan asumsi):             */
/* - Item draft TIDAK membawa `wbsCode` (generasi hanya mengisi        */
/*   `code` — rabTemplateService: code = comp.wbsCode || nomor urut).  */
/*   Template katalog-180 yang dipakai buildUniversalDraft TIDAK       */
/*   mendefinisikan wbsCode komponen, sehingga `code` draft nyata      */
/*   adalah nomor urut telanjang ('1'..'11') — BUKAN kode WBS.         */
/*   Menyalin `code` ke `wbsCode` tanpa validasi = mencuci nomor urut  */
/*   menjadi kode WBS (karangan).                                      */
/* - Satu-satunya tautan WBS tervalidasi yang tersedia untuk SEMUA     */
/*   item draft adalah KEANGGOTAAN NODE ARTEFAK: item id ∈             */
/*   node.itemIds, dibangun deterministik dari scope part + template   */
/*   yang dipilih. Itulah yang divalidasi resolver di bawah.           */
/* - `classifyToWbs` TERBUKTI salah kelompok (probe: 'Pondasi Foot     */
/*   Plat Beton' → JMB-02-C/jembatan) dan selalu NEEDS_CONFIRM untuk   */
/*   kecocokan kata kunci — hasilnya hanya boleh menjadi saran         */
/*   PROVISIONAL, tidak pernah mengisi `wbsCode` dan tidak pernah      */
/*   tampil sebagai terverifikasi.                                     */
/*                                                                     */
/* Dua sumbu yang DIPISAH (jangan dicampur):                           */
/* - `wbsCode` = KODE item itu sendiri (dari sumbernya: komponen       */
/*   template / data seed) — diisi HANYA bila lolos                    */
/*   `isValidatedWbsCode`. Kode adalah identitas, bukan klaim          */
/*   pemetaan: item UNMAPPED boleh membawa kode aslinya, dan item      */
/*   CONFIRMED boleh tanpa kode (templatenya memang tak punya kode).   */
/* - status asosiasi = klaim ITEM → NODE PAKET: CONFIRMED hanya bila   */
/*   keanggotaan artefak tervalidasi; PROVISIONAL bila hanya ada       */
/*   saran heuristik; UNMAPPED bila tidak ada keduanya.                */
/* ------------------------------------------------------------------ */

/**
 * Status asosiasi item → node WBS.
 * - CONFIRMED: keanggotaan artefak tervalidasi (node ada + item id ∈
 *   node.itemIds). Satu-satunya status yang boleh tampil 'TERPETAKAN'.
 * - PROVISIONAL: tanpa keanggotaan tervalidasi, hanya saran heuristik
 *   (`classifyToWbs`) — wajib tampil 'PERLU KONFIRMASI' + label
 *   heuristik, tidak pernah sebagai terverifikasi.
 * - UNMAPPED: tanpa keduanya — tidak ada kode karangan, tidak ada
 *   node karangan; tampil 'Tidak terpetakan'.
 */
export type WbsMappingStatus = 'CONFIRMED' | 'PROVISIONAL' | 'UNMAPPED';

export function isWbsMappingStatus(value: unknown): value is WbsMappingStatus {
  return value === 'CONFIRMED' || value === 'PROVISIONAL' || value === 'UNMAPPED';
}

/** Kode kelompok/subkelompok DED yang dikenal (katalog hidup). */
const KNOWN_DED_CODES = new Set<string>();
for (const nodes of Object.values(WBS_CATALOGS)) {
  for (const n of nodes) KNOWN_DED_CODES.add(n.code);
}

/**
 * Kode WBS numerik template: minimal DUA segmen angka ('01.01', '1.1',
 * '1.1.2.1'). Satu segmen ('1') adalah nomor urut generasi, BUKAN
 * kode WBS — sengaja ditolak.
 */
const NUMERIC_WBS_CODE_RE = /^\d+(\.\d+)+$/;

/**
 * Apakah string ini kode WBS yang tervalidasi? Diterima:
 * - kode numerik dotted (≥2 segmen) — kode komponen template / seed
 *   (validasi bentuk; tidak ada registri kode numerik);
 * - kode yang ADA di katalog WBS DED hidup (kelompok maupun
 *   subkelompok — 'BGN-03', 'JLN-05-A', 'DRN-03-D').
 * Ditolak: nomor urut ('1'), kode AHSP ('B.38', '6.1.(1)'), kode
 * template sintetis ('TPL.01'), kode DED tak dikenal ('BGN-99'),
 * string kosong / bukan string.
 */
export function isValidatedWbsCode(code: unknown): code is string {
  if (typeof code !== 'string') return false;
  const c = code.trim();
  if (!c) return false;
  if (NUMERIC_WBS_CODE_RE.test(c)) return true;
  return KNOWN_DED_CODES.has(c);
}

/** Label scope untuk ID node `wbs:<scope>` (null bila scope tak dikenal / bukan string). */
export function wbsNodeLabel(nodeId: unknown): string | null {
  if (typeof nodeId !== 'string' || !nodeId.startsWith('wbs:')) return null;
  return SCOPE_LABELS[nodeId.slice(4)] ?? null;
}

export function isKnownWbsNodeId(nodeId: unknown): nodeId is string {
  return typeof nodeId === 'string' && wbsNodeLabel(nodeId) !== null;
}

export interface ResolveWbsMappingInput {
  /** ID efektif item (`templateId::id` — sama seperti `effectiveItems`). */
  itemId: string;
  description: string;
  /** Kode WBS eksplisit item (bila ada) — didahulukan bila tervalidasi. */
  wbsCode?: string | null;
  /**
   * Kode item draft (aturan generasi: comp.wbsCode || nomor urut) —
   * dipakai sebagai `wbsCode` HANYA bila lolos `isValidatedWbsCode`
   * (nomor urut '1'..'11' dan kode AHSP ditolak).
   */
  templateCode?: string | null;
  /** Scope pemilik item (part.scope.id) — null/tak dikenal = tanpa pemilik tervalidasi. */
  ownerScopeId?: string | null;
  /** Artefak WBS draft — WAJIB untuk CONFIRMED (keanggotaan divalidasi di sini). */
  artifact: WbsArtifact | null | undefined;
}

export interface WbsItemMapping {
  status: WbsMappingStatus;
  /** Kode WBS tervalidasi (bila ada) — sumbu kode, independen dari status. */
  wbsCode?: string;
  /** ID node tervalidasi — hanya bila CONFIRMED. */
  wbsNodeId?: string;
  /** Saran heuristik — hanya bila PROVISIONAL (tidak pernah tampil terverifikasi). */
  suggestedNodeId?: string;
}

/**
 * Tentukan pemetaan WBS satu item (murni, deterministik).
 *
 * - CONFIRMED: scope pemilik dikenal + artefak memuat node scope itu +
 *   item id ∈ node.itemIds. Node DIKECUALIKAN tetap CONFIRMED untuk
 *   identitasnya: pengecualian adalah keputusan kelengkapan, bukan
 *   perubahan fakta bahwa item itu berada di paket tersebut.
 * - PROVISIONAL: tanpa keanggotaan tervalidasi, `classifyToWbs`
 *   mengembalikan kelompok yang terpetakan ke scope dikenal. Saran
 *   heuristik TIDAK PERNAH mengisi `wbsCode` (kode hanya dari
 *   wbsCode/templateCode tervalidasi) dan TIDAK PERNAH menjadi
 *   CONFIRMED. Katalog klasifikasi = katalog DED node artefak pertama
 *   (pola yang sama dengan builder langkah 5), fallback 'BANGUNAN'.
 * - UNMAPPED: tidak ada keduanya — tanpa node, tanpa saran, tanpa
 *   kode karangan (wbsCode hanya bila ada kode asli tervalidasi).
 */
export function resolveWbsMapping(input: ResolveWbsMappingInput): WbsItemMapping {
  const validatedCode = [input.wbsCode, input.templateCode].find((c) => isValidatedWbsCode(c));
  const codePart = validatedCode ? { wbsCode: (validatedCode as string).trim() } : {};

  const scopeId = input.ownerScopeId ?? null;
  if (scopeId && scopeId in SCOPE_LABELS && input.artifact) {
    const node = wbsNodeById(input.artifact, scopeId);
    if (node && node.itemIds.includes(input.itemId)) {
      return { status: 'CONFIRMED', wbsNodeId: node.id, ...codePart };
    }
  }

  const projectType = input.artifact?.nodes.find((n) => n.dedCatalog)?.dedCatalog ?? 'BANGUNAN';
  const cls = classifyToWbs({ name: input.description, category: '' } as never, projectType);
  const groupCode = cls.node
    ? cls.node.level === 'kelompok'
      ? cls.node.code
      : cls.node.parentCode
    : undefined;
  const scope = groupCode ? scopeForDedGroupCode(groupCode) : null;
  if (scope) {
    return { status: 'PROVISIONAL', suggestedNodeId: wbsNodeId(scope), ...codePart };
  }

  return { status: 'UNMAPPED', ...codePart };
}
