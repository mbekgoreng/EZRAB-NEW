/**
 * agentOrchestrator.ts — HIGH-INITIATIVE AGENT ORCHESTRATION
 * (AI Intelligence Overhaul Fase 3, direktif owner 2026-11-12 Part 15
 * Fase 3 + Part 5 + Part 7).
 *
 * Orkestrasi agen DI ATAS fondasi yang ada — bukan sistem kedua:
 *  - Pemahaman objektif di atas `routeIntent` (intentRouter) — objektif
 *    terstruktur (tujuan, kategori proyek, entitas, batasan, konflik).
 *  - Perencana tugas multi-langkah; rencana dipersist per proyek/
 *    percakapan lewat pola yang ada (hardenedStorage envelope v2,
 *    kunci saudara di draftPersistence.ts) sehingga selamat dari
 *    navigasi (executionRuntime) DAN reload.
 *  - Intake adaptif sebagai LANGKAH rencana: memanggil mesin
 *    kuesioner yang ADA (questionnaire.ts), bukan duplikat.
 *  - Pemilihan tool cerdas atas tool/aksi yang ADA (tools.ts +
 *    actionRegistry) — berdasarkan objektif + konteks + kapabilitas
 *    + efek samping, dengan alasan pemilihan tercatat di state tugas.
 *    Registry tool penuh + skema + permission model adalah Fase 5.
 *  - Approval gate ditegakkan DI KODE: aksi konsekwensial/irreversibel
 *    WAJIB persetujuan eksplisit pengguna (actor 'user'); model TIDAK
 *    PERNAH memberi dirinya izin. `executeStep` menolak menjalankan
 *    langkah konsekwensial yang belum disetujui — tanpa runner pun.
 *  - Follow-up proaktif: pekerjaan belum selesai dilacak dan
 *    disajikan saat pengguna kembali (di dalam chat, bukan toast).
 *  - Pemulihan: langkah gagal mempertahankan langkah sukses;
 *    retry hanya langkah itu, maks 2×, tanpa pengulangan operasi
 *    berbayar; hasil tool gagal dilaporkan sebagai gagal.
 *  - Konsolidasi memori long-term DETERMINISTIK (keputusan/fakta
 *    terkonfirmasi → long-term, provenans + versi, via memory.ts).
 *    Ekstraksi LLM TIDAK DIBANGUN di fase ini: `requestLlmMemoryExtraction`
 *    menolak secara eksplisit (NOT_BUILT) — dicatat sebagai batasan,
 *    bukan dipaksakan.
 *
 * Aturan keras:
 *  - Tanpa karangan harga/katalog AHSP; tanpa ubah aritmetika kanonis.
 *  - Tanpa simpan kredensial/token/secret di state tugas (penjaga
 *    `containsSecret` dari memory.ts; teks yang mengandung secret
 *    ditolak masuk objektif/rencana).
 *  - Iterasi & eksekusi BERBATAS: maks 5 iterasi rencana per sesi
 *    tugas, maks 2 retry per langkah (Part 18).
 *  - Fakta intake pasca-draft tetap mengikuti keputusan owner §10a
 *    (tidak diubah di sini).
 */
import { loadVersioned, saveVersioned } from '../../engine/storage/hardenedStorage';
import {
  containsSecret,
  createMemoryRecord,
  getCurrentMemory,
  listMemories,
  saveMemory,
  type MemoryScope,
} from './memory';

/* ------------------------------------------------------------------ */
/* Batas eksekusi (Part 18 — iterasi & eksekusi berbatas)               */
/* ------------------------------------------------------------------ */

export const AGENT_MAX_PLAN_ITERATIONS = 5;
export const AGENT_MAX_STEP_RETRIES = 2;
/** Versi skema payload rencana — TERPISAH dari envelope storage v2. */
export const AGENT_PLAN_SCHEMA_VERSION = 1;
export const AI_AGENT_PLANS_STORAGE_KEY = 'ezrab_prod_ai_agent_plans';
/** Cap seksi OBJEKTIF di blok data kanonis (karakter). */
export const AGENT_OBJECTIVE_SECTION_BUDGET = 800;

/* ------------------------------------------------------------------ */
/* Objektif                                                            */
/* ------------------------------------------------------------------ */

export type ObjectiveGoal =
  | 'build-rab'
  | 'optimize-cost'
  | 'search-ahsp'
  | 'explain'
  | 'navigate'
  | 'create-project'
  | 'clarify'
  | 'greeting'
  | 'unsupported';

export interface ObjectiveEntities {
  categoryLabel: string | null;
  categoryKey: string | null;
  /** Jumlah hewan/unit, mis. 20 ekor sapi. */
  count: { value: number; unit: string } | null;
  lengthM: number | null;
  widthM: number | null;
  areaM2: number | null;
  floors: number | null;
  budgetRp: number | null;
  materials: string[];
}

export interface ObjectiveConflict {
  key: string;
  description: string;
  values: string[];
}

export interface AgentObjective {
  goal: ObjectiveGoal;
  /** Tujuan dalam bahasa pengguna (1 kalimat, tanpa karangan). */
  goalText: string;
  intent: string | null;
  entities: ObjectiveEntities;
  /** Batasan eksplisit yang dinyatakan pengguna (budget, material, dsb.). */
  constraints: string[];
  /** Yang masih hilang untuk menjalankan rencana (dimensi, material, …). */
  missing: string[];
  conflicts: ObjectiveConflict[];
  /** 0..1 — keyakinan klasifikasi deterministik (bukan keyakinan model). */
  confidence: number;
  /** Apakah permintaan ini samar (perlu klarifikasi sebelum rencana jalan). */
  vague: boolean;
  sourceText: string;
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ');

const MATERIAL_WORDS = [
  'galvalum', 'genteng', 'spandek', 'beton', 'baja', 'keramik', 'granit',
  'kayu', 'kaca', 'batu kali', 'bata merah', 'bata ringan', 'hebel',
  'asbes', 'seng', 'aluminium', 'pvc', 'gypsum', 'cat', 'pipa',
];

const CATEGORY_PATTERNS: Array<{ key: string; label: string; re: RegExp }> = [
  { key: 'kandang', label: 'Kandang / fasilitas peternakan', re: /\b(kandang|sapi|lembu|ayam|peternakan|kambing|domba|babi|bebek)\b/ },
  { key: 'rumah', label: 'Rumah tinggal', re: /\b(rumah|hunian|villa|kos|kontrakan)\b/ },
  { key: 'gudang', label: 'Gudang / warehouse', re: /\b(gudang|warehouse|pabrik)\b/ },
  { key: 'jalan', label: 'Jalan / perkerasan', re: /\b(jalan|perkerasan|aspal|paving|trotoar|makadam)\b/ },
  { key: 'drainase', label: 'Drainase / saluran', re: /\b(drainase|saluran|gorong|u-?ditch|parit)\b/ },
  { key: 'kolam', label: 'Kolam renang / kolam', re: /\b(kolam renang|kolam)\b/ },
  { key: 'jembatan', label: 'Jembatan', re: /\b(jembatan)\b/ },
  { key: 'gedung', label: 'Gedung / kantor / sekolah', re: /\b(gedung|kantor|sekolah|rumah sakit|klinik|hotel|mall|apartemen|ruko)\b/ },
  { key: 'landscape', label: 'Landscape / taman', re: /\b(landscape|lanskap|taman)\b/ },
  { key: 'atap', label: 'Atap / waterproofing', re: /\b(atap|genteng|waterproofing|dak)\b/ },
  { key: 'renovasi', label: 'Renovasi', re: /\b(renovasi|perbaikan|rehab)\b/ },
  { key: 'dinding-penahan', label: 'Dinding penahan / retaining', re: /\b(dinding penahan|retaining|turap)\b/ },
  { key: 'irigasi', label: 'Irigasi / bendung', re: /\b(irigasi|bendungan|bendung|embung)\b/ },
];

function parseBudget(text: string): number | null {
  const m = text.match(/rp\s*([\d.,]+)\s*(miliar|milyar|jt|juta|rb|ribu)?/i)
    ?? text.match(/budget[^0-9]{0,20}([\d.,]+)\s*(miliar|milyar|jt|juta|rb|ribu)?/i)
    ?? text.match(/([\d.,]+)\s*(miliar|milyar)\b/i);
  if (!m) return null;
  const raw = m[1].replace(/\./g, '').replace(/,/g, '.');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] ?? '').toLowerCase();
  if (unit.startsWith('miliar') || unit.startsWith('milyar')) return Math.round(n * 1_000_000_000);
  if (unit === 'jt' || unit === 'juta') return Math.round(n * 1_000_000);
  if (unit === 'rb' || unit === 'ribu') return Math.round(n * 1_000);
  return Math.round(n);
}

