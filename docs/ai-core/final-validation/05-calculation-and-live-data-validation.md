# EZRAB AI CORE — Calculation & Live Data Validation (Fase 5)

> **Status:** VERIFIED  
> **Tanggal:** 14 September 2026  
> **Auditor:** Principal Software Architect, Database Reliability Engineer

---

## 1. Invarian Deterministik Mesin Hitung

Perhitungan biaya dan volume tidak diserahkan ke model bahasa (LLM), melainkan dikerjakan oleh `CalculationService` dan `DecimalEngine` (`SafeDecimal` berbasis `decimal.js`).

### Hasil Uji Invarian Matematis:
1. **Basic Item Multiplication**: `10 × 100,000 = 1,000,000` (**PASS**).
2. **Decimal Quantity & Unit Price**: `12.75 × 1,235,000 = 15,746,250` (**PASS**).
3. **Zero Volume / Zero Unit Price**: Tetap `0` tanpa anomali `NaN` atau pembagian nol (**PASS**).
4. **Large Estimate Precision**: Total hingga miliaran rupiah tetap presisi tanpa kehilangan presisi floating-point IEEE-754 (**PASS**).
5. **Overhead, Profit & PPN/PPh**: Dihitung secara eksplisit berdasarkan persentase kebijakan tanpa angka tersembunyi (**PASS**).
6. **Perhitungan Volume Geometri**: `2 × 3 × 4 × 2 titik = 48 m³` (**PASS**).

---

## 2. Integritas Data Live vs LLM
- Saat user menanyakan *"Berapa total RAB proyek saya?"*, sistem mengambil angka riil dari database live melalui `projectDataService` dan `rabDataService`.
- Model LLM tidak diizinkan menciptakan angka estimasi baru tanpa data masukan yang jelas.
