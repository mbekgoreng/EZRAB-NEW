# EZRAB — Security Review (Audit 2026-10-20)

Metode: review statis kode `api/` + `src/` di branch `integrasi/unified-ui-engine` @ `dd81439`. Tanpa eksploitasi production, tanpa brute force. Nilai secret tidak dicatat — hanya nama variabel & lokasi.

## Ringkasan
Tidak ada P0 yang terkonfirmasi pada kondisi saat ini. Tiga P1 yang bertahan setelah verifikasi silang terkonsentrasi pada satu akar: **lapisan backend belum diaktifkan penuh** (login OFF, token gateway belum terverifikasi terpasang, credits masih simulasi) sehingga beberapa perlindungan hanya ada "di atas kertas". Selama EZRAB dipakai sebagai demo publik, risiko terbesar adalah **penyalahgunaan kuota AI berbayar**, bukan kebocoran data (data proyek masih lokal di browser pengguna). Tiga klaim keamanan awal audit (CORS wildcard, open relay, error mentah) telah DICABUT setelah verifikasi langsung — lihat SEC-06/SEC-11 dan register.

## Temuan

### SEC-03 — Gerbang token AI nonaktif bila `AI_GATEWAY_TOKEN` belum dipasang — **P1 · CONFIRMED**
- Bukti: `src/ai-tools/aiGatewayAuth.ts:15-27` mengembalikan header kosong bila token client tidak ada; `api/_lib/security.js:83-86` — token server hanya divalidasi **bila env terpasang**. Tanpa env: semua origin non-browser lolos.
- Dampak: siapa pun dapat memanggil gateway dari skrip dan membakar kuota provider (biaya + kehabisan kuota untuk pengguna sah).
- Status lapangan: pemasangan token di Vercel masih pending (aksi owner).
- Remediasi: pasang `AI_GATEWAY_TOKEN` (Vercel + client), atau buat gateway fail-closed bila token absen di production.

### SEC-06 — ~~CORS wildcard pada endpoint AI~~ **DICABUT**
- Verifikasi langsung (grep seluruh `api/`): tidak ada header `Access-Control` di luar `security.js`; `api/ai/chat.js` (15 baris) dan `multi-provider/execute.js` (11 baris) adalah wrapper tipis ke gateway yang memakai allowlist. Klaim awal audit keliru dan dicabut.

### SEC-08 — Endpoint credits mengembalikan ledger simulasi tanpa autentikasi — **P1 · CONFIRMED**
- Bukti: `api/credits/balance.js:35-38` (200 `{simulated:true}`, tanpa sesi), `usage.js` serupa.
- Dampak: kini hanya kebingungan integritas; **menjadi P0 seketika** bila saldo nyata ditempelkan tanpa auth.
- Remediasi: 401 tanpa sesi Supabase valid sebelum mode nyata diaktifkan.

### SEC-09 — Market search tanpa auth/rate-limit/cache — **P1 · CONFIRMED**
- Bukti: `api/market/search.js` — validasi input saja; provider `serperProvider.js` tanpa cache.
- Dampak: kuota Serper berbayar dapat dihabiskan pihak luar; biaya membengkak saat kunci dipasang.
- Remediasi: gerbang token yang sama + rate-limit + cache per query.

### SEC-01 — Workspace dapat diakses publik (login OFF by design) — **P1 · CONFIRMED (keputusan owner)**
- Bukti: `src/lib/authConfig.ts:14` `AUTH_ENABLED=false`; App.tsx melewati login.
- Catatan: disengaja untuk fase demo; seluruh isolasi data backend tidak berlaku selama OFF. Wajib ditinjau ulang sebelum data pelanggan nyata masuk.

### SEC-05 — Konteks tools memvalidasi anon key, bukan JWT pengguna — **P2 · LIKELY (laten)**
- Bukti: `api/ai/tools/execute.js:46-49` + `supabaseAuth.js:76-82` mengembalikan anon key sebagai "token tervalidasi".
- Dampak: laten selama tidak ada kueri data atas nama pengguna; menjadi IDOR nyata bila konteks per-pengguna ditambahkan tanpa mengganti validasi ke JWT + RLS.

### SEC-04 — Flag auth dibaca dari localStorage — **P2 · CONFIRMED**
- Bukti: `authConfig.ts:8-10` override `ezrab_auth_enabled` mengalahkan build flag di browser yang sama.
- Dampak: terbatas (bukan batas keamanan server), tetapi melemahkan defense-in-depth.

