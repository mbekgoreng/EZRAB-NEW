# Phase 1 Implementation Plan

## Work packages

1. Freeze/audit: preserve legacy registry; hash workbook and extracted JSON; resolve source-name conflict.
2. Contracts: implement typed input/output, status vocabulary, provenance, precision and validation policies.
3. Kernel: decimal arithmetic, explicit units, deterministic dependency DAG, duplicate quantity guard.
4. Registry: versioned namespaced definitions and legacy adapter; remove price responsibility.
5. Evidence: extract every sheet formula/input/output/hidden range and evaluated vectors; build Excel/TS/reference harness.
6. Pilot: migrate Bowplank and Pondasi only; compare legacy/core/Excel/reference.
7. Integration: QTO adapter stores provenance/dependencies; RAB adapter requires authoritative AHSP/price context; fail closed on absent project.
8. Gate: review test evidence and upgrade statuses individually.

## Explicitly out of scope

No complete road/bridge/water/paving/steel pack, no AI/provider redesign, no framework migration, no RAB/DED redesign, and no deletion of legacy tests/formulas.

## Exit criteria

All 19 have inventory and source mapping; pilot has independent vectors; project context is authoritative; no hardcoded prices in Core; precision policy is documented; all unresolved items remain `UNVERIFIED` or `BLOCKED`. Phase 2 starts only after this gate.