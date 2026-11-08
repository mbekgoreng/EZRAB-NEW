# CONSTRUCTION INTELLIGENCE ARCHITECTURE

Dokumen arsitektur Fase Intelligence Engine (perluasan ketiga owner, 2026-11-08), ditulis dari bukti kode di repo `ezrab-unified`. Status jujur per bagian dinyatakan eksplisit: SELESAI / SEBAGIAN / RENCANA SAJA.

> **Pembaruan finalisasi (2026-11-08, sesi finalisasi + audit ekstrem):** dokumen ini diperbarui ke keadaan akhir program — KB 50 record, CalculateQTO AVAILABLE, konflik default finansial TERSELESAI (0%/0% menyeluruh), feedback dilengkapi transisi stage, dan temuan isolasi sesi ditambahkan. Hasil benchmark ekstrem 800 kasus ada di `CONSTRUCTION_AI_TEST_RESULTS.md`; kesiapan akhir di `CONSTRUCTION_INTELLIGENCE_FINAL_READINESS.md`.

## 1. Audit arsitektur AI saat ini (dari kode)

### 1.1 Routing provider & mode

Titik masuk server: `api/ai/tools/execute.js`, membungkus gateway kanonis `api/_lib/aiGateway.js`. Fungsi `productIdToMode(pid, requestedMode)` memetakan produk ke rantai:

| Produk | Mode | Rantai (urutan fallback) |
|---|---|---|
| EZRAB_AI (Chat AI), default "Cepat" | `chat` | AtmoRouter `ag/gemini-3.8-flash-high` (Crown) → Gemini native `gemini-3.5-flash-lite` → AtmoRouter `cx/gpt-6-luna` → ZyRouter `geminiflash-3.8` (+ ekor generik) |
| EZRAB_AI, mode "Mendalam" | `advanced` | Crown (AtmoRouter) lebih dulu, lalu rantai chat |
| DED_AI_DETAIL | `advanced` | Sama |
| DED_AI_FAST, DOKUMEN_AI, lainnya | `fast` | Crown (AtmoRouter) → Gemini native → River DeepSeek V4.1 → AtmoRouter DeepSeek flash → ZyRouter (+ ekor chat) |

Catatan koreksi finalisasi: rantai di `api/_lib/aiGateway.js` menempatkan Crown (AtmoRouter) di KEPALA rantai; draf sebelumnya menulis Gemini native lebih dulu — diperbaiki di sini sesuai kode. Default registry aplikasi (`src/ai-tools/aiModelRegistry.ts`, gerbang branded): EZRAB_AI = `nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4` (river); DED_AI_FAST = `deepseek-ai/DeepSeek-V4.1-Flash` (river, fallback gemini-3.5-flash-lite); DED_AI_DETAIL = `geminiflash-3.8` (zyrouter).

Kunci provider dipasang owner di environment deployment; **tidak ada kunci di lingkungan pengembangan ini** dan tidak ada kunci yang dipegang/diubah oleh tugas ini.

### 1.2 Orkestrasi chat & prompt

- System prompt: `src/ai-tools/ezrab-ai/prompt.ts` (`EZRAB_AI_SYSTEM_PROMPT`) — memerintahkan model memakai tool data EZRAB sendiri (`cari_ahsp`, `cari_harga`, `cari_template_rab`), melarang mengarang angka, dan menetapkan harga tak tersedia ≠ Rp0.
- Routing intent deterministik: `intentRouter.ts` → `actionRegistry.ts`. Jalur RAB universal: `universalRab.buildUniversalDraft()` atas katalog template resmi (180 template).
- Bahasa jawaban mengikuti bahasa pengguna (aturan satu sumber `RESPONSE_LANGUAGE_RULE`).

### 1.3 Penyimpanan konteks (kelemahan tercatat + satu perbaikan finalisasi)

State percakapan bersifat **module-level**: `lastRabNeeds`/`lastRabRaw`/`pendingSubtypeNeeds`/`pendingChoice` di `actionRegistry.ts`, `lastUniversalDraft` di `universalRab.ts`. Konsekuensinya: state tidak terikat per-proyek/per-sesi secara struktural — dapat diterima untuk SPA satu pengguna, tetapi BUKAN isolasi per proyek/sesi yang sesungguhnya; risiko konkurensi multi-tab/multi-pengguna pada satu proses tetap tercatat sebagai risiko terdokumentasi (mitigasi penuh = kunci per sesi/proyek, belum dilakukan).

