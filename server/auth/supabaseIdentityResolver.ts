import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { IncomingHttpHeaders } from 'http';
import type { UserRole } from '../../src/types';
import type {
  IdentityResolver,
  ProjectMembershipRepository,
  ProjectAccessResult,
  TrustedIdentity,
} from './contracts';

const ALLOWED_ROLES: readonly UserRole[] = [
  'SUPER_ADMIN',
  'ESTIMATOR',
  'DIREKSI',
  'CLIENT',
  'EDITOR',
];

function isAllowedRole(role: string): role is UserRole {
  return (ALLOWED_ROLES as readonly string[]).includes(role);
}

export class SupabaseIdentityResolver implements IdentityResolver {
  private client: SupabaseClient | null = null;
  private readonly defaultWorkspaceId: string;

  constructor(options?: {
    supabaseUrl?: string;
    supabaseKey?: string;
    client?: SupabaseClient;
    defaultWorkspaceId?: string;
  }) {
    this.defaultWorkspaceId =
      options?.defaultWorkspaceId ||
      process.env.DEFAULT_WORKSPACE_ID ||
      'ws-default-ezrab';

    if (options?.client) {
      this.client = options.client;
      return;
    }

    const url = options?.supabaseUrl || process.env.SUPABASE_URL;
    // Prefer server secret key, fall back to publishable/anon key if secret key is not set
    const key =
      options?.supabaseKey ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY;

    if (url && key) {
      try {
        this.client = createClient(url, key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
      } catch (err) {
        console.error('[EZRAB SupabaseAuth] Failed to initialize Supabase client:', (err as Error).message);
        this.client = null;
      }
    }
  }

  public isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Extract Bearer token from headers and verify with Supabase Auth.
   * STRICT SECURITY: Ignores any client-supplied x-user-id or x-user-role headers.
   */
  public async resolve(
    headers: Record<string, string | string[] | undefined> | IncomingHttpHeaders
  ): Promise<TrustedIdentity | null> {
    if (!this.client) {
      return null;
    }

    const rawAuth = headers['authorization'] || headers['Authorization'];
    const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;

    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return null;
    }

    try {
      const { data, error } = await this.client.auth.getUser(token);

      if (error || !data?.user) {
        return null;
      }

      const user = data.user;
      // Authentication proves only the provider subject. Role and workspace are
      // resolved later from server-side membership rows, never metadata or headers.
      return {
        userId: user.id,
        workspaceId: this.defaultWorkspaceId,
        role: 'ESTIMATOR',
        source: 'trusted_session',
      };
    } catch (err) {
      console.warn('[EZRAB SupabaseAuth] Token validation error:', (err as Error).message);
      return null;
    }
  }
}

export class SupabaseProjectMembershipRepository implements ProjectMembershipRepository {
  private readonly client: SupabaseClient | null;

  constructor(options?: { supabaseUrl?: string; supabaseKey?: string; client?: SupabaseClient }) {
    if (options?.client) { this.client = options.client; return; }
    const url = options?.supabaseUrl || process.env.SUPABASE_URL;
    const key = options?.supabaseKey || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }

  public async resolveProjectAccess(input: { userId: string; projectId: string }): Promise<ProjectAccessResult> {
    if (!this.client || !input.userId || !input.projectId) return { status: 'project_not_found' };
    const project = await this.client.from('projects').select('id, workspace_id').eq('id', input.projectId).maybeSingle();
    if (project.error || !project.data?.workspace_id) return { status: 'project_not_found' };
    const workspaceId = String(project.data.workspace_id);
    const workspaceMember = await this.client.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', input.userId).maybeSingle();
    if (workspaceMember.error || !workspaceMember.data) return { status: 'workspace_membership_required' };
    const projectMember = await this.client.from('project_members').select('project_id').eq('project_id', input.projectId).eq('user_id', input.userId).maybeSingle();
    if (projectMember.error || !projectMember.data) return { status: 'project_membership_required' };
    const rawRole = String(workspaceMember.data.role || '').toUpperCase();
    if (!isAllowedRole(rawRole)) return { status: 'workspace_membership_required' };
    return { status: 'authorized', workspaceId, role: rawRole };
  }
  /**
   * Verifies that the project exists within the user's workspace.
   * Ensures multi-tenant isolation before any AI action or query.
   */
  public async hasProjectAccess(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
  }): Promise<boolean> {
    const result = await this.resolveProjectAccess({ userId: input.userId, projectId: input.projectId });
    return result.status === 'authorized' && result.workspaceId === input.workspaceId;
  }
}
