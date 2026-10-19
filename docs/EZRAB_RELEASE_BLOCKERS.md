# EZRAB RELEASE BLOCKERS

**Tanggal:** 2026-10-19
**Status:** Belum READY FOR RELEASE — 4 blocker eksternal

---

## Blocker Kritis (menghalangi production)

### B1. Rotasi 8 Secret yang Bocor
- **Prasyarat:** Aksi pemilik di dashboard provider
- **Dampak:** Secret terekspos di 12 branch (residual, diterima user). History main sudah bersih.
- **Variabel:** JWT_SECRET, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, EZRAB_AI_CORE_SERVICE_TOKEN, GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY
- **Keputusan oleh:** Pemilik (dashboard masing-masing provider)
- **Aksi terkecil:** Rotasi via dashboard → update di Vercel env

### B2. AI Provider Keys di Vercel
- **Prasyarat:** Pemilik memverifikasi/menambahkan keys
- **Dampak:** Semua fitur AI return 502 hingga keys tersedia
- **Variabel:** GEMINI_API_KEY_1..6, ZYROUTER_API_KEY, ATRIA_API_KEY_1..14, AI_GATEWAY_TOKEN
- **Keputusan oleh:** Pemilik (Vercel dashboard)
- **Aksi terkecil:** Set keys → test satu AI call

### B3. Backend/VPS Belum Tersedia
- **Prasyarat:** Keputusan pemilik membeli VPS
- **Dampak:** Credits ledger, market search backend, auth production semua BLOCKED
- **Status:** Ditunda hingga VPS dibeli (keputusan owner 2026-10-18)
- **Keputusan oleh:** Pemilik
- **Aksi terkecil:** Beli VPS → berikan host/IP + SSH → audit arsitektur backend

### B4. Auth Production Belum Diuji
- **Prasyarat:** AUTH_ENABLED=true + Supabase dikonfigurasi
- **Dampak:** Login/signup belum terverifikasi end-to-end
- **Keputusan oleh:** Pemilik (kapan mengaktifkan)
- **Aksi terkecil:** Aktifkan flag → buat akun test → verifikasi RLS

---

## Blocker Non-Kritis (tidak menghalangi staging)

### B5. SERPER_API_KEY untuk Market Search
- **Dampak:** Market auto-enrichment tidak live; fallback ke manual
- **Aksi terkecil:** Signup serper.dev (gratis 2.500/bln) → set env

### B6. Production Build Belum Re-run
- **Dampak:** Build terakhir PASS 2026-10-18; perubahan ai-design + copilot belum di-build
- **Diagnosis:** Runtime restart membunuh proses build 4x (build butuh >2 menit untuk modul canonical 16MB)
- **Aksi terkecil:** Jalankan `vite build` di lingkungan stabil (bukan sandbox yang sering restart)

---

## Yang SUDAH Selesai (tidak terblokir)

✅ Integritas harga (23/23)
✅ Design workflow E2E (8/8)
✅ AHSP candidate picker (manual, no auto-map)
✅ Koreksi mapping audit (dinding bata)
✅ tsc clean, unit tests 21/21
✅ Security scan bersih
✅ Dead buttons: nihil
