# CORE AI WAVE 0 AUDIT — EZRAB Core AI Intelligence Upgrade

Tanggal: 2026-10-21 · Mode: **READ-ONLY** (tidak ada kode diubah; satu-satunya file yang ditulis adalah laporan ini)
Repo: `~/workspace/ezrab-unified` · Branch: `integrasi/unified-ui-engine` · HEAD: `ce968a8`
Acuan: MASTER PROMPT "EZRAB CORE AI INTELLIGENCE UPGRADE" (Fase A–K, Wave 0–5). Nilai secret/kode akses **tidak** dicantumkan; hanya nama env var.

---

## A. Ringkasan Eksekutif

**Kondisi Core sebelum perubahan.** EZRAB memiliki **dua tumpukan AI paralel** yang hidup berdampingan:

1. **Stack "AI Tools"** (menu AI utama): `src/ai-tools/ezrab-ai` (Ezrab Chat AI), `ded-ai-estimate`, `document-ai` → `providerClient` → `POST /api/ai/tools/execute` → `api/_lib/aiGateway.js`. Intent lokal deterministik (25 intent) menangani navigasi/wizard/capability/query proyek; sisanya (UNKNOWN) jatuh ke model online dengan 10 tool lokal yang dipanggil lewat JSON-in-text.
2. **Stack "Core AI / Copilot"** (permukaan co-assistant di dashboard): `src/services/ai/core/*` (IntentEngine, agentLoop, planningEngine, ragEngine, ruleEngine, knowledgeRepository) + `src/services/ai/tools/aiToolRegistry.ts` (1.257 baris) + `src/services/coAssistantService.ts` + `aiOrchestrator.ts`, dirender oleh `src/components/copilot/*`. Dievaluasi suite `test:core-ai` (70/70 PASS).

**Masalah utama (bukti di §C/D/G):**

- **Billing Intelligence TIDAK ADA di chat**: tidak ada intent, tool, maupun data paket di system prompt. "Harga paket EZRAB berapa?" dijawab model tanpa sumber apa pun, padahal harga resmi hanya hidup sebagai konstanta statis di komponen landing (`ExactPricing.tsx`). Risiko angka karangan pada domain paling sensitif.
- **Pertanyaan harga material tidak di-route secara deterministik** — satu-satunya "router" adalah instruksi di system prompt agar model memanggil tool `cari_harga`. Bila model menjawab langsung, angka tidak grounded.
- **Kredit simulasi terpotong juga saat panggilan AI GAGAL** (`view.tsx` memanggil `consume()` tanpa memeriksa `res.success`).
- **Biaya provider tidak akan pernah terhitung**: tabel tarif hanya memuat 3 model, semuanya `null`; model-model yang benar-benar dipakai rantai produksi tidak ada di tabel → status selamanya UNDETERMINED/MODEL_UNKNOWN.
- **Server credit engine belum terhubung**: endpoint saldo mengembalikan 503 jujur; frontend tidak pernah mengambil saldo dari server; tidak ada payment provider sama sekali (top-up = mock instan).

**Yang sudah kuat (jangan dirombak):** intent router lokal + action registry (deterministik, tanpa kredit), grounding tools proyek (total tidak dihitung ulang model), gateway mode-aware pasca-remediasi AI-01 (Cepat ≠ Mendalam secara nyata), F-001 disclosure untuk fallback lokal Copilot, unit gate harga (F-016), dan kejujuran label SIMULASI di seluruh UI kredit.

**Risiko tersisa terbesar:** divergensi dua stack (dua intent engine, dua registry, dua jalur provider) dan billing tanpa sumber kebenaran tunggal.

---

## B. Peta Arsitektur (alur aktual dari kode)

