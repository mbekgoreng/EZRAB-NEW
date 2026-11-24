/**
 * dedAdvancedRoutingM13.test.ts — M-13 DED advanced-routing (diperbaiki
 * 2026-11-24).
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/dedAdvancedRoutingM13.test.ts`
 *
 * Cacat: klien DED v2/v3 mengirim mode 'advanced' untuk teks ke
 * /api/ai/multi-provider/execute TANPA productId; endpoint itu memakai
 * mode body apa adanya sehingga 'advanced' berjalan di rantai Chat
 * Mendalam, bukan rantai DED final-spec.
 *
 * Fix: (1) endpoint multi-provider meneruskan mapper productIdToMode yang
 * sama dengan tools/execute; (2) klien v2/v3 membawa productId DED
 * (DED_AI_DETAIL untuk teks mendalam, DED_AI_FAST untuk quick) — vision
 * tetap tanpa productId (rantai 'vision'). Permintaan tanpa productId
 * (visionClient, aiProviderRouter) tidak berubah perilakunya.
 *
 * Tes jalur browser memakai stub fetch + `globalThis.window` (tanpa
 * panggilan jaringan, tanpa paid call).
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  PASS ${name}`);
    })
    .catch((e: unknown) => {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(name);
      console.log(`  FAIL ${name}: ${msg}`);
    });
}
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};
const read = (rel: string): string => readFileSync(`${process.cwd()}/${rel}`, 'utf-8');

/* ---------- localStorage shim (node) ---------- */
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}
(globalThis as Record<string, unknown>).localStorage = makeStorage();

async function main(): Promise<void> {
  console.log('dedAdvancedRoutingM13.test (M-13)');
  const v3 = await import('../ded-rab-v3/ai/aiProviderClient');
  const v2 = await import('../ded-rab-v2/ai/zyrouterClient');
  const { productIdToMode } = await import('../../api/ai/tools/execute.js');

  await check('M13-1 helper v3: advanced→DETAIL, quick/internal→FAST, vision→tanpa productId', () => {
    assert(v3.dedProductIdForMode('advanced') === 'DED_AI_DETAIL', 'advanced → DED_AI_DETAIL');
    assert(v3.dedProductIdForMode('quick') === 'DED_AI_FAST', 'quick → DED_AI_FAST');
    assert(v3.dedProductIdForMode('internal') === 'DED_AI_FAST', 'internal → DED_AI_FAST');
    assert(v3.dedProductIdForMode('vision') === undefined, 'vision → undefined');
  });

  await check('M13-2 helper v2: teks→DETAIL, gambar→tanpa productId', () => {
    assert(v2.dedProductIdForZyrouterRequest(false) === 'DED_AI_DETAIL', 'teks → DED_AI_DETAIL');
    assert(v2.dedProductIdForZyrouterRequest(true) === undefined, 'gambar → undefined');
  });

  await check('M13-3 jalur browser v3 (teks): payload membawa productId DED_AI_DETAIL', async () => {
    const g = globalThis as Record<string, unknown>;
    const realFetch = g.fetch;
    const realWindow = g.window;
    let captured: Record<string, unknown> | null = null;
    g.window = {};
    g.fetch = async (_url: unknown, init: { body?: string }) => {
      captured = JSON.parse(String(init.body)) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        clone: () => ({ json: async () => ({}) }),
        json: async () => ({ content: 'HASIL TES', assistant: 'Test', status: 'completed' }),
      };
    };
    try {
      const res = await v3.AiProviderClient.getInstance().executeChat({
        prompt: 'Estimasi harga pondasi',
        jsonMode: false,
      });
      assert(res.content === 'HASIL TES', 'respons stub dipakai');
      assert(captured !== null, 'fetch terpanggil');
      assert(captured!.mode === 'advanced', `mode tetap advanced (dapat ${String(captured!.mode)})`);
      assert(captured!.productId === 'DED_AI_DETAIL', `productId DED_AI_DETAIL (dapat ${String(captured!.productId)})`);
    } finally {
      g.fetch = realFetch;
      if (realWindow === undefined) delete g.window;
      else g.window = realWindow;
    }
  });

  await check('M13-4 jalur browser v3 (vision): payload TANPA productId', async () => {
    const g = globalThis as Record<string, unknown>;
    const realFetch = g.fetch;
    const realWindow = g.window;
    let captured: Record<string, unknown> | null = null;
    g.window = {};
    g.fetch = async (_url: unknown, init: { body?: string }) => {
      captured = JSON.parse(String(init.body)) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        clone: () => ({ json: async () => ({}) }),
        json: async () => ({ content: 'HASIL VISION', assistant: 'Test', status: 'completed' }),
      };
    };
    try {
      await v3.AiProviderClient.getInstance().executeChat({
        prompt: 'Baca denah ini',
        imageDataBase64: 'iVBORw0KGgo=',
        jsonMode: false,
      });
      assert(captured !== null, 'fetch terpanggil');
      assert(captured!.mode === 'vision', `mode vision (dapat ${String(captured!.mode)})`);
      assert(!('productId' in captured!), 'vision tidak membawa productId');
    } finally {
      g.fetch = realFetch;
      if (realWindow === undefined) delete g.window;
      else g.window = realWindow;
    }
  });

  await check('M13-5 jalur browser v2 (teks): payload membawa productId DED_AI_DETAIL', async () => {
    const g = globalThis as Record<string, unknown>;
    const realFetch = g.fetch;
    const realWindow = g.window;
    let captured: Record<string, unknown> | null = null;
    g.window = {};
    g.fetch = async (_url: unknown, init: { body?: string }) => {
      captured = JSON.parse(String(init.body)) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, content: 'HASIL TES', promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
      };
    };
    try {
      const res = await v2.ZyrouterClient.getInstance().chat({ prompt: 'Analisis DED' });
      assert(res.success === true && res.content === 'HASIL TES', 'respons stub dipakai');
      assert(captured !== null, 'fetch terpanggil');
      assert(captured!.mode === 'advanced', `mode tetap advanced (dapat ${String(captured!.mode)})`);
      assert(captured!.productId === 'DED_AI_DETAIL', `productId DED_AI_DETAIL (dapat ${String(captured!.productId)})`);
    } finally {
      g.fetch = realFetch;
      if (realWindow === undefined) delete g.window;
      else g.window = realWindow;
    }
  });

  await check('M13-6 server: multi-provider memakai productIdToMode yang sama + pemetaan DED benar', () => {
    const src = read('api/ai/multi-provider/execute.js');
    assert(src.includes("import { productIdToMode } from '../tools/execute.js'"), 'mengimpor productIdToMode dari tools/execute');
    assert(src.includes('handleAiRequest(req, res, { productIdToMode })'), 'meneruskan productIdToMode ke gateway');
    assert(productIdToMode('DED_AI_DETAIL', 'advanced') === 'ded', 'DED_AI_DETAIL → ded');
    assert(productIdToMode('DED_AI_FAST', 'advanced') === 'fast', 'DED_AI_FAST → fast');
    assert(productIdToMode('DOKUMEN_AI', 'advanced') === 'docai', 'DOKUMEN_AI → docai');
    assert(productIdToMode('EZRAB_AI', 'advanced') === 'advanced', 'EZRAB_AI + advanced → advanced (tidak berubah)');
    assert(productIdToMode('EZRAB_AI', 'fast') === 'chat', 'EZRAB_AI + fast → chat (tidak berubah)');
  });

  console.log(`\ndedAdvancedRoutingM13: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`FAILURES: ${failures.join(', ')}`);
    process.exit(1);
  }
}

void main();
