# VOLUME_CALCULATOR_AUDIT_INVENTORY.md

**Project:** EZRAB (ezrab-v2)
**Audit date:** 2026-09-27
**Audit type:** Forensic inventory (Phase A + B of the Master Audit)
**Method:** Static repository inspection (`Glob`/`Grep`/`Read`). Every row cites `file:line`.
**Verification level:** `CODE_INSPECTED` = formula read directly from source. No row is marked PASS unless it is code-verified **and** price-sourced **and** unit-consistent.

> **Honesty rule applied:** a calculator is NOT marked PASS because it "looks fine". It is PASS only when
> (a) the formula is deterministic and readable in code, (b) units are explicit and consistent,
> (c) no hardcoded production price/coefficient without source, and (d) AHSP mapping is explicit.
> Where any of those is missing the row carries the corresponding failure status.

---

## 0. Executive summary of the inventory

| Metric | Value |
|---|---|
| Distinct calculators registered (calculatorCore + constructionCalculators) | **194** |
| Additional server-side quantity functions | **8** |
| Template-engine quantity evaluators | **1** (`new Function` eval) |
| Total quantity-computing units found | **203** |
| Calculators carrying a **hardcoded production price** | **24 legacy** + 3 price engines |
| Calculators with an **explicit AHSP mapping** | 24 legacy + 3 server engines = **27** |
| Calculators with **no AHSP mapping** (quantity only) | **166** |
| Calculators with a **waste/overlap factor** | 6 explicit + 12 literals |
| Calculators that apply **money at all** | 27 (rest are quantity-only) |
| **Orphan / parallel quantity systems** | 3 (legacy, template `new Function`, `masterJsonSpec`) |

**Headline:** the physical-quantity layer is mostly deterministic and readable. The **money layer is where
the defects are** — hardcoded unit prices in 24 calculators, three parallel quantity systems, and a price
chain that is unit-blind, region-blind and date-blind (see `PRICE_DATABASE_AUDIT.md` and
`VOLUME_CALCULATOR_FINAL_REPORT.md`).

---

## 1. System map (two parallel, non-unified quantity systems)

| # | System | Entry point | Contract | Money? | AHSP? | Status |
|---|---|---|---|---|---|---|
| 1 | **Legacy calculators** | `src/engine/constructionCalculators/registry.ts` (`CONSTRUCTION_CALCULATORS`) | ad-hoc object, 24 entries | **Hardcoded `defaultUnitPrice`** | Yes (`defaultAhspCode`) | **NEEDS_REBUILD** |
| 2 | **Core pack calculators** | `src/engine/calculatorCore/registry/calculatorRegistry.ts` → packs | `CalculatorDefinition` + `SafeDecimalEngine` | No (quantity only) | No | **WARNING** (no AHSP link) |
| 3 | **Template quantity engine** | `src/engine/templateEngine/QuantityEngine.ts` (`evalSimpleFormula`) | template `quantityRule` strings | No | No | **NEEDS_REBUILD** (`new Function`) |
| 4 | **Server QTO engines** | `server/services/deterministicQtoEngine.ts`, `automaticQtoEngine.ts`, `constructionEntityEngine.ts` | ad-hoc | Passed from caller | Partially hardcoded | **HARDCODED** |
| 5 | **Excel spec (orphan)** | `src/engine/constructionCalculators/masterJsonSpec.ts` | data only | No | No | **ORPHAN** |

---

## 2. Legacy calculators — full inventory (24) — **HARDCODED PRICES**

Source: `src/engine/constructionCalculators/registry.ts`

