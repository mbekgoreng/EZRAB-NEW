/**
 * draftPersistence — persistensi draft RAB universal TAHAN-REFRESH
 * (Final Hardening §2, 2026-11-11).
 *
 * Lapisan persistensi DI BAWAH singleton modul universalRab
 * (`lastUniversalDraft` tetap cache kerja in-memory; modul ini BUKAN
 * sumber kebenaran kedua dan tidak mengubah kontrak singleton).
 * Penyimpanan memakai hardenedStorage (saveVersioned/loadVersioned —
 * envelope {v, savedAt, writeId, data} v2 yang sama dengan seluruh
 * dataset aplikasi) di bawah SATU kunci namespace aplikasi:
 * `ezrab_prod_ai_drafts`, berisi peta projectId → record draft aktif
 * proyek itu (satu record per proyek — autosave menimpa record proyek
 * yang sama secara terkendali oleh penjaga versi, tidak pernah
 * menambah record duplikat).
 *
 * PILIHAN SERIALISASI: `parts` disimpan UTUH (scope/template/
 * evaluatedParams/generation/removedKeys/manualPrices apa adanya).
 * DraftPart.generation (GeneratedTemplateRabResult), RabTemplate dan
 * ScopeGroup adalah data JSON murni (tanpa fungsi/kelas) — diverifikasi
 * oleh suite draftPersistenceHardening (round-trip JSON → draft hasil
 * restore menghasilkan effectiveItems yang identik dan tetap lolos
 * alur revisi & transfer yang sama). Menyimpan hanya `items` hasil
 * effectiveItems akan KEHILANGAN removedKeys/manualPrices/evaluated
 * Params sehingga revisi pasca-restore tidak setara — karena itu
 * parts utuh yang dipilih; `items` tetap disertakan sebagai snapshot
 * baca-cepat + dasar provenans per item.
 *
 * confirmedSpecs/pendingSpecs: struktur UniversalSpec/intake saat ini
 * TIDAK memiliki daftar spec terkonfirmasi/tertunda yang terpisah
 * (spec adalah satu objek datar) — kedua field disimpan `null` secara
 * eksplisit (jujur: tidak ada sumbernya), BUKAN dikarang.
 */

import { loadVersioned, saveVersioned } from '../../engine/storage/hardenedStorage';
import {
  effectiveItems,
  isPriceValidForTotal,
  type UniversalDraft,
} from './universalRab';

export const AI_DRAFTS_STORAGE_KEY = 'ezrab_prod_ai_drafts';

/** Versi skema payload record draft — TERPISAH dari envelope storage v2. */
export const DRAFT_SCHEMA_VERSION = 1;

export type DraftPersistenceErrorCode =
  | 'DRAFT_PERSISTENCE_FAILED'
  | 'DRAFT_VERSION_CONFLICT'
  | 'DRAFT_SCHEMA_UNSUPPORTED'
  | 'DRAFT_QUOTA_EXCEEDED'
  | 'DRAFT_NOT_FOUND'
  | 'DRAFT_SERIALIZE_FAILED';

export interface DraftPriceProvenance {
  itemId: string;
  description: string;
  /** Status payload: PRICE_RESOLVED | PRICE_MANUAL | PRICE_UNRESOLVED. */
  priceStatus: string;
  priceSourceKind: string | null;
  priceSourceLabel: string | null;
  priceSourceExplanation: string | null;
}

export interface PersistedDraftRecord {
  draftId: string;
  projectId: string;
  conversationId: string | null;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  /** UniversalDraft.version saat record ini disimpan. */
  baseVersion: number;
  workflowStage: string;
  draftStatus: 'draft' | 'ready' | 'transferred';
  title: string;
  /** UniversalSpec apa adanya (JSON murni). */
  spec: UniversalDraft['spec'];
  /** Tidak ada sumber terpisah di struktur saat ini — lihat header. */
  confirmedSpecs: null;
  pendingSpecs: null;
  /** DraftPart[] utuh — dasar restore yang identik (lihat header). */
  parts: UniversalDraft['parts'];
  /** Snapshot effectiveItems terserialisasi penuh (baca-cepat/audit). */
  items: ReturnType<typeof effectiveItems>;
  priceProvenance: DraftPriceProvenance[];
  unresolvedItems: Array<{ id: string; description: string }>;
  assumptions: string[];
  warnings: string[];
  changes: string[];
  versions: UniversalDraft['versions'];
  lastTransfer: UniversalDraft['lastTransfer'];
  revisionMeta: {
    savedCount: number;
    lastSavedBy: 'autosave' | 'manual' | 'transfer';
  };
}

