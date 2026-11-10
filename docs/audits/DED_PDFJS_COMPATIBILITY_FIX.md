# DED PDF.js Compatibility Fix — Technical Record

- **Date:** 2026-11-10
- **Scope:** EZRAB Sprint 4, Task A — shared PDF.js loader compatibility fix
- **Repo / branch:** `ezrab-unified`, `integrasi/unified-ui-engine` (local changes only; no commit/push performed by this task)
- **Origin:** DED Hardening programme investigation, `LAPORAN-DED-HARDENING.md` sections C.7 and I.1 (finding P1)
- **Status:** Fix implemented and regression-tested locally. Global `tsc` / `vite build` intentionally **not** run by this task (reserved for the sprint coordinator's single final pass).

---

## 1. Root cause

`pdfjs-dist@6.3.289`'s **modern** build calls `Uint8Array.prototype.toHex()` inside the
worker's `PDFDocument.fingerprints` getter (the internal variable is named
`hashOriginal`: a 16-byte trailer ID / MD5 digest). `Uint8Array.prototype.toHex` is a
very new TC39 API, available only in:

| Runtime | Minimum version with native `toHex` |
|---|---|
| Chrome / Edge | 140 |
| Firefox | 133 |
| Safari | 18.2 |
| Node.js | 25 |

The modern build ships **no polyfill** for it. The worker requests `fingerprints`
on **every** `getDocument()` call, so on any older runtime the failure is total:
every PDF load in every consumer of the shared loader fails with
`hashOriginal.toHex is not a function`. The failure is **fail-closed** — a structured
error, zero items, no silent wrong output, no data corruption. EZRAB's own
hashing/caching code does not use `toHex`/`fingerprints` and was never affected.

The **legacy** build of the same package ships the core-js polyfill for this API
(feature-detected), which is why it works on older runtimes.

### Pre-fix state of EZRAB (verified by reading the sources, not assumed)

- `src/lib/pdfjsSetup.ts` — Node branch already imported the legacy build, but the
  **browser** branch imported the modern main build (`import('pdfjs-dist')`), the
  **modern** worker (`pdfjs-dist/build/pdf.worker.min.mjs?url`), and its last-resort
  CDN fallback pointed at the modern worker build on cdnjs.
- `src/ded-rab-v2/ingestion/pdfPageService.ts` (Node path, line 211) — imported
  `pdfjs-dist` directly (modern build), bypassing the shared loader.
- Shared consumers of the loader / service, all affected by the one defect:
  `ded-rab-v2`, `ded-rab-v3`, `ai-estimate`, `ded-ai-estimate` (`parseDedPdf` via
  `loadPdfjs`), `ded-full-ai`, `document-ai`, `magic-ai` DocumentViewer.

### Reproduction on this machine (Node v24.22.1, before the fix)

Command: dynamic-import each build in Node and `getDocument()` the owner fixture
`qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf` (log:
`~/workspace/your_files/EZRAB-DED-SPRINT4/test-out/taskA/repro-before-fix.log`).

```
pdfjs-dist                            => FAIL: hashOriginal.toHex is not a function
pdfjs-dist/legacy/build/pdf.mjs       => OK numPages= 32
                                         fingerprints= ["18ee3b850b4e56c21416f8d0f10f53ed", null]
                                         version= 6.3.289
node v24.22.1  Uint8Array.prototype.toHex = undefined   (before legacy import)
```

This matches the hardening report exactly.

## 2. Installed-package verification (before editing)

All checks against the actually installed `node_modules/pdfjs-dist`:

- Package version: **6.3.289**; declared in `package.json` as `^6.3.289` — match.
- The package has **no `exports` map**, so subpath specifiers resolve to real files.
- Legacy files present on disk:
  - `node_modules/pdfjs-dist/legacy/build/pdf.mjs` (1,023 KB)
  - `node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs` (1.3 MB)
  - (also `legacy/build/pdf.worker.mjs`, non-minified)
- The version string `6.3.289` is present in the legacy main build, the legacy
  worker, and the modern main build — main and worker are the same version, as
  PDF.js requires (API/worker version match).
- No dependency version change was needed or made.

## 3. Changes (exact)

### 3.1 `src/lib/pdfjsSetup.ts`

| Location | Before | After |
|---|---|---|
| `loadPdfjs()` main import | Node: `pdfjs-dist/legacy/build/pdf.mjs`; Browser: `pdfjs-dist` (modern) | **Both environments:** `pdfjs-dist/legacy/build/pdf.mjs` (single unconditional legacy import; the Node/browser branch split is gone) |
| Worker import (browser) | `pdfjs-dist/build/pdf.worker.min.mjs?url` (modern) | `pdfjs-dist/legacy/build/pdf.worker.min.mjs?url` (legacy, same package, same version) |
| CDN fallback (browser, last resort only) | `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${ver}/pdf.worker.min.mjs` (modern build) | `https://cdn.jsdelivr.net/npm/pdfjs-dist@${ver}/legacy/build/pdf.worker.min.mjs` (legacy build, exact installed version) |
| Header comment | described local worker only | documents the compatibility rationale and the pairing requirement |

