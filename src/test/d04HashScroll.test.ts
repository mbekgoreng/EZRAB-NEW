/**
 * D-04 (Batch G1, P2) — Anchor in-page mendarat di hero pada fresh
 * load; "Jelajahi Alur" → #demo (tidak ada id tersebut).
 * D-35 (Batch G1, P3) — "Pusat Bantuan & FAQ" mendarat di atas
 * /fitur karena scroll memakai setTimeout 250 ms tetap vs halaman
 * lazy.
 *
 * Perbaikan: helper scrollToHashTarget (coba segera, ulang sampai
 * elemen ada, maks ~3 detik) + efek hash-scroll pasca-mount di
 * App.tsx; "Jelajahi Alur" kini ke #ded (demo pertama); TopBar
 * menavigasi dengan hash '/fitur#faq' dan membiarkan efek App yang
 * mengurus scroll.
 *
 * Tes helper memakai stub document/window (tanpa DOM sungguhan);
 * wiring App/TopBar/ExactWorkflow ditegaskan di tingkat sumber.
 *
 * Jalankan: npx tsx src/test/d04HashScroll.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  scrollToHashTarget,
  HASH_SCROLL_OFFSET_PX,
  HASH_SCROLL_MAX_ATTEMPTS,
  HASH_SCROLL_RETRY_MS,
} from '../routing/scrollToHash';

let failures = 0;
let passes = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passes++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}
function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
function eq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
/** Hapus komentar // dan blok. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

// ---- Stub DOM minimal untuk helper ----
interface FakeEl {
  getBoundingClientRect: () => { top: number };
}
let fakeElements: Record<string, FakeEl> = {};
let scrollCalls: Array<{ top: number; behavior?: string }> = [];
const installDomStubs = () => {
  fakeElements = {};
  scrollCalls = [];
  (globalThis as any).document = {
    getElementById: (id: string) => fakeElements[id] ?? null,
  };
  (globalThis as any).window = {
    scrollY: 0,
    scrollTo: (opts: { top: number; behavior?: string }) => {
      scrollCalls.push(opts);
    },
  };
};

async function main(): Promise<void> {
  console.log('D-04/D-35 — Hash-scroll pasca-mount + target anchor:');

  console.log('\n[1] Konstanta helper:');
  await test('offset 70px (navbar 52px + ruang)', () => {
    eq(HASH_SCROLL_OFFSET_PX, 70, 'HASH_SCROLL_OFFSET_PX');
  });
  await test('jendela retry ~3 detik (20 × 150 ms)', () => {
    eq(HASH_SCROLL_MAX_ATTEMPTS, 20, 'HASH_SCROLL_MAX_ATTEMPTS');
    eq(HASH_SCROLL_RETRY_MS, 150, 'HASH_SCROLL_RETRY_MS');
    eq(HASH_SCROLL_MAX_ATTEMPTS * HASH_SCROLL_RETRY_MS, 3000, 'jendela total');
  });

  console.log('\n[2] scrollToHashTarget dengan stub DOM:');
  await test('hash kosong / "#" saja → no-op tanpa scroll', () => {
    installDomStubs();
    const cleanup1 = scrollToHashTarget('');
    const cleanup2 = scrollToHashTarget('#');
    cleanup1();
    cleanup2();
    eq(scrollCalls.length, 0, 'tidak boleh ada scroll');
  });
  await test('elemen sudah ada → scroll sekali, top dikurangi offset', () => {
    installDomStubs();
    fakeElements = { harga: { getBoundingClientRect: () => ({ top: 500 }) } };
    const cleanup = scrollToHashTarget('#harga');
    cleanup();
    eq(scrollCalls.length, 1, 'satu scroll');
    eq(scrollCalls[0].top, 430, 'top = 500 − 70');
    eq(scrollCalls[0].behavior, 'smooth', 'behavior smooth');
  });
  await test('top tidak pernah negatif (target di atas offset)', () => {
    installDomStubs();
    fakeElements = { faq: { getBoundingClientRect: () => ({ top: 40 }) } };
    const cleanup = scrollToHashTarget('#faq');
    cleanup();
    eq(scrollCalls.length, 1, 'satu scroll');
    eq(scrollCalls[0].top, 0, 'top dijepit ke 0');
  });
  await test('elemen muncul belakangan (lazy) → retry menemukannya', async () => {
    installDomStubs();
    const cleanup = scrollToHashTarget('#faq', { retryMs: 5, maxAttempts: 50 });
    await sleep(12);
    fakeElements = { faq: { getBoundingClientRect: () => ({ top: 900 }) } };
    await sleep(30);
    cleanup();
    eq(scrollCalls.length, 1, 'satu scroll sesudah elemen muncul');
    eq(scrollCalls[0].top, 830, 'top = 900 − 70');
  });
  await test('elemen tidak pernah muncul → menyerah diam-diam tanpa scroll', async () => {
    installDomStubs();
    const cleanup = scrollToHashTarget('#tidak-ada', { retryMs: 5, maxAttempts: 4 });
    await sleep(40);
    cleanup();
    eq(scrollCalls.length, 0, 'tidak ada scroll untuk hash tak dikenal');
  });
  await test('cleanup membatalkan retry yang tertunda', async () => {
    installDomStubs();
    const cleanup = scrollToHashTarget('#faq', { retryMs: 5, maxAttempts: 50 });
    cleanup();
    fakeElements = { faq: { getBoundingClientRect: () => ({ top: 900 }) } };
    await sleep(30);
    eq(scrollCalls.length, 0, 'retry dibatalkan cleanup');
  });

  console.log('\n[3] Wiring App.tsx (efek hash-scroll):');
  const appSrc = stripComments(read('../App.tsx'));
  await test('App mengimpor scrollToHashTarget', () => {
    ok(appSrc.includes("from './routing/scrollToHash'"), 'impor helper tidak ada');
  });
  await test('App punya efek hash-scroll pada [pathname, hash]', () => {
    ok(appSrc.includes('scrollToHashTarget(location.hash)'), 'efek tidak memanggil helper');
    ok(
      appSrc.includes('[location.pathname, location.hash]'),
      'efek tidak bergantung pada pathname+hash'
    );
  });

  console.log('\n[4] ExactWorkflow: "Jelajahi Alur" ke target nyata:');
  const workflowSrc = stripComments(read('../components/landing/exact/ExactWorkflow.tsx'));
  await test('tidak ada lagi href="#demo"', () => {
    ok(!workflowSrc.includes('href="#demo"'), 'href="#demo" masih ada');
  });
  await test('"Jelajahi Alur" menunjuk #ded (demo pertama)', () => {
    ok(workflowSrc.includes('href="#ded"'), 'tautan tidak menunjuk #ded');
  });
  await test('id="ded" memang ada di AiShowcase', () => {
    const showcaseSrc = stripComments(read('../components/landing/exact/AiShowcase.tsx'));
    ok(showcaseSrc.includes('id="ded"'), 'id="ded" tidak ada di AiShowcase');
  });

  console.log('\n[5] D-35 — TopBar memakai hash, bukan timeout tetap:');
  const topBarSrc = stripComments(read('../components/navigation/TopBar.tsx'));
  await test('item FAQ menavigasi ke /fitur#faq', () => {
    ok(topBarSrc.includes("navigateTo('/fitur#faq')"), 'tidak ada navigateTo(/fitur#faq)');
  });
  await test('tidak ada lagi setTimeout 250 ms untuk scroll FAQ', () => {
    ok(
      !topBarSrc.includes("document.getElementById('faq')?.scrollIntoView"),
      'scroll timeout lama masih ada'
    );
  });
  await test('id="faq" memang ada di FeaturesPage', () => {
    const featuresSrc = stripComments(read('../components/landing/features/FeaturesPage.tsx'));
    ok(featuresSrc.includes('id="faq"'), 'id="faq" tidak ada di FeaturesPage');
  });

  console.log(`\nd04HashScroll.test: ${passes} PASS, ${failures} FAIL`);
  process.exit(failures ? 1 : 0);
}

void main();
