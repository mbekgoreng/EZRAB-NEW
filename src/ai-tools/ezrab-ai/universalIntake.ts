/**
 * universalIntake.ts — MESIN INTAKE PROYEK PERCAKAPAN UNIVERSAL
 * (Universal Conversational Project Intake — master prompt owner
 * 2026-11-10, perluasan dari intake landscape di projectIntake.ts).
 *
 * Tujuan: EZRAB AI memahami proyek lintas kategori konstruksi
 * (bangunan, sipil/infrastruktur, landscape & site development, MEP,
 * pekerjaan khusus, dan proyek MULTI-DISIPLIN) dari percakapan biasa —
 * mengekstrak SEMUA fakta yang sudah disebut, menanyakan HANYA
 * pertanyaan kritis yang masih hilang (satu per giliran), mempertahankan
 * konteks antar-pesan (termasuk koreksi, penambahan, dan PENGHAPUSAN
 * cakupan), lalu menyiapkan BRIEF PROYEK transparan untuk disetujui
 * pengguna sebelum mesin RAB kanonis dipanggil.
 *
 * BUKAN sistem paralel:
 *  - Berdiri di atas parser yang sudah ada (rabNeeds.extractRabNeeds,
 *    universalRab.extractUniversalSpec, projectIntake untuk luas
 *    hektar/are + lokasi + kondisi lahan) dan di atas katalog NYATA
 *    RabTemplateService — klasifikasi & pertanyaan mengikuti cakupan
 *    katalog yang benar-benar ada (matriks cakupan dihitung dari
 *    katalog hidup, bukan daftar karangan).
 *  - Intake landscape yang sudah berjalan (projectIntake.ts) TIDAK
 *    disentuh; kategori landscape murni tetap milik gerbang itu.
 *    Modul ini mengambil alih hanya: (a) proyek multi-disiplin,
 *    (b) kategori non-landscape yang fakta kritisnya hilang dan alur
 *    lama akan buntu (draft dari default template / penolakan
 *    "kirim ulang" / menu generik), (c) kategori yang jatuh ke menu
 *    generik padahal teridentifikasi.
 *  - Pembangkitan RAB tetap 100% mesin kanonis (universalRab /
 *    UnifiedProjectEngine lewat actionRegistry). Modul ini TIDAK
 *    menghitung nilai finansial apa pun.
 *
 * Provenans (§6 master prompt): setiap fakta membawa status —
 * USER_CONFIRMED (disebut eksplisit pengguna), USER_PREFERENCE
 * (preferensi material/kualitas), SYSTEM_DERIVED (konversi satuan
 * sistem, nilai asli dipertahankan), SUGGESTION_ONLY (saran — TIDAK
 * PERNAH menjadi cakupan terkonfirmasi tanpa persetujuan pengguna),
 * ASSUMPTION_PENDING_APPROVAL, UNRESOLVED (belum diketahui/diputuskan).
 */

import { extractRabNeeds, parseAreaNumber, parseBudgetMentions, type BudgetMentionKind } from './rabNeeds';
import { extractRabIntentSpec, houseViewFromSpec, mergeHouseViews } from './rabIntentSpec';
import type { HouseSpecView } from './rabIntentSpec';
import { extractUniversalSpec } from './universalRab';
import { extractProjectContext, parseAreaMentionM2 } from './projectIntake';
import { detectSubtypeFromText } from './rabSubtypes';
import { conceptualWbsLines } from './conceptualWbs';
/**
 * Impor NILAI dari questionnaire.ts AMAN (tanpa siklus runtime):
 * questionnaire.ts hanya mengimpor `./universalIntake` sebagai
 * `import type` (dihapus saat kompilasi) dan tidak punya impor runtime
 * lain — jadi tidak ada siklus nilai universalIntake ↔ questionnaire.
 * structuredSpec.ts sendiri tidak mengimpor apa pun.
 */
import { deriveStructuredSpecs } from './questionnaire';
/* Batch 3 (§6.1) — basis ukuran MEP per subsistem (modul daun: hanya
 * mengimpor TIPE dari universalRab, jadi impor nilai ini tidak
 * bersiklus). */
import { mepBasisFor } from './engineeringSpec';
import { validateStructuredSpecs } from './structuredSpec';
import { isValidDedSpec } from './structuredSpec';
import type { StructuredSpec } from './structuredSpec';
/**
 * Impor NILAI dari dedQtoIntegration AMAN (tanpa siklus runtime):
 * dedQtoIntegration hanya mengimpor `./universalIntake` sebagai
 * `import type` (dihapus saat kompilasi); impor runtime-nya
 * (dedUnderstanding, qtoBridge, structuredSpec,
 * constructionDomainRetrieval) tidak mengimpor universalIntake —
 * rantai dedUnderstanding → memory → canonicalContext memakai
 * `import type` untuk UniversalIntakeContext.
 */
import { detectDedSpecConflicts, dimsFromIntakeContext } from './dedQtoIntegration';
import { applyBuildingsToContext, buildingSummaryLines, cloneBuildings } from './multiBuilding';
import type { BuildingModel } from './multiBuilding';

/* ------------------------------------------------------------------ */
/* Provenans fakta (§6)                                                */
/* ------------------------------------------------------------------ */

export type FactStatus =
  | 'USER_CONFIRMED'
  | 'USER_PREFERENCE'
  | 'SYSTEM_DERIVED'
  | 'SUGGESTION_ONLY'
  | 'ASSUMPTION_PENDING_APPROVAL'
  | 'UNRESOLVED';

export interface IntakeFact {
  key: string;
  label: string;
  value: string;
  status: FactStatus;
}

/* ------------------------------------------------------------------ */
/* Taksonomi + klasifikasi + parser satuan: PINDAH ke                */
/* universalTaxonomy.ts (W2/W10 §2, S1-R3/G13) — modul daun tanpa     */
/* dependensi ke universalRab/universalIntake sehingga KEDUA lapisan  */
/* (intake dan engine) dapat mengimpor SATU sumber yang sama tanpa    */
/* siklus. Blok di bawah hanya mengimpor ulang untuk pemakaian        */
/* internal file ini + mengekspor ulang agar SEMUA impor lama         */
/* (`from './universalIntake'`) tetap berfungsi tanpa perubahan.      */
/* ------------------------------------------------------------------ */

import {
  SUBCATEGORIES,
  FAMILY_LABELS,
  subcategoryById,
  catalogCoverage,
  coverageFor,
  classifyUniversal,
  findLinearMentions,
  parseAnchoredLinear,
  parseCountMentions,
  parseVolumeMention,
} from './universalTaxonomy';
import type {
  UniversalFamily,
  SubcategoryDef,
  Classification,
} from './universalTaxonomy';

export {
  SUBCATEGORIES,
  FAMILY_LABELS,
  subcategoryById,
  catalogCoverage,
  coverageFor,
  classifyUniversal,
  findLinearMentions,
  parseAnchoredLinear,
  parseCountMentions,
  parseVolumeMention,
  cancelledLinearValues,
} from './universalTaxonomy';
export type {
  UniversalFamily,
  SubcategoryDef,
  SupportLevel,
  CoverageEntry,
  Classification,
  LinearHit,
} from './universalTaxonomy';

/* ------------------------------------------------------------------ */
/* Konteks intake universal (§6)                                       */
/* ------------------------------------------------------------------ */

export type UniversalStage =
  | 'PROJECT_IDENTITY' | 'PROJECT_SCOPE' | 'PROJECT_DIMENSIONS'
  | 'SITE_CONDITIONS' | 'TECHNICAL_REQUIREMENTS' | 'MATERIAL_AND_QUALITY'
  | 'LOCATION_AND_CONTEXT' | 'PROJECT_REVIEW' | 'USER_APPROVAL' | 'GENERATION';

export interface ScopeItem {
  label: string;
  /** Subkategori sumbernya (bila item adalah disiplin tambahan). */
  subcategoryId: string | null;
  status: FactStatus;
}

/* ------------------------------------------------------------------ */
/* Budget terstruktur (Gelombang A Fase 3) — budget adalah KONTEKS     */
/* persisten, bukan string sesaat: jumlah + JENIS batas + teks asli.   */
/* "maksimal/mentok" = MAXIMUM (batas atas, bukan target paksa);       */
/* "sekitar/kisaran" = ESTIMATED; "target" = TARGET; tanpa kualifier   */
/* = UNSPECIFIED. Koreksi budget = koreksi field tunggal: nilai lama   */
/* masuk budgetHistory, konteks lain tidak disentuh.                   */
/* ------------------------------------------------------------------ */

/** Jenis batas budget — alias atas jenis kanonis parser budget (rabNeeds). */
export type BudgetKind = BudgetMentionKind;

/* Cakupan budget (Wave C, menutup celah T29): budget yang dinyatakan  */
/* "sudah termasuk peralatan dan instalasi air" TIDAK setara dengan    */
/* budget konstruksi murni — cakupannya adalah konteks terstruktur     */
/* tersendiri agar total RAB tidak dibandingkan mentah terhadap angka  */
/* yang cakupannya berbeda. Field boolean|null persis skema master     */
/* prompt §5 (includesTax/includesEquipment/includesLabor): null =     */
/* tidak pernah dinyatakan pengguna, TIDAK ditebak.                    */

export interface BudgetCoverage {
  includesEquipment: boolean | null;
  includesLabor: boolean | null;
  includesTax: boolean | null;
  includesUtilities: boolean | null;
  /** Frasa utilitas spesifik apa adanya ("instalasi air", "instalasi listrik"). */
  notes: string[];
}

export const emptyBudgetCoverage = (): BudgetCoverage => ({
  includesEquipment: null,
  includesLabor: null,
  includesTax: null,
  includesUtilities: null,
  notes: [],
});

export function budgetCoverageHasData(c: BudgetCoverage | null | undefined): boolean {
  return !!c && (c.includesEquipment != null || c.includesLabor != null || c.includesTax != null || c.includesUtilities != null || c.notes.length > 0);
}

/** Gabung dua cakupan: field non-null dari `over` menang; notes digabung. */
export function mergeBudgetCoverage(base: BudgetCoverage | null, over: BudgetCoverage | null): BudgetCoverage | null {
  if (!budgetCoverageHasData(base)) return budgetCoverageHasData(over) ? over : null;
  if (!budgetCoverageHasData(over)) return base;
  const notes = [...(base?.notes ?? [])];
  for (const n of over?.notes ?? []) if (!notes.includes(n)) notes.push(n);
  return {
    includesEquipment: over?.includesEquipment ?? base?.includesEquipment ?? null,
    includesLabor: over?.includesLabor ?? base?.includesLabor ?? null,
    includesTax: over?.includesTax ?? base?.includesTax ?? null,
    includesUtilities: over?.includesUtilities ?? base?.includesUtilities ?? null,
    notes,
  };
}

const COVERAGE_COMPONENT_LABELS: Array<{ key: 'includesEquipment' | 'includesLabor' | 'includesTax' | 'includesUtilities'; included: string; excluded: string }> = [
  { key: 'includesEquipment', included: 'termasuk peralatan', excluded: 'peralatan belum termasuk' },
  { key: 'includesLabor', included: 'termasuk upah/tenaga kerja', excluded: 'upah/tenaga kerja belum termasuk' },
  { key: 'includesTax', included: 'termasuk pajak', excluded: 'pajak belum termasuk' },
  { key: 'includesUtilities', included: 'termasuk utilitas/instalasi', excluded: 'utilitas/instalasi belum termasuk' },
];

/** Deskripsi cakupan satu baris untuk ringkasan/brief ("termasuk peralatan; pajak belum termasuk"). */
export function describeBudgetCoverage(c: BudgetCoverage | null | undefined): string {
  if (!budgetCoverageHasData(c)) return '';
  const parts: string[] = [];
  for (const comp of COVERAGE_COMPONENT_LABELS) {
    const v = c?.[comp.key];
    if (v === true) parts.push(comp.included);
    else if (v === false) parts.push(comp.excluded);
  }
  const notes = (c?.notes ?? []).filter((n) => !parts.some((p) => p.includes(n)));
  if (notes.length) parts.push(`termasuk ${notes.join(', ')}`);
  return parts.join('; ');
}

const COVERAGE_COMPONENT_PATTERNS: Array<{ key: 'includesEquipment' | 'includesLabor' | 'includesTax' | 'includesUtilities'; re: RegExp }> = [
  { key: 'includesEquipment', re: /\b(peralatan|perlengkapan|alat kerja|equipment)\b/ },
  { key: 'includesLabor', re: /\b(upah|tenaga kerja|buruh|tukang|ongkos kerja)\b/ },
  { key: 'includesTax', re: /\b(pajak|ppn|pph)\b/ },
  { key: 'includesUtilities', re: /\b(instalasi air|air bersih|instalasi listrik|instalasi|utilitas|sanitasi|plumbing|listrik)\b/ },
];

/**
 * Parse cakupan budget dari frasa natural ("sudah termasuk peralatan
 * dan instalasi air", "belum termasuk pajak", "di luar upah", "harga
 * sudah termasuk ppn"). Teks dipecah per klausa; polaritas klausa
 * (termasuk vs belum/di luar) berlaku bagi komponen di klausa itu dan
 * diwarisi klausa rangkaian berikutnya ("…termasuk A dan B"). Tanpa
 * penanda polaritas eksplisit, komponen TIDAK dicatat — cakupan tidak
 * ditebak dari sekadar penyebutan komponen.
 */
