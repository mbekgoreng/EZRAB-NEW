# Pre-migration compatibility drafts

These files are design drafts only. They have **not** been applied, pushed, or executed against any database.

- `pre_migration_compat_text.sql`: use only after PostgreSQL metadata proves `public.projects.id` is `text`.
- `pre_migration_compat_uuid.sql`: use only after PostgreSQL metadata proves `public.projects.id` is `uuid`.

Both drafts intentionally stop on an unexpected existing shape. They do not cast, rename, replace, or delete existing project IDs. The rollback sections are planning templates: because additive columns/tables may receive data, rollback requires backup and reconciliation approval before any `DROP` or constraint removal.
