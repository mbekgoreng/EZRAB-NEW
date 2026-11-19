/**
 * EZRAB AI — Skill Engine: pendaftaran perintah deterministik sebagai skill
 * (BARU, Phase 2 Workstream 3).
 *
 * Kelima modul commands/ (src/ai-tools/ezrab-ai/commands/) adalah lapisan
 * skill de-facto yang HIDUP dan teruji. Modul ini mendaftarkannya sebagai
 * SkillDefinition TANPA mengubah handler apa pun: definisi hanya membawa
 * metadata registrasi (trigger intent, skema, risiko, approval) + referensi
 * handler (handlerRef: path modul + nama handler, sebagai DATA — bukan
 * impor). Dispatch ke handler nyata adalah pekerjaan cutover (executor
 * menerima handler lewat injeksi; lihat MIGRATION-PLAN.md).
 *
 * 13 skill dari 14 intent deterministik: DELETE_PROJECT_CONFIRM bukan skill
 * sendiri — ia adalah langkah konfirmasi (approval) skill delete-project.
 *
 * Peran: semua skill membawa keempat peran server (perilaku hari ini: tanpa
 * penegakan peran di jalur perintah, K-07). Membatasi peran untuk perintah
 * destruktif adalah keputusan owner, bukan sesuatu yang diciptakan modul ini
 * — dicatat di contractNotes per skill destruktif.
 *
 * Approval: perintah deterministik berjalan langsung dari instruksi eksplisit
 * user hari ini — instruksinya sendiri adalah persetujuan — sehingga
 * requiresApproval=false untuk semuanya KECUALI topup-credit (bersentuhan
 * uang/kredit: approval selalu wajib) dan delete-project yang approval-nya
 * hidup DI DALAM handler (konfirmasi 2 langkah); executor tidak menambah
 * lapisan konfirmasi kedua untuknya.
 *
 * Biaya: perintah deterministik lokal tidak memanggil provider (0 kredit
 * secara struktural) — KECUALI run-ded-analysis dan summarize-document yang
 * memicu pemrosesan model; keduanya UNMEASURED sampai run terukur pertama.
 */
import type { SkillDefinition } from './types';

const ALL_SERVER_ROLES: SkillDefinition['allowedRoles'] = [
  'SUPER_ADMIN',
  'ESTIMATOR',
  'DIREKSI',
  'CLIENT',
];

const UNMEASURED_USAGE: SkillDefinition['usageMetadata'] = {
  observability: true,
  estimatedCostBasis: 'UNMEASURED',
  estimatedCredits: null,
  notes:
    'Skill ini memicu pemrosesan model (DED/dokumen) — estimasi biaya diisi sesudah run terukur pertama.',
};

const LOCAL_ZERO_USAGE: SkillDefinition['usageMetadata'] = {
  observability: true,
  estimatedCostBasis: 'OBSERVED',
  estimatedCredits: 0,
  notes:
    'Perintah deterministik lokal tanpa panggilan provider — 0 kredit secara struktural (bukan estimasi).',
};

function commandSkill(partial: Omit<SkillDefinition, 'source' | 'usageMetadata' | 'allowedRoles' | 'requiredSubscription' | 'allowedTools' | 'enabled'> & {
  module: string;
  handler: string;
  intent: string;
  usage?: SkillDefinition['usageMetadata'];
}): SkillDefinition {
  const { module, handler, intent, usage, ...def } = partial;
  return {
    ...def,
    allowedTools: [],
    allowedRoles: [...ALL_SERVER_ROLES],
    requiredSubscription: 'FREE',
    usageMetadata: usage ?? LOCAL_ZERO_USAGE,
    source: { kind: 'deterministic-command', ref: `${module}#${intent}` },
    handlerRef: { module, handler, intent },
    enabled: true,
  };
}

const SUMMARY_OUTPUT = (extra: SkillDefinition['outputSchema']['fields'] = []): SkillDefinition['outputSchema'] => ({
  fields: [{ name: 'summary', type: 'string', required: true }, ...extra],
});

