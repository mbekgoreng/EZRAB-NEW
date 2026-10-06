import type { UserRole } from '../../src/types';

export type IdentitySource = 'trusted_session' | 'legacy_development' | 'none';

export interface TrustedIdentity {
  userId: string;
  workspaceId: string;
  role: UserRole;
  source: IdentitySource;
  expiresAt?: Date;
}

/** Implement this at the selected identity provider boundary (session/JWT/Supabase). */
export interface IdentityResolver {
  resolve(headers: Record<string, string | string[] | undefined>): Promise<TrustedIdentity | null>;
}

/** Back this interface with durable project-membership data before enabling trusted mode. */
export interface ProjectMembershipRepository {
  hasProjectAccess(input: { userId: string; workspaceId: string; projectId: string }): Promise<boolean>;
  resolveProjectAccess?(input: { userId: string; projectId: string }): Promise<ProjectAccessResult>;
}

export type ProjectAccessResult =
  | { status: 'authorized'; workspaceId: string; role: UserRole }
  | { status: 'project_not_found' }
  | { status: 'workspace_membership_required' }
  | { status: 'project_membership_required' };

export class DenyIdentityResolver implements IdentityResolver {
  async resolve(): Promise<TrustedIdentity | null> {
    return null;
  }
}

export class DenyProjectMembershipRepository implements ProjectMembershipRepository {
  async hasProjectAccess(): Promise<boolean> {
    return false;
  }
}
