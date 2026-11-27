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
import type { StructuredSpec, SpecStatus } from './structuredSpec';
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
  buildWbsForDraft,
  validateWbsCompleteness,
  traceItemSpecs,
  formatWbsCompletenessLines,
  computeVolumeBasis,
} from './specChain';
import type { ChainValidation, ItemSpecTrace, WbsCompletenessReport } from './specChain';
import { resolveWbsMapping } from './wbsArtifact';
import type { WbsArtifact, WbsMappingStatus } from './wbsArtifact';
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
import type { RabItem, UserDecisionStatus, VerificationStatus, VolumeSourceType, ChatQtoTrace } from '../../types';
/* W3/W9 (§9, S3-15/16) — import TYPE saja (dihapus saat kompilasi):
 * factory mengimpor wbsArtifact secara runtime, jadi impor nilai dari
 * sini akan melingkar; tipe `VolumeBasis` aman diimpor sebagai type. */
import type { VolumeBasis } from '../../engine/rab/rabItemFactory';
import { extractRabNeeds, stripLandPhrases, detectNeedsFunction, isNegatedAt, parseBudgetMentions, extractUniversalMeasures } from './rabNeeds';
import { extractRabIntentSpec, houseViewFromSpec } from './rabIntentSpec';
import type { HouseSpecView, RabIntentSpec } from './rabIntentSpec';
/* W2/W10 §2 — taksonomi tunggal (universalTaxonomy adalah modul daun:
 * impor ini tidak bersiklus karena taksonomi tidak mengimpor modul ini). */
import {
  classifyUniversal,
  findLinearMentions,
  parseAnchoredLinear,
  findAreaMentions,
  cancelledAreaValues,
  findVolumeMentions,
  parseCountMentions,
  cancelledLinearValues,
  findPowerMentions,
  isExcludedKeywordOccurrence,
} from './universalTaxonomy';
import type { Classification } from './universalTaxonomy';
/* Batch 1 (§4) — evaluator kesesuaian template (modul daun: hanya
 * mengimpor TIPE dari modul ini, jadi impor nilai ini tidak bersiklus). */
import { evaluateTemplateSuitability, isPerUnitAreaParam } from './templateSuitability';
import type { SuitabilityDecision } from './templateSuitability';
/* Batch 3 (§6) — gerbang spesifikasi teknik & integritas QTO (modul
 * daun: hanya mengimpor TIPE dari modul ini, jadi impor nilai ini
 * tidak bersiklus). */
import {
  engineeringCategoryFor,
  evaluateEngineeringSpec,
  classifyEngineeringRisk,
  assessDraftEngineering,
} from './engineeringSpec';
import type { DraftEngineeringAssessment } from './engineeringSpec';
/* Batch 2 (§5) — intelijensi disiplin & cakupan (modul daun: hanya
 * mengimpor TIPE dari modul ini + nilai dari taksonomi/evaluator,
 * jadi impor nilai ini tidak bersiklus). */
import {
  buildScopeModel,
  refreshScopeModel,
  computeContextScopeSuppression,
  shouldSuppressRenovasiPart,
  resolveScopeAddress,
} from './scopeDiscipline';
import type { DraftScopeModel } from './scopeDiscipline';
import { formatWorkItemTitle } from './workItemTitle';
import { understandProject, assessBuildingMissingInfo, summarizeUnderstanding } from './buildingTypology';
import { formatRupiah } from '../../engine/formulaEngine';
import { filterItemsByRelevance } from './relevanceGate';
/* Lengkapi dengan Full AI (§5) — import TYPE saja (dihapus saat kompilasi):
 * fullAiRabCompletion mengimpor totalsFromItems/isPriceValidForTotal dari
 * modul ini secara runtime, jadi impor nilai dari sini akan melingkar. */
import type { FullAiCompletionSummary } from './fullAiRabCompletion';

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
  { id: 'mep', label: 'Mekanikal, Elektrikal & Plumbing', categories: ['MEP_SYSTEM', 'UTILITAS'], keywords: ['mep', 'mekanikal', 'elektrikal', 'plumbing', 'instalasi listrik', 'panel listrik', 'pompa air', 'perpipaan', 'hvac', 'instalasi air', 'instalasi ac', 'hydrant', 'gas medis', 'sumur bor', 'fire protection', 'fire alarm', 'pemadam kebakaran', 'sprinkler', 'jaringan data', 'kabel data', 'sistem komunikasi', 'komunikasi dan data', 'structured cabling'], primaryMeasure: 'areaOrLength', primaryLabel: 'luas bangunan atau panjang instalasi' },
  { id: 'sanitasi', label: 'Sanitasi & Air Limbah', categories: ['DRAINASE_SANITASI', 'UTILITAS'], keywords: ['sanitasi', 'septictank', 'septic tank', 'tangki septik', 'sumur resapan', 'ipal', 'wastafel', 'kloset', 'floor drain', 'air limbah'], primaryMeasure: 'areaOrLength', primaryLabel: 'luas atau panjang' },
  { id: 'jalan', label: 'Jalan & Perkerasan', categories: ['JALAN_TRANSPORTASI', 'PERKERASAN'], keywords: ['jalan', 'perkerasan', 'aspal', 'hotmix', 'paving', 'rabat beton', 'trotoar', 'kanstin', 'marka jalan', 'bahu jalan'], primaryMeasure: 'length', primaryLabel: 'panjang (meter) atau luas (m²) untuk paving' },
  { id: 'gedung', label: 'Gedung & Bangunan', categories: ['GEDUNG', 'BANGUNAN_TINGGI', 'HOTEL_HOSPITALITY', 'KESEHATAN', 'PENDIDIKAN', 'INDUSTRI'], keywords: ['gedung', 'kantor', 'sekolah', 'rumah sakit', 'klinik', 'gudang', 'hotel', 'ruko', 'villa', 'kos', 'apartemen', 'masjid', 'puskesmas', 'pasar', 'pabrik', 'bengkel', 'workshop', 'warehouse', 'toko', 'aula', 'minimarket', 'restoran', 'kafe', 'showroom', 'apotek', 'laundry', 'kios', 'warung', 'musholla', 'mushola', 'vihara', 'klenteng', 'gereja', 'pura', 'madrasah', 'perpustakaan', 'kontrakan', 'rumah makan', 'tempat ibadah', 'perumahan'], primaryMeasure: 'areaOrFloors', primaryLabel: 'luas atau dimensi bangunan' },
  { id: 'lanskap', label: 'Lanskap, Pagar & Halaman', categories: ['LANDSCAPE_SITE'], keywords: ['lanskap', 'landscape', 'pagar', 'gerbang', 'halaman', 'taman', 'area parkir', 'pekarangan', 'tembok penahan', 'retaining wall', 'dinding penahan'], primaryMeasure: 'areaOrLength', primaryLabel: 'luas atau panjang' },
  { id: 'renovasi', label: 'Renovasi & Rehabilitasi', categories: ['RENOVASI_MAINTENANCE'], keywords: ['renovasi', 'rehabilitasi', 'rehab', 'perbaikan', 'restorasi', 'perkuatan', 'renov', 'kanopi'], primaryMeasure: 'areaOrBudget', primaryLabel: 'luas atau batas anggaran' },
  { id: 'demolisi', label: 'Demolisi & Pembongkaran', categories: ['DEMOLISI_REKONSTRUKSI'], keywords: ['demolisi', 'pembongkaran', 'bongkar', 'robohkan', 'pembongkaran'], primaryMeasure: 'area', primaryLabel: 'luas bangunan yang dibongkar (m²)' },
  { id: 'pelabuhan', label: 'Pelabuhan & Pesisir', categories: ['PELABUHAN_PESISIR'], keywords: ['pelabuhan', 'dermaga', 'pesisir', 'tetrapod', 'turap', 'breakwater', 'dinding laut'], primaryMeasure: 'length', primaryLabel: 'panjang (meter)' },
  { id: 'olahraga', label: 'Fasilitas Olahraga', categories: ['FASILITAS_OLAHRAGA'], keywords: ['lapangan', 'stadion', 'olahraga', 'futsal', 'badminton', 'kolam renang', 'kolam ikan', 'kolam', 'sport'], primaryMeasure: 'area', primaryLabel: 'luas lapangan (m²)' },
  // 'sumur bor' PINDAH ke mep (koordinator 2026-11-22 21:58, final gate A-079):
  // sumur bor adalah sistem air tanah (template UTIL-DEEP-WELL, kategori
  // UTILITAS — ada di pool mep, BUKAN di pool PERTANIAN_PERKEBUNAN).
  // Sebelumnya keyword ini di pertanian sehingga "sumur bor 30 m"
  // dipasangi template jalan kebun — RAB yang salah total untuk
  // pekerjaan pengeboran. Sumur bor untuk kandang/sawah tetap terhitung
  // benar lewat template yang sama; label scope-nya MEP, bukan pertanian.
  { id: 'pertanian', label: 'Pertanian & Perkebunan', categories: ['PERTANIAN_PERKEBUNAN'], keywords: ['pertanian', 'perkebunan', 'sawah', 'kebun', 'kandang', 'greenhouse', 'rumah kaca', 'lumbung'], primaryMeasure: 'areaOrLength', primaryLabel: 'luas atau panjang' },
  { id: 'tanah', label: 'Pekerjaan Tanah', categories: ['PEKERJAAN_TANAH'], keywords: ['galian', 'urugan', 'timbunan', 'pemadatan', 'cut and fill', 'cut & fill', 'pekerjaan tanah'], primaryMeasure: 'any', primaryLabel: 'volume, luas, atau panjang' },
];

/**
 * Deteksi grup cakupan dari teks (bisa lebih dari satu untuk "A, B, dan C").
 *
 * KEPUTUSAN W2/W10 (2026-11-22 — lihat header universalTaxonomy.ts):
 * fungsi ini TETAP satu-satunya sumber scope engine (part BOQ).
 * classifyUniversal (intake) menjawab pertanyaan berbeda — disiplin
 * yang DISEBUT, termasuk konteks dan kandidat ambigu — dan hasil
 * probe membuktikan union keduanya merusak pin perilaku (rumah typed,
 * box culvert telanjang, "lift gedung"). Yang disatukan adalah
 * SUMBERNYA: extractUniversalSpec menghitung/menerima SATU
 * Classification yang sama dengan intake dan menyimpannya di
 * UniversalSpec.classification — intake dan engine tidak bisa
 * berbeda klasifikasi, sementara keputusan part tetap di sini.
 *
 * CATATAN (handoff W6, 2026-11-22 — TIDAK diperbaiki di sini, di luar
 * cakupan W2/W10): pencocokan di bawah adalah SUBSTRING
 * (`indexOf`), sehingga ada positif-palsu yang TERVERIFIKASI:
 * "pejalan"/"perjalanan" → jalan ('jalur pejalan kaki' ikut memicu
 * scope Jalan); "lahan kosong" → gedung (kata kunci 'kos' ⊂ 'kosong');
 * "beratap" → atap. TETAPI guard batas-kata naif (`\b`) JUGA SALAH:
 * ia mematahkan kecocokan berimbuhan yang SAH — "pergudangan" →
 * gedung, "pertamanan" → lanskap, "penggedungan" → gedung — dan
 * morfologi saja tidak bisa membedakan "perjalanan" (bukan jalan)
 * dari "pergudangan" (memang gudang): pola imbuhannya sama
 * (per-…-an), maknanya berbeda. Perbaikan yang benar butuh kebijakan
 * batas PER-KATA-KUNCI (standalone vs imbuhan-ok + daftar pengecualian
 * leksikal) + regresi penuh atas suite yang mem-pin perilaku fungsi
 * ini — keputusan desain + worker khusus, bukan tambalan di sini.
 */
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
        // Batch 2 (§5.3): kata kunci yang merupakan BAGIAN dari frasa
        // cakupan lain tidak memicu cakupan ini ("saluran irigasi"
        // bukan drainase; "irigasi taman" bukan irigasi SDA;
        // "sprinkler taman" bukan fire protection).
        if (!isNegatedAt(t, idx) && !isExcludedKeywordOccurrence(g.id, kw, t.slice(idx + kw.length))) { hit = true; break; }
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
  /**
   * Kedalaman eksplisit (m) — "kedalaman 30 m" / "dalam 30 m" (global,
   * lewat extractUniversalMeasures) atau panjang telanjang pada
   * permintaan berkata-kunci kedalaman ("sumur bor 30 m" → depthM
   * per-scope mep, lihat DEPTH_KEYWORDS di extractScopeSpecs).
   * Dipakai param template berkind 'depth' (well_depth, pile_depth,
   * channel_depth, …) — BUKAN panjang (lihat catatan classifyParam).
   */
  depthM: number | null;
  thicknessCm: number | null;
  volumeM3: number | null;
  count: number | null;
  /**
   * Daya listrik terpasang (kVA) — Batch 2 (§5.3): basis kuantitas
   * listrik ("instalasi listrik 11 kVA"). Hanya kVA (dan VA→/1000);
   * kW dan kWp TIDAK dikonflasi. Dipakai param template berkind
   * 'power' (installed_kva) — dan scopeMeasureAvailable menerima
   * powerKva sebagai basis mep. Opsional: spek yang dibangun manual
   * di luar extractUniversalSpec tidak wajib memilikinya (absen =
   * tidak disebut, sama dengan null).
   */
  powerKva?: number | null;
  budgetCap: number | null;
  location: string | null;
  /** Kata kunci material/kualitas yang disebut (beton, aspal, baja ringan…). */
  materialKeywords: string[];
  /** Kata kunci lingkup tambahan (mis. 'drainase' di dalam permintaan jalan). */
  extraKeywords: string[];
  isRenovation: boolean;
  isDemolition: boolean;
  /**
   * Spek PER-SCOPE (W2/W10 §10, S1-R4): ukuran yang teratribusi ke
   * tiap cakupan ("jalan 2 km + drainase 500 m" → jalan 2000 m,
   * drainase 500 m). Hanya berisi ukuran yang TERATRIBUSI ke scope
   * itu; scope tanpa atribusi memakai ukuran proyek (global) lewat
   * specForScope — perilaku lama dipertahankan (lihat catatan di
   * specForScope). Selalu ada ({} bila tidak ada atribusi).
   */
  scopeSpecs: Record<string, ScopeSpec>;
  /**
   * Klasifikasi intake (W2/W10 §2): primer/sekunder/isMulti dari
   * classifyUniversal yang SAMA dengan yang dipakai intake — disimpan
   * sebagai ID saja (bukan objek SubcategoryDef, agar spek tetap
   * JSON-serializable untuk persistence). Absen hanya pada spek yang
   * dibangun manual di luar extractUniversalSpec.
   */
  classification?: {
    primaryId: string | null;
    secondaryIds: string[];
    isMulti: boolean;
  };
  /**
   * View rumah (W2/W10 §2, S1-R3): field rumah (kamar, kualitas,
   * pengecualian, …) dari teks yang sama, agar jalur universal dapat
   * MEMBACA field rumah tanpa kehilangan data. Absen bila tidak ada
   * field rumah yang terisi. Lihat HouseSpecView (rabIntentSpec.ts).
   */
  house?: HouseSpecView;
}

/**
 * Ukuran satu cakupan dalam proyek mixed-discipline. SEMUA field
 * opsional: hanya ukuran yang TERATRIBUSI ke scope itu yang diisi
 * (atribusi = penyebutan angka terdekat dengan kata kunci scope itu
 * di teks, lihat extractScopeSpecs). Field yang absen berarti "tidak
 * disebut untuk scope ini" — BUKAN nol, dan specForScope jatuh ke
 * ukuran proyek (global) untuk field itu.
 */
export interface ScopeSpec {
  lengthM?: number;
  areaM2?: number;
  spanM?: number;
  widthM?: number;
  heightM?: number;
  depthM?: number;
  thicknessCm?: number;
  volumeM3?: number;
  count?: number;
  /** Daya listrik terpasang teratribusi ke scope ini (kVA) — Batch 2. */
  powerKva?: number;
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

/**
 * Fallback luas kerja dari penyebutan hektar/are ("1 hektar" →
 * 10.000 m², "2,5 hektar" → 25.000 m², "1 are" → 100 m²).
 *
 * Worker D 2026-11-26 (AI & Workflow Completion Sprint §3D): parser
 * luas jalur needs/understanding tidak mengenal satuan besar, sehingga
 * areaM2 untuk "landscape 1 hektar" selalu null dan draft jatuh ke
 * needs-spec — padahal intake (projectIntake.parseAreaUnitM2) sudah
 * membaca hektar sejak lama. Hanya dipakai bila TIDAK ADA luas kerja
 * dari jalur needs/understanding (fallback terakhir, bukan override).
 * Penyebutan yang dibatalkan koreksi ("bukan 1 hektar") dan penyebutan
 * LUAS LAHAN ("luas lahan 1 hektar" — bukan luas kerja) dilewati;
 * penyebutan terakhir yang hidup menang (semantik koreksi).
 */
function hectareAreaFallback(rawText: string): number | null {
  const lower = rawText.toLowerCase();
  const cancelled = new Set(cancelledAreaValues(rawText));
  const hits = findAreaMentions(rawText).filter((h) => {
    if (cancelled.has(h.valueM2)) return false;
    // Hanya satuan hektar/are — penyebutan m² sudah dibaca jalur
    // needs/understanding; fallback ini menutup celah satuan besar saja.
    const unit = h.original.split(' ').pop() ?? '';
    if (!/^(hektar|hektare|ha|are)$/.test(unit)) return false;
    // Penyebutan LUAS LAHAN ("luas lahan 1 hektar") BUKAN luas kerja
    // — penjaga yang sama dengan loop atribusi extractScopeSpecs.
    const before = lower.slice(Math.max(0, h.pos - 32), h.pos);
    if (/(luas\s+)?(lahan|tanah)(nya)?\s*(seluas\s*)?$/.test(before)) return false;
    return true;
  });
  if (hits.length === 0) return null;
  return hits[hits.length - 1].valueM2;
}

/** Ekstrak spesifikasi terukur dari teks (deterministik, tanpa AI).
 *
 * @param opts.classification — klasifikasi intake yang SUDAH dihitung
 * pemanggil (jalur intake via extractUniversalContext). Bila tidak
 * diberikan, dihitung di sini dengan classifyUniversal yang SAMA —
 * intake dan engine tidak bisa berbeda klasifikasi (W2/W10 §2).
 */
export function extractUniversalSpec(rawText: string, opts?: { classification?: Classification }): UniversalSpec {
  const text = (rawText || '').trim();
  const lower = text.toLowerCase();
  const needs = extractRabNeeds(stripLandPhrases(text));
  const scopes = detectScopes(text);
  const understanding = understandProject(text);
  // Klasifikasi intake (W2/W10 §2): SATU fungsi classifyUniversal
  // untuk intake dan engine — pemanggil yang sudah mengklasifikasi
  // meneruskan hasilnya, yang lain menghitung di sini.
  const classification = opts?.classification ?? classifyUniversal(text);

  // Anggaran = kemunculan TERAKHIR (koreksi pengguna menggantikan
  // nilai lama — dulu first-match sehingga revisi "anggaran 300 jt …
  // anggaran 250 jt" tetap memakai cap basi 300 jt; audit Fase 1 §7).
  // Parser KANONIS (rabNeeds.parseBudgetMentions — S1-R2/F11): satu
  // parser untuk keempat situs; "budget menjadi 250 juta" kini
  // tertangkap (dulu diakui sebagai batasan di komentar ini) dan
  // celah "uang muka Rp 50 juta" ditutup. Guard "uang" (uang
  // muka/jalan/saku ditolak, `\b` cegah "ruang") milik parser itu.
  const budgetMentions = parseBudgetMentions(text);
  const budgetCap = budgetMentions.length > 0
    ? budgetMentions[budgetMentions.length - 1].amount
    : null;

  // Ukuran universal bersama (rabNeeds.extractUniversalMeasures —
  // S1-R3): pola yang SAMA dipakai jalur rumah (rabIntentSpec), jadi
  // kedua model spek membaca angka yang sama dari teks yang sama.
  const measures = extractUniversalMeasures(text);

  const materialKeywords = MATERIAL_WORDS.filter((w) => lower.includes(w));
  const extraKeywords = ['drainase', 'pagar', 'trotoar', 'kanstin', 'marka', 'pju', 'lampu']
    .filter((w) => lower.includes(w));

  // View rumah (W2/W10 §2, S1-R3): field rumah dari teks yang sama
  // (kamar, kualitas, pengecualian, …) agar jalur universal dapat
  // MEMBACANYA tanpa kehilangan data. Hanya dipasang bila ≥1 field
  // rumah terisi.
  const house = houseViewFromSpec(extractRabIntentSpec(text));
  // Batch 2 (§5.3): penyebutan daya listrik terpasang (kVA).
  const powerMentions = findPowerMentions(text);

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
    // Worker D 2026-11-26: fallback hektar/are terakhir
    // (hectareAreaFallback — "1 hektar" → 10.000 m²).
    areaM2: needs.buildingArea ?? needs.footprintM2 ?? understanding.footprint.value ?? hectareAreaFallback(text),
    lengthM: needs.lengthM,
    widthM: measures.widthM,
    spanM: measures.spanM,
    heightM: measures.heightM,
    depthM: measures.depthM,
    thicknessCm: measures.thicknessCm,
    volumeM3: measures.volumeM3,
    // Basis ukuran JUMLAH (audit ekstrem 2026-11-08, KELUARGA CACAT A)
    // — lihat extractUniversalMeasures (rabNeeds).
    count: measures.count,
    // Batch 2 (§5.3): daya listrik terpasang (kVA) — basis kuantitas
    // listrik; kemunculan TERAKHIR menang (koreksi menggantikan).
    // Field HANYA dipasang bila ada penyebutan daya — spek tanpa daya
    // tetap byte-identik dengan sebelum Batch 2 (golden 5B-06).
    ...(powerMentions.length > 0
      ? { powerKva: powerMentions[powerMentions.length - 1].valueKva }
      : {}),
    budgetCap,
    location: needs.location,
    materialKeywords,
    extraKeywords,
    isRenovation: /\b(renovasi|rehab|rehabilitasi|perbaikan|restorasi)\b/.test(lower),
    isDemolition: /\b(demolisi|pembongkaran|bongkar)\b/.test(lower),
    // Spek per-scope (§10) + klasifikasi intake (§2) + view rumah (§2).
    scopeSpecs: extractScopeSpecs(text, scopes),
    classification: {
      primaryId: classification.primary?.id ?? null,
      secondaryIds: classification.secondary.map((d) => d.id),
      isMulti: classification.isMulti,
    },
    ...(house ? { house } : {}),
  };
}

