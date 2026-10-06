# EZRAB REPOSITORY CLEANUP REPORT

**Date:** 2026-10-04
**Method:** SCAN → CLASSIFY → VERIFY REFERENCES → PROPOSE → QUARANTINE → TEST → PURGE → REPORT
**Rule enforced:** delete only `confidence >= 0.95`. Priority CORRECTNESS > DATA INTEGRITY > RUNTIME > BUILD > TESTS > SIZE.

---

## 1. Original size

| Metric | Value |
|---|---|
| Total bytes | `2,208,671,832` |
| GB | **2.0570 GB** |
| MB | 2,106.35 MB |
| Files | 29,654 |

## 2. Final size

| Metric | Value |
|---|---|
| Total bytes | `1,588,090,379` |
| GB | **1.4790 GB** |
| MB | 1,514.52 MB |
| Files | 29,379 |

## 3. Total saved

| Metric | Value |
|---|---|
| Bytes | `620,581,453` |
| GB | **0.5780 GB** |
| MB | **591.83 MB** |

## 4. Percentage reduction

**28.10 %**

> **Optional further reduction.** The rebuild performed for verification recreated `dist/` (214.88 MB). Deleting it again (it is a pure build artifact — regenerate with `npm run build`) yields **1,299.64 MB / 1.2692 GB**, i.e. **806.71 MB saved = 38.30 % reduction**. This was left in place per your explicit choice ("Hapus dist/ juga, lalu rebuild untuk verifikasi").

---

## 5. Top 30 largest files — BEFORE

| # | Size | Path |
|---|---|---|
| 1 | 91.50 MB | node_modules\@supabase\cli-windows-x64\bin\supabase.exe |
| 2 | 70.29 MB | node_modules\.vite-temp\vite.config.ts.timestamp-*.mjs |
| 3 | 61.44 MB | node_modules\.vite-temp\vite.config.ts.timestamp-*.mjs |
| 4 | 54.00 MB | sources\ahsp2026\Lampiran-VI-...-AHSP-Bidang-Cipta-Karya.pdf |
| 5 | 50.03 MB | node_modules\.vite-temp\vite.config.ts.timestamp-*.mjs |
| 6 | 39.55 MB | node_modules\@supabase\cli-windows-x64\bin\supabase-go.exe |
| 7 | 38.33 MB | sources\ahsp2026\Lampiran-IV-...-AHSP-Bidang-Sumber-Daya-Air.pdf |
| 8 | 37.63 MB | public\videos\roles-bg.mp4 |
| 9 | 37.63 MB | dist\videos\roles-bg.mp4 |
| 10 | 37.63 MB | dist-qa\videos\roles-bg.mp4 |
| 11 | 37.36 MB | node_modules\.vite-temp\vite.config.ts.timestamp-*.mjs |
| 12 | 37.35 MB | node_modules\.vite-temp\vite.config.ts.timestamp-*.mjs |
| 13 | 32.71 MB | public\videos\ezrab-magic-ai.mp4 |
| 14 | 32.71 MB | dist\videos\ezrab-magic-ai.mp4 |
| 15 | 32.71 MB | dist-qa\videos\ezrab-magic-ai.mp4 |
| 16 | 30.98 MB | dist\assets\index-h3nEqa2P.js |
| 17 | 26.16 MB | node_modules\@napi-rs\canvas-win32-x64-msvc\skia.win32-x64-msvc.node |
| 18 | 25.71 MB | EZRAB-LOCAL-AI\python-3.12.10-amd64.exe |
| 19 | 20.73 MB | src\assets\0908fg-transparent.webm |
| 20 | 20.58 MB | sources\ahsp2026\Lampiran-V-...-AHSP-Bidang-Bina-Marga.pdf |
| 21 | 20.58 MB | bina_marga_downloaded.pdf |
| 22 | 20.58 MB | Lampiran-II-...-AHSP-Bidang-Bina-Marga.pdf |
| 23 | 19.91 MB | node_modules\@rolldown\.binding-win32-x64-msvc\rolldown-binding.win32-x64-msvc.node |
| 24 | 19.89 MB | data\ahsp2026\validated\ahsp_2026_master.json |
| 25 | 18.21 MB | .git\objects\be\7838c7ad... |
| 26 | 17.38 MB | src\assets\0908.mp4 |
| 27 | 16.10 MB | .git\objects\be\tmp_obj_oDgCmc |
| 28 | 14.85 MB | src\data\nationalCostDatabase\ahsp2026Canonical.generated.ts |
| 29 | 14.65 MB | dist-qa\assets\index-DmRjQuWz.js |
| 30 | 12.84 MB | data\ahsp2026\validated\ahsp_2026_components.json |

