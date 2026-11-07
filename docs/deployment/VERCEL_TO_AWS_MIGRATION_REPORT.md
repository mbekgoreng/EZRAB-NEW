# EZRAB — Laporan Migrasi Vercel → AWS (Fase 9)

- Tanggal: 2026-11-07 · Branch `integrasi/unified-ui-engine` · HEAD `5dbb90a`
- Sifat: pekerjaan LOKAL. Tidak ada resource AWS dibuat, tidak ada DNS
  diubah, tidak ada deployment Vercel disentuh, tidak ada commit/push.
- Bukti pendukung: `~/workspace/your_files/EZRAB-AWS-MIGRATION/`
  (`audit-dependencies.md`, `audit-database-supabase.md`,
  `feasibility-api-runner.md`).

**Legenda status:** IMPLEMENTED = kode/konfigurasi dibuat ·
TESTED LOCALLY = terbukti dengan uji yang benar-benar dijalankan ·
READY FOR AWS = siap dijalankan di AWS begitu owner memberi otorisasi ·
DEPLOYED TO AWS = **tidak ada satu pun pada tahap ini** ·
NOT YET VERIFIED = belum terbukti, dinyatakan apa adanya.

---

## 1. Arsitektur Vercel saat ini (terverifikasi dari repo)

- Frontend: SPA Vite/React, build `npm run build:full` (vite build +
  prerender blog), output `dist`, preset framework vite di `vercel.json`.
- Backend produksi: **11 Serverless Functions** di `api/` (JS ESM, gaya
  Node `req/res`) + **1 Edge Middleware** (`middleware.ts`: gerbang akses
  cookie HMAC untuk `/app/*` + API sensitif, plus rewrite root blog) =
  12 unit — persis batas Hobby. `functions.maxDuration 300` untuk
  `api/ai/**`.
- `server/` (TypeScript, ±70 service) adalah backend dev-only: hidup
  lewat plugin middleware Vite di lokal + `server/index.ts` yang tidak
  punya jalur jalan resmi. **Ia BUKAN backend produksi** — produksi tidak
  mengenal `/api/projects*` sama sekali.
- Data: persistence aktif = `localStorage` browser (`ezrab_prod_*`).
  Supabase (proyek yang dirujuk konfigurasi) ter-wire sebagai jalur
  opsional env-gated: Auth, query data, Storage branding, RLS — semuanya
  dormant dalam konfigurasi terbukti (lihat §4).
- Eksternal: provider AI via HTTPS dari gateway sendiri, Serper (market
  search), Resend (email undangan, opsional), `@vercel/analytics`
  (satu-satunya analitik; endpoint koleksinya milik Vercel).

**Koreksi terhadap asumsi awal sesi:**
1. "Pohon `server/` tidak dijalankan Vercel" — BENAR, dan lebih tajam:
   `server/` juga tidak punya cara jalan resmi di mana pun.
2. "Migrasi Phase 3 diterapkan via dashboard 2026-10-08" — TIDAK DAPAT
   DIKONFIRMASI dari repo: header kesepuluh file migrasi menyatakan
   NOT APPLIED/UNKNOWN dan tes RLS "NOT EXECUTED". Keadaan Supabase live
   adalah **NEEDS VERIFICATION oleh owner di dashboard** (inventarisasi
   disiapkan di dokumen audit DB §5.0). Keputusan migrasi tidak boleh
   bertumpu pada salah satu versi cerita ini.
3. DNS ezrab.site dikelola Vercel — berdampak ke cutover (A record harus
   diubah di Vercel DNS atau DNS dipindah; lihat AWS_DEPLOYMENT.md).

## 2. Dependensi Vercel yang ditemukan (ringkas; tabel penuh di audit)

