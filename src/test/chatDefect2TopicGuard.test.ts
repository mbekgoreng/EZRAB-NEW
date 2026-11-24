/**
 * chatDefect2TopicGuard.test.ts — WP02-DEFECT-2 (diperbaiki 2026-11-24).
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatDefect2TopicGuard.test.ts`
 *
 * Cacat: cabang generate di tryContinueUniversalContext (actionRegistry)
 * mendahului gerbang topik-baru — "Buatkan RAB kolam renang" saat konteks
 * jalan sedang PROJECT_REVIEW men-generate draft RAB JALAN (topik basi),
 * bukan menggugurkan konteks dan memulai intake kolam.
 *
 * Fix: penjaga topik di cabang generate — topik yang terklasifikasi dan
 * BERBEDA dari konteks saat ini jatuh ke gerbang topik-baru (gugur +
 * null), bukan generate. Perbandingan id primer persis sama dengan
 * gerbang topik-baru. Permintaan tanpa topik terklasifikasi ("susun
 * draft RAB") tetap generate seperti dulu.
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
  console.log('chatDefect2TopicGuard.test (WP02-DEFECT-2)');
  const reg = await import('../ai-tools/ezrab-ai/actionRegistry');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const dp = await import('../ai-tools/ezrab-ai/draftPersistence');
  const rt = await import('../ai-tools/ezrab-ai/executionRuntime');
  const { routeIntent } = await import('../ai-tools/ezrab-ai/intentRouter');

  const PROJECT = 'PRJ-D2';

  const mockCtx = (projectId: string | null) =>
    ({
      navigate: () => undefined,
      currentMenu: 'ezrab-ai',
      activeProject: projectId ? { id: projectId, name: `Proyek ${projectId}` } : null,
      projects: [],
      projectTotal: 0,
      projectItems: null,
    }) as unknown as Parameters<typeof reg.executeIntent>[2];

  const start = (text: string, projectId: string | null = PROJECT) => {
    const routed = routeIntent(text);
    return reg.executeIntent(routed.intent, routed.param, {
      ...mockCtx(projectId),
      rawText: text,
    });
  };

  const simulateReload = () => {
    reg.clearUniversalContext();
    rab.setLastUniversalDraft(null);
    rt.__resetExecutionRuntimeForTests();
  };
  const resetAll = () => {
    simulateReload();
    storage.clear();
  };

  /** Alur jalan-beton terpandu sampai PROJECT_REVIEW (kuesioner dilewati). */
  const jalanSampaiReview = () => {
    start('Buatkan RAB jalan beton 2 km');
    reg.tryContinueUniversalContext('lebar 6 meter');
    const mid = reg.getUniversalContextState();
    assert(mid !== null && mid.stage === 'PROJECT_REVIEW', 'seed: tahap PROJECT_REVIEW sesudah lebar');
    assert(mid.primary?.id === 'jalan-beton', `seed: primer jalan-beton (dapat ${mid.primary?.id})`);
    // Kuesioner sedang presented: afirmasi melewatinya menuju brief.
    if (mid.questionnaire?.status === 'presented') {
      reg.tryContinueUniversalContext('oke');
    }
    const ctx = reg.getUniversalContextState();
    assert(ctx !== null && ctx.stage === 'PROJECT_REVIEW', 'seed: tetap PROJECT_REVIEW sesudah kuesioner');
    assert(ctx.primary?.id === 'jalan-beton', 'seed: primer tetap jalan-beton');
    return ctx;
  };

  await check('D2-1 topik baru di PROJECT_REVIEW: konteks gugur, BUKAN generate draft basi', () => {
    resetAll();
    const ctx = jalanSampaiReview();
    const pid = (ctx.projectId as string | null) ?? PROJECT;
    const saved = dp.saveIntakeContext(pid, ctx);
    assert(saved.ok, 'seed: snapshot tersimpan');
    assert(dp.peekIntakeContext(pid) !== null, 'seed: snapshot ada sebelum topik baru');
    // Permintaan topik-baru (kolam) saat konteks jalan sedang PROJECT_REVIEW.
    const res = reg.tryContinueUniversalContext('Buatkan RAB kolam renang');
    assert(res === null, 'topik baru mengembalikan null (konteks gugur, bukan draft jalan)');
    assert(reg.getUniversalContextState() === null, 'singleton digugurkan');
    assert(dp.peekIntakeContext(pid) === null, 'snapshot tersimpan ikut digugurkan');
    // Intake baru untuk kolam bisa dimulai sesudah gugur.
    start('Buatkan RAB kolam renang');
    const fresh = reg.getUniversalContextState();
    assert(fresh !== null && fresh.primary?.id === 'kolam', `intake baru primer kolam (dapat ${fresh?.primary?.id})`);
  });

  await check('D2-2 topik sama di PROJECT_REVIEW: tetap generate draft', () => {
    resetAll();
    jalanSampaiReview();
    const res = reg.tryContinueUniversalContext('Buatkan RAB jalan beton');
    assert(res !== null, 'topik sama mengembalikan hasil (bukan null)');
    assert(
      typeof res.message === 'string' && /jalan/i.test(res.message),
      'draft yang di-generate adalah RAB jalan',
    );
    assert(reg.getUniversalContextState() === null, 'singleton dibersihkan sesudah generate');
  });

  await check('D2-3 tanpa topik di PROJECT_REVIEW: tetap generate draft', () => {
    resetAll();
    jalanSampaiReview();
    const res = reg.tryContinueUniversalContext('susun draft RAB');
    assert(res !== null, 'perintah generate tanpa topik mengembalikan hasil (bukan null)');
    assert(
      typeof res.message === 'string' && /jalan/i.test(res.message),
      'draft yang di-generate adalah RAB jalan',
    );
    assert(reg.getUniversalContextState() === null, 'singleton dibersihkan sesudah generate');
  });

  console.log(`\nchatDefect2TopicGuard: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`FAILURES: ${failures.join(', ')}`);
    process.exit(1);
  }
}

void main();
