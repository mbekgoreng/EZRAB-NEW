# EZRAB AI CORE — CHECKLIST PRASYARAT STAGING FISIK (PHASE 2)

**Tanggal:** 14 September 2026  
**Auditor:** DevOps Lead & Release Manager  
**Status Keseluruhan:** 🟡 **READY_WITH_MISSING_PREREQUISITES**  

---

## 1. Tabel Audit 14 Prasyarat Lingkungan Staging Fisik

| No | Komponen Prasyarat Staging | Status Faktual | Keterangan & Tindak Lanjut |
|---|---|---|---|
| 01 | **Staging Host / VM (Ubuntu/Linux Node)** | ⏸️ **`BLOCKED`** | Menunggu alokasi VM (minimum 4 vCPU, 16 GB RAM, opsi GPU). |
| 02 | **Staging Domain / IP Publik** | ⚪ **`MISSING`** | Menunggu alokasi DNS staging (misal: `staging.ezrab.com` atau IP staging). |
| 03 | **Supabase Staging Project** | ⚪ **`MISSING`** | Menunggu pembuatan project baru terisolasi di Supabase console. |
| 04 | **PostgreSQL Connection String Staging** | ⏸️ **`BLOCKED`** | Menunggu URL connection string pooler staging dari DB admin. |
| 05 | **Staging Environment Variables (`.env.staging`)**| ✅ **`AVAILABLE`** | Template `.env.staging.example` siap disalin dan dikonfigurasi. |
| 06 | **Konfigurasi Auth Mode Staging** | ✅ **`AVAILABLE`** | Mode fail-closed `EZRAB_AUTH_MODE=trusted` siap aktif di gateway. |
| 07 | **FastAPI AI Core Runtime** | ✅ **`AVAILABLE`** | Script startup uvicorn & endpoint bridge siap di codebase. |
| 08 | **Ollama Runtime Engine** | ✅ **`AVAILABLE`** | Engine Ollama didukung dan terintegrasi via port loopback `11434`. |
| 09 | **Model AI (`qwen2.5:7b-instruct-q4_K_M`)** | ✅ **`AVAILABLE`** | Model terdaftar sebagai primary engine pada `unifiedModelAdapter.ts`. |
| 10 | **Reverse Proxy / Gateway Server** | ✅ **`AVAILABLE`** | Node.js Express Gateway siap melayani port `3000`. |
| 11 | **Sertifikat TLS / HTTPS** | ⚪ **`MISSING`** | Menunggu konfigurasi Let's Encrypt / Cloudflare SSL pada domain staging. |
| 12 | **Monitoring & Audit Logging** | ✅ **`AVAILABLE`** | Engine audit log mutasi aktif mencatat ke `public.audit_logs`. |
| 13 | **Destinasi Penyimpanan Backup** | 🟡 **`NOT_VERIFIED`** | Lokasi direktori `/var/backups/ezrab-staging` disiapkan di runbook. |
| 14 | **Restore Target Database Sandbox** | ⏸️ **`BLOCKED`** | Menunggu pembuatan target database sandbox untuk uji restore. |

---

## 2. Ringkasan Status Prasyarat:
- **`AVAILABLE` (Tersedia & Siap di Codebase):** 7 Komponen
- **`MISSING` (Menunggu Konfigurasi Infrastruktur Staging):** 3 Komponen
- **`NOT_VERIFIED` (Perlu Pembuktian Lapangan):** 1 Komponen
- **`BLOCKED` (Tergantung Akses Database/Server Fisik):** 3 Komponen
