# AUDIT MOBILE-FIRST EZRAB — WAVE 0 (STATIC, READ-ONLY)

Tanggal: 2026-10-21 · Metode: audit statis kode (grep/read), **tanpa browser test, tanpa menjalankan aplikasi**. Semua status pengujian route = **NOT_TESTED** kecuali dinyatakan sebaliknya; yang dinilai di sini adalah *risiko berbasis bukti kode*, bukan hasil reproduksi live. Tidak ada file kode yang diubah oleh audit ini.

---

## 1. Baseline Git

- Branch: `integrasi/unified-ui-engine` · HEAD = remote tip terverifikasi (`git ls-remote`): **`ce968a8`** "feat(ui,chat): simplify design studio, redesign wizard, conversational RAB routing". Di bawahnya: `5a2d270` (DED patch), `1de259e` (UI/routing), `1464ff6` (access gate), `dd81439` (landing pricing).
- **Working tree kotor — 15 file modified, SEMUANYA mendahului tugas mobile ini dan TIDAK BOLEH disentuh tugas ini:**
  - *Remediation 9 file:* `api/_lib/aiGateway.js`, `api/ai/engine-status.js`, `api/ai/tools/execute.js`, `src/components/settings/UnifiedSettingsView.tsx`, `src/data/priceDatabase2026/resolver.ts`, `src/export/excelExportEngine.ts`, `src/services/ai/orchestration/aiOrchestrator.ts`, `src/services/coAssistantService.ts`, `src/test/priceDatabase2026.test.ts`.
  - *F-018 AHSP 6 file:* `data/ahsp2026/validated/ahsp_2026_master.json`, `data/ahsp2026/validated/ahsp_2026_components.json`, `scripts/ahsp2026/syncCiptaKaryaMaster.py`, `scripts/ahsp2026/testAhsp2026.ts`, `src/data/nationalCostDatabase/ahsp2026Canonical.generated.ts`, `src/data/nationalCostDatabase/ahsp2026CanonicalResources.generated.ts`.
- **Untracked:** `.audit-frag.json` (stray, keputusan owner pending), `data/ahsp2026/reports/sync_errata_applied.json`, `docs/EZRAB_AI_FEATURES_TEST_REPORT.md`, `docs/EZRAB_NAVIGATION_AUDIT_REPORT.md`, `docs/EZRAB_POST_PUSH_INTEGRATION_AUDIT.md`, `docs/audit/` (17+ laporan audit sebelumnya).
- Nothing staged. **Tidak ada "uncommitted UI leftovers" dari sesi redesign/wizard/DED** — ketiganya sudah ter-commit (`1de259e`, `5a2d270`, `ce968a8`).

## 2. Sistem Layout — Temuan Struktural

### 2.1 Tidak ada sistem breakpoint tunggal
- `src/styles/ezrab-design-system.css` (527 baris, 268 token `--ez-*`) **tidak mengandung satu pun media query lebar** — hanya `prefers-reduced-motion` (baris 453, 521). Tidak ada token breakpoint.
- Sensus `@media` di 34 file CSS: nilai `max-width` yang dipakai tersebar di **≥15 ambang berbeda** — 640 (×15), 1024 (×11), 767 (×8), 768 (×5), 1200, 1100, 1080, 960, 900, 860, 800, 720, 700, 639, 560, 540, 480, 374 — plus `min-width` 1024/1080/1280/1440.
- Sisi JS (WorkspaceView.tsx:162-163): `isMobile = innerWidth < 1024`, `isNarrowMobile = innerWidth < 768` — dua ambang JS yang tidak selaras dengan mayoritas CSS (767 vs 768 vs 640). Komponen individual menambah ambang sendiri: EzrabAiDashboardView inline `<style>` memakai 1120/1000/640; cinematic-hero 1024/639.
- **Tailwind TIDAK terpasang** (tidak ada di `package.json`, tidak ada direktif `@tailwind`, tidak ada CDN di `index.html`) — namun ≥8 file TSX memakai kelas utilitas Tailwind (`grid-cols-*`, `sm:`, `lg:`) yang **tidak menghasilkan CSS apa pun**. Lihat register R-01.