```
PENGGUNA (menu Ezrab Chat AI — src/ai-tools/ezrab-ai/view.tsx, 820 baris)
  │  submit(): routeIntent() dipanggil DUA kali (pre-check kredit + routing)
  ├─ intent lokal (localOnly) ──────────────► actionRegistry.executeIntent()
  │     • navigasi via onNavigate (WorkspaceView.setActiveMenu)
  │     • overlay: RabWizard (START_RAB_WIZARD), DesignStudio, Game Space
  │     • query proyek dari projectSnapshot (ProjectContext, deterministik)
  │     • CAPABILITIES / CREATE_RAB_CLARIFY: jawaban produk hardcoded + tombol
  ├─ needsClarification ────────────────────► clarificationPrompt (lokal)
  └─ UNKNOWN ─► ezrabAiService.send() (service.ts)
        • riwayat 20 pesan terakhir + konteks proyek (teks) + daftar tool
        • system prompt: prompt.ts (EZRAB_AI_SYSTEM_PROMPT)
        └─► aiToolsProviderClient.execute(productId='EZRAB_AI', mode)
              └─► POST /api/ai/tools/execute → productIdToMode():
                    EZRAB_AI+fast → chain 'chat' | EZRAB_AI+advanced → 'advanced'
                    DED_AI_DETAIL → 'advanced' | lainnya → 'fast'
                    └─► api/_lib/aiGateway.js executeAI(): rantai provider per mode,
                        fallback berurutan, usage dicatat via usageMeter (adapter null)
        ◄─ balasan: service.ts mem-parse SATU tool-call JSON via regex;
           output tool MENJADI jawaban verbatim (FASE 5A); tanpa tool → teks model
  └─ Kredit SIMULASI: view memeriksa saldo mock sebelum kirim (dialog bila kurang)
     dan memanggil consume() SETELAH kirim — tanpa cek sukses (lihat P0-3).

PRODUK AI LAIN (Stack 1)
  • Ded Estimate AI Flow A: src/ai-tools/ded-ai-estimate/service.ts → providerClient
    (DED_AI_FAST / DED_AI_DETAIL) → gateway. Flow B: DedAnalysisDashboard →
    src/ai-estimate/aiEstimatePipeline.ts (engine src/ded-rab-v3/*).
  • AI Document: src/ai-tools/document-ai → DOKUMEN_AI → chain 'fast'.

STACK 2 — COPILOT (src/components/copilot/*, dipasang di WorkspaceView)
  coAssistantService.ts (1.350 baris) → aiOrchestrator → services/ai/core/*
  (intentEngine/agentLoop/rag/rule) + aiToolRegistry (1.257 baris).
  Fallback lokal: MockAIProvider-style engine — PASCA F-001 wajib terungkap
  (source: 'local-fallback' + pesan peringatan). Jalur provider produksinya
  memakai endpoint terpisah (api/ai/chat.js, api/ai/multi-provider/*),
  BUKAN gateway kanonis Stack 1.
```

### Komponen: lokasi, fungsi, sumber data, status

| Komponen | File | Fungsi | Sumber data | Status |
|---|---|---|---|---|
| Chat UI + composer | `src/ai-tools/ezrab-ai/view.tsx` | Render chat, routing lokal, dialog kredit simulasi, overlay wizard/studio/game | ProjectContext snapshot; mock kredit | ACTIVE |
| Session/history | `src/services/ai/conversation/unifiedConversationStore.ts` + state view | Percakapan per proyek; service memotong 20 pesan terakhir | State aplikasi/localStorage | PARTIAL (tanpa entity-state terstruktur) |
| Intent router | `src/ai-tools/ezrab-ai/intentRouter.ts` | Regex deterministik, 25 intent + slash commands | — | ACTIVE |
| Action registry | `src/ai-tools/ezrab-ai/actionRegistry.ts` | Eksekusi intent → navigasi/overlay/jawaban + tombol aksi | Snapshot proyek | ACTIVE |
| Tool set chat | `src/ai-tools/ezrab-ai/tools.ts` | 10 tool lokal sinkron (lihat §C) | AHSP repo, resolver harga, template registry, snapshot | ACTIVE |
| Chat service | `src/ai-tools/ezrab-ai/service.ts` | Susun prompt, panggil provider, parse 1 tool-call | — | ACTIVE (batasan: 1 tool/panggilan) |
| System prompt | `src/ai-tools/ezrab-ai/prompt.ts` | Identitas + aturan grounding proyek | — | PARTIAL (nol pengetahuan produk/billing) |
| Provider client | `src/ai-tools/providerClient.ts` | Browser → `/api/ai/tools/execute`; node → adapter server langsung | `aiModelRegistry` | ACTIVE |
| Model registry (klien) | `src/ai-tools/aiModelRegistry.ts` | Target model per produk (kepercayaan sisi klien) | Env klien/registry default | PARTIAL (gateway server yang menentukan rantai aktual) |
| Gateway | `api/_lib/aiGateway.js` (453 baris) | Rantai provider per mode, auth (Supabase JWT / `AI_GATEWAY_TOKEN` / degraded), usage meter | Env keys server (nama saja): `GEMINI_API_KEY_1..6`, `ZYROUTER_API_KEY`, `ATRIA_API_KEY_1..14`, `DAHL_API_KEY_1..80`, `GEMINI_OAI_KEY_1..12`, `RIVER_API_KEY_1..10` | ACTIVE |
| Endpoint tools | `api/ai/tools/execute.js` | Mapper produk→mode (AI-01) | — | ACTIVE |
| Copilot stack | `src/services/ai/core/*`, `coAssistantService.ts`, `aiOrchestrator.ts` | Core AI kedua: intent engine + agent loop + RAG + tool registry besar | Knowledge repo internal | ACTIVE (jalur terpisah; risiko divergensi) |
| DED Flow A/B | `src/ai-tools/ded-ai-estimate/`, `src/ai-estimate/` + `src/ded-rab-v3/` | Estimasi dari PDF (pasca patch kelengkapan 5a2d270) | PDF user; harga = AI_ESTIMATE berlabel | ACTIVE |
| Billing UI | `src/ai-credits/*` (config, mockAdapter, CreditPage, CreditBalance) | Saldo/ledger/top-up **simulasi** | In-memory modul (reset saat refresh sebagian) | ACTIVE sebagai SIMULASI |
| Billing server | `api/_lib/creditEngine.js`, `api/credits/*` | Ledger append-only + idempotency (desain Phase 2) | Adapter: **null** (503) / memory placeholder | NOT WIRED |
| Tarif provider | `api/_lib/providerTariffs.js` | Biaya provider berversi | 3 model, semua null | MISSING (data) |
| Tarif kredit | `api/_lib/creditPricing.js` + `src/ai-credits/config.ts` | Draft tarif Phase 1 (dua salinan konsisten) | Konstanta draft berlabel | DRAFT |

