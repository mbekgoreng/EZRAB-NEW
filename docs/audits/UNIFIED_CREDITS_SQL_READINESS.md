# EZRAB Unified AI Credits — SQL Static Readiness Review

- **Subject file:** `supabase/migrations/20261110_unified_credits_foundation.sql`
- **File identity:** 827 lines; MD5 `62d9e8608431d2f7aaf7d6da281ebd79` (byte-identical to the Phase 1 snapshot copy — the file has not changed since Phase 1 wrote it).
- **Date of review:** 2026-11-10 (Asia/Jakarta)
- **Repository:** `~/workspace/ezrab-unified`, branch `integrasi/unified-ui-engine`, HEAD `99de8927d3bdb0bc6e2befbcb22e290f64971896`.
- **Review type:** **STATIC ONLY** — source reading and cross-referencing against the other migration files in `supabase/migrations/`. No database was connected to, created, or modified. No SQL was executed.

> ## ⚠ RUNTIME VERIFICATION STATUS: **NOT RUNTIME VERIFIED**
>
> Local PostgreSQL is **not installed** on this machine. Verification performed once for this review: `which psql pg_ctl postgres` returned **no paths (exit 1)** — all three binaries are absent. PostgreSQL was not installed, Docker was not used, and nothing was pointed at any Supabase environment (local, staging, or production), per the governing fence.
>
> Every statement in this document about how the SQL *behaves* is therefore a static inference from the source text and from documented PostgreSQL semantics — it is **NOT RUNTIME VERIFIED**. Syntax acceptance by a real parser, PL/pgSQL runtime behaviour, lock behaviour under real concurrency, and Supabase-specific privilege/RLS behaviour all remain unverified until an owner-approved verification pass runs the file against a disposable database copy. Wherever a verdict depends on runtime behaviour, it is labelled **NOT RUNTIME VERIFIED**.

> ## ⚠ EXECUTION PROHIBITION
>
> **The migration must NOT be applied anywhere** — not to production, not to staging, not to any shared environment — on the basis of this review. This document is a readiness assessment for a future, separately granted execution decision. The file's own header (L4–L10) states the same prohibition and additionally requires verification of prerequisite migration state in the target database before any execution is considered. Prerequisite state in the live database is **UNKNOWN** (see §3).

---

## 1. Scope and method

The review covered, statically:

1. SQL syntax plausibility (statement by statement, against PostgreSQL grammar as documented).
2. Table/column references, cross-checked against the prerequisite migrations in the same folder: `20261008_phase3_canonical_schema_rls.sql`, `20261018_ai_credits_ledger.sql`, `20261102_billing_batch_ledger.sql`, `20261102_phase53_workspace_billing.sql`, `20261109_billing_orders_subscriptions.sql`.
3. Foreign-key consistency, unique constraints, and index coverage for the access patterns the functions use.
4. Transaction boundaries and re-runnability.
5. `SECURITY DEFINER` safety, `search_path` restriction, RLS assumptions, and the `service_role`-only execution model.
6. Argument/return types of the five RPCs.
7. Idempotency, locking behaviour, and concurrency safety.
8. Batch invariant enforcement (`granted = remaining + reserved + consumed + expired`).
9. Allocation ordering vs the canonical JS policy (`api/_lib/creditAllocation.js`, Phase 5.1).
10. Review-queue transitions, expiration behaviour, and rollback safety.
11. A per-RPC abuse-case audit (§7) against seven specified abuse cases, with exact SQL evidence quoted by line reference.

Line references (`L…`) are to the subject file unless another file is named.

## 2. What the file contains

| Section | Lines | Content |
|---|---|---|
| Header | L1–50 | DRAFT status, prerequisite order, additive-only claim, rollback pointer |
| §1 Policy table | L54–92 | `CREATE TABLE IF NOT EXISTS public.credit_pricing_policy_versions` (L54), RLS enable (L65), one SELECT policy (L67–69), seed `INSERT … ON CONFLICT (version) DO NOTHING` with two rows: `v1.1-token-metering` = `LOCKED`, `margin-formula-proposal` = `PENDING` with all commercial parameters JSON `null` (L71–92) |
| §2 Reconciliation view | L101–147 | `CREATE OR REPLACE VIEW public.credit_batch_reconciliation` — per-batch column vs ledger-aggregate comparison, `invariant_ok` and `is_consistent` flags |
| §3a RPC | L169–250 | `issue_batch(...)` → `uuid` |
| §3b RPC | L261–348 | `reserve_credits(uuid, text)` → `text` |
| §3c RPC | L359–505 | `settle_reservation(uuid, bigint, jsonb, text, text)` → `text` |
| §3d RPC | L520–738 | `resolve_review(uuid, text, text, uuid, text, text)` → `text` |
| §3e RPC | L747–810 | `apply_expirations(uuid, timestamptz)` → `bigint` |
| Rollback | L812–827 | Comment-only rollback script (DROP statements in reverse order) |

Each RPC is followed immediately by `REVOKE ALL ON FUNCTION … FROM PUBLIC` and `GRANT EXECUTE ON FUNCTION … TO service_role` with the full argument signature (L249–250, L347–348, L504–505, L737–738, L809–810). The signatures in the REVOKE/GRANT statements match the function definitions — verified one by one.

## 3. Cross-reference validation vs prerequisite migrations

### 3.1 Tables and columns

Every table and column the draft references was located in the prerequisite DDL:

