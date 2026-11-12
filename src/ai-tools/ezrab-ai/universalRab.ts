/**
 * universalRab — Universal Direct RAB Builder untuk EZRAB Chat AI.
 *
 * Memperluas directRab/specRab (yang hanya melayani rumah lewat mesin
 * parametrik) ke SELURUH cakupan konstruksi dengan memakai mesin yang
 * SUDAH ADA: katalog template RAB 180 (RabTemplateService) + resolver
 * AHSP 2026 resmi. Tidak ada engine kalkulasi baru, tidak ada database
 * harga paralel, tidak ada harga hardcoded sebagai fallback produksi.
 *
 * Alur: pesan → klasifikasi cakupan → ekstraksi spesifikasi → cek data
 * wajib (SATU pertanyaan bila ada yang menghalangi) → pilih template
 * katalog resmi → generate deterministik → validasi → tabel chat →
 * revisi → preview transfer → persetujuan → Spreadsheet RAB.
 *
 * Kejujuran harga (pemetaan label konseptual → enum AKTUAL repo,
 * terverifikasi dari resolver katalog di rabTemplateService.ts — jenis
 * resolver hanya OFFICIAL_AHSP | MARKET_REFERENCE | UNRESOLVED):
 * - RESMI AHSP       → priceSourceKind 'OFFICIAL_AHSP' (kode kanonis +
 *                      satuan cocok + komposisi resolver FULL).
 * - REFERENSI PASAR  → priceSourceKind 'MARKET_REFERENCE' dari TABEL
 *                      PASAR TERSIMPAN katalog (bukan fetch live — tidak
 *                      ada tool pencarian pasar live di chat); nama
 *                      sumber/tanggal/wilayah TIDAK terbawa ke item draft
 *                      (delta terdokumentasi, lihat laporan). Label ini
 *                      tidak pernah disamarkan menjadi RESMI AHSP.
 * - HARGA DATABASE   → ember fallback: item berharga yang bukan resmi,
 *                      bukan pasar, bukan manual (mis. asumsi EZRAB /
 *                      harga benchmark legacy template). Pada 5 draft
 *                      yang dites, ember ini KOSONG — semua harga
 *                      non-resmi adalah REFERENSI PASAR.
 * - HARGA MANUAL     → priceStatus 'PRICE_MANUAL' + label/penjelasan
 *                      dari input pengguna (hanya via revisi chat).
 * - ESTIMASI AI      → engine katalog TIDAK mengeluarkan item
 *                      PRICE_ESTIMATED; status draft ESTIMASI berarti
 *                      "mengandung harga non-resmi" (pasar/database/
 *                      manual), BUKAN "dihitung AI". Harga benchmark
 *                      "(est.)" hanya ada di jalur rumah directRab.
 * - BELUM TERSEDIA   → unitPrice null, tampil "Harga belum tersedia",
 *                      TIDAK PERNAH Rp0, tidak masuk total.
 * - PERLU SPESIFIKASI→ ahspMappingStatus 'NEEDS_MAPPING' / parameter
 *                      wajib hilang / data desain teknik belum ada.
 * LLM tidak pernah menjadi kalkulator final: volume dari formula
 * komponen katalog, total dari penjumlahan deterministik item.
 *
 * HARDENING FASE 2+3 (2026-10-26, tanpa mengubah kontrak penyimpanan lama):
 * - Sentinel harga: generator memakai unitPrice null untuk BELUM TERSEDIA,
 *   tetapi rabItemFactory (kontrak lama) menyimpan PRICE_UNRESOLVED sebagai
 *   unitPrice 0. Modul ini TIDAK PERNAH menilai validitas dari nilai 0 —
 *   validitas selalu dari priceStatus (lihat isPriceValidForTotal,
 *   computeTotals, displayPriceStatus). Mengubah factory menjadi null akan
 *   merusak consumer lama, jadi sentinel dipertahankan + digating status.
 * - Provenance pasar: resolver katalog mengembalikan sourceName null untuk
 *   MARKET_REFERENCE (rabTemplateService.ts:1874, 1887) dan tidak ada field
 *   tanggal/wilayah/pemasok di tipe RabItem maupun komponen template —
 *   tanggal pasar TIDAK PERNAH dikarang di sini; ketiadaan itu dinyatakan
 *   eksplisit di pesan draft (D1a = keputusan owner, bukan refactor diam).
 * - Kesiapan draft (draftReadiness): BLOCKED = parameter wajib belum
 *   lengkap / volume INVALID / spesifikasi kritis hilang / nilai di luar
 *   batas template pada cakupan kritis. Draft BLOCKED melempar di
 *   buildPushPayload (guard di payload, bukan hanya di tombol UI) dan
 *   ditolak validateTransfer. NEEDS_SPEC masih boleh transfer dengan
 *   peringatan (konsisten dengan perilaku lama: item belum berharga masuk
 *   sebagai PRICE_UNRESOLVED, bukan diam-diam Rp0).
 * - Skor template: skor lama seri di hampir semua kasus teruji (margin 0 —
 *   kata kunci 'beton' ada di deskripsi hampir semua template), jadi
 *   ditambah bobot nama template + penalti konflik jenis bangunan, dan
 *   demosi kandidat di luar batas parameter bila ada kandidat dalam
 *   batas yang layak. Bila semua kandidat di luar batas, pemenang tetap
 *   dipakai dengan peringatan (bukan ditolak diam-diam) agar tes dan
 *   perilaku lama tidak rusak — tetapi transfernya diblokir bila cakupan
 *   kritis (lihat draftReadiness).
 */

import { RabTemplateService } from '../../services/rabTemplateService';
import type { RabTemplate, TemplateCategory, GeneratedTemplateRabResult } from '../../types/rabTemplate';
import type { StructuredSpec } from './structuredSpec';
import {
  resolveDeterministicPick,
  suppressedScopes,
  booleanParamOverrides,
  selectParamOverrides,
  validateDraftChain,
  familyIdFromSpecs,
  lookupMaterialBinding,
  requestedMaterialForSpec,
  materialSpecForScope,
  extractRoofMaterialToken,
  deriveRoofSpecFromText,
  traceItemReasons,
  formatItemReasonSummary,
} from './specChain';
import type { ChainValidation } from './specChain';
import { assessBudgetFeasibility, formatBudgetFeasibilityLine } from './budgetFeasibility';
import { detectTechnicalConflicts, formatConflictLines } from './technicalConflicts';
import { parseBuildingsFromText, buildingSummaryLines, upsertBuilding } from './multiBuilding';
import type { BuildingModel } from './multiBuilding';
import {
  specForBuilding,
  buildingHasMeasureBasis,
  buildingMissingBasisReason,
  isSharedWorksScope,
  SHARED_WORKS_LABEL,
  parseBuildingRevision,
  aggregateMultiBuildingRoofSuppression,
} from './multiBuildingRab';
import type {
  BuildingRoofCoverage,
  MultiBuildingRoofSuppression,
} from './multiBuildingRab';
/* GATE 4 (5D) — dedQtoIntegration tidak mengimpor universalRab
 * (hanya dedUnderstanding/qtoBridge/structuredSpec/retrieval) —
 * impor ini aman dari siklus runtime. */
import { formatDedQtoDraftLines } from './dedQtoIntegration';
import type { DedQtoDraftInfo } from './dedQtoIntegration';
import type { RabItem } from '../../types';
import { extractRabNeeds, stripLandPhrases, detectNeedsFunction, isNegatedAt } from './rabNeeds';
import { understandProject, assessBuildingMissingInfo, summarizeUnderstanding } from './buildingTypology';
import { formatRupiah } from '../../engine/formulaEngine';
import { filterItemsByRelevance } from './relevanceGate';

/* ------------------------------------------------------------------ */
/* Cakupan                                                             */
/* ------------------------------------------------------------------ */

export type UniversalScopeId =
  | 'jalan'
  | 'drainase'
  | 'jembatan'
  | 'irigasi'
  | 'pondasi'
  | 'struktur'
  | 'atap'
  | 'finishing'
  | 'gedung'
  | 'mep'
  | 'lanskap'
  | 'renovasi'
  | 'demolisi'
  | 'pelabuhan'
  | 'olahraga'
  | 'pertanian'
  | 'tanah'
  | 'sanitasi';

export interface ScopeGroup {
  id: UniversalScopeId;
  label: string;
  categories: TemplateCategory[];
  /** Kata kunci deteksi (urutan = prioritas; grup lebih spesifik dulu). */
  keywords: string[];
  /** Ukuran utama yang wajib ada agar draft bisa dibuat. */
  primaryMeasure: 'length' | 'span' | 'area' | 'areaOrLength' | 'areaOrFloors' | 'areaOrBudget' | 'any';
  primaryLabel: string;
}

export const SCOPE_GROUPS: ScopeGroup[] = [
  { id: 'jembatan', label: 'Jembatan & Struktur Khusus', categories: ['JEMBATAN_STRUKTUR'], keywords: ['jembatan', 'jpo', 'flyover', 'overpass', 'box culvert jembatan'], primaryMeasure: 'span', primaryLabel: 'bentang (meter)' },
  { id: 'drainase', label: 'Drainase & Saluran', categories: ['DRAINASE_SANITASI', 'SDA_IRIGASI'], keywords: ['u-ditch', 'uditch', 'u ditch', 'drainase', 'saluran', 'gorong', 'box culvert', 'pasangan batu'], primaryMeasure: 'length', primaryLabel: 'panjang (meter)' },
  { id: 'irigasi', label: 'Irigasi & Sumber Daya Air', categories: ['SDA_IRIGASI'], keywords: ['irigasi', 'bendung', 'bendungan', 'embung', 'sungai', 'pintu air', 'bangunan air', 'tanggul'], primaryMeasure: 'areaOrLength', primaryLabel: 'panjang atau luas' },
  { id: 'pondasi', label: 'Pondasi & Geoteknik', categories: ['PONDASI_GEOTEKNIK'], keywords: ['pondasi', 'bore pile', 'bored pile', 'tiang pancang', 'foot plat', 'sumuran', 'strauss', 'geoteknik'], primaryMeasure: 'any', primaryLabel: 'luas, panjang, atau jumlah titik' },
  { id: 'struktur', label: 'Struktur Beton & Baja', categories: ['STRUKTUR_BETON_BAJA'], keywords: ['struktur beton', 'sloof', 'kolom', 'balok', 'pelat lantai', 'tangga beton', 'dinding geser', 'struktur baja', 'bekisting', 'pembesian', 'pengecoran'], primaryMeasure: 'areaOrFloors', primaryLabel: 'luas atau jumlah lantai' },
  { id: 'atap', label: 'Atap & Waterproofing', categories: ['ATAP_WATERPROOFING'], keywords: ['atap', 'rangka atap', 'genteng', 'baja ringan', 'waterproofing', 'membran bakar', 'penutup atap'], primaryMeasure: 'area', primaryLabel: 'luas atap (m²)' },
  { id: 'finishing', label: 'Finishing & Interior', categories: ['FINISHING_INTERIOR'], keywords: ['finishing', 'keramik', 'granit', 'plafon', 'partisi', 'kusen', 'pintu', 'jendela', 'plester', 'acian', 'pengecatan', 'cat tembok', 'bata ringan', 'pasangan bata'], primaryMeasure: 'area', primaryLabel: 'luas pekerjaan (m²)' },
  { id: 'mep', label: 'Mekanikal, Elektrikal & Plumbing', categories: ['MEP_SYSTEM', 'UTILITAS'], keywords: ['mep', 'mekanikal', 'elektrikal', 'plumbing', 'instalasi listrik', 'panel listrik', 'pompa air', 'perpipaan', 'hvac', 'instalasi air', 'instalasi ac', 'hydrant', 'gas medis'], primaryMeasure: 'areaOrLength', primaryLabel: 'luas bangunan atau panjang instalasi' },
  { id: 'sanitasi', label: 'Sanitasi & Air Limbah', categories: ['DRAINASE_SANITASI', 'UTILITAS'], keywords: ['sanitasi', 'septictank', 'septic tank', 'tangki septik', 'sumur resapan', 'ipal', 'wastafel', 'kloset', 'floor drain', 'air limbah'], primaryMeasure: 'areaOrLength', primaryLabel: 'luas atau panjang' },
  { id: 'jalan', label: 'Jalan & Perkerasan', categories: ['JALAN_TRANSPORTASI', 'PERKERASAN'], keywords: ['jalan', 'perkerasan', 'aspal', 'hotmix', 'paving', 'rabat beton', 'trotoar', 'kanstin', 'marka jalan', 'bahu jalan'], primaryMeasure: 'length', primaryLabel: 'panjang (meter) atau luas (m²) untuk paving' },
  { id: 'gedung', label: 'Gedung & Bangunan', categories: ['GEDUNG', 'BANGUNAN_TINGGI', 'HOTEL_HOSPITALITY', 'KESEHATAN', 'PENDIDIKAN', 'INDUSTRI'], keywords: ['gedung', 'kantor', 'sekolah', 'rumah sakit', 'klinik', 'gudang', 'hotel', 'ruko', 'villa', 'kos', 'apartemen', 'masjid', 'puskesmas', 'pasar', 'pabrik', 'bengkel', 'workshop', 'warehouse', 'toko', 'aula', 'minimarket', 'restoran', 'kafe', 'showroom', 'apotek', 'laundry', 'kios', 'warung', 'musholla', 'mushola', 'vihara', 'klenteng', 'gereja', 'pura', 'madrasah', 'perpustakaan', 'kontrakan', 'rumah makan', 'tempat ibadah'], primaryMeasure: 'areaOrFloors', primaryLabel: 'luas atau dimensi bangunan' },
  { id: 'lanskap', label: 'Lanskap, Pagar & Halaman', categories: ['LANDSCAPE_SITE'], keywords: ['lanskap', 'landscape', 'pagar', 'gerbang', 'halaman', 'taman', 'area parkir', 'pekarangan', 'tembok penahan', 'retaining wall', 'dinding penahan'], primaryMeasure: 'areaOrLength', primaryLabel: 'luas atau panjang' },
  { id: 'renovasi', label: 'Renovasi & Rehabilitasi', categories: ['RENOVASI_MAINTENANCE'], keywords: ['renovasi', 'rehabilitasi', 'rehab', 'perbaikan', 'restorasi', 'perkuatan', 'renov', 'kanopi'], primaryMeasure: 'areaOrBudget', primaryLabel: 'luas atau batas anggaran' },
  { id: 'demolisi', label: 'Demolisi & Pembongkaran', categories: ['DEMOLISI_REKONSTRUKSI'], keywords: ['demolisi', 'pembongkaran', 'bongkar', 'robohkan', 'pembongkaran'], primaryMeasure: 'area', primaryLabel: 'luas bangunan yang dibongkar (m²)' },
  { id: 'pelabuhan', label: 'Pelabuhan & Pesisir', categories: ['PELABUHAN_PESISIR'], keywords: ['pelabuhan', 'dermaga', 'pesisir', 'tetrapod', 'turap', 'breakwater', 'dinding laut'], primaryMeasure: 'length', primaryLabel: 'panjang (meter)' },
  { id: 'olahraga', label: 'Fasilitas Olahraga', categories: ['FASILITAS_OLAHRAGA'], keywords: ['lapangan', 'stadion', 'olahraga', 'futsal', 'badminton', 'kolam renang', 'kolam ikan', 'kolam', 'sport'], primaryMeasure: 'area', primaryLabel: 'luas lapangan (m²)' },
  { id: 'pertanian', label: 'Pertanian & Perkebunan', categories: ['PERTANIAN_PERKEBUNAN'], keywords: ['pertanian', 'perkebunan', 'sawah', 'sumur bor', 'kebun', 'kandang', 'greenhouse', 'rumah kaca', 'lumbung'], primaryMeasure: 'areaOrLength', primaryLabel: 'luas atau panjang' },
  { id: 'tanah', label: 'Pekerjaan Tanah', categories: ['PEKERJAAN_TANAH'], keywords: ['galian', 'urugan', 'timbunan', 'pemadatan', 'cut and fill', 'cut & fill', 'pekerjaan tanah'], primaryMeasure: 'any', primaryLabel: 'volume, luas, atau panjang' },
];

