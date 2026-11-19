/**
 * EZRAB AI — Skill Engine: ExecutionContext (BARU, Phase 2 Workstream 3).
 *
 * Pabrik envelope eksekusi terstruktur. Satu requestId + satu traceId per
 * skill-run, diteruskan ke state eksekusi, trail, dan metadata pemakaian
 * (menutup K-15: tiga namespace ID yang tak terkorelasi).
 *
 * Tanpa impor repo lain; tanpa DOM; aman di Node (tsx) maupun browser.
 */
import type { ExecutionContext, SkillChannel, SubscriptionTier } from './types';

function newUuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export function newRequestId(): string {
  return `req-${newUuid()}`;
}

export function newTraceId(): string {
  return `trc-${newUuid()}`;
}

export function newRunId(): string {
  return `run-${newUuid()}`;
}

/** JSON stabil (kunci terurut) untuk kunci idempotensi deterministik. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * Kunci idempotensi deterministik per (skill, proyek, input) — kunci yang
 * sama + input yang sama = run yang sama (tanpa eksekusi ganda).
 */
export function deriveIdempotencyKey(
  skillId: string,
  projectId: string | null,
  input: Record<string, unknown>,
): string {
  return `skill:${skillId}:${projectId ?? 'no-project'}:${stableStringify(input)}`;
}

export interface CreateExecutionContextInput {
  skillId: string;
  projectId?: string | null;
  conversationId?: string | null;
  userId?: string | null;
  callerRole?: string | null;
  subscription?: SubscriptionTier | null;
  channel: SkillChannel;
  /** Bila diisi, traceId dipakai ulang (satu alur, banyak request). */
  traceId?: string;
  input?: Record<string, unknown>;
}

export function createExecutionContext(input: CreateExecutionContextInput): ExecutionContext {
  const traceId = input.traceId ?? newTraceId();
  return {
    requestId: newRequestId(),
    traceId,
    skillId: input.skillId,
    projectId: input.projectId ?? null,
    conversationId: input.conversationId ?? null,
    userId: input.userId ?? null,
    callerRole: input.callerRole ?? null,
    subscription: input.subscription ?? null,
    channel: input.channel,
    contextVersion: 1,
    idempotencyKey: deriveIdempotencyKey(
      input.skillId,
      input.projectId ?? null,
      input.input ?? {},
    ),
    startedAt: new Date().toISOString(),
  };
}

/** Konteks anak untuk satu request dalam eksekusi paralel: traceId sama, requestId baru. */
export function deriveChildContext(
  parent: ExecutionContext,
  skillId: string,
  input?: Record<string, unknown>,
): ExecutionContext {
  return {
    ...parent,
    requestId: newRequestId(),
    skillId,
    idempotencyKey: deriveIdempotencyKey(skillId, parent.projectId, input ?? {}),
    startedAt: new Date().toISOString(),
  };
}

/**
 * Validasi envelope (fail-closed). Mengembalikan daftar error; kosong = sah.
 * - projectId wajib bila requireProject (skill yang menyentuh proyek).
 * - callerRole yang diisi harus string tak kosong (nilainya diperiksa
 *   executor terhadap taksonomi server; di sini hanya bentuknya).
 * - channel harus salah satu kanal yang dikenal.
 */
export function validateExecutionContext(
  ctx: ExecutionContext,
  opts?: { requireProject?: boolean },
): string[] {
  const errors: string[] = [];
  if (!ctx.requestId.startsWith('req-')) errors.push('requestId harus berawalan req-');
  if (!ctx.traceId.startsWith('trc-')) errors.push('traceId harus berawalan trc-');
  if (!ctx.skillId) errors.push('skillId wajib diisi');
  if (opts?.requireProject && !ctx.projectId) {
    errors.push('projectId wajib diisi untuk skill ini');
  }
  if (ctx.callerRole !== null && ctx.callerRole.trim() === '') {
    errors.push('callerRole tidak boleh string kosong');
  }
  const channels: SkillChannel[] = ['chat-ai', 'copilot', 'orchestrator', 'ded', 'test'];
  if (!channels.includes(ctx.channel)) errors.push(`channel tidak dikenal: ${ctx.channel}`);
  if (ctx.contextVersion !== 1) errors.push('contextVersion harus 1');
  return errors;
}
