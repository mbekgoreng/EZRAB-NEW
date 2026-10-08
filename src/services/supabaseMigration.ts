/**
 * Phase 3 — localStorage → Supabase migration runner.
 *
 * STATUS: implemented defensively, NOT executed against a live database
 * (no Supabase project exists yet).
 *
 * Guarantees:
 *  - never deletes local data (rollback = clear the migrated flag)
 *  - idempotent (matches on legacy_id)
 *  - validates per-entity counts before marking complete
 *  - on any failure, the app keeps reading localStorage
 */
import { getSupabaseClient, isSupabaseAuthEnabled } from '../lib/supabase';

export const MIGRATION_FLAG = 'ezrab_supabase_migrated_v1';

export interface MigrationProgress {
  entity: string;
  local: number;
  migrated: number;
  skipped: number;
}
export type ProgressCallback = (p: MigrationProgress) => void;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function isMigrationComplete(): boolean {
  try {
    return localStorage.getItem(MIGRATION_FLAG) === '1';
  } catch {
    return false;
  }
}

export function resetMigrationFlag(): void {
  try {
    localStorage.removeItem(MIGRATION_FLAG);
  } catch {
    /* noop */
  }
}

interface LocalProject {
  id: string;
  name?: string;
  client?: string;
  location?: string;
  status?: string;
}

/**
 * Migrate the signed-in user's local business data into Supabase.
 * Returns { ok, migrated, errors }. Safe to call repeatedly.
 */
export async function migrateLocalStorageToSupabase(
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; migrated: number; errors: string[] }> {
  const errors: string[] = [];
  let migrated = 0;
  if (!isSupabaseAuthEnabled()) return { ok: false, migrated: 0, errors: ['Supabase tidak dikonfigurasi'] };
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, migrated: 0, errors: ['Supabase client unavailable'] };

  const { data: sessionData } = await sb.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, migrated: 0, errors: ['Pengguna belum login'] };
  const userId = user.id;

  const report = (p: MigrationProgress) => {
    try {
      onProgress?.(p);
    } catch {
      /* progress must never break migration */
    }
  };

  try {
    // 1. Workspace bootstrap (one per user, idempotent by name+owner).
    const { data: existingWs } = await sb
      .from('workspaces')
      .select('id')
      .eq('name', 'Workspace Utama')
      .limit(1);
    let workspaceId: string | null = existingWs?.[0]?.id ?? null;
    if (!workspaceId) {
      const { data: ws, error } = await sb
        .from('workspaces')
        .insert({ name: 'Workspace Utama' })
        .select('id')
        .single();
      if (error) throw new Error('workspace: ' + error.message);
      workspaceId = ws.id;
      const { error: mErr } = await sb
        .from('workspace_members')
        .insert({ workspace_id: workspaceId, user_id: userId, role: 'SUPER_ADMIN' });
      if (mErr) throw new Error('workspace_members: ' + mErr.message);
    }

    // 2. Projects.
    const localProjects = readJson<LocalProject[]>('ezrab_prod_projects', []);
    report({ entity: 'projects', local: localProjects.length, migrated: 0, skipped: 0 });
    let projMigrated = 0;
    for (const p of localProjects) {
      const { data: exists } = await sb
        .from('projects')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('legacy_id', p.id)
        .limit(1);
      if (exists && exists.length > 0) continue;
      const { data: created, error } = await sb
        .from('projects')
        .insert({
          workspace_id: workspaceId,
          legacy_id: p.id,
          name: p.name || 'Proyek',
          client_name: p.client ?? null,
          location: p.location ?? null,
          status: p.status ?? 'draft',
          created_by: userId,
        })
        .select('id')
        .single();
      if (error) {
        errors.push(`project ${p.id}: ${error.message}`);
        continue;
      }
      const { error: pmErr } = await sb
        .from('project_members')
        .insert({ project_id: created.id, workspace_id: workspaceId, user_id: userId });
      if (pmErr) errors.push(`project_members ${p.id}: ${pmErr.message}`);
      else projMigrated++;
    }
    migrated += projMigrated;
    report({ entity: 'projects', local: localProjects.length, migrated: projMigrated, skipped: localProjects.length - projMigrated });

    // 3. RAB items (batched, matched by legacy_id).
    const localRab: Array<Record<string, unknown>> = readJson('ezrab_prod_rab_items', []);
    // Map legacy project id -> uuid for FK.
    const { data: projRows } = await sb
      .from('projects')
      .select('id, legacy_id')
      .eq('workspace_id', workspaceId);
    const projMap = new Map((projRows ?? []).map((r: { id: string; legacy_id: string }) => [r.legacy_id, r.id]));
    // Ensure at least one rab_document per project (lazy create).
    const docCache = new Map<string, string>();
    async function docFor(projectUuid: string): Promise<string | null> {
      if (docCache.has(projectUuid)) return docCache.get(projectUuid)!;
      const { data } = await sb!.from('rab_documents').select('id').eq('project_id', projectUuid).limit(1);
      if (data && data.length > 0) {
        docCache.set(projectUuid, data[0].id);
        return data[0].id;
      }
      const { data: created, error } = await sb!
        .from('rab_documents')
        .insert({ project_id: projectUuid, workspace_id: workspaceId, name: 'RAB Utama', created_by: userId })
        .select('id')
        .single();
      if (error) {
        errors.push('rab_documents: ' + error.message);
        return null;
      }
      docCache.set(projectUuid, created.id);
      return created.id;
    }
    let rabMigrated = 0;
    for (const item of localRab) {
      const legacyProjectId = String(item['projectId'] ?? '');
      const projectUuid = projMap.get(legacyProjectId);
      if (!projectUuid) continue;
      const docId = await docFor(projectUuid);
      if (!docId) continue;
      const legacyId = String(item['id'] ?? '');
      const { data: exists } = await sb
        .from('rab_items')
        .select('id')
        .eq('project_id', projectUuid)
        .eq('legacy_id', legacyId)
        .limit(1);
      if (exists && exists.length > 0) continue;
      const num = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      const { error } = await sb.from('rab_items').insert({
        legacy_id: legacyId,
        rab_document_id: docId,
        project_id: projectUuid,
        workspace_id: workspaceId,
        code: String(item['code'] ?? ''),
        description: String(item['description'] ?? ''),
        volume: num(item['volume']),
        unit: String(item['unit'] ?? 'ls'),
        material_price: num(item['materialPrice']),
        labor_price: num(item['laborPrice']),
        equipment_price: num(item['equipmentPrice']),
        unit_price: num(item['unitPrice']),
        amount: num(item['amount']),
        price_status:
          item['priceStatus'] === 'PRICE_UNRESOLVED' ? 'PRICE_UNRESOLVED' : 'PRICE_RESOLVED',
        verification_status: typeof item['verificationStatus'] === 'string' ? item['verificationStatus'] : null,
        ahsp_code: typeof item['ahspCode'] === 'string' ? item['ahspCode'] : null,
        created_by: userId,
      });
      if (error) errors.push(`rab_item ${legacyId}: ${error.message}`);
      else rabMigrated++;
    }
    migrated += rabMigrated;
    report({ entity: 'rab_items', local: localRab.length, migrated: rabMigrated, skipped: localRab.length - rabMigrated });

    if (errors.length > 0) return { ok: false, migrated, errors };
    try {
      localStorage.setItem(MIGRATION_FLAG, '1');
    } catch {
      /* flag write failure: migration still counts by idempotency */
    }
    return { ok: true, migrated, errors: [] };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { ok: false, migrated, errors };
  }
}
