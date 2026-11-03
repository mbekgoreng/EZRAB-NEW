# EZRAB Continuous User Learning — Phase B: Data Contracts, Ownership & Memory Policy

**Status:** Implemented locally as a pure domain foundation. **Not production.**
**Scope of this document:** what Phase B actually built, the contracts it enforces, and what remains blocked. Nothing in this document claims a live memory system exists.

---

## 1. Implemented modules

All modules live in `api/_lib/learning/`, are plain ESM JavaScript in the existing `api/_lib` style, and are **pure** (no I/O, no database, no network). Tests: `src/test/learningContracts.test.ts` (40 tests).

| File | Purpose | Key contracts / behavior |
|---|---|---|
| `memoryContracts.js` | Stable constants + structural contracts | Scope/category/lifecycle enums; per-scope lifecycle sets; transition matrix; retrievable states; closed source-type set; trusted actor validation; ownership matrix validation; deterministic validation-result shape `{ ok, code, message, field, rule }` (frozen). |
| `memoryPolicy.js` | The single scope-resolution authority | `resolveMemoryScope` derives scope + ownership from trusted actor + authorization evidence only; extractor/client fields are never read; fail-closed on every branch; `validateWorkspaceEvidence` / `validateProjectEvidence`; global-governance actor contract (`canActAsGlobalGovernance`, `authorizeGlobalPublication`). Reuses `normalizeMembership` / `isMembershipActive` from `api/_lib/billingAuthorization.js` (that file is unchanged). |
| `memoryValidation.js` | Deterministic record validation | `validateMemoryRecord` with a fixed check order (scope → ownership → category → lifecycle → provenance → confidence → timestamps → classification → content); `validateProvenance`; `validateConfidence`; `validateLifecycleTransition`; `isRetrievableRecord`. Error messages never contain record/source content. |
| `memoryPermissions.js` | Memory permission contracts | `memory:read`, `memory:write`, `memory:review`, `memory:delete`, `memory:publish_global`; role → permission map over the existing workspace role enum (imported from `billingAuthorization.js`). `memory:publish_global` is granted to **no** workspace role, deliberately. |

Phase B creates **no** API routes, **no** database adapters, **no** migrations, **no** workers, **no** UI, and **no** extraction. It does not modify `billingAuthorization.js`, `security.js`, any route, the gateway, billing, or the project model.

## 2. Four scope definitions

| Scope | Meaning | Owner key | Who may cause records to exist |
|---|---|---|---|
| `PERSONAL` | Knowledge that improves one specific user's experience (preferences, recurring instructions, corrections) | `userId` | The authenticated user themselves, via policy-checked writes derived from their own actor context |
| `WORKSPACE` | Shared, authorized workspace knowledge (SOPs, internal standards, approved templates) | `workspaceId` | Workspace members with `memory:write`; candidates default to `PENDING_REVIEW` |
| `PROJECT` | Persistent context of one project inside one workspace (specs, decisions, revisions) | `workspaceId` + `projectId` | Members with verified workspace **and** project authorization |
| `GLOBAL` | Curated knowledge safe across the whole user base | none (no tenant owner) | Only a future governance service; never ordinary users or extractors |

## 3. Ownership matrix

Enforced by `validateOwnership` (`memoryContracts.js`) and by construction in `resolveMemoryScope`, which never accepts ownership from the caller:

| Scope | `userId` | `workspaceId` | `projectId` |
|---|---|---|---|
| PERSONAL | **Required** | Forbidden | Forbidden |
| WORKSPACE | Forbidden (as owner) | **Required** | Forbidden |
| PROJECT | Forbidden (as owner) | **Required** | **Required** |
| GLOBAL | Forbidden | Forbidden | Forbidden |

For WORKSPACE and PROJECT records the acting user's identity still exists — in the trusted actor context, not in the record's ownership key. IDs must be non-empty normalized strings; empty/blank/non-string IDs are rejected (`INVALID_OWNERSHIP`).

**Scope-resolution behavior** (`resolveMemoryScope`, deterministic):

1. Actor must validate as a USER principal → otherwise `REQUIRES_AUTHENTICATION`.
2. Requested scope must be a known scope → otherwise `UNRESOLVED_SCOPE` (no defaulting, ever).
3. `GLOBAL` from a user principal → `GLOBAL_SCOPE_FORBIDDEN`.
4. `PERSONAL` → ownership derived from the actor; a simultaneous workspace/project target is ambiguous and rejected.
5. `WORKSPACE` → target workspace + valid workspace evidence required; ownership derived from the proven workspace.
6. `PROJECT` → target workspace + project + both evidence objects required; ownership derived from the proven pair.

## 4. Trusted actor contract

Defined in `memoryContracts.js` (`validateTrustedActor` / `validateUserActor`):