### 2.2 Overflow dimatikan secara global (masking, bukan perbaikan)
- `src/styles/global.css:26` — `body { overflow-x: hidden }` berlaku di **semua lebar viewport**.
- `src/styles/exact-landing-flagship-mobile.css:14` — pada ≤767px: `html, body, #root { overflow-x: clip }`. File ini di-import statis oleh ExactLandingPage yang di-import App.tsx → masuk bundle utama → berlaku **app-wide termasuk /app** setelah bundle termuat.
- `src/styles/global.css:683` — `.ezrab-workstation-scrollable { overflow-x: hidden }`: scroller konten workspace **memotong** (clip) konten yang lebih lebar, bukan menggulirkannya. Konten lebar di dalam workspace bisa terpotong senyap tanpa indikator.
- Konsekuensi audit: "tidak ada scrollbar horizontal" di EZRAB **tidak dapat dijadikan bukti** layout benar — overflow disembunyikan di tiga lapis. Pengujian live wajib memakai pengukuran `scrollWidth > clientWidth` per elemen, bukan pengamatan scrollbar.

### 2.3 App shell (workspace)
- **Sidebar** (`src/components/layout/Sidebar.tsx`, 1386 baris): desktop sticky 256px/72px; mode `isMobile` (<1024) = drawer fixed `width: min(84vw, 290px)` (baris 298), `transform: translateX(-100%)` saat tertutup, z-index 9999, `height: 100vh` (di-override `workspace-mobile-fixes.css` menjadi `100dvh` + `padding-top: env(safe-area-inset-top)` pada ≤767px — perhatikan override hanya ≤767 sedangkan drawer aktif sampai <1024: **pada 768–1023px drawer memakai 100vh tanpa safe-area fix**).
- **Bottom nav** (`WorkspaceView.tsx:787`, dirender hanya bila `isNarrowMobile` <768; CSS `global.css:517`): fixed bottom, `height: calc(58px + var(--ezrab-safe-bottom))`, z-index 9980, 5 item (Proyek/Home, RAB, tombol AI tengah 44px `margin-top: -14px`, QTO, AHSP) + konten utama diberi `paddingBottom: calc(68px + safe-bottom)` (WorkspaceView.tsx:333) ✔. **Hazard:** `background: rgba(255,255,255,0.96)` hardcode putih (global.css:525) dan border tombol AI `3px solid #ffffff` — di dark mode bilah tetap putih.
- **Celah 768–1023px:** drawer menjadi satu-satunya navigasi (hamburger di TopBar muncul bila `isMobile`), bottom nav tidak ada. Konsisten secara desain, wajib diuji live.
- **TopBar** (`src/components/navigation/TopBar.tsx`, 1229 baris): kiri hamburger 32×32px (di bawah pedoman target sentuh ±44px) + logo mark 32px (narrow); tengah search flex-1 (maxWidth 460px desktop, 100% narrow); kanan: NotificationBell, CreditBalance (compact di narrow), avatar 28–30px; beberapa elemen disembunyikan saat `isNarrowMobile` (baris 421, 643, 825). Kepadatan pada 320px = risiko MED (search terjepit di antara dua klaster flexShrink: 0).
- Padding `<main>` tidak konsisten: cabang dashboard & subscription memakai padding adaptif narrow, cabang kurva-s/export/pengaturan memakai tetap `20px 24px` (WorkspaceView.tsx:695-705).

### 2.4 Modal & overlay (pola umum sehat)
Pola dominan aman: `width: 100%` + `maxWidth` + `maxHeight: 92vh` + scroll internal — CreateProjectModal (680/540px), RabGeneratorModal (900px), overlay wizard & design studio di ezrab-ai/view.tsx (maxWidth 1150, padding 16). Risiko modal lebih bersifat per-komponen (lihat register), bukan pola shell.

### 2.5 Viewport meta (statis PASS)
`index.html:8` — `width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover`. Zoom **tidak** dimatikan ✔; `viewport-fit=cover` + variabel `--ezrab-safe-top/bottom` dipakai di shell ✔.


---

## 3. Inventaris Route

Layout induk publik: App.tsx (tanpa shell). Layout induk workspace: `PasscodeGate > ProjectProvider > WorkspaceView` (TopBar + Sidebar + scroller + bottom nav). Varian project-scope (`/app/projects/:id/...`) me-render komponen yang sama dengan varian global. **Semua status: NOT_TESTED (belum ada bukti browser test mobile untuk satu pun route).**

