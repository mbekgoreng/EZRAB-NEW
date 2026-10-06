# STAGING ACCESS READINESS

Status: **checklist and read-only commands only**

No migration, `db push`, SQL write, production change, frontend change, localStorage import, backend Map change, AI Core change, subscription change, or payment change is authorized by this document.

No new migration draft is created in this stage. Option A/B remains undecided until PostgreSQL staging metadata is available.

## Safety gates

- [ ] Obtain the staging project ref from the environment owner through an approved channel.
- [ ] Record the production project ref separately, without recording any secret.
- [ ] Confirm staging ref is different from production ref.
- [ ] Confirm staging URL host contains the staging project ref and is not the production URL.
- [ ] Set an explicit local `EZRAB_STAGING_PROJECT_REF` value only in a non-committed shell/session or secret manager.
- [ ] Refuse all linked commands when the expected staging ref is missing or equals the production ref.
- [ ] Do not paste passwords, service-role/secret API keys, access tokens, or database URLs into chat, source files, shell history, or logs.
- [ ] Use a separate staging credential with the minimum required scope.
- [ ] Do not use the production database URL for staging verification.

## Technical access checklist

### 1. Supabase CLI installation

- [ ] Install the official Supabase CLI using the approved company/developer package channel.
- [ ] Verify installation without exposing credentials:

```powershell
supabase --version
Get-Command supabase | Select-Object Name,Source
```

- [ ] Confirm the CLI version is recorded in the verification report.
- [ ] Do not run `supabase db push`, `supabase migration up`, or any migration command.

### 2. CLI authentication

- [ ] Authenticate interactively using the official CLI flow or an approved token provider.
- [ ] Keep the token in the CLI credential store/secret manager; do not assign it to a command-line argument that may enter shell history.
- [ ] Verify account context with a project listing, without printing token contents:

```powershell
supabase projects list
```

- [ ] Confirm the authenticated account is authorized for staging and not merely production-only.

### 3. Staging project identity

- [ ] Confirm the project ref in the approved staging record.
- [ ] Compare the project list entry, staging URL, and expected project name.
- [ ] Confirm production ref is not equal to staging ref.
- [ ] Confirm the project is not marked production in the team inventory.
- [ ] Stop if the ref, URL, or project name is ambiguous.

Read-only identity checks, with placeholders only:

```powershell
$stagingRef = $env:EZRAB_STAGING_PROJECT_REF
if ([string]::IsNullOrWhiteSpace($stagingRef)) { throw 'EZRAB_STAGING_PROJECT_REF is required' }
if ($stagingRef -eq '<PRODUCTION_PROJECT_REF>') { throw 'Ref matches production; refusing to continue' }
supabase projects list
```

The production ref must be supplied out-of-band to the operator; it must not be inferred from a secret or printed in logs.

### 4. Database read-only connection

- [ ] Obtain a staging database connection through the official Supabase connection details flow.
- [ ] Use a dedicated read-only database role or an equivalent metadata-only credential.
- [ ] Keep the password in an interactive prompt, OS credential manager, or approved secret manager.
- [ ] Do not put the password in a URL, PowerShell command text, `.env`, source file, or log.
- [ ] Confirm the connection host/project ref is staging before querying.
- [ ] Confirm the role cannot create, alter, insert, update, delete, truncate, grant, or drop.

Connection smoke test; the password is prompted and not printed:

```powershell
psql --version
psql -W "$env:EZRAB_STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -X -c "select current_database(), current_user, current_schema();"
```

If the approved connection mechanism does not support a safe password prompt, stop and use the organization secret manager or a disposable clone. Do not replace this with an inline password.

### 5. Backup/clone staging

- [ ] Confirm a current staging backup/snapshot exists before any future migration testing.
- [ ] Record backup timestamp, retention, restore owner, and restore test status without recording credentials.
- [ ] Prefer a disposable clone for migration rehearsal and rollback testing.
- [ ] Verify the clone's project ref/URL is different from production and the source staging project.
- [ ] A schema/data dump may be taken for evidence only; it must be written outside the repository or to an approved protected location.

Read-only local dump command, only after staging identity is confirmed:

```powershell
supabase db dump --linked --schema public --file "$env:TEMP\ezrab-staging-public-schema.sql"
```

This command is not to be run until the CLI is explicitly linked to staging. A dump is not a substitute for a restore-tested backup.

### 6. Migration history access

- [ ] Confirm read access to `supabase_migrations.schema_migrations`.
- [ ] Query only version/name/timestamp metadata first; do not modify the table.
- [ ] Reconcile history with local migration filenames.
- [ ] Treat missing history access as a blocker, not as evidence that no migrations exist.

### 7. Schema, FK, index, RLS, and policy access

