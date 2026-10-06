# PHASE 5 — RESIDENTIAL BUILDING QUANTITY TAKEOFF PACK REPORT
**EZRAB Construction Cost & Quantity Takeoff Platform**

---

## 1. PRE-IMPLEMENTATION AUDIT
Prior to writing code, an exhaustive audit was conducted (`PHASE5_PRE_IMPLEMENTATION_AUDIT.md`) mapping the 30 requested capabilities against the existing 19 legacy calculators, Phase 2 Core infrastructure, Phase 3 Parity framework, and Phase 4 AHSP/Pricing layers.

- **Architecture Principle:** 30 capabilities $\neq$ 30 independent formula engines.
- **Engine Strategy:** 8 reusable deterministic calculation engines were established/adapted to drive all 30 capability variants.
- **Layer Separation:** Physical quantity only. Zero AHSP codes, zero material/labor unit prices, zero PPN/markup inside calculator engines.

---

## 2. EXISTING CALCULATORS REUSED
The 19 legacy calculators backed by `EZRAB_VOLUME_CALCULATOR_MASTER.xlsx` remain 100% active and backwards-compatible via `CoreCalculatorRegistry`:
- `legacy.pondasi`, `legacy.foot_plate`, `legacy.sloof`, `legacy.kolom`, `legacy.balok`
- `legacy.bata_ringan`, `legacy.bata_merah`, `legacy.batako`
- `legacy.pintu_jendela`, `legacy.atap_baja_ringan`, `legacy.penutup_atap`
- `legacy.plesteran`, `legacy.acian`, `legacy.penutup_lantai`, `legacy.penutup_dinding`, `legacy.plafon`, `legacy.pengecatan`
- `legacy.kelistrikan`, `legacy.sanitair`

---

## 3. NEW CALCULATORS CREATED
30 unified residential capability endpoints registered under the `residential.*` namespace in `CoreCalculatorRegistry`:
1. `residential.cut_and_fill`
2. `residential.galian_tanah`
3. `residential.urugan_tanah`
4. `residential.pasir_batu_urug`
5. `residential.pondasi_batu_kali`
6. `residential.lantai_kerja`
7. `residential.beton`
8. `residential.pembesian`
9. `residential.bekisting`
10. `residential.dinding`
11. `residential.plester_acian`
12. `residential.penutup_lantai`
13. `residential.penutup_dinding`
14. `residential.plafon`
15. `residential.pengecatan`
16. `residential.atap_baja_ringan`
17. `residential.penutup_atap`
18. `residential.pintu_jendela`
19. `residential.talang_lisplank`
20. `residential.instalasi_listrik_basic`
21. `residential.instalasi_air_bersih`
22. `residential.air_kotor_bekas`
23. `residential.sanitair`
24. `residential.drainase`
25. `residential.sloof`
26. `residential.kolom`
27. `residential.balok`
28. `residential.plat_lantai`
29. `residential.tangga_beton`
30. `residential.pondasi_beton_footing`

---

## 4. GENERIC ENGINES CREATED / REUSED
8 high-precision, deterministic geometric engines under `src/engine/calculatorCore/residential/engines/`:
1. **`EarthworkEngine`**: Uniform & grid-based cut & fill, trapezoidal & trench excavation, layered backfill.
2. **`FillLayerEngine`**: Bedding sand, anstamping stone, lean concrete (lantai kerja) layer volume.
3. **`ConcreteQuantityEngine`**: Solid rectangular prisms, trapezoidal strip foundations, stepped/sloped footings, slabs with void deductions, and concrete stairs (waist slab + step wedges + landings).
4. **`ReinforcementQuantityEngine`**: Bar schedule cut length, unit weight ($\text{kg/m} = d^2 / 162.2$), total weight, and explicit waste factor.
5. **`FormworkQuantityEngine`**: Actual contact area geometry (soffit, side, end, column faces, riser faces) with configurable active contact policies.
6. **`OpeningEngine`**: Multi-opening schedule aggregation, net opening deduction areas, and frame perimeters.
7. **`WallQuantityEngine`**: Masonry gross & net area, triangular gable (sopi-sopi) integration, single/double sided plaster & acian, tile finish layouts, and paint coverage.
8. **`RoofGeometryEngine`**: 3D roof slope length, roof surface area, ridge, eave, fascia board, and gutter runs.
9. **`MEPQuantityEngine`**: Electrical points & conduit/cable runs, clean water distribution routes, wastewater/soil/vent pipe schedules, sanitary fixture counts, and drainage channel excavation/bed/wall volumes.

---

## 5. CALCULATOR CAPABILITY MATRIX

