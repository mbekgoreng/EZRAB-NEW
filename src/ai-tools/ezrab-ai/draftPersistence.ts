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
import {
  INTAKE_CONTEXT_SERIAL_VERSION,
  rehydrateUniversalIntakeContext,
  serializeUniversalIntakeContext,
  type SerializedUniversalIntakeContext,
  type UniversalIntakeContext,
} from './universalIntake';
/* Type-only: rantai spek→RAB Fase 2 (tanpa sisi runtime — specChain
   diimpor bernilai oleh universalRab; di sini hanya tipenya). */
import type { ChainValidation } from './specChain';
import type { BuildingModel } from './multiBuilding';
import type { StructuredSpec } from './structuredSpec';
/* Type-only: snapshot versi revisi immutable (Gate 3 / 5C) — impor nilai
   dari draftRevision ke modul ini akan membentuk sikel; tipe saja cukup. */
import type { DraftVersionSnapshot } from './draftRevision';
/* Type-only: rekonsiliasi DED/QTO (Gate 4 / 5D). */
import type { DedQtoDraftInfo } from './dedQtoIntegration';

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
  /** GATE 2 (5B): model gedung draft ini (JSON murni). Opsional —
   *  record lama tanpa field ini tetap terbaca (loadDraft
   *  memperlakukannya sebagai tidak ada); null = draft tanpa model
   *  gedung. DRAFT_SCHEMA_VERSION tetap 1: penambahan medan opsional,
   *  preseden yang sama dengan generatedDraftId (Gate 1) dan
   *  chainValidation (Fase 2). */
  buildings?: BuildingModel[] | null;
  /** Snapshot effectiveItems terserialisasi penuh (baca-cepat/audit). */
  items: ReturnType<typeof effectiveItems>;
  priceProvenance: DraftPriceProvenance[];
  unresolvedItems: Array<{ id: string; description: string }>;
  /** Rantai spek→RAB Fase 2 (JSON murni; null bila draft dibangun tanpa
   * spek terstruktur — perilaku lama). Sebelum perbaikan ini ketiga
   * field TIDAK disimpan sehingga record draft kehilangan laporan
   * validasi sesudah refresh (hanya teks pesan chat yang membawanya).
   * Dipulihkan utuh oleh loadDraft; record lama tanpa field ini tetap
   * terbaca (loadDraft memperlakukannya sebagai tidak ada). */
  structuredSpecs: StructuredSpec[] | null;
  chainValidation: ChainValidation | null;
  ambiguousPicks: NonNullable<UniversalDraft['ambiguousPicks']> | null;
  assumptions: string[];
  warnings: string[];
  changes: string[];
  versions: UniversalDraft['versions'];
  lastTransfer: UniversalDraft['lastTransfer'];
  revisionMeta: {
    savedCount: number;
    lastSavedBy: 'autosave' | 'manual' | 'transfer';
  };
  /**
   * GATE 3 (5C): riwayat versi immutable — snapshot PENUH tiap versi
   * (append-only; entri tidak pernah ditulis ulang). Opsional —
   * record lama tanpa field ini tetap terbaca; DRAFT_SCHEMA_VERSION
   * tetap 1 (preseden yang sama dengan generatedDraftId Gate 1 dan
   * buildings Gate 2). `buildPersistedRecord` MENERUSKAN riwayat record
   * lama — tanpa ini autosave berikutnya akan menghapus riwayat.
   * Cap 20 snapshot (lihat MAX_VERSION_SNAPSHOTS di draftRevision).
   */
  versionHistory?: DraftVersionSnapshot[];
  /**
   * GATE 4 (5D): rekonsiliasi DED/QTO draft ini (checks + keputusan
   * koreksi + referensi lampiran). Opsional — record lama tanpa field
   * ini tetap terbaca; DRAFT_SCHEMA_VERSION tetap 1 (preseden yang
   * sama). Disalin dari draft (bukan dari record lama) — keputusan
   * QTO terbaru yang berlaku.
   */
  dedQto?: DedQtoDraftInfo | null;
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
        /** GATE 3 (5C) — riwayat versi immutable record ini (bila ada). */
        versionHistory?: DraftVersionSnapshot[];
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

