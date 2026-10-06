# EZRAB DED → RAB Live Runtime Forensic v1

## LOCALHOST 3000 VERIFICATION

**Status: LOCALHOST 3000 VERIFICATION FAILED**

URL:

`http://localhost:3000/app/projects/PRJ-RUMAH-2LT-01/ai?mode=ded-rab`

### Runtime availability

- `localhost:3000`: HTTP 200
- Process: existing Vite development server on port 3000
- No second application server was started.
- Route loaded in headless Chrome through Chrome DevTools Protocol.
- Live screenshot captured at `browser_proof_ded_rab_live_runtime.png`.

### Live execution attempted

The route was opened for project `PRJ-RUMAH-2LT-01`. The onboarding dialog was advanced, the UI sample DED action was clicked, and the actual `Mulai Analisis DED ke RAB` action was clicked. The browser was then left waiting for 35 seconds for the pipeline result.

The rendered runtime result after the attempt was:

```text
Dokumen: 2
Halaman: 1
Item Ditemukan: 0
QTO Terhitung: 0
Perlu Review: 0
Data Lengkap: 0
Tabel Lengkap: 0
Terapkan 0 Item Valid
```

The UI remained in the review shell with no DED work rows. Therefore there is no valid runtime `Pondasi Batu Kali` object to trace to `RabWorkItem`, no live canonicalWorkId/evidence/QTO/AHSP/price/amount chain, and no newly rendered RAB result to accept.

### Before/result comparison

The previous runtime state and the re-run both fail the required live acceptance boundary: the route loads, but the pipeline result is empty. The observed output is not a valid proof of the corrected DED→RAB result because no work item was rendered.

### Root cause observed during live verification

The supplied browser E2E flow initially clicked `+ Analisis DED Baru`, which opens the new-analysis shell rather than executing the pipeline. A corrected CDP flow then clicked the visible sample action and the actual `Mulai Analisis DED ke RAB` button. After waiting 35 seconds, the UI still showed one rendered page and zero items/QTO/results.

This indicates a live runtime/input or pipeline execution failure before result rendering (the exact execution error is not exposed in the current UI). It cannot be classified as a successful stale-draft invalidation or as a successful fresh pipeline run. No source/business-logic change was made because the runtime evidence does not isolate a safe root cause.

### Required runtime trace — unavailable because execution produced no work item

| Trace field | Live value |
|---|---|
| Project | `PRJ-RUMAH-2LT-01` |
| Pipeline | DED→RAB v2/v3 |
| Execution ID | Not exposed; no completed pipeline result returned |
| Timestamp | 2026-09-30 live browser attempt |
| Source hash | Not available from rendered UI; sample DED is generated client-side |
| Result hash | Not applicable; no result object rendered |
| Canonical work count | 0 rendered |
| Pondasi Batu Kali | Not rendered |
| Visible Qty | Not applicable |
| AHSP | Not applicable |
| Harga Satuan | Not applicable |
| Amount | Not applicable |
| Apply to RAB | `Terapkan 0 Item Valid` |

### Cache/draft status

- `sessionStorage`: empty.
- `localStorage`: contains existing project/RAB application state, but no completed live DED→RAB result object was exposed by the page.
- No project, database, user, AHSP master, price database, or production data was deleted.
- No stale result was accepted as fresh evidence.

### Code/build/regression status

Previously verified after the fixture compatibility correction:

- `npx tsc --noEmit`: PASS, 0 errors.
- `npm run build`: PASS; TypeScript and Vite completed.
- `npm run test:ded-rab`: PASS — 20/20, 24/24, 15/15, canonical A–G PASS.
- `npm run test:core-ai`: PASS — 70/70.
- `npm run test:phaseC`: PASS — 71/71.

These results do not override the failed live localhost acceptance.

### Final assessment

`LOCALHOST 3000 VERIFICATION FAILED`.

The application is reachable, but the requested fresh real DED→RAB runtime result was not produced. It would be incorrect to claim that duplicate Pondasi Batu Kali rows, live quantity, live AHSP, live price, live amount, or live spreadsheet output were verified.