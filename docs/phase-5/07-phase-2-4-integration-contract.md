# PHASE 5 — VISION AI DED EXTRACTION: PHASE 2–4 INTEGRATION CONTRACT
**Date:** 14 September 2026  
**Status:** **APPROVED INTEGRATION CONTRACT**  

---

## 1. End-to-End Integration Flow

```
+---------------------------------------------------------------------------------------------------+
| [PHASE 5: Vision AI DED Extraction]                                                               |
|  - Input: Dokumen Gambar DED / PDF                                                                |
|  - Output: DedExtractionResult (Approved Parameters Record)                                       |
+-------------------------------------------------|-------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| [PHASE 2: Master Building Templates]                                                              |
|  - Matching Algoritma: Memilih template terdekat berdasarkan kategori & tipe bangunan              |
|  - Injeksi Parameter: Memetakan extracted parameters ke parameter keys template resmi              |
+-------------------------------------------------|-------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| [PHASE 3: Parametric Volume Engine]                                                               |
|  - Hitung Volume AHSP & Dimensi WBS secara deterministik (100% Non-Hallucinatory)                 |
|  - Generate CalculationTrace terperinci (Langkah, Rumus, Subtitusi Angka, Total)                   |
|  - Terbitkan Draft RAB dengan status REVIEW_REQUIRED                                              |
+-------------------------------------------------|-------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| [PHASE 4: 3D Parametric Wireframe Viewer]                                                         |
|  - MasterGeometryResolver merender Model 3D interaktif berdasarkan parameter DED yang tervalidasi|
|  - Elemen 3D terhubung langsung dengan kode WBS dan trace volume                                  |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Parameter Mapping Dictionary

| Parameter Hasil Ekstraksi DED | Target Key Template Engine | Target Key 3D Adapter | Validasi Boundary |
|---|---|---|---|
| `buildingWidthM` | `parameters.buildingWidth` | `dimensions.width` | $3.0\text{m} - 30.0\text{m}$ |
| `buildingLengthM` | `parameters.buildingLength` | `dimensions.depth` | $3.0\text{m} - 50.0\text{m}$ |
| `floorCount` | `parameters.floorCount` | `floorCount` (Pelat & Tangga) | $1 - 4$ lantai |
| `floorHeightM` | `assumptions.wall_height` | `wallHeight` | $2.5\text{m} - 5.0\text{m}$ |
| `roofSlopeDeg` | `assumptions.roof_slope_angle` | `roofSlopeDeg` (Atap Pelana) | $15^\circ - 45^\circ$ |
| `roadLengthM` | `parameters.roadLength` | `dimensions.depth` (Jalan) | $10\text{m} - 10,000\text{m}$ |
| `uDitchWidthM` | `parameters.uDitchWidth` | `innerW` (Saluran) | $0.3\text{m} - 2.0\text{m}$ |

---

## 3. Strict Boundary Rules

1. **No Direct RAB Writing:** Vision AI dilarang menulis langsung ke spreadsheet RAB tanpa melalui `ParametricVolumeEngine.calculate()` dan review pengguna.
2. **Deterministic Fallbacks:** Jika suatu detail minor tidak ada dalam DED (misal: tebal spasi semen), engine menggunakan standar SNI / PUPR yang terdokumentasi dalam `template.assumptions` dengan flag `DERIVED`.
