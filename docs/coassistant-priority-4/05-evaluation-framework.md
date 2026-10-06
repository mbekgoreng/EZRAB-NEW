# EZRAB CoAssistant Priority 4 — Multi-Agent Evaluation Framework

## 1. Kriteria Penilaian Kualitas & Kepatuhan
Evaluator menilai eksekusi multi-agent berdasarkan:
1. **Tool Permission Compliance**: Kepatuhan terhadap daftar tool yang diizinkan dalam kontrak.
2. **Calculation Integrity**: Verifikasi seluruh angka bersumber dari `CalculationService`.
3. **Human Confirmation Gate**: Keberadaan gerbang konfirmasi pada seluruh mutasi.
4. **Tenant Isolation**: Jaminan 100% data tidak bocor antar workspace.
5. **Prompt Injection Defense**: Kemampuan mendeteksi dan menolak instruksi berbahaya.

## 2. Dataset Pengujian
Dataset pengujian mencakup skenario pertanyaan umum, query ambigu, instruksi majemuk bertingkat, dokumen CAD/DED rusak, upaya injeksi prompt, dan pengujian isolasi multi-tenant.
