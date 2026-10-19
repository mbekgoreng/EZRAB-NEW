# EZRAB PRICE INTEGRITY END-TO-END AUDIT REPORT

**Tanggal:** 2026-10-19
**Prioritas:** P0 — Data Integrity
**Baseline:** `docs/EZRAB_DESIGN_WORKFLOW_VERIFICATION_REPORT.md` (PASS WITH GAPS)
**Branch:** `integrasi/unified-ui-engine`
**Batasan dipatuhi:** tidak ada commit/push/merge/deploy/migrasi; tidak ada perubahan harga AHSP canonical; tidak ada perubahan kontrak factory.

## 1. Ringkasan Eksekutif

**Status: PASS WITH GAPS**

Audit menelusuri seluruh jalur harga dari Design Studio → factory → ProjectContext → ringkasan → ekspor. Kontrak inti **terverifikasi kuat**: `priceStatus` adalah sumber kebenaran tunggal, dan `unitPrice: 0` sebagai sentinel untuk `PRICE_UNRESOLVED` adalah perilaku factory yang disengaja (bukan pelanggaran).

**2 bug integritas ditemukan dan diperbaiki:**
1. **Label "Estimasi Parsial" tidak muncul untuk item factory** — `unpricedItemsCount` dan `calculateRabTotals` hanya memeriksa `amount == null`, padahal factory mengisi `amount: 0` untuk item unresolved. Total parsial tampil sebagai total final.
2. **SmartAddWorkItemModal mengubah null→0 dan memaksa VERIFIED** — item AHSP tanpa harga tercatat sebagai Rp0 terverifikasi.

**23/23 matriks integritas PASS** setelah perbaikan.

## 2. File dan Jalur Data yang Diaudit

| File | Peran |
|------|-------|
| `src/engine/rab/rabItemFactory.ts` | Write path resmi; `PRICE_UNRESOLVED → unitPrice 0` (sengaja) |
| `src/engine/pricing/priceStatus.ts` | `resolvePriceStatus()`: null/NaN/'' → UNRESOLVED; 0 eksplisit → RESOLVED |
| `src/engine/unifiedProjectEngine.ts` | `recalculateCostSummary()`: exclude unresolved dari total, hitung `unresolvedItems` |
| `src/calculations/decimalEngine.ts` | `calculateRabTotals()`: subtotal + `isPartial` flag |
| `src/context/ProjectContext.tsx` | `bulkAddRabItems()` → factory; `recalculateProjectSummary()` |
| `src/components/rab/RabEstimasiView.tsx` | `unpricedItemsCount` → label "Estimasi Parsial" |
| `src/components/estimator/SmartAddWorkItemModal.tsx` | Tambah item AHSP (single + bulk) |
| `src/export/excelExportEngine.ts` | Ekspor XLSX RAB; status-aware |
| `src/ai-design/designToRabBridge.ts` | Design → work items (harga selalu null) |

**Jalur data:**
```
Design Studio → spreadsheetToWorkItems() → validateWorkItemsForRab()
  → bulkAddRabItems() → createRabItemRecord() [factory: status + gates]
  → ProjectContext state → localStorage (ezrab_prod_rab_items)
  → recalculateCostSummary() [exclude unresolved]
  → UI (Estimasi Parsial label) / XLSX export
```

## 3. Tabel Consumer Harga

| Consumer | Perlakuan terhadap unresolved | Status |
|----------|-------------------------------|--------|
| `recalculateCostSummary` | Exclude dari directCost; hitung `unresolvedItems`/`unresolvedItemIds` | ✅ Benar |
| `calculateRabTotals` | **SEBELUM:** hanya `amount==null` → miss factory items. **SESUDAH:** cek `priceStatus` juga | ✅ Diperbaiki |
| `unpricedItemsCount` (RabEstimasiView) | **SEBELUM:** `amount==null` → miss. **SESUDAH:** cek `priceStatus` dulu | ✅ Diperbaiki |
| EstimatorMetrics | Tampilkan "⚠ Estimasi Parsial" jika `unpricedCount>0` | ✅ Benar (setelah fix) |
| XLSX export (excelExportEngine) | Kolom Keterangan: "HARGA BELUM TERSEDIA"; status "Belum Terverifikasi" | ✅ Benar |
| Design XLSX export | Kolom harga null + highlight kuning | ✅ Benar (13/13) |
| AI projectContext | "harga belum tersedia (BUKAN Rp0)" | ✅ Benar |
| Action "termahal" | Filter `unitPrice > 0` (exclude unresolved) | ✅ Benar |
| SmartAddWorkItemModal | **SEBELUM:** `null→0` + paksa VERIFIED. **SESUDAH:** null diteruskan, factory menentukan status | ✅ Diperbaiki |

## 4. Matriks Skenario (23/23 PASS)

| # | Skenario | Hasil |
|---|----------|-------|
| 1 | `unitPrice: null` → `PRICE_UNRESOLVED` + `NEEDS_VERIFICATION` | ✅ |
| 2 | `unitPrice: 0` eksplisit → `PRICE_RESOLVED` (nol valid) | ✅ |
| 3 | `unitPrice: NaN` → `PRICE_UNRESOLVED` | ✅ |
| 4 | Harga positif → RESOLVED, amount benar | ✅ |
| 5 | Item desain: UNRESOLVED preserved, `volumeSource: AI_GENERATED`, `ahspCode` kosong | ✅ |
| 6 | Summary: directCost exclude unresolved; `unresolvedItems`/`unresolvedItemIds` terisi | ✅ |
| 7 | `calculateRabTotals`: `isPartial=true`, `unpricedCount` benar, subtotal hanya priced | ✅ |
| 8 | Semua unresolved: `isPartial=true`, tidak ada total final palsu | ✅ |
| 9 | Legacy tanpa `priceStatus` → backward compat (dihitung) | ✅ |
| 10 | `resolvePriceStatus` unit tests (null/0/'') | ✅ |