| Referenced object | Defined at | Draft's usage consistent? |
|---|---|---|
| `credit_batches` (`id, account_id, owner_user_id, workspace_id, type, wallet, granted_amount, remaining_amount, reserved_amount, consumed_amount, expired_amount, granted_at, expires_at, period_start, period_end, source_ref, status, updated_at`) | `20261102_billing_batch_ledger.sql:38-64`; `workspace_id` added by `20261102_phase53…` §3 | **Yes.** `issue_batch`'s INSERT column list (L226–235) names only existing columns; its `wallet` derivation (`SUBSCRIPTION → SUBSCRIPTION_CREDITS`, else `TOPUP_CREDITS`, L224) matches the JS domain's `WALLET_BY_TYPE` (`api/_lib/creditLedger.js:86-94`) exactly, including grouping BONUS/FREE_ONCE under `TOPUP_CREDITS` as a display wallet. |
| `credit_batch_ledger` (`account_id, owner_user_id, workspace_id, batch_id, operation_id, kind, amount, idempotency_key, actor, reason`) | `20261102…:73-88`; `workspace_id` added by Phase 5.3 | **Yes.** All INSERT column lists in all five RPCs name only existing columns. Ledger kinds used (`GRANT, RESERVE, RESERVE_RELEASE, CONSUME, EXPIRATION, REVIEW_DECISION`) are all within the kind CHECK as widened by Phase 5.3 §3 (`REVIEW_DECISION` added there). |
| `credit_usage_operations` (`id, account_id, owner_user_id, workspace_id, actor_user_id, feature, status, estimated_credits, reserved_credits, actual_credits, settled_credits, released_credits, overage_credits, tariff_version, usage_evidence, updated_at`) | `20261102…:101-128`; `workspace_id` added by Phase 5.3 | **Yes.** Status values written (`RESERVED`, `SETTLED`, `RELEASED`, `REQUIRES_REVIEW`) are all in the status CHECK. Note: the draft contains **no function that creates** an operation row — `reserve_credits` expects a pre-existing `CREATED` operation. Creation remains the JS domain's / a future caller's responsibility (see §8). |
| `credit_reservation_allocations` (`operation_id, batch_id, account_id, amount, created_at`) | `20261102…:131-141` | **Yes.** `UNIQUE(operation_id, batch_id)` in the DDL matches the one-allocation-per-batch-per-operation writes in `reserve_credits` (L327–328). |
| `provider_tariff_versions` (`version`) | `20261102…:150-168` | **Yes.** Existence checks in `settle_reservation` (L398–400) and `resolve_review` (L574–577) test `t.version = p_tariff_version`; `version` is not globally unique in the DDL (`UNIQUE(provider_id, model_id, version)`), so an existence test is the correct strength — but see §6.4: existence is all that is tested. |
| `credit_settlement_reviews` (`workspace_id, account_id, operation_id, status, feature, reserved_credits, actual_credits, overage_credits, tariff_version, usage_evidence, requested_by, idempotency_key, reviewer_user_id, reviewer_role, resolution_reason, resolved_at`) | `20261102_phase53…` §4 (`CREATE TABLE` with `operation_id UNIQUE`, `UNIQUE(account_id, idempotency_key)`) | **Yes.** The INSERT in `settle_reservation` (L417–429) and the CAS UPDATE in `resolve_review` (L710–716) name only existing columns. `requested_by` is written as `v_op.actor_user_id::text` (L428) — type-consistent with the column's `text` type. |
| `billing_accounts` (FK target for `account_id`) | `20261102_phase53…:59` + FK constraints added in its §3 | **Indirectly relied upon.** The draft never selects from `billing_accounts`; account validity is enforced only by the FKs Phase 5.3 adds (`credit_batches_account_fk` etc.). If Phase 5.3 has not actually been applied in a target database, `issue_batch` would insert batches with no account-existence enforcement at all. This is one reason prerequisite verification (§3 of the header, L24–25: status UNKNOWN) is a hard precondition. **NOT RUNTIME VERIFIED.** |
| `workspace_members` (`workspace_id, user_id, role, status, billing_admin`) | Foundation migrations (`20260913…` / `20261008…`); `status` and `billing_admin` added by Phase 5.3 §1 | **Yes, conditional on Phase 5.3.** `resolve_review`'s authorization re-check (L560–567) reads `m.role, m.billing_admin … WHERE m.workspace_id = … AND m.user_id = … AND m.status = 'ACTIVE'` — both columns exist only after Phase 5.3. Without it, the function would fail at runtime with an undefined-column error. **NOT RUNTIME VERIFIED.** |
| `credit_tariffs` (pattern reference only) | `20261018_ai_credits_ledger.sql:19` | The §1 policy table's RLS shape deliberately mirrors it (SELECT for `authenticated`). Consistent. |

### 3.2 Foreign keys

- The draft creates **no** foreign keys of its own except the implicit ones on its new table (none — `credit_pricing_policy_versions` is standalone reference data; appropriate).
- Its writes rely on prerequisite FKs: `credit_batches.account_id → billing_accounts.id`, `credit_batches.workspace_id → workspaces.id`, `credit_batch_ledger.batch_id → credit_batches.id`, `credit_reservation_allocations.{operation_id, batch_id}` FKs, `credit_settlement_reviews.{workspace_id, account_id, operation_id}` FKs. Under those FKs, writes with nonexistent accounts/workspaces/batches fail with FK violations and roll back — fail-closed behaviour, *if* the prerequisites are applied. **NOT RUNTIME VERIFIED.**

### 3.3 Unique constraints relied upon

| Constraint | Source | Relied on by |
|---|---|---|
| `credit_batch_ledger` `UNIQUE(account_id, idempotency_key)` | `20261102…` (`credit_batch_ledger_idem`) | All five RPCs (every ledger INSERT carries a derived key — §6.3) |
| `credit_batches` partial UNIQUE index, one `FREE_ONCE` per account | Phase 5.3 §3 | `issue_batch` FREE_ONCE guarantee under concurrency (§7) |
| `credit_reservation_allocations` `UNIQUE(operation_id, batch_id)` | `20261102…` | `reserve_credits` |
| `credit_settlement_reviews` `UNIQUE(operation_id)` and `UNIQUE(account_id, idempotency_key)` | Phase 5.3 §4 | `settle_reservation` (one review per operation), `resolve_review` |
| `credit_usage_operations` `UNIQUE(account_id, idempotency_key)` | `20261102…` | Operation creation (outside this file — §3.1 note) |
| `credit_pricing_policy_versions.version` PRIMARY KEY | Draft L55 | Seed `ON CONFLICT (version) DO NOTHING` (L92) — conflict target matches the PK. Correct. |

### 3.4 Index coverage for the functions' access patterns

- `reserve_credits` / `resolve_review` batch scans (`account_id + status + remaining + expires_at`): served by `idx_credit_batches_account_wallet_expiry (account_id, wallet, expires_at)` and `idx_credit_batches_account_type_expiry (account_id, type, expires_at)` (`20261102…`). The `account_id` prefix is usable; the `ORDER BY` (type group, expiry, `granted_at`) will still sort in memory — acceptable at expected scale, and correctness does not depend on it.
- Ledger idempotency lookups (`account_id, idempotency_key`): exactly the UNIQUE constraint's column order — index-supported.
- Allocations by `operation_id` (`settle_reservation`, `resolve_review`): the `UNIQUE(operation_id, batch_id)` constraint provides a usable `operation_id` prefix index.
- Reviews by `operation_id`: the `UNIQUE(operation_id)` constraint provides the index.
- `workspace_members` lookup by `(workspace_id, user_id)`: the foundation index is `workspace_members_user_idx (user_id, workspace_id)` — reversed relative to the query, still usable by the planner for equality on both columns.
- `apply_expirations` scan (`account_id, expires_at <= p_now, remaining > 0`): `account_id`-prefixed indexes above apply.

No missing index blocks correctness. No index is created by the draft itself; that is acceptable given the prerequisite indexes, but it means the draft is *not* self-sufficient if prerequisites were applied in a trimmed form. **NOT RUNTIME VERIFIED** (no `EXPLAIN` was or could be run).

## 4. Structural validation

### 4.1 Syntax plausibility

Read statement-by-statement, the file is plausible PostgreSQL / PL/pgSQL: dollar-quoted function bodies with matching `$$` delimiters; `DECLARE` blocks use `%ROWTYPE` and scalar types consistent with the DDL (`uuid`, `bigint`, `text`, `timestamptz`, `jsonb`); `FILTER (WHERE …)` aggregates in the view (L128–145) are valid PostgreSQL syntax; `IS DISTINCT FROM` (L136) is valid; `GET DIAGNOSTICS v_rows = ROW_COUNT` (L717) is valid PL/pgSQL; `LEAST`, `COALESCE`, interval arithmetic (`p_period_end + interval '30 days'`, L218) are all standard. No statement uses a construct unknown to PostgreSQL 14+ / Supabase.

This is a plausibility judgement only. A real parser has never seen this file: **NOT RUNTIME VERIFIED.** PL/pgSQL in particular defers some errors (e.g. ambiguous column references inside SQL statements in function bodies, `%ROWTYPE` field mismatches) to first execution, so even a successful future `CREATE FUNCTION` would not by itself prove the bodies run.

### 4.2 Transaction boundaries

- The file contains **no explicit `BEGIN` / `COMMIT`**. Each RPC is a single function call and therefore a single transaction when invoked normally — the correct atomicity unit: any `RAISE EXCEPTION` (or constraint violation) inside a function rolls back *all* of that call's writes. The header comment in `reserve_credits` relies on exactly this (L255–258).
- At the *file* level, atomicity depends on the migration runner: Supabase's migration tooling wraps each migration file in a transaction, but that behaviour is a property of the runner, not of this file. If the file were ever pasted into a SQL editor and run statement-by-statement without a wrapping transaction, a mid-file failure could leave §1/§2 objects applied without the RPCs (or vice versa). The file neither protects against nor worsens that scenario; the execution grant (whenever considered) should specify a transactional runner. **NOT RUNTIME VERIFIED.**

