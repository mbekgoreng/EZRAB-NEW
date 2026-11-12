/**
 * memory.ts — PERMANENT MEMORY FOUNDATION (AI Intelligence Overhaul
 * Fase 2, direktif owner 2026-11-12 Part 4 + Part 15 Fase 2).
 *
 * Fondasi memori terstruktur 6 lapis di atas pola yang ADA — amplop
 * berversi + kunci saudara di `draftPersistence.ts` (hardenedStorage
 * envelope v2), fail-closed, TANPA store kedua yang menyaingi:
 *   - working:      konteks intake + executionRuntime (BUKAN di sini —
 *                   modul ini tidak menduplikasi keduanya).
 *   - conversation: ringkasan Fase 1 + memori percakapan (per
 *                   conversationId, dari pesan & hasil tool).
 *   - project:      di atas structuredSpecs/draft/intake yang ada
 *                   (spek terkonfirmasi, keputusan proyek).
 *   - preference:   BARU — store preferensi eksplisit pengguna.
 *   - long-term:    BARU — hanya lewat ekstraksi/konsolidasi, bukan
 *                   menyimpan semua pesan.
 *   - knowledge:    indeks ke referensi resmi (AHSP/dokumen yang sudah
 *                   ada) — provenans wajib; asumsi pengguna TIDAK PERNAH
 *                   disamakan dengan referensi resmi.
 *
 * KEJUJURAN ARSITEKTUR (Part 4.5 — PALING PENTING): semua yang ada di
 * sini adalah localStorage SATU PERANGKAT, SATU BROWSER, TANPA IDENTITAS
 * (AUTH_ENABLED=false; userId null → 'anonymous'). Ini BUKAN memori
 * permanen lintas-perangkat. Label jujur itu ada di kode, UI, tes, dan
 * laporan Fase 2 — dan proposal server (migrasi + RLS + job store)
 * disiapkan terpisah di `supabase/migrations/
 * 20261112_ai_memory_foundation.sql` (diuji lokal saja, TIDAK diterapkan
 * ke mana pun). Klaim lintas-perangkat HANYA boleh dibuat sesudah
 * identitas + RLS + migrasi itu aktif dan terverifikasi live.
 *
 * Aturan keras modul ini:
 *  - Jangan simpan kredensial/token/secret apa pun (penjaga pola
 *    menolak penulisan; lihat SECRET_PATTERNS).
 *  - Jangan inferensi atribut personal sensitif (usia, gender, agama,
 *    kesehatan, dsb.). Preferensi HANYA yang eksplisit & berguna:
 *    bahasa, presentasi RAB, gaya workflow, level detail.
 *  - Jangan mengarang memori: ekstraksi deterministik atas pola
 *    eksplisit; teks yang tidak cocok pola → TIDAK ADA kandidat.
 *  - Isolasi: retrieval TIDAK PERNAH melewati batas userId+projectId.
 *    Tanpa identitas, skop = anon + projectId (MEM-08 BLOCKED).
 *  - Konflik TIDAK PERNAH dipilih diam-diam: penggantian eksplisit
 *    → baru current, lama superseded (histori dipertahankan); bila
 *    penggantian tidak jelas → kandidat berstatus 'contradictory',
 *    yang lama tetap current, konflik ditandai untuk ditanyakan.
 *  - Penghapusan menyebar: record dihapus + turunannya (derivedFrom)
 *    + indeks retrieval dibangun ulang dari store tiap baca — jadi
 *    memori yang dihapus TIDAK BISA muncul lagi lewat indeks basi.
 *    Ringkasan percakapan bersifat ekstraktif dari PESAN, bukan dari
 *    memori: fakta yang sumber pesannya masih ada dapat tetap muncul
 *    lewat riwayat/ringkasan — penghapusan penuh sumbernya adalah
 *    hapus percakapan (deleteConversation memanggil purge di sini).
 */

import { loadVersioned, saveVersioned } from '../../engine/storage/hardenedStorage';
import { tokenize } from './canonicalContext';
import type { StructuredSpec } from './structuredSpec';

/* ------------------------------------------------------------------ */
/* Tipe (direktif Part 4.2 — medan record)                             */
/* ------------------------------------------------------------------ */

export type MemoryLayer =
  | 'working'
  | 'conversation'
  | 'project'
  | 'preference'
  | 'long-term'
  | 'knowledge';

/** Klasifikasi kualitas Part 4.3. */
export type MemoryQuality =
  | 'confirmed-fact'
  | 'user-assumption'
  | 'ai-suggestion'
  | 'unverified-external'
  | 'official-reference'
  | 'superseded'
  | 'contradictory'
  | 'temporary-working-state';

export type MemoryType =
  | 'fact'
  | 'decision'
  | 'correction'
  | 'preference'
  | 'spec'
  | 'task-result'
  | 'reference';

export type MemoryStatus = 'current' | 'superseded' | 'contradictory';

export type MemorySourceType =
  | 'user-message'
  | 'user-correction'
  | 'structured-spec'
  | 'tool-result'
  | 'draft'
  | 'official-reference'
  | 'system-consolidation';

export interface MemoryRecord {
  memoryId: string;
  /** null hari ini (tanpa identitas) — skop anon; JANGAN dikarang. */
  userId: string | null;
  /** null hanya untuk preferensi tingkat pengguna (lintas proyek). */
  projectId: string | null;
  conversationId: string | null;
  /** Kunci identitas stabil untuk deteksi konflik, mis. 'spec:roof_material'. */
  memoryKey: string;
  layer: MemoryLayer;
  memoryType: MemoryType;
  content: string;
  structuredPayload: Record<string, unknown>;
  sourceMessageId: string | null;
  sourceType: MemorySourceType;
  /** Provenans yang dapat dibaca manusia, mis. 'pesan pengguna 2026-11-12' */
  provenance: string;
  quality: MemoryQuality;
  /** 0..1 — keyakinan ekstraksi/konfirmasi (aturan deterministik). */
  confidence: number;
  /** 1 rendah · 2 sedang · 3 tinggi — memengaruhi ranking retrieval. */
  importance: 1 | 2 | 3;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
  /** 'session' | 'project-lifetime' | 'until-changed' | 'official-version' | 'days:N' */
  expirationPolicy: string;
  version: number;
  status: MemoryStatus;
  /** memoryId record yang digantikan record ini (bila koreksi). */
  supersedes: string | null;
  /** memoryId record current yang bertentangan dengan kandidat ini. */
  conflictOf: string | null;
}

export interface MemoryScope {
  userId: string | null;
  projectId: string | null;
  conversationId?: string | null;
}

/* ------------------------------------------------------------------ */
/* Konstanta penyimpanan & retensi                                      */
/* ------------------------------------------------------------------ */

