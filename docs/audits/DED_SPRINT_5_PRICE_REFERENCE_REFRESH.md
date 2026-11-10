# DED Sprint 5 — Curated Price Reference Refresh (Workstream D)

Date: 2026-11-10. **Outcome: BLOCKED by infrastructure. Zero records changed.**

## Counts

| Measure | Count |
|---|---|
| Curated families researched | 13 |
| Refreshed with verified evidence | **0** |
| Still stale after the 2026-12-10 deadline | 13 |
| Freshness unknown (curated set) | 0 |
| Unresolved (source could not be verified) | 13 |

## Blocker

The research pass attempted to open source pages with the generic web tools available to
this agent (`browser.open`). The browser service failed on **4 independent URLs across 4
different domains** (skala8.com, skliving.co.id, homex.co.id, builder.id) with
`browser-service exited with code 1`. This is a tooling failure, not evidence that the
sites are down. Under the programme rule — only actually opened pages count as
verification; search snippets are not evidence — no family could be verified, so **no
value, source URL, or `accessedAt` was changed anywhere**. Artificially extending access
dates without real research is forbidden and was not done.

## State preserved (verified by test)

`src/test/dedPriceReferenceRefresh.src.ts` — 14 PASS / 0 FAIL: all 13 records are
byte-preserved (`accessedAt` 2026-11-10, source data dated 2026-10-22, spot-checked
prices intact); freshness is FRESH through 2026-12-10 and STALE on 2026-12-11; the
revalidation worklist contains all 13 families after the deadline; Jakarta provenance
nulls are preserved; `OFFICIAL_SSH_HSPK` remains empty; resolver behaviour is unchanged.
Historical records remain fully auditable — nothing was overwritten.

Per-family before = after (unchanged): baja ringan Rp165.000/m²; spandek Rp95.000/m²;
nok Rp55.000/m'; listplank Rp65.000/m'; plafon gypsum+hollow Rp150.000/m²; pintu P1
Rp3.500.000/unit (LOW confidence); pintu P2 Rp1.800.000/unit; jendela Rp900.000/unit;
bovenlicht Rp350.000/unit; titik penerangan Rp185.000 (HIGH); stop kontak Rp200.000
(HIGH); sakelar Rp165.000 (HIGH); PHB Rp425.000 (HIGH).

## Unverified indications (NOT evidence — recorded for the retry only)

Search-result indications from crawls 1 hour–2 days old broadly supported 10 of 13
existing values. Exceptions the retry must resolve first:
- **Pintu P1 (double HPL):** no directly supporting source found; nearest finds are
  different specifications/coverage (aluminium spandrel double sets excluding
  installation; a single HPL door "from Rp900 thousand"). The LOW confidence stands.
- **Sakelar:** the Rp120.000 lower bound does not match the current Sejasa indication
  (Rp145.000–220.000 with material); the 120k figure came from the skala8 column that
  could not be re-opened.
- **Jendela:** the cited source describes a swing+glass door, not "panel aluminium" as
  the family name states — a naming/coverage mismatch to resolve.
- **Bovenlicht:** the Rp215.000 indication is a product price (order via WhatsApp), not
  installed; the record's "fully installed" coverage assumption remains unsupported by
  that source.

Full research notes: `~/workspace/your_files/EZRAB-DED-SPRINT5/research-notes.md`
(preserved in the final snapshot folder).

## Retry recipe (when the browser service is healthy)

Open 7 core URLs: homex.co.id news/79; builder.id borongan page; amanahbaja
biaya-pasang; jasatukang gypsum/plafon; workshop kusen; skala8 per-titik listrik +
sejasa biaya-instalasi; skliving pintu category. Re-verify each family's item, unit,
coverage (material-only vs installed; component vs assembly), region and source date;
only then update `accessedAt`/values per the canonical service design (new access record,
history preserved). **Deadline stands: all 13 curated families become STALE after
2026-12-10.** The 37 Jakarta prompt-only records remain freshness-UNKNOWN (Sprint 4) and
were not promoted into the curated resolver (D3 respected). Known hazards from Sprint 4
remain documented and unhidden: generic Jakarta window vs curated aluminium window;
installed frame vs component sum (double counting); "Urugan tanah kembali" vs "Urugan
tanah"; `m1` vs `m′` notation.
