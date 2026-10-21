# EZRAB — VERIFICATION MATRIX (Konsolidasi 2026-10-21)

Pohon: `integrasi/unified-ui-engine` @ `ce968a8` + 32 file modifikasi belum commit. ★ = dijalankan/dibaca langsung oleh pemeriksa pada 2026-10-21. Hasil historis diberi sumbernya dan tidak diklaim sebagai hasil hari ini.

## 1. Tes otomatis — hasil aktual 2026-10-21 ★

| Suite | Perintah | Hasil | Catatan |
|---|---|---|---|
| Typecheck | `NODE_OPTIONS=--max-old-space-size=6144 node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` | **PASS — 0 error** ★ | dijalankan berulang (pasca-2A, pasca-hero/greet) selalu 0 |
| Core | `npm run test:core` | **74/74 PASS** ★ | |
| AI estimate | `npm run test:ai-estimate` | **15/15 PASS** ★ ("ALL PASSED") | |
| DED-RAB | `npm run test:ded-rab` | **Semua suite PASS** (exit 0) ★ | termasuk cek integritas §14/§15 |
| Price | `npm run test:price` | **69 PASS / 2 FAIL** ★ | FAIL = RAB-01 (A.1.02.4a.1.d: 219.791 vs 219.790,5) + invarian AHSP-01 — identik baseline lama; kasus regresi F-016 di dalam run yang sama PASS |
| DED dual mode | `npx tsx src/test/dedDualModeWorkflow.test.ts` | **6 PASS / 2 FAIL** ★ | FAIL #4 Real Progress Event Pipeline, #6 AHSP Matching & Price Resolution — terbukti pre-existing via perbandingan stash (pohon bersih hasil identik) |
| Access gate | suite gate (16 tes, historis) | 16/16 PASS (2026-10-21, sesi gate) | di pohon commit `1464ff6` |
| Intent chat | harness intent (historis) | 14/14 PASS | commit `ce968a8` |
| AHSP pipeline | `ahsp:test` dkk. (historis, sesi F-018) | 21/21; invarian 9/9; golden 100% | pohon F-018 belum commit |

## 2. Build

| Build | Hasil |
|---|---|
| Konfigurasi standar (`vite build`) pada pohon final, di sandbox | **GAGAL LINGKUNGAN** ★ — mati berulang di fase minify CSS (exit 137 OOM / exit 1; RAM VM ±7,9 GB). Dua build standar berhasil lebih awal di hari yang sama pada pohon nyaris identik (pra-edit hero/greet: 1m 18s dan 92s, dist/index.html ada). Bukan bukti cacat kode: tsc 0 + build verifikasi tuntas |
| Build verifikasi (config sementara: `cssMinify:false`, `reportCompressedSize:false`; JS tetap diminify; file config dihapus sesudahnya) | **PASS — "✓ built in 1m 6s", dist 157 MB** ★ |
| Build Vercel untuk pohon ini | **NOT_RUN** (belum ada push baru) |
| MS Excel membuka hasil EXP-01 | **NOT_TESTED** (validasi LibreOffice PASS 2026-10-20) |

## 3. Verifikasi visual (Playwright lokal, build verifikasi di `vite preview` :4173) ★

Interior app diverifikasi dengan stub browser-level khusus `GET /api/access/session → {configured:true, active:true}` (tanpa menyentuh server/env/secret) — label: **verifikasi lokal-stub, bukan Preview**.

| Permukaan | Viewport | Hasil |
|---|---|---|
| Landing | 320/360/390/768/1024/1366 | overflow = tidak di semua lebar; 0 error konsol (produksi & lokal) |
| Dashboard (hero modern) | 390 | SEBELUM: headline menyempit, tombol 3 baris, maskot terpotong. SESUDAH: lebar penuh, tombol 1 baris, maskot proporsional ★ |
| Dashboard | 1366 | overflow tidak; hero desktop tak berubah ★ |
| Checklist onboarding | 390 | default = pill (minimized) ★; expand ★; minimize-back ★; preferensi tersimpan '0' → kartu terbuka saat reload ★ |
| Checklist onboarding | 1366 | default terbuka (judul "Progres Kamu" saat ada proyek) ★ |
| Ezrab Chat AI | 320 | header ter-wrap (chip kredit & segmen Cepat/Mendalam baris sendiri) ★; empty-state SEBELUM: blok 351px ter-clip; SESUDAH: greet & pill 212px = lebar konten ★ |
| Ezrab Chat AI | 390 | greet & pill 282px = lebar konten; overflow tidak ★ |
| Dokumen AI | 390 | overflow tidak; warna token `--ez-*` tampil (permukaan/teks/tombol) ★ |
| Dashboard dark | 390 | token berbalik; bottom nav gelap (token surface) ★ — mode gelap diset via atribut `data-theme` langsung (token-level) |
| Modal sambutan onboarding | 320 | tampil rapi (observasi tambahan dari tangkapan chat) ★ |
| Gejala screenshot prompt awal (maskot landing terpotong, kolom sempit, tombol bertumpuk di LANDING) | — | **NOT_REPRODUCED** di build produksi maupun lokal saat itu (build produksi lama); gejala serupa ditemukan & diperbaiki di hero DASHBOARD (MOB-HERO) |

