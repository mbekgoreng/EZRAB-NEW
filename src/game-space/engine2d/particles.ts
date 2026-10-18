/**
 * EZRAB Game Space 2D — pooled canvas particles (src/game-space/engine2d/particles.ts)
 *
 * Zero-allocation steady state: fixed pool, ring allocation, dead particles
 * parked offscreen. Drawn as circles / rects / sparks with alpha fade.
 */

export type PShape = 'circle' | 'rect' | 'spark';

export interface SpawnOpts {
  count?: number;
  colors?: string[];
  /** speed range px/s */
  speed?: [number, number];
  /** base angle rad + spread rad (default: full circle) */
  angle?: number;
  spread?: number;
  /** extra upward bias px/s */
  up?: number;
  gravity?: number;
  /** life range seconds */
  life?: [number, number];
  /** radius range px */
  size?: [number, number];
  /** velocity damping per second (0..1 fraction kept^dt-ish) */
  drag?: number;
  shape?: PShape;
  rotation?: boolean;
}

interface P {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  shape: PShape;
  rot: number;
  vr: number;
}

const MAX = 700;

export class Particles2D {
  private pool: P[] = [];
  private cursor = 0;

  constructor(private readonly reducedMotion = false) {
    for (let i = 0; i < MAX; i += 1) {
      this.pool.push({
        alive: false, x: 0, y: -9999, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 3, color: '#fff',
        gravity: 0, drag: 0, shape: 'circle', rot: 0, vr: 0,
      });
    }
  }

  spawn(x: number, y: number, opts: SpawnOpts = {}): void {
    let count = opts.count ?? 18;
    if (this.reducedMotion) count = Math.ceil(count * 0.3);
    const colors = opts.colors ?? ['#ffffff'];
    const [s0, s1] = opts.speed ?? [60, 220];
    const baseAngle = opts.angle ?? 0;
    const spread = opts.spread ?? Math.PI * 2;
    const up = opts.up ?? 0;
    const [l0, l1] = opts.life ?? [0.4, 0.9];
    const [z0, z1] = opts.size ?? [2, 5];
    for (let n = 0; n < count; n += 1) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
      const a = baseAngle + (Math.random() - 0.5) * spread;
      const sp = s0 + Math.random() * (s1 - s0);
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - up * Math.random();
      p.maxLife = l0 + Math.random() * (l1 - l0);
      p.life = p.maxLife;
      p.size = z0 + Math.random() * (z1 - z0);
      p.color = colors[(Math.random() * colors.length) | 0];
      p.gravity = opts.gravity ?? 0;
      p.drag = opts.drag ?? 0;
      p.shape = opts.shape ?? 'circle';
      p.rot = opts.rotation ? Math.random() * Math.PI * 2 : 0;
      p.vr = opts.rotation ? (Math.random() - 0.5) * 12 : 0;
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        p.y = -9999;
        continue;
      }
      p.vy += p.gravity * dt;
      if (p.drag > 0) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = t < 0.5 ? t * 2 : 1;
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'rect') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.size * (0.5 + t * 0.5);
        ctx.fillRect(-s / 2, -s / 2, s, s * 0.7);
        ctx.restore();
      } else {
        // spark: short line along velocity
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * 0.4);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    for (const p of this.pool) {
      p.alive = false;
      p.y = -9999;
    }
  }
}
