/**
 * EZRAB Game Space v2 — game feel helpers (src/game-space/fx/juice.ts)
 *
 * - Shake: trauma-based camera shake (trauma² falloff, smooth decay).
 * - SkyDome: shader gradient dome with lerppable top/bottom colors + optional stars.
 * - comboPopup: floating HTML popup (score juice) — CSS-animated, self-removing.
 * - SlowMo: time-scale dip that eases back to 1 (perfect-drop slow motion).
 */

import * as THREE from 'three';

/* ---------------- camera shake ---------------- */

export class Shake {
  private trauma = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Decay per frame; call every tick. */
  update(dt: number): void {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }

  /** Current offset in world units (call after update). */
  offset(out: THREE.Vector3, time: number): THREE.Vector3 {
    const s = this.trauma * this.trauma;
    out.set(
      Math.sin(time * 91.7) * 0.35 * s,
      Math.sin(time * 113.3 + 1.7) * 0.28 * s,
      Math.cos(time * 83.1 + 0.6) * 0.2 * s,
    );
    return out;
  }

  get active(): boolean {
    return this.trauma > 0.001;
  }
}

/* ---------------- sky dome ---------------- */

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 midColor;
  uniform vec3 botColor;
  uniform float starAlpha;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float h = normalize(vWorld).y; // -1..1
    vec3 col;
    if (h > 0.0) {
      // game cameras look near-horizontal (visible sky is h 0..~0.1):
      // compress hard so the strip shows the full gradient story
      float t = clamp(h * 6.0 + 0.25, 0.0, 1.0);
      col = mix(midColor, topColor, pow(t, 0.8));
    } else {
      col = mix(midColor, botColor, pow(-h, 0.8));
    }
    // sun glow disc near horizon in -z? keep generic: warm glow toward topColor hue
    // stars
    if (starAlpha > 0.001 && h > 0.02) {
      vec2 sp = normalize(vWorld).xz / max(0.15, normalize(vWorld).y);
      vec2 cell = floor(sp * 90.0);
      float star = step(0.992, hash(cell));
      float tw = 0.6 + 0.4 * sin(hash(cell * 1.7) * 40.0 + h * 200.0);
      col += vec3(1.0, 0.98, 0.92) * star * tw * starAlpha * smoothstep(0.02, 0.3, h);
    }
    // subtle horizon haze
    col = mix(col, midColor, (1.0 - abs(h)) * 0.25);
    gl_FragColor = vec4(col, 1.0);
    // match the renderer's ACES tone mapping + sRGB output like built-in materials
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class SkyDome {
  readonly mesh: THREE.Mesh;
  private uniforms: {
    topColor: { value: THREE.Color };
    midColor: { value: THREE.Color };
    botColor: { value: THREE.Color };
    starAlpha: { value: number };
  };
  private target = { top: new THREE.Color(), mid: new THREE.Color(), bot: new THREE.Color(), stars: 0 };
  private blend = 1;

  constructor(top: string, mid: string, bot: string) {
    this.uniforms = {
      topColor: { value: new THREE.Color(top) },
      midColor: { value: new THREE.Color(mid) },
      botColor: { value: new THREE.Color(bot) },
      starAlpha: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.target.top.set(top);
    this.target.mid.set(mid);
    this.target.bot.set(bot);
  }

  /** Ease sky colors toward a new palette over ~2.5s. */
  transitionTo(top: string, mid: string, bot: string, stars = 0): void {
    this.target.top.set(top);
    this.target.mid.set(mid);
    this.target.bot.set(bot);
    this.target.stars = stars;
    this.blend = 0;
  }

  setStars(alpha: number): void {
    this.uniforms.starAlpha.value = alpha;
    this.target.stars = alpha;
  }

  update(dt: number): void {
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 2.5);
      // exponential ease toward target palette
      const e = 1 - Math.pow(0.001, dt / 2.5);
      this.uniforms.topColor.value.lerp(this.target.top, e);
      this.uniforms.midColor.value.lerp(this.target.mid, e);
      this.uniforms.botColor.value.lerp(this.target.bot, e);
      const s = this.uniforms.starAlpha.value;
      this.uniforms.starAlpha.value = s + (this.target.stars - s) * e;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/* ---------------- HTML combo popup ---------------- */

let popupStyleInjected = false;

function ensurePopupStyle(): void {
  if (popupStyleInjected || typeof document === 'undefined') return;
  popupStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .gs-combo-pop {
      position: absolute; left: 50%; top: 34%;
      transform: translate(-50%, -50%) scale(0.6);
      font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif;
      font-weight: 900; pointer-events: none; z-index: 8;
      color: #fff; text-shadow: 0 2px 14px rgba(15,23,42,.45), 0 1px 3px rgba(15,23,42,.6);
      animation: gsComboPop .9s cubic-bezier(.2,1.4,.4,1) forwards;
      white-space: nowrap;
    }
    @keyframes gsComboPop {
      0% { opacity: 0; transform: translate(-50%,-30%) scale(.5); }
      18% { opacity: 1; transform: translate(-50%,-50%) scale(1.12); }
      32% { transform: translate(-50%,-54%) scale(1); }
      75% { opacity: 1; }
      100% { opacity: 0; transform: translate(-50%,-120%) scale(.94); }
    }
    @media (prefers-reduced-motion: reduce) {
      .gs-combo-pop { animation-duration: .01s; }
    }
  `;
  document.head.appendChild(style);
}

/** Floating score text over the canvas. Container must be position:relative. */
export function comboPopup(
  container: HTMLElement,
  text: string,
  opts: { size?: number; color?: string } = {},
): void {
  try {
    ensurePopupStyle();
    const el = document.createElement('div');
    el.className = 'gs-combo-pop';
    el.textContent = text;
    el.style.fontSize = `${opts.size ?? 30}px`;
    if (opts.color) el.style.color = opts.color;
    // slight horizontal jitter so stacked popups don't perfectly overlap
    el.style.marginLeft = `${(Math.random() - 0.5) * 60}px`;
    container.appendChild(el);
    window.setTimeout(() => el.remove(), 950);
  } catch {
    /* DOM unavailable */
  }
}

/* ---------------- slow motion ---------------- */

export class SlowMo {
  private scale = 1;
  private target = 1;

  /** Dip time-scale briefly (e.g. perfect drop). */
  dip(to = 0.25, holdMs = 180): void {
    this.scale = to;
    this.target = 1;
    window.setTimeout(() => {
      this.target = 1;
    }, holdMs);
  }

  update(dt: number): number {
    const e = 1 - Math.pow(0.0001, dt);
    this.scale += (this.target - this.scale) * e;
    if (Math.abs(this.scale - this.target) < 0.01) this.scale = this.target;
    return this.scale;
  }

  get value(): number {
    return this.scale;
  }
}
