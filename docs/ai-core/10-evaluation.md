# EZRAB AI CORE — Evaluation Engine & Benchmarking (Fase 22)

> **Status:** IMPLEMENTED  
> **Versi:** 1.0.0  
> **Modul Terkait:** `server/test/comprehensiveMasterTestSuite.test.ts`, `server/test/aiIntentContextIsolation.test.ts`

---

## 1. Metrik Evaluasi Sistem

EZRAB AI Core dievaluasi menggunakan metrik berikut:
1. **Intent Accuracy**: Persentase klasifikasi intensi yang tepat terhadap dataset uji.
2. **Retrieval Precision & Recall**: Ketepatan dan kelengkapan dokumen knowledge yang diambil oleh Hybrid RAG Engine.
3. **Groundedness & Zero Hallucination**: Kemampuan sistem untuk tidak mengarang angka biaya atau volume yang tidak ada di database.
4. **Security Refusal Rate**: Keberhasilan menolak 100% upaya prompt injection, permintaan token, dan pembocoran rahasia.
5. **Latency & Response Time**: Waktu respons sub-millisecond untuk pencarian dataset in-memory dan < 2 detik untuk kalkulasi.

---

## 2. Menjalankan Automated Regression Test

Untuk menjalankan suite evaluasi master secara otomatis:
```bash
node scripts/run-calculation-foundation-tests.mjs server/test/comprehensiveMasterTestSuite.test.ts
node scripts/run-calculation-foundation-tests.mjs server/test/aiIntentContextIsolation.test.ts
```
