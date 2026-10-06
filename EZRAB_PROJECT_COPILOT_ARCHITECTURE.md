# EZRAB — ARCHITECTURE SPECIFICATION: PROJECT COPILOT (PHASE B)

**Dokumen**: `EZRAB_PROJECT_COPILOT_ARCHITECTURE.md`  
**Status**: APPROVED & ACTIVE (Architecture Foundation)  
**Versi**: 2.0.0  
**Tanggal**: 2026-09-26  
**Prinsip Utama**: Architecture First — REUSE > REFACTOR > CREATE — NO Destructive Refactor  

---

## 1. CURRENT ARCHITECTURE (STATUS QUO)

Berdasarkan audit menyeluruh pada `EZRAB_DOCUMENT_AI_AUDIT.md`, sistem existing memiliki fondasi Document Engine yang kuat namun lapisan orkestrasi AI terfragmentasi:

```text
[Page/Route]  /app/magic-ai?mode=dokumen-ai     /app/tender-documents
                    │                                  │
[Presentation]  MagicAiSuperView (218 KB)          TenderDocumentsView (48 KB)
                EzrabCoAssistantChatbox            DocumentWorkspace (88 KB)
                EzrabAiAssistantFullView (Dead)
                    │                                  │
[Context Layer] ├─ buildFullAIContext (aiContextService)
                ├─ buildReadOnlyProjectContext (aiProjectContext)
                └─ buildAiDocumentContext (aiDocumentIntelligence)
                    │
[Engines]       ├─ aiProviderEngine (Multi-provider + Heuristic)
                └─ Document Engine (Registry, Completeness, Template, Repository, Exporters)
```

### Masalah Arsitektural Utama:
1. **Context Fragmentation**: Terdapat 3 builder konteks berbeda yang membaca subset data proyek yang berlainan tanpa sinkronisasi domain status.
2. **Missing Action Boundary**: Chatbot langsung membalas teks panduan tanpa menghasilkan actionable proposals yang terikat pada DocumentRecord.
3. **No Central Source-of-Truth Orchestrator**: AI berisiko membaca data parsial atau melakukan estimasi di luar batasan proyek aktif.

---

## 2. TARGET ARCHITECTURE: EZRAB PROJECT COPILOT

Arsitektur target menyatukan seluruh kecerdasan proyek menjadi satu **Intelligence Layer (Project Copilot)** di atas **System of Record (Document Engine & Project Modules)**:

```text
                        EZRAB AI
                     PROJECT COPILOT
                 (Unified Intelligence)
                           │
                           ▼
               UNIFIED PROJECT CONTEXT
         (Project + DED/QTO + RAB + BOQ + Schedule +
          Kurva-S + Personnel + Equipment +
          JSA + RKK + AHSP + Document Records)
                           │
                           ▼
                    AI ACTION ENGINE
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   [INFORMATION]     [SUGGESTION]        [ACTION]
   Read-only Stats   Rekomendasi        Membuat/Mengubah
   (No Approval)    Data Kurang         (Memerlukan Approval)
                           │                     │
                           │                     ▼
                           │             PREVIEW & APPROVAL
                           │                     │
                           │                     ▼
                           └────────► DOCUMENT ENGINE
                                  (System of Record)
                                         │
                         ┌───────────────┼───────────────┐
                         ▼               ▼               ▼
                      Registry       Templates        Records
                         │               │               │
                         └───────────────┼───────────────┘
                                         ▼
                                  DOKUMEN PROYEK
                                    (Workspace)
                                         │
                                         ▼
                                   EXPORT ENGINE
                              (PDF / DOCX / XLSX / ZIP)
```

---

## 3. CONTEXT SOURCES

Setiap domain dalam proyek memiliki modul dan lokasi sumber kebenaran resmi (*Source of Truth*):

