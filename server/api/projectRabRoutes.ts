import type { IncomingMessage, ServerResponse } from 'http';
import { authFoundation, AuthenticationError } from '../auth/authFoundation';
import { supabaseProjectRabRepository } from '../repositories/supabaseProjectRabRepository';

const MAX_BODY = 64 * 1024;
function send(res: ServerResponse, status: number, payload: unknown) { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)); }
function error(res: ServerResponse, status: number, code: string, message: string, retryable = false) { send(res, status, { success: false, error: { code, message, retryable } }); }
async function body(req: IncomingMessage): Promise<any> { return new Promise((resolve, reject) => { let size = 0; const chunks: Buffer[] = []; req.on('data', chunk => { size += chunk.length; if (size > MAX_BODY) { reject(new Error('PAYLOAD_TOO_LARGE')); return; } chunks.push(Buffer.from(chunk)); }); req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('INVALID_REQUEST')); } }); req.on('error', reject); }); }
function validId(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
function mapError(res: ServerResponse, e: any) { const code = e?.message === 'PROJECT_NOT_AUTHORIZED' ? 'PROJECT_NOT_AUTHORIZED' : e?.message === 'DURABLE_STORE_UNAVAILABLE' ? 'DURABLE_STORE_UNAVAILABLE' : 'INTERNAL_ERROR'; error(res, code === 'PROJECT_NOT_AUTHORIZED' ? 403 : code === 'DURABLE_STORE_UNAVAILABLE' ? 503 : 500, code, code === 'PROJECT_NOT_AUTHORIZED' ? 'Akses proyek tidak diizinkan.' : 'Layanan data proyek belum tersedia.', code === 'DURABLE_STORE_UNAVAILABLE'); }

export async function handleProjectRabApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`); if (!url.pathname.startsWith('/api/projects')) return false;
  const requestId = `data-${crypto.randomUUID()}`;
  try {
    const identity = await authFoundation.authenticate(req.headers as any);
    const parts = url.pathname.split('/').filter(Boolean); const projectId = parts[2]; const itemId = parts[5];
    if (req.method === 'GET' && parts.length === 2) { send(res, 200, { success: true, projects: await supabaseProjectRabRepository.listProjects(identity.userId), requestId }); return true; }
    if (req.method === 'POST' && parts.length === 2) { const input = await body(req); if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 500) { error(res, 400, 'INVALID_REQUEST', 'Nama proyek tidak valid.'); return true; } send(res, 201, { success: true, project: await supabaseProjectRabRepository.createProject(identity.userId, { name: input.name.trim(), legacy_id: validId(input.legacy_id) ? input.legacy_id : undefined, client_name: typeof input.client_name === 'string' ? input.client_name.slice(0, 500) : undefined, location: typeof input.location === 'string' ? input.location.slice(0, 500) : undefined }), requestId }); return true; }
    if (!validId(projectId)) { error(res, 400, 'INVALID_REQUEST', 'Project ID tidak valid.'); return true; }
    const project = await supabaseProjectRabRepository.getAuthorizedProject(identity.userId, projectId); if (!project) { error(res, 404, 'PROJECT_NOT_FOUND', 'Proyek tidak ditemukan.'); return true; }
    if (req.method === 'GET' && parts.length === 3) { send(res, 200, { success: true, project, requestId }); return true; }
    if (req.method === 'GET' && parts.length === 4 && parts[3] === 'rab') { send(res, 200, { success: true, items: await supabaseProjectRabRepository.listRabItems(identity.userId, projectId), requestId }); return true; }
    if (req.method === 'POST' && parts.length === 4 && parts[3] === 'rab') { const input = await body(req); if (typeof input.code !== 'string' || typeof input.description !== 'string' || typeof input.volume !== 'number' || input.volume < 0 || typeof input.unit !== 'string' || typeof input.unit_price !== 'number' || input.unit_price < 0) { error(res, 400, 'INVALID_REQUEST', 'Data item RAB tidak valid.'); return true; } send(res, 201, { success: true, item: await supabaseProjectRabRepository.createRabItem(identity.userId, projectId, input), requestId }); return true; }
    if (req.method === 'PATCH' && parts.length === 6 && parts[3] === 'rab' && parts[4] === 'items' && validId(itemId)) { const input = await body(req); if (typeof input.expected_updated_at !== 'string') { error(res, 400, 'INVALID_REQUEST', 'Versi item wajib tersedia.'); return true; } const updated = await supabaseProjectRabRepository.updateRabItem(identity.userId, projectId, itemId, input.expected_updated_at, input.patch || {}); if (!updated) { error(res, 409, 'CONCURRENCY_CONFLICT', 'Data berubah. Muat ulang lalu coba lagi.'); return true; } send(res, 200, { success: true, item: updated, requestId }); return true; }

    // DED -> RAB Analysis Endpoints
    if (parts.length >= 4 && parts[3] === 'ded-analyses') {
      const analysisId = parts[4];
      if (req.method === 'GET' && parts.length === 4) {
        const isLatest = url.searchParams.get('latest') === 'true';
        if (isLatest) {
          const latest = await supabaseProjectRabRepository.getLatestDedAnalysis(identity.userId, projectId);
          send(res, 200, { success: true, analysis: latest, requestId });
          return true;
        }
        const list = await supabaseProjectRabRepository.listDedAnalyses(identity.userId, projectId);
        send(res, 200, { success: true, analyses: list, requestId });
        return true;
      }
      if (req.method === 'GET' && parts.length === 5 && validId(analysisId)) {
        const record = await supabaseProjectRabRepository.getDedAnalysisById(identity.userId, projectId, analysisId);
        if (!record) { error(res, 404, 'ANALYSIS_NOT_FOUND', 'Analisis DED tidak ditemukan.'); return true; }
        send(res, 200, { success: true, analysis: record, requestId });
        return true;
      }
      if ((req.method === 'POST' && parts.length === 4) || (req.method === 'PATCH' && parts.length === 5)) {
        const input = await body(req);
        if (!input.id || !input.project_id || !input.status) {
          error(res, 400, 'INVALID_REQUEST', 'Data analisis DED tidak lengkap (id, project_id, status wajib).');
          return true;
        }
        const saved = await supabaseProjectRabRepository.saveDedAnalysis(identity.userId, input);
        send(res, 200, { success: true, analysis: saved, requestId });
        return true;
      }
    }

    error(res, 404, 'NOT_FOUND', 'Endpoint data tidak ditemukan.'); return true;
  } catch (e: any) { if (e instanceof AuthenticationError) error(res, 401, e.code, 'Autentikasi diperlukan.'); else mapError(res, e); return true; }
}
