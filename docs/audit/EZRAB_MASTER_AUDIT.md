# EZRAB — MASTER AUDIT (Register Temuan Tunggal)

**Tanggal konsolidasi:** 2026-10-21 · **Pohon yang diperiksa:** branch `integrasi/unified-ui-engine`, HEAD `ce968a8` (= tip remote, terverifikasi `git ls-remote`) + 32 file termodifikasi belum commit (17 mobile + 9 remediasi + 6 F-018; rekonsiliasi per isi diff, nol file campuran) · **Konsolidator:** Muse (sesi Product Readiness & Consolidation)

## 1. Sumber

**Ditemukan & dibaca penuh:** 21 dokumen di `docs/audit/` (audit produk penuh 2026-10-20 + register temuan + security review + audit kredit + audit integritas RAB/AHSP + audit UI/UX + laporan tes + inventaris fitur + roadmap remediasi 2026-10-20 + laporan Wave 1 + REMEDIATION_REPORT V2 + MASTER_AUDIT_MATRIX + PRODUCTION_READINESS_GATE + ACCESS_GATE_FINAL_AUDIT + API_ROUTE_SECURITY_MATRIX + PRECOMMIT_CHECKLIST + DED_COMPLETENESS_AUDIT + CORE_AI_WAVE0_AUDIT + MOBILE_WAVE0_AUDIT + MOBILE_REMEDIATION_REPORT) dan 27 laporan di `docs/EZRAB_*.md` (2026-10-16 s/d 2026-10-20).

**Tidak ditemukan** (disebut di prompt, memang belum ada): seri `EZRAB_00_EXECUTIVE_VERDICT.md`…`EZRAB_09_FINDINGS_AND_ROADMAP.md`; `PRODUCT_READINESS_BASELINE.md` (dibuat bersamaan dengan dokumen ini sebagai baseline Fase 0).

**Aturan status:** status dari dokumen sumber ditulis apa adanya dan diberi tanggal dokumennya. Status **terverifikasi ulang** hanya bila pemeriksa menjalankan sendiri buktinya pada 2026-10-21 di pohon saat ini — ditandai ★. Klaim lama tidak dipromosikan menjadi fakta hanya karena tertulis.

## 2. Executive verdict

**NOT READY untuk production. READY WITH CONDITIONS untuk staging/demo berlabel.**

Alasan yang ditopang bukti: (1) tidak ada ledger kredit server dan saldo tidak pernah memblokir — billing masih simulasi jujur, bukan sistem billing (CR-02, CR-08, P0-1); (2) consume kredit chat terpotong juga saat AI gagal — terverifikasi ulang hari ini ★ (P0-3); (3) tarif provider 100% NULL sehingga biaya per panggilan tidak dapat ditentukan (CR-01); (4) performa bundle jauh di atas wajar — chunk utama 30 MB mentah / ±3,46 MB gzip, dist 157 MB, terukur ulang hari ini ★ (INF-06/F-021); (5) blocker eksternal belum selesai: rotasi 8 secret (aksi owner), aktivasi Access Gate di Production (owner), verifikasi live Supabase/RLS (NEEDS_ACCESS), VPS untuk backend (keputusan owner: ditunda).

Yang kuat dan terbukti: integritas AHSP/RAB (rekomputasi golden 1.866 item, 0 harga literal-0; sentinel harga bekerja sesuai desain; gate satuan F-016 aktif), Access Gate lolos uji Preview, remediasi mobile Wave 1 selesai & terverifikasi visual lokal, dan seluruh suite inti hijau kecuali dua kegagalan baseline lama yang teridentifikasi persis (RAB-01, AHSP-01-invarian).

## 3. Skor audit terdahulu (persis seperti tertulis di sumber; tidak dihitung ulang)

| Sumber | Verdict / skor tertulis |
|---|---|
| Audit produk penuh 2026-10-20 | PRODUCTION NOT READY; staging PASS WITH GAPS; 42 aktif (P0 0 · P1 8 · P2 15 · P3 19), 6 dicabut, 1 NEEDS_ACCESS |
| Production Readiness Gate 2026-10-20 | NOT READY FOR PRODUCTION — READY FOR STAGING/DEMO PUBLIK berlabel; performa FAIL; billing BLOCKED |
| Audit kredit AI 2026-10-20 | "SIMULASI JUJUR, BUKAN SISTEM BILLING" |
| Audit integritas RAB/AHSP 2026-10-20 | PASS WITH GAPS; dataset 5.801 item; golden 3/3 persis |
| Price Integrity 2026-10-19 | PASS WITH GAPS; matriks 23/23 PASS |
| Final Test Matrix 2026-10-19 | PASS 21 · FAIL aktif 0 · BLOCKED 4 · NOT RUN/PARTIAL 2 (laporan masternya menulis "20/26" — selisih internal 1, dicatat apa adanya) |
| Access Gate Final Audit 2026-10-21 | Implementasi lokal PASS; Preview PARTIAL; Production BLOCKED; tanpa P0/P1 baru |
| Core AI Wave 0 2026-10-21 | Billing Intelligence FAIL (sebagai fitur); domain lain PASS WITH GAPS; Production NOT_TESTED/BLOCKED |

## 4. Register temuan

Kolom: **Status** memakai kosakata konsolidasi (CONFIRMED / PARTIALLY_CONFIRMED / NOT_REPRODUCED / BLOCKED_ACCESS / BLOCKED_INPUT / FIXED_PENDING_RETEST / VERIFIED_FIXED). ★ = diverifikasi ulang oleh pemeriksa pada 2026-10-21 di pohon `ce968a8`+modifikasi. "Belum commit" berlaku untuk semua perbaikan yang belum masuk `ce968a8`.

