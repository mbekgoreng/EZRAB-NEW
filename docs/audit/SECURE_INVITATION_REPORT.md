# LAPORAN AKHIR — EZRAB SECURE INVITATION & ROLE-BASED ONBOARDING

Tanggal: 2026-10-22 · Branch: `integrasi/unified-ui-engine` · Mode: implementasi lokal penuh, **tanpa commit/push/deploy/migrasi eksternal/email sungguhan**.

## 0. Kondisi branch & worktree

- **Sebelum:** HEAD `f15d8fec751ca8d56542731d71cf82699a9012cd` (catatan: brief menyebut d5b07d8, tetapi HEAD aktual saat pekerjaan dimulai adalah f15d8fe — pohon sudah bergerak; kondisi aktual yang dipakai). Staged: 0. Worktree kotor oleh batch paralel yang sudah ada: Batch 0B (`api/_lib/aiGateway.js` + wiring AtmoRouter), AI Document Paper System (`document-ai/*` + file baru `companyProfile/docTemplates/paperExport/paperModel/DocPanels`), Chat-to-RAB & Desain (`ai-design/*`, `ezrab-ai/*` + `directRab.ts`, WorkspaceView, dictionaries, TenderDocumentsView, aiProviderEngine, `indonesiaRegions.ts`, beberapa file tes).
- **Sesudah:** HEAD dan staged **tidak berubah** (tetap f15d8fe, 0 staged). Semua pekerjaan batch paralel utuh. Perubahan saya: **17 file baru** + **3 edit aditif minimal pada file bersama yang bersih** (App.tsx +13/−1, UnifiedSettingsView.tsx +7, .env.example +11). `Sidebar.tsx` TIDAK disentuh. Tidak ada `git add/commit/push` yang dijalankan.

## 1. Arsitektur autentikasi yang ditemukan (Fase A — fakta repo)

- **Provider:** Supabase Auth. Klien browser env-gated di `src/lib/supabase.ts` (anon key saja); konteks `src/auth/AuthContext.tsx` menyediakan signIn/signUp/signInWithGoogle/signOut/getAccessToken. Kebijakan password = kebijakan Supabase (min. 6 karakter); konfirmasi email ditangani provider.
- **Mode login:** `AUTH_ENABLED=false` hardcoded di `src/App.tsx:36`. `src/auth/authMode.ts` me-resolve tiga mode fail-safe: `open` (flag false), `real-login` (flag true + Supabase valid), `failsafe-demo` (flag true + Supabase tidak valid → tetap terbuka + banner; owner tidak pernah terkunci). Login demo (PIN role: `RoleContext`/`roleAccounts`/`PasscodeGate`) utuh dan tidak diubah.
- **Verifikasi server:** `api/_lib/supabaseAuth.js` (`verifySupabaseJwt`, verifier dapat diinjeksi untuk tes) + `api/_lib/security.js` (`authenticateRequest`: JWT → token statis → degraded; `rateLimit`, `applyCors`, `readJsonBody`). Pola endpoint: handler default-export tipis + fail-closed 503 saat belum dikonfigurasi (contoh `api/access/verify.js`).
- **Skema (draft migration, BELUM tentu diterapkan di live):** `supabase/migrations/20260913_auth_membership_foundation.sql` — `profiles` (FK auth.users + trigger `handle_new_auth_user`), `workspaces`, `workspace_members` (role CHECK: `SUPER_ADMIN, ESTIMATOR, DIREKSI, CLIENT, EDITOR`), `projects`, `project_members`, `audit_logs`; RLS aktif dengan policy baca-diri-saja; penulisan sensitif lewat service role. Resolver identitas server: `server/auth/supabaseIdentityResolver.ts`; service key dibaca server-side sebagai `SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY` (konvensi yang sama dipakai adapter baru).
- **Model perusahaan/workspace:** workspace = perusahaan; keanggotaan terpisah dari identitas (workspace_members), akses proyek terpisah lagi (project_members). Fixture rancangan cocok: PT Sinergi Konstruksi Nusantara adalah perusahaan seed demo.
- **UI manajemen pengguna yang ada:** tab "Tim & Anggota" di `src/components/settings/UnifiedSettingsView.tsx`, memakai `ClientUserManagementService` (**localStorage demo** `ezrab_workspace_users_v2` — BUKAN identitas; seed 4 pengguna, status `INVITED` ada di tipe tetapi tidak pernah dipakai; `AddUserModal` langsung mengaktifkan anggota). Capability `manage-users` menggerbang tab ini.
- **Sistem undangan sebelumnya:** TIDAK ADA (tidak ada tabel/token/flow undangan; kata "undang" hanya label UI).
- **Email transaksional:** TIDAK ADA provider apa pun di repo (tidak ada Resend/SendGrid/Nodemailer/SMTP di package.json/kode).
- **Routing publik:** App.tsx memakai pencocokan pathname untuk halaman publik (`/access`, `/about`, `/fitur`, …) di luar shell workspace — pola yang diikuti route baru.
- **Status Supabase live:** proyek `tjgadmctzwqgexdilekq` BELUM terverifikasi live (reconnect vault gagal 401; tes RLS live menunggu pemilik). Karena itu seluruh jalur produksi diimplementasikan lengkap tetapi dinyatakan **belum aktif** sampai pemilik mengaktifkan auth + menerapkan migration.

