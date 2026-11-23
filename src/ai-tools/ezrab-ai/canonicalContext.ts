/**
 * canonicalContext.ts — CONTEXT BUILDER KANONIS (AI Intelligence Overhaul
 * Fase 1 — Canonical Context Intelligence, direktif owner 2026-11-12).
 *
 * SATU-SATUNYA perakit konteks prompt Chat AI. Dipakai `EzrabAiService`
 * (jalur kanonis) DAN `coAssistantService` (Copilot) — jangan ada perakit
 * kedua. Modul ini MURNI (fungsi tanpa efek samping, tanpa singleton,
 * tanpa impor runtime berat selain formatProjectSummary + ringkasan
 * ekstraktif); ia TIDAK memanggil provider dan TIDAK mengubah state.
 *
 * Prinsip anggaran (karakter sebagai proksi token; gateway menolak
 * prompt > 20.000 dan systemPrompt > 20.000 — api/_lib/security.js;
 * batas systemPrompt dinaikkan 16.000 → 20.000 pada re-baseline
 * prompt v2.3.0, 2026-11-19):
 *   TOTAL_PROMPT_BUDGET = 16.000 karakter untuk SELURUH field `prompt`
 *   (blok data + seksi alat + aturan bahasa). `reservedChars` adalah
 *   panjang seksi alat yang dihitung pemanggil, sehingga blok data
 *   tidak pernah mendorong total melewati cap — headroom di bawah
 *   batas gateway 20.000 adalah 4.000 karakter.
 * Anggaran 16.000 ini adalah budget INTERNAL builder (field `prompt`),
 * TERPISAH dari batas gateway systemPrompt 20.000 — kenaikan batas
 * gateway TIDAK menaikkan anggaran ini (dan sebaliknya).
 * Prioritas anggaran: FAKTA PROYEK > OBJEKTIF > DRAFT > MEMORI >
 * DED/QTO > RINGKASAN > RIWAYAT (P3A/G2-F1: DED/QTO dicadangkan
 * SEBELUM ringkasan — keduanya data faktual yang tidak boleh kelaparan
 * oleh ringkasan yang kompresibel). Seksi AKUN (Fase B) berada DI LUAR
 * rantai ini: cap keras formatter 1.200, biayanya diserap anggaran
 * riwayat lewat probe overhead (lihat CANONICAL_ACCOUNT_BUDGET).
 * Fakta TIDAK
 * PERNAH hilang diam-diam karena budget riwayat: bila budget terpotong,
 * yang terpotong adalah riwayat terlama/terlemah relevansinya, dan
 * pemotongan itu tercatat di `report.truncations` + ditandai di prompt.
 *
 * ARS-07 — dua cacat yang ditutup di sini (terbukti oleh suite P1):
 *  (a) pesan terakhir dikirim DUA KALI (sekali di riwayat, sekali lagi
 *      sebagai `PENGGUNA (terakhir)`); kini pesan terakhir HANYA ada
 *      sekali — sebagai baris terakhir RIWAYAT di dalam blok DATA
 *      (pin warisan chatCalcDeterministic menuntut pesan pengguna tetap
 *      di dalam blok data berlabel; pengulangan di luar blok dihapus).
 *  (b) blok konteks proyek TANPA cap karakter; kini FAKTA PROYEK ber-cap
 *      sendiri (FACTS_BUDGET) dan dipotong berpenanda, bukan tanpa batas.
 *
 * Scoping: builder selalu terikat projectId (+ conversationId bila ada).
 * Snapshot yang projectId-nya tidak cocok dengan scope DITOLAK tegas
 * (throw) — tidak ada kontaminasi lintas proyek. Identitas pengguna:
 * hari ini tanpa identitas (AUTH_ENABLED=false); userId null dicatat
 * sebagai 'anonymous-tanpa-identitas' di laporan, BUKAN dikarang.
 */

import { formatProjectSummary, type ProjectSnapshot } from './projectContext';
import type { StructuredSpec } from './structuredSpec';
import type { UniversalIntakeContext } from './universalIntake';
/* Type-only: RabIntentSpec (jalur rumah) — formatRabIntentSpecLines di
   bawah hanya membaca field-nya; tidak ada impor runtime. */
import type { RabIntentSpec } from './rabIntentSpec';
import {
  buildExtractiveSummary,
  normalizeForDedupe,
  type ConversationSummary,
} from './conversationSummary';
import { RESPONSE_LANGUAGE_RULE } from './prompt';
import {
  MEMORY_SECTION_BUDGET,
  type MemoryRetrievalReport,
} from './memory';
import { buildingSummaryLines } from './multiBuilding';
import {
  describeModeForContext,
  modeFromLegacy,
  type DedEstimationPolicy,
  type DedRabAiMode,
} from '../ded-ai-estimate/dedMode';

/* ------------------------------------------------------------------ */
/* Anggaran (karakter)                                                 */
/* ------------------------------------------------------------------ */

/** Cap total field `prompt` yang dirakit builder + pemanggil. */
export const CANONICAL_TOTAL_PROMPT_BUDGET = 16_000;
/** Cap seksi FAKTA PROYEK (tidak pernah dihapus utuh; dipotong berpenanda). */
export const CANONICAL_FACTS_BUDGET = 4_000;
/** Cap seksi OBJEKTIF TUGAS Fase 3. */
export const CANONICAL_OBJECTIVE_BUDGET = 800;
/** Cap seksi DRAFT AKTIF. */
export const CANONICAL_DRAFT_BUDGET = 800;
/** Cap seksi RINGKASAN PERCAKAPAN. */
export const CANONICAL_SUMMARY_BUDGET = 2_000;
/** Cap atas seksi RIWAYAT (anggaran dinamis = sisa setelah fakta+ringkasan). */
export const CANONICAL_HISTORY_MAX_BUDGET = 8_000;
/** Maks pesan riwayat yang dipertimbangkan (warisan service.ts). */
export const CANONICAL_MAX_HISTORY_MESSAGES = 20;
/** Batas retrieval eksplisit: maks pesan relevan yang dikirim mentah. */
export const CANONICAL_MAX_RETRIEVED_MESSAGES = 12;
/** Jendela pesan terbaru yang selalu dikirim mentah (di luar ringkasan). */
export const CANONICAL_SUMMARY_RECENT_WINDOW = 10;
/** Cap per pesan riwayat (warisan) / pesan terakhir. */
export const CANONICAL_MESSAGE_CAP = 3_000;
export const CANONICAL_LAST_MESSAGE_CAP = 6_000;
/** FASE 5 — cap seksi PEMAHAMAN DED dan PEMERIKSAAN QTO (karakter). */
export const CANONICAL_DED_BUDGET = 800;
export const CANONICAL_QTO_BUDGET = 800;
/**
 * FASE B (Full Account Intelligence) — cap keras seksi AKUN &
 * LANGGANAN (karakter). Seksi ini ringkas by design (target < 1.000
 * karakter dari formatter accountContext.ts); cap 1.200 memberi ruang
 * untuk baris undangan/order tambahan.
 *
 * BUKAN reservasi rantai: seksi akun TIDAK dicadangkan lewat rantai
 * fakta→ringkasan. Di kondisi produksi saat ini rantai memberi seksi
 * sesudah memori anggaran 0 (reservedChars 9.002 vs struktural 7.100 —
 * DED/QTO sudah menjadi korban yang sama; suite P3A merah 3/11 di HEAD
 * karena ini), sehingga reservasi rantai hanya akan menghasilkan
 * penanda terpotong. Sebagai gantinya, seksi akun dibatasi formatter
 * (cap keras ini) dan biayanya diserap anggaran RIWAYAT lewat probe
 * overhead §4 (baris akun masuk headLines yang diukur probe) —
 * mekanisme yang sama dengan pesan terakhir yang selalu ikut utuh.
 * Total tetap ≤ 16.000 karena historyBudget = dataBudget −
 * probeBlockLength; service.ts tetap fail-closed CONTEXT_BUDGET_EXCEEDED
 * bila pesan terakhir saja mendorong total melewati cap (pin S9).
 */
