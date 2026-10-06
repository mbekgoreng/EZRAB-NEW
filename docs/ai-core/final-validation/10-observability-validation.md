# EZRAB AI CORE — Observability & Logging Validation (Fase 10)

> **Status:** VERIFIED  
> **Tanggal:** 14 September 2026  
> **Auditor:** DevSecOps Engineer, Site Reliability Engineer

---

## 1. Validasi Structured Logging & Tracing

Setiap request interaksi AI dicatat dengan metadata terstruktur pada tabel `ai_answer_logs` dan log server:
- `request_id`: ID unik untuk korelasi request (e.g. `gw-7d94ee15-...`).
- `conversation_id`: ID percakapan pengguna.
- `user_id` & `workspace_id`: Identitas terisolasi yang divalidasi backend.
- `detected_intent`: Intensi yang terklasifikasi.
- `selected_source`: Sumber kebenaran (`live_data`, `knowledge_base`, `dataset`, `tool`, `fallback`).
- `confidence_score`: Nilai keyakinan (0.00 – 1.00).
- `response_time_ms`: Waktu respons aktual dalam milidetik.
- `tool_called` & `tool_name`: Rekam jejak pemanggilan fungsi.

---

## 2. Kebijakan Redaksi & Sanitasi Log
- Log **tidak pernah** menyimpan password, token JWT, kunci API, atau nomor kartu pembayaran.
- Stack trace kesalahan internal server diringkas menjadi kode error aman (`INTERNAL_ERROR`, `AI_CORE_UNAVAILABLE`).