## 2. Desain yang diterapkan (Fase B)

Satu identitas (Supabase Auth), satu sistem login untuk semua role; role = otorisasi dari `workspace_members`, bukan login terpisah; keanggotaan ≠ identitas; tidak ada akses berdasar email/nama/input frontend (redeem mencocokkan email dari JWT terverifikasi ke email tersimpan); role undangan dari data tersimpan saja. Lapisan: `core` (aturan murni) → `repository` (Supabase = jalur produksi; in-memory = tes lokal saja, dilabeli jelas) → `service` (otorisasi + orkestrasi) → `handler`/endpoint tipis → klien UI.

## 3. File yang dibuat dan diubah

**Baru (17):**
- `supabase/migrations/20261022_workspace_invitations.sql` — tabel + RPC atomik (Fase G).
- `api/_lib/invitations/core.js` — token/hash/expiry/role whitelist/validasi/summary aman/base URL.
- `api/_lib/invitations/repository.js` — adapter Supabase (produksi) + in-memory (tes).
- `api/_lib/invitations/email.js` — abstraksi email + mock sink + provider Resend (env-gated).
- `api/_lib/invitations/service.js` — create/validate/redeem/revoke/resend/list + audit event.
- `api/_lib/invitations/handler.js` — handler HTTP (CORS, rate limit, autentikasi, bentuk respons) dengan injeksi dependensi untuk tes.
- `api/invitations/{create,list,validate,redeem,revoke,resend}.js` — 6 endpoint tipis.
- `src/services/invitationClient.ts` — klien API UI (token dari sesi Supabase yang ada).
- `src/components/auth/AcceptInvitationPage.tsx` — halaman penerimaan publik.
- `src/components/settings/TeamInvitationsPanel.tsx` — panel manajemen undangan.
- `src/test/secureInvitation.test.ts` — suite tes (56 pemeriksaan).

**Diubah (3, aditif minimal — RISIKO LINTAS-BATCH ditandai):**
- ⚠️ `src/App.tsx` (+13/−1): import + parse `/accept-invitation/<token>` + branch render publik + judul dokumen. File ini bersih sebelumnya; satu-satunya "penghapusan" adalah perubahan `if (isAccess)` menjadi `else if` agar branch baru mendahului. Bila batch lain kelak mengedit App.tsx, gabungkan dengan hati-hati.
- ⚠️ `src/components/settings/UnifiedSettingsView.tsx` (+7): import + render `TeamInvitationsPanel` di akhir tab users (daftar anggota demo di atasnya tidak diubah).
- ` .env.example` (+11): dokumentasi env opsional fitur ini (PUBLIC_APP_URL, RESEND_API_KEY, EMAIL_FROM) — tanpa nilai.

