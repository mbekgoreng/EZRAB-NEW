# KONTRAK KANONIKAL EZRAB AI COASSISTANT QUICK ACTIONS

Dokumen ini mendefinisikan skema kontrak resmi, batasan izin peran, parameter wajib, strategi follow-up, dan aturan keamanan untuk seluruh 10 Quick Actions pada platform EZRAB.

---

## 1. Skema Kontrak Quick Action

```typescript
export type QuickActionRiskLevel = 'READ_ONLY' | 'POTENTIAL_MUTATION' | 'MUTATION';

export interface QuickActionChoice {
  id: string;
  label: string;
  description?: string;
  value: string;
  icon?: string;
  badge?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface QuickActionParameterDefinition {
  name: string;
  label: string;
  type: 'string' | 'number' | 'select' | 'boolean' | 'file';
  unit?: string;
  required: boolean;
  defaultValue?: any;
  options?: QuickActionChoice[];
  validation?: {
    min?: number;
    max?: number;
    step?: number;
    pattern?: string;
  };
}

export interface QuickActionContract {
  actionId: string;
  label: string;
  description: string;
  icon: string;
  category: 'ANALYSIS' | 'CALCULATION' | 'LOOKUP' | 'REPORT' | 'HELP' | 'MAINTENANCE';
  initialPrompt: string;
  intent: string;
  requiredContext: ('activeWorkspace' | 'activeProject' | 'activeItem' | 'activeFile')[];
  requiredParameters: string[];
  parametersSchema: QuickActionParameterDefinition[];
  followUpStrategy: string;
  toolName?: string;
  riskLevel: QuickActionRiskLevel;
  requiresConfirmation: boolean;
  allowedRoles: ('SUPER_ADMIN' | 'ESTIMATOR' | 'DIREKSI' | 'CLIENT')[];
  requiredSubscription: 'FREE' | 'PRO' | 'ENTERPRISE';
  enabled: boolean;
  version: string;
}
```

---

## 2. Definisi 10 Kontrak Kanonikal

### 1. `AUDIT_RAB`
```json
{
  "actionId": "AUDIT_RAB",
  "label": "Audit RAB",
  "description": "Periksa kelengkapan struktur, volume kosong, harga satuan, dan potensi duplikasi RAB",
  "icon": "CheckCircle2",
  "category": "ANALYSIS",
  "initialPrompt": "Bantu saya melakukan audit RAB",
  "intent": "RAB_ANALYSIS",
  "requiredContext": ["activeWorkspace"],
  "requiredParameters": ["rabSource", "auditFocus"],
  "parametersSchema": [
    {
      "name": "rabSource",
      "label": "Sumber RAB",
      "type": "select",
      "required": true,
      "defaultValue": "CURRENT_PROJECT",
      "options": [
        { "id": "CURRENT_PROJECT", "label": "RAB Proyek Saat Ini", "value": "CURRENT_PROJECT" },
        { "id": "UPLOAD_EXCEL", "label": "Upload File Excel", "value": "UPLOAD_EXCEL" },
        { "id": "UPLOAD_PDF", "label": "Upload File PDF", "value": "UPLOAD_PDF" },
        { "id": "OTHER_PROJECT", "label": "Pilih Proyek Lain", "value": "OTHER_PROJECT" }
      ]
    },
    {
      "name": "auditFocus",
      "label": "Fokus Pemeriksaan",
      "type": "select",
      "required": true,
      "defaultValue": "ALL",
      "options": [
        { "id": "VOLUME_UNIT", "label": "Volume & Satuan", "value": "VOLUME_UNIT" },
        { "id": "PRICE_TOTAL", "label": "Harga & Total", "value": "PRICE_TOTAL" },
        { "id": "AHSP_CODE", "label": "Kode AHSP PUPR", "value": "AHSP_CODE" },
        { "id": "DUPLICATION", "label": "Duplikasi Pekerjaan", "value": "DUPLICATION" },
        { "id": "ITEM_COMPLETENESS", "label": "Kelengkapan Item", "value": "ITEM_COMPLETENESS" },
        { "id": "ALL", "label": "Audit Menyeluruh", "value": "ALL" }
      ]
    }
  ],
  "followUpStrategy": "ASK_RAB_SOURCE_AND_FOCUS",
  "toolName": "audit_rab",
  "riskLevel": "READ_ONLY",
  "requiresConfirmation": false,
  "allowedRoles": ["SUPER_ADMIN", "ESTIMATOR", "DIREKSI", "CLIENT"],
  "requiredSubscription": "FREE",
  "enabled": true,
  "version": "1.0.0"
}
```

