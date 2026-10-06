# Live Metadata Review — Durable Project/RAB

Tanggal review: 2026-09-14 (Asia/Jakarta)  
Target: Supabase staging `icemyvldjiewkzzwkjrw`  
Mode: read-only PostgreSQL metadata and aggregate checks only

## Safety and evidence

The review used the linked staging Supabase CLI connection and only `SELECT` queries against PostgreSQL catalog views/tables and aggregate table queries. No migration, `db push`, migration-up, reset, start, `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP`, `CREATE`, `GRANT`, or migration-history change was performed. No password, token, service key, database URL, or row contents were recorded.

Staging identity is evidenced by the linked project ref and the PostgreSQL query result (`current_database = postgres`, schema `public`). The linked migration listing and direct `supabase_migrations.schema_migrations` query agree on the applied migration. Production was not queried.

## A. Verified

### A1. Existing tables and columns

The following existing public tables were verified: `projects`, `workspaces`, `profiles`, and `project_members`. The RAB tables `rab_documents`, `rab_versions`, `rab_items`, and `rab_item_components` were not present in `information_schema.tables`.

| Table | Column | Type | Nullable | Default |
|---|---|---|---|---|
| `projects` | `id` | `text` | NO | — |
|  | `workspace_id` | `uuid` | NO | — |
|  | `name` | `text` | NO | — |
|  | `location` | `text` | YES | — |
|  | `status` | `text` | YES | — |
|  | `progress` | `numeric` | YES | — |
|  | `created_at` | `timestamptz` | NO | `now()` |
|  | `updated_at` | `timestamptz` | NO | `now()` |
| `workspaces` | `id` | `uuid` | NO | `gen_random_uuid()` |
|  | `name` | `text` | NO | — |
|  | `created_at` | `timestamptz` | NO | `now()` |
| `profiles` | `id` | `uuid` | NO | — |
|  | `full_name` | `text` | YES | — |
|  | `username` | `text` | YES | — |
|  | `role` | `text` | NO | `'SUPER_ADMIN'::text` |
|  | `owner_id` | `uuid` | YES | — |
|  | `status` | `text` | NO | `'ACTIVE'::text` |
|  | `created_at` | `timestamptz` | NO | `now()` |
|  | `updated_at` | `timestamptz` | NO | `now()` |
| `project_members` | `project_id` | `text` | NO | — |
|  | `workspace_id` | `uuid` | NO | — |
|  | `user_id` | `uuid` | NO | — |
|  | `created_at` | `timestamptz` | NO | `now()` |

### A2. Keys, foreign keys, unique constraints, and indexes

Relevant live constraints:

- `projects_pkey`: `PRIMARY KEY (id)`; `projects.id` is `text`.
- `projects_id_workspace_id_key`: `UNIQUE (id, workspace_id)`.
- `projects_workspace_id_fkey`: `(workspace_id)` references `workspaces(id)` `ON DELETE CASCADE`.
- `project_members_pkey`: `PRIMARY KEY (project_id, user_id)`.
- `project_members_project_id_workspace_id_fkey`: `(project_id, workspace_id)` references `projects(id, workspace_id)` `ON DELETE CASCADE`.
- `project_members_user_id_fkey`: `(user_id)` references `profiles(id)` `ON DELETE CASCADE`.
- `project_members_workspace_id_user_id_fkey`: `(workspace_id, user_id)` references `workspace_members(workspace_id, user_id)` `ON DELETE CASCADE`.
- `profiles_id_fkey`: `profiles(id)` references `auth.users(id)` `ON DELETE CASCADE`.
- `profiles_owner_id_fkey`: `profiles(owner_id)` references `profiles(id)` `ON DELETE SET NULL`.
- `workspaces_pkey`: `PRIMARY KEY (id)`.

Other verified primary/unique constraints: `profiles_pkey`, `profiles_username_key`, `workspace_members_pkey`. Check constraints on role/status/name/progress also exist; they do not alter the project-ID compatibility conclusion.

Indexes on the requested tables:

- `projects_pkey` (unique, `id`)
- `projects_id_workspace_id_key` (unique, `id, workspace_id`)
- `projects_workspace_idx` (`workspace_id, id`)
- `project_members_pkey` (unique, `project_id, user_id`)
- `project_members_user_idx` (`user_id, project_id`)
- `profiles_pkey` (unique, `id`)
- `profiles_username_key` (unique, `username`)
- `workspaces_pkey` (unique, `id`)

### A3. RLS and existing policies

