/**
 * Bongkar Rumah 3D — Three.js engine (src/game-space/games/bongkar-rumah/engine3d.ts)
 *
 * Pola mengikuti BuildChallengeEngine: satu renderer/scene/loop, dispose()
 * bersih (geometri, material, tekstur, listener, RAF). Render:
 *  - PBR MeshStandardMaterial + tekstur prosedural (map + bump)
 *  - shadow PCFSoft secukupnya, fog, ACES tone mapping
 *  - blok = InstancedMesh per material (intact/cracked), puing & debu pooled
 *  - kamera: drag putar sedikit + wheel/pinch zoom; tap = raycast
 *
 * Logika murni (support/kaskade/fisika) tetap di logic.ts — engine hanya
 * mirror + juice.
 */

import * as THREE from 'three';
import {
  buildAllTextures, softCircle, skyCanvas, groundCanvas, distantBuilding,
  type TexKind,
} from './textures';
import {
  createLevel, destroyBlock, createCombo, activeMultiplier,
  checkCollapse, stepPhysics, progress, isWon, layerCounts, LEVELS,
  type Block3D, type Mat3D, type Layer3D, type LogicEvent,
} from './logic';
import { sfx } from '../../engine2d/audio';

export interface Hud3D {
  score: number;
  pct: number;
  mult: number;
  levelName: string;
  layers: Record<Layer3D, { total: number; left: number }>;
  grace: boolean;
}

export type EngineEvent =
  | { type: 'win'; score: number }
  | { type: 'combo'; mult: number }
  | { type: 'quip'; text: string }
  | { type: 'scorePop'; x: number; y: number; text: string; big: boolean };

interface Opts {
  onHud: (h: Hud3D) => void;
  onEvent: (e: EngineEvent) => void;
  onAutoPause: () => void;
}

const QUIPS = [
  'RAB-nya ikut runtuh!',
  'Struktur: 404 not found.',
  'Kolomnya resign massal!',
  'Estimasi biaya perbaikan: Rp ∞.',
  'Mandor pingsan melihat ini.',
  'Dindingnya batal berdiri.',
  'Bata beterbangan kayak cicilan.',
];

const DEBRIS_COLORS: Record<Mat3D, number[]> = {
  bata: [0xb3502e, 0x8f3c1c, 0xd4693f],
  beton: [0x9aa0a8, 0x7d838c, 0xc3c9d1],
  kaca: [0x9fd0ee, 0xd8efff, 0x6fa9d4],
  kayu: [0xa06a35, 0x7c5228, 0xc89b6a],
  genteng: [0xc45a30, 0x9c3f1e, 0xe08a5f],
  plester: [0xe8ddc8, 0xd8c9ae, 0xf5efe0],
  lantai: [0x9c6633, 0x7c5228, 0xbd8a52],
  pintu: [0x7c5228, 0x5d3a1a, 0x9c6a35],
};

const MAT_TEX: Record<Mat3D, TexKind> = {
  bata: 'bata', beton: 'beton', kaca: 'kaca', kayu: 'kayu',
  genteng: 'genteng', plester: 'plester', lantai: 'lantai', pintu: 'pintu',
};

const MAT_ROUGH: Record<Mat3D, number> = {
  bata: 0.9, beton: 0.95, kaca: 0.25, kayu: 0.8,
  genteng: 0.85, plester: 0.95, lantai: 0.75, pintu: 0.7,
};

interface View {
  block: Block3D;
  mesh: THREE.InstancedMesh | null; // null -> solo mesh
  solo: THREE.Mesh | null;
  index: number;
  cracked: boolean;
  mat: Mat3D;
}

interface Debris {
  alive: boolean; x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  ax: number; ay: number; az: number; va: number;
  life: number; maxLife: number; size: number;
}

interface Puff {
  alive: boolean; x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number; size: number;
}

const HIDE = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -100, 0);

