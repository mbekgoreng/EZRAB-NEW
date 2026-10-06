# Final Staging Migration Readiness Gate — Review Only

Tanggal: 2026-09-14 (Asia/Jakarta)  
Target: Supabase staging icemyvldjiewkzzwkjrw  
Scope: gate review saja; tidak ada migration dibuat atau diterapkan

## Guardrails verified

Tidak ada supabase db push, migration up, db reset, supabase start, INSERT, UPDATE, DELETE, ALTER, DROP, CREATE, GRANT, perubahan schema, perubahan migration history, atau perubahan public.projects.id yang dilakukan. Tidak ada secret, token, password, service key, atau database credential yang ditampilkan.

Artefak yang ditinjau:

- docs/durable-project-rab-staging-plan-review-v2.md
- docs/durable-project-rab-live-metadata-review.md
- docs/durable-project-rab-compatibility-audit.md
- supabase/migrations/20260913_auth_membership_foundation.sql
- supabase/migrations/20260913_durable_project_rab_foundation.sql
- supabase/drafts/durable_project_rab_compat_text.sql

## Evidence baseline

Metadata live sebelumnya membuktikan:

- projects.id adalah text PK.
- project_members.project_id adalah text.
- project_members memakai FK komposit (project_id, workspace_id) ke projects(id, workspace_id).
- workspaces.id dan profiles.id adalah uuid.
- Empat tabel RAB belum ada.
- Tabel dasar berisi 0 baris.
- RLS existing hanya policy SELECT membership/self-read.
- Migration history hanya auth_membership_foundation.

## Gate results

| Gate | Result | Evidence / finding |
|---|---|---|
| Live schema identity and type compatibility | PASS | Text project ID, UUID workspace/profile, and existing composite membership FK are verified. |
| Applied migration protection | PASS | auth_membership_foundation is applied; no change was made or proposed to its history. |
| UUID durable migration rejected | PASS | Old migration requires projects.id UUID and is incompatible; it remains unapplied and untouched. |
| No legacy_id in stage one | PASS | v2 explicitly omits projects/rab legacy_id. |
| Backup/restore evidence | FAIL | No snapshot/restore ID, restore test, retention, owner, or restore evidence is available in the reviewed artifacts. |
| Role matrix | PASS (design) / FAIL (implementation) | v2 closes the matrix and defers CLIENT/DIREKSI, but no reviewed SQL policy implements it. |
| RLS auth.uid() and membership | FAIL | Existing RAB tables have no policies; text draft has no RLS statements; old UUID migration only has broad project-member SELECT policies and no required write/lifecycle policies. |
| Composite project/workspace FK | FAIL | v2 requires composite FK, but durable_project_rab_compat_text.sql defines separate project_id and workspace_id FKs for new RAB tables rather than a composite FK. |
| Canonical version model | FAIL | v2 requires rab_items.rab_version_id, one active DRAFT, FINAL immutable, new-version copy, and terminal ARCHIVED; text draft lacks rab_version_id on rab_items and lacks these lifecycle constraints. |
| Revision atomics | FAIL | v2 chooses revision bigint and 409 behavior; text draft has no revision column or atomic revision predicate. |
| FINAL immutability | FAIL | No trigger/policy/API/database enforcement is present in the draft. |
| updated_at consistency | FAIL | Draft supplies defaults but no atomically enforced bump coupled to revision. |
| Constraint/index/policy name conflicts | INCOMPLETE | Existing metadata for current tables was reviewed, but the proposed final object names and lifecycle policy names have not had a dedicated collision review. |
| Static SQL safety | PASS for non-execution | Draft is clearly marked DRAFT ONLY and was not executed; it still cannot be promoted because failed design gates above are material. |

## Failed gates and required resolution

### 1. Backup/restore

Execution cannot proceed until a staging snapshot/restore point is evidenced, restored on a disposable clone, and reconciled with row counts and metadata fingerprints. This review must not claim that evidence exists.

### 2. RLS and role matrix

The conceptual v2 matrix is accepted as the design direction:

- SUPER_ADMIN: all approved actions, with DELETE limited to DRAFT.
- ESTIMATOR: SELECT/INSERT/UPDATE DRAFT/FINALIZE/NEW VERSION/ARCHIVE; no DELETE.
- EDITOR: SELECT and item/component INSERT or DRAFT UPDATE; no lifecycle actions.
- CLIENT and DIREKSI: deferred, no new RAB policy.

A final SQL review must implement SELECT, INSERT, UPDATE, FINALIZE, NEW VERSION, ARCHIVE, and DELETE separately using verified auth.uid(), workspace_members, and project_members. No forged header, localStorage, or client role may appear in the authorization path.

### 3. Composite FK

Every project-scoped RAB row must use project_id text plus workspace_id uuid and a composite reference to projects(id, workspace_id). Separate project-only references are insufficient for the approved isolation model.

### 4. Version/status model

The final design must include rab_items.rab_version_id not null, at most one active DRAFT per document, FINAL immutable, new DRAFT created from FINAL with the next version number, and ARCHIVED terminal read-only behavior.

### 5. Revision

The final design must include revision bigint default 1 on mutable version/item rows. Updates must atomically require expected_revision, increment revision, update updated_at, and return 409 with no mutation when stale. Timestamp-only comparison is not accepted.

### 6. Name collision review

Before any future migration draft is accepted, verify proposed constraint, index, and policy names against pg_constraint, pg_class/pg_indexes, and pg_policies. The current live review does not establish that the future names are collision-free.

## Decision

# BLOCKED — READINESS GATE FAILED

Migration creation is not authorized. The blockers are design/evidence blockers, not a request to modify the database:

1. Backup/restore staging evidence is missing.
2. RLS SQL implementation for the closed role matrix is missing.
3. The draft does not implement the required composite project/workspace FKs.
4. The draft does not implement canonical rab_version_id, DRAFT/FINAL/ARCHIVED lifecycle rules, or FINAL immutability.
5. The draft does not implement atomic revision concurrency and 409 behavior.
6. Future constraint/index/policy name collision review is incomplete.

No compatible migration was created, and no static SQL review of a new migration was performed because the gate failed.
