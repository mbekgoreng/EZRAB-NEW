/**
 * chatWave2aRouter.test.ts — Wave 2A (W2, 2026-11-24).
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatWave2aRouter.test.ts`
 *
 * Keluarga kata kerja pembuat RAB di intentRouter: "susun / susunkan /
 * generate / bikinkan" sebelumnya TIDAK ada di pola CREATE_RAB_*,
 * sehingga "susun rab rumah" / "bikinkan rab jalan beton" jatuh
 * UNKNOWN ke LLM padahal mesin deterministik bisa menangani — sementara
 * pola rumah sempat membawa alternatif mati " Bikinkan" (huruf kapital
 * + spasi awalan, tak pernah cocok dengan teks ternormalisasi huruf
 * kecil). Fix: semua pola CREATE_RAB_DIRECT / SUMMARY / CLARIFY kini
 * memakai kelompok verba yang sama.
 *
 * Yang DIPERTAHANKAN: "susun rab dengan ai" tetap RAB_FULL_AI (pola
 * Full AI mendahului CREATE); "susun/generate" TANPA kata "rab"
 * ("susun jadwal") tetap UNKNOWN — bukan perintah RAB.
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
void readFileSync;

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
    raw: map,
  };
}
const storage = makeStorage();
(globalThis as Record<string, unknown>).localStorage = storage;

async function main(): Promise<void> {
  console.log('chatWave2aRouter.test (Wave 2A — keluarga verba pembuat RAB)');
  const { routeIntent } = await import('../ai-tools/ezrab-ai/intentRouter');
  const reg = await import('../ai-tools/ezrab-ai/actionRegistry');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const rt = await import('../ai-tools/ezrab-ai/executionRuntime');

  const route = (text: string, expected: string) => {
    const r = routeIntent(text);
    assert(r.intent === expected, `"${text}" → ${r.intent} (harap ${expected})`);
  };

  await check('W2R-1 "bikinkan rab rumah" → CREATE_RAB_SUMMARY', () => {
    route('bikinkan rab rumah', 'CREATE_RAB_SUMMARY');
  });
  await check('W2R-2 "bikinkan rab jalan beton 2 km" → CREATE_RAB_SUMMARY', () => {
    route('bikinkan rab jalan beton 2 km', 'CREATE_RAB_SUMMARY');
  });
  await check('W2R-3 "susun rab rumah" → CREATE_RAB_SUMMARY', () => {
    route('susun rab rumah', 'CREATE_RAB_SUMMARY');
  });
  await check('W2R-4 "susun rab rumah 2 lantai" → CREATE_RAB_SUMMARY', () => {
    route('susun rab rumah 2 lantai', 'CREATE_RAB_SUMMARY');
  });
  await check('W2R-5 "susun rab rumah type 70" → CREATE_RAB_DIRECT', () => {
    route('susun rab rumah type 70', 'CREATE_RAB_DIRECT');
  });
  await check('W2R-6 "susun rab gedung kantor 3 lantai" → CREATE_RAB_SUMMARY', () => {
    route('susun rab gedung kantor 3 lantai', 'CREATE_RAB_SUMMARY');
  });
  await check('W2R-7 "susun rab jalan beton 2 km" → CREATE_RAB_SUMMARY', () => {
    route('susun rab jalan beton 2 km', 'CREATE_RAB_SUMMARY');
  });
  await check('W2R-8 "susunkan rab rumah" → CREATE_RAB_SUMMARY', () => {
    route('susunkan rab rumah', 'CREATE_RAB_SUMMARY');
  });
  await check('W2R-9 "generate rab rumah" → CREATE_RAB_SUMMARY', () => {
    route('generate rab rumah', 'CREATE_RAB_SUMMARY');
  });
  await check('W2R-10 "susun rab" (tanpa objek) → CREATE_RAB_CLARIFY', () => {
    route('susun rab', 'CREATE_RAB_CLARIFY');
  });
  await check('W2R-11 "susun rab dengan ai" tetap RAB_FULL_AI', () => {
    route('susun rab dengan ai', 'RAB_FULL_AI');
  });
  await check('W2R-12 "susun jadwal proyek" tetap UNKNOWN (bukan RAB)', () => {
    route('susun jadwal proyek', 'UNKNOWN');
  });
  await check('W2R-13 "generate laporan proyek" tetap UNKNOWN (bukan RAB)', () => {
    route('generate laporan proyek', 'UNKNOWN');
  });
  await check('W2R-14 kontrol "buatkan rab rumah" → CREATE_RAB_SUMMARY', () => {
    route('buatkan rab rumah', 'CREATE_RAB_SUMMARY');
  });
  await check('W2R-15 kontrol "buatkan rab" → CREATE_RAB_CLARIFY', () => {
    route('buatkan rab', 'CREATE_RAB_CLARIFY');
  });

  // E2E: rute baru benar-benar sampai ke intake universal (bukan cuma label).
  await check('W2R-16 E2E "susun rab jalan beton 2 km" → intake universal jalan-beton hidup', () => {
    reg.clearUniversalContext();
    rab.setLastUniversalDraft(null);
    rt.__resetExecutionRuntimeForTests();
    storage.clear();
    const routed = routeIntent('susun rab jalan beton 2 km');
    assert(routed.intent === 'CREATE_RAB_SUMMARY', `rute ${routed.intent}`);
    const ctx = {
      navigate: () => undefined,
      currentMenu: 'ezrab-ai',
      activeProject: { id: 'PRJ-W2R', name: 'Proyek PRJ-W2R' },
      projects: [],
      projectTotal: 0,
      projectItems: null,
      rawText: 'susun rab jalan beton 2 km',
    } as unknown as Parameters<typeof reg.executeIntent>[2];
    const res = reg.executeIntent(routed.intent, routed.param, ctx);
    assert(res.ok, `executeIntent ok (pesan: ${String(res.message).slice(0, 80)})`);
    const live = reg.getUniversalContextState();
    assert(live !== null, 'konteks intake universal hidup sesudah "susun rab …"');
    assert(live.primary?.id === 'jalan-beton', `primer jalan-beton (dapat ${live?.primary?.id})`);
    // Intake menanyakan data kritis yang hilang (lebar) — bukan generate diam-diam.
    assert(
      typeof res.message === 'string' && /lebar/i.test(res.message),
      'intake menanyakan lebar yang hilang sebelum generate',
    );
    reg.clearUniversalContext();
  });

  console.log(`\nchatWave2aRouter: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`FAILURES: ${failures.join(', ')}`);
    process.exit(1);
  }
}

void main();
