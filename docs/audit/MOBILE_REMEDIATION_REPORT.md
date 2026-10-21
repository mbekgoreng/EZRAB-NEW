# EZRAB MOBILE-FIRST — LAPORAN REMEDIASI (Wave 0–4)

Tanggal: 2026-10-21 · Branch: `integrasi/unified-ui-engine` · Base: `ce968a8`
Status: **perbaikan selesai lokal, terverifikasi — BELUM commit/push** (menunggu instruksi owner).
Audit statik pendamping: `docs/audit/MOBILE_WAVE0_AUDIT.md`. Screenshot: `~/workspace/mobile-audit/before|after/`.

## 1. Metode verifikasi live

Playwright Chromium (viewport 320/360/390/430/768/1366) terhadap:
- **Production `ezrab.site`** (lewat proxy penerus lokal; sertifikat MITM proxy diabaikan di konteks uji saja), dan
- **Build lokal** `vite preview` dari dist branch ini (sebelum & sesudah perbaikan).

Pengukuran: `document.scrollWidth` vs `innerWidth` per halaman + sapuan scroll penuh landing (21 posisi) + hitung elemen terpotong di luar container scroll + page/console error. Catatan kejujuran metode: EZRAB mematikan overflow-x di 3 lapis CSS, jadi ketiadaan scrollbar bukan bukti — yang dipakai adalah pengukuran scrollWidth di atas.

## 2. Hasil reproduksi Wave 0 (production, sebelum perbaikan)

- Landing (6 viewport + sapuan 21 section): **tanpa overflow dokumen, 0 error**.
- App — dashboard, ezrab-ai, ded-ai, magic-ai, RAB (`/app/estimate`), AHSP, database material, proyek (390px; dashboard & chat di 6 viewport): **tanpa overflow, tanpa elemen terpotong, 0 page error**.

**NOT REPRODUCED** (gejala dari screenshot di master prompt): maskot hero terpotong, kolom headline sempit, teks tombol bertumpuk, overflow horizontal landing. Hero live (CinematicHero) memang tidak memiliki maskot; kolom teks full-width. Penjelasan paling konsisten: screenshot berasal dari build production yang lebih lama — production ezrab.site diperbarui owner di luar sesi ini beberapa kali.

## 3. FIXED & BROWSER-VERIFIED (build lokal sesudah perbaikan)

| # | Perbaikan | File | Bukti |
|---|---|---|---|
| 1 | CTA navbar "Coba Gratis" tidak lagi `display:none` di ≤374px — tampil ringkas (padding 7×12, font 12.5px, nowrap); di ≤340px teks wordmark brand disembunyikan agar logo+CTA+hamburger muat | `src/styles/exact-landing-flagship-mobile.css` | Screenshot after 360 & 320: CTA tampil; before: hilang. Overflow tetap none |
| 2 | Chip scene hero tidak lagi menimpa kolom cari demo: layer scene mulai 40px di bawah tepi atas layar stage pada ≤639px (chip punya band sendiri) | `src/components/landing/cinematic/cinematic-hero.css` | Screenshot after 360/390: placeholder "Cari proyek, fitur, dok…" utuh; before: tertimpa chip |

Regresi desktop: screenshot after 1366px — hero desktop identik (stage miring, badge orbit, sidebar mock) ✔. Semua perubahan landing berada di dalam media query mobile.

## 4. FIXED — terverifikasi tsc/build + inspeksi kode (interior app TIDAK browser-verified lokal)

Interior /app di build lokal berhenti di gerbang/onboarding (API auth tidak tersedia di `vite preview`), dan production masih menjalankan build lama — jadi butir berikut berstatus FIXED, belum browser-verified pada build baru. Jalur verifikasi penuh: setelah push → Preview Vercel.