### Rantai provider per mode (gateway, `executeAI`)

- `chat` (EZRAB_AI Cepat): River Nemotron → River DeepSeek → Dahl → ZyRouter (+ ekor generik Atria/Dahl/River-text/Gemini-OAI).
- `advanced` (EZRAB_AI Mendalam, DED_AI_DETAIL): ZyRouter geminiflash-3.8 → Gemini 3.5 Flash-Lite (+ ekor).
- `fast` (DED_AI_FAST, DOKUMEN_AI): River DeepSeek-V4.1-Flash → Gemini Lite → Dahl → ZyRouter (+ ekor).
- `vision`: Gemini native → ZyRouter/Atria/River-vision (khusus gambar).

---

## C. Capability & Intent Matrix

### Intent yang ADA (intentRouter.ts, 25 intent)

GREETING · HELP · CAPABILITIES · OPEN_TEMPLATE · OPEN_PROJECTS · OPEN_PROJECT_CREATE · OPEN_RAB · OPEN_QTO · OPEN_AHSP · OPEN_REPORTS · OPEN_AI_DOCUMENTS · OPEN_DED_ESTIMATE · OPEN_SETTINGS · OPEN_DASHBOARD · OPEN_GAME_SPACE · OPEN_SPREADSHEET · START_RAB_WIZARD · START_HOUSE_DESIGN · CREATE_RAB_CLARIFY · SEARCH_AHSP · QUERY_PROJECT_TOTAL · QUERY_PROJECT_LIST · QUERY_MOST_EXPENSIVE_ITEMS · QUERY_CHEAPEST_ITEMS · UNKNOWN.

Pola: regex berurutan, confidence datar 0.85 (bukan probabilitas terkalibrasi — dicatat sebagai catatan §4 master prompt), `localOnly` untuk semua kecuali UNKNOWN.

### Tool yang ADA (tools.ts, 10 tool — semua sinkron, lokal, read-only, tanpa efek samping)

| Tool | Domain | Sumber data | Catatan |
|---|---|---|---|
| subtotal | Kalkulator | — | volume × harga |
| volume_persegi | QTO | — | p×l×t saja |
| luas_dinding | QTO | — | heuristik (2×p×t − bukaan) tanpa label asumsi |
| persentase_level | Kalkulator | — | kemiringan |
| cari_ahsp | AHSP | `officialAhspRepository` + `priceResolver2026` fallback | maks 8 hasil |
| cari_harga | Harga resource | `priceResolver2026.resolveResourcePrice` | material/upah/alat via argumen jenis |
| cari_template_rab | Template | `masterBuildingTemplateRegistry` | skor kata sederhana |
| get_project_total | Proyek | snapshot (engine kanonis) | subtotal + grand total + unresolved count |
| get_project_items | Proyek | snapshot | maks 25 |
| get_item_detail | Proyek | snapshot | klarifikasi bila ambigu |
| get_unresolved_items | Proyek | snapshot | daftar tanpa harga |

Pemanggilan tool dari UNKNOWN bersifat **model-mediated**: model harus menulis `{"tool": "...", "args": {...}}` di dalam teks; `service.ts` mengekstrak **satu** kecocokan regex pertama dan menjadikan output tool sebagai jawaban verbatim.

### Pemetaan taksonomi master prompt → realita