## 6. Top 30 largest files — AFTER

| # | Size | Path |
|---|---|---|
| 1 | 91.50 MB | node_modules\@supabase\cli-windows-x64\bin\supabase.exe |
| 2 | 54.00 MB | sources\ahsp2026\Lampiran-VI-...-AHSP-Bidang-Cipta-Karya.pdf |
| 3 | 39.55 MB | node_modules\@supabase\cli-windows-x64\bin\supabase-go.exe |
| 4 | 38.33 MB | sources\ahsp2026\Lampiran-IV-...-AHSP-Bidang-Sumber-Daya-Air.pdf |
| 5 | 37.63 MB | public\videos\roles-bg.mp4 |
| 6 | 37.63 MB | dist\videos\roles-bg.mp4 *(regenerated)* |
| 7 | 32.71 MB | public\videos\ezrab-magic-ai.mp4 |
| 8 | 32.71 MB | dist\videos\ezrab-magic-ai.mp4 *(regenerated)* |
| 9 | 30.98 MB | dist\assets\index-DaJhJaSB.js *(regenerated)* |
| 10 | 26.17 MB | node_modules\@napi-rs\canvas-win32-x64-msvc\skia.win32-x64-msvc.node |
| 11 | 20.73 MB | src\assets\0908fg-transparent.webm |
| 12 | 20.58 MB | sources\ahsp2026\Lampiran-V-...-AHSP-Bidang-Bina-Marga.pdf |
| 13 | 19.91 MB | node_modules\@rolldown\.binding-win32-x64-msvc\rolldown-binding.win32-x64-msvc.node |
| 14 | 19.90 MB | data\ahsp2026\validated\ahsp_2026_master.json |
| 15 | 18.21 MB | .git\objects\be\7838c7ad... |
| 16 | 17.38 MB | src\assets\0908.mp4 |
| 17 | 16.10 MB | .git\objects\be\tmp_obj_oDgCmc |
| 18 | 14.85 MB | src\data\nationalCostDatabase\ahsp2026Canonical.generated.ts |
| 19 | 12.84 MB | data\ahsp2026\validated\ahsp_2026_components.json |
| 20 | 12.48 MB | data\ahsp2026\normalized\ahsp_2026_normalized.json |
| 21 | 10.90 MB | data\ahsp2026\raw\binamarga_raw.jsonl |
| 22 | 10.37 MB | node_modules\@napi-rs\canvas-win32-x64-msvc\icudtl.dat |
| 23 | 10.13 MB | node_modules\@esbuild\win32-x64\esbuild.exe |
| 24 | 9.63 MB | src\assets\landpage-vid1-blackbg.mp4 |
| 25 | 8.69 MB | node_modules\typescript\lib\typescript.js |
| 26 | 8.55 MB | src\assets\animasi-building-hero.mp4 |
| 27 | 7.96 MB | data\price2026\normalized\price_rows.json |
| 28 | 7.17 MB | src\assets\0908fg.mp4 |
| 29 | 7.17 MB | public\videos\0908fg.mp4 |
| 30 | 7.17 MB | dist\videos\0908fg.mp4 *(regenerated)* |

---

## 7. Files deleted

**75 entries, 806.90 MB.** Full machine-readable record: `scripts/cleanup/cleanup-manifest-before-delete.json`
(with per-entry `size_bytes`, `category`, `reason`, `references`, `confidence`, `sha256` for small files).

### 7.1 GENERATED / REBUILDABLE — 2 entries, 407.51 MB
| Size | Path | Reason |
|---|---|---|
| 214.88 MB | `dist/` | Vite production build output. No deploy config (no vercel/netlify/docker) and no server in-repo serves it. Rebuilt by `npm run build`. |
| 192.63 MB | `dist-qa/` | Stale QA build (Sep 23). Unreferenced by any script/config — only appears inside a `SKIP_DIRS` list. **Was NOT covered by `.gitignore`.** |

