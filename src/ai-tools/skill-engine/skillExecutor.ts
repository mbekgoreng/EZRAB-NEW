/**
 * EZRAB AI — Skill Engine: SkillExecutor (BARU, Phase 2 Workstream 3).
 *
 * Penegakan terpusat + mesin eksekusi skill. Handler DIINJEKSI (executor
 * tidak mengimpor handler, layanan aplikasi, atau provider apa pun) —
 * sehingga modul ini dapat diuji tanpa provider/DOM dan tidak pernah
 * menulis langsung ke database: semua perubahan permanen dilakukan handler
 * lewat layanan aplikasi kanonis (lihat MIGRATION-PLAN.md § titik integrasi).
 *
 * Yang ditegakkan executor, berurutan (fail-closed):
 *  1. Skill dikenal + aktif; input sah terhadap inputSchema.
 *  2. Peran: taksonomi server saja; peran demo / tak dikenal -> gagal
 *     tertutup (ROLE_NOT_MAPPED, K-16); tanpa peran -> hanya skill terbuka
 *     (semua peran diizinkan) yang jalan (ROLE_REQUIRED bila tidak).
 *     Jembatan tanpa-peran ini TRANSISIONAL (sesi demo/failsafe); di sesi
 *     login nyata pasca-flip AUTH, pemanggil wajib mengisi callerRole
 *     begitu pemetaan peran K-16 diputuskan owner.
 *  3. Langganan: tier pemanggil (null = FREE) >= requiredSubscription.
 *  4. Kanal: Copilot jawab-saja — skill non-read-only DIBLOKIR dari sana.
 *  5. Approval: skill yang mendeklarasikan requiresApproval tidak jalan
 *     tanpa persetujuan user yang terikat runId + masih dalam TTL.
 *  6. Serialisasi tulis: skill mutasi serial per proyek (lock in-memory);
 *     read-only tidak mengambil lock.
 *  7. Retry berbatas: hanya kode error yang dideklarasikan retryable;
 *     skill mutasi maxAttempts=1 (tanpa retry buta).
 *  8. Timeout per skill + pembatalan (AbortSignal) + validasi output
 *     terhadap outputSchema.
 *
 * Observabilitas: setiap run dicatat di SkillStateStore + metadata pemakaian
 * (termasuk userId atribusi pasca-flip AUTH). TIDAK ADA otoritas billing di
 * sini — tidak ada debit, cek saldo, atau gerbang kredit (Keputusan B).
 */
import { deriveChildContext, newRunId } from './executionContext';
import type { SkillRegistry } from './skillRegistry';
import { SkillStateStore } from './skillState';
import type { SkillRunRecord } from './skillState';
import {
  InMemoryUsageSink,
  estimateCreditsFromTokens,
  type SkillUsageStatus,
  type UsageSink,
} from './usageMetadata';
import {
  CONTRACT_ROLE_TAXONOMY,
  DEMO_ROLE_TAXONOMY,
  SERVER_ROLE_TAXONOMY,
  SUBSCRIPTION_ORDER,
  type ExecutionContext,
  type SkillApproval,
  type SkillDefinition,
  type SkillHandler,
  type SkillHandlerResult,
  type SkillRole,
  type SkillSchemaField,
} from './types';

export const EXECUTOR_ERROR_CODES = [
  'SKILL_NOT_FOUND',
  'SKILL_DISABLED',
  'HANDLER_NOT_REGISTERED',
  'INVALID_INPUT',
  'ROLE_NOT_ALLOWED',
  'ROLE_NOT_MAPPED',
  'ROLE_REQUIRED',
  'SUBSCRIPTION_REQUIRED',
  'CHANNEL_BLOCKED',
  'APPROVAL_REQUIRED',
  'APPROVAL_MISMATCH',
  'APPROVAL_EXPIRED',
  'APPROVAL_INVALID',
  'RESUME_INVALID',
  'LOCK_TIMEOUT',
  'SKILL_TIMEOUT',
  'CANCELLED',
  'OUTPUT_VALIDATION_FAILED',
  'HANDLER_ERROR',
  'UNSAFE_PARALLEL_BATCH',
] as const;

