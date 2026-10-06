# EZRAB AI CORE — Ingestion Pipeline Specification (Fase 5)

> **Status:** IMPLEMENTED  
> **Versi:** 1.0.0  
> **Modul Terkait:** `server/services/knowledgeDatasetImporter.ts`, `EZRAB-LOCAL-AI/ai/knowledge_ingestion.py`

---

## 1. Alur Pipeline Ingesti

Pipeline ingesti dokumen bertugas memproses data mentah dari berbagai format file menjadi entri knowledge terstruktur dan terindeks:

```
[Upload File] (JSONL, CSV, PDF, XLSX, DOCX)
      │
      ▼
[1. Validasi Format & Ekstensi]
      │
      ▼
[2. Ekstraksi Konten & Tabel] (Teks, Heading, Parameter)
      │
      ▼
[3. Pembersihan & Normalisasi Bahasa] (MessageNormalizer & Typos)
      │
      ▼
[4. Deduplikasi & Checksum SHA-256]
      │
      ▼
[5. Klasifikasi Kategori & Intensi Otomatis]
      │
      ▼
[6. Pembuatan Inverted Index & Metadata]
      │
      ▼
[7. Penyimpanan Status DRAFT / REVIEW]
```

---

## 2. Fitur Keamanan Pipeline

1. **Pemeriksaan Ukuran**: Maksimum payload dibatasi 128 KB untuk JSON API dan 50 MB untuk file PDF / Dokumen DED.
2. **Sanitasi Konten**: Menghapus script berbahaya, karakter non-UTF8, dan pola instruksi berbahaya (prompt injection seeds).
3. **Audit Log Import**: Menyimpan laporan hasil ingesti di tabel `ai_dataset_imports` mencakup total baris, jumlah duplikat, dan ID pengguna pengimpor.
