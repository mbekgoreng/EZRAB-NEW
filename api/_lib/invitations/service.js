/**
 * api/_lib/invitations/service.js — orkestrasi Secure Invitation (Fase C/H).
 *
 * Semua keputusan otorisasi diambil dari data otoritatif server-side:
 * - Identitas aktor HANYA dari JWT terverifikasi (bukan body request).
 * - Hak mengundang: keanggotaan workspace aktor dengan role SUPER_ADMIN
 *   (dicek ke repository). Platform admin global tidak diasumsikan.
 * - Role/workspace penerima HANYA dari baris undangan yang tersimpan;
 *   request penebusan tidak dapat menggantinya.
 * - Audit event dicatat tanpa token/password (invitation.created dsb.).
 *
 * Hasil berupa objek { ok, status, ... } agar endpoint tipis dan service
 * mudah diuji dengan repository in-memory + provider email mock.
 */
import {
  DEFAULT_EXPIRY_HOURS,
  PUBLIC_INVALID_MESSAGE,
  buildInvitationLink,
  computeExpiresAt,
  effectiveStatus,
  generateInvitationToken,
  hashInvitationToken,
  isPlausibleToken,
  normalizeEmail,
  safeAdminView,
  safePublicSummary,
  validateCreateInput,
} from './core.js';

function fail(status, error, extra = {}) {
  return { ok: false, status, error, ...extra };
}

async function requireWorkspaceAdmin(repo, actor, workspaceId) {
  if (!actor || !actor.id) return null;
  const membership = await repo.getMembership(workspaceId, actor.id);
  if (!membership || membership.role !== 'SUPER_ADMIN') return null;
  return membership;
}

export async function createInvitation(deps, actor, input) {
  const { repo, emailProvider, baseUrl, nowMs } = deps;
  const now = nowMs ?? Date.now();
  const { errors, value } = validateCreateInput(input || {});
  if (errors.length) return fail(400, 'VALIDATION', { messages: errors });

  const workspace = await repo.getWorkspace(value.workspaceId);
  if (!workspace) return fail(404, 'WORKSPACE_NOT_FOUND', { message: 'Workspace/perusahaan tidak ditemukan.' });

  const admin = await requireWorkspaceAdmin(repo, actor, value.workspaceId);
  if (!admin) {
    return fail(403, 'FORBIDDEN', { message: 'Anda tidak memiliki izin mengundang anggota ke workspace ini.' });
  }

  const pending = await repo.findPendingByEmail(value.workspaceId, value.email);
  if (pending && effectiveStatus(pending, now) === 'PENDING') {
    return fail(409, 'DUPLICATE_PENDING', {
      message: 'Masih ada undangan aktif untuk email ini di workspace yang sama. Batalkan atau kirim ulang undangan tersebut.',
    });
  }

  const rawToken = generateInvitationToken();
  const expiresAt = computeExpiresAt(now, value.expiryHours ?? DEFAULT_EXPIRY_HOURS);
  let invitation;
  try {
    invitation = await repo.insertInvitation({
      workspace_id: value.workspaceId,
      email: value.email,
      invitee_name: value.name,
      role: value.role,
      token_hash: hashInvitationToken(rawToken),
      status: 'PENDING',
      email_status: 'not_sent',
      email_provider: null,
      project_ids: value.projectIds,
      created_by: actor.id,
      expires_at: expiresAt.toISOString(),
    });
  } catch (e) {
    if (e && e.code === 'DUPLICATE_PENDING') {
      return fail(409, 'DUPLICATE_PENDING', {
        message: 'Masih ada undangan aktif untuk email ini di workspace yang sama.',
      });
    }
    throw e;
  }

  await repo.insertAudit({ userId: actor.id, workspaceId: value.workspaceId, eventCode: 'invitation.created' });

  // Email: kegagalan TIDAK menggagalkan undangan dan TIDAK memalsukan
  // status. Token mentah diteruskan ke provider hanya untuk badan email.
  const link = buildInvitationLink(baseUrl, rawToken);
  let emailResult = { delivered: false, status: 'not_sent', provider: emailProvider?.name || 'none', reason: 'no_provider' };
  if (emailProvider) {
    emailResult = await emailProvider.sendInvitationEmail({
      to: value.email,
      inviteeName: value.name,
      companyName: workspace.name,
      role: value.role,
      link,
      expiresAtIso: expiresAt.toISOString(),
    });
  }
  const emailStatus = emailResult.delivered ? 'sent' : (emailResult.status === 'failed' ? 'failed' : 'not_sent');
  invitation = await repo.updateInvitation(invitation.id, {
    email_status: emailStatus,
    email_provider: emailResult.provider || null,
  });
  await repo.insertAudit({
    userId: actor.id,
    workspaceId: value.workspaceId,
    eventCode: emailResult.delivered ? 'invitation.email_sent' : 'invitation.email_not_sent',
  });

  return {
    ok: true,
    status: 201,
    invitation: safeAdminView(invitation, now),
    // Token mentah + link hanya tersedia SEKALI di sini (jalur aman admin
    // yang baru saja membuatnya). Tidak disimpan, tidak dapat ditampilkan
    // ulang — untuk membagikan lagi gunakan resend (token baru).
    rawToken,
    link,
    email: { status: emailStatus, provider: emailResult.provider || null },
  };
}

