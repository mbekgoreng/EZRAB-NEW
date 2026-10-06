# EZRAB — KONTRAK ENDPOINT API BACKEND (BACKEND API CONTRACT)
**Dokumen:** `docs/interactive-rab-wizard/05-backend-api-contract.md`  
**Modul:** Interactive Automatic RAB Wizard  
**Tanggal:** 2026-09-15  

---

## 1. ENDPOINT SPECS

Semua request wajib menyertakan header:
- `Authorization: Bearer <Supabase_JWT>`
- `x-workspace-id: <Workspace_ID>`
- `Content-Type: application/json`

---

### 1. Start Wizard Session
- **Route:** `POST /api/assistant/wizard/start`
- **Request Body:**
```json
{
  "conversationId": "conv_12345",
  "initialQuery": "Buatkan RAB Rumah",
  "projectId": "PRJ-TROPIS-MODERN-01"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "wizardResponse": {
    "responseType": "wizard",
    "wizardSessionId": "wiz_sess_abcdef12",
    "step": "PROJECT_TYPE_SELECTION",
    "title": "Pilih Kategori Bangunan",
    "message": "Siap, saya bantu menyusun RAB. Pilih tipe proyek yang ingin Anda rencanakan:",
    "choices": [ ... ]
  }
}
```

---

### 2. Answer Step / Submit Parameters
- **Route:** `POST /api/assistant/wizard/:sessionId/answer`
- **Request Body:**
```json
{
  "choiceId": "HOUSE-T36-1FL",
  "parameters": {
    "building_area": 36,
    "num_floors": 1,
    "foundation_type": "BATU_KALI",
    "roof_type": "BAJA_RINGAN_GENTENG_METAL",
    "quality_level": "STANDAR"
  }
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "wizardResponse": {
    "step": "RAB_PREVIEW",
    "summary": { ... }
  }
}
```

---

### 3. Navigation Endpoints
- `GET /api/assistant/wizard/:sessionId` -> Ambil status sesi aktif.
- `POST /api/assistant/wizard/:sessionId/back` -> Kembali ke step sebelumnya.
- `POST /api/assistant/wizard/:sessionId/cancel` -> Batalkan wizard tanpa side-effect.
- `POST /api/assistant/wizard/:sessionId/preview` -> Hitung kalkulasi preview via CalculationService.
- `POST /api/assistant/wizard/:sessionId/confirm` -> Konfirmasi final, buat baris item RAB ke spreadsheet proyek.
