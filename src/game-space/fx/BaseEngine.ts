/**
 * EZRAB Game Space v2 — shared engine base (src/game-space/fx/BaseEngine.ts)
 *
 * Owns the "boring but critical" parts every v2 game needs:
 * - WebGLRenderer: antialias + PCFSoftShadowMap + ACESFilmicToneMapping
 * - warm directional light w/ shadows, cool hemisphere, subtle rim light
 * - perspective camera w/ trauma shake + gentle pointer parallax
 * - ResizeObserver sizing, rAF loop with clamped dt + slow-mo time scale
 * - tracked disposables, listener teardown, per-game activeCount registry
 *
 * Subclasses implement buildScene() and tick(dt). They must call
 * BaseEngine.trackInstance(key) in their constructor (their static
 * `activeCount` getter reads BaseEngine.countFor(key)).
 */

import * as THREE from 'three';
import { Shake, SlowMo } from './juice';

export interface BaseEngineOpts {
  reducedMotion?: boolean;
  /** world-space target the camera looks at */
  lookAt?: THREE.Vector3;
  /** camera base position */
  camPos?: THREE.Vector3;
  fov?: number;
  /** shadow camera bounds (half-extent) */
  shadowBounds?: number;
  /** scene fog: [color, near, far] */
  fog?: [number, number, number];
  /** warm sun color/intensity */
  sun?: [number, number];
}

const counts = new Map<string, number>();

export abstract class BaseEngine {
  protected renderer: THREE.WebGLRenderer;
  protected scene = new THREE.Scene();
  protected camera: THREE.PerspectiveCamera;
  protected raycaster = new THREE.Raycaster();
  protected canvas: HTMLCanvasElement;
  protected reducedMotion: boolean;
  protected shake = new Shake();
  protected slowmo = new SlowMo();
  protected disposables = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  protected raf = 0;
  protected paused = false;
  protected disposed = false;
  protected time = 0;
  private counterKey: string;
  private ro: ResizeObserver | null = null;
  private camBase: THREE.Vector3;
  private lookBase: THREE.Vector3;
  private parallax = new THREE.Vector2();
  private parallaxTarget = new THREE.Vector2();
  private shakeVec = new THREE.Vector3();
  private lastT = 0;

  static countFor(key: string): number {
    return counts.get(key) ?? 0;
  }