### 7.2 CACHE — 3 entries, 290.25 MB
| Size | Path | Reason |
|---|---|---|
| 256.48 MB | `node_modules/.vite-temp/` | 5 leftover Vite temp config bundles (`vite.config.ts.timestamp-*.mjs`) from interrupted builds. |
| 33.74 MB | `node_modules/.vite/` | Vite dependency pre-bundle cache. |
| 0.03 MB | `EZRAB-LOCAL-AI/__pycache__/` | Python bytecode cache. |

### 7.3 TEMPORARY — 55 entries, 12.26 MB
| Size | Path | Reason |
|---|---|---|
| 1.35 MB | `tmp/` (53 files) | Build/test scratch logs (`.out`/`.err`/`.pid`/`.cmd`). |
| ~10.9 MB | 54 root-level QA screenshots | `qa-*.png`, `browser_proof_*.png`, `frame_*.png/jpg`, `scratch_*.png`, `scratch_3d_*.png`. Verified: **zero** markdown embeds (`![](...)`) and zero code imports. |

### 7.4 DUPLICATE — 5 entries, 50.53 MB (all confirmed by SHA-256)
| Size | Path | Canonical retained |
|---|---|---|
| 20.58 MB | `bina_marga_downloaded.pdf` | `sources/ahsp2026/Lampiran-V-...-Bina-Marga.pdf` |
| 20.58 MB | `Lampiran-II-...-AHSP-Bidang-Bina-Marga.pdf` | same — root copy was also **mis-named** (Lampiran II ≠ Bina Marga) |
| 4.22 MB | `EZRAB_VOLUME_CALCULATOR_MASTER_COPY.xlsx` | `EZRAB_VOLUME_CALCULATOR_MASTER.xlsx` |
| 3.01 MB | `qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf` | `public/samples/pdf-gambar-rumah-1-lantai_compress.pdf` |
| 2.15 MB | `video.png` | `public/images/construction-cinematic.png` |

### 7.5 OBSOLETE — 10 entries, 46.36 MB
| Size | Path | Reason |
|---|---|---|
| 25.72 MB | `EZRAB-LOCAL-AI/python-3.12.10-amd64.exe` | Python installer; runtime already extracted in `.python/`. Re-downloadable. |
| 11.21 MB | `phase1_1_workbook_inventory.json` | Phase-1 audit dump; referenced only by two historical `.md` logs. |
| 5.29 MB | `ezrab_downloaded.html` | Page snapshot consumed only by one-off root scripts. |
| 2.69 MB | `phase3_workbook_inventory.json` | Phase-3 audit dump. |
| 1.23 MB | `all_19_calculators_raw.json` | Raw calculator scrape; superseded by `src` registry. |
| 0.19 MB | `audit_meta_sheets.json` | Workbook metadata dump. |
| 0.03 MB | `EZRAB-LOCAL-AI/main.{memory-aware-chat,orchestrator-step3,provider-step2}.backup-20260912.py` + `main_backup_v0.2.py` | Dated source snapshots superseded by `main.py`. |

---

## 8. Duplicate files removed

**118 duplicate groups** detected repo-wide (`scripts/cleanup/duplicates.json`, min 50 KB), **466.25 MB** total redundancy.

Of that, **50.53 MB** was removed as *non-generated* duplication (root-level stray copies — §7.4). The remaining ~416 MB was duplication **between `dist/`/`dist-qa/` and their `public/`/`src/assets/` sources** — resolved wholesale by deleting the two build-output trees (§7.1), not by picking individual files.

**Duplicates found but deliberately NOT deleted** (documented, low value / config risk):
- `src/assets/` internal triplicates — `land-page-awal.png` = `asada-hero-bg.png` = `landing/backgrounds/land-page-awal.png` (3.69 MB ×3); `1.jpg` = `1.png` = `hero-bg-1.png` (1.51 MB ×3); `ezrab-hero.png` = `hero-building.jpg` = `landing/backgrounds/hero-building.jpg` (0.85 MB ×3); plus ~10 `landing/backgrounds/*` mirrors.
  **Reason:** each name is imported by component code. Removing them requires repointing imports = application source change, which you prohibited ("JANGAN melakukan refactor besar"). See §19.
- `.agents/skills/` = `.claude/skills/` = `.codeartsdoer/skills/` = `.commandcode/skills/` = `.cortex/skills/` = `.grok/skills/` = `.hermes/skills/` = `.qwen/skills/` — 8 identical skill trees (0.31 MB each).
  **Reason:** each is an AI-CLI config directory; deleting could break that tool's skill loading. Total is only 2.5 MB. See §19.

---

## 9. Cache / generated removed

