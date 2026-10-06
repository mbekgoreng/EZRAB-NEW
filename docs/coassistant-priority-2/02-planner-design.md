# EZRAB CoAssistant Priority 2 — Task Planner Design

## 1. Siklus Hidup & Status Task
Task Planner mengurai permintaan kompleks pengguna menjadi grafik asiklik terarah (DAG) dengan status tugas:
- `PENDING`: Tugas menunggu giliran atau dependensi selesai.
- `RUNNING`: Tugas sedang dieksekusi oleh engine/tool.
- `WAITING_FOR_USER`: Menunggu input parameter tambahan dari pengguna.
- `WAITING_FOR_CONFIRMATION`: Menunggu persetujuan manusia untuk tindakan mutasi.
- `COMPLETED`: Tugas selesai sukses.
- `FAILED`: Tugas mengalami kegagalan dan dapat di-retry.
- `CANCELLED`: Seluruh rencana dibatalkan oleh pengguna.

## 2. Contoh Pemecahan Alur Majemuk
Permintaan: *"Buat RAB rumah type 120 dua lantai, buat jadwal, Kurva S, lalu ekspor Excel"* dipecah menjadi:
1. Validasi Proyek & Workspace
2. Resolusi Master Template
3. Pengumpulan Parameter Teknis
4. Perhitungan Volume (QTO)
5. Mapping Koefisien AHSP PUPR
6. Pengambilan Harga Material & Upah
7. Kalkulasi Total Biaya & Pajak
8. Penyusunan Struktur WBS
9. Penyusunan Time Schedule
10. Perhitungan Distribusi Kurva S
11. Preview Rancangan RAB & Jadwal
12. Persetujuan User (Human Confirmation)
13. Ekspor Dokumen Excel
