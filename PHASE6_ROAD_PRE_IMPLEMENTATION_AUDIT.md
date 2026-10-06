# EZRAB — PHASE 6: ROAD & HIGHWAY QUANTITY CALCULATOR PACK
## PRE-IMPLEMENTATION GAP AUDIT

**Date:** 2026-09-18  
**Scope:** Quantity Takeoff (QTO) for Road & Highway Civil Infrastructure (39 Calculator Capabilities).  
**Strict Boundary:** Physical quantities only. Excludes AHSP, pricing, equipment rates, structural design, pavement design, traffic engineering, and hydraulic sizing.

---

### 1. Existing Reusable Engines & Assets

| Existing Engine / Asset | Path | Reusability in Road Pack | Status |
| :--- | :--- | :--- | :--- |
| `SafeDecimalEngine` | `src/engine/safeDecimalEngine.ts` | 100% reusable for all deterministic arithmetic, division, and rounding | ✅ REUSE |
| `CoreCalculatorRegistry` | `src/engine/calculatorCore/registry/` | Registry for versioned calculator definitions, metadata, inputs/outputs | ✅ REUSE |
| `QtoAdapter` | `src/engine/calculatorCore/adapters/qtoAdapter.ts` | Mapping calculator outputs to immutable QTO lines and lineage | ✅ REUSE |
| `earthworkEngine` | `src/engine/calculatorCore/residential/engines/` | Reusable for basic site excavation/fill; needs extension for Stationing & End Area | 🔄 EXTEND |
| `fillLayerEngine` | `src/engine/calculatorCore/residential/engines/` | Base $L \times W \times t$ layer logic; needs extension for Road Pavement Stack | 🔄 EXTEND |
| `concreteQuantityEngine` | `src/engine/calculatorCore/residential/engines/` | Reusable for Sign Foundation, Rigid Pavement, Kerb, and Barrier solids | ✅ REUSE |
| `reinforcementQuantityEngine` | `src/engine/calculatorCore/residential/engines/` | Reusable for dowel bars, tie bars, and foundation rebar takeoff | ✅ REUSE |
| `formworkQuantityEngine` | `src/engine/calculatorCore/residential/engines/` | Reusable for pavement header forms, barrier forms, and footing forms | ✅ REUSE |
| `QtoCalculatorView` | `src/components/qto/QtoCalculatorView.tsx` | Web UI Catalog Hub, Search, 3-Part Runner, and QTO Sync | ✅ REUSE |

---

### 2. Required New Road Generic Engines