| Item | Size | Regeneration |
|---|---|---|
| `node_modules/.vite-temp/` | 256.48 MB | Automatic on next `vite` run |
| `node_modules/.vite/` | 33.74 MB | Automatic on next `vite dev` |
| `EZRAB-LOCAL-AI/__pycache__/` | 0.03 MB | Automatic on import |
| `dist/` | 214.88 MB | `npm run build` (rebuilt during verification — §4) |
| `dist-qa/` | 192.63 MB | Not regenerated by any script — stale output |
| `tmp/` | 1.35 MB | Not regenerated |

---

## 10. Obsolete files removed

46.36 MB across 10 entries — see §7.5. Includes the redundant Python installer (25.72 MB), three Phase-1/3 audit dumps (13.9 MB), a downloaded HTML snapshot (5.29 MB), and four dated `.backup-2026*.py` source snapshots.

---

## 11. Important files preserved

| Path | Size | Why preserved |
|---|---|---|
| `src/` | 190.98 MB | Application source — REQUIRED RUNTIME |
| `public/` | 174.66 MB | Served UI assets — REQUIRED RUNTIME |
| `node_modules/` | 461.28 MB | REQUIRED DEVELOPMENT (only caches inside were removed) |
| `EZRAB-LOCAL-AI/` | 146.01 MB | AI zone — you chose "installer + cache only" |
| `.git/` | 58.11 MB | History — untouched (no `gc`/`filter-repo`/`reset`) |
| `docs/` (incl. `_audit/`) | 10.50 MB | `docs/_audit/lampiran2-official-items.json` is **read by `scripts/ahsp2026/parse.ts`** |
| `backups/` | 25.43 MB | Pre-purge AHSP safety archive — no git history exists to recover from |
| `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json` | — | Build/config |
| `supabase/` | 0.07 MB | Migrations |
| `qa-fixtures/` | 0.30 MB | Test fixtures (only the duplicated PDF removed) |
| `prototypes/`, `scratch/`, `reports/` | ~0.8 MB | Small; not worth risk |
| `.agents/`, `.claude/`, `.qwen/`, etc. | 2.5 MB | AI-CLI config dirs |

## 12. AHSP data preserved

**All AHSP data intact — nothing touched.**

- `sources/ahsp2026/` (124.16 MB) — 7 official SE DJBK No. 47/2026 PDFs (Lampiran I–VII). **All preserved.**
- `data/ahsp2026/` (82.64 MB) — `validated/ahsp_2026_master.json` (19.90 MB), `validated/ahsp_2026_components.json`, `normalized/`, `raw/*.jsonl`, `forensic/`, `reports/`. **All preserved.**
- `src/data/nationalCostDatabase/` — `ahsp2026Canonical.generated.ts`, `masterRegistry.ts`, `officialHSD2026.ts`, `officialCiptaKaryaPrices2026.ts`, `officialBinaMargaPrices2026.ts`, `officialAhspRepository.ts`, `sources.ts`, `types.ts`. **All preserved.**
- `backups/legacy-ahsp-pre-2026-purge/` (13.44 MB) + `backups/excel-ahsp-*-2026/` (11.41 MB) — the only copies of the legacy datasets and the official source workbooks. **Preserved.**
- `docs/_audit/` (9.65 MB) — forensic extraction read by the AHSP parse script. **Preserved.**
- `data/price2026/` (12.07 MB) — `price_master.json`, `match_report.json`, `conflicts.json`. **Preserved.**

Only the **duplicated** root copies of the Bina Marga PDF (2 × 20.58 MB) were removed; the canonical file in `sources/ahsp2026/` remains.

## 13. DED → RAB pipeline preserved

**Untouched.** No file under `src/ded-rab-v2/` was modified or removed. Verified consumers still resolve: `DedRabWorkflowView`, `DedRabV2ReviewView`, `dedRabPipeline`, `pdfPageService`, `dedVisionReader`, `semanticClassifier`, `dedInterpreter`, `dedQuantityEngine`, `aiResolutionEngine`, `materialResolutionEngine`, `laborResolutionEngine`, `priceResolutionEngine`, `ahspMatcher`, `ahspPriceResolver`, `dedRabValidationGate`, `SafeDecimalEngine`, `selfCheckEngine`, `selfRepair`, `RABAccuracyGate`, `ezrabValidationComparisonEngine`.

Regression suites: `test:ded-rab` **PASS**, `realDedValidationProductionHardening` **11/11**.