export type ExecutorErrorCode = (typeof EXECUTOR_ERROR_CODES)[number];

export class SkillExecutionError extends Error {
  readonly code: ExecutorErrorCode;
  constructor(code: ExecutorErrorCode, message: string) {
    super(message);
    this.name = 'SkillExecutionError';
    this.code = code;
  }
}

export type ExecuteStatus = 'completed' | 'awaiting-approval' | 'failed' | 'cancelled';

export interface ExecuteResult {
  status: ExecuteStatus;
  runId: string;
  skillId: string;
  requestId: string;
  traceId: string;
  output?: Record<string, unknown>;
  /**
   * Kode error: kode executor (EXECUTOR_ERROR_CODES) atau kode domain yang
   * dilempar handler (mis. 'TRANSIENT_PROVIDER_ERROR') — kode domain
   * diteruskan apa adanya agar retry policy + observabilitas melihat
   * penyebab asli, bukan label generik.
   */
  errorCode?: string;
  error?: string;
  attempts: number;
  durationMs: number;
}

export interface ExecuteOptions {
  signal?: AbortSignal;
  approval?: SkillApproval;
  /** Lanjutkan run 'awaiting-approval' yang sudah ada. */
  resumeRunId?: string;
  /** Batas tunggu lock tulis per proyek (default 30 detik). */
  lockTimeoutMs?: number;
}

export interface ParallelSkillRequest {
  skillId: string;
  input: Record<string, unknown>;
}

export interface SkillExecutorDeps {
  handlers: ReadonlyMap<string, SkillHandler>;
  stateStore?: SkillStateStore;
  usageSink?: UsageSink;
  /** Disuntikkan untuk tes (default: setTimeout nyata). */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_SLEEP = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validasi nilai terhadap medan skema (murni). Mengembalikan daftar error;
 * kosong = sah. Dipakai untuk input DAN output.
 */
export function validateAgainstSchema(
  fields: SkillSchemaField[],
  values: Record<string, unknown>,
  label: string,
): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    const value = values[field.name];
    const present = value !== undefined && value !== null && value !== '';
    if (!present) {
      if (field.required) errors.push(`${label}.${field.name} wajib diisi`);
      continue;
    }
    switch (field.type) {
      case 'string':
      case 'file':
        if (typeof value !== 'string') errors.push(`${label}.${field.name} harus string`);
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          errors.push(`${label}.${field.name} harus angka`);
        } else {
          if (field.min !== undefined && value < field.min) {
            errors.push(`${label}.${field.name} minimal ${field.min}`);
          }
          if (field.max !== undefined && value > field.max) {
            errors.push(`${label}.${field.name} maksimal ${field.max}`);
          }
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') errors.push(`${label}.${field.name} harus boolean`);
        break;
      case 'select':
        if (typeof value !== 'string') {
          errors.push(`${label}.${field.name} harus string`);
        } else if (field.enum && !field.enum.includes(value)) {
          errors.push(`${label}.${field.name} harus salah satu dari ${field.enum.join(', ')}`);
        }
        break;
      case 'object':
        if (!isRecord(value)) errors.push(`${label}.${field.name} harus object`);
        break;
      case 'array':
        if (!Array.isArray(value)) errors.push(`${label}.${field.name} harus array`);
        break;
    }
    if (field.pattern && typeof value === 'string') {
      let re: RegExp;
      try {
        re = new RegExp(field.pattern);
      } catch {
        errors.push(`${label}.${field.name} memiliki pattern regex tidak valid`);
        continue;
      }
      if (!re.test(value)) errors.push(`${label}.${field.name} tidak cocok dengan pola ${field.pattern}`);
    }
  }
  return errors;
}

export class SkillExecutor {
  private readonly registry: SkillRegistry;
  private readonly handlers: ReadonlyMap<string, SkillHandler>;
  private readonly stateStore: SkillStateStore;
  private readonly usageSink: UsageSink;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Rantai lock tulis per proyek (Keputusan A: tulis serial per proyek). */
  private readonly projectLocks = new Map<string, Promise<void>>();

