/**
 * S7 (§7 FINAL INTEGRITY REPAIR) — fondasi aman identitas / fail-closed (G10).
 *
 * Yang diuji di sini (tanpa login nyata — AUTH_ENABLED=false hari ini):
 *  (a) gerbang auth POST /api/market/search: perbaikan bug bentuk hasil
 *      authenticateRequest — kode lama membaca `auth.allow` (bentuk
 *      evaluateCreditAccess) yang tidak pernah ada, sehingga SEMUA panggilan
 *      — termasuk yang terautentikasi — ditolak 401. Sesudah perbaikan:
 *      tolak hanya bila auth gagal (fail-closed bila ditegakkan, degraded
 *      lolos bila tidak ada yang dikonfigurasi — pagar yang sama seperti
 *      handler lain, sesuai komentar F4 di handler);
 *  (b) authenticateRequest TIDAK PERNAH percaya header identitas dari
 *      client (x-user-id / x-user-role): tanpa token/JWT yang valid,
 *      hasilnya selalu gagal — identitas hanya dari JWT terverifikasi
 *      server (diuji lewat jwtVerifier injeksi, tanpa jaringan);
 *  (c) evaluateCreditAccess tetap fail-closed: tanpa user terverifikasi
 *      → 401; demo anonim → 403; hanya user terverifikasi yang lolos;
 *  (d) client tidak mengirim identitas karangan: tanpa env Supabase,
 *      aiGatewayAuthHeaders() mengembalikan {} (tanpa header auth);
 *  (e) approval transfer terikat DRAFT, bukan aktor: TransferApprovalBinding
 *      (draftPersistence.ts) tidak membawa field actor/userId/approvedBy —
 *      pin kontrak sumber agar tidak ada yang suatu hari menempelkan
 *      identitas palsu pada approval.
 *
 * Yang TIDAK diuji di sini (butuh otorisasi owner + infrastruktur):
 * aktivasi AUTH_ENABLED, login Supabase nyata, isolasi tenant — G10
 * tetap BLOCKED; lihat LAPORAN-S7.md.
 *
 * Dijalankan via runner/shim kompatibel vitest (vitest tidak terinstal):
 * node --experimental-transform-types --import <shim>/run.mjs — lihat
 * shim-s7/ di folder program.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  authenticateRequest,
  evaluateCreditAccess,
} from '../../api/_lib/security.js';
import marketSearchHandler from '../../api/market/search.js';
import { aiGatewayAuthHeaders } from '../ai-tools/aiGatewayAuth';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../..');

/* ---------------- kebersihan env (try/finally — afterEach NO-OP di shim) - */
const AUTH_ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'AI_GATEWAY_TOKEN',
  'AI_ALLOW_ANONYMOUS',
  'VERCEL_ENV',
  'APP_ENV',
  'SERPER_API_KEY',
] as const;

function cleanAuthEnv(): void {
  for (const k of AUTH_ENV_KEYS) delete process.env[k];
}

async function withEnv(
  patch: Record<string, string>,
  fn: () => Promise<void> | void,
): Promise<void> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(patch)) {
    saved[k] = process.env[k];
    process.env[k] = patch[k];
  }
  try {
    await fn();
  } finally {
    for (const k of Object.keys(patch)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

beforeEach(() => {
  cleanAuthEnv();
});

/* ---------------- mock req/res handler ---------------------------------- */
let ipCounter = 0;

type MockRes = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status(code: number): MockRes;
  json(payload: unknown): MockRes;
  setHeader(k: string, v: string): void;
};

function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: undefined,
    headers: {},
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    setHeader(k: string, v: string) {
      res.headers[k] = v;
    },
  };
  return res;
}

function mockReq(over: Record<string, unknown> = {}): Record<string, unknown> {
  ipCounter += 1;
  return {
    method: 'POST',
    // IP unik per panggilan: bucket rate-limit handler (30/mnt/IP) tidak
    // boleh saling mengotori antar-kasus.
    headers: { 'x-real-ip': `10.7.0.${ipCounter}` },
    body: { materialName: 'Semen Portland', baseUnit: 'kg' },
    ...over,
  };
}

const TEST_TOKEN = 'token-rahasia-uji-s7';
const SUPABASE_ENV = {
  SUPABASE_URL: 'https://contoh.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key-dummy-cukup-panjang-untuk-uji',
};

