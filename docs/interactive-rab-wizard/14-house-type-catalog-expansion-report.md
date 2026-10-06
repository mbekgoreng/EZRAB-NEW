# Laporan Pengembangan: Ekspansi House Type Selector Hingga Type 300
**Kode Dokumen**: `DOCS-WIZARD-HOUSE-EXPANSION-014`  
**Status**: `VERIFIED & COMPLETE`  
**Tanggal**: 15 September 2026  
**Fitur**: Interactive Automatic RAB Wizard — House Type Catalog Expansion up to Type 300  

---

## 1. Ringkasan Eksekutif

Sistem Interactive Automatic RAB Wizard pada CoAssistant EZRAB telah diekspansi untuk mendukung katalog tipe rumah yang komprehensif mulai dari **Type 36 hingga Type 300** serta **Rumah Custom**. Sebelumnya, wizard hanya menampilkan 4 pilihan dasar (Type 36, Type 45, Type 70, Type 36 2 Lantai).

Dalam implementasi ini, prinsip integritas teknis dipertahankan secara ketat:
- **Zero Fake Calculations**: Tipe yang belum memiliki modul perhitungan dan formula AHSP terverifikasi (Type 54 hingga Type 300) diklasifikasikan dengan status `COMING_SOON`, `disabled: true`, dan `nextStep: "TEMPLATE_NOT_READY"`. Sistem tidak mengarang formula, harga material, maupun volume AHSP fiktif.
- **Parametric/Custom Support**: User dapat melakukan kalkulasi estimasi parametrik untuk tipe manapun melalui opsi **Rumah Custom**.
- **Canonical Backend Source of Truth**: Semua data tipe rumah dikelola dalam satu sumber canonical [`src/data/houseTypeCatalog.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/data/houseTypeCatalog.ts) dan disajikan ke frontend via `TemplateResolver.getHouseTemplateChoices()`.
- **Search & Category UI Filter**: Frontend dilengkapi dengan kotak pencarian instan (*"Cari tipe rumah, misalnya Type 120"*), tab kategori (*Kecil, Menengah, Besar, Custom*), dan filter lantai.

---

## 2. Daftar Katalog Tipe Rumah (Source of Truth)

Katalog diurutkan secara **numerik strictly ascending** berdasarkan luas bangunan:

| Display Order | ID / Value | Nama Tipe | Luas Bangunan (m²) | Pilihan Lantai | Status Kesiapan | Template ID Terdaftar | Modul Kalkulasi | Kategori UI |
|:---|:---|:---|:---:|:---:|:---:|:---|:---|:---|
| **36** | `HOUSE-T36-1FL` | Rumah Type 36 | 36 m² | 1, 2 | `READY` | `HOUSE-T36-1FL` | `CalculationService` | KECIL (T36–70) |
| **36.5** | `HOUSE-T36-2FL` | Rumah Type 36 (2 Lantai) | 36 m² (72 m²) | 2 | `READY` | `HOUSE-T36-2FL` | `HOUSE_T36_2FL_ENGINE` | KECIL (T36–70) |
| **45** | `HOUSE-T45-1FL` | Rumah Type 45 | 45 m² | 1, 2 | `READY` | `HOUSE-T45-1FL` | `HOUSE_T45_ENGINE` | KECIL (T36–70) |
| **54** | `HOUSE-T54` | Rumah Type 54 | 54 m² | 1, 2 | `COMING_SOON` | `null` | *(Belum Tersedia)* | KECIL (T36–70) |
| **60** | `HOUSE-T60` | Rumah Type 60 | 60 m² | 1, 2 | `COMING_SOON` | `null` | *(Belum Tersedia)* | KECIL (T36–70) |
| **70** | `HOUSE-T70-1FL` | Rumah Type 70 | 70 m² | 1, 2 | `READY` | `HOUSE-T70-1FL` | `HOUSE_T70_ENGINE` | KECIL (T36–70) |
| **90** | `HOUSE-T90` | Rumah Type 90 | 90 m² | 1, 2 | `COMING_SOON` | `null` | *(Belum Tersedia)* | MENENGAH (T90–150) |
| **100** | `HOUSE-T100` | Rumah Type 100 | 100 m² | 1, 2 | `COMING_SOON` | `null` | *(Belum Tersedia)* | MENENGAH (T90–150) |
| **120** | `HOUSE-T120` | Rumah Type 120 | 120 m² | 1, 2 | `COMING_SOON` | `null` | *(Belum Tersedia)* | MENENGAH (T90–150) |
| **150** | `HOUSE-T150` | Rumah Type 150 | 150 m² | 1, 2 | `COMING_SOON` | `null` | *(Belum Tersedia)* | MENENGAH (T90–150) |
| **180** | `HOUSE-T180` | Rumah Type 180 | 180 m² | 1, 2, 3 | `COMING_SOON` | `null` | *(Belum Tersedia)* | BESAR (T180–300) |
| **200** | `HOUSE-T200` | Rumah Type 200 | 200 m² | 1, 2, 3 | `COMING_SOON` | `null` | *(Belum Tersedia)* | BESAR (T180–300) |
| **250** | `HOUSE-T250` | Rumah Type 250 | 250 m² | 1, 2, 3 | `COMING_SOON` | `null` | *(Belum Tersedia)* | BESAR (T180–300) |
| **300** | `HOUSE-T300` | Rumah Type 300 | 300 m² | 1, 2, 3 | `COMING_SOON` | `null` | *(Belum Tersedia)* | BESAR (T180–300) |
| **9999** | `HOUSE-CUSTOM` | Rumah Custom | Custom | 1, 2, 3, 4 | `READY` | `CUSTOM_HOUSE` | `CUSTOM_PARAMETRIC_ENGINE` | CUSTOM |

---

## 3. Perubahan Backend & State Machine

1. **Canonical Catalog**:
   - File: [`src/data/houseTypeCatalog.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/data/houseTypeCatalog.ts)
   - Menyimpan seluruh definisi atribut: `id`, `houseTypeId`, `label`, `area`, `floorOptions`, `defaultFloorCount`, `description`, `templateId`, `readinessStatus`, `calculationModule`, `supportedParameters`, `availability`, `disabled`, `disabledReason`, `categoryGroup`, `badge`, `displayOrder`, `nextStep`, `value`.
   - Menyediakan fungsi filter dan natural language extractor `HouseTypeCatalog.findFromQuery()`.

