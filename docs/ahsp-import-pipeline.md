# EZRAB AHSP Import Pipeline Specification

## 1. Pipeline Stages

```
DOCUMENT (Raw JSON / Structured PDF extraction)
   ↓
PARSER (Extracts item metadata, codes, components, units, coefficients)
   ↓
NORMALIZER (Canonical codes, diacritic-free text, standardized units)
   ↓
VALIDATOR (Checks code, name, unit presence, non-negative numbers, structure)
   ↓
AHSP MASTER & COMPONENT DEFINITION (Stores verified, immutable definitions)
   ↓
RESOURCE MASTER (Indexed labor/material/equipment catalog with unit compatibility)
   ↓
IMPORT REPORT (Execution audit: total parsed, valid, rejected, warnings)
```

## 2. Validation Rules
- **Code**: Mandatory non-empty string.
- **Name**: Mandatory non-empty string.
- **Unit**: Mandatory valid string.
- **Coefficients**: Must be non-negative real numbers (`>= 0`). Any `NaN` or negative value rejects the item.
- **Components**: Emits a warning if an AHSP has 0 components.

## 3. Resource Master Creation
Every component parsed creates or maps to a deterministic Resource Master entry:
- `id`: Unique identifier
- `code`: Component code
- `nameOriginal` vs `nameNormalized`: Preserves exact document text and clean search string
- `category`: `labor` | `material` | `equipment`
- `unit`: Base standardized unit
- `compatibleUnits`: Dimensionally convertible unit aliases from `UnitEngine`

## 4. Usage Example

```typescript
import { AHSPImportPipeline, RawDocumentInput } from './src/engine/ahsp/pipeline/ahspImportPipeline';

const result = AHSPImportPipeline.processDocument(rawDocumentPayload);
console.log(`Imported ${result.masterDefinitions.length} items`);
console.log(`Generated ${result.resourceMaster.length} master resources`);
console.log(`Validation status: ${result.report.totalValid} valid, ${result.report.totalRejected} rejected`);
```