/** Sidik isi draft (untuk idempotensi autosave: isi sama → tanpa tulis ulang).
 * structuredSpecs/chainValidation/ambiguousPicks SENGAJA tidak masuk:
 * ketiganya murni turunan dari parts + spec + version yang sudah
 * disidik — parts/spec/version sama ⇒ validasi sama — sehingga
 * memasukkannya hanya akan memecahkan dedupe tanpa menambah keamanan.
 * GATE 2: buildings MASUK — revisi gedung mengubah model TANPA
 * mengubah parts bila gedung itu belum punya part (mis. gedung yang
 * ditandai hilang lalu dilengkapi) — tanpa buildings di sidik, autosave
 * akan menganggap draft tidak berubah dan kehilangan model baru.
 * GATE 4 (5D): dedQto MASUK dengan alasan yang sama — keputusan
 * koreksi QTO mengubah rekonsiliasi TANPA mengubah parts; tanpa
 * dedQto di sidik, autosave akan menganggap draft tidak berubah dan
 * kehilangan keputusan terbaru. */
function draftFingerprint(draft: UniversalDraft): string {
  return JSON.stringify({
    id: draft.id,
    version: draft.version,
    parts: draft.parts,
    buildings: draft.buildings ?? null,
    dedQto: draft.dedQto ?? null,
    assumptions: draft.assumptions,
    warnings: draft.warnings,
    changes: draft.changes,
    versions: draft.versions,
    lastTransfer: draft.lastTransfer,
  });
}

/**
 * GATE 2 (5B) — validasi bentuk model gedung tersimpan: entri tanpa id
 * string dibuang (bukan ditebak); hasil kosong → null (draft tanpa
 * model gedung, perilaku lama). Bukan migrasi: bentuk BuildingModel
 * tidak berubah sejak Fase 4.
 */
