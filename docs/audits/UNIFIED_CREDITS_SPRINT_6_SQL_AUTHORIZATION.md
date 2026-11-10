# EZRAB — Unified Credits Sprint 6: SQL Authorization

- **Date:** 2026-11-10 · **Repo:** `/home/hatch/workspace/ezrab-unified` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896` (unchanged)
- **Subject:** `supabase/migrations/20261110_unified_credits_foundation.sql`, md5 `170f0d79b0b43dccea9f81b95ed5ea27`, 1,227 lines (re-verified this sprint).
- **Verdict: static privilege review PASS — runtime role verification NOT RUN.** PostgreSQL is unavailable on this machine (gate BLOCKED), so no catalogue query and no `SET ROLE` execution attempt could be performed (harness scenario P-1). A migration statement existing in the file is not proof it succeeded anywhere; this document verifies only that the draft's stated privilege posture is present, explicit and unchanged. No privilege was granted to anyone new in any sprint, and none was changed in this one.

---

## 1. Per-RPC privilege posture (grep-level, read-only, this sprint)

All five billing RPCs are `SECURITY DEFINER` with a pinned `search_path`, and carry **explicit** revocations from PUBLIC, `anon` and `authenticated` (added in Sprint 5) with execution granted to `service_role` only.

| Function (signature) | Created | SECURITY DEFINER + search_path | REVOKE PUBLIC | REVOKE anon | REVOKE authenticated | GRANT |
|---|---|---|---|---|---|---|
| `issue_batch(uuid,uuid,uuid,text,bigint,timestamptz,text,timestamptz,timestamptz,text,text) RETURNS text` | line 261 | lines 276–277 | line 436 | line 438 | line 439 | line 440 → `service_role` only |
| `reserve_credits(uuid,text) RETURNS text` | line 464 | lines 470–471 | line 590 | line 592 | line 593 | line 594 → `service_role` only |
| `settle_reservation(uuid,bigint,jsonb,text,text) RETURNS text` | line 622 | lines 631–632 | line 819 | line 821 | line 822 | line 823 → `service_role` only |
| `resolve_review(uuid,text,text,uuid,text,text) RETURNS text` | line 855 | lines 865–866 | line 1124 | line 1126 | line 1127 | line 1128 → `service_role` only |
| `apply_expirations(uuid,timestamptz) RETURNS bigint` | line 1137 | lines 1143–1144 | line 1199 | line 1201 | line 1202 | line 1203 → `service_role` only |

Reconciliation view `credit_batch_reconciliation`: REVOKE from PUBLIC (line 224), `anon` (225), `authenticated` (226); no GRANT on the view exists (pre-existing since the Sprint 3 F-2 fix; not duplicated in Sprint 5 or 6).

**Zero drift** against the Sprint 5 final report §D.3 — every line number reproduces exactly.

## 2. Authorisation semantics (unchanged, statically confirmed)

- Inside `resolve_review`, the governing design is preserved verbatim: a review may be resolved only by a SUPER_ADMIN or a workspace member with `billing_admin = true`; **CLIENT is always rejected**. Nothing in Sprint 5 or 6 widened or narrowed this.
- `resolve_review` terminal-state protection is two-layered (statically verified this sprint): rows locked `FOR UPDATE` (operation line 890, review line 894) with an early `status <> 'PENDING'` → `'already_resolved'` return (lines 898–899), plus a final CAS `UPDATE … WHERE id = … AND status = 'PENDING'` (lines 1097–1103) whose `GET DIAGNOSTICS` row count (line 1104) raises `'already_resolved'` on zero rows (lines 1105–1107). A rejected review therefore remains terminal, and a duplicate approval cannot double-consume — **at the static level**; concurrent-session proof (S4) is NOT RUN.
- `reserve_credits` F-6 posture (static): operation row `FOR UPDATE` (line 488), account row `FOR UPDATE` (lines 501–506), allocation loop over batches `FOR UPDATE` in deterministic allocation order (lines 522–534), post-loop assertion (lines 574–576) raising `'insufficient_balance'` and rolling back any partial allocation if the reserved total is not met exactly.

## 3. What runtime verification (P-1) still owes

When a disposable Supabase-flavoured PostgreSQL exists (see the provisioning request in `UNIFIED_CREDITS_SPRINT_6_POSTGRES_RUNTIME.md` §3), scenario P-1 must verify with **actual roles**, not file inspection:

1. Catalogue query (`pg_proc.proacl` / `has_function_privilege`) for all five RPCs and the reconciliation view.
2. `SET ROLE anon` / `SET ROLE authenticated` execution attempts on each RPC — all must be denied.
3. `SET ROLE service_role` execution — must succeed (against synthetic fixtures).
4. No broader grant may be created to make any test pass.

Until then, the correct status is: **privileges statically explicit and service-role-only by construction; runtime enforcement NOT VERIFIED.**

## 4. Webhook / middleware note

Unchanged and out of scope for this sprint: `middleware.ts` was not touched; the `/api/credits/*` gate still has no webhook exemption; that remains owner decision **D17**, pending its own grant.