## 4. Endpoint & halaman yang ditambahkan

- `POST /api/invitations/create` — admin workspace (JWT wajib) membuat undangan; 201 + link sekali tampil.
- `GET /api/invitations/list?workspaceId=&filter=` — daftar aman (tanpa hash) untuk admin workspace itu saja.
- `POST /api/invitations/validate` — publik, rate-limited; ringkasan aman atau pesan generik.
- `POST /api/invitations/redeem` — publik + JWT penerima; penebusan atomik.
- `POST /api/invitations/revoke` / `POST /api/invitations/resend` — admin workspace.
- Halaman publik: `/accept-invitation/<token>` (di luar shell & PasscodeGate; keamanan server-side).
- UI: panel "Undangan Aman (Secure Invitation)" pada Pengaturan → Tim & Anggota.

## 5. Skema migration yang disiapkan (BELUM diterapkan)

Tabel `public.workspace_invitations`: id uuid, workspace_id FK workspaces, email (ternormalisasi, CHECK lowercase), invitee_name, role CHECK ∈ (ESTIMATOR, DIREKSI, CLIENT, EDITOR) — **SUPER_ADMIN mustahil di level DB**, token_hash char(64) unik, status ∈ (PENDING, ACCEPTED, EXPIRED, REVOKED), email_status ∈ (not_sent, sent, failed), email_provider, project_ids text[], resend_of FK, created_by/accepted_by FK profiles, expires_at, accepted_at, timestamps. **Partial unique index**: maksimum satu PENDING per (workspace, email). Index token_hash & (workspace, status). **RLS aktif tanpa policy untuk authenticated/anon** — hanya service role/fungsi definer. Fungsi `accept_workspace_invitation(token_hash, user_id, email)` SECURITY DEFINER: SELECT … FOR UPDATE (serialisasi), cek status/expiry/email, tolak penimpaan role anggota lama, insert workspace_members + project_members + tandai ACCEPTED + audit `invitation.accepted` dalam SATU transaksi; hak eksekusi dicabut dari public/authenticated/anon. Validasi: **lolos parse grammar PostgreSQL (pglast, 10 statements)**. Migration TIDAK dijalankan ke database mana pun.

## 6. Kebijakan token, expiry, role, keamanan (Fase C/H)

- Token 32 byte `crypto.randomBytes`, base64url (43 char); yang disimpan hanya SHA-256 hex; perbandingan constant-time tersedia di core; token mentah hanya muncul di (a) respons create/resend kepada admin terautentikasi dan (b) badan email penerima. Tidak ada token di log/audit/UI daftar (dites).
- Expiry default tepat 24 jam (waktu server; maksimum 7 hari); status EXPIRED dihitung saat dibaca dan ditegakkan saat redeem.
- Sekali pakai: jalur produksi = transaksi + row lock fungsi DB; adapter tes = seksi kritis sinkron dengan baca-ulang baris (bug konkuren nyata ditemukan & diperbaiki selama pengujian — lihat §8).
- Resend: token lama dicabut (REVOKED) dulu, baris undangan baru dengan token+expiry baru + `resend_of`; token lama tak pernah hidup lagi. Undangan REVOKED tidak dapat di-resend (buat baru); ACCEPTED tidak dapat di-resend/dibatalkan.
- Role: whitelist ESTIMATOR/DIREKSI/CLIENT/EDITOR di core, service, DAN constraint DB; SUPER_ADMIN ditolak berlapis. Otorisasi pembuat/pengelola: membership SUPER_ADMIN pada workspace TARGET dari repository (bukan klaim frontend, bukan admin platform global).
- Anti-enumerasi: semua kegagalan validasi publik = satu pesan generik yang sama; ringkasan publik hanya perusahaan/role/nama/email-termask/status/expiry.
- Rate limit (pola security.js, per instance): create 30/10 mnt, validate 20/10 mnt, redeem 20/10 mnt per IP.
- Tidak ada open redirect: setelah sukses halaman mengarah ke `paths.dashboard()` internal yang tetap.
- Audit event `invitation.created/email_sent/email_not_sent/resent/revoked/accepted` berisi aktor+workspace+waktu saja (best-effort `audit_logs`).
- Kuota kursi/langganan: TIDAK ditegakkan — repo tidak memiliki aturan kursi authoritative (billing masih simulasi); dicatat sebagai celah sadar, bukan dilompati diam-diam.

