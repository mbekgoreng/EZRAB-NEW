/**
 * EZRAB AI — Skill Engine: migrasi QuickActionContract -> SkillDefinition
 * (BARU, Phase 2 Workstream 3).
 *
 * Sepuluh kontrak Quick Action (src/data/quickActionContracts.ts) didaftarkan
 * sebagai skill TANPA menduplikasi kontrak asal: definisi di sini DITURUNKAN
 * dari QUICK_ACTION_CONTRACTS (satu sumber kebenaran tetap di sana) lewat
 * quickActionContractToSkillDefinition(). Kontrak asal TIDAK diubah.
 *
 * TEMUAN VERIFIKASI (2026-11-19, terhadap toolRegistry.ts + tools.ts):
 * SEMUA SEPULUH toolName kontrak MENGGANTUNG terhadap registry tool live —
 * bukan hanya audit_rab seperti dicatat Fase 3 (kontrak kini membawa
 * toolName untuk kesepuluhnya; penamaan tool memakai kosakata server).
 * Tidak ada satu pun yang diteruskan mentah ke allowedTools. Setiap kontrak
 * dicatat di QUICK_ACTION_TOOL_MAPPING dengan resolusi eksplisit:
 *   - dipetakan 1:1 ke tool live yang setara (4 kontrak),
 *   - diuraikan menjadi komposisi tool live read-only (1 kontrak),
 *   - tanpa padanan live — allowedTools kosong + titik integrasi
 *     didokumentasikan (5 kontrak).
 *
 * TEMUAN KONTRAK KEDUA: 5 kontrak mendeklarasikan requiredParameters yang
 * TIDAK punya entri di parametersSchema (HITUNG_VOLUME: dimensions;
 * CARI_AHSP: keyword; CARI_HARGA: keyword; ANALISIS_DED: analysisDiscipline;
 * BUAT_LAPORAN: period). Input skill diturunkan dari parametersSchema yang
 * bertipe; parameter tak terdeklarasi dicatat di contractNotes sebagai
 * kesenjangan kontrak (perbaikan kontrak adalah edit berkas asal — di luar
 * kepemilikan workstream ini, lihat MIGRATION-PLAN.md).
 */
import {
  QUICK_ACTION_CONTRACTS,
  type QuickActionContract,
} from '../../data/quickActionContracts';
import type {
  SkillDefinition,
  SkillOutputSchema,
  SkillSchemaField,
  UnsupportedToolReference,
} from './types';

/** Id skill kebab-case per actionId Quick Action. */
export const QUICK_ACTION_SKILL_IDS: Record<string, string> = {
  AUDIT_RAB: 'audit-rab',
  HITUNG_VOLUME: 'hitung-volume',
  CARI_AHSP: 'cari-ahsp',
  CARI_HARGA: 'cari-harga',
  ANALISIS_DED: 'analisis-ded',
  BUAT_LAPORAN: 'buat-laporan',
  PERIKSA_KURVA_S: 'periksa-kurva-s',
  JELASKAN_ITEM: 'jelaskan-item',
  RECALCULATE: 'recalculate',
  BANTUAN_FITUR: 'bantuan-fitur',
};

/**
 * Pemetaan toolName kontrak -> tool live. Setiap entri DIVERIFIKASI terhadap
 * registry live (38 tool: 24 tools.ts + 10 native + 4 unavailable).
 * Izin tool live yang dipakai di sini semuanya 'read-only' (diverifikasi
 * terhadap CHAT_TOOL_SCHEMAS + NATIVE_TOOL_DEFINITIONS).
 */
export interface QuickActionToolMapping {
  /** Tool live yang menjadi allowedTools skill (semuanya read-only). */
  liveTools: string[];
  unsupported: UnsupportedToolReference;
  /** Titik integrasi kanonis bila allowedTools tidak mencakup seluruh skill. */
  integrationPoint: string;
}

