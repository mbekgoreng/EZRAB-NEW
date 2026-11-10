# EZRAB — Credits Server Wiring (B5/D18(ii–iii) + D17) — 2026-11-10

Paket persiapan uji credits server atas perintah owner ("semua satukan
pekerjaan yang sudah-sudah"). Aktivasi TERBATAS Preview: kode + persiapan;
TIDAK ada eksekusi SQL di database live, TIDAK ada perubahan env Vercel,
`AI_METERING_ENABLED` tetap OFF, `AUTH_ENABLED` TIDAK disentuh.

## B5 — Wiring endpoint saldo & Free-once (D18(ii) + D18(iii))

- BARU `api/_lib/billingAccountService.js`: resolusi+otorisasi workspace
  (pola billingService: principal terautentikasi → keanggotaan →
  authorizeWorkspaceAccess), provisioning akun billing get-or-create,
  `ensureFreeOnceGrant` (domain `grantFreeOnce` via `withLedger`;
  idempoten — kunci `free-once:<accountId>` + UNIQUE parsial DB),
  `readBatchBalance`, `readUsageHistory`.
- `api/credits/[action].js` aksi `balance`: adapter gen-1 +
  `createMemoryAdapter()` placeholder DIHAPUS. Kini: repository Supabase
  nyata (`getBillingRepository()`); null → 503 `CREDITS_NOT_CONFIGURED`
  (kontrak jujur lama utuh); saldo = agregasi batch ledger akun workspace
  pemanggil; provisioning + Free-once 100 (Amendemen v1.2) terjadi di
  jalur ini. Kegagalan backend → 503 `CREDITS_BACKEND_UNAVAILABLE`
  (fail-closed, tanpa fallback memori/simulasi).
- `api/credits/usage.js`: meter gen-1 placeholder diganti riwayat operasi
  ledger akun (terbaru dulu), dipetakan ke bentuk UI; `cost_status`
  jujur `UNDETERMINED`; akun belum terprovisioning → daftar kosong
  (endpoint baca-saja tidak membuat akun).
- `api/_lib/billingService.js`: `getOrCreateAccount` (titik provisioning
  yang dipakai checkout) kini mendelegasikan ke helper bersama dan
  menerbitkan Free-once pada provisioning pertama; kegagalan grant
  menggagalkan provisioning secara terbuka.
- Flag `CREDITS_DB_CONFIGURED` tidak lagi dibaca kode produksi mana pun.
- Plafon fungsi Vercel TIDAK berubah: nol handler baru
  (apiEndpointInventory 13/13).

## B4 — Patch D17 (webhook middleware)

- `middleware.ts`: pengecualian PERSIS `POST /api/credits/webhook` dari
  gerbang kode akses (meniru pola `/api/access/*`); autentikasi webhook
  tetap verifikasi signature Midtrans di handler. Jalur credits lain
  tetap tergerbang.
- `src/test/passcodeGate.test.ts` diperluas: webhook lolos tanpa sesi;
  balance/checkout/usage/subscription/order tetap 401 tanpa sesi;
  kemiripan awalan (`/api/credits/webhook-extra`) tetap ditolak.

## Penyesuaian pin tes (disengaja, dicatat terbuka)

`src/test/billingWebhook.test.ts`: 4 pin ditulis sebelum D18(iii) ada
("entri GRANT = N", "saldo tetap 0") dan kini menghitung grant FREE_ONCE
provisioning yang sah. Pin disesuaikan untuk menegaskan maksud
keamanannya secara persis — grant/saldo BERBAYAR tetap 0/terhitung benar,
FREE_ONCE 100 diakui eksplisit. Tanpa penyesuaian ini suite memerah
bukan karena regresi, melainkan karena dunia yang dipatok sudah berubah
oleh keputusan owner sendiri.

## Bukti tes (keadaan akhir paket)

- BARU `creditsServerWiring` 26/26 (resolusi/otorisasi, provisioning,
  Free-once idempoten: tepat 1 batch + 1 entri GRANT sesudah 2× panggil,
  saldo dari batch, riwayat usage SETTLED→aktual 20 kredit, 503 jujur).
- Regresi: passcodeGate 17 ✓ · creditsActionHandler 9/9 · billingCheckout
  23/23 · billingWebhook 38/38 · billingCatalogDrift 21/21 ·
  billingDemoGate 46/46 · phase53BillingSecurity (vitest) ✓ ·
  featureBillingMatrix 87/87 · dedBillingCompat 42/42 ·
  creditReconciliation 23/23 · unifiedCreditLifecycle 31/31 ·
  creditConcurrencySprint3 52/52 · creditInvariantAdversarial 71/71 ·
  ai-metering 83/83 · chatFastMetering 114/114 · tokenMetering 26/26 ·
  deterministic-free-metering 94/94 · financialConsistency 40/40 ·
  vitest terkait 110/110 · billingPlans 72/72.
- tsc 0 · build produksi 0 (diverifikasi pada keadaan ter-commit).

## Batas jujur (tidak bisa selesai tanpa owner)

- Eksekusi migration D16 di project live = tangan owner di SQL Editor.
  Paket siap-jalan: `~/workspace/your_files/EZRAB-CREDITS-TEST-PACKAGE-2026-11-10/`
  (PANDUAN-EKSEKUSI-D16.md + verifikasi-sebelum.sql + verifikasi-sesudah.sql).
- Env Vercel (SUPABASE_URL + SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY
  service-role) = tangan owner; daftar persis ada di panduan.
- Uji ujung-ke-ujung nyata menuntut rantai AUTH aktif di Preview
  (principal demo/anonim ditolak endpoint DENGAN SENGAJA) dan
  `AI_METERING_ENABLED=true` diset owner PALING AKHIR sesuai urutan D18.
- D18(iv) reserve→settle di transport untuk permukaan selain Chat FAST
  TIDAK termasuk paket ini (masih NOT_WIRED per matriks — pekerjaan
  integrasi terpisah).
