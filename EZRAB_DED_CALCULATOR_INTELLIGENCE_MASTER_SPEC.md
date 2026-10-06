# EZRAB DED → Calculator Intelligence Master Specification

**Status:** Master specification for Antigravity implementation. **Scope:** evidence interpretation, entity construction, deterministic calculator selection, input mapping, quantity execution, QTO proposal, and RAB hand-off. **Out of scope:** formula invention, AHSP, pricing, productivity, structural/hydraulic/electrical engineering design, and UI redesign.

## 1. Executive Summary

Calculator Intelligence is the controlled bridge between untrusted DED interpretation and authoritative deterministic Core:

```text
DED → Document → Page → Region → Evidence → Extracted Fact → Entity
→ Capability Registry → Applicability/Input/Dependency/Ownership validation
→ Deterministic Calculator → Result Validation → QTO Proposal
→ User Confirmation → QTO Commit → AHSP → Pricing → Cost → RAB
```

AI interprets, extracts, classifies, maps, clarifies, and explains. Core owns project context, registry capability, units, formulas, dependencies, ownership, quantity, and committed data.

## 2. Design Principles

1. Identical normalized inputs, versions, dependencies, and policies produce identical results.
2. Every input traces to evidence, an approved dependency output, or explicit user input.
3. Missing values produce `MISSING_INPUT/BLOCKED_INPUT`; ambiguity produces `AMBIGUOUS`.
4. AI output is untrusted until schema, source, authorization, and Core validation pass.
5. Registry rules—not an LLM—select executable calculators.
6. One authoritative producer exists for each physical quantity key.
7. Unit conversion uses the existing UnitEngine and is recorded.
8. AI confidence, mathematical correctness, and engineering validity are separate dimensions.
9. Project context is authoritative and fail-closed; no last/default/localStorage/LLM project fallback.
10. Historical results retain immutable calculator, registry, schema, source, formula, and policy versions.
11. Conflicts, low confidence, missing sources, and ownership collisions require review.
12. Quantity ends at QTO; AHSP and pricing consume approved QTO and never alter geometry.

AI must not calculate final quantity freely, invent dimensions/volumes/coefficients/AHSP/prices/materials, fill missing inputs, or approve engineering.

## 3. Current EZRAB Architecture Integration

This specification reuses the existing Generic Calculator Core, UnitEngine, PrecisionEngine, ValidationEngine, DependencyEngine, ProvenanceEngine, ExecutionTrace, Calculator Registry, QTO Adapter, RAB Adapter, AHSP Resolver, Pricing Resolver, Cost Composition Engine, Project Context, project isolation, and ownership guard.

| Component | Intelligence role | Boundary |
|---|---|---|
| Registry | capability/input/output/applicability authority | no price values |
| Unit/Precision/Validation | normalize and validate execution input | no design inference |
| Dependency/Ownership | resolve DAG and unique producers | no AI-created edges |
| Provenance/Trace | immutable lineage and state audit | no confidence-as-proof |
| Calculator Core | deterministic physical quantity | no AHSP/pricing |
| QTO Adapter | proposal and commit boundary | no silent mutation |
| RAB/AHSP/Pricing | post-QTO cost layers | no geometry invention |
| AI/Orchestrator | interpretation and controlled tool request | no direct DB mutation |

## 4. DED Evidence Architecture

```text
Document → Page → Region → Evidence → ExtractedFact → Entity → CalculatorInput
```

Document stores file/hash/revision/project/source. Page stores role/page number and OCR/vector/image layers. Region stores bounding box, table cell, drawing/detail location. Evidence stores exact text/graphic/table mark, page/region, source hash, extractor/provider, timestamp, and trust status. ExtractedFact stores predicate, original/normalized value, unit, evidence IDs, extractor, confidence, conflict set, and review state.

Evidence states: `EXTRACTED`, `MAPPED`, `VALIDATED`, `CONFLICTED`, `REVIEW_REQUIRED`, `AUTHORITATIVE`, `BLOCKED`. “AI says 300×300” is invalid; a valid fact references drawing/page/region/evidence.

## 5. Entity Model

```text
entityId, projectId, parentEntityId, type, subtype, geometry, dimensions,
material, drawingReference, pageReference, sourceEvidence, confidence,
dependencies, revision, status
```

`entityId`, `projectId`, parent relationships, revision, status, and dependency acceptance are Core-controlled. Type/subtype and dimensions may be AI proposals but require registry/source validation. Geometry/dimensions/material are authoritative only when linked to accepted evidence or explicit user input. `confidence` is extraction/classification metadata, never engineering approval.

