import type { IncomingMessage, ServerResponse } from 'http';
import { authFoundation, AuthenticationError } from '../auth/authFoundation';
import { masterBuildingTemplateRegistry } from '../../src/data/buildingTemplates/masterTemplateRegistry';
import { parametricVolumeEngine } from '../../src/engine/parametricVolumeEngine/parametricVolumeEngine';
import { BuildingCategory } from '../../src/data/buildingTemplates/schema/types';

const MAX_BODY = 128 * 1024;

function send(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function error(res: ServerResponse, status: number, code: string, message: string, details?: any) {
  send(res, status, { success: false, error: { code, message, details } });
}

async function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('INVALID_REQUEST'));
      }
    });
    req.on('error', reject);
  });
}

export async function handleTemplateApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (!url.pathname.startsWith('/api/templates')) return false;

  const requestId = `tpl-${crypto.randomUUID()}`;

  try {
    // Authenticate user request
    const identity = await authFoundation.authenticate(req.headers as any);
    const parts = url.pathname.split('/').filter(Boolean);
    // parts: ['api', 'templates', ':templateId'?, ':action'?]

    // 1. GET /api/templates
    if (req.method === 'GET' && parts.length === 2) {
      const category = url.searchParams.get('category') as BuildingCategory | null;
      const search = url.searchParams.get('q') || '';

      let templates = masterBuildingTemplateRegistry.getAllTemplates();
      if (category) {
        templates = masterBuildingTemplateRegistry.getTemplatesByCategory(category);
      }
      if (search) {
        templates = masterBuildingTemplateRegistry.searchTemplates(search);
      }

      // Return concise summaries
      const summaries = templates.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        category: t.category,
        version: t.version,
        status: t.status,
        description: t.description,
        applicableProjectTypes: t.applicableProjectTypes,
        parameterCount: Object.keys(t.parameters).length,
        assumptionCount: Object.keys(t.assumptions).length,
        workItemCount: t.workItems.length,
      }));

      send(res, 200, { success: true, count: summaries.length, templates: summaries, requestId });
      return true;
    }

    const templateId = parts[2];
    if (!templateId) {
      error(res, 400, 'INVALID_REQUEST', 'Template ID diperlukan.');
      return true;
    }

    const template = masterBuildingTemplateRegistry.getTemplateById(templateId);
    if (!template) {
      error(res, 404, 'TEMPLATE_NOT_FOUND', `Template dengan ID '${templateId}' tidak ditemukan.`);
      return true;
    }

    // 2. GET /api/templates/:templateId
    if (req.method === 'GET' && parts.length === 3) {
      send(res, 200, {
        success: true,
        template,
        requestId,
      });
      return true;
    }

    const action = parts[3];

    // 3. POST /api/templates/:templateId/validate
    if (req.method === 'POST' && action === 'validate') {
      const input = await parseBody(req);
      const valResult = parametricVolumeEngine.validateParameters(template, input.parameters || {});

      send(res, 200, {
        success: true,
        valid: valResult.valid,
        sanitizedParameters: valResult.sanitizedParameters,
        errors: valResult.errors,
        warnings: valResult.warnings,
        requestId,
      });
      return true;
    }

    // 4. POST /api/templates/:templateId/generate OR /recalculate
    if (req.method === 'POST' && (action === 'generate' || action === 'recalculate')) {
      const input = await parseBody(req);
      const options = {
        templateId: template.id,
        parameters: input.parameters || {},
        assumptionOverrides: input.assumptions || input.assumptionOverrides || {},
        region: input.region || input.location || 'DKI Jakarta',
        overheadPercentage: typeof input.overheadPercentage === 'number' ? input.overheadPercentage : 5,
        profitPercentage: typeof input.profitPercentage === 'number' ? input.profitPercentage : 5,
        taxPercentage: typeof input.taxPercentage === 'number' ? input.taxPercentage : 11,
        projectType: input.projectType,
        location: input.location,
      };

      try {
        const generationResult = parametricVolumeEngine.generateRABFromTemplate(options);
        const spreadsheetItems = parametricVolumeEngine.toRabItems(generationResult);

        send(res, 200, {
          success: true,
          result: generationResult,
          spreadsheetItems,
          requestId,
          user: { userId: identity.userId },
        });
        return true;
      } catch (genError: any) {
        error(res, 400, 'CALCULATION_FAILED', genError.message || 'Kalkulasi volume parametrik gagal.');
        return true;
      }
    }

    // 5. POST /api/templates/:templateId/confirm-assumptions
    if (req.method === 'POST' && action === 'confirm-assumptions') {
      const input = await parseBody(req);
      const confirmedAssumptions = input.assumptions || {};

      send(res, 200, {
        success: true,
        message: 'Asumsi berhasil dikonfirmasi.',
        confirmedAssumptions,
        requestId,
      });
      return true;
    }

    error(res, 404, 'NOT_FOUND', `Endpoint template action '${action || ''}' tidak ditemukan.`);
    return true;
  } catch (e: any) {
    if (e instanceof AuthenticationError) {
      error(res, 401, e.code, 'Autentikasi diperlukan untuk mengakses Master Building Templates.');
    } else {
      error(res, 500, 'INTERNAL_SERVER_ERROR', e?.message || 'Terjadi kesalahan pada server.');
    }
    return true;
  }
}
