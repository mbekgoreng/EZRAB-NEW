# DED Material Specification Validation — Advanced Conflict Guard Audit

Sprint 4, Task D. Status: **implemented, additive, all regressions
green.** The coarse category guard from the earlier hardening programme
is unchanged and still runs first; this audit documents the structured
grade/dimension layer added beside it.

Files:

- **New:** `src/ai-tools/ded-ai-estimate/materialSpecValidation.ts` —
  structured attribute parser + comparator (pure functions).
- **Modified (additive):**
  `src/ai-tools/ded-ai-estimate/externalPriceReferences.ts` —
  `referenceSpecConflict()` now consults the structured layer after the
  legacy rules and returns its human-readable reason for hard conflicts
  and verification cases; new export `referenceSpecValidation()` exposes
  the full structured result. No legacy rule, reason string, price, or
  exported signature changed.
- **New test suite:** `src/test/dedMaterialSpec.src.ts` (46 checks).
- **Not touched:** `ded-full-ai/validator.ts` / `service.ts` (Task B
  territory). They already call the shared `referenceSpecConflict` /
  `findExternalReference`, so the Full AI pipeline and its validator's
  second-line check inherit the extended guard with zero changes there.

---

## 1. What existed (coarse guard, unchanged)

`SPEC_CONFLICT_RULES` in `externalPriceReferences.ts`, three
category-level rules with their original reason strings preserved
verbatim (locked by tests F1–F3 of the new suite):

1. Reference assumes **aluminium**; item states wood/UPVC/iron → conflict.
2. Reference assumes **spandek/metal**; item states clay/ceramic/
   concrete tile, or the standalone word `genteng` **not** followed by
   `metal` → conflict. ("Nok Spandek" and "genteng metal" are
   explicitly not conflicts.)
3. Reference assumes **gypsum**; item states GRC/kalsiboard/calcium
   silicate/PVC → conflict.

Admitted gap (previous programme): grade and dimension were not
covered — a 1.0 mm light-steel frame priced from a 0.75 mm reference,
or 8 mm glass from a 5 mm reference, passed silently.

## 2. Design principles (deliberately conservative)

1. **Parse only what is reliable.** A numeric attribute is extracted
   only when it is textually bound to its domain noun (proximity), or
   is the text's sole mm value with a guarded fallback (§3). Values
   outside the domain's plausibility range are never claimed.
2. **Compare only like-for-like attributes stated on both sides.**
3. **Missing on one side is not a hard conflict.** It is an incomplete
   specification: the match stands (the reference's stated assumption
   applies), except for the one attribute family decided essential in
   §4. Rationale: DED item names rarely carry these attributes, and
   the curated references are generic market prices written for
   generic items — blocking on absence would strand legitimate fills
   (the 38-row owner fixture is the regression witness: §6).