/** Deteksi grup cakupan dari teks (bisa lebih dari satu untuk "A, B, dan C"). */
export function detectScopes(rawText: string): ScopeGroup[] {
  const t = ` ${(rawText || '').toLowerCase()} `;
  const found: ScopeGroup[] = [];
  for (const g of SCOPE_GROUPS) {
    for (const kw of g.keywords) {
      // Kemunculan kata kunci yang DINEGASIKAN pengguna tidak memicu
      // cakupan (audit ekstrem G-081): pada "bukan gudang tapi rumah",
      // kata "gudang" sebelumnya tetap menyalakan cakupan gedung
      // sehingga koreksi fungsi yang sudah benar pun berakhir sebagai
      // draft template gudang. Aturan negasi yang sama dengan deteksi
      // fungsi (rabNeeds.isNegatedAt — satu sumber aturan).
      let idx = t.indexOf(kw);
      let hit = false;
      while (idx >= 0) {
        if (!isNegatedAt(t, idx)) { hit = true; break; }
        idx = t.indexOf(kw, idx + 1);
      }
      if (hit) {
        found.push(g);
        break;
      }
    }
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* Spesifikasi                                                         */
/* ------------------------------------------------------------------ */

export interface UniversalSpec {
  rawText: string;
  scopes: ScopeGroup[];
  /** Jenis/tipe bangunan dari rabNeeds (mis. 'kantor', 'sekolah'). */
  kindLabel: string | null;
  floors: number | null;
  /* --- Lapisan tipologi (2026-11-08): fungsi ≠ kompleksitas ------- */
  /** Fungsi bangunan terstruktur ('gudang', 'pabrik', …) — null bila bukan bangunan. */
  functionId: string | null;
  /** Label fungsi bangunan untuk judul/pesan ('Gudang'). */
  functionLabel: string | null;
  /**
   * Versi draf fungsi dari rabNeeds.detectedFunctionLabel (finalisasi
   * 2026-11-08) — fungsi generik yang TIDAK menghasilkan TemplateKind
   * ("bangunan", "bangunan komersial"). Dipakai jalur klarifikasi gedung
   * agar fungsi generik tetap mendapat pertanyaan kontekstual.
   */
  needsFunctionLabel: string | null;
  /** true bila jumlah lantai disebut eksplisit; false = asumsi 1 lantai terlabel. */
  floorsExplicit: boolean;
  /** Tapak bangunan dari dimensi eksplisit (m²) — bukan luas lahan. */
  footprintM2: number | null;
  /** Luas lahan eksplisit (m²), selalu terpisah dari luas bangunan. */
  landAreaM2: number | null;
  /** Cakupan tapak terhadap lahan (%) bila kedua luas eksplisit. */
  coveragePct: number | null;
  /** Peringatan pemahaman tipologi (koreksi klasifikasi, salah ketik…). */
  understandingFlags: string[];
  /** Lebar bangunan dari dimensi "A x B" (m). */
  buildingWidthM: number | null;
  /** Panjang bangunan dari dimensi "A x B" (m). */
  buildingLengthM: number | null;
  /** Luas kerja: luas bangunan untuk gedung, luas area untuk paving/dll. */
  areaM2: number | null;
  lengthM: number | null;
  widthM: number | null;
  spanM: number | null;
  heightM: number | null;
  thicknessCm: number | null;
  volumeM3: number | null;
  count: number | null;
  budgetCap: number | null;
  location: string | null;
  /** Kata kunci material/kualitas yang disebut (beton, aspal, baja ringan…). */
  materialKeywords: string[];
  /** Kata kunci lingkup tambahan (mis. 'drainase' di dalam permintaan jalan). */
  extraKeywords: string[];
  isRenovation: boolean;
  isDemolition: boolean;
}

const MATERIAL_WORDS = [
  'beton', 'aspal', 'hotmix', 'paving', 'baja ringan', 'genteng', 'keramik',
  'granit', 'bata ringan', 'bata merah', 'u-ditch', 'box culvert', 'kayu',
  'gypsum', 'aluminium', 'pvc', 'galvanis', 'ready mix', 'precast', 'pracetak',
  // Fase 2 Bagian B (audit §1/§5): 'spandek'/'galvalum'/'zincalume'
  // sebelumnya absen sehingga frasa "penutup atap Galvalum" memberi NOL
  // sinyal skor. Dampak terukur: dari ketiganya hanya 'zincalume' yang
  // muncul di nama/deskripsi template (ROOF-METAL-STANDING, "penutup
  // zincalume standing seam") → +3 yang memang dimaksud sbg sinyal
  // material; 'spandek'/'galvalum' tidak muncul di nama/deskripsi
  // template mana pun sehingga tidak mengubah skor apa pun.
  'spandek', 'galvalum', 'zincalume',
];

const NUM = (s: string) => parseFloat(s.replace(',', '.'));

export function parseRupiahAmount(numStr: string, unit: string | undefined): number {
  const v = NUM(numStr.replace(/\./g, ''));
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (!unit) return v;
  const u = unit.toLowerCase();
  if (u.startsWith('miliar') || u.startsWith('milyar')) return v * 1_000_000_000;
  if (u === 'jt' || u === 'juta') return v * 1_000_000;
  if (u === 'rb' || u === 'ribu') return v * 1_000;
  return v;
}

/** Ekstrak spesifikasi terukur dari teks (deterministik, tanpa AI). */
export function extractUniversalSpec(rawText: string): UniversalSpec {
  const text = (rawText || '').trim();
  const lower = text.toLowerCase();
  const needs = extractRabNeeds(stripLandPhrases(text));
  const scopes = detectScopes(text);
  const understanding = understandProject(text);

  // Anggaran = kemunculan TERAKHIR (koreksi pengguna menggantikan
  // nilai lama — dulu first-match sehingga revisi "anggaran 300 jt …
  // anggaran 250 jt" tetap memakai cap basi 300 jt; audit Fase 1 §7).
  // BATASAN: pola yang sama tidak menangkap "budget menjadi 250 juta"
  // (kata 'menjadi' di antara kata kunci dan angka) — frasa itu tetap
  // tidak terbaca sebagai anggaran; perluasan pola di luar tugas ini.
  let budgetCap: number | null = null;
  const budgetRe = /(?:anggaran|budget|dana|biaya\s*maks(?:imal)?|maks(?:imal)?)\s*(?:sekitar\s*)?(?:rp\.?\s*)?([\d.]+(?:,\d+)?)\s*(miliar|milyar|jt|juta|rb|ribu)?\b/g;
  for (const m of lower.matchAll(budgetRe)) {
    const v = parseRupiahAmount(m[1], m[2]);
    if (v > 0) budgetCap = v;
  }

  const span = lower.match(/(?:bentang|span)\s*(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*(?:meter|m)\b/);
  const width = lower.match(/(?:lebar)\s*(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*(?:meter|m)\b/);
  const height = lower.match(/(?:tinggi)\s*(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*(?:meter|m)\b/);
  const thick = lower.match(/(?:tebal)\s*(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*cm\b/);
  const vol = lower.match(/(\d+(?:[.,]\d+)?)\s*m3\b/);

  const materialKeywords = MATERIAL_WORDS.filter((w) => lower.includes(w));
  const extraKeywords = ['drainase', 'pagar', 'trotoar', 'kanstin', 'marka', 'pju', 'lampu']
    .filter((w) => lower.includes(w));

  return {
    rawText: text,
    scopes,
    kindLabel: needs.kindLabel,
    floors: needs.floors,
    functionId: understanding.functionId,
    functionLabel: understanding.functionLabel,
    needsFunctionLabel: detectNeedsFunction(text)?.label ?? null,
    floorsExplicit: needs.floorsMentioned,
    // Fallback IR tipologi (audit P0 A-099/A-100): dimensi yang hanya
    // terbaca lapisan pemahaman (kata bilangan "sepuluh kali dua
    // puluh", rasio ukuran "10:20") sebelumnya berhenti di IR dan
    // tidak pernah menjadi basis ukuran spek — jalur needs digit-only
    // mengembalikan null sehingga permintaan sah jatuh ke needs-spec.
    // IR membuang frasa lahan sebelum membaca dimensi, jadi sumbernya
    // konsisten dengan jalur needs.
    footprintM2: needs.footprintM2 ?? understanding.footprint.value,
    landAreaM2: understanding.landArea.value,
    coveragePct: understanding.coveragePct,
    understandingFlags: understanding.flags,
    buildingWidthM: needs.buildingWidth ?? understanding.width.value,
    buildingLengthM: needs.buildingLength ?? understanding.length.value,
    // Luas kerja: luas bangunan eksplisit, atau TAPAK dari dimensi
    // eksplisit (perbaikan tipologi 2026-11-08 — sebelumnya dimensi
    // "10 x 20 m" tidak pernah menjadi luas di jalur ini sehingga
    // permintaan gudang ditolak sebagai "belum ada luas/lantai").
    areaM2: needs.buildingArea ?? needs.footprintM2 ?? understanding.footprint.value,
    lengthM: needs.lengthM,
    widthM: width ? NUM(width[1]) : null,
    spanM: span ? NUM(span[1]) : null,
    heightM: height ? NUM(height[1]) : null,
    thicknessCm: thick ? NUM(thick[1]) : null,
    volumeM3: vol ? NUM(vol[1]) : null,
    // Audit ekstrem 2026-11-08 (KELUARGA CACAT A): basis ukuran JUMLAH
    // ("24 titik", "20 unit", "5 buah", "1 paket") sebelumnya dibuang —
    // count dikunci null sehingga pekerjaan berbasis jumlah (bore pile
    // per titik, kusen per unit, IPAL per paket, dst.) selalu ditolak
    // sebagai belum ada ukuran padahal ukurannya sudah diberikan.
    // Ekstraksi jumlah: angka + satuan jumlah yang eksplisit. "titik"
    // hanya dihitung bila teks menyebut pekerjaan yang memang berbasis
    // titik (pondasi/sanitasi/MEP) agar "titik" geografis tidak salah
    // tafsir; unit/buah/paket bersifat umum untuk pekerjaan berbasis
    // jumlah.
    count: (() => {
      // Fase 2 Bagian B (audit §1): satuan 'ekor' ditambahkan — dulu
      // "kapasitas 30 ekor" tidak cocok sehingga spec.count null dan
      // num_animals jatuh ke default template 60 ekor.
      const cm = lower.match(/(\d+(?:[.,]\d+)?)\s*(unit|buah|paket|set|titik|ekor)\b/);
      if (!cm) return null;
      const v = NUM(cm[1]);
      if (!(v > 0)) return null;
      if (cm[2] === 'titik' && !/(pondasi|bore|pancang|sumuran|strauss|kloset|floor drain|perkuatan|titik lampu|titik air|instalasi|sanitasi)/.test(lower)) return null;
      return v;
    })(),
    budgetCap,
    location: needs.location,
    materialKeywords,
    extraKeywords,
    isRenovation: /\b(renovasi|rehab|rehabilitasi|perbaikan|restorasi)\b/.test(lower),
    isDemolition: /\b(demolisi|pembongkaran|bongkar)\b/.test(lower),
  };
}

/** Apakah ukuran utama grup ini tersedia dari spesifikasi? */
export function scopeMeasureAvailable(spec: UniversalSpec, scope: ScopeGroup): boolean {
  switch (scope.primaryMeasure) {
    case 'length': return spec.lengthM != null || (scope.id === 'jalan' && spec.areaM2 != null);
    case 'span': return spec.spanM != null;
    case 'area': return spec.areaM2 != null;
    // KELUARGA CACAT A (audit ekstrem 2026-11-08): cakupan sanitasi
    // berisi pekerjaan berbasis JUMLAH dan VOLUME (IPAL per paket,
    // tangki septik per m³) — basis itu kini diterima untuk cakupan
    // sanitasi saja; cakupan areaOrLength lain tidak berubah.
    case 'areaOrLength': return spec.areaM2 != null || spec.lengthM != null
      || (scope.id === 'sanitasi' && (spec.count != null || spec.volumeM3 != null));
    // Audit ekstrem A-094 (2026-11-08): bangunan berbasis JUMLAH UNIT
    // (kos/kontrakan "10 unit") punya basis ukuran yang sah untuk
    // cakupan gedung — template katalognya sendiri berparameter jumlah
    // (num_units/num_rooms/num_villas). Pola yang sama dengan basis
    // jumlah cakupan sanitasi di atas: basis count hanya diterima
    // untuk cakupan yang memang berjenis unit (gedung), bukan global.
    case 'areaOrFloors': return spec.areaM2 != null || spec.floors != null
      || (scope.id === 'gedung' && spec.count != null);
    case 'areaOrBudget': return spec.areaM2 != null || spec.budgetCap != null;
    // KELUARGA CACAT A (audit ekstrem 2026-11-08): cakupan 'any' yang
    // labelnya sendiri menjanjikan "jumlah titik" (pondasi) kini
    // menerima basis jumlah yang diekstrak — sebelumnya spec.count
    // selalu null sehingga janji label itu tidak pernah terpenuhi.
    case 'any': return spec.areaM2 != null || spec.lengthM != null || spec.floors != null || spec.volumeM3 != null || spec.count != null;
    default: return false;
  }
}

/* ------------------------------------------------------------------ */
/* Pencocokan template katalog                                        */
/* ------------------------------------------------------------------ */

export interface TemplatePick {
  template: RabTemplate;
  score: number;
  reasons: string[];
  /** Nilai pengguna yang di luar [min, max] parameter template (bila ada). */
  outOfRange: string[];
  /** Jenis ukuran dari nilai yang di luar batas (untuk aturan demosi). */
  outOfRangeKinds: ParamKind[];
  /** Kata kunci yang cocok di NAMA template (sinyal lebih kuat dari deskripsi). */
  nameMatches: string[];
}

/** Detail satu parameter di luar batas (dipakai scoring + kesiapan draft). */
export interface ParamOutOfRange {
  key: string;
  label: string;
  kind: ParamKind;
  value: number;
  min: number | undefined;
  max: number | undefined;
  detail: string;
}

/**
 * Nilai spek untuk satu parameter template, dikonversi ke satuan
 * parameter itu bila jenisnya tebal (cermin konversi di
 * mapSpecToParams): spek menyebut cm, parameter bisa bermeter/mm.
 * Tanpa konversi ini "tebal 20 cm" dibaca 20 (meter) terhadap batas
 * 0,15–0,35 m — selalu "di luar batas" dan bisa memicu demosi yang
 * salah di pickTemplateForScope. Dipakai mapSpecToParams DAN
 * paramOutOfRangeDetails agar keduanya konsisten.
 */
export function specValueForParam(
  spec: UniversalSpec,
  p: { key: string; label: string; unit?: string }
): number | null {
  const kind = classifyParam(p.key, p.label);
  const v = specValueFor(spec, kind);
  if (v == null) return null;
  if (kind !== 'thickness') return v;
  const unit = (p.unit || '').toLowerCase();
  if (unit === 'm') return v / 100;
  if (unit === 'mm') return v / 10;
  return v; // 'cm' atau tanpa satuan: apa adanya
}

/** Nilai pengguna yang di luar batas parameter template (batas inklusif). */
export function paramOutOfRangeDetails(spec: UniversalSpec, template: RabTemplate): ParamOutOfRange[] {
  const out: ParamOutOfRange[] = [];
  for (const p of template.parameters || []) {
    if (p.type !== 'NUMBER') continue;
    const kind = classifyParam(p.key, p.label);
    const v = specValueForParam(spec, p);
    if (v == null) continue;
    if ((p.min !== undefined && v < p.min) || (p.max !== undefined && v > p.max)) {
      out.push({
        key: p.key,
        label: p.label,
        kind,
        value: v,
        min: p.min,
        max: p.max,
        detail: `${p.label} = ${v}${p.unit ? ` ${p.unit}` : ''} di luar batas template (${p.min !== undefined ? p.min : '–'}–${p.max !== undefined ? p.max : '–'}${p.unit ? ` ${p.unit}` : ''})`,
      });
    }
  }
  return out;
}

/** Jenis ukuran yang relevan untuk primaryMeasure satu cakupan. */
export function relevantParamKinds(primaryMeasure: ScopeGroup['primaryMeasure']): ParamKind[] {
  switch (primaryMeasure) {
    case 'length': return ['length'];
    case 'span': return ['span'];
    case 'area': return ['area'];
    case 'areaOrLength': return ['area', 'length'];
    case 'areaOrFloors': return ['area', 'floors'];
    case 'areaOrBudget': return ['area'];
    case 'any': return [];
    default: return [];
  }
}

/** Keluarga jenis bangunan untuk penalti konflik (kata → keluarga). */
const BUILDING_TYPE_FAMILIES: Array<{ words: string[]; family: string }> = [
  { words: ['kantor', 'perkantoran'], family: 'kantor' },
  { words: ['sekolah'], family: 'sekolah' },
  { words: ['rumah sakit'], family: 'rumah sakit' },
  { words: ['klinik'], family: 'klinik' },
  { words: ['hotel'], family: 'hotel' },
  { words: ['gudang', 'warehouse'], family: 'gudang' },
  { words: ['masjid'], family: 'masjid' },
  { words: ['puskesmas'], family: 'puskesmas' },
  { words: ['pasar'], family: 'pasar' },
  { words: ['villa'], family: 'villa' },
  { words: ['apartemen'], family: 'apartemen' },
  { words: ['ruko'], family: 'ruko' },
];

function familiesIn(text: string): string[] {
  const t = ` ${(text || '').toLowerCase()} `;
  const found: string[] = [];
  for (const f of BUILDING_TYPE_FAMILIES) {
    for (const w of f.words) {
      // Kata pendek/frasa dicocokkan sebagai substring dengan batas kata
      // longgar (agar 'perkantoran' tetap mengenali keluarga 'kantor').
      if (t.includes(w)) {
        found.push(f.family);
        break;
      }
    }
  }
  return found;
}

function templateText(t: RabTemplate): string {
  return `${t.name} ${t.description ?? ''} ${t.subcategory ?? ''}`.toLowerCase();
}

/** Klasifikasi semantik parameter template dari key + label. */
export type ParamKind = 'length' | 'span' | 'width' | 'area' | 'thickness' | 'floors' | 'height' | 'volume' | 'count' | 'other';

export function classifyParam(key: string, label: string): ParamKind {
  const s = `${key} ${label}`.toLowerCase();
  if (/span|bentang/.test(s)) return 'span';
  if (/length|panjang|lintasan/.test(s)) return 'length';
  if (/width|lebar/.test(s)) return 'width';
  if (/\barea\b|luas/.test(s)) return 'area';
  if (/thickness|tebal/.test(s)) return 'thickness';
  if (/floor|lantai/.test(s)) return 'floors';
  if (/height|tinggi/.test(s)) return 'height';
  if (/volume/.test(s)) return 'volume';
  if (/count|jumlah|num_|sel|unit_count/.test(s)) return 'count';
  return 'other';
}

/** Nilai spesifikasi untuk tiap jenis ukuran (dipakai pemetaan parameter). */
export function specValueFor(spec: UniversalSpec, kind: ParamKind): number | null {
  switch (kind) {
    case 'length': return spec.lengthM;
    case 'span': return spec.spanM;
    case 'width': return spec.widthM;
    case 'area': return spec.areaM2;
    case 'thickness': return spec.thicknessCm;
    case 'floors': return spec.floors;
    case 'height': return spec.heightM;
    case 'volume': return spec.volumeM3;
    case 'count': return spec.count;
    default: return null;
  }
}

/**
 * Nilai parameter template dari spesifikasi pengguna. Mengembalikan null
 * bila spesifikasi tidak menyebut ukuran itu — pemanggil memakai default
 * template dan MENCATATNYA sebagai asumsi (bukan mengarang).
 */
export function mapSpecToParams(
  spec: UniversalSpec,
  template: RabTemplate,
  booleanOverrides?: Record<string, boolean>,
  selectOverrides?: Record<string, string>
): { params: Record<string, unknown>; usedFromUser: string[]; defaulted: string[] } {
  const params: Record<string, unknown> = {};
  const usedFromUser: string[] = [];
  const defaulted: string[] = [];
  for (const p of template.parameters || []) {
    // BOOLEAN (Fase 2 Bagian B): override terstruktur dulu, lalu
    // default template. Dulu param BOOLEAN tidak pernah di-set dari
    // jawaban — mis. has_drainage selalu default true apa pun jawaban
    // drainase pengguna.
    if (p.type === 'BOOLEAN') {
      if (booleanOverrides && p.key in booleanOverrides) {
        params[p.key] = booleanOverrides[p.key];
        // GATE 5 (5E): tanpa sufiks "(dari jawaban Anda)" — buildDraftPart
        // sudah menambahkan "(dari pesan Anda)" ke tiap entri usedFromUser,
        // sehingga sufiks di sini menghasilkan gandaan "(dari jawaban Anda)
        // (dari pesan Anda)" di teks asumsi (cacat kosmetik pra-ada).
        usedFromUser.push(`${p.label} = ${booleanOverrides[p.key] ? 'ya' : 'tidak'}`);
      } else if (p.defaultValue !== undefined) {
        params[p.key] = p.defaultValue;
        defaulted.push(`${p.label} memakai default template (${p.defaultValue ? 'ya' : 'tidak'})`);
      }
      continue;
    }
    // SELECT (keputusan katalog owner 2026-11-12 03:41): varian
    // material terstruktur (mis. roof_material='galvalum') memilih
    // komponen varian template lewat condition; tanpa override,
    // template memakai default-nya (mis. 'spandek'/'upvc'). Nilai
    // override HARUS salah satu nilai opsi template — bila bukan,
    // generateRabFromTemplate tetap memakainya apa adanya sehingga
    // condition varian tidak ada yang lolos dan komponen default
    // (yang juga berkondisi) ikut tidak muncul; karena itu di sini
    // nilai yang bukan opsi DITOLAK ke default dengan catatan.
    if (p.type === 'SELECT') {
      const options = (p as { options?: Array<{ value: string | number }> }).options ?? [];
      const wanted = selectOverrides?.[p.key];
      if (wanted != null && options.some((o) => String(o.value) === String(wanted))) {
        params[p.key] = wanted;
        // GATE 5 (5E): tanpa sufiks "(dari jawaban Anda)" — lihat cabang
        // BOOLEAN di atas (gandaan sufiks pra-ada).
        usedFromUser.push(`${p.label} = ${wanted}`);
      } else {
        if (wanted != null) {
          defaulted.push(`${p.label}: jawaban '${wanted}' bukan opsi template — memakai default template`);
        }
        if (p.defaultValue !== undefined) {
          params[p.key] = p.defaultValue;
          defaulted.push(`${p.label} memakai default template (${p.defaultValue})`);
        }
      }
      continue;
    }
    if (p.type !== 'NUMBER') continue;
    const kind = classifyParam(p.key, p.label);
    const raw = specValueFor(spec, kind);
    // Konversi satuan tebal (temuan samping audit §8): spek menyebut
    // cm; parameter bermeter (concrete_thickness_m, unit 'm') harus
    // menerima 20 cm → 0,2 m (dulu terisi 20). Unit 'mm' → /10,
    // 'cm'/tanpa satuan → apa adanya. Hanya diterapkan bila unit
    // parameter memang meter/mm.
    const v = raw == null ? null : specValueForParam(spec, p);
    if (v != null) {
      params[p.key] = v;
      usedFromUser.push(
        kind === 'thickness' && raw !== v
          ? `${p.label} = ${v}${p.unit ? ` ${p.unit}` : ''} (dari ${raw} cm yang Anda sebut)`
          : `${p.label} = ${v}${p.unit ? ` ${p.unit}` : ''}`
      );
    } else if (p.defaultValue !== undefined) {
      params[p.key] = p.defaultValue;
      defaulted.push(`${p.label} memakai default template (${p.defaultValue}${p.unit ? ` ${p.unit}` : ''})`);
    }
  }
  return { params, usedFromUser, defaulted };
}

/** Skor template terhadap cakupan + spesifikasi (transparan, deterministik).
 *
 * Pelajaran dari bukti (probe 2026-10-26): skor lama seri (margin 0) di
 * hampir semua kasus karena kata kunci deskripsi tidak membedakan
 * ('beton' muncul di deskripsi hampir semua template). Karena itu:
 * - kecocokan di NAMA template berbobot lebih (+4 per kata, maks +12);
 * - jenis bangunan yang bertentangan di nama template dipenalti (-8);
 * - ukuran utama dinilai atas SEMUA jenis relevan cakupan (areaOrFloors
 *   dsb.), bukan satu jenis saja; penalti -8 hanya bila pengguna SUDAH
 *   menyebut ukuran tetapi template tidak menerima satu pun jenisnya
 *   (bila pengguna belum menyebut ukuran, tidak ada penalti — template
 *   renovasi tanpa luas tetap layak dipilih, bukan ditolak).
 * - nilai di luar batas parameter TIDAK menghukum skor di sini (lihat
 *   pickTemplateForScope: demosi hanya bila ada kandidat dalam batas yang
 *   layak; bila semua kandidat di luar batas, pemenang tetap dipakai
 *   dengan peringatan agar perilaku lama tidak rusak mendadak).
 */
export function scoreTemplate(
  spec: UniversalSpec,
  scope: ScopeGroup,
  template: RabTemplate
): TemplatePick {
  let score = 0;
  const reasons: string[] = [];
  const text = templateText(template);
  const name = (template.name || '').toLowerCase();
  if (scope.categories.includes(template.category)) {
    score += 10;
    reasons.push('kategori sesuai cakupan');
  } else {
    score -= 20;
  }
  // Kecocokan kata kunci material/lingkup pada nama/deskripsi template.
  for (const kw of [...spec.materialKeywords, ...spec.extraKeywords, scope.label.toLowerCase()]) {
    if (kw && text.includes(kw)) {
      score += 3;
      reasons.push(`cocok kata kunci "${kw}"`);
    }
  }
  // Kata jenis bangunan (kantor/sekolah/dll.) pada template gedung.
  if (spec.kindLabel) {
    const kl = spec.kindLabel.toLowerCase();
    if (kl.length >= 4 && text.includes(kl)) {
      score += 5;
      reasons.push(`cocok jenis "${spec.kindLabel}"`);
    }
  }
  // Bobot nama: kata kunci yang DISEBUT PENGGUNA (material, lingkup,
  // kata kunci cakupan yang benar-benar muncul di pesan) yang muncul di
  // NAMA template adalah sinyal yang jauh lebih membedakan daripada
  // deskripsi. Koreksi atas draf pertama hardening: memakai SEMUA kata
  // kunci cakupan (termasuk yang tidak disebut, mis. 'aspal' untuk
  // permintaan paving) terbukti memilih template yang salah
  // (INFRA-ROAD-ASPHALT mengalahkan PAV-KOMPLEK-6CM) — hanya kata yang
  // disebut pengguna yang boleh berbobot nama.
  const rawLower = (spec.rawText || '').toLowerCase();
  const nameKeywords = new Set<string>();
  // Sinonim lintas bahasa (Fase 5): "warehouse" adalah gudang — kata
  // nama template katalog memakai "gudang", jadi sinonimnya ikut
  // berbobot nama agar template gudang tidak kalah oleh template
  // kantor yang hanya cocok di deskripsi.
  if (rawLower.includes('warehouse')) nameKeywords.add('gudang');
  for (const kw of [...spec.materialKeywords, ...spec.extraKeywords]) {
    if (kw) nameKeywords.add(kw.toLowerCase());
  }
  for (const kw of scope.keywords) {
    if (kw && rawLower.includes(kw.toLowerCase())) nameKeywords.add(kw.toLowerCase());
  }
  if (spec.kindLabel) {
    for (const tok of spec.kindLabel.toLowerCase().split(/[/\s]+/)) {
      if (tok.length >= 4) nameKeywords.add(tok);
    }
  }
  const nameMatches: string[] = [];
  for (const kw of nameKeywords) {
    if (kw.length >= 4 && name.includes(kw)) nameMatches.push(kw);
  }
  if (nameMatches.length > 0) {
    const bonus = Math.min(12, nameMatches.length * 4);
    score += bonus;
    reasons.push(`nama template cocok: ${nameMatches.join(', ')} (+${bonus})`);
  }
  // Konflik jenis bangunan: permintaan menyebut satu keluarga (kantor),
  // template bernama keluarga lain (sekolah/rumah sakit) → penalti.
  const userFamilies = familiesIn(spec.rawText);
  const templateFamilies = familiesIn(template.name || '');
  if (userFamilies.length > 0 && templateFamilies.length > 0 &&
      !templateFamilies.some((f) => userFamilies.includes(f))) {
    score -= 8;
    reasons.push(`jenis bangunan tidak cocok (template untuk ${templateFamilies.join('/')}, permintaan ${userFamilies.join('/')})`);
  }
  // Kompatibilitas ukuran utama: template menerima ukuran yang disebut user.
  const relevant = relevantParamKinds(scope.primaryMeasure);
  const templateKindsAll = new Set(
    (template.parameters || [])
      .filter((p) => p.type === 'NUMBER')
      .map((p) => classifyParam(p.key, p.label))
  );
  // Basis JUMLAH (audit ekstrem A-094): bila pengguna menyebut jumlah
  // (unit/titik/buah), template yang berparameter jumlah menerima
  // basis ukuran itu — tanpa bonus ini semua template se-kategori seri
  // dan pilihan jatuh ke urutan katalog (kantor untuk "kontrakan
  // 10 unit"). Aturan umum untuk semua cakupan berbasis jumlah.
  if (spec.count != null && templateKindsAll.has('count')) {
    score += 6;
    reasons.push('menerima basis jumlah yang disebut');
  }
  if (relevant.length > 0) {
    const templateKinds = templateKindsAll;
    const provided = relevant.filter((k) => specValueFor(spec, k) != null);
    if (provided.some((k) => templateKinds.has(k))) {
      score += 6;
      reasons.push('menerima ukuran utama yang disebut');
    } else if (provided.includes('area') && templateKinds.has('length') && templateKinds.has('width')) {
      // Template yang didimensi PASANGAN panjang × lebar (kolam,
      // lapangan) menerima basis luas lewat dimensi tapaknya — luas
      // pengguna dipetakan dari dimensi yang ia sebut sendiri.
      // Sebelumnya template semacam ini selalu kena penalti "tidak
      // menerima ukuran utama" walau dimensinya persis yang diminta
      // (audit ekstrem A-088: kolam tidak pernah bisa dipilih).
      score += 6;
      reasons.push('menerima ukuran utama lewat pasangan panjang × lebar');
    } else if (provided.length > 0 && !relevant.some((k) => templateKinds.has(k))) {
      score -= 8;
      reasons.push('tidak menerima ukuran utama');
    }
  }
  const outOfRange = paramOutOfRangeDetails(spec, template);
  for (const o of outOfRange) reasons.push(`di luar batas: ${o.detail}`);
  return { template, score, reasons, outOfRange: outOfRange.map((o) => o.detail), outOfRangeKinds: outOfRange.map((o) => o.kind), nameMatches };
}

/** Template resmi (EZRAB_OFFICIAL) saja — template kustom tidak dipakai. */
export function officialTemplates(): RabTemplate[] {
  return RabTemplateService.getInstance()
    .getAllTemplates()
    .filter((t) => t.metadata.source === 'EZRAB_OFFICIAL');
}

export interface ScopePickResult {
  pick: TemplatePick | null;
  /** Urutan skor murni (stabil, urutan katalog dipertahankan saat seri). */
  ranked: TemplatePick[];
  /** pick.score − skor tertinggi kandidat lain (negatif bila pick didemosi). */
  scoreMargin: number;
  /** true bila selisih dengan pesaing terdekat ≤ 3 — pilihan tidak tegas. */
  closeCall: boolean;
  /** Kandidat skor tertinggi yang didemosi karena di luar batas parameter. */
  demoted: TemplatePick | null;
}

/**
 * Pilih template terbaik untuk satu grup cakupan. Mengembalikan null bila
 * tidak ada kandidat yang layak (skor < 8) — pemanggil menjawab jujur,
 * bukan memaksa template yang tidak cocok.
 *
 * Aturan demosi batas parameter: bila pemenang skor memiliki nilai
 * pengguna di luar batasnya TETAPI ada kandidat dalam batas dengan skor
 * ≥ 8, kandidat dalam batas itu yang dipakai (pemenang dicatat di
 * `demoted`). Bila semua kandidat layak di luar batas, pemenang tetap
 * dipakai — penolakan total akan mengubah draft lama menjadi needs-spec
 * tanpa pemberitahuan (kasus teruji: struktur luas 200 m², semua template
 * STRUKTUR_BETON_BAJA berbatas ≥ 300 m²); peringatan + status BLOCKED
 * untuk cakupan kritis ditangani di draftReadiness, bukan di sini.
 */
export function pickTemplateForScope(
  spec: UniversalSpec,
  scope: ScopeGroup
): ScopePickResult {
  const candidates = officialTemplates()
    .filter((t) => scope.categories.includes(t.category))
    .map((t, i) => ({ pick: scoreTemplate(spec, scope, t), idx: i }))
    .sort((a, b) => b.pick.score - a.pick.score || a.idx - b.idx)
    .map((x) => x.pick);
  let best = candidates[0] ?? null;
  let demoted: TemplatePick | null = null;
  // Demosi HANYA untuk nilai di luar batas pada jenis NON-relevan (mis.
  // tebal sekunder). Bila ukuran UTAMA cakupan yang di luar batas
  // (mis. bentang jembatan 50 m), demosi ke template bentang lebih panjang
  // akan menyembunyikan penjaga needs-spec jembatan di build — jadi tidak
  // ada demosi di kasus itu; pemenang dipertahankan dan penjaga build
  // yang memutuskan (needs-spec / BLOCKED).
  const relevant = relevantParamKinds(scope.primaryMeasure);
  if (best && best.score >= 8 && best.outOfRange.length > 0 &&
      best.outOfRangeKinds.every((k) => !relevant.includes(k))) {
    const inRange = candidates.find((c) => c !== best && c.score >= 8 && c.outOfRange.length === 0);
    if (inRange) {
      demoted = best;
      best = inRange;
    }
  }
  const pick = best && best.score >= 8 ? best : null;
  const others = candidates.filter((c) => c !== pick);
  const margin = pick ? pick.score - (others[0]?.score ?? pick.score) : 0;
  return {
    pick,
    ranked: candidates,
    scoreMargin: pick ? margin : 0,
    closeCall: !!pick && candidates.length >= 2 && margin <= 3,
    demoted,
  };
}

/* ------------------------------------------------------------------ */
/* Model draft                                                         */
/* ------------------------------------------------------------------ */

export interface DraftPart {
  scope: ScopeGroup;
  template: RabTemplate;
  /** Parameter yang dievaluasi saat generate (termasuk default template). */
  evaluatedParams: Record<string, unknown>;
  generation: GeneratedTemplateRabResult;
  /** Item yang dihapus pengguna pada part ini (kunci deskripsi+satuan). */
  removedKeys: string[];
  /** Harga manual pengguna per kunci item: unitPrice + catatan. */
  manualPrices: Record<string, { unitPrice: number; note: string }>;
  /**
   * GATE 2 (5B) — seksi part ini di dalam RAB terkonsolidasi.
   *  - `buildingId` (mis. 'gedung-a') + sectionKind 'building': part
   *    milik SATU gedung, dihitung dari spek gedung itu (`spec`);
   *  - sectionKind 'shared-works' (buildingId kosong): Shared Project
   *    Works — dihitung SEKALI di tingkat proyek;
   *  - sectionKind 'project' / KEDUA MEDAN ABSEN: part tingkat proyek
   *    (perilaku warisan). Part single-building TIDAK PERNAH membawa
   *    medan ini — JSON-nya identik dengan sebelum Gate 2.
   */
  buildingId?: string | null;
  sectionKind?: 'building' | 'shared-works' | 'project';
  /**
   * GATE 2 (5B) — spek yang dipakai membangun part ini. Untuk part
   * gedung: spek PER GEDUNG (turunan `specForBuilding`); untuk part
   * lain: ABSEN (= spek proyek `draft.spec`). Disimpan bersama part
   * agar volumeBasis, regenerasi revisi, dan (Gate 3) revisi
   * per-gedung memakai spek yang benar — bukan spek proyek yang
   * membawa data gedung pertama.
   */
  spec?: UniversalSpec;
}

export interface DraftVersion {
  n: number;
  summary: string;
  itemCount: number;
  estimatedTotal: number;
}

export interface UniversalDraft {
  id: string;
  title: string;
  spec: UniversalSpec;
  parts: DraftPart[];
  assumptions: string[];
  warnings: string[];
  /** Daftar perubahan sejak versi sebelumnya (ringkasan revisi). */
  changes: string[];
  versions: DraftVersion[];
  version: number;
  createdAt: string;
  /** Bukti transfer terakhir (idempotensi): projectId + versi + jumlah. */
  lastTransfer: { projectId: string; version: number; pushed: number; skipped: number; at: string } | null;
  /** Spek terstruktur yang dipakai membangun draft ini (bila ada) —
   *  dipakai draftReadiness/partIssues + revisi agar override boolean
   *  dan gap pondasi tetap konsisten sesudah revisi. */
  structuredSpecs?: StructuredSpec[];
  /** Laporan validasi rantai spesifikasi → RAB (hanya bila spek ada). */
  chainValidation?: ChainValidation;
  /** Pilihan template ambigu (close-call / material tak tersedia). */
  ambiguousPicks?: Array<{ scope: string; chosen: string; candidates: string[]; reason: string }>;
  /** Model per-bangunan (FASE 4, CHAT-03): diparse dari teks mentah
   *  permintaan — tiap bangunan menyimpan jumlah lantainya sendiri.
   *  Ditampilkan di pesan draft agar ringkasan tidak meruntuhkan
   *  lantai multi-gedung menjadi satu angka (mesin template sendiri
   *  masih satu-bangunan; per-part per bangunan = Fase 5). Data JSON
   *  polos — aman dipersistensi bersama draft. */
  buildings?: BuildingModel[];
  /** Rekonsiliasi DED/QTO saat draft disusun (GATE 4 / 5D): hasil
   *  pemeriksaan qtoBridge atas item DED lampiran vs dimensi pengguna
   *  + keputusan konfirmasi/penolakan koreksi. LAPISAN VALIDASI —
   *  tidak mengubah total/isi RAB kanonis. Data JSON polos, ikut
   *  dipersistensi (skema record tetap v1) + ikut terklon pratinjau
   *  revisi Gate 3. Absen = draft tanpa DED terlampir (perilaku lama). */
  dedQto?: DedQtoDraftInfo;
}

export type DraftItem = RabItem & {
  __partScope: string;
  __partTemplate: string;
  /** GATE 2 (5B) — seksi asal item (pola penanda yang sama dengan __partScope). */
  __buildingId?: string | null;
  __sectionKind?: 'building' | 'shared-works' | 'project';
};

export function itemKey(it: { description: string; unit: string }): string {
  return `${it.description.trim().toLowerCase()}|${it.unit}`;
}

/** Item efektif draft: hasil generate minus yang dihapus + harga manual.
 *  Id dibuat unik lintas part (templateId::id asal) karena beberapa
 *  template dapat menghasilkan id komponen yang sama. */
export function effectiveItems(draft: UniversalDraft): DraftItem[] {
  const out: DraftItem[] = [];
  for (const part of draft.parts) {
    for (const it of part.generation.items) {
      const key = itemKey(it);
      if (part.removedKeys.includes(key)) continue;
      const manual = part.manualPrices[key];
      out.push({
        ...it,
        id: `${part.template.id}::${it.id}`,
        __partScope: part.scope.label,
        __partTemplate: part.template.name,
        // GATE 2 (5B) — penanda seksi (absen = part tingkat-proyek warisan).
        ...(part.buildingId ? { __buildingId: part.buildingId } : {}),
        ...(part.sectionKind ? { __sectionKind: part.sectionKind } : {}),
        ...(manual
          ? {
              unitPrice: manual.unitPrice,
              amount: manual.unitPrice * it.volume,
              totalPrice: manual.unitPrice * it.volume,
              priceStatus: 'PRICE_MANUAL' as const,
              priceSourceLabel: 'Harga manual pengguna',
              priceSourceExplanation: manual.note,
            }
          : {}),
      });
    }
  }
  return out;
}

/**
 * Validitas harga untuk total/ekspor — SATU-SATUNYA gerbang yang sah.
 * Aturan sentinel (kontrak lama rabItemFactory): PRICE_UNRESOLVED disimpan
 * sebagai unitPrice 0. Karena itu nilai 0 TIDAK PERNAH dipakai untuk
 * memutuskan "ada harga": item dengan unitPrice 0 + PRICE_UNRESOLVED
 * adalah BELUM TERSEDIA (bukan harga Rp0 yang valid), sedangkan harga 0
 * eksplisit dengan status RESOLVED/MANUAL adalah harga valid.
 * Item legacy tanpa priceStatus diperlakukan resolved bila unitPrice ada
 * (kompatibilitas ke belakang, sama seperti UnifiedProjectEngine).
 */
export function isPriceValidForTotal(it: { priceStatus?: string | null; unitPrice?: number | null }): boolean {
  if (it.priceStatus === 'PRICE_UNRESOLVED') return false;
  return it.unitPrice != null && Number.isFinite(it.unitPrice);
}

/** Jumlah item bila harganya valid, null bila belum dapat dihitung. */
export function pricedAmount(it: { volume: number; priceStatus?: string | null; unitPrice?: number | null }): number | null {
  return isPriceValidForTotal(it) ? it.volume * (it.unitPrice as number) : null;
}

export interface StoredItemsSummary {
  pricedCount: number;
  unpricedCount: number;
  verifiedTotal: number;
  marketTotal: number;
  databaseTotal: number;
  manualTotal: number;
  pricedTotal: number;
  status: 'PARSIAL' | 'ESTIMASI' | 'LENGKAP';
}

/**
 * Ringkasan untuk item PASCA-PENYIMPANAN (record factory, ekspor, laporan).
 * Memakai gating status — bukan nilai — sehingga sentinel unitPrice 0
 * untuk PRICE_UNRESOLVED tidak pernah masuk total sebagai harga valid
 * dan tidak pernah ditampilkan sebagai Rp0 yang sah. Fungsi ini yang
 * seharusnya dipakai jalur ekspor; view spreadsheet/ekspor yang masih
 * menjumlah unitPrice mentah adalah tindak lanjut di luar modul ini
 * (view.tsx di luar pagar tugas ini).
 */
export function summarizeStoredItems(
  items: Array<{ volume: number; priceStatus?: string | null; unitPrice?: number | null; priceSourceKind?: string | null }>
): StoredItemsSummary {
  let verifiedTotal = 0;
  let marketTotal = 0;
  let databaseTotal = 0;
  let manualTotal = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  let officialCount = 0;
  let nonOfficialPriced = 0;
  for (const it of items) {
    const amt = pricedAmount(it);
    if (amt == null) {
      unpricedCount++;
      continue;
    }
    pricedCount++;
    if (it.priceStatus === 'PRICE_MANUAL') {
      manualTotal += amt;
      nonOfficialPriced++;
    } else if (it.priceSourceKind === 'OFFICIAL_AHSP') {
      verifiedTotal += amt;
      officialCount++;
    } else if (it.priceSourceKind === 'MARKET_REFERENCE') {
      marketTotal += amt;
      nonOfficialPriced++;
    } else {
      databaseTotal += amt;
      nonOfficialPriced++;
    }
  }
  void officialCount;
  const pricedTotal = verifiedTotal + marketTotal + databaseTotal + manualTotal;
  const status = unpricedCount > 0 ? 'PARSIAL' : (nonOfficialPriced > 0 ? 'ESTIMASI' : 'LENGKAP');
  return { pricedCount, unpricedCount, verifiedTotal, marketTotal, databaseTotal, manualTotal, pricedTotal, status };
}

/** Status tampil harga satu item (pemetaan ke label konseptual). */
export function displayPriceStatus(it: RabItem): { label: string; detail: string } {
  // Sentinel dulu: record pasca-transfer dengan unitPrice 0 + status
  // UNRESOLVED adalah BELUM TERSEDIA — tanpa cek ini ia akan tampil
  // sebagai RESMI/DATABASE berdasarkan kind lamanya (bug nyata).
  if (it.priceStatus === 'PRICE_UNRESOLVED' || it.unitPrice == null) {
    return { label: 'BELUM TERSEDIA', detail: 'Harga belum tersedia' };
  }
  if (it.priceStatus === 'PRICE_MANUAL') {
    return { label: 'HARGA MANUAL', detail: it.priceSourceExplanation || 'Harga manual pengguna' };
  }
  if (it.priceSourceKind === 'OFFICIAL_AHSP') {
    return {
      label: 'RESMI AHSP',
      detail: it.priceSourceName ? `AHSP resmi (${it.priceSourceName})` : 'AHSP resmi tervalidasi',
    };
  }
  if (it.priceSourceKind === 'MARKET_REFERENCE') {
    // Final Fix: metadata pasar kini tampil per item bila tercatat.
    if (it.priceSourceName) {
      const meta = [it.priceSourceName, it.priceSourceDate ? `berlaku ${it.priceSourceDate}` : '', it.priceSourceRegion || ''].filter(Boolean).join(' · ');
      return { label: 'REFERENSI PASAR', detail: `Referensi pasar (${meta})` };
    }
    return { label: 'REFERENSI PASAR', detail: it.priceSourceLabel || 'Referensi pasar' };
  }
  if (it.ahspMappingStatus === 'NEEDS_MAPPING' || it.ahspMappingStatus === 'UNIT_MISMATCH') {
    return { label: 'HARGA DATABASE', detail: `Harga database (pemetaan: ${it.ahspMappingStatus})` };
  }
  return { label: 'HARGA DATABASE', detail: it.priceSourceLabel || 'Harga database EZRAB' };
}

export interface DraftTotals {
  verifiedTotal: number;
  databaseTotal: number;
  marketTotal: number;
  manualTotal: number;
  estimatedTotal: number;
  officialCount: number;
  databaseCount: number;
  marketCount: number;
  manualCount: number;
  unpricedCount: number;
  needsSpecCount: number;
  /** PARSIAL bila ada harga kosong; ESTIMASI bila ada harga non-resmi; LENGKAP bila semua resmi. */
  status: 'PARSIAL' | 'ESTIMASI' | 'LENGKAP';
}

/** Total dihitung dari item efektif — aritmetika deterministik, bukan LLM. */
export function computeTotals(draft: UniversalDraft): DraftTotals {
  return totalsFromItems(effectiveItems(draft));
}

/**
 * GATE 2 (5B) — total dari daftar item (dipakai `computeTotals` untuk
 * total proyek DAN `computeSectionTotals` untuk total per seksi, agar
 * kedua penjumlahan memakai SATU definisi ember harga yang sama).
 * Urutan item dipertahankan apa adanya — total proyek dari
 * `effectiveItems(draft)` menghasilkan angka yang identik dengan
 * sebelum refactor ini.
 */
export function totalsFromItems(
  items: Array<{ volume: number; unitPrice?: number | null; priceStatus?: string | null; priceSourceKind?: string | null; ahspMappingStatus?: string | null }>
): DraftTotals {
  let verifiedTotal = 0;
  let databaseTotal = 0;
  let marketTotal = 0;
  let manualTotal = 0;
  let officialCount = 0;
  let databaseCount = 0;
  let marketCount = 0;
  let manualCount = 0;
  let unpricedCount = 0;
  let needsSpecCount = 0;
  for (const it of items) {
    if (it.ahspMappingStatus === 'NEEDS_MAPPING') needsSpecCount++;
    // Gating status (bukan nilai): item PRICE_UNRESOLVED dengan sentinel
    // unitPrice 0 dari record lama tetap dihitung BELUM TERSEDIA.
    if (!isPriceValidForTotal(it)) {
      unpricedCount++;
      continue;
    }
    const amt = it.volume * (it.unitPrice as number);
    if (it.priceStatus === 'PRICE_MANUAL') {
      manualTotal += amt;
      manualCount++;
    } else if (it.priceSourceKind === 'OFFICIAL_AHSP') {
      verifiedTotal += amt;
      officialCount++;
    } else if (it.priceSourceKind === 'MARKET_REFERENCE') {
      // Referensi pasar: ember sendiri — tidak pernah masuk total
      // terverifikasi maupun total database.
      marketTotal += amt;
      marketCount++;
    } else {
      databaseTotal += amt;
      databaseCount++;
    }
  }
  const estimatedTotal = verifiedTotal + databaseTotal + marketTotal + manualTotal;
  const status = unpricedCount > 0 ? 'PARSIAL' : (databaseCount > 0 || marketCount > 0 || manualCount > 0 ? 'ESTIMASI' : 'LENGKAP');
  return { verifiedTotal, databaseTotal, marketTotal, manualTotal, estimatedTotal, officialCount, databaseCount, marketCount, manualCount, unpricedCount, needsSpecCount, status };
}

export interface DraftSectionTotals {
  /** Kunci seksi: id gedung, 'shared-works', atau 'project'. */
  key: string;
  kind: 'building' | 'shared-works' | 'project';
  /** Label tampilan seksi ("Gedung A", SHARED_WORKS_LABEL, "Proyek"). */
  label: string;
  buildingId: string | null;
  /** Nama template part-part seksi ini (urut kemunculan). */
  templates: string[];
  itemCount: number;
  totals: DraftTotals;
}

/**
 * GATE 2 (5B) — total per seksi (per gedung + shared works + proyek).
 * Part tanpa `buildingId`/`sectionKind` (draft lama & single-building)
 * masuk seksi 'project' — satu seksi yang totalnya = total proyek.
 * Part dengan `buildingId` yang tidak ada di `draft.buildings` juga
 * masuk seksi 'project' (tidak pernah mengarang gedung — lihat §1.4
 * laporan Gate 2); itemnya tetap masuk total, tidak pernah hilang.
 */
export function computeSectionTotals(draft: UniversalDraft): DraftSectionTotals[] {
  const items = effectiveItems(draft);
  const knownBuildings = new Map((draft.buildings ?? []).map((b) => [b.id, b.label]));
  const sections = new Map<string, { kind: DraftSectionTotals['kind']; label: string; buildingId: string | null; templates: string[]; items: DraftItem[] }>();
  const ensure = (key: string, kind: DraftSectionTotals['kind'], label: string, buildingId: string | null) => {
    let s = sections.get(key);
    if (!s) {
      s = { kind, label, buildingId, templates: [], items: [] };
      sections.set(key, s);
    }
    return s;
  };
  // Urutan seksi: gedung sesuai urutan draft.buildings, lalu shared
  // works, lalu proyek. (Map mempertahankan urutan penyisipan; gedung
  // di-seed dulu agar urutannya stabil walau part datang acak.)
  for (const b of draft.buildings ?? []) {
    ensure(b.id, 'building', b.label, b.id);
  }
  for (const part of draft.parts) {
    const key = part.buildingId && knownBuildings.has(part.buildingId)
      ? part.buildingId
      : part.sectionKind === 'shared-works'
        ? 'shared-works'
        : 'project';
    const kind: DraftSectionTotals['kind'] = key === 'shared-works'
      ? 'shared-works'
      : key === 'project'
        ? 'project'
        : 'building';
    const label = kind === 'shared-works'
      ? SHARED_WORKS_LABEL
      : kind === 'project'
        ? 'Proyek'
        : knownBuildings.get(key) ?? key;
    const s = ensure(key, kind, label, kind === 'building' ? key : null);
    if (!s.templates.includes(part.template.name)) s.templates.push(part.template.name);
  }
  for (const it of items) {
    const key = it.__buildingId && knownBuildings.has(it.__buildingId)
      ? it.__buildingId
      : it.__sectionKind === 'shared-works'
        ? 'shared-works'
        : 'project';
    const kind: DraftSectionTotals['kind'] = key === 'shared-works'
      ? 'shared-works'
      : key === 'project'
        ? 'project'
        : 'building';
    const label = kind === 'shared-works'
      ? SHARED_WORKS_LABEL
      : kind === 'project'
        ? 'Proyek'
        : knownBuildings.get(key) ?? key;
    ensure(key, kind, label, kind === 'building' ? key : null).items.push(it);
  }
  const out: DraftSectionTotals[] = [];
  for (const [key, s] of sections) {
    // Seksi gedung tanpa part (gedung ditandai hilang) tidak muncul di
    // ringkasan angka — ia muncul sebagai peringatan, bukan seksi Rp0.
    if (s.kind === 'building' && s.templates.length === 0) continue;
    out.push({
      key,
      kind: s.kind,
      label: s.label,
      buildingId: s.buildingId,
      templates: s.templates,
      itemCount: s.items.length,
      totals: totalsFromItems(s.items),
    });
  }
  return out;
}

export interface MultiBuildingReconciliation {
  sections: DraftSectionTotals[];
  projectTotal: DraftTotals;
  /** Σ total estimasi seksi. */
  sumOfSections: number;
  /** Selisih (total proyek − Σ seksi) dalam rupiah. */
  diffRp: number;
  /** Seimbang bila |selisih| < setengah sen (batas ulp float). */
  balanced: boolean;
}

/**
 * GATE 2 (5B) — rekonsiliasi: total proyek (kanonis, `computeTotals`)
 * HARUS sama dengan jumlah total seksi. Penjumlahan seksi memakai
 * urutan asosiasi yang berbeda dari penjumlahan datar sehingga selisih
 * ulp float mungkin muncul — ambang keseimbangan adalah setengah sen
 * (Rp0,005), BUKAN nol bit; selisih mentahnya selalu dilaporkan.
 */
export function reconcileMultiBuildingTotals(draft: UniversalDraft): MultiBuildingReconciliation {
  const sections = computeSectionTotals(draft);
  const projectTotal = computeTotals(draft);
  const sumOfSections = sections.reduce((acc, s) => acc + s.totals.estimatedTotal, 0);
  const diffRp = projectTotal.estimatedTotal - sumOfSections;
  return { sections, projectTotal, sumOfSections, diffRp, balanced: Math.abs(diffRp) < 0.005 };
}

/* ------------------------------------------------------------------ */
/* Kesiapan draft (FASE 3): siap ditinjau / perlu spesifikasi /       */
/* diblokir untuk transfer — dihitung LANGSUNG dari data draft saat    */
/* ini (bukan status tersimpan yang bisa basi sesudah revisi).         */
/* ------------------------------------------------------------------ */

export type DraftReadinessStatus = 'READY' | 'NEEDS_SPEC' | 'BLOCKED';

export interface DraftReadiness {
  status: DraftReadinessStatus;
  /** Semua alasan (blokir + perlu-spesifikasi), untuk pesan. */
  reasons: string[];
  /** Subset alasan yang MEMBLOKIR transfer (kosong bila tidak diblokir). */
  blockedReasons: string[];
}

/** Cakupan yang pekerjaannya engineering-kritis (bukan sekadar katalog). */
export const CRITICAL_SCOPES: UniversalScopeId[] = ['jembatan', 'pondasi', 'struktur'];

/** Frasa jenis pondasi yang spesifik (di luar kata generik 'pondasi'). */
const FOUNDATION_TYPE_PHRASES = [
  'bore pile', 'bored pile', 'tiang pancang', 'foot plat', 'sumuran', 'strauss', 'mini pile', 'raft',
];

export interface PartIssues {
  outOfRange: string[];
  /** Subset outOfRange pada jenis ukuran yang relevan untuk cakupan ini. */
  criticalOutOfRange: string[];
  criticalGaps: string[];
  incompleteParams: string[];
  invalidVolumes: string[];
}

/** Masalah satu part: batas parameter, spesifikasi kritis, kelengkapan. */
export function partIssues(part: DraftPart, spec: UniversalSpec, structuredSpecs?: StructuredSpec[]): PartIssues {
  const details = paramOutOfRangeDetails(spec, part.template);
  const relevant = relevantParamKinds(part.scope.primaryMeasure);
  const raw = (spec.rawText || '').toLowerCase();
  const criticalGaps: string[] = [];
  if (part.scope.id === 'jembatan') {
    const mat = spec.materialKeywords;
    if (!mat.includes('beton') && !mat.includes('baja') && !mat.includes('kayu')) {
      criticalGaps.push(
        `[${part.scope.label}] Material struktur jembatan belum ditentukan (beton/baja/kayu) — template generik bukan desain struktur final.`
      );
    }
  }
  if (part.scope.id === 'pondasi') {
    // Fase 2 Bagian B: spek pondasi CONFIRMED yang menyebut tipe
    // (bukan 'Belum tahu') memenuhi gap tipe — ketiadaan template
    // dicatat sebagai AMBIGUOUS_PICK + validasi, bukan blokir transfer.
    const fndSpec = (structuredSpecs ?? []).find((s) => s.key === 'building-foundation');
    const fndKnown = !!fndSpec && fndSpec.status === 'CONFIRMED' &&
      typeof fndSpec.value === 'string' && fndSpec.value.trim() !== '' &&
      !/belum tahu/i.test(fndSpec.value);
    if (!fndKnown && !FOUNDATION_TYPE_PHRASES.some((p) => raw.includes(p))) {
      criticalGaps.push(
        `[${part.scope.label}] Jenis pondasi & data tanah belum ditentukan (tiang pancang/bore pile/foot plat/sumuran + daya dukung tanah) — pondasi generik bukan desain geoteknik final.`
      );
    }
  }
  if (part.scope.id === 'struktur') {
    const mat = spec.materialKeywords;
    if (!mat.includes('beton') && !mat.includes('baja')) {
      criticalGaps.push(
        `[${part.scope.label}] Material struktur belum ditentukan (beton/baja) — template generik bukan desain struktur final.`
      );
    }
  }
  return {
    outOfRange: details.map((d) => d.detail),
    criticalOutOfRange: details.filter((d) => relevant.includes(d.kind)).map((d) => d.detail),
    criticalGaps,
    incompleteParams: part.generation.generationStatus === 'INCOMPLETE_MISSING_PARAMS'
      ? (part.generation.missingRequiredParams ?? [])
      : [],
    invalidVolumes: part.generation.items
      .filter((i) => i.notes && i.notes.includes('Volume: INVALID'))
      .map((i) => i.description),
  };
}

/**
 * Kesiapan draft saat ini. BLOCKED bila: parameter wajib belum lengkap,
 * volume INVALID, spesifikasi kritis hilang pada cakupan kritis, atau
 * nilai relevan di luar batas template pada cakupan kritis. NEEDS_SPEC
 * bila ada item belum berharga / perlu pemetaan / nilai di luar batas
 * pada cakupan non-kritis. Selain itu READY (siap ditinjau).
 * Catatan batas yang disengaja: default template untuk parameter non-
 * kritis (mis. lebar jembatan) TIDAK memblokir — default sudah dicatat
 * sebagai asumsi yang bisa direvisi; yang diblokir hanyalah kekosongan
 * spesifikasi kritis di atas, bukan setiap asumsi.
 */
export function draftReadiness(draft: UniversalDraft): DraftReadiness {
  const blockedReasons: string[] = [];
  const reasons: string[] = [];
  const totals = computeTotals(draft);
  for (const part of draft.parts) {
    const issues = partIssues(part, draft.spec, draft.structuredSpecs);
    const isCritical = CRITICAL_SCOPES.includes(part.scope.id);
    if (issues.incompleteParams.length > 0) {
      blockedReasons.push(
        `[${part.scope.label}] parameter wajib belum lengkap: ${issues.incompleteParams.join(', ')}`
      );
    }
    for (const v of issues.invalidVolumes) {
      blockedReasons.push(`Volume INVALID: ${v}`);
    }
    if (isCritical) {
      for (const g of issues.criticalGaps) blockedReasons.push(g);
      for (const o of issues.criticalOutOfRange) {
        blockedReasons.push(`[${part.scope.label}] nilai di luar batas template: ${o}`);
      }
    } else {
      for (const o of issues.outOfRange) {
        reasons.push(`[${part.scope.label}] nilai di luar batas template: ${o}`);
      }
    }
  }
  reasons.push(...blockedReasons);
  if (totals.unpricedCount > 0) {
    reasons.push(`${totals.unpricedCount} item belum memiliki harga (total PARSIAL).`);
  }
  if (totals.needsSpecCount > 0) {
    reasons.push(`${totals.needsSpecCount} item berstatus PERLU SPESIFIKASI (pemetaan AHSP belum lengkap).`);
  }
  const status: DraftReadinessStatus =
    blockedReasons.length > 0 ? 'BLOCKED'
    : reasons.length > 0 ? 'NEEDS_SPEC'
    : 'READY';
  return { status, reasons, blockedReasons };
}

/** Label status kesiapan untuk pesan (Bahasa Indonesia, tanpa jargon). */
export function readinessLabel(status: DraftReadinessStatus): string {
  return status === 'BLOCKED' ? 'DIBLOKIR UNTUK TRANSFER'
    : status === 'NEEDS_SPEC' ? 'PERLU SPESIFIKASI'
    : 'SIAP DITINJAU';
}

/* ------------------------------------------------------------------ */
/* Pembangunan draft                                                   */
/* ------------------------------------------------------------------ */

export type BuildResult =
  | { kind: 'draft'; draft: UniversalDraft }
  | { kind: 'needs-spec'; reason: string; missing: string[]; understoodSummary?: string }
  | { kind: 'unsupported'; reason: string };

let draftCounter = 0;
let lastUniversalDraft: UniversalDraft | null = null;
/**
 * FASE 2 (ARS-06 — sebagian tertutup): singleton kerja di atas kini
 * terikat proyek. `getLastUniversalDraft(projectId)` mengembalikan null
 * bila draft milik proyek lain — draft A tidak lagi bisa ter-autosave
 * sebagai record proyek B saat ganti proyek tanpa refresh. Pemanggil
 * tanpa projectId (tes warisan / jalur lama) tetap mendapat draft apa
 * adanya; pemanggil produk (view.tsx) WAJIB meneruskan projectId.
 * Pemulihan persisten per-proyek tetap di draftPersistence.ts.
 */
let lastUniversalDraftProjectId: string | null = null;

export function getLastUniversalDraft(projectId?: string | null): UniversalDraft | null {
  if (projectId && lastUniversalDraftProjectId && lastUniversalDraftProjectId !== projectId) {
    return null;
  }
  return lastUniversalDraft;
}
export function getLastUniversalDraftProjectId(): string | null {
  return lastUniversalDraftProjectId;
}
export function setLastUniversalDraft(d: UniversalDraft | null, projectId?: string | null): void {
  lastUniversalDraft = d;
  if (d === null) {
    lastUniversalDraftProjectId = null;
    return;
  }
  if (projectId) lastUniversalDraftProjectId = projectId;
}
export function clearLastUniversalDraft(projectId?: string | null): void {
  if (!projectId || lastUniversalDraftProjectId === projectId) {
    lastUniversalDraft = null;
    lastUniversalDraftProjectId = null;
  }
}

function fmtNum(v: number): string {
  return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

/**
 * Bangun draft dari teks. `forcedTemplateId` dipakai bila pemanggil
 * sudah menentukan template secara eksplisit (dipakai tes & revisi
 * varian); tanpa itu, template skor tertinggi yang dipakai.
 */
/**
 * Pemetaan part cakupan → id proyek gerbang relevansi (Gelombang E).
 * Hanya keluarga yang terkalibrasi terhadap kosakata katalog nyata
 * yang dihubungkan (nol item template kategorinya sendiri tertolak
 * pada matriks 180 template × item). Keluarga lain mengembalikan
 * null = part tidak digerbang pada gelombang ini:
 *  - scope komponen (struktur, atap, finishing, mep, sanitasi):
 *    cakupan komponen lintas-proyek — konfliknya diatur pemilihan
 *    kategori template, bukan gerbang proyek;
 *  - demolisi: itemnya memang menyebut kategori yang dibongkar;
 *  - olahraga non-kolam (lapangan/futsal/track) & pertanian
 *    non-kandang: dukungan katalognya campuran dan belum terkalibrasi
 *    per subkategori — status BELUM, bukan dipaksakan.
 * Pemilihan SUBTIPE jalan tidak disentuh pemetaan ini (protected
 * flow owner) — scope jalan selalu dipetakan ke id keluarga 'jalan'.
 */
export function gateProjectIdFor(scope: ScopeGroup, rawText: string): string | null {
  switch (scope.id) {
    case 'gedung':
      return /gudang|warehouse/i.test(rawText) ? 'gudang-industri' : 'gedung';
    case 'pertanian':
      return /\b(kandang|peternakan)\b/i.test(rawText) ? 'kandang' : null;
    case 'olahraga':
      return /\bkolam\b/i.test(rawText) ? 'kolam' : null;
    case 'jalan':
      return 'jalan';
    case 'drainase':
      return 'drainase';
    case 'irigasi':
      return 'irigasi';
    case 'lanskap':
      return /\b(pagar|gerbang)\b/i.test(rawText) ? 'pagar-gerbang' : 'lanskap';
    case 'jembatan':
      return 'jembatan';
    case 'pondasi':
      return 'pondasi';
    case 'renovasi':
      return 'renovasi';
    case 'pelabuhan':
      return 'pelabuhan';
    case 'tanah':
      return 'pekerjaan-tanah';
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Penekanan atap tanpa-spek (GATE 5 / 5E)                             */
/*                                                                     */
/* Cacat warisan Fase 4 + rantai spek (§3.5.3 laporan rantai): alur   */
/* TANPA spek terstruktur memproduksi part atap mandiri yang SALAH     */
/* bila permintaan juga memuat cakupan keluarga (kandang/gudang/      */
/* gedung) — dulu Green Roof menang skor teks (23 vs 20), kini Dak    */
/* Beton (27) karena kata 'beton' dari "lantai beton miring" ikut     */
/* membobot namanya. Part itu ganda (template keluarga SUDAH memuat   */
/* komponen atap: AGR-LIVESTOCK-BARN 'Penutup Atap Spandek Kandang',  */
/* BLD-IND-MULTITENANT 'Penutup Atap UPVC Atap Gudang',               */
/* BLD-IND-WAREHOUSE 'Penutup Atap & Dinding Cladding Spandek         */
/* Zincalume') DAN salah jenis (Dak Beton untuk kandang yang          */
/* diminta Galvalum). Dengan spek, suppressedScopes sudah menekan     */
/* part atap untuk kandang/gudang; tanpa spek tidak ada yang          */
/* menekan — gerbang klarifikasi material pun hanya berlaku untuk     */
/* draft SATU part (materialGateResult).                               */
/*                                                                     */
/* Aturan 5E (berbasis bukti komponen, bukan tebakan keluarga): part   */
/* atap mandiri DITEKAN bila template yang terpilih untuk cakupan     */
/* lain dalam permintaan yang sama MENDEKLARASIKAN komponen atap.     */
/* Deteksi dari NAMA komponen (bukan grup WBS — grup G.ATAP =          */
/* '07. PEKERJAAN ATAP & PLAFON' juga memuat plafon). Pembongkaran    */
/* atap lama & tanaman atap hijau BUKAN cakupan atap. Bila teks       */
/* menyebut material atap yang merupakan opsi SELECT `roof_material`  */
/* template penutup, material itu DIHORMATI lewat override param      */
/* (tanpa spek, param itu sebelumnya selalu default); bila material   */
/* yang disebut tidak ditawarkan template penutup, dinyatakan terbuka */
/* sebagai peringatan — tidak pernah diganti diam-diam.                */
/*                                                                     */
/* Hanya berlaku single-building (computeNoSpecRoofSuppression):       */
/* pada draft multi, part atap adalah part tingkat proyek sementara    */
/* cakupan atap per gedung dinilai per gedung oleh                       */
/* computeMultiBuildingRoofSuppression (GELOMBANG 2 §17.3) dengan      */
/* aturan agregasi yang sama — ditekan hanya bila SETIAP gedung yang   */
/* mendapat part tercakup atap — ditambah pemeriksaan LEVEL-AWARE      */
/* (komponen atap dihitung hanya bila benar-benar ter-generate di      */
/* PROFESSIONAL; lihat templateDeclaresRoof).                          */
/* ------------------------------------------------------------------ */

/** Apakah template ini mendeklarasikan komponen PEMBANGUNAN atap?
 *
 * GELOMBANG 2 (§17.3) — `generatesAtProfessionalOnly`: bila true,
 * hanya komponen yang BENAR-BENAR ter-generate di PROFESSIONAL yang
 * dihitung (cermin filter generateRabItems: `!isOptional &&
 * (detailLevel ?? 'PROFESSIONAL') !== 'COMPREHENSIVE'`). Draft selalu
 * di-generate di PROFESSIONAL tanpa pilihan opsional — komponen
 * COMPREHENSIVE-opsional (mis. waterproofing dak atap pada
 * BLD-OFFICE-MULTI) tidak pernah muncul di draft dan TIDAK BOLEH
 * dihitung sebagai cakupan atap. Default false = perilaku Gate 5
 * (jalur single-building TIDAK BERUBAH).
 */
export function templateDeclaresRoof(
  template: RabTemplate,
  generatesAtProfessionalOnly = false,
): { covered: boolean; componentName: string | null } {
  const comps = template.components ?? [];
  // Cermin filter generate (rabTemplateService): pada PROFESSIONAL
  // tanpa pilihan opsional, komponen ter-generate bila bukan opsional
  // DAN levelnya bukan COMPREHENSIVE (level hilang = PROFESSIONAL).
  const generatesAtProfessional = (c: { detailLevel?: string; isOptional?: boolean }): boolean =>
    !c.isOptional && (c.detailLevel ?? 'PROFESSIONAL') !== 'COMPREHENSIVE';
  // Prioritas 1: PENUTUP atap ('Penutup Atap ...') — cakupan atap yang
  // sesungguhnya. Rangka (frame) BUKAN penutup: 'Rangka Atap Seng Baja
  // Ringan Kandang' membawa kata 'atap' tapi bukan penutup yang diminta
  // spek (pengecualian yang sama dengan materialStatusForItem) — bila
  // rangka yang dinamai, peringatan penekanan akan menyebut komponen
  // yang salah.
  for (const c of comps) {
    const name = (c.name || '').toLowerCase();
    if (!/\bpenutup atap\b/.test(name)) continue;
    if (/\b(bongkar|pembongkaran|tanaman)\b/.test(name)) continue;
    if (generatesAtProfessionalOnly && !generatesAtProfessional(c)) continue;
    return { covered: true, componentName: c.name };
  }
  // Prioritas 2: komponen atap lain ('Atap Baja Ringan ...', 'Rangka
  // Atap ...' bila tidak ada penutup) — tetap cakupan atap, hanya
  // bukan penutup bernama eksplisit.
  for (const c of comps) {
    const name = (c.name || '').toLowerCase();
    if (!/\batap\b/.test(name)) continue;
    if (/\b(bongkar|pembongkaran|tanaman)\b/.test(name)) continue;
    if (generatesAtProfessionalOnly && !generatesAtProfessional(c)) continue;
    return { covered: true, componentName: c.name };
  }
  return { covered: false, componentName: null };
}

export interface NoSpecRoofSuppression {
  /** true bila part atap mandiri harus ditekan. */
  suppress: boolean;
  coveringTemplateId: string | null;
  coveringTemplateName: string | null;
  coveringComponent: string | null;
  /** Material atap yang disebut teks (bila ada). */
  mentionedMaterial: string | null;
  /** Override SELECT roof_material bila material teks adalah opsi template penutup. */
  materialOverride: { paramKey: string; value: string } | null;
  /** true bila material disebut tetapi TIDAK ditawarkan template penutup. */
  materialNotOffered: boolean;
}

const NO_ROOF_SUPPRESSION: NoSpecRoofSuppression = {
  suppress: false,
  coveringTemplateId: null,
  coveringTemplateName: null,
  coveringComponent: null,
  mentionedMaterial: null,
  materialOverride: null,
  materialNotOffered: false,
};

/**
 * Pra-pemeriksaan penekanan atap tanpa-spek: cakupan 'atap' ditekan
 * bila salah satu cakupan lain dalam permintaan yang sama jatuh ke
 * template yang mendeklarasikan komponen atap. Pemakaian pick yang
 * SAMA dengan buildDraftPart (forcedTemplateId diutamakan, lalu
 * pickTemplateForScope) agar keputusan pra-pemeriksaan dan part yang
 * benar-benar dibangun tidak pernah bercerita berbeda.
 */
export function computeNoSpecRoofSuppression(
  spec: UniversalSpec,
  forcedTemplateId?: string,
): NoSpecRoofSuppression {
  if (!spec.scopes.some((s) => s.id === 'atap')) return NO_ROOF_SUPPRESSION;
  const svc = RabTemplateService.getInstance();
  let covering: { template: RabTemplate; component: string } | null = null;
  for (const scope of spec.scopes) {
    if (scope.id === 'atap') continue;
    let template: RabTemplate | null = null;
    if (forcedTemplateId) {
      const forced = svc.getTemplateById(forcedTemplateId);
      if (forced && forced.metadata.source === 'EZRAB_OFFICIAL') template = forced;
    }
    if (!template) template = pickTemplateForScope(spec, scope).pick?.template ?? null;
    if (!template) continue;
    const roof = templateDeclaresRoof(template);
    if (roof.covered && roof.componentName) {
      covering = { template, component: roof.componentName };
      break;
    }
  }
  if (!covering) return NO_ROOF_SUPPRESSION;
  const mentionedMaterial = extractRoofMaterialToken(spec.rawText);
  let materialOverride: NoSpecRoofSuppression['materialOverride'] = null;
  let materialNotOffered = false;
  if (mentionedMaterial) {
    const sel = (covering.template.parameters ?? []).find(
      (p) => p.key === 'roof_material' && p.type === 'SELECT',
    );
    if (sel) {
      const options = (sel as { options?: Array<{ value: string | number }> }).options ?? [];
      if (options.some((o) => String(o.value) === mentionedMaterial)) {
        materialOverride = { paramKey: 'roof_material', value: mentionedMaterial };
      } else {
        materialNotOffered = true;
      }
    } else if (!covering.component.toLowerCase().includes(mentionedMaterial)) {
      // Atap template tetap (tanpa varian SELECT): material disebut
      // hanya "ditawarkan" bila komponen penutupnya menyebut material
      // itu (mis. cladding Spandek Zincalume untuk "atap spandek").
      materialNotOffered = true;
    }
  }
  // Bila override diterapkan, komponen penutup yang BENAR-BENAR muncul
  // adalah varian yang kondisinya cocok (`roof_material === 'galvalum'`),
  // bukan varian default pertama — peringatan harus menyebut varian itu.
  let coveringComponent = covering.component;
  if (materialOverride) {
    const variant = (covering.template.components ?? []).find(
      (c) =>
        (c.condition ?? '').includes(`roof_material === '${materialOverride!.value}'`) &&
        /\bpenutup atap\b/i.test(c.name || ''),
    );
    if (variant) coveringComponent = variant.name;
  }
  return {
    suppress: true,
    coveringTemplateId: covering.template.id,
    coveringTemplateName: covering.template.name,
    coveringComponent,
    mentionedMaterial,
    materialOverride,
    materialNotOffered,
  };
}

/**
 * GELOMBANG 2 (§17.3) — pra-pemeriksaan penekanan atap tanpa-spek
 * MULTI-GEDUNG. Per gedung yang mendapat part: pick template 'gedung'
 * yang SAMA dengan yang dipakai loop build (forcedTemplateId
 * diutamakan, lalu pickTemplateForScope pada spek per gedung) lalu
 * nilai cakupan atap LEVEL-AWARE (templateDeclaresRoof dengan
 * generatesAtProfessionalOnly). Material atap dibaca dari span teks
 * gedung ITU (tiap gedung memakai spek atapnya sendiri — bukan teks
 * proyek). Agregasi di multiBuildingRab: ditekan hanya bila semua
 * gedung tercakup; campuran → dipertahankan.
 *
 * Mengembalikan null bila tidak relevan (tanpa cakupan 'atap', tanpa
 * cakupan 'gedung', atau tanpa gedung ber-basis ukuran) — pemanggil
 * memperlakukannya sama dengan "tidak ditekan".
 */
export function computeMultiBuildingRoofSuppression(
  spec: UniversalSpec,
  buildings: BuildingModel[],
  forcedTemplateId?: string,
): MultiBuildingRoofSuppression | null {
  if (!spec.scopes.some((s) => s.id === 'atap')) return null;
  const gedungScope = spec.scopes.find((s) => s.id === 'gedung');
  if (!gedungScope) return null;
  const svc = RabTemplateService.getInstance();
  const coverages: BuildingRoofCoverage[] = [];
  for (const b of buildings) {
    if (!buildingHasMeasureBasis(b)) continue; // tanpa part → tidak dihitung
    const buildingSpec = specForBuilding(spec, b);
    let template: RabTemplate | null = null;
    if (forcedTemplateId) {
      const forced = svc.getTemplateById(forcedTemplateId);
      if (forced && forced.metadata.source === 'EZRAB_OFFICIAL') template = forced;
    }
    if (!template) template = pickTemplateForScope(buildingSpec, gedungScope).pick?.template ?? null;
    const roof = template
      ? templateDeclaresRoof(template, true)
      : { covered: false, componentName: null };
    const mentionedMaterial = extractRoofMaterialToken(buildingSpec.rawText);
    let materialOverride: BuildingRoofCoverage['materialOverride'] = null;
    let materialNotOffered = false;
    if (mentionedMaterial && template) {
      const sel = (template.parameters ?? []).find(
        (p) => p.key === 'roof_material' && p.type === 'SELECT',
      );
      if (sel) {
        const options = (sel as { options?: Array<{ value: string | number }> }).options ?? [];
        if (options.some((o) => String(o.value) === mentionedMaterial)) {
          materialOverride = { paramKey: 'roof_material', value: mentionedMaterial };
        } else {
          materialNotOffered = true;
        }
      } else if (roof.covered && roof.componentName && !roof.componentName.toLowerCase().includes(mentionedMaterial)) {
        // Atap template tetap (tanpa varian SELECT): material disebut
        // hanya "ditawarkan" bila komponen penutupnya menyebut material
        // itu (pola yang sama dengan computeNoSpecRoofSuppression).
        // Gedung TIDAK tercakup tidak ditandai notOffered — materialnya
        // ditangani part atap tingkat proyek yang dipertahankan.
        materialNotOffered = true;
      }
    }
    // Varian penutup yang benar-benar muncul bila override diterapkan
    // (pola yang sama dengan computeNoSpecRoofSuppression).
    let coveringComponent = roof.componentName;
    if (materialOverride && template) {
      const variant = (template.components ?? []).find(
        (c) =>
          (c.condition ?? '').includes(`roof_material === '${materialOverride!.value}'`) &&
          /\bpenutup atap\b/i.test(c.name || ''),
      );
      if (variant) coveringComponent = variant.name;
    }
    coverages.push({
      buildingId: b.id,
      label: b.label,
      templateId: template?.id ?? null,
      templateName: template?.name ?? null,
      covered: roof.covered,
      coveringComponent,
      mentionedMaterial,
      materialOverride,
      materialNotOffered,
    });
  }
  if (coverages.length === 0) return null;
  return aggregateMultiBuildingRoofSuppression(coverages);
}

/* ------------------------------------------------------------------ */
/* Pembangun SATU part (GATE 2 / 5B — ekstraksi dari buildUniversal-  */
/* Draft): isi badan loop per-scope yang lama, dipindah VERBATIM ke   */
/* helper ini agar dapat dipanggil per gedung (satu part per gedung)   */
/* maupun sekali untuk cakupan proyek/shared works. Perilaku jalur    */
/* single-building TIDAK BERUBAH: pemanggil single menerjemahkan      */
/* hasil 'skip' menjadi needs-spec yang SAMA PERSIS seperti sebelum   */
/* ekstraksi (alasan + missing yang sama); pemanggil multi mengubah   */
/* skip menjadi peringatan + part gedung lain tetap dibangun.         */
/* ------------------------------------------------------------------ */

interface PartBuildContext {
  svc: RabTemplateService;
  forcedTemplateId?: string;
  hasSpecs: boolean;
  structuredSpecs: StructuredSpec[];
  boolOverrides?: Record<string, boolean>;
  selectOverrides?: Record<string, string>;
  /** Kunci: templateId::buildingId|'project' → label seksi pertama. */
  usedTemplateIds: Map<string, string>;
  assumptions: string[];
  warnings: string[];
  ambiguousPicks: NonNullable<UniversalDraft['ambiguousPicks']>;
}

type PartBuildOutcome =
  | { kind: 'part'; part: DraftPart }
  | { kind: 'deduped' }
  | { kind: 'skip'; reason: string; missing: string[] };

function buildDraftPart(
  ctx: PartBuildContext,
  spec: UniversalSpec,
  scope: ScopeGroup,
  building: BuildingModel | null,
  sectionKind: 'building' | 'shared-works' | 'project' | undefined,
): PartBuildOutcome {
  const { svc, forcedTemplateId, hasSpecs, structuredSpecs, boolOverrides, selectOverrides, usedTemplateIds, assumptions, warnings, ambiguousPicks } = ctx;
  // Label seksi untuk asumsi/peringatan: single-building memakai label
  // cakupan saja (string IDENTIK dengan sebelum Gate 2); part gedung
  // memakai "Cakupan — Gedung X" agar jejaknya teratribusi.
  const tag = building ? `${scope.label} — ${building.label}` : scope.label;
  let template: RabTemplate | null = null;
  if (forcedTemplateId) {
    const forced = svc.getTemplateById(forcedTemplateId);
    if (forced && forced.metadata.source === 'EZRAB_OFFICIAL') template = forced;
  }
  let ranked: TemplatePick[] = [];
  let closeCall = false;
  let scoreMargin = 0;
  let demoted: TemplatePick | null = null;
  let deterministicApplied = false;
  if (!template) {
    const res = pickTemplateForScope(spec, scope);
    ranked = res.ranked;
    closeCall = res.closeCall;
    scoreMargin = res.scoreMargin;
    demoted = res.demoted;
    template = res.pick?.template ?? null;
    // Pemetaan deterministik dari spek terstruktur mengalahkan
    // penskoran teks bila targetnya ada di kandidat scope ini
    // (juga menyelamatkan pick bila skor teks di bawah ambang).
    if (hasSpecs) {
      const det = resolveDeterministicPick(scope, structuredSpecs, ranked);
      if (det) {
        const detTpl = svc.getTemplateById(det.templateId);
        if (detTpl && detTpl.metadata.source === 'EZRAB_OFFICIAL') {
          template = detTpl;
          deterministicApplied = true;
          assumptions.push(`[${tag}] Template "${detTpl.name}" dipilih dari spesifikasi terstruktur (${det.reason}).`);
        }
      }
    }
  }
  if (!template) {
    return {
      kind: 'skip',
      reason: `Untuk ${tag} tidak ada template katalog EZRAB yang cocok dengan spesifikasi ini.`,
      missing: ['spesifikasi yang lebih rinci (jenis material, dimensi, atau tipe pekerjaan)'],
    };
  }
  // Dedup antarscope: dua cakupan yang jatuh ke template yang sama tidak
  // boleh menggandakan part (dan item) — part kedua digabung ke pertama.
  // GATE 2: kuncinya template + GEDUNG — template yang sama untuk dua
  // gedung BERBEDA adalah dua part yang sah (parameter berbeda), bukan
  // duplikat; dedup hanya berlaku dalam satu gedung / tingkat proyek.
  const dedupKey = `${template.id}::${building ? building.id : 'project'}`;
  if (usedTemplateIds.has(dedupKey)) {
    warnings.push(
      `[${tag}] memakai template yang sama dengan [${usedTemplateIds.get(dedupKey)}] ("${template.name}") — part digabung agar tidak ganda; hapus cakupan yang tidak dimaksud bila ini bukan maksud Anda.`
    );
    return { kind: 'deduped' };
  }
  usedTemplateIds.set(dedupKey, tag);
  // Pemilihan template dicatat transparan. Bila skor berdekatan
  // (closeCall), pemenang adalah urutan katalog yang stabil dan
  // alternatifnya dicatat sebagai asumsi yang bisa diubah lewat revisi
  // ("ganti menjadi …") — sesuai kebijakan "draft dulu dengan asumsi
  // transparan; pertanyaan hanya bila ukuran utama hilang" (lihat
  // needs-spec di atas). Keputusan yang didokumentasikan: skor seri
  // saja TIDAK memicu pertanyaan klarifikasi, karena kategori sudah
  // menyaring kandidat dan alternatifnya selalu tercantum di asumsi.
  // Pengecualian: demosi batas parameter (lihat pickTemplateForScope).
  if (demoted) {
    assumptions.push(
      `[${tag}] Template "${demoted.template.name}" (skor tertinggi ${demoted.score}) TIDAK dipakai karena nilai Anda di luar batasnya (${demoted.outOfRange.join('; ')}); dipakai "${template.name}" yang masih dalam batas.`
    );
  } else if (!forcedTemplateId && !deterministicApplied && ranked.length >= 2 && ranked[0].score >= 8) {
    const pickScore = ranked.find((r) => r.template.id === template!.id)?.score ?? ranked[0].score;
    assumptions.push(
      `[${tag}] Template "${template.name}" dipakai (skor ${pickScore}${closeCall ? `, selisih tipis ${scoreMargin} dari pesaing terdekat — pilihan tidak tegas` : ''}); alternatif se-cakupan: ${ranked.filter((r) => r.template.id !== template!.id).slice(0, 2).map((r) => `"${r.template.name}" (skor ${r.score})`).join(', ')} — revisi dengan "ganti menjadi …" bila maksud Anda yang lain.`
    );
  }
  // AMBIGUOUS_PICK (Fase 2 Bagian B): close-call, atau material
  // yang diminta untuk scope ini TIDAK TERSEDIA di katalog. Pick
  // tetap pemenang skor (tie-break tidak diubah diam-diam) — yang
  // berubah hanyalah penandanya di laporan validasi. Bila pick
  // deterministik diterapkan, pilihannya sudah tegas (tidak ambigu).
  if (hasSpecs && !deterministicApplied) {
    const mspec = materialSpecForScope(structuredSpecs, scope.id);
    const req = mspec ? requestedMaterialForSpec(mspec) : null;
    const unavailable = !!req &&
      lookupMaterialBinding(req.bindingFamily, req.material) === 'UNAVAILABLE';
    if (closeCall) {
      ambiguousPicks.push({
        scope: scope.id,
        chosen: template.id,
        candidates: ranked.filter((r) => r.template.id !== template!.id).slice(0, 2).map((r) => r.template.name),
        reason: `${building ? `${building.label}: ` : ''}skor selisih tipis ${scoreMargin} dari pesaing terdekat — pilihan tidak tegas${req ? `; material yang diminta (${req.material}) tidak memetakan deterministik ke template ini` : ''}`,
      });
    } else if (unavailable && req) {
      ambiguousPicks.push({
        scope: scope.id,
        chosen: template.id,
        candidates: ranked.slice(0, 3).map((r) => r.template.name),
        reason: `${building ? `${building.label}: ` : ''}material yang diminta (${req.material}) tidak tersedia di katalog — template "${template.name}" dipakai sebagai pengganti dari penskoran teks, bukan pilihan material; butuh harga manual/konfirmasi (NEEDS_MANUAL_PRICE)`,
      });
    }
  }
  // Penjaga material jembatan (engineering-kritis): bila pengguna
  // meminta beton tetapi template terbaik adalah baja (atau sebaliknya),
  // JANGAN substitusi diam-diam — bentang itu butuh desain khusus.
  if (scope.id === 'jembatan') {
    const tt = templateText(template);
    const wantsConcrete = spec.materialKeywords.includes('beton');
    const wantsSteel = spec.materialKeywords.includes('baja');
    const isSteelTpl = /baja|steel|truss|bailey/.test(tt) && !tt.includes('beton');
    const isConcreteTpl = tt.includes('beton') && !/baja|steel/.test(tt);
    if ((wantsConcrete && isSteelTpl) || (wantsSteel && isConcreteTpl)) {
      return {
        kind: 'skip',
        reason: `Untuk jembatan ${wantsConcrete ? 'beton' : 'baja'} bentang ${spec.spanM != null ? `${spec.spanM} m` : ''} tidak ada template katalog yang sesuai materialnya.`,
        missing: ['desain struktur khusus (gambar DED, tipe girder, dan perhitungan struktur oleh perencana) — material/bentang ini tidak boleh dirinci dari template umum'],
      };
    }
  }
  if (scope.id === 'jembatan' && spec.spanM != null) {
    const spanParam = (template.parameters || []).find((p) => classifyParam(p.key, p.label) === 'span');
    if (spanParam && spanParam.max !== undefined && spec.spanM > spanParam.max && /beton/i.test(template.name)) {
      return {
        kind: 'skip',
        reason: `Bentang ${spec.spanM} m di luar cakupan template beton katalog (maks ${spanParam.max} m).`,
        missing: ['desain struktur khusus (gambar DED, tipe girder, dan perhitungan struktur oleh perencana) — jembatan bentang ini tidak boleh dirinci dari template umum'],
      };
    }
  }

  const mapped = mapSpecToParams(spec, template, boolOverrides, selectOverrides);
  const generation = svc.generateRabFromTemplate(template, mapped.params, undefined, 'PROFESSIONAL', []);
  if (!generation.items || generation.items.length === 0) {
    return {
      kind: 'skip',
      reason: `Template "${template.name}" tidak menghasilkan item untuk parameter ini.`,
      missing: ['parameter yang valid untuk template tersebut'],
    };
  }
  for (const u of mapped.usedFromUser) assumptions.push(`[${tag}] ${u} (dari pesan Anda).`);
  for (const d of mapped.defaulted) assumptions.push(`[${tag}] ${d} (asumsi — dapat diubah lewat revisi).`);
  const missingParams = generation.missingRequiredParams ?? [];
  if (missingParams.length > 0) {
    warnings.push(
      `[${tag}] Parameter wajib belum terisi: ${missingParams.join(', ')} — item terkait berstatus PERLU SPESIFIKASI.`
    );
  }
  const priceSummary = generation.priceSummary;
  if (priceSummary && priceSummary.unpricedCount > 0) {
    warnings.push(
      `[${tag}] ${priceSummary.unpricedCount} item belum ada harga — total bersifat PARSIAL.`
    );
  }
  // GERBANG RELEVANSI (Fase 5; dikalibrasi Gelombang E — aturan
  // eksplisit di relevanceGate.ts): item yang konflik kategori keras
  // (jalan/paving/geobag pada proyek gudang, interior hunian pada
  // proyek kandang/jalan/kolam, sistem aspal pada landscape, dst.)
  // atau hanya cocok kata lemah TIDAK masuk BOQ terkonfirmasi —
  // dibuang dari part & dicatat sebagai warning transparan. Cakupan
  // yang diminta eksplisit (ada di spec.scopes) tidak disaring.
  // Pemetaan part → id proyek gerbang: hanya keluarga yang sudah
  // terkalibrasi terhadap katalog yang dihubungkan; scope komponen
  // (struktur/atap/finishing/mep/sanitasi) & demolisi sengaja belum
  // digerbang (lihat status kalibrasi di relevanceGate.ts).
  const gateProjectId = gateProjectIdFor(scope, spec.rawText);
  if (gateProjectId != null) {
    const filtered = filterItemsByRelevance(
      generation.items,
      gateProjectId,
      spec.scopes.map((s) => s.id),
    );
    if (filtered.notes.length > 0) {
      generation.items = filtered.kept;
      for (const n of filtered.notes) warnings.push(`[Gerbang relevansi] ${n}.`);
      if (generation.items.length === 0) {
        return {
          kind: 'skip',
          reason: `Semua item template "${template.name}" gugur di gerbang relevansi untuk proyek ini — tidak ada item yang sejalan kategorinya.`,
          missing: ['cakupan/template yang sejalan dengan kategori proyek (item manual non-AHSP berlabel jujur tetap dapat disusun lewat RAB & Estimasi)'],
        };
      }
    }
  }
  const part: DraftPart = {
    scope,
    template,
    evaluatedParams: generation.evaluatedParameters,
    generation,
    removedKeys: [],
    manualPrices: {},
    // GATE 2: penanda seksi + spek per gedung HANYA pada draft multi —
    // part single-building tidak membawa medan ini (JSON identik).
    ...(sectionKind ? { sectionKind } : {}),
    ...(building ? { buildingId: building.id, spec } : {}),
  };
  // Peringatan batas parameter + spesifikasi kritis (dihitung dari data
  // yang sama dengan draftReadiness, agar pesan dan guard transfer
  // tidak pernah bercerita berbeda).
  const issues = partIssues(part, spec, structuredSpecs);
  for (const o of issues.outOfRange) {
    warnings.push(
      `[${tag}] Nilai di luar batas template "${template.name}": ${o} — volume dihitung dari nilai Anda apa adanya (generator tidak menolaknya); revisi nilai atau template sebelum dipakai sebagai dasar kontrak.`
    );
  }
  for (const g of issues.criticalGaps) {
    warnings.push(`${g} Draft ini DIBLOKIR untuk transfer sampai spesifikasi itu dilengkapi lewat revisi.`);
  }
  return { kind: 'part', part };
}

export function buildUniversalDraft(rawText: string, forcedTemplateId?: string, opts?: { structuredSpecs?: StructuredSpec[]; budgetCapOverride?: number | null; projectId?: string | null; buildings?: BuildingModel[]; dedQto?: DedQtoDraftInfo }): BuildResult {
  const spec = extractUniversalSpec(rawText);
  // Fase 2 Bagian B: spek terstruktur (Bagian A) + override cap.
  // Tanpa opts → perilaku IDENTIK dengan sebelumnya (semua jalur baru
  // dilewati). budgetCapOverride (nilai terkini ctx.budget) mengalahkan
  // cap hasil ekstraksi teks.
  const rawSpecs = opts?.structuredSpecs ?? [];
  const hasSpecs = rawSpecs.length > 0;
  if (opts?.budgetCapOverride != null) spec.budgetCap = opts.budgetCapOverride;
  // GELOMBANG 2 (§17.4) — derivasi spek atap jalur TERPANDU: bila teks
  // bebas menyebut material atap secara eksplisit dan belum ada spek
  // atap keluarga itu, sebutan itu menjadi spek CONFIRMED bersumber
  // 'percakapan' (deriveRoofSpecFromText, specChain) — BUKAN default.
  // Disisipkan terurut alfabetis (kontrak deriveStructuredSpecs) agar
  // mengalir ke selectOverrides, suppressedScopes, validasi rantai,
  // dan draft.structuredSpecs persis seperti jawaban kuesioner.
  // Tanpa spek sama sekali (hasSpecs false) derivasi TIDAK berlaku —
  // alur tanpa-spek memakai penekanan + override teks Gate 5.
  const derivedRoofSpec = hasSpecs
    ? deriveRoofSpecFromText(rawText, familyIdFromSpecs(rawSpecs), rawSpecs)
    : null;
  const structuredSpecs = derivedRoofSpec
    ? [...rawSpecs, derivedRoofSpec].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    : rawSpecs;
  const specFamilyId = hasSpecs ? familyIdFromSpecs(structuredSpecs) : null;
  const suppressed: Set<string> = hasSpecs
    ? suppressedScopes(structuredSpecs, specFamilyId)
    : new Set<string>();
  const boolOverrides = hasSpecs ? booleanParamOverrides(structuredSpecs) : undefined;
  const selectOverrides = hasSpecs ? selectParamOverrides(structuredSpecs) : undefined;
  // GATE 2 (5B) — model per-bangunan: dari konteks intake bila pemanggil
  // meneruskannya (alur terpandu — hasil upsert antar-giliran, otoritatif),
  // bila tidak dari parse teks mentah (alur cepat / pemanggil lama).
  const parsedBuildings = opts?.buildings && opts.buildings.length > 0
    ? opts.buildings
    : parseBuildingsFromText(rawText);
  const isMultiBuilding = parsedBuildings.length >= 2;
  // Gedung tanpa basis ukuran (tidak ada lantai/dimensi/luas) — ditandai
  // eksplisit, tidak mendapat part, tidak menghalangi gedung lain.
  const flaggedBuildings: BuildingModel[] = isMultiBuilding
    ? parsedBuildings.filter((b) => !buildingHasMeasureBasis(b))
    : [];
  // GATE 5 (5E) — penekanan atap tanpa-spek (single-building saja;
  // dengan spek, suppressedScopes + pick deterministik yang berlaku;
  // multi-gedung ditangani multiRoof di bawah — lihat
  // computeMultiBuildingRoofSuppression).
  // Dihitung di sini (sebelum pemeriksaan ukuran) agar cakupan atap
  // yang ditekan tidak diwajibkan ukurannya di loop di bawah.
  const noSpecRoof = !hasSpecs && !isMultiBuilding
    ? computeNoSpecRoofSuppression(spec, forcedTemplateId)
    : null;
  // GELOMBANG 2 (§17.3) — penekanan atap tanpa-spek MULTI-GEDUNG:
  // ditekan hanya bila SETIAP gedung yang mendapat part tercakup atap
  // (level-aware); campuran → part dipertahankan + peringatan atribusi.
  const multiRoof = !hasSpecs && isMultiBuilding
    ? computeMultiBuildingRoofSuppression(spec, parsedBuildings, forcedTemplateId)
    : null;
  // Override SELECT dari teks (tanpa spek): material atap yang disebut
  // pengguna dan ditawarkan template keluarga dihormati lewat param
  // (sebelumnya param itu selalu default template). Hanya berlaku bila
  // tidak ada override dari spek terstruktur.
  const textSelectOverrides = noSpecRoof?.materialOverride
    ? { [noSpecRoof.materialOverride.paramKey]: noSpecRoof.materialOverride.value }
    : undefined;
  // Finalisasi §4 (2026-11-08): dimensi fisik tidak valid (nol/negatif)
  // dari lapisan validasi bersama (rabNeeds.validatePhysicalDimensions,
  // lewat IR) → klarifikasi koreksi dimensi, BUKAN draft dari angka yang
  // salah. Dicek sebelum jalur cakupan apa pun.
  const understandingForValidation = understandProject(rawText);
  if (understandingForValidation.dimensionProblems.length > 0) {
    return {
      kind: 'needs-spec',
      reason:
        `Ukuran yang Anda sebut belum valid: ${understandingForValidation.dimensionProblems.join(' ')} ` +
        'Koreksi ukurannya (mis. "10 x 20 m") — draft tidak dibuat dari dimensi yang tidak valid.',
      missing: ['ukuran bangunan yang valid (panjang dan lebar lebih dari 0 meter)'],
      understoodSummary: summarizeUnderstanding(understandingForValidation),
    };
  }
  if (spec.scopes.length === 0) {
    // Finalisasi §4 (2026-11-08): pesan dengan NIAT RAB yang jelas tapi
    // tanpa cakupan yang terpetakan mendapat KLARIFIKASI TERPANDU, bukan
    // penolakan generik 'unsupported'. Dua bentuk:
    // (a) fungsi bangunan GENERIK terdeteksi ("bangunan", "bangunan
    //     komersial" — kata-katanya memang bukan kata kunci grup gedung)
    //     → klarifikasi kontekstual per fungsi: yang ditanya hanya
    //     ukurannya (kasus amb-023/amb-024);
    // (b) tanpa objek apa pun ("buatkan rab sesuatu yang besar") →
    //     klarifikasi objek dulu (kasus amb-025).
    // Bila tidak ada niat RAB sama sekali, 'unsupported' tetap jujur.
    const uNoScope = understandProject(rawText);
    if (/\b(rab|anggaran|biaya|estimasi|hitung)\b/i.test(rawText)) {
      if (uNoScope.functionLabel) {
        const assessment = assessBuildingMissingInfo(uNoScope, rawText);
        const essential = assessment.items.filter((i) => i.blocksDraft);
        return {
          kind: 'needs-spec',
          reason:
            `Saya memahami ini sebagai ${uNoScope.functionLabel.toLowerCase()} — fungsi bangunan, bukan otomatis bangunan bertingkat. ` +
            `Yang masih saya butuhkan untuk memulai draft awal hanyalah ${essential.map((e) => e.label).join('; ') || 'ukuran atau luas bangunan'}. ` +
            'Jumlah lantai tidak wajib disebut: bila tidak disebutkan saya memakai asumsi 1 lantai yang saya tulis terbuka.',
          missing: essential.map((e) => e.label),
          understoodSummary: summarizeUnderstanding(uNoScope),
        };
      }
      return {
        kind: 'needs-spec',
        reason:
          'Saya belum bisa mengenali pekerjaan apa yang ingin dihitung dari pesan Anda. ' +
          'Sebutkan objek pekerjaannya (mis. gudang, rumah, jalan, saluran drainase, pagar) — ' +
          'setelah objeknya jelas, saya hanya akan menanyakan ukurannya.',
        missing: ['objek/pekerjaan konstruksi yang ingin dihitung (jenis bangunan atau pekerjaan)'],
        understoodSummary: uNoScope.footprint.value != null || uNoScope.landArea.value != null
          ? summarizeUnderstanding(uNoScope)
          : undefined,
      };
    }
    return { kind: 'unsupported', reason: 'Cakupan pekerjaan tidak dikenali dari pesan.' };
  }

  // SATU pertanyaan paling penting: ukuran utama pertama yang hilang.
  // Untuk permintaan BANGUNAN pesannya kontekstual per FUNGSI (bukan
  // label grup generik): pengguna gudang tidak lagi ditolak sebagai
  // "Gedung & Bangunan Bertingkat" dan tidak lagi disyaratkan menyebut
  // lantai — yang ditanyakan hanya basis ukuran yang memang belum ada.
  //
  // KELUARGA CACAT B (audit ekstrem 2026-11-08): cakupan RENOVASI adalah
  // MODIFIER lintas-pekerjaan ("perbaikan jalan 2 km", "rehab drainase
  // 250 m", "rehab jembatan bentang 12 m"), bukan pekerjaan tersendiri
  // dengan basis ukurannya sendiri — basis ukur renovasi gedung adalah
  // luas/anggaran, tetapi pekerjaan linear/jembatan yang diperbaiki
  // membawa basisnya sendiri (panjang/bentang). Sebelumnya loop di
  // bawah memeriksa renovasi dengan basis gedung dan menolak seluruh
  // permintaan meski pekerjaan utamanya berukuran lengkap. Aturan kini:
  // renovasi dianggap terukur bila (a) basisnya sendiri tersedia, ATAU
  // (b) ada cakupan pekerjaan lain yang basisnya tersedia (pekerjaan
  // yang diperbaiki itulah yang dihitung; renovasi tetap ikut sebagai
  // konteks part bila templatenya cocok).
  const measureAvailableFor = (scope: ScopeGroup): boolean => {
    if (scopeMeasureAvailable(spec, scope)) return true;
    if (scope.id === 'renovasi') {
      return spec.scopes.some((s) => s.id !== 'renovasi' && scopeMeasureAvailable(spec, s));
    }
    return false;
  };
  for (const scope of spec.scopes) {
    // Scope yang ter-suppress oleh spek terstruktur tidak diwajibkan
    // ukurannya (ia memang tidak dibangun).
    if (suppressed.has(scope.id)) continue;
    // GATE 5 (5E): cakupan atap yang ditekan tanpa-spek juga tidak
    // diwajibkan ukurannya (ia memang tidak dibangun terpisah).
    // GELOMBANG 2 (§17.3): sama untuk penekanan multi-gedung.
    if (scope.id === 'atap' && (noSpecRoof?.suppress || multiRoof?.suppress)) continue;
    // GATE 2 (5B): cakupan 'gedung' pada draft multi dinilai PER GEDUNG —
    // cukup SATU gedung berbasis ukuran agar draft jalan; gedung tanpa
    // basis sudah ditandai di flaggedBuildings dan tidak menghalangi.
    if (scope.id === 'gedung' && isMultiBuilding) {
      if (parsedBuildings.some((b) => buildingHasMeasureBasis(b))) continue;
      return {
        kind: 'needs-spec',
        reason: 'Untuk Gedung & Bangunan saya belum bisa menghitung volume secara bertanggung jawab — tidak satu pun gedung menyebut jumlah lantai, dimensi, atau luas.',
        missing: parsedBuildings.map((b) => `${b.label}: jumlah lantai atau dimensi (contoh: "Gedung A 3 lantai 15 x 10 m")`),
      };
    }
    if (!measureAvailableFor(scope)) {
      // Finalisasi §4 (2026-11-08): fungsi bangunan GENERIK ("bangunan",
      // "bangunan komersial") tidak membawa TemplateKind.kindLabel —
      // sebelumnya jalur gedung di sini jatuh ke 'unsupported'. Bila
      // tipologi mengenali fungsi generiknya, klarifikasinya tetap
      // kontekstual per fungsi (bukan label grup generik).
      const effectiveFunctionLabel = spec.functionLabel ?? spec.needsFunctionLabel;
      if (scope.id === 'gedung' && effectiveFunctionLabel) {
        const u = understandProject(rawText);
        const assessment = assessBuildingMissingInfo(u, rawText);
        const essential = assessment.items.filter((i) => i.blocksDraft);
        return {
          kind: 'needs-spec',
          reason:
            `Saya memahami ini sebagai ${effectiveFunctionLabel.toLowerCase()} — fungsi bangunan, bukan otomatis bangunan bertingkat. ` +
            `Yang masih saya butuhkan untuk memulai draft awal hanyalah ${essential.map((e) => e.label).join('; ') || scope.primaryLabel}. ` +
            `Jumlah lantai tidak wajib disebut: bila tidak disebutkan saya memakai asumsi 1 lantai yang saya tulis terbuka.`,
          missing: essential.map((e) => e.label),
          understoodSummary: summarizeUnderstanding(u),
        };
      }
      return {
        kind: 'needs-spec',
        reason: `Untuk ${scope.label} saya belum bisa menghitung volume secara bertanggung jawab.`,
        missing: [`${scope.primaryLabel} untuk ${scope.label} (contoh: "${scopeLabelExample(scope)}")`],
      };
    }
  }

  const parts: DraftPart[] = [];
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const ambiguousPicks: NonNullable<UniversalDraft['ambiguousPicks']> = [];
  const svc = RabTemplateService.getInstance();
  const usedTemplateIds = new Map<string, string>(); // templateId::buildingId|'project' → label seksi pertama (GATE 2)

  // GATE 2 (5B) — komposisi seksi: cakupan 'gedung' pada draft multi
  // dibangun SATU PART PER GEDUNG (spek per gedung, template dipilih
  // per gedung); cakupan shared works dibangun SEKALI di tingkat
  // proyek; cakupan lain sekali di tingkat proyek. Single-building:
  // tepat satu target per cakupan dari spek proyek — jalur yang sama
  // dengan sebelum Gate 2.
  const partCtx: PartBuildContext = {
    svc,
    forcedTemplateId,
    hasSpecs,
    structuredSpecs,
    boolOverrides,
    // GATE 5 (5E): override spek menang; tanpa spek, override dari teks
    // (material atap) yang dipakai — mapSpecToParams hanya mengisi
    // param yang dideklarasikan template, jadi override ini tidak
    // memengaruhi part lain.
    selectOverrides: selectOverrides ?? textSelectOverrides,
    usedTemplateIds,
    assumptions,
    warnings,
    ambiguousPicks,
  };
  const multiSkipReasons: string[] = [];
  for (const scope of spec.scopes) {
    // PRE-PASS suppression: scope yang ter-suppress oleh spek
    // terstruktur DILEWATI dengan jejak transparan (bukan diam-diam):
    // drainase yang dijawab 'tanpa/eksisting', dan atap kandang/gudang
    // yang sudah tercakup komponen template keluarga.
    if (suppressed.has(scope.id)) {
      if (scope.id === 'drainase') {
        const ds = structuredSpecs.find((s) => s.key === 'road-drainage');
        const val = ds
          ? (Array.isArray(ds.value) ? ds.value.join(', ') : String(ds.value ?? ''))
          : 'tanpa drainase baru';
        warnings.push(`[${scope.label}] tidak dibangun — jawaban Anda: ${val}`);
      } else {
        warnings.push(`[${scope.label}] tidak dibangun terpisah — atap sudah tercakup komponen template ${specFamilyId === 'kandang' ? 'kandang' : 'gudang'} (lihat laporan validasi rantai).`);
      }
      continue;
    }
    // GATE 5 (5E) — penekanan atap tanpa-spek: part atap mandiri
    // ditekan bila template keluarga yang terpilih sudah memuat
    // komponen atap (part terpisah itu ganda dan pemenang skor
    // teksnya salah — Dak Beton untuk kandang Galvalum). Jejak
    // transparan, bukan diam-diam; bila material atap yang disebut
    // tidak ditawarkan template penutup, dinyatakan terbuka.
    if (scope.id === 'atap' && noSpecRoof?.suppress) {
      warnings.push(
        `[${scope.label}] tidak dibangun terpisah — atap sudah tercakup komponen template "${noSpecRoof.coveringTemplateName}" ("${noSpecRoof.coveringComponent}") (lihat laporan validasi rantai).`
      );
      if (noSpecRoof.mentionedMaterial && noSpecRoof.materialNotOffered) {
        warnings.push(
          `[${scope.label}] material atap yang Anda sebut (${noSpecRoof.mentionedMaterial}) tidak ditawarkan template "${noSpecRoof.coveringTemplateName}" — dipakai ${noSpecRoof.coveringComponent}; sebutkan lewat revisi bila atap ini harus ${noSpecRoof.mentionedMaterial}.`
        );
      }
      continue;
    }
    // GELOMBANG 2 (§17.3) — penekanan atap tanpa-spek multi-gedung:
    // part atap tingkat proyek ditekan hanya bila SETIAP gedung yang
    // mendapat part tercakup atap (level-aware). Jejak transparan per
    // gedung; material yang disebut tetapi tidak ditawarkan template
    // gedung itu dinyatakan terbuka per gedung.
    if (scope.id === 'atap' && multiRoof?.suppress) {
      warnings.push(
        `[${scope.label}] tidak dibangun terpisah — atap sudah tercakup komponen template tiap gedung (${multiRoof.coverages.map((c) => `${c.label}: "${c.coveringComponent}"`).join('; ')}) (lihat laporan validasi rantai).`
      );
      for (const c of multiRoof.coverages) {
        if (c.mentionedMaterial && c.materialNotOffered) {
          warnings.push(
            `[${scope.label} — ${c.label}] material atap yang Anda sebut (${c.mentionedMaterial}) tidak ditawarkan template "${c.templateName}" — dipakai ${c.coveringComponent}; sebutkan lewat revisi bila atap ini harus ${c.mentionedMaterial}.`
          );
        }
      }
      continue;
    }
    // Target build untuk cakupan ini.
    const targets: Array<{ targetSpec: UniversalSpec; building: BuildingModel | null; sectionKind: 'building' | 'shared-works' | 'project' | undefined }> = [];
    if (scope.id === 'gedung' && isMultiBuilding) {
      for (const b of parsedBuildings) {
        if (!buildingHasMeasureBasis(b)) continue; // ditandai, tanpa part
        targets.push({ targetSpec: specForBuilding(spec, b), building: b, sectionKind: 'building' });
      }
    } else if (isMultiBuilding && isSharedWorksScope(scope.id)) {
      targets.push({ targetSpec: spec, building: null, sectionKind: 'shared-works' });
    } else if (isMultiBuilding) {
      targets.push({ targetSpec: spec, building: null, sectionKind: 'project' });
    } else {
      targets.push({ targetSpec: spec, building: null, sectionKind: undefined });
    }
    for (const target of targets) {
      // GELOMBANG 2 (§17.3): tiap gedung memakai override atap dari
      // span teksnya sendiri — hanya alur tanpa-spek multi, hanya part
      // 'gedung' (mapSpecToParams hanya mengisi param yang
      // dideklarasikan template, jadi override ini tidak memengaruhi
      // part lain). Konteks disalin per target; partCtx tidak diubah.
      let targetCtx = partCtx;
      if (scope.id === 'gedung' && target.building && multiRoof) {
        const ov = multiRoof.overridesByBuilding[target.building.id];
        if (ov) {
          targetCtx = {
            ...partCtx,
            selectOverrides: { ...(partCtx.selectOverrides ?? {}), [ov.paramKey]: ov.value },
          };
        }
      }
      const outcome = buildDraftPart(targetCtx, target.targetSpec, scope, target.building, target.sectionKind);
      if (outcome.kind === 'part') {
        parts.push(outcome.part);
        continue;
      }
      if (outcome.kind === 'deduped') continue;
      // Skip: single-building = needs-spec persis seperti sebelum Gate 2
      // (alasan + missing yang sama); multi = peringatan, gedung lain
      // tetap dibangun.
      if (!isMultiBuilding) {
        return { kind: 'needs-spec', reason: outcome.reason, missing: outcome.missing };
      }
      const where = target.building ? `${scope.label} — ${target.building.label}` : scope.label;
      warnings.push(`[${where}] tidak dibangun: ${outcome.reason}`);
      multiSkipReasons.push(`[${where}] ${outcome.reason}`);
    }
  }
  // Multi-gedung tetapi TIDAK SATU PUN seksi berhasil dibangun: draft
  // kosong tidak pernah dikembalikan — needs-spec dengan alasan gabungan.
  if (isMultiBuilding && parts.length === 0) {
    return {
      kind: 'needs-spec',
      reason: `Tidak ada seksi yang dapat dihitung untuk proyek multi-gedung ini: ${multiSkipReasons.join('; ') || 'tidak ada gedung dengan basis ukuran.'}`,
      missing: parsedBuildings.map((b) => `${b.label}: jumlah lantai atau dimensi (contoh: "Gedung A 3 lantai 15 x 10 m")`),
    };
  }
  // Gedung tanpa basis ukuran: ditandai eksplisit sebagai peringatan
  // (bukan part Rp0, bukan tebakan).
  for (const b of flaggedBuildings) {
    warnings.push(buildingMissingBasisReason(b));
  }
  // Scope komponen/tingkat-proyek pada draft multi dihitung SEKALI
  // (bukan per gedung) — dinyatakan terbuka, bukan disembunyikan.
  if (isMultiBuilding) {
    const projectLevelScopes = parts.filter((p) => p.sectionKind === 'project').map((p) => p.scope.label);
    const uniq = [...new Set(projectLevelScopes)];
    if (uniq.length > 0) {
      warnings.push(
        `Cakupan ${uniq.map((s) => `[${s}]`).join(', ')} dihitung sekali di tingkat proyek (belum dibagi per gedung) — periksa sebelum transfer bila tiap gedung seharusnya punya cakupan ini sendiri.`
      );
    }
    // GELOMBANG 2 (§17.3) — kasus campuran: part atap dipertahankan
    // karena tidak semua gedung tercakup atap; nyatakan terbuka gedung
    // mana yang sudah tercakup dan mana yang belum (hanya bila part
    // atap benar-benar dibangun).
    if (multiRoof?.mixed && parts.some((p) => p.scope.id === 'atap')) {
      const atapLabel = spec.scopes.find((s) => s.id === 'atap')?.label ?? 'Atap';
      const coveredLabels = multiRoof.coverages.filter((c) => c.covered).map((c) => c.label).join(', ');
      const uncoveredLabels = multiRoof.coverages.filter((c) => !c.covered).map((c) => c.label).join(', ');
      warnings.push(
        `[${atapLabel}] tetap dibangun di tingkat proyek — ${coveredLabels} sudah tercakup komponen template atapnya sendiri, tetapi ${uncoveredLabels} belum; periksa sebelum transfer bila tiap gedung seharusnya punya atap sendiri.`
      );
    }
  }

  // Konflik antarscope: dua part yang berbagi kategori katalog DAN berbagi
  // token nama yang khas (mis. sama-sama 'uditch') kemungkinan tumpang
  // tindih — dicatat sebagai peringatan, bukan diblokir (cakupan ganda
  // bisa saja memang dimaksud, mis. drainase + sanitasi terpisah).
  const NAME_STOP = new Set(['saluran', 'pekerjaan', 'sistem', 'dan', 'dengan', 'untuk', 'per', 'beton', 'baja', 'kayu', 'gedung', 'bangunan', 'jalan', 'atap', 'lantai', 'rumah', 'kantor', 'struktur', 'pondasi', 'jembatan', 'drainase', 'yang', 'dari', 'area', 'ruang']);
  const nameTokens = (name: string): Set<string> => {
    const lower = (name || '').toLowerCase();
    const out = new Set<string>();
    // Bentuk bertanda hubung ikut dipertahankan ('u-ditch' → 'uditch')
    // agar token tumpang tindih terbaca ('ditch' saja terlalu samar).
    for (const variant of [lower, lower.replace(/-/g, '')]) {
      for (const t of variant.split(/[^a-z0-9]+/)) {
        if (t.length >= 4 && !NAME_STOP.has(t)) out.add(t);
      }
    }
    return out;
  };
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i];
      const b = parts[j];
      // GATE 2: dua gedung yang sah memakai template sama BUKAN tumpang
      // tindih — pasangan part gedung dari gedung berbeda dilewati.
      if (a.sectionKind === 'building' && b.sectionKind === 'building' && a.buildingId !== b.buildingId) continue;
      const sharedCategory = a.scope.categories.some((c) => b.scope.categories.includes(c));
      if (!sharedCategory) continue;
      const ta = nameTokens(a.template.name);
      // Buang token yang merupakan substring token bersama lain ('ditch'
      // di dalam 'uditch') agar peringatan menyebut bentuk yang jelas.
      const shared = [...nameTokens(b.template.name)]
        .filter((t) => ta.has(t))
        .filter((t, _, arr) => !arr.some((o) => o !== t && o.includes(t)));
      if (shared.length > 0) {
        warnings.push(
          `[${a.scope.label}] dan [${b.scope.label}] kemungkinan tumpang tindih (sama-sama "${shared.join(', ')}" dalam satu kategori katalog) — periksa sebelum transfer; hapus part yang tidak dimaksud lewat revisi bila ganda.`
        );
      }
    }
  }
  // Frasa majemuk 'box culvert jembatan' memicu dua cakupan sekaligus
  // (jembatan + drainase) — draft memuat keduanya; pengguna harus bisa
  // melihat bahwa itu mungkin bukan maksudnya.
  if (parts.some((p) => p.scope.id === 'jembatan') &&
      parts.some((p) => p.scope.id === 'drainase' && /culvert/i.test(templateText(p.template)))) {
    warnings.push(
      'Permintaan menyebut box culvert sekaligus jembatan — draft memuat part jembatan DAN part gorong-gorong box culvert; hapus part yang tidak dimaksud lewat revisi bila hanya salah satunya yang diminta.'
    );
  }

  if (spec.budgetCap != null) {
    assumptions.push(`Batas anggaran dari pesan Anda: ${formatRupiah(spec.budgetCap)} — dipakai sebagai pembanding, bukan untuk memangkas lingkup diam-diam.`);
  }
  if (spec.location) assumptions.push(`Lokasi: ${spec.location} (indeks harga mengikuti template; konfirmasi HSD setempat sebelum kontrak).`);
  // Catatan tipologi (2026-11-08): pemahaman fungsi & lahan ditulis
  // terbuka di draft — lahan tidak pernah disamakan dengan bangunan,
  // lantai tak disebut adalah asumsi terlabel, bukan kesimpulan.
  if (spec.functionLabel) {
    for (const flag of spec.understandingFlags) assumptions.push(`[Pemahaman] ${flag}`);
    if (spec.footprintM2 != null && spec.buildingWidthM != null && spec.buildingLengthM != null) {
      assumptions.push(`[Pemahaman] Tapak bangunan ${fmtNum(spec.buildingWidthM)} × ${fmtNum(spec.buildingLengthM)} m = ${fmtNum(spec.footprintM2)} m² (hasil hitung dari dimensi yang Anda sebut).`);
    }
    if (spec.landAreaM2 != null) {
      assumptions.push(`[Pemahaman] Luas lahan ${fmtNum(spec.landAreaM2)} m² tercatat TERPISAH dari luas bangunan${spec.coveragePct != null ? ` — tapak menutupi ±${fmtNum(spec.coveragePct)}% lahan` : ''}; luas lahan tidak dipakai sebagai luas bangunan.`);
    }
    if (!spec.floorsExplicit) {
      assumptions.push('[Pemahaman] Jumlah lantai tidak disebutkan — dipakai ASUMSI 1 lantai (aturan standar EZRAB, tertulis terbuka); koreksi lewat revisi bila bangunannya bertingkat.');
    }
  }

  // Judul draft: fungsi bangunan yang disebut pengguna didahulukan
  // ("Gudang"), bukan label grup cakupan generik.
  const draftTitle = spec.scopes.length === 1 && spec.scopes[0].id === 'gedung' && spec.functionLabel
    ? spec.functionLabel
    : spec.scopes.map((s) => s.label).join(' + ');

  // GATE 2 (5B): RAB terkonsolidasi — seksi per gedung dihitung
  // independen dari spek gedungnya masing-masing + shared works sekali;
  // total proyek = jumlah seksi (lihat ringkasan per seksi di pesan).
  if (isMultiBuilding) {
    const buildingCount = parts.filter((p) => p.sectionKind === 'building').length;
    const sharedCount = parts.filter((p) => p.sectionKind === 'shared-works').length;
    assumptions.push(
      `RAB terkonsolidasi multi-gedung: ${buildingCount} seksi gedung dihitung independen dari dimensinya masing-masing${sharedCount > 0 ? ` + ${sharedCount} seksi pekerjaan bersama (dihitung sekali, tidak per gedung)` : ''}; total proyek adalah jumlah seluruh seksi.`
    );
  }

  // FASE 4 (CHAT-03): model per-bangunan — dibawa draft agar pesan
  // draft menampilkan lantai tiap bangunan (bukan satu angka runtuh
  // dari spec.floors). GATE 2: dihitung di awal fungsi (dari opts
  // konteks bila ada, bila tidak dari parse teks) dan dipakai komposisi
  // seksi di atas; di sini hanya dibawa ke draft.
  const draft: UniversalDraft = {
    id: `uni-${Date.now()}-${++draftCounter}`,
    title: draftTitle,
    spec,
    parts,
    assumptions,
    warnings,
    changes: ['Draft awal dibuat dari katalog template resmi EZRAB.'],
    versions: [],
    version: 1,
    createdAt: new Date().toISOString(),
    lastTransfer: null,
    ...(hasSpecs ? { structuredSpecs } : {}),
    ...(hasSpecs ? { ambiguousPicks } : {}),
    ...(parsedBuildings.length > 0 ? { buildings: parsedBuildings } : {}),
    // GATE 4 (5D): rekonsiliasi DED/QTO dari pemanggil (bila ada DED
    // terlampir) — lapisan validasi, bukan input angka ke mesin RAB.
    ...(opts?.dedQto ? { dedQto: opts.dedQto } : {}),
  };
  // Validasi rantai (hanya bila spek terstruktur ada).
  if (hasSpecs) {
    draft.chainValidation = validateDraftChain(draft, structuredSpecs);
  }
  const totals = computeTotals(draft);
  draft.versions.push({
    n: 1,
    summary: 'Draft awal',
    itemCount: effectiveItems(draft).length,
    estimatedTotal: totals.estimatedTotal,
  });
  // FASE 5 (ARS-06) — ikat draft ke proyek pemanggil bila diketahui;
  // tanpa projectId perilaku lama dipertahankan (ikatan null).
  setLastUniversalDraft(draft, opts?.projectId ?? null);
  return { kind: 'draft', draft };
}

function scopeLabelExample(scope: ScopeGroup): string {
  switch (scope.id) {
    case 'jembatan': return 'buatkan RAB jembatan beton bentang 12 meter';
    case 'drainase': return 'buatkan RAB drainase U-Ditch sepanjang 500 meter';
    case 'jalan': return 'buatkan RAB jalan beton sepanjang 1 km';
    case 'gedung': return 'buatkan RAB gedung kantor 3 lantai luas 900 m²';
    case 'atap': return 'buatkan RAB atap luas 120 m²';
    case 'finishing': return 'buatkan RAB finishing keramik luas 80 m²';
    case 'renovasi': return 'buatkan RAB renovasi rumah luas 100 m²';
    default: return `buatkan RAB ${scope.label.toLowerCase()} dengan ukuran yang jelas`;
  }
}

/* ------------------------------------------------------------------ */
/* Format pesan tabel (markdown — pipeline render chat yang sama       */
/* dengan directRab; renderer tidak mendukung <details>, jadi detail  */
/* per item disajikan sebagai blok ringkas di bawah tabel).           */
/* ------------------------------------------------------------------ */

function traceFor(part: DraftPart, item: RabItem): string {
  const t = part.generation.traceability?.find((x) => x.itemId === item.id);
  return t?.calculationTrace || item.notes || `Volume: ${fmtNum(item.volume)} ${item.unit}`;
}

export function formatUniversalDraftMessage(draft: UniversalDraft): string {
  const items = effectiveItems(draft);
  const totals = computeTotals(draft);
  const lines: string[] = [];
  const spec = draft.spec;
  // GATE 2 (5B): draft multi = ≥2 bangunan DAN ada part ber-seksi
  // gedung (draft lama dengan buildings tetapi tanpa part gedung tetap
  // dirender seperti single — tidak ada seksi untuk diringkas).
  const isMultiSection = (draft.buildings?.length ?? 0) >= 2
    && draft.parts.some((p) => p.sectionKind === 'building');

  const confirmed: string[] = [];
  if (spec.areaM2 != null) confirmed.push(`luas ${fmtNum(spec.areaM2)} m²`);
  if (spec.lengthM != null) confirmed.push(`panjang ${fmtNum(spec.lengthM)} m`);
  if (spec.spanM != null) confirmed.push(`bentang ${fmtNum(spec.spanM)} m`);
  if (spec.floors != null) confirmed.push(`${spec.floors} lantai`);
  if (spec.widthM != null) confirmed.push(`lebar ${fmtNum(spec.widthM)} m`);
  if (spec.thicknessCm != null) confirmed.push(`tebal ${fmtNum(spec.thicknessCm)} cm`);

  const readiness = draftReadiness(draft);
  lines.push(`Siap — ini draft RAB **${draft.title}** (versi ${draft.version}) yang saya susun dari katalog template resmi EZRAB, dihitung deterministik oleh engine template:`);
  lines.push('');
  lines.push(`• Jenis proyek: ${draft.title}`);
  // GATE 2: pada draft multi, angka tunggal spek proyek (luas/lantai/
  // panjang/lebar gedung PERTAMA) TIDAK ditampilkan sebagai "dimensi
  // terkonfirmasi" — itu angka runtuh yang menyesatkan; dimensi per
  // gedung ada di ringkasan seksi di bawah. Bentang/tebal (tingkat
  // proyek) tetap tampil.
  if (isMultiSection) {
    const projectConfirmed: string[] = [];
    if (spec.spanM != null) projectConfirmed.push(`bentang ${fmtNum(spec.spanM)} m`);
    if (spec.thicknessCm != null) projectConfirmed.push(`tebal ${fmtNum(spec.thicknessCm)} cm`);
    lines.push(`• Dimensi terkonfirmasi: ${projectConfirmed.length > 0 ? `${projectConfirmed.join(', ')} (tingkat proyek)` : 'per gedung — lihat rincian seksi di bawah'}`);
  } else {
    lines.push(`• Dimensi terkonfirmasi: ${confirmed.length > 0 ? confirmed.join(', ') : '— (memakai default template, lihat asumsi)'}`);
  }
  // FASE 4 (CHAT-03): lantai per bangunan tampil di ringkasan draft —
  // revisi satu bangunan tidak mengubah lain; angka tunggal spec.floors
  // di atas adalah parameter template satu-bangunan, BUKAN jumlah
  // lantai tiap bangunan.
  for (const l of buildingSummaryLines(draft.buildings ?? [])) lines.push(l);
  // GATE 2 (5B) — ringkasan per seksi: tiap gedung (template, jumlah
  // item, subtotal + status) + shared works + rekonsiliasi total.
  if (isMultiSection) {
    const recon = reconcileMultiBuildingTotals(draft);
    lines.push('**Ringkasan per seksi (dihitung independen per gedung):**');
    for (const s of recon.sections) {
      const unpricedNote = s.totals.unpricedCount > 0 ? ` (parsial — ${s.totals.unpricedCount} item belum berharga)` : '';
      lines.push(`• ${s.label}: ${s.templates.map((t) => `"${t}"`).join(', ')} — ${s.itemCount} item — subtotal ${formatRupiah(s.totals.estimatedTotal)}${unpricedNote}`);
    }
    // Gedung yang ditandai hilang (tanpa part) — dinyatakan eksplisit.
    const sectionedIds = new Set(recon.sections.filter((s) => s.kind === 'building').map((s) => s.key));
    for (const b of draft.buildings ?? []) {
      if (!sectionedIds.has(b.id)) {
        lines.push(`• ${b.label}: BELUM DIHITUNG — ${buildingMissingBasisReason(b).replace(`${b.label}: `, '')}`);
      }
    }
    lines.push(`• Rekonsiliasi total: Σ seksi ${formatRupiah(recon.sumOfSections)} = total proyek ${formatRupiah(recon.projectTotal.estimatedTotal)} (selisih ${formatRupiah(Math.abs(recon.diffRp))}${recon.balanced ? ' — seimbang' : ' — TIDAK SEIMBANG, laporkan'})`);
    // CATATAN QTO (GATE 2, jujur): pemeriksaan qtoBridge per gedung
    // tersedia sebagai API (`checkBuildingQto`, diuji 5B-11) tetapi
    // SENGAJA tidak ditampilkan untuk item template — ekspektasi
    // jembatan berbasis tapak (L×W) tidak memperhitungkan formula
    // template/pengali lantai sehingga verdict MISMATCH-nya akan
    // menjadi alarm palsu. Tampilan QTO per gedung belongs dengan
    // input DED/QTO nyata (Gate 4).
  }
  lines.push(`• Template terpilih: ${draft.parts.map((p) => `[${p.scope.label}] "${p.template.name}"`).join('; ')}`);
  lines.push(`• Status draft: ${readinessLabel(readiness.status)} — belum masuk Spreadsheet sampai Anda menyetujui transfer${readiness.status === 'BLOCKED' ? ' (dan saat ini TIDAK DAPAT ditransfer — lihat alasan di bawah)' : ''}`);
  if (readiness.blockedReasons.length > 0) {
    for (const r of readiness.blockedReasons) lines.push(`• ⛔ Alasan blokir transfer: ${r}`);
  }
  lines.push(`• Kelengkapan harga: ${totals.officialCount} RESMI AHSP · ${totals.databaseCount} HARGA DATABASE${totals.marketCount > 0 ? ` · ${totals.marketCount} REFERENSI PASAR` : ''} · ${totals.manualCount} HARGA MANUAL · ${totals.unpricedCount} BELUM TERSEDIA${totals.needsSpecCount > 0 ? ` · ${totals.needsSpecCount} PERLU SPESIFIKASI` : ''}`);
  if (totals.marketCount > 0) {
    const marketItems = items.filter((i) => i.priceSourceKind === 'MARKET_REFERENCE');
    const knownSource = marketItems.filter((i) => i.priceSourceName != null);
    if (marketItems.length > 0 && knownSource.length === 0) {
      lines.push('• Catatan harga pasar: katalog TIDAK mencatat nama, tanggal, atau wilayah sumber untuk harga referensi pasar ini — angka tampil apa adanya dari tabel pasar tersimpan (bukan "harga terkini" dan bukan fetch live); konfirmasi ke pemasok sebelum kontrak.');
    } else if (knownSource.length > 0 && knownSource.length < marketItems.length) {
      lines.push(`• Catatan harga pasar: ${knownSource.length} dari ${marketItems.length} item referensi pasar sudah tercatat pemasok/tanggal/wilayahnya di katalog material (lihat detail item); sisanya tetap tanpa metadata — konfirmasi ke pemasok sebelum kontrak.`);
    } else if (knownSource.length > 0) {
      lines.push('• Catatan harga pasar: pemasok/tanggal/wilayah sumber tercatat per item di katalog material (lihat detail item) — angka tetap referensi pasar tersimpan, bukan harga terkini dan bukan fetch live; konfirmasi ke pemasok sebelum kontrak.');
    }
  }
  if (spec.budgetCap != null) {
    const diff = spec.budgetCap - totals.estimatedTotal;
    lines.push(`• Anggaran: ${formatRupiah(spec.budgetCap)} — total estimasi ${diff >= 0 ? 'DI BAWAH' : 'MELEBIHI'} anggaran sebesar ${formatRupiah(Math.abs(diff))}`);
    // FASE 4 (CHAT-02, 2026-11-12): penilaian kelayakan kanonis SELALU
    // tampil di pesan draft — sebelumnya baris ini hanya muncul bila ada
    // Laporan validasi rantai (draft.chainValidation), sehingga draft
    // jalur engine-template (tanpa chainValidation, kasus umum di UI)
    // hanya membawa ringkasan "Anggaran:" tanpa label penilaian dan
    // tanpa alasan bila total parsial (E2E Fase 4 run 4: baris
    // "Penilaian kelayakan budget" tidak tampil). Baris "Anggaran:"
    // warisan dipertahankan; baris kanonis ditambahkan sesudahnya.
    lines.push(formatBudgetFeasibilityLine(assessBudgetFeasibility({ totalPriced: totals.estimatedTotal, unpricedCount: totals.unpricedCount, budgetCap: spec.budgetCap })));
  } else {
    // FASE 4 (CHAT-02) — tanpa budget, kelayakan DINYATAKAN tidak dapat
    // dinilai (dengan alasannya), bukan dihilangkan diam-diam.
    lines.push(formatBudgetFeasibilityLine(assessBudgetFeasibility({ totalPriced: totals.estimatedTotal, unpricedCount: totals.unpricedCount, budgetCap: null })));
  }
  // FASE 4 — deteksi konflik teknis deterministik atas dimensi/spek
  // draft (bukan tebakan model): konflik tampil di pesan draft agar
  // pengguna memutuskan — tidak pernah dipilih diam-diam.
  {
    const conflicts = detectTechnicalConflicts({
      specs: draft.structuredSpecs ?? [],
      dimensions: {
        landAreaM2: spec.landAreaM2,
        buildingAreaM2: spec.areaM2,
        lengthM: spec.lengthM,
        widthM: spec.widthM,
        depthM: null,
        heightM: spec.heightM,
        floors: spec.floors,
        volumeM3: spec.volumeM3,
      },
      budget: { totalPriced: totals.estimatedTotal, cap: spec.budgetCap },
    });
    for (const l of formatConflictLines(conflicts)) lines.push(l);
  }
  // Laporan validasi rantai (Fase 2 Bagian B) — hanya bila draft
  // dibangun dari spek terstruktur. Seksi ini tampil di UI karena
  // pesan draft adalah yang dirender chat.
  if (draft.chainValidation) {
    const cv = draft.chainValidation;
    const usedCount = cv.specCoverage.filter((s) => s.status === 'USED').length;
    const unusedSpecs = cv.specCoverage.filter((s) => s.status !== 'USED');
    lines.push('**Laporan validasi rantai spesifikasi → RAB**');
    lines.push(`• Cakupan spek: terpakai ${usedCount}/${cv.specCoverage.length}.`);
    for (const s of unusedSpecs) {
      lines.push(`• Spek tak terpakai — ${s.label}: ${s.reason ?? 'tidak ada pemetaan ke item'}.`);
    }
    if (cv.materialMismatches.length > 0) {
      lines.push(`• Material disubstitusi (${cv.materialMismatches.length} item — NEEDS_MANUAL_PRICE, butuh harga manual/konfirmasi, bukan harga resmi):`);
      for (const m of cv.materialMismatches) {
        lines.push(`• ${m.item}: diminta ${m.requested} → item memakai ${m.actual}.`);
      }
    }
    const assumedVolumes = cv.volumeChecks.filter((v) => v.verdict === 'FLAG');
    if (assumedVolumes.length > 0) {
      lines.push(`• Volume berbasis asumsi: ${assumedVolumes.length} item (contoh: ${assumedVolumes.slice(0, 3).map((v) => v.description).join('; ')}).`);
    }
    const b = cv.budget;
    if (b.cap != null) {
      // FASE 4 (CHAT-02) — penilaian kelayakan memakai modul yang sama
      // dengan jalur tanpa-validasi (satu definisi verdict); bila total
      // parsial, ALASAN tidak-dapat-dinilai ikut tampil.
      lines.push(formatBudgetFeasibilityLine(assessBudgetFeasibility({ totalPriced: b.total, unpricedCount: totals.unpricedCount, budgetCap: b.cap })));
    } else {
      lines.push(formatBudgetFeasibilityLine(assessBudgetFeasibility({ totalPriced: b.total, unpricedCount: totals.unpricedCount, budgetCap: null })));
    }
    if (cv.ambiguousPicks.length > 0) {
      lines.push(`• Pilihan template ambigu (${cv.ambiguousPicks.length}):`);
      for (const a of cv.ambiguousPicks) {
        lines.push(`• [${a.scope}] dipilih "${a.chosen}" — ${a.reason} Kandidat lain: ${a.candidates.join(', ') || '—'}.`);
      }
      // FASE 4 (CHAT-06) — AMBIGUOUS_PICK tidak berhenti di catatan:
      // pengguna diminta memilih eksplisit (bukan tie-break diam-diam).
      lines.push('• Klarifikasi: pilihan di atas masih ambigu — jawab dengan memilih salah satu kandidat (mis. "pakai Makadam" atau "pakai Rigid") agar draft memakai template yang Anda maksud.');
    }
    lines.push(cv.foreignItems.length === 0
      ? '• Item asing: tidak ada.'
      : `• Item asing (${cv.foreignItems.length}): ${cv.foreignItems.join('; ')}.`);
  }
  // GATE 5 (5E) — alasan tertelusur per komponen: tiap item draft
  // ditelusur ke spek/dimensi pengguna, ekstraksi DED terkonfirmasi,
  // atau komponen template resmi — item tanpa jejak dinyatakan
  // UNRESOLVED, bukan diberi alasan karangan. Berlaku untuk draft
  // dengan maupun tanpa spek terstruktur (seksi validasi rantai di
  // atas hanya ada bila spek ada).
  {
    const dedNames = (draft.dedQto?.checks ?? []).map((c) => c.description);
    const trace = traceItemReasons(draft, draft.structuredSpecs ?? [], dedNames);
    for (const l of formatItemReasonSummary(trace, !!draft.chainValidation)) lines.push(l);
  }
  // GATE 4 (5D) — rekonsiliasi DED/QTO (hanya bila draft dibangun
  // dengan DED terlampir): verdict per item DED + keputusan koreksi.
  // BUKAN alarm atas item template (Gate 2 §2.4 tetap berlaku —
  // ekspektasi jembatan tidak dipakai untuk memverifikasi volume
  // template); yang dibandingkan di sini adalah kuantitas DED vs
  // dimensi pengguna, keduanya data nyata.
  if (draft.dedQto) {
    for (const l of formatDedQtoDraftLines(draft.dedQto)) lines.push(l);
  }
  lines.push('');

  // Kelompok = kategori komponen (bukan baris biaya); urutan kemunculan.
  // GATE 2: pada draft multi, tabel dikelompokkan PER SEKSI dulu
  // ("Gedung A — Cakupan — Kategori") agar item antar-gedung tidak
  // tercampur; single-building memakai kunci lama persis.
  const sectionLabelFor = (it: DraftItem): string | null => {
    if (!isMultiSection) return null;
    if (it.__buildingId) {
      const b = (draft.buildings ?? []).find((x) => x.id === it.__buildingId);
      return b ? b.label : 'Proyek';
    }
    if (it.__sectionKind === 'shared-works') return SHARED_WORKS_LABEL;
    return 'Proyek';
  };
  const groups = new Map<string, DraftItem[]>();
  for (const it of items) {
    const section = sectionLabelFor(it);
    const key = section
      ? `${section} — ${it.__partScope} — ${it.category || 'Lainnya'}`
      : `${it.__partScope} — ${it.category || 'Lainnya'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  let no = 0;
  for (const [groupName, groupItems] of groups) {
    let subtotal = 0;
    let groupUnpriced = 0;
    lines.push(`**${groupName}**`);
    lines.push('| No | Uraian | Volume | Satuan | Harga Satuan | Jumlah |');
    lines.push('|---:|---|---:|---|---:|---:|');
    for (const it of groupItems) {
      no++;
      const st = displayPriceStatus(it);
      const valid = isPriceValidForTotal(it);
      const price = !valid ? 'Harga belum tersedia' : `${formatRupiah(it.unitPrice as number)} [${st.label}]`;
      const amt = !valid ? '—' : formatRupiah(it.volume * (it.unitPrice as number));
      if (valid) subtotal += it.volume * (it.unitPrice as number);
      else groupUnpriced++;
      lines.push(`| ${no} | ${it.description} | ${fmtNum(it.volume)} | ${it.unit} | ${price} | ${amt} |`);
    }
    lines.push(`Subtotal ${groupName}: **${formatRupiah(subtotal)}**${groupUnpriced > 0 ? ` (parsial — ${groupUnpriced} item belum berharga)` : ''}`);
    lines.push('');
  }

  lines.push(`**Total terverifikasi (RESMI AHSP): ${formatRupiah(totals.verifiedTotal)}**`);
  if (totals.marketCount > 0) lines.push(`**Total referensi pasar: ${formatRupiah(totals.marketTotal)}** (dari tabel pasar tersimpan EZRAB, bukan fetch live — lihat detail item)`);
  if (totals.databaseCount > 0) lines.push(`**Total harga database: ${formatRupiah(totals.databaseTotal)}** (harga referensi template, bukan harga resmi AHSP)`);
  if (totals.manualCount > 0) lines.push(`**Total harga manual: ${formatRupiah(totals.manualTotal)}** (diubah pengguna lewat revisi — tidak pernah menjadi harga resmi tanpa validasi)`);
  lines.push(`**Total estimasi (termasuk harga database, referensi pasar, dan manual): ${formatRupiah(totals.estimatedTotal)}**`);
  lines.push(`Status total: **${totals.status}** — ${items.length} item. Total ini BUKAN angka final/resmi bila ada harga database, manual, atau item belum tersedia.`);
  lines.push('ESTIMASI di sini berarti total kuantitas × harga katalog per item (resmi/pasar/database/manual sesuai label tiap item) — bukan harga yang dihitung atau diverifikasi AI per item; estimasi kuantitas, referensi pasar, harga resmi, dan item belum tersedia adalah hal yang berbeda dan tidak dicampur. Item BELUM TERSEDIA tidak masuk total (bukan Rp 0).');
  lines.push('');

  const unpriced = items.filter((i) => !isPriceValidForTotal(i));
  if (unpriced.length > 0) {
    lines.push(`**Item belum memiliki harga (${unpriced.length}):**`);
    for (const it of unpriced.slice(0, 15)) lines.push(`• ${it.description} (${fmtNum(it.volume)} ${it.unit})`);
    if (unpriced.length > 15) lines.push(`• …dan ${unpriced.length - 15} item lainnya.`);
    lines.push('');
  }
  const needsSpec = items.filter((i) => i.ahspMappingStatus === 'NEEDS_MAPPING');
  if (needsSpec.length > 0) {
    lines.push(`**Item PERLU SPESIFIKASI (${needsSpec.length}):**`);
    for (const it of needsSpec.slice(0, 10)) lines.push(`• ${it.description} — kode AHSP belum terpetakan; tentukan spesifikasi/materialnya.`);
    lines.push('');
  }
  if (draft.warnings.length > 0) {
    lines.push('**Peringatan:**');
    for (const w of draft.warnings) lines.push(`• ⚠ ${w}`);
    lines.push('');
  }
  if (draft.assumptions.length > 0) {
    lines.push('**Asumsi yang dipakai** — sebutkan bila ada yang berbeda (revisi lewat chat, mis. "ubah luas menjadi 120 m²"):');
    for (const a of draft.assumptions) lines.push(`• ${a}`);
    lines.push('');
  }
  if (draft.changes.length > 0 && draft.version > 1) {
    lines.push('**Perubahan pada versi ini:**');
    for (const c of draft.changes) lines.push(`• ${c}`);
    lines.push('');
  }
  lines.push('**Detail item** (kode AHSP · sumber harga · formula volume):');
  // Detail memakai item EFEKTIF (harga manual revisi ikut tampil) — detail
  // lama memakai item mentah generate sehingga harga manual tidak terlihat.
  const effByKey = new Map(items.map((i) => [itemKey(i), i]));
  let dno = 0;
  for (const part of draft.parts) {
    for (const it of part.generation.items) {
      if (part.removedKeys.includes(itemKey(it))) continue;
      dno++;
      const eff = effByKey.get(itemKey(it)) ?? it;
      const st = displayPriceStatus(eff);
      lines.push(`• ${dno}. ${it.description} — AHSP: ${it.ahspCode || '—'} · ${st.label} · ${st.detail} · ${traceFor(part, it)}`);
    }
  }
  lines.push('');
  lines.push('Draft ini belum mengubah Spreadsheet apa pun. Klik **Push ke Spreadsheet** untuk meninjau preview transfer, lalu konfirmasi bila sudah sesuai.');
  return lines.join('\n');
}

/** Daftar item yang harganya belum pasti (referensi/database/manual/kosong). */
export function formatUncertainItemsMessage(draft: UniversalDraft): string {
  const items = effectiveItems(draft);
  const uncertain = items.filter(
    (i) => !isPriceValidForTotal(i) || i.priceSourceKind !== 'OFFICIAL_AHSP'
  );
  if (uncertain.length === 0) {
    return 'Semua item draft ini sudah berharga RESMI AHSP — tidak ada item yang belum pasti.';
  }
  const lines = [`Item yang harganya belum pasti (${uncertain.length} dari ${items.length}):`];
  for (const it of uncertain) {
    const st = displayPriceStatus(it);
    lines.push(`• ${it.description} — ${st.label} (${!isPriceValidForTotal(it) ? 'Harga belum tersedia' : formatRupiah(it.unitPrice as number)})`);
  }
  lines.push('');
  lines.push('Ubah lewat revisi, mis. "gunakan harga manual Rp 500.000 untuk item 3", atau biarkan kosong — total tetap PARSIAL.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Revisi interaktif                                                   */
/* ------------------------------------------------------------------ */

export interface RevisionResult {
  ok: boolean;
  message: string;
  changed: boolean;
}

const REV_PATTERNS = /\b(ubah|ganti|jadi|menjadi|hilangkan|hapus|tambah|tambahkan|gunakan harga|harga manual|tampilkan|hitung ulang|revisi)\b/;

/** Apakah pesan ini revisi draft universal aktif (bukan permintaan baru)? */
export function looksLikeUniversalRevision(text: string): boolean {
  const t = (text || '').toLowerCase();
  if (/\b(buatkan|bikin|buat)\b.*\brab\b/.test(t)) return false;
  if (/\b(buka|tampilkan|lihat)\b.*\b(spreadsheet|katalog|ahsp|proyek)\b/.test(t)) return false;
  // GATE 2 (5B): revisi beralamat gedung ("gedung B 14 x 9 m") adalah
  // revisi meski tanpa kata kerja revisi — penjaga 'buatkan RAB' di
  // atas sudah menyaring permintaan baru terlebih dahulu.
  if (parseBuildingRevision(text)) return true;
  return REV_PATTERNS.test(t);
}

/**
 * GATE 3 (5C) — diekspor agar jalur kandidat revisi (budget-only &
 * hapus-unresolved di draftRevision.ts) memakai pencatatan versi yang
 * SAMA dengan mesin revisi (validasi rantai + ringkasan versions[]),
 * bukan menduplikasi logikanya. Semantik tidak berubah.
 */
export function snapshotVersion(draft: UniversalDraft, summary: string): void {
  // Revisi apa pun yang menaikkan versi menyegarkan laporan validasi
  // (bila draft dibangun dari spek terstruktur) agar pesan revisi
  // tidak menampilkan validasi basi.
  if (draft.structuredSpecs) {
    draft.chainValidation = validateDraftChain(draft, draft.structuredSpecs);
  }
  const totals = computeTotals(draft);
  draft.version += 1;
  draft.versions.push({
    n: draft.version,
    summary,
    itemCount: effectiveItems(draft).length,
    estimatedTotal: totals.estimatedTotal,
  });
}

function regeneratePart(draft: UniversalDraft, part: DraftPart, newParams: Record<string, unknown>): void {
  const svc = RabTemplateService.getInstance();
  const generation = svc.generateRabFromTemplate(part.template, newParams, undefined, 'PROFESSIONAL', []);
  part.evaluatedParams = generation.evaluatedParameters;
  part.generation = generation;
  // FASE 5 (ARS-05) — gerbang relevansi di jalur REVISI (keluarga yang
  // sama dengan jalur build: generateRabFromTemplate atas 180 template
  // katalog yang terkalibrasi Wave E). Jalur build langsung
  // (buildDirectRab/buildSpecRab) SENGAJA tidak digerbang: probe
  // kalibrasi Fase 5 membuktikan 1 false positive per RAB rumah
  // ("Rabat Beton Lantai Kerja" ditolak tanda "rabat beton") — butuh
  // gelombang kalibrasi sendiri (lihat laporan Fase 5).
  applyRelevanceGateToPart(draft, part);
}

/**
 * FASE 5 (ARS-05) — terapkan gerbang relevansi Wave E ke SATU part draft
 * yang baru diregenerasi (jalur revisi). Mengembalikan jumlah item yang
 * gugur + catatan; catatan ditulis ke draft.warnings agar pengguna
 * melihat penyaringan. Guard: bila penyaringan mengosongkan part yang
 * tadinya berisi, generasi lama DIPERTAHANKAN (revisi tidak boleh
 * menghancurkan part) dan penahanan dicatat sebagai warning.
 */
export function applyRelevanceGateToPart(draft: UniversalDraft, part: DraftPart): { removed: number; notes: string[] } {
  const gateProjectId = gateProjectIdFor(part.scope, draft.spec.rawText);
  if (gateProjectId == null) return { removed: 0, notes: [] };
  const before = part.generation.items.length;
  const filtered = filterItemsByRelevance(
    part.generation.items,
    gateProjectId,
    draft.spec.scopes.map((s) => s.id),
  );
  if (filtered.notes.length === 0) return { removed: 0, notes: [] };
  if (filtered.kept.length === 0 && before > 0) {
    const note = `Gerbang relevansi menahan revisi part "${part.scope.label}": semua ${before} item baru gugur — generasi sebelumnya dipertahankan.`;
    draft.warnings.push(`[Gerbang relevansi] ${note}`);
    return { removed: 0, notes: [note] };
  }
  part.generation.items = filtered.kept;
  for (const n of filtered.notes) draft.warnings.push(`[Gerbang relevansi] ${n}.`);
  return { removed: before - filtered.kept.length, notes: filtered.notes };
}

/**
 * GATE 2 (5B) — cari part pemilik satu item efektif. Dua gedung dapat
 * memakai template yang SAMA (nama template identik) — pencarian hanya
 * dari nama template akan selalu mengenai gedung PERTAMA sehingga hapus/
 * harga-manual item gedung B malah mengubah gedung A. Karena itu part
 * dicocokkan dari (nama template, buildingId); fallback nama-saja hanya
 * bila penanda seksi tidak ada (item dari draft lama).
 */
function findPartForItem(draft: UniversalDraft, target: DraftItem): DraftPart | undefined {
  return draft.parts.find(
    (p) => p.template.name === target.__partTemplate
      && (p.buildingId ?? null) === (target.__buildingId ?? null)
  ) ?? draft.parts.find((p) => p.template.name === target.__partTemplate);
}

/** Terapkan revisi teks ke draft aktif. Mengembalikan null bila bukan revisi yang dikenali. */
export function reviseUniversalDraft(draft: UniversalDraft, rawText: string, projectId?: string | null): RevisionResult | null {
  const t = (rawText || '').toLowerCase();
  const changes: string[] = [];
  // FASE 5 (ARS-06) — revisi mengikat draft ke proyek pemanggil; tanpa
  // projectId, ikatan yang sudah ada dipertahankan (bukan di-nol-kan).
  const bindProjectId = projectId ?? getLastUniversalDraftProjectId();
  const spec = draft.spec;
  // Override boolean dari spek terstruktur draft (bila ada) diteruskan
  // ke setiap regenerasi part di bawah — revisi tidak mengembalikan
  // has_drainage dkk. ke default template secara diam-diam.
  const boolOverrides = draft.structuredSpecs
    ? booleanParamOverrides(draft.structuredSpecs)
    : undefined;
  // Override SELECT varian material (keputusan katalog owner
  // 2026-11-12 03:41) — revisi tidak mengembalikan roof_material /
  // floor_type ke default template secara diam-diam.
  const selectOverrides = draft.structuredSpecs
    ? selectParamOverrides(draft.structuredSpecs)
    : undefined;

  // --- GATE 2 (5B): revisi beralamat gedung ("gedung B jadi 4 lantai") ---
  // Berjalan SEBELUM pembaruan ukuran global: revisi satu gedung TIDAK
  // PERNAH menyentuh gedung lain (model, spek, maupun part-nya).
  const buildingRev = parseBuildingRevision(rawText);
  if (buildingRev) {
    const target = (draft.buildings ?? []).find((b) => b.id === buildingRev.buildingId);
    if (!target) {
      return {
        ok: false,
        changed: false,
        message: `${buildingRev.label} tidak ada di draft ini (gedung di draft: ${(draft.buildings ?? []).map((b) => b.label).join(', ') || '—'}). Draft tidak berubah — penambahan gedung baru lewat revisi belum didukung; susun draft baru bila gedungnya memang baru.`,
      };
    }
    const hasBuildingParts = draft.parts.some((p) => p.sectionKind === 'building');
    // 1. Model: upsert per id — gedung lain utuh (identitas + datanya).
    const patch: Partial<BuildingModel> & { id: string } = { id: target.id };
    if (buildingRev.floors != null) patch.floors = buildingRev.floors;
    if (buildingRev.lengthM != null) patch.lengthM = buildingRev.lengthM;
    if (buildingRev.widthM != null) patch.widthM = buildingRev.widthM;
    if (buildingRev.buildingAreaM2 != null) patch.buildingAreaM2 = buildingRev.buildingAreaM2;
    if (buildingRev.functionWord) {
      const base = target.label.replace(/\s*\([^)]*\)\s*$/, '');
      patch.label = `${base} (${buildingRev.functionWord})`;
      patch.spanText = rawText;
      patch.sourceText = rawText;
    }
    const updatedBuildings = upsertBuilding(draft.buildings ?? [], patch);
    draft.buildings = updatedBuildings;
    const updated = updatedBuildings.find((b) => b.id === target.id)!;
    const revChanges: string[] = [buildingRev.summary];
    if (!hasBuildingParts) {
      // Draft single-building: tidak ada part per gedung — terapkan ke
      // spek proyek + regenerasi semua part (semantik global lama).
      if (buildingRev.floors != null) { spec.floors = buildingRev.floors; spec.floorsExplicit = true; }
      // Konvensi sisi (lihat specForBuilding): revisi menyimpan urutan
      // tulis, spek memakai konvensi rabNeeds — ditukar di sini.
      if (buildingRev.lengthM != null) { spec.buildingWidthM = buildingRev.lengthM; spec.widthM = buildingRev.lengthM; }
      if (buildingRev.widthM != null) { spec.buildingLengthM = buildingRev.widthM; spec.lengthM = buildingRev.widthM; }
      if (buildingRev.buildingAreaM2 != null) { spec.areaM2 = buildingRev.buildingAreaM2; spec.footprintM2 = buildingRev.buildingAreaM2; }
      for (const part of draft.parts) {
        const mapped = mapSpecToParams(spec, part.template, boolOverrides, selectOverrides);
        regeneratePart(draft, part, mapped.params);
      }
      if (buildingRev.functionWord) {
        revChanges.push(`fungsi diubah menjadi ${buildingRev.functionWord} (pemilihan template ulang tidak diterapkan pada draft satu gedung — pakai "ganti menjadi …" bila templatenya harus berganti)`);
      }
    } else {
      // Draft multi-seksi: regenerasi HANYA part gedung ini. Spek proyek
      // TIDAK diubah (lantai/dimensi gedung lain tidak tersentuh).
      const newSpec = specForBuilding(spec, updated);
      const myParts = draft.parts.filter((p) => p.buildingId === target.id);
      if (myParts.length === 0 && buildingHasMeasureBasis(updated)) {
        // Gedung ini sebelumnya ditandai hilang (tanpa part) dan kini
        // punya basis ukuran — bangun part-nya sekarang, disisipkan
        // sesuai urutan gedung (sebelum shared works / seksi proyek).
        const gedungScope = spec.scopes.find((s) => s.id === 'gedung');
        if (gedungScope) {
          const amb: NonNullable<UniversalDraft['ambiguousPicks']> = draft.ambiguousPicks ?? [];
          const partCtx: PartBuildContext = {
            svc: RabTemplateService.getInstance(),
            hasSpecs: (draft.structuredSpecs?.length ?? 0) > 0,
            structuredSpecs: draft.structuredSpecs ?? [],
            boolOverrides,
            selectOverrides,
            usedTemplateIds: new Map(draft.parts.map((p) => [`${p.template.id}::${p.buildingId ?? 'project'}`, p.scope.label])),
            assumptions: draft.assumptions,
            warnings: draft.warnings,
            ambiguousPicks: amb,
          };
          const outcome = buildDraftPart(partCtx, newSpec, gedungScope, updated, 'building');
          if (amb.length > 0) draft.ambiguousPicks = amb;
          if (outcome.kind === 'part') {
            const order = (draft.buildings ?? []).map((b) => b.id);
            const myIdx = order.indexOf(target.id);
            let insertAt = draft.parts.length;
            for (let i = 0; i < draft.parts.length; i++) {
              const p = draft.parts[i];
              if (p.sectionKind !== 'building') { insertAt = i; break; }
              const pIdx = order.indexOf(p.buildingId ?? '');
              if (pIdx > myIdx) { insertAt = i; break; }
            }
            draft.parts.splice(insertAt, 0, outcome.part);
            revChanges.push(`${updated.label} kini dihitung (${outcome.part.template.name})`);
          } else if (outcome.kind === 'skip') {
            return { ok: false, changed: false, message: `${buildingRev.summary}, tetapi seksi ${updated.label} belum dapat dibangun: ${outcome.reason} Draft tidak berubah.` };
          }
          // 'deduped' tidak mungkin: gedung ini belum punya part.
        }
      } else if (myParts.length === 0) {
        revChanges.push(`${updated.label} masih belum dihitung (dimensi/lantai belum diketahui)`);
      } else {
        for (const part of myParts) {
          if (buildingRev.functionWord) {
            // Fungsi berubah → pilih ulang template untuk part ini saja.
            const picked = pickTemplateForScope(newSpec, part.scope);
            if (picked.pick && picked.pick.template.id !== part.template.id) {
              const hadManual = Object.keys(part.manualPrices).length;
              const hadRemoved = part.removedKeys.length;
              part.template = picked.pick.template;
              part.removedKeys = [];
              part.manualPrices = {};
              revChanges.push(`template ${updated.label} berganti menjadi "${picked.pick.template.name}"`);
              if (hadManual > 0 || hadRemoved > 0) {
                revChanges.push(`Harga manual (${hadManual} item) dan penghapusan item (${hadRemoved} item) pada template lama ${updated.label} TIDAK diteruskan (item berbeda) — tetapkan ulang bila masih diperlukan.`);
              }
            }
          }
          part.spec = newSpec;
          const mapped = mapSpecToParams(newSpec, part.template, boolOverrides, selectOverrides);
          regeneratePart(draft, part, mapped.params);
        }
      }
    }
    draft.changes = revChanges;
    snapshotVersion(draft, revChanges.join('; '));
    setLastUniversalDraft(draft, bindProjectId);
    return {
      ok: true,
      changed: true,
      message: `Draft diperbarui (versi ${draft.version}): ${revChanges.join('; ')}.\n\n${formatUniversalDraftMessage(draft)}`,
    };
  }

  // --- Perubahan ukuran (berlaku untuk part yang parameternya cocok) ---
  const measureUpdates: Array<{ re: RegExp; apply: (v: number) => void; label: (v: number) => string }> = [
    { re: /(?:luas(?:\s+bangunan)?|area)\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*m/, apply: (v) => { spec.areaM2 = v; }, label: (v) => `luas menjadi ${fmtNum(v)} m²` },
    { re: /(?:panjang)\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*m\b/, apply: (v) => { spec.lengthM = v; }, label: (v) => `panjang menjadi ${fmtNum(v)} m` },
    { re: /(?:lebar)\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*m\b/, apply: (v) => { spec.widthM = v; }, label: (v) => `lebar menjadi ${fmtNum(v)} m` },
    { re: /(?:bentang|span)\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*m\b/, apply: (v) => { spec.spanM = v; }, label: (v) => `bentang menjadi ${fmtNum(v)} m` },
    { re: /(?:lantai)\s*(?:menjadi|=)?\s*(\d+)\s*lantai/, apply: (v) => { spec.floors = v; }, label: (v) => `jumlah lantai menjadi ${v}` },
    { re: /(?:tebal)\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*cm/, apply: (v) => { spec.thicknessCm = v; }, label: (v) => `tebal menjadi ${fmtNum(v)} cm` },
  ];
  // GATE 2 (5B) — penjaga ambiguitas: pada draft multi-seksi, perubahan
  // ukuran TANPA alamat gedung ambigu — ditolak dengan permintaan
  // klarifikasi (bukan diterapkan ke semua gedung). Pengecualian:
  // pesan yang menyebut cakupan shared works (jalan/drainase/pagar/…)
  // diterapkan ke spek proyek dan hanya part NON-gedung yang diregenerasi.
  const isMultiSectionDraft = (draft.buildings?.length ?? 0) >= 2
    && draft.parts.some((p) => p.sectionKind === 'building');
  if (isMultiSectionDraft && measureUpdates.some((m) => m.re.test(t))) {
    const sharedScopeMentioned = /\b(jalan|drainase|pagar|gerbang|taman|halaman|saluran|trotoar|kanstin|septictank|septic|ipal|urugan|galian|timbunan)\b/.test(t);
    if (!sharedScopeMentioned) {
      return {
        ok: false,
        changed: false,
        message: `Draft ini punya ${(draft.buildings ?? []).length} gedung — sebutkan gedungnya (mis. "gedung B jadi 4 lantai" atau "ubah ukuran gedung A menjadi 14 x 9 m") agar hanya gedung itu yang berubah. Untuk pekerjaan bersama, sebutkan cakupannya (mis. "panjang jalan menjadi 100 m"). Draft tidak berubah.`,
      };
    }
  }
  let touched = false;
  for (const m of measureUpdates) {
    const mm = t.match(m.re);
    if (mm) {
      const v = NUM(mm[1]);
      if (Number.isFinite(v) && v > 0) {
        m.apply(v);
        changes.push(m.label(v));
        touched = true;
      }
    }
  }
  if (touched) {
    // GATE 2: draft satu gedung yang membawa model gedung (mis. dari
    // penyebutan dimensi saja) — sinkronkan modelnya agar baris
    // per-bangunan di pesan tidak basi sesudah revisi global. Spek
    // proyek adalah satu-satunya sumber untuk draft satu gedung,
    // sehingga menyalin nilainya ke model tidak pernah menimpa data
    // gedung lain (tidak ada gedung lain).
    if (!isMultiSectionDraft && (draft.buildings?.length ?? 0) === 1) {
      const only = draft.buildings![0];
      const syncPatch: Partial<BuildingModel> & { id: string } = { id: only.id };
      if (spec.floors != null) syncPatch.floors = spec.floors;
      // Konvensi sisi (lihat specForBuilding): spek memakai konvensi
      // rabNeeds (buildingLengthM = angka kedua), model menyimpan
      // urutan tulis — ditukar di sini.
      if (spec.buildingWidthM != null) syncPatch.lengthM = spec.buildingWidthM;
      if (spec.buildingLengthM != null) syncPatch.widthM = spec.buildingLengthM;
      if (spec.areaM2 != null) syncPatch.buildingAreaM2 = spec.areaM2;
      draft.buildings = upsertBuilding(draft.buildings!, syncPatch);
    }
    for (const part of draft.parts) {
      // GATE 2: pada draft multi, cabang ini hanya tercapai untuk
      // cakupan shared works (penjaga ambiguitas di atas) — part gedung
      // dilewati eksplisit (speknya sendiri, part.spec, tidak tersentuh
      // revisi tingkat proyek). Single-building: part.spec selalu absen
      // sehingga perilakunya identik dengan sebelumnya.
      if (isMultiSectionDraft && part.sectionKind === 'building') continue;
      const mapped = mapSpecToParams(part.spec ?? spec, part.template, boolOverrides, selectOverrides);
      regeneratePart(draft, part, mapped.params);
      // Overlay manual/hapus dipertahankan lewat kunci deskripsi+satuan.
    }
    draft.changes = changes;
    snapshotVersion(draft, changes.join('; '));
    setLastUniversalDraft(draft, bindProjectId);
    return {
      ok: true,
      changed: true,
      message: `Draft diperbarui (versi ${draft.version}): ${changes.join('; ')}.\n\n${formatUniversalDraftMessage(draft)}`,
    };
  }

  // --- Ganti tipe/varian (mis. "ganti atap menjadi baja ringan") ---
  // GATE 3 (5C): bentuk "ganti X dengan Y" dan "ganti X jadi Y" juga
  // dikenali (bahasa alami yang sama maknanya dengan "menjadi"); "ke"
  // sengaja TIDAK ditambah karena ambigu dengan arah/tujuan ("ubah
  // harga ke manual"). Pengganti yang diawali angka (mis. "ubah panjang
  // jadi 100 m" — itu revisi ukuran, bukan varian) TIDAK cocok di sini
  // agar jatuh ke cabang yang tepat / routing normal seperti sebelumnya.
  const switchMatch = t.match(/(?:ganti|ubah)\s+(.+?)\s+(?:menjadi|dengan|jadi)\s+([^\d].+)/);
  if (switchMatch) {
    const target = switchMatch[2].trim();
    const candidates = officialTemplates().filter(
      (tpl) => templateText(tpl).includes(target) && draft.parts.some((p) => p.scope.categories.includes(tpl.category))
    );
    if (candidates.length > 0) {
      const next = candidates[0];
      const part = draft.parts.find((p) => p.scope.categories.includes(next.category))!;
      // GATE 2: part gedung memakai speknya sendiri (part.spec) — ganti
      // template tidak pernah menghitung ulang dari spek proyek.
      const mapped = mapSpecToParams(part.spec ?? spec, next, boolOverrides, selectOverrides);
      // Provenance revisi yang jujur: harga manual & penghapusan item
      // terikat pada item template LAMA (kunci deskripsi+satuan). Template
      // baru punya item berbeda, jadi keduanya TIDAK diteruskan secara
      // diam-diam — resetnya dicatat eksplisit di riwayat perubahan.
      const hadManual = Object.keys(part.manualPrices).length;
      const hadRemoved = part.removedKeys.length;
      part.template = next;
      part.removedKeys = [];
      part.manualPrices = {};
      regeneratePart(draft, part, mapped.params);
      draft.changes = [`Template part "${part.scope.label}" diganti menjadi "${next.name}"`];
      if (hadManual > 0 || hadRemoved > 0) {
        draft.changes.push(
          `Harga manual (${hadManual} item) dan penghapusan item (${hadRemoved} item) pada template lama TIDAK diteruskan ke template baru (item berbeda) — tetapkan ulang bila masih diperlukan.`
        );
      }
      snapshotVersion(draft, draft.changes[0]);
      setLastUniversalDraft(draft, bindProjectId);
      return { ok: true, changed: true, message: `Draft diperbarui (versi ${draft.version}): ${draft.changes[0]}.\n\n${formatUniversalDraftMessage(draft)}` };
    }
    return { ok: false, changed: false, message: `Tidak menemukan varian "${target}" di katalog untuk cakupan draft ini — draft tidak berubah.` };
  }

  // --- Hapus item (berdasarkan nomor tampil atau nama) ---
  const removeMatch = t.match(/(?:hapus|hilangkan)\s+(?:item\s+)?(?:nomor\s+)?(\d+|.*)/);
  if (/\b(hapus|hilangkan)\b/.test(t) && removeMatch) {
    const items = effectiveItems(draft);
    const arg = removeMatch[1].trim();
    let target: DraftItem | undefined;
    if (/^\d+$/.test(arg)) {
      target = items[parseInt(arg, 10) - 1];
    } else {
      target = items.find((i) => i.description.toLowerCase().includes(arg));
    }
    if (!target) {
      return { ok: false, changed: false, message: `Item "${arg}" tidak ditemukan di draft — draft tidak berubah.` };
    }
    const part = findPartForItem(draft, target)!;
    part.removedKeys.push(itemKey(target));
    draft.changes = [`Item "${target.description}" dihapus dari draft`];
    snapshotVersion(draft, draft.changes[0]);
    setLastUniversalDraft(draft, bindProjectId);
    return { ok: true, changed: true, message: `Draft diperbarui (versi ${draft.version}): ${draft.changes[0]}.\n\n${formatUniversalDraftMessage(draft)}` };
  }

  // --- Harga manual ---
  const manualMatch = t.match(/(?:harga manual|gunakan harga(?:\s+manual)?)\s*(?:rp\.?\s*)?([\d.]+(?:,\d+)?)\s*(miliar|milyar|jt|juta|rb|ribu)?\s*(?:untuk\s+)?(?:item\s+)?(?:nomor\s+)?(\d+|.+)?/);
  if (/\b(harga manual|gunakan harga)\b/.test(t) && manualMatch) {
    const price = parseRupiahAmount(manualMatch[1], manualMatch[2]);
    const arg = (manualMatch[3] || '').trim();
    const items = effectiveItems(draft);
    let target: DraftItem | undefined;
    if (/^\d+$/.test(arg)) target = items[parseInt(arg, 10) - 1];
    else if (arg) target = items.find((i) => i.description.toLowerCase().includes(arg));
    if (!target || price <= 0) {
      return { ok: false, changed: false, message: 'Harga manual tidak dapat diterapkan — sebutkan nominal dan itemnya, mis. "gunakan harga manual Rp 500.000 untuk item 3".' };
    }
    const part = findPartForItem(draft, target)!;
    part.manualPrices[itemKey(target)] = { unitPrice: price, note: `Harga manual dari chat (${formatRupiah(price)} per ${target.unit})` };
    draft.changes = [`Harga item "${target.description}" diubah manual menjadi ${formatRupiah(price)} per ${target.unit}`];
    snapshotVersion(draft, draft.changes[0]);
    setLastUniversalDraft(draft, bindProjectId);
    return { ok: true, changed: true, message: `Draft diperbarui (versi ${draft.version}): ${draft.changes[0]}.\n\n${formatUniversalDraftMessage(draft)}` };
  }

  // --- Tambah item (komponen opsional template sama / template donor se-cakupan) ---
  const addMatch = t.match(/(?:tambah|tambahkan)\s+(.+)/);
  if (/\b(tambah|tambahkan)\b/.test(t) && addMatch) {
    const keyword = addMatch[1].trim();
    const svc = RabTemplateService.getInstance();
    // (a) Komponen opsional template draft yang belum ikut.
    for (const part of draft.parts) {
      const optionalIds = (part.template.components || []).filter((c) => c.isOptional).map((c) => c.id);
      const already = new Set(part.generation.selectedOptionalItemIds || []);
      const wanted = optionalIds.filter((id) => {
        const c = (part.template.components || []).find((x) => x.id === id);
        return c && c.name.toLowerCase().includes(keyword);
      }).filter((id) => !already.has(id));
      if (wanted.length > 0) {
        const generation = svc.generateRabFromTemplate(
          part.template, part.evaluatedParams, undefined, 'PROFESSIONAL',
          [...(part.generation.selectedOptionalItemIds || []), ...wanted]
        );
        part.generation = generation;
        part.evaluatedParams = generation.evaluatedParameters;
        draft.changes = [`Item opsional "${keyword}" ditambahkan dari template "${part.template.name}"`];
        snapshotVersion(draft, draft.changes[0]);
        setLastUniversalDraft(draft, bindProjectId);
        return { ok: true, changed: true, message: `Draft diperbarui (versi ${draft.version}): ${draft.changes[0]}.\n\n${formatUniversalDraftMessage(draft)}` };
      }
    }
    // (b) Donor: generate template se-cakupan lain, ambil item yang cocok.
    for (const part of draft.parts) {
      const donors = officialTemplates().filter(
        (tpl) => tpl.id !== part.template.id && part.scope.categories.includes(tpl.category)
      );
      for (const donor of donors) {
        // GATE 2: donor untuk part gedung memakai spek gedung itu.
        const mapped = mapSpecToParams(part.spec ?? spec, donor, boolOverrides, selectOverrides);
        const gen = svc.generateRabFromTemplate(donor, mapped.params, undefined, 'PROFESSIONAL', []);
        const hit = gen.items.find((i) => i.description.toLowerCase().includes(keyword));
        // Revisi berulang tidak boleh menggandakan: bila item dengan
        // deskripsi+satuan yang sama sudah ada di draft, tolak tanpa
        // mengubah versi (bukan menambah salinan kedua dengan id baru).
        if (hit && effectiveItems(draft).some((i) => itemKey(i) === itemKey(hit))) {
          return { ok: false, changed: false, message: `Item "${hit.description}" sudah ada di draft — tidak digandakan. Draft tidak berubah.` };
        }
        if (hit) {
          part.generation = {
            ...part.generation,
            items: [...part.generation.items, { ...hit, id: `rab-donor-${Date.now()}` }],
            itemCount: part.generation.items.length + 1,
          };
          draft.changes = [`Item "${hit.description}" ditambahkan dari template "${donor.name}"`];
          snapshotVersion(draft, draft.changes[0]);
          setLastUniversalDraft(draft, bindProjectId);
          return { ok: true, changed: true, message: `Draft diperbarui (versi ${draft.version}): ${draft.changes[0]}.\n\n${formatUniversalDraftMessage(draft)}` };
        }
      }
    }
    return { ok: false, changed: false, message: `Item "${keyword}" tidak ditemukan di katalog untuk cakupan draft ini — draft tidak berubah.` };
  }

  // --- Tampilkan item yang belum pasti ---
  if (/\b(tampilkan|lihat|tunjuk)\b/.test(t) && /\b(belum pasti|belum tersedia|tidak pasti|estimasi|belum jelas)\b/.test(t)) {
    return { ok: true, changed: false, message: formatUncertainItemsMessage(draft) };
  }

  // --- Hitung ulang ---
  if (/\b(hitung ulang|recalculate|re-kalkulasi)\b/.test(t)) {
    for (const part of draft.parts) {
      // GATE 2: part gedung dihitung ulang dari speknya sendiri.
      const mapped = mapSpecToParams(part.spec ?? spec, part.template, boolOverrides, selectOverrides);
      regeneratePart(draft, part, mapped.params);
    }
    draft.changes = ['Total dihitung ulang dari parameter saat ini'];
    snapshotVersion(draft, draft.changes[0]);
    setLastUniversalDraft(draft, bindProjectId);
    return { ok: true, changed: true, message: `Draft diperbarui (versi ${draft.version}): total dihitung ulang.\n\n${formatUniversalDraftMessage(draft)}` };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Payload push ke Spreadsheet                                         */
/* ------------------------------------------------------------------ */

export interface UniversalPushItem {
  description: string;
  volume: number;
  unit: string;
  code: string;
  ahspCode?: string;
  unitPrice?: number;
  priceStatus: 'PRICE_RESOLVED' | 'PRICE_UNRESOLVED' | 'PRICE_ESTIMATED' | 'PRICE_MANUAL';
  priceSourceKind?: RabItem['priceSourceKind'];
  priceSourceLabel?: string;
  priceSourceExplanation?: string;
  /** Basis biaya harga satuan (§17.1) — diteruskan apa adanya dari draft, kecuali item manual. */
  priceCostBasis?: RabItem['priceCostBasis'];
  priceSourceName?: string | null;
  priceSourceSupplier?: string | null;
  priceSourceDate?: string | null;
  priceSourceRegion?: string | null;
  ahspMappingStatus?: RabItem['ahspMappingStatus'];
  category: string;
  volumeSource: 'AI_GENERATED';
}

export interface UniversalPushPreview {
  partCount: number;
  itemCount: number;
  groupCount: number;
  verifiedTotal: number;
  marketTotal: number;
  databaseTotal: number;
  manualTotal: number;
  estimatedTotal: number;
  unpricedCount: number;
  pricedCount: number;
  totalsStatus: 'PARSIAL' | 'ESTIMASI' | 'LENGKAP';
  unpricedItems: string[];
  needsFixItems: string[];
  assumptions: string[];
  budgetComparison: string | null;
  /** Kesiapan transfer saat preview dibuat (dihitung dari draft). */
  readiness: DraftReadinessStatus;
  transferBlocked: boolean;
  blockReasons: string[];
}

/** Preview transfer: hitungan + daftar yang perlu diperbaiki, tanpa menulis. */
export function buildPushPreview(draft: UniversalDraft): UniversalPushPreview {
  const items = effectiveItems(draft);
  const totals = computeTotals(draft);
  const readiness = draftReadiness(draft);
  const groups = new Set(items.map((i) => i.category || 'Lainnya'));
  const needsFix: string[] = [];
  for (const part of draft.parts) {
    if (part.generation.generationStatus === 'INCOMPLETE_MISSING_PARAMS') {
      needsFix.push(`[${part.scope.label}] parameter wajib belum lengkap: ${(part.generation.missingRequiredParams ?? []).join(', ')}`);
    }
    for (const it of part.generation.items) {
      if (it.notes && it.notes.includes('Volume: INVALID')) {
        needsFix.push(`Volume INVALID: ${it.description}`);
      }
    }
  }
  // Subtotal per ember + nilai yang belum dapat dihitung: preview lama
  // hanya menampilkan verified + estimated sehingga campuran resmi/pasar/
  // database/manual tampak seperti satu total — sekarang dipisah eksplisit.
  return {
    partCount: draft.parts.length,
    itemCount: items.length,
    groupCount: groups.size,
    verifiedTotal: totals.verifiedTotal,
    marketTotal: totals.marketTotal,
    databaseTotal: totals.databaseTotal,
    manualTotal: totals.manualTotal,
    estimatedTotal: totals.estimatedTotal,
    unpricedCount: totals.unpricedCount,
    pricedCount: items.length - totals.unpricedCount,
    totalsStatus: totals.status,
    unpricedItems: items.filter((i) => !isPriceValidForTotal(i)).map((i) => i.description),
    needsFixItems: needsFix,
    assumptions: draft.assumptions,
    budgetComparison:
      draft.spec.budgetCap != null
        ? (totals.estimatedTotal <= draft.spec.budgetCap
            ? `Di bawah anggaran ${formatRupiah(draft.spec.budgetCap)}`
            : `Melebihi anggaran ${formatRupiah(draft.spec.budgetCap)} sebesar ${formatRupiah(totals.estimatedTotal - draft.spec.budgetCap)}`)
        : null,
    readiness: readiness.status,
    transferBlocked: readiness.status === 'BLOCKED',
    blockReasons: readiness.blockedReasons,
  };
}

/**
 * Payload transfer — provenance dipertahankan sejauh didukung factory.
 *
 * GUARD TRANSFER (bukan hanya tombol UI): draft BLOCKED melempar Error di
 * sini, sehingga jalur mana pun yang membangun payload — termasuk klik
 * ganda/eksekusi ulang handler di view — tidak pernah menulis item yang
 * belum siap. Pemanggil yang ingin pesan ramah harus memanggil
 * validateTransfer dulu; lemparan ini adalah jaring pengaman terakhir.
 * Dua perbaikan provenance dibanding payload lama:
 * - label/penjelasan sumber kini diteruskan untuk SEMUA item (payload lama
 *   membuangnya untuk item non-manual, sehingga record pasca-transfer
 *   kehilangan label 'Harga Resmi AHSP 2026'/'Harga Referensi');
 * - item PRICE_MANUAL TIDAK membawa priceSourceKind lama (payload lama
 *   meneruskan kind OFFICIAL_AHSP bersama status MANUAL — record yang
 *   mengklaim resmi sekaligus manual). Kind manual memang tidak ada di
 *   enum, jadi yang diteruskan hanya status + label/penjelasan manual.
 * - basis biaya `priceCostBasis` (§17.1) diteruskan seperti kind, dengan
 *   pengecualian manual yang sama: harga manual menggantikan harga asal
 *   sehingga basis asalnya tidak lagi berlaku.
 */
export function buildPushPayload(draft: UniversalDraft): UniversalPushItem[] {
  const readiness = draftReadiness(draft);
  if (readiness.status === 'BLOCKED') {
    throw new Error(
      `Draft diblokir untuk transfer: ${readiness.blockedReasons.join('; ')} — lengkapi spesifikasi lewat revisi, lalu coba lagi.`
    );
  }
  // GATE 2 (5B): pada draft multi-seksi, item membawa label seksinya di
  // deskripsi — tanpa ini dua gedung bertemplate sama menghasilkan item
  // berdeskripsi+volume identik yang saling men-dedup di
  // dedupePushPayload (gedung kedua hilang saat transfer). Single:
  // deskripsi tidak berubah.
  const isMultiSection = (draft.buildings?.length ?? 0) >= 2
    && draft.parts.some((p) => p.sectionKind === 'building');
  return effectiveItems(draft).map((it) => {
    let priceStatus: UniversalPushItem['priceStatus'];
    if (!isPriceValidForTotal(it)) priceStatus = 'PRICE_UNRESOLVED';
    else if (it.priceStatus === 'PRICE_MANUAL') priceStatus = 'PRICE_MANUAL';
    else priceStatus = 'PRICE_RESOLVED';
    const sectionPrefix = !isMultiSection
      ? ''
      : it.__buildingId
        ? `[${(draft.buildings ?? []).find((b) => b.id === it.__buildingId)?.label ?? it.__buildingId}] `
        : it.__sectionKind === 'shared-works'
          ? '[Pekerjaan Bersama] '
          : '';
    return {
      description: `[Chat AI] ${sectionPrefix}${it.description}`,
      volume: it.volume,
      unit: it.unit,
      code: it.code || it.ahspCode || '',
      ...(it.ahspCode ? { ahspCode: it.ahspCode } : {}),
      ...(isPriceValidForTotal(it) ? { unitPrice: it.unitPrice as number } : {}),
      priceStatus,
      // Manual: kind lama sengaja TIDAK diteruskan (lihat komentar guard).
      ...(it.priceStatus === 'PRICE_MANUAL'
        ? {}
        : it.priceSourceKind ? { priceSourceKind: it.priceSourceKind } : {}),
      // Basis biaya (§17.1): diteruskan seperti kind — kecuali item
      // manual, yang harganya diganti pengguna sehingga basis asalnya
      // tidak lagi berlaku (absen = fail-closed, O&P tetap ditagih).
      ...(it.priceStatus === 'PRICE_MANUAL'
        ? {}
        : it.priceCostBasis ? { priceCostBasis: it.priceCostBasis } : {}),
      ...(it.priceSourceLabel ? { priceSourceLabel: it.priceSourceLabel } : {}),
      ...(it.priceStatus === 'PRICE_MANUAL'
        ? { priceSourceLabel: 'Harga manual pengguna', priceSourceExplanation: it.priceSourceExplanation || 'Harga manual dari chat' }
        : it.priceSourceExplanation ? { priceSourceExplanation: it.priceSourceExplanation } : {}),
      ...(it.priceSourceName !== undefined ? { priceSourceName: it.priceSourceName } : {}),
      ...(it.priceSourceSupplier !== undefined ? { priceSourceSupplier: it.priceSourceSupplier } : {}),
      ...(it.priceSourceDate !== undefined ? { priceSourceDate: it.priceSourceDate } : {}),
      ...(it.priceSourceRegion !== undefined ? { priceSourceRegion: it.priceSourceRegion } : {}),
      ...(it.ahspMappingStatus ? { ahspMappingStatus: it.ahspMappingStatus } : {}),
      category: it.category || 'Lainnya',
      volumeSource: 'AI_GENERATED',
    };
  });
}

/**
 * Dedup payload terhadap item spreadsheet yang sudah ada.
 *
 * Kunci lama (kode+uraian) terlalu longgar: dua item berbeda yang kebetulan
 * mirip namanya bisa saling menghapus. Kunci baru = kode + uraian +
 * satuan + volume (2 desimal). Bila item lama tidak membawa satuan/volume
 * (pemanggil lama / data legacy), fallback ke kunci lama untuk item itu
 * saja — didokumentasikan, bukan disembunyikan. Dedup juga berlaku di
 * DALAM payload (duplikat internal dihitung sebagai dup, bukan ditulis
 * dua kali).
 */
export function dedupePushPayload(
  payload: UniversalPushItem[],
  existing: Array<{ code?: string; description?: string; unit?: string; volume?: number }>
): { newItems: UniversalPushItem[]; dupCount: number } {
  const normDesc = (s: string) => s.replace(/^\[Chat AI\] /, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const legacyKey = (code: string | undefined, desc: string | undefined) =>
    `${code || ''}|${normDesc(desc || '')}`;
  const exactKey = (code: string | undefined, desc: string | undefined, unit: string | undefined, vol: number | undefined) =>
    `${legacyKey(code, desc)}|${(unit || '').toLowerCase()}|${vol != null && Number.isFinite(vol) ? vol.toFixed(2) : ''}`;
  const existingExact = new Set<string>();
  const existingLegacy = new Set<string>();
  for (const i of existing) {
    if (i.unit != null && i.volume != null && Number.isFinite(i.volume)) {
      existingExact.add(exactKey(i.code, i.description, i.unit, i.volume));
    } else {
      existingLegacy.add(legacyKey(i.code, i.description));
    }
  }
  const seenExact = new Set<string>();
  const newItems: UniversalPushItem[] = [];
  let dupCount = 0;
  for (const p of payload) {
    const ex = exactKey(p.code, p.description, p.unit, p.volume);
    const lg = legacyKey(p.code, p.description);
    if (seenExact.has(ex) || existingExact.has(ex) || existingLegacy.has(lg)) {
      dupCount++;
      continue;
    }
    seenExact.add(ex);
    newItems.push(p);
  }
  return { newItems, dupCount };
}

export interface TransferValidation {
  allowed: boolean;
  reasons: string[];
  /** true bila versi ini sudah pernah ditransfer ke proyek yang sama. */
  duplicate: boolean;
}

/**
 * Validasi transfer SEBELUM menulis apa pun (pure, dapat dites tanpa UI).
 * - projectId kosong → tidak boleh (proyek tidak boleh tertukar/diragukan);
 * - draft BLOCKED → tidak boleh (alasan dari draftReadiness);
 * - receipt (projectId + versi) sudah ada untuk proyek ini → duplikat,
 *   tidak boleh ditulis ulang. Pindah proyek (projectId berbeda dari
 *   receipt) BUKAN duplikat: receipt mengikat per proyek, transfer ke
 *   proyek baru diizinkan dan akan mencatat receipt baru untuk proyek itu.
 * Batas yang tidak dapat diuji tanpa backend live: bulkAddRabItems yang
 * gagal DI TENGAH penulisan (sebagian item sudah tertulis lalu throw).
 * Pemulihannya mengandalkan dedup saat retry: item yang sudah tertulis
 * dikenali dari kunci kode+uraian+satuan+volume dan dilewati — tetapi
 * kegagalan parsial itu sendiri tidak dapat disimulasikan di level ini
 * (tidak ada backend/storage live di tes tsx).
 */
export function validateTransfer(
  draft: UniversalDraft,
  projectId: string | null | undefined
): TransferValidation {
  const reasons: string[] = [];
  if (!projectId) {
    reasons.push('tidak ada proyek tujuan (projectId kosong — buat/buka proyek dulu)');
  }
  const readiness = draftReadiness(draft);
  if (readiness.status === 'BLOCKED') {
    reasons.push(...readiness.blockedReasons);
  }
  let duplicate = false;
  if (projectId && draft.lastTransfer &&
      draft.lastTransfer.projectId === projectId &&
      draft.lastTransfer.version === draft.version) {
    duplicate = true;
    reasons.push(
      `versi ${draft.version} sudah ditransfer ke proyek ini pada ${draft.lastTransfer.at} (${draft.lastTransfer.pushed} item) — tidak ada penulisan ganda`
    );
  }
  return { allowed: reasons.length === 0, reasons, duplicate };
}

/** Catat receipt transfer pada draft (cermin logika view; dapat dites). */
export function applyTransferReceipt(
  draft: UniversalDraft,
  projectId: string,
  pushed: number,
  skipped: number
): NonNullable<UniversalDraft['lastTransfer']> {
  draft.lastTransfer = {
    projectId,
    version: draft.version,
    pushed,
    skipped,
    at: new Date().toISOString(),
  };
  // FASE 5 (ARS-06) — receipt transfer mengikat draft ke proyeknya.
  setLastUniversalDraft(draft, projectId);
  return draft.lastTransfer;
}

export function formatPushPreviewMessage(draft: UniversalDraft, preview: UniversalPushPreview, projectName: string | null): string {
  const lines: string[] = [];
  lines.push(`**Preview transfer — ${draft.title} (versi ${draft.version})**`);
  lines.push(`• Proyek tujuan: ${projectName ?? '— (belum ada proyek aktif — buat/buka proyek dulu di menu Proyek)'}`);
  lines.push(`• ${preview.partCount} template · ${preview.groupCount} kelompok · ${preview.itemCount} item (${preview.pricedCount} berharga, ${preview.unpricedCount} belum berharga)`);
  lines.push(`• Status draft: ${readinessLabel(preview.readiness)} · Status total: ${preview.totalsStatus}`);
  lines.push(`• Total terverifikasi (RESMI AHSP): ${formatRupiah(preview.verifiedTotal)}`);
  if (preview.marketTotal > 0) lines.push(`• Total referensi pasar: ${formatRupiah(preview.marketTotal)} (tabel pasar tersimpan, bukan fetch live; tanggal/wilayah sumber tidak tercatat di katalog)`);
  if (preview.databaseTotal > 0) lines.push(`• Total harga database: ${formatRupiah(preview.databaseTotal)} (harga referensi template, bukan resmi)`);
  if (preview.manualTotal > 0) lines.push(`• Total harga manual: ${formatRupiah(preview.manualTotal)} (tidak menjadi resmi saat transfer)`);
  lines.push(`• Total estimasi (termasuk harga database, referensi pasar, dan manual): ${formatRupiah(preview.estimatedTotal)}`);
  lines.push(`• Item belum berharga: ${preview.unpricedItems.length} — nilainya BELUM DAPAT DIHITUNG dan tidak masuk total (bukan Rp 0); masuk sebagai PRICE_UNRESOLVED — tetapkan di spreadsheet`);
  if (preview.budgetComparison) lines.push(`• Anggaran: ${preview.budgetComparison}`);
  if (preview.needsFixItems.length > 0) {
    lines.push(`• Perlu diperbaiki sebelum transfer:`);
    for (const f of preview.needsFixItems) lines.push(`  – ${f}`);
  }
  if (preview.transferBlocked) {
    lines.push(`• ⛔ DRAFT INI DIBLOKIR UNTUK TRANSFER:`);
    for (const r of preview.blockReasons) lines.push(`  – ${r}`);
  }
  if (preview.assumptions.length > 0) {
    lines.push(`• Asumsi ikut tercatat di deskripsi item bila didukung; daftar asumsi:`);
    for (const a of preview.assumptions.slice(0, 6)) lines.push(`  – ${a}`);
  }
  lines.push('');
  if (preview.transferBlocked) {
    lines.push('Draft ini TIDAK DAPAT ditransfer sampai alasan blokir di atas dilengkapi lewat revisi. Perbaiki dulu, tinjau preview lagi, baru konfirmasi.');
  } else {
    lines.push('Harga ESTIMASI AI tidak ada di draft ini yang berubah menjadi resmi saat transfer — status tiap item dipertahankan (RESMI AHSP / HARGA DATABASE / HARGA MANUAL / BELUM TERSEDIA). Tekan **Konfirmasi Transfer** untuk menulis ke Spreadsheet, atau batalkan dan revisi dulu di chat.');
  }
  return lines.join('\n');
}
