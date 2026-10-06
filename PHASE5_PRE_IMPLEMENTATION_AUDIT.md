# PHASE 5 — PRE-IMPLEMENTATION AUDIT
## Residential Building Quantity Takeoff Pack

**Date:** 2026-09-18  
**Scope:** 30 Basic Residential Building Quantity Capabilities  
**Architecture:** Shared Generic Primitives + Domain Variant Engines  

---

### 1. Architectural Strategy: Reusable Engines vs. Discrete Capabilities

In accordance with Phase 5 guidelines, 30 capabilities **do not equal 30 independent formula engines**. Instead, they are organized around 8 unified deterministic calculation engines:

| Shared Engine | Capabilities Powered |
|---|---|
| **Earthwork & Ground Engine** | 01 Cut & Fill, 02 Galian Tanah, 03 Urugan Tanah |
| **Fill Layer Engine** | 04 Pasir/Batu Urug, 06 Lantai Kerja |
| **Generic Concrete Engine** | 05 Pondasi Batu Kali, 07 Beton, 25 Sloof, 26 Kolom, 27 Balok, 28 Plat Lantai, 29 Tangga Beton, 30 Footing |
| **Reinforcement Schedule Engine** | 08 Pembesian (Shared across all concrete structural members) |
| **Formwork Quantity Engine** | 09 Bekisting (Active face selection: soffit, side, end, riser, landing) |
| **Wall & Opening Engine** | 10 Dinding, 18 Pintu & Jendela (Opening deduction with gross/net state tracking) |
| **Finishing & Surface Engine** | 11 Plester & Acian, 12 Penutup Lantai, 13 Penutup Dinding, 14 Plafon, 15 Pengecatan |
| **Roof Geometry Engine** | 16 Atap Baja Ringan, 17 Penutup Atap, 19 Talang & Lisplank |
| **MEP & Fixture Engine** | 20 Instalasi Listrik, 21 Air Bersih, 22 Air Kotor & Bekas, 23 Sanitair, 24 Drainase |

---

### 2. Capability-by-Capability Mapping & Reuse Matrix