### 3.1 Publik

| Path | Komponen utama (file) | Isi berisiko mobile | Risiko | Prioritas uji |
|---|---|---|---|---|
| `/` | ExactLandingPage (`components/landing/ExactLandingPage.tsx`) + ExactNavbar + CinematicHero + ExactWorkflow + ExactStackedShowcase + ExactRoles + DrawingsToDecisionsSection + ExactPricing + ExactFinalCta + ExactFooter | Hero WebGL + stage 3D; showcase kartu bertumpuk scroll-driven; grid pricing; CSS inti `exact-landing.css` di-load **deferred** (dynamic import setelah mount — jendela FOUC di jaringan lambat) | MED | P0 |
| `/about` | AboutPage (`components/about/AboutPage.tsx`, about-page.css) | Konten editorial panjang | LOW | P2 |
| `/fitur` | FeaturesPage (`components/landing/features/`, features-page.css) | Daftar fitur panjang | LOW–MED | P2 |
| `/keunggulan` | AdvantagesPage (`components/landing/advantages/`, advantages-page.css) | Sama seperti /fitur | LOW–MED | P2 |
| `/access` | PasscodeGate standalone (`src/auth/PasscodeGate.tsx`) | Form kode 4 digit; kartu `width:100%, maxWidth:380px` ✔ | LOW | P1 (gerbang semua /app) |
| `/masuk`, `/daftar` | Bukan halaman — AUTH_MODE≠'real-login' langsung masuk workspace; mode real-login membuka AuthModal di atas landing | Form auth dalam modal | MED | P2 |
| Blog publik | **Tidak ada di app ini** — hanya CMS `/app/blog`; blog publik adalah deployment terpisah | — | — | Di luar cakupan repo ini |

### 3.2 Workspace (menu → komponen, dari blok render WorkspaceView.tsx)

