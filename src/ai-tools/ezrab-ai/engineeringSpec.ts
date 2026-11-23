/**
 * engineeringSpec.ts — GERBANG SPESIFIKASI TEKNIK & INTEGRITAS QTO
 * (EZRAB Universal Batch 3, master prompt §6 — 2026-11-23).
 *
 * Modul DAUN (pola templateSuitability / scopeDiscipline): hanya
 * type-import dari universalRab + value-import dari universalTaxonomy
 * — tanpa siklus runtime. Modul ini TIDAK menggantikan mesin apa pun:
 * - seleksi template tetap milik templateSuitability + scoreTemplate;
 * - aritmetika volume tetap milik RabTemplateService / computeQuantity
 *   / DedQtoCalculationEngine / parametricVolumeEngine;
 * - harga tetap milik resolver AHSP resmi.
 * Yang ditambahkan di sini adalah LAPISAN PENILAIAN deterministik:
 * gerbang spesifikasi teknik per kategori (§6.1), klasifikasi risiko
 * teknik (§6.2), validasi dimensional + konversi satuan (§6.3),
 * integritas rumus kuantitas (§6.4), serta traceability & cek
 * konsistensi QTO (§6.5–§6.6).
 *
 * Prinsip keras (warisan program, bukan karangan baru):
 * - TIDAK ADA nilai desain teknik yang dikarang: rentang yang dipakai
 *   gerbang berasal dari BATAS PARAMETER TEMPLATE KATALOG HIDUP
 *   (min/max param template yang dipilih), bukan dari angka SNI/AHSP
 *   yang ditempel. Bila tidak ada template, gerbang hanya menilai
 *   KELENGKAPAN field — tidak pernah menilai rentang dari tabel
 *   karangan.
 * - TIDAK ADA volume = 1.0 diam-diam yang diperkenalkan di sini:
 *   rumus yang gagal / formula yang hilang dinyatakan sebagai temuan
 *   (MISSING_FORMULA / UNRESOLVED_DEPENDENCY), bukan diisi 1.0.
 *   Perilaku volume 1.0 yang sudah ada di RabTemplateService (pin
 *   universalQto A10, keputusan owner DITUNDA) TIDAK diubah.
 * - Klasifikasi risiko TIDAK PERNAH menggantikan penilaian profesional
 *   perencana — ia hanya menandai kapan draft tidak boleh diklaim
 *   sebagai desain final dan kapan review manusia wajib.
 * - Gerbang ini TIDAK auto-koreksi kuantitas yang tidak pasti secara
 *   teknik: koreksi hanya diusulkan sebagai proposal yang butuh
 *   persetujuan eksplisit (requiresApproval: true).
 */

import type { UniversalScopeId } from './universalRab';
import type { RabTemplate } from '../../types/rabTemplate';
import type { ChatQtoTrace, VolumeSourceType } from '../../types/index';

/* ------------------------------------------------------------------ */
/* §6.1 — Profil spesifikasi teknik per kategori                       */
/* ------------------------------------------------------------------ */

/** Kategori gerbang teknik (§6.1 — contoh master prompt). */
export type EngineeringCategoryId =
  | 'residential'
  | 'road'
  | 'bridge'
  | 'retaining-wall'
  | 'electrical'
  | 'plumbing'
  | 'hvac';

/** Jenis ukuran yang dibaca gerbang dari UniversalSpec. */
export type SpecMeasureKind =
  | 'area'
  | 'length'
  | 'width'
  | 'height'
  | 'depth'
  | 'thickness'
  | 'span'
  | 'volume'
  | 'count'
  | 'floors'
  | 'power';

export interface SpecFieldDef {
  /** Kunci stabil (dipakai lintas jalur: gerbang, kuesioner, pesan). */
  key: string;
  /** Label manusiawi. */
  label: string;
  /** Jenis ukuran (menentukan pembacaan dari spek). */
  measure: SpecMeasureKind;
  /** Wajib ada agar perhitungan dapat dipercaya (bukan sekadar ada). */
  required: boolean;
  /**
   * Field rekayasa-kritis: ketiadaannya membuat draft tidak dapat
   * diklaim aman secara teknik (risiko HIGH) — mis. tinggi dinding
   * penahan (stabilitas), bentang jembatan (struktur), kedalaman
   * pondasi dalam (daya dukung). BUKAN sekadar "penting".
   */
  criticalEngineering: boolean;
  /** Catatan jujur tentang apa yang terjadi bila field ini hilang. */
  note?: string;
}

export interface FieldDependency {
  field: string;
  requires: string;
  reason: string;
}

export interface RequiredDocument {
  /** Kondisi yang memicu kebutuhan dokumen ini. */
  when: string;
  document: string;
}

export interface EngineeringSpecProfile {
  id: EngineeringCategoryId;
  label: string;
  /** Scope engine yang dipetakan ke kategori ini. */
  scopeIds: UniversalScopeId[];
  /** Subkategori intake yang dipetakan ke kategori ini. */
  subcategoryIds: string[];
  /** Field spek kategori ini (required/optional/critical-engineering). */
  fields: SpecFieldDef[];
  /**
   * Kelompok basis ukuran alternatif: SATU kelompok yang terpenuhi
   * sudah cukup sebagai basis hitung (mis. listrik: daya ATAU lantai).
   * Kelompok kosong = kategori ini tidak punya basis alternatif.
   */
  basisGroups: SpecMeasureKind[][];
  /** Dependensi antar-field (field A butuh field B). */
  dependencies: FieldDependency[];
  /** Dokumen yang wajib ada pada kondisi tertentu. */
  requiredDocuments: RequiredDocument[];
  /** Kondisi yang mewajibkan review teknik manusia. */
  reviewConditions: string[];
}

/**
 * Profil per kategori. Rentang TIDAK ditulis di sini sebagai angka —
 * rentang dibaca dari batas parameter template katalog hidup pada
 * saat evaluasi (evaluateEngineeringSpec + templateRangesFor), agar
 * gerbang tidak pernah berpegang pada tabel karangan yang bisa basi.
 * Yang ditulis di sini adalah STRUKTUR kebutuhan informasinya
 * (field apa, kritis atau bukan, dokumen apa) — mengikuti contoh §6.1
 * master prompt + field kritis W6 (criticalFieldsFor, rabIntentFlow)
 * + parameter nyata template katalog (diverifikasi 2026-11-23).
 */
export const ENGINEERING_PROFILES: Record<EngineeringCategoryId, EngineeringSpecProfile> = {
  residential: {
    id: 'residential',
    label: 'Bangunan gedung (residensial & umum)',
    scopeIds: ['gedung'],
    subcategoryIds: ['rumah', 'ruko', 'kantor', 'gudang-industri', 'sekolah', 'kos', 'apartemen', 'villa', 'hotel', 'bangunan-umum'],
    fields: [
      { key: 'area', label: 'luas bangunan (m²)', measure: 'area', required: true, criticalEngineering: false, note: 'Tanpa luas/dimensi, volume bangunan tidak dapat dihitung — gerbang ukuran sudah menolaknya (needs-spec).' },
      { key: 'dimensions', label: 'dimensi bangunan — panjang × lebar (m)', measure: 'length', required: false, criticalEngineering: false, note: 'Alternatif luas: tapak dari dimensi. Bila keduanya ada, keduanya harus konsisten (cek §6.6).' },
      { key: 'floors', label: 'jumlah lantai', measure: 'floors', required: false, criticalEngineering: false, note: 'Bila tidak disebut, asumsi 1 lantai terlabel berlaku (aturan owner yang sudah ada).' },
      { key: 'height', label: 'tinggi bangunan (m)', measure: 'height', required: false, criticalEngineering: false },
      { key: 'structure', label: 'sistem struktur (beton/baja/bata)', measure: 'count', required: false, criticalEngineering: false, note: 'Material struktur menentukan template; ketiadaannya ditandai sebagai asumsi template, bukan desain struktur. Bukan kritis di gerbang ini — partIssues sudah menandai material pada scope struktur.' },
    ],
    basisGroups: [['area'], ['length'], ['floors'], ['count']],
    dependencies: [
      { field: 'floors', requires: 'area', reason: 'Jumlah lantai tanpa luas tidak memberi volume lantai yang dapat dihitung.' },
    ],
    requiredDocuments: [
      { when: 'jumlah lantai > 10', document: 'Gambar DED + perhitungan struktur gedung bertingkat oleh perencana (template katalog bukan desain struktur final).' },
    ],
    reviewConditions: [
      'Jumlah lantai > 10 (gedung bertingkat — desain struktur & MEP khusus).',
      'Luas bangunan di luar batas template yang dipilih.',
    ],
  },
  road: {
    id: 'road',
    label: 'Jalan & perkerasan',
    scopeIds: ['jalan'],
    subcategoryIds: ['jalan', 'jalan-beton', 'jalan-aspal', 'paving'],
    fields: [
      { key: 'length', label: 'panjang jalan (m)', measure: 'length', required: true, criticalEngineering: false, note: 'Ukuran utama jalan — gerbang ukuran sudah menolak bila hilang.' },
      { key: 'width', label: 'lebar jalan (m)', measure: 'width', required: true, criticalEngineering: false, note: 'Volume perkerasan = panjang × lebar × tebal; tanpa lebar, default template yang dipakai dan ditandai sebagai asumsi.' },
      { key: 'thickness', label: 'tebal perkerasan (cm)', measure: 'thickness', required: false, criticalEngineering: false, note: 'Tanpa tebal, default template yang dipakai; tebal final butuh data CBR/lalu lintas (di luar cakupan template).' },
      { key: 'pavementType', label: 'jenis perkerasan (beton/aspal/paving)', measure: 'count', required: false, criticalEngineering: false, note: 'Material jalan menentukan template (M1 Batch 1: beton ≠ aspal); tanpa itu penskoran teks yang memutuskan. Bukan kritis di gerbang ini — M1 sudah menolak substitusi material.' },
    ],
    basisGroups: [['length'], ['area']],
    dependencies: [
      { field: 'width', requires: 'length', reason: 'Lebar tanpa panjang tidak memberi volume perkerasan.' },
    ],
    requiredDocuments: [
      { when: 'jalan di atas tanah lunak / lalu lintas berat', document: 'Data CBR tanah dasar + data lalu lintas rencana (desain tebal perkerasan final).' },
    ],
    reviewConditions: [
      'Tebal perkerasan di luar batas template yang dipilih.',
      'Panjang jalan > 5 km (pekerjaan trase besar — survei trase & drainase).',
    ],
  },
  bridge: {
    id: 'bridge',
    label: 'Jembatan',
    scopeIds: ['jembatan'],
    subcategoryIds: ['jembatan'],
    fields: [
      { key: 'span', label: 'bentang jembatan (m)', measure: 'span', required: true, criticalEngineering: true, note: 'Bentang adalah ukuran penentu struktur atas; tanpa bentang tidak ada template yang dapat dipilih secara bertanggung jawab.' },
      { key: 'width', label: 'lebar jembatan (m)', measure: 'width', required: true, criticalEngineering: false, note: 'Tanpa lebar, default template yang dipakai dan ditandai sebagai asumsi.' },
      { key: 'material', label: 'material struktur (beton/baja/kayu)', measure: 'count', required: true, criticalEngineering: true, note: 'Material menentukan keluarga template; substitusi material diam-diam DILARANG (penjaga buildDraftPart).' },
      { key: 'abutmentHeight', label: 'tinggi abutment (m)', measure: 'height', required: false, criticalEngineering: false },
    ],
    basisGroups: [['span']],
    dependencies: [
      { field: 'material', requires: 'span', reason: 'Pemilihan material girder bergantung pada bentang yang direncanakan.' },
    ],
    requiredDocuments: [
      { when: 'bentang melebihi maks template katalog sejenis materialnya', document: 'Gambar DED + perhitungan struktur jembatan oleh perencana (desain khusus, bukan template).' },
      { when: 'selalu, sebelum pelaksanaan', document: 'Gambar DED jembatan + perhitungan struktur — template katalog hanya estimasi awal, bukan desain final.' },
    ],
    reviewConditions: [
      'Bentang di luar cakupan template katalog (review wajib + desain khusus).',
      'Material struktur belum ditentukan.',
    ],
  },
  'retaining-wall': {
    id: 'retaining-wall',
    label: 'Dinding penahan tanah',
    scopeIds: ['lanskap'],
    subcategoryIds: ['dinding-penahan'],
    fields: [
      { key: 'length', label: 'panjang dinding (m)', measure: 'length', required: true, criticalEngineering: false, note: 'Ukuran utama dinding — gerbang ukuran sudah menolak bila hilang.' },
      { key: 'height', label: 'tinggi tanah yang ditahan (m)', measure: 'height', required: true, criticalEngineering: true, note: 'Stabilitas dinding (geser/guling) bergantung pada tinggi; default template 3,5 m BUKAN pengganti tinggi rencana — ketiadaannya menaikkan risiko ke HIGH.' },
      { key: 'wallType', label: 'jenis dinding (beton/batu/turap)', measure: 'count', required: false, criticalEngineering: false, note: 'Jenis menentukan template (STR-RETAINING-RC adalah beton bertulang cantilever); turap/batu butuh template lain. Bukan kritis di gerbang ini — keluarga template sudah dipilih evaluator kesesuaian.' },
    ],
    basisGroups: [['length'], ['area']],
    dependencies: [
      { field: 'height', requires: 'length', reason: 'Tinggi tanpa panjang tidak memberi volume dinding.' },
    ],
    requiredDocuments: [
      { when: 'tinggi tanah yang ditahan melebihi maks template katalog (7 m)', document: 'Perhitungan stabilitas dinding penahan (geser/guling/daya dukung) + gambar DED oleh perencana geoteknik.' },
    ],
    reviewConditions: [
      'Tinggi dinding di luar batas template katalog (maks 7 m) — desain khusus wajib.',
      'Tinggi dinding tidak disebut (default template dipakai untuk dimensi penentu stabilitas).',
    ],
  },
  electrical: {
    id: 'electrical',
    label: 'Instalasi listrik',
    scopeIds: ['mep'],
    subcategoryIds: ['listrik'],
    fields: [
      { key: 'power', label: 'daya terpasang (kVA)', measure: 'power', required: true, criticalEngineering: true, note: 'Basis ukuran utama template MEP-ELECTRICAL-DIST (installed_kva 100–5000 kVA). Luas bangunan BUKAN basis yang diterima template ini.' },
      { key: 'floors', label: 'jumlah lantai yang dilayani', measure: 'floors', required: false, criticalEngineering: false, note: 'Basis alternatif yang diterima template (num_floors 2–40).' },
      { key: 'points', label: 'jumlah titik instalasi', measure: 'count', required: false, criticalEngineering: false, note: 'TIDAK ada template listrik katalog berbasis titik — titik saja tidak dapat dihitung (needs-spec jujur, B2 §6).' },
    ],
    basisGroups: [['power'], ['floors']],
    dependencies: [],
    requiredDocuments: [
      { when: 'daya di luar batas template katalog (100–5000 kVA)', document: 'Perhitungan beban listrik + single-line diagram oleh perencana elektrikal.' },
    ],
    reviewConditions: [
      'Daya terpasang di luar batas template katalog.',
      'Daya tidak disebut (basis lantai dipakai — kapasitas panel mengikuti default template).',
    ],
  },
  plumbing: {
    id: 'plumbing',
    label: 'Plumbing & air bersih',
    scopeIds: ['mep'],
    subcategoryIds: ['plumbing'],
    fields: [
      { key: 'floors', label: 'jumlah lantai yang dilayani', measure: 'floors', required: true, criticalEngineering: false, note: 'Basis ukuran utama template MEP-PLUMBING-TOWER (num_floors 3–40).' },
      { key: 'units', label: 'jumlah unit hunian/ruang basah setara', measure: 'count', required: false, criticalEngineering: false, note: 'Basis alternatif yang diterima template (num_units 10–600).' },
      { key: 'length', label: 'panjang jaringan pipa (m)', measure: 'length', required: false, criticalEngineering: false, note: 'TIDAK ada template plumbing katalog berbasis panjang pipa — panjang saja tidak dapat dihitung.' },
    ],
    basisGroups: [['floors'], ['count']],
    dependencies: [],
    requiredDocuments: [
      { when: 'jumlah lantai di luar batas template katalog (3–40)', document: 'Perhitungan hidrolika jaringan (tekanan riser, sizing pompa) oleh perencana plumbing.' },
    ],
    reviewConditions: [
      'Jumlah lantai di luar batas template katalog.',
    ],
  },
  hvac: {
    id: 'hvac',
    label: 'AC & tata udara (HVAC)',
    scopeIds: ['mep'],
    subcategoryIds: ['hvac'],
    fields: [
      { key: 'area', label: 'luas area ber-AC (m²)', measure: 'area', required: true, criticalEngineering: false, note: 'Basis ukuran template MEP-HVAC-VRF (ac_area 200–20000 m²).' },
      { key: 'indoorUnits', label: 'jumlah unit indoor', measure: 'count', required: false, criticalEngineering: false, note: 'Tanpa jumlah unit, default template yang dipakai dan ditandai sebagai asumsi.' },
      { key: 'capacity', label: 'kapasitas total (PK)', measure: 'count', required: false, criticalEngineering: false, note: 'Kapasitas pendingin adalah hasil perhitungan beban — TIDAK PERNAH diturunkan diam-diam dari luas; default template dipakai dengan label asumsi + kondisi review.' },
    ],
    basisGroups: [['area']],
    dependencies: [
      { field: 'capacity', requires: 'area', reason: 'Kapasitas tanpa luas area tidak dapat dikaitkan ke beban ruangan.' },
    ],
    requiredDocuments: [
      { when: 'luas area ber-AC di luar batas template katalog (200–20000 m²)', document: 'Perhitungan beban pendingin (cooling load) oleh perencana mekanikal.' },
    ],
    reviewConditions: [
      'Luas area ber-AC di luar batas template katalog.',
      'Kapasitas (PK) tidak disebut (default template dipakai — bukan hasil hitung beban).',
    ],
  },
};

