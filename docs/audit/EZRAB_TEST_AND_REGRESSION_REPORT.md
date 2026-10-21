# EZRAB — Test & Regression Report (Audit 2026-10-20)

Environment: VM Linux sandbox, Node lokal repo `~/workspace/ezrab-unified`, branch `integrasi/unified-ui-engine` @ `dd81439`. Semua angka dari eksekusi aktual sesi audit ini kecuali ditandai tanggal lain.

## 1. TypeScript
- Command: `tsc --noEmit --skipLibCheck` (heap 6 GB)
- Hasil: **0 error** ✅ (114 detik)

## 2. Production build
- Command: `vite build` (heap 8 GB — OOM pada heap default 2 GB; keterbatasan environment, bukan regresi)
- Hasil: **PASS**, 1m 05s. Peringatan chunk size (bundle besar; lihat temuan performa).

## 3. Engine test suites (via npm scripts, jalur audit RAB/AHSP)
| Suite | Hasil | Catatan |
|---|---|---|
| test:core | **74/74 PASS** (exit 0) | — |
| test:calculator | **PASS (100%)** | Golden end-to-end: bowplank 42,4 m → Rp 4.044.960; ubah input 48,4 m → Rp 4.617.360; PPN 11% Rp 507.910; grand total Rp 5.125.270 |
| test:phase2-integrity | **16/16 PASS** | Sentinel, totals, UNIT_MISMATCH |
| test:price | **65 PASS / 2 FAIL** (exit 1) | FAIL 1 (TEST 3): pembulatan resolver — harga satuan dibulatkan rupiah penuh, subtotal 2 desimal (selisih Rp 0,5; temuan RAB-01). FAIL 2 (TEST 10): invariant "nol harga di canonical" bertentangan dengan desain generator yang memang menyematkan harga HSD (temuan AHSP-01). Keduanya konflik kebijakan, bukan korupsi data. Invariant lain lulus: harga hilang selalu null tak pernah 0, PARTIAL/MISSING jujur, 309 record harga positif & tertelusur, UI tak pernah merender harga hilang sebagai Rp 0 |

## 4. Golden recomputation (independen)
- Spot check 3 item lintas domain cocok persis (CK 2.2.2.3: 42.297; BM G.74: 5.695.974; SDA 03.02.01.06.01: 1.668.160).
- **Sapuan penuh**: 1.866 item VERIFIED dengan harga & semua komponen berharga dihitung ulang → **1.531 cocok persis; 335 berbeda seluruhnya sub-rupiah** (100% terjelaskan pembulatan harga tersimpan = Math.round(Σ koefisien × harga)). Tidak ada selisih tak terjelaskan.
- Contoh persis: `A.1.01.a.1` — 0,05 × 100.000 + 0,005 × 200.000 = **Rp 6.000** = tersimpan ✅

## 5. Browser dynamic sweep (Playwright, Chromium headless, dev server lokal)
11 route diuji: /app/dashboard, projects, estimate, ahsp, kredit-ai, ezrab-ai, finance, settings, template-rab, qto, ded-ai.
- **0 error React / pageerror di semua route** ✅
- 2 error `ERR_TUNNEL_CONNECTION_FAILED` per route = resource eksternal gagal lewat proxy sandbox (artefak environment, bukan produk).
- Uji klik navigasi dashboard (audit routing sesi yang sama): kartu stat → /app/projects + filter benar ✅.

## 6. Hasil sesi yang sama, lebih awal hari ini (untuk konteks regresi)
- Post-push integration audit: undoRedo 9/9, financialAnalytics 8/8, projectFinance 9/9, usageMeter 17/17 PASS; marketAutoEnrichment 8/10 (2 fail = keterbatasan shim vitest lokal, akar sama dengan butir 3 di atas).
- AI features test: gateway fail-closed benar (502 jujur tanpa kunci), intent lokal Chat AI 8/8, aiCredits 16/16, aiDocumentIntelligence PASS, aiDesign 12/13.

## 7. Yang TIDAK dijalankan / keterbatasan
- Suite npm lengkap `test:all` tidak dijalankan penuh (60+ script; waktu & harness tsx watch-mode). Cakupan dinyatakan apa adanya.
- E2E terhadap production ezrab.site: hanya GET ringan (lihat API review) — tidak ada pengujian destruktif/berbeban ke production.
- Uji perangkat fisik (HP nyata) tidak tersedia di sandbox; responsivitas dinilai dari viewport emulation audit UI/UX sebelumnya.
- Test di browser dengan login aktif: login OFF by design (AUTH_ENABLED=false) — area auth = NEEDS_ACCESS.
