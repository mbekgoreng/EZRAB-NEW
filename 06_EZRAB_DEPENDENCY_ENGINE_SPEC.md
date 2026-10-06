# Dependency Engine Specification

Dependencies are explicit DAG edges with input/output contracts, version pins, and quantity ownership. Planner rejects cycles, missing nodes, incompatible units, duplicate producers, and cross-project references.

Examples: `wall.net_area -> plaster.area -> acian.area -> painting.area`; `roof.geometry -> roof.framing -> roof.covering`; `openings.area -> wall.net_area`.

Each output declares `quantityOwnership: produced|derived|consumed`. A derived consumer must reference the upstream output ID, not copy a number. Deduction policy records gross area, each opening, and net area. If a consumer receives net area, it cannot deduct openings again; duplicate deduction is a validation error/warning according to policy.

Execution is topological, memoized by project/version/input hash, and deterministic. Dependency snapshots are embedded in output provenance and QTO lineage.