Taxonomy:

* `building`: building, floor, room, wall, opening, door, window, roof, slab, beam, column, foundation, staircase, ceiling, floor_finish, wall_finish, paint, plumbing, electrical, drainage.
* `road`: alignment, segment, pavement, pavement_layer, shoulder, median, curb, sidewalk, drainage, road_marking, guardrail, road_accessory, geosynthetic, joint, hauling.
* `bridge`: bridge, abutment, pier, girder, deck, slab, foundation, bearing, expansion_joint, barrier, approach_slab.
* `drainage`: channel, culvert, inlet, outlet, manhole, pipe, headwall, drain, ditch.
* `irrigation`: canal, lining, gate, structure, intake, outlet, embankment.
* `river`: river_segment, revetment, riprap, gabion, sheet_pile, protection_structure.
* `weir`: weir, spillway, apron, stilling_basin, wing_wall, gate.
* `embung`: reservoir, embankment, spillway, outlet, intake, drainage.
* `dam`: dam, embankment, core, filter, drainage, spillway, outlet.
* `water`: pipe, manhole, reservoir, tank, chamber, intake, outlet.
* `coastal`: seawall, revetment, breakwater, groyne, beach_protection.
* `retaining`: retaining_wall, gravity_wall, cantilever_wall, counterfort_wall, gabion_wall.

## 6. Page Role Model

Allowed roles: `COVER`, `INDEX`, `SITE_PLAN`, `FLOOR_PLAN`, `ROOF_PLAN`, `ELEVATION`, `SECTION`, `STRUCTURAL_PLAN`, `STRUCTURAL_DETAIL`, `MEP_PLAN`, `MEP_DETAIL`, `DOOR_SCHEDULE`, `WINDOW_SCHEDULE`, `MATERIAL_SCHEDULE`, `SPECIFICATION`, `DETAIL`, `CALCULATION`, `REFERENCE`, `DUPLICATE_REFERENCE`, `UNKNOWN`.

Roles constrain candidate retrieval: plans provide layout, sections provide height/depth/slope/layer, structural pages provide member/bar evidence, MEP pages provide routes/points, schedules provide repeated counts, and details provide profiles/products. `DUPLICATE_REFERENCE` is supporting evidence only and cannot create another owner. Role is metadata, not proof of correctness.

## 7. Calculator Capability Registry

```text
calculatorId, namespace, domain, category, name, description,
entityTypes, entitySubtypes, requiredInputs, optionalInputs,
inputTypes, inputUnits, outputs, outputUnits, dependencies,
ownershipKind, qtoCapability, dedCapability, sourceRequirements,
validationRules, warningRules, applicabilityRules, version, status, provenance
```

`calculatorId` is immutable and namespaced (for example `road.earthwork.cut`). Entity capability sets define positive matches. Required inputs cannot default. Dependencies are version-pinned. `ownershipKind` is `produced`, `derived`, or `consumed`. Source requirements identify drawing/schedule/product/standard evidence. Applicability rules are executable predicates. Status is restricted to `VERIFIED`, `PARTIALLY VERIFIED`, `MISMATCH`, `UNVERIFIED`, `BLOCKED`, `NOT_APPLICABLE`. Registry metadata contains no price.

## 8. Calculator Selection Engine

Input: validated entity, subtype/domain, evidence, mapped facts, project context, dependencies, registry version, and ownership index. Outcomes: `SELECTED`, `AMBIGUOUS`, `NO_MATCH`, `MISSING_INPUT`, `BLOCKED`.

Deterministic sequence:

1. Validate project/workspace and entity ownership.
2. Normalize taxonomy aliases.
3. Retrieve by entity type.
4. Filter subtype/domain.
5. Evaluate applicability rules.
6. Validate required inputs/units.
7. Validate dependency and version availability.
8. Validate source requirements/revision.
9. Validate ownership compatibility.
10. Select only if exactly one candidate remains.

Retrieval may use relevance scoring for search efficiency, but scoring cannot override applicability or force a “best calculator.”

## 9. Input Mapping Engine

Every mapped field contains:

```text
originalValue, normalizedValue, unit, source, confidence, transformation, evidenceId
```

Example: `30 cm → 0.30 m`, with transformation `cm→m via existing UnitEngine` and a page/region evidence ID. No new UnitEngine is created. Conversion, parsing, and precision are traced. Cross-entity copying is invalid unless a registry dependency explicitly permits it.

