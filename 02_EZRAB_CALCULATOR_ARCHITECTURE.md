# EZRAB Calculator Architecture

## Decision: hybrid (B+C)

Use a generic deterministic kernel for units, arithmetic, validation, dependency execution, provenance, and result contracts; keep geometry/formula semantics calculator-specific. A pure standalone model duplicates policy and prevents cross-pack dependency control. A universal formula DSL would obscure construction meaning and cannot safely represent every road, bridge, steel, and earthwork rule.

```text
UI / AI extraction (non-authoritative)
  -> validated project context + typed input
  -> Registry resolver
  -> Dependency planner
  -> Core kernels + versioned calculator definition
  -> quantity result + provenance + warnings
  -> QTO adapter
  -> RAB adapter (AHSP/price only from authoritative sources)
```

Core never calls AI, localStorage, price databases, or UI state. AI may select a calculator and propose inputs, but a validator must approve them.

## Boundaries

* Geometry/quantity: Core calculator.
* Coefficients: formula definition with provenance; no hidden constants.
* Price/AHSP/total cost: QTO/RAB pricing layer.
* Project/workspace authorization: application context and server guard.
* Explanation/proposal: AI/presentation layer.

## Runtime contract

`calculate(definitionId, input, CalculationContext)` is pure, deterministic, versioned, and returns immutable output. Context includes authoritative `projectId`, unit policy, precision policy, source snapshot, and dependency results. Missing project context fails closed for persistence/mutation.

## Generic engines justified

Unit engine (all packs); decimal/rounding engine (parity); validation engine (required/range); dependency engine (wall→plaster, roof→covering); provenance engine (audit); area/volume/length/count engines (repeated dimensional primitives). Earthwork, reinforcement, and weight engines should be added only with verified domain formulas and test vectors.

## Migration

1. Freeze legacy registry behavior and label it legacy.
2. Build new contracts and adapter around two pilot calculators (Bowplank, Pondasi).
3. Import workbook formula metadata and independent vectors.
4. Migrate one calculator at a time; compare old/new/reference.
5. Remove default pricing from calculator definitions only after QTO/RAB adapter is live.