# EZRAB AI CORE — Live Data & Context Builder (Fase 10 & 11)

> **Status:** IMPLEMENTED  
> **Versi:** 1.0.0  
> **Modul Terkait:** `server/orchestrator/contextBuilder.ts`, `server/services/projectDataService.ts`, `server/services/rabDataService.ts`

---

## 1. Prinsip Pengambilan Data Live

Data live aplikasi (total RAB, progres Kurva S, daftar baris pekerjaan, kuota subscription) diambil langsung dari database melalui service layer terverifikasi:
- Tidak pernah mengambil seluruh database ke dalam prompt (*data minimization*).
- Setiap pembacaan data difilter secara ketat berdasarkan `workspace_id` dan `project_id` dari session pengguna.

---

## 2. Token Budgeting & Redaction

`ContextBuilder` menerapkan batas token maksimum (Token Budgeting):
- Ringkasan Proyek & Metrik: maks ~500 token.
- Riwayat Percakapan Terakhir: maks 6 pesan terakhir (~1.000 token).
- Referensi RAG / Knowledge Base: maks ~800 token.
- Redaksi Informasi Sensitif: otomatis menghapus token JWT dan password dari teks sebelum diserahkan ke model LLM.
