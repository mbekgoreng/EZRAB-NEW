/**
 * MASTER PRICING §4.1 — DETERMINISTIC AUTHORIZATION LOGIC (pure module).
 * ======================================================================
 *
 * STATUS: LOCAL LOGIC ONLY. Server-side / RLS / API enforcement is BLOCKED
 * infrastructure (§2.4.7, re-verified 2026-11-16):
 *   - `AUTH_ENABLED = false` hardcoded in src/App.tsx:32 (not an env var);
 *   - frontend-only until the VPS is bought (owner decision 2026-10-18);
 *   - RLS migrations exist in the repo but are headed NOT APPLIED;
 *   - no master/AHSP/resource/price-history tables exist in Postgres;
 *   - no price API endpoint exists (api/ and server/api/);
 *   - Vercel Hobby function quota is 12/12 (11 handlers + middleware).
 * This module NEVER claims enforcement. It answers ONE question, purely:
 * "given a VERIFIED identity, is this global master operation allowed?"
 *
 * Identity verification itself (JWT → user → global-admin lookup) happens
 * server-side and DOES NOT EXIST YET. This module takes the verified
 * identity as INPUT. Constructing an authenticated identity from client
 * claims is forbidden — the S7 pattern (src/test/s7IdentityFailClosed):
 * the client never sends x-user-id / x-user-role, and no header the
 * client sends can mint an admin. Until the server exists, the only
 * honest local identity is `currentLocalIdentity()` = anonymous, and
 * every global write is DENIED.
 *
 * FAIL-CLOSED: any identity that is not (authenticated AND a global
 * admin) is denied for every write. Malformed/unknown identities are
 * denied. Demo PIN roles are UX only, never authorization. The write
 * PATH never widens access: an AHSP edit, an import, an API call, or a
 * project override can never authorize a global write (Decision A).
 *
 * GLOBAL ADMIN MODEL — DECISION (§4, recorded here and in
 * supabase/migrations/20261116_master_price_governance.sql):
 *   `global_admins` — a SEPARATE TABLE, not a role in workspace_members.
 *   Reasons (see GLOBAL_ADMIN_MODEL_RATIONALE):
 *   1. workspace_members.role is PER-WORKSPACE; master prices are GLOBAL.
 *      A global price admin need not belong to any workspace, and
 *      membership in workspace A must not imply authority over the
 *      global price DB used by workspace B.
 *   2. SUPER_ADMIN in workspace_members already means "workspace
 *      super-admin" (20261008 policies use it for workspace management).
 *      Reusing it for global pricing would conflate two authorities and
 *      silently grant global price power to every workspace super-admin.
 *   3. A separate table gives the grant its own lifecycle (granted_by,
 *      granted_at, revoked_at, reason) and its own audit trail, without
 *      touching workspace membership.
 *   4. RLS enforcement mirrors the existing helper pattern:
 *      `ezrab_is_global_admin()` next to `ezrab_can_write_project()`.
 *   Rejected alternative: a new role value in workspace_members.role —
 *   simpler, but wrong scope (see 1–2). Also rejected: a boolean on
 *   profiles — mixes identity with authorization and has no audit trail.
 */

export const SERVER_ENFORCEMENT_STATUS = 'BLOCKED' as const;

/** The global-admin model decision (§4). Pinned by tests. */
export const GLOBAL_ADMIN_MODEL = 'SEPARATE_TABLE' as const;

export const GLOBAL_ADMIN_MODEL_RATIONALE: readonly string[] = [
  'workspace_members.role is per-workspace; master prices are global — a global price admin need not belong to any workspace',
  'SUPER_ADMIN in workspace_members already means workspace super-admin (20261008); reusing it would conflate two authorities and silently grant global price power to every workspace super-admin',
  'a separate global_admins table gives the grant its own lifecycle (granted_by, granted_at, revoked_at, reason) and audit trail',
  'RLS enforcement mirrors the existing helper pattern: ezrab_is_global_admin() next to ezrab_can_write_project()',
];

/** §4.1 — every operation that writes the global master database. */
export type MasterPriceOperation =
  | 'CREATE_MASTER_ITEM'
  | 'EDIT_MASTER_ITEM'
  | 'EDIT_MASTER_PRICE'
  | 'DEACTIVATE_MASTER_ITEM'
  | 'PUBLISH_PRICE_UPDATE'
  | 'ROLLBACK_PRICE_CHANGE'
  | 'APPROVE_ALIAS'
  | 'APPROVE_RECONCILIATION'
  | 'CHANGE_CLASSIFICATION';

export const MASTER_PRICE_WRITE_OPERATIONS: readonly MasterPriceOperation[] = [
  'CREATE_MASTER_ITEM',
  'EDIT_MASTER_ITEM',
  'EDIT_MASTER_PRICE',
  'DEACTIVATE_MASTER_ITEM',
  'PUBLISH_PRICE_UPDATE',
  'ROLLBACK_PRICE_CHANGE',
  'APPROVE_ALIAS',
  'APPROVE_RECONCILIATION',
  'CHANGE_CLASSIFICATION',
];

