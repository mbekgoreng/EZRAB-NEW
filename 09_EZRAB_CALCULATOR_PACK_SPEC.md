# Calculator Pack Specification

Packs are namespaces and deployment/catalog boundaries over the same Core: `building`, `road`, `paving`, `water-structure`, `bridge`, and `steel`. A pack contributes definitions, schemas, formula sources, domain validators, and tests; it does not fork arithmetic, units, provenance, QTO, RAB, or project authorization.

Initial Building pack contains the 19 legacy identities as `building.legacy.*` aliases. Road, Paving, Water Structure, Bridge, and Steel remain future packs with no Phase 1 implementation. Baja WF is explicitly `NOT_IN_REFERENCE_WORKBOOK` and needs an independent profile/standard source before official formulas.

Pack onboarding requires registry manifest, source matrix, dependency graph, unit list, golden vectors, independent validation, and risk review. New calculator registration must not require changes to RAB, DED, or AI routing.