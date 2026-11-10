# DED Canonical Price Reference Service — Consolidation Design & Inventory

Sprint 4, Task C. Status: **additive read-only layer implemented;
behavioural unification NOT performed (staged migration plan in §6).**
Scope fence honoured: no file under `api/_lib/*` or
`supabase/migrations/*` was touched; neither price base was deleted; no
existing price was changed, averaged, or silently replaced; the
Full AI finalisation behaviour (`ded-full-ai/validator.ts`,
`ded-full-ai/service.ts`) was not modified.

Companion audit: `docs/audits/DED_MATERIAL_SPECIFICATION_VALIDATION.md`
(Task D — the structured specification guard that the canonical model
reuses for its `structuredSpec` field).

---

## 1. The two living bases, as found in code

| | A. Curated external references | B. Jakarta market table |
|---|---|---|
| File | `src/ai-tools/ded-ai-estimate/externalPriceReferences.ts` | `src/ai-tools/ded-full-ai/jakartaPrices.ts` |
| Export | `EXTERNAL_PRICE_REFERENCES: ExternalPriceReference[]` | `JAKARTA_2026_PRICES: PriceReference[]` |
| Entries | **13 families** | **49 entries** |
| Fields per entry | id, matchKeywords, excludeKeywords, unit, recommendedPrice, rangeMin, rangeMax, scope, tier, sourceName, sourceUrl, sourceDate, accessedAt, region, confidence, specAssumption | name, unit, price, category, note? |
| Source identity | Per-entry URL + source name | None per entry; file header only ("compilation of Jabodetabek 2026 market material & labour prices; must be localised to regency/city HSPK for contracts") |
| Data date | `sourceDate = 2026-10-22` on all 13 | Not stated per entry (null) |
| Access date | `accessedAt = 2026-11-10` on all 13 (`EXTERNAL_REFERENCES_ACCESSED_AT`) | Not stated per entry, except 12 entries whose `note` records the 2026-11-10 market-research alignment |
| Freshness rule | 30-day TTL from `accessedAt` (`priceResearchCache.referenceIsStale`, `RESEARCH_CACHE_TTL_DAYS = 30`) → **the whole curated batch goes stale after 2026-12-10** | No freshness rule in the file |
| Region | "Nasional (Jawa)" (9), "Nasional (perkotaan)" (4) | Jakarta / Jabodetabek (file title/header) |
| Consumers | Standard pipeline and Full AI completion pass, both via `findExternalReference()` / `findConflictingReference()` in `priceCompletion.ts` and `ded-full-ai/service.ts`; session cache in `priceResearchCache.ts` | Full AI prompt text only, via `formatPriceReferenceForPrompt()` ("HARGA JAKARTA 2026 (estimasi, bukan HSPK) … label AI_ESTIMATE"); **not** used by the deterministic completion pass |
| Hierarchy tiers served | Tier 3 (SUPPLIER_MANUFACTURER → `VERIFIED_SUPPLIER`) and tier 4 (CONTRACTOR_MARKET → `MARKET_REFERENCE`), mapped by `priceSourceKindFor()` | Prompt-level AI_ESTIMATE guidance only; as a source it is a market compilation, i.e. capped at `MARKET_REFERENCE` provenance |

The bases were already partially reconciled by hand on 2026-11-10:
the Jakarta file header records that its roof/frame/ceiling/electrical
entries were "added & aligned from dated open market research" — the
same research that produced base A. §3 proves what that alignment does
and does not cover.

---

## 2. Full inventory

### 2.1 Base A — curated external references (13)

All 13 share `sourceDate = 2026-10-22`, `accessedAt = 2026-11-10`,
`scope = TERPASANG_PENUH`. Prices in IDR.

