import assert from 'assert';
import { contextEngine } from '../ai/context/contextEngine';
import { aiDbAdapter } from '../database/dbAdapter';

export async function runAiContextTestSuite(): Promise<void> {
  console.log('--- Running AI Context Engine & Tenant Isolation Test Suite ---');

  const ws = 'WS-CTX-TEST';
  const prj = 'PRJ-CTX-2026-001';

  // Seed project in memory
  aiDbAdapter.createProject(ws, {
    id: prj,
    name: 'Proyek Rumah Tinggal 2 Lantai',
    budget: 450000000,
    status: 'ACTIVE'
  });

  // 1. Authoritative context assembly with valid project
  const ctxValid = await contextEngine.assembleContext({
    userId: 'user-estimator-1',
    workspaceId: ws,
    projectId: prj,
    userRole: 'ESTIMATOR',
    requiresProject: true
  });

  assert.strictEqual(ctxValid.isProjectAuthorized, true);
  assert.strictEqual(ctxValid.session.projectId, prj);
  assert.strictEqual(ctxValid.session.projectName, 'Proyek Rumah Tinggal 2 Lantai');
  assert.strictEqual(ctxValid.session.entitlement.canExecuteMutations, true);
  assert.ok(ctxValid.relevantContextMarkdown.includes('Proyek Rumah Tinggal 2 Lantai'));

  // 2. Missing workspace rejected (Fail-Closed)
  const ctxNoWs = await contextEngine.assembleContext({
    userId: 'user-1',
    workspaceId: '',
    projectId: prj,
    requiresProject: true
  });
  assert.strictEqual(ctxNoWs.isProjectAuthorized, false);
  assert.ok(ctxNoWs.validationError?.includes('TENANT_VIOLATION'));

  // 3. Forged / Cross-Project ID rejected (Fail-Closed)
  const ctxForged = await contextEngine.assembleContext({
    userId: 'user-1',
    workspaceId: ws,
    projectId: 'UNAUTHORIZED_CROSS_PROJECT_ID',
    requiresProject: true
  });
  assert.strictEqual(ctxForged.isProjectAuthorized, false);
  assert.ok(ctxForged.validationError?.includes('SECURITY_ERROR'));

  // 4. Missing project when required rejected
  const ctxMissingPrj = await contextEngine.assembleContext({
    userId: 'user-1',
    workspaceId: ws,
    projectId: undefined,
    requiresProject: true
  });
  assert.strictEqual(ctxMissingPrj.isProjectAuthorized, false);
  assert.ok(ctxMissingPrj.validationError?.includes('PROJECT_CONTEXT_REQUIRED'));

  console.log('✅ All 4 AI Context Engine & Tenant Isolation assertions PASSED');
}