### 4.1 Billing, kredit & biaya AI

| ID | Sev | Temuan | Bukti | Status | Sumber |
|---|---|---|---|---|---|
| CR-02 (= F-002, P1-2, P1-6 Core AI) | P1 | Tidak ada ledger/debit server; usage dihitung lalu dibuang; adapter saldo null; migrasi ledger ada tapi belum diterapkan | `api/_lib/aiGateway.js:405`; `api/credits/balance.js`; `supabase/migrations/20261018_ai_credits_ledger.sql` (draft) | CONFIRMED — BLOCKED oleh keputusan owner (backend ditunda s/d VPS) | Register; Matrix; Core AI |
| P0-3 (aspek chat dari CR-08) | P0 | Kredit simulasi chat terpotong juga saat panggilan AI gagal — `consume()` tanpa cek `res.success` ★ | `src/ai-tools/ezrab-ai/view.tsx:345` (dibaca ulang hari ini: consume dipanggil tak bersyarat tepat setelah `send()`) | CONFIRMED ★ | Core AI §G; Register (CR-08) |
| CR-08 | P1 | Saldo tidak cukup tidak pernah memblokir pemakaian (3 titik panggil) | `view.tsx:343`; `DedAiInputView:113`; `DocAnalyzer:140` | CONFIRMED (titik chat = P0-3 ★; dua titik lain per dokumen) | Register |
| CR-01 (= P1-1 Core AI) | P1 | Tarif provider 100% NULL (3 model, semua null); model produksi tidak terdaftar → biaya UNDETERMINED | `api/_lib/providerTariffs.js:22-61` | CONFIRMED | Register; Core AI |
| P0-1 | P0 | Billing Intelligence absen di chat: tak ada sumber data paket/harga/saldo untuk intent billing; model menjawab tanpa sumber | `prompt.ts`; `tools.ts`; `intentRouter.ts` | CONFIRMED (gap fitur) | Core AI §G |
| P0-2 | P0 | Harga material bergantung kepatuhan model memanggil tool `cari_harga`; tidak ada intent harga deterministik | `intentRouter.ts`; `service.ts` | CONFIRMED (gap) | Core AI §G |
| CR-10 (= P2-3 Core AI) | P2 | Nilai top-up tak konsisten: ±Rp1.389/1.000 kredit vs asumsi Rp10.000/1.000 (7,2×) | `src/config/ai-credits/config.ts:26-34` | CONFIRMED — keputusan owner tertunda | Register; Core AI |
| CR-03 | P2 | Endpoint credits berlabel `simulated:false` + user `anonymous` menjawab 200 bila flag DB dibalik (laten) | `api/credits/balance.js:30-31` | CONFIRMED (kode) | Register |
| SEC-08 | P1 | Endpoint credits mengembalikan ledger simulasi tanpa autentikasi; "menjadi P0 seketika bila saldo nyata ditempelkan" — terkait CR-03, beda bukti (tanpa baris sendiri di Register) | `api/credits/balance.js:35-38` | CONFIRMED | Security Review |
| CR-04 | P2 | Label "Aktual terverifikasi" untuk potongan tarif draft | `creditPricing.js:79-94` | CONFIRMED | Register |
| CR-05 | P2 | `creditEngine.reserve()` menghitung ganda & tak mengembalikan sisa (dorman) | `creditEngine.js:206-286` | CONFIRMED (dorman) | Register |
| CR-06 | P2 | Idempotency hanya Set memori per-instance | `creditEngine.js:70,85` | CONFIRMED | Register |
| CR-07 | — | Semua pengguna mulai sebagai "starter" 10.000 kredit simulasi; top-up mock gratis tanpa batas, berlabel simulasi | mockAdapter | CONFIRMED (deskriptif, by design Fase 1) | Credits Audit |
| CR-09 | P3 | Tanya-jawab lanjutan Dokumen AI tidak dimeterai kredit | DocAnalyzer `askQuestion` | CONFIRMED | Register |
| P2-2 | P2 | Duplikasi tarif draft klien vs server → risiko drift | `config.ts` vs `creditPricing.js` | CONFIRMED | Core AI §G |

### 4.2 Keamanan & akses

