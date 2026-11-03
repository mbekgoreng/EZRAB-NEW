/**
 * Test: Continuous User Learning Phase B — kontrak data, kepemilikan &
 * kebijakan memori (domain murni api/_lib/learning/).
 * Dijalankan via esbuild + vitest shim (pola sama seperti suite lain).
 *
 * Nomor kasus mengikuti §12 master prompt Phase B. Semua tes menjalankan
 * perilaku modul yang sebenarnya (bukan asersi string sumber), tanpa
 * jaringan, tanpa Supabase live, tanpa API key.
 */
import { describe, it, expect } from 'vitest';
import {
  validateOwnership,
  validateTrustedActor,
  validateUserActor,
} from '../../api/_lib/learning/memoryContracts.js';
import {
  authorizeGlobalPublication,
  canActAsGlobalGovernance,
  resolveMemoryScope,
} from '../../api/_lib/learning/memoryPolicy.js';
import { roleHasMemoryPermission } from '../../api/_lib/learning/memoryPermissions.js';
import {
  isRetrievableRecord,
  validateConfidence,
  validateLifecycleTransition,
  validateMemoryRecord,
} from '../../api/_lib/learning/memoryValidation.js';

const T0 = 1_800_000_000_000;

const actorA: any = {
  principalType: 'USER',
  userId: 'user-a',
  identityProvider: 'SUPABASE_AUTH',
  identityVerified: true,
  authenticatedAt: T0,
};

const serviceActor: any = {
  principalType: 'SERVICE',
  serviceId: 'extraction-worker',
  identityProvider: 'SUPABASE_AUTH',
  identityVerified: true,
};

const governanceActor: any = {
  principalType: 'SERVICE',
  serviceId: 'global-governance',
  identityProvider: 'SUPABASE_AUTH',
  identityVerified: true,
  globalGovernance: true,
};

function membership(workspaceId: string, userId: string, role = 'ESTIMATOR', status = 'ACTIVE') {
  // Bentuk baris DB (snake_case) — dinormalisasi billingAuthorization.
  return { workspace_id: workspaceId, user_id: userId, role, status };
}

function wsEvidence(workspaceId: string, userId: string, permission = 'memory:write', overrides: any = {}) {
  return {
    membership: membership(workspaceId, userId),
    permission,
    decidedAt: T0,
    source: 'SERVER_MEMBERSHIP_LOOKUP',
    ...overrides,
  };
}

function projEvidence(workspaceId: string, projectId: string, userId: string, permission = 'memory:write', overrides: any = {}) {
  return {
    projectId,
    workspaceId,
    projectAccess: true,
    membership: membership(workspaceId, userId),
    permission,
    decidedAt: T0,
    source: 'SERVER_MEMBERSHIP_LOOKUP',
    ...overrides,
  };
}

function baseRecord(overrides: any = {}) {
  return {
    scope: 'PERSONAL',
    ownership: { userId: 'user-a', workspaceId: null, projectId: null },
    category: 'PREFERENCE',
    status: 'APPROVED',
    content: 'Format RAB mengikuti struktur bab standar pemilik.',
    confidence: 0.9,
    source: {
      sourceType: 'USER_INSTRUCTION',
      sourceId: 'msg-001',
      sourceCreatedAt: T0,
      capturedAt: T0,
      origin: 'CHAT',
      validationStatus: 'UNVERIFIED',
    },
    dataClassification: 'INTERNAL',
    createdAt: T0,
    updatedAt: T0,
    expiresAt: null,
    ...overrides,
  };
}

const WS_OWNERSHIP = { userId: null, workspaceId: 'ws-a', projectId: null };