| # | Perbaikan | File |
|---|---|---|
| 3 | **R-01 layout mati** — koreksi premis audit: snapshot Tailwind terkompilasi (`src/styles/magic-ai.css`) membuat sebagian utilitas hidup; yang mati (layout 12-kolom `grid-cols-12`/`col-span-*`, `p-6`, `gap-6`, varian `sm:flex-row`/`md:items-center`, nilai arbitrer `h-[3px]` dsb.) diganti kelas semantik scoped per file dengan nilai Tailwind persis. 200 string className ditulis ulang di 8 file; token layout mati = 0. Bonus: progress bar DED yang tingginya 0 (kelas `h-[3px]` mati) kini tampil; stepper mobile DedRabWorkflowView tidak lagi dobel di desktop (`sm:hidden` mati → media query sungguhan) | `src/components/magic-ai/DedAnalysisDashboard.tsx` + 7 file `src/components/document/*` |
| 4 | Kotak cari Database Material: `minWidth:'300px'` → `flex:'1 1 220px', minWidth:0` (baris induk sudah flex-wrap) — tidak lagi memaksa clip di 320px; desktop tidak berubah | `src/components/materials/MaterialDatabaseView.tsx` (1 baris) |
| 5 | Chat EZRAB AI: `100vh` → `100dvh` (base + mobile); min-height mobile 420→360px; header boleh wrap di ≤480px (`.ezchat2-header`/`.ezchat2-actions`) — CSS saja, view.tsx tidak diubah | `src/ai-tools/ezrab-ai/ezrab-ai-chat.css` |
| 6 | Bottom nav dark mode: background `rgba(255,255,255,.96)` hardcode → `color-mix(…, var(--ez-color-surface) 96%, …)`; ring tombol AI `#fff` → token surface. Mode terang identik piksel | `src/styles/global.css` |
| 7 | Hamburger TopBar 32→40px (catatan: area sentuh efektif sebenarnya sudah 44px via `.ezrab-touch-target`; perubahan ini menghilangkan ketergantungan rapuh itu) | `src/components/navigation/TopBar.tsx` |
| 8 | Safe-area + `100dvh` drawer sidebar diperluas dari ≤767px ke ≤1023px (rentang drawer aktif yang sebenarnya, termasuk tablet portrait) | `src/styles/workspace-mobile-fixes.css` |

## 5. Hasil regression (build sesudah)

- `tsc --noEmit --skipLibCheck`: **0 error** (tree gabungan semua perbaikan).
- `vite build`: **PASS** (2m25s, dist/index.html ada).
- test:core **74/74**, test:ai-estimate **15/15**.
- Probe after (lokal): landing 320/360/390/1366 + gate 390 — overflow none, 0 error.

## 6. Temuan tersisa & keputusan owner

1. **Lapisan kosmetik dokumen masih mati** (di luar cakupan layout): view `components/document/*` ditulis mengandalkan palet Tailwind penuh + varian `dark:` + animasi yang tidak ada di snapshot `magic-ai.css` — warna/ukuran teks default (slate/blue/emerald, `rounded-xl`, `shadow-*`, hover/focus) tidak menghasilkan CSS. Layout sudah diperbaiki; lapisan warna belum. Keputusan: perluas snapshot CSS, atau restyle view dokumen ke token `--ez-*` (pekerjaan terpisah).
2. **Kartu checklist onboarding** ("Mulai dengan EZRAB") menutupi ±setengah layar mobile di semua halaman app. Ada tombol minimize/tutup. Usulan: mulai dalam keadaan minimized pada <768px — perubahan perilaku, menunggu keputusan owner.
3. **Konsolidasi breakpoint (P2)** belum dikerjakan: ≥15 ambang berbeda di 34 file CSS; skala resmi 480/768/1024/1280 diusulkan di audit Wave 0 §6 — migrasi bertahap per modul.
4. **Overflow masking 3 lapis** sengaja TIDAK dilepas (melepas tanpa pemetaan per elemen = risiko regresi massal); pengukuran live menunjukkan tidak ada overflow nyata pada permukaan yang diuji.
5. Interior modul pada build baru (butir 3–8 di §4) menunggu verifikasi visual di Preview setelah push.

## 7. Konfirmasi batasan master prompt

Tidak ada perubahan pada: backend, API, gateway, auth, env/secret, database/migrasi, billing/kredit, harga AHSP/HSPK, koefisien, formula RAB, logika AI, data bisnis. Tidak ada fitur yang dihapus. Tidak ada commit/push/deploy/promosi production dalam tugas ini. File remediation (9) dan F-018 (6) yang sudah kotor sebelum tugas ini tidak disentuh; file yang diubah tugas ini tepat 15 (daftar di §3–§4).

---

## Addendum Finalisasi Wave 1 (2026-10-21, sesi Product Readiness)

Melengkapi tiga sisa terbuka dari laporan di atas. Changeset mobile kini **17 file**. Semua status di bawah terverifikasi pada pohon final (HEAD `ce968a8` + modifikasi) — tetap **belum commit/push**; checklist Preview tetap **NOT_RUN**.