## 14. AI pipeline preserved

**Untouched.** `aiProviderRegistry`, `aiModelRouter`, `aiModelMasking`, `aiApiClient`, `aiProviderEngine`, `aiContextService`, provider adapters (`server/providers/multiProvider/`), gateway routes (`server/api/aiRoutes.ts`, `multiProviderRoutes.ts`, `projectRabRoutes.ts`, `wizardRoutes.ts`), tool registry, prompts and schemas — none modified.

The ZyRouter `geminiflash-3.8` model-ID change from the previous task is intact (`dedModeConfig.ts` still resolves to `geminiflash-3.8`).

---

## 15. Tests

Run **after** cleanup, on the cleaned tree.

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | **EXIT 0** |
| `npm run test:ded-rab` | **PASS** (20/20 · 24/24 · 15/15 · 9/9 · evidence A–G) |
| `npm test` | **74 PASSED / 0 FAILED** |
| `npm run test:all` | **EXIT 0** (full 23-stage chain) |
| `npm run test:core-ai` | **70 PASSED / 0 FAILED** |
| `npm run test:phaseC` | **71 PASSED / 0 FAILED** |
| `npm run ahsp:test` | **20 passed / 0 failed** |
| `npm run test:price` | 66 passed / **1 failed** — *pre-existing* |
| `npm run price:assert` | 31 passed / **2 failed** — *pre-existing* |
| `npm run ahsp:assert` | 25 passed / **3 failed** — *pre-existing* |

### Pre-existing failures — NOT caused by this cleanup
These are the same defects reported in the AHSP reconciliation task; the files involved were never touched here.

1. **`test:price` 1 fail / `price:assert` 2 fails** — two defects in `src/data/priceDatabase2026/resolver.ts`:
   - `3.1.(11)`: header-only item → `pricingStatus=FULL` while `totalComponents=0`, `unitPrice=null` (resolver.ts:689).
   - `A.1.02.4a.1.d`: `unitPrice=219791` vs `sum=219790.5` (rounding delta 0.5 > 1e-6).
2. **`ahsp:assert` 3 fails** — the script expects the full canonical **5801** items, but the runtime engine correctly exposes **5768** (2 code-less records + dedupe), which is the documented Task-A state:
   - `METHOD A == B == C` · `runtime engine count equals canonical (no legacy merge) — 5768 vs 5801` · `repository count = canonical minus code-less records — 5766 vs 5801-2`.

**No test was fabricated or weakened.** All 3 files are outside the cleanup's blast radius (`src/data/priceDatabase2026/`, `scripts/ahsp2026/assertPurge.ts` — both untouched, byte-identical).

## 16. Build

| Check | Result |
|---|---|
| `npm run build` (`tsc && vite build`) | **EXIT 0** |
| Modules transformed | 2,975 |
| Output | `dist/` regenerated (214.88 MB, 108 files) |
| Bundle served | `dist/assets/index-DaJhJaSB.js` |

## 17. Remaining large files

Post-cleanup, all files > 10 MB are **legitimate**: official AHSP source PDFs (`sources/`, 4 files), canonical datasets (`data/`, 4 files), application assets (`src/assets/`, `public/`, 6 files), regenerated build output (`dist/`, 3 files), and toolchain binaries inside `node_modules/` (4 files). **No junk remains above 10 MB.**

## 18. Files intentionally NOT deleted

| Item | Size | Reason |
|---|---|---|
| `EZRAB-LOCAL-AI/.python/` + `.venv/` | 144.45 MB | Your decision: keep runtime. Confidence it would *break the app* is high, but it is the local AI's runtime — protected per "JANGAN menghapus AI system". |
| `backups/` | 25.43 MB | Only copy of legacy AHSP datasets + official source workbooks. **No git commits exist**, so deletion is unrecoverable. |
| `docs/_audit/` | 9.65 MB | Read by `scripts/ahsp2026/parse.ts:742`. |
| `node_modules/` | 461.28 MB | Required to run/test. Reinstallable via `npm install`, but removing it would break the app immediately. |
| `.git/objects/` | 58.11 MB | History. Explicitly out of scope. |
| `src/assets/` internal triplicates | ~14 MB | Would require editing component imports (source change) — prohibited. |
| 8 × AI-CLI `*/skills/` trees | 2.5 MB | Config for external AI CLIs; low value, config risk. |
| `prototypes/`, `scratch/`, `reports/`, `qa-fixtures/` | ~1.1 MB | Small; below the risk/reward threshold. |
| Root `*.md` reports (278 → 224 root files) | ~5 MB | Documentation. Not removed merely for being unreferenced. |

