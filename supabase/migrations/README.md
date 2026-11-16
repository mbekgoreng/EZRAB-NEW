# Supabase Migrations — Apply Order & Supersede Notes

**Status: NONE of these migrations is confirmed applied to any live
database.** Every migration file in this directory is headed NOT
APPLIED. Apply manually, in the order below, to a NON-PRODUCTION
project first. Never apply a superseded file.

## Apply order (explicit — I-15)

| # | File | Notes |
|---|---|---|
| 1 | `20261008_phase3_canonical_schema_rls.sql` | **CANONICAL.** Supersedes BOTH 20260913 files (below). Apply this, never them. |
| 2 | `20261012_price_assumptions.sql` | Price assumptions + history (pattern source for 20261116). |
| 3 | `20261017_blog_cms.sql` | Blog CMS. Independent. |
| 4 | `20261018_ai_credits_ledger.sql` | AI credits ledger. |
| 5 | `20261018_market_price_references.sql` | Market price references + history. |
| 6 | `20261022_workspace_invitations.sql` | Workspace invitations. |
| 7 | `20261102_billing_batch_ledger.sql` | Billing batch ledger. |
| 8 | `20261102_phase53_workspace_billing.sql` | Workspace billing. |
| 9 | `20261109_billing_orders_subscriptions.sql` | Billing orders/subscriptions. |
| 10 | `20261110_unified_credits_foundation.sql` | Unified credits foundation. |
| 11 | `20261112_ai_memory_foundation.sql` | AI memory foundation. |
| 12 | `20261116_master_price_governance.sql` | **Master Pricing §4 (M-9).** Global master price governance: `global_admins`, `master_price_entities`, `master_price_records`, `master_price_history`, `master_price_aliases`, `ahsp_database_versions`. Requires (a) the Supabase project, (b) `AUTH_ENABLED=true` + real login, (c) this file, (d) the admin API. See the file header for the full blocker record. |

Files 3–11 are independent of each other (each is self-contained);
their relative order above is chronological. File 12 depends only on
`auth.users` + `pgcrypto`, but is listed last because its enforcement
presupposes the auth foundation (file 1) and real login.

## SUPERSEDED — DO NOT APPLY

| File | Why |
|---|---|
| `20260913_auth_membership_foundation.sql` | **SUPERSEDED by 20261008.** Defines `projects.id` as TEXT; the canonical schema uses UUID. Applying it before/after 20261008 causes a conflict (the durable-RAB migration aborts in preflight when `projects.id` is not UUID). Kept for history only. |
| `20260913_durable_project_rab_foundation.sql` | **SUPERSEDED by 20261008.** Same conflict (preflight ABORT when `projects.id` is not UUID). Kept for history only. |

## Test files

`20261116_master_price_governance.test.sql` — SQL tests for the §4
governance migration (§14.1). **BLOCKED: documented, not runnable**
until the migration is applied to a Supabase instance. The file is
self-guarding: without the tables it prints a BLOCKED notice and
exits 0; with the tables it runs T1–T11 inside one transaction and
rolls back. See the file header for run instructions.
