/**
 * Tests: Backup & Restore (vitest-native)
 *
 * P1-A (2026-11-24): createBackup() kini mengembalikan `content` (perbaikan
 * cacat recon: JSON dibangun lalu dibuang). Tes 2 memakai content asli,
 * bukan lagi JSON rakitan manual.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createBackup,
  createSafetyBackup,
  getSafetySlotContent,
  validateBackup,
  restoreBackup,
  BACKUP_DATASET_KEYS,
  BACKUP_FORMAT_VERSION,
  SAFETY_SLOT_KEY,
} from '../engine/storage/backupRestore';
import { saveVersioned, loadVersioned } from '../engine/storage/hardenedStorage';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
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

    // P1-A: pakai content asli dari createBackup (dulu dirakit manual
    // karena createBackup membuang JSON-nya).
    const created = createBackup();
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('createBackup failed');
    const backupJson = created.content;

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

  it('7. P1-A: createBackup returns usable content', () => {
    seedTestData();
    const result = createBackup();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('createBackup failed');
    expect(typeof result.content).toBe('string');
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.sizeBytes).toBe(result.content.length);
    const parsed = JSON.parse(result.content);
    expect(parsed.kind).toBe('ezrab-backup');
    expect(parsed.metadata.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    for (const key of BACKUP_DATASET_KEYS) {
      expect(key in parsed.datasets).toBe(true);
    }
    expect(parsed.rawDatasets).toBeDefined();
    // Filename includes a timestamp (no silent overwrite of same-day backups)
    expect(result.filename).toMatch(/^ezrab-backup-\d{4}-\d{2}-\d{2}-\d{6}\.json$/);
  });

  it('8. P1-A: new families round-trip (envelope + raw + prefix)', () => {
    seedTestData();
    saveVersioned('ezrab_prod_ai_drafts', { P1: { id: 'D1', projectId: 'P1' } });
    saveVersioned('ezrab_prod_finalization_keys', { 'k1': { key: 'k1', projectId: 'P1' } });
    store['ezrab_unified_conversations_v2'] = JSON.stringify([
      { id: 'C1', projectId: 'P1', messages: [{ id: 'M1', role: 'user', content: 'halo' }] },
    ]);
    store['ezrab_docai_history_v1'] = JSON.stringify([{ id: 'H1', at: 1 }]);
    store['ezrab_custom_ahsp_v1'] = JSON.stringify([{ id: 'A1', code: 'X.1' }]);
    store['ezrab_chat_draft_conv-9'] = JSON.stringify({ text: 'draf belum terkirim', projectId: 'P1', savedAt: 1 });
    store['ezrab_prod_active_project_id'] = 'P1';

    const created = createBackup();
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('createBackup failed');

    for (const k of Object.keys(store)) delete store[k];
    const restore = restoreBackup(created.content);
    expect(restore.ok).toBe(true);

    const drafts = loadVersioned<any>('ezrab_prod_ai_drafts');
    expect(drafts.ok && (drafts.data as any).P1.id).toBe('D1');
    const fin = loadVersioned<any>('ezrab_prod_finalization_keys');
    expect(fin.ok && (fin.data as any).k1.key).toBe('k1');
    // Raw keys: byte-level equality
    expect(store['ezrab_unified_conversations_v2']).toBe(
      JSON.stringify([{ id: 'C1', projectId: 'P1', messages: [{ id: 'M1', role: 'user', content: 'halo' }] }])
    );
    expect(store['ezrab_docai_history_v1']).toBe(JSON.stringify([{ id: 'H1', at: 1 }]));
    expect(store['ezrab_custom_ahsp_v1']).toBe(JSON.stringify([{ id: 'A1', code: 'X.1' }]));
    expect(store['ezrab_chat_draft_conv-9']).toBe(
      JSON.stringify({ text: 'draf belum terkirim', projectId: 'P1', savedAt: 1 })
    );
    expect(store['ezrab_prod_active_project_id']).toBe('P1');
  });

  it('9. P1-A: legacy v1 file (no rawDatasets) leaves raw families untouched', () => {
    seedTestData();
    store['ezrab_unified_conversations_v2'] = JSON.stringify([
      { id: 'C-KEEP', projectId: 'P1', messages: [] },
    ]);
    const legacy = JSON.stringify({
      kind: 'ezrab-backup',
      metadata: {
        formatVersion: BACKUP_FORMAT_VERSION,
        schemaVersion: 2,
        createdAt: new Date().toISOString(),
        datasetCounts: {},
        projectSummary: [{ id: 'P1', name: 'Proyek Test', itemCount: 2 }],
      },
      datasets: {
        ezrab_prod_projects: [{ id: 'P9', name: 'Dari Backup Lama' }],
        ezrab_prod_rab_items: [],
      },
      // no rawDatasets key at all
    });
    const validation = validateBackup(legacy);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.warnings.some((w) => w.includes('Backup lama'))).toBe(true);
    }
    const restore = restoreBackup(legacy);
    expect(restore.ok).toBe(true);
    const projects = loadVersioned<any[]>('ezrab_prod_projects');
    expect(projects.ok && projects.data[0].id).toBe('P9');
    // Raw conversation data untouched (not wiped by the old backup)
    expect(store['ezrab_unified_conversations_v2']).toBe(
      JSON.stringify([{ id: 'C-KEEP', projectId: 'P1', messages: [] }])
    );
  });

  it('10. P1-A: corrupt file rejected with zero writes', () => {
    seedTestData();
    const before = { ...store };
    const bad = JSON.stringify({
      kind: 'ezrab-backup',
      metadata: {
        formatVersion: BACKUP_FORMAT_VERSION,
        schemaVersion: 2,
        createdAt: new Date().toISOString(),
        datasetCounts: {},
        projectSummary: [],
      },
      datasets: { ezrab_prod_projects: 'bukan-array' },
    });
    const result = restoreBackup(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.restoredKeys).toHaveLength(0);
    expect(store).toEqual(before);
  });

  it('11. P1-A: unknown dataset key rejected (no arbitrary key writes)', () => {
    const planted = JSON.stringify({
      kind: 'ezrab-backup',
      metadata: {
        formatVersion: BACKUP_FORMAT_VERSION,
        schemaVersion: 2,
        createdAt: new Date().toISOString(),
        datasetCounts: {},
        projectSummary: [],
      },
      datasets: {},
      rawDatasets: { ezrab_role_v1: '"SUPER_ADMIN"' },
    });
    const result = validateBackup(planted);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/tidak dikenal/);
    expect('ezrab_role_v1' in store).toBe(false);
  });

  it('12. P1-A: safety backup stores a recoverable slot', () => {
    seedTestData();
    const safety = createSafetyBackup();
    expect(safety.ok).toBe(true);
    expect(safety.slotStored).toBe(true);
    expect(safety.filename).toMatch(/^ezrab-backup-pengaman-/);
    const slot = getSafetySlotContent();
    expect(slot).not.toBeNull();
    expect(JSON.parse(slot!).kind).toBe('ezrab-backup');
    // Slot key itself is never part of a backup (no recursion)
    const created = createBackup();
    expect(created.ok).toBe(true);
    if (created.ok) {
      const parsed = JSON.parse(created.content);
      expect(SAFETY_SLOT_KEY in (parsed.rawDatasets ?? {})).toBe(false);
      expect(SAFETY_SLOT_KEY in parsed.datasets).toBe(false);
    }
  });
});