/**
 * MASTER PRICING §12 — AHSP version operations (§11 BLOCKED #2).
 *
 * The §4 enum covered MASTER PRICE writes only, so
 * `ahspVersionWriteGate()` reused EDIT_MASTER_PRICE for clone /
 * publish / rollback / direct-edit of AHSP versions — the WRONG
 * operation in the decision and in any audit trail. These four ops are
 * the AHSP-version counterparts. They live in a SEPARATE list (the
 * 9-op master list is pinned by §4 tests and stays intact);
 * `GlobalWriteOperation` is the union used by the authorizer.
 *
 * SQL parity: `supabase/migrations/20261116_master_price_governance.sql`
 * (§12) records the same four values in the
 * `ahsp_version_history.operation` CHECK constraint. Keep them in sync
 * — the §12 suite pins the TS list; the migration header names it.
 */
export type AhspVersionOperation =
  | 'CLONE_AHSP_VERSION'
  | 'PUBLISH_AHSP_VERSION'
  | 'ROLLBACK_AHSP_VERSION'
  | 'EDIT_AHSP_ACTIVE';

export const AHSP_VERSION_WRITE_OPERATIONS: readonly AhspVersionOperation[] = [
  'CLONE_AHSP_VERSION',
  'PUBLISH_AHSP_VERSION',
  'ROLLBACK_AHSP_VERSION',
  'EDIT_AHSP_ACTIVE',
];

/** Every operation that writes global pricing data (master + AHSP versions). */
export type GlobalWriteOperation = MasterPriceOperation | AhspVersionOperation;

/**
 * Reads are NOT gated: master prices are public reference data already
 * shipped in the client bundle (priceMaster.generated.ts). The gate is
 * on WRITES. (When the server exists, reads stay open to authenticated
 * users — see the migration's SELECT policies.)
 */
export type MasterPriceReadOperation = 'READ_MASTER_PRICE' | 'READ_MASTER_HISTORY';

/**
 * A VERIFIED identity — produced server-side only (JWT → auth.users →
 * global_admins lookup). The client must never construct the
 * `authenticated` variant from its own claims; doing so would be
 * exactly the client-side bypass §4.1 forbids.
 */
export type MasterPriceIdentity =
  | { kind: 'anonymous' }
  | { kind: 'demo'; role: string }
  | { kind: 'authenticated'; userId: string; isGlobalAdmin: boolean };

export type AuthorizationDenialCode =
  | 'DENIED_NOT_AUTHENTICATED'
  | 'DENIED_DEMO_ROLE'
  | 'DENIED_NOT_GLOBAL_ADMIN'
  | 'DENIED_MALFORMED_IDENTITY'
  | 'DENIED_SELF_APPROVAL'
  | 'DENIED_WRONG_CHANNEL';

export interface AuthorizationDecision {
  allowed: boolean;
  code: 'ALLOWED' | AuthorizationDenialCode;
  reason: string;
  operation: GlobalWriteOperation | MasterPriceReadOperation;
}

function deny(
  operation: GlobalWriteOperation | MasterPriceReadOperation,
  code: AuthorizationDenialCode,
  reason: string,
): AuthorizationDecision {
  return { allowed: false, code, reason, operation };
}

/**
 * The honest local identity TODAY: there is no authentication
 * (AUTH_ENABLED=false), so there is no authenticated user and no admin.
 * Every global write authorized against this identity is DENIED.
 * When the server exists, the server builds the real identity from the
 * verified JWT — this function is then replaced by the server-side
 * identity resolver, never by a client-side claim.
 */
export function currentLocalIdentity(): MasterPriceIdentity {
  return { kind: 'anonymous' };
}

export function isMasterPriceWriteOperation(
  operation: string,
): operation is MasterPriceOperation {
  return (MASTER_PRICE_WRITE_OPERATIONS as readonly string[]).includes(operation);
}

/** MASTER PRICING §12 — guard for the AHSP-version write operations. */
export function isAhspVersionWriteOperation(
  operation: string,
): operation is AhspVersionOperation {
  return (AHSP_VERSION_WRITE_OPERATIONS as readonly string[]).includes(operation);
}

/**
 * Authorize one global master operation against a verified identity.
 * Pure + deterministic. Fail-closed on every unknown input: an identity
 * of unknown shape is denied, never coerced into an admin.
 */
