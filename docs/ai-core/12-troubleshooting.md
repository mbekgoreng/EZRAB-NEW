# EZRAB AI CORE — Troubleshooting & Diagnostics Guide (Fase 29)

> **Status:** IMPLEMENTED  
> **Versi:** 1.0.0  

---

## 1. Panduan Diagnostik & Solusi Masalah

### A. Kendala: `AI_CORE_UNAVAILABLE` atau Timeout 502
- **Gejala**: Chatbox menampilkan pesan "Layanan AI sedang tidak tersedia".
- **Penyebab**: Microservice Python (`localhost:8000`) atau Ollama (`localhost:11434`) sedang offline atau kehabisan VRAM.
- **Solusi**:
  1. Periksa endpoint health check: `GET http://localhost:3001/api/ai/health`.
  2. Pastikan `AI_PROVIDER=auto` atau `AI_PROVIDER=openai` dengan `AI_ENABLE_CLOUD_FALLBACK=true` agar otomatis berpindah ke cloud provider saat service lokal tidak aktif.

### B. Kendala: `AUTH_REQUIRED` atau `PROJECT_NOT_AUTHORIZED`
- **Gejala**: Permintaan chat ditolak dengan kode status 401 atau 403.
- **Penyebab**: Token Bearer Supabase kadaluwarsa atau user bukan anggota proyek yang dipilih.
- **Solusi**: Pastikan user login ulang untuk memperbarui token sesi Supabase.

### C. Kendala: `RATE_LIMITED`
- **Gejala**: Pengguna mengirim pesan terlalu cepat dan mendapat status 429.
- **Solusi**: Tunggu 60 detik atau sesuaikan batas rate limiting di `server/api/aiRoutes.ts`.
