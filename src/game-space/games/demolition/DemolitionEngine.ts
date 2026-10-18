/**
 * EZRAB Game Space v2 — Demolition engine (src/game-space/games/demolition/DemolitionEngine.ts)
 *
 * Renders the logic building with textured materials (concrete / glass facade
 * / pillars / roof slab), warm afternoon light, soft shadows, dust bursts,
 * debris chunks with gravity + bounce, camera shake, and a growing rubble
 * pile at the base. Dumb renderer mirror: all rules live in logic.ts.
 */

import * as THREE from 'three';
import { BaseEngine } from '../../fx/BaseEngine';
import { DustBurst } from '../../fx/particles';
import { SkyDome, comboPopup } from '../../fx/juice';
import { concreteTexture, glassFacadeTexture, asphaltTexture, blobShadowTexture } from '../../fx/textures';
import { sfx } from '../../fx/audio';
import {
  createBuilding, hitBlock, percentDestroyed, remainingBlocks,
  type DemoState, type CellKind,
} from './logic';

export interface DemolitionCallbacks {
  onScore: (score: number, percent: number, combo: number, remaining: number) => void;
  onWin: () => void;
  onAutoPause: () => void;
}

interface Debris {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface Wobble {
  mesh: THREE.Mesh;
  t: number;
  amp: number;
}

const BLOCK = 1;
const GAP = 0.05;
const STEP = BLOCK + GAP;

export class DemolitionEngine extends BaseEngine {
  static get activeCount(): number {
    return BaseEngine.countFor('demolition');
  }

  private state: DemoState = createBuilding(1);
  private cb: DemolitionCallbacks;
  private blockMeshes: (THREE.Mesh | null)[][] = [];
  private blockMats = new Map<CellKind, THREE.Material>();
  private debris: Debris[] = [];
  private debrisGeo: THREE.BoxGeometry;
  private wobbles: Wobble[] = [];
  private dust: DustBurst;
  private sky: SkyDome;
  private rubble: THREE.Mesh[] = [];
  private rubbleGeo: THREE.BoxGeometry;
  private buildAnim: Array<{ mesh: THREE.Mesh; delay: number; t: number }> = [];
  private container: HTMLElement | null = null;
  private seedCounter = 1;

  constructor(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean; callbacks: DemolitionCallbacks }) {
    super(canvas, 'demolition', {
      reducedMotion: opts.reducedMotion,
      camPos: new THREE.Vector3(8.6, 7.2, 11.5),
      lookAt: new THREE.Vector3(0, 3.1, 0),
      fog: [0xf3d9b8, 26, 58],
      sun: [0xffd9a8, 2.1],
      shadowBounds: 9,
    });
    this.cb = opts.callbacks;
    this.container = canvas.parentElement;
    this.dust = new DustBurst();
    this.scene.add(this.dust.points);
    this.sky = new SkyDome('#7fb2e8', '#f6c98f', '#e8a06a');
    this.scene.add(this.sky.mesh);
    this.debrisGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.rubbleGeo = new THREE.BoxGeometry(0.34, 0.24, 0.34);
    this.own(this.debrisGeo);
    this.own(this.rubbleGeo);
    this.buildMaterials();
    this.spawnBuilding(true);
    this.emitScore();
  }

  /* ---------------- scene ---------------- */

