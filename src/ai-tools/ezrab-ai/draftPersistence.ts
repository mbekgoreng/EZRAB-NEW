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
/* W11 §11 — rebuild match kartu pilihan dari rawText saat load (lihat
   seksi state rumah di bawah). directRab tidak mengimpor modul ini
   (grafnya: rabNeeds/data/formulaEngine/directRabGate→universalRab)
   sehingga impor ini tidak membentuk sikel. */
import { findDirectTemplate } from './directRab';
import type { RabNeeds } from './rabNeeds';
import type { RabIntentSpec } from './rabIntentSpec';
/* Type-only: PendingRabChoice didefinisikan di actionRegistry (yang
   mengimpor modul ini sebagai nilai) — impor tipe terhapus saat
   kompilasi sehingga tidak ada sikel runtime. */
import type { PendingRabChoice } from './actionRegistry';
/* Type-only: rantai spek→RAB Fase 2 (tanpa sisi runtime — specChain
   diimpor bernilai oleh universalRab; di sini hanya tipenya). */
import type { ChainValidation, WbsCompletenessReport } from './specChain';
/* Type-only: artefak WBS eksplisit (P3D; wbsArtifact tidak mengimpor
   modul ini — impor tipe aman dari siklus). */
import type { WbsArtifact } from './wbsArtifact';
import type { BuildingModel } from './multiBuilding';
import type { StructuredSpec } from './structuredSpec';
/* Type-only: snapshot versi revisi immutable (Gate 3 / 5C) — impor nilai
   dari draftRevision ke modul ini akan membentuk sikel; tipe saja cukup. */
import type { DraftVersionSnapshot } from './draftRevision';
/* Type-only: rekonsiliasi DED/QTO (Gate 4 / 5D). */
import type { DedQtoDraftInfo } from './dedQtoIntegration';
/* Type-only: model cakupan proyek (Batch 2 §5.2 — scopeDiscipline
   adalah modul daun yang hanya mengimpor TIPE dari universalRab;
   impor tipe di sini aman dari siklus). */
import type { DraftScopeModel } from './scopeDiscipline';

export const AI_DRAFTS_STORAGE_KEY = 'ezrab_prod_ai_drafts';

/** Versi skema payload record draft — TERPISAH dari envelope storage v2. */
export const DRAFT_SCHEMA_VERSION = 1;

export type DraftPersistenceErrorCode =
  | 'DRAFT_PERSISTENCE_FAILED'
  | 'DRAFT_VERSION_CONFLICT'
  | 'INTAKE_VERSION_CONFLICT'
  | 'HOME_STATE_VERSION_CONFLICT'
  | 'DRAFT_SCHEMA_UNSUPPORTED'
  | 'DRAFT_QUOTA_EXCEEDED'
  | 'DRAFT_NOT_FOUND'
  | 'DRAFT_SERIALIZE_FAILED';

