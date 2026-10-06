# PHASE 5 — VISION AI DED EXTRACTION: PROVIDER CAPABILITY MATRIX
**Date:** 14 September 2026  
**Status:** **APPROVED CAPABILITY MATRIX**  

---

## 1. Vision AI Provider Matrix

| Provider Identifier | Text Parsing | Image Input (Raster) | Direct PDF Input | Local / On-Premise | Fallback Support | Status in Project |
|---|---|---|---|---|---|---|
| **`mock`** (Default Test Provider) | YES | YES (Simulated) | YES (Simulated) | YES (In-Memory) | N/A | **ACTIVE / READY** |
| **`ollama`** (`llava:13b`, `qwen2.5-vl`) | YES | YES (Base64 JPEG/PNG) | NO (Memerlukan rasterizer) | YES (Local GPU/CPU) | Fallback to Mock | **CONFIGURABLE** |
| **`openai`** (`gpt-4o`, `gpt-4o-mini`) | YES | YES (Base64 / URL) | NO (Memerlukan rasterizer) | NO (Cloud API) | Fallback to Local/Mock | **CONFIGURABLE** |
| **`openrouter`** (Multi-model router) | YES | YES (Base64 / URL) | NO (Memerlukan rasterizer) | NO (Cloud API) | Fallback to Mock | **CONFIGURABLE** |

---

## 2. Technical Evaluation & Constraints

### 1. Direct PDF vs Rasterized Pages
- **Temuan:** Tidak ada model Vision AI publik yang mengonsumsi file multi-page PDF DED secara optimal tanpa degradasi resolusi teks dimensi.
- **Keputusan Desain:** Backend EZRAB wajib melakukan **pre-rendering PDF menjadi citra resolusi tinggi 300 DPI per halaman** sebelum mengirimkan citra ke Model Adapter.

### 2. Multi-Tier Privacy & Offline Support
- Proyek EZRAB dapat beroperasi secara **100% Offline / Air-Gapped** menggunakan model open-source lokal via Ollama (`qwen2.5-vl` atau `llava`) tanpa mengirimkan dokumen DED sensitif milik klien ke internet.
- Untuk pengguna Enterprise dengan API Key Cloud, adapter OpenAI/OpenRouter dapat diaktifkan secara opt-in melalui environment variable tanpa mengekspos secret key ke client UI.

### 3. Rate Limit & Token Usage Quotas
- Biaya token / credit dihitung **per halaman DED yang diproses**, bukan per interaksi chat biasa.
- Sistem mengaplikasikan quota deduction sebelum ekstraksi dieksekusi, dan melakukan refund otomatis jika terjadi kegagalan jaringan pada provider.
