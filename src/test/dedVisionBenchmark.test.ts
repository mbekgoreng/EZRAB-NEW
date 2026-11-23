/**
 * DED vision — benchmark suite (increment I10a, plain-tsx assertion script,
 * NO vitest imports).
 *
 * STUB-FIRST: this suite makes ZERO network calls and NEVER constructs the
 * real gateway responder. The global fetch is replaced with a sentinel that
 * fails the suite if anything ever calls it; every vision call goes through
 * the harness's fixture-defined stub responder, and every render goes
 * through a stub renderPage.
 *
 * The suite runs the benchmark harness over all fixtures (synthetic +
 * internet; the owner tier is empty and reported, never failed), prints the
 * full per-metric report (THAT printout is the benchmark output), and
 * asserts ONLY:
 * - the five regression guards (dimension negatives, QTO exactness,
 *   truncation, dedupe, no invented prices), and
 * - harness integrity (all fixtures load, every expected metric is
 *   computed, the report is well-formed, no network call happened).
 *
 * Accuracy numbers are REPORTED, not asserted: a low accuracy is a
 * finding for the I10b fix pass, not a test failure — except the guards.
 *
 * Run from repo root:
 *   npx --yes tsx src/test/dedVisionBenchmark.test.ts
 */

import {
  formatBenchmarkReport,
  runBenchmark,
} from '../ai-tools/ded-vision/benchmark';
import {
  INTERNET_FIXTURES,
  OWNER_FIXTURES,
  SYNTHETIC_FIXTURES,
  allFixtures,
} from '../ai-tools/ded-vision/fixtures/index';

// --- fetch sentinel: ANY network call fails the suite -----------------------
let fetchCalls = 0;
(globalThis as unknown as { fetch: typeof fetch }).fetch = ((..._args: unknown[]) => {
  fetchCalls += 1;
  throw new Error('NETWORK CALL IN TEST — the benchmark must use stub responders only.');
}) as unknown as typeof fetch;

// --- assertion harness (same style as dedVisionPipeline.test.ts) ------------
let passed = 0;
let total = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  total += 1;
  const ok =
    typeof actual === 'number' && typeof expected === 'number'
      ? Math.abs(actual - expected) < 1e-9
      : actual === expected;
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function checkTrue(name: string, cond: boolean): void {
  total += 1;
  if (cond) passed += 1;
  else failures.push(`${name} — expected true, got false`);
}

/** Metric ids that MUST be present in every benchmark report. */
const REQUIRED_METRIC_IDS = [
  'classification.overall.accuracy',
  'classification.unknownRate',
  'dimension.LINEAR.recall',
  'dimension.LINEAR.precision',
  'dimension.negatives.falsePositives',
  'dimension.list.exactMatchRate',
  'opening.scheduleRow.exactMatchRate',
  'opening.count.exactMatchRate',
  'opening.conflict.recall',
  'qto.exactMatchRate',
  'scale.statedScale.accuracy',
  'scale.flow.accuracy',
  'reference.resolution.accuracy',
  'reference.conflict.recall',
  'ocr.parse.spanRecall',
  'ocr.parse.spanPrecision',
  'ocr.dedupe.accuracy',
  'ocr.truncation.routesToText',
  'ocr.penalty.accuracy',
  'review.bboxToPercent.accuracy',
  'pipeline.classification.accuracy',
  'pipeline.dimension.recall',
  'pipeline.dimension.precision',
  'pipeline.opening.scheduleAssociation',
  'pipeline.opening.countAccuracy',
  // I11 Stage 4: element + quantity metrics (E16/E17).
  'pipeline.element.recall',
  'pipeline.element.precision',
  'pipeline.quantity.recall',
  'pipeline.quantity.precision',
  'pipeline.reference.recall',
  'pipeline.scale.accuracy',
  'pipeline.detailPass.accuracy',
  'pipeline.calls.perDocument',
  'pipeline.bbox.meanIou',
  'pipeline.cache.secondRunHitRate',
];

async function main(): Promise<void> {
  const fixtures = allFixtures();
  const report = await runBenchmark(fixtures);

  // The printed report IS the benchmark output.
  console.log(formatBenchmarkReport(report));

  console.log('--- benchmark suite checks ---');

  // Harness integrity: fixtures load.
  // I11 Stage 3: 9 → 10 — the id-jadwal-kusen family was added (Part B
  // jadwal pintu dan jendela coverage). The check's purpose is "fixtures
  // load"; the number is incidental to the registry size.
  check('synthetic fixtures loaded', SYNTHETIC_FIXTURES.length, 10);
  check('fixtureCounts.synthetic', report.fixtureCounts.synthetic, 10);
  check('fixtureCounts.internet', report.fixtureCounts.internet, INTERNET_FIXTURES.length);
  check('owner tier is empty (awaiting owner drawings)', OWNER_FIXTURES.length, 0);
  check('fixtureCounts.owner', report.fixtureCounts.owner, 0);
  check('fixtureCounts.total', report.fixtureCounts.total, fixtures.length);
  checkTrue('report scope states the stub-first limit', report.scope.includes('NO live provider'));

  // Harness integrity: every expected metric computed.
  const presentIds = new Set(report.metrics.map((m) => m.metric));
  for (const id of REQUIRED_METRIC_IDS) {
    checkTrue(`metric present: ${id}`, presentIds.has(id));
  }
  checkTrue('metrics computed', report.metrics.length > 0);
  check('guards evaluated', report.guards.length, 5);
  check('capability coverage entries', report.coverage.length, 8);
  checkTrue(
    'every metric has a sample size',
    report.metrics.every((m) => Number.isInteger(m.n) && m.n >= 0),
  );

  // Regression guards — these FAIL the suite when violated.
  for (const guard of report.guards) {
    total += 1;
    if (guard.passed) {
      passed += 1;
    } else {
      failures.push(`GUARD ${guard.id} — ${guard.description} — ${guard.detail}`);
    }
  }

  // No network call happened.
  check('fetch sentinel: zero network calls', fetchCalls, 0);

  console.log(`\nPASS ${passed}/${total}`);
  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Benchmark suite crashed:', e);
  process.exit(1);
});