export function parseBudgetCoverage(text: string): BudgetCoverage | null {
  const t = ` ${(text || '').toLowerCase().replace(/\s+/g, ' ')} `;
  const cov = emptyBudgetCoverage();
  let found = false;
  let polarity: boolean | null = null;
  const clauses = t.split(/\s*(?:,|;|\bdan\b|\bserta\b|\bplus\b|\+)\s*/);
  for (const clause of clauses) {
    const hasComponent = COVERAGE_COMPONENT_PATTERNS.some((c) => c.re.test(clause));
    // "di luar" hanya penanda eksklusi bila klausanya memuat komponen
    // cakupan — "di luar ruangan" (outdoor) bukan pernyataan budget.
    const exclMatch = /\b(belum termasuk|tidak termasuk|tak termasuk|nggak termasuk|belum meliputi|tidak meliputi|exclude|excluding)\b/.test(clause)
      || (/\bdi luar\b/.test(clause) && hasComponent);
    const inclMatch = !exclMatch && /\b(sudah termasuk|termasuk|sudah meliputi|meliputi|sudah dengan|include|including)\b/.test(clause);
    if (exclMatch) polarity = false;
    else if (inclMatch) polarity = true;
    if (polarity == null || !hasComponent) continue;
    for (const comp of COVERAGE_COMPONENT_PATTERNS) {
      const m = clause.match(comp.re);
      if (!m) continue;
      cov[comp.key] = polarity;
      found = true;
      // Frasa utilitas spesifik disimpan apa adanya agar ringkasan
      // menyebut persis yang dikatakan pengguna ("instalasi air").
      if (comp.key === 'includesUtilities' && /^(instalasi|air bersih|sanitasi|plumbing)/.test(m[1]) && !cov.notes.includes(m[1])) {
        cov.notes.push(m[1]);
      }
    }
  }
  return found ? cov : null;
}

export interface BudgetContext {
  amount: number;
  kind: BudgetKind;
  original: string;
  /** Cakupan budget terstruktur (Wave C) — null = tidak pernah dinyatakan. */
  coverage: BudgetCoverage | null;
}

export const BUDGET_KIND_LABELS: Record<BudgetKind, string> = {
  MAXIMUM: 'batas maksimum (bukan target paksa)',
  ESTIMATED: 'perkiraan/kisaran',
  TARGET: 'target anggaran',
  UNSPECIFIED: 'disebut tanpa kualifier batas',
};

/** Parse SATU penyebutan budget dari teks (yang TERAKHIR). Pembungkus
 * tipis atas parser KANONIS `parseBudgetMentions` (rabNeeds — S1-R2/F11)
 * yang menambah cakupan budget terstruktur; pola, guard "uang", dan
 * semantik koreksi "bukan X" semuanya milik parser kanonis itu. */
export function parseBudgetMention(text: string): BudgetContext | null {
  const all = parseAllBudgetMentions(text);
  return all.length ? all[all.length - 1] : null;
}

/**
 * FASE 4 (CHAT-02) — SEMUA penyebutan budget pada satu teks, berurutan
 * posisi. `parseBudgetMention` hanya mengembalikan yang TERAKHIR, jadi
 * revisi dalam satu pesan ("anggaran 300 juta anggaran 250 juta")
 * kehilangan nilai sebelumnya; pemanggil memakai daftar ini untuk
 * mengisi `budgetHistory` (nilai lama) + koreksi, selaras semantik
 * last-match rantai spek Fase 2. Pola milik parser kanonis
 * `parseBudgetMentions` (rabNeeds); di sini hanya ditambah cakupan.
 */
export function parseAllBudgetMentions(text: string): BudgetContext[] {
  const coverage = parseBudgetCoverage(text);
  return parseBudgetMentions(text).map((m) => ({
    amount: m.amount,
    kind: m.kind,
    original: m.original,
    coverage,
  }));
}

/* ------------------------------------------------------------------ */
/* Fungsi per lantai (Wave C, menutup celah T24) — penugasan fungsi    */
/* per lantai ("lantai pertama untuk kantor, lantai kedua untuk       */
/* ruang rapat") adalah konteks terstruktur persisten, bukan teks      */
/* lewat. Satu lantai = satu fungsi kini; penyebutan ulang lantai      */
/* yang sama (termasuk koreksi "bukan X, tapi Y") menimpa HANYA        */
/* lantai itu. "lantai atas" dipetakan ke lantai teratas hanya bila    */
/* jumlah lantai diketahui — tidak dikarang.                           */
/* ------------------------------------------------------------------ */

export interface FloorFunctionAssignment {
  /** Nomor lantai 1-based (lantai dasar/pertama = 1). */
  floor: number;
  /** Frasa lantai apa adanya ("lantai pertama", "lantai 2", "lantai atas"). */
  floorLabel: string;
  /** Fungsi apa adanya dari teks ("ruang rapat"). */
  functionLabel: string;
}

const FLOOR_ORDINAL_WORDS: Record<string, number> = {
  pertama: 1, satu: 1, kedua: 2, dua: 2, ketiga: 3, tiga: 3,
  keempat: 4, empat: 4, kelima: 5, lima: 5, keenam: 6, enam: 6, dasar: 1,
};

const FLOOR_TOKEN_SRC = 'pertama|kedua|ketiga|keempat|kelima|keenam|satu|dua|tiga|empat|lima|enam|dasar|atas|\\d+';

function cleanFloorFunctionLabel(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/[\s.]+$/g, '').replace(/\s+saja$/g, '').trim();
}