export async function validateInvitationToken(deps, token) {
  const { repo, nowMs } = deps;
  const now = nowMs ?? Date.now();
  // Satu respons generik untuk semua kegagalan (anti-enumerasi).
  if (!isPlausibleToken(token)) return fail(404, 'INVALID', { message: PUBLIC_INVALID_MESSAGE });
  const invitation = await repo.findByTokenHash(hashInvitationToken(token));
  if (!invitation) return fail(404, 'INVALID', { message: PUBLIC_INVALID_MESSAGE });
  const status = effectiveStatus(invitation, now);
  if (status !== 'PENDING') {
    return fail(410, 'NOT_REDEEMABLE', { message: PUBLIC_INVALID_MESSAGE, invitationStatus: status });
  }
  const workspace = await repo.getWorkspace(invitation.workspace_id);
  return {
    ok: true,
    status: 200,
    summary: safePublicSummary(invitation, workspace?.name || '', now),
  };
}

export async function redeemInvitation(deps, user, token) {
  const { repo, nowMs } = deps;
  const now = nowMs ?? Date.now();
  if (!user || !user.id || !user.email) {
    return fail(401, 'AUTH_REQUIRED', { message: 'Login diperlukan untuk menerima undangan.' });
  }
  if (!isPlausibleToken(token)) return fail(404, 'INVALID', { message: PUBLIC_INVALID_MESSAGE });
  const tokenHash = hashInvitationToken(token);
  const invitation = await repo.findByTokenHash(tokenHash);
  if (!invitation) return fail(404, 'INVALID', { message: PUBLIC_INVALID_MESSAGE });

  const result = await repo.acceptAtomic({
    tokenHash,
    userId: user.id,
    email: normalizeEmail(user.email),
    nowMs: now,
  });

  const statusByResult = {
    accepted: null,
    invalid: [404, 'INVALID', PUBLIC_INVALID_MESSAGE],
    expired: [410, 'EXPIRED', 'Undangan sudah kedaluwarsa. Minta admin mengirim ulang undangan Anda.'],
    already_used: [410, 'ALREADY_USED', 'Undangan ini sudah digunakan. Silakan login dengan akun Anda.'],
    revoked: [410, 'REVOKED', 'Undangan ini telah dibatalkan oleh admin.'],
    email_mismatch: [403, 'EMAIL_MISMATCH', 'Akun yang login tidak sesuai dengan email penerima undangan.'],
    already_member_other_role: [409, 'ALREADY_MEMBER', 'Akun ini sudah menjadi anggota workspace dengan role lain. Hubungi admin workspace.'],
  };
  if (result !== 'accepted') {
    const [status, error, message] = statusByResult[result] || statusByResult.invalid;
    return fail(status, error, { message });
  }
  await repo.insertAudit({ userId: user.id, workspaceId: invitation.workspace_id, eventCode: 'invitation.accepted' });
  const workspace = await repo.getWorkspace(invitation.workspace_id);
  return {
    ok: true,
    status: 200,
    workspace: { id: invitation.workspace_id, name: workspace?.name || '' },
    role: invitation.role,
  };
}

export async function revokeInvitation(deps, actor, invitationId) {
  const { repo, nowMs } = deps;
  const now = nowMs ?? Date.now();
  const invitation = await repo.findById(String(invitationId || ''));
  if (!invitation) return fail(404, 'NOT_FOUND', { message: 'Undangan tidak ditemukan.' });
  const admin = await requireWorkspaceAdmin(repo, actor, invitation.workspace_id);
  if (!admin) return fail(403, 'FORBIDDEN', { message: 'Anda tidak memiliki izin mengelola undangan workspace ini.' });
  if (invitation.status !== 'PENDING') {
    return fail(409, 'NOT_PENDING', { message: 'Hanya undangan berstatus Pending yang dapat dibatalkan.' });
  }
  const updated = await repo.updateInvitation(invitation.id, { status: 'REVOKED' });
  await repo.insertAudit({ userId: actor.id, workspaceId: invitation.workspace_id, eventCode: 'invitation.revoked' });
  return { ok: true, status: 200, invitation: safeAdminView(updated, now) };
}

