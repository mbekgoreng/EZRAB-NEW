/**
 * EZRAB Multi-Provider AI API Routes (Phase 9.3)
 *
 * Mounted from server/api/aiRoutes.ts under /api/ai/multi-provider/*
 * All secrets stay server-side; responses expose key ALIASES only.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  ensureKeyPoolRegistered,
  chatGemini,
  chatOpenAiCompatible,
  discoverModels,
  providerSupportsVision,
  providerSupportsPdf,
  ProviderExecError,
} from '../providers/multiProvider/adapters';
import { serverKeyPool } from '../providers/multiProvider/keyPool';
import { AuthMiddleware } from '../middleware/authMiddleware';
import { executeAiCapability, PUBLIC_AI_IDENTITIES, AiMode } from '../ai/aiCapabilityRouter';

type CatalogEntry = {
  providerId: string;
  models: string[]; // env-configured + discovered (cached)
  capabilities: string[];
};

function envList(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Valid model ids for a provider: env-configured plus live-discovered cache. */
function configuredModels(providerId: string): string[] {
  switch (providerId) {
    case 'gemini':
      return [
        ...envList('GEMINI_MODEL'),
        process.env.DED_FAST_MODEL || '',
        process.env.GEMINI_FAST_MODEL || '',
        process.env.GEMINI_MODEL_FLASH_LITE || '',
        process.env.GEMINI_MODEL_FLASH || '',
        process.env.GEMINI_MODEL_PRO || '',
        'gemini-3.5-flash-lite',
        'gemini-3.8-flash',
        'gemini-2.5-flash',
      ].filter(Boolean);
    case 'inception':
      return envList('INCEPTION_MODEL');
    case 'zyrouter':
    case 'zrouter':
      return [
        ...envList('ZYROUTER_MODEL'),
        ...envList('DED_SCAN_AI_MODEL'),
        ...envList('ZROUTER_MODEL'),
        process.env.DED_DETAIL_MODEL || '',
        // Canonical ZyRouter gateway model id for Gemini Flash 3.8.
        // `gemini-3.8-flash` is the NATIVE Google id and does NOT resolve here.
        'geminiflash-3.8',
        'gpt-6-luna',
      ].filter(Boolean);
    case 'atria':
      return envList('ATRIA_MODEL');
    case 'vleee':
      return [
        ...envList('VLEEE_MODEL'),
        process.env.DED_STANDARD_TEXT_MODEL || '',
        process.env.DED_STANDARD_VISION_MODEL || '',
        'ali/qwen3.8-flash',
        'ali/qwen3.8-omni-flash',
      ].filter(Boolean);
    default:
      return [];
  }
}

// Discovery cache so model validation can accept catalog models not listed in env.
const discoveryCache: Map<string, { models: string[]; at: number }> = new Map();
const DISCOVERY_TTL_MS = 5 * 60 * 1000;

async function getDiscovered(providerId: string): Promise<string[]> {
  const hit = discoveryCache.get(providerId);
  if (hit && Date.now() - hit.at < DISCOVERY_TTL_MS) return hit.models;
  const models = await discoverModels(providerId);
  if (models.length > 0) discoveryCache.set(providerId, { models, at: Date.now() });
  return models;
}

function capabilitiesFor(providerId: string, modelId: string): string[] {
  const base = ['TEXT', 'STRUCTURED_OUTPUT'];
  if (providerId === 'gemini') {
    return [...base, 'VISION', 'IMAGE', 'PDF', 'OCR', 'DRAWING', 'LONG_CONTEXT'];
  }
  if (providerId === 'vleee') {
    const m = (modelId || '').toLowerCase();
    const isVision = m.includes('gemini') || m.includes('claude') || m.includes('omni') || m.includes('vision') || m.includes('qwen3.8');
    const isPdf = m.includes('gemini') || m.includes('claude') || m.includes('omni');
    const caps = [...base, 'REASONING', 'LONG_CONTEXT'];
    if (isVision) caps.push('VISION', 'IMAGE', 'OCR', 'DRAWING');
    if (isPdf) caps.push('PDF');
    return caps;
  }
  if (providerId === 'inception' || providerId === 'atria') {
    return [...base, 'REASONING', 'LONG_CONTEXT'];
  }
  if (providerId === 'zyrouter' || providerId === 'zrouter') {
    const m = (modelId || '').toLowerCase();
    const isMultimodal = m.includes('gemini') || m.includes('flash') || m.includes('gpt-6') || m.includes('luna') || m.includes('vision') || m.includes('omni') || m.includes('claude');
    const caps = [...base, 'REASONING', 'LONG_CONTEXT', 'TOOL_USE'];
    if (isMultimodal) {
      caps.push('VISION', 'IMAGE', 'PDF', 'OCR', 'DRAWING');
    }
    return caps;
  }
  return base;
}