| Menu (path) | Komponen (file) | Tabel/Modal/Form | Risiko overflow & catatan kode | Prioritas |
|---|---|---|---|---|
| dashboard (`/app/dashboard`) | DashboardViewSwitcher → EzrabAiDashboardView (default "modern") / EzrabAiDashboardViewClassic ("klasik") | Kartu statistik, daftar proyek, insight; hero + maskot 3D di kedua varian | MED–HIGH — modern: `<style>` inline @media 1120/1000/640, anotasi hero hilang ≤1120px; klasik: `.mascot-stage` `width: clamp(280px, 26vw, 380px)`, teks hero maxWidth 580px; `workspace-mobile-fixes.css` hanya menarget varian klasik | P0 |
| proyek (`/app/projects`) | ProjectsView + CreateProjectModal | Grid kartu proyek; modal form (pola aman ✔); tombol "Buat Proyek Baru" | MED — kepadatan kartu & filter di 320px perlu uji | P0 |
| daftar-pekerjaan (`/app/pekerjaan`, `/app/projects/:id/estimate?view=work-items`) | DaftarPekerjaanView (`components/workItems/`) | Daftar item pekerjaan | MED | P1 |
| ezrab-ai (`/app/ezrab-ai`) | EzrabAiView (`ai-tools/ezrab-ai/view.tsx` + ezrab-ai-chat.css) | Chat, composer in-flow, overlay wizard/studio (pola aman ✔) | MED–HIGH — lihat R-05 | P0 |
| ded-ai (`/app/ded-ai`) | DedAiEstimateView + DedAiResultView (`ai-tools/ded-ai-estimate/`) | Tabel hasil min-width 860px **di dalam** `.dedai-table-wrap{overflow-x:auto}` ✔ terisolasi; form upload; modal Isi Cepat | MED — tabel aman secara pola; kartu ringkasan & form di 320px perlu uji | P0 |
| magic-ai (`/app/magic-ai`, mode ded-rab) | MagicAiSuperView → DedAnalysisDashboard (`components/magic-ai/`, 1004 baris) | Upload DED, kartu statistik, tabel hasil (`overflow-x-auto` ✔ baris 886), filter status | **HIGH — R-01: grid statistik/layout memakai kelas Tailwind yang tidak ter-build** | P0 |
| dokumen-ai (`/app/dokumen-ai`) | DokumenAiView (`ai-tools/document-ai/`) | `.docai-table` min-width 720px di dalam `.docai-tablewrap{overflow-x:auto}` ✔; tab strip overflow-x auto ✔ | MED | P1 |
| kredit-ai (`/app/kredit-ai`) | CreditPage (`ai-credits/`, ai-credits.css) | Kartu saldo, paket top-up (simulasi) | MED | P1 |
| rab-estimasi + 6 tab (`/app/estimate?tab=…`) | RabEstimasiView (1373 baris) + EstimatorToolbar + EstimatorSpreadsheetTable + SpreadsheetFooter | Spreadsheet RAB: tabel di dalam `overflowX:auto` ✔ (EstimatorSpreadsheetTable.tsx:156), th Uraian min-width 180px; toolbar padat; footer total; banyak modal (SmartAdd, generator, dsb.) | MED–HIGH — pola scroll benar; risiko pada toolbar, target sentuh sel inline-edit, footer sticky | P0 |
| manajemen-proyek (`/app/management`, project dashboard) | ManajemenProyekView | Kartu & panel proyek | MED | P1 |
| ahsp-2026 (`/app/ahsp`) | AhspExplorerView (2103 baris) | Pencarian + daftar analisa; `overflowX:'auto'` pada :782 | MED | P0 |
| qto (`/app/qto`) | QtoRekapVolumeView | Tabel rekap volume | MED | P1 |
| qto-vc (`/app/volume-calculation`) | QtoCalculatorView (3147 baris) | Form kalkulator banyak tipe; beberapa `overflowX:'auto'` | MED | P1 |
| template-rab (`/app/template-rab`) | TemplateRabCatalogView (TemplateRabMinimal.css) | Katalog kartu + konfigurator template (UniversalTemplateConfigurator memuat teks "Buat Proyek Baru") | MED | P1 |
| dokumen-tender (`/app/tender-documents`) | TenderDocumentsView + workspace dokumen `components/document/*` | Modal review dokumen; **kelas Tailwind mati juga di sini (R-01)** | MED–HIGH | P1 |
| keuangan-proyek + termin/invoice/pemasukan/pengeluaran/cash-flow (`/app/finance`) | ProjectFinanceView (KeuanganMax.css, CashFlowChart.css) | Tabel transaksi, grafik cash flow | MED | P1 |
| laporan / boq / rekapitulasi (`/app/reports`, `reports/:view`) | LaporanView (LaporanMax.css) | Tabel laporan, pratinjau ekspor | MED | P1 |
| database-material / upah / alat / harga-proyek (`/app/resources?type=…`) | MaterialDatabaseView (2685 baris) | Tabel harga min-width 920px **di dalam** `overflowX:auto` ✔ (:1880); **kotak pencarian `minWidth:'300px'` dalam flex row (:1093) — hazard nyata di 320px**; strip tab overflow-x auto ✔ | MED–HIGH | P0 |
| suppliers (`?type=suppliers`) | ResourceLibraryView | Daftar supplier | MED | P2 |
| kurva-s / jadwal (project) | ManajemenProyekView (WorkspaceView.tsx:695) | Grafik kurva S / jadwal — padding main tetap 20px 24px | MED | P1 |
| export | LaporanView (WorkspaceView.tsx:699) | Lihat laporan | MED | P2 |
| pengaturan (`/app/settings`, `/app/account/preferences`) | PengaturanView (+ UnifiedSettingsView — **file remediation, jangan disentuh**) | Form panjang, banyak seksi | MED | P1 |
| subscription (`/app/subscription`) | PricingSection (komponen landing dipakai ulang di workspace) | Grid kartu harga | MED | P2 |
| blog-admin (`/app/blog`) | BlogAdminPage (gate capability) | Editor CMS | LOW (internal) | P3 |
| enterprise (`/app/enterprise`) | — | Route `not-found` **by design** (routes.ts) — 404 jujur | — | — |

Overlay global workspace: EzrabCoAssistantChatbox (floating; mobile `width: 100vw` — EzrabCoAssistantChatbox.tsx:925, perlu uji tepi), RabGeneratorModal ✔ pola aman, OnboardingTour/FeatureTutorialPlayer (tooltip `min(320px, calc(100vw - 32px))` ✔), Toast (`min(420px, calc(100vw - 32px))` ✔).


