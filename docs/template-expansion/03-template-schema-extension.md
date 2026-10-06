# EZRAB — TEMPLATE SCHEMA EXTENSION SPECIFICATION
## Phase 5+ Universal Multi-Disciplinary Template Schema

**Status:** AUDIT & DESIGN ONLY — IMPLEMENTATION NOT STARTED  
**Auditor:** Principal Software Architect, Database Architect  
**Date:** 2026-09-14  
**Project:** EZRAB AI — Intelligent Construction Cost Estimation Engine  

---

## 1. Tujuan Perluasan Schema

Schema saat ini (`src/data/buildingTemplates/schema/types.ts`) perlu diperluas secara non-breaking untuk mendukung:
1. Multi-disiplin keteknikan (`BUILDING`, `ROAD`, `WATER_RESOURCES`, `DRAINAGE`, `CIVIL_STRUCTURE`).
2. *Maturity Levels* eksplisit untuk mencegah template eksperimental atau belum lengkap dieksekusi sebagai template produksi.
3. Struktur hirarkis komponen (*components composability*).
4. Penanganan nilai `NULL`/`UNKNOWN` untuk parameter yang belum tersedia dalam dokumen DED.

---

## 2. Definisi Tipe dan Enum Baru

```typescript
/**
 * 1. Disiplin Utama Keteknikan Konstruksi
 */
export type EngineeringDiscipline =
  | 'BUILDING'
  | 'ROAD_AND_PAVEMENT'
  | 'WATER_RESOURCES'
  | 'DRAINAGE'
  | 'CIVIL_AND_STRUCTURE';

/**
 * 2. Tingkat Kematangan Template (Maturity Level Lifecycle)
 */
export type TemplateMaturityLevel =
  | 'EXPERIMENTAL'          // Tahap eksplorasi awal, formula belum divalidasi
  | 'DESIGN_ONLY'           // Skema dan parameter selesai, formula belum dikodekan
  | 'PARAMETRIC_READY'      // Parameter & aturan validasi siap
  | 'CALCULATION_READY'     // Formula volume & AHSP mapping terverifikasi 100%
  | 'GEOMETRY_READY'        // Visualisasi 3D wireframe / cross-section siap
  | 'VISION_READY'          // Pemetaan OCR/Vision AI DED siap
  | 'PRODUCTION_CANDIDATE'; // Telah lolos seluruh unit & regression test suite

/**
 * 3. Status Review Keamanan Struktural & Estimasi
 */
export type TechnicalReviewStatus =
  | 'AUTO_VERIFIED'         // Template standar dengan parameter deterministik lengkap
  | 'NEEDS_REVIEW'          // Template berisiko tinggi / parameter tidak lengkap
  | 'EXPERT_APPROVED'       // Telah disetujui oleh Senior Engineer / Quantity Surveyor
  | 'REJECTED';             // Ditolak karena ketidaksesuaian standar atau ambiguitas data

/**
 * 4. Satuan Teknis Lanjutan (Engineering Units)
 */
export type ExtendedEngineeringUnit =
  | 'm' | 'm2' | 'm3' | 'kg' | 'ton' | 'unit' | 'titik' | 'buah' | 'set' | 'ls' | 'jam' | 'bulan'
  | 'm3/s' | 'liter/detik' | 'CBR_%' | 'kN/m2' | 'MPa' | 'degree_slope' | 'STA';
```

---

## 3. Perluasan Definisi Interface Master Template