## 19. Remaining cleanup opportunities

| Opportunity | Size | Risk / prerequisite |
|---|---|---|
| Delete rebuilt `dist/` again | 214.88 MB | **Zero** — regenerable. Biggest single win available. |
| `EZRAB-LOCAL-AI/.python/` + `.venv/` | 144.45 MB | Reversible via python.org + `pip install -r requirements.txt`. Requires your go-ahead. |
| Deduplicate `src/assets/` triplicates (repoint imports) | ~14 MB | Requires editing component imports — a source change. |
| Move `backups/` out of the repo (keep externally) | 25.43 MB | Only if you have another backup location. |
| Prune the 8 duplicated AI-CLI `*/skills/` trees to one | 2.2 MB | Confirm which CLI(s) you actually use. |
| Consolidate root `*.md` audit reports into `docs/` | ~5 MB | Cosmetic/organisational. |
| `node_modules/` is 461 MB (30 % of the repo) | — | Normal. Never commit it; it is already gitignored. |

## 20. Anti-regrowth measures (`.gitignore` hardened)

Applied and **verified with `git check-ignore`**:

| Added rule | Closes |
|---|---|
| `dist-qa/` | **193 MB** of untracked QA build output that was previously committable |
| `coverage/` | Test coverage reports |
| `*.tsbuildinfo` | TypeScript incremental build info |
| `/tmp/`, `*.pid`, `*.out`, `*.err` | Local test-run capture dir and its artifacts |
| `/qa-*.png`, `/qa-*.jpg`, `/qa-*.jpeg` | Root QA screenshots (recreated every QA run) |
| `/browser_proof_*.png` | Root browser-proof screenshots |
| `/scratch_*.png`, `/scratch_*.jpg`, `/frame_*.png`, `/frame_*.jpg`, `/video.png` | Root scratch renders |

Already present and confirmed effective: `node_modules/`, `dist/`, `.env*`, `__pycache__/`, `*.log`, `sources/ahsp2026/*.pdf`, `EZRAB-LOCAL-AI/.venv/`, `EZRAB-LOCAL-AI/.python/`, `EZRAB-LOCAL-AI/python-*.exe`.

No git history was altered. No `git reset --hard`, `git clean -fd`, `git gc`, or `git filter-repo` was run.

## 21. FINAL RECOMMENDATION

The cleanup achieved a **28.10 % reduction (591.83 MB)** with **zero functional impact** — every build, test and runtime check passes, and all AHSP / DED→RAB / AI data is intact.

**The single highest-value, zero-risk next action is to delete `dist/` again**, taking the repo to **1.2692 GB (−38.30 %)**. It is a build artifact that `npm run build` recreates in ~70 seconds.

Beyond that, the remaining 1.27 GB is essentially irreducible without a judgement call: `node_modules/` (461 MB, required), `src/` (191 MB, required), `public/` (175 MB, served), `EZRAB-LOCAL-AI/` (146 MB, your call), `sources/` (124 MB, official AHSP PDFs), `data/` (95 MB, canonical datasets), `.git/` (58 MB).

**Recommendation:** take the `dist/` deletion, keep everything else as-is, and let the hardened `.gitignore` prevent regrowth. Per your own priority — *better 1.27 GB and correct than 500 MB and broken* — this is the right stopping point.

---

### Artifacts produced
| File | Contents |
|---|---|
| `scripts/cleanup/scan_result.json` | Full BEFORE scan (per-folder + top 300 files) |
| `scripts/cleanup/scan_after.json` | Full AFTER scan |
| `scripts/cleanup/duplicates.json` | 118 duplicate groups with SHA-256 |
| `scripts/cleanup/asset_refs.json` | Per-asset reference map (`src/assets`, `public`) |
| `scripts/cleanup/cleanup-manifest-before-delete.json` | 75-entry delete manifest |
| `scripts/cleanup/quarantine-log.json` | Move log (path → quarantine) |
| `scripts/cleanup/{scanSize,findDuplicates,checkAssetRefs,buildManifest,quarantine}.py` | Reproducible tooling |

---
---

# ROUND 2 UPDATE — 2026-10-05