export const AI_MEMORY_STORAGE_KEY = 'ezrab_prod_ai_memories';
export const AI_PREFERENCE_STORAGE_KEY = 'ezrab_prod_ai_preferences';
/** Versi skema payload record memori — TERPISAH dari envelope storage v2. */
export const MEMORY_SCHEMA_VERSION = 1;
/** Cap retrieval eksplisit (sejajar CANONICAL_MAX_RETRIEVED_MESSAGES). */
export const MEMORY_MAX_RETRIEVED = 12;
/** Cap per lapis dalam satu retrieval. */
export const MEMORY_MAX_PER_LAYER = 4;
/** Cap seksi MEMORI di blok data kanonis (karakter). */
export const MEMORY_SECTION_BUDGET = 1_500;

/**
 * Kebijakan retensi eksplisit per lapis (Part 4 — versioning/retensi):
 * working tidak pernah dipersist (hidup di intake/executionRuntime);
 * conversation 90 hari; project seumur proyek; preferensi sampai diubah;
 * long-term 365 hari; knowledge terikat versi sumber resmi.
 */
export const MEMORY_RETENTION: Record<MemoryLayer, string> = {
  working: 'session',
  conversation: 'days:90',
  project: 'project-lifetime',
  preference: 'until-changed',
  'long-term': 'days:365',
  knowledge: 'official-version',
};

/** Urutan retrieval direktif Part 4.6 (task kini & ringkasan & pesan
 *  mentah ditangani builder kanonis; di sini urutan lapis memori). */
export const MEMORY_RETRIEVAL_LAYER_ORDER: MemoryLayer[] = [
  'project',
  'preference',
  'long-term',
  'knowledge',
  'conversation',
];

/* ------------------------------------------------------------------ */
/* Penjaga secret — kredensial/token TIDAK PERNAH masuk memori          */
/* ------------------------------------------------------------------ */