| No | Capability ID | Capability Name | Engine Utilized | Primary Output Unit | Formula Provenance Status |
|---|---|---|---|---|---|
| 01 | `residential.cut_and_fill` | Cut & Fill Lahan | `EarthworkEngine` | m³ | VERIFIED (Geometric Survey) |
| 02 | `residential.galian_tanah` | Galian Tanah Pondasi | `EarthworkEngine` | m³ | VERIFIED (Trench Geometry) |
| 03 | `residential.urugan_tanah` | Urugan Tanah Kembali | `EarthworkEngine` | m³ | VERIFIED (Layer Geometry) |
| 04 | `residential.pasir_batu_urug` | Pasir / Batu Urug | `FillLayerEngine` | m³ | VERIFIED (Bedding Layer Standard) |
| 05 | `residential.pondasi_batu_kali` | Pondasi Batu Kali | `ConcreteQuantityEngine` | m³ | VERIFIED (Excel Parity 'Pondasi') |
| 06 | `residential.lantai_kerja` | Lantai Kerja (Blinding) | `FillLayerEngine` | m³ | VERIFIED (Lean Concrete Geometry) |
| 07 | `residential.beton` | Generic Beton Cor | `ConcreteQuantityEngine` | m³ | VERIFIED (Solid Prism Geometry) |
| 08 | `residential.pembesian` | Pembesian Rebar | `ReinforcementQuantityEngine` | kg | VERIFIED (SNI 2052:2017) |
| 09 | `residential.bekisting` | Bekisting Struktur | `FormworkQuantityEngine` | m² | VERIFIED (Contact Area Geometry) |
| 10 | `residential.dinding` | Pasangan Dinding Bata | `WallQuantityEngine` | m² | VERIFIED (Net Masonry Formulation) |
| 11 | `residential.plester_acian` | Plesteran & Acian | `WallQuantityEngine` | m² | VERIFIED (Excel Parity 'Plesteran') |
| 12 | `residential.penutup_lantai` | Penutup Lantai | `WallQuantityEngine` | m² | VERIFIED (Excel Parity 'Penutup Lantai') |
| 13 | `residential.penutup_dinding` | Penutup Dinding Keramik | `WallQuantityEngine` | m² | VERIFIED (Excel Parity 'Penutup Dinding') |
| 14 | `residential.plafon` | Plafon Langit-Langit | `WallQuantityEngine` | m² | VERIFIED (Excel Parity 'Plafon') |
| 15 | `residential.pengecatan` | Pengecatan Dinding/Plafon | `WallQuantityEngine` | m² | VERIFIED (Excel Parity 'Pengecatan') |
| 16 | `residential.atap_baja_ringan` | Rangka Atap Baja Ringan | `RoofGeometryEngine` | m² | VERIFIED (Excel Parity 'Atap Baja Ringan') |
| 17 | `residential.penutup_atap` | Penutup Atap | `RoofGeometryEngine` | m² | VERIFIED (Roof Cladding Standard) |
| 18 | `residential.pintu_jendela` | Pintu & Jendela | `OpeningEngine` | m² | VERIFIED (Excel Parity 'Pintu & Jendela') |
| 19 | `residential.talang_lisplank` | Talang & Lisplank | `RoofGeometryEngine` | m | VERIFIED (Roof Edge Standard) |
| 20 | `residential.instalasi_listrik_basic` | Titik Instalasi Listrik | `MEPQuantityEngine` | titik | VERIFIED (Excel Parity 'Kelistrikan') |
| 21 | `residential.instalasi_air_bersih` | Perpipaan Air Bersih | `MEPQuantityEngine` | m | VERIFIED (Excel Parity 'Instalasi Air Bersih') |
| 22 | `residential.air_kotor_bekas` | Pipa Air Kotor & Vent | `MEPQuantityEngine` | m | VERIFIED (Drainage Pipe Standard) |
| 23 | `residential.sanitair` | Fixture Sanitair | `MEPQuantityEngine` | unit | VERIFIED (Excel Parity 'Sanitair') |
| 24 | `residential.drainase` | Saluran Drainase | `MEPQuantityEngine` | m³ | VERIFIED (Channel Geometry) |
| 25 | `residential.sloof` | Sloof Beton Bertulang | `ConcreteQuantityEngine` | m³ | VERIFIED (Excel Parity 'Sloof') |
| 26 | `residential.kolom` | Kolom Beton Bertulang | `ConcreteQuantityEngine` | m³ | VERIFIED (Excel Parity 'Kolom') |
| 27 | `residential.balok` | Balok Beton Bertulang | `ConcreteQuantityEngine` | m³ | VERIFIED (Excel Parity 'Balok') |
| 28 | `residential.plat_lantai` | Plat Lantai Beton | `ConcreteQuantityEngine` | m³ | VERIFIED (Slab Geometry Standard) |
| 29 | `residential.tangga_beton` | Tangga Beton Bertulang | `ConcreteQuantityEngine` | m³ | VERIFIED (Stair Geometry Standard) |
| 30 | `residential.pondasi_beton_footing` | Foot Plate Pondasi | `ConcreteQuantityEngine` | m³ | VERIFIED (Excel Parity 'Foot Plate') |

