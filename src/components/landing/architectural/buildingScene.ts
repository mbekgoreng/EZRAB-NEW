/**
 * ArchitecturalBackground — Three.js scene (Layer A: architectural ambience).
 *
 * A living digital-architecture environment behind the EZRAB hero:
 *  - construction blueprint that draws itself progressively (drawRange)
 *  - wireframe tower that assembles floor by floor, then solidifies to glass
 *  - blue light pulses flowing along structural edges
 *  - drifting floor grid (slow camera-perspective scroll), light particles
 *  - very slow cinematic camera orbit / dolly
 *  - seamless 32s master loop (end state == start state)
 *
 * Layer B (product storytelling) drives this scene through `setMode(i)`:
 * the 6 demo scenes tint the ambience (blueprint boost, dimension lines,
 * energy flow, glass completion). All mode transitions are lerped — no jumps.
 *
 * Honesty: purely visual ambience, no claim of technical integration.
 */
import * as THREE from 'three';

const TAU = Math.PI * 2;
const LOOP_S = 32;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

interface ModeTargets {
  blueprint: number;
  dims: number;
  pulse: number;
  glass: number;
  grid: number;
}

const MODES: ModeTargets[] = [
  { blueprint: 1.0, dims: 0.0, pulse: 1.0, glass: 1.0, grid: 1.0 }, // 0 Proyek
  { blueprint: 1.0, dims: 0.0, pulse: 1.5, glass: 1.0, grid: 1.0 }, // 1 AI Estimate
  { blueprint: 2.0, dims: 0.15, pulse: 1.0, glass: 0.8, grid: 1.0 }, // 2 AI Dokumen
  { blueprint: 1.1, dims: 1.0, pulse: 1.2, glass: 1.0, grid: 1.7 }, // 3 QTO
  { blueprint: 1.0, dims: 0.25, pulse: 2.3, glass: 1.1, grid: 1.0 }, // 4 AHSP & RAB
  { blueprint: 0.9, dims: 0.0, pulse: 1.3, glass: 1.9, grid: 1.0 }, // 5 Kurva S
];

export interface ArchitecturalSceneOptions {
  /** 'high' | 'low' — particle count, floors, pixel ratio */
  detail?: 'high' | 'low';
}

