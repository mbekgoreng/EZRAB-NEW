# Current State Audit: CoAssistant & Interactive RAB Wizard (Priority 1)
**Kode Dokumen**: `DOCS-COASST-AUDIT-001`  
**Status**: `COMPLETED`  
**Tanggal**: 15 September 2026  
**Pemeriksa**: Antigravity Core Reliability & Security Engineering  

---

## 1. Latar Belakang & Tujuan Audit

Audit ini dilakukan untuk membedah arsitektur runtime, alur data, keandalan intent, penanganan respons terstruktur, eksekusi tools, validasi skema, dan keamanan sistem CoAssistant EZRAB. Fokus audit adalah memastikan sistem tidak sekadar membalas teks biasa, melainkan mampu mengeksekusi workflow deterministik yang aman, transparan, dan terisolasi per-workspace.

---

## 2. Inventarisasi & Evaluasi Komponen Aktual

| Komponen / Modul | Lokasi File | Peran / Tanggung Jawab | Status Saat Ini | Temuan & Catatan Keandalan |
|:---|:---|:---|:---:|:---|
| **Chatbox UI** | `src/components/copilot/EzrabCoAssistantChatbox.tsx` | UI obrolan CoAssistant floating & dockable | `OPERATIONAL` | Menangani pesan, action proposal, dan wizard response. Memiliki mekanisme render status error dan debugging log pada mode development. |
| **Wizard Renderer** | `src/components/copilot/AssistantWizardRenderer.tsx` | Render kartu pilihan, form parameter, dan rekapitulasi RAB | `OPERATIONAL` | Mendukung filter kategori (Kecil, Menengah, Besar, Custom), pencarian instan, filter lantai, dan handling status *Coming Soon* / *Engineering Review*. |
| **CoAssistant Client Service** | `src/services/coAssistantService.ts` | Orchestrator klien, isolasi sesi user, dan routing API | `OPERATIONAL` | Memiliki sinkronisasi isolasi user (`syncUserIsolation`), delegasi ke `aiApiClient`, dan fallback aman ke copilot core engine jika network backend terputus. |
| **AI API Client** | `src/services/aiApiClient.ts` | HTTP client ke `/api/ai/chat` dan `/api/assistant/wizard` | `OPERATIONAL` | Mengelola token otentikasi Supabase, idempotency key, normalisasi respons, dan penanganan kode error terstandar. |
| **Intent Classifier** | `server/orchestrator/intentClassifier.ts` | Klasifikasi intensi berbasis rule, normalisasi kata kunci, dan security guard | `FUNCTIONAL` | Mendeteksi `AUTOMATIC_RAB_START`, small talk, query teknis, dan security threats. Perlu diekspansi ke Universal Intent Schema dengan ekstraksi entitas lengkap dan confidence scoring terstandar. |
| **AI Orchestrator** | `server/orchestrator/aiOrchestrator.ts` | Pipeline orkestrasi backend, eksekusi tool multi-turn, personality & rate limit | `OPERATIONAL` | Mengontrol siklus hidup obrolan, pemotongan kuota kredit langganan dari backend, validasi role, dan konfirmasi aksi mutasi. |
| **Wizard State Machine** | `server/services/wizardStateMachine.ts` | State machine deterministik sesi pembuatan RAB | `OPERATIONAL` | Mengelola transisi langkah (`PROJECT_CATEGORY_SELECTION`, `TEMPLATE_SELECTION`, `BASIC_PARAMETER_COLLECTION`, `RAB_PREVIEW`, `TEMPLATE_NOT_READY`), isolasi session-to-workspace, dan gating template tidak tersedia. |
| **Wizard API Routes** | `server/api/wizardRoutes.ts` | Endpoint REST `/api/assistant/wizard/*` | `OPERATIONAL` | Endpoint `start`, `answer`, `go-back`, `cancel`, dan `confirm` terhubung langsung ke `WizardStateMachine`. |
| **Template Resolver** | `server/services/templateResolver.ts` | Registri template master dan formula kalkulasi deterministik | `OPERATIONAL` | Memetakan template master (T36 1FL, T36 2FL, T45 1FL, T70 1FL, Paving, U-Ditch, Custom) menggunakan `SafeDecimalEngine`. |
| **Calculation Service** | `server/services/calculationService.ts` | Mesin hitung volume & AHSP PUPR 2026 | `STABLE` | Formula deterministik terverifikasi. Tidak boleh diubah sembarangan tanpa verifikasi teknik sipil. |
| **Tool Registry** | `server/tools/toolRegistry.ts` | Registri fungsi/tools yang dapat dipanggil AI | `EXPANDING` | Memiliki 30+ fungsi terdaftar. Perlu pembagian kategori formal (READ, ANALYZE, MUTATE) dan alur mutasi preview $\rightarrow$ confirm $\rightarrow$ audit log. |
| **Auth & Isolation** | `server/middleware/authMiddleware.ts`, `server/middleware/isolationGuard.ts` | Verifikasi JWT, role gating, dan isolasi tenant | `SECURE` | Backend memverifikasi token dan hak akses proyek secara mandiri tanpa mempercayai klaim frontend. |

---

## 3. Investigasi 12 Poin Kritis Audit

