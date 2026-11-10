# EZRAB FIXALL — Combined Report (2026-11-10)

**Grant:** owner, 2026-11-10 16:06 WIB — "perbaiki semua" (fix everything),
covering exactly the three open items reported that afternoon: (1) disposable
PostgreSQL provisioning + Unified Credits runtime SQL verification,
(2) F-E2 complexity wiring, (3) genuine refresh of the 13 curated DED price
references; then commit + push as follow-up batches on the same branch.
Owner context: launch target within 2 days (by 12 Nov 2026).

**Repo / branch:** `ezrab-unified`, `integrasi/unified-ui-engine`.
**Baseline HEAD:** `61a464b` (the 8-batch push of 2026-11-10 16:05, remote
verified). Worktree protection snapshot taken before any change:
`~/workspace/your_files/EZRAB-FIXALL-2026-11-10/baseline/`.

**Result summary: all three workstreams PASS.** No SQL defect was found in
the migration under test; the two runtime failures encountered were defects
in the *test harness's expectations*, corrected minimally with backups and
documented below. The DED fixture total is unchanged.

---

## WS1 — Disposable provisioning + runtime SQL verification: PASS

### Path taken (read this first)

The Docker route was attempted first and in earnest (three orchestration
runs, evidence in `ws1-evidence/run.log`, `run2.log`, `run3.log`): Docker
Engine 29.1.3 installs and the daemon starts reliably only with the `vfs`
storage driver, but **image acquisition through this sandbox's egress
failed every way it was tried** — daemon pulls die with TLS handshake
timeouts (the daemon does not use the sandbox proxy; Docker Hub resolves to
synthetic 198.18.x.x addresses), and a `crane` pull of
`supabase/postgres:15.19.0.018` hung for over 17 minutes producing zero
bytes of log. Per the grant's fallback clause, provisioning therefore used
**Path C: a local PostgreSQL 16.15 cluster + a Supabase-flavour shim**,
in a single orchestration session (`ws1-run10.sh`), because exec sessions
land on cells whose root filesystems are not shared (only `/home`
persists).

The flavour shim (`~/workspace/your_files/EZRAB-FIXALL-2026-11-10/ws1-supabase-flavour-shim.sql`)
was applied to `template1` so harness-created databases inherit it. It
mirrors supabase/postgres's own provisioning and covers exactly the
consumption inventory derived from the migration chain by grep (spec
`UNIFIED_CREDITS_SPRINT_7_PROVISIONING_SPEC.md` §2): roles `anon`,
`authenticated`, `service_role` (NOLOGIN; `service_role` BYPASSRLS),
schema `auth`, table `auth.users(id uuid PK, email, raw_user_meta_data
jsonb, …)` — the trigger in `20261008` reads `NEW.raw_user_meta_data` —
and `auth.uid()` / `auth.role()` / `auth.jwt()` with the real JWT-claims
definitions. **Honest scope note:** this is a functionally equivalent
flavour for everything the migration chain and the harness actually
consume (FK target, trigger target, policy expressions, role grants). It
is not the `supabase/postgres` image itself; if the owner wants
image-exact verification, the same harness runs unchanged against that
image once a machine with working registry egress runs it. Disposable
discipline held throughout: loopback-only (127.0.0.1, port 55433), data
dir on the cell's native filesystem (the workspace mount forbids `chown`,
which cost runs v4–v5), cluster stopped and data dir removed at the end,
no persistent or production database ever contacted.

### Harness result (final run v10, `sql-harness-v2/run_all.sh`)

```
================ HARNESS SUMMARY ================
  apply-migrations     PASS
  reapply-subject-F1   PASS
  setup                PASS
  assertions2          PASS
  concurrency          PASS
RESULT: ALL STAGES PASS
== assertion summary: 55 passed, 0 failed ==
```

- **Migration chain applied cleanly, in order:** `20261008` →
  `20261102_billing_batch_ledger` → `20261102_phase53_workspace_billing` →
  `20261109_billing_orders_subscriptions` → subject
  `20261110_unified_credits_foundation.sql`, then the subject re-applied
  (F-1 idempotency) cleanly.
- **Assertions A–I (assertions2.sql) all pass**, including settlement
  arithmetic, expiry sweeping, the reconciliation view, and the
  idempotency-conflict tripwire (I).
