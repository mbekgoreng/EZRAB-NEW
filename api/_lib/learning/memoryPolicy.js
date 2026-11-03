/**
 * api/_lib/learning/memoryPolicy.js — Kebijakan resolusi scope memori
 * (Phase B). Penentu scope SATU-SATUNYA untuk domain memori.
 * ============================================================================
 * Aturan yang ditegakkan (fail-closed di semua cabang, prompt §3.2/§8):
 * - Scope SELALU diturunkan dari konteks aktor tepercaya + bukti otorisasi
 *   eksplisit. Field scope pada output extractor/LLM dan pada request
 *   client TIDAK dibaca sama sekali oleh modul ini — bukan sekadar
 *   diabaikan setelah dibaca: `resolveMemoryScope` tidak menerima field
 *   kandidat apa pun sebagai dasar keputusan.
 * - Kepemilikan TIDAK PERNAH diambil dari input pemanggil; ia diturunkan:
 *   PERSONAL ← aktor, WORKSPACE ← workspace yang terbukti, PROJECT ←
 *   pasangan workspace+project yang terbukti.
 * - Scope yang tidak dapat dipastikan → ditolak (UNRESOLVED_SCOPE). Tidak
 *   ada default ke PERSONAL atau GLOBAL.
 * - GLOBAL dilarang untuk principal user biasa: hanya principal SERVICE
 *   dengan grant governance eksplisit yang lolos kontrak
 *   canActAsGlobalGovernance (layanan governance-nya sendiri BELUM ada —
 *   ini kontrak, bukan implementasi governance).
 *
 * Bukti otorisasi (evidence) adalah INPUT eksplisit dari pemanggil
 * tepercaya (prompt §6.2): modul ini tidak query DB dan tidak membuat
 * adapter membership palsu. Evidence wajib berlabel sumber
 * 'SERVER_MEMBERSHIP_LOOKUP' — evidence yang hanya berupa asersi client
 * ditolak. Record keanggotaan mentah dinormalisasi memakai
 * billingAuthorization.normalizeMembership agar semantik status/role sama
 * dengan domain billing; file billing TIDAK diubah.
 *
 * Sama seperti kontrak lain di fase ini: murni, tanpa I/O, dan BUKAN
 * penegakan production sampai ada pemanggil server tepercaya + adapter
 * membership persisten (Phase 5.4).
 */
import { isMembershipActive, normalizeMembership } from '../billingAuthorization.js';
import {
  failResult,
  isScope,
  normalizeId,
  okResult,
  validateOwnership,
  validateTrustedActor,
  validateUserActor,
} from './memoryContracts.js';
import { isMemoryPermission, roleHasMemoryPermission } from './memoryPermissions.js';

/** Satu-satunya label sumber evidence yang diterima sebagai bukti server. */
export const EVIDENCE_SOURCE_SERVER_LOOKUP = 'SERVER_MEMBERSHIP_LOOKUP';

/**
 * Validasi bukti otorisasi workspace (prompt §7.3) untuk satu permission.
 * Evidence harus: berlabel server, tidak dinyatakan denied, permission-nya
 * cocok dengan yang diminta, dan record keanggotaannya (dinormalisasi)
 * membuktikan aktor ↔ workspace ini, berstatus ACTIVE, dan memegang
 * permission memori tersebut.
 */
export function validateWorkspaceEvidence(evidence, expectation) {
  const { workspaceId, actorUserId, permission } = expectation || {};
  const fail = (rule, message) => failResult('REQUIRES_WORKSPACE_AUTHORIZATION', message, 'workspaceEvidence', rule);
  if (!evidence || typeof evidence !== 'object') return fail('EVIDENCE_REQUIRED', 'Bukti otorisasi workspace tidak ada.');
  if (evidence.source !== EVIDENCE_SOURCE_SERVER_LOOKUP) return fail('EVIDENCE_NOT_SERVER_VERIFIED', 'Bukti otorisasi bukan hasil lookup server-side.');
  if (evidence.denied === true) return fail('PERMISSION_EXPLICITLY_DENIED', 'Permission dinyatakan ditolak secara eksplisit.');
  if (evidence.permission !== permission) return fail('EVIDENCE_PERMISSION_MISMATCH', 'Bukti otorisasi diterbitkan untuk permission lain.');
  const membership = normalizeMembership(evidence.membership);
  if (!membership) return fail('NOT_A_MEMBER', 'Record keanggotaan tidak valid.');
  if (membership.userId !== actorUserId) return fail('NOT_A_MEMBER', 'Record keanggotaan bukan milik aktor.');
  if (membership.workspaceId !== workspaceId) return fail('WORKSPACE_MISMATCH', 'Record keanggotaan bukan untuk workspace target.');
  if (!isMembershipActive(membership)) return fail('MEMBERSHIP_INACTIVE', 'Keanggotaan workspace tidak aktif.');
  if (!roleHasMemoryPermission(membership.role, permission)) return fail('PERMISSION_DENIED', 'Role tidak memegang permission memori ini.');
  return okResult({ membership: Object.freeze(membership) });
}