export const QUICK_ACTION_TOOL_MAPPING: Record<string, QuickActionToolMapping> = {
  AUDIT_RAB: {
    liveTools: ['get_project_items', 'get_unresolved_items', 'analyze_draft_costs'],
    unsupported: {
      contractTool: 'audit_rab',
      reason:
        'audit_rab tidak ada di registry tool live (hanya di registry server dorman + registry mati).',
      resolution: 'decomposed-to-live-tools',
      liveTools: ['get_project_items', 'get_unresolved_items', 'analyze_draft_costs'],
    },
    integrationPoint:
      'Audit = komposisi baca (item proyek + item belum berharga + analisis biaya draft) + penalaran model; tanpa tool audit tunggal.',
  },
  HITUNG_VOLUME: {
    liveTools: ['hitung_qto'],
    unsupported: {
      contractTool: 'calculate_quantity',
      reason: 'calculate_quantity tidak ada di registry live; padanan live-nya hitung_qto.',
      resolution: 'mapped-to-live-tool',
      liveTools: ['hitung_qto'],
    },
    integrationPoint:
      'Perhitungan volume deterministik tetap di engine QTO (hitung_qto); skill tidak menghitung sendiri.',
  },
  CARI_AHSP: {
    liveTools: ['cari_ahsp'],
    unsupported: {
      contractTool: 'search_ahsp',
      reason: 'search_ahsp tidak ada di registry live; padanan live-nya cari_ahsp.',
      resolution: 'mapped-to-live-tool',
      liveTools: ['cari_ahsp'],
    },
    integrationPoint: 'Pencarian AHSP resmi lewat cari_ahsp (officialAhspRepository).',
  },
  CARI_HARGA: {
    liveTools: ['cari_harga'],
    unsupported: {
      contractTool: 'search_price',
      reason: 'search_price tidak ada di registry live; padanan live-nya cari_harga.',
      resolution: 'mapped-to-live-tool',
      liveTools: ['cari_harga'],
    },
    integrationPoint: 'Pencarian harga lewat cari_harga (priceResolver2026); harga null tetap null.',
  },
  ANALISIS_DED: {
    liveTools: ['extract_ded_specs'],
    unsupported: {
      contractTool: 'analyze_ded',
      reason:
        'analyze_ded tidak ada di registry live; extract_ded_specs hanya mencakup ekstraksi spek DED (sebagian analisis).',
      resolution: 'mapped-to-live-tool',
      liveTools: ['extract_ded_specs'],
    },
    integrationPoint:
      'Analisis DED penuh adalah pipeline DED AI Estimate / DED Full AI (Phase 4) — skill ini hanya pintu masuk dialog + ekstraksi spek; TIDAK menyentuh pipeline DED.',
  },
  BUAT_LAPORAN: {
    liveTools: [],
    unsupported: {
      contractTool: 'generate_report',
      reason: 'generate_report tidak ada di registry live; tidak ada tool laporan.',
      resolution: 'no-live-tool',
      liveTools: [],
    },
    integrationPoint:
      'Komposisi laporan model-side dari snapshot proyek kanonis; ekspor file lewat layanan ekspor kanonis (perintah EXPORT_PROJECT).',
  },
  PERIKSA_KURVA_S: {
    liveTools: [],
    unsupported: {
      contractTool: 'inspect_curve_s',
      reason: 'inspect_curve_s tidak ada di registry live; tidak ada tool jadwal/progres.',
      resolution: 'no-live-tool',
      liveTools: [],
    },
    integrationPoint:
      'Butuh layanan baca jadwal/progres kanonis (belum ada sebagai tool) — kesenjangan integrasi, lihat MIGRATION-PLAN.md.',
  },
  JELASKAN_ITEM: {
    liveTools: ['get_item_detail'],
    unsupported: {
      contractTool: 'explain_item',
      reason:
        'explain_item tidak ada di registry live; get_item_detail adalah sumber datanya, penjelasan dibuat model-side.',
      resolution: 'mapped-to-live-tool',
      liveTools: ['get_item_detail'],
    },
    integrationPoint: 'Detail item lewat get_item_detail; rumus/koefisien dijelaskan dari data itu.',
  },
  RECALCULATE: {
    liveTools: [],
    unsupported: {
      contractTool: 'recalculate_rab',
      reason:
        'recalculate_rab tidak ada di registry live — dan TIDAK BOLEH ada sebagai tool: rekalkulasi adalah engine deterministik (unifiedProjectEngine), bukan alat AI.',
      resolution: 'no-live-tool',
      liveTools: [],
    },
    integrationPoint:
      'Rekalkulasi lewat unifiedProjectEngine.recalculateCostSummary + pratinjau diff (pola PREVIEW_DIFF_AND_CONFIRM); skill hanya orkestrasi + approval.',
  },
  BANTUAN_FITUR: {
    liveTools: [],
    unsupported: {
      contractTool: 'get_feature_help',
      reason: 'get_feature_help tidak ada di registry live; tidak ada tool bantuan.',
      resolution: 'no-live-tool',
      liveTools: [],
    },
    integrationPoint: 'Panduan model-side dari pengetahuan produk; tanpa tool.',
  },
};