- **Concurrency S1–S6: 55/55 asserts pass**, every one under the Sprint 6
  independent-session evidence protocol — for each scenario, session A's
  ready marker was written from inside A, a third observer verified
  session B genuinely waiting in `pg_stat_activity` *before* A was
  allowed to commit, and final state was asserted. Covered: S1 concurrent
  reserve (F-6 locking; loser gets `insufficient_balance`, zero
  allocations), S2 concurrent `issue_batch` idempotency (advisory lock;
  both callers receive the identical batch; exactly one batch + one
  GRANT entry), S3 concurrent settle (F-10 terminal CAS; loser gets
  `duplicate`; consumed exactly once), S4 concurrent `resolve_review`
  (consumption 95 once, one REVIEW_DECISION entry), S5 expiry↔reserve
  race in both orders (reserved 40 never swept; identical end states),
  S6 `issue_batch` failure atomicity + same-key retry/replay.
- **P-1 role authorization: PASS** (second disposable DB, full chain +
  setup): `pg_proc.proacl` for all five RPCs is exactly
  `{postgres=X, service_role=X}`; `has_function_privilege` — anon ✗,
  authenticated ✗, public ✗, service_role ✓ on all five; live `SET ROLE`
  attempts: anon/authenticated → `permission denied` on both probed
  functions; service_role executed `apply_expirations` (returned 0) and
  `issue_batch` through validation to its INSERT (failing only on the FK
  of the deliberately synthetic account id — proof the permission gate
  passed). The reconciliation view grants SELECT to *nobody* (all three
  roles false) — that matches the migration's REVOKE-only design (F-2);
  it is not a defect.
- **Disposal proven:** after the run, `remaining_disposable_dbs: 0`,
  only `postgres/template1/template0` remained, the server was stopped
  and the data directory removed. Harness naming pattern
  `^ezrab_sprint5_disposable_` and marker `EZRAB_SPRINT5_DISPOSABLE` kept
  exactly as the owner decided.

### Defects found — both in the harness, none in the migration

The migration under test is **byte-identical** to its pre-run state
(md5 `170f0d79b0b43dccea9f81b95ed5ea27` before and after all runs). The
first full executions in programme history surfaced two wrong
*expectations* in the harness:

1. **assertions2.sql §H** assumed a 40-credit reserve lands on the
   TOP_UP batch. Runtime proved it lands on BONUS: the owner-locked
   allocation policy (`api/_lib/creditAllocation.js`,
   `ALLOCATION_POLICY_STATUS = 'CONFIRMED_OWNER_PHASE_5_1'`, Policy Lock
   2026-11-02) orders SUBSCRIPTION → BONUS/FREE_ONCE → TOP_UP, and the
   SQL `reserve_credits` mirrors it exactly. First sweep total (110) was
   already correct under either reading, which is how the wrong premise
   survived static review. Corrected asserts: TOP_UP swept in full
   (expired=100, reserved=0); BONUS keeps its reserved 40 unswept
   (expired=10, reserved=40) — the reserved-never-swept invariant is
   still exercised, on the correct batch. Backup:
   `assertions2.sql.bak-fixall-2026-11-10` (md5 `be605d6b…` → corrected
   `9d32c055…`); correction note embedded in the file.
