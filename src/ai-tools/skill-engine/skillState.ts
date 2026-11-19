/**
 * EZRAB AI — Skill Engine: state eksekusi skill (BARU, Phase 2 Workstream 3).
 *
 * Status per skill-run yang persisten lintas navigasi SPA (store module-level,
 * pola yang sama dengan executionRuntime: navigasi != batal). Reload halaman
 * memusnahkan state in-memory — SAMA seperti executionRuntime hari ini;
 * persistensi lintas-reload membutuhkan job store server (Tahap 4, sesudah
 * AUTH + VPS) dan dinyatakan TIDAK ADA secara jujur sampai saat itu.
 *
 * Adapter persistensi opsional (mis. localStorage lewat hardenedStorage)
 * disuntikkan pemanggil; modul ini tidak menyentuh storage apa pun sendiri.
 */
import type { SkillExecutionStatus } from './types';

export interface SkillRunRecord {
  runId: string;
  skillId: string;
  requestId: string;
  traceId: string;
  projectId: string | null;
  conversationId: string | null;
  status: SkillExecutionStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  errorCode: string | null;
  error: string | null;
  /** Diisi bila persistensi adapter gagal (kegagalan terlihat, bukan diam). */
  persistenceError: string | null;
}

/** Adapter persistensi opsional — pemanggil yang menyediakan implementasinya. */
export interface SkillStatePersistenceAdapter {
  load(): Promise<SkillRunRecord[]>;
  save(records: SkillRunRecord[]): Promise<void>;
}

export class SkillStateStore {
  private readonly runs = new Map<string, SkillRunRecord>();
  private readonly adapter: SkillStatePersistenceAdapter | null;

  constructor(adapter?: SkillStatePersistenceAdapter | null) {
    this.adapter = adapter ?? null;
  }

  /** Muat state tersimpan (bila ada adapter); tanpa adapter = no-op. */
  async restore(): Promise<void> {
    if (!this.adapter) return;
    const records = await this.adapter.load();
    for (const r of records) {
      // Run yang masih 'running' saat reload dinyatakan 'failed' secara jujur:
      // tidak ada proses yang benar-benar berjalan lagi sesudah reload.
      const restored: SkillRunRecord =
        r.status === 'running' || r.status === 'pending'
          ? { ...r, status: 'failed', errorCode: 'INTERRUPTED_BY_RELOAD', error: 'Eksekusi terputus karena halaman dimuat ulang.', completedAt: Date.now(), updatedAt: Date.now() }
          : r;
      this.runs.set(restored.runId, restored);
    }
  }

  /** Tulis seluruh state ke adapter (bila ada); tanpa adapter = no-op. */
  async saveNow(): Promise<void> {
    if (!this.adapter) return;
    await this.adapter.save([...this.runs.values()]);
  }

  createRun(input: Omit<SkillRunRecord, 'status' | 'attempts' | 'createdAt' | 'updatedAt' | 'completedAt' | 'errorCode' | 'error' | 'persistenceError'>): SkillRunRecord {
    const now = Date.now();
    const record: SkillRunRecord = {
      ...input,
      status: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      errorCode: null,
      error: null,
      persistenceError: null,
    };
    this.runs.set(record.runId, record);
    return record;
  }

  updateRun(runId: string, patch: Partial<SkillRunRecord>): SkillRunRecord | null {
    const existing = this.runs.get(runId);
    if (!existing) return null;
    const updated: SkillRunRecord = { ...existing, ...patch, runId, updatedAt: Date.now() };
    this.runs.set(runId, updated);
    return updated;
  }

  getRun(runId: string): SkillRunRecord | null {
    return this.runs.get(runId) ?? null;
  }

  listRuns(filter?: { projectId?: string | null; skillId?: string; status?: SkillExecutionStatus }): SkillRunRecord[] {
    return [...this.runs.values()].filter((r) => {
      if (filter?.projectId !== undefined && r.projectId !== filter.projectId) return false;
      if (filter?.skillId !== undefined && r.skillId !== filter.skillId) return false;
      if (filter?.status !== undefined && r.status !== filter.status) return false;
      return true;
    });
  }

  /**
   * Titik resume: hanya run 'awaiting-approval' yang dapat dilanjutkan
   * (persetujuan datang, eksekusi jalan). Run terminal tidak dapat dilanjutkan.
   */
  getResumableRun(runId: string): SkillRunRecord | null {
    const run = this.runs.get(runId);
    return run && run.status === 'awaiting-approval' ? run : null;
  }

  __resetForTests(): void {
    this.runs.clear();
  }
}

/** Singleton sesi (pola executionRuntime) — hidup lintas navigasi SPA. */
export const skillStateStore = new SkillStateStore();

export function createSkillStateStore(adapter?: SkillStatePersistenceAdapter | null): SkillStateStore {
  return new SkillStateStore(adapter ?? null);
}
