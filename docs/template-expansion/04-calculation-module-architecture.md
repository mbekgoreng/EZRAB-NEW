# EZRAB — CALCULATION MODULE ARCHITECTURE
## Specialized Engineering Formula Engines for Multi-Disciplinary Estimation

**Status:** AUDIT & DESIGN ONLY — IMPLEMENTATION NOT STARTED  
**Auditor:** Principal Software Architect, Civil Engineering Specialist  
**Date:** 2026-09-14  
**Project:** EZRAB AI — Intelligent Construction Cost Estimation Engine  

---

## 1. Prinsip Pemisahan Mesin Kalkulasi

Menghitung gedung, jalan, dan saluran air menggunakan logika matematis yang berbeda secara fundamental:
- **Gedung**: Berbasis ruang diskrit (*room-based/space-based*), kuantitas luas lantai, keliling dinding, tinggi plafon.
- **Jalan & Perkerasan**: Berbasis segmen linier (*stationing-based*), lapisan struktural (*layering thickness*), dan luas bahu jalan.
- **Pekerjaan Tanah**: Berbasis penampang melintang berjarak (*prismoidal formula / average end area method*), faktor kembang-susut (*bulking/shrinkage factor*).
- **Sumber Daya Air & Drainase**: Berbasis hidrolika (*Manning open channel flow*), kemiringan saluran ($S_0$), debit rencana ($Q$), dan elevasi muka air.
- **Struktur Sipil Khusus**: Berbasis modul bentang (*span-based*), distribusi beban gelagar, dan stabilitas guling/geser dinding penahan tanah.

EZRAB membagi mesin perhitungan menjadi **5 Calculation Modules Mandiri**:

```
                  ┌─────────────────────────────────────┐
                  │    PARAMETRIC VOLUME ENGINE CORE    │
                  └──────────────────┬──────────────────┘
                                     │
     ┌─────────────────┬─────────────┼─────────────┬─────────────────┐
     │                 │             │             │                 │
┌────▼────────┐ ┌──────▼──────┐ ┌────▼──────┐ ┌────▼────────┐ ┌──────▼────────┐
│  Building   │ │   Linear    │ │ Earthwork │ │ Hydraulics  │ │  Geotechnical │
│   Space     │ │  Pavement   │ │ Cut/Fill  │ │  & Drainage │ │ & Structural  │
│   Module    │ │   Module    │ │  Module   │ │   Module    │ │    Module     │
└─────────────┘ └─────────────┘ └───────────┘ └─────────────┘ └───────────────┘
```

---

## 2. Rincian Modul Perhitungan

### A. Building Space Module (`BuildingSpaceCalculator`)
Digunakan untuk: Hotel, Rumah Sakit, Kantor, Sekolah, Masjid, Gedung Serbaguna, Gudang.

**Formula Kunci:**
1. **Luas Lantai Efektif ($A_{net}$)**:
   $$A_{net} = \sum_{i=1}^n (L_i \times W_i)$$
2. **Luas Dinding Pasangan Bersih ($A_{wall}$)**:
   $$A_{wall} = \left(\sum K_{keliling} \times H_{dinding}\right) - \sum A_{bukaan\_pintu\_jendela}$$
3. **Volume Kolom & Balok**:
   $$V_{beton} = (b_k \times h_k \times H_k \times N_k) + (b_b \times h_b \times L_b)$$
4. **Pembesian Struktural (Estimasi Rasio Standar SNI)**:
   $$W_{besi} = V_{beton} \times \rho_{reinforce} \quad (\text{kg/m}^3, \text{misal: } 120\text{--}180\text{ kg/m}^3 \text{ untuk gedung bertingkat})$$

---

### B. Linear Pavement Module (`LinearPavementCalculator`)
Digunakan untuk: Jalan Aspal, Perkerasan Lentur, Jalan Beton, Trotoar, Rehabilitasi Jalan.

**Formula Kunci:**
1. **Volume Lapisan Perkerasan Bergradasi ($V_{layer}$)**:
   $$V_{layer} = L_{trase} \times W_{badan} \times t_{nominal}$$
2. **Tonase Aspal Panas (Hotmix Asphalt Binder/Wearing Course)**:
   $$W_{asphalt\_ton} = L_{trase} \times W_{badan} \times t_{asphalt} \times \gamma_{hotmix} \times (1 + W_{loss})$$
   *(dengan $\gamma_{hotmix} = 2.30\text{--}2.35\text{ ton/m}^3$, dan faktor susut/loss $W_{loss} = 3\text{--}5\%$)*