| Domain | Sumber Kebenaran Resmi (Source of Truth) | Lokasi Kode / Modul | Mode Akses AI |
| :--- | :--- | :--- | :--- |
| **Project Master** | Project Module & Metadata | `src/context/ProjectContext.tsx` | READ-ONLY |
| **DED / QTO** | QTO Engine & Work Items | `src/components/qto/`, `src/engine/` | READ-ONLY |
| **BOQ** | BOQ Table / RAB Module | `src/types/index.ts`, `ProjectContext` | READ-ONLY |
| **RAB** | RAB Spreadsheet & Calculation Engine | `src/components/rab/`, `ProjectContext` | READ-ONLY |
| **AHSP** | AHSP Standard Library & Project Price Bridge | `src/ded-rab-v2/ahsp/`, `project-data` | READ-ONLY |
| **Schedule** | Schedule Module Tasks | `ProjectContext` (`projectScheduleTasks`) | READ-ONLY |
| **Kurva-S** | S-Curve Engine & Tracking Points | `ProjectContext` (`projectKurvaSData`) | READ-ONLY |
| **Personnel** | Project Data Repository (`personnel`) | `src/project-data/repository.ts` | READ-ONLY |
| **Equipment** | Project Data Repository (`equipment`) | `src/project-data/repository.ts` | READ-ONLY |
| **JSA** | Project Data Repository (`jsa`) | `src/project-data/repository.ts` | READ-ONLY |
| **RKK** | Project Data Repository (`rkk`) | `src/project-data/repository.ts` | READ-ONLY |
| **Documents** | LocalDocumentRepository & Registry | `src/document-engine/` | READ & DRAFT PROPOSAL |

---

## 4. UNIFIED PROJECT CONTEXT CONTRACT

