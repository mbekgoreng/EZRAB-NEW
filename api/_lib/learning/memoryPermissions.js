/**
 * api/_lib/learning/memoryPermissions.js — Kontrak permission memori
 * (Phase B). Adapter/konvensi di SAMPING billingAuthorization.js — file
 * billing TIDAK diubah oleh fase ini.
 * ============================================================================
 * Permission memori memakai namespace sendiri (`memory:*`) agar tidak
 * tercampur dengan permission billing (`billing:*`). Pemetaan role memakai
 * enum role workspace yang sama dengan billingAuthorization.js
 * (WORKSPACE_ROLES dari migration fondasi) supaya satu record keanggotaan
 * yang sama dapat dievaluasi konsisten oleh kedua domain.
 *
 * PERINGATAN KEJUJURAN: nama permission ini TIDAK berarti sistem live sudah
 * menegakkannya. Belum ada route yang memanggil kontrak ini; penegakan
 * production menunggu pemanggil server tepercaya + adapter membership
 * persisten (Phase 5.4). `memory:publish_global` SENGAJA tidak diberikan
 * kepada role workspace mana pun — publikasi global adalah wewenang proses
 * governance terpisah (lihat memoryPolicy.js#canActAsGlobalGovernance).
 */
import { WORKSPACE_ROLES } from '../billingAuthorization.js';

/** Permission memori yang dikenal kontrak ini. */
export const MEMORY_PERMISSIONS = Object.freeze([
  'memory:read',
  'memory:write',
  'memory:review',
  'memory:delete',
  'memory:publish_global',
]);

/**
 * Pemetaan role workspace → permission memori.
 * - SUPER_ADMIN (owner workspace): read/write/review/delete.
 * - DIREKSI: read/write (pimpinan; review kandidat tetap owner — keputusan
 *   konservatif Phase B, dapat dilonggarkan owner kelak).
 * - ESTIMATOR / EDITOR (member internal): read/write.
 * - CLIENT: tidak ada permission memori workspace (konsisten dengan
 *   pengecualian CLIENT pada billing). Memori personal client tetap diatur
 *   scope PERSONAL dari aktornya, bukan dari tabel ini.
 * - publish_global: TIDAK ADA di baris mana pun, dengan sengaja.
 */
export const ROLE_MEMORY_PERMISSIONS = Object.freeze({
  SUPER_ADMIN: Object.freeze(['memory:read', 'memory:write', 'memory:review', 'memory:delete']),
  DIREKSI: Object.freeze(['memory:read', 'memory:write']),
  ESTIMATOR: Object.freeze(['memory:read', 'memory:write']),
  EDITOR: Object.freeze(['memory:read', 'memory:write']),
  CLIENT: Object.freeze([]),
});

export function isMemoryPermission(value) {
  return MEMORY_PERMISSIONS.includes(value);
}

/**
 * Apakah role workspace ini memegang permission memori tersebut?
 * Fail-closed: role tidak dikenal / permission tidak dikenal → false.
 */
export function roleHasMemoryPermission(role, permission) {
  if (!WORKSPACE_ROLES.includes(role)) return false;
  if (!isMemoryPermission(permission)) return false;
  const granted = ROLE_MEMORY_PERMISSIONS[role];
  return Boolean(granted) && granted.includes(permission);
}
