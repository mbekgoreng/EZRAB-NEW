# EZRAB — DATABASE & COST ENGINE ARCHITECTURE AUDIT
**Document Code:** `DATABASE_ARCHITECTURE_AUDIT.md`  
**Phase:** Phase 0 & Phase 1 — Comprehensive Forensic Audit & Single Source of Truth  
**Author:** Senior Construction Estimating Architect & Forensic Code Auditor  
**Date:** October 2026  
**Status:** CANONICAL / ACTIONABLE  

---

## 1. EXECUTIVE SUMMARY & FORENSIC FINDINGS

Following rigorous forensic audit of the EZRAB codebase and evaluation against the Golden Test Case (`pdf-gambar-rumah-1-lantai_compress(3).pdf`), catastrophic pricing and matching anomalies were diagnosed:

### 1.1 Root Cause Diagnosis of Failures

| Failure in Golden Test | Value Produced | True Engineering Reality | Root Cause in Codebase |
|---|---|---|---|
| **Pembesian Tulangan** | 177,92 kg @ **Rp 3.864.000/kg** (Total Rp 687.482.880) | Standar Pembesian: Rp 14.500 – Rp 22.000 / kg | 1. `PriceResolver` matched Tukang Besi / labor or an unvetted composite item.<br>2. Absence of magnitude validator allowed a ~200× price inflation to pass to final RAB.<br>3. Unit mismatch between kg and unit/OH was unchecked. |
| **Beton Ringbalk 15x20** | **Rp 280.997.641 / unit** | Standar Beton Ringbalk Gedung: Rp 950.000 – Rp 1.450.000 / m³ | 1. `ReferenceAhspProvider` searched token `"beton"` without domain filtering.<br>2. Matched Bina Marga `7.2.(1a)`: *Unit Pracetak Gelagar Beton Pratekan bentang 32 m* (Heavy highway bridge girder).<br>3. Unit `unit` was accepted instead of requiring canonical `m3`. |
| **Pasir Urug** | **Rp 782.000 / unit** | Standar Pasir Urug: Rp 160.000 – Rp 260.000 / m³ | 1. Coerced to `unit`, triggering fallback in uncurated `masterMaterials2026.json` (Item `MAT-CK-07596` U-Ditch maxPrice 782.000).<br>2. Unit mismatch `m3` -> `unit` permitted. |
| **Pervasive `AI_ESTIMATED`** | Countless items marked `AI_ESTIMATED` @ Rp 100.000 | Transparent `MISSING` / `NEEDS_REVIEW` | `priceResolutionEngine.ts` lines 78–94 had a hardcoded silent fallback: `fallbackUnitPrice = 100000`, masking missing database entries as AI estimates. |
| **Total RAB Absurdity** | **Rp 1.043.484.339** for 1-storey small house | Wajar: Rp 150.000.000 – Rp 250.000.000 | Sum of the above anomalies completely corrupted the final bill of quantities. |

---

## 2. DATASET INVENTORY: CANONICAL VS LEGACY VS DUPLICATE

