# Skill Engine — Rencana Migrasi & Cutover (Phase 2 Workstream 3)

**Status:** lapisan skill BARU mendarat sebagai kode tanpa wiring
(`src/ai-tools/skill-engine/`, 11 modul + 3 suite tes). TIDAK ADA jalur
produksi yang berubah: tidak ada berkas lama yang diedit, tidak ada handler
yang dipasang, tidak ada rute yang dipindah. Dokumen ini adalah rencana
cutover + integrasi DED/Document AI (Phase 4) + pembersihan legacy
(Phase 5) — semuanya menunggu grant terpisah per tahap.

**Keputusan owner yang mengikat:** (A) paralel read-only bila `parallelSafe`,
tulis serial per proyek; (B) tanpa ledger kredit kedua, tanpa billing di
Skill Engine — observabilitas + atribusi saja, 1 kredit = 200 token;
(C) lifecycle konservatif kode mati/server — rencana saja, tanpa hapus/pindah
di Phase 2; (D) MagicAiSuperView bukan mesin DED ketiga — target persis dua
mode DED (EZRAB AI MODE, FULL AI MODE).

---

## 1. Yang sudah mendarat (Phase 2 W3)

| Modul | Isi |
|---|---|
| `types.ts` | `SkillDefinition` + envelope `ExecutionContext` + approval + handler |
| `skillRegistry.ts` | Registry + validasi startup (12 kode error) + katalog tool injeksi |
| `quickActionSkillDefinitions.ts` | 10 kontrak Quick Action -> skill (diturunkan, bukan diduplikasi) |
| `commandSkillDefinitions.ts` | 13 skill perintah deterministik (metadata + `handlerRef`, tanpa impor handler) |
| `skillRouter.ts` | Wrapper `routeIntent` (injeksikan deteksi) + disambiguasi + peta Copilot |
| `skillExecutor.ts` | Eksekusi: peran/langganan/kanal/approval, lock tulis/proyek, retry berbatas, timeout, cancel, validasi output, metadata pemakaian |
| `skillState.ts` | State run persisten lintas navigasi SPA (+ adapter persistensi opsional) |
| `usageMetadata.ts` | Metadata pemakaian observabilitas-only (1 kredit = 200 token) |
| `executionContext.ts` | Pabrik `requestId`/`traceId` + kunci idempotensi deterministik |
| `dedIsolation.ts` | Cermin batas isolasi FULL_AI (sumber kebenaran: `dataSourcePolicy.ts`) |
| `index.ts` | Barrel ekspor |

**Temuan verifikasi (bukan asumsi):**

1. **Semua 10 `toolName` kontrak Quick Action MENGGANTUNG** terhadap registry
   tool live (38 tool, diverifikasi terhadap `tools.ts` + `toolRegistry.ts`),
   bukan hanya `audit_rab` seperti dicatat Fase 3. Resolusi per kontrak ada
   di `QUICK_ACTION_TOOL_MAPPING`: 4 dipetakan 1:1 (`cari_ahsp`, `cari_harga`,
   `hitung_qto`, `get_item_detail`), 1 diuraikan (`audit-rab` ->
   `get_project_items` + `get_unresolved_items` + `analyze_draft_costs`),
   1 dipetakan sebagian (`analisis-ded` -> `extract_ded_specs`, sisanya
   pipeline DED), 4 tanpa padanan live (`buat-laporan`, `periksa-kurva-s`,
   `recalculate`, `bantuan-fitur` — `allowedTools: []` + titik integrasi
   didokumentasikan). TIDAK ADA referensi menggantung di definisi skill.
2. **5 kontrak mendeklarasikan `requiredParameters` tanpa entri
   `parametersSchema`** (`HITUNG_VOLUME: dimensions`, `CARI_AHSP: keyword`,
   `CARI_HARGA: keyword`, `ANALISIS_DED: analysisDiscipline`,
   `BUAT_LAPORAN: period`). Input skill hanya memakai `parametersSchema`
   yang bertipe; kesenjangan dicatat di `contractNotes` per skill.
   Perbaikan kontrak (tambah entri skema / hapus flag required) adalah edit
   `src/data/quickActionContracts.ts` — butuh grant terpisah.
