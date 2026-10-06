# EZRAB AI CORE — MASTER TEMPLATE ARCHITECTURE

## 1. Arsitektur Umum & Filosofi Desain

Sistem **Master Building Templates** EZRAB AI Core dirancang dengan prinsip modularitas, type-safety ketat, versioning, dan pemisahan tegas antara intensi pengguna, model geometri parametrik, asumsi teknis konstruksi, dan database harga satuan resmi PUPR 2026.

```
┌─────────────────────────────────────────────────────────┐
│                    User Natural Intent                  │
│       "Buat RAB Rumah Tipe 36 satu lantai di Jabar"     │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                 AI Orchestrator Bridge                  │
│     (Intent Classifier -> Suggested Template & Params)  │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│              Master Building Template Schema             │
│    - Parameters (Ranges, Types, Units, Bounds)          │
│    - Technical Assumptions (SNI/PUPR, Editable)          │
│    - Space Breakdown (Length, Width, Wet Areas)         │
│    - Structural & Material Systems                      │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│              Parametric Volume Engine (Deterministic)   │
│    - Geometry & Opening Deductions                      │
│    - Trigonometric Cosine Factors (Roof Pitch)          │
│    - Exact Calculation Trace & Substituted Values       │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│              Official AHSP & Regional Multiplier        │
│    - Cipta Karya, Bina Marga, SDA 2026 Registry         │
│    - Provincial Cost Indices (38 Provinces)             │
│    - Overhead (5%), Profit (5%), PPN 11%                │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│             Output: Spreadsheet Table / RabItem[]       │
│        (Multi-Tenant Isolated, Audit Trail Persisted)   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Struktur Data Schema (`types.ts`)

Seluruh template mengimplementasikan interface `MasterBuildingTemplate`:

- **id**: ID unik stabil (contoh: `template-house-type-36-single-floor`)
- **code**: Kode WBS template (contoh: `HOUSE-T36-1FL`)
- **category**: `residential` | `commercial` | `road` | `drainage` | `villa` | `infrastructure`
- **version**: Versi skema template (`2026.1.0`)
- **status**: `draft` | `reviewed` | `verified` | `deprecated`
- **parameters**: Record dictionary `TemplateParameter` dengan tipe `number`, `integer`, `boolean`, `enum`, `area`, `length`, `height`, `count`.
- **assumptions**: Asumsi teknis eksplisit `TemplateAssumption` dengan sumber SNI/PUPR/Empirical Estimator.
- **spaces**: Denah ruang default `TemplateSpace[]` dengan dimensi dan flag wet area.
- **structuralSystem**: Spesifikasi struktur (pondasi, kolom, sloof, ring balok, rangka atap).
- **materialSystem**: Spesifikasi material finishing (dinding hebel/bata, lantai keramik/granit, plafon gypsum).
- **workItems**: Rangkaian `TemplateWorkItem[]` dengan `quantityRule` deterministik dan kandidat AHSP resmi.

---

## 3. Template Prioritas yang Diimplementasikan

| No | Kode Template | Nama Template | Kategori | Work Items | Status |
|---|---|---|---|---|---|
| 1 | `HOUSE-T36-1FL` | Rumah Tinggal Sederhana Tipe 36 (1 Lantai) | Residential | 21 Item | `verified` |
| 2 | `HOUSE-T45-1FL` | Rumah Tinggal Menengah Tipe 45 (1 Lantai) | Residential | 21 Item | `reviewed` |
| 3 | `HOUSE-T70-1FL` | Rumah Tinggal Tipe 70 (1 Lantai) | Residential | 21 Item | `reviewed` |
| 4 | `HOUSE-T36-2FL` | Rumah Tinggal Kompak Tipe 36/60 (2 Lantai) | Residential | 21 Item | `reviewed` |
| 5 | `RUKO-2FL` | Ruko Komersial 2 Lantai (4.5x12m) | Commercial | 21 Item | `reviewed` |
| 6 | `INFRA-ROAD-CONCRETE` | Infrastruktur Jalan Beton (Rigid Pavement Bina Marga) | Road | 5 Item | `verified` |
| 7 | `DRAIN-UDITCH` | Saluran Drainase Precast U-Ditch PUPR SDA | Drainage | 7 Item | `reviewed` |

---

## 4. Cara Menambah Template Baru

1. Buat file baru di `src/data/buildingTemplates/templates/[templateName]Template.ts`.
2. Definisikan `DEFAULT_PARAMETERS`, `DEFAULT_ASSUMPTIONS`, `DEFAULT_SPACES`, dan `WORK_ITEMS`.
3. Terapkan `quantityRule` deterministik pada setiap work item dengan formula trace.
4. Daftarkan template ke dalam `src/data/buildingTemplates/masterTemplateRegistry.ts` menggunakan `registerTemplate()`.
5. Tambahkan unit test pada `server/test/parametricVolumeEngine.test.ts`.