  constructor(registry: SkillRegistry, deps: SkillExecutorDeps) {
    this.registry = registry;
    this.handlers = deps.handlers;
    this.stateStore = deps.stateStore ?? new SkillStateStore();
    this.usageSink = deps.usageSink ?? new InMemoryUsageSink();
    this.sleep = deps.sleep ?? DEFAULT_SLEEP;
  }

  getStateStore(): SkillStateStore {
    return this.stateStore;
  }

  /** Antre lock tulis satu proyek; kembalikan pelepas lock. */
  private async acquireProjectLock(projectId: string, timeoutMs: number): Promise<() => void> {
    const prevTail = this.projectLocks.get(projectId) ?? Promise.resolve();
    let releaseSlot!: () => void;
    const mySlot = new Promise<void>((resolve) => {
      releaseSlot = resolve;
    });
    const chained = prevTail.then(() => mySlot);
    this.projectLocks.set(projectId, chained);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new SkillExecutionError('LOCK_TIMEOUT', `Timeout menunggu giliran tulis proyek ${projectId}`)),
          timeoutMs,
        );
      });
      await Promise.race([prevTail, timeout]);
    } catch (err) {
      // Slot sendiri dilepas agar antrean tidak macet selamanya.
      releaseSlot();
      throw err;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      releaseSlot();
      if (this.projectLocks.get(projectId) === chained) {
        this.projectLocks.delete(projectId);
      }
    };
  }

  private async persistBestEffort(runId: string): Promise<void> {
    try {
      await this.stateStore.saveNow();
    } catch (err) {
      // Kegagalan persistensi dicatat pada run (terlihat), bukan ditelan diam-diam.
      this.stateStore.updateRun(runId, {
        persistenceError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private recordUsage(
    run: SkillRunRecord,
    status: SkillUsageStatus,
    attempts: number,
    durationMs: number,
    tokensIn: number | null,
    tokensOut: number | null,
    userId: string | null,
  ): void {
    const totalTokens =
      tokensIn !== null || tokensOut !== null ? (tokensIn ?? 0) + (tokensOut ?? 0) : null;
    this.usageSink.record({
      runId: run.runId,
      skillId: run.skillId,
      requestId: run.requestId,
      traceId: run.traceId,
      projectId: run.projectId,
      userId,
      status,
      attempts,
      durationMs,
      tokensIn,
      tokensOut,
      estimatedCredits: estimateCreditsFromTokens(totalTokens),
      recordedAt: new Date().toISOString(),
    });
  }

  private checkRole(skill: SkillDefinition, ctx: ExecutionContext): void {
    const role = ctx.callerRole;
    if (role === null) {
      // Jembatan transisional: tanpa peran, hanya skill terbuka (mengizinkan
      // keempat peran kontrak — tidak membatasi siapa pun di semesta
      // authoring) yang jalan; skill terbatas menuntut peran eksplisit.
      const isOpen =
        CONTRACT_ROLE_TAXONOMY.every((r) => skill.allowedRoles.includes(r));
      if (!isOpen) {
        throw new SkillExecutionError(
          'ROLE_REQUIRED',
          `Skill "${skill.id}" membatasi peran; pemanggil tanpa peran ditolak (butuh peran taksonomi server)`,
        );
      }
      return;
    }
    if (DEMO_ROLE_TAXONOMY.includes(role) || !(SERVER_ROLE_TAXONOMY as readonly string[]).includes(role)) {
      // K-16: peran demo / tak dikenal TIDAK pernah dipetakan diam-diam.
      throw new SkillExecutionError(
        'ROLE_NOT_MAPPED',
        `Peran "${role}" bukan taksonomi server dan tidak punya pemetaan (K-16) — ditolak tertutup`,
      );
    }
    if (!skill.allowedRoles.includes(role as SkillRole)) {
      throw new SkillExecutionError(
        'ROLE_NOT_ALLOWED',
        `Peran "${role}" tidak diizinkan untuk skill "${skill.id}"`,
      );
    }
  }

  private checkSubscription(skill: SkillDefinition, ctx: ExecutionContext): void {
    const effective = ctx.subscription ?? 'FREE';
    if (SUBSCRIPTION_ORDER[effective] < SUBSCRIPTION_ORDER[skill.requiredSubscription]) {
      throw new SkillExecutionError(
        'SUBSCRIPTION_REQUIRED',
        `Skill "${skill.id}" membutuhkan langganan ${skill.requiredSubscription} (pemanggil: ${effective})`,
      );
    }
  }

  private checkApproval(
    skill: SkillDefinition,
    runId: string,
    approval: SkillApproval | undefined,
  ): void {
    if (!skill.approvalPolicy.requiresApproval) return;
    if (!approval) {
      throw new SkillExecutionError(
        'APPROVAL_REQUIRED',
        `Skill "${skill.id}" membutuhkan persetujuan user sebelum jalan`,
      );
    }
    if (approval.actor !== 'user') {
      throw new SkillExecutionError('APPROVAL_INVALID', 'Persetujuan hanya sah dari actor "user"');
    }
    if (approval.runId !== runId) {
      throw new SkillExecutionError(
        'APPROVAL_MISMATCH',
        'Persetujuan terikat run lain (runId tidak cocok) — tidak diteruskan',
      );
    }
    const ttlMs = skill.approvalPolicy.ttlMs ?? 10 * 60 * 1000;
    const approvedAt = Date.parse(approval.approvedAt);
    if (Number.isNaN(approvedAt)) {
      throw new SkillExecutionError('APPROVAL_INVALID', 'approvedAt bukan tanggal valid');
    }
    if (Date.now() - approvedAt > ttlMs) {
      throw new SkillExecutionError('APPROVAL_EXPIRED', 'Persetujuan sudah kedaluwarsa (melewati TTL)');
    }
  }

  /**
   * Jalankan satu skill. Tanpa approval untuk skill yang membutuhkannya,
   * hasil = { status: 'awaiting-approval', runId } (BUKAN error) — pemanggil
   * mengulang dengan approval + resumeRunId yang sama.
   */
  async execute(
    skillId: string,
    input: Record<string, unknown>,
    ctx: ExecutionContext,
    opts: ExecuteOptions = {},
  ): Promise<ExecuteResult> {
    const startedAt = Date.now();
    const skill = this.registry.get(skillId);
    if (!skill) {
      return {
        status: 'failed',
        runId: '',
        skillId,
        requestId: ctx.requestId,
        traceId: ctx.traceId,
        errorCode: 'SKILL_NOT_FOUND',
        error: `Skill "${skillId}" tidak terdaftar`,
        attempts: 0,
        durationMs: Date.now() - startedAt,
      };
    }
    const fail = (
      run: SkillRunRecord | null,
      code: string,
      message: string,
      attempts: number,
      tokensIn: number | null = null,
      tokensOut: number | null = null,
    ): ExecuteResult => {
      if (run) {
        this.stateStore.updateRun(run.runId, {
          status: 'failed',
          errorCode: code,
          error: message,
          attempts,
          completedAt: Date.now(),
        });
        void this.persistBestEffort(run.runId);
        this.recordUsage(run, 'failed', attempts, Date.now() - startedAt, tokensIn, tokensOut, ctx.userId);
      }
      return {
        status: 'failed',
        runId: run?.runId ?? '',
        skillId,
        requestId: ctx.requestId,
        traceId: ctx.traceId,
        errorCode: code,
        error: message,
        attempts,
        durationMs: Date.now() - startedAt,
      };
    };

    // Resume: run lama harus 'awaiting-approval' + skill sama.
    let run: SkillRunRecord | null = null;
    let effectiveTraceId = ctx.traceId;
    if (opts.resumeRunId) {
      const existing = this.stateStore.getRun(opts.resumeRunId);
      if (!existing || existing.skillId !== skillId || existing.status !== 'awaiting-approval') {
        return fail(null, 'RESUME_INVALID', `Run "${opts.resumeRunId}" tidak dapat dilanjutkan (bukan awaiting-approval / skill berbeda)`, 0);
      }
      run = existing;
      effectiveTraceId = existing.traceId;
    }
    if (!skill.enabled) {
      return fail(run, 'SKILL_DISABLED', `Skill "${skillId}" nonaktif`, 0);
    }

    const inputErrors = validateAgainstSchema(skill.inputSchema.fields, input, 'input');
    if (inputErrors.length > 0) {
      if (!run) {
        run = this.stateStore.createRun({
          runId: newRunId(),
          skillId,
          requestId: ctx.requestId,
          traceId: effectiveTraceId,
          projectId: ctx.projectId,
          conversationId: ctx.conversationId,
        });
      }
      return fail(run, 'INVALID_INPUT', inputErrors.join('; '), 0);
    }

    if (!run) {
      run = this.stateStore.createRun({
        runId: newRunId(),
        skillId,
        requestId: ctx.requestId,
        traceId: effectiveTraceId,
        projectId: ctx.projectId,
        conversationId: ctx.conversationId,
      });
    }
    const runId = run.runId;

    try {
      this.checkRole(skill, ctx);
      this.checkSubscription(skill, ctx);
      if (ctx.channel === 'copilot' && skill.riskLevel !== 'READ_ONLY') {
        throw new SkillExecutionError(
          'CHANNEL_BLOCKED',
          `Skill "${skill.id}" (${skill.riskLevel}) tidak boleh dieksekusi dari kanal Copilot (jawab-saja)`,
        );
      }
      // Approval: tanpa approval -> awaiting-approval (bukan gagal).
      if (skill.approvalPolicy.requiresApproval && !opts.approval) {
        this.stateStore.updateRun(runId, { status: 'awaiting-approval', attempts: 0 });
        await this.persistBestEffort(runId);
        return {
          status: 'awaiting-approval',
          runId,
          skillId,
          requestId: ctx.requestId,
          traceId: effectiveTraceId,
          attempts: 0,
          durationMs: Date.now() - startedAt,
        };
      }
      this.checkApproval(skill, runId, opts.approval);
    } catch (err) {
      if (err instanceof SkillExecutionError) {
        return fail(run, err.code, err.message, 0);
      }
      throw err;
    }

    const handler = this.handlers.get(skillId);
    if (!handler) {
      return fail(
        run,
        'HANDLER_NOT_REGISTERED',
        `Skill "${skillId}" belum punya handler terdaftar (cutover belum memasang handler)`,
        0,
      );
    }

    const isMutating = skill.riskLevel !== 'READ_ONLY';
    let releaseLock: (() => void) | null = null;
    if (isMutating && ctx.projectId) {
      try {
        releaseLock = await this.acquireProjectLock(ctx.projectId, opts.lockTimeoutMs ?? 30_000);
      } catch (err) {
        if (err instanceof SkillExecutionError) {
          return fail(run, err.code, err.message, 0);
        }
        throw err;
      }
    }

    this.stateStore.updateRun(runId, { status: 'running' });
    let attempts = 0;
    let tokensIn: number | null = null;
    let tokensOut: number | null = null;
    try {
      const maxAttempts = skill.retryPolicy.maxAttempts;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (opts.signal?.aborted) {
          this.stateStore.updateRun(runId, { status: 'cancelled', completedAt: Date.now() });
          this.recordUsage(run, 'cancelled', attempts, Date.now() - startedAt, tokensIn, tokensOut, ctx.userId);
          return { status: 'cancelled', runId, skillId, requestId: ctx.requestId, traceId: effectiveTraceId, attempts, durationMs: Date.now() - startedAt };
        }
        attempts = attempt;
        this.stateStore.updateRun(runId, { attempts: attempt });
        try {
          const output = await this.runHandlerWithTimeout(
            handler,
            input,
            { ...ctx, traceId: effectiveTraceId },
            skill.timeoutPolicy.timeoutMs,
            opts.signal,
          );
          if (output.usage?.tokensIn !== undefined) tokensIn = output.usage.tokensIn;
          if (output.usage?.tokensOut !== undefined) tokensOut = output.usage.tokensOut;
          const outputErrors = validateAgainstSchema(skill.outputSchema.fields, output.output, 'output');
          if (outputErrors.length > 0) {
            return fail(run, 'OUTPUT_VALIDATION_FAILED', outputErrors.join('; '), attempts, tokensIn, tokensOut);
          }
          this.stateStore.updateRun(runId, { status: 'completed', attempts, completedAt: Date.now() });
          await this.persistBestEffort(runId);
          this.recordUsage(run, 'completed', attempts, Date.now() - startedAt, tokensIn, tokensOut, ctx.userId);
          return {
            status: 'completed',
            runId,
            skillId,
            requestId: ctx.requestId,
            traceId: effectiveTraceId,
            output: output.output,
            attempts,
            durationMs: Date.now() - startedAt,
          };
        } catch (err) {
          // Kode error dibaca dari error apa pun yang dilempar handler
          // (bukan hanya SkillExecutionError): kebijakan retry mencocokkan
          // kode domain (mis. TRANSIENT_PROVIDER_ERROR) apa adanya.
          const rawCode = (err as { code?: unknown })?.code;
          const code =
            typeof rawCode === 'string' && rawCode.length > 0 ? rawCode : 'HANDLER_ERROR';
          const message = err instanceof Error ? err.message : String(err);
          if (code === 'CANCELLED') {
            this.stateStore.updateRun(runId, { status: 'cancelled', completedAt: Date.now() });
            this.recordUsage(run, 'cancelled', attempts, Date.now() - startedAt, tokensIn, tokensOut, ctx.userId);
            return { status: 'cancelled', runId, skillId, requestId: ctx.requestId, traceId: effectiveTraceId, attempts, durationMs: Date.now() - startedAt };
          }
          const retryable = skill.retryPolicy.retryableErrors.includes(code);
          if (retryable && attempt < maxAttempts) {
            if (skill.retryPolicy.backoffMs > 0) await this.sleep(skill.retryPolicy.backoffMs);
            continue;
          }
          return fail(run, code, message, attempts);
        }
      }
      return fail(run, 'HANDLER_ERROR', 'Percobaan habis tanpa hasil', attempts);
    } finally {
      releaseLock?.();
    }
  }

  private runHandlerWithTimeout(
    handler: SkillHandler,
    input: Record<string, unknown>,
    ctx: ExecutionContext,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): Promise<SkillHandlerResult> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new SkillExecutionError('SKILL_TIMEOUT', `Skill "${ctx.skillId}" melewati timeout ${timeoutMs} ms`));
      }, timeoutMs);
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new SkillExecutionError('CANCELLED', `Eksekusi skill "${ctx.skillId}" dibatalkan`));
      };
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      if (signal?.aborted) {
        cleanup();
        reject(new SkillExecutionError('CANCELLED', `Eksekusi skill "${ctx.skillId}" dibatalkan`));
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      const abortSignal =
        signal ?? new AbortController().signal;
      handler(input, ctx, abortSignal).then(
        (result) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result);
        },
        (err) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        },
      );
    });
  }

  /**
   * Eksekusi paralel read-only (Keputusan A): SEMUA request harus skill
   * parallelSafe + READ_ONLY — satu saja tidak memenuhi, SELURUH batch
   * ditolak sebelum ada yang jalan (tanpa eksekusi sebagian).
   */
  async executeParallel(
    requests: ParallelSkillRequest[],
    ctx: ExecutionContext,
    opts: ExecuteOptions = {},
  ): Promise<ExecuteResult[]> {
    for (const req of requests) {
      const skill = this.registry.get(req.skillId);
      if (!skill || !skill.parallelSafe || skill.riskLevel !== 'READ_ONLY') {
        throw new SkillExecutionError(
          'UNSAFE_PARALLEL_BATCH',
          `Batch paralel ditolak: skill "${req.skillId}" bukan parallelSafe READ_ONLY`,
        );
      }
    }
    const settled = await Promise.allSettled(
      requests.map((req) =>
        this.execute(req.skillId, req.input, deriveChildContext(ctx, req.skillId, req.input), opts),
      ),
    );
    return settled.map((s, i) =>
      s.status === 'fulfilled'
        ? s.value
        : {
            status: 'failed' as const,
            runId: '',
            skillId: requests[i].skillId,
            requestId: ctx.requestId,
            traceId: ctx.traceId,
            errorCode: 'HANDLER_ERROR' as const,
            error: s.reason instanceof Error ? s.reason.message : String(s.reason),
            attempts: 0,
            durationMs: 0,
          },
    );
  }
}
