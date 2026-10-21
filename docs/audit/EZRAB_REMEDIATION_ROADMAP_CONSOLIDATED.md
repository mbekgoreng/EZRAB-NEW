# EZRAB — REMEDIATION ROADMAP (Konsolidasi 2026-10-21)

Pasangan `EZRAB_MASTER_AUDIT.md`. Dokumen ini **melanjutkan, bukan menggantikan**, `EZRAB_REMEDIATION_ROADMAP.md` (2026-10-20, Gelombang 0–4) — butir Gelombang 0 versi lama (aksi owner di dashboard) tetap berlaku dan dirujuk di bawah. Prinsip: batch kecil per root cause, tes spesifik per batch, regresi sesudahnya; tidak ada commit/push/deploy/migrasi/secret tanpa persetujuan eksplisit owner per batch. Harga tak diketahui tetap NULL/unresolved; AI mengekstrak & menyarankan, engine deterministik yang menghitung.

## Batch 0 — Sudah selesai lokal, MENUNGGU keputusan commit owner

| Batch | Isi | Bukti | Acceptance |
|---|---|---|---|
| 0A Mobile (17 file) | Wave 1 (8 perbaikan) + Finalisasi 2A warna (434 aturan, 6 file) + 2B onboarding + hero dashboard + greet chat | tsc 0; build verifikasi tuntas; screenshot 320–1366 light/dark; matriks verifikasi | Owner memilih: commit+push (Preview) / commit lokal / tahan. Sesudah push: jalankan checklist Preview (saat ini NOT_RUN) |
| 0B Remediasi Wave 1 (9 file) | EXP-01, AI-01, F-016, F-001, F-005/F-006 | Laporan Wave 1 + REMEDIATION_REPORT; F-016 lulus ulang di run test:price 2026-10-21 | Keputusan commit terpisah dari 0A (changeset berbeda) |
| 0C F-018 (6 file) | SOURCE_ERRATA + regenerasi canonical | ahsp:test 21/21; tepat 1 record berubah | Keputusan commit terpisah; owner juga memperbaiki workbook Excel sumber di PC-nya |

## Gelombang berikutnya (urutan mengikuti prompt konsolidasi C→G)

### C. Integritas engine & AHSP (tanpa blocker eksternal)
1. **RAB-01 + AHSP-01-invarian** (satu batch kecil): selaraskan pembulatan resolver (Σ subtotal = harga satuan) dan perbaiki invarian tes agar sesuai desain generator. Acceptance: `test:price` 71/71 tanpa melemahkan gerbang harga; regresi core 74/74, ai-estimate 15/15.
2. **Koefisien 1440** — review manusia vs SE DJBK (owner/sumber). Acceptance: keputusan tertulis; bila berubah, lewat jalur generator + SOURCE_ERRATA, bukan edit manual.
3. **Antrean data AHSP-02** (1.048 NEEDS_REVIEW / 335 unresolved / 50 SMKK) — pekerjaan data bertahap per domain; tidak ada tenggat buatan. Acceptance per domain: bukti sumber per item.
4. **D2-sisa + GAP display Rp0** — bawa `priceStatus` ke tipe AiChangePreviewModal dan labeli tampilan modal lain. Acceptance: tidak ada permukaan yang menampilkan Rp0 polos untuk unresolved (uji grep + screenshot).

### D. Billing AI & fallback provider (butuh keputusan owner di dua titik)
1. **P0-3** (batch terkecil, dampak langsung): pindahkan `consume()` chat ke cabang `res.success` saja + tes regresi harness. Risiko: mengubah perilaku simulasi — perlu persetujuan owner karena menyentuh sistem kredit (aturan berdiri). Acceptance: panggilan gagal → saldo tidak berubah (bukti harness), panggilan sukses → terpotong sekali.
2. **CR-01 tarif provider**: isi `providerTariffs.js` dari tarif resmi provider (bukti tertulis per model, termasuk model produksi). Tanpa data tarif yang dapat dikutip → tetap NULL dan biaya tetap UNDETERMINED (jangan dikarang). Acceptance: setiap tarif punya sumber; model produksi terdaftar.
3. **P0-1/P0-2 Billing Intelligence & intent harga**: intent deterministik untuk pertanyaan paket/saldo/harga material yang menjawab dari data produk (bukan dari ingatan model). Acceptance: pertanyaan "paket saya berapa" dijawab dari konstanta paket yang sama dengan halaman harga; harga material selalu via tool.
4. **CR-10** — keputusan owner atas nilai top-up (Rp1.389 vs Rp10.000 per 1.000 kredit); sesudah keputusan, samakan `config.ts` & `creditPricing.js` (menutup P2-2). (= butir 0.4 roadmap 2026-10-20.)
5. **Ledger server (CR-02)** — BLOCKED sampai VPS. Migrasi draft `20261018_ai_credits_ledger.sql` hanya boleh diterapkan di lingkungan backend owner dengan strategi recovery; RPC atomik debit/refund + idempotency persisten (menutup CR-05/CR-06) adalah bagian dari batch yang sama. Acceptance: debit sebelum LLM, refund saat gagal, uji konkurensi & restart (sesuai daftar periksa prompt §3.1).
6. **AI-03/AI-08/P1-3** — satukan rantai fallback terdokumentasi & satu sumber kebenaran model (registry) sebelum menambah provider baru. Acceptance: mode advanced tidak jatuh ke provider di luar rantai; registry = yang dipakai gateway.

