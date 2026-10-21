# EZRAB — BENCHMARK PROTOCOL: DED/RAB (Gelombang B — Persiapan Read-Only)

**Status: NOT_RUN — BLOCKED_INPUT.** Protokol siap; eksekusi menunggu fixture.

## Fixture (blocker)
- Dibutuhkan: PDF DED asli kasus "jembot" (32 halaman) yang sama persis dengan run historis (14 item / 6 valid / 8 blokir / Rp14.312.000 versi EZRAB; ±Rp148 jt versi Gemini — angka historis **tak terverifikasi**, bukan target dan bukan sumber kebenaran).
- File tidak ada di repo (terverifikasi). Owner memasok file → status berubah READY.
- Fixture yang sama dipakai untuk semua lengan uji; tidak ada penyesuaian input per lengan.

## Lengan uji
1. **Gemini Flash (baseline eksternal)** — unggah PDF yang sama, prompt netral satu kali + satu kali pengulangan untuk varians. Output Gemini TIDAK PERNAH menjadi sumber kebenaran harga/kuantitas; ia pembanding kelengkapan saja.
2. **EZRAB DED Cepat (Flow A + Flow B FAST)** — build yang sama, mode Cepat.
3. **EZRAB DED Mendalam (Flow B DETAIL + Flow A DETAIL)** — mode Mendalam.

## Dimensi perbandingan (per lengan)
- Kelengkapan WBS per kategori (struktur, arsitektur, MEP, kusen, plafon, finishing, eksternal) — item ditemukan / item seharusnya (penilaian manual terhadap gambar).
- Volume & satuan per item (benar / salah satuan / null / diblokir + alasan).
- Ketersediaan AHSP & provenans harga (resmi / estimasi AI berlabel / unresolved) — DED EZRAB by design hard-isolation dari AHSP; catat apa adanya.
- Item terblokir + kualitas alasan blokir (apakah `blockingReason` tampil ke user — temuan DED-UX).
- Total per lengan + selisih antar-lengan (dilaporkan, bukan dinilai menang/kalah dari total saja).
- Waktu respons, jumlah panggilan provider, kegagalan provider/timeout.
- Untuk EZRAB: apakah DED-1/DED-2 (pasca-commit `5a2d270`) terbukti tertutup — jumlah halaman terproses per pageType, jumlah pass, item per pass.

## Kriteria terima Gelombang B (dari Fase 2.8 program)
- Tidak ada item valid yang hilang senyap: setiap item gambar yang tidak terhitung tercatat sebagai terblokir + alasan tampil.
- Tidak ada harga karangan: semua harga berprovenans; unresolved tetap null.
- Mendalam ≥ Cepat dalam kelengkapan WBS pada fixture yang sama.
- Hasil ditulis ke dokumen ini sebagai tabel hasil + status per temuan DED-1…DED-7 (CONFIRMED tertutup / masih terbuka).

## Inventaris engine yang diaudit (terverifikasi ada, 2026-10-21)
- Flow A: `src/ai-tools/ded-ai-estimate/service.ts`
- Pipeline estimasi: `src/ai-estimate/` (`aiEstimatePipeline.ts`, `quantitySanityGate.ts`, `aiEstimateCalculator.ts` — SafeDecimal)
- v2: `src/ded-rab-v2/` (`ahsp/ahspPriceResolver.ts`, `pipeline/dedRabGenerator.ts`)
- v3: `src/ded-rab-v3/ahsp/dedUnitSafetyGate.ts`
- Services: `dedAhspMatchingEngine.ts`, `dedQtoCalculationEngine.ts`, `dedToRabPipelineService.ts`, `dedAnalysisPersistenceService.ts`, `dedEvidenceStore.ts`, `dedWorkItemStore.ts`
- Normalisasi satuan: `src/data/priceDatabase2026/normalize.ts` + `resolver.ts`; `src/engine/ahsp/normalization/ahspNormalization.ts`
- Model gateway (dari kode): gemini-3.5-flash-lite, gemini-3.8-flash, DeepSeek-V4-Flash-0731 (Dahl), DeepSeek-V4.1-Flash (River), Nemotron-3.5-Super-VL (River); tarif di `providerTariffs.js` (3 model, semua null — CR-01).
