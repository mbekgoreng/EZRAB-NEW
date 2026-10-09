/**
 * Gateway origin validation tests (Phase 4 of 403 fix).
 * Run: node src/test/gatewayOriginValidation.mjs
 *
 * Covers:
 *  1. Official preview origin accepted (exact match)
 *  2. Official production origin accepted
 *  3. Unknown origin rejected
 *  4. Spoofed origin cannot bypass (suffix/prefix tricks)
 *  5. Preflight headers set correctly for allowed origins
 *  6. Requests without Origin header pass through (same-origin/curl)
 *  7. Broken wildcard '*.yf-arch.vercel.app' does NOT match hyphenated preview URLs
 *     (regression: this was the real 403 cause — Vercel team URLs embed the
 *     team slug with hyphens, not as a separate DNS label)
 */
import { applyCors } from '../../api/_lib/security.js';

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m); };
const mkReq = (origin) => ({ headers: origin ? { origin } : {}, method: 'POST' });
const mkRes = () => {
  const headers = {};
  return { headers, setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, status: () => ({ json: () => {}, end: () => {} }) };
};

// NOTE: tests run with real process.env; we control CORS_ALLOWED_ORIGINS here.
const PREVIEW = 'https://ezrab-site-git-fix-ai-gateway-403-origin-yf-arch.vercel.app';
const PROD = 'https://ezrab-site.vercel.app';

function withEnv(value, fn) {
  const prev = process.env.CORS_ALLOWED_ORIGINS;
  process.env.CORS_ALLOWED_ORIGINS = value;
  try { fn(); } finally {
    if (prev === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = prev;
  }
}

// 1. Official preview origin accepted (exact)
test('1: exact preview origin accepted', () => {
  withEnv(PREVIEW, () => {
    ok(applyCors(mkReq(PREVIEW), mkRes()) === true, 'should allow');
  });
});

// 2. Official production origin accepted (from defaults)
test('2: production origin accepted via defaults', () => {
  withEnv('', () => {
    ok(applyCors(mkReq(PROD), mkRes()) === true, 'should allow');
  });
});

// 3. Unknown origin rejected
test('3: unknown origin rejected', () => {
  withEnv(PREVIEW, () => {
    ok(applyCors(mkReq('https://evil.com'), mkRes()) === false, 'should reject');
  });
});

// 4. Spoofed origins cannot bypass
test('4a: suffix trick rejected (ezrab-site.vercel.app.evil.com)', () => {
  withEnv('', () => {
    ok(applyCors(mkReq('https://ezrab-site.vercel.app.evil.com'), mkRes()) === false, 'should reject');
  });
});
test('4b: prefix trick rejected (evil-ezrab-site.vercel.app)', () => {
  withEnv('', () => {
    ok(applyCors(mkReq('https://evil-ezrab-site.vercel.app'), mkRes()) === false, 'should reject');
  });
});
test('4c: hyphenated preview URL not matched by dot-wildcard', () => {
  withEnv('*.yf-arch.vercel.app', () => {
    // This is the REAL 403 cause: Vercel preview URLs embed the team slug
    // with hyphens (…-yf-arch.vercel.app), not as a DNS label.
    ok(
      applyCors(mkReq('https://ezrab-site-q2guko5nm-yf-arch.vercel.app'), mkRes()) === false,
      'dot-wildcard must NOT match hyphenated URL'
    );
  });
});

// 5. Preflight headers correct for allowed origin
test('5: CORS headers set for allowed origin', () => {
  withEnv(PREVIEW, () => {
    const res = mkRes();
    ok(applyCors(mkReq(PREVIEW), res) === true, 'should allow');
    ok(res.headers['access-control-allow-origin'] === PREVIEW, 'echo exact origin, not *');
    ok((res.headers['access-control-allow-methods'] || '').includes('POST'), 'POST allowed');
    ok((res.headers['access-control-allow-methods'] || '').includes('OPTIONS'), 'OPTIONS allowed');
  });
});
test('5b: no Allow-Origin header leaked for rejected origin', () => {
  withEnv(PREVIEW, () => {
    const res = mkRes();
    ok(applyCors(mkReq('https://evil.com'), res) === false, 'should reject');
    ok(!res.headers['access-control-allow-origin'], 'must not echo attacker origin');
  });
});

// 6. No Origin header passes through (same-origin / curl / health checks)
test('6: request without Origin header allowed through', () => {
  withEnv(PREVIEW, () => {
    ok(applyCors(mkReq(null), mkRes()) === true, 'should allow');
  });
});

// 7. Regression documented: wildcard removal is intentional
test('7: no wildcard in defaults covers vercel.app', () => {
  withEnv('', () => {
    ok(
      applyCors(mkReq('https://attacker-preview-12345.vercel.app'), mkRes()) === false,
      'arbitrary vercel.app deploy must be rejected'
    );
  });
});

console.log(failures === 0 ? '\nAll origin validation tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