export interface DraftPriceProvenance {
  itemId: string;
  description: string;
  /** Status payload: PRICE_RESOLVED | PRICE_ESTIMATED | PRICE_MANUAL | PRICE_UNRESOLVED. */
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
  /**
   * P6 (FULL REPAIR 2026-11-13 — menutup P3D-O1): artefak WBS eksplisit
   * + laporan kelengkapan WBS/spek draft ini (P3D). Opsional — record
   * lama tanpa field ini tetap terbaca; DRAFT_SCHEMA_VERSION tetap 1
   * (preseden yang sama dengan dedQto Gate 4). Disalin dari draft
   * (bukan dari record lama) — artefak terbaru yang berlaku. Tanpa
   * threading ini, `buildUniversalDraft` tidak boleh memasang kedua
   * field (draft in-memory vs seed v1 tidak byte-identik — invariansi
   * revisi P4-(d) pecah); dengan threading ini, hook auto-attach di
   * `buildUniversalDraft` dipasang kembali (P6) dan P4-(d) tetap hijau.
   */
  wbsArtifact?: WbsArtifact | null;
  wbsCompleteness?: WbsCompletenessReport | null;
  /**
   * Batch 2 (§5.2/§5.4) — model cakupan proyek + laporan validasi
   * integritas cakupan. Opsional — record lama tanpa field ini tetap
   * terbaca; DRAFT_SCHEMA_VERSION tetap 1 (preseden P6/dedQto).
   * Disalin dari draft (bukan dari record lama) — model terbaru yang
   * berlaku. Tanpa threading ini, draft in-memory vs seed v1 tidak
   * byte-identik (invariansi revisi 5C-01/5C-10 pecah) — alasan yang
   * sama dengan P6 untuk wbsArtifact.
   */
  scopeModel?: DraftScopeModel | null;
  /**
   * Batch 2 (§5.3) — id template yang dipaksa pengguna (bila ada).
   * Tanpa threading ini, pengecualian L1 (pilihan eksplisit pengguna)
   * hilang sesudah reload sehingga validator bisa menembak pada draft
   * yang sama yang lolos sebelum disimpan.
   */
  forcedTemplateId?: string | null;
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
 * kehilangan keputusan terbaru.
 * P6: wbsArtifact MASUK dengan alasan yang sama — keputusan review
 * WBS (pengecualian node + catatan user) hidup DI DALAM artefak dan
 * mengubah artefak TANPA mengubah parts; tanpa artefak di sidik,
 * autosave akan menganggap draft tidak berubah dan kehilangan
 * keputusan terbaru. wbsCompleteness SENGAJA TIDAK masuk: laporan
 * itu murni turunan dari parts + spek + artefak (seperti
 * chainValidation) DAN membawa `checkedAt` non-deterministik —
 * memasukkannya akan memecahkan dedupe + menginvalidasi binding
 * approval transfer (G1) pada tiap validasi ulang tanpa perubahan
 * makna.
 * Batch 2: scopeModel SENGAJA TIDAK masuk — model itu murni turunan
 * deterministik dari parts + spek (+ forcedTemplateId untuk
 * pengecualian L1); parts/spec sama ⇒ model sama.
 * Batch 4 (§8): diekspor agar gerbang transfer risiko teknik
 * (checkEngineeringTransferGate, pricingFinancialIntegrity.ts) dapat
 * mengikat catatan review pada sidik keadaan draft yang SAMA dengan
 * binding approval transfer G1 — tanpa ekspor ini, B5 tidak punya
 * sidik kanonis untuk mengikat review. */
export function draftFingerprint(draft: UniversalDraft): string {
  return JSON.stringify({
    id: draft.id,
    version: draft.version,
    parts: draft.parts,
    buildings: draft.buildings ?? null,
    dedQto: draft.dedQto ?? null,
    wbsArtifact: draft.wbsArtifact ?? null,
    assumptions: draft.assumptions,
    warnings: draft.warnings,
    changes: draft.changes,
    versions: draft.versions,
    lastTransfer: draft.lastTransfer,
  });
}

/* ================================================================== */
/* G1 (K-04, Audit Fase 0 Skill Engine 2026-11-13) — pengikatan        */
/* approval transfer ke versi + hash draft yang DITINJAU di pratinjau. */
/*                                                                     */
/* Pola yang SUDAH ADA di repo, bukan mekanisme baru:                  */
/*  - sidik isi = draftFingerprint di atas (dipakai autosave);         */
/*  - stateHash + TTL 10 menit = ChangePlan (operations.ts:161,283,    */
/*    637–639: executePlan membatalkan bila hash berubah / proyek      */
/*    berganti / pratinjau kedaluwarsa);                               */
/*  - guard versi = RevisionPreview {baseVersion, baseUpdatedAt}       */
/*    (draftRevision.ts:114–116,652–692).                              */
/*                                                                     */
/* Kedua fungsi di bawah MURNI (tanpa tulis apa pun): pembuat binding  */
/* dipanggil saat pratinjau dibuat (view.tsx), pemeriksa dipanggil     */
/* handler konfirmasi SEBELUM validateTransfer/payload/tulis. Cakupan  */
/* sidik = cakupan draftFingerprint: `spec`/`title` TIDAK ikut —      */
/* keduanya tidak mengubah payload transfer (payload dibangun dari    */
/* parts); bila suatu saat spec memengaruhi payload secara independen, */
/* sidik harus diperluas dulu.                                         */
/* ================================================================== */

/** TTL approval transfer — 10 menit, SAMA dengan PLAN_TTL_MS
 * (operations.ts:283). Pratinjau yang lebih tua dari ini wajib dibuat
 * ulang agar angka yang ditampilkan selalu data terbaru. */
export const TRANSFER_APPROVAL_TTL_MS = 10 * 60 * 1000;

/** Approval transfer yang terikat pada SATU keadaan draft: yang
 * ditinjau pengguna di pratinjau. Disimpan di memori sesi saja
 * (pendingTransferApprovalRef di view.tsx, pola pendingRevisionRef
 * Gate 3) — TIDAK dipersist; reload membatalkan approval. */
export interface TransferApprovalBinding {
  draftId: string;
  projectId: string;
  version: number;
  /** draftFingerprint(draft) saat pratinjau dibuat. */
  fingerprint: string;
  /** Date.now() saat pratinjau dibuat (dasar TTL). */
  createdAt: number;
}

export type TransferApprovalCheck =
  | { ok: true }
  | {
      ok: false;
      reason: 'NO_BINDING' | 'DRAFT_CHANGED' | 'PROJECT_CHANGED' | 'EXPIRED';
      message: string;
    };

export function createTransferApprovalBinding(
  draft: UniversalDraft,
  projectId: string,
  now: number = Date.now(),
): TransferApprovalBinding {
  return {
    draftId: draft.id,
    projectId,
    version: draft.version,
    fingerprint: draftFingerprint(draft),
    createdAt: now,
  };
}

/**
 * Periksa apakah konfirmasi transfer masih berlaku untuk draft AKTIF
 * saat klik. Urutan cek meniru executePlan (operations.ts:631–639):
 * kedaluwarsa → proyek berganti → isi berubah. Murni: tidak membaca
 * storage, tidak menulis apa pun, tidak mengubah draft/binding.
 */
export function checkTransferApprovalBinding(
  binding: TransferApprovalBinding | null,
  draft: UniversalDraft | null,
  projectId: string,
  now: number = Date.now(),
): TransferApprovalCheck {
  if (!binding) {
    return {
      ok: false,
      reason: 'NO_BINDING',
      message:
        'Tidak ada pratinjau transfer yang aktif di sesi ini (pratinjau sudah dipakai, kedaluwarsa, atau sesi dimuat ulang).',
    };
  }
  if (now > binding.createdAt + TRANSFER_APPROVAL_TTL_MS) {
    return {
      ok: false,
      reason: 'EXPIRED',
      message:
        'Pratinjau transfer kedaluwarsa (lebih dari 10 menit). Buat pratinjau baru agar angka yang ditampilkan selalu data terbaru.',
    };
  }
  if (projectId !== binding.projectId) {
    return {
      ok: false,
      reason: 'PROJECT_CHANGED',
      message:
        'Proyek aktif sudah berganti sejak pratinjau dibuat — transfer DIBATALKAN agar tidak menyentuh proyek yang salah.',
    };
  }
  // Sidik SUDAH memuat id + versi, jadi cek eksplisit di bawah adalah
  // sabuk-pengaman yang meniru guard baseVersion revisi — ketiganya
  // bermuara ke satu pesan yang sama.
  if (
    !draft ||
    draft.id !== binding.draftId ||
    draft.version !== binding.version ||
    draftFingerprint(draft) !== binding.fingerprint
  ) {
    return {
      ok: false,
      reason: 'DRAFT_CHANGED',
      message: 'Draft berubah sesudah pratinjau — tinjau ulang sebelum transfer.',
    };
  }
  return { ok: true };
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
      // Batch 4 (§7.2/§7.5): snapshot provenance HARUS membedakan
      // estimasi dari resmi — versi lama melipat PRICE_ESTIMATED ke
      // 'PRICE_RESOLVED' sehingga record tersimpan mengklaim resmi
      // atas harga asumsi (estimasi Full AI yang sudah di-transfer
      // tercatat sebagai harga resmi di snapshot).
      priceStatus: !isPriceValidForTotal(it)
        ? 'PRICE_UNRESOLVED'
        : it.priceStatus === 'PRICE_MANUAL'
          ? 'PRICE_MANUAL'
          : it.priceStatus === 'PRICE_ESTIMATED'
            ? 'PRICE_ESTIMATED'
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
    // P6 (P3D-O1): artefak WBS + laporan kelengkapan disalin dari
    // draft (keputusan terbaru yang berlaku); absen = draft lama
    // tanpa artefak (record tetap terbaca; UI menghitung on-demand).
    ...(draft.wbsArtifact ? { wbsArtifact: draft.wbsArtifact } : {}),
    ...(draft.wbsCompleteness ? { wbsCompleteness: draft.wbsCompleteness } : {}),
    // Batch 2 (§5.2/§5.4): model cakupan + template paksa disalin dari
    // draft (alasan yang sama dengan P6 — tanpa ini seed v1 hasil
    // reload tidak byte-identik dengan draft in-memory, 5C-01/5C-10).
    ...(draft.scopeModel ? { scopeModel: draft.scopeModel } : {}),
    ...(draft.forcedTemplateId ? { forcedTemplateId: draft.forcedTemplateId } : {}),
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
        // P6 (P3D-O1): wbsArtifact WAJIB ikut dengan alasan yang sama
        // (draftFingerprint memuatnya; wbsCompleteness TIDAK masuk
        // sidik — lihat dok draftFingerprint).
        wbsArtifact: existing.wbsArtifact ?? undefined,
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
    // P6 (P3D-O1) — artefak WBS + laporan kelengkapan: dipulihkan apa
    // adanya bila record membawanya (bentuk divalidasi ringan:
    // artefak punya nodes array; laporan punya status). Record lama
    // tanpa field ini tetap terbaca (field absen = on-demand).
    ...(record.wbsArtifact && Array.isArray(record.wbsArtifact.nodes)
      ? { wbsArtifact: record.wbsArtifact }
      : {}),
    ...(record.wbsCompleteness &&
    (record.wbsCompleteness.status === 'LENGKAP' || record.wbsCompleteness.status === 'BELUM_LENGKAP')
      ? { wbsCompleteness: record.wbsCompleteness }
      : {}),
    // Batch 2 (§5.2/§5.4) — model cakupan + template paksa: dipulihkan
    // apa adanya bila record membawanya (bentuk divalidasi ringan:
    // model punya scopes array). Record lama tanpa field ini tetap
    // terbaca (field absen = draft pra-B2; model dibangun ulang pada
    // revisi berikutnya via snapshotVersion).
    ...(record.scopeModel && Array.isArray(record.scopeModel.scopes)
      ? { scopeModel: record.scopeModel }
      : {}),
    ...(record.forcedTemplateId ? { forcedTemplateId: record.forcedTemplateId } : {}),
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
 * REFIX Stage 3 (2026-11-23) — kunci perbandingan ISI konteks intake.
 * `serializeUniversalIntakeContext` menderivasi ulang `structuredSpecs`
 * di SETIAP simpan, dan `deriveStructuredSpecs` mencap `updatedAt` tiap
 * spek dengan jam dinding saat `questionnaire.submittedAt` null (alur
 * chat-only — questionnaire.ts:1826). Akibatnya JSON mentah TIDAK PERNAH
 * sama untuk konteks berspesifikasi: dedupe gagal di tiap simpan dan
 * tiap simpan menulis versi baru — tak terlihat single-tab, tetapi
 * listener storage S3-A mengubahnya menjadi ping-pong refresh/simpan
 * ~10 versi/detik antar-tab (VERIFICATION-REPORT Stage 3 §5.1).
 * `updatedAt` spek adalah stempel derivasi, BUKAN isi spek — konvensi
 * yang sama sudah dipakai chatSpecChainSchema.test.ts:125-134 (spek
 * dibandingkan tanpa updatedAt). Semua medan lain (termasuk `version`,
 * sehingga migrasi v1→v2 tetap menulis) dibandingkan apa adanya.
 */
function intakeContextContentKey(serialized: SerializedUniversalIntakeContext): string {
  const specs = serialized.structuredSpecs;
  if (!specs || specs.length === 0) return JSON.stringify(serialized);
  const stripped = specs.map(({ updatedAt: _ignored, ...rest }) => rest);
  return JSON.stringify({ ...serialized, structuredSpecs: stripped });
}

/**
 * Simpan snapshot konteks intake proyek (idempoten: isi sama → tanpa tulis ulang).
 * `meta.generatedDraftId` menandai konteks ini sebagai sumber draft tersebut
 * (GATE 1 / 5A) — dedupe MEMBANDINGKAN linkage juga: konteks yang sama yang
 * baru saja menghasilkan draft WAJIB ditulis (bukan di-dedupe), agar relasi
 * intake ↔ draft mendarat di storage.
 * S3-A (2026-11-23) — optimistic concurrency antar-tab, cermin guard
 * `expectedUpdatedAt` saveDraft: bila `opts.expectedUpdatedAt` terisi dan
 * record tersimpan kini punya updatedAt BERBEDA, sesi/tab lain sudah menulis
 * sesudahnya → penulisan ini basi → INTAKE_VERSION_CONFLICT (tidak menimpa
 * diam-diam). Bila null/undefined → perilaku lama (kompatibel dengan
 * pemanggil yang belum melacak baseline). URUTAN GUARD vs DEDUPE sengaja
 * dibalik dari saveDraft: dedupe dicek DULU — tulisan yang isinya identik
 * dengan record tersimpan adalah no-op (tidak menghancurkan apa pun) dan
 * sukses-dedupe justru memajukan baseline pemanggil ke updatedAt terbaru
 * (self-heal); hanya tulisan yang BENAR-BENAR mengubah isi yang bisa
 * konflik. Tanpa ini, autosave tab basi atas konten yang sudah sama akan
 * menembak konflik palsu di tiap perubahan pesan.
 */
export function saveIntakeContext(
  projectId: string,
  ctx: UniversalIntakeContext,
  meta?: { generatedDraftId?: string | null; generatedAt?: string | null },
  opts?: { expectedUpdatedAt?: string | null },
): SaveDraftResult {
  if (!projectId) {
    return { ok: false, error: 'DRAFT_PERSISTENCE_FAILED', message: 'projectId kosong — konteks intake tidak disimpan.' };
  }
  // F-ISO-3 (Phase 2, 2026-11-23) — pertahanan berlapis isolasi
  // lintas-proyek: konteks yang tercap proyek lain TIDAK BOLEH tersimpan
  // di bawah kunci ini. Satu pemanggil yang tidak disiplin (efek simpan
  // view sebelum F-ISO-1) pernah menulis konteks A di bawah kunci B;
  // lapisan ini mencegah SEMUA pemanggil — kini dan masa depan —
  // mengulangi kesalahan yang sama. Konteks tanpa cap proyek (jalur
  // lama / tes / pra-ARS-06) tetap diterima.
  if (ctx.projectId && ctx.projectId !== projectId) {
    return { ok: false, error: 'DRAFT_PERSISTENCE_FAILED', message: `Konteks intake milik proyek ${ctx.projectId} — tidak disimpan di bawah proyek ${projectId} (isolasi lintas-proyek).` };
  }
  const read = readIntakeMap();
  if (!read.ok) return read;
  const serialized = serializeUniversalIntakeContext(ctx);
  const existing = read.map[projectId] ?? null;
  // REFIX Stage 3 — dedupe berbasis ISI (abaikan stempel derivasi spek):
  // tanpa ini dedupe tidak pernah cocok untuk konteks berspesifikasi
  // (lihat intakeContextContentKey di atas).
  const contextSame =
    !!existing && intakeContextContentKey(existing.context) === intakeContextContentKey(serialized);
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
  // S3-A — guard optimistic concurrency (sesudah dedupe, lihat dok
  // fungsi): tulisan basi yang benar-benar mengubah isi ditolak.
  if (existing && opts?.expectedUpdatedAt != null && existing.updatedAt !== opts.expectedUpdatedAt) {
    return {
      ok: false,
      error: 'INTAKE_VERSION_CONFLICT',
      message: 'Snapshot intake sudah ditulis sesi/tab lain sesudah terakhir Anda baca — penulisan basi ditolak agar tidak menimpa jawaban yang lebih baru.',
    };
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
  // F-ISO-3 (Phase 2, 2026-11-23): snapshot yang tercap proyek lain
  // (tertulis sebelum validasi simpan ada — lihat F-ISO-1) diperlakukan
  // sebagai record korup: fail-closed, JANGAN pernah dimuat lalu
  // "dilaundering" oleh restore menjadi konteks proyek ini. Snapshot
  // lama tanpa cap proyek tetap terbaca (kompatibilitas pra-ARS-06).
  if (ctx.projectId && ctx.projectId !== projectId) {
    return {
      ok: false,
      error: 'DRAFT_PERSISTENCE_FAILED',
      message: `Snapshot konteks intake milik proyek ${ctx.projectId} — tidak dimuat untuk proyek ${projectId} (isolasi lintas-proyek).`,
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

/**
 * Hapus snapshot konteks intake proyek (mis. intake selesai digantikan draft).
 * S3-A (2026-11-23): bila `expectedUpdatedAt` terisi, hapus HANYA bila record
 * saat ini masih versi itu — tab basi tidak boleh menghapus snapshot yang
 * lebih baru dari tab lain (stale delete). Mengembalikan true bila sebuah
 * record terhapus; false bila tidak ada record, peta tak terbaca, atau
 * penghapusan DITAHAN karena versi sudah berubah (pemanggil membedakan
 * "ditahan" dari "tidak ada" lewat peek sebelum memanggil).
 */
export function clearIntakeContext(projectId: string, expectedUpdatedAt?: string | null): boolean {
  const read = readIntakeMap();
  if (!read.ok || !read.map[projectId]) return false;
  if (expectedUpdatedAt != null && read.map[projectId].updatedAt !== expectedUpdatedAt) return false;
  const next = { ...read.map };
  delete next[projectId];
  saveVersioned(AI_INTAKE_STORAGE_KEY, next);
  return true;
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

/* ------------------------------------------------------------------ */
/* State RUMAH (W11 §11, celah S1-4) — RabNeeds + RabIntentSpec +     */
/* pendingChoice. Sebelum W11 hanya draft universal + intake universal */
/* yang dipersistensi; ketiga state jalur rumah ini hilang saat        */
/* reload (singleton in-memory di actionRegistry/rabIntentFlow).       */
/* Mekanisme yang SAMA dengan snapshot intake di atas (hardenedStorage */
/* envelope v2, kunci namespace saudara, peta projectId → record,      */
/* idempoten isi-sama-tanpa-tulis-ulang, fail-closed skema tak         */
/* dikenal).                                                           */
/*                                                                     */
/* PILIHAN SERIALISASI pendingChoice: `match` (TypedTemplateMatch)     */
/* TIDAK disimpan — ia membawa objek template registry (bukan data     */
/* JSON murni). Yang disimpan adalah rawText + needs + floors + spec;  */
/* `match` dibangun ulang deterministik dari rawText lewat              */
/* findDirectTemplate saat load. Bila rebuild gagal (registry berubah  */
/* / rawText tak lagi cocok), kartu dibuang JUJUR                      */
/* (pendingChoiceDropped) sementara kebutuhan + spek tetap dipulihkan. */
/* `needs` tersimpan adalah kebutuhan TERKOREKSI (bukan needs asal     */
/* match) — perilaku kartu (GENERATE_RAB_TEMPLATE + continueRabChoice) */
/* memakai p.needs, bukan match.needs.                                 */
/*                                                                     */
/* lastRabRaw (teks mentah untuk prompt desain) SENGAJA tidak ikut:    */
/* ia hanya dipakai getLastRabDesignPrompt dan dapat dibangun ulang    */
/* dari needs — kehilangan teks mentah pasca-reload adalah degradasi   */
/* yang diterima, bukan kehilangan state perilaku.                     */
/* ------------------------------------------------------------------ */

export const AI_HOME_STATE_STORAGE_KEY = 'ezrab_prod_ai_home_state';

/** Versi skema payload record state rumah. */
export const HOME_STATE_SCHEMA_VERSION = 1;

/** Bentuk TERSIMPAN kartu pilihan — TANPA `match` (lihat kepala seksi). */
export interface PersistedPendingChoice {
  rawText: string;
  needs: RabNeeds;
  floors: number;
  floorsMentioned: boolean;
  landAreaM2: number | null;
  spec: RabIntentSpec | null;
}

export interface PersistedHomeStateRecord {
  schemaVersion: number;
  updatedAt: string;
  needs: RabNeeds | null;
  intentSpec: RabIntentSpec | null;
  pendingChoice: PersistedPendingChoice | null;
}

export interface HomeStateInput {
  needs: RabNeeds | null;
  intentSpec: RabIntentSpec | null;
  pendingChoice: PendingRabChoice | null;
}

export interface LoadedHomeState {
  needs: RabNeeds | null;
  intentSpec: RabIntentSpec | null;
  /** Kartu pilihan yang berhasil dibangun ulang (null bila tidak ada
   *  kartu tersimpan ATAU match-nya tidak dapat dibangun ulang). */
  pendingChoice: PendingRabChoice | null;
  /** True bila record MEMBAWA kartu tetapi match-nya gagal dibangun
   *  ulang dari rawText — kartu dibuang jujur, kebutuhan + spek tetap
   *  dipulihkan. */
  pendingChoiceDropped: boolean;
}

export type LoadHomeStateResult =
  | { ok: true; state: LoadedHomeState; updatedAt: string }
  | { ok: false; error: DraftPersistenceErrorCode; message: string };

type HomeStateMap = Record<string, PersistedHomeStateRecord>;

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function readHomeStateMap(): { ok: true; map: HomeStateMap } | { ok: false; error: DraftPersistenceErrorCode; message: string } {
  const res = loadVersioned<HomeStateMap>(AI_HOME_STATE_STORAGE_KEY);
  if (!res.ok) {
    if (res.error === 'NOT_FOUND') return { ok: true, map: {} };
    return { ok: false, error: 'DRAFT_PERSISTENCE_FAILED', message: `State rumah tidak dapat dibaca (${res.error}).` };
  }
  if (!res.data || typeof res.data !== 'object' || Array.isArray(res.data)) {
    return { ok: false, error: 'DRAFT_PERSISTENCE_FAILED', message: 'State rumah rusak (bukan peta proyek).' };
  }
  return { ok: true, map: res.data };
}

/**
 * Simpan state rumah proyek (idempoten: isi sama → tanpa tulis ulang).
 * Dipanggil efek persistensi view pada tiap perubahan pesan — termasuk
 * saat ketiganya null (record all-null MENIMPA record basi sehingga
 * kartu yang sudah dikonsumsi tidak bangkit lagi sesudah reload).
 * S3-A (2026-11-23): guard `expectedUpdatedAt` yang sama dengan
 * saveIntakeContext (termasuk urutan dedupe-dulu — lihat dok di sana);
 * konflik → HOME_STATE_VERSION_CONFLICT.
 */
export function saveHomeState(
  projectId: string,
  input: HomeStateInput,
  opts?: { expectedUpdatedAt?: string | null },
): SaveDraftResult {
  if (!projectId) {
    return { ok: false, error: 'DRAFT_PERSISTENCE_FAILED', message: 'projectId kosong — state rumah tidak disimpan.' };
  }
  const read = readHomeStateMap();
  if (!read.ok) return read;
  const record: PersistedHomeStateRecord = {
    schemaVersion: HOME_STATE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    needs: input.needs,
    intentSpec: input.intentSpec,
    pendingChoice: input.pendingChoice
      ? {
          rawText: input.pendingChoice.rawText,
          needs: input.pendingChoice.needs,
          floors: input.pendingChoice.floors,
          floorsMentioned: input.pendingChoice.floorsMentioned,
          landAreaM2: input.pendingChoice.landAreaM2,
          spec: input.pendingChoice.spec,
        }
      : null,
  };
  const existing = read.map[projectId] ?? null;
  if (
    existing &&
    JSON.stringify(existing.needs) === JSON.stringify(record.needs) &&
    JSON.stringify(existing.intentSpec) === JSON.stringify(record.intentSpec) &&
    JSON.stringify(existing.pendingChoice) === JSON.stringify(record.pendingChoice)
  ) {
    return { ok: true, updatedAt: existing.updatedAt, deduplicated: true };
  }
  // S3-A — guard optimistic concurrency (sesudah dedupe, alasan yang
  // sama dengan saveIntakeContext).
  if (existing && opts?.expectedUpdatedAt != null && existing.updatedAt !== opts.expectedUpdatedAt) {
    return {
      ok: false,
      error: 'HOME_STATE_VERSION_CONFLICT',
      message: 'State rumah sudah ditulis sesi/tab lain sesudah terakhir Anda baca — penulisan basi ditolak agar tidak menimpa state yang lebih baru.',
    };
  }
  const saved = saveVersioned(AI_HOME_STATE_STORAGE_KEY, { ...read.map, [projectId]: record });
  if (!saved.ok) {
    const mapped = storageError(saved.error, saved.message);
    return { ok: false, error: mapped.error, message: mapped.message };
  }
  return { ok: true, updatedAt: record.updatedAt, deduplicated: false };
}

/**
 * Muat state rumah proyek dari storage dingin (fail-closed skema).
 * `match` kartu dibangun ulang dari rawText; kegagalan rebuild
 * membuang kartu saja (pendingChoiceDropped), bukan seluruh state.
 * Bentuk field yang rusak (bukan objek) diperlakukan sebagai tidak ada
 * — tidak pernah ditebak.
 */
export function loadHomeState(projectId: string): LoadHomeStateResult {
  const read = readHomeStateMap();
  if (!read.ok) return read;
  const record = read.map[projectId];
  if (!record) {
    return { ok: false, error: 'DRAFT_NOT_FOUND', message: `Tidak ada state rumah tersimpan untuk proyek ${projectId}.` };
  }
  if (typeof record.schemaVersion !== 'number' || record.schemaVersion !== HOME_STATE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: 'DRAFT_SCHEMA_UNSUPPORTED',
      message: `Skema record state rumah v${String(record.schemaVersion)} tidak didukung (didukung: v${HOME_STATE_SCHEMA_VERSION}) — state tidak ditebak/dimigrasi.`,
    };
  }
  const needs = isPlainRecord(record.needs) ? (record.needs as RabNeeds) : null;
  const intentSpec = isPlainRecord(record.intentSpec) ? (record.intentSpec as RabIntentSpec) : null;
  let pendingChoice: PendingRabChoice | null = null;
  let pendingChoiceDropped = false;
  const stored = record.pendingChoice;
  if (isPlainRecord(stored)) {
    const rawText = stored.rawText;
    const storedNeeds = stored.needs;
    const floors = stored.floors;
    if (typeof rawText === 'string' && rawText && isPlainRecord(storedNeeds) && typeof floors === 'number') {
      const match = findDirectTemplate(rawText);
      if (match) {
        pendingChoice = {
          rawText,
          match,
          needs: storedNeeds as RabNeeds,
          floors,
          floorsMentioned: stored.floorsMentioned === true,
          landAreaM2: typeof stored.landAreaM2 === 'number' ? stored.landAreaM2 : null,
          spec: isPlainRecord(stored.spec) ? (stored.spec as RabIntentSpec) : null,
        };
      } else {
        pendingChoiceDropped = true;
      }
    } else {
      pendingChoiceDropped = true;
    }
  }
  return {
    ok: true,
    state: { needs, intentSpec, pendingChoice, pendingChoiceDropped },
    updatedAt: record.updatedAt,
  };
}

/**
 * Hapus record state rumah proyek. S3-A (2026-11-23): semantik yang sama
 * dengan clearIntakeContext — `expectedUpdatedAt` terisi = hapus hanya
 * bila versi cocok; true bila terhapus, false bila tidak ada / ditahan.
 */
export function clearHomeState(projectId: string, expectedUpdatedAt?: string | null): boolean {
  const read = readHomeStateMap();
  if (!read.ok || !read.map[projectId]) return false;
  if (expectedUpdatedAt != null && read.map[projectId].updatedAt !== expectedUpdatedAt) return false;
  const next = { ...read.map };
  delete next[projectId];
  saveVersioned(AI_HOME_STATE_STORAGE_KEY, next);
  return true;
}

/** Baca record mentah state rumah (audit/tes) — null bila tidak ada. */
export function peekHomeState(projectId: string): PersistedHomeStateRecord | null {
  const read = readHomeStateMap();
  if (!read.ok) return null;
  return read.map[projectId] ?? null;
}
