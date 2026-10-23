/**
 * Regresi: modal "Versi & Skenario" membuka halaman kosong (dilaporkan owner
 * 2026-10-23). Akar masalah: `if (!isOpen) return null;` berada DI ANTARA
 * hooks React di EstimateVersionAndScenarioModal.tsx — dua useMemo berjalan
 * hanya saat modal terbuka, sehingga React melempar "Rendered more hooks
 * than during the previous render" dan pohon komponen runtuh (blank).
 *
 * Tes ini mengunci struktur yang benar dari SUMBER:
 * 1. Tidak ada pemanggilan hook setelah early return `if (!isOpen)`.
 * 2. Engine skenario tetap menghasilkan baseline dari item kosong
 *    (modal aman dibuka pada proyek tanpa item RAB).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VersionAndScenarioEngine } from '../engine/versionAndScenarioEngine';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('EstimateVersionAndScenarioModal — struktur hooks', () => {
  const src = read('../components/versioning/EstimateVersionAndScenarioModal.tsx');

  it('early return isOpen berada SETELAH seluruh hooks', () => {
    const earlyIdx = src.indexOf('if (!isOpen) return null;');
    expect(earlyIdx).toBeGreaterThan(-1);
    const after = src.slice(earlyIdx);
    const hookCalls = after.match(/\buse(State|Memo|Effect|Ref|Callback|Context|Reducer)\s*\(/g) || [];
    expect(hookCalls).toEqual([]);
  });

  it('categoryVariances terlindung dari skenario kosong', () => {
    expect(src).toContain('if (!baselineScenario || !activeScenario) return [];');
  });
});

describe('VersionAndScenarioEngine — proyek kosong', () => {
  it('generateDefaultScenarios dengan item kosong tetap menghasilkan baseline', () => {
    const scenarios = VersionAndScenarioEngine.generateDefaultScenarios('PROJ-EMPTY', []);
    expect(scenarios.length).toBeGreaterThanOrEqual(1);
    const baseline = scenarios.find((s) => s.isBaseline);
    expect(baseline).toBeTruthy();
    expect(baseline?.totalRab).toBe(0);
  });
});