## 4. Keamanan — pemeriksaan 2026-10-21

| Pemeriksaan | Metode | Hasil |
|---|---|---|
| Middleware & matriks rute gate | audit dokumen + Preview live (sesi gate) | rute sensitif PROTECTED 8/8; engine-status PUBLIC_BY_DESIGN (counts-only) |
| Gate Preview aktif | browser sesi SSO owner | redirect /access ★(sesi gate); kode salah → "Kode salah."; API kredit terblokir; rate limit terpicu di percobaan ke-11 |
| Gate Production | cek langsung ezrab.site | BELUM aktif (dashboard 200 tanpa redirect) — aktivasi = aksi owner |
| Security headers | baca `vercel.json` ★ | tidak ada blok `headers` → CSP/X-Frame-Options/dll. belum dikonfigurasi di lapisan ini (SEC-16 CONFIRMED) |
| Postur token gateway (SEC-03) | — | BLOCKED_ACCESS (dashboard Vercel owner) |
| RLS Supabase live (F-GATE-02/F-012) | — | BLOCKED_ACCESS (migrasi lokal: 69 policy deny-by-default anon) |
| `npm audit` | `npm audit` ×2 ★ | BLOCKED_ACCESS — exit 1 tanpa output (endpoint audit diblokir proxy sandbox) |
| Kebocoran secret di changeset | status git + riwayat purge | tidak ada nilai secret di pohon kerja; rotasi 8 secret lama tetap OPEN (aksi owner) |

## 5. Performa — terukur 2026-10-21 ★

| Metrik | Nilai |
|---|---|
| dist total | 157 MB |
| Chunk JS utama | 30 MB mentah / ±3,46 MB gzip (gzip -c lokal) |
| Chunk lain terbesar | pdf 532 KB & 472 KB; html2canvas 200 KB |
| Dataset terlacak git | ±144 MB (direktori dataset/backup) |
| Waktu muat terukur (LCP dsb.) | NOT_RUN — belum ada pengukuran lapangan; ambang ditetapkan di roadmap Batch F |

## 6. Benchmark & fixture

| Item | Status |
|---|---|
| Benchmark DED/RAB vs Gemini (protokol `DED_RAB_BENCHMARK.md`) | **NOT_RUN — BLOCKED_INPUT**: fixture PDF DED asli ("jembot", 32 hal.) tidak ada di repo; angka historis Gemini ±Rp148 jt adalah contoh tak terverifikasi, BUKAN target |
| Retest DED-1/DED-2 pasca-`5a2d270` | BLOCKED_INPUT (fixture sama) |
| Checklist Preview untuk changeset mobile | **NOT_RUN** (menunggu keputusan commit/push owner) |
| Suite vitest (billing dll., 28 file) | NOT_RUN — vitest tidak terpasang (F-014) |

## 7. Selisih terhadap baseline

| Metrik | Baseline (2026-10-20) | 2026-10-21 | Selisih |
|---|---|---|---|
| test:price | 65 PASS / 2 FAIL (register) → 69/2 pasca Wave 1+V2 | 69/2 ★ | tetap; 2 FAIL terpetakan persis ke RAB-01 + AHSP-01 |
| test:core | 74/74 | 74/74 ★ | 0 |
| dedDualModeWorkflow | 6/2 | 6/2 ★ | 0 (pre-existing terbukti) |
| Temuan aktif | 42 (P1 8 · P2 15 · P3 19) + temuan gelombang lain | register master: + P0-3 terverifikasi ulang, + DS-01, + MOB-HERO, + MOB-GREET, + MOB-COLOR terverifikasi; beberapa FIXED berpindah ke VERIFIED_FIXED | lihat register |
| Build standar di sandbox | PASS | GAGAL LINGKUNGAN (pasca-restart runtime, RAM 7,9 GB) | regresi lingkungan, bukan kode |
