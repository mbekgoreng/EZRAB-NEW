/**
 * wbsGroupMapping.ts — pemetaan KANONIS antar-skema kelompok kerja (G4/G17,
 * program Universal Construction Intelligence, W3/W9 2026-11-22).
 *
 * Lima skema kelompok kerja hidup tanpa pemetaan kanonis (S2 §2.4):
 * - G katalog-180 (`builders.ts`, 17 grup) — KANONIS di sini (skema
 *   terbaru, dipakai 130 template katalog-180); tiap baris tabel ini
 *   adalah satu grup G.
 * - Legacy rumah (`rabTemplateService.buildStandardHouseComponents`,
 *   12 grup, urutan/isi beda — 02 menggabung Tanah+Pondasi, 08 = Plafon).
 * - Master registry (`WorkItemCategoryGroup`, 17 kategori
 *   `01_PERSIAPAN` … `17_PEKERJAAN_LUAR` — KOREKSI atas S2 yang menulis
 *   15: union type mendeklarasikan 17; `13_INSTALASI_AIR` dan
 *   `17_PEKERJAAN_LUAR` memang belum dipakai template mana pun, tetapi
 *   keduanya bagian dari skema).
 * - DesignSpreadsheet (`DesignSpreadsheet.tsx`, 12 kelompok).
 * - Artefak WBS (`wbsArtifact.ts`, 18 node scope `wbs:<scopeId>`).
 *
 * Kolom `scopes` DITURUNKAN DARI KATALOG (bukan karangan): untuk tiap
 * scope, template resmi (`metadata.source === 'EZRAB_OFFICIAL'`) yang
 * kategorinya masuk `SCOPE_GROUPS[scope].categories` dikumpulkan,
 * kategori komponennya dipetakan ke G (label G langsung, atau label
 * legacy lewat tabel ini), lalu dibalik menjadi grup → scope.
 * Diturunkan 2026-11-22 (183 template resmi; skrip derivasi
 * `/tmp/derive-scope-groups.mts` — tidak dikapalkan). Tes
 * `universalWbsOutput.test.ts` menurunkan ulang dari katalog hidup dan
 * gagal bila tabel ini drift (pola pin katalog yang sama dengan
 * `templateCatalog180.test.ts`).
 *
 * Keterbatasan yang didokumentasikan (bukan disembunyikan):
 * - Penggabungan/pemisahan antar-skema itu NYATA: legacy 02 (Tanah DAN
 *   Pondasi) adalah satu label untuk G02+G03; G07 (Atap & Plafon)
 *   menampung DUA label legacy (06 Atap, 08 Plafon) dan dua kategori
 *   registry (08_PLAFON, 09_ATAP). Karena itu kolom non-G berbentuk
 *   ARRAY: satu grup G dapat menampung beberapa label skema lain, dan
 *   satu label dapat muncul di beberapa baris. Lookup tunggal
 *   mengembalikan kecocokan PERTAMA (deterministik, urutan G01→G17);
 *   `groupsForCategoryLabel` mengembalikan SEMUA kecocokan.
 * - G12 (Mekanikal & HVAC), G16 (Khusus), G17 (Pembongkaran) tidak
 *   punya padanan di skema rumah/registry/spreadsheet (array kosong —
 *   jujur, bukan ditebak). G13/G14 tidak punya padanan legacy maupun
 *   spreadsheet.
 * - 115 label kategori ad-hoc di template seed (226 komponen, mis.
 *   '01. PERSIAPAN', '02. PASIR ALAS') berada DI LUAR kelima skema dan
 *   TIDAK dipetakan — memetakannya butuh keputusan taksonomi, bukan
 *   tebakan string. Lookup mengembalikan null untuk label-label itu.
 *
 * Modul ini HANYA DATA + LOOKUP: tidak mengubah skema mana pun, tidak
 * mengimpor engine/template (impor runtime hanya konstanta `G`).
 */

import { G } from '../../data/templateCatalog180/builders';
import type { UniversalScopeId } from './universalRab';

/** ID kanonis grup kerja: G01..G17 sejajar urutan skema G. */
export type WbsGroupId =
  | 'G01' | 'G02' | 'G03' | 'G04' | 'G05' | 'G06' | 'G07' | 'G08' | 'G09'
  | 'G10' | 'G11' | 'G12' | 'G13' | 'G14' | 'G15' | 'G16' | 'G17';