3. **Peran demo tidak terpeta (K-16 tetap terbuka).** Executor gagal tertutup
   (`ROLE_NOT_MAPPED`) untuk peran demo; tanpa peran hanya skill terbuka
   yang jalan. Pemetaan peran adalah keputusan owner.
4. **Flip AUTH (8a03451) mengubah atribusi, bukan otorisasi** (lihat §6):
   `userId` kini riil di sesi login nyata, tapi TIDAK ADA derivasi peran dari
   Supabase (terverifikasi: tanpa lookup `user_metadata`/`app_metadata`
   peran) — model izin tidak berubah; metadata pemakaian kini mengatribusikan
   `userId`.

---

## 2. Cutover Phase 1 — registrasi + wiring registry

**Tujuan:** satu registry skill hidup di startup aplikasi, dibangun dari
registry tool LIVE (bukan snapshot).

1. Buat pabrik startup (berkas BARU, mis. `src/ai-tools/skill-engine/
   productionRegistry.ts` — BUKAN bagian Phase 2):
   ```ts
   import { listToolDefinitions } from '../ezrab-ai/toolRegistry';
   import { buildToolCatalog, createValidatedRegistry } from './skillRegistry';
   import { QUICK_ACTION_SKILL_DEFINITIONS } from './quickActionSkillDefinitions';
   import { COMMAND_SKILL_DEFINITIONS } from './commandSkillDefinitions';

   export function createProductionSkillRegistry() {
     return createValidatedRegistry(
       [...QUICK_ACTION_SKILL_DEFINITIONS, ...COMMAND_SKILL_DEFINITIONS],
       buildToolCatalog(listToolDefinitions()),
     );
   }
   ```
   Catatan: impor `toolRegistry` HANYA di pabrik startup (bukan di modul
   skill-engine) agar graf impor berat tidak menular ke tes/unit.
2. Panggil sekali di startup Chat AI (view/service) + Copilot; gagal startup
   (definisi tidak sah) harus gagal NYARING (throw), bukan fallback diam-diam.
3. Guard `skillEngineArchitectureGuard.mjs` A9 sudah diperbarui di Phase 2
   untuk memin keadaan baru (lapisan skill hanya di `skill-engine/`).
4. **Jangan** menghapus `QuickActionContract` / `quickActionService` di tahap
   ini — definisi skill mereferensikannya; penghapusan menunggu Tahap 3.5
   (dialog klien) + grant.

**Gerbang:** `validateAll()` kosong + 3 suite skill-engine hijau + guard hijau.

---

## 3. Cutover Phase 2 — unifikasi routing (persyaratan, bukan kode)

Pekerjaan ini MENGEDIT berkas lama — di luar kepemilikan Phase 2 W3.
Prasyarat per sub-tahap (urutan = dependensi):

| # | Pekerjaan | Berkas yang disentuh | Gerbang |
|---|---|---|---|
| 2.1 | Lebur `detectIntent` ke `routeIntent` (taksonomi Copilot dipetakan; lihat `COPILOT_INTENT_MAP` di `skillRouter.ts`) | `coAssistantService.ts`, `intentRouter.ts` | Suite Copilot + Chat AI hijau; guard D3 diperbarui sadar |
| 2.2 | Copilot memakai `EzrabAiService.send` berprofil; `CoAssistantService.sendMessage` menjadi wrapper lalu dihapus | `service.ts`, `coAssistantService.ts`, Chatbox | Satu situs kirim `EZRAB_AI`; guard D1 diperbarui |
| 2.3 | Spreadsheet AI memakai service kirim bersama + `buildCanonicalContext` berprofil | `SmartAddWorkItemModal.tsx`, `service.ts` | G3 tidak regresi; guard D2 diperbarui |
| 2.4 | Confidence multi-kandidat + disambiguasi (`disambiguate()` sudah ada & teruji; router harus mengembalikan kandidat, bukan first-match tunggal) | `intentRouter.ts`, `actionRegistry.ts` | Kasus ambigu -> kartu pilihan, bukan first-match diam-diam |
| 2.5 | Quality gate diperluas (Copilot + jalur tool-call; putuskan fail-open vs fail-closed bersama owner) | `responseQualityGate.ts`, `service.ts` | Gate menyala di kedua jalur |

