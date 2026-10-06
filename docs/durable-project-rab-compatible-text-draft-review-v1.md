# Static SQL Review v1 — Durable Project/RAB Compatible Text Draft

Tanggal: 2026-09-14 (Asia/Jakarta)  
Draft: supabase/drafts/durable_project_rab_compatible_text_v1.sql  
Review mode: static only; draft tidak dijalankan

## Safety result

PASS:

- Tidak ada db push, migration up, reset, start, SQL execution, atau perubahan database.
- Tidak ada applied migration yang diubah.
- public.projects tidak disentuh; projects.id tetap text.
- Draft tidak menambah legacy_id.
- Tidak ada secret, token, password, service key, atau credential.

BLOCKED for execution:

- Final readiness gate tetap BLOCKED karena bukti backup/restore staging belum tersedia.
- Draft ini hanya boleh masuk human SQL review; bukan authorization untuk apply.

## PASS / FAIL / BLOCKED matrix

| Area | Result | Static finding |
|---|---|---|
| Project ID type | PASS | project_id text everywhere; no UUID project FK and no projects alteration. |
| Workspace type | PASS | workspace_id uuid and FK to workspaces(id). |
| New entity IDs | PASS | RAB entity PKs are uuid with gen_random_uuid(). |
| Composite project FK | PASS | project-scoped tables reference projects(id, workspace_id) as a composite FK. |
| Canonical hierarchy | PASS | document → version → item → component; rab_items.rab_version_id is NOT NULL. |
| One active DRAFT | PASS | unique partial index on rab_document_id where status = DRAFT. |
| Status values | PASS | DRAFT, FINAL, ARCHIVED check constraint. |
| FINAL immutable | PASS | lifecycle trigger rejects FINAL business changes; RLS only permits controlled status path. |
| ARCHIVED terminal | PASS | trigger rejects ARCHIVED updates; delete policy permits only DRAFT. |
| New version from FINAL | PASS | source_version_id and trigger require matching FINAL predecessor and next number. |
| created_by | PASS | nullable uuid FK to profiles(id); policy only permits NULL or auth.uid(). |
| legacy_id | PASS | no legacy_id column or index. |
| Revision | PASS | bigint default 1; insert trigger overwrites client value; update trigger rejects client revision changes and increments server-side. |
| Stale update HTTP 409 | PASS with API dependency | SQL cannot emit HTTP; API must conditional-update on expected_revision and map zero affected rows to 409. |
| RLS SELECT | PASS | auth.uid(), workspace_members, project_members, project_id, workspace_id required; CLIENT/DIREKSI excluded. |
| RLS INSERT | PASS | role and membership checks exist for documents, versions, items, components. |
| RLS UPDATE | PASS | DRAFT/lifecycle membership checks exist; FINAL/ARCHIVED mutation blocked by trigger/policy. |
| RLS DELETE | PASS | SUPER_ADMIN-only DRAFT deletes; FINAL/ARCHIVED not deletable. |
| Existing table safety | PASS | fail-closed preflight rejects any existing RAB table; no IF NOT EXISTS reconciliation. |
| Name collision | PASS with preflight | table/index/constraint/policy/function/trigger namespaces are checked and fail closed. |
| Idempotency | PASS | draft makes no unsafe idempotency claim; plain CREATE is intentional and rerun is rejected. |
| Existing RLS/policies | PASS | only new namespaced policies are declared; existing policies are not altered. |
| Updated timestamp | PASS | update trigger sets updated_at atomically with revision. |
| Backup evidence | BLOCKED | execution evidence is intentionally not claimed in this static review. |

## Column and constraint review

- rab_documents: uuid PK; text project_id; uuid workspace_id; nullable created_by; timestamps; composite project FK; workspace FK; one document per project/workspace.
- rab_versions: uuid PK; document/project/workspace composite parent FKs; optional source_version_id; version_number; status; revision; nullable created_by; unique document/version and scoped parent key.
- rab_items: uuid PK; mandatory composite FK to rab_versions through rab_version_id/project_id/workspace_id; numeric non-negative fields; revision; nullable created_by; timestamps.
- rab_item_components: uuid PK; FK to rab_items with cascade; component check; unique item/component/resource key; timestamps.

No existing table is altered. The draft does not change projects, profiles, workspaces, project_members, auth.users, or migration history.

## RLS review

Policy intent is narrow:

- SELECT requires authenticated role, allowed workspace role, matching workspace_members row, and matching project_members row with both project_id and workspace_id.
- INSERT requires the correct role, matching memberships, DRAFT parent where applicable, and created_by NULL or auth.uid().
- UPDATE requires matching membership and DRAFT parent for item/component updates. Version update allows DRAFT-to-FINAL and FINAL-to-ARCHIVED only; the trigger enforces the transition.
- DELETE is limited to SUPER_ADMIN and DRAFT rows. Documents are deliberately not browser-deletable.
- CLIENT and DIREKSI are deferred and receive no new RAB policy.

A human reviewer must still test each policy with real authenticated sessions, not service-role calls.

## Status-transition review

Allowed transitions:

- New version: DRAFT only.
- DRAFT → DRAFT for ordinary edits.
- DRAFT → FINAL for finalize.
- FINAL → ARCHIVED for archive.
- No transition out of FINAL except ARCHIVED.
- No transition out of ARCHIVED.
- Items/components can be inserted or updated only while their version is DRAFT.

## Atomic concurrency review

The draft chooses conditional revision updates, supported by database triggers:

1. API supplies expected_revision as a predicate, never as an arbitrary new revision.
2. The database trigger rejects a client-provided revision change and sets revision = old revision + 1.
3. The same trigger sets updated_at = now().
4. Concurrent writers cannot both match the same revision; one succeeds and the other affects zero rows.
5. API maps zero affected rows to HTTP 409 CONCURRENCY_CONFLICT.

This requires the API implementation and an authenticated two-writer test before execution approval.

## Static concerns requiring human review

- Verify exact PostgreSQL behavior of composite FK parent unique keys and self-referencing source_version_id.
- Verify trigger ordering and policy behavior on status transitions in a disposable clone.
- Confirm role semantics of workspace_members and project_members in real authenticated tests.
- Confirm chosen object names remain collision-free immediately before apply.
- Decide whether version copy/snapshot is implemented in a reviewed API transaction or future RPC; the draft enforces source FINAL identity but does not copy item rows itself.
- Confirm numeric precision/scale and item-number uniqueness rules with product/domain owners.
- Provide backup/restore evidence before any apply decision.

## Rollback concept

No rollback was executed or embedded as an automatic destructive action. A future reviewed rollback uses an approved restore point or removes only newly-created RAB objects in reverse dependency order on an isolated staging target. It must never cast/replace projects.id, modify auth_membership_foundation, or edit migration history.

## Final static-review status

# READY FOR HUMAN SQL REVIEW

The draft addresses the prior structural blockers in text-ID compatibility, composite FK, canonical versioning, lifecycle protection, RLS boundaries, and revision control. This status does not authorize execution; backup/restore evidence and human SQL review remain mandatory.