type DraftMap = Record<string, PersistedDraftRecord>;

export interface SaveDraftInput {
  draft: UniversalDraft;
  projectId: string;
  conversationId?: string | null;
  workflowStage?: string;
  savedBy?: 'autosave' | 'manual' | 'transfer';
  /**
   * updatedAt record yang terakhir diketahui penulis ini. Bila record
   * tersimpan kini punya updatedAt BERBEDA, sesi/tab lain sudah menulis
   * sesudahnya → penulisan ini basi → DRAFT_VERSION_CONFLICT.
   */
  expectedUpdatedAt?: string | null;
}

export type SaveDraftResult =
  | { ok: true; updatedAt: string; deduplicated: boolean }
  | { ok: false; error: DraftPersistenceErrorCode; message: string };

export type LoadDraftResult =
  | {
      ok: true;
      draft: UniversalDraft;
      meta: {
        projectId: string;
        conversationId: string | null;
        draftStatus: PersistedDraftRecord['draftStatus'];
        workflowStage: string;
        updatedAt: string;
        savedCount: number;
      };
    }
  | { ok: false; error: DraftPersistenceErrorCode; message: string };

function storageError(
  saveError: 'QUOTA_EXCEEDED' | 'NOT_SUPPORTED' | 'SERIALIZE_ERROR' | 'UNKNOWN',
  message: string,
): { error: DraftPersistenceErrorCode; message: string } {
  if (saveError === 'QUOTA_EXCEEDED') return { error: 'DRAFT_QUOTA_EXCEEDED', message };
  if (saveError === 'SERIALIZE_ERROR') return { error: 'DRAFT_SERIALIZE_FAILED', message };
  return { error: 'DRAFT_PERSISTENCE_FAILED', message };
}

function readMap(): { ok: true; map: DraftMap } | { ok: false; error: DraftPersistenceErrorCode; message: string } {
  const res = loadVersioned<DraftMap>(AI_DRAFTS_STORAGE_KEY);
  if (!res.ok) {
    if (res.error === 'NOT_FOUND') return { ok: true, map: {} };
    return { ok: false, error: 'DRAFT_PERSISTENCE_FAILED', message: `Record draft tidak dapat dibaca (${res.error}).` };
  }
  if (!res.data || typeof res.data !== 'object' || Array.isArray(res.data)) {
    return { ok: false, error: 'DRAFT_PERSISTENCE_FAILED', message: 'Record draft rusak (bukan peta proyek).' };
  }
  return { ok: true, map: res.data };
}

function deriveStatus(draft: UniversalDraft, projectId: string): PersistedDraftRecord['draftStatus'] {
  if (
    draft.lastTransfer &&
    draft.lastTransfer.projectId === projectId &&
    draft.lastTransfer.version === draft.version
  ) {
    return 'transferred';
  }
  return 'draft';
}

/** Sidik isi draft (untuk idempotensi autosave: isi sama → tanpa tulis ulang). */
function draftFingerprint(draft: UniversalDraft): string {
  return JSON.stringify({
    id: draft.id,
    version: draft.version,
    parts: draft.parts,
    assumptions: draft.assumptions,
    warnings: draft.warnings,
    changes: draft.changes,
    versions: draft.versions,
    lastTransfer: draft.lastTransfer,
  });
}

