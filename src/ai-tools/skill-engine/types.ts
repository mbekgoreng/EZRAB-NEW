/**
 * EZRAB AI — Skill Engine: tipe kontrak skill (BARU, Phase 2 Workstream 3).
 *
 * Lapisan skill tipis DI ATAS AI Core kanonis yang sudah ada (toolRegistry,
 * agentOrchestrator, commands/, executionRuntime, unifiedConversationStore).
 * Modul ini TIDAK mengimpor kode repo lain kecuali tipe data murni
 * (quickActionContracts) — tidak ada ketergantungan pada toolRegistry
 * runtime (graf impornya menarik database harga multi-MB) maupun pada
 * pohon server Express (dorman; tetap dorman sampai VPS siap).
 *
 * Keputusan owner yang dipatuhi di sini:
 * - (A) Paralelisme: skill read-only independen boleh paralel HANYA bila
 *   mendeklarasikan parallelSafe; skill mutasi serial per proyek.
 * - (B) Budget: TIDAK ada ledger kredit kedua dan TIDAK ada billing di
 *   Skill Engine — hanya metadata pemakaian + observabilitas; pengenaan
 *   biaya di masa depan lewat layanan kredit kanonis (1 kredit = 200 token).
 * - (C) Kode AI mati + server Express: lifecycle konservatif — modul ini
 *   tidak menghapus, memindah, atau menghidupkan apa pun.
 * - (D) MagicAiSuperView bukan mesin DED ketiga — konsolidasi DED adalah
 *   rencana (MIGRATION-PLAN.md), bukan kode di sini.
 *
 * Catatan kejujuran (K-03 terbuka): envelope eksekusi TIDAK membawa skop
 * tenant — isolasi tenant belum ada di repo (AUTH belum flip) dan modul ini
 * tidak memalsukannya. userId boleh null (pola kanonis hari ini).
 */

/** Taksonomi peran server — satu-satunya taksonomi yang dipakai kontrak skill. */
export type SkillRole = 'SUPER_ADMIN' | 'ESTIMATOR' | 'DIREKSI' | 'CLIENT' | 'EDITOR';

export const SERVER_ROLE_TAXONOMY: readonly SkillRole[] = [
  'SUPER_ADMIN',
  'ESTIMATOR',
  'DIREKSI',
  'CLIENT',
  'EDITOR',
];

/**
 * Empat peran yang dipakai QuickActionContract (dan semua skill yang
 * dimigrasikan dari sana). EDITOR ada di taksonomi server tapi TIDAK PERNAH
 * dipakai kontrak mana pun — kesenjangan K-16. Definisi "skill terbuka"
 * untuk jembatan tanpa-peran memakai keempat peran ini (semesta authoring
 * skill hari ini): skill yang mengizinkan keempatnya tidak membatasi siapa
 * pun di dalam semesta itu. EDITOR sebagai pemanggil tetap dievaluasi
 * terhadap allowedRoles per skill (ROLE_NOT_ALLOWED bila tidak tercantum).
 */
export const CONTRACT_ROLE_TAXONOMY: readonly SkillRole[] = [
  'SUPER_ADMIN',
  'ESTIMATOR',
  'DIREKSI',
  'CLIENT',
];

/**
 * Taksonomi peran demo klien (src/auth/roleAccounts.ts). TIDAK dipetakan ke
 * taksonomi server (K-16 terbuka — keputusan owner). Executor gagal tertutup
 * (ROLE_NOT_MAPPED) bila menerima peran demo, tidak pernah menebak padanannya.
 */
export const DEMO_ROLE_TAXONOMY: readonly string[] = [
  'qs',
  'estimator',
  'kontraktor',
  'konsultan',
  'team',
];

export type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE';

export const SUBSCRIPTION_ORDER: Record<SubscriptionTier, number> = {
  FREE: 0,
  PRO: 1,
  ENTERPRISE: 2,
};

export type SkillRiskLevel = 'READ_ONLY' | 'POTENTIAL_MUTATION' | 'MUTATION';

/** Status eksekusi satu skill-run (cermin AiExecutionStatus + awaiting-approval). */
export type SkillExecutionStatus =
  | 'pending'
  | 'running'
  | 'awaiting-approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Kanal pemanggil — cermin ToolChannel; 'copilot' adalah kanal jawab-saja. */
