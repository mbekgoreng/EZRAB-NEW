# EZRAB — SKEMA PERTANYAAN INTERAKTIF (QUESTION SCHEMA)
**Dokumen:** `docs/interactive-rab-wizard/02-question-schema.md`  
**Modul:** Interactive Automatic RAB Wizard  
**Tanggal:** 2026-09-15  

---

## 1. STRUKTUR DATA QUESTION SCHEMA

```typescript
export type QuestionInputType =
  | 'single_select'
  | 'multi_select'
  | 'number'
  | 'text'
  | 'unit_number'
  | 'dropdown'
  | 'location'
  | 'confirmation';

export interface ValidationRule {
  min?: number;
  max?: number;
  pattern?: string;
  step?: number;
  customValidator?: string;
  errorMessage?: string;
}

export interface AssistantQuestion {
  id: string;
  type: QuestionInputType;
  label: string;
  description?: string;
  required: boolean;
  options?: AssistantChoice[];
  unit?: string;
  defaultValue?: any;
  validation?: ValidationRule;
  dependsOn?: {
    field: string;
    value: any;
  };
}
```

---

## 2. CONTOH SKEMA PERTANYAAN UNTUK TIAP DOMAIN

### A. Rumah Tinggal (House Template)
```json
[
  {
    "id": "building_area",
    "type": "unit_number",
    "label": "Luas Bangunan",
    "unit": "m²",
    "required": true,
    "validation": { "min": 21, "max": 2000 }
  },
  {
    "id": "num_floors",
    "type": "single_select",
    "label": "Jumlah Lantai",
    "required": true,
    "options": [
      { "id": "1fl", "label": "1 Lantai", "value": "1" },
      { "id": "2fl", "label": "2 Lantai", "value": "2" },
      { "id": "3fl", "label": "3 Lantai", "value": "3" }
    ]
  },
  {
    "id": "foundation_type",
    "type": "dropdown",
    "label": "Jenis Pondasi Utama",
    "required": true,
    "options": [
      { "id": "batu_kali", "label": "Pondasi Batu Kali / Menerus", "value": "BATU_KALI" },
      { "id": "footplate", "label": "Pondasi Footplate / Cakar Ayam", "value": "FOOTPLATE" },
      { "id": "strauss", "label": "Pondasi Strauss Pile / Bore Pile", "value": "STRAUSS_PILE" }
    ]
  },
  {
    "id": "roof_type",
    "type": "single_select",
    "label": "Konstruksi Rangka Atap",
    "required": true,
    "options": [
      { "id": "baja_ringan", "label": "Rangka Baja Ringan + Genteng Metal", "value": "BAJA_RINGAN_GENTENG_METAL" },
      { "id": "genteng_keramik", "label": "Rangka Baja Ringan + Genteng Keramik", "value": "BAJA_RINGAN_GENTENG_KERAMIK" },
      { "id": "atap_spandek", "label": "Rangka Baja Ringan + Atap Spandek/Zincalume", "value": "BAJA_RINGAN_SPANDEK" },
      { "id": "dak_beton", "label": "Dak Beton Bertulang", "value": "DAK_BETON" }
    ]
  },
  {
    "id": "wall_height",
    "type": "unit_number",
    "label": "Tinggi Dinding (Plafon)",
    "unit": "m",
    "required": true,
    "defaultValue": 3.5,
    "validation": { "min": 2.5, "max": 6.0, "step": 0.1 }
  },
  {
    "id": "quality_level",
    "type": "single_select",
    "label": "Kelas Kualitas Material",
    "required": true,
    "options": [
      { "id": "ekonomis", "label": "Ekonomis / Sederhana (Finishing Standar)", "value": "STANDAR" },
      { "id": "menengah", "label": "Menengah / Standard Pro (Kualitas Prima)", "value": "MENENGAH" },
      { "id": "mewah", "label": "Mewah / Premium (Granit, Sanitair Mewah)", "value": "PREMIUM" }
    ]
  },
  {
    "id": "location",
    "type": "location",
    "label": "Lokasi Kabupaten / Kota Proyek",
    "required": true,
    "defaultValue": "Nasional Rata-Rata"
  }
]
```

### B. Jalan & Perkerasan (Road & Paving)
```json
[
  { "id": "road_length", "type": "unit_number", "label": "Panjang Jalan", "unit": "m", "required": true, "validation": { "min": 5 } },
  { "id": "road_width", "type": "unit_number", "label": "Lebar Jalan", "unit": "m", "required": true, "validation": { "min": 1.5, "max": 30 } },
  { "id": "paving_thickness", "type": "single_select", "label": "Ketebalan Paving Block", "required": true, "options": [
    { "id": "6cm", "label": "Tebal 6 cm (Pejalan Kaki & Motor)", "value": "6CM" },
    { "id": "8cm", "label": "Tebal 8 cm (Mobil, Truk Ringan)", "value": "8CM" },
    { "id": "10cm", "label": "Tebal 10 cm (Kawasan Industri / Truk Berat)", "value": "10CM" }
  ]},
  { "id": "use_kanstin", "type": "single_select", "label": "Gunakan Kanstin Pembatas?", "required": true, "options": [
    { "id": "yes", "label": "Ya, Pasang Kanstin Kanan-Kiri", "value": "YES" },
    { "id": "no", "label": "Tidak Perlu Kanstin", "value": "NO" }
  ]}
]
```