| Table | RLS | Forced | Existing policies |
|---|---:|---:|---|
| `projects` | enabled | false | `projects_member_read` — SELECT, role `authenticated`, `USING` checks matching `project_members.project_id` and `auth.uid()` |
| `project_members` | enabled | false | `project_members_self_read` — SELECT, role `authenticated`, `USING (user_id = auth.uid())` |
| `profiles` | enabled | false | `profiles_self_read` — SELECT, role `authenticated`, `USING (id = auth.uid())` |
| `workspaces` | enabled | false | `workspaces_member_read` — SELECT, role `authenticated`, `USING` checks matching `workspace_members.workspace_id` and `auth.uid()` |

No RAB RLS or policies exist because the four RAB tables are absent. No write policy was inferred or approved.

### A4. Migration history

`supabase_migrations.schema_migrations` is readable and contains exactly:

| Version | Name |
|---|---|
| `20260913` | `auth_membership_foundation` |

The durable UUID migration is not recorded as applied.

### A5. Safe aggregate data checks

All four existing tables currently contain zero rows. Consequently, the checked aggregate NULL and orphan counts are all zero:

- `projects`: 0 rows; NULL counts for `id`, `workspace_id`, `name`, `created_at`, and `updated_at` are 0; orphan `workspace_id` count is 0.
- `workspaces`: 0 rows; NULL counts for `id`, `name`, and `created_at` are 0.
- `profiles`: 0 rows; NULL counts for `id`, `role`, `status`, `created_at`, and `updated_at` are 0.
- `project_members`: 0 rows; NULL counts for `project_id`, `workspace_id`, `user_id`, and `created_at` are 0; orphan `project_id`, `user_id`, and `workspace_id` counts are 0.

`projects.created_by` and `projects.legacy_id` do not exist, so their NULL/orphan/duplicate counts are not applicable. No personal data or table contents were displayed.

## B. Incompatible

1. `20260913_durable_project_rab_foundation.sql` requires/creates `projects.id uuid`, while live `projects.id` is `text`. Its `rab_* .project_id uuid` references are therefore incompatible with the live primary key and must not be applied.
2. The durable UUID migration also conflicts with the live `project_members.project_id text` and composite project FK.
3. The auth migration file describes a minimal `profiles` shape (`display_name`), while live `profiles` has an expanded shape (`full_name`, `username`, `role`, `owner_id`, `status`) and existing constraints. This is additive drift, not a reason to replace the table; any draft must preserve it and inspect names before adding objects.
4. The live RLS/policy inventory confirms existing policy names. A future migration must not blindly recreate or overwrite these policies.

The text compatibility draft agrees with the decisive live type facts: preserve `projects.id text`, use text for all RAB `project_id` columns, and use UUID only for new RAB entity IDs, workspace IDs, and profile IDs.

## C. Unknown karena akses tidak tersedia

None for the requested live metadata scope. PostgreSQL catalog access, aggregate table access, and migration-history access were available and returned results. The absence of RAB tables is based on the live catalog query, not on a PostgREST `PGRST205` probe.

## D. Membutuhkan keputusan atau backfill

- Decide the approved owner mapping for a future nullable `projects.created_by`; it is currently absent. Do not enforce `NOT NULL` without an approved mapping and proof.
- Decide whether/when to add `legacy_id`, `client_name`, and the deferred unique `(workspace_id, legacy_id)` index. There is no live `legacy_id` data to validate yet.
- Before any RAB table creation, preserve the text-ID contract and approve RAB columns, FKs, indexes, RLS, and policies separately.
- Approve the intended RAB write/read policies; existing tables currently have read-only member policies and no RAB policies.
- Re-run the aggregate checks after any staging backfill or seed data; current zero counts are a clean empty-state result, not evidence for future populated data.

## Static artifact reconciliation

The review was matched against:

- `supabase/migrations/20260913_auth_membership_foundation.sql`: live PK/FK/RLS contract is present, with the observed expanded `profiles` shape.
- `docs/durable-project-rab-compatibility-audit.md`: its text-ID compatibility branch is confirmed; its earlier “metadata still required” status is now resolved for this staging target.
- `docs/durable-project-rab-draft-review.md`: the identified gates (existing objects, policy inventory, nullable `created_by`, duplicate/orphan checks) are reflected here.
- `supabase/drafts/durable_project_rab_compat_text.sql`: type preflight is compatible with live state; all four RAB tables are absent; the draft remains a draft and was not executed.

## Decision

# READY FOR STAGING PLAN REVIEW

The live metadata review is complete and supports planning the text-compatible staging path. This is not approval to apply the draft, create a final migration, change migration history, or alter any schema/data. Those actions remain gated on the decisions and backfill/policy approvals above.