export type SkillChannel = 'chat-ai' | 'copilot' | 'orchestrator' | 'ded' | 'test';

export type SkillTriggerKind = 'intent' | 'quick-action' | 'slash' | 'menu';

export interface SkillTrigger {
  kind: SkillTriggerKind;
  /** Nilai trigger: id intent ChatIntent, id Quick Action, atau perintah slash. */
  value: string;
}

export type SkillSchemaFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'file'
  | 'object'
  | 'array';

export interface SkillSchemaField {
  name: string;
  label?: string;
  type: SkillSchemaFieldType;
  required: boolean;
  /** Nilai yang diizinkan (wajib diisi untuk type 'select'). */
  enum?: string[];
  min?: number;
  max?: number;
  pattern?: string;
  description?: string;
}

export interface SkillInputSchema {
  fields: SkillSchemaField[];
}

export interface SkillOutputSchema {
  fields: SkillSchemaField[];
  description?: string;
}

export interface SkillApprovalPolicy {
  /** true = eksekusi tidak boleh jalan tanpa persetujuan eksplisit user. */
  requiresApproval: boolean;
  /** Hanya 'user' yang boleh menyetujui (pola agentOrchestrator). */
  approver: 'user';
  /** TTL persetujuan dalam ms; default 10 menit (pola G1 transfer). */
  ttlMs?: number;
}

export interface SkillTimeoutPolicy {
  timeoutMs: number;
}

export interface SkillRetryPolicy {
  /** Jumlah total percobaan termasuk yang pertama (1 = tanpa retry). */
  maxAttempts: number;
  backoffMs: number;
  /** Kode error yang boleh di-retry; di luar daftar ini gagal permanen. */
  retryableErrors: string[];
}

/**
 * Metadata pemakaian per skill (Keputusan B). OBSERVABILITAS SAJA — modul ini
 * tidak pernah mendebit, menagih, atau menggerbang saldo. Estimasi biaya
 * hanya boleh diisi bila basisnya OBSERVED (diukur dari run nyata); selama
 * belum ada run yang terukur, estimatedCredits WAJIB null (anti-fabrikasi).
 */
export interface SkillUsageMetadata {
  observability: true;
  estimatedCostBasis: 'UNMEASURED' | 'OBSERVED';
  /** Estimasi kredit per run; null bila UNMEASURED. */
  estimatedCredits: number | null;
  notes: string;
}

/**
 * Jejak tool kontrak asal yang TIDAK ada di registry tool live. Tidak ada
 * referensi menggantung: setiap toolName kontrak dicatat di sini dengan
 * resolusinya (dipetakan / diuraikan / tanpa padanan live).
 */
export interface UnsupportedToolReference {
  /** Nama tool menurut kontrak asal (penamaan server/Quick Action). */
  contractTool: string;
  reason: string;
  resolution: 'mapped-to-live-tool' | 'decomposed-to-live-tools' | 'no-live-tool';
  /** Tool live yang menggantikannya (kosong bila no-live-tool). */
  liveTools: string[];
}

export type DedMode = 'EZRAB_AI' | 'FULL_AI';

/**
 * Keluarga sumber data DED — cermin DedDataSourceAccess di
 * ded-full-ai/dataSourcePolicy.ts (satu-satunya sumber kebenaran gerbang;
 * modul ini hanya memakainya untuk validasi definisi skill).
 */
export type DedDataSourceFamily =
  | 'canonical-ahsp-catalog'
  | 'canonical-pricing'
  | 'external-price-references'
  | 'jakarta-price-table'
  | 'quantity-services'
  | 'unit-registry'
  | 'sanity-band'
  | 'wbs-classification'
  | 'document-parser'
  | 'price-source-vocabulary';

export interface SkillHandlerRef {
  /** Path modul handler yang sudah ada (referensi, bukan impor). */
  module: string;
  handler: string;
  intent: string;
}

