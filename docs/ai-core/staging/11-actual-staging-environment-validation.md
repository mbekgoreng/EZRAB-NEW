# EZRAB AI CORE — VALIDASI ENVIRONMENT STAGING AKTUAL (PHASE 2)

**Tanggal:** 14 September 2026  
**Auditor:** DevOps Lead & DevSecOps Engineer  
**Status Lingkungan:** Codebase Staging-Contract Hardened / Remote Staging Infrastructure Awaiting Provisioning  

---

## 1. Audit Komponen Gateway & AI Core Runtime

| Komponen | Parameter Konfigurasi | Status Verifikasi Kode / Lokal | Status di Live Staging Eksternal |
|---|---|---|---|
| **Node Gateway** | Port 3000, `GET /api/ai/health` | ✅ `VERIFIED_BY_LOCAL_RUNTIME` (Route aktif, fail-closed auth) | 🟡 `REQUIRES_STAGING_HOSTING` |
| **FastAPI AI Core** | Port 8000, `GET /health` | ✅ `VERIFIED_BY_LOCAL_RUNTIME` (Bridge timeout 40s aktif) | 🟡 `REQUIRES_STAGING_HOSTING` |
| **Ollama LLM Daemon** | Port 11434, `127.0.0.1` binding | ✅ `VERIFIED_BY_LOCAL_RUNTIME` (Model `qwen2.5:7b-instruct-q4_K_M`) | 🟡 `REQUIRES_STAGING_GPU_NODE` |
| **Database Staging** | `SUPABASE_URL` terisolasi | ✅ `VERIFIED_BY_STATIC_ANALYSIS` (Template `.env.staging.example` siap) | 🟡 `BLOCKED (Kredensial live staging belum diinjeksi)` |
| **Secrets & Keys** | `.gitignore` protection | ✅ `VERIFIED_BY_STATIC_ANALYSIS` (0 Secret bocor di source code) | ✅ `SECURE` |

---

## 2. Pemeriksaan Keamanan Port & Bindings

1. **Anti-Public Exposure:**
   - Ollama engine hanya boleh mendengarkan pada interface loopback `127.0.0.1:11434`.
   - FastAPI daemon hanya boleh diakses melalui inter-service network internal oleh Node Gateway via `EZRAB_AI_CORE_URL=http://127.0.0.1:8000`.
   - Port 11434 dan 8000 **DILARANG KERAS** dibuka pada security group / firewall publik.
2. **CORS Hardening:**
   - Header `Access-Control-Allow-Origin` dikonfigurasi secara eksplisit pada origin terdaftar di `.env.staging` (misal: `http://localhost:5173`, `https://staging.ezrab.com`), bukan wildcard `*` ketika kredensial sesi digunakan.
3. **Fail-Closed Auth Boundary:**
   - Dalam mode `EZRAB_AUTH_MODE=trusted`, setiap request tanpa bearer token session resmi dari Supabase Auth staging langsung ditolak HTTP 401 `AUTH_REQUIRED`.
   - Header tiruan `x-user-role` atau `x-user-id` dibuang dan tidak diproses.

---

## 3. Panduan Setup Infrastruktur Staging (Checklist DevOps)

Untuk menyalakan staging server fisik nyata:
```bash
# 1. Di server staging (Linux/Ubuntu VM):
git clone <staging-repo-url> /opt/ezrab-staging
cd /opt/ezrab-staging

# 2. Setup environment staging terisolasi
cp .env.staging.example .env.staging
# Edit .env.staging dengan instance Supabase Staging:
# SUPABASE_URL=https://<staging-app-id>.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=<staging-service-key>

# 3. Jalankan Ollama & pull model
ollama run qwen2.5:7b-instruct-q4_K_M

# 4. Build dan jalankan services via process manager
npm ci
npm run build
pm2 start server/index.ts --name ezrab-gateway-staging
```
