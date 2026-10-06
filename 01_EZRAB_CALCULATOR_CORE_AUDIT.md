# EZRAB Calculator Core Audit

Tanggal audit: 2026-09-18  
Scope: repository `D:\file kerja\PEMBUATAN SOFTWARE\ezrab site web`, existing 19 calculators, dan target Core Engine Phase 1.

## Executive decision

**PHASE 1: PARTIAL**. Workbook `EZRAB_VOLUME_CALCULATOR_MASTER.xlsx` tersedia dan dapat dibaca, tetapi parity belum terbukti: source map internal menyebut workbook lain, formula-to-input/output mapping belum lengkap, dan implementation melakukan fallback/rounding yang belum dibandingkan terhadap evaluated Excel values. Blueprint dapat dilanjutkan; implementation parity harus blocked sampai evidence matrix lengkap.

## Evidence inventory

| Area | Evidence | Status |
|---|---|---|
| Workbook | `EZRAB_VOLUME_CALCULATOR_MASTER.xlsx`, `EZRAB_VOLUME_CALCULATOR_MASTER_COPY.xlsx` | VERIFIED |
| Extracted workbook data | `all_19_calculators_raw.json`, `audit_meta_sheets.json` | PARTIALLY VERIFIED |
| Registry | `src/engine/constructionCalculators/registry.ts` | PARTIALLY VERIFIED |
| Contract | `src/engine/constructionCalculators/types.ts` | PARTIALLY VERIFIED |
| Formula map | `src/engine/constructionCalculators/masterJsonSpec.ts` | MISMATCH |
| QTO/RAB flow | `src/context/ProjectContext.tsx`, `QtoCalculatorView.tsx` | PARTIALLY VERIFIED |
| Deterministic server tools | `server/services/deterministicQtoEngine.ts`, `calculationService.ts`, `server/tools/toolRegistry.ts` | PARTIALLY VERIFIED |
| AI flow | `server/ai/intent`, `server/ai/agent`, `server/orchestrator` | PARTIALLY VERIFIED |
| Independent golden parity | no complete 19-sheet suite found | BLOCKED |

## Current flow

UI `QtoCalculatorView` → `CONSTRUCTION_CALCULATORS` → `spec.calculate(inputs)` → `executeCalculationAndSave` → CalculationRun/QTO → optional RAB sync. AI intent/entity extraction → tool/agent planner → deterministic tool; AI must not calculate.

## 19-calculator inventory

File/registry/input/output details below are only stated where evidence exists. `registry.ts` is the observed shared file; individual modules, exact input-cell maps, evaluated outputs, and tests are not independently mapped.

| ID | Name | File/registry | Excel sheet | Input/output | Formula source | Dependencies | Units | Tests | Hardcoded values | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | Bowplank | registry.ts | Bowplank | registry params; primary m | workbook map + callback | none observed | m, m², m³, kg | integration only observed | AHSP/price/defaults | PARTIALLY VERIFIED |
| 02 | Pondasi | registry.ts | Pondasi | registry params; multi-breakdown | workbook map + callback | none explicit | m³ and resource units | not mapped | AHSP/price/defaults | PARTIALLY VERIFIED |
| 03 | Foot Plate | registry.ts | Foot Plate | not independently mapped | workbook map claimed | not mapped | not mapped | not mapped | registry values | UNVERIFIED |
| 04 | Sloof | registry.ts | Sloof | not independently mapped | workbook map claimed | not mapped | not mapped | not mapped | registry values | UNVERIFIED |
| 05 | Kolom | registry.ts | Kolom | not independently mapped | workbook map claimed | not mapped | not mapped | not mapped | registry values | UNVERIFIED |
| 06 | Balok | registry.ts | Balok | not independently mapped | workbook map claimed | not mapped | not mapped | not mapped | registry values | UNVERIFIED |
| 07 | Bata Ringan | registry.ts | Bata Ringan | not independently mapped | workbook map claimed | not mapped | not mapped | not mapped | registry values | UNVERIFIED |
| 08 | Bata Merah | registry.ts | Bata Merah | not independently mapped | workbook map claimed | not mapped | not mapped | not mapped | registry values | UNVERIFIED |
| 09 | Batako | registry.ts | Batako | not independently mapped | workbook map claimed | not mapped | not mapped | not mapped | registry values | UNVERIFIED |
| 10 | Pintu & Jendela | registry.ts | Pintu & Jendela | not independently mapped | workbook map claimed | opening deduction unverified | not mapped | not mapped | registry values | UNVERIFIED |
| 11 | Atap Baja Ringan | registry.ts | Atap Baja Ringan | not independently mapped | workbook map claimed | roof chain unverified | not mapped | not mapped | registry values | UNVERIFIED |
| 12 | Plesteran & Acian | registry.ts | Plesteran & Acian | not independently mapped | workbook map claimed | wall/opening chain unverified | not mapped | not mapped | registry values | UNVERIFIED |
| 13 | Penutup Lantai | registry.ts | Penutup Lantai | not independently mapped | workbook map claimed | none explicit | not mapped | not mapped | registry values | UNVERIFIED |
| 14 | Penutup Dinding | registry.ts | Penutup Dinding | not independently mapped | workbook map claimed | wall area unverified | not mapped | not mapped | registry values | UNVERIFIED |
| 15 | Plafon | registry.ts | Plafon | not independently mapped | workbook map claimed | none explicit | not mapped | not mapped | registry values | UNVERIFIED |
| 16 | Pengecatan | registry.ts | Pengecatan | not independently mapped | workbook map claimed | wall/plafon area unverified | not mapped | not mapped | registry values | UNVERIFIED |
| 17 | Kelistrikan | registry.ts | Kelistrikan | not independently mapped | workbook map claimed | count dependency unverified | not mapped | not mapped | registry values | UNVERIFIED |
| 18 | Instalasi Air Bersih | registry.ts | Instalasi Air Bersih | not independently mapped | workbook map claimed | count/length dependency unverified | not mapped | not mapped | registry values | UNVERIFIED |
| 19 | Sanitair | registry.ts | Sanitair | not independently mapped | workbook map claimed | count dependency unverified | not mapped | not mapped | registry values | UNVERIFIED |

WF is **NOT_IN_REFERENCE_WORKBOOK** unless separately sourced; do not treat `wfProfileRegistry.ts` as Excel parity.

## Findings and required controls

1. Adopt hybrid architecture: generic typed kernel + calculator-specific definitions/formulas.
2. Extract formula definitions from callbacks; preserve callback adapter during migration.
3. Remove price/AHSP from Core output unless supplied by authoritative price/AHSP context.
4. Make unit, precision, rounding, provenance, validation, and project context explicit.
5. Reject missing/invalid required inputs; do not silently coerce to defaults.
6. Persist formula ID/version, source, input snapshot, dependency graph, rounding policy, and status.
7. Add independent Excel-vs-TypeScript-vs-reference vectors before any `VERIFIED` claim.

## Gate blockers

Workbook formula cells exist, but evaluated result vectors, exact cell mapping, hidden/merged/rich input semantics, and parity harness are not yet evidenced. Existing `masterJsonSpec.ts` names `RABPRO V.3 2025_UNLOCKED (2).xlsx`, producing a source conflict. Project isolation and direct RAB default price behavior also require remediation before production Core adoption.