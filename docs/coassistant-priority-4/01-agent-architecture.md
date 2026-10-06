# EZRAB CoAssistant Priority 4 — Specialized Agent Architecture & Contracts

## 1. Taksonomi 11 Agen Spesialis
1. **RabAgent**: Penyusunan RAB, mapping AHSP, subtotal, overhead, profit.
2. **QtoAgent**: Perhitungan volume geometris dan QTO dari elemen yang disetujui.
3. **DedAgent**: Analisis gambar DED, denah, potongan, dan catatan teknis.
4. **ScheduleAgent**: Penjadwalan waktu, dependensi aktivitas, dan durasi pekerjaan.
5. **CurveSAgent**: Monitoring progres fisik, Kurva S rencana vs aktual, peringatan deviasi.
6. **ReportAgent**: Pembuatan laporan eksekutif mingguan/bulanan dan ekspor dokumen.
7. **QcAgent**: Validasi standar SNI, spesifikasi teknis, dan audit kepatuhan AHSP.
8. **CostOptimizationAgent**: Rekomendasi value engineering dan optimasi biaya.
9. **ProjectAssistantAgent**: Navigasi aplikasi dan pencarian metadata proyek.
10. **SecurityReviewAgent**: Pemindaian injeksi prompt, izin peran, dan audit sanitasi input.
11. **EvaluationAgent**: Benchmark kualitas, akurasi kalkulasi, dan pengujian zero-leakage.

## 2. Struktur Kontrak Agen
Setiap agen memiliki batasan:
- `allowedTools`: Daftar eksklusif tool yang boleh dipanggil.
- `allowedRoles`: Peran pengguna yang diizinkan mempekerjakan agen.
- `allowedDomains`: Domain konstruksi (Building, Road, Water, Civil).
- `maxSteps` & `timeoutMs`: Batas langkah (5–15 langkah) dan waktu eksekusi (10–60 detik).
- `budgetLimitTokens`: Batas konsumsi token/kredit.
- `failurePolicy`: `FAIL_SAFE`, `RETRY_IDEMPOTENT`, `FALLBACK_TOOL`, atau `HALT_FOR_USER`.