| Domain master prompt | Status | Bukti |
|---|---|---|
| GENERAL_CHAT | ADA (UNKNOWN → model) | service.ts |
| PRODUCT_CAPABILITIES | ADA (CAPABILITIES, teks hardcoded di actionRegistry) | actionRegistry.ts case CAPABILITIES |
| FEATURE_HOW_TO / NAVIGATION_REQUEST | SEBAGIAN (HELP statis + intent navigasi) | intentRouter HELP_TEXT |
| PRODUCT_COMPARISON, ACCOUNT_HELP | TIDAK ADA | — |
| CONSTRUCTION_QUESTION | ADA via model + prompt | prompt.ts |
| MATERIAL/LABOR/EQUIPMENT_PRICE_QUERY | **TIDAK ADA intent** — bergantung kepatuhan model memanggil `cari_harga` | intentRouter (tidak ada pola harga), prompt.ts aturan 3 |
| AHSP_SEARCH | ADA deterministik (SEARCH_AHSP, hanya bila frasa memuat "ahsp"/"cari ahsp") | intentRouter |
| AHSP_ANALYSIS | SEBAGIAN via tool cari_ahsp (tanpa komponen/koefisien rinci) | tools.ts |
| QTO_VOLUME_CALCULATION | TIDAK ADA intent; tool volume_persegi/luas_dinding model-mediated | tools.ts |
| RAB_CREATE | ADA (CREATE_RAB_CLARIFY, START_RAB_WIZARD, START_HOUSE_DESIGN) | intentRouter + actionRegistry |
| RAB_REVIEW | SEBAGIAN (QUERY_* proyek + get_unresolved_items via model) | tools.ts |
| RAB_COMPARISON, PROJECT_SCHEDULE, S_CURVE, CONSTRUCTION_REPORT | TIDAK ADA di chat (fitur ada di menu lain) | — |
| DED_DOCUMENT_ANALYSIS | ADA sebagai navigasi (OPEN_DED_ESTIMATE) + produk DED terpisah | intentRouter |
| **Semua intent BILLING** (SUBSCRIPTION_*, AI_CREDIT_*, PAYMENT_*, INVOICE, UPGRADE, REFUND) | **TIDAK ADA — intent, tool, dan data prompt semuanya absen** | intentRouter/tools.ts/prompt.ts |
| ERROR_DIAGNOSIS / CLARIFICATION_REQUIRED | SEBAGIAN (klarifikasi SEARCH_AHSP + item ambigu) | intentRouter, tools.ts |

### Penelusuran 4 pertanyaan kanonis (jalur aktual hari ini)

1. **"Berapa harga semen?"** → tidak ada pola intent yang cocok → UNKNOWN → model online. System prompt aturan 3 *memerintahkan* model memanggil `cari_harga` — bila patuh, jawaban = harga deterministik dari `priceResolver2026`; bila tidak patuh, model menjawab dari pengetahuan sendiri (tidak grounded, tanpa label sumber). Tidak ada klarifikasi jenis semen/satuan/lokasi yang terprogram. **Status: PARTIAL, bergantung kepatuhan model.**
2. **"Harga paket EZRAB berapa?"** → UNKNOWN → model online. Prompt tidak memuat data paket apa pun; harga resmi (Free Rp0 · Starter Rp59.999/bln · Pro Rp79.999/bln, tahunan −15%, batas proyek 1/10/20) hanya ada di `src/components/landing/exact/ExactPricing.tsx`. Model dapat menolak menjawab ATAU mengarang angka yang bertentangan dengan katalog. **Status: GAP P0.**
3. **"Berapa kredit saya?"** → UNKNOWN → model online. Saldo yang dilihat user di UI berasal dari `src/ai-credits/mockAdapter.ts` (simulasi in-memory) dan **tidak** diteruskan ke prompt/tool chat. Model tidak punya akses ke angka itu. **Status: GAP P0 (jawaban pasti tidak berbasis data).**
4. **"Kenapa kredit berkurang?"** → UNKNOWN → model online. Ledger simulasi ada (`mockGetLedger`) dan ditampilkan di CreditPage, tetapi chat tidak memiliki tool ledger. Ditambah temuan P0-3: pemakaian simulasi dicatat bahkan untuk panggilan yang gagal, sehingga pertanyaan ini punya penyebab nyata yang tidak bisa dijelaskan sistem. **Status: GAP P0.**

Pertanyaan lanjutan kontekstual ("Kalau yang 50 kg?") — Stack 1 hanya meneruskan 20 pesan terakhir sebagai teks; tidak ada entity-state (material/satuan aktif) yang dipertahankan antar-giliran. Model menebak dari transkrip. **PARTIAL.**

---

## D. Billing Integrity Matrix