/** Ketiga belas skill perintah deterministik. */
export const COMMAND_SKILL_DEFINITIONS: SkillDefinition[] = [
  commandSkill({
    id: 'create-project',
    version: '1.0.0',
    displayName: 'Buat Proyek',
    description: 'Membuat proyek baru secara deterministik dari perintah chat.',
    triggers: [{ kind: 'intent', value: 'CREATE_PROJECT' }],
    inputSchema: {
      fields: [{ name: 'projectName', label: 'Nama proyek', type: 'string', required: true }],
    },
    outputSchema: SUMMARY_OUTPUT([{ name: 'projectId', type: 'string', required: false }]),
    approvalPolicy: { requiresApproval: false, approver: 'user', ttlMs: 600_000 },
    timeoutPolicy: { timeoutMs: 30_000 },
    retryPolicy: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] },
    riskLevel: 'MUTATION',
    parallelSafe: false,
    module: 'src/ai-tools/ezrab-ai/commands/projectCommands.ts',
    handler: 'handleProjectCommand',
    intent: 'CREATE_PROJECT',
  }),
  commandSkill({
    id: 'delete-project',
    version: '1.0.0',
    displayName: 'Hapus Proyek',
    description:
      'Menghapus proyek dengan konfirmasi dua langkah (DELETE_PROJECT_CONFIRM adalah langkah approval skill ini, bukan skill sendiri).',
    triggers: [
      { kind: 'intent', value: 'DELETE_PROJECT' },
      { kind: 'intent', value: 'DELETE_PROJECT_CONFIRM' },
    ],
    inputSchema: {
      fields: [{ name: 'projectName', label: 'Nama proyek', type: 'string', required: true }],
    },
    outputSchema: SUMMARY_OUTPUT([{ name: 'projectId', type: 'string', required: false }]),
    approvalPolicy: { requiresApproval: false, approver: 'user', ttlMs: 600_000 },
    timeoutPolicy: { timeoutMs: 30_000 },
    retryPolicy: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] },
    riskLevel: 'MUTATION',
    parallelSafe: false,
    contractNotes: [
      'Approval hidup DI DALAM handler sebagai konfirmasi 2 langkah (DELETE_PROJECT_CONFIRM); requiresApproval=false di sini agar executor tidak menambah lapisan konfirmasi kedua yang membingungkan.',
      'Pembatasan peran untuk perintah destruktif (K-07) menunggu keputusan owner — hari ini semua peran diizinkan seperti perilaku yang berjalan.',
    ],
    module: 'src/ai-tools/ezrab-ai/commands/projectCommands.ts',
    handler: 'handleProjectCommand',
    intent: 'DELETE_PROJECT',
  }),
  commandSkill({
    id: 'archive-project',
    version: '1.0.0',
    displayName: 'Arsipkan Proyek',
    description: 'Memindahkan proyek ke arsip.',
    triggers: [{ kind: 'intent', value: 'ARCHIVE_PROJECT' }],
    inputSchema: {
      fields: [{ name: 'projectName', label: 'Nama proyek', type: 'string', required: true }],
    },
    outputSchema: SUMMARY_OUTPUT([{ name: 'projectId', type: 'string', required: false }]),
    approvalPolicy: { requiresApproval: false, approver: 'user', ttlMs: 600_000 },
    timeoutPolicy: { timeoutMs: 30_000 },
    retryPolicy: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] },
    riskLevel: 'MUTATION',
    parallelSafe: false,
    module: 'src/ai-tools/ezrab-ai/commands/projectCommands.ts',
    handler: 'handleProjectCommand',
    intent: 'ARCHIVE_PROJECT',
  }),
  commandSkill({
    id: 'duplicate-project',
    version: '1.0.0',
    displayName: 'Duplikat Proyek',
    description: 'Menggandakan proyek beserta datanya.',
    triggers: [{ kind: 'intent', value: 'DUPLICATE_PROJECT' }],
    inputSchema: {
      fields: [{ name: 'projectName', label: 'Nama proyek', type: 'string', required: true }],
    },
    outputSchema: SUMMARY_OUTPUT([{ name: 'projectId', type: 'string', required: false }]),
    approvalPolicy: { requiresApproval: false, approver: 'user', ttlMs: 600_000 },
    timeoutPolicy: { timeoutMs: 60_000 },
    retryPolicy: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] },
    riskLevel: 'MUTATION',
    parallelSafe: false,
    module: 'src/ai-tools/ezrab-ai/commands/projectCommands.ts',
    handler: 'handleProjectCommand',
    intent: 'DUPLICATE_PROJECT',
  }),
  commandSkill({
    id: 'create-qto-item',
    version: '1.0.0',
    displayName: 'Buat Item QTO',
    description: 'Membuat item quantity takeoff baru.',
    triggers: [{ kind: 'intent', value: 'CREATE_QTO_ITEM' }],
    inputSchema: {
      fields: [
        { name: 'itemName', label: 'Nama item', type: 'string', required: true },
        { name: 'quantity', label: 'Kuantitas', type: 'number', required: false, min: 0 },
        { name: 'unit', label: 'Satuan', type: 'string', required: false },
      ],
    },
    outputSchema: SUMMARY_OUTPUT([{ name: 'itemId', type: 'string', required: false }]),
    approvalPolicy: { requiresApproval: false, approver: 'user', ttlMs: 600_000 },
    timeoutPolicy: { timeoutMs: 30_000 },
    retryPolicy: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] },
    riskLevel: 'MUTATION',
    parallelSafe: false,
    module: 'src/ai-tools/ezrab-ai/commands/qtoCommands.ts',
    handler: 'handleQtoCommand',
    intent: 'CREATE_QTO_ITEM',
  }),
  commandSkill({
    id: 'sync-qto',
    version: '1.0.0',
    displayName: 'Sinkron QTO ke RAB',
    description: 'Menyinkronkan item QTO ke RAB proyek aktif.',
    triggers: [{ kind: 'intent', value: 'SYNC_QTO' }],
    inputSchema: { fields: [] },
    outputSchema: SUMMARY_OUTPUT([{ name: 'syncedItems', type: 'number', required: false }]),
    approvalPolicy: { requiresApproval: false, approver: 'user', ttlMs: 600_000 },
    timeoutPolicy: { timeoutMs: 60_000 },
    retryPolicy: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] },
    riskLevel: 'MUTATION',
    parallelSafe: false,
    module: 'src/ai-tools/ezrab-ai/commands/qtoCommands.ts',
    handler: 'handleQtoCommand',
    intent: 'SYNC_QTO',
  }),
  commandSkill({
    id: 'run-ded-analysis',
    version: '1.0.0',
    displayName: 'Jalankan Analisis DED',
    description: 'Menjalankan analisis DED via autorun pada PDF terunggah (sesi dedDocSessionHolder).',
    triggers: [{ kind: 'intent', value: 'RUN_DED_ANALYSIS' }],
    inputSchema: {
      fields: [{ name: 'documentName', label: 'Nama dokumen', type: 'string', required: false }],
    },
    outputSchema: SUMMARY_OUTPUT([{ name: 'sessionId', type: 'string', required: false }]),
    approvalPolicy: { requiresApproval: false, approver: 'user', ttlMs: 600_000 },
    timeoutPolicy: { timeoutMs: 180_000 },
    retryPolicy: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] },
    riskLevel: 'POTENTIAL_MUTATION',
    parallelSafe: false,
    contractNotes: [
      'Mode DED (EZRAB_AI / FULL_AI) diputuskan pipeline DED + view, bukan skill ini — skill tidak mendeklarasikan dedMode.',
    ],
    module: 'src/ai-tools/ezrab-ai/commands/dedDocCommands.ts',
    handler: 'handleDedDocCommand',
    intent: 'RUN_DED_ANALYSIS',
    usage: UNMEASURED_USAGE,
  }),
  commandSkill({
    id: 'summarize-document',
    version: '1.0.0',
    displayName: 'Ringkas Dokumen',
    description: 'Meringkas dokumen headless.',
    triggers: [{ kind: 'intent', value: 'SUMMARIZE_DOCUMENT' }],
    inputSchema: {
      fields: [{ name: 'documentName', label: 'Nama dokumen', type: 'string', required: false }],
    },
    outputSchema: SUMMARY_OUTPUT([{ name: 'content', type: 'string', required: false }]),
    approvalPolicy: { requiresApproval: false, approver: 'user', ttlMs: 600_000 },
    timeoutPolicy: { timeoutMs: 120_000 },
    retryPolicy: {
      maxAttempts: 2,
      backoffMs: 1000,
      retryableErrors: ['PROVIDER_TIMEOUT', 'TRANSIENT_PROVIDER_ERROR'],
    },
    riskLevel: 'READ_ONLY',
    parallelSafe: true,
    module: 'src/ai-tools/ezrab-ai/commands/dedDocCommands.ts',
    handler: 'handleDedDocCommand',
    intent: 'SUMMARIZE_DOCUMENT',
    usage: UNMEASURED_USAGE,
  }),
  commandSkill({
    id: 'export-project',
    version: '1.0.0',
    displayName: 'Ekspor Proyek',
    description: 'Mengekspor proyek ke Excel/PDF (membuat artefak eksternal; tidak mengubah data proyek).',
    triggers: [{ kind: 'intent', value: 'EXPORT_PROJECT' }],
    inputSchema: {
      fields: [
        {
          name: 'format',
          label: 'Format',
          type: 'select',
          required: true,
          enum: ['excel', 'pdf'],
        },
      ],
    },
    outputSchema: SUMMARY_OUTPUT([{ name: 'fileName', type: 'string', required: false }]),
    approvalPolicy: { requiresApproval: false, approver: 'user', ttlMs: 600_000 },
    timeoutPolicy: { timeoutMs: 120_000 },
    retryPolicy: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] },
    riskLevel: 'POTENTIAL_MUTATION',
    parallelSafe: false,
    module: 'src/ai-tools/ezrab-ai/commands/exportCreditCommands.ts',
    handler: 'handleExportCreditCommand',
    intent: 'EXPORT_PROJECT',
  }),
  commandSkill({
    id: 'create-revision',
    version: '1.0.0',
    displayName: 'Buat Revisi',
    description: 'Membuat revisi (snapshot) draft RAB.',
    triggers: [{ kind: 'intent', value: 'CREATE_REVISION' }],
    inputSchema: {
      fields: [{ name: 'revisionName', label: 'Nama revisi', type: 'string', required: true }],
    },
    outputSchema: SUMMARY_OUTPUT([{ name: 'revisionId', type: 'string', required: false }]),
    approvalPolicy: { requiresApproval: false, approver: 'user', ttlMs: 600_000 },
    timeoutPolicy: { timeoutMs: 30_000 },
    retryPolicy: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] },
    riskLevel: 'MUTATION',
    parallelSafe: false,
    module: 'src/ai-tools/ezrab-ai/commands/exportCreditCommands.ts',
    handler: 'handleExportCreditCommand',
    intent: 'CREATE_REVISION',
  }),
  commandSkill({
    id: 'credit-balance',
    version: '1.0.0',
    displayName: 'Saldo Kredit',
    description: 'Menampilkan saldo kredit AI (baca saja; tanpa debit).',
    triggers: [{ kind: 'intent', value: 'CREDIT_BALANCE' }],
    inputSchema: { fields: [] },
    outputSchema: SUMMARY_OUTPUT([{ name: 'balance', type: 'number', required: false }]),
    approvalPolicy: { requiresApproval: false, approver: 'user', ttlMs: 600_000 },
    timeoutPolicy: { timeoutMs: 30_000 },
    retryPolicy: {
      maxAttempts: 2,
      backoffMs: 1000,
      retryableErrors: ['PROVIDER_TIMEOUT', 'TRANSIENT_PROVIDER_ERROR'],
    },
    riskLevel: 'READ_ONLY',
    parallelSafe: true,
    module: 'src/ai-tools/ezrab-ai/commands/exportCreditCommands.ts',
    handler: 'handleExportCreditCommand',
    intent: 'CREDIT_BALANCE',
  }),
  commandSkill({
    id: 'topup-credit',
    version: '1.0.0',
    displayName: 'Top-up Kredit',
    description: 'Alur top-up kredit (SIMULASI hari ini — pembayaran nyata di luar cakupan skill ini).',
    triggers: [{ kind: 'intent', value: 'TOPUP_CREDIT' }],
    inputSchema: {
      fields: [{ name: 'amount', label: 'Jumlah', type: 'number', required: true, min: 1 }],
    },
    outputSchema: SUMMARY_OUTPUT([{ name: 'credits', type: 'number', required: false }]),
    approvalPolicy: { requiresApproval: true, approver: 'user', ttlMs: 600_000 },
    timeoutPolicy: { timeoutMs: 30_000 },
    retryPolicy: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] },
    riskLevel: 'MUTATION',
    parallelSafe: false,
    contractNotes: [
      'Top-up hari ini simulasi (saldo lokal); pembayaran nyata (Midtrans) adalah program terpisah dan TIDAK boleh diaktifkan lewat skill ini.',
    ],
    module: 'src/ai-tools/ezrab-ai/commands/exportCreditCommands.ts',
    handler: 'handleExportCreditCommand',
    intent: 'TOPUP_CREDIT',
  }),
  commandSkill({
    id: 'update-project-settings',
    version: '1.0.0',
    displayName: 'Ubah Pengaturan Proyek',
    description: 'Mengubah overhead/profit/PPN proyek.',
    triggers: [{ kind: 'intent', value: 'UPDATE_PROJECT_SETTINGS' }],
    inputSchema: {
      fields: [
        {
          name: 'settingKey',
          label: 'Pengaturan',
          type: 'select',
          required: true,
          enum: ['overhead', 'profit', 'ppn'],
        },
        { name: 'settingValue', label: 'Nilai', type: 'number', required: true, min: 0 },
      ],
    },
    outputSchema: SUMMARY_OUTPUT(),
    approvalPolicy: { requiresApproval: false, approver: 'user', ttlMs: 600_000 },
    timeoutPolicy: { timeoutMs: 30_000 },
    retryPolicy: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] },
    riskLevel: 'MUTATION',
    parallelSafe: false,
    module: 'src/ai-tools/ezrab-ai/commands/projectSettingsCommands.ts',
    handler: 'handleProjectSettingsCommand',
    intent: 'UPDATE_PROJECT_SETTINGS',
  }),
];