---

## 4. Analisis Hero Landing (kode) vs Gejala di Master Prompt

Hero live = **CinematicHero** (`components/landing/cinematic/CinematicHero.tsx` + `cinematic-hero.css`, 1006 baris). Komposisi: backdrop WebGL (ArchitecturalBackground) + veil + grid; kolom copy (headline, subheadline, **satu** CTA "Mulai dengan EZRAB", note, baris ikon fitur) lalu stage produk (ProductStage: frame miring 3D berisi mock dashboard berganti scene, badge melayang QTO/AHSP/Harga/RAB/DED/AI). **Tidak ada maskot dan tidak ada tombol "Buat Proyek Baru" di hero ini.** `ExactHero.tsx` (hero lama berkelas `.ez-hero-*`) **tidak di-import siapa pun** — dan sebagian besar `exact-landing-flagship-mobile.css` menarget kelas hero lama itu (`.ez-hero-h1 max-width:350px`, `.ez-hero-visual-center width:540px`, `.ez-card-*`) = **CSS mati untuk hero**, walau aturan navbar (`.ez-nav-*`) dan showcase (`.ez-stacked-*`) di file yang sama masih hidup.

Perilaku mobile CinematicHero yang sebenarnya (cinematic-hero.css):
- `<1024px`: layout kolom (copy di atas, stage di bawah) — kolom teks selebar layar, bukan kolom sempit.
- `@media (max-width: 639px)` (baris 979): padding 72px 18px 44px; **stage diratakan** (`transform:none`, animasi mati), orbit badge disembunyikan, sidebar mock disembunyikan, tabel mini diperkecil (font 10px, kolom pertama max 120px).
- Headline: `font-size: clamp(32px, 5vw, 52px)` dengan `<br/>` keras di JSX (3 baris paksa). Pada 320–390px ukuran berhenti di lantai 32px sehingga baris paksa ke-2 ("dengan mudah, cepat, dan terkendali") tetap membungkus lagi — headline bisa tampil 4–5 baris tidak seimbang.
- Badge desktop diposisikan negatif (`left:-24px/-30px`, `right:-28px`) — aman di desktop karena `.ch-hero{overflow:hidden}`, dan disembunyikan total di ≤639px.
- Backdrop WebGL selalu aktif (mode lebih ringan di mobile = keputusan produk lama; di luar wewenang audit ini untuk mengubahnya — risiko performa dicatat di R-08).

Penilaian per gejala yang dilaporkan master prompt:

| Gejala | Putusan statis | Bukti kode |
|---|---|---|
| Teks hero membungkus banyak baris, kolom sangat sempit | **UNCONFIRMED untuk landing saat ini** — kolom copy full-width <1024px. Satu-satunya "kolom sempit" di kode adalah `.ez-hero-h1{max-width:350px}` milik hero lama yang sudah pensiun. Dugaan: screenshot dari build production lama / permukaan lain (hero dashboard punya teks maxWidth 580px + maskot). Wajib reproduksi live di ezrab.site & bandingkan dengan Preview branch ini. | CinematicHero.tsx; flagship-mobile.css:147-155 (dead); EzrabAiDashboardViewClassic.tsx:189 |
| Maskot terlalu besar / terpotong kanan | **NOT REPRODUCED di landing** — hero tidak punya maskot. Maskot ada di hero *dashboard* (kedua varian) dan chat. Di klasik, stage `clamp(280px,26vw,380px)` + `overflow:visible` + badge anotasi absolut = kandidat terpotong di tepi bila induk memotong; varian modern menyembunyikan anotasi ≤1120px. | Classic:303-316; modern:261-267, 380-414 |
| Maskot utama & kecil bertumpuk | **UNCONFIRMED** — kandidat: dashboard (maskot hero + co-assistant launcher melayang + tombol AI bottom nav) dan chat (maskot header 44px + maskot empty-state). Perlu reproduksi live per permukaan. | view.tsx (chat), WorkspaceView (launcher), global.css:560 |
| Teks tombol "Buat Proyek Baru" bertumpuk | **Bukan elemen landing.** Teks persis ini ada di ProjectContextSelectorModal.tsx, DedRabWorkflowView.tsx, UniversalTemplateConfigurator.tsx; tombol buat proyek juga di ProjectsView/dashboard. Perlu reproduksi di permukaan itu (kemungkinan flex tanpa min-width:0 / label panjang di tombol sempit). | grep "Buat Proyek Baru" (3 file) |
| Tombol utama/sekunder terlalu tinggi/sempit | **UNCONFIRMED untuk hero** — hero hanya punya 1 CTA pill (padding 14px 28px, flex-wrap). Kandidat lain: `.ez-hero-actions` hero lama (dead) dan CTA navbar. | cinematic-hero.css:125-162 |
| Carousel/kartu fitur terpotong & bertumpuk di sisi layar | **PLAUSIBLE — kandidat kuat: ExactStackedShowcase.** Desktop: viewport sticky + layer kartu absolut bertumpuk dengan transform (exact-landing.css:2762-2867). Mobile ≤767px flagship CSS mengubahnya jadi grid vertikal (position:relative, transform:none). Risiko nyata bila: (a) CSS inti `exact-landing.css` belum termuat (deferred dynamic import) sementara override mobile sudah — jendela tampilan rusak; (b) urutan/specificity berubah. ProductStage hero juga "carousel scene" (dots + autoplay) tetapi di dalam frame overflow-hidden. | exact-landing.css:2762+; flagship-mobile.css:264-305; ExactLandingPage.tsx:40-42 |
| Overflow horizontal global | **Terjadi tetapi DIMASKER** tiga lapis (§2.2). Elemen penyebab per halaman belum teridentifikasi — perlu pengukuran live per elemen. | global.css:26, 683; flagship-mobile.css:14 |
| Navbar mobile | Pola ada & hidup: pada ≤767px navbar jadi floating glass (top/left/right 10px, h 58px), link disembunyikan, trigger hamburger 40px + menu dropdown; **CTA primer navbar `display:none` pada ≤374px** (flagship-mobile.css:378) — di ponsel 320px tombol "Coba Gratis" hilang dari navbar (tersisa di dalam menu) → temuan P1 statis. | flagship-mobile.css:21-107, 376-383; ExactNavbar.tsx:99 |

## 5. Register Risiko Komponen Kompleks

