# EZRAB CoAssistant Priority 4 — Adversarial Security & Injection Defense

## 1. Perlindungan Terhadap Prompt Injection
- **Pola Terdeteksi**: Pola pengabaian aturan (`ignore previous instructions`, `abaikan semua aturan`), bypass keamanan (`bypass permissions`), manipulasi database (`drop table`, `select from users`), dan eksfiltrasi rahasia (`reveal api key/token`).
- **Lapisan Pertahanan**: Instruksi yang disisipkan di dalam metadata PDF/DED, chunk RAG, atau pesan chat pengguna disaring dan dinetralisir sebelum mencapai model penalaran.

## 2. Batasan Keras Sistem (Hard Security Boundaries)
- Tidak ada raw SQL yang dapat dieksekusi melalui chat.
- Tidak ada peran (role) atau hak akses yang dapat dimanipulasi dari frontend.
- Seluruh mutasi tunduk pada verifikasi otorisasi backend dan gerbang persetujuan manusia.