export async function resendInvitation(deps, actor, invitationId) {
  const { repo, emailProvider, baseUrl, nowMs } = deps;
  const now = nowMs ?? Date.now();
  const old = await repo.findById(String(invitationId || ''));
  if (!old) return fail(404, 'NOT_FOUND', { message: 'Undangan tidak ditemukan.' });
  const admin = await requireWorkspaceAdmin(repo, actor, old.workspace_id);
  if (!admin) return fail(403, 'FORBIDDEN', { message: 'Anda tidak memiliki izin mengelola undangan workspace ini.' });
  const oldStatus = effectiveStatus(old, now);
  if (oldStatus === 'ACCEPTED') {
    return fail(409, 'ALREADY_ACCEPTED', { message: 'Undangan ini sudah diterima; tidak dapat dikirim ulang.' });
  }
  if (oldStatus === 'REVOKED') {
    return fail(409, 'REVOKED', { message: 'Undangan yang dibatalkan tidak dapat diaktifkan kembali. Buat undangan baru.' });
  }

  // Cabut token lama TERLEBIH DAHULU, lalu terbitkan undangan baru dengan
  // token + expiry baru. Token lama tidak pernah diaktifkan kembali.
  if (old.status === 'PENDING') {
    await repo.updateInvitation(old.id, { status: 'REVOKED' });
  }
  const workspace = await repo.getWorkspace(old.workspace_id);
  const rawToken = generateInvitationToken();
  const expiresAt = computeExpiresAt(now, DEFAULT_EXPIRY_HOURS);
  let invitation = await repo.insertInvitation({
    workspace_id: old.workspace_id,
    email: old.email,
    invitee_name: old.invitee_name,
    role: old.role,
    token_hash: hashInvitationToken(rawToken),
    status: 'PENDING',
    email_status: 'not_sent',
    email_provider: null,
    project_ids: old.project_ids || [],
    created_by: actor.id,
    resend_of: old.id,
    expires_at: expiresAt.toISOString(),
  });
  await repo.insertAudit({ userId: actor.id, workspaceId: old.workspace_id, eventCode: 'invitation.resent' });

  const link = buildInvitationLink(baseUrl, rawToken);
  let emailResult = { delivered: false, status: 'not_sent', provider: emailProvider?.name || 'none' };
  if (emailProvider) {
    emailResult = await emailProvider.sendInvitationEmail({
      to: old.email,
      inviteeName: old.invitee_name,
      companyName: workspace?.name || '',
      role: old.role,
      link,
      expiresAtIso: expiresAt.toISOString(),
    });
  }
  const emailStatus = emailResult.delivered ? 'sent' : (emailResult.status === 'failed' ? 'failed' : 'not_sent');
  invitation = await repo.updateInvitation(invitation.id, {
    email_status: emailStatus,
    email_provider: emailResult.provider || null,
  });
  return {
    ok: true,
    status: 201,
    invitation: safeAdminView(invitation, now),
    rawToken,
    link,
    email: { status: emailStatus, provider: emailResult.provider || null },
  };
}

export async function listInvitations(deps, actor, workspaceId, filter = 'ALL') {
  const { repo, nowMs } = deps;
  const now = nowMs ?? Date.now();
  const wsId = String(workspaceId || '').trim();
  if (!wsId) return fail(400, 'VALIDATION', { messages: ['Workspace wajib ditentukan.'] });
  // Daftar undangan hanya untuk admin workspace itu sendiri — pengguna
  // tidak dapat melihat undangan workspace lain (bahkan keberadaannya
  // tidak dikonfirmasi di luar pesan generik FORBIDDEN).
  const admin = await requireWorkspaceAdmin(repo, actor, wsId);
  if (!admin) return fail(403, 'FORBIDDEN', { message: 'Anda tidak memiliki izin melihat undangan workspace ini.' });
  const rows = await repo.listByWorkspace(wsId);
  const views = rows.map((r) => safeAdminView(r, now));
  const f = String(filter || 'ALL').toUpperCase();
  const filtered = views.filter((v) => {
    if (f === 'ALL') return true;
    if (f === 'AKTIF') return v.status === 'ACCEPTED';
    if (f === 'PENDING') return v.status === 'PENDING';
    if (f === 'KEDALUWARSA') return v.status === 'EXPIRED';
    if (f === 'DIBATALKAN') return v.status === 'REVOKED';
    return true;
  });
  return { ok: true, status: 200, invitations: filtered };
}
