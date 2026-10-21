# EZRAB — Findings Register (Audit 2026-10-20)

Total temuan aktif: **42** — P0: 0 · P1: 8 · P2: 15 · P3: 19. Ditambah **6 temuan DICABUT** setelah verifikasi langsung (INF-01, INF-02, INF-04, SEC-06, API-07, SEC-11 — lihat barisnya) dan 1 NEEDS_ACCESS (INF-07). Akar masalah bersama ditandai RC (root cause):
- **RC-A — Backend belum diaktifkan**: login OFF, token gateway & kunci provider belum terpasang di Vercel, credits tanpa adapter DB.
- **RC-B — Production TIDAK basi (klaim awal DICABUT):** verifikasi langsung 16:38 WIB membuktikan ezrab.site mutakhir (aset bertanggal promosi hari ini) dan engine-status live "ready" dengan provider lama terkonfigurasi. Risiko production yang tersisa bersifat aktivasi (token gateway & kunci provider baru belum terverifikasi terpasang), bukan kesinkronan deployment.
- **RC-C — Dua sumber kebenaran**: registry vs gateway (AI), UI vs backend (credits), vercel.json vs dashboard (build).

| ID | Judul | Pri | Status | Bukti ringkas |
|---|---|---|---|---|
| INF-02 | ~~ezrab.site menyajikan bundle lama~~ **DICABUT 16:38 WIB** — verifikasi langsung: Last-Modified aset = 2026-10-20 12:10 WIB (sesuai promosi owner), production MUTAKHIR | — | RETRACTED | curl header live |
| INF-01 | ~~Semua endpoint /api/* 404 di production~~ **DICABUT** — /api/ai/engine-status live 200 "ready", provider terkonfigurasi (gemini_keys:6, zyrouter, atria:3) | — | RETRACTED | curl live 2026-10-20 16:38 WIB |
| API-11 | Frontend memanggil 5 rute yang hanya ada di dev shadow API (wizard, ded-analyses, receipt/scan) → 404 di production, teredam fallback | P2 | CONFIRMED | server/api/*.ts (dev-only) + apiEndpointInventory.test.ts |
| INF-10 | sitemap.xml domain utama menyajikan sitemap blog (rewrite tanpa syarat host) | P3 | CONFIRMED | vercel.json rewrites |
| SEC-03 | Gerbang AI terbuka bila AI_GATEWAY_TOKEN belum dipasang (kosong = lolos) | P1 | CONFIRMED | security.js:83-86; aiGatewayAuth.ts:15-27 (RC-A) |
| API-07 | ~~multi-provider/execute open relay tanpa auth~~ **DICABUT** — file 11 baris, wrapper ke gateway kanonik yang sama (auth/CORS/rate-limit terpadu); risikonya tercakup SEC-03 (mode degraded), bukan lubang terpisah | — | RETRACTED | verifikasi langsung file + grep |
| SEC-09 | /api/market/search tanpa auth/rate-limit/cache — kuota Serper dapat dihabiskan (DORMAN sampai SERPER_API_KEY dipasang) | P1 | CONFIRMED | api/market/search.js (RC-A) |
| SEC-06 | ~~CORS `*` pada endpoint AI~~ **DICABUT** — grep membuktikan tidak ada header Access-Control di luar security.js; chat.js & multi-provider adalah wrapper tipis ke gateway ber-allowlist | — | RETRACTED | grep + baca file langsung |
| CR-03 | Endpoint credits berlabel simulated:false + user 'anonymous' 200 bila flag DB dibalik (laten; tertutup gerbang 503 saat ini) | P2 | CONFIRMED (kode) | credits/balance.js:30-31; usage.js |
| AI-01 | Chat AI utama tidak memakai rantai 'chat'; toggle Mendalam no-op di server (endpoint chat.js hanya terujuk konfigurasi aiApiClient, tanpa pemanggil UI terkonfirmasi) | P1 | **FIXED 2026-10-20 (Wave 1, BELUM COMMIT)** — uji gateway 7 skenario PASS; baseline pra-fix terbukti no-op | tools/execute.js:11-14; ezrab-ai/service.ts:52 |
| CR-02 | Tidak ada ledger/debit server; usage dihitung lalu dibuang | P1 | CONFIRMED | aiGateway.js:405; creditEngine memory-only |
| CR-01 | Tarif provider 100% NULL; model produksi tak terdaftar → biaya/margin tak terhitung | P1 | CONFIRMED | providerTariffs.js:22-61 |
| CR-08 | Saldo tak cukup tak pernah memblokir; chat memotong juga saat respons gagal | P1 | CONFIRMED | view.tsx:343; DedAiInputView:113; DocAnalyzer:140 |
| SEC-01 | Login OFF — workspace publik (keputusan owner, fase demo) | P1 | CONFIRMED | authConfig.ts:14 (RC-A) |
| EXP-01 | 18 formula Excel rusak (awalan `=` ganda → formula jadwal/Kurva-S/cashflow tidak menghitung ulang) | P1 | **FIXED 2026-10-20 (Wave 1, BELUM COMMIT)** — validasi LibreOffice recalc cocok hitungan independen | excelExportEngine.ts:1560…1923 (18 titik; 25 titik lain benar) |
| RAB-01 | Pembulatan resolver tak konsisten: Σ subtotal ≠ harga satuan (≤ ±Rp 1/item) | P2 | CONFIRMED | resolver.ts:663-665; test:price TEST 3 merah |
| AHSP-01 | Invariant test:price ("nol harga di canonical") bertentangan desain generator (harga HSD by design) | P2 | CONFIRMED | priceDatabase2026.test.ts:262-271 vs header canonical |
| AI-03 | Mode advanced jatuh diam-diam ke 5 provider di luar rantai terdokumentasi | P2 | CONFIRMED | aiGateway.js:295-299 |
| AI-08 | Registry model = lapisan tampilan; gateway hardcode; dua sumber kebenaran | P2 | CONFIRMED | aiModelRegistry.ts vs aiGateway.js:40-46 (RC-C) |
| CR-04 | Label "Aktual terverifikasi" untuk potongan tarif draft | P2 | CONFIRMED | creditPricing.js:79-94 |
| CR-05 | creditEngine.reserve() menghitung ganda & tak mengembalikan sisa (dorman) | P2 | CONFIRMED | creditEngine.js:206-286 |
| CR-06 | Idempotency hanya Set memori per-instance | P2 | CONFIRMED | creditEngine.js:70,85 |
| CR-10 | Harga top-up ≈Rp1.389/1.000 kredit vs asumsi skema Rp10.000/1.000 (7,2×) | P2 | CONFIRMED | config.ts:26-34 — keputusan owner |
| SEC-05 | Konteks tools memvalidasi anon key, bukan JWT pengguna (IDOR laten) | P2 | LIKELY | tools/execute.js:46-49 |
| SEC-10 | Rate limit in-memory per instance; chat tanpa rate limit | P2 | CONFIRMED | security.js:112-146 |
| SEC-11 | ~~Chat mengembalikan error provider mentah~~ **DICABUT** — gateway jalur utama mengembalikan pesan generik; yang terverifikasi hanya kebocoran kecil di SEC-19 | — | RETRACTED | baca aiGateway.js + chat.js langsung |
| SEC-19 | market/search mengembalikan `e.message` mentah pada 500 (search.js:39); parse-body gateway serupa | P3 | CONFIRMED | verifikasi langsung |
| SEC-16 | Tanpa CSP/X-Frame-Options/X-Content-Type/Referrer-Policy (HSTS hadir via default Vercel) | P2 | CONFIRMED | vercel.json tanpa headers(); header live terverifikasi 16:38 WIB |
| SEC-17 | engine-status publik menampilkan jumlah kunci & nama model per mode (postur auth TIDAK dibocorkan — by design; risiko info rendah) | P3 | CONFIRMED | engine-status.js + respons live |
| INF-04 | ~~Sourcemap production aktif~~ **DICABUT** — vite.config tanpa pengaturan sourcemap (default nonaktif); .js.map live membalas 403 | — | RETRACTED | vite.config.ts + curl 16:38 WIB |
| INF-06 | dist 43 MB; halaman /app 3,9 MB gzip; canonical 16 MB di grafik awal | P2 | CONFIRMED | build lokal + header live |
| INF-07 | Dependency audit **NEEDS_ACCESS** — npm audit terblokir kebijakan registry sandbox (403); tidak ada angka kerentanan yang diklaim | — | NEEDS_ACCESS | jalankan npm audit dari mesin owner/CI |
| UX-04 | (= INF-06 dampak UX) mount lambat di perangkat lemah | P2 | CONFIRMED | lihat INF-06 |
| SEC-02 | Mode demo ?demo= user hardcode (App.tsx:249) | P3 | CONFIRMED | matikan sebelum rilis berbayar |
| SEC-04 | Flag auth dapat dioverride localStorage | P3 | CONFIRMED | authConfig.ts:8-10 |
| SEC-12 | Log server memuat isi pesan pengguna (PII) | P3 | CONFIRMED | handler chat (potongan 200 char) |
| SEC-13 | Upload DED tanpa batas ukuran server / magic-byte | P3 | CONFIRMED | dedService.ts:18 |
| SEC-14 | new Function() pada template Excel impor | P3 | CONFIRMED | excelImportEngine.ts:771 |
| AI-02 | Percobaan provider ganda pada mode chat (latensi gagal 2×) | P3 | CONFIRMED | aiGateway.js:282-299 |
| AI-04 | Mode 'chat' ter-clamp menjadi 'fast' oleh validator | P3 | CONFIRMED | security.js:200-203 |
| AI-05 | Tanpa sanitasi prompt-injection pada teks dokumen (mitigasi: policy prompt server) | P3 | LIKELY | document-ai/service.ts |
| CR-09 | QA lanjutan Dokumen AI tidak dimeterai | P3 | CONFIRMED | DocAnalyzer askQuestion |
| RAB-02 | (PASS) Sentinel factory + eksklusi total bekerja sesuai desain | — | PASS | rabItemFactory.ts:66-68; unifiedProjectEngine.ts:29-31 |
| AHSP-03 | Item VERIFIED A.1.02.4a.1.d berharga upah saja (material koef 1,25 tak berharga) | P3 | LIKELY | canonical; cek sumber SE DJBK |
| AHSP-01 | Antrean data: 1.048 NEEDS_REVIEW, 335 harga unresolved, 50 SMKK AMBIGUOUS, 1 SOURCE_DEFECT | P3 | CONFIRMED | canonical.generated.ts (fail-closed benar) |
| INF-03 | (= SEC-16 bukti production) | — | — | digabung ke SEC-16 |
| INF-05 | Drift perintah build: vercel.json build:full vs dashboard build:blog | P3 | CONFIRMED | vercel.json + API deployment (RC-C) |
| INF-09 | Rewrite catch-all /api/* menutupi 404 sebagai HTML 200 pada metode tak didukung | P3 | CONFIRMED | vercel.json rewrites |
| INF-12 | 12 file API mati/tak terpakai (stack multi-provider lama, credits/engine-status duplikat) | P3 | CONFIRMED | grep fetch frontend = 0 pemanggil |
| UX-02 | Target klik baris proyek tak konsisten (RAB vs Manajemen) | P3 | CONFIRMED | dashboard vs ProjectsView |
| UX-03 | Anchor landing lain berpotensi crop (hanya #harga yang diperbaiki) | P3 | LIKELY | exact-landing.css |

## Terverifikasi PASS (bukti di dokumen tema masing-masing)
- Integritas RAB/AHSP: recomputation 3/3 persis + sapuan 1.866 item (1.531 persis, 335 selisih sub-rupiah terjelaskan pembulatan); sentinel harga; gate UNIT_MISMATCH dua lapis; 0 harga Rp0 tersembunyi; undo/redo tunggal + guard input.
- Test: tsc 0 error; vite build PASS; test:core 74/74; test:calculator PASS 100%; test:phase2-integrity 16/16; test:price 65/67 (2 fail = konflik kebijakan pembulatan & invariant, lihat RAB-01/AHSP-01).
- Browser: 11 route, 0 error halaman.
- Gateway: fail-closed tanpa kunci; validasi input/media; policy prompt server tak tertimpa.
- Secrets: tidak ada kunci tertanam di kode; .env tidak terlacak git; perbandingan token timing-safe.
- Navigasi: 3 bug routing ditemukan & diperbaiki sesi ini (UX-01, commit 9d60013).

## NEEDS_ACCESS (tidak dapat diverifikasi sesi ini)
Status env production Vercel (AI_GATEWAY_TOKEN & kunci provider), kebijakan RLS Supabase aktual, log production, status DNS/alias ezrab.site di level proyek, perangkat fisik.