2. **Template Resolver**:
   - File: [`server/services/templateResolver.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/server/services/templateResolver.ts)
   - Method `TemplateResolver.getHouseTemplateChoices()` kini memetakan secara langsung dari `HouseTypeCatalog.getAll()`.
   - Interface `AssistantChoice` diperkaya dengan metadata: `area`, `floorOptions`, `defaultFloorCount`, `readinessStatus`, `categoryGroup`, `displayOrder`, `availability`, `disabledReason`.

3. **Wizard State Machine**:
   - File: [`server/services/wizardStateMachine.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/server/services/wizardStateMachine.ts)
   - Step baru: `TEMPLATE_NOT_READY` ditambahkan ke `WizardStep`.
   - `startSession`:
     - Mengenali query natural language seperti `"RAB rumah type 120"`, `"rumah 2 lantai type 200"`, `"buatkan RAB rumah type 300"`.
     - Jika tipe yang dipilih masih `disabled: true`, sistem mengembalikan pesan transparan mengenai status kesiapan template dan menawarkan opsi Rumah Custom.
     - Jika tipe yang dipilih `READY`, sistem langsung memuat template dan mengisi parameter `houseType`, `buildingArea`, `floorCount`, serta `areaSource: "TYPE_DEFAULT"` atau `"USER_DEFINED"`.
   - `answerStep`:
     - Melakukan gating ketat terhadap pilihan kartu. Pemilihan tipe `disabled` tidak dapat memicu kalkulasi fiktif dan diarahkan ke `TEMPLATE_NOT_READY`.

---

## 4. Perubahan Frontend & Renderer UI

1. **Assistant Wizard Renderer**:
   - File: [`src/components/copilot/AssistantWizardRenderer.tsx`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/components/copilot/AssistantWizardRenderer.tsx)
   - **Search Input**: Ditambahkan field pencarian real-time dengan placeholder *"Cari tipe rumah, misalnya Type 120..."*.
   - **Category Pills**: Tab filter dinamis:
     - `Semua (15)`
     - `Kecil (T36–70)`
     - `Menengah (T90–150)`
     - `Besar (T180–300)`
     - `Custom`
   - **Floor Filter**: Dropdown filter lantai (*Semua, 1 Lantai, 2 Lantai*).
   - **Card Layout**:
     - Menampilkan nama tipe, luas bangunan (±X m²), jumlah lantai, dan badge status kesiapan.
     - Tipe yang `Coming Soon` dirender dengan styling redup, tombol `[Pilih]` berstatus disabled (`cursor-not-allowed`), dan badge *Coming Soon*.
     - Tipe yang `Ready` memiliki tombol aktif dengan efek interaktif.

---

## 5. Hasil Verifikasi & Test

Test suite komprehensif dijalankan melalui:
`npx tsx server/test/houseTypeCatalogExpansionTest.ts`

