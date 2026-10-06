# Authentication and project ownership foundation

## Current state

The visible login/signup modal is UI-only: it does not call a server, create an account, verify a password, issue a session, persist a trusted identity, refresh a session, implement logout, password reset, or email verification. The current AI database adapter is in-memory and contains project/workspace seed data, but no user, workspace membership, or project-membership records.

Browser headers (`x-user-id`, `x-user-role`, `x-workspace-id`, `x-project-id`) are not a trusted identity source. `projectContext` is browser-supplied read-only request data, not official project data.

### Provider and database audit (Step 6.5)

No real authentication provider is installed or configured in this repository. `package.json` contains no Supabase, Auth0, Clerk, Firebase, JWT/session library, or database/ORM dependency. No schema, SQL migration, or database client was found. `AiDatabaseAdapter` is a process-local `Map` prototype and must not be used as the production membership authority.

Consequently, no production resolver, durable membership repository, frontend login integration, logout, refresh, or credential flow is implemented here. `AuthModal` remains UI-only by design until a provider is selected and configured by the application owner.

## Foundation and modes

`server/auth/contracts.ts` defines two integration seams:

- `IdentityResolver`: verify an HTTP-only session/JWT/auth-provider assertion and return a trusted user, role, and workspace.
- `ProjectMembershipRepository`: query durable user → workspace → project membership.

`EZRAB_AUTH_MODE=trusted` is the production-safe mode. It is fail-closed: the default resolver and membership repository deny access until the host application installs real implementations. Browser identity headers are ignored in this mode.

`EZRAB_AUTH_MODE=legacy-development` exists only for migration/local development. It accepts current headers as explicitly untrusted legacy input, emits a migration log, and must not be used in production. If `EZRAB_AUTH_MODE` is unset, production defaults to `trusted`; non-production defaults to `legacy-development` for backward compatibility.

No secret is defined in source. The eventual identity provider configuration belongs in server-only environment variables selected by the provider implementation, never `VITE_*` variables or `projectContext`.

## Required production flow

```text
Browser + HTTP-only session
  -> backend IdentityResolver verifies session/JWT
  -> ProjectMembershipRepository verifies user/workspace/project access
  -> backend obtains official read-only project data
  -> AI Core and read-only tools
```

Authorization must complete in the TypeScript backend before FastAPI is called. AI Core must never decide user authorization. During migration, frontend context is only a limited request hint/cache and may not become authoritative data.

## Migration plan

1. Implement the real user/workspace/project membership schema and repository.
2. Implement a provider-specific server session/JWT resolver with expiry and logout/revocation handling.
3. Wire both adapters at backend startup and deploy with `EZRAB_AUTH_MODE=trusted`.
4. Observe legacy-development logs in non-production; migrate clients to cookies/session transport.
5. Remove identity headers from frontend requests only after compatible clients are migrated.

### Proposed durable data model (not applied)

This is a migration proposal, not a claim that these tables exist. Adapt names and identifiers to the chosen provider/database before creating a reviewed migration.

| Model | Minimum fields / constraints | Purpose |
| --- | --- | --- |
| provider user reference | `provider_user_id` unique | Maps the provider's verified subject; do not store provider passwords. |
| workspaces | `id`, lifecycle timestamps | Tenant boundary. |
| workspace_members | `workspace_id`, `provider_user_id`, server-managed role, unique pair | Trusted workspace role source. |
| projects | `id`, `workspace_id`, lifecycle timestamps | Project belongs to exactly one workspace. |
| project_members | `project_id`, `provider_user_id`, optional project role, unique pair | Use only when project access differs from workspace access. |
| audit_logs | actor subject, workspace/project IDs, event code, timestamp | Security/audit trail without secrets or full context payloads. |

Membership query requirements: bind the verified provider subject and requested project ID as parameters; first distinguish project absence from inaccessible membership; never accept user/workspace/role values from request headers or body. Use provider-managed session revocation when available; otherwise add a server-side session/revocation store with expiry and rotation.

Threats still requiring controls: stolen browser sessions, CSRF, cookie policy, session rotation/revocation, database row-level authorization, network isolation, rate limiting, audit retention, and trusted backend project-context construction.