- `principalType` must be explicit: `USER` or `SERVICE`. A SERVICE principal is a valid principal but **cannot** act as a user (`validateUserActor` rejects it — no masquerading).
- `identityVerified` must be exactly boolean `true`.
- `identityProvider` must be a recognized provider; the only recognized provider is `SUPABASE_AUTH` (the server-side verified Supabase JWT path that already exists in `api/_lib/supabaseAuth.js` / `security.js`).
- USER requires a non-empty normalized `userId`; SERVICE requires a non-empty `serviceId`.
- Nothing client-supplied can satisfy this contract: header-shaped objects (`x-user-id`, `x-user-role`, `x-workspace-id`), role claims, or localStorage identities have none of the required verified fields and always fail.

Phase B defines this contract only. It does **not** activate authentication: the live app still runs with `AUTH_ENABLED=false`, and no production identity exists yet.

## 5. Authorization evidence contract

Authorization evidence is an **explicit input from a trusted server caller** (`memoryPolicy.js`). The policy never queries a database and never fabricates membership verification. Evidence that is merely a client assertion is rejected: the `source` field must be exactly `SERVER_MEMBERSHIP_LOOKUP`.

**Workspace evidence** (`validateWorkspaceEvidence`) requires:

- a raw `workspace_members` record (normalized via `billingAuthorization.normalizeMembership`, so status/role semantics match billing exactly),
- the record's user to be the actor, and its workspace to be the requested target,
- membership status `ACTIVE` (SUSPENDED / REVOKED always fail),
- the evidence's `permission` to equal the permission being evaluated (decision metadata consistency), and `denied: true` to be absent/false,
- the member's role to hold that memory permission (`memoryPermissions.js`): SUPER_ADMIN = read/write/review/delete; DIREKSI, ESTIMATOR, EDITOR = read/write; CLIENT = none.

**Project evidence** (`validateProjectEvidence`) requires all of the above **plus** `projectAccess === true` from the server lookup, and the evidence's `projectId` / `workspaceId` binding to match the requested target pair. A project ID supplied in a request is never, by itself, proof of anything.

## 6. Provenance model

Every memory record must carry source metadata (`validateProvenance`); records without verifiable provenance are rejected (`SOURCE_NOT_VERIFIABLE`). Fields: `sourceType` (closed set: `USER_INSTRUCTION`, `USER_CORRECTION`, `CONVERSATION`, `DOCUMENT`, `PROJECT_ACTIVITY`, `RAB_REVISION`, `WORKSPACE_ACTIVITY`, `EXPLICIT_MEMORY_REQUEST`, `SYSTEM_OBSERVATION`, `GOVERNANCE_IMPORT`), `sourceId` (reference, not raw content), `sourceVersion`, `sourceCreatedAt`, `capturedAt`, `origin`, `evidenceReference`, `contentHash` (optional), `sourceVisibility`, `validationStatus` (`UNVERIFIED` / `VERIFIED` / `REJECTED`). Raw conversation content is not stored by these contracts, and validation messages never echo source content.

Confidence is a bounded number in [0, 1]; NaN, Infinity, and out-of-range values are rejected (`INVALID_CONFIDENCE`). Freshness is carried as metadata (`createdAt`, `updatedAt`, optional `expiresAt`); **no expiry rules are invented in Phase B** — retention/expiry policy is a later-phase decision.

## 7. Lifecycle and transitions

States: `DRAFT`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `PUBLISHED`, `ARCHIVED`, `DELETED` — but not every scope uses every state:

| Scope | Allowed states | Retrievable when |
|---|---|---|
| PERSONAL | DRAFT, APPROVED, ARCHIVED, DELETED | APPROVED |
| WORKSPACE | DRAFT, PENDING_REVIEW, APPROVED, REJECTED, ARCHIVED, DELETED | APPROVED |
| PROJECT | DRAFT, PENDING_REVIEW, APPROVED, REJECTED, ARCHIVED, DELETED | APPROVED |
| GLOBAL | APPROVED, PUBLISHED, ARCHIVED | PUBLISHED |

Transition matrix (`LIFECYCLE_TRANSITIONS`): DRAFT → PENDING_REVIEW / APPROVED / REJECTED / DELETED; PENDING_REVIEW → APPROVED / REJECTED / DELETED; APPROVED → PUBLISHED / ARCHIVED / DELETED; PUBLISHED → ARCHIVED; ARCHIVED → DELETED; REJECTED → (none); DELETED → (none). A transition must satisfy **both** the matrix and the target state's validity for the record's scope (so a PERSONAL record can never become PUBLISHED). REJECTED and DELETED records are never retrievable, and there is no transition out of them — no review bypass exists.

## 8. Validation outcomes