export const SECRET_PATTERNS: RegExp[] = [
  /api[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /\bpassword\b|\bsandi\b/i,
  /\bsecret\b/i,
  /sk-[A-Za-z0-9]{8,}/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

export function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

/* ------------------------------------------------------------------ */
/* Store (hardenedStorage — pola yang sama dengan draftPersistence)     */
/* ------------------------------------------------------------------ */

export type MemoryStoreErrorCode =
  | 'MEMORY_PERSISTENCE_FAILED'
  | 'MEMORY_SCHEMA_UNSUPPORTED'
  | 'MEMORY_SECRET_REJECTED'
  | 'MEMORY_SCOPE_INVALID'
  | 'MEMORY_NOT_FOUND';

export type MemoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: MemoryStoreErrorCode; message: string };

type MemoryMap = Record<string, MemoryRecord>;

function readMap(): MemoryResult<MemoryMap> {
  const res = loadVersioned<MemoryMap>(AI_MEMORY_STORAGE_KEY);
  if (!res.ok) {
    if (res.error === 'NOT_FOUND') return { ok: true, value: {} };
    return { ok: false, error: 'MEMORY_PERSISTENCE_FAILED', message: `Record memori tidak dapat dibaca (${res.error}).` };
  }
  if (!res.data || typeof res.data !== 'object' || Array.isArray(res.data)) {
    return { ok: false, error: 'MEMORY_PERSISTENCE_FAILED', message: 'Record memori rusak (bukan peta memoryId).' };
  }
  return { ok: true, value: res.data };
}

function writeMap(map: MemoryMap): MemoryResult<void> {
  const saved = saveVersioned(AI_MEMORY_STORAGE_KEY, map);
  if (!saved.ok) {
    return { ok: false, error: 'MEMORY_PERSISTENCE_FAILED', message: `Record memori gagal disimpan (${saved.error}).` };
  }
  return { ok: true, value: undefined };
}

function newMemoryId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return `mem-${c.randomUUID()}`;
  return `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeScope(scope: MemoryScope): { userId: string | null; projectId: string | null; conversationId: string | null } {
  return {
    userId: scope.userId ?? null,
    projectId: scope.projectId ?? null,
    conversationId: scope.conversationId ?? null,
  };
}

function scopeMatches(rec: MemoryRecord, scope: MemoryScope): boolean {
  const s = normalizeScope(scope);
  if ((rec.userId ?? null) !== s.userId) return false;
  // Preferensi tingkat pengguna (projectId null) berlaku lintas proyek
  // pengguna yang sama; record proyek wajib cocok projectId-nya.
  if (rec.layer === 'preference' && rec.projectId === null) return true;
  if ((rec.projectId ?? null) !== s.projectId) return false;
  if (rec.layer === 'conversation' && s.conversationId) {
    return (rec.conversationId ?? null) === s.conversationId;
  }
  return true;
}

export function validateMemoryRecord(rec: MemoryRecord): string | null {
  if (!rec.memoryId || !rec.memoryKey || !rec.content) return 'memoryId/memoryKey/content wajib ada.';
  if (!rec.layer || !rec.memoryType || !rec.quality) return 'layer/memoryType/quality wajib ada.';
  if (containsSecret(rec.content)) return 'Konten mengandung pola kredensial/token — ditolak (secret tidak pernah disimpan di memori).';
  if (containsSecret(JSON.stringify(rec.structuredPayload ?? {}))) return 'structuredPayload mengandung pola kredensial/token — ditolak.';
  if (rec.confidence < 0 || rec.confidence > 1) return 'confidence harus 0..1.';
  return null;
}

/** Buat record baru (validasi + secret guard; belum persist). */
export function createMemoryRecord(
  input: Omit<MemoryRecord, 'memoryId' | 'createdAt' | 'updatedAt' | 'lastAccessedAt' | 'version' | 'status' | 'supersedes' | 'conflictOf' | 'expirationPolicy'> &
    Partial<Pick<MemoryRecord, 'expirationPolicy' | 'supersedes' | 'conflictOf'>>,
  now: string = new Date().toISOString(),
): MemoryResult<MemoryRecord> {
  const rec: MemoryRecord = {
    ...input,
    memoryId: newMemoryId(),
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
    expirationPolicy: input.expirationPolicy ?? MEMORY_RETENTION[input.layer],
    version: 1,
    status: 'current',
    supersedes: input.supersedes ?? null,
    conflictOf: input.conflictOf ?? null,
  };
  const err = validateMemoryRecord(rec);
  if (err) {
    return { ok: false, error: err.includes('kredensial') ? 'MEMORY_SECRET_REJECTED' : 'MEMORY_SCOPE_INVALID', message: err };
  }
  return { ok: true, value: rec };
}

/**
 * Simpan satu record (upsert dengan penjaga versi sederhana: record
 * dengan memoryId sama & versi lebih baru tidak ditimpa versi lama).
 */
export function saveMemory(rec: MemoryRecord): MemoryResult<MemoryRecord> {
  const err = validateMemoryRecord(rec);
  if (err) {
    return { ok: false, error: err.includes('kredensial') ? 'MEMORY_SECRET_REJECTED' : 'MEMORY_SCOPE_INVALID', message: err };
  }
  const read = readMap();
  if (!read.ok) return read;
  const existing = read.value[rec.memoryId];
  if (existing && existing.version > rec.version) {
    return { ok: false, error: 'MEMORY_PERSISTENCE_FAILED', message: `Record memori ${rec.memoryId} tersimpan lebih baru (v${existing.version}) — penulisan basi ditolak.` };
  }
  const next = { ...read.value, [rec.memoryId]: rec };
  const written = writeMap(next);
  if (!written.ok) return written;
  return { ok: true, value: rec };
}

/** Daftar record dalam skop (hanya status yang diminta; default current + contradictory). */
export function listMemories(
  scope: MemoryScope,
  opts: { statuses?: MemoryStatus[]; layer?: MemoryLayer; limit?: number } = {},
): MemoryResult<MemoryRecord[]> {
  const read = readMap();
  if (!read.ok) return read;
  const statuses = opts.statuses ?? ['current', 'contradictory'];
  const out = Object.values(read.value)
    .filter((r) => scopeMatches(r, scope))
    .filter((r) => statuses.includes(r.status))
    .filter((r) => (opts.layer ? r.layer === opts.layer : true))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt));
  return { ok: true, value: opts.limit ? out.slice(0, opts.limit) : out };
}

/** Ambil record current untuk satu memoryKey dalam skop (null bila tak ada). */
export function getCurrentMemory(scope: MemoryScope, memoryKey: string): MemoryRecord | null {
  const list = listMemories(scope, { statuses: ['current'] });
  if (!list.ok) return null;
  return list.value.find((r) => r.memoryKey === memoryKey) ?? null;
}

/* ------------------------------------------------------------------ */
/* Resolusi konflik (Part 4.4)                                         */
/* ------------------------------------------------------------------ */

export type ConflictResolution =
  | { kind: 'no-conflict'; stored: MemoryRecord }
  | { kind: 'superseded'; stored: MemoryRecord; superseded: MemoryRecord }
  | { kind: 'contradiction-flagged'; stored: MemoryRecord; keptCurrent: MemoryRecord };

function valuesDiffer(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): string =>
    String(v ?? '').toLowerCase().replace(/[\s.,_-]+/g, ' ').trim();
  return norm(a) !== norm(b);
}

/**
 * Simpan kandidat dengan resolusi konflik. Nilai baru menjadi current
 * HANYA bila eksplisit menggantikan (sourceType 'user-correction'
 * atau payload.explicitReplacement === true); bila tidak jelas,
 * kandidat disimpan berstatus 'contradictory' dan yang lama TETAP
 * current — konflik ditandai untuk ditanyakan ke pengguna, bukan
 * dipilih diam-diam. Koreksi eksplisit pengguna menang atas asumsi lama.
 */
export function storeMemoryWithConflictResolution(
  candidate: MemoryRecord,
  scope: MemoryScope,
): MemoryResult<ConflictResolution> {
  const read = readMap();
  if (!read.ok) return read;
  const existing = Object.values(read.value).find(
    (r) =>
      r.status === 'current' &&
      r.memoryKey === candidate.memoryKey &&
      (r.userId ?? null) === (scope.userId ?? null) &&
      // Preferensi lintas proyek: kunci preferensi dibandingkan
      // per pengguna; kunci proyek dibandingkan per proyek.
      (candidate.layer === 'preference' && candidate.projectId === null
        ? (r.layer === 'preference' && r.projectId === null)
        : (r.projectId ?? null) === (scope.projectId ?? null)),
  );
  if (!existing) {
    const saved = saveMemory(candidate);
    if (!saved.ok) return saved;
    return { ok: true, value: { kind: 'no-conflict', stored: candidate } };
  }
  const oldValue = (existing.structuredPayload as Record<string, unknown>).value ?? existing.content;
  const newValue = (candidate.structuredPayload as Record<string, unknown>).value ?? candidate.content;
  if (!valuesDiffer(oldValue, newValue)) {
    // Nilai sama: bukan konflik — segarkan lastAccessedAt yang lama.
    const touched: MemoryRecord = { ...existing, lastAccessedAt: new Date().toISOString() };
    const saved = saveMemory(touched);
    if (!saved.ok) return saved;
    return { ok: true, value: { kind: 'no-conflict', stored: touched } };
  }
  const explicit =
    candidate.sourceType === 'user-correction' ||
    (candidate.structuredPayload as Record<string, unknown>).explicitReplacement === true;
  const next = { ...read.value };
  if (explicit) {
    const superseded: MemoryRecord = {
      ...existing,
      status: 'superseded',
      quality: 'superseded',
      updatedAt: new Date().toISOString(),
    };
    const stored: MemoryRecord = {
      ...candidate,
      supersedes: existing.memoryId,
      conflictOf: null,
      version: existing.version + 1,
    };
    next[existing.memoryId] = superseded;
    next[stored.memoryId] = stored;
    const written = writeMap(next);
    if (!written.ok) return written;
    return { ok: true, value: { kind: 'superseded', stored, superseded } };
  }
  // Penggantian tidak jelas → tandai konflik, jangan pilih diam-diam.
  const flagged: MemoryRecord = {
    ...candidate,
    status: 'contradictory',
    quality: 'contradictory',
    conflictOf: existing.memoryId,
  };
  next[flagged.memoryId] = flagged;
  const written = writeMap(next);
  if (!written.ok) return written;
  return { ok: true, value: { kind: 'contradiction-flagged', stored: flagged, keptCurrent: existing } };
}

/* ------------------------------------------------------------------ */
/* Koreksi & penghapusan (kontrol pengguna)                             */
/* ------------------------------------------------------------------ */

/**
 * Koreksi eksplisit pengguna atas satu memori: record lama menjadi
 * superseded (histori dipertahankan), record baru menjadi current.
 */
export function correctMemory(
  memoryId: string,
  newContent: string,
  scope: MemoryScope,
): MemoryResult<MemoryRecord> {
  if (containsSecret(newContent)) {
    return { ok: false, error: 'MEMORY_SECRET_REJECTED', message: 'Koreksi mengandung pola kredensial/token — ditolak.' };
  }
  const read = readMap();
  if (!read.ok) return read;
  const old = read.value[memoryId];
  if (!old || !scopeMatches(old, scope)) {
    return { ok: false, error: 'MEMORY_NOT_FOUND', message: `Memori ${memoryId} tidak ditemukan dalam skop ini.` };
  }
  const now = new Date().toISOString();
  const superseded: MemoryRecord = { ...old, status: 'superseded', quality: 'superseded', updatedAt: now };
  const created = createMemoryRecord(
    {
      userId: old.userId,
      projectId: old.projectId,
      conversationId: old.conversationId,
      memoryKey: old.memoryKey,
      layer: old.layer,
      memoryType: 'correction',
      content: newContent,
      structuredPayload: { ...old.structuredPayload, value: newContent, correctedFrom: old.content },
      sourceMessageId: null,
      sourceType: 'user-correction',
      provenance: 'koreksi eksplisit pengguna (panel Memori)',
      quality: 'confirmed-fact',
      confidence: 1,
      importance: old.importance,
      expirationPolicy: old.expirationPolicy,
    },
    now,
  );
  if (!created.ok) return created;
  const stored: MemoryRecord = { ...created.value, supersedes: old.memoryId, version: old.version + 1 };
  const next = { ...read.value, [old.memoryId]: superseded, [stored.memoryId]: stored };
  const written = writeMap(next);
  if (!written.ok) return written;
  // Koreksi eksplisit = pernyataan ulang pengguna → hapus tombstone kunci ini.
  clearMemoryTombstone({ userId: old.userId, projectId: old.projectId }, old.memoryKey);
  return { ok: true, value: stored };
}

/**
 * Hapus satu memori + turunannya (record yang derivedFrom-nya record
 * ini). Penghapusan adalah HARD DELETE dari store; indeks retrieval
 * dibangun ulang dari store tiap baca sehingga record yang dihapus
 * tidak bisa muncul lagi lewat indeks basi. Catatan jujur: ringkasan
 * percakapan ekstraktif berasal dari PESAN — bila sumber pesannya
 * masih ada, fakta itu masih bisa muncul lewat riwayat/ringkasan;
 * penghapusan penuh sumbernya adalah hapus percakapan.
 */
export function deleteMemory(memoryId: string, scope: MemoryScope): MemoryResult<{ deleted: number }> {
  const read = readMap();
  if (!read.ok) return read;
  const target = read.value[memoryId];
  if (!target || !scopeMatches(target, scope)) {
    return { ok: false, error: 'MEMORY_NOT_FOUND', message: `Memori ${memoryId} tidak ditemukan dalam skop ini.` };
  }
  const next = { ...read.value };
  let deleted = 0;
  const remove = (id: string): void => {
    if (next[id]) {
      delete next[id];
      deleted++;
    }
  };
  remove(memoryId);
  for (const rec of Object.values(next)) {
    if ((rec.structuredPayload as Record<string, unknown>).derivedFrom === memoryId) {
      remove(rec.memoryId);
    }
  }
  const written = writeMap(next);
  if (!written.ok) return written;
  // Tombstone: hapus eksplisit pengguna menandai kunci ini "dilupakan".
  // Ingest OTOMATIS (structured-spec / turunan sistem / draft) dengan
  // kunci yang sama diblokir sampai pengguna menyatakan ulang secara
  // eksplisit — tanpa ini, kirim LLM berikutnya menurunkan ulang spek
  // yang sama dari konteks intake dan memori yang dihapus "bangkit".
  recordMemoryTombstone(
    { userId: target.userId, projectId: target.projectId },
    target.memoryKey,
    memoryId,
  );
  return { ok: true, value: { deleted } };
}

/* ------------------------------------------------------------------ */
/* Tombstone penghapusan (MEM-10 — anti-bangkit)                       */
/* ------------------------------------------------------------------ */

/**
 * Penanda "kunci ini sengaja dihapus pengguna" — menyimpan HANYA
 * (userId, projectId, memoryKey, waktu hapus), BUKAN isi memori.
 * Tanpa tombstone, pipeline tulis otomatis (ekstraksi spek v2 di tiap
 * kirim LLM) akan membuat ulang record yang sama persis dari sumber
 * yang masih hidup (konteks intake) — penghapusan pengguna jadi sia-sia.
 * Tombstone HANYA memblokir sumber OTOMATIS; pernyataan eksplisit
 * pengguna (pesan/koreksi baru) selalu menang dan menghapus tombstone.
 */
export const AI_MEMORY_TOMBSTONE_KEY = 'ezrab_prod_ai_memory_tombstones';

export interface MemoryTombstone {
  userId: string | null;
  projectId: string | null;
  memoryKey: string;
  deletedMemoryId: string;
  deletedAt: string;
}

type TombstoneMap = Record<string, MemoryTombstone>;

function tombstoneKey(userId: string | null, projectId: string | null, memoryKey: string): string {
  return `${userId ?? 'anon'}|${projectId ?? ''}|${memoryKey}`;
}

function readTombstones(): TombstoneMap {
  const res = loadVersioned<TombstoneMap>(AI_MEMORY_TOMBSTONE_KEY);
  if (!res.ok) return {};
  if (!res.data || typeof res.data !== 'object' || Array.isArray(res.data)) return {};
  return res.data;
}

export function getMemoryTombstone(scope: MemoryScope, memoryKey: string): MemoryTombstone | null {
  return readTombstones()[tombstoneKey(scope.userId ?? null, scope.projectId ?? null, memoryKey)] ?? null;
}

export function recordMemoryTombstone(
  scope: MemoryScope,
  memoryKey: string,
  deletedMemoryId: string,
): void {
  try {
    const map = readTombstones();
    map[tombstoneKey(scope.userId ?? null, scope.projectId ?? null, memoryKey)] = {
      userId: scope.userId ?? null,
      projectId: scope.projectId ?? null,
      memoryKey,
      deletedMemoryId,
      deletedAt: new Date().toISOString(),
    };
    saveVersioned(AI_MEMORY_TOMBSTONE_KEY, map);
  } catch {
    /* tombstone gagal ditulis ≠ hapus gagal — hapus sudah terjadi */
  }
}

export function clearMemoryTombstone(scope: MemoryScope, memoryKey: string): void {
  try {
    const map = readTombstones();
    const key = tombstoneKey(scope.userId ?? null, scope.projectId ?? null, memoryKey);
    if (map[key]) {
      delete map[key];
      saveVersioned(AI_MEMORY_TOMBSTONE_KEY, map);
    }
  } catch {
    /* abaikan */
  }
}

/** Sumber yang dianggap OTOMATIS (turunan sumber yang masih hidup). */
const AUTO_DERIVED_SOURCES: MemorySourceType[] = ['structured-spec', 'system-consolidation', 'draft'];

/** Purge semua memori percakapan dari satu conversationId (dipanggil
 *  deleteConversation/clearMessages — penghapusan menyebar ke turunan).
 *  TIDAK menulis tombstone: hapus percakapan bukan pernyataan eksplisit
 *  bahwa fakta proyeknya harus dilupakan (spek hidup di konteks intake,
 *  bukan di percakapan). */
export function deleteMemoriesForConversation(
  conversationId: string,
  projectId: string,
  userId: string | null = null,
): number {
  const read = readMap();
  if (!read.ok) return 0;
  const next = { ...read.value };
  let deleted = 0;
  for (const rec of Object.values(next)) {
    if (
      rec.conversationId === conversationId &&
      (rec.projectId ?? null) === projectId &&
      (rec.userId ?? null) === userId
    ) {
      delete next[rec.memoryId];
      deleted++;
    }
  }
  if (deleted > 0) writeMap(next);
  return deleted;
}

/** Purge semua memori satu proyek (dipanggil saat proyek dihapus). */
export function deleteMemoriesForProject(projectId: string, userId: string | null = null): number {
  const read = readMap();
  if (!read.ok) return 0;
  const next = { ...read.value };
  let deleted = 0;
  for (const rec of Object.values(next)) {
    if ((rec.projectId ?? null) === projectId && (rec.userId ?? null) === userId) {
      delete next[rec.memoryId];
      deleted++;
    }
  }
  if (deleted > 0) writeMap(next);
  return deleted;
}

/* ------------------------------------------------------------------ */
/* Retensi / kedaluwarsa                                               */
/* ------------------------------------------------------------------ */

export function isMemoryExpired(rec: MemoryRecord, nowMs: number = Date.now()): boolean {
  const p = rec.expirationPolicy;
  if (p === 'session' || p === 'project-lifetime' || p === 'until-changed' || p === 'official-version') return false;
  const m = /^days:(\d+)$/.exec(p);
  if (!m) return false;
  const created = Date.parse(rec.createdAt);
  if (Number.isNaN(created)) return false;
  return nowMs - created > Number(m[1]) * 24 * 60 * 60 * 1000;
}

/** Hapus record kedaluwarsa dalam skop; kembalikan jumlah yang dihapus. */
export function purgeExpiredMemories(scope: MemoryScope, nowMs: number = Date.now()): number {
  const read = readMap();
  if (!read.ok) return 0;
  const next = { ...read.value };
  let deleted = 0;
  for (const rec of Object.values(next)) {
    if (scopeMatches(rec, scope) && isMemoryExpired(rec, nowMs)) {
      delete next[rec.memoryId];
      deleted++;
    }
  }
  if (deleted > 0) writeMap(next);
  return deleted;
}

/* ------------------------------------------------------------------ */
/* Ekstraksi deterministik (Part 4.2) — aturan atas teks, tanpa LLM,    */
/* tanpa karangan. Teks yang tidak cocok pola → TIDAK ADA kandidat.     */
/* ------------------------------------------------------------------ */

export interface MemoryCandidate {
  memoryKey: string;
  layer: MemoryLayer;
  memoryType: MemoryType;
  content: string;
  structuredPayload: Record<string, unknown>;
  quality: MemoryQuality;
  confidence: number;
  importance: 1 | 2 | 3;
  sourceType: MemorySourceType;
}

const SPEC_KEYWORDS: Array<{ re: RegExp; key: string; label: string }> = [
  { re: /\batap\b/, key: 'spec:roof_material', label: 'Material atap' },
  { re: /\bpondasi\b/, key: 'spec:foundation_type', label: 'Jenis pondasi' },
  { re: /\blantai\b/, key: 'spec:floor_type', label: 'Jenis lantai' },
  { re: /\bdinding\b/, key: 'spec:wall_type', label: 'Jenis dinding' },
  { re: /\bplafon\b/, key: 'spec:ceiling_type', label: 'Jenis plafon' },
  { re: /\bcat\b/, key: 'spec:paint', label: 'Cat' },
  { re: /\bgenteng\b/, key: 'spec:roof_material', label: 'Material atap' },
  { re: /\bkolam\b/, key: 'spec:pool', label: 'Kolam' },
  { re: /\bkandang\b/, key: 'spec:building_use', label: 'Fungsi bangunan' },
  { re: /\blantai\b.*\b(\d+)\b|\b(\d+)\s*lantai\b/, key: 'spec:floors', label: 'Jumlah lantai' },
];

const MATERIAL_WORDS = [
  'galvalum', 'spandek', 'genteng', 'beton', 'baja', 'keramik', 'granit',
  'kayu', 'kaca', 'batu', 'marmer', 'gypsum', 'asbes', 'seng',
];

function findSpecKey(text: string): { key: string; label: string } | null {
  const lower = text.toLowerCase();
  for (const entry of SPEC_KEYWORDS) {
    if (entry.re.test(lower)) return { key: entry.key, label: entry.label };
  }
  return null;
}

function parseRupiah(text: string): number | null {
  const m = /Rp?\s*([\d.,]+)\s*(jt|juta|miliar|m|rb|ribu)?/i.exec(text);
  if (!m) return null;
  const raw = m[1].replace(/\./g, '').replace(/,/g, '.');
  const base = Number(raw);
  if (!Number.isFinite(base) || base <= 0) return null;
  const mult = (m[2] ?? '').toLowerCase();
  if (mult === 'jt' || mult === 'juta') return base * 1_000_000;
  if (mult === 'miliar' || mult === 'm') return base * 1_000_000_000;
  if (mult === 'rb' || mult === 'ribu') return base * 1_000;
  return base;
}

/**
 * Ekstrak kandidat memori dari SATU pesan pengguna. Deterministik:
 * hanya 4 pola eksplisit di bawah; tidak ada pola → [].
 *  1. Koreksi eksplisit: "ganti/ubah/koreksi X menjadi Y" atau
 *     "bukan X, tapi Y" → layer project, quality confirmed-fact.
 *  2. Budget eksplisit: "budget (saya) Rp… / … jt" → layer project.
 *  3. Preferensi material eksplisit: "saya lebih suka/pakai X"
 *     dengan kata material → layer preference.
 *  4. Keputusan eksplisit: "oke/setuju/pakai X" dengan kata spek/
 *     material → layer project, memoryType decision.
 */
export function extractMemoryCandidates(
  userText: string,
  scope: MemoryScope,
  sourceMessageId: string | null = null,
): MemoryCandidate[] {
  const text = (userText ?? '').trim();
  if (!text || containsSecret(text)) return [];
  const lower = text.toLowerCase();
  const out: MemoryCandidate[] = [];

  // 1. Koreksi eksplisit.
  const corr =
    /(?:ganti|ubah|koreksi|rubah)\b(.+?)\b(?:menjadi|jadi|ke)\s+(.+)/i.exec(text) ??
    /\bbukan\b\s+(.+?),\s*(?:tapi|melainkan)\s+(.+)/i.exec(text);
  if (corr) {
    const from = corr[1].trim().slice(0, 120);
    const to = corr[2].trim().replace(/[.!?]+$/, '').slice(0, 200);
    const spec = findSpecKey(`${from} ${to}`);
    out.push({
      memoryKey: spec?.key ?? 'correction:general',
      layer: 'project',
      memoryType: 'correction',
      content: `${spec?.label ?? 'Koreksi'}: ${from} → ${to}`,
      structuredPayload: { value: to, from, explicitReplacement: true, label: spec?.label ?? 'Koreksi umum' },
      quality: 'confirmed-fact',
      confidence: 0.95,
      importance: 3,
      sourceType: 'user-correction',
    });
    return out; // satu pesan koreksi = satu kandidat (jangan ganda)
  }

  // 2. Budget eksplisit.
  if (/\bbudget\b|\banggar\b/.test(lower)) {
    const amount = parseRupiah(text);
    if (amount !== null) {
      out.push({
        memoryKey: 'spec:budget',
        layer: 'project',
        memoryType: 'fact',
        content: `Budget proyek: Rp${amount.toLocaleString('id-ID')}`,
        structuredPayload: { value: amount, label: 'Budget proyek' },
        quality: 'confirmed-fact',
        confidence: 0.9,
        importance: 3,
        sourceType: 'user-message',
      });
    }
  }

  // 3. Preferensi material eksplisit — DENGAN BATAS HEURISTIK (temuan
  // E2E Fase 2 F2-5): klausa yang ditangkap dibatasi 60 karakter tanpa
  // koma, DAN kata material harus muncul dalam 3 kata pertama klausa.
  // Tanpa batas ini, "Saya mau bangun kandang ayam ... atap Galvalum"
  // (maksud: bangun kandang) salah terbaca sebagai preferensi material
  // karena kata "mau" + "Galvalum" ada di kalimat yang sama.
  const pref = /(?:saya|kami|aku)\s+(?:lebih\s+)?(?:suka|pilih|pakai|mau)\s+([^,.;!?\n]{1,60})/i.exec(text);
  if (pref) {
    const wanted = pref[1].trim().replace(/[.!?]+$/, '');
    const words = wanted.toLowerCase().split(/\s+/);
    const material = MATERIAL_WORDS.find((w) => {
      const idx = words.findIndex((word) => word.includes(w));
      return idx >= 0 && idx <= 2;
    });
    if (material) {
      out.push({
        memoryKey: `pref:material:${material}`,
        layer: 'preference',
        memoryType: 'preference',
        content: `Preferensi material: ${material} (${wanted})`,
        structuredPayload: { value: material, detail: wanted, label: 'Preferensi material' },
        quality: 'user-assumption',
        confidence: 0.75,
        importance: 2,
        sourceType: 'user-message',
      });
    }
  }

  // 4. Keputusan eksplisit.
  if (/^(oke|ok|setuju|sepakat|baik|pakai|pilih)\b/.test(lower)) {
    const spec = findSpecKey(text);
    const material = MATERIAL_WORDS.find((w) => lower.includes(w));
    if (spec || material) {
      const value = spec?.label && material ? `${spec.label}: ${material}` : (spec?.label ?? material ?? text.slice(0, 120));
      out.push({
        memoryKey: spec?.key ?? `decision:material:${material}`,
        layer: 'project',
        memoryType: 'decision',
        content: `Keputusan: ${value}`,
        structuredPayload: { value, label: spec?.label ?? 'Keputusan material' },
        quality: 'confirmed-fact',
        confidence: 0.85,
        importance: 3,
        sourceType: 'user-message',
      });
    }
  }
  return out;
}

/** Ekstrak memori spek dari StructuredSpec v2 terkonfirmasi (sumber:
 *  rantai spek — bukan tebakan teks). ASSUMPTION disimpan sebagai
 *  user-assumption, BUKAN confirmed-fact. */
export function extractSpecMemories(
  specs: StructuredSpec[],
  scope: MemoryScope,
  sourceMessageId: string | null = null,
): MemoryCandidate[] {
  void scope;
  void sourceMessageId;
  return (specs ?? [])
    .filter((s) => s.status === 'CONFIRMED' || s.status === 'ASSUMPTION')
    .map((s) => ({
      memoryKey: `spec:${s.key}`,
      layer: 'project' as MemoryLayer,
      memoryType: 'spec' as MemoryType,
      content: `Spek [${s.status}] ${s.label}: ${String(s.value)}${s.unit ? ` ${s.unit}` : ''} (sumber: ${s.source})`,
      structuredPayload: { value: s.value, unit: s.unit ?? null, label: s.label, specStatus: s.status },
      quality: (s.status === 'CONFIRMED' ? 'confirmed-fact' : 'user-assumption') as MemoryQuality,
      confidence: s.status === 'CONFIRMED' ? 0.9 : 0.6,
      importance: 3 as const,
      sourceType: 'structured-spec' as MemorySourceType,
    }));
}

/** Jalankan ekstraksi + simpan (dengan resolusi konflik). Tidak pernah
 *  melempar — kegagalan simpan dilaporkan di hasil, bukan crash. */
export function ingestMemoryCandidates(
  candidates: MemoryCandidate[],
  scope: MemoryScope,
  provenance: string,
  sourceMessageId: string | null = null,
): Array<{ candidate: MemoryCandidate; resolution: ConflictResolution | null; error?: string }> {
  const now = new Date().toISOString();
  return candidates.map((c) => {
    // Anti-bangkit (MEM-10): kandidat OTOMATIS dengan kunci yang sedang
    // ditombstone (pengguna sengaja menghapusnya) DILEWATI — tidak dibuat
    // ulang dari sumber yang masih hidup. Pernyataan eksplisit pengguna
    // justru MENGHAPUS tombstone (pengguna menyatakan ulang faktanya).
    const tomb = getMemoryTombstone(scope, c.memoryKey);
    if (tomb && AUTO_DERIVED_SOURCES.includes(c.sourceType)) {
      return {
        candidate: c,
        resolution: null,
        error: `MEMORY_TOMBSTONED: kunci ${c.memoryKey} sengaja dihapus pengguna — ingest otomatis dilewati.`,
      };
    }
    if (tomb && !AUTO_DERIVED_SOURCES.includes(c.sourceType)) {
      clearMemoryTombstone(scope, c.memoryKey);
    }
    const created = createMemoryRecord(
      {
        userId: scope.userId ?? null,
        projectId: c.layer === 'preference' ? null : (scope.projectId ?? null),
        conversationId: c.layer === 'conversation' ? (scope.conversationId ?? null) : null,
        memoryKey: c.memoryKey,
        layer: c.layer,
        memoryType: c.memoryType,
        content: c.content,
        structuredPayload: c.structuredPayload,
        sourceMessageId,
        sourceType: c.sourceType,
        provenance,
        quality: c.quality,
        confidence: c.confidence,
        importance: c.importance,
      },
      now,
    );
    if (!created.ok) return { candidate: c, resolution: null, error: created.message };
    const stored = storeMemoryWithConflictResolution(created.value, scope);
    if (!stored.ok) return { candidate: c, resolution: null, error: stored.message };
    return { candidate: c, resolution: stored.value };
  });
}

/* ------------------------------------------------------------------ */
/* Retrieval (Part 4.6) — ranking + batas eksplisit + observabilitas    */
/* ------------------------------------------------------------------ */

export interface MemoryRetrievalReport {
  considered: number;
  selected: number;
  droppedForBudget: number;
  droppedCrossScope: number;
  perLayer: Partial<Record<MemoryLayer, number>>;
  maxRetrieved: number;
}

export interface MemoryRetrievalResult {
  selected: MemoryRecord[];
  report: MemoryRetrievalReport;
}

const AUTHORITY_SCORE: Record<MemoryQuality, number> = {
  'official-reference': 2,
  'confirmed-fact': 1,
  'user-assumption': -1,
  'ai-suggestion': -1,
  'unverified-external': 0,
  superseded: -2,
  contradictory: -2,
  'temporary-working-state': 0,
};

function scoreMemory(rec: MemoryRecord, queryTokens: string[], nowMs: number): number {
  const tokens = new Set(tokenize(rec.content));
  let overlap = 0;
  for (const t of queryTokens) if (tokens.has(t)) overlap++;
  const ageDays = Math.max(0, (nowMs - Date.parse(rec.createdAt)) / 86_400_000);
  const recency = ageDays <= 1 ? 2 : ageDays <= 7 ? 1.5 : ageDays <= 30 ? 1 : 0.5;
  return (
    overlap * 3 +
    recency +
    AUTHORITY_SCORE[rec.quality] +
    (rec.importance === 3 ? 1 : rec.importance === 2 ? 0.5 : 0) +
    (MEMORY_RETRIEVAL_LAYER_ORDER.indexOf(rec.layer) >= 0
      ? (MEMORY_RETRIEVAL_LAYER_ORDER.length - MEMORY_RETRIEVAL_LAYER_ORDER.indexOf(rec.layer)) * 0.1
      : 0)
  );
}

/**
 * Retrieval memori untuk satu permintaan. Hanya record current yang
 * diambil; superseded/contradictory TIDAK PERNAH masuk prompt (yang
 * contradictory hanya terlihat di panel Memori untuk ditanyakan).
 * Urutan lapis Part 4.6: project spec → decision → preference →
 * long-term → verified reference → task-result; cap per lapis 4,
 * total 12. Retrieval TIDAK PERNAH melewati skop.
 */
export function retrieveMemories(
  scope: MemoryScope,
  query: string,
  opts: { maxRetrieved?: number; nowMs?: number } = {},
): MemoryRetrievalResult {
  const maxRetrieved = opts.maxRetrieved ?? MEMORY_MAX_RETRIEVED;
  const nowMs = opts.nowMs ?? Date.now();
  const read = readMap();
  const all = read.ok ? Object.values(read.value) : [];
  const droppedCrossScope = all.filter((r) => !scopeMatches(r, scope)).length;
  const queryTokens = tokenize(query ?? '');
  const current = all
    .filter((r) => scopeMatches(r, scope))
    .filter((r) => r.status === 'current')
    .filter((r) => !isMemoryExpired(r, nowMs));
  const considered = current.length;
  const ranked = current
    .map((rec) => ({ rec, score: scoreMemory(rec, queryTokens, nowMs) }))
    .sort((a, b) => b.score - a.score || b.rec.updatedAt.localeCompare(a.rec.updatedAt));
  const perLayerCount: Partial<Record<MemoryLayer, number>> = {};
  const selected: MemoryRecord[] = [];
  for (const { rec } of ranked) {
    if (selected.length >= maxRetrieved) break;
    if ((perLayerCount[rec.layer] ?? 0) >= MEMORY_MAX_PER_LAYER) continue;
    perLayerCount[rec.layer] = (perLayerCount[rec.layer] ?? 0) + 1;
    selected.push(rec);
    // Sentuh lastAccessedAt (observabilitas pemakaian; tulis sekali).
    try {
      const map = readMap();
      if (map.ok && map.value[rec.memoryId]) {
        map.value[rec.memoryId] = { ...map.value[rec.memoryId], lastAccessedAt: new Date(nowMs).toISOString() };
        writeMap(map.value);
      }
    } catch {
      /* sentuhan akses tidak boleh menggagalkan retrieval */
    }
  }
  // Urutkan hasil akhir menurut urutan lapis Part 4.6 untuk prompt.
  selected.sort(
    (a, b) =>
      MEMORY_RETRIEVAL_LAYER_ORDER.indexOf(a.layer) - MEMORY_RETRIEVAL_LAYER_ORDER.indexOf(b.layer) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
  return {
    selected,
    report: {
      considered,
      selected: selected.length,
      droppedForBudget: considered - selected.length,
      droppedCrossScope,
      perLayer: perLayerCount,
      maxRetrieved,
    },
  };
}

/** Format seksi MEMORI untuk builder kanonis (cap 1.500 karakter,
 *  berlabel lapis + kualitas + provenans — bukan riwayat mentah). */
export function formatMemorySection(records: MemoryRecord[]): string {
  if (!records.length) return '';
  const lines = records.map((r) => {
    const layerLabel =
      r.layer === 'project'
        ? 'PROYEK'
        : r.layer === 'preference'
          ? 'PREFERENSI'
          : r.layer === 'long-term'
            ? 'JANGKA PANJANG'
            : r.layer === 'knowledge'
              ? 'REFERENSI'
              : 'PERCAKAPAN';
    return `- [${layerLabel} · ${r.quality} · ${r.provenance}] ${r.content}`;
  });
  let text = lines.join('\n');
  if (text.length > MEMORY_SECTION_BUDGET) {
    text = `${text.slice(0, MEMORY_SECTION_BUDGET)}\n…[seksi memori dipotong demi anggaran ${MEMORY_SECTION_BUDGET} karakter]`;
  }
  return text;
}

/* ------------------------------------------------------------------ */
/* Preferensi pengguna (store penuh — BARU Fase 2)                      */
/* ------------------------------------------------------------------ */

/**
 * Preferensi yang BOLEH disimpan: hanya yang eksplisit, berguna, dan
 * diizinkan — bahasa, presentasi RAB, gaya workflow, level detail.
 * TIDAK ADA inferensi atribut personal sensitif (usia/gender/agama/
 * kesehatan/dll.) — preferensi semacam itu tidak punya kunci di sini
 * dan penulisan nilainya ditolak validator di bawah.
 */
export type PreferenceLanguage = 'id' | 'en';
export type PreferenceRabPresentation = 'ringkas' | 'rinci';
export type PreferenceWorkflowStyle = 'bertahap' | 'langsung';
export type PreferenceDetailLevel = 'ringkas' | 'sedang' | 'rinci';

export interface UserPreferences {
  language: PreferenceLanguage;
  rabPresentation: PreferenceRabPresentation;
  workflowStyle: PreferenceWorkflowStyle;
  detailLevel: PreferenceDetailLevel;
  /** Personalisasi opsional — bila false, preferensi TIDAK dipakai di prompt. */
  personalizationEnabled: boolean;
  updatedAt: string;
}

export const DEFAULT_PREFERENCES: Omit<UserPreferences, 'updatedAt'> = {
  language: 'id',
  rabPresentation: 'ringkas',
  workflowStyle: 'bertahap',
  detailLevel: 'sedang',
  personalizationEnabled: true,
};

const PREFERENCE_VALUE_ALLOWLIST: Record<string, readonly string[]> = {
  language: ['id', 'en'],
  rabPresentation: ['ringkas', 'rinci'],
  workflowStyle: ['bertahap', 'langsung'],
  detailLevel: ['ringkas', 'sedang', 'rinci'],
  personalizationEnabled: ['true', 'false'],
};

type PreferenceMap = Record<string, UserPreferences>;

function readPrefMap(): MemoryResult<PreferenceMap> {
  const res = loadVersioned<PreferenceMap>(AI_PREFERENCE_STORAGE_KEY);
  if (!res.ok) {
    if (res.error === 'NOT_FOUND') return { ok: true, value: {} };
    return { ok: false, error: 'MEMORY_PERSISTENCE_FAILED', message: `Preferensi tidak dapat dibaca (${res.error}).` };
  }
  if (!res.data || typeof res.data !== 'object' || Array.isArray(res.data)) {
    return { ok: false, error: 'MEMORY_PERSISTENCE_FAILED', message: 'Preferensi rusak (bukan peta pengguna).' };
  }
  return { ok: true, value: res.data };
}

export function getPreferences(userId: string | null): UserPreferences {
  const key = userId ?? 'anonymous';
  const read = readPrefMap();
  const stored = read.ok ? read.value[key] : undefined;
  if (!stored) return { ...DEFAULT_PREFERENCES, updatedAt: '' };
  return { ...DEFAULT_PREFERENCES, ...stored };
}

export function setPreference<K extends keyof UserPreferences>(
  userId: string | null,
  prefKey: K,
  value: UserPreferences[K],
): MemoryResult<UserPreferences> {
  const allow = PREFERENCE_VALUE_ALLOWLIST[prefKey as string];
  if (allow && !allow.includes(String(value))) {
    return { ok: false, error: 'MEMORY_SCOPE_INVALID', message: `Nilai preferensi tidak diizinkan untuk ${String(prefKey)}: ${String(value)}.` };
  }
  const key = userId ?? 'anonymous';
  const read = readPrefMap();
  if (!read.ok) return read;
  const next: UserPreferences = {
    ...getPreferences(userId),
    [prefKey]: value,
    updatedAt: new Date().toISOString(),
  };
  const saved = saveVersioned(AI_PREFERENCE_STORAGE_KEY, { ...read.value, [key]: next });
  if (!saved.ok) {
    return { ok: false, error: 'MEMORY_PERSISTENCE_FAILED', message: `Preferensi gagal disimpan (${saved.error}).` };
  }
  return { ok: true, value: next };
}

export function isPersonalizationEnabled(userId: string | null): boolean {
  return getPreferences(userId).personalizationEnabled;
}

/** Baris preferensi untuk seksi MEMORI (hanya bila personalisasi aktif). */
export function formatPreferenceLines(prefs: UserPreferences): string[] {
  if (!prefs.personalizationEnabled) return [];
  const lines: string[] = [];
  lines.push(`- [PREFERENSI · bahasa jawaban: ${prefs.language === 'id' ? 'Bahasa Indonesia' : 'English'}]`);
  lines.push(`- [PREFERENSI · presentasi RAB: ${prefs.rabPresentation}]`);
  lines.push(`- [PREFERENSI · gaya workflow: ${prefs.workflowStyle} · level detail: ${prefs.detailLevel}]`);
  return lines;
}

/**
 * Gerbang personalisasi (MEM-11): bila personalisasi nonaktif,
 * record lapis 'preference' TIDAK dipakai di prompt — record proyek/
 * keputusan/long-term (fakta proyek, bukan personalisasi) tetap
 * dipakai karena sudah dibawa FAKTA PROYEK.
 */
export function applyPersonalizationGate(
  records: MemoryRecord[],
  prefs: UserPreferences,
): MemoryRecord[] {
  if (prefs.personalizationEnabled) return records;
  return records.filter((r) => r.layer !== 'preference');
}

/* ------------------------------------------------------------------ */
/* Observabilitas                                                      */
/* ------------------------------------------------------------------ */

export function getMemoryReport(scope: MemoryScope): {
  total: number;
  perLayer: Partial<Record<MemoryLayer, number>>;
  perStatus: Partial<Record<MemoryStatus, number>>;
  conflicts: number;
} {
  const read = readMap();
  const all = read.ok ? Object.values(read.value).filter((r) => scopeMatches(r, scope)) : [];
  const perLayer: Partial<Record<MemoryLayer, number>> = {};
  const perStatus: Partial<Record<MemoryStatus, number>> = {};
  let conflicts = 0;
  for (const r of all) {
    perLayer[r.layer] = (perLayer[r.layer] ?? 0) + 1;
    perStatus[r.status] = (perStatus[r.status] ?? 0) + 1;
    if (r.status === 'contradictory') conflicts++;
  }
  return { total: all.length, perLayer, perStatus, conflicts };
}

/** Label jujur yang dipakai UI/kode — JANGAN diubah menjadi klaim
 *  lintas-perangkat sebelum backend siap (lihat header modul). */
export const MEMORY_HONEST_LABEL =
  'Memori lokal per-perangkat (browser ini saja) — belum lintas-perangkat sampai backend memori aktif.';