export const CANONICAL_ACCOUNT_BUDGET = 1_200;

/* ------------------------------------------------------------------ */
/* Tipe                                                                */
/* ------------------------------------------------------------------ */

export interface CanonicalMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CanonicalDraftSummary {
  title: string;
  version?: number;
  partCount?: number;
  itemCount?: number;
  warnings?: string[];
}

export interface CanonicalContextInput {
  /** userId bila ada. Hari ini selalu null (tanpa identitas) — nyatakan, jangan karang. */
  userId?: string | null;
  /** Scope proyek — wajib bila ada fakta proyek; snapshot yang tak cocok DITOLAK. */
  projectId?: string | null;
  conversationId?: string | null;
  messages: CanonicalMessage[];
  projectSnapshot?: ProjectSnapshot | null;
  /** Fallback teks bebas (warisan) — hanya bila tanpa snapshot. */
  projectSummaryText?: string | null;
  intakeContext?: UniversalIntakeContext | null;
  /**
   * W11 §11 (celah S1-4) — spek intent-first jalur RUMAH
   * (RabIntentSpec). Sebelum W11, spek ini tidak pernah masuk konteks
   * kanonis LLM (hanya UniversalIntakeContext) sehingga model
   * kehilangan kamar/atap/pondasi/kualitas/eksklusi rumah di giliran
   * lanjutan. Baris-barisnya masuk seksi FAKTA PROYEK (anggaran 4.000
   * yang sama — dipotong per baris seperti fakta lain, total tetap
   * ≤ 16.000; tanpa spek, perilaku persis seperti sebelumnya).
   * PEMANGGIL: service.ts belum meneruskan field ini (di luar wilayah
   * W11) — wiring view submit → request.rabIntentSpec → service.ts
   * adalah tindak lanjut koordinator; builder ini sudah siap.
   */
  rabIntentSpec?: RabIntentSpec | null;
  structuredSpecs?: StructuredSpec[] | null;
  draftSummary?: CanonicalDraftSummary | null;
  /** Ringkasan tersimpan per conversationId (dari store percakapan). */
  storedSummary?: ConversationSummary | null;
  /**
   * FASE 2 — seksi MEMORI terstruktur (sudah diformat + di-retrieval
   * oleh pemanggil lewat memory.ts: `formatMemorySection`). Builder
   * TIDAK membaca store memori sendiri — ia hanya menempelkan seksi
   * yang diteruskan, dengan cap sendiri, di dalam blok DATA. Null =
   * tidak ada memori relevan / personalisasi nonaktif.
   */
  memorySection?: string | null;
  /** Laporan retrieval memori pemanggil (observabilitas per lapis). */
  memoryReport?: MemoryRetrievalReport | null;
  /**
   * FASE 3 — seksi OBJEKTIF TUGAS (sudah diformat oleh
   * agentOrchestrator.formatObjectiveSection). Builder hanya menempelkan,
   * dengan cap sendiri, di dalam blok DATA. Null = tanpa objektif.
   */
  objectiveSection?: string | null;
  /** Panjang seksi di luar blok data (alat + aturan) — dihitung pemanggil. */
  reservedChars?: number;
  /**
   * FASE 5 — seksi PEMAHAMAN DED (sudah diformat pemanggil lewat
   * dedUnderstanding.buildDedSection) dan PEMERIKSAAN QTO (sudah
   * diformat pemanggil lewat qtoBridge.buildQtoSection). Builder
   * hanya menempelkan dengan cap sendiri, di dalam blok DATA.
   * Null = tidak ada hasil DED/QTO yang di-wire ke permintaan ini.
   */
  dedSection?: string | null;
  qtoSection?: string | null;
  /**
   * DUAL MODE W1 (G-KN-2, aturan §4 A) — mode/policy asal DED yang
   * dibawa dedSection. Opsional: bila salah satu diisi, builder
   * menstempel satu baris mode di kepala seksi DED (sebelum cap 800
   * ditegakkan) agar Chat AI tahu mode asal DED yang dibacanya.
   * Tanpa keduanya, seksi DED dirakit persis seperti sebelumnya
   * (backward compat — pemanggil lama tidak berubah).
   */
  dedMode?: DedRabAiMode | null;
  dedPolicy?: DedEstimationPolicy | null;
  /**
   * FASE B (Full Account Intelligence) — seksi AKUN & LANGGANAN
   * (sudah diformat pemanggil lewat accountContext.formatAccountSection
   * dari snapshot GET /api/credits/account-context). Builder menempelkan
   * dengan cap keras CANONICAL_ACCOUNT_BUDGET, di dalam blok DATA,
   * SESUDAH QTO dan SEBELUM ringkasan. Biayanya diserap anggaran
   * riwayat lewat probe overhead (BUKAN reservasi rantai — lihat
   * komentar CANONICAL_ACCOUNT_BUDGET). Null = tanpa sesi / tanpa
   * konteks akun (perilaku lama: seksi tidak muncul, pin Fase 1 tidak
   * berubah). Isinya HANYA domain server-backed (identitas, workspace,
   * langganan, kredit, pemakaian, order, undangan) — TIDAK ADA data
   * proyek (D1).
   */
  accountSection?: string | null;
}

export interface CanonicalSectionReport {
  chars: number;
  truncated: boolean;
  included: number;
  dropped: number;
}