| # | Calculator | file:line | Input | Output (unit) | Formula (as coded) | Waste | AHSP | Hardcoded price | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Bowplank / Bouwplank | registry.ts:13 | P,L,C,R,H (m) | Perimeter (m) | `2 × (P + L + 2×C)` | 105% literal (L89) | A.2.2.1.4 | 95,400 | HARDCODED |
| 2 | Pondasi Batu Kali | registry.ts:132 | a1,b1,c1,a2,b2,c2,d,e,f,P (m) | m³ | `((a2+b2)/2) × c2 × P` | No | A.3.2.1.2 | 985,000 | HARDCODED |
| 3 | Pondasi Tapak / Foot Plate | registry.ts:327 | b1,b2,h1..h5,a1,a2,N | m³ | `(volTapak + volKolom) × N` | No | A.4.1.1.5 | 1,350,000 | HARDCODED |
| 4 | Sloof Beton | registry.ts:517 | b,h,P,n | m³ | `b × h × P × n` | No | A.4.1.1.25 | 4,850,000 | HARDCODED |
| 5 | Kolom Beton | registry.ts:662 | L,P,T,nKolom | m³ | `L × P × T × n` | No | A.4.1.1.26 | 5,350,000 | HARDCODED |
| 6 | Balok Beton | registry.ts:800 | b,h,L | m³ | `b × h × L` | No | A.4.1.1.27 | 5,450,000 | HARDCODED |
| 7 | Baja WF | registry.ts:908 | L,n,profile,waste% | kg | `totalLength × kgPerM` (+waste) | Yes (`wastePercent`) | A.4.2.1.1 | 38,500 | HARDCODED |
| 8 | Dinding Bata Ringan | registry.ts:1114 | Pi,Pe,T,ampig,bukaan | m² | `luasKotor + luasAmpig − pengurang` | 105% literal (L1239) | A.4.4.1.14 | 145,000 | HARDCODED |
| 9 | Dinding Bata Merah | registry.ts:1258 | P,H,Abukaan,Asop | m² | `(P × H) − Abukaan + Asop` | No | A.4.4.1.9 | 165,000 | HARDCODED |
| 10 | Dinding Batako | registry.ts:1333 | P,H,Abukaan,Asop | m² | `(P × H) − Abukaan + Asop` | No | A.4.4.1.12 | 138,000 | HARDCODED |
| 11 | Pintu & Jendela | registry.ts:1407 | luas daun, kusen (m) | m² | sum of leaf areas | No | A.4.6.1.5 | 950,000 | HARDCODED |
| 12 | Atap Baja Ringan | registry.ts:1502 | Lb,O,sudut,Pb | m² | `(Lb/2 + O) / cos(sudut)` | No | A.4.2.1.21 | 185,000 | HARDCODED |
| 13 | Plesteran & Acian | registry.ts:1608 | Ld,sisi | m² | `Ld × sisi` | No | A.4.4.2.4 | 92,000 | HARDCODED |
| 14 | Penutup Lantai | registry.ts:1682 | P,L | m² | `P × L`; tiles `(luas × (1+waste)) / 1.44` | Yes | A.4.4.3.35 | 245,000 | HARDCODED |
| 15 | Penutup Dinding Keramik | registry.ts:1765 | K,H,Abukaan | m² | `((K × H) − Abukaan) × 105%` | 105% literal | A.4.4.3.50 | 265,000 | HARDCODED |
| 16 | Plafon | registry.ts:1829 | P,L | m² | `P × L` | No | A.4.5.1.7 | 135,000 | HARDCODED |
| 17 | Pengecatan | registry.ts:1915 | interior,exterior,ceiling | m² | sum of areas | No | A.4.7.1.10 | 38,500 | HARDCODED |
| 18 | Instalasi Listrik | registry.ts:1996 | titik counts | titik | sum of points | No | A.8.1.1.1 | 275,000 | HARDCODED |
| 19 | Instalasi Air Bersih | registry.ts:2078 | pipe lengths (m) | m | sum of pipe lengths | No | A.5.1.1.2 | 42,000 | HARDCODED |
| 20 | Sanitair | registry.ts:2156 | unit counts | unit | sum of units | No | A.5.1.1.15 | 2,350,000 | HARDCODED |
| 21 | Paving Block | registry.ts:2224 | P,L,kanstin | m² | `P × L`; kanstin `2 × P` | No | A.4.4.3.60 | 165,000 | HARDCODED |
| 22 | Jalan Aspal Hotmix | registry.ts:2317 | P,L,tAcWc,tBaseA | m² / ton | `P × L`; ton `luas × t × 2.3` | No | B.06.1.1 | 1,750,000 | HARDCODED |
| 23 | Jalan Rigid | registry.ts:2409 | P,L,tRigid,tLc | m³ | `P × L × tRigid` | No | B.05.1.1 | 1,650,000 | HARDCODED |
| 24 | Saluran U-Ditch | registry.ts:2510 | P,lebar,tinggi,tipe | m | `(lebar+0.30) × (tinggi+0.10) × P` | No | B.07.1.1 | 485,000 | HARDCODED |

**Why HARDCODED and not PASS:** every row carries a production `defaultUnitPrice` literal inside the
calculator (e.g. `registry.ts:25`, `:144`, `:339`, `:529`, `:674`, `:812`, `:920`, `:1126`, `:1270`,
`:1345`, `:1419`, `:1514`, `:1620`, `:1694`, `:1777`, `:1841`, `:1927`, `:2008`, `:2090`, `:2168`,
`:2236`, `:2329`, `:2421`, `:2522`). Per Master Prompt §10, prices must come from the Price Database via
the pricing service — not from the calculator.