describe('Phase B — identitas tepercaya (§12 kasus 1–6)', () => {
  it('1. user terverifikasi diterima untuk scope PERSONAL', () => {
    const r = resolveMemoryScope({ actor: actorA, requestedScope: 'PERSONAL' });
    expect(r.ok).toBe(true);
    expect((r as any).scope).toBe('PERSONAL');
    expect((r as any).ownership.userId).toBe('user-a');
  });

  it('2. user hilang ditolak', () => {
    expect(resolveMemoryScope({ actor: null, requestedScope: 'PERSONAL' }).code).toBe('REQUIRES_AUTHENTICATION');
    const noId = { ...actorA, userId: undefined };
    expect(resolveMemoryScope({ actor: noId, requestedScope: 'PERSONAL' }).ok).toBe(false);
  });

  it('3. user id kosong ditolak', () => {
    const empty = { ...actorA, userId: '   ' };
    expect(validateUserActor(empty).ok).toBe(false);
    expect(resolveMemoryScope({ actor: empty, requestedScope: 'PERSONAL' }).ok).toBe(false);
  });

  it('4. identityVerified: false ditolak', () => {
    const unverified = { ...actorA, identityVerified: false };
    expect(validateUserActor(unverified).code).toBe('REQUIRES_AUTHENTICATION');
  });

  it('5. identitas kiriman client tidak dapat memenuhi kontrak aktor', () => {
    const claimOnly: any = { userId: 'user-a', role: 'SUPER_ADMIN' };
    expect(validateUserActor(claimOnly).ok).toBe(false);
    const headerShape: any = { 'x-user-id': 'user-a', 'x-user-role': 'SUPER_ADMIN', 'x-workspace-id': 'ws-a' };
    expect(validateUserActor(headerShape).ok).toBe(false);
    const noProvider: any = { principalType: 'USER', userId: 'user-a', identityVerified: true };
    expect(validateUserActor(noProvider).ok).toBe(false);
  });

  it('6. principal service tidak dapat menyamar sebagai user', () => {
    expect(validateTrustedActor(serviceActor).ok).toBe(true);
    expect(validateUserActor(serviceActor).ok).toBe(false);
    expect(resolveMemoryScope({ actor: serviceActor, requestedScope: 'PERSONAL' }).ok).toBe(false);
  });
});

describe('Phase B — kepemilikan struktural (§12 kasus 7–14)', () => {
  it('7. PERSONAL mensyaratkan kepemilikan user saja', () => {
    expect(validateOwnership('PERSONAL', { userId: 'user-a', workspaceId: null, projectId: null }).ok).toBe(true);
  });

  it('8. PERSONAL menolak kepemilikan workspace', () => {
    const r = validateOwnership('PERSONAL', { userId: 'user-a', workspaceId: 'ws-a', projectId: null });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_OWNERSHIP');
  });

  it('9. WORKSPACE mensyaratkan kepemilikan workspace', () => {
    expect(validateOwnership('WORKSPACE', { userId: null, workspaceId: 'ws-a', projectId: null }).ok).toBe(true);
  });

  it('10. WORKSPACE menolak kepemilikan proyek', () => {
    expect(validateOwnership('WORKSPACE', { userId: null, workspaceId: 'ws-a', projectId: 'project-a' }).ok).toBe(false);
  });

  it('11. PROJECT mensyaratkan workspace + proyek', () => {
    expect(validateOwnership('PROJECT', { userId: null, workspaceId: 'ws-a', projectId: 'project-a' }).ok).toBe(true);
  });

  it('12. PROJECT menolak workspace yang hilang', () => {
    expect(validateOwnership('PROJECT', { userId: null, workspaceId: null, projectId: 'project-a' }).ok).toBe(false);
  });

  it('13. PROJECT menolak proyek yang hilang', () => {
    expect(validateOwnership('PROJECT', { userId: null, workspaceId: 'ws-a', projectId: null }).ok).toBe(false);
  });

  it('14. GLOBAL menolak semua field owner tenant', () => {
    expect(validateOwnership('GLOBAL', { userId: 'user-a', workspaceId: null, projectId: null }).ok).toBe(false);
    expect(validateOwnership('GLOBAL', { userId: null, workspaceId: 'ws-a', projectId: null }).ok).toBe(false);
    expect(validateOwnership('GLOBAL', { userId: null, workspaceId: null, projectId: null }).ok).toBe(true);
  });
});