2. **concurrency.sh S5 order 2** expected session B to be refused via a
   RAISE (string in B's stderr, non-zero psql exit). A dedicated
   experiment (`ws1-s5o2-experiment.sh`, log in evidence) proved the
   actual contract: B waits on `Lock:transactionid`; after A commits,
   `reserve_credits` **returns** `insufficient_balance` as a value on
   B's stdout (the same return contract S1 verifies), B's session stays
   alive and exits 0 on `\q`, and the final state is exactly right
   (remaining=0, reserved=40, expired=60, operation stays CREATED). The
   function's post-loop RAISE exists but is not the path taken when the
   caller serialises behind the account lock and its pre-check sees the
   post-commit state. The two asserts were corrected to the proven
   contract; the scenario header now documents the mechanism. Backup:
   `concurrency.sh.bak-fixall-2026-11-10` (md5 `b9c91363…` → corrected
   `22c9d0b2…`).

   Forensic footnote: in the failing runs the harness counted these two
   asserts as failed (55 total, 53 PASS lines) but their FAIL lines
   never survived into any captured log (combined capture, split-stream
   capture, and an `bash -x` trace run all agree on the count) — the
   failure direction was always fail-closed (stage FAIL), never silent
   pass, and the corrected full run prints 55 PASS lines.

Harness files live outside the repo
(`~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/`);
they are not part of the commits below.

---

## WS2 — F-E2 complexity wiring: PASS

Implemented exactly per `docs/audits/DED_SPRINT_5_COMPLEXITY_CONTRACT.md`
(owner decision: APPROVED), with the resolution addendum appended to that
document:

- `DedAiInputView.tsx` — the session object now carries the raw selected
  complexity (`DedAiSession.complexity`, passed by `handleStart`
  unchanged; the simulation display is untouched).
- `types.ts` — `DedAiServiceOptions.complexity?: 'simple'|'medium'|'complex'`
  (optional; absent stays absent — never silently defaulted); additive
  `complexity` field on `DedWorkflowUsage` (null when absent).
- `view.tsx` — passes `sess.mode === 'DETAIL' ? sess.complexity : undefined`
  into `execute(...)`.
- `usageMetadata.ts` — `buildDedUsageFromStandard` takes `ctx.complexity`,
  derives the key via `dedStandardFeatureKey(mode, complexity)`, and
  records `complexity: ctx.complexity ?? null` so absence is explicit in
  metadata. The Full AI builder records null. The pure key function's
  legacy `'medium'` fallback is retained for compatibility — it is no
  longer reachable from the DETAIL path without a recorded value.
- FAST stays `ded-ai/simple`. Every generated key validated against
  `api/_lib/featureBillingMatrix.js` — all three `ded-ai/*` keys exist;
  **no matrix change, no tariff change, no credit debited, metering
  stays OFF.**

Tests: `dedRequestCorrelation` **31/31** (C-series pins rewritten to the
approved behaviour: per-complexity keys C3a–C3e, and the absent-complexity
case records null — it may not silently become `medium`),
`dedUsageCreditsCompat` **36/36**, `dedHardening` **34/34**,
`dedGatewayUsageEvidence` **6/6 groups**, `chatFastMetering` **114/114**.

---

## WS3 — Refresh of the 13 curated DED price references: PASS

Method per `docs/audits/DED_SPRINT_5_PRICE_REFERENCE_REFRESH.md`: only
pages actually **opened** on 2026-11-10 (~09:17–09:19 UTC) count as
evidence — search snippets were never used as a basis. Opened:
homex.co.id, skala8.com (published 2026-10-29), builder.id,
amanahbaja.com (published 2026-09-22), jasatukang.co.id (published
2026-09-14), workshop.co.id, skliving.co.id, sejasa.com (published
2026-10-05), soloalumunium.co.id (revised 2026-10-30). A dated
opened-page verification note was appended to every family's `sourceName`
in `src/ai-tools/ded-ai-estimate/externalPriceReferences.ts`.
`accessedAt` is `2026-11-10`; `sourceDate` stays `2026-10-22` (the
records' original source date — pin D-a3 requires the distinction).

| # | Family | Recommended (Rp) | Range (Rp) | Conf. | Verdict |
|---|--------|------------------|------------|-------|---------|
| 1 | Baja ringan (atap) | 165.000 | 150.000–175.000 | MEDIUM | Confirmed unchanged (builder.id, amanahbaja) |
| 2 | Spandek | 95.000 | 80.000–120.000 | MEDIUM | Confirmed (builder.id Jawa band 80–120k) |
| 3 | Nok | 55.000 | 45.000–70.000 | MEDIUM | Confirmed (Jawa 45–65k; amanahbaja 50k/m) |
| 4 | Listplank | 65.000 | **55.000**–80.000 | MEDIUM | **rangeMin corrected 50.000 → 55.000** — builder.id's installed Jawa band starts at 55k; the old 50k was amanahbaja's *material-only* lisplang price, not installed |
| 5 | Plafon gypsum | 150.000 | 135.000–185.000 | MEDIUM | Confirmed (jasatukang.co.id 135–160k installed band) |
| 6 | Pintu P1 | 3.500.000 | 2.500.000–4.500.000 | LOW | Confirmed, LOW retained; corroborated by soloalumunium (double door 160×210 installed 3,2–9,0 jt) |
| 7 | Pintu P2 | 1.800.000 | 1.250.000–2.500.000 | MEDIUM | Confirmed; hazard documented — the source sells a swing+glass door while the family name says "panel aluminium"; not renamed |
| 8 | Jendela | 900.000 | 565.000–2.100.000 | MEDIUM | Confirmed (skliving casement 565k at range floor) |
| 9 | Bovenlicht | 350.000 | 215.000–450.000 | MEDIUM | Confirmed with hazard kept open: skliving's 215k is a *product-only* price (WhatsApp order, no installation); the record's installed synthesis stays labelled as such |
| 10 | Titik penerangan | 185.000 | 150.000–225.000 | HIGH | Confirmed (skala8 + sejasa agree) |
| 11 | Stop kontak | 200.000 | 160.000–240.000 | HIGH | Confirmed (skala8 + sejasa agree) |
| 12 | Sakelar | 165.000 | 120.000–220.000 | MEDIUM | Confirmed — combined range corroborated (skala8 120–180k + sejasa 145–220k); Sprint 5's doubt about the 120k floor resolved |
| 13 | PHB | 425.000 | 350.000–500.000 | HIGH | Confirmed (skala8 + sejasa agree) |

**12 of 13 recommended prices unchanged; one evidence-based range
correction (listplank).** No `recommendedPrice` changed, so the DED
fixture total is unchanged: **Rp149.023.200** (`dedPriceCompletion`
43/43). Standing hazards preserved: generic-Jakarta window ≠ curated
aluminium; installed frame ≠ sum of components; no Jakarta prompt-only
reference was promoted into the deterministic resolver.
`dedPriceReferenceRefresh` **16/16** (new pins D-a6 for the listplank
correction, D-a7 for the verification notes),
`dedCanonicalReferenceService` **19/19**.

---

## Final regression (solo, sequential, on the committed code state)

Credits: Phase 1 aggregate **174/174** (pricingPolicy 33, featureBillingMatrix 87, creditReconciliation 23, unifiedCreditLifecycle 31) ·
creditInvariantAdversarial 71/71 · creditConcurrencySprint3 52/52 ·
ai-metering 83/83 · deterministic-free-metering 94/94 · dedBillingCompat
42/42 · billingWebhook 38/38 · billingCatalogDrift 21/21 · billingCheckout
23/23 · billingDemoGate 46/46 · creditsActionHandler 9/9 ·
apiEndpointInventory 13/13 (Vercel 12-function ceiling intact) ·
financialConsistency 40/40 · Vitest billing set 110/110 · chatFastMetering
114/114.

DED: dedPriceCompletion 43/43 (fixture Rp149.023.200) ·
dedRequestCorrelation 31/31 · dedUsageCreditsCompat 36/36 ·
dedHardening 34/34 · dedPriceReferenceRefresh 16/16 ·
dedCanonicalReferenceService 19/19 · dedGatewayUsageEvidence 6/6 groups ·
dedDocPageShell 50/50.

TypeScript: `tsc --noEmit --skipLibCheck` (heap 4096) exit 0.
Vite build (heap 3072) exit 0 (`✓ built in 2m 8s`, chunk-size warnings
only).

## Commits (follow-up batches on `integrasi/unified-ui-engine`)

- F-E2 wiring batch: **`acd6e44`** — `src/ai-tools/ded-ai-estimate/{DedAiInputView.tsx, service.ts, types.ts, usageMetadata.ts, view.tsx}`, `src/test/dedRequestCorrelation.src.ts`, `docs/audits/DED_SPRINT_5_COMPLEXITY_CONTRACT.md` (resolution addendum). 7 files, +101/−9.
- Price-refresh batch: **`52e1dbd`** — `src/ai-tools/ded-ai-estimate/externalPriceReferences.ts`, `src/test/dedPriceReferenceRefresh.src.ts`. 2 files, +46/−24.
- Docs batch: this report (its own hash is the branch HEAD after this batch; see the delivery report).

## Fences affirmed

No production promotion (always the owner's manual act). No migration
executed on any persistent or production database — the subject migration
ran only on throwaway local clusters created and destroyed inside this
task; **D16 is still required** before any persistent execution. No
Vercel env change. `AUTH_ENABLED=false` and AI metering OFF remain as
they were; billing/auth/metering are still dormant. No production
credentials used or stored; the disposable clusters used trust auth on
loopback only, with no credentials written to the repo or this report.