/** Skema output eksplisit per skill (kontrak standar antar-tahap, K-01). */
export const QUICK_ACTION_OUTPUT_SCHEMAS: Record<string, SkillOutputSchema> = {
  AUDIT_RAB: {
    description: 'Hasil audit RAB: ringkasan + temuan terstruktur.',
    fields: [
      { name: 'summary', type: 'string', required: true },
      { name: 'findingCount', type: 'number', required: true },
      { name: 'findings', type: 'array', required: false },
    ],
  },
  HITUNG_VOLUME: {
    description: 'Hasil hitung volume: nilai + satuan.',
    fields: [
      { name: 'summary', type: 'string', required: true },
      { name: 'volume', type: 'number', required: true },
      { name: 'unit', type: 'string', required: true },
    ],
  },
  CARI_AHSP: {
    description: 'Hasil pencarian AHSP.',
    fields: [
      { name: 'summary', type: 'string', required: true },
      { name: 'matchCount', type: 'number', required: true },
      { name: 'results', type: 'array', required: false },
    ],
  },
  CARI_HARGA: {
    description: 'Hasil pencarian harga.',
    fields: [
      { name: 'summary', type: 'string', required: true },
      { name: 'matchCount', type: 'number', required: true },
      { name: 'results', type: 'array', required: false },
    ],
  },
  ANALISIS_DED: {
    description: 'Hasil analisis DED: ringkasan + item terekstrak.',
    fields: [
      { name: 'summary', type: 'string', required: true },
      { name: 'itemCount', type: 'number', required: true },
      { name: 'items', type: 'array', required: false },
    ],
  },
  BUAT_LAPORAN: {
    description: 'Draft laporan (belum diekspor).',
    fields: [
      { name: 'summary', type: 'string', required: true },
      { name: 'reportType', type: 'string', required: true },
      { name: 'content', type: 'string', required: true },
    ],
  },
  PERIKSA_KURVA_S: {
    description: 'Hasil pemeriksaan Kurva S.',
    fields: [
      { name: 'summary', type: 'string', required: true },
      { name: 'deviationNote', type: 'string', required: true },
      { name: 'findings', type: 'array', required: false },
    ],
  },
  JELASKAN_ITEM: {
    description: 'Penjelasan satu item pekerjaan.',
    fields: [
      { name: 'summary', type: 'string', required: true },
      { name: 'itemName', type: 'string', required: true },
      { name: 'explanation', type: 'string', required: true },
    ],
  },
  RECALCULATE: {
    description: 'Hasil rekalkulasi + pratinjau diff (sebelum/sesudah).',
    fields: [
      { name: 'summary', type: 'string', required: true },
      { name: 'grandTotalBefore', type: 'number', required: true },
      { name: 'grandTotalAfter', type: 'number', required: true },
      { name: 'changedItems', type: 'number', required: true },
    ],
  },
  BANTUAN_FITUR: {
    description: 'Panduan fitur.',
    fields: [
      { name: 'summary', type: 'string', required: true },
      { name: 'featureTopic', type: 'string', required: true },
      { name: 'guidance', type: 'string', required: true },
    ],
  },
};

function toSkillInputField(p: QuickActionContract['parametersSchema'][number]): SkillSchemaField {
  return {
    name: p.name,
    label: p.label,
    type: p.type,
    required: p.required,
    enum: p.options?.map((o) => o.value),
    min: p.validation?.min,
    max: p.validation?.max,
    pattern: p.validation?.pattern,
  };
}

