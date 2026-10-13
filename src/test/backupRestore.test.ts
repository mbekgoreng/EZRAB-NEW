/**
 * Tests: Backup & Restore
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createBackup,
  validateBackup,
  restoreBackup,
  BACKUP_DATASET_KEYS,
  BACKUP_FORMAT_VERSION,
} from '../engine/storage/backupRestore';
import { saveVersioned, loadVersioned } from '../engine/storage/hardenedStorage';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
});

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

function seedTestData() {
  saveVersioned('ezrab_prod_projects', [
    { id: 'P1', name: 'Proyek Test' },
  ]);
  saveVersioned('ezrab_prod_rab_items', [
    {
      id: 'R1',
      projectId: 'P1',
      description: 'Pekerjaan Test',
      unitPrice: 100000,
      priceSourceKind: 'EZRAB_ASSUMPTION',
      priceSourceLabel: 'ASUMSI — PERLU VERIFIKASI',
    },
    {
      id: 'R2',
      projectId: 'P1',
      description: 'Pekerjaan Unresolved',
      unitPrice: null,
      priceSourceKind: 'UNRESOLVED',
    },
  ]);
}

describe('Backup & Restore', () => {
  it('1. createBackup includes all datasets', () => {
    seedTestData();
    const result = createBackup();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metadata.projectSummary).toHaveLength(1);
      expect(result.metadata.projectSummary[0].itemCount).toBe(2);
    }
  });

  it('2. backup → validate → restore roundtrip preserves provenance', () => {
    seedTestData();

    // Create backup JSON manually (createBackup returns metadata only)
    const datasets: Record<string, unknown> = {};
    for (const key of BACKUP_DATASET_KEYS) {
      const r = loadVersioned(key);
      datasets[key] = r.ok ? r.data : [];
    }
    const backupJson = JSON.stringify({
      kind: 'ezrab-backup',
      metadata: {
        formatVersion: BACKUP_FORMAT_VERSION,
        schemaVersion: 2,
        createdAt: new Date().toISOString(),
        datasetCounts: {},
        projectSummary: [{ id: 'P1', name: 'Proyek Test', itemCount: 2 }],
      },
      datasets,
    });

    // Validate
    const validation = validateBackup(backupJson);
    expect(validation.ok).toBe(true);

    // Clear and restore
    for (const k of Object.keys(store)) delete store[k];
    const restore = restoreBackup(backupJson);
    expect(restore.ok).toBe(true);

    // Verify provenance preserved
    const items = loadVersioned<any[]>('ezrab_prod_rab_items');
    expect(items.ok).toBe(true);
    if (items.ok) {
      expect(items.data).toHaveLength(2);
      expect(items.data[0].priceSourceKind).toBe('EZRAB_ASSUMPTION');
      expect(items.data[1].priceSourceKind).toBe('UNRESOLVED');
      expect(items.data[1].unitPrice).toBeNull();
    }
  });

  it('3. invalid JSON rejected', () => {
    const result = validateBackup('{invalid');
    expect(result.ok).toBe(false);
  });

  it('4. wrong kind rejected', () => {
    const result = validateBackup(JSON.stringify({ kind: 'not-a-backup' }));
    expect(result.ok).toBe(false);
  });

  it('5. future schema version rejected', () => {
    const backup = JSON.stringify({
      kind: 'ezrab-backup',
      metadata: {
        formatVersion: BACKUP_FORMAT_VERSION,
        schemaVersion: 999,
        createdAt: new Date().toISOString(),
        datasetCounts: {},
        projectSummary: [],
      },
      datasets: {},
    });
    const result = validateBackup(backup);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/schema v999/);
  });

  it('6. restore does not execute content (pure data)', () => {
    // Malicious content should be treated as data, not code
    const backup = JSON.stringify({
      kind: 'ezrab-backup',
      metadata: {
        formatVersion: BACKUP_FORMAT_VERSION,
        schemaVersion: 2,
        createdAt: new Date().toISOString(),
        datasetCounts: {},
        projectSummary: [],
      },
      datasets: {
        ezrab_prod_projects: [{ id: 'P1', name: '<script>alert(1)</script>' }],
        ezrab_prod_rab_items: [],
      },
    });
    const result = restoreBackup(backup);
    expect(result.ok).toBe(true);
    const projects = loadVersioned<any[]>('ezrab_prod_projects');
    if (projects.ok) {
      // Stored as-is, not executed
      expect(projects.data[0].name).toBe('<script>alert(1)</script>');
    }
  });
});
