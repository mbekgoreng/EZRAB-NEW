# AHSP 2026 — Validation Report

Generated: 2026-09-28T11:51:47.841Z

- Items: **5801**
- Components: **29320**
- Resources: **3898**
- Verified: **3440**  ·  Needs review: **2361**  ·  Invalid: **0**
- Duplicate groups: **291** (exact 15, possible 276)
- Records with missing required fields: **90**

## Issue frequency

| Issue | Records |
|---|---:|
| POSSIBLE_DUPLICATE | 1319 |
| NO_COMPONENTS_IN_SOURCE | 965 |
| NO_ANALYSIS_TABLE | 350 |
| SMKK_NOT_AN_AHSP_ANALYSIS | 223 |
| IN_INDEX_ONLY_CK | 200 |
| SUSPECT_MERGED_RESOURCE_NAME | 196 |
| HEADER_ONLY_ENTRY | 130 |
| MISSING_UNIT | 81 |
| SOURCE_TOTAL_MISMATCH_LABOR | 59 |
| IN_INDEX_ONLY_BM | 46 |
| SOURCE_TOTAL_MISMATCH_MATERIAL | 46 |
| EXACT_DUPLICATE_CODE | 35 |
| SOURCE_TOTAL_MISMATCH_ABC | 33 |
| ZERO_COEFFICIENT | 32 |
| UNREADABLE_COMPONENT_ROW | 30 |
| ANALYSIS_ONLY_BM | 28 |
| UNREADABLE_RESOURCE_NAME | 20 |
| ANALYSIS_ONLY_CK | 18 |
| MISSING_DESCRIPTION | 8 |
| SOURCE_TOTAL_MISMATCH_EQUIPMENT | 8 |
| MISSING_CODE | 2 |
| source prints inventory row no. 810 without a KODE (page 28) | 1 |

## Validation levels (§27)

- **VERIFIED** — source read, code/description/unit present, components present, every coefficient numeric, source page recorded, no duplicate.
- **NEEDS_REVIEW** — a required field is empty, or the item has no analysis table in the source, or a coefficient/resource name is unreadable, or a duplicate was detected.
- **INVALID** — the record has neither a code nor a description and cannot be an AHSP.
