/**
 * api/_lib/learning/memoryContracts.js — Kontrak data Continuous User
 * Learning, Phase B (fondasi domain MURNI).
 * ============================================================================
 * File ini mendefinisikan bentuk data dan aturan struktural memori EZRAB:
 * empat scope (PERSONAL / WORKSPACE / PROJECT / GLOBAL), aktor tepercaya,
 * kepemilikan, provenance, lifecycle, dan hasil validasi yang deterministik.
 *
 * Prinsip yang dikunci (Phase B, master prompt §3):
 * - Identitas HANYA dari konteks autentikasi server terverifikasi. Header
 *   client (x-user-id / x-user-role / x-workspace-id), localStorage, output
 *   LLM, dan output extractor TIDAK PERNAH memenuhi kontrak aktor.
 * - Scope ditentukan kebijakan deterministik (memoryPolicy.js), bukan oleh
 *   extractor/LLM dan bukan oleh request client.
 * - Kepemilikan harus valid secara struktural (matriks di validateOwnership).
 * - GLOBAL bukan jalur publikasi otomatis: record GLOBAL hanya lahir dari
 *   proses governance terpisah (belum diimplementasikan; lihat
 *   memoryPolicy.js#canActAsGlobalGovernance).
 * - Memori TIDAK PERNAH menjadi otoritas data rekayasa deterministik
 *   (AHSP, harga resmi, perhitungan kuantitas/RAB) — kontrak di sini tidak
 *   menyediakan jalur apa pun untuk menimpa registri deterministik.
 *
 * Modul ini MURNI: tanpa I/O, tanpa query DB, tanpa jaringan. Ia TIDAK
 * menegakkan otorisasi production apa pun — penegakan nyata mensyaratkan
 * pemanggil server tepercaya + adapter membership persisten yang belum ada
 * (prasyarat Phase 5.4). Jangan mengklaim sebaliknya.
 */

/** Empat scope memori. Nilai stabil — jangan ditambah tanpa keputusan owner. */
export const MEMORY_SCOPES = Object.freeze(['PERSONAL', 'WORKSPACE', 'PROJECT', 'GLOBAL']);

/** Kategori kandidat pengetahuan (dari sumber event §7.2 prompt program). */
export const MEMORY_CATEGORIES = Object.freeze([
  'PREFERENCE',
  'INSTRUCTION',
  'PROJECT_FACT',
  'WORKSPACE_PROCEDURE',
  'REPEATED_CORRECTION',
  'WORKFLOW_PATTERN',
  'TERMINOLOGY',
  'DECISION',
  'KNOWLEDGE_REFERENCE',
  'TEMPORARY_CONTEXT',
]);

/** Status lifecycle yang dikenal di seluruh sistem memori. */
export const MEMORY_LIFECYCLES = Object.freeze([
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'ARCHIVED',
  'DELETED',
]);

/**
 * Status yang SAH per scope. Tidak semua scope memakai semua status:
 * - PERSONAL: boleh aktif otomatis sebagai APPROVED (kebijakan program:
 *   memori personal dapat diperbarui otomatis bila bukti cukup) — tidak ada
 *   jalur review/publikasi.
 * - WORKSPACE/PROJECT: kandidat wajib melewati PENDING_REVIEW secara default.
 * - GLOBAL: record hanya ada SETELAH governance (APPROVED dari kandidat)
 *   dan hanya PUBLISHED yang dapat diambil; DRAFT/PENDING_REVIEW milik
 *   kandidat governance, bukan record global.
 */