**Analisis kompatibilitas Copilot (dari `COPILOT_INTENT_MAP`):**

- Pemetaan bersih: `HELP`, `TOTAL_QUERY`, `AUDIT` (-> skill `audit-rab`),
  `KURVA_S` (-> skill `periksa-kurva-s`), `DOCUMENT` (sebagian ->
  `summarize-document`), `CONVERSATIONAL`/`RAB_QUERY` (bukan skill).
- **Ambigu (butuh logika parameter saat cutover):** `UPDATE_ITEM` (satu kode
  untuk `UPDATE_ITEM_VOLUME`/`UPDATE_ITEM_PRICE`), `SEARCH_QUERY` (AHSP vs
  item, ditentukan kata kunci).
- **Diblokir kanal (Copilot jawab-saja):** `ADD_ITEM`, `DELETE_ITEM`,
  `UPDATE_ITEM`, `CREATE_RAB`, `DED_QUERY` — executor menolaknya dari kanal
  `copilot` (`CHANNEL_BLOCKED`); UI mengarahkan ke Chat AI.
- **Kesenjangan (tanpa pemilik):** `PROGRESS` — tidak ada ChatIntent maupun
  skill progres. Butuh keputusan: skill baru atau tetap dijawab model.
  BUKAN bagian migrasi ini.

---

## 4. Cutover Phase 3 — wiring executor

1. **Handler perintah deterministik:** daftarkan adapter tipis
   `skillId -> handler` yang membungkus handler `commands/` yang sudah ada
   (`handleProjectCommand`, dst.) dengan `ChatActionContext` dari view.
   Adapter tinggal di luar `skill-engine/` (ia mengimpor view context).
   `DELETE_PROJECT` TIDAK mendapat approval executor tambahan (approval
   hidup di konfirmasi 2 langkah handler).
2. **Handler Quick Action:** dialog multi-giliran dipindah ke klien DI ATAS
   `SkillExecutor` (state machine klien; server Express TIDAK dipakai sampai
   VPS hidup). Sesi `qa_local_*` diganti skill-run yang dapat dilanjutkan
   (`awaiting-approval` + `resumeRunId`).
3. **Adapter persistensi state:** implementasikan
   `SkillStatePersistenceAdapter` di atas `hardenedStorage` (pola
   `loadVersioned`/`saveVersioned`) dengan kunci berversi sendiri
   (JANGAN memakai kunci store percakapan / trail tool).
   `restore()` menandai run `running`/`pending` yang terputus reload sebagai
   `failed/INTERRUPTED_BY_RELOAD` secara jujur.
4. **Unifikasi kunci eksekusi** (Tahap 3.2, butuh edit berkas lama): kunci
   modal spreadsheet + `dedDocSessionHolder` disatukan ke namespace
   `(conversationId, skillRunId)` — direncanakan, belum dikerjakan.
5. **Tool-call skill:** handler yang butuh tool memanggil `executeTool`
   kanonis (8 lapis) dengan `skillId`+`traceId` diteruskan; JANGAN menambah
   jalur eksekusi tool kedua. Trail tool belum membawa `skillId`/`requestId`
   (K-15 sebagian) — penambahan medan trail adalah edit `toolRegistry.ts`
   (grant terpisah).
