# EZRAB — Persiapan Migrasi VPS

> Status: DOKUMENTASI. VPS belum dibeli. Jangan jalankan migrasi/deployment
> sebelum VPS tersedia dan owner menyetujui.
>
> Disusun dari audit repository aktual (branch `integrasi/unified-ui-engine`,
> HEAD 9471c81, 2026-10-18). Tidak ada secret di dokumen ini — hanya nama
> variabel dan tujuannya.

## 1. Arsitektur saat ini

| Lapisan | Teknologi | Lokasi |
|---|---|---|
| Frontend | React + Vite + TypeScript | `src/` |
| Backend serverless | Vercel Functions (Node.js) | `api/` |
| AI gateway | Canonical handler + failover Gemini → ZyRouter → Atria | `api/_lib/aiGateway.js` |
| Database | Supabase Postgres (belum terkoneksi dari app) | `supabase/migrations/` |
| Auth | OFF (`AUTH_ENABLED=false`); JWT Supabase siap tapi tidak aktif | `src/auth/`, `api/_lib/supabaseAuth.js` |

## 2. Endpoint backend yang digunakan frontend

| Endpoint | Fungsi | Auth |
|---|---|---|
| `POST /api/ai/tools/execute` | Chat AI, DED AI, AI Document (via `AiToolsProviderClient`) | JWT / token / degraded |
| `POST /api/ai/chat` | Legacy chat | sama |
| `POST /api/ai/multi-provider/execute` | Legacy multi-provider | sama |
| `GET /api/ai/engine-status` | Status engine | publik |
| `GET /api/credits/balance` | Saldo kredit (503 bila DB belum aktif) | JWT |
| `GET /api/credits/usage` | Riwayat usage meter (503 bila DB belum aktif) | JWT |
| `POST /api/credits/estimate` | Estimasi kredit server-side | — |

## 3. Environment variables (nama + tujuan saja)

| Nama | Tujuan | Status |
|---|---|---|
| `GEMINI_API_KEY_1..6` | Failover Gemini | Belum diverifikasi di Vercel |
| `ZYROUTER_API_KEY` | Provider ZyRouter (advanced) | Belum diverifikasi |
| `ATRIA_API_KEY_1..14` | Failover Atria | Belum diverifikasi |
| `AI_GATEWAY_TOKEN` | Token service-to-service (fallback bila Supabase off) | Belum di-set |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Auth + DB client | **JANGAN set selama login OFF** |
| `SUPABASE_SERVICE_ROLE_KEY` | Tulis server-side (ledger, dsb) | Hanya di server, tidak ke browser |
| `AI_ALLOW_ANONYMOUS` | Izinkan AI tanpa JWT (degraded) | `true` saat ini (dev) |
| `CREDITS_DB_CONFIGURED` | Flag backend kredit aktif | `false` / belum di-set |
| `AI_RATE_LIMIT_PER_MIN` | Rate limit AI | default 60 (auth) / 20 (anon) |

## 4. Database & storage

- Migration yang sudah ada: `supabase/migrations/` (auth, RAB, price_assumptions,
  market_price_references, blog CMS).
- **Belum di-apply di production**: `20261012_price_assumptions.sql`,
  `20261018_market_price_references.sql`, `20261018_ai_credits_ledger.sql`.
- Storage: belum ada kebutuhan file storage teridentifikasi selain upload
  dokumen DED (saat ini via base64 ke AI gateway).

## 5. Integrasi AI provider

- Failover: 6 kunci Gemini → ZyRouter → 14 kunci Atria.
- Model: FAST `gemini-3.5-flash-lite`, ADVANCED `geminiflash-3.8`, Atria `Atria-Dawn-Preview`.
- Usage metadata kini ditangkap (Phase 3): `usageMetadata` Gemini,
  `usage` OpenAI-compatible. Biaya provider UNDETERMINED (tarif belum dikonfigurasi).
- `vercel.json`: `maxDuration: 300` untuk `api/ai/**`.

## 6. AI Credits — status adapter

| Komponen | Status |
|---|---|
| Frontend Phase 1 | Selesai, simulasi eksplisit, live di preview |
| Credit engine (`api/_lib/creditEngine.js`) | Selesai, memory adapter (test); Supabase adapter belum |
| Usage meter (`api/_lib/usageMeter.js`) | Selesai, hook di gateway aktif |
| Migration ledger | File review, belum di-apply |
| API credits/* | 503 jujur hingga `CREDITS_DB_CONFIGURED=true` |
| Payment gateway | **Tidak ada — Phase 4** |

## 7. Wajib setelah VPS tersedia

1. Putuskan: tetap Vercel + Supabase, atau pindah full ke VPS (Node + Postgres + reverse proxy).
2. Apply migration yang tertunda (review dulu satu per satu).
3. Aktifkan auth (`AUTH_ENABLED=true`) + verifikasi JWT end-to-end.
4. Set `CREDITS_DB_CONFIGURED=true` setelah Supabase adapter selesai + diuji.
5. Masukkan tarif provider resmi ke `api/_lib/providerTariffs.js` dari sumber resmi.
6. Kalibrasi tarif kredit draft terhadap biaya aktual setelah data usage terkumpul.
7. Rotasi 8 secret yang bocor 2026-10-17 (masih pending — aksi dashboard owner).

## 8. Risiko keamanan belum terverifikasi

- 8 secret pernah terekspos di history 12 branch (main sudah purge; rotasi belum dilakukan).
- Vercel env AI belum diverifikasi (semua AI = 502 tanpa key).
- RLS migration kredit belum diuji terhadap database live.
- Rate limit in-memory per instance (tidak global) — cukup untuk preview, tidak untuk produksi.
