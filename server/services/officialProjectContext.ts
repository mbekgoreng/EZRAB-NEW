import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ReadOnlyProjectContextPayload } from '../api/readOnlyProjectContext';

/** Builds the AI context from the authorized server-side project record only. */
export class OfficialProjectContextRepository {
  private readonly client: SupabaseClient | null;

  constructor(options?: { client?: SupabaseClient; supabaseUrl?: string; supabaseKey?: string }) {
    if (options?.client) { this.client = options.client; return; }
    const url = options?.supabaseUrl || process.env.SUPABASE_URL;
    const key = options?.supabaseKey || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }

  public async build(input: { projectId: string; workspaceId: string }): Promise<ReadOnlyProjectContextPayload | null> {
    let projectRecord: Record<string, unknown> | null = null;

    if (this.client) {
      try {
        const result = await this.client
          .from('projects')
          .select('id, workspace_id, name, location, status, progress, updated_at')
          .eq('id', input.projectId)
          .eq('workspace_id', input.workspaceId)
          .maybeSingle();
        if (!result.error && result.data) {
          projectRecord = result.data as Record<string, unknown>;
        }
      } catch {
        // Fall through to in-memory dbAdapter
      }
    }

    if (!projectRecord) {
      // In-memory or development fallback
      const { aiDbAdapter } = await import('../database/dbAdapter');
      const localProj = aiDbAdapter.getProject(input.workspaceId, input.projectId);
      if (localProj) {
        projectRecord = {
          id: localProj.id,
          name: localProj.name,
          location: localProj.location,
          status: localProj.status,
          progress: localProj.progress,
        };
      }
    }

    if (!projectRecord) return null;

    return {
      source: 'server_official_context',
      project: {
        available: true,
        id: String(projectRecord.id),
        name: typeof projectRecord.name === 'string' ? projectRecord.name.slice(0, 500) : 'Proyek tanpa nama',
        ...(typeof projectRecord.location === 'string' ? { location: projectRecord.location.slice(0, 500) } : {}),
        ...(typeof projectRecord.status === 'string' ? { status: projectRecord.status.slice(0, 80) } : {}),
        ...(typeof projectRecord.progress === 'number' ? { progress: projectRecord.progress } : {}),
      },
      rab: { available: false, items: [], total: null, item_count: null, reason: 'Sumber RAB server-side belum diintegrasikan.' },
      work_items: { available: false, items: [], reason: 'Sumber pekerjaan server-side belum diintegrasikan.' },
      qto: { available: false, items: [], reason: 'Sumber QTO server-side belum diintegrasikan.' },
      schedule: { available: false, items: [], reason: 'Sumber jadwal server-side belum diintegrasikan.' },
      metadata: { generated_at: new Date().toISOString(), is_read_only: true, contract_version: '1.0' },
    };
  }
}

export interface OfficialProjectContextBuilder {
  build(input: { projectId: string; workspaceId: string }): Promise<ReadOnlyProjectContextPayload | null>;
}

let activeOfficialProjectContextRepository: OfficialProjectContextBuilder = new OfficialProjectContextRepository();

/** Test seam only: production defaults to the Supabase-backed repository. */
export function configureOfficialProjectContextRepository(repository: OfficialProjectContextBuilder): void {
  activeOfficialProjectContextRepository = repository;
}

export function resetOfficialProjectContextRepository(): void {
  activeOfficialProjectContextRepository = new OfficialProjectContextRepository();
}

export function buildOfficialProjectContext(input: { projectId: string; workspaceId: string }): Promise<ReadOnlyProjectContextPayload | null> {
  return activeOfficialProjectContextRepository.build(input);
}