export interface SkillDefinition {
  /** Id unik kebab-case, mis. 'audit-rab'. */
  id: string;
  /** Versi semver 'mayor.minor.patch'. */
  version: string;
  displayName: string;
  description: string;
  triggers: SkillTrigger[];
  inputSchema: SkillInputSchema;
  outputSchema: SkillOutputSchema;
  /**
   * Subset nama tool registry live. Setiap nama DIVERIFIKASI terhadap katalog
   * tool live saat registrasi — nama yang tidak dikenal DITOLAK.
   * Boleh kosong: skill dialog/model-side tidak memanggil tool.
   */
  allowedTools: string[];
  /** Peran server yang boleh memicu skill (taksonomi server, K-16). */
  allowedRoles: SkillRole[];
  requiredSubscription: SubscriptionTier;
  approvalPolicy: SkillApprovalPolicy;
  timeoutPolicy: SkillTimeoutPolicy;
  retryPolicy: SkillRetryPolicy;
  riskLevel: SkillRiskLevel;
  /**
   * true = read-only independen, boleh dieksekusi paralel dengan skill
   * read-only lain (Keputusan A). Registry MENOLAK parallelSafe=true bila
   * riskLevel bukan READ_ONLY atau ada allowedTool yang bukan read-only.
   */
  parallelSafe: boolean;
  usageMetadata: SkillUsageMetadata;
  /** Asal definisi — migrasi mereferensikan kontrak asal, bukan menduplikasinya. */
  source: {
    kind: 'quick-action-contract' | 'deterministic-command' | 'custom';
    ref: string;
  };
  /** Diisi bila toolName kontrak asal tidak ada di registry live. */
  unsupportedToolReference?: UnsupportedToolReference;
  /** Diisi untuk skill perintah deterministik (handler sudah ada di commands/). */
  handlerRef?: SkillHandlerRef;
  /** Mode DED bila skill menyentuh pipeline DED (validasi isolasi FULL_AI). */
  dedMode?: DedMode;
  dataSources?: DedDataSourceFamily[];
  /** Catatan kesenjangan kontrak asal yang didokumentasikan, bukan ditambal. */
  contractNotes?: string[];
  enabled: boolean;
}

/**
 * Envelope eksekusi terstruktur (menutup K-15): satu requestId + satu traceId
 * yang diteruskan ke state eksekusi, trail tool, dan metadata pemakaian.
 * TIDAK ada skop tenant di sini (K-03 terbuka — lihat catatan di atas).
 */
export interface ExecutionContext {
  /** Id request unik per eksekusi ('req-<uuid>'). */
  requestId: string;
  /** Id korelasi ujung-ke-ujung ('trc-<uuid>'); sama untuk satu alur. */
  traceId: string;
  skillId: string;
  projectId: string | null;
  conversationId: string | null;
  /**
   * Id pengguna. Sesudah flip AUTH (8a03451): id Supabase asli di sesi
   * login nyata (mode 'real-login'); null di sesi demo/failsafe tanpa
   * identitas. Executor tidak pernah mengarang userId.
   */
  userId: string | null;
  /**
   * Peran pemanggil dalam taksonomi server, atau null bila tidak diketahui.
   * Nilai di luar taksonomi server (mis. peran demo) DITOLAK executor
   * (ROLE_NOT_MAPPED) — tidak pernah dipetakan diam-diam.
   */
  callerRole: string | null;
  /** null = dianggap FREE (mode demo) sampai AUTH flip. */
  subscription: SubscriptionTier | null;
  channel: SkillChannel;
  contextVersion: 1;
  idempotencyKey: string;
  startedAt: string;
}

export interface SkillApproval {
  actor: 'user';
  approvedAt: string;
  /** Run yang disetujui — persetujuan terikat satu runId (pola G1). */
  runId: string;
  /**
   * UserId penyetuju (atribusi). Id Supabase asli sesudah flip AUTH
   * (8a03451); null di sesi demo/failsafe tanpa identitas.
   */
  approvedByUserId?: string | null;
}

export interface SkillHandlerResult {
  /** Output terstruktur; divalidasi terhadap outputSchema skill. */
  output: Record<string, unknown>;
  usage?: {
    tokensIn?: number;
    tokensOut?: number;
  };
}

export type SkillHandler = (
  input: Record<string, unknown>,
  ctx: ExecutionContext,
  signal: AbortSignal,
) => Promise<SkillHandlerResult>;