### 2. `HITUNG_VOLUME`
```json
{
  "actionId": "HITUNG_VOLUME",
  "label": "Hitung Volume",
  "description": "Bantu perhitungan volume pekerjaan (Quantity Takeoff) berdasarkan formula teknis terverifikasi",
  "icon": "Search",
  "category": "CALCULATION",
  "initialPrompt": "Bantu saya menghitung volume pekerjaan",
  "intent": "VOLUME_CALCULATION",
  "requiredContext": ["activeWorkspace"],
  "requiredParameters": ["workType", "shape", "dimensions"],
  "parametersSchema": [
    {
      "name": "workType",
      "label": "Jenis Pekerjaan",
      "type": "select",
      "required": true,
      "options": [
        { "id": "CONCRETE", "label": "Beton Bertulang / Struktur", "value": "CONCRETE" },
        { "id": "EXCAVATION", "label": "Galian Tanah Pondasi", "value": "EXCAVATION" },
        { "id": "BACKFILL", "label": "Timbunan & Pemadatan", "value": "BACKFILL" },
        { "id": "BRICK_MASONRY", "label": "Pasangan Dinding Bata", "value": "BRICK_MASONRY" },
        { "id": "PLASTER_SKIM", "label": "Plesteran & Acian", "value": "PLASTER_SKIM" },
        { "id": "PAINTING", "label": "Pengecatan Dinding & Plafon", "value": "PAINTING" },
        { "id": "FLOORING", "label": "Penutup Lantai & Keramik", "value": "FLOORING" },
        { "id": "ROOF", "label": "Rangka & Penutup Atap", "value": "ROOF" },
        { "id": "CUSTOM", "label": "Pekerjaan Geometri Custom", "value": "CUSTOM" }
      ]
    }
  ],
  "followUpStrategy": "ASK_WORK_TYPE_AND_DIMENSIONS",
  "toolName": "calculate_quantity",
  "riskLevel": "READ_ONLY",
  "requiresConfirmation": false,
  "allowedRoles": ["SUPER_ADMIN", "ESTIMATOR", "DIREKSI", "CLIENT"],
  "requiredSubscription": "FREE",
  "enabled": true,
  "version": "1.0.0"
}
```

### 3. `CARI_AHSP`
```json
{
  "actionId": "CARI_AHSP",
  "label": "Cari AHSP",
  "description": "Pencarian analisa harga satuan pekerjaan resmi standar AHSP PUPR",
  "icon": "Sparkles",
  "category": "LOOKUP",
  "initialPrompt": "Saya bantu mencari AHSP yang sesuai",
  "intent": "AHSP_LOOKUP",
  "requiredContext": ["activeWorkspace"],
  "requiredParameters": ["category", "keyword"],
  "parametersSchema": [
    {
      "name": "category",
      "label": "Kategori Pekerjaan",
      "type": "select",
      "required": true,
      "options": [
        { "id": "EARTHWORK", "label": "Pekerjaan Tanah", "value": "EARTHWORK" },
        { "id": "CONCRETE", "label": "Pekerjaan Beton", "value": "CONCRETE" },
        { "id": "MASONRY", "label": "Pekerjaan Pasangan", "value": "MASONRY" },
        { "id": "PLASTER", "label": "Plesteran & Acian", "value": "PLASTER" },
        { "id": "FINISHING", "label": "Pekerjaan Finishing", "value": "FINISHING" },
        { "id": "ROAD", "label": "Jalan & Perkerasan", "value": "ROAD" },
        { "id": "DRAINAGE", "label": "Drainase & Saluran", "value": "DRAINAGE" },
        { "id": "WATER", "label": "Bangunan Air / SDA", "value": "WATER" },
        { "id": "OTHER", "label": "Pekerjaan Lainnya", "value": "OTHER" }
      ]
    }
  ],
  "followUpStrategy": "ASK_CATEGORY_AND_KEYWORD",
  "toolName": "search_ahsp",
  "riskLevel": "READ_ONLY",
  "requiresConfirmation": false,
  "allowedRoles": ["SUPER_ADMIN", "ESTIMATOR", "DIREKSI", "CLIENT"],
  "requiredSubscription": "FREE",
  "enabled": true,
  "version": "1.0.0"
}
```

