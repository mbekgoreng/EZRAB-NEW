/**
 * chatWave2aTopicGuard.test.ts — Wave 2A (W2, 2026-11-24).
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatWave2aTopicGuard.test.ts`
 *
 * Melanjutkan WP02-DEFECT-2 (chatDefect2TopicGuard): gerbang topik-baru
 * di tryContinueUniversalContext hanya menangkap kata kerja "buatkan" —
 * "Susun / Generate RAB <topik lain>" lolos dari cabang generate
 * (topicChanged) lalu jatuh ke jalur merge dan topik baru MERANGKAP
 * sebagai disiplin sekunder konteks lama ("Susun RAB kolam renang"
 * saat brief jalan → kolam menempel di RAB jalan). Fix: gerbang
 * topik-baru juga menangkap susun/susunkan/generate dengan perbandingan
 * topicChanged yang KETAT (topik terklasifikasi DAN berbeda); keluarga
 * kata kerja yang sama ("susunkan", "buatin") ditambahkan ke cabang
 * generate agar keduanya sepakat.
 *
 * Yang DIPERTAHANKAN: "susun draft RAB" tanpa topik tetap generate;
 * "susun ulang" (revisi draft yang sedang ditinjau) tidak menggugurkan
 * konteks; topik sama tetap generate; jalan vs jalan-beton dihitung
 * BERBEDA (sama seperti gerbang topik-baru DEFECT-2).
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
  console.log('chatWave2aTopicGuard.test (Wave 2A — susun/generate new-topic gate)');
  const reg = await import('../ai-tools/ezrab-ai/actionRegistry');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const dp = await import('../ai-tools/ezrab-ai/draftPersistence');
  const rt = await import('../ai-tools/ezrab-ai/executionRuntime');
  const { routeIntent } = await import('../ai-tools/ezrab-ai/intentRouter');

  const PROJECT = 'PRJ-W2A';

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
    if (mid.questionnaire?.status === 'presented') {
      reg.tryContinueUniversalContext('oke');
    }
    const ctx = reg.getUniversalContextState();
    assert(ctx !== null && ctx.stage === 'PROJECT_REVIEW', 'seed: tetap PROJECT_REVIEW sesudah kuesioner');
    assert(ctx.primary?.id === 'jalan-beton', 'seed: primer tetap jalan-beton');
    return ctx;
  };

  /** Alur jalan-beton yang BARU dimulai (tengah intake, belum review). */
  const jalanMidIntake = () => {
    start('Buatkan RAB jalan beton 2 km');
    const ctx = reg.getUniversalContextState();
    assert(ctx !== null && ctx.stage !== 'PROJECT_REVIEW', `seed: tengah intake (dapat ${ctx?.stage})`);
    assert(ctx.primary?.id === 'jalan-beton', `seed: primer jalan-beton (dapat ${ctx?.primary?.id})`);
    return ctx;
  };

  await check('W2A-1 "Susun RAB kolam renang" di PROJECT_REVIEW: konteks gugur + snapshot ikut gugur', () => {
    resetAll();
    const ctx = jalanSampaiReview();
    const pid = (ctx.projectId as string | null) ?? PROJECT;
    const saved = dp.saveIntakeContext(pid, ctx);
    assert(saved.ok, 'seed: snapshot tersimpan');
    assert(dp.peekIntakeContext(pid) !== null, 'seed: snapshot ada sebelum topik baru');
    const res = reg.tryContinueUniversalContext('Susun RAB kolam renang');
    assert(res === null, 'topik baru mengembalikan null (konteks gugur, bukan merge kolam ke jalan)');
    assert(reg.getUniversalContextState() === null, 'singleton digugurkan');
    assert(dp.peekIntakeContext(pid) === null, 'snapshot tersimpan ikut digugurkan');
    start('Buatkan RAB kolam renang');
    const fresh = reg.getUniversalContextState();
    assert(fresh !== null && fresh.primary?.id === 'kolam', `intake baru primer kolam (dapat ${fresh?.primary?.id})`);
  });

  await check('W2A-2 "Generate RAB kolam renang" di PROJECT_REVIEW: konteks gugur', () => {
    resetAll();
    jalanSampaiReview();
    const res = reg.tryContinueUniversalContext('Generate RAB kolam renang');
    assert(res === null, 'topik baru mengembalikan null');
    assert(reg.getUniversalContextState() === null, 'singleton digugurkan');
  });

  await check('W2A-3 "Susun draft RAB kolam renang" di PROJECT_REVIEW: konteks gugur', () => {
    resetAll();
    jalanSampaiReview();
    const res = reg.tryContinueUniversalContext('Susun draft RAB kolam renang');
    assert(res === null, 'topik baru mengembalikan null');
    assert(reg.getUniversalContextState() === null, 'singleton digugurkan');
  });

  await check('W2A-4 "susunkan RAB kolam renang" di PROJECT_REVIEW: konteks gugur', () => {
    resetAll();
    jalanSampaiReview();
    const res = reg.tryContinueUniversalContext('susunkan RAB kolam renang');
    assert(res === null, 'topik baru mengembalikan null');
    assert(reg.getUniversalContextState() === null, 'singleton digugurkan');
  });

  await check('W2A-5 "buatin RAB kolam renang" di PROJECT_REVIEW: konteks gugur', () => {
    resetAll();
    jalanSampaiReview();
    const res = reg.tryContinueUniversalContext('buatin RAB kolam renang');
    assert(res === null, 'topik baru mengembalikan null');
    assert(reg.getUniversalContextState() === null, 'singleton digugurkan');
  });

  await check('W2A-6 "Susun RAB kolam renang" di TENGAH intake: konteks gugur (bukan merge)', () => {
    resetAll();
    jalanMidIntake();
    const res = reg.tryContinueUniversalContext('Susun RAB kolam renang');
    assert(res === null, 'topik baru mengembalikan null');
    assert(reg.getUniversalContextState() === null, 'singleton digugurkan');
  });

  await check('W2A-7 "susunkan draft RAB" tanpa topik di PROJECT_REVIEW: tetap generate draft jalan', () => {
    resetAll();
    jalanSampaiReview();
    const res = reg.tryContinueUniversalContext('susunkan draft RAB');
    assert(res !== null, 'perintah generate tanpa topik mengembalikan hasil (bukan null)');
    assert(
      typeof res.message === 'string' && /jalan/i.test(res.message),
      'draft yang di-generate adalah RAB jalan',
    );
    assert(reg.getUniversalContextState() === null, 'singleton dibersihkan sesudah generate');
  });

  await check('W2A-8 "susun draft RAB" tanpa topik di PROJECT_REVIEW: tetap generate draft jalan', () => {
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

  await check('W2A-9 "susun ulang draft RAB kolam renang": TIDAK menggugurkan konteks (revisi)', () => {
    resetAll();
    jalanSampaiReview();
    const res = reg.tryContinueUniversalContext('susun ulang draft RAB kolam renang');
    assert(res !== null, '"susun ulang" dipertahankan sebagai revisi/merge, bukan drop');
    const ctx = reg.getUniversalContextState();
    assert(ctx !== null && ctx.primary?.id === 'jalan-beton', 'konteks jalan tetap hidup');
  });

  await check('W2A-10 "Susun RAB jalan beton" (topik sama) di PROJECT_REVIEW: tetap generate', () => {
    resetAll();
    jalanSampaiReview();
    const res = reg.tryContinueUniversalContext('Susun RAB jalan beton');
    assert(res !== null, 'topik sama mengembalikan hasil (bukan null)');
    assert(
      typeof res.message === 'string' && /jalan/i.test(res.message),
      'draft yang di-generate adalah RAB jalan',
    );
    assert(reg.getUniversalContextState() === null, 'singleton dibersihkan sesudah generate');
  });

  await check('W2A-11 "Susun RAB jalan" (jalan vs jalan-beton = BERBEDA): konteks gugur', () => {
    resetAll();
    jalanSampaiReview();
    const res = reg.tryContinueUniversalContext('Susun RAB jalan');
    assert(res === null, 'id primer berbeda ("jalan" vs "jalan-beton") = topik baru → null');
    assert(reg.getUniversalContextState() === null, 'singleton digugurkan');
  });

  console.log(`\nchatWave2aTopicGuard: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`FAILURES: ${failures.join(', ')}`);
    process.exit(1);
  }
}

void main();
