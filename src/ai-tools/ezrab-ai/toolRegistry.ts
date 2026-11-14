/**
 * toolRegistry.ts — REGISTRY TOOL TUNGGAL + EKSEKUSI TERORKESTRASI
 * (AI Intelligence Overhaul Fase 5, direktif owner 2026-11-12 Part 15
 * Fase 5 + Part 7).
 *
 * SATU registry yang dipakai Chat AI, Magic AI/Copilot, dan orkestrator
 * Fase 3. Tiap tool membawa: nama, deskripsi, skema input/output,
 * permission, side effect, perilaku idempotensi, timeout, ketersediaan,
 * dan syarat validasi — semua di kode, bukan di prompt.
 *
 * Yang didaftarkan HANYA tool yang ADA implementasinya (tools.ts,
 * actionRegistry/intent, DED/doc, QTO, kalkulasi deterministik,
 * pelaporan, modul Fase 2–4). Tool yang belum terimplementasi dicatat
 * sebagai TIDAK TERSEDIA (available: false + alasan) — bukan
 * didaftarkan pura-pura; pemanggilan terhadapnya DIBLOKIR dengan
 * alasan jujur, tidak pernah dijalankan setengah.
 *
 * Siklus eksekusi (Part 7.1):
 *   planned → ready → awaiting-approval → running → succeeded /
 *   partially-succeeded / failed / cancelled / blocked
 * Status tiap eksekusi tercatat di trail append-only (pola
 * `ai_memory_events` Fase 2: peristiwa ditambah, tidak pernah diubah;
 * keadaan terkini diturunkan dari peristiwa terakhir per executionId).
 *
 * Aturan keras:
 *  - Validasi input SEBELUM eksekusi (tak valid → 'blocked', runner
 *    tidak pernah dipanggil). Validasi output SESUDAH eksekusi (tak
 *    valid → 'failed'; sebagian valid → 'partially-succeeded').
 *  - Permission diperiksa SEBELUM menjalankan. Aksi konsekwensial
 *    WAJIB persetujuan eksplisit pengguna (actor 'user'); approval
 *    dari 'model'/'system' DITOLAK (APPROVAL_SELF_GRANT_DENIED) —
 *    model tidak pernah memberi dirinya izin (meneruskan gate Fase 3).
 *  - Idempotensi: kunci yang sama + tool yang sama + proyek yang sama
 *    + argumen yang sama → hasil sukses/parsial sebelumnya diputar
 *    ulang TANPA mengulang efek samping. Retry langkah gagal memakai
 *    kunci yang sama dan TIDAK menduplikasi operasi.
 *  - Project-scoped: eksekusi terikat projectId; lintas-proyek
 *    DITOLAK (PROJECT_SCOPE_MISMATCH). Tanpa projectId, tool yang
 *    butuh proyek DIBLOKIR (PROJECT_REQUIRED).
 *  - Secret tidak pernah masuk argumen, trail, atau memori
 *    (containsSecret dari memory.ts; ditolak sebelum eksekusi).
 *  - Transfer draft TIDAK punya jalur kedua: tool `transfer_draft`
 *    hanya memeriksa kesiapan + mencatat persetujuan (delegated-ui);
 *    penulisan ke Spreadsheet RAB tetap HANYA lewat tombol push-rab
 *    yang ada di Chat AI; kwitansi transfer dicatat ke trail lewat
 *    `recordTransferReceipt` oleh handler tombol itu.
 *  - Registry TIDAK menjalankan provider/LLM dan TIDAK mengubah
 *    aritmetika kanonis apa pun (engine RAB, SafeDecimalEngine,
 *    resolver harga, QTO hanya dibaca/dipakai).
 */

import { loadVersioned, saveVersioned } from '../../engine/storage/hardenedStorage';
import {
  containsSecret,
  createMemoryRecord,
  storeMemoryWithConflictResolution,
  type MemoryScope,
} from './memory';
import {
  EZRAB_AI_TOOLS,
  runTool,
  setActiveProjectSnapshot,
  type EzrabAiToolDef,
} from './tools';
import { getAssistantOperationContext } from './operations';
import {
  buildUniversalDraft,
  draftReadiness,
  formatUniversalDraftMessage,
  getLastUniversalDraft,
  type UniversalDraft,
} from './universalRab';
import { validateDraftChain, type ChainValidation } from './specChain';
import {
  analyzeDraftCosts,
  formatCostAnalysis,
  type PlanStepKind,
} from './agentOrchestrator';
import { detectTechnicalConflicts, formatConflictLines } from './technicalConflicts';
import {
  assessBudgetFeasibility,
  formatBudgetFeasibilityLine,
} from './budgetFeasibility';
import {
  retrieveDomainCandidates,
  formatDomainCandidateLines,
} from './constructionDomainRetrieval';
import {
  extractSpecsFromDedOutput,
  formatDedUnderstandingLines,
} from './dedUnderstanding';
import { checkQtoAgainstUserDimensions, formatQtoCheckLines } from './qtoBridge';
import { resolveNavCommand } from './navRegistry';
import type { ProjectSnapshot } from './projectContext';

/* ------------------------------------------------------------------ */
/* Tipe                                                                */
/* ------------------------------------------------------------------ */

export type ToolPermission = 'read-only' | 'draft' | 'consequential';
export type ToolSideEffect =
  | 'none'
  | 'draft-preview'
  | 'writes-project'
  | 'external-call'
  | 'delegated-ui';
export type ToolExecutionStatus =
  | 'planned'
  | 'ready'
  | 'awaiting-approval'
  | 'running'
  | 'succeeded'
  | 'partially-succeeded'
  | 'failed'
  | 'cancelled'
  | 'blocked';
export type ToolChannel = 'chat-ai' | 'copilot' | 'orchestrator' | 'ded' | 'test';
export type ApprovalActor = 'user' | 'model' | 'system';

export type ToolInputFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface ToolInputField {
  name: string;
  aliases?: string[];
  type: ToolInputFieldType;
  required?: boolean;
  enum?: string[];
  min?: number;
  max?: number;
  description?: string;
}

export interface ToolInputSchema {
  fields: ToolInputField[];
  /** Kelompok nama medan (salah satu wajib ada), mis. [['id','nama','name']]. */
  requiredAnyOf?: string[][];
}

export interface ToolInvokeResult {
  output: string;
  partial?: boolean;
  structured?: unknown;
}

export interface ToolExecContext {
  projectSnapshot?: ProjectSnapshot | null;
}

export type ToolInvokeFn = (
  args: Record<string, unknown>,
  execCtx: ToolExecContext,
) => string | ToolInvokeResult | Promise<string | ToolInvokeResult>;

export interface ToolDefinition {
  name: string;
  description: string;
  permission: ToolPermission;
  sideEffect: ToolSideEffect;
  /** true = eksekusi ulang dengan kunci sama memutar hasil lama. */
  idempotent: boolean;
  timeoutMs: number;
  /** false = belum terimplementasi / sengaja tidak tersedia (lihat alasan). */
  available: boolean;
  unavailableReason?: string;
  requiresProject: boolean;
  /** true = hasil sukses/parsial ditulis ke memori Fase 2 (bukan teks hilang). */
  recordToMemory: boolean;
  /** Kanal yang boleh memanggil; kosong = semua kanal. */
  channels?: ToolChannel[];
  inputSchema: ToolInputSchema;
  /** Validasi output; default: string tak kosong & bukan 'ERROR: ...'. */
  outputValidator?: (output: string, structured?: unknown) => {
    ok: boolean;
    partial?: boolean;
    error?: string;
  };
  /** Pemeriksaan kapabilitas statis sebelum gate persetujuan (mis. writesEnabled). */
  preCheck?: (args: Record<string, unknown>, execCtx: ToolExecContext) => {
    ok: boolean;
    errorCode?: string;
    error?: string;
  };
  /** undefined bila available === false (tidak ada yang bisa dijalankan). */
  invoke?: ToolInvokeFn;
  /** Modul sumber implementasi (jejak provenans registry). */
  source: string;
}

export interface ToolExecutionRecord {
  executionId: string;
  idempotencyKey: string;
  toolName: string;
  channel: ToolChannel;
  actor: ApprovalActor;
  projectId: string | null;
  conversationId: string | null;
  planId: string | null;
  stepId: string | null;
  status: ToolExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  /** Argumen (dipotong; secret diganti penanda, tidak pernah disimpan). */
  input: string;
  /** Output (dipotong 2000 karakter). */
  output: string | null;
  errorCode: string | null;
  error: string | null;
  permission: ToolPermission | null;
  approvedBy: ApprovalActor | null;
  /** true bila hasil ini putar-ulang idempoten (tanpa eksekusi baru). */
  replayed: boolean;
  effect: ToolSideEffect | null;
}

export interface ExecuteToolInput {
  toolName: string;
  args: Record<string, unknown>;
  projectId?: string | null;
  conversationId?: string | null;
  planId?: string | null;
  stepId?: string | null;
  actor: ApprovalActor;
  /** Persetujuan eksplisit pengguna untuk tool konsekwensial. */
  approval?: { actor: ApprovalActor; approvedAt: string } | null;
  idempotencyKey?: string;
  channel: ToolChannel;
  projectSnapshot?: ProjectSnapshot | null;
}

