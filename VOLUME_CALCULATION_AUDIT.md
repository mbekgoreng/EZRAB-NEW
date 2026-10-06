# Volume Calculation Audit

Date: 2026-09-18  
Scope: existing EZRAB volume calculation implementation before Excel-parity rebuild

## Status

**BLOCKED — source workbook unavailable and existing architecture conflicts with the requested parity contract.**

The requested reference file `EZRAB_VOLUME_CALCULATOR_MASTER.xlsx` was not found in the workspace or supplied attachments. The repository contains a hand-authored TypeScript transcription (`src/engine/constructionCalculators/masterJsonSpec.ts`) that names a different source workbook, `RABPRO V.3 2025_UNLOCKED (2).xlsx`. It is useful as an existing artifact, but it cannot substitute for auditing the requested workbook, including formulas, inputs, hidden cells, images, and workbook rounding/error behavior.

No calculator logic was changed during this audit. Per the master prompt's Phase 0 stop condition, implementation must not start until this source conflict is resolved.

## 1. Existing architecture

| Layer | Location | Current role |
| --- | --- | --- |
| Calculator registry | `src/engine/constructionCalculators/registry.ts` | Holds calculator metadata, parameters, formula callbacks, materials, labor, defaults, and AHSP metadata in one 2,217-line file. |
| Calculator contract | `src/engine/constructionCalculators/types.ts` | Defines calculator parameters, results, formula steps, material/labor outputs, and registry spec. |
| Workbook transcription | `src/engine/constructionCalculators/masterJsonSpec.ts` | Stores partial sheet dimensions and Excel cell formula strings. |
| Calculation UI | `src/components/qto/QtoCalculatorView.tsx` | Selects a registry calculator, owns input state, calls `activeSpec.calculate(inputs)`, displays results/formulas, and saves to QTO. |
| Technical references | `src/data/volumeTechnicalReferences.ts`, `public/assets/volume-calculation/references/` | Maps most calculators to local public reference-image assets. |
| Project/QTO/RAB workflow | `src/context/ProjectContext.tsx` | Creates calculation runs and QTO entries, and can create/update RAB entries. |
| Numeric helper | `src/engine/safeDecimalEngine.ts` | Provides sanitization, arithmetic and rounding helpers. |

The existing registry is a useful central catalog, but formulas are still embedded in registry callback functions rather than represented as independently versioned, auditable formula definitions.

## 2. Existing calculators

The registry contains all 19 workbook calculator identities:

1. Bowplank
2. Pondasi
3. Foot Plate
4. Sloof
5. Kolom
6. Balok
7. Bata Ringan
8. Bata Merah
9. Batako
10. Pintu & Jendela
11. Atap Baja Ringan
12. Plesteran & Acian
13. Penutup Lantai
14. Penutup Dinding
15. Plafon
16. Pengecatan
17. Kelistrikan
18. Instalasi Air Bersih
19. Sanitair

It also includes four non-workbook calculators: Paving Block, Jalan Aspal, Jalan Rigid, and Saluran U-Ditch. Their presence does not remove the 19 required calculators, but the future registry must distinguish the Excel-parity set from extensions.

## 3. Existing formulas

`masterJsonSpec.ts` contains a partial cell/formula map for the named 19 sheets, including formulas such as Bowplank `I10`, `I11`, and Pondasi `I9`–`I17`. The registry calculates independently with hand-authored TypeScript expressions.

Parity cannot be established because:

- the reference workbook cannot be inspected;
- no extracted input-cell map, output-cell map, or calculated-value samples are present;
- current calculations introduce local formula changes and defaults;
- formula functions call `SafeDecimalEngine.safeRound` during intermediate calculations.

## 4. Existing UI

`QtoCalculatorView.tsx` provides calculator navigation, categorized calculator groups, parameter inputs with unit labels, formula results, QTO history, and a technical-reference viewer. It keeps the chosen calculator in component state and calculates live from the registry.

