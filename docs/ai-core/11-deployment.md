# EZRAB AI CORE — Deployment & Operations Guide (Fase 27 & 29)

> **Status:** IMPLEMENTED  
> **Versi:** 1.0.0  

---

## 1. Menjalankan Sistem Secara Lokal

### A. Prasyarat
- Node.js v20+
- Python 3.12+ (opsional untuk Local AI FastAPI & Ollama)
- Supabase Project / PostgreSQL

### B. Langkah Menjalankan
1. **Instalasi Dependensi Frontend & Backend Node**:
   ```bash
   npm install
   ```
2. **Konfigurasi File `.env`**:
   Salin dari `.env.example` dan sesuaikan parameter:
   ```env
   AI_PROVIDER=mock
   PORT=3001
   EZRAB_AUTH_MODE=trusted
   ```
3. **Menjalankan Server Gateway Backend**:
   ```bash
   npx tsx server/index.ts
   ```
4. **Menjalankan Frontend Vite**:
   ```bash
   npm run dev
   ```

---

## 2. Menjalankan Local AI Service (Python FastAPI & Ollama)

1. Pastikan daemon Ollama berjalan dengan model target:
   ```bash
   ollama run qwen3:8b
   ```
2. Jalankan microservice FastAPI di folder `EZRAB-LOCAL-AI`:
   ```bash
   cd EZRAB-LOCAL-AI
   uvicorn main:app --port 8000 --reload
   ```
