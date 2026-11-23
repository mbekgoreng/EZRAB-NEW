/**
 * DED drawing-vision benchmark harness (increment I10a, owner order
 * 2026-11-22 12:40).
 *
 * STUB-FIRST, HONEST SCOPE: this harness measures the DETERMINISTIC
 * layers (I1–I9) + pipeline wiring with fixture-defined stub vision
 * responses. It does NOT measure live-model quality — no provider call
 * is ever made (the suite runs behind a fetch sentinel), and every stub
 * response is a fixture artifact. Real-document accuracy waits for the
 * owner's drawings (the owner tier is empty) and live-model quality
 * waits for a live-call grant. Both limits are stated in every report
 * this harness produces.
 *
 * Per-metric, NEVER one headline number (PLAN.md §5): every metric is
 * reported per kind / per class / per text class with its own n. A low
 * accuracy is a FINDING, not a test failure — except the five regression
 * guards (dimension negatives, QTO exactness, truncation, dedupe,
 * no-invented-prices), which FAIL the suite when violated.
 *
 * The harness never modifies a module under test and never invents a
 * measurement: anything unverifiable is reported as "not measured".
 */

import { classifyDrawingPage } from './classification';
import { kindFromLabelHint, parseDimensionList, parseDimensionToken } from './dimensions';
import {
  checkOpeningConflict,
  countOpenings,
  parseScheduleRow,
} from './openings';
import {
  aggregateFloors,
  qtoArea,
  qtoCount,
  qtoLength,
  qtoPerimeter,
  qtoSurfaceArea,
  qtoVolume,
  qtoWallNetArea,
} from './geometryQto';
import {
  createReferenceGraph,
  addReference,
  detectConflicts,
  resolveGraph,
} from './references';
import {
  calibrateFromDimension,
  detectNonUniformScaling,
  measureFromPixels,
  parseStatedScale,
  verifyCalibration,
} from './scale';
import {
  applyOcrFlagPenalty,
  dedupeOcrSpans,
  isDimensionLikeText,
  isMarkLikeText,
  isReferenceLikeText,
  isScheduleRowLikeText,
  ocrSpansToProposals,
  parseOcrResponse,
} from './visionOcr';
import type { OcrTextSpan } from './visionOcr';
import type { VisionResponder, VisionResponse } from './visionClient';
import { runVisionDocument } from './visionPipeline';
import type {
  VisionAhspMatchInput,
  VisionDocumentResult,
  VisionRenderPage,
} from './visionPipeline';
import { VisionCache } from './visionCache';
import type { VisionParseResult } from './visionClient';
import { bboxIou } from './roi';
import { bboxToPercent } from './reviewState';
import {
  BBOX_PERCENT_PROBES,
  CLASSIFICATION_PROBES,
  DIMENSION_LIST_PROBES,
  DIMENSION_TOKEN_PROBES,
  makeQtoProbes,
  NON_UNIFORM_PROBES,
  OCR_DEDUPE_PROBES,
  OCR_PARSE_PROBES,
  OCR_PENALTY_PROBES,
  OCR_ROUTING_PROBES,
  OPENING_CONFLICT_PROBES,
  OPENING_COUNT_PROBES,
  REFERENCE_PROBES,
  SCALE_FLOW_PROBES,
  SCHEDULE_ROW_PROBES,
  STATED_SCALE_PROBES,
} from './fixtures/probes';
import type {
  BenchmarkFixture,
  ExpectedDimension,
  ExpectedElement,
  ExpectedOcrSpan,
  ExpectedOpening,
  ExpectedQuantity,
  ExpectedReference,
  FixtureTier,
} from './fixtures/types';
import type {
  DimensionKind,
  DrawingPageClass,
} from './types';

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

export interface MetricResult {
  /** Dotted metric id, e.g. 'classification.FLOOR_PLAN.accuracy'. */
  metric: string;
  tier: string;
  /** Sample size. 0 with value null = not measured. */
  n: number;
  /** Null = not measured (never guessed). */
  value: number | null;
  display: string;
  notes: string;
}

export interface FixtureFailure {
  fixtureId: string;
  metric: string;
  expected: string;
  got: string;
  severity: 'guard' | 'finding';
}

export interface GuardResult {
  id: string;
  description: string;
  passed: boolean;
  detail: string;
}

export interface CapabilityCoverage {
  capability: string;
  status: 'measured' | 'partial' | 'not-yet';
  detail: string;
}