The technical-reference assets are public relative assets, not absolute Windows paths. Coverage is incomplete: the Air Bersih and Sanitair mappings currently have no images. The viewer architecture is already suitable for a larger centered image, zoom, fit, fullscreen, and reset controls.

## 5. Missing calculators

The 19 requested workbook calculators are present in the registry. **Baja WF is not present.** There is no `bajaWfCalculator`, WF section library, WF visual, or WF QTO adapter.

## 6. Excel parity gaps

| Requirement | Audit finding | Status |
| --- | --- | --- |
| Inspect supplied workbook and its hidden logic | Workbook is unavailable. | BLOCKED |
| Formula parity | Hand-authored callbacks and partial formula map have not been compared to workbook values. | NOT_VERIFIED |
| Input/output mapping | Parameter metadata is not traced to workbook input/result cells. | NOT_AVAILABLE |
| Minimum 6-decimal internal precision | `SafeDecimalEngine` is 4-decimal scale and many calculator formulas round to 1–4 decimal places mid-calculation. | FAIL |
| Missing required input remains incomplete | Registry supplies defaults using patterns such as `inputs.P || 12`; UI converts `NaN` to `0`. | FAIL |
| Invalid input fails rather than silently becoming a value | `sanitize` replaces invalid values with fallback values, and divisions can return `0`. | FAIL |
| Formula result metadata | Results lack a per-output formula ID, precision, source, status, input snapshot, and timestamp. | PARTIAL |
| Excel parity/golden tests | Existing test is an integration-style Bowplank scenario; no per-sheet parity suite or 19 golden tests exists. | FAIL |

## 7. Existing Baja WF capability

No existing Baja WF capability was found. This addition must be built only after the formula-source conflict is resolved. The requested WF formulas are specified in the master prompt, but its section table, if any, still requires a verified source before profile weights are populated.

## 8. QTO integration

`ProjectContext.executeCalculationAndSave()` fail-closes when `currentProjectId` is absent. It creates a `CalculationRun` with calculator ID, formula version, input snapshot, normalized input snapshot, result snapshot, creation time, and project ID; it then creates/updates a QTO item with calculator and formula identifiers.

The QTO flow exists and should be extended through an adapter rather than replaced. Gaps: calculation-result status/source/precision are not persisted as required, and QTO currently represents one primary quantity rather than a multi-output WF quantity containing both length and weight.

## 9. RAB integration

The existing flow can save a calculation to QTO and optionally sync it to RAB. However, `executeCalculationAndSave()` uses each registry spec's `defaultAhspCode` and `defaultUnitPrice` when it directly creates an RAB item. This conflicts with the requested WF rule: do not fabricate AHSP or price; map only when valid master/project data is available.

The project context filters QTO/RAB/calculation data by current project ID, but initial active-project state uses `localStorage` with a `DEFAULT_FLAGSHIP_PROJECT_ID`. That conflicts with the requested prohibition on default/stale local-storage project selection for calculation context and needs a separate project-isolation decision before changes are made.

## 10. Risks

1. Rebuilding against the current TypeScript formula map could replicate a transcription error rather than the actual workbook.
2. Changing the numeric engine globally could alter RAB, QTO, and unrelated calculation behavior; a versioned volume-calculation engine is safer.
3. Existing default values, fallback-to-zero behavior, and intermediate rounding can generate plausible but invalid quantities.
4. Existing direct RAB creation with default price/AHSP is incompatible with the requested WF price and AHSP safeguards.
5. The current untracked workspace contains the entire repository, so unrelated local changes must be preserved during later implementation.

## Required unblocker

Provide `EZRAB_VOLUME_CALCULATOR_MASTER.xlsx` in the workspace or attach it to this task. Once available, the next step is a read-only workbook inventory of every sheet, input, output, formula, hidden range, image, and sample calculation, followed by an implementation plan that explicitly resolves the project-context and price/AHSP integration conflicts above.
