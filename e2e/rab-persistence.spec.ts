/**
 * E2E: RAB Persistence & Provenance (Storage-Level)
 *
 * SCOPE HONESTY:
 * These tests verify the STORAGE LAYER through a real browser:
 * - Data written to localStorage via hardenedStorage envelope format
 * - App loads and reads the data correctly
 * - Reload preserves data (no silent modification)
 * - Provenance metadata survives the round-trip
 *
 * These tests DO NOT verify:
 * - UI-driven item creation (no selectors verified yet)
 * - Save button flow (requires UI interaction)
 * - Excel/PDF export (not implemented in E2E)
 * - Cross-tab conflicts (requires multi-context setup)
 *
 * UI-driven tests are marked as TODO pending selector verification
 * against the running application.
 */
import { test, expect } from '@playwright/test';

const TEST_PROJECT_ID = 'e2e-test-project-' + Date.now();

// Helper: write data via the app's hardened storage format
async function seedViaStorageFormat(page: any, projectId: string) {
  await page.addInitScript((pid: string) => {
    const envelope = (data: unknown) => JSON.stringify({
      v: 2,
      savedAt: new Date().toISOString(),
      writeId: 'e2e-' + Math.random().toString(36).slice(2),
      data,
    });

    const testProject = { id: pid, name: 'E2E Test Project', createdAt: new Date().toISOString() };
    const testItems = [
      {
        id: 'e2e-r1', projectId: pid, no: 1, code: 'E2E.1',
        description: 'Pekerjaan resmi E2E', volume: 10, unit: 'm3',
        unitPrice: 500000, amount: 5000000,
        priceSourceKind: 'OFFICIAL_AHSP',
        priceSourceLabel: 'RESMI AHSP',
      },
      {
        id: 'e2e-r2', projectId: pid, no: 2, code: 'E2E.2',
        description: 'Pekerjaan asumsi E2E', volume: 5, unit: 'm2',
        unitPrice: 75000, amount: 375000,
        priceSourceKind: 'EZRAB_ASSUMPTION',
        priceSourceLabel: 'ASUMSI — PERLU VERIFIKASI',
        priceSourceExplanation: 'BUKAN harga resmi.',
      },
      {
        id: 'e2e-r3', projectId: pid, no: 3, code: 'E2E.3',
        description: 'Pekerjaan unresolved E2E', volume: 3, unit: 'm',
        unitPrice: null, amount: null,
        priceSourceKind: 'UNRESOLVED',
        priceSourceLabel: 'HARGA BELUM TERSEDIA',
      },
    ];

    localStorage.setItem('ezrab_prod_projects', envelope([testProject]));
    localStorage.setItem('ezrab_prod_rab_items', envelope(testItems));
    localStorage.setItem('ezrab_prod_active_project_id', pid);
  }, projectId);
}

async function cleanupE2E(page: any) {
  await page.evaluate(() => {
    for (const key of ['ezrab_prod_projects', 'ezrab_prod_rab_items']) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const data = parsed.data || parsed;
        if (!Array.isArray(data)) continue;
        const cleaned = data.filter((i: any) =>
          !String(i.id || '').startsWith('e2e-')
        );
        localStorage.setItem(key, JSON.stringify(
          parsed.data ? { ...parsed, data: cleaned } : cleaned
        ));
      } catch { /* ignore */ }
    }
    localStorage.removeItem('ezrab_prod_active_project_id');
  });
}

test.describe('Storage-level persistence', () => {
  test.beforeEach(async ({ page }) => {
    await seedViaStorageFormat(page, TEST_PROJECT_ID);
  });

  test.afterEach(async ({ page }) => {
    await cleanupE2E(page);
  });

  test('app loads without crash with seeded data', async ({ page }) => {
    await page.goto('/app/rab');
    // Wait for app to hydrate
    await page.waitForTimeout(3000);
    // App should not show a crash/error page
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toMatch(/something went wrong|error boundary/i);
  });

  test('provenance metadata survives app load + reload', async ({ page }) => {
    await page.goto('/app/rab');
    await page.waitForTimeout(2000);

    // Read back via the same format the app uses
    const getItems = () => page.evaluate(() => {
      const raw = localStorage.getItem('ezrab_prod_rab_items');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const data = parsed.data || parsed;
      return Array.isArray(data) ? data.filter((i: any) => String(i.id || '').startsWith('e2e-')) : [];
    });

    const before = await getItems();
    expect(before).toHaveLength(3);

    await page.reload();
    await page.waitForTimeout(2000);

    const after = await getItems();
    expect(after).toHaveLength(3);

    // Verify each item's provenance is intact
    const byId = Object.fromEntries(after.map((i: any) => [i.id, i]));

    expect(byId['e2e-r1'].priceSourceKind).toBe('OFFICIAL_AHSP');
    expect(byId['e2e-r1'].unitPrice).toBe(500000);

    expect(byId['e2e-r2'].priceSourceKind).toBe('EZRAB_ASSUMPTION');
    expect(byId['e2e-r2'].priceSourceKind).not.toBe('OFFICIAL_AHSP');

    expect(byId['e2e-r3'].priceSourceKind).toBe('UNRESOLVED');
    expect(byId['e2e-r3'].unitPrice).toBeNull();
    expect(byId['e2e-r3'].unitPrice).not.toBe(0);
  });

  test('reload does not trigger silent recalculation', async ({ page }) => {
    await page.goto('/app/rab');
    await page.waitForTimeout(2000);

    const snapshot = () => page.evaluate(() => {
      const raw = localStorage.getItem('ezrab_prod_rab_items');
      const parsed = JSON.parse(raw!);
      const data = parsed.data || parsed;
      return data
        .filter((i: any) => String(i.id || '').startsWith('e2e-'))
        .map((i: any) => ({ id: i.id, unitPrice: i.unitPrice, amount: i.amount }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id));
    });

    const before = await snapshot();
    await page.reload();
    await page.waitForTimeout(2500);
    const after = await snapshot();

    expect(after).toEqual(before);
  });
});

// TODO: UI-driven tests (require selector verification against running app)
test.describe.skip('UI-driven flow (TODO: verify selectors)', () => {
  test('create project via UI', async ({ page }) => {
    // TODO: Navigate to project creation, fill form, submit
    // Verify project appears in list
    // Verify localStorage contains the new project via hardened envelope
  });

  test('add RAB item via UI and verify save status', async ({ page }) => {
    // TODO: Open RAB view, click add item, fill form
    // Verify SaveStatusIndicator shows 'saving' then 'saved'
    // Verify item persists after reload
  });

  test('provenance badge renders in UI', async ({ page }) => {
    // TODO: Seed assumption item, verify badge "ASUMSI" visible in table
    // Verify unresolved item shows "HARGA BELUM TERSEDIA"
  });
});
