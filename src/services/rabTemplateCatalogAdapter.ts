/**
 * Katalog 180 — Fase C: ADAPTER KANONIS TEMPLATE (jalur konsolidasi aman)
 * =====================================================================
 * EZRAB memiliki DUA sumber definisi template yang hidup berdampingan:
 *
 *  1. KATALOG RAB (kanonis untuk menu Template RAB & generate RAB):
 *     `RabTemplateService` — 180 template resmi (52 warisan + 128 katalog 180),
 *     skema `RabTemplate` (formula string dievaluasi engine deterministik).
 *
 *  2. MASTER REGISTRY (dipakai alur Chat AI / Desain):
 *     `masterBuildingTemplateRegistry` di src/data/buildingTemplates/ —
 *     7 template, skema `MasterBuildingTemplate` (quantityRule berupa FUNGSI
 *     TypeScript yang mengembalikan VolumeCalculationResult bertahap).
 *
 * File ini menyediakan lapisan baca TERPADU tanpa mengubah kedua sumber:
 *  - `findUnifiedTemplate(idOrCode)`  : cari di katalog dulu, lalu registry.
 *  - `listUnifiedTemplates()`         : daftar gabungan bertanda sumber,
 *                                       dengan penanda tumpang tindih
 *                                       (template fisik yang sama di dua dunia).
 *  - `catalogToMasterSummary(t)`      : proyeksi RINGKASAN read-only dari
 *                                       template katalog ke bentuk deskriptif
 *                                       master (untuk tampilan/pencarian).
 *
 * YANG SENGAJA TIDAK dilakukan di sini (konsolidasi tersisa — lihat laporan
 * docs/audit/TEMPLATE_CATALOG_180_REPORT.md Fase C):
 *  - Konversi eksekutabel katalog → master: quantityRule master adalah fungsi
 *    dengan CalculationTrace bertahap, sedangkan katalog memakai formula
 *    string; menerjemahkan 180 template secara otomatis akan mengarang
 *    perilaku volume. Konsumen Chat AI/Desain (file terpagari Batch Chat-to-RAB)
 *    masih membaca registry langsung dan belum dialihkan ke adapter ini —
 *    pengalihan itu memerlukan grant terpisah atas file-file tersebut.
 *  - Registry master TIDAK diperluas ke 180: ia tetap 7 template warisan
 *    sampai keputusan konsolidasi penuh diambil.
 */

import { RabTemplateService } from './rabTemplateService';
import { RabTemplate, TemplateCategory } from '../types/rabTemplate';
import { BuildingType } from '../types';
import { masterBuildingTemplateRegistry } from '../data/buildingTemplates/masterTemplateRegistry';
import { BuildingCategory, MasterBuildingTemplate } from '../data/buildingTemplates/schema/types';

export type UnifiedTemplateSource = 'CATALOG' | 'MASTER_REGISTRY';

export interface UnifiedTemplateEntry {
  id: string;
  name: string;
  source: UnifiedTemplateSource;
  /** ID padanan di sumber lain bila template fisik yang sama ada di keduanya. */
  counterpartId?: string;
  catalogTemplate?: RabTemplate;
  masterTemplate?: MasterBuildingTemplate;
}

/**
 * Pasangan tumpang tindih yang diketahui antara katalog RAB dan master
 * registry (template fisik yang sama, skema berbeda). Dipakai untuk memberi
 * tahu konsumen bahwa keduanya BUKAN template yang berbeda.
 */
const KNOWN_COUNTERPARTS: Record<string, string> = {
  // catalogId -> master code (registry menerima id maupun code, case-insensitive)
  'HOUSE-T36-1FL': 'HOUSE-T36-1FL',
  'HOUSE-T45-1FL': 'HOUSE-T45-1FL',
  'HOUSE-T70-1FL': 'HOUSE-T70-1FL',
  'HOUSE-T36-2FL': 'HOUSE-T36-2FL',
  'INFRA-ROAD-RIGID': 'INFRA-ROAD-CONCRETE',
  'SDA-DRAIN-UDITCH': 'DRAIN-UDITCH'
};