  protected static trackInstance(key: string): void {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  protected static untrackInstance(key: string): void {
    counts.set(key, Math.max(0, (counts.get(key) ?? 0) - 1));
  }

  constructor(canvas: HTMLCanvasElement, counterKey: string, opts: BaseEngineOpts = {}) {
    this.canvas = canvas;
    this.counterKey = counterKey;
    this.reducedMotion = opts.reducedMotion ?? false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const isMobile = Math.min(window.innerWidth, window.innerHeight) < 640;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.75 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.camBase = opts.camPos?.clone() ?? new THREE.Vector3(9, 8.5, 11);
    this.lookBase = opts.lookAt?.clone() ?? new THREE.Vector3(0, 1.5, 0);
    this.camera = new THREE.PerspectiveCamera(opts.fov ?? 42, 1, 0.1, 200);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.lookBase);

    this.buildLights(opts);
    if (opts.fog) {
      const [color, near, far] = opts.fog;
      this.scene.fog = new THREE.Fog(color, near, far);
    }

    this.buildScene();
    this.attachListeners();
    this.resize();
    (this.constructor as typeof BaseEngine).trackInstance(counterKey);
    this.lastT = performance.now();
    // Schedule — never run tick() synchronously here: subclass fields are
    // assigned after super() returns, so the first tick must fire on a later
    // frame.
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ---------------- to implement ---------------- */

  protected abstract buildScene(): void;
  /** dt is already slow-mo scaled. */
  protected abstract tick(dt: number): void;

  /* ---------------- lights ---------------- */

  private track<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(r: T): T {
    this.disposables.add(r);
    return r;
  }

  /** Expose track() to subclasses. */
  protected own<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(r: T): T {
    return this.track(r);
  }

  private buildLights(opts: BaseEngineOpts): void {
    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x8a7a66, 0.85);
    this.scene.add(hemi);

    const [sunColor, sunI] = opts.sun ?? [0xffe3b3, 2.0];
    const sun = new THREE.DirectionalLight(sunColor, sunI);
    sun.position.set(8, 13, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const b = opts.shadowBounds ?? 10;
    sun.shadow.camera.left = -b;
    sun.shadow.camera.right = b;
    sun.shadow.camera.top = b;
    sun.shadow.camera.bottom = -b;
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.scene.add(sun.target);

    // cool rim from behind-left for edge definition
    const rim = new THREE.DirectionalLight(0x9db8ff, 0.55);
    rim.position.set(-9, 6, -8);
    this.scene.add(rim);
  }

  /* ---------------- public API ---------------- */

  setPaused(p: boolean): void {
    this.paused = p;
  }

  addShake(amount: number): void {
    if (!this.reducedMotion) this.shake.add(amount);
  }

  /** Raycast a screen point onto the y=0 plane. */
  pickGround(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }

  /** Raycast a screen point against meshes. Returns intersections. */
  pickMeshes(clientX: number, clientY: number, meshes: THREE.Object3D[]): THREE.Intersection[] {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    return this.raycaster.intersectObjects(meshes, false);
  }

  /** Move the camera rig (e.g. stack tower rising). */
  moveRig(camPos: THREE.Vector3, lookAt: THREE.Vector3): void {
    this.camBase.copy(camPos);
    this.lookBase.copy(lookAt);
  }

  /** Ease the camera rig toward targets (alpha 0..1). */
  protected lerpRig(camTarget: THREE.Vector3, lookTarget: THREE.Vector3, alpha: number): void {
    this.camBase.lerp(camTarget, alpha);
    this.lookBase.lerp(lookTarget, alpha);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    (this.constructor as typeof BaseEngine).untrackInstance(this.counterKey);
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.disposables.forEach((d) => d.dispose());
    this.disposables.clear();
    this.renderer.dispose();
  }

  /* ---------------- input (subclasses override handlers) ---------------- */

  protected onTap(_clientX: number, _clientY: number): void {
    /* subclass */
  }

  protected onHoverMove(_clientX: number, _clientY: number): void {
    /* subclass */
  }

  protected onHidden(): void {
    /* subclass may auto-pause */
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (this.disposed || this.paused) return;
    const rect = this.canvas.getBoundingClientRect();
    this.parallaxTarget.set(
      ((e.clientX - rect.left) / rect.width - 0.5) * 2,
      ((e.clientY - rect.top) / rect.height - 0.5) * 2,
    );
    if (e.target === this.canvas) this.onHoverMove(e.clientX, e.clientY);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.disposed || this.paused) return;
    if (e.target !== this.canvas) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.onTap(e.clientX, e.clientY);
  };

  private onPointerLeave = (): void => {
    this.parallaxTarget.set(0, 0);
  };

  private onVisibility = (): void => {
    if (document.hidden) this.onHidden();
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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /* ---------------- main loop ---------------- */

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.paused) return;
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const scaled = dt * this.slowmo.update(dt);
    this.time += scaled;

    this.shake.update(scaled);
    // parallax ease
    this.parallax.lerp(this.parallaxTarget, 1 - Math.pow(0.002, dt));
    this.tick(scaled);

    // camera rig: base + parallax + shake
    const par = this.reducedMotion ? 0 : 1;
    this.shake.offset(this.shakeVec, this.time);
    this.camera.position.set(
      this.camBase.x + this.parallax.x * 0.9 * par + this.shakeVec.x,
      this.camBase.y - this.parallax.y * 0.55 * par + this.shakeVec.y,
      this.camBase.z + this.shakeVec.z,
    );
    this.camera.lookAt(this.lookBase);
    this.renderer.render(this.scene, this.camera);
  };
}