6. **Tulis tetap lewat layanan kanonis.** Skill TIDAK PERNAH menulis langsung
   ke database. Titik integrasi tulis yang sudah diidentifikasi:
   `bulkAddRabItems` / plan operations (RAB), `recalculateCostSummary`
   (rekalkulasi), layanan ekspor (file), `draftPersistence`/`draftRevision`
   (draft/revisi), layanan kredit kanonis (saldo/top-up nyata).

**Gerbang:** suite commands tetap hijau; Quick Action selesai end-to-end di
Preview tanpa server Express; skill mutasi terbukti serial per proyek.

---

## 5. Phase 4 — Integrasi DED / Document AI (RENCANA SAJA)

Tidak ada kode DED/DocAI yang disentuh Phase 2 W3. Rencana migrasi:

### 5.1 Batas isolasi FULL_AI (terverifikasi, bukan diasumsikan)

Sumber kebenaran: `ded-full-ai/dataSourcePolicy.ts` + predikat §4 B di
`ded-ai-estimate/dedMode.ts` + gerbang runtime `resolveFullAiItemPrice`
(`ded-full-ai/service.ts` — adapter kanonis TIDAK dipanggil sama sekali di
mode FULL_AI; harga `USER_INPUT` tidak pernah ditimpa di mode mana pun).

| Keluarga sumber | EZRAB_AI | FULL_AI |
|---|---|---|
| Katalog AHSP kanonis (D1/D3 + I1–I5 + J1–J5) | TERBUKA | **TERTUTUP** |
| Resolusi harga kanonis (D2) | TERBUKA | **TERTUTUP** |
| Referensi harga pasar terkurasi (D4/D6/D8) | TERBUKA | **TERTUTUP** |
| Tabel harga Jakarta + harga inline prompt (D10) | TERBUKA | **TERTUTUP** |
| Layanan kuantitas bersama (D5/D9) | TERBUKA | TERBUKA |
| Validasi satuan via registry | TERBUKA | TERBUKA |
| Pita kewajaran (D7, ambang angka) | TERBUKA | TERBUKA |
| Taksonomi WBS | TERBUKA | TERBUKA |
| Parser dokumen + gateway AI | TERBUKA | TERBUKA |

Validator `checkDedIsolation()` di `dedIsolation.ts` memin tabel ini untuk
definisi skill (`dedMode: 'FULL_AI'` + sumber tertutup = ditolak registrasi).
**Catatan hardening (bukan cacat aktif):** `ded-full-ai/service.ts` secara
statis MASIH mengimpor modul adapter kanonis — batasnya adalah gerbang
runtime, bukan batas modul. Pengerasan (impor dinamis adapter hanya di mode
EZRAB_AI) adalah pekerjaan DED terpisah, bukan Skill Engine.

### 5.2 Langkah migrasi DED/DocAI (sesudah Phase 1–3)

1. **Skill pintu masuk DED** (`run-ded-analysis` sudah terdaftar): memicu
   autorun DED pada sesi dokumen yang ada; TIDAK menyentuh parser, pass
   DED, evidence, resolusi harga, atau validasi kuantitas.
2. **Skill ringkasan dokumen** (`summarize-document` sudah terdaftar):
   memanggil orchestrator Document AI yang sudah ada (map-reduce per blok).
3. **Mode DED tetap dua** (Keputusan D): `EZRAB_AI` (katalog kanonis) dan
   `FULL_AI` (terisolasi). Skill TIDAK menambah mode ketiga; skill yang
   mendeklarasikan `dedMode` divalidasi terhadap §5.1.
4. **Konteks kanonis untuk DED/DocAI** (Tahap 2.3-analog): keempat jalur yang
   merakit prompt sendiri (Spreadsheet, DED Est, DED Full, DocAI) memakai
   `buildCanonicalContext` berprofil — pekerjaan DED/DocAI, bukan skill.
5. **Verifikasi isolasi:** suite DED yang ada + spy gerbang
   (`resolveFullAiItemPrice` tidak memanggil adapter di FULL_AI) + guard
   statis (skill FULL_AI tanpa sumber tertutup).

