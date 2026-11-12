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
 * prompt > 20.000 dan systemPrompt > 16.000 — api/_lib/security.js):
 *   TOTAL_PROMPT_BUDGET = 16.000 karakter untuk SELURUH field `prompt`
 *   (blok data + seksi alat + aturan bahasa). `reservedChars` adalah
 *   panjang seksi alat yang dihitung pemanggil, sehingga blok data
 *   tidak pernah mendorong total melewati cap — headroom di bawah
 *   batas gateway 20.000 adalah 4.000 karakter.
 * Prioritas anggaran: FAKTA PROYEK > RINGKASAN > RIWAYAT. Fakta TIDAK
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
  const conversationId = input.conversationId ?? null;
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
  const summaryBudget = Math.min(
    CANONICAL_SUMMARY_BUDGET,
    Math.max(0, dataBudget - factsBudget - objectiveBudget - draftBudget - memoryBudget),
  );
  // FASE 5 — DED & QTO: cap sendiri, HANYA bila seksi diteruskan; tanpa
  // seksi, anggaran 0 sehingga perilaku tanpa-DED/QTO IDENTIK dengan
  // sebelumnya (pin Fase 1 tidak berubah).
  const dedBudget = input.dedSection
    ? Math.min(CANONICAL_DED_BUDGET, Math.max(0, dataBudget - factsBudget - objectiveBudget - draftBudget - memoryBudget - summaryBudget))
    : 0;
  const qtoBudget = input.qtoSection
    ? Math.min(CANONICAL_QTO_BUDGET, Math.max(0, dataBudget - factsBudget - objectiveBudget - draftBudget - memoryBudget - summaryBudget - dedBudget))
    : 0;

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
    dedText = truncateMarked(input.dedSection, dedBudget);
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
  // Anggaran riwayat = sisa setelah fakta + draft + memori + ringkasan + DED + QTO (maks 8.000).
  const historyBudget = Math.min(
    CANONICAL_HISTORY_MAX_BUDGET,
    Math.max(0, dataBudget - factsText.length - objectiveText.length - draftText.length - memoryText.length - summaryText.length - dedText.length - qtoText.length),
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

  /* ---- Rakit blok data (11 seksi kanonis — 8 Fase 1 + MEMORI Fase 2 + OBJEKTIF Fase 3 + DED/QTO Fase 5) ---- */
  const dataBlock = [
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
    `RINGKASAN PERCAKAPAN (sumber: ${summarySource}${summarizedUpTo > 0 ? `, mencakup ${summarizedUpTo} pesan` : ''}):`,
    summaryText || '(percakapan masih pendek — tanpa ringkasan)',
    `RIWAYAT PERCAKAPAN (${historyLines.length} dari ${messages.length} pesan, relevansi + resensi):`,
    historyText || '(tidak ada riwayat relevan)',
    ...(droppedForBudget > 0
      ? [`…[${droppedForBudget} pesan riwayat lama dipotong demi anggaran — fakta proyek di atas tetap utuh]`]
      : []),
    '=== AKHIR DATA ===',
  ].join('\n');

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
      summary: { chars: summaryText.length, truncated: summaryText.includes('…[ringkasan dipotong'), included: summarizedUpTo, dropped: 0 },
      history: { chars: historyText.length, truncated: droppedForBudget > 0, included: historyLines.length, dropped: historyDroppedTotal },
    },
    dataBlockChars: dataBlock.length,
    promptChars: dataBlock.length + reserved,
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