| ID | Sev | Temuan | Bukti | Status | Sumber |
|---|---|---|---|---|---|
| SEC-01 | P1 | Login OFF — workspace publik (keputusan owner; mitigasi = Access Gate) | `authConfig.ts:14` | CONFIRMED (by design) | Register |
| SEC-03 | P1 | Gerbang AI terbuka bila `AI_GATEWAY_TOKEN` belum dipasang di Vercel | `security.js:83-86`; `aiGatewayAuth.ts:15-27` | BLOCKED_ACCESS (postur live = wewenang owner di dashboard Vercel) | Register |
| SEC-09 | P1 | `/api/market/search` tanpa auth/rate-limit/cache (dorman s/d Serper dipasang) | `api/market/search.js` | CONFIRMED | Register |
| SEC-16 | P2 | Tanpa CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy (HSTS ada di header live) ★ sebagian | `vercel.json` tidak memiliki blok `headers` (dicek ulang hari ini ★); header live per Register | CONFIRMED ★ (lapisan vercel.json) | Register |
| SEC-05 | P2 | Konteks tools memvalidasi anon key, bukan JWT pengguna (IDOR laten) | `api/ai/tools/execute.js:46-49` | PARTIALLY_CONFIRMED (LIKELY per Register) | Register |
| SEC-10 | P2 | Rate limit in-memory per instance; chat tanpa rate limit | `security.js:112-146` | CONFIRMED | Register |
| SEC-04 | P3* | Flag auth dapat dioverride localStorage | `authConfig.ts:8-10` | CONFIRMED — *severity berbeda antar-sumber: P2 di Security Review, P3 di Register; konsolidasi memakai P3 (register kanonik) dengan catatan | Register; Security Review |
| SEC-02 | P3 | Mode demo `?demo=` user hardcode | `App.tsx:249` | CONFIRMED | Register |
| SEC-12 | P3 | Log server memuat isi pesan pengguna (PII, potongan 200 char) | handler chat | CONFIRMED | Register |
| SEC-13 | P3 | Upload DED tanpa batas ukuran server / magic-byte | `dedService.ts:18` | CONFIRMED | Register |
| SEC-14 | P3 | `new Function()` pada template Excel impor | `excelImportEngine.ts:771` | CONFIRMED | Register |
| SEC-17 (= F-010) | P3 | engine-status publik menampilkan jumlah kunci & nama model | `api/ai/engine-status.js` + respons live | PARTIALLY_CONFIRMED — postur auth TIDAK bocor; endpoint kini counts-only pasca F-006; sisa = nama model/jumlah kunci by design publik | Register; Matrix |
| SEC-19 | P3 | market/search mengembalikan `e.message` mentah pada 500 | `search.js:39` | CONFIRMED | Register |
| SEC-07 | P3 | Fallback origin: non-www lolos, www tidak | `security.js:37` | CONFIRMED | Security Review |
| SEC-15 | P3 | Satu-satunya `dangerouslySetInnerHTML` — terverifikasi AMAN | `DocumentsView.tsx:679` | VERIFIED_FIXED (dinilai aman, bukan cacat) | Security Review |
| F-GATE-01 | P2 | Middleware menjawab 401 untuk `/api/access/*` — risiko lockout bila matcher berubah | `middleware.ts`; `passcodeGate.test.ts` | VERIFIED_FIXED (pengecualian eksplisit + tes regresi; suite gate 16/16 PASS) — sudah commit `1464ff6` | Access Gate Audit |
| F-GATE-02 | P2 | Jalur data Supabase langsung dari browser berada di luar gate; kontrolnya RLS. Migrasi lokal deny-by-default untuk anon (69 policy, 0 anon/public) | `API_ROUTE_SECURITY_MATRIX §C`; 7 file migrasi | BLOCKED_ACCESS (penerapan live + drift F-012 belum terbukti) | Access Gate Audit; Matrix |
| — | — | Access Gate di Production belum aktif (env Production + promosi = aksi owner); Preview AKTIF & lolos uji 2026-10-21 | Preview `ezrab-site-i9zhnklkj…`; produksi tanpa redirect | CONFIRMED (terverifikasi sesi 2026-10-21) | Access Gate Audit; PRECOMMIT_CHECKLIST |

### 4.3 Integritas harga, RAB & AHSP

