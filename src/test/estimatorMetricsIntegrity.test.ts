/**
 * EZRAB P1 — Spreadsheet RAB summary-card data integrity.
 *
 * Regression test for the demo-fallback bug: when a project has no items,
 * EstimatorMetrics previously rendered fabricated numbers
 * (Rp660.638.840, 7 items, 68%, "14 Agu 2026, 10:24") while the table
 * correctly showed 0 items. Cards must now render real data only:
 * 0 renders as Rp0 / 0, and unavailable values render as "—".
 *
 * Run: npx tsx src/test/estimatorMetricsIntegrity.test.ts
 */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { EstimatorMetrics } from '../components/estimator/EstimatorMetrics';

interface CaseResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: CaseResult[] = [];

function check(name: string, condition: boolean, detail = ''): void {
  results.push({ name, pass: condition, detail });
}

function render(props: Record<string, unknown>): string {
  return renderToStaticMarkup(
    React.createElement(EstimatorMetrics as any, {
      totalRab: 0,
      totalItems: 0,
      ahspCount: 0,
      totalVolume: 0,
      ...props,
    }),
  );
}

/** Normalizes Intl currency output ("Rp\u00A01.500.000" -> "Rp 1.500.000"). */
function norm(html: string): string {
  return html.replace(/ /g, ' ');
}

// ---------------------------------------------------------------------------
// Kasus A — Proyek kosong: no demo numbers may appear
// ---------------------------------------------------------------------------
{
  const html = norm(render({}));

  check('A1 total RAB renders Rp 0', html.includes('Rp 0'), 'expected "Rp 0" in output');
  check(
    'A2 no demo nominal 660638840',
    !html.includes('660638840') && !html.includes('660.638.840'),
    'demo nominal must not appear',
  );
  check(
    'A3 no demo progress 68%',
    !html.includes('68%'),
    'hardcoded 68% must not appear',
  );
  check(
    'A4 no demo date',
    !html.includes('14 Agu 2026'),
    'demo date must not appear',
  );
  check(
    'A5 progress renders em dash when unavailable',
    html.includes('—'),
    'expected "—" for missing progress/date',
  );
  check(
    'A6 no NaN/Infinity leak',
    !html.includes('NaN') && !html.includes('Infinity'),
    'no invalid numeric output',
  );
  // Total Item card: the value 0 must be present as a standalone card value,
  // and the AHSP subtext must read "dari 0 AHSP".
  check('A7 AHSP subtext reads "dari 0 AHSP"', html.includes('dari 0 AHSP'));
}

// ---------------------------------------------------------------------------
// Kasus B — Proyek berisi data nyata: real values render correctly
// ---------------------------------------------------------------------------
{
  const html = norm(render({
    totalRab: 1500000,
    totalItems: 12,
    ahspCount: 8,
    totalVolume: 1234.5,
    progressPercent: 45,
    completedItemsCount: 9,
    inProgressItemsCount: 2,
    pendingItemsCount: 1,
    lastSavedText: '12 Okt 2026, 09:00',
    versionDeltaPercent: 3.2,
  }));

  check('B1 real total renders Rp 1.500.000', html.includes('Rp 1.500.000'));
  check('B2 real item count 12 present', />12</.test(html), 'expected ">12<" card value');
  check('B3 real AHSP count', html.includes('dari 8 AHSP'));
  check('B4 real progress 45%', html.includes('45%'));
  check('B5 legend counts', html.includes('>9<') && html.includes('>2<') && html.includes('>1<'));
  check('B6 real saved text', html.includes('12 Okt 2026, 09:00'));
  check('B7 positive delta shows ▲ 3,2% + label', html.includes('▲') && html.includes('3,2%') && html.includes('dari versi sebelumnya'));
}
{
  // Negative delta
  const html = render({ versionDeltaPercent: -1.5 });
  check('B8 negative delta shows ▼ 1,5%', html.includes('▼') && html.includes('1,5%'));
}
{
  // No version history -> neutral label, no fabricated claim
  const html = render({ versionDeltaPercent: null });
  check('B9 no delta -> "nilai saat ini"', html.includes('nilai saat ini') && !html.includes('dari versi sebelumnya'));
}

// ---------------------------------------------------------------------------
// Kasus C — Loading / error / invalid numeric input
// ---------------------------------------------------------------------------
{
  const nan = render({ progressPercent: NaN });
  check('C1 NaN progress renders —', !nan.includes('NaN') && nan.includes('—'));

  const inf = render({ progressPercent: Infinity });
  check('C2 Infinity progress renders —', !inf.includes('Infinity') && inf.includes('—'));

  const over = render({ progressPercent: 150 });
  check('C3 progress clamped to 100%', over.includes('100%') && !over.includes('150%'));

  const neg = render({ progressPercent: -10 });
  check('C4 negative progress clamped to 0%', neg.includes('0%'));

  const nanDelta = render({ versionDeltaPercent: NaN });
  check('C5 NaN delta -> neutral label', nanDelta.includes('nilai saat ini'));

  const undef = render({ totalRab: undefined as any });
  check('C6 undefined totalRab does not crash, no demo nominal', !undef.includes('660638840'));
}

// ---------------------------------------------------------------------------
// Kasus D — Source-level regression guard: demo literals must stay out
// ---------------------------------------------------------------------------
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(
    path.join(here, '..', 'components', 'estimator', 'EstimatorMetrics.tsx'),
    'utf8',
  );
  check('D1 source has no 660638840 literal', !src.includes('660638840'));
  check('D2 source has no "14 Agu 2026" literal', !src.includes('14 Agu 2026'));
  check('D3 source has no hardcoded "3,2%" claim', !src.includes('3,2%'));
  check(
    'D4 source uses nullish handling, no `||` numeric fallback on card values',
    !/\{\s*(totalRab|totalItems|ahspCount)\s*\|\|/.test(src),
    'found `||` fallback on a card value',
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
export function runEstimatorMetricsIntegrityTests(): {
  success: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  logs: string[];
} {
  const logs: string[] = [];
  let passed = 0;
  for (const r of results) {
    if (r.pass) {
      passed++;
      logs.push(`  [PASS] ${r.name}`);
    } else {
      logs.push(`  [FAIL] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    }
  }
  logs.push('========================================================');
  logs.push(`TEST SUMMARY: ${passed} PASSED, ${results.length - passed} FAILED out of ${results.length} tests`);
  logs.push('========================================================');
  return {
    success: passed === results.length,
    totalTests: results.length,
    passedTests: passed,
    failedTests: results.length - passed,
    logs,
  };
}

// Direct runner if executed via node / tsx
const runtimeProcess = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
if (runtimeProcess?.argv && runtimeProcess.argv[1]?.includes('estimatorMetricsIntegrity.test')) {
  const result = runEstimatorMetricsIntegrityTests();
  console.log(result.logs.join('\n'));
  if (!result.success) {
    runtimeProcess.exit(1);
  }
}