## 7. Integrasi email & status konfigurasi SEBENARNYA (Fase F)

Abstraksi `EmailProvider` dibuat. **Tidak ada provider yang terkonfigurasi di repo/env saat ini** → provider aktif = `MockEmailProvider` (sink lokal): tidak mengirim apa pun, `email_status` tetap `not_sent`. `ResendEmailProvider` terimplementasi (POST api.resend.com, `delivered=true` hanya pada 2xx + message id) dan aktif hanya bila `RESEND_API_KEY` + `EMAIL_FROM` diset pemilik dengan domain terverifikasi (mis. no-reply@ezrab.site — verifikasi domain adalah aksi pemilik di Resend, TIDAK diklaim selesai). Isi email sesuai spec: nama penerima, perusahaan, role, tombol "Terima Undangan", masa berlaku 24 jam, petunjuk hubungi admin. Kegagalan email: undangan tetap tersimpan dengan status `failed`/`not_sent` yang jujur + jalur resend aman (token lama dicabut dulu — tidak ada token aktif ganda tak terkendali).

## 8. Pengujian — hasil AKTUAL (Fase I)

Suite baru `npx tsx src/test/secureInvitation.test.ts` → **56 PASS, 0 FAIL**. Cakupan terhadap 20 kasus wajib:
1 ✓ admin berwenang membuat · 2 ✓ non-admin/non-anggota ditolak 403 · 3 ✓ SUPER_ADMIN & role asing ditolak · 4 ✓ expiry tepat 24 jam · 5 ✓ token valid ditebus · 6 ✓ token invalid ditolak generik · 7 ✓ kedaluwarsa ditolak (validate+redeem) · 8 ✓ token terpakai ditolak · 9 ✓ token dibatalkan ditolak + non-admin tak bisa membatalkan · 10 ✓ konkuren: tepat satu berhasil · 11 ✓ email lain tak bisa mengambil · 12 ✓ role/workspace dari data tersimpan (manipulasi request tidak berpengaruh — redeem tidak menerima parameter role/workspace) · 13 ✓ akun yang sudah ada: redeem sekali, membership tidak ganda · 14 ✓ kegagalan redeem (email mismatch) tidak mengonsumsi undangan; konflik role anggota lama ditolak 409 · 15 ✓ kegagalan email → status `failed`, mock → `not_sent`, outbox mock tidak memuat token · 16 ✓ resend mencabut token lama · 17 ✓ undangan workspace lain tak terlihat (403) + daftar tanpa token_hash · 18 ✓ akses proyek hanya yang diizinkan · 19 ✓ regresi: `authMode.test.ts` PASS (matriks mode + PIN demo) & `test:core` 74/74 PASS — file auth lama tidak diubah · 20 ◑ UI: state loading/error/empty/not-configured/summary terverifikasi BROWSER lokal (build verifikasi cssMinify-off + Playwright, API di-stub di level HTTP dengan bentuk respons asli): halaman penerimaan menampilkan status "belum aktif" (skenario 503) dan ringkasan aman tanpa token mentah (skenario valid); panel tampil di Pengaturan → Tim & Anggota dengan banner jujur + filter. Alur UI penuh dengan backend live tidak dapat diuji (backend belum ada).