/**
 * Turunkan satu SkillDefinition dari satu QuickActionContract.
 * Medan yang disalin verbatim: label, description, category (ke deskripsi),
 * allowedRoles, requiredSubscription, riskLevel, requiresConfirmation,
 * version, parametersSchema. Medan baru skill: id kebab-case, triggers,
 * outputSchema, allowedTools (terverifikasi live), timeout/retry policy,
 * parallelSafe, usageMetadata (UNMEASURED — tanpa run live yang terukur).
 */
export function quickActionContractToSkillDefinition(
  contract: QuickActionContract,
): SkillDefinition {
  const skillId = QUICK_ACTION_SKILL_IDS[contract.actionId];
  if (!skillId) {
    throw new Error(`QUICK_ACTION_SKILL_UNKNOWN: actionId "${contract.actionId}" belum dipetakan.`);
  }
  const mapping = QUICK_ACTION_TOOL_MAPPING[contract.actionId];
  const outputSchema = QUICK_ACTION_OUTPUT_SCHEMAS[contract.actionId];
  if (!mapping || !outputSchema) {
    throw new Error(
      `QUICK_ACTION_SKILL_INCOMPLETE: actionId "${contract.actionId}" belum punya pemetaan tool/skema output.`,
    );
  }

  const declaredParams = new Set(contract.parametersSchema.map((p) => p.name));
  const undeclared = contract.requiredParameters.filter((p) => !declaredParams.has(p));
  const contractNotes: string[] = [];
  if (undeclared.length > 0) {
    contractNotes.push(
      `Kesenjangan kontrak asal: requiredParameters [${undeclared.join(', ')}] tidak punya entri di parametersSchema — ` +
        `input skill hanya memakai parametersSchema yang bertipe; perbaikan kontrak menunggu edit berkas asal.`,
    );
  }
  contractNotes.push(`Titik integrasi: ${mapping.integrationPoint}`);

  const isMutating =
    contract.riskLevel === 'MUTATION' || contract.riskLevel === 'POTENTIAL_MUTATION';
  const timeoutMs =
    contract.actionId === 'ANALISIS_DED'
      ? 180_000
      : isMutating
        ? 120_000
        : 60_000;

  return {
    id: skillId,
    version: contract.version,
    displayName: contract.label,
    description: contract.description,
    triggers: [
      { kind: 'quick-action', value: contract.actionId },
      { kind: 'intent', value: contract.intent },
    ],
    inputSchema: { fields: contract.parametersSchema.map(toSkillInputField) },
    outputSchema,
    allowedTools: [...mapping.liveTools],
    allowedRoles: [...contract.allowedRoles],
    requiredSubscription: contract.requiredSubscription,
    approvalPolicy: {
      requiresApproval: contract.requiresConfirmation,
      approver: 'user',
      ttlMs: 10 * 60 * 1000,
    },
    timeoutPolicy: { timeoutMs },
    retryPolicy: isMutating
      ? { maxAttempts: 1, backoffMs: 0, retryableErrors: [] }
      : {
          maxAttempts: 2,
          backoffMs: 1000,
          retryableErrors: ['PROVIDER_TIMEOUT', 'TRANSIENT_PROVIDER_ERROR', 'TOOL_TIMEOUT'],
        },
    riskLevel: contract.riskLevel,
    parallelSafe: contract.riskLevel === 'READ_ONLY',
    usageMetadata: {
      observability: true,
      estimatedCostBasis: 'UNMEASURED',
      estimatedCredits: null,
      notes:
        'Belum ada run Quick Action yang selesai end-to-end di deployment Vercel (backend Express dorman) — estimasi biaya diisi sesudah run terukur pertama.',
    },
    source: { kind: 'quick-action-contract', ref: `src/data/quickActionContracts.ts#${contract.actionId}` },
    unsupportedToolReference: mapping.unsupported,
    contractNotes,
    enabled: contract.enabled,
  };
}

/** Kesepuluh definisi skill hasil migrasi Quick Action (urutan kontrak asal). */
export const QUICK_ACTION_SKILL_DEFINITIONS: SkillDefinition[] = Object.values(
  QUICK_ACTION_CONTRACTS,
).map(quickActionContractToSkillDefinition);