function sendJson(res: ServerResponse, code: number, data: any): void {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 25 * 1024 * 1024) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(Buffer.from(c));
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Returns true when handled.
 */
export async function handleMultiProviderRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  const pathname = url.pathname;
  const method = req.method?.toUpperCase();
  if (!pathname.startsWith('/api/ai/multi-provider')) return false;

  ensureKeyPoolRegistered();

  let authCtx: any = null;
  try {
    authCtx = await AuthMiddleware.resolveContext(req.headers as any);
  } catch {
    // Unauthenticated or guest
  }
  const isSuperAdmin = authCtx?.role === 'SUPER_ADMIN';

  // GET /api/ai/multi-provider/providers (SUPER_ADMIN ONLY)
  if (pathname === '/api/ai/multi-provider/providers' && method === 'GET') {
    if (!isSuperAdmin) {
      sendJson(res, 403, {
        success: false,
        error: 'FORBIDDEN',
        message: 'Akses diagnostik penyedia AI internal dibatasi khusus untuk Super Admin.'
      });
      return true;
    }

    const providers: CatalogEntry[] = (['gemini', 'inception', 'zyrouter', 'zrouter', 'atria', 'vleee'] as const).map((pid) => {
      const envModels = configuredModels(pid);
      const cached = discoveryCache.get(pid);
      return {
        providerId: pid,
        models: cached ? Array.from(new Set([...envModels, ...cached.models])) : envModels,
        capabilities: capabilitiesFor(pid, envModels[0] || ''),
      };
    });
    sendJson(res, 200, {
      success: true,
      providers: providers.map((p) => ({
        ...p,
        configured: serverKeyPool.activeKeyCount(p.providerId) > 0,
        activeKeyCount: serverKeyPool.activeKeyCount(p.providerId),
      })),
      keyPool: serverKeyPool.getSafeStatus().map((k) => ({
        alias: k.alias,
        providerId: k.providerId,
        priority: k.priority,
        cooldownUntil: k.cooldownUntil,
        lastStatus: k.lastStatus,
        failureCount: k.failureCount,
        usageTodayUsd: k.usageTodayUsd,
      })),
      note: 'Model lists include live discovery cache. Capabilities reflect verified endpoint behavior only.',
    });
    return true;
  }

  // GET /api/ai/multi-provider/models?provider=gemini (SUPER_ADMIN ONLY)
  if (pathname === '/api/ai/multi-provider/models' && method === 'GET') {
    if (!isSuperAdmin) {
      sendJson(res, 403, {
        success: false,
        error: 'FORBIDDEN',
        message: 'Akses katalog model internal dibatasi khusus untuk Super Admin.'
      });
      return true;
    }

    const pid = url.searchParams.get('provider') || 'gemini';
    const models = await getDiscovered(pid);
    sendJson(res, 200, { success: models.length > 0, providerId: pid, models, cachedAt: Date.now() });
    return true;
  }

  // POST /api/ai/multi-provider/execute
  if (pathname === '/api/ai/multi-provider/execute' && method === 'POST') {
    let body: any;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { success: false, error: 'INVALID_BODY' });
      return true;
    }

    const prompt = String(body.prompt || '');
    if (!prompt.trim()) {
      sendJson(res, 400, { success: false, error: 'PROMPT_REQUIRED' });
      return true;
    }

    // Determine capability mode (quick, advanced, vision)
    const mode = body.mode ? String(body.mode) : (body.imageDataBase64 || body.pdfDataBase64 ? 'vision' : 'advanced');

    try {
      const response = await executeAiCapability({
        mode,
        prompt,
        systemPrompt: body.systemPrompt ? String(body.systemPrompt) : undefined,
        imageDataBase64: body.imageDataBase64 ? String(body.imageDataBase64) : undefined,
        imageMimeType: body.imageMimeType ? String(body.imageMimeType) : undefined,
        pdfDataBase64: body.pdfDataBase64 ? String(body.pdfDataBase64) : undefined,
        jsonMode: Boolean(body.jsonMode),
        temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
        maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : undefined,
        timeoutMs: typeof body.timeoutMs === 'number' ? Math.min(body.timeoutMs, 120000) : undefined,
        isSuperAdmin,
        internalProviderId: body.providerId ? String(body.providerId) : undefined,
        internalModelId: body.modelId ? String(body.modelId) : undefined,
      });

      sendJson(res, 200, response);
    } catch (err: any) {
      const kind = err instanceof ProviderExecError ? err.kind : 'SERVER_ERROR';
      const http = kind === 'RATE_LIMITED' ? 429 : kind === 'AUTH_ERROR' ? 503 : 502;
      const safeErrResponse: any = {
        success: false,
        assistant: mode === 'vision' ? 'EZRAB Vision' : mode === 'quick' ? 'EZRAB AI 1.3' : 'EZRAB AI Pro',
        mode,
        status: 'error',
        error: kind,
        message: 'Layanan AI mengalami kendala teknis saat memproses permintaan.',
      };
      if (isSuperAdmin) {
        safeErrResponse._diagnostics = {
          rawError: String(err.message).slice(0, 400),
          kind,
        };
      }
      sendJson(res, http, safeErrResponse);
    }
    return true;
  }

  // POST /api/ai/multi-provider/health (SUPER_ADMIN ONLY)
  if (pathname === '/api/ai/multi-provider/health' && method === 'POST') {
    if (!isSuperAdmin) {
      sendJson(res, 403, {
        success: false,
        error: 'FORBIDDEN',
        message: 'Akses pengujian status provider internal dibatasi khusus untuk Super Admin.'
      });
      return true;
    }

    let body: any = {};
    try {
      body = await readBody(req);
    } catch { /* default */ }
    const wanted: string[] = Array.isArray(body.providers) && body.providers.length
      ? body.providers
      : ['gemini', 'inception', 'zrouter', 'atria'];

    const results: Record<string, any> = {};
    await Promise.all(
      wanted.map(async (pid) => {
        if (serverKeyPool.activeKeyCount(pid) === 0) {
          results[pid] = { status: 'NOT_CONFIGURED' };
          return;
        }
        const models = configuredModels(pid);
        const model = models[0];
        if (!model) {
          results[pid] = { status: 'NO_MODEL_CONFIGURED' };
          return;
        }
        const start = Date.now();
        try {
          const r =
            pid === 'gemini'
              ? await chatGemini({ providerId: pid, modelId: model, prompt: 'Balas hanya: OK', maxTokens: 2000, timeoutMs: 30000 })
              : await chatOpenAiCompatible({ providerId: pid, modelId: model, prompt: 'Balas hanya: OK', maxTokens: 2000, timeoutMs: 45000 });
          results[pid] = { status: 'PASS', modelId: r.modelId, latencyMs: Date.now() - start, tokens: r.totalTokens, sample: r.content.slice(0, 60) };
        } catch (err: any) {
          results[pid] = { status: 'FAIL', error: (err instanceof ProviderExecError ? err.kind : 'ERROR') + ': ' + String(err.message).slice(0, 200), latencyMs: Date.now() - start };
        }
      })
    );
    sendJson(res, 200, { success: true, results });
    return true;
  }

  sendJson(res, 404, { success: false, error: 'MULTI_PROVIDER_ROUTE_NOT_FOUND', pathname });
  return true;
}
