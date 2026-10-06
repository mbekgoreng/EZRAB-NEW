# Live Schema Compatibility Verification

Tanggal verifikasi: 2026-09-14 (Asia/Jakarta)

## Scope and safety

- Target Supabase dibaca melalui `SUPABASE_URL` dan `SUPABASE_SECRET_KEY` yang sudah tersedia di `.env`.
- Operasi yang dilakukan hanya `GET` ke PostgREST/OpenAPI, dengan `limit=1` untuk probe tabel.
- Tidak ada migration, `POST`, `PATCH`, `DELETE`, `rpc` mutatif, atau perubahan database yang dijalankan.
- Nilai key, token, dan data row tidak dicetak ke laporan.

## Live result actually verified

Target: Supabase project ref `ssnjgwegfteuvbxidfvq` (diambil dari host URL; secret tidak dicatat).

| Check | Result | Evidence |
|---|---|---|
| PostgREST availability | Verified | `GET /rest/v1/` returned HTTP 200. |
| Public schema API description | Verified | OpenAPI response contained only the introspected root and RPC `rls_auto_enable`; no foundation/RAB table paths. |
| `public.projects` | Not available through live PostgREST schema cache | `GET /rest/v1/projects?select=*&limit=1` returned HTTP 404, code `PGRST205`. |
| `profiles`, `workspaces`, `workspace_members`, `project_members`, `audit_logs` | Not available through live PostgREST schema cache | Each probe returned HTTP 404, code `PGRST205`. |
| `rab_documents`, `rab_versions`, `rab_items`, `rab_item_components` | Not available through live PostgREST schema cache | Each probe returned HTTP 404, code `PGRST205`. |

The exact live physical table state cannot be distinguished from an unexposed/non-refreshed API schema using this endpoint alone. Therefore the safe conclusion is: **the target's PostgREST schema cache does not currently expose these tables; physical column/constraint/policy state remains unverified**.

## Migration comparison and explicit conflicts

### `20260913_auth_membership_foundation.sql`

Expected `public.projects` contract:

- `id text primary key`
- `workspace_id uuid not null` referencing `workspaces(id)` with `on delete cascade`
- `name text not null`, `location text`, `status text`, `progress numeric`
- `created_at` and `updated_at` as non-null `timestamptz`
- unique `(id, workspace_id)`
- RLS enabled
- select policy `projects_member_read`, based on `project_members.project_id = projects.id` and `auth.uid()` membership

### `20260913_durable_project_rab_foundation.sql`

Expected `public.projects` contract:

- `id uuid primary key default gen_random_uuid()`
- `legacy_id text`
- `workspace_id uuid not null` referencing `workspaces(id)`
- `name text not null`, `client_name text`, `location text`, `status text`
- `created_by uuid not null` referencing `profiles(id)`
- unique `(workspace_id, legacy_id)`

Its preflight aborts when an existing `public.projects.id` is anything other than `uuid`. All RAB tables use `project_id uuid` and foreign keys to `projects(id)`.

### Conflicts

1. **Direct type conflict:** the first migration specifies `projects.id text`; the second requires `projects.id uuid` and aborts for `text`.
2. **Foreign-key type conflict:** the first migration makes `project_members.project_id text`; the second requires every RAB `project_id` to be `uuid`.
3. **Column contract conflict:** the first migration does not define `client_name` or `created_by`; the second requires both for its durable `projects` shape.
4. **Existing-table behavior conflict:** `create table if not exists` does not reconcile an existing table's columns, types, constraints, or policies. It only avoids creating a missing table.
5. **Policy/idempotency risk:** both migrations use plain `create policy`; rerunning after a policy already exists can fail. Existing policy names/expressions must be checked before any staging apply.
6. **Migration ordering dependency:** durable RAB tables require `profiles`, `workspaces`, `project_members`, and a compatible `projects` table first.
7. **Current live verification gap:** the target API currently exposes none of these tables, so no live primary key, foreign key, column list, RLS flag, policy expression, or migration history was confirmed.

## Safe recommendation

Do not run either migration against production in its current combined form.

Use this decision branch after direct PostgreSQL metadata verification:

1. If live `projects.id` is `text`, preserve it. Do not cast or replace it. Create a compatibility revision of the durable migration where every `project_id` is `text`, RAB foreign keys reference `public.projects(id)`, and any new UUID surrogate is a separate column (for example `project_uuid`) only if the application later needs one. Backfill new nullable columns before adding `not null` constraints.
2. If live `projects.id` is `uuid`, align the membership migration to UUID before applying it, and add missing required columns with a staged backfill. Do not apply the durable migration unchanged until `created_by` and all existing rows satisfy its constraints.
3. If `projects` is absent, decide one canonical contract first. UUID is preferable for a new empty schema, but the two checked-in migrations must still be consolidated into one ordered, idempotent migration before staging.
4. Treat the checked-in files as proposals, not proof of live state. Any destructive type conversion, key rewrite, or FK replacement requires an approved backup and explicit data reconciliation plan.

