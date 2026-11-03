/**
 * api/_lib/billingAuthorization.js — Batas otorisasi server-side untuk
 * billing berbasis WORKSPACE (Phase 5.3, Workstream B).
 * ============================================================================
 * Modul ini adalah SATU-SATUNYA tempat keputusan otorisasi billing dibuat:
 *
 *   principal terautentikasi → workspace yang diminta → keanggotaan
 *   terverifikasi server-side → status keanggotaan → permission.
 *
 * Prinsip yang ditegakkan (fail-closed di semua cabang):
 * - Identitas HANYA dari hasil authenticateRequest() yang terverifikasi
 *   (Supabase JWT server-side). Mode degraded / service-token TIDAK membawa
 *   identitas user, jadi TIDAK PERNAH cukup untuk akses billing.
 * - Workspace id dari URL/body/header hanyalah TARGET yang diminta — bukan
 *   bukti akses. Akses hanya sah bila record keanggotaan (dari tabel
 *   workspace_members, dibaca server-side) cocok dengan principal DAN
 *   workspace yang diminta. Ketidakcocokan apa pun = ditolak (anti-IDOR).
 * - Role client-side (selector role frontend, PIN demo, localStorage)
 *   BUKAN otoritas. Fungsi ini tidak membaca satu pun dari mereka.
 * - Resolusi review billing manual (REQUIRES_REVIEW) hanya untuk Owner
 *   workspace (role SUPER_ADMIN — role owner-level pada enum
 *   workspace_members yang ada) atau anggota dengan grant eksplisit
 *   billingAdmin. Member biasa & CLIENT tidak akan pernah lolos.
 *
 * Pemetaan kepemilikan: ledger kredit (creditLedger.js) berkunci
 * `accountId` = id AKUN BILLING workspace. Satu workspace punya tepat satu
 * akun billing (diformatkan tabel `billing_accounts` pada migration
 * Phase 5.3 — file saja, belum dieksekusi). Jangan pernah memakai user id
 * sebagai accountId.
 *
 * Fungsi-fungsi di sini MURNI (tanpa I/O): pemanggil (route handler masa
 * depan) wajib mengambil record keanggotaan dari DB server-side dan
 * meneruskannya ke sini. Selama DB belum terverifikasi, TIDAK ada route
 * yang memanggil modul ini — ia adalah fondasi yang teruji, bukan klaim
 * bahwa otorisasi production sudah aktif.
 */

/** Role yang dikenal pada enum workspace_members (migration fondasi). */
export const WORKSPACE_ROLES = ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT', 'EDITOR'];

/** Role owner-level workspace: pemilik/penanggung jawab workspace. */
export const WORKSPACE_OWNER_ROLE = 'SUPER_ADMIN';

/** Permission yang dikenal modul ini. */
export const BILLING_PERMISSIONS = ['billing:read', 'billing:use', 'billing:review:resolve'];

// Role yang boleh membaca/menggunakan billing workspace (member internal).
// CLIENT sengaja dikecualikan: peran client tidak melihat data billing.
const BILLING_MEMBER_ROLES = ['SUPER_ADMIN', 'DIREKSI', 'ESTIMATOR', 'EDITOR'];

function deny(status, errorCode, error) {
  return { allow: false, status, errorCode, error };
}

/**
 * Normalisasi satu baris workspace_members (bentuk DB snake_case atau
 * bentuk domain camelCase) menjadi record keanggotaan kanonis.
 * - status: kolom `status` belum ada di skema saat ini; record tanpa status
 *   diperlakukan 'ACTIVE' (keanggotaan yang ada di tabel = aktif), dan
 *   nilai 'SUSPENDED'/'REVOKED' — bila kelak diisi — selalu fail-closed.
 * - billingAdmin: grant eksplisit per-anggota (kolom `billing_admin` pada
 *   spesifikasi migration Phase 5.3); default false — tidak pernah diasumsikan.
 */
export function normalizeMembership(record) {
  if (!record || typeof record !== 'object') return null;
  const workspaceId = record.workspaceId || record.workspace_id || null;
  const userId = record.userId || record.user_id || null;
  if (!workspaceId || !userId) return null;
  return {
    workspaceId,
    userId,
    role: record.role || null,
    status: String(record.status || 'ACTIVE').toUpperCase(),
    billingAdmin: record.billingAdmin === true || record.billing_admin === true,
  };
}

/** Apakah record keanggotaan ini aktif (bukan suspended/revoked/asing)? */
export function isMembershipActive(membership) {
  return Boolean(membership) && membership.status === 'ACTIVE';
}

/**
 * Permission check atas record keanggotaan yang SUDAH dinormalisasi.
 * Selalu false untuk keanggotaan tidak aktif / role tidak dikenal /
 * permission tidak dikenal (fail-closed).
 */