/**
 * Atribusi ukuran per-scope (W2/W10 §10, S1-R4): tiap penyebutan angka
 * diatribusikan ke cakupan yang kata kuncinya TERDEKAT (kata kunci
 * sebelumnya dalam 80 karakter didahulukan, lalu kata kunci sesudahnya
 * dalam 40 karakter). Memakai parser berposisi yang sudah ada
 * (findLinearMentions / parseAnchoredLinear / findAreaMentions /
 * findVolumeMentions / parseCountMentions).
 *
 * Aturan penjaga (agar atribusi tidak MENCURI angka yang bukan milik
 * scope itu — semuanya dipin di universalClassification.test.ts):
 * - Nilai yang dibatalkan koreksi "bukan X" tidak diatribusikan.
 * - Sisi dimensi "A x B m" BUKAN panjang linear (konsisten dengan
 *   guard hasDims di parseLinearLength) — dilewati.
 * - Panjang linear hanya diatribusikan ke scope yang ukuran utamanya
 *   berbasis panjang (length / areaOrLength / span / any) — "gudang
 *   10 x 20 m" tidak boleh memberi gedung lengthM dari sisi dimensi.
 * - Penyebutan pertama yang hidup menang per (scope, ukuran)
 *   (first-wins) — KECUALI penyebutan bertanda revisi ("revisi …
 *   jadi/hanya X"), yang menimpa (lihat setRev). Last-wins MURNI
 *   ditolak 2026-11-26 (D1): penyebutan linear telanjang mencakup
 *   juga angka lebar/tinggi ("jalan 1 km lebar 6 m" → lengthM 6,
 *   "retaining wall 100 m tinggi 3 m" → lengthM 3) sehingga
 *   last-wins merusak total pin jalan/pagar/retaining wall;
 *   koreksi ditangani penyaringan "bukan X" + override revisi,
 *   bukan last-wins.
 * - Scope tanpa atribusi memakai ukuran proyek (global) lewat
 *   specForScope — perilaku lama dipertahankan.
 */
export function extractScopeSpecs(rawText: string, scopes: ScopeGroup[]): Record<string, ScopeSpec> {
  const out: Record<string, ScopeSpec> = {};
  if (scopes.length === 0) return out;
  const lower = (rawText || '').toLowerCase();
  // Kemunculan kata kunci scope (tanpa negasi — semantik detectScopes).
  // `kw` dibawa agar atribusi panjang telanjang bisa membedakan
  // kata-kunci kedalaman (DEPTH_KEYWORDS) dari kata-kunci biasa.
  interface KwOcc { scopeId: UniversalScopeId; pos: number; end: number; kw: string }
  const occs: KwOcc[] = [];
  for (const scope of scopes) {
    for (const kw of scope.keywords) {
      let idx = lower.indexOf(kw);
      while (idx >= 0) {
        // Batch 2 (§5.3): pengecualian frasa yang sama dengan
        // detectScopes — "saluran" di dalam "saluran irigasi" bukan
        // kemunculan drainase, jadi angka irigasi tidak teratribusi
        // ke drainase.
        if (!isNegatedAt(lower, idx) && !isExcludedKeywordOccurrence(scope.id, kw, lower.slice(idx + kw.length))) occs.push({ scopeId: scope.id, pos: idx, end: idx + kw.length, kw });
        idx = lower.indexOf(kw, idx + 1);
      }
    }
  }
  if (occs.length === 0) return out;
  const scopeById = new Map(scopes.map((s) => [s.id, s]));
  const LENGTH_MEASURES: Array<ScopeGroup['primaryMeasure']> = ['length', 'areaOrLength', 'span', 'any'];
  /** Kemunculan kata kunci terdekat untuk satu posisi penyebutan
   *  (null = tidak teratribusi). Mengembalikan kemunculannya (bukan
   *  hanya scopeId) agar pemanggil tahu kata kunci mana yang cocok —
   *  dipakai atribusi kedalaman (DEPTH_KEYWORDS). */
  const attribute = (pos: number, lengthOnly: boolean): KwOcc | null => {
    const pool = lengthOnly
      ? occs.filter((o) => LENGTH_MEASURES.includes(scopeById.get(o.scopeId)?.primaryMeasure ?? 'any'))
      : occs;
    let best: KwOcc | null = null;
    let bestDist = Infinity;
    for (const o of pool) {
      if (o.end <= pos) {
        const d = pos - o.end;
        if (d <= 80 && d < bestDist) { best = o; bestDist = d; }
      }
    }
    if (best) return best;
    for (const o of pool) {
      if (o.pos >= pos) {
        const d = o.pos - pos;
        if (d <= 40 && d < bestDist) { best = o; bestDist = d; }
      }
    }
    return best;
  };
  /** Isi (scope, ukuran) — hanya bila belum terisi (first-wins).
   *  D1 2026-11-26: last-wins MURNI ditolak — penyebutan linear
   *  telanjang mencakup angka lebar/tinggi, jadi last-wins akan
   *  menimpa lengthM dengan angka tinggi/lebar (lihat setRev). */
  const set = (scopeId: string, key: keyof ScopeSpec, value: number): void => {
    const cur = out[scopeId] ?? {};
    if (cur[key] == null) cur[key] = value;
    out[scopeId] = cur;
  };
  /** Penanda revisi dalam ±48 karakter sebelum penyebutan
   *  ("revisi … hanya 895 m2", "ubah … jadi 150 m2"). */
  const REVISION_MARK_RE = /\b(revisi|ubah|koreksi|ternyata|menjadi|jadi|hanya)\b/;
  const isRevisionMention = (pos: number): boolean =>
    REVISION_MARK_RE.test(lower.slice(Math.max(0, pos - 48), pos));
  /** Atribusi dengan override revisi (D1 2026-11-26, lapisan bersama —
   *  Opsi B): penyebutan TANPA tanda revisi memakai first-wins biasa;
   *  penyebutan BERTANDA revisi MENIMPA nilai scope teratribusi.
   *  Bila scope teratribusi BELUM memegang ukuran itu sementara scope
   *  lain SUDAH memegangnya, revisi dialihkan ke pemegang terdekat:
   *  ia mengoreksi ukuran yang sudah ada, bukan ukuran baru scope
   *  tersebut. Contoh hidup: "… lahan perlu dibongkar … revisi
   *  ternyata untuk luas hanya 895 m2" — 895 teratribusi ke `demolisi`
   *  (kata kunci terdekat) padahal ia mengoreksi luas taman 10.000 m²;
   *  aturan ini mengalihkannya ke pemegang luas terdekat (`lanskap`). */
  const setRev = (scopeId: string, key: keyof ScopeSpec, value: number, pos: number): void => {
    if (!isRevisionMention(pos)) { set(scopeId, key, value); return; }
    if (out[scopeId]?.[key] == null) {
      let best: string | null = null;
      let bestDist = Infinity;
      for (const holder of Object.keys(out)) {
        if (holder === scopeId || out[holder][key] == null) continue;
        for (const o of occs) {
          if (o.scopeId !== holder) continue;
          const d = o.end <= pos ? pos - o.end : o.pos - pos;
          if (d < bestDist) { bestDist = d; best = holder; }
        }
      }
      if (best) { const cur = out[best] ?? {}; cur[key] = value; out[best] = cur; return; }
    }
    const cur = out[scopeId] ?? {};
    cur[key] = value;
    out[scopeId] = cur;
  };
  /** true bila penyebutan linear ini adalah sisi dimensi "A x B m". */
  const isDimensionSide = (pos: number): boolean =>
    /\d+(?:[.,]\d+)?\s*[x×]\s*$/.test(lower.slice(Math.max(0, pos - 24), pos));
  const cancelled = new Set(cancelledLinearValues(rawText));
  for (const h of findLinearMentions(rawText)) {
    if (cancelled.has(h.valueM)) continue;
    if (isDimensionSide(h.pos)) continue;
    const occ = attribute(h.pos, true);
    if (!occ) continue;
    setRev(occ.scopeId, 'lengthM', h.valueM, h.pos);
    // Panjang telanjang pada kata-kunci kedalaman ADALAH kedalaman
    // ("sumur bor 30 m" → depthM 30 untuk mep) — diatribusikan SEBAGAI
    // depthM juga (lengthM tetap diisi: fallback global + gerbang
    // ukuran memakai lengthM; pemetaan param memakai depthM untuk
    // param berkind 'depth' — keduanya konsisten bernilai sama).
    if (DEPTH_KEYWORDS.has(occ.kw)) setRev(occ.scopeId, 'depthM', h.valueM, h.pos);
  }
  // Worker D 2026-11-26: nilai luas yang dibatalkan pola koreksi
  // ("bukan 1 hektar, tapi 8.000 m²") tidak boleh menang — cermin
  // penyaringan cancelledLinearValues pada loop linear di atas.
  const cancelledAreas = new Set(cancelledAreaValues(rawText));
  for (const h of findAreaMentions(rawText)) {
    if (cancelledAreas.has(h.valueM2)) continue;
    // Batch 3 (§6.3): penyebutan LUAS LAHAN ("luas lahan 500 m2",
    // "lahan 500 m2", "tanah seluas 500 m2") BUKAN luas cakupan —
    // mengatribusikannya sebagai areaM2 scope membuat "gudang 10x20
    // + lahan 500 m2" dihitung 500 m² (bukan tapak 200 m²) dan
    // "gudang luas lahan 500 m2" lolos sebagai draft (padahal tidak
    // ada ukuran bangunan). Pola lahan yang sama dengan LAND_AREA_RE
    // kanonis (rabNeeds): "luas lahan/tanah" atau "lahan/tanah"
    // tepat sebelum angka. Konsisten dengan parser lahan kanonis:
    // "pekerjaan tanah 100 m2" juga terbaca sebagai lahan di sana.
    const beforeArea = lower.slice(Math.max(0, h.pos - 32), h.pos);
    if (/(luas\s+)?(lahan|tanah)(nya)?\s*(seluas\s*)?$/.test(beforeArea)) continue;
    const occ = attribute(h.pos, false);
    if (occ) setRev(occ.scopeId, 'areaM2', h.valueM2, h.pos);
  }
  for (const h of findVolumeMentions(rawText)) {
    const occ = attribute(h.pos, false);
    if (occ) setRev(occ.scopeId, 'volumeM3', h.valueM3, h.pos);
  }
  for (const c of parseCountMentions(rawText)) {
    const occ = attribute(c.pos, false);
    if (occ) setRev(occ.scopeId, 'count', c.value, c.pos);
  }
  // Batch 2 (§5.3): daya listrik terpasang (kVA) — diatribusikan ke
  // cakupan terdekat (biasanya mep), seperti penyebutan jumlah.
  for (const p of findPowerMentions(rawText)) {
    const occ = attribute(p.pos, false);
    if (occ) setRev(occ.scopeId, 'powerKva', p.valueKva, p.pos);
  }
  // Ukuran berjangkar: bentang → scope jembatan bila ada (bila tidak,
  // ke scope terdekat); lebar/tinggi/tebal ke scope terdekat.
  // parseAnchoredLinear mengembalikan meter — tebal dikonversi balik
  // ke cm (satuan UniversalSpec.thicknessCm).
  const span = parseAnchoredLinear(rawText, ['bentang', 'span']);
  if (span) {
    if (scopeById.has('jembatan')) set('jembatan', 'spanM', span.valueM);
    else {
      const occ = attribute(span.pos, false);
      if (occ) set(occ.scopeId, 'spanM', span.valueM);
    }
  }
  const width = parseAnchoredLinear(rawText, ['lebar']);
  if (width) {
    const occ = attribute(width.pos, false);
    if (occ) set(occ.scopeId, 'widthM', width.valueM);
  }
  const height = parseAnchoredLinear(rawText, ['tinggi']);
  if (height) {
    const occ = attribute(height.pos, false);
    if (occ) set(occ.scopeId, 'heightM', height.valueM);
  }
  const thick = parseAnchoredLinear(rawText, ['tebal']);
  if (thick) {
    const occ = attribute(thick.pos, false);
    if (occ) set(occ.scopeId, 'thicknessCm', Math.round(thick.valueM * 100 * 1000) / 1000);
  }
  // Kedalaman berjangkar ("kedalaman 30 m", "dalam 30 m") — jangkar
  // SAMA dengan dimsFromRawText (actionRegistry) agar kedua jalur
  // membaca angka yang sama.
  const depth = parseAnchoredLinear(rawText, ['kedalaman', 'kedalaman saluran', 'dalam']);
  if (depth) {
    // Batch 3 (§6.3): "dalam X m dari ..." adalah JARAK, bukan
    // kedalaman ("gedung dalam 30 m dari jalan" = 30 m DARI jalan) —
    // cermin pengecualian yang sama di extractUniversalMeasures
    // (rabNeeds). Tanpa ini jarak disalahbaca sebagai kedalaman scope.
    const depthWindow = lower.slice(depth.pos, depth.pos + 48);
    const isDistance = /^dalam\s+(?:sekitar\s+)?\d+(?:[.,]\d+)?\s*(?:meter|m)\b\s*dari\b/.test(depthWindow);
    if (!isDistance) {
      const occ = attribute(depth.pos, false);
      if (occ) set(occ.scopeId, 'depthM', depth.valueM);
    }
  }
  return out;
}

/**
 * Kata kunci cakupan yang membuat panjang TELANJANG menjadi kedalaman
 * ("sumur bor 30 m" → depthM 30). Daftar ini SENGAJA minimal: hanya
 * kata kunci yang template-nya TERBUKTI berparameter kedalaman.
 * Batch 3 (§6.3) — perluasan TERVERIFIKASI terhadap katalog hidup:
 * - 'bore pile'/'bored pile' → FND-BORED-PILE, pile_depth 6–45 m;
 * - 'tiang pancang' → FND-DRIVEN-PILE, pile_depth 8–45 m;
 * - 'sumuran' → FND-SUMURAN-CAISSON, well_depth 3–9 m.
 * TIDAK ditambahkan (perlu verifikasi template per kata kunci):
 * 'strauss' (tidak ada template Strauss berparameter kedalaman —
 * FND-MINI-PILE adalah tiang segitiga), 'sumur resapan' (tidak ada
 * template berparameter kedalaman), 'galian' ("galian 100 m" adalah
 * PANJANG galian, bukan kedalaman — excavation_depth maks 10 m).
 */
const DEPTH_KEYWORDS: ReadonlySet<string> = new Set(['sumur bor', 'bore pile', 'bored pile', 'tiang pancang', 'sumuran']);

/**
 * Spek yang dipakai membangun SATU part cakupan (W2/W10 §10): klon
 * spek proyek dengan ukuran per-scope (scopeSpecs) menimpa ukuran
 * global HANYA untuk field yang teratribusi ke scope itu. Tanpa
 * atribusi, objek yang sama dikembalikan apa adanya (perilaku lama).
 *
 * BATASAN YANG DIKETAHUI (bukan bug yang disembunyikan): scope tanpa
 * atribusi MASIH memakai ukuran global — "jalan 2 km + drainase"
 * (drainase tanpa panjang) membangun part drainase dari panjang jalan
 * 2 km, sama seperti sebelum W2/W10. Mengubahnya menjadi gerbang
 * ketat per-scope (drainase tanpa panjang → needs-spec) adalah
 * perubahan perilaku yang butuh keputusan owner, bukan bagian dari
 * pekerjaan ini. Yang dijamin di sini: scope YANG menyebut ukurannya
 * sendiri memakai ukurannya sendiri.
 *
 * CATATAN multi-gedung: part 'gedung' per gedung TIDAK memakai
 * fungsi ini — specForBuilding (multiBuildingRab) yang otoritatif
 * untuk spek per gedung; scopeSpecs hanya berlaku di tingkat proyek.
 */