export interface CanonicalContextReport {
  scope: {
    userId: string | null;
    userIdentity: 'authenticated' | 'anonymous-tanpa-identitas';
    projectId: string | null;
    conversationId: string | null;
  };
  budget: {
    total: number;
    reserved: number;
    data: number;
    facts: number;
    draft: number;
    /** FASE 3 — anggaran seksi OBJEKTIF. */
    objective: number;
    /** FASE 2 — anggaran seksi MEMORI. */
    memory: number;
    /** FASE 5 — anggaran seksi DED dan QTO (0 bila tanpa seksi). */
    ded: number;
    qto: number;
    /** FASE B — cap efektif seksi AKUN (1.200 bila seksi ada, 0 bila tidak);
     *  cap formatter, BUKAN reservasi rantai (biaya diserap riwayat via probe). */
    account: number;
    summary: number;
    history: number;
  };
  sections: {
    facts: CanonicalSectionReport;
    draft: CanonicalSectionReport;
    /** FASE 3 — seksi OBJEKTIF (0 bila tanpa objektif). */
    objective: CanonicalSectionReport;
    /** FASE 2 — seksi MEMORI (0 bila tidak ada memori/personalisi nonaktif). */
    memory: CanonicalSectionReport;
    /** FASE 5 — seksi DED dan QTO (0 bila tanpa hasil yang di-wire). */
    ded: CanonicalSectionReport;
    qto: CanonicalSectionReport;
    /** FASE B — seksi AKUN (0 bila tanpa konteks akun). */
    account: CanonicalSectionReport;
    summary: CanonicalSectionReport;
    history: CanonicalSectionReport;
  };
  /** Panjang blok data (tanpa seksi alat). */
  dataBlockChars: number;
  /** Panjang prompt rakitan penuh (blok data + seksi alat). */
  promptChars: number;
  /** Berapa kali teks pesan terakhir muncul di prompt rakitan (harus 1 bila ada). */
  lastMessageOccurrences: number;
  duplicatesDropped: number;
  truncations: string[];
  summarySource: 'stored' | 'computed' | 'none';
  retrieval: {
    considered: number;
    selected: number;
    droppedForBudget: number;
    droppedDuplicate: number;
    maxRetrieved: number;
    /** FASE 2 — retrieval memori terstruktur (null bila tidak dipakai). */
    memory: MemoryRetrievalReport | null;
  };
  factsPresent: boolean;
}

export interface CanonicalContextResult {
  /** Blok data berlabel (8 seksi kanonis) — satu-satunya konteks yang dikirim. */
  dataBlock: string;
  /** Teks pesan terakhir (permintaan berjalan) — muncul tepat sekali di dataBlock. */
  lastUserText: string;
  report: CanonicalContextReport;
}

/* ------------------------------------------------------------------ */
/* Util                                                                */
/* ------------------------------------------------------------------ */

export function truncateMarked(s: string, cap: number, marker?: string): string {
  if (s.length <= cap) return s;
  return `${s.slice(0, cap)}\n${marker ?? '…[dipotong demi batas konteks — isi lengkap tetap tersimpan di aplikasi]'}`;
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) return n;
    n++;
    from = i + needle.length;
  }
}

const STOPWORDS = new Set([
  'yang', 'dan', 'atau', 'untuk', 'dengan', 'dari', 'saya', 'kamu', 'kami',
  'tolong', 'bisa', 'apa', 'berapa', 'bagaimana', 'ini', 'itu', 'ada', 'tidak',
  'the', 'and', 'for', 'with', 'from', 'what', 'how', 'please', 'can', 'you',
  'are', 'is', 'the', 'a', 'an', 'of', 'to', 'in', 'on',
]);

const MATERIAL_WORDS = new Set([
  'atap', 'pondasi', 'beton', 'baja', 'genteng', 'keramik', 'granit', 'kayu',
  'kaca', 'batu', 'pasir', 'semen', 'cat', 'pipa', 'dak', 'spandek',
  'galvalum', 'plafon', 'dinding', 'lantai', 'kolom', 'sloof', 'balok',
]);

export function tokenize(text: string): string[] {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (w) => w.length >= 3 && !STOPWORDS.has(w),
  );
  return [...new Set(words)];
}

/**
 * Skor relevansi satu pesan riwayat terhadap permintaan berjalan.
 * Relevansi + resensi + otoritas sumber + status konfirmasi:
 *  - overlap token dengan permintaan berjalan (bobot 3/token),
 *  - resensi (posisi kronologis, bobot s.d. 2),
 *  - otoritas: pesan pengguna +1; berangka (dimensi/budget) +1;
 *    menyebut material +1; preview RAB raksasa asisten −2 (fakstanya
 *    sudah diwakili state terstruktur, bukan riwayat mentah).
 */
export function scoreMessageRelevance(
  msg: CanonicalMessage,
  queryTokens: string[],
  index: number,
  total: number,
): number {
  const content = msg.content ?? '';
  const tokens = new Set(tokenize(content));
  let overlap = 0;
  for (const t of queryTokens) if (tokens.has(t)) overlap++;
  const recency = total > 1 ? (index / (total - 1)) * 2 : 2;
  let authority = 0;
  if (msg.role === 'user') authority += 1;
  if (/\d/.test(content)) authority += 1;
  for (const w of MATERIAL_WORDS) {
    if (content.toLowerCase().includes(w)) {
      authority += 1;
      break;
    }
  }
  if (msg.role === 'assistant' && content.length > 1500 && content.includes('Rp')) {
    authority -= 2; // preview RAB raksasa: fakta diwakili state, bukan riwayat
  }
  return overlap * 3 + recency + authority;
}

/* ------------------------------------------------------------------ */
/* Fakta proyek dari state terstruktur                                 */
/* ------------------------------------------------------------------ */

function formatValue(v: StructuredSpec['value'], unit?: string): string {
  if (v === null || v === undefined) return 'belum ditentukan';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'ya' : 'tidak';
  if (typeof v === 'number') return unit ? `${v} ${unit}` : String(v);
  return unit ? `${v} ${unit}` : v;
}

function formatIdr(n: number): string {
  return `Rp${Math.round(n).toLocaleString('id-ID')}`;
}