export interface ExecuteToolResult {
  ok: boolean;
  record: ToolExecutionRecord;
  output: string | null;
  errorCode?: string | null;
  error?: string | null;
}

/* ------------------------------------------------------------------ */
/* Util                                                                */
/* ------------------------------------------------------------------ */

export const TOOL_REGISTRY_VERSION = 1;
export const TOOL_EXECUTIONS_STORAGE_KEY = 'ezrab_prod_ai_tool_executions';
const TOOL_EXECUTIONS_SCHEMA_VERSION = 1;
const TRAIL_MAX_EVENTS_PER_PROJECT = 500;
const INPUT_PREVIEW_CHARS = 2000;
const OUTPUT_PREVIEW_CHARS = 2000;

function newExecutionId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return `tex-${c.randomUUID()}`;
  return `tex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `ezrab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** JSON stabil (kunci terurut) untuk kunci idempotensi yang deterministik. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

function djb2Hex(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export function deriveIdempotencyKey(
  toolName: string,
  projectId: string | null,
  args: Record<string, unknown>,
): string {
  return `tool:${toolName}:${projectId ?? 'no-project'}:${djb2Hex(stableStringify(args))}`;
}

function truncate(s: string, cap: number): string {
  return s.length > cap ? `${s.slice(0, cap)}…[dipotong]` : s;
}

function safeInputPreview(args: Record<string, unknown>): string {
  let raw: string;
  try {
    raw = JSON.stringify(args) ?? '{}';
  } catch {
    raw = '[argumen tidak dapat diserialisasi]';
  }
  if (containsSecret(raw)) return '[input mengandung pola kredensial — tidak disimpan di trail]';
  return truncate(raw, INPUT_PREVIEW_CHARS);
}

function safeOutputPreview(output: string | null): string | null {
  if (output == null) return null;
  if (containsSecret(output)) return '[output mengandung pola kredensial — tidak disimpan di trail]';
  return truncate(output, OUTPUT_PREVIEW_CHARS);
}

/* ------------------------------------------------------------------ */
/* Validasi skema input/output                                         */
/* ------------------------------------------------------------------ */

function typeMatches(value: unknown, type: ToolInputFieldType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return (
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    default:
      return false;
  }
}

function readField(
  args: Record<string, unknown>,
  field: ToolInputField,
): { present: boolean; value: unknown } {
  const names = [field.name, ...(field.aliases ?? [])];
  for (const n of names) {
    if (args[n] !== undefined && args[n] !== null) return { present: true, value: args[n] };
  }
  return { present: false, value: undefined };
}

export function validateToolInput(
  def: ToolDefinition,
  args: Record<string, unknown>,
): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, errors: ['Argumen harus berupa objek.'], warnings };
  }
  const known = new Set<string>();
  for (const f of def.inputSchema.fields) {
    known.add(f.name);
    for (const a of f.aliases ?? []) known.add(a);
    const { present, value } = readField(args, f);
    if (f.required && !present) {
      errors.push(`Medan wajib "${f.name}" tidak ada.`);
      continue;
    }
    if (!present) continue;
    if (!typeMatches(value, f.type)) {
      errors.push(`Medan "${f.name}" harus bertipe ${f.type}.`);
      continue;
    }
    if (f.type === 'string' && f.required && typeof value === 'string' && value.trim() === '') {
      errors.push(`Medan wajib "${f.name}" tidak boleh kosong.`);
    }
    if (f.enum && typeof value === 'string' && !f.enum.includes(value.toLowerCase())) {
      errors.push(`Medan "${f.name}" harus salah satu dari: ${f.enum.join(', ')}.`);
    }
    if (f.type === 'number') {
      const n = Number(value);
      if (f.min !== undefined && n < f.min) errors.push(`Medan "${f.name}" minimal ${f.min}.`);
      if (f.max !== undefined && n > f.max) errors.push(`Medan "${f.name}" maksimal ${f.max}.`);
    }
  }
  for (const group of def.inputSchema.requiredAnyOf ?? []) {
    const anyPresent = group.some((n) => args[n] !== undefined && args[n] !== null && args[n] !== '');
    if (!anyPresent) errors.push(`Salah satu medan wajib ada: ${group.join(' / ')}.`);
  }
  for (const k of Object.keys(args)) {
    if (!known.has(k)) warnings.push(`Medan tak dikenal "${k}" diabaikan oleh validasi (diteruskan apa adanya ke implementasi).`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function defaultOutputValidator(output: string): {
  ok: boolean;
  partial?: boolean;
  error?: string;
} {
  if (!output || output.trim() === '') return { ok: false, error: 'OUTPUT_EMPTY: tool mengembalikan output kosong.' };
  if (output.startsWith('ERROR:')) {
    return { ok: false, error: output.slice(0, 500) };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Trail audit append-only (pola ai_memory_events Fase 2)              */
/* ------------------------------------------------------------------ */

type TrailMap = Record<string, ToolExecutionRecord[]>;

function trailProjectKey(projectId: string | null): string {
  return projectId ?? '__no-project__';
}

function readTrail(): TrailMap {
  const res = loadVersioned<TrailMap>(TOOL_EXECUTIONS_STORAGE_KEY);
  if (!res.ok) return {};
  if (!res.data || typeof res.data !== 'object' || Array.isArray(res.data)) return {};
  return res.data;
}

function appendTrailEvent(record: ToolExecutionRecord): void {
  try {
    const map = readTrail();
    const key = trailProjectKey(record.projectId);
    const list = [...(map[key] ?? []), record];
    // Cap per proyek: peristiwa tertua dibuang (jejak audit berjalan,
    // bukan arsip tak terbatas — dicatat di laporan).
    map[key] = list.slice(-TRAIL_MAX_EVENTS_PER_PROJECT);
    saveVersioned(TOOL_EXECUTIONS_STORAGE_KEY, map);
  } catch {
    /* trail gagal ditulis ≠ eksekusi gagal; kegagalan trail dicatat di record pemanggil bila memungkinkan */
  }
}

/** Peristiwa trail terbaru per executionId (keadaan terkini eksekusi). */
export function listToolExecutions(
  projectId: string | null,
  limit = 50,
): ToolExecutionRecord[] {
  const list = readTrail()[trailProjectKey(projectId)] ?? [];
  const latest = new Map<string, ToolExecutionRecord>();
  for (const r of list) latest.set(r.executionId, r);
  return [...latest.values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

/** Semua peristiwa satu eksekusi (riwayat status lengkap), terurut waktu. */
export function getToolExecutionTrail(executionId: string): ToolExecutionRecord[] {
  const map = readTrail();
  const out: ToolExecutionRecord[] = [];
  for (const list of Object.values(map)) {
    for (const r of list) if (r.executionId === executionId) out.push(r);
  }
  return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function getToolExecution(executionId: string): ToolExecutionRecord | null {
  const trail = getToolExecutionTrail(executionId);
  return trail.length > 0 ? trail[trail.length - 1] : null;
}

/** Reset trail + registry uji (hanya untuk pengujian otomatis). */
export function __resetToolRegistryForTests(): void {
  try {
    saveVersioned(TOOL_EXECUTIONS_STORAGE_KEY, {});
  } catch {
    /* abaikan */
  }
}

/* ------------------------------------------------------------------ */
/* Registry — definisi tool                                            */
/*                                                                     */
/* Sumber implementasi (bukan karangan):                               */
/*  - tools.ts: 24 tool Chat AI (kalkulator, AHSP, harga, QTO,        */
/*    template, data proyek read-only, propose_* pratinjau tulis).     */
/*  - universalRab / specChain / agentOrchestrator / Fase 4: draft,    */
/*    validasi rantai, analisis biaya, konflik teknis, kelayakan       */
/*    budget, retrieval domain, DED reader, QTO bridge.                */
/*  - navRegistry: navigasi deterministik (resolve saja; navigasi      */
/*    tetap dilakukan UI).                                             */
/* ------------------------------------------------------------------ */

const S = (name: string, type: ToolInputFieldType, required = false, extra?: Partial<ToolInputField>): ToolInputField => ({
  name, type, required, ...extra,
});

function wrapChatTool(def: EzrabAiToolDef): ToolInvokeFn {
  return (args) => {
    const out = runTool(def.name, args);
    return typeof out === 'string' ? out : out.message;
  };
}

/** Pre-check propose_*: operasi tulis hanya bila capability aktif. */
function writesEnabledPreCheck(): NonNullable<ToolDefinition['preCheck']> {
  return () => {
    const ctx = getAssistantOperationContext();
    if (!ctx?.writesEnabled) {
      return {
        ok: false,
        errorCode: 'WRITE_NOT_ENABLED',
        error: 'Operasi tulis Asisten AI tidak aktif untuk sesi ini: peran aktif tidak memiliki capability edit-estimate. Tidak ada perubahan yang dibuat.',
      };
    }
    return { ok: true };
  };
}

/** Output validator propose_*: penolakan pratinjau = gagal, bukan sukses. */
function proposeOutputValidator(output: string): { ok: boolean; error?: string } {
  const base = defaultOutputValidator(output);
  if (!base.ok) return base;
  if (/tidak aktif untuk sesi ini|Tidak ada perubahan yang dibuat|tidak dapat diusulkan/i.test(output)) {
    return { ok: false, error: output.slice(0, 500) };
  }
  return { ok: true };
}

/**
 * S5 (§5 P3C-F5) — Unit yang diminta untuk `check_qto`, digabung dari
 * dua sumber dengan aturan yang SAMA seperti alur QTO kanonis
 * (`reconcileDedQto` di dedQtoIntegration.ts):
 *  1. argumen eksplisit `requestedUnitByDescription` (menang bila konflik);
 *  2. `derivation.resultUnit` per item — mengisi deskripsi yang tidak
 *     tercakup argumen eksplisit (sumber yang sama dengan alur kanonis).
 * Entri bukan-string / kosong diabaikan (fail-closed: tanpa unit yang
 * diminta yang sah, gerbang tidak mengada-ada). Tanpa peta, gerbang
 * tidak aktif — sama seperti alur kanonis tanpa resultUnit. TIDAK ADA
 * konversi satuan di sini: gerbang hanya membandingkan, jembatan yang
 * memblokir (UNIT_MISMATCH) bila tidak cocok.
 */
function resolveQtoRequestedUnits(
  items: Array<Record<string, unknown>>,
  explicit: unknown,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (explicit && typeof explicit === 'object' && !Array.isArray(explicit)) {
    for (const [k, v] of Object.entries(explicit as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim() !== '') out[k] = v;
    }
  }
  for (const it of items) {
    const desc = typeof it.description === 'string' ? it.description : '';
    if (!desc || out[desc]) continue;
    const d = it.derivation as { resultUnit?: unknown } | undefined;
    if (d && typeof d.resultUnit === 'string' && d.resultUnit.trim() !== '') {
      out[desc] = d.resultUnit;
    }
  }
  return out;
}

const CHAT_TOOL_SCHEMAS: Record<string, { permission: ToolPermission; requiresProject: boolean; schema: ToolInputSchema; channels?: ToolChannel[] }> = {
  subtotal: {
    permission: 'read-only', requiresProject: false,
    schema: { fields: [S('volume', 'number', true, { aliases: ['quantity'] }), S('unitPrice', 'number', true, { aliases: ['price'] }), S('unit', 'string'), S('priceUnit', 'string', false, { aliases: ['satuan_harga', 'unitPriceUnit'] })] },
  },
  volume_persegi: {
    permission: 'read-only', requiresProject: false,
    schema: { fields: [S('panjang', 'number', true), S('lebar', 'number', true), S('tinggi', 'number', true)] },
  },
  luas_dinding: {
    permission: 'read-only', requiresProject: false,
    schema: { fields: [S('panjang', 'number', true), S('tinggi', 'number', true), S('sisi', 'number'), S('bukaan', 'number', false, { aliases: ['luas_bukaan'] })] },
  },
  persentase_level: {
    permission: 'read-only', requiresProject: false,
    schema: { fields: [S('kenaikan', 'number', true), S('jarak', 'number', true, { min: 0 })] },
  },
  cari_ahsp: {
    permission: 'read-only', requiresProject: false,
    schema: { fields: [S('kata_kunci', 'string', true, { aliases: ['query'] }), S('satuan', 'string')] },
  },
  cari_harga: {
    permission: 'read-only', requiresProject: false,
    schema: { fields: [S('kata_kunci', 'string', true, { aliases: ['query'] }), S('jenis', 'string', false, { enum: ['material', 'upah', 'alat'] })] },
  },
  cari_pengetahuan_konstruksi: {
    permission: 'read-only', requiresProject: false,
    schema: { fields: [S('kata_kunci', 'string', true, { aliases: ['query'] }), S('maks', 'number', false, { aliases: ['maxResults'], min: 1, max: 10 })] },
  },
  hitung_qto: {
    permission: 'read-only', requiresProject: false,
    schema: { fields: [S('kalkulator', 'string', true, { aliases: ['calculatorId'] }), S('parameter', 'object', true, { aliases: ['inputs', 'params'] }), S('satuan_hasil', 'string', false, { aliases: ['expectedUnit'] })] },
  },
  cari_kalkulator: {
    permission: 'read-only', requiresProject: false,
    schema: { fields: [S('kata_kunci', 'string', false, { aliases: ['keyword'] })] },
  },
  cari_template_rab: {
    permission: 'read-only', requiresProject: false,
    schema: { fields: [S('kata_kunci', 'string', true, { aliases: ['query'] })] },
  },
  get_project_total: {
    permission: 'read-only', requiresProject: true,
    schema: { fields: [] },
  },
  get_project_items: {
    permission: 'read-only', requiresProject: true,
    schema: { fields: [S('kata_kunci', 'string', false, { aliases: ['query'] }), S('hanya_belum_berharga', 'boolean', false, { aliases: ['onlyUnresolved'] })] },
  },
  get_item_detail: {
    permission: 'read-only', requiresProject: true,
    schema: { fields: [S('nama', 'string', true, { aliases: ['name', 'kode'] })] },
  },
  get_project_labor: {
    permission: 'read-only', requiresProject: true,
    schema: { fields: [S('nama', 'string', false, { aliases: ['name', 'kode'] }), S('kategori', 'string', false, { aliases: ['category'] })] },
  },
  get_project_sections: {
    permission: 'read-only', requiresProject: true,
    schema: { fields: [] },
  },
  get_project_costliest: {
    permission: 'read-only', requiresProject: true,
    schema: { fields: [S('jumlah', 'number', false, { min: 1, max: 10 })] },
  },
  get_project_materials: {
    permission: 'read-only', requiresProject: true,
    schema: { fields: [S('nama', 'string', false, { aliases: ['name', 'kode'] })] },
  },
  propose_update_quantity: {
    permission: 'draft', requiresProject: true,
    schema: { fields: [S('nama', 'string', false, { aliases: ['name'] }), S('id', 'string'), S('volume', 'number', true)], requiredAnyOf: [['id', 'nama', 'name']] },
    channels: ['chat-ai', 'orchestrator'],
  },
  propose_update_unit_price: {
    permission: 'draft', requiresProject: true,
    schema: { fields: [S('nama', 'string', false, { aliases: ['name'] }), S('id', 'string'), S('harga', 'number', true, { aliases: ['price'] })], requiredAnyOf: [['id', 'nama', 'name']] },
    channels: ['chat-ai', 'orchestrator'],
  },
  propose_delete_items: {
    permission: 'draft', requiresProject: true,
    schema: { fields: [S('nama', 'string', false, { aliases: ['name'] }), S('id', 'string'), S('daftar_nama', 'array'), S('daftar_id', 'array')], requiredAnyOf: [['nama', 'name', 'id', 'daftar_nama', 'daftar_id']] },
    channels: ['chat-ai', 'orchestrator'],
  },
  propose_add_item: {
    permission: 'draft', requiresProject: true,
    schema: { fields: [S('kode_ahsp', 'string', true, { aliases: ['kode'] }), S('volume', 'number')] },
    channels: ['chat-ai', 'orchestrator'],
  },
  propose_undo_last: {
    permission: 'draft', requiresProject: true,
    schema: { fields: [] },
    channels: ['chat-ai', 'orchestrator'],
  },
  get_operation_history: {
    permission: 'read-only', requiresProject: true,
    schema: { fields: [S('jumlah', 'number', false, { min: 1, max: 25 })] },
  },
  get_unresolved_items: {
    permission: 'read-only', requiresProject: true,
    schema: { fields: [] },
  },
};

function buildChatToolDefinitions(): ToolDefinition[] {
  return EZRAB_AI_TOOLS.map((t) => {
    const meta = CHAT_TOOL_SCHEMAS[t.name];
    if (!meta) {
      // Tool tools.ts tanpa meta registry = tidak didaftarkan (fail-closed);
      // kondisi ini tidak boleh terjadi — dijaga tes T5-01.
      throw new Error(`TOOL_REGISTRY_SCHEMA_MISSING: tool "${t.name}" di tools.ts belum punya skema/izin di toolRegistry.ts.`);
    }
    const isPropose = t.name.startsWith('propose_');
    return {
      name: t.name,
      description: t.description,
      permission: meta.permission,
      sideEffect: isPropose ? 'draft-preview' : 'none',
      idempotent: true,
      timeoutMs: 30_000,
      available: true,
      requiresProject: meta.requiresProject,
      recordToMemory: false,
      channels: meta.channels,
      inputSchema: meta.schema,
      outputValidator: isPropose ? proposeOutputValidator : undefined,
      preCheck: isPropose ? writesEnabledPreCheck() : undefined,
      invoke: wrapChatTool(t),
      source: 'tools.ts',
    };
  });
}

const READ_ONLY_CHANNELS: ToolChannel[] = ['chat-ai', 'copilot', 'orchestrator', 'ded'];

/** Tool registry-native (di luar tools.ts) — implementasi ADA, bukan karangan. */
const NATIVE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'build_universal_draft',
    description: 'Menyusun draft RAB dari teks permintaan memakai mesin katalog deterministik (harga hanya AHSP resmi/resolver). Mengembalikan pesan draft + status parsial bila ada item belum berharga. TIDAK menulis ke proyek (transfer tetap lewat tombol push-rab).',
    permission: 'draft',
    sideEffect: 'draft-preview',
    idempotent: true,
    timeoutMs: 60_000,
    available: true,
    requiresProject: false,
    recordToMemory: true,
    channels: [...READ_ONLY_CHANNELS, 'test'],
    inputSchema: { fields: [S('text', 'string', true), S('projectId', 'string'), S('budgetCap', 'number')] },
    invoke: (args) => {
      const text = String(args.text);
      const projectId = typeof args.projectId === 'string' ? args.projectId : null;
      const res = buildUniversalDraft(text, undefined, {
        projectId,
        budgetCapOverride: typeof args.budgetCap === 'number' ? args.budgetCap : null,
      });
      if (res.kind !== 'draft') {
        return `ERROR: draft tidak dapat disusun — ${res.reason}`;
      }
      const items = res.draft.parts.flatMap((p) => p.generation.items ?? []);
      const unresolved = items.filter((i: { priceStatus?: string | null }) => i.priceStatus === 'PRICE_UNRESOLVED').length;
      return {
        output: formatUniversalDraftMessage(res.draft),
        partial: unresolved > 0,
        structured: { draftVersion: res.draft.version, itemCount: items.length, unresolvedCount: unresolved, title: res.draft.title },
      };
    },
    source: 'universalRab.ts',
  },
  {
    name: 'validate_spec_chain',
    description: 'Memvalidasi rantai spek → item draft (6 butir deterministik specChain): cakupan spek, tautan item, volume, harga, ambiguitas. Read-only; tidak mengubah draft.',
    permission: 'read-only',
    sideEffect: 'none',
    idempotent: true,
    timeoutMs: 30_000,
    available: true,
    requiresProject: false,
    recordToMemory: true,
    channels: [...READ_ONLY_CHANNELS, 'test'],
    inputSchema: { fields: [S('draft', 'object', true), S('structuredSpecs', 'array')] },
    invoke: (args) => {
      const draft = args.draft as Parameters<typeof validateDraftChain>[0];
      const specs = Array.isArray(args.structuredSpecs) ? (args.structuredSpecs as never[]) : [];
      const v: ChainValidation = validateDraftChain(draft, specs as never);
      const flags = (v.volumeChecks ?? []).filter((c) => c.verdict === 'FLAG').length;
      // ChainValidation tidak punya medan 'valid' tunggal — valid berarti:
      // nol FLAG volume + nol item asing + nol mismatch material.
      const valid = flags === 0 && (v.foreignItems?.length ?? 0) === 0 && (v.materialMismatches?.length ?? 0) === 0;
      const lines = [
        `Validasi rantai spek: ${valid ? 'LOLOS' : 'GAGAL'} — ${v.specCoverage?.length ?? 0} spek tercakup, ${v.itemLinks?.length ?? 0} tautan item, ${flags} pemeriksaan volume berstatus FLAG, ${v.foreignItems?.length ?? 0} item asing, ${v.materialMismatches?.length ?? 0} mismatch material.`,
      ];
      for (const c of v.volumeChecks ?? []) {
        if (c.verdict === 'FLAG') lines.push(`• FLAG: ${c.description}`);
      }
      for (const f of v.foreignItems ?? []) lines.push(`• Item asing: ${f}`);
      for (const m of v.materialMismatches ?? []) lines.push(`• Mismatch material: ${m.item} (diminta ${m.requested}, aktual ${m.actual})`);
      return { output: lines.join('\n'), partial: !valid, structured: { valid, flagCount: flags, foreignCount: v.foreignItems?.length ?? 0, mismatchCount: v.materialMismatches?.length ?? 0 } };
    },
    source: 'specChain.ts',
  },
  {
    name: 'analyze_draft_costs',
    description: 'Menganalisis item draft NYATA: total berharga, item tak berharga (total dinyatakan parsial), 3 item termahal + pangsanya. Read-only; bukan direktori slash-command.',
    permission: 'read-only',
    sideEffect: 'none',
    idempotent: true,
    timeoutMs: 30_000,
    available: true,
    requiresProject: false,
    recordToMemory: true,
    channels: [...READ_ONLY_CHANNELS, 'test'],
    inputSchema: { fields: [S('items', 'array', true)] },
    invoke: (args) => {
      const items = (args.items as Array<{ description: string; totalPrice: number; priceStatus?: string | null; unitPrice?: number | null }>) ?? [];
      const analysis = analyzeDraftCosts(items);
      return { output: formatCostAnalysis(analysis), partial: analysis.unresolvedCount > 0, structured: analysis };
    },
    source: 'agentOrchestrator.ts',
  },
  {
    name: 'detect_technical_conflicts',
    description: 'Mendeteksi konflik teknis deterministik (luas bangunan > luas lahan, tinggi < lantai × 2,4 m, volume vs dimensi >10%, atap ganda, total > cap budget, spek duplikat). Semua konflik berstatus needs-user-decision — tidak dipilih diam-diam.',
    permission: 'read-only',
    sideEffect: 'none',
    idempotent: true,
    timeoutMs: 30_000,
    available: true,
    requiresProject: false,
    recordToMemory: true,
    channels: [...READ_ONLY_CHANNELS, 'test'],
    inputSchema: { fields: [S('specs', 'array'), S('dimensions', 'object'), S('buildings', 'array'), S('budget', 'object')] },
    invoke: (args) => {
      const conflicts = detectTechnicalConflicts({
        specs: Array.isArray(args.specs) ? (args.specs as never[]) : [],
        dimensions: (args.dimensions as never) ?? {},
        buildings: Array.isArray(args.buildings) ? (args.buildings as never[]) : [],
        budget: (args.budget as never) ?? {},
      });
      const lines = formatConflictLines(conflicts);
      return {
        output: lines.length > 0 ? lines.join('\n') : 'Tidak ada konflik teknis terdeteksi.',
        partial: conflicts.length > 0,
        structured: { conflictCount: conflicts.length },
      };
    },
    source: 'technicalConflicts.ts',
  },
  {
    name: 'assess_budget_feasibility',
    description: 'Menilai kelayakan budget atas total berharga (UNDER/OVER/CANNOT_ASSESS/NO_BUDGET); item belum berharga membuat verdict SEMENTARA (provisional), bukan CANNOT_ASSESS.',
    permission: 'read-only',
    sideEffect: 'none',
    idempotent: true,
    timeoutMs: 30_000,
    available: true,
    requiresProject: false,
    recordToMemory: true,
    channels: [...READ_ONLY_CHANNELS, 'test'],
    inputSchema: { fields: [S('totalPriced', 'number'), S('unpricedCount', 'number', true), S('budgetCap', 'number')] },
    invoke: (args) => {
      const a = assessBudgetFeasibility({
        totalPriced: typeof args.totalPriced === 'number' ? args.totalPriced : null,
        unpricedCount: Number(args.unpricedCount ?? 0),
        budgetCap: typeof args.budgetCap === 'number' ? args.budgetCap : null,
      });
      return { output: formatBudgetFeasibilityLine(a), partial: a.provisional === true, structured: a };
    },
    source: 'budgetFeasibility.ts',
  },
  {
    name: 'search_domain_candidates',
    description: 'Mencari kandidat domain konstruksi: knowledge base internal + AHSP resmi (officialAhspRepository). Harga = getAhspDirectPrice ?? baked item.unitPrice; UNIT_MISMATCH → harga null (bukan Rp0); tanpa kandidat → PRICE_UNRESOLVED.',
    permission: 'read-only',
    sideEffect: 'none',
    idempotent: true,
    timeoutMs: 30_000,
    available: true,
    requiresProject: false,
    recordToMemory: false,
    channels: [...READ_ONLY_CHANNELS, 'test'],
    inputSchema: { fields: [S('query', 'string', false), S('queries', 'array'), S('maxResults', 'number', false, { min: 1, max: 10 })], requiredAnyOf: [['query', 'queries']] },
    invoke: (args) => {
      const queries = Array.isArray(args.queries)
        ? (args.queries as unknown[]).map(String).filter(Boolean)
        : [String(args.query)];
      const result = retrieveDomainCandidates(queries, { maxAhspPerQuery: Number(args.maxResults ?? 3) || 3 });
      const lines = formatDomainCandidateLines(result);
      return { output: lines.join('\n') || 'Tidak ada kandidat domain yang ditemukan.', structured: { kbHits: result.kbHits?.length ?? 0, ahspCandidates: result.ahspCandidates?.length ?? 0 } };
    },
    source: 'constructionDomainRetrieval.ts',
  },
  {
    name: 'extract_ded_specs',
    description: 'Membaca hasil DED kanonis (DedAiOutput) → spek terstruktur + daftar data hilang (missingData eksplisit, bukan karangan). Hanya membaca; TIDAK menyatukan dua pipeline DED (ARS-02) dan TIDAK mengubah semantik total DED.',
    permission: 'read-only',
    sideEffect: 'none',
    idempotent: true,
    timeoutMs: 30_000,
    available: true,
    requiresProject: false,
    recordToMemory: true,
    channels: [...READ_ONLY_CHANNELS, 'test'],
    inputSchema: { fields: [S('dedOutput', 'object', true)] },
    invoke: (args) => {
      const output = args.dedOutput as Parameters<typeof extractSpecsFromDedOutput>[0];
      if (!output || typeof output !== 'object' || !Array.isArray((output as { items?: unknown }).items)) {
        return 'ERROR: dedOutput harus berupa objek DedAiOutput dengan array items.';
      }
      const result = extractSpecsFromDedOutput(output);
      return {
        output: formatDedUnderstandingLines(result).join('\n'),
        partial: result.coverage.partial || result.missingData.length > 0,
        structured: { specCount: result.specs.length, missingCount: result.missingData.length, partial: result.coverage.partial },
      };
    },
    source: 'dedUnderstanding.ts',
  },
  {
    name: 'check_qto',
    description: 'Membandingkan kuantitas QTO/DED dengan dimensi pengguna (toleransi 10%): OK / MISMATCH / MISSING (null, bukan 0) / ASSUMPTION / UNIT_MISMATCH / CANNOT_CHECK. Ketidakcocokan DILAPORKAN, bukan dikoreksi diam-diam; aritmetika QTO tidak diubah. Gerbang unit (CON-11, sama seperti alur QTO kanonis): requestedUnitByDescription (argumen opsional) atau derivation.resultUnit per item yang berbeda dari unit item → UNIT_MISMATCH (kalkulasi DIBLOKIR, tanpa konversi diam-diam).',
    permission: 'read-only',
    sideEffect: 'none',
    idempotent: true,
    timeoutMs: 30_000,
    available: true,
    requiresProject: false,
    recordToMemory: true,
    channels: [...READ_ONLY_CHANNELS, 'test'],
    inputSchema: { fields: [S('items', 'array', true), S('dimensions', 'object', true), S('requestedUnitByDescription', 'object')] },
    invoke: (args) => {
      const items = args.items as Parameters<typeof checkQtoAgainstUserDimensions>[0];
      const dims = args.dimensions as Parameters<typeof checkQtoAgainstUserDimensions>[1];
      if (!items.every((it) => it && typeof it === 'object' && typeof (it as { description?: unknown }).description === 'string' && typeof (it as { unit?: unknown }).unit === 'string')) {
        return 'ERROR: tiap item QTO wajib {description: string, quantity: number|null, unit: string}.';
      }
      // S5 (P3C-F5): gerbang unit yang SAMA dengan alur QTO kanonis —
      // teruskan requestedUnitByDescription eksplisit + resultUnit
      // derivasi per item ke jembatan. Tanpa peta, panggilan identik
      // dengan sebelumnya (gerbang tidak aktif).
      const requestedUnitByDescription = resolveQtoRequestedUnits(
        items as unknown as Array<Record<string, unknown>>,
        args.requestedUnitByDescription,
      );
      const checks = Object.keys(requestedUnitByDescription).length > 0
        ? checkQtoAgainstUserDimensions(items, dims, { requestedUnitByDescription })
        : checkQtoAgainstUserDimensions(items, dims);
      const bad = checks.filter((c) => c.verdict === 'MISMATCH' || c.verdict === 'MISSING' || c.verdict === 'UNIT_MISMATCH').length;
      return {
        output: formatQtoCheckLines(checks).join('\n') || 'Tidak ada item QTO untuk diperiksa.',
        partial: bad > 0,
        structured: { checkCount: checks.length, problemCount: bad },
      };
    },
    source: 'qtoBridge.ts',
  },
  {
    name: 'navigate',
    description: 'Me-resolve perintah navigasi deterministik (slash/menu) ke entri registry. Hanya me-resolve — navigasi tetap dilakukan UI; tidak mengubah state.',
    permission: 'read-only',
    sideEffect: 'none',
    idempotent: true,
    timeoutMs: 10_000,
    available: true,
    requiresProject: false,
    recordToMemory: false,
    channels: [...READ_ONLY_CHANNELS, 'test'],
    inputSchema: { fields: [S('command', 'string', true)] },
    invoke: (args) => {
      const r = resolveNavCommand(String(args.command));
      if (r.mode === 'direct') return `Navigasi: ${r.entry.label ?? r.entry.id} (menu: ${r.entry.menu ?? r.entry.id}).`;
      if (r.mode === 'suggest' || r.mode === 'ambiguous') return r.message;
      return 'Perintah navigasi tidak dikenali — bukan menu/fitur EZRAB yang terdaftar.';
    },
    source: 'navRegistry.ts',
  },
  {
    name: 'transfer_draft',
    description: 'TRANSFER DRAFT — SATU-SATUNYA jalur tulis yang dikenal registry, dan ia TIDAK menulis sendiri: eksekusi ini hanya memeriksa kesiapan transfer (draft ada + terikat proyek + tidak diblokir draftReadiness + belum ada kwitansi versi yang sama) sesudah persetujuan eksplisit pengguna. Penulisan item ke Spreadsheet RAB tetap HANYA lewat tombol push-rab yang ada di Chat AI; kwitansinya dicatat ke trail oleh handler tombol itu (recordTransferReceipt).',
    permission: 'consequential',
    sideEffect: 'delegated-ui',
    idempotent: true,
    timeoutMs: 30_000,
    available: true,
    requiresProject: true,
    recordToMemory: true,
    channels: ['chat-ai', 'orchestrator'],
    inputSchema: { fields: [S('projectId', 'string', true), S('draftVersion', 'number', true), S('draftTitle', 'string')] },
    invoke: (args) => {
      const projectId = String(args.projectId);
      const version = Number(args.draftVersion);
      // Hanya singleton in-memory yang membawa UniversalDraft utuh;
      // PersistedDraftRecord menyimpan parts/spec/items terpisah (bukan
      // objek draft) sehingga tidak dipakai di sini. Di alur produk,
      // view memulihkan draft persisten ke singleton saat mount.
      const draft: UniversalDraft | null = getLastUniversalDraft(projectId);
      if (!draft) {
        return 'ERROR: tidak ada draft aktif di sesi ini untuk proyek ini — buka Chat AI proyek ini agar draft dipulihkan, lalu coba lagi.';
      }
      if (draft.version !== version) {
        return `ERROR: versi draft tidak cocok (diminta v${version}, aktif v${draft.version}) — muat ulang draft sebelum transfer.`;
      }
      const readiness = draftReadiness(draft);
      if (readiness.blockedReasons.length > 0) {
        return `ERROR: draft DIBLOKIR untuk transfer: ${readiness.blockedReasons.join('; ')}`;
      }
      if (draft.lastTransfer && draft.lastTransfer.version === version && draft.lastTransfer.projectId === projectId) {
        return {
          output: `Draft "${draft.title}" v${version} SUDAH ditransfer ke proyek ini (${draft.lastTransfer.pushed} item, ${draft.lastTransfer.at}) — tidak ada penulisan ulang.`,
          structured: { alreadyTransferred: true, pushed: draft.lastTransfer.pushed },
        };
      }
      return {
        output: `Draft "${draft.title}" v${version} SIAP dipindahkan ke proyek (kesiapan terverifikasi: ${readiness.reasons.length === 0 ? 'tanpa catatan' : readiness.reasons.join('; ')}). Transfer diselesaikan lewat tombol "Push ke Spreadsheet RAB" yang ada di chat — registry tidak menulis sendiri.`,
        structured: { ready: true, version },
      };
    },
    source: 'universalRab.ts + draftPersistence.ts (readiness read-only; tulis tetap di view.tsx)',
  },
];

/** Tool yang diminta/dikenal tetapi TIDAK tersedia — dicatat, bukan pura-pura ada. */
const UNAVAILABLE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'wizard_server',
    description: 'Endpoint wizard server /api/assistant/wizard/* — TIDAK PERNAH ADA (ARS-04). Jalur ini ditutup Fase 5: aiApiClient gagal tegas tanpa fetch; Chatbox/FullView memakai resolveClientWizardStep lokal. Tool ini terdaftar hanya agar pemanggilan apa pun terhadapnya DIBLOKIR dengan alasan jujur.',
    permission: 'consequential',
    sideEffect: 'external-call',
    idempotent: false,
    timeoutMs: 0,
    available: false,
    unavailableReason: 'WIZARD_SERVER_NOT_IMPLEMENTED: endpoint /api/assistant/wizard/* tidak pernah diimplementasikan di api/ — gunakan wizard client-side (resolveClientWizardStep).',
    requiresProject: true,
    recordToMemory: false,
    inputSchema: { fields: [S('sessionId', 'string', true)] },
    source: 'aiApiClient.ts (ditutup Fase 5)',
  },
  {
    name: 'llm_memory_extraction',
    description: 'Ekstraksi memori memakai LLM — TIDAK DIBANGUN (Fase 3). Risiko karangan belum tergerbang; konsolidasi deterministik yang dipakai. Butuh keputusan owner sebelum dibangun.',
    permission: 'draft',
    sideEffect: 'none',
    idempotent: false,
    timeoutMs: 0,
    available: false,
    unavailableReason: 'LLM_EXTRACTION_NOT_BUILT: ekstraksi memori LLM tidak dibangun (Fase 3 §6) — keputusan owner diperlukan.',
    requiresProject: false,
    recordToMemory: false,
    inputSchema: { fields: [] },
    source: 'agentOrchestrator.ts (requestLlmMemoryExtraction)',
  },
  {
    name: 'resume_server_execution',
    description: 'Resume eksekusi AI sesudah reload dari job store server — TIDAK ADA (Fase 6). Gateway stateless; perilaku jujur kini INTERRUPTED + Coba Lagi manual.',
    permission: 'read-only',
    sideEffect: 'external-call',
    idempotent: false,
    timeoutMs: 0,
    available: false,
    unavailableReason: 'SERVER_RESUME_NOT_BUILT: tidak ada job store server (Fase 6) — reload = INTERRUPTED + retry manual.',
    requiresProject: true,
    recordToMemory: false,
    inputSchema: { fields: [S('requestId', 'string', true)] },
    source: 'executionRuntime.ts (INTERRUPTED by design)',
  },
  {
    name: 'present_questionnaire',
    description: 'Menampilkan kartu kuesioner — UI-driven (kartu interaktif di gelembung asisten), BUKAN tool yang dieksekusi registry. Dijalankan lewat mesin questionnaire.ts dari Chat AI; registry hanya mencatat bahwa jalur ini ada di luar eksekutor.',
    permission: 'draft',
    sideEffect: 'delegated-ui',
    idempotent: false,
    timeoutMs: 0,
    available: false,
    unavailableReason: 'QUESTIONNAIRE_IS_UI_DRIVEN: kartu kuesioner ditampilkan UI Chat AI (questionnaire.ts), bukan dieksekusi registry tool.',
    requiresProject: true,
    recordToMemory: false,
    inputSchema: { fields: [S('categoryId', 'string', true)] },
    source: 'questionnaire.ts (UI-driven)',
  },
];

const TOOL_MAP = new Map<string, ToolDefinition>();
for (const d of [...buildChatToolDefinitions(), ...NATIVE_TOOL_DEFINITIONS, ...UNAVAILABLE_TOOL_DEFINITIONS]) {
  if (TOOL_MAP.has(d.name)) throw new Error(`TOOL_REGISTRY_DUPLICATE: tool "${d.name}" terdaftar dua kali.`);
  TOOL_MAP.set(d.name, d);
}

export function getToolDefinition(name: string): ToolDefinition | null {
  return TOOL_MAP.get(name) ?? null;
}

export function listToolDefinitions(): ToolDefinition[] {
  return [...TOOL_MAP.values()];
}

export function listAvailableTools(): ToolDefinition[] {
  return listToolDefinitions().filter((d) => d.available);
}

/** Daftar tool read-only yang boleh dipanggil Copilot (channel 'copilot'). */
export const COPILOT_ALLOWED_TOOLS: string[] = listAvailableTools()
  .filter((d) => d.permission === 'read-only' && (d.channels ?? []).includes('copilot'))
  .map((d) => d.name);

/* ------------------------------------------------------------------ */
/* Eksekusi terorkestrasi                                              */
/* ------------------------------------------------------------------ */

function baseRecord(input: ExecuteToolInput, def: ToolDefinition | null, status: ToolExecutionStatus): ToolExecutionRecord {
  return {
    executionId: newExecutionId(),
    idempotencyKey: input.idempotencyKey ?? deriveIdempotencyKey(input.toolName, input.projectId ?? null, input.args),
    toolName: input.toolName,
    channel: input.channel,
    actor: input.actor,
    projectId: input.projectId ?? null,
    conversationId: input.conversationId ?? null,
    planId: input.planId ?? null,
    stepId: input.stepId ?? null,
    status,
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    input: safeInputPreview(input.args),
    output: null,
    errorCode: null,
    error: null,
    permission: def?.permission ?? null,
    approvedBy: null,
    replayed: false,
    effect: def?.sideEffect ?? null,
  };
}

function finishRecord(
  record: ToolExecutionRecord,
  status: ToolExecutionStatus,
  patch: Partial<ToolExecutionRecord> = {},
): ToolExecutionRecord {
  const done: ToolExecutionRecord = {
    ...record,
    ...patch,
    status,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - Date.parse(record.startedAt),
  };
  appendTrailEvent(done);
  return done;
}

/** Hasil eksekusi sukses/parsial → memori Fase 2 (hanya tool yang ditandai). */
function recordResultToMemory(def: ToolDefinition, record: ToolExecutionRecord, output: string): void {
  if (!def.recordToMemory) return;
  if (!record.projectId) return;
  try {
    const scope: MemoryScope = {
      userId: null,
      projectId: record.projectId,
      conversationId: record.conversationId,
    };
    const preview = truncate(output.replace(/\s+/g, ' ').trim(), 600);
    const created = createMemoryRecord({
      userId: null,
      projectId: record.projectId,
      conversationId: record.conversationId,
      memoryKey: `tool-result:${def.name}`,
      layer: record.conversationId ? 'conversation' : 'project',
      memoryType: 'task-result',
      content: `Hasil tool ${def.name} (${record.status}): ${preview}`,
      structuredPayload: {
        tool: def.name,
        executionId: record.executionId,
        status: record.status,
        explicitReplacement: true,
        outputPreview: preview,
      },
      sourceMessageId: null,
      sourceType: 'tool-result',
      provenance: `eksekusi tool ${def.name} via registry Fase 5 (channel ${record.channel}, ${record.startedAt})`,
      quality: 'confirmed-fact',
      confidence: 1,
      importance: 1,
    });
    if (created.ok) storeMemoryWithConflictResolution(created.value, scope);
  } catch {
    /* memori gagal ≠ eksekusi gagal */
  }
}

/**
 * Menjalankan SATU tool lewat registry. Urutan penegakan (semua
 * penolakan tercatat di trail SEBELUM efek apa pun terjadi):
 *  1. Tool dikenal? tersedia? kanal diizinkan?
 *  2. Scope proyek (lintas-proyek ditolak; tool proyek tanpa projectId diblokir).
 *  3. Secret di argumen → diblokir.
 *  4. Validasi skema input → tak valid diblokir (runner tak dipanggil).
 *  5. Pre-check kapabilitas (mis. writesEnabled untuk propose_*).
 *  6. Permission: konsekwensial tanpa persetujuan pengguna → status
 *     'awaiting-approval' (tidak dieksekusi); approval non-user → gagal.
 *  7. Idempotensi: kunci sama + sukses/parsial sebelumnya → putar ulang.
 *  8. Jalankan dengan timeout → validasi output → trail + memori.
 */
export async function executeTool(input: ExecuteToolInput): Promise<ExecuteToolResult> {
  const def = getToolDefinition(input.toolName);
  const projectId = input.projectId ?? input.projectSnapshot?.projectId ?? null;

  // 1. Tool dikenal + tersedia + kanal diizinkan.
  if (!def) {
    const rec = baseRecord({ ...input, projectId }, null, 'failed');
    const done = finishRecord(rec, 'failed', {
      errorCode: 'TOOL_NOT_FOUND',
      error: `Alat tidak dikenal: ${input.toolName} — tidak ada di registry tool kanonis.`,
    });
    return { ok: false, record: done, output: null, errorCode: 'TOOL_NOT_FOUND', error: done.error };
  }
  const effInput: ExecuteToolInput = { ...input, projectId };
  if (!def.available) {
    const rec = baseRecord(effInput, def, 'blocked');
    const done = finishRecord(rec, 'blocked', {
      errorCode: 'TOOL_UNAVAILABLE',
      error: def.unavailableReason ?? `Tool ${def.name} tidak tersedia.`,
    });
    return { ok: false, record: done, output: null, errorCode: 'TOOL_UNAVAILABLE', error: done.error };
  }
  if (def.channels && !def.channels.includes(input.channel)) {
    const rec = baseRecord(effInput, def, 'blocked');
    const done = finishRecord(rec, 'blocked', {
      errorCode: 'TOOL_NOT_ALLOWED_ON_CHANNEL',
      error: `Tool ${def.name} tidak diizinkan pada kanal ${input.channel} (kanal yang diizinkan: ${def.channels.join(', ')}).`,
    });
    return { ok: false, record: done, output: null, errorCode: 'TOOL_NOT_ALLOWED_ON_CHANNEL', error: done.error };
  }

  // 2. Scope proyek.
  const argsProjectId = typeof input.args.projectId === 'string' ? (input.args.projectId as string) : null;
  if (argsProjectId && projectId && argsProjectId !== projectId) {
    const rec = baseRecord(effInput, def, 'blocked');
    const done = finishRecord(rec, 'blocked', {
      errorCode: 'PROJECT_SCOPE_MISMATCH',
      error: `Eksekusi lintas proyek ditolak: argumen menyebut proyek ${argsProjectId}, scope eksekusi ${projectId}.`,
    });
    return { ok: false, record: done, output: null, errorCode: 'PROJECT_SCOPE_MISMATCH', error: done.error };
  }
  const effectiveProjectId = projectId ?? argsProjectId;
  if (def.requiresProject && !effectiveProjectId) {
    const rec = baseRecord({ ...effInput, projectId: effectiveProjectId }, def, 'blocked');
    const done = finishRecord(rec, 'blocked', {
      errorCode: 'PROJECT_REQUIRED',
      error: `Tool ${def.name} butuh proyek aktif (projectId) — tidak ada proyek dalam scope eksekusi.`,
    });
    return { ok: false, record: done, output: null, errorCode: 'PROJECT_REQUIRED', error: done.error };
  }
  if (input.projectSnapshot && effectiveProjectId && input.projectSnapshot.projectId !== effectiveProjectId) {
    const rec = baseRecord({ ...effInput, projectId: effectiveProjectId }, def, 'blocked');
    const done = finishRecord(rec, 'blocked', {
      errorCode: 'PROJECT_SCOPE_MISMATCH',
      error: `Snapshot proyek ${input.projectSnapshot.projectId} tidak cocok dengan scope eksekusi ${effectiveProjectId}.`,
    });
    return { ok: false, record: done, output: null, errorCode: 'PROJECT_SCOPE_MISMATCH', error: done.error };
  }

  // 3. Secret di argumen.
  let argsJson = '';
  try { argsJson = JSON.stringify(input.args) ?? ''; } catch { argsJson = ''; }
  if (containsSecret(argsJson)) {
    const rec = baseRecord({ ...effInput, projectId: effectiveProjectId }, def, 'blocked');
    const done = finishRecord(rec, 'blocked', {
      errorCode: 'SECRET_IN_ARGS',
      error: 'Argumen mengandung pola kredensial/token — eksekusi ditolak; secret tidak pernah disimpan di trail/memori.',
    });
    return { ok: false, record: done, output: null, errorCode: 'SECRET_IN_ARGS', error: done.error };
  }

  // 4. Validasi skema input (sebelum runner apa pun).
  const validation = validateToolInput(def, input.args);
  if (!validation.ok) {
    const rec = baseRecord({ ...effInput, projectId: effectiveProjectId }, def, 'blocked');
    const done = finishRecord(rec, 'blocked', {
      errorCode: 'INPUT_VALIDATION_FAILED',
      error: `Input tidak valid untuk tool ${def.name}: ${validation.errors.join(' ')}`,
    });
    return { ok: false, record: done, output: null, errorCode: 'INPUT_VALIDATION_FAILED', error: done.error };
  }

  // 5. Pre-check kapabilitas.
  const execCtx: ToolExecContext = { projectSnapshot: input.projectSnapshot ?? null };
  if (def.preCheck) {
    const pre = def.preCheck(input.args, execCtx);
    if (!pre.ok) {
      const rec = baseRecord({ ...effInput, projectId: effectiveProjectId }, def, 'blocked');
      const done = finishRecord(rec, 'blocked', { errorCode: pre.errorCode ?? 'PRECHECK_FAILED', error: pre.error ?? 'Pre-check tool gagal.' });
      return { ok: false, record: done, output: null, errorCode: done.errorCode, error: done.error };
    }
  }

  // 6. Permission gate (meneruskan gate Fase 3).
  if (def.permission === 'consequential') {
    if (input.approval) {
      if (input.approval.actor !== 'user') {
        const rec = baseRecord({ ...effInput, projectId: effectiveProjectId }, def, 'failed');
        const done = finishRecord(rec, 'failed', {
          errorCode: 'APPROVAL_SELF_GRANT_DENIED',
          error: 'APPROVAL_SELF_GRANT_DENIED: hanya pengguna yang dapat menyetujui aksi konsekwensial — model tidak pernah memberi dirinya izin.',
        });
        return { ok: false, record: done, output: null, errorCode: 'APPROVAL_SELF_GRANT_DENIED', error: done.error };
      }
    } else {
      const rec = baseRecord({ ...effInput, projectId: effectiveProjectId }, def, 'awaiting-approval');
      const done = finishRecord(rec, 'awaiting-approval', {
        errorCode: 'APPROVAL_REQUIRED',
        error: 'APPROVAL_REQUIRED: aksi konsekwensial menunggu persetujuan eksplisit pengguna.',
      });
      return { ok: false, record: done, output: null, errorCode: 'APPROVAL_REQUIRED', error: done.error };
    }
  }

  // 7. Idempotensi: putar ulang hasil sukses/parsial sebelumnya.
  const idempotencyKey = effInput.idempotencyKey ?? deriveIdempotencyKey(def.name, effectiveProjectId, input.args);
  if (def.idempotent) {
    const prior = listToolExecutions(effectiveProjectId, 200).find(
      (r) => r.idempotencyKey === idempotencyKey && r.toolName === def.name && (r.status === 'succeeded' || r.status === 'partially-succeeded'),
    );
    if (prior) {
      const rec = baseRecord({ ...effInput, projectId: effectiveProjectId, idempotencyKey }, def, prior.status);
      const done = finishRecord(rec, prior.status, {
        output: prior.output,
        approvedBy: prior.approvedBy,
        replayed: true,
      });
      return { ok: true, record: done, output: prior.output };
    }
  }

  // 8. Jalankan dengan timeout.
  const running = baseRecord({ ...effInput, projectId: effectiveProjectId, idempotencyKey }, def, 'running');
  appendTrailEvent(running);
  if (input.projectSnapshot) setActiveProjectSnapshot(input.projectSnapshot);
  let raw: string | ToolInvokeResult;
  try {
    const invoked = def.invoke!(input.args, execCtx);
    raw = await Promise.race([
      Promise.resolve(invoked),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`TOOL_TIMEOUT: tool ${def.name} melebihi ${def.timeoutMs} ms.`)), def.timeoutMs),
      ),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Tool gagal tanpa pesan.';
    const done = finishRecord(running, 'failed', {
      errorCode: msg.startsWith('TOOL_TIMEOUT') ? 'TOOL_TIMEOUT' : 'TOOL_EXECUTION_FAILED',
      error: msg.slice(0, 500),
    });
    return { ok: false, record: done, output: null, errorCode: done.errorCode, error: done.error };
  } finally {
    if (input.projectSnapshot) setActiveProjectSnapshot(null);
  }

  const output = typeof raw === 'string' ? raw : raw.output;
  const structured = typeof raw === 'string' ? undefined : raw.structured;
  const declaredPartial = typeof raw === 'string' ? false : raw.partial === true;
  const validator = def.outputValidator ?? defaultOutputValidator;
  const check = validator(output, structured);
  if (!check.ok) {
    const done = finishRecord(running, 'failed', {
      output: safeOutputPreview(output),
      errorCode: 'OUTPUT_VALIDATION_FAILED',
      error: check.error ?? 'Output tool tidak valid.',
      approvedBy: input.approval?.actor ?? null,
    });
    return { ok: false, record: done, output: safeOutputPreview(output), errorCode: 'OUTPUT_VALIDATION_FAILED', error: done.error };
  }
  const partial = declaredPartial || check.partial === true;
  const status: ToolExecutionStatus = partial ? 'partially-succeeded' : 'succeeded';
  const done = finishRecord(running, status, {
    output: safeOutputPreview(output),
    approvedBy: input.approval?.actor ?? null,
  });
  recordResultToMemory(def, done, output);
  return { ok: true, record: done, output };
}

/** Membatalkan eksekusi yang masih 'running' (best-effort; invoke sinkron tidak dapat diinterupsi). */
export function cancelToolExecution(executionId: string): ToolExecutionRecord | null {
  const current = getToolExecution(executionId);
  if (!current) return null;
  if (current.status !== 'running' && current.status !== 'awaiting-approval' && current.status !== 'planned' && current.status !== 'ready') {
    return current;
  }
  const cancelled: ToolExecutionRecord = {
    ...current,
    status: 'cancelled',
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - Date.parse(current.startedAt),
    errorCode: 'CANCELLED_BY_USER',
    error: 'Eksekusi dibatalkan pengguna.',
  };
  appendTrailEvent(cancelled);
  return cancelled;
}

/**
 * Kwitansi transfer dari tombol push-rab yang ada (satu-satunya penulis).
 * Dipanggil view.tsx SESUDAH transfer terverifikasi sukses — registry
 * TIDAK PERNAH menulis item RAB sendiri.
 */
export function recordTransferReceipt(input: {
  projectId: string;
  draftVersion: number;
  draftTitle?: string;
  pushed: number;
  skipped: number;
  at?: string;
  conversationId?: string | null;
  executionId?: string;
}): ToolExecutionRecord {
  const record: ToolExecutionRecord = {
    executionId: input.executionId ?? newExecutionId(),
    idempotencyKey: deriveIdempotencyKey('transfer_draft', input.projectId, { projectId: input.projectId, draftVersion: input.draftVersion }),
    toolName: 'transfer_draft',
    channel: 'chat-ai',
    actor: 'user',
    projectId: input.projectId,
    conversationId: input.conversationId ?? null,
    planId: null,
    stepId: null,
    status: 'succeeded',
    startedAt: input.at ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: null,
    input: safeInputPreview({ projectId: input.projectId, draftVersion: input.draftVersion }),
    output: `Transfer terverifikasi: draft "${input.draftTitle ?? ''}" v${input.draftVersion} — ${input.pushed} item masuk Spreadsheet RAB, ${input.skipped} dilewati (duplikat). Ditulis lewat tombol push-rab yang ada, bukan registry.`,
    errorCode: null,
    error: null,
    permission: 'consequential',
    approvedBy: 'user',
    replayed: false,
    effect: 'writes-project',
  };
  appendTrailEvent(record);
  return record;
}

/* ------------------------------------------------------------------ */
/* Jembatan rencana Fase 3 → registry                                  */
/*                                                                     */
/* Langkah rencana yang punya pemetaan registry + input yang dapat      */
/* diturunkan dari rencana/konteks pemanggil dijalankan lewat           */
/* executeTool (gate + trail + idempotensi yang sama). Langkah lain     */
/* (memahami objektif, kuesioner UI, tampilkan draft, navigasi UI,     */
/* jelaskan batasan) TIDAK punya runner registry — dikembalikan         */
/* STEP_HAS_NO_REGISTRY_RUNNER secara eksplisit, bukan ditebak.        */
/* ------------------------------------------------------------------ */

export interface PlanStepRegistryContext {
  /** Teks permintaan mentah (objektif.sourceText) untuk generate-draft. */
  rawText?: string;
  /** Draft aktif (untuk validate-spec-chain / analyze-costs). */
  draft?: UniversalDraft | null;
  /** Item draft aktif (untuk analyze-costs bila draft tidak dibawa). */
  draftItems?: Array<{ description: string; totalPrice: number; priceStatus?: string | null; unitPrice?: number | null }>;
  /** Kata kunci AHSP (untuk verify-prices / search-ahsp). */
  ahspKeyword?: string;
  /** Spek terstruktur draft (untuk validate-spec-chain). */
  structuredSpecs?: Array<import('./structuredSpec').StructuredSpec>;
  /** Versi draft untuk transfer_draft. */
  draftVersion?: number;
}

export const PLAN_STEP_TOOL_MAP: Record<PlanStepKind, string | null> = {
  'understand-objective': null,
  'collect-specs-questionnaire': null,
  'validate-spec-chain': 'validate_spec_chain',
  'generate-draft': 'build_universal_draft',
  'verify-prices': 'cari_ahsp',
  'present-draft': null,
  'transfer-draft': 'transfer_draft',
  'analyze-costs': 'analyze_draft_costs',
  'identify-expensive-items': 'analyze_draft_costs',
  'propose-alternatives': null,
  'search-ahsp': 'cari_ahsp',
  'answer-llm': null,
  navigate: 'navigate',
  'explain-limits': null,
};

export async function runPlanStepWithRegistry(
  stepKind: PlanStepKind,
  scope: { projectId: string; conversationId?: string | null; planId?: string | null; stepId?: string | null },
  ctx: PlanStepRegistryContext,
  opts: { actor: ApprovalActor; approval?: { actor: ApprovalActor; approvedAt: string } | null; channel?: ToolChannel; projectSnapshot?: ProjectSnapshot | null },
): Promise<ExecuteToolResult> {
  const toolName = PLAN_STEP_TOOL_MAP[stepKind];
  if (!toolName) {
    const rec = baseRecord(
      { toolName: stepKind, args: {}, projectId: scope.projectId, conversationId: scope.conversationId ?? null, planId: scope.planId ?? null, stepId: scope.stepId ?? null, actor: opts.actor, channel: opts.channel ?? 'orchestrator' },
      null,
      'blocked',
    );
    const done = finishRecord(rec, 'blocked', {
      errorCode: 'STEP_HAS_NO_REGISTRY_RUNNER',
      error: `Langkah "${stepKind}" tidak punya runner registry (dipahami/ditampilkan UI atau mesin kuesioner) — bukan ditebak lewat tool lain.`,
    });
    return { ok: false, record: done, output: null, errorCode: 'STEP_HAS_NO_REGISTRY_RUNNER', error: done.error };
  }
  let args: Record<string, unknown> = {};
  switch (stepKind) {
    case 'validate-spec-chain': {
      if (!ctx.draft) {
        const rec = baseRecord({ toolName, args: {}, projectId: scope.projectId, conversationId: scope.conversationId ?? null, planId: scope.planId ?? null, stepId: scope.stepId ?? null, actor: opts.actor, channel: opts.channel ?? 'orchestrator' }, getToolDefinition(toolName), 'blocked');
        const done = finishRecord(rec, 'blocked', { errorCode: 'NO_DRAFT', error: 'validate-spec-chain butuh draft aktif — belum ada draft untuk divalidasi.' });
        return { ok: false, record: done, output: null, errorCode: 'NO_DRAFT', error: done.error };
      }
      args = { draft: ctx.draft, structuredSpecs: ctx.structuredSpecs ?? ctx.draft.structuredSpecs ?? [] };
      break;
    }
    case 'generate-draft': {
      if (!ctx.rawText || !ctx.rawText.trim()) {
        const rec = baseRecord({ toolName, args: {}, projectId: scope.projectId, conversationId: scope.conversationId ?? null, planId: scope.planId ?? null, stepId: scope.stepId ?? null, actor: opts.actor, channel: opts.channel ?? 'orchestrator' }, getToolDefinition(toolName), 'blocked');
        const done = finishRecord(rec, 'blocked', { errorCode: 'NO_RAW_TEXT', error: 'generate-draft butuh teks permintaan (objektif.sourceText).' });
        return { ok: false, record: done, output: null, errorCode: 'NO_RAW_TEXT', error: done.error };
      }
      args = { text: ctx.rawText, projectId: scope.projectId };
      break;
    }
    case 'verify-prices':
    case 'search-ahsp': {
      if (!ctx.ahspKeyword || !ctx.ahspKeyword.trim()) {
        const rec = baseRecord({ toolName, args: {}, projectId: scope.projectId, conversationId: scope.conversationId ?? null, planId: scope.planId ?? null, stepId: scope.stepId ?? null, actor: opts.actor, channel: opts.channel ?? 'orchestrator' }, getToolDefinition(toolName), 'blocked');
        const done = finishRecord(rec, 'blocked', { errorCode: 'NO_KEYWORD', error: 'Pencarian AHSP butuh kata kunci — tidak ditebak dari objektif.' });
        return { ok: false, record: done, output: null, errorCode: 'NO_KEYWORD', error: done.error };
      }
      args = { kata_kunci: ctx.ahspKeyword };
      break;
    }
    case 'analyze-costs':
    case 'identify-expensive-items': {
      const items = ctx.draftItems ?? ctx.draft?.parts.flatMap((p) => p.generation.items ?? []).map((i) => ({ description: i.description, totalPrice: i.totalPrice ?? 0, priceStatus: i.priceStatus ?? null, unitPrice: (i as { unitPrice?: number | null }).unitPrice ?? null })) ?? [];
      if (items.length === 0) {
        const rec = baseRecord({ toolName, args: {}, projectId: scope.projectId, conversationId: scope.conversationId ?? null, planId: scope.planId ?? null, stepId: scope.stepId ?? null, actor: opts.actor, channel: opts.channel ?? 'orchestrator' }, getToolDefinition(toolName), 'blocked');
        const done = finishRecord(rec, 'blocked', { errorCode: 'NO_DRAFT', error: 'Analisis biaya butuh item draft aktif — belum ada draft untuk dianalisis.' });
        return { ok: false, record: done, output: null, errorCode: 'NO_DRAFT', error: done.error };
      }
      args = { items };
      break;
    }
    case 'transfer-draft': {
      if (ctx.draftVersion == null) {
        const rec = baseRecord({ toolName, args: {}, projectId: scope.projectId, conversationId: scope.conversationId ?? null, planId: scope.planId ?? null, stepId: scope.stepId ?? null, actor: opts.actor, channel: opts.channel ?? 'orchestrator' }, getToolDefinition(toolName), 'blocked');
        const done = finishRecord(rec, 'blocked', { errorCode: 'NO_DRAFT', error: 'transfer-draft butuh versi draft aktif.' });
        return { ok: false, record: done, output: null, errorCode: 'NO_DRAFT', error: done.error };
      }
      args = { projectId: scope.projectId, draftVersion: ctx.draftVersion };
      break;
    }
    case 'navigate': {
      if (!ctx.rawText || !ctx.rawText.trim()) {
        const rec = baseRecord({ toolName, args: {}, projectId: scope.projectId, conversationId: scope.conversationId ?? null, planId: scope.planId ?? null, stepId: scope.stepId ?? null, actor: opts.actor, channel: opts.channel ?? 'orchestrator' }, getToolDefinition(toolName), 'blocked');
        const done = finishRecord(rec, 'blocked', { errorCode: 'NO_RAW_TEXT', error: 'navigate butuh teks perintah.' });
        return { ok: false, record: done, output: null, errorCode: 'NO_RAW_TEXT', error: done.error };
      }
      args = { command: ctx.rawText };
      break;
    }
    default:
      args = {};
  }
  return executeTool({
    toolName,
    args,
    projectId: scope.projectId,
    conversationId: scope.conversationId ?? null,
    planId: scope.planId ?? null,
    stepId: scope.stepId ?? null,
    actor: opts.actor,
    approval: opts.approval ?? null,
    channel: opts.channel ?? 'orchestrator',
    projectSnapshot: opts.projectSnapshot ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* Daftar tool untuk prompt Copilot (ARS-03)                           */
/*                                                                     */
/* Copilot memakai SUBSET read-only yang sama (bukan daftar kedua):    */
/* deskripsi dipotong 160 karakter agar muat anggaran prompt kanonis.  */
/* ------------------------------------------------------------------ */

/** Teks daftar tool read-only untuk ditempel di prompt Copilot. */
export function getCopilotToolListText(): string {
  return COPILOT_ALLOWED_TOOLS.map((name) => {
    const d = getToolDefinition(name);
    if (!d) return `- ${name}`;
    const short = d.description.length > 160 ? `${d.description.slice(0, 160)}…` : d.description;
    return `- ${name}: ${short}`;
  }).join('\n');
}