export interface WbsGroupMappingRow {
  /** ID kanonis grup (G01..G17). */
  id: WbsGroupId;
  /** Label kanonis skema G (nilai `G.*` builders.ts — bukan salinan ketik). */
  g: string;
  /** Label skema legacy rumah yang dipetakan ke grup ini (0..n). */
  legacy: string[];
  /** Kategori master registry (`WorkItemCategoryGroup`) untuk grup ini (0..n). */
  registry: string[];
  /** Kelompok DesignSpreadsheet untuk grup ini (0..n). */
  spreadsheet: string[];
  /**
   * Scope artefak WBS yang template resminya memakai grup ini
   * (diturunkan dari katalog — lihat header modul). Urutan =
   * urutan `SCOPE_GROUPS`.
   */
  scopes: UniversalScopeId[];
}

export const WBS_GROUP_MAP: readonly WbsGroupMappingRow[] = [
  {
    id: 'G01', g: G.PERSIAPAN,
    legacy: ['01. PEKERJAAN PERSIAPAN'],
    registry: ['01_PERSIAPAN'],
    spreadsheet: ['01 Persiapan'],
    scopes: ['jembatan', 'drainase', 'irigasi', 'pondasi', 'struktur', 'mep', 'sanitasi', 'jalan', 'gedung', 'lanskap', 'renovasi', 'demolisi', 'pelabuhan', 'olahraga', 'pertanian', 'tanah'],
  },
  {
    id: 'G02', g: G.TANAH,
    // Legacy 02 menggabung Tanah+Pondasi — label yang sama tercantum
    // juga di G03 (lihat header: penggabungan nyata, bukan duplikat).
    legacy: ['02. PEKERJAAN TANAH DAN PONDASI'],
    registry: ['02_TANAH'],
    spreadsheet: ['02 Tanah'],
    scopes: ['jembatan', 'drainase', 'irigasi', 'pondasi', 'struktur', 'mep', 'sanitasi', 'jalan', 'gedung', 'lanskap', 'demolisi', 'pelabuhan', 'olahraga', 'pertanian', 'tanah'],
  },
  {
    id: 'G03', g: G.PONDASI,
    legacy: ['02. PEKERJAAN TANAH DAN PONDASI'],
    registry: ['03_PONDASI'],
    spreadsheet: ['03 Pondasi'],
    scopes: ['jembatan', 'drainase', 'irigasi', 'pondasi', 'struktur', 'mep', 'sanitasi', 'jalan', 'gedung', 'lanskap', 'pelabuhan', 'olahraga', 'pertanian', 'tanah'],
  },
  {
    id: 'G04', g: G.STRUKTUR,
    legacy: ['03. PEKERJAAN STRUKTUR'],
    registry: ['04_STRUKTUR_BETON'],
    spreadsheet: ['04 Struktur'],
    scopes: ['jembatan', 'drainase', 'irigasi', 'pondasi', 'struktur', 'atap', 'finishing', 'mep', 'sanitasi', 'jalan', 'gedung', 'lanskap', 'renovasi', 'demolisi', 'pelabuhan', 'olahraga', 'pertanian'],
  },
  {
    id: 'G05', g: G.DINDING,
    // Plesteran/acian masuk Dinding — BUKAN Finishing: komponen
    // 'Plesteran 1SP:4PP' di katalog-180 memakai G.DINDING
    // (buildings.ts, 8+ template), dan legacy menaruh plester/aci di
    // '04. PEKERJAAN DINDING'.
    legacy: ['04. PEKERJAAN DINDING'],
    registry: ['05_DINDING', '06_PLESTERAN_ACIAN'],
    spreadsheet: ['05 Dinding'],
    scopes: ['jembatan', 'drainase', 'irigasi', 'struktur', 'finishing', 'gedung', 'renovasi', 'pelabuhan', 'olahraga', 'pertanian'],
  },
  {
    id: 'G06', g: G.LANTAI,
    legacy: ['05. PEKERJAAN LANTAI'],
    registry: ['07_LANTAI'],
    spreadsheet: ['08 Lantai'],
    scopes: ['jembatan', 'finishing', 'jalan', 'gedung', 'lanskap', 'renovasi', 'pelabuhan', 'olahraga', 'pertanian'],
  },
  {
    id: 'G07', g: G.ATAP,
    // G menggabung Atap+Plafon; legacy/registry/spreadsheet memisahnya.
    legacy: ['06. PEKERJAAN ATAP', '08. PEKERJAAN PLAFON'],
    registry: ['08_PLAFON', '09_ATAP'],
    spreadsheet: ['06 Atap', '07 Plafond'],
    scopes: ['jembatan', 'drainase', 'pondasi', 'struktur', 'atap', 'finishing', 'mep', 'sanitasi', 'gedung', 'lanskap', 'renovasi', 'olahraga', 'pertanian'],
  },
  {
    id: 'G08', g: G.KUSEN,
    legacy: ['07. PEKERJAAN KUSEN, PINTU, DAN JENDELA'],
    registry: ['10_KUSEN_PINTU_JENDELA'],
    spreadsheet: ['09 Kusen, Pintu & Jendela'],
    scopes: ['finishing', 'gedung', 'renovasi', 'pertanian'],
  },
  {
    id: 'G09', g: G.FINISHING,
    // Pengecatan masuk Finishing: komponen 'Pengecatan Interior/'
    // 'Eksterior Tembok Baru' di katalog-180 memakai G.FINISHING.
    legacy: ['11. PEKERJAAN PENGECATAN'],
    registry: ['11_PENGECATAN'],
    spreadsheet: ['12 Pengecatan & Finishing'],
    scopes: ['jembatan', 'drainase', 'irigasi', 'struktur', 'atap', 'finishing', 'gedung', 'renovasi', 'pelabuhan', 'olahraga'],
  },
  {
    id: 'G10', g: G.SANITASI,
    legacy: ['10. PEKERJAAN PLAMBING DAN SANITASI'],
    registry: ['12_SANITASI', '13_INSTALASI_AIR'],
    spreadsheet: ['11 Instalasi Air & Sanitasi'],
    scopes: ['drainase', 'finishing', 'mep', 'sanitasi', 'gedung', 'lanskap', 'renovasi', 'pertanian'],
  },
  {
    id: 'G11', g: G.ELEKTRIKAL,
    legacy: ['09. PEKERJAAN INSTALASI LISTRIK'],
    registry: ['14_INSTALASI_LISTRIK'],
    spreadsheet: ['10 Instalasi Listrik'],
    scopes: ['jembatan', 'drainase', 'irigasi', 'struktur', 'atap', 'finishing', 'mep', 'sanitasi', 'jalan', 'gedung', 'lanskap', 'renovasi', 'pelabuhan', 'olahraga', 'pertanian'],
  },
  {
    id: 'G12', g: G.MEKANIKAL,
    // Tanpa padanan di ketiga skema rumah (rumah tidak punya HVAC
    // sebagai kelompok sendiri) — kosong dengan sengaja.
    legacy: [],
    registry: [],
    spreadsheet: [],
    scopes: ['drainase', 'irigasi', 'pondasi', 'atap', 'mep', 'sanitasi', 'gedung', 'lanskap', 'olahraga', 'pertanian'],
  },
  {
    id: 'G13', g: G.PERKERASAN,
    legacy: [],
    registry: ['15_INFRASTRUKTUR_JALAN'],
    spreadsheet: [],
    scopes: ['jembatan', 'drainase', 'irigasi', 'sanitasi', 'jalan', 'lanskap', 'pelabuhan', 'olahraga', 'pertanian'],
  },
  {
    id: 'G14', g: G.DRAINASE,
    legacy: [],
    registry: ['16_DRAINASE'],
    spreadsheet: [],
    scopes: ['jembatan', 'drainase', 'irigasi', 'struktur', 'mep', 'sanitasi', 'jalan', 'gedung', 'lanskap', 'olahraga', 'pertanian', 'tanah'],
  },
  {
    id: 'G15', g: G.LANSKAP,
    legacy: ['12. PEKERJAAN TAMBAHAN EKSTERIOR'],
    registry: ['17_PEKERJAAN_LUAR'],
    spreadsheet: [],
    scopes: ['drainase', 'irigasi', 'atap', 'mep', 'sanitasi', 'jalan', 'gedung', 'lanskap', 'pelabuhan', 'olahraga', 'tanah'],
  },
  {
    id: 'G16', g: G.KHUSUS,
    // Kelompok tangkapan (catch-all) katalog-180 — tanpa padanan
    // di skema lain dengan sengaja.
    legacy: [],
    registry: [],
    spreadsheet: [],
    scopes: ['jembatan', 'drainase', 'irigasi', 'pondasi', 'atap', 'finishing', 'mep', 'sanitasi', 'jalan', 'gedung', 'renovasi', 'demolisi', 'pelabuhan', 'olahraga', 'tanah'],
  },
  {
    id: 'G17', g: G.BONGKAR,
    legacy: [],
    registry: [],
    spreadsheet: [],
    scopes: ['jembatan', 'pondasi', 'jalan', 'renovasi', 'demolisi'],
  },
];