/* ====================================================================== */
describe('S7 — gerbang auth /api/market/search (perbaikan auth.allow)', () => {
  it('env bersih + body valid → 200 provider unavailable (degraded lolos)', async () => {
    const res = mockRes();
    await marketSearchHandler(mockReq(), res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { provider?: string }).provider).toBe('unavailable');
    expect((res.body as { candidates?: unknown[] }).candidates).toEqual([]);
    expect((res.body as { isLive?: boolean }).isLive).toBe(false);
  });

  it('env bersih + body kosong → 400 MISSING_PARAMS (validasi tercapai, bukan 401)', async () => {
    const res = mockRes();
    await marketSearchHandler(mockReq({ body: {} }), res as never);
    expect(res.statusCode).toBe(400);
    expect(String((res.body as { error?: string }).error)).toContain('MISSING_PARAMS');
  });

  it('token ditegakkan + tanpa header → 401 AUTH_REQUIRED (fail-closed)', async () => {
    await withEnv({ AI_GATEWAY_TOKEN: TEST_TOKEN }, async () => {
      const res = mockRes();
      await marketSearchHandler(mockReq(), res as never);
      expect(res.statusCode).toBe(401);
      expect((res.body as { error?: string }).error).toBe('AUTH_REQUIRED');
    });
  });

  it('token ditegakkan + token salah → 401', async () => {
    await withEnv({ AI_GATEWAY_TOKEN: TEST_TOKEN }, async () => {
      const res = mockRes();
      await marketSearchHandler(
        mockReq({ headers: { 'x-real-ip': `10.7.1.${ipCounter}`, 'x-ezrab-api-token': 'salah' } }),
        res as never,
      );
      expect(res.statusCode).toBe(401);
    });
  });

  it('token ditegakkan + x-ezrab-api-token benar → 200 (regresi: dulu selalu 401)', async () => {
    await withEnv({ AI_GATEWAY_TOKEN: TEST_TOKEN }, async () => {
      const res = mockRes();
      await marketSearchHandler(
        mockReq({ headers: { 'x-real-ip': `10.7.2.${ipCounter}`, 'x-ezrab-api-token': TEST_TOKEN } }),
        res as never,
      );
      expect(res.statusCode).toBe(200);
    });
  });

  it('token ditegakkan + Authorization Bearer benar → 200', async () => {
    await withEnv({ AI_GATEWAY_TOKEN: TEST_TOKEN }, async () => {
      const res = mockRes();
      await marketSearchHandler(
        mockReq({ headers: { 'x-real-ip': `10.7.3.${ipCounter}`, authorization: `Bearer ${TEST_TOKEN}` } }),
        res as never,
      );
      expect(res.statusCode).toBe(200);
    });
  });

  it('Supabase terkonfigurasi + tanpa token → 401 (fail-closed JWT)', async () => {
    await withEnv(SUPABASE_ENV, async () => {
      const res = mockRes();
      await marketSearchHandler(mockReq(), res as never);
      expect(res.statusCode).toBe(401);
      expect((res.body as { error?: string }).error).toBe('AUTH_REQUIRED');
    });
  });

  it('Supabase terkonfigurasi + AI_ALLOW_ANONYMOUS=true di luar produksi → 200 (degraded eksplisit)', async () => {
    await withEnv({ ...SUPABASE_ENV, AI_ALLOW_ANONYMOUS: 'true' }, async () => {
      const res = mockRes();
      await marketSearchHandler(mockReq(), res as never);
      expect(res.statusCode).toBe(200);
    });
  });

  it('Supabase terkonfigurasi + AI_ALLOW_ANONYMOUS=true di produksi → 401 (anonim ditolak di prod)', async () => {
    await withEnv({ ...SUPABASE_ENV, AI_ALLOW_ANONYMOUS: 'true', VERCEL_ENV: 'production' }, async () => {
      const res = mockRes();
      await marketSearchHandler(mockReq(), res as never);
      expect(res.statusCode).toBe(401);
    });
  });
});