| New Engine | Target File | Purpose | Outputs |
| :--- | :--- | :--- | :--- |
| **`RoadAlignmentEngine`** | `src/engine/calculatorCore/road/engines/roadAlignmentEngine.ts` | Chainage parsing (`STA 0+000`), station intervals, segment lengths, tangent vs curve lengths | Alignment length ($m$), segment list, station IDs |
| **`RoadEarthworkCrossSectionEngine`** | `src/engine/calculatorCore/road/engines/roadEarthworkEngine.ts` | Average End Area volume: $V = \frac{A_1 + A_2}{2} \times L$, cut/fill cross-sections, borrow & disposal | Cut ($m^3$), Fill ($m^3$), Disposal ($m^3$), Borrow ($m^3$) |
| **`RoadPavementLayerEngine`** | `src/engine/calculatorCore/road/engines/roadPavementLayerEngine.ts` | Multi-layer pavement takeoff: Subgrade, Subbase, Base Class A/B, CTB, Lean Concrete, Rigid, Asphalt (Base/Binder/Wearing) | Area ($m^2$), Volume ($m^3$), Mass ($ton$ only if density sourced) |
| **`RoadSurfaceTreatmentEngine`** | `src/engine/calculatorCore/road/engines/roadSurfaceTreatmentEngine.ts` | Prime Coat & Tack Coat spray area and volume (requires explicit application rate) | Spray Area ($m^2$), Emulsion Volume (liter) |
| **`RoadElementsEngine`** | `src/engine/calculatorCore/road/engines/roadElementsEngine.ts` | Shoulder (paved/gravel), Median, Kerb (precast/cast-in-place), Side Ditch, Drainage Channel | Area ($m^2$), Volume ($m^3$), Length ($m'$), Kerb count |
| **`GeosyntheticQuantityEngine`** | `src/engine/calculatorCore/road/engines/geosyntheticQuantityEngine.ts` | Geotextile & Geogrid installed area, seam overlap ($m^2$) | Net Area ($m^2$), Gross Area ($m^2$ with explicit overlap) |
| **`RoadSafetyAccessoriesEngine`** | `src/engine/calculatorCore/road/engines/roadSafetyAccessoriesEngine.ts` | Thermoplastic Road Marking, Guardrail W-Beam & Posts, Jersey Barrier, Delineator, Sign Footing | Marking Area ($m^2$), Guardrail ($m'$), Post count, Concrete ($m^3$) |
| **`RoadJointEngine`** | `src/engine/calculatorCore/road/engines/roadJointEngine.ts` | Longitudinal/Transverse Contraction Joints, Expansion Joints, Dowels, Tie Bars | Joint length ($m'$), Dowel count/mass, Sealant volume ($m^3$) |
| **`RoadHaulingEngine`** | `src/engine/calculatorCore/road/engines/roadHaulingEngine.ts` | Material hauling physical work: Volume $\times$ Distance ($m^3\cdot km$) | Volume ($m^3$), Distance ($km$), Volume-Distance ($m^3\cdot km$) |
| **`RoadOwnershipEngine`** | `src/engine/calculatorCore/road/engines/roadOwnershipEngine.ts` | Anti-duplication keys across road hierarchy to guarantee single quantity producer | Scoped Ownership Keys, Deduplication Policy |

---

### 3. Gap Analysis: 39 Target Capabilities vs Existing Engine

| Category | Target Calculator IDs | Existing Equivalent | Action Required |
| :--- | :--- | :--- | :--- |
| **Core Road (11)** | `road.alignment`, `road.stationing`, `road.chainage`, `road.cross_section`, `road.earthwork`, `road.cut`, `road.fill`, `road.embankment`, `road.excavation`, `road.disposal`, `road.borrow_material` | Basic earthwork in residential | Implement `roadAlignmentEngine` and `roadEarthworkEngine` with Average End Area and station chainage. |
| **Pavement (7)** | `road.subgrade`, `road.selected_material`, `road.granular_subbase`, `road.aggregate_base`, `road.cement_treated_base`, `road.lean_concrete`, `road.rigid_pavement` | General concrete / fill | Implement `roadPavementLayerEngine` with structured thickness and lane width parameters. |
| **Asphalt (6)** | `road.asphalt_base`, `road.asphalt_binder`, `road.asphalt_wearing_course`, `road.prime_coat`, `road.tack_coat`, `road.asphalt_surface` | Legacy Jalan Aspal | Implement dedicated asphalt layer engines with strict density & application rate provenance checks. |
| **Road Elements (5)** | `road.shoulder`, `road.median`, `road.kerb`, `road.side_ditch`, `road.road_drainage` | None / Residential drain | Implement `roadElementsEngine` supporting unpaved/paved shoulders, trapezoidal/rectangular ditches, and kerb profiles. |
| **Geosynthetic (2)** | `road.geotextile`, `road.geogrid` | None | Implement `geosyntheticQuantityEngine` with explicit overlap parameter handling. |
| **Road Safety (5)** | `road.road_marking`, `road.guardrail`, `road.traffic_barrier`, `road.road_delineator`, `road.road_sign_foundation` | None | Implement `roadSafetyAccessoriesEngine` for marking area, w-beam length, barrier concrete, sign footings. |
| **Joint / Special (2)**| `road.pavement_joint`, `road.expansion_joint` | None | Implement `roadJointEngine` for rigid pavement contraction/expansion joints, dowels, and sealant. |
| **Hauling (1)** | `road.material_hauling` | None | Implement `roadHaulingEngine` for physical $m^3 \cdot km$ takeoff. |

---

### 4. Anti-Duplication & Ownership Matrix

```text
[Road DED Entity]
       │
       ├──> [Road Alignment / Chainage] (Owner: road.alignment / road.chainage)
       │
       ├──> [Earthwork Station Sections] (Owner: road.earthwork)
       │         ├──> road.cut (Reference sub-quantity)
       │         ├──> road.fill (Reference sub-quantity)
       │         └──> road.borrow_material / road.disposal (Volume derivation)
       │
       ├──> [Pavement Structure Stack]
       │         ├──> Subgrade (Owner: road.subgrade)
       │         ├──> Granular Subbase (Owner: road.granular_subbase)
       │         ├──> Aggregate Base (Owner: road.aggregate_base)
       │         ├──> CTB / Lean Concrete (Owner: road.cement_treated_base / road.lean_concrete)
       │         ├──> Rigid Pavement / Asphalt Base (Owner: road.rigid_pavement / road.asphalt_base)
       │         ├──> Binder Course (Owner: road.asphalt_binder)
       │         └──> Wearing Course (Owner: road.asphalt_wearing_course / road.asphalt_surface)
       │
       ├──> [Road Elements & Appurtenances]
       │         ├──> Shoulders (Owner: road.shoulder)
       │         ├──> Median (Owner: road.median)
       │         ├──> Kerb (Owner: road.kerb)
       │         └──> Ditch & Drainage (Owner: road.side_ditch / road.road_drainage)
       │
       └──> [Safety, Joints & Geosynthetics]
                 ├──> Geosynthetics (Owner: road.geotextile / road.geogrid)
                 ├──> Road Marking & Guardrail (Owner: road.road_marking / road.guardrail)
                 └──> Pavement Joints (Owner: road.pavement_joint)
```

Each item produces an immutable ownership key:
`ownerKey = ${projectId}::${roadEntityId}::${quantityKind}::${segmentId}::${layerId}`

---

### 5. Source & Provenance Policy

1. **No Assumed Density**: Asphalt density (e.g. $2.30 - 2.40\text{ ton/m}^3$) is calculated **only** when provided as an explicit input or sourced from approved JMF / Spesifikasi Umum Bina Marga 2018/2026.
2. **No Assumed Application Rate**: Prime coat ($0.4 - 1.3\text{ L/m}^2$) and Tack coat ($0.15 - 0.5\text{ L/m}^2$) require explicit rates; otherwise return surface area and flag `"NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE"`.
3. **No Automatic Sizing / Hydraulic Design**: Ditch dimensions and road cross-sections are geometric inputs only.
4. **No Productivity / Equipment Costing**: Road pack outputs pure physical quantities ($m$, $m^2$, $m^3$, $kg$, $unit$, $m^3\cdot km$).

---

### 6. Audit Verdict

- **Existing Infrastructure**: Solid base in `calculatorCore`, `SafeDecimalEngine`, `QtoAdapter`, and `QtoCalculatorView`.
- **Implementation Strategy**: Build 9 specialized road generic engines under `src/engine/calculatorCore/road/engines/`, define 39 calculator definitions in `src/engine/calculatorCore/road/roadPackCalculators.ts`, register in `calculatorRegistry.ts`, expose in `QtoCalculatorView.tsx` under category `ROAD`, and write comprehensive test suite with 25+ golden vectors.
- **Proceed to Implementation**: Ready.