**Temuan & perbaikan finalisasi (2026-11-08, benchmark Kategori F):** pergantian topik dari kebutuhan rumah ke draft universal (mis. gudang) sebelumnya TIDAK membersihkan `lastRabNeeds`, sehingga afirmasi "itu aja" sesudahnya difinalisasi terhadap kebutuhan rumah lama (bocor antar-topik, terukur). Perbaikan minimal di akar: jalur draft pada `universalResultFor` kini mengosongkan sesi kebutuhan (`lastRabNeeds = null`) karena draft universal adalah hasil akhir topiknya. Terverifikasi: rumah → gudang → "itu aja" kini `null`; jalur rumah normal, refinement, dan isolasi fakta draft antar-sesi tetap lulus (rabFinalizeFlow 51/51, benchmark F 96 PASS + 4 KNOWN-DEFECT).

**Nuansa tampilan yang dicatat jujur:** teks ringkasan awal sesi baru dapat menyebut fakta sesi sebelumnya (carryover tampilan), tetapi fakta draft hasil finalisasi hanya berisi data sesi aktif — isolasi pada level draft terverifikasi oleh kasus isolasi benchmark.

### 1.4 RAG / embedding — keadaan sebenarnya SEBELUM tugas ini

**Tidak ada.** Tidak ada embedding, tidak ada indeks vektor, tidak ada layanan retrieval di jalur AI sebelum tugas ini (satu-satunya penyebutan "rag" di kode lama adalah bukan konteks retrieval). Yang ada adalah pencarian kata kunci terstruktur: `chatSearch.searchChatAhsp` (AHSP), pencarian template, dan registry kalkulator. Fase ini menambahkan retrieval lokal deterministik (bagian 3) — **bukan** RAG semantik, dan tidak diklaim sebagai RAG semantik.

### 1.5 Diagnosis penyebab masalah gudang (bukti, bukan tebakan)

Penyebab terkonfirmasi adalah **klasifikasi + ekstraksi + validasi deterministik**, bukan model yang lemah dan bukan prompt:

1. Ekstraksi: dimensi "10 x 20 m" tertangkap sebagai dimensi lahan/denah di `rabNeeds.ts` dan tidak pernah menjadi luas tapak di jalur universal (`extractUniversalSpec` hanya memakai `buildingArea`) → basis ukuran kosong.
2. Taksonomi: fungsi dan kompleksitas tercampur — 'gudang' duduk di scope berlabel "Gedung & Bangunan Bertingkat" dengan ukuran utama `areaOrFloors`, sehingga ketiadaan lantai ikut memblokir.
3. Validasi: `scopeMeasureAvailable` gagal → pesan penolakan generik "belum bisa menghitung volume secara bertanggung jawab".

Karena penyebabnya di lapisan deterministik, perbaikan dilakukan di lapisan itu; **provider/model tidak diganti** (tidak ada bukti terukur bahwa model adalah penyebabnya).

## 2. Knowledge base konstruksi terstruktur — SELESAI (fondasi)

Modul: `src/ai-tools/ezrab-ai/constructionKnowledge.ts` — **50 record** dalam 10 kategori (Residensial, Komersial, Industrial, Institusional, Pertanian, Infrastruktur, Renovasi, Struktur, Arsitektural, MEP). Perluasan finalisasi §6 menambahkan 18 record (villa, apartemen, pasar, aula, tangki-silo, jalan-beton, jalan-aspal, box-culvert, kanopi, kolam-renang, parkir-garasi, listrik, air-bersih, hvac, proteksi-kebakaran, dapur-komersial, greenhouse, puskesmas-klinik-besar). Setiap record: nama umum, sinonim Indonesia, istilah Inggris, atribut tipikal, disiplin terkait, WBS konseptual, spek wajib vs opsional, ID kalkulator yang tersedia (diverifikasi terhadap registry nyata: **80 rujukan, 0 tidak valid**), status dukungan jujur, dan kemampuan yang tidak didukung. Distribusi status akhir: FULLY_SUPPORTED 15, PARTIALLY_SUPPORTED 23, SUPPORTED_GENERAL_WORKFLOW 4, REQUIRES_ENGINEERING_SPEC 6, NOT_YET_SUPPORTED 2 (hvac, proteksi-kebakaran).