**Metode:** Kode produksi asli di-bundle (esbuild) → dijalankan di Node → 23 assertions.

## 5. Bug yang Ditemukan dan Diperbaiki

### BUG-1: Label parsial tidak muncul untuk item factory
- **File:** `src/components/rab/RabEstimasiView.tsx` (line 561), `src/calculations/decimalEngine.ts` (line 72)
- **Penyebab:** Filter `amount == null` tidak menangkap item factory yang memiliki `amount: 0` (sentinel) dengan `priceStatus: 'PRICE_UNRESOLVED'`.
- **Dampak:** Proyek dengan item belum berharga menampilkan total tanpa label "Estimasi Parsial" — terlihat seperti total final.
- **Perbaikan:** Cek `priceStatus === 'PRICE_UNRESOLVED'` sebagai sumber kebenaran utama.
- **Verifikasi:** Matriks #7, #8 PASS.

### BUG-2: SmartAdd mengubah null→Rp0 VERIFIED
- **File:** `src/components/estimator/SmartAddWorkItemModal.tsx` (single + bulk)
- **Penyebab:** `comp.unitPrice || 0` + `verificationStatus: 'VERIFIED'` hardcoded.
- **Dampak:** Item AHSP tanpa harga tercatat sebagai Rp0 terverifikasi.
- **Perbaikan:** Teruskan null; hapus hardcoded VERIFIED; biarkan factory menentukan status.
- **Verifikasi:** tsc bersih; factory menangani null → UNRESOLVED (matriks #1).

## 6. Bukti Harga Tidak Tersedia ≠ Rp0

1. **Factory:** `resolvePriceStatus(null)` → `PRICE_UNRESOLVED`; `resolvePriceStatus(0)` → `PRICE_RESOLVED`. Nol eksplisit dibedakan dari null.
2. **Storage:** Item desain tersimpan dengan `priceStatus: 'PRICE_UNRESOLVED'`, `ahspCode: null`.
3. **Summary:** `recalculateCostSummary` mengecualikan unresolved dari `directCost`.
4. **UI:** Label "⚠ Estimasi Parsial — N item belum memiliki harga" (setelah BUG-1 diperbaiki).
5. **Ekspor:** XLSX RAB menulis "HARGA BELUM TERSEDIA"; XLSX desain menulis null + highlight kuning.
6. **AI:** Chat menampilkan "harga belum tersedia (BUKAN Rp0)".

## 7. Hasil Kalkulasi Parsial

- Campuran priced + unresolved: `directCost` = hanya priced; `unresolvedItems` = count; `isPartial` = true.
- Semua unresolved: `directCost` = 0, `grandTotal` = 0, tetapi `isPartial` = true dan `unresolvedItems` = N — tidak disajikan sebagai total final.

## 8. Hasil XLSX/CSV Readback

- **XLSX desain:** 13/13 PASS (laporan verifikasi sebelumnya).
- **XLSX RAB:** Kode audit menunjukkan status-aware (`isUnresolved` → label "HARGA BELUM TERSEDIA", status "Belum Terverifikasi"). File aktual tidak di-generate ulang sprint ini (tidak ada perubahan pada exporter).
- **CSV:** Hanya untuk spreadsheet desain; 9 baris valid (laporan verifikasi sebelumnya).

## 9. Regression

| Test | Hasil |
|------|-------|
| tsc (file diubah) | ✅ 0 error |
| Matriks integritas | ✅ 23/23 PASS |
| Unit aiDesign | ✅ 13/13 PASS (sprint sebelumnya) |
| Unit commandCenter | ✅ 8/8 PASS (sprint sebelumnya) |

## 10. Risiko Tersisa & Keputusan

| Risiko | Status |
|--------|--------|
| `unitPrice: 0` sentinel di storage | **Diterima** — kontrak factory yang disengaja; `priceStatus` adalah kebenaran |
| Sel harga XLSX RAB menulis 0 dengan label "HARGA BELUM TERSEDIA" | **Diterima** — label eksplisit; formula Excel bergantung pada nilai numerik |
| Item `amount: 0` + `PRICE_RESOLVED` (nol valid) vs `amount: 0` + `PRICE_UNRESOLVED` (sentinel) | **Ditangani** — dibedakan via `priceStatus` di semua consumer yang diperbaiki |
| Consumer display-only (`formatCurrencyIDR(unitPrice \|\| 0)`) | **GAP** — beberapa modal menampilkan Rp0 untuk unresolved tanpa label; tidak diperbaiki sprint ini (UI tidak berkaitan dengan jalur kritis) |
| Backend persistensi | **BLOCKED** — menunggu VPS (keputusan owner) |

## File Diubah Sprint Ini

| File | Perubahan |
|------|-----------|
| `src/components/rab/RabEstimasiView.tsx` | `unpricedItemsCount`: cek `priceStatus` sebagai sumber kebenaran |
| `src/calculations/decimalEngine.ts` | `calculateRabTotals`: `unpricedCount` mencakup `PRICE_UNRESOLVED` |
| `src/components/estimator/SmartAddWorkItemModal.tsx` | Jangan ubah null→0; hapus hardcoded VERIFIED (single + bulk) |
