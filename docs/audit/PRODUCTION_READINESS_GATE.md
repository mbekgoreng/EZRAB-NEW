# PRODUCTION READINESS GATE — EZRAB (diperbarui Final Verification Gate, 2026-10-20 malam)

Skala: PASS · PARTIAL · FAIL · BLOCKED · NOT_TESTED. Tidak ada PASS tanpa bukti. Repo lokal ≠ deployment aktif (lokal `dd81439` + 9 file belum commit; production berbasis promosi `870aca3`).

## Kesimpulan per dimensi (wajib terpisah)
| Dimensi | Status | Bukti / penghambat |
|---|---|---|
| **Integritas data & perhitungan RAB/AHSP** | **PARTIAL** | F-016 unit gate FIXED + VERIFIED end-to-end (scan 5.731 item: 523 harga terkoreksi, 0 naik, 471 FULL→PARTIAL; badge PARTIAL tampil jujur di UI; tes regresi TEST 15 PASS). F-018 **FIXED + VERIFIED** via generator (errata ber-sitasi sumber; regenerasi mengubah tepat 1 record; ahsp:test 21/21 termasuk Test 21). Sisa: RAB-01 (kebijakan pembulatan), TEST 3 & TEST 10 baseline masih gagal, pool PARTIAL+MISSING 2.269 item perlu review bertahap, koefisien 1440 OPEN |
| **Kejujuran AI & ketersediaan provider** | **PARTIAL** | Routing Cepat/Mendalam teruji S1–S7 PASS; fallback lokal Copilot terungkap di 100% situs produksi (enumerasi lengkap); status Settings & engine-status jujur (kontrak 3/3 PASS); gateway 502 jujur tanpa kunci. Sisa: postur token production NEEDS_ACCESS; provider live tidak dipanggil dalam gate (fetch tiruan) |
| **Keamanan deployment & API** | **PARTIAL** | Server tidak memercayai role client; engine-status tanpa bocor postur auth; CORS allowlist; 0 secret pada pemindaian. Penghambat: login OFF by design; AI_GATEWAY_TOKEN belum terverifikasi di Vercel; rotasi 8 secret belum dilakukan owner; 3 keluarga rute dev-only 404 di production (fallback klien jujur); drift `updated_at` ded_analyses |
| **Keandalan ekspor dokumen** | **PARTIAL** | Formula OOXML valid + recalc LibreOffice cocok hitungan independen (Schedule/Kurva-S/Cashflow); exportHonesty 5/5 PASS di gate ini. MS Excel: **NOT_TESTED** (tidak tersedia di environment) — risiko dialog perbaikan Excel belum tertutup bukti |
| **Kesiapan billing/monetisasi** | **BLOCKED** | Desain ledger ada (draft migrasi), implementasi RPC atomik + sweeper + rekonsiliasi + tes integrasi BELUM ada; tarif DRAFT belum dikalibrasi; keputusan harga CR-10 pending di owner. Monetisasi TIDAK boleh diaktifkan. Aman sebagai simulasi berlabel (Phase-1) |
| **Kesiapan UI/E2E & performa** | **PARTIAL (UI) / FAIL (performa)** | UI: sweep Playwright audit 0 page error; perubahan sesi ini typecheck+build bersih. E2E transaksi penuh tidak ada (login/billing nonaktif). Performa: dist 156 MB, chunk utama 3,57 MB gzip, gambar 109 MB — jauh di atas anggaran rilis; optimasi terukur belum dikerjakan. F-011 seed demo tanpa label DEMO masih terbuka (keputusan owner) |
| **Kesiapan release keseluruhan** | **NOT READY FOR PRODUCTION** — READY FOR STAGING/DEMO PUBLIK berlabel | Lihat penghambat di bawah |

## Ringkasan gate
- **PASS:** typecheck · build · test:core 74/74 · calculator golden 100% · phase2-integrity · export honesty 5/5 · routing gateway S1–S7 · kontrak engine-status 3/3 · regresi F-016 (TEST 15 + scan).
- **FAIL:** test:price exit 1 — 2 kegagalan BASELINE lama (TEST 3 RAB-01 pembulatan Rp 0,5; TEST 10 AHSP-01 invariant usang), bukan regresi sesi ini; performa bundle.
- **BLOCKED:** billing/monetisasi (implementasi ledger + keputusan CR-10); verifikasi production (token Vercel, penerapan migrasi Supabase, SHA deployment aktif) — NEEDS_ACCESS owner.
- **NOT_TESTED:** MS Excel · 28 file test vitest · provider AI live · E2E transaksi.

## Temuan P1 yang masih terbuka
SEC-01 (login OFF — by design fase demo) · SEC-03 (token gateway, NEEDS_ACCESS) · SEC-09 (market search terbuka, dorman) · CR-01 (tarif provider NULL) · CR-02 (ledger server belum dibangun) · CR-08 (saldo tak memblokir). EXP-01 & AI-01 TERTUTUP. F-016 TERTUTUP. Tidak ada P0 terbuka.

## Perubahan file aktual (belum commit)
9 file modified (+108/−45): `api/_lib/aiGateway.js`, `api/ai/engine-status.js`, `api/ai/tools/execute.js`, `src/components/settings/UnifiedSettingsView.tsx`, `src/data/priceDatabase2026/resolver.ts`, `src/export/excelExportEngine.ts`, `src/services/ai/orchestration/aiOrchestrator.ts`, `src/services/coAssistantService.ts`, `src/test/priceDatabase2026.test.ts`. Plus dokumen audit di `docs/audit/` (untracked). 2 commit lokal belum push: `9d60013`, `dd81439`.

## Tindakan berikutnya yang memerlukan keputusan pemilik produk
1. Commit + push perubahan remediation (belum ada persetujuan).
2. CR-10: putuskan harga jual kredit (Rp/1.000) — prasyarat kalibrasi tarif & implementasi ledger F-002.
3. F-011: setujui flag `isDemo` + badge DEMO untuk 4 proyek seed.
4. ~~F-018: setujui perbaikan parser di generator + regenerasi canonical~~ **SELESAI** (errata generator + regenerasi terverifikasi; tinggal commit bersama perubahan lain bila disetujui).
5. Setujui penambahan tsx/vitest ke devDependencies + tsconfig test (F-013/F-014).
6. Verifikasi dashboard: AI_GATEWAY_TOKEN + kunci provider baru di Vercel; rotasi 8 secret; status migrasi Supabase (NEEDS_ACCESS).
7. Putuskan strategi performa (code-splitting canonical 16 MB, kompresi aset public/ 80 MB, dedup gambar) & nasib direktori dataset 144 MB (pertahankan s/d regenerasi F-018, lalu LFS/arsip).
