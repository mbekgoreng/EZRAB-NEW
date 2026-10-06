/**
 * EZRAB AI Tools Gateway (server/api/aiToolsRoutes.ts)
 *
 * Mounted from aiRoutes.ts under /api/ai/tools/*.
 * This gateway implements the registry gate server-side: it resolves the target
 * model from the SAME aiModelRegistry used by the browser, sends that model to the
 * provider, and never silently substitutes. Responses carry `requestedModel` vs
 * `sentModel` for full transparency.
 *
 * Request contract (POST /api/ai/tools/execute):
 *   { productId: 'EZRAB_AI' | 'DED_AI_FAST' | 'DED_AI_DETAIL' | 'DOKUMEN_AI',
 *     prompt, systemPrompt?, jsonMode?, temperature?, maxTokens?, timeoutMs?,
 *     imageDataBase64?, imageMimeType?, pdfDataBase64? }
 *
 * Response:
 *   success: true  -> { success, content, structured?, requestId }
 *   success: false -> { success, errorCode, stage, message, retryable }
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { chatGemini, chatOpenAiCompatible, ProviderExecError } from '../providers/multiProvider/adapters';

// The registry lives under src and exports plain functions; we import it lazily
// to avoid bundling every AI-tool UI into the server. It only has pure code.
async function loadRegistry() {
  const mod = await import('../../src/ai-tools/aiModelRegistry');
  return mod;
}

async function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 30 * 1024 * 1024) {
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

function sendJson(res: ServerResponse, code: number, data: any): void {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(data));
}

/** Maps a thrown ProviderExecError / generic error into the structured envelope. */
function mapError(err: any): { errorCode: string; retryable: boolean; raw: string } {
  const kind = err instanceof ProviderExecError ? err.kind : 'INTERNAL';
  const raw = String(err?.message || '').slice(0, 400);
  let errorCode = 'MODEL_ERROR';
  let retryable = false;
  switch (kind) {
    case 'RATE_LIMITED':
      errorCode = 'MODEL_ERROR';
      retryable = true;
      break;
    case 'AUTH_ERROR':
      errorCode = 'MODEL_ERROR';
      retryable = false;
      break;
    case 'TIMEOUT':
      errorCode = 'MODEL_TIMEOUT';
      retryable = true;
      break;
    case 'UNSUPPORTED':
      errorCode = 'MODEL_PROVIDER_404';
      retryable = false;
      break;
    case 'INVALID_RESPONSE':
      errorCode = 'EMPTY_RESPONSE';
      retryable = true;
      break;
    case 'SERVER_ERROR':
    default:
      if (/^HTTP 404/.test(raw)) {
        errorCode = 'MODEL_PROVIDER_404';
        retryable = false;
      } else if (/^HTTP 429/.test(raw)) {
        errorCode = 'MODEL_ERROR';
        retryable = true;
      } else if (/timeout|timed out|ETIMEDOUT/i.test(raw)) {
        errorCode = 'MODEL_TIMEOUT';
        retryable = true;
      }
  }
  return { errorCode, retryable, raw };
}

/**
 * Main entry. Returns true when handled, false otherwise.
 */
export async function handleAIToolsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  const pathname = url.pathname;
  const method = req.method?.toUpperCase();

  if (!pathname.startsWith('/api/ai/tools')) return false;

  // Health
  if (pathname === '/api/ai/tools/health' && method === 'GET') {
    sendJson(res, 200, { status: 'OK', service: 'EZRAB AI Tools' });
    return true;
  }

  if (pathname !== '/api/ai/tools/execute') {
    sendJson(res, 404, {
      success: false,
      errorCode: 'INTERNAL',
      stage: 'routes',
      message: 'Rute tidak dikenali: ' + pathname,
      retryable: false,
    });
    return true;
  }

  if (method !== 'POST') {
    sendJson(res, 405, { success: false, errorCode: 'INTERNAL', stage: 'routes', message: 'Method tidak diizinkan', retryable: false });
    return true;
  }

  let body: any;
  try {
    body = await readBody(req);
  } catch (e: any) {
    sendJson(res, 400, { success: false, errorCode: 'INTERNAL', stage: 'routes', message: e.message === 'PAYLOAD_TOO_LARGE' ? 'Berkas terlalu besar' : 'Body bukan JSON valid', retryable: false });
    return true;
  }

  const productId = String(body.productId || '');
  const allowed: string[] = ['EZRAB_AI', 'DED_AI_FAST', 'DED_AI_DETAIL', 'DOKUMEN_AI'];
  if (!allowed.includes(productId)) {
    sendJson(res, 400, { success: false, errorCode: 'INTERNAL', stage: 'routes', message: `productId tidak dikenal: ${productId}`, retryable: false });
    return true;
  }

  const prompt = String(body.prompt || '');
  if (!prompt.trim()) {
    sendJson(res, 400, { success: false, errorCode: 'INTERNAL', stage: 'routes', message: 'prompt wajib diisi', retryable: false });
    return true;
  }

  // ---- Registry gate (single authority) ----
  const { getModelTarget } = await loadRegistry();
  const target = getModelTarget(productId as any);

  const payload: any = {
    providerId: target.provider,
    modelId: target.model,
    prompt,
    systemPrompt: body.systemPrompt ? String(body.systemPrompt) : undefined,
    jsonMode: Boolean(body.jsonMode),
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.1,
    maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : 6000,
    timeoutMs: typeof body.timeoutMs === 'number' ? Math.min(body.timeoutMs, 180000) : 90000,
    imageDataBase64: body.imageDataBase64 ? String(body.imageDataBase64) : undefined,
    imageMimeType: body.imageMimeType ? String(body.imageMimeType) : 'image/png',
    pdfDataBase64: body.pdfDataBase64 ? String(body.pdfDataBase64) : undefined,
  };

  try {
    const result =
      target.provider === 'gemini'
        ? await chatGemini(payload)
        : await chatOpenAiCompatible(payload);

    if (!result || typeof result.content !== 'string' || result.content.trim() === '') {
      sendJson(res, 200, {
        success: false,
        errorCode: 'EMPTY_RESPONSE',
        stage: `${productId}:provider`,
        message: 'Model mengembalikan respons kosong.',
        requestedModel: target.model,
        sentModel: target.model,
        retryable: true,
      });
      return true;
    }

    sendJson(res, 200, {
      success: true,
      content: result.content,
      structured: result.structuredData ?? null,
      requestedModel: target.model,
      sentModel: target.model,
      resolveSource: target.resolveSource,
      requestId: `tools-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    return true;
  } catch (err: any) {
    const mapped = mapError(err);
    sendJson(res, 200, {
      success: false,
      errorCode: mapped.errorCode,
      stage: `${productId}:provider`,
      message: mapped.raw,
      requestedModel: target.model,
      sentModel: target.model,
      retryable: mapped.retryable,
    });
    return true;
  }
}
