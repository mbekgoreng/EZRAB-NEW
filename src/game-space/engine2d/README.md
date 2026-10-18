# engine2d — Kontrak untuk 10 game 2D (WAJIB DIBACA)

Shared kit canvas 2D untuk semua game Game Space baru. **Dilarang Three.js.**

## Aturan keras

1. Setiap game = folder `src/game-space/games/<slug>/` berisi:
   - `logic.ts` — **pure** (tanpa DOM, tanpa `window`, tanpa Math.random tanpa seed di test). Semua aturan main yang bisa diuji di sini.
   - `<Nama>.tsx` — komponen React, **default export**, props `{ onExit: () => void }`.
   - `logic.test.ts` — test gaya `src/test/gameSpace.test.ts` (node:assert + counter, dijalankan `npx tsx <file>`). Minimal 10 test, semua hijau.
2. Jangan sentuh file game lain / file di luar `src/game-space`.
3. Bahasa UI: **Indonesia**. Humor estimator/konsultan wajib ada di tutorial & layar kalah/menang.
4. Setiap game WAJIB: tutorial overlay singkat (tombol "Mulai" → `sfx.ensure()`), pause (tombol + `api.loop.setPaused`), best score (via `best.ts`), juice (partikel + shake + suara + popup skor), layar menang/kalah yang memuaskan, mute button (`sfx.toggleMute()`), touch-friendly 390px, hormati `prefers-reduced-motion` (sudah otomatis di shake/particles — jangan tambah efek intens manual saat `api.reducedMotion`).
5. Tidak ada placeholder — semua tombol/fitur berfungsi.

## Cara pakai (pola baku setiap game)

```tsx
import React, { useState, useCallback } from 'react';
import { useGameCanvas, GameApi } from '../../engine2d';
import { bestKey, getBest, setBest } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import { createState, updateState } from './logic'; // pure

interface Hud { score: number; best: number; level: number; }

export default function GameSaya({ onExit }: { onExit: () => void }) {
  const [hud, setHud] = useState<Hud>({ score: 0, best: getBest(bestKey('slug','best')), level: 1 });
  const [screen, setScreen] = useState<'tutorial'|'play'|'pause'|'over'|'win'>('tutorial');
  const [muted, setMuted] = useState(false);

  const canvasRef = useGameCanvas((api) => {
    api.pushHud = (h) => setHud(h as Hud); // panggil max ~10x/detik atau saat event
    const S = createState(api.W, api.H);
    api.setUpdate((dt) => { updateState(S, dt, api); });
    api.setRender(() => { drawGame(api.ctx, S, api.W, api.H); });
    api.input.onDown = (p) => { api.sfx.ensure(); handleTap(S, p.x, p.y, api); };
    api.onResize((w, h) => { /* sesuaikan layout jika perlu */ });
    // JANGAN api.loop.start() di sini — start saat user tekan "Mulai"
    return () => { /* cleanup tambahan */ };
  });

  const start = () => { /* akses api via ref? simpan api di useRef saat setup */ };
  ...
  return (
    <div className="gs2d-wrap">
      <canvas ref={canvasRef} className="gs2d-canvas" />
      {/* HUD React di atas canvas */}
    </div>
  );
}
```

**Catatan loop:** `useGameCanvas` tidak men-start loop otomatis. Simpan `api` ke `useRef` dalam setup,
lalu tombol "Mulai" memanggil `apiRef.current?.loop.start()` + `setScreen('play')`.
Pause: `api.loop.setPaused(true/false)` + overlay React.

## API ringkas

