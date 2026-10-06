# EZRAB — KONTRAK PILIHAN INTERAKTIF (CHOICE & RESPONSE CONTRACT)
**Dokumen:** `docs/interactive-rab-wizard/03-choice-contract.md`  
**Modul:** Interactive Automatic RAB Wizard  
**Tanggal:** 2026-09-15  

---

## 1. STRUKTUR ASSISTANT CHOICE & WIZARD RESPONSE

```typescript
export interface AssistantChoice {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  badge?: string;
  value: string;
  nextStep: string;
  templateId?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface AssistantWizardResponse {
  responseType: 'wizard';
  wizardSessionId: string;
  step: string;
  title: string;
  message: string;
  questions: AssistantQuestion[];
  choices?: AssistantChoice[];
  progress?: {
    current: number;
    total: number;
    stepName: string;
  };
  canGoBack: boolean;
  canCancel: boolean;
  draftId?: string;
  summary?: {
    category?: string;
    projectType?: string;
    templateName?: string;
    collectedParameters: Record<string, any>;
    estimatedTotal?: number;
  };
}
```

---

## 2. CONTOH PAYLOAD TAHAP PEMILIHAN TIPE RUMAH

```json
{
  "responseType": "wizard",
  "wizardSessionId": "wiz_sess_9a8b7c6d",
  "step": "TEMPLATE_SELECTION",
  "title": "Pilih Tipe Rumah Tinggal",
  "message": "Siap! Saya akan bantu menyusunkan RAB rumah tinggal Anda dengan standar AHSP PUPR 2026. Silakan pilih tipe rumah:",
  "questions": [],
  "choices": [
    {
      "id": "t36-1fl",
      "label": "Rumah Type 36 (1 Lantai)",
      "description": "Luas 36 m², 2 Kamar Tidur, 1 Kamar Mandi",
      "badge": "Paling Populer",
      "value": "HOUSE-T36-1FL",
      "nextStep": "BASIC_PARAMETER_COLLECTION",
      "templateId": "HOUSE-T36-1FL"
    },
    {
      "id": "t45-1fl",
      "label": "Rumah Type 45 (1 Lantai)",
      "description": "Luas 45 m², 2 Kamar Tidur Lega, Dapur & Carport",
      "value": "HOUSE-T45-1FL",
      "nextStep": "BASIC_PARAMETER_COLLECTION",
      "templateId": "HOUSE-T45-1FL"
    },
    {
      "id": "t70-1fl",
      "label": "Rumah Type 70 (1 Lantai)",
      "description": "Luas 70 m², 3 Kamar Tidur, Ruang Keluarga Luas",
      "value": "HOUSE-T70-1FL",
      "nextStep": "BASIC_PARAMETER_COLLECTION",
      "templateId": "HOUSE-T70-1FL"
    },
    {
      "id": "t36-2fl",
      "label": "Rumah Type 36 (2 Lantai)",
      "description": "Bangunan Bertingkat Efisien, Struktur Beton Bertulang",
      "value": "HOUSE-T36-2FL",
      "nextStep": "BASIC_PARAMETER_COLLECTION",
      "templateId": "HOUSE-T36-2FL"
    },
    {
      "id": "custom-house",
      "label": "Rumah Custom (Parameter Bebas)",
      "description": "Tentukan luas, lantai, dan spesifikasi bebas sendiri",
      "value": "CUSTOM_HOUSE",
      "nextStep": "BASIC_PARAMETER_COLLECTION",
      "templateId": "CUSTOM_HOUSE"
    }
  ],
  "progress": {
    "current": 2,
    "total": 5,
    "stepName": "Pemilihan Template"
  },
  "canGoBack": true,
  "canCancel": true
}
```
