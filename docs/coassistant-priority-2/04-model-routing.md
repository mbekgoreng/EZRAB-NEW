# EZRAB CoAssistant Priority 2 — Model Routing Architecture

## 1. Matriks Kapabilitas Model
Router memilih model AI yang paling tepat berdasarkan jenis beban kerja:
- **SIMPLE_CHAT / GREETING**: Model lokal cepat berbobot ringan.
- **INTENT_CLASSIFICATION**: Rule Engine deterministic berkecepatan sub-milidetik.
- **COMPLEX_PLANNING**: Model penalaran tinggi (reasoning model) dengan context window besar.
- **IMAGE_ANALYSIS**: Model berkemampuan visi komputasi / OCR.
- **LOCAL_PRIVATE**: Ollama atau instance privat lokal tanpa transfer data eksternal untuk data rahasia.
- **STRUCTURED_TOOL_CALLING**: Provider yang mendukung schema function calling formal.

## 2. Circuit Breaker & Automatic Fallback
- Jika model utama mengalami 3 kegagalan beruntun, circuit breaker dibuka selama 60 detik.
- Seluruh permintaan yang masuk selama circuit breaker aktif dialihkan secara otomatis ke model cadangan (fallback model) tanpa memutus alur chat pengguna.
