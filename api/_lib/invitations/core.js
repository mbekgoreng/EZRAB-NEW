/**
 * api/_lib/invitations/core.js — domain murni Secure Invitation (Fase B/C/H).
 *
 * Tidak menyentuh network/DB: semua fungsi di sini deterministik dan
 * ter-unit-test (src/test/secureInvitation.test.ts).
 *
 * Aturan yang dikunci di sini (dan ditegakkan lagi di DB + service):
 * - Token: 32 byte acak kriptografis (node:crypto), base64url. Yang disimpan
 *   HANYA hash SHA-256 hex-nya — pola yang sama dengan accessGate.js.
 * - Expiry default tepat 24 jam dari waktu pembuatan (waktu server).
 * - Role yang boleh diundang: ESTIMATOR, DIREKSI, CLIENT, EDITOR.
 *   SUPER_ADMIN (dan role apa pun di luar daftar) DITOLAK untuk undangan
 *   biasa.
 * - Status: PENDING | ACCEPTED | EXPIRED | REVOKED. EXPIRED dihitung saat
 *   dibaca (effectiveStatus) DAN ditegakkan saat penebusan.
 * - Respons publik anti-enumerasi: satu pesan generik untuk semua kegagalan
 *   validasi token.
 */
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export const INVITABLE_ROLES = Object.freeze(['ESTIMATOR', 'DIREKSI', 'CLIENT', 'EDITOR']);
export const PRIVILEGED_ROLES = Object.freeze(['SUPER_ADMIN']);
export const DEFAULT_EXPIRY_HOURS = 24;
export const MAX_EXPIRY_HOURS = 24 * 7;
export const INVITATION_STATUSES = Object.freeze(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']);

/** Pesan generik untuk semua kegagalan validasi publik (anti-enumerasi). */
export const PUBLIC_INVALID_MESSAGE =
  'Tautan undangan tidak valid atau sudah tidak berlaku. Minta admin workspace mengirim ulang undangan Anda.';

export function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  const e = normalizeEmail(email);
  return e.length >= 3 && e.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function isInvitableRole(role) {
  return INVITABLE_ROLES.includes(String(role || '').trim().toUpperCase());
}

export function normalizeRole(role) {
  return String(role || '').trim().toUpperCase();
}

/** Token mentah — hanya hidup di respons pembuatan/resend + email penerima. */
export function generateInvitationToken() {
  return randomBytes(32).toString('base64url');
}

/** Hash yang disimpan di DB. Token mentah tidak pernah disimpan. */
export function hashInvitationToken(token) {
  return createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

/** Bandingkan hash secara constant-time (untuk jalur yang membandingkan). */
export function tokenHashMatches(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function isPlausibleToken(token) {
  // 32 byte base64url = 43 karakter tanpa padding.
  return typeof token === 'string' && /^[A-Za-z0-9_-]{40,48}$/.test(token);
}

export function computeExpiresAt(nowMs, expiryHours) {
  const hours = Number.isFinite(expiryHours) && expiryHours > 0 ? expiryHours : DEFAULT_EXPIRY_HOURS;
  const clamped = Math.min(hours, MAX_EXPIRY_HOURS);
  return new Date(nowMs + clamped * 60 * 60 * 1000);
}

/** Status efektif: PENDING yang melewati expires_at terbaca sebagai EXPIRED. */
export function effectiveStatus(invitation, nowMs) {
  if (!invitation) return 'EXPIRED';
  if (invitation.status === 'PENDING' && new Date(invitation.expires_at).getTime() <= nowMs) {
    return 'EXPIRED';
  }
  return invitation.status;
}

/**
 * Ringkasan AMAN untuk halaman penerimaan publik: hanya perusahaan, role,
 * nama penerima, status, dan masa berlaku. TIDAK memuat token, hash, id
 * internal, email lengkap (dimask), atau data pembuat undangan.
 */
export function safePublicSummary(invitation, workspaceName, nowMs) {
  return {
    company: workspaceName || '',
    role: invitation.role,
    inviteeName: invitation.invitee_name || '',
    emailMasked: maskEmail(invitation.email),
    status: effectiveStatus(invitation, nowMs),
    expiresAt: new Date(invitation.expires_at).toISOString(),
  };
}

/** Baris aman untuk UI manajemen: tanpa token_hash, tanpa token mentah. */
export function safeAdminView(invitation, nowMs) {
  return {
    id: invitation.id,
    workspaceId: invitation.workspace_id,
    email: invitation.email,
    inviteeName: invitation.invitee_name || '',
    role: invitation.role,
    status: effectiveStatus(invitation, nowMs),
    storedStatus: invitation.status,
    emailStatus: invitation.email_status || 'not_sent',
    emailProvider: invitation.email_provider || null,
    projectIds: invitation.project_ids || [],
    resendOf: invitation.resend_of || null,
    createdBy: invitation.created_by,
    createdAt: invitation.created_at,
    expiresAt: invitation.expires_at,
    acceptedAt: invitation.accepted_at || null,
    acceptedBy: invitation.accepted_by || null,
  };
}

export function maskEmail(email) {
  const e = normalizeEmail(email);
  const at = e.indexOf('@');
  if (at <= 0) return '***';
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const shown = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${shown}***@${domain}`;
}

/**
 * Base URL publik untuk link undangan.
 * Prioritas: env eksplisit (PUBLIC_APP_URL / APP_PUBLIC_URL /
 * INVITATION_BASE_URL) → origin request. TIDAK PERNAH hardcoded ke URL
 * preview Vercel; bila env menunjuk vercel.app saat VERCEL_ENV=production,
 * env itu diabaikan (guard anti-salah-konfigurasi).
 */
export function resolvePublicBaseUrl(env = process.env, requestOrigin = '') {
  const candidates = [env.PUBLIC_APP_URL, env.APP_PUBLIC_URL, env.INVITATION_BASE_URL];
  const isProd = String(env.VERCEL_ENV || '').toLowerCase() === 'production';
  for (const c of candidates) {
    const v = String(c || '').trim().replace(/\/+$/, '');
    if (!v) continue;
    if (isProd && /vercel\.app/i.test(v)) continue;
    if (/^https?:\/\//i.test(v)) return v;
  }
  const origin = String(requestOrigin || '').trim().replace(/\/+$/, '');
  return origin || '';
}

export function buildInvitationLink(baseUrl, rawToken) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  return `${base}/accept-invitation/${encodeURIComponent(rawToken)}`;
}

/** Validasi payload pembuatan undangan (server-side, otoritatif). */
export function validateCreateInput(input) {
  const errors = [];
  const name = String(input?.name || '').trim();
  const email = normalizeEmail(input?.email);
  const role = normalizeRole(input?.role || 'ESTIMATOR');
  const workspaceId = String(input?.workspaceId || '').trim();
  if (name.length < 2 || name.length > 160) errors.push('Nama anggota wajib diisi (2–160 karakter).');
  if (!isValidEmail(email)) errors.push('Format alamat email tidak valid.');
  if (!workspaceId) errors.push('Workspace/perusahaan tujuan wajib ditentukan.');
  if (PRIVILEGED_ROLES.includes(role)) {
    errors.push('Role Super Admin tidak dapat diberikan melalui undangan biasa.');
  } else if (!isInvitableRole(role)) {
    errors.push('Role tidak termasuk role yang boleh diundang.');
  }
  const expiryHours = input?.expiryHours == null ? DEFAULT_EXPIRY_HOURS : Number(input.expiryHours);
  if (!Number.isFinite(expiryHours) || expiryHours <= 0 || expiryHours > MAX_EXPIRY_HOURS) {
    errors.push('Masa berlaku tidak valid (maksimum 7 hari).');
  }
  const projectIds = Array.isArray(input?.projectIds)
    ? input.projectIds.map((p) => String(p)).filter(Boolean).slice(0, 100)
    : [];
  return { errors, value: { name, email, role, workspaceId, expiryHours, projectIds } };
}
