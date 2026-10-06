import type { IncomingMessage, ServerResponse } from 'http';
import { brandingService, SubscriptionPlan, MAX_LOGO_SIZE_BYTES } from '../services/brandingService';

const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5 MB for body handling (base64 overhead)

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-workspace-id');
  res.end(JSON.stringify(payload));
}

function sendError(res: ServerResponse, status: number, code: string, message: string) {
  sendJson(res, status, {
    success: false,
    error: { code, message },
  });
}

async function readBodyJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

function extractWorkspaceId(pathname: string): { workspaceId?: string; subResource?: string; action?: string } {
  // Pattern: /api/workspaces/:workspaceId/branding(/logo)?
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'workspaces') return {};
  const workspaceId = parts[2];
  const subResource = parts[3]; // 'branding' or 'subscription'
  const action = parts[4]; // 'logo' or 'test-tier'
  return { workspaceId, subResource, action };
}

export async function handleBrandingApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (!url.pathname.startsWith('/api/workspaces')) return false;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-workspace-id');
    res.end();
    return true;
  }

  const { workspaceId, subResource, action } = extractWorkspaceId(url.pathname);
  if (!workspaceId) {
    sendError(res, 400, 'INVALID_WORKSPACE', 'Workspace ID tidak ditemukan pada path.');
    return true;
  }

  try {
    // 1. Subscription management test helper (DISABLED IN PRODUCTION)
    if (subResource === 'subscription' && action === 'test-tier' && req.method === 'POST') {
      if (process.env.NODE_ENV === 'production') {
        sendError(res, 404, 'NOT_FOUND', 'Endpoint tidak tersedia di lingkungan production.');
        return true;
      }
      const body = await readBodyJson(req);
      const plan = body.plan as SubscriptionPlan;
      if (!['free', 'trial', 'basic', 'pro', 'enterprise'].includes(plan)) {
        sendError(res, 400, 'INVALID_PLAN', 'Paket langganan tidak valid.');
        return true;
      }
      const updated = brandingService.setSubscriptionPlan(workspaceId, plan);
      sendJson(res, 200, { success: true, branding: updated });
      return true;
    }

    // 2. Branding endpoints
    if (subResource === 'branding') {
      // Serve raw logo file
      if (action === 'logo' && req.method === 'GET') {
        const file = await brandingService.getLogoFile(workspaceId);
        if (!file) {
          sendError(res, 404, 'LOGO_NOT_FOUND', 'Logo perusahaan tidak ditemukan.');
          return true;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.end(file.buffer);
        return true;
      }

      // Upload logo
      if (action === 'logo' && req.method === 'POST') {
        const contentType = req.headers['content-type'] || '';
        let fileBuffer: Buffer | null = null;
        let declaredMime: string | undefined;

        if (contentType.includes('application/json')) {
          const jsonBody = await readBodyJson(req);
          if (!jsonBody.data || typeof jsonBody.data !== 'string') {
            sendError(res, 400, 'INVALID_PAYLOAD', 'Payload data gambar tidak ditemukan.');
            return true;
          }

          // Support base64 Data URL (e.g. data:image/png;base64,....)
          let base64Content = jsonBody.data;
          const matchDataUrl = base64Content.match(/^data:([^;]+);base64,(.+)$/);
          if (matchDataUrl) {
            declaredMime = matchDataUrl[1];
            base64Content = matchDataUrl[2];
          } else if (jsonBody.mime) {
            declaredMime = jsonBody.mime;
          }

          fileBuffer = Buffer.from(base64Content, 'base64');
        } else {
          // Direct binary upload
          fileBuffer = await readRawBody(req);
          declaredMime = contentType.split(';')[0].trim();
        }

        if (!fileBuffer || fileBuffer.length === 0) {
          sendError(res, 400, 'EMPTY_FILE', 'File gambar kosong.');
          return true;
        }

        try {
          const result = brandingService.uploadLogo(workspaceId, fileBuffer, declaredMime);
          sendJson(res, 200, {
            success: true,
            branding: result.branding,
            logoUrl: result.logoUrl,
            message: 'Logo perusahaan berhasil diunggah.',
          });
        } catch (err: any) {
          const msg = err.message || '';
          if (msg.startsWith('SUBSCRIPTION_REQUIRED')) {
            sendError(res, 403, 'SUBSCRIPTION_REQUIRED', 'Upload logo perusahaan tersedia untuk paket berbayar.');
          } else if (msg.startsWith('FILE_TOO_LARGE')) {
            sendError(res, 413, 'FILE_TOO_LARGE', 'Ukuran file logo maksimal adalah 2 MB.');
          } else if (msg.startsWith('INVALID_MIME') || msg.startsWith('INVALID_IMAGE')) {
            sendError(res, 400, 'INVALID_IMAGE', 'Format gambar tidak valid. Gunakan PNG, JPG/JPEG, atau WebP.');
          } else {
            sendError(res, 500, 'UPLOAD_FAILED', 'Gagal memproses file logo.');
          }
        }
        return true;
      }

      // Delete logo
      if (action === 'logo' && req.method === 'DELETE') {
        const updated = brandingService.deleteLogo(workspaceId);
        sendJson(res, 200, {
          success: true,
          branding: updated,
          message: 'Logo perusahaan berhasil dihapus.',
        });
        return true;
      }

      // Get workspace branding & subscription status
      if (!action && req.method === 'GET') {
        const branding = brandingService.getBranding(workspaceId);
        sendJson(res, 200, { success: true, branding });
        return true;
      }

      // Update workspace company text metadata
      if (!action && (req.method === 'PUT' || req.method === 'POST')) {
        const body = await readBodyJson(req);
        const updated = brandingService.updateBranding(workspaceId, body);
        sendJson(res, 200, {
          success: true,
          branding: updated,
          message: 'Profil perusahaan berhasil diperbarui.',
        });
        return true;
      }
    }

    sendError(res, 404, 'NOT_FOUND', 'Endpoint branding tidak ditemukan.');
    return true;
  } catch (err: any) {
    console.error('[BrandingRoutes Error]:', err);
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Terjadi kesalahan pada layanan branding.');
    return true;
  }
}