**Provenance wajib per record**: sumber, tanggal sumber (2026-11-08), identitas dokumen (null — tidak ada dokumen resmi yang dirujuk), status verifikasi, cakupan berlaku, disiplin, versi. Seluruh record berstatus **`unverified`** dengan sumber persis: *"internal domain knowledge — unverified against official standard"*. Tidak ada nomor SNI/AHSP karangan ditempelkan di mana pun. WBS selalu berlabel **"conceptual work breakdown, not a verified BOQ"**.

## 3. Retrieval lokal deterministik — SELESAI (bukan RAG semantik)

Modul: `src/ai-tools/ezrab-ai/constructionRetrieval.ts`. Desain: tokenisasi query (stopword Bahasa Indonesia dibuang) → pencocokan frasa utuh (bobot 6) + kata persis pada istilah record (4) + kata pada istilah multi-kata (3) + id record (5) → filter metadata opsional (kategori, status dukungan) → dedupe per record → peringkat skor → batas konteks `maxResults` (default 5). Setiap hit membawa sitasi internal: `[KB:<id> · <sumber> · status verifikasi: <status> · v<versi>]`. `formatKnowledgeContext` membingkai hasil sebagai **bahan referensi, bukan kebenaran mutlak**, lengkap dengan status verifikasinya.

**Hasil evaluasi** (`constructionIntelligence.test.ts` + dataset `src/test/constructionRetrievalEval.json`, 105 kasus): **precision@1 = 100% (68/68)** pada query berlabel, **recall-in-top3 = 96,4% (27/28)**, **negatif benar 9/9**. Satu miss jujur yang terdokumentasi: tie-break "pondasi struktur atap rumah". Benchmark ekstrem menambah dua miss terukur yang dikodekan KNOWN-DEFECT: "jalan beton rigid" → record jalan umum (ideal: jalan-beton) dan "air bersih perpipaan" → record mep (ideal: air-bersih). Retrieval kini juga dilengkapi `searchWithOutcome()` (hasil negatif membawa alasan eksplisit) dan kamus typo terdaftar (`REGISTERED_TYPOS`).

**Rencana RAG semantik (RENCANA SAJA, belum diimplementasikan):** bila volume KB tumbuh jauh dan pencarian kata kunci terbukti kurang pada evaluasi berkala, integrasi yang akan dinilai: embedding atas field teks record KB + data aplikasi (judul template, nama AHSP) dengan indeks vektor yang di-host sendiri, sitasi provenance dipertahankan per hit, dan gerbang evaluasi precision yang sama sebelum diaktifkan. Tidak ada layanan eksternal/berbayar yang dipasang dalam tugas ini, sesuai pagar biaya brief.

## 4. Representasi pemahaman terstruktur (IR) — SELESAI

Modul: `src/ai-tools/ezrab-ai/buildingTypology.ts` — `ProjectUnderstanding`: functionId/functionLabel, kategori KB, kompleksitas (terpisah dari fungsi), width, length, footprint, landArea, statedBuildingArea, floors {value, source: explicit|assumption, explicit}, height, structuralSystem, roofSystem, location, coveragePct, flags. Finalisasi §5 menambahkan field: `totalFloorArea`, `disciplines` (jamak), `perimeter` (pagar keliling lahan 20x30 → 100 m terverifikasi), `existingConditions`, `requestedScope`, `requiredSpecifications`, `missingInformation` (terhubung di `assessBuildingMissingInfo`), `dimensionProblems` (dari lapisan validasi bersama `validatePhysicalDimensions`), dan `provenance`. Setiap field numerik adalah `FieldConfidence` {value, source: explicit|derived|assumption|unknown, ambiguity?}. Aritmetika dimensi (footprint = panjang × lebar; cakupan hanya dari dua luas eksplisit) adalah **kode deterministik, bukan LLM**. Temuan jujur §5: "bangunan 200" tanpa satuan TIDAK diekstrak sebagai luas bangunan dan tidak ditebak.