/** Baris pemetaan untuk satu grup G (undefined bila ID tak dikenal). */
export function rowForGroup(id: WbsGroupId): WbsGroupMappingRow | undefined {
  return WBS_GROUP_MAP.find((r) => r.id === id);
}

/**
 * Semua label skema X yang dikenal (unik, urutan G01→G17) — untuk
 * validasi kelengkapan skema + tes round-trip.
 */
export function legacyGroupLabels(): string[] {
  return [...new Set(WBS_GROUP_MAP.flatMap((r) => r.legacy))];
}

export function registryCategories(): string[] {
  return [...new Set(WBS_GROUP_MAP.flatMap((r) => r.registry))];
}

export function spreadsheetGroups(): string[] {
  return [...new Set(WBS_GROUP_MAP.flatMap((r) => r.spreadsheet))];
}

/**
 * Grup kanonis untuk satu label dari skema MANA PUN (G, legacy,
 * registry, spreadsheet) — kecocokan PERTAMA dalam urutan G01→G17
 * (label gabungan legacy 02 → G02). Null bila label tidak dikenal
 * (termasuk 115 label ad-hoc template seed — di luar kelima skema).
 */
export function groupForCategoryLabel(label: string): WbsGroupId | null {
  const norm = (label ?? '').trim();
  if (!norm) return null;
  for (const row of WBS_GROUP_MAP) {
    if (row.g === norm) return row.id;
    if (row.legacy.includes(norm)) return row.id;
    if (row.registry.includes(norm)) return row.id;
    if (row.spreadsheet.includes(norm)) return row.id;
  }
  return null;
}

