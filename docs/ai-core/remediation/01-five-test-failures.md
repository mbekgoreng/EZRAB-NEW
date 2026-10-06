# EZRAB AI CORE — Audit Lima Test Failures (Fase 1)

> **Status:** AUDITED  
> **Tanggal:** 14 September 2026  
> **Auditor:** Senior QA Lead, DevOps Lead, AI Systems Architect

---

## 1. Analisis Akar Masalah (Root Cause Analysis)

Pengujian mendalam terhadap 5 file test yang mengalami kegagalan pada audit sebelumnya mengungkap akar masalah berikut:

| No | File Test | Error / Gejala | Root Cause Teknis | Kategori | Solusi Aman |
|---|---|---|---|---|---|
| 1 | `server/test/aiIntentContextIsolation.test.ts` | `❌ FAIL: KB query "Apakah Harga Material Upah Alat?" returns expected canonical answer` | Typo bahasa pada `server/data/knowledgeBaseData.ts:319`: menggunakan kata bahasa Inggris `"components"` alih-alih bahasa Indonesia `"komponen"`. | Code (Data Lexicon) | Koreksi `"components"` menjadi `"komponen"` pada `knowledgeBaseData.ts`. |
| 2 | `server/test/greetingSmallTalk.test.ts` | `❌ FAIL: "Saya belum minum kopi" -> SMALL_TALK (got GENERAL_QUESTION)` | Keyword `"kopi"` pada data humor ID 7 di `knowledgeBaseData.ts:71` terlalu luas sehingga mengintersepsi obrolan santai kopi sebelum masuk aturan `SMALL_TALK`. | Code (Keyword Scope) | Persempit keyword humor menjadi `["tukang ngopi", "tukang yang sedang ngopi"]`. |
| 3 | `server/test/aiBackend.test.ts` | Interseptor `CONFIRMATION_REQUIRED` terlewati | Pada `aiOrchestrator.ts:136`, `autoAnswerEngine` terpanggil untuk seluruh pesan tanpa memeriksa apakah intent merupakan aksi mutasi tulis (`requiresFunction`). | Code (Orchestration Guard) | Lewati AutoAnswer jika `intent.requiresFunction` bernilai `true`. |
| 4 | `server/test/apiEndpoints.test.ts` | Expected project context not called | Query `'status'` satu kata diklasifikasikan sebagai `GENERAL_QUESTION` (zero context), sedangkan test mengharapkan pemanggilan context data proyek resmi (`'status proyek'`). | Test Fixture | Perjelas query pada test case menjadi `'status proyek'` agar konsisten dengan intent `PROJECT_PROGRESS`. |
| 5 | `server/test/authGateway.test.ts` | `Assertion failed: missingProject.status === 404` | Mock `membershipRepository` pada test hanya mengimplementasikan `hasProjectAccess` tanpa metode `resolveProjectAccess`. | Test Fixture | Lengkapi mock `resolveProjectAccess` pada test fixture agar mencerminkan kontrak repository terbaru. |

---

## 2. Rencana Remediasi Bertahap (Fase 2)
1. Perbaikan minimal non-destruktif pada `server/data/knowledgeBaseData.ts`, `server/orchestrator/aiOrchestrator.ts`, dan test fixtures terkait.
2. Eksekusi ulang seluruh 19 test files secara mandiri untuk memverifikasi 100% kelulusan.