## 10. Dependency Graph

Dependencies are registry-owned, version-pinned DAG edges. AI may propose a relationship; Core must accept it. Examples:

```text
wall gross → opening area → wall net → plaster → acian → paint
road alignment → chainage → cross-section → earthwork → pavement layer → QTO
```

Cycles, missing outputs, incompatible units, cross-project edges, version drift, and unowned derived values are rejected. Consumers reference upstream output IDs, never copied numbers.

## 11. Ownership & Anti-Duplicate

Ownership key:

```text
project + entity + revision + quantity-kind + segment + material-layer
```

Primary evidence creates an entity; supporting evidence enriches it; duplicate reference does not create quantity. Road surface has one producer. Bridge deck owns deck geometry and slab owns its declared component. Road drainage and general drainage share an entity. Generic concrete/rebar/formwork engines execute for the component owner, not as extra QTO lines. Excavation and pipe route each have one producer; trench/bedding/backfill consume declared geometry. Parent assemblies are summaries unless explicitly non-QTO derived. Repeated same-input execution is idempotent. Conflicts return `OWNERSHIP_CONFLICT` or `DUPLICATE_QUANTITY`.

## 12. Orchestrator State Machine

```text
IDLE → INTENT_DETECTED → ENTITY_DETECTED → CALCULATOR_CANDIDATES
→ INPUT_EXTRACTION → INPUT_VALIDATION → CALCULATOR_SELECTED
→ CALCULATOR_EXECUTION → RESULT_VALIDATION → QTO_PROPOSAL
→ USER_CONFIRMATION → QTO_COMMITTED
```

Read-only calculation may finish after result validation. Mutations require confirmation, authorization, idempotency, and audit. Missing/ambiguous input loops to clarification; missing source/dependency/ownership/project becomes blocked; failed/rejected/expired confirmation creates no mutation; project switch invalidates stale proposals. Every transition enters ExecutionTrace.

## 13. Tool Contract

### `calculator.execute` request

```text
projectId (server-bound authoritative context)
entityId
calculatorId
calculatorVersion
inputs
units
sourceEvidence
dependencies
requestId/idempotencyKey
mode: read_only | proposal
```

The LLM cannot freely choose projectId; server context validates it. Request validation precedes execution.

### Response

```text
status, calculatorId, calculatorVersion, inputs, outputs, units,
formula, provenance, warnings, validation, ownership,
projectId, entityId, executionTraceId
```

The tool does not price or mutate QTO/RAB in read-only mode.

## 14. Project Isolation

Validate authenticated actor, workspace membership, project access, entity/evidence membership, dependency project/revision, and proposal freshness. Forbidden: last/default project, localStorage as authority, stale cache, LLM-generated ID, arbitrary entity, or another project's QTO/RAB. Invalid context returns `PROJECT_CONTEXT_INVALID` and fails closed. Backend authorization/RLS remains authoritative.

## 15. Failure Handling

| Failure | Cause/system response | User/retry policy |
|---|---|---|
| `NO_INTENT` | no classified intent; no tool call | clarify; retryable |
| `ENTITY_NOT_FOUND` | no evidence entity | request drawing/page/entity; retryable |
| `CALCULATOR_NOT_FOUND` | no registry capability | explain unsupported scope; review |
| `AMBIGUOUS_CALCULATOR` | multiple variants | show candidates/gaps; clarify |
| `MISSING_INPUT` | required fact absent | list fields/evidence; retry after input |
| `INVALID_INPUT` | type/range/semantic failure | correct input; retryable |
| `UNIT_MISMATCH` | incompatible unit | UnitEngine correction; retryable |
| `SOURCE_NOT_VERIFIED` | missing source/product/standard | block; human/source review |
| `DEPENDENCY_MISSING` | upstream absent | identify dependency; retryable |
| `OWNERSHIP_CONFLICT` | multiple producers | reject; human review |
| `DUPLICATE_QUANTITY` | existing ownership key | link/idempotent return or correction |
| `PROJECT_CONTEXT_INVALID` | missing/mismatch/unauthorized/stale | fail closed; reselect context |
| `CALCULATION_ERROR` | Core failure | no mutation; technical retry/review |

## 16. AI Provider Abstraction