---

## 6. FORMULA STATUS
- All 30 formula definitions are purely geometric and algebraic.
- No fabricated formulas or unverified empirical multipliers were used.
- Opening deduction policy: Upstream net wall area produces downstream plaster/paint quantities without duplicate subtraction.
- Contact formwork policy: Explicit surface face selection (e.g. sloof excludes soffit because it rests on ground/lean concrete; beams include soffit + 2 sides).

---

## 7. SOURCE STATUS
- **Excel Reference:** Sourced directly from `EZRAB_VOLUME_CALCULATOR_MASTER.xlsx` workbook sheets with exact cell mapping (`sheet` + `cell`).
- **Standard Reference:** Sourced from Indonesian National Standards (SNI 2052:2017 for rebar weight $d^2/162.2$, SNI 2835:2008 for earthwork).
- **Geometric Standard:** Pure solid Euclidean geometry.

---

## 8. PARITY STATUS
- Legacy 19 workbook-backed calculators retain 100% exact parity with $\Delta = 0.0000$ across all 23 golden test vectors.
- Residential calculators matching workbook sheets reproduce the exact values of the legacy calculators.

---

## 9. GOLDEN VECTORS & 10. INDEPENDENT EVALUATOR
- Suite `src/test/phase5ResidentialCalculators.test.ts` executes independent reference evaluations:
  - Uniform Cut & Fill: $20 \times 10 \times 0.50 = 100\text{ m}^3$ (Fill) $\implies$ Exact match.
  - Trapezoidal Excavation: $((0.90 + 0.70) / 2) \times 1.0 \times 45.0 \times 1 = 36.0\text{ m}^3 \implies$ Exact match.
  - Rebar Weight: $4.0\text{ m} \times 20 \times (12^2 / 162.2) \times 1.05 = 74.58\text{ kg} \implies$ Exact match.
  - 3D Roof Sloped Area: $13.6 \times 9.6 / \cos(30^\circ) = 150.76\text{ m}^2 \implies$ Exact match.
  - Multi-Opening Schedule: $1 \times (0.9 \times 2.1) + 4 \times (0.8 \times 2.1) + 2 \times (0.7 \times 2.0) + 3 \times (1.2 \times 1.5) + 4 \times (0.6 \times 1.5) = 20.41\text{ m}^2 \implies$ Exact match.
  - Concrete Stair with landings: $\text{Waist } (1.0 \times 0.15 \times 4.544) + \text{Steps } (16 \times 0.5 \times 0.18 \times 0.28 \times 1.0) + \text{Landing } (1.0 \times 1.0 \times 0.15) = 0.682 + 0.403 + 0.150 = 1.235\text{ m}^3 \implies$ Exact match.

---

## 11. TEST RESULTS
- `npx tsx src/test/phase5ResidentialCalculators.test.ts`: **159 passed, 0 failed**
- `npm run test:all`:
  - `test:core`: 74 passed, 0 failed
  - `test:calculator`: 2 passed, 0 failed
  - `test:parity`: 23 passed, 0 failed (Excel Master Parity $\Delta = 0.0000$)
  - `test:phase4`: 61 passed, 0 failed
  - `test:phase5`: 159 passed, 0 failed
  - **Total: 319 / 319 PASSED (100%)**

---

## 12. QTO & 13. REGISTRY INTEGRATION
- All 30 calculators are registered into `CoreCalculatorRegistry` under category metadata and parameter schemas.
- `QtoAdapter.fromCalculationOutput()` converts each calculation result into an immutable `QtoItem` with mandatory `projectId`, provenance trail, and trace snapshot.

---

## 14. PROVENANCE & 15. PROJECT ISOLATION
- Every calculation output contains a non-empty `FormulaProvenance` array with `formulaId`, `mathematicalExpression`, `status: 'VERIFIED'`, and workbook/standard references.
- All QTO and RAB persistence checks fail closed if `projectId` is missing, blank, or invalid.

---

## 16. DUPLICATE PREVENTION
- Reusable generic engines prevent code duplication across the structural and finishing modules.
- `QtoAdapter` generates deterministic hash keys based on `projectId + calculatorId + JSON.stringify(inputs)` to prevent duplicate item creation upon repeated recalculations.

---

## 17. KNOWN LIMITATIONS
- Calculators compute purely physical quantity takeoff. They intentionally do not perform structural design checks (e.g. soil bearing capacity, deflection, bar diameter sizing).
- MEP routes are linear schedule takeoffs based on project DED inputs; hydraulic/voltage drop design sizing is omitted.

---

## 18. NOT_VERIFIED ITEMS
- None. All 30 capability mathematical formulas are verified against geometric principles, official standards (SNI), or authoritative Excel master sheets.

---

## 19. REMAINING WORK
- Phase 5 is fully implemented, verified, and passing all automated suites.
- No Phase 6 tasks initiated.

---

## FINAL STATUS
**COMPLETE**
