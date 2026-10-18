/**
 * EZRAB Game Space v2 — procedural textures (src/game-space/fx/textures.ts)
 *
 * Zero external assets: every texture is painted on an offscreen canvas at
 * runtime and handed to Three.js as a CanvasTexture. This is what gives the
 * v2 games their "real game" depth: speckle, mortar lines, window grids,
 * wood grain, diagonal glass shine, soft blob shadows.
 *
 * All textures use SRGBColorSpace + RepeatWrapping so they tile cleanly on
 * box faces. Callers should dispose() the returned texture with their engine.
 */

import * as THREE from 'three';

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no-2d-context');
  return [c, ctx];
}

/** Deterministic-ish PRNG so textures look the same every run. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number, rand: () => number) => void,
  seed = 7,
  repeat = 1,
): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size);
  draw(ctx, size, mulberry(seed));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

function speckle(
  ctx: CanvasRenderingContext2D,
  size: number,
  rand: () => number,
  count: number,
  alpha: number,
  light: string,
  dark: string,
): void {
  for (let i = 0; i < count; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.5 + rand() * 1.8;
    ctx.globalAlpha = alpha * (0.4 + rand() * 0.6);
    ctx.fillStyle = rand() > 0.5 ? light : dark;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---------------- concrete (noise speckle + stains) ---------------- */

export function concreteTexture(base = '#9aa3ad', seed = 11): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, size, rand) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    // large soft tonal patches
    for (let i = 0; i < 14; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 20 + rand() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tone = rand() > 0.5 ? '255,255,255' : '0,0,0';
      g.addColorStop(0, `rgba(${tone},0.06)`);
      g.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(ctx, size, rand, 2600, 0.16, '#ffffff', '#1f2937');
    // hairline cracks
    ctx.strokeStyle = 'rgba(30,41,59,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      let x = rand() * size;
      let y = rand() * size;
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s += 1) {
        x += (rand() - 0.5) * 40;
        y += (rand() - 0.5) * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, seed);
}

/* ---------------- glass facade (window grid + diagonal shine) ---------------- */

export function glassFacadeTexture(opts: {
  base?: string;
  frame?: string;
  litRatio?: number;
  seed?: number;
} = {}): THREE.CanvasTexture {
  const { base = '#3b4a63', frame = '#1e293b', litRatio = 0.28, seed = 23 } = opts;
  return canvasTexture(256, (ctx, size, rand) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const cols = 4;
    const rows = 4;
    const cw = size / cols;
    const ch = size / rows;
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        const lit = rand() < litRatio;
        const x = cx * cw + 3;
        const y = cy * ch + 3;
        const w = cw - 6;
        const h = ch - 6;
        // window glass: vertical gradient (sky reflection)
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        if (lit) {
          g.addColorStop(0, '#fde68a');
          g.addColorStop(1, '#f59e0b');
        } else {
          g.addColorStop(0, '#7d90b5');
          g.addColorStop(0.55, '#4c5f86');
          g.addColorStop(1, '#2c3a58');
        }
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        // inner highlight line
        ctx.fillStyle = lit ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.16)';
        ctx.fillRect(x, y, w, 2.5);
        // frame
        ctx.strokeStyle = frame;
        ctx.lineWidth = 5;
        ctx.strokeRect(cx * cw + 1.5, cy * ch + 1.5, cw - 3, ch - 3);
      }
    }
    // diagonal shine streak across the whole facade
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-0.5);
    const shine = ctx.createLinearGradient(-40, 0, 40, 0);
    shine.addColorStop(0, 'rgba(255,255,255,0)');
    shine.addColorStop(0.5, 'rgba(255,255,255,0.14)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fillRect(-40, -size, 80, size * 2);
    ctx.restore();
    speckle(ctx, size, rand, 300, 0.05, '#ffffff', '#000000');
  }, seed);
}

/* ---------------- brick (running bond + mortar) ---------------- */

export function brickTexture(base = '#b4563f', seed = 37): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, size, rand) => {
    ctx.fillStyle = '#c9c2b8'; // mortar
    ctx.fillRect(0, 0, size, size);
    const rows = 8;
    const bh = size / rows;
    const bw = size / 4;
    for (let r = 0; r < rows; r += 1) {
      const off = r % 2 === 0 ? 0 : bw / 2;
      for (let cx = -1; cx < 5; cx += 1) {
        const x = cx * bw + off;
        const y = r * bh;
        // per-brick tone variation
        const v = (rand() - 0.5) * 26;
        ctx.fillStyle = `rgb(${180 + v},${86 + v * 0.6},${63 + v * 0.5})`;
        ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        // top bevel highlight / bottom shade
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x + 2, y + 2, bw - 4, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x + 2, y + bh - 5, bw - 4, 3);
      }
    }
    // base param tints the whole thing slightly
    void base;
    speckle(ctx, size, rand, 900, 0.08, '#ffffff', '#3f2a22');
  }, seed);
}

/* ---------------- wood (grain stripes) ---------------- */

export function woodTexture(base = '#a97c50', seed = 51): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, size, rand) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    // long grain stripes with sine wobble
    for (let i = 0; i < 46; i += 1) {
      const x0 = rand() * size;
      const amp = 2 + rand() * 6;
      const per = 40 + rand() * 80;
      const dark = rand() > 0.35;
      ctx.strokeStyle = dark ? 'rgba(74,48,28,0.28)' : 'rgba(255,235,200,0.16)';
      ctx.lineWidth = 0.8 + rand() * 2.2;
      ctx.beginPath();
      for (let y = 0; y <= size; y += 8) {
        const x = x0 + Math.sin((y / per) * Math.PI * 2) * amp;
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // knots
    for (let i = 0; i < 5; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 4 + rand() * 7;
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, 'rgba(60,38,20,0.55)');
      g.addColorStop(1, 'rgba(60,38,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    speckle(ctx, size, rand, 400, 0.05, '#ffffff', '#3a2415');
  }, seed);
}

/* ---------------- asphalt / soil ---------------- */

export function asphaltTexture(seed = 67): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, size, rand) => {
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, rand, 4200, 0.22, '#9ca3af', '#111827');
    // faint patches
    for (let i = 0; i < 10; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 24 + rand() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, seed);
}

export function soilTexture(base = '#6b5136', seed = 71): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, size, rand) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, rand, 3000, 0.22, '#d9b98c', '#2e2113');
    for (let i = 0; i < 8; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 20 + rand() * 44;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(46,33,19,0.16)');
      g.addColorStop(1, 'rgba(46,33,19,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, seed);
}

/* ---------------- helpers ---------------- */

/** Vertical gradient texture — tintable sky / backdrop. */
export function gradientTexture(stops: Array<[number, string]>, seed = 3): THREE.CanvasTexture {
  return canvasTexture(64, (ctx, size) => {
    const g = ctx.createLinearGradient(0, 0, 0, size);
    stops.forEach(([at, color]) => g.addColorStop(at, color));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }, seed);
}

/**
 * Soft radial blob — fake contact shadow / ambient occlusion under objects.
 * Draw with black center fading out; use on a plane with transparent material.
 */
export function blobShadowTexture(seed = 5): THREE.CanvasTexture {
  const tex = canvasTexture(128, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }, seed);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Small soft circle sprite for particle points. */
export function softDotTexture(seed = 9): THREE.CanvasTexture {
  const tex = canvasTexture(64, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }, seed);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
