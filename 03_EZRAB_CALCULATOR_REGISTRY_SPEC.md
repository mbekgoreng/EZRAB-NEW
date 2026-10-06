# Calculator Registry Specification

Registry is data-driven, immutable, namespaced, and versioned. IDs use `<pack>.<domain>.<calculator>` (legacy IDs remain aliases). Registration must reject duplicate IDs, missing formula source, cyclic dependencies, unsupported units, and invalid schemas.

```ts
type Readiness = 'VERIFIED'|'PARTIALLY VERIFIED'|'MISMATCH'|'UNVERIFIED'|'BLOCKED'|'NOT_APPLICABLE';
interface CalculatorDefinition {
 id: string; name: string; category: string; pack: string; version: string;
 description: string; inputSchema: string; outputSchema: string; units: string[];
 formulaSource: FormulaProvenance; dependencies: DependencyRef[];
 validation: ValidationRule[]; testCoverage: TestCoverage; status: Readiness;
 calculate(input: unknown, ctx: CalculationContext): CalculationOutput;
}
```

`formulaSource.type` is `excel_reference`, `verified_reference`, `external_source`, or `implementation_only`. `VERIFIED` requires source cell/range, evaluated vector, independent calculation, and human review. Registry metadata must not contain price values. Legacy `defaultAhspCode/defaultUnitPrice` is deprecated and must be ignored by Core.

Resolver returns a definition plus exact version; aliases cannot silently change versions. Registry exposes `listByPack`, `resolve(id, version)`, and `dependencyPlan`.