export interface BenchmarkReport {
  generatedAt: string;
  scope: string;
  fixtureCounts: { synthetic: number; internet: number; owner: number; total: number };
  metrics: MetricResult[];
  failures: FixtureFailure[];
  guards: GuardResult[];
  coverage: CapabilityCoverage[];
  notMeasured: string[];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function pct(value: number | null): string {
  if (value === null) return 'not measured';
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null, digits = 3): string {
  if (value === null) return 'not measured';
  return value.toFixed(digits);
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

interface MultisetOutcome<T> {
  matched: number;
  missing: T[];
  extra: T[];
}

/** Multiset match by key: duplicates count (two identical expected entries need two actuals). */
function multisetMatch<T>(
  expected: T[],
  actual: T[],
  key: (t: T) => string,
): MultisetOutcome<T> {
  const actualByKey = new Map<string, T[]>();
  for (const a of actual) {
    const k = key(a);
    const list = actualByKey.get(k) ?? [];
    list.push(a);
    actualByKey.set(k, list);
  }
  let matched = 0;
  const missing: T[] = [];
  for (const e of expected) {
    const list = actualByKey.get(key(e)) ?? [];
    if (list.length > 0) {
      list.shift();
      matched += 1;
    } else {
      missing.push(e);
    }
  }
  const extra: T[] = [];
  for (const list of actualByKey.values()) extra.push(...list);
  return { matched, missing, extra };
}

function dimKey(d: { page: number; originalText: string; value: number; unit: string; kind: string }): string {
  return `${d.page}|${d.originalText}|${d.value}|${d.unit}|${d.kind}`;
}

function ocrSpanKey(s: { page: number; text: string }): string {
  return `${s.page}|${s.text}`;
}

// ---------------------------------------------------------------------------
// Direct-probe measurement (pure modules, no pipeline)
// ---------------------------------------------------------------------------

interface DirectOutcome {
  metrics: MetricResult[];
  failures: FixtureFailure[];
  /** Guard inputs, carried to the guard evaluation. */
  guardInputs: {
    dimensionNegativeFalsePositives: number;
    qtoExact: boolean;
    qtoFailures: string[];
    truncatedCompleted: number;
    dedupeFailures: number;
  };
}

function measureDirect(): DirectOutcome {
  const metrics: MetricResult[] = [];
  const failures: FixtureFailure[] = [];
  const fail = (metric: string, expected: string, got: string, severity: 'guard' | 'finding' = 'finding'): void => {
    failures.push({ fixtureId: 'probes', metric, expected, got, severity });
  };

  // --- I1 classification: accuracy per class + UNKNOWN rate --------------
  {
    const byClass = new Map<DrawingPageClass, { correct: number; total: number }>();
    let unknownOut = 0;
    let total = 0;
    for (const probe of CLASSIFICATION_PROBES) {
      const got = classifyDrawingPage({
        page: 1,
        title: probe.title,
        text: probe.text,
        hasTextLayer: probe.hasTextLayer,
      });
      const bucket = byClass.get(probe.expected) ?? { correct: 0, total: 0 };
      bucket.total += 1;
      if (got.drawingClass === probe.expected) bucket.correct += 1;
      else {
        fail(
          `classification.${probe.expected}.accuracy`,
          probe.expected,
          `${got.drawingClass} (probe ${probe.name})`,
        );
      }
      byClass.set(probe.expected, bucket);
      if (got.drawingClass === 'UNKNOWN') unknownOut += 1;
      total += 1;
    }
    let correctAll = 0;
    for (const [cls, b] of [...byClass.entries()].sort()) {
      correctAll += b.correct;
      metrics.push({
        metric: `classification.${cls}.accuracy`,
        tier: 'probes',
        n: b.total,
        value: rate(b.correct, b.total),
        display: pct(rate(b.correct, b.total)),
        notes: `${b.correct}/${b.total} correct`,
      });
    }
    metrics.push({
      metric: 'classification.overall.accuracy',
      tier: 'probes',
      n: total,
      value: rate(correctAll, total),
      display: pct(rate(correctAll, total)),
      notes: `${correctAll}/${total} correct`,
    });
    metrics.push({
      metric: 'classification.unknownRate',
      tier: 'probes',
      n: total,
      value: rate(unknownOut, total),
      display: pct(rate(unknownOut, total)),
      notes: `${unknownOut}/${total} probes classified UNKNOWN (includes 4 expected-UNKNOWN probes)`,
    });
  }

  // --- I2 dimensions: precision/recall per kind + negatives --------------
  let dimensionNegativeFalsePositives = 0;
  {
    const kinds: DimensionKind[] = ['LINEAR', 'ELEVATION', 'LEVEL', 'DIAMETER', 'RADIUS', 'ANGLE'];
    const expectedByKind = new Map<DimensionKind, number>();
    const tpByKind = new Map<DimensionKind, number>();
    const emittedByKind = new Map<DimensionKind, number>();
    for (const probe of DIMENSION_TOKEN_PROBES) {
      const got = parseDimensionToken(probe.text, { page: 1 });
      if (probe.expected === null) {
        if (got !== null) {
          dimensionNegativeFalsePositives += 1;
          fail(
            'dimension.negatives.falsePositives',
            `null (probe ${probe.name} ${JSON.stringify(probe.text)})`,
            `${got.normalizedValue} ${got.unit} ${got.kind}`,
            'guard',
          );
        }
        continue;
      }
      expectedByKind.set(probe.expected.kind, (expectedByKind.get(probe.expected.kind) ?? 0) + 1);
      const ok =
        got !== null &&
        got.normalizedValue === probe.expected.value &&
        got.unit === probe.expected.unit &&
        got.kind === probe.expected.kind;
      if (ok) tpByKind.set(probe.expected.kind, (tpByKind.get(probe.expected.kind) ?? 0) + 1);
      else {
        fail(
          `dimension.${probe.expected.kind}.recall`,
          `${probe.expected.value} ${probe.expected.unit} ${probe.expected.kind} (probe ${probe.name} ${JSON.stringify(probe.text)})`,
          got === null ? 'null' : `${got.normalizedValue} ${got.unit} ${got.kind}`,
        );
      }
      if (got !== null) {
        emittedByKind.set(got.kind, (emittedByKind.get(got.kind) ?? 0) + 1);
      }
    }
    for (const kind of kinds) {
      const exp = expectedByKind.get(kind) ?? 0;
      const tp = tpByKind.get(kind) ?? 0;
      const emitted = emittedByKind.get(kind) ?? 0;
      if (exp > 0 || emitted > 0) {
        metrics.push({
          metric: `dimension.${kind}.recall`,
          tier: 'probes',
          n: exp,
          value: rate(tp, exp),
          display: pct(rate(tp, exp)),
          notes: `${tp}/${exp} expected ${kind} records parsed exactly`,
        });
        metrics.push({
          metric: `dimension.${kind}.precision`,
          tier: 'probes',
          n: emitted,
          value: rate(tp, emitted),
          display: pct(rate(tp, emitted)),
          notes: `${tp}/${emitted} emitted ${kind} records correct`,
        });
      }
    }
    const negativeCount = DIMENSION_TOKEN_PROBES.filter((p) => p.expected === null).length;
    metrics.push({
      metric: 'dimension.negatives.falsePositives',
      tier: 'probes',
      n: negativeCount,
      value: dimensionNegativeFalsePositives,
      display: String(dimensionNegativeFalsePositives),
      notes: `0 required (guard). ${dimensionNegativeFalsePositives}/${negativeCount} negatives parsed as dimensions`,
    });

    // List parser: exact multiset match per probe.
    let listExact = 0;
    for (const probe of DIMENSION_LIST_PROBES) {
      const got = parseDimensionList(probe.text, { page: 1 });
      const expected = probe.expected.map((e) => ({
        page: 1,
        originalText: '',
        value: e.value,
        unit: e.unit,
        kind: e.kind,
      }));
      const gotNorm = got.map((r) => ({
        page: r.page,
        originalText: '',
        value: r.normalizedValue,
        unit: r.unit,
        kind: r.kind,
      }));
      const m = multisetMatch(expected, gotNorm, (d) => `${d.value}|${d.unit}|${d.kind}`);
      const assocOk = probe.expected.every((e) => {
        if (e.associatedElement === undefined) return true;
        return got.some((r) => r.associatedElement === e.associatedElement);
      });
      if (m.missing.length === 0 && m.extra.length === 0 && assocOk) listExact += 1;
      else {
        fail(
          'dimension.list.exactMatchRate',
          `${probe.expected.map((e) => `${e.value}${e.unit}`).join(', ')} (probe ${probe.name} ${JSON.stringify(probe.text)})`,
          got.length === 0 ? '(none)' : got.map((r) => `${r.normalizedValue}${r.unit}`).join(', '),
        );
      }
    }
    metrics.push({
      metric: 'dimension.list.exactMatchRate',
      tier: 'probes',
      n: DIMENSION_LIST_PROBES.length,
      value: rate(listExact, DIMENSION_LIST_PROBES.length),
      display: pct(rate(listExact, DIMENSION_LIST_PROBES.length)),
      notes: `${listExact}/${DIMENSION_LIST_PROBES.length} list parses match exactly (incl. associatedElement)`,
    });
  }

  // --- I3 openings: schedule rows, counts, conflicts ----------------------
  {
    let rowExact = 0;
    let rowReject = 0;
    let rowRejectTotal = 0;
    for (const probe of SCHEDULE_ROW_PROBES) {
      const got = parseScheduleRow(probe.rowText, probe.page);
      if (probe.expected === null) {
        rowRejectTotal += 1;
        if (got === null) rowReject += 1;
        else fail('opening.scheduleRow.rejection', `null (probe ${probe.name})`, `mark ${got.mark}`);
        continue;
      }
      // I11 Stage 4 (E15): thickness is asserted only when the probe
      // expects it (pair rows carry no thickness expectation).
      const ok =
        got !== null &&
        got.mark === probe.expected.mark &&
        (got.widthMm ?? null) === probe.expected.widthMm &&
        (got.heightMm ?? null) === probe.expected.heightMm &&
        (probe.expected.thicknessMm === undefined ||
          (got.thicknessMm ?? null) === probe.expected.thicknessMm);
      if (ok) rowExact += 1;
      else {
        const expT = probe.expected.thicknessMm !== undefined ? `×${probe.expected.thicknessMm}` : '';
        const gotT = got?.thicknessMm !== null && got?.thicknessMm !== undefined ? `×${got.thicknessMm}` : '';
        fail(
          'opening.scheduleRow.exactMatchRate',
          `${probe.expected.mark} ${probe.expected.widthMm}×${probe.expected.heightMm}${expT} (probe ${probe.name})`,
          got === null ? 'null' : `${got.mark} ${got.widthMm ?? 'null'}×${got.heightMm ?? 'null'}${gotT}`,
        );
      }
    }
    const rowPositiveTotal = SCHEDULE_ROW_PROBES.length - rowRejectTotal;
    metrics.push({
      metric: 'opening.scheduleRow.exactMatchRate',
      tier: 'probes',
      n: rowPositiveTotal,
      value: rate(rowExact, rowPositiveTotal),
      display: pct(rate(rowExact, rowPositiveTotal)),
      notes: `${rowExact}/${rowPositiveTotal} rows parse to the exact mark + mm dims (incl. thickness where stubbed)`, 
    });
    metrics.push({
      metric: 'opening.scheduleRow.rejectionRate',
      tier: 'probes',
      n: rowRejectTotal,
      value: rate(rowReject, rowRejectTotal),
      display: pct(rate(rowReject, rowRejectTotal)),
      notes: `${rowReject}/${rowRejectTotal} non-rows correctly rejected`,
    });

    let countExact = 0;
    for (const probe of OPENING_COUNT_PROBES) {
      const schedule = probe.scheduleRows
        .map((row) => parseScheduleRow(row, 4))
        .filter((e): e is NonNullable<typeof e> => e !== null);
      const got = countOpenings(probe.occurrences, schedule);
      const m = multisetMatch(
        probe.expected,
        got.map((o) => ({ mark: o.mark, quantity: o.quantity, widthMm: o.widthMm, heightMm: o.heightMm })),
        (o) => `${o.mark}|${o.quantity}|${o.widthMm}|${o.heightMm}`,
      );
      if (m.missing.length === 0 && m.extra.length === 0) countExact += 1;
      else {
        fail(
          'opening.count.exactMatchRate',
          `${probe.expected.map((e) => `${e.mark}×${e.quantity}`).join(', ')} (probe ${probe.name})`,
          got.map((o) => `${o.mark}×${o.quantity}`).join(', ') || '(none)',
        );
      }
    }
    metrics.push({
      metric: 'opening.count.exactMatchRate',
      tier: 'probes',
      n: OPENING_COUNT_PROBES.length,
      value: rate(countExact, OPENING_COUNT_PROBES.length),
      display: pct(rate(countExact, OPENING_COUNT_PROBES.length)),
      notes: `${countExact}/${OPENING_COUNT_PROBES.length} count cases match exactly (mark + quantity + dims)`,
    });

    let conflictTp = 0;
    let conflictFn = 0;
    let conflictFp = 0;
    let conflictTn = 0;
    for (const probe of OPENING_CONFLICT_PROBES) {
      const entry = parseScheduleRow(probe.rowText, 4);
      if (!entry) {
        fail('opening.conflict.accuracy', 'schedule row parses', `null (probe ${probe.name})`);
        continue;
      }
      const got = checkOpeningConflict(probe.plan, entry);
      if (probe.expected === 'CONFLICT' && got === 'CONFLICT') conflictTp += 1;
      else if (probe.expected === 'CONFLICT') {
        conflictFn += 1;
        fail('opening.conflict.recall', `CONFLICT (probe ${probe.name})`, got);
      } else if (got === 'CONFLICT') {
        conflictFp += 1;
        fail('opening.conflict.falsePositives', `OK (probe ${probe.name})`, got);
      } else conflictTn += 1;
    }
    metrics.push({
      metric: 'opening.conflict.recall',
      tier: 'probes',
      n: conflictTp + conflictFn,
      value: rate(conflictTp, conflictTp + conflictFn),
      display: pct(rate(conflictTp, conflictTp + conflictFn)),
      notes: `${conflictTp}/${conflictTp + conflictFn} real conflicts found`,
    });
    metrics.push({
      metric: 'opening.conflict.falsePositives',
      tier: 'probes',
      n: conflictTn + conflictFp,
      value: conflictFp,
      display: String(conflictFp),
      notes: `${conflictFp} false conflicts out of ${conflictTn + conflictFp} OK cases`,
    });
  }

  // --- I4 QTO: exact match vs hand-computed values ------------------------
  const qtoFailures: string[] = [];
  let qtoExact = true;
  {
    const probes = makeQtoProbes({
      qtoLength,
      qtoArea,
      qtoPerimeter,
      qtoVolume,
      qtoCount,
      qtoSurfaceArea,
      qtoWallNetArea,
      aggregateFloors,
    });
    let exact = 0;
    let maxError = 0;
    for (const probe of probes) {
      const got = probe.run();
      const valueOk =
        (probe.expected === null && got.quantity === null) ||
        (probe.expected !== null &&
          got.quantity !== null &&
          Math.abs(got.quantity - probe.expected) < 1e-9);
      const unitOk = got.unit === probe.expectedUnit;
      const statusOk = probe.expectedStatus === undefined || got.status === probe.expectedStatus;
      if (valueOk && unitOk && statusOk) {
        exact += 1;
        if (probe.expected !== null && got.quantity !== null) {
          maxError = Math.max(maxError, Math.abs(got.quantity - probe.expected));
        }
      } else {
        qtoExact = false;
        const detail = `${probe.name}: expected ${probe.expected} ${probe.expectedUnit}, got ${got.quantity} ${got.unit} (${got.status})`;
        qtoFailures.push(detail);
        fail('qto.exactMatchRate', `${probe.expected} ${probe.expectedUnit} (${probe.name})`, `${got.quantity} ${got.unit} (${got.status})`, 'guard');
      }
    }
    metrics.push({
      metric: 'qto.exactMatchRate',
      tier: 'probes',
      n: probes.length,
      value: rate(exact, probes.length),
      display: pct(rate(exact, probes.length)),
      notes: `${exact}/${probes.length} hand-computed QTO values exact (tolerance 1e-9, incl. null cases)`,
    });
    metrics.push({
      metric: 'qto.maxAbsError',
      tier: 'probes',
      n: probes.length,
      value: maxError,
      display: num(maxError, 6),
      notes: 'Max absolute error over exact matches (0 when all exact)',
    });
  }

  // --- I6 scale ------------------------------------------------------------
  {
    let statedExact = 0;
    for (const probe of STATED_SCALE_PROBES) {
      const got = parseStatedScale(probe.text);
      if (got === probe.expected) statedExact += 1;
      else {
        fail('scale.statedScale.accuracy', `${probe.expected} (probe ${probe.name})`, `${got}`);
      }
    }
    metrics.push({
      metric: 'scale.statedScale.accuracy',
      tier: 'probes',
      n: STATED_SCALE_PROBES.length,
      value: rate(statedExact, STATED_SCALE_PROBES.length),
      display: pct(rate(statedExact, STATED_SCALE_PROBES.length)),
      notes: `${statedExact}/${STATED_SCALE_PROBES.length} stated scales parsed exactly (never a default)`,
    });

    let flowExact = 0;
    let worstRelError = 0;
    for (const probe of SCALE_FLOW_PROBES) {
      const cal = calibrateFromDimension(probe.calibrate.knownMm, probe.calibrate.pixels, 1);
      const verified = verifyCalibration(cal, probe.verifyChecks);
      const measured = measureFromPixels(verified, probe.measurePx ?? 0);
      const mmOk = Math.abs(cal.mmPerPixel - probe.expectedMmPerPixel) < 1e-9;
      const verifiedOk = verified.calibration.verified === probe.expectedVerified;
      const measuredOk =
        (probe.expectedMeasuredMm === null && measured.mm === null) ||
        (probe.expectedMeasuredMm !== null &&
          measured.mm !== null &&
          Math.abs(measured.mm - probe.expectedMeasuredMm) < 1e-9);
      const uncOk =
        probe.expectedUncertaintyPctMax === undefined ||
        (verified.calibration.uncertaintyPct !== null &&
          verified.calibration.uncertaintyPct <= probe.expectedUncertaintyPctMax);
      if (mmOk && verifiedOk && measuredOk && uncOk) {
        flowExact += 1;
        if (probe.expectedMeasuredMm !== null && measured.mm !== null) {
          worstRelError = Math.max(
            worstRelError,
            Math.abs(measured.mm - probe.expectedMeasuredMm) / probe.expectedMeasuredMm,
          );
        }
      } else {
        fail(
          'scale.flow.accuracy',
          `verified=${probe.expectedVerified} measured=${probe.expectedMeasuredMm} (probe ${probe.name})`,
          `verified=${verified.calibration.verified} measured=${measured.mm}`,
        );
      }
    }
    metrics.push({
      metric: 'scale.flow.accuracy',
      tier: 'probes',
      n: SCALE_FLOW_PROBES.length,
      value: rate(flowExact, SCALE_FLOW_PROBES.length),
      display: pct(rate(flowExact, SCALE_FLOW_PROBES.length)),
      notes: `${flowExact}/${SCALE_FLOW_PROBES.length} calibrate→verify→measure flows exact (incl. refusals)`,
    });
    metrics.push({
      metric: 'scale.measurement.maxRelError',
      tier: 'probes',
      n: SCALE_FLOW_PROBES.length,
      value: worstRelError,
      display: num(worstRelError, 6),
      notes: 'Max relative error of verified pixel measurements vs known dims',
    });

    let nonUniformExact = 0;
    for (const probe of NON_UNIFORM_PROBES) {
      const got = detectNonUniformScaling(probe.xMmPerPixel, probe.yMmPerPixel);
      if (got === probe.expected) nonUniformExact += 1;
      else {
        fail('scale.nonUniform.accuracy', `${probe.expected} (probe ${probe.name})`, `${got}`);
      }
    }
    metrics.push({
      metric: 'scale.nonUniform.accuracy',
      tier: 'probes',
      n: NON_UNIFORM_PROBES.length,
      value: rate(nonUniformExact, NON_UNIFORM_PROBES.length),
      display: pct(rate(nonUniformExact, NON_UNIFORM_PROBES.length)),
      notes: `${nonUniformExact}/${NON_UNIFORM_PROBES.length} anisotropy detections correct`,
    });
  }

  // --- I5 references -------------------------------------------------------
  {
    let statusExact = 0;
    let statusTotal = 0;
    let conflictTp = 0;
    let conflictFn = 0;
    let conflictFp = 0;
    for (const probe of REFERENCE_PROBES) {
      let graph = createReferenceGraph();
      for (const r of probe.refs) graph = addReference(graph, r);
      let resolved = resolveGraph(graph, probe.knownTargets);
      if (probe.claims) {
        const claims = new Map<string, Array<{ claim: string; page: number }>>();
        for (const c of probe.claims) claims.set(c.key, c.claims);
        resolved = detectConflicts(resolved, claims);
      }
      probe.expectedStatuses.forEach((expected, i) => {
        statusTotal += 1;
        const got = resolved[i]?.status;
        if (got === expected) statusExact += 1;
        else {
          fail('reference.resolution.accuracy', `${expected} (probe ${probe.name} ref ${i})`, `${got}`);
        }
        if (expected === 'CONTRADICTORY' && got === 'CONTRADICTORY') conflictTp += 1;
        else if (expected === 'CONTRADICTORY') conflictFn += 1;
        else if (got === 'CONTRADICTORY') conflictFp += 1;
      });
      if (probe.expectedConflictDetailContains) {
        const detail = resolved.find((r) => r.status === 'CONTRADICTORY')?.conflictDetail ?? '';
        if (!detail.includes(probe.expectedConflictDetailContains)) {
          fail(
            'reference.conflict.detail',
            `detail containing ${probe.expectedConflictDetailContains} (probe ${probe.name})`,
            detail || '(no detail)',
          );
        }
      }
    }
    metrics.push({
      metric: 'reference.resolution.accuracy',
      tier: 'probes',
      n: statusTotal,
      value: rate(statusExact, statusTotal),
      display: pct(rate(statusExact, statusTotal)),
      notes: `${statusExact}/${statusTotal} reference statuses resolve exactly`,
    });
    metrics.push({
      metric: 'reference.conflict.recall',
      tier: 'probes',
      n: conflictTp + conflictFn,
      value: rate(conflictTp, conflictTp + conflictFn),
      display: pct(rate(conflictTp, conflictTp + conflictFn)),
      notes: `${conflictTp}/${conflictTp + conflictFn} contradictory refs found`,
    });
    metrics.push({
      metric: 'reference.conflict.falsePositives',
      tier: 'probes',
      n: statusTotal,
      value: conflictFp,
      display: String(conflictFp),
      notes: `${conflictFp} false conflicts`,
    });
  }

  // --- I9 OCR: parse, dedupe, routing, penalties --------------------------
  let truncatedCompleted = 0;
  let dedupeFailures = 0;
  {
    let spanRecallNum = 0;
    let spanRecallDen = 0;
    let spanPrecisionNum = 0;
    let spanPrecisionDen = 0;
    let droppedExact = 0;
    for (const probe of OCR_PARSE_PROBES) {
      const got = parseOcrResponse(probe.content, probe.ctx);
      const m = multisetMatch(
        probe.expectedSpans,
        got.spans,
        (s) => (s as { text: string }).text,
      );
      spanRecallNum += m.matched;
      spanRecallDen += probe.expectedSpans.length;
      spanPrecisionNum += m.matched;
      spanPrecisionDen += got.spans.length;
      if (m.missing.length > 0 || m.extra.length > 0) {
        fail(
          'ocr.parse.spanRecall',
          `${probe.expectedSpans.map((s) => s.text).join(', ')} (probe ${probe.name})`,
          got.spans.map((s) => s.text).join(', ') || '(none)',
        );
      }
      // Per-span field checks (confidence / status / flags / bbox).
      for (const expected of probe.expectedSpans) {
        const actual = got.spans.find((s) => s.text === expected.text);
        if (!actual) continue;
        if (expected.confidence !== undefined && Math.abs(actual.confidence - expected.confidence) > 1e-9) {
          fail('ocr.parse.confidence', `${expected.confidence} (probe ${probe.name} ${expected.text})`, `${actual.confidence}`);
        }
        if (expected.status !== undefined && actual.status !== expected.status) {
          fail('ocr.parse.status', `${expected.status} (probe ${probe.name} ${expected.text})`, `${actual.status}`);
        }
        if (expected.truncated === true && !actual.flags.truncated) {
          fail('ocr.parse.truncatedFlag', `truncated=true (probe ${probe.name} ${expected.text})`, 'flag missing');
        }
        if (expected.bboxNull === true && actual.bbox !== null) {
          fail('ocr.parse.bboxNull', `bbox null (probe ${probe.name} ${expected.text})`, JSON.stringify(actual.bbox));
        }
        if (expected.duplicateCount !== undefined && actual.flags.duplicateCount !== expected.duplicateCount) {
          fail('ocr.parse.duplicateCount', `${expected.duplicateCount} (probe ${probe.name} ${expected.text})`, `${actual.flags.duplicateCount}`);
        }
      }
      if (got.droppedCount === probe.expectedDropped) droppedExact += 1;
      else {
        fail('ocr.parse.droppedCount', `${probe.expectedDropped} (probe ${probe.name})`, `${got.droppedCount}`);
      }
      // Truncation guard: a truncated span's text must be kept VERBATIM —
      // any span whose text is a completion of a truncated input is a failure.
      for (const expected of probe.expectedSpans) {
        if (!expected.truncated) continue;
        const actual = got.spans.find((s) => s.text === expected.text);
        if (!actual) {
          truncatedCompleted += 1;
          fail('ocr.truncation.verbatim', `verbatim ${JSON.stringify(expected.text)} (probe ${probe.name})`, 'span missing or completed', 'guard');
        }
      }
    }
    metrics.push({
      metric: 'ocr.parse.spanRecall',
      tier: 'probes',
      n: spanRecallDen,
      value: rate(spanRecallNum, spanRecallDen),
      display: pct(rate(spanRecallNum, spanRecallDen)),
      notes: `${spanRecallNum}/${spanRecallDen} expected spans parsed (exact text match)`,
    });
    metrics.push({
      metric: 'ocr.parse.spanPrecision',
      tier: 'probes',
      n: spanPrecisionDen,
      value: rate(spanPrecisionNum, spanPrecisionDen),
      display: pct(rate(spanPrecisionNum, spanPrecisionDen)),
      notes: `${spanPrecisionNum}/${spanPrecisionDen} parsed spans expected`,
    });
    metrics.push({
      metric: 'ocr.parse.droppedCountAccuracy',
      tier: 'probes',
      n: OCR_PARSE_PROBES.length,
      value: rate(droppedExact, OCR_PARSE_PROBES.length),
      display: pct(rate(droppedExact, OCR_PARSE_PROBES.length)),
      notes: `${droppedExact}/${OCR_PARSE_PROBES.length} probes report the exact malformed-drop count`,
    });

    // Dedupe.
    let dedupeExact = 0;
    for (const probe of OCR_DEDUPE_PROBES) {
      const spans: OcrTextSpan[] = probe.spans.map((s) => ({
        text: s.text,
        bbox: s.bbox,
        confidence: s.confidence,
        status: 'HIGH_CONFIDENCE',
        flags: {},
        page: 1,
        source: 'vision-ocr' as const,
      }));
      const got = dedupeOcrSpans(spans);
      const countOk =
        got.kept.length === probe.expectedKept && got.merges.length === probe.expectedMerges;
      const dupOk =
        probe.expectedDuplicateCount === undefined ||
        got.kept.some((k) => k.flags.duplicateCount === probe.expectedDuplicateCount);
      if (countOk && dupOk) dedupeExact += 1;
      else {
        dedupeFailures += 1;
        fail(
          'ocr.dedupe.accuracy',
          `kept=${probe.expectedKept} merges=${probe.expectedMerges} (probe ${probe.name})`,
          `kept=${got.kept.length} merges=${got.merges.length}`,
          'guard',
        );
      }
    }
    metrics.push({
      metric: 'ocr.dedupe.accuracy',
      tier: 'probes',
      n: OCR_DEDUPE_PROBES.length,
      value: rate(dedupeExact, OCR_DEDUPE_PROBES.length),
      display: pct(rate(dedupeExact, OCR_DEDUPE_PROBES.length)),
      notes: `${dedupeExact}/${OCR_DEDUPE_PROBES.length} dedupe cases exact (kept + merges + duplicateCount)`,
    });

    // Routing.
    const routingFns = [
      { name: 'dimensionLike', fn: isDimensionLikeText },
      { name: 'markLike', fn: isMarkLikeText },
      { name: 'referenceLike', fn: isReferenceLikeText },
      { name: 'scheduleRowLike', fn: isScheduleRowLikeText },
    ] as const;
    for (const { name, fn } of routingFns) {
      let exact = 0;
      for (const probe of OCR_ROUTING_PROBES) {
        const got = fn(probe.text);
        const expected = probe[name];
        if (got === expected) exact += 1;
        else {
          fail(`ocr.routing.${name}`, `${expected} (probe ${probe.name} ${JSON.stringify(probe.text)})`, `${got}`);
        }
      }
      metrics.push({
        metric: `ocr.routing.${name}.accuracy`,
        tier: 'probes',
        n: OCR_ROUTING_PROBES.length,
        value: rate(exact, OCR_ROUTING_PROBES.length),
        display: pct(rate(exact, OCR_ROUTING_PROBES.length)),
        notes: `${exact}/${OCR_ROUTING_PROBES.length} routing decisions correct`,
      });
    }

    // Truncated spans route to 'text' (never to a record-bearing kind).
    {
      const truncatedSpan: OcrTextSpan = {
        text: '3.5…',
        bbox: { x: 100, y: 100, width: 40, height: 20 },
        confidence: 0.75,
        status: 'NEEDS_REVIEW',
        flags: { truncated: true },
        page: 1,
        source: 'vision-ocr',
      };
      const proposals = ocrSpansToProposals([truncatedSpan], { page: 1 });
      const kind = proposals[0]?.kind;
      metrics.push({
        metric: 'ocr.truncation.routesToText',
        tier: 'probes',
        n: 1,
        value: kind === 'text' ? 1 : 0,
        display: kind === 'text' ? 'yes' : `NO (kind=${kind})`,
        notes: 'A truncated span must route to kind "text" (audit only), never to dimension/symbol/table',
      });
      if (kind !== 'text') {
        truncatedCompleted += 1;
        fail('ocr.truncation.routesToText', 'kind=text', `kind=${kind}`, 'guard');
      }
    }

    // Penalties.
    let penaltyExact = 0;
    for (const probe of OCR_PENALTY_PROBES) {
      const got = applyOcrFlagPenalty(probe.confidence, probe.flags);
      if (Math.abs(got.confidence - probe.expectedConfidence) < 1e-9 && got.status === probe.expectedStatus) {
        penaltyExact += 1;
      } else {
        fail(
          'ocr.penalty.accuracy',
          `${probe.expectedConfidence} ${probe.expectedStatus} (probe ${probe.name})`,
          `${got.confidence} ${got.status}`,
        );
      }
    }
    metrics.push({
      metric: 'ocr.penalty.accuracy',
      tier: 'probes',
      n: OCR_PENALTY_PROBES.length,
      value: rate(penaltyExact, OCR_PENALTY_PROBES.length),
      display: pct(rate(penaltyExact, OCR_PENALTY_PROBES.length)),
      notes: `${penaltyExact}/${OCR_PENALTY_PROBES.length} flag-penalty applications exact (value + status cap)`,
    });
  }

  // --- I7 review-state bboxes ----------------------------------------------
  {
    let exact = 0;
    for (const probe of BBOX_PERCENT_PROBES) {
      const got = bboxToPercent(probe.bbox, probe.imageWidthPx, probe.imageHeightPx);
      const ok =
        (probe.expected === null && got === null) ||
        (probe.expected !== null &&
          got !== null &&
          Math.abs(got.leftPct - probe.expected.leftPct) < 1e-9 &&
          Math.abs(got.topPct - probe.expected.topPct) < 1e-9 &&
          Math.abs(got.widthPct - probe.expected.widthPct) < 1e-9 &&
          Math.abs(got.heightPct - probe.expected.heightPct) < 1e-9);
      if (ok) exact += 1;
      else {
        fail(
          'review.bboxToPercent.accuracy',
          `${JSON.stringify(probe.expected)} (probe ${probe.name})`,
          `${JSON.stringify(got)}`,
        );
      }
    }
    metrics.push({
      metric: 'review.bboxToPercent.accuracy',
      tier: 'probes',
      n: BBOX_PERCENT_PROBES.length,
      value: rate(exact, BBOX_PERCENT_PROBES.length),
      display: pct(rate(exact, BBOX_PERCENT_PROBES.length)),
      notes: `${exact}/${BBOX_PERCENT_PROBES.length} pixel→percent conversions exact (incl. clamp + null cases)`,
    });
  }

  return {
    metrics,
    failures,
    guardInputs: {
      dimensionNegativeFalsePositives,
      qtoExact,
      qtoFailures,
      truncatedCompleted,
      dedupeFailures,
    },
  };
}

// ---------------------------------------------------------------------------
// Pipeline measurement (runVisionDocument with stub responder + renderPage)
// ---------------------------------------------------------------------------

/** The NULL-MATCHER test double: every mark unmatched → ahspCode must be null. */
// I11 Stage 4: the matcher input shape is VisionAhspMatchInput
// ({key, name, unit, specification?}) — the benchmark's null matcher
// ignores it and claims no match, as before.
function nullAhspMatcher(_input: VisionAhspMatchInput): { ahspCode: string | null; note?: string } {
  return { ahspCode: null, note: 'benchmark null-matcher: no catalog match claimed' };
}

interface PipelineOutcome {
  metrics: MetricResult[];
  failures: FixtureFailure[];
  guardInputs: {
    pipelineFalsePositiveDimensions: number;
    truncatedCompleted: number;
    duplicateCountFailures: number;
    inventedAhspCodes: number;
    reparseFailures: number;
  };
}

interface TierAggregate {
  classCorrect: number;
  classTotal: number;
  dimMatched: number;
  dimExpected: number;
  dimActual: number;
  dimMatchedByKind: Map<string, number>;
  dimExpectedByKind: Map<string, number>;
  dimActualByKind: Map<string, number>;
  openingAssocOk: number;
  openingCountOk: number;
  openingTotal: number;
  openingExtra: number;
  elementMatched: number;
  elementExpected: number;
  elementActual: number;
  elementExtra: number;
  quantityMatched: number;
  quantityExpected: number;
  quantityActual: number;
  quantityExtra: number;
  refMatched: number;
  refExpected: number;
  refActual: number;
  scaleOk: number;
  scaleTotal: number;
  ocrMatchedByClass: Map<string, number>;
  ocrExpectedByClass: Map<string, number>;
  ocrActualByClass: Map<string, number>;
  detailOk: number;
  detailTotal: number;
  callsActual: number;
  callsExpected: number;
  callsMismatch: number;
  iouSum: number;
  iouCount: number;
  recordsDims: number;
  recordsOpenings: number;
  recordsElements: number;
  recordsQuantities: number;
  recordsReferences: number;
  pages: number;
  unresolvedDims: number;
  unresolvedOpenings: number;
  unresolvedElements: number;
  unresolvedQuantities: number;
  cacheHitsRun2: number;
  callsRun2: number;
  docsRun: number;
}

function emptyAggregate(): TierAggregate {
  return {
    classCorrect: 0,
    classTotal: 0,
    dimMatched: 0,
    dimExpected: 0,
    dimActual: 0,
    dimMatchedByKind: new Map(),
    dimExpectedByKind: new Map(),
    dimActualByKind: new Map(),
    openingAssocOk: 0,
    openingCountOk: 0,
    openingTotal: 0,
    openingExtra: 0,
    elementMatched: 0,
    elementExpected: 0,
    elementActual: 0,
    elementExtra: 0,
    quantityMatched: 0,
    quantityExpected: 0,
    quantityActual: 0,
    quantityExtra: 0,
    refMatched: 0,
    refExpected: 0,
    refActual: 0,
    scaleOk: 0,
    scaleTotal: 0,
    ocrMatchedByClass: new Map(),
    ocrExpectedByClass: new Map(),
    ocrActualByClass: new Map(),
    detailOk: 0,
    detailTotal: 0,
    callsActual: 0,
    callsExpected: 0,
    callsMismatch: 0,
    iouSum: 0,
    iouCount: 0,
    recordsDims: 0,
    recordsOpenings: 0,
    recordsElements: 0,
    recordsQuantities: 0,
    recordsReferences: 0,
    pages: 0,
    unresolvedDims: 0,
    unresolvedOpenings: 0,
    unresolvedElements: 0,
    unresolvedQuantities: 0,
    cacheHitsRun2: 0,
    callsRun2: 0,
    docsRun: 0,
  };
}

function bump(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

async function measurePipeline(
  fixtures: BenchmarkFixture[],
): Promise<PipelineOutcome> {
  const metrics: MetricResult[] = [];
  const failures: FixtureFailure[] = [];
  const guardInputs = {
    pipelineFalsePositiveDimensions: 0,
    truncatedCompleted: 0,
    duplicateCountFailures: 0,
    inventedAhspCodes: 0,
    reparseFailures: 0,
  };
  const byTier = new Map<FixtureTier, TierAggregate>();
  const aggFor = (tier: FixtureTier): TierAggregate => {
    const existing = byTier.get(tier);
    if (existing) return existing;
    const fresh = emptyAggregate();
    byTier.set(tier, fresh);
    return fresh;
  };
  const fail = (
    fixtureId: string,
    metric: string,
    expected: string,
    got: string,
    severity: 'guard' | 'finding' = 'finding',
  ): void => {
    failures.push({ fixtureId, metric, expected, got, severity });
  };

  for (const fixture of fixtures) {
    const agg = aggFor(fixture.tier);
    const pagesByNumber = new Map(fixture.pages.map((p) => [p.page, p]));
    // I11 Stage 3, fix 3 — tile-aware stub reads: when the pipeline
    // reads a TILE, the stub must answer with only the detections in
    // that tile, with bboxes translated to TILE-LOCAL coordinates (the
    // pipeline translates them back to page coordinates, exactly as it
    // does for real model reads). renderPage stashes the last requested
    // roi here; the responder reads it. The pipeline is sequential, so
    // the stashed roi is always the tile being read right now.
    // - A detection is reported by a tile ONLY when its bbox is FULLY
    //   inside the tile (the stub simulates a perfect model read: each
    //   detection is seen whole, once per containing tile; overlap-zone
    //   copies carry identical translated bboxes and dedupe exactly).
    //   Center-containment was tried first and is WRONG here: a
    //   straddling detection translates to a tile-local bbox with a
    //   negative origin, the parser nulls it (out-of-bounds), and the
    //   null-bbox copy can never dedupe against the whole copy — the
    //   111853 D count went 3 → 5. (That null-bbox double-count is a
    //   real pipeline-level limitation for seam-straddling detections
    //   on ANY tiled page — see the Stage 3 report; the stub must not
    //   paper over it by reporting partial detections.)
    // - Bbox-less entries have no position: they are attributed to the
    //   ORIGIN tile only (roi at 0,0), so they are seen exactly once
    //   instead of once per tile (null bboxes can never dedupe).
    // - Whole-page reads (no roi) see the full stub body, untranslated.
    let lastTileRoi: { x: number; y: number; width: number; height: number } | null = null;
    const filterBodyForTile = (body: unknown): unknown => {
      if (!lastTileRoi) return body;
      if (typeof body !== 'object' || body === null) return body;
      const rec = body as Record<string, unknown>;
      const listKey = Array.isArray(rec.detections) ? 'detections' : Array.isArray(rec.spans) ? 'spans' : null;
      if (!listKey) return body;
      const roi = lastTileRoi;
      const isOriginTile = roi.x === 0 && roi.y === 0;
      const kept = (rec[listKey] as unknown[]).filter((entry) => {
        if (typeof entry !== 'object' || entry === null) return false;
        const bbox = (entry as Record<string, unknown>).bbox as
          | { x: number; y: number; width: number; height: number }
          | null
          | undefined;
        if (!bbox) return isOriginTile;
        return (
          bbox.x >= roi.x &&
          bbox.y >= roi.y &&
          bbox.x + bbox.width <= roi.x + roi.width &&
          bbox.y + bbox.height <= roi.y + roi.height
        );
      }).map((entry) => {
        const e = entry as Record<string, unknown>;
        const bbox = e.bbox as { x: number; y: number; width: number; height: number } | null | undefined;
        if (!bbox) return entry;
        return { ...e, bbox: { x: bbox.x - roi.x, y: bbox.y - roi.y, width: bbox.width, height: bbox.height } };
      });
      return { ...rec, [listKey]: kept };
    };
    const responder: VisionResponder = async (req): Promise<VisionResponse> => {
      const prompt = req.prompt;
      const pageMatch = /reading page (\d+)/.exec(prompt);
      const pageNum = pageMatch ? Number(pageMatch[1]) : 0;
      const page = pagesByNumber.get(pageNum);
      let body: unknown = { detections: [] };
      if (page) {
        if (prompt.includes('TASK — OCR')) body = page.stub.ocr ?? { spans: [] };
        else if (prompt.includes('TASK — PAGE SURVEY')) body = page.stub.survey ?? { detections: [] };
        else body = page.stub.detail ?? { detections: [] };
        body = filterBodyForTile(body);
      }
      return {
        content: typeof body === 'string' ? body : JSON.stringify(body),
        model: 'stub',
        provider: 'stub',
        requestId: null,
        durationMs: 1,
        usage: null,
        usageStatus: null,
      };
    };
    const renderPage: VisionRenderPage = async ({ page, roi }) => {
      const spec = pagesByNumber.get(page) ?? { widthPx: 1000, heightPx: 800, base64Length: 1000 };
      if (roi) {
        lastTileRoi = { x: roi.x, y: roi.y, width: roi.width, height: roi.height };
        return {
          dataUrl: TINY_PNG,
          widthPx: Math.max(1, Math.round(roi.width)),
          heightPx: Math.max(1, Math.round(roi.height)),
          base64Length: 250,
        };
      }
      lastTileRoi = null;
      return {
        dataUrl: TINY_PNG,
        widthPx: spec.widthPx,
        heightPx: spec.heightPx,
        base64Length: spec.base64Length,
      };
    };
    const docInput = {
      docHash: `bench-${fixture.id}`,
      mode: fixture.mode ?? ('EZRAB_AI' as const),
      pages: fixture.pages.map((p) => ({
        page: p.page,
        title: p.title,
        text: p.text,
        hasTextLayer: p.hasTextLayer,
        widthPx: p.widthPx,
        heightPx: p.heightPx,
        base64Length: p.base64Length,
      })),
      responder,
      renderPage,
      maxCallsPerDocument: fixture.maxCallsPerDocument,
      ahspMatcher: fixture.useAhspMatcher === false ? undefined : nullAhspMatcher,
    };
    const cache = new VisionCache<VisionParseResult>({ maxEntries: 100 });
    let run1: VisionDocumentResult;
    let run2: VisionDocumentResult;
    try {
      run1 = await runVisionDocument({ ...docInput, cache });
      run2 = await runVisionDocument({ ...docInput, cache });
    } catch (e) {
      fail(fixture.id, 'pipeline.run', 'completes without throwing', e instanceof Error ? e.message : String(e));
      continue;
    }
    agg.docsRun += 1;
    agg.pages += fixture.pages.length;

    // --- classification per page -------------------------------------------
    for (const pageFixture of fixture.pages) {
      const actual = run1.pages.find((p) => p.page === pageFixture.page);
      agg.classTotal += 1;
      if (!actual) {
        fail(fixture.id, 'pipeline.classification.accuracy', pageFixture.expectedClass, '(page missing from result)');
        continue;
      }
      if (actual.classification.drawingClass === pageFixture.expectedClass) agg.classCorrect += 1;
      else {
        fail(
          fixture.id,
          'pipeline.classification.accuracy',
          `${pageFixture.expectedClass} (p${pageFixture.page} ${pageFixture.title ?? 'untitled'})`,
          `${actual.classification.drawingClass} conf=${actual.classification.confidence}`,
        );
      }
      if (pageFixture.expectDetailPass !== undefined && pageFixture.expectDetailPass !== null) {
        agg.detailTotal += 1;
        if (actual.detailPass === pageFixture.expectDetailPass) agg.detailOk += 1;
        else {
          fail(
            fixture.id,
            'pipeline.detailPass.accuracy',
            `detailPass=${pageFixture.expectDetailPass} (p${pageFixture.page})`,
            `detailPass=${actual.detailPass}`,
          );
        }
      }
    }

    // --- dimensions (multiset) ----------------------------------------------
    const expectedDims = fixture.expected.dimensions ?? [];
    const actualDims = run1.pages.flatMap((p) => p.dimensions);
    for (const e of expectedDims) bump(agg.dimExpectedByKind, e.kind);
    for (const a of actualDims) bump(agg.dimActualByKind, a.kind);
    const dimMatch = multisetMatch(
      expectedDims,
      actualDims.map((r) => ({
        page: r.page,
        originalText: r.originalText,
        value: r.normalizedValue,
        unit: r.unit,
        kind: r.kind,
      })),
      dimKey,
    );
    agg.dimMatched += dimMatch.matched;
    agg.dimExpected += expectedDims.length;
    agg.dimActual += actualDims.length;
    for (const m of dimMatch.missing) {
      const e = m as unknown as ExpectedDimension;
      fail(
        fixture.id,
        'pipeline.dimension.recall',
        `${e.originalText} → ${e.value} ${e.unit} ${e.kind} (p${e.page})`,
        'record missing',
      );
    }
    for (const x of dimMatch.extra) {
      const a = x as unknown as ExpectedDimension;
      guardInputs.pipelineFalsePositiveDimensions += 1;
      fail(
        fixture.id,
        'pipeline.dimension.precision',
        'no dimension record',
        `${a.originalText} → ${a.value} ${a.unit} ${a.kind} (p${a.page}) — FALSE POSITIVE`,
        'guard',
      );
    }
    // Per-kind matched counts (recompute from the matched multiset).
    {
      const actualLeft = actualDims.map((r) => ({
        page: r.page,
        originalText: r.originalText,
        value: r.normalizedValue,
        unit: r.unit,
        kind: r.kind,
      }));
      for (const e of expectedDims) {
        const idx = actualLeft.findIndex((a) => dimKey(a) === dimKey(e));
        if (idx >= 0) {
          actualLeft.splice(idx, 1);
          bump(agg.dimMatchedByKind, e.kind);
        }
      }
    }
    // No-invention re-parse: every pipeline dimension value must be
    // re-derivable from its own verbatim originalText. I11 Stage 4:
    // E21 records re-derive under the dimension-evident rule (the
    // evidence basis is in the record's notes) and E18 records
    // re-derive with the label hint extracted from the kind marker in
    // the notes — the re-parse applies the SAME documented rules the
    // pipeline applied, so a record whose value depends on a rule it
    // does not evidence still fails here.
    for (const rec of actualDims) {
      const plain = parseDimensionList(rec.originalText, { page: rec.page });
      const evident = parseDimensionList(rec.originalText, { page: rec.page, dimensionEvident: true });
      const hintMatch = /kind (OVERALL|CHAINED) evidenced by label "([^"]+)"/.exec(rec.notes ?? '');
      const labeled =
        hintMatch && kindFromLabelHint(hintMatch[2]) !== null
          ? parseDimensionList(rec.originalText, { page: rec.page, labelHint: hintMatch[2] })
          : [];
      const traceable = [...plain, ...evident, ...labeled].some(
        (r) => r.normalizedValue === rec.normalizedValue && r.unit === rec.unit && r.kind === rec.kind,
      );
      if (!traceable) {
        guardInputs.reparseFailures += 1;
        fail(
          fixture.id,
          'pipeline.dimension.traceable',
          `value re-derivable from ${JSON.stringify(rec.originalText)}`,
          `${rec.normalizedValue} ${rec.unit} ${rec.kind} — NOT traceable to its text`,
          'guard',
        );
      }
    }

    // --- openings (aggregate by mark) ---------------------------------------
    const expectedOpenings = fixture.expected.openings ?? [];
    const actualByMark = new Map<string, {
      quantity: number;
      widthMm: number | null;
      heightMm: number | null;
      schedulePage: number | null;
    }>();
    for (const o of run1.openings) {
      const entry = actualByMark.get(o.mark) ?? { quantity: 0, widthMm: null, heightMm: null, schedulePage: null };
      entry.quantity += o.quantity;
      if (entry.widthMm === null) entry.widthMm = o.widthMm;
      if (entry.heightMm === null) entry.heightMm = o.heightMm;
      if (entry.schedulePage === null) entry.schedulePage = o.schedulePage;
      actualByMark.set(o.mark, entry);
    }
    agg.openingTotal += expectedOpenings.length;
    for (const e of expectedOpenings) {
      const a = actualByMark.get(e.mark);
      if (!a) {
        fail(fixture.id, 'pipeline.opening.recall', `opening ${e.mark} ×${e.quantity}`, 'record missing');
        continue;
      }
      const assocOk =
        a.schedulePage === e.schedulePage && a.widthMm === e.widthMm && a.heightMm === e.heightMm;
      if (assocOk) agg.openingAssocOk += 1;
      else {
        fail(
          fixture.id,
          'pipeline.opening.scheduleAssociation',
          `${e.mark} ${e.widthMm}×${e.heightMm} schedule p${e.schedulePage}`,
          `${e.mark} ${a.widthMm}×${a.heightMm} schedule p${a.schedulePage}`,
        );
      }
      if (a.quantity === e.quantity) agg.openingCountOk += 1;
      else {
        guardInputs.duplicateCountFailures += 1;
        fail(
          fixture.id,
          'pipeline.opening.countAccuracy',
          `${e.mark} quantity=${e.quantity}`,
          `${e.mark} quantity=${a.quantity}`,
          'guard',
        );
      }
    }
    for (const [mark, a] of actualByMark) {
      if (!expectedOpenings.some((e) => e.mark === mark)) {
        agg.openingExtra += 1;
        fail(
          fixture.id,
          'pipeline.opening.precision',
          'no opening record',
          `${mark} ×${a.quantity} ${a.widthMm}×${a.heightMm} — UNEXPECTED (phantom?) opening`,
        );
      }
    }

    // --- elements (I11 Stage 4, E16 — multiset, PER PAGE) ----------------------
    // Unlike openings, elements are NOT aggregated across pages: the
    // same mark on two views is the same physical element shown twice
    // (E19), so each page's records are scored against that page's
    // expectations. Fixtures without element expectations score nothing
    // (expected 0, actual 0) — but an actual element on such a fixture
    // IS an extra record (phantom).
    const expectedElements = fixture.expected.elements ?? [];
    const elementKey = (e: {
      page: number; category: string; elementType: string; mark: string | null;
      quantity: number; lengthMm: number | null; widthMm: number | null;
      heightMm: number | null; thicknessMm: number | null; diameterMm: number | null;
      schedulePage: number | null;
    }): string =>
      `${e.page}|${e.category}|${e.elementType}|${e.mark ?? ''}|${e.quantity}|` +
      `${e.lengthMm ?? ''}|${e.widthMm ?? ''}|${e.heightMm ?? ''}|${e.thicknessMm ?? ''}|` +
      `${e.diameterMm ?? ''}|${e.schedulePage ?? ''}`;
    const actualElements = run1.elements.map((el) => ({
      page: el.sourcePages[0] ?? -1,
      category: el.category,
      elementType: el.elementType,
      mark: el.mark,
      quantity: el.quantity,
      lengthMm: el.lengthMm,
      widthMm: el.widthMm,
      heightMm: el.heightMm,
      thicknessMm: el.thicknessMm,
      diameterMm: el.diameterMm,
      schedulePage: el.schedulePage,
    }));
    const elMatch = multisetMatch(expectedElements, actualElements, elementKey);
    agg.elementMatched += elMatch.matched;
    agg.elementExpected += expectedElements.length;
    agg.elementActual += actualElements.length;
    for (const m of elMatch.missing) {
      const e = m as unknown as ExpectedElement;
      fail(
        fixture.id,
        'pipeline.element.recall',
        `element ${e.category}/${e.elementType} ${e.mark ?? '(unmarked)'} ×${e.quantity} (p${e.page})`,
        'record missing',
      );
    }
    for (const x of elMatch.extra) {
      const a = x as unknown as ExpectedElement;
      agg.elementExtra += 1;
      fail(
        fixture.id,
        'pipeline.element.precision',
        'no element record',
        `${a.category}/${a.elementType} ${a.mark ?? '(unmarked)'} ×${a.quantity} (p${a.page}) — UNEXPECTED (phantom?) element`,
      );
    }

    // --- quantities (I11 Stage 4, E17 — element-derived only) ----------------
    // Only `qto-el-*` quantities are scored here (opening COUNT
    // quantities are covered by the opening metrics + the qto-exact
    // guard). Values are compared at 1e-9 (SafeDecimalEngine is exact,
    // but the key rounds defensively against float dust).
    const expectedQuantities = fixture.expected.quantities ?? [];
    const qKey = (q: { page: number; kind: string; unit: string; quantity: number | null; ref: string }): string =>
      `${q.page}|${q.kind}|${q.unit}|${q.quantity === null ? 'null' : Math.round(q.quantity * 1e9) / 1e9}|${q.ref}`;
    const actualQuantities = run1.pages.flatMap((pg) =>
      pg.quantities
        .filter((q) => q.id.startsWith('qto-el-'))
        .map((q) => ({
          page: pg.page,
          kind: q.kind,
          unit: q.unit,
          quantity: q.quantity,
          ref: String(q.inputs.elemen ?? ''),
        })),
    );
    const qMatch = multisetMatch(expectedQuantities, actualQuantities, qKey);
    agg.quantityMatched += qMatch.matched;
    agg.quantityExpected += expectedQuantities.length;
    agg.quantityActual += actualQuantities.length;
    for (const m of qMatch.missing) {
      const e = m as unknown as ExpectedQuantity;
      fail(
        fixture.id,
        'pipeline.quantity.recall',
        `quantity ${e.kind} ${e.quantity} ${e.unit} (${e.ref}, p${e.page})`,
        'quantity missing or wrong value',
      );
    }
    for (const x of qMatch.extra) {
      const a = x as unknown as ExpectedQuantity;
      agg.quantityExtra += 1;
      fail(
        fixture.id,
        'pipeline.quantity.precision',
        'no element quantity',
        `quantity ${a.kind} ${a.quantity} ${a.unit} (${a.ref}, p${a.page}) — UNEXPECTED quantity`,
      );
    }

    // --- references (multiset, doc-level) ------------------------------------
    const expectedRefs = fixture.expected.references ?? [];
    const refKey = (r: { fromPage: number; toRef: string; status: string }): string =>
      `${r.fromPage}|${r.toRef}|${r.status}`;
    const refMatch = multisetMatch(
      expectedRefs.map((r) => ({ fromPage: r.fromPage, toRef: r.toRef, status: r.status })),
      run1.references.map((r) => ({
        fromPage: r.from.page ?? -1,
        toRef: r.to.ref,
        status: r.status,
      })),
      refKey,
    );
    agg.refMatched += refMatch.matched;
    agg.refExpected += expectedRefs.length;
    agg.refActual += run1.references.length;
    for (const m of refMatch.missing) {
      const e = m as unknown as ExpectedReference;
      fail(
        fixture.id,
        'pipeline.reference.recall',
        `p${e.fromPage} → ${e.toRef} ${e.status}`,
        'reference missing or wrong status',
      );
    }
    for (const x of refMatch.extra) {
      const a = x as unknown as { fromPage: number; toRef: string; status: string };
      fail(
        fixture.id,
        'pipeline.reference.precision',
        'no reference',
        `p${a.fromPage} → ${a.toRef} ${a.status} — UNEXPECTED reference`,
      );
    }

    // --- scales ---------------------------------------------------------------
    for (const expected of fixture.expected.scales ?? []) {
      const actual = run1.pages.find((p) => p.page === expected.page);
      agg.scaleTotal += 1;
      const gotScale = actual?.scale?.statedScale ?? null;
      if (gotScale === expected.statedScale) agg.scaleOk += 1;
      else {
        fail(
          fixture.id,
          'pipeline.scale.accuracy',
          `p${expected.page} scale ${expected.statedScale}`,
          `p${expected.page} scale ${gotScale}`,
        );
      }
    }

    // --- OCR spans per text class (multiset by page+text) --------------------
    const expectedOcr = fixture.expected.ocrSpans ?? [];
    if (expectedOcr.length > 0) {
      const actualOcr = run1.pages.flatMap((p) => p.ocrSpans);
      const classOf = new Map<string, ExpectedOcrSpan['textClass']>();
      for (const e of expectedOcr) {
        bump(agg.ocrExpectedByClass, e.textClass);
        classOf.set(ocrSpanKey(e), e.textClass);
      }
      for (const a of actualOcr) {
        const cls = classOf.get(ocrSpanKey({ page: a.page, text: a.text })) ?? 'other';
        bump(agg.ocrActualByClass, cls);
      }
      const ocrMatch = multisetMatch(
        expectedOcr.map((e) => ({ page: e.page, text: e.text })),
        actualOcr.map((s) => ({ page: s.page, text: s.text })),
        ocrSpanKey,
      );
      // Per-class matched counts.
      const actualLeft = actualOcr.map((s) => ({ page: s.page, text: s.text }));
      for (const e of expectedOcr) {
        const idx = actualLeft.findIndex((a) => ocrSpanKey(a) === ocrSpanKey(e));
        if (idx >= 0) {
          actualLeft.splice(idx, 1);
          bump(agg.ocrMatchedByClass, e.textClass);
        }
      }
      for (const m of ocrMatch.missing) {
        const e = m as { page: number; text: string };
        fail(fixture.id, 'pipeline.ocr.recall', `span ${JSON.stringify(e.text)} (p${e.page})`, 'span missing');
      }
      for (const x of ocrMatch.extra) {
        const a = x as { page: number; text: string };
        fail(fixture.id, 'pipeline.ocr.precision', 'no span', `span ${JSON.stringify(a.text)} (p${a.page}) — UNEXPECTED`);
      }
      // Truncation guard at pipeline level: a truncated span's proposal
      // must be kind 'text', never a record-bearing kind.
      const truncatedTexts = new Set(
        expectedOcr.filter((e) => e.truncated).map((e) => e.text),
      );
      for (const pageResult of run1.pages) {
        for (const proposal of pageResult.proposals) {
          if (truncatedTexts.has(proposal.rawText) && proposal.kind !== 'text') {
            guardInputs.truncatedCompleted += 1;
            fail(
              fixture.id,
              'pipeline.ocr.truncation',
              `truncated span ${JSON.stringify(proposal.rawText)} routes to kind=text`,
              `kind=${proposal.kind} — TRUNCATED TEXT REACHED A RECORD PATH`,
              'guard',
            );
          }
        }
      }
      // A truncated span must never appear COMPLETED in any record.
      for (const t of truncatedTexts) {
        const prefix = t.replace(/…$/, '');
        for (const rec of actualDims) {
          if (rec.originalText !== t && rec.originalText.startsWith(prefix) && rec.originalText.length > prefix.length) {
            // Only a completion if no clean span with that exact text exists on the page.
            const cleanTwin = actualOcr.some(
              (s) => s.page === rec.page && s.text === rec.originalText && !s.flags.truncated,
            );
            if (!cleanTwin) {
              guardInputs.truncatedCompleted += 1;
              fail(
                fixture.id,
                'pipeline.ocr.truncation',
                `no completion of truncated ${JSON.stringify(t)}`,
                `dimension ${JSON.stringify(rec.originalText)} looks like a completion`,
                'guard',
              );
            }
          }
        }
      }
    }

    // --- bbox IoU (I7 viewer markers) -----------------------------------------
    for (const pageFixture of fixture.pages) {
      const pageResult = run1.pages.find((p) => p.page === pageFixture.page);
      if (!pageResult) continue;
      for (const expected of pageFixture.expectedBboxes ?? []) {
        agg.iouCount += 1;
        const proposal = pageResult.proposals.find(
          (p) => p.kind === expected.kind && p.label === expected.label,
        );
        if (!proposal || !proposal.bbox) {
          fail(
            fixture.id,
            'pipeline.bbox.iou',
            `proposal ${expected.kind}:${expected.label} with bbox (p${pageFixture.page})`,
            proposal ? 'proposal has no bbox' : 'proposal missing',
          );
          continue;
        }
        const iou = bboxIou(proposal.bbox, expected.bbox);
        agg.iouSum += iou;
        if (iou < 0.5) {
          fail(
            fixture.id,
            'pipeline.bbox.iou',
            `IoU ≥ 0.5 for ${expected.kind}:${expected.label} (p${pageFixture.page})`,
            `IoU=${iou.toFixed(3)}`,
          );
        }
      }
    }

    // --- calls vs cap + budget -------------------------------------------------
    agg.callsActual += run1.totalCost.calls;
    if (fixture.expected.calls !== undefined) {
      agg.callsExpected += fixture.expected.calls;
      if (run1.totalCost.calls !== fixture.expected.calls) {
        agg.callsMismatch += 1;
        fail(
          fixture.id,
          'pipeline.calls.expected',
          `${fixture.expected.calls} calls (hand-derived)`,
          `${run1.totalCost.calls} calls`,
        );
      }
    }
    if (fixture.expected.budgetHit !== undefined && run1.budgetHit !== fixture.expected.budgetHit) {
      fail(
        fixture.id,
        'pipeline.budgetHit',
        `budgetHit=${fixture.expected.budgetHit}`,
        `budgetHit=${run1.budgetHit}`,
      );
    }

    // --- records per page + UNRESOLVED rates ------------------------------------
    agg.recordsDims += run1.pages.reduce((a, p) => a + p.dimensions.length, 0);
    agg.recordsOpenings += run1.pages.reduce((a, p) => a + p.openings.length, 0);
    agg.recordsElements += run1.pages.reduce((a, p) => a + p.elements.length, 0);
    agg.recordsQuantities += run1.pages.reduce((a, p) => a + p.quantities.length, 0);
    agg.recordsReferences += run1.references.length;
    agg.unresolvedDims += run1.pages.reduce(
      (a, p) => a + p.dimensions.filter((d) => d.status === 'UNRESOLVED').length,
      0,
    );
    agg.unresolvedOpenings += run1.pages.reduce(
      (a, p) => a + p.openings.filter((o) => o.status === 'UNRESOLVED').length,
      0,
    );
    agg.unresolvedElements += run1.pages.reduce(
      (a, p) => a + p.elements.filter((e) => e.status === 'UNRESOLVED').length,
      0,
    );
    agg.unresolvedQuantities += run1.pages.reduce(
      (a, p) => a + p.quantities.filter((q) => q.status === 'UNRESOLVED').length,
      0,
    );

    // --- AHSP: unmatched must stay null (no invented prices) --------------------
    for (const pageResult of run1.pages) {
      for (const match of pageResult.ahsp.matches) {
        if (match.ahspCode !== null) {
          guardInputs.inventedAhspCodes += 1;
          fail(
            fixture.id,
            'pipeline.ahsp.noInvention',
            `ahspCode=null for unmatched ${match.recordKind} ${match.key}`,
            `ahspCode=${match.ahspCode} — INVENTED PRICE CODE`,
            'guard',
          );
        }
      }
    }

    // --- cache: run 2 must be all hits -------------------------------------------
    agg.cacheHitsRun2 += run2.totalCost.cacheHits;
    agg.callsRun2 += run2.totalCost.calls;
    if (run2.totalCost.calls !== 0) {
      fail(
        fixture.id,
        'pipeline.cache.secondRunCalls',
        '0 provider calls on the second run (same cache)',
        `${run2.totalCost.calls} calls`,
      );
    }
  }

  // --- aggregate metrics per tier ----------------------------------------------
  for (const [tier, agg] of [...byTier.entries()].sort()) {
    const m = (
      metric: string,
      n: number,
      value: number | null,
      display: string,
      notes: string,
    ): void => {
      metrics.push({ metric, tier, n, value, display, notes });
    };
    m(
      'pipeline.classification.accuracy',
      agg.classTotal,
      rate(agg.classCorrect, agg.classTotal),
      pct(rate(agg.classCorrect, agg.classTotal)),
      `${agg.classCorrect}/${agg.classTotal} pages classified as expected`,
    );
    m(
      'pipeline.dimension.recall',
      agg.dimExpected,
      rate(agg.dimMatched, agg.dimExpected),
      pct(rate(agg.dimMatched, agg.dimExpected)),
      `${agg.dimMatched}/${agg.dimExpected} expected dimension records produced`,
    );
    m(
      'pipeline.dimension.precision',
      agg.dimActual,
      rate(agg.dimMatched, agg.dimActual),
      pct(rate(agg.dimMatched, agg.dimActual)),
      `${agg.dimMatched}/${agg.dimActual} produced dimension records expected`,
    );
    for (const kind of [...agg.dimExpectedByKind.keys()].sort()) {
      const exp = agg.dimExpectedByKind.get(kind) ?? 0;
      const matched = agg.dimMatchedByKind.get(kind) ?? 0;
      const actual = agg.dimActualByKind.get(kind) ?? 0;
      m(
        `pipeline.dimension.${kind}.recall`,
        exp,
        rate(matched, exp),
        pct(rate(matched, exp)),
        `${matched}/${exp} expected ${kind} records produced`,
      );
      m(
        `pipeline.dimension.${kind}.precision`,
        actual,
        rate(matched, actual),
        pct(rate(matched, actual)),
        `${matched}/${actual} produced ${kind} records expected`,
      );
    }
    m(
      'pipeline.opening.scheduleAssociation',
      agg.openingTotal,
      rate(agg.openingAssocOk, agg.openingTotal),
      pct(rate(agg.openingAssocOk, agg.openingTotal)),
      `${agg.openingAssocOk}/${agg.openingTotal} openings linked with exact dims + schedule page`,
    );
    m(
      'pipeline.opening.countAccuracy',
      agg.openingTotal,
      rate(agg.openingCountOk, agg.openingTotal),
      pct(rate(agg.openingCountOk, agg.openingTotal)),
      `${agg.openingCountOk}/${agg.openingTotal} openings counted exactly`,
    );
    m(
      'pipeline.opening.extraRecords',
      agg.recordsOpenings,
      agg.openingExtra,
      String(agg.openingExtra),
      `${agg.openingExtra} unexpected (phantom) opening records`,
    );
    m(
      'pipeline.element.recall',
      agg.elementExpected,
      rate(agg.elementMatched, agg.elementExpected),
      pct(rate(agg.elementMatched, agg.elementExpected)),
      `${agg.elementMatched}/${agg.elementExpected} expected element records produced`,
    );
    m(
      'pipeline.element.precision',
      agg.elementActual,
      rate(agg.elementMatched, agg.elementActual),
      pct(rate(agg.elementMatched, agg.elementActual)),
      `${agg.elementMatched}/${agg.elementActual} produced element records expected`,
    );
    m(
      'pipeline.element.extraRecords',
      agg.recordsElements,
      agg.elementExtra,
      String(agg.elementExtra),
      `${agg.elementExtra} unexpected (phantom) element records`,
    );
    m(
      'pipeline.quantity.recall',
      agg.quantityExpected,
      rate(agg.quantityMatched, agg.quantityExpected),
      pct(rate(agg.quantityMatched, agg.quantityExpected)),
      `${agg.quantityMatched}/${agg.quantityExpected} expected element quantities produced with the exact value`,
    );
    m(
      'pipeline.quantity.precision',
      agg.quantityActual,
      rate(agg.quantityMatched, agg.quantityActual),
      pct(rate(agg.quantityMatched, agg.quantityActual)),
      `${agg.quantityMatched}/${agg.quantityActual} produced element quantities expected`,
    );
    m(
      'pipeline.quantity.extraRecords',
      agg.quantityActual,
      agg.quantityExtra,
      String(agg.quantityExtra),
      `${agg.quantityExtra} unexpected element quantities`,
    );
    m(
      'pipeline.reference.recall',
      agg.refExpected,
      rate(agg.refMatched, agg.refExpected),
      pct(rate(agg.refMatched, agg.refExpected)),
      `${agg.refMatched}/${agg.refExpected} expected references resolved with the exact status`,
    );
    m(
      'pipeline.reference.precision',
      agg.refActual,
      rate(agg.refMatched, agg.refActual),
      pct(rate(agg.refMatched, agg.refActual)),
      `${agg.refMatched}/${agg.refActual} produced references expected`,
    );
    m(
      'pipeline.scale.accuracy',
      agg.scaleTotal,
      rate(agg.scaleOk, agg.scaleTotal),
      pct(rate(agg.scaleOk, agg.scaleTotal)),
      `${agg.scaleOk}/${agg.scaleTotal} pages carry the expected stated scale (or null)`,
    );
    for (const cls of [...agg.ocrExpectedByClass.keys()].sort()) {
      const exp = agg.ocrExpectedByClass.get(cls) ?? 0;
      const matched = agg.ocrMatchedByClass.get(cls) ?? 0;
      const actual = agg.ocrActualByClass.get(cls) ?? 0;
      m(
        `pipeline.ocr.${cls}.recall`,
        exp,
        rate(matched, exp),
        pct(rate(matched, exp)),
        `${matched}/${exp} expected ${cls} spans present`,
      );
      m(
        `pipeline.ocr.${cls}.precision`,
        actual,
        rate(matched, actual),
        pct(rate(matched, actual)),
        `${matched}/${actual} produced ${cls} spans expected`,
      );
    }
    m(
      'pipeline.detailPass.accuracy',
      agg.detailTotal,
      rate(agg.detailOk, agg.detailTotal),
      pct(rate(agg.detailOk, agg.detailTotal)),
      `${agg.detailOk}/${agg.detailTotal} pages escalated exactly as hand-derived`,
    );
    m(
      'pipeline.calls.perDocument',
      agg.docsRun,
      agg.docsRun > 0 ? agg.callsActual / agg.docsRun : null,
      agg.docsRun > 0 ? num(agg.callsActual / agg.docsRun, 1) : 'not measured',
      `${agg.callsActual} calls over ${agg.docsRun} documents (cap 40/doc); ${agg.callsMismatch} docs differ from the hand-derived count`,
    );
    m(
      'pipeline.bbox.meanIou',
      agg.iouCount,
      agg.iouCount > 0 ? agg.iouSum / agg.iouCount : null,
      agg.iouCount > 0 ? num(agg.iouSum / agg.iouCount, 3) : 'not measured',
      `mean IoU over ${agg.iouCount} expected bboxes (I7 viewer markers)`,
    );
    m(
      'pipeline.records.dimensionsPerPage',
      agg.pages,
      agg.pages > 0 ? agg.recordsDims / agg.pages : null,
      agg.pages > 0 ? num(agg.recordsDims / agg.pages, 2) : 'not measured',
      `${agg.recordsDims} dimension records over ${agg.pages} pages`,
    );
    m(
      'pipeline.records.openingsPerPage',
      agg.pages,
      agg.pages > 0 ? agg.recordsOpenings / agg.pages : null,
      agg.pages > 0 ? num(agg.recordsOpenings / agg.pages, 2) : 'not measured',
      `${agg.recordsOpenings} opening records over ${agg.pages} pages`,
    );
    m(
      'pipeline.records.elementsPerPage',
      agg.pages,
      agg.pages > 0 ? agg.recordsElements / agg.pages : null,
      agg.pages > 0 ? num(agg.recordsElements / agg.pages, 2) : 'not measured',
      `${agg.recordsElements} element records over ${agg.pages} pages`,
    );
    m(
      'pipeline.records.quantitiesPerPage',
      agg.pages,
      agg.pages > 0 ? agg.recordsQuantities / agg.pages : null,
      agg.pages > 0 ? num(agg.recordsQuantities / agg.pages, 2) : 'not measured',
      `${agg.recordsQuantities} quantity records (opening COUNT + element COUNT/area/volume) over ${agg.pages} pages`,
    );
    m(
      'pipeline.unresolved.dimensionRate',
      agg.recordsDims,
      rate(agg.unresolvedDims, agg.recordsDims),
      pct(rate(agg.unresolvedDims, agg.recordsDims)),
      `${agg.unresolvedDims}/${agg.recordsDims} dimension records UNRESOLVED`,
    );
    m(
      'pipeline.unresolved.openingRate',
      agg.recordsOpenings,
      rate(agg.unresolvedOpenings, agg.recordsOpenings),
      pct(rate(agg.unresolvedOpenings, agg.recordsOpenings)),
      `${agg.unresolvedOpenings}/${agg.recordsOpenings} opening records UNRESOLVED`,
    );
    m(
      'pipeline.unresolved.elementRate',
      agg.recordsElements,
      rate(agg.unresolvedElements, agg.recordsElements),
      pct(rate(agg.unresolvedElements, agg.recordsElements)),
      `${agg.unresolvedElements}/${agg.recordsElements} element records UNRESOLVED`,
    );
    m(
      'pipeline.unresolved.quantityRate',
      agg.recordsQuantities,
      rate(agg.unresolvedQuantities, agg.recordsQuantities),
      pct(rate(agg.unresolvedQuantities, agg.recordsQuantities)),
      `${agg.unresolvedQuantities}/${agg.recordsQuantities} quantity records UNRESOLVED`,
    );
    m(
      'pipeline.cache.secondRunHitRate',
      agg.cacheHitsRun2 + agg.callsRun2,
      rate(agg.cacheHitsRun2, agg.cacheHitsRun2 + agg.callsRun2),
      pct(rate(agg.cacheHitsRun2, agg.cacheHitsRun2 + agg.callsRun2)),
      `${agg.cacheHitsRun2} cache hits vs ${agg.callsRun2} calls on the second run (same cache)`,
    );
  }

  return { metrics, failures, guardInputs };
}

// ---------------------------------------------------------------------------
// Capability coverage (the owner's 8 acceptance capabilities)
// ---------------------------------------------------------------------------

function buildCoverage(
  metrics: MetricResult[],
  failures: FixtureFailure[],
): CapabilityCoverage[] {
  const find = (metric: string): MetricResult | undefined =>
    metrics.find((m) => m.metric === metric);
  const qtoExact = find('qto.exactMatchRate')?.value ?? 0;
  const phantomOpenings = failures.filter(
    (f) => f.metric === 'pipeline.opening.precision',
  ).length;

  return [
    {
      capability: 'Doors/windows — symbol, code, size, count',
      status: 'partial',
      detail:
        `Schedule linking + counting measured end-to-end (association + count accuracy above). ` +
        `Symbol DETECTION quality is NOT measurable here (stubbed model reads). ` +
        `${phantomOpenings} phantom opening(s) on structural drawings (bare marks read as openings) — see failures.`,
    },
    {
      capability: 'Dimensions — overall, chain, elevation, detail',
      status: 'partial',
      detail:
        'LINEAR / ELEVATION / LEVEL / DIAMETER / RADIUS / ANGLE measured per kind. ' +
        'OVERALL and CHAINED kinds are emitted since I11 Stage 4 (E18) when the label evidences them ' +
        'and measured per kind — LINEAR stays the default when the distinction is not evidenced. ' +
        'Live-model labelling of overall/chained is NOT measured (stubs simulate the labels).',
    },
    {
      capability: 'Walls — length, height, thickness, openings',
      status: 'partial',
      detail:
        'Wall net-area QTO measured directly and exact (qtoWallNetArea) AND wired since I11 Stage 4 ' +
        '(E16/E17): the pipeline produces WALL records from wall objects with net-area quantities ' +
        '(house fixture: 18.92 m² after deducting the linked openings). Wall ATTRIBUTION is not ' +
        'measured — the fixture deducts all same-page openings from one wall; which wall an opening ' +
        'sits in needs wall geometry the vision read does not evidence.',
    },
    {
      capability: 'Structure — columns, beams, slabs, foundations, rebar',
      status: 'partial',
      detail:
        'Rebar notation parsing measured at I2 level (Ø/D diameters, spacing rejection); K1/B1/S1/F1 ' +
        'schedule rows parse (F1 thickness now kept — E15). Structural SYMBOLS become ELEMENT records ' +
        'since I11 Stage 4 (E16) — linked to schedules, with cross-section/volume quantities (E17) — ' +
        'measured per fixture. Rebar quantities (kg) are still not measured.',
    },
    {
      capability: 'Roof — form, slope, frame, covering',
      status: 'partial',
      detail:
        'Roof-page classification + roof angles measured. A roof-plane record + plan area (48 m²) now ' +
        'exist and are measured (E16/E17); slope-corrected area, frame members, and covering types are ' +
        'not yet measured.',
    },
    {
      capability: 'Details — link sections/details to plans',
      status: 'measured',
      detail:
        'Reference resolution + conflict detection measured end-to-end (direct I5 probes + pipeline). ' +
        'Caveat: pipeline text refs can only reach PROBABLE, never CONFIRMED — the model never knows the ' +
        'target page number, so to.page is always null for text refs.',
    },
    {
      capability: 'QTO — quantities with evidence + formulas',
      status: 'partial',
      detail:
        `I4 deterministic QTO is exact on hand-computed fixtures (${pct(qtoExact)}). The PIPELINE now ` +
        `produces COUNT + area/volume quantities from element geometry (wall net area, footing volume, ` +
        `cross-sections) — measured per fixture (pipeline.quantity.*). SDA/CIVIL quantities are still ` +
        `not derived (section geometry is not L×H).`,
    },
    {
      capability: 'AHSP — match to catalog WITHOUT inventing prices',
      status: 'partial',
      detail:
        'The no-invention side is measured and guarded (unmatched → null, no invented codes). The ' +
        'matcher ADAPTER exists since I11 Stage 4 (visionAhsp.ts over the canonical resolver) and the ' +
        'pipeline calls it for openings + quantities in EZRAB_AI mode — but the BENCHMARK still runs ' +
        'the null matcher, so positive catalog matching is measured only in the pipeline suite with a ' +
        'stub resolver, not end-to-end against the real catalog.',
    },
  ];
}

// ---------------------------------------------------------------------------
// runBenchmark — the entry point
// ---------------------------------------------------------------------------

export const BENCHMARK_SCOPE =
  'STUB-FIRST benchmark: deterministic layers (I1–I9 + I11 Stage 4 E15–E18/F8/F11) + pipeline wiring, ' +
  'measured with fixture-defined stub vision responses. NO live provider ' +
  'calls were made. Real-document accuracy is NOT measured (owner tier ' +
  'empty — awaiting the owner\'s drawings) and live-model quality is NOT ' +
  'measured (stubs simulate a perfect model read). Internet fixtures use ' +
  'a perfect-model simulation built from hand-verified text-layer strings.';

export async function runBenchmark(
  fixtures: BenchmarkFixture[],
): Promise<BenchmarkReport> {
  const direct = measureDirect();
  const pipeline = await measurePipeline(fixtures);

  const fixtureCounts = {
    synthetic: fixtures.filter((f) => f.tier === 'synthetic').length,
    internet: fixtures.filter((f) => f.tier === 'internet').length,
    owner: fixtures.filter((f) => f.tier === 'owner').length,
    total: fixtures.length,
  };

  const metrics = [...direct.metrics, ...pipeline.metrics];
  const failures = [...direct.failures, ...pipeline.failures];

  // --- regression guards -----------------------------------------------------
  const totalDimFp =
    direct.guardInputs.dimensionNegativeFalsePositives +
    pipeline.guardInputs.pipelineFalsePositiveDimensions;
  const guards: GuardResult[] = [
    {
      id: 'dim-negatives-zero-fp',
      description: 'Dimension negatives: 0 false positives (direct probes + pipeline false-positive records)',
      passed: totalDimFp === 0,
      detail:
        totalDimFp === 0
          ? 'No negative parsed as a dimension anywhere.'
          : `${totalDimFp} false-positive dimension record(s): ${direct.guardInputs.dimensionNegativeFalsePositives} direct + ${pipeline.guardInputs.pipelineFalsePositiveDimensions} pipeline (see failures).`,
    },
    {
      id: 'qto-exact',
      description: 'QTO exact on hand-computed fixtures',
      passed: direct.guardInputs.qtoExact,
      detail: direct.guardInputs.qtoExact
        ? 'All hand-computed QTO values exact.'
        : `QTO mismatches: ${direct.guardInputs.qtoFailures.join('; ')}`,
    },
    {
      id: 'truncation-never-completed',
      description: 'Truncated text never completed (verbatim parse + text-only routing)',
      passed:
        direct.guardInputs.truncatedCompleted === 0 &&
        pipeline.guardInputs.truncatedCompleted === 0,
      detail:
        direct.guardInputs.truncatedCompleted + pipeline.guardInputs.truncatedCompleted === 0
          ? 'Every truncated span kept verbatim and routed to kind=text.'
          : `${direct.guardInputs.truncatedCompleted + pipeline.guardInputs.truncatedCompleted} truncation violation(s) (see failures).`,
    },
    {
      id: 'duplicates-never-double-counted',
      description: 'Duplicated marks never double-counted (OCR dedupe + proposal dedupe + counts)',
      passed:
        direct.guardInputs.dedupeFailures === 0 &&
        pipeline.guardInputs.duplicateCountFailures === 0,
      detail:
        direct.guardInputs.dedupeFailures + pipeline.guardInputs.duplicateCountFailures === 0
          ? 'All dedupe cases exact and all opening counts exact.'
          : `${direct.guardInputs.dedupeFailures} dedupe probe failure(s) + ${pipeline.guardInputs.duplicateCountFailures} pipeline count mismatch(es).`,
    },
    {
      id: 'no-invented-prices',
      description: 'No invented prices anywhere (AHSP unmatched → null; dimension values traceable to text)',
      passed:
        pipeline.guardInputs.inventedAhspCodes === 0 &&
        pipeline.guardInputs.reparseFailures === 0,
      detail:
        pipeline.guardInputs.inventedAhspCodes + pipeline.guardInputs.reparseFailures === 0
          ? 'Every AHSP match null when unmatched; every dimension value re-derivable from its verbatim text.'
          : `${pipeline.guardInputs.inventedAhspCodes} invented AHSP code(s) + ${pipeline.guardInputs.reparseFailures} untraceable dimension value(s).`,
    },
  ];

  const notMeasured: string[] = [
    'Real-document accuracy (owner tier empty — awaiting the owner\'s drawings).',
    'Live-model quality: symbol/dimension detection accuracy, OCR accuracy on real scans, model bbox accuracy (stubs simulate a perfect read).',
    'Positive AHSP catalog matching end-to-end against the real catalog (the benchmark runs the null matcher; the adapter + stub-resolver wiring are measured in the pipeline suite).',
    'Rebar quantities (kg) and cross-view element identity (E19: the same mark on two views is recorded twice).',
    'Wall attribution (which wall an opening sits in), slope-corrected roof area, SDA/CIVIL section geometry.',
    'Browser rendering of the I7 viewer (bbox IoU here measures pipeline bbox fidelity, not on-screen rendering).',
  ];
  for (const f of fixtures) {
    for (const nm of f.notMeasured ?? []) {
      notMeasured.push(`${f.id}: ${nm}`);
    }
  }

  const coverage = buildCoverage(metrics, failures);

  return {
    generatedAt: new Date().toISOString(),
    scope: BENCHMARK_SCOPE,
    fixtureCounts,
    metrics,
    failures,
    guards,
    coverage,
    notMeasured,
  };
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

function metricTable(metrics: MetricResult[]): string {
  const rows = metrics.map((m) => {
    const value = m.value === null ? 'not measured' : m.display;
    return `| ${m.metric} | ${m.tier} | ${m.n} | ${value} | ${m.notes} |`;
  });
  return [
    '| metric | tier | n | value | notes |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

export function formatBenchmarkReport(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push('# EZRAB DED Drawing Vision — Benchmark Report (I10a)');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push(`**Scope:** ${report.scope}`);
  lines.push('');
  lines.push(
    `**Fixtures:** ${report.fixtureCounts.total} total — ` +
      `${report.fixtureCounts.synthetic} synthetic, ${report.fixtureCounts.internet} internet, ` +
      `${report.fixtureCounts.owner} owner` +
      (report.fixtureCounts.owner === 0
        ? ' (owner tier EMPTY — awaiting the owner\'s drawings)'
        : ''),
  );
  lines.push('');
  lines.push('## Regression guards');
  lines.push('');
  for (const g of report.guards) {
    lines.push(`- ${g.passed ? 'PASS' : 'FAIL'} **${g.id}** — ${g.description}`);
    lines.push(`  ${g.detail}`);
  }
  lines.push('');
  lines.push('## Per-metric results');
  lines.push('');
  lines.push('Per metric, never one headline number. `n` is the sample size;');
  lines.push('`not measured` means the harness could not verify it — never a guess.');
  lines.push('');
  lines.push(metricTable(report.metrics));
  lines.push('');
  lines.push('## Capability coverage (owner acceptance bar)');
  lines.push('');
  for (const c of report.coverage) {
    lines.push(`- **${c.capability}** — ${c.status.toUpperCase()}`);
    lines.push(`  ${c.detail}`);
  }
  lines.push('');
  lines.push(`## Failures (${report.failures.length})`);
  lines.push('');
  if (report.failures.length === 0) {
    lines.push('None — every measured expectation held.');
  } else {
    for (const f of report.failures) {
      lines.push(`- [${f.severity}] ${f.fixtureId} / ${f.metric}`);
      lines.push(`  expected: ${f.expected}`);
      lines.push(`  got:      ${f.got}`);
    }
  }
  lines.push('');
  lines.push('## Not measured');
  lines.push('');
  for (const nm of report.notMeasured) {
    lines.push(`- ${nm}`);
  }
  lines.push('');
  return lines.join('\n');
}
