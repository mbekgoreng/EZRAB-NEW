import { describe, it, expect } from 'vitest';
import { handleTemplateApiRequest } from '../api/templateRoutes';
import { EventEmitter } from 'events';

function createMockReqRes(method: string, url: string, headers: Record<string, string> = {}, body?: any) {
  const req: any = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost:3001', ...headers };

  const res: any = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.body = '';
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
  res.end = (data: string) => { res.body = data; res.emit('finish'); };

  process.nextTick(() => {
    if (body) {
      req.emit('data', Buffer.from(JSON.stringify(body)));
    }
    req.emit('end');
  });

  return { req, res };
}


describe('EZRAB AI CORE — TEMPLATE API & MULTI-TENANT AUTHORIZATION TESTS', () => {
  it('should list all templates via GET /api/templates', async () => {
    const { req, res } = createMockReqRes('GET', '/api/templates', {
      'x-user-id': 'usr-estimator-01',
      'x-workspace-id': 'ws-estimator-01'
    });

    const handled = await handleTemplateApiRequest(req, res);
    expect(handled).toBe(true);

    const payload = JSON.parse(res.body);
    expect(payload.success).toBe(true);
    expect(payload.count).toBeGreaterThanOrEqual(7);
  });

  it('should get detailed template by ID via GET /api/templates/:templateId', async () => {
    const { req, res } = createMockReqRes('GET', '/api/templates/template-house-type-36-single-floor', {
      'x-user-id': 'usr-estimator-01',
      'x-workspace-id': 'ws-estimator-01'
    });

    const handled = await handleTemplateApiRequest(req, res);
    expect(handled).toBe(true);

    const payload = JSON.parse(res.body);
    expect(payload.success).toBe(true);
    expect(payload.template.id).toBe('template-house-type-36-single-floor');
    expect(payload.template.workItems.length).toBeGreaterThan(15);
  });

  it('should validate parameters via POST /api/templates/:templateId/validate', async () => {
    const { req, res } = createMockReqRes(
      'POST',
      '/api/templates/template-house-type-36-single-floor/validate',
      { 'x-user-id': 'usr-estimator-01', 'x-workspace-id': 'ws-estimator-01' },
      { parameters: { buildingArea: 36, wallMaterial: 'BATA_RINGAN' } }
    );

    const handled = await handleTemplateApiRequest(req, res);
    expect(handled).toBe(true);

    const payload = JSON.parse(res.body);
    expect(payload.success).toBe(true);
    expect(payload.valid).toBe(true);
  });

  it('should generate RAB and spreadsheet items via POST /api/templates/:templateId/generate', async () => {
    const { req, res } = createMockReqRes(
      'POST',
      '/api/templates/template-house-type-36-single-floor/generate',
      { 'x-user-id': 'usr-estimator-01', 'x-workspace-id': 'ws-estimator-01' },
      {
        parameters: { buildingArea: 36, buildingWidth: 6, buildingLength: 6 },
        region: 'Jawa Timur',
        overheadPercentage: 5,
        profitPercentage: 5,
        taxPercentage: 11
      }
    );

    const handled = await handleTemplateApiRequest(req, res);
    expect(handled).toBe(true);

    const payload = JSON.parse(res.body);
    expect(payload.success).toBe(true);
    expect(payload.result.totalRabCost).toBeGreaterThan(50_000_000);
    expect(payload.spreadsheetItems.length).toBeGreaterThan(15);
  });

  it('should reject invalid template IDs with 404', async () => {
    const { req, res } = createMockReqRes('GET', '/api/templates/non-existent-template-id', {
      'x-user-id': 'usr-estimator-01',
      'x-workspace-id': 'ws-estimator-01'
    });

    const handled = await handleTemplateApiRequest(req, res);
    expect(handled).toBe(true);

    const payload = JSON.parse(res.body);
    expect(payload.success).toBe(false);
    expect(res.statusCode).toBe(404);
  });
});