export function engineeringProfileFor(id: EngineeringCategoryId): EngineeringSpecProfile {
  return ENGINEERING_PROFILES[id];
}

/* ------------------------------------------------------------------ */
/* Resolusi kategori dari scope / template / subkategori               */
/* ------------------------------------------------------------------ */

/** Template MEP → subsistem gerbang (ID template katalog, bukan tebak). */
const MEP_TEMPLATE_SUBSYSTEM: Record<string, EngineeringCategoryId> = {
  'MEP-ELECTRICAL-DIST': 'electrical',
  'MEP-PLUMBING-TOWER': 'plumbing',
  'MEP-HVAC-VRF': 'hvac',
};

/**
 * Kategori gerbang untuk satu part: dari scope dulu, lalu dipersempit
 * template (MEP) atau subkategori intake (dinding penahan di scope
 * lanskap). null = gerbang tidak berlaku untuk part ini (mis. sumur
 * bor UTIL-* di scope mep — bukan subsistem MEP §6.1; atau scope di
 * luar ketujuh kategori — gerbang diam, bukan mengarang kategori).
 */
export function engineeringCategoryFor(
  scopeId: UniversalScopeId,
  opts?: { templateId?: string | null; subcategoryId?: string | null },
): EngineeringCategoryId | null {
  if (scopeId === 'mep') {
    if (opts?.templateId && MEP_TEMPLATE_SUBSYSTEM[opts.templateId]) {
      return MEP_TEMPLATE_SUBSYSTEM[opts.templateId];
    }
    const sub = opts?.subcategoryId;
    if (sub === 'listrik') return 'electrical';
    if (sub === 'plumbing') return 'plumbing';
    if (sub === 'hvac') return 'hvac';
    return null;
  }
  if (scopeId === 'lanskap') {
    // Hanya dinding penahan yang punya profil §6.1 di scope lanskap;
    // pagar/taman/parkir bukan kategori gerbang — gerbang diam.
    // Dideteksi dari template (STR-RETAINING-RC) ATAU subkategori —
    // subkategori primer tidak dapat diandalkan per-part pada draft
    // campuran (primernya milik cakupan lain).
    if (opts?.templateId && /retaining/i.test(opts.templateId)) return 'retaining-wall';
    if (opts?.subcategoryId === 'dinding-penahan') return 'retaining-wall';
    return null;
  }
  if (scopeId === 'gedung') return 'residential';
  if (scopeId === 'jalan') return 'road';
  if (scopeId === 'jembatan') return 'bridge';
  return null;
}