Ollama, Hermes, 9router, OpenAI-compatible APIs, Gemini, Claude, and future providers return provider-neutral extraction/classification/mapping/explanation proposals. Fallback is `Local AI → permitted External AI → constrained retry → human clarification`; provider failure cannot change calculator semantics. External output is schema/source/authorization validated and never directly mutates DB. Secrets remain server-side.

## 17. QTO Integration

Validated result becomes a QTO proposal containing project/entity IDs, quantity/unit, calculator/formula/registry versions, evidence/input mapping, dependency snapshot, ownership key/producer, warnings, validation, execution trace, and idempotency key. Read-only results need not persist. Commit is through existing QTO Adapter after project, ownership, stale-revision, and authorization gates.

## 18. RAB Integration

Committed QTO is consumed by existing RAB Adapter. AHSP Resolver and Pricing Resolver run after quantity approval. Missing mapping/price preserves an unresolved quantity or blocks cost operation; no business value is fabricated and no calculator changes geometry.

## 19. Provenance

Sources contain `sourceId`, `sourceType`, `sourceName`, `version`, `effectiveDate`, `reference`, and hash/revision. Result lineage contains QTO line, execution trace, calculator/registry/entity schema versions, formula version, normalized inputs/conversions, evidence/page/region, dependency outputs/versions, ownership key, precision policy, actor/provider, and timestamps. `NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE` applies when source is absent; confidence is not provenance.

## 20. Versioning

Version calculator, registry, entity schema/taxonomy, DED parser/evidence schema, tool contract, formula/source/standard, QTO schema, AHSP, and pricing independently. Historical committed results are immutable snapshots; updates never silently recalculate old projects.

## 21. Security

API keys remain server-side. LLMs cannot mutate DB directly. Mutations require confirmation, role permission, idempotency, and audit. RLS/project authorization applies to every entity/evidence/QTO/RAB operation. Committed provenance is immutable or correction-versioned. External output and document prompt injection are untrusted content. Tool arguments are allowlisted; cross-project evidence/dependencies are rejected.

## 22. Evaluation Framework

Report separately: A) AI extraction accuracy; B) entity classification; C) calculator selection; D) input mapping; E) mathematical correctness; F) QTO integration; G) anti-duplicate; H) project isolation; I) provenance completeness. “AI answer quality” cannot substitute for Core correctness.

## 23. Test Dataset

Prepare at least 50 versioned DED fixtures across Building, Road, Bridge, Drainage, Irrigation, River, Weir, Embung, Dam, Water, Coastal, and Retaining. Include normal, missing input, ambiguous channel, duplicate reference, wrong unit, conflicting revision, wrong candidate, project mismatch, missing dependency, ownership conflict, repeated execution, missing source, prompt injection, provider outage, and rejected confirmation. Expected selector outcomes are independently authored; mathematical expected values never call production calculators.

## 24. End-to-End Examples

All examples are contract fixtures; any illustrative value is `TEST_FIXTURE_ONLY`, never an engineering assumption.

| Case | Evidence → entity → candidate | Required gates | Output/QTO/provenance |
|---|---|---|---|
| Rumah | floor plan → building/floor/room → area capability | closed geometry, project/source | area lines with page/region trace |
| Bata ringan | plan/elevation + door/window schedule → wall/openings → wall quantity | length/height/thickness/module; missing module blocks procurement | gross/opening/net/unit output; plaster consumes net |
| Pondasi | foundation plan/section → stone or concrete foundation | subtype and section dimensions; no design inference | excavation/material/component quantities |
| Kolom | structural plan/detail/schedule → column mark | section/height evidence; bar schedule for rebar | concrete/formwork/rebar references |
| Atap | roof plan/section → roof/slope/edges | slope/overhang/product module | roof area/ridge/eave/cover quantities |
| Jalan | alignment/profile/sections → alignment/segment | station/elevation/offset evidence | cut/fill by station |
| Pavement | typical section → pavement_layer | explicit limits/thickness/material/density if mass | area/volume/mass where sourced |
| Channel | drainage section → channel subtype | U-Ditch/rectangular/trapezoid/pipe evidence; otherwise ambiguous | length/section/lining/earthwork |
| Culvert | crossing detail/schedule → pipe/box culvert | opening/profile/length/bedding | unit/length/earthwork/structure |
| Bridge deck | GA/deck/structural detail → deck + slab | slab thickness evidence | deck owns area, slab owns concrete |
| Abutment | elevation/section/detail → abutment children | component geometry | concrete/rebar/formwork/backfill |
| Retaining | wall detail → subtype | subtype; absent subtype ambiguous | wall/earthwork/drainage |
| Irrigation | canal plan/typical section → canal/lining | section geometry | station/lining/earthwork |
| Weir | GA/section/gate detail → weir components | component evidence | concrete/rebar/formwork/excavation |
| Embung | basin sections/zoning → reservoir/embankment | station sections and material zones | earthwork/layers/spillway/outlet |

