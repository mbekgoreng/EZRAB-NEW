# EZRAB — Feature Inventory (Audit 2026-10-20)

Sumber: kode aktual branch `integrasi/unified-ui-engine` @ `dd81439`. Status verifikasi: **R** = route ter-render (cabang WorkspaceView), **B** = teruji browser sesi ini, **S** = review statis, **NT** = tidak diuji sesi ini.

## 1. Route publik (landing)
| Route | Komponen | Status |
|---|---|---|
| `/` (beranda) | ExactHero + CinematicHero, ExactWorkflow, ExactRabWorkspace, ExactMagicAi, ExactVolumeCalculator, ExactAhsp, ExactConnectedData, ExactProjectManagement, ExactReportsExport, ExactRoles, ExactStackedShowcase | B (harga terverifikasi sesi ini) |
| `/#fitur`, `/#keunggulan`, `/fitur` | Landing sections / halaman fitur | S |
| `/#harga` | ExactPricing (Free/Starter/Pro, toggle bulanan/tahunan) | B |
| `/blog`, `blog.ezrab.site` | Blog publik (src/blog) | NT (channel lain) |
| `/masuk`, `/daftar` | Auth — **AUTH_ENABLED=false**, CTA diarahkan ke /app/dashboard | S |
| `/about` | Halaman tentang | NT |

## 2. Route aplikasi (`/app/*`) — 57 cabang menu ter-render di WorkspaceView
| Kelompok | Menu (route) | Status |
|---|---|---|
| Beranda | dashboard (/app/dashboard) | B — 0 console error |
| Proyek | proyek (/app/projects) + filter Semua/Draft/Sedang Dikerjakan/Selesai/Arsip; manajemen-proyek | B |
| RAB | rab-estimasi, rab-spreadsheet, rab-rekapitulasi, rab-analisa-harga, rab-kurva-s, rab-catatan, rab-pengaturan (/app/estimate?tab=) | B (estimate) |
| AI | ezrab-ai (Chat AI), ded-ai (DED AI), dokumen-ai (Dokumen AI), kredit-ai (Kredit AI), magic-ai/ai-assistant | B (ezrab-ai, kredit-ai) |
| QTO | qto-vc / volume-calculation, qto, qto-daftar, qto-rekap | B (qto) |
| Data harga | ahsp-2026/ahsp/analisa-ahsp (/app/ahsp); database-material/upah/alat, harga-proyek, resource-library, suppliers (/app/resources?type=) | B (ahsp) |
| Template | template-rab (/app/template-rab) | B |
| Keuangan | keuangan, keuangan-proyek, cash-flow, invoice, termin, pemasukan, pengeluaran (/app/finance) | B (finance) |
| Proyek lanjutan | jadwal, kurva-s, boq, daftar-pekerjaan, pekerjaan, dokumen-tender, export | NT |
| Lainnya | laporan (/app/reports), pengaturan (/app/settings), subscription, blog-admin (internal), harga | B (settings) |

## 3. API endpoints (Vercel serverless, `api/`)
| Endpoint | Fungsi | Auth |
|---|---|---|
| POST /api/ai/chat | Chat AI via gateway | Origin/token (lihat security review) |
| GET /api/ai/engine-status | Status provider | — |
| POST /api/ai/tools/execute | Tool AI (DED/fast/advanced) | — |
| POST /api/ai/multi-provider/execute | Multi-provider | — |
| GET /api/ai/multi-provider/providers | Daftar provider | — |
| /api/credits/balance, /estimate, /usage | Kredit backend (Fase 2) | Supabase (lihat credits audit) |
| /api/market/search | Pencarian harga pasar (Serper) | — |

Lib: `_lib/aiGateway.js`, `creditEngine.js`, `creditPricing.js`, `providerTariffs.js`, `usageMeter.js`, `security.js`, `supabaseAuth.js`, `marketSearch/serperProvider.js`.

## 4. Modul AI tools (frontend)
`src/ai-tools/`: ezrab-ai (chat), ded-ai-estimate, ded-full-ai, document-ai, aiModelRegistry.ts, providerClient.ts, aiGatewayAuth.ts, aiNavigation.ts.

## 5. Data & engine
- AHSP canonical: 5.801 item (CK 2.859, SDA 1.556, BM 1.163, SMKK 223) — `src/data/nationalCostDatabase/`
- RAB engine: `src/engine/rab/rabItemFactory.ts`, totals `src/engine/rabTotals.ts`
- Export: `src/export/excelExportEngine.ts`, PDF/report generators
- Persistensi utama: localStorage (`ezrab_prod_projects`, `ezrab_prod_active_project_id`, `ezrab_prod_rab_items`) — backend Supabase belum menjadi sumber kebenaran saat login OFF.

## 6. Integrasi eksternal
Vercel (hosting/testing), Supabase `tjgadmctzwqgexdilekq` (auth/DB, login OFF), provider AI: River, Dahl, ZyRouter, Gemini (native + OAI-compat), Atria; Serper (market search, key belum dipasang); Game Space (61 game, channel terpisah — di luar scope audit ini sesuai instruksi).

## 7. Ringkasan cakupan
- Route ditemukan: 26+ path builder, 57 cabang menu app, 8 endpoint API production + shadow API dev-only (`server/api/*.ts`, hanya aktif via plugin Vite dev — 5 rute yang dipanggil frontend dari sana membalas 404 di production dan teredam fallback: wizard, ded-analyses, receipt/scan — temuan API-11).
- Route ditemukan: 26+ path builder, 57 cabang menu app, 8 endpoint API.
- Teruji browser sesi ini: 11 route app (0 error halaman) + section harga landing.
- Belum teruji sesi ini: jadwal/kurva-s/boq/export UI, blog, halaman about, alur auth (nonaktif by design).
