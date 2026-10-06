import { UserRole } from '../../src/types';
import { authFoundation } from '../auth/authFoundation';
import type { TrustedIdentity } from '../auth/contracts';

export type AIPermission =
  | 'AI_VIEW'
  | 'AI_CHAT'
  | 'AI_ANALYZE'
  | 'AI_CREATE'
  | 'AI_UPDATE'
  | 'AI_DELETE';

export const ROLE_PERMISSIONS: Record<UserRole, AIPermission[]> = {
  SUPER_ADMIN: ['AI_VIEW', 'AI_CHAT', 'AI_ANALYZE', 'AI_CREATE', 'AI_UPDATE', 'AI_DELETE'],
  ESTIMATOR: ['AI_VIEW', 'AI_CHAT', 'AI_ANALYZE', 'AI_CREATE', 'AI_UPDATE'],
  DIREKSI: ['AI_VIEW', 'AI_CHAT', 'AI_ANALYZE'],
  EDITOR: ['AI_VIEW', 'AI_CHAT', 'AI_UPDATE'],
  CLIENT: ['AI_VIEW', 'AI_CHAT']
};

export interface AuthenticatedUserContext {
  userId: string;
  role: UserRole;
  workspaceId: string;
  projectId?: string;
  identitySource: TrustedIdentity['source'];
}

export class AuthMiddleware {
  /**
   * Verify if user role has required permission
   */
  public static hasPermission(role: UserRole, permission: AIPermission): boolean {
    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes(permission);
  }

  /**
   * Extract and validate user context from incoming request headers
   */
  public static async resolveContext(headers: Record<string, string | string[] | undefined>): Promise<AuthenticatedUserContext> {
    const identity = await authFoundation.authenticate(headers);
    // x-project-id is not identity. It remains only a request hint and is validated at the route boundary.
    const projectId = headers['x-project-id'] as string | undefined;
    return { workspaceId: identity.workspaceId, userId: identity.userId, role: identity.role, projectId, identitySource: identity.source };
  }

  public static async assertProjectAccess(context: AuthenticatedUserContext, projectId: string): Promise<void> {
    await authFoundation.assertProjectAccess({
      userId: context.userId, workspaceId: context.workspaceId, role: context.role, source: context.identitySource,
    }, projectId);
  }

  public static async authorizeProject(context: AuthenticatedUserContext, projectId: string): Promise<AuthenticatedUserContext> {
    const identity = await authFoundation.authorizeProject({
      userId: context.userId, workspaceId: context.workspaceId, role: context.role, source: context.identitySource,
    }, projectId);
    return { ...context, workspaceId: identity.workspaceId, role: identity.role };
  }
}