/** SEMUA grup yang memuat label ini (label gabungan → >1 grup). */
export function groupsForCategoryLabel(label: string): WbsGroupId[] {
  const norm = (label ?? '').trim();
  if (!norm) return [];
  const out: WbsGroupId[] = [];
  for (const row of WBS_GROUP_MAP) {
    if (
      row.g === norm ||
      row.legacy.includes(norm) ||
      row.registry.includes(norm) ||
      row.spreadsheet.includes(norm)
    ) {
      out.push(row.id);
    }
  }
  return out;
}

/** Grup kanonis untuk satu label skema legacy rumah (null bila tak dikenal). */
export function groupForLegacyLabel(label: string): WbsGroupId | null {
  const norm = (label ?? '').trim();
  if (!norm) return null;
  return WBS_GROUP_MAP.find((r) => r.legacy.includes(norm))?.id ?? null;
}

/** Grup kanonis untuk satu kategori master registry (null bila tak dikenal). */
export function groupForRegistryCategory(category: string): WbsGroupId | null {
  const norm = (category ?? '').trim();
  if (!norm) return null;
  return WBS_GROUP_MAP.find((r) => r.registry.includes(norm))?.id ?? null;
}

/** Grup kanonis untuk satu kelompok DesignSpreadsheet (G17-kecil). */
export function groupForSpreadsheetGroup(kelompok: string | null | undefined): WbsGroupId | null {
  const norm = (kelompok ?? '').trim();
  if (!norm) return null;
  return WBS_GROUP_MAP.find((r) => r.spreadsheet.includes(norm))?.id ?? null;
}

/**
 * Label G untuk satu kelompok DesignSpreadsheet (G17-kecil — dipakai
 * wiring `designToRabBridge` nanti agar `group` item desain selaras
 * dengan kategori template saat ditransfer). Null bila tak dikenal.
 */
export function gLabelForSpreadsheetGroup(kelompok: string | null | undefined): string | null {
  const id = groupForSpreadsheetGroup(kelompok);
  return id ? rowForGroup(id)?.g ?? null : null;
}

/** Scope artefak WBS yang memakai grup ini (salinan — jangan mutasi tabel). */
export function scopesForGroup(id: WbsGroupId): UniversalScopeId[] {
  return [...(rowForGroup(id)?.scopes ?? [])];
}

/** Grup G yang dipakai scope ini (balikan kolom `scopes`). */
export function groupsForScope(scopeId: UniversalScopeId): WbsGroupId[] {
  return WBS_GROUP_MAP.filter((r) => r.scopes.includes(scopeId)).map((r) => r.id);
}