### 3.2 `src/ded-rab-v2/ingestion/pdfPageService.ts`

| Location | Before | After |
|---|---|---|
| Node path import (was line 211) | `await import('pdfjs-dist')` (modern) | `await import('pdfjs-dist/legacy/build/pdf.mjs')`, with an explanatory comment |

The browser path of `PdfPageService` already goes through `loadPdfjs()`, so it is
fixed by §3.1 with no further change. No other files were modified.

### 3.3 New regression suite

- `src/test/dedPdfjsCompat.src.ts` (new) — see §5.

### Fallback decision

The CDN fallback branch was **kept but repointed**, not removed:

- It only executes if Vite's local `?url` worker asset somehow fails to load —
  removing it would turn a recoverable situation into a hard failure.
- The old URL served the **modern** worker from cdnjs, which would have
  re-introduced exactly this bug (and a main/worker build mismatch) in precisely
  the degraded situation where the fallback runs.
- jsDelivr's npm mirror serves the **identical file from the identical npm
  package version** (`pdfjs-dist@<installed version>/legacy/build/pdf.worker.min.mjs`),
  so the fallback is now legacy and version-locked to the installed package
  (`ver` is read from `pdfjs.version` at runtime, not hardcoded).

### What was deliberately NOT done

- **No hand-written global `Uint8Array.prototype.toHex` polyfill.** The legacy
  build already carries the upstream core-js polyfill, applied inside both the
  main thread and the worker scope. A main-thread polyfill written by EZRAB
  would not cross into the browser Worker's global scope anyway (the reason the
  hardening reviewer rejected that alternative).
- **No `pdfjs-dist` version change** in `package.json` / lockfile — unnecessary:
  the installed 6.3.289 already ships the legacy build.
- No changes outside the task's file scope.

## 4. Risks

- **Worker size:** the legacy worker is ~4% larger than the modern one
  (polyfills). Negligible; it is a lazily loaded asset.
- **Legacy build feature set:** the legacy build is the upstream-supported build
  for older browsers; API surface used by EZRAB (`getDocument`, `getPage`,
  `getTextContent`, `render`, `fingerprints`, `GlobalWorkerOptions`) is identical.
- **Main/worker pairing:** both now come from the same package directory tree
  (`legacy/build/`), eliminating the previous latent mismatch risk. The
  regression suite asserts this pairing statically (section B) and by version
  string in the shipped files (section A).
- **CDN fallback:** network-dependent and still a last resort only; it is now
  legacy + version-exact instead of modern.
- **Behaviour on fully modern runtimes:** unchanged — the legacy polyfill is
  feature-detected and inert where `toHex` exists natively.

## 5. Test results

All logs: `~/workspace/your_files/EZRAB-DED-SPRINT4/test-out/taskA/`

### 5.1 New suite — `src/test/dedPdfjsCompat.src.ts`

```
./node_modules/.bin/esbuild src/test/dedPdfjsCompat.src.ts --bundle \
  --platform=node --format=cjs --outfile=./dedPdfjsCompat.test-bundle.cjs
node ./dedPdfjsCompat.test-bundle.cjs        (run from repo root; bundle deleted after)
```

**Result: 26 PASS / 0 FAIL / 2 SKIP** (exit 0). Log: `dedPdfjsCompat.log`.

Coverage:

- **A (package):** installed version equals declared version; legacy main and
  worker files exist; both contain the installed version string.
- **B (static source):** `pdfjsSetup.ts` references only the legacy main and the
  legacy worker (`?url`); no bare modern import, no modern worker reference, no
  cdnjs URL; any CDN URL points at the legacy worker. Same legacy-only assertion
  for the Node import in `pdfPageService.ts`.
- **C (runtime via production loader):** `loadPdfjs()` loads; runtime version
  matches; the owner fixture loads with **no `toHex` error**, **32 pages**,
  `fingerprints` readable (`["18ee3b850b4e56c21416f8d0f10f53ed", null]`),
  page-1 text extraction returns items.
  - Harness note: in an esbuild CJS bundle, PDF.js loses its sibling-worker
    resolution, so the suite sets `GlobalWorkerOptions.workerSrc` explicitly to
    the package's legacy worker file — the same worker the unbundled runtime
    resolves on its own. This is a harness accommodation, not a product change.