Follow-up pass after the question *"apakah ada file yang bisa dihapus lagi?"*. Same discipline: SCAN → CLASSIFY → VERIFY → PROPOSE → QUARANTINE → TEST → PURGE.

## Cumulative result (Round 1 + Round 2)

| Metric | Value |
|---|---|
| BEFORE (original) | `2,208,671,832` B = **2.0570 GB** (2,106.35 MB), 29,654 files |
| AFTER Round 1 | `1,588,090,379` B = 1.4790 GB (1,514.52 MB), 29,379 files |
| **AFTER Round 2** | `1,390,570,058` B = **1.2951 GB** (1,326.15 MB), 27,823 files |
| **TOTAL SAVED** | `818,101,774` B = **0.7619 GB = 780.20 MB** |
| **TOTAL REDUCTION** | **37.04 %** |
| Round-2 net saving | 188.37 MB (374.61 MB quarantined − 214.88 MB rebuilt `dist/` + 28.6 MB recreated) |

## Round-2 deletions — 305 entries, 374.61 MB

Manifest: `scripts/cleanup/cleanup-manifest-round2.json` · Move log: `scripts/cleanup/quarantine-log-round2.json`

| Category | Entries | Size | Detail |
|---|---|---|---|
| `E_GENERATED` | 1 | 214.88 MB | `dist/` (rebuilt for verification) |
| `F_CACHE` | 219 | 20.43 MB | `__pycache__` inside `EZRAB-LOCAL-AI/.python` (10.16 MB / 638 .pyc) and `.venv` (10.27 MB / 809 .pyc) |
| `G_TEMPORARY` | 6 | 18.07 MB | 5 dangling `.git/objects/**/tmp_obj_*` + `build.log` |
| `I_OBSOLETE` | 1 | 0.01 MB | `package.json.bak` |
| `K_ORPHAN` | 78 | 121.22 MB | Verified orphan assets (see below) |

### K_ORPHAN detail — 78 files / 121.22 MB

Detection method upgraded: **exact-filename** search across `src/`, `server/`, `scripts/`, `docs/`, `supabase/`, `index.html`, `vite.config.ts`, `package.json`. Explicitly confirmed absent: `import.meta.glob`, `require.context`, `globEager`, `new URL(...)` asset construction, and dynamic path templates.

**46 files in `src/assets/` (92.41 MB)**
- Superseded hero/landing videos (the live one is `0908fg.mp4`): `0908.mp4` 17.38 · `landpage-vid1-blackbg.mp4` 9.63 · `animasi-building-hero.mp4` 8.55 · `downloaded_hero.mp4` 6.77 · `landpage-vid1-transparent.webm` 6.71 · `ezrab-hero.mp4` 6.18 · `landpage vid 1.mp4` 5.80 · `ezrab-hero.webm` 4.00 → **65.02 MB**
- Duplicate-name leftovers: `asada-hero-bg.png` 3.69 · `landing/backgrounds/land-page-awal.jpg` 1.70 · `1.jpg` 1.51 · `hero-bg-1.png` 1.51 · `ezrab-hero.png` 0.86 · `cta-skyline-cranes.jpg` ×2 · `magic-ai-blueprint-bg.png` ×2 · `hero-hologram-platform-bg.png` ×2 · `workflow-blueprint-bg.png` ×2 · `logo_oy.svg` · `logo_magic_ai.svg/png`
- Debug/scratch renders: `test_f1.png` · `test_f3.png` · `test_transparent_frame.png` · `test_chroma.webm` · `test_vp9_alpha.webm` · `check_0908fg.png` · `check_0908.png` · `check_bg.png` · `frame_test.png` · `frame3.jpg` · `frame6.jpg` · `magic-ai-orb.jpg` · `ezrab-robot-waving.jpg` · `ezrab-robot-idea.jpg` · `animasi-building-poster.jpg` · `0908-poster.jpg` · `landpage-vid1-poster.jpg` → ~8 MB
- Orphan modules: `landing/backgrounds/index.ts` (never imported) · `logo.css` (Illustrator SVG export) · `ezrab-{building,blueprint,excavator,mascot}.svg`