export function hasWorkspacePermission(membership, permission) {
  if (!isMembershipActive(membership)) return false;
  if (permission === 'billing:read' || permission === 'billing:use') {
    return BILLING_MEMBER_ROLES.includes(membership.role);
  }
  if (permission === 'billing:review:resolve') {
    return canResolveBillingReview(membership);
  }
  return false;
}

/**
 * Siapa yang boleh menyelesaikan review billing manual (Phase 5.3 B5/D3):
 * - Owner workspace (role SUPER_ADMIN), atau
 * - anggota dengan grant billingAdmin eksplisit.
 * Member biasa (ESTIMATOR/DIREKSI/EDITOR tanpa grant) TIDAK boleh.
 * CLIENT TIDAK pernah boleh — bahkan dengan flag grant yang salah pasang,
 * role CLIENT ditolak eksplisit (pertahanan berlapis).
 */
export function canResolveBillingReview(membership) {
  if (!isMembershipActive(membership)) return false;
  if (membership.role === 'CLIENT') return false;
  if (membership.role === WORKSPACE_OWNER_ROLE) return true;
  return membership.billingAdmin === true;
}

/**
 * Ekstrak workspace id yang DIMINTA dari request (header x-workspace-id,
 * body.workspaceId, atau query.workspaceId). Hasilnya TIDAK TERPERCAYA —
 * ia hanya target; buktikan aksesnya lewat authorizeWorkspaceAccess().
 */
export function requestedWorkspaceId(req) {
  if (!req) return null;
  const header = req.headers && (req.headers['x-workspace-id'] || req.headers['X-Workspace-Id']);
  if (header) return String(header);
  if (req.body && req.body.workspaceId) return String(req.body.workspaceId);
  if (req.query && req.query.workspaceId) return String(req.query.workspaceId);
  return null;
}

/**
 * Keputusan otorisasi workspace lengkap. Urutan pemeriksaan disengaja:
 * autentikasi → identitas → demo → target → keanggotaan → kecocokan
 * record (principal & workspace) → status → permission.
 *
 * @param {object} input
 * @param {object} input.auth — hasil authenticateRequest() (security.js).
 * @param {object} input.membership — record workspace_members MENTAH yang
 *   diambil server-side untuk (workspaceId, auth.user.id); null bila tidak ada.
 * @param {string} input.workspaceId — workspace yang diminta (tidak terpercaya).
 * @param {string} input.permission — salah satu BILLING_PERMISSIONS.
 * @returns {{allow:true, principal:{userId, workspaceId, role, billingAdmin}}
 *          | {allow:false, status, errorCode, error}}
 */
export function authorizeWorkspaceAccess(input) {
  const { auth, membership: rawMembership, workspaceId, permission } = input || {};

  // 1. Autentikasi: gagal total → 401.
  if (!auth || !auth.ok) {
    return deny(401, 'AUTH_REQUIRED', 'Login diperlukan.');
  }
  // 2. Identitas terverifikasi wajib ada. Mode degraded ('none') dan
  //    service-token tidak membawa user id — untuk billing itu berarti
  //    TIDAK ADA principal, dan akses ditolak (tidak ada fallback anonim).
  const user = auth.user;
  if (!user || !user.id) {
    return deny(401, 'AUTH_REQUIRED', 'Identitas terverifikasi diperlukan untuk akses billing.');
  }
  // 3. Identitas demo/anonim (Supabase Anonymous Auth) tidak punya hak billing.
  if (user.isAnonymous) {
    return deny(403, 'DEMO_RESTRICTED', 'Mode demo tidak memiliki akses billing.');
  }
  // 4. Target workspace wajib dinyatakan.
  if (!workspaceId || typeof workspaceId !== 'string') {
    return deny(400, 'WORKSPACE_REQUIRED', 'Workspace aktif wajib ditentukan.');
  }
  // 5. Keanggotaan harus ada dan membuktikan principal ↔ workspace ini.
  const membership = normalizeMembership(rawMembership);
  if (!membership) {
    return deny(403, 'NOT_A_MEMBER', 'Bukan anggota workspace ini.');
  }
  if (membership.userId !== user.id) {
    return deny(403, 'NOT_A_MEMBER', 'Record keanggotaan tidak cocok dengan pengguna.');
  }
  if (membership.workspaceId !== workspaceId) {
    return deny(403, 'WORKSPACE_MISMATCH', 'Record keanggotaan bukan untuk workspace yang diminta.');
  }
  // 6. Status keanggotaan: suspended/revoked = tidak ada akses sama sekali.
  if (!isMembershipActive(membership)) {
    return deny(403, 'MEMBERSHIP_INACTIVE', 'Keanggotaan workspace tidak aktif.');
  }
  // 7. Permission spesifik.
  if (!hasWorkspacePermission(membership, permission)) {
    return deny(403, 'PERMISSION_DENIED', 'Tidak memiliki izin untuk operasi billing ini.');
  }
  return {
    allow: true,
    principal: {
      userId: user.id,
      workspaceId,
      role: membership.role,
      billingAdmin: membership.billingAdmin,
    },
  };
}