export const LIFECYCLE_BY_SCOPE = Object.freeze({
  PERSONAL: Object.freeze(['DRAFT', 'APPROVED', 'ARCHIVED', 'DELETED']),
  WORKSPACE: Object.freeze(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED', 'DELETED']),
  PROJECT: Object.freeze(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED', 'DELETED']),
  GLOBAL: Object.freeze(['APPROVED', 'PUBLISHED', 'ARCHIVED']),
});

/**
 * Matriks transisi lifecycle (deterministik). Transisi di luar matriks =
 * tidak sah. REJECTED dan DELETED terminal untuk retrieval: tidak ada
 * transisi keluar dari keduanya, dan keduanya tidak pernah retrievable.
 * PUBLISHED hanya bermakna untuk GLOBAL (ditegakkan lewat
 * LIFECYCLE_BY_SCOPE pada validasi record/transisi).
 */
export const LIFECYCLE_TRANSITIONS = Object.freeze({
  DRAFT: Object.freeze(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'DELETED']),
  PENDING_REVIEW: Object.freeze(['APPROVED', 'REJECTED', 'DELETED']),
  APPROVED: Object.freeze(['PUBLISHED', 'ARCHIVED', 'DELETED']),
  PUBLISHED: Object.freeze(['ARCHIVED']),
  REJECTED: Object.freeze([]),
  ARCHIVED: Object.freeze(['DELETED']),
  DELETED: Object.freeze([]),
});

/** Status yang boleh diambil (retrievable) per scope. */
export const RETRIEVABLE_STATES_BY_SCOPE = Object.freeze({
  PERSONAL: Object.freeze(['APPROVED']),
  WORKSPACE: Object.freeze(['APPROVED']),
  PROJECT: Object.freeze(['APPROVED']),
  GLOBAL: Object.freeze(['PUBLISHED']),
});

/** Tipe sumber provenance — himpunan tertutup. */
export const SOURCE_TYPES = Object.freeze([
  'USER_INSTRUCTION',
  'USER_CORRECTION',
  'CONVERSATION',
  'DOCUMENT',
  'PROJECT_ACTIVITY',
  'RAB_REVISION',
  'WORKSPACE_ACTIVITY',
  'EXPLICIT_MEMORY_REQUEST',
  'SYSTEM_OBSERVATION',
  'GOVERNANCE_IMPORT',
]);

/** Status validasi sumber pada provenance. */
export const SOURCE_VALIDATION_STATUSES = Object.freeze(['UNVERIFIED', 'VERIFIED', 'REJECTED']);

/** Klasifikasi data record (untuk kebijakan retensi/akses fase berikutnya). */
export const DATA_CLASSIFICATIONS = Object.freeze(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PERSONAL_DATA']);

/**
 * Provider identitas yang diakui kontrak aktor. Satu-satunya jalur identitas
 * production EZRAB adalah Supabase Auth yang diverifikasi server-side;
 * provider lain tidak boleh ditambahkan tanpa keputusan owner.
 */
export const TRUSTED_IDENTITY_PROVIDERS = Object.freeze(['SUPABASE_AUTH']);

/** Tipe principal. SERVICE tidak boleh menyamar sebagai USER. */
export const PRINCIPAL_TYPES = Object.freeze(['USER', 'SERVICE']);

/** Kode hasil validasi — deterministik dan machine-readable (prompt §7.7). */
export const VALIDATION_CODES = Object.freeze([
  'VALID',
  'INVALID',
  'INVALID_OWNERSHIP',
  'INVALID_PROVENANCE',
  'INVALID_CONFIDENCE',
  'INVALID_TIMESTAMP',
  'INVALID_TRANSITION',
  'REQUIRES_AUTHENTICATION',
  'REQUIRES_WORKSPACE_AUTHORIZATION',
  'REQUIRES_PROJECT_AUTHORIZATION',
  'REQUIRES_REVIEW',
  'GLOBAL_SCOPE_FORBIDDEN',
  'SOURCE_NOT_VERIFIABLE',
  'UNRESOLVED_SCOPE',
]);

/** Hasil validasi yang lolos. `extra` boleh menambah field konteks aman. */
export function okResult(extra) {
  return Object.freeze({ ok: true, code: 'VALID', message: 'OK', field: null, rule: null, ...(extra || {}) });
}

/**
 * Hasil validasi gagal. Pesan sengaja generik dan aman: tidak pernah
 * memuat isi sumber/memori yang sensitif.
 */
export function failResult(code, message, field, rule) {
  return Object.freeze({
    ok: false,
    code,
    message: message || 'Validasi gagal.',
    field: field || null,
    rule: rule || null,
  });
}

/** Normalisasi id: string non-kosong (setelah trim) atau null. */
export function normalizeId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Timestamp valid: angka finite > 0 (ms epoch). */
export function isValidTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isScope(value) {
  return MEMORY_SCOPES.includes(value);
}

export function isLifecycle(value) {
  return MEMORY_LIFECYCLES.includes(value);
}

export function isCategory(value) {
  return MEMORY_CATEGORIES.includes(value);
}

export function isSourceType(value) {
  return SOURCE_TYPES.includes(value);
}

/** Apakah status lifecycle ini sah untuk scope tersebut? */
export function isStatusAllowedForScope(scope, status) {
  const allowed = LIFECYCLE_BY_SCOPE[scope];
  return Boolean(allowed) && allowed.includes(status);
}

/** Apakah transisi lifecycle from → to diizinkan matriks? */
export function canTransitionStatus(from, to) {
  const allowed = LIFECYCLE_TRANSITIONS[from];
  return Boolean(allowed) && allowed.includes(to);
}

/** Apakah record berstatus ini boleh diambil untuk scope tersebut? */
export function isRetrievableStatus(scope, status) {
  const allowed = RETRIEVABLE_STATES_BY_SCOPE[scope];
  return Boolean(allowed) && allowed.includes(status);
}

/**
 * Validasi aktor tepercaya (principal apa pun).
 * Kontrak ketat (prompt §7.1):
 * - principalType wajib eksplisit: 'USER' atau 'SERVICE'.
 * - identityVerified harus PERSIS boolean true.
 * - identityProvider harus provider yang diakui (SUPABASE_AUTH).
 * - USER: userId wajib id non-kosong ternormalisasi.
 * - SERVICE: serviceId wajib; principal service tidak membawa userId
 *   sebagai identitas user (penyamaran ditolak di validateUserActor dan
 *   di sini bila userId diklaim tanpa principalType USER).
 * Objek berbentuk header client ({ 'x-user-id': ... }) tidak punya field
 * kontrak apa pun sehingga selalu gagal di sini.
 */
export function validateTrustedActor(actor) {
  if (!actor || typeof actor !== 'object') {
    return failResult('REQUIRES_AUTHENTICATION', 'Konteks aktor tepercaya tidak ada.', 'actor', 'ACTOR_REQUIRED');
  }
  if (!PRINCIPAL_TYPES.includes(actor.principalType)) {
    return failResult('REQUIRES_AUTHENTICATION', 'Tipe principal tidak dikenal.', 'principalType', 'PRINCIPAL_TYPE_REQUIRED');
  }
  if (actor.identityVerified !== true) {
    return failResult('REQUIRES_AUTHENTICATION', 'Identitas belum terverifikasi server-side.', 'identityVerified', 'IDENTITY_VERIFIED_REQUIRED');
  }
  if (!TRUSTED_IDENTITY_PROVIDERS.includes(actor.identityProvider)) {
    return failResult('REQUIRES_AUTHENTICATION', 'Provider identitas tidak diakui.', 'identityProvider', 'TRUSTED_PROVIDER_REQUIRED');
  }
  if (actor.principalType === 'USER') {
    if (!normalizeId(actor.userId)) {
      return failResult('REQUIRES_AUTHENTICATION', 'User id tidak valid.', 'userId', 'USER_ID_REQUIRED');
    }
  } else if (!normalizeId(actor.serviceId)) {
    return failResult('REQUIRES_AUTHENTICATION', 'Service id tidak valid.', 'serviceId', 'SERVICE_ID_REQUIRED');
  }
  if (actor.authenticatedAt != null && !isValidTimestamp(actor.authenticatedAt)) {
    return failResult('INVALID_TIMESTAMP', 'Timestamp autentikasi tidak valid.', 'authenticatedAt', 'TIMESTAMP_INVALID');
  }
  return okResult();
}

/**
 * Validasi aktor sebagai USER. Principal SERVICE selalu ditolak di sini:
 * service tidak boleh menyamar sebagai user untuk operasi memori user.
 */
export function validateUserActor(actor) {
  const base = validateTrustedActor(actor);
  if (!base.ok) return base;
  if (actor.principalType !== 'USER') {
    return failResult('REQUIRES_AUTHENTICATION', 'Operasi ini memerlukan principal user, bukan service.', 'principalType', 'USER_PRINCIPAL_REQUIRED');
  }
  return okResult();
}

/**
 * Validasi matriks kepemilikan (prompt §7.2). Murni struktural:
 *   PERSONAL : userId wajib; workspaceId & projectId dilarang.
 *   WORKSPACE: workspaceId wajib; userId & projectId dilarang sebagai owner.
 *   PROJECT  : workspaceId & projectId wajib; userId dilarang sebagai owner.
 *   GLOBAL   : ketiganya dilarang.
 * (Identitas aktor untuk WORKSPACE/PROJECT tetap ada di konteks aktor —
 * ia hanya bukan kunci kepemilikan record.)
 */
export function validateOwnership(scope, ownership) {
  if (!isScope(scope)) {
    return failResult('INVALID', 'Scope tidak dikenal.', 'scope', 'SCOPE_UNKNOWN');
  }
  if (!ownership || typeof ownership !== 'object') {
    return failResult('INVALID_OWNERSHIP', 'Kepemilikan tidak ada.', 'ownership', 'OWNERSHIP_REQUIRED');
  }
  const userId = normalizeId(ownership.userId);
  const workspaceId = normalizeId(ownership.workspaceId);
  const projectId = normalizeId(ownership.projectId);
  const hasRaw = (v) => v != null && normalizeId(v) == null;
  if (hasRaw(ownership.userId) || hasRaw(ownership.workspaceId) || hasRaw(ownership.projectId)) {
    return failResult('INVALID_OWNERSHIP', 'Id kepemilikan harus string non-kosong.', 'ownership', 'OWNERSHIP_ID_INVALID');
  }
  const bad = (field, rule, message) => failResult('INVALID_OWNERSHIP', message, field, rule);
  if (scope === 'PERSONAL') {
    if (!userId) return bad('userId', 'PERSONAL_REQUIRES_USER', 'Memori personal wajib dimiliki satu user.');
    if (workspaceId) return bad('workspaceId', 'PERSONAL_FORBIDS_WORKSPACE', 'Memori personal tidak boleh dimiliki workspace.');
    if (projectId) return bad('projectId', 'PERSONAL_FORBIDS_PROJECT', 'Memori personal tidak boleh dimiliki proyek.');
  } else if (scope === 'WORKSPACE') {
    if (userId) return bad('userId', 'WORKSPACE_FORBIDS_USER_OWNER', 'Pengetahuan workspace tidak boleh dimiliki user perorangan.');
    if (!workspaceId) return bad('workspaceId', 'WORKSPACE_REQUIRES_WORKSPACE', 'Pengetahuan workspace wajib memiliki workspace owner.');
    if (projectId) return bad('projectId', 'WORKSPACE_FORBIDS_PROJECT', 'Pengetahuan workspace tidak boleh dimiliki proyek.');
  } else if (scope === 'PROJECT') {
    if (userId) return bad('userId', 'PROJECT_FORBIDS_USER_OWNER', 'Memori proyek tidak boleh dimiliki user perorangan.');
    if (!workspaceId) return bad('workspaceId', 'PROJECT_REQUIRES_WORKSPACE', 'Memori proyek wajib berada di bawah workspace.');
    if (!projectId) return bad('projectId', 'PROJECT_REQUIRES_PROJECT', 'Memori proyek wajib memiliki project owner.');
  } else {
    // GLOBAL
    if (userId || workspaceId || projectId) {
      return bad('ownership', 'GLOBAL_FORBIDS_TENANT_OWNER', 'Pengetahuan global tidak boleh memiliki owner tenant.');
    }
  }
  return okResult({ ownership: Object.freeze({ userId, workspaceId, projectId }) });
}