| Dataset File | Size / Items | Classification | Production Role | Action Required |
|---|---|---|---|---|
| `src/data/nationalCostDatabase/ahsp2026Canonical.generated.ts` | 5,801 items (SE 47/2026) | **CANONICAL AHSP** | Official PUPR 2026 items with full component breakdowns (SMKK, SDA, Bina Marga, Cipta Karya). | **Single Source of Truth** for AHSP recipes. Requires strict domain filtering (`CIPTA_KARYA` for buildings). |
| `src/data/nationalCostDatabase/officialSmkk2026.ts` | 190 items | **CANONICAL SMKK** | Official K3 / SMKK items with verified coefficients. | Ingested via `masterRegistry.ts`. |
| `src/data/nationalCostDatabase/officialCiptaKaryaPrices2026.ts` | Materials, Labor, Equipment | **CANONICAL CK PRICES** | Official 2026 base resource rates for building construction. | Authoritative base pricing for Cipta Karya building components. |
| `src/data/nationalCostDatabase/officialCiptaKaryaDhsp2026.ts` | Official DHSP Building | **CANONICAL CK DHSP** | Composite HSP building unit prices and overheads. | Verified against component calculations. |
| `src/data/nationalCostDatabase/officialBinaMargaDhsp2026.ts` | Official DHSP Roads/Bridges | **CANONICAL BM DHSP** | Heavy civil road & bridge items. | **ISOLATE**: Must NEVER match residential/building items unless explicitly requested. |
| `src/data/nationalCostDatabase/officialHSD2026.ts` | 231 items | **CANONICAL HSD 2026** | Official national reference base material/labor prices. | Production reference. |
| `src/data/priceDatabase2026/priceMaster.generated.ts` | 309 matched items | **CANONICAL MASTER PRICES** | Audited runtime resource prices. | Verified & kept. |
| `src/data/indonesianAHSP.ts` | 197 items | **LEGACY (2022)** | Permen PUPR 01/2022 dataset. | Kept for historical backwards compatibility only. Secondary priority behind 2026. |
| `src/data/indonesianPrices.ts` | 155 items | **LEGACY COMMERCIAL** | 2022 commercial reference prices. | Subordinated to 2026 Canonical. |
| `src/data/masterMaterials2026.json` | 9,035 uncurated items | **UNFILTERED / UNCURATED** | Contains unvetted duplicates and misaligned units (e.g. U-Ditch @ 782.000). | **RESTRICT**: Must NOT override canonical resources; require exact unit and spec match. |

---

## 3. DEPENDENCY & RESOLUTION FLOW GRAPH

```mermaid
flowchart TD
    DED[DED Drawings / BoQ Element] --> DN[Construction Normalizer]
    DN --> DOMAIN{Domain Detection}
    DOMAIN -->|Residential / Building| CK[CIPTA_KARYA Building Catalog]
    DOMAIN -->|Road / Highway| BM[BINA_MARGA Catalog]
    DOMAIN -->|Water / River / Weir| SDA[SUMBER_DAYA_AIR Catalog]

    CK --> AM[Canonical AHSP Matcher]
    AM -->|Compatible Spec & Unit| AR[Matched AHSP Item]
    AM -->|No Compatible Match| MISSING_AHSP[Flag: AHSP_UNRESOLVED]

    AR --> CE[Central Deterministic Cost Engine]
    CE --> CR[Component Breakdown: Material, Labor, Equipment]
    
    CR --> PR[Canonical Resource Price Resolver]
    PR --> TIER1{Project Override?}
    TIER1 -->|Yes| P1[Project Price]
    TIER1 -->|No| TIER2{Official CK/HSD 2026?}
    TIER2 -->|Yes| P2[Official Price]
    TIER2 -->|No| TIER3{Regional Benchmark?}
    TIER3 -->|Yes| P3[Regional Price]
    TIER3 -->|No| FAIL_PRICE[Status: MISSING - NEVER SILENT FALLBACK]

    P1 & P2 & P3 --> PSV{Price Sanity Validator}
    PSV -->|Passes Magnitude & Unit Bounds| OK_PRICE[Valid Resource Price]
    PSV -->|Exceeds Bound e.g. Rebar > 30k/kg| REJECT_PRICE[Status: PRICE_INVALID]

    OK_PRICE --> SUM[Deterministic HSP Calculation: SUM(coef * price)]
    SUM --> RAB[Final RAB BoQ Row]
    MISSING_AHSP & FAIL_PRICE & REJECT_PRICE --> WARN[User Attention Required / Manual Override]
```

---

## 4. ARCHITECTURAL MANDATES

1. **Strict Domain Isolation:** Residential / building projects MUST query `CIPTA_KARYA` first. `BINA_MARGA` (bridges, highways) and `SUMBER_DAYA_AIR` (dams, weirs) are segregated.
2. **Canonical Unit Protection:** Rebar is strictly `kg`. Concrete is strictly `m3`. Sand/gravel is strictly `m3`. Coercion across dimensional classes (`kg -> unit`, `m3 -> unit`) is strictly forbidden.
3. **Price Sanity Gate:** Steel rebar > Rp 30.000/kg or < Rp 5.000/kg is immediately rejected as `PRICE_INVALID`. Concrete > Rp 2.500.000/m3 is rejected.
4. **No Silent Fallback:** The 100.000 IDR silent fallback and flat `AI_ESTIMATED` labels are completely eradicated. Unresolved prices fail closed with explicit status `MISSING` / `NEEDS_REVIEW`.