### 4. `CARI_HARGA`
```json
{
  "actionId": "CARI_HARGA",
  "label": "Cari Harga",
  "description": "Pencarian harga pasar material, upah tukang, dan sewa alat konstruksi",
  "icon": "Search",
  "category": "LOOKUP",
  "initialPrompt": "Bantu saya mencari harga material, upah, atau alat",
  "intent": "PRICE_SEARCH",
  "requiredContext": ["activeWorkspace"],
  "requiredParameters": ["resourceType", "keyword"],
  "parametersSchema": [
    {
      "name": "resourceType",
      "label": "Jenis Sumber Daya",
      "type": "select",
      "required": true,
      "options": [
        { "id": "MATERIAL", "label": "Harga Material / Bahan", "value": "MATERIAL" },
        { "id": "LABOR", "label": "Upah Tenaga Kerja", "value": "LABOR" },
        { "id": "EQUIPMENT", "label": "Sewa Peralatan Kerja", "value": "EQUIPMENT" },
        { "id": "UNIT_PRICE", "label": "Harga Satuan Pekerjaan", "value": "UNIT_PRICE" }
      ]
    }
  ],
  "followUpStrategy": "ASK_RESOURCE_TYPE_AND_REGION",
  "toolName": "search_price",
  "riskLevel": "READ_ONLY",
  "requiresConfirmation": false,
  "allowedRoles": ["SUPER_ADMIN", "ESTIMATOR", "DIREKSI", "CLIENT"],
  "requiredSubscription": "FREE",
  "enabled": true,
  "version": "1.0.0"
}
```

### 5. `ANALISIS_DED`
```json
{
  "actionId": "ANALISIS_DED",
  "label": "Analisis DED",
  "description": "Ekstraksi elemen gambar kerja teknis, QTO terstruktur, dan deteksi konflik",
  "icon": "FileText",
  "category": "ANALYSIS",
  "initialPrompt": "Bantu saya menganalisis dokumen DED",
  "intent": "DED_ANALYSIS",
  "requiredContext": ["activeWorkspace"],
  "requiredParameters": ["documentSource", "analysisDiscipline"],
  "parametersSchema": [
    {
      "name": "documentSource",
      "label": "Sumber Dokumen",
      "type": "select",
      "required": true,
      "options": [
        { "id": "UPLOAD_PDF", "label": "Upload Dokumen PDF", "value": "UPLOAD_PDF" },
        { "id": "UPLOAD_IMAGE", "label": "Upload Gambar (JPG/PNG)", "value": "UPLOAD_IMAGE" },
        { "id": "EXISTING_DOCS", "label": "Gunakan Dokumen Proyek", "value": "EXISTING_DOCS" }
      ]
    },
    {
      "name": "analysisDiscipline",
      "label": "Disiplin Analisis",
      "type": "select",
      "required": true,
      "defaultValue": "ALL",
      "options": [
        { "id": "DIMENSION_PLAN", "label": "Denah & Dimensi Geometri", "value": "DIMENSION_PLAN" },
        { "id": "STRUCTURE", "label": "Struktur (Pondasi, Kolom, Balok)", "value": "STRUCTURE" },
        { "id": "ARCHITECTURE", "label": "Arsitektur & Finishing", "value": "ARCHITECTURE" },
        { "id": "MEP", "label": "Mekanikal, Elektrikal, Plumbing", "value": "MEP" },
        { "id": "QTO_EXTRACTION", "label": "Ekstraksi Quantity Takeoff", "value": "QTO_EXTRACTION" },
        { "id": "CONFLICT_DETECTION", "label": "Deteksi Konflik Dokumen", "value": "CONFLICT_DETECTION" },
        { "id": "ALL", "label": "Analisis Menyeluruh", "value": "ALL" }
      ]
    }
  ],
  "followUpStrategy": "ASK_DED_SOURCE_AND_DISCIPLINE",
  "toolName": "analyze_ded",
  "riskLevel": "READ_ONLY",
  "requiresConfirmation": false,
  "allowedRoles": ["SUPER_ADMIN", "ESTIMATOR", "DIREKSI", "CLIENT"],
  "requiredSubscription": "PRO",
  "enabled": true,
  "version": "1.0.0"
}
```

