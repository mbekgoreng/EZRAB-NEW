# Phase 4.2 Authoritative Source Audit

| Module | Authoritative source | Source type | Adapter | Normalized output | Status |
| --- | --- | --- | --- | --- | --- |
| BOQ/RAB | `ProjectContext.projectRabItems` | React context state (`RABItem`/`RabItem`) | `boqIntegration.ts`, `rabIntegration.ts` | `DocumentData.boq`, `DocumentData.rab` | CONNECTED |
| Schedule | `ProjectContext.projectScheduleTasks` | React context state (`ScheduleTask`) | `scheduleIntegration.ts` | `DocumentData.schedule` | CONNECTED |
| Kurva-S | `ProjectContext.projectKurvaSData` is declared, but no live consumer/source state was exposed in the current provider implementation | Context contract only | `kurvaSIntegration.ts` | `DocumentData.curveS` | PARTIAL — source not exposed at runtime |
| AHSP | `src/data/indonesianAHSP.ts` and AHSP repository are catalog/reference data; no project-scoped AHSP collection is exposed by `ProjectContext` | Reference repository, not project document state | `ahspIntegration.ts` | `DocumentData.ahsp` | PARTIAL — project source not exposed |
| RKK | No authoritative RKK state/provider/table was found in `src` | Not available | `rkkIntegration.ts` | `DocumentData.rkk` | NOT_AVAILABLE |
| JSA | No authoritative JSA state/provider/table was found in `src` | Not available | `jsaIntegration.ts` | `DocumentData.jsa` | NOT_AVAILABLE |
| Personnel | No project-scoped personnel state/provider/table was found in `src` | Not available | `personnelIntegration.ts` | `DocumentData.personnel` | NOT_AVAILABLE |
| Equipment | No project-scoped equipment state/provider/table was found in `src` | Not available | `equipmentIntegration.ts` | `DocumentData.equipment` | NOT_AVAILABLE |

## Integrity decision

The adapters for unavailable domains intentionally preserve `[]`; they do not manufacture production records. This is the required fail-closed behavior until an authoritative source module exposes project-scoped data.

## Preview parity

`renderDocument()` is the shared model builder used by the central export service. `DocumentWorkspace` consumes the same built data and rendered table model for its preview path. PDF/DOCX/XLSX generation is routed through `exportService` in production workspace/package paths.