| # | Requested Capability | Existing Calculator / Engine | Action Decision | Source / Parity Availability | Implementation Plan |
|---|---|---|---|---|---|
| 01 | `CUT_AND_FILL` | None (New) | **NEW ENGINE** | Geometric rules (Grid/Uniform) | Rectangular & Grid-based Cut & Fill with net volume output |
| 02 | `GALIAN_TANAH` | `building.earthwork.galian` | **REUSE / EXTEND** | Verified geometric formula | Rectangular & Trapezoidal trench/pit excavation |
| 03 | `URUGAN_TANAH` | None (New) | **NEW VARIANT** | Geometric volume | Layered backfill / subgrade filling |
| 04 | `PASIR_BATU_URUG` | None (New) | **NEW VARIANT** | Geometric layer ($A \times t$) | Fill layer engine with material variants (sand, gravel, stone) |
| 05 | `PONDASI_BATU_KALI` | `PONDASI` (Legacy 02) | **REUSE & WRAP** | Master Workbook (`Pondasi`) | Trapezoidal section $\times L \times n$, 100% Phase 3 parity |
| 06 | `LANTAI_KERJA` | None (New) | **NEW VARIANT** | Geometric layer ($L \times W \times t$) | Lean concrete / blinding slab layer |
| 07 | `BETON` | None (New Generic) | **NEW GENERIC** | Standard Solid Geometry | Generic solid/prism concrete volume with multiple segments |
| 08 | `PEMBESIAN` | Partial inside legacy | **NEW GENERIC** | SNI density ($7850\text{ kg/m}^3$) | Bar schedule: diameter, cut length, count, total weight |
| 09 | `BEKISTING` | Partial inside legacy | **NEW GENERIC** | Surface Area Geometry | Configurable face selection (soffit, sides, edges) |
| 10 | `DINDING` | `BATA_RINGAN`, `BATA_MERAH`, `BATAKO` | **REUSE & WRAP** | Master Workbook (Sheets 7, 8, 9) | Wall engine with explicit opening deductions (gross/net tracking) |
| 11 | `PLESTER_ACIAN` | `PLESTERAN_ACIAN` (Legacy 12) | **REUSE & EXTEND** | Master Workbook (`Plesteran & Acian`) | Single / 2-face wall plastering and skim coating |
| 12 | `PENUTUP_LANTAI` | `PENUTUP_LANTAI` (Legacy 13) | **REUSE & EXTEND** | Master Workbook (`Penutup Lantai`) | Net floor area with tile dimensions / effective face area |
| 13 | `PENUTUP_DINDING` | `PENUTUP_DINDING` (Legacy 14) | **REUSE & EXTEND** | Master Workbook (`Penutup Dinding`) | Net wall tile area with perimeter $\times$ height |
| 14 | `PLAFON` | `PLAFON` (Legacy 15) | **REUSE & EXTEND** | Master Workbook (`Plafon`) | Ceiling area minus voids plus bulkhead drops |
| 15 | `PENGECATAN` | `PENGECATAN` (Legacy 16) | **REUSE & EXTEND** | Master Workbook (`Pengecatan`) | Surface area $\times$ coats / coverage rate |
| 16 | `ATAP_BAJA_RINGAN` | `ATAP_BAJA_RINGAN` (Legacy 11) | **REUSE & EXTEND** | Master Workbook (`Atap Baja Ringan`) | True sloped 3D roof area: $(L+2\cdot Ov)(W+2\cdot Ov)/\cos(\theta)$ |
| 17 | `PENUTUP_ATAP` | Derived from Roof Geom | **NEW VARIANT** | Roof Geometry Output | Sloped roof area with effective tile/sheet coverage |
| 18 | `PINTU_JENDELA` | `PINTU_JENDELA` (Legacy 10) | **REUSE & EXTEND** | Master Workbook (`Pintu & Jendela`) | Opening schedule: count, area, perimeter (feeds Wall Engine) |
| 19 | `TALANG_LISPLANK` | None (New) | **NEW VARIANT** | Roof Edge Geometry | Linear runs for eave, valley, ridge, fascia board, flashing |
| 20 | `INSTALASI_LISTRIK_BASIC`| `KELISTRIKAN` (Legacy 17) | **REUSE & EXTEND** | Master Workbook (`Kelistrikan`) | Point schedule: lighting, switches, sockets, conduit length |
| 21 | `INSTALASI_AIR_BERSIH` | `AIR_BERSIH` (Legacy 18) | **REUSE & EXTEND** | Master Workbook (`Instalasi Air Bersih`)| Clean water route segments: main, branch, fittings, valves |
| 22 | `AIR_KOTOR_BEKAS` | None (New) | **NEW VARIANT** | Plumbing standard routes | Soil, waste, vent pipe linear runs + floor drains/traps |
| 23 | `SANITAIR` | `SANITAIR` (Legacy 19) | **REUSE & EXTEND** | Master Workbook (`Sanitair`) | Fixture schedule: closet, basin, shower, floor drain |
| 24 | `DRAINASE` | `UDITCH` (Legacy pack) | **REUSE & EXTEND** | Standard channel geometry | Rectangular/trapezoidal drainage channel excavation and volume |
| 25 | `SLOOF` | `SLOOF` (Legacy 04) | **REUSE & WRAP** | Master Workbook (`Sloof`) | Concrete $b \times h \times L \times n$ + rebar + formwork |
| 26 | `KOLOM` | `KOLOM` (Legacy 05) | **REUSE & WRAP** | Master Workbook (`Kolom`) | Concrete $b \times h \times H \times n$ + rebar + formwork |
| 27 | `BALOK` | `BALOK` (Legacy 06) | **REUSE & WRAP** | Master Workbook (`Balok`) | Concrete $b \times h \times L \times n$ + rebar + formwork |
| 28 | `PLAT_LANTAI` | None (New Concrete Var)| **NEW VARIANT** | Slab geometry ($A \times t$) | Gross slab area - void area $\times$ thickness |
| 29 | `TANGGA_BETON` | None (New Concrete Var)| **NEW VARIANT** | Stair geometry | Waist slab + step wedges + landing volume |
| 30 | `PONDASI_BETON_FOOTING`| `FOOT_PLATE` (Legacy 03) | **REUSE & WRAP** | Master Workbook (`Foot Plate`) | Pad footing: column stub + stepped/sloped footing pad |

---

### 3. Non-Negotiable Boundary Checks
1. **Zero Financial Contamination:** No AHSP codes, unit prices, labor costs, or material prices inside calculation formulas.
2. **Project Isolation:** All QTO and calculation runs require an explicit `projectId`.
3. **Phase 3 Parity Preservation:** All 19 legacy calculators wrapped by the pack preserve 100% exact parity with `EZRAB_VOLUME_CALCULATOR_MASTER.xlsx`.
4. **Pure Quantity Focus:** Physical dimensions only ($m, m^2, m^3, \text{unit}, \text{kg}, \text{titik}$). No structural design, capacity checks, or member sizing.
