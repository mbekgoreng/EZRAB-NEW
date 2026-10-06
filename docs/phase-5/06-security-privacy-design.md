# PHASE 5 — VISION AI DED EXTRACTION: SECURITY & PRIVACY DESIGN
**Date:** 14 September 2026  
**Status:** **APPROVED SECURITY DESIGN**  

---

## 1. Multi-Tenant Workspace Isolation

1. **Storage Sandboxing:**
   - File DED diisolasi dalam path khusus tenant: `workspaces/{workspaceId}/projects/{projectId}/ded_files/{fileHash}.pdf`.
   - Akses file divalidasi oleh `OfficialProjectContext` dan Supabase RLS (Row Level Security).
2. **Cross-Tenant Prevention:**
   - Permintaan ekstraksi memvalidasi token JWT sesi aktif. Pengguna dari Workspace A diblokir secara tegas (HTTP 403 Forbidden) dari mengakses atau memproses file milik Workspace B.

---

## 2. PII Redaction & Secret Protection

1. **Document Header Redaction:**
   - Jika dokumen DED memuat informasi sensitif (nama pemilik pribadi, tanda tangan basah, KTP), bounding box metadata tersebut tidak dikirimkan ke model vision cloud eksternal.
2. **Strict Zero-Secret Logging:**
   - Log sistem dilarang mencatat raw base64 string dokumen, API keys, atau token otentikasi.
   - Hanya metadata operasional (`jobId`, `fileHash`, `pageCount`, `durationMs`, `status`) yang disimpan di audit log.

---

## 3. Idempotency & Malware Prevention

1. **SHA-256 Checksum Matching:**
   - Upload file yang identik dalam satu proyek tidak akan memicu pemborosan kuota AI ganda. Sistem mengembalikan cache hasil ekstraksi yang ada.
2. **File MIME & Header Inspection:**
   - Memeriksa magic bytes header file (`%PDF-` untuk PDF, `\x89PNG` untuk PNG) guna mencegah serangan file spoofing atau executable embedding.
