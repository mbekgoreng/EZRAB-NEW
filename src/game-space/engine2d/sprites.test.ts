/**
 * Sprite loader — regression tests (Fase C). Run:
 *   npx tsx src/game-space/engine2d/sprites.test.ts
 * Memakai factory gambar palsu agar cache/fallback teruji tanpa DOM.
 */
import { strict as assert } from 'node:assert';
import {
  createSpriteLoader, type SpriteImageLike,
} from './sprites';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; console.log(`  PASS ${name}`); })
    .catch((e: Error) => { failed += 1; failures.push(name); console.log(`  FAIL ${name} — ${e.message}`); });
}

interface FakeImg extends SpriteImageLike { fire: (ok: boolean) => void; srcSet: string[] }

function fakeFactory(failUrls: Set<string>): { factory: () => SpriteImageLike; made: FakeImg[] } {
  const made: FakeImg[] = [];
  const factory = (): SpriteImageLike => {
    const img: FakeImg = {
      src: '',
      complete: false,
      naturalWidth: 0,
      onload: null,
      onerror: null,
      srcSet: [],
      fire(ok: boolean) {
        if (ok) { this.complete = true; this.naturalWidth = 100; this.onload?.(); }
        else this.onerror?.(new Error('404'));
      },
    };
    Object.defineProperty(img, 'src', {
      get() { return this._src ?? ''; },
      set(v: string) {
        this._src = v;
        this.srcSet.push(v);
        // selesaikan async seperti Image asli
        queueMicrotask(() => this.fire(!failUrls.has(v)));
      },
    });
    made.push(img);
    return img;
  };
  return { factory, made };
}

async function main(): Promise<void> {
  await test('muat sukses -> status ready + image tersimpan', async () => {
    const { factory } = fakeFactory(new Set());
    const loader = createSpriteLoader(factory as never);
    assert.equal(loader.status('a.webp'), 'idle');
    const e = await loader.load('a.webp');
    assert.equal(e.status, 'ready');
    assert.ok(e.image);
    assert.equal(loader.status('a.webp'), 'ready');
  });

  await test('muat gagal -> status error, promise tetap resolve (tidak throw)', async () => {
    const { factory } = fakeFactory(new Set(['bad.webp']));
    const loader = createSpriteLoader(factory as never);
    const e = await loader.load('bad.webp');
    assert.equal(e.status, 'error');
    assert.equal(e.image, null);
    assert.equal(loader.status('bad.webp'), 'error');
    // muat ulang URL gagal tidak mengulang jaringan (cache negatif stabil)
    const e2 = await loader.load('bad.webp');
    assert.equal(e2.status, 'error');
  });

  await test('cache: URL sama hanya membuat satu Image', async () => {
    const { factory, made } = fakeFactory(new Set());
    const loader = createSpriteLoader(factory as never);
    const [e1, e2] = await Promise.all([loader.load('x.webp'), loader.load('x.webp')]);
    assert.equal(made.length, 1);
    assert.equal(e1, e2);
    assert.equal(loader.size(), 1);
    const e3 = await loader.load('x.webp');
    assert.equal(made.length, 1);
    assert.equal(e3.status, 'ready');
  });

  await test('URL berbeda dimuat terpisah (aset game lain tidak ikut)', async () => {
    const { factory, made } = fakeFactory(new Set());
    const loader = createSpriteLoader(factory as never);
    await loader.load('game-a/1.webp');
    await loader.load('game-b/2.webp');
    assert.equal(made.length, 2);
    assert.equal(loader.size(), 2);
  });

  await test('factory melempar -> error, bukan crash', async () => {
    const loader = createSpriteLoader((() => { throw new Error('no Image'); }) as never);
    const e = await loader.load('z.webp');
    assert.equal(e.status, 'error');
  });

  await test('clear() mengosongkan cache', async () => {
    const { factory } = fakeFactory(new Set());
    const loader = createSpriteLoader(factory as never);
    await loader.load('c.webp');
    loader.clear();
    assert.equal(loader.size(), 0);
    assert.equal(loader.status('c.webp'), 'idle');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log('FAILURES:', failures.join(', ')); process.exit(1); }
}

void main();