/* ====================================================================== */
describe('S7 — authenticateRequest tidak pernah percaya header client', () => {
  it('token ditegakkan + header x-user-id/x-user-role palsu tanpa token → 401', async () => {
    await withEnv({ AI_GATEWAY_TOKEN: TEST_TOKEN }, async () => {
      const auth = await authenticateRequest(
        mockReq({ headers: { 'x-user-id': 'user-palsu', 'x-user-role': 'SUPER_ADMIN' } }) as never,
      );
      expect(auth.ok).toBe(false);
      expect(auth.method).toBe('token');
    });
  });

  it('Supabase terkonfigurasi + header x-user-id saja → 401 missing_token', async () => {
    await withEnv(SUPABASE_ENV, async () => {
      const auth = await authenticateRequest(
        mockReq({ headers: { 'x-user-id': 'user-palsu' } }) as never,
      );
      expect(auth.ok).toBe(false);
      expect(auth.method).toBe('jwt');
      expect((auth as { reason?: string }).reason).toBe('missing_token');
    });
  });

  it('identitas terverifikasi mengalir hanya lewat JWT (verifier injeksi, tanpa jaringan)', async () => {
    await withEnv(SUPABASE_ENV, async () => {
      const auth = await authenticateRequest(
        mockReq({ headers: { authorization: 'Bearer jwt-valid-stub' } }) as never,
        {
          jwtVerifier: async () => ({
            ok: true,
            user: { id: 'user-1', email: 'a@b.c', isAnonymous: false },
          }),
        } as never,
      );
      expect(auth.ok).toBe(true);
      expect(auth.method).toBe('jwt');
      expect(auth.user?.id).toBe('user-1');
    });
  });

  it('JWT ditolak verifier → auth gagal (fail-closed)', async () => {
    await withEnv(SUPABASE_ENV, async () => {
      const auth = await authenticateRequest(
        mockReq({ headers: { authorization: 'Bearer jwt-buruk-stub' } }) as never,
        {
          jwtVerifier: async () => ({ ok: false, reason: 'invalid_token' }),
        } as never,
      );
      expect(auth.ok).toBe(false);
      expect(auth.method).toBe('jwt');
    });
  });
});

/* ====================================================================== */
describe('S7 — evaluateCreditAccess tetap fail-closed (pin kebijakan)', () => {
  it('degraded tanpa user → tolak 401 AUTH_REQUIRED (tanpa fallback anonymous)', () => {
    const access = evaluateCreditAccess({ ok: true, method: 'none', user: null, degraded: true } as never);
    expect(access.allow).toBe(false);
    expect(access.status).toBe(401);
    expect(access.errorCode).toBe('AUTH_REQUIRED');
  });

  it('service-token tanpa user → tolak 401', () => {
    const access = evaluateCreditAccess({ ok: true, method: 'token', user: null } as never);
    expect(access.allow).toBe(false);
    expect(access.status).toBe(401);
  });

  it('demo anonim (is_anonymous) → tolak 403 DEMO_RESTRICTED', () => {
    const access = evaluateCreditAccess({
      ok: true,
      method: 'jwt',
      user: { id: 'demo-1', email: null, isAnonymous: true },
    } as never);
    expect(access.allow).toBe(false);
    expect(access.status).toBe(403);
    expect(access.errorCode).toBe('DEMO_RESTRICTED');
  });

  it('user terverifikasi bukan-demo → lolos', () => {
    const access = evaluateCreditAccess({
      ok: true,
      method: 'jwt',
      user: { id: 'user-1', email: 'a@b.c', isAnonymous: false },
    } as never);
    expect(access.allow).toBe(true);
  });

  it('auth gagal → tolak 401', () => {
    const access = evaluateCreditAccess({ ok: false, method: 'jwt', reason: 'missing_token' } as never);
    expect(access.allow).toBe(false);
    expect(access.status).toBe(401);
  });
});

/* ====================================================================== */
describe('S7 — client tidak mengirim identitas karangan', () => {
  it('tanpa env Supabase, aiGatewayAuthHeaders() → {} (tanpa header auth)', async () => {
    const headers = await aiGatewayAuthHeaders();
    expect(headers).toEqual({});
  });

  it('sumber aiGatewayAuth.ts tidak pernah mengirim header x-user-id', () => {
    const src = readFileSync(join(REPO, 'src/ai-tools/aiGatewayAuth.ts'), 'utf8');
    expect(src).not.toContain('x-user-id');
    expect(src).not.toContain('x-user-role');
  });
});

/* ====================================================================== */
describe('S7 — approval transfer terikat draft, bukan aktor', () => {
  function bindingInterfaceSource(): string {
    const src = readFileSync(join(REPO, 'src/ai-tools/ezrab-ai/draftPersistence.ts'), 'utf8');
    const start = src.indexOf('export interface TransferApprovalBinding');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('}', start);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end + 1);
  }

  it('TransferApprovalBinding tidak membawa field actor/userId/approvedBy', () => {
    const iface = bindingInterfaceSource();
    expect(iface).not.toMatch(/actor/i);
    expect(iface).not.toMatch(/userId/i);
    expect(iface).not.toMatch(/approvedBy/i);
  });

  it('TransferApprovalBinding hanya mengikat draft: draftId/projectId/version/fingerprint/createdAt', () => {
    const iface = bindingInterfaceSource();
    for (const field of ['draftId', 'projectId', 'version', 'fingerprint', 'createdAt']) {
      expect(iface).toContain(field);
    }
  });
});