function sanitizePersistedBuildings(buildings: unknown): BuildingModel[] | null {
  if (!Array.isArray(buildings)) return null;
  const valid = buildings.filter(
    (b): b is BuildingModel =>
      !!b && typeof b === 'object' && typeof (b as { id?: unknown }).id === 'string'
  );
  return valid.length > 0 ? valid : null;
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
    buildings: draft.buildings ?? null,
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
    structuredSpecs: draft.structuredSpecs ?? null,
    chainValidation: draft.chainValidation ?? null,
    ambiguousPicks: draft.ambiguousPicks ?? null,
    assumptions: draft.assumptions,
    warnings: draft.warnings,
    changes: draft.changes,
    versions: draft.versions,
    lastTransfer: draft.lastTransfer,
    revisionMeta: {
      savedCount: (existing && existing.draftId === draft.id ? existing.revisionMeta.savedCount : 0) + 1,
      lastSavedBy: input.savedBy ?? 'autosave',
    },
    // GATE 3 (5C): riwayat versi diteruskan apa adanya — autosave /
    // simpan biasa TIDAK PERNAH membuat atau menghapus snapshot versi
    // (hanya activateRevision yang menambah riwayat).
    ...(existing?.versionHistory ? { versionHistory: existing.versionHistory } : {}),
    // GATE 4 (5D): rekonsiliasi DED/QTO disalin dari draft (keputusan
    // terbaru yang berlaku); absen = draft tanpa DED terlampir.
    ...(draft.dedQto ? { dedQto: draft.dedQto } : {}),
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
        buildings: existing.buildings ?? undefined,
        // GATE 4 (5D): dedQto WAJIB ikut — draftFingerprint memuatnya;
        // tanpa ini, draft ber-DED tidak pernah ter-dedup (sidik lama
        // selalu null vs sidik baru berisi dedQto).
        dedQto: existing.dedQto ?? undefined,
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
  // GATE 2 — model gedung: dipulihkan utuh; entri rusak dibuang
  // sanitizePersistedBuildings (tidak pernah menebak); record lama
  // tanpa field ini tetap terbaca. Hasil null = tidak ada medan
  // (UniversalDraft.buildings tidak nullable).
  const restoredBuildings = record.buildings
    ? sanitizePersistedBuildings(record.buildings)
    : null;
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
    // Rantai Fase 2 — hanya bila record membawanya (record lama tanpa
    // field ini tetap terbaca; field absen = draft tanpa spek).
    ...(record.chainValidation ? { chainValidation: record.chainValidation } : {}),
    ...(record.structuredSpecs ? { structuredSpecs: record.structuredSpecs } : {}),
    ...(record.ambiguousPicks ? { ambiguousPicks: record.ambiguousPicks } : {}),
    ...(restoredBuildings ? { buildings: restoredBuildings } : {}),
    // GATE 4 (5D) — rekonsiliasi DED/QTO: dipulihkan apa adanya bila
    // record membawanya (bentuk divalidasi ringan: checks array).
    ...(record.dedQto && Array.isArray(record.dedQto.checks) ? { dedQto: record.dedQto } : {}),
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
      ...(record.versionHistory ? { versionHistory: record.versionHistory } : {}),
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
 * GATE 3 (5C) — tulis SATU record draft utuh apa adanya dalam SATU
 * panggilan `saveVersioned` (atomik). Dipakai HANYA oleh
 * `activateRevision` (draftRevision.ts) yang sudah melakukan SEMUA
 * penjaga (kunci idempotensi, baseVersion, baseUpdatedAt) sebelum
 * memanggil ini — fungsi ini sendiri tidak mengulang penjaga versi
 * `saveDraft` karena record yang ditulis SUDAH dibangun dari record
 * terkini lewat `buildPersistedRecord`. Pemanggil lain harus memakai
 * `saveDraft`.
 */
export function writeDraftRecord(record: PersistedDraftRecord): SaveDraftResult {
  if (!record.projectId) {
    return { ok: false, error: 'DRAFT_PERSISTENCE_FAILED', message: 'projectId kosong — record draft tidak ditulis.' };
  }
  const read = readMap();
  if (!read.ok) return read;
  const saved = saveVersioned(AI_DRAFTS_STORAGE_KEY, { ...read.map, [record.projectId]: record });
  if (!saved.ok) {
    const mapped = storageError(saved.error, saved.message);
    return { ok: false, error: mapped.error, message: mapped.message };
  }
  return { ok: true, updatedAt: record.updatedAt, deduplicated: false };
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

/* ------------------------------------------------------------------ */
/* Snapshot konteks INTAKE universal (Adaptive Questionnaire           */
/* 2026-11-12) — mekanisme persistensi yang sama (hardenedStorage      */
/* envelope v2, modul yang sama), kunci namespace saudara. Tujuannya:  */
/* konteks percakapan intake — termasuk keadaan kuesioner — selamat    */
/* dari muat ulang SEBELUM draft ada (record draft di atas baru lahir  */
/* sesudah generate). Bukan store konteks kedua: isinya adalah         */
/* serialisasi UniversalIntakeContext kanonis itu sendiri, dan         */
/* restore mengembalikan objek konteks yang sama lewat                 */
/* rehydrateUniversalIntakeContext (fail-closed: versi/id tak dikenal  */
/* → DRAFT_SCHEMA_UNSUPPORTED, tanpa tebakan migrasi).                 */
/* ------------------------------------------------------------------ */

export const AI_INTAKE_STORAGE_KEY = 'ezrab_prod_ai_intake_contexts';

export interface PersistedIntakeRecord {
  schemaVersion: number;
  updatedAt: string;
  context: SerializedUniversalIntakeContext;
  /**
   * GATE 1 (5A, 2026-11-12) — relasi intake ↔ draft yang dihasilkan.
   * Diisi HANYA bila konteks ini sudah menghasilkan draft (disetel
   * registry pada titik generate, sebelum singleton dibersihkan).
   * Dipakai penjaga pemulihan view untuk membedakan "snapshot konteks
   * draft ini" (dipulihkan BERSAMA draft) dari "snapshot tak-terkait
   * yang lebih tua dari draft" (tetap tidak dipulihkan, perilaku lama).
   * Opsional agar record lama (tanpa medan ini) tetap terbaca —
   * tidak ada bump versi skema untuk penambahan ini.
   */
  generatedDraftId?: string | null;
  /** ISO timestamp saat draft di atas dihasilkan dari konteks ini. */
  generatedAt?: string | null;
}

type IntakeMap = Record<string, PersistedIntakeRecord>;

export type LoadIntakeResult =
  | {
      ok: true;
      ctx: UniversalIntakeContext;
      updatedAt: string;
      /** Relasi intake ↔ draft (GATE 1 / 5A) — null bila konteks ini belum menghasilkan draft. */
      generatedDraftId: string | null;
      generatedAt: string | null;
    }
  | { ok: false; error: DraftPersistenceErrorCode; message: string };

function readIntakeMap(): { ok: true; map: IntakeMap } | { ok: false; error: DraftPersistenceErrorCode; message: string } {
  const res = loadVersioned<IntakeMap>(AI_INTAKE_STORAGE_KEY);
  if (!res.ok) {
    if (res.error === 'NOT_FOUND') return { ok: true, map: {} };
    return { ok: false, error: 'DRAFT_PERSISTENCE_FAILED', message: `Snapshot konteks intake tidak dapat dibaca (${res.error}).` };
  }
  if (!res.data || typeof res.data !== 'object' || Array.isArray(res.data)) {
    return { ok: false, error: 'DRAFT_PERSISTENCE_FAILED', message: 'Snapshot konteks intake rusak (bukan peta proyek).' };
  }
  return { ok: true, map: res.data };
}

/**
 * Simpan snapshot konteks intake proyek (idempoten: isi sama → tanpa tulis ulang).
 * `meta.generatedDraftId` menandai konteks ini sebagai sumber draft tersebut
 * (GATE 1 / 5A) — dedupe MEMBANDINGKAN linkage juga: konteks yang sama yang
 * baru saja menghasilkan draft WAJIB ditulis (bukan di-dedupe), agar relasi
 * intake ↔ draft mendarat di storage.
 */
export function saveIntakeContext(
  projectId: string,
  ctx: UniversalIntakeContext,
  meta?: { generatedDraftId?: string | null; generatedAt?: string | null },
): SaveDraftResult {
  if (!projectId) {
    return { ok: false, error: 'DRAFT_PERSISTENCE_FAILED', message: 'projectId kosong — konteks intake tidak disimpan.' };
  }
  const read = readIntakeMap();
  if (!read.ok) return read;
  const serialized = serializeUniversalIntakeContext(ctx);
  const existing = read.map[projectId] ?? null;
  const contextSame =
    !!existing && JSON.stringify(existing.context) === JSON.stringify(serialized);
  // Linkage intake ↔ draft: bila pemanggil memberi meta, meta itu yang
  // berlaku (null eksplisit = hapus relasi). Bila pemanggil tidak memberi
  // meta (simpan per-giliran dari view), relasi dipertahankan HANYA bila
  // konteksnya identik — konteks BARU pada proyek yang sama tidak boleh
  // mewarisi relasi draft konteks lama.
  const nextDraftId =
    meta && 'generatedDraftId' in meta
      ? (meta.generatedDraftId ?? null)
      : contextSame
        ? (existing?.generatedDraftId ?? null)
        : null;
  const nextGeneratedAt =
    meta && 'generatedAt' in meta
      ? (meta.generatedAt ?? null)
      : contextSame
        ? (existing?.generatedAt ?? null)
        : null;
  if (
    existing &&
    contextSame &&
    (existing.generatedDraftId ?? null) === nextDraftId &&
    (existing.generatedAt ?? null) === nextGeneratedAt
  ) {
    return { ok: true, updatedAt: existing.updatedAt, deduplicated: true };
  }
  const record: PersistedIntakeRecord = {
    schemaVersion: INTAKE_CONTEXT_SERIAL_VERSION,
    updatedAt: new Date().toISOString(),
    context: serialized,
    generatedDraftId: nextDraftId,
    generatedAt: nextGeneratedAt,
  };
  const saved = saveVersioned(AI_INTAKE_STORAGE_KEY, { ...read.map, [projectId]: record });
  if (!saved.ok) {
    const mapped = storageError(saved.error, saved.message);
    return { ok: false, error: mapped.error, message: mapped.message };
  }
  return { ok: true, updatedAt: record.updatedAt, deduplicated: false };
}

/** Muat & rehidrasi konteks intake proyek dari storage dingin (fail-closed). */
export function loadIntakeContext(projectId: string): LoadIntakeResult {
  const read = readIntakeMap();
  if (!read.ok) return read;
  const record = read.map[projectId];
  if (!record) {
    return { ok: false, error: 'DRAFT_NOT_FOUND', message: `Tidak ada konteks intake tersimpan untuk proyek ${projectId}.` };
  }
  // Skema v1 DITERIMA dan dimigrasi oleh rehydrateUniversalIntakeContext
  // (derivasi spek v2 dari jawaban kanonis); v2 adalah versi tulis
  // saat ini. Versi lain tetap fail-closed.
  if (
    typeof record.schemaVersion !== 'number' ||
    (record.schemaVersion !== 1 && record.schemaVersion !== INTAKE_CONTEXT_SERIAL_VERSION)
  ) {
    return {
      ok: false,
      error: 'DRAFT_SCHEMA_UNSUPPORTED',
      message: `Skema snapshot konteks v${String(record.schemaVersion)} tidak didukung (didukung: v1–v${INTAKE_CONTEXT_SERIAL_VERSION}) — konteks tidak ditebak/dimigrasi.`,
    };
  }
  const ctx = rehydrateUniversalIntakeContext(record.context);
  if (!ctx) {
    return {
      ok: false,
      error: 'DRAFT_SCHEMA_UNSUPPORTED',
      message: 'Snapshot konteks intake tidak lolos rehidrasi (id kategori tak dikenal / bentuk tak sah) — konteks tidak ditebak.',
    };
  }
  return {
    ok: true,
    ctx,
    updatedAt: record.updatedAt,
    generatedDraftId: record.generatedDraftId ?? null,
    generatedAt: record.generatedAt ?? null,
  };
}

/** Hapus snapshot konteks intake proyek (mis. intake selesai digantikan draft). */
export function clearIntakeContext(projectId: string): void {
  const read = readIntakeMap();
  if (!read.ok || !read.map[projectId]) return;
  const next = { ...read.map };
  delete next[projectId];
  saveVersioned(AI_INTAKE_STORAGE_KEY, next);
}

/** Baca record mentah snapshot intake (audit/tes) — null bila tidak ada. */
export function peekIntakeContext(projectId: string): PersistedIntakeRecord | null {
  const read = readIntakeMap();
  if (!read.ok) return null;
  return read.map[projectId] ?? null;
}

/**
 * GATE 1 (5A) — keputusan pemulihan snapshot intake (murni, dapat diuji
 * tanpa React; dipakai efek pemulihan view.tsx).
 * Kembalikan true bila snapshot boleh dipulihkan:
 * - tanpa record draft → pulihkan (intake belum menghasilkan draft);
 * - snapshot lebih baru dari record draft → pulihkan (intake berlanjut
 *   sesudah draft tersusun);
 * - snapshot TERTAUT ke draft record (generatedDraftId === draftId) →
 *   pulihkan BERSAMA draft (ini konteks draft itu sendiri);
 * - selain itu (draft lebih baru, snapshot tak-terkait) → jangan
 *   pulihkan (perilaku lama dipertahankan).
 */
export function shouldRestoreIntakeSnapshot(
  loaded: { updatedAt: string; generatedDraftId: string | null },
  draftRec: { draftId: string; updatedAt: string } | null,
): boolean {
  if (!draftRec) return true;
  const linked = !!loaded.generatedDraftId && draftRec.draftId === loaded.generatedDraftId;
  if (draftRec.updatedAt >= loaded.updatedAt && !linked) return false;
  return true;
}
