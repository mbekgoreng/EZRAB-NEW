# Dasbor Rekayasa AI EZRAB (internal)

- Audit terakhir: 2026-11-06T03:46:54.981Z
- Status: 🟡 Ada cacat non-critical
- Kasus regresi lulus: 9/9
- Akurasi ekstraksi kolom: 100%
- Cacat terbuka: 1 (CRITICAL 0 · MAJOR 0 · MINOR 1)
- Integritas AHSP/harga pada builder spek: 🟢 terverifikasi pada probe
- Latensi provider / biaya AI live / ketersediaan model: **TIDAK TERSEDIA** (tidak diukur dari lingkungan ini — tidak dikarang)
- Jadwal: audit berjalan via cron malam Muse (read-only) + workflow CI yang disiapkan di .github/workflows/ai-audit.yml (aktif setelah di-push dengan grant)
- Tindakan butuh persetujuan: setiap perubahan pada data AHSP resmi, mesin keuangan, konversi satuan, billing, pembayaran, auth, skema DB, deployment produksi (safetyGate.ts)
