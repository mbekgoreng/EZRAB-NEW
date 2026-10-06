import type { IncomingHttpHeaders } from 'http';
import type { UserRole } from '../../src/types';
import {
  DenyIdentityResolver,
  DenyProjectMembershipRepository,
  type IdentityResolver,
  type ProjectMembershipRepository,
  type TrustedIdentity,
  type ProjectAccessResult,
} from './contracts';
import {
  SupabaseIdentityResolver,
  SupabaseProjectMembershipRepository,
} from './supabaseIdentityResolver';

export type AuthMode = 'legacy-development' | 'trusted';

export class AuthenticationError extends Error {
  constructor(public readonly code: 'AUTH_REQUIRED' | 'AUTH_INVALID' | 'AUTH_EXPIRED') {
    super(code);
  }
}

export class ProjectAuthorizationError extends Error {
  constructor(public readonly code: 'PROJECT_NOT_AUTHORIZED' | 'PROJECT_NOT_FOUND') {
    super(code);
  }
}

const roles: UserRole[] = ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT', 'EDITOR'];

function configuredMode(): AuthMode {
  const value = process.env.EZRAB_AUTH_MODE;
  if (value === 'legacy-development' || value === 'trusted') return value;
  return process.env.NODE_ENV === 'production' ? 'trusted' : 'legacy-development';
}

function buildDefaultResolvers(): {
  identityResolver: IdentityResolver;
  membershipRepository: ProjectMembershipRepository;
} {
  const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL);
  const hasSupabaseKey = Boolean(
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY
  );

  if (hasSupabaseUrl && hasSupabaseKey) {
    const resolver = new SupabaseIdentityResolver();
    if (resolver.isConfigured()) {
      return {
        identityResolver: resolver,
        membershipRepository: new SupabaseProjectMembershipRepository(),
      };
    }
  }

  return {
    identityResolver: new DenyIdentityResolver(),
    membershipRepository: new DenyProjectMembershipRepository(),
  };
}

/**
 * Transitional authentication seam. Trusted mode is fail-closed.
 * Automatically wires real Supabase auth when Supabase credentials are configured.
 */
export class AuthFoundation {
  private identityResolver: IdentityResolver;
  private membershipRepository: ProjectMembershipRepository;

  constructor() {
    const defaults = buildDefaultResolvers();
    this.identityResolver = defaults.identityResolver;
    this.membershipRepository = defaults.membershipRepository;
  }

  public configure(dependencies: {
    identityResolver: IdentityResolver;
    membershipRepository: ProjectMembershipRepository;
  }): void {
    this.identityResolver = dependencies.identityResolver;
    this.membershipRepository = dependencies.membershipRepository;
  }

  public resetToDefault(): void {
    const defaults = buildDefaultResolvers();
    this.identityResolver = defaults.identityResolver;
    this.membershipRepository = defaults.membershipRepository;
  }

  public async authenticate(headers: IncomingHttpHeaders): Promise<TrustedIdentity> {
    const mode = configuredMode();
    if (mode === 'legacy-development') {
      const legacy = this.resolveLegacyHeaders(headers);
      console.warn('[EZRAB Auth] legacy_development_identity_used', { identitySource: legacy.source });
      return legacy;
    }

    const identity = await this.identityResolver.resolve(headers);
    if (!identity || identity.source !== 'trusted_session') throw new AuthenticationError('AUTH_REQUIRED');
    if (identity.expiresAt && identity.expiresAt.getTime() <= Date.now()) throw new AuthenticationError('AUTH_EXPIRED');
    if (!roles.includes(identity.role)) throw new AuthenticationError('AUTH_INVALID');
    return identity;
  }

  public async assertProjectAccess(identity: TrustedIdentity, projectId: string): Promise<void> {
    if (identity.source !== 'trusted_session') return;
    if (!(await this.membershipRepository.hasProjectAccess({ userId: identity.userId, workspaceId: identity.workspaceId, projectId }))) {
      throw new ProjectAuthorizationError('PROJECT_NOT_AUTHORIZED');
    }
  }

  /** Resolves workspace and role only from durable membership data in trusted mode. */
  public async authorizeProject(identity: TrustedIdentity, projectId: string): Promise<TrustedIdentity> {
    if (identity.source !== 'trusted_session') return identity;
    const resolver = this.membershipRepository.resolveProjectAccess;
    if (!resolver) {
      await this.assertProjectAccess(identity, projectId);
      return identity;
    }
    const access: ProjectAccessResult = await resolver.call(this.membershipRepository, { userId: identity.userId, projectId });
    if (access.status === 'project_not_found') throw new ProjectAuthorizationError('PROJECT_NOT_FOUND');
    if (access.status !== 'authorized') throw new ProjectAuthorizationError('PROJECT_NOT_AUTHORIZED');
    return { ...identity, workspaceId: access.workspaceId, role: access.role };
  }

  private resolveLegacyHeaders(headers: IncomingHttpHeaders): TrustedIdentity {
    const userId = String(headers['x-user-id'] || 'user-estimator-01');
    const workspaceId = String(headers['x-workspace-id'] || 'ws-default-ezrab');
    const rawRole = String(headers['x-user-role'] || 'ESTIMATOR') as UserRole;
    return { userId, workspaceId, role: roles.includes(rawRole) ? rawRole : 'ESTIMATOR', source: 'legacy_development' };
  }
}

export const authFoundation = new AuthFoundation();