Deterministic, machine-readable codes (`VALIDATION_CODES`): `VALID`, `INVALID`, `INVALID_OWNERSHIP`, `INVALID_PROVENANCE`, `INVALID_CONFIDENCE`, `INVALID_TIMESTAMP`, `INVALID_TRANSITION`, `REQUIRES_AUTHENTICATION`, `REQUIRES_WORKSPACE_AUTHORIZATION`, `REQUIRES_PROJECT_AUTHORIZATION`, `REQUIRES_REVIEW`, `GLOBAL_SCOPE_FORBIDDEN`, `SOURCE_NOT_VERIFIABLE`, `UNRESOLVED_SCOPE`. Every result is a frozen `{ ok, code, message, field, rule }`; messages are generic and safe.

## 9. Security assumptions

- These contracts assume a **future trusted server caller** supplies the actor context and evidence after verifying a Supabase JWT server-side and reading membership from the database itself. The contracts cannot detect a caller that lies about having done so — that boundary is architectural, and it does not exist in the live system yet.
- Identity headers (`x-user-id`, `x-user-role`, `x-workspace-id`) are treated as untrusted request data everywhere in this design; `x-workspace-id` may only ever be a *requested target* (the same convention as `billingAuthorization.requestedWorkspaceId`).
- LLM/extractor output is untrusted input: it cannot assign scope, ownership, permission, or publication state. `resolveMemoryScope` does not read candidate/extractor fields at all.
- Memory is never authoritative for deterministic engineering data (AHSP codes/coefficients, official prices, quantity/RAB arithmetic). These contracts provide no write path into any engineering registry.

## 10. What is implemented, interface-only, or blocked

- **Implemented (locally, pure domain):** contracts, ownership validation, scope-resolution policy, evidence contracts, permission contracts, lifecycle matrix, record validation, unit tests.
- **Interface-only:** the evidence objects and permission names are contracts awaiting a real server caller; the store/database layer exists only as the design in §11. The in-repo precedents for later phases are the credit ledger's explicitly-labeled dev/test-only in-memory store and the invitations flow's SECURITY DEFINER write pattern — neither is reused as live infrastructure here.
- **Simulated:** nothing in Phase B is simulated; there is no store at all in this phase.
- **Blocked by Phase 5.4 prerequisites** (same program as billing): (1) verified Supabase project state and applied migrations, (2) owner decision to activate authenticated identity (`AUTH_ENABLED`) with verified server-side sessions, (3) a persistent membership read-path/adapter, (4) verified provider tariffs before any LLM extraction is costed or billed. Until then, no memory may be written or read in production, and no route may call these contracts with real user data.

## 11. Future database design — DESIGN ONLY — NOT APPLIED

> **DESIGN ONLY — NOT APPLIED.** No migration file was created in Phase B, nothing below exists in any Supabase project, and no statement here may be read as describing current database state. A future phase needs a separate owner-approved migration.

Conventions assumed from the existing schema: `uuid` PKs defaulting to `gen_random_uuid()`, `timestamptz` timestamps, RLS enabled on every table, writes only via service-role / SECURITY DEFINER functions (mirroring the invitations pattern), reads scoped by RLS to the owner/membership.

### `learning_events` — normalized learning-event metadata (source references, not raw content)
- **PK:** `id uuid`. **Ownership columns:** `actor_user_id uuid NOT NULL`, `workspace_id uuid NULL`, `project_id uuid NULL` (both FK → `workspaces` / `projects`).
- **Scope constraints:** CHECK mirroring the §3 matrix for the event's declared scope; `scope_type` enum (PERSONAL/WORKSPACE/PROJECT/GLOBAL).
- **Key columns:** `event_type`, `source_type`, `source_reference`, `permission_context jsonb`, `consent_status`, `processing_status`, `idempotency_key`, `data_classification`, `occurred_at`.
- **Indexes:** UNIQUE (`actor_user_id`, `idempotency_key`); (`workspace_id`, `occurred_at`); (`processing_status`, `occurred_at`).
- **RLS intent:** insert via server only; select limited to the actor and authorized workspace admins. **Retention:** events are metadata; retention window is an owner/legal decision, not set here.