## Staging procedure (not executed)

1. Provision an isolated Supabase staging project with a separate URL/key set. Confirm the ref is not production.
2. Take a database backup/snapshot using the Supabase-supported backup facility. Export row counts and checksums for `projects`, membership tables, and any existing RAB tables.
3. Run metadata preflight only: columns/types, PKs, FKs, indexes, RLS flags, policy definitions, and migration history. Abort on any unexpected object.
4. Apply the reviewed compatibility migration to staging only, through the approved migration workflow.
5. Create two real test users and memberships: member user, non-member user, and (if applicable) an admin/service actor. Avoid synthetic JWT-only tests for the final authorization check.
6. Test CRUD using the real authenticated users: allowed project/RAB reads and writes, rejected cross-workspace/project access, null/duplicate handling, and FK delete behavior.
7. Test RLS explicitly for every table: member allow, non-member deny, unauthenticated deny, and server-side service-role behavior where intended.
8. Re-run metadata preflight and compare it with the reviewed contract and migration history.
9. Test rollback on a fresh staging clone or disposable staging database, in reverse dependency order, only after confirming backup restore/import reconciliation. Verify row counts and representative records afterward.
10. Promote only after staging evidence is reviewed; keep production untouched until an explicit approval is given.

## Commands

### Commands executed (read-only)

The effective probes were:

```powershell
# Read-only PostgREST introspection
GET $SUPABASE_URL/rest/v1/

# Read-only table probes, each with limit=1
GET $SUPABASE_URL/rest/v1/projects?select=*&limit=1
GET $SUPABASE_URL/rest/v1/profiles?select=*&limit=1
GET $SUPABASE_URL/rest/v1/workspaces?select=*&limit=1
GET $SUPABASE_URL/rest/v1/workspace_members?select=*&limit=1
GET $SUPABASE_URL/rest/v1/project_members?select=*&limit=1
GET $SUPABASE_URL/rest/v1/audit_logs?select=*&limit=1
GET $SUPABASE_URL/rest/v1/rab_documents?select=*&limit=1
GET $SUPABASE_URL/rest/v1/rab_versions?select=*&limit=1
GET $SUPABASE_URL/rest/v1/rab_items?select=*&limit=1
GET $SUPABASE_URL/rest/v1/rab_item_components?select=*&limit=1
```

### Commands to run only in staging after approval

```powershell
# Link only to the staging project; never substitute the production ref.
supabase link --project-ref <STAGING_PROJECT_REF>

# Read-only preflight/diff, depending on the installed CLI version.
supabase db diff --linked --schema public
supabase migration list --linked

# Apply only the reviewed staging migration.
supabase db push --linked

# After applying, repeat the metadata preflight and application-level CRUD/RLS tests.
```

For direct metadata verification, use the official staging/target database connection method with a least-privilege read-only database credential and query `information_schema`, `pg_constraint`, `pg_policies`, `pg_class`, and `supabase_migrations.schema_migrations`. No such database credential or Supabase CLI installation was present in this workspace, so those commands were intentionally not run.

## Not yet verifiable

- Physical existence and exact type of `public.projects.id`.
- Physical primary key definition and all foreign keys.
- Complete existing column list, nullability, defaults, indexes, and constraints.
- RLS enabled flags and exact policy expressions.
- Applied migration history in `supabase_migrations.schema_migrations`.
- Existing row counts, data shape, and whether a legacy `projects` table is in production.
- Whether the target API schema cache is stale or tables are intentionally not exposed.

No frontend restructuring, localStorage import, or removal of the backend Map was performed.

## Pre-migration blocker resolution

### Important interpretation of `PGRST205`

`PGRST205` means that PostgREST cannot find the relation in its current API schema cache. It is **not proof that the PostgreSQL table does not physically exist**. Possible explanations include an unexposed schema/relation, stale schema cache, permissions/API configuration, or an actually missing table. A direct PostgreSQL metadata query or disposable database clone is required before making a schema claim.

Accordingly, this report deliberately does not assume that `projects.id` is `text` or `uuid`.

### Compatibility matrix

