# EZRAB AI CORE — STAGING ENVIRONMENT CONTRACT (FASE 4)

**Tanggal:** 14 September 2026  
**Status:** DRAFTED & HARDENED  
**Mode Operasi:** Trusted Auth (`EZRAB_AUTH_MODE=trusted`)  
**Target Lingkungan:** Staging Isolasi Mandiri  

---

## 1. Prinsip Isolasi Lingkungan Staging

Lingkungan Staging EZRAB AI Core dirancang untuk mereplikasi perilaku production secara 1:1 dengan isolasi penuh:

1. **Zero Production Touch:** Database staging menggunakan instance Supabase terpisah (`staging-project-id.supabase.co`). Dilarang keras menghubungkan staging ke connection string production.
2. **Fail-Closed Security Boundary:** Variabel `EZRAB_AUTH_MODE=trusted` wajib aktif. Dalam mode ini, seluruh request tanpa token sesi resmi akan ditolak langsung (HTTP 401 `AUTH_REQUIRED`), dan header identity tiruan (`x-user-id`, `x-user-role`) diabaikan sepenuhnya.
3. **Official Project Context:** Data RAB dan proyek yang dikirimkan ke AI Core FastApi diwajibkan melalui `buildOfficialProjectContext` (dari database server-side), bukan dari payload arbitrary client.

---

## 2. Rincian Variabel Konfigurasi Staging

| Kategori | Nama Variabel | Wajib/Opsional | Nilai Default / Contoh | Deskripsi Keamanan |
|---|---|---|---|---|
| **Core** | `NODE_ENV` | **Wajib** | `staging` | Mengaktifkan optimasi build staging dan isolasi error trace |
| **Core** | `PORT` | **Wajib** | `3000` | Port listen server gateway backend |
| **Auth** | `EZRAB_AUTH_MODE` | **Wajib** | `trusted` | Mengaktifkan verifikasi membership dan token session fail-closed |
| **Auth** | `JWT_SECRET` | **Wajib** | `staging-jwt-secret-xyz...` | Secret key penandatangan token (min. 32 karakter acak) |
| **Database** | `SUPABASE_URL` | **Wajib** | `https://staging-app.supabase.co` | URL endpoint instance staging Supabase |
| **Database** | `SUPABASE_ANON_KEY` | **Wajib** | `eyJhbG...` | Public anon key staging untuk client auth |
| **Database** | `SUPABASE_SERVICE_ROLE_KEY`| **Wajib** | `eyJhbG...` | Private service key untuk query membership server-side |
| **AI Bridge** | `EZRAB_AI_CORE_URL` | **Wajib** | `http://127.0.0.1:8000` | URL internal bridge menuju AI Core FastAPI daemon |
| **AI Bridge** | `EZRAB_AI_CORE_SERVICE_TOKEN`| Opsional | `staging-internal-secret...` | Token otentikasi internal inter-service gateway ke AI Core |
| **AI Bridge** | `EZRAB_AI_CORE_TIMEOUT_MS` | Opsional | `40000` (40 detik) | Timeout perlindungan hang query komputasi |
| **Provider** | `OLLAMA_BASE_URL` | **Wajib** | `http://127.0.0.1:11434` | Endpoint lokal LLM inference engine utama (Qwen 2.5) |
| **Provider** | `GEMINI_API_KEY` | Opsional | `AIzaSy...` | Staging key untuk fallback cloud tier-1 |
| **Provider** | `OPENAI_API_KEY` | Opsional | `sk-proj-...` | Staging key untuk fallback cloud tier-2 |
| **Provider** | `ANTHROPIC_API_KEY` | Opsional | `sk-ant-...` | Staging key untuk fallback cloud tier-3 |
| **Security** | `RATE_LIMIT_MAX_REQUESTS` | Opsional | `60` | Maksimum 60 request per IP per menit |
| **Security** | `ENABLE_PROMPT_SANITIZATION` | **Wajib** | `true` | Sanitasi prompt adversarial dan redaksi PII/secret |

---

## 3. Matriks Verifikasi Kesiapan Staging (Contract Check)

Sebelum staging server dinyalakan, jalankan verifikasi contract berikut:

```bash
# 1. Pastikan file .env.staging telah dibuat dari .env.staging.example
test -f .env.staging || echo "⚠️ .env.staging belum dibuat!"

# 2. Verifikasi mode auth
grep "EZRAB_AUTH_MODE=trusted" .env.staging

# 3. Jalankan suite contract hardening
node scripts/run-calculation-foundation-tests.mjs src/test/aiApiClient.test.ts
node scripts/run-calculation-foundation-tests.mjs server/test/authGateway.test.ts
node scripts/run-calculation-foundation-tests.mjs server/test/apiEndpoints.test.ts
```