/**
 * Validasi bukti otorisasi proyek (prompt §7.4): seluruh syarat bukti
 * workspace, DITAMBAH akses proyek terverifikasi yang mengikat projectId
 * ke workspaceId yang sama. Project id dari request saja tidak pernah
 * cukup — evidence harus menyatakan projectAccess === true dari lookup
 * server-side.
 */
export function validateProjectEvidence(evidence, expectation) {
  const { workspaceId, projectId, actorUserId, permission } = expectation || {};
  const fail = (rule, message) => failResult('REQUIRES_PROJECT_AUTHORIZATION', message, 'projectEvidence', rule);
  if (!evidence || typeof evidence !== 'object') return fail('EVIDENCE_REQUIRED', 'Bukti otorisasi proyek tidak ada.');
  if (evidence.source !== EVIDENCE_SOURCE_SERVER_LOOKUP) return fail('EVIDENCE_NOT_SERVER_VERIFIED', 'Bukti otorisasi bukan hasil lookup server-side.');
  if (evidence.denied === true) return fail('PERMISSION_EXPLICITLY_DENIED', 'Permission dinyatakan ditolak secara eksplisit.');
  if (evidence.permission !== permission) return fail('EVIDENCE_PERMISSION_MISMATCH', 'Bukti otorisasi diterbitkan untuk permission lain.');
  if (evidence.projectAccess !== true) return fail('PROJECT_ACCESS_NOT_VERIFIED', 'Akses proyek belum terverifikasi server-side.');
  if (normalizeId(evidence.projectId) !== projectId) return fail('PROJECT_MISMATCH', 'Bukti proyek bukan untuk proyek target.');
  if (normalizeId(evidence.workspaceId) !== workspaceId) return fail('WORKSPACE_PROJECT_MISMATCH', 'Proyek tidak terikat ke workspace target.');
  const membership = normalizeMembership(evidence.membership);
  if (!membership) return fail('NOT_A_MEMBER', 'Record keanggotaan tidak valid.');
  if (membership.userId !== actorUserId) return fail('NOT_A_MEMBER', 'Record keanggotaan bukan milik aktor.');
  if (membership.workspaceId !== workspaceId) return fail('WORKSPACE_PROJECT_MISMATCH', 'Record keanggotaan bukan untuk workspace target.');
  if (!isMembershipActive(membership)) return fail('MEMBERSHIP_INACTIVE', 'Keanggotaan workspace tidak aktif.');
  if (!roleHasMemoryPermission(membership.role, permission)) return fail('PERMISSION_DENIED', 'Role tidak memegang permission memori ini.');
  return okResult({ membership: Object.freeze(membership) });
}

/**
 * Resolusi scope memori dari konteks tepercaya.
 *
 * @param {object} input
 * @param {object} input.actor — aktor tepercaya (kontrak memoryContracts).
 * @param {string} input.requestedScope — scope yang diminta pemanggil
 *   tepercaya (bukan dari extractor/client secara langsung).
 * @param {object} [input.target] — target yang diminta: { workspaceId,
 *   projectId }. Target BUKAN bukti; ia hanya lolos setelah evidence
 *   membuktikannya.
 * @param {string} [input.permission='memory:write'] — permission yang
 *   sedang dievaluasi (penciptaan memori default-nya memory:write).
 * @param {object} [input.workspaceEvidence] — bukti §7.3.
 * @param {object} [input.projectEvidence] — bukti §7.4.
 * Field lain pada input (candidate, extractorScope, ownership, header
 * client, dsb.) SENGAJA tidak dibaca.
 *
 * @returns hasil okResult({ scope, ownership }) atau failResult berkode.
 */