/** Kategori gerbang dari subkategori intake (dipakai jalur kuesioner). */
export function engineeringCategoryForSubcategory(
  subcategoryId: string | null,
): EngineeringCategoryId | null {
  if (!subcategoryId) return null;
  for (const p of Object.values(ENGINEERING_PROFILES)) {
    if (p.subcategoryIds.includes(subcategoryId)) return p.id;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* §6.1 — Evaluasi gerbang                                             */
/* ------------------------------------------------------------------ */

/**
 * Input spek gerbang — SUBSET STRUKTURAL UniversalSpec (bukan impor
 * nilai): pemanggil meneruskan UniversalSpec (atau spek per-scope)
 * apa adanya; field yang tidak ada dibaca sebagai tidak disebut.
 */
export interface EngineeringSpecInput {
  rawText?: string | null;
  areaM2?: number | null;
  lengthM?: number | null;
  widthM?: number | null;
  heightM?: number | null;
  depthM?: number | null;
  thicknessCm?: number | null;
  spanM?: number | null;
  volumeM3?: number | null;
  count?: number | null;
  floors?: number | null;
  powerKva?: number | null;
  buildingLengthM?: number | null;
  buildingWidthM?: number | null;
  footprintM2?: number | null;
  materialKeywords?: string[];
}

/** Nilai spek untuk satu jenis ukuran (cermin specValueFor kanonis). */
export function specMeasureValue(spec: EngineeringSpecInput, kind: SpecMeasureKind): number | null {
  switch (kind) {
    case 'area': return spec.areaM2 ?? spec.footprintM2 ?? null;
    case 'length': return spec.lengthM ?? spec.buildingLengthM ?? null;
    case 'width': return spec.widthM ?? spec.buildingWidthM ?? null;
    case 'height': return spec.heightM ?? null;
    case 'depth': return spec.depthM ?? null;
    case 'thickness': return spec.thicknessCm ?? null;
    case 'span': return spec.spanM ?? null;
    case 'volume': return spec.volumeM3 ?? null;
    case 'count': return spec.count ?? null;
    case 'floors': return spec.floors ?? null;
    case 'power': return spec.powerKva ?? null;
    default: return null;
  }
}

/**
 * Klasifikasi parameter template → jenis ukuran. CERMIN LOKAL
 * classifyParam kanonis (universalRab.ts) — pola yang sama dengan
 * templateSuitability/specChain/scopeDiscipline ("jaga tetap sinkron"):
 * modul daun ini tidak boleh mengimpor nilai dari universalRab (siklus
 * runtime). Hanya jenis yang dipakai gerbang yang dicerminkan.
 */
type GateParamKind = 'span' | 'depth' | 'length' | 'width' | 'area' | 'thickness' | 'floors' | 'height' | 'volume' | 'count' | 'power' | 'other';

function classifyParamLocal(key: string, label: string): GateParamKind {
  const s = `${key} ${label}`.toLowerCase();
  if (/span|bentang/.test(s)) return 'span';
  if (/depth|kedalaman/.test(s)) return 'depth';
  if (/length|panjang|lintasan/.test(s)) return 'length';
  if (/width|lebar/.test(s)) return 'width';
  if (/\barea\b|luas/.test(s)) return 'area';
  if (/thickness|tebal/.test(s)) return 'thickness';
  if (/floor|lantai/.test(s)) return 'floors';
  if (/height|tinggi/.test(s)) return 'height';
  if (/volume/.test(s)) return 'volume';
  if (/kva/.test(s)) return 'power';
  if (/count|jumlah|num_|sel|unit_count/.test(s)) return 'count';
  return 'other';
}

/** Satu batas parameter template (min/max katalog hidup). */
export interface TemplateRange {
  key: string;
  label: string;
  kind: GateParamKind;
  min: number | undefined;
  max: number | undefined;
  unit: string | undefined;
  defaultValue: number | undefined;
}

/**
 * Rentang yang DIDUKUNG template — dibaca dari parameter NUMBER
 * template ITU (katalog hidup), bukan dari tabel karangan. Tanpa
 * template, gerbang tidak menilai rentang sama sekali.
 */
export function templateRangesFor(template: RabTemplate | null | undefined): TemplateRange[] {
  if (!template) return [];
  const out: TemplateRange[] = [];
  for (const p of template.parameters ?? []) {
    if (p.type !== 'NUMBER') continue;
    out.push({
      key: p.key,
      label: p.label,
      kind: classifyParamLocal(p.key, p.label),
      min: p.min,
      max: p.max,
      unit: p.unit,
      defaultValue: typeof p.defaultValue === 'number' ? p.defaultValue : undefined,
    });
  }
  return out;
}

export type EngineeringVerdict =
  | 'CALCULABLE'            // dapat dihitung dari template + spek yang ada
  | 'NEEDS_CLARIFICATION'   // dapat dihitung sesudah klarifikasi (field wajib hilang)
  | 'REQUIRES_ENGINEERING_DESIGN' // butuh desain perencana (di luar cakupan template)
  | 'UNSUPPORTED';          // kategori tidak didukung jalur hitung apa pun

/** Satu field spek yang hilang — kunci stabil + label manusiawi. */
export interface MissingField {
  key: string;
  label: string;
}

export interface EngineeringGateResult {
  category: EngineeringCategoryId;
  verdict: EngineeringVerdict;
  /**
   * Apakah verdict ini MEMBLOKIR pembuatan draft di buildDraftPart.
   * NEEDS_CLARIFICATION selalu blocking; REQUIRES_ENGINEERING_DESIGN
   * blocking hanya bila perilaku pemblokiran itu SUDAH ADA di jalur
   * kanonis (bentang jembatan — penjaga B1/buildDraftPart) atau
   * diputuskan eksplisit di sini (tinggi dinding penahan > maks
   * template — dimensi penentu stabilitas). Pelajaran B1 (D1 dihapus):
   * penolakan keras berbasis rentang yang luas merusak golden — karena
   * itu blocking dibatasi pada dimensi rekayasa-kritis yang terdaftar
   * di sini, bukan semua nilai di luar batas.
   */
  blocking: boolean;
  /** Field wajib yang hilang (label manusiawi, untuk missingSpecs). */
  missingRequired: MissingField[];
  /** Field rekayasa-kritis yang hilang (subset yang menaikkan risiko). */
  missingCritical: MissingField[];
  /** Field opsional yang hilang (mempengaruhi akurasi, bukan blokir). */
  missingOptional: MissingField[];
  /** Nilai di luar batas parameter template (dari katalog hidup). */
  outOfRange: string[];
  /** Kondisi review teknik yang terpicu. */
  reviewConditions: string[];
  /** Dokumen yang wajib ada pada kondisi saat ini. */
  documentsRequired: string[];
  /** Asumsi yang dipakai gerbang (dicatat transparan, bukan disembunyikan). */
  assumptions: string[];
  explanation: string;
}

function measureLabel(kind: SpecMeasureKind): string {
  switch (kind) {
    case 'area': return 'luas';
    case 'length': return 'panjang';
    case 'width': return 'lebar';
    case 'height': return 'tinggi';
    case 'depth': return 'kedalaman';
    case 'thickness': return 'tebal';
    case 'span': return 'bentang';
    case 'volume': return 'volume';
    case 'count': return 'jumlah';
    case 'floors': return 'jumlah lantai';
    case 'power': return 'daya (kVA)';
    default: return kind;
  }
}

/**
 * Evaluasi gerbang spesifikasi teknik untuk satu kategori + spek.
 * Deterministik & murni (tanpa I/O). Template opsional: bila diberikan,
 * rentang dinilai dari batas parameternya; bila tidak, hanya
 * kelengkapan field yang dinilai.
 *
 * Aturan verdict (urutan = prioritas):
 *  1. Basis ukuran tidak ada sama sekali (tidak satu pun kelompok basis
 *     terpenuhi) → NEEDS_CLARIFICATION (blocking).
 *  2. Dimensi rekayasa-kritis di luar batas template (bentang jembatan,
 *     tinggi dinding penahan) → REQUIRES_ENGINEERING_DESIGN (blocking).
 *  3. Field wajib hilang tetapi basis ada → NEEDS_CLARIFICATION hanya
 *     bila field itu tidak punya default template yang jujur; bila
 *     default template ada, verdict tetap CALCULABLE dengan field itu
 *     dicatat di missingRequired + risiko naik (lihat §6.2).
 *     Pengecualian: material jembatan hilang → CALCULABLE (partIssues
 *     sudah memblokir transfernya — gerbang tidak menduplikasi blokir).
 *  4. Selain itu CALCULABLE.
 */
export function evaluateEngineeringSpec(
  category: EngineeringCategoryId,
  spec: EngineeringSpecInput,
  template?: RabTemplate | null,
): EngineeringGateResult {
  const profile = ENGINEERING_PROFILES[category];
  const missingRequired: MissingField[] = [];
  const missingCritical: MissingField[] = [];
  const missingOptional: MissingField[] = [];
  const outOfRange: string[] = [];
  const reviewConditions: string[] = [];
  const documentsRequired: string[] = [];
  const assumptions: string[] = [];

  // --- Kelengkapan field (material dibaca dari kata kunci teks) ---
  const rawLower = (spec.rawText ?? '').toLowerCase();
  const hasMaterial = (words: string[]): boolean =>
    words.some((w) => (spec.materialKeywords ?? []).includes(w) || rawLower.includes(w));
  for (const f of profile.fields) {
    // Field non-ukuran (material/jenis/struktur/kapasitas) tidak dibaca
    // dari angka spek: material jembatan/struktural dari kata kunci;
    // yang lain dinyatakan tidak-disebut bila teks tidak menyebutnya.
    let present: boolean;
    if (f.key === 'material') {
      present = hasMaterial(['beton', 'baja', 'kayu']);
    } else if (f.key === 'pavementType') {
      present = hasMaterial(['beton', 'aspal', 'paving', 'hotmix']);
    } else if (f.key === 'wallType') {
      present = hasMaterial(['beton', 'batu', 'turap']);
    } else if (f.key === 'structure') {
      present = hasMaterial(['beton', 'baja', 'bata']);
    } else if (f.key === 'capacity' || f.key === 'indoorUnits' || f.key === 'units' || f.key === 'points') {
      // Jumlah turunan (PK / unit indoor / ruang basah / titik) tidak
      // dibaca dari spec.count generik — count generik milik ukuran
      // utama (unit bangunan / titik pondasi), bukan kapasitas MEP.
      // Ketiadaannya dicatat sebagai hilang (default template berlaku).
      present = false;
      if (f.key === 'units' || f.key === 'points') {
        present = spec.count != null;
      }
    } else {
      present = specMeasureValue(spec, f.measure) != null;
    }
    if (!present) {
      const entry: MissingField = { key: f.key, label: f.label };
      if (f.required) missingRequired.push(entry);
      else missingOptional.push(entry);
      if (f.criticalEngineering) missingCritical.push(entry);
    }
  }

  // --- Basis ukuran: satu kelompok basis harus terpenuhi ---
  const basisSatisfied = profile.basisGroups.length === 0 ||
    profile.basisGroups.some((group) =>
      group.every((kind) => specMeasureValue(spec, kind) != null),
    );

  // --- Rentang dari batas parameter template (katalog hidup) ---
  const ranges = templateRangesFor(template ?? null);
  const rangeByKind = new Map<GateParamKind, TemplateRange>();
  for (const r of ranges) {
    if (!rangeByKind.has(r.kind)) rangeByKind.set(r.kind, r);
  }
  const kindOfMeasure: Record<SpecMeasureKind, GateParamKind> = {
    area: 'area', length: 'length', width: 'width', height: 'height',
    depth: 'depth', thickness: 'thickness', span: 'span', volume: 'volume',
    count: 'count', floors: 'floors', power: 'power',
  };
  for (const kind of Object.keys(kindOfMeasure) as SpecMeasureKind[]) {
    const v = specMeasureValue(spec, kind);
    if (v == null) continue;
    const r = rangeByKind.get(kindOfMeasure[kind]);
    if (!r) continue;
    // Tebal: spek dalam cm, parameter bisa meter/mm — konversi yang
    // sama dengan specValueForParam kanonis (cm→m /100, cm→mm /10).
    let compared = v;
    if (kind === 'thickness') {
      const unit = (r.unit ?? '').toLowerCase();
      if (unit === 'm') compared = v / 100;
      else if (unit === 'mm') compared = v / 10;
    }
    if ((r.min !== undefined && compared < r.min) || (r.max !== undefined && compared > r.max)) {
      outOfRange.push(
        `${r.label} = ${compared}${r.unit ? ` ${r.unit}` : ''} di luar batas template (${r.min !== undefined ? r.min : '–'}–${r.max !== undefined ? r.max : '–'}${r.unit ? ` ${r.unit}` : ''})`,
      );
    }
  }

  // --- Verdict ---
  let verdict: EngineeringVerdict = 'CALCULABLE';
  let blocking = false;
  let explanation = '';
  if (!basisSatisfied) {
    verdict = 'NEEDS_CLARIFICATION';
    blocking = true;
    const basisLabels = profile.basisGroups
      .map((g) => g.map(measureLabel).join(' + '))
      .join(' ATAU ');
    explanation =
      `Untuk ${profile.label} saya belum bisa menghitung secara bertanggung jawab — ` +
      `basis ukuran yang diterima template belum disebut (${basisLabels}).`;
  } else {
    // Dimensi rekayasa-kritis di luar batas template → desain khusus.
    // Bentang jembatan: penjaga B1/buildDraftPart sudah memblokirnya —
    // gerbang menegaskan verdict yang sama (konsisten, bukan aturan baru).
    // Tinggi dinding penahan: dimensi penentu stabilitas; di atas maks
    // template (7 m) struktur cantilever template tidak berlaku.
    const spanRange = rangeByKind.get('span');
    const spanV = specMeasureValue(spec, 'span');
    const heightRange = category === 'retaining-wall' ? rangeByKind.get('height') : undefined;
    const heightV = category === 'retaining-wall' ? specMeasureValue(spec, 'height') : null;
    const spanBeyond = spanRange && spanV != null && spanRange.max !== undefined && spanV > spanRange.max;
    const heightBeyond = heightRange && heightV != null && heightRange.max !== undefined && heightV > heightRange.max;
    if (spanBeyond || heightBeyond) {
      verdict = 'REQUIRES_ENGINEERING_DESIGN';
      blocking = true;
      if (spanBeyond) {
        explanation =
          `Bentang ${spanV} m di luar cakupan template katalog (maks ${spanRange!.max} m) — ` +
          `jembatan bentang ini butuh desain struktur khusus oleh perencana, bukan template umum.`;
        documentsRequired.push(
          'Gambar DED + perhitungan struktur jembatan oleh perencana (desain khusus, bukan template).',
        );
      } else {
        explanation =
          `Tinggi tanah yang ditahan ${heightV} m di luar cakupan template dinding penahan katalog (maks ${heightRange!.max} m) — ` +
          `dinding setinggi ini butuh perhitungan stabilitas + desain khusus oleh perencana geoteknik.`;
        documentsRequired.push(
          'Perhitungan stabilitas dinding penahan (geser/guling/daya dukung) + gambar DED oleh perencana geoteknik.',
        );
      }
      reviewConditions.push(...profile.reviewConditions);
    } else {
      explanation = `Spesifikasi ${profile.label} cukup untuk estimasi awal dari template` +
        (missingRequired.length > 0
          ? ` — dengan catatan: ${missingRequired.map((m) => m.label).join('; ')} belum disebut (ditandai di peringatan/asumsi, bukan diisi diam-diam).`
          : '.');
      // Kondisi review yang terpicu pada draft CALCULABLE.
      if (category === 'residential' && spec.floors != null && spec.floors > 10) {
        reviewConditions.push('Jumlah lantai > 10 (gedung bertingkat — desain struktur & MEP khusus).');
        documentsRequired.push('Gambar DED + perhitungan struktur gedung bertingkat oleh perencana (template katalog bukan desain struktur final).');
      }
      if (category === 'retaining-wall' && specMeasureValue(spec, 'height') == null) {
        reviewConditions.push('Tinggi dinding tidak disebut (default template dipakai untuk dimensi penentu stabilitas).');
      }
      if (category === 'electrical' && specMeasureValue(spec, 'power') == null) {
        reviewConditions.push('Daya tidak disebut (basis lantai dipakai — kapasitas panel mengikuti default template).');
      }
      if (category === 'hvac') {
        reviewConditions.push('Kapasitas (PK) tidak disebut (default template dipakai — bukan hasil hitung beban).');
      }
      // Asumsi default template — HANYA untuk field UKURAN (field
      // non-ukuran seperti material/jenis tidak punya "default"
      // parameter; tanpa guard ini field material bisa memungut
      // default param count yang tidak berhubungan).
      const NON_MEASURE_KEYS = new Set(['material', 'pavementType', 'wallType', 'structure', 'capacity', 'indoorUnits']);
      for (const f of profile.fields) {
        if (NON_MEASURE_KEYS.has(f.key)) continue;
        if (!f.required || specMeasureValue(spec, f.measure) != null) continue;
        const range = rangeByKind.get(kindOfMeasure[f.measure]);
        if (range?.defaultValue !== undefined) {
          assumptions.push(`${f.label} memakai default template (${range.defaultValue}${range.unit ? ` ${range.unit}` : ''}).`);
        }
      }
    }
  }

  return {
    category,
    verdict,
    blocking,
    missingRequired,
    missingCritical,
    missingOptional,
    outOfRange,
    reviewConditions,
    documentsRequired,
    assumptions,
    explanation,
  };
}

/* ------------------------------------------------------------------ */
/* §6.2 — Klasifikasi risiko teknik                                    */
/* ------------------------------------------------------------------ */

export type EngineeringRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface EngineeringRiskAssessment {
  level: EngineeringRiskLevel;
  /** Apakah draft boleh dibuat (CRITICAL yang blocking → false). */
  canDraft: boolean;
  /** Apakah asumsi berlabel masih diizinkan pada level ini. */
  assumptionsPermitted: boolean;
  assumptionsNote: string;
  /** Apakah peringatan teknik wajib tampil pada draft. */
  warningMandatory: boolean;
  warningText: string | null;
  /** Apakah review manusia wajib sebelum transfer/kontrak. */
  humanReviewRequired: boolean;
  /** Klaim yang BOLEH dibuat sistem pada level ini. */
  claims: string;
  reasons: string[];
}

/**
 * Klasifikasi risiko dari hasil gerbang. Deterministik; TIDAK PERNAH
 * menggantikan penilaian profesional — level ini hanya mengatur apa
 * yang boleh diklaim sistem dan gerbang apa yang berlaku:
 * - LOW: semua field wajib+kritis ada, dalam batas → draft biasa.
 * - MODERATE: field wajib non-kritis hilang / di luar batas non-kritis
 *   / kondisi review terpicu → draft + asumsi berlabel, tanpa
 *   peringatan wajib.
 * - HIGH: field rekayasa-kritis hilang (tinggi dinding penahan, daya
 *   listrik, material jembatan) → draft BOLEH dibuat (kebijakan
 *   draft-first dipertahankan) TETAPI peringatan teknik WAJIB tampil,
 *   asumsi dibatasi pada default non-struktural berlabel, dan review
 *   manusia WAJIB sebelum transfer.
 * - CRITICAL: verdict REQUIRES_ENGINEERING_DESIGN / UNSUPPORTED →
 *   draft TIDAK BOLEH dibuat dari template (bila blocking) atau
 *   dibuat hanya sebagai estimasi kasar berlabel dengan peringatan
 *   keras (bila non-blocking — saat ini tidak ada kasus non-blocking).
 */
export function classifyEngineeringRisk(gate: EngineeringGateResult): EngineeringRiskAssessment {
  const reasons: string[] = [];
  if (gate.verdict === 'REQUIRES_ENGINEERING_DESIGN' || gate.verdict === 'UNSUPPORTED') {
    return {
      level: 'CRITICAL',
      canDraft: !gate.blocking,
      assumptionsPermitted: false,
      assumptionsNote: 'Tidak ada asumsi yang diizinkan — perhitungan template tidak berlaku untuk kasus ini.',
      warningMandatory: true,
      warningText: gate.explanation,
      humanReviewRequired: true,
      claims: 'Sistem TIDAK BOLEH mengklaim estimasi ini sebagai RAB jadi — butuh desain perencana.',
      reasons: [gate.explanation],
    };
  }
  if (gate.verdict === 'NEEDS_CLARIFICATION') {
    return {
      level: 'HIGH',
      canDraft: false,
      assumptionsPermitted: false,
      assumptionsNote: 'Basis ukuran belum ada — tidak ada angka yang boleh diasumsikan sebagai basis hitung.',
      warningMandatory: true,
      warningText: gate.explanation,
      humanReviewRequired: false,
      claims: 'Sistem hanya boleh meminta klarifikasi — tidak boleh membuat draft.',
      reasons: [gate.explanation],
    };
  }
  const criticalLabels = gate.missingCritical.map((m) => m.label);
  if (criticalLabels.length > 0) {
    reasons.push(`Field rekayasa-kritis belum disebut: ${criticalLabels.join('; ')}.`);
    const criticalOutOfRange = gate.outOfRange.filter((o) =>
      /bentang|tinggi tanah|kedalaman|daya/i.test(o),
    );
    if (criticalOutOfRange.length > 0) reasons.push(`Nilai kritis di luar batas: ${criticalOutOfRange.join('; ')}.`);
    return {
      level: 'HIGH',
      canDraft: true,
      assumptionsPermitted: true,
      assumptionsNote: 'Asumsi hanya untuk default non-struktural berlabel — default TIDAK BOLEH menggantikan field rekayasa-kritis yang hilang.',
      warningMandatory: true,
      warningText:
        `PERINGATAN TEKNIK (${ENGINEERING_PROFILES[gate.category].label}): ${criticalLabels.join('; ')} belum disebut — ` +
        `draft ini memakai default template untuk dimensi penentu teknik dan BUKAN desain final. Lengkapi lewat revisi dan minta review perencana sebelum dipakai sebagai dasar kontrak.`,
      humanReviewRequired: true,
      claims: 'Estimasi awal dari template — bukan desain final, bukan dasar kontrak.',
      reasons,
    };
  }
  if (gate.missingRequired.length > 0 || gate.outOfRange.length > 0 || gate.reviewConditions.length > 0) {
    if (gate.missingRequired.length > 0) reasons.push(`Field wajib belum disebut: ${gate.missingRequired.map((m) => m.label).join('; ')}.`);
    if (gate.outOfRange.length > 0) reasons.push(`Nilai di luar batas template: ${gate.outOfRange.join('; ')}.`);
    if (gate.reviewConditions.length > 0) reasons.push(`Kondisi review: ${gate.reviewConditions.join('; ')}.`);
    return {
      level: 'MODERATE',
      canDraft: true,
      assumptionsPermitted: true,
      assumptionsNote: 'Asumsi berlabel diizinkan (default template dicatat terbuka).',
      warningMandatory: false,
      warningText: null,
      humanReviewRequired: false,
      claims: 'Estimasi awal dengan asumsi berlabel.',
      reasons,
    };
  }
  return {
    level: 'LOW',
    canDraft: true,
    assumptionsPermitted: true,
    assumptionsNote: 'Asumsi berlabel diizinkan.',
    warningMandatory: false,
    warningText: null,
    humanReviewRequired: false,
    claims: 'Estimasi awal dari template (spesifikasi lengkap).',
    reasons: ['Semua field wajib dan rekayasa-kritis ada dan dalam batas template.'],
  };
}

/** Bentuk struktural minimal draft untuk penilaian on-demand. */
export interface EngineeringDraftLike {
  spec: EngineeringSpecInput & { scopes?: Array<{ id: UniversalScopeId }> };
  parts: Array<{
    scope: { id: UniversalScopeId; label: string };
    template: RabTemplate;
  }>;
}

export interface DraftEngineeringAssessment {
  /** Level tertinggi di antara semua part. */
  level: EngineeringRiskLevel;
  canDraft: boolean;
  humanReviewRequired: boolean;
  perPart: Array<{
    scopeId: string;
    scopeLabel: string;
    templateId: string;
    category: EngineeringCategoryId | null;
    level: EngineeringRiskLevel;
    verdict: EngineeringVerdict | null;
    warningText: string | null;
  }>;
}

/**
 * Penilaian risiko satu draft (on-demand, murni — TIDAK disimpan di
 * draft dan TIDAK dibawa persistence; pemanggil menghitung ulang dari
 * draft + spek yang sama dan selalu mendapat hasil yang sama).
 * Kategori part MEP ditentukan dari template; dinding penahan dari
 * nama template (STR-RETAINING-RC) karena scope-nya lanskap.
 */
export function assessDraftEngineering(draft: EngineeringDraftLike): DraftEngineeringAssessment {
  const order: Record<EngineeringRiskLevel, number> = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };
  let top: EngineeringRiskLevel = 'LOW';
  let canDraft = true;
  let humanReviewRequired = false;
  const perPart: DraftEngineeringAssessment['perPart'] = [];
  for (const part of draft.parts) {
    const isRetaining = /retaining|penahan/i.test(part.template.id + ' ' + part.template.name);
    const category = engineeringCategoryFor(part.scope.id, {
      templateId: part.template.id,
      subcategoryId: isRetaining ? 'dinding-penahan' : null,
    });
    if (!category) {
      perPart.push({
        scopeId: part.scope.id, scopeLabel: part.scope.label, templateId: part.template.id,
        category: null, level: 'LOW', verdict: null, warningText: null,
      });
      continue;
    }
    const gate = evaluateEngineeringSpec(category, draft.spec, part.template);
    const risk = classifyEngineeringRisk(gate);
    if (order[risk.level] > order[top]) top = risk.level;
    if (!risk.canDraft) canDraft = false;
    if (risk.humanReviewRequired) humanReviewRequired = true;
    perPart.push({
      scopeId: part.scope.id, scopeLabel: part.scope.label, templateId: part.template.id,
      category, level: risk.level, verdict: gate.verdict, warningText: risk.warningText,
    });
  }
  return { level: top, canDraft, humanReviewRequired, perPart };
}

/* ------------------------------------------------------------------ */
/* Basis ukuran MEP per subsistem (dipakai questionDefsFor)            */
/*                                                                     */
/* Jawaban B3 atas catatan B1 §9.8: kuesioner MEP menanyakan LUAS      */
/* sebagai kritis untuk SEMUA subsistem, padahal template listrik/     */
/* plumbing TIDAK menerima luas sebagai basis (B1 D4). Basis di bawah  */
/* dibaca dari parameter nyata template katalog (diverifikasi          */
/* 2026-11-23):                                                        */
/* - listrik (MEP-ELECTRICAL-DIST): installed_kva + num_floors.       */
/* - plumbing (MEP-PLUMBING-TOWER): num_floors + num_units.           */
/* - hvac (MEP-HVAC-VRF): ac_area.                                    */
/* - fire (MEP-FIRE-PROTECTION): building_area + num_floors.          */
/* - data (MEP-DATA-NETWORK): num_points + num_floors.                */
/* ------------------------------------------------------------------ */

export interface MepBasis {
  subsystem: string;
  label: string;
  /** Kunci pertanyaan percakapan kritis (memakai kunci kuesioner yang
   *  sama bila ada — pola bridge-span: satu kunci, tanpa tanya ganda). */
  criticalQuestionKey: string;
  criticalPrompt: string;
  /** Basis ukuran yang diterima template subsistem ini. */
  satisfiedBy: SpecMeasureKind[];
}

export function mepBasisFor(subcategoryId: string | null): MepBasis {
  switch (subcategoryId) {
    case 'listrik':
      return {
        subsystem: 'listrik',
        label: 'Instalasi listrik',
        criticalQuestionKey: 'mep-power-capacity',
        criticalPrompt: 'Berapa **daya listrik terpasang** yang dibutuhkan (kVA)? Bila belum tahu dayanya, sebutkan jumlah lantainya — daya menentukan ukuran panel & trafo, luas saja tidak dapat menghitung instalasi listrik.',
        satisfiedBy: ['power', 'floors'],
      };
    case 'plumbing':
      return {
        subsystem: 'plumbing',
        label: 'Plumbing & air bersih',
        criticalQuestionKey: 'mep-floors',
        criticalPrompt: 'Bangunannya **berapa lantai**, atau ada berapa **unit basah** (kamar mandi/dapur)? Jumlah lantai/unit itu yang menjadi basis perhitungan jaringan pipanya — luas saja tidak dapat menghitung plumbing.',
        satisfiedBy: ['floors', 'count'],
      };
    case 'hvac':
      return {
        subsystem: 'hvac',
        label: 'AC / tata udara (HVAC)',
        criticalQuestionKey: 'mep-area',
        criticalPrompt: 'Berapa **luas area ber-AC**-nya (m²)? Luas itu yang menjadi basis perhitungan jumlah unit indoor dan kapasitasnya.',
        satisfiedBy: ['area'],
      };
    case 'fire-protection':
      return {
        subsystem: 'fire-protection',
        label: 'Proteksi kebakaran',
        criticalQuestionKey: 'mep-area',
        criticalPrompt: 'Berapa **luas bangunan yang dilindungi** (m²)? Luas itu yang menjadi basis perhitungan jaringan sprinkler & hydrant.',
        satisfiedBy: ['area', 'floors'],
      };
    case 'komunikasi-data':
      return {
        subsystem: 'komunikasi-data',
        label: 'Sistem komunikasi & data',
        criticalQuestionKey: 'mep-points',
        criticalPrompt: 'Berapa **jumlah titik data**-nya? Jumlah titik itu yang menjadi basis perhitungan jaringan kabel & rak distribusi.',
        satisfiedBy: ['count', 'floors'],
      };
    default:
      return {
        subsystem: 'mep-umum',
        label: 'MEP terpadu',
        criticalQuestionKey: 'mep-area',
        criticalPrompt: 'Berapa **luas bangunan/proyek** yang dilayani instalasi ini? Luas itu yang menjadi basis perhitungan jumlah titik dan panjang instalasinya.',
        satisfiedBy: ['area', 'floors', 'count', 'power'],
      };
  }
}

/* ------------------------------------------------------------------ */
/* §6.3 — Validasi dimensional + konversi satuan                       */
/*                                                                     */
/* Whitelist konversi ini adalah SATU-SATUNYA jalur konversi yang      */
/* diizinkan modul ini. Satuan di luar daftar → DITOLAK eksplisit      */
/* (error, bukan tebakan). Aturan ini cermin dari tiga tempat kanonis  */
/* yang sudah ada dan TIDAK diubah: quantity.ts (detectLengthUnitFactor*/
/* — tanpa penanda eksplisit = unresolved), dedQtoCalculationEngine    */
/* (dimensionToMeters — satuan tak dikenal = null → tolak), dan        */
/* rabNeeds.validatePhysicalDimensions (angka ≤ 0 = masalah).          */
/* ------------------------------------------------------------------ */

/** Dimensi fisik yang dikenal validator (satuan SI + satuan RAB lazim). */
export type DimensionKind =
  | 'length' | 'width' | 'height' | 'depth' | 'thickness'
  | 'area' | 'volume' | 'weight' | 'count' | 'span' | 'slope' | 'angle';

export interface DimensionSet {
  lengthM?: number | null;
  widthM?: number | null;
  heightM?: number | null;
  depthM?: number | null;
  /** Tebal dalam METER (satuan kanonis validator; cm dikonversi dulu). */
  thicknessM?: number | null;
  areaM2?: number | null;
  volumeM3?: number | null;
  weightKg?: number | null;
  count?: number | null;
  spanM?: number | null;
  /** Kemiringan dalam persen (0–100+; >100% ditandai, bukan ditolak). */
  slopePct?: number | null;
  /** Sudut dalam derajat (0–360; kemiringan atap lazim 0–90). */
  angleDeg?: number | null;
}

export interface DimensionFinding {
  code: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  field: string;
  message: string;
}

/** Faktor konversi ke satuan kanonis per keluarga satuan. */
const LENGTH_TO_M: Record<string, number> = {
  m: 1, meter: 1, meters: 1, km: 1000, kilometer: 1000,
  cm: 0.01, centimeter: 0.01, mm: 0.001, milimeter: 0.001, m1: 1,
};
const AREA_TO_M2: Record<string, number> = {
  m2: 1, 'm²': 1, 'meter persegi': 1, ha: 10000, hektar: 10000, are: 100,
};
const VOLUME_TO_M3: Record<string, number> = {
  m3: 1, 'm³': 1, l: 0.001, liter: 0.001, literan: 0.001,
};
const WEIGHT_TO_KG: Record<string, number> = {
  kg: 1, kilogram: 1, ton: 1000, kwintal: 100, kuintal: 100, g: 0.001, gram: 0.001,
};
const COUNT_UNITS = new Set([
  'unit', 'bh', 'buah', 'set', 'titik', 'batang', 'btg', 'pcs', 'lbr', 'lembar',
  'rol', 'dus', 'paket', 'ekor', 'pintu', 'jendela', 'ruang', 'kamar',
]);

/** Keluarga satuan satu token (null = tidak dikenal whitelist). */
export type UnitFamily = 'length' | 'area' | 'volume' | 'weight' | 'count';

export function unitFamilyOf(rawUnit: string): UnitFamily | null {
  const u = (rawUnit ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (u in LENGTH_TO_M) return 'length';
  if (u in AREA_TO_M2) return 'area';
  if (u in VOLUME_TO_M3) return 'volume';
  if (u in WEIGHT_TO_KG) return 'weight';
  if (COUNT_UNITS.has(u)) return 'count';
  return null;
}

export type ConversionResult =
  | { ok: true; value: number; from: string; to: string; provenance: string }
  | { ok: false; error: string };

/**
 * Konversi satuan dengan provenance eksplisit. Hanya dalam SATU
 * keluarga (panjang↔panjang, dst.) — konversi lintas keluarga
 * (m → m²) DITOLAK: itu bukan konversi, melainkan rumus dimensi yang
 * butuh validasi formula (§6.3). Satuan tak dikenal DITOLAK, tidak
 * pernah ditebak.
 */
export function convertUnit(value: number, fromRaw: string, toRaw: string): ConversionResult {
  const from = (fromRaw ?? '').toLowerCase().trim();
  const to = (toRaw ?? '').toLowerCase().trim();
  if (!Number.isFinite(value)) {
    return { ok: false, error: `Nilai "${String(value)}" bukan angka yang valid — konversi dibatalkan.` };
  }
  const famFrom = unitFamilyOf(from);
  const famTo = unitFamilyOf(to);
  if (famFrom == null) {
    return { ok: false, error: `Satuan asal "${fromRaw}" tidak dikenal whitelist konversi (m/mm/cm/km, m², m³/L, kg/ton, unit/titik/m1) — nilai tidak dikonversi dan tidak ditebak.` };
  }
  if (famTo == null) {
    return { ok: false, error: `Satuan tujuan "${toRaw}" tidak dikenal whitelist konversi — nilai tidak dikonversi dan tidak ditebak.` };
  }
  if (famFrom !== famTo) {
    return { ok: false, error: `Konversi lintas keluarga ditolak: "${fromRaw}" (${famFrom}) → "${toRaw}" (${famTo}) bukan konversi satuan, melainkan rumus dimensi yang butuh validasi formula.` };
  }
  if (famFrom === 'count') {
    if (from !== to) {
      return { ok: false, error: `Satuan hitung "${fromRaw}" → "${toRaw}" tidak dapat dikonversi (1 ${from} ≠ 1 ${to} tanpa definisi konversi) — nilai tidak dikonversi.` };
    }
    return { ok: true, value, from, to, provenance: `${value} ${from} (satuan hitung, tanpa konversi)` };
  }
  const table = famFrom === 'length' ? LENGTH_TO_M
    : famFrom === 'area' ? AREA_TO_M2
    : famFrom === 'volume' ? VOLUME_TO_M3
    : WEIGHT_TO_KG;
  const canonical = value * (table[from] ?? 1);
  const converted = canonical / (table[to] ?? 1);
  return {
    ok: true,
    value: Math.round(converted * 1e9) / 1e9,
    from,
    to,
    provenance: `${value} ${from} → ${Math.round(converted * 1e9) / 1e9} ${to} [konversi ${from}→${to}]`,
  };
}

export type DimensionParseResultB3 =
  | { ok: true; valueM: number; unit: string; provenance: string }
  | { ok: false; error: string; ambiguousUnit: boolean };

/**
 * Parse satu dimensi ber-satuan ("1200 mm", "1,5 m", "2 km") ke meter.
 * Tanpa penanda satuan eksplisit → DITOLAK sebagai ambigu (cermin
 * quantity.ts: jangan asumsikan meter). Satuan tak dikenal → ditolak.
 * Nilai ≤ 0 → ditolak.
 */
export function parseDimensionWithUnit(text: string): DimensionParseResultB3 {
  const t = (text ?? '').trim().toLowerCase();
  const m = t.match(/^(-?\d+(?:[.,]\d+)?)\s*([a-z²³]+)?$/);
  if (!m) {
    return { ok: false, error: `Dimensi "${text}" tidak dapat diparse (bukan angka + satuan).`, ambiguousUnit: false };
  }
  const rawNum = m[1].includes(',')
    ? m[1].replace(/\./g, '').replace(',', '.')
    : m[1].replace(/\.(?=\d{3}(\D|$))/g, '');
  const v = Number(rawNum);
  if (!Number.isFinite(v)) {
    return { ok: false, error: `Angka "${m[1]}" pada dimensi "${text}" bukan angka yang valid.`, ambiguousUnit: false };
  }
  const unit = m[2] ?? '';
  if (unit === '') {
    return { ok: false, error: `Dimensi "${text}" tanpa satuan — satuan tidak diasumsikan (perlu m/cm/mm eksplisit).`, ambiguousUnit: true };
  }
  if (unitFamilyOf(unit) !== 'length') {
    return { ok: false, error: `Satuan "${unit}" pada dimensi "${text}" bukan satuan panjang yang dikenal (m/mm/cm/km).`, ambiguousUnit: false };
  }
  if (!(v > 0)) {
    return { ok: false, error: `Dimensi "${text}" tidak valid: nilai harus lebih dari 0.`, ambiguousUnit: false };
  }
  const conv = convertUnit(v, unit, 'm');
  if (!conv.ok) return { ok: false, error: conv.error, ambiguousUnit: false };
  return { ok: true, valueM: conv.value, unit, provenance: conv.provenance };
}

/**
 * Validasi deterministik satu set dimensi. TIDAK PERNAH mengoreksi
 * nilai — hanya melaporkan temuan. Aturan:
 * - setiap dimensi yang ada harus berhingga & > 0 (ERROR bila tidak);
 * - tebal tidak boleh melebihi tinggi/kedalaman elemen yang sama
 *   (WARNING — kemungkinan salah satuan cm↔m);
 * - bentang tidak boleh kurang dari lebar elemen yang sama (WARNING);
 * - luas yang dinyatakan harus konsisten dengan panjang × lebar bila
 *   ketiganya ada (selisih > 1% → ERROR);
 * - volume yang dinyatakan harus konsisten dengan luas × tebal atau
 *   panjang × lebar × tinggi/kedalaman bila semua ada (selisih > 1%
 *   → ERROR);
 * - kemiringan > 100% (45°) ditandai WARNING (bukan ditolak — talud
 *   curam memang ada); sudut di luar 0–360° → ERROR;
 * - jumlah (count) harus bilangan bulat ≥ 0 (WARNING bila pecahan).
 */
export function validateDimensions(dims: DimensionSet): DimensionFinding[] {
  const out: DimensionFinding[] = [];
  const fields: Array<[string, number | null | undefined, string]> = [
    ['lengthM', dims.lengthM, 'panjang'],
    ['widthM', dims.widthM, 'lebar'],
    ['heightM', dims.heightM, 'tinggi'],
    ['depthM', dims.depthM, 'kedalaman'],
    ['thicknessM', dims.thicknessM, 'tebal'],
    ['areaM2', dims.areaM2, 'luas'],
    ['volumeM3', dims.volumeM3, 'volume'],
    ['weightKg', dims.weightKg, 'berat'],
    ['spanM', dims.spanM, 'bentang'],
  ];
  for (const [key, v, label] of fields) {
    if (v == null) continue;
    if (!Number.isFinite(v)) {
      out.push({ code: 'NON_FINITE', severity: 'ERROR', field: key, message: `${label} bukan angka yang valid (${String(v)}).` });
    } else if (!(v > 0)) {
      out.push({ code: 'NON_POSITIVE', severity: 'ERROR', field: key, message: `${label} = ${v} tidak valid: dimensi fisik harus lebih dari 0.` });
    }
  }
  if (dims.count != null) {
    if (!Number.isFinite(dims.count)) {
      out.push({ code: 'NON_FINITE', severity: 'ERROR', field: 'count', message: `Jumlah bukan angka yang valid (${String(dims.count)}).` });
    } else if (dims.count < 0) {
      out.push({ code: 'NON_POSITIVE', severity: 'ERROR', field: 'count', message: `Jumlah = ${dims.count} tidak valid: jumlah tidak boleh negatif.` });
    } else if (!Number.isInteger(dims.count)) {
      out.push({ code: 'FRACTIONAL_COUNT', severity: 'WARNING', field: 'count', message: `Jumlah = ${dims.count} bukan bilangan bulat — jumlah elemen lazimnya bulat; periksa apakah ini memang pecahan yang sah.` });
    }
  }
  if (dims.slopePct != null) {
    if (!Number.isFinite(dims.slopePct) || dims.slopePct < 0) {
      out.push({ code: 'INVALID_SLOPE', severity: 'ERROR', field: 'slopePct', message: `Kemiringan = ${String(dims.slopePct)}% tidak valid: kemiringan tidak boleh negatif.` });
    } else if (dims.slopePct > 100) {
      out.push({ code: 'STEEP_SLOPE', severity: 'WARNING', field: 'slopePct', message: `Kemiringan ${dims.slopePct}% (> 45°) sangat curam — periksa apakah satuannya persen atau derajat.` });
    }
  }
  if (dims.angleDeg != null) {
    if (!Number.isFinite(dims.angleDeg) || dims.angleDeg < 0 || dims.angleDeg > 360) {
      out.push({ code: 'INVALID_ANGLE', severity: 'ERROR', field: 'angleDeg', message: `Sudut = ${String(dims.angleDeg)}° di luar rentang 0–360°.` });
    } else if (dims.angleDeg > 90) {
      out.push({ code: 'OBTUSE_ANGLE', severity: 'INFO', field: 'angleDeg', message: `Sudut ${dims.angleDeg}° tumpul (> 90°) — pastikan ini sudut yang dimaksud, bukan kemiringan atap (lazim 0–90°).` });
    }
  }
  // Tebal vs tinggi/kedalaman: tebal yang melebihi dimensi elemennya
  // hampir pasti selip satuan (cm dibaca meter).
  if (dims.thicknessM != null && dims.thicknessM > 0) {
    const host = dims.heightM ?? dims.depthM;
    if (host != null && host > 0 && dims.thicknessM > host) {
      out.push({ code: 'THICKNESS_EXCEEDS_HOST', severity: 'WARNING', field: 'thicknessM', message: `Tebal ${dims.thicknessM} m melebihi tinggi/kedalaman elemen ${host} m — kemungkinan salah satuan (cm dibaca sebagai m).` });
    }
  }
  // Bentang vs lebar.
  if (dims.spanM != null && dims.widthM != null && dims.spanM > 0 && dims.widthM > 0 && dims.spanM < dims.widthM) {
    out.push({ code: 'SPAN_LESS_THAN_WIDTH', severity: 'WARNING', field: 'spanM', message: `Bentang ${dims.spanM} m lebih kecil dari lebar ${dims.widthM} m — periksa apakah kedua angka tertukar.` });
  }
  // Konsistensi luas: L×W vs luas yang dinyatakan.
  if (dims.lengthM != null && dims.widthM != null && dims.areaM2 != null &&
      dims.lengthM > 0 && dims.widthM > 0 && dims.areaM2 > 0) {
    const expected = dims.lengthM * dims.widthM;
    const diff = Math.abs(dims.areaM2 - expected) / expected;
    if (diff > 0.01) {
      out.push({ code: 'AREA_INCONSISTENT', severity: 'ERROR', field: 'areaM2', message: `Luas yang dinyatakan ${dims.areaM2} m² tidak konsisten dengan panjang × lebar (${dims.lengthM} × ${dims.widthM} = ${Math.round(expected * 100) / 100} m²; selisih ${(diff * 100).toFixed(1)}%).` });
    }
  }
  // Konsistensi volume: L×W×H/D atau luas×tebal vs volume dinyatakan.
  if (dims.volumeM3 != null && dims.volumeM3 > 0) {
    let expected: number | null = null;
    let basis = '';
    if (dims.lengthM != null && dims.widthM != null && dims.heightM != null &&
        dims.lengthM > 0 && dims.widthM > 0 && dims.heightM > 0) {
      expected = dims.lengthM * dims.widthM * dims.heightM;
      basis = `panjang × lebar × tinggi (${dims.lengthM}×${dims.widthM}×${dims.heightM})`;
    } else if (dims.lengthM != null && dims.widthM != null && dims.depthM != null &&
        dims.lengthM > 0 && dims.widthM > 0 && dims.depthM > 0) {
      expected = dims.lengthM * dims.widthM * dims.depthM;
      basis = `panjang × lebar × kedalaman (${dims.lengthM}×${dims.widthM}×${dims.depthM})`;
    } else if (dims.areaM2 != null && dims.thicknessM != null && dims.areaM2 > 0 && dims.thicknessM > 0) {
      expected = dims.areaM2 * dims.thicknessM;
      basis = `luas × tebal (${dims.areaM2}×${dims.thicknessM})`;
    }
    if (expected != null) {
      const diff = Math.abs(dims.volumeM3 - expected) / expected;
      if (diff > 0.01) {
        out.push({ code: 'VOLUME_INCONSISTENT', severity: 'ERROR', field: 'volumeM3', message: `Volume yang dinyatakan ${dims.volumeM3} m³ tidak konsisten dengan ${basis} = ${Math.round(expected * 1000) / 1000} m³ (selisih ${(diff * 100).toFixed(1)}%).` });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Registry rumus dimensional (§6.3/§6.4) — SATU-SATUNYA perkalian    */
/* dimensi yang diizinkan validator. Rumus di luar registry TIDAK      */
/* PERNAH dievaluasi diam-diam: pemanggil harus mendaftarkan rumus     */
/* baru dengan tanda tangan dimensinya (atau memakai jalur template,   */
/* yang rumusnya tercatat di ChatQtoTrace).                            */
/* ------------------------------------------------------------------ */

export type DimensionSignature = 'L' | 'L2' | 'L3' | 'M' | 'N' | 'L3/M' | 'NONE';

export interface FormulaDef {
  id: string;
  expression: string;
  version: string;
  /** Tanda tangan tiap input (L = panjang, L2 = luas, L3 = volume, M = massa, N = cacah). */
  inputs: Record<string, DimensionSignature>;
  output: DimensionSignature;
  outputUnit: string;
}

export const FORMULA_REGISTRY: Record<string, FormulaDef> = {
  'VOL-LWH': { id: 'VOL-LWH', expression: 'length × width × height', version: '1.0', inputs: { length: 'L', width: 'L', height: 'L' }, output: 'L3', outputUnit: 'm³' },
  'VOL-LWD': { id: 'VOL-LWD', expression: 'length × width × depth', version: '1.0', inputs: { length: 'L', width: 'L', depth: 'L' }, output: 'L3', outputUnit: 'm³' },
  'VOL-AREA-T': { id: 'VOL-AREA-T', expression: 'area × thickness', version: '1.0', inputs: { area: 'L2', thickness: 'L' }, output: 'L3', outputUnit: 'm³' },
  'AREA-LW': { id: 'AREA-LW', expression: 'length × width', version: '1.0', inputs: { length: 'L', width: 'L' }, output: 'L2', outputUnit: 'm²' },
  'AREA-LH': { id: 'AREA-LH', expression: 'length × height', version: '1.0', inputs: { length: 'L', height: 'L' }, output: 'L2', outputUnit: 'm²' },
  'LEN-L': { id: 'LEN-L', expression: 'length', version: '1.0', inputs: { length: 'L' }, output: 'L', outputUnit: 'm' },
  'WGT-VOL-RATIO': { id: 'WGT-VOL-RATIO', expression: 'volume × ratioKgPerM3', version: '1.0', inputs: { volume: 'L3', ratioKgPerM3: 'L3/M' }, output: 'M', outputUnit: 'kg' },
  'COUNT-N': { id: 'COUNT-N', expression: 'count', version: '1.0', inputs: { count: 'N' }, output: 'N', outputUnit: 'unit' },
};

/** Tanda tangan dimensional satu satuan (null = satuan tak dikenal). */
export function signatureOfUnit(rawUnit: string): DimensionSignature | null {
  const fam = unitFamilyOf(rawUnit);
  if (fam === 'length') return 'L';
  if (fam === 'area') return 'L2';
  if (fam === 'volume') return 'L3';
  if (fam === 'weight') return 'M';
  if (fam === 'count') return 'N';
  return null;
}

export type FormulaDimensionCheck =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validasi dimensional rumus: input yang diberikan HARUS cocok tanda
 * tangannya dengan registry. Perkalian dimensi yang tidak kompatibel
 * (mis. luas × luas, atau panjang × berat tanpa rasio) DITOLAK —
 * tidak pernah dievaluasi. Rumus tak terdaftar DITOLAK (pemanggil
 * harus mendaftarkannya dulu, atau memakai jalur template).
 */
export function validateFormulaDimensions(
  formulaId: string,
  inputs: Record<string, { value: number; unit: string }>,
): FormulaDimensionCheck {
  const def = FORMULA_REGISTRY[formulaId];
  if (!def) {
    return { ok: false, error: `Rumus "${formulaId}" tidak terdaftar di registry rumus — perkalian dimensi tidak dievaluasi tanpa definisi rumus yang sah.` };
  }
  for (const [name, sig] of Object.entries(def.inputs)) {
    const given = inputs[name];
    if (!given) {
      return { ok: false, error: `Rumus ${formulaId} butuh input "${name}" (${sig}) — input hilang, rumus tidak dievaluasi.` };
    }
    if (!Number.isFinite(given.value) || !(given.value > 0)) {
      return { ok: false, error: `Input "${name}" rumus ${formulaId} = ${String(given.value)} tidak valid (harus angka > 0).` };
    }
    // Rasio kg/m³ membawa satuan gabungan — diterima apa adanya bila
    // labelnya menyatakan kg/m³ (bukan satuan whitelist tunggal).
    if (sig === 'L3/M') {
      const u = (given.unit ?? '').toLowerCase().replace(/\s+/g, '');
      if (u !== 'kg/m3' && u !== 'kg/m³') {
        return { ok: false, error: `Input "${name}" rumus ${formulaId} harus bersatuan kg/m³, bukan "${given.unit}".` };
      }
      continue;
    }
    const got = signatureOfUnit(given.unit);
    if (got == null) {
      return { ok: false, error: `Satuan input "${name}" ("${given.unit}") tidak dikenal — rumus ${formulaId} tidak dievaluasi.` };
    }
    if (got !== sig) {
      return { ok: false, error: `Dimensi input "${name}" tidak cocok untuk rumus ${formulaId}: butuh ${sig}, dapat ${got} ("${given.unit}") — perkalian dimensi yang tidak kompatibel ditolak.` };
    }
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* §6.4 — Integritas rumus kuantitas                                   */
/*                                                                     */
/* QuantityRecord adalah CATATAN AUDIT kuantitas, bukan mesin hitung   */
/* baru: nilainya SELALU berasal dari mesin kanonis (template engine,  */
/* computeQuantity, DedQtoCalculationEngine, atau input manual         */
/* pengguna). Record ini hanya memastikan setiap kuantitas membawa     */
/* rumus + input + satuan + sumber + status asumsi/validasi sehingga   */
/* dapat direproduksi (§6.5).                                          */
/* ------------------------------------------------------------------ */

export type QuantitySourceKind =
  | 'USER_DIMENSION'
  | 'CALCULATOR'
  | 'TEMPLATE'
  | 'ASSUMPTION'
  | 'DOCUMENT_EXTRACTION'
  | 'MANUAL_INPUT';

export type AssumptionStatus = 'NONE' | 'LABELED_ASSUMPTION' | 'UNLABELED_ASSUMPTION';
export type QuantityValidationStatus = 'VALID' | 'NEEDS_REVIEW' | 'INVALID' | 'UNVALIDATED';

/** Kebijakan pembulatan yang dipakai mesin kanonis (string terdokumentasi). */
export type RoundingPolicy =
  | 'exact'                  // tanpa pembulatan (computeQuantity)
  | 'round-2dp'              // 2 desimal (luas DED)
  | 'round-3dp'              // 3 desimal (volume DED)
  | 'template-2dp-min-0.01'; // template engine: 2 desimal, lantai 0,01

export interface QuantityInput {
  name: string;
  value: number;
  unit: string;
  source: QuantitySourceKind;
}

export interface ManualOverrideEntry {
  previousValue: number | null;
  newValue: number;
  reason: string;
  /** Urutan append-only (1, 2, 3, …) — riwayat tidak pernah dihapus. */
  sequence: number;
}

export interface QuantityRecord {
  formulaId: string;
  formulaExpression: string | null;
  formulaVersion: string;
  inputs: QuantityInput[];
  outputUnit: string;
  result: number | null;
  roundingPolicy: RoundingPolicy;
  sourceComponentId: string | null;
  quantitySource: QuantitySourceKind;
  assumptionStatus: AssumptionStatus;
  validationStatus: QuantityValidationStatus;
  /** Riwayat override manual (append-only; kosong = belum pernah di-override). */
  manualOverrideHistory: ManualOverrideEntry[];
}

/**
 * Pemetaan VolumeSourceType kanonis (types/index.ts) → sumber §6.4.
 * 'IMPORT' (impor spreadsheet) dipetakan ke MANUAL_INPUT — impor
 * adalah angka yang dimasukkan manusia lewat berkas, bukan ekstraksi
 * dokumen DED (DOCUMENT_EXTRACTION hanya untuk jejak DED).
 */
export function mapVolumeSource(source: VolumeSourceType | string | null | undefined): QuantitySourceKind {
  switch (source) {
    case 'CALCULATOR': return 'CALCULATOR';
    case 'MANUAL':
    case 'MANUAL_OVERRIDE':
    case 'IMPORT': return 'MANUAL_INPUT';
    case 'AI_GENERATED': return 'ASSUMPTION';
    default: return 'TEMPLATE';
  }
}

/** Pembulatan kanonis per kebijakan (cermin mesin kanonis — tanpa ubah). */
export function applyRoundingPolicy(value: number, policy: RoundingPolicy): number {
  if (policy === 'exact') return value;
  if (policy === 'round-2dp') return Math.round(value * 100) / 100;
  if (policy === 'round-3dp') return Math.round(value * 1000) / 1000;
  // template-2dp-min-0.01: SafeDecimalEngine.safeRound + lantai 0,01
  // (rabTemplateService.ts — nilai tak-nol tidak pernah menjadi 0).
  return Math.max(0.01, Math.round(value * 100) / 100);
}

export interface QuantityRecordInput {
  formulaId?: string;
  formulaExpression?: string | null;
  formulaVersion?: string;
  inputs: QuantityInput[];
  outputUnit: string;
  result: number | null;
  roundingPolicy?: RoundingPolicy;
  sourceComponentId?: string | null;
  quantitySource: QuantitySourceKind;
  assumptionStatus?: AssumptionStatus;
  validationStatus?: QuantityValidationStatus;
}

/** Bangun record kuantitas dari input yang sudah tervalidasi pemanggil. */
export function buildQuantityRecord(input: QuantityRecordInput): QuantityRecord {
  return {
    formulaId: input.formulaId ?? 'TPL-RULE',
    formulaExpression: input.formulaExpression ?? null,
    formulaVersion: input.formulaVersion ?? '1.0',
    inputs: input.inputs.map((i) => ({ ...i })),
    outputUnit: input.outputUnit,
    result: input.result,
    roundingPolicy: input.roundingPolicy ?? 'exact',
    sourceComponentId: input.sourceComponentId ?? null,
    quantitySource: input.quantitySource,
    assumptionStatus: input.assumptionStatus ?? 'NONE',
    validationStatus: input.validationStatus ?? 'UNVALIDATED',
    manualOverrideHistory: [],
  };
}

/**
 * Bangun record dari ChatQtoTrace kanonis (W7) + volume item. Rumus
 * template dicatat sebagai 'TPL-RULE' dengan versi template; input
 * tanpa satuan eksplisit dicatat bersatuan '' (tidak ditebak) dan
 * status validasi NEEDS_REVIEW bila ada input tanpa satuan.
 * Volume 1.0 dari komponen tanpa rule TIDAK disembunyikan: formula
 * null + assumptionStatus LABELED_ASSUMPTION bila volumenya 1.0 tanpa
 * rumus (perilaku S3-2 yang dipin — dicatat, bukan diubah).
 */
export function quantityRecordFromTrace(
  trace: ChatQtoTrace,
  item: { volume: number | null; unit: string; volumeSource?: VolumeSourceType | null },
  opts?: { formulaVersion?: string; inputUnits?: Record<string, string> },
): QuantityRecord {
  const inputs: QuantityInput[] = Object.entries(trace.formulaInputs ?? {}).map(([name, v]) => ({
    name,
    value: typeof v === 'number' ? v : Number(v),
    unit: opts?.inputUnits?.[name] ?? '',
    source: 'TEMPLATE' as QuantitySourceKind,
  }));
  const hasUnitlessInput = inputs.some((i) => i.unit === '');
  const noFormulaUnitVolume = trace.formula == null && item.volume === 1.0;
  return buildQuantityRecord({
    formulaId: 'TPL-RULE',
    formulaExpression: trace.formula,
    formulaVersion: opts?.formulaVersion ?? '1.0',
    inputs,
    outputUnit: item.unit,
    result: item.volume,
    roundingPolicy: 'template-2dp-min-0.01',
    sourceComponentId: trace.sourceComponentId,
    quantitySource: mapVolumeSource(item.volumeSource ?? trace.volumeSource),
    assumptionStatus: noFormulaUnitVolume ? 'LABELED_ASSUMPTION' : 'NONE',
    validationStatus: hasUnitlessInput || noFormulaUnitVolume ? 'NEEDS_REVIEW' : 'UNVALIDATED',
  });
}

/* ------------------------------------------------------------------ */
/* Evaluator rumus TERBATAS (audit recompute — BUKAN mesin hitung).    */
/*                                                                     */
/* Dipakai HANYA untuk rekonstruksi §6.5: menghitung-ulang rumus dari  */
/* input yang tersimpan untuk membuktikan kuantitas dapat direproduksi.*/
/* TIDAK PERNAH dipakai menghasilkan kuantitas baru (itu tugas mesin   */
/* kanonis). Tanpa eval/Function — tokenizer + recursive descent,      */
/* whitelist ketat: angka, identifier, + - * / ( ), unary minus, dan   */
/* Math.ceil/floor/round/min/max/abs. Identifier tak dikenal → error   */
/* (UNRESOLVED_DEPENDENCY), bukan 0.                                  */
/* ------------------------------------------------------------------ */

export type RecomputeResultB3 =
  | { ok: true; value: number }
  | { ok: false; error: string };

const MATH_FNS: Record<string, (...args: number[]) => number> = {
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
};

export function recomputeFormulaValue(
  formula: string,
  inputs: Record<string, number>,
): RecomputeResultB3 {
  const src = (formula ?? '').trim();
  if (src === '') return { ok: false, error: 'Rumus kosong — tidak ada yang dihitung-ulang.' };
  // Tokenizer: angka | identifier (termasuk Math.xxx) | operator | paren | koma.
  const tokens: string[] = [];
  const re = /\s*(\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_.]*|[+\-*/(),])/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(src)) !== null) {
    tokens.push(m[1]);
    consumed = re.lastIndex;
  }
  if (consumed < src.length) {
    return { ok: false, error: `Rumus mengandung karakter tak dikenal di posisi ${consumed}: "${src.slice(consumed, consumed + 10)}" — recompute dibatalkan.` };
  }
  let pos = 0;
  const peek = (): string | undefined => tokens[pos];
  const next = (): string | undefined => tokens[pos++];
  const parseExpr = (): number => {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next()!;
      const rhs = parseTerm();
      v = op === '+' ? v + rhs : v - rhs;
    }
    return v;
  };
  const parseTerm = (): number => {
    let v = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = next()!;
      const rhs = parseFactor();
      if (op === '/' && rhs === 0) throw new Error('Pembagian dengan nol.');
      v = op === '*' ? v * rhs : v / rhs;
    }
    return v;
  };
  const parseFactor = (): number => {
    const t = next();
    if (t === undefined) throw new Error('Rumus berakhir mendadak.');
    if (t === '(') {
      const v = parseExpr();
      if (next() !== ')') throw new Error('Kurung tutup ")" hilang.');
      return v;
    }
    if (t === '-') return -parseFactor();
    if (t === '+') return parseFactor();
    if (/^\d/.test(t)) {
      const n = Number(t);
      if (!Number.isFinite(n)) throw new Error(`Angka "${t}" tidak valid.`);
      return n;
    }
    if (/^[A-Za-z_]/.test(t)) {
      // Math.fn(...) — whitelist ketat.
      if (t.startsWith('Math.')) {
        const fnName = t.slice(5);
        const fn = MATH_FNS[fnName];
        if (!fn) throw new Error(`Fungsi "${t}" tidak diizinkan di recompute (hanya Math.ceil/floor/round/min/max/abs).`);
        if (next() !== '(') throw new Error(`"${t}" harus diikuti "(".`);
        const args: number[] = [];
        if (peek() !== ')') {
          args.push(parseExpr());
          while (peek() === ',') { next(); args.push(parseExpr()); }
        }
        if (next() !== ')') throw new Error(`Kurung tutup ")" hilang sesudah "${t}".`);
        return fn(...args);
      }
      if (t.includes('.')) throw new Error(`Identifier "${t}" tidak dikenal (akses properti tidak diizinkan).`);
      const v = inputs[t];
      if (v === undefined || !Number.isFinite(v)) {
        throw new Error(`Input "${t}" tidak tersimpan di trace (UNRESOLVED_DEPENDENCY) — kuantitas tidak dapat direproduksi.`);
      }
      return v;
    }
    throw new Error(`Token "${t}" tidak dikenal di rumus.`);
  };
  try {
    const value = parseExpr();
    if (pos < tokens.length) {
      return { ok: false, error: `Rumus mengandung token sisa "${tokens.slice(pos).join(' ')}" — recompute dibatalkan.` };
    }
    if (!Number.isFinite(value)) {
      return { ok: false, error: 'Hasil hitung-ulang bukan angka yang valid (Infinity/NaN).' };
    }
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface ReconstructionResult {
  reproduced: boolean;
  recomputed: number | null;
  difference: number | null;
  detail: string;
}

/**
 * Rekonstruksi kuantitas dari input yang tersimpan (§6.5): hitung-ulang
 * rumus record, terapkan kebijakan pembulatannya, bandingkan dengan
 * hasil tersimpan. Toleransi = setengah langkah pembulatan terakhir
 * (0,005 untuk 2dp) + noise float. Record tanpa rumus → tidak dapat
 * direproduksi (bukan dianggap cocok).
 */
export function reconstructQuantity(record: QuantityRecord): ReconstructionResult {
  if (record.formulaExpression == null || record.formulaExpression.trim() === '') {
    return {
      reproduced: false,
      recomputed: null,
      difference: null,
      detail: 'Record tanpa rumus (formula null) — kuantitas tidak dapat direproduksi dari input tersimpan.',
    };
  }
  if (record.result == null) {
    return {
      reproduced: false,
      recomputed: null,
      difference: null,
      detail: 'Hasil tersimpan null — tidak ada kuantitas yang direproduksi.',
    };
  }
  const inputs: Record<string, number> = {};
  for (const i of record.inputs) inputs[i.name] = i.value;
  const recomputed = recomputeFormulaValue(record.formulaExpression, inputs);
  if (!recomputed.ok) {
    return { reproduced: false, recomputed: null, difference: null, detail: `Recompute gagal: ${recomputed.error}` };
  }
  const rounded = applyRoundingPolicy(recomputed.value, record.roundingPolicy);
  const tolerance = record.roundingPolicy === 'exact' ? 1e-9
    : record.roundingPolicy === 'round-3dp' ? 0.0005 + 1e-9
    : 0.005 + 1e-9;
  const difference = Math.abs(rounded - record.result);
  if (difference <= tolerance) {
    return {
      reproduced: true,
      recomputed: rounded,
      difference,
      detail: `Kuantitas direproduksi dari input tersimpan: hitung-ulang ${rounded} ${record.outputUnit} = hasil tersimpan ${record.result} ${record.outputUnit} (selisih ${difference}).`,
    };
  }
  return {
    reproduced: false,
    recomputed: rounded,
    difference,
    detail: `Kuantitas TIDAK direproduksi: hitung-ulang ${rounded} ${record.outputUnit} ≠ hasil tersimpan ${record.result} ${record.outputUnit} (selisih ${difference} > toleransi ${tolerance}).`,
  };
}

/**
 * Override manual kuantitas (§6.5): append-only, WAJIB alasan.
 * Mengembalikan record BARU (record lama tidak dimutasi — riwayat
 * audit utuh). Status validasi menjadi NEEDS_REVIEW (override selalu
 * butuh review) dan sumber menjadi MANUAL_INPUT. Alasan kosong →
 * error (override tanpa alasan ditolak, bukan dicatat bisu).
 */
export function recordManualOverride(
  record: QuantityRecord,
  override: { newValue: number; reason: string },
): { ok: true; record: QuantityRecord } | { ok: false; error: string } {
  if (!Number.isFinite(override.newValue) || override.newValue < 0) {
    return { ok: false, error: `Nilai override ${String(override.newValue)} tidak valid (harus angka ≥ 0).` };
  }
  const reason = (override.reason ?? '').trim();
  if (reason === '') {
    return { ok: false, error: 'Override manual wajib menyertakan alasan — override tanpa alasan ditolak.' };
  }
  const next: QuantityRecord = {
    ...record,
    result: override.newValue,
    quantitySource: 'MANUAL_INPUT',
    validationStatus: 'NEEDS_REVIEW',
    inputs: record.inputs.map((i) => ({ ...i })),
    manualOverrideHistory: [
      ...record.manualOverrideHistory,
      {
        previousValue: record.result,
        newValue: override.newValue,
        reason,
        sequence: record.manualOverrideHistory.length + 1,
      },
    ],
  };
  return { ok: true, record: next };
}

/* ------------------------------------------------------------------ */
/* §6.5–§6.6 — Traceability & cek konsistensi QTO                       */
/*                                                                     */
/* Pemeriksa deterministik atas daftar item QTO. TIDAK PERNAH mengubah */
/* item, TIDAK PERNAH auto-koreksi: setiap temuan membawa proposal     */
/* koreksi (bila ada) yang SELALU requiresApproval — koreksi hanya     */
/* terjadi lewat jalur revisi/persetujuan pengguna.                    */
/* ------------------------------------------------------------------ */

export type QtoConsistencyCode =
  | 'MISSING_DIMENSION'
  | 'INCONSISTENT_UNIT'
  | 'INVALID_GEOMETRY'
  | 'DUPLICATE_QUANTITY'
  | 'UNEXPECTED_ZERO'
  | 'IMPLAUSIBLE_RANGE'
  | 'MISSING_FORMULA'
  | 'UNRESOLVED_DEPENDENCY'
  | 'SCOPE_DIMENSION_MISMATCH';

export interface QtoConsistencyItem {
  description: string;
  quantity: number | null;
  unit: string;
  sourceComponentId?: string | null;
  volumeBasis?: string | null;
  formula?: string | null;
  formulaInputs?: Record<string, number | string> | null;
  volumeSource?: string | null;
  /** Referensi pengukuran / DED / gambar (jejak §6.5). */
  measurementRef?: string | null;
  dedRef?: string | null;
  drawingRef?: string | null;
  /** Scope pemilik item (untuk cek SCOPE_DIMENSION_MISMATCH). */
  scopeId?: string | null;
  /** Dimensi yang diklaim item (untuk cek INVALID_GEOMETRY). */
  dimensions?: DimensionSet | null;
  /** ID rumus registry (untuk cek kesesuaian satuan output). */
  formulaId?: string | null;
}

export interface QtoConsistencyFinding {
  code: QtoConsistencyCode;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  item: string;
  message: string;
  /**
   * Proposal koreksi — SELALU butuh persetujuan eksplisit; pemeriksa
   * tidak pernah menerapkannya sendiri.
   */
  correctionProposal?: { description: string; requiresApproval: true };
}

export interface QtoConsistencyOptions {
  /**
   * Dimensi per-scope (scopeId → DimensionSet) untuk cek
   * SCOPE_DIMENSION_MISMATCH: input rumus item dibandingkan dengan
   * dimensi scope pemiliknya. Tanpa ini, cek itu dilewati.
   */
  scopeDimensions?: Record<string, DimensionSet>;
  /**
   * Satuan yang diharapkan per deskripsi item (untuk cek
   * INCONSISTENT_UNIT terhadap permintaan — cermin CON-11 qtoBridge).
   */
  expectedUnits?: Record<string, string>;
}

/** Satuan dimensional (bukan hitung/lumpsum) — kuantitasnya butuh dimensi. */
function isDimensionalUnit(unit: string): boolean {
  const fam = unitFamilyOf(unit);
  return fam === 'length' || fam === 'area' || fam === 'volume' || fam === 'weight';
}

/** Pemetaan nama input rumus → jenis dimensi (untuk cek scope-mismatch). */
function dimensionKindOfInputName(name: string): keyof DimensionSet | null {
  const k = name.toLowerCase();
  if (/span|bentang/.test(k)) return 'spanM';
  if (/depth|kedalaman/.test(k)) return 'depthM';
  if (/thickness|tebal/.test(k)) return 'thicknessM';
  if (/length|panjang|lintasan/.test(k)) return 'lengthM';
  if (/width|lebar/.test(k)) return 'widthM';
  if (/height|tinggi/.test(k)) return 'heightM';
  if (/\barea\b|luas/.test(k)) return 'areaM2';
  if (/volume/.test(k)) return 'volumeM3';
  return null;
}

/** Nilai dimensi scope untuk satu jenis (tebal scope disimpan meter di DimensionSet). */
function scopeDimensionValue(dims: DimensionSet, kind: keyof DimensionSet): number | null {
  const v = dims[kind];
  return typeof v === 'number' ? v : null;
}

export function checkQtoConsistency(
  items: QtoConsistencyItem[],
  opts?: QtoConsistencyOptions,
): QtoConsistencyFinding[] {
  const out: QtoConsistencyFinding[] = [];
  const seenComponent = new Map<string, string>();
  const seenDescUnit = new Map<string, { quantity: number | null; description: string }>();

  for (const item of items) {
    const label = item.description || '(tanpa deskripsi)';

    // --- Satuan tak dikenal / tak konsisten (CON-11) ---
    const fam = unitFamilyOf(item.unit);
    if (fam == null && item.unit.trim() !== '' && item.unit.toLowerCase() !== 'ls' && item.unit.toLowerCase() !== 'lumpsum') {
      out.push({
        code: 'INCONSISTENT_UNIT', severity: 'ERROR', item: label,
        message: `Satuan "${item.unit}" tidak dikenal whitelist satuan — kuantitas tidak dapat divalidasi dimensinya.`,
        correctionProposal: { description: `Samakan satuan "${item.unit}" dengan satuan whitelist (m/m²/m³/kg/ton/unit/titik/m1) atau nyatakan sebagai lumpsum (ls) bila memang borongan.`, requiresApproval: true },
      });
    }
    const expectedUnit = opts?.expectedUnits?.[item.description];
    if (expectedUnit && expectedUnit.toLowerCase() !== (item.unit ?? '').toLowerCase()) {
      out.push({
        code: 'INCONSISTENT_UNIT', severity: 'ERROR', item: label,
        message: `Unit tidak cocok: diminta "${expectedUnit}", QTO memakai "${item.unit}" — kalkulasi memakai kuantitas ini DIBLOKIR.`,
        correctionProposal: { description: `Ubah satuan item menjadi "${expectedUnit}" (atau perbarui permintaan bila "${item.unit}" yang benar).`, requiresApproval: true },
      });
    }
    // Satuan output vs rumus registry.
    if (item.formulaId && FORMULA_REGISTRY[item.formulaId]) {
      const def = FORMULA_REGISTRY[item.formulaId];
      const gotSig = signatureOfUnit(item.unit);
      if (gotSig != null && gotSig !== def.output) {
        out.push({
          code: 'INCONSISTENT_UNIT', severity: 'ERROR', item: label,
          message: `Satuan output "${item.unit}" (${gotSig}) tidak cocok dengan rumus ${item.formulaId} yang menghasilkan ${def.output} (${def.outputUnit}).`,
        });
      }
    }

    // --- Kuantitas null / nol / negatif ---
    if (item.quantity == null || !Number.isFinite(item.quantity)) {
      if (isDimensionalUnit(item.unit)) {
        out.push({
          code: 'MISSING_DIMENSION', severity: 'ERROR', item: label,
          message: `Kuantitas hilang (null) untuk satuan dimensional "${item.unit}" — dimensi dasar tidak tercatat; dinyatakan hilang, bukan 0.`,
          correctionProposal: { description: 'Lengkapi dimensi dasar item ini (panjang/lebar/tinggi/kedalaman) atau tandai PERLU SPESIFIKASI.', requiresApproval: true },
        });
      }
    } else {
      if (item.quantity < 0) {
        out.push({
          code: 'INVALID_GEOMETRY', severity: 'ERROR', item: label,
          message: `Kuantitas negatif (${item.quantity} ${item.unit}) — geometri tidak valid; kuantitas fisik tidak boleh negatif.`,
        });
      } else if (item.quantity === 0 && isDimensionalUnit(item.unit)) {
        out.push({
          code: 'UNEXPECTED_ZERO', severity: 'WARNING', item: label,
          message: `Kuantitas 0 ${item.unit} — nol yang tak terduga untuk item dimensional (kemungkinan rumus gagal / dimensi nol); periksa dimensi, jangan biarkan 0 lolos sebagai volume sah.`,
          correctionProposal: { description: 'Periksa dimensi & rumus item ini; bila memang tidak ada pekerjaan, hapus itemnya — jangan biarkan volume 0.', requiresApproval: true },
        });
      }
      // Jumlah pecahan pada satuan hitung.
      if (fam === 'count' && !Number.isInteger(item.quantity)) {
        out.push({
          code: 'IMPLAUSIBLE_RANGE', severity: 'WARNING', item: label,
          message: `Jumlah ${item.quantity} ${item.unit} bukan bilangan bulat — jumlah elemen lazimnya bulat.`,
        });
      }
    }

    // --- Rumus hilang / dependensi tak teresolusi ---
    const isCalculated = item.volumeSource === 'CALCULATOR' || item.volumeSource === 'TEMPLATE' || item.volumeBasis === 'CALCULATOR';
    if (isCalculated && (item.formula == null || item.formula.trim() === '') && item.quantity != null) {
      out.push({
        code: 'MISSING_FORMULA', severity: 'WARNING', item: label,
        message: `Kuantitas ${item.quantity} ${item.unit} bersumber ${item.volumeSource ?? item.volumeBasis} tetapi tanpa rumus tercatat — kuantitas tidak dapat direproduksi dari input tersimpan.`,
      });
    }
    if (item.formula) {
      const identifiers = new Set(item.formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
      const inputs = item.formulaInputs ?? {};
      for (const id of identifiers) {
        if (id === 'Math' || id in MATH_FNS) continue;
        if (!(id in inputs)) {
          out.push({
            code: 'UNRESOLVED_DEPENDENCY', severity: 'ERROR', item: label,
            message: `Rumus "${item.formula}" merujuk input "${id}" yang tidak tersimpan di trace — kuantitas tidak dapat direproduksi.`,
            correctionProposal: { description: `Lengkapi nilai "${id}" di trace rumus (dari parameter template / dimensi pengguna), atau perbaiki rumusnya.`, requiresApproval: true },
          });
        }
      }
    }

    // --- Geometri klaim item ---
    if (item.dimensions) {
      for (const f of validateDimensions(item.dimensions)) {
        if (f.severity === 'ERROR') {
          out.push({
            code: 'INVALID_GEOMETRY', severity: 'ERROR', item: label,
            message: `Dimensi item tidak valid — ${f.message}`,
          });
        }
      }
    }

    // --- Duplikat ---
    if (item.sourceComponentId) {
      const prev = seenComponent.get(item.sourceComponentId);
      if (prev) {
        out.push({
          code: 'DUPLICATE_QUANTITY', severity: 'ERROR', item: label,
          message: `Komponen "${item.sourceComponentId}" muncul dua kali sebagai item ("${prev}" dan "${label}") — kuantitas kemungkinan ganda.`,
          correctionProposal: { description: `Hapus salah satu item duplikat komponen "${item.sourceComponentId}" (periksa dulu bila keduanya memang dimaksud).`, requiresApproval: true },
        });
      } else {
        seenComponent.set(item.sourceComponentId, label);
      }
    }
    const descKey = `${label.trim().toLowerCase()}|${(item.unit ?? '').toLowerCase()}`;
    const prevDesc = seenDescUnit.get(descKey);
    if (prevDesc && prevDesc.quantity !== item.quantity) {
      out.push({
        code: 'DUPLICATE_QUANTITY', severity: 'WARNING', item: label,
        message: `Item "${label}" (${item.unit}) muncul dua kali dengan kuantitas berbeda (${prevDesc.quantity} vs ${item.quantity}) — kemungkinan duplikat lintas-part.`,
      });
    } else if (!prevDesc) {
      seenDescUnit.set(descKey, { quantity: item.quantity, description: label });
    }

    // --- Mismatch dimensi scope ---
    if (item.scopeId && opts?.scopeDimensions?.[item.scopeId] && item.formulaInputs) {
      const scopeDims = opts.scopeDimensions[item.scopeId];
      for (const [name, v] of Object.entries(item.formulaInputs)) {
        if (typeof v !== 'number') continue;
        const kind = dimensionKindOfInputName(name);
        if (!kind) continue;
        const expected = scopeDimensionValue(scopeDims, kind);
        if (expected == null) continue;
        // Tebal: input rumus bisa cm/meter/mm — bandingkan hanya bila
        // orde-nya sama (hindari false positive konversi satuan).
        if (kind === 'thicknessM') continue;
        if (Math.abs(v - expected) > 1e-9) {
          out.push({
            code: 'SCOPE_DIMENSION_MISMATCH', severity: 'ERROR', item: label,
            message: `Input rumus "${name}" = ${v} tidak cocok dengan dimensi scope ${item.scopeId} (${kind} = ${expected}) — kemungkinan dimensi lintas-cakupan bocor ke item ini.`,
            correctionProposal: { description: `Samakan "${name}" dengan dimensi scope ${item.scopeId} (${expected}), atau pindahkan item ke scope yang dimensinya cocok.`, requiresApproval: true },
          });
        }
      }
    }
  }
  return out;
}
