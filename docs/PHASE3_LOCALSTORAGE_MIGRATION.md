# Phase 3 — localStorage → Supabase migration plan

**Status: DESIGNED, NOT EXECUTED** (no Supabase project yet). The runner below
is defensive: it never deletes local data and is idempotent.

## 1. Key inventory (from codebase grep, 2026-10-08)

### Business data → migrates to Supabase (source of truth becomes the DB)

| localStorage key | Entity | Target table |
|---|---|---|
| `ezrab_prod_projects` | projects | `projects` (+`project_members` for owner) |
| `ezrab_prod_active_project_id` | session pointer | not migrated (re-derived) |
| `ezrab_prod_rab_items` | RAB line items | `rab_items` (`legacy_id` = local id) |
| `ezrab_prod_qto_items` | QTO results | `qto_items` |
| `ezrab_prod_qto_rab_mappings` | QTO→RAB links | folded into `rab_items.qto` refs / `qto_items` |
| `ezrab_prod_calculation_runs` | calc runs | (audit only — kept local) |
| `ezrab_prod_estimate_versions` | estimate versions | `estimate_versions` |
| `ezrab_prod_version_snapshots` | version snapshots | `estimate_versions.snapshot` |
| `ezrab_prod_schedule_tasks` | schedule | `schedule_tasks` |
| `ezrab_prod_work_items` | work items | `work_items` |
| `ezrab_prod_price_overrides` | price overrides | `price_overrides` |
| `ezrab_project_backups` | backups | kept local (explicit user export) |
| `ezrab_project_overrides_v2` | overrides | `price_overrides` |
| `ezrab_project_prices_v2` | price cache | kept local (cache) |
| `ezrab_db_activities` | activity log | `audit_logs` (best-effort) |
| `ezrab_price_audit_v2` | price audit | kept local (derived) |
| `ezrab_gsheets_db_url` / `ezrab_gsheets_last_sync` | external sync config | kept local (per-device) |

### UI preferences / cache → stay in localStorage (never migrate)

`ezrab_theme`, `ezrab_accent`, `ezrab_density`, `ezrab_motion`,
`ezrab_copilot_dock_width`, `ezrab_copilot_pos`, `ezrab_assistant_launcher_hidden`,
`ezrab_onboarding_completed`, `ezrab_lang_v1`, `ezrab_notifications_v1`,
`ezrab_role_v1`, `ezrab_price_audit_v2`, price caches.

## 2. Rules

1. **Never delete local data during migration.** Rollback = clear the
   `ezrab_supabase_migrated_v1` flag; the app falls back to local data.
2. **Idempotent.** Re-running skips rows already migrated (matched by `legacy_id`).
3. **Workspace bootstrap.** First run creates one workspace ("Workspace Utama")
   with the migrating user as `SUPER_ADMIN`, then one `project_members` row
   per project.
4. **No empty-project illusion.** Migration runs to completion (with a progress
   callback) before the UI switches source; on any failure the app keeps
   reading localStorage and surfaces the error. Validation: per-entity counts
   local vs remote must match before flagging complete.
5. **Runs once per user**, on first authenticated session when Supabase is
   enabled. Manual re-run exposed in Settings for recovery.

## 3. Rollback

- App-level: delete `ezrab_supabase_migrated_v1` from localStorage.
- Data stays in both places; the DB rows are namespaced by `legacy_id` so a
  second migration does not duplicate.
- No destructive DB rollback is automated (per Phase 3 constraints).
