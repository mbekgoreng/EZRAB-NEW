# EZRAB CoAssistant Priority 2 — RAG Knowledge & File Pipeline

## 1. RAG Knowledge Base Multi-Tenant
- **Skema Dokumen**: `documentId`, `workspaceId`, `projectId`, `sourceType`, `title`, `version`, `page`, `section`, `effectiveDate`, `accessScope` (`GLOBAL`, `WORKSPACE`, `PROJECT`), `checksum`.
- **Isolasi Akses**: Penyaringan akses dijalankan sebelum pencarian query (pre-retrieval access filtering). Dokumen milik Workspace A tidak pernah terbaca oleh pengguna Workspace B.
- **Citation Metadata**: Setiap hasil retrieval menyertakan kutipan dokumen resmi, nomor halaman, dan versi pedoman.
- **Batasan Non-Authoritative**: RAG dilarang menjadi sumber final angka kalkulasi; angka final selalu dihitung oleh `CalculationService`.

## 2. Pipeline Analisis Berkas Multi-Format
- **Format Didukung**: PDF, Excel (XLSX/XLS/CSV), Word (DOCX), Gambar (JPEG/PNG/WEBP), Teks.
- **Tahapan**: Validasi Ukuran/Tipe (<50MB) ➔ Pemindaian Keamanan & Malware ➔ Ekstraksi Teks / OCR ➔ Segmentasi Halaman & Tabel ➔ Ekstraksi Metadata ➔ Analisis Rekayasa Sipil.
- **Output Terstruktur**: Menampilkan total halaman, halaman sukses/gagal, tingkat confidence, asumsi teknis terperinci, dan daftar poin data yang perlu dikonfirmasi pengguna.