function parseAllBudgets(text: string): number[] {
  const out: number[] = [];
  const re = /(?:rp|budget)[^0-9]{0,20}([\d.,]+)\s*(miliar|milyar|jt|juta|rb|ribu)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].replace(/\./g, '').replace(/,/g, '.');
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    const unit = (m[2] ?? '').toLowerCase();
    const v = unit.startsWith('miliar') || unit.startsWith('milyar') ? n * 1_000_000_000
      : unit === 'jt' || unit === 'juta' ? n * 1_000_000
      : unit === 'rb' || unit === 'ribu' ? n * 1_000 : n;
    out.push(Math.round(v));
  }
  // Nilai bare dengan satuan besar tanpa awalan rp/budget ("250 jt")
  // juga budget — tanpa ini koreksi budget kedua tidak terdeteksi konflik.
  const bare = /([\d.,]+)\s*(miliar|milyar|jt|juta)\b/gi;
  while ((m = bare.exec(text)) !== null) {
    const raw = m[1].replace(/\./g, '').replace(/,/g, '.');
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    const unit = m[2].toLowerCase();
    const v = unit.startsWith('miliar') || unit.startsWith('milyar') ? n * 1_000_000_000 : n * 1_000_000;
    out.push(Math.round(v));
  }
  return [...new Set(out)];
}

function parseDimensions(text: string): { lengthM: number | null; widthM: number | null; areaM2: number | null } {
  const dim = text.match(/(\d+(?:[.,]\d+)?)\s*(?:m\b|meter)?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:m\b|meter)?/i);
  const area = text.match(/(\d+(?:[.,]\d+)?)\s*m(?:2|²)\b/i);
  return {
    lengthM: dim ? Number(dim[1].replace(',', '.')) : null,
    widthM: dim ? Number(dim[2].replace(',', '.')) : null,
    areaM2: area ? Number(area[1].replace(',', '.')) : null,
  };
}

/**
 * Objektif dari pesan pengguna — deterministik di atas pola kata
 * (bukan semantik/LLM). Teks samar yang tidak menyebut kategori maupun
 * verba kerja → goal 'clarify'/'unsupported' yang JUJUR, bukan tebakan.
 * Secret tidak pernah masuk objektif (dipotong + ditandai).
 */
export function deriveObjective(rawText: string, intent?: string | null): AgentObjective {
  const safeText = containsSecret(rawText) ? '[teks mengandung pola kredensial — tidak disimpan sebagai objektif]' : rawText;
  const text = norm(safeText);
  const dims = parseDimensions(rawText);
  const budget = parseBudget(rawText);
  const budgets = parseAllBudgets(rawText);
  const countM = text.match(/(\d+)\s*(ekor|sapi|ayam|unit|ruang|kamar|lantai|unit)\b/);
  const floorsM = text.match(/(\d+)\s*lantai/);
  const materials = MATERIAL_WORDS.filter((w) => new RegExp(`\\b${w.replace(' ', '\\s+')}\\b`).test(text));
  let category: { key: string; label: string } | null = null;
  for (const c of CATEGORY_PATTERNS) {
    if (c.re.test(text)) { category = c; break; }
  }
  const conflicts: ObjectiveConflict[] = [];
  if (budgets.length > 1) {
    conflicts.push({
      key: 'budget',
      description: 'Dua nilai budget berbeda disebutkan dalam satu permintaan.',
      values: budgets.map((b) => `Rp${b.toLocaleString('id-ID')}`),
    });
  }
  const roofMats = materials.filter((m) => ['galvalum', 'genteng', 'spandek', 'asbes', 'seng'].includes(m));
  if (roofMats.length > 1) {
    conflicts.push({
      key: 'roof_material',
      description: 'Dua material atap berbeda disebutkan untuk elemen yang sama.',
      values: roofMats,
    });
  }
  const floors = floorsM ? Number(floorsM[1]) : null;
  if (floors !== null && /\b1\s*lantai\b/.test(text) && /\b2\s*lantai\b/.test(text)) {
    conflicts.push({
      key: 'floors',
      description: 'Jumlah lantai disebutkan berbeda (1 dan 2 lantai).',
      values: ['1 lantai', '2 lantai'],
    });
  }

  let goal: ObjectiveGoal;
  let goalText: string;
  let confidence = 0.85;
  const wantsRab = /\b(rab|estimasi|anggaran|hitung|biaya)\b/.test(text)
    || intent === 'CREATE_RAB_SUMMARY' || intent === 'CREATE_RAB_DIRECT' || intent === 'CREATE_RAB_CLARIFY';
  const wantsOptimize = /\b(optimalkan|optimasi|hemat|murah|turunkan|potong|efisien|tekan)\b.*\b(biaya|rab|anggaran|harga)\b|\b(biaya|rab|anggaran)\b.*\b(optimalkan|optimasi|hemat|murah|turunkan)\b/.test(text);
  const wantsAhsp = /\b(ahsp|cari harga|harga satuan)\b/.test(text) || intent === 'SEARCH_AHSP';
  const wantsNav = intent?.startsWith('OPEN_') ?? false;
  const isGreeting = intent === 'GREETING';
  const isUnsupported = /\b(mars|fiksi|khayal|fantasi|dongeng|planet)\b/.test(text)
    || /\b(buatkan|buat|bikin)\b.*\b(mobil|pesawat|kapal|roket|game|lagu|film)\b/.test(text);

  if (isGreeting) { goal = 'greeting'; goalText = 'Menyapa dan memulai percakapan.'; }
  else if (isUnsupported) { goal = 'unsupported'; goalText = 'Permintaan di luar cakupan EZRAB (konstruksi/RAB/AHSP).'; confidence = 0.9; }
  else if (wantsOptimize) { goal = 'optimize-cost'; goalText = 'Mengoptimalkan biaya RAB yang sudah ada.'; }
  else if (wantsRab) {
    if (!category && dims.lengthM == null && dims.widthM == null && dims.areaM2 == null && budget == null && materials.length === 0) {
      goal = 'clarify';
      goalText = 'Permintaan RAB samar — kategori, dimensi, material, dan budget belum disebutkan.';
      confidence = 0.4;
    } else {
      goal = 'build-rab';
      goalText = category
        ? `Menyusun RAB ${category.label.toLowerCase()}${countM ? ` untuk ${countM[1]} ${countM[2]}` : ''}.`
        : 'Menyusun RAB (kategori proyek belum jelas).';
    }
  } else if (wantsAhsp) { goal = 'search-ahsp'; goalText = 'Mencari harga satuan AHSP 2026 resmi.'; }
  else if (wantsNav) { goal = 'navigate'; goalText = 'Membuka menu/fitur yang diminta.'; }
  else if (intent === 'CREATE_RAB_CLARIFY' || intent === 'CLARIFY_TOPIC' || intent === 'CLARIFY_QUERY') { goal = 'clarify'; goalText = 'Meminta klarifikasi sebelum menyusun RAB.'; }
  else if (category || /\b(jelaskan|apa itu|mengapa|kenapa|bagaimana|apa beda)\b/.test(text)) { goal = 'explain'; goalText = category ? `Menjelaskan/membahas ${category.label.toLowerCase()}.` : 'Menjawab pertanyaan tentang konstruksi.'; confidence = 0.6; }
  else { goal = 'clarify'; goalText = 'Permintaan samar — kategori dan tujuan belum dapat ditentukan dari teks.'; confidence = 0.4; }

  const missing: string[] = [];
  if (goal === 'build-rab' || (goal === 'clarify' && wantsRab)) {
    if (dims.lengthM == null && dims.widthM == null && dims.areaM2 == null) missing.push('dimensi (panjang × lebar atau luas)');
    if (materials.length === 0) missing.push('material utama');
    if (budget == null) missing.push('budget');
    if (!category) missing.push('kategori proyek');
  }
  if (goal === 'search-ahsp' && !/\b(ahsp|harga satuan)\b/.test(text)) missing.push('kata kunci AHSP');

  const constraints: string[] = [];
  if (budget != null) constraints.push(`Budget Rp${budget.toLocaleString('id-ID')}`);
  if (materials.length > 0) constraints.push(`Material: ${materials.join(', ')}`);
  if (dims.lengthM != null && dims.widthM != null) constraints.push(`Dimensi ${dims.lengthM} m × ${dims.widthM} m`);
  if (floors != null) constraints.push(`${floors} lantai`);

  return {
    goal,
    goalText,
    intent: intent ?? null,
    entities: {
      categoryLabel: category?.label ?? null,
      categoryKey: category?.key ?? null,
      count: countM ? { value: Number(countM[1]), unit: countM[2] } : null,
      lengthM: dims.lengthM,
      widthM: dims.widthM,
      areaM2: dims.areaM2,
      floors,
      budgetRp: budget,
      materials,
    },
    constraints,
    missing,
    conflicts,
    confidence,
    vague: goal === 'clarify' || (goal === 'build-rab' && missing.length >= 3),
    sourceText: safeText.slice(0, 500),
  };
}