| ID | Komponen | Mode kegagalan mobile yang harus diuji live | Bukti statis |
|---|---|---|---|
| R-01 | **DedAnalysisDashboard** (Magic AI/DED Flow B) + workspace dokumen `components/document/*` | Grid statistik 4-kolom & layout 12-kolom **tidak pernah terbentuk** (kelas Tailwind tanpa Tailwind): kartu menumpuk full-width tanpa gap di semua lebar; di desktop pun rusak. Di mobile tampil "bertumpuk rapat" — cocok dengan keluhan kartu bertumpuk. | DedAnalysisDashboard.tsx:561, 619, 788 (10 pemakaian kelas); package.json tanpa tailwind |
| R-02 | Shell workspace | Overflow ter-clip senyap oleh `.ezrab-workstation-scrollable{overflow-x:hidden}` — konten lebar hilang tanpa indikator scroll. | global.css:683 |
| R-03 | MaterialDatabaseView | Baris pencarian `minWidth:300px` dalam flex: pada 320px (padding main 14px×2 → ±292px efektif) memaksa overflow/clip; tabel 920px sendiri aman (wrapper scroll). | MaterialDatabaseView.tsx:1093, 1880-1885 |
| R-04 | Dashboard (modern & klasik) | Hero maskot: tumpang tindih teks/stage saat kolom menyempit; varian klasik hanya tertolong fixes ≤767px yang menarget kelasnya, varian modern bergantung pada `<style>` inline sendiri (1120/1000/640). Quick-action grid & split di 320px. | EzrabAiDashboardView.tsx:255-267; Classic:149-316; workspace-mobile-fixes.css:12-31 |
| R-05 | Ezrab Chat AI | (a) `.ezchat2{height:calc(100vh-64px); min-height:480px}` — 100vh (bukan dvh): risiko tertutup chrome browser/keyboard; ≤767px dikoreksi mengurangi 58px bottom nav + min-height 420px, tetapi landscape pendek tetap dipaksa 420px → scroll ganda di dalam scroller workspace. (b) Header chat: maskot 44px + judul + segmented Cepat/Mendalam + tombol Baru + chip kredit dalam satu baris flex tanpa wrap — risiko terjepit di 320px. (c) Jawaban AI berisi tabel markdown/pre — pembungkus overflow-nya belum terverifikasi statis. | ezrab-ai-chat.css:2, 4-6; view.tsx:534-580 |
| R-06 | RabEstimasiView + EstimatorSpreadsheetTable | Pola tabel benar (scroll terisolasi). Risiko: toolbar padat (banyak aksi + search), target sentuh input sel kecil, SpreadsheetFooter total, modal bertumpuk (generator → picker AHSP). Uji edit volume/harga pada 360px. | RabEstimasiView.tsx:915; EstimatorSpreadsheetTable.tsx:156-203 |
| R-07 | TopBar + Sidebar drawer 768–1023px | Gap perilaku: drawer aktif (<1024) tetapi fixes safe-area hanya ≤767; bottom nav absen. Hamburger 32px < pedoman 44px. | Sidebar.tsx:298; workspace-mobile-fixes.css:33-38; TopBar.tsx:291-311 |
| R-08 | Landing (performa & urutan CSS) | (a) `exact-landing.css` deferred → FOUC/section tanpa gaya sesaat di jaringan lambat, termasuk base `.ez-stacked-*` desktop yang ditumpuk transform. (b) Backdrop WebGL hero + animasi stage kontinu di ponsel (baterai/GPU); `prefers-reduced-motion` dihormati sebagian (badge/stage), drift bg-img dimatikan ✔. | ExactLandingPage.tsx:40-42; cinematic-hero.css:999-1006 |
| R-09 | Bottom nav dark mode | Bilah putih hardcode + border putih tombol AI di tema gelap; label item 10.5px (keterbacaan). | global.css:517-575 |
| R-10 | DedAiResultView / DokumenAiView | Tabel aman (wrapper scroll). Risiko tersisa: sel min-width 200px (ResultView:470) membuat scroll horizontal panjang; kartu ringkasan & badge status di 320px; modal Isi Cepat massal. | DedAiResultView.tsx:454-470; document-ai.css:46 |
| R-11 | QTO (QtoCalculatorView 3147 baris, QtoRekapVolumeView) | Form kalkulator multi-tipe dengan grid inline beragam; TechnicalReferenceViewer fullscreen memakai `100vw` (aman konteks fullscreen, uji tepi). | QtoCalculatorView.tsx:1852, 2588; TechnicalReferenceViewer.tsx:144 |
| R-12 | Co-assistant melayang (EzrabCoAssistantChatbox) | Panel mobile `width:100vw` (:925) — risiko tepi/safe-area & konflik z dengan bottom nav (9980) dan drawer (9999). | EzrabCoAssistantChatbox.tsx:911-925 |
| R-13 | AHSP Explorer, Laporan, Keuangan, Pengaturan | View besar dengan CSS sendiri (LaporanMax, KeuanganMax) — belum diaudit baris-per-baris; pola umumnya kartu+tabel. Risiko MED generik: toolbar filter bertumpuk, grafik cash flow lebar tetap. | AhspExplorerView.tsx:782; LaporanMax.css; KeuanganMax.css |
| R-14 | Wizard RAB & Design Studio (overlay chat) | Overlay aman (92vh, scroll internal); RabWizard kartu tipe grid auto-fit minmax(100px) — pada 320px jadi 2 kolom sempit; spreadsheet studio minWidth 900 di dalam wrapper scroll ✔ (perilaku dari sesi sebelumnya). | view.tsx:778-815; RabWizard.tsx |

## 6. Rencana Perbaikan (PLAN ONLY — belum ada implementasi)

### P0 — penghalang alur inti / rusak terbukti statis
1. **R-01 Tailwind mati di DedAnalysisDashboard + `components/document/*`** — ganti kelas utilitas mati dengan CSS/inline style berbasis token yang sudah dipakai file sekitarnya (BUKAN memasang Tailwind — perubahan sistem). File: `src/components/magic-ai/DedAnalysisDashboard.tsx`, `src/components/document/*.tsx` (8 file terdeteksi). Terima: grid statistik & layout terbentuk di semua lebar; gap konsisten.
2. **Pengukuran overflow live sebelum menyentuh CSS global** — reproduksi per route dengan Playwright (viewport 320/360/390/430/768/1366/1440), catat elemen dengan `scrollWidth>clientWidth`; JANGAN melepas `overflow-x:hidden/clip` sebelum penyebab per elemen terpetakan (melepasnya tanpa perbaikan = regresi visual massal).
3. **Hero dashboard (R-04)** — samakan perilaku kedua varian di ≤767px (tumpuk vertikal, maskot dibatasi, teks full-width) ke dalam satu tempat (workspace-mobile-fixes.css diperluas ke kelas modern `.ezdb-*` atau rapikan `<style>` inline modern). File: `src/styles/workspace-mobile-fixes.css`, `src/components/dashboard/EzrabAiDashboardView.tsx`.

