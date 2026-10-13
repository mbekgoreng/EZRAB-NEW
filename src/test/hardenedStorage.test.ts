/**
 * Tests: Hardened localStorage
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveVersioned,
  loadVersioned,
  migrate,
  STORAGE_SCHEMA_VERSION,
  peekEnvelope,
} from '../engine/storage/hardenedStorage';

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

describe('Hardened storage', () => {
  it('1. save → load roundtrip preserves data', () => {
    const data = [{ id: 'R1', priceSourceKind: 'EZRAB_ASSUMPTION' }];
    const saved = saveVersioned('test_key', data);
    expect(saved.ok).toBe(true);

    const loaded = loadVersioned<typeof data>('test_key');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data).toEqual(data);
      expect(loaded.migrated).toBe(false);
    }
  });

  it('2. legacy raw array (no envelope) loads as v1', () => {
    const legacy = [{ id: 'R-OLD', unitPrice: 100000 }];
    store['legacy_key'] = JSON.stringify(legacy); // no envelope

    const loaded = loadVersioned<typeof legacy>('legacy_key');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data).toEqual(legacy);
      expect(loaded.migrated).toBe(true);
      expect(loaded.fromVersion).toBe(1);
    }
  });

  it('3. corrupt JSON → CORRUPT, not throw', () => {
    store['bad_key'] = '{invalid json';
    const loaded = loadVersioned('bad_key');
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.error).toBe('CORRUPT');
  });

  it('4. missing key → NOT_FOUND', () => {
    const loaded = loadVersioned('nope');
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.error).toBe('NOT_FOUND');
  });

  it('5. envelope carries version + writeId', () => {
    saveVersioned('meta_key', { a: 1 });
    const meta = peekEnvelope('meta_key');
    expect(meta).not.toBeNull();
    expect(meta!.v).toBe(STORAGE_SCHEMA_VERSION);
    expect(meta!.writeId).toBeTruthy();
    expect(meta!.savedAt).toBeTruthy();
  });

  it('6. two saves produce different writeIds (conflict detection)', () => {
    saveVersioned('w_key', [1]);
    const m1 = peekEnvelope('w_key')!;
    saveVersioned('w_key', [2]);
    const m2 = peekEnvelope('w_key')!;
    expect(m1.writeId).not.toBe(m2.writeId);
  });

  it('7. migrate is idempotent for current version', () => {
    const data = { x: 1 };
    const out = migrate(data, STORAGE_SCHEMA_VERSION);
    expect(out).toEqual(data);
  });
});
