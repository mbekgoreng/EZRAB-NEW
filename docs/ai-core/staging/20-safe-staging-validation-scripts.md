# EZRAB AI CORE — DOKUMENTASI SCRIPT VALIDASI STAGING NON-DESTRUKTIF (PHASE 3)

**Tanggal:** 14 September 2026  
**Auditor:** DevOps Lead & Release Manager  
**Prinsip Script:** Read-Only, Zero Data Mutation, Zero Secret Leakage, Clear Exit Codes  

---

## 1. Daftar Script Validasi Staging (`scripts/staging/`)

| Script File | Tujuan & Cakupan Validasi | Karakteristik Keamanan | Perintah Eksekusi |
|---|---|---|---|
| `validate-staging-health.mjs` | Memeriksa ketersediaan service Node Gateway (port 3000), AI Core (port 8000), dan Ollama (port 11434). | Read-only HTTP request, timeout 4 detik per target, tanpa modifikasi state. | `node scripts/staging/validate-staging-health.mjs` |
| `validate-staging-env.mjs` | Memverifikasi kelengkapan dan format variabel staging (`NODE_ENV`, `EZRAB_AUTH_MODE`, `SUPABASE_URL`, dll.). | Menyembunyikan dan menyamarkan secret/token, zero logging sensitive data. | `node scripts/staging/validate-staging-env.mjs` |

---

## 2. Karakteristik & Jaminan Keamanan Script

1. **Non-Destructive:** Tidak ada operasi `DROP`, `DELETE`, `TRUNCATE`, `UPDATE`, ataupun migrasi skema yang dijalankan.
2. **Zero Secret Exposure:** Seluruh variabel berkategori rahasia (seperti service keys, JWT secret) dimasking `****` dan hanya menampilkan verifikasi panjang karakter/format regex.
3. **Deterministik:** Menghasilkan exit code `0` untuk sukses dan `1` jika terdapat fatal exception.
4. **Isolasi Penuh:** Script tidak pernah memanggil endpoint database production.
