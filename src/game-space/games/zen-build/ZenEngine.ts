/**
 * EZRAB Game Space v2 — Zen Build engine (src/game-space/games/zen-build/ZenEngine.ts)
 *
 * "Mode Bebas": a calm sunset building sandbox. Warm low sun with long soft
 * shadows, textured pieces (concrete / wood / brick / glass / terracotta
 * roof), drifting firefly motes, dust puffs on placement. No timer, no score
 * — the engine mirrors the rule-free zen logic.
 */

import * as THREE from 'three';
import { BaseEngine } from '../../fx/BaseEngine';
import { DustBurst, AmbientMotes } from '../../fx/particles';
import { SkyDome } from '../../fx/juice';
import {
  concreteTexture, woodTexture, brickTexture, glassFacadeTexture, soilTexture,
} from '../../fx/textures';
import { sfx } from '../../fx/audio';
import {
  ZEN_GRID, createZenState, zenPlace, zenUndo, zenClear,
  type ZenPiece, type ZenState,
} from './logic';

export interface ZenCallbacks {
  onCount: (count: number) => void;
  onAutoPause: () => void;
}

const PIECE_HEIGHT: Record<ZenPiece, number> = {
  beton: 0.42,
  kayu: 0.24,
  bata: 0.5,
  kaca: 0.72,
  atap: 0.6,
};

const GHOST_COLOR = 0xffe9c4;

interface DropTween {
  mesh: THREE.Mesh;
  fromY: number;
  toY: number;
  t: number;
  dur: number;
}

export class ZenEngine extends BaseEngine {
  static get activeCount(): number {
    return BaseEngine.countFor('zen');
  }

  private state: ZenState = createZenState();
  private cb: ZenCallbacks;
  private heights: number[][] = [];
  private meshes: THREE.Mesh[] = [];
  private meshMeta: Array<{ mesh: THREE.Mesh; x: number; z: number }> = [];
  private tweens: DropTween[] = [];
  private geoCache = new Map<ZenPiece, THREE.BufferGeometry>();
  private matCache = new Map<ZenPiece, THREE.Material>();
  private ghost: THREE.Mesh | null = null;
  private ghostType: ZenPiece | null = null;
  private hoverCell: { x: number; z: number } | null = null;
  private dust: DustBurst;
  private motes: AmbientMotes;
  private sky: SkyDome;
  private selected: ZenPiece = 'beton';