| Entity | Text-ID branch | UUID-ID branch | Main blocker |
|---|---|---|---|
| `projects` | Preserve existing `id text`; add new attributes nullable first | Preserve existing `id uuid`; align auth migration; add new attributes nullable first | Existing PK type and current columns unknown |
| `project_members` | `project_id text`, FK to `projects(id)` | `project_id uuid`, FK to `projects(id)` | Existing FK/type/policy unknown |
| `rab_documents` | New entity `id uuid`, `project_id text` | New entity `id uuid`, `project_id uuid` | Existing table and uniqueness unknown |
| `rab_versions` | New entity `id uuid`, `project_id text`, document FK uuid | New entity `id uuid`, `project_id uuid`, document FK uuid | Existing table and version constraints unknown |
| `rab_items` | New entity `id uuid`, `project_id text`, legacy project ID preserved | New entity `id uuid`, `project_id uuid` | Existing data and required columns unknown |
| `rab_item_components` | New entity `id uuid`, FK to UUID `rab_items.id` | Same | RLS and existing dependency graph unknown |

### Conflict-prone columns and controls

- `created_by`: both durable designs want it required, but existing rows may have no actor. Add nullable, backfill from an approved mapping, validate, then enforce `NOT NULL`.
- `client_name`: absent from the auth foundation; add only if product semantics and existing naming are confirmed.
- `workspace_id`: must match the existing workspace key type and membership boundary. Never add a foreign key until orphan counts are zero.
- `project_id`: must exactly match `projects.id` in every referencing table. No implicit cast or dual-type FK.
- timestamps: inspect existing type, timezone, default, nullability, and update behavior before adding or tightening constraints.
- RLS/policies: inventory `pg_policies`, policy names, roles, and expressions first. Do not assume `create policy` is idempotent or that read policy implies write policy.

### Two approved design options

**Option A — existing `projects.id` is `text`**

Keep the existing project ID untouched. Use `text` for every `project_id` and project FK, including `project_members` and all RAB tables. UUIDs may be used for new entity IDs such as RAB documents, versions, items, and components, but never as a replacement for the old project ID. Draft: `supabase/drafts/pre_migration_compat_text.sql`.

**Option B — existing `projects.id` is `uuid`**

Use UUID consistently in `project_members` and every RAB project FK. Correct the auth foundation contract before applying it; do not run the current text-ID definition against a UUID table. Add `created_by` nullable, backfill it, validate the mapping, and only then add `NOT NULL`. Draft: `supabase/drafts/pre_migration_compat_uuid.sql`.

### Minimum access required for live verification

At least one of these is required, scoped to staging or a disposable clone:

1. Supabase CLI authenticated to the staging account, plus the staging project ref, for linked schema/migration inspection.
2. An official database connection using a least-privilege read-only credential that can inspect `information_schema`, `pg_constraint`, `pg_policies`, `pg_class`, and `supabase_migrations.schema_migrations`.
3. A database clone/disposable staging project where metadata and test migrations can be inspected safely.

The workspace currently has none of these direct metadata capabilities. The REST secret key is sufficient for server-side API calls, but it does not establish the physical PostgreSQL schema or migration history.

### Final blocker status

- **Blocker:** physical metadata access is missing; `projects.id` cannot be selected safely.
- **Blocker:** migration history is not available through the exposed PostgREST schema.
- **Blocker:** current FK, RLS, policy, row-count, orphan, and nullability state is unknown.
- **Evidence available:** target PostgREST returned HTTP 200 for introspection; all ten probes returned `PGRST205`; local migration files show the text/UUID incompatibility.
- **Forbidden assumptions:** do not assume table absence from `PGRST205`; do not assume `projects.id` type; do not assume policy/idempotency; do not assume existing rows satisfy new `NOT NULL` constraints.
- **Recommendation:** obtain staging metadata access, choose A or B from measured type evidence, review the corresponding draft, and test it only on backup-protected staging.
- **Approvals still required:** staging project/ref confirmation; read-only metadata credential or authenticated CLI; backup/restore owner; choice of A/B; data mapping for `created_by`; RLS policy approval; CRUD/RLS test users; rollback acceptance.

This stage is **not verified** and **not production-ready**. No SQL draft in `supabase/drafts/` has been applied.

## Staging metadata verification attempt

On 2026-09-14, the fail-closed local preflight found no `EZRAB_STAGING_PROJECT_REF`, no Supabase CLI in `PATH`, and no `supabase/config.toml`. The previously recorded production ref is `ssnjgwegfteuvbxidfvq`. Since a staging ref could not be displayed and compared, no remote command or SQL introspection was run. Therefore no new evidence was obtained for `projects.id`, constraints, columns, RLS, policies, tables, or migration history.