Kasus penerimaan terverifikasi tes: gudang 10×20 + lahan 500 → function gudang/Industrial, footprint 200 m² (derived), land 500 m² (explicit, terpisah), coverage 40%, floors = 1 dengan source `assumption` + catatan ambiguitas terlabel (aturan owner 2026-10-22: tanpa sebutan lantai = asumsi 1 lantai tertulis terbuka; tidak pernah disimpulkan bertingkat).

Fungsi dan kompleksitas dipisahkan secara struktural: `detectComplexity` hanya menaikkan 'bertingkat' dari penyebutan lantai eksplisit. Koreksi pengguna ("gudang bukan gedung") ditangkap sebagai flag koreksi klasifikasi tanpa membuang dimensi yang sudah terkumpul.

## 5. Orkestrasi tool terkendali — SELESAI (registry + wrapper)

Modul: `src/ai-tools/ezrab-ai/constructionTools.ts` — registry 11 tool, masing-masing dengan skema input tervalidasi (wrapper melempar error pada input tidak sah), izin baca/hitung deterministik saja, output terprediksi:

| Tool | Status | Backing |
|---|---|---|
| ExtractProjectDimensions | AVAILABLE | buildingTypology.understandProject |
| CalculateBuildingArea | AVAILABLE | Aritmetika modul; total luas lantai hanya bila lantai eksplisit dari pemanggil |
| SearchConstructionKnowledge | AVAILABLE | constructionRetrieval |
| SearchAHSP | AVAILABLE | chatSearch.searchChatAhsp (resolver resmi) |
| SearchAvailableCalculators | AVAILABLE | calculatorRegistry.list() (194 kalkulator) |
| GenerateWorkScope | AVAILABLE | KB conceptualWbs (berlabel konseptual) |
| CreateRabDraft | AVAILABLE | universalRab.buildUniversalDraft |
| ValidateRabDraft | AVAILABLE | universalRab.draftReadiness |
| ValidatePriceProvenance | AVAILABLE | universalRab.displayPriceStatus |
| ResolveUnitPrice | AVAILABLE | Resolver yang sama persis dengan SearchAHSP — **tidak ada jalur harga kedua** |
| CalculateQTO | **AVAILABLE** (sejak finalisasi §7) | Wrapper tervalidasi `toolCalculateQto` di atas `calculatorRegistry` calculatorCore (194 kalkulator): menolak kalkulator tak terdaftar, ketidakcocokan satuan vs `primaryUnit`, dan input tak lolos skema; hasil membawa provenance + versi kalkulator. **Bahaya pemakaian yang dicatat:** nama parameter yang tidak dikenal dibuang diam-diam oleh validasi registry dan nilai default digantikan — pemanggil wajib memakai nama parameter skema yang benar |

AI tidak menjalankan query database arbitrer dan tidak mengubah data finansial resmi melalui tool-tool ini.

**Status integrasi (§3, jujur):** dari modul-modul baru, hanya `buildingTypology.understandProject` yang terhubung ke jalur produksi (lewat universalRab + actionRegistry). `constructionKnowledge`, `constructionRetrieval`, `constructionTools`, dan `constructionFeedback` **terimplementasi tetapi belum terhubung** ke jalur produksi — dirujuk oleh tes dan oleh buildingTypology (impor KB); menghubungkannya ke orkestrasi chat produksi adalah pekerjaan lanjutan yang didokumentasikan, bukan diklaim selesai.

## 6. Status komponen draft — SELESAI (pemetaan ke label yang ada)

Taksonomi di `buildingTypology.ts`: `CALCULABLE / REQUIRES_SPECIFICATION / REQUIRES_ENGINEERING_REVIEW / PRICE_UNRESOLVED / NOT_SUPPORTED`, dipetakan dari status item yang SUDAH ada di aplikasi lewat `componentStatusFromItem` (PRICE_UNRESOLVED → PRICE_UNRESOLVED; NEEDS_MAPPING/UNIT_MISMATCH → REQUIRES_SPECIFICATION; berharga & termeta → CALCULABLE) — satu sistem label, bukan duplikasi. Terverifikasi 4 kasus di suite Intelligence.

## 7. Strategi model — audit SELESAI; evaluasi live = RENCANA (BELUM DIJALANKAN)