const CATEGORY_TO_BUILDING: Partial<Record<TemplateCategory, BuildingCategory>> = {
  RUMAH_TINGGAL: 'residential',
  JALAN_TRANSPORTASI: 'road',
  PERKERASAN: 'road',
  DRAINASE_SANITASI: 'drainage',
  JEMBATAN_STRUKTUR: 'bridge',
  GEDUNG: 'commercial',
  BANGUNAN_TINGGI: 'commercial',
  HOTEL_HOSPITALITY: 'commercial',
  INDUSTRI: 'commercial',
  KESEHATAN: 'public',
  PENDIDIKAN: 'public',
  SDA_IRIGASI: 'infrastructure',
  UTILITAS: 'infrastructure'
};

/** Ringkasan deskriptif template katalog dalam bentuk mendekati master. */
export interface MasterTemplateSummary {
  id: string;
  code: string;
  name: string;
  category: BuildingCategory;
  version: string;
  status: 'summary-only';
  description: string;
  parameterNames: string[];
  workItemCount: number;
  limitations: string[];
  sourceNote: string;
}

export function catalogToMasterSummary(t: RabTemplate): MasterTemplateSummary {
  return {
    id: t.id,
    code: t.id.toLowerCase(),
    name: t.name,
    category: CATEGORY_TO_BUILDING[t.category] ?? 'public',
    version: t.metadata.version,
    status: 'summary-only',
    description: t.description,
    parameterNames: (t.parameters || []).map(p => p.key),
    workItemCount: (t.components || []).length,
    limitations: [...(t.exclusions ?? [])],
    sourceNote:
      'Ringkasan read-only dari Katalog RAB (RabTemplateService). Definisi eksekutabel kanonisnya adalah formula string pada katalog — ringkasan ini TIDAK dapat dipakai untuk generate volume gaya master registry.'
  };
}

/** Daftar gabungan: katalog (180) + master registry (7), bertanda sumber. */
export function listUnifiedTemplates(): UnifiedTemplateEntry[] {
  const service = RabTemplateService.getInstance();
  const catalog = service
    .getAllTemplates()
    .filter(t => t.metadata.source === 'EZRAB_OFFICIAL');
  const masters = masterBuildingTemplateRegistry.getAllTemplates();

  const entries: UnifiedTemplateEntry[] = [];
  const matchedMasterIds = new Set<string>();

  for (const t of catalog) {
    const counterpartKey = KNOWN_COUNTERPARTS[t.id];
    const master = counterpartKey
      ? masterBuildingTemplateRegistry.getTemplateById(counterpartKey)
      : undefined;
    if (master) matchedMasterIds.add(master.id);
    entries.push({
      id: t.id,
      name: t.name,
      source: 'CATALOG',
      counterpartId: master?.id,
      catalogTemplate: t,
      masterTemplate: master
    });
  }
  for (const m of masters) {
    if (matchedMasterIds.has(m.id)) continue;
    entries.push({ id: m.id, name: m.name, source: 'MASTER_REGISTRY', masterTemplate: m });
  }
  return entries;
}

/**
 * Pemetaan kategori template katalog → `buildingType` proyek.
 *
 * Dipakai WorkspaceView saat proyek baru dibuat dari penerapan template.
 * Nilai kategori lama dipertahankan PERSIS seperti ternary historis di
 * WorkspaceView. 11 kategori Katalog 180 kini memiliki tipe proyeknya
 * sendiri (label mengikuti label kategori pada katalog) agar proyek tidak
 * lagi tercatat generik sebagai 'Custom'. Record lengkap atas
 * TemplateCategory membuat tsc menolak kategori baru yang belum dipetakan.
 *
 * Tiga kategori TETAP 'Custom' — masing-masing dengan alasan model:
 * - UTILITAS: 8 template resmi berisi pekerjaan utilitas yang heterogen
 *   (jaringan & prasarana pendukung lintas jenis bangunan); model
 *   `BuildingType` tidak memiliki tipe bangunan tunggal yang mewakili
 *   semuanya, dan pemetaan historisnya memang 'Custom'.
 * - CUSTOM: kategori penampung definisi bebas — kategorinya sendiri tidak
 *   menyatakan jenis bangunan apa pun.
 * - TEMPLATE_SAYA: template milik pengguna — asal kepemilikan, bukan
 *   klasifikasi jenis bangunan; tipe proyek tidak dapat disimpulkan.
 * Kunci oleh tes catalogBuildingType (grup 5): himpunan kategori yang
 * terpetakan ke 'Custom' harus PERSIS ketiga ini — kategori lain yang
 * jatuh ke 'Custom' berarti pemetaan hilang dan tes gagal.
 */