### 4.3 Re-runnability — one concrete defect

The file is *almost* idempotent to re-run (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE VIEW`, `CREATE OR REPLACE FUNCTION`, seed `ON CONFLICT DO NOTHING`), with one exception:

- **L67–69: `CREATE POLICY credit_pricing_policy_versions_select_ref …` has no existence guard.** PostgreSQL has no `CREATE POLICY IF NOT EXISTS`. Re-running the file (or running it against a database where a previous partial attempt created the policy) fails at L67 with "policy already exists", aborting the remainder of the file if run transactionally. Prerequisite migrations in this repo guard comparable constructs with `DO $$ … IF NOT EXISTS` blocks (e.g. Phase 5.3 §1, §3); the draft does not. **Finding F-1 (minor, execution-procedure):** before any execution is considered, the policy creation should be guarded (drop-if-exists or a `DO` block), or the execution procedure must treat the file as strictly run-once and verify a clean starting state.

### 4.4 Rollback safety

The rollback block (L812–827) is comment-only — it cannot execute accidentally as part of the migration. Its drops are in reverse dependency order (functions → view → policy table) and, as the file itself notes (L824–827), touch none of the money tables: rollback removes only objects this file creates. Two honest caveats: (a) rolling back after the RPCs have been *used* would strand whatever calling code depends on them (an operational, not schema, concern); (b) `DROP TABLE credit_pricing_policy_versions` discards the seeded policy rows — acceptable, as they are reference data reproducible from this file and from `api/_lib/pricingPolicy.js`. Rollback design: **sound**.

---

## 5. Security model validation

### 5.1 SECURITY DEFINER safety

All five functions are declared `SECURITY DEFINER` with `SET search_path = public` (issue: L183–184; reserve: L269–270; settle: L373–374; resolve: L534–535; apply_expirations: L754–755). Assessment:

- **Fixed, minimal `search_path`:** every function pins `search_path = public`. No caller-supplied schema can enter the path, and every object reference in the bodies is additionally schema-qualified (`public.credit_batches`, etc.) throughout — belt and braces. This is the correct pattern for `SECURITY DEFINER` in this codebase's shape.
- **Residual `pg_temp` note (minor):** in PostgreSQL, if `pg_temp` is not explicitly listed in `search_path` it is still searched *first* for relations. Mitigating factors: all references are schema-qualified, and the only role that can execute these functions is `service_role`, whose sessions are server-controlled (a temp-object shadowing attack would require the attacker to already control the service-role session). Risk: negligible in the intended deployment shape; recorded for completeness. **NOT RUNTIME VERIFIED.**
- **Definer identity:** the functions will run with the privileges of their owner (in Supabase migrations, typically `postgres`). That is what lets them bypass the SELECT-only RLS for `authenticated` (§5.2) — and it is also why the `service_role`-only EXECUTE grant (§5.3) is the *entire* perimeter for four of the five functions (§7).

### 5.2 RLS assumptions

- The draft's only RLS act is enabling RLS on its own new table and adding a single SELECT policy for `authenticated` (`USING (true)` — reference data, mirroring `credit_tariffs`) (L65–69). No write policy is created for any role; writes to the policy table are possible only for the table owner / `service_role` (which bypasses RLS). Consistent with the repo's fail-closed financial pattern.
- The RPCs assume the prerequisite tables' RLS remains as designed (SELECT-only for `authenticated`, no write policies). Because the functions are `SECURITY DEFINER` and execute as owner, their internal reads/writes are not RLS-constrained — correct for a trusted server-side ledger, and it means table-level RLS is *not* a defence against a caller who can execute these functions.
- **The reconciliation view deserves a flag (Finding F-2, minor):** `credit_batch_reconciliation` (L101) is a plain view. Pre-PostgreSQL-15 semantics — and Supabase projects not using `security_invoker` views — evaluate a view with the *view owner's* privileges and the owner's RLS context. The draft issues no `GRANT` on the view, so by default only the owner can select from it; but if SELECT on this view is ever granted broadly (e.g. to `authenticated` for a dashboard), it would expose *all accounts'* batch aggregates, bypassing the owner-only RLS on `credit_batches`. The draft neither grants nor warns about this. Recommendation for the execution phase: either recreate the view `WITH (security_invoker = true)` where the platform supports it, or document a never-grant note beside it. **NOT RUNTIME VERIFIED** (actual default privileges in the target Supabase project, including any default-privilege grants to `anon`/`authenticated`, cannot be inspected from here).

### 5.3 Service-role-only RPC access

Each function ends with `REVOKE ALL ON FUNCTION <full signature> FROM PUBLIC; GRANT EXECUTE ON FUNCTION <full signature> TO service_role;` (L249–250, L347–348, L504–505, L737–738, L809–810). Signatures were checked against the definitions argument-by-argument (types and order): all five match exactly, including `settle_reservation(uuid, bigint, jsonb, text, text)` and `resolve_review(uuid, text, text, uuid, text, text)`. Revoking from `PUBLIC` also removes the default execute privilege PostgreSQL grants on new functions. `anon` and `authenticated` receive no grant. This is correctly constructed.

The consequence must be stated plainly, because the whole abuse analysis (§7) turns on it: **the security model is "whoever holds `service_role` is fully trusted; the functions authenticate nothing themselves"** — with one deliberate exception (`resolve_review`, which re-checks reviewer authorization internally, §7.4). That matches the domain design (the JS service authorizes the workspace *before* calling the ledger), and it matches the file's own comment (L154–158). It is a sound model *if and only if* `service_role` credentials remain server-only and every future caller performs the `billingAuthorization.js` checks before invoking. The draft enforces neither condition itself; it documents the first and assumes the second.

### 5.4 Argument and return types

- All credit amounts are `bigint` parameters/locals (`p_amount`, `p_actual_credits`, return of `apply_expirations`), matching the `BIGINT` columns and the integer-only arithmetic rule of the domain. No floating point appears anywhere in the file.
- IDs are `uuid`, matching the DDL primary keys (the 20261102 tables use unqualified `UUID` in the same `public` schema — consistent).
- Status-style returns are `text` codes (`'reserved'`, `'insufficient_balance'`, `'settled'`, `'duplicate'`, `'requires_review'`, `'approved'`/`'rejected'` via `lower(p_decision)`, `'forbidden_review'`, …) rather than raised exceptions for expected business outcomes; exceptions are reserved for programmer errors in `issue_batch` (which `RAISE`s on invalid type/amount/missing key, L192–221) and for the lost-CAS race in `resolve_review` (raise at L718–720). The mixture is defensible (issue is a trusted administrative act; the others are state machines), but callers must handle both channels — a integration note, not a defect.
- One type-level asymmetry: `reserve_credits` and `settle_reservation` accept a caller `p_idempotency_key` but never *store* it on the operation (operation idempotency remains the creator's concern, §3.1); the key lives only inside derived ledger keys (§6.3).

## 6. Behavioural validation

### 6.1 Batch invariant enforcement

The invariant `granted = remaining + reserved + consumed + expired` is enforced at three independent levels:

1. **Table CHECK** (`credit_batches_balance_identity`, `20261102…:63-64`) — every UPDATE written by every RPC must leave the identity true or the transaction aborts. Each mutation site was checked arithmetically:
   - `reserve_credits` (L319–323): `remaining −take`, `reserved +take` — identity preserved.
   - `settle_reservation` (L448–455): `reserved −alloc`, `consumed +consume`, `remaining +remainder` *or* `expired +remainder` — consumed+returned+expired increments sum to exactly `alloc`, offsetting the reserved decrement. Preserved in both the expired and non-expired branches.
   - `resolve_review` APPROVED (L610–615, L647–651): allocation consumption (`reserved −alloc`, `consumed +alloc`) and overage debit (`remaining −take`, `consumed +take`) both preserve it.
   - `resolve_review` REJECTED (L685–690): `reserved −alloc`, `remaining +alloc` or `expired +alloc`. Preserved.
   - `apply_expirations` (L788–793): `expired +remaining`, `remaining = 0`. Preserved.
2. **Non-negativity CHECKs** on all four amount columns (`20261102…:47-50`) — no RPC path can drive a column negative without aborting; `LEAST(...)` clamps every take to the available column value at each site.
3. **The reconciliation view** (L118–126) recomputes the identity per batch from both columns and ledger aggregates, providing the detection layer if levels 1–2 were ever bypassed by a future writer.

Invariant enforcement: **strong** (static assessment; **NOT RUNTIME VERIFIED**).

### 6.2 Allocation ordering vs the canonical Phase 5.1 policy

Canonical JS (`api/_lib/creditAllocation.js:94`, `resolveAllocationOrder`): group order SUBSCRIPTION (0) → BONUS/FREE_ONCE (1) → TOP_UP (2); within groups 0–1, `expires_at` ascending with NULL (never expires) last; within TOP_UP, pure FIFO by `granted_at`; universal tie-break `granted_at` ascending, then `id`. Eligibility: `remaining > 0`, not expired, not FROZEN/EXPIRED (JS also admits status `EXHAUSTED` batches — see below).

SQL (`reserve_credits` L302–311; identical expression in `resolve_review` L630–637):

```sql
ORDER BY
  CASE b.type WHEN 'SUBSCRIPTION' THEN 0 WHEN 'BONUS' THEN 1
              WHEN 'FREE_ONCE' THEN 1 WHEN 'TOP_UP' THEN 2 ELSE 3 END,
  CASE WHEN b.type = 'TOP_UP' THEN NULL ELSE b.expires_at END ASC NULLS LAST,
  b.granted_at ASC,
  b.id ASC
FOR UPDATE
```

Term-by-term comparison:

- Group order: **identical**, including BONUS and FREE_ONCE sharing group 1 and an `ELSE 3` fail-closed bucket for unknown types.
- Within SUBSCRIPTION and BONUS/FREE_ONCE: expiry ascending, NULLS LAST — **identical** to the JS `expiryKey` (NULL → +∞).
- Within TOP_UP: the second key is the constant NULL, so ordering falls through to `granted_at ASC, id ASC` — pure FIFO, **identical** to the JS special case.
- Tie-breaks: `granted_at`, then `id` — **identical**.
- Eligibility: SQL requires `status = 'ACTIVE' AND remaining_amount > 0 AND (expires_at IS NULL OR expires_at > now())` (L303–306). JS admits `ACTIVE` *and* `EXHAUSTED` and rejects `FROZEN`/`EXPIRED`/unknown statuses. The only divergence is `EXHAUSTED`: by the domain's own status semantics a batch becomes EXHAUSTED only when `remaining = 0 AND reserved = 0` (the transition is written that way in `settle_reservation` L481–487 itself), in which case `remaining > 0` already excludes it from both implementations. The divergence is therefore unreachable under the invariant the code maintains — recorded as **Finding F-3 (informational)**: SQL and JS eligibility differ on paper for EXHAUSTED-with-remaining batches, a state neither implementation can produce.
- One real behavioural nuance: SQL evaluates `now()` repeatedly (eligibility SUM at L288–294, cursor filter, per-batch expiry tests in settle). Within one transaction `now()` is constant (transaction timestamp), so the function is internally consistent — this is correct PostgreSQL semantics and matches the single-`now` snapshot the JS domain takes per call. No divergence.

Allocation ordering: **faithful to Phase 5.1** (static assessment; **NOT RUNTIME VERIFIED**).

### 6.3 Idempotency design

- **Ledger keys:** every ledger INSERT derives its key from the caller's key plus a per-batch suffix — reserve: `p_idempotency_key || '#' || batch_id` (L333); settle: `… || '#consume#' || batch_id` / `… || '#release#' || batch_id` (L465, L487), with a deterministic fallback `settle:<op_id>` when the caller passes NULL (L464, L486); review paths: `#consume#`, `#overage#`, `#rel#`/`#exp#`, `#decision` suffixes (L618, L660, L702–703, L733); expirations: the fixed per-batch key `expire:<batch_id>` (L781, L785). Combined with `UNIQUE(account_id, idempotency_key)`, a duplicated insert raises a unique violation and rolls the whole call back rather than double-posting — fail-closed.
- **Operation-level guards:** `reserve_credits` replays safely because a second call finds `status <> 'CREATED'` and returns `'invalid_state'` before writing (L283–286). `settle_reservation` returns `'duplicate'` for an already-`SETTLED` operation before validating or writing anything (L388–390). `resolve_review` returns `'already_resolved'` for a non-PENDING review (L556–558) *and* re-checks with a CAS UPDATE + `ROW_COUNT` verification that raises on a lost race (L710–720).
- **`issue_batch` replay:** an existence probe on `(account_id, idempotency_key, kind='GRANT')` returns the original batch id (L201–207) — a true replay, not an error. Its concurrency weakness is analysed in §7.2.
- **`apply_expirations` replay:** the sweep is naturally idempotent (after a sweep, `remaining_amount = 0` rows no longer match the `remaining > 0` filter), and the ledger insert is additionally guarded by an existence probe on the `expire:<batch_id>` key (L776–787).
- **Weakness (cross-reference §7.5):** none of the functions *compares* a replayed request against the original request's financial parameters. Replays are rendered harmless by early return / status guards (the original effect stands, the new parameters are ignored), but a caller bug that reuses a key with different data is silently masked rather than reported. This matches the JS domain's behaviour and is the industry-normal trade-off; it is documented here because the audit brief asks for it explicitly.

### 6.4 Settlement evidence and tariff checks

`settle_reservation` refuses to settle without evidence and without a known tariff: `p_actual_credits IS NULL OR < 0` → `'invalid_usage'` (L394–396); `p_usage_evidence IS NULL` → `'usage_missing'` (L397–399); tariff version not present in `provider_tariff_versions` → `'unknown_tariff'` (L400–404). `resolve_review` APPROVED re-validates both against the *stored* operation (L570–578). These checks mirror the JS domain exactly, including their limit, already recorded in Phase 1 §2.7: **tariff validation is formal, not substantive** — a version row whose prices are `NULL`/`UNKNOWN` (which is every seeded row today) passes the existence test. The SQL does not invent or verify any price; no tariff value is fabricated anywhere in the file. Consistent with the no-invention fence — and a reason settlement *amounts* still depend on caller honesty about `p_actual_credits` (see §7.6).

### 6.5 Review-queue transitions

The queue's state machine, as implemented across two functions:

- **Creation:** only `settle_reservation`, only on the overage branch (`actual > reserved`), creating exactly one `PENDING` row whose amounts are copied from the operation (`reserved`, `actual`, `overage = actual − reserved`) (L406–430). `UNIQUE(operation_id)` makes a second row for the same operation impossible.
- **Resolution:** only `resolve_review`, only from `PENDING`, only into `APPROVED` or `REJECTED` (any other decision string → `'invalid_decision'`, L546–548), with a mandatory non-blank reason (L549–551). The transition writes reviewer id, the *stored* member role (not the caller's claim — L716 writes `v_member_role`), the reason, and `resolved_at`, and appends a zero-amount `REVIEW_DECISION` ledger entry (L727–736) so the decision itself is part of the journal.
- **Terminality:** there is no path back from APPROVED/REJECTED to PENDING, no reopen, and no second resolution (status guard + CAS). The operation's own status moves in lockstep (`SETTLED` on approve at L664, `RELEASED` on reject at L703).
- **Insufficient funds on approve:** returns `'insufficient_balance'` with the review left `PENDING` and zero mutations (L591–599, check before any write in the APPROVED branch) — the review is parked, not forced. Correct manual-review semantics.

One gap (Finding F-4, minor): `resolve_review` never checks that the review row it loaded belongs to the *same account* as the operation row — it joins only on `operation_id` (L553–555). In practice the review row is created by `settle_reservation` from the operation's own fields, and `UNIQUE(operation_id)` + FKs keep the pairing coherent; a mismatched row could only exist through direct table writes by a privileged role. Recorded for completeness; no change recommended beyond noting it.

### 6.6 Expiration behaviour

`apply_expirations(p_account_id, p_now)` (L747–810):

- Selects the account's batches with `type <> 'FREE_ONCE'`, `status <> 'FROZEN'`, `expires_at IS NOT NULL AND expires_at <= p_now`, `remaining_amount > 0`, locking `FOR UPDATE` (L762–772). FREE_ONCE is therefore un-expirable through this function even if a legacy batch row carried an `expires_at` — matching the locked policy (FREE_ONCE never expires) and the Phase 5.3 §5 specification.
- Only `remaining_amount` is swept into `expired_amount`; **`reserved_amount` is never touched** (L788–793) — a live reservation survives its batch's expiry sweep and is resolved by that operation's own settle/release, whose expired-batch branches (write-off via `EXPIRATION` entries with reasons `settle_remainder_after_batch_expiry` / `release_after_batch_expiry`) exist precisely for this. The design is coherent across the three functions.
- A second UPDATE (L797–806) also marks `remaining = 0` batches EXPIRED (including batches whose reserved portion is still outstanding — their status becomes EXPIRED while `reserved_amount > 0`; `settle_reservation`'s per-batch status recompute (L481–487) handles already-expired batches explicitly, so the lifecycle still closes correctly).
- Return value: total credits expired by this call (L757, L788).
- Caller-controlled clock: `p_now` is a parameter, not `now()`. A caller may pass a future timestamp and force-expire every expirable batch of the account early (see §7.5, abuse case 4). Within the trusted-caller model this is a deliberate design (backfill/replay sweeps need it — the JS equivalent takes `now` as an argument too), but it makes the *caller's* clock discipline part of the security posture.

### 6.7 View correctness (`credit_batch_reconciliation`, L101–147)

- Column aggregates: `ledger_grant = Σ amount (GRANT)`; `ledger_consumed = −Σ (CONSUME)`; `ledger_expired = −Σ (EXPIRATION)` (L128–130) — sign conventions match `creditLedger.js`'s header (GRANT +n, CONSUME −n, EXPIRATION −n as changes to *remaining*).
- Reserved derivation (L131–145): `−Σ(RESERVE) − Σ(RESERVE_RELEASE) + Σ(CONSUME where reason IS DISTINCT FROM 'review_approved_overage') + Σ(EXPIRATION where reason ∈ reserved-reasons)`. This was compared term-by-term with the JS implementation (`api/_lib/creditReconciliation.js`, aggregation in `reconcileAccountData`): the JS counts a CONSUME entry into `consumeFromReservation` iff `entry.reason !== 'review_approved_overage'` — for a NULL reason, JS `null !== '…'` is true (counts it) and SQL `NULL IS DISTINCT FROM '…'` is also true (counts it). The EXPIRATION reserved-reasons set is identical (`release_after_batch_expiry`, `settle_remainder_after_batch_expiry`). **The view and the JS module derive reserved identically**, including the NULL-reason edge. (The Phase 1 report's claim of an identical formula is confirmed.)
- `invariant_ok` tests the column identity alone; `is_consistent` additionally requires all four ledger aggregates to equal the columns (L118–126). Batches with no ledger rows are handled via the LEFT JOIN + `COALESCE(...,0)` — a batch with `granted > 0` and no GRANT entry correctly reports inconsistent.

---

## 7. Abuse-case audit, per RPC

Method: for each of the seven specified abuse cases, the relevant function bodies were read for an explicit prevention, a structural prevention (constraint / state guard / lock), or the absence of both. "Prevented" below always carries its precondition — in this design the master precondition is the `service_role`-only EXECUTE perimeter (§5.3): four of the five functions contain **no** caller authorization logic of their own, by design. Each verdict therefore states both layers: what stops an *unprivileged* attacker (the perimeter — complete), and what stops a *privileged-but-wrong* caller (often nothing in-function — the trusted-caller assumption).

### 7.1 `issue_batch` (L169–250) — grant path

| Abuse case | Prevented? | Evidence |
|---|---|---|
| **Grant to an arbitrary account** | **Not prevented in-function; prevented only by the perimeter.** | The function takes `p_account_id`, `p_owner_user_id`, `p_workspace_id`, `p_amount`, `p_actor` as free parameters (L169–181) and performs **no** authorization, membership, or caller-identity check anywhere in L186–247. Any principal able to execute it can mint any positive amount of SUBSCRIPTION/TOP_UP/BONUS credit into any account that satisfies the FKs. The header comment states the assumption explicitly (L156–158: caller is the trusted backend *after* workspace authorization has passed; owner/workspace ids come "from a verified server context, not from free client input"). The mitigations that do exist in-function are scope limiters, not authorization: type whitelist (L195–197), positive-amount requirement (L220–222), and the FREE_ONCE forcing below. |
| **Manipulate expiry dates** | **Partially prevented.** | FREE_ONCE: `v_amount := 100; v_expires_at := NULL;` unconditionally (L212–214) — a caller cannot give FREE_ONCE a different amount or any expiry. SUBSCRIPTION: only a *default* is supplied when the caller passes no expiry (`period_end + 30 days`, L215–217); an explicit `p_expires_at` from the caller is accepted as-is, in the past or the far future, with no sanity check (no comparison against `p_period_start`/`p_period_end`, which are also accepted unchecked — `period_end < period_start` passes). TOP_UP/BONUS: `p_expires_at` fully caller-controlled. Within the trusted-caller model this mirrors the JS domain (which also takes `expiresAt` as an argument), but the SQL adds no defence in depth. |
| **Reuse an idempotency key with different financial data** | **Effect prevented; discrepancy not detected.** | The replay probe (L201–207) matches on `(account_id, idempotency_key, kind='GRANT')` only and returns the original `batch_id` without comparing `p_type`, `p_amount`, or `p_expires_at` against the original grant. A second call with the same key but a different amount/type therefore grants nothing new — the safe financial outcome — but also raises no signal that the caller disagreed with itself. Verdict: safe, silent. |
| **Alter immutable ledger history** | **Not addressed by this function** (see §7.6). | The function only INSERTs (L226–247). |

**Concurrency note (Finding F-5, moderate):** the idempotency probe is a plain `SELECT` (L202–204) with no lock and no `INSERT … ON CONFLICT` handling. Two concurrent calls with the same `(account_id, idempotency_key)` can both pass the probe; both INSERT a batch; the second then violates `UNIQUE(account_id, idempotency_key)` on its ledger INSERT (L238–247) and its whole transaction — including its batch INSERT — rolls back. The financial outcome is correct (exactly one grant), but the losing caller receives a raw unique-violation exception instead of the original `batch_id`. A robust implementation would catch `unique_violation` and re-select. The FREE_ONCE partial UNIQUE index (Phase 5.3) provides the same fail-closed backstop for concurrent FREE_ONCE grants. **NOT RUNTIME VERIFIED** (concurrency behaviour inferred from documented READ COMMITTED semantics).

### 7.2 `reserve_credits` (L261–348) — reservation path

| Abuse case | Prevented? | Evidence |
|---|---|---|
| **Settle/reserve another account's reservation (cross-account)** | **Structurally prevented.** | The function accepts only `p_operation_id` + `p_idempotency_key` (L261–264) — there is **no account parameter to lie about**. The account is read from the locked operation row (`v_op.account_id`, L280) and every batch filter is `b.account_id = v_op.account_id` (L290, L303). A caller cannot steer a reservation onto another account's batches through this function's inputs. (A `service_role` caller can still reserve against *any* operation id it knows — the perimeter assumption of §5.3 — but it cannot cross-wire accounts.) This is strictly stronger than a design that takes a caller-supplied account id, and it matches the JS domain's FORBIDDEN tests in spirit. |
| **Reuse an idempotency key with different financial data** | **Effect prevented.** | Replay is blocked before any write by the state guard: a second call finds `status <> 'CREATED'` → `'invalid_state'` (L283–286). The reservation amount is not a caller parameter at all — it is `v_op.estimated_credits` from the operation row (L299) — so there is no financial parameter to vary. Even if the guard were bypassed, derived ledger keys (`key#batch_id`, L333) + the ledger UNIQUE and `UNIQUE(operation_id, batch_id)` on allocations would abort a double-post. |
| **Settle more than reserved** | N/A (this function only reserves). | All-or-nothing is enforced by the pre-check `v_total < estimated → 'insufficient_balance'` before any write (L288–297) — subject to Finding F-6 below. |

**Finding F-6 (significant — the review's most important technical finding): no post-loop assertion that the reservation was fully funded.** The availability pre-check (L288–294) is an **unlocked** aggregate `SELECT`. The allocation loop then locks batches `FOR UPDATE` in policy order (L302–311) and takes `LEAST(remaining, need)` per batch (L314). Under concurrency — two operations on the *same account* reserving at once — both can pass the pre-check against the same balance; the second, after blocking on the row locks, re-reads reduced `remaining_amount` values (READ COMMITTED `SELECT … FOR UPDATE` semantics), allocates only what is left, and exits the loop with `v_need > 0`. The function then **unconditionally** executes `SET status='RESERVED', reserved_credits = estimated_credits` (L339–341) and returns `'reserved'` (L343) — recording a full reservation backed by a partial allocation. No line in L299–343 tests `v_need` after the loop. Consequences if it ever occurred: the batch invariant still holds (it is per-batch arithmetic), but the operation's `reserved_credits` would overstate its allocations, and a later settle would consume/release against allocations that sum to less than `reserved_credits`, silently stranding the difference. The JS domain does not have this hole (its store serializes per snapshot). **Required correction before execution is considered:** after the loop, `IF v_need > 0 THEN RAISE EXCEPTION 'insufficient_balance' …` (raising, not returning, so the partial allocation writes roll back). **NOT RUNTIME VERIFIED** — the race is a static inference from the code plus documented locking semantics; it has never been executed.

**Minor (F-7):** an operation with `estimated_credits = 0` reserves "successfully" with no allocations (loop exits immediately). The domain treats estimates as positive; a `estimated <= 0` guard would close the edge. Also note the function never verifies the operation's account actually exists in `billing_accounts` — again delegated to the prerequisite FKs (§3.2).

### 7.3 `settle_reservation` (L359–505) — settlement path

| Abuse case | Prevented? | Evidence |
|---|---|---|
| **Settle another account's reservation** | **Structurally prevented (cross-wiring); perimeter-governed (initiation).** | Like `reserve_credits`, there is no account parameter: all batch and ledger writes use `v_op.account_id / owner_user_id / workspace_id` taken from the operation row locked at L381. A settle cannot be redirected to consume a different account's batches. Any `service_role` caller that knows an operation UUID can initiate its settle — accepted trusted-caller design (§5.3). |
| **Settle more than reserved** | **Prevented — by design, via the review queue.** | The overage branch is taken whenever `p_actual_credits > v_op.reserved_credits` (L406): the operation moves to `REQUIRES_REVIEW` with `overage_credits` recorded, one PENDING review row is created (L417–429), and the function returns `'requires_review'` **without any partial debit and without touching any batch** (the branch contains no batch UPDATE). Within the funded branch, consumption per batch is clamped to that batch's allocation (`v_consume := LEAST(v_alloc.amount, v_to_consume)`, L441) and total consumption cannot exceed Σ allocations = `reserved_credits`. There is no code path that debits more than was reserved. |
| **Reuse an idempotency key with different financial data** | **Effect prevented; discrepancy not detected.** | An already-`SETTLED` operation returns `'duplicate'` at L388–390 — *before* `p_actual_credits`, evidence, or tariff are examined (those checks are L394–404). Replaying with a different actual amount or different evidence therefore changes nothing (safe), but is indistinguishable from an honest replay (silent). A replay with a *different key* on a settled operation is likewise just `'duplicate'`. Note the asymmetry with §7.1: harmless, but caller bugs are masked. |
| **Alter immutable ledger history** | **Not addressed by this function** (§7.6). | Only INSERTs into the ledger (L459–488). |

Additional checks verified: negative/NULL actual rejected (L394–396); missing evidence rejected (L397–399); unknown tariff rejected (L400–404); non-RESERVED states rejected (`'invalid_state'`, L391–393); the operation row is locked `FOR UPDATE` first (L381), serializing concurrent settles of the same operation (the loser sees `SETTLED` → `'duplicate'`). Expired-batch remainders are written off as `EXPIRATION` rather than returned to `remaining` (L448–455 plus the ledger branch at L467–478), preserving both the invariant and the rule that expired value never resurrects.

**Minor (F-8, accounting label):** `released_credits` on the operation counts only the non-expired remainder (`v_released` accumulates only in the non-expired branch, L483–488; the final UPDATE is L490–498). When part of the remainder is written off to `expired_amount`, the operation's `released_credits + settled_credits` will be less than `reserved_credits`, with the difference visible only in the batch's `expired_amount` and the `EXPIRATION` ledger entry. The batch invariant is unaffected; consumers of the operation row alone would under-account the release. The JS reconciliation module derives reserved from ledger *reasons* and so stays consistent; a future SQL consumer should do the same. Document, don't necessarily change.

**Minor (F-9):** the settle path for the expired-remainder ledger entry uses a *fixed* derived key (`'expire-settle:' || op || ':' || batch`, L474) that ignores `p_idempotency_key`, while the consume/release entries honour it. Inconsistent key derivation is harmless here (the state guard prevents re-entry), but it means the settle family's keys are not uniformly caller-scoped.

### 7.4 `resolve_review` (L520–738) — manual review resolution

This is the only function that performs its own authorization, and it is the strongest body in the file.

| Abuse case | Prevented? | Evidence |
|---|---|---|
| **Resolve a review without permission** | **Prevented in-function (defence in depth beyond the perimeter).** | After loading the locked operation and review rows (L553–558), the function re-derives the reviewer's authority from the authoritative table — `SELECT m.role, m.billing_admin FROM public.workspace_members m WHERE m.workspace_id = v_review.workspace_id AND m.user_id = p_reviewer_user_id AND m.status = 'ACTIVE'` (L561–565) — and returns `'forbidden_review'` when: no ACTIVE membership exists, the stored role is `CLIENT`, or the member is neither `SUPER_ADMIN` nor explicitly `billing_admin = true`, **or** the caller-supplied `p_reviewer_role` disagrees with the stored role (L566–570). A caller therefore cannot elevate itself by *claiming* a role; the claim is cross-checked against storage. This mirrors `billingAuthorization.js` (`billing:review:resolve` requires explicit `billing_admin`) and the Phase 5.3 specification. Residual trust: the caller must still supply the *true* `p_reviewer_user_id` — the function cannot verify that the human on whose behalf `service_role` calls is that user; session-to-user binding remains the calling service's duty, as in the JS design. |
| **Double / concurrent resolution** | **Prevented, twice.** | Status guards return `'already_resolved'` / `'invalid_state'` for non-PENDING reviews and non-REQUIRES_REVIEW operations (L556–561); both rows are locked `FOR UPDATE` at load (L553, L555); and the final transition is a compare-and-set `UPDATE … WHERE id = v_review.id AND status = 'PENDING'` whose `ROW_COUNT` is checked, raising `'already_resolved'` (→ full rollback of every batch write in the call) if the CAS is lost (L710–720). Exactly one resolution can commit. |
| **Settle more than reserved (via an APPROVED resolution)** | **Prevented from over-debiting; subject to Finding F-10.** | APPROVED first re-validates stored evidence and tariff (L570–578), then pre-checks that available balance covers the overage and returns `'insufficient_balance'` leaving the review PENDING and untouched if not (L591–599). Debits are clamped per batch by `LEAST` in both loops (allocation consumption L604–620; overage loop L640–667). No path debits beyond `actual_credits` in total intent — but see F-10. |
| **Reuse an idempotency key with different financial data** | **Effect prevented.** | A resolved review cannot be re-resolved (guards above), so a replayed key — or any second call — has no financial effect. Within a single call, all ledger keys derive from the one `p_idempotency_key` with per-batch suffixes (L618, L660, L702–703, L733), and the ledger UNIQUE constraint aborts any collision with an earlier, unrelated use of the same base key on the same account+batch-suffix — fail-closed, if ungraceful. |
| **Manipulate expiry dates** | N/A directly. | REJECTED resolutions route expired batches' allocations to `expired_amount` (write-off) instead of resurrecting them into `remaining` (L685–690, ledger branch L694–706) — expiry is respected, not negotiable, here. |

**Finding F-10 (significant, same class as F-6):** the APPROVED branch has the same unlocked-precheck pattern as `reserve_credits`: availability is summed unlocked (L591–597), the overage loop locks batches as it goes and clamps with `LEAST` (L640–652), but **no post-loop assertion checks `v_need`** before the operation is marked `SETTLED` with `settled_credits = actual_credits` (L663–667). Under a concurrent drain of the same account between pre-check and loop, the overage could be under-collected while the operation records a full settlement. The reserved portion is safe (allocations are fixed rows), so the exposure is limited to the overage amount. **Required correction (same shape as F-6):** assert `v_need = 0` after the overage loop, raising to roll back if not. **NOT RUNTIME VERIFIED.**

**Minor (F-11):** in the APPROVED allocation-consumption loop (L604–620), batch rows are updated without a preceding `SELECT … FOR UPDATE` (the UPDATE itself takes the row lock — safe) and without an expiry test: reserved amounts are consumed even if the batch has since expired. That is the *correct* financial outcome (the value was reserved before expiry and the usage is verified), and it matches the settle function's treatment of the reserved portion; recorded so the asymmetry with the REJECTED branch (which write-offs on expiry) is a conscious, documented choice rather than an oversight.

### 7.5 `apply_expirations` (L747–810) — expiration sweep

| Abuse case | Prevented? | Evidence |
|---|---|---|
| **Manipulate expiry dates / force early expiry** | **Not prevented in-function; perimeter-governed.** | The sweep time is a caller parameter `p_now` (L747–750) and selection is `expires_at <= p_now` (L767–768). A caller passing a far-future `p_now` expires every expirable batch of the account immediately. Nothing in L757–808 validates `p_now` against `now()`. This is a deliberate, domain-consistent design (the JS sweep also takes `now`), but it concentrates clock trust in the caller; the execution phase should ensure the only caller is a server-side scheduler passing real time. What the function *does* protect: FREE_ONCE is excluded by type regardless of dates (L765), FROZEN batches are excluded (L766), and the reserved portion of any batch is never swept (only `remaining_amount` moves, L788–793) — so even a malicious `p_now` cannot confiscate value that is actively reserved, and cannot touch FREE_ONCE at all. |
| **Grant / settle abuse** | N/A. | The function cannot create value (amounts only move `remaining → expired`) and cannot settle anything. |
| **Reuse / replay** | **Safe.** | Re-running with the same `p_now` matches no rows with `remaining > 0` (they were zeroed) and the per-batch ledger key `expire:<batch_id>` is existence-probed before insert (L776–787). One accounting nuance (**F-12, minor**): if the ledger entry already exists but the batch still holds `remaining > 0` (reachable only if some other writer used the same key — no function in this file does), the sweep still expires the batch and still counts the amount in the returned total (L788), so the return value can claim credit for an expiration whose journal entry pre-dates the call. Cosmetic; the batch transition itself is correct. |
| **Alter immutable ledger history** | **Not addressed by this function** (§7.6). | Only INSERTs (L779–786). |

Also verified: the second, status-only UPDATE (L797–806) repeats the FREE_ONCE and FROZEN exclusions and never touches amounts; it uses `p_now` (not `now()`) for `updated_at`, keeping the sweep internally consistent with its own clock parameter.

### 7.6 Cross-cutting abuse case: altering immutable ledger history

**No function in this file UPDATEs or DELETEs from `credit_batch_ledger`** — every function only INSERTs journal entries, and corrections in the wider design are compensating entries (`REVERSAL`). As far as the five RPCs go, history is append-only.

However, **append-only is a convention of the writers, not a property enforced by the database.** Nothing in this draft (or in the prerequisite migrations) prevents a privileged role from `UPDATE`/`DELETE` on `credit_batch_ledger`: there is no trigger, no rule, and no `REVOKE` of UPDATE/DELETE from the table owner / `postgres` role; RLS write-policy absence constrains `authenticated`, not the owner or `service_role` (which bypasses RLS). A compromised or misused `service_role` key could rewrite history without touching these functions at all — the reconciliation view (§6.7) would then *detect* column/journal divergence only if the columns were not rewritten consistently too. **Finding F-13 (informational, defence-in-depth):** if tamper-evidence is ever required, it needs a mechanism this draft does not attempt (e.g. a `BEFORE UPDATE/DELETE` trigger raising an exception on the ledger table, or hash-chaining). Recorded as an accepted-design observation, consistent with Phase 1's assessment — not a blocker for the draft's stated purpose, because the same is true of the entire existing schema family.

### 7.7 Abuse-case summary matrix

| Abuse case | issue_batch | reserve_credits | settle_reservation | resolve_review | apply_expirations |
|---|---|---|---|---|---|
| Settle another account's reservation | — | Structurally prevented (no account param) | Structurally prevented (no account param) | Bound to operation's own rows | — |
| Grant to arbitrary account | Perimeter only | — | — | — | — (cannot grant) |
| Resolve review without permission | — | — | — | **Prevented in-function** (stored-role re-check) | — |
| Manipulate expiry dates | Partial (FREE_ONCE forced; others caller-set) | — (respects expiry) | — (respects expiry) | — (respects expiry) | Not in-function (`p_now` caller-set); FREE_ONCE + reserved immune |
| Reuse idempotency key, different data | Effect prevented, silent | Effect prevented | Effect prevented, silent | Effect prevented | Safe by construction |
| Settle more than reserved | — | All-or-nothing intent; **F-6 race** | **Prevented** (review queue, no partial debit) | Pre-check + clamps; **F-10 race on overage** | — |
| Alter immutable ledger history | Convention only (F-13) — applies to all five | ← | ← | ← | ← |

## 8. Findings register

| ID | Severity | Finding | Location |
|---|---|---|---|
| F-6 | **Significant** | `reserve_credits`: no post-loop `v_need` assertion; concurrent same-account reservations can record a full reservation over a partial allocation. Fix shape: raise if `v_need > 0` after the loop. | L299–343 |
| F-10 | **Significant** | `resolve_review` APPROVED: same pattern for the overage loop; under-collection can coincide with a `SETTLED` record. Fix shape: assert `v_need = 0` after the loop. | L591–667 |
| F-5 | Moderate | `issue_batch`: idempotency probe is unlocked SELECT-then-INSERT; concurrent duplicate grants fail closed (one grant) but the loser gets a raw unique-violation instead of the original batch id. | L201–247 |
| F-1 | Minor | `CREATE POLICY` (L67) is unguarded — the file is not safely re-runnable; a second run aborts at §1. | L67–69 |
| F-2 | Minor | Reconciliation view: no grant discipline stated; a future broad SELECT grant would bypass batch RLS (no `security_invoker`). | L101 |
| F-8 | Minor | `settle_reservation`: `released_credits` excludes the expired write-off portion of the remainder — operation-level accounting under-reports releases (batch invariant unaffected). | L483–498 |
| F-12 | Minor | `apply_expirations`: return total counts amounts whose `expire:<batch>` entry pre-existed (reachable only via foreign writers). | L776–793 |
| F-4 | Minor | `resolve_review` does not cross-check review.account_id against operation.account_id (coherence rests on creation path + FKs). | L553–555 |
| F-9 | Minor | Settle's expired-remainder ledger key ignores the caller's idempotency key (fixed derivation), unlike its sibling entries. | L474 |
| F-7 | Minor | `reserve_credits` admits `estimated_credits = 0` operations. | L299 |
| F-11 | Informational | APPROVED review consumes reserved allocations from expired batches without an expiry test — assessed as correct, documented for asymmetry awareness. | L604–620 |
| F-3 | Informational | SQL eligibility (`status='ACTIVE'`) vs JS (`ACTIVE` or `EXHAUSTED`) divergence is unreachable under the maintained status semantics. | L303–306 |
| F-13 | Informational | Ledger append-only is writer convention, not DB-enforced (no trigger/rule against privileged UPDATE/DELETE). True of the whole schema family. | global |
| — | Structural note | No function in the file *creates* `credit_usage_operations` rows; `reserve_credits` presumes a `CREATED` operation exists. Operation creation (with its `UNIQUE(account_id, idempotency_key)`) remains outside the RPC layer — the future caller design must state who creates operations, or an `create_operation`-style RPC must be added under a separate grant. | §3b |

## 9. Readiness verdicts

All verdicts are **static** verdicts. Runtime behaviour is **NOT RUNTIME VERIFIED** for every function (§0 banner): no verdict below asserts that the code has ever executed successfully anywhere.

### 9.1 Per-RPC verdicts

| RPC | Verdict | Basis |
|---|---|---|
| `issue_batch` | **CONDITIONALLY READY (static)** — NOT RUNTIME VERIFIED | Correct shape: type/amount validation, FREE_ONCE forcing, subscription rollover default, true idempotent replay, wallet mapping identical to the domain. Conditions: (a) callers must be the authorizing server service (the function itself authorizes nothing — §7.1); (b) accept or fix F-5's concurrent-replay exception behaviour. |
| `reserve_credits` | **CHANGES REQUIRED (static)** — NOT RUNTIME VERIFIED | Allocation order is a faithful Phase 5.1 implementation and cross-account steering is structurally impossible, but Finding **F-6** (missing post-loop funding assertion) is a correctness hole under ordinary concurrency and must be corrected in the draft before the file can be considered for execution. F-7 optionally with it. |
| `settle_reservation` | **CONDITIONALLY READY (static)** — NOT RUNTIME VERIFIED | The strongest settlement semantics in the file: evidence + known-tariff requirements, overage diverted to manual review with zero partial debit, per-allocation clamping, expired-remainder write-off, duplicate-safe. Conditions: caller-trust per §5.3; F-8/F-9 documented as accepted accounting/derivation notes. |
| `resolve_review` | **CHANGES REQUIRED (static)** — NOT RUNTIME VERIFIED | Authorization re-check, CAS, mandatory reason, parked-on-insufficient-funds behaviour are all correct and the best in the file — but Finding **F-10** (missing post-loop overage assertion) shares F-6's defect class and must be corrected first. |
| `apply_expirations` | **CONDITIONALLY READY (static)** — NOT RUNTIME VERIFIED | FREE_ONCE immunity, FROZEN exclusion, reserved-portion immunity, and replay safety are all correctly implemented. Condition: the sole production caller must be a trusted scheduler passing real time (`p_now` is otherwise an expiry-manipulation surface — §7.5). |
| §1 policy table + seeds | **CONDITIONALLY READY (static)** — NOT RUNTIME VERIFIED | Additive, PK-conflict-safe seeds, honest `NULL` parameters, RLS shape consistent with repo pattern. Condition: F-1 re-runnability guard. |
| §2 reconciliation view | **CONDITIONALLY READY (static)** — NOT RUNTIME VERIFIED | Formula verified identical to the JS module's, including the NULL-reason edge. Condition: F-2 grant discipline (`security_invoker` or never-grant note) decided at execution time. |

### 9.2 Overall verdict

## **NOT READY FOR EXECUTION — draft remains a draft.**

Three independent reasons, any one of which is sufficient:

1. **Two significant static defects (F-6, F-10)** — missing post-loop funding assertions in `reserve_credits` and in `resolve_review`'s overage path — should be corrected *in the draft file* (under a future documentation/code grant; this review changed nothing) before the file is put forward for an execution decision. Both corrections are one-to-three lines each and do not alter any policy, amount, or ordering.
2. **Runtime verification does not exist.** The file has never been parsed or executed by any database available to this programme: local PostgreSQL is absent (`which psql pg_ctl postgres` → no paths, exit 1), and pointing it at any Supabase environment was outside the fence. PL/pgSQL body errors, constraint interactions, and lock behaviour can only be settled by an owner-approved run against a disposable copy. **NOT RUNTIME VERIFIED** applies to the file as a whole.
3. **Prerequisites are unverified in any target.** The draft's correctness leans on Phase 5.3's FKs, `workspace_members.status`/`billing_admin` columns, the FREE_ONCE partial index, and the widened ledger-kind CHECK. The live application state of every prerequisite migration is **UNKNOWN** (§3), and the draft's own header makes verifying it a precondition of execution.

What this review *does* establish: the draft is a faithful, carefully cross-checked SQL rendering of the JS domain — allocation order, wallet mapping, sign conventions, reconciliation formula, review semantics, and dormancy of un-decided commercial parameters (all `null`, nothing invented) all match their canonical sources, and its security perimeter (SECURITY DEFINER + pinned `search_path` + service-role-only EXECUTE) is correctly constructed. With F-6/F-10 corrected, F-1/F-2 addressed procedurally, prerequisites verified in the target, and a disposable-database runtime pass completed, the file could be re-presented for an owner execution grant. Until then, per its own header and this review: **it must NOT be applied anywhere.**

*End of review. Static analysis only: no database was contacted, no SQL was executed, no file other than this document (and its companion audit) was created or modified, and no configuration, secret, or environment was touched.*
