# UNIFIED CREDITS — SPRINT 3 SQL VALIDATION

Subject: `supabase/migrations/20261110_unified_credits_foundation.sql` (DRAFT —
archive only; **not executed anywhere in this sprint**).
File: 827 → 1,028 lines · md5 `62d9e8608431d2f7aaf7d6da281ebd79` →
`685d8ad464f94da8ccf3fa09025c0e6c` · header now records the Sprint 3 amendment ·
`$$` delimiters verified balanced (14 = 7 pairs, 5 functions intact).

## Runtime status: NOT RUNTIME VERIFIED

PostgreSQL tooling check executed this sprint:
`which psql; which postgres; which pg_ctl; which docker; which podman` — all empty
(exit 1), identical to Phase 2. No disposable database could be created, so **no SQL
in this file has been executed**. All findings below are static review results.
A ready-to-run harness is prepared outside the repo at
`~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT3/sql-harness/`
(`run_all.sh` refuses non-local hosts, creates a disposable
`ezrab_sprint3_sqltest_<ts>` database, applies prerequisites + the draft **twice**
to prove F-1 idempotency, then drops it; `assertions.sql` covers schema,
service-role-only authorization, replay, reservation, and invariant checks;
`concurrency.sh` specifies scenarios A/B/C for F-5/F-6/F-10; per-scenario fixtures
were deliberately not fabricated because they depend on prerequisite DDL that can
only be confirmed on the first real run).

**The draft remains NOT READY FOR EXECUTION** until that harness passes on a real
disposable PostgreSQL and a separate owner grant (decision D16) authorizes any
application.

## Per-finding status

| Finding | Status | What changed / why |
|---|---|---|
| **F-6** `reserve_credits` | **FIXED (static)** | Account row locked first (`billing_accounts … FOR UPDATE`); batch rows locked `FOR UPDATE` in the same deterministic order as the locked Phase 5.1 allocation order; the old availability pre-check is demoted to a non-authoritative fast pre-check, with availability recomputed inside the transaction against locked rows; **every UPDATE/INSERT is verified with `GET DIAGNOSTICS ROW_COUNT = 1`**; hard post-loop assertion: `v_need <> 0 OR v_allocated <> estimated OR v_alloc_rows = 0 → RAISE EXCEPTION 'insufficient_balance'` — the whole transaction rolls back, so no reservation record, allocation row, or ledger entry survives a failed reservation; final operation-row assertion added. A partial reservation can no longer be recorded as successful. |
| **F-10** `resolve_review` | **FIXED (static)** | Account row locked; allocation batches are now `SELECT … FOR UPDATE` before consumption (previously updated without an explicit lock); `ROW_COUNT` asserted on every UPDATE in both the APPROVED and REJECTED branches; assertion that total allocation consumption equals `reserved_credits`; post-loop overage assertion `v_need <> 0 → RAISE` (allocation consumption and ledger writes roll back with it — the operation cannot end half-SETTLED); the terminal CAS `WHERE status='PENDING'` + `ROW_COUNT` check is retained, so a repeated approval cannot settle twice and a REJECTED review is terminal under the same status guard. All financial effects occur in the single function transaction. |
| **F-1** | **FIXED (static)** | `CREATE POLICY` replaced by a `DO` block guarded by a `pg_policies` existence check with dynamic `EXECUTE` — the file is now safe to run more than once. |
| **F-2** | **FIXED (static)** | The reconciliation view carries an explicit never-grant warning, `REVOKE ALL … FROM PUBLIC/anon/authenticated`, and a guarded `DO` block that attempts `ALTER VIEW … SET (security_invoker = true)` with `EXCEPTION → RAISE NOTICE` for platforms below PG15. |
| **F-13** | **NOT CHANGED — documented residual risk** | The Phase 2 audit itself rated F-13 informational / non-blocking. Append-only behavior is an authoring convention across the whole migration family, not a defect local to this file. A tamper-evidence mechanism (trigger enforcement or hash-chaining) is a separate owner design decision, not an evidence-backed local correction; recorded in the amendment header. |
| F-4 (minor, fixed as a side effect of the F-10 pass) | **FIXED (static)** | Review↔operation cross-check: mismatched `account_id`/`workspace_id` → `'review_mismatch'` with no mutation; membership lookup now targets the **operation's** workspace. Authorization semantics deliberately **not** tightened: the evidence (JS `canResolveBillingReview` + Phase 5.3 D3 tests) shows the governing design is SUPER_ADMIN **or** `billing_admin = true`, with CLIENT always rejected — a flag-mandatory-for-all rule would break an owner-approved test contract, so the Sprint 3 instruction phrase was interpreted against the draft's existing design and the interpretation is recorded in the SQL comments. |
| F-5 `issue_batch` (moderate, fixed) | **FIXED (static)** | `pg_advisory_xact_lock` per (account, key) before the probe, plus an `EXCEPTION WHEN unique_violation` sub-block that rolls back the sub-block's batch and replays the original `batch_id` (including the account's FREE_ONCE fallback batch) — the losing concurrent grant no longer receives a raw exception and no orphan batch remains. |
| F-7 (fixed) | **FIXED (static)** | `reserve_credits` rejects `estimated_credits <= 0` / NULL with `'invalid_amount'`. |
| F-3, F-8, F-9, F-11, F-12 | **NOT CHANGED** | Minor/informational per the Phase 2 audit; no evidence-backed local correction was required for financial integrity or security in this sprint. |

## Authorization review (static, unchanged from Phase 2 unless noted)

- `SECURITY DEFINER` with restricted `search_path` and service-role-only execution
  were re-verified statically against the per-argument signatures for all five RPCs
  (`issue_batch`, `reserve_credits`, `settle_reservation`, `resolve_review`,
  `apply_expirations`).
- Abuse cases re-examined statically after the fixes: settle another account's
  reservation (blocked by account scoping + the new F-4 mismatch check), grant to an
  arbitrary account (service-role-only + advisory-lock idempotency), resolve a review
  without permission (reviewer authorization + CAS), manipulate expiry dates (no
  caller-writable expiry path), reuse an idempotency key with different financial
  data (unique key + payload comparison at the domain layer; SQL probe hardened by
  F-5), settle more than reserved (F-6/F-10 assertions), alter ledger history
  (append-only convention — see F-13 residual risk).

## What remains before this draft may ever run

1. Execute the prepared harness on a disposable local PostgreSQL — converts this
   document's static fixes into runtime evidence. (**NOT VERIFIED** today.)
2. Owner grant D16 for any real migration execution, in the documented order.
3. Owner decision on F-13 tamper-evidence if append-only convention is judged
   insufficient.
