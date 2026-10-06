# EZRAB — PHASE 7: DRAINAGE QUANTITY CALCULATOR PACK
## PRE-IMPLEMENTATION GAP AUDIT & ARCHITECTURAL BLUEPRINT

**Dokumen Acuan:** `EZRAB_CIVIL_CALCULATOR_UNIVERSE_MASTER_BLUEPRINT.md` (Section 6: Drainage Calculator Pack)  
**Tujuan Dokumen:** Mengidentifikasi kapabilitas existing, gap analisis, risiko duplikasi kepemilikan kuantitas (ownership), serta strategi penggunaan kembali (reuse) vs penambahan engine untuk Phase 7 (Drainage Calculator Pack).  
**Scope Boundary:** HANYA QUANTITY TAKEOFF geometris dan material ($m, m', m^2, m^3, \text{unit}$). DILARANG melakukan hydraulic sizing, analisis Manning, debit banjir rencana, kemiringan hidraulik, daya tampung, atau penentuan diameter pipa otomatis tanpa input DED eksplisit.

---

## 1. EXISTING GENERIC ENGINES AUDIT

| Engine Existing | Lokasi File | Status Kesiapan untuk Drainage | Strategi Phase 7 |
| :--- | :--- | :--- | :--- |
| `SafeDecimalEngine` | `src/engine/calculatorCore/math/safeDecimalEngine.ts` | **100% Ready** | **REUSE** untuk seluruh kalkulasi aritmatika deterministik sub-milimeter tanpa floating drift. |
| `ValidationEngine` | `src/engine/calculatorCore/validation/validationEngine.ts` | **100% Ready** | **REUSE** untuk validasi skema parameter input (required, min, max, non-negative). |
| `PrecisionEngine` | `src/engine/calculatorCore/precision/precisionEngine.ts` | **100% Ready** | **REUSE** untuk enforce parsing numerik, batas toleransi, dan format output. |
| `ProvenanceEngine` | `src/engine/calculatorCore/provenance/provenanceEngine.ts` | **100% Ready** | **REUSE** untuk melacak formula, metadata spesifikasi teknis (SNI / Bina Marga), dan status audit. |
| `CoreCalculatorRegistry` | `src/engine/calculatorCore/registry/calculatorRegistry.ts` | **100% Ready** | **REUSE** untuk mendaftarkan pack `drainage` dan namespace `drainage.*`. |
| `QTOAdapter` | `src/engine/calculatorCore/adapters/qtoAdapter.ts` | **100% Ready** | **REUSE** untuk mengonversi hasil kalkulator menjadi line-item QTO proyek dengan `projectId` fail-closed. |
| `RoadElementsEngine` | `src/engine/calculatorCore/road/engines/roadElementsEngine.ts` | **Partial (Spesifik Jalan)** | **EXTEND / DECOUPLE** ke `ChannelSectionEngine` murni untuk mendukung geometri drainase umum di luar trase jalan. |
| `RoadEarthworkEngine` | `src/engine/calculatorCore/road/engines/roadEarthworkEngine.ts` | **Partial** | **REUSE / EXTEND** untuk galian dan timbunan trase drainase linier. |
| `ReinforcementEngine` | `src/engine/calculatorCore/residential/engines/reinforcementEngine.ts` | **100% Ready** | **REUSE** untuk pembesian box culvert, manhole, headwall, dan concrete drain. |
| `FormworkEngine` | `src/engine/calculatorCore/residential/engines/formworkEngine.ts` | **100% Ready** | **REUSE** untuk bekisting struktur drainase cor di tempat (cast-in-situ). |

---

## 2. EXISTING DRAINAGE-RELATED CALCULATORS AUDIT

Saat ini sistem telah memiliki 2 kalkulator drainase di pack jalan (Phase 6):
1. `road.side_ditch` — Menghitung galian tanah saluran samping trapesium/persegi dan volume pasangan batu/lining.
2. `road.road_drainage` — Menghitung saluran drainase jalan persegi beton bertulang.

**Kelemahan & Keterbatasan:**
- Kalkulator jalan tersebut terikat pada konteks trase jalan (`road.*`).
- Belum mendukung tipe saluran umum seperti:
  - U-Ditch precast + cover
  - Box Culvert (single/multiple cell)
  - Pipe Culvert (gorong-gorong pipa beton/HDPE/corrugated steel)
  - Circular Pipe drain
  - Manhole / Bak Kontrol
  - Catch Basin & Inlet/Outlet
  - Headwall & Wingwall
  - Pasangan Batu Saluran Drainase (Masonry Drain)
  - Lapisan Bedding (Pasir urug / Lean concrete)
  - Backfill galian saluran (Galian minus volume fisik struktur)

---

## 3. PIPE & CULVERT ENGINES AUDIT

- **Existing:** Belum ada generic `PipeEngine` atau `CulvertEngine` di sistem.
- **Kebutuhan Phase 7:**
  - `DrainagePipeEngine`: Menghitung volume galian trench, volume bedding pasir, luas selimut luar/dalam pipa, volume beton pipa silinder, dan jumlah sambungan (joint socket/spigot).
  - `CulvertEngine`: Menghitung geometri box culvert (internal void, dinding luar, slab atas, slab bawah, volume beton bersih, luas bekisting dalam/luar, dan volume galian/backfill).

---

## 4. CHANNEL & SECTION ENGINES AUDIT

- **Existing:** Formula penampang trapesium dan persegi sudah diuji di `RoadElementsEngine`.
- **Kebutuhan Phase 7:**
  - `DrainageChannelEngine`: Engine terpadu untuk:
    - Saluran Persegi (Rectangular Channel)
    - Saluran Trapesium (Trapezoidal Channel)
    - Saluran Segitiga (V-Ditch)
    - Saluran Setengah Lingkaran (Semi-circular Channel)
    - U-Ditch Precast (menghitung jumlah segmen, mortar joint, dan handling weight jika ada data produk).

---

## 5. CONCRETE, REINFORCEMENT & FORMWORK ENGINES AUDIT

- **Existing Kesiapan:**
  - `ReinforcementEngine` (dari Phase 5 Residential) sudah mampu menghitung rasio penulangan ($kg/m^3$) atau pembesian batang terinci ($D, \text{spacing}, \text{panjang penyaluran}$).
  - `FormworkEngine` (dari Phase 5) sudah mampu menghitung kontak permukaan bekisting vertikal dan horizontal.
- **Strategi Phase 7:**
  - Komponen drainase monolit (Box Culvert cast-in-place, Headwall, Wingwall, Manhole cor) akan langsung memanggil `ReinforcementEngine` dan `FormworkEngine` tanpa menduplikasi logika pembesian.

---

## 6. EXCAVATION, BACKFILL & BEDDING ENGINES AUDIT

- **Risiko Utama:** Duplikasi volume galian tanah dan urugan kembali.
- **Prinsip Anti-Duplikasi Phase 7:**
  - $V_{\text{excavation}} = \text{Lebar Galian Trench} \times \text{Kedalaman Rata-rata} \times \text{Panjang}$.
  - $V_{\text{bedding}} = \text{Lebar Galian} \times \text{Tebal Bedding} \times \text{Panjang}$.
  - $V_{\text{occupied}} = \text{Volume Fisik Struktur Luar Saluran/Pipa/Box}$.
  - $V_{\text{backfill}} = V_{\text{excavation}} - V_{\text{bedding}} - V_{\text{occupied}}$.
  - $V_{\text{disposal}} = V_{\text{excavation}} - V_{\text{backfill}}$ (atau $V_{\text{occupied}} + V_{\text{bedding}}$).
- Mengintegrasikan kalkulasi ini ke dalam `DrainageEarthworkEngine` deterministik agar backfill dan disposal konsisten secara matematis.

---

## 7. TARGET 22 DRAINAGE CALCULATOR CAPABILITIES (PHASE 7)

Sesuai `EZRAB_CIVIL_CALCULATOR_UNIVERSE_MASTER_BLUEPRINT.md` Section 6:

1. `drainage.open_channel` — Saluran terbuka umum ($m', m^2, m^3$).
2. `drainage.rectangular_channel` — Saluran terbuka persegi beton/pasangan ($m', m^3$).
3. `drainage.trapezoidal_channel` — Saluran terbuka trapesium pasangan batu/tanah ($m', m^3$).
4. `drainage.u_ditch` — Saluran U-Ditch precast + jointing ($m', \text{buah}$).
5. `drainage.box_culvert` — Gorong-gorong persegi beton bertulang (Box Culvert) ($m', m^3$).
6. `drainage.pipe_culvert` — Gorong-gorong pipa beton bertulang (RCP) ($m', \text{buah}$).
7. `drainage.circular_pipe` — Pipa drainase sirkular (beton/PVC/HDPE) ($m', m^3$).
8. `drainage.manhole` — Bak kontrol / manhole drainase ($\text{unit}, m^3$).
9. `drainage.catch_basin` — Catch basin penampung limpasan ($\text{unit}, m^3$).
10. `drainage.inlet` — Struktur inlet saluran masuk drainase ($\text{unit}, m^3$).
11. `drainage.outlet` — Struktur outlet pembuangan drainase ($\text{unit}, m^3$).
12. `drainage.headwall` — Dinding kepala gorong-gorong ($m^3$).
13. `drainage.wingwall` — Dinding sayap pengarah aliran ($m^3, m^2$).
14. `drainage.cover` — Tutup saluran beton (U-Ditch cover / slab cover) ($\text{buah}, m^2$).
15. `drainage.grating` — Kisi-kisi besi / steel grating penutup saluran ($m^2, \text{buah}$).
16. `drainage.concrete_drain` — Saluran drainase beton cor di tempat ($m', m^3$).
17. `drainage.masonry_drain` — Saluran drainase pasangan batu kali ($m', m^3$).
18. `drainage.lining` — Lapis lindung / lining saluran beton/mortar ($m^2, m^3$).
19. `drainage.bedding` — Landasan pasir / lean concrete bawah saluran ($m^3$).
20. `drainage.backfill` — Urugan tanah kembali sisi saluran/gorong-gorong ($m^3$).
21. `drainage.excavation` — Galian tanah jalur drainase ($m^3$).
22. `drainage.disposal` — Buangan tanah sisa galian drainase ($m^3$).

---

## 8. DUPLICATE OWNERSHIP & PROJECT ISOLATION MATRIX

| Entity Kind | Authoritative Producer | Consumer / Reference | Ownership Key Scheme |
| :--- | :--- | :--- | :--- |
| Galian Saluran | `drainage.excavation` / `drainage.open_channel` | `road.earthwork` (jika roadside) | `projectId::drainageEntityId::EXCAVATION::segmentId` |
| Urugan Kembali | `drainage.backfill` | QTO Summary | `projectId::drainageEntityId::BACKFILL::segmentId` |
| Struktur Saluran | `drainage.u_ditch` / `drainage.box_culvert` | `drainage.concrete_drain` | `projectId::drainageEntityId::STRUCTURE::segmentId` |
| Tutup / Grating | `drainage.cover` / `drainage.grating` | `drainage.open_channel` | `projectId::drainageEntityId::COVER::segmentId` |
| Manhole / Bak Kontrol | `drainage.manhole` | QTO Point Features | `projectId::drainageEntityId::MANHOLE::nodeId` |

---

## 9. PROVENANCE & SOURCE POLICY FOR DRAINAGE

- **Acuan Standar Teknis:**
  - SNI 03-2401-1991 (Tata Cara Perencanaan Drainase Permukaan Jalan)
  - Pedoman Desain Drainase Jalan Pd T-02-2006-B (Departemen PU)
  - Spesifikasi Umum Bina Marga 2018 Divisi 2 (Drainase)
- **Aturan Ketat Non-Geometri:**
  - Dilarang mengasumsikan koefisien pengaliran ($C$), waktu konsentrasi ($tc$), intensitas hujan ($I$), debit rencana ($Q$), atau koefisien kekasaran Manning ($n$).
  - Semua kalkulasi murni menghasilkan dimensi fisik, luas galian/pasangan, volume beton/material, dan unit precast.
  - Parameter berat grating ($kg$) atau kapasitas angkat wajib meminta input eksplisit atau referensi produk resmi, jika tidak ada diberi status `NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE`.

---

## 10. UI & REGISTRY INTEGRATION PLAN

- **Registry:** Mendaftarkan 22 kalkulator di bawah pack `drainage` dan `CONSTRUCTION_CALCULATORS`.
- **UI Navigation:**
  - Menambahkan kategori baru `🌊 H. DRAINAGE & SALURAN (22 items)` pada `QtoCalculatorView.tsx`.
  - Filter pill, dynamic search, form input interaktif, breakdown volume, provenance modal, dan direct QTO sync.
- **Total Kalkulator Sistem Pasca Phase 7:**
  - Legacy (24) + Residential (30) + Road (39) + Drainage (22) = **115 Calculators**.

---

## 11. AUDIT CONCLUSION & NEXT STEPS

- **Status Audit:** `COMPLETE & APPROVED FOR IMPLEMENTATION`.
- **Action Plan Phase 7:**
  1. Buat generic engines: `DrainageChannelEngine`, `DrainageCulvertEngine`, `DrainagePipeEngine`, `DrainageAppurtenancesEngine`, `DrainageEarthworkEngine`.
  2. Implementasikan 22 kalkulator definisi di `src/engine/calculatorCore/drainage/`.
  3. Daftarkan di `CoreCalculatorRegistry` dan `constructionCalculators/registry.ts`.
  4. Tambahkan kategori `DRAINAGE` di `QtoCalculatorView.tsx`.
  5. Buat test suite komprehensif di `src/test/phase7DrainageCalculators.test.ts` (minimal 20 golden vectors).
  6. Verifikasi tsc, npm run test:all, npm run build.

---
**HARD STOP:** Phase 7 Pre-Implementation Audit selesai. Menunggu instruksi untuk memulai implementasi Phase 7.
