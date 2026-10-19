# EZRAB — CONTROLLED COMMIT PLAN

**Tanggal:** 2026-10-19
**Branch:** `integrasi/unified-ui-engine` @ f225766
**Total:** 61 file (19 modified + 42 untracked)
**Aturan:** Tidak ada `git add .`. Staging per file/direktori yang terverifikasi.

---

## Urutan Commit (berdasarkan dependensi)

### COMMIT 1: `feat(price): integrity gates + Rp0 label fixes`
**Alasan:** Fondasi. Semua commit lain bergantung pada factory/types.

**File (14):**
```
src/types/index.ts
src/engine/rab/rabItemFactory.ts
src/calculations/decimalEngine.ts
src/components/rab/RabEstimasiView.tsx
src/components/estimator/SmartAddWorkItemModal.tsx
src/data/priceDatabase2026/ahspDisplayPolicy.ts
src/context/ProjectContext.tsx
src/test/ahspDisplayPolicy.test.ts
src/test/ahspAccuracyGolden.test.ts
src/test/rabExportIntegrity.test.ts
src/components/copilot/EstimatingCopilotPanel.tsx
src/components/magic-ai/DrawingReaderModal.tsx
src/components/ahsp/AhspExplorerView.tsx
src/components/finance/CashFlowChart.tsx
src/components/dashboard/EzrabAiDashboardView.tsx
src/ai-credits/CreditPage.tsx
```

**Perintah:**
```bash
git add src/types/index.ts \
  src/engine/rab/rabItemFactory.ts \
  src/calculations/decimalEngine.ts \
  src/components/rab/RabEstimasiView.tsx \
  src/components/estimator/SmartAddWorkItemModal.tsx \
  src/data/priceDatabase2026/ahspDisplayPolicy.ts \
  src/context/ProjectContext.tsx \
  src/test/ahspDisplayPolicy.test.ts \
  src/test/ahspAccuracyGolden.test.ts \
  src/test/rabExportIntegrity.test.ts \
  src/components/copilot/EstimatingCopilotPanel.tsx \
  src/components/magic-ai/DrawingReaderModal.tsx \
  src/components/ahsp/AhspExplorerView.tsx \
  src/components/finance/CashFlowChart.tsx \
  src/components/dashboard/EzrabAiDashboardView.tsx \
  src/ai-credits/CreditPage.tsx
```

**Verifikasi sebelum commit:**
```bash
NODE_OPTIONS="--max-old-space-size=6144" node node_modules/typescript/bin/tsc --noEmit --skipLibCheck
```

### COMMIT 2: `feat(ai-design): studio + AHSP candidate picker`
**Alasan:** Bergantung pada Commit 1 (factory, types, ProjectContext).

**File (14):**
```
src/ai-design/ (12 file)
src/test/aiDesign.test.ts
src/test/commandCenter.test.ts
src/test/designWorkflowVerify.ts
src/ai-tools/ezrab-ai/actionRegistry.ts
src/ai-tools/ezrab-ai/intentRouter.ts
src/ai-tools/ezrab-ai/view.tsx
```

**Perintah:**
```bash
git add src/ai-design/ \
  src/test/aiDesign.test.ts \
  src/test/commandCenter.test.ts \
  src/test/designWorkflowVerify.ts \
  src/ai-tools/ezrab-ai/actionRegistry.ts \
  src/ai-tools/ezrab-ai/intentRouter.ts \
  src/ai-tools/ezrab-ai/view.tsx
```

### COMMIT 3: `feat(credits): AI Credits Phase 1 + usage metering`
**Alasan:** Standalone. Tidak bergantung pada commit lain.

**File (8):**
```
api/_lib/creditEngine.js
api/_lib/creditPricing.js
api/_lib/providerTariffs.js
api/_lib/usageMeter.js
api/_lib/aiGateway.js
api/credits/
src/test/usageMeter.test.ts
src/test/aiCredits.test.ts (jika ada)
```

**Perintah:**
```bash
git add api/_lib/creditEngine.js \
  api/_lib/creditPricing.js \
  api/_lib/providerTariffs.js \
  api/_lib/usageMeter.js \
  api/_lib/aiGateway.js \
  api/credits/ \
  src/test/usageMeter.test.ts
```

### COMMIT 4: `feat(market): price intelligence + Serper`
**Alasan:** Standalone.

**File (9):**
```
src/engine/pricing/market/apiSearchProvider.ts
src/engine/pricing/market/autoEnrichment.ts
src/engine/pricing/market/packageCost.ts
src/engine/pricing/market/searchProvider.ts
src/components/ahsp/MarketReferencePanel.tsx
api/market/
api/_lib/marketSearch/
src/test/marketAutoEnrichment.test.ts
src/test/serperProvider.test.ts
docs/MARKET_SEARCH_SETUP.md
```

