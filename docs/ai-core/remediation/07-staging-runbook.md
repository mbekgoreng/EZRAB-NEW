# EZRAB AI CORE — STAGING DEPLOYMENT RUNBOOK & OPERATIONAL GUIDE (FASE 7)

**Target Environment:** Staging Isolated Instance  
**Rilis Version:** EZRAB AI Core v1.0.0-rc.1  
**Tanggal Penyusunan:** 14 September 2026  

---

## 23-Point Staging Deployment Runbook

### A. Pre-Deployment Phase (Point 1 - 6)
- [ ] **01. Secret Verification:** Pastikan tidak ada secret production yang ada di `.env.staging`. Gunakan hanya staging key.
- [ ] **02. Environment File Preparation:** Salin `.env.staging.example` ke `.env.staging` dan isi token instance staging.
- [ ] **03. Database Boundary Check:** Pastikan `SUPABASE_URL` mengarah ke isolated staging database project.
- [ ] **04. Auth Mode Assertion:** Verifikasi `EZRAB_AUTH_MODE=trusted` telah tersetting aktif.
- [ ] **05. Dependency Audit:** Jalankan `npm ci` untuk memastikan dependensi terinstal secara clean dan reproducible.
- [ ] **06. Local Build Verification:** Jalankan `npm run build` dan `npx tsc --noEmit` untuk memastikan nol error kompilasi.

### B. Automated Test Gate (Point 7 - 10)
- [ ] **07. Foundation Test Gate:** Eksekusi karakterisasi kalkulasi: `node scripts/run-calculation-foundation-tests.mjs src/test/calculationFoundation.characterization.test.ts`.
- [ ] **08. Isolation & Security Gate:** Eksekusi uji isolasi intent & data: `node scripts/run-calculation-foundation-tests.mjs server/test/aiIntentContextIsolation.test.ts`.
- [ ] **09. Auth Gateway Gate:** Eksekusi uji fail-closed auth: `node scripts/run-calculation-foundation-tests.mjs server/test/authGateway.test.ts`.
- [ ] **10. Comprehensive Master Suite:** Eksekusi 25 Section W Acceptance Tests: `node scripts/run-calculation-foundation-tests.mjs server/test/comprehensiveMasterTestSuite.test.ts`.

### C. Deployment & Service Startup (Point 11 - 15)
- [ ] **11. Launch Local AI Core Daemon:** Nyalakan FastAPI AI Core daemon di background (`uvicorn main:app --port 8000`).
- [ ] **12. Launch Node Gateway Service:** Nyalakan server Express/Node bridge (`NODE_ENV=staging node server/index.ts` atau `npm run start`).
- [ ] **13. Health Check AI Core:** Panggil endpoint `GET /api/ai/health` dan pastikan response `status: OK` serta `aiCore: connected`.
- [ ] **14. Ollama Inference Verification:** Uji kueri dasar ke model Qwen 2.5 lokal untuk memverifikasi response latency < 3000ms.
- [ ] **15. Frontend Asset Serving:** Pastikan build Vite frontend dapat melayani antarmuka web tanpa mixed-content warning.

### D. Post-Deployment Functional & Security Verification (Point 16 - 20)
- [ ] **16. Unauthenticated Boundary Check:** Kirim request POST ke `/api/ai/chat` tanpa token auth; pastikan menerima HTTP 401 `AUTH_REQUIRED`.
- [ ] **17. Forged Header Boundary Check:** Kirim request dengan header `x-user-role: SUPER_ADMIN` palsu; pastikan header diabaikan.
- [ ] **18. Small Talk & Humor Latency Check:** Uji sapaan "Halo EZRAB"; pastikan respons muncul instan (< 100ms) tanpa memuat context proyek.
- [ ] **19. RAB Read & Mutate Tool Calling Check:** Uji kueri "Berapa total RAB proyek ini?" dan "Tambahkan pekerjaan plesteran"; pastikan memerlukan konfirmasi sebelum eksekusi.
- [ ] **20. Provider Fallback Drill:** Matikan daemon AI Core sementara; pastikan gateway otomatis jatuh ke fallback rule-based / auto-answer engine tanpa melempar error 500 ke pengguna.

### E. Pilot UAT & Rollback Handover (Point 21 - 23)
- [ ] **21. Estimator Persona UAT:** Estimator menguji pembuatan RAB 10 item, kalkulasi volume QTO, dan pencarian AHSP.
- [ ] **22. Architect / Direksi Persona UAT:** Direksi menguji pembacaan Kurva S, grafik deviasi progres, dan ringkasan eksekutif.
- [ ] **23. Rollback Readiness Sign-Off:** Pastikan prosedur rollback siap dieksekusi dalam < 60 detik jika ditemukan anomali kritis.

---

## 3. Emergency Rollback Plan (< 60 Detik)

Jika terjadi kegagalan sistem pada tahap staging:
1. **Stop Services:** Hentikan proses Node.js dan FastAPI daemon (`pm2 stop all` atau `pkill -f ezrab`).
2. **Revert Environment:** Kembalikan konfigurasi ke build stabil sebelumnya (`git checkout <last-stable-tag>`).
3. **Restart Baseline:** Jalankan service baseline dengan `npm run preview`.
4. **Notify Team:** Kirimkan laporan insiden dan log error ke Release Manager.
