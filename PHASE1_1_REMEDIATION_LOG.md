# Phase 1.1 Remediation Log

| Blocker | Action | Evidence | Status |
|---|---|---|---|
| Workbook identity | inventory and hash every workbook; reconcile internal names | phase1_1_workbook_inventory.json; masterJsonSpec.ts | PARTIALLY VERIFIED |
| Formula mapping | extract formulas/cells and preserve unknowns | phase1_1_formula_map.json | PARTIALLY VERIFIED |
| Golden vectors | distinguish evaluated Excel values from formulas | phase1_1_golden_vectors.json | BLOCKED |
| Independent reference | never import production calculators | phase1_1_independent_vectors.json | BLOCKED |
| Price/AHSP | isolate legacy defaults behind adapter | PHASE1_1_HARDCODE_AUDIT.md; ProjectContext | PARTIALLY VERIFIED |
| Project context | test fail-closed and ownership | PHASE1_1_PROJECT_ISOLATION_AUDIT.md; ProjectContext | PARTIALLY VERIFIED |
| Dependencies | publish DAG only with evidence | phase1_1_dependency_graph.json | UNVERIFIED |
| Test runner | targeted and full reproducible commands | PHASE1_1_TEST_EXECUTION_REPORT.md | BLOCKED |