import type { IncomingMessage, ServerResponse } from 'http';
import { AuthMiddleware } from '../middleware/authMiddleware';
import { WizardStateMachine } from '../services/wizardStateMachine';

const MAX_JSON_BODY_BYTES = 128 * 1024;

async function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_JSON_BODY_BYTES) {
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

function sendJson(res: ServerResponse, statusCode: number, data: any): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-workspace-id, x-user-id, x-user-role, x-project-id');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.end(JSON.stringify(data));
}

export async function handleWizardApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method?.toUpperCase();

  // Handle CORS preflight for /api/assistant/wizard
  if (method === 'OPTIONS' && pathname.startsWith('/api/assistant/wizard')) {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-workspace-id, x-user-id, x-user-role, x-project-id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.end();
    return true;
  }

  if (!pathname.startsWith('/api/assistant/wizard')) {
    return false;
  }

  try {
    const authCtx = await AuthMiddleware.resolveContext(req.headers as any);

    // 1. POST /api/assistant/wizard/start
    if (pathname === '/api/assistant/wizard/start' && method === 'POST') {
      const body = await parseJsonBody(req);
      const projectId = body.projectId || authCtx.projectId || 'PRJ-DEFAULT';
      const conversationId = body.conversationId || `conv_${Date.now()}`;

      const wizardResponse = WizardStateMachine.startSession({
        workspaceId: authCtx.workspaceId,
        userId: authCtx.userId,
        projectId,
        conversationId,
        initialQuery: body.initialQuery
      });

      sendJson(res, 200, { success: true, wizardResponse });
      return true;
    }

    // 2. POST /api/assistant/wizard/:sessionId/answer
    const answerMatch = pathname.match(/^\/api\/assistant\/wizard\/([^/]+)\/answer$/);
    if (answerMatch && method === 'POST') {
      const sessionId = answerMatch[1];
      const body = await parseJsonBody(req);

      const wizardResponse = WizardStateMachine.answerStep({
        sessionId,
        workspaceId: authCtx.workspaceId,
        userId: authCtx.userId,
        choiceId: body.choiceId,
        parameters: body.parameters
      });

      sendJson(res, 200, { success: true, wizardResponse });
      return true;
    }

    // 3. GET /api/assistant/wizard/:sessionId
    const getMatch = pathname.match(/^\/api\/assistant\/wizard\/([^/]+)$/);
    if (getMatch && method === 'GET') {
      const sessionId = getMatch[1];
      const session = WizardStateMachine.getSession(sessionId, authCtx.workspaceId);
      if (!session) {
        sendJson(res, 404, { success: false, error: 'Sesi wizard tidak ditemukan.' });
        return true;
      }
      sendJson(res, 200, { success: true, session });
      return true;
    }

    // 4. POST /api/assistant/wizard/:sessionId/back
    const backMatch = pathname.match(/^\/api\/assistant\/wizard\/([^/]+)\/back$/);
    if (backMatch && method === 'POST') {
      const sessionId = backMatch[1];
      const wizardResponse = WizardStateMachine.goBack(sessionId, authCtx.workspaceId);
      sendJson(res, 200, { success: true, wizardResponse });
      return true;
    }

    // 5. POST /api/assistant/wizard/:sessionId/cancel
    const cancelMatch = pathname.match(/^\/api\/assistant\/wizard\/([^/]+)\/cancel$/);
    if (cancelMatch && method === 'POST') {
      const sessionId = cancelMatch[1];
      const result = WizardStateMachine.cancelSession(sessionId, authCtx.workspaceId);
      sendJson(res, 200, result);
      return true;
    }

    // 6. POST /api/assistant/wizard/:sessionId/confirm
    const confirmMatch = pathname.match(/^\/api\/assistant\/wizard\/([^/]+)\/confirm$/);
    if (confirmMatch && method === 'POST') {
      const sessionId = confirmMatch[1];
      const body = await parseJsonBody(req);
      const projectId = body.projectId || authCtx.projectId;

      if (!projectId) {
        sendJson(res, 400, { success: false, error: 'Project ID wajib tersedia untuk menerapkan RAB.' });
        return true;
      }

      const idempotencyKey = body.idempotencyKey || (req.headers['x-idempotency-key'] as string);

      const result = WizardStateMachine.confirmAndApply({
        sessionId,
        workspaceId: authCtx.workspaceId,
        userId: authCtx.userId,
        projectId,
        idempotencyKey
      });

      sendJson(res, 200, result);
      return true;
    }

    sendJson(res, 404, { success: false, error: `Endpoint ${method} ${pathname} tidak ditemukan.` });
    return true;
  } catch (err: any) {
    sendJson(res, 400, { success: false, error: err.message || 'Terjadi kesalahan pada wizard.' });
    return true;
  }
}
