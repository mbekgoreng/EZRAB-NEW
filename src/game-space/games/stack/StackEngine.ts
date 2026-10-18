/**
 * EZRAB Game Space v2 — Stack engine (src/game-space/games/stack/StackEngine.ts)
 *
 * Classic tower stacker with "real game" presentation: textured gradient
 * blocks, sliced overhangs tumbling as debris, perfect-drop glow + slow-mo,
 * camera rising with the tower, and a sky that flows day → sunset → starry
 * night as you climb. Dumb renderer mirror of logic.ts.
 */

import * as THREE from 'three';
import { BaseEngine } from '../../fx/BaseEngine';
import { SkyDome, comboPopup } from '../../fx/juice';
import { concreteTexture, softDotTexture } from '../../fx/textures';
import { sfx } from '../../fx/audio';
import {
  BLOCK_H, createStack, dropBlock, stepMover, towerHeight,
  type StackState, type Axis,
} from './logic';

export interface StackCallbacks {
  onScore: (score: number, combo: number) => void;
  onGameOver: (score: number, best: number) => void;
  onAutoPause: () => void;
}

const BEST_KEY = 'gs-stack-best';

interface FallPiece {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  life: number;
}

type SkyPhase = 'day' | 'sunset' | 'night';

const SKY_PHASES: Record<SkyPhase, { top: string; mid: string; bot: string; stars: number }> = {
  day: { top: '#5b9fe6', mid: '#bcd9f5', bot: '#e9f2fb', stars: 0 },
  sunset: { top: '#4a5586', mid: '#dd9463', bot: '#f5c48f', stars: 0 },
  night: { top: '#070d24', mid: '#1c2a52', bot: '#3a4a7a', stars: 0.9 },
};

export class StackEngine extends BaseEngine {
  static get activeCount(): number {
    return BaseEngine.countFor('stack');
  }

  private state: StackState = createStack();
  private cb: StackCallbacks;
  private blockMeshes: THREE.Mesh[] = [];
  private moverMesh: THREE.Mesh | null = null;
  private fallPieces: FallPiece[] = [];
  private sky: SkyDome;
  private skyPhase: SkyPhase = 'day';
  private blockTex: THREE.Texture;
  private flash = new THREE.PointLight(0xfff2c4, 0, 14);
  private flashPos = new THREE.Vector3();
  private container: HTMLElement | null = null;
  private camTargetY = 5.2;
  private lookTargetY = 1.2;
  private best = 0;
  private gameOverFired = false;

