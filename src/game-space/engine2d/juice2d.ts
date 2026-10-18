/**
 * EZRAB Game Space 2D — game feel: screen shake, floating scores, DOM popups
 * (src/game-space/engine2d/juice2d.ts)
 */

/* ---------------- trauma-based screen shake (2D) ---------------- */

export class Shake2D {
  private trauma = 0;
  private t = 0;

  constructor(private readonly reducedMotion = false) {}

  add(amount: number): void {
    if (this.reducedMotion) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): void {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
  }

  get x(): number {
    const s = this.trauma * this.trauma;
    return Math.sin(this.t * 91.7) * 14 * s;
  }

  get y(): number {
    const s = this.trauma * this.trauma;
    return Math.sin(this.t * 113.3 + 1.7) * 11 * s;
  }

  get active(): boolean {
    return this.trauma > 0.003;
  }
}

/* ---------------- canvas floating score texts ---------------- */

export interface FloatScoreOpts {
  color?: string;
  size?: number;
  vy?: number;
  life?: number;
}

interface FloatScore {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
}

export class FloatScores {
  private items: FloatScore[] = [];

  add(x: number, y: number, text: string, opts: FloatScoreOpts = {}): void {
    if (this.items.length > 24) this.items.shift();
    const life = opts.life ?? 0.9;
    this.items.push({
      x, y,
      vy: opts.vy ?? -70,
      life, maxLife: life,
      text,
      color: opts.color ?? '#ffffff',
      size: opts.size ?? 20,
    });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const s = this.items[i];
      s.life -= dt;
      s.y += s.vy * dt;
      s.vy *= 1 - 1.6 * dt;
      if (s.life <= 0) this.items.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const s of this.items) {
      const t = s.life / s.maxLife;
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.font = `900 ${s.size}px 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(15,23,42,0.55)';
      ctx.strokeText(s.text, s.x, s.y);
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.items.length = 0;
  }
}

/* ---------------- big DOM popup (combo / level clear) ---------------- */

let popupCssInjected = false;

function ensurePopupCss(): void {
  if (popupCssInjected || typeof document === 'undefined') return;
  popupCssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .gs2d-pop {
      position: absolute; left: 50%; top: 32%;
      transform: translate(-50%, -50%) scale(0.6);
      font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif;
      font-weight: 900; pointer-events: none; z-index: 8;
      color: #fff; text-shadow: 0 2px 14px rgba(15,23,42,.45), 0 1px 3px rgba(15,23,42,.6);
      animation: gs2dPop .95s cubic-bezier(.2,1.4,.4,1) forwards;
      white-space: nowrap; text-align: center;
    }
    @keyframes gs2dPop {
      0% { opacity: 0; transform: translate(-50%,-30%) scale(.5); }
      18% { opacity: 1; transform: translate(-50%,-50%) scale(1.12); }
      32% { transform: translate(-50%,-54%) scale(1); }
      75% { opacity: 1; }
      100% { opacity: 0; transform: translate(-50%,-120%) scale(.94); }
    }
    @media (prefers-reduced-motion: reduce) {
      .gs2d-pop { animation-duration: .01s; }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Big centered popup text over the canvas. Container must be position:relative.
 */
export function popText(
  container: HTMLElement,
  text: string,
  opts: { size?: number; color?: string } = {},
): void {
  try {
    ensurePopupCss();
    const el = document.createElement('div');
    el.className = 'gs2d-pop';
    el.textContent = text;
    el.style.fontSize = `${opts.size ?? 30}px`;
    if (opts.color) el.style.color = opts.color;
    el.style.marginLeft = `${(Math.random() - 0.5) * 40}px`;
    container.appendChild(el);
    window.setTimeout(() => el.remove(), 1000);
  } catch {
    /* DOM unavailable */
  }
}
