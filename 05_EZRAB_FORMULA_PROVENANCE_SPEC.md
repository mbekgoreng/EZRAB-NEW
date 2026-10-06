# Formula Provenance Specification

Every formula trace must identify calculator ID/version, formula ID, mathematical expression, implementation version, source type, workbook filename, sheet, cell/range, extraction timestamp/hash, and test vector IDs. Unknown mapping is `UNVERIFIED`, never inferred.

```json
{"calculatorId":"building.bowplank","formulaId":"bowplank.perimeter","implementation":"core@1","source":{"type":"excel_reference","workbook":"EZRAB_VOLUME_CALCULATOR_MASTER.xlsx","sheet":"Bowplank","cell":"I10","status":"PARTIALLY VERIFIED"},"expression":"2*(P+L+2*C)","testVectorIds":["bowplank-normal-01"]}
```

Formula source and business-value provenance are separate. A coefficient may be from Excel; a price must identify price-list, region, effective date, and approval. A formula mismatch records Excel expression, current expression, mathematical meaning, difference, hypothesis, required test, and status. No parity status is upgraded from a code test alone.