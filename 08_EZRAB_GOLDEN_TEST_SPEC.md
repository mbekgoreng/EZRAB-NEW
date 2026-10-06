# Golden Test and Independent Validation Specification

Every calculator requires independently authored vectors: normal, edge, valid zero, invalid, and dependency case. Expected values must come from workbook evaluated cells, a verified external reference, or an independently implemented calculation—not the implementation under test.

Three-way harness: same normalized input → Excel result → TypeScript Core result → independent Python/reference result. Record raw values, tolerance, rounding policy, formula/source IDs, and status. Separate gates: `CODE TEST` (implementation behavior), `REFERENCE PARITY` (Excel/reference comparison), and `HUMAN VALIDATION` (domain review).

Minimum acceptance: deterministic repeatability, unit conversion vectors, no intermediate-rounding regression, invalid-input rejection, dependency lineage, duplicate-deduction rejection, project isolation, and price absence from quantity Core. A passing test cannot upgrade parity without source evidence.