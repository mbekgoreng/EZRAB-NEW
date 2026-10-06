# EZRAB AI CORE — Knowledge Repository Specification (Fase 4)

> **Status:** IMPLEMENTED  
> **Versi:** 1.0.0  
> **Tabel Terkait:** `ai_knowledge_documents`, `ai_knowledge_entries`

---

## 1. Konsep & Struktur Data

Knowledge Repository adalah penyimpanan terpusat untuk seluruh dokumentasi fitur, panduan operasional, glosarium teknik sipil, dan referensi AHSP PUPR.

### Skema Entri Knowledge Base
Setiap entri memuat:
- `id`: Identifier unik (e.g. `kb-rab-001`)
- `document_id`: Relasi ke dokumen sumber
- `category`: Kategori fungsional (`rab`, `qto`, `ahsp`, `kurva_s`, `akun`, `umum`)
- `intent`: Intensi terkait (e.g. `RAB_CREATE`, `VOLUME_CALCULATION`)
- `question`: Pertanyaan kanonikal
- `normalized_question`: Teks pertanyaan yang telah dibersihkan dan dinormalisasi untuk pencarian cepat
- `answer`: Jawaban resmi tervalidasi
- `tone`: Nada penyampaian (`serius`, `humor`, `natural`)
- `keywords`: Array kata kunci indeks
- `is_active`: Status aktif entri

---

## 2. Siklus Hidup Status Knowledge

1. **DRAFT**: Data baru diimpor dari file CSV/JSONL atau diunggah oleh admin.
2. **REVIEW**: Data dalam peninjauan oleh tim ahli QS/Estimator.
3. **APPROVED**: Data telah disetujui keakuratannya.
4. **PUBLISHED**: Data aktif dan digunakan oleh RAG Engine untuk melayani pengguna production.
5. **ARCHIVED**: Data versi lama yang telah digantikan oleh standar baru.

---

## 3. Pemisahan Dataset

- **Knowledge Resmi**: Dokumentasi sistem, SOP, dan AHSP PUPR 2026.
- **Dataset Universal 9.999 Q&A**: Digunakan sebagai seed awal untuk penanganan variasi pertanyaan pengguna.
- **Data Tenant Spesifik**: Dokumen internal organisasi/proyek yang diisolasi ketat menggunakan `workspace_id`.
