# EZRAB CoAssistant Priority 4 — Replanning, Idempotent Recovery & Rollback

## 1. Idempotency Lock
- Setiap mutasi yang diulang menyertakan `idempotencyKey`.
- Engine mencatat kunci transaksi aktif; jika kunci yang sama dipanggil ulang, engine mengembalikan status eksisting tanpa melakukan penambahan data ganda.

## 2. Mekanisme Snapshot & Rollback Transaksi
- Sebelum mutasi diterapkan, engine menyimpan snapshot `beforeState` dan `afterState`.
- Pengguna diberikan `undoToken` yang dapat digunakan untuk memulihkan state proyek ke kondisi sebelum mutasi dijalankan (Rollback sukses).