export class ArchitecturalScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private running = false;
  private elapsed = 0;

  private mode: ModeTargets = { ...MODES[0] };
  private modeTarget: ModeTargets = { ...MODES[0] };

  private planLines!: THREE.LineSegments;
  private planTotal = 0;
  private planMat!: THREE.LineBasicMaterial;
  private floors: { group: THREE.Group; edges: THREE.LineBasicMaterial; glass: THREE.MeshBasicMaterial; targetY: number; index: number }[] = [];
  private dimMat!: THREE.LineBasicMaterial;
  private pulses: { mesh: THREE.Mesh; speed: number; offset: number }[] = [];
  private pulseMat!: THREE.MeshBasicMaterial;
  private particles!: THREE.Points;
  private particlePos!: Float32Array;
  private particleCount = 320;
  private gridA!: THREE.GridHelper;
  private gridB!: THREE.GridHelper;
  private gridMatA!: THREE.Material;
  private gridMatB!: THREE.Material;
  private buildingTop = 14;

  constructor(private canvas: HTMLCanvasElement, opts: ArchitecturalSceneOptions = {}) {
    const detail = opts.detail ?? 'high';
    this.particleCount = detail === 'high' ? 320 : 140;
    const floorCount = detail === 'high' ? 8 : 6;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x060d1a, 1);

    this.scene.fog = new THREE.FogExp2(0x060d1a, 0.024);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 220);
    this.camera.position.set(17, 10.5, 21);

    this.buildGrid();
    this.buildBlueprintPlan();
    this.buildTower(floorCount);
    this.buildDimensionLines();
    this.buildPulses();
    this.buildParticles();

    this.resize(canvas.clientWidth || 16, canvas.clientHeight || 9);
  }

  // ---------------------------------------------------------- construction

  private buildGrid(): void {
    this.gridA = new THREE.GridHelper(140, 70, 0x2a5a8f, 0x16324f);
    this.gridB = new THREE.GridHelper(140, 14, 0x3b82c4, 0x1d4a75);
    for (const g of [this.gridA, this.gridB]) {
      const m = g.material as THREE.Material;
      m.transparent = true;
      (m as THREE.LineBasicMaterial).opacity = 0.5;
      g.position.y = -0.02;
      this.scene.add(g);
    }
    this.gridMatA = this.gridA.material as THREE.Material;
    this.gridMatB = this.gridB.material as THREE.Material;
    (this.gridMatA as THREE.LineBasicMaterial).opacity = 0.42;
    (this.gridMatB as THREE.LineBasicMaterial).opacity = 0.5;
  }

  /** House-like floor plan drawn with LineSegments + drawRange reveal. */
  private buildBlueprintPlan(): void {
    const segs: number[] = [];
    const rect = (x0: number, z0: number, x1: number, z1: number) => {
      segs.push(x0, 0, z0, x1, 0, z0, x1, 0, z0, x1, 0, z1, x1, 0, z1, x0, 0, z1, x0, 0, z1, x0, 0, z0);
    };
    // outer + rooms (14 x 10 plan, centered)
    rect(-7, -5, 7, 5);
    rect(-7, -5, 0.5, 5);   // living zone
    rect(0.5, -5, 7, 0.5);  // bedrooms
    rect(0.5, 0.5, 7, 5);   // service
    rect(-7, -5, -2.5, 1);  // terrace cut
    // wall ticks / door hints
    segs.push(-2.5, 0, -1, -2.5, 0, 1,  3, 0, -5, 3, 0, -2.5,  -7, 0, 2.5, -4.5, 0, 2.5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    this.planTotal = segs.length / 3;
    this.planMat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0 });
    this.planLines = new THREE.LineSegments(geo, this.planMat);
    this.planLines.position.y = 0.03;
    this.scene.add(this.planLines);
  }

  private buildTower(floorCount: number): void {
    const slabGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(10, 0.3, 8));
    const colGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.3, 1.75, 0.3));
    const glassGeo = new THREE.BoxGeometry(9.6, 1.4, 7.6);
    const corners: [number, number][] = [[-4.6, -3.6], [4.6, -3.6], [-4.6, 3.6], [4.6, 3.6]];
    for (let i = 0; i < floorCount; i++) {
      const group = new THREE.Group();
      const edges = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0 });
      group.add(new THREE.LineSegments(slabGeo, edges));
      for (const [cx, cz] of corners) {
        const col = new THREE.LineSegments(colGeo, edges);
        col.position.set(cx, -1.0, cz);
        group.add(col);
      }
      const glass = new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0, depthWrite: false });
      const gm = new THREE.Mesh(glassGeo, glass);
      gm.position.y = -0.85;
      group.add(gm);
      const targetY = 1.4 + i * 1.78;
      group.position.y = -4;
      this.scene.add(group);
      this.floors.push({ group, edges, glass, targetY, index: i });
    }
    this.buildingTop = 1.4 + (floorCount - 1) * 1.78 + 1;
  }

  private buildDimensionLines(): void {
    const s: number[] = [];
    const tick = (x: number, y: number, z: number, horiz: boolean) => {
      const l = 0.55;
      if (horiz) s.push(x - l, y, z, x + l, y, z);
      else s.push(x, y - l, z, x, y + l, z);
    };
    // horizontal dimension, front
    s.push(-7.5, 0.25, 6.8, 7.5, 0.25, 6.8);
    tick(-7.5, 0.25, 6.8, false); tick(7.5, 0.25, 6.8, false); tick(0, 0.25, 6.8, false);
    // vertical dimension, right side
    s.push(7.6, 0, 0, 7.6, this.buildingTop + 1, 0);
    tick(7.6, 0, 0, true); tick(7.6, this.buildingTop + 1, 0, true);
    // depth dimension, left
    s.push(-7.6, 0.25, -5.5, -7.6, 0.25, 5.5);
    tick(-7.6, 0.25, -5.5, true); tick(-7.6, 0.25, 5.5, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(s, 3));
    this.dimMat = new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0 });
    const lines = new THREE.LineSegments(geo, this.dimMat);
    this.scene.add(lines);
  }

  private buildPulses(): void {
    this.pulseMat = new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const geo = new THREE.SphereGeometry(0.11, 8, 8);
    const cols: [number, number][] = [[-4.6, -3.6], [4.6, -3.6], [-4.6, 3.6], [4.6, 3.6], [0, -3.6], [0, 3.6]];
    cols.forEach(([x, z], i) => {
      const mesh = new THREE.Mesh(geo, this.pulseMat);
      mesh.position.set(x, 1, z);
      this.scene.add(mesh);
      this.pulses.push({ mesh, speed: 2.2 + (i % 3) * 0.7, offset: (i / cols.length) * this.buildingTop });
    });
  }

  private buildParticles(): void {
    this.particlePos = new Float32Array(this.particleCount * 3);
    for (let i = 0; i < this.particleCount; i++) {
      this.particlePos[i * 3] = (Math.random() - 0.5) * 70;
      this.particlePos[i * 3 + 1] = Math.random() * 22;
      this.particlePos[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.particlePos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x7dd3fc, size: 0.14, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  // --------------------------------------------------------------- control

  setMode(i: number): void {
    this.modeTarget = { ...MODES[Math.min(Math.max(i, 0), MODES.length - 1)] };
  }

  setPaused(paused: boolean): void {
    if (paused && this.running) this.stop();
    else if (!paused && !this.running) this.start();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.elapsed += dt;
      this.tick(dt);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.clock.stop();
  }

  /** Single static frame (reduced-motion / fallback). */
  renderStatic(): void {
    this.elapsed = LOOP_S * 0.58;
    this.tick(0);
    this.renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.stop();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    this.renderer.dispose();
  }

  // ----------------------------------------------------------------- tick

  private tick(dt: number): void {
    const t = this.elapsed;
    const p = (t % LOOP_S) / LOOP_S; // master loop phase

    // lerp mode targets (smooth, no jumps)
    const k = 1 - Math.exp(-2.2 * Math.max(dt, 1 / 60));
    for (const key of ['blueprint', 'dims', 'pulse', 'glass', 'grid'] as const) {
      this.mode[key] = lerp(this.mode[key], this.modeTarget[key], k);
    }
    const M = this.mode;

    // --- blueprint draw (progressive, then release at loop end)
    const drawIn = smoothstep(0.02, 0.24, p);
    const drawOut = 1 - smoothstep(0.86, 0.985, p);
    const drawAmt = drawIn * drawOut;
    (this.planLines.geometry as THREE.BufferGeometry).setDrawRange(0, Math.floor(this.planTotal * drawAmt));
    this.planMat.opacity = 0.85 * drawAmt * Math.min(M.blueprint, 1.6);
    this.planMat.color.setHex(M.blueprint > 1.3 ? 0xbfe9ff : 0x7dd3fc);

    // --- tower assembly
    const n = this.floors.length;
    this.floors.forEach((f, i) => {
      const rise0 = 0.1 + (i / n) * 0.38;
      const rise = smoothstep(rise0, rise0 + 0.22, p);
      const sink = 1 - smoothstep(0.86 + ((n - 1 - i) / n) * 0.08, 0.985, p);
      const a = Math.min(rise, sink);
      f.group.position.y = lerp(-4, f.targetY, a);
      f.edges.opacity = 0.75 * a;
      const glassPhase = smoothstep(0.5, 0.72, p) * (1 - smoothstep(0.88, 0.985, p));
      f.glass.opacity = 0.13 * glassPhase * M.glass;
    });

    // --- dimension lines (QTO spotlight)
    this.dimMat.opacity = 0.9 * M.dims * smoothstep(0.1, 0.3, p);

    // --- energy pulses along columns
    const pulseOn = smoothstep(0.42, 0.6, p) * (1 - smoothstep(0.9, 0.99, p));
    this.pulseMat.opacity = 0.85 * pulseOn * Math.min(M.pulse, 2.4) * 0.55;
    for (const pu of this.pulses) {
      pu.mesh.position.y = 1 + ((t * pu.speed * (0.7 + M.pulse * 0.35) + pu.offset) % this.buildingTop);
      const s = 0.8 + M.pulse * 0.25;
      pu.mesh.scale.setScalar(s);
    }

    // --- particles drift
    const pos = this.particlePos;
    for (let i = 0; i < this.particleCount; i++) {
      pos[i * 3 + 1] += dt * 0.35;
      pos[i * 3] += Math.sin(t * 0.4 + i) * dt * 0.12;
      if (pos[i * 3 + 1] > 22) pos[i * 3 + 1] = 0;
    }
    (this.particles.geometry as THREE.BufferGeometry).attributes.position.needsUpdate = true;

    // --- floor grid slow scroll (camera-perspective feel)
    const scroll = (t * 0.5) % 2;
    this.gridA.position.z = scroll;
    this.gridB.position.z = scroll * 0.5;
    (this.gridMatA as THREE.LineBasicMaterial).opacity = 0.34 * M.grid;
    (this.gridMatB as THREE.LineBasicMaterial).opacity = 0.42 * M.grid;

    // --- cinematic camera: very slow orbit + dolly + bob
    const ang = 0.72 + Math.sin(t * 0.055) * 0.055 + (t % LOOP_S) * 0.0011;
    const rad = 26.5 + Math.sin((t % LOOP_S) * TAU / LOOP_S) * 1.1;
    const y = 10.5 + Math.sin(t * 0.11) * 0.55;
    this.camera.position.set(Math.sin(ang) * rad, y, Math.cos(ang) * rad);
    // lookAt shifted left so the architecture sits right-of-center ("agak ke kanan")
    this.camera.lookAt(-3.5, 4.6, 0);
  }
}
