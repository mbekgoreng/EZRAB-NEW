# EZRAB CoAssistant Priority 3 — Field Photo Progress Monitoring & 3D Viewer

## 1. Analisis Progres Foto Lapangan
- **Deteksi Objek Visual**: Mengenali elemen struktur aktif (kolom, balok, bekisting, dinding).
- **Status Non-Final**: Laporan foto lapangan strictly berstatus `OBSERVATION (NOT VERIFIED)` dan `REQUIRES_SITE_ENGINEER_REVIEW`.
- **Disclaimer Hukum & Finansial**: AI tidak boleh mengklaim progres aktual atau menerbitkan sertifikat pembayaran termin hanya dari analisa foto tanpa persetujuan Site Engineer.

## 2. Jembatan Integrasi 3D Viewer
- Menghubungkan model 3D CAD/BIM ke item baris RAB melalui `stableId`.
- Setiap elemen 3D memuat: identitas elemen, dimensi geometris ($L \times W \times T$), kode item RAB terkait, uraian pekerjaan, dan referensi detail gambar DED sumber.
- Beroperasi dalam mode read-only aman (`isLocked: true`).