export function specForScope(spec: UniversalSpec, scopeId: string): UniversalSpec {
  const scoped = spec.scopeSpecs?.[scopeId];
  if (!scoped) return spec;
  return {
    ...spec,
    lengthM: scoped.lengthM ?? spec.lengthM,
    areaM2: scoped.areaM2 ?? spec.areaM2,
    spanM: scoped.spanM ?? spec.spanM,
    widthM: scoped.widthM ?? spec.widthM,
    heightM: scoped.heightM ?? spec.heightM,
    depthM: scoped.depthM ?? spec.depthM,
    thicknessCm: scoped.thicknessCm ?? spec.thicknessCm,
    volumeM3: scoped.volumeM3 ?? spec.volumeM3,
    count: scoped.count ?? spec.count,
    powerKva: scoped.powerKva ?? spec.powerKva,
  };
}

/**
 * Baca satu RabIntentSpec sebagai UniversalSpec (view universal —
 * W2/W10 §2, S1-R3; pasangan universalSpecToRabIntent di
 * rabIntentSpec.ts). Ekstraksi universal dijalankan dari rawText yang
 * sama (satu sumber angka), lalu field rumah menimpa/melengkapi:
 * luas/lantai/anggaran/lokasi/dimensi dari spek rumah menang bila
 * terisi (aturan "luas telanjang = bangunan" milik jalur rumah),
 * ukuran universal dari sub-model `universal` menang bila terisi, dan
 * field rumah dibawa sebagai sub-model `house`. Round-trip dipin di
 * universalClassification.test.ts.
 */
