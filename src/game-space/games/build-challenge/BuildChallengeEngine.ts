/**
 * EZRAB Build Challenge — Three.js engine (src/game-space/games/build-challenge/BuildChallengeEngine.ts)
 *
 * Dumb renderer mirror of the pure game logic. Owns exactly one renderer,
 * one scene, one animation loop and its own listeners. dispose() tears all
 * of them down — no double loops, no leaked listeners, no orphaned GPU
 * resources when the panel is reopened.
 */

import * as THREE from 'three';
import type { CompType } from './logic';
import { GRID } from './logic';

export interface EngineCallbacks {
  onPick: (x: number, z: number) => void;
  onHover: (x: number, z: number | null) => void;
  onAutoPause: () => void;
}

interface Tween {
  mesh: THREE.Mesh;
  fromY: number;
  toY: number;
  t: number;
  dur: number;
}

const TYPE_HEIGHT: Record<CompType, number> = {
  pondasi: 0.4,
  kolom: 1.2,
  balok: 0.32,
  dinding: 1.0,
  atap: 0.62,
};

const VALID_COLOR = 0x22c55e;
const INVALID_COLOR = 0xef4444;

export class BuildChallengeEngine {
  /** Live engine instances — debug/testing aid to prove create/dispose balance. */
  static activeCount = 0;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private canvas: HTMLCanvasElement;
  private cb: EngineCallbacks;
  private reducedMotion: boolean;
  private raf = 0;
  private paused = false;
  private disposed = false;
  private tweens: Tween[] = [];
  private heights: number[][] = [];
  private disposables = new Set<THREE.BufferGeometry | THREE.Material>();
  private placedMeshes: THREE.Mesh[] = [];
  private ghost: THREE.Mesh | null = null;
  private ghostType: CompType | null = null;
  private hoverCell: { x: number; z: number } | null = null;
  private ro: ResizeObserver | null = null;
  private time = 0;

  private geoCache = new Map<CompType, THREE.BufferGeometry>();
  private matCache = new Map<CompType, THREE.Material>();