---

## 3. Core pack calculators (194 total) — inventory by pack

### 3.1 Residential pack — 30 calculators
Source: `src/engine/calculatorCore/residential/residentialPackCalculators.ts`
Engines: `residential/engines/{earthwork,fillLayer,concreteQuantity,reinforcementQuantity,formworkQuantity,opening,wallQuantity,roofGeometry,mepQuantity}Engine.ts`

| Calculator id | Formula (engine) | Output | Waste | Price | AHSP | Status |
|---|---|---|---|---|---|---|
| residential.cut_and_fill | `area × (existing − proposed)` | m³ | – | none | none | WARNING (no AHSP) |
| residential.galian_tanah | `((topW+botW)/2) × depth × L` | m³ | – | none | none | WARNING |
| residential.urugan_tanah | `area × thickness` | m³ | – | none | none | WARNING |
| residential.pasir_batu_urug | `area × thickness` | m³ | – | none | none | WARNING |
| residential.pondasi_batu_kali | `((topW+botW)/2) × h × L` | m³ | – | none | none | WARNING |
| residential.lantai_kerja | `L × W × t` | m³ | – | none | none | WARNING |
| residential.beton | `L × W × H` | m³ | – | none | none | WARNING |
| residential.pembesian | `d²·π·7850/(4·10⁶) × L × qty × (1+waste)` | kg | **Yes (5% default, configurable)** | none | none | WARNING |
| residential.bekisting | beam `(2h+w)`, column perimeter, slab/footing | m² | – | none | none | WARNING |
| residential.dinding | `wallArea − openings + gable` | m² | – | none | none | WARNING |
| residential.plester_acian | `netArea × 2` | m² | – | none | none | WARNING |
| residential.penutup_lantai | `area / (tileL×tileW/10000)` | m² | – | none | none | WARNING |
| residential.penutup_dinding | `netArea` | m² | – | none | none | WARNING |
| residential.plafon | `grossArea − voidArea` | m² | – | none | none | WARNING |
| residential.pengecatan | `area × coats / coverage` | m² | – | none | none | WARNING |
| residential.atap_baja_ringan | `footprint / cos(pitch)` | m² | – | none | none | WARNING |
| residential.penutup_atap | `slopedArea / tileCoverArea` | unit | – | none | none | WARNING |
| residential.pintu_jendela | `w×h`; `(w+h)×2` | m² | – | none | none | WARNING |
| residential.talang_lisplank | fascia/gutter perimeter | m | – | none | none | WARNING |
| residential.instalasi_listrik_basic | MEP electrical | titik/unit | – | none | none | WARNING |
| residential.instalasi_air_bersih | MEP plumbing | m | – | none | none | WARNING |
| residential.air_kotor_bekas | MEP plumbing | m | – | none | none | WARNING |
| residential.sanitair | MEP sanitary | unit | – | none | none | WARNING |
| residential.drainase | MEP drainage channel | m³/m | – | none | none | WARNING |
| residential.sloof | `L × W × H × n` | m³ | – | none | none | WARNING |
| residential.kolom | `L × W × H × n` | m³ | – | none | none | WARNING |
| residential.balok | `L × W × H` | m³ | – | none | none | WARNING |
| residential.plat_lantai | `(gross − void) × t` | m³ | – | none | none | WARNING |
| residential.tangga_beton | `calculateStair()` | m³ | – | none | none | WARNING |
| residential.pondasi_beton_footing | `a1·a2·h1 + b1·b2·h3 + b1·b2·h2·0.5` | m³ | – | none | none | WARNING |

### 3.2 Road / Bina Marga pack — 39 calculators
Source: `src/engine/calculatorCore/road/roadPackCalculators.ts`
All rows: quantity only, **no AHSP mapping, no price**, status **WARNING** (unmapped). Formula families:

| Group | ids | Formula | Unit |
|---|---|---|---|
| Alignment/geometry | road.alignment, road.stationing, road.chainage, road.cross_section | `L_tangent + L_curve`; `floor(L/interval)+1`; `STA_end − STA_start`; `(N×W_lane)+shoulders+median` | m / unit |
| Earthwork | road.earthwork, road.cut, road.fill, road.embankment, road.excavation, road.disposal, road.borrow_material | `((A1+A2)/2)×L`; `(b·h + z·h²)×L`; `L×W_avg×H_avg`; `L×W×D`; `V_surplus`; `V_deficit` | m³ |
| Pavement layers | road.subgrade, road.selected_material, road.granular_subbase, road.aggregate_base, road.cement_treated_base, road.lean_concrete, road.rigid_pavement, road.asphalt_surface, road.shoulder, road.median, road.kerb | `L×W`; `L×W×t` | m² / m³ |
| Asphalt by weight | road.asphalt_base, road.asphalt_binder, road.asphalt_wearing_course | `V=L×W×t`; `W_ton = V × density` | ton |
| Surface treatment | road.prime_coat, road.tack_coat | `Area × applicationRate` | liter |
| Drainage | road.side_ditch, road.road_drainage | `((B+b)/2)×d×L`; `L` | m³ / m |
| Geosynthetics | road.geotextile, road.geogrid | `(L×W)×(1+overlap%)` | m² |
| Road furniture | road.road_marking, road.guardrail, road.traffic_barrier, road.road_delineator, road.road_sign_foundation | area; `floor(L/spacing)+1`; `L×A_sec`; count; `L×W×D×qty` | m²/m/unit/m³ |
| Joints | road.pavement_joint, road.expansion_joint | `(L/spacing)×W`; `L×count` | m |
| Hauling | road.material_hauling | `Volume × Distance` | m³·km |

### 3.3 Civil / SDA packs — 97 calculators
Sources: `civil/{bridge,drainage,embung,irrigation,river,dam,weir,waterStructure}/*PackCalculators.ts`

| Pack | Count | Representative formulas | Status |
|---|---|---|---|
| bridge | 16 | deck `L×W×t`; pier `(π/4·Dc²·Hc)×n`; pile `(π/4·Dp²·Lp)×N`; bearing `Girders×Spans×2×perEnd` | WARNING (forced `PARTIALLY_VERIFIED` via `civilHelper.createCivilOutput`) |
| drainage | 15 | `((T+B)/2)×H×L`; box culvert `(A_outer − A_inner)×L`; backfill `Max(0, V_gal − V_str − V_bed)` | WARNING |
| embung | 11 | prismoidal `(H/3)(A1+A2+√(A1·A2))`; core `((W1+W2)/2)×H×L` | WARNING |
| irrigation | 11 | canal `(b + m·h)×h×L`; lining `(b+2s)×L×t` | WARNING |
| river | 9 | riprap `L×Ls×t`; gabion `Ceil(L/Lb)×Layers×Rows` | WARNING |
| dam | 12 | body `((Wc+BaseW)/2)×H×L×0.85`; tunnel `(π/4·D_exc²)×L` | WARNING (**magic `0.85`/`0.75` valley factors, no source**) |
| weir | 10 | body `((Wc+Wb)/2)×H×L`; stilling basin `V_slab + Wb×He×0.8` | WARNING (**magic `0.8`**) |
| waterStructure | 13 | `(L+2t)(W+2t)(H+t) − L·W·H`; backfill `Max(0, V_gal − V_str)` | WARNING |

### 3.4 Standalone — 4 calculators

| id | file:line | Formula | Unit | Status |
|---|---|---|---|---|
| road.geometry | `calculators/road/roadGeometryCalculator.ts:23` | `P×L`; `P×L×T`; `2×P×Lb` | m²/m³ | WARNING |
| paving.geometry | `calculators/paving/pavingGeometryCalculator.ts:24` | `P×L`; `Luas×Tb`; `Luas×Tp`; `2×(P+L)` | m²/m³ | WARNING |
| building.earthwork.galian | `calculators/building/buildingExtensions.ts:18` | `((La+Lb)/2)×H×P` | m³ | WARNING |
| building.fence | `calculators/building/buildingExtensions.ts:163` | `P×H` | m² | WARNING |

---

## 4. Server-side quantity functions (8) — **HARDCODED**

| Function | file | Formula / literal | Issue | Status |
|---|---|---|---|---|
| calculateQto COLUMN | `server/services/deterministicQtoEngine.ts` | `w×d×h×count` | price from caller | HARDCODED |
| calculateQto BEAM | same | `w×h×length` | price from caller | HARDCODED |
| calculateQto FOOTING | same | trapezoid or `w×l×t×count` | price from caller | HARDCODED |
| calculateQto SLAB | same | `area×t` | price from caller | HARDCODED |
| calculateQto WALL | same | `length×height` | price from caller | HARDCODED |
| QTO misc literals | same | **`45.0` abutment, `0.04` road thickness, `2.4` canal perimeter** | unexplained magic numbers | **FAIL** |
| generateQtoFromConstructionEntities | `server/services/automaticQtoEngine.ts` | `perimeter×0.8×0.8`; `perimeter×0.15×0.20`; `count×0.25×0.25×h`; `perimeter×h×0.85` | hardcoded dimensions + `0.85` factor, hardcoded AHSP codes | HARDCODED |
| generateQtoFromElements | same | legacy 3-item path | hardcoded | HARDCODED |