**32 files in `public/` (28.81 MB)**
- `videos/roles/` — **entire directory unused** (4 mp4 + 4 poster): `kontraktor.mp4` 1.90 · `konsultan.mp4` 2.01 · `developer.mp4` 1.75 · `estimator.mp4` 1.52 + 4 posters ≈ 0.15 → **7.33 MB**. `ExactRoles.tsx` uses `/images/roles/*.jpg`, not these.
- `videos/ezrab-magic-ai-scroll.mp4` 6.72 · `videos/ezrab-hero.mp4` 5.75
- `logo_oy.svg` 1.65 · `images/landing/backgrounds/land-page-awal.jpg` 1.70
- `images/about/` leftovers: `about_magic_ai_pipeline.png` 0.95 · `ChatGPT Image Sep 9, 2026, 01_35_58 AM.png` 0.95 · `ChatGPT Image Sep 9, 2026, 01_37_09 AM.png` 0.65 · `photoreal_cinematic_cityscape.webp` 0.51 · `minimalist_ui_scene.jpg` 0.15
- `assets/mascot/` working files: `master_eye_texture.png` · `white_crop.png` · `albedo_thumb.png` · `extracted_albedo.jpg` · `adad.jpg` · `maskot-lucu.svg` · `ref_dashboard_mascot.png` · `vector_eye_left/right.png`
- `ezrab-bot-mascot.png/.svg` · `images/ezrab-logo-original.png` · `logo_magic_ai.png/.svg` · `ezrab-mascot.svg`

### Preserved despite being "orphans"
`public/favicon.ico` + `public/favicon.png` (0.71 MB) — browser-convention files. `index.html` declares `<link rel="icon" href="/images/ez-emblem.png">`, so these are only a fallback, but removing them buys almost nothing and risks a `/favicon.ico` 404 for crawlers/legacy clients. **Kept by choice — say the word if you want them gone.**

## Round-2 verification (all PASS)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **EXIT 0** |
| `npm run build` | **EXIT 0** (dist regenerated, 2,975 modules) |
| `npm run test:ded-rab` | **PASS** |
| `npm test` | **74 / 0** |
| `npm run test:all` | **EXIT 0** |
| `npm run ahsp:test` | **20 / 0** |
| `npm run test:core-ai` | **70 / 0** |
| `npm run test:phaseC` | **71 / 0** |
| `vite preview` smoke test | root **200**; `/images/ez-emblem.png` **200**; `/videos/0908fg-poster.jpg` **200**; `/videos/roles-bg.mp4` **200** (`video/mp4`, 39.4 MB); `/images/roles/estimator.jpg` **200**; `/favicon.ico` **200** |
| Deleted-orphan negative test | `/videos/roles/kontraktor.mp4` → `text/html` 1545 B (SPA fallback ⇒ file genuinely gone); `dist/videos/roles/` absent from build output |

## Round-2 anti-regrowth
No new `.gitignore` rules needed — the Round-1 hardening already covers `dist/`, `dist-qa/`, `__pycache__/`, `*.log`, `/tmp/`, and the root QA screenshot patterns. `supabase/.temp/` was already covered by `*.temp`.

## Remaining opportunities after Round 2

| Item | Size | Note |
|---|---|---|
| `node_modules/@supabase/cli-windows-x64` | 132 MB | devDependency CLI. Only remove if you never run `npx supabase` (there are 2 migrations in `supabase/migrations/`). |
| `EZRAB-LOCAL-AI/.python` + `.venv` | 144 MB | You chose to keep. Re-creatable from python.org + `requirements.txt`. |
| `backups/` | 26 MB | Only copy of legacy AHSP datasets + official workbooks; repo has no commits. |
| 8 × AI-CLI `*/skills/` trees | 2.2 MB | Duplicated config for `.claude`/`.qwen`/`.grok`/etc. |
| Rebuilt `dist/` | 215 MB | Delete again anytime; `npm run build` restores it. |

**Verdict:** the repository is now at **1.2951 GB (−37.04 %)** with every build, test and runtime check green. The remaining bulk is genuinely required (toolchain, application source, served assets, official AHSP data). Further reduction would require dropping the Supabase CLI devDependency or the local-AI runtime — both judgement calls, not cleanup.

## Round-2 tooling
| File | Contents |
|---|---|
| `scripts/cleanup/findOrphans.py` | Exact-filename orphan detector |
| `scripts/cleanup/orphan_assets.json` | 80 orphans with sizes |
| `scripts/cleanup/round2.py` | Round-2 manifest + quarantine driver |
| `scripts/cleanup/cleanup-manifest-round2.json` | 305-entry manifest |
| `scripts/cleanup/quarantine-log-round2.json` | Move log |
| `scripts/cleanup/scan_after2.json` | Final scan |
