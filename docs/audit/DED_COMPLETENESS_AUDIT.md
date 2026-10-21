# AUDIT KELENGKAPAN DED ESTIMATE AI — kasus "jembot" (14 item, 6 valid, 8 diblokir, Rp14.312.000)

Tanggal: 2026-10-21 · Read-only (tidak ada file diubah oleh audit ini) · Klaim kunci diverifikasi ulang manual oleh reviewer (service.ts:238/261-267/295, aiEstimatePipeline.ts:15-21/348).

## Fakta dasar
- String `jembot` tidak ada di repo → tidak ada artefak/fixture tersimpan; angka 14/6/8 tidak dapat direproduksi persis (NOT_VERIFIED per-run), tetapi semua mekanisme penyebabnya terpetakan.
- Ada DUA flow DED produksi, keduanya default FAST:
  - Flow A — menu 'ded-ai': `src/ai-tools/ded-ai-estimate/` (`DedAiEstimateService`). Status UI: `blocked := quantity == null`.
  - Flow B — menu 'magic-ai' (Analisis DED): `aiEstimatePipeline.ts` + engine `src/ded-rab-v3/*`.

## Root cause teranking
1. **Budget konteks memotong DED (TINGGI).** Flow A: teks saja (`withImages:false`), cap `MAX_PROMPT_CHARS=15000`, `MAX_PAGE_TEXT=2000`, loop break → hanya ±8 dari 32 halaman sampai ke model. Flow B FAST: maks 8 halaman vision (`keyPages.length >= 8 break`), kata kunci halaman kunci tanpa MEP/kusen/plafon/sanitair/listrik.
2. **Cap output satu panggilan (TINGGI).** FAST `maxTokens 4000` (kedua flow; Flow B inventaris bahkan default 4000) → ±10–16 item muat secara fisik; tanpa pass per kategori. Angka 14 sangat konsisten dengan cap ini.
3. **Jalur kuantitas rapuh → null (TINGGI).** Flow A: `ambiguousUnit` (dimensi tanpa penanda satuan — teks CAD nyaris selalu begitu) menimpa angka model → quantity null; skema FAST tidak punya `quantitySource`. Flow B: resolver kata-kunci tanpa cabang pipa/kran/septic tank/lisplank/talang/wastafel/bak kontrol (grep = 0) → item plumbing dijamin unresolved; fallthrough unresolved.
4. **Ekstraksi halaman gagal senyap (SEDANG, Flow B DETAIL).** Error/timeout per halaman → fallback teks tanpa dimensi/ruangan → metrik bangunan runtuh → formula geometri null berantai.
5. **Harga satu panggilan tanpa fallback (SEDANG).** Item tak terjawab → PRICE_UNRESOLVED → keluar dari total (menjelaskan total kecil).
6. Gate bentuk-satuan Flow A / gate katastrofik Flow B (RENDAH–SEDANG). 7. Dedup Flow B (RENDAH).
- **BUKAN penyebab: mapping AHSP.** Kedua flow secara desain TIDAK memanggil AHSP matcher/resolver (header file eksplisit; "HARD ISOLATION" di Flow A). Engine AHSP v3 ada (`ded-rab-v3/ahsp/*`) tetapi hanya terhubung ke `fullAiDedRabPipeline` yang tak terjangkau UI produksi. Semua harga di kedua flow = estimasi AI berlabel.

## Temuan pendukung
- Prompt Flow A tanpa checklist WBS/kuota kategori; `wbsCatalog/wbsClassifier/categorySpecs` = dead code.
- Flow B: `blockingReason` tidak pernah dirender di DedAnalysisDashboard (grep 0) → item gagal tanpa alasan/aksi (melanggar kebutuhan UX §4 brief). Flow A lebih baik (quantityNote + Isi Cepat), tetapi item REJECTED gate satuan tampil sebagai valid/review (status tidak membaca `stage==='REJECTED'`).
- Total Rp14.312.000 = jumlah subtotal item lolos semua gate; bukan total proyek; Flow B tidak melabelinya parsial secara eksplisit (hanya status PRELIMINARY di summary).
- Pembanding Gemini polos membaca PDF utuh tanpa cap & bebas berasumsi → WBS lebih penuh wajar; angkanya tidak terverifikasi, bukan target.

## Rencana patch (BELUM diimplementasikan — menunggu persetujuan)
Flow A: (1) seleksi halaman berbasis pageType + budget per kategori, kirim gambar halaman kunci ke vision; (2) samakan skema FAST=DETAIL (quantitySource/sourcePages), naikkan maxTokens dan/atau multi-pass per kelompok halaman + merge; (3) `ambiguousUnit` → turunkan ke AI_INFERENCE berlabel, bukan membuang angka (MENYENTUH keputusan integritas lama — perlu persetujuan eksplisit); (4) DedAiResultView: stage REJECTED → status blocked + alasan.
Flow B: (5) perluas kata kunci halaman kunci + log halaman terlewat; (6) dedWorkInventoryEngine: maxTokens eksplisit + inventaris per kategori + merge; (7) tambah cabang plumbing/rain di dedQuantityReasoningEngine (berlabel ASSUMPTION); (8) DedAnalysisDashboard: render blockingReason + label total sementara; (9) [keputusan produk] hubungkan engine AHSP v3 sebagai tahap opsional pasca-estimasi dengan provenance terpisah.
Tes: test:ai-estimate, test:ded-rab, suite dedAi* via tsx; fixture regresi "jembot" butuh PDF asli dari user (tidak ada di repo) + satu run dengan log [AI-ESTIMATE-TRACE] untuk membuktikan peringkat #1 vs #2 secara langsung.