### SEC-10 — Rate limit in-memory per instance; chat tanpa rate limit — **P2 · CONFIRMED**
- Bukti: `security.js:23,112-146` (Map per proses; cold start mereset); dipakai tools/credits, tidak dipakai chat/multi-provider.
- Remediasi: store bersama (Redis/KV) + terapkan ke semua endpoint AI.

### SEC-11 — ~~Chat mengembalikan pesan error provider mentah~~ **DICABUT**; sisa kebocoran kecil — **P3**
- Jalur utama gateway terverifikasi mengembalikan pesan generik ("AI sedang tidak tersedia"). Yang benar-benar ditemukan: `api/market/search.js:39` mengembalikan `e.message` mentah pada 500, dan error parse-body gateway menyertakan `e.message` — dampak minor (SEC-19 di register).
- Remediasi: petakan ke pesan generik + request-id di titik tersebut.

### SEC-16 — Security headers belum lengkap (CSP dll.) — **P2 · CONFIRMED**
- Bukti: tidak ada blok `headers()` di vercel.json maupun header di endpoint. Verifikasi live 16:38 WIB: **HSTS hadir** (`max-age=63072000`, default platform Vercel); yang absen: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
- Remediasi: tambahkan CSP, X-Content-Type-Options, Referrer-Policy, frame-ancestors.

### SEC-17 — engine-status menampilkan jumlah kunci & nama model tanpa auth — **P3 · CONFIRMED**
- Bukti: `api/ai/engine-status.js` + respons live: jumlah kunci per provider (6/3) dan nama model per mode terlihat publik. Postur auth secara eksplisit TIDAK dibocorkan (by design) — risiko informasi rendah.
- Remediasi opsional: batasi ke ringkasan sehat/tidak.

### Temuan P3
- SEC-02: mode demo `?demo=` mengembalikan user demo hardcode (App.tsx:249-254) — matikan sebelum rilis berbayar.
- SEC-07: fallback origin `ezrab.site` non-www lolos, `www` tidak (security.js:37) — samakan daftar.
- SEC-12: endpoint AI meng-log isi pesan pengguna (PII) — log metadata saja.
- SEC-13: upload file DED tanpa batas ukuran / tanpa magic-byte (dedService.ts:18, parseWorkbook.ts:1) — tambah batas & validasi.
- SEC-14: `new Function()` pada template Excel hasil impor (excelImportEngine.ts:771) — jalur ekspor terpisah aman (tidak ditemukan `v-html`/innerHTML mentah di jalur ekspor).
- SEC-15: satu-satunya `dangerouslySetInnerHTML` (DocumentsView.tsx:679) terverifikasi aman (teks lokal ter-escape); chat dirender sebagai teks React tanpa dangerouslySetInnerHTML.
- SEC-18: CSRF tidak berlaku (tanpa cookie sesi; Bearer header) — nilai ulang bila cookie sesi diperkenalkan.

## Terverifikasi BAIK
- Tidak ada secret tertanam di `src/`/`api/` (0 hit pola kunci pada kode non-test); seluruh kunci dibaca dari env.
- `.env` ter-gitignore & tidak terlacak; `.env.local` yang terlacak hanya berisi placeholder.
- Perbandingan token timing-safe (`supabaseAuth.js:57-69`); desain RLS self-select pada profil.
- Sanitisasi markdown (marked + DOMPurify di blog; rantai chat aman).
- Gateway tools fail-closed pada origin tak dikenal **bila token terpasang** (security.js:71-76).
- Pemindaian secret menyeluruh (1.270 file `src/`+`api/`): hanya 5 hit jinak (fixture test berlabel dummy/test-key + satu komentar) — tidak ada kunci produksi tertanam.
- Renderer markdown Chat AI meng-escape HTML sebelum menghasilkan tag sendiri — output AI tidak dapat menyuntik HTML mentah; `AI_ALLOW_ANONYMOUS` ditolak keras di production (security.js:302-311).

## Batas pengujian
Tanpa akses dashboard Vercel/Supabase sesi ini: status env production, kebijakan RLS aktual, dan log production = **NEEDS_ACCESS**. Rotasi 8 secret lama (riwayat 12 branch non-main belum di-purge) tetap pending sebagai aksi owner — lihat Production Readiness.
