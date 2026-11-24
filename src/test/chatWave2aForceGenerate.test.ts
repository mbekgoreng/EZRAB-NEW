/**
 * chatWave2aForceGenerate.test.ts — Wave 2A (W2, 2026-11-24).
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatWave2aForceGenerate.test.ts`
 *
 * Dua cacat alur forceGenerate ("langsung buatkan") di intake universal:
 *
 * 1. LOOP BRIEF: universalReviewResult menetapkan stage PROJECT_REVIEW
 *    SEBELUM buildUniversalBriefLines — yang memanggil
 *    refreshUniversalFacts dan menghitung ulang stage dari pertanyaan
 *    kritis yang masih hilang, sehingga brief forceGenerate tampil
 *    dengan stage PROJECT_DIMENSIONS. Perintah teks "susun draft RAB"
 *    / "oke" sesudahnya mengulang brief selamanya (cabang generate +
 *    afirmasi mensyaratkan PROJECT_REVIEW) — hanya tombol "Susun draft
 *    RAB" yang bekerja. Fix: stage ditetapkan SESUDAH baris dibangun.
 *
 * 2. VERBA FORCEGENERATE: pemicu forceGenerate hanya mengenal
 *    "langsung buatkan/buat" — "langsung susun/generate" tidak memicu.
 *    Fix: keluarga kata kerja yang sama dengan router + cabang
 *    generate (susun/susunkan/generate/bikinkan + "susun sekarang"),
 *    di universalIntake.ts dan projectIntake.ts.
 *
 * Yang DIPERTAHANKAN: jalur normal (jawab pertanyaan sampai lengkap)
 * tetap mencapai PROJECT_REVIEW tanpa forceGenerate; generate dari
 * brief yang datanya belum cukup tetap gagal jujur di mesin katalog
 * (bukan karangan) — jalan 2 km + lebar hilang tetap bisa dibangun
 * mesin karena panjangnya terukur.
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
  console.log('chatWave2aForceGenerate.test (Wave 2A — loop brief forceGenerate + verba)');
  const reg = await import('../ai-tools/ezrab-ai/actionRegistry');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const rt = await import('../ai-tools/ezrab-ai/executionRuntime');
  const { routeIntent } = await import('../ai-tools/ezrab-ai/intentRouter');

  const PROJECT = 'PRJ-W2F';

  const mockCtx = () =>
    ({
      navigate: () => undefined,
      currentMenu: 'ezrab-ai',
      activeProject: { id: PROJECT, name: `Proyek ${PROJECT}` },
      projects: [],
      projectTotal: 0,
      projectItems: null,
    }) as unknown as Parameters<typeof reg.executeIntent>[2];

  const resetAll = () => {
    reg.clearUniversalContext();
    reg.clearProjectContext();
    rab.setLastUniversalDraft(null);
    rt.__resetExecutionRuntimeForTests();
    storage.clear();
  };

  /** Intake jalan 2 km baru dimulai (lebar masih ditanyakan). */
  const jalanMidIntake = () => {
    const routed = routeIntent('Buatkan RAB jalan beton 2 km');
    reg.executeIntent(routed.intent, routed.param, { ...mockCtx(), rawText: 'Buatkan RAB jalan beton 2 km' });
    const ctx = reg.getUniversalContextState();
    assert(ctx !== null && ctx.stage !== 'PROJECT_REVIEW', `seed: tengah intake (dapat ${ctx?.stage})`);
    assert(ctx.primary?.id === 'jalan-beton', `seed: primer jalan-beton (dapat ${ctx?.primary?.id})`);
    return ctx;
  };

  /** Brief forceGenerate via frasa pemicu; mengembalikan konteks sesudah brief. */
  const forceBrief = (phrase: string) => {
    jalanMidIntake();
    const res = reg.tryContinueUniversalContext(phrase);
    assert(res !== null, `"${phrase}" mengembalikan hasil`);
    assert(/Brief proyek/.test(String(res.message)), `"${phrase}" menampilkan brief`);
    const ctx = reg.getUniversalContextState();
    assert(ctx !== null && ctx.forceGenerate === true, `"${phrase}" menyetel forceGenerate`);
    assert(ctx.stage === 'PROJECT_REVIEW', `"${phrase}" → stage PROJECT_REVIEW (dapat ${ctx.stage})`);
    return ctx;
  };

  const assertDraftGenerated = (label: string) => {
    const draft = rab.getLastUniversalDraft();
    assert(draft !== null, `${label}: draft ter-generate (bukan loop brief)`);
    assert(reg.getUniversalContextState() === null, `${label}: singleton dibersihkan sesudah generate`);
  };

  await check('W2F-1 "langsung buatkan" → brief + stage PROJECT_REVIEW + forceGenerate', () => {
    resetAll();
    forceBrief('langsung buatkan');
  });

  await check('W2F-2 sesudah brief forceGenerate, "susun draft RAB" men-generate (bukan loop)', () => {
    resetAll();
    forceBrief('langsung buatkan');
    const res = reg.tryContinueUniversalContext('susun draft RAB');
    assert(res !== null && /draft RAB/i.test(String(res.message)), 'pesan hasil adalah draft, bukan brief ulang');
    assertDraftGenerated('W2F-2');
  });

  await check('W2F-3 sesudah brief forceGenerate, "oke" men-generate (aturan afirmasi owner)', () => {
    resetAll();
    forceBrief('langsung buatkan');
    const res = reg.tryContinueUniversalContext('oke');
    assert(res !== null && /draft RAB/i.test(String(res.message)), 'pesan hasil adalah draft, bukan brief ulang');
    assertDraftGenerated('W2F-3');
  });

  await check('W2F-4 "langsung susun" → forceGenerate + brief + PROJECT_REVIEW', () => {
    resetAll();
    forceBrief('langsung susun');
  });

  await check('W2F-5 "langsung generate" → forceGenerate + brief + PROJECT_REVIEW', () => {
    resetAll();
    forceBrief('langsung generate');
  });

  await check('W2F-6 "susun sekarang" → forceGenerate + brief + PROJECT_REVIEW', () => {
    resetAll();
    forceBrief('susun sekarang');
  });

  await check('W2F-7 "langsung susun" lalu "susun draft RAB" → draft ter-generate', () => {
    resetAll();
    forceBrief('langsung susun');
    const res = reg.tryContinueUniversalContext('susun draft RAB');
    assert(res !== null && /draft RAB/i.test(String(res.message)), 'pesan hasil adalah draft');
    assertDraftGenerated('W2F-7');
  });

  await check('W2F-8 kontrol jalur normal: jawab lebar → PROJECT_REVIEW tanpa forceGenerate', () => {
    resetAll();
    jalanMidIntake();
    reg.tryContinueUniversalContext('lebar 6 meter');
    const mid = reg.getUniversalContextState();
    assert(mid !== null && mid.stage === 'PROJECT_REVIEW', `tahap PROJECT_REVIEW (dapat ${mid?.stage})`);
    assert(mid.forceGenerate !== true, 'jalur normal tidak menyetel forceGenerate');
    if (mid.questionnaire?.status === 'presented') {
      reg.tryContinueUniversalContext('oke');
    }
    const res = reg.tryContinueUniversalContext('susun draft RAB');
    assert(res !== null && /draft RAB/i.test(String(res.message)), 'pesan hasil adalah draft');
    assertDraftGenerated('W2F-8');
  });

  await check('W2F-9 tombol "Susun brief sekarang" tengah intake → PROJECT_REVIEW, lalu teks generate bekerja', () => {
    resetAll();
    jalanMidIntake();
    const review = reg.applyUniversalOption('review');
    assert(review.ok && /Brief proyek/.test(String(review.message)), 'tombol review menampilkan brief');
    const ctx = reg.getUniversalContextState();
    assert(ctx !== null && ctx.stage === 'PROJECT_REVIEW', `stage PROJECT_REVIEW (dapat ${ctx?.stage})`);
    const res = reg.tryContinueUniversalContext('susun draft RAB');
    assert(res !== null && /draft RAB/i.test(String(res.message)), 'pesan hasil adalah draft');
    assertDraftGenerated('W2F-9');
  });

  await check('W2F-10 afirmasi tengah intake → brief PROJECT_REVIEW; afirmasi kedua men-generate', () => {
    resetAll();
    jalanMidIntake();
    const first = reg.tryContinueUniversalContext('oke');
    assert(first !== null && /Brief proyek/.test(String(first.message)), 'afirmasi pertama menampilkan brief');
    const ctx = reg.getUniversalContextState();
    assert(ctx !== null && ctx.stage === 'PROJECT_REVIEW', `stage PROJECT_REVIEW (dapat ${ctx?.stage})`);
    const second = reg.tryContinueUniversalContext('oke');
    assert(second !== null && /draft RAB/i.test(String(second.message)), 'afirmasi kedua men-generate draft');
    assertDraftGenerated('W2F-10');
  });

  console.log(`\nchatWave2aForceGenerate: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`FAILURES: ${failures.join(', ')}`);
    process.exit(1);
  }
}

void main();
