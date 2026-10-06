import http from 'http';
import assert from 'assert';
import { handleBrandingApiRequest } from '../api/brandingRoutes';
import { brandingService } from '../services/brandingService';

async function testHttpEndpoints() {
  console.log('--- Testing Branding & Subscription HTTP Server Handlers ---');

  // Create temporary HTTP test server
  const server = http.createServer(async (req, res) => {
    if (await handleBrandingApiRequest(req, res)) return;
    res.statusCode = 404;
    res.end('Not Found');
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. GET branding for FREE workspace
    const resFree = await fetch(`${baseUrl}/api/workspaces/ws-free-sample/branding`);
    assert.strictEqual(resFree.status, 200);
    const jsonFree = await resFree.json();
    assert.strictEqual(jsonFree.branding.subscriptionPlan, 'free');
    assert.strictEqual(jsonFree.branding.canUploadLogo, false);
    assert.strictEqual(jsonFree.branding.isWatermarkRequired, true);
    console.log('[PASS] Endpoint: GET /api/workspaces/ws-free-sample/branding');

    // 2. Direct POST logo on FREE workspace (MUST BE REJECTED 403)
    const resUploadFree = await fetch(`${baseUrl}/api/workspaces/ws-free-sample/branding/logo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', mime: 'image/png' }),
    });
    assert.strictEqual(resUploadFree.status, 403);
    const errJson = await resUploadFree.json();
    assert.strictEqual(errJson.error.code, 'SUBSCRIPTION_REQUIRED');
    assert.strictEqual(errJson.error.message, 'Upload logo perusahaan tersedia untuk paket berbayar.');
    console.log('[PASS] Endpoint: POST logo on FREE workspace rejected with 403 and exact message');

    // 3. Direct POST logo on PAID workspace (ws-default-ezrab)
    const resUploadPaid = await fetch(`${baseUrl}/api/workspaces/ws-default-ezrab/branding/logo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', mime: 'image/png' }),
    });
    assert.strictEqual(resUploadPaid.status, 200);
    const successJson = await resUploadPaid.json();
    assert.strictEqual(successJson.success, true);
    assert.ok(successJson.logoUrl.startsWith('data:image/png;base64,'));
    console.log('[PASS] Endpoint: POST logo on PAID workspace succeeds 200');

    // 4. Serve logo file GET /api/workspaces/ws-default-ezrab/branding/logo
    const resGetLogo = await fetch(`${baseUrl}/api/workspaces/ws-default-ezrab/branding/logo`);
    assert.strictEqual(resGetLogo.status, 200);
    assert.strictEqual(resGetLogo.headers.get('content-type'), 'image/png');
    console.log('[PASS] Endpoint: GET logo serves binary file with Content-Type: image/png');

    // 5. DELETE logo
    const resDeleteLogo = await fetch(`${baseUrl}/api/workspaces/ws-default-ezrab/branding/logo`, { method: 'DELETE' });
    assert.strictEqual(resDeleteLogo.status, 200);
    console.log('[PASS] Endpoint: DELETE logo succeeds');

    // 6. Verify logo deleted
    const resGetDeleted = await fetch(`${baseUrl}/api/workspaces/ws-default-ezrab/branding/logo`);
    assert.strictEqual(resGetDeleted.status, 404);
    console.log('[PASS] Endpoint: GET deleted logo returns 404');

    console.log('--- ALL HTTP ENDPOINT TESTS PASSED SUCCESSFULLY ---');
  } finally {
    server.close();
  }
}

testHttpEndpoints().catch((err) => {
  console.error('HTTP Endpoint Test Failed:', err);
  process.exit(1);
});
