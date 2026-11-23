/**
 * DED drawing-vision benchmark — stub vision-response builders (I10a).
 *
 * Tiny helpers that shape fixture-defined stub responses in the exact
 * JSON the vision parsers consume (`{ detections: [...] }` for survey /
 * detail, `{ spans: [...] }` for OCR). A stub response is a FIXTURE
 * ARTIFACT — what a perfect model read would return — never a claim
 * about what a live model actually reads.
 */

import type { BoundingBox } from '../types';

export const DEFAULT_BBOX: BoundingBox = { x: 100, y: 100, width: 200, height: 40 };

export function bbox(x: number, y: number, width: number, height: number): BoundingBox {
  return { x, y, width, height };
}

/** One survey/detail detection entry. */
export function entry(
  kind: string,
  label: string,
  rawText: string,
  box: BoundingBox = DEFAULT_BBOX,
  confidence = 0.95,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { kind, label, rawText, bbox: { ...box }, confidence, ...extra };
}

export function dimEntry(
  rawText: string,
  box: BoundingBox = DEFAULT_BBOX,
  confidence = 0.95,
  /**
   * I11 Stage 4 (E18) — explicit label, when the label differs from the
   * raw text (e.g. an OVERALL/CHAINED kind hint: label `overall width`,
   * rawText `7.000`). Defaults to the raw text, as before.
   */
  label?: string,
): Record<string, unknown> {
  return entry('dimension', label ?? rawText, rawText, box, confidence);
}

export function symbolEntry(
  mark: string,
  rawText: string,
  box: BoundingBox = DEFAULT_BBOX,
  confidence = 0.9,
): Record<string, unknown> {
  return entry('symbol', mark, rawText, box, confidence);
}

export function tableEntry(
  rowText: string,
  box: BoundingBox = DEFAULT_BBOX,
  confidence = 0.9,
): Record<string, unknown> {
  return entry('table', rowText, rowText, box, confidence);
}

export function legendEntry(
  rawText: string,
  box: BoundingBox = DEFAULT_BBOX,
  confidence = 0.9,
): Record<string, unknown> {
  return entry('legend', rawText, rawText, box, confidence);
}

export function textEntry(
  rawText: string,
  box: BoundingBox = DEFAULT_BBOX,
  confidence = 0.9,
): Record<string, unknown> {
  return entry('text', rawText, rawText, box, confidence);
}

export function objectEntry(
  label: string,
  rawText: string,
  box: BoundingBox = DEFAULT_BBOX,
  confidence = 0.9,
): Record<string, unknown> {
  return entry('object', label, rawText, box, confidence);
}

/** Survey/detail response body. */
export function detections(list: unknown[]): { detections: unknown[] } {
  return { detections: list };
}

/** Empty survey/detail response body. */
export function emptyDetections(): { detections: unknown[] } {
  return { detections: [] };
}

/** One OCR span entry. */
export function ocrSpan(
  text: string,
  box: BoundingBox | null,
  confidence: number,
  flags: {
    truncated?: boolean;
    skewed?: boolean;
    blurry?: boolean;
    duplicated?: boolean;
    duplicateCount?: number;
  } = {},
): Record<string, unknown> {
  const span: Record<string, unknown> = { text, bbox: box ? { ...box } : null, confidence };
  if (flags.truncated) span.truncated = true;
  if (flags.skewed) span.skewed = true;
  if (flags.blurry) span.blurry = true;
  if (flags.duplicated) span.duplicated = true;
  if (flags.duplicateCount !== undefined) span.duplicateCount = flags.duplicateCount;
  return span;
}

/** OCR response body. */
export function ocrSpans(list: unknown[]): { spans: unknown[] } {
  return { spans: list };
}

/** Empty OCR response body (a blank / textless scanned page). */
export function emptyOcr(): { spans: unknown[] } {
  return { spans: [] };
}