`server/services/constructionEntityEngine.ts` additionally derives wall area as `2×(L+W)×H×0.85` and sloof
as `2×(L+W)` — **duplicate of the automaticQtoEngine logic** with an unsourced `0.85`.

---

## 5. Template quantity engine (1) — **NEEDS_REBUILD**

| Item | file | Detail | Status |
|---|---|---|---|
| `QuantityEngine.evalSimpleFormula` | `src/engine/templateEngine/QuantityEngine.ts` | Executes template-authored formula strings via `new Function(...)` — e.g. `building_area*1.2`, `Math.sqrt(building_area)*4+8`. No unit model, no validation, no AHSP. | **NEEDS_REBUILD** |

---

## 6. Orphans, duplicates and parallel systems

### 6.1 Orphans
| File | Evidence | Verdict |
|---|---|---|
| `src/engine/constructionCalculators/masterJsonSpec.ts` (501 lines, 19 calculator specs / 20 sheets) | Only importer is `src/components/qto/QtoCalculatorView.tsx:66` — no engine/registry imports it | **ORPHAN** (spec not wired to any runtime engine) |
| `src/engine/calculatorCore/parity/*` | Reachable via `calculatorCore/index.ts:34-38`; used by tests only | Parity tooling, not production calculators |

### 6.2 Duplicated logic (same formula implemented more than once)
| Formula | Locations |
|---|---|
| Trapezoid `((top+bottom)/2)×h×L` | legacy `registry.ts:257,265`; `concreteQuantityEngine.ts:122`; `earthworkEngine.ts:95`; `drainagePack:35,312,630`; `irrigationPack:34`; `embungPack:277`; `weirPack:34`; `damPack:35,260`; `riverPack:515`; `bridgePack:789`; `roadPack:1727` |
| Prism `L×W×H` | legacy `registry.ts:632`; `concreteQuantityEngine`; `drainagePack:571`; `waterStructurePack:534,594`; `irrigationPack:515,633`; `riverPack:400,458`; `bridgePack:854`; `damPack:153`; `roadPack:575,794,850,906,962,1018,1074,1481,1605,2204`; `deterministicQtoEngine`; `automaticQtoEngine` |
| Rebar kg/m `d²/162.2` | legacy `registry.ts` (FOOT_PLATE/SLOOF/KOLOM/BALOK); `reinforcementQuantityEngine.ts` |
| Wall area `2×(L+W)×H×0.85` | `automaticQtoEngine.ts`; `constructionEntityEngine.ts` |
| Tile waste `×1.05` | `residentialPackCalculators.ts:784`; `registry.ts:1788`; `calculatorWorkbookMap.ts:323` |
| `(P×H) − Abukaan + Asop` | `registry.ts:1303` (BATA_MERAH) and `:1378` (BATAKO) — byte-identical, different AHSP/price |

### 6.3 Parallel price tables for the same AHSP code
| AHSP code | Table A | Table B | Divergence |
|---|---|---|---|
| `A.4.1.1.5` | `src/engine/templateEngine/AhspPriceBridge.ts:27` → **Rp 4,700,000** (`verified: true`) | `src/engine/parametricVolumeEngine/parametricVolumeEngine.ts:200` → **Rp 1,320,000** | **3.56×** — both claim official provenance |

---

## 7. Status legend and distribution

| Status | Meaning | Count |
|---|---|---|
| PASS | formula verified + unit explicit + sourced price + AHSP mapped | **0** |
| WARNING | deterministic formula but missing AHSP mapping and/or unit-region-date provenance | 166 pack calculators |
| HARDCODED | production price or coefficient literal inside the calculator | 24 legacy + 8 server |
| NEEDS_REBUILD | non-deterministic eval or duplicate parallel system | 1 template engine (+ `masterJsonSpec` orphan) |
| FAIL | unexplained magic numbers producing quantities | 1 (`deterministicQtoEngine` literals) |
| NOT_AUDITED | out of scope (price-only engines) | 4 |

> **No calculator earned PASS.** That is the honest result: the quantity layer is largely sound, but not a
> single calculator satisfies all four PASS conditions simultaneously.
