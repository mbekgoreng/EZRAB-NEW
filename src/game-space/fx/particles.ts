/**
 * EZRAB Game Space v2 — particle systems (src/game-space/fx/particles.ts)
 *
 * Pooled THREE.Points emitters: zero per-frame allocation during gameplay.
 * - DustBurst: one-shot puffs (destruction, landings) with gravity + fade.
 * - AmbientMotes: endlessly drifting specks (zen calm / night fireflies).
 *
 * Callers own the returned THREE.Points and must scene.add / dispose them.
 */

import * as THREE from 'three';
import { softDotTexture } from './textures';

export interface BurstOptions {
  count?: number;
  color?: number | number[];
  speed?: number;
  up?: number;
  size?: number;
  gravity?: number;
  life?: number;
  spread?: number;
}

const MAX_PARTICLES = 900;

export class DustBurst {
  readonly points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseCol: Float32Array;
  private colAttr: THREE.BufferAttribute;
  private alive = 0;
  private tmpColor = new THREE.Color();

  constructor() {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.baseCol = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.colAttr = new THREE.BufferAttribute(colors, 3);
    this.geo.setAttribute('color', this.colAttr);
    const mat = new THREE.PointsMaterial({
      size: 0.22,
      map: softDotTexture(),
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      opacity: 0.95,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    // park all particles far below
    for (let i = 0; i < MAX_PARTICLES; i += 1) this.pos[i * 3 + 1] = -100;
  }

  /** Spawn a burst at world position. Reuses dead slots (ring allocation). */
  spawn(p: THREE.Vector3, opts: BurstOptions = {}): void {
    const count = opts.count ?? 26;
    const colors = Array.isArray(opts.color) ? opts.color : [opts.color ?? 0xcfc6b8];
    const speed = opts.speed ?? 3.2;
    const up = opts.up ?? 2.4;
    const life = opts.life ?? 0.9;
    const spread = opts.spread ?? 0.35;
    for (let n = 0; n < count; n += 1) {
      const i = this.alive % MAX_PARTICLES;
      this.alive += 1;
      const i3 = i * 3;
      this.pos[i3] = p.x + (Math.random() - 0.5) * spread;
      this.pos[i3 + 1] = p.y + (Math.random() - 0.5) * spread;
      this.pos[i3 + 2] = p.z + (Math.random() - 0.5) * spread;
      const a = Math.random() * Math.PI * 2;
      const r = (0.3 + Math.random() * 0.7) * speed;
      this.vel[i3] = Math.cos(a) * r;
      this.vel[i3 + 1] = Math.random() * up;
      this.vel[i3 + 2] = Math.sin(a) * r;
      const l = life * (0.6 + Math.random() * 0.6);
      this.life[i] = l;
      this.maxLife[i] = l;
      this.tmpColor.setHex(colors[(Math.random() * colors.length) | 0]);
      this.baseCol[i3] = this.tmpColor.r;
      this.baseCol[i3 + 1] = this.tmpColor.g;
      this.baseCol[i3 + 2] = this.tmpColor.b;
      this.colAttr.setXYZ(i, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);
    }
    this.colAttr.needsUpdate = true;
  }

  update(dt: number): void {
    const g = 7.5;
    let anyAlive = false;
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      if (this.life[i] <= 0) continue;
      anyAlive = true;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.pos[i3 + 1] = -100;
        continue;
      }
      this.vel[i3 + 1] -= g * dt;
      // ground bounce at y=0 with damping
      if (this.pos[i3 + 1] < 0.03 && this.vel[i3 + 1] < 0) {
        this.vel[i3 + 1] *= -0.35;
        this.vel[i3] *= 0.6;
        this.vel[i3 + 2] *= 0.6;
        this.pos[i3 + 1] = 0.03;
      }
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      // fade toward end of life (from stored base color — no compounding)
      const k = this.life[i] / this.maxLife[i];
      const f = k < 0.45 ? 0.15 + (k / 0.45) * 0.85 : 1;
      this.colAttr.setXYZ(i, this.baseCol[i3] * f, this.baseCol[i3 + 1] * f, this.baseCol[i3 + 2] * f);
    }
    if (anyAlive || true) {
      (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      this.colAttr.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

export interface MotesOptions {
  count?: number;
  area?: number;
  height?: number;
  color?: number;
  size?: number;
  speed?: number;
}

/** Slowly drifting ambient specks inside a box volume. Loops forever. */
export class AmbientMotes {
  readonly points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private seed: Float32Array;
  private area: number;
  private height: number;
  private speed: number;
  private time = 0;

  constructor(opts: MotesOptions = {}) {
    const count = opts.count ?? 90;
    this.area = opts.area ?? 16;
    this.height = opts.height ?? 8;
    this.speed = opts.speed ?? 0.35;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.seed = new Float32Array(count * 2);
    for (let i = 0; i < count; i += 1) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.area;
      this.pos[i * 3 + 1] = Math.random() * this.height;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.area;
      this.seed[i * 2] = Math.random() * Math.PI * 2;
      this.seed[i * 2 + 1] = 0.3 + Math.random() * 0.7;
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.PointsMaterial({
      size: opts.size ?? 0.09,
      map: softDotTexture(),
      transparent: true,
      depthWrite: false,
      color: opts.color ?? 0xffe9c4,
      opacity: 0.55,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  update(dt: number): void {
    this.time += dt;
    const n = this.pos.length / 3;
    for (let i = 0; i < n; i += 1) {
      const s1 = this.seed[i * 2];
      const s2 = this.seed[i * 2 + 1];
      this.pos[i * 3] += Math.sin(this.time * this.speed * s2 + s1) * dt * 0.35;
      this.pos[i * 3 + 1] += Math.cos(this.time * this.speed * 0.7 * s2 + s1 * 1.7) * dt * 0.22 + dt * 0.06;
      this.pos[i * 3 + 2] += Math.cos(this.time * this.speed * s2 + s1 * 0.6) * dt * 0.35;
      if (this.pos[i * 3 + 1] > this.height) this.pos[i * 3 + 1] = 0;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