**Perintah:**
```bash
git add src/engine/pricing/market/ \
  src/components/ahsp/MarketReferencePanel.tsx \
  api/market/ \
  api/_lib/marketSearch/ \
  src/test/marketAutoEnrichment.test.ts \
  src/test/serperProvider.test.ts \
  docs/MARKET_SEARCH_SETUP.md
```

### COMMIT 5: `docs: audit reports + migration prep`
**Alasan:** Dokumentasi. Tidak ada dependensi kode.

**File (20):**
```
docs/AHSP_SMKK_OFFICIAL_UNIT_MAPPING.md
docs/AHSP_SOURCE_CLOSURE.md
docs/AHSP_VERIFICATION_WORKSHEET.md
docs/EZRAB_AUTONOMOUS_IMPROVEMENT_REPORT.md
docs/EZRAB_COMMIT_PREFLIGHT_REPORT.md
docs/EZRAB_DESIGN_TO_RAB_DEEP_TEST_REPORT.md
docs/EZRAB_DESIGN_WORKFLOW_COMPLETION_REPORT.md
docs/EZRAB_DESIGN_WORKFLOW_VERIFICATION_REPORT.md
docs/EZRAB_FINALIZATION_MASTER_REPORT.md
docs/EZRAB_FINAL_TEST_MATRIX.md
docs/EZRAB_FRONTEND_CORE_SPRINT_REPORT.md
docs/EZRAB_FULL_FUNCTIONAL_TEST_PLAN.md
docs/EZRAB_FULL_FUNCTIONAL_TEST_REPORT.md
docs/EZRAB_MASTER_FINAL_SPRINT_REPORT.md
docs/EZRAB_PRICE_INTEGRITY_AUDIT_REPORT.md
docs/EZRAB_QTO_AHSP_2026_MAPPING_AUDIT_REPORT.md
docs/EZRAB_RELEASE_BLOCKERS.md
docs/EZRAB_WHOLE_PRODUCT_FINAL_SPRINT.md
docs/VPS_MIGRATION_PREP.md
supabase/migrations/20261018_ai_credits_ledger.sql
supabase/migrations/20261018_market_price_references.sql (jika ada)
```

**Perintah:**
```bash
git add docs/AHSP_SMKK_OFFICIAL_UNIT_MAPPING.md \
  docs/AHSP_SOURCE_CLOSURE.md \
  docs/AHSP_VERIFICATION_WORKSHEET.md \
  docs/EZRAB_AUTONOMOUS_IMPROVEMENT_REPORT.md \
  docs/EZRAB_COMMIT_PREFLIGHT_REPORT.md \
  docs/EZRAB_DESIGN_TO_RAB_DEEP_TEST_REPORT.md \
  docs/EZRAB_DESIGN_WORKFLOW_COMPLETION_REPORT.md \
  docs/EZRAB_DESIGN_WORKFLOW_VERIFICATION_REPORT.md \
  docs/EZRAB_FINALIZATION_MASTER_REPORT.md \
  docs/EZRAB_FINAL_TEST_MATRIX.md \
  docs/EZRAB_FRONTEND_CORE_SPRINT_REPORT.md \
  docs/EZRAB_FULL_FUNCTIONAL_TEST_PLAN.md \
  docs/EZRAB_FULL_FUNCTIONAL_TEST_REPORT.md \
  docs/EZRAB_MASTER_FINAL_SPRINT_REPORT.md \
  docs/EZRAB_PRICE_INTEGRITY_AUDIT_REPORT.md \
  docs/EZRAB_QTO_AHSP_2026_MAPPING_AUDIT_REPORT.md \
  docs/EZRAB_RELEASE_BLOCKERS.md \
  docs/EZRAB_WHOLE_PRODUCT_FINAL_SPRINT.md \
  docs/VPS_MIGRATION_PREP.md \
  supabase/migrations/
```

**Catatan:** File `.audit-frag.json` — periksa isi sebelum memutuskan (kemungkinan artefak, jangan commit jika tidak jelas).

---

## Checklist Pre-Commit (wajib sebelum setiap commit)

- [ ] `git status` — pastikan hanya file yang direncanakan ter-staged
- [ ] `git diff --cached --stat` — review ringkasan
- [ ] `tsc --noEmit --skipLibCheck` — 0 error pada file yang diubah
- [ ] Tidak ada secret di diff (`git diff --cached | grep -i "sk-\|api[_-]key"`)
- [ ] Pesan commit jelas dengan prefix yang konsisten

## Risiko

| Risiko | Mitigasi |
|--------|----------|
| Commit 1 merusak channel lain | File shared sudah direview (additive only); tsc wajib sebelum commit |
| Lupa file dependensi | Ikuti urutan 1→5; jangan loncat |
| `.audit-frag.json` tidak jelas | Periksa isi dulu; jangan commit buta |

## Status Build

**BLOCKED** — vite build membutuhkan lingkungan stabil. Jangan commit dengan klaim "build lulus" sampai build berhasil dijalankan.