3. **Volume Prime Coat / Tack Coat ($Liter$)**:
   $$Q_{prime} = L_{trase} \times W_{badan} \times R_{spray} \quad (R_{spray} = 0.8\text{--}1.2\text{ Liter/m}^2)$$
4. **Volume Bahu Jalan Agregat Kelas B**:
   $$V_{bahu} = L_{trase} \times (W_{bahu\_kiri} + W_{bahu\_kanan}) \times t_{bahu}$$

---

### C. Earthwork Cut/Fill Module (`EarthworkVolumeCalculator`)
Digunakan untuk: Cut & Fill Lahan, Trase Jalan Tol, Tanggul Bendungan, Kolam Retensi.

**Formula Kunci:**
1. **Metode Rata-Rata Penampang Ujung (Average End Area Method)**:
   $$V_{galian} = \sum_{j=1}^{m-1} \left( \frac{A_{cut, j} + A_{cut, j+1}}{2} \right) \times \Delta L_j$$
2. **Koreksi Prismoidal (Prismoidal Formula untuk Akurasi Tinggi)**:
   $$V_{prismoidal} = \frac{\Delta L}{6} \times (A_1 + 4A_m + A_2)$$
3. **Faktor Kembang-Susut Tanah (Bulking & Shrinkage Factors)**:
   $$V_{timbunan\_padat} = \frac{V_{galian\_lepas}}{F_{swell}} \times F_{compaction}$$
   *(Lempung: $F_{swell} \approx 1.25$, $F_{compaction} \approx 0.85$; Pasir/Kerikil: $F_{swell} \approx 1.10$, $F_{compaction} \approx 0.95$)*

---

### D. Hydraulics & Drainage Module (`HydraulicsDrainageCalculator`)
Digunakan untuk: Saluran Terbuka, Trapesium, U-Ditch, Box Culvert, Spillway, Intake.

**Formula Kunci:**
1. **Geometri Penampang Trapesium**:
   - Luas Penampang Basah ($A$): $A = (b + m \cdot h) \cdot h$
   - Keliling Basah ($P$): $P = b + 2h\sqrt{1 + m^2}$
   - Jari-Jari Hidrolis ($R$): $R = \frac{A}{P}$
2. **Kapasitas Debit Aliran (Persamaan Manning)**:
   $$Q = \frac{1}{n} \cdot A \cdot R^{2/3} \cdot S_0^{1/2}$$
   *(dengan $n$ koefisien kekasaran Manning: Pasangan Batu $n=0.020$, Beton Halus $n=0.013$)*
3. **Volume Pasangan Dinding Saluran**:
   $$V_{pasangan} = 2 \times L_{saluran} \times \left(h \sqrt{1 + m^2}\right) \times t_{dinding}$$
4. **Volume Galian Saluran Bersih**:
   $$V_{galian\_saluran} = L_{saluran} \times \left[(b + 2t_{dinding} + 2t_{clearance}) + m(h + f)\right] \times (h + f)$$
   *(dengan $f = \text{tinggi jagaan/freeboard}$)*

---

### E. Geotechnical & Structural Module (`GeotechStructuralCalculator`)
Digunakan untuk: Dinding Penahan Tanah (Retaining Wall), Bronjong, Tiang Pancang, Jembatan.

**Formula Kunci:**
1. **Volume Dinding Penahan Tanah Gravitasi Trapesium**:
   $$V_{retaining\_wall} = L \times \left( \frac{b_{atas} + b_{dasar}}{2} \right) \times H$$
2. **Volume Filter Kerikil & Ijuk Belakang Dinding**:
   $$V_{filter} = L \times H \times t_{filter\_layer} \quad (t_{filter} = 0.30\text{--}0.50\text{ m})$$
3. **Jumlah Titik Pipa Suling Drainase (Weep Holes)**:
   $$N_{weep} = \text{ceil}\left( \frac{L \times H}{\text{Interval Area (misal } 2.0\text{ m}^2)} \right)$$
4. **Volume Balok Gelagar Jembatan (I-Girder)**:
   $$V_{girder} = N_{girder} \times A_{penampang\_girder} \times L_{bentang}$$

---

## 3. Isolasi Deterministik & Audit Tracing

Setiap perhitungan di atas wajib menghasilkan objek **`CalculationTrace[]`** yang mencantumkan:
- Nama rumus dan parameter input awal.
- Nilai substitusi matematis eksplisit.
- Nilai intermediate step.
- Hasil pembulatan desimal standar (Volume: 2 desimal, Pembesian: 2 desimal, Harga: 0 desimal).

Engine **dilarang keras** menggunakan fungsi `Math.random()` atau nilai heuristik tanpa catatan transparansi pada `CalculationTrace`.