  constructor(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean; callbacks: ZenCallbacks }) {
    super(canvas, 'zen', {
      reducedMotion: opts.reducedMotion,
      camPos: new THREE.Vector3(9.2, 7.6, 11),
      lookAt: new THREE.Vector3(0, 1.1, 0),
      fog: [0xe8a878, 15, 40],
      sun: [0xffb066, 2.3],
      shadowBounds: 9,
    });
    this.cb = opts.callbacks;
    this.dust = new DustBurst();
    this.scene.add(this.dust.points);
    this.motes = new AmbientMotes({ count: 110, area: 18, height: 7, color: 0xffd9a0, size: 0.1 });
    this.scene.add(this.motes.points);
    // sunset sky — dusky violet top melting into soft peach horizon
    this.sky = new SkyDome('#3d4a7d', '#dd9463', '#f5c48f');
    this.scene.add(this.sky.mesh);
    // low warm sun handled via base lights; tilt done in buildScene extras
    this.resetHeights();
    this.emitCount();
  }

  protected buildScene(): void {
    // warm sandy ground (lighter so the sunset doesn't turn it muddy)
    const soilTex = this.own(soilTexture('#8a6b48', 201));
    soilTex.repeat.set(9, 9);
    const ground = new THREE.Mesh(
      this.own(new THREE.CircleGeometry(26, 48)),
      this.own(new THREE.MeshStandardMaterial({ map: soilTex, roughness: 1 })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.04;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // stone slab under the build area
    const slab = new THREE.Mesh(
      this.own(new THREE.BoxGeometry(ZEN_GRID + 0.9, 0.14, ZEN_GRID + 0.9)),
      this.own(new THREE.MeshStandardMaterial({ map: this.own(concreteTexture('#8f8a80', 202)), roughness: 0.95 })),
    );
    slab.position.y = -0.09;
    slab.receiveShadow = true;
    this.scene.add(slab);

    // build tiles: warm checker
    const tileGeo = this.own(new THREE.BoxGeometry(0.94, 0.06, 0.94));
    const tileA = this.own(new THREE.MeshStandardMaterial({ color: 0xd9c4a3, roughness: 0.9 }));
    const tileB = this.own(new THREE.MeshStandardMaterial({ color: 0xc9b18c, roughness: 0.9 }));
    for (let x = 0; x < ZEN_GRID; x += 1) {
      for (let z = 0; z < ZEN_GRID; z += 1) {
        const tile = new THREE.Mesh(tileGeo, (x + z) % 2 === 0 ? tileA : tileB);
        tile.position.set(x - ZEN_GRID / 2 + 0.5, -0.03, z - ZEN_GRID / 2 + 0.5);
        tile.receiveShadow = true;
        this.scene.add(tile);
      }
    }

    // silhouette trees with warm rim light feel
    const trunkGeo = this.own(new THREE.CylinderGeometry(0.1, 0.14, 0.6, 6));
    const trunkMat = this.own(new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 }));
    const leafGeo = this.own(new THREE.ConeGeometry(0.7, 1.5, 8));
    const leafMat = this.own(new THREE.MeshStandardMaterial({ color: 0x7d8f5a, roughness: 1 }));
    const spots: Array<[number, number, number]> = [
      [-7.2, -4.5, 1.1], [7.4, -3.6, 0.9], [-6.8, 5.6, 1.25], [7, 6, 1], [1.5, -7.6, 0.8], [-2.5, 7.8, 1.15],
    ];
    spots.forEach(([tx, tz, s]) => {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(tx, 0.28 * s, tz);
      trunk.scale.setScalar(s);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(tx, (0.6 + 0.75) * s, tz);
      leaf.scale.setScalar(s);
      leaf.castShadow = true;
      this.scene.add(trunk, leaf);
    });

    // a few warm rocks
    const rockGeo = this.own(new THREE.DodecahedronGeometry(0.32, 0));
    const rockMat = this.own(new THREE.MeshStandardMaterial({ color: 0x9a8f7d, roughness: 1 }));
    [[-5.4, -6.2], [5.8, -5.8], [-8, 1.5]].forEach(([rx, rz]) => {
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(rx, 0.14, rz);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      rock.castShadow = true;
      this.scene.add(rock);
    });
  }

  /* ---------------- pieces ---------------- */

  private geometryFor(type: ZenPiece): THREE.BufferGeometry {
    const cached = this.geoCache.get(type);
    if (cached) return cached;
    let geo: THREE.BufferGeometry;
    switch (type) {
      case 'beton':
        geo = new THREE.BoxGeometry(0.9, PIECE_HEIGHT.beton, 0.9);
        break;
      case 'kayu':
        geo = new THREE.BoxGeometry(1.3, PIECE_HEIGHT.kayu, 0.36);
        break;
      case 'bata':
        geo = new THREE.BoxGeometry(0.9, PIECE_HEIGHT.bata, 0.44);
        break;
      case 'kaca':
        geo = new THREE.BoxGeometry(0.9, PIECE_HEIGHT.kaca, 0.14);
        break;
      case 'atap': {
        const w = 1.0;
        const h = PIECE_HEIGHT.atap;
        const shape = new THREE.Shape();
        shape.moveTo(-w / 2, 0);
        shape.lineTo(w / 2, 0);
        shape.lineTo(0, h);
        shape.closePath();
        const ex = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
        ex.translate(0, 0, -w / 2);
        geo = ex;
        break;
      }
    }
    this.own(geo);
    this.geoCache.set(type, geo);
    return geo;
  }

  private materialFor(type: ZenPiece): THREE.Material {
    const cached = this.matCache.get(type);
    if (cached) return cached;
    let mat: THREE.Material;
    switch (type) {
      case 'beton':
        mat = new THREE.MeshStandardMaterial({ map: this.own(concreteTexture('#b0a89c', 210)), roughness: 0.9 });
        break;
      case 'kayu':
        mat = new THREE.MeshStandardMaterial({ map: this.own(woodTexture('#b08255', 211)), roughness: 0.72 });
        break;
      case 'bata':
        mat = new THREE.MeshStandardMaterial({ map: this.own(brickTexture('#b4563f', 212)), roughness: 0.88 });
        break;
      case 'kaca':
        mat = new THREE.MeshStandardMaterial({
          map: this.own(glassFacadeTexture({ base: '#4a5f7d', litRatio: 0.45, seed: 213 })),
          roughness: 0.25, metalness: 0.4,
        });
        break;
      case 'atap':
        mat = new THREE.MeshStandardMaterial({ color: 0xc05b2e, roughness: 0.8, metalness: 0.05 });
        break;
    }
    this.own(mat);
    this.matCache.set(type, mat);
    return mat;
  }

  /* ---------------- public API ---------------- */

  setSelected(type: ZenPiece): void {
    this.selected = type;
    this.ghostType = null; // force ghost rebuild
  }

  place(type: ZenPiece, x: number, z: number): void {
    if (this.disposed || this.paused) return;
    if (!zenPlace(this.state, type, x, z)) return;
    sfx.ensure();
    const h = PIECE_HEIGHT[type];
    const base = this.heights[x][z];
    const mesh = new THREE.Mesh(this.geometryFor(type), this.materialFor(type));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const cx = x - ZEN_GRID / 2 + 0.5;
    const cz = z - ZEN_GRID / 2 + 0.5;
    const targetY = base + h / 2;
    mesh.position.set(cx, targetY, cz);
    // kayu beams alternate orientation for a nicer look
    if (type === 'kayu' && this.state.stacks[x][z].length % 2 === 0) mesh.rotation.y = Math.PI / 2;
    this.scene.add(mesh);
    this.meshes.push(mesh);
    this.meshMeta.push({ mesh, x, z });
    this.heights[x][z] = base + h;
    if (!this.reducedMotion) {
      mesh.position.y = targetY + 2.2;
      this.tweens.push({ mesh, fromY: targetY + 2.2, toY: targetY, t: 0, dur: 0.34 });
    }
    this.dust.spawn(new THREE.Vector3(cx, base + 0.1, cz), {
      count: 8, color: [0xe8d9bd, 0xd9c4a3], speed: 1.4, up: 1.2, life: 0.7, size: 0.14,
    });
    sfx.thud(0.35);
    this.emitCount();
  }

  undo(): void {
    if (this.disposed || this.paused) return;
    const last = zenUndo(this.state);
    if (!last) return;
    sfx.ensure();
    // find the topmost mesh of that cell
    for (let i = this.meshMeta.length - 1; i >= 0; i -= 1) {
      const m = this.meshMeta[i];
      if (m.x === last.x && m.z === last.z) {
        this.scene.remove(m.mesh);
        this.meshMeta.splice(i, 1);
        const idx = this.meshes.indexOf(m.mesh);
        if (idx >= 0) this.meshes.splice(idx, 1);
        break;
      }
    }
    this.heights[last.x][last.z] = Math.max(0, this.heights[last.x][last.z] - PIECE_HEIGHT[last.type]);
    sfx.click();
    this.emitCount();
  }

  clearAll(): void {
    if (this.disposed) return;
    zenClear(this.state);
    this.meshes.forEach((m) => this.scene.remove(m));
    this.meshes = [];
    this.meshMeta = [];
    this.tweens = [];
    this.resetHeights();
    sfx.ensure();
    sfx.whoosh();
    this.emitCount();
  }

  getCount(): number {
    return this.state.count;
  }

  private emitCount(): void {
    this.cb.onCount(this.state.count);
  }

  /* ---------------- input ---------------- */

  protected onTap(clientX: number, clientY: number): void {
    const p = this.pickGround(clientX, clientY);
    if (!p) return;
    const x = Math.floor(p.x + ZEN_GRID / 2);
    const z = Math.floor(p.z + ZEN_GRID / 2);
    if (x < 0 || x >= ZEN_GRID || z < 0 || z >= ZEN_GRID) return;
    this.place(this.selected, x, z);
    this.refreshGhost();
  }

  protected onHoverMove(clientX: number, clientY: number): void {
    const p = this.pickGround(clientX, clientY);
    if (!p) {
      this.hoverCell = null;
      this.refreshGhost();
      return;
    }
    const x = Math.floor(p.x + ZEN_GRID / 2);
    const z = Math.floor(p.z + ZEN_GRID / 2);
    if (x < 0 || x >= ZEN_GRID || z < 0 || z >= ZEN_GRID) {
      this.hoverCell = null;
      this.refreshGhost();
      return;
    }
    if (!this.hoverCell || this.hoverCell.x !== x || this.hoverCell.z !== z) {
      this.hoverCell = { x, z };
      this.refreshGhost();
    }
  }

  protected onHidden(): void {
    this.cb.onAutoPause();
  }

  private refreshGhost(): void {
    if (this.disposed || this.paused) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    const cell = this.hoverCell;
    if (!cell) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    if (!this.ghost || this.ghostType !== this.selected) {
      if (this.ghost) this.scene.remove(this.ghost);
      const mat = this.own(new THREE.MeshBasicMaterial({
        color: GHOST_COLOR, transparent: true, opacity: 0.45, depthWrite: false,
      }));
      this.ghost = new THREE.Mesh(this.geometryFor(this.selected), mat);
      this.scene.add(this.ghost);
      this.ghostType = this.selected;
    }
    const h = PIECE_HEIGHT[this.selected];
    this.ghost.position.set(
      cell.x - ZEN_GRID / 2 + 0.5,
      this.heights[cell.x][cell.z] + h / 2,
      cell.z - ZEN_GRID / 2 + 0.5,
    );
    this.ghost.visible = true;
  }

  /* ---------------- per-frame ---------------- */

  protected tick(dt: number): void {
    this.sky.update(dt);
    this.dust.update(dt);
    this.motes.update(dt);

    if (this.tweens.length > 0) {
      this.tweens = this.tweens.filter((tw) => {
        tw.t += dt;
        const k = Math.min(1, tw.t / tw.dur);
        const ease = 1 - Math.pow(1 - k, 3);
        tw.mesh.position.y = tw.fromY + (tw.toY - tw.fromY) * ease;
        if (k >= 1) {
          tw.mesh.position.y = tw.toY;
          // squash on landing
          if (!this.reducedMotion) {
            tw.mesh.scale.set(1.12, 0.82, 1.12);
            window.setTimeout(() => tw.mesh.scale.set(1, 1, 1), 110);
          }
          return false;
        }
        return true;
      });
    }
  }

  private resetHeights(): void {
    this.heights = Array.from({ length: ZEN_GRID }, () => Array.from({ length: ZEN_GRID }, () => 0));
  }

  dispose(): void {
    if ((this as unknown as { disposed: boolean }).disposed) return;
    this.sky.dispose();
    this.dust.dispose();
    this.motes.dispose();
    this.geoCache.clear();
    this.matCache.clear();
    super.dispose();
  }
}