---

## 6. Dampak flip AUTH (8a03451) pada Skill Engine — keputusan W3

Flip `AUTH_ENABLED=false -> true` (Preview 1rcg7qi5n, grant owner)
mengaktifkan **identitas** (login Supabase nyata, `userId` riil) — BUKAN
otorisasi. Diverifikasi 2026-11-19:

| Aspek | Berubah? | Alasan |
|---|---|---|
| Model izin skill | **Tidak** | Tidak ada derivasi peran dari Supabase (tanpa lookup `user_metadata`/`app_metadata` peran di `src/auth/` maupun klien Supabase). Peran tetap dari demo `roleAccounts` (jalur `RoleLoginPanel` masih hidup) atau tidak ada. K-07/K-16 tetap terbuka. Executor tetap: taksonomi server + fail-closed peran demo + jembatan tanpa-peran untuk skill terbuka. |
| Enforcement approval | **Tidak (mekanisme); Ya (atribusi)** | Approval tetap client-side oleh `user`. `SkillApproval` kini membawa `approvedByUserId` opsional (id Supabase riil bila ada). |
| Atribusi pemakaian | **Ya** | `SkillUsageRecord` kini membawa `userId` (riil pasca-flip, null di sesi demo/failsafe) — memungkinkan observabilitas per pengguna tanpa ledger kedua. |
| Isolasi proyek | **Tidak** | Gateway tetap tidak memverifikasi `projectId` (kepemilikan server-side belum ada); isolasi tetap fail-closed client-side. Flip adalah prasyarat Tahap 4.2, bukan implementasinya. |
| Jembatan tanpa-peran | **Transisional** | Tetap ada untuk sesi demo/failsafe (`AUTH_MODE='failsafe-demo'` + `RoleLoginPanel`). Di sesi login nyata, pemanggil WAJIB mengisi `callerRole` begitu pemetaan K-16 diputuskan; penghapusan jembatan adalah keputusan koordinator pasca-K-16. |

Guard A11 diperbarui untuk memin keadaan baru (lihat §8).

---

## 7. Phase 5 — Pembersihan legacy (RENCANA SAJA, Keputusan C + D)

TIDAK ADA berkas yang dihapus/dipindah Phase 2 W3. Inventaris di bawah
diverifikasi 2026-11-19 (HEAD 77924d5).

### 7.1 Inventaris kode AI mati/dorman

| Pohon | Baris | Importer produksi | Importer tes | Status |
|---|---|---|---|---|
| `src/services/ai/{core,orchestration,tools,actions}/` | ±4.408 | 0 | `ezrabCoreAiEvaluation`, `phaseC_copilotOrchestration` | MATI |
| `src/services/aiProviderEngine.ts` (+ `MockAiProvider`) | 2.186 | 0 (hanya pohon mati) | 8 suite (`aiAcceptance`, `dokumenAiModule`, `phase7_2ReleaseGate`, `phase9_1EvidenceAi`, `phaseC_copilotOrchestration`, `projectFinance`, `aiModelMaskingAndChatboxFallback`, `laborEquipmentSpreadsheetAi`) | MATI |
| `src/services/aiContextService.ts` (runtime) | 339 | 0 runtime (hanya impor TIPE `FullProjectAIContext` dari `aiEvidenceService.ts`) | 5 suite | MATI (runtime) |
| `src/services/aiApiClient.ts` (runtime) | 523 | 0 runtime (hanya impor TIPE; satu impor posisi-nilai di Chatbox yang hanya dipakai sebagai tipe) | 5 suite | MATI (runtime) |
| `src/components/copilot/EstimatingCopilotPanel.tsx` | — | 0 (tanpa situs mount JSX) | 1 suite (`aiResponseTiming`) | MATI |
| `server/` (Express) | 52.162 / 199 berkas | 0 (dorman; `api/` tidak mengimpor; tanpa npm script; EC2 tanpa Docker) | `server/test/*` | DORMAN (bukan mati — backend VPS yang direncanakan) |

