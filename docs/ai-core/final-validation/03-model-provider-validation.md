# EZRAB AI CORE — Model Provider & Fallback Validation (Fase 3)

> **Status:** VERIFIED  
> **Tanggal:** 14 September 2026  
> **Auditor:** AI Systems Architect, Senior DevSecOps Engineer

---

## 1. Validasi Provider & Skenario Kegagalan

| Skenario Uji | Perilaku Aktual Sistem | Status | Bukti / Catatan |
|---|---|---|---|
| **1. Mode Offline / Mock** | Mengembalikan respons deterministik tanpa panggilan jaringan eksternal. | **VERIFIED** | `MockAIProvider` & `UnifiedModelAdapter` mode mock lulus test suite |
| **2. Local Ollama Offline / Mati** | Gateway mendeteksi kegagalan koneksi dan otomatis beralih ke Fallback Provider / AutoAnswerEngine. | **VERIFIED** | `server/api/aiRoutes.ts:301` fallback ke orchestrator internal |
| **3. Request Timeout (> 40s)** | `AbortController` membatalkan request dan mengembalikan error code `AI_CORE_TIMEOUT` dengan flag `retryable: true`. | **VERIFIED** | `src/services/aiApiClient.ts:317`, `aiApiClient.test.ts:TEST 6B` |
| **4. HTTP 502 / Provider Unavailable** | Gateway mengembalikan error terstruktur `502 Bad Gateway` dengan pesan ramah bahasa Indonesia. | **VERIFIED** | `aiApiClient.test.ts:TEST 6A` |
| **5. Rate Limiting (429)** | Gateway membatasi 20 request per menit per IP remote address. | **VERIFIED** | `server/api/aiRoutes.ts:131`, `aiApiClient.test.ts:TEST 6A` |
| **6. Secret Leakage di Response** | Sanitizer membersihkan API key, Bearer token, dan stack trace internal. | **VERIFIED** | `src/services/aiApiClient.ts:120`, `aiApiClient.test.ts:TEST 9` |
| **7. Idempotency Key Caching** | Mencegah duplikasi eksekusi request yang sama dalam jendela waktu 5 menit. | **VERIFIED** | `server/api/aiRoutes.ts:205-213` |

---

## 2. Kepatuhan Keamanan & Biaya Provider

- Tidak ada API key yang dikirim ke browser klien.
- Parameter token limits (`maxTokens`) dan temperature (`0.2`) dikontrol secara terpusat di server.
- Model lokal Ollama berjalan dalam sandbox localhost tanpa akses langsung ke database credentials produksi.