### 6. `BUAT_LAPORAN`
```json
{
  "actionId": "BUAT_LAPORAN",
  "label": "Buat Laporan",
  "description": "Penyusunan draft laporan eksekutif, progres mingguan, kurva S, dan audit biaya",
  "icon": "FileText",
  "category": "REPORT",
  "initialPrompt": "Bantu saya membuat laporan proyek",
  "intent": "REPORT_GENERATION",
  "requiredContext": ["activeWorkspace", "activeProject"],
  "requiredParameters": ["reportType", "period", "format"],
  "parametersSchema": [
    {
      "name": "reportType",
      "label": "Jenis Laporan",
      "type": "select",
      "required": true,
      "options": [
        { "id": "RAB_SUMMARY", "label": "Ringkasan Eksekutif RAB", "value": "RAB_SUMMARY" },
        { "id": "WEEKLY_PROGRESS", "label": "Laporan Mingguan Progres", "value": "WEEKLY_PROGRESS" },
        { "id": "COST_EXPENDITURE", "label": "Laporan Realisasi Biaya", "value": "COST_EXPENDITURE" },
        { "id": "MATERIAL_RECAP", "label": "Rekapitulasi Bahan & Alat", "value": "MATERIAL_RECAP" },
        { "id": "AUDIT_REPORT", "label": "Laporan Hasil Audit Biaya", "value": "AUDIT_REPORT" },
        { "id": "CUSTOM_REPORT", "label": "Laporan Kustom", "value": "CUSTOM_REPORT" }
      ]
    }
  ],
  "followUpStrategy": "ASK_REPORT_TYPE_AND_PERIOD",
  "toolName": "generate_report",
  "riskLevel": "POTENTIAL_MUTATION",
  "requiresConfirmation": true,
  "allowedRoles": ["SUPER_ADMIN", "ESTIMATOR", "DIREKSI"],
  "requiredSubscription": "FREE",
  "enabled": true,
  "version": "1.0.0"
}
```

### 7. `PERIKSA_KURVA_S`
```json
{
  "actionId": "PERIKSA_KURVA_S",
  "label": "Periksa Kurva S",
  "description": "Analisis distribusi bobot pekerjaan, deviasi rencana vs realisasi, dan jalur kritis",
  "icon": "CheckCircle2",
  "category": "ANALYSIS",
  "initialPrompt": "Bantu saya memeriksa Kurva S proyek",
  "intent": "CURVE_S_GENERATION",
  "requiredContext": ["activeWorkspace", "activeProject"],
  "requiredParameters": ["projectSource", "analysisFocus"],
  "parametersSchema": [
    {
      "name": "analysisFocus",
      "label": "Fokus Pemeriksaan",
      "type": "select",
      "required": true,
      "defaultValue": "DEVIATION_ANALYSIS",
      "options": [
        { "id": "PROGRESS_WEIGHT", "label": "Distribusi Bobot Pekerjaan", "value": "PROGRESS_WEIGHT" },
        { "id": "PLANNED_VS_ACTUAL", "label": "Rencana vs Realisasi Progres", "value": "PLANNED_VS_ACTUAL" },
        { "id": "DEVIATION_ANALYSIS", "label": "Analisis Deviasi & Keterlambatan", "value": "DEVIATION_ANALYSIS" },
        { "id": "CRITICAL_PATH", "label": "Jalur Kritis & Durasi WBS", "value": "CRITICAL_PATH" },
        { "id": "ALL", "label": "Evaluasi Kurva S Menyeluruh", "value": "ALL" }
      ]
    }
  ],
  "followUpStrategy": "ASK_PROJECT_AND_FOCUS",
  "toolName": "inspect_curve_s",
  "riskLevel": "READ_ONLY",
  "requiresConfirmation": false,
  "allowedRoles": ["SUPER_ADMIN", "ESTIMATOR", "DIREKSI", "CLIENT"],
  "requiredSubscription": "FREE",
  "enabled": true,
  "version": "1.0.0"
}
```

### 8. `JELASKAN_ITEM`
```json
{
  "actionId": "JELASKAN_ITEM",
  "label": "Jelaskan Item",
  "description": "Penjelasan rinci rumus perhitungan, koefisien AHSP, dan subtotal item pekerjaan",
  "icon": "FileText",
  "category": "HELP",
  "initialPrompt": "Item pekerjaan atau data apa yang ingin Anda jelaskan?",
  "intent": "EXPLAIN_CALCULATION",
  "requiredContext": ["activeWorkspace"],
  "requiredParameters": ["targetItem"],
  "parametersSchema": [
    {
      "name": "targetItem",
      "label": "Item Pekerjaan",
      "type": "string",
      "required": true
    }
  ],
  "followUpStrategy": "RESOLVE_ACTIVE_ITEM_OR_ASK",
  "toolName": "explain_item",
  "riskLevel": "READ_ONLY",
  "requiresConfirmation": false,
  "allowedRoles": ["SUPER_ADMIN", "ESTIMATOR", "DIREKSI", "CLIENT"],
  "requiredSubscription": "FREE",
  "enabled": true,
  "version": "1.0.0"
}
```