const TEMPLATE_CATEGORY_TO_BUILDING_TYPE: Record<TemplateCategory, BuildingType> = {
  RUMAH_TINGGAL: 'Rumah Tinggal',
  JALAN_TRANSPORTASI: 'Infrastruktur',
  PERKERASAN: 'Infrastruktur',
  SDA_IRIGASI: 'Infrastruktur',
  GEDUNG: 'Gedung Kantor',
  BANGUNAN_TINGGI: 'Gedung Kantor',
  HOTEL_HOSPITALITY: 'Hotel & Resort',
  KESEHATAN: 'Rumah Sakit / Klinik',
  PENDIDIKAN: 'Sekolah / Kampus',
  INDUSTRI: 'Gudang & Pabrik',
  LANDSCAPE_SITE: 'Landscape & Kawasan',
  MEP_SYSTEM: 'MEP & Sistem',
  RENOVASI_MAINTENANCE: 'Renovasi & Maintenance',
  UTILITAS: 'Custom',
  CUSTOM: 'Custom',
  TEMPLATE_SAYA: 'Custom',
  // --- Katalog 180: 11 kategori baru ---
  PONDASI_GEOTEKNIK: 'Pondasi & Geoteknik',
  JEMBATAN_STRUKTUR: 'Jembatan & Struktur Khusus',
  DRAINASE_SANITASI: 'Drainase & Sanitasi',
  PEKERJAAN_TANAH: 'Pekerjaan Tanah',
  STRUKTUR_BETON_BAJA: 'Struktur Beton & Baja',
  FINISHING_INTERIOR: 'Finishing & Interior',
  ATAP_WATERPROOFING: 'Atap & Waterproofing',
  PERTANIAN_PERKEBUNAN: 'Pertanian & Perkebunan',
  PELABUHAN_PESISIR: 'Pelabuhan & Pesisir',
  FASILITAS_OLAHRAGA: 'Fasilitas Olahraga',
  DEMOLISI_REKONSTRUKSI: 'Demolisi & Rekonstruksi'
};

export function templateCategoryToBuildingType(category: TemplateCategory): BuildingType {
  return TEMPLATE_CATEGORY_TO_BUILDING_TYPE[category] ?? 'Custom';
}

/** Pencarian terpadu: katalog RAB didahulukan (kanonis), lalu master registry. */
export function findUnifiedTemplate(idOrCode: string): UnifiedTemplateEntry | undefined {  const service = RabTemplateService.getInstance();
  const catalogHit = service.getTemplateById(idOrCode);
  if (catalogHit && catalogHit.metadata.source === 'EZRAB_OFFICIAL') {
    const counterpartKey = KNOWN_COUNTERPARTS[catalogHit.id];
    const master = counterpartKey
      ? masterBuildingTemplateRegistry.getTemplateById(counterpartKey)
      : undefined;
    return {
      id: catalogHit.id,
      name: catalogHit.name,
      source: 'CATALOG',
      counterpartId: master?.id,
      catalogTemplate: catalogHit,
      masterTemplate: master
    };
  }
  const masterHit = masterBuildingTemplateRegistry.getTemplateById(idOrCode);
  if (masterHit) {
    return { id: masterHit.id, name: masterHit.name, source: 'MASTER_REGISTRY', masterTemplate: masterHit };
  }
  return undefined;
}
