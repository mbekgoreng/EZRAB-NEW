# EZRAB AI CORE — Model Adapter Specification (Fase 2)

> **Status:** IMPLEMENTED  
> **Versi:** 1.0.0  
> **Modul Terkait:** `server/providers/modelAdapter.ts`, `server/providers/unifiedModelAdapter.ts`, `server/providers/providerFactory.ts`

---

## 1. Ringkasan & Tujuan

Model Adapter merupakan layer abstraksi terpusat yang menjamin EZRAB AI Core tidak terikat (*vendor lock-in*) pada satu provider AI. Model Adapter menyediakan antarmuka standar untuk:
- Text Generation & Multi-turn Tool Calling
- Streaming SSE Responses
- Structured JSON Output Generation
- Vector Embedding Generation
- Vision / Image Analysis (DED & Denah)
- Runtime Capability Detection
- Auto Fallback & Health Monitoring

---

## 2. Provider yang Didukung

| Provider | Konfigurasi Target | Model Default | Tool Calling | Vision | Embedding |
|---|---|---|---|---|---|
| **Ollama / Local Qwen** | `AI_PROVIDER=ollama`<br>`AI_BASE_URL=http://127.0.0.1:11434` | `qwen3:8b` / `qwen2.5-coder:7b` | Ya (Qwen) | Model Vision khusus (`llava`) | Ya |
| **OpenAI Compatible** | `AI_PROVIDER=openai`<br>`AI_BASE_URL=https://api.openai.com/v1` | `gpt-4o` / `gpt-4o-mini` | Ya | Ya | `text-embedding-3-small` |
| **OpenRouter / Cloud** | `AI_PROVIDER=openai`<br>`AI_BASE_URL=https://openrouter.ai/api/v1` | `qwen/qwen-2.5-72b-instruct` | Ya | Ya | Ya |
| **Mock Provider** | `AI_PROVIDER=mock` | `mock-model` | Ya (Deterministik) | Simulasi | Deterministik (384-dim) |

---

## 3. Konfigurasi Environment Backend

```env
# Mode Provider: 'mock' | 'openai' | 'ollama' | 'auto'
AI_PROVIDER=mock

# Model Identifier
AI_MODEL=gpt-4o

# Base URL (Kustom untuk vLLM / Ollama / OpenRouter)
AI_BASE_URL=https://api.openai.com/v1

# API Key (HANYA di backend, jangan pernah kirim ke frontend)
AI_API_KEY=

# Embedding Provider & Model
AI_EMBEDDING_PROVIDER=openai
AI_EMBEDDING_MODEL=text-embedding-3-small

# Vision Model untuk Gambar DED
AI_VISION_MODEL=gpt-4o

# Parameter Inferensi
AI_MAX_TOKENS=2048
AI_TEMPERATURE=0.2
AI_TIMEOUT_MS=40000

# Fallback Flags
AI_ENABLE_LOCAL_MODEL=true
AI_ENABLE_CLOUD_FALLBACK=true
```

---

## 4. Capability Detection & Fallback Logic

Sebelum menjalankan fungsi tertentu (misal: analisis gambar atau structured JSON), `UnifiedModelAdapter` memeriksa properti `capabilities`:
1. Jika model lokal tidak mendukung vision, permintaan gambar ditolak secara aman dengan pesan error yang jelas tanpa crashing.
2. Jika model utama mengalami timeout atau HTTP error 5xx, sistem secara otomatis mengeksekusi `fallbackAdapter` yang telah terdaftar.
3. Estimasi penggunaan token dihitung menggunakan algoritma heuristik bahasa Indonesia (~3.8 karakter per token).
