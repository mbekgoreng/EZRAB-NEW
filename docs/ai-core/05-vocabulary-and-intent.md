# EZRAB AI CORE — Vocabulary & Intent Engine Specification (Fase 6 & 7)

> **Status:** IMPLEMENTED  
> **Versi:** 1.0.0  
> **Modul Terkait:** `server/services/vocabularyEngine.ts`, `server/orchestrator/intentClassifier.ts`

---

## 1. Vocabulary Engine

Vocabulary Engine memahami kekhasan bahasa konstruksi Indonesia:
- **Istilah Teknik Sipil**: RAB, QTO, DED, AHSP, Bouwplank, Pondasi Tapak/Footplate, Sloof, Kolom Praktis, Ring Balk, Balok Latei, Pasangan Bata Ringan (AAC), Plesteran, Acian, dsb.
- **Singkatan & Akronim**: `sy` -> saya, `u/` -> untuk, `brp` -> berapa, `gmn` -> bagaimana, `bwt` -> buat, `itungin` -> hitung.
- **Toleransi Typo**: Normalisasi otomatis dan pencocokan fonetik/Levenshtein similarity.

---

## 2. Intent Classification Engine

Sistem mengklasifikasikan pesan pengguna ke dalam 35+ intensi terstruktur:

| Kategori | Intensi Utama | Perilaku & Tooling |
|---|---|---|
| **GENERAL** | `GREETING`, `HOW_ARE_YOU`, `SMALL_TALK`, `THANKS`, `GOODBYE` | Respon ramah cepat, zero-credit, tanpa query database. |
| **IDENTITY** | `IDENTITY_QUESTION`, `CAPABILITY_QUESTION` | Menjelaskan peran EZRAB AI tanpa klaim palsu. |
| **RAB** | `RAB_CREATE`, `RAB_EDIT`, `RAB_CALCULATE`, `RAB_SUMMARY`, `RAB_AUDIT` | Membaca database live proyek atau memanggil tool kalkulasi. |
| **QTO** | `QTO_CREATE`, `VOLUME_CALCULATION`, `QTO_CALCULATE` | Menjalankan rumus matematis deterministik geometri. |
| **AHSP** | `AHSP_SEARCH`, `AHSP_INFORMATION`, `PRICE_INFORMATION` | Mengambil data dari master AHSP PUPR 2026. |
| **SCHEDULE** | `KURVA_S`, `TIME_SCHEDULE`, `PROGRESS_UPDATE` | Menampilkan progres fisik atau memperbarui persentase progres. |
| **SECURITY** | `SECRET_DISCLOSURE`, `ROLE_ESCALATION`, `DATA_DESTRUCTION` | Safe Refusal langsung tanpa memanggil LLM. |
