# API ROUTE SECURITY MATRIX — EZRAB (Final Pre-Commit Audit, 2026-10-21)

Metode: inventaris file aktual + sapuan keputusan middleware terprogram atas semua path konkret (anon vs sesi valid), plus baca handler. Status: PROTECTED · PUBLIC_BY_DESIGN · GAP · NOT_TESTED.
Catatan sapuan: middleware hanya DIPANGGIL Vercel untuk path dalam matcher; sapuan memanggil fungsi langsung — hasil untuk path di luar matcher berarti "tidak digerbang walau dipanggil".

## A. Vercel Functions (production) — `api/`
| Path | Method | Implementasi | Cakupan gate | Anon | Sesi | Status |
|---|---|---|---|---|---|---|
| /api/ai/chat | POST | api/ai/chat.js → gateway | matcher /api/ai/* | 401 | lolos | **PROTECTED** |
| /api/ai/tools/execute | POST | api/ai/tools/execute.js | matcher | 401 | lolos | **PROTECTED** |
| /api/ai/multi-provider/execute | POST | api/ai/multi-provider/execute.js | matcher | 401 | lolos | **PROTECTED** |
| /api/ai/multi-provider/providers | GET/POST | api/ai/multi-provider/providers.js (pembungkus gateway yang sama) | matcher | 401 | lolos | **PROTECTED** |
| /api/ai/engine-status | GET | api/ai/engine-status.js | matcher + allowlist eksplisit | lolos | lolos | **PUBLIC_BY_DESIGN** — respons terverifikasi: hanya status + JUMLAH kunci per famili + label model; GET-only (405 lain); tanpa postur auth, tanpa nilai kunci, tanpa operasi ubah data |
| /api/credits/balance | GET | api/credits/balance.js | matcher /api/credits/* | 401 | lolos | **PROTECTED** |
| /api/credits/estimate | POST | api/credits/estimate.js | matcher | 401 | lolos | **PROTECTED** |
| /api/credits/usage | POST | api/credits/usage.js | matcher | 401 | lolos | **PROTECTED** |
| /api/market/search | GET/POST | api/market/search.js | matcher /api/market/* | 401 | lolos | **PROTECTED** (menutup permukaan SEC-09 selama gate aktif) |
| /api/access/verify | POST | api/access/verify.js | SENGAJA di luar matcher + pengecualian eksplisit di fungsi (anti-lockout) | lolos (rate-limited) | lolos | **PUBLIC_BY_DESIGN** (endpoint gerbang itu sendiri) |
| /api/access/session | GET | api/access/session.js | sama seperti di atas | lolos | lolos | **PUBLIC_BY_DESIGN** (hanya boolean dari cookie pemanggil) |

Tidak ada function production lain. `api/_lib/*` adalah library, bukan route.

## B. Halaman / route frontend
| Route | Sifat | Gate | Status |
|---|---|---|---|
| `/`, `/fitur`, `/keunggulan`, `/about`, landing sections | Publik (marketing) | di luar matcher | PUBLIC_BY_DESIGN |
| `/access` | Halaman gerbang | matcher; anon lolos, sesi → 307 dashboard | PUBLIC_BY_DESIGN (anti-loop teruji) |
| `/app`, `/app/*` (dashboard, proyek, RAB, QTO, AHSP, DED, dokumen, Chat AI, Game Space, Kredit AI, pengaturan, `/app/blog` CMS) | Workspace | matcher /app + /app/:path* → 307 /access?next= | **PROTECTED** (dokumen) + lapisan kedua SPA (cek sesi server sebelum render) |
| blog.ezrab.site (`/blog/*` via rewrite host) | Blog publik | di luar matcher | PUBLIC_BY_DESIGN |
| Aset statis `/assets/*`, `public/*` (gambar, PDF sampel marketing) | Statis | di luar matcher | PUBLIC_BY_DESIGN — bundle JS dapat diunduh siapa pun (kode UI, tanpa data & tanpa kode akses); perlindungan data ada di API |

## C. Permukaan di luar jangkauan gate (jujur)
| Permukaan | Status | Risiko & rekomendasi |
|---|---|---|
| Dev shadow API `server/` (wizard, ded-analyses, receipt/scan, projects) | **NOT_DEPLOYED** (tidak ada jalur deploy — F-008) | Hanya hidup di dev lokal; mode legacy-header (F-009) adalah risiko DEV saja. Bila suatu hari dideploy, wajib digerbang terpisah. Jangan jadikan alasan memperluas matcher |
| Supabase (akses langsung browser → PostgREST) | **GAP kondisional (pra-ada, di luar lingkup gate)** | Inventaris lokal (2026-10-21): klien browser memakai anon key (`src/lib/supabase.ts`, hanya aktif bila `VITE_SUPABASE_URL`+`VITE_SUPABASE_ANON_KEY` ter-set). Tabel yang diakses browser: projects, rab_items, ded_analyses, price_assumptions, workspace_members, rab_documents, workspaces, project_members, audit_logs. Bukti migrasi meyakinkan: 7/7 file migrasi mengaktifkan RLS (69 policy total), dan **tidak ada satu pun policy `to anon`/`to public`** — policy menargetkan `authenticated` dengan cakupan `auth.uid()`, sehingga anon = deny-by-default pada tabel ber-RLS. Yang TIDAK terbukti lokal: (a) migrasi benar-benar diterapkan di proyek Supabase live, (b) env Supabase ter-set di Vercel production (bila tidak, jalur ini dorman), (c) seluruh 69 policy dibaca baris-per-baris (baru spot-check), (d) drift `ded_analyses.updated_at` (F-012). Status: risiko bersyarat, bukan paparan terkonfirmasi — verifikasi live tetap NEEDS_ACCESS (dashboard owner) |
| Penyimpanan lokal browser (localStorage proyek demo) | PUBLIC_BY_DESIGN (data di perangkat pengunjung sendiri) | Gate tidak mengubah model data lokal Phase-1 |

## D. Keputusan matcher
Matcher aktual: `/app`, `/app/:path*`, `/access`, `/api/ai/:path*`, `/api/credits/:path*`, `/api/market/:path*` — cocok dengan seluruh permukaan production terinventaris; tidak ada endpoint sensitif production di luar prefix tersebut (dibuktikan inventaris file). Perluasan membabi buta (mis. `/api/:path*`) DITOLAK: akan menangkap endpoint gerbang sendiri; pengecualian anti-lockout kini juga tertanam di fungsi sebagai lapis kedua.
