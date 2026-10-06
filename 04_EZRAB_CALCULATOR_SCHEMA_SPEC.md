# Input and Output Schema Specification

Inputs are typed domain objects, not generic numeric dictionaries. Every measure carries a value and explicit unit (or a schema-level canonical unit plus conversion record). Requiredness, allowed range, semantic constraints, and origin are explicit.

```ts
interface DimensionInput { value:number; unit:'mm'|'cm'|'m'; source:'user'|'import'|'ai_proposal'|'dependency'; }
interface CalculationContext { projectId:string; workspaceId:string; calculatorVersion:string; precisionPolicy:string; dependencyResults:Record<string, CalculationOutput>; }
interface CalculationOutput { quantity:number; unit:string; breakdown:BreakdownLine[]; formula:FormulaTrace[]; inputs:unknown; dependencies:DependencyTrace[]; source:FormulaProvenance; warnings:string[]; validation:ValidationSummary; provenance:ProvenanceRecord[]; }
```

Canonical units include `mm, cm, m, m2, m3, kg, ton, bh, unit, set, liter, sak, batang`; aliases are normalized only through explicit conversion. Outputs may be multi-line and may not mix units without labels. Invalid input returns structured validation failure; it never becomes zero/default silently.

QTO consumes quantity outputs. RAB consumes QTO plus an authoritative AHSP/price snapshot and calculates monetary totals separately.