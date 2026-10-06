# EZRAB — AHSP 2026 DATASET AUDIT

**Document:** `EZRAB_AHSP_2026_DATASET_AUDIT.md`
**Generated:** 2026-09-28T11:52:06.015Z
**Scope:** repository audit performed *before* building the new master dataset (§4)

---

## 1. Existing AHSP datasets found

| File | Items | Claimed source | Verdict |
|---|---:|---|---|
| `src/data/nationalCostDatabase/sdaAHSPDataset.ts` | 1,554 | Lampiran IV SE DJBK 47/2026 | ⚠️ contains hardcoded `unitPrice`; **not** verified against the PDF |
| `src/data/nationalCostDatabase/binaMargaAHSPDataset.ts` | 1,144 | Lampiran V | ❌ **fabricated** — self-declared DEPRECATED in-file: 744 items share one price, synthetic page numbers |
| `src/data/nationalCostDatabase/binaMargaAHSP2026Official.ts` | 986 | Lampiran V | ✅ genuine extraction — **reused** by the new pipeline |
| `src/data/nationalCostDatabase/ciptaKaryaAHSPDataset.ts` | 3,131 | Lampiran VI | ⚠️ contains hardcoded `unitPrice`; not verified against the PDF |
| `src/data/nationalCostDatabase/smkkDataset.ts` | 124 | Permen PUPR 10/2021 | ⚠️ different schema (`SMKKMasterItem`), no components |
| `src/data/indonesianAHSP.ts` | (legacy 2022) | Permen PUPR 1/PRT/M/2022 | legacy seed, superseded |
| `src/data/nationalCostDatabase/officialHSD2026.ts` | 231 HSD | SE 12/SE/Db/2026 | basic prices (HSD), not AHSP |

## 2. Official source files found

| Attachment | Location | Pages | Extractable |
|---|---|---:|---|
| Lampiran I — technical guidance for basic-price collection | `sources/ahsp2026/` | 109 | ✅ text-based — **no AHSP tables** |
| Lampiran II — *Acuan dalam Penyusunan AHSP* | `sources/ahsp2026/` | 85 | ✅ text-based — **reference tables only, no AHSP items** |
| Lampiran III — SMKK implementation cost | `sources/ahsp2026/` | 74 | ✅ text-based |
| Lampiran IV — AHSP Sumber Daya Air | `sources/ahsp2026/` | 1,689 | ✅ text-based |
| Lampiran V — AHSP Bina Marga | `sources/ahsp2026/` | 3,125 | ✅ text-based |
| Lampiran VI — AHSP Cipta Karya | `sources/ahsp2026/` | 1,563 | ✅ text-based |
| Lampiran VII — *Tata Cara Pengajuan Usulan AHSP* | `sources/ahsp2026/` | — | ✅ text-based — **no AHSP items** |
| ~~Lampiran V — AHSP Umum~~ | — | — | ❌ **does not exist in this regulation** |

All seven annexes were retrieved from the issuing authority
(`binakonstruksi.pu.go.id`, `download_id` 10894 / 10897 / 10899 / 10901 / 10903 / 10904 / 10906)
and stored under their official names. See `EZRAB_AHSP_2026_MISSING_SOURCE.md`.

## 3. Potential duplicate datasets

| Pair | Overlap | Action |
|---|---|---|
| `binaMargaAHSPDataset.ts` vs `binaMargaAHSP2026Official.ts` | same domain, same 2026 claim | The first is deprecated and fabricated; the second is used. Neither deleted. |
| `bina_marga_downloaded.pdf` vs `Lampiran-II-...-Bina-Marga.pdf` | identical size (21,577,263 B) | Same file, two names — **both are Lampiran V**. The canonical copy is `sources/ahsp2026/Lampiran-V-...-Bina-Marga.pdf`. |
| `sdaAHSPDataset.ts` vs the new Lampiran IV extraction | same field | New extraction supersedes; legacy retained for comparison. |

## 4. Potential incomplete datasets

- `smkkDataset.ts` — no components, no coefficient table in its source.
- `ciptaKaryaAHSPDataset.ts` — 3,131 items against a 2,841 target; not traceable to pages.
- Every legacy dataset except the Bina Marga official one has `sourcePage` either absent or synthetic.

## 5. Potential malformed records

- `binaMargaAHSPDataset.ts` — 1,144 items sharing only 10 distinct prices; 744 items (65%) all at
  Rp 149,875. Classic template-generation signature.
- `sdaAHSPDataset.ts` — items carry `totalMaterial: Math.round(8500 * 0.7)` style expressions,
  i.e. derived placeholders rather than extracted values.

## 6. Potential hardcoded data

Confirmed hardcoded active prices inside AHSP records:

```ts
// sdaAHSPDataset.ts
unitPrice: 8500,
totalMaterial: Math.round(8500 * 0.7),

// ciptaKaryaAHSPDataset.ts
"unitPrice": 135000,  "total": 27000,
```

This violates the price-separation invariant. The new master fixes it by storing **no** active price
(§13), enforced by **Test 12**.

## 7. Existing resource mappings

- `src/data/nationalCostDatabase/officialHSD2026.ts` — 231 HSD base items (SE 12/SE/Db/2026).
- `src/data/masterMaterials2026.json`, `src/data/indonesianPrices.ts` — material/labour price seeds.
- `src/engine/pricing/priceResolver.ts` — 4-tier resolution (Project Override → Project → Regional → National).
- No resource master keyed by AHSP component existed before; `data/ahsp2026/validated/ahsp_2026_resources.json` is new.

## 8. Existing AHSP parsers

| Script | Purpose | Reused? |
|---|---|---|
| `scripts/probeLampiranII.ts` | text-vs-scan probe | pattern reused (`scripts/ahsp2026/probePdf.ts`) |
| `scripts/extractLampiranII.ts` | glyph-coordinate row reconstruction | **algorithm reused** in `scripts/ahsp2026/core.ts` |
| `scripts/extractOfficialAhsp.ts` | full Lampiran II item extraction | output **reused** |
| `scripts/classifyOfficialComponents.ts` | component typing | output **reused** |
| `scripts/reconcileLampiranII.ts`, `reconcileBinaMarga.ts` | reconciliation reports | read for context |

## 9. Existing import scripts

- `supabase/migrations/20260913_durable_project_rab_foundation.sql` — RAB persistence.
- `scripts/ahsp2026/generateCanonicalModule.ts` — regenerates the runtime catalog from the verified artefacts (idempotent).
- `scripts/ahsp2026/backupLegacyAhsp.ts` — Phase B legacy backup.
- `scripts/ahsp2026/assertPurge.ts` — Phase C/post-purge + integrity assertions.

## 10. Existing validation scripts

- `scripts/forensicAhspPriceConsistency.ts`, `forensicDataCensus.ts`, `forensicPricingSweep.ts`
  — price-consistency forensics, not dataset validation.
- No dataset-level validator existed; `scripts/ahsp2026/validate.ts` is new.

## 11. Existing tests

`npm test` runs `src/test/coreCalculatorEngine.test.ts`. There are 22 further test scripts under
`src/test/` wired to `npm run test:*`. **None validated the AHSP dataset itself** — the 13 new
assertions in `scripts/ahsp2026/testAhsp2026.ts` fill that gap.

## 12. Conclusion of the audit

The repository held a **structurally good schema** (`NationalAHSPItem`) but **unverifiable
contents**: prices baked into records, synthetic page numbers, and at least one entirely fabricated
dataset. The correct action was therefore not to patch the legacy files but to build a new,
price-free, fully traceable master from the official PDFs — which is what this phase delivered.
