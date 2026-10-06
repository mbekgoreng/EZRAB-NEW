# EZRAB — PHASE 6: ROAD & HIGHWAY QUANTITY CALCULATOR PACK REPORT
**Dokumen Master Specification:** `EZRAB_CIVIL_CALCULATOR_UNIVERSE_MASTER_BLUEPRINT.md`  
**Status Eksekusi:** COMPLETED & PASS (Strict Pure Quantity Takeoff Scope)

---

## 1. PRE-IMPLEMENTATION AUDIT SUMMARY
Audit pra-implementasi telah didokumentasikan dalam [PHASE6_ROAD_PRE_IMPLEMENTATION_AUDIT.md](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/PHASE6_ROAD_PRE_IMPLEMENTATION_AUDIT.md).
- **Existing Reusable Assets:**
  - `SafeDecimalEngine`: Menjamin operasi aritmatika desimal deterministik tanpa floating-point precision drift.
  - `CoreCalculatorRegistry`: Registry multi-pack (`legacy`, `building`, `residential`, `road`).
  - `ValidationEngine` & `PrecisionEngine`: Validasi schema input dan kebijakan pembulatan.
  - `ProvenanceEngine`: Pelacakan lineage formula, referensi spesifikasi teknis Bina Marga, dan audit trail.
  - `QTOAdapter`: Menjembatani output kalkulator langsung ke QTO item dengan `projectId` fail-closed isolation.
- **Identifikasi Gap:**
  - Belum tersedianya engine parsing chainage/stationing (`STA 0+000`), Average End Area method untuk earthwork, kalkulasi multi-layer perkerasan jalan lentur/kaku, joint rigid pavement, geosintetik overlap, dan aksesoris keselamatan jalan (marka, guardrail, barrier, delineator, pondasi rambu).

---

## 2. EXISTING ENGINE REUSE
| Engine Existing | Mode Pemanfaatan di Phase 6 |
| :--- | :--- |
| `SafeDecimalEngine` | Reused 100% untuk seluruh operasi aritmatika deterministik sub-milimeter |
| `ValidationEngine` | Reused 100% untuk validasi parameter input 39 kalkulator jalan |
| `PrecisionEngine` | Reused 100% untuk enforce nilai numerik positif dan formatting |
| `ProvenanceEngine` | Reused 100% untuk merekam metadata formula dan referensi standar Bina Marga |
| `CoreCalculatorRegistry` | Reused 100% untuk registrasi namespace `road.*` |
| `QTOAdapter` | Reused 100% untuk konversi kalkulasi menjadi line-item QTO proyek |

---