### E. Penyimpanan proyek & keamanan
1. **SEC-16 security headers** (batch kecil, risiko rendah): tambahkan CSP (mode report-only dulu), X-Frame-Options, X-Content-Type-Options, Referrer-Policy di `vercel.json`/middleware. Acceptance: header tampil di Preview; tidak ada fitur yang rusak oleh CSP report.
2. **F-011 label DEMO** — keputusan owner (flag `isDemo` + label visual). Acceptance: proyek seed terlabel di semua permukaan.
3. **SEC-03** — owner memasang `AI_GATEWAY_TOKEN` di Vercel (nilai tidak lewat chat). Acceptance: engine-status tetap publik counts-only; gateway menolak tanpa token (uji di Preview). (= butir 0.2 roadmap lama.)
4. **F-GATE-02/F-012 verifikasi live Supabase** — butuh akses dashboard owner: terapkan/cek RLS 9 tabel, perbaiki drift `updated_at`, negative tests. Acceptance: matriks RLS live terisi (saat ini NEEDS_ACCESS).
5. **F-008 jalur deployment backend** — definisikan bersama keputusan VPS (Docker/host). BLOCKED.
6. **Access Gate Production** — env Production (kode & secret berbeda dari Preview) + promosi manual oleh owner. Acceptance: checklist gate di Production (redirect, kode salah, API terblokir, rate limit) — saat ini NOT_RUN.
7. **Rotasi 8 secret** — aksi owner di dashboard provider. Acceptance: secret lama dicabut; aplikasi tetap hidup dengan yang baru. (= butir 0.3 roadmap lama.)
8. Item P3 keamanan (SEC-02/04/07/12/13/14/19, AI-05) — kelompokkan sebagai satu batch pengerasan sebelum rilis publik berbayar; masing-masing kecil dan teruji sendiri.

### F. Performa, mobile lanjutan & dependensi
1. **INF-06/F-021 performa** (FAIL di gate kesiapan): code-split dataset AHSP (16 MB canonical keluar dari grafik awal), lazy-load route berat (DED/dokumen/3D), kompresi 123 gambar (109 MB), audit `public/` 80 MB. Acceptance terukur: chunk utama < 1 MB gzip untuk rute /app awal; dist menyusut signifikan; tidak ada fitur hilang. Batch terbesar di roadmap — pecah per rute.
2. **DS-01 token siklik** — definisikan nilai konkret untuk 13+ variabel self-reference di `ezrab-design-system.css` (light + dark). Acceptance: tidak ada `var(--x)` yang menunjuk dirinya; uji visual halaman yang mengonsumsi surface-secondary/border-line/hue bg-border. Batch kecil tapi menyentuh fondasi — lakukan sebelum batch kosmetik lain.
3. **Mobile sisa**: R-06/R-10/R-11/R-12/R-14 (reproduksi live dulu, perbaiki yang terbukti), R-13 (audit baris-per-baris AHSP Explorer/Laporan/Keuangan/Pengaturan), lapisan kosmetik non-warna dokumen (rounded/shadow/tipografi: `text-[10.5px]`, `animate-spin` di DedRabWorkflowView). Breakpoint: TIDAK dikonsolidasi (keputusan 2C berbasis bukti).
4. **F-013/F-014 tooling tes** — keputusan owner: tambah `vitest` (+ opsional `tsx`) ke devDependencies dan buat tsconfig tes. Acceptance: suite billing & 28 file vitest dapat jalan; cakupan billing > 0. Prasyarat untuk gerbang rilis otomatis.
5. **INF-07 npm audit** — jalankan di lingkungan dengan akses registry (mesin owner/CI) dan tindaklanjuti advisory per jalur dampak. BLOCKED_ACCESS di sandbox.

### G. Staging validation & production readiness gate
1. Deploy pohon final ke Preview (sesudah Batch 0 diputuskan) → jalankan checklist Preview penuh (gate + mobile interior + DED retest bila fixture tersedia).
2. Benchmark DED/RAB (protokol di `DED_RAB_BENCHMARK.md`) — BLOCKED_INPUT sampai fixture diterima.
3. Susun ulang Production Readiness Gate per dimensi dengan bukti baru; keputusan READY hanya bila: ledger server aktif (atau produk dilabeli demo secara eksplisit), SEC-03 tertutup, rotasi secret selesai, performa lulus ambang, gate Production aktif, RLS live terverifikasi.

## Keputusan owner yang tertunda (menghambat batch terkait)
CR-10 nilai top-up · F-011 label demo · F-013/F-014 devDependencies tes · disposal `.audit-frag.json` & direktori dataset 144 MB · koefisien 1440 · ambiguousUnit→AI_INFERENCE berlabel (DED-3 sisi Flow A) · hookup AHSP-v3 ke UI DED (keputusan produk) · penghapusan file FloorPlan2D/HouseViewer3D (tak terpakai sejak redesign studio) · normalisasi batas 768 DedAiSplitAnalysisView · P0-3 (persetujuan menyentuh perilaku kredit).
