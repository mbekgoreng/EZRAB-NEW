# Phase 1 Risk Register

| Risk | Evidence/impact | Mitigation | Status |
|---|---|---|---|
| Workbook/source name conflict | masterJsonSpec names RABPRO workbook | hash and reconcile source | BLOCKED |
| Formula mapping incomplete | callback and partial cell map | cell-level extraction/vector harness | BLOCKED |
| Intermediate rounding | SafeDecimalEngine rounds during calculations | versioned decimal policy and differential tests | PARTIALLY VERIFIED |
| Silent fallback inputs | `sanitize`, `inputs.P || default` | strict schema validation | PARTIALLY VERIFIED |
| Hardcoded AHSP/price | registry and ProjectContext defaults | move to authoritative pricing adapter | MISMATCH |
| Project fallback/stale state | default project/localStorage evidence | server-authoritative context, fail closed | MISMATCH |
| Double counting | dependency ownership not formalized | DAG + quantity ownership guard | UNVERIFIED |
| AI numeric hallucination | extraction/planning path | AI proposal only; Core executes | PARTIALLY VERIFIED |
| WF source absent | not part of workbook evidence | separate source and status | NOT_IN_REFERENCE_WORKBOOK |
| Test timeout/environment | tsc/npm test exceeded runner limit | rerun with controlled timeout/CI | BLOCKED |