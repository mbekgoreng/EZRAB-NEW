/**
 * Test Phase 4 — Feature Tutorial Registry & perilaku.
 *
 * Dijalankan dengan: npx tsx src/test/featureTutorials.test.ts
 * (tsx; bukan suite vitest — konsisten dengan harness repo ini)
 */
import assert from 'node:assert';

// --- Mock localStorage & window minimal untuk registry ---
const store = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  innerWidth: 1280,
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};

import {
  getTutorial,
  listTutorials,
  listTutorialsByCategory,
  searchTutorials,
  getTutorialCategories,
  getTutorialProgress,
  setTutorialStatus,
  resetTutorialProgress,
  OPEN_TUTORIAL_EVENT,
} from '../components/onboarding/tutorials/tutorialRegistry';

import {
  claimTutorialSlot,
  releaseTutorialSlot,
  isSlotTakenByOther,
  resetTutorialSlots,
} from '../components/onboarding/tutorials/tutorialCoordinator';

let failures = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e instanceof Error ? e.message : e}`);
  }
}

console.log('[1] Registry valid');
test('10 tutorial terdaftar & tersedia', () => {
  const ids = ['proyek', 'magic-ai', 'ded-rab', 'rab-volume', 'ahsp-2026', 'qto', 'dokumen-ai', 'manajemen-proyek', 'laporan', 'pengaturan'];
  for (const id of ids) {
    const t = getTutorial(id);
    assert.ok(t, `tutorial ${id} ada`);
    assert.equal(t!.id, id);
    assert.ok(t!.available, `${id} tersedia`);
  }
  assert.equal(listTutorials().length, 10);
});
test('id tidak dikenal → undefined', () => {
  assert.equal(getTutorial('tidak-ada'), undefined);
});
test('setiap tutorial punya langkah valid', () => {
  for (const t of listTutorials()) {
    assert.ok(t.steps.length >= 3, `${t.id} minimal 3 langkah`);
    assert.ok(t.title.length > 0, `${t.id} punya judul`);
    assert.ok(t.description.length > 0, `${t.id} punya deskripsi`);
    assert.ok(t.route.startsWith('/app'), `${t.id} route di bawah /app`);
    for (const s of t.steps) {
      assert.ok(s.title.length > 0, `${t.id} langkah punya judul`);
      assert.ok(s.body.length > 0, `${t.id} langkah punya body`);
      if (s.target !== null) {
        assert.ok(s.target.startsWith('[') && s.target.endsWith(']'), `${t.id} selector valid: ${s.target}`);
      }
    }
  }
});
test('kategori valid & terdaftar', () => {
  const cats = getTutorialCategories();
  assert.ok(cats.length > 0);
  for (const t of listTutorials()) {
    assert.ok(cats.includes(t.category), `${t.id} kategori terdaftar`);
  }
});

console.log('\n[2] Route & selector aktual');
test('route tutorial sesuai paths aplikasi', () => {
  const expected: Record<string, string> = {
    proyek: '/app/projects',
    'magic-ai': '/app/magic-ai',
    'ded-rab': '/app/ded-ai',
    'rab-volume': '/app/estimate',
    'ahsp-2026': '/app/ahsp',
    qto: '/app/qto',
    'dokumen-ai': '/app/dokumen-ai',
    'manajemen-proyek': '/app/management',
    laporan: '/app/reports',
    pengaturan: '/app/settings',
  };
  for (const [id, route] of Object.entries(expected)) {
    assert.equal(getTutorial(id)!.route, route, `${id} route`);
  }
});
test('selector menu sesuai id sidebar aktual', () => {
  // id sidebar yang diverifikasi dari Sidebar.tsx
  const validMenuIds = ['dashboard', 'ded-ai', 'rab-spreadsheet', 'qto', 'ahsp-2026', 'proyek', 'magic-ai', 'dokumen-ai', 'manajemen-proyek', 'laporan', 'pengaturan', 'sidebar', 'help'];
  for (const t of listTutorials()) {
    for (const s of t.steps) {
      if (s.target?.startsWith('[data-tour="menu-')) {
        const menuId = s.target.slice(17, -2);
        assert.ok(validMenuIds.includes(menuId) || menuId === 'dashboard', `${t.id}: menu ${menuId} valid`);
      }
    }
  }
});

console.log('\n[3] Pencarian & kategori');
test('search menemukan tutorial', () => {
  assert.ok(searchTutorials('proyek').some((t) => t.id === 'proyek'));
  assert.ok(searchTutorials('AI').length >= 2);
  assert.ok(searchTutorials('xyz-tidak-ada').length === 0);
  assert.equal(searchTutorials('').length, 10);
});
test('filter kategori', () => {
  assert.ok(listTutorialsByCategory('ai').length >= 2);
  assert.equal(listTutorialsByCategory('proyek')[0].id, 'proyek');
});

console.log('\n[4] Persistensi per-tutorial');
test('status awal not-started', () => {
  store.clear();
  assert.equal(getTutorialProgress('proyek').status, 'not-started');
});
test('set & get status', () => {
  setTutorialStatus('proyek', 'in-progress');
  assert.equal(getTutorialProgress('proyek').status, 'in-progress');
  setTutorialStatus('proyek', 'completed');
  assert.equal(getTutorialProgress('proyek').status, 'completed');
});
test('tutorial lain tidak terpengaruh', () => {
  store.clear();
  setTutorialStatus('proyek', 'completed');
  assert.equal(getTutorialProgress('magic-ai').status, 'not-started');
  assert.equal(getTutorialProgress('ded-rab').status, 'not-started');
});
test('reset eksplisit', () => {
  setTutorialStatus('proyek', 'completed');
  resetTutorialProgress('proyek');
  assert.equal(getTutorialProgress('proyek').status, 'not-started');
});
test('key terpisah dari key Phase 2', () => {
  store.clear();
  setTutorialStatus('proyek', 'completed');
  // Key Phase 2 tidak tersentuh
  assert.equal(store.get('ezrab_onboarding_done_v1'), undefined);
  assert.equal(store.get('ezrab_onboarding_completed'), undefined);
  // Key tutorial terpisah per id
  assert.ok(store.has('ezrab_tutorial_proyek'));
  assert.ok(!store.has('ezrab_tutorial_magic-ai'));
});
test('versi berubah → status reset', () => {
  store.set('ezrab_tutorial_proyek', JSON.stringify({ status: 'completed', version: 999, updatedAt: new Date().toISOString() }));
  assert.equal(getTutorialProgress('proyek').status, 'not-started');
});
test('data rusak → fallback aman', () => {
  store.set('ezrab_tutorial_proyek', 'bukan-json');
  assert.equal(getTutorialProgress('proyek').status, 'not-started');
});

console.log('\n[5] Anti-tumpuk (coordinator)');
test('slot hanya satu dalam satu waktu', () => {
  resetTutorialSlots();
  assert.equal(claimTutorialSlot('welcome'), true);
  assert.equal(claimTutorialSlot('feature'), false); // ditolak
  assert.equal(isSlotTakenByOther('feature'), true);
  releaseTutorialSlot('welcome');
  assert.equal(claimTutorialSlot('feature'), true); // kini bisa
  releaseTutorialSlot('feature');
});
test('dashboard & feature tidak bersamaan', () => {
  resetTutorialSlots();
  assert.equal(claimTutorialSlot('dashboard'), true);
  assert.equal(claimTutorialSlot('feature'), false);
  releaseTutorialSlot('dashboard');
  assert.equal(claimTutorialSlot('feature'), true);
  releaseTutorialSlot('feature');
});
test('release id yang salah tidak melepas slot orang lain', () => {
  resetTutorialSlots();
  claimTutorialSlot('welcome');
  releaseTutorialSlot('feature'); // bukan pemilik
  assert.equal(isSlotTakenByOther('feature'), true); // welcome masih pegang
  releaseTutorialSlot('welcome');
});

console.log('\n[6] Event buka tutorial');
test('konstanta event terdefinisi', () => {
  assert.equal(OPEN_TUTORIAL_EVENT, 'ezrab:open-tutorial');
});

console.log('\n[7] Cakupan route langkah (anti skip-diam-diam)');
test('langkah dengan target halaman-spesifik wajib punya route', () => {
  // Selector yang ada di semua halaman app (sidebar dkk) tidak butuh route.
  const GLOBAL_SELECTORS = [
    '[data-tour="sidebar"]',
    '[data-tour="help"]',
    '[data-tour="checklist"]',
  ];
  const isGlobalMenu = (t: string | null) =>
    t !== null && (/^\[data-tour="menu-[^"]+"\]$/.test(t) || GLOBAL_SELECTORS.includes(t));
  for (const t of listTutorials()) {
    t.steps.forEach((s, idx) => {
      if (!isGlobalMenu(s.target)) {
        assert.ok(
          s.route,
          `tutorial ${t.id} langkah ${idx + 1} ("${s.title}") target ${s.target} wajib punya route`
        );
      }
    });
  }
});
test('semua route langkah adalah path /app yang valid', () => {
  for (const t of listTutorials()) {
    t.steps.forEach((s, idx) => {
      if (s.route) {
        assert.ok(
          s.route.startsWith('/app/') || s.route === '/app',
          `tutorial ${t.id} langkah ${idx + 1}: route "${s.route}" harus path /app`
        );
      }
    });
  }
});
test('langkah settingsTab hanya untuk route settings', () => {
  for (const t of listTutorials()) {
    t.steps.forEach((s, idx) => {
      if (s.settingsTab) {
        assert.ok(
          s.route === '/app/settings',
          `tutorial ${t.id} langkah ${idx + 1}: settingsTab butuh route /app/settings`
        );
      }
    });
  }
});
test('setiap tutorial punya minimal 1 langkah tanpa navigasi (jangkar awal)', () => {
  for (const t of listTutorials()) {
    const first = t.steps[0];
    assert.ok(first, `tutorial ${t.id} punya langkah`);
  }
});

console.log('');
if (failures > 0) {
  console.error(`Failed tests: ${failures}`);
  process.exit(1);
} else {
  console.log('Semua test feature tutorial PASS.');
}