export function authorizeMasterPriceOperation(
  identity: unknown,
  operation: GlobalWriteOperation | MasterPriceReadOperation,
): AuthorizationDecision {
  // Reads are open (public reference data — see type docs).
  if (operation === 'READ_MASTER_PRICE' || operation === 'READ_MASTER_HISTORY') {
    return {
      allowed: true,
      code: 'ALLOWED',
      reason: 'Master prices are public reference data; reads are not gated.',
      operation,
    };
  }

  // Defensive shape validation — fail closed on anything malformed.
  if (typeof identity !== 'object' || identity === null || Array.isArray(identity)) {
    return deny(operation, 'DENIED_MALFORMED_IDENTITY', 'Identity is not an object; denying.');
  }
  const id = identity as { kind?: unknown; userId?: unknown; isGlobalAdmin?: unknown; role?: unknown };

  if (id.kind === 'anonymous') {
    return deny(
      operation,
      'DENIED_NOT_AUTHENTICATED',
      'No authenticated identity: global master writes require an authenticated global admin.',
    );
  }
  if (id.kind === 'demo') {
    return deny(
      operation,
      'DENIED_DEMO_ROLE',
      'Demo PIN roles are local UX only, not authorization: global master writes require an authenticated global admin.',
    );
  }
  if (id.kind === 'authenticated') {
    if (typeof id.userId !== 'string' || id.userId.trim() === '') {
      return deny(operation, 'DENIED_MALFORMED_IDENTITY', 'Authenticated identity without a user id; denying.');
    }
    if (id.isGlobalAdmin !== true) {
      return deny(
        operation,
        'DENIED_NOT_GLOBAL_ADMIN',
        'Authenticated user is not a global admin (global_admins): ordinary users may use master data and create project overrides, but may not modify the global master.',
      );
    }
    return {
      allowed: true,
      code: 'ALLOWED',
      reason: 'Authenticated global admin.',
      operation,
    };
  }
  return deny(
    operation,
    'DENIED_MALFORMED_IDENTITY',
    `Unknown identity kind ${JSON.stringify(id.kind)}; denying.`,
  );
}

/**
 * The channel through which a global write is ATTEMPTED. The channel
 * never widens access (Decision A): an ordinary user cannot reach the
 * global master through AHSP editing, an import, a direct API call, or
 * a project override — and the project-override channel cannot write
 * global at all, for anyone (overrides are project-scoped by
 * construction: ProjectPriceEngine never mutates the reference DB).
 */
export type MasterPriceWritePath =
  | 'DIRECT' // the admin API / admin UI path
  | 'AHSP_EDIT' // editing an AHSP component that links to a master item
  | 'IMPORT' // bulk import (Excel/CSV/Sheets)
  | 'API' // a direct backend endpoint call
  | 'PROJECT_OVERRIDE' // a project price override (project-scoped)
  | 'SYNC'; // the §13 synchronization engine (admin-triggered only)

/**
 * Authorize a global write attempted VIA a given path. Same decision as
 * the direct path, except PROJECT_OVERRIDE, which is denied for
 * everyone including global admins: it is the wrong channel for a
 * global write (a global admin uses DIRECT; an override stays in its
 * project).
 */
export function authorizeMasterPriceWriteVia(
  identity: unknown,
  operation: GlobalWriteOperation,
  via: MasterPriceWritePath,
): AuthorizationDecision {
  if (via === 'PROJECT_OVERRIDE') {
    return deny(
      operation,
      'DENIED_WRONG_CHANNEL',
      'A project override can never write the global master — overrides are project-scoped by construction. Use the admin path for global changes.',
    );
  }
  const decision = authorizeMasterPriceOperation(identity, operation);
  if (!decision.allowed) {
    return { ...decision, reason: `${decision.reason} (attempted via ${via})` };
  }
  return { ...decision, reason: `${decision.reason} (via ${via})` };
}

/**
 * Anti-self-approval (mirror of price_assumptions: approver != creator,
 * enforced by CHECK + trigger in SQL). An admin may not approve a
 * reconciliation (or an alias) they created themselves. A null creator
 * (legacy / system-created record) has no one to conflict with, so any
 * global admin may approve it.
 */
export function authorizeReconciliationApproval(
  identity: unknown,
  createdByUserId: string | null,
): AuthorizationDecision {
  const base = authorizeMasterPriceOperation(identity, 'APPROVE_RECONCILIATION');
  if (!base.allowed) return base;
  const userId = (identity as { userId?: unknown }).userId;
  if (
    typeof createdByUserId === 'string' &&
    createdByUserId !== '' &&
    userId === createdByUserId
  ) {
    return deny(
      'APPROVE_RECONCILIATION',
      'DENIED_SELF_APPROVAL',
      'Self-approval blocked: the approver cannot be the creator of the reconciliation.',
    );
  }
  return base;
}

export function authorizeAliasApproval(
  identity: unknown,
  proposedByUserId: string | null,
): AuthorizationDecision {
  const base = authorizeMasterPriceOperation(identity, 'APPROVE_ALIAS');
  if (!base.allowed) return base;
  const userId = (identity as { userId?: unknown }).userId;
  if (
    typeof proposedByUserId === 'string' &&
    proposedByUserId !== '' &&
    userId === proposedByUserId
  ) {
    return deny(
      'APPROVE_ALIAS',
      'DENIED_SELF_APPROVAL',
      'Self-approval blocked: the approver cannot be the proposer of the alias.',
    );
  }
  return base;
}
