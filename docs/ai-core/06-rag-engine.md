# EZRAB AI CORE — Hybrid RAG Engine Specification (Fase 9)

> **Status:** IMPLEMENTED  
> **Versi:** 1.0.0  
> **Modul Terkait:** `server/services/hybridRagEngine.ts`, `server/services/autoAnswerEngine.ts`

---

## 1. Multi-Tier Retrieval Pipeline

Hybrid RAG Engine mengombinasikan 4 layer pencarian untuk akurasi maksimal:

```
[Query Masuk]
      │
      ├─► Tier 1: Exact Hash Match O(1) ──(Confidence: 1.00)──► [Direct Canonical Answer]
      │
      ├─► Tier 2: Token Inverted Index with Stopword & IDF ──(Confidence: 0.85 - 0.98)──► [Ranked Context]
      │
      ├─► Tier 3: Typo-Tolerant Levenshtein Fuzzy Match ──(Confidence: 0.70 - 0.84)──► [Qualified Context]
      │
      └─► Tier 4: Fallback / Clarification Request ──(Confidence < 0.65)──► [Friendly Topic Suggestions]
```

---

## 2. Tingkat Keyakinan (Confidence Scoring)

- **Tinggi (>= 0.85)**: Sistem memberikan jawaban langsung berdasarkan dokumen resmi atau dataset terverifikasi.
- **Sedang (0.65 - 0.84)**: Sistem memberikan jawaban terbaik dengan catatan penjelasan dan menyarankan klarifikasi bila diperlukan.
- **Rendah (< 0.65)**: Sistem secara transparan menyatakan belum menangkap pertanyaan secara tepat, dan menampilkan daftar topik panduan yang dapat dipilih pengguna.

---

## 3. Format Penyerahan Konteks

Konteks yang diambil diformat dalam Markdown ringkas (*token budget aware*), lengkap dengan referensi sumber dokumen dan kategori teknis agar model tidak berhalusinasi.