### Sisa 1 — Warna view dokumen: SELESAI (2A)
- Metode: inventaris semua token string literal per file (termasuk helper pengembali string kelas), dicek terhadap seluruh CSS termuat (38 file, termasuk snapshot `magic-ai.css` 652 KB). Snapshot terbukti **0 kemunculan `dark\:`** → semua token `dark:` mati.
- Hasil: **434 token warna mati** di 6 file diperbaiki dengan 434 aturan pada blok `<style hidden>` per file memakai selector token asli (JSX tak diubah): zona konten → token `--ez-*`; zona selalu-gelap (banner gradien, scrim, panel terminal/konsol) → literal authored; status success/warning/danger tetap terbedakan di kedua tema. File ke-7 (DedRabWorkflowView.tsx) terbukti **0 token warna mati** — tidak ditulis.
- DrawingGraphExplorerView & EntityResolutionReviewView adalah konsol gelap satu-tema → restorasi literal penuh (keputusan terdokumentasi di kode).
- Keamanan token: pemetaan menghindari variabel design-system yang self-reference siklik (lihat temuan baru DS-01 di `EZRAB_MASTER_AUDIT.md`).
- Verifikasi: inventaris ulang pasca-edit = **0 token warna mati tersisa**; tsc 0; tangkapan Dokumen AI 390 bersih (overflow tidak, warna token tampil). Token non-warna yang dibiarkan sesuai scope: `text-[10.5px]` (WDI), `animate-spin` (DedRabWorkflowView).

### Sisa 2 — Checklist onboarding: SELESAI & TERVERIFIKASI PERILAKU (2B)
- Satu-satunya perubahan: inisialisasi state `minimized` di `FirstProjectChecklist.tsx` — preferensi tersimpan selalu menang; tanpa preferensi, default minimized bila `window.innerWidth < 768`.
- Terverifikasi browser lokal: 390px default pill ✔, expand ✔, minimize-back ✔, preferensi `'0'` → kartu terbuka saat reload ✔; desktop 1366 default terbuka ✔ (judul "Progres Kamu" saat pengguna punya proyek).

### Sisa 3 — Konsolidasi breakpoint: DINILAI, DITOLAK DENGAN BUKTI (2C)
- Sensus seluruh ambang: nol konflik sejati. Pasangan 767/768, 639/640, 1023/1024 adalah komplemen eksak (`max-width:767` ≡ JS `<768`); ±15 ambang lain masing-masing milik satu komponen; `ezrab-design-system.css` tidak memiliki skala lebar untuk dikonsolidasi (skala 480/768/1024/1280 yang diusulkan = penemuan baru). Aturan chat 640–767 adalah override berlapis yang disengaja dan terurut benar. Scatter = utang dokumentasi, bukan sumber cacat → **tidak ada perubahan kode**. Catatan kosmetik: DedAiSplitAnalysisView memakai batas `<=768` (satu-satunya) — normalisasi = keputusan produk.

### Perbaikan tambahan yang ditemukan saat verifikasi visual
- **Hero dashboard modern (R-04 terkonfirmasi live):** baris flex tak pernah menumpuk; maskot `flexShrink:0` min 280px memakan kolom teks (headline sempit, tombol terlipat 3 baris, maskot terpotong pada 390px). Diperbaiki: kait kelas `ezdb-hero/-text/-mascot` + aturan ≤767px (tumpuk vertikal, maskot `min(220px,64vw)`). Screenshot sesudah 390px bersih; desktop 1366 tak berubah.
- **Empty-state chat terpotong (baru):** blok `.ezchat2-empty` 351px di body 260px pada 320px (textarea flex tak menyusut di bawah lebar intrinsik) → greeting & composer ter-clip. Diperbaiki di `ezrab-ai-chat.css` (`width:100%; min-width:0` + `textarea{min-width:0}`). Sesudah: greet/pill 212px @320, 282px @390 — persis lebar konten; screenshot bersih.

### Regresi pohon final
tsc **0** · build: konfigurasi standar mati OOM di fase minify CSS pada sandbox (batas lingkungan; dua build standar lulus lebih awal hari yang sama pada pohon nyaris identik) — build verifikasi (cssMinify & reportCompressedSize mati, JS tetap diminify) **tuntas 1m 6s, dist 157 MB** · test:core **74/74** · test:ai-estimate **15/15** · test:ded-rab **semua PASS** · test:price **69/2** dan dedDualMode **6/2** = identik baseline lama (terbukti pre-existing). Verifikasi interior memakai stub browser-level untuk `/api/access/session` (label: lokal-stub, bukan Preview).

### Checklist Preview — NOT_RUN
Menunggu keputusan commit/push owner. Butir: buka Preview dari commit changeset ini → dashboard/chat/dokumen pada 320–390px perangkat nyata → interior app di balik gate aktif → mode gelap via toggle UI → checklist onboarding profil baru.