4. **Hard conflict ⇔ both sides state disjoint values** for the same
   attribute (with the subset rule: a single value contained in the
   other side's stated set/range is a match — e.g. a bovenlicht
   30×50 against a reference stating "30×50 to 40×60", or rebar Ø10
   within an item's Ø10+Ø13 mix).
5. **Ambiguity → `NEEDS_VERIFICATION`**, with a human-readable reason
   that is recorded on the item's `DedPriceCompletion` block through
   the existing `findConflictingReference` path (price stays empty —
   exactly the pre-existing operational meaning of
   NEEDS_VERIFICATION). Ambiguity classes: cross-notation values that
   must not be converted without an official table (concrete K- vs
   f′c; pipe diameter inch vs mm, nominal vs actual), partially
   overlapping value sets, and the essential-attribute absence in §4.
6. **Non-essential descriptive words never reject a match.** Colour,
   brand, "premium", finish adjectives are not extracted at all, so
   they cannot influence the verdict.
7. **The guard can only refuse or flag — never fill, never equate.**
   A material that cannot be matched safely stays unresolved; the
   original source reference is preserved on the conflict block
   (`referenceId`, `specAssumption`) as before.

## 3. Parser reliability guards (each locked by a test)

| Guard | Case it prevents | Test |
|---|---|---|
| Proximity binding (domain keyword ≤ 20 chars before the mm value) + claim priority (glass → gypsum → GRC → light steel → roof sheet → aluminium; a claimed value cannot be re-claimed) | "Kaca bening 5 mm" being read as an *aluminium* thickness | A8, D2 |
| Plausibility ranges per domain (glass 2–19, board 3–25, light steel 0.2–3, roof sheet 0.2–1.2, aluminium 0.5–4 mm) | Fascia **width** 150 mm read as board thickness | D1 |
| Foreign-noun fallback guard (sole-mm fallback refused when the value's window names another material: multiplex, wood, concrete, …) | Door leaf "multipleks 18 mm" in the P1 reference assumption being read as glass or aluminium thickness | D2 |
| Comparative-phrase guard for dimensions (a WxH preceded by "dari" — "lebih besar dari 60×120" — is a source anchor point, not the assumed size) | The window reference's cheapest-anchor 60×120 being treated as its assumed dimension | D3 |
| Cable section binds to the `mm²` token itself | NYM **3**×2.5 mm² read as 3 mm² (core count) instead of 2.5 mm² | D4 |
| Pipe context captures `Ø` | "Pipa PVC Ø110 mm" read as rebar Ø110 | D6 |
| Mixed-fraction handling + denominator guard | "1 1/2″" parsed as 0.5″, or its denominator 2 parsed as a 2″ diameter | D7 |
| Window-dimension context + minimum size (both sides ≥ 10, WxH pattern only in frame/window/door text) | Ceramic tile "60x60", timber "80x80 mm", beam "15/20" read as window dimensions | A15 |
| Numbers without a domain (prices, counts) are not attributes | "Rp1.250.000", brand/colour text producing phantom attributes | D5 |

The reference side of every comparison is the reference's
`specAssumption` — its own stated specification. `sourceName` is
deliberately never parsed: it is a bibliography string citing several
products and prices (e.g. the window entry's source line mentions both
60×120 and 80×160 products).

## 4. Attribute catalogue & decision table

18 attributes (`MATERIAL_SPEC_ATTRIBUTES` in the module). "Missing"
below = reference states the attribute, item does not (the reverse —
item states, reference doesn't — is always *match*: the reference does
not restrict that attribute).

| Attribute | Extraction (reliable form) | Missing → | Disjoint → | Notes |
|---|---|---|---|---|
| Light-steel thickness (mm) | mm bound to baja ringan / kanal C | Match (incomplete) | **Hard** | Required case: 0.75 vs 1.0 mm rejected (B1) |
| Roof sheet thickness (mm) | mm bound to spandek / metal deck / genteng metal | Match | **Hard** | 0.30 vs 0.40 mm rejected (B9) |
| Aluminium profile thickness (mm) | mm bound to aluminium, range 0.5–4 | Match | **Hard** | Frame size in inches (kusen 4″) is not thickness and is not parsed |
| Glass thickness (mm) | mm bound to kaca | Match | **Hard** | Required case: 5 vs 8 mm rejected (B2) |
| Gypsum board thickness (mm) | mm bound to gypsum | Match | **Hard** | Required case: 9 vs 12 mm rejected (B3) |
| GRC board thickness (mm) | mm bound to GRC/kalsiboard/kalsium silikat | Match | **Hard** | Coarse gypsum↔GRC rule usually fires first |
| Window/boven dimension | WxH in frame context, comparative phrases excluded | Match | NEEDS_VERIFICATION | Per-unit window prices are stated as wide ranges spanning sizes, and prose dimension extraction is the least reliable — different stated sizes flag for verification rather than hard-reject (C3) |
| Cable section (mm²) | value bound to `mm²` | Match | **Hard** | Required case: 2.5 vs 4 mm² rejected (B4); per-point references state their cable assumption, item names almost never do — hence missing = match |
| Concrete class K- | `K-<3 digits>` | **NEEDS_VERIFICATION** if the item is concrete work | **Hard** | Required case: K-225 vs K-300 rejected (B5). **Essential**: class *is* the price-defining attribute of concrete and there is no safe default class |
| Concrete strength f′c (MPa) | `f'c <n> MPa` | **NEEDS_VERIFICATION** (same rule) | **Hard** | K- vs f′c across sides is never converted (no official conversion table in this module) → NEEDS_VERIFICATION (C1). Note the canonical AHSP layer (`checkSpecCompatibility`) makes the same non-conversion choice, returning "not compared" there; this layer records the ambiguity instead because its consumer is a price-fill decision |
| Rebar diameter (mm) | Ø / D notation; besi-bound mm | Match | **Hard** | Required case: Ø10 vs Ø13 rejected (B6). Per-kg rebar pricing is diameter-insensitive, hence missing = match, but a stated mismatch is a different material schedule |
| Rebar grade | BJTP/BJTS + number, fy | Match | **Hard** | BJTP 24 vs BJTS 40 rejected (B8) |
| Rebar type | polos vs ulir/deform | Match | **Hard** | (B8) |
| Pipe material | PVC/UPVC/HDPE/PPR/galvanis/stainless in pipe text | Match | **Hard** | Required case: PVC vs HDPE rejected (B7). Missing = match is a deliberate conservative choice: DED pipe material often lives in the item's `specification` field, which `referenceSpecConflict` does not receive today; plumbing the field through is a Stage-2-style follow-up, not assumed here |
| Pipe diameter (mm) / (inch) | mm bound to pipa/Ø; inch integers, fractions, mixed fractions | Match | **Hard** within the same unit family | Cross-family (inch vs mm) → NEEDS_VERIFICATION (C2): nominal inch sizes are not actual mm diameters |
| Roof coating grade | AZ class (AZ70/100/150) | Match | **Hard** | Generic letter grades ("grade A") are **not** compared — vendor semantics differ; documented non-extraction |
| Paint coats | `<n> lapis/coat` | Match | **Hard** | 2 vs 3 coats rejected (B10). Only coat count is compared; paint *system* words (base coat, brand, interior/exterior, finish) are treated as non-essential descriptors and never extracted — a stated system difference therefore cannot reject a match in this layer |

Verdict aggregation: any hard conflict → `HARD_CONFLICT`; else any
ambiguity → `NEEDS_VERIFICATION`; else any one-sided attribute →
`COMPATIBLE_INCOMPLETE`; else `COMPATIBLE`. Both non-compatible
verdicts surface through `referenceSpecConflict()` as a readable
reason string (hard: `konflik spesifikasi material: …`; verification:
`spesifikasi perlu verifikasi: …`), so `findExternalReference` excludes
the reference and `findConflictingReference` records the block —
identical mechanics to the coarse guard, in both pipelines.

## 5. Test suite — `src/test/dedMaterialSpec.src.ts` (46 checks)

- **A. False positives — must still match (15):** exact spec equality
  (steel 0.75, gypsum 9, glass 5 fixture names); one-sided incomplete
  specs in both directions; non-essential word differences
  (premium/colour/brand); "Nok Spandek" not a conflict; "genteng
  metal" not a conflict (both directions); value contained in the
  reference's stated range (bovenlicht); mixed rebar containing the
  reference diameter; equal concrete K-/f′c; equal pipe material +
  diameter; equal paint coats; tile dimensions not compared as window
  dimensions.
- **B. False negatives — must hard-reject (11):** light steel
  0.75 vs 1.0 mm (validator, curated guard, and `findExternalReference`
  null); glass 5 vs 8 mm; gypsum 9 vs 12 mm; cable 2.5 vs 4 mm²
  (including against the real lighting-point reference at 1.5 mm²);
  concrete K-225 vs K-300; rebar Ø10 vs Ø13 and D10 vs D13; pipe
  PVC vs HDPE explicit; rebar polos vs ulir and BJTP 24 vs BJTS 40;
  roof coating AZ70 vs AZ150 and spandek 0.30 vs 0.40 mm; paint
  3 vs 2 coats and pipe 1″ vs 2″.
- **C. Ambiguity → NEEDS_VERIFICATION (5):** K-225 vs f′c 25 MPa
  (reason recorded, mentions the notation difference); pipe inch vs
  mm; differing window dimensions; essential concrete class missing
  on a concrete item; the verification reason prefix surfacing through
  `referenceSpecConflict`.
- **D. Parser guards (8):** §3 table.
- **E. Pipeline integration (3):** via `completeDedItem` — hard
  conflict leaves the price empty with a `NEEDS_VERIFICATION` block
  naming `ext-rangka-baja-ringan`; incomplete spec still fills
  Rp165,000 as `MARKET_REFERENCE`; exact spec still fills Rp150,000.
- **F. Legacy guard regression (3):** the three coarse rules return
  their exact original reason strings.

Result: **46 PASS / 0 FAIL.**

## 6. Regression evidence (all pre-existing suites, expectations untouched)

| Suite | Result |
|---|---|
| dedMaterialSpec (new, Task D) | 46 PASS / 0 FAIL |
| dedCanonicalReferenceService (new, Task C) | 19 PASS / 0 FAIL |
| dedPriceCompletion (incl. 38-row owner fixture: 15 market fills, grand total Rp149,023,200) | 43 PASS / 0 FAIL |
| dedHardening (Stages 1–6) | 34 PASS / 0 FAIL |
| dedFullAiParity (Task B suite) | 28 PASS / 0 FAIL |
| dedCanonicalPricing | 68 PASS / 0 FAIL |

No existing expectation was changed. The extension produced **no**
change in any legacy scenario — in particular the 38-row fixture's
fill count and grand total are identical, confirming the design rule
that absence of an attribute never blocks a previously legitimate
fill. Per the task instruction, had any legacy scenario changed, the
design (not the test) would have been revised; that situation did not
arise.

Logs: `~/workspace/your_files/EZRAB-DED-SPRINT4/test-out/taskCD/`.

## 7. Known limits (stated, not hidden)

1. `referenceSpecConflict` receives the item **name** only. Attributes
   stated solely in a DED item's `specification` field are not yet
   compared — plumbing that field through `findExternalReference` /
   `completeDedItem` call sites is a follow-up that changes call
   signatures in both pipelines and was left out of this additive step.
2. Proximity parsing is a heuristic over Indonesian spec phrasing; the
   plausibility ranges and foreign-noun guard bound its error modes,
   and every uncertain outcome degrades to incomplete/verification
   rather than to a silent match or an invented equivalence.
3. Cross-notation concrete comparison (K- ↔ f′c) intentionally stops
   at NEEDS_VERIFICATION until an official conversion basis is adopted
   by the owner; the same applies to nominal pipe inch ↔ mm.
4. Paint *system* (beyond coat count), generic roof letter grades, and
   aluminium frame inch sizes are documented non-extractions, not
   oversights.
