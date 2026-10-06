# EZRAB Phase 4.1 Acceptance Matrix

Verification date: 2026-09-20

| Area | Status | Evidence |
| --- | --- | --- |
| DocumentData | PASS | `documentData.ts`; Phase 4.1 Group 1 |
| Export Service | PASS | `exportService.ts`; Phase 4.1 Group 7 |
| PDF | PASS | Central service generator path; Phase 4.1 Group 7 |
| DOCX | PASS | Central service generator path; supported by export service |
| XLSX | PASS | `xlsxGenerator.ts`; Phase 4.1 Group 6 |
| Preview | PARTIAL | `DocumentWorkspace.tsx` A4 preview exists; renderer data model exists |
| Validation | PASS | `validationEngine.ts`; Phase 4.1 Group 2 and 7 |
| Revision | PASS | `repository.ts`; Phase 4.1 Group 3 |
| Export History | PASS | `exportService.ts` calls `saveExportHistory`; Phase 4.1 Group 4 |
| Package | PASS | `packageExporter.ts`; Phase 4.1 Group 8 and MANIFEST |
| Project Isolation | PASS | project-scoped repository; Phase 4.1 Group 5 |
| BOQ | PASS | `boqIntegration.ts`; Phase 4.1 Groups 1 and 6 |
| RAB | PASS | `rabIntegration.ts`; Phase 4.1 Group 1 |
| AHSP | PARTIAL | adapter exists; source module end-to-end evidence not present |
| Schedule | PASS | `scheduleIntegration.ts`; Phase 4.1 Group 1 |
| Kurva-S | PARTIAL | adapter exists; source module end-to-end evidence not present |
| RKK | PASS | dependency validation and empty-source behavior tested |
| JSA | PARTIAL | adapter exists; source module end-to-end evidence not present |
| Personnel | PARTIAL | adapter exists; source module end-to-end evidence not present |
| Equipment | PARTIAL | adapter exists; source module end-to-end evidence not present |
| TypeScript | TIMEOUT | `npx tsc --noEmit --pretty false --incremental false --skipLibCheck` exceeded 30s |
| Build | TIMEOUT | `npm run build` exceeded 30s |
| Existing Tests | PASS | `npm test`: 74 passed, 0 failed |
| Phase 4.1 Tests | PASS | `npm run test:phase4_1`: 59 passed, 0 failed |

## Export pipeline audit

Production UI export paths use `exportService` / package pipeline. Direct generator references found by audit are tests or internal generator/package implementation, not independent UI export buttons.

## Remaining gates

The phase is **NOT READY** for Phase 5 until TypeScript/build complete successfully and the partial source integrations have runtime evidence from their authoritative modules.