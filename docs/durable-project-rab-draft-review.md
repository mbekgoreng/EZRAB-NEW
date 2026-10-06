# Review Draft Durable Project/RAB Compatibility

Tanggal: 2026-09-14

Status: **static review only; no SQL was executed**.

## Files read

- `supabase/migrations/20260913_auth_membership_foundation.sql`
- `docs/durable-project-rab-compatibility-audit.md`
- `supabase/drafts/durable_project_rab_compat_text.sql`
- `supabase/migrations/20260913_durable_project_rab_foundation.sql` (for conflict context)

## Contract match with auth migration

| Draft area | Review result | Classification |
|---|---|---|
| `projects.id` preflight requires `text` | Correct; preserves the auth PK and never casts it | A — conceptually safe |
| `project_members.project_id` preflight requires `text` | Correct; matches auth composite FK | A — conceptually safe |
| RAB `project_id` columns are `text` | Correct; FK type matches `projects.id` | A — conceptually safe |
| New RAB entity IDs are `uuid` | Correct; these do not replace project IDs | A — conceptually safe |
| `created_by` is `uuid` | Correct type for `profiles.id` | A — type safe; FK/data state needs metadata |
| `created_by` is nullable | Correct; no immediate `NOT NULL` on existing data | A — conceptually safe |
| `workspace_id` is `uuid` | Matches `workspaces.id` in auth migration | A — type safe; orphan/existing state needs metadata |
| `projects.created_by` FK | Orphan check exists; constraint-name collision is now fail-closed | B — live metadata/data required |
| `legacy_id`, `client_name` additions | Additive and nullable | A — conceptually safe; existing columns must be inspected |
| `updated_at` | Draft does not alter existing timestamp columns | A — safe by omission |
| RAB tables | Now stop if any RAB table already exists; no silent reconciliation | B — live metadata required |
| RAB PK/FK/unique definitions | Safe for genuinely absent tables; conflicts unknown if existing | B — live metadata required |
| legacy unique index | Automatic creation deferred; same-name index is fail-closed | D — must be separately approved |
| RLS enable/policies | No policy statements in draft | D — policy inventory and approved SQL required |
| migration history | No statement touches it | A — preserved |

## Statement-by-statement risk matrix

| Statement/group | Risk | Required condition | Decision |
|---|---|---|---|
| `begin` / `commit` | Low operationally, but still a write transaction if applied | Explicit approval and staging only | D — not executable now |
| Four `information_schema` type preflights | Read-only and fail-closed | Metadata access | B — requires live metadata |
| `alter table projects add column if not exists ...` | Existing table mutation; `IF NOT EXISTS` does not validate type/meaning | Inspect columns, defaults, dependencies | B — staging metadata required |
| `projects.created_by` orphan query | Read-only data check | Data access and approved actor mapping | C — backfill decision required |
| `projects_created_by_profiles_fk` guard/addition | Can fail on name conflict or orphan; guard now stops on name collision | Constraint inventory and zero orphan non-null values | B/C — defer |
| duplicate `legacy_id` query | Read-only, but does not prove index safety alone | Complete duplicate/index inventory | B — required before index decision |
| legacy index name check | Fail-closed; prevents silent reuse | `pg_class`/`pg_indexes` metadata | B — required |
| commented legacy unique index | No execution | Approved index definition and duplicate-free data | D — defer |
| existing-RAB table guard | Fail-closed if any RAB table exists | Metadata confirms all four absent or separately reconciled | B — required |
| `create table public.rab_*` | Writes new tables and constraints | All RAB tables absent, or separate reviewed path | D — staging only after B complete |
| inline `project_id text FK` | Correct type and target | `projects(id)` PK available and no incompatible existing table | B/D |
| inline `workspace_id uuid FK` | Correct type and target | `workspaces(id)` exists and target table is new | B/D |
| inline `created_by uuid FK` | Correct profile type; nullable avoids backfill failure for new empty tables | `profiles(id)` exists | B/D |
| no `create policy` statements | Avoids overwrite and false idempotency | Policy review still required | A for safety; D for feature completeness |
| manual rollback comments | No automatic destructive action | Backup/reconciliation approval | D — plan only |

## Required separations

### A. Conceptually safe

- Preserve `projects.id` as `text`.
- Use `text` for all project references.
- Use UUID for new RAB entity IDs, profile IDs, and workspace IDs.
- Keep `created_by` nullable until mapping/backfill.
- Do not touch migration history, existing project IDs, or existing policies.

### B. Requires live metadata

- Existing `projects` column shape and constraint names.
- Existing RAB table presence and shape.
- Existing FK/index/unique definitions.
- Existing RLS flags and policies.
- Whether required profile/workspace references exist.

### C. Requires backfill or data proof

- Mapping existing `projects.created_by` to `profiles.id`.
- Any existing RAB `created_by` values.
- Zero orphan rows before adding FKs.
- Zero duplicate `(workspace_id, legacy_id)` values before considering the unique index.

### D. Must be deferred

- Any `NOT NULL` on `created_by`.
- Automatic legacy unique-index creation.
- RLS enablement or policy creation/changes.
- Any reconciliation of an already-existing RAB table.
- Applying the transaction to staging or production.

## Draft changes made

Only `supabase/drafts/durable_project_rab_compat_text.sql` was revised:

1. Existing RAB tables now cause an explicit preflight exception instead of being silently accepted by `CREATE TABLE IF NOT EXISTS`.
2. The legacy unique index is no longer automatically created; it is a deferred statement.
3. A same-name existing constraint or index now stops the draft for metadata review rather than silently skipping it.
4. Existing compatible project/membership column types are checked before `ADD COLUMN IF NOT EXISTS`, preventing an existing wrong-type column from being silently accepted.
5. `created_by` remains nullable and UUID/FK-compatible.
6. No RLS or policy statement was added, so no existing policy can be overwritten and no `CREATE POLICY` idempotency is assumed.

## Blockers

- Full PostgreSQL metadata export is still required before any staging apply decision.
- Existing RAB table presence/shape is unknown in this review.
- Existing constraint/index names and definitions are unknown.
- `created_by` ownership mapping and backfill are not defined.
- RLS/policy inventory and intended write policy are not approved.
- Duplicate legacy IDs and orphan references have not been observed through live queries in this review.

## Decision

The draft is **not ready to enter staging apply**. It is ready only for the next metadata-review step. No migration final may be created until the blockers above are resolved and the resulting evidence is recorded.