- `api.W/api.H` — ukuran CSS px (live, update saat resize). `api.dpr`.
- `api.loop.start()/setPaused(bool)/isPaused/dispose()`
- `api.input.onDown/onMove/onUp = (p:{x,y}, e) => void`; `api.input.down('ArrowLeft')`, `api.input.wasPressed('Space')` (edge, konsumsi 1x).
- `api.particles.spawn(x, y, {count, colors, speed:[lo,hi], angle, spread, up, gravity, life:[lo,hi], size:[lo,hi], drag, shape:'circle'|'rect'|'spark', rotation})`
- `api.shake.add(0..1)` — otomatis di-apply sebagai translate.
- `api.scores.add(x, y, text, {color, size, vy, life})` — teks melayang di canvas.
- `popText(containerEl, text, {size, color})` — popup DOM besar (perlu container position:relative).
- `api.sfx.ensure/click/pop/pitch/thud/crumble/chime/whoosh/fail/toggleMute()` — `sfx.muted` untuk ikon.
- `bestKey(slug,name)`, `getBest(key, fallback)`, `setBest(key, v)`, `getJson/setJson`.
- helpers: `clamp, lerp, rand, randInt, choice, shuffle, rectsOverlap, pointInRect, dist, distToSegment, easeOutCubic, fmtTime, TAU`.

## Pola gambar "kelas game asli" (wajib terlihat bagus)

- Background: gradien langit (3+ stops) + parallax (awan/gunung/siluet gedung berlapis, kecepatan beda) + vignette halus.
- Objek: bentuk berlapis — base fill + highlight (gradien/ellipse terang) + outline gelap 2px + detail (garis/pola). Contoh bata: fill oranye + garis mortar + highlight atas.
- Selalu ada: bayangan di bawah objek (ellipse hitam transparan), partikel debu saat aksi, `FloatScores` untuk angka.
- Font: `'Plus Jakarta Sans', 'Inter', system-ui` — judul 900, HUD 700.
- Jangan gambar kotak flat 1 warna tanpa detail — itu yang user sebut "jelek".

## Test (wajib)

`logic.test.ts` di folder game, pola:
```ts
import { strict as assert } from 'node:assert';
import { fn } from './logic';
let passed = 0, failed = 0; const failures: string[] = [];
function test(name: string, fn: () => void) { try { fn(); passed++; console.log(`  PASS ${name}`); } catch (e) { failed++; failures.push(name); console.log(`  FAIL ${name} — ${(e as Error).message}`); } }
// ... tests ...
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```
Jalankan: `npx tsx src/game-space/games/<slug>/logic.test.ts`. Deterministik: inject RNG/seed bila logic pakai random.

## Screenshot (wajib, review sendiri)

1. Buat `/tmp/gs2d-<slug>/harness.tsx` — render komponen game (pilih via `?game=` bila 2 game).
2. `ln -s ~/workspace/ezrab-unified/node_modules /tmp/gs2d-<slug>/node_modules`
3. Bundle: `cd ~/workspace/ezrab-unified && npx esbuild /tmp/gs2d-<slug>/harness.tsx --bundle --outfile=/tmp/gs2d-<slug>/bundle.js --jsx=automatic --loader:.ts=ts --minify`
4. `/tmp/gs2d-<slug>/index.html` memuat bundle.js + CSS minimal (canvas full-size 390x700 & 900x700).
5. Serve: `cd /tmp/gs2d-<slug> && python3 -m http.server 8901 &`
6. Playwright (`node` dari worktree agar `require('playwright')` ketemu):
```js
import { createRequire } from 'module';
const require = createRequire('/home/hatch/workspace/ezrab-unified/package.json');
const { chromium } = require('playwright');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 700 } });
await p.goto('http://localhost:8901/index.html?game=slug');
await p.waitForTimeout(1200);
// klik "Mulai" bila ada: await p.click('text=Mulai');
await p.mouse.click(195, 350); // aksi contoh
await p.waitForTimeout(800);
await p.screenshot({ path: '/tmp/gs2d-<slug>/shot.png' });
await b.close();
```
7. **Baca PNG-nya sendiri** (`muse.read`) — nilai: apakah terlihat seperti game asli? Iterasi bila jelek.

## Humor estimator (contoh, buat sendiri yang segar)

- "RAB direvisi klien ke-13 kalinya…"
- "Mandor kabur pas hujan. Seperti biasa."
- "AHSP bilang cukup, harga pasar bilang tidak."
- "Estimasi selesai… eh, gambar revisi."
- "Konsultan: 'coba dihitung ulang ya.'"