export function buildPersistedRecord(
  input: SaveDraftInput,
  existing?: PersistedDraftRecord | null,
  now: string = new Date().toISOString(),
): PersistedDraftRecord {
  const { draft, projectId } = input;
  const items = effectiveItems(draft);
  return {
    draftId: draft.id,
    projectId,
    conversationId: input.conversationId ?? existing?.conversationId ?? null,
    schemaVersion: DRAFT_SCHEMA_VERSION,
    createdAt: existing && existing.draftId === draft.id ? existing.createdAt : draft.createdAt,
    updatedAt: now,
    baseVersion: draft.version,
    workflowStage: input.workflowStage ?? existing?.workflowStage ?? 'draft-active',
    draftStatus: deriveStatus(draft, projectId),
    title: draft.title,
    spec: draft.spec,
    confirmedSpecs: null,
    pendingSpecs: null,
    parts: draft.parts,
    items,
    priceProvenance: items.map((it) => ({
      itemId: it.id,
      description: it.description,
      priceStatus: !isPriceValidForTotal(it)
        ? 'PRICE_UNRESOLVED'
        : it.priceStatus === 'PRICE_MANUAL'
          ? 'PRICE_MANUAL'
          : 'PRICE_RESOLVED',
      priceSourceKind: (it as { priceSourceKind?: string }).priceSourceKind ?? null,
      priceSourceLabel: it.priceSourceLabel ?? null,
      priceSourceExplanation: it.priceSourceExplanation ?? null,
    })),
    unresolvedItems: items
      .filter((it) => !isPriceValidForTotal(it))
      .map((it) => ({ id: it.id, description: it.description })),
    assumptions: draft.assumptions,
    warnings: draft.warnings,
    changes: draft.changes,
    versions: draft.versions,
    lastTransfer: draft.lastTransfer,
    revisionMeta: {
      savedCount: (existing && existing.draftId === draft.id ? existing.revisionMeta.savedCount : 0) + 1,
      lastSavedBy: input.savedBy ?? 'autosave',
    },
  };
}

/**
 * Simpan draft aktif proyek. Penjaga konflik: record tersimpan dengan
 * baseVersion LEBIH BARU, atau baseVersion sama tetapi updatedAt lebih
 * baru dengan isi berbeda (penulisan basi dari tab/sesi lain), DITOLAK
 * dengan DRAFT_VERSION_CONFLICT — tidak ditimpa diam-diam.
 */
export function saveDraft(input: SaveDraftInput): SaveDraftResult {
  const { draft, projectId } = input;
  if (!projectId) {
    return { ok: false, error: 'DRAFT_PERSISTENCE_FAILED', message: 'projectId kosong — draft tidak disimpan.' };
  }
  const read = readMap();
  if (!read.ok) return read;
  const existing = read.map[projectId] ?? null;

  if (existing && input.expectedUpdatedAt != null && existing.updatedAt !== input.expectedUpdatedAt) {
    return {
      ok: false,
      error: 'DRAFT_VERSION_CONFLICT',
      message: 'Record draft sudah ditulis sesi/tab lain sesudah terakhir Anda baca — penulisan basi ditolak agar tidak menimpa perubahan yang lebih baru.',
    };
  }
  if (existing && existing.draftId === draft.id) {
    if (existing.baseVersion > draft.version) {
      return {
        ok: false,
        error: 'DRAFT_VERSION_CONFLICT',
        message: `Draft tersimpan lebih baru (versi ${existing.baseVersion}) daripada yang hendak ditulis (versi ${draft.version}) — penulisan basi ditolak.`,
      };
    }
    if (existing.baseVersion === draft.version) {
      // Idempoten: draft yang sama persis tidak menulis ulang.
      const existingPrint = draftFingerprint({
        id: existing.draftId,
        version: existing.baseVersion,
        parts: existing.parts,
        assumptions: existing.assumptions,
        warnings: existing.warnings,
        changes: existing.changes,
        versions: existing.versions,
        lastTransfer: existing.lastTransfer,
      } as UniversalDraft);
      if (existingPrint === draftFingerprint(draft)) {
        return { ok: true, updatedAt: existing.updatedAt, deduplicated: true };
      }
      // Versi sama + isi beda tanpa expectedUpdatedAt = penulisan
      // lanjutan sesi yang sama (mis. receipt transfer dicatat pada
      // objek draft yang sama) — diizinkan; konflik antar-tab
      // ditangkap penjaga baseVersion & expectedUpdatedAt di atas.
    }
  }

  const record = buildPersistedRecord(input, existing);
  const nextMap: DraftMap = { ...read.map, [projectId]: record };
  const saved = saveVersioned(AI_DRAFTS_STORAGE_KEY, nextMap);
  if (!saved.ok) {
    const mapped = storageError(saved.error, saved.message);
    return { ok: false, error: mapped.error, message: mapped.message };
  }
  return { ok: true, updatedAt: record.updatedAt, deduplicated: false };
}