## 3. NEW ROAD GENERIC ENGINES
10 generic road engines dibuat di bawah `src/engine/calculatorCore/road/engines/`:
1. **[RoadAlignmentEngine](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/calculatorCore/road/engines/roadAlignmentEngine.ts)**: Parsing station string (`STA 1+250`), kalkulasi panjang segmen, interval pematokan, dan cross-section formation width.
2. **[RoadEarthworkEngine](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/calculatorCore/road/engines/roadEarthworkEngine.ts)**: Metode Average End Area $V = \frac{A_1 + A_2}{2} \times L$, neraca cut & fill, borrow deficit, dan disposal surplus.
3. **[RoadPavementLayerEngine](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/calculatorCore/road/engines/roadPavementLayerEngine.ts)**: Multi-layer pavement stacking (Subgrade, Subbase, LPA/LPB, CTB, Lean Concrete, Rigid, AC-Base, AC-BC, AC-WC).
4. **[RoadSurfaceTreatmentEngine](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/calculatorCore/road/engines/roadSurfaceTreatmentEngine.ts)**: Prime coat dan tack coat spray area ($m^2$) dan volume emulsi aspal ($liter$) dengan enforcement source rate.
5. **[RoadElementsEngine](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/calculatorCore/road/engines/roadElementsEngine.ts)**: Bahu jalan (paved/unpaved), median, kerb (volume beton & piece count precast), saluran samping trapesium/persegi, dan drainase jalan.
6. **[GeosyntheticQuantityEngine](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/calculatorCore/road/engines/geosyntheticQuantityEngine.ts)**: Geotextile filter/separator dan geogrid reinforcement dengan explicit overlap seam allowance.
7. **[RoadSafetyAccessoriesEngine](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/calculatorCore/road/engines/roadSafetyAccessoriesEngine.ts)**: Marka jalan termoplastik ($m^2$), guardrail beam ($m'$), tiang guardrail (unit), barier beton ($m^3$), delineator patok tikungan (unit), dan pondasi rambu ($m^3$).
8. **[RoadJointEngine](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/calculatorCore/road/engines/roadJointEngine.ts)**: Sambungan perkerasan kaku (transverse contraction, longitudinal, expansion joint), dowel bar count, tie bar count, dan sealant volume.
9. **[RoadHaulingEngine](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/calculatorCore/road/engines/roadHaulingEngine.ts)**: Perhitungan murni quantity-distance hauling ($m^3\cdot km$).
10. **[RoadOwnershipEngine](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/calculatorCore/road/engines/roadOwnershipEngine.ts)**: Single-quantity producer ownership tracking untuk mencegah duplikasi QTO.

---

## 4. 39 ROAD CALCULATOR CAPABILITIES
Seluruh 39 kapabilitas terdaftar di bawah namespace `road.*`:

### Core Road (1-11)
1. `road.alignment` — Geometri trase, panjang jalan, dan luas permukaan jalur lalu lintas ($m, m^2$).
2. `road.stationing` — Pematokan interval stationing & identifikasi titik STA ($m$).
3. `road.chainage` — Interval chainage dan segmentasi bentang jalan ($m$).
4. `road.cross_section` — Luas penampang melintang (formation, carriageway, shoulder, side slope) ($m^2$).
5. `road.earthwork` — Pekerjaan tanah komprehensif Average End Area, neraca cut & fill ($m^3$).
6. `road.cut` — Volume galian tanah jalan ($m^3$).
7. `road.fill` — Volume timbunan tanah jalan ($m^3$).
8. `road.embankment` — Volume timbunan badan jalan terkompaksi ($m^3$).
9. `road.excavation` — Volume galian badan jalan ($m^3$).
10. `road.disposal` — Volume tanah sisa galian yang harus dibuang ($m^3$).
11. `road.borrow_material` — Volume tanah timbunan borrow pit yang dibutuhkan ($m^3$).

### Pavement Layers (12-18)
12. `road.subgrade` — Penyiapan dan pemadatan tanah dasar badan jalan ($m^2$).
13. `road.selected_material` — Lapis timbunan pilihan (selected embankment) ($m^3$).
14. `road.granular_subbase` — Lapis pondasi bawah berbutir (Agregat Kelas B/C) ($m^3$).
15. `road.aggregate_base` — Lapis pondasi atas agregat (Agregat Kelas A) ($m^3$).
16. `road.cement_treated_base` — Lapis pondasi semen (CTB / CTB Base) ($m^3$).
17. `road.lean_concrete` — Beton kurus lantai kerja perkerasan kaku ($m^3$).
18. `road.rigid_pavement` — Pelat beton semen perkerasan kaku ($m^3$).

### Asphalt Layers & Surface Treatments (19-24)
19. `road.asphalt_base` — Lapis pondasi aspal (Asphalt Concrete - Base / AC-Base) ($m^3$).
20. `road.asphalt_binder` — Lapis antara aspal (Asphalt Concrete - Binder Course / AC-BC) ($m^3$).
21. `road.asphalt_wearing_course` — Lapis aus aspal (Asphalt Concrete - Wearing Course / AC-WC) ($m^3$).
22. `road.prime_coat` — Lapis resap pengikat prime coat ($m^2, liter$).
23. `road.tack_coat` — Lapis perekat tack coat ($m^2, liter$).
24. `road.asphalt_surface` — Lapisan aspal penutup / perata umum ($m^3$).

### Road Elements (25-29)
25. `road.shoulder` — Bahu jalan (paved / aggregate / unpaved shoulder) ($m^3$).
26. `road.median` — Median jalan pemisah jalur ($m^3$).
27. `road.kerb` — Kerb jalan / pembatas tepi jalan ($m', m^3, \text{buah}$).
28. `road.side_ditch` — Saluran samping drainase jalan (galian & pasangan/lining) ($m^3$).
29. `road.road_drainage` — Saluran drainase jalan utama beton bertulang ($m'$).

### Geosynthetics (30-31)
30. `road.geotextile` — Geotekstil filter, separator, dan stabilisator ($m^2$).
31. `road.geogrid` — Geogrid perkuatan lereng dan perkerasan ($m^2$).

### Road Safety & Accessories (32-36)
32. `road.road_marking` — Pengecatan marka jalan termoplastik ($m^2$).
33. `road.guardrail` — Pagar pengaman jalan baja galvanis w-beam ($m'$).
34. `road.traffic_barrier` — Pembatas jalan beton / concrete barrier ($m^3, \text{unit}$).
35. `road.road_delineator` — Patok pengarah / delineator tikungan ($\text{unit}$).
36. `road.road_sign_foundation` — Pondasi beton rambu petunjuk jalan ($m^3$).

### Joint / Special (37-38)
37. `road.pavement_joint` — Sambungan susut dan memanjang perkerasan kaku ($m'$).
38. `road.expansion_joint` — Sambungan muai perkerasan kaku ($m'$).

### Hauling (39)
39. `road.material_hauling` — Pengangkutan material jalan & tanah ($m^3\cdot km$).

---

## 5. REGISTRY INTEGRATION
- **Namespace:** Terdaftar di `CoreCalculatorRegistry` di bawah pack `road` tanpa benturan namespace dengan `legacy.*` maupun `residential.*`.
- **Adaptasi Konstruksi:** Diintegrasikan ke `CONSTRUCTION_CALCULATORS` dan `ALL_CONSTRUCTION_CALCULATORS` di [registry.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/constructionCalculators/registry.ts).
- **Total Kalkulator Sistem:**
  - 24 Legacy Master Calculators
  - 30 Residential Building Calculators
  - 39 Road & Highway Calculators
  - **Total: 93 Calculators**

---

## 6. UI INTEGRATION
- Diintegrasikan ke UI kalkulator terpadu di [QtoCalculatorView.tsx](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/components/qto/QtoCalculatorView.tsx).
- Kategori baru: `🛣️ G. ROAD & HIGHWAY (39 items)`.
- Dilengkapi dengan filter pill, search bar, card preview, form parameter input interaktif, panel warnings, breakdown volume, provenance modal, dan tombol "Tambahkan ke QTO".

---

## 7. QTO INTEGRATION
- Menghasilkan line-item QTO standar dengan status `CALCULATED`.
- Mengisolasi kepemilikan kuantitas per `projectId` (Fail-Closed).
- Breakdown kuantitas menyertakan volume, luas permukaan, dan satuan primer.

---

## 8. DED ENTITY INTEGRATION
Mendukung entitas struktur data jalan:
- `Road`, `RoadSegment`, `Alignment`, `Station`, `CrossSection`, `PavementLayer`, `Shoulder`, `Median`, `Kerb`, `Drainage`, `Ditch`, `Guardrail`, `RoadMarking`, `RoadSign`, `Geosynthetic`.
- Setiap entitas memiliki `entityId`, `projectId`, `parentEntityId`, `dimensions`, `source`, dan `confidence`.

---

## 9. OWNERSHIP & ANTI-DUPLICATION
- Menggunakan skema kunci kepemilikan komposit:
  `projectId::roadEntityId::quantityKind::segmentId::layerId`
- Memastikan kuantitas cut & fill dari `road.earthwork` tidak diduplikasi oleh `road.cut` atau `road.fill` jika mengacu pada segmen fisik yang sama.
- Mencegah duplikasi volume perkerasan jalan oleh assembly induk.

---

## 10. PROVENANCE & AUDIT TRAIL
Setiap kalkulasi menyertakan `FormulaProvenance`:
- ID formula dan versi kalkulator
- Ekspresi matematika eksplisit
- Standar acuan (Spesifikasi Umum Bina Marga 2018 Revisi 2 / Pedoman Geometri Jalan)
- Peringatan status verifikasi jika parameter non-geometri (seperti densitas aspal atau application rate emulsi) tidak disediakan oleh input eksplisit atau sumber terverifikasi.

---

## 11. SOURCE STATUS POLICY
Mengikuti kebijakan ketat:
- Parameter geometri (panjang, lebar, tebal, cross-section) dihitung secara deterministik.
- Tidak mengasumsikan faktor pemadatan, swell, kepadatan aspal ($t/m^3$), koefisien kehilangan, atau laju semprot tanpa input eksplisit.
- Menampilkan peringatan: `"NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE"` jika parameter empiris tidak disertakan.

---

## 12. TEST RESULTS & REGRESSION VALIDATION
Semua test suite dieksekusi via `npm run test:all`:

| Test Suite | Total Test Cases | Status |
| :--- | :--- | :--- |
| Core Calculator Engine | 74 / 74 | **PASS** (100%) |
| Volume Calculator Golden Integration | 8 / 8 steps | **PASS** (100%) |
| Phase 3 Excel Parity Runner | 23 / 23 golden vectors | **PASS** (Exact Parity) |
| Phase 4 AHSP & Pricing Engine | 61 / 61 tests | **PASS** (100%) |
| Phase 5 Residential Building Pack | 159 / 159 tests | **PASS** (100%) |
| Phase 6 Road & Highway Pack | 266 / 266 assertions | **PASS** (100%) |
| Phase 5.2 UI Calculator Integration | 172 / 172 tests | **PASS** (100%) |

- **TypeScript Typecheck (`npx tsc --noEmit`):** **PASS** (0 errors)
- **Vite Production Build (`npm run build`):** **PASS** (Built in 30.73s)

---

## 13. KNOWN LIMITATIONS
1. Desain struktural perkerasan jalan (AASHTO 1993, MDP 2017), desain tebal lapis pondasi, CBR desain, dan mix design aspal sengaja berada di luar cakupan (Pure Quantity Takeoff).
2. Desain hidrolika saluran samping (Manning, debit banjir rencana, radius hidraulik) berada di luar cakupan QTO Phase 6.
3. Estimasi biaya alat berat, produktivitas dump truck, dan cycle time hauling tidak dieksekusi di modul kalkulator fisik ini (akan diproses pada modul AHSP/Pricing tersendiri).

---

## 14. STATUS SEPARATION
- **IMPLEMENTATION STATUS:** `COMPLETE` (39 / 39 road calculator capabilities implemented, registered, UI-exposed, and tested).
- **DOMAIN VERIFICATION STATUS:** `PARTIALLY_VERIFIED` (Formulasi geometris terverifikasi deterministik terhadap acuan Bina Marga; koefisien material empiris tetap mewajibkan input eksplisit).

---

## 15. FINAL STATUS & HARD STOP
Phase 6 Road & Highway Quantity Calculator Pack telah selesai secara penuh dan lulus seluruh gate pengujian.
Sesuai instruksi: **HARD STOP. Tidak melanjutkan ke Drainage, Bridge, atau Irrigation Pack.**