```typescript
/**
 * Parameter Definition dengan Dukungan Nullable & Unknown Value
 */
export interface ExtendedTemplateParameter {
  name: string;
  label: string;
  discipline: EngineeringDiscipline;
  type: ParameterType;
  unit?: ExtendedEngineeringUnit;
  required: boolean;
  defaultValue: any | null;       // Boleh NULL jika parameter tidak memiliki nilai default aman
  allowUnknown: boolean;          // Mengizinkan nilai status UNKNOWN saat OCR parsial
  min?: number;
  max?: number;
  allowedValues?: Array<string | number | boolean>;
  description: string;
  source: 'user_input' | 'template_default' | 'vision_ai_extracted' | 'inferred';
  confidence: number;             // Skor keyakinan 0.0 - 1.0
  validationRule?: (val: any) => { valid: boolean; message?: string };
  impactRating?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; // Dampak thd total RAB
}

/**
 * Metadata Asumsi Terverifikasi & Audit Trail
 */
export interface ExtendedTemplateAssumption {
  assumptionId: string;
  label: string;
  value: number | string | boolean | null;
  unit?: ExtendedEngineeringUnit;
  rationale: string;
  source: 'SNI' | 'PUPR' | 'BINA_MARGA' | 'DITJEN_SDA' | 'BEST_PRACTICE' | 'EMPIRICAL_ESTIMATOR';
  standardReference?: string;     // Contoh: "KP-02 Kriteria Perencanaan Saluran Irigasi Hal. 45"
  confidence: number;
  editable: boolean;
  requiresConfirmation: boolean;
  isOverrideActive?: boolean;
}

/**
 * Master Template Multi-Disiplin Terpadu
 */
export interface ExtendedMasterBuildingTemplate {
  // 1. Identifikasi & Klasifikasi
  id: string;
  code: string;
  name: string;
  discipline: EngineeringDiscipline;
  category: BuildingCategory;
  maturityLevel: TemplateMaturityLevel;
  version: string;
  status: TemplateStatus;
  description: string;
  applicableProjectTypes: string[];

  // 2. Metrik Satuan
  units: {
    primaryLength: ExtendedEngineeringUnit;
    primaryArea: ExtendedEngineeringUnit;
    primaryVolume: ExtendedEngineeringUnit;
    massUnit?: ExtendedEngineeringUnit;
  };

  // 3. Parameter & Asumsi
  parameters: Record<string, ExtendedTemplateParameter>;
  assumptions: Record<string, ExtendedTemplateAssumption>;

  // 4. Komponen Terpasang (Component Composition)
  componentIds?: string[];        // Daftar ID IParametricComponent yang dirangkai

  // 5. Dukungan Modul Tambahan
  supportCapabilities: {
    geometry3D: boolean;          // Apakah mendukung 3D Wireframe Viewer
    crossSection2D: boolean;      // Apakah mendukung 2D Cross Section (Jalan/Saluran)
    visionExtraction: boolean;    // Apakah mendukung OCR Vision DED
    soilMechanicsModule: boolean; // Apakah memerlukan perhitungan daya dukung/CBR
    hydraulicsModule: boolean;    // Apakah memerlukan debit & kecepatan Manning
  };

  // 6. Daftar Pekerjaan & Aturan Volume (Kompatibel dengan Schema Lama)
  workItems: TemplateWorkItem[];

  // 7. Batasan Keteknikan & Kondisi Batas
  limitations: string[];
  boundaryConditions?: {
    minScaleValue?: number;       // Contoh: Panjang jalan min 10m
    maxScaleValue?: number;       // Contoh: Bentang jembatan maks 100m
    maxWaterHead?: number;        // Tinggi muka air maks untuk bendungan
  };

  // 8. Tata Kelola & Audit Status
  sourceMetadata: {
    standardReference: string;
    lastUpdated: string;
    author: string;
  };
  reviewStatus: {
    isReviewed: boolean;
    technicalReviewStatus: TechnicalReviewStatus;
    reviewedBy?: string;
    reviewedDate?: string;
    reviewNotes?: string;
  };
}
```

---

## 4. Kebijakan Nilai `NULL` dan `UNKNOWN`

Untuk mencegah kalkulasi "halusinasi" pada proyek berisiko tinggi:

1. **Parameter Kritis Tanpa Default:**  
   Jika parameter kritis (misal: *Elevasi Muka Air Banjir Rencana*, *Kedalaman Tanah Keras N-SPT > 50*, *Tebal Lapisan Tanah Lempung*) tidak tersedia dalam prompt pengguna atau dokumen DED, nilainya **wajib diset `NULL` / `UNKNOWN`**.
2. **Penetapan Status `NEEDS_REVIEW`:**  
   Bila ada parameter kritis bernilai `NULL`, kalkulasi RAB otomatis akan menandai item pekerjaan terkait dengan status `needs_review` dan memblokir penerbitan proposal otomatis ke spreadsheet sampai estimator memberikan konfirmasi.

---

## 5. Backward Compatibility Guarantee

Schema di atas memperluas schema `MasterBuildingTemplate` lama tanpa menghapus field apapun:
- Seluruh 7 template Phase 1-4 memenuhi kontrak `ExtendedMasterBuildingTemplate` dengan nilai default `discipline: 'BUILDING'` / `'ROAD_AND_PAVEMENT'` / `'DRAINAGE'`, dan `maturityLevel: 'PRODUCTION_CANDIDATE'`.
- Tidak ada breaking changes pada `ParametricVolumeEngine` maupun `templateRoutes.ts`.