/** Baris OBJEKTIF untuk builder kanonis (seksi ke-10, cap 800 karakter). */
export function formatObjectiveSection(objective: AgentObjective): string {
  const lines = [
    `Tujuan: ${objective.goalText} (goal: ${objective.goal}, keyakinan deterministik ${objective.confidence})`,
    objective.entities.categoryLabel ? `Kategori: ${objective.entities.categoryLabel}` : null,
    objective.entities.count ? `Jumlah: ${objective.entities.count.value} ${objective.entities.count.unit}` : null,
    objective.entities.lengthM != null && objective.entities.widthM != null
      ? `Dimensi: ${objective.entities.lengthM} m × ${objective.entities.widthM} m` : null,
    objective.entities.budgetRp != null ? `Budget: Rp${objective.entities.budgetRp.toLocaleString('id-ID')}` : null,
    objective.entities.materials.length > 0 ? `Material: ${objective.entities.materials.join(', ')}` : null,
    objective.constraints.length > 0 ? `Batasan: ${objective.constraints.join('; ')}` : null,
    objective.missing.length > 0 ? `Masih hilang: ${objective.missing.join('; ')}` : null,
    objective.conflicts.length > 0 ? `KONFLIK: ${objective.conflicts.map((c) => c.description).join('; ')}` : null,
  ].filter((l): l is string => l !== null);
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Rencana tugas                                                       */
/* ------------------------------------------------------------------ */

export type PlanStepStatus =
  | 'planned'
  | 'ready'
  | 'awaiting-approval'
  | 'running'
  | 'succeeded'
  | 'partially-succeeded'
  | 'failed'
  | 'cancelled'
  | 'blocked';

export type StepConsequence = 'read-only' | 'draft' | 'consequential';
export type PlanStepKind =
  | 'understand-objective'
  | 'collect-specs-questionnaire'
  | 'validate-spec-chain'
  | 'generate-draft'
  | 'verify-prices'
  | 'present-draft'
  | 'transfer-draft'
  | 'analyze-costs'
  | 'identify-expensive-items'
  | 'propose-alternatives'
  | 'search-ahsp'
  | 'answer-llm'
  | 'navigate'
  | 'explain-limits';

export interface PlanStep {
  id: string;
  kind: PlanStepKind;
  description: string;
  /** Tool/aksi yang dipakai (tools.ts atau actionRegistry/intent). */
  tool: string;
  action: string;
  /** Alasan pemilihan tool — tercatat, dapat dijelaskan (Part 7). */
  selectionReason: string;
  inputNeeded: string[];
  consequence: StepConsequence;
  status: PlanStepStatus;
  /** true bila langkah konsekwensial sudah disetujui pengguna (actor 'user'). */
  approvedByUser: boolean;
  dependsOn: string[];
  result: string | null;
  error: string | null;
  retryCount: number;
  startedAt: string | null;
  completedAt: string | null;
}

export type PlanStatus = 'active' | 'completed' | 'cancelled' | 'failed';

export interface TaskPlan {
  planId: string;
  schemaVersion: number;
  userId: string | null;
  projectId: string;
  conversationId: string | null;
  objective: AgentObjective;
  steps: PlanStep[];
  status: PlanStatus;
  iterationCount: number;
  createdAt: string;
  updatedAt: string;
  /** Penanda follow-up sudah disajikan ke pengguna (anti-spam). */
  followUpShownAt: string | null;
  /** Ringkasan pemulihan terakhir (apa yang tersisa + opsi). */
  recoveryNote: string | null;
}

function newId(prefix: string): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return `${prefix}-${c.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Pemetaan langkah → tool/aksi (jembatan ke Fase 5 — atas tool yang ADA). */
export const STEP_TOOL_SELECTION: Record<PlanStepKind, { tool: string; action: string; reason: string; consequence: StepConsequence }> = {
  'understand-objective': {
    tool: 'intentRouter.routeIntent', action: 'derive-objective',
    reason: 'Klasifikasi deterministik lokal (slash + pola NL Indonesia) — tanpa provider, tanpa karangan.',
    consequence: 'read-only',
  },
  'collect-specs-questionnaire': {
    tool: 'questionnaire.presentQuestionnaire', action: 'questionnaire-step',
    reason: 'Spek material hilang; mesin kuesioner adaptif yang ADA menanyakan hanya yang hilang (definisi = DATA per kategori).',
    consequence: 'draft',
  },
  'validate-spec-chain': {
    tool: 'specChain.validateDraftChain', action: 'validate-spec-chain',
    reason: 'Pemetaan spek→item deterministik + validasi 6 butir — tanpa LLM, tanpa harga karangan.',
    consequence: 'read-only',
  },
  'generate-draft': {
    tool: 'universalRab.buildUniversalDraft', action: 'generate-draft',
    reason: 'Draft disusun mesin katalog deterministik dari spek terstruktur; harga hanya dari AHSP resmi/resolver.',
    consequence: 'draft',
  },
  'verify-prices': {
    tool: 'cari_ahsp', action: 'verify-prices',
    reason: 'Verifikasi harga memakai tool AHSP resmi (officialAhspRepository → priceResolver2026), bukan ingatan model.',
    consequence: 'read-only',
  },
  'present-draft': {
    tool: 'chat.postAssistant', action: 'present-draft',
    reason: 'Draft ditampilkan sebagai pesan asisten untuk dibaca pengguna sebelum langkah konsekwensial apa pun.',
    consequence: 'read-only',
  },
  'transfer-draft': {
    tool: 'draftPersistence.markTransferred', action: 'push-rab',
    reason: 'Transfer menulis draft ke proyek (aksi tulis, mengubah state proyek) — konsekwensial, wajib persetujuan eksplisit.',
    consequence: 'consequential',
  },
  'analyze-costs': {
    tool: 'agentOrchestrator.analyzeDraftCosts', action: 'analyze-costs',
    reason: 'Analisis atas item draft NYATA (bukan direktori slash-command): item termahal + item tak berharga dihitung dari draft.',
    consequence: 'read-only',
  },
  'identify-expensive-items': {
    tool: 'agentOrchestrator.analyzeDraftCosts', action: 'identify-expensive-items',
    reason: 'Peringkat item termahal deterministik dari total draft — dasar optimasi yang dapat diverifikasi.',
    consequence: 'read-only',
  },
  'propose-alternatives': {
    tool: 'specChain.resolveDeterministicPick', action: 'propose-alternatives',
    reason: 'Alternatif material hanya dari padanan resmi yang ada di rantai spek — tidak dikarang.',
    consequence: 'draft',
  },
  'search-ahsp': {
    tool: 'cari_ahsp', action: 'search-ahsp',
    reason: 'Pencarian AHSP memakai tool resmi; kode tak ditemukan dijawab TIDAK DITEMUKAN tanpa substitusi.',
    consequence: 'read-only',
  },
  'answer-llm': {
    tool: 'EzrabAiService.send', action: 'llm-answer',
    reason: 'Pertanyaan penjelasan dijawab provider lewat builder kanonis (fakta + memori + objektif sebagai DATA).',
    consequence: 'read-only',
  },
  navigate: {
    tool: 'navRegistry.resolveNavCommand', action: 'navigate',
    reason: 'Navigasi deterministik lewat registry perintah — tanpa provider.',
    consequence: 'read-only',
  },
  'explain-limits': {
    tool: 'chat.postAssistant', action: 'explain-limits',
    reason: 'Tugas tak didukung dijelaskan jujur + ditawari alternatif yang didukung — bukan jawaban karangan.',
    consequence: 'read-only',
  },
};

/** Apakah langkah ini butuh persetujuan eksplisit pengguna? */
export function stepRequiresApproval(step: PlanStep): boolean {
  return step.consequence === 'consequential';
}

function makeStep(kind: PlanStepKind, description: string, inputNeeded: string[], dependsOn: string[]): PlanStep {
  const sel = STEP_TOOL_SELECTION[kind];
  return {
    id: newId('step'),
    kind,
    description,
    tool: sel.tool,
    action: sel.action,
    selectionReason: sel.reason,
    inputNeeded,
    consequence: sel.consequence,
    status: kind === 'understand-objective' ? 'succeeded' : 'planned',
    approvedByUser: false,
    dependsOn,
    result: kind === 'understand-objective' ? 'Objektif dipahami dari pesan pengguna.' : null,
    error: null,
    retryCount: 0,
    startedAt: null,
    completedAt: null,
  };
}

/** Objektif → rencana multi-langkah (template per goal; deterministik). */
export function buildPlanForObjective(
  objective: AgentObjective,
  scope: { userId: string | null; projectId: string; conversationId: string | null },
): TaskPlan {
  const steps: PlanStep[] = [];
  const push = (kind: PlanStepKind, description: string, inputNeeded: string[] = [], dependsOn: string[] = []): PlanStep => {
    const s = makeStep(kind, description, inputNeeded, dependsOn);
    steps.push(s);
    return s;
  };
  push('understand-objective', `Memahami tujuan: ${objective.goalText}`);
  const understandId = steps[0].id;
  switch (objective.goal) {
    case 'build-rab': {
      const q = push('collect-specs-questionnaire', 'Mengumpulkan spek yang hilang lewat kuesioner adaptif', objective.missing, [understandId]);
      const v = push('validate-spec-chain', 'Memvalidasi rantai spek → item (6 butir)', [], [q.id]);
      const g = push('generate-draft', 'Menyusun draft RAB dari spek terstruktur', [], [v.id]);
      const p = push('verify-prices', 'Memverifikasi harga tiap item ke AHSP resmi', [], [g.id]);
      const pr = push('present-draft', 'Menampilkan draft + item tak berharga secara jujur', [], [p.id]);
      const t = push('transfer-draft', 'Memindahkan draft ke proyek (butuh persetujuan Anda)', [], [pr.id]);
      t.status = 'awaiting-approval';
      break;
    }
    case 'optimize-cost': {
      const a = push('analyze-costs', 'Menganalisis draft aktif: total, item tak berharga, sebaran biaya', [], [understandId]);
      const i = push('identify-expensive-items', 'Mengidentifikasi item termahal penyumbang biaya', [], [a.id]);
      push('propose-alternatives', 'Mengusulkan alternatif material resmi yang lebih hemat', [], [i.id]);
      break;
    }
    case 'search-ahsp': {
      push('search-ahsp', 'Mencari harga satuan AHSP 2026 resmi', [], [understandId]);
      break;
    }
    case 'navigate': {
      push('navigate', 'Membuka menu/fitur yang diminta', [], [understandId]);
      break;
    }
    case 'unsupported': {
      push('explain-limits', 'Menjelaskan batasan + menawarkan alternatif yang didukung', [], [understandId]);
      break;
    }
    case 'greeting':
    case 'clarify':
    case 'explain':
    case 'create-project':
    default: {
      push('answer-llm', 'Menjawab lewat AI dengan konteks kanonis (fakta + memori + objektif)', [], [understandId]);
      break;
    }
  }
  const now = new Date().toISOString();
  return {
    planId: newId('plan'),
    schemaVersion: AGENT_PLAN_SCHEMA_VERSION,
    userId: scope.userId,
    projectId: scope.projectId,
    conversationId: scope.conversationId,
    objective,
    steps,
    status: 'active',
    iterationCount: 1,
    createdAt: now,
    updatedAt: now,
    followUpShownAt: null,
    recoveryNote: null,
  };
}

export function derivePlanStatus(plan: TaskPlan): PlanStatus {
  if (plan.status === 'cancelled') return 'cancelled';
  if (plan.steps.length > 0 && plan.steps.every((s) => s.status === 'succeeded' || s.status === 'partially-succeeded' || s.status === 'cancelled')) return 'completed';
  if (plan.steps.some((s) => s.status === 'failed' || s.status === 'blocked')) return 'active';
  return 'active';
}

/** Langkah berikutnya yang dapat dijalankan (dependensi selesai). */
export function nextReadyStep(plan: TaskPlan): PlanStep | null {
  const done = new Set(plan.steps.filter((s) => s.status === 'succeeded' || s.status === 'partially-succeeded' || s.status === 'cancelled').map((s) => s.id));
  for (const s of plan.steps) {
    if (s.status === 'planned' || s.status === 'ready') {
      if (s.dependsOn.every((d) => done.has(d))) return s;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Persistensi rencana (pola draftPersistence — kunci saudara)          */
/* ------------------------------------------------------------------ */

type PlanMap = Record<string, TaskPlan>;

function readMap(): PlanMap {
  const res = loadVersioned<PlanMap>(AI_AGENT_PLANS_STORAGE_KEY);
  if (!res.ok) return {};
  if (!res.data || typeof res.data !== 'object' || Array.isArray(res.data)) return {};
  return res.data;
}

export function savePlan(plan: TaskPlan): boolean {
  if (!plan.projectId || !plan.planId) return false;
  if (containsSecret(JSON.stringify(plan.objective.sourceText))) return false;
  const next: PlanMap = { ...readMap(), [plan.planId]: { ...plan, updatedAt: new Date().toISOString(), status: derivePlanStatus(plan) } };
  const saved = saveVersioned(AI_AGENT_PLANS_STORAGE_KEY, next);
  return saved.ok;
}

export function loadPlan(planId: string): TaskPlan | null {
  const plan = readMap()[planId] ?? null;
  if (!plan || plan.schemaVersion !== AGENT_PLAN_SCHEMA_VERSION) return null;
  return plan;
}

/** Rencana aktif terbaru untuk proyek (+ percakapan bila diberikan). */
export function loadActivePlanForProject(projectId: string, conversationId?: string | null): TaskPlan | null {
  const plans = Object.values(readMap())
    .filter((p) => p.projectId === projectId && p.status === 'active')
    .filter((p) => (conversationId ? p.conversationId === conversationId : true))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return plans[0] ?? null;
}

export function listPlansForProject(projectId: string): TaskPlan[] {
  return Object.values(readMap())
    .filter((p) => p.projectId === projectId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function deletePlan(planId: string): void {
  const map = readMap();
  if (!map[planId]) return;
  delete map[planId];
  saveVersioned(AI_AGENT_PLANS_STORAGE_KEY, map);
}

/* ------------------------------------------------------------------ */
/* Approval gate — ditegakkan di kode, bukan di prompt                  */
/* ------------------------------------------------------------------ */

export type ApprovalActor = 'user' | 'model' | 'system';

/**
 * Menyetujui langkah konsekwensial. HANYA actor 'user' yang dapat
 * menyetujui; model/system TIDAK PERNAH dapat memberi dirinya izin
 * (permintaan dari actor lain ditolak dan dicatat sebagai error).
 */
export function approveStep(
  plan: TaskPlan,
  stepId: string,
  actor: ApprovalActor,
): { ok: boolean; plan: TaskPlan; error?: string } {
  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, plan, error: 'Langkah tidak ditemukan.' };
  if (actor !== 'user') {
    return { ok: false, plan, error: 'APPROVAL_SELF_GRANT_DENIED: hanya pengguna yang dapat menyetujui aksi konsekwensial — model tidak pernah memberi dirinya izin.' };
  }
  if (!stepRequiresApproval(step)) {
    return { ok: false, plan, error: 'Langkah ini tidak butuh persetujuan (baca-saja/draft).' };
  }
  const next: TaskPlan = {
    ...plan,
    steps: plan.steps.map((s) => (s.id === stepId ? { ...s, approvedByUser: true, status: 'ready' as PlanStepStatus } : s)),
    updatedAt: new Date().toISOString(),
  };
  return { ok: true, plan: next };
}

export function denyStep(plan: TaskPlan, stepId: string, actor: ApprovalActor): { ok: boolean; plan: TaskPlan; error?: string } {
  if (actor !== 'user') return { ok: false, plan, error: 'APPROVAL_SELF_GRANT_DENIED: hanya pengguna yang dapat menolak aksi konsekwensial.' };
  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, plan, error: 'Langkah tidak ditemukan.' };
  const next: TaskPlan = {
    ...plan,
    steps: plan.steps.map((s) => (s.id === stepId ? { ...s, status: 'cancelled' as PlanStepStatus, result: 'Ditolak pengguna — tidak dieksekusi.' } : s)),
    updatedAt: new Date().toISOString(),
  };
  return { ok: true, plan: next };
}

export type StepRunner = (step: PlanStep, plan: TaskPlan) => Promise<{ ok: boolean; result?: string; partial?: boolean; error?: string }>;

/**
 * Menjalankan SATU langkah dengan gate. Urutan penegakan:
 *  1. Langkah konsekwensial tanpa `approvedByUser` → DITOLAK sebelum
 *     runner dipanggil (runner tidak pernah berjalan).
 *  2. Runner gagal → langkah 'failed', langkah sukses sebelumnya UTUH,
 *     hasil parsial (partial=true) → 'partially-succeeded' + dilaporkan
 *     jujur, bukan diganti jawaban karangan.
 *  3. Retry hanya langkah ini (retryCount, maks 2) — tidak ada
 *     pengulangan operasi berbayar di sini: runner yang sama tidak
 *     dipanggil ulang otomatis oleh modul ini.
 */
export async function executeStep(
  plan: TaskPlan,
  stepId: string,
  runner: StepRunner,
): Promise<{ ok: boolean; plan: TaskPlan; error?: string }> {
  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, plan, error: 'Langkah tidak ditemukan.' };
  if (step.status === 'succeeded' || step.status === 'cancelled') {
    return { ok: false, plan, error: `Langkah sudah ${step.status} — tidak dijalankan ulang.` };
  }
  if (stepRequiresApproval(step) && !step.approvedByUser) {
    const next: TaskPlan = {
      ...plan,
      steps: plan.steps.map((s) => (s.id === stepId ? { ...s, status: 'awaiting-approval' as PlanStepStatus } : s)),
      updatedAt: new Date().toISOString(),
    };
    return { ok: false, plan: next, error: 'APPROVAL_REQUIRED: aksi konsekwensial menunggu persetujuan eksplisit pengguna.' };
  }
  const running: TaskPlan = {
    ...plan,
    steps: plan.steps.map((s) => (s.id === stepId ? { ...s, status: 'running' as PlanStepStatus, startedAt: new Date().toISOString() } : s)),
  };
  let outcome: { ok: boolean; result?: string; partial?: boolean; error?: string };
  try {
    outcome = await runner(step, running);
  } catch (e) {
    outcome = { ok: false, error: e instanceof Error ? e.message : 'Runner gagal tanpa pesan.' };
  }
  const now = new Date().toISOString();
  const next: TaskPlan = {
    ...running,
    steps: running.steps.map((s) => {
      if (s.id !== stepId) return s;
      if (outcome.ok) {
        return { ...s, status: outcome.partial ? 'partially-succeeded' as PlanStepStatus : 'succeeded' as PlanStepStatus, result: outcome.result ?? 'Selesai.', error: null, completedAt: now };
      }
      return { ...s, status: 'failed' as PlanStepStatus, error: outcome.error ?? 'Langkah gagal tanpa alasan.', completedAt: now };
    }),
    updatedAt: now,
  };
  next.status = derivePlanStatus(next);
  return { ok: outcome.ok, plan: next, error: outcome.ok ? undefined : outcome.error };
}

/* ------------------------------------------------------------------ */
/* FASE 6 — sinkronisasi status langkah dari hasil eksekusi registry    */
/*                                                                     */
/* Fase 5 menjalankan langkah rencana lewat registry (runPlanStepWith- */
/* Registry) dari tombol Setujui, tetapi hasilnya hanya diposting      */
/* sebagai pesan chat — status langkah di panel tetap 'ready'. Fungsi  */
/* murni di bawah memetakan hasil eksekusi registry ke status langkah: */
/* selesai / selesai-sebagian / gagal / terhenti (+ alasan).           */
/*                                                                     */
/* Aturan kejujuran transfer-draft: tool registry `transfer_draft`     */
/* HANYA memeriksa kesiapan — ia tidak memindahkan apa pun. Sukses     */
/* readiness check BUKAN sukses transfer: langkah tetap pada           */
/* statusnya (ready) dengan `result` yang mencatat verifikasi          */
/* kesiapan, KECUALI bila transfer benar-benar sudah terjadi           */
/* (transferCompleted — draft sudah punya lastTransfer untuk versi     */
/* ini, atau push-rab baru saja terverifikasi sukses). Kegagalan       */
/* readiness (draft tidak ada / versi tidak cocok / diblokir)          */
/* menandai langkah 'failed'/'blocked' beserta alasannya —             */
/* persetujuan pengguna TIDAK dicabut (approvedByUser tetap true):     */
/* yang gagal adalah pemeriksaannya, bukan izinnya.                    */
/*                                                                     */
/* Fungsi ini TIDAK menyentuh approval gate: ia tidak pernah           */
/* menetapkan approvedByUser dan tidak pernah mengubah status          */
/* 'awaiting-approval' menjadi 'ready' — itu wewenang approveStep     */
/* (actor 'user' saja). Gate melindungi EKSEKUSI, bukan pencatatan    */
/* status: eksekusi registry sudah digerbang executeTool, dan          */
/* transfer push-rab sudah merupakan aksi klik pengguna sendiri.       */
/* ------------------------------------------------------------------ */

/** Status terminal registry yang dapat dipetakan ke status langkah. */
export type RegistryOutcomeStatus =
  | 'succeeded'
  | 'partially-succeeded'
  | 'failed'
  | 'blocked';

export interface RegistryStepOutcome {
  status: RegistryOutcomeStatus;
  /** Ringkasan output (→ result) atau alasan kegagalan (→ error). */
  message: string;
  /**
   * true bila transfer draft BENAR-BENAR sudah terjadi (bukan sekadar
   * kesiapan terverifikasi). Dipakai hanya untuk langkah transfer-draft.
   */
  transferCompleted?: boolean;
}

/**
 * Memetakan SATU hasil eksekusi registry ke status langkah rencana.
 * Murni (tanpa I/O): pemanggil yang mem-persist rencana hasilnya.
 * Langkah terminal ('succeeded'/'cancelled') tidak pernah ditimpa —
 * hasil yang datang terlambat tidak merusak status yang sudah final.
 * Langkah lain dalam rencana tidak disentuh.
 */
export function applyRegistryOutcomeToStep(
  plan: TaskPlan,
  stepId: string,
  outcome: RegistryStepOutcome,
): { ok: boolean; plan: TaskPlan; error?: string } {
  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, plan, error: 'Langkah tidak ditemukan.' };
  if (step.status === 'succeeded' || step.status === 'cancelled') {
    return { ok: false, plan, error: `Langkah sudah ${step.status} — hasil registry tidak menimpa status terminal.` };
  }
  const now = new Date().toISOString();
  // transfer-draft: sukses registry = kesiapan terverifikasi, BUKAN
  // transfer selesai — kecuali transferCompleted. Status dipertahankan
  // (ready), hasil dicatat agar panel menampilkan outcome-nya.
  if (step.kind === 'transfer-draft' && outcome.status === 'succeeded' && !outcome.transferCompleted) {
    const next: TaskPlan = {
      ...plan,
      steps: plan.steps.map((s) => (s.id === stepId ? { ...s, result: outcome.message, error: null } : s)),
      updatedAt: now,
    };
    return { ok: true, plan: next };
  }
  const mapped: PlanStepStatus =
    outcome.status === 'succeeded' ? 'succeeded'
    : outcome.status === 'partially-succeeded' ? 'partially-succeeded'
    : outcome.status === 'blocked' ? 'blocked'
    : 'failed';
  const next: TaskPlan = {
    ...plan,
    steps: plan.steps.map((s) => {
      if (s.id !== stepId) return s;
      if (mapped === 'succeeded' || mapped === 'partially-succeeded') {
        return { ...s, status: mapped, result: outcome.message, error: null, completedAt: now };
      }
      return { ...s, status: mapped, error: outcome.message, completedAt: now };
    }),
    updatedAt: now,
  };
  next.status = derivePlanStatus(next);
  return { ok: true, plan: next };
}

/**
 * FASE 6 — menandai langkah transfer-draft selesai sesudah transfer
 * terverifikasi (push-rab). Mencari langkah berdasarkan kind, bukan id
 * (pemanggil UI tidak menyimpan id langkah). No-op bila rencana tidak
 * punya langkah transfer-draft atau langkah itu sudah terminal.
 */
export function markTransferStepCompleted(plan: TaskPlan, message: string): TaskPlan {
  const step = plan.steps.find((s) => s.kind === 'transfer-draft');
  if (!step) return plan;
  return applyRegistryOutcomeToStep(plan, step.id, { status: 'succeeded', message, transferCompleted: true }).plan;
}

/**
 * GELOMBANG PERBAIKI SEMUA (temuan Fase 6 §11.5) — menandai langkah
 * collect-specs-questionnaire selesai sesudah jawaban kuesioner
 * DITERIMA registry (brief tinjauan, bukan kartu tanya-ulang).
 * Sebelumnya langkah ini ditandai `running` saat kartu tampil
 * (view.tsx postAssistant) tetapi tidak pernah ditandai `succeeded`,
 * sehingga tetap `running` di rencana tersimpan lintas reload.
 * Mencari langkah berdasarkan kind (pemanggil UI tidak menyimpan id
 * langkah). No-op bila rencana tidak punya langkah kuesioner atau
 * langkah itu sudah terminal (applyRegistryOutcomeToStep menolak
 * menimpa status terminal — hasil terlambat tidak merusaknya).
 */
export function markQuestionnaireStepCompleted(plan: TaskPlan, message: string): TaskPlan {
  const step = plan.steps.find((s) => s.kind === 'collect-specs-questionnaire');
  if (!step) return plan;
  return applyRegistryOutcomeToStep(plan, step.id, { status: 'succeeded', message }).plan;
}

/** Retry SATU langkah gagal (bukan seluruh rencana); maks 2×. */
export function retryStep(plan: TaskPlan, stepId: string): { ok: boolean; plan: TaskPlan; error?: string } {
  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, plan, error: 'Langkah tidak ditemukan.' };
  if (step.status !== 'failed' && step.status !== 'blocked') {
    return { ok: false, plan, error: `Hanya langkah gagal/blocked yang dapat diulang (status kini: ${step.status}).` };
  }
  if (step.retryCount >= AGENT_MAX_STEP_RETRIES) {
    return { ok: false, plan, error: `Batas retry tercapai (${AGENT_MAX_STEP_RETRIES}×) — minta pengguna memutuskan (lewati / ubah input).` };
  }
  const next: TaskPlan = {
    ...plan,
    steps: plan.steps.map((s) => (s.id === stepId ? { ...s, status: 'ready' as PlanStepStatus, retryCount: s.retryCount + 1, error: null } : s)),
    updatedAt: new Date().toISOString(),
  };
  return { ok: true, plan: next };
}

export function skipStep(plan: TaskPlan, stepId: string): { ok: boolean; plan: TaskPlan; error?: string } {
  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, plan, error: 'Langkah tidak ditemukan.' };
  if (step.status === 'succeeded') return { ok: false, plan, error: 'Langkah sukses tidak dapat dilewati.' };
  const next: TaskPlan = {
    ...plan,
    steps: plan.steps.map((s) => (s.id === stepId ? { ...s, status: 'cancelled' as PlanStepStatus, result: 'Dilewati atas pilihan pengguna — langkah lain tetap berjalan.' } : s)),
    updatedAt: new Date().toISOString(),
  };
  return { ok: true, plan: next };
}

/* ------------------------------------------------------------------ */
/* Perubahan arah — replan aman (langkah sukses dipertahankan)          */
/* ------------------------------------------------------------------ */

/**
 * Pengguna berubah arah: objektif baru → rencana baru, TAPI langkah
 * yang sudah 'succeeded'/'partially-succeeded' dipertahankan sebagai
 * langkah selesai (bukan diulang), dan iterasi dibatasi (maks 5).
 */
export function replanForNewObjective(
  plan: TaskPlan,
  newObjective: AgentObjective,
): { ok: boolean; plan: TaskPlan; error?: string } {
  if (plan.iterationCount >= AGENT_MAX_PLAN_ITERATIONS) {
    return { ok: false, plan, error: `Batas iterasi rencana tercapai (${AGENT_MAX_PLAN_ITERATIONS}) — selesaikan atau batalkan rencana ini dulu.` };
  }
  const kept = plan.steps.filter((s) => s.status === 'succeeded' || s.status === 'partially-succeeded');
  const fresh = buildPlanForObjective(newObjective, {
    userId: plan.userId, projectId: plan.projectId, conversationId: plan.conversationId,
  });
  // Langkah 'understand-objective' baru menggantikan yang lama; langkah
  // sukses lama dipertahankan (hasilnya tetap berlaku).
  const keptSteps = kept.filter((s) => s.kind !== 'understand-objective');
  const next: TaskPlan = {
    ...fresh,
    planId: plan.planId,
    steps: [...fresh.steps, ...keptSteps],
    iterationCount: plan.iterationCount + 1,
    createdAt: plan.createdAt,
    followUpShownAt: plan.followUpShownAt,
    recoveryNote: `Rencana disusun ulang (iterasi ${plan.iterationCount + 1}/${AGENT_MAX_PLAN_ITERATIONS}). ${keptSteps.length} langkah sukses dipertahankan, tidak diulang.`,
  };
  next.status = derivePlanStatus(next);
  return { ok: true, plan: next };
}

/* ------------------------------------------------------------------ */
/* Follow-up proaktif                                                  */
/* ------------------------------------------------------------------ */

export interface FollowUpItem {
  kind: 'blocked-step' | 'failed-step' | 'missing-spec' | 'draft-not-transferred' | 'pending-approval' | 'revision-pending';
  text: string;
  suggestedNext: string;
}

export function getPendingFollowUps(plan: TaskPlan): FollowUpItem[] {
  const items: FollowUpItem[] = [];
  for (const s of plan.steps) {
    if (s.status === 'blocked') items.push({ kind: 'blocked-step', text: `Langkah terhenti: ${s.description}`, suggestedNext: 'Periksa input yang dibutuhkan, lalu coba lagi langkah ini saja.' });
    if (s.status === 'failed') items.push({ kind: 'failed-step', text: `Langkah gagal: ${s.description}${s.error ? ` — ${s.error}` : ''}`, suggestedNext: 'Coba lagi langkah ini saja, lewati, atau beri input yang berbeda.' });
    if (s.status === 'awaiting-approval') items.push({ kind: 'pending-approval', text: `Menunggu persetujuan Anda: ${s.description}`, suggestedNext: 'Setujui untuk melanjutkan, atau tolak bila tidak jadi.' });
  }
  if (plan.objective.missing.length > 0 && plan.status === 'active') {
    items.push({ kind: 'missing-spec', text: `Spek belum ditentukan: ${plan.objective.missing.join(', ')}.`, suggestedNext: 'Jawab kuesioner singkatnya, atau ketik datanya langsung di chat.' });
  }
  const draftDone = plan.steps.some((s) => s.kind === 'generate-draft' && (s.status === 'succeeded' || s.status === 'partially-succeeded'));
  const transfer = plan.steps.find((s) => s.kind === 'transfer-draft');
  if (draftDone && transfer && transfer.status !== 'succeeded' && transfer.status !== 'cancelled') {
    items.push({ kind: 'draft-not-transferred', text: 'Draft RAB sudah tersusun tetapi belum dipindahkan ke proyek.', suggestedNext: 'Setujui pemindahan draft bila sudah sesuai, atau minta revisi dulu.' });
  }
  return items;
}

/** Pesan kelanjutan saat pengguna kembali (di dalam chat, bukan toast). */
export function formatFollowUpMessage(plan: TaskPlan): string | null {
  const items = getPendingFollowUps(plan);
  if (items.length === 0) return null;
  const lines = items.map((it, i) => `${i + 1}. ${it.text}\n   → ${it.suggestedNext}`);
  return `Selamat datang kembali — pekerjaan Anda yang belum selesai:\n${lines.join('\n')}\n\nKetik "lanjut" untuk melanjutkan langkah berikut, atau pilih salah satu di atas.`;
}

/* ------------------------------------------------------------------ */
/* Analisis biaya draft (AGT-05 — BUKAN direktori slash-command)       */
/* ------------------------------------------------------------------ */

export interface DraftCostItem {
  description: string;
  totalPrice: number;
  priceStatus?: string | null;
  unitPrice?: number | null;
}

export interface CostAnalysis {
  itemCount: number;
  pricedCount: number;
  unresolvedCount: number;
  totalPricedRp: number;
  mostExpensive: DraftCostItem[];
  unresolvedItems: DraftCostItem[];
  suggestions: string[];
}

export function analyzeDraftCosts(items: DraftCostItem[]): CostAnalysis {
  const priced = items.filter((it) => it.priceStatus !== 'PRICE_UNRESOLVED' && it.unitPrice !== null && it.unitPrice !== undefined);
  const unresolved = items.filter((it) => it.priceStatus === 'PRICE_UNRESOLVED' || it.unitPrice === null || it.unitPrice === undefined);
  const sorted = [...priced].sort((a, b) => b.totalPrice - a.totalPrice);
  const total = priced.reduce((acc, it) => acc + it.totalPrice, 0);
  const suggestions: string[] = [];
  if (unresolved.length > 0) {
    suggestions.push(`${unresolved.length} item belum punya harga resmi — tentukan harganya dulu sebelum optimasi, karena total saat ini parsial (bukan total penuh).`);
  }
  if (sorted.length > 0) {
    const top = sorted[0];
    const share = total > 0 ? Math.round((top.totalPrice / total) * 100) : 0;
    suggestions.push(`Item termahal: "${top.description}" Rp${Math.round(top.totalPrice).toLocaleString('id-ID')} (${share}% dari total berharga) — mulai optimasi dari sini.`);
    if (sorted.length >= 3) {
      const top3 = sorted.slice(0, 3).reduce((acc, it) => acc + it.totalPrice, 0);
      suggestions.push(`3 item teratas menyumbang Rp${Math.round(top3).toLocaleString('id-ID')} (${total > 0 ? Math.round((top3 / total) * 100) : 0}% dari total berharga).`);
    }
  }
  if (items.length === 0) suggestions.push('Belum ada draft aktif untuk dianalisis — susun draft RAB dulu.');
  return {
    itemCount: items.length,
    pricedCount: priced.length,
    unresolvedCount: unresolved.length,
    totalPricedRp: Math.round(total),
    mostExpensive: sorted.slice(0, 3),
    unresolvedItems: unresolved,
    suggestions,
  };
}

export function formatCostAnalysis(analysis: CostAnalysis): string {
  const lines = [
    `Analisis biaya draft: ${analysis.pricedCount} item berharga (total Rp${analysis.totalPricedRp.toLocaleString('id-ID')})`
    + (analysis.unresolvedCount > 0 ? `, ${analysis.unresolvedCount} item belum berharga (total parsial).` : ', semua item berharga.'),
  ];
  for (const it of analysis.mostExpensive) {
    lines.push(`• Termahal: ${it.description} — Rp${Math.round(it.totalPrice).toLocaleString('id-ID')}`);
  }
  for (const s of analysis.suggestions) lines.push(`→ ${s}`);
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Konsolidasi memori long-term (deterministik)                        */
/* ------------------------------------------------------------------ */

export interface ConsolidationResult {
  promoted: number;
  skipped: number;
  promotedKeys: string[];
  skippedReasons: string[];
}

/**
 * Konsolidasi deterministik: record project/conversation yang
 * `confirmed-fact` + importance ≥ 2 + bertipe decision/spec/fact
 * dipromosikan ke lapis 'long-term' (kunci `lt:<memoryKey>`),
 * provenans + versi tercatat. Yang TIDAK dipromosikan: asumsi,
 * saran AI, record bertentangan, record kedaluwarsa, dan yang sudah
 * ada long-term-nya. Tanpa LLM — lihat `requestLlmMemoryExtraction`.
 */
export function consolidateToLongTerm(scope: MemoryScope): ConsolidationResult {
  const result: ConsolidationResult = { promoted: 0, skipped: 0, promotedKeys: [], skippedReasons: [] };
  const listed = listMemories(scope, { statuses: ['current'] });
  if (!listed.ok) { result.skippedReasons.push(`Gagal membaca memori: ${listed.message}`); return result; }
  const records = listed.value;
  for (const rec of records) {
    const ltKey = `lt:${rec.memoryKey}`;
    if (rec.layer === 'long-term' || rec.layer === 'knowledge') { result.skipped++; result.skippedReasons.push(`${rec.memoryKey}: sudah long-term/knowledge`); continue; }
    if (rec.quality !== 'confirmed-fact') { result.skipped++; result.skippedReasons.push(`${rec.memoryKey}: kualitas ${rec.quality}, bukan confirmed-fact`); continue; }
    if (rec.importance < 2) { result.skipped++; result.skippedReasons.push(`${rec.memoryKey}: importance ${rec.importance} < 2`); continue; }
    if (!['decision', 'spec', 'fact'].includes(rec.memoryType)) { result.skipped++; result.skippedReasons.push(`${rec.memoryKey}: tipe ${rec.memoryType}`); continue; }
    if (getCurrentMemory(scope, ltKey)) { result.skipped++; result.skippedReasons.push(`${rec.memoryKey}: sudah ada long-term`); continue; }
    const created = createMemoryRecord({
      userId: rec.userId,
      projectId: rec.projectId,
      conversationId: null,
      memoryKey: ltKey,
      layer: 'long-term',
      memoryType: rec.memoryType,
      content: rec.content,
      structuredPayload: { ...rec.structuredPayload, derivedFrom: rec.memoryId, consolidatedFromLayer: rec.layer },
      sourceMessageId: rec.sourceMessageId,
      sourceType: 'system-consolidation',
      provenance: `konsolidasi deterministik Fase 3 dari ${rec.memoryKey} (${rec.provenance})`,
      quality: 'confirmed-fact',
      confidence: rec.confidence,
      importance: rec.importance,
    });
    if (!created.ok) { result.skipped++; result.skippedReasons.push(`${rec.memoryKey}: ${created.message}`); continue; }
    const saved = saveMemory(created.value);
    if (!saved.ok) { result.skipped++; result.skippedReasons.push(`${rec.memoryKey}: ${saved.message}`); continue; }
    result.promoted++;
    result.promotedKeys.push(ltKey);
  }
  return result;
}

/**
 * Jalur ekstraksi memori LLM — TIDAK DIBANGUN di Fase 3.
 * Alasan: ekstraksi LLM dapat mengarang memori (fakta yang tidak
 * dinyatakan pengguna) dan belum ada gerbang anti-karangan yang
 * teruji; panggilan provider dibatasi pola Wave D ≤15/sesi dan hanya
 * bila terbukti aman — ambang itu belum terpenuhi. Fungsi ini menolak
 * secara eksplisit agar tidak ada pemanggil yang mengira jalur ini ada.
 * Batasan ini diteruskan ke Fase 4/5 sebagai keputusan owner.
 */
export function requestLlmMemoryExtraction(): {
  ok: false;
  error: 'LLM_EXTRACTION_NOT_BUILT';
  message: string;
} {
  return {
    ok: false,
    error: 'LLM_EXTRACTION_NOT_BUILT',
    message: 'Ekstraksi memori LLM tidak dibangun di Fase 3 (risiko karangan belum tergerbang; konsolidasi deterministik yang dipakai). Keputusan owner diperlukan sebelum jalur ini dibangun.',
  };
}

/* ------------------------------------------------------------------ */
/* Ringkasan rencana untuk UI                                          */
/* ------------------------------------------------------------------ */

export function formatPlanSummary(plan: TaskPlan): string {
  const done = plan.steps.filter((s) => s.status === 'succeeded' || s.status === 'partially-succeeded').length;
  const lines = [
    `Rencana: ${plan.objective.goalText}`,
    `Progres: ${done}/${plan.steps.length} langkah selesai (status: ${plan.status}).`,
  ];
  for (const s of plan.steps) {
    const mark = s.status === 'succeeded' ? '✓' : s.status === 'partially-succeeded' ? '◐' : s.status === 'failed' ? '✗' : s.status === 'awaiting-approval' ? '⏸ menunggu persetujuan' : s.status === 'blocked' ? '■ terhenti' : s.status === 'cancelled' ? '— dibatalkan' : s.status === 'running' ? '… berjalan' : '○';
    lines.push(`${mark} ${s.description} [${s.tool} — ${s.consequence}]`);
    if (s.error) lines.push(`   Gagal: ${s.error}`);
    if (s.result && s.status !== 'succeeded') lines.push(`   Hasil: ${s.result}`);
  }
  if (plan.recoveryNote) lines.push(plan.recoveryNote);
  return lines.join('\n');
}