function formatIntakeLines(ctx: UniversalIntakeContext): string[] {
  const lines: string[] = [];
  const push = (label: string, value: string | null | undefined): void => {
    if (value === null || value === undefined || value === '') return;
    lines.push(`${label}: ${value}`);
  };
  push('Kategori proyek', ctx.primary?.label ?? null);
  if (ctx.secondary?.length) {
    push('Kategori tambahan', ctx.secondary.map((s) => s.label).join(', '));
  }
  push('Nama proyek (intake)', ctx.projectName);
  push('Lokasi', ctx.location);
  if (ctx.landAreaM2 != null) lines.push(`Luas tanah: ${ctx.landAreaM2} m²`);
  if (ctx.buildingAreaM2 != null) lines.push(`Luas bangunan: ${ctx.buildingAreaM2} m²`);
  if (ctx.lengthM != null && ctx.widthM != null) {
    lines.push(`Dimensi tapak: ${ctx.lengthM} m × ${ctx.widthM} m`);
  } else {
    if (ctx.lengthM != null) lines.push(`Panjang: ${ctx.lengthM} m`);
    if (ctx.widthM != null) lines.push(`Lebar: ${ctx.widthM} m`);
  }
  if (ctx.depthM != null) lines.push(`Kedalaman: ${ctx.depthM} m`);
  if (ctx.heightM != null) lines.push(`Tinggi: ${ctx.heightM} m`);
  if (ctx.spanM != null) lines.push(`Bentang: ${ctx.spanM} m`);
  if (ctx.volumeM3 != null) lines.push(`Volume: ${ctx.volumeM3} m³`);
  if (ctx.floors != null) lines.push(`Jumlah lantai: ${ctx.floors}`);
  // FASE 4 (CHAT-03) — bangunan per bangunan: ringkasan memakai
  // struktur ini, bukan teks datar yang runtuh. Bila ada, baris
  // `Jumlah lantai` di atas adalah lantai bangunan utama saja.
  for (const l of buildingSummaryLines(ctx.buildings ?? [])) lines.push(l);
  if (ctx.dimensionsText) push('Dimensi (teks)', ctx.dimensionsText);
  for (const c of ctx.counts ?? []) {
    lines.push(`Jumlah: ${c.value} ${c.unit} (${c.original})`);
  }
  if (ctx.isNewConstruction === true) lines.push('Status: pembangunan baru');
  if (ctx.isNewConstruction === false) lines.push('Status: renovasi/eksisting');
  if (ctx.budgetText || ctx.budget) {
    const b = ctx.budget;
    const amount =
      b && typeof b.amount === 'number'
        ? formatIdr(b.amount)
        : ctx.budgetText ?? '';
    lines.push(`Budget: ${amount}${b?.kind ? ` (${b.kind})` : ''}`);
  }
  if (ctx.budgetHistory?.length) {
    const prev = ctx.budgetHistory[ctx.budgetHistory.length - 1];
    if (prev && typeof prev.amount === 'number') {
      lines.push(`Budget sebelumnya (dikoreksi): ${formatIdr(prev.amount)}`);
    }
  }
  push('Preferensi material (tersirat — belum preferensi lintas-proyek)', ctx.materialPreference);
  push('Preferensi kualitas (tersirat)', ctx.qualityPreference);
  for (const [key, val] of Object.entries(ctx.answers ?? {})) {
    lines.push(`Jawaban [${key}]: ${val}`);
  }
  for (const f of ctx.facts ?? []) {
    lines.push(`Fakta [${f.status}] ${f.label}: ${f.value}`);
  }
  for (const c of ctx.corrections ?? []) {
    lines.push(`Koreksi [${c.key}]: ${c.from} → ${c.to}`);
  }
  if (ctx.technicalSpecs?.length) {
    lines.push(`Spesifikasi teknis: ${ctx.technicalSpecs.join('; ')}`);
  }
  if (ctx.scopeConfirmed?.length) {
    lines.push(`Cakupan terkonfirmasi: ${ctx.scopeConfirmed.map((s) => s.label ?? s).join(', ')}`);
  }
  if (ctx.siteConditions?.length) {
    lines.push(`Kondisi tapak: ${ctx.siteConditions.join(', ')}`);
  }
  if (ctx.renovationScopes?.length) {
    lines.push(`Ruang renovasi: ${ctx.renovationScopes.join(', ')}`);
  }
  if (ctx.missingCritical?.length) {
    lines.push(`Belum diketahui (kritis): ${ctx.missingCritical.join(', ')}`);
  }
  return lines.map((l) => (l.length > 400 ? `${l.slice(0, 400)}…` : l));
}

/**
 * W11 §11 — baris fakta dari RabIntentSpec (jalur rumah), cermin
 * formatIntakeLines di atas. Label memakai akhiran "(spek RAB)" pada
 * field yang tumpang tindih dengan intake (luas/lantai/budget/lokasi)
 * agar model bisa membedakan sumbernya bila nilainya berbeda; field
 * yang hanya ada di spek rumah (kamar/atap/pondasi/struktur/material/
 * lingkup/pengecualian/kualitas) memakai label polos. Hanya field yang
 * TERISI yang diformat (null/[] = UNKNOWN, tidak pernah dikarang) —
 * rawText TIDAK ikut (teks mentah sudah ada di riwayat).
 */
function formatRabIntentSpecLines(spec: RabIntentSpec): string[] {
  const lines: string[] = [];
  const push = (label: string, value: string | null | undefined): void => {
    if (value === null || value === undefined || value === '') return;
    lines.push(`${label}: ${value}`);
  };
  push('Jenis bangunan (spek RAB)', spec.buildingType);
  push('Fungsi bangunan (spek RAB)', spec.buildingFunction);
  push('Kategori proyek (spek RAB)', spec.projectCategory);
  push('Sumber spek RAB', spec.source);
  if (spec.landAreaM2 != null) lines.push(`Luas tanah (spek RAB): ${spec.landAreaM2} m²`);
  if (spec.buildingAreaM2 != null) lines.push(`Luas bangunan (spek RAB): ${spec.buildingAreaM2} m²`);
  if (spec.dimensionsM?.lengthM != null && spec.dimensionsM?.widthM != null) {
    lines.push(`Dimensi (spek RAB): ${spec.dimensionsM.lengthM} m × ${spec.dimensionsM.widthM} m`);
  }
  if (spec.floors != null) lines.push(`Jumlah lantai (spek RAB): ${spec.floors}`);
  if (spec.bedrooms != null) lines.push(`Kamar tidur (spek RAB): ${spec.bedrooms}`);
  if (spec.bathrooms != null) lines.push(`Kamar mandi (spek RAB): ${spec.bathrooms}`);
  push('Lokasi (spek RAB)', spec.location);
  if (spec.roofSystem.length > 0) lines.push(`Atap (spek RAB): ${spec.roofSystem.join(', ')}`);
  push('Pondasi (spek RAB)', spec.foundationSystem);
  if (spec.structuralSystem.length > 0) lines.push(`Struktur (spek RAB): ${spec.structuralSystem.join(', ')}`);
  if (spec.materials.length > 0) lines.push(`Material (spek RAB): ${spec.materials.join(', ')}`);
  if (spec.scope.length > 0) lines.push(`Lingkup (spek RAB): ${spec.scope.join(', ')}`);
  if (spec.exclusions.length > 0) lines.push(`Pengecualian (spek RAB): ${spec.exclusions.join(', ')}`);
  if (spec.budgetIdr != null) lines.push(`Budget (spek RAB): ${formatIdr(spec.budgetIdr)}`);
  push('Kualitas (spek RAB)', spec.quality);
  if (spec.explicitFields.length > 0) {
    lines.push(`Field eksplisit dari pengguna (spek RAB): ${spec.explicitFields.join(', ')}`);
  }
  return lines.map((l) => (l.length > 400 ? `${l.slice(0, 400)}…` : l));
}

function formatSpecLines(specs: StructuredSpec[]): string[] {
  const rank = (s: StructuredSpec): number =>
    s.status === 'CONFIRMED' ? 0 : s.status === 'ASSUMPTION' ? 1 : s.status === 'RECOMMENDATION' ? 2 : 3;
  return [...specs]
    .sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key))
    .map((s) => `Spek [${s.status}] ${s.label}: ${formatValue(s.value, s.unit)} (sumber: ${s.source})`);
}

function formatDraftLines(draft: CanonicalDraftSummary): string[] {
  const lines: string[] = [`Judul: ${draft.title}`];
  if (draft.version != null) lines.push(`Versi: v${draft.version}`);
  if (draft.partCount != null || draft.itemCount != null) {
    lines.push(`Bagian: ${draft.partCount ?? '?'} • Item: ${draft.itemCount ?? '?'}`);
  }
  for (const w of draft.warnings?.slice(0, 3) ?? []) lines.push(`Peringatan draft: ${w}`);
  return lines;
}