| # | Dependensi | Klasifikasi | Penanganan pada migrasi ini |
|---|---|---|---|
| 1 | `vercel.json` build/output/preset | MUST REPLACE | Dockerfile.web menjalankan `build:full` yang sama — IMPLEMENTED |
| 2 | Rewrites SPA + blog host | MUST REPLACE | Nginx `try_files` + blok host blog (nginx/ezrab.conf) — IMPLEMENTED, perilaku blog root NOT YET VERIFIED di production (di Vercel pun belum pernah terbukti) |
| 3 | Security headers vercel.json | ALREADY PORTABLE | Disalin 1:1 ke Nginx — IMPLEMENTED |
| 4 | `maxDuration 300` AI | MUST REPLACE | Timeout proxy 300 dtk di Nginx — IMPLEMENTED |
| 5 | Routing file-based api/ + `[action]` | MUST REPLACE | Runner Node persisten dengan peta rute persis 11 handler (deployment/runner/server.mjs) — IMPLEMENTED + TESTED LOCALLY |
| 6 | Handler gaya Node req/res | ALREADY PORTABLE | Diimpor apa adanya oleh runner; nol logika bisnis ditulis ulang — TESTED LOCALLY |
| 7 | Body ter-parse platform vs stream | NEEDS VERIFICATION | Runner mem-parse JSON (batas 4,5 MB) DAN handler toleran stream via readJsonBody; jalur yang teruji: access, credits, invitations, ai GET — POST AI penuh NOT YET VERIFIED (butuh kunci provider) |
| 8 | Logika gate middleware (HMAC) | ALREADY PORTABLE | Runner memakai `api/_lib/accessGate.js` (kembaran Node yang ter-cross-test) — TESTED LOCALLY |
| 9 | Titik intersepsi Edge | MUST REPLACE | Gate ditegakkan di runner untuk API; dokumen /app mengandalkan pemeriksaan sesi SPA + opsi auth_request (AWS_DEPLOYMENT.md §6) — sebagian NOT YET VERIFIED |
| 10 | `VERCEL_ENV` penentu production | MUST REPLACE | **DIPERBAIKI**: `APP_ENV=production` diakui setara di `api/_lib/security.js` + `api/_lib/invitations/core.js` (aditif, perilaku di Vercel tidak berubah; tes undangan 56 PASS + gateway security ALL PASSED) — IMPLEMENTED + TESTED LOCALLY |
| 11 | CORS allowlist pola preview Vercel | MUST REPLACE | Isi allowlist diatur lewat `CORS_ALLOWED_ORIGINS` di env server; pola lama dibiarkan di kode (tidak aktif tanpa origin itu) — READY FOR AWS (owner mengisi env) |
| 12 | Asumsi IP platform (XFF entri terakhir) | NEEDS VERIFICATION | Nginx menyetel X-Real-IP dari `$remote_addr` dan meneruskan XFF — konsisten dengan asumsi kode; verifikasi ulang di belakang ALB/CloudFront bila kelak dipakai |
| 13 | `@vercel/analytics` di `src/main.tsx` | MUST REPLACE (keputusan owner) | Dibiarkan apa adanya: di luar Vercel komponennya tidak mengumpulkan data (endpoint tidak ada) — pengganti analitik adalah keputusan owner, bukan blocker migrasi |
| 14 | Rate limit in-memory per instance | NEEDS VERIFICATION | Di runner satu proses perilakunya menjadi global per proses (lebih kuat dari serverless); multi-instance kelak butuh store bersama |
| 15 | Supabase (Auth JWT, undangan) | CAN RETAIN | SaaS eksternal via HTTPS; hanya env yang berpindah tempat — READY FOR AWS |
| 16 | Resend, Serper, provider AI | CAN RETAIN | API eksternal via fetch/HTTPS — READY FOR AWS |
| 17 | Vercel Cron, Blob, `VERCEL_URL`, Edge runtime declaration | CAN RETAIN — tidak ada | Terbukti 0 hit; job terjadwal berjalan di cron lokal Muse, bukan Vercel |
| 18 | `.vercelignore` | MUST REPLACE (mekanisme) | `.dockerignore` dibuat membawa daftar eksklusi yang setara — IMPLEMENTED |

## 3. File yang dibuat atau diubah oleh migrasi ini (persis)

**Baru (15):**
`Dockerfile.web`, `Dockerfile.api`, `docker-compose.yml`,
`docker-compose.production.yml`, `.dockerignore`,
`deployment/runner/server.mjs`, `deployment/smoke/serve.mjs`,
`deployment/.env.example`, `nginx/ezrab.conf`,
`scripts/deployment/deploy.sh`, `scripts/deployment/health-check.sh`,
`scripts/deployment/backup.sh`, `scripts/deployment/restore.sh`,
`docs/deployment/AWS_DEPLOYMENT.md`,
`docs/deployment/AWS_TO_VPS_MIGRATION.md`,
`docs/deployment/VERCEL_TO_AWS_MIGRATION_REPORT.md` (dokumen ini).

**Diubah (2, keduanya aditif & teruji tidak mengubah perilaku di Vercel):**
`api/_lib/security.js` dan `api/_lib/invitations/core.js` — pengenalan
`APP_ENV=production` sebagai penanda produksi portabel (§2 baris 10).

**Tidak disentuh:** seluruh perubahan lokal owner yang belum ter-commit
(billing Free v1.2, trial demo billing, landscape game, output cron
audit) — terverifikasi dari `git status` akhir: daftar file owner identik
dengan awal sesi, tambahan hanya file migrasi di atas. Tidak ada nilai
AHSP/harga/koefisien/formula yang berubah (pekerjaan ini infrastruktur).