### 9. `RECALCULATE`
```json
{
  "actionId": "RECALCULATE",
  "label": "Recalculate",
  "description": "Rekalkulasi deterministik volume, harga satuan, PPN, dan grand total RAB dengan preview perbandingan",
  "icon": "CheckCircle2",
  "category": "MAINTENANCE",
  "initialPrompt": "Bantu saya menghitung ulang RAB",
  "intent": "RECALCULATE_RAB",
  "requiredContext": ["activeWorkspace", "activeProject"],
  "requiredParameters": ["scope"],
  "parametersSchema": [
    {
      "name": "scope",
      "label": "Cakupan Rekalkulasi",
      "type": "select",
      "required": true,
      "defaultValue": "ALL_RAB",
      "options": [
        { "id": "ALL_RAB", "label": "Seluruh RAB & Rekapitulasi", "value": "ALL_RAB" },
        { "id": "CHANGED_ITEMS", "label": "Hanya Item yang Mengalami Perubahan", "value": "CHANGED_ITEMS" },
        { "id": "QUANTITIES_ONLY", "label": "Hanya Volume Pekerjaan", "value": "QUANTITIES_ONLY" },
        { "id": "PRICES_ONLY", "label": "Hanya Harga Satuan & AHSP", "value": "PRICES_ONLY" },
        { "id": "TAX_AND_OVERHEAD", "label": "Pajak (PPN 11%) & Overhead Profit", "value": "TAX_AND_OVERHEAD" }
      ]
    }
  ],
  "followUpStrategy": "PREVIEW_DIFF_AND_CONFIRM",
  "toolName": "recalculate_rab",
  "riskLevel": "MUTATION",
  "requiresConfirmation": true,
  "allowedRoles": ["SUPER_ADMIN", "ESTIMATOR", "DIREKSI"],
  "requiredSubscription": "FREE",
  "enabled": true,
  "version": "1.0.0"
}
```

### 10. `BANTUAN_FITUR`
```json
{
  "actionId": "BANTUAN_FITUR",
  "label": "Bantuan Fitur",
  "description": "Panduan interaktif cara penggunaan fitur-fitur platform EZRAB",
  "icon": "Sparkles",
  "category": "HELP",
  "initialPrompt": "Saya bisa membantu Anda menggunakan EZRAB. Fitur apa yang ingin Anda pelajari?",
  "intent": "BASIC_HELP",
  "requiredContext": ["activeWorkspace"],
  "requiredParameters": ["featureTopic"],
  "parametersSchema": [
    {
      "name": "featureTopic",
      "label": "Modul Fitur",
      "type": "select",
      "required": true,
      "options": [
        { "id": "PROJECT_CREATION", "label": "Cara Membuat Proyek Baru", "value": "PROJECT_CREATION" },
        { "id": "RAB_WIZARD", "label": "Cara Membuat RAB Otomatis", "value": "RAB_WIZARD" },
        { "id": "SPREADSHEET_RAB", "label": "Cara Menggunakan Spreadsheet RAB", "value": "SPREADSHEET_RAB" },
        { "id": "AHSP_LOOKUP", "label": "Cara Mencari Analisa AHSP 2026", "value": "AHSP_LOOKUP" },
        { "id": "QTO_CALCULATION", "label": "Cara Menghitung Volume QTO", "value": "QTO_CALCULATION" },
        { "id": "DED_ANALYSIS", "label": "Cara Analisis Gambar DED", "value": "DED_ANALYSIS" },
        { "id": "CURVE_S", "label": "Cara Menggunakan Kurva S", "value": "CURVE_S" },
        { "id": "EXPORT_REPORTS", "label": "Cara Ekspor Laporan Excel & PDF", "value": "EXPORT_REPORTS" },
        { "id": "OTHER", "label": "Bantuan Fitur Lainnya", "value": "OTHER" }
      ]
    }
  ],
  "followUpStrategy": "OFFER_FEATURE_MODULES",
  "toolName": "get_feature_help",
  "riskLevel": "READ_ONLY",
  "requiresConfirmation": false,
  "allowedRoles": ["SUPER_ADMIN", "ESTIMATOR", "DIREKSI", "CLIENT"],
  "requiredSubscription": "FREE",
  "enabled": true,
  "version": "1.0.0"
}
```