- **D (fail-closed):** garbage bytes are rejected by `getDocument`;
  `PdfPageService.extractPages` throws structured `PDF_RENDER_ERROR` for garbage
  bytes and for a 0-byte buffer; `parseDedPdf` returns a structured
  `PDF_RENDER_ERROR` object for garbage — never an empty success.
- **E (shared consumers):** `parseDedPdf` reads the full fixture through the
  production loader (32 pages, ≥10 pages with native text) — PASS in-bundle.
  `PdfPageService.extractPages` canvas **rendering** is SKIP in-bundle: bundled
  PDF.js cannot resolve its standard-font files (an esbuild/`import.meta`
  artifact — error `The argument 'filename' must be a file URL object...
  Received undefined`), which is a bundling limitation, not a PDF-load failure.
  The same rendering path is verified unbundled in §5.2.

### 5.2 Unbundled render probe (tsx, the repo's own `.test.ts` pattern)

```
npx tsx ~/workspace/your_files/EZRAB-DED-SPRINT4/test-out/taskA/pdfPageServiceProbe.mts
```

**Result: PROBE PASS** — `PdfPageService.extractPages(fixture, maxPages=2)` →
2 pages, both `RENDERED`, image data URLs 28,738 and 169,002 chars.
Log: `pdfPageServiceProbe.log`.

### 5.3 Pre-existing related suites

Same esbuild bundle pattern as §5.1:

| Suite | Command pattern | Result |
|---|---|---|
| `src/test/dedHardening.src.ts` | esbuild bundle + node | **34 PASS / 0 FAIL** |
| `src/test/dedPriceCompletion.src.ts` | esbuild bundle + node | **43 PASS / 0 FAIL** |
| `src/test/dedRealFileAssumptionHarness.src.ts` | esbuild bundle + node | **15 PASS / 0 FAIL** |
| `src/test/dedDifferentialPdf.test.ts` | `npx tsx src/test/dedDifferentialPdf.test.ts` | **FAIL — pre-existing, unrelated:** aborts on its own upfront assertion `Fixture B missing: qa-fixtures/DED_UNIQUE_P7Q.pdf`. That fixture file does not exist in this checkout (only `pdf-gambar-rumah-1-lantai_compress.pdf` is present in `qa-fixtures/`), so the suite fails **before any PDF is loaded** and cannot exercise the pdf.js path either way. Not caused by, and not fixable within, this task's file scope. Log: `dedDifferentialPdf.log`. |

## 6. Browser verification status

**Real browser runtime smoke test — performed and passed**, with one honest
qualification about what it exercised:

- Method: a temporary static page served from the repo root over local HTTP,
  run in headless Chromium (`Google Chrome for Testing 156.0.8078.4`,
  `~/.cache/ms-playwright/chromium-1248`). The page imported the **exact legacy
  module files the fixed loader now references**
  (`/node_modules/pdfjs-dist/legacy/build/pdf.mjs`, worker
  `/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs`), fetched the owner
  fixture, and called `getDocument()`.
- Result (`browser-smoke.log`):
  `SMOKE_OK version=6.3.289 numPages=32 fingerprints=["18ee3b850b4e56c21416f8d0f10f53ed",null]`
- Qualifications:
  1. The page imported the legacy files **directly**, not through
     `loadPdfjs()` as bundled by Vite — the `?url` worker mechanism is
     Vite-specific and a Vite build was out of this task's scope (coordinator's
     final pass). So: the legacy main+worker **pair** is proven at browser
     runtime; the Vite-bundled loader wiring itself is verified only by the
     static source assertions (suite section B) plus the coordinator's build.
  2. Chromium 156 natively supports `Uint8Array.prototype.toHex` (≥140), so
     this browser alone cannot prove the old-runtime rescue. That proof is the
     Node 24 runtime evidence (§1, §5.1-C): Node 24 has **no** native `toHex`;
     the modern build failed there and the legacy build succeeded on the same
     fixture in the same process conditions.

## 7. Files changed by this task

| File | Change |
|---|---|
| `src/lib/pdfjsSetup.ts` | Browser main → legacy; worker → legacy `?url`; CDN fallback → jsDelivr legacy, version-exact; rationale comment |
| `src/ded-rab-v2/ingestion/pdfPageService.ts` | Node import → legacy build + comment (1 import line) |
| `src/test/dedPdfjsCompat.src.ts` | **New** regression suite (28 checks: 26 PASS, 2 SKIP-with-probe) |
| `docs/audits/DED_PDFJS_COMPATIBILITY_FIX.md` | **New** — this document |
| `docs/audits/DED_SPRINT_4_PDFJS_COMPATIBILITY.md` | **New** — sprint summary referring here |

No commits, pushes, resets, or cleans were performed. `package.json` untouched.
Global `tsc` and `vite build` were not run (coordinator's step).
