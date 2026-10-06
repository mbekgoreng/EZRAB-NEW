# Audit dan Rancangan Kompatibilitas Durable Project/RAB

Tanggal: 2026-09-14

Status: **laporan dan draft saja**. Tidak ada SQL, migration, `db push`, `db reset`, atau perubahan schema yang dijalankan.

## Batasan dan bukti

Bukti yang digunakan:

1. `20260913_auth_membership_foundation.sql` dari repository.
2. `20260913_durable_project_rab_foundation.sql` dari repository.
3. Kondisi staging yang dikonfirmasi: `public.projects.id` bertipe `text`, auth foundation sudah diterapkan, dan durable migration berhenti pada preflight UUID.

Kondisi staging tersebut digunakan sebagai fakta yang diberikan. Laporan ini tidak mengklaim bahwa seluruh metadata staging telah di-query ulang pada tahap ini.

## Kontrak tipe data dari auth foundation

| Objek | Kolom | Tipe | Constraint/referensi |
|---|---|---|---|
| `profiles` | `id` | `uuid` | PK, FK ke `auth.users(id)` |
| `workspaces` | `id` | `uuid` | PK, default `gen_random_uuid()` |
| `workspace_members` | `workspace_id` | `uuid` | FK ke `workspaces(id)` |
| `workspace_members` | `user_id` | `uuid` | FK ke `profiles(id)` |
| `project_members` | `project_id` | `text` | bagian PK, FK komposit ke `projects(id, workspace_id)` |
| `project_members` | `workspace_id` | `uuid` | bagian FK komposit ke `projects(id, workspace_id)` |
| `project_members` | `user_id` | `uuid` | FK ke `profiles(id)` |
| `projects` | `id` | `text` | PK, bagian unique `(id, workspace_id)` |
| `projects` | `workspace_id` | `uuid` | FK ke `workspaces(id)` |

## Audit durable migration

The durable migration assumes or creates:

- `projects.id uuid`: incompatible with the existing `projects.id text`.
- `projects.created_by uuid`: compatible with `profiles.id uuid`, but absent from auth foundation and unsafe as immediate `NOT NULL` for existing projects.
- `projects.legacy_id text`: compatible as an additive nullable column.
- `rab_documents.project_id uuid`, `rab_versions.project_id uuid`, and `rab_items.project_id uuid`: incompatible with `projects.id text`.
- RAB entity IDs (`rab_documents.id`, `rab_versions.id`, `rab_items.id`, `rab_item_components.id`) as `uuid`: compatible because these are new entity identifiers and do not replace the project ID.
- `created_by uuid` on RAB tables: compatible with `profiles.id uuid`; nullable-first/backfill is safer if an existing RAB table already contains rows.
- `workspace_id uuid`: compatible with `workspaces.id uuid`, but orphan rows and existing constraint names must be checked before adding FKs.
- `rab_item_components.rab_item_id uuid`: compatible with `rab_items.id uuid`.

## Required compatible type map

| Reference | Required type | Reason |
|---|---|---|
| `projects.id` | `text` | Existing primary key must not change. |
| `project_members.project_id` | `text` | Existing auth foundation FK/PK contract. |
| `rab_documents.project_id` | `text` | FK to `projects.id`. |
| `rab_versions.project_id` | `text` | FK to `projects.id`. |
| `rab_items.project_id` | `text` | FK to `projects.id`. |
| `rab_documents.id`, `rab_versions.id`, `rab_items.id`, `rab_item_components.id` | `uuid` | New entity IDs; no replacement of project ID. |
| `rab_* .rab_document_id` | `uuid` | FK to `rab_documents.id`. |
| `rab_item_components.rab_item_id` | `uuid` | FK to `rab_items.id`. |
| Every `created_by` | `uuid` | FK to `profiles.id`; nullable until approved backfill. |
| Every `workspace_id` | `uuid` | FK to `workspaces.id`. |

## Conflicts and handling

1. **Project ID type:** remove the durable UUID preflight and replace it with a text preflight. Never cast or replace `projects.id`.
2. **Existing auth tables:** `project_members` already uses text project IDs. The compatible durable design must not recreate it with UUID.
3. **Existing `projects` columns:** `client_name`, `legacy_id`, and `created_by` may be absent. Add them nullable; do not add `created_by NOT NULL` before mapping existing projects to profiles.
4. **Existing RAB tables:** `create table if not exists` does not reconcile an existing table. If any RAB table exists with a different type, FK, nullability, or policy, stop for manual reconciliation.
5. **Unique constraints:** the proposed `(workspace_id, legacy_id)` unique index must be created only after checking duplicate non-null pairs. Existing primary/unique constraints must not be replaced.
6. **Foreign keys:** before adding each FK, check orphan counts and constraint-name collisions. Use the exact type map above.
7. **RLS:** auth foundation enables RLS on `projects` and `project_members` and provides member-read policies. RAB policies must use text `project_id` joins and must not overwrite same-named policies. Existing policy definitions require inventory first.
8. **Timestamps:** preserve existing timestamp types/defaults. Add `updated_at` only if absent; do not rewrite existing timestamp data.

## Draft design

`supabase/drafts/durable_project_rab_compat_text.sql` is an additive candidate only. It:

- preflights `projects.id`, `profiles.id`, `workspaces.id`, and `project_members` types;
- adds missing project attributes as nullable;
- uses text for every RAB `project_id`;
- uses UUID only for new RAB entity IDs and user/profile IDs;
- declares every new RAB `created_by` as nullable `uuid` with an FK to `profiles(id)`;
- checks duplicate legacy IDs and orphan rows before constraints;
- refuses to reconcile an already-existing RAB table with an unexpected shape;
- does not change `projects.id`, remove migration history, or replace existing migrations;
- leaves `created_by NOT NULL` and policy reconciliation as explicit post-backfill gates;
- includes a manual rollback plan, with no automatic destructive rollback.

The draft is not a final migration and must not be applied without a fresh staging metadata export and review.

## Approval gates remaining

- Confirm the full staging metadata for all six tables against the required type map.
- Decide the owner/mapping for `created_by` on existing projects and any existing RAB rows.
- Review existing RAB tables, constraint names, indexes, and policies.
- Confirm duplicate/orphan checks are empty.
- Approve RLS policy expressions and write permissions separately.
- Approve backup and rollback evidence on staging.

No Option B UUID conversion is proposed. The compatible design is **Option A semantics** because staging has explicitly established `projects.id text`; the project ID remains text and is never replaced.