- **Temuan selama tes (diperbaiki):** adapter in-memory awalnya gagal kasus 10 — dua redeem bersamaan sama-sama berhasil karena membaca referensi objek basi dari `findByTokenHash`. Diperbaiki dengan baca-ulang baris di dalam seksi kritis (padanan in-memory dari row lock DB). Bug ini tidak menyentuh jalur Supabase (fungsi DB memakai FOR UPDATE), tetapi menunjukkan nilai tes konkuren.
- Regresi lain: `tsc --noEmit --skipLibCheck` **0 error**; build verifikasi (cssMinify off, BUKAN build standar) **exit 0** (1m 26s) — build standar di sandbox memang diketahui OOM sejak sebelum pekerjaan ini.
- Tes lama: TIDAK ada yang diubah/dihapus. Baseline price 69/2 tidak dijalankan ulang (di luar cakupan fitur ini; tidak ada file harga yang disentuh).

## 9. Keterbatasan yang belum dapat diuji

- Jalur Supabase nyata (adapter + RPC) belum dieksekusi terhadap database mana pun — migration belum diterapkan dan proyek live belum terverifikasi (401). Semantik adapter in-memory meniru kontraknya, tetapi itu bukan bukti perilaku Postgres/RLS live.
- Pengiriman email sungguhan: tidak diuji (by design) — Resend provider hanya terverifikasi kode.
- Rate limit bersifat per-instance serverless (keterbatasan pola yang sama dengan seluruh repo).
- UI panel memakai workspace demo (`ws-default`/nama dari profil demo) sebagai konteks tampilan; saat backend aktif, workspaceId harus berasal dari membership nyata pengguna — API sudah menolak selain admin workspace tsb., dan seam ini dinyatakan eksplisit di kode panel/laporan.
- `Referer` header: halaman penerimaan tidak memasang meta referrer khusus; token dikirim ke API lewat body POST same-origin dan tidak ada sumber eksternal di halaman itu, tetapi penambahan `<meta name="referrer" content="no-referrer">` khusus route ini adalah pengerasan lanjutan yang belum dilakukan.

## 10. Konfirmasi target keamanan proses

- Migration diterapkan ke database eksternal: **TIDAK** (hanya file lokal + validasi parse).
- Email sungguhan dikirim: **TIDAK** (mock sink; tidak ada undangan nyata dibuat — semua data tes sintetis in-memory).
- Commit/push/deploy: **TIDAK ada**. Perubahan konfigurasi/env/Vercel/secret: **TIDAK ada** (hanya dokumentasi di .env.example).
- Secret scan pada file baru/berubah: bersih (token hanya pola hash/placeholder).

## 11. Blocker & langkah berikutnya (perlu persetujuan pemilik)

1. **Aktivasi backend (prasyarat live):** pemilik menerapkan migration fondasi + `20261022_workspace_invitations.sql` ke Supabase (SQL editor), set env server `SUPABASE_URL` + `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`, set `PUBLIC_APP_URL=https://ezrab.site`. Sampai saat itu endpoint menjawab 503 jujur dan UI menampilkan status belum aktif.
2. **Menyalakan login:** membalik `AUTH_ENABLED` ke true + env `VITE_SUPABASE_URL/ANON_KEY` (keputusan pemilik; mode fail-safe mencegah lockout). Tanpa ini halaman penerimaan menampilkan catatan login nonaktif.
3. **Email:** pemilik memverifikasi domain di Resend lalu set `RESEND_API_KEY` + `EMAIL_FROM` (mis. no-reply@ezrab.site). Status email akan berubah dari `not_sent` menjadi `sent` hanya setelah itu dan hanya bila provider mengonfirmasi.
4. **Keputusan Git:** batch ini (17 baru + 3 edit aditif) menunggu grant commit/push terpisah seperti batch lain; disarankan digabung sebagai satu batch "Secure Invitation" dan diverifikasi Preview setelah aktivasi backend.
5. Pengerasan lanjutan (opsional): meta referrer khusus halaman penerimaan; tes integrasi RPC terhadap Supabase staging setelah migration diterapkan; penegakan kuota kursi bila aturan billing sudah authoritative.