| Datum | Sumber saat ini | Klasifikasi | Bukti |
|---|---|---|---|
| Harga paket | Konstanta `PLANS` di komponen landing | **CONFIGURED (statis, frontend-only)** — bukan katalog billing/entitlement | `src/components/landing/exact/ExactPricing.tsx:50-103` |
| Fitur & batas paket | Teks di komponen yang sama (proyek 1/10/20) | CONFIGURED (statis) — tidak ditegakkan di backend mana pun | ExactPricing.tsx |
| Jatah kredit paket | `PLAN_CREDITS` starter 10.000 / pro 20.000 | **DRAFT** (berlabel pra-produksi) | `src/ai-credits/config.ts` |
| Harga top-up | `TOPUP_OFFER`: Rp5.000 → 3.000+20% = 3.600 kredit (≈ Rp1.389/1.000 kredit — inkonsisten dengan nilai kredit paket ≈ Rp6.000/1.000; keputusan owner tertunda, CR-10) | DRAFT + **MOCK** (mockTopUp memberi kredit instan, tanpa pembayaran) | `src/ai-credits/config.ts`, `mockAdapter.ts` |
| Tarif konsumsi kredit | `TARIFFS` (klien) & `EZRAB_DRAFT_TARIFFS` (server) — dua salinan, nilai konsisten, keduanya `isCalibratedDraft: true` | DRAFT (duplikasi = risiko drift) | `src/ai-credits/config.ts`; `api/_lib/creditPricing.js` |
| Saldo kredit | UI: mockAdapter in-memory. Server: `api/credits/balance.js` → 503 `CREDITS_NOT_CONFIGURED` (adapter null; bila env `CREDITS_DB_CONFIGURED=true` pun adapter memory placeholder) | **SIMULATION** (UI) / **MISSING** (otoritatif) | `api/credits/balance.js` getAdapter(); frontend tidak pernah fetch saldo server |
| Ledger kredit | Desain server append-only + idempotency + bucket FIFO (bonus→topup→subscription) di `creditEngine.js`; belum ada adapter Supabase, migrasi ledger belum di-apply | **MISSING di produksi** (kode ada, tidak terhubung) | `api/_lib/creditEngine.js`; draft migrasi 20261018 (DO NOT APPLY) |
| Penggunaan kredit (usage) | Gateway mencatat via usageMeter dengan **adapter null** (dihitung, tidak disimpan persisten); `api/credits/usage.js` 503 tanpa konfigurasi | PARTIAL / NOT PERSISTED | `api/_lib/aiGateway.js:392-410` (`createUsageMeter(null)`), `api/credits/usage.js` |
| Biaya provider aktual | `providerTariffs.js`: hanya 3 model terdaftar, semua tarif `null`, `configured:false`; model produksi (DeepSeek-V4.1-Flash, Nemotron-3.5, DeepSeek-V4-Flash Dahl, geminiflash OAI) **tidak ada di tabel** → `MODEL_UNKNOWN`/UNDETERMINED | **MISSING** | `api/_lib/providerTariffs.js:20-55` |
| Pembayaran / invoice / payment status | Tidak ada integrasi payment provider (grep Midtrans/Xendit/Stripe: nol integrasi; hanya kata "stripe" di game/PDF) | **MISSING total** | seluruh repo |
| Subscription record / masa aktif | Tidak ada; login OFF (`AUTH_ENABLED=false`), tidak ada entitlement record | MISSING | konfigurasi aplikasi |
| Refund | Tidak ada kebijakan terkonfigurasi maupun alur | MISSING | — |

Kesimpulan billing: **seluruh domain billing adalah SIMULATION/DRAFT di frontend dan MISSING di server.** Tidak ada satu pun angka billing yang AUTHORITATIVE hari ini. Setiap jawaban billing dari chat harus bersumber dari konstanta katalog + label simulasi, atau tidak dijawab — tidak pernah dari model.

---

## E. Mock / Fallback Honesty Audit

| Jalur | Perilaku | Kejujuran | Bukti |
|---|---|---|---|
| Copilot fallback (Stack 2) | Gateway gagal → mesin lokal menjawab | **JUJUR pasca F-001**: `source: 'local-fallback'` + banner "Mode lokal…" | `src/services/coAssistantService.ts:365-386`, `aiOrchestrator.ts:420` |
| Chat AI (Stack 1) gagal provider | `aiToolsError` terstruktur → pesan error ramah, `isError` di UI | JUJUR (tidak ada fallback lokal di jalur ini) | `providerClient.ts`, `ezrab-ai/service.ts` |
| Gateway rantai provider | Provider gagal → provider berikutnya; semua gagal → error agregat (3 error pertama) | JUJUR; attempt log dicatat ke usage meter | `aiGateway.js` executeAI |
| Gateway tanpa auth terkonfigurasi | "DEGRADED MODE": hanya rate-limit + origin check, diperingatkan di log server | PARTIAL — aman hanya selama access gate aktif (SEC-03, NEEDS_ACCESS verifikasi Vercel) | `aiGateway.js:437` |
| Tool tidak ditemukan model | service mengembalikan tool output verbatim termasuk string error tool | JUJUR tapi kasar (pesan teknis tampil ke user) | `ezrab-ai/service.ts` blok tool parse |
| `cari_ahsp` resolver fallback | try/catch menelan error resolver (`catch { /* ignore */ }`) lalu menampilkan "harga lihat analisa komponen" | PARTIAL — kegagalan resolver tidak terlihat, tetapi tidak mengarang angka | `tools.ts` cari_ahsp |
| Kredit chat | `consume()` dipanggil **setelah** send tanpa memeriksa `res.success`; label tampilan kondisional, pemotongan tidak | **TIDAK JUJUR secara perilaku**: saldo simulasi berkurang untuk panggilan gagal | `src/ai-tools/ezrab-ai/view.tsx:338-348` |
| Harga tidak ditemukan (prompt) | Aturan prompt 4: katakan "tidak ada di database" lalu boleh beri "estimasi pasar" berlabel | PARTIAL — kejujuran bergantung model; tidak ada penegakan kode | `prompt.ts` aturan 4 |
| DED Flow B ekstraksi gagal | Kegagalan per halaman ditelan ke fallback teks (0 dimensi) → kuantitas unresolved | JUJUR di hasil akhir (unresolved, bukan angka karangan) tetapi kegagalan halaman tidak ditampilkan ke user | audit DED 2026-10-21 |
| Demo projects | ProjectContext menanam 4 proyek demo tanpa flag/label `isDemo` | TIDAK JUJUR (F-011, keputusan owner tertunda) | temuan audit produk F-011 |

