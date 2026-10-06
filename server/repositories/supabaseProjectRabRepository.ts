import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SupabaseProjectMembershipRepository } from '../auth/supabaseIdentityResolver';
import type { DurableProject, DurableRabDocument, DurableRabItem, DurableDedAnalysis } from '../data/durableTypes';

export class SupabaseProjectRabRepository {
  private readonly client: SupabaseClient | null;
  private readonly membership: SupabaseProjectMembershipRepository;
  private readonly localDedAnalyses: Map<string, DurableDedAnalysis> = new Map();

  constructor(options?: { client?: SupabaseClient; membership?: SupabaseProjectMembershipRepository }) {
    if (options?.client) this.client = options.client;
    else { const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY; this.client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null; }
    this.membership = options?.membership || new SupabaseProjectMembershipRepository({ client: this.client || undefined });
  }
  private requireClient(): SupabaseClient { if (!this.client) throw new Error('DURABLE_STORE_UNAVAILABLE'); return this.client; }

  public async resolveWorkspace(userId: string): Promise<{ workspaceId: string; role: string } | null> {
    const result = await this.requireClient().from('workspace_members').select('workspace_id, role').eq('user_id', userId).limit(1).maybeSingle();
    return result.error || !result.data ? null : { workspaceId: String(result.data.workspace_id), role: String(result.data.role) };
  }
  public async listProjects(userId: string): Promise<DurableProject[]> {
    const memberships = await this.requireClient().from('workspace_members').select('workspace_id').eq('user_id', userId);
    if (memberships.error) throw memberships.error;
    const ids = (memberships.data || []).map((row: any) => row.workspace_id);
    if (!ids.length) return [];
    const result = await this.requireClient().from('projects').select('*').in('workspace_id', ids).order('updated_at', { ascending: false });
    if (result.error) throw result.error;
    return (result.data || []) as DurableProject[];
  }
  public async getAuthorizedProject(userId: string, projectId: string): Promise<DurableProject | null> {
    const access = await this.membership.resolveProjectAccess({ userId, projectId });
    if (access.status !== 'authorized') return null;
    const result = await this.requireClient().from('projects').select('*').eq('id', projectId).eq('workspace_id', access.workspaceId).maybeSingle();
    return result.error || !result.data ? null : result.data as DurableProject;
  }
  public async createProject(userId: string, input: { name: string; legacy_id?: string; client_name?: string; location?: string }): Promise<DurableProject> {
    const workspace = await this.resolveWorkspace(userId); if (!workspace) throw new Error('PROJECT_NOT_AUTHORIZED');
    const result = await this.requireClient().from('projects').insert({ ...input, workspace_id: workspace.workspaceId, created_by: userId }).select('*').single();
    if (result.error) throw result.error; return result.data as DurableProject;
  }
  private async document(userId: string, project: DurableProject): Promise<DurableRabDocument> {
    const client = this.requireClient(); const existing = await client.from('rab_documents').select('*').eq('project_id', project.id).eq('workspace_id', project.workspace_id).maybeSingle();
    if (existing.error) throw existing.error; if (existing.data) return existing.data as DurableRabDocument;
    const created = await client.from('rab_documents').insert({ project_id: project.id, workspace_id: project.workspace_id, name: 'RAB Utama', created_by: userId }).select('*').single();
    if (created.error) throw created.error; return created.data as DurableRabDocument;
  }
  public async listRabItems(userId: string, projectId: string): Promise<DurableRabItem[]> {
    const project = await this.getAuthorizedProject(userId, projectId); if (!project) throw new Error('PROJECT_NOT_AUTHORIZED');
    const result = await this.requireClient().from('rab_items').select('*').eq('project_id', project.id).eq('workspace_id', project.workspace_id).order('created_at', { ascending: true });
    if (result.error) throw result.error; return (result.data || []) as DurableRabItem[];
  }
  public async createRabItem(userId: string, projectId: string, input: { legacy_id?: string; code: string; description: string; volume: number; unit: string; unit_price: number; material_price?: number; labor_price?: number; equipment_price?: number; ahsp_code?: string; ahsp_version?: string; ahsp_snapshot?: Record<string, unknown> }): Promise<DurableRabItem> {
    const project = await this.getAuthorizedProject(userId, projectId); if (!project) throw new Error('PROJECT_NOT_AUTHORIZED'); const doc = await this.document(userId, project);
    const amount = input.volume * input.unit_price; const result = await this.requireClient().from('rab_items').insert({ ...input, project_id: project.id, workspace_id: project.workspace_id, rab_document_id: doc.id, amount, material_price: input.material_price || 0, labor_price: input.labor_price || 0, equipment_price: input.equipment_price || 0, created_by: userId }).select('*').single();
    if (result.error) throw result.error; await this.audit(userId, project, 'RAB_ITEM_CREATED', result.data.id); return result.data as DurableRabItem;
  }
  public async updateRabItem(userId: string, projectId: string, itemId: string, expectedUpdatedAt: string, patch: Partial<Pick<DurableRabItem, 'description' | 'volume' | 'unit' | 'unit_price' | 'code'>>): Promise<DurableRabItem | null> {
    const project = await this.getAuthorizedProject(userId, projectId); if (!project) throw new Error('PROJECT_NOT_AUTHORIZED'); const next: any = { ...patch }; if (patch.volume !== undefined || patch.unit_price !== undefined) { const current = await this.requireClient().from('rab_items').select('volume, unit_price').eq('id', itemId).eq('project_id', project.id).maybeSingle(); if (current.error || !current.data) return null; next.amount = (patch.volume ?? current.data.volume) * (patch.unit_price ?? current.data.unit_price); }
    const result = await this.requireClient().from('rab_items').update(next).eq('id', itemId).eq('project_id', project.id).eq('workspace_id', project.workspace_id).eq('updated_at', expectedUpdatedAt).select('*').maybeSingle();
    if (result.error || !result.data) return null; await this.audit(userId, project, 'RAB_ITEM_UPDATED', itemId); return result.data as DurableRabItem;
  }