  constructor(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean; callbacks: EngineCallbacks }) {
    this.canvas = canvas;
    this.cb = opts.callbacks;
    this.reducedMotion = opts.reducedMotion;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const isMobile = Math.min(window.innerWidth, window.innerHeight) < 640;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    this.renderer.setClearColor(0xf2f7ff, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const aspect = 1;
    const halfH = 5.6;
    this.camera = new THREE.OrthographicCamera(
      -halfH * aspect, halfH * aspect, halfH, -halfH, 0.1, 100,
    );
    this.camera.position.set(9.5, 9.5, 9.5);
    this.camera.lookAt(0, 0.2, 0);

    this.buildScene();
    this.resetHeights();
    this.attachListeners();
    this.resize();
    BuildChallengeEngine.activeCount += 1;
    this.loop();
  }

  /* ---------------- scene ---------------- */

  private track<T extends THREE.BufferGeometry | THREE.Material>(r: T): T {
    this.disposables.add(r);
    return r;
  }

  private buildScene(): void {
    this.scene.add(new THREE.HemisphereLight(0xdbeafe, 0x94a3b8, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(7, 12, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    this.scene.add(sun);

    // Site slab under the grid
    const slab = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(GRID + 0.7, 0.12, GRID + 0.7)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.95 })),
    );
    slab.position.y = -0.08;
    slab.receiveShadow = true;
    this.scene.add(slab);

    // Tiles (clickable area visuals)
    const tileGeo = this.track(new THREE.BoxGeometry(0.94, 0.05, 0.94));
    const tileMatA = this.track(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.9 }));
    const tileMatB = this.track(new THREE.MeshStandardMaterial({ color: 0xe6eef8, roughness: 0.9 }));
    for (let x = 0; x < GRID; x += 1) {
      for (let z = 0; z < GRID; z += 1) {
        const tile = new THREE.Mesh(tileGeo, (x + z) % 2 === 0 ? tileMatA : tileMatB);
        tile.position.set(x - GRID / 2 + 0.5, -0.025, z - GRID / 2 + 0.5);
        tile.receiveShadow = true;
        this.scene.add(tile);
      }
    }

    // Distant ground disc for depth
    const ground = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(24, 48)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xe8eef6, roughness: 1 })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.16;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // A few decorative low-poly trees outside the site (static, cheap)
    const trunkGeo = this.track(new THREE.CylinderGeometry(0.09, 0.12, 0.5, 6));
    const trunkMat = this.track(new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 1 }));
    const leafGeo = this.track(new THREE.ConeGeometry(0.55, 1.1, 7));
    const leafMat = this.track(new THREE.MeshStandardMaterial({ color: 0x86a893, roughness: 1 }));
    const treeSpots: Array<[number, number]> = [[-6.5, -4], [6.8, -3.2], [-6.2, 5.2], [6.4, 5.6], [0.5, -7]];
    treeSpots.forEach(([tx, tz]) => {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(tx, 0.1, tz);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(tx, 0.9, tz);
      leaf.castShadow = true;
      this.scene.add(trunk, leaf);
    });
  }

  private geometryFor(type: CompType): THREE.BufferGeometry {
    const cached = this.geoCache.get(type);
    if (cached) return cached;
    let geo: THREE.BufferGeometry;
    switch (type) {
      case 'pondasi':
        geo = new THREE.BoxGeometry(0.9, TYPE_HEIGHT.pondasi, 0.9);
        break;
      case 'kolom':
        geo = new THREE.CylinderGeometry(0.16, 0.2, TYPE_HEIGHT.kolom, 14);
        break;
      case 'balok':
        geo = new THREE.BoxGeometry(0.9, TYPE_HEIGHT.balok, 0.9);
        break;
      case 'dinding':
        geo = new THREE.BoxGeometry(0.9, TYPE_HEIGHT.dinding, 0.26);
        break;
      case 'atap': {
        // Triangular prism (gable roof) via extruded triangle.
        const w = 0.98;
        const h = TYPE_HEIGHT.atap;
        const shape = new THREE.Shape();
        shape.moveTo(-w / 2, 0);
        shape.lineTo(w / 2, 0);
        shape.lineTo(0, h);
        shape.closePath();
        const extruded = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
        extruded.translate(0, 0, -w / 2);
        geo = extruded;
        break;
      }
    }
    this.track(geo);
    this.geoCache.set(type, geo);
    return geo;
  }

  private materialFor(type: CompType): THREE.Material {
    const cached = this.matCache.get(type);
    if (cached) return cached;
    const colors: Record<CompType, number> = {
      pondasi: 0x94a3b8, // concrete slate
      kolom: 0x64748b, // structural slate
      balok: 0x1d4ed8, // EZRAB blue
      dinding: 0xf8fafc, // plaster white
      atap: 0xea580c, // terracotta accent
    };
    const mat = new THREE.MeshStandardMaterial({ color: colors[type], roughness: 0.75, metalness: 0.08 });
    this.track(mat);
    this.matCache.set(type, mat);
    return mat;
  }

  /* ---------------- public API ---------------- */

  /** Place a component mesh with a drop-in animation (instant when reduced motion). */
  place(type: CompType, x: number, z: number): void {
    if (this.disposed) return;
    const h = TYPE_HEIGHT[type];
    const base = this.heights[x][z];
    const mesh = new THREE.Mesh(this.geometryFor(type), this.materialFor(type));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const cx = x - GRID / 2 + 0.5;
    const cz = z - GRID / 2 + 0.5;
    const targetY = base + h / 2;
    mesh.position.set(cx, targetY, cz);
    this.scene.add(mesh);
    this.placedMeshes.push(mesh);
    this.heights[x][z] = base + h;
    if (!this.reducedMotion) {
      mesh.position.y = targetY + 2.6;
      this.tweens.push({ mesh, fromY: targetY + 2.6, toY: targetY, t: 0, dur: 0.38 });
    }
  }

  /** Show/hide the placement ghost preview. */
  setGhost(type: CompType | null, valid: boolean | null, x?: number, z?: number): void {
    if (this.disposed) return;
    if (!type || valid === null || x === undefined || z === undefined) {
      if (this.ghost) this.ghost.visible = false;
      this.ghostType = null;
      return;
    }
    if (!this.ghost || this.ghostType !== type) {
      const ghostMat = this.track(
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false }),
      );
      if (this.ghost) {
        // Swap in place: the mesh stays in the scene, shared geometry is never disposed here.
        this.ghost.geometry = this.geometryFor(type);
        this.ghost.material = ghostMat;
      } else {
        this.ghost = new THREE.Mesh(this.geometryFor(type), ghostMat);
        this.scene.add(this.ghost);
      }
      this.ghostType = type;
    }
    const mat = this.ghost.material as THREE.MeshBasicMaterial;
    mat.color.setHex(valid ? VALID_COLOR : INVALID_COLOR);
    const h = TYPE_HEIGHT[type];
    this.ghost.position.set(x - GRID / 2 + 0.5, this.heights[x][z] + h / 2, z - GRID / 2 + 0.5);
    this.ghost.visible = true;
  }

  /** Clear all placed meshes (new level / restart). */
  clearBoard(): void {
    this.placedMeshes.forEach((m) => this.scene.remove(m));
    this.placedMeshes = [];
    this.tweens = [];
    this.resetHeights();
    if (this.ghost) this.ghost.visible = false;
  }

  setPaused(p: boolean): void {
    this.paused = p;
  }

  /** Resource stats for the implementation report. */
  stats(): { geometries: number; materials: number; meshes: number; tweens: number } {
    let g = 0;
    let m = 0;
    this.disposables.forEach((d) => {
      if ((d as THREE.BufferGeometry).isBufferGeometry) g += 1;
      else m += 1;
    });
    return { geometries: g, materials: m, meshes: this.placedMeshes.length, tweens: this.tweens.length };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    BuildChallengeEngine.activeCount = Math.max(0, BuildChallengeEngine.activeCount - 1);
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.tweens = [];
    this.disposables.forEach((d) => d.dispose());
    this.disposables.clear();
    this.geoCache.clear();
    this.matCache.clear();
    this.renderer.dispose();
  }

  /* ---------------- internals ---------------- */

  private resetHeights(): void {
    this.heights = Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => 0));
  }

  private cellFromEvent(e: PointerEvent): { x: number; z: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    const x = Math.floor(hit.x + GRID / 2);
    const z = Math.floor(hit.z + GRID / 2);
    if (x < 0 || x >= GRID || z < 0 || z >= GRID) return null;
    return { x, z };
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (this.disposed || this.paused || e.target !== this.canvas) {
      if (this.hoverCell) {
        this.hoverCell = null;
        this.cb.onHover(-1, null);
      }
      return;
    }
    const cell = this.cellFromEvent(e);
    if (!cell) {
      if (this.hoverCell) {
        this.hoverCell = null;
        this.cb.onHover(-1, null);
      }
      return;
    }
    if (!this.hoverCell || this.hoverCell.x !== cell.x || this.hoverCell.z !== cell.z) {
      this.hoverCell = cell;
      this.cb.onHover(cell.x, cell.z);
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.disposed || this.paused || e.target !== this.canvas) return;
    // Only primary button / touch.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const cell = this.cellFromEvent(e);
    if (cell) this.cb.onPick(cell.x, cell.z);
  };

  private onPointerLeave = (): void => {
    this.hoverCell = null;
    this.cb.onHover(-1, null);
  };

  private onVisibility = (): void => {
    if (document.hidden) this.cb.onAutoPause();
  };

  private attachListeners(): void {
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      const parent = this.canvas.parentElement;
      if (parent) this.ro.observe(parent);
    } else {
      window.addEventListener('resize', this.resize);
    }
  }

  private resize = (): void => {
    if (this.disposed) return;
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || this.canvas.clientWidth || 320;
    const h = parent?.clientHeight || this.canvas.clientHeight || 320;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const halfH = 5.6;
    this.camera.left = -halfH * aspect;
    this.camera.right = halfH * aspect;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  };

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.paused) return;
    const dt = 1 / 60;
    this.time += dt;

    // Tweens (drop-in animation)
    if (this.tweens.length > 0) {
      let alive = false;
      this.tweens = this.tweens.filter((tw) => {
        tw.t += dt;
        const k = Math.min(1, tw.t / tw.dur);
        const ease = 1 - (1 - k) * (1 - k) * (1 - k);
        tw.mesh.position.y = tw.fromY + (tw.toY - tw.fromY) * ease;
        if (k >= 1) {
          tw.mesh.position.y = tw.toY;
          return false;
        }
        alive = true;
        return true;
      });
      if (!alive) this.tweens = [];
    }

    // Gentle idle sway (skipped for reduced motion)
    const sway = !this.reducedMotion;
    if (sway) {
      const s = Math.sin(this.time * 0.25) * 0.35;
      this.camera.position.set(9.5 + s, 9.5, 9.5 - s * 0.6);
      this.camera.lookAt(0, 0.2, 0);
    }
    this.renderer.render(this.scene, this.camera);
  };
}
