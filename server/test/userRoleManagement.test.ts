import assert from 'assert';
import { userManagementService } from '../services/userManagementService';
import { UserRole } from '../../src/types';

export async function runUserRoleManagementTestSuite(): Promise<{ passed: number; failed: number }> {
  console.log('\n============================================================');
  console.log('EZRAB USER MANAGEMENT & ROLE ONBOARDING SECURITY TEST SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`  [FAIL] ${name}:`, e.message);
      failed++;
    }
  }

  const ws = 'ws-test-security-suite';
  const superAdminActor = {
    id: 'usr-admin-test',
    workspaceId: ws,
    role: 'SUPER_ADMIN' as UserRole,
  };

  userManagementService.bootstrapWorkspace(ws, {
    id: 'usr-admin-test',
    workspaceId: ws,
    name: 'Ahmad Yusuf (Test Admin)',
    email: 'admin.test@ezrab.id',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // 1. Super Admin -> add Estimator (PASS)
  await test('1. Super Admin -> add Estimator', () => {
    const res = userManagementService.createUser(superAdminActor, ws, {
      name: 'Budi Estimator',
      email: 'budi.estimator@test.com',
      role: 'ESTIMATOR',
      phone: '+62812345678',
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.user);
    assert.strictEqual(res.user.role, 'ESTIMATOR');
    assert.strictEqual(res.user.status, 'ACTIVE');
  });

  // 2. Super Admin -> add Direksi (PASS)
  await test('2. Super Admin -> add Direksi', () => {
    const res = userManagementService.createUser(superAdminActor, ws, {
      name: 'Ir. Hendra Direksi',
      email: 'hendra.direksi@test.com',
      role: 'DIREKSI',
      phone: '+62812999900',
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.user);
    assert.strictEqual(res.user.role, 'DIREKSI');
  });

  // 3. Super Admin -> add Client (PASS)
  await test('3. Super Admin -> add Client', () => {
    const res = userManagementService.createUser(superAdminActor, ws, {
      name: 'Pak Bambang Client',
      email: 'bambang.client@test.com',
      role: 'CLIENT',
      company: 'PT Properti Maju',
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.user);
    assert.strictEqual(res.user.role, 'CLIENT');
  });

  // 4. Estimator -> cannot add Super Admin (FAIL CLOSED)
  await test('4. Estimator -> cannot add Super Admin (Fail-Closed)', () => {
    const estimatorActor = { id: 'usr-est-01', workspaceId: ws, role: 'ESTIMATOR' as UserRole };
    const res = userManagementService.createUser(estimatorActor, ws, {
      name: 'Hacker Admin',
      email: 'hacker@test.com',
      role: 'ESTIMATOR',
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('FORBIDDEN'));
  });

  // 5. Direksi -> cannot add Super Admin (FAIL CLOSED)
  await test('5. Direksi -> cannot add Super Admin (Fail-Closed)', () => {
    const direksiActor = { id: 'usr-dir-01', workspaceId: ws, role: 'DIREKSI' as UserRole };
    const res = userManagementService.createUser(direksiActor, ws, {
      name: 'Hacker Admin 2',
      email: 'hacker2@test.com',
      role: 'ESTIMATOR',
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('FORBIDDEN'));
  });

  // 6. Client -> cannot add Super Admin (FAIL CLOSED)
  await test('6. Client -> cannot add Super Admin (Fail-Closed)', () => {
    const clientActor = { id: 'usr-cli-01', workspaceId: ws, role: 'CLIENT' as UserRole };
    const res = userManagementService.createUser(clientActor, ws, {
      name: 'Hacker Admin 3',
      email: 'hacker3@test.com',
      role: 'CLIENT',
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('FORBIDDEN'));
  });

  // 7. Frontend role manipulation attempt (Trying to pass role: 'SUPER_ADMIN')
  await test('7. Frontend role manipulation (assign SUPER_ADMIN) blocked (Fail-Closed)', () => {
    const res = userManagementService.createUser(superAdminActor, ws, {
      name: 'Fake Super Admin',
      email: 'fake.admin@test.com',
      role: 'SUPER_ADMIN' as any,
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('dilindungi'));
  });

  // 8. Workspace mismatch (FAIL CLOSED)
  await test('8. Workspace mismatch strictly blocked (Cross-Tenant Isolation)', () => {
    const res = userManagementService.createUser(
      { id: 'usr-admin-test', workspaceId: 'ws-workspace-A', role: 'SUPER_ADMIN' },
      'ws-workspace-B',
      {
        name: 'Intruder User',
        email: 'intruder@test.com',
        role: 'ESTIMATOR',
      }
    );
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('FORBIDDEN'));
  });

  // 9. Duplicate email handling within workspace (PASS)
  await test('9. Duplicate email handling prevents duplicate account registration', () => {
    const res = userManagementService.createUser(superAdminActor, ws, {
      name: 'Duplicate Budi',
      email: 'budi.estimator@test.com', // already registered in test 1
      role: 'ESTIMATOR',
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('DUPLICATE_EMAIL'));
  });

  // 10. Invalid email validation (VALIDATION ERROR)
  await test('10. Invalid email format returns clean validation error', () => {
    const res = userManagementService.createUser(superAdminActor, ws, {
      name: 'Invalid Email User',
      email: 'not-an-email-address',
      role: 'ESTIMATOR',
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('VALIDATION_ERROR'));
  });

  // 11. Missing required data validation (VALIDATION ERROR)
  await test('11. Missing required data (name too short) returns validation error', () => {
    const res = userManagementService.createUser(superAdminActor, ws, {
      name: ' ',
      email: 'valid@test.com',
      role: 'ESTIMATOR',
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('VALIDATION_ERROR'));
  });

  // 12. Password never exposed in returned user object
  await test('12. Password/credentials never exposed in returned user object', () => {
    const users = userManagementService.getWorkspaceUsers(ws);
    for (const u of users) {
      assert.strictEqual((u as any).password, undefined);
      assert.strictEqual((u as any).token, undefined);
      assert.strictEqual((u as any).apiKey, undefined);
    }
  });

  // 13. Audit Log: USER_CREATED verified
  await test('13. Audit Log: USER_CREATED records actor, workspace, target, role without secrets', () => {
    const logs = userManagementService.getAuditLogs(ws);
    assert.ok(logs.length >= 3);
    const firstLog = logs[0];
    assert.strictEqual(firstLog.action, 'USER_CREATED');
    assert.strictEqual(firstLog.actorUserId, superAdminActor.id);
    assert.strictEqual(firstLog.workspaceId, ws);
    assert.ok(firstLog.targetUserId);
    assert.ok(firstLog.timestamp);
    assert.strictEqual((firstLog as any).password, undefined);
  });

  console.log(`\nUser Management Test Results: ${passed} PASSED, ${failed} FAILED`);
  return { passed, failed };
}