| ID | Sev | Temuan | Bukti | Status | Sumber |
|---|---|---|---|---|---|
| F-016 | P1 | Resolver mengalikan komponen satuan tak kompatibel (beton f'c 20 → Rp356.412.075/m³) | `src/data/priceDatabase2026/resolver.ts`; TEST 15 regresi | VERIFIED_FIXED (gate satuan UNIT_MISMATCH; 523 harga terkoreksi, 0 naik) — belum commit; lulus ulang di run `test:price` 2026-10-21 ★ (kasus F-016 PASS di dalam run yang sama) | Matrix; REMEDIATION_REPORT |
| F-018 | P1 | Koefisien kanonik 1.009 (pemisah ribu ID terbaca desimal di rantai Excel) | `scripts/ahsp2026/syncCiptaKaryaMaster.py` (SOURCE_ERRATA); `data/ahsp2026/reports/sync_errata_applied.json` | VERIFIED_FIXED — tepat 1 record berubah (2.2.1.4.1: 1.009→1009.0); ahsp:test 21/21. Belum commit. Workbook sumber di PC owner masih menyimpan 1.009 | Matrix; REMEDIATION_REPORT |
| F-018 sisa | P2 | Koefisien 1440 (item 2.2.1.5.11) — nilai setia sumber, perlu review manusia vs SE DJBK | canonical | CONFIRMED — OPEN, menunggu review owner/sumber | Matrix |
| RAB-01 | P2 | Pembulatan resolver tak konsisten: Σ subtotal ≠ harga satuan (selisih ≤ ±Rp1; kasus A.1.02.4a.1.d: 219.791 vs 219.790,5) | `resolver.ts:663-665`; `test:price` TEST 3 | CONFIRMED ★ (gagal identik pada run 2026-10-21: 69 PASS / 2 FAIL, sama dengan baseline) | Register; run hari ini |
| AHSP-01 (invarian) | P2 | Tes invarian "nol harga tertulis di canonical" bertentangan dengan desain generator | `priceDatabase2026.test.ts:262-271` | CONFIRMED ★ (kegagalan ke-2 pada run 2026-10-21; pasangan RAB-01) | Register; run hari ini |
| AHSP-02 | P3 | Antrean data: 1.048 NEEDS_REVIEW + 335 unresolved + 50 SMKK AMBIGUOUS | `ahsp2026Canonical.generated.ts` | CONFIRMED — pekerjaan data bertahap. **Catatan ID:** Register memakai "AHSP-01" juga untuk antrean ini; tabrakan ID di dalam Register — konsolidasi menamainya AHSP-02 mengikuti audit integritas | RAB/AHSP Audit; Register |
| AHSP-03 | P3 | Item VERIFIED A.1.02.4a.1.d berharga upah saja (material koef 1,25 tak berharga) | canonical | PARTIALLY_CONFIRMED (LIKELY per Register) | Register |
| — | P2 | SMKK: 81 item bermasalah (9 fragmen, 50 ambiguous, 19 header, 72 tanpa satuan versi sprint) | canonical SMKK | CONFIRMED (data) — NEEDS_SOURCE_EVIDENCE untuk perbaikan | Whole Product Sprint (P2-01); Master Final Sprint |
| BUG-1 (harga) | — | Label "Estimasi Parsial" tidak muncul untuk item factory (cek `amount==null` melewatkan sentinel `amount:0`) | `RabEstimasiView.tsx:561`; `decimalEngine.ts:72` | VERIFIED_FIXED (2026-10-19; matriks #7/#8 PASS) | Price Integrity |
| BUG-2 (harga) (= P1-01 sprint) | — | SmartAddWorkItemModal mengubah null→0 dan memaksa VERIFIED; akar sama dengan bug zeroing harga manual P1-01 | `SmartAddWorkItemModal.tsx`; `rabItemFactory` | VERIFIED_FIXED (dokumen tidak menyatakan eksplisit keduanya sama; bukti jalur sama) | Price Integrity; Whole Product Sprint |
| D2-sisa | — | Rp0 display tanpa label di `AiChangePreviewModal.tsx:581-588` (tipe tak membawa priceStatus) | file terkait | CONFIRMED — GAP terbuka (2 lokasi saudara sudah diperbaiki) | Finalization D2 |
| GAP display | — | Beberapa modal menampilkan Rp0 untuk unresolved tanpa label (`formatCurrencyIDR(unitPrice \|\| 0)`, display-only) | consumer display | CONFIRMED — GAP | Price Integrity |
| RAB-02 | — | Sentinel factory + eksklusi total bekerja sesuai desain | `rabItemFactory.ts:66-68`; `unifiedProjectEngine.ts:29-31` | PASS (bukan cacat — jangan "diperbaiki") | Register |
| EXP-01 | P1 | 18 string formula Excel rusak (awalan `=` ganda; 61 sel) | `src/export/excelExportEngine.ts` | VERIFIED_FIXED (Wave 1; validasi LibreOffice; 18/18 titik PASS) — belum commit; MS Excel NOT_TESTED | Register; Wave 1 Report |
| EXP-02 | — | Disebut di Matrix "sesuai register" tanpa baris sendiri | — | Status tidak dinyatakan di sumber — dicatat agar tidak hilang | Matrix |

### 4.4 AI, DED & dokumen

| ID | Sev | Temuan | Bukti | Status | Sumber |
|---|---|---|---|---|---|
| AI-01 | P1 | Chat AI utama tidak memakai rantai 'chat'; toggle Mendalam no-op | `api/ai/tools/execute.js`; `src/ai-tools/ezrab-ai/service.ts:52` | VERIFIED_FIXED (Wave 1, mapper mode-aware) — belum commit | Register; Wave 1 Report |
| AI-03 | P2 | Mode advanced jatuh diam-diam ke 5 provider di luar rantai terdokumentasi | `aiGateway.js:295-299` | CONFIRMED | Register |
| AI-08 (= P1-4 Core AI) | P2 | Dua sumber kebenaran model: registry klien vs rantai hardcode gateway | `aiModelRegistry.ts` vs `aiGateway.js:40-46` | CONFIRMED | Register; Core AI |
| P1-3 | P1 | Dua stack AI paralel (AI Tools vs Core AI/Copilot) → risiko divergensi | peta arsitektur Core AI §B | CONFIRMED | Core AI |
| P0-4 | P0 | Tool-call tunggal per giliran (regex mengekstrak 1 tool) | `service.ts` (Core AI) | CONFIRMED | Core AI §G |
| P1-5 | P1 | Tanpa entity-state percakapan untuk pertanyaan lanjutan | `service.ts` | CONFIRMED | Core AI §G |
| AI-02 | P3 | Percobaan provider ganda pada mode chat (latensi gagal 2×) | `aiGateway.js:282-299` | CONFIRMED | Register |
| AI-04 | P3 | Mode 'chat' ter-clamp menjadi 'fast' oleh validator | `security.js:200-203` | CONFIRMED — perlu dibaca ulang pasca AI-01 sebelum dinyatakan masih berlaku pada jalur utama | Register |
| AI-05 | P3 | Tanpa sanitasi prompt-injection pada teks dokumen | `document-ai/service.ts` | PARTIALLY_CONFIRMED (LIKELY) | Register |
| — | — | Latensi ekor panjang gateway: tanpa deadline total/circuit breaker (mode fast ±133 percobaan × 55 dtk worst-case) | `aiGateway.js` | CONFIRMED (deskriptif) | Credits Audit |
| F-001 | P2 | Fallback diam-diam ke MockAIProvider (Copilot) | `coAssistantService.ts:348`; `aiOrchestrator.ts:394` | VERIFIED_FIXED (pengungkapan "Mode lokal" + `source:'local-fallback'`; enumerasi: hanya 2 pemanggil produksi) — belum commit | Matrix; REMEDIATION_REPORT |
| F-019 | — | Retrieval Dokumen AI mengembalikan chunk salah berstatus sukses | document-ai | NOT_REPRODUCED (dokumen kosong → NO_DATA jujur) | Matrix |
| F-017 | — | Matcher memilih item resmi untuk input tak bermakna | ahspMatcher | NOT_REPRODUCED (confidence 0) | Matrix |
| DED-1 | Tinggi | Budget konteks memotong DED (Flow A cap 15.000 char ≈ 8/32 hal.; Flow B FAST maks 8 hal. vision; kata kunci tanpa MEP/kusen/plafon) | `service.ts:238/261-267/295` | FIXED_PENDING_RETEST — ditambal di commit `5a2d270` (budget per pageType 45k/90k; multi-pass; sheet cap 8→14; kata kunci diperluas). Retest butuh fixture PDF asli → BLOCKED_INPUT | DED Audit; sesi 2026-10-21 |
| DED-2 | Tinggi | Cap output satu panggilan (FAST maxTokens 4000 ≈ 10–16 item) | kedua flow | FIXED_PENDING_RETEST — `5a2d270` (FAST 8000 / DETAIL 12000; skema FAST = DETAIL) | DED Audit |
| DED-3 | Tinggi | Jalur kuantitas rapuh → null (Flow A ambiguousUnit membuang angka model; Flow B resolver tanpa cabang pipa/kran/septic/talang) | `aiEstimatePipeline.ts`; `dedQuantityReasoningEngine` | CONFIRMED — belum ditambal; sisi Flow A butuh keputusan integritas owner (downgrade ke AI_INFERENCE berlabel) | DED Audit |
| DED-4 | Sedang | Ekstraksi halaman gagal senyap (Flow B DETAIL) → fallback teks tanpa dimensi | — | CONFIRMED | DED Audit |
| DED-5 | Sedang | Harga satu panggilan tanpa fallback → PRICE_UNRESOLVED keluar total | — | CONFIRMED | DED Audit |
| DED-6 | Rendah–Sedang | Gate bentuk-satuan Flow A / gate katastrofik Flow B | — | CONFIRMED | DED Audit |
| DED-7 | Rendah | Dedup Flow B | — | CONFIRMED | DED Audit |
| DED-UX | — | Flow B tidak pernah merender `blockingReason`; Flow A item REJECTED tampil sebagai valid/review | DedAnalysisDashboard (grep 0) | CONFIRMED | DED Audit |
| — | — | Angka run "jembot" (14 item/6 valid/8 blokir/Rp14.312.000) tidak dapat diverifikasi — fixture tidak ada di repo | — | BLOCKED_INPUT (PDF DED asli 32 hal. dari owner) | DED Audit |
| — | — | Mapping AHSP dinyatakan BUKAN penyebab ketidaklengkapan DED (kedua flow hard-isolation dari AHSP by design) | header Flow A | CONFIRMED (klarifikasi desain) | DED Audit |

### 4.5 Performa, infrastruktur & deployment

| ID | Sev | Temuan | Bukti | Status | Sumber |
|---|---|---|---|---|---|
| INF-06 (= F-007/F-021, dampak UX = UX-04) | P2 | Bundle raksasa: dist 157 MB terukur hari ini ★; chunk utama 30 MB mentah / ±3,46 MB gzip ★; gambar 109 MB/123 file; `public/` 80 MB (pengukuran sumber: dist 156 MB, chunk 31 MB/3,57 MB gzip — selisih = waktu ukur & konfigurasi build, bukan temuan berbeda) | build lokal 2026-10-21 ★; F-021 | CONFIRMED ★ — optimasi belum dikerjakan | Register; Matrix |
| API-11 (= bagian benar F-003/F-004) | P2 | 5 rute klien hanya ada di dev shadow API → 404 di production, teredam fallback jujur | `server/api/*.ts`; `apiEndpointInventory.test.ts` | CONFIRMED | Register; Matrix |
| F-008 | — | Jalur deployment backend tak terdefinisi (`server/index.ts` tanpa script/Docker/config deploy) | `server/index.ts` | CONFIRMED — terkait keputusan VPS | Matrix |
| INF-05 | P3 | Drift perintah build: `vercel.json` `build:full` vs dashboard `build:blog` | `vercel.json` ★ (buildCommand `npm run build:full` dibaca ulang hari ini) | CONFIRMED ★ | Register |
| INF-09 | P3 | Rewrite catch-all `/api/*` menutupi 404 sebagai HTML 200 | `vercel.json` rewrites | CONFIRMED | Register |
| INF-10 | P3 | `/sitemap.xml` domain utama menyajikan sitemap blog (terkonfirmasi di `vercel.json`: rewrite host blog ★ konsisten) | `vercel.json` | CONFIRMED | Register |
| INF-12 | P3 | 12 file API mati/tak terpakai (0 pemanggil frontend) | grep fetch | CONFIRMED | Register |
| F-015 (⊃ P2-5 Core AI) | — | Hygiene repo: `.audit-frag.json` liar di root ★ (masih ada hari ini); direktori dataset/backup ±144 MB terlacak git (isi publik, grep secret 0 hit) | `git status` ★; `git ls-files` | CONFIRMED ★ (file liar); PARTIALLY_CONFIRMED (risiko bobot, bukan kebocoran) — keputusan owner untuk disposal | Matrix; Core AI |
| INF-07 | — | Audit dependensi tidak dapat dijalankan | `npm audit` exit 1 tanpa output (endpoint audit diblokir proxy sandbox) — dicoba ulang 2026-10-21 ★, hasil sama | BLOCKED_ACCESS | Register; hari ini ★ |
| BUILD-ENV (baru) | — | Build konfigurasi produksi standar gagal berulang di sandbox sesi ini pada fase minify CSS (exit 137/1; RAM VM ±7,9 GB pasca-restart runtime); build verifikasi (hanya `cssMinify:false` + `reportCompressedSize:false` via config sementara) tuntas 1m 6s pada pohon final, dist 157 MB | log build 2026-10-21 ★ | CONFIRMED — batas lingkungan, BUKAN cacat produk; gate sesungguhnya = build Vercel (NOT_RUN untuk pohon ini) | Sesi konsolidasi |

### 4.6 Penyimpanan proyek & data pengguna

| ID | Sev | Temuan | Bukti | Status | Sumber |
|---|---|---|---|---|---|
| F-011 | P2 | ProjectContext menanam 4 proyek demo tanpa flag/label DEMO | ProjectContext | CONFIRMED — OPEN, keputusan owner (beri label DEMO atau flag `isDemo`) | Matrix; Core AI §E |
| F-012 | P2 | Drift schema `ded_analyses`: repository mengurutkan `updated_at` yang tak ada di tabel → query gagal diam-diam ke memori | migrasi `20261008_phase3` | PARTIALLY_CONFIRMED — penerapan live BLOCKED_ACCESS | Matrix |
| — (penyimpanan) | — | Proyek/RAB hidup di localStorage + konteks klien; Supabase belum menjadi jalur produksi (login OFF; backend ditunda). Autosave/konflik sinkron/isolasi user belum teruji end-to-end di jalur server karena jalurnya belum aktif | peta arsitektur audit produk | CONFIRMED (keadaan) — audit dependensi + strategi recovery wajib mendahului perubahan arsitektur penyimpanan (aturan prompt §4) | Audit produk; Fase 0 |

### 4.7 Tes & tooling

| ID | Sev | Temuan | Bukti | Status | Sumber |
|---|---|---|---|---|---|
| F-013 | P2 | tsconfig mengecualikan `src/test` & `**/*.test.ts` → 182 file test di luar typecheck | `tsconfig.json` | CONFIRMED | Matrix |
| F-014 (= P2-6 Core AI) | P2 | `tsx` & `vitest` tidak ada di devDependencies; 28 file test impor vitest tidak bisa jalan (termasuk suite billing → cakupan billing yang dapat dieksekusi = nol) | `package.json` | CONFIRMED — perbaikan butuh keputusan owner (tambah devDependencies) | Matrix; Core AI |
| F-020 | — | Eksekusi suite: 153 file test, ±36 script; baseline 2 fail `test:price` | REMEDIATION_REPORT | CONFIRMED ★ (baseline direproduksi persis 2026-10-21, lihat matriks verifikasi) | Matrix |
| dedDualMode | — | `dedDualModeWorkflow`: 6 PASS / 2 FAIL (#4 Real Progress Event Pipeline; #6 AHSP Matching & Price Resolution Integrity) | run 2026-10-21 ★ + pembuktian stash (identik di pohon bersih) | CONFIRMED ★ — pre-existing, bukan regresi gelombang ini | Sesi 2026-10-21 |
| — | — | Inkonsistensi angka internal laporan 2026-10-19 (matriks 21 PASS vs laporan master "20/26") | kedua dokumen | CONFIRMED (dokumentasi) — dicatat, tidak mengubah status teknis | Final Test Matrix; Finalization Report |

### 4.8 UX, navigasi & mobile

| ID | Sev | Temuan | Bukti | Status | Sumber |
|---|---|---|---|---|---|
| UX-01 (BUG 1–3 navigasi) | P2 | "Semua Proyek" tak me-reset filter; 4 kartu statistik Beranda mati; RAB Generator mendarat di Dashboard | WorkspaceView; DashboardViewSwitcher | VERIFIED_FIXED — commit `9d60013`, terverifikasi klik Playwright | UI/UX Audit; Navigation Report |
| UX-02 | P3 | Target klik baris proyek tak konsisten (RAB vs Manajemen) | dashboard vs ProjectsView | CONFIRMED | Register |
| UX-03 | P3 | Anchor landing tercrop navbar fixed — #harga diperbaiki (commit `dd81439`, scroll-margin 84px); anchor lain LIKELY | `exact-landing.css` | PARTIALLY_CONFIRMED | Register; UI/UX Audit |
| R-01 | P0-rencana | Kelas layout Tailwind mati di DedAnalysisDashboard + 7 file `document/*` → grid/layout tak terbentuk. **Koreksi premis:** snapshot `magic-ai.css` membuat sebagian utilitas hidup; yang mati = grid 12-kolom/spacing/varian tertentu | DedAnalysisDashboard.tsx:561,619,788 | VERIFIED_FIXED (Wave 1: kelas semantik scoped per file; tsc/build + inspeksi; interior app tidak browser-verified lokal karena gate API — verifikasi penuh di Preview, NOT_RUN) — belum commit | Mobile Wave 0; Remediation Report |
| MOB-COLOR (2A) | P1 | Layer warna dokumen mati: 434 token warna Tailwind tak terdefinisi di 6 dari 7 view dokumen (semua varian `dark:` mati — snapshot 0 kemunculan `dark\:`) | inventaris token vs 38 file CSS termuat ★ (metode agen 2A; hasil di-diff pohon saat ini) | VERIFIED_FIXED — 434 aturan ditambahkan ke blok `<style hidden>` per file memakai selector token asli; zona konten → token `--ez-*`, zona selalu-gelap → literal authored; file ke-7 (DedRabWorkflowView) terbukti 0 token warna mati; inventaris ulang pasca-edit = 0 tersisa; tsc 0 ★. Catatan: DrawingGraphExplorerView & EntityResolutionReviewView adalah konsol gelap satu-tema → restorasi literal penuh (keputusan terdokumentasi di kode; memetakan ulang bila suatu hari ikut berbalik tema). Belum commit | Sesi Finalisasi 2A |
| DS-01 (baru) | P2 | Variabel design-system self-reference siklik di `:root` → invalid di computed-value time (light mode): `--ez-color-border-line` (baris 59), `--ez-color-surface-tertiary` (19), `--ez-hue-{blue,green,purple,amber,slate,violet}-bg/-border` (85–99) semuanya `var()` ke dirinya sendiri; `--ez-color-surface-secondary` (18) menunjuk hue yang siklik | `src/styles/ezrab-design-system.css:18,19,59,85-99` ★ (grep langsung hari ini) | CONFIRMED ★ — komponen yang mengonsumsi var ini di light mode diam-diam kehilangan warna; pemetaan 2A sengaja menghindarinya. Perbaikan = definisikan nilai konkret (batch token tersendiri) | Sesi konsolidasi |
| R-04 → MOB-HERO (baru) | P0-rencana | Hero dashboard modern: baris flex tak pernah menumpuk; maskot `flexShrink:0` min 280px memakan kolom teks → headline menyempit, tombol terlipat 3 baris, maskot terpotong tepi pada 390px | screenshot sebelum ★; `EzrabAiDashboardView.tsx` | VERIFIED_FIXED ★ — kait kelas `ezdb-hero/-text/-mascot` + aturan ≤767px (tumpuk vertikal); screenshot sesudah 390px: headline lebar penuh, tombol satu baris, maskot proporsional; desktop 1366 tanpa overflow. Belum commit | Mobile Wave 0 (R-04); sesi konsolidasi |
| MOB-GREET (baru) | P1 | Empty-state Ezrab Chat AI terpotong di 320px: blok `.ezchat2-empty` 351px di dalam body 260px (textarea flex tak bisa menyusut di bawah lebar intrinsik) → greeting & composer ter-clip kanan | pengukuran DOM ★ (greet 351px vs body 260px) | VERIFIED_FIXED ★ — `.ezchat2-empty{width:100%;min-width:0}` + `.ezchat2-pill textarea{min-width:0}`; sesudah: greet/pill 212px @320 & 282px @390 (persis lebar konten), screenshot bersih. Belum commit | Sesi konsolidasi |
| MOB-ONBOARD (2B) | P1 | Kartu checklist onboarding menutupi ±setengah layar mobile | FirstProjectChecklist | VERIFIED_FIXED ★ — default minimized bila `innerWidth<768` hanya bila belum ada preferensi tersimpan; preferensi `'0'` → kartu terbuka (terbukti reload); pill/expand/minimize berfungsi; desktop tak berubah. Belum commit | Mobile Remediation (Sisa 2); Finalisasi 2B |
| MOB-CTA | P1 | CTA navbar "Coba Gratis" `display:none` ≤374px | `exact-landing-flagship-mobile.css:378` | VERIFIED_FIXED (browser-verified lokal 320/360) — belum commit | Mobile Wave 0; Remediation |
| MOB-CHIP | P2 | Chip scene hero menimpa kolom cari demo pada 360–390px | `cinematic-hero.css` | VERIFIED_FIXED (browser-verified lokal) — belum commit | Remediation |
| MOB-MAT | P1 | Pencarian MaterialDatabaseView `minWidth:300px` (bahaya 320px) | `MaterialDatabaseView.tsx:1093` | VERIFIED_FIXED (kode; flex 1 1 220px, minWidth 0) — belum commit | Mobile Wave 0 (R-03); Remediation |
| MOB-CHATCSS | P1 | Chat `100vh` + header tanpa wrap di 320px | `ezrab-ai-chat.css` | VERIFIED_FIXED ★ (100dvh + wrap ≤480px; screenshot 320 header ter-wrap rapi; aspek lebar = MOB-GREET) — belum commit | Mobile Wave 0 (R-05); Remediation |
| MOB-NAV | P1 | Bottom nav dark mode: bilah putih hardcode | `global.css:517-575` | VERIFIED_FIXED ★ (token surface color-mix; screenshot dark 390: bilah gelap) — belum commit | Mobile Wave 0 (R-09); Remediation |
| MOB-TOPBAR | P1 | Hamburger TopBar 32px (< target 44px; area efektif terbantu `.ezrab-touch-target`) | `TopBar.tsx:291-311` | VERIFIED_FIXED (40px eksplisit) — belum commit | Mobile Wave 0 (R-07); Remediation |
| MOB-DRAWER | P1 | Drawer 768–1023px tanpa safe-area/100dvh | `workspace-mobile-fixes.css` | VERIFIED_FIXED (perluasan aturan ≤1023px) — belum commit | Mobile Wave 0 (R-07); Remediation |
| R-02 | P2 | Overflow ter-clip senyap oleh `.ezrab-workstation-scrollable{overflow-x:hidden}` + masker 3 lapis (body, flagship ≤767, workstation) | `global.css:26,683` | CONFIRMED (keadaan struktural; pengukuran hari ini memakai scrollWidth sehingga tidak tertipu masker) | Mobile Wave 0 |
| R-06, R-10…R-14 | P2/P3 | Risiko statis belum diuji live: toolbar RabEstimasiView; sel min-width DedAiResultView/DokumenAiView; form QTO & viewer 100vw; panel co-assistant 100vw; grid wizard RAB di 320px | file masing-masing | PARTIALLY_CONFIRMED (statis; belum direproduksi live) | Mobile Wave 0 |
| R-08 | P1-rencana | `exact-landing.css` deferred → risiko FOUC; WebGL hero di ponsel | `ExactLandingPage.tsx:40-42` | PARTIALLY_CONFIRMED (statis; sapuan live 21 section = 0 error, FOUC tidak teramati di uji lokal) | Mobile Wave 0 |
| R-13 | — | AHSP Explorer/Laporan/Keuangan/Pengaturan belum diaudit baris-per-baris | — | BLOCKED_INPUT (belum dikerjakan; bukan cacat terkonfirmasi) | Mobile Wave 0 |
| MOB-BP (2C) | P2 | Konsolidasi breakpoint: ≥15 ambang di 34 file CSS | sensus 2C | **Keputusan: DITOLAK dengan bukti** — nol konflik sejati; pasangan 767/768, 639/640, 1023/1024 adalah komplemen eksak; ambang lain lokal-komponen; design-system tak punya skala lebar untuk dikonsolidasi. Scatter = utang dokumentasi, bukan sumber cacat. Satu catatan kosmetik: DedAiSplitAnalysisView memakai batas `<=768` (satu-satunya) — normalisasi = keputusan produk | Finalisasi 2C |
| P2-4 | P2 | HELP_TEXT & pesan registry masih memakai emoji | intentRouter HELP_TEXT | CONFIRMED | Core AI §G |
| DSN-W/F | — | 3 item desain generik (mortar/grade beton/ukuran keramik) tanpa spesifikasi cukup | DesignSpreadsheet→designToRabBridge | CONFIRMED — REVIEW_REQUIRED; auto-mapping ditolak (keputusan desain) | QTO Mapping |

### 4.9 Blocker rilis eksternal (gabungan B1–B6 2026-10-19 & B1–B7 2026-10-20 — penomoran B tidak stabil antar-dokumen; konsolidasi memakai nama, bukan nomor)

| Blocker | Isi | Status |
|---|---|---|
| Rotasi secret | 8 secret lama pernah bocor di history; origin/main sudah purge (2026-10-17), 12 branch tidak di-purge atas keputusan owner; **rotasi di dashboard provider belum dilakukan** | OPEN — aksi owner |
| Kunci AI Vercel | Verifikasi GEMINI_API_KEY_1..6 / ZYROUTER / DAHL / RIVER / GEMINI_OAI di Vercel | PARTIAL — sebagian terkonfirmasi hidup via engine-status (sesi sebelumnya); sisanya wewenang owner |
| AI_GATEWAY_TOKEN | Belum dipasang → lihat SEC-03 | BLOCKED_ACCESS |
| SERPER_API_KEY | Belum ada (owner perlu daftar serper.dev) → SEC-09 dorman | OPEN — aksi owner |
| VPS/backend | Ledger, auth produksi, deployment backend menunggu VPS dibeli (keputusan owner 2026-10-18) | BLOCKED — keputusan owner |
| Access Gate Production | Env Production (kode+secret berbeda) + promosi manual | OPEN — aksi owner |
| Auth production | `AUTH_ENABLED` & pengujian login produksi | OPEN — terkait VPS |

## 5. Temuan yang DICABUT (jangan dihidupkan kembali)

| ID | Klaim awal | Pencabut |
|---|---|---|
| INF-02 | ezrab.site menyajikan bundle lama | Register (verifikasi langsung: production mutakhir) |
| INF-01 | Semua endpoint /api/* 404 di production | Register (engine-status live 200) |
| API-07 | multi-provider/execute open relay tanpa auth | Register (wrapper tipis ke gateway kanonik) |
| SEC-06 | CORS wildcard `*` pada endpoint AI | Register + Security Review (allowlist) |
| SEC-11 | Chat mengembalikan error provider mentah | Register (sisa kecil dipindah ke SEC-19) |
| INF-04 | Sourcemap production aktif | Register (.js.map live 403) |
| — | "Dinding bata NO_MATCH" (audit mapping QTO awal) | QTO Mapping Report (koreksi keyword → REVIEW_REQUIRED; = D1 Finalisasi) |
| F-003/F-004 (sebagian) | "Production basi" | Matrix §D (verifikasi langsung menang) |
| — | Unit "104/105" (1 fail ahspAccuracyGolden) | Full Functional Report (fail = limitasi shim; efektif 105/105) |

## 6. Peta duplikat antar-ID (root cause + bukti sama)

CR-02 = F-002 = P1-2 = P1-6 · P0-3 ⊂ CR-08 · CR-01 = P1-1 · CR-10 = P2-3 · AI-08 = P1-4 · CR-01…(lihat tabel) · API-11 = F-003/F-004 (bagian benar) · SEC-17 = F-010 · INF-06 = F-007 = F-021 = UX-04 · AHSP-02 = "AHSP-01 kedua" di Register (tabrakan ID) · F-014 = P2-6 · F-015 ⊃ P2-5 · SEC-08 ≈ CR-03 (terkait, bukti beda — dipertahankan terpisah) · BUG-2 harga ≈ P1-01 sprint (jalur sama, tak dinyatakan eksplisit di sumber) · SEC-09 ↔ P2-02 sprint (konteks Serper). Severity SEC-04 berbeda antar-sumber (P2 vs P3) — dipakai P3 dengan catatan.

## 7. Yang tidak dapat diverifikasi putaran ini

- Seluruh status live Supabase/RLS/drift (F-GATE-02, F-012): BLOCKED_ACCESS.
- Postur token gateway di Vercel (SEC-03): BLOCKED_ACCESS.
- Benchmark DED vs Gemini & retest DED-1/DED-2: BLOCKED_INPUT (fixture PDF "jembot" tidak ada di repo).
- MS Excel untuk EXP-01: NOT_TESTED (validasi LibreOffice saja).
- Build konfigurasi produksi standar pada pohon final di sandbox: gagal lingkungan (BUILD-ENV); build Vercel untuk pohon ini: NOT_RUN.
- Preview deployment untuk changeset mobile 17 file: NOT_RUN (belum commit/push — menunggu persetujuan owner).
- `npm audit`: BLOCKED_ACCESS.