  constructor(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean; callbacks: StackCallbacks }) {
    super(canvas, 'stack', {
      reducedMotion: opts.reducedMotion,
      camPos: new THREE.Vector3(8.2, 5.2, 10.8),
      lookAt: new THREE.Vector3(0, 1.2, 0),
      fog: [0xcfe0f2, 30, 70],
      sun: [0xfff1d6, 1.9],
      shadowBounds: 8,
    });
    this.cb = opts.callbacks;
    this.container = canvas.parentElement;
    try {
      this.best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
    } catch {
      this.best = 0;
    }
    this.sky = new SkyDome('#5b9fe6', '#bcd9f5', '#e9f2fb');
    this.scene.add(this.sky.mesh);
    this.blockTex = this.own(concreteTexture('#c8ccd2', 301));
    this.scene.add(this.flash);
    this.buildBase();
    this.spawnMover();
  }

  /* ---------------- scene ---------------- */

  protected buildScene(): void {
    // (re)initialize here: buildScene runs during super(), before field initializers
    this.clouds = [];
    // soft studio ground far below
    const ground = new THREE.Mesh(
      this.own(new THREE.CircleGeometry(30, 48)),
      this.own(new THREE.MeshStandardMaterial({ color: 0xdfe8f2, roughness: 1 })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.55;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // pedestal disc under the tower
    const ped = new THREE.Mesh(
      this.own(new THREE.CylinderGeometry(3.1, 3.35, 0.5, 40)),
      this.own(new THREE.MeshStandardMaterial({ map: this.own(concreteTexture('#aeb6c2', 302)), roughness: 0.9 })),
    );
    ped.position.y = -0.28;
    ped.receiveShadow = true;
    ped.castShadow = true;
    this.scene.add(ped);

    // drifting clouds (soft sprites) for depth
    const cloudTex = this.own(softDotTexture(303));
    for (let i = 0; i < 6; i += 1) {
      const mat = this.own(new THREE.SpriteMaterial({
        map: cloudTex, color: 0xffffff, transparent: true, opacity: 0.15, depthWrite: false,
      }));
      const sp = new THREE.Sprite(mat);
      const s = 4 + Math.random() * 5;
      sp.scale.set(s, s * 0.4, 1);
      // keep to the sides / high so the sunset gradient stays visible
      const side = i % 2 === 0 ? -1 : 1;
      sp.position.set(side * (10 + Math.random() * 12), 7 + Math.random() * 16, -13 - Math.random() * 8);
      sp.userData.speed = 0.12 + Math.random() * 0.2;
      this.scene.add(sp);
      this.clouds.push(sp);
    }
  }

  // assigned in buildScene() (runs during super()); `declare` emits no field
  // definition, so the assignment survives (a bare `!:` field would be
  // re-defined as undefined after super() returns).
  private declare clouds: THREE.Sprite[];

  /** Block color: hue drifts with height (blue → violet → magenta → amber). */
  private colorForHeight(levelIdx: number): THREE.Color {
    const hue = (0.58 + levelIdx * 0.045) % 1;
    return new THREE.Color().setHSL(hue, 0.62, 0.58);
  }

  private makeBlock(sx: number, sz: number, levelIdx: number): THREE.Mesh {
    const geo = this.own(new THREE.BoxGeometry(Math.max(0.05, sx), BLOCK_H * 0.94, Math.max(0.05, sz)));
    const mat = this.own(new THREE.MeshStandardMaterial({
      map: this.blockTex,
      color: this.colorForHeight(levelIdx),
      roughness: 0.55,
      metalness: 0.06,
    }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildBase(): void {
    const base = this.state.levels[0];
    const mesh = this.makeBlock(base.sx, base.sz, 0);
    mesh.position.set(base.cx, BLOCK_H / 2, base.cz);
    this.scene.add(mesh);
    this.blockMeshes.push(mesh);
  }

  private spawnMover(): void {
    const m = this.state.mover;
    if (this.moverMesh) {
      this.scene.remove(this.moverMesh);
      (this.moverMesh.geometry as THREE.BufferGeometry).dispose();
      (this.moverMesh.material as THREE.Material).dispose();
      this.moverMesh = null;
    }
    const prev = this.state.levels[this.state.levels.length - 1];
    const levelIdx = this.state.levels.length;
    const sx = m.axis === 'x' ? m.size : m.fixed;
    const sz = m.axis === 'x' ? m.fixed : m.size;
    const mesh = this.makeBlock(sx, sz, levelIdx);
    // mover glows slightly so the eye tracks it
    (mesh.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x222222);
    mesh.position.set(
      m.axis === 'x' ? m.pos : prev.cx,
      m.y + BLOCK_H / 2,
      m.axis === 'x' ? prev.cz : m.pos,
    );
    this.scene.add(mesh);
    this.moverMesh = mesh;
  }

  /* ---------------- gameplay ---------------- */

  protected onTap(): void {
    this.drop();
  }

  protected onHidden(): void {
    this.cb.onAutoPause();
  }

  /**
   * Test hook: teleport the mover to a position then drop (deterministic
   * perfects in automated tests). Not used by gameplay.
   */
  debugDropAt(pos: number): void {
    if (this.disposed || this.paused || this.state.gameOver) return;
    this.state.mover.pos = pos;
    this.drop();
  }

  /** Drop the sliding block (tap anywhere). */
  drop(): void {
    if (this.disposed || this.paused || this.state.gameOver) return;
    sfx.ensure();
    const res = dropBlock(this.state);
    const mMesh = this.moverMesh;
    this.moverMesh = null;

    if (res.kind === 'miss') {
      // the block sails past and tumbles into the void
      if (mMesh) this.launchFallPiece(mMesh, new THREE.Vector3(mMesh.position.x > 0 ? 2.5 : -2.5, 1.5, 0));
      sfx.fail();
      this.addShake(0.35);
      this.finishGameOver();
      return;
    }

    const placed = res.placed!;
    const levelIdx = this.state.levels.length - 1;
    // settle the mover exactly onto the placed spot
    if (mMesh) {
      // rebuild geometry to the sliced footprint for crisp edges
      this.scene.remove(mMesh);
      (mMesh.geometry as THREE.BufferGeometry).dispose();
      (mMesh.material as THREE.Material).dispose();
      const mesh = this.makeBlock(placed.sx, placed.sz, levelIdx);
      mesh.position.set(placed.cx, placed.y + BLOCK_H / 2, placed.cz);
      this.scene.add(mesh);
      this.blockMeshes.push(mesh);
      // squash on landing
      if (!this.reducedMotion) {
        mesh.scale.set(1.06, 0.86, 1.06);
        window.setTimeout(() => mesh.scale.set(1, 1, 1), 120);
      }
    }

    if (res.overhang && res.overhang.size > 0.02 && mMesh) {
      const axis = placed.axis;
      const osx = axis === 'x' ? res.overhang.size : placed.sx;
      const osz = axis === 'x' ? placed.sz : res.overhang.size;
      const debris = this.makeBlock(osx, osz, levelIdx);
      debris.position.set(
        axis === 'x' ? res.overhang.center : placed.cx,
        placed.y + BLOCK_H / 2,
        axis === 'x' ? placed.cz : res.overhang.center,
      );
      this.scene.add(debris);
      const pCenter = axis === 'x' ? placed.cx : placed.cz;
      const outward = axis === 'x'
        ? new THREE.Vector3(Math.sign(res.overhang.center - pCenter) * 2.2, 1.2, 0)
        : new THREE.Vector3(0, 1.2, Math.sign(res.overhang.center - pCenter) * 2.2);
      this.launchFallPiece(debris, outward);
      sfx.thud(0.7);
    } else {
      sfx.thud(0.5);
    }

    if (res.kind === 'perfect') {
      // glow flash + slow-mo + chime + popup
      this.flashPos.set(placed.cx, placed.y + 1.2, placed.cz);
      this.flash.position.copy(this.flashPos);
      this.flash.intensity = 60;
      if (!this.reducedMotion) this.slowmo.dip(0.3, 200);
      sfx.pop(1 + Math.min(0.6, res.combo * 0.06));
      if (res.combo >= 2) sfx.chime(2, 740);
      if (this.container && !this.reducedMotion) {
        comboPopup(this.container, res.combo >= 3 ? `PERFECT x${res.combo}! ✨` : 'PERFECT! ✨', {
          size: 24 + Math.min(20, res.combo * 3),
          color: '#fde68a',
        });
      }
    }

    this.cb.onScore(res.score, res.combo);
    this.spawnMover();
    this.updateSkyPhase();
  }

  private launchFallPiece(mesh: THREE.Mesh, vel: THREE.Vector3): void {
    this.fallPieces.push({
      mesh,
      vel: vel.clone(),
      angVel: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
      life: 2.2,
    });
    if (this.fallPieces.length > 24) {
      const old = this.fallPieces.shift();
      if (old) {
        this.scene.remove(old.mesh);
        (old.mesh.geometry as THREE.BufferGeometry).dispose();
        (old.mesh.material as THREE.Material).dispose();
      }
    }
  }

  private updateSkyPhase(): void {
    const h = towerHeight(this.state);
    const want: SkyPhase = h >= 16 ? 'night' : h >= 8 ? 'sunset' : 'day';
    if (want !== this.skyPhase) {
      this.skyPhase = want;
      const p = SKY_PHASES[want];
      this.sky.transitionTo(p.top, p.mid, p.bot, p.stars);
      // match fog to the new mood
      const fogColor = new THREE.Color(p.mid);
      if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(fogColor);
      sfx.chime(2, want === 'night' ? 880 : 660);
    }
  }

  private finishGameOver(): void {
    if (this.gameOverFired) return;
    this.gameOverFired = true;
    const score = this.state.score;
    if (score > this.best) {
      this.best = score;
      try {
        localStorage.setItem(BEST_KEY, String(score));
      } catch {
        /* ignore */
      }
    }
    window.setTimeout(() => {
      if (!this.disposed) this.cb.onGameOver(score, this.best);
    }, 900);
  }

  /** Restart the run. */
  reset(): void {
    if (this.disposed) return;
    this.state = createStack();
    this.gameOverFired = false;
    this.blockMeshes.forEach((m) => {
      this.scene.remove(m);
      (m.geometry as THREE.BufferGeometry).dispose();
      (m.material as THREE.Material).dispose();
    });
    this.blockMeshes = [];
    this.fallPieces.forEach((f) => {
      this.scene.remove(f.mesh);
      (f.mesh.geometry as THREE.BufferGeometry).dispose();
      (f.mesh.material as THREE.Material).dispose();
    });
    this.fallPieces = [];
    if (this.moverMesh) {
      this.scene.remove(this.moverMesh);
      this.moverMesh = null;
    }
    this.skyPhase = 'day';
    const p = SKY_PHASES.day;
    this.sky.transitionTo(p.top, p.mid, p.bot, p.stars);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.set(p.mid);
    this.buildBase();
    this.spawnMover();
    sfx.click();
    this.cb.onScore(0, 0);
  }

  getBest(): number {
    return this.best;
  }

  getSnapshot(): { score: number; combo: number; height: number; gameOver: boolean } {
    return {
      score: this.state.score,
      combo: this.state.combo,
      height: towerHeight(this.state),
      gameOver: this.state.gameOver,
    };
  }

  /* ---------------- per-frame ---------------- */

  protected tick(dt: number): void {
    this.sky.update(dt);

    // slide the mover
    if (!this.state.gameOver && this.moverMesh) {
      stepMover(this.state, dt);
      const m = this.state.mover;
      if (m.axis === 'x') this.moverMesh.position.x = m.pos;
      else this.moverMesh.position.z = m.pos;
    }

    // camera follows the tower (eased)
    const topY = this.state.levels.length * BLOCK_H;
    this.camTargetY = 5.2 + Math.max(0, topY - 2.4) * 0.94;
    this.lookTargetY = 1.2 + Math.max(0, topY - 2.4) * 0.94;
    this.lerpRig(
      new THREE.Vector3(8.2, this.camTargetY, 10.8),
      new THREE.Vector3(0, this.lookTargetY, 0),
      1 - Math.pow(0.02, dt),
    );

    // flash decay
    if (this.flash.intensity > 0) {
      this.flash.intensity = Math.max(0, this.flash.intensity - dt * 260);
    }

    // falling debris
    if (this.fallPieces.length > 0) {
      this.fallPieces = this.fallPieces.filter((f) => {
        f.life -= dt;
        if (f.life <= 0) {
          this.scene.remove(f.mesh);
          (f.mesh.geometry as THREE.BufferGeometry).dispose();
          (f.mesh.material as THREE.Material).dispose();
          return false;
        }
        f.vel.y -= 11 * dt;
        f.mesh.position.addScaledVector(f.vel, dt);
        f.mesh.rotation.x += f.angVel.x * dt;
        f.mesh.rotation.y += f.angVel.y * dt;
        f.mesh.rotation.z += f.angVel.z * dt;
        if (f.life < 0.5) {
          const s = Math.max(0.01, f.life / 0.5);
          f.mesh.scale.setScalar(s);
        }
        return true;
      });
    }

    // clouds drift
    this.clouds.forEach((c) => {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 30) c.position.x = -30;
    });
  }

  dispose(): void {
    if ((this as unknown as { disposed: boolean }).disposed) return;
    this.sky.dispose();
    super.dispose();
  }
}
