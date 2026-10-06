# EZRAB CoAssistant Priority 4 — Background Job Queue Design

## 1. Siklus Hidup Antrean Job
Background Job Queue menangani beban kerja berat (ekstraksi PDF berhalaman banyak, kalkulasi massal, ekspor multi-halaman):
- `QUEUED`: Job tersimpan dalam antrean dan menunggu alokasi worker.
- `RUNNING`: Job aktif dieksekusi dengan update persentase progres real-time.
- `WAITING_FOR_INPUT`: Job menahan eksekusi menunggu data tambahan dari user.
- `WAITING_FOR_CONFIRMATION`: Job menunggu persetujuan manusia pada langkah mutasi.
- `COMPLETED`: Seluruh tahapan sukses diselesaikan.
- `PARTIALLY_COMPLETED`: Sebagian tahapan selesai dan hasil parsial disimpan.
- `FAILED`: Job mengalami kegagalan teknis (dapat di-retry).
- `CANCELLED`: Job dihentikan atas permintaan pengguna.

## 2. Fitur Kontrol Pengguna
- **Progress Tracking**: Menampilkan tahapan aktif, langkah selesai, dan persentase.
- **Pause / Cancel / Retry**: Pengguna memiliki kendali penuh untuk membatalkan atau mengulang job yang gagal.