  protected buildScene(): void {
    // asphalt ground
    const groundTex = this.own(asphaltTexture());
    groundTex.repeat.set(10, 10);
    const ground = new THREE.Mesh(
      this.own(new THREE.CircleGeometry(26, 48)),
      this.own(new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96, metalness: 0 })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // demolition zone: hazard ring (flat ring geometry, yellow w/ dark stripes via canvas)
    const ring = new THREE.Mesh(
      this.own(new THREE.RingGeometry(5.4, 6.1, 48)),
      this.own(new THREE.MeshBasicMaterial({ color: 0xd9a419, transparent: true, opacity: 0.55 })),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.scene.add(ring);

    // soft blob shadow anchor under the building footprint
    const blob = new THREE.Mesh(
      this.own(new THREE.PlaneGeometry(9.5, 9.5)),
      this.own(new THREE.MeshBasicMaterial({
        map: this.own(blobShadowTexture()), transparent: true, depthWrite: false, opacity: 0.5,
      })),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.015;
    this.scene.add(blob);

    // distant city silhouettes for depth (warmed so they sit in the haze)
    const silMat = this.own(new THREE.MeshStandardMaterial({ color: 0xb49a86, roughness: 1 }));
    const silGeo = this.own(new THREE.BoxGeometry(1, 1, 1));
    const spots: Array<[number, number, number, number]> = [
      [-13, -9, 3.2, 7], [-9.5, -12, 2.4, 5], [12, -10, 3.8, 8.5],
      [15.5, -4, 2.2, 4.5], [-15, 2, 2.8, 6], [10, 12, 3, 5.5], [-11, 11, 2.6, 6.5],
    ];
    spots.forEach(([sx, sz, sw, sh]) => {
      const m = new THREE.Mesh(silGeo, silMat);
      m.scale.set(sw, sh, sw);
      m.position.set(sx, sh / 2 - 0.02, sz);
      this.scene.add(m);
    });

    // a couple of site cones
    const coneGeo = this.own(new THREE.ConeGeometry(0.28, 0.7, 12));
    const coneMat = this.own(new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.8 }));
    [[4.6, 3.4], [-4.8, 2.8], [3.9, -4.4]].forEach(([cx, cz]) => {
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(cx, 0.35, cz);
      cone.castShadow = true;
      this.scene.add(cone);
    });
  }