describe('Phase B — otorisasi workspace/proyek (§12 kasus 15–21)', () => {
  it('15. scope WORKSPACE menolak bukti keanggotaan yang hilang', () => {
    const r = resolveMemoryScope({ actor: actorA, requestedScope: 'WORKSPACE', target: { workspaceId: 'ws-a' } });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('REQUIRES_WORKSPACE_AUTHORIZATION');
  });

  it('16. scope WORKSPACE menolak keanggotaan SUSPENDED', () => {
    const ev = wsEvidence('ws-a', 'user-a', 'memory:write', { membership: membership('ws-a', 'user-a', 'ESTIMATOR', 'SUSPENDED') });
    const r = resolveMemoryScope({ actor: actorA, requestedScope: 'WORKSPACE', target: { workspaceId: 'ws-a' }, workspaceEvidence: ev });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('REQUIRES_WORKSPACE_AUTHORIZATION');
  });

  it('17. scope WORKSPACE menolak keanggotaan REVOKED', () => {
    const ev = wsEvidence('ws-a', 'user-a', 'memory:write', { membership: membership('ws-a', 'user-a', 'ESTIMATOR', 'REVOKED') });
    expect(resolveMemoryScope({ actor: actorA, requestedScope: 'WORKSPACE', target: { workspaceId: 'ws-a' }, workspaceEvidence: ev }).ok).toBe(false);
  });

  it('18. scope WORKSPACE menolak bukti untuk workspace lain (mismatch)', () => {
    const ev = wsEvidence('ws-b', 'user-a');
    const r = resolveMemoryScope({ actor: actorA, requestedScope: 'WORKSPACE', target: { workspaceId: 'ws-a' }, workspaceEvidence: ev });
    expect(r.ok).toBe(false);
    expect((r as any).rule).toBe('WORKSPACE_MISMATCH');
  });

  it('19. scope PROJECT menolak bukti proyek yang hilang', () => {
    const r = resolveMemoryScope({
      actor: actorA,
      requestedScope: 'PROJECT',
      target: { workspaceId: 'ws-a', projectId: 'project-a' },
      workspaceEvidence: wsEvidence('ws-a', 'user-a'),
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('REQUIRES_PROJECT_AUTHORIZATION');
  });

  it('20. scope PROJECT menolak bukti proyek yang terikat workspace lain', () => {
    const r = resolveMemoryScope({
      actor: actorA,
      requestedScope: 'PROJECT',
      target: { workspaceId: 'ws-a', projectId: 'project-a' },
      workspaceEvidence: wsEvidence('ws-a', 'user-a'),
      projectEvidence: projEvidence('ws-b', 'project-a', 'user-a'),
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('REQUIRES_PROJECT_AUTHORIZATION');
  });

  it('21. permission yang ditolak eksplisit / tidak cocok ditolak', () => {
    const denied = wsEvidence('ws-a', 'user-a', 'memory:write', { denied: true });
    expect(resolveMemoryScope({ actor: actorA, requestedScope: 'WORKSPACE', target: { workspaceId: 'ws-a' }, workspaceEvidence: denied }).ok).toBe(false);
    const wrongPermission = wsEvidence('ws-a', 'user-a', 'memory:read');
    expect(resolveMemoryScope({ actor: actorA, requestedScope: 'WORKSPACE', target: { workspaceId: 'ws-a' }, workspaceEvidence: wrongPermission }).ok).toBe(false);
    const clientRole = wsEvidence('ws-a', 'user-a', 'memory:write', { membership: membership('ws-a', 'user-a', 'CLIENT', 'ACTIVE') });
    expect(resolveMemoryScope({ actor: actorA, requestedScope: 'WORKSPACE', target: { workspaceId: 'ws-a' }, workspaceEvidence: clientRole }).ok).toBe(false);
  });

  it('15b. scope WORKSPACE/PROJECT lolos dengan bukti server yang sah', () => {
    const ws = resolveMemoryScope({ actor: actorA, requestedScope: 'WORKSPACE', target: { workspaceId: 'ws-a' }, workspaceEvidence: wsEvidence('ws-a', 'user-a') });
    expect(ws.ok).toBe(true);
    expect((ws as any).ownership).toEqual({ userId: null, workspaceId: 'ws-a', projectId: null });
    const pr = resolveMemoryScope({
      actor: actorA,
      requestedScope: 'PROJECT',
      target: { workspaceId: 'ws-a', projectId: 'project-a' },
      workspaceEvidence: wsEvidence('ws-a', 'user-a'),
      projectEvidence: projEvidence('ws-a', 'project-a', 'user-a'),
    });
    expect(pr.ok).toBe(true);
    expect((pr as any).ownership).toEqual({ userId: null, workspaceId: 'ws-a', projectId: 'project-a' });
  });
});

describe('Phase B — kebijakan scope (§12 kasus 22–25)', () => {
  it('22. scope tidak dapat ditetapkan oleh output extractor', () => {
    const candidateOnly: any = { actor: actorA, candidate: { scope: 'GLOBAL', content: 'apapun' } };
    const r = resolveMemoryScope(candidateOnly);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('UNRESOLVED_SCOPE');
    const withTrusted: any = {
      actor: actorA,
      requestedScope: 'PERSONAL',
      candidate: { scope: 'GLOBAL', ownership: { userId: 'user-b', workspaceId: 'ws-b', projectId: null } },
    };
    const r2 = resolveMemoryScope(withTrusted);
    expect(r2.ok).toBe(true);
    expect((r2 as any).scope).toBe('PERSONAL');
    expect((r2 as any).ownership.userId).toBe('user-a');
  });

  it('23. scope yang tak terpecahkan gagal tertutup (tanpa default)', () => {
    expect(resolveMemoryScope({ actor: actorA }).code).toBe('UNRESOLVED_SCOPE');
    expect(resolveMemoryScope({ actor: actorA, requestedScope: 'SIDEWAYS' }).code).toBe('UNRESOLVED_SCOPE');
  });

  it('24. aktor biasa tidak dapat membuat memori GLOBAL', () => {
    const r = resolveMemoryScope({ actor: actorA, requestedScope: 'GLOBAL' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('GLOBAL_SCOPE_FORBIDDEN');
  });

  it('25. aktor biasa tidak dapat mempublikasikan pengetahuan GLOBAL', () => {
    const globalRecord = baseRecord({
      scope: 'GLOBAL',
      ownership: { userId: null, workspaceId: null, projectId: null },
      category: 'KNOWLEDGE_REFERENCE',
      status: 'APPROVED',
    });
    const r = authorizeGlobalPublication({ actor: actorA, record: globalRecord });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('GLOBAL_SCOPE_FORBIDDEN');
    expect(roleHasMemoryPermission('SUPER_ADMIN', 'memory:publish_global')).toBe(false);
  });
});

describe('Phase B — provenance & validasi (§12 kasus 26–32)', () => {
  it('26. provenance yang hilang ditolak', () => {
    const r = validateMemoryRecord(baseRecord({ source: undefined }));
    expect(r.ok).toBe(false);
    expect(r.code).toBe('SOURCE_NOT_VERIFIABLE');
  });

  it('27. tipe sumber tidak valid ditolak', () => {
    const rec = baseRecord();
    rec.source = { ...rec.source, sourceType: 'RAW_CHAT_DUMP' };
    const r = validateMemoryRecord(rec);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_PROVENANCE');
  });

  it('28. confidence tidak valid ditolak', () => {
    expect(validateMemoryRecord(baseRecord({ confidence: 1.5 })).code).toBe('INVALID_CONFIDENCE');
    expect(validateMemoryRecord(baseRecord({ confidence: NaN })).code).toBe('INVALID_CONFIDENCE');
    expect(validateConfidence(-0.1).ok).toBe(false);
    expect(validateConfidence(0).ok).toBe(true);
    expect(validateConfidence(1).ok).toBe(true);
  });

  it('29. timestamp tidak valid ditolak', () => {
    expect(validateMemoryRecord(baseRecord({ createdAt: 'besok' })).code).toBe('INVALID_TIMESTAMP');
    expect(validateMemoryRecord(baseRecord({ createdAt: NaN })).code).toBe('INVALID_TIMESTAMP');
    expect(validateMemoryRecord(baseRecord({ updatedAt: T0 - 1000 })).code).toBe('INVALID_TIMESTAMP');
  });

  it('30. transisi lifecycle tidak valid ditolak', () => {
    const rejected = baseRecord({ scope: 'WORKSPACE', ownership: WS_OWNERSHIP, status: 'REJECTED' });
    expect(validateLifecycleTransition(rejected, 'PUBLISHED').ok).toBe(false);
    const personalDraft = baseRecord({ status: 'DRAFT' });
    expect(validateLifecycleTransition(personalDraft, 'PUBLISHED').ok).toBe(false);
    expect(validateLifecycleTransition(personalDraft, 'APPROVED').ok).toBe(true);
  });

  it('31. record REJECTED tidak dapat diambil kembali', () => {
    const rejected = baseRecord({ scope: 'WORKSPACE', ownership: WS_OWNERSHIP, status: 'REJECTED' });
    expect(isRetrievableRecord(rejected)).toBe(false);
    expect(validateLifecycleTransition(rejected, 'APPROVED').ok).toBe(false);
  });

  it('32. record DELETED tidak dapat diambil kembali', () => {
    expect(isRetrievableRecord(baseRecord({ status: 'DELETED' }))).toBe(false);
    expect(isRetrievableRecord(baseRecord({ status: 'APPROVED' }))).toBe(true);
  });
});

describe('Phase B — kontrak isolasi (§12 kasus 33–36)', () => {
  it('33. User A tidak dapat mengklaim kepemilikan PERSONAL User B', () => {
    const malicious: any = {
      actor: actorA,
      requestedScope: 'PERSONAL',
      ownership: { userId: 'user-b', workspaceId: null, projectId: null },
    };
    const r = resolveMemoryScope(malicious);
    expect(r.ok).toBe(true);
    expect((r as any).ownership.userId).toBe('user-a');
    expect((r as any).ownership.userId).not.toBe('user-b');
  });

  it('34. Workspace A tidak dapat dipakai sebagai Workspace B', () => {
    const r = resolveMemoryScope({
      actor: actorA,
      requestedScope: 'WORKSPACE',
      target: { workspaceId: 'ws-b' },
      workspaceEvidence: wsEvidence('ws-a', 'user-a'),
    });
    expect(r.ok).toBe(false);
  });

  it('35. Project A tidak dapat ditempelkan ke Workspace B', () => {
    const r = resolveMemoryScope({
      actor: actorA,
      requestedScope: 'PROJECT',
      target: { workspaceId: 'ws-b', projectId: 'project-a' },
      workspaceEvidence: wsEvidence('ws-b', 'user-a'),
      projectEvidence: projEvidence('ws-a', 'project-a', 'user-a'),
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('REQUIRES_PROJECT_AUTHORIZATION');
  });

  it('36. ID kiriman client tidak dapat menggantikan bukti otorisasi', () => {
    const withHeaders: any = {
      actor: actorA,
      requestedScope: 'WORKSPACE',
      target: { workspaceId: 'ws-a' },
      headers: { 'x-workspace-id': 'ws-a', 'x-user-id': 'user-a', 'x-user-role': 'SUPER_ADMIN' },
    };
    const r = resolveMemoryScope(withHeaders);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('REQUIRES_WORKSPACE_AUTHORIZATION');
    const clientAsserted = wsEvidence('ws-a', 'user-a', 'memory:write', { source: 'CLIENT_ASSERTION' });
    expect(resolveMemoryScope({ actor: actorA, requestedScope: 'WORKSPACE', target: { workspaceId: 'ws-a' }, workspaceEvidence: clientAsserted }).ok).toBe(false);
  });
});

describe('Phase B — record sah & kontrak governance (ekstra)', () => {
  it('37. record sah lolos validasi untuk keempat scope', () => {
    expect(validateMemoryRecord(baseRecord()).ok).toBe(true);
    expect(validateMemoryRecord(baseRecord({ scope: 'WORKSPACE', ownership: WS_OWNERSHIP, status: 'PENDING_REVIEW', category: 'WORKSPACE_PROCEDURE' })).ok).toBe(true);
    expect(validateMemoryRecord(baseRecord({ scope: 'PROJECT', ownership: { userId: null, workspaceId: 'ws-a', projectId: 'project-a' }, status: 'APPROVED', category: 'PROJECT_FACT' })).ok).toBe(true);
    expect(validateMemoryRecord(baseRecord({ scope: 'GLOBAL', ownership: { userId: null, workspaceId: null, projectId: null }, status: 'PUBLISHED', category: 'KNOWLEDGE_REFERENCE' })).ok).toBe(true);
  });

  it('38. hanya principal governance yang lolos kontrak publikasi global', () => {
    expect(canActAsGlobalGovernance(governanceActor)).toBe(true);
    expect(canActAsGlobalGovernance(actorA)).toBe(false);
    expect(canActAsGlobalGovernance(serviceActor)).toBe(false);
    const globalRecord = baseRecord({
      scope: 'GLOBAL',
      ownership: { userId: null, workspaceId: null, projectId: null },
      category: 'KNOWLEDGE_REFERENCE',
      status: 'APPROVED',
    });
    expect(authorizeGlobalPublication({ actor: governanceActor, record: globalRecord }).ok).toBe(true);
  });

  it('39. transisi global yang sah: APPROVED → PUBLISHED → ARCHIVED', () => {
    const approved = baseRecord({ scope: 'GLOBAL', ownership: { userId: null, workspaceId: null, projectId: null }, status: 'APPROVED', category: 'KNOWLEDGE_REFERENCE' });
    expect(validateLifecycleTransition(approved, 'PUBLISHED').ok).toBe(true);
    const published = { ...approved, status: 'PUBLISHED' };
    expect(validateLifecycleTransition(published, 'ARCHIVED').ok).toBe(true);
    expect(isRetrievableRecord(published)).toBe(true);
    expect(isRetrievableRecord(approved)).toBe(false);
  });
});
