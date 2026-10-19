/**
 * Procedural texture helpers (no downloaded assets).
 * Pre-rendered once, drawn as a cheap repeating pattern — safe at 60fps.
 */

/** Deterministic PRNG for stable textures (same look every frame). */
export function hashRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const patternCache = new Map<string, CanvasPattern | null>();

/**
 * Film-grain noise overlay, drawn as a repeating pre-rendered tile.
 * `color` must be '#rrggbb' (or '#rgb'); `alpha` controls strength.
 */
export function drawNoise(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  color = '#ffffff',
  alpha = 0.05,
  size = 140,
): void {
  const key = `${color}|${size}`;
  let pat = patternCache.get(key);
  if (pat === undefined) {
    pat = null;
    try {
      const tile = document.createElement('canvas');
      tile.width = size;
      tile.height = size;
      const tctx = tile.getContext('2d');
      if (tctx) {
        const [r, g, b] = hexToRgb(color);
        const rnd = hashRand(0xc0ffee);
        const img = tctx.createImageData(size, size);
        for (let i = 0; i < img.data.length; i += 4) {
          img.data[i] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = Math.floor(rnd() * 255);
        }
        tctx.putImageData(img, 0, 0);
        pat = ctx.createPattern(tile, 'repeat');
      }
    } catch {
      pat = null;
    }
    patternCache.set(key, pat);
  }
  if (!pat) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Faint blueprint grid. */
export function drawBlueprintGrid(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  step = 28,
  color = 'rgba(100,130,180,0.07)',
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = step; x < W; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = step; y < H; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.restore();
}