### 1. Apakah intent `AUTOMATIC_RAB_START` benar-benar terdeteksi?
- **Bukti**: Pada `server/orchestrator/intentClassifier.ts` (baris 116–160), pola seperti `"buatkan saya rab"`, `"buatkan RAB"`, `"buat RAB rumah"`, `"buatkan estimasi"` dinormalisasi dan mengembalikan intent `AUTOMATIC_RAB_START` dengan confidence $0.98$.
- **Hasil**: **TERDETEKSI PENUH**.

### 2. Apakah response wizard diteruskan dari backend ke frontend?
- **Bukti**: Pada `server/api/aiRoutes.ts` (baris 240–265), respons `aiOrchestrator.handleChat` yang mengandung field `wizardResponse` disertakan dalam JSON payload `{ success: true, wizardResponse: ... }`. Pada `src/services/aiApiClient.ts`, response dinormalisasi dan diteruskan ke `CoAssistantMessage.wizardResponse`.
- **Hasil**: **DITERUSKAN DENGAN BENAR**.

### 3. Apakah choices memiliki `id` dan `label`?
- **Bukti**: Seluruh pilihan dari `HouseTypeCatalog.getAll()` dan `TemplateResolver` dipetakan dengan properti wajib `id`, `label`, `value`, `nextStep`, `description`, `badge`, `area`, `floorOptions`.
- **Hasil**: **LENGKAP & VALID**.

### 4. Apakah renderer membaca property yang benar?
- **Bukti**: `src/components/copilot/AssistantWizardRenderer.tsx` membaca `data.choices`, `choice.label`, `choice.area`, `choice.defaultFloorCount`, `choice.badge`, `choice.disabled`, `choice.disabledReason`.
- **Hasil**: **STRUKTUR SESUAI**.

### 5. Apakah data kosong karena mismatch nama property?
- **Analisis**: Mismatch pernah terjadi pada iterasi lama saat frontend mengharapkan `options` sedangkan backend mengirim `choices`. Saat ini telah distandardisasi menjadi `choices: AssistantChoice[]` untuk kartu tipe dan `options: AssistantChoice[]` untuk pertanyaan single-select.
- **Hasil**: **TERATASI**.

### 6. Apakah response wizard tertimpa oleh response AI biasa?
- **Analisis**: Pada `server/orchestrator/aiOrchestrator.ts`, intent `AUTOMATIC_RAB_START` langsung mengembalikan `wizardResponse` dan memutus (*short-circuit*) pemanggilan LLM text generator biasa, sehingga respons wizard tidak tertimpa teks bebas.
- **Hasil**: **TERISOLASI DENGAN BAIK**.

### 7. Apakah session ID konsisten?
- **Bukti**: `WizardSession` dibuat dengan format `wiz_${timestamp}_${random}` dan disimpan dalam `WizardStateMachine.sessions` dengan index `sessionId`. Semua request lanjutan (`answer`, `go-back`, `cancel`, `confirm`) memverifikasi `workspaceId` yang sama.
- **Hasil**: **KONSISTEN & TERISOLASI**.

### 8. Apakah endpoint answer dan confirm benar-benar terhubung?
- **Bukti**: Endpoint `/api/assistant/wizard/answer` dan `/api/assistant/wizard/confirm` terdaftar di `server/api/wizardRoutes.ts` dan di-mount di `server/index.ts` serta Vite dev middleware.
- **Hasil**: **TERHUBUNG LENGKAP**.

### 9. Apakah frontend mengirim pilihan yang benar?
- **Bukti**: Saat kartu diklik, `AssistantWizardRenderer` memanggil `onAnswer(sessionId, choice.value)` yang mengirim nilai stabil (misal `HOUSE-T36-1FL`, `HOUSE-T120`).
- **Hasil**: **BENAR**.

### 10. Apakah error ditampilkan atau ditelan?
- **Bukti**: Pada `EzrabCoAssistantChatbox.tsx` dan `aiApiClient.ts`, jika terjadi network failure atau validation error, sistem mengembalikan pesan error yang jelas kepada pengguna dan menandai `isError: true`.
- **Hasil**: **DITAMPILKAN SECARA INFORMATIF**.

### 11. Apakah chatbox melakukan fallback ke bubble teks ketika structured response gagal?
- **Bukti**: Jika `wizardResponse` tidak valid atau gagal dimuat, chatbox merender teks isi pesan (`message.text`) di dalam bubble teks standar tanpa merusak layout obrolan.
- **Hasil**: **FAIL-SAFE & GRACEFUL**.

### 12. Apakah route API terdaftar pada server runtime yang benar?
- **Bukti**: Route terdaftar di `server/index.ts` (Express production backend) dan `vite.config.ts` (Vite dev server middleware).
- **Hasil**: **TERDAFTAR LENGKAP PADA SEMUA RUNTIME**.

---

## 4. Rencana Tindak Lanjut (Priority 1)

1. **Penguatan Universal Intent Engine**: Menstandarkan output classifier menjadi `{ intent, confidence, entities, missingParameters, activeWorkflow, requiresClarification }`.
2. **Kategorisasi Tool Registry Terstruktur**: Mengelompokkan tools ke dalam READ, ANALYZE, dan MUTATE dengan skema audit event dan dry-run.
3. **Adaptive Question Engine**: Memastikan alur pertanyaan bertahap (misal Jalan Aspal, Gedung, Rumah Custom) dipandu oleh schema backend.
4. **Observability**: Menambahkan structured telemetry logging dengan masking data sensitif (userId masking, requestId, latency).