/** Parse penugasan fungsi per lantai dari SATU pesan (umum, bukan naskah tetap). */
export function parseFloorFunctionAssignments(text: string, knownFloors?: number | null): FloorFunctionAssignment[] {
  const t = ` ${(text || '').toLowerCase().replace(/\s+/g, ' ')} `;
  const out: FloorFunctionAssignment[] = [];
  const upsert = (token: string, fnRaw: string) => {
    const fn = cleanFloorFunctionLabel(fnRaw);
    if (!fn || fn.length < 2) return;
    if (/\bm(?:2|²)\b|meter persegi/.test(fn)) return; // itu luas, bukan fungsi
    let floor: number | null = null;
    if (token === 'atas') {
      if (knownFloors == null || knownFloors < 1) return; // lantai teratas tak diketahui — tidak dikarang
      floor = knownFloors;
    } else if (/^\d+$/.test(token)) floor = Number(token);
    else floor = FLOOR_ORDINAL_WORDS[token] ?? null;
    if (floor == null || floor < 1) return;
    const entry: FloorFunctionAssignment = { floor, floorLabel: `lantai ${token}`, functionLabel: fn };
    const idx = out.findIndex((a) => a.floor === floor);
    if (idx >= 0) out[idx] = entry;
    else out.push(entry);
  };
  // Koreksi eksplisit per lantai: "lantai 2 bukan ruang rapat, tapi ruang arsip".
  for (const m of t.matchAll(new RegExp(`\\blantai\\s+(${FLOOR_TOKEN_SRC})\\s+bukan\\s+[^,.;]+?,\\s*(?:tapi|melainkan)\\s+([a-z][a-z0-9 /&]{1,36}?)(?=\\s*(?:,|\\.|;|$))`, 'g'))) {
    upsert(m[1], m[2]);
  }
  // Penugasan: "lantai pertama untuk kantor", "lantai 2: ruang rapat",
  // "lantai kedua difungsikan sebagai ruang rapat", "lantai 1 adalah lobi".
  for (const m of t.matchAll(new RegExp(`\\blantai\\s+(${FLOOR_TOKEN_SRC})\\s*(?::|=|\\s+adalah|\\s+(?:untuk|dipakai untuk|difungsikan sebagai|berfungsi sebagai|digunakan untuk|dijadikan|sebagai))\\s+([a-z][a-z0-9 /&]{1,40}?)(?=\\s*(?:,|\\.|;|\\bdan\\s+lantai\\b|\\blantai\\s|$))`, 'g'))) {
    upsert(m[1], m[2]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Keadaan kuesioner adaptif (Adaptive Questionnaire 2026-11-12).      */
/* State ini hidup DI DALAM konteks kanonis — bukan store kedua.       */
/* Definisi pertanyaannya sendiri tinggal di questionnaire.ts; di sini */
/* hanya RECORD jawaban & status presentasinya (JSON murni, aman       */
/* diserialisasi untuk persistensi).                                   */
/* ------------------------------------------------------------------ */

export type QuestionnaireAnswerStatus = 'answered' | 'skipped';

export interface QuestionnaireAnswerRecord {
  /** Id opsi terpilih (single: maks 1; multi: banyak; text: kosong). */
  selectedIds: string[];
  /** Jawaban khusus / teks bebas pengguna (apa adanya). */
  customText: string | null;
  status: QuestionnaireAnswerStatus;
}

export interface QuestionnaireState {
  status: 'not-presented' | 'presented' | 'submitted';
  /** Kunci pertanyaan yang sudah pernah DITAMPILKAN — tidak ditampilkan ulang. */
  presentedKeys: string[];
  answers: Record<string, QuestionnaireAnswerRecord>;
  submittedAt: string | null;
}

export const emptyQuestionnaireState = (): QuestionnaireState => ({
  status: 'not-presented',
  presentedKeys: [],
  answers: {},
  submittedAt: null,
});

export interface UniversalIntakeContext {
  intent: 'CREATE_RAB';
  /**
   * FASE 5 (ARS-06) — proyek pemilik konteks ini. Dipakai generate agar
   * draft yang dibangun terikat ke proyek yang benar; dipersistensikan
   * lewat serialize (medan ikut `...rest`) dan dipulihkan lewat
   * rehydrate. null = konteks belum terikat proyek (jalur lama).
   */
  projectId?: string | null;
  primary: SubcategoryDef | null;
  secondary: SubcategoryDef[];
  isMulti: boolean;
  projectName: string | null;
  location: string | null;
  landAreaM2: number | null;
  landAreaOriginal: string | null;
  buildingAreaM2: number | null;
  floors: number | null;
  /** Fungsi per lantai terstruktur (Wave C) — satu entri per lantai yang ditugaskan pengguna. */
  floorFunctions: FloorFunctionAssignment[];
  /**
   * FASE 4 — Bangunan per bangunan (CHAT-03): tiap bangunan menyimpan
   * identitas, jumlah lantai, fungsi per lantai, dan dimensinya
   * sendiri. `floors` tunggal (di atas) tetap dipertahankan sebagai
   * lantai bangunan UTAMA agar perilaku lama tidak berubah; kebenaran
   * per bangunan ada di sini. Kosong = proyek bangunan tunggal.
   */
  buildings: BuildingModel[];
  dimensionsText: string | null;
  lengthM: number | null;
  lengthOriginal: string | null;
  widthM: number | null;
  depthM: number | null;
  heightM: number | null;
  spanM: number | null;
  volumeM3: number | null;
  counts: Array<{ value: number; unit: string; original: string }>;
  /** Cakupan TERKONFIRMASI (disiplin tambahan + item lingkup yang disebut). */
  scopeConfirmed: ScopeItem[];
  /** Cakupan yang DIHAPUS pengguna (dicatat, tidak dihidupkan lagi diam-diam). */
  scopeRemoved: string[];
  siteConditions: string[];
  /** Spek teknis apa adanya dari teks ("tebal 20 cm", "beton K-350", "CBR min 6%"). */
  technicalSpecs: string[];
  materialPreference: string | null;
  qualityPreference: string | null;
  budgetText: string | null;
  /** Budget terstruktur persisten (Fase 3) — budgetText adalah tampilannya. */
  budget: BudgetContext | null;
  /** Nilai budget SEBELUMNYA (riwayat koreksi; nilai kini hanya di `budget`). */
  budgetHistory: BudgetContext[];
  /** Riwayat koreksi field tunggal: field lain tidak ikut berubah. */
  corrections: Array<{ key: string; from: string; to: string }>;
  /** Jawaban terstruktur atas pertanyaan kategori (kandang-type, warehouse-system, bridge-type…). */
  answers: Record<string, string>;
  /** Keadaan kuesioner adaptif (pertanyaan spesifikasi tergrup) — lihat questionnaire.ts. */
  questionnaire: QuestionnaireState;
  /**
   * Spesifikasi terstruktur v2 (Rantai Spek → RAB, Fase 2 A) — model
   * baca hasil `deriveStructuredSpecs(ctx)`; sumber kanonis tetap
   * questionnaire.answers + answers + budget. Serialisasi TIDAK
   * memakai medan ini apa adanya: serialize menderivasi ulang agar
   * jawaban kanonis selalu menang atas salinan basi.
   */
  structuredSpecs: StructuredSpec[];
  /**
   * Spek hasil ekstraksi DED kanonis (GATE 4 / 5D — INTEGRASI DED/QTO).
   * Sumber kanonis spek DED (seperti questionnaire.answers untuk spek
   * kuesioner): `deriveStructuredSpecs` aturan (g) menggabungkannya
   * ke structuredSpecs untuk kunci yang belum tercakup jawaban user.
   * HANYA berisi spek bersumber 'DED' (kunci ded-*, divalidasi
   * isValidDedSpec saat rehidrasi); nilai DED asli TIDAK PERNAH
   * ditimpa di sini — revisi user yang dikonfirmasi dicatat di
   * `answers` (derive aturan (c) menang + `supersedes`). Diserialisasi
   * lewat spread `rest` (data JSON polos) seperti `buildings`.
   */
  dedSpecs: StructuredSpec[];
  /** Bagian renovasi bernama yang disebut (dapur, kamar mandi, atap…) — scope gabungan terstruktur. */
  renovationScopes: string[];
  /** true = pembangunan baru; false = eksisting/renovasi atas yang ada; null = belum jelas. */
  isNewConstruction: boolean | null;
  /** Cakupan renovasi yang dipilih ("seluruh bangunan", "lantai 1", teks bebas). */
  renovationScope: string | null;
  /** Tipe drainase yang dipilih (label; dari subtipe katalog atau pilihan konfirmasi). */
  drainageType: string | null;
  facts: IntakeFact[];
  suggestedPackages: string[];
  missingCritical: string[];
  unresolved: string[];
  stage: UniversalStage;
  approvalStatus: 'PENDING' | 'APPROVED';
  /** Kunci pertanyaan yang SUDAH diajukan — pertanyaan tidak diulang. */
  askedKeys: string[];
  forceGenerate: boolean;
  combinedText: string;
  /**
   * View rumah (W2/W10 §2, S1-R3): field rumah (kamar, kualitas,
   * pengecualian, …) dari teks giliran — digabung antar-giliran
   * (mergeHouseViews) seperti field universal lainnya, agar jalur
   * universal multi-giliran dapat MEMBACA field rumah. Absen bila
   * tidak ada field rumah yang pernah disebut. Dipersistensi lewat
   * spread `rest` di serialize (data JSON polos).
   */
  house?: HouseSpecView;
}

export const emptyUniversalIntake = (): UniversalIntakeContext => ({
  intent: 'CREATE_RAB',
  projectId: null,
  primary: null,
  secondary: [],
  isMulti: false,
  projectName: null,
  location: null,
  landAreaM2: null,
  landAreaOriginal: null,
  buildingAreaM2: null,
  floors: null,
  floorFunctions: [],
  buildings: [],
  dimensionsText: null,
  lengthM: null,
  lengthOriginal: null,
  widthM: null,
  depthM: null,
  heightM: null,
  spanM: null,
  volumeM3: null,
  counts: [],
  scopeConfirmed: [],
  scopeRemoved: [],
  siteConditions: [],
  technicalSpecs: [],
  materialPreference: null,
  qualityPreference: null,
  budgetText: null,
  budget: null,
  budgetHistory: [],
  corrections: [],
  answers: {},
  questionnaire: emptyQuestionnaireState(),
  structuredSpecs: [],
  dedSpecs: [],
  renovationScopes: [],
  isNewConstruction: null,
  renovationScope: null,
  drainageType: null,
  facts: [],
  suggestedPackages: [],
  missingCritical: [],
  unresolved: [],
  stage: 'PROJECT_IDENTITY',
  approvalStatus: 'PENDING',
  askedKeys: [],
  forceGenerate: false,
  combinedText: '',
});

const fmtNum = (v: number): string => v.toLocaleString('id-ID', { maximumFractionDigits: 2 });

const BUDGET_COVERAGE_SPEC_PREFIX = 'cakupan budget: ';

/** Cermin cakupan budget pada technicalSpecs — satu entri, selalu sinkron dengan field terstruktur. */
function syncBudgetCoverageMirror(ctx: UniversalIntakeContext): void {
  const desc = describeBudgetCoverage(ctx.budget?.coverage);
  ctx.technicalSpecs = ctx.technicalSpecs.filter((s) => !s.startsWith(BUDGET_COVERAGE_SPEC_PREFIX));
  if (desc) ctx.technicalSpecs.push(`${BUDGET_COVERAGE_SPEC_PREFIX}${desc}`);
}

/**
 * Ekstrak konteks universal dari SATU pesan, digabung ke `base` bila
 * ada. Nilai baru yang tidak null menimpa nilai lama pada kolom yang
 * sama (koreksi); kolom lain tidak disentuh. Ekstraksi memakai parser
 * bersama yang sudah ada sebisa mungkin.
 */
export function extractUniversalContext(text: string, base?: UniversalIntakeContext): UniversalIntakeContext {
  const raw = (text || '').trim();
  const t = ` ${raw.toLowerCase().replace(/\s+/g, ' ')} `;
  const ctx: UniversalIntakeContext = base
    ? {
        ...base,
        secondary: [...base.secondary],
        scopeConfirmed: [...base.scopeConfirmed],
        scopeRemoved: [...base.scopeRemoved],
        siteConditions: [...base.siteConditions],
        technicalSpecs: [...base.technicalSpecs],
        counts: [...base.counts],
        askedKeys: [...base.askedKeys],
        budgetHistory: [...base.budgetHistory],
        corrections: [...base.corrections],
        answers: { ...base.answers },
        structuredSpecs: (base.structuredSpecs ?? []).map((s) => ({
          ...s,
          value: Array.isArray(s.value) ? [...s.value] : s.value,
        })),
        // GATE 4 (5D): spek DED ikut terklon (sumber kanonisnya).
        dedSpecs: (base.dedSpecs ?? []).map((s) => ({
          ...s,
          value: Array.isArray(s.value) ? [...s.value] : s.value,
        })),
        questionnaire: {
          status: base.questionnaire?.status ?? 'not-presented',
          presentedKeys: [...(base.questionnaire?.presentedKeys ?? [])],
          answers: Object.fromEntries(
            Object.entries(base.questionnaire?.answers ?? {}).map(([k, v]) => [
              k,
              { selectedIds: [...v.selectedIds], customText: v.customText, status: v.status },
            ]),
          ),
          submittedAt: base.questionnaire?.submittedAt ?? null,
        },
        renovationScopes: [...base.renovationScopes],
        floorFunctions: base.floorFunctions.map((a) => ({ ...a })),
        buildings: cloneBuildings(base.buildings),
      }
    : emptyUniversalIntake();

  // --- Klasifikasi (hanya dari teks giliran ini; primer tidak ditimpa
  // oleh klasifikasi giliran lanjutan yang lebih lemah — disiplin baru
  // yang muncul di giliran lanjutan menjadi sekunder/konfirmasi). ---
  const cls = classifyUniversal(raw);
  if (!ctx.primary && cls.primary) {
    ctx.primary = cls.primary;
    ctx.isMulti = cls.isMulti;
  }
  // FASE 4 (CHAT-03) — bangunan per bangunan: pola multi-gedung pada
  // teks ini digabung (upsert per id) ke ctx.buildings; revisi satu
  // bangunan tidak menyentuh bangunan lain. Bila tidak ada pola,
  // konteks tidak berubah.
  applyBuildingsToContext(ctx, raw);
  const knownIds = new Set([
    ...(ctx.primary ? [ctx.primary.id] : []),
    ...ctx.secondary.map((s) => s.id),
  ]);
  for (const d of cls.matches) {
    if (knownIds.has(d.id)) continue;
    if (ctx.primary && d.id === ctx.primary.id) continue;
    // Disiplin baru pada giliran lanjutan = cakupan tambahan terkonfirmasi.
    if (base && ctx.primary) {
      ctx.secondary.push(d);
      knownIds.add(d.id);
      if (!ctx.scopeConfirmed.some((s) => s.subcategoryId === d.id)) {
        ctx.scopeConfirmed.push({ label: d.label, subcategoryId: d.id, status: 'USER_CONFIRMED' });
      }
      ctx.isMulti = true;
    } else if (!ctx.primary) {
      ctx.primary = d;
      knownIds.add(d.id);
    } else {
      ctx.secondary.push(d);
      knownIds.add(d.id);
    }
  }

  // --- View rumah (W2/W10 §2, S1-R3): field rumah dari giliran ini
  // (kamar, kualitas, pengecualian, …) digabung ke konteks agar
  // lestari antar-giliran seperti field universal lainnya. ---
  const turnHouse = houseViewFromSpec(extractRabIntentSpec(raw));
  if (turnHouse) {
    const mergedHouse = mergeHouseViews(ctx.house, turnHouse);
    if (mergedHouse) ctx.house = mergedHouse;
  }

  // --- Lapisan bersama (projectIntake): luas hektar/are + lokasi +
  // kondisi lahan + preferensi — dipakai ulang, bukan ditulis ulang. ---
  const shared = extractProjectContext(raw);
  if (shared.location && !ctx.location) ctx.location = shared.location;
  else if (shared.location) ctx.location = shared.location;
  for (const s of shared.siteConditions) {
    if (!ctx.siteConditions.includes(s)) ctx.siteConditions.push(s);
  }
  if (shared.qualityPreference) ctx.qualityPreference = shared.qualityPreference;
  if (shared.materialPreference) ctx.materialPreference = shared.materialPreference;
  // Kondisi tapak yang frasanya tidak ditangkap pola bersama persis:
  // "akses jalan terbatas" (kata benda menyela pola "akses terbatas"),
  // "daerah berbukit", dan kendala okupasi "bangunan tetap digunakan"
  // selama renovasi — ketiganya kendala nyata yang memengaruhi metode
  // kerja, jadi wajib lestari sebagai kondisi tapak (Gelombang B).
  if (/\bakses\b[^.]{0,24}\b(terbatas|sempit|sulit)\b/.test(t) && !ctx.siteConditions.includes('akses terbatas')) {
    ctx.siteConditions.push('akses terbatas');
  }
  if (/\b(berbukit|perbukitan)\b/.test(t) && !ctx.siteConditions.includes('lahan berbukit')) {
    ctx.siteConditions.push('lahan berbukit');
  }
  if (/\btetap\s+(digunakan|beroperasi|berjalan)\b/.test(t) && !ctx.siteConditions.includes('bangunan tetap digunakan selama pekerjaan')) {
    ctx.siteConditions.push('bangunan tetap digunakan selama pekerjaan');
  }
  // Revisi/preferensi kualitas yang diucapkan sebagai sifat spek/desain
  // ("spesifikasinya dibuat lebih ekonomis", "desainnya sederhana",
  // "buat yang simple aja") — pola bersama hanya menangkap bentuk
  // "gunakan kualitas X". Nilai dicatat apa adanya sebagai preferensi,
  // rinciannya tidak ditebak (Gelombang B, T01/T23/T24).
  const qualityRevision =
    t.match(/\b(?:spesifikasinya|spesifikasi|spek|desainnya|desain)\s+(?:dibuat\s+|diubah\s+|menjadi\s+)?(?:lebih\s+)?(ekonomis|sederhana|standar|standard|premium|mewah|menengah|minimalis)\b/)
    ?? t.match(/\blebih\s+(ekonomis|sederhana)\b/)
    ?? t.match(/\byang\s+(simple|sederhana)\s+aja\b/);
  if (qualityRevision) {
    ctx.qualityPreference = qualityRevision[1] === 'simple' ? 'sederhana' : qualityRevision[1];
  }
  if (shared.budgetText) ctx.budgetText = shared.budgetText;

  // --- Budget terstruktur (Fase 3): parse giliran ini menimpa field
  // budget SAJA; nilai lama masuk riwayat, konteks lain utuh. ---
  const prevBudget = ctx.budget;
  const budgetParsed = parseBudgetMention(raw);
  if (budgetParsed) {
    if (prevBudget && prevBudget.amount !== budgetParsed.amount) {
      ctx.budgetHistory.push(prevBudget);
      ctx.corrections.push({
        key: 'budget',
        from: `Rp${fmtNum(prevBudget.amount)} (${prevBudget.kind})`,
        to: `Rp${fmtNum(budgetParsed.amount)} (${budgetParsed.kind})`,
      });
    }
    // Cakupan yang sudah dinyatakan pada budget sebelumnya diwarisi
    // koreksi jumlah — koreksi angka tidak menghapus cakupan (Wave C).
    ctx.budget = { ...budgetParsed, coverage: mergeBudgetCoverage(prevBudget?.coverage ?? null, budgetParsed.coverage) };
    ctx.budgetText = `Rp${fmtNum(budgetParsed.amount)} — ${BUDGET_KIND_LABELS[budgetParsed.kind]}`;
    // FASE 4 (CHAT-02) — revisi DALAM satu pesan: penyebutan budget
    // sebelum yang terakhir menjadi riwayat (bukan hilang). Tanpa ini
    // "anggaran 300 juta anggaran 250 juta" hanya menyimpan 250 jt dan
    // cap basi 300 jt tidak terlacak di konteks percakapan.
    const mentions = parseAllBudgetMentions(raw);
    if (mentions.length > 1) {
      for (const m of mentions.slice(0, -1)) {
        if (m.amount === budgetParsed.amount) continue;
        if (ctx.budgetHistory.some((h) => h.amount === m.amount)) continue;
        ctx.budgetHistory.push(m);
        ctx.corrections.push({
          key: 'budget',
          from: `Rp${fmtNum(m.amount)} (${m.kind})`,
          to: `Rp${fmtNum(budgetParsed.amount)} (${budgetParsed.kind})`,
        });
      }
    }
  }

  // --- Cakupan budget (Wave C): frasa inklusi/eksklusi pada giliran
  // ini menimpa HANYA komponen cakupan yang disebut — jumlah, jenis
  // budget, dan konteks lain tidak disentuh. Berlaku juga pada giliran
  // koreksi cakupan murni tanpa angka ("budgetnya belum termasuk
  // pajak"). Tanpa budget yang ada, cakupan tidak menempel ke apa pun
  // dan tidak dikarang menjadi budget baru. ---
  const coverageParsed = parseBudgetCoverage(raw);
  if (coverageParsed && ctx.budget) {
    const beforeDesc = describeBudgetCoverage(ctx.budget.coverage);
    const mergedCoverage = mergeBudgetCoverage(ctx.budget.coverage, coverageParsed);
    ctx.budget = { ...ctx.budget, coverage: mergedCoverage };
    const afterDesc = describeBudgetCoverage(mergedCoverage);
    if (prevBudget && beforeDesc !== afterDesc && !ctx.corrections.some((c) => c.key === 'budgetCoverage' && c.to === afterDesc)) {
      ctx.corrections.push({ key: 'budgetCoverage', from: `Cakupan budget: ${beforeDesc || 'belum dinyatakan'}`, to: afterDesc });
    }
  }
  if (ctx.budget) syncBudgetCoverageMirror(ctx);

  // --- Jawaban terstruktur atas pertanyaan kategori yang menggantung ---
  if (base) {
    if (base.askedKeys.includes('kandang-type')) {
      if (/\btertutup\b/.test(t)) ctx.answers['kandang-type'] = 'tertutup';
      else if (/\bterbuka\b/.test(t)) ctx.answers['kandang-type'] = 'terbuka';
      else if (/\bsemi\b/.test(t)) ctx.answers['kandang-type'] = 'semi terbuka';
    }
    if (base.askedKeys.includes('warehouse-system')) {
      if (/\bportal frame\b/.test(t)) ctx.answers['warehouse-system'] = 'portal frame';
      else if (/\btruss|rangka ruang|space frame\b/.test(t)) ctx.answers['warehouse-system'] = 'truss/rangka ruang';
    }
    if (base.askedKeys.includes('bridge-type')) {
      const bt = t.match(/\b(beton|baja|kayu|bailey|komposit)\b/);
      if (bt) ctx.answers['bridge-type'] = bt[1];
    }
  }
  if (/\bportal frame\b/.test(t)) ctx.answers['warehouse-system'] = 'portal frame';
  else if (/\btruss\b/.test(t) && ctx.primary?.id === 'gudang-industri') ctx.answers['warehouse-system'] = 'truss/rangka ruang';
  if (ctx.primary?.id === 'kandang') {
    if (/\bkandang tertutup\b/.test(t)) ctx.answers['kandang-type'] = 'tertutup';
    else if (/\bkandang terbuka\b/.test(t)) ctx.answers['kandang-type'] = 'terbuka';
  }

  // --- Scope renovasi bernama (gabungan terstruktur per bagian) ---
  if (/\b(renovasi|perbaikan|rehab)\b/.test(t) || ctx.primary?.id === 'renovasi') {
    for (const part of ['dapur', 'kamar mandi', 'toilet', 'atap', 'fasad', 'lantai', 'plafon', 'kamar tidur', 'teras', 'dinding']) {
      if (new RegExp(`\\b${part}\\b`).test(t) && !ctx.renovationScopes.includes(part)) {
        ctx.renovationScopes.push(part);
      }
    }
  }

  // --- Dimensi dari parser kebutuhan bersama ---
  const needs = extractRabNeeds(raw);
  // W2/W10 §2: klasifikasi giliran ini (cls) DITERUSKAN ke ekstraksi
  // spek — intake dan engine memakai SATU objek klasifikasi yang sama,
  // bukan dua hasil klasifikasi yang bisa berbeda.
  const spec = extractUniversalSpec(raw, { classification: cls });
  const areaMention = parseAreaMentionM2(raw);
  // "Luas bangunannya …" secara eksplisit adalah luas BANGUNAN (Contoh F).
  const buildingAreaMention = /luas bangunan/.test(t) ? areaMention : null;
  // T02 (Fase 3): luas yang berjangkar ke TANAH/LAHAN ("tanah 120 m2",
  // "luas tanah 120 m²", "di lahan 120 m2") TIDAK BOLEH menjadi luas
  // bangunan — nilai yang sama dari parser kebutuhan ditolak sebagai
  // luas bangunan dan dicatat sebagai luas lahan.
  const landAnchored = /\b(tanah|lahan)\b[^.]{0,24}\d/.test(t) || /\bluas (tanah|lahan)\b/.test(t);
  if (buildingAreaMention) {
    ctx.buildingAreaM2 = buildingAreaMention.valueM2;
  } else if (needs.buildingArea != null && !(landAnchored && areaMention != null && needs.buildingArea === areaMention.valueM2)) {
    ctx.buildingAreaM2 = needs.buildingArea;
  } else if (spec.footprintM2 != null && !landAnchored && (ctx.primary?.family === 'building' || ctx.primary?.family === 'mep')) {
    ctx.buildingAreaM2 = spec.footprintM2;
  }
  if (areaMention && !buildingAreaMention && landAnchored) {
    ctx.landAreaM2 = areaMention.valueM2;
    ctx.landAreaOriginal = areaMention.original;
  } else if (areaMention && !buildingAreaMention && ctx.primary?.family !== 'building') {
    ctx.landAreaM2 = areaMention.valueM2;
    ctx.landAreaOriginal = areaMention.original;
  } else if (needs.landAreaM2 != null) {
    ctx.landAreaM2 = needs.landAreaM2;
    ctx.landAreaOriginal = `${fmtNum(needs.landAreaM2)} m²`;
  }
  if (needs.floors != null) {
    // Penjaga luas-per-lantai (Gelombang B, T24): pada frasa "luas
    // setiap lantai 200 m²" parser kebutuhan membaca "lantai 200"
    // sebagai JUMLAH lantai 200 — padahal 200 adalah LUAS per lantai.
    // Bila satu-satunya bukti lantai pada giliran ini adalah frasa luas
    // itu (angka sesudah "lantai" diikuti satuan luas) dan tidak ada
    // frasa jumlah lantai eksplisit ("2 lantai", "dua lantai", "lantai
    // dua"), nilai lantai giliran ini tidak menimpa konteks.
    const areaPerFloorPhrase =
      /\blantai\s+\d+(?:[.,]\d+)?\s*(?:m(?:2|²)|meter persegi)(?![a-z0-9])/.test(t);
    const explicitFloorPhrase =
      /\b\d+\s*lantai\b/.test(t)
      || /\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s+lantai\b/.test(t)
      || /\blantai\s+(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\b/.test(t);
    if (!(areaPerFloorPhrase && !explicitFloorPhrase)) ctx.floors = needs.floors;
  }

  // --- Fungsi per lantai (Wave C): penugasan dari giliran ini
  // digabung PER LANTAI — lantai lain tidak disentuh; penugasan ulang
  // lantai yang sama adalah koreksi field tunggal lantai itu. Cermin
  // technicalSpecs dipertahankan sinkron per lantai. ---
  for (const a of parseFloorFunctionAssignments(raw, ctx.floors)) {
    const prevFn = ctx.floorFunctions.find((x) => x.floor === a.floor);
    if (prevFn && prevFn.functionLabel !== a.functionLabel && !ctx.corrections.some((c) => c.key === `floorFunction-${a.floor}` && c.to === a.functionLabel)) {
      ctx.corrections.push({ key: `floorFunction-${a.floor}`, from: `Fungsi lantai ${a.floor}: ${prevFn.functionLabel}`, to: a.functionLabel });
    }
    ctx.floorFunctions = [...ctx.floorFunctions.filter((x) => x.floor !== a.floor), a].sort((x, y) => x.floor - y.floor);
    const specPrefix = `fungsi lantai ${a.floor}: `;
    ctx.technicalSpecs = [...ctx.technicalSpecs.filter((s) => !s.startsWith(specPrefix)), `${specPrefix}${a.functionLabel}`];
  }
  const len = needs.landLength ?? needs.buildingLength;
  const wid = needs.landWidth ?? needs.buildingWidth;
  if (len && wid) ctx.dimensionsText = `${fmtNum(len)} × ${fmtNum(wid)} m`;
  if (!ctx.dimensionsText) {
    // Bentuk lisan "12 kali 30 meter" (Fase 3): dimensi yang sama dengan
    // "12 x 30" — parser kebutuhan hanya membaca bentuk x/×.
    const kali = t.match(/(\d+(?:[.,]\d+)?)\s*kali\s*(\d+(?:[.,]\d+)?)\s*(?:meter|m)\b/);
    if (kali) {
      const a = parseAreaNumber(kali[1]);
      const b = parseAreaNumber(kali[2]);
      if (a != null && b != null && a > 0 && b > 0) ctx.dimensionsText = `${fmtNum(a)} × ${fmtNum(b)} m`;
    }
  }

  // --- Linear: panjang pekerjaan (jalan/saluran/jembatan/pagar) ---
  // PIN REKAYASA (Worker C, sprint 2026-11-26): angka yang berjangkar
  // ke dimensi LAIN (lebar/bentang) TIDAK BOLEH menjadi panjang.
  // Parser kebutuhan membaca angka telanjang ("bentang 12 m" → 12,
  // "lebar 6 m" → 6) sebagai lengthM generik; tanpa penjaga ini,
  // "jembatan bentang 12 m" mencatat panjang total 12 m yang tidak
  // pernah disebut, dan "jalan lebar 6 m" mencatat panjang 6 m
  // sehingga pertanyaan panjang tidak pernah diajukan. Penjaga hanya
  // menolak fallback needs.lengthM bila nilainya SAMA PERSIS dengan
  // nilai berjangkar lebar/bentang pada giliran ini dan tidak ada
  // jangkar panjang eksplisit — "panjang 20 m" (jangkar eksplisit)
  // dan "drainase 500 m" (tanpa jangkar lain) tetap diterima.
  const widthAnchor = parseAnchoredLinear(raw, ['lebar']);
  const spanAnchor = parseAnchoredLinear(raw, ['bentang', 'span']);
  const anchoredLen = parseAnchoredLinear(raw, ['sepanjang', 'panjang']);
  if (anchoredLen) {
    ctx.lengthM = anchoredLen.valueM;
    ctx.lengthOriginal = anchoredLen.original;
  } else if (
    needs.lengthM != null &&
    !((widthAnchor && needs.lengthM === widthAnchor.valueM) ||
      (spanAnchor && needs.lengthM === spanAnchor.valueM))
  ) {
    ctx.lengthM = needs.lengthM;
    ctx.lengthOriginal = ctx.lengthOriginal ?? `${fmtNum(needs.lengthM)} m`;
  } else {
    // "jalan beton sepanjang 2 km" tertangkap anchor; pola longgar
    // "2 km" sesudah kata kategori ditangkap parser kebutuhan (lengthM).
    const kmHit = findLinearMentions(raw).find((h) => h.original.endsWith('km') || h.original.endsWith('kilometer'));
    if (kmHit && ctx.primary?.family === 'civil') {
      ctx.lengthM = kmHit.valueM;
      ctx.lengthOriginal = kmHit.original;
    }
  }
  const width = widthAnchor;
  if (width) ctx.widthM = width.valueM;
  else if (spec.widthM != null) ctx.widthM = spec.widthM;
  const depth = parseAnchoredLinear(raw, ['kedalaman', 'kedalaman saluran', 'dalam']);
  if (depth) ctx.depthM = depth.valueM;
  // GAP C (2026-11-26, owner requirement — clear height gudang):
  // jawaban atas prompt warehouse-system ("portal frame, clear height
  // 8 m") menyimpan angka clear height sebagai heightM — slot tinggi
  // yang sudah ada (brief menampilkannya sebagai "Tinggi: 8 m").
  // Jangkar 'tinggi' saja tidak menangkap frasa Inggris itu.
  const height = parseAnchoredLinear(raw, ['tinggi', 'clear height']);
  if (height) ctx.heightM = height.valueM;
  else if (spec.heightM != null) ctx.heightM = spec.heightM;
  const span = spanAnchor;
  if (span) ctx.spanM = span.valueM;
  else if (spec.spanM != null) ctx.spanM = spec.spanM;
  const vol = parseVolumeMention(raw);
  if (vol) ctx.volumeM3 = vol.valueM3;
  for (const c of parseCountMentions(raw)) {
    if (!ctx.counts.some((x) => x.value === c.value && x.unit === c.unit)) ctx.counts.push(c);
  }

  // --- Spek teknis apa adanya (tidak ditafsirkan) ---
  const specPatterns: Array<RegExp> = [
    /\btebal\s+\d+(?:[.,]\d+)?\s*(?:cm|mm|m)\b/g,
    /\bbeton\s+k-?\s?\d{3}\b/g,
    /\bmutu\s+(?:beton\s+)?k-?\s?\d{3}\b/g,
    /\bcbr\s*(?:min(?:imal)?\s*)?\d+(?:[.,]\d+)?\s*%/g,
    /\b\d+(?:[.,]\d+)?\s*(?:kva|kw|pk)\b/g,
    /\bsistem struktur\s+[a-z ]{3,30}?(?=\s*(?:,|\.|$))/g,
  ];
  for (const re of specPatterns) {
    for (const m of t.matchAll(re)) {
      const v = m[0].trim();
      if (!ctx.technicalSpecs.some((s) => s.toLowerCase() === v)) ctx.technicalSpecs.push(v);
    }
  }
  if (/\bsubgrade\b|\btanah dasar\b/.test(t) && !ctx.technicalSpecs.includes('subgrade disebut')) {
    ctx.technicalSpecs.push('subgrade disebut');
  }
  // Kebutuhan ruang bangunan (dari parser kebutuhan bersama).
  if (needs.bedrooms != null) {
    const v = `${needs.bedrooms} kamar tidur`;
    if (!ctx.technicalSpecs.includes(v)) ctx.technicalSpecs.push(v);
  }
  if (needs.bathrooms != null) {
    const v = `${needs.bathrooms} kamar mandi`;
    if (!ctx.technicalSpecs.includes(v)) ctx.technicalSpecs.push(v);
  }

  // --- Baru vs eksisting (kata sifat eksplisit saja; kata benda
  // "pembangunan" pada PESAN AWAL tidak dihitung — lihat Contoh E
  // master prompt. Pada giliran JAWABAN atas pertanyaan status,
  // jawaban "pembangunan baru"/"baru" adalah konfirmasi eksplisit). ---
  if (/\b(bangunan|gedung|sekolah|rumah|fasilitas|pembangunan)\s+baru\b/.test(t) || /\bbangun baru\b/.test(t)) {
    ctx.isNewConstruction = true;
  } else if (base && base.askedKeys.includes('new-construction') && /\bbaru\b/.test(t) && !/\brenovasi\b/.test(t)) {
    ctx.isNewConstruction = true;
  } else if (/\beksisting\b/.test(t) || (base && base.askedKeys.includes('new-construction') && /\brenovasi|penambahan\b/.test(t))) {
    ctx.isNewConstruction = false;
  }

  // --- Cakupan renovasi yang disebut ---
  if (ctx.primary?.id === 'renovasi' || cls.primary?.id === 'renovasi') {
    if (/\bseluruh bangunan\b|\bsemua bangunan\b/.test(t)) ctx.renovationScope = 'seluruh bangunan';
    else if (/\bbagian tertentu\b/.test(t)) ctx.renovationScope = 'bagian tertentu';
    // "lantai 1/2" = cakupan renovasi HANYA pada giliran lanjutan atau
    // bila ada kata penanda cakupan — pada pesan awal "renovasi rumah
    // 2 lantai", frasa itu adalah JUMLAH LANTAI bangunan (Contoh D
    // master prompt: cakupannya justru yang harus ditanyakan).
    else if ((base || /\b(direnovasi|bagian|hanya|saja)\b/.test(t)) && /\blantai\s*satu\b/.test(t)) ctx.renovationScope = 'lantai 1';
    else if ((base || /\b(direnovasi|bagian|hanya|saja)\b/.test(t)) && /\blantai\s*dua\b/.test(t)) ctx.renovationScope = 'lantai 2';
    else if ((base || /\b(direnovasi|bagian|hanya|saja)\b/.test(t)) && /\blantai\s*1\b/.test(t)) ctx.renovationScope = 'lantai 1';
    else if ((base || /\b(direnovasi|bagian|hanya|saja)\b/.test(t)) && /\blantai\s*2\b/.test(t)) ctx.renovationScope = 'lantai 2';
    else {
      // Bagian bernama yang disebut sesudah kata renovasi ("renovasi
      // dapur dan kamar mandi") — dicatat apa adanya sebagai cakupan.
      const named = raw.toLowerCase().match(/\brenovasi\s+([a-z][a-z &]{2,40}?)(?=\s*(?:,|\.|$|saja\b|total\b))/);
      if (named && !/^(rumah|gedung|bangunan|kantor|sekolah)\b/.test(named[1].trim())) {
        ctx.renovationScope = named[1].trim();
      }
    }
  }

  // --- Tipe drainase dari subtipe katalog (dipakai ulang) ---
  const sub = detectSubtypeFromText('drainase', raw);
  if (sub) ctx.drainageType = sub.label;
  else if (/\bsaluran beton terbuka\b/.test(t)) ctx.drainageType = 'Saluran beton terbuka';

  // --- Item lingkup bernama pada teks ("dengan taman, pagar, dan
  // drainase" / "tambahkan pagar keliling dan area parkir") ---
  for (const d of cls.secondary) {
    if (!ctx.scopeConfirmed.some((s) => s.subcategoryId === d.id)) {
      ctx.scopeConfirmed.push({ label: d.label, subcategoryId: d.id, status: 'USER_CONFIRMED' });
    }
  }

  // W2 (2026-11-24): pemicu forceGenerate memakai keluarga kata kerja
  // pembuat RAB yang sama dengan router + cabang generate (susun /
  // susunkan / generate / bikinkan) — "langsung susun" sebelumnya tidak
  // memicu sehingga pengguna yang mengetiknya tetap ditanyai.
  if (/\b(langsung buatkan|langsung buat|langsung susun|langsung susunkan|langsung generate|langsung bikinkan|langsung saja|buatkan sekarang|susun sekarang|langsung dihitung)\b/.test(t)) {
    ctx.forceGenerate = true;
  }

  // --- Riwayat koreksi field tunggal (Fase 3): mengubah satu field
  // TIDAK mereset konteks lain; nilai lama tercatat sebagai riwayat,
  // dibedakan dari nilai kini. ---
  if (base) {
    const track = (key: string, label: string, before: number | null, after: number | null, unit: string) => {
      if (before != null && after != null && before !== after && !ctx.corrections.some((c) => c.key === key && c.to === `${fmtNum(after)} ${unit}`)) {
        ctx.corrections.push({ key, from: `${label} ${fmtNum(before)} ${unit}`, to: `${fmtNum(after)} ${unit}` });
      }
    };
    track('length', 'Panjang', base.lengthM, ctx.lengthM, 'm');
    track('width', 'Lebar', base.widthM, ctx.widthM, 'm');
    track('span', 'Bentang', base.spanM, ctx.spanM, 'm');
    track('height', 'Tinggi', base.heightM, ctx.heightM, 'm');
    track('landArea', 'Luas lahan', base.landAreaM2, ctx.landAreaM2, 'm²');
    track('buildingArea', 'Luas bangunan', base.buildingAreaM2, ctx.buildingAreaM2, 'm²');
    track('floors', 'Lantai', base.floors, ctx.floors, 'lantai');
  }

  ctx.combinedText = base?.combinedText ? `${base.combinedText} ${raw}` : raw;
  // FASE 4 (CHAT-03) — sinkronisasi akhir: bila ada model multi-gedung,
  // `floors` tunggal (warisan) adalah lantai bangunan UTAMA (pertama),
  // bukan penyebutan "N lantai" TERAKHIR pada teks ("gedung A 3 lantai
  // dan gedung B 2 lantai" sebelumnya runtuh jadi 2).
  if (ctx.buildings.length > 0 && ctx.buildings[0].floors != null) {
    ctx.floors = ctx.buildings[0].floors;
  }
  refreshUniversalFacts(ctx);
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Paket pekerjaan SARAN per keluarga (SUGGESTION_ONLY — struktur      */
/* usulan umum disiplin, BUKAN cakupan terkonfirmasi dan BUKAN hasil   */
/* hitung; susunan final mengikuti template katalog saat generate).    */
/* ------------------------------------------------------------------ */

const FAMILY_PACKAGES: Record<UniversalFamily, string[]> = {
  building: ['Pekerjaan persiapan', 'Pekerjaan tanah & pondasi', 'Pekerjaan struktur', 'Pekerjaan arsitektur & finishing', 'Pekerjaan MEP', 'Pekerjaan luar & utilitas pendukung'],
  civil: ['Pekerjaan persiapan', 'Pekerjaan tanah', 'Pekerjaan struktur utama pekerjaan sipil', 'Pekerjaan pelengkap & perlengkapan', 'Pekerjaan utilitas pendukung'],
  landscape: ['Pekerjaan persiapan & pembersihan lahan', 'Pekerjaan tanah dan pembentukan kontur', 'Pekerjaan hardscape', 'Pekerjaan landscape dan vegetasi', 'Pekerjaan utilitas pendukung'],
  mep: ['Pekerjaan persiapan & pengadaan material', 'Pekerjaan instalasi utama', 'Pekerjaan terminasi & panel', 'Pekerjaan pengujian & komisioning'],
  specialized: ['Pekerjaan persiapan', 'Pekerjaan utama sesuai disiplin', 'Pekerjaan pelengkap & finishing terkait'],
};

export function universalSuggestedPackages(ctx: UniversalIntakeContext): string[] {
  if (!ctx.primary) return [];
  const out = [...(FAMILY_PACKAGES[ctx.primary.family] ?? [])];
  for (const d of ctx.secondary) {
    const label = `Paket ${d.label.toLowerCase()} (disiplin tambahan)`;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fakta + provenans + info hilang (§6/§7)                             */
/* ------------------------------------------------------------------ */

export function refreshUniversalFacts(ctx: UniversalIntakeContext): void {
  const facts: IntakeFact[] = [];
  const push = (key: string, label: string, value: string, status: FactStatus) => {
    facts.push({ key, label, value, status });
  };
  if (ctx.primary) {
    push('category', 'Kategori utama', ctx.primary.label, 'USER_CONFIRMED');
    push('family', 'Keluarga pekerjaan', FAMILY_LABELS[ctx.primary.family], 'SYSTEM_DERIVED');
  }
  for (const d of ctx.secondary) {
    push(`secondary-${d.id}`, 'Disiplin tambahan', d.label, 'USER_CONFIRMED');
  }
  if (ctx.location) push('location', 'Lokasi', ctx.location, 'USER_CONFIRMED');
  if (ctx.landAreaM2 != null) {
    const derived = ctx.landAreaOriginal != null && !ctx.landAreaOriginal.includes('m²');
    push('landArea', 'Luas lahan/area', `${fmtNum(ctx.landAreaM2)} m²${derived ? ` (dari "${ctx.landAreaOriginal}")` : ''}`, derived ? 'SYSTEM_DERIVED' : 'USER_CONFIRMED');
  }
  if (ctx.buildingAreaM2 != null) push('buildingArea', 'Luas bangunan', `${fmtNum(ctx.buildingAreaM2)} m²`, 'USER_CONFIRMED');
  if (ctx.dimensionsText) {
    // Adaptive Questionnaire (direktif owner 2026-11-12 §6): dimensi
    // "17 × 9 m" dinyatakan lengkap dengan luas tapaknya (±153 m²)
    // agar pengguna melihat hasil kalinya tanpa harus menghitung —
    // angka adalah perkalian deterministik dari dua sisi yang pengguna
    // sebutkan sendiri, bukan tebakan. Disebut "tapak" (bukan luas
    // bangunan) karena pada bangunan bertingkat luas tapak ≠ luas
    // bangunan total.
    let dimValue = ctx.dimensionsText;
    const dm = ctx.dimensionsText.match(/^([\d.,]+) × ([\d.,]+) m$/);
    if (dm) {
      const a = parseAreaNumber(dm[1]);
      const b = parseAreaNumber(dm[2]);
      if (a != null && b != null && a > 0 && b > 0) {
        dimValue = `${ctx.dimensionsText} (tapak ±${fmtNum(Math.round(a * b * 100) / 100)} m²)`;
      }
    }
    push('dimensions', 'Dimensi', dimValue, 'USER_CONFIRMED');
  }
  if (ctx.floors != null) push('floors', 'Jumlah lantai', `${ctx.floors}`, 'USER_CONFIRMED');
  for (const a of ctx.floorFunctions) {
    push(`floorFunction-${a.floor}`, 'Fungsi per lantai', `Lantai ${a.floor} (${a.floorLabel}): ${a.functionLabel}`, 'USER_CONFIRMED');
  }
  // FASE 4 (CHAT-03) — bangunan per bangunan: satu fakta per bangunan
  // (lantai + fungsi per lantai bangunan itu), bukan satu angka runtuh.
  for (const b of ctx.buildings ?? []) {
    const bits: string[] = [b.floors != null ? `${b.floors} lantai` : 'jumlah lantai belum diketahui'];
    if (b.floorFunctions.length) bits.push(b.floorFunctions.map((f) => `Lt${f.floor}: ${f.functionLabel}`).join(', '));
    if (b.lengthM != null && b.widthM != null) bits.push(`${b.lengthM} m × ${b.widthM} m`);
    if (b.buildingAreaM2 != null) bits.push(`luas ${b.buildingAreaM2} m²`);
    push(`building-${b.id}`, `Bangunan ${b.label}`, bits.join('; '), 'USER_CONFIRMED');
  }
  if (ctx.lengthM != null) {
    const derived = ctx.lengthOriginal != null && /(km|kilometer)/.test(ctx.lengthOriginal);
    push('length', 'Panjang pekerjaan', `${fmtNum(ctx.lengthM)} m${derived ? ` (dari "${ctx.lengthOriginal}")` : ''}`, derived ? 'SYSTEM_DERIVED' : 'USER_CONFIRMED');
  }
  if (ctx.widthM != null) push('width', 'Lebar', `${fmtNum(ctx.widthM)} m`, 'USER_CONFIRMED');
  if (ctx.depthM != null) push('depth', 'Kedalaman', `${fmtNum(ctx.depthM)} m`, 'USER_CONFIRMED');
  if (ctx.heightM != null) push('height', 'Tinggi', `${fmtNum(ctx.heightM)} m`, 'USER_CONFIRMED');
  if (ctx.spanM != null) push('span', 'Bentang', `${fmtNum(ctx.spanM)} m`, 'USER_CONFIRMED');
  if (ctx.volumeM3 != null) push('volume', 'Volume disebut', `${fmtNum(ctx.volumeM3)} m³`, 'USER_CONFIRMED');
  for (const c of ctx.counts) push(`count-${c.unit}-${c.value}`, 'Jumlah disebut', c.original, 'USER_CONFIRMED');
  for (const s of ctx.scopeConfirmed) push(`scope-${s.label}`, 'Cakupan terkonfirmasi', s.label, s.status);
  for (const s of ctx.siteConditions) push(`site-${s}`, 'Kondisi lahan', s, 'USER_CONFIRMED');
  for (const s of ctx.technicalSpecs) push(`spec-${s}`, 'Spek teknis disebut', s, 'USER_CONFIRMED');
  if (ctx.drainageType) push('drainageType', 'Tipe drainase', ctx.drainageType, 'USER_CONFIRMED');
  if (ctx.renovationScope) push('renovationScope', 'Cakupan renovasi', ctx.renovationScope, 'USER_CONFIRMED');
  if (ctx.isNewConstruction != null) {
    push('newConstruction', 'Status bangunan', ctx.isNewConstruction ? 'pembangunan baru' : 'eksisting', 'USER_CONFIRMED');
  }
  if (ctx.materialPreference) push('material', 'Material disebut', ctx.materialPreference, 'USER_PREFERENCE');
  if (ctx.qualityPreference) push('quality', 'Kualitas disebut (belum dirinci)', ctx.qualityPreference, 'USER_PREFERENCE');
  if (ctx.budgetText) push('budget', 'Anggaran disebut', ctx.budgetText, 'USER_CONFIRMED');
  if (budgetCoverageHasData(ctx.budget?.coverage)) {
    push('budgetCoverage', 'Cakupan budget', describeBudgetCoverage(ctx.budget?.coverage), 'USER_CONFIRMED');
  }
  for (const [k, v] of Object.entries(ctx.answers)) {
    push(`answer-${k}`, 'Jawaban kategori', `${k}: ${v}`, 'USER_CONFIRMED');
  }
  if (ctx.renovationScopes.length) {
    push('renovationScopes', 'Bagian renovasi (gabungan)', ctx.renovationScopes.join(', '), 'USER_CONFIRMED');
  }
  for (const c of ctx.corrections) {
    push(`correction-${c.key}-${c.to}`, 'Riwayat koreksi', `${c.from} → ${c.to} (nilai lama bukan nilai kini)`, 'SYSTEM_DERIVED');
  }
  ctx.facts = facts;

  ctx.suggestedPackages = universalSuggestedPackages(ctx);

  // Info kritis hilang — mengikuti definisi pertanyaan (§7): hanya
  // yang berdampak material ke cakupan/kuantitas/metode.
  const missing: string[] = [];
  const unresolved: string[] = [];
  const q = questionDefsFor(ctx);
  for (const def of q) {
    if (!def.isSatisfied(ctx)) {
      if (def.critical) missing.push(def.missingLabel);
      else unresolved.push(def.missingLabel);
    }
  }
  if (!ctx.location) unresolved.push('lokasi proyek');
  if (ctx.qualityPreference && !ctx.materialPreference) {
    unresolved.push(`rincian spesifikasi kualitas "${ctx.qualityPreference}"`);
  }
  ctx.missingCritical = missing;
  ctx.unresolved = unresolved;

  // Tahap internal (§3) — adaptif, bukan urutan kaku.
  if (!ctx.primary) ctx.stage = 'PROJECT_IDENTITY';
  else if (ctx.approvalStatus === 'APPROVED') ctx.stage = 'GENERATION';
  else if (missing.length) {
    const next = q.find((d) => !d.isSatisfied(ctx) && d.critical);
    ctx.stage = next?.stage ?? 'PROJECT_DIMENSIONS';
  } else ctx.stage = 'PROJECT_REVIEW';
}

/* ------------------------------------------------------------------ */
/* Definisi pertanyaan per kategori (§4/§7) — satu pertanyaan fokus    */
/* per giliran; yang tidak esensial untuk draf awal boleh tetap        */
/* UNRESOLVED. `options` hanya berisi pilihan yang didukung katalog    */
/* atau yang DILABELI sebagai pilihan konfirmasi pengguna.             */
/* ------------------------------------------------------------------ */

export interface IntakeQuestion {
  key: string;
  stage: UniversalStage;
  critical: boolean;
  missingLabel: string;
  prompt: (ctx: UniversalIntakeContext) => string;
  options?: Array<{ id: string; label: string }>;
  isSatisfied: (ctx: UniversalIntakeContext) => boolean;
}

const hasAnyMeasure = (ctx: UniversalIntakeContext): boolean =>
  ctx.lengthM != null || ctx.landAreaM2 != null || ctx.buildingAreaM2 != null ||
  ctx.volumeM3 != null || ctx.dimensionsText != null || ctx.counts.length > 0;

/**
 * Definisi pertanyaan intake per subkategori utama (54) + keluarga.
 *
 * HUBUNGAN DENGAN criticalFieldsFor (rabIntentFlow.ts, W6) — TIDAK
 * DI-WIRE (keputusan W2/W10, 2026-11-22; lihat laporan koordinator):
 * kedua tabel memakai kata "kritis" dengan SEMANTIK BERBEDA. Tabel W6
 * menjawab "field apa yang ditanyakan bila basis terukur hilang"
 * (klarifikasi satu-shot; SEMUA field-nya kritis). Flag `critical` di
 * sini menjawab "pertanyaan apa yang memblokir progres ke brief"
 * (multi-giliran; sebagian pertanyaan ukuran SENGAJA non-kritis —
 * "jawab 'itu aja'", nilainya mengikuti template/default — lihat
 * selectNextQuestion: non-kritis hanya diajukan sebagai pertanyaan
 * pertama intake).
 *
 * Divergensi yang DIKETAHUI (dipin perilaku di
 * universalClassification.test.ts §8 — wiring yang mengubahnya harus
 * mengubah pin itu secara sadar + keputusan koordinator):
 * - bridge-width, drainage-dims, renovation-area: non-kritis di sini,
 *   tetapi field-nya ada di tabel W6 (jembatan: span+width; drainase:
 *   length+channelDims; renovasi: area).
 * - Tabel W6 punya field yang TIDAK PUNYA pertanyaan di sini: gudang
 *   clearSpan+height, irigasi channelDims, drainase length, struktur
 *   dimensions+height, pondasi count, sanitasi units.
 * - Pertanyaan kritis NON-ukuran di sini (kandang-type,
 *   building-function, renovation-scope, bridge-type, drainage-type,
 *   new-construction) tidak punya padanan di tabel W6.
 * - Penguncian berbeda: tabel W6 per DISIPLIN/scope (18+4), fungsi ini
 *   per SUBKATEGORI (54); subkategori multi-scope (kolam, gorong-gorong,
 *   dinding-penahan, plumbing) membuat pemetaan disiplinnya ambigu.
 * Wiring yang benar butuh keputusan desain dulu (mis. flag `blocking`
 * per field di tabel W6) — bukan sekadar impor.
 */
function questionDefsFor(ctx: UniversalIntakeContext): IntakeQuestion[] {
  const p = ctx.primary;
  if (!p) return [];
  const defs: IntakeQuestion[] = [];
  const add = (d: IntakeQuestion) => defs.push(d);

  if (ctx.isMulti && p.family === 'building' && p.id !== 'renovasi') {
    add({
      key: 'new-construction', stage: 'PROJECT_IDENTITY', critical: true,
      missingLabel: 'status pembangunan (baru/eksisting)',
      isSatisfied: (c) => c.isNewConstruction != null,
      prompt: (c) => `Apakah bangunan ${labelShort(c)}-nya termasuk **pembangunan baru**, atau renovasi/penambahan atas bangunan eksisting?`,
      options: [
        { id: 'new', label: 'Pembangunan baru' },
        { id: 'existing', label: 'Renovasi / penambahan eksisting' },
      ],
    });
  }

  // --- Pertanyaan khas kategori non-katalog/khusus (Fase 4/6) ---
  if (p.id === 'kandang') {
    add({
      key: 'kandang-size', stage: 'PROJECT_DIMENSIONS', critical: true,
      missingLabel: 'ukuran kandang (dimensi/luas)',
      isSatisfied: (c) => c.dimensionsText != null || c.buildingAreaM2 != null || c.landAreaM2 != null,
      prompt: () => 'Berapa **ukuran kandangnya** — dimensinya (mis. 10 × 25 m) atau luasnya?',
    });
    add({
      key: 'kandang-type', stage: 'TECHNICAL_REQUIREMENTS', critical: true,
      missingLabel: 'tipe kandang (terbuka/tertutup)',
      isSatisfied: (c) => c.answers['kandang-type'] != null,
      prompt: () => 'Kandangnya mau model **terbuka** (postal/umpak, sisi terbuka) atau **tertutup** (closed house)? Itu menentukan struktur, sekat, dan ventilasinya.',
      options: [
        { id: 'kandang-terbuka', label: 'Kandang terbuka' },
        { id: 'kandang-tertutup', label: 'Kandang tertutup' },
      ],
    });
  }
  switch (p.family) {
    case 'building':
      if (p.id === 'bangunan-umum') {
        add({
          key: 'building-function', stage: 'PROJECT_IDENTITY', critical: true,
          missingLabel: 'fungsi bangunan',
          isSatisfied: (c) => c.primary?.id !== 'bangunan-umum',
          prompt: () => 'Bangunannya akan dipakai untuk apa? Misalnya kantor, sekolah, gudang, atau fungsi lainnya — sebutkan fungsinya agar lingkupnya tepat.',
        });
      }
      if (p.id === 'renovasi') {
        add({
          key: 'renovation-scope', stage: 'PROJECT_SCOPE', critical: true,
          missingLabel: 'bagian yang direnovasi',
          isSatisfied: (c) => c.renovationScope != null,
          prompt: (c) => `Bagian mana saja yang ingin direnovasi${c.floors ? ` pada bangunan ${c.floors} lantai ini` : ''}? Misalnya seluruh bangunan, lantai 1, lantai 2, atau hanya bagian tertentu (dapur, kamar mandi, fasad, dan sebagainya).`,
          options: [
            { id: 'renov-all', label: 'Seluruh bangunan' },
            { id: 'renov-l1', label: 'Lantai 1 saja' },
            { id: 'renov-l2', label: 'Lantai 2 saja' },
            { id: 'renov-part', label: 'Bagian tertentu' },
          ],
        });
        add({
          key: 'renovation-area', stage: 'PROJECT_DIMENSIONS', critical: false,
          missingLabel: 'luas area yang direnovasi',
          isSatisfied: (c) => c.buildingAreaM2 != null || c.landAreaM2 != null || c.dimensionsText != null,
          prompt: () => 'Berapa perkiraan luas area yang direnovasi? Bila belum tahu, jawab "itu aja" — luasnya saya tandai belum teresolusi di brief.',
        });
      } else {
        add({
          key: 'building-area', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'luas bangunan total',
          isSatisfied: (c) => c.buildingAreaM2 != null || c.dimensionsText != null,
          prompt: () => 'Berapa perkiraan **luas bangunan total**-nya?',
        });
        if (p.id === 'gudang-industri') {
          // Urutan (Worker C, sprint 2026-11-26): sistem struktur
          // ditanyakan SESUDAH dimensi — sebelumnya blok ini berdiri
          // SEBELUM switch sehingga gudang tanpa dimensi ditanya
          // sistem dulu (dimensi adalah basis kuantitas yang paling
          // memblokir). Prompt tetap menggabungkan sistem + clear
          // height dalam satu giliran: kuesioner/tabel W6 tidak punya
          // pertanyaan clear-height terpisah dan pin §8 melarang
          // pertanyaan clearSpan/height tambahan (intake TIDAK PUNYA
          // pertanyaan itu) — jadi clear height ditangkap sebagai
          // jawaban sukarela pada giliran sistem, bukan pertanyaan
          // sendiri.
          add({
            key: 'warehouse-system', stage: 'TECHNICAL_REQUIREMENTS', critical: false,
            missingLabel: 'sistem struktur gudang (portal frame/truss)',
            isSatisfied: (c) => c.answers['warehouse-system'] != null,
            prompt: () => 'Untuk gudangnya, sistem strukturnya mau **portal frame** (kolom + rafter baja WF) atau **truss/rangka ruang**? Dan berapa **clear height** (tinggi bersih di dalam)-nya? Sebutkan yang sudah ditentukan saja.',
            options: [
              { id: 'wh-portal', label: 'Portal frame baja WF' },
              { id: 'wh-truss', label: 'Truss / rangka ruang' },
            ],
          });
        }
        add({
          key: 'building-floors', stage: 'PROJECT_DIMENSIONS', critical: false,
          missingLabel: 'jumlah lantai',
          isSatisfied: (c) => c.floors != null,
          prompt: () => 'Bangunannya berapa lantai?',
        });
      }
      break;

    case 'civil':
      if (p.id === 'jembatan') {
        add({
          key: 'bridge-span', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'bentang jembatan',
          // PIN REKAYASA (Worker C, sprint 2026-11-26; celah Worker B
          // §7/7.2): PANJANG total BUKAN bentang — panjang yang disebut
          // TIDAK PERNAH memenuhi pertanyaan bentang. Sebelum perbaikan
          // ini, "panjang 20 m" menandai bentang "terjawab" sehingga
          // bentang hilang dari missingCritical + seksi hilang di brief
          // review (jembatan bisa sampai review tanpa bentang dan tanpa
          // prompt). Perilaku tanya-tidak-ulang TIDAK diubah (pin Worker
          // B 1.11: sesudah "panjang 20 m", giliran berikut menanyakan
          // tipe konstruksi, bukan mengulang bentang) — yang diperbaiki
          // adalah kejujuran daftar hilang: bentang yang belum disebut
          // tetap tercatat kritis-hilang sampai benar-benar dijawab.
          isSatisfied: (c) => c.spanM != null,
          prompt: () => 'Berapa **bentang jembatan** yang direncanakan (jarak antar tumpuan, meter) — bukan panjang totalnya?',
        });
        add({
          key: 'bridge-width', stage: 'PROJECT_DIMENSIONS', critical: false,
          missingLabel: 'lebar jembatan',
          isSatisfied: (c) => c.widthM != null,
          prompt: () => 'Berapa lebar jembatannya? Bila belum ditentukan, jawab "itu aja".',
        });
        add({
          key: 'bridge-type', stage: 'TECHNICAL_REQUIREMENTS', critical: true,
          missingLabel: 'tipe konstruksi jembatan (beton/baja/kayu)',
          isSatisfied: (c) => c.answers['bridge-type'] != null || c.materialPreference != null
            || /\b(beton|baja|kayu|bailey)\b/.test(c.combinedText.toLowerCase()),
          prompt: () => 'Jembatannya mau konstruksi **beton**, **baja**, atau **kayu**? Pilihan itu menentukan struktur atas dan pondasinya — kita bahas teknisnya dari situ.',
          options: [
            { id: 'bridge-beton', label: 'Beton' },
            { id: 'bridge-baja', label: 'Baja' },
            { id: 'bridge-kayu', label: 'Kayu' },
          ],
        });
      } else if (p.id === 'drainase') {
        add({
          key: 'drainage-type', stage: 'TECHNICAL_REQUIREMENTS', critical: true,
          missingLabel: 'tipe saluran drainase',
          isSatisfied: (c) => c.drainageType != null,
          prompt: () =>
            'Untuk menentukan lingkup konstruksinya, **saluran seperti apa yang direncanakan?** ' +
            'Pilihan yang template katalognya tersedia: **U-ditch pracetak**, **pasangan batu kali**, **gorong-gorong / box culvert**. ' +
            '**Saluran beton terbuka** juga bisa dipilih — itu pilihan konfirmasi Anda; template terdekat yang dipakai akan dinyatakan terbuka di brief. Atau sebutkan tipe lainnya.',
          options: [
            { id: 'drain-uditch', label: 'U-ditch pracetak' },
            { id: 'drain-batu', label: 'Pasangan batu kali' },
            { id: 'drain-culvert', label: 'Gorong-gorong / box culvert' },
            { id: 'drain-beton-terbuka', label: 'Saluran beton terbuka' },
          ],
        });
        // Panjang saluran (Worker C, sprint 2026-11-26): sebelumnya
        // TIDAK ADA pertanyaan panjang untuk drainase — tipe yang
        // sudah dikenal + panjang yang hilang langsung lolos ke brief
        // tanpa pernah ditanya (panjang adalah basis kuantitas
        // saluran). Urutan: tipe dulu (menentukan lingkup), lalu
        // panjang (kritis), lalu dimensi penampang (non-kritis, pin
        // §8 dipertahankan). Aman untuk pin §8: konteks pin membawa
        // lengthM 500 sehingga pertanyaan ini terpenuhi dan
        // drainage-dims tetap yang pertama diajukan di sana.
        add({
          key: 'drainage-length', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'panjang saluran drainase',
          isSatisfied: (c) => c.lengthM != null,
          prompt: () => 'Berapa **panjang saluran** drainasenya (meter)?',
        });
        add({
          key: 'drainage-dims', stage: 'PROJECT_DIMENSIONS', critical: false,
          missingLabel: 'lebar & kedalaman saluran',
          isSatisfied: (c) => c.widthM != null || c.depthM != null,
          prompt: () => 'Berapa lebar dan kedalaman salurannya? Bila belum ditentukan, jawab "itu aja" — dimensinya mengikuti parameter template dan ditandai di brief.',
        });
      } else if (p.id === 'dinding-penahan') {
        // Urutan DIPERTAHANKAN panjang-dulu (Worker C, sprint 2026-11-26):
        // tinggi-dulu sempat dicoba (tinggi menentukan sistem struktur)
        // tetapi chatUniversalIntake.test.ts mem-pin pertanyaan pertama
        // bare retaining wall adalah panjang ("panjang dinding penahan"
        // harus ada di balasan CLARIFY) — file tes itu bukan milik
        // Worker C, jadi urutan ini tidak diubah. Tinggi tetap
        // non-kritis (pin jalur cepat: retaining + panjang saja tetap
        // draft langsung, §12.13); tinggi ditanyakan sebagai pertanyaan
        // pertama bila panjang sudah diberikan di awal.
        add({
          key: 'retaining-length', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'panjang dinding penahan',
          isSatisfied: (c) => c.lengthM != null,
          prompt: () => 'Berapa **panjang dinding penahan** yang direncanakan (meter)?',
        });
        add({
          key: 'retaining-height', stage: 'PROJECT_DIMENSIONS', critical: false,
          missingLabel: 'tinggi dinding penahan',
          isSatisfied: (c) => c.heightM != null,
          prompt: () => 'Berapa tinggi dinding penahannya? Bila belum ditentukan, jawab "itu aja".',
        });
      } else if (p.id === 'pekerjaan-tanah') {
        add({
          key: 'earthwork-size', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'ukuran pekerjaan tanah (luas/volume)',
          isSatisfied: (c) => hasAnyMeasure(c),
          prompt: () => 'Berapa ukuran pekerjaannya — **luas area** yang dikerjakan atau **volume** galian/urugannya (m³)?',
        });
      } else if (p.id === 'pelindung-pantai') {
        add({
          key: 'coast-length', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'panjang pengaman pantai',
          isSatisfied: (c) => c.lengthM != null,
          prompt: () => 'Berapa **panjang** garis pantai/dermaga yang dikerjakan (meter)?',
        });
      } else if (p.id === 'irigasi' || p.id === 'bendung' || p.id === 'gorong-gorong') {
        add({
          key: 'water-length', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'panjang saluran/bangunan air',
          isSatisfied: (c) => c.lengthM != null || c.landAreaM2 != null,
          prompt: () => `Berapa **panjang** ${p.id === 'bendung' ? 'bendung/bangunan air' : 'saluran'}-nya (meter)?`,
        });
      } else {
        // Jalan (semua varian): panjang & lebar adalah pasangan kritis.
        add({
          key: 'road-length', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'panjang jalan',
          isSatisfied: (c) => c.lengthM != null,
          prompt: () => 'Berapa **panjang jalan** yang direncanakan?',
        });
        add({
          key: 'road-width', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'lebar jalan',
          isSatisfied: (c) => c.widthM != null,
          prompt: () => 'Berapa **lebar jalan** yang direncanakan?',
        });
        add({
          key: 'road-condition', stage: 'SITE_CONDITIONS', critical: false,
          missingLabel: 'kondisi jalan eksisting',
          isSatisfied: (c) => c.siteConditions.length > 0,
          prompt: () => 'Bagaimana kondisi jalan eksistingnya (jalan baru, jalan rusak, peningkatan jalan lama)? Bila tidak ada catatan, jawab "itu aja".',
        });
      }
      break;

    case 'mep': {
      // Batch 3 (§6.1) — pertanyaan kritis MEP mengikuti BASIS UKURAN
      // subsistemnya (mepBasisFor — dari parameter NYATA template
      // katalog), bukan selalu luas. Listrik butuh daya/lantai
      // (template MEP-ELECTRICAL-DIST tidak punya parameter luas —
      // kuesioner lama yang menanyakan luas sebagai kritis untuk
      // listrik adalah inkonsistensi yang dicatat Batch 1), plumbing
      // butuh lantai/unit, data butuh titik; hanya HVAC/fire/mep-umum
      // yang basisnya luas. Kunci pertanyaan memakai kunci kuesioner
      // yang sama bila ada (pola bridge-span: tanpa tanya ganda).
      const basis = mepBasisFor(p.id);
      const powerMentioned = (c: UniversalIntakeContext): boolean =>
        /\b\d[\d.,]*\s*(kva|va|watt|kw)\b/i.test(c.combinedText || '');
      if (basis.criticalQuestionKey === 'mep-power-capacity') {
        add({
          key: 'mep-power-capacity', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'daya listrik terpasang (kVA) atau jumlah lantai',
          isSatisfied: (c) => powerMentioned(c) || c.floors != null || c.counts.length > 0,
          prompt: () => basis.criticalPrompt,
        });
      } else if (basis.criticalQuestionKey === 'mep-floors') {
        add({
          key: 'mep-floors', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'jumlah lantai / unit basah yang dilayani',
          isSatisfied: (c) => c.floors != null || c.counts.length > 0,
          prompt: () => basis.criticalPrompt,
        });
      } else if (basis.criticalQuestionKey === 'mep-points') {
        add({
          key: 'mep-points', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'jumlah titik data',
          isSatisfied: (c) => c.counts.length > 0 || c.floors != null,
          prompt: () => basis.criticalPrompt,
        });
      } else {
        add({
          key: 'mep-area', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'luas bangunan/proyek yang dilayani',
          isSatisfied: (c) => c.buildingAreaM2 != null || c.landAreaM2 != null || c.dimensionsText != null || c.counts.length > 0,
          prompt: (c) => `Berapa **luas bangunan/proyek** yang dilayani ${labelShort(c)} ini? Luas itu yang menjadi basis perhitungan jumlah titik dan panjang instalasinya.`,
        });
      }
      // Pertanyaan lantai sekunder (non-kritis) — tidak ditambahkan
      // bila lantai sudah menjadi pertanyaan kritis (plumbing) agar
      // kunci 'mep-floors' tidak ganda.
      if (basis.criticalQuestionKey !== 'mep-floors') {
        add({
          key: 'mep-floors', stage: 'PROJECT_DIMENSIONS', critical: false,
          missingLabel: 'jumlah lantai bangunan',
          isSatisfied: (c) => c.floors != null,
          prompt: () => 'Bangunannya berapa lantai? Bila tidak relevan, jawab "itu aja".',
        });
      }
      break;
    }

    case 'specialized':
      if (p.id === 'pembongkaran') {
        add({
          key: 'demolition-area', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'luas bangunan yang dibongkar',
          isSatisfied: (c) => c.buildingAreaM2 != null || c.landAreaM2 != null || c.dimensionsText != null,
          prompt: () => 'Berapa **luas bangunan yang dibongkar** (m²)?',
        });
      } else {
        add({
          key: 'specialized-size', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'ukuran pekerjaan (luas/dimensi/jumlah)',
          isSatisfied: (c) => hasAnyMeasure(c) || c.floors != null,
          prompt: (c) => `Berapa ukuran pekerjaannya — luas area ${labelShort(c)}, dimensinya, atau jumlahnya?`,
        });
      }
      break;

    case 'landscape':
      add({
        key: 'site-size', stage: 'PROJECT_DIMENSIONS', critical: true,
        missingLabel: 'ukuran pekerjaan (panjang/luas)',
        isSatisfied: (c) => c.lengthM != null || c.landAreaM2 != null,
        prompt: (c) => `Berapa ukuran ${labelShort(c)}-nya — panjang atau luas areanya?`,
      });
      break;
  }

  // --- Kondisi lahan/tapak generik (Step 3 Magic AI, 2026-11-26) ---
  // Satu pertanyaan lintas kategori, NON-KRITIS (tidak memblokir
  // jalur cepat, tidak masuk missingCritical — hanya `unresolved` di
  // brief bila tak terjawab). Aturan §7 di selectNextQuestion membuat
  // pertanyaan non-kritis HANYA diajukan sebagai pertanyaan pertama
  // intake: def ini baru tercapai bila semua pertanyaan kritis sudah
  // terpenuhi DAN belum ada pertanyaan yang diajukan — sesudah satu
  // pertanyaan terjawab, def ini tidak pernah muncul (askedKeys).
  // Jawaban ditangkap pola SITE_PATTERNS lewat extractProjectContext
  // yang SUDAH dipakai updateUniversalContext (tidak ada duplikasi
  // pola di sini); isSatisfied cukup memeriksa siteConditions.
  // Jalan sudah punya pertanyaan kondisi sendiri ('road-condition',
  // lebih dulu di urutan) — def generik tidak ditambahkan di sana
  // agar kondisi tapak tidak ditanyakan dua kali. Keluarga landscape
  // murni tidak sampai ke sini: gerbang landscape (projectIntakeGate)
  // yang menanyakan kondisi lahannya, dan gerbang universal
  // mengembalikan null untuknya — jadi tidak ada tanya ganda.
  if (!defs.some((d) => d.key === 'road-condition')) {
    add({
      key: 'site-condition', stage: 'SITE_CONDITIONS', critical: false,
      missingLabel: 'kondisi lahan/tapak eksisting',
      isSatisfied: (c) => c.siteConditions.length > 0,
      prompt: () => 'Bagaimana **kondisi lahan/tapaknya** saat ini — misalnya lahan datar, lahan kosong, berkontur/miring, atau ada bangunan eksisting yang perlu dibongkar? Bila tidak ada catatan, jawab "itu aja".',
    });
  }
  return defs;
}

function labelShort(ctx: UniversalIntakeContext): string {
  return (ctx.primary?.label ?? 'pekerjaan ini').toLowerCase();
}

/** Pertanyaan berikutnya yang harus diajukan (null = siap ke brief). */
export function selectNextQuestion(ctx: UniversalIntakeContext): IntakeQuestion | null {
  for (const def of questionDefsFor(ctx)) {
    if (def.isSatisfied(ctx)) continue;
    if (ctx.askedKeys.includes(def.key)) {
      // Pertanyaan yang sudah diajukan tetapi belum terjawab: jangan
      // diulang — kekurangannya dicatat di brief (§7: detail boleh
      // tetap tak teresolusi; untuk yang kritis, brief menyatakannya
      // dan generate dapat menolak secara jujur lewat mesin).
      continue;
    }
    if (!def.critical && ctx.askedKeys.length > 0) {
      // Pertanyaan NON-kritis hanya diajukan sebagai pertanyaan
      // pertama intake; sesudah pengguna menjawab satu pertanyaan,
      // sisanya dicatat sebagai belum teresolusi di brief — bukan
      // diinterogasi satu per satu (§7: satu pertanyaan fokus).
      // PENGECUALIAN — GAP C (2026-11-26, owner requirement: "tanyakan
      // ... clear height untuk gudang", mockup Step 3 di-ACC): prompt
      // `warehouse-system` menggabungkan sistem struktur + clear height
      // dalam SATU giliran, dan itulah satu-satunya tempat clear height
      // ditanyakan (TIDAK ADA pertanyaan clear-height terpisah — pin §8
      // dipertahankan). Tanpa pengecualian ini, alur bare-chip (luas
      // dijawab di dalam intake) tidak pernah menanyakan clear height
      // sama sekali: luas → kuesioner (atap/lantai/dock, tanpa clear
      // height) → brief. Pengecualian ini HANYA mengizinkan kunci
      // warehouse-system diajukan sesudah satu jawaban; urutan
      // (luas dulu, baru sistem) dan aturan tanya-sekali tetap utuh.
      if (def.key !== 'warehouse-system') continue;
    }
    return def;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Brief proyek (§8) — ringkasan transparan sebelum generate.          */
/* ------------------------------------------------------------------ */

export function buildUniversalBriefLines(ctx: UniversalIntakeContext): string[] {
  refreshUniversalFacts(ctx);
  const lines: string[] = [];
  lines.push('**Brief proyek — periksa dulu sebelum RAB disusun:**');
  lines.push('');
  lines.push('**Proyek**');
  if (ctx.primary) {
    lines.push(`• Kategori utama: ${ctx.primary.label} (${FAMILY_LABELS[ctx.primary.family]})`);
  }
  if (ctx.secondary.length) {
    lines.push(`• Disiplin tambahan (dipisahkan, tidak tercampur): ${ctx.secondary.map((d) => d.label).join('; ')}`);
  }
  if (ctx.isNewConstruction != null) {
    lines.push(`• Status: ${ctx.isNewConstruction ? 'pembangunan baru' : 'atas bangunan eksisting'}`);
  }
  const dimFacts = ctx.facts.filter((f) => ['landArea', 'buildingArea', 'dimensions', 'floors', 'length', 'width', 'depth', 'height', 'span', 'volume', 'location'].includes(f.key) || f.key.startsWith('count-'));
  if (dimFacts.length) {
    lines.push('');
    lines.push('**Dimensi & lokasi yang terkonfirmasi**');
    for (const f of dimFacts) {
      lines.push(`• ${f.label}: ${f.value}${f.status === 'SYSTEM_DERIVED' ? ' — konversi satuan sistem, nilai asli dipertahankan' : ''}`);
    }
  }
  // GATE 2 (5B): bangunan per gedung — fakta per gedung hidup di
  // ctx.facts dengan kunci `building-<id>` (refreshUniversalFacts)
  // tetapi filter dimFacts di atas tidak menampilkannya; brief
  // menampilkan model gedung langsung agar kedua gedung terlihat
  // terpisah sebelum generate (bukti E2E Gate 2).
  if (ctx.buildings.length) {
    lines.push('');
    lines.push('**Bangunan (per bangunan)**');
    // buildingSummaryLines[0] adalah headernya sendiri (sudah dipunyai
    // brief di atas) dan baris sisanya SUDAH berbullet — jangan
    // dibullet ulang (verifikasi visual E2E Gate 2: bullet ganda
    // "• • Gedung A" + header duplikat).
    for (const line of buildingSummaryLines(ctx.buildings).slice(1)) lines.push(line);
  }
  // GATE 4 (5D): spek dari DED — label [DED]/[ASUMSI] terbedakan dari
  // dimensi terkonfirmasi user di atas; konflik DED vs user (>10%)
  // ditampilkan dengan kedua angka (tidak dipilih diam-diam).
  if ((ctx.dedSpecs ?? []).length > 0) {
    lines.push('');
    lines.push('**Data dari DED**');
    for (const s of ctx.dedSpecs) {
      const tag = s.status === 'ASSUMPTION' ? '[ASUMSI]' : '[DED]';
      const val = typeof s.value === 'number' ? fmtNum(s.value) : String(s.value ?? '—');
      lines.push(`• ${tag} ${s.label}: ${val}${s.unit ? ` ${s.unit}` : ''}${s.status === 'ASSUMPTION' ? ' — asumsi, belum dikonfirmasi' : ''}${s.provenance ? ` — ${s.provenance}` : ''}`);
    }
    // Dimensi user lewat dimsFromIntakeContext (fallback gedung
    // tunggal — dimensi "gedung 12 x 8 m" hidup di ctx.buildings[0],
    // bukan di medan tingkat proyek; tanpa fallback konflik tidak
    // pernah terdeteksi di brief).
    const userDims = dimsFromIntakeContext(ctx);
    const conflicts = detectDedSpecConflicts(ctx.dedSpecs, {
      lengthM: userDims.lengthM,
      widthM: userDims.widthM,
      heightM: userDims.heightM,
      buildingAreaM2: userDims.buildingAreaM2,
    });
    for (const c of conflicts) {
      lines.push(`• [KONFLIK] ${c.label}: DED ${fmtNum(c.dedValue)}${c.dedUnit ? ` ${c.dedUnit}` : ''} vs Anda ${fmtNum(c.userValue)} ${c.userUnit} (selisih ${(c.diffRatio * 100).toFixed(0)}%) — perlu keputusan Anda.`);
    }
  }
  if (ctx.scopeConfirmed.length) {
    lines.push('');
    lines.push('**Cakupan terkonfirmasi**');
    for (const s of ctx.scopeConfirmed) lines.push(`• ${s.label}`);
  }
  const specFacts = ctx.facts.filter((f) => f.key.startsWith('spec-') || f.key === 'drainageType' || f.key === 'renovationScope');
  if (specFacts.length || ctx.siteConditions.length) {
    lines.push('');
    lines.push('**Spek teknis & kondisi**');
    for (const f of specFacts) lines.push(`• ${f.label}: ${f.value}`);
    for (const s of ctx.siteConditions) lines.push(`• Kondisi lahan: ${s}`);
  }
  const prefFacts = ctx.facts.filter((f) => f.status === 'USER_PREFERENCE');
  if (prefFacts.length) {
    lines.push('');
    lines.push('**Preferensi Anda**');
    for (const f of prefFacts) lines.push(`• ${f.label}: ${f.value}`);
  }
  if (ctx.budget) {
    lines.push('');
    lines.push('**Anggaran (konteks persisten)**');
    lines.push(`• Budget: Rp${fmtNum(ctx.budget.amount)} — ${BUDGET_KIND_LABELS[ctx.budget.kind]}${ctx.budget.kind === 'MAXIMUM' ? '; budget dipakai sebagai pembanding batas, bukan target yang dipaksa habis' : ''}`);
    const covDesc = describeBudgetCoverage(ctx.budget.coverage);
    if (covDesc) {
      lines.push(`• Cakupan budget: ${covDesc} — total RAB dibandingkan terhadap budget DENGAN cakupan ini, bukan terhadap biaya konstruksi murni.`);
    }
    for (const h of ctx.budgetHistory) {
      lines.push(`• Riwayat: sebelumnya Rp${fmtNum(h.amount)} (${h.kind}) — bukan nilai kini`);
    }
  }
  if (ctx.floorFunctions.length) {
    lines.push('');
    lines.push('**Fungsi per lantai**');
    for (const a of ctx.floorFunctions) lines.push(`• Lantai ${a.floor}: ${a.functionLabel}`);
  }
  if (ctx.corrections.length) {
    lines.push('');
    lines.push('**Riwayat koreksi (nilai lama bukan nilai kini)**');
    for (const c of ctx.corrections) lines.push(`• ${c.from} → ${c.to}`);
  }
  const answerFacts = ctx.facts.filter((f) => f.key.startsWith('answer-'));
  if (answerFacts.length) {
    lines.push('');
    lines.push('**Jawaban kategori**');
    for (const f of answerFacts) lines.push(`• ${f.value}`);
  }
  if (ctx.renovationScopes.length) {
    lines.push('');
    lines.push(`**Bagian renovasi (scope gabungan):** ${ctx.renovationScopes.join(', ')}`);
  }
  lines.push(...conceptualWbsLines(ctx.primary?.id));
  if (ctx.suggestedPackages.length) {
    lines.push('');
    lines.push('**Paket pekerjaan yang DISARANKAN** (saran struktur saja — belum terkonfirmasi, susunan final mengikuti template katalog saat generate):');
    ctx.suggestedPackages.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  }
  if (ctx.scopeRemoved.length) {
    lines.push('');
    lines.push(`**Dihapus atas permintaan Anda:** ${ctx.scopeRemoved.join('; ')}`);
  }
  lines.push('');
  lines.push('**Info yang masih hilang / belum teresolusi**');
  if (ctx.missingCritical.length) {
    for (const m of ctx.missingCritical) lines.push(`• (kritis) ${m} — draft dapat gagal disusun atau memakai parameter template untuk bagian ini; dinyatakan terbuka pada draft.`);
  }
  if (ctx.unresolved.length) {
    for (const u of ctx.unresolved) lines.push(`• ${u}`);
  }
  if (!ctx.missingCritical.length && !ctx.unresolved.length) {
    lines.push('• Tidak ada kekurangan inti. Harga per item tetap mengikuti status provenans pada draft (resmi/estimasi/belum tersedia).');
  }
  lines.push('');
  lines.push('**Cakupan katalog & batasnya**');
  const defs = [ctx.primary, ...ctx.secondary].filter((d): d is SubcategoryDef => d != null);
  for (const d of defs) {
    const cov = coverageFor(d);
    if (cov.support === 'didukung') {
      lines.push(`• ${d.label}: didukung ${cov.specificTemplateCount} template khusus (mis. ${cov.sampleTemplates.join('; ')}).`);
    } else if (cov.support === 'sebagian') {
      lines.push(`• ${d.label}: didukung SEBAGIAN — katalog punya ${cov.categoryTemplateCount} template pada kategorinya, tetapi belum ada template khusus subkategori ini; template terdekat dipakai dan dinyatakan pada draft.`);
    } else {
      lines.push(`• ${d.label}: **belum ada template katalog** untuk subkategori ini — bagian ini TIDAK dikarang; susun manual lewat RAB & Estimasi atau nyatakan sebagai item non-AHSP saat menyusun.`);
    }
  }
  lines.push('');
  lines.push(
    'Klik **"Susun draft RAB"** untuk menyusun draft dari brief ini memakai engine katalog EZRAB, ' +
      'atau koreksi / tambah / hapus cakupan dulu lewat chat — konteksnya tidak hilang.'
  );
  return lines;
}

/* ------------------------------------------------------------------ */
/* Penambahan & penghapusan cakupan pada giliran lanjutan (§5 G + §8)  */
/* ------------------------------------------------------------------ */

/** Frasa penghapusan cakupan: "hapus pagar", "tidak jadi drainase", "batalkan area parkir". */
export function parseScopeRemoval(text: string): string | null {
  const t = (text || '').toLowerCase();
  const m = t.match(/\b(?:hapus|hilangkan|tidak jadi|nggak jadi|batalkan|hilangkan saja|buang)\s+(?:pekerjaan\s+|bagian\s+)?([a-z0-9 &/]{3,40}?)(?=\s*(?:,|\.|$|nya\b|itu\b|saja\b|ya\b))/);
  return m ? m[1].trim() : null;
}

/* ------------------------------------------------------------------ */
/* Serialisasi konteks untuk persistensi (Adaptive Questionnaire       */
/* 2026-11-12) — dipakai lapisan persistensi (draftPersistence) agar   */
/* konteks intake (termasuk keadaan kuesioner) selamat dari muat       */
/* ulang. SubcategoryDef memuat RegExp sehingga TIDAK diserialisasi;   */
/* hanya id-nya yang disimpan dan def direhidrasi dari taksonomi.      */
/* Fail-closed: id tak dikenal / bentuk tak sah → null, tanpa migrasi  */
/* tebakan. Fakta turunan (facts/missing/unresolved) tidak disimpan —  */
/* dihitung ulang oleh refreshUniversalFacts saat rehidrasi.           */
/* ------------------------------------------------------------------ */

export const INTAKE_CONTEXT_SERIAL_VERSION = 2;

/**
 * Versi serial yang DITERIMA rehidrasi: 1 (migrasi — lihat
 * rehydrate) dan 2 (saat ini). Versi lain → null (fail-closed).
 */
export type IntakeContextSerialVersion = 1 | typeof INTAKE_CONTEXT_SERIAL_VERSION;

export interface SerializedUniversalIntakeContext {
  version: IntakeContextSerialVersion;
  primaryId: string | null;
  secondaryIds: string[];
  /** Spek terstruktur v2 (diderivasi saat serialize; v1 tidak punya). */
  structuredSpecs?: StructuredSpec[];
  data: Record<string, unknown>;
}

export function serializeUniversalIntakeContext(ctx: UniversalIntakeContext): SerializedUniversalIntakeContext {
  const { primary, secondary, facts, suggestedPackages, missingCritical, unresolved, structuredSpecs, ...rest } =
    ctx as unknown as Record<string, unknown> & UniversalIntakeContext;
  void primary; void secondary; void facts; void suggestedPackages; void missingCritical; void unresolved;
  // Medan konteks `structuredSpecs` SENGAJA dibuang dari `data`:
  // yang disimpan adalah hasil derivasi segar dari jawaban kanonis
  // (jawaban menang atas salinan basi), di medan top-level.
  void structuredSpecs;
  return {
    version: INTAKE_CONTEXT_SERIAL_VERSION,
    primaryId: ctx.primary?.id ?? null,
    secondaryIds: ctx.secondary.map((d) => d.id),
    structuredSpecs: JSON.parse(JSON.stringify(deriveStructuredSpecs(ctx))) as StructuredSpec[],
    data: JSON.parse(JSON.stringify(rest)) as Record<string, unknown>,
  };
}

export function rehydrateUniversalIntakeContext(
  raw: SerializedUniversalIntakeContext | null | undefined,
): UniversalIntakeContext | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.version !== 1 && raw.version !== INTAKE_CONTEXT_SERIAL_VERSION) return null;
  if (!raw.data || typeof raw.data !== 'object' || Array.isArray(raw.data)) return null;
  const primary = raw.primaryId == null ? null : subcategoryById(raw.primaryId);
  if (raw.primaryId != null && !primary) return null; // id tak dikenal — fail-closed
  const secondary: SubcategoryDef[] = [];
  for (const id of raw.secondaryIds ?? []) {
    const def = subcategoryById(id);
    if (!def) return null;
    secondary.push(def);
  }
  const data = raw.data as Partial<UniversalIntakeContext>;
  if (data.intent !== undefined && data.intent !== 'CREATE_RAB') return null;
  const ctx: UniversalIntakeContext = {
    ...emptyUniversalIntake(),
    ...(data as UniversalIntakeContext),
    primary,
    secondary,
    questionnaire: {
      ...emptyQuestionnaireState(),
      ...(data.questionnaire ?? {}),
      presentedKeys: [...(data.questionnaire?.presentedKeys ?? [])],
      answers: { ...(data.questionnaire?.answers ?? {}) },
    },
  };
  // --- Spek terstruktur v2 ---
  // v2 + structuredSpecs ADA: pakai bila VALID; bila TIDAK valid,
  // buang medan itu (set []) dan konteks TETAP HIDUP — jawaban kanonis
  // utuh di data, dan jalur draft menderivasi ulang dari jawaban.
  // v2 TANPA structuredSpecs, dan v1 (MIGRASI): derivasi dari jawaban
  // (sumber kanonis) — konteks hasil migrasi diperlakukan sebagai v2
  // pada penyimpanan berikutnya (serialize selalu menulis v2).
  // Validasi lain (primaryId/secondaryIds/intent) TIDAK berubah.
  if (raw.version === INTAKE_CONTEXT_SERIAL_VERSION && raw.structuredSpecs !== undefined) {
    ctx.structuredSpecs = validateStructuredSpecs(raw.structuredSpecs) ?? [];
  } else {
    ctx.structuredSpecs = deriveStructuredSpecs(ctx);
  }
  // GATE 4 (5D) — spek DED: hanya entri sah bersumber 'DED' yang
  // dipertahankan; entri rusak dibuang PER ENTRI (bukan fail-closed
  // seluruh konteks — jawaban kanonis + spek DED yang sah tetap hidup).
  ctx.dedSpecs = (ctx.dedSpecs ?? []).filter((s) => isValidDedSpec(s));
  refreshUniversalFacts(ctx);
  return ctx;
}

/** Cocokkan frasa hapus ke subkategori/butir cakupan pada konteks. */
export function matchRemovable(ctx: UniversalIntakeContext, phrase: string): SubcategoryDef | ScopeItem | null {
  const p = ` ${phrase.toLowerCase()} `;
  for (const d of [...ctx.secondary]) {
    if (d.detect.test(p)) return d;
  }
  for (const s of ctx.scopeConfirmed) {
    if (s.subcategoryId) {
      const d = subcategoryById(s.subcategoryId);
      if (d && d.detect.test(p)) return s;
    }
    if (s.label.toLowerCase().split(' ')[0] && p.includes(s.label.toLowerCase().split(' ')[0])) return s;
  }
  for (const d of SUBCATEGORIES) {
    if (d.detect.test(p) && (ctx.secondary.some((x) => x.id === d.id) || ctx.scopeConfirmed.some((s) => s.subcategoryId === d.id))) {
      return d;
    }
  }
  return null;
}