export function rabIntentSpecToUniversal(rab: RabIntentSpec): UniversalSpec {
  const spec = extractUniversalSpec(rab.rawText);
  const house = houseViewFromSpec(rab);
  return {
    ...spec,
    areaM2: rab.buildingAreaM2 ?? spec.areaM2,
    landAreaM2: rab.landAreaM2 ?? spec.landAreaM2,
    floors: rab.floors ?? spec.floors,
    floorsExplicit: rab.floors != null ? true : spec.floorsExplicit,
    buildingWidthM: rab.dimensionsM?.widthM ?? spec.buildingWidthM,
    buildingLengthM: rab.dimensionsM?.lengthM ?? spec.buildingLengthM,
    budgetCap: rab.budgetIdr ?? spec.budgetCap,
    location: rab.location ?? spec.location,
    spanM: rab.universal?.spanM ?? spec.spanM,
    widthM: rab.universal?.widthM ?? spec.widthM,
    heightM: rab.universal?.heightM ?? spec.heightM,
    depthM: rab.universal?.depthM ?? spec.depthM,
    thicknessCm: rab.universal?.thicknessCm ?? spec.thicknessCm,
    volumeM3: rab.universal?.volumeM3 ?? spec.volumeM3,
    count: rab.universal?.count ?? spec.count,
    ...(house ? { house } : {}),
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
    // Kedalaman adalah basis ukuran yang sah untuk cakupan
    // areaOrLength (sumur bor: kedalaman ADALAH ukuran utamanya —
    // "sumur bor kedalaman 30 m" tanpa panjang telanjang tetap bisa
    // dihitung). Sengaja TIDAK untuk 'length' (pengerukan/saluran
    // butuh panjang/luas untuk volume — kedalaman saja tidak cukup)
    // maupun 'any' (galian butuh luas/volume).
    case 'areaOrLength': return spec.areaM2 != null || spec.lengthM != null || spec.depthM != null
      || (scope.id === 'sanitasi' && (spec.count != null || spec.volumeM3 != null))
      // Batch 2 (§5.3): template MEP berparameter lantai/jumlah/daya
      // (num_floors, num_points, installed_kva) — lantai ("plumbing
      // gedung 3 lantai"), jumlah ("jaringan data 220 titik"), dan
      // daya ("instalasi listrik 11 kVA") adalah basis ukuran MEP
      // yang sah. Pola yang sama dengan basis count sanitasi/gedung:
      // diterima hanya untuk cakupan mep, bukan global.
      || (scope.id === 'mep' && (spec.floors != null || spec.count != null || spec.powerKva != null));
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
  /** Kunci parameter yang nilainya di luar batas (untuk aturan per-unit Batch 1). */
  outOfRangeKeys: string[];
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

/** Jenis ukuran yang relevan untuk primaryMeasure satu cakupan.
 * Kedalaman adalah dimensi LINEAR — relevan di mana pun panjang
 * relevan (template berparam depth menerima basis linear pengguna;
 * nilai yang dipetakan tetap dari depthM, bukan lengthM — lihat
 * classifyParam). */
export function relevantParamKinds(primaryMeasure: ScopeGroup['primaryMeasure']): ParamKind[] {
  switch (primaryMeasure) {
    case 'length': return ['length', 'depth'];
    case 'span': return ['span'];
    case 'area': return ['area'];
    case 'areaOrLength': return ['area', 'length', 'depth'];
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
export type ParamKind = 'length' | 'span' | 'width' | 'area' | 'thickness' | 'floors' | 'height' | 'depth' | 'volume' | 'count' | 'power' | 'other';

export function classifyParam(key: string, label: string): ParamKind {
  const s = `${key} ${label}`.toLowerCase();
  if (/span|bentang/.test(s)) return 'span';
  // Kedalaman adalah JENIS SENDIRI, bukan 'length': mapSpecToParams
  // memetakan SATU nilai spek ke SEMUA param sejenis — bila depth
  // digabung ke 'length', "saluran 400 m" akan mengisi channel_depth
  // = 400 (batas maks 2,5 m) bersama channel_length = 400. Depth
  // hanya terisi dari depthM ("kedalaman X m" / panjang telanjang
  // pada kata-kunci kedalaman) — tanpa itu memakai default template.
  if (/depth|kedalaman/.test(s)) return 'depth';
  if (/length|panjang|lintasan/.test(s)) return 'length';
  if (/width|lebar/.test(s)) return 'width';
  if (/\barea\b|luas/.test(s)) return 'area';
  if (/thickness|tebal/.test(s)) return 'thickness';
  if (/floor|lantai/.test(s)) return 'floors';
  if (/height|tinggi/.test(s)) return 'height';
  if (/volume/.test(s)) return 'volume';
  // Batch 2 (§5.3): daya listrik adalah JENIS SENDIRI (installed_kva)
  // — ditempatkan SEBELUM 'count' karena label "Daya terpasang (kVA)"
  // tidak mengandung kata jumlah, tetapi urutan ini menjaga pemetaan
  // tetap tegas bila suatu label memuat keduanya.
  if (/kva/.test(s)) return 'power';
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
    case 'depth': return spec.depthM;
    case 'volume': return spec.volumeM3;
    case 'count': return spec.count;
    case 'power': return spec.powerKva ?? null;
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
    // Batch 3 (§6.3) — cacat mapper pra-ada (dicatat B1 §9.7):
    // parameter LUAS PER-UNIT (unit_area/room_area/villa_area — luas
    // per unit/kamar, BUKAN luas total) TIDAK PERNAH diisi dari luas
    // total pengguna: "perumahan 20 unit, luas total 720 m²" akan
    // menghitung 20 × 720 m² bila dipetakan (korupsi yang sama dengan
    // kasus sekolah B1 §5: 1.440 m² lantai kelas untuk gedung 240 m²).
    // D2 Batch 1 hanya MENOLAK bila di luar batas; di sini mappernya
    // sendiri diperbaiki — parameter per-unit memakai default template
    // dan dicatat eksplisit (luas total bukan luas per unit).
    if (kind === 'area' && isPerUnitAreaParam(p.key, p.label)) {
      if (p.defaultValue !== undefined) {
        params[p.key] = p.defaultValue;
        defaulted.push(`${p.label} memakai default template (${p.defaultValue}${p.unit ? ` ${p.unit}` : ''}) — luas total yang Anda sebut bukan luas per unit`);
      }
      continue;
    }
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
  return { template, score, reasons, outOfRange: outOfRange.map((o) => o.detail), outOfRangeKinds: outOfRange.map((o) => o.kind), outOfRangeKeys: outOfRange.map((o) => o.key), nameMatches };
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
  /**
   * Batch 1 (§4) — kandidat yang LOLOS evaluator kesesuaian, terurut
   * (alternatif yang sah untuk pesan/asumsi). `ranked` tetap daftar
   * skor penuh (dipakai pick deterministik + tes); `suitable` adalah
   * kompetisi yang bermakna — margin/closeCall dihitung dari sini.
   */
  suitable: TemplatePick[];
  /** Batch 1 (§4) — keputusan kesesuaian terstruktur (audit). */
  suitability: SuitabilityDecision;
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
 *
 * Batch 1 (§4) — evaluator kesesuaian (templateSuitability.ts) menyaring
 * kandidat yang dinilai di atas dengan constraint keras (fungsi, tipe
 * konstruksi, material, cakupan MEP, dimensi relevan, semantik per-unit,
 * representasi jumlah). Skor TIDAK PERNAH mengalahkan constraint keras:
 * kandidat skor tertinggi yang melanggar constraint keras tidak dipakai,
 * betapa pun tinggi skornya. Demosi di atas TIDAK mengecualikan kandidat
 * dari evaluasi (demosi adalah heuristik rentang sekunder; bila evaluator
 * memilih template yang didemosi, pilihan evaluator yang menang dan
 * catatan demosi ditekan di buildDraftPart agar pesan tidak berbohong).
 * Margin/closeCall dihitung atas kandidat yang LOLOS (kompetisi yang
 * bermakna), bukan atas kandidat yang sudah ditolak.
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
  // Batch 1 (§4): evaluator kesesuaian memutuskan kandidat mana yang
  // BOLEH dipilih (constraint keras) + alternatif yang sah.
  const decision = evaluateTemplateSuitability(spec, scope, candidates, { relevantKinds: relevant });
  const byId = new Map(candidates.map((c) => [c.template.id, c]));
  // TemplatePick untuk kandidat lintas-pool (tidak ada di `candidates`):
  // disintesis dari template katalog + detail batas kanonis.
  const suitable: TemplatePick[] = [];
  for (const cand of decision.candidates) {
    const existing = byId.get(cand.templateId);
    if (existing) {
      suitable.push(existing);
      continue;
    }
    const tpl = RabTemplateService.getInstance().getTemplateById(cand.templateId);
    if (!tpl) continue;
    const oor = paramOutOfRangeDetails(spec, tpl);
    suitable.push({
      template: tpl,
      score: cand.score,
      reasons: [`kesesuaian lintas-pool (skor evaluator ${cand.score})`, ...cand.softNotes],
      outOfRange: oor.map((o) => o.detail),
      outOfRangeKinds: oor.map((o) => o.kind),
      outOfRangeKeys: oor.map((o) => o.key),
      nameMatches: [],
    });
  }
  // Ambang skor lama (≥ 8) tetap berlaku untuk kandidat dalam pool;
  // kandidat lintas-pool memakai skor evaluator (skala berbeda) dan
  // tidak dikenai ambang 8.
  let pick: TemplatePick | null = null;
  if (decision.selectedTemplateId) {
    const chosen = suitable.find((s) => s.template.id === decision.selectedTemplateId) ?? null;
    if (chosen) {
      const inPool = byId.has(chosen.template.id);
      pick = !inPool || chosen.score >= 8 ? chosen : null;
    }
  }
  const others = suitable.filter((c) => c !== pick);
  const margin = pick ? pick.score - (others[0]?.score ?? pick.score) : 0;
  return {
    pick,
    ranked: candidates,
    scoreMargin: pick ? margin : 0,
    closeCall: !!pick && suitable.length >= 2 && margin <= 3,
    demoted,
    suitable,
    suitability: decision,
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
  /**
   * P3D (FULL REPAIR 2026-11-13) — artefak WBS eksplisit (node paket
   * pekerjaan ber-ID stabil `wbs:<scopeId>`, dibangun dari spek +
   * template via `buildWbsForDraft`) + laporan kelengkapan WBS/spek
   * (via `validateWbsCompleteness`). LAPISAN VALIDASI — tidak
   * mengubah total/isi RAB; data JSON polos.
   *
   * P6 (menutup P3D-O1): kedua field ini DIPASANG OTOMATIS oleh
   * `buildUniversalDraft` (via `rebuildWbsAttachment`) dan DIBAWA
   * `draftPersistence` (record + fingerprint artefak, pola `dedQto`)
   * — draft in-memory vs seed v1 tetap byte-identik (invariansi
   * revisi P4-(d) hijau). Revisi membangun ulang keduanya pada
   * kandidat dengan `previousArtifact` artefak lama (P3D-O2,
   * `draftRevision.makePreview`), sehingga pengecualian/catatan
   * user pada node WBS bertahan lintas revisi. Pemanggil yang
   * mengubah parts di luar jalur-jalur itu wajib memanggil
   * `rebuildWbsAttachment` agar artefak + laporan tidak basi.
   */
  wbsArtifact?: WbsArtifact;
  wbsCompleteness?: WbsCompletenessReport;
  /** D5 (2026-11-26, perintah owner): penanda persisten bahwa draft
   *  ini SUDAH ditanyai balik soal budget OVER dan belum dijawab.
   *  Disetel `overBudgetAskBack` (actionRegistry) bersama slot
   *  percakapan in-memory; dibersihkan saat jawaban diterima. Bertahan
   *  di klon/persistensi draft (boolean polos) sehingga reload TIDAK
   *  membuat draft diam-diam bisa ditransfer — `validateTransfer` /
   *  `buildPushPayload` memeriksa penanda ini + verdict OVER terkini
   *  (revisi ke UNDER membebaskannya walau penanda masih menempel). */
  budgetDecisionPending?: boolean;
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
  /**
   * Batch 2 (§5.2/§5.4) — model cakupan proyek: satu ProjectScope per
   * part + per cakupan yang diminta tetapi belum tergambar, cakupan
   * yang dikecualikan sebagai konteks, dan laporan validasi integritas
   * cakupan (kebocoran disiplin L1–L7). LAPISAN VALIDASI — tidak
   * mengubah total/isi RAB; data JSON polos. DIPASANG OTOMATIS oleh
   * `buildUniversalDraft` dan DISEGARKAN `snapshotVersion` (satu
   * choke point semua jalur revisi). DIBAWA `draftPersistence`
   * (record + restore, pola `wbsArtifact` P6) — draft in-memory vs
   * seed v1 tetap byte-identik (invariansi revisi 5C-01/5C-10).
   * Record lama tanpa field ini tetap terbaca; model dibangun ulang
   * pada revisi berikutnya via snapshotVersion.
   */
  scopeModel?: DraftScopeModel;
  /**
   * Batch 2 (§5.3) — id template yang dipaksa pengguna (bila
   * buildUniversalDraft dipanggil dengan forcedTemplateId). Validator
   * cakupan membebaskan part ini dari aturan L1 (pilihan eksplisit
   * pengguna = persetujuan ekspansi cakupan).
   */
  forcedTemplateId?: string;
}

export type DraftItem = RabItem & {
  __partScope: string;
  __partTemplate: string;
  /** GATE 2 (5B) — seksi asal item (pola penanda yang sama dengan __partScope). */
  __buildingId?: string | null;
  __sectionKind?: 'building' | 'shared-works' | 'project';
  /**
   * P3D — penelusuran spek → item (HANYA diisi `traceDraftItems`;
   * `effectiveItems` TIDAK menghitungnya agar panggilan panas tidak
   * membayar biaya penelusuran): kunci spek sumber, status spek
   * terburuknya, dan ID node WBS pemilik item ini.
   */
  __specKeys?: string[];
  __specStatus?: SpecStatus | null;
  __wbsNodeId?: string;
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
              // Batch 4 (§7.1): harga manual adalah keadaan harga
              // tersendiri — kind-nya USER_MANUAL, BUKAN kind template
              // yang tersisa dari spread (mis. MARKET_REFERENCE atau
              // UNRESOLVED sesudah harga dikosongkan). Tanpa ini item
              // manual masuk payload/factory/ekspor dengan kind yang
              // salah (status sudah benar PRICE_MANUAL).
              priceSourceKind: 'USER_MANUAL' as const,
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
 * P3D — item efektif + penelusuran spek → item (`__specKeys`,
 * `__specStatus`, `__wbsNodeId` diisi dari `traceItemSpecs`).
 * Dipisah dari `effectiveItems` agar panggilan panas (total, pesan,
 * transfer) tidak membayar biaya penelusuran. Tanpa spek terstruktur,
 * semua item bertraceSource 'TEMPLATE' (specKeys kosong — jujur,
 * bukan dikarang). Mengembalikan array BARU (item efektif tidak
 * diubah).
 */
export function traceDraftItems(draft: UniversalDraft): DraftItem[] {
  const items = effectiveItems(draft);
  const traces = new Map(
    traceItemSpecs(draft, draft.structuredSpecs ?? []).map((t) => [t.itemId, t]),
  );
  return items.map((it) => {
    const t = traces.get(it.id);
    if (!t) return it;
    return { ...it, __specKeys: t.specKeys, __specStatus: t.specStatus, __wbsNodeId: t.wbsNodeId };
  });
}

/** P3D — baris penelusuran mentah (dipakai tes + calon wiring pratinjau). */
export function draftItemSpecTraces(draft: UniversalDraft): ItemSpecTrace[] {
  return traceItemSpecs(draft, draft.structuredSpecs ?? []);
}

/**
 * P3D — baris pesan kelengkapan WBS/spek untuk pratinjau (lapisan
 * logika). Memakai `draft.wbsCompleteness` bila pemanggil memasangnya
 * secara eksplisit (sejak P6 selalu terpasang oleh
 * `buildUniversalDraft` + dibangun ulang tiap revisi); bila absen
 * (draft lama pra-P6), dihitung on-demand dari draft + spek
 * (deterministik). Dirender panel Review draft (`DraftReviewPanel`).
 */
export function wbsCompletenessLines(draft: UniversalDraft): string[] {
  const report = draft.wbsCompleteness
    ?? validateWbsCompleteness(draft, draft.structuredSpecs ?? [], draft.wbsArtifact ?? null);
  return formatWbsCompletenessLines(report);
}

/**
 * W3/W9 (G2) — baris pesan "Struktur paket (WBS)" untuk pesan draft:
 * satu baris per paket (scope → template → jumlah item + status node
 * artefak bila ada), node artefak tanpa part (cakupan disebut spek/
 * konseptual tapi belum dibangun, atau dikecualikan) dinyatakan
 * eksplisit, lalu laporan kelengkapan (`wbsCompletenessLines`).
 * Seksi TETAP — dirender untuk semua draft, bukan hanya draft
 * berspek. Tanpa artefak (draft lama pra-P6), status node tidak
 * diklaim (baris part tampil tanpa status) — kelengkapan tetap
 * dihitung on-demand oleh `wbsCompletenessLines`.
 */
export function wbsStructureLines(draft: UniversalDraft): string[] {
  const lines: string[] = ['**Struktur paket (WBS):**'];
  const artifact = draft.wbsArtifact ?? null;
  const nodeByScope = new Map((artifact?.nodes ?? []).map((n) => [n.scopeId, n]));
  const seenScopes = new Set<string>();
  for (const part of draft.parts) {
    seenScopes.add(part.scope.id);
    const count = part.generation.items.filter(
      (it) => !part.removedKeys.includes(itemKey(it)),
    ).length;
    const node = nodeByScope.get(part.scope.id);
    const status = node ? `: ${node.status}` : '';
    const classified = node && node.classifiedItemIds.length > 0
      ? ` (+${node.classifiedItemIds.length} tercakup dari paket lain)`
      : '';
    lines.push(`• ${part.scope.label}${status} — ${count} item${classified} — "${part.template.name}"`);
  }
  // Node artefak tanpa part — cakupan yang disebut spek/konseptual
  // tapi belum dibangun, atau dikecualikan eksplisit. Dinyatakan
  // (bukan hilang) agar struktur yang tampil lengkap.
  for (const node of artifact?.nodes ?? []) {
    if (seenScopes.has(node.scopeId)) continue;
    const excl = node.exclusion ? ` (dikecualikan: ${node.exclusion.reason})` : '';
    const classified = node.classifiedItemIds.length > 0
      ? ` — ${node.classifiedItemIds.length} item tercakup dari paket lain`
      : '';
    lines.push(`• ${node.label}: ${node.status} — 0 item${classified}${excl}`);
  }
  for (const l of wbsCompletenessLines(draft)) lines.push(l);
  return lines;
}

/**
 * P6 (menutup P3D-O1/O2) — pasang (ulang) artefak WBS + laporan
 * kelengkapan pada draft IN-PLACE (draft yang diteruskan adalah klon
 * milik pemanggil: draft baru di `buildUniversalDraft`, kandidat di
 * `buildRevisionPreview`, salinan kerja di `draftReview`). Artefak
 * dibangun dari parts + spek draft saat ini; `previousArtifact`
 * (artefak versi sebelumnya — bila ada) diteruskan agar pengecualian
 * node + catatan user (`by: 'user'`) bertahan lintas regenerasi
 * (kontrak P3D §8). Laporan dihitung dari artefak segar itu.
 * Deterministik kecuali `checkedAt` laporan (stempel waktu hitung).
 */
export function rebuildWbsAttachment(
  draft: UniversalDraft,
  previousArtifact?: WbsArtifact | null,
): void {
  const specs = draft.structuredSpecs ?? [];
  const artifact = buildWbsForDraft(draft, specs, {
    previousArtifact: previousArtifact ?? draft.wbsArtifact ?? null,
  });
  draft.wbsArtifact = artifact;
  draft.wbsCompleteness = validateWbsCompleteness(draft, specs, artifact);
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
  // W1 (2026-11-24): harga NEGATIF bukan harga valid — tanpanya harga
  // negatif lolos gerbang ini lalu mengurangi total (totalsFromItems),
  // masuk payload transfer sebagai PRICE_RESOLVED, dan memblokir
  // pengisian Full AI (item dianggap sudah berharga). Nol eksplisit
  // tetap valid menurut kontrak sentinel di atas (hanya < 0 ditolak).
  return it.unitPrice != null && Number.isFinite(it.unitPrice) && it.unitPrice >= 0;
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

/**
 * Total dihitung dari item efektif — aritmetika deterministik, bukan LLM.
 *
 * KONTRAK KESETARAAN P3B (B-11, 2026-11-13 — dibuktikan
 * `src/test/p3bCanonicalCalculation.test.ts`, BUKAN disatukan lewat kode):
 * `estimatedTotal` di sini adalah BIAYA LANGSUNG (Σ volume × harga satuan
 * item berharga, dikelompokkan per sumber harga) — kaki yang SAMA PERSIS
 * dengan `directCost` engine kanonis `UnifiedProjectEngine.
 * recalculateCostSummary` pada item yang sama (termasuk: item
 * PRICE_UNRESOLVED dikecualikan di kedua sisi; item HSP tetap masuk biaya
 * langsung di kedua sisi; item legacy tanpa priceStatus resolved di kedua
 * sisi; round-trip draft nyata preview → transfer → engine: selisih Rp0).
 * Tangga O&P/pajak/kontingensi/markup HANYA ada di engine kanonis — JANGAN
 * tambahkan ke fungsi ini tanpa keputusan owner (draft tidak membawa
 * konfigurasi O&P/pajak proyek target; selisih preview vs grand total
 * proyek terkonfigurasi dicatat sebagai temuan terbuka P3B-O2). Fungsi ini
 * juga TIDAK diganti engine: engine tidak menghitung ember sumber harga +
 * status PARSIAL/ESTIMASI/LENGKAP yang menjadi isi pratinjau.
 */
export function computeTotals(draft: UniversalDraft): DraftTotals {
  return totalsFromItems(effectiveItems(draft));
}

/** D5 (2026-11-26, perintah owner) — kontributor biaya terbesar. */
export interface CostContributor {
  description: string;
  amount: number;
  /** Persen dari total estimasi (angka, mis. 40.9 = 40,9%). */
  pct: number;
}

/** D5 — N item termahal dari draft (urut turun), murni + dapat dites. */
export function topCostContributors(draft: UniversalDraft, n = 3): CostContributor[] {
  const totals = computeTotals(draft);
  if (totals.estimatedTotal <= 0) return [];
  return effectiveItems(draft)
    .map((it) => ({ it, amount: pricedAmount(it) }))
    .filter((x): x is { it: DraftItem; amount: number } => x.amount != null && x.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n)
    .map(({ it, amount }) => ({
      description: it.description,
      amount,
      pct: (amount / totals.estimatedTotal) * 100,
    }));
}

/** D5 — satu baris kontributor, format kanonis yang sama dengan pesan draft. */
export function formatCostContributorLine(c: CostContributor): string {
  return `• ${c.description} — ${formatRupiah(c.amount)} (${c.pct.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% dari total estimasi)`;
}

/** D5 — keputusan budget OVER untuk satu draft (murni). null = tidak
 *  perlu tanya balik (UNDER/dalam anggaran, tanpa budget, atau tidak
 *  dapat dinilai). OVER memakai perbandingan ketat (`>`): total ==
 *  anggaran adalah DI BAWAH (bukan OVER). Item belum berharga TIDAK
 *  membatalkan verdict — verdict tetap OVER tapi `provisional: true`
 *  (total SEMENTARA — PARSIAL). */
export interface OverBudgetDecision {
  total: number;
  cap: number;
  /** Selisih total − cap (Rp). */
  over: number;
  /** Anggaran menutup berapa % dari total estimasi. */
  coveragePct: number;
  /** Total = berapa × anggaran. */
  multiple: number;
  contributors: CostContributor[];
  /** true bila ada item belum berharga (total PARSIAL). */
  provisional: boolean;
}

export function overBudgetDecision(draft: UniversalDraft): OverBudgetDecision | null {
  const totals = computeTotals(draft);
  const cap = draft.spec.budgetCap ?? null;
  const verdict = assessBudgetFeasibility({
    totalPriced: totals.estimatedTotal,
    unpricedCount: totals.unpricedCount,
    budgetCap: cap,
  });
  if (verdict.verdict !== 'OVER' || cap == null) return null;
  return {
    total: totals.estimatedTotal,
    cap,
    over: totals.estimatedTotal - cap,
    coveragePct: (cap / totals.estimatedTotal) * 100,
    multiple: totals.estimatedTotal / cap,
    contributors: topCostContributors(draft, 3),
    provisional: totals.unpricedCount > 0,
  };
}

/**
 * D5-lanjutan (2026-11-28, perintah owner): draf yang dibatasi budget
 * MAKSIMUM — tahap/fase yang benar-benar muat di anggaran, sisanya
 * dinyatakan belum teranggarkan (bukan dipotong diam-diam).
 *
 * ATURAN PEMILIHAN (deterministik, satu kalimat): paket struktural
 * (persiapan, galian, pondasi, struktur) didahulukan sesuai urutan
 * paket draft, lalu item diambil berurutan selama total berharga
 * tetap ≤ cap — item tidak pernah dipotong sebagian dan harga tidak
 * pernah diturunkan.
 *
 * Detail aturan:
 * - Urutan paket: draft sendiri TIDAK selalu mengurutkan struktur
 *   lebih dulu (kasus villa owner: part "Finishing & Interior" datang
 *   sebelum "Gedung & Bangunan"), jadi paket diberi peringkat
 *   struktural lewat kata kunci pada label scope / nama template /
 *   uraian itemnya (batas kata `\b` agar "Substruktur" tidak
 *   terhitung "struktur"); paket peringkat 0 dulu, lalu peringkat 1,
 *   masing-masing tetap dalam urutan aslinya (stable sort).
 * - Rakus berawalan (prefix-greedy) atas item BERHARGA dalam urutan
 *   itu: item ditambahkan hanya bila total berjalan + jumlahnya
 *   tetap ≤ cap; begitu satu item berharga akan melampaui cap,
 *   pemilihan BERHENTI — item murah sesudahnya TIDAK dilompati
 *   (tidak ada skip-and-continue), karena tahap yang terpotong di
 *   tengah bukan tahap yang utuh.
 * - Item BELUM BERHARGA tidak pernah masuk total mana pun (harganya
 *   tetap null, tampil "Harga belum tersedia"). Item belum berharga
 *   hanya ikut bila paketnya SUDAH termasuk — yaitu paket itu punya
 *   ≥1 item berharga yang terpilih (ditentukan dalam pass kedua,
 *   sehingga posisinya di dalam paket tidak penting, termasuk bila
 *   ia muncul sebelum item berharga pertama paket itu). Paket tanpa
 *   item berharga terpilih tidak menyumbang item belum berharga.
 * - `included`/`excluded` dikembalikan dalam URUTAN DRAF ASLI (bukan
 *   urutan peringkat) agar pesan + konsumen lain membaca draf seperti
 *   semula.
 * - null bila: tidak ada cap, cap ≤ 0 / bukan angka hingga, verdict
 *   bukan OVER (UNDER / total == cap / tanpa budget — "semuanya muat"
 *   adalah kasus UNDER, bukan proposal terpotong).
 * - Fungsi ini MURNI: tidak mengubah draft, tidak mengarang harga.
 */
export interface WithinBudgetProposal {
  included: DraftItem[];
  excluded: DraftItem[];
  includedTotal: number;
  excludedPricedTotal: number;
  unpricedIncludedCount: number;
  unpricedExcludedCount: number;
  fullTotal: number;
  cap: number;
  coveragePct: number;
  remaining: number;
}

/** Kata kunci paket struktural (batas kata — "Substruktur" ≠ "struktur"). */
const STRUCTURAL_SECTION_RE =
  /\b(persiapan|galian|pondasi|fondasi|struktur|beton|kolom|balok|sloof|footplat|pancang|tiang|bowplank|urugan|retaining|penahan|dewatering|bored|pile|plat|pembersihan|tanah|pemadatan)\b/i;

function partIsStructuralPriority(part: DraftPart): boolean {
  if (STRUCTURAL_SECTION_RE.test(part.scope.label)) return true;
  if (STRUCTURAL_SECTION_RE.test(part.template.name)) return true;
  return part.generation.items.some((it) => STRUCTURAL_SECTION_RE.test(it.description));
}

export function selectWithinBudgetScope(draft: UniversalDraft): WithinBudgetProposal | null {
  const decision = overBudgetDecision(draft);
  const cap = draft.spec.budgetCap ?? null;
  if (decision == null || cap == null || !Number.isFinite(cap) || cap <= 0) return null;
  const fullTotal = decision.total;

  // Kelompokkan item efektif per part TANPA menduplikasi logika
  // effectiveItems: daftar datar itu adalah gabungan per-part dalam
  // urutan part (item yang dihapus dilewati), jadi iris berdasarkan
  // jumlah item efektif tiap part.
  const flat = effectiveItems(draft);
  const perPart: DraftItem[][] = [];
  let cursor = 0;
  for (const part of draft.parts) {
    const count = part.generation.items.filter(
      (it) => !part.removedKeys.includes(itemKey(it)),
    ).length;
    perPart.push(flat.slice(cursor, cursor + count));
    cursor += count;
  }
  // Urutan pemilihan: paket struktural dulu, lalu sisanya — stabil
  // dalam urutan draft masing-masing.
  const partOrder = draft.parts
    .map((part, index) => ({ index, structural: partIsStructuralPriority(part) }))
    .sort((a, b) => (a.structural ? 0 : 1) - (b.structural ? 0 : 1) || a.index - b.index)
    .map((x) => x.index);
  const ordered: Array<{ item: DraftItem; partIndex: number; flatIndex: number }> = [];
  {
    let flatIndex = 0;
    const flatIndexOfPart = new Map<number, number>();
    for (let pi = 0; pi < draft.parts.length; pi++) {
      flatIndexOfPart.set(pi, flatIndex);
      flatIndex += perPart[pi].length;
    }
    for (const pi of partOrder) {
      perPart[pi].forEach((item, j) => {
        ordered.push({ item, partIndex: pi, flatIndex: (flatIndexOfPart.get(pi) ?? 0) + j });
      });
    }
  }

  // Pass 1 — rakus berawalan atas item berharga; berhenti pada item
  // pertama yang akan melampaui cap.
  const includedSet = new Set<DraftItem>();
  const includedPartIndexes = new Set<number>();
  let includedTotal = 0;
  for (const { item, partIndex } of ordered) {
    const amount = pricedAmount(item);
    if (amount == null) continue; // belum berharga — pass 2
    if (includedTotal + amount > cap) break;
    includedSet.add(item);
    includedPartIndexes.add(partIndex);
    includedTotal += amount;
  }
  // Pass 2 — item belum berharga hanya bila paketnya sudah termasuk.
  let unpricedIncludedCount = 0;
  for (const { item, partIndex } of ordered) {
    if (pricedAmount(item) != null) continue;
    if (!includedPartIndexes.has(partIndex)) continue;
    if (includedSet.has(item)) continue;
    includedSet.add(item);
    unpricedIncludedCount++;
  }

  // Kembalikan dalam urutan draf asli.
  const byFlatIndex = [...ordered].sort((a, b) => a.flatIndex - b.flatIndex);
  const included: DraftItem[] = [];
  const excluded: DraftItem[] = [];
  let excludedPricedTotal = 0;
  let unpricedExcludedCount = 0;
  for (const { item } of byFlatIndex) {
    if (includedSet.has(item)) {
      included.push(item);
    } else {
      excluded.push(item);
      const amount = pricedAmount(item);
      if (amount == null) unpricedExcludedCount++;
      else excludedPricedTotal += amount;
    }
  }
  return {
    included,
    excluded,
    includedTotal,
    excludedPricedTotal,
    unpricedIncludedCount,
    unpricedExcludedCount,
    fullTotal,
    cap,
    coveragePct: fullTotal > 0 ? (includedTotal / fullTotal) * 100 : 0,
    remaining: fullTotal - includedTotal,
  };
}

/** Satu baris tabel item — cermin baris `formatUniversalDraftMessage`
 *  (header, "Harga belum tersedia", label status, sufiks AHSP sama). */
function withinBudgetItemRow(no: number, it: DraftItem): string {
  const st = displayPriceStatus(it);
  const valid = isPriceValidForTotal(it);
  const price = !valid ? 'Harga belum tersedia' : `${formatRupiah(it.unitPrice as number)} [${st.label}]`;
  const amt = !valid ? '—' : formatRupiah(it.volume * (it.unitPrice as number));
  const ahspSuffix = it.ahspCode ? ` (AHSP: ${it.ahspCode})` : '';
  return `| ${no} | ${it.description}${ahspSuffix} | ${fmtNum(it.volume)} | ${it.unit} | ${price} | ${amt} |`;
}

/**
 * D5-lanjutan (2026-11-28) — render blok draf yang dibatasi budget
 * dari `selectWithinBudgetScope`. Tidak mengarang harga: item belum
 * berharga tetap "Harga belum tersedia" dan tidak masuk total mana
 * pun. `decision` dipakai untuk kelipatan anggaran + catatan
 * SEMENTARA (total PARSIAL) — angka-angka proposal sendiri yang
 * menjadi sumber subtotal/selisih.
 */
export function formatWithinBudgetProposal(proposal: WithinBudgetProposal, decision: OverBudgetDecision): string {
  const { included, excluded, includedTotal, cap, fullTotal, coveragePct, remaining } = proposal;
  const lines: string[] = [];
  lines.push(`**Tahap 1 — sesuai budget ${formatRupiah(cap)}**`);
  lines.push(
    'Aturan pemilihan: tahap persiapan, pondasi, dan struktur diambil lebih dulu sesuai urutan paket draft, lalu item ditambahkan berurutan selama totalnya tetap dalam budget — item tidak pernah dipotong sebagian dan harga tidak pernah diturunkan.',
  );
  if (included.length === 0) {
    const blocker = excluded.find((it) => pricedAmount(it) != null);
    lines.push(
      `Tidak ada satu tahap lengkap pun yang muat dalam budget ${formatRupiah(cap)} — ` +
      (blocker
        ? `bahkan item pertama yang harus dikerjakan, ${blocker.description} (${formatRupiah(pricedAmount(blocker) as number)}), sudah melebihi anggaran, sehingga tidak ada item yang bisa dikerjakan sebagian.`
        : 'bahkan item pertama yang harus dikerjakan sudah melebihi anggaran, sehingga tidak ada item yang bisa dikerjakan sebagian.'),
    );
  } else {
    // Item termasuk — dikelompokkan per scope seperti pesan draft,
    // dalam urutan kemunculan.
    const groups = new Map<string, DraftItem[]>();
    for (const it of included) {
      const key = it.__partScope;
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
        const amt = pricedAmount(it);
        if (amt == null) groupUnpriced++;
        else subtotal += amt;
        lines.push(withinBudgetItemRow(no, it));
      }
      lines.push(`Subtotal ${groupName}: **${formatRupiah(subtotal)}**${groupUnpriced > 0 ? ` (parsial — ${groupUnpriced} item belum berharga)` : ''}`);
      lines.push('');
    }
    lines.push(`Subtotal Tahap 1: **${formatRupiah(includedTotal)}** — dalam budget ${formatRupiah(cap)}${proposal.unpricedIncludedCount > 0 ? ` (parsial — ${proposal.unpricedIncludedCount} item belum berharga, tidak masuk total)` : ''}`);
    lines.push('');
  }
  lines.push('**Belum teranggarkan:**');
  if (excluded.length === 0) {
    lines.push('• Tidak ada — semua item sudah masuk Tahap 1.');
  } else {
    for (const it of excluded) {
      const amt = pricedAmount(it);
      lines.push(`• ${it.description} (${it.__partScope}) — ${amt == null ? 'Harga belum tersedia' : formatRupiah(amt)}`);
    }
  }
  lines.push('');
  lines.push(
    `Anggaran ${formatRupiah(cap)} tidak cukup untuk menyelesaikan proyek ini. ` +
    `Total lingkup penuh ${formatRupiah(fullTotal)} (${decision.multiple.toLocaleString('id-ID', { maximumFractionDigits: 2 })}× anggaran) — ` +
    `Tahap 1 menutup ${coveragePct.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% dari total; ` +
    `masih kurang ${formatRupiah(remaining)} untuk ${excluded.length} item yang belum teranggarkan.`,
  );
  if (decision.provisional) {
    lines.push('Total bersifat SEMENTARA — ada item belum berharga yang belum masuk hitungan, sehingga total final dapat berubah sesudah harga dilengkapi.');
  }
  return lines.join('\n');
}

/** D5 — kalimat Push di akhir `formatUniversalDraftMessage` (satu sumber
 *  kebenaran: `overBudgetAskBack` menyaring kalimat ini dari balasan
 *  OVER tanpa menyentuh renderer murni tersebut). */
export const UNIVERSAL_DRAFT_PUSH_SENTENCE =
  'Draft ini belum mengubah Spreadsheet apa pun. Klik **Push ke Spreadsheet** untuk meninjau preview transfer, lalu konfirmasi bila sudah sesuai.';

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

export interface DraftScopeTotals {
  /** ID scope (UniversalScopeId). */
  scopeId: UniversalScopeId;
  /** Label scope untuk tampilan. */
  label: string;
  /** Nama template part-part scope ini (urut kemunculan). */
  templates: string[];
  itemCount: number;
  totals: DraftTotals;
}

/**
 * W3/W9 (G14) — total per cakupan (scope) untuk draft multi-scope
 * single-building. Pola yang sama dengan `computeSectionTotals`:
 * agregasi `effectiveItems` per `__partScope` + `totalsFromItems`
 * (SATU definisi ember harga — Σ scope = total proyek, modulo ulp
 * float). Label scope unik per scope id (`SCOPE_GROUPS`), jadi
 * agregasi per label setara dengan agregasi per id. Multi-building
 * TIDAK memakai ini (sudah punya ringkasan per seksi); single-scope
 * tidak butuh (total proyek = subtotal scope itu).
 */
export function computeScopeTotals(draft: UniversalDraft): DraftScopeTotals[] {
  const items = effectiveItems(draft);
  const idByLabel = new Map<string, UniversalScopeId>();
  for (const part of draft.parts) idByLabel.set(part.scope.label, part.scope.id);
  const byLabel = new Map<string, { templates: string[]; items: DraftItem[] }>();
  for (const part of draft.parts) {
    let s = byLabel.get(part.scope.label);
    if (!s) {
      s = { templates: [], items: [] };
      byLabel.set(part.scope.label, s);
    }
    if (!s.templates.includes(part.template.name)) s.templates.push(part.template.name);
  }
  for (const it of items) {
    let s = byLabel.get(it.__partScope);
    if (!s) {
      // Tidak terjadi pada draft normal (item efektif selalu berasal
      // dari part) — jaring pengaman agar item tidak hilang dari
      // penjumlahan bila penanda part rusak.
      s = { templates: [], items: [] };
      byLabel.set(it.__partScope, s);
    }
    s.items.push(it);
  }
  const out: DraftScopeTotals[] = [];
  for (const [label, s] of byLabel) {
    out.push({
      scopeId: idByLabel.get(label) ?? (label as UniversalScopeId),
      label,
      templates: s.templates,
      itemCount: s.items.length,
      totals: totalsFromItems(s.items),
    });
  }
  return out;
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
  // F-ISO-4 (2026-11-23): null EKSPLISIT menghapus ikatan — draft yang
  // dibangun tanpa projectId benar-benar tak-terikat (sebelumnya ikatan
  // draft sebelumnya diwarisi diam-diam — "warisan ikatan basi").
  // undefined (argumen tidak diteruskan) mempertahankan ikatan lama.
  // reviseUniversalDraft tidak bergantung pada pewarisan implisit: ia
  // meneruskan bindProjectId eksplisit (projectId ?? ikatan saat ini).
  if (projectId === null) lastUniversalDraftProjectId = null;
  else if (projectId) lastUniversalDraftProjectId = projectId;
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
/* mendapat part tercakup atap. KEDUA jalur memakai pemeriksaan        */
/* LEVEL-AWARE (komponen atap dihitung hanya bila benar-benar          */
/* ter-generate di PROFESSIONAL; lihat templateDeclaresRoof) — jalur   */
/* single-building menyusul di C1 (Gelombang 2): sebelumnya ia         */
/* menghitung komponen COMPREHENSIVE-opsional sebagai cakupan          */
/* sehingga part atap mandiri ditekan padahal TIDAK SATU PUN item      */
/* atap muncul di draft (mis. gedung kantor — BLD-OFFICE-MULTI hanya   */
/* mendeklarasikan atap lewat waterproofing dak opsional).             */
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
 * dihitung sebagai cakupan atap. Default false = mode semua-level
 * (diagnostik; dipin G2B-1.09) — KEDUA jalur Gate 5
 * (computeNoSpecRoofSuppression single-building sejak C1, dan
 * computeMultiBuildingRoofSuppression multi-gedung sejak §17.3)
 * memakai `true`.
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
 *
 * C1 (Gelombang 2) — LEVEL-AWARE, sama dengan jalur multi-gedung:
 * cakupan dinilai dengan templateDeclaresRoof(template, true) —
 * hanya komponen atap yang BENAR-BENAR ter-generate di PROFESSIONAL
 * yang dihitung. Sebelumnya (false) komponen COMPREHENSIVE-opsional
 * ikut dihitung, sehingga mis. gedung kantor menekan part atap
 * mandiri padahal tidak satu pun item atap muncul di draft.
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
    // C1: level-aware — hanya komponen atap yang benar-benar
    // ter-generate di PROFESSIONAL yang dihitung sebagai cakupan
    // (sama dengan computeMultiBuildingRoofSuppression).
    const roof = templateDeclaresRoof(template, true);
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
  // Batch 2 (§5.4): `outcome` keputusan suitability (NEEDS_SPEC /
  // UNSUPPORTED) diteruskan agar model cakupan dapat membedakan
  // cakupan yang perlu spesifikasi dari yang tidak didukung katalog.
  | { kind: 'skip'; reason: string; missing: string[]; outcome?: SuitabilityDecision['outcome'] };

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
  let suitable: TemplatePick[] = [];
  let suitability: SuitabilityDecision | null = null;
  let chosenPick: TemplatePick | null = null;
  let closeCall = false;
  let scoreMargin = 0;
  let demoted: TemplatePick | null = null;
  let deterministicApplied = false;
  if (!template) {
    const res = pickTemplateForScope(spec, scope);
    ranked = res.ranked;
    suitable = res.suitable;
    suitability = res.suitability;
    chosenPick = res.pick;
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
    // Batch 1 (§4): bila evaluator memutuskan TIDAK ADA kandidat yang
    // sah, pakai alasan + spek hilang dari keputusan itu (spesifik dan
    // dapat ditindaklanjuti) — bukan pesan generik. Bila evaluator
    // memilih kandidat tetapi ambang skor menggagalkannya (atau tidak
    // ada keputusan), pesan generik lama yang dipakai.
    if (suitability && (suitability.outcome === 'NEEDS_CLARIFICATION' || suitability.outcome === 'UNSUPPORTED' || suitability.outcome === 'ENGINEERING_REVIEW_REQUIRED')) {
      return {
        kind: 'skip',
        reason: suitability.explanation,
        missing: suitability.missingSpecs,
        outcome: suitability.outcome,
      };
    }
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
  // Batch 1 (§4): alternatif yang tercantum HANYA kandidat yang lolos
  // evaluator (template yang ditolak constraint keras bukan alternatif
  // yang sah); catatan demosi ditekan bila evaluator memilih template
  // yang didemosi itu sendiri, dan bila template yang didemosi juga
  // ditolak evaluator, alasan evaluatorlah yang dicatat (bukan alasan
  // rentang sekunder demosi).
  const demotedRejection = demoted && suitability
    ? suitability.rejections.find((r) => r.templateId === demoted!.template.id) ?? null
    : null;
  if (demoted && template.id !== demoted.template.id && demotedRejection) {
    assumptions.push(
      `[${tag}] Template "${demoted.template.name}" (skor tertinggi ${demoted.score}) TIDAK dipakai: ${demotedRejection.violations[0].reason}; dipakai "${template.name}".`
    );
  } else if (demoted && template.id !== demoted.template.id) {
    assumptions.push(
      `[${tag}] Template "${demoted.template.name}" (skor tertinggi ${demoted.score}) TIDAK dipakai karena nilai Anda di luar batasnya (${demoted.outOfRange.join('; ')}); dipakai "${template.name}" yang masih dalam batas.`
    );
  } else if (!forcedTemplateId && !deterministicApplied && suitable.length >= 1) {
    const pickScore = chosenPick?.template.id === template.id
      ? chosenPick.score
      : (ranked.find((r) => r.template.id === template!.id)?.score ?? ranked[0]?.score ?? 0);
    const alternatives = suitable.filter((r) => r.template.id !== template!.id).slice(0, 2);
    const altText = alternatives.length > 0
      ? `; alternatif se-cakupan: ${alternatives.map((r) => `"${r.template.name}" (skor ${r.score})`).join(', ')} — revisi dengan "ganti menjadi …" bila maksud Anda yang lain.`
      : '.';
    assumptions.push(
      `[${tag}] Template "${template.name}" dipakai (skor ${pickScore}${closeCall ? `, selisih tipis ${scoreMargin} dari pesaing terdekat — pilihan tidak tegas` : ''})${altText}`
    );
  }
  // Batch 1 (§4): asumsi + caveat evaluator kesesuaian (tanpa template
  // paksa/deterministik — pilihan eksplisit pengguna tidak perlu
  // penjelasan evaluator).
  if (!forcedTemplateId && !deterministicApplied && suitability) {
    for (const a of suitability.assumptions) assumptions.push(`[${tag}] ${a}`);
    if (suitability.outcome === 'MULTIPLE_CANDIDATES' && suitability.requiredConfirmation) {
      assumptions.push(`[${tag}] ${suitability.requiredConfirmation}`);
    }
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
        // Batch 1 (§4): alternatif yang tercantum adalah kandidat yang
        // lolos evaluator (fallback ke ranked bila tidak ada).
        candidates: (suitable.length > 0 ? suitable : ranked).filter((r) => r.template.id !== template!.id).slice(0, 2).map((r) => r.template.name),
        reason: `${building ? `${building.label}: ` : ''}skor selisih tipis ${scoreMargin} dari pesaing terdekat — pilihan tidak tegas${req ? `; material yang diminta (${req.material}) tidak memetakan deterministik ke template ini` : ''}`,
      });
    } else if (unavailable && req) {
      ambiguousPicks.push({
        scope: scope.id,
        chosen: template.id,
        candidates: (suitable.length > 0 ? suitable : ranked).slice(0, 3).map((r) => r.template.name),
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
  // Batch 3 (§6.1–§6.2) — gerbang spesifikasi teknik: bila kategori
  // part ini punya profil gerbang, nilai kelengkapan + risiko
  // tekniknya dari spek PER-SCOPE part ini (bukan spek global —
  // dimensi cakupan lain tidak boleh bocor ke penilaian part ini).
  // Verdict blocking (basis hilang / dimensi rekayasa-kritis di luar
  // cakupan template) → skip seperti penjaga jembatan di atas, dengan
  // outcome yang sama dengan evaluator B1 agar model cakupan B2
  // membedakan NEEDS_SPEC dari ENGINEERING_REVIEW. Template paksa /
  // deterministik mengesampingkan blokir gerbang (pilihan eksplisit
  // pengguna — pola yang sama dengan evaluator B1) tetapi peringatan
  // risikonya tetap tampil bila verdictnya CALCULABLE.
  const gateCategory = engineeringCategoryFor(scope.id, { templateId: template.id });
  if (gateCategory) {
    const gate = evaluateEngineeringSpec(gateCategory, spec, template);
    if (gate.blocking && !forcedTemplateId && !deterministicApplied) {
      return {
        kind: 'skip',
        reason: gate.explanation,
        missing: [
          ...gate.missingRequired.map((m) => m.label),
          ...gate.documentsRequired,
        ],
        outcome: gate.verdict === 'REQUIRES_ENGINEERING_DESIGN' ? 'ENGINEERING_REVIEW_REQUIRED' : 'NEEDS_CLARIFICATION',
      };
    }
    const risk = classifyEngineeringRisk(gate);
    // Peringatan wajib hanya untuk verdict CALCULABLE yang HIGH
    // (field rekayasa-kritis hilang — mis. tinggi dinding penahan,
    // daya listrik): verdict NEEDS_CLARIFICATION / ENGINEERING_REVIEW
    // pada template paksa tidak diperingatkan di sini karena teksnya
    // ("belum bisa menghitung") bertentangan dengan draft yang tetap
    // dibangun atas pilihan eksplisit pengguna.
    if (gate.verdict === 'CALCULABLE' && risk.warningMandatory && risk.warningText) {
      // Dedup vs partIssues: material jembatan/struktur yang hilang
      // sudah ditandai criticalGap di partIssues (blokir transfer) —
      // gerbang tidak mengulanginya sebagai peringatan kedua.
      const coveredByPartIssues = gate.missingCritical.length > 0 &&
        gate.missingCritical.every((m) => m.key === 'material') &&
        (scope.id === 'jembatan' || scope.id === 'struktur');
      if (!coveredByPartIssues) warnings.push(`[${tag}] ${risk.warningText}`);
    }
    for (const doc of gate.documentsRequired) {
      assumptions.push(`[${tag}] Dokumen yang dibutuhkan: ${doc}`);
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

/**
 * Bangun draft RAB dari katalog 183 template (jalur UNIVERSAL).
 *
 * ROUTING DUA ENGINE RAB — ATURAN YANG DITEMUKAN (P3B, 2026-11-13; JANGAN
 * satukan kedua engine tanpa keputusan owner — B-02/§E 2.2). Keputusan
 * routing BUKAN di sini melainkan di `actionRegistry.ts` (titik kanonis:
 * `CREATE_RAB_DIRECT` :2390 dan `RAB_FULL_AI` :2730):
 *   1. Rumah BERTIPE terdaftar (`findDirectTemplate`) → PARAMETRIK
 *      (`buildDirectRab`, parametricVolumeEngine); luas eksak langsung
 *      jadi tabel, luas fallback → kartu pilihan (klik "Pakai Template"
 *      → `GENERATE_RAB_TEMPLATE` → parametrik; "Pakai AI Full" → (4)).
 *   2. Rumah SPEK BEBAS tanpa tipe terdaftar → PARAMETRIK
 *      (`buildSpecRab`), KECUALI `specRabHijackGuard` aktif (primer
 *      terklasifikasi BUKAN 'rumah' — mis. kolam/jalan) → lanjut ke (3).
 *   3. Selain rumah → UNIVERSAL (fungsi ini, katalog 183 template).
 *   4. `RAB_FULL_AI`: coba parametrik dulu (kartu pending → teks mentah
 *      → needs rumah terakhir), lalu universal dari needs terakhir,
 *      lalu fallback LLM.
 * Kedua jalur memakai TANGGA KEUANGAN BERBEDA (temuan P3B-O3):
 * parametrik O&P 5/5 + pajak 11% selalu (default engine); universal
 * menampilkan biaya langsung saja di pratinjau, tangga kanonis (O&P 0/0,
 * pajak opt-in) baru berlaku pasca-transfer. Dipin di
 * `src/test/p3bCanonicalCalculation.test.ts` §4.
 */
/**
 * Akhiran alasan needs-spec (perbaikan 2026-11-26 — "dana sekian bisa ga
 * buatkan rab ..."): gema apa yang SUDAH diketahui (ukuran yang disebut
 * + anggaran) agar jawaban "belum bisa" tidak terasa mengabaikan pesan
 * pengguna. Anggaran dicatat sebagai pembanding yang dipakai begitu
 * ukuran lengkap — bukan janji total. Ukuran diambil dari spek PER-SCOPE
 * (specForScope) agar ukuran cakupan lain tidak bocor ke sini.
 * CATATAN JEMBATAN: "panjang" SENGAJA tidak dipetakan ke bentang di
 * sini — bentang adalah dimensi rekayasa yang berbeda dari panjang total
 * (pin: chatClarificationUniversal 1.3–1.11, universalConstructionMatrix
 * 13.5f/13.5g/13.13e — jembatan tanpa bentang WAJIB needs-spec meski
 * panjang disebut). Yang digema di sini hanya apa yang memang disebut.
 */
function needsSpecKnownSuffix(scopeSpec: UniversalSpec, spec: UniversalSpec): string {
  const bits: string[] = [];
  if (scopeSpec.lengthM != null) bits.push(`panjang ${fmtNum(scopeSpec.lengthM)} m`);
  if (scopeSpec.widthM != null) bits.push(`lebar ${fmtNum(scopeSpec.widthM)} m`);
  if (scopeSpec.heightM != null) bits.push(`tinggi ${fmtNum(scopeSpec.heightM)} m`);
  if (scopeSpec.areaM2 != null) bits.push(`luas ${fmtNum(scopeSpec.areaM2)} m²`);
  if (scopeSpec.depthM != null) bits.push(`kedalaman ${fmtNum(scopeSpec.depthM)} m`);
  if (scopeSpec.volumeM3 != null) bits.push(`volume ${fmtNum(scopeSpec.volumeM3)} m³`);
  const known = bits.length ? ` Yang sudah saya catat: ${bits.join(' · ')}.` : '';
  const budget = spec.budgetCap != null
    ? ` Anggaran ${formatRupiah(spec.budgetCap)} sudah saya catat — begitu ukurannya lengkap, total drafnya akan saya bandingkan dengan anggaran itu.`
    : '';
  return known + budget;
}

export function buildUniversalDraft(rawText: string, forcedTemplateId?: string, opts?: { structuredSpecs?: StructuredSpec[]; budgetCapOverride?: number | null; projectId?: string | null; buildings?: BuildingModel[]; dedQto?: DedQtoDraftInfo; classification?: Classification }): BuildResult {
  // W2/W10 §2: klasifikasi intake diteruskan ke ekstraksi spek bila
  // pemanggil sudah mengklasifikasi (bila tidak, dihitung di sana).
  const spec = extractUniversalSpec(rawText, opts?.classification ? { classification: opts.classification } : undefined);
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
  // Batch 2 (§5.3) — penekanan cakupan konteks: gedung sebagai LOKASI
  // instalasi MEP (bukan bangunan yang dihitung) ditekan di sini,
  // sebelum pemeriksaan ukuran — pola yang sama dengan noSpecRoof
  // (cakupan yang ditekan tidak diwajibkan ukurannya dan tidak
  // dibangun sebagai part; jejaknya transparan di peringatan).
  const contextSuppressed = computeContextScopeSuppression(spec, SCOPE_GROUPS);
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
    // W2/W10 §10: basis ukuran dinilai dari spek PER-SCOPE (scope yang
    // menyebut ukurannya sendiri memakai ukurannya sendiri; scope tanpa
    // atribusi jatuh ke ukuran proyek lewat specForScope — perilaku lama).
    if (scopeMeasureAvailable(specForScope(spec, scope.id), scope)) return true;
    if (scope.id === 'renovasi') {
      return spec.scopes.some((s) => s.id !== 'renovasi' && scopeMeasureAvailable(specForScope(spec, s.id), s));
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
    // Batch 2 (§5.3): cakupan konteks (gedung lokasi instalasi MEP)
    // juga tidak diwajibkan ukurannya (ia memang tidak dibangun).
    if (contextSuppressed.has(scope.id)) continue;
    // GATE 2 (5B): cakupan 'gedung' pada draft multi dinilai PER GEDUNG —
    // cukup SATU gedung berbasis ukuran agar draft jalan; gedung tanpa
    // basis sudah ditandai di flaggedBuildings dan tidak menghalangi.
    if (scope.id === 'gedung' && isMultiBuilding) {
      if (parsedBuildings.some((b) => buildingHasMeasureBasis(b))) continue;
      return {
        kind: 'needs-spec',
        reason:
          'Untuk Gedung & Bangunan saya belum bisa menghitung volume secara bertanggung jawab — tidak satu pun gedung menyebut jumlah lantai, dimensi, atau luas.' +
          (spec.budgetCap != null
            ? ` Anggaran ${formatRupiah(spec.budgetCap)} sudah saya catat — begitu ukurannya lengkap, total drafnya akan saya bandingkan dengan anggaran itu.`
            : ''),
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
        reason:
          `Untuk ${scope.label} saya belum bisa menghitung volume secara bertanggung jawab.` +
          needsSpecKnownSuffix(specForScope(spec, scope.id), spec),
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
  // Batch 2 (§5.4): skipOutcomes membawa scopeId + outcome keputusan
  // suitability agar model cakupan dapat membedakan NEEDS_SPEC dari
  // UNSUPPORTED per cakupan.
  const skipOutcomes: Array<{ where: string; scopeId: string; reason: string; missing: string[]; outcome?: SuitabilityDecision['outcome'] }> = [];
  // Batch 2 (§5.2): penekanan renovasi-modifier dikumpulkan di sini
  // agar model cakupan mencatatnya sebagai SUPPRESSED/tercakup (bukan
  // NEEDS_SPEC — renovasinya memang sudah tercakup part lain).
  const renovasiSuppressed: Array<{ scopeId: string; reason: string; kind: 'covered' }> = [];
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
    // Batch 2 (§5.3) — penekanan cakupan konteks: gedung sebagai
    // lokasi instalasi MEP tidak dibangun sebagai part tersendiri.
    // Jejak transparan, bukan diam-diam (pola penekanan atap di atas).
    const contextReason = contextSuppressed.get(scope.id);
    if (contextReason) {
      warnings.push(`[${scope.label}] tidak dibangun — ${contextReason}.`);
      continue;
    }
    // Batch 2 (§5.3) — renovasi adalah MODIFIER: bila pekerjaan yang
    // direnovasi sudah punya part (kantor/jalan/drainase), part
    // renovasi rumah tersendiri adalah kebocoran dan ditekan. Dicek
    // di sini (di dalam loop, sesudah part lain dibangun) karena
    // renovasi terlambat dalam urutan SCOPE_GROUPS dan penekanan
    // tidak boleh menekan satu-satunya cakupan yang dapat dibangun.
    if (scope.id === 'renovasi') {
      const renovReason = shouldSuppressRenovasiPart(spec, parts);
      if (renovReason) {
        warnings.push(`[${scope.label}] tidak dibangun — ${renovReason}.`);
        renovasiSuppressed.push({ scopeId: scope.id, reason: renovReason, kind: 'covered' });
        continue;
      }
    }
    // Target build untuk cakupan ini.
    const targets: Array<{ targetSpec: UniversalSpec; building: BuildingModel | null; sectionKind: 'building' | 'shared-works' | 'project' | undefined }> = [];
    if (scope.id === 'gedung' && isMultiBuilding) {
      for (const b of parsedBuildings) {
        if (!buildingHasMeasureBasis(b)) continue; // ditandai, tanpa part
        targets.push({ targetSpec: specForBuilding(spec, b), building: b, sectionKind: 'building' });
      }
    } else if (isMultiBuilding && isSharedWorksScope(scope.id)) {
      // W2/W10 §10: part tingkat proyek memakai spek PER-SCOPE.
      targets.push({ targetSpec: specForScope(spec, scope.id), building: null, sectionKind: 'shared-works' });
    } else if (isMultiBuilding) {
      targets.push({ targetSpec: specForScope(spec, scope.id), building: null, sectionKind: 'project' });
    } else {
      targets.push({ targetSpec: specForScope(spec, scope.id), building: null, sectionKind: undefined });
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
      // Skip (W2/W10 §10, G10 — draft parsial): single-building kini
      // SAMA dengan multi-gedung — part yang gagal dicatat sebagai
      // peringatan, part lain tetap dibangun; needs-spec HANYA bila
      // TIDAK SATU PUN part berhasil (lihat blok sesudah loop).
      // Perilaku single-scope TIDAK berubah: satu-satunya part gagal →
      // parts kosong → needs-spec dengan alasan/missing yang sama
      // persis seperti sebelum perubahan ini.
      const where = target.building ? `${scope.label} — ${target.building.label}` : scope.label;
      warnings.push(`[${where}] tidak dibangun: ${outcome.reason}`);
      skipOutcomes.push({ where, scopeId: scope.id, reason: outcome.reason, missing: outcome.missing, outcome: outcome.outcome });
    }
  }
  // Multi-gedung tetapi TIDAK SATU PUN seksi berhasil dibangun: draft
  // kosong tidak pernah dikembalikan — needs-spec dengan alasan gabungan.
  if (isMultiBuilding && parts.length === 0) {
    return {
      kind: 'needs-spec',
      reason: `Tidak ada seksi yang dapat dihitung untuk proyek multi-gedung ini: ${skipOutcomes.map((s) => `[${s.where}] ${s.reason}`).join('; ') || 'tidak ada gedung dengan basis ukuran.'}`,
      missing: parsedBuildings.map((b) => `${b.label}: jumlah lantai atau dimensi (contoh: "Gedung A 3 lantai 15 x 10 m")`),
    };
  }
  // Single-building tetapi TIDAK SATU PUN part berhasil (G10): draft
  // kosong tidak pernah dikembalikan — needs-spec. Satu kegagalan →
  // alasan/missing-nya persis seperti sebelum G10 (pin jembatan-50m
  // dkk. tidak berubah); >1 kegagalan → alasan + missing gabungan.
  if (!isMultiBuilding && parts.length === 0 && skipOutcomes.length > 0) {
    if (skipOutcomes.length === 1) {
      return { kind: 'needs-spec', reason: skipOutcomes[0].reason, missing: skipOutcomes[0].missing };
    }
    return {
      kind: 'needs-spec',
      reason: `Tidak ada cakupan yang dapat dihitung: ${skipOutcomes.map((s) => `[${s.where}] ${s.reason}`).join('; ')}`,
      missing: [...new Set(skipOutcomes.flatMap((s) => s.missing))],
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
    // Batch 2 (§5.3): template yang dipaksa pengguna dicatat di draft
    // — validator cakupan membebaskan part ini dari aturan L1.
    ...(forcedTemplateId ? { forcedTemplateId } : {}),
  };
  // Validasi rantai (hanya bila spek terstruktur ada).
  if (hasSpecs) {
    draft.chainValidation = validateDraftChain(draft, structuredSpecs);
  }
  // P6 (menutup P3D-O1) — artefak WBS + laporan kelengkapan DIPASANG
  // di sini: draftPersistence kini membawa kedua field (record +
  // fingerprint artefak, pola dedQto), sehingga draft in-memory vs
  // seed v1 tetap byte-identik (P4-(d)). Sebelum P6, hook ini sengaja
  // dilepas karena persistence menggugurkan field tak dikenal.
  rebuildWbsAttachment(draft);
  // Batch 2 (§5.2/§5.4) — model cakupan proyek: dibangun dari draft +
  // jejak skip/suppress build ini (pola rebuildWbsAttachment di atas
  // — lapisan validasi, tidak mengubah total/isi RAB).
  draft.scopeModel = buildScopeModel(
    draft,
    {
      skipped: skipOutcomes.map((s) => ({ scopeId: s.scopeId, reason: s.reason, missing: s.missing, outcome: s.outcome })),
      suppressed: [
        ...[...contextSuppressed.entries()].map(([scopeId, reason]) => ({ scopeId, reason, kind: 'context' as const })),
        ...renovasiSuppressed,
        // Penekanan spek terstruktur: drainase = jawaban 'tanpa'
        // (dikeluarkan), atap = tercakup komponen template keluarga.
        ...[...suppressed].map((scopeId) => {
          if (scopeId === 'drainase') {
            const ds = structuredSpecs.find((s) => s.key === 'road-drainage');
            const val = ds
              ? (Array.isArray(ds.value) ? ds.value.join(', ') : String(ds.value ?? ''))
              : 'tanpa drainase baru';
            return { scopeId, reason: `jawaban Anda: ${val}`, kind: 'excluded' as const };
          }
          return { scopeId, reason: `sudah tercakup komponen template ${specFamilyId === 'kandang' ? 'kandang' : 'gudang'}`, kind: 'covered' as const, coversScopeId: 'scope-gedung' };
        }),
        ...(noSpecRoof?.suppress
          ? [{ scopeId: 'atap', reason: `atap sudah tercakup komponen template "${noSpecRoof.coveringTemplateName}" ("${noSpecRoof.coveringComponent}")`, kind: 'covered' as const, coversScopeId: 'scope-gedung' }]
          : []),
        ...(multiRoof?.suppress
          ? [{ scopeId: 'atap', reason: `atap sudah tercakup komponen template tiap gedung (${multiRoof.coverages.map((c) => `${c.label}: "${c.coveringComponent}"`).join('; ')})`, kind: 'covered' as const, coversScopeId: 'scope-gedung' }]
          : []),
      ],
    },
    SCOPE_GROUPS,
  );
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

/**
 * W3/W9 (G14) — frasa dimensi terkonfirmasi dari spek, dipakai
 * bersama oleh baris 'Dimensi terkonfirmasi' ringkasan dan seksi
 * brief di kepala pesan (satu definisi, dua tempat tampil).
 * `projectLevelOnly` = hanya bentang/tebal tingkat proyek (GATE 2:
 * pada draft multi, angka tunggal spek proyek — luas/lantai gedung
 * PERTAMA — tidak boleh tampil sebagai dimensi terkonfirmasi).
 * Urutan frasa = urutan lama persis (luas, panjang, bentang, lantai,
 * lebar, tebal) agar pesan lama tidak berubah.
 */
function dimensionPhrases(spec: UniversalSpec, projectLevelOnly: boolean): string[] {
  const out: string[] = [];
  if (!projectLevelOnly) {
    if (spec.areaM2 != null) out.push(`luas ${fmtNum(spec.areaM2)} m²`);
    if (spec.lengthM != null) out.push(`panjang ${fmtNum(spec.lengthM)} m`);
  }
  if (spec.spanM != null) out.push(`bentang ${fmtNum(spec.spanM)} m`);
  if (!projectLevelOnly) {
    if (spec.floors != null) out.push(`${spec.floors} lantai`);
    if (spec.widthM != null) out.push(`lebar ${fmtNum(spec.widthM)} m`);
  }
  if (spec.thicknessCm != null) out.push(`tebal ${fmtNum(spec.thicknessCm)} cm`);
  if (spec.depthM != null) out.push(`kedalaman ${fmtNum(spec.depthM)} m`);
  return out;
}

/**
 * Blok completion "Lengkapi dengan Full AI" untuk pesan draft universal.
 * Hanya dipanggil bila opts.fullAiCompletion terisi — pesan default
 * (tanpa opts) byte-identical. Verdict TIDAK diulang di sini: baris
 * verdict kanonis di atas sudah dihitung atas total TERISI (item draft
 * sudah termutasi sebelum format), sehingga blok ini hanya menambah
 * caveat asumsi + ringkasan + kualitas/downgrade.
 *
 * Catatan ember: item estimasi AI (EZRAB_ASSUMPTION) masuk ember
 * 'HARGA DATABASE' di total (totalsFromItems — perilaku pin
 * displayPriceStatus untuk kind ini); blok ini menyatakan porsi
 * asumsinya secara eksplisit agar tidak terbaca sebagai harga template.
 */
function formatFullAiCompletionBlockLines(s: FullAiCompletionSummary): string[] {
  const lines: string[] = [];
  lines.push('**Lengkapi dengan Full AI — Estimasi Sementara (asumsi AI)**');
  lines.push(
    `• Harga diisi AI untuk ${s.filledPriceCount} dari ${s.totalItems} item` +
      (s.filledQuantityCount > 0 ? `; kuantitas diisi AI untuk ${s.filledQuantityCount} item` : '') +
      ` (kualitas ${s.qualityUsed}${s.qualityDefaulted ? ' — asumsi, karena kualitas tidak disebutkan' : ''}). ` +
      'Item terisi berlabel Estimasi AI (asumsi) — lihat Detail item di bawah untuk spek + dasar tiap item.',
  );
  lines.push(
    `• Total Estimasi Sementara (asumsi AI): ${formatRupiah(s.estimatedTotal)} — termasuk ${formatRupiah(s.assumedTotal)} dari ${s.filledPriceCount} item asumsi berlabel, bukan total final terverifikasi. Porsi asumsi tercakup dalam hitungan 'HARGA DATABASE' di atas (bukan harga template).`,
  );
  lines.push(
    '• Total di atas adalah Estimasi Sementara (asumsi AI) — verdict kelayakan di atas berlaku atas total asumsi ini, bukan atas harga resmi.',
  );
  if (s.qualityDowngradedFrom && s.totalAtRequestedTier != null && s.budgetCap != null) {
    const over = s.totalAtRequestedTier - s.budgetCap;
    lines.push(
      `• Agar muat di anggaran ${formatRupiah(s.budgetCap)}, kualitas diturunkan dari ${s.qualityDowngradedFrom} ke ${s.qualityUsed} — total estimasi menjadi ${formatRupiah(s.estimatedTotal)}. Total pada kualitas ${s.qualityDowngradedFrom} adalah ${formatRupiah(s.totalAtRequestedTier)} (melebihi anggaran ${formatRupiah(Math.abs(over))}).`,
    );
  }
  if (s.unfilled.length > 0) {
    const shown = s.unfilled.slice(0, 5).join('; ');
    lines.push(
      `• ${s.unfilled.length} item belum terisi harga dan tidak masuk total: ${shown}${s.unfilled.length > 5 ? `; …dan ${s.unfilled.length - 5} item lainnya` : ''}.`,
    );
  }
  for (const w of s.warnings.slice(0, 3)) lines.push(`• ⚠ ${w}`);
  return lines;
}

export function formatUniversalDraftMessage(draft: UniversalDraft, opts?: { fullAiCompletion?: FullAiCompletionSummary }): string {
  const items = effectiveItems(draft);
  const totals = computeTotals(draft);
  const lines: string[] = [];
  const spec = draft.spec;
  // GATE 2 (5B): draft multi = ≥2 bangunan DAN ada part ber-seksi
  // gedung (draft lama dengan buildings tetapi tanpa part gedung tetap
  // dirender seperti single — tidak ada seksi untuk diringkas).
  const isMultiSection = (draft.buildings?.length ?? 0) >= 2
    && draft.parts.some((p) => p.sectionKind === 'building');

  const confirmed = dimensionPhrases(spec, false);

  const readiness = draftReadiness(draft);
  lines.push(`Siap — ini draft RAB **${draft.title}** (versi ${draft.version}) yang saya susun dari katalog template resmi EZRAB, dihitung deterministik oleh engine template:`);
  lines.push('');
  // W3/W9 (G14) — seksi brief di kepala pesan: 4 baris recap
  // (fungsi/disiplin → ukuran terkonfirmasi → spek material yang
  // dipakai → jumlah scope/part) dari `draft.spec` + `draft.parts`
  // yang sudah ada. Tanpa perubahan mesin; ukuran memakai frasa yang
  // sama dengan baris 'Dimensi terkonfirmasi' di bawah (GATE 2:
  // draft multi hanya menampilkan bentang/tebal tingkat proyek).
  lines.push('**Brief proyek:**');
  {
    const functionLabel = spec.functionLabel ?? spec.needsFunctionLabel ?? spec.kindLabel;
    const scopeLabels = [...new Set(draft.parts.map((p) => p.scope.label))];
    // Label fungsi upstream kadang huruf kecil ('jembatan') — kapital
    // awal hanya untuk tampilan (data tidak diubah).
    lines.push(functionLabel
      ? `• Fungsi: ${functionLabel.charAt(0).toUpperCase() + functionLabel.slice(1)} — disiplin: ${scopeLabels.join(', ')}`
      : `• Disiplin: ${scopeLabels.join(', ')}`);
    const briefDims = isMultiSection ? dimensionPhrases(spec, true) : confirmed;
    lines.push(isMultiSection
      ? `• Ukuran terkonfirmasi: ${briefDims.length > 0 ? `${briefDims.join(', ')} (tingkat proyek)` : 'per gedung — lihat rincian seksi di bawah'}`
      : `• Ukuran terkonfirmasi: ${briefDims.length > 0 ? briefDims.join(', ') : '— (memakai default template, lihat asumsi)'}`);
    lines.push(`• Spek material: ${spec.materialKeywords.length > 0 ? spec.materialKeywords.join(', ') : '— (tidak disebut; memakai default template)'}`);
    lines.push(`• Cakupan: ${items.length} item dalam ${draft.parts.length} paket (${scopeLabels.join(', ')})`);
  }
  lines.push('');
  lines.push(`• Jenis proyek: ${draft.title}`);
  // GATE 2: pada draft multi, angka tunggal spek proyek (luas/lantai/
  // panjang/lebar gedung PERTAMA) TIDAK ditampilkan sebagai "dimensi
  // terkonfirmasi" — itu angka runtuh yang menyesatkan; dimensi per
  // gedung ada di ringkasan seksi di bawah. Bentang/tebal (tingkat
  // proyek) tetap tampil.
  if (isMultiSection) {
    const projectConfirmed = dimensionPhrases(spec, true);
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
  // W3/W9 (G14) — subtotal per scope untuk draft multi-scope
  // single-building (pola yang sama dengan ringkasan per seksi
  // multi-gedung di atas: subtotal + catatan parsial + rekonsiliasi
  // Σ scope = total proyek). Multi-gedung tidak perlu (sudah punya
  // ringkasan per seksi); single-scope tidak butuh (total proyek =
  // subtotal scope itu).
  if (!isMultiSection && new Set(draft.parts.map((p) => p.scope.id)).size >= 2) {
    const scopeTotals = computeScopeTotals(draft);
    lines.push('**Subtotal per cakupan:**');
    for (const s of scopeTotals) {
      const unpricedNote = s.totals.unpricedCount > 0 ? ` (parsial — ${s.totals.unpricedCount} item belum berharga)` : '';
      lines.push(`• ${s.label}: ${s.templates.map((t) => `"${t}"`).join(', ')} — ${s.itemCount} item — subtotal ${formatRupiah(s.totals.estimatedTotal)}${unpricedNote}`);
    }
    const sumOfScopes = scopeTotals.reduce((acc, s) => acc + s.totals.estimatedTotal, 0);
    const diffScope = totals.estimatedTotal - sumOfScopes;
    lines.push(`• Rekonsiliasi total: Σ cakupan ${formatRupiah(sumOfScopes)} = total proyek ${formatRupiah(totals.estimatedTotal)} (selisih ${formatRupiah(Math.abs(diffScope))}${Math.abs(diffScope) < 0.005 ? ' — seimbang' : ' — TIDAK SEIMBANG, laporkan'})`);
  }
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
  // Worker D 2026-11-26 (§3E — Budget Intelligence): kontributor
  // biaya terbesar + gambaran selisih. Sebelumnya pesan draft hanya
  // membawa total + verdict tanpa menyebut item mana yang mendominasi
  // total — pengguna yang anggarannya terlampaui tidak diberi tahu
  // komponen apa yang mendorong total. Semua angka di sini aritmetika
  // deterministik dari item efektif (volume × harga satuan yang
  // berharga); TIDAK ADA klaim sebab-akibat rekayasa dan TIDAK ADA
  // usulan pemangkasan lingkup — hanya fakta + persentase, keputusan
  // tetap di tangan pengguna.
  // D5 2026-11-26: ranking diekstrak ke `topCostContributors` (dipakai
  // ulang blok tanya-balik budget) — keluaran pesan ini byte-identik.
  {
    const top = topCostContributors(draft, 3);
    if (totals.estimatedTotal > 0 && top.length > 0) {
      const pct = (amt: number) =>
        `${((amt / totals.estimatedTotal) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
      lines.push('**Kontributor biaya terbesar:**');
      for (const c of top) {
        lines.push(formatCostContributorLine(c));
      }
      if (spec.budgetCap != null && totals.estimatedTotal > spec.budgetCap) {
        const over = totals.estimatedTotal - spec.budgetCap;
        const coverage = (spec.budgetCap / totals.estimatedTotal) * 100;
        lines.push(
          `• Gambaran selisih: anggaran ${formatRupiah(spec.budgetCap)} menutup ${coverage.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% dari total estimasi pada lingkup saat ini — selisih ${formatRupiah(over)} di atas anggaran. ` +
          `Item terbesar di atas (${top[0].description}, ${pct(top[0].amount)}) adalah komponen tunggal yang paling memengaruhi total; ` +
          'bila total harus turun, yang perlu diputuskan adalah mengurangi lingkup / mengganti spek komponen itu, atau menambah anggaran — pilihannya di tangan Anda.',
        );
      }
    }
  }
  // Lengkapi dengan Full AI (§5): blok completion SETELAH baris verdict
  // budget (caveat asumsi langsung mengikuti verdict). Absen bila tanpa
  // opts — pesan default byte-identical.
  if (opts?.fullAiCompletion) {
    for (const l of formatFullAiCompletionBlockLines(opts.fullAiCompletion)) lines.push(l);
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
  // W3/W9 (G2) — struktur paket (WBS) sebagai seksi TETAP sebelum
  // tabel item: node per scope dari artefak + laporan kelengkapan.
  // Ringkasan alasan per item (traceItemReasons) sudah dirender tanpa
  // syarat di blok GATE 5 di atas — tidak diulang di sini.
  for (const l of wbsStructureLines(draft)) lines.push(l);
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
      // P6 (A, EF-06): kode AHSP tiap item tampil di tabel — ditempel
      // pada sel Uraian agar header tabel (dipin banyak suite) tidak
      // berubah. Item tanpa kode tampil tanpa sufiks (jujur: belum
      // terpetakan), bukan kode karangan.
      const ahspSuffix = it.ahspCode ? ` (AHSP: ${it.ahspCode})` : '';
      lines.push(`| ${no} | ${it.description}${ahspSuffix} | ${fmtNum(it.volume)} | ${it.unit} | ${price} | ${amt} |`);
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
  // W3/W9 (G15/G16) — satu baris tangga keuangan: total pratinjau
  // adalah biaya langsung; Total RAB (overhead/profit/pajak) dihitung
  // pasca-transfer di Spreadsheet. Label 'biaya langsung' vs
  // 'Total RAB' diselaraskan dengan pesan parametrik
  // (`formatDirectRabMessage`: 'Total biaya langsung' / 'Total RAB
  // (termasuk overhead …%)') — hanya teks penjelasan, angka/tangga
  // tidak berubah.
  lines.push('Total pratinjau di atas adalah **biaya langsung** (kuantitas × harga katalog per item). **Total RAB** dihitung sesudah transfer di Spreadsheet — overhead, profit, dan pajak mengikuti konfigurasi proyek (proyek baru: overhead 0%, profit 0%, pajak opt-in, sehingga Total RAB sama dengan biaya langsung sampai konfigurasi diubah).');
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
      // P6 (B, E5): penjelasan sumber harga (priceSourceExplanation)
      // dirender di chat — selama ini hanya tersimpan di data. Bila
      // penjelasannya sama dengan detail status (kasus HARGA MANUAL —
      // detailnya memang penjelasan itu), tidak diulang.
      const expl = (eff.priceSourceExplanation ?? '').trim();
      const explSuffix = expl && expl !== st.detail ? ` · Sumber: ${expl}` : '';
      lines.push(`• ${dno}. ${it.description} — AHSP: ${it.ahspCode || '—'} · ${st.label} · ${st.detail} · ${traceFor(part, it)}${explSuffix}`);
    }
  }
  lines.push('');
  lines.push(UNIVERSAL_DRAFT_PUSH_SENTENCE);
  // P6 (D): pintu masuk panel Review — pemeriksaan per item (edit,
  // remap AHSP, harga manual, putusan asumsi, banding revisi) hidup
  // di sana, bukan di pesan ini.
  lines.push('Tinjau tiap item sebelum transfer: buka menu ⋯ di atas → **Review draft** (edit uraian/volume, ubah kode AHSP, tetapkan harga manual, setujui/tolak asumsi, dan bandingkan revisi).');
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
  // Batch 2 (§5.2): model cakupan disegarkan di choke point yang sama
  // (semua jalur revisi yang menaikkan versi lewat sini, termasuk
  // draftRevision) — catatan penekanan model lama dibawa.
  if (draft.scopeModel) {
    draft.scopeModel = refreshScopeModel(draft, draft.scopeModel, SCOPE_GROUPS);
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
  // Batch 2 (§5.2/§5.5) — revisi ukuran BER-ALAMAT cakupan: tiap pola
  // membawa segmen tengah opsional ("panjang JALAN menjadi 2000 m" —
  // nilai tangkapan pindah ke grup 2) dan `field` ScopeSpec-nya.
  // `field: null` (lantai) = ukuran tingkat proyek — tidak beralamat
  // (ScopeSpec tidak punya lantai; per-gedung ditangani specForBuilding).
  // "panjang menjadi 2 km" TETAP tidak cocok (pin 13.20m — km tidak
  // diterima di revisi): pola mensyaratkan satuan m sesudah angka.
  const measureUpdates: Array<{ re: RegExp; apply: (v: number) => void; label: (v: number) => string; field: keyof ScopeSpec | null }> = [
    { re: /(?:luas(?:\s+bangunan)?|area)\s*([a-z\s]+?)?\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*m/, apply: (v) => { spec.areaM2 = v; }, label: (v) => `luas menjadi ${fmtNum(v)} m²`, field: 'areaM2' },
    { re: /(?:panjang)\s*([a-z\s]+?)?\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*m\b/, apply: (v) => { spec.lengthM = v; }, label: (v) => `panjang menjadi ${fmtNum(v)} m`, field: 'lengthM' },
    { re: /(?:lebar)\s*([a-z\s]+?)?\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*m\b/, apply: (v) => { spec.widthM = v; }, label: (v) => `lebar menjadi ${fmtNum(v)} m`, field: 'widthM' },
    { re: /(?:bentang|span)\s*([a-z\s]+?)?\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*m\b/, apply: (v) => { spec.spanM = v; }, label: (v) => `bentang menjadi ${fmtNum(v)} m`, field: 'spanM' },
    { re: /(?:lantai)\s*([a-z\s]+?)?\s*(?:menjadi|=)?\s*(\d+)\s*lantai/, apply: (v) => { spec.floors = v; }, label: (v) => `jumlah lantai menjadi ${v}`, field: null },
    { re: /(?:tebal)\s*([a-z\s]+?)?\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*cm/, apply: (v) => { spec.thicknessCm = v; }, label: (v) => `tebal menjadi ${fmtNum(v)} cm`, field: 'thicknessCm' },
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
  // Batch 2 (§5.2/§5.5) — target revisi ukuran per cakupan. Aturan:
  // - beralamat ("panjang jalan …") → HANYA scopeSpecs cakupan itu
  //   (global tidak disentuh — revisi tidak boleh bocor ke cakupan
  //   lain; probe B2: "panjang menjadi 2000 m" pada jalan+drainase
  //   sebelumnya mengubah KEDUA part menjadi 2000 m);
  // - tanpa alamat pada draft SATU cakupan → global (perilaku lama,
  //   pin 13.20h `d.spec.widthM === 8` dipertahankan);
  // - tanpa alamat pada draft multi-cakupan dengan TEPAT SATU cakupan
  //   yang mengatribusi ukuran itu → cakupan itu saja;
  // - tanpa alamat dengan ≥2 cakupan yang mengatribusi ukuran itu →
  //   DITOLAK sebagai ambigu (pesan gaya Gate 2) — perubahan perilaku
  //   yang disengaja: penerapan global diam-diam adalah kebocoran.
  // Target diselesaikan SEMUA sebelum ada yang diterapkan, agar
  // penolakan tidak meninggalkan setengah perubahan.
  let touched = false;
  const pendingUpdates: Array<{ entry: (typeof measureUpdates)[number]; value: number; segment: string | undefined }> = [];
  for (const m of measureUpdates) {
    const mm = t.match(m.re);
    if (!mm) continue;
    const v = NUM(mm[2]);
    if (Number.isFinite(v) && v > 0) {
      pendingUpdates.push({ entry: m, value: v, segment: mm[1]?.trim() || undefined });
    }
  }
  const actions: Array<{ apply: () => void; label: string }> = [];
  // Tulis SATU nilai (scope, field) dengan MENGGANTI record + entri
  // (bukan mutasi in-place): part.spec gedung (specForBuilding)
  // berbagi REFERENSI scopeSpecs dengan spek proyek — mutasi in-place
  // akan mengubah part gedung yang seharusnya utuh (pin 5B-19: revisi
  // jalan akses mengubah serialisasi part Gedung A/B).
  const setScopeSpecValue = (scopeId: string, field: keyof ScopeSpec, value: number): void => {
    const cur = spec.scopeSpecs?.[scopeId] ?? {};
    spec.scopeSpecs = { ...(spec.scopeSpecs ?? {}), [scopeId]: { ...cur, [field]: value } };
  };
  // Terapkan revisi ke GLOBAL + sinkronkan atribusi per-scope yang
  // sudah ada untuk field yang sama — bila tidak, specForScope akan
  // menimpa nilai global hasil revisi dengan nilai atribusi LAMA
  // (regresi yang ditangkap pin 13.20k/B1.14e: revisi lebar pada draft
  // satu cakupan tidak mengubah total karena widthM 6 m teratribusi
  // ke jalan menimpa widthM 8 m hasil revisi).
  const applyGlobal = (entry: (typeof measureUpdates)[number], value: number): void => {
    entry.apply(value);
    if (entry.field != null) {
      for (const s of spec.scopes) {
        const cur = spec.scopeSpecs?.[s.id];
        if (cur?.[entry.field] != null) setScopeSpecValue(s.id, entry.field, value);
      }
    }
  };
  for (const u of pendingUpdates) {
    const { entry, value, segment } = u;
    if (entry.field == null) {
      actions.push({ apply: () => applyGlobal(entry, value), label: entry.label(value) });
      continue;
    }
    const addressed = segment ? resolveScopeAddress(segment, spec.scopes) : [];
    if (addressed.length > 1) {
      const labels = addressed.map((id) => spec.scopes.find((s) => s.id === id)?.label ?? id);
      return {
        ok: false,
        changed: false,
        message: `Perubahan "${entry.label(value)}" menyebut ${labels.map((l) => `[${l}]`).join(' dan ')} sekaligus — sebutkan satu cakupan saja (mis. "panjang jalan menjadi 2000 m") agar hanya cakupan itu yang berubah. Draft tidak berubah.`,
      };
    }
    if (addressed.length === 1) {
      const targetScope = spec.scopes.find((s) => s.id === addressed[0])!;
      if (!draft.parts.some((p) => p.scope.id === addressed[0])) {
        return {
          ok: false,
          changed: false,
          message: `Cakupan [${targetScope.label}] tidak ada di draft ini — revisi tidak dapat diterapkan. Draft tidak berubah.`,
        };
      }
      actions.push({
        apply: () => setScopeSpecValue(addressed[0], entry.field!, value),
        label: `${entry.label(value)} [${targetScope.label}]`,
      });
      continue;
    }
    if (spec.scopes.length <= 1) {
      actions.push({ apply: () => applyGlobal(entry, value), label: entry.label(value) });
      continue;
    }
    const attributed = spec.scopes.filter((s) => spec.scopeSpecs?.[s.id]?.[entry.field!] != null);
    if (attributed.length === 1) {
      actions.push({
        apply: () => setScopeSpecValue(attributed[0].id, entry.field!, value),
        label: `${entry.label(value)} [${attributed[0].label}]`,
      });
      continue;
    }
    if (attributed.length >= 2) {
      return {
        ok: false,
        changed: false,
        message: `Perubahan "${entry.label(value)}" ambigu — ${attributed.map((s) => `[${s.label}]`).join(' dan ')} sama-sama menyebut ukuran itu. Sebutkan cakupannya (mis. "panjang jalan menjadi 2000 m") agar hanya cakupan itu yang berubah. Draft tidak berubah.`,
      };
    }
    actions.push({ apply: () => applyGlobal(entry, value), label: entry.label(value) });
  }
  for (const a of actions) {
    a.apply();
    changes.push(a.label);
    touched = true;
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
      // Batch 2 (§5.2): regenerasi memakai spek PER-SCOPE part itu
      // (specForScope) — revisi beralamat hanya mengubah part yang
      // dituju; part lain memakai ukurannya sendiri. Tanpa atribusi
      // scopeSpecs, specForScope mengembalikan spek proyek apa adanya
      // (perilaku lama identik).
      const mapped = mapSpecToParams(part.spec ?? specForScope(spec, part.scope.id), part.template, boolOverrides, selectOverrides);
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
    // Batch 1 (§4): dedup KONSEP — bila kata kunci ini SUDAH dipenuhi
    // perintah tambah sebelumnya (komponen opsional template sendiri
    // lewat jalur (a), atau item donor lewat jalur (b)), perintah kedua
    // adalah duplikat — tolak, jangan mencari item BERBEDA dari donor
    // lain. (Tanpa ini, "tambah marka jalan" kedua pada draft RIGID
    // menambahkan item marka parkir yang berbeda — 13.21c — karena
    // jalur (a) sudah memakai item marka template sendiri dan jalur (b)
    // hanya membandingkan identitas item, bukan kata kuncinya.)
    // Item BASE generasi (bukan dari perintah tambah) TIDAK memblokir:
    // mis. draft paving sudah memuat kanstin pengunci, "tambah kanstin"
    // pertama tetap boleh menambah kanstin donor (D4 hardening).
    {
      let alreadyAdded: string | null = null;
      for (const part of draft.parts) {
        for (const oid of part.generation.selectedOptionalItemIds || []) {
          const c = (part.template.components || []).find((x) => x.id === oid);
          if (c && c.name.toLowerCase().includes(keyword)) { alreadyAdded = c.name; break; }
        }
        if (alreadyAdded) break;
      }
      if (!alreadyAdded) {
        const donorHit = effectiveItems(draft).find(
          (i) => i.id.startsWith('rab-donor-') && i.description.toLowerCase().includes(keyword)
        );
        if (donorHit) alreadyAdded = donorHit.description;
      }
      if (alreadyAdded) {
        return { ok: false, changed: false, message: `Item "${alreadyAdded}" sudah ada di draft — tidak digandakan. Draft tidak berubah.` };
      }
    }
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
  /** P6 (E, K-A6): pencatatan keputusan review — diteruskan apa adanya
   * dari item draft bila terisi (lihat P6-O1 untuk rantai hilir). */
  verificationDate?: string | null;
  userDecisionStatus?: UserDecisionStatus | null;
  /**
   * S2 (§2 FINAL INTEGRITY REPAIR) — status verifikasi harga, eksplisit
   * dari draft bila ada (aksi verifikasi review), bila tidak diturunkan
   * jujur dari status transfer (lihat transferVerificationStatus).
   * Tanpa field ini factory memberi default VERIFIED untuk SEMUA item
   * berharga — verifikasi resmi yang disimpulkan dari sekadar adanya
   * angka harga.
   */
  verificationStatus?: VerificationStatus;
  /**
   * S6 (§6 FINAL INTEGRITY REPAIR, menutup P3D-O4) — traceabilitas WBS,
   * dihitung `buildPushPayload` dari pemetaan tervalidasi
   * (`resolveWbsMapping`, wbsArtifact.ts): kode WBS item bila ada kode
   * asli yang tervalidasi (BUKAN nomor urut / kode AHSP), ID node
   * artefak `wbs:<scope>` bila keanggotaan tervalidasi, status asosiasi
   * eksplisit (CONFIRMED/PROVISIONAL/UNMAPPED — selalu terisi, bahkan
   * UNMAPPED, agar tidak tertukar dengan data legacy tanpa status),
   * + saran heuristik bila PROVISIONAL (tidak pernah tampil sebagai
   * terverifikasi). Diteruskan factory → normalizeSections → snapshot
   * ekspor → kolom M Sheet 2 (P5-O3).
   */
  wbsCode?: string;
  wbsNodeId?: string;
  wbsMappingStatus?: WbsMappingStatus;
  wbsSuggestedNodeId?: string;
  /**
   * W3/W9 (§9, S3-15/16) + W7 (§7/S3-6) — jejak QTO + basis volume.
   * `calculationFormula` = rumus volume item: `calculationFormula`
   * top-level dari generator W7 (rumus murni, mis.
   * 'span_length * bridge_width * 2.2') bila ada, else string jejak
   * 'Rule: …' dari traceability/notes; absen bila tidak ada jejak
   * nyata (fallback 'Volume: N satuan' BUKAN rumus).
   * `qtoTrace` = trace terstruktur W7 (rumus + input rumus + sumber
   * volume 'CALCULATOR' + ID komponen); `sourceComponentId` = ID
   * komponen template sumber (join key stabil, juga di dalam qtoTrace
   * — dibawa top-level agar konsumen tanpa trace tetap bisa join).
   * Keduanya diteruskan apa adanya dari item draft (absen pada item
   * lama/manual/donor tanpa tautan komponen).
   * `volumeBasis` SELALU terisi (USER_DIMENSION = rumus memakai
   * dimensi pengguna; ASSUMPTION = hanya default template).
   * `volumeSource` dibedakan dari basisnya (bukan lagi selalu
   * AI_GENERATED): USER_DIMENSION → MANUAL (dimensi dari pengguna),
   * ASSUMPTION → AI_GENERATED (diisi engine). Diteruskan factory →
   * record (cloneProvenance ikut membawa keempatnya).
   */
  calculationFormula?: string;
  volumeBasis?: VolumeBasis;
  qtoTrace?: ChatQtoTrace;
  sourceComponentId?: string;
  category: string;
  volumeSource: VolumeSourceType;
}

/**
 * Input minimal untuk kontrak status transfer (§2). Dipakai helper murni
 * di bawah agar aturan dapat dites tanpa membangun draft penuh.
 */
export interface TransferPriceInput {
  priceStatus?: string | null;
  unitPrice?: number | null;
  priceSourceKind?: string | null;
  ahspMappingStatus?: string | null;
  verificationStatus?: string | null;
  verificationDate?: string | null;
}

/**
 * Apakah klaim PRICE_RESOLVED didukung bukti (S2, §2)?
 *
 * Bukti yang diakui (salah satu cukup — kosakata yang SUDAH ADA):
 * - `priceSourceKind` OFFICIAL_AHSP / MARKET_REFERENCE — tier harga yang
 *   memang diperlakukan repo sebagai resolved (gerbang kanonis / katalog
 *   resmi untuk OFFICIAL; referensi pasar untuk MARKET — lihat probe
 *   draft nyata: 40/40 item berharga hasil generasi membawa salah satu
 *   kind ini beserta labelnya);
 * - `ahspMappingStatus` VERIFIED — pemetaan AHSP terverifikasi;
 * - verifikasi eksplisit user (`verificationStatus` VERIFIED +
 *   `verificationDate` terisi — stempel aksi "Verifikasi harga" di
 *   review, BUKAN dari edit biasa).
 *
 * Yang BUKAN bukti: sekadar adanya angka harga, label bebas, kind
 * EZRAB_ASSUMPTION/UNRESOLVED, atau persetujuan user atas asumsi
 * (DISETUJUI tidak mengubah estimasi menjadi harga resmi AHSP).
 */
export function hasResolvedPriceEvidence(it: TransferPriceInput): boolean {
  if (it.priceSourceKind === 'OFFICIAL_AHSP' || it.priceSourceKind === 'MARKET_REFERENCE') return true;
  if (it.ahspMappingStatus === 'VERIFIED') return true;
  if (it.verificationStatus === 'VERIFIED' && !!it.verificationDate) return true;
  return false;
}

/**
 * Kontrak status harga saat transfer (S2, §2 — menutup P6-O2).
 *
 * Payload lama melipat SEMUA item berharga non-manual ke PRICE_RESOLVED,
 * sehingga estimasi AI yang sudah diputuskan user tampil sebagai harga
 * resmi di spreadsheet. Aturan baru mempertahankan provenance draft:
 * - harga tidak valid (null/NaN/UNRESOLVED) → PRICE_UNRESOLVED;
 * - PRICE_MANUAL → PRICE_MANUAL; PRICE_ESTIMATED → PRICE_ESTIMATED;
 * - PRICE_RESOLVED HANYA bila ada bukti (hasResolvedPriceEvidence) —
 *   klaim tanpa bukti diturunkan ke PRICE_ESTIMATED (plafon jujur);
 * - status hilang/tak dikenal + harga valid → PRICE_ESTIMATED (harga
 *   tetap masuk total seperti RESOLVED — yang berubah hanya labelnya);
 * - sentinel 0: unitPrice 0 TANPA status eksplisit adalah sentinel
 *   "belum tersedia" (kontrak factory), bukan harga Rp0 yang valid →
 *   PRICE_UNRESOLVED. Nol DENGAN status eksplisit (RESOLVED/MANUAL/
 *   ESTIMATED) tetap harga nyata menurut kontrak yang sama.
 *
 * Total TIDAK berubah oleh aturan ini: recalculateCostSummary hanya
 * mengecualikan PRICE_UNRESOLVED — ESTIMATED dan RESOLVED sama-sama
 * masuk total. Satu-satunya perpindahan keluar total adalah sentinel 0
 * tanpa status (yang memang bukan harga).
 */
export function transferPriceStatus(it: TransferPriceInput): UniversalPushItem['priceStatus'] {
  if (!isPriceValidForTotal(it)) return 'PRICE_UNRESOLVED';
  if (
    it.unitPrice === 0 &&
    it.priceStatus !== 'PRICE_RESOLVED' &&
    it.priceStatus !== 'PRICE_MANUAL' &&
    it.priceStatus !== 'PRICE_ESTIMATED'
  ) {
    return 'PRICE_UNRESOLVED';
  }
  if (it.priceStatus === 'PRICE_MANUAL') return 'PRICE_MANUAL';
  if (it.priceStatus === 'PRICE_ESTIMATED') return 'PRICE_ESTIMATED';
  if (it.priceStatus === 'PRICE_RESOLVED') {
    return hasResolvedPriceEvidence(it) ? 'PRICE_RESOLVED' : 'PRICE_ESTIMATED';
  }
  return 'PRICE_ESTIMATED';
}

/**
 * Status verifikasi yang dibawa payload transfer (S2, §2).
 *
 * - PRICE_UNRESOLVED → NEEDS_VERIFICATION, selalu (item tanpa harga
 *   tidak pernah terverifikasi — klaim VERIFIED apa pun diturunkan
 *   fail-closed);
 * - status eksplisit draft dipertahankan apa adanya (VERIFIED hanya tiba
 *   lewat aksi verifikasi eksplisit user di review; NEEDS_VERIFICATION
 *   lewat edit/remap) — termasuk VERIFIED pada item ESTIMATED: user
 *   boleh memverifikasi harga estimasi, tetapi status harganya TETAP
 *   ESTIMATED (sumbu berbeda — persetujuan/verifikasi tidak mengubah
 *   asumsi menjadi harga resmi AHSP);
 * - H-05 (keputusan owner 2026-11-24): kind MARKET_REFERENCE TANPA
 *   status eksplisit → NEEDS_VERIFICATION, BAHKAN bila priceStatus
 *   PRICE_RESOLVED. Referensi pasar tersimpan adalah SUMBER harga,
 *   bukan peristiwa verifikasi — tidak ada yang pernah memverifikasi
 *   angka itu. priceStatus-nya TETAP PRICE_RESOLVED (bukti resolved
 *   menurut hasResolvedPriceEvidence tidak berubah; total tidak
 *   bergerak) — yang dipisah hanya sumbu verifikasi. VERIFIED eksplisit
 *   (aksi user di review, cabang di atas) tetap dipertahankan;
 * - tanpa status eksplisit (generasi template tidak pernah mengisinya):
 *   JANGAN simpulkan VERIFIED dari sekadar adanya angka harga — hanya
 *   klaim RESOLVED yang berbukti yang terverifikasi; estimasi, manual,
 *   dan klaim tanpa bukti perlu verifikasi (selaras preseden P1:
 *   estimasi/model → NEEDS_VERIFICATION; P6: manual → NEEDS_VERIFICATION).
 */
export function transferVerificationStatus(
  it: TransferPriceInput,
  priceStatus: UniversalPushItem['priceStatus'],
): VerificationStatus {
  if (priceStatus === 'PRICE_UNRESOLVED') return 'NEEDS_VERIFICATION';
  if (it.verificationStatus) return it.verificationStatus as VerificationStatus;
  // H-05: referensi pasar bukan verifikasi (lihat doc di atas).
  if (it.priceSourceKind === 'MARKET_REFERENCE') return 'NEEDS_VERIFICATION';
  if (priceStatus === 'PRICE_RESOLVED') return 'VERIFIED';
  return 'NEEDS_VERIFICATION';
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
  /**
   * Batch 4 (§8, handoff Batch 3) — penilaian risiko teknik draft
   * saat preview dibuat (ADVISORY SAJA: tidak memblokir transfer —
   * belum ada mekanisme pencatatan review teknik; penegakan
   * pemblokiran adalah wilayah Batch 5, memakai
   * checkEngineeringTransferGate di pricingFinancialIntegrity.ts).
   * Pratinjau adalah titik di mana pengguna meninjau nilai yang
   * akan ditransfer — penilaian ini yang ditampilkan UI B5.
   */
  engineeringRisk: DraftEngineeringAssessment;
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
    // Batch 4 (§8): penilaian risiko teknik on-demand (murni,
    // deterministik — dihitung ulang dari draft yang sama selalu
    // memberi hasil yang sama). Advisory: TIDAK memengaruhi
    // transferBlocked (lihat dok medan engineeringRisk di atas).
    engineeringRisk: assessDraftEngineering(draft),
  };
}

/**
 * Jejak `Volume: <angka> <satuan>` adalah fallback BUKAN rumus (dibuat
 * `rabTemplateService` bila item tanpa `notes`) — tidak diteruskan
 * sebagai `calculationFormula` (rumus yang absen tampil 'Tidak
 * tersedia' di Sheet 4, bukan restatement volume). Jejak nyata selalu
 * berawalan 'Rule: '.
 */
function isVolumeFallbackTrace(trace: string): boolean {
  return /^Volume: [\d.,]+ \S+$/.test(trace.trim());
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
 * - S2 (§2, menutup P6-O2): status harga TIDAK LAGI dilipat ke
 *   PRICE_RESOLVED — transferPriceStatus mempertahankan ESTIMATED/
 *   MANUAL/UNRESOLVED dan hanya mempertahankan RESOLVED bila ada bukti
 *   (tanpa bukti → ESTIMATED). Status verifikasi dibawa eksplisit
 *   (transferVerificationStatus) agar factory tidak memberi default
 *   VERIFIED dari sekadar adanya angka harga. unitPrice hanya dibawa
 *   bila status AKHIR berharga (sentinel 0 tanpa status → UNRESOLVED
 *   tanpa unitPrice).
 * - S6 (§6, menutup P3D-O4): traceabilitas WBS dibawa eksplisit —
 *   `resolveWbsMapping` per item dari scope pemilik part + artefak
 *   draft (keanggotaan node divalidasi, bukan dipercaya buta).
 *   `wbsCode` hanya bila ada kode asli tervalidasi; nomor urut
 *   generasi ('1'..'11') TIDAK PERNAH menjadi wbsCode. Kontrak harga
 *   S2 di atas TIDAK diubah di sini.
 * - W3/W9 (§9, S3-15/16) + W7 (§7/S3-6): jejak QTO + basis volume
 *   dibawa eksplisit — `calculationFormula` dari `calculationFormula`
 *   top-level generator W7 (rumus murni; fallback ke traceability
 *   generasi lalu `notes` item bila absen, mis. item donor revisi /
 *   komponen tanpa rule), `qtoTrace` + `sourceComponentId` diteruskan
 *   apa adanya dari item draft, dan `volumeBasis` dari
 *   `computeVolumeBasis` (dihitung PER PART agar kunci ID efektif
 *   `templateId::id` unik — ID mentah `rab-<ms>-<index>` BISA
 *   bertabrakan antar-part yang di-generate dalam milidetik yang
 *   sama). `volumeSource` dibedakan dari basis: USER_DIMENSION →
 *   MANUAL, ASSUMPTION → AI_GENERATED (nilai enum yang sudah ada;
 *   tidak ada nilai 'USER_DIMENSION' di `VolumeSourceType` — nilai
 *   'CALCULATOR' W7 tetap tersimpan di dalam `qtoTrace.volumeSource`).
 *   Status harga/totals TIDAK diubah di sini.
 */
export function buildPushPayload(draft: UniversalDraft): UniversalPushItem[] {
  const readiness = draftReadiness(draft);
  if (readiness.status === 'BLOCKED') {
    throw new Error(
      `Draft diblokir untuk transfer: ${readiness.blockedReasons.join('; ')} — lengkapi spesifikasi lewat revisi, lalu coba lagi.`
    );
  }
  // D5 (2026-11-26, perintah owner): jaring pengaman terakhir — cermin
  // `validateTransfer`: draft OVER yang menunggu jawaban budget TIDAK
  // BOLEH ditransfer lewat jalur mana pun, termasuk klik ganda /
  // eksekusi ulang handler di view.
  if (draft.budgetDecisionPending === true && overBudgetDecision(draft)) {
    throw new Error(
      'Draft menunggu jawaban atas pertanyaan budget (total melebihi anggaran) — jawab dulu: kurangi lingkup, tambah budget, atau ganti spek/material.'
    );
  }
  // GATE 2 (5B): pada draft multi-seksi, item membawa label seksinya di
  // deskripsi — tanpa ini dua gedung bertemplate sama menghasilkan item
  // berdeskripsi+volume identik yang saling men-dedup di
  // dedupePushPayload (gedung kedua hilang saat transfer). Single:
  // deskripsi tidak berubah.
  const isMultiSection = (draft.buildings?.length ?? 0) >= 2
    && draft.parts.some((p) => p.sectionKind === 'building');
  // S6 (§6, P3D-O4): pemetaan WBS per item — scope pemilik dari part
  // (ID scope, bukan label `__partScope`; skema ID efektif
  // `templateId::id` yang SAMA dengan `effectiveItems` +
  // `buildWbsForDraft`), divalidasi terhadap artefak draft. Draft
  // legacy tanpa artefak terpasang dibangunkan on-demand (deterministik
  // — jalur yang sama dengan `rebuildWbsAttachment`). Transfer bukan
  // panggilan panas, jadi biaya penelusuran ini dapat diterima.
  const wbsArtifact = draft.wbsArtifact ?? buildWbsForDraft(draft, draft.structuredSpecs ?? []);
  const ownerScopeByItemId = new Map<string, string>();
  for (const part of draft.parts) {
    for (const g of part.generation.items) {
      if (part.removedKeys.includes(itemKey(g))) continue;
      ownerScopeByItemId.set(`${part.template.id}::${g.id}`, part.scope.id);
    }
  }
  // W3/W9 (§9, S3-15/16): jejak QTO + basis volume per item efektif.
  // Basis dihitung PER PART (`computeVolumeBasis` atas draft satu
  // part): ID mentah item (`rab-<ms>-<index>`) bisa bertabrakan
  // antar-part yang di-generate dalam milidetik yang sama, sehingga
  // join basis HARUS memakai ID efektif `templateId::id` (skema yang
  // sama dengan `effectiveItems` + peta scope di atas) — join dengan
  // ID mentah akan menempelkan basis part lain ke item ini.
  // Per-part vs sekali-se draft memberi hasil identik (basis dihitung
  // per part dari spek part itu; total kerja sama).
  const volumeBasisByItemId = new Map<string, VolumeBasis>();
  const formulaByItemId = new Map<string, string>();
  for (const part of draft.parts) {
    for (const b of computeVolumeBasis({ ...draft, parts: [part] }, draft.structuredSpecs ?? [])) {
      volumeBasisByItemId.set(`${part.template.id}::${b.itemId}`, b.basis);
    }
    for (const t of part.generation.traceability ?? []) {
      if (t.calculationTrace && !isVolumeFallbackTrace(t.calculationTrace)) {
        formulaByItemId.set(`${part.template.id}::${t.itemId}`, t.calculationTrace);
      }
    }
  }
  return effectiveItems(draft).map((it) => {
    // S2 (§2): status transfer dari kontrak transferPriceStatus — JANGAN
    // pernah melipat ke PRICE_RESOLVED di sini (P6-O2).
    const priceStatus = transferPriceStatus(it);
    const verificationStatus = transferVerificationStatus(it, priceStatus);
    // W3/W9 (§9, S3-15/16): basis volume item ini (peta per-part di
    // atas); default ASSUMPTION hanya jaring pengaman.
    const volumeBasis = volumeBasisByItemId.get(it.id) ?? 'ASSUMPTION';
    // S6 (§6): pemetaan WBS tervalidasi — `wbsCode` hanya dari kode asli
    // tervalidasi; `__wbsNodeId` draft TIDAK dipakai di sini (itu milik
    // `traceDraftItems`, dipertahankan apa adanya di jalurnya).
    const wbs = resolveWbsMapping({
      itemId: it.id,
      description: it.description,
      wbsCode: it.wbsCode,
      templateCode: it.code,
      ownerScopeId: ownerScopeByItemId.get(it.id),
      artifact: wbsArtifact,
    });
    const sectionPrefix = !isMultiSection
      ? ''
      : it.__buildingId
        ? `[${(draft.buildings ?? []).find((b) => b.id === it.__buildingId)?.label ?? it.__buildingId}] `
        : it.__sectionKind === 'shared-works'
          ? '[Pekerjaan Bersama] '
          : '';
    return {
      description: `${sectionPrefix}${formatWorkItemTitle(it.description)}`,
      volume: it.volume,
      unit: it.unit,
      code: it.code || it.ahspCode || '',
      ...(it.ahspCode ? { ahspCode: it.ahspCode } : {}),
      // S2: unitPrice digating STATUS AKHIR, bukan validitas mentah —
      // sentinel 0 tanpa status lolos isPriceValidForTotal (0 finite)
      // tetapi status akhirnya UNRESOLVED dan tidak boleh membawa harga.
      ...(priceStatus !== 'PRICE_UNRESOLVED' ? { unitPrice: it.unitPrice as number } : {}),
      priceStatus,
      // S2: status verifikasi eksplisit — tanpa ini factory memberi
      // default VERIFIED untuk semua item berharga.
      verificationStatus,
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
      // P6 (E, K-A6): keputusan review diteruskan apa adanya bila
      // terisi — tanpa ini putusan approve/reject + tanggal verifikasi
      // hilang saat transfer (catatan rantai hilir: factory +
      // normalizeSections belum meneruskannya ke RABItem — P6-O1).
      ...(it.verificationDate ? { verificationDate: it.verificationDate } : {}),
      ...(it.userDecisionStatus ? { userDecisionStatus: it.userDecisionStatus } : {}),
      // S6 (§6, P3D-O4): traceabilitas WBS — status SELALU dibawa
      // (bahkan UNMAPPED) agar tidak tertukar dengan data legacy tanpa
      // status; kode/node/saran hanya bila resolver mengisinya.
      ...(wbs.wbsCode ? { wbsCode: wbs.wbsCode } : {}),
      ...(wbs.wbsNodeId ? { wbsNodeId: wbs.wbsNodeId } : {}),
      wbsMappingStatus: wbs.status,
      ...(wbs.suggestedNodeId ? { wbsSuggestedNodeId: wbs.suggestedNodeId } : {}),
      // W3/W9 (§9, S3-15/16): jejak QTO + basis volume. Formula dari
      // `calculationFormula` top-level generator W7 (rumus murni)
      // bila ada; fallback ke traceability generasi lalu `notes` item
      // (jejak yang sama — traceability dibangun dari notes) untuk
      // item tanpa formula top-level (komponen tanpa rule, item donor
      // revisi, draft lama pra-W7). Tanpa jejak nyata = field absen
      // (bukan karangan). Basis SELALU terisi — default ASSUMPTION
      // hanya jaring pengaman untuk item yang lolos dari peta (tidak
      // terjadi pada draft normal).
      ...(() => {
        const formula = it.calculationFormula
          ?? formulaByItemId.get(it.id)
          ?? (it.notes && !isVolumeFallbackTrace(it.notes) ? it.notes : undefined);
        return formula ? { calculationFormula: formula } : {};
      })(),
      // W7 (§7/S3-6): trace QTO terstruktur + ID komponen sumber
      // diteruskan apa adanya dari item draft (absen = item lama /
      // manual / donor tanpa tautan komponen — bukan karangan).
      ...(it.sourceComponentId ? { sourceComponentId: it.sourceComponentId } : {}),
      ...(it.qtoTrace ? { qtoTrace: it.qtoTrace } : {}),
      volumeBasis,
      category: it.category || 'Lainnya',
      // W3/W9 (§9, S3-16): volumeSource dibedakan dari basis — volume
      // dari dimensi pengguna BUKAN hasil AI (MANUAL = data dari
      // pengguna); volume dari default template tetap AI_GENERATED.
      volumeSource: volumeBasis === 'USER_DIMENSION' ? 'MANUAL' : 'AI_GENERATED',
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
  // D5 (2026-11-26, perintah owner): draft OVER yang SUDAH ditanyai
  // balik soal budget dan belum dijawab TIDAK BOLEH ditransfer — walau
  // readiness bukan BLOCKED (OVER sengaja bukan alasan BLOCKED agar
  // status/label draft tidak berubah). Penanda dibersihkan saat jawaban
  // diterima; revisi ke UNDER membebaskan lewat `overBudgetDecision`.
  if (draft.budgetDecisionPending === true && overBudgetDecision(draft)) {
    reasons.push('menunggu jawaban atas pertanyaan budget (total melebihi anggaran) — jawab dulu: kurangi lingkup, tambah budget, atau ganti spek/material');
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
