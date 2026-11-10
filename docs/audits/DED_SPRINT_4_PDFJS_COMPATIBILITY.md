# EZRAB Sprint 4 — PDF.js Compatibility (Task A) — Sprint Summary

**Date:** 2026-11-10 · **Status:** Done locally, uncommitted (coordinator runs the final `tsc` + build pass).

## What was wrong

PDF.js 6.3.289's modern build calls `Uint8Array.prototype.toHex` (Chrome 140+ /
Firefox 133+ / Safari 18.2+ / Node 25+) on every `getDocument()`, with no polyfill.
EZRAB's shared loader used the modern build in the browser and in
`PdfPageService`'s Node path, so PDF loading failed totally — but fail-closed —
on older runtimes (reproduced on this machine's Node 24: modern → `hashOriginal.toHex
is not a function`; legacy → 32 pages + fingerprints OK).

## What changed

- `src/lib/pdfjsSetup.ts` — main and worker now both use the **legacy** build of
  the same installed package/version; the CDN fallback was repointed from the
  modern cdnjs worker to the version-exact legacy worker on the jsDelivr npm
  mirror.
- `src/ded-rab-v2/ingestion/pdfPageService.ts` — Node import switched to the
  legacy build (one line).
- `src/test/dedPdfjsCompat.src.ts` — new regression suite.
- No dependency version change; no hand-written `toHex` polyfill (the legacy
  build ships upstream's).

## Verification

- New suite: **26 PASS / 0 FAIL / 2 SKIP** (the 2 SKIPs are an esbuild-bundle
  font-resolution artifact for canvas rendering, covered by an unbundled tsx
  probe: 2 pages `RENDERED` — PASS).
- Related suites unchanged and green: dedHardening 34/34, dedPriceCompletion
  43/43, dedRealFileAssumptionHarness 15/15. `dedDifferentialPdf.test.ts`
  still blocked by its own missing fixture B (`qa-fixtures/DED_UNIQUE_P7Q.pdf`
  absent from this checkout — pre-existing, fails before any PDF load).
- Browser: real headless-Chromium runtime smoke of the legacy main+worker pair
  passed (32 pages, fingerprints read); the Vite-bundled loader wiring itself
  awaits the coordinator's build pass.

Full technical record, evidence, and risk notes:
[`DED_PDFJS_COMPATIBILITY_FIX.md`](./DED_PDFJS_COMPATIBILITY_FIX.md).
Test logs: `~/workspace/your_files/EZRAB-DED-SPRINT4/test-out/taskA/`.