- Konfigurasi FAST/ADVANCED terpetakan di bagian 1.1 dari kode gateway; tidak ada perubahan provider dalam tugas ini (prinsip owner: murah DAN bagus; model mahal tidak diasumsikan lebih baik; penggantian butuh bukti terukur).
- Keputusan routing yang didokumentasikan: tugas sederhana & terstruktur (ekstraksi dimensi, klasifikasi fungsi, validasi) dijalankan **deterministik tanpa model** — lebih murah, dapat diaudit, dan terbukti menjadi sumber cacat sebenarnya pada kasus gudang.
- Harness evaluasi live kini ADA sebagai file: `scripts/ai-audit/liveEvalHarness.ts` (perintah + syarat env tertulis di dalamnya). Dijalankan ulang pada finalisasi: **LIVE EVALUATION = NOT EXECUTED (exit 2)** — tidak ada kunci provider di environment (RIVER_API_KEY/ATMO_API_KEY kosong). Dataset `src/test/constructionScenarios.json` (364 kasus) + benchmark ekstrem 800 kasus siap menjadi bahan evaluasi live begitu kunci + anggaran tersedia dari owner. **Status: BELUM DIJALANKAN LIVE.**
- Kontrak prompt terverifikasi pada lapisan teks (benchmark G1, 33 pemeriksaan substring): 24 aturan bernomor + 5a/6a/6b pada `EZRAB_AI_SYSTEM_PROMPT`, termasuk aturan harga-belum-tersedia-bukan-Rp0 (aturan 7), dokumen/retrieval adalah DATA bukan instruksi (aturan 14 — mitigasi ADV-010 pada lapisan prompt), larangan mengarang sumber (12), larangan melabeli "RESMI AHSP" tanpa tool (15), keselamatan struktur + verifikasi ahli (13), label "Asumsi:", dan larangan LaTeX mentah pada `RESPONSE_FORMAT_RULE`. Kepatuhan model secara live TIDAK dieksekusi. Permukaan lampiran `buildTextAttachmentBlock` (textAttachment.ts) hanya memakai pembatas tanpa peringatan tak-tepercaya di dalam blok — mitigasi parsial, dicatat.

## 8. Sistem belajar terkendali — SELESAI pada batas modul + skema + tes

Modul: `src/ai-tools/ezrab-ai/constructionFeedback.ts`. Penangkapan peristiwa terstruktur lokal: jenis `user-correction | classification-failure | missing-knowledge | tool-failure | unsupported-request | extraction-error`, dengan dedup deterministik (kind + subjek ternormalisasi; occurrences bertambah, entri tidak berlipat) dan sink injeksi opsional. Pipeline review kini DITEGAKKAN oleh kode (finalisasi §10): `FEEDBACK_STAGE_ORDER` = [captured, deduped, validated, expert-approved, knowledge-updated, regression-tested, released] dan `advanceFeedbackStage` memajukan tepat satu stage per panggilan serta melempar error tanpa reviewer+catatan, untuk event tak dikenal, atau pada stage akhir — tidak ada jalur otomatis dari tangkapan ke pengetahuan permanen, tidak ada self-training. Batas jujur (blocker produksi): penyimpanan masih memori in-process + sink injeksi; persistensi DB belum ada, dan penangkapan runtime BELUM dihubungkan ke jalur produksi chat.

## 9. Pagar yang dipatuhi

- Lokal-only: tidak ada commit/push/deploy/migrasi/perubahan data produksi dalam seluruh tugas ini.
- Data/koefisien/formula AHSP resmi tidak diubah.
- `src/game-space/**` dan lapisan mobile tidak disentuh.
- **Konflik default finansial: TERSELESAI.** Keputusan owner 2026-11-08 04:54 menetapkan default proyek baru 0%/0%, dan perintah 05:01 menyamakan tiga permukaan sisa (template katalog, generator proyek contoh, literal ringkasan portfolio) ke 0/0 juga. Nilai eksplisit/historis tidak ditimpa: Premium Demo (grand total Rp1.089.879.733) dan flagship PRJ-2026-001 tetap pada field eksplisitnya; `computeSeedCostSummary` opts-5 yang menopang flagship tidak diubah. Verifikasi: matriks 9 jalur `financialMatrix9.test.ts` 20/20 + benchmark Kategori E 100/100.