Catatan: `src/services/ai/` (pohon mati) TIDAK SAMA dengan
`src/services/ai/conversation/unifiedConversationStore.ts` dan
`src/services/ai/quickActionToken.ts` yang HIDUP — penghapusan harus
per-subdirektori (`core`, `orchestration`, `tools`, `actions` saja),
bukan per-direktori `ai/`.

### 7.2 Rencana arsip/penghapusan (menunggu keputusan owner G9)

1. **Keputusan owner dulu:** G9 (hapus/arsipkan pohon mati) + nasib server
   Express (hidupkan di VPS / arsipkan resmi). Tanpa keputusan tertulis,
   TIDAK ADA aksi.
2. **Arsip dengan riwayat Git utuh:** `git mv` ke `src/_archive/ai-legacy-<tanggal>/`
   (bukan hapus + tulis ulang) agar `git log --follow` tetap bekerja.
   Server Express TIDAK diarsipkan ke `_archive` (ia backend VPS yang
   direncanakan) — keputusannya terpisah.
3. **Urutan penghapusan (bila owner memilih hapus, bukan arsip):**
   `EstimatingCopilotPanel` dulu (0 importer, 1 tes) ->
   `aiContextService`/`aiApiClient` runtime (impor tipe diganti definisi
   tipe lokal) -> `aiProviderEngine` -> pohon `ai/{core,orchestration,
   tools,actions}`. Satu kelompok per commit, tsc + suite terkait hijau
   per kelompok.
4. **Ketergantungan tes:** setiap suite yang mengimpor pohon mati (kolom
   "Importer tes" di atas) harus diperbarui/dihapus DI COMMIT YANG SAMA
   dengan penghapusan kodenya — tidak boleh ada suite yang mengimpor
   berkas yang tidak ada.
5. **Impor dinamis & referensi rute:** sebelum hapus, grep `import(` dinamis
   + referensi string path (`routes.ts`, `navRegistry`, `aiNavigation`)
   untuk tiap modul — inventaris ini mencatat impor statis saja.
6. **Guard diperbarui sadar:** C1–C3 memin keadaan mati; sesudah
   penghapusan, perbarui guard di commit yang sama (bukan dihapus diam-diam).

### 7.3 Konsolidasi MagicAiSuperView (Keputusan D)

**Keadaan:** `MagicAiSuperView` (97 baris, `src/components/magic-ai/`)
dirutekan `WorkspaceView.tsx:703` untuk menu `ai-assistant`/`magic-ai`/
`ded-rab`; membungkus `DedAnalysisDashboard` (pipeline vision ded-rab-v3)
dengan banner "Permukaan DED warisan" + tombol ke `ded-ai` (kanonis).
Komentar `WorkspaceView.tsx:1070-1071` mengakui dua permukaan DED belum
digabung. Target: PERSIS dua mode DED (EZRAB AI MODE, FULL AI MODE) di
DED AI Estimate — MagicAiSuperView TIDAK menjadi mesin ketiga.

**Yang harus dipertahankan (kontrak kompatibilitas):**

- Rute/menu `ai-assistant`, `magic-ai`, `ded-rab` tetap merender sesuatu
  (redirect ke `ded-ai` dengan mode yang sesuai, atau SuperView sampai
  pengganti terverifikasi) — tanpa rute mati.
- Kemampuan unik `DedAnalysisDashboard`: pembacaan gambar halaman,
  sintesis lintas halaman, penampil dokumen — bila belum ada di DED AI
  Estimate, konsolidasi MENUNGGU (kemampuan tidak boleh hilang diam-diam).
- Handoff commit: `onCommitSuccess(sections, grandTotal, targetProjectId)`
  -> `onSelectProject(pid)` + `onOpenRabDetail(pid)` (atau navigasi
  `rab-spreadsheet`) — perilaku pasca-commit harus identik.