### `memory_records` — active structured memories
- **PK:** `id uuid`. **Ownership columns:** `user_id uuid NULL`, `workspace_id uuid NULL`, `project_id uuid NULL` (FKs → `profiles` / `workspaces` / `projects`).
- **Scope constraints:** CHECK enforcing exactly the §3 matrix per `scope_type` (e.g. PERSONAL ⇒ `user_id IS NOT NULL AND workspace_id IS NULL AND project_id IS NULL`; PROJECT ⇒ both workspace and project NOT NULL and user NULL; GLOBAL ⇒ all three NULL).
- **Key columns:** `category`, `content`, `normalized_content`, `confidence numeric(3,2)` with CHECK 0..1, `verification_status`, `data_classification`, `status` (lifecycle), `source_*` provenance columns, `superseded_by uuid NULL` (FK → self), `created_at`, `updated_at`, `last_used_at`, `expires_at`.
- **Indexes:** (`scope_type`, `user_id`) partial where PERSONAL; (`workspace_id`, `status`); (`project_id`, `status`); (`normalized_content`) hash/trgm candidate for scope-internal dedup only — dedup must never cross tenants.
- **RLS intent:** PERSONAL → owner only; WORKSPACE → active members, role-gated writes; PROJECT → active members with project access; GLOBAL → published rows readable by all authenticated users, writes governance-only.
- **Deletion:** hard delete must cascade to versions/embeddings per the program's deletion-propagation requirement; soft state `DELETED` is the domain-level marker until then.

### `memory_versions` — history of every record change
- **PK:** `id uuid`; FK `record_id → memory_records` ON DELETE CASCADE. **Columns:** full prior field snapshot (or field-level diff), `change_type` (CREATE/UPDATE/CORRECT/SUPERSEDE/DELETE), `actor_user_id`, `reason`, `created_at`. **Indexes:** (`record_id`, `created_at`). **RLS:** same visibility as the parent record. **Retention:** follows the parent record's deletion decision.

### `memory_access_audit` — reads/writes/updates/deletes/admin access
- **PK:** `id uuid`. **Columns:** `record_id` (FK, nullable for denied attempts), `actor_user_id`, `workspace_id`, `action`, `outcome_code` (the §8 codes), `created_at`. Must **not** store memory content. **Indexes:** (`actor_user_id`, `created_at`), (`workspace_id`, `created_at`). **RLS:** server insert only; select for workspace owner/auditor roles.

### `learning_jobs` — asynchronous learning tasks
- **PK:** `id uuid`. **Columns:** `job_type` (REALTIME_CAPTURE / SESSION_SUMMARY / DAILY_MERGE / WEEKLY_EVAL / MONTHLY_RETENTION …), `status` enum (PENDING/RUNNING/COMPLETED/RETRY/FAILED/CANCELLED), `idempotency_key`, `attempts`, `max_attempts`, `dead_lettered_at`, `payload jsonb` (references only), `workspace_id`/`project_id` nullable FKs, `scheduled_at`, `created_at`, `updated_at`.
- **Indexes:** UNIQUE (`idempotency_key`); (`status`, `scheduled_at`). **RLS:** no client access; server/worker only.

### `global_knowledge_candidates` — proposed global knowledge awaiting governance
- **PK:** `id uuid`. **Columns:** `candidate_state` (CANDIDATE/PRIVACY_CHECK/SOURCE_VALIDATION/QUALITY_REVIEW/APPROVED/REJECTED), `content`, `source_type`, `source_reference`, `origin_scope` (which scope it was proposed from — **without** tenant identifiers that would leak the origin tenant), `privacy_classification`, `reviewer_user_id`, `review_notes`, `created_at`, `updated_at`. **RLS:** governance roles only; never readable by ordinary users. Rejected candidates are not retrievable as knowledge.

### `global_knowledge_records` — approved, published global knowledge
- **PK:** `id uuid`; FK `candidate_id → global_knowledge_candidates`. **Columns:** `content`, `source_reference`, `verification_status`, `status` (APPROVED/PUBLISHED/ARCHIVED), `published_at`, `published_by`. **RLS:** authenticated users may select PUBLISHED rows only; writes governance-only.

### `memory_feedback` — user corrections and explicit memory preferences
- **PK:** `id uuid`; FK `record_id → memory_records` (nullable for general feedback). **Columns:** `actor_user_id`, `feedback_type` (CORRECTION/DELETION_REQUEST/OPT_OUT/OPT_IN/PREFERENCE), `details` (user-supplied, treated as content — access-scoped), `status`, `created_at`, `resolved_at`. **RLS:** users see their own; workspace-scoped feedback visible per role policy.

## 12. Function-ceiling constraint

The Vercel Hobby ceiling for this project is already fully occupied (11 function files + middleware = 12). Phase B added **no** route files and changed no routing. Any future runtime memory API requires a separately approved route-consolidation design (e.g. folding memory actions into an existing `[action]`-style handler). That decision is not made here.

## 13. Explicit non-goals of Phase B

Not implemented, by design: persistence and database adapters; migration files; authentication activation; API endpoints; gateway integration; LLM or deterministic extraction; deduplication/conflict engines; retrieval; schedulers/workers/queues; embeddings/vector search; global governance service and publication; memory management UI; billing for learning; any change to billing, AHSP/engineering data, the project model, or `Sidebar.tsx`.
