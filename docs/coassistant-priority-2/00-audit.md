# EZRAB CoAssistant Priority 2 — Audit & Baseline Architecture

## 1. Scope & Purpose
Audit baseline kapabilitas intelijen CoAssistant mencakup:
- Mekanisme conversation context yang sebelumnya terikat parsial pada database tanpa TTL dan versioning dinamis.
- Ketiadaan DAG Task Planner yang memecah perintah majemuk seperti *"Buat RAB rumah, susun Kurva S, dan ekspor Excel"*.
- Pengambilan knowledge base yang sebelumnya tercampur antar tenant tanpa filter scope eksplisit.
- Pipeline pemrosesan berkas PDF/Excel/gambar tanpa segmentasi halaman dan pelaporan progres bertahap.
- Ketergantungan pemanggilan model tunggal tanpa circuit breaker atau matriks kapabilitas.

## 2. Temuan & Solusi Terpasang
- **Context Resolver**: Terpasang dengan TTL (default 2 jam), versioning incremental, dan validasi kepemilikan proyek/workspace di layer backend.
- **Task Planner**: Mampu mengurai instruksi majemuk menjadi urutan sub-task dengan status dependensi, retry policy, dan gerbang konfirmasi manusia.
- **RAG Knowledge Base**: Dilengkapi isolasi multi-tenant level database, citation metadata resmi (PUPR 2026, Petunjuk Template, Pembayaran QRIS), serta batasan non-authoritative untuk angka kalkulasi.
- **File Pipeline**: Mendukung segmentasi per-halaman, pencatatan asumsi teknik sipil, dan penolakan file raksasa (>50MB).
- **Model Router**: Routing berbasis jenis tugas (chat, klasifikasi, planning, visi) dilengkapi circuit breaker threshold 3 kegagalan dan automatic fallback.