Tidak ditemukan jalur di mana kegagalan provider Stack 1 disamarkan sebagai jawaban sukses berisi angka karangan di level kode; risiko karangan terkonsentrasi di **teks bebas model** untuk pertanyaan tanpa tool (billing, harga non-AHSP, pengetahuan umum).

---

## F. Test Results (baseline Wave 0 — benar-benar dijalankan)

| Suite | Perintah | Hasil |
|---|---|---|
| AI Estimate | `npm run test:ai-estimate` | **15 PASS / 0 FAIL** |
| Core calculator | `npm run test:core` | **74 PASS / 0 FAIL** |
| Core AI evaluation (Stack 2) | `npm run test:core-ai` | **70 PASS / 0 FAIL** |
| DED RAB (5 suite) | `npm run test:ded-rab` | **20/20 + 24/24 fixtures + 15/15 kriteria + 9/9 PASS** |
| Price database | `npm run test:price` | **69 PASS / 2 FAIL** — baseline lama (TEST 3 selisih rounding Rp0,5; TEST 10 invariant basi), bukan regresi |
| Chat context-aware | `npx tsx src/test/chatAiContextAware.test.ts` | **25 PASS / 0 FAIL** |
| Gateway security + integration | `npm run test:phase2-gateway` | **ALL PASS** |
| DED dual-mode | `npx tsx src/test/dedDualModeWorkflow.test.ts` | 6 PASS / 2 FAIL — identik baseline pra-patch DED (pre-existing: #4 progress pipeline, #6 AHSP matching) |
| Intent routing (harness ad-hoc sesi sebelumnya, tree sama) | esbuild harness 14 kasus | 14/14 PASS (termasuk "buatkan rabat beton" tidak tertangkap, "apa keunggulan bata merah" tidak dibajak) |

**Tidak dapat dijalankan (pre-existing F-014):** suite yang mengimpor `vitest` (tidak terpasang sebagai devDependency) — termasuk `src/test/aiDesign.test.ts`, `src/test/commandCenter.test.ts`, `src/test/aiCredits.test.ts` (billing regression praktis tidak bisa lari di sandbox). Typecheck `tsc --noEmit` dan `vite build` terakhir hijau pada tree yang sama (sesi yang sama, sebelum audit ini).

**Live checks yang TIDAK dilakukan (NOT_TESTED):** perilaku gateway di Vercel (postur token SEC-03), status deployment Preview terbaru untuk HEAD `ce968a8`, dan seluruh alur billing live (memang tidak ada backend-nya).

---

## G. Remaining Issues (P0/P1/P2) + Rencana Wave 1

### P0 — integritas jawaban

- **P0-1 Billing tanpa sumber di chat.** Tidak ada intent/tool/data billing; model menjawab "harga paket/kredit saya" dari ketiadaan. Bukti: §C penelusuran 2–4; `prompt.ts` (nol konten billing); `tools.ts` (nol tool billing).
- **P0-2 Harga material bergantung kepatuhan model.** Tidak ada intent MATERIAL_PRICE_QUERY; satu-satunya penegak adalah prompt aturan 3. Bukti: `intentRouter.ts` (pola harga absen), `ezrab-ai/service.ts` (tool hanya via JSON-in-text, maks 1 panggilan).
- **P0-3 Kredit simulasi terpotong saat AI gagal.** `consume()` tanpa guard sukses. Bukti: `src/ai-tools/ezrab-ai/view.tsx:338-348`.
- **P0-4 Tool-call tunggal.** Pertanyaan ganda (harga + volume + total) hanya mengeksekusi tool pertama; sisa dijawab model. Bukti: regex tunggal di `service.ts`.

### P1 — kelengkapan & konsistensi

- **P1-1 Tarif provider kosong & model produksi absen dari tabel** → biaya selamanya UNDETERMINED; finalisasi kredit tidak bisa usage-based. Bukti: `providerTariffs.js` (3 model null).
- **P1-2 Server credit engine tidak terhubung** (adapter null/memory; frontend tidak fetch saldo; migrasi belum di-apply — menunggu VPS & persetujuan). Bukti: §D.
- **P1-3 Dua stack AI paralel** dengan intent engine, registry, prompt, dan jalur provider berbeda → jawaban capability/harga dapat berbeda antar-permukaan; perbaikan harus diterapkan dua kali. Bukti: §B.
- **P1-4 Model truth terbelah**: registry klien (`aiModelRegistry.ts`) vs rantai server (`aiGateway.js`) — gateway mengabaikan model yang diminta klien dan memilih dari konstanta/env server; gerbang MODEL_MISMATCH hanya efektif di jalur node. Bukti: `providerClient.ts` vs `aiGateway.js` executeAI.
- **P1-5 Tanpa entity-state percakapan** untuk pertanyaan lanjutan harga/dimensi. Bukti: `service.ts` (transkrip teks saja).
- **P1-6 Usage meter tidak persisten** (adapter null) → "kenapa kredit berkurang" tidak akan bisa dijawab dari server bahkan setelah engine terhubung, tanpa perbaikan ini. Bukti: `aiGateway.js:392`.

### P2 — kualitas & kebersihan

- **P2-1** `luas_dinding` menyajikan heuristik kasar sebagai hasil deterministik tanpa label asumsi (tools.ts).
- **P2-2** Duplikasi tarif draft di klien vs server (config.ts vs creditPricing.js) — risiko drift.
- **P2-3** Nilai top-up tidak konsisten dengan nilai kredit paket (CR-10) — keputusan owner: kalibrasi sebelum monetisasi.
- **P2-4** HELP_TEXT & sebagian pesan registry masih memakai emoji (🧭🔍💬🎮) — tidak selaras arah desain bersih terbaru.
- **P2-5** `.audit-frag.json` stray di root repo (untracked) — keputusan owner: hapus/ignore.
- **P2-6** Suite billing/command-center tidak bisa lari (vitest absen, F-014) — coverage billing = nol yang dapat dieksekusi.

### Rencana Wave 1 — perubahan minimal (PLAN ONLY, belum diimplementasikan)

Prinsip: pakai ulang tool & pola yang sudah ada (`cari_harga`, `cari_ahsp`, pola SEARCH_AHSP, pola intent lokal + tombol aksi). Tanpa router baru, tanpa refactor stack, tanpa menyentuh harga resmi/gate satuan/ledger.

1. **Intent harga deterministik** (`intentRouter.ts` + `actionRegistry.ts`): pola `MATERIAL_PRICE_QUERY`/`LABOR_PRICE_QUERY`/`EQUIPMENT_PRICE_QUERY` untuk frasa "berapa harga X", "harga X berapa", "harga X" (dengan inferensi jenis dari kata kunci: semen/beton/bata→material; tukang/mandor/kuli→upah; excavator/molen/scaffolding→alat; ambigu→klarifikasi satu pertanyaan). Handler memanggil tool `cari_harga`/`cari_ahsp` yang SUDAH ada dan menjadikan outputnya jawaban (localOnly, tanpa kredit AI). *Risiko:* false-positive pada pertanyaan non-harga — dimitigasi pola mensyaratkan kata "harga" + uji negatif di harness. *Acceptance:* harness intent ≥20 kasus (positif/negatif/ambigu) PASS; chatAiContextAware tetap 25/25.
2. **Billing guardrail tanpa backend baru** (`intentRouter.ts` + `actionRegistry.ts` + satu modul konstanta bersama): ekstrak `PLANS` dari `ExactPricing.tsx` menjadi modul konfigurasi bersama yang dikonsumsi landing DAN chat (satu sumber katalog). Intent `SUBSCRIPTION_PRICING` menjawab dari konstanta itu + kalimat batas "pembelian/aktivasi online belum tersedia". Intent `AI_CREDIT_BALANCE`/`AI_CREDIT_USAGE` menjawab dari store simulasi yang sama dengan UI (mockAdapter) dengan label **SIMULASI** wajib + tombol ke halaman Kredit. *Risiko:* saldo simulasi disalahartikan sebagai saldo asli — mitigasi label + tidak pernah menyebut "saldo Anda" tanpa kata "simulasi". *Acceptance:* 4 pertanyaan kanonis §C tertelusur ke sumber deterministik; tidak ada angka billing dari model (uji: matikan provider, jawaban tetap benar).
3. **Perbaiki pemotongan saat gagal** (`view.tsx`): `consume()` hanya bila `res.success`. *Acceptance:* uji manual/harness — kirim pesan dengan gateway dimatikan → saldo simulasi tidak berubah; suite chat tetap hijau.
4. **Keras­kan prompt untuk domain tanpa tool** (`prompt.ts`): aturan baru — pertanyaan harga paket/kredit/pembayaran TIDAK dijawab dari ingatan; arahkan ke jawaban katalog/simulasi atau katakan belum tersedia. *Risiko:* rendah (teks). *Acceptance:* review diff + uji pertanyaan billing dengan provider aktif tidak memuat angka di luar katalog.
5. **Kelengkapan tabel tarif (tanpa angka)** (`providerTariffs.js`): daftarkan model-model produksi yang hilang sebagai entri `configured:false` agar status biaya terbaca `MODEL_NOT_CONFIGURED`, bukan `MODEL_UNKNOWN`. Pengisian tarif resmi = pekerjaan data owner (butuh sumber resmi provider) — BUKAN bagian Wave 1. *Acceptance:* `computeProviderCost` untuk model chat/DED mengembalikan status terkonfigurasi-false yang eksplisit; test gateway tetap PASS.
6. **(Wave 2, dicatat saja)** Capability registry tunggal: teks CAPABILITIES saat ini hardcoded di `actionRegistry.ts`; master prompt §6 meminta satu registry bersama UI/prompt/test.

Tidak ada perubahan schema, API publik, harga, atau transaksi dalam rencana ini. Setiap langkah butuh persetujuan eksplisit sebelum implementasi, dan commit/push/deploy tetap per instruksi terpisah.

---

## H. Readiness (per domain, berbasis bukti di atas)

| Domain | Status | Alasan ringkas |
|---|---|---|
| Construction Intelligence | **PASS WITH GAPS** | Grounding AHSP/harga/proyek kuat via tool; routing harga material belum deterministik (P0-2), tool-call tunggal (P0-4) |
| Product Intelligence | **PASS WITH GAPS** | CAPABILITIES + navigasi + wizard bekerja; registry belum tunggal, HOW_TO/comparison absen |
| Billing Intelligence | **FAIL** (sebagai fitur) / jujur sebagai simulasi | Tidak ada intent/tool/sumber otoritatif; UI melabeli simulasi dengan benar, chat tidak bisa menjawab sama sekali |
| Tool Execution | **PASS WITH GAPS** | 10 tool deterministik read-only; pemanggilan model-mediated, 1 tool per giliran |
| Security | **PASS WITH GAPS** | Access gate aktif-teruji di Preview; postur token gateway = NEEDS_ACCESS (verifikasi Vercel oleh owner); degraded mode terdokumentasi |
| Regression Coverage | **PASS WITH GAPS** | Suite inti hijau (15/74/70/25, gateway PASS); billing & command-center terblokir vitest (F-014); test:price 69/2 baseline |
| Production Readiness | **NOT_TESTED / BLOCKED** | Sesuai vonis audit produk: staging READY, production NOT READY (billing backend, auth, VPS — keputusan & akses owner) |

### Lampiran — Status working tree saat audit (tidak diubah)

- **Staged:** tidak ada. **HEAD:** `ce968a8` (di atas `5a2d270` DED, `1de259e` UI, `1464ff6` access gate).
- **Unstaged — Remediation Wave 1 (9 file):** `api/_lib/aiGateway.js`, `api/ai/engine-status.js`, `api/ai/tools/execute.js`, `src/components/settings/UnifiedSettingsView.tsx`, `src/data/priceDatabase2026/resolver.ts`, `src/export/excelExportEngine.ts`, `src/services/ai/orchestration/aiOrchestrator.ts`, `src/services/coAssistantService.ts`, `src/test/priceDatabase2026.test.ts`.
- **Unstaged — F-018 errata (6 file):** `scripts/ahsp2026/syncCiptaKaryaMaster.py`, `scripts/ahsp2026/testAhsp2026.ts`, `data/ahsp2026/validated/ahsp_2026_master.json`, `data/ahsp2026/validated/ahsp_2026_components.json`, `src/data/nationalCostDatabase/ahsp2026Canonical.generated.ts`, `src/data/nationalCostDatabase/ahsp2026CanonicalResources.generated.ts`.
- **Untracked:** `docs/audit/` (21 file, termasuk laporan ini), 3 laporan longgar di `docs/`, `data/ahsp2026/reports/sync_errata_applied.json`, `.audit-frag.json` (stray — keputusan owner tertunda).
- Tidak ada commit/push/deploy/migrasi yang dilakukan audit ini.