  // =========================================================================
  // DED -> RAB ANALYSIS PERSISTENCE
  // =========================================================================
  public async saveDedAnalysis(userId: string, input: DurableDedAnalysis): Promise<DurableDedAnalysis> {
    const project = await this.getAuthorizedProject(userId, input.project_id);
    if (!project) throw new Error('PROJECT_NOT_AUTHORIZED');

    const record: DurableDedAnalysis = {
      ...input,
      workspace_id: project.workspace_id,
      updated_at: new Date().toISOString(),
      created_at: input.created_at || new Date().toISOString(),
    };

    if (this.client) {
      try {
        const res = await this.client
          .from('ded_analyses')
          .upsert(record)
          .select('*')
          .single();
        if (!res.error && res.data) {
          await this.audit(userId, project, 'DED_ANALYSIS_SAVED', record.id);
          this.localDedAnalyses.set(record.id, res.data as DurableDedAnalysis);
          return res.data as DurableDedAnalysis;
        }
      } catch {
        // Fall back to memory
      }
    }

    this.localDedAnalyses.set(record.id, record);
    return record;
  }

  public async getLatestDedAnalysis(userId: string, projectId: string): Promise<DurableDedAnalysis | null> {
    const project = await this.getAuthorizedProject(userId, projectId);
    if (!project) throw new Error('PROJECT_NOT_AUTHORIZED');

    if (this.client) {
      try {
        const res = await this.client
          .from('ded_analyses')
          .select('*')
          .eq('project_id', projectId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!res.error && res.data) {
          return res.data as DurableDedAnalysis;
        }
      } catch {
        // Fall back to memory
      }
    }

    const matches = Array.from(this.localDedAnalyses.values())
      .filter((a) => a.project_id === projectId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    return matches[0] || null;
  }

  public async getDedAnalysisById(userId: string, projectId: string, analysisId: string): Promise<DurableDedAnalysis | null> {
    const project = await this.getAuthorizedProject(userId, projectId);
    if (!project) throw new Error('PROJECT_NOT_AUTHORIZED');

    if (this.client) {
      try {
        const res = await this.client
          .from('ded_analyses')
          .select('*')
          .eq('id', analysisId)
          .eq('project_id', projectId)
          .maybeSingle();
        if (!res.error && res.data) {
          return res.data as DurableDedAnalysis;
        }
      } catch {
        // Fall back to memory
      }
    }

    const match = this.localDedAnalyses.get(analysisId);
    return match && match.project_id === projectId ? match : null;
  }

  public async listDedAnalyses(userId: string, projectId: string): Promise<DurableDedAnalysis[]> {
    const project = await this.getAuthorizedProject(userId, projectId);
    if (!project) throw new Error('PROJECT_NOT_AUTHORIZED');

    if (this.client) {
      try {
        const res = await this.client
          .from('ded_analyses')
          .select('*')
          .eq('project_id', projectId)
          .order('updated_at', { ascending: false });
        if (!res.error && res.data) {
          return res.data as DurableDedAnalysis[];
        }
      } catch {
        // Fall back to memory
      }
    }

    return Array.from(this.localDedAnalyses.values())
      .filter((a) => a.project_id === projectId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  private async audit(userId: string, project: DurableProject, event_code: string, entity_id: string): Promise<void> {
    if (this.client) {
      try {
        await this.requireClient().from('audit_logs').insert({ user_id: userId, workspace_id: project.workspace_id, project_id: project.id, event_code, entity_id });
      } catch {
        // Ignore audit failure in local mode
      }
    }
  }
}
export const supabaseProjectRabRepository = new SupabaseProjectRabRepository();