- [ ] Confirm read access to `information_schema`.
- [ ] Confirm read access to `pg_constraint`, `pg_class`, `pg_attribute`, `pg_index`, `pg_indexes`, and `pg_policies`.
- [ ] Confirm metadata queries return staging rows and do not require elevated write privileges.
- [ ] Capture results as protected evidence with secrets and row data omitted where possible.

## Read-only introspection commands

Run only after every safety gate above is checked and the session is connected to staging.

### Target identity

```sql
select current_database() as database_name,
       current_user as database_role,
       current_schema() as current_schema,
       inet_server_addr() as server_address;
```

### Existing columns and nullability

```sql
select table_name, ordinal_position, column_name, data_type,
       udt_schema, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('projects','project_members','rab_documents',
                     'rab_versions','rab_items','rab_item_components')
order by table_name, ordinal_position;
```

### Explicit `projects.id` type

```sql
select table_schema, table_name, column_name, data_type, udt_schema,
       udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'projects'
  and column_name = 'id';
```

### All foreign keys involving `project_id`

```sql
select tc.table_name,
       kcu.column_name,
       tc.constraint_name,
       ccu.table_schema as referenced_schema,
       ccu.table_name as referenced_table,
       ccu.column_name as referenced_column,
       rc.update_rule,
       rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_schema = tc.constraint_schema
 and kcu.constraint_name = tc.constraint_name
 and kcu.table_name = tc.table_name
join information_schema.constraint_column_usage ccu
  on ccu.constraint_schema = tc.constraint_schema
 and ccu.constraint_name = tc.constraint_name
join information_schema.referential_constraints rc
  on rc.constraint_schema = tc.constraint_schema
 and rc.constraint_name = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and kcu.column_name = 'project_id'
order by tc.table_name, tc.constraint_name;
```

### All primary keys and foreign keys for the compatibility tables

```sql
select tc.table_name, tc.constraint_type, tc.constraint_name,
       kcu.column_name, kcu.ordinal_position
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on kcu.constraint_schema = tc.constraint_schema
 and kcu.constraint_name = tc.constraint_name
 and kcu.table_name = tc.table_name
where tc.table_schema = 'public'
  and tc.table_name in ('projects','project_members','rab_documents',
                        'rab_versions','rab_items','rab_item_components')
  and tc.constraint_type in ('PRIMARY KEY','FOREIGN KEY','UNIQUE')
order by tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position;
```

### Indexes

```sql
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('projects','project_members','rab_documents',
                    'rab_versions','rab_items','rab_item_components')
order by tablename, indexname;
```

### RLS flags

```sql
select n.nspname as schema_name,
       c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('projects','project_members','rab_documents',
                    'rab_versions','rab_items','rab_item_components')
order by c.relname;
```

### RLS policies

```sql
select schemaname, tablename, policyname, permissive, roles,
       cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('projects','project_members','rab_documents',
                    'rab_versions','rab_items','rab_item_components')
order by tablename, policyname;
```

### Migration history

```sql
select version, name
from supabase_migrations.schema_migrations
order by version, name;
```

If this relation is unavailable, report `migration history access unavailable`; do not create it, repair it, or infer history from the absence of rows.

## Required report after access is ready

The next read-only report must include:

- staging identity evidence and how production was excluded;
- exact `projects.id` type from `information_schema.columns`;
- every FK whose source column is `project_id`, including referenced column and delete/update rule;
- complete existing columns, types, defaults, and nullability for the six compatibility tables;
- primary keys, unique constraints, and indexes;
- RLS enabled/forced state;
- exact RLS policy names, commands, roles, `USING`, and `WITH CHECK` expressions;
- migration history versions/names;
- any query that failed due to permissions or unavailable objects.

Only after this report is complete may the team evaluate Option A or Option B. No option may be selected from `PGRST205`, local migration text, naming conventions, or assumptions.

## Current status

- [ ] CLI installed and version recorded.
- [ ] CLI authenticated.
- [ ] Staging ref independently confirmed.
- [ ] Production ref excluded.
- [ ] Read-only database role/credential available.
- [ ] Backup/clone confirmed.
- [ ] Migration history readable.
- [ ] PostgreSQL metadata readable.
- [ ] Introspection executed.

Current outcome: **access readiness checklist prepared; staging metadata not yet verified; not production-ready**.

## Verification attempt — 2026-09-14

The required fail-closed preflight was executed before any remote database command:

- `EZRAB_STAGING_PROJECT_REF` was not set in the current shell.
- Supabase CLI was not found in `PATH`.
- `supabase/config.toml` was not present in the workspace.
- The previously recorded production ref is `ssnjgwegfteuvbxidfvq`.
- Because no staging ref was available to compare against production, no Supabase project listing, link, database connection, or SQL introspection was executed.
- No password, access token, service key, or other credential was printed.

Result: **staging target identity is not yet verifiable in this session; PostgreSQL metadata was not collected; no Option A/B recommendation is permitted**.