## 4. Kesiapan database

- Provider terancang: Supabase (Postgres + Auth). Provider berjalan:
  localStorage browser. Di antara keduanya: kode Supabase lengkap tetapi
  dormant (`AUTH_ENABLED=false`, adapter kredit placeholder yang menjawab
  503 jujur, ledger/usage store in-memory, migrasi berheader NOT APPLIED,
  konflik skema yang harus diputuskan: migrasi #1/#2 vs kanonis #3, dan
  dua generasi skema kredit #6 vs #9+#10).
- **Keputusan: Supabase cloud DIPERTAHANKAN selama masa AWS** (jalur
  hybrid pada audit DB §4). AWS hanya meng-host aplikasi. Alasan: tidak
  ada data terpusat yang mendesak dipindah; pekerjaan fondasi (skema,
  adapter, aktivasi auth) sama di semua jalur dan termurah diselesaikan
  di tempat sekarang; kopling Auth Supabase adalah risiko terbesar dan
  tidak boleh dicampur dengan penggantian mesin DB.
- Backup/restore: prosedur + skrip aman disiapkan
  (`scripts/deployment/backup.sh`, `restore.sh` — restore menolak target
  produksi tanpa konfirmasi eksplisit; validasi row count/relasi/RLS di
  audit DB §5.3). **Status: READY (prosedur), NOT YET VERIFIED terhadap
  DB nyata** — tidak ada database yang diakses sesi ini, dan DB lokal
  untuk uji restore tidak tersedia (Docker absen, tidak ada Postgres
  lokal di VM).
- Migrasi data produksi: TIDAK DIPERLUKAN pada tahap ini (tidak ada data
  terpusat yang berjalan) — dan tidak ada yang dimigrasikan.

## 5. Hasil uji lokal (Fase 7) — yang benar-benar dijalankan

| Uji | Hasil |
|---|---|
| Runner melayani handler asli (Node langsung) | LULUS: `/health` 200; `/api/ai/engine-status` 200 dari handler asli (`status: no_keys` — jujur, tanpa kunci); `/api/access/session` 200 `configured:false`; `/api/invitations/<aksi-tak-valid>` 404 dari handler asli (routing `[action]` terbukti); rute tak dikenal 404 |
| Gerbang fail-closed | LULUS: POST `/api/credits/estimate` tanpa konfigurasi gerbang → 503 `ACCESS_NOT_CONFIGURED`, identik perilaku middleware |
| Restart runner | LULUS: proses dimatikan & dinyalakan ulang → health + session menjawab konsisten (sesi bersifat stateless HMAC; tidak ada state server yang hilang selain rate-limit in-memory, sesuai desain kode aslinya) |
| Build produksi | LULUS: `vite build` exit sukses "✓ built in 1m 58s" (heap 3072) di atas worktree berjalan (termasuk perubahan owner yang belum ter-commit) |
| Smoke topologi portabel | LULUS: server statis + proxy /api meniru container web→api: landing 200, rute SPA `/harga` 200, tiga endpoint API ter-proxy menjawab benar; screenshot Chromium headless membuktikan landing ter-render penuh dari build lokal |
| tsc | LULUS: exit 0 (solo, heap 6144) |
| `apiEndpointInventory.test.ts` | LULUS: 13/13 |
| `secureInvitation.test.ts` | LULUS: 56 PASS / 0 FAIL (memverifikasi patch APP_ENV) |
| `phase2GatewaySecurity.mjs` | LULUS: ALL PASSED (memverifikasi patch APP_ENV) |
| Docker compose build/up | **TIDAK DIJALANKAN — Docker tidak terpasang di VM ini** (`docker: command not found`, terbukti). Dockerfile/compose ditulis mengikuti praktik standar dan topologinya dibuktikan lewat padanan non-Docker di atas. Klasifikasi: struktur IMPLEMENTED, eksekusi Docker NOT YET VERIFIED |
| Upload persistensi volume | NOT APPLICABLE saat ini: aplikasi tidak menulis upload ke disk server (dokumen diolah di browser; satu-satunya storage backend adalah branding yang default-nya disk lokal pada backend dev `server/`). Volume disiapkan di compose untuk jalur itu |
| Backup/restore DB lokal | NOT YET VERIFIED (tidak ada Postgres/Docker lokal; prosedur diuji logika skripnya saja, bukan eksekusi) |
| PDF/Excel/QTO/AHSP | Logika murni frontend di dalam bundle yang lulus build; tidak ada perubahan perilaku (nol file logika disentuh) |

## 6. Kesiapan AWS & biaya

- Panduan lengkap: `docs/deployment/AWS_DEPLOYMENT.md` — EC2 Ubuntu LTS
  x86 (ARM ditunda sampai build terverifikasi di ARM), region
  `ap-southeast-1` (sama dengan Supabase), security group hak-paling-kecil
  (22 dari IP owner, 80/443 publik, tanpa port DB/3001 publik), user
  deploy non-root, SSH key-only, Nginx host + Let's Encrypt, AWS Budgets
  sebelum workload.
- Biaya: **tidak ada angka yang dikutip** — tidak dapat diverifikasi live
  dari sesi ini. Owner memeriksa AWS Pricing Calculator + kelayakan
  kredit di konsol akun aktual (daftar komponen ada di panduan).

## 7. Temuan keamanan

1. `VERCEL_ENV` sebagai penanda produksi tunggal — DIPERBAIKI (§2 #10).
2. Cookie sesi membaca `x-forwarded-proto` untuk flag Secure — rantai
   proxy Nginx disetel meneruskan header itu; salah konfigurasi di host
   akan menurunkan cookie menjadi non-Secure. Dicatat di panduan.
3. Rate limit & idempotensi in-memory: di serverless per-instance, di
   runner per-proses — dinyatakan, bukan disembunyikan.
4. Tidak ada secret yang terbaca nilainya sesi ini; `.env.example`
   deployment hanya memuat nama + penjelasan.
5. Gerbang dokumen /app di luar Vercel tidak seketat Edge Middleware
   secara bawaan (data tetap ter-gate di API); penegakan setara
   didokumentasikan sebagai opsi `auth_request` yang harus diuji di
   staging sebelum diaktifkan agar owner tidak terkunci.
6. **Bug laten pra-ada (bukan akibat migrasi, tidak diubah):**
   `api/market/search.js` memeriksa `auth.allow`/`auth.status`, padahal
   `authenticateRequest` mengembalikan `{ok, ...}` — endpoint itu selalu
   menjawab 401 di mana pun, termasuk di Vercel hari ini (terbukti pada
   uji feasibilitas runner). Ia terporting apa adanya; perbaikan satu
   barisnya berada di luar mandat migrasi dan dicatat di sini sebagai
   temuan untuk owner.
7. Kerapuhan runtime: `api/_lib/marketSearch/serperProvider.js`
   mengimpor file `.ts` dan hanya lolos karena type-stripping Node 24 —
   runtime server dipin ke Node 24 (Dockerfile memakai `node:24-alpine`;
   versi mesin uji v24.22.1, 11/11 handler terimpor bersih).

## 8. Portabilitas AWS → VPS

`docs/deployment/AWS_TO_VPS_MIGRATION.md` (11 bagian sesuai Fase 8).
Karena aplikasi adalah Compose yang sama dan database tidak tinggal di
EC2, cutover bulan keenam adalah pemindahan host + DNS dengan rollback
sederhana (kedua host membaca database cloud yang sama — tidak ada
divergensi data). Status: READY (dokumen), eksekusi NOT YET VERIFIED.

## 9. Blocker menuju AWS (butuh aksi/otorisasi owner)

1. **Otorisasi membuat resource AWS + akun AWS aktif** — belum ada.
2. **DNS**: A record ezrab.site saat ini di Vercel DNS — owner mengubah
   record atau memindahkan DNS saat cutover.
3. **Secret di server** (diisi owner langsung di `.env.docker` server):
   EZRAB_ACCESS_CODE, EZRAB_ACCESS_SESSION_SECRET, kunci provider AI
   yang dipakai, SUPABASE_URL/ANON bila jalur Supabase diaktifkan,
   RESEND_API_KEY bila email undangan dipakai.
4. **Verifikasi keadaan Supabase live di dashboard** (inventarisasi audit
   DB §5.0) — memutuskan apakah migrasi SQL perlu diterapkan, dan itu
   butuh grant terpisah (aktivasi auth/billing tetap pagar owner).
5. **Keputusan analitik** pengganti `@vercel/analytics` (atau menerima
   tanpa analitik di AWS).
6. **Uji Docker sesungguhnya** — perlu mesin dengan Docker (instance EC2
   itu sendiri pada staging pertama, atau VM lain) untuk menaikkan
   klasifikasi compose dari IMPLEMENTED ke TESTED.
7. Commit/push file migrasi ini — menunggu grant seperti biasa.

**DEPLOYED TO AWS: TIDAK ADA.** Yang selesai tahap ini: audit penuh,
struktur portabel terimplementasi, runner terbukti melayani handler asli
secara lokal, satu lock-in keamanan diperbaiki, dan seluruh prosedur
AWS + AWS→VPS terdokumentasi.
