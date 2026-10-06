/**
 * EZRAB AI Core — Safe Read-Only Staging Health Validation Script
 * Tests service health for Node Gateway, FastAPI AI Core, and Ollama without data mutation.
 */

import http from 'http';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:3000';
const AI_CORE_URL = process.env.EZRAB_AI_CORE_URL || 'http://127.0.0.1:8000';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

async function checkEndpoint(name, url, expectedStatus = [200, 204, 404]) {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const duration = Date.now() - start;
    const ok = expectedStatus.includes(res.status) || res.ok;
    console.log(`[${ok ? 'OK' : 'WARN'}] ${name} (${url}) -> Status: ${res.status} (${duration}ms)`);
    return { name, ok, status: res.status, duration };
  } catch (err) {
    const duration = Date.now() - start;
    console.log(`[OFFLINE] ${name} (${url}) -> Error: ${err.message} (${duration}ms)`);
    return { name, ok: false, error: err.message, duration };
  }
}

async function run() {
  console.log('=============================================================');
  console.log('🔍 EZRAB STAGING SAFE HEALTH CHECK (READ-ONLY)');
  console.log('=============================================================\n');

  const results = [];
  results.push(await checkEndpoint('Node Gateway Health', `${GATEWAY_URL}/api/ai/health`, [200]));
  results.push(await checkEndpoint('FastAPI AI Core Health', `${AI_CORE_URL}/health`, [200]));
  results.push(await checkEndpoint('Ollama Daemon API', `${OLLAMA_URL}/api/tags`, [200]));

  console.log('\n-------------------------------------------------------------');
  const allOnline = results.every(r => r.ok);
  if (allOnline) {
    console.log('✅ ALL STAGING SERVICES ARE ONLINE AND REACHABLE');
  } else {
    console.log('ℹ️ Some services are offline (Normal if running in local dry-run mode)');
  }
  console.log('=============================================================\n');
}

run().catch(err => {
  console.error('Fatal healthcheck error:', err);
  process.exit(1);
});
