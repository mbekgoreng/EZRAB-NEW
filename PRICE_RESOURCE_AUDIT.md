# PRICE RESOURCE AUDIT

Generated: 2026-11-16T02:56:04.091Z  
Scope: canonical AHSP resource master (PHASE 2) + every price source in the repository (PHASE 6).  
The canonical AHSP is **not modified** by this audit.

## 1. Canonical resource master — actual numbers

| metric | value |
|---|---:|
| canonical AHSP items | 5801 |
| canonical resources | 5236 |
| — material | 3767 |
| — labor | 259 |
| — equipment | 1210 |
| — **UNKNOWN** | **0** |

## 2. Resource row quality

| quality | rows | meaning |
|---|---:|---|
| CLEAN | 4833 | usable |
| SUSPECT | 288 | usable but flagged (NEEDS_REVIEW on match) |
| **DEFECTIVE** | **115** | mis-extracted from the PDF — never priced |

### 2.1 Classification × quality

| classification | CLEAN | SUSPECT | DEFECTIVE |
|---|---:|---:|---:|
| EQUIPMENT | 1004 | 153 | 53 |
| LABOR | 202 | 8 | 49 |
| MATERIAL | 3627 | 127 | 13 |

### 2.2 Defect histogram

| issue | rows |
|---|---:|
| NO_CODE | 3785 |
| NAME_STARTS_LOWERCASE | 194 |
| TYPE_CONTRADICTS_CODE_PREFIX | 76 |
| NAME_STARTS_WITH_DIGIT | 71 |
| NAME_CONTAINS_SUMMARY_LINE | 57 |
| NAME_IS_A_DISTANCE_FRAGMENT | 37 |
| NAME_SUSPICIOUSLY_LONG | 18 |
| NAME_IS_A_CROSS_REFERENCE | 10 |
| NO_UNIT | 7 |
| EMPTY_NAME | 6 |
| NAME_ENDS_WITH_DOT | 5 |
| NAME_IS_A_PLACEHOLDER | 2 |
| NAME_IS_A_SPEC_FRAGMENT | 2 |
| NAME_IS_PARENTHETICAL_FRAGMENT | 1 |

### 2.3 Sample defective rows

| code | unit | name (truncated) | issues |
|---|---|---|---|
| `E.11` | jam |  | EMPTY_NAME |
| `—` | hari | *) Mesin Las HDPE 800 Watt (SM) To.20.c | NO_CODE, NAME_IS_A_CROSS_REFERENCE |
| `—` | jam | *3 Las listrik Diesel 500 A E.25.f | NO_CODE, NAME_IS_A_CROSS_REFERENCE |
| `—` | km | - Jarak 10,0 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | jam | - Jarak 10,0 km | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | jam | - Jarak 10,0 km 0,1515 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | jam | - Jarak 10,0 km 0,2083 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | jam | - Jarak 10,0 km 0,2778 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | jam | - Jarak 10,0 km 0,3333 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | jam | - Jarak 10,0 km 0,4167 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | jam | - Jarak 10,0 km 0,8333 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | jam | - Jarak 10,0 km 1,6667 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | km | - Jarak 11,0 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | jam | - Jarak 11,0 km 0,2209 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | km | - Jarak 15,0 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | jam | - Jarak 15,0 km | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | jam | - Jarak 15,0 km 0,1972 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | jam | - Jarak 15,0 km 0,4337 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | jam | - Jarak 15,0 km 0,5422 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |
| `—` | jam | - Jarak 15,0 km 1,0843 | NO_CODE, NAME_IS_A_DISTANCE_FRAGMENT |

> **UNKNOWN classification ⇒ NEEDS_REVIEW and no price** (PHASE 2 requirement).
> Priceable resources (not UNKNOWN, not DEFECTIVE): **5121 / 5236** (97,8%).

## 3. Component → resource traceability

| metric | value |
|---|---:|
| component rows in canonical AHSP | 33011 |
| distinct (code,unit) keys | 795 |
| keys whose code exists in the resource master | 795 (100,0%) |
| component rows backed by a resource | 12870 (39,0%) |

## 4. Price sources in the repository (PHASE 6)

| key | tier | prio | active | rows | positive | unit space | doc |
|---|---|---:|---|---:|---:|---|---|
| `HSD_2026` | OFFICIAL_GOVERNMENT | 1 | yes | 231 | 231 | jam OJ bh kg | SE 12/SE/Db/2026 |
| `LABOR_2026` | VERIFIED_REGIONAL | 3 | yes | 170 | 170 | OH OJ | SE DJBK No. 12/SE/Db/2026 & Permen PUPR 1/2022 |
| `EQUIPMENT_2026` | VERIFIED_REGIONAL | 3 | yes | 74 | 74 | jam hari | SE DJBK No. 12/SE/Db/2026 |
| `MATERIAL_MASTER_2026` | PROJECT_INTERNAL_MASTER | 5 | yes | 9232 | 9232 | m2 unit bh m | — |
| `MATERIAL_LIBRARY` | COMMERCIAL_REFERENCE | 6 | yes | 28 | 28 | m2 unit liter batang | — |
| `COMMERCIAL_2026` | COMMERCIAL_REFERENCE | 6 | yes | 155 | 155 | OH m2 sewa-hari kg | — |
| `LEGACY_PUPR_2022` | LEGACY_SUPERSEDED | 99 | **NO** | 58 | 58 | OH m¹ m2 m3 | Permen PUPR No. 1/PRT/M/2022 |

### 4.1 Source notes

- **HSD_2026** — Official 2026 basic-price catalogue carried in the repository.
- **LABOR_2026** — Per-role labour rates. Emits BOTH OH (orang-hari) and OJ (orang-jam) rows so the canonical unit (OH or jam) can be matched without an implicit conversion.
- **EQUIPMENT_2026** — Emits both `jam` (hourly) and `hari` (daily) rows.
- **MATERIAL_MASTER_2026** — Multi-sector, multi-region material catalogue carried in the repository. Reports province + city, so it is the only source that can serve REGENCY/CITY queries. Not externally audited → SOURCE_REPORTED, never VERIFIED.
- **MATERIAL_LIBRARY** — Branded commercial reference prices.
- **COMMERCIAL_2026** — Branded commercial reference prices (keramik, cat, sanitary, …).
- **LEGACY_PUPR_2022** — EXCLUDED. This is the superseded 2022 baseline that was purged from AHSP. It is also the source that SHADOWS the correct 2026 labour rates inside PriceRepository (first-wins ingestion inserts L.01 with unit `oj` before the 2026 labour master is read). Retained for audit only.

## 5. Unit histogram (canonical resources)

| unit | rows |
|---|---:|
| bh | 1164 |
| jam | 857 |
| m | 810 |
| unit | 658 |
| kg | 445 |
| m3 | 350 |
| m2 | 184 |
| hari | 163 |
| OJ | 104 |
| batang | 100 |
| liter | 85 |
| OH | 78 |
| lembar | 63 |
| km | 34 |
| bh/m' | 24 |
| pohon | 20 |
| ls | 18 |
| set | 14 |
| rp/jam | 9 |
| (empty) | 7 |
| ton | 7 |
| batang/m' | 5 |
| cm | 4 |
| kg/m' | 4 |
| lot | 4 |

## 6. Look-alike resource names

Groups sharing a normalized (name, unit): **278**. These are FLAGGED, never auto-merged (PHASE 17 / rule 9).

**END OF RESOURCE AUDIT.**