### P1 — hambatan penggunaan nyata
4. **R-03** pencarian MaterialDatabaseView: `minWidth:300px` → `min-width:0; flex:1 1 220px` + flex-wrap pada baris filter. File: `src/components/materials/MaterialDatabaseView.tsx:1093`.
5. **Navbar landing ≤374px**: CTA primer tidak hilang total (kecilkan padding/font saja). File: `src/styles/exact-landing-flagship-mobile.css:376-383`.
6. **Chat (R-05)**: `.ezchat2` → `100dvh` + turunkan min-height mobile; header chat boleh membungkus (flex-wrap) di ≤480px. File: `src/ai-tools/ezrab-ai/ezrab-ai-chat.css`, `src/ai-tools/ezrab-ai/view.tsx` bila perlu.
7. **Bottom nav dark mode (R-09)** + **drawer 768–1023 safe-area (R-07)**: warna bilah dari token surface; samakan ambang fixes ke <1024 atau pindahkan `height:100dvh`+safe-area ke style drawer itu sendiri. File: `src/styles/global.css:517-575`, `src/components/layout/Sidebar.tsx:298`, `src/styles/workspace-mobile-fixes.css`.
8. **Hamburger 32px → ≥40px** (TopBar.tsx:291-311) dan audit target sentuh <44px pada kontrol shell lain.
9. **ExactStackedShowcase**: pastikan base CSS section tidak bergantung pada stylesheet deferred untuk tampilan mobile yang benar (muat aturan kritis showcase di landing-critical.css atau terima FOUC secara sadar + uji). File: `src/components/landing/ExactLandingPage.tsx`, `src/styles/landing-critical.css`.

### P2 — konsistensi & polish
10. **Konsolidasi breakpoint**: tetapkan skala resmi (mis. 480/768/1024/1280) sebagai token/komentar sistem di ezrab-design-system.css dan migrasi bertahap file dengan ambang menyimpang (1120, 1100, 1080, 960, 900, 860, 720, 700, 639, 560, 540) — bertahap per modul, bukan big-bang.
11. Samakan padding `<main>` mobile semua cabang WorkspaceView (pakai pola adaptif dashboard).
12. Bersihkan CSS mati hero lama (`.ez-hero-*`, `.ez-card-*`, `.ez-magic-*` di flagship-mobile.css) SETELAH verifikasi live tidak ada permukaan yang memakainya — mengurangi risiko salah target di masa depan.
13. Uji aksesibilitas: kontras label bottom nav 10.5px, status tidak hanya warna (sudah ada label teks di badge DED ✔), urutan tab drawer/modal, `prefers-reduced-motion` untuk animasi dashboard.

## 7. Keterbatasan audit ini
- **Statis penuh**: tidak ada route yang dibuka di browser; seluruh status = NOT_TESTED. Gejala dari screenshot user tidak dapat dipasangkan ke build tertentu dari kode saja — ezrab.site production dapat menyajikan build berbeda dari HEAD branch ini (riwayat sesi: aset production pernah berubah di luar sesi ini). Reproduksi live wajib membedakan: production ezrab.site vs Preview branch `integrasi/unified-ui-engine` vs lokal.
- File raksasa (MaterialDatabaseView 2685, QtoCalculatorView 3147, AhspExplorerView 2103 baris) diaudit via pola terarah (min-width/overflow/grid), bukan dibaca utuh.
- Tidak ada perubahan backend/billing/harga/AHSP/auth/secret/database yang diusulkan di rencana ini; seluruh butir rencana adalah CSS/presentasi kecuali R-01 (penggantian kelas mati dengan gaya ekuivalen, tanpa mengubah logika).
