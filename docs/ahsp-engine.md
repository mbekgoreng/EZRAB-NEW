# EZRAB AHSP Engine Architecture & Specification

## 1. Overview
The **EZRAB AHSP Engine** is a deterministic, versioned, and auditable calculation layer for Indonesian Public Works Construction Analysis (Analisis Harga Satuan Pekerjaan). It enforces strict provenance, prevents guessing/hallucination of coefficients, and adheres to official government baseline standards.

## 2. Standards Baseline
- **SE DJBK 47/SE/Dk/2026**
- **Lampiran IV** — AHSP Bidang Sumber Daya Air (SDA)
- **Lampiran V** — AHSP Bidang Bina Marga (Jalan dan Jembatan)
- **Lampiran VI** — AHSP Bidang Cipta Karya (Gedung dan Permukiman)

## 3. Core Engine Components

```
                   [ Raw Document Input ]
                             ↓
                 AHSP Import Pipeline
      (Parser → Normalizer → Validator → Registration)
                             ↓
                   ┌───────────────────┐
                   │   AHSP Master     │
                   │   & Component     │
                   │   Definitions     │
                   └─────────┬─────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     ↓                       ↓                       ↓
AHSP Resolver        Resource Matcher       Unit Compatibility
(Exact / Normalized  (Code, Name, Category  (Dimensional checks
  / Ambiguity)         & Unit compatibility) via UnitEngine)
     │                       │                       │
     └───────────────────────┼───────────────────────┘
                             ↓
                     AHSP Calculator
          (LaborCost, MaterialCost, EquipmentCost,
                 DirectCost, Audit Trail)
```

### 3.1. Normalization & Audit Integrity
- **Codes**: Canonical dot-separated format (`A.2.2.1.4`, `3.1.(1)`).
- **Text & Names**: Diacritic-free, trimmed, lowercase normalization for deterministic matching while preserving `original_name` for audit reports.
- **Units**: Standardized via `UnitEngine` (e.g. `m'`, `m1` → `m`; `m2`, `m²` → `m²`; `org/hari` → `OH`).

### 3.2. Deterministic Resolver Priority
1. **Exact Code Match**: Code lookup (case/space-insensitive).
2. **Exact Normalized Name Match**: Matches against verified title.
3. **Approved Alias Match**: Matches predefined official aliases.
4. **Ambiguity Handler**: If multiple candidates match equally, the resolver returns `AMBIGUOUS_AHSP` with `candidates[]` instead of picking silently.
5. **No Match**: Returns `AHSP_NOT_FOUND`.

### 3.3. Unit Compatibility & Cost Composition
- Verifies that component units are dimensionally compatible before calculation.
- Calculates sub-totals: `laborCost`, `materialCost`, `equipmentCost`, and `directCost`.
- Generates auditable provenance records for every calculation step.