| ID | Match (keywords / unit) | Price (range) | Tier | Region | Conf. | Source (URL) | Specification assumption (abridged) |
|---|---|---|---|---|---|---|---|
| ext-rangka-baja-ringan | rangka atap + baja ringan / m2 | 165,000 (150,000–175,000) | CONTRACTOR_MARKET | Nasional (Jawa) | MEDIUM | homeX.co.id (https://www.homex.co.id) | Light-steel roof frame installed: C-channel 0.75 mm + battens, for light covers (spandek/metal); contractor band Rp130,000–200,000 |
| ext-penutup-spandek | penutup atap + spandek / m2 | 95,000 (80,000–120,000) | CONTRACTOR_MARKET | Nasional (Jawa) | MEDIUM | builder.id (https://www.builder.id) | Plain spandek cover, material + install, frame excluded |
| ext-nok-spandek | nok, excl. "nok genteng beton"/"nok karpusan" / m' | 55,000 (45,000–70,000) | CONTRACTOR_MARKET | Nasional (Jawa) | MEDIUM | amanahbaja.com (https://www.amanahbaja.com) | Metal ridge for spandek roof, installed incl. accessories & sealant |
| ext-listplank-kalsiboard | listplank / m' | 65,000 (50,000–80,000) | CONTRACTOR_MARKET | Nasional (Jawa) | MEDIUM | builder.id (https://www.builder.id) | Calcium-silicate/GRC fascia ±150 mm wide, installed incl. light support frame & base finish |
| ext-plafon-gypsum-hollow | plafon + gypsum / m2 | 150,000 (135,000–185,000) | CONTRACTOR_MARKET | Nasional (Jawa) | MEDIUM | jasatukang.co.id (https://www.jasatukang.co.id) | Plain 9 mm gypsum ceiling + hollow frame installed, excl. final paint & profile trim |
| ext-pintu-p1-double-hpl | pintu + double / unit | 3,500,000 (2,500,000–4,500,000) | SUPPLIER_MANUFACTURER | Nasional (Jawa) | LOW | skala8.com (https://www.skala8.com) | Main DOUBLE door: 4″ aluminium frame + two 18 mm multiplex leaves, HPL finish + glass, fully installed. Multi-source synthesis — lowest confidence in the set |
| ext-pintu-p2-panel-aluminium | pintu + panel + aluminium, excl. double / unit | 1,800,000 (1,250,000–2,500,000) | SUPPLIER_MANUFACTURER | Nasional (Jawa) | MEDIUM | workshop.co.id (https://www.workshop.co.id) | Single door, aluminium frame + aluminium box panel, fully installed |
| ext-jendela-aluminium-kaca5 | jendela + aluminium, excl. boven/bv / unit | 900,000 (565,000–2,100,000) | SUPPLIER_MANUFACTURER | Nasional (Jawa) | MEDIUM | workshop.co.id (https://www.workshop.co.id) | Aluminium window + 5 mm clear glass per typical house unit (larger than the 60×120 cheapest anchor), installed; exact size per type unread in DED |
| ext-bovenlicht-aluminium | boven / unit | 350,000 (215,000–450,000) | SUPPLIER_MANUFACTURER | Nasional (Jawa) | MEDIUM | skliving.co.id (https://skliving.co.id/product-category/jendela-aluminium/) | Aluminium bovenlicht + glass ±30×50 to 40×60; product price + installation |
| ext-titik-penerangan | titik + penerangan / titik | 185,000 (150,000–225,000) | CONTRACTOR_MARKET | Nasional (perkotaan) | HIGH | skala8.com (https://www.skala8.com/harga-tukang-listrik-per-titik/) | One lighting point = fitting + switch + NYM 2×1.5 mm² cable + installation, mid-grade materials |
| ext-stop-kontak | stop kontak / titik | 200,000 (160,000–240,000) | CONTRACTOR_MARKET | Nasional (perkotaan) | HIGH | skala8.com (same URL) | One socket point 10A/16A + NYM 3×2.5 mm² cable + installation |
| ext-sakelar | sakelar / titik | 165,000 (120,000–220,000) | CONTRACTOR_MARKET | Nasional (perkotaan) | MEDIUM | skala8.com (same URL) | One switch point, single/double 10A + cable + installation; **combined range of two sources with differing bands** |
| ext-phb-box-mcb | mcb / unit | 425,000 (350,000–500,000) | CONTRACTOR_MARKET | Nasional (perkotaan) | HIGH | skala8.com (same URL) | One residential PHB/MCB box incl. per-circuit MCBs and basic earthing, installed |

### 2.2 Base B — Jakarta 2026 table (49)

No per-entry URL, data date, range, confidence, or keywords exist in
this base; in the canonical mapping those fields are **null (unknown)**,
never borrowed from base A. `accessedAt` is `2026-11-10` **only** for
the 12 entries marked †, whose own `note` in the source file records
the 2026-11-10 research alignment; the other 37 are null. Region for
all: Jakarta / Jabodetabek. Prices in IDR, single point values.

| # | Name | Unit | Price | Category |
|---|---|---|---|---|
| 1 | Galian tanah biasa | m3 | 85,000 | Tanah |
| 2 | Pasangan batu kali 1:4 | m3 | 650,000 | Pondasi |
| 3 | Urugan tanah kembali | m3 | 45,000 | Tanah |
| 4 | Lapis pasir bawah pondasi | m3 | 280,000 | Pondasi |
| 5 | Aanstanping batu kosong | m3 | 520,000 | Pondasi |
| 6 | Beton site mix K-225 | m3 | 1,150,000 | Beton |
| 7 | Beton ready mix K-225 | m3 | 1,250,000 | Beton |
| 8 | Pembesian (bahan + upah) | kg | 18,500 | Besi |
| 9 | Bekisting kayu | m2 | 185,000 | Bekisting |
| 10 | Pasangan bata merah 1/2 bata | m2 | 95,000 | Dinding |
| 11 | Pasangan batako | m2 | 85,000 | Dinding |
| 12 | Plester 1:4 tebal 15mm | m2 | 65,000 | Dinding |
| 13 | Acian semen | m2 | 45,000 | Dinding |
| 14 | Keramik 40x40 terpasang | m2 | 145,000 | Lantai |
| 15 | Keramik 60x60 terpasang | m2 | 185,000 | Lantai |
| 16 | Spesi lantai | m2 | 55,000 | Lantai |
| 17 | Kuda-kuda baja ringan | m2 | 185,000 | Atap |
| 18 | Reng baja ringan | m2 | 45,000 | Atap |
| 19 | Rangka atap baja ringan terpasang † | m2 | 165,000 | Atap |
| 20 | Penutup atap spandek terpasang † | m2 | 95,000 | Atap |
| 21 | Nok spandek/metal terpasang † | m1 | 55,000 | Atap |
| 22 | Genteng karang pilang terpasang | m2 | 95,000 | Atap |
| 23 | Genteng metal terpasang | m2 | 75,000 | Atap |
| 24 | Bubungan genteng | m1 | 85,000 | Atap |
| 25 | Lisplang GRC | m1 | 65,000 | Atap |
| 26 | Kusen kayu ulin 5/10 | m1 | 450,000 | Kusen |
| 27 | Kusen kayu kamper 5/10 | m1 | 285,000 | Kusen |
| 28 | Daun pintu panel + engsel | unit | 850,000 | Pintu |
| 29 | Pintu double multipleks HPL + kusen aluminium † | unit | 3,500,000 | Pintu |
| 30 | Pintu panel aluminium + kusen † | unit | 1,800,000 | Pintu |
| 31 | Jendela kaca + kusen | unit | 650,000 | Jendela |
| 32 | Jendela aluminium + kaca 5 mm † | unit | 900,000 | Jendela |
| 33 | Bovenlicht aluminium + kaca † | unit | 350,000 | Jendela |
| 34 | Plafon gypsum 9mm + rangka hollow terpasang † | m2 | 150,000 | Plafon |
| 35 | Plafon GRC | m2 | 85,000 | Plafon |
| 36 | Pengecatan dinding (2 lapis) | m2 | 35,000 | Cat |
| 37 | Pengecatan kayu/besi | m2 | 45,000 | Cat |
| 38 | Instalasi listrik rumah tinggal | lot | 3,500,000 | MEP |
| 39 | Titik penerangan terpasang (material + jasa) † | titik | 185,000 | MEP |
| 40 | Stop kontak terpasang † | titik | 200,000 | MEP |
| 41 | Sakelar terpasang † | titik | 165,000 | MEP |
| 42 | Box MCB/PHB terpasang † | unit | 425,000 | MEP |
| 43 | Instalasi plumbing + sanitair | lot | 2,500,000 | MEP |
| 44 | Septictank + resapan | lot | 4,500,000 | MEP |
| 45 | Lapis aus AC-WC | m2 | 185,000 | Jalan |
| 46 | Aspal lapen | m2 | 125,000 | Jalan |
| 47 | Urugan sirtu padat | m3 | 385,000 | Jalan |
| 48 | Urugan tanah | m3 | 95,000 | Jalan |
| 49 | Beton K-350 jalan | m3 | 1,350,000 | Jalan |

---

## 3. Comparison — duplicates, overlaps, conflicts

### 3.1 Aligned pairs: 13, with **zero price conflicts**

Every one of the 13 curated families has a Jakarta counterpart, and in
all 13 pairs the prices are **exactly equal** (delta Rp0). Twelve pairs
are the documented 2026-11-10 alignment († above); the thirteenth —
Jakarta "Lisplang GRC" 65,000/m1 vs curated "listplank" 65,000/m′ — is
price-equal but carries no research note on the Jakarta side, so its
alignment is inferred from the equal price, not documented.

| Family | Curated (A) | Jakarta (B) | Delta |
|---|---|---|---|
| Light-steel roof frame, installed | 165,000 / m2 | 165,000 / m2 (#19) | 0 |
| Spandek cover, installed | 95,000 / m2 | 95,000 / m2 (#20) | 0 |
| Spandek/metal ridge | 55,000 / m' | 55,000 / m1 (#21) | 0 |
| Fascia (kalsiboard/GRC vs GRC) | 65,000 / m' | 65,000 / m1 (#25) | 0 |
| Gypsum ceiling 9 mm + hollow | 150,000 / m2 | 150,000 / m2 (#34) | 0 |
| Double door, multiplex HPL + alu frame | 3,500,000 / unit | 3,500,000 / unit (#29) | 0 |
| Aluminium panel door + frame | 1,800,000 / unit | 1,800,000 / unit (#30) | 0 |
| Aluminium window + 5 mm glass | 900,000 / unit | 900,000 / unit (#32) | 0 |
| Bovenlicht aluminium + glass | 350,000 / unit | 350,000 / unit (#33) | 0 |
| Lighting point | 185,000 / titik | 185,000 / titik (#39) | 0 |
| Socket point | 200,000 / titik | 200,000 / titik (#40) | 0 |
| Switch point | 165,000 / titik | 165,000 / titik (#41) | 0 |
| MCB/PHB box | 425,000 / unit | 425,000 / unit (#42) | 0 |

**Finding C-1 (headline): there is no exact-item price conflict
between the two bases.** Any consolidation that "reconciles" prices
would be solving a problem that does not exist in the aligned set.
The real risks are the overlaps in §3.2 — same description space,
different specification or scope — which is exactly what the Task D
specification guard addresses.

Unit notation is inconsistent across the bases for the same pairs:
Jakarta writes linear metres as `m1` (5 entries: #21, #24, #25, #26,
#27), the curated base as `m'`. The canonical model therefore carries
both `unit` (verbatim) and `normalizedUnit` (`m1` → `m'`).

### 3.2 Overlaps and hazards (not exact conflicts)

| ID | Overlap | Numbers (exact) | Why it matters |
|---|---|---|---|
| H1 | Jakarta "Jendela kaca + kusen" (#31, frame material unstated) vs aluminium-specific window (both bases) | **650,000 vs 900,000 / unit (delta −250,000)** | A loose matcher over the Jakarta text can underprice an aluminium window by 27.8%. The curated base avoids this by keyword + the aluminium-material guard; the prompt path has no such guard beyond the model's reading. |
| H2 | Jakarta full-frame "Rangka atap baja ringan terpasang" (#19) coexists with component entries "Kuda-kuda baja ringan" (#17) + "Reng baja ringan" (#18) | **165,000 vs 185,000 + 45,000 = 230,000 / m2** | Scope double-count hazard: the component entries sum to 39% more than the installed full-frame price, and the truss-only entry (185,000) alone exceeds the full-frame price. #17/#18 are legacy compilation entries; #19 is the researched one. A consumer must never sum them. |
| H3 | Intra-Jakarta near-duplicate: "Urugan tanah kembali" (#3, Tanah) vs "Urugan tanah" (#48, Jalan) | **45,000 vs 95,000 / m3 (2.1×)** | The closest thing to a true conflict in either base. The items are legitimately different work (backfill reusing excavated soil vs imported road fill), but the names differ by one word; any name-only matching can pick the wrong one. Neither base's current consumer matches them automatically (curated keywords don't cover them; prompt-only in Full AI). |
| H4 | Ridge items: Jakarta "Bubungan genteng" (#24) vs "Nok spandek/metal" (#21) / curated nok | **85,000 vs 55,000 / m1** | Different roof types (clay-tile ridge vs metal ridge). Cross-application would misprice by 30,000/m. The curated guard already rejects genteng items for the spandek reference (word-boundary rule). |
| H5 | Jakarta concrete pair: site mix K-225 (#6) vs ready mix K-225 (#7); plus K-350 road concrete (#49) | **1,150,000 vs 1,250,000 / m3 (+100,000)**; 1,350,000 / m3 | Same class, different production method — a legitimate scope difference, and the reason the canonical model keeps production/scope in the specification text rather than collapsing by class alone. No curated counterpart exists. |
| H6 | Jakarta "Daun pintu panel + engsel" (#28, leaf only, frame unstated) vs full installed aluminium panel door (both bases) | **850,000 vs 1,800,000 / unit** | Scope difference (leaf vs complete set). Harmless while scope is read; hazardous to any consumer that matches on "pintu panel" alone. The curated base's keyword set (`pintu + panel + aluminium`, excluding `double`) does not match #28's phrasing. |
| H7 | Jakarta lump-sum electrical "Instalasi listrik rumah tinggal" (#38, lot) coexists with per-point entries (#39–#42) | **3,500,000 / lot vs 185,000–425,000 per point/unit** | Lot vs per-point double-count hazard in the prompt path; the deterministic completion pass never sees the lot entry. |
| H8 | Jakarta "Genteng karang pilang terpasang" (#22) coincidentally equals the spandek cover price | **95,000 / m2 = spandek 95,000 / m2** | Price equality is coincidence across different materials; the overlap detector in the canonical service deliberately requires a shared name token, so this pair is **not** reported as aligned (locked by test D2). |
| H9 | Ceiling materials: Jakarta "Plafon GRC" (#35) vs gypsum ceiling (both bases) | **85,000 vs 150,000 / m2** | Material-differentiated and consistent with the coarse guard (GRC items are rejected for the gypsum reference). No action needed. |

### 3.3 Unique entries per base

- **Unique to base A (curated): none in item coverage** — all 13
  families exist in base B. Base A's uniqueness is *structure*, not
  items: ranges, per-entry URLs and dates, keyword/exclusion matching,
  scope, confidence, and the specification assumptions that feed the
  Task D guard.
- **Unique to base B (Jakarta): 36 entries** with no curated
  counterpart — everything except the 13 aligned families: earthwork &
  foundations (#1–#5), concrete/rebar/formwork (#6–#9), masonry &
  plaster (#10–#13), floors (#14–#16), roof components & clay/metal
  tiles (#17, #18, #22–#24), timber frames (#26, #27), door leaf (#28),
  generic window (#31), GRC ceiling (#35), painting (#36, #37),
  lump-sum MEP & septic tank (#38, #43, #44), and road works
  (#45–#49). These are prompt-only guidance today and have **no**
  deterministic completion coverage — a coverage gap, not a conflict.

---

## 4. Canonical data model

Implemented (read-only) in
`src/ai-tools/ded-ai-estimate/canonicalPriceReferenceService.ts` as
`CanonicalPriceReference`:

| Field | Meaning | Base A source | Base B source |
|---|---|---|---|
| `id` | Canonical identity | Source id verbatim (`ext-…`) | **Derived** deterministic id `jkt-<nn>-<slug>` — the source has no ids; derivation is disclosed in `provenanceNote`, never presented as a source id |
| `origin` | `EXTERNAL_CURATED` / `JAKARTA_2026_TABLE` | — | — |
| `description` | Item description | `specAssumption` (family description) | `name` verbatim |
| `category` | Source category | null (none in source) | `category` |
| `unit` / `normalizedUnit` | Verbatim unit + cross-base normal form (`m1`→`m'`) | `unit` | `unit` |
| `price` | Recommended/single price, never an average | `recommendedPrice` | `price` |
| `rangeMin` / `rangeMax` | Price band | from source | **null — not stated** |
| `scope` | `TERPASANG_PENUH` / `MATERIAL_SAJA` / `TIDAK_DINYATAKAN` | `scope` | `TIDAK_DINYATAKAN` (the source does not declare scope per entry; several names say "terpasang" but that is description text, not a scope field — kept in `specText`, not promoted) |
| `hierarchyTier` | Position in the fixed hierarchy | SUPPLIER_MANUFACTURER→`VERIFIED_SUPPLIER`, CONTRACTOR_MARKET→`MARKET_REFERENCE` | `MARKET_REFERENCE` (a market compilation caps at market tier even where its price aligns with a supplier-tier twin — provenance follows the entry's own source) |
| `sourceName` | Source identity | `sourceName` | Compilation identity + the entry's own `note` appended |
| `sourceUrl` | Per-entry URL | `sourceUrl` | **null — unknown** |
| `sourceDate` | Data/publication date as stated by the source | `sourceDate` (2026-10-22) | **null — unknown** |
| `accessedAt` | Research/access date | `accessedAt` (2026-11-10) | `2026-11-10` only for the 12 † entries whose own note states it; otherwise **null** |
| `region` | Price region | `region` | "Jakarta / Jabodetabek" (file header) |
| `confidence` | Stated confidence | `confidence` | **null — not stated** |
| `verificationStatus` | Always `UNVERIFIED` in both bases (neither is an official source) | — | — |
| `specText` | Specification text verbatim | `specAssumption` | `name` |
| `structuredSpec` | Structured material attributes parsed reliably from `specText` (Task D parser: thickness, glass, cable section, concrete class, rebar, pipe, coating grade, paint coats, dimensions) | parsed | parsed |
| `matchKeywords` / `excludeKeywords` | Deterministic matching contract | from source | **null** (prompt-matched today) |
| `provenanceNote` | What is known/derived/unknown about this record | generated | generated |

Freshness is a *function of the record and a date*, not a stored
field: `canonicalFreshness(ref, now)` returns `FRESH` (accessedAt +
30 days not yet passed), `STALE` (access date known, TTL passed), or
`UNKNOWN` (no access date — the 37 legacy Jakarta entries). `UNKNOWN`
is never silently promoted to fresh.

The fixed hierarchy is exported as `CANONICAL_PRICE_HIERARCHY` =
`OFFICIAL_AHSP → OFFICIAL_SSH_HSPK → VERIFIED_SUPPLIER →
MARKET_REFERENCE → AI_ESTIMATE → UNRESOLVED`, and
`OFFICIAL_SSH_HSPK_REFERENCES` is an **empty** list by design: neither
base contains an official SSH/HSPK record, and none was fabricated.

### 4.1 Conceptual data-migration schema

Mapping both bases into the model is a pure projection (implemented as
`canonicalFromExternal` / `canonicalFromJakarta`); no source file is
rewritten. If the model is later persisted, the storage schema is the
interface above plus audit columns: `supersedesId` (refresh lineage),
`priceHistory` (previous price/range/scope with the access date that
produced them), and `retiredAt`. Those columns are **designed, not
implemented** — there is no persistence layer for references today
(the session cache in `priceResearchCache.ts` is an optimisation, not
a store of record).

---

## 5. Single consumption path (target design)

Today there are two consumption paths and **no second price-resolution
model may be added**: the deterministic resolver is
`priceCompletion.ts` (standard) with its Full AI parity pass in
`ded-full-ai/service.ts`; both already share `findExternalReference`,
the specification guard, `priceSourceKindFor`, and the
`DedPriceCompletion` block. The Jakarta table feeds only the Full AI
*prompt* (model guidance labelled AI_ESTIMATE), never the resolver.

Target, reached by the staged plan in §6 — one canonical read API in
front of the existing resolver, not a new resolver:

```
                 ┌────────────────────────────────────────────┐
 AHSP canonical  │  Canonical reference service (read-only)   │
 (existing,      │  listCanonicalReferences()                 │
  unchanged) ───►│  canonicalFreshness() / revalidation list  │
                 │  findCrossBaseOverlaps() (audit only)      │
 SSH/HSPK        └───────────────┬────────────────────────────┘
 (EMPTY tier)                    │ projection (no price changes)
                 ┌───────────────▼────────────────────────────┐
                 │  Existing resolver (single model)          │
                 │  priceCompletion.ts + Full AI parity pass  │
                 │  findExternalReference + spec guard (D)    │
                 └───────────────┬────────────────────────────┘
                                 │ DedPriceCompletion blocks
                 ┌───────────────▼────────────────────────────┐
                 │  Full AI prompt (Jakarta entries remain    │
                 │  prompt guidance until Stage 2 promotes    │
                 │  them into curated, dated, URL'd records)  │
                 └────────────────────────────────────────────┘
```

---

## 6. Implementation decision & staged migration plan

**Decision: documentation + additive read-only layer only.**
Implemented now (this sprint): `canonicalPriceReferenceService.ts`
(projection of both bases, freshness, revalidation list, overlap
audit) with its own regression suite
(`src/test/dedCanonicalReferenceService.src.ts`, 19 checks). Nothing
imports it from the resolution path, so **no fixture price or outcome
changes** — verified by the unchanged regression suites (§7).

**Why real unification was NOT done in this step:**

1. Promoting Jakarta entries into the deterministic resolver would
   change completion behaviour: 36 Jakarta-only families would start
   filling prices that today stay unresolved or prompt-guided. That
   is a product decision (coverage vs. provenance strength), not a
   refactor — those entries have no URL, no data date, no range, no
   scope field, and no keyword/exclusion contract, so they cannot yet
   meet the curated base's evidence bar.
2. Retiring the Jakarta prompt table before its entries are promoted
   would silently remove price guidance the Full AI model currently
   uses for earthwork/concrete/road items.
3. The one genuine ambiguity (H3, urugan 45,000 vs 95,000) and the
   scope hazards (H2, H6, H7) need owner-visible decisions, not code.

**Staged plan (each stage separately grantable, none started):**

- **Stage 1 — Provenance capture for Jakarta legacy entries.**
  Research pass that gives the 36 unique + 1 unnoted (lisplang)
  entries what the curated base has: source URL, data date, access
  date, range, scope, confidence. Until then they remain
  `UNKNOWN`-freshness market references. *Risk: low; no behaviour
  change.*
- **Stage 2 — Curated promotion.** Entries that pass Stage 1 are
  re-issued as curated families (keywords, exclusions, specAssumption)
  in the external base format, resolving H1/H3/H6 by explicit keyword
  and specification contracts (e.g. urugan kembali vs urugan jalan as
  separate families with exclusion keywords). The resolver then covers
  them with `DedPriceCompletion` blocks like any curated family.
  *Risk: medium — completion counts and fixture totals WILL change;
  requires fixture re-baselining under a separate grant.*
- **Stage 3 — Prompt table retirement.** Once a Jakarta entry has a
  curated twin, `formatPriceReferenceForPrompt()` drops it (the model
  still receives the price via the completion pass provenance). The
  Jakarta file is archived, not deleted, in the same commit.
  *Risk: medium — prompt behaviour changes; needs Full AI regression
  comparison.*
- **Stage 4 — Single read API.** `priceCompletion.ts` and the Full AI
  parity pass read curated families through the canonical service
  projection instead of importing the raw array. Pure refactor behind
  the existing resolver; hierarchy and `priceSourceKindFor` mapping
  unchanged. *Risk: low–medium; guarded by the existing suites.*

---

## 7. Refresh process (documented; marking implemented, execution not)

**Deadline that applies now: the curated batch goes stale after
2026-12-10** (accessed 2026-11-10 + 30-day TTL). The 12 aligned Jakarta
entries share that access date and go stale on the same day; the 37
legacy Jakarta entries are `UNKNOWN` freshness — already in need of
provenance capture (Stage 1), not of date extension.

A legitimate refresh, per reference family:

1. Re-open the recorded `sourceUrl` (or find the current equivalent
   source) and re-verify, per entry: price and range, region,
   coverage/scope, unit, and the material specification assumption —
   including a Task D structured-spec comparison of old vs new
   assumption text, so a silent spec change (e.g. 0.75 mm → 0.70 mm
   standard) is caught as a specification change, not just a price
   change.
2. Record the **new** access date from the actual research date. The
   recorded `accessedAt` of an existing entry is **never** extended
   artificially — a stale entry stays labelled stale (and downgrades
   to AI_ESTIMATE in the resolver, per the existing stale rule) until
   real re-research happens.
3. Preserve history: the superseded price/range/scope and its access
   date remain auditable (resolver-side this already exists as
   `DedPriceCompletion.history` for applied prices; at the reference
   level it is the `priceHistory`/`supersedesId` design in §4.1,
   implemented when Stage 4 lands persistence).
4. Re-run the regression suites; any fixture total change is reported
   as a refresh effect, never absorbed silently.

Implemented now, additively: `referencesNeedingRevalidation(now)`
returns the two work queues — `stale` (25 records on 2026-12-11: 13
curated + 12 aligned Jakarta) and `unknownFreshness` (37 records).
It marks; it does not modify any record.

---

## 8. Verification (Sprint 4, Task C)

- New suite `dedCanonicalReferenceService.src.ts`: **19 PASS / 0 FAIL**
  (inventory counts, mapping fidelity, null-honesty, hierarchy,
  empty SSH/HSPK tier, freshness boundaries 2026-12-10/2026-12-11,
  revalidation queues, overlap detection incl. the H8 non-pairing).
- Pre-existing suites re-run unchanged — see the Task D audit §6 for
  the full regression table (all green; no expectation was modified).