Every row yields candidate retrieval, required-input check, dependency/ownership check, deterministic execution only after selection, QTO proposal, and evidence/version trace.

## 25. UI/UX Integration

No broad redesign: expose DED Analysis, Calculator Candidates, Input Evidence, Calculation Result, and QTO Review/Confirm views. Show why a calculator was selected, each normalized input and transformation, source page/region, entity, formula/version, warnings, ownership, and dependencies. Example: `Volume [result] m³ | Source Structural Plan Page 18 | Entity Column C-03 | Calculator concrete.column.quantity.v1 | Status [validated]`. Missing height displays `BLOCKED — HEIGHT NOT FOUND` with acceptable evidence types.

## 26. Implementation Roadmap

| Phase | Objective | Dependencies/modules | Tests/acceptance | Main risk |
|---|---|---|---|---|
| A Registry | capability schema/version/status/ownership | existing Registry, Validation, Provenance | IDs, schemas, applicability; every executable capability typed/source-backed | metadata drift |
| B Entity | evidence-linked typed entities | parser, project context, entity schema | taxonomy, parents, duplicates, injection; no entity without source/project | hallucinated dimensions |
| C Evidence | fact-to-input mapping | Unit/Precision/Validation/Provenance | conversions/conflicts/missing; every input traceable | confidence confusion |
| D Selector | deterministic candidate outcomes | Registry, entity, ownership | selected/ambiguous/no-match/missing/block | overmatching |
| E Mapper | normalized execution inputs | Unit/Precision/Validation | no fallback/default; transformations traced | legacy defaults |
| F Orchestrator | state/tool/clarification/trace | selector, mapper, provider gateway | transitions/outage/cancel/stale switch | provider branching |
| G Anti-duplicate | primary/supporting/duplicate evidence | entity/DAG/ownership | page/detail/schedule/parent-child | revision duplication |
| H QTO | proposal/confirm/commit | QTO Adapter/Project Context/RAB boundary | authorization/idempotency/reject | bypass mutation |
| I Evaluation | 50+ independent fixtures | harness/golden labels | nine metrics/failures | “looks good” tests |
| J Hardening | RLS/audit/failover/immutable trace | all prior | security/load/recovery | production drift |

## 27. Acceptance Criteria

Success requires: structured project-bound entities; registry candidates for every supported entity; deterministic final selection; no guessed missing input; no forced ambiguity; evidence lineage for every input; deterministic independent tests; provider interchangeability; provenance-rich QTO; duplicate detection; fail-closed isolation; untrusted external AI; separate AI/Core metrics; version persistence; and human review for ambiguity/conflict/low confidence/source or engineering validity.

## 28. Risks & Boundaries

Risks: hallucinated dimensions, page misclassification, duplicate references, stale project, source drift, overmatching, hidden defaults, unit/precision loss, DAG cycles, parent-child double counting, and prompt injection. Boundaries: no structural/hydraulic/pavement/electrical/geotechnical design; no AHSP/price/productivity/wage/material coefficients; no silent zero/default; no provider bypass; no historical silent recalculation. Missing source is `NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE`.

## 29. Final Architecture Diagram

```text
DED
 ↓
Document Parser → Page Classification → Evidence Extraction
 ↓
Entity Builder
 ↓
Calculator Intelligence
 ├─ Entity Classification
 ├─ Capability Registry
 ├─ Candidate Retrieval
 ├─ Applicability Rules
 ├─ Required Input Validation
 ├─ Dependency Validation
 └─ Ownership Validation
 ↓
Controlled calculator.execute
 ↓
Deterministic Calculator (existing Core)
 ↓
Result Validation → QTO Proposal → Human Confirmation → QTO Commit
 ↓
AHSP → Pricing → Cost Composition → RAB

AI providers (Ollama/Hermes/9router/OpenAI-compatible/Gemini/Claude)
operate only on interpretation/orchestration side.
Project Context, Authorization/RLS, Provenance, ExecutionTrace,
and Ownership Guards cross every Core boundary.
```

**Hard stop:** this is a specification only. Do not code, add calculators, add AHSP/pricing, redesign UI, or create a parallel architecture from this document.