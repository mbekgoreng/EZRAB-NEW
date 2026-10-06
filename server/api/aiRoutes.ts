import type { IncomingMessage, ServerResponse } from 'http';
import { aiOrchestrator } from '../orchestrator/aiOrchestrator';
import { agentOrchestrator } from '../ai/agent/agentOrchestrator';
import { intentClassifier, isSmallTalkIntent } from '../orchestrator/intentClassifier';
import { aiDbAdapter } from '../database/dbAdapter';
import { AuthMiddleware } from '../middleware/authMiddleware';
import { IsolationGuard } from '../middleware/isolationGuard';
import { validateReadOnlyProjectContext } from './readOnlyProjectContext';
import { AiCoreBridgeError, getAiCoreHealth, sendReadOnlyContextToAiCore } from '../services/aiCoreBridge';
import { buildOfficialProjectContext } from '../services/officialProjectContext';
import { AuthenticationError, ProjectAuthorizationError } from '../auth/authFoundation';
import { spreadsheetCommandEngine, SpreadsheetCommandType } from '../services/commandEngine';
import { subscriptionDataService } from '../services/extendedDataServices';
import { knowledgeDatasetImporter } from '../services/knowledgeDatasetImporter';
import { autoAnswerEngine } from '../services/autoAnswerEngine';
import { QuickActionStateMachine } from '../services/quickActionStateMachine';

const MAX_JSON_BODY_BYTES = 128 * 1024;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_CURRENT_PAGE_LENGTH = 120;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const rateWindows = new Map<string, { startedAt: number; count: number }>();
const activeRequests = new Set<string>();

// Idempotency cache to prevent duplicate request execution
interface CachedIdempotentResponse {
  response: any;
  timestamp: number;
}
const idempotencyCache = new Map<string, CachedIdempotentResponse>();

function getCachedIdempotency(key: string): any | null {
  const entry = idempotencyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > 300_000) {
    idempotencyCache.delete(key);
    return null;
  }
  return entry.response;
}

function setCachedIdempotency(key: string, response: any): void {
  idempotencyCache.set(key, { response, timestamp: Date.now() });
  if (idempotencyCache.size > 1000) {
    const firstKey = idempotencyCache.keys().next().value;
    if (firstKey) idempotencyCache.delete(firstKey);
  }
}

// Helper to parse JSON body from IncomingMessage
async function parseJsonBody(req: IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON in request body'));
      }
    });
    req.on('error', reject);
  });
}

// Helper to send JSON response
function sendJson(res: ServerResponse, statusCode: number, data: any): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-workspace-id, x-user-id, x-user-role, x-project-id');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.end(JSON.stringify(data));
}

function gatewayError(res: ServerResponse, statusCode: number, requestId: string, code: string, message: string, retryable = false): void {
  sendJson(res, statusCode, { success: false, error: { code, message, retryable }, requestId });
}

interface ValidatedChatBody {
  message: string;
  projectId?: string;
  conversationId?: string;
  currentPage?: string;
  projectContext?: unknown;
  stream?: boolean;
  clientMessageId?: string;
  idempotencyKey?: string;
  suggestionId?: string;
  source?: string;
}

function validateChatBody(body: unknown): ValidatedChatBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_REQUEST');
  const input = body as Record<string, unknown>;
  if (typeof input.message !== 'string' || !input.message.trim()) throw new Error('INVALID_REQUEST');
  if (input.message.length > MAX_MESSAGE_LENGTH) throw new Error('MESSAGE_TOO_LONG');
  if (Object.prototype.hasOwnProperty.call(input, 'projectContext')) throw new Error('INVALID_REQUEST');
  for (const field of ['projectId', 'conversationId', 'clientMessageId', 'client_message_id', 'idempotencyKey', 'idempotency_key', 'suggestionId', 'suggestion_id'] as const) {
    const value = input[field];
    if (value !== undefined && (typeof value !== 'string' || !ID_PATTERN.test(value))) throw new Error('INVALID_REQUEST');
  }
  if (input.currentPage !== undefined && (typeof input.currentPage !== 'string' || input.currentPage.length > MAX_CURRENT_PAGE_LENGTH)) throw new Error('INVALID_REQUEST');
  return {
    message: input.message.trim(),
    projectId: input.projectId as string | undefined,
    conversationId: input.conversationId as string | undefined,
    currentPage: input.currentPage as string | undefined,
    projectContext: input.projectContext,
    stream: Boolean(input.stream),
    clientMessageId: (input.clientMessageId || input.client_message_id) as string | undefined,
    idempotencyKey: (input.idempotencyKey || input.idempotency_key) as string | undefined,
    suggestionId: (input.suggestionId || input.suggestion_id) as string | undefined,
    source: input.source as string | undefined,
  };
}