  private buildMaterials(): void {
    const concrete = this.own(concreteTexture('#a8b0ba', 101));
    const concreteDark = this.own(concreteTexture('#7e8894', 102));
    const glass = this.own(glassFacadeTexture({ seed: 103 }));
    const roofTex = this.own(concreteTexture('#8d949e', 104));
    const std = (map: THREE.Texture, rough = 0.85) =>
      this.own(new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0.04 }));
    this.blockMats.set('concrete', std(concrete));
    this.blockMats.set('glass', this.own(new THREE.MeshStandardMaterial({
      map: glass, roughness: 0.32, metalness: 0.35,
    })));
    this.blockMats.set('pillar', std(concreteDark, 0.9));
    this.blockMats.set('roof', std(roofTex, 0.95));
  }

  private cellPos(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(
      (x - (this.state.w - 1) / 2) * STEP,
      y * STEP + BLOCK / 2,
      0,
    );
  }

  private spawnBuilding(first: boolean): void {
    // clear old
    this.blockMeshes.forEach((col) => col.forEach((m) => m && this.scene.remove(m)));
    this.blockMeshes = [];
    this.rubble.forEach((m) => this.scene.remove(m));
    this.rubble = [];
    this.debris.forEach((d) => this.scene.remove(d.mesh));
    this.debris = [];
    this.wobbles = [];
    this.buildAnim = [];

    const geo = this.own(new THREE.BoxGeometry(BLOCK, BLOCK * 0.92, BLOCK));
    for (let x = 0; x < this.state.w; x += 1) {
      this.blockMeshes[x] = [];
      for (let y = 0; y < this.state.h; y += 1) {
        const cell = this.state.cells[x][y];
        if (!cell.present) {
          this.blockMeshes[x][y] = null;
          continue;
        }
        const mesh = new THREE.Mesh(geo, this.blockMats.get(cell.kind) ?? this.blockMats.get('concrete'));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.copy(this.cellPos(x, y));
        mesh.userData.cell = { x, y };
        this.scene.add(mesh);
        this.blockMeshes[x][y] = mesh;
        if (!first && !this.reducedMotion) {
          mesh.scale.setScalar(0.01);
          this.buildAnim.push({ mesh, delay: (x + y) * 0.045, t: 0 });
        }
      }
    }
  }

  /* ---------------- gameplay ---------------- */

  protected onTap(clientX: number, clientY: number): void {
    const standing: THREE.Object3D[] = [];
    this.blockMeshes.forEach((col) => col.forEach((m) => m && standing.push(m)));
    if (standing.length === 0) return;
    const hits = this.pickMeshes(clientX, clientY, standing);
    if (hits.length === 0) return;
    const ud = (hits[0].object as THREE.Mesh).userData.cell as { x: number; y: number };
    this.destroyCell(ud.x, ud.y);
  }

  protected onHidden(): void {
    this.cb.onAutoPause();
  }

  /** Direct logical hit (used by taps and by tests). */
  destroyCell(x: number, y: number): void {
    if (this.disposed || this.paused) return;
    sfx.ensure();
    const res = hitBlock(this.state, x, y, performance.now());
    if (!res.hit) return;

    const n = res.destroyedCells.length;
    res.destroyedCells.forEach((cell, i) => {
      const mesh = this.blockMeshes[cell.x]?.[cell.y];
      if (mesh) {
        this.burstDebris(mesh.position, cell.kind);
        this.scene.remove(mesh);
        this.blockMeshes[cell.x][cell.y] = null;
        // wobble surviving neighbors
        this.wobbleNeighbors(cell.x, cell.y);
      }
      // dust at impact, staggered slightly for cascade feel
      const p = this.cellPos(cell.x, cell.y);
      window.setTimeout(() => {
        if (!this.disposed) this.dust.spawn(p, { count: 10, color: [0xd8cfc0, 0xb8ad9c, 0x9aa3ad], speed: 2.4, up: 2.8 });
      }, this.reducedMotion ? 0 : Math.min(320, i * 28));
      // rubble pile grows at the base
      if (this.rubble.length < 42 && Math.random() < 0.75) this.addRubble(cell.x);
    });

    this.addShake(Math.min(0.55, 0.14 + n * 0.05));
    if (n >= 4) sfx.crumble(Math.min(1.6, 0.7 + n * 0.08));
    else sfx.thud(0.9);
    if (this.container && res.combo >= 2 && !this.reducedMotion) {
      comboPopup(this.container, res.combo >= 4 ? `KOMBO x${res.combo}! 💥` : `x${res.combo}`, {
        size: 24 + Math.min(22, res.combo * 3),
        color: res.combo >= 4 ? '#fbbf24' : '#fff',
      });
    }

    this.emitScore();
    if (res.won) this.celebrate();
  }

  private burstDebris(at: THREE.Vector3, kind: string): void {
    const palette: Record<string, number[]> = {
      glass: [0x5b6f95, 0x3b4a63, 0x9db4d6],
      concrete: [0xa8b0ba, 0x8d949e, 0xc4c9d1],
      pillar: [0x7e8894, 0x6b7280, 0x9aa3ad],
      roof: [0x8d949e, 0xa8b0ba, 0x6b7280],
    };
    const colors = palette[kind] ?? palette.concrete;
    const count = this.reducedMotion ? 2 : 5;
    for (let i = 0; i < count; i += 1) {
      if (this.debris.length >= 130) {
        const old = this.debris.shift();
        if (old) this.scene.remove(old.mesh);
      }
      const mesh = new THREE.Mesh(
        this.debrisGeo,
        this.own(new THREE.MeshStandardMaterial({
          color: colors[(Math.random() * colors.length) | 0], roughness: 0.9,
        })),
      );
      mesh.castShadow = true;
      mesh.position.copy(at).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7,
      ));
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.scene.add(mesh);
      const life = 1.6 + Math.random() * 0.9;
      this.debris.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 3.4, (Math.random() - 0.5) * 5),
        angVel: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9),
        life,
        maxLife: life,
      });
    }
  }

  private addRubble(x: number): void {
    const mesh = new THREE.Mesh(
      this.rubbleGeo,
      this.own(new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.95 })),
    );
    const bx = (x - (this.state.w - 1) / 2) * STEP;
    mesh.position.set(
      bx + (Math.random() - 0.5) * 1.6,
      0.1 + Math.random() * 0.12,
      (Math.random() - 0.5) * 2.2,
    );
    mesh.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.6);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.rubble.push(mesh);
  }

  private wobbleNeighbors(x: number, y: number): void {
    if (this.reducedMotion) return;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    dirs.forEach(([dx, dy]) => {
      const m = this.blockMeshes[x + dx]?.[y + dy];
      if (m && !this.wobbles.some((w) => w.mesh === m)) {
        this.wobbles.push({ mesh: m, t: 0, amp: 0.06 });
      }
    });
  }

  private celebrate(): void {
    sfx.chime(4, 523);
    if (this.container && !this.reducedMotion) {
      comboPopup(this.container, 'RATA DENGAN TANAH! 🏆', { size: 34, color: '#fbbf24' });
    }
    // celebratory dust fountains
    for (let i = 0; i < 5; i += 1) {
      window.setTimeout(() => {
        if (this.disposed) return;
        this.dust.spawn(
          new THREE.Vector3((Math.random() - 0.5) * 6, 1 + Math.random() * 3, (Math.random() - 0.5) * 3),
          { count: 40, color: [0xfbbf24, 0xf59e0b, 0xfde68a, 0xffffff], speed: 4, up: 6, life: 1.4 },
        );
      }, i * 160);
    }
    this.cb.onWin();
  }

  /** New building, new seed. */
  rebuild(): void {
    if (this.disposed) return;
    this.seedCounter += 1;
    this.state = createBuilding(this.seedCounter * 7919 + 13);
    this.spawnBuilding(false);
    sfx.click();
    this.emitScore();
  }

  getSnapshot(): { score: number; percent: number; combo: number; remaining: number; taps: number } {
    return {
      score: this.state.score,
      percent: percentDestroyed(this.state),
      combo: this.state.combo,
      remaining: remainingBlocks(this.state),
      taps: this.state.taps,
    };
  }

  private emitScore(): void {
    this.cb.onScore(this.state.score, percentDestroyed(this.state), this.state.combo, remainingBlocks(this.state));
  }

  /* ---------------- per-frame ---------------- */

  protected tick(dt: number): void {
    this.sky.update(dt);
    this.dust.update(dt);

    // build-in animation (staggered scale-up)
    if (this.buildAnim.length > 0) {
      this.buildAnim = this.buildAnim.filter((b) => {
        if (b.delay > 0) {
          b.delay -= dt;
          return true;
        }
        b.t += dt * 3.2;
        const k = Math.min(1, b.t);
        const ease = 1 - Math.pow(1 - k, 3);
        // overshoot pop
        const s = ease < 0.85 ? ease / 0.85 : 1 + Math.sin((ease - 0.85) * Math.PI) * 0.08;
        b.mesh.scale.setScalar(Math.max(0.01, s));
        return k < 1;
      });
    }

    // debris physics: gravity + ground bounce + shrink-out
    if (this.debris.length > 0) {
      const g = 12;
      this.debris = this.debris.filter((d) => {
        d.life -= dt;
        if (d.life <= 0) {
          this.scene.remove(d.mesh);
          (d.mesh.material as THREE.Material).dispose();
          return false;
        }
        d.vel.y -= g * dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        if (d.mesh.position.y < 0.11 && d.vel.y < 0) {
          d.mesh.position.y = 0.11;
          d.vel.y *= -0.42;
          d.vel.x *= 0.7;
          d.vel.z *= 0.7;
          d.angVel.multiplyScalar(0.6);
        }
        d.mesh.rotation.x += d.angVel.x * dt;
        d.mesh.rotation.y += d.angVel.y * dt;
        d.mesh.rotation.z += d.angVel.z * dt;
        const k = d.life / d.maxLife;
        if (k < 0.35) d.mesh.scale.setScalar(Math.max(0.01, k / 0.35));
        return true;
      });
    }

    // wobble decay
    if (this.wobbles.length > 0) {
      this.wobbles = this.wobbles.filter((w) => {
        w.t += dt * 7;
        if (w.t > Math.PI * 2) {
          w.mesh.rotation.z = 0;
          return false;
        }
        w.mesh.rotation.z = Math.sin(w.t) * w.amp * (1 - w.t / (Math.PI * 2));
        return true;
      });
    }
  }

  dispose(): void {
    if ((this as unknown as { disposed: boolean }).disposed) return;
    this.sky.dispose();
    this.dust.dispose();
    this.debris.forEach((d) => {
      this.scene.remove(d.mesh);
      (d.mesh.material as THREE.Material).dispose();
    });
    this.debris = [];
    super.dispose();
  }
}