export function resolveMemoryScope(input) {
  const { actor, requestedScope, target, workspaceEvidence, projectEvidence } = input || {};
  const permission = input && input.permission != null ? input.permission : 'memory:write';

  const actorResult = validateUserActor(actor);
  if (!actorResult.ok) return actorResult;

  if (!isMemoryPermission(permission)) {
    return failResult('INVALID', 'Permission memori tidak dikenal.', 'permission', 'PERMISSION_UNKNOWN');
  }
  if (!isScope(requestedScope)) {
    return failResult('UNRESOLVED_SCOPE', 'Scope tidak dapat dipastikan dari konteks tepercaya.', 'requestedScope', 'SCOPE_NOT_RESOLVED');
  }

  const targetWorkspaceId = target ? normalizeId(target.workspaceId) : null;
  const targetProjectId = target ? normalizeId(target.projectId) : null;

  if (requestedScope === 'GLOBAL') {
    return failResult('GLOBAL_SCOPE_FORBIDDEN', 'Principal user tidak dapat membuat record global; gunakan jalur governance.', 'requestedScope', 'GLOBAL_REQUIRES_GOVERNANCE');
  }

  if (requestedScope === 'PERSONAL') {
    if (targetWorkspaceId || targetProjectId) {
      return failResult('INVALID_OWNERSHIP', 'Target workspace/proyek membuat scope personal ambigu.', 'target', 'PERSONAL_TARGET_AMBIGUOUS');
    }
    const ownership = Object.freeze({ userId: normalizeId(actor.userId), workspaceId: null, projectId: null });
    const ownershipResult = validateOwnership('PERSONAL', ownership);
    if (!ownershipResult.ok) return ownershipResult;
    return okResult({ scope: 'PERSONAL', ownership });
  }

  if (requestedScope === 'WORKSPACE') {
    if (!targetWorkspaceId) {
      return failResult('REQUIRES_WORKSPACE_AUTHORIZATION', 'Target workspace wajib dinyatakan.', 'target.workspaceId', 'WORKSPACE_TARGET_REQUIRED');
    }
    if (targetProjectId) {
      return failResult('INVALID_OWNERSHIP', 'Target proyek membuat scope workspace ambigu.', 'target.projectId', 'WORKSPACE_TARGET_AMBIGUOUS');
    }
    const evidence = validateWorkspaceEvidence(workspaceEvidence, {
      workspaceId: targetWorkspaceId,
      actorUserId: normalizeId(actor.userId),
      permission,
    });
    if (!evidence.ok) return evidence;
    const ownership = Object.freeze({ userId: null, workspaceId: targetWorkspaceId, projectId: null });
    return okResult({ scope: 'WORKSPACE', ownership });
  }

  // PROJECT
  if (!targetWorkspaceId) {
    return failResult('REQUIRES_WORKSPACE_AUTHORIZATION', 'Target workspace wajib dinyatakan untuk memori proyek.', 'target.workspaceId', 'WORKSPACE_TARGET_REQUIRED');
  }
  if (!targetProjectId) {
    return failResult('REQUIRES_PROJECT_AUTHORIZATION', 'Target proyek wajib dinyatakan.', 'target.projectId', 'PROJECT_TARGET_REQUIRED');
  }
  const wsEvidence = validateWorkspaceEvidence(workspaceEvidence, {
    workspaceId: targetWorkspaceId,
    actorUserId: normalizeId(actor.userId),
    permission,
  });
  if (!wsEvidence.ok) return wsEvidence;
  const projEvidence = validateProjectEvidence(projectEvidence, {
    workspaceId: targetWorkspaceId,
    projectId: targetProjectId,
    actorUserId: normalizeId(actor.userId),
    permission,
  });
  if (!projEvidence.ok) return projEvidence;
  const ownership = Object.freeze({ userId: null, workspaceId: targetWorkspaceId, projectId: targetProjectId });
  return okResult({ scope: 'PROJECT', ownership });
}

/**
 * Kontrak principal governance global: hanya principal SERVICE
 * terverifikasi dengan grant eksplisit `globalGovernance === true`.
 * Principal user — termasuk owner workspace — TIDAK pernah lolos.
 * Ini hanya kontrak pemeriksaan; layanan governance belum ada.
 */
export function canActAsGlobalGovernance(actor) {
  if (!actor || typeof actor !== 'object') return false;
  if (actor.principalType !== 'SERVICE') return false;
  if (actor.globalGovernance !== true) return false;
  return validateTrustedActor(actor).ok;
}

/**
 * Otorisasi publikasi record GLOBAL. Ditolak untuk semua principal
 * kecuali governance (canActAsGlobalGovernance). Record non-GLOBAL
 * ditolak sebagai salah jalur.
 */
export function authorizeGlobalPublication(input) {
  const { actor, record } = input || {};
  if (!record || record.scope !== 'GLOBAL') {
    return failResult('INVALID', 'Publikasi global hanya berlaku untuk record GLOBAL.', 'record.scope', 'GLOBAL_RECORD_REQUIRED');
  }
  if (!canActAsGlobalGovernance(actor)) {
    return failResult('GLOBAL_SCOPE_FORBIDDEN', 'Publikasi global memerlukan principal governance yang berwenang.', 'actor', 'GLOBAL_GOVERNANCE_REQUIRED');
  }
  return okResult();
}