export class Bongkar3DEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private canvas: HTMLCanvasElement;
  private cb: Opts;
  private raf = 0;
  private paused = false;
  private disposed = false;
  private ro: ResizeObserver | null = null;
  private reducedMotion: boolean;
  private disposables = new Set<{ dispose(): void }>();
  private levelTrash: Array<{ dispose(): void }> = [];

  // level state
  private levelIdx = 0;
  private facadeHp = 1;
  private blocks: Block3D[] = [];
  private views: View[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private meshFor = new Map<THREE.InstancedMesh, { mat: Mat3D; cracked: boolean }>();
  private instByView = new Map<number, View>(); // blockId -> view (utk raycast)
  private combo = createCombo();
  private score = 0;
  private won = false;
  private graceT = 0;
  private hitStop = 0;
  private dirty = true;
  private last = 0;
  private time = 0;
  private signMeshes: THREE.Mesh[] = [];
  private signIds = new Set<number>();

  // juice
  private trauma = 0;
  private landWindow: number[] = []; // timestamp landed (deteksi runtuhan besar)
  private quipAt = 0;

  // debris & dust pools
  private debrisMesh!: THREE.InstancedMesh;
  private debris: Debris[] = [];
  private debrisCursor = 0;
  private dustMesh!: THREE.InstancedMesh;
  private puffs: Puff[] = [];
  private puffCursor = 0;
  private dustTex!: THREE.CanvasTexture;

  // kamera
  private camTarget = new THREE.Vector3();
  private camDist = 14;
  private camDistBase = 14;
  private azim = 0.6;
  private azimBase = 0.6;
  private elev = 0.62;
  private elevBase = 0.62;

  // input
  private pointers = new Map<number, { x: number; y: number }>();
  private downPos: { x: number; y: number; t: number } | null = null;
  private pinchD0 = 0;
  private pinchDist0 = 0;
  private moved = false;

  // background anim
  private clouds: THREE.Sprite[] = [];
  private motes: THREE.Points | null = null;

  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private tmpE = new THREE.Euler();
  private tmpAxis = new THREE.Vector3();
  private tmpQ2 = new THREE.Quaternion();

  constructor(canvas: HTMLCanvasElement, opts: Opts) {
    this.canvas = canvas;
    this.cb = opts;
    this.reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);

    this.buildEnvironment();
    this.buildPools();
    this.attachListeners();
    this.resize();
    this.last = performance.now();
    this.loop();
  }

  /* ============================== environment ============================== */

  private track<T extends { dispose(): void }>(d: T): T {
    this.disposables.add(d);
    return d;
  }

  private buildEnvironment(): void {
    const sc = this.scene;
    sc.fog = new THREE.Fog(0xcfe0f2, 45, 130);

    // langit: kubah gradien
    const skyTex = this.track(new THREE.CanvasTexture(skyCanvas()));
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(180, 24, 16)),
      this.track(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })),
    );
    sc.add(sky);

    // cahaya
    sc.add(new THREE.HemisphereLight(0xbfd9f5, 0x8a7a66, 0.85));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.1);
    sun.position.set(14, 22, 10);
    sun.castShadow = true;
    const ext = 22;
    sun.shadow.camera.left = -ext; sun.shadow.camera.right = ext;
    sun.shadow.camera.top = ext; sun.shadow.camera.bottom = -ext;
    sun.shadow.camera.far = 70;
    const small = Math.min(window.innerWidth, window.innerHeight) < 640;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    sun.shadow.bias = -0.0004;
    sc.add(sun);
    this.sunTarget(sun);
    const fill = new THREE.DirectionalLight(0xd8e6ff, 0.4);
    fill.position.set(-10, 6, -12);
    sc.add(fill);

    // tanah
    const gTex = this.track(new THREE.CanvasTexture(groundCanvas()));
    gTex.colorSpace = THREE.SRGBColorSpace;
    gTex.wrapS = THREE.RepeatWrapping; gTex.wrapT = THREE.RepeatWrapping;
    gTex.repeat.set(10, 10);
    const ground = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(90, 48)),
      this.track(new THREE.MeshStandardMaterial({ map: gTex, roughness: 1 })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    sc.add(ground);

    // slab site di bawah bangunan (diposisikan ulang per level)
    const slab = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(1, 0.24, 1)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xcfd6de, roughness: 0.95 })),
    );
    slab.position.y = -0.12;
    slab.receiveShadow = true;
    slab.name = 'siteslab';
    sc.add(slab);

    // gedung jauh ber-jendela (parallax)
    for (let i = 0; i < 12; i += 1) {
      const tex = this.track(new THREE.CanvasTexture(distantBuilding(100 + i, 0.25 + (i % 3) * 0.15)));
      tex.colorSpace = THREE.SRGBColorSpace;
      const w = 7 + (i % 4) * 3;
      const h = 14 + ((i * 37) % 22);
      const m = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(w, h, w)),
        this.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })),
      );
      const a = (i / 12) * Math.PI * 2 + 0.3;
      const r = 52 + (i % 3) * 14;
      m.position.set(Math.cos(a) * r, h / 2 - 0.5, Math.sin(a) * r);
      m.rotation.y = -a;
      sc.add(m);
    }

    // pohon low-poly
    const trunkG = this.track(new THREE.CylinderGeometry(0.14, 0.2, 0.9, 6));
    const trunkM = this.track(new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 1 }));
    const leafG = this.track(new THREE.IcosahedronGeometry(0.9, 1));
    const leafM = this.track(new THREE.MeshStandardMaterial({ color: 0x5d8f4e, roughness: 1 }));
    const leafM2 = this.track(new THREE.MeshStandardMaterial({ color: 0x74a75e, roughness: 1 }));
    const spots: Array<[number, number, number]> = [
      [-9, -6, 1], [10, -4, 1.3], [-11, 5, 0.9], [9, 7, 1.1], [2, -11, 1.2], [-4, 10, 0.8],
    ];
    spots.forEach(([tx, tz, s], i) => {
      const trunk = new THREE.Mesh(trunkG, trunkM);
      trunk.position.set(tx, 0.45 * s, tz);
      trunk.scale.setScalar(s);
      const leaf = new THREE.Mesh(leafG, i % 2 ? leafM : leafM2);
      leaf.position.set(tx, (0.9 + 0.85) * s, tz);
      leaf.scale.setScalar(s);
      leaf.castShadow = true;
      sc.add(trunk, leaf);
    });

    // awan: sprite lembut melayang
    const cloudTex = this.track(new THREE.CanvasTexture(softCircle(128)));
    for (let i = 0; i < 9; i += 1) {
      const sp = new THREE.Sprite(
        this.track(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.75, fog: false, depthWrite: false })),
      );
      const a = (i / 9) * Math.PI * 2;
      sp.position.set(Math.cos(a) * (40 + (i % 3) * 18), 26 + (i % 4) * 5, Math.sin(a) * (40 + (i % 3) * 18));
      const s = 14 + (i % 4) * 6;
      sp.scale.set(s, s * 0.45, 1);
      (sp as unknown as { drift: number }).drift = 0.25 + (i % 3) * 0.2;
      this.clouds.push(sp);
      sc.add(sp);
    }

    // debu beterbangan (idle)
    const moteGeo = this.track(new THREE.BufferGeometry());
    const N = 60;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = Math.random() * 8 + 0.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const moteMat = this.track(new THREE.PointsMaterial({
      map: cloudTex, size: 0.35, transparent: true, opacity: 0.5,
      depthWrite: false, color: 0xfff4d6, sizeAttenuation: true,
    }));
    this.motes = new THREE.Points(moteGeo, moteMat);
    sc.add(this.motes);
  }

  private sunTarget(sun: THREE.DirectionalLight): void {
    sun.target.position.set(0, 0, 0);
    this.scene.add(sun.target);
  }

  private buildPools(): void {
    // --- debris: instanced box, warna per-instance ---
    const dGeo = this.track(new THREE.BoxGeometry(1, 1, 1));
    const dMat = this.track(new THREE.MeshStandardMaterial({ roughness: 0.9 }));
    const dCap = this.reducedMotion ? 120 : 260;
    this.debrisMesh = new THREE.InstancedMesh(dGeo, dMat, dCap);
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.castShadow = true;
    this.debrisMesh.frustumCulled = false;
    for (let i = 0; i < dCap; i += 1) {
      this.debrisMesh.setMatrixAt(i, HIDE);
      this.debrisMesh.setColorAt(i, new THREE.Color(0xffffff));
      this.debris.push({
        alive: false, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0,
        ax: 1, ay: 0, az: 0, va: 0, life: 0, maxLife: 1, size: 1,
      });
    }
    this.scene.add(this.debrisMesh);

    // --- debu: instanced plane billboard ---
    this.dustTex = this.track(new THREE.CanvasTexture(softCircle(128)));
    const pGeo = this.track(new THREE.PlaneGeometry(1, 1));
    const pMat = this.track(new THREE.MeshBasicMaterial({
      map: this.dustTex, transparent: true, opacity: 0.55,
      depthWrite: false, color: 0xd8cbb2,
    }));
    const pCap = this.reducedMotion ? 50 : 110;
    this.dustMesh = new THREE.InstancedMesh(pGeo, pMat, pCap);
    this.dustMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dustMesh.frustumCulled = false;
    this.dustMesh.renderOrder = 5;
    for (let i = 0; i < pCap; i += 1) {
      this.dustMesh.setMatrixAt(i, HIDE);
      this.puffs.push({
        alive: false, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 1,
      });
    }
    this.scene.add(this.dustMesh);
  }

  /* ============================== level ============================== */

  loadLevel(idx: number, facadeHp = 1): void {
    this.levelIdx = idx;
    this.facadeHp = facadeHp;
    // buang mesh level lama
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.dispose();
    }
    for (const s of this.signMeshes) this.scene.remove(s);
    this.signMeshes = [];
    this.signIds.clear();
    for (const d of this.levelTrash) d.dispose();
    this.levelTrash = [];
    this.meshes = [];
    this.meshFor.clear();
    this.views = [];
    this.instByView.clear();

    const { blocks, bounds } = createLevel(idx, facadeHp);
    this.blocks = blocks;
    this.combo = createCombo();
    this.score = 0;
    this.won = false;
    this.graceT = 2;
    this.hitStop = 0;
    this.trauma = 0;
    this.landWindow = [];
    this.dirty = true;

    const tex = buildAllTextures();
    // hitung kapasitas per material
    const cap = new Map<Mat3D, { intact: number; cracked: number }>();
    for (const b of blocks) {
      if (b.shape === 'gable') continue; // solo mesh
      const e = cap.get(b.mat) ?? { intact: 0, cracked: 0 };
      e.intact += 1; e.cracked += 1;
      cap.set(b.mat, e);
    }
    const boxGeo = this.track(new THREE.BoxGeometry(1, 1, 1));
    const mkMesh = (mat: Mat3D, cracked: boolean, n: number): THREE.InstancedMesh => {
      const pair = tex[MAT_TEX[mat]];
      const map = new THREE.CanvasTexture(cracked ? pair.cracked : pair.intact);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
      const bump = new THREE.CanvasTexture(cracked ? pair.cracked : pair.intact);
      const m = new THREE.MeshStandardMaterial({
        map, bumpMap: bump, bumpScale: 0.6,
        roughness: MAT_ROUGH[mat],
        metalness: mat === 'kaca' ? 0.35 : 0.02,
      });
      this.levelTrash.push(map, bump, m);
      const im = new THREE.InstancedMesh(boxGeo, m, Math.max(n, 1));
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = true;
      im.receiveShadow = true;
      for (let i = 0; i < Math.max(n, 1); i += 1) {
        im.setMatrixAt(i, HIDE);
        im.setColorAt(i, new THREE.Color(0xffffff));
      }
      this.meshFor.set(im, { mat, cracked });
      this.meshes.push(im);
      this.scene.add(im);
      return im;
    };
    const meshIntact = new Map<Mat3D, THREE.InstancedMesh>();
    const meshCracked = new Map<Mat3D, THREE.InstancedMesh>();
    const useCount = new Map<THREE.InstancedMesh, number>();
    for (const [mat, c] of cap) {
      meshIntact.set(mat, mkMesh(mat, false, c.intact));
      meshCracked.set(mat, mkMesh(mat, true, c.cracked));
    }

    // alokasi instance per blok
    for (const b of blocks) {
      if (b.shape === 'gable') {
        // prisma segitiga solo
        const w = Math.max(b.cw, 0.3);
        const shape = new THREE.Shape();
        shape.moveTo(-b.cd / 2, 0);
        shape.lineTo(b.cd / 2, 0);
        shape.lineTo(0, b.h);
        shape.closePath();
        const geo = this.track(new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false }));
        geo.translate(0, 0, -w / 2);
        const pair = tex[MAT_TEX[b.mat]];
        const mapI = new THREE.CanvasTexture(pair.intact);
        mapI.colorSpace = THREE.SRGBColorSpace;
        const matI = new THREE.MeshStandardMaterial({ map: mapI, roughness: 0.9 });
        this.levelTrash.push(mapI, matI);
        const mesh = new THREE.Mesh(geo, matI);
        mesh.castShadow = true; mesh.receiveShadow = true;
        this.placeBlockMesh(mesh, b);
        this.scene.add(mesh);
        this.views.push({ block: b, mesh: null, solo: mesh, index: -1, cracked: false, mat: b.mat });
        this.instByView.set(b.id, this.views[this.views.length - 1]);
        continue;
      }
      const im = meshIntact.get(b.mat)!;
      const index = useCount.get(im) ?? 0;
      useCount.set(im, index + 1);
      im.setColorAt(index, new THREE.Color(b.tint));
      const view: View = { block: b, mesh: im, solo: null, index, cracked: false, mat: b.mat };
      this.views.push(view);
      this.instByView.set(b.id, view);
      this.syncViewMatrix(view);
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    for (const m of this.meshes) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // papan nama RUKO (L2): blok kayu anchored tipis -> mesh teks
    const sign = blocks.find((b) => b.mat === 'kayu' && b.anchored && b.cd < 0.6);
    if (sign) {
      const sc = document.createElement('canvas');
      sc.width = 512; sc.height = 128;
      const g2 = sc.getContext('2d')!;
      g2.fillStyle = '#8a5a2e'; g2.fillRect(0, 0, 512, 128);
      g2.fillStyle = '#ffe1a8'; g2.fillRect(8, 8, 496, 112);
      g2.fillStyle = '#7a3a10';
      g2.font = '900 72px "Plus Jakarta Sans", system-ui, sans-serif';
      g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText('RUKO', 256, 68);
      const st = new THREE.CanvasTexture(sc);
      st.colorSpace = THREE.SRGBColorSpace;
      this.levelTrash.push(st);
      this.signIds.add(sign.id);
      const sm = new THREE.Mesh(
        new THREE.BoxGeometry(sign.cw, sign.h, sign.cd),
        new THREE.MeshStandardMaterial({ map: st, roughness: 0.8 }),
      );
      this.levelTrash.push(sm.geometry, sm.material as THREE.Material);
      sm.castShadow = true;
      this.placeBlockMesh(sm, sign);
      this.scene.add(sm);
      this.signMeshes.push(sm);
      // sembunyikan instance aslinya
      const v = this.instByView.get(sign.id);
      if (v?.mesh) { v.mesh.setMatrixAt(v.index, HIDE); v.mesh.instanceMatrix.needsUpdate = true; }
    }

    // slab site mengikuti footprint
    const slab = this.scene.getObjectByName('siteslab') as THREE.Mesh;
    if (slab) {
      const w = bounds.x1 - bounds.x0 + 2.4;
      const d = bounds.z1 - bounds.z0 + 2.4;
      slab.scale.set(w, 1, d);
      slab.position.set((bounds.x0 + bounds.x1) / 2, -0.12, (bounds.z0 + bounds.z1) / 2);
    }

    // kamera: bingkai bangunan
    const cx = (bounds.x0 + bounds.x1) / 2;
    const cz = (bounds.z0 + bounds.z1) / 2;
    this.camTarget.set(cx, bounds.top * 0.42, cz);
    const size = Math.max(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0, bounds.top);
    this.camDistBase = size * 1.55 + 5;
    this.camDist = this.camDistBase;
    this.azim = this.azimBase;
    this.elev = this.elevBase;

    // arahkan shadow matahari ke tengah bangunan
    this.scene.traverse((o) => {
      if (o instanceof THREE.DirectionalLight && o.castShadow) o.target.position.copy(this.camTarget);
    });

    this.pushHud();
  }

  /** Posisikan mesh blok (solo) mengikuti logika. */
  private placeBlockMesh(mesh: THREE.Mesh, b: Block3D): void {
    mesh.position.set(b.px, b.py + b.h / 2, b.pz);
    if (b.shape === 'gable') {
      mesh.rotation.set(0, Math.PI / 2 + b.rotY, 0);
    } else if (b.shape === 'panel') {
      // panel atap: miring; tepi bawah menempel puncak dinding
      mesh.scale.set(b.cw, b.h, b.cd);
      mesh.rotation.set(b.slope, b.rotY, 0);
      mesh.position.y = b.py + 0.45;
    } else {
      mesh.scale.set(b.cw, b.h, b.cd);
      mesh.rotation.set(0, b.rotY, 0);
    }
  }

  private viewMatrix(v: View, out: THREE.Matrix4): void {
    const b = v.block;
    const wob = b.state === 'shaking' ? Math.sin(this.time * 42 + b.seed) * 0.035 : 0;
    this.tmpV.set(b.px + wob, b.py + b.h / 2, b.pz + wob * 0.6);
    this.tmpE.set(0, b.rotY, 0);
    this.tmpQ.setFromEuler(this.tmpE);
    if (b.slope) {
      this.tmpQ2.setFromAxisAngle(this.tmpAxis.set(1, 0, 0), b.slope);
      this.tmpQ.multiply(this.tmpQ2);
    }
    if (b.tilt) {
      this.tmpAxis.set(Math.sin(b.tiltAxis + Math.PI / 2), 0, Math.cos(b.tiltAxis + Math.PI / 2));
      this.tmpQ2.setFromAxisAngle(this.tmpAxis, b.tilt);
      this.tmpQ.multiply(this.tmpQ2);
    }
    this.tmpS.set(b.cw, b.h, b.cd);
    out.compose(this.tmpV, this.tmpQ, this.tmpS);
  }

  private syncViewMatrix(v: View): void {
    if (v.mesh) {
      this.viewMatrix(v, this.tmpM);
      v.mesh.setMatrixAt(v.index, this.tmpM);
    } else if (v.solo) {
      const b = v.block;
      v.solo.position.set(b.px, b.py + b.h / 2, b.pz);
      v.solo.rotation.set(0, (b.shape === 'gable' ? Math.PI / 2 : 0) + b.rotY, 0);
      if (b.tilt) {
        this.tmpAxis.set(Math.sin(b.tiltAxis + Math.PI / 2), 0, Math.cos(b.tiltAxis + Math.PI / 2));
        this.tmpQ2.setFromAxisAngle(this.tmpAxis, b.tilt);
        v.solo.quaternion.multiply(this.tmpQ2);
      }
    }
  }

  private hideView(v: View): void {
    if (v.mesh) {
      v.mesh.setMatrixAt(v.index, HIDE);
      v.mesh.instanceMatrix.needsUpdate = true;
    } else if (v.solo) {
      v.solo.visible = false;
    }
  }

  /** Pindah instance ke mesh cracked. */
  private crackView(v: View): void {
    if (v.cracked || !v.mesh || this.signIds.has(v.block.id)) return;
    const info = this.meshFor.get(v.mesh)!;
    const target = this.meshes.find((m) => {
      const inf = this.meshFor.get(m)!;
      return inf.mat === info.mat && inf.cracked;
    });
    if (!target) return;
    // cari slot kosong di mesh cracked (pakai counter per mesh)
    const n = (target as unknown as { userData: { n?: number } }).userData.n ?? 0;
    (target as unknown as { userData: { n?: number } }).userData.n = n + 1;
    this.viewMatrix(v, this.tmpM);
    target.setMatrixAt(n, this.tmpM);
    target.setColorAt(n, new THREE.Color(v.block.tint));
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    v.mesh.setMatrixAt(v.index, HIDE);
    v.mesh.instanceMatrix.needsUpdate = true;
    v.mesh = target;
    v.index = n;
    v.cracked = true;
  }

  /* ============================== interaksi ============================== */

  /** Tap dari raycast (atau debug). */
  tapBlock(id: number): void {
    if (this.paused || this.won) return;
    const v = this.instByView.get(id);
    if (!v) return;
    const b = v.block;
    if (b.state !== 'intact' && b.state !== 'cracked') return;
    const r = destroyBlock(this.blocks, id, this.combo, this.time);
    if (!r.ok) return;
    this.dirty = true;
    if (r.events[0]?.type === 'destroyed') {
      this.onDestroyed(b, r.points, r.multiplier);
    } else {
      // retak
      this.crackView(v);
      sfx.thud(0.55);
      this.spawnDebris(b.px, b.py + b.h * 0.6, b.pz, b.mat, 5, 3.2);
      this.spawnDust(b.px, b.py + b.h * 0.5, b.pz, 3, 0.8);
      this.pushHud();
    }
  }

  private onDestroyed(b: Block3D, points: number, mult: number): void {
    const v = this.instByView.get(b.id);
    if (v) {
      this.hideView(v);
      // papan nama ikut hilang
      for (const s of this.signMeshes) {
        if (Math.abs(s.position.x - b.px) < 0.01) s.visible = false;
      }
    }
    this.score += points;
    // juice: hit-stop 60ms + shake + debris tebal + debu
    this.hitStop = Math.max(this.hitStop, 0.06);
    const big = b.layer === 'structure' || (b.cw * b.cd >= 12);
    this.trauma = Math.min(1, this.trauma + (big ? 0.42 : 0.22));
    sfx.crumble(big ? 1.25 : 0.85);
    if (big) sfx.thud(0.8);
    this.spawnDebris(b.px, b.py + b.h / 2, b.pz, b.mat, big ? 16 : 10, big ? 7 : 5.5);
    this.spawnDust(b.px, b.py + b.h * 0.4, b.pz, big ? 8 : 5, big ? 1.6 : 1.1);
    if (mult >= 2) {
      sfx.pop(1 + mult * 0.1);
      this.cb.onEvent({ type: 'combo', mult });
    }
    // popup skor di posisi layar blok
    const sp = this.worldToScreen(b.px, b.py + b.h + 0.4, b.pz);
    if (sp) this.cb.onEvent({ type: 'scorePop', x: sp.x, y: sp.y, text: `+${points}`, big: mult >= 2 });
    this.pushHud();
  }

  private worldToScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0) return null;
    this.tmpV.set(x, y, z).project(this.camera);
    return {
      x: ((this.tmpV.x + 1) / 2) * rect.width,
      y: ((1 - this.tmpV.y) / 2) * rect.height,
    };
  }

  /* ============================== loop ============================== */

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      this.update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number): void {
    this.time += dt;

    // hit-stop: bekukan logika 60ms (render tetap jalan)
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.updateCamera(dt);
      this.updateFx(dt);
      return;
    }

    if (this.graceT > 0) this.graceT -= dt;

    // fisika (substep 2x agar stabil)
    const sub = 2;
    const sdt = dt / sub;
    let evs: LogicEvent[] = [];
    for (let i = 0; i < sub; i += 1) {
      const e = stepPhysics(this.blocks, sdt);
      if (e.length) evs = evs.concat(e);
    }
    // cek keruntuhan setelah ada perubahan (bukan saat grace)
    if (this.dirty && this.graceT <= 0) {
      const e = checkCollapse(this.blocks);
      if (e.length) evs = evs.concat(e);
      this.dirty = false;
    }

    let landed = 0;
    for (const e of evs) {
      if (e.type === 'landed') {
        landed += 1;
        this.dirty = true;
        const b = e.block;
        const v = this.instByView.get(b.id);
        if (v) this.syncViewMatrix(v);
        if (e.impact > 5) {
          sfx.thud(Math.min(1, e.impact / 16));
          this.spawnDust(b.px, b.py + 0.3, b.pz, 4, 1.2);
          this.trauma = Math.min(1, this.trauma + 0.1);
        }
        this.spawnDebris(b.px, b.py + 0.4, b.pz, b.mat, 4, 3);
        this.landWindow.push(this.time);
      } else if (e.type === 'bounced') {
        sfx.thud(0.4);
      } else if (e.type === 'fallStart' || e.type === 'collapseStart') {
        this.dirty = true;
      }
    }
    // runtuhan besar: >=6 mendarat dalam 0.6 dtk -> shake + suara + quip
    this.landWindow = this.landWindow.filter((t) => this.time - t < 0.6);
    if (this.landWindow.length >= 6 && this.time - this.quipAt > 4) {
      this.quipAt = this.time;
      this.trauma = Math.min(1, this.trauma + 0.5);
      sfx.crumble(1.4);
      sfx.thud(1);
      this.spawnDust(this.camTarget.x, 2, this.camTarget.z, 14, 2.6);
      this.cb.onEvent({ type: 'quip', text: QUIPS[(Math.random() * QUIPS.length) | 0] });
      this.landWindow = [];
    }

    // sinkronkan matriks blok yang bergerak
    let needSync = false;
    for (const v of this.views) {
      const st = v.block.state;
      if (st === 'shaking' || st === 'falling') {
        this.syncViewMatrix(v);
        if (v.mesh) needSync = true;
      }
    }
    if (needSync) {
      for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    }

    // kombo kedaluwarsa -> refresh HUD
    const mult = activeMultiplier(this.combo, this.time);
    if (mult === 0 && this.lastMult > 0) this.pushHud();
    this.lastMult = mult;

    // menang?
    if (!this.won && isWon(this.blocks)) {
      this.won = true;
      sfx.chime(3);
      this.trauma = Math.min(1, this.trauma + 0.35);
      // konfeti puing warna-warni
      for (let i = 0; i < 3; i += 1) {
        this.spawnDebris(
          this.camTarget.x + (Math.random() - 0.5) * 6, 6 + Math.random() * 4,
          this.camTarget.z + (Math.random() - 0.5) * 6,
          'kaca', 14, 6,
        );
      }
      this.cb.onEvent({ type: 'win', score: this.score });
    }

    this.updateCamera(dt);
    this.updateFx(dt);
  }

  private lastMult = 0;

  private updateCamera(dt: number): void {
    // trauma shake (decays)
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma;
    const t = this.time * 39;
    const shx = sh * 0.5 * Math.sin(t * 1.1);
    const shy = sh * 0.35 * Math.sin(t * 1.7 + 2);

    const ce = Math.cos(this.elev);
    const px = this.camTarget.x + Math.sin(this.azim) * ce * this.camDist + shx;
    const py = this.camTarget.y + Math.sin(this.elev) * this.camDist + shy;
    const pz = this.camTarget.z + Math.cos(this.azim) * ce * this.camDist;
    this.camera.position.set(px, py, pz);
    this.camera.lookAt(this.camTarget.x + shx * 0.5, this.camTarget.y, this.camTarget.z);

    // awan melayang
    if (!this.reducedMotion) {
      for (const c of this.clouds) {
        const d = (c as unknown as { drift: number }).drift;
        c.position.x += d * dt;
        if (c.position.x > 90) c.position.x = -90;
      }
    }
  }

  /* ============================== debris & dust ============================== */

  private spawnDebris(x: number, y: number, z: number, mat: Mat3D, count: number, power: number): void {
    if (this.reducedMotion) count = Math.ceil(count * 0.4);
    const colors = DEBRIS_COLORS[mat];
    const n = this.debris.length;
    for (let i = 0; i < count; i += 1) {
      const d = this.debris[this.debrisCursor];
      this.debrisCursor = (this.debrisCursor + 1) % n;
      const a = Math.random() * Math.PI * 2;
      const sp = power * (0.4 + Math.random() * 0.9);
      d.alive = true;
      d.x = x + (Math.random() - 0.5) * 0.6;
      d.y = y + (Math.random() - 0.5) * 0.6;
      d.z = z + (Math.random() - 0.5) * 0.6;
      d.vx = Math.cos(a) * sp;
      d.vz = Math.sin(a) * sp;
      d.vy = power * (0.5 + Math.random() * 0.9);
      d.ax = Math.random() - 0.5; d.ay = Math.random() - 0.5; d.az = Math.random() - 0.5;
      const al = Math.hypot(d.ax, d.ay, d.az) || 1;
      d.ax /= al; d.ay /= al; d.az /= al;
      d.va = (Math.random() - 0.5) * 14;
      d.maxLife = 1.1 + Math.random() * 0.9;
      d.life = d.maxLife;
      d.size = 0.14 + Math.random() * 0.3;
      const idx = this.debris.indexOf(d);
      this.debrisMesh.setColorAt(idx, new THREE.Color(colors[(Math.random() * colors.length) | 0]));
    }
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
  }

  private spawnDust(x: number, y: number, z: number, count: number, power: number): void {
    if (this.reducedMotion) count = Math.ceil(count * 0.4);
    const n = this.puffs.length;
    for (let i = 0; i < count; i += 1) {
      const p = this.puffs[this.puffCursor];
      this.puffCursor = (this.puffCursor + 1) % n;
      p.alive = true;
      p.x = x + (Math.random() - 0.5) * 1.4;
      p.y = Math.max(0.3, y + (Math.random() - 0.5) * 0.8);
      p.z = z + (Math.random() - 0.5) * 1.4;
      p.vx = (Math.random() - 0.5) * 1.6 * power;
      p.vy = (0.6 + Math.random() * 1.2) * power;
      p.vz = (Math.random() - 0.5) * 1.6 * power;
      p.maxLife = 0.9 + Math.random() * 0.8;
      p.life = p.maxLife;
      p.size = (1.2 + Math.random() * 1.4) * power;
    }
  }

  private updateFx(dt: number): void {
    // debris
    let dirty = false;
    for (let i = 0; i < this.debris.length; i += 1) {
      const d = this.debris[i];
      if (!d.alive) continue;
      dirty = true;
      d.life -= dt;
      if (d.life <= 0) {
        d.alive = false;
        this.debrisMesh.setMatrixAt(i, HIDE);
        continue;
      }
      d.vy -= 22 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y < d.size * 0.5) {
        d.y = d.size * 0.5;
        if (Math.abs(d.vy) > 2) {
          d.vy = -d.vy * 0.35;
          d.vx *= 0.7; d.vz *= 0.7;
          d.va *= 0.6;
        } else {
          d.vy = 0; d.vx *= 0.9; d.vz *= 0.9; d.va *= 0.9;
        }
      }
      const fade = d.life < 0.35 ? d.life / 0.35 : 1;
      this.tmpV.set(d.x, d.y, d.z);
      this.tmpAxis.set(d.ax, d.ay, d.az);
      this.tmpQ.setFromAxisAngle(this.tmpAxis, d.va * (d.maxLife - d.life));
      const s = d.size * fade;
      this.tmpS.set(s, s * 0.8, s);
      this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
      this.debrisMesh.setMatrixAt(i, this.tmpM);
    }
    if (dirty) this.debrisMesh.instanceMatrix.needsUpdate = true;

    // debu (billboard mengikuti kamera)
    let ddirty = false;
    for (let i = 0; i < this.puffs.length; i += 1) {
      const p = this.puffs[i];
      if (!p.alive) continue;
      ddirty = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.dustMesh.setMatrixAt(i, HIDE);
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 1 - 1.4 * dt; p.vz *= 1 - 1.4 * dt;
      p.vy *= 1 - 0.8 * dt;
      const k = 1 - p.life / p.maxLife; // 0->1
      const env = k < 0.25 ? k / 0.25 : 1 - ((k - 0.25) / 0.75) * 0.9;
      const s = Math.max(0.01, p.size * (0.6 + k * 1.8) * env);
      this.tmpV.set(p.x, p.y, p.z);
      this.tmpQ.copy(this.camera.quaternion);
      this.tmpS.set(s, s, s);
      this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
      this.dustMesh.setMatrixAt(i, this.tmpM);
    }
    if (ddirty) this.dustMesh.instanceMatrix.needsUpdate = true;

    // debu idle melayang
    if (this.motes && !this.reducedMotion) {
      this.motes.rotation.y += dt * 0.02;
    }
  }

  /* ============================== input ============================== */

  private onPointerDown = (e: PointerEvent): void => {
    if (this.disposed) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.downPos = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.moved = false;
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist0 = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchD0 = this.camDist;
      this.downPos = null;
    }
    sfx.ensure();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.disposed) return;
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist0 > 0) {
        this.camDist = THREE.MathUtils.clamp(
          this.pinchD0 * (this.pinchDist0 / Math.max(1, d)),
          this.camDistBase * 0.5, this.camDistBase * 1.9,
        );
      }
      this.moved = true;
      return;
    }
    if (this.downPos) {
      const total = Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y);
      if (total > 10) {
        this.moved = true;
        // drag: putar kamera sedikit
        this.azim = THREE.MathUtils.clamp(
          this.azimBase + (e.clientX - this.downPos.x) * 0.0022,
          this.azimBase - 0.5, this.azimBase + 0.5,
        );
        void dx;
        this.elev = THREE.MathUtils.clamp(
          this.elevBase + (this.downPos.y - e.clientY) * 0.0018,
          0.32, 1.0,
        );
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.disposed) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchDist0 = 0;
    if (this.pointers.size === 0) {
      // tap (bukan drag): raycast blok
      if (this.downPos && !this.moved && performance.now() - this.downPos.t < 500) {
        this.pickAt(e.clientX, e.clientY);
      }
      if (this.downPos) {
        // kunci sudut pandang baru sebagai basis
        this.azimBase = this.azim;
        this.elevBase = this.elev;
      }
      this.downPos = null;
      this.moved = false;
    }
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.disposed || this.paused) return;
    e.preventDefault();
    this.camDist = THREE.MathUtils.clamp(
      this.camDist * (1 + e.deltaY * 0.001),
      this.camDistBase * 0.5, this.camDistBase * 1.9,
    );
  };

  private pickAt(cx: number, cy: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((cx - rect.left) / rect.width) * 2 - 1;
    const ny = -((cy - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const targets: THREE.Object3D[] = [...this.meshes];
    for (const v of this.views) if (v.solo && v.solo.visible) targets.push(v.solo);
    for (const s of this.signMeshes) if (s.visible) targets.push(s);
    const hits = this.raycaster.intersectObjects(targets, false);
    for (const h of hits) {
      const obj = h.object;
      if (obj instanceof THREE.InstancedMesh) {
        const id = h.instanceId;
        if (id === undefined) continue;
        const view = this.views.find((v) => v.mesh === obj && v.index === id);
        if (view && (view.block.state === 'intact' || view.block.state === 'cracked')) {
          this.tapBlock(view.block.id);
          return;
        }
      } else {
        // solo mesh (gable / papan nama): cari view/sign terdekat
        const view = this.views.find((v) => v.solo === obj);
        if (view && (view.block.state === 'intact' || view.block.state === 'cracked')) {
          this.tapBlock(view.block.id);
          return;
        }
        const sign = this.signMeshes.find((s) => s === obj);
        if (sign) {
          const sb = this.blocks.find((b) => b.mat === 'kayu' && b.anchored && b.cd < 0.6);
          if (sb) { this.tapBlock(sb.id); return; }
        }
      }
    }
  }

  private onVisibility = (): void => {
    if (document.hidden) this.cb.onAutoPause();
  };

  private attachListeners(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('visibilitychange', this.onVisibility);
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

  /* ============================== HUD & debug ============================== */

  private pushHud(): void {
    this.cb.onHud({
      score: this.score,
      pct: Math.round(progress(this.blocks) * 100),
      mult: activeMultiplier(this.combo, this.time),
      levelName: LEVELS[this.levelIdx]?.name ?? `Level ${this.levelIdx + 1}`,
      layers: layerCounts(this.blocks),
      grace: this.graceT > 0,
    });
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.last = performance.now();
  }

  get levelIndex(): number { return this.levelIdx; }

  /** Debug/playtest hooks (dipakai harness Playwright). */
  debugTap(id: number): void { this.tapBlock(id); }
  debugBlocks(): Block3D[] { return this.blocks; }
  debugBlockScreen(id: number): { x: number; y: number } | null {
    const v = this.instByView.get(id);
    if (!v) return null;
    const b = v.block;
    return this.worldToScreen(b.px, b.py + b.h / 2, b.pz);
  }
  debugReload(facadeHp: number): void { this.loadLevel(this.levelIdx, facadeHp); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const m of this.meshes) m.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.disposables.clear();
    this.renderer.dispose();
  }
}
