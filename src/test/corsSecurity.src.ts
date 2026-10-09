/**
 * Security tests for CORS origin matching (api/_lib/security.js).
 * Verifies the allowlist accepts legitimate origins and rejects malicious ones.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import the security module (ESM) - path relative to repo root
const security = await import('../../api/_lib/security.js');
const { applyCors } = security;

// Mock req/res objects
function mockReq(origin) {
  return { headers: { origin } };
}
function mockRes() {
  const headers = {};
  return {
    setHeader: (k, v) => { headers[k] = v; },
    getHeaders: () => headers,
  };
}

let passed = 0, failed = 0;
function check(name, origin, expected) {
  const req = mockReq(origin);
  const res = mockRes();
  const result = applyCors(req, res);
  const ok = result === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: origin="${origin}" -> ${result} (expected ${expected})`);
  ok ? passed++ : failed++;
}

console.log('CORS SECURITY TESTS');
console.log('');

// 1. Legitimate preview origins - should be ALLOWED
check('Preview deployment allowed', 'https://ezrab-site-qjzwjfpcy-yf-arch.vercel.app', true);
check('Branch preview allowed', 'https://ezrab-site-git-fix-ai-gateway-403-origin-yf-arch.vercel.app', true);
check('Other project preview allowed', 'https://ezrab-new-abc123-yf-arch.vercel.app', true);

// 2. Production origins - should be ALLOWED
check('Production allowed', 'https://ezrab-site.vercel.app', true);
check('Production www allowed', 'https://www.ezrab-site.vercel.app', true);

// 3. Foreign origins - should be DENIED
check('Attacker domain denied', 'https://attacker.example', false);
check('Random domain denied', 'https://evil.com', false);

// 4. Lookalike/malicious domains - should be DENIED
check('Subdomain attack denied', 'https://yf-arch.vercel.app.attacker.example', false);
check('Suffix trick denied', 'https://yf-arch.vercel.app.evil.com', false);
// Note: https://evil-yf-arch.vercel.app IS allowed - it's a valid yf-arch team deployment
// (team boundary is the security boundary). This is expected.
check('Team project allowed (same team)', 'https://evil-yf-arch.vercel.app', true);

// 5. Edge cases
check('Empty origin allowed (same-origin/curl)', '', true);
check('HTTP scheme with team suffix', 'http://ezrab-site-qjzwjfpcy-yf-arch.vercel.app', true);
check('Bare team domain denied', 'https://yf-arch.vercel.app', false);

console.log('');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
