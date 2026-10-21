# EZRAB — Production Readiness (Audit 2026-10-20)

## KEPUTUSAN: **PRODUCTION NOT READY**
(Staging: READY — konsisten dengan putusan finalisasi sebelumnya.)

Alasan ringkas: autentikasi nonaktif by design (fase demo), sistem kredit masih simulasi, postur token gateway production belum terverifikasi, dan rotasi secret lama pending. **Production sendiri TERBUKTI MUTAKHIR** (verifikasi langsung 2026-10-20 16:38 WIB: aset bertanggal promosi hari ini, engine-status live "ready") — klaim awal audit soal production basi telah dicabut; lihat Findings Register INF-01/INF-02.

## Blocker production
| # | Blocker | Bukti | Pemilik aksi |
|---|---|---|---|
| B1 | ~~Sinkronisasi ezrab.site~~ **SELESAI/BUKAN MASALAH** — terverifikasi mutakhir 2026-10-20 | — | — |
| B2 | ~~Endpoint /api/* 404~~ **BUKAN MASALAH** — engine-status live 200; fungsi terlayani | — | — |
| B3 | Postur AI_GATEWAY_TOKEN belum terverifikasi; kunci provider BARU (Dahl/River/Gemini-OAI) belum terverifikasi terpasang (endpoint status hanya menghitung Gemini 6 + ZyRouter + Atria 3 — yang SUDAH terkonfigurasi); SERPER belum | SEC-03 konteks | Owner (dashboard Vercel) |
| B4 | Rotasi 8 secret lama belum dilakukan (12 branch non-main tidak di-purge — diterima owner) | Audit keamanan 2026-10-17 | Owner (dashboard provider) |
| B5 | Login OFF; belum ada isolasi data antar-pengguna | SEC-01 | Owner (keputusan aktivasi + uji RLS) |
| B6 | Credits = simulasi; tarif provider NULL; tidak ada ledger | CR-01, CR-02 | Fase 2 backend (menunggu VPS) |
| B7 | (digabung ke B3) | — | — |

## Risiko non-blocker yang harus masuk rencana rilis
- EXP-01 formula Excel (P1, 18 titik) — ekspor adalah deliverable inti estimator; perbaiki sebelum pelanggan berbayar memakai ekspor.
- AI-01 rantai chat (P1) — perilaku produk menyimpang dari yang dijanjikan UI/registry; perbaiki sebelum klaim pemasaran soal model.
- INF-06 ukuran bundle — risiko pengalaman pengguna perangkat lemah. (Catatan: sourcemap production TIDAK aktif — klaim awal dicabut; dependency audit = NEEDS_ACCESS dari mesin owner.)
- INF-06 ukuran bundle — risiko pengalaman pengguna perangkat lemah.

## Staging checklist (untuk menyatakan READY FOR STAGING tetap berlaku)
- [x] tsc 0 error, vite build PASS (heap 8 GB)
- [x] Test engine inti lulus (core 74/74, calculator PASS, integrity 16/16; price 65/67 — 2 fail konflik kebijakan tercatat sebagai RAB-01/AHSP-01)
- [x] Golden recomputation harga 3/3
- [x] Sweep browser 11 route tanpa error halaman
- [x] Perbaikan routing dashboard terverifikasi klik
- [ ] Putuskan kebijakan pembulatan resolver + invariant canonical (RAB-01/AHSP-01) hingga test:price hijau penuh
- [ ] Verifikasi buka-file Excel hasil ekspor (menutup EXP-01 setelah perbaikan)

## Rollback plan (konteks Vercel)
Deployment Vercel bersifat immutable per-commit; rollback = promote ulang deployment READY terakhir yang diketahui baik. Karena production saat ini sudah mutakhir (terverifikasi), prosedur promosi berikutnya cukup: promote build branch terkini → cek hash aset live berubah → cek /api/ai/engine-status merespons dari fungsi → cek header tanggal aset. Database: tidak ada migrasi yang diterapkan pada audit ini; tidak ada yang perlu di-rollback.