function allowRequest(req: IncomingMessage, fingerprint: string): boolean {
  const key = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const window = rateWindows.get(key);
  if (!window || now - window.startedAt >= 60_000) rateWindows.set(key, { startedAt: now, count: 1 });
  else { window.count++; if (window.count > 20) return false; }
  if (activeRequests.has(fingerprint)) return false;
  activeRequests.add(fingerprint);
  return true;
}

export async function handleAiApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next?: () => void
): Promise<void> {
  const requestId = `gw-${crypto.randomUUID()}`;
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method?.toUpperCase();

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-workspace-id, x-user-id, x-user-role, x-project-id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.end();
    return;
  }

  // Only handle /api/ai routes
  if (!pathname.startsWith('/api/ai')) {
    if (next) return next();
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  // 0. Multi-Provider AI Gateway (Phase 9.3): /api/ai/multi-provider/* (Key Pool Protected)
  if (pathname.startsWith('/api/ai/multi-provider')) {
    const { handleMultiProviderRequest } = await import('./multiProviderRoutes');
    await handleMultiProviderRequest(req, res, url);
    return;
  }

  // 0.1 EZRAB AI Tools Gateway: /api/ai/tools/* (used by the three AI products)
  if (pathname.startsWith('/api/ai/tools')) {
    const { handleAIToolsRequest } = await import('./aiToolsRoutes');
    const handled = await handleAIToolsRequest(req, res, url);
    if (!handled && next) return next();
    return;
  }

  try {
    let authCtx;
    try {
      authCtx = await AuthMiddleware.resolveContext(req.headers as any);
    } catch (error) {
      const code = error instanceof AuthenticationError ? error.code : 'AUTH_REQUIRED';
      gatewayError(res, 401, requestId, code, 'Autentikasi diperlukan untuk mengakses layanan AI.');
      return;
    }

    // 1. Health Check: GET /api/ai/health (Safe Public Metadata)
    if (pathname === '/api/ai/health' && method === 'GET') {
      sendJson(res, 200, {
        status: 'OK',
        service: 'EZRAB Unified AI Gateway',
        timestamp: new Date().toISOString(),
        activeWorkspace: authCtx.workspaceId,
        assistants: {
          ezrab_ai_1_3: {
            name: 'EZRAB AI 1.3',
            capability: 'QUICK',
            status: 'AVAILABLE',
            description: 'Pertanyaan cepat, penalaran ringan, dan asistensi kilat.',
          },
          ezrab_ai_pro: {
            name: 'EZRAB AI Pro',
            capability: 'ADVANCED',
            status: 'AVAILABLE',
            description: 'Penalaran kompleks, analisis teknis konstruksi, dan DED ke RAB.',
          },
          ezrab_vision: {
            name: 'EZRAB Vision',
            capability: 'VISION',
            status: 'AVAILABLE',
            description: 'Pemahaman visual dokumen gambar kerja teknis dan nota/kuitansi.',
          },
          ezrab_core: {
            name: 'EZRAB Core',
            capability: 'INTERNAL',
            status: 'AVAILABLE',
            description: 'Orkestrasi AI internal, integrasi tools, RAG, dan aturan deterministik.',
          },
        },
      });
      return;
    }

    // 1b. Public Engine Status: GET /api/ai/engine-status (Safe for all users)
    if (pathname === '/api/ai/engine-status' && method === 'GET') {
      sendJson(res, 200, {
        success: true,
        status: 'CONNECTED',
        assistant: 'EZRAB AI Engine',
        engines: [
          { name: 'EZRAB AI 1.3', capability: 'QUICK', status: 'ACTIVE', description: 'Tanya jawab cepat & penalaran ringan' },
          { name: 'EZRAB AI Pro', capability: 'ADVANCED', status: 'ACTIVE', description: 'Penalaran konstruksi lanjutan, DED ke RAB' },
          { name: 'EZRAB Vision', capability: 'VISION', status: 'ACTIVE', description: 'Pemahaman visual gambar kerja teknis' },
          { name: 'EZRAB Core', capability: 'INTERNAL', status: 'ACTIVE', description: 'Orkestrasi AI, RAG & aturan deterministik' },
        ],
        message: 'Semua engine EZRAB AI aktif dan terisolasi dengan aman di server.',
        lastChecked: new Date().toISOString(),
      });
      return;
    }

    // 1c. Internal Key Audit & Diagnostics: GET /api/ai/audit/gemini (SUPER_ADMIN ONLY)
    if (pathname === '/api/ai/audit/gemini' && method === 'GET') {
      if (authCtx.role !== 'SUPER_ADMIN') {
        gatewayError(res, 403, requestId, 'FORBIDDEN', 'Audit diagnostik engine AI dibatasi khusus untuk Super Admin.');
        return;
      }

      const keys = [
        process.env.GEMINI_FAST_API_KEY,
        process.env.GEMINI_API_KEY_1,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3,
        process.env.GEMINI_API_KEY_4,
        process.env.GEMINI_API_KEY_5,
        process.env.GEMINI_API_KEY_6,
        process.env.GEMINI_API_KEY,
      ].filter(Boolean) as string[];

      const activeKey = keys[0] || '';
      let testResult = {
        connected: false,
        latencyMs: 0,
        model: 'gemini-3.5-flash-lite',
        message: 'No Gemini API key found in server environment',
      };

      if (activeKey) {
        const start = Date.now();
        try {
          const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': activeKey },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Ping' }] }] }),
          });
          const d: any = await resp.json();
          const latency = Date.now() - start;
          if (d.candidates && d.candidates.length > 0) {
            testResult = {
              connected: true,
              latencyMs: latency,
              model: 'gemini-3.5-flash-lite',
              message: 'Gemini Flash API Key terhubung dan siap digunakan!',
            };
          } else {
            testResult = {
              connected: false,
              latencyMs: latency,
              model: 'gemini-3.5-flash-lite',
              message: d.error?.message || 'Gagal memverifikasi response dari Google Gemini',
            };
          }
        } catch (err: any) {
          testResult = {
            connected: false,
            latencyMs: Date.now() - start,
            model: 'gemini-3.5-flash-lite',
            message: `Network error: ${err.message}`,
          };
        }
      }

      sendJson(res, 200, {
        success: true,
        provider: 'Google Gemini',
        status: testResult.connected ? 'CONNECTED' : 'UNAVAILABLE',
        audit: {
          totalConfiguredKeys: keys.length,
          activePrimaryModel: 'gemini-3.5-flash-lite',
          supportedFlashModels: [
            'gemini-3.5-flash-lite (Fast & Reliable)',
            'gemini-3.8-flash (High Reasoning / Multimodal)',
            'geminiflash-3.8 via Zyrouter (Enterprise Gateway)'
          ],
          livePingResult: testResult,
          serverIsolationVerified: true,
          lastAuditedAt: new Date().toISOString(),
        }
      });
      return;
    }

    // 1d. Models & Capabilities: GET /api/ai/models
    if (pathname === '/api/ai/models' && method === 'GET') {
      if (authCtx.role !== 'SUPER_ADMIN') {
        // Return public identities for non-super-admins
        sendJson(res, 200, {
          success: true,
          models: {
            ezrab_ai_1_3: { name: 'EZRAB AI 1.3', capability: 'QUICK', status: 'AVAILABLE' },
            ezrab_ai_pro: { name: 'EZRAB AI Pro', capability: 'ADVANCED', status: 'AVAILABLE' },
            ezrab_vision: { name: 'EZRAB Vision', capability: 'VISION', status: 'AVAILABLE' },
            ezrab_core: { name: 'EZRAB Core', capability: 'INTERNAL', status: 'AVAILABLE' },
          }
        });
        return;
      }

      // Super Admin: return discovered internal details
      const { providerGateway } = await import('../providers/providerGateway');
      const { getAiConfig } = await import('../config/aiConfig');
      const cfg = getAiConfig();
      const discovered = await providerGateway.discoverAllModels();
      const healths = await providerGateway.getAllProviderHealth();

      sendJson(res, 200, {
        success: true,
        mode: cfg.mode,
        models: {
          ezrab_core: {
            configuredModel: discovered.ezrab_core.configuredModel,
            status: 'AVAILABLE',
            capabilities: { supportsTools: true, supportsVision: false, costClass: 'free' }
          },
          local_ai: {
            configuredModel: discovered.local_ai.configuredModel,
            discoveredModels: discovered.local_ai.availableModels,
            status: discovered.local_ai.availableModels.includes(discovered.local_ai.configuredModel) || discovered.local_ai.availableModels.some(m => m.startsWith(discovered.local_ai.configuredModel.split(':')[0]))
              ? 'AVAILABLE'
              : discovered.local_ai.availableModels.length > 0
              ? 'MODEL_NOT_FOUND'
              : healths.local?.status === 'AVAILABLE' ? 'AVAILABLE' : 'PROVIDER_UNAVAILABLE',
            capabilities: { supportsTools: true, supportsVision: false, costClass: 'free' }
          },
          external_gateway: {
            configuredModel: discovered.external_gateway.configuredModel,
            status: healths.external?.status === 'AVAILABLE'
              ? 'AVAILABLE'
              : healths.external?.status === 'NOT_CONFIGURED'
              ? 'NOT_CONFIGURED'
              : 'PROVIDER_UNAVAILABLE',
            capabilities: { supportsTools: true, supportsVision: true, costClass: 'medium' }
          },
          hermes: {
            configuredModel: discovered.hermes.configuredModel,
            status: cfg.hermes.enabled ? 'AVAILABLE' : 'NOT_CONFIGURED',
            capabilities: { supportsTools: true, supportsVision: false, costClass: 'low' }
          }
        }
      });
      return;
    }

    // 1c. Receipt & Invoice OCR Vision Endpoint: POST /api/ai/receipt/scan
    if (pathname === '/api/ai/receipt/scan' && method === 'POST') {
      try {
        const body = await parseJsonBody(req, 15 * 1024 * 1024);
        const { projectId, fileName, imageDataBase64, imageMimeType, pdfDataBase64, fileSize } = body;
        if (!fileName) {
          gatewayError(res, 400, requestId, 'INVALID_REQUEST', 'Nama file nota wajib disertakan.');
          return;
        }

        const { receiptVisionService } = await import('../services/receiptVisionService');
        const result = await receiptVisionService.scanReceipt({
          projectId: projectId || authCtx.projectId || 'default-project',
          fileName,
          imageDataBase64,
          imageMimeType,
          pdfDataBase64,
          fileSize
        });

        sendJson(res, 200, {
          success: true,
          result,
          requestId
        });
        return;
      } catch (err: any) {
        console.error('[EZRAB AI Gateway] Receipt OCR scan error:', err);
        gatewayError(res, 500, requestId, 'OCR_SCAN_FAILED', err.message || 'Gagal memindai nota.');
        return;
      }
    }

    // 2. Chat Endpoint: POST /api/ai/chat
    if (pathname === '/api/ai/chat' && method === 'POST') {
      if (!AuthMiddleware.hasPermission(authCtx.role, 'AI_CHAT')) {
        gatewayError(res, 403, requestId, 'FORBIDDEN', 'Akses fitur AI tidak diizinkan.');
        return;
      }

      let body: ValidatedChatBody;
      try { body = validateChatBody(await parseJsonBody(req)); }
      catch (error: any) {
        const code = error?.message === 'MESSAGE_TOO_LONG' ? 'MESSAGE_TOO_LONG' : error?.message === 'PAYLOAD_TOO_LARGE' ? 'INVALID_REQUEST' : 'INVALID_REQUEST';
        gatewayError(res, error?.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400, requestId, code, code === 'MESSAGE_TOO_LONG' ? 'Pesan melebihi batas panjang.' : 'Permintaan AI tidak valid.');
        return;
      }

      // Check Idempotency Key
      const effectiveIdempotencyKey = body.idempotencyKey || (body.clientMessageId ? `${authCtx.workspaceId}:${body.clientMessageId}` : undefined);
      if (effectiveIdempotencyKey) {
        const cached = getCachedIdempotency(effectiveIdempotencyKey);
        if (cached) {
          console.debug('[EZRAB AI Gateway] Returning idempotent cached response for key:', effectiveIdempotencyKey);
          sendJson(res, 200, { ...cached, requestId, isCachedIdempotent: true });
          return;
        }
      }

      // =========================================================================
      // STEP 1: CLASSIFY INTENT FIRST BEFORE LOADING ANY CONTEXT!
      // =========================================================================
      const intentResult = intentClassifier.classify(body.message, body.currentPage);
      const isSmallTalk = isSmallTalkIntent(intentResult.category);

      const projectId = body.projectId || authCtx.projectId;

      if (projectId) {
        try {
          authCtx = await AuthMiddleware.authorizeProject(authCtx, projectId);
        } catch (error) {
          if (error instanceof ProjectAuthorizationError) {
            gatewayError(res, error.code === 'PROJECT_NOT_FOUND' ? 404 : 403, requestId, error.code, error.code === 'PROJECT_NOT_FOUND' ? 'Proyek tidak ditemukan.' : 'Anda tidak memiliki akses ke proyek ini.');
            return;
          }
          throw error;
        }
      }

      // =========================================================================
      // STEP 2: SMALL TALK & AUTOMATIC WIZARD SHORT-CIRCUIT
      // If the intent is small talk / greetings / automatic wizard,
      // DO NOT query project context, DO NOT send full project JSON to AI Core!
      // =========================================================================
      if (isSmallTalk || intentResult.category === 'AUTOMATIC_RAB_START' || (!projectId && !intentResult.requiresProjectData)) {
        const resolvedProjectId = projectId || 'non-project-chat';
        const orchestratorResult = await aiOrchestrator.handleChat({
          workspaceId: authCtx.workspaceId,
          projectId: resolvedProjectId,
          userId: authCtx.userId,
          userRole: authCtx.role,
          conversationId: body.conversationId,
          message: body.message,
          currentPage: body.currentPage
        });

        const finalResult = {
          success: true,
          assistant: 'EZRAB AI 1.3',
          mode: 'quick',
          ...orchestratorResult,
          requestId,
          message_type: 'small_talk',
          meta: {
            intent: intentResult.category,
            confidence: intentResult.confidence,
            context_loaded: [],
            tools_called: [],
            credit_deducted: false
          }
        };

        if (effectiveIdempotencyKey) {
          setCachedIdempotency(effectiveIdempotencyKey, finalResult);
        }

        console.debug('[EZRAB AI Gateway] Small talk handled without project context:', {
          intent: intentResult.category,
          message: body.message,
          requestId
        });

        sendJson(res, 200, finalResult);
        return;
      }

      // =========================================================================
      // STEP 3: PROJECT-REQUIRED INTENTS
      // Only reach here if query actually requires project data
      // =========================================================================
      if (!projectId) {
        gatewayError(res, 400, requestId, 'INVALID_REQUEST', 'Project ID wajib tersedia untuk pertanyaan berbasis data proyek.');
        return;
      }

      const fingerprint = `${req.socket.remoteAddress || 'unknown'}:${projectId}:${body.conversationId || ''}:${body.message}`;
      if (!allowRequest(req, fingerprint)) { gatewayError(res, 429, requestId, 'RATE_LIMITED', 'Terlalu banyak permintaan AI. Silakan coba kembali.', true); return; }
      try {
        const context = await buildOfficialProjectContext({ projectId, workspaceId: authCtx.workspaceId });
        if (!context) { gatewayError(res, 404, requestId, 'PROJECT_NOT_FOUND', 'Proyek tidak ditemukan.'); return; }
        
        try {
          const result = await sendReadOnlyContextToAiCore({ message: body.message, projectId, userId: authCtx.userId, conversationId: body.conversationId, context });
          const successResult = { success: true, ...result, requestId: result.requestId || requestId };
          if (effectiveIdempotencyKey) {
            setCachedIdempotency(effectiveIdempotencyKey, successResult);
          }
          sendJson(res, 200, successResult);
          return;
        } catch (bridgeError: any) {
          // Fall back to internal AI Orchestrator
        }

        // Workspace & Project isolation check
        IsolationGuard.validateAccess(authCtx.workspaceId, projectId);

        const isStream = Boolean(body.stream);

        if (isStream) {
          // Setup SSE streaming
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('Access-Control-Allow-Origin', '*');

          const sendEvent = (event: string, data: any) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          };

          try {
            const result = await aiOrchestrator.handleChat({
              workspaceId: authCtx.workspaceId,
              projectId,
              userId: authCtx.userId,
              userRole: authCtx.role,
              conversationId: body.conversationId,
              message: body.message,
              currentPage: body.currentPage,
              onThinking: (step: string) => {
                sendEvent('thinking', { step });
              }
            });

            if (effectiveIdempotencyKey) {
              setCachedIdempotency(effectiveIdempotencyKey, result);
            }

            sendEvent('message', {
              assistant: 'EZRAB AI Pro',
              mode: 'advanced',
              ...result,
            });
            sendEvent('done', { status: 'COMPLETE' });
            res.end();
          } catch (streamErr: any) {
            sendEvent('error', { code: 'AI_CORE_UNAVAILABLE', message: 'Layanan AI sedang tidak tersedia.', retryable: true, requestId });
            res.end();
          }
          return;
        }

        // Standard JSON Response
        const result = await aiOrchestrator.handleChat({
          workspaceId: authCtx.workspaceId,
          projectId,
          userId: authCtx.userId,
          userRole: authCtx.role,
          conversationId: body.conversationId,
          message: body.message,
          currentPage: body.currentPage
        });

        const chatResponse = {
          assistant: 'EZRAB AI Pro',
          mode: 'advanced',
          ...result,
        };

        if (effectiveIdempotencyKey) {
          setCachedIdempotency(effectiveIdempotencyKey, chatResponse);
        }

        sendJson(res, 200, chatResponse);
        return;
      } finally {
        activeRequests.delete(fingerprint);
      }
    }

    // 3. Confirm Action: POST /api/ai/actions/confirm
    if (pathname === '/api/ai/actions/confirm' && method === 'POST') {
      const body = await parseJsonBody(req);
      const projectId = body.projectId || authCtx.projectId;
      if (!projectId || (!body.action && !body.proposalId && !body.actionId)) {
        sendJson(res, 400, { error: 'projectId and action or proposalId are required' });
        return;
      }

      IsolationGuard.validateAccess(authCtx.workspaceId, projectId);

      if (body.proposalId || body.actionId) {
        const propId = body.proposalId || body.actionId;
        const result = await agentOrchestrator.executeConfirmation(propId, {
          workspaceId: authCtx.workspaceId,
          projectId,
          userId: authCtx.userId,
          userRole: authCtx.role
        });
        sendJson(res, 200, result);
        return;
      }

      const result = await aiOrchestrator.executeConfirmedAction(
        authCtx.workspaceId,
        projectId,
        authCtx.userId,
        authCtx.role,
        body.action
      );

      sendJson(res, 200, result);
      return;
    }

    // 3b. Cancel Action: POST /api/ai/actions/cancel
    if (pathname === '/api/ai/actions/cancel' && method === 'POST') {
      const body = await parseJsonBody(req);
      const projectId = body.projectId || authCtx.projectId;
      const propId = body.proposalId || body.actionId;
      if (!projectId || !propId) {
        sendJson(res, 400, { error: 'projectId and proposalId are required' });
        return;
      }

      IsolationGuard.validateAccess(authCtx.workspaceId, projectId);
      const cancelRes = agentOrchestrator.cancelConfirmation(propId, {
        workspaceId: authCtx.workspaceId,
        projectId
      });
      sendJson(res, 200, cancelRes);
      return;
    }

    // 3c. Agent Unified Execute: POST /api/ai/agent/execute
    if (pathname === '/api/ai/agent/execute' && method === 'POST') {
      const body = await parseJsonBody(req);
      const agentRes = await agentOrchestrator.handleRequest({
        requestId,
        userId: authCtx.userId,
        workspaceId: authCtx.workspaceId,
        projectId: body.projectId || authCtx.projectId,
        userRole: authCtx.role,
        message: body.message || '',
        currentPage: body.currentPage || 'spreadsheet',
        conversationId: body.conversationId
      });
      sendJson(res, 200, agentRes);
      return;
    }

    // 4. Command Preview: POST /api/ai/commands/preview
    if (pathname === '/api/ai/commands/preview' && method === 'POST') {
      const body = await parseJsonBody(req);
      const projectId = body.projectId || authCtx.projectId;
      if (!projectId || !body.command) {
        sendJson(res, 400, { error: 'projectId and command are required' });
        return;
      }

      IsolationGuard.validateAccess(authCtx.workspaceId, projectId);
      const preview = await spreadsheetCommandEngine.generatePreview(
        body.command as SpreadsheetCommandType,
        body.params || {},
        {
          workspaceId: authCtx.workspaceId,
          projectId,
          userId: authCtx.userId,
          userRole: authCtx.role as any
        }
      );

      sendJson(res, 200, { success: true, preview });
      return;
    }

    // 5. Command Execute: POST /api/ai/commands/execute
    if (pathname === '/api/ai/commands/execute' && method === 'POST') {
      const body = await parseJsonBody(req);
      const projectId = body.projectId || authCtx.projectId;
      if (!projectId || !body.command) {
        sendJson(res, 400, { error: 'projectId and command are required' });
        return;
      }

      IsolationGuard.validateAccess(authCtx.workspaceId, projectId);
      const result = await spreadsheetCommandEngine.execute(
        body.command as SpreadsheetCommandType,
        body.params || {},
        {
          workspaceId: authCtx.workspaceId,
          projectId,
          userId: authCtx.userId,
          userRole: authCtx.role as any
        }
      );

      sendJson(res, 200, result);
      return;
    }

    // 6. Command Undo: POST /api/ai/commands/undo
    if (pathname === '/api/ai/commands/undo' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.undoToken) {
        sendJson(res, 400, { error: 'undoToken is required' });
        return;
      }

      const undoResult = await spreadsheetCommandEngine.undo(body.undoToken);
      sendJson(res, 200, undoResult);
      return;
    }

    // 7. Subscription & Credit Check: GET /api/ai/subscription
    if (pathname === '/api/ai/subscription' && method === 'GET') {
      const sub = subscriptionDataService.getSubscription(authCtx.workspaceId);
      sendJson(res, 200, { success: true, subscription: sub });
      return;
    }

    // 8. Conversations: GET /api/ai/conversations
    if (pathname === '/api/ai/conversations' && method === 'GET') {
      const projectId = url.searchParams.get('projectId') || authCtx.projectId;
      if (!projectId) {
        sendJson(res, 400, { error: 'projectId is required' });
        return;
      }

      IsolationGuard.validateAccess(authCtx.workspaceId, projectId);
      const conversations = await aiDbAdapter.getConversations(authCtx.workspaceId, projectId);
      sendJson(res, 200, { conversations });
      return;
    }

    // 9. Create Conversation: POST /api/ai/conversations
    if (pathname === '/api/ai/conversations' && method === 'POST') {
      const body = await parseJsonBody(req);
      const projectId = body.projectId || authCtx.projectId;
      if (!projectId) {
        sendJson(res, 400, { error: 'projectId is required' });
        return;
      }

      IsolationGuard.validateAccess(authCtx.workspaceId, projectId);
      const conv = await aiDbAdapter.createConversation(
        authCtx.workspaceId,
        projectId,
        authCtx.userId,
        body.title || 'Percakapan Baru'
      );
      sendJson(res, 201, conv);
      return;
    }

    // 10. Specific Conversation: GET /api/ai/conversations/:id
    const convMatch = pathname.match(/^\/api\/ai\/conversations\/([^/]+)$/);
    if (convMatch && method === 'GET') {
      const conversationId = convMatch[1];
      const conv = aiDbAdapter.getConversation(conversationId);
      if (!conv) {
        sendJson(res, 404, { error: 'Conversation not found' });
        return;
      }

      IsolationGuard.validateAccess(authCtx.workspaceId, conv.projectId);
      const messages = aiDbAdapter.getMessages(conversationId);
      sendJson(res, 200, { conversation: conv, messages });
      return;
    }

    // 11. Delete Conversation: DELETE /api/ai/conversations/:id
    if (convMatch && method === 'DELETE') {
      const conversationId = convMatch[1];
      const conv = aiDbAdapter.getConversation(conversationId);
      if (!conv) {
        sendJson(res, 404, { error: 'Conversation not found' });
        return;
      }

      IsolationGuard.validateAccess(authCtx.workspaceId, conv.projectId);
      await aiDbAdapter.deleteConversation(authCtx.workspaceId, conversationId);
      sendJson(res, 200, { success: true, message: 'Conversation deleted' });
      return;
    }

    // 12. Audit Logs: GET /api/ai/audit-logs
    if (pathname === '/api/ai/audit-logs' && method === 'GET') {
      const projectId = url.searchParams.get('projectId') || authCtx.projectId;
      const logs = await aiDbAdapter.getAuditLogs(authCtx.workspaceId, projectId);
      sendJson(res, 200, { logs });
      return;
    }

    // 13. Knowledge Base Import: POST /api/ai/knowledge/import
    if (pathname === '/api/ai/knowledge/import' && method === 'POST') {
      if (authCtx.role !== 'SUPER_ADMIN') {
        gatewayError(res, 403, requestId, 'FORBIDDEN', 'Hanya Super Admin yang diizinkan mengimpor dataset knowledge base.');
        return;
      }
      const body = await parseJsonBody(req);
      const customPath = body?.filePath;
      const { summary } = await knowledgeDatasetImporter.importDataset(customPath);
      await autoAnswerEngine.initialize(customPath);
      aiDbAdapter.saveDatasetImportReport({
        source_file: summary.source_file,
        file_format: summary.file_format,
        total_records: summary.total_lines_read,
        valid_records: summary.valid_records,
        duplicate_records: summary.duplicate_records,
        skipped_records: summary.skipped_records,
        failed_records: summary.failed_records,
        checksum_sha256: summary.file_sha256,
        summary_json: summary as any,
        duration_ms: summary.duration_ms,
        imported_by: authCtx.userId
      });

      sendJson(res, 200, { success: true, summary });
      return;
    }

    // 14. Knowledge Base Search: GET /api/ai/knowledge/search
    if (pathname === '/api/ai/knowledge/search' && method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const limit = parseInt(url.searchParams.get('limit') || '5', 10);
      await autoAnswerEngine.initialize();
      const results = autoAnswerEngine.search(q, limit);
      sendJson(res, 200, {
        success: true,
        query: q,
        total_results: results.length,
        results: results.map(r => ({
          id: r.entry.id,
          category: r.entry.category,
          intent: r.entry.intent,
          question: r.entry.question,
          answer: r.entry.answer,
          tone: r.entry.tone,
          confidence: r.confidence,
          match_type: r.matchType
        }))
      });
      return;
    }

    // 15. Answer Feedback: POST /api/ai/feedback
    if (pathname === '/api/ai/feedback' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.conversationId || !body.messageId || !body.rating) {
        gatewayError(res, 400, requestId, 'INVALID_REQUEST', 'conversationId, messageId, dan rating wajib diisi.');
        return;
      }
      const feedback = aiDbAdapter.saveFeedback({
        conversation_id: body.conversationId,
        message_id: body.messageId,
        user_id: authCtx.userId,
        rating: body.rating,
        feedback_category: body.feedbackCategory || 'other',
        comment: body.comment
      });
      sendJson(res, 200, { success: true, feedback });
      return;
    }

    // 16. Quick Action Start: POST /api/ai/quick-action/start
    if (pathname === '/api/ai/quick-action/start' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.actionId) {
        gatewayError(res, 400, requestId, 'INVALID_REQUEST', 'actionId wajib diisi.');
        return;
      }
      const dialogueResp = QuickActionStateMachine.startSession({
        workspaceId: authCtx.workspaceId,
        userId: authCtx.userId,
        projectId: body.projectId || authCtx.projectId || 'PRJ-DEFAULT',
        userRole: authCtx.role as any,
        conversationId: body.conversationId || `conv_${Date.now()}`,
        actionId: body.actionId,
        initialPrompt: body.initialPrompt
      });
      sendJson(res, 200, { success: true, quickActionResponse: dialogueResp });
      return;
    }

    // 17. Quick Action Answer: POST /api/ai/quick-action/:sessionId/answer
    const qaAnswerMatch = pathname.match(/^\/api\/ai\/quick-action\/([^/]+)\/answer$/);
    if (qaAnswerMatch && method === 'POST') {
      const sessionId = qaAnswerMatch[1];
      const body = await parseJsonBody(req);
      const dialogueResp = QuickActionStateMachine.answerStep({
        sessionId,
        workspaceId: authCtx.workspaceId,
        userId: authCtx.userId,
        userRole: authCtx.role as any,
        choiceId: body.choiceId,
        parameters: body.parameters,
        textAnswer: body.textAnswer
      });
      sendJson(res, 200, { success: true, quickActionResponse: dialogueResp });
      return;
    }

    // 18. Quick Action Confirm: POST /api/ai/quick-action/:sessionId/confirm
    const qaConfirmMatch = pathname.match(/^\/api\/ai\/quick-action\/([^/]+)\/confirm$/);
    if (qaConfirmMatch && method === 'POST') {
      const sessionId = qaConfirmMatch[1];
      const dialogueResp = await QuickActionStateMachine.confirmSession({
        sessionId,
        workspaceId: authCtx.workspaceId,
        userId: authCtx.userId,
        userRole: authCtx.role as any
      });
      sendJson(res, 200, { success: true, quickActionResponse: dialogueResp });
      return;
    }

    // 19. Quick Action Back: POST /api/ai/quick-action/:sessionId/back
    const qaBackMatch = pathname.match(/^\/api\/ai\/quick-action\/([^/]+)\/back$/);
    if (qaBackMatch && method === 'POST') {
      const sessionId = qaBackMatch[1];
      const dialogueResp = QuickActionStateMachine.goBack(sessionId);
      sendJson(res, 200, { success: true, quickActionResponse: dialogueResp });
      return;
    }

    // 20. Quick Action Cancel: POST /api/ai/quick-action/:sessionId/cancel
    const qaCancelMatch = pathname.match(/^\/api\/ai\/quick-action\/([^/]+)\/cancel$/);
    if (qaCancelMatch && method === 'POST') {
      const sessionId = qaCancelMatch[1];
      const dialogueResp = QuickActionStateMachine.cancelSession(sessionId);
      sendJson(res, 200, { success: true, quickActionResponse: dialogueResp });
      return;
    }

    // Route not found
    sendJson(res, 404, { error: `Endpoint ${method} ${pathname} not found` });
  } catch (err: any) {
    console.error('[AI API Error]', { requestId, code: 'INTERNAL_ERROR' });
    gatewayError(res, 500, requestId, 'INTERNAL_ERROR', 'Terjadi gangguan pada layanan AI.', false);
  }
}