/**
 * Muat & rekonstruksi UniversalDraft proyek dari storage dingin.
 * Fail-closed: schemaVersion tak dikenal / lebih besar dari yang
 * didukung → DRAFT_SCHEMA_UNSUPPORTED, TANPA tebakan migrasi.
 */
export function loadDraft(projectId: string): LoadDraftResult {
  const read = readMap();
  if (!read.ok) return read;
  const record = read.map[projectId];
  if (!record) {
    return { ok: false, error: 'DRAFT_NOT_FOUND', message: `Tidak ada draft tersimpan untuk proyek ${projectId}.` };
  }
  if (typeof record.schemaVersion !== 'number' || record.schemaVersion !== DRAFT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: 'DRAFT_SCHEMA_UNSUPPORTED',
      message: `Skema record draft v${String(record.schemaVersion)} tidak didukung (didukung: v${DRAFT_SCHEMA_VERSION}) — draft tidak ditebak/dimigrasi.`,
    };
  }
  const draft: UniversalDraft = {
    id: record.draftId,
    title: record.title,
    spec: record.spec,
    parts: record.parts,
    assumptions: record.assumptions,
    warnings: record.warnings,
    changes: record.changes,
    versions: record.versions,
    version: record.baseVersion,
    createdAt: record.createdAt,
    lastTransfer: record.lastTransfer,
  };
  return {
    ok: true,
    draft,
    meta: {
      projectId: record.projectId,
      conversationId: record.conversationId,
      draftStatus: record.draftStatus,
      workflowStage: record.workflowStage,
      updatedAt: record.updatedAt,
      savedCount: record.revisionMeta.savedCount,
    },
  };
}

/** Baca record mentah (audit/tes) — null bila tidak ada. */
export function peekPersistedDraft(projectId: string): PersistedDraftRecord | null {
  const read = readMap();
  if (!read.ok) return null;
  return read.map[projectId] ?? null;
}

/**
 * Tandai draft proyek sebagai ter-transfer. Dipanggil HANYA sesudah
 * outcome transfer terverifikasi sukses, dengan receipt NYATA dari
 * store (bukan klaim UI).
 */
export function markTransferred(
  projectId: string,
  receipt: NonNullable<UniversalDraft['lastTransfer']>,
): SaveDraftResult {
  const read = readMap();
  if (!read.ok) return read;
  const existing = read.map[projectId];
  if (!existing) {
    return { ok: false, error: 'DRAFT_NOT_FOUND', message: `Tidak ada draft tersimpan untuk proyek ${projectId}.` };
  }
  const record: PersistedDraftRecord = {
    ...existing,
    draftStatus: 'transferred',
    lastTransfer: receipt,
    updatedAt: new Date().toISOString(),
    revisionMeta: { savedCount: existing.revisionMeta.savedCount + 1, lastSavedBy: 'transfer' },
  };
  const saved = saveVersioned(AI_DRAFTS_STORAGE_KEY, { ...read.map, [projectId]: record });
  if (!saved.ok) {
    const mapped = storageError(saved.error, saved.message);
    return { ok: false, error: mapped.error, message: mapped.message };
  }
  return { ok: true, updatedAt: record.updatedAt, deduplicated: false };
}