### Bukti Eksekusi Test (24 Skenario):
```
===============================================================
🧪 RUNNING HOUSE TYPE CATALOG EXPANSION VERIFICATION SUITE
===============================================================

--- TEST 1: "buatkan saya rab rumah" Catalog Returns All Types Up to 300 ---
✅ PASSED: Step is TEMPLATE_SELECTION
✅ PASSED: Choices has 15 entries (>= 14 required)
--- TEST 2: Type 36 Tampil ---
✅ PASSED: Type 36 exists in choices
--- TEST 3: Type 45 Tampil ---
✅ PASSED: Type 45 exists in choices
--- TEST 4: Type 54 Tampil ---
✅ PASSED: Type 54 exists in choices
--- TEST 5: Type 60 Tampil ---
✅ PASSED: Type 60 exists in choices
--- TEST 6: Type 70 Tampil ---
✅ PASSED: Type 70 exists in choices
--- TEST 7: Type 90 Tampil ---
✅ PASSED: Type 90 exists in choices
--- TEST 8: Type 100 Tampil ---
✅ PASSED: Type 100 exists in choices
--- TEST 9: Type 120 Tampil ---
✅ PASSED: Type 120 exists in choices
--- TEST 10: Type 150 Tampil ---
✅ PASSED: Type 150 exists in choices
--- TEST 11: Type 180 Tampil ---
✅ PASSED: Type 180 exists in choices
--- TEST 12: Type 200 Tampil ---
✅ PASSED: Type 200 exists in choices
--- TEST 13: Type 250 Tampil ---
✅ PASSED: Type 250 exists in choices
--- TEST 14: Type 300 Tampil ---
✅ PASSED: Type 300 exists in choices
--- TEST 15: Numeric Sorting Validation ---
✅ PASSED: Catalog sorting: 36 <= 36
✅ PASSED: Catalog sorting: 36 <= 45
✅ PASSED: Catalog sorting: 45 <= 54
✅ PASSED: Catalog sorting: 54 <= 60
✅ PASSED: Catalog sorting: 60 <= 70
✅ PASSED: Catalog sorting: 70 <= 90
✅ PASSED: Catalog sorting: 90 <= 100
✅ PASSED: Catalog sorting: 100 <= 120
✅ PASSED: Catalog sorting: 120 <= 150
✅ PASSED: Catalog sorting: 150 <= 180
✅ PASSED: Catalog sorting: 180 <= 200
✅ PASSED: Catalog sorting: 200 <= 250
✅ PASSED: Catalog sorting: 250 <= 300
✅ PASSED: Custom house is sorted at the end
--- TEST 16: Non-Ready Template Gating (No Fake Calculation) ---
✅ PASSED: Type 300 returns TEMPLATE_NOT_READY step
✅ PASSED: Message explains calculation module not ready
✅ PASSED: No fake RAB calculation produced for Type 300
--- TEST 17: Type 36 Resolves HOUSE-T36-1FL ---
✅ PASSED: Type 36 moves to BASIC_PARAMETER_COLLECTION
✅ PASSED: Session templateId is HOUSE-T36-1FL
--- TEST 18: Type 36 2 Lantai Resolves HOUSE-T36-2FL ---
✅ PASSED: Type 36 2FL moves to BASIC_PARAMETER_COLLECTION
✅ PASSED: Session templateId is HOUSE-T36-2FL
--- TEST 19: Natural Language "RAB rumah type 120" Recognition ---
✅ PASSED: NLP finds Type 120 item
✅ PASSED: Extracted area is 120
✅ PASSED: Type 120 route to TEMPLATE_SELECTION with status message
✅ PASSED: Title mentions Type 120
--- TEST 20: Natural Language "RAB rumah 2 lantai type 200" Floor & Area Extraction ---
✅ PASSED: NLP matches Type 200
✅ PASSED: NLP extracts floorCount = 2
✅ PASSED: NLP extracts buildingArea = 200
--- TEST 21: Search Filter "Type 300" ---
✅ PASSED: Search for "Type 300" returns at least 1 item
✅ PASSED: Search item is Type 300
✅ PASSED: Search for "150" in MENENGAH category succeeds
--- TEST 22: Custom House Available ---
✅ PASSED: house_custom exists in catalog
✅ PASSED: house_custom is enabled/ready
--- TEST 23: Non-Empty IDs and Labels for All Choices ---
✅ PASSED: All choices have non-empty ID, Label, Value, and NextStep
--- TEST 24: Renderer Metadata Richness ---
✅ PASSED: Type 120 choice exists with area = 120, disabled = true, and disabledReason

===============================================================
🎉 ALL 24 HOUSE TYPE CATALOG EXPANSION TESTS PASSED PERFECTLY!
===============================================================
```

### Hasil Regresi Keseluruhan:
- `runAllVerificationTests.ts`: **28/28 PASSED (100%)**
- `automaticRabEntryPointTest.ts`: **35/35 PASSED (100%)**
- `npx tsc --noEmit`: **0 ERRORS**
- `npm run build`: **SUCCESSFUL BUNDLE GENERATED (dist/index.html)**

---

## 6. Risiko & Pekerjaan Lanjutan (Future Work)

1. **Pengembangan Modul AHSP Type 54–300**:
   - Untuk mengaktifkan template Type 54, 60, 90, 100, 120, 150, 180, 200, 250, dan 300 ke status `READY`, diperlukan penyusunan blueprint bill of quantities (BoQ) dan koefisien AHSP PUPR spesifik untuk masing-masing tipe denah standar.
2. **Formula Dimensi Struktur Parametrik Bertingkat**:
   - Untuk rumah > 2 lantai (misal Type 250 / 300 3 lantai), perhitungan beban gempa, kolom utama K-300, dan balok gantung bentang lebar perlu diverifikasi dengan standar SNI 2847.
3. **Penyimpanan Profil Kustom Pengguna**:
   - Mendukung penyimpanan template khusus kontraktor (Custom Presets) ke workspace database.