/* ------------------------------------------------------------------ */
/* Builder kanonis                                                     */
/* ------------------------------------------------------------------ */

export function buildCanonicalContext(input: CanonicalContextInput): CanonicalContextResult {
  const truncations: string[] = [];
  let duplicatesDropped = 0;

  const projectId = input.projectSnapshot?.projectId ?? input.projectId ?? null;
  if (input.projectSnapshot && input.projectId && input.projectSnapshot.projectId !== input.projectId) {
    throw new Error(
      `CANONICAL_CONTEXT_PROJECT_MISMATCH: snapshot proyek ${input.projectSnapshot.projectId} ` +
        `tidak cocok dengan scope ${input.projectId} — konteks lintas proyek ditolak.`,
    );
  }
  // S3-B (2026-11-23) — defense-in-depth, cermin cek snapshot di atas:
  // (1) intakeContext tercap proyek lain vs scope → tolak. Jalur view
  // sudah dilindungi Tier 1/2, tetapi builder sendiri tidak boleh
  // memformat baris fakta proyek A ke payload proyek B (S11c discovery).
  // null di kedua sisi = tanpa klaim kepemilikan → diizinkan, cermin
  // semantik cek snapshot (hanya throw bila ADA dan mismatch).
  if (input.intakeContext?.projectId && projectId && input.intakeContext.projectId !== projectId) {
    throw new Error(
      `CANONICAL_CONTEXT_PROJECT_MISMATCH: intake konteks proyek ${input.intakeContext.projectId} ` +
        `tidak cocok dengan scope ${projectId} — konteks lintas proyek ditolak.`,
    );
  }
  const conversationId = input.conversationId ?? null;
  // S3-B (2): conversationId yang cocok pola generator store
  // (`conv-<projectId>-<ms>-<5 acak>`, unifiedConversationStore.ts:159)
  // mengklaim pemiliknya — bila pemilik itu ≠ scope, tolak (S11b).
  // ID yang TIDAK cocok pola (sesi non-conv, fixture tes) tidak membawa
  // klaim kepemilikan yang bisa diperiksa → dibiarkan (jangan tolak
  // yang tidak bisa dibuktikan). Scope null = tanpa klaim → dibiarkan.
  if (conversationId && projectId) {
    const convOwner = /^conv-(.+)-(\d{10,})-[a-z0-9]{5}$/.exec(conversationId);
    if (convOwner && convOwner[1] !== projectId) {
      throw new Error(
        `CANONICAL_CONTEXT_PROJECT_MISMATCH: percakapan ${conversationId} milik proyek ${convOwner[1]} ` +
          `tidak cocok dengan scope ${projectId} — konteks lintas proyek ditolak.`,
      );
    }
  }
  const userId = input.userId ?? null;

  const reserved = Math.max(0, input.reservedChars ?? 0);
  const dataBudget = Math.max(0, CANONICAL_TOTAL_PROMPT_BUDGET - reserved);
  const factsBudget = Math.min(CANONICAL_FACTS_BUDGET, dataBudget);
  const objectiveBudget = Math.min(
    CANONICAL_OBJECTIVE_BUDGET,
    Math.max(0, dataBudget - factsBudget),
  );
  const draftBudget = Math.min(CANONICAL_DRAFT_BUDGET, Math.max(0, dataBudget - factsBudget - objectiveBudget));
  // FASE 2 — MEMORI: cap sendiri; dipotong berpenanda, tidak pernah
  // mendorong fakta/draft keluar anggaran.
  const memoryBudget = Math.min(
    MEMORY_SECTION_BUDGET,
    Math.max(0, dataBudget - factsBudget - objectiveBudget - draftBudget),
  );
  // P3A (G2-F1) — URUTAN RESERVASI: fakta > objektif > draft > memori >
  // DED > QTO > ringkasan > riwayat (riwayat mengambil sisa AKTUAL di
  // bawah, bukan anggaran yang dicadangkan di sini). DED/QTO dicadangkan
  // SEBELUM ringkasan: keduanya data faktual (spek DED + pemeriksaan
  // QTO) yang tidak boleh kelaparan oleh ringkasan — dalam kondisi
  // produksi (reservedChars ~7.747 dari seksi daftar alat) urutan lama
  // memberi DED/QTO anggaran 0 meski seksi diteruskan, sehingga model
  // hanya menerima penanda terpotong (capture titik-C N-DEDQTO).
  // Ringkasan mengambil sisa sesudah DED/QTO; ringkasan adalah turunan
  // kompresibel dari riwayat, jadi ia yang mengalah bila anggaran ketat.
  // Tanpa seksi DED/QTO, anggaran keduanya 0 dan ringkasan mendapat
  // sisa yang SAMA PERSIS seperti sebelumnya (pin Fase 1 tidak berubah).
  // FASE 5 — DED & QTO: cap sendiri, HANYA bila seksi diteruskan.
  const dedBudget = input.dedSection
    ? Math.min(CANONICAL_DED_BUDGET, Math.max(0, dataBudget - factsBudget - objectiveBudget - draftBudget - memoryBudget))
    : 0;
  const qtoBudget = input.qtoSection
    ? Math.min(CANONICAL_QTO_BUDGET, Math.max(0, dataBudget - factsBudget - objectiveBudget - draftBudget - memoryBudget - dedBudget))
    : 0;
  // FASE B — AKUN: cap keras formatter (BUKAN reservasi rantai — lihat
  // komentar CANONICAL_ACCOUNT_BUDGET). Biaya seksi diserap anggaran
  // riwayat lewat probe overhead §4 karena baris akun masuk headLines.
  // report.budget.account = cap efektif (1.200 bila seksi ada, 0 bila
  // tidak) — BUKAN porsi yang dipotong dari rantai ringkasan; rumus
  // summaryBudget di bawah TIDAK berubah (pin P3A-02 dipertahankan).
  const accountBudget = input.accountSection ? CANONICAL_ACCOUNT_BUDGET : 0;
  const summaryBudget = Math.min(
    CANONICAL_SUMMARY_BUDGET,
    Math.max(0, dataBudget - factsBudget - objectiveBudget - draftBudget - memoryBudget - dedBudget - qtoBudget),
  );

  const messages = (input.messages ?? []).slice(-CANONICAL_MAX_HISTORY_MESSAGES);
  const last = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastIsUser = last?.role === 'user';
  const lastUserText = lastIsUser
    ? truncateMarked(last.content ?? '', CANONICAL_LAST_MESSAGE_CAP)
    : '';
  // Pesan terakhir HANYA di sini (baris terakhir riwayat, di dalam blok
  // DATA) — pengulangan `PENGGUNA (terakhir)` di luar blok DIHAPUS (ARS-07).
  const pool = lastIsUser ? messages.slice(0, -1) : messages;

  /* ---- 1. FAKTA PROYEK (prioritas tertinggi, cap sendiri) ---- */
  const factLines: string[] = [];
  if (input.projectSnapshot) {
    const snapText = formatProjectSummary(input.projectSnapshot);
    for (const l of snapText.split('\n')) factLines.push(l);
  } else if (input.projectSummaryText) {
    factLines.push(
      `Ringkasan proyek (teks bebas, warisan): ${truncateMarked(input.projectSummaryText, 1000)}`,
    );
  }
  const specs = input.structuredSpecs ?? input.intakeContext?.structuredSpecs ?? [];
  if (input.intakeContext) {
    const intakeLines = formatIntakeLines(input.intakeContext);
    const snapNorm = normalizeForDedupe(factLines.join('\n'));
    for (const l of intakeLines) {
      if (snapNorm.includes(normalizeForDedupe(l))) {
        duplicatesDropped++; // fakta intake yang sudah ada di snapshot tidak diulang
        continue;
      }
      factLines.push(l);
    }
  }
  // W11 §11 — spek rumah (RabIntentSpec) masuk FAKTA dengan prioritas
  // sesudah intake universal, sebelum spek terstruktur v2. Dedupe
  // terhadap fakta yang sudah ada (bila intake sudah membawa nilai
  // yang sama persis, baris spek tidak diulang). Anggaran TIDAK
  // berubah: baris-baris ini tunduk pada cap fakta 4.000 + pemotongan
  // per baris di bawah, sehingga total tetap ≤ 16.000.
  if (input.rabIntentSpec) {
    const rabLines = formatRabIntentSpecLines(input.rabIntentSpec);
    const existingRab = new Set(factLines.map(normalizeForDedupe));
    for (const l of rabLines) {
      if (existingRab.has(normalizeForDedupe(l))) {
        duplicatesDropped++;
        continue;
      }
      existingRab.add(normalizeForDedupe(l));
      factLines.push(l);
    }
  }
  const specLines = formatSpecLines(specs);
  {
    const existing = new Set(factLines.map(normalizeForDedupe));
    for (const l of specLines) {
      if (existing.has(normalizeForDedupe(l))) {
        duplicatesDropped++;
        continue;
      }
      factLines.push(l);
    }
  }
  let factsText = factLines.join('\n');
  let factsTruncated = false;
  let factsDropped = 0;
  if (factsText.length > factsBudget) {
    // Potong per baris (bukan buang seksi): fakta terpenting di depan.
    const kept: string[] = [];
    let used = 0;
    for (const l of factLines) {
      if (used + l.length + 1 > factsBudget) {
        factsDropped++;
        continue;
      }
      kept.push(l);
      used += l.length + 1;
    }
    factsText = `${kept.join('\n')}\n…[${factsDropped} baris fakta dipotong demi anggaran ${factsBudget} karakter — fakta lengkap tetap di state terstruktur aplikasi]`;
    factsTruncated = true;
    truncations.push(`fakta dipotong: ${factsDropped} baris (cap ${factsBudget})`);
  }
  const factsPresent = factLines.length > 0;

  /* ---- 1b. OBJEKTIF TUGAS (Fase 3 — seksi ke-10 kanonis) ---- */
  let objectiveText = '';
  let objectiveTruncated = false;
  if (input.objectiveSection) {
    objectiveText = truncateMarked(input.objectiveSection, objectiveBudget);
    objectiveTruncated = objectiveText.length > objectiveBudget;
    if (objectiveTruncated) truncations.push(`objektif dipotong (cap ${objectiveBudget})`);
  }

  /* ---- 2. DRAFT AKTIF ---- */
  let draftText = '';  let draftTruncated = false;
  if (input.draftSummary) {
    draftText = truncateMarked(formatDraftLines(input.draftSummary).join('\n'), draftBudget);
    draftTruncated = draftText.length > draftBudget;
    if (draftTruncated) truncations.push(`draft dipotong (cap ${draftBudget})`);
  }

  /* ---- 2b. MEMORI TERSIMPAN (Fase 2 — seksi ke-9 kanonis) ---- */
  let memoryText = '';
  let memoryTruncated = false;
  if (input.memorySection) {
    memoryText = truncateMarked(input.memorySection, memoryBudget);
    memoryTruncated = memoryText.length > memoryBudget;
    if (memoryTruncated) truncations.push(`memori dipotong (cap ${memoryBudget})`);
  }

  /* ---- 2c. PEMAHAMAN DED & PEMERIKSAAN QTO (Fase 5 — seksi ke-11/12) ---- */
  let dedText = '';
  let dedTruncated = false;
  if (input.dedSection) {
    // G-KN-2: stempel mode di kepala seksi (sebelum cap) bila
    // pemanggil membawa mode/policy asal DED. Mode yang tidak
    // diisi diturunkan dari policy via aturan migrasi kanonis.
    const dedWithMode =
      input.dedMode != null || input.dedPolicy != null
        ? `${describeModeForContext(
            input.dedMode ?? modeFromLegacy({ policy: input.dedPolicy ?? null, fullAi: null }),
            input.dedPolicy ?? null,
          )}\n${input.dedSection}`
        : input.dedSection;
    dedText = truncateMarked(dedWithMode, dedBudget);
    dedTruncated = dedText.length > dedBudget;
    if (dedTruncated) truncations.push(`DED dipotong (cap ${dedBudget})`);
  }
  let qtoText = '';
  let qtoTruncated = false;
  if (input.qtoSection) {
    qtoText = truncateMarked(input.qtoSection, qtoBudget);
    qtoTruncated = qtoText.length > qtoBudget;
    if (qtoTruncated) truncations.push(`QTO dipotong (cap ${qtoBudget})`);
  }

  /* ---- 2d. AKUN & LANGGANAN (Fase B — seksi ke-13 kanonis) ---- */
  let accountText = '';
  let accountTruncated = false;
  if (input.accountSection) {
    accountText = truncateMarked(input.accountSection, accountBudget);
    accountTruncated = accountText.length > accountBudget;
    if (accountTruncated) truncations.push(`akun dipotong (cap ${accountBudget})`);
  }

  /* ---- 3. RINGKASAN PERCAKAPAN (pengganti riwayat mentah panjang) ---- */
  let summaryText = '';
  let summarySource: 'stored' | 'computed' | 'none' = 'none';
  let summarizedUpTo = 0; // jumlah pesan pool yang sudah diwakili ringkasan
  if (pool.length > CANONICAL_SUMMARY_RECENT_WINDOW) {
    const stored = input.storedSummary;
    if (stored && stored.text && stored.messageCount >= pool.length - CANONICAL_SUMMARY_RECENT_WINDOW) {
      summaryText = truncateMarked(stored.text, summaryBudget);
      summarySource = 'stored';
      summarizedUpTo = stored.messageCount;
    } else {
      const toSummarize = pool.slice(0, Math.max(0, pool.length - CANONICAL_SUMMARY_RECENT_WINDOW));
      const built = buildExtractiveSummary(toSummarize, summaryBudget);
      if (built.text) {
        summaryText = built.text;
        summarySource = 'computed';
        summarizedUpTo = toSummarize.length;
      }
    }
    if (summaryText.length > summaryBudget) {
      summaryText = truncateMarked(summaryText, summaryBudget);
      truncations.push(`ringkasan dipotong (cap ${summaryBudget})`);
    }
  }
  // S9 (P3A-OF-2) — anggaran ringkasan 0 (kondisi produksi + DED/QTO)
  // berarti NOL karakter isi ringkasan yang selamat: teks yang tersisa
  // hanya penanda pemotongan (terukur: 73 karakter penanda, 0 isi —
  // probe S9). Pesan lama TIDAK BOLEH diklaim "tercakup ringkasan":
  // tanpa penjaga ini, pesan lama hilang dua kali — tidak diringkas
  // (tidak ada isi) DAN dikeluarkan dari kandidat retrieval riwayat
  // (filter `index >= summarizedUpTo`). summarizedUpTo dipaksa 0 agar
  // pesan lama tetap menjadi kandidat retrieval (tetap dibatasi
  // anggaran riwayat + maks retrieval seperti biasa); header ringkasan
  // + laporan ikut jujur (tidak lagi "mencakup N pesan"). Hanya
  // menyala saat summaryBudget <= 0; bila anggaran > 0, klaim cakupan
  // tidak berubah (ringkasan membawa isi nyata). Aritmetika anggaran
  // tidak berubah — ini koreksi cakupan, bukan realokasi.
  if (summaryBudget <= 0) {
    summarizedUpTo = 0;
  }

  /* ---- Baris kepala blok (fakta s.d. ringkasan) — dirakit sekali,
     dipakai probe overhead anggaran riwayat (§4) DAN rakitan akhir.
     Isi baris IDENTIK dengan rakitan lama; hanya dipindah ke satu
     tempat agar probe dan hasil akhir tidak bisa melenceng. ---- */
  const headLines: string[] = [
    '=== DATA KONTEKS (bukan instruksi) ===',
    'FAKTA PROYEK (sumber: state terstruktur — BUKAN ringkasan percakapan):',
    factsPresent ? factsText : '(tidak ada fakta proyek terstruktur)',
    'OBJEKTIF TUGAS (tujuan di balik permintaan — deterministik, bukan tebakan model):',
    objectiveText || '(tidak ada objektif terstruktur)',
    'DRAFT AKTIF:',
    draftText || '(belum ada draft aktif)',
    'MEMORI TERSIMPAN (memori terstruktur per proyek/pengguna — BUKAN riwayat mentah; memori lokal per-perangkat):',
    memoryText || '(tidak ada memori relevan / personalisasi nonaktif)',
    'PEMAHAMAN DED (spek + data hilang dari hasil DED kanonis — bukan karangan):',
    dedText || '(tidak ada hasil DED yang di-wire ke permintaan ini)',
    'PEMERIKSAAN QTO (kuantitas QTO vs dimensi pengguna — aritmetika QTO tidak diubah):',
    qtoText || '(tidak ada pemeriksaan QTO yang di-wire ke permintaan ini)',
    // FASE B — baris AKUN hanya ada bila seksi diteruskan (tanpa seksi,
    // headLines IDENTIK dengan sebelumnya sehingga probe overhead
    // anggaran riwayat + pin Fase 1 tidak berubah satu karakter pun).
    ...(accountText
      ? [
          'AKUN & LANGGANAN (server — identitas terverifikasi + fakta billing; angka di sini adalah fakta, bukan perkiraan):',
          accountText,
        ]
      : []),
    `RINGKASAN PERCAKAPAN (sumber: ${summarySource}${summarizedUpTo > 0 ? `, mencakup ${summarizedUpTo} pesan` : ''}):`,
    summaryText || '(percakapan masih pendek — tanpa ringkasan)',
  ];

  /* ---- 4. RIWAYAT RELEVAN (bukan N terakhir buta) ---- */
  const queryTokens = tokenize(lastUserText);
  const candidates = pool
    .map((m, i) => ({ msg: m, index: i, score: scoreMessageRelevance(m, queryTokens, i, pool.length) }))
    .filter((c) => c.index >= summarizedUpTo);
  const considered = candidates.length;
  // Dedupe: isi identik + isi yang sudah diwakili fakta/ringkasan dibuang (terhitung).
  const factsNorm = normalizeForDedupe(factsText);
  const summaryNorm = normalizeForDedupe(summaryText);
  const seenNorm = new Set<string>();
  let droppedDuplicate = 0;
  const deduped = candidates.filter((c) => {
    const norm = normalizeForDedupe(c.msg.content ?? '');
    if (!norm) {
      droppedDuplicate++;
      return false;
    }
    if (seenNorm.has(norm)) {
      droppedDuplicate++;
      return false;
    }
    seenNorm.add(norm);
    if (
      norm.length > 40 &&
      ((factsNorm && factsNorm.includes(norm)) || (summaryNorm && summaryNorm.includes(norm)))
    ) {
      droppedDuplicate++;
      return false;
    }
    return true;
  });
  duplicatesDropped += droppedDuplicate;
  // Retrieval: skor tertinggi dulu, maks CANONICAL_MAX_RETRIEVED_MESSAGES.
  const ranked = [...deduped].sort((a, b) => b.score - a.score || b.index - a.index);
  const selected = ranked.slice(0, CANONICAL_MAX_RETRIEVED_MESSAGES);
  let droppedForBudget = 0;
  // P3A — anggaran riwayat memakai overhead BLOK NYATA, bukan hanya
  // panjang seksi: label tetap + placeholder seksi kosong + baris
  // pemotongan riwayat (~900–1.000 karakter) sebelumnya tidak dihitung,
  // sehingga prompt bisa melewati cap 16.000 bila riwayat mengisi
  // anggarannya dengan rapat (terukur pada kode LAMA: +806 karakter,
  // skenario C — cacat laten, bukan regresi urutan baru). Probe memakai
  // bentuk MAKSIMUM (header "13 dari 20 pesan", baris pemotongan selalu
  // ada, slot riwayat = placeholder) sehingga ia batas atas overhead
  // final — jaminan cap menjadi eksak. Pengecualian: baris pesan
  // terakhir SELALU ikut (pin P1: kemunculan tepat 1); bila pesan
  // terakhir saja melebihi sisa anggaran, cap masih bisa terlampaui
  // (terbatas pada cap pesan terakhir 6.000, jauh di bawah batas
  // gateway 20.000). Dalam anggaran longgar, min(8.000, …) tetap yang
  // mengikat sehingga perilaku tidak berubah.
  const HISTORY_PLACEHOLDER = '(tidak ada riwayat relevan)';
  const probeBlockLength = [
    ...headLines,
    'RIWAYAT PERCAKAPAN (13 dari 20 pesan, relevansi + resensi):',
    HISTORY_PLACEHOLDER,
    '…[20 pesan riwayat lama dipotong demi anggaran — fakta proyek di atas tetap utuh]',
    '=== AKHIR DATA ===',
  ].join('\n').length;
  const historyBudget = Math.min(
    CANONICAL_HISTORY_MAX_BUDGET,
    Math.max(0, dataBudget - probeBlockLength),
  );
  const lastLine = lastIsUser
    ? `PENGGUNA: ${lastUserText}`
    : '';
  const historyLines: string[] = [];
  let historyUsed = lastLine.length;
  // Isi dari skor terendah yang terpilih dulu agar yang terkuat selamat bila budget habis.
  const byScoreAsc = [...selected].sort((a, b) => a.score - b.score || a.index - b.index);
  const keptByIndex = new Map<number, string>();
  for (const c of byScoreAsc) {
    const cap = CANONICAL_MESSAGE_CAP;
    const line = `${c.msg.role === 'user' ? 'PENGGUNA: ' : 'EZRAB AI: '}${truncateMarked(c.msg.content ?? '', cap)}`;
    // Pesan terakhir (lastLine) SELALU ikut — ia sudah dihitung di
    // historyUsed; pesan lain hanya bila muat dalam anggaran riwayat.
    if (historyUsed + line.length + 1 > historyBudget) {
      droppedForBudget++;
      continue;
    }
    keptByIndex.set(c.index, line);
    historyUsed += line.length + 1;
  }
  for (const c of [...selected].sort((a, b) => a.index - b.index)) {
    const line = keptByIndex.get(c.index);
    if (line) historyLines.push(line);
  }
  if (lastLine) historyLines.push(lastLine);
  if (droppedForBudget > 0) {
    truncations.push(`riwayat dipotong: ${droppedForBudget} pesan relevan dibuang demi anggaran ${historyBudget}`);
  }
  const historyDroppedTotal = (considered - selected.length) + droppedForBudget;
  const historyText = historyLines.join('\n');

  /* ---- Rakit blok data (12 seksi kanonis — 8 Fase 1 + MEMORI Fase 2 + OBJEKTIF Fase 3 + DED/QTO Fase 5 + AKUN Fase B) ---- */
  const dataBlock = [
    ...headLines,
    `RIWAYAT PERCAKAPAN (${historyLines.length} dari ${messages.length} pesan, relevansi + resensi):`,
    historyText || HISTORY_PLACEHOLDER,
    ...(droppedForBudget > 0
      ? [`…[${droppedForBudget} pesan riwayat lama dipotong demi anggaran — fakta proyek di atas tetap utuh]`]
      : []),
    '=== AKHIR DATA ===',
  ].join('\n');

  // S9 (P3A-OF-1) — pelaporan JUJUR pelampauan cap. Satu-satunya sumber
  // pelampauan yang tersisa adalah baris pesan terakhir (selalu ikut
  // utuh, pin P1): bila ia saja melebihi sisa anggaran, prompt rakitan
  // melewati cap 16.000 (terukur worst case +7.201 → prompt 23.201 —
  // MELEBIHI batas gateway 20.000 bila tidak dicegat; service.ts
  // fail-closed di sini dengan CONTEXT_BUDGET_EXCEEDED sebelum provider
  // dipanggil, jadi pelampauan berujung penolakan jujur, bukan
  // panggilan gagal). Isi prompt TIDAK diubah di sini — memotong pesan
  // terakhir berarti memotong permintaan berjalan (keputusan desain,
  // tetap terbuka) — tetapi pelampauan kini TERCATAT eksplisit di
  // report.truncations (sebelumnya hanya terlihat dari promptChars).
  const promptCharsTotal = dataBlock.length + reserved;
  if (promptCharsTotal > CANONICAL_TOTAL_PROMPT_BUDGET) {
    truncations.push(
      `cap prompt ${CANONICAL_TOTAL_PROMPT_BUDGET} terlampaui: ${promptCharsTotal} karakter ` +
        `(+${promptCharsTotal - CANONICAL_TOTAL_PROMPT_BUDGET}) — pesan terakhir disertakan utuh` +
        (promptCharsTotal > 20_000
          ? '; JUGA melebihi batas gateway 20.000 (dicegat fail-closed service.ts)'
          : ''),
    );
  }

  const report: CanonicalContextReport = {
    scope: {
      userId,
      userIdentity: userId ? 'authenticated' : 'anonymous-tanpa-identitas',
      projectId,
      conversationId,
    },
    budget: {
      total: CANONICAL_TOTAL_PROMPT_BUDGET,
      reserved,
      data: dataBudget,
      facts: factsBudget,
      draft: draftBudget,
      objective: objectiveBudget,
      memory: memoryBudget,
      ded: dedBudget,
      qto: qtoBudget,
      account: accountBudget,
      summary: summaryBudget,
      history: historyBudget,
    },
    sections: {
      facts: { chars: factsText.length, truncated: factsTruncated, included: factLines.length - factsDropped, dropped: factsDropped },
      draft: { chars: draftText.length, truncated: draftTruncated, included: draftText ? 1 : 0, dropped: 0 },
      objective: { chars: objectiveText.length, truncated: objectiveTruncated, included: objectiveText ? 1 : 0, dropped: 0 },
      memory: { chars: memoryText.length, truncated: memoryTruncated, included: memoryText ? 1 : 0, dropped: 0 },
      ded: { chars: dedText.length, truncated: dedTruncated, included: dedText ? 1 : 0, dropped: 0 },
      qto: { chars: qtoText.length, truncated: qtoTruncated, included: qtoText ? 1 : 0, dropped: 0 },
      account: { chars: accountText.length, truncated: accountTruncated, included: accountText ? 1 : 0, dropped: 0 },
      summary: { chars: summaryText.length, truncated: summaryText.includes('…[ringkasan dipotong'), included: summarizedUpTo, dropped: 0 },
      history: { chars: historyText.length, truncated: droppedForBudget > 0, included: historyLines.length, dropped: historyDroppedTotal },
    },
    dataBlockChars: dataBlock.length,
    promptChars: promptCharsTotal,
    lastMessageOccurrences: lastUserText ? countOccurrences(dataBlock, lastUserText) : 0,
    duplicatesDropped,
    truncations,
    summarySource,
    retrieval: {
      considered,
      selected: selected.length,
      droppedForBudget,
      droppedDuplicate,
      maxRetrieved: CANONICAL_MAX_RETRIEVED_MESSAGES,
      memory: input.memoryReport ?? null,
    },
    factsPresent,
  };

  return { dataBlock, lastUserText, report };
}

/**
 * Rakit prompt lengkap dari blok data kanonis + seksi alat (satu titik
 * rakitan — dipakai service kanonis; Copilot memakai dataBlock yang sama
 * dengan suffix-nya sendiri yang tetap mencantumkan aturan bahasa).
 * Seksi ke-7/ke-8 kanonis: ALAT YANG TERSEDIA + BAHASA JAWABAN.
 */
export function assembleChatPrompt(dataBlock: string, toolListText: string): string {
  return `${dataBlock}

ALAT YANG TERSEDIA:
${toolListText}

Jika diperlukan, panggil alat dengan format JSON: {"tool":"<nama_alat>","args":{...}}
Kemudian lanjutkan jawabanmu. ${RESPONSE_LANGUAGE_RULE}`;
}