Didefinisikan dalam [`src/services/unifiedProjectContext.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/services/unifiedProjectContext.ts):

```typescript
export interface UnifiedProjectContext {
  projectId: string;
  domains: Record<ContextDomainKey, DomainStatus>;

  project: ProjectContextData;
  ded?: DedContextData;
  boq?: BoqContextData;
  rab?: RabContextData;
  ahsp?: AhspContextData;
  schedule?: ScheduleContextData;
  kurvaS?: KurvaSContextData;
  personnel?: PersonnelContextData;
  equipment?: EquipmentContextData;
  jsa?: JsaContextData;
  rkk?: RkkContextData;
  documents?: DocumentContextData;

  metadata: {
    generatedAt: string;
    activeProjectId: string;
    requestedDomains: ContextDomainKey[];
    availableSources: string[];
    missingSources: string[];
    isReadOnly: true;
    contractVersion: '2.0';
  };
}
```

### Domain Status Lifecycle:
- `AVAILABLE`: Data tersedia dan telah diproyeksikan dengan valid.
- `EMPTY`: Modul diminta, namun belum ada rekaman data (misal: array 0 item).
- `MISSING`: Data proyek induk tidak ditemukan.
- `ERROR`: Terjadi kendala saat membaca repositori data.
- `NOT_REQUESTED`: Domain tidak diminta pada query saat ini (*lazy evaluation*).

---

## 5. CONTEXT ADAPTERS

Context Builder tidak mengakses database mentah secara acak, melainkan menggunakan adapter teruji yang memanfaatkan fungsi mapping kanonikal existing:

1. **`adaptProjectData`**: Memvalidasi `project.id === targetProjectId`, mengekstrak metadata nama, pemilik, durasi, dan total nilai penawaran.
2. **`adaptRabData`**: Menghitung grand total matematis, pengelompokan kategori pekerjaan, 5 item berbiaya tertinggi, dan deteksi anomali konsentrasi biaya (> 25%).
3. **`adaptBoqData`**: Mengekstrak daftar item pekerjaan, volume, dan satuan tanpa harga satuan komersial (siap tender teknis).
4. **`adaptDedData`**: Memetakan QTO items dan work items yang dihasilkan kalkulator volume teknis.
5. **`adaptScheduleData`**: Memetakan durasi total minggu, jumlah item selesai, item aktif, dan item pending.
6. **`adaptKurvaSData`**: Menghitung deviasi rencana vs realisasi kumulatif serta label status keterlambatan/percepatan.
7. **`adaptAhspData`**: Menghubungkan analisa harga satuan pekerjaan yang aktif untuk proyek bersangkutan.
8. **`adaptPersonnelData` & `adaptEquipmentData`**: Membaca repositori personil manajerial dan daftar peralatan proyek.
9. **`adaptJsaData` & `adaptRkkData`**: Membaca mitigasi risiko K3 dan dokumen keselamatan konstruksi.
10. **`adaptDocumentsData`**: Membaca 19 definisi dokumen resmi dari `DOCUMENT_REGISTRY`, status pembuatan (`DRAFT`, `COMPLETE`, `EXPORTED`), dan persentase kelengkapan field.

---

## 6. SOURCE OF TRUTH PRINCIPLE

> **ATURAN MUTLAK**: AI TIDAK BOLEH MENJADI SOURCE OF TRUTH.
> AI adalah Intelligence Layer. Data proyek, nilai anggaran, koefisien, dan record dokumen tetap dimiliki secara eksklusif oleh modul masing-masing.

- AI hanya menghasilkan **proyeksi data (Read Model)**.
- Setiap usulan perubahan (*Action Proposal*) harus divalidasi oleh pengguna sebelum dituliskan ke repositori resmi.

---

## 7. AI ACTION BOUNDARY & SAFETY CONTRACT

AI mengklasifikasikan setiap keluaran respons ke dalam 3 level yang tegas:

```typescript
export type AIActionType =
  | 'INFORMATION'  // Read-only insight, statistics, explanations (NO mutation, NO approval)
  | 'SUGGESTION'   // Advisory, missing fields, audit recommendations (NO mutation, NO approval)
  | 'ACTION';      // Draft creation, data mapping, revision creation (MUTATION, APPROVAL MANDATORY)
```

### Safety Rules:
1. **`INFORMATION`**:
   - `requiresApproval = false`
   - `isMutation = false`
   - Contoh: "Berapa total nilai RAB saat ini?" → Menjawab langsung angka terverifikasi.
2. **`SUGGESTION`**:
   - `requiresApproval = false`
   - `isMutation = false`
   - Contoh: "Peringatan: NPWP perusahaan kontraktor belum diisi."
3. **`ACTION`**:
   - `requiresApproval = true`
   - `isMutation = true`
   - `status = 'PENDING'` secara default.
   - Contoh: "Buatkan draft Surat Penawaran dan Metode Pelaksanaan."
   - **Gating**: Fungsi `validateActionSafety(proposal)` secara ketat menolak eksekusi mutasi jika `status !== 'APPROVED'`.

---

## 8. DOCUMENT ENGINE BOUNDARY (SYSTEM OF RECORD)

Document Engine dipertahankan 100% tanpa perubahan breaking:
- **`DocumentRecord`**: Entitas penyimpanan utama dokumen di `localStorage` per proyek (`ezrab_documents_<projectId>`).
- **`DOCUMENT_REGISTRY`**: Daftar 19 dokumen standar industri konstruksi Indonesia.
- **`LocalDocumentRepository`**: Single interface untuk mutasi dokumen.
- **`exportService` & `packageExporter`**: Gerbang final ekspor ke PDF, DOCX, XLSX, dan ZIP terkompresi.

AI tidak boleh menulis langsung ke storage dengan key acak; AI hanya boleh membuat atau memperbarui dokumen melalui `DocumentRepository` setelah persetujuan pengguna (*User Approval Gate*).

---

## 9. STRICT PROJECT ISOLATION (FAIL-CLOSED)

Isolasi proyek adalah syarat wajib:
1. Semua fungsi builder mewajibkan `projectId`. Jika `projectId` kosong atau hanya whitespace, sistem melempar `ProjectIsolationError` (*fail-closed*).
2. Jika objek proyek yang dikirimkan memiliki `project.id !== projectId`, sistem langsung menghentikan eksekusi (*abort*).
3. Data Dokumen, Personil, Alat, JSA, dan RKK dibatasi oleh namespace unik:
   - Dokumen: `ezrab_documents_${projectId}`
   - Entity: `ezrab:project:${projectId}:${domain}`

---

## 10. MIGRATION & COEXISTENCE STRATEGY

Untuk menjamin **ZERO REGRESSION**, strategi transisi bertahap diterapkan:
1. **Fase Coexistence**:
   - `buildUnifiedProjectContext` bertindak sebagai master provider baru.
   - Helper lama (`buildFullAIContext`, `buildReadOnlyProjectContext`, `buildAiDocumentContext`) dipertahankan agar tidak ada test atau komponen existing yang rusak.
2. **Fase Integrasi**:
   - Floating Copilot (`coAssistantService`) dan Super View (`MagicAiSuperView`) diarahkan untuk membaca `UnifiedProjectContext`.
3. **Fase Pembersihan (Phase G)**:
   - Menghapus wrapper usang hanya setelah 100% consumer menggunakan arsitektur baru.

---

## 11. DEPENDENCY GRAPH

```text
Project / RAB / BOQ / Schedule / Resources / Documents
                    │
                    ▼
          Context Adapters (Domain Specific)
                    │
                    ▼
      UnifiedProjectContextBuilder (src/services/unifiedProjectContext.ts)
                    │
                    ▼
        UnifiedProjectContext (Project-Scoped, Lazy, Read-Only)
                    │
                    ▼
           EZRAB AI / Project Copilot
                    │
                    ▼
           AI Action Engine (src/services/aiActionEngine.ts - Phase C)
         ┌──────────┴──────────┐
         ▼                     ▼
   INFORMATION /          ACTION PROPOSAL (requiresApproval: true)
   SUGGESTION                  │
                               ▼
                       User Confirmation Gate
                               │
                               ▼
                        Document Engine
                               │
                               ▼
                        DocumentRecord (Persisted)
                               │
                               ▼
                          Export Engine
```

---

## 12. RISK REGISTER & MITIGASI

| Risiko | Level | Dampak | Mitigasi |
| :--- | :---: | :--- | :--- |
| **Cross-Project Data Leak** | KRITIS | Data Proyek A tampil pada dokumen Proyek B | Strict Fail-Closed check pada `buildUnifiedProjectContext` & repositori terisolasi. |
| **Unapproved Source Mutation** | KRITIS | AI mengubah anggaran/RAB tanpa disadari pengguna | Aturan keamanan `validateActionSafety`: semua proposal aksi mutasi wajib diapprove. |
| **Performance Degradation** | SEDANG | Pengambilan data lambat jika seluruh 11 domain di-load bersamaan | Prinsip *Lazy Loading*: Hanya domain yang tercantum pada `requestedDomains` yang diproses. |
| **Regression pada Test Existing** | TINGGI | 18 test suite existing gagal | Uji verifikasi otomatis dijalankan sebelum dan sesudah setiap penambahan kode. |

---

## 13. PHASE C IMPLEMENTATION PLAN

Dengan rampungnya Phase B, fondasi Unified Context dan Action Contract telah siap untuk dihubungkan pada **PHASE C**:
1. **Regex Precedence Fix**: Memperbaiki pengecekan `p.includes('pekerja')` di `aiProviderEngine.ts` sehingga query teknis "pekerjaan" tidak disalahartikan sebagai upah tenaga kerja.
2. **AI Action Engine Service**: Mengimplementasikan `aiActionEngine.ts` untuk mengeksekusi proposal aksi yang disetujui pengguna (Create Document, Batch Create Package, Update User Fields).
3. **Floating Copilot Bridge**: Mengintegrasikan `coAssistantService` ke AI Action Engine agar floating widget dapat memicu pembuatan dokumen proyek.
4. **Validasi Test Dokumen AI**: Memastikan `dokumenAiModule.test.ts` mencapai status **14 PASSED / 0 FAILED (100%)**.