- Handoff masuk: `onOpenMagicAi(mode, prompt)` (`WorkspaceView.tsx:1066`)
  + event `ezrab:ai-entry` / `requestAiEntry` (lihat `aiNavigation.ts`).

**Kriteria penghapusan (SEMUA harus terbukti sebelum hapus):**

1. Navigasi: semua pintu masuk lama sampai ke DED AI Estimate.
2. Persistensi sesi: sesi DED bertahan melewati navigasi (holder kanonis).
3. Upload PDF: alur upload + analisis jalan dari permukaan baru.
4. Handoff hasil: commit -> RAB spreadsheet identik dengan perilaku lama.
5. Banner warisan + tombol sudah tidak diperlukan (permukaan baru adalah
   satu-satunya permukaan).
6. Suite DED + guard (bila ada pin rute) hijau.

**Urutan:** (a) audit kemampuan DedAnalysisDashboard vs DED AI Estimate
(gap analysis); (b) tutup gap di DED AI Estimate; (c) redirect rute lama
ke `ded-ai` (SuperView tetap ada sebagai fallback); (d) verifikasi
kriteria 1–6 di Preview; (e) hapus SuperView + dashboard warisan +
rute lama dalam satu commit dengan grant owner.

---

## 8. Pemeliharaan guard

`src/test/skillEngineArchitectureGuard.mjs` memin keadaan arsitektur.
Perubahan Phase 2 W3 (dengan alasan, bukan sekadar flip ekspektasi):

- **A9** (lapisan skill): dulu "belum ada lapisan skill" (0 hit) — kini
  "lapisan skill ada di PERSIS satu tempat": semua berkas produksi yang
  menyebut `SkillDefinition`/`skillRegistry`/`registerSkill` harus di bawah
  `src/ai-tools/skill-engine/`. Lapisan skill kedua di tempat lain = gagal.
- **A11** (gerbang identitas): dulu "AUTH_ENABLED masih false" — kini
  "AUTH_ENABLED ter-flip true + matriks mode auth ada (`real-login` /
  `failsafe-demo`)". Lihat §6 untuk alasan arsitektur.
- **A13** (baru): modul entry skill-engine ada (registry, executor, router,
  definisi, konteks, state, metadata, isolasi).
- **A14** (baru): kontrak identitas pasca-flip — `ExecutionContext`
  membawa `userId`, executor gagal tertutup pada peran tak terpeta
  (`ROLE_NOT_MAPPED`), metadata pemakaian mengatribusikan `userId`.

Bila migrasi menutup duplikasi yang dipin guard (D1–D7), perbarui guard
SECARA SADAR di commit yang sama.

---

## 9. Yang masih butuh owner / koordinator

| # | Item | Pemilik keputusan |
|---|---|---|
| 1 | Pemetaan peran K-16 (demo `qs/estimator/kontraktor/konsultan/team` <-> server `SUPER_ADMIN/ESTIMATOR/DIREKSI/CLIENT/EDITOR`) | Owner |
| 2 | G9: arsip/hapus pohon mati + nasib server Express | Owner |
| 3 | Konsolidasi MagicAiSuperView (Keputusan D) + gap DedAnalysisDashboard | Owner |
| 4 | §20 #3 (wewenang aktivasi revisi per peran), #4 (TTL/retensi draft), #5 (batas file/halaman DED formal), #8 (approval ekspor terpisah) | Owner |
| 5 | Skill `PROGRESS` (kesenjangan Copilot): skill baru atau tetap jawaban model | Owner/koordinator |
| 6 | Perbaikan kontrak: 5 `requiredParameters` tanpa skema (§1.2) | Koordinator (grant edit kontrak) |
| 7 | Kriteria penghapusan MagicAiSuperView (§7.3) terverifikasi di Preview | Koordinator |
| 8 | Grant cutover per tahap (§2–§5) | Owner (satu grant = satu aksi) |
