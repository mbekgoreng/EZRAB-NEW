/**
 * Lari Proyek 3D — Three.js engine (src/game-space/games/lari-proyek/LariProyekEngine.ts)
 *
 * Third-person endless runner ala Subway Surfers. Dumb renderer mirror of the
 * pure game logic (logic.ts): owns exactly one renderer, one scene, one
 * animation loop and its own listeners. dispose() tears everything down.
 *
 * Visual: stylized "professional casual game" — semua prosedural (tanpa aset
 * unduhan). Budget 60fps HP: DPR cap, partikel pooled (1 draw call), geometri &
 * material shared, shadow map secukupnya, detail fasad sebagian besar via
 * canvas texture.
 */

import * as THREE from 'three';
import {
  LANES, LANE_COUNT, GRAV, JUMP_V, ROLL_T, STAND_H, ROLL_H,
  SPAWN_Z, WARN_AHEAD, BATA_FALL_T, BATA_HOVER_Y, GRACE_T,
  mulberry32, createPlayer, stepPlayer, playerHeight,
  speedFor, gapFor, spawnRow, spawnHelmRow, checkHits, stepWorld,
  checkBataLanding, scoreFor,
  type Player, type Obstacle, type ObKind, type PlayerEvent,
} from './logic';

export interface HudState {
  score: number; best: number; helm: number; meters: number; kmh: number;
}

export interface GameOverInfo {
  score: number; best: number; helm: number; meters: number;
  reason: string; newBest: boolean;
}

export interface EngineCallbacks {
  onHud: (h: HudState) => void;
  onGameOver: (r: GameOverInfo) => void;
  onPopup: (text: string, color: string, xPct: number, yPct: number, size?: 'big' | 'small') => void;
  onPauseChange: (paused: boolean) => void;
}

type Phase = 'idle' | 'run' | 'dying' | 'over';

const QUIPS: Record<string, string> = {
  barier: 'Kesandung bekisting! RAB aman, dengkul tidak.',
  balok: 'Balok gantung 1, mandor 0. Safety briefing besok pagi jam 7.',
  barikade: 'Nabrak barikade! Kayak nabrak revisi klien — nggak bisa dilewatin.',
  bata: 'Ketiban bata! Helm proyeknya dipakai siapa?',
  ketiban: 'Ketiban bata! Helm proyeknya dipakai siapa?',
  rubble: 'Kesandung puing bata! Bersihin dulu baru lari.',
};

/** Milestone jarak: progresi jelas + humor estimator. */
const MILESTONES: { at: number; text: string; sub: string }[] = [
  { at: 100, text: '100m!', sub: 'Mandor mulai keringetan.' },
  { at: 250, text: '250m!', sub: 'Kecepatan naik — kayak revisi klien.' },
  { at: 500, text: '500m!', sub: 'Setengah kilo! RAB masih aman.' },
  { at: 1000, text: '1 KM!', sub: 'Mandor maraton! Kasih lembur.' },
  { at: 2000, text: '2 KM!', sub: 'Luar biasa! Deadline pasti kekejar.' },
  { at: 3500, text: '3,5 KM!', sub: 'Mandor legend! Naik gaji.' },
  { at: 5000, text: '5 KM!', sub: 'Sudah bisa gantiin tukang parkir.' },
];

/* ============================== canvas textures ============================== */

function makeTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function roadTexture(): THREE.CanvasTexture {
  return makeTex(256, 256, (g) => {
    g.fillStyle = '#41464e'; g.fillRect(0, 0, 256, 256);
    // noise aspal
    for (let i = 0; i < 900; i += 1) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    // retakan
    g.strokeStyle = 'rgba(20,22,26,0.55)'; g.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      g.beginPath();
      let x = Math.random() * 256; let y = Math.random() * 256;
      g.moveTo(x, y);
      for (let s = 0; s < 5; s += 1) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    // marka lajur: garis kuning putus-putus di x=1/3 & 2/3 (tile = 5m, dash 2m)
    g.fillStyle = '#f5c518';
    for (const fx of [256 / 3, (2 * 256) / 3]) {
      g.fillRect(fx - 4, 20, 8, 102); // dash 2m dari 5m
    }
    // garis tepi putih solid
    g.fillStyle = 'rgba(240,244,248,0.85)';
    g.fillRect(10, 0, 6, 256);
    g.fillRect(240, 0, 6, 256);
  });
}

function dirtTexture(): THREE.CanvasTexture {
  return makeTex(128, 128, (g) => {
    g.fillStyle = '#9a7c53'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i += 1) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? 'rgba(60,40,20,0.18)' : 'rgba(255,240,210,0.10)';
      const s = 1 + Math.random() * 3;
      g.fillRect(Math.random() * 128, Math.random() * 128, s, s);
    }
  });
}

function fenceTexture(): THREE.CanvasTexture {
  const t = makeTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = '#e8722a'; g.lineWidth = 7;
    for (let i = -128; i < 256; i += 24) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
      g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function facadeTexture(base: string, trim: string, balconies: boolean): THREE.CanvasTexture {
  return makeTex(256, 512, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 512);
    // variasi panel beton
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < 512; y += 64) g.fillRect(0, y, 256, 3);
    // grid jendela 4 x 8
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        const x = 18 + c * 58; const y = 26 + r * 58;
        const lit = Math.random() < 0.18;
        g.fillStyle = lit ? '#ffe9a3' : '#2b3a4d';
        g.fillRect(x, y, 40, 34);
        // refleksi langit di kaca
        g.fillStyle = lit ? 'rgba(255,255,255,0.35)' : 'rgba(160,200,235,0.30)';
        g.fillRect(x, y, 40, 10);
        g.strokeStyle = trim; g.lineWidth = 3;
        g.strokeRect(x, y, 40, 34);
        // AC outdoor di sebagian jendela
        if (Math.random() < 0.3) {
          g.fillStyle = '#8a939e';
          g.fillRect(x + 44, y + 8, 16, 20);
          g.fillStyle = '#5b6470';
          g.beginPath(); g.arc(x + 52, y + 18, 6, 0, Math.PI * 2); g.fill();
        }
      }
      // balkon: slab + railing tiap 2 lantai
      if (balconies && r % 2 === 0) {
        g.fillStyle = 'rgba(70,80,95,0.9)';
        g.fillRect(8, 26 + r * 58 + 36, 240, 8);
        g.strokeStyle = 'rgba(40,48,60,0.9)'; g.lineWidth = 2;
        for (let x = 10; x < 248; x += 12) {
          g.beginPath(); g.moveTo(x, 26 + r * 58 + 12); g.lineTo(x, 26 + r * 58 + 36); g.stroke();
        }
      }
    }
    // lantai dasar: pintu + kanopi ruko
    g.fillStyle = 'rgba(30,36,46,0.85)'; g.fillRect(0, 452, 256, 60);
    g.fillStyle = '#e8722a'; g.fillRect(30, 470, 70, 34);
    g.fillStyle = '#3b82f6'; g.fillRect(150, 470, 70, 34);
  });
}

function brickTexture(): THREE.CanvasTexture {
  return makeTex(64, 64, (g) => {
    g.fillStyle = '#b5542f'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#96421f';
    for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 3);
    for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 === 0 ? 0 : 16; x < 64; x += 32) g.fillRect(x, y, 3, 16);
    g.fillStyle = 'rgba(255,220,180,0.20)'; g.fillRect(0, 0, 64, 8);
  });
}

function stripeTexture(c1: string, c2: string): THREE.CanvasTexture {
  const t = makeTex(128, 32, (g) => {
    g.fillStyle = c1; g.fillRect(0, 0, 128, 32);
    g.fillStyle = c2;
    for (let x = -32; x < 160; x += 32) {
      g.beginPath();
      g.moveTo(x, 32); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, 32);
      g.closePath(); g.fill();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function barikadeTexture(): THREE.CanvasTexture {
  return makeTex(128, 256, (g) => {
    g.fillStyle = '#e8722a'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 4, 256); // gelombang seng
    // strip reflektif putih
    g.fillStyle = '#f8fafc'; g.fillRect(0, 60, 128, 26);
    g.fillStyle = '#f8fafc'; g.fillRect(0, 150, 128, 26);
    // chevron hazard bawah
    for (let x = -20; x < 148; x += 28) {
      g.fillStyle = '#1f2937';
      g.beginPath();
      g.moveTo(x, 256); g.lineTo(x + 14, 216); g.lineTo(x + 28, 216); g.lineTo(x + 14, 256);
      g.closePath(); g.fill();
    }
    g.fillStyle = '#1f2937';
    g.font = '900 22px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('AWAS', 64, 118);
    g.font = '900 15px system-ui, sans-serif';
    g.fillText('PROYEK', 64, 140);
  });
}

function cloudTexture(): THREE.CanvasTexture {
  return makeTex(128, 64, (g) => {
    g.clearRect(0, 0, 128, 64);
    const blob = (x: number, y: number, r: number) => {
      const gr = g.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    blob(40, 40, 26); blob(64, 32, 30); blob(90, 40, 24); blob(64, 44, 28);
  });
}

function glowTexture(): THREE.CanvasTexture {
  return makeTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,235,150,0.9)');
    gr.addColorStop(1, 'rgba(255,235,150,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
}

/** titik lembut netral untuk partikel debu (PointsMaterial map) */
function softDotTexture(): THREE.CanvasTexture {
  return makeTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
}

/* ============================== tiny synth sfx ============================== */

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  ensure(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.4;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { /* audio tidak tersedia — main tanpa suara */ }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) this.master.gain.setValueAtTime(this.muted ? 0 : 0.4, this.ctx.currentTime);
    return this.muted;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number, delay = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }

  click(): void { this.tone(620, 0.06, 'square', 0.12); }
  jump(): void { this.tone(280, 0.14, 'square', 0.16, 640); }
  land(): void { this.noise(0.09, 0.28, 420); }
  roll(): void { this.noise(0.22, 0.16, 1400); }
  lane(): void { this.noise(0.08, 0.08, 2400); }
  helm(): void { this.tone(880, 0.1, 'sine', 0.22); this.tone(1318, 0.14, 'sine', 0.2, undefined, 0.08); }
  warn(): void { this.tone(880, 0.09, 'square', 0.2); this.tone(880, 0.09, 'square', 0.2, undefined, 0.14); }
  milestone(): void {
    this.tone(523, 0.12, 'triangle', 0.25);
    this.tone(659, 0.12, 'triangle', 0.25, undefined, 0.1);
    this.tone(784, 0.2, 'triangle', 0.28, undefined, 0.2);
  }
  thud(): void { this.noise(0.16, 0.4, 300); this.tone(140, 0.18, 'sine', 0.3, 60); }
  crash(): void {
    this.noise(0.35, 0.5, 900);
    this.tone(160, 0.45, 'sawtooth', 0.32, 45);
    this.tone(90, 0.5, 'sine', 0.4, 35, 0.05);
  }
}

/* ============================== engine ============================== */

export class LariProyekEngine {
  static activeCount = 0;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;
  private cb: EngineCallbacks;
  private sfx = new Sfx();
  private raf = 0;
  private lastT = 0;
  private paused = false;
  private disposed = false;
  private ro: ResizeObserver | null = null;
  private time = 0;
  private disposables = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();

  // game state (mirror logic.ts)
  private phase: Phase = 'idle';
  private player: Player = createPlayer();
  private obstacles: Obstacle[] = [];
  private obMeshes = new Map<Obstacle, THREE.Group>();
  private distance = 0;
  private speed = 8;
  private runTime = 0;
  private helmCount = 0;
  private nextGap = 30;
  private helmTimer = 5;
  private lastHard = false;
  /** baris pertama spawn lebih dekat (z=-45) agar aksi cepat; habis setelah 3 baris */
  private closeRows = 0;
  private rng = mulberry32((Date.now() % 100000) | 0);
  private hitStop = 0;
  private deathT = 0;
  private deathReason = '';
  private gameOverSent = false;
  private shake = 0;
  private lastHud = '';
  private best = 0;
  private bestKey = 'gs2d:lari-proyek:best';
  private milestoneIdx = 0;

  // world recycling
  private segments: THREE.Group[] = [];
  private buildings: THREE.Group[] = [];
  private cranes: THREE.Group[] = [];
  private clouds: THREE.Mesh[] = [];
  private streaks: THREE.Mesh[] = [];

  // player rig
  private rig!: THREE.Group;
  private rollPivot!: THREE.Group;
  private bodyG!: THREE.Group;
  private thighL!: THREE.Group; private thighR!: THREE.Group;
  private shinL!: THREE.Group; private shinR!: THREE.Group;
  private armL!: THREE.Group; private armR!: THREE.Group;
  private foreL!: THREE.Group; private foreR!: THREE.Group;
  private torso!: THREE.Mesh;
  private helmet!: THREE.Group;
  private runPhase = 0;

  // pooled dust particles (1 draw call)
  private pGeo!: THREE.BufferGeometry;
  private pPos!: Float32Array;
  private pVel!: Float32Array;
  private pLife!: Float32Array;
  private pMax!: Float32Array;
  private pCount = 220;
  private pCursor = 0;

  // shared materials / geometries
  private matCache = new Map<string, THREE.Material>();

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    this.cb = callbacks;
    this.best = this.readBest();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const isMobile = Math.min(window.innerWidth, window.innerHeight) < 640;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.75 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // tone mapping sinematik (ACES) — di atas bar benchmark (tanpa tone mapping)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
    this.camera.position.set(0, 4.4, 7.4);

    this.buildLights();
    this.buildSky();
    this.buildEnvironment();
    this.buildPlayer();
    this.buildParticles();

    this.attachListeners();
    this.resize();
    LariProyekEngine.activeCount += 1;
    this.loop();
    // hook harness playtest: ?laridebug -> window.__lari (read-only observasi)
    try {
      if (typeof window !== 'undefined' && /[?&]laridebug/.test(window.location.search)) {
        (window as unknown as { __lari?: LariProyekEngine }).__lari = this;
      }
    } catch { /* abaikan */ }
  }

  /* ---------------- helpers ---------------- */

  private track<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(r: T): T {
    this.disposables.add(r);
    return r;
  }

  private mat(key: string, make: () => THREE.Material): THREE.Material {
    const hit = this.matCache.get(key);
    if (hit) return hit;
    const m = this.track(make());
    this.matCache.set(key, m);
    return m;
  }

  private std(color: number, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial {
    return this.mat(`std:${color}:${roughness}:${metalness}`, () =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness })) as THREE.MeshStandardMaterial;
  }

  private readBest(): number {
    try {
      const v = localStorage.getItem(this.bestKey);
      const n = v === null ? NaN : Number(v);
      return Number.isFinite(n) ? n : 0;
    } catch { return 0; }
  }

  private writeBest(v: number): void {
    try { localStorage.setItem(this.bestKey, String(v)); } catch { /* abaikan */ }
  }

  /* ---------------- lights & sky ---------------- */

  private buildLights(): void {
    // hemisphere: langit biru / tanah hangat
    this.scene.add(new THREE.HemisphereLight(0xbfdcff, 0xb08d5a, 0.85));

    // matahari + shadow nyata
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.1);
    sun.position.set(10, 17, 5);
    sun.target.position.set(0, 0, -8);
    sun.castShadow = true;
    const isMobile = Math.min(window.innerWidth, window.innerHeight) < 640;
    const sm = isMobile ? 1024 : 2048;
    sun.shadow.mapSize.set(sm, sm);
    sun.shadow.camera.left = -11;
    sun.shadow.camera.right = 11;
    sun.shadow.camera.top = 13;
    sun.shadow.camera.bottom = -13;
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 50;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);

    // bounce hangat dari arah berlawanan (tanpa shadow, murah)
    const bounce = new THREE.DirectionalLight(0xffd9a8, 0.35);
    bounce.position.set(-8, 6, 10);
    this.scene.add(bounce);

    this.scene.fog = new THREE.Fog(0xcfe3f2, 48, 130);
  }

  private buildSky(): void {
    // kubah langit gradien (canvas texture, BackSide)
    const skyTex = this.track(makeTex(4, 256, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#2f6fb8');   // zenith
      gr.addColorStop(0.55, '#7db8e8'); // tengah
      gr.addColorStop(0.8, '#cfe8f7');  // horizon
      gr.addColorStop(1, '#f6e8c8');    // hangat di kaki langit
      g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    }));
    const dome = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(220, 24, 16)),
      this.track(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })),
    );
    this.scene.add(dome);

    // matahari: cakram emissive + glow
    const sunDisc = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(7, 32)),
      this.track(new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false })),
    );
    sunDisc.position.set(38, 52, -180);
    sunDisc.lookAt(0, 4, 7);
    const glowTex = this.track(glowTexture());
    const sunGlow = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(34, 34)),
      this.track(new THREE.MeshBasicMaterial({
        map: glowTex, transparent: true, depthWrite: false, fog: false,
        blending: THREE.AdditiveBlending,
      })),
    );
    sunGlow.position.copy(sunDisc.position);
    sunGlow.lookAt(0, 4, 7);
    this.scene.add(sunDisc, sunGlow);

    // awan billboard
    const ct = this.track(cloudTexture());
    for (let i = 0; i < 9; i += 1) {
      const m = new THREE.Mesh(
        this.track(new THREE.PlaneGeometry(22 + Math.random() * 14, 9 + Math.random() * 5)),
        this.track(new THREE.MeshBasicMaterial({
          map: ct, transparent: true, depthWrite: false, fog: false, opacity: 0.9,
        })),
      );
      m.position.set((Math.random() - 0.5) * 220, 34 + Math.random() * 26, -120 - Math.random() * 60);
      this.scene.add(m);
      this.clouds.push(m);
    }
  }

  /* ---------------- environment (recycled) ---------------- */

  private SEG_LEN = 20;
  private SEG_N = 9;

  private buildEnvironment(): void {
    const roadTex = this.track(roadTexture());
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(1, 4); // tile 5m per segmen 20m
    const dirtTex = this.track(dirtTexture());
    dirtTex.wrapS = dirtTex.wrapT = THREE.RepeatWrapping;
    dirtTex.repeat.set(2, 8);
    const fenceTex = this.track(fenceTexture());
    fenceTex.repeat.set(3, 1);

    const roadGeo = this.track(new THREE.PlaneGeometry(7.6, this.SEG_LEN));
    const dirtGeo = this.track(new THREE.PlaneGeometry(7, this.SEG_LEN));
    const roadMat = this.track(new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.94 }));
    const dirtMat = this.track(new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1 }));
    const postGeo = this.track(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 8));
    const postMat = this.std(0x8a8f96, 0.6, 0.4);
    const panelGeo = this.track(new THREE.PlaneGeometry(6.4, 1.25));
    const panelMat = this.track(new THREE.MeshStandardMaterial({
      map: fenceTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.8,
    }));
    const coneGeo = this.track(new THREE.ConeGeometry(0.22, 0.55, 12));
    const coneMat = this.std(0xe8641f, 0.7);
    const bandGeo = this.track(new THREE.CylinderGeometry(0.155, 0.185, 0.12, 12));
    const bandMat = this.std(0xf8fafc, 0.5);
    const coneBaseGeo = this.track(new THREE.BoxGeometry(0.42, 0.06, 0.42));
    const coneBaseMat = this.std(0x9a3f12, 0.8);
    const manholeGeo = this.track(new THREE.CircleGeometry(0.35, 20));
    const manholeMat = this.std(0x2e3339, 0.7, 0.5);

    for (let i = 0; i < this.SEG_N; i += 1) {
      const seg = new THREE.Group();
      const zc = 12 - i * this.SEG_LEN - this.SEG_LEN / 2; // segmen 0 di depan kamera

      const road = new THREE.Mesh(roadGeo, roadMat);
      road.rotation.x = -Math.PI / 2;
      road.receiveShadow = true;
      seg.add(road);

      for (const sx of [-1, 1]) {
        const dirt = new THREE.Mesh(dirtGeo, dirtMat);
        dirt.rotation.x = -Math.PI / 2;
        dirt.position.set(sx * (3.8 + 3.5), 0.001, 0);
        dirt.receiveShadow = true;
        seg.add(dirt);

        // pagar proyek: tiang + panel mesh oranye
        for (let px = -3; px <= 3; px += 2) {
          const post = new THREE.Mesh(postGeo, postMat);
          post.position.set(sx * 5.4, 0.75, px * 3.1);
          post.castShadow = true;
          seg.add(post);
        }
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(sx * 5.4, 0.85, 0);
        panel.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        panel.castShadow = true;
        seg.add(panel);

        // traffic cone bergaris di tepi jalan (acak per segmen)
        const nCone = 2 + Math.floor(Math.random() * 3);
        for (let c = 0; c < nCone; c += 1) {
          const cone = new THREE.Group();
          const body = new THREE.Mesh(coneGeo, coneMat);
          body.position.y = 0.3; body.castShadow = true;
          const band = new THREE.Mesh(bandGeo, bandMat);
          band.position.y = 0.32;
          const base = new THREE.Mesh(coneBaseGeo, coneBaseMat);
          base.position.y = 0.03;
          cone.add(body, band, base);
          cone.position.set(sx * (3.3 + Math.random() * 0.5), 0, (Math.random() - 0.5) * 18);
          cone.rotation.y = Math.random() * Math.PI;
          seg.add(cone);
        }
      }

      // manhole sesekali
      if (Math.random() < 0.7) {
        const mh = new THREE.Mesh(manholeGeo, manholeMat);
        mh.rotation.x = -Math.PI / 2;
        mh.position.set((Math.random() - 0.5) * 5, 0.012, (Math.random() - 0.5) * 16);
        mh.receiveShadow = true;
        seg.add(mh);
      }

      seg.position.z = zc;
      this.scene.add(seg);
      this.segments.push(seg);
    }

    this.buildBuildings();
    this.buildCranes();
    this.buildStreaks();
  }

  private buildBuildings(): void {
    const variants = [
      facadeTexture('#b9c6d8', '#7c8aa0', true),
      facadeTexture('#d8c6ae', '#8a7a64', false),
      facadeTexture('#a9bccd', '#6f7f94', true),
    ].map((t) => this.track(t));
    const roofMat = this.std(0x6b7280, 0.95);
    const tankMat = this.std(0x3f8fbf, 0.5, 0.3);
    const tankLegMat = this.std(0x4b5563, 0.7);

    for (let i = 0; i < 12; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const grp = new THREE.Group();
      const w = 10 + Math.random() * 6;
      const h = 14 + Math.random() * 22;
      const dpt = 10 + Math.random() * 6;
      const tex = variants[i % 3];

      const body = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(w, h, dpt)),
        this.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })),
      );
      body.position.y = h / 2;
      grp.add(body);

      // dak atap + tandon air di sebagian gedung
      const slab = new THREE.Mesh(this.track(new THREE.BoxGeometry(w + 0.6, 0.5, dpt + 0.6)), roofMat);
      slab.position.y = h + 0.25;
      grp.add(slab);
      if (Math.random() < 0.6) {
        const tank = new THREE.Mesh(this.track(new THREE.CylinderGeometry(1.3, 1.3, 2.4, 14)), tankMat);
        tank.position.set((Math.random() - 0.5) * w * 0.5, h + 0.5 + 1.7, (Math.random() - 0.5) * dpt * 0.4);
        tank.castShadow = true;
        grp.add(tank);
        for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]] as const) {
          const leg = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.18, 1.0, 0.18)), tankLegMat);
          leg.position.set(tank.position.x + lx, h + 0.5 + 0.5, tank.position.z + lz);
          grp.add(leg);
        }
        const cap = new THREE.Mesh(this.track(new THREE.ConeGeometry(1.45, 0.7, 14)), this.std(0x2f6f9f, 0.6));
        cap.position.set(tank.position.x, tank.position.y + 1.55, tank.position.z);
        grp.add(cap);
      }

      // jaga muka dalam gedung >= 7.5m dari tengah agar tak menimpa pagar/jalan
      grp.position.set(side * (7.5 + w / 2 + Math.random() * 5), 0, 20 - Math.floor(i / 2) * 34 - Math.random() * 8);
      grp.rotation.y = side > 0 ? Math.PI : 0; // fasad menghadap jalan
      this.scene.add(grp);
      this.buildings.push(grp);
    }
  }

  private buildCranes(): void {
    const dark = this.std(0x3a4350, 0.7, 0.2);
    const cableMat = this.track(new THREE.MeshBasicMaterial({ color: 0x22262c }));
    for (let i = 0; i < 2; i += 1) {
      const crane = new THREE.Group();
      const H = 26;
      // tower: 4 tiang + cross brace sederhana
      for (const [tx, tz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) {
        const leg = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.22, H, 0.22)), dark);
        leg.position.set(tx, H / 2, tz);
        crane.add(leg);
      }
      for (let y = 2; y < H; y += 4) {
        const brace = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.3, 0.14, 0.14)), dark);
        brace.position.set(0, y, 0.5); brace.rotation.z = 0.6;
        const brace2 = brace.clone(); brace2.position.z = -0.5;
        crane.add(brace, brace2);
      }
      // kabin operator
      const cab = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.4, 1.4, 1.6)), dark);
      cab.position.set(0.9, H + 0.7, 0);
      crane.add(cab);
      // jib + counter-jib
      const jibGrp = new THREE.Group();
      jibGrp.position.y = H + 1.4;
      const jib = new THREE.Mesh(this.track(new THREE.BoxGeometry(16, 0.5, 0.5)), dark);
      jib.position.x = 7;
      const cjib = new THREE.Mesh(this.track(new THREE.BoxGeometry(5, 0.5, 0.5)), dark);
      cjib.position.x = -3.2;
      const weight = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.2, 1.6, 1)), dark);
      weight.position.set(-5.4, -0.6, 0);
      // apex + kabel penahan
      const apex = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.4, 2.6, 0.4)), dark);
      apex.position.y = 1.5;
      const stayGeo = this.track(new THREE.CylinderGeometry(0.03, 0.03, 1, 6));
      const stay1 = new THREE.Mesh(stayGeo, cableMat);
      stay1.scale.y = 9; stay1.position.set(7, 1.4, 0); stay1.rotation.z = 1.05;
      const stay2 = new THREE.Mesh(stayGeo, cableMat);
      stay2.scale.y = 5.4; stay2.position.set(-3.4, 1.4, 0); stay2.rotation.z = -1.0;
      // kabel gantung + hook + beban
      const cable = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.035, 0.035, 7, 6)), cableMat);
      cable.position.set(11, -3.5, 0);
      const hook = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.5, 0.7, 0.4)), this.std(0xd9a41b, 0.5, 0.6));
      hook.position.set(11, -7.2, 0);
      const load = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.2, 0.5, 0.9)), this.std(0x9aa3af, 0.8));
      load.position.set(11, -7.8, 0);
      jibGrp.add(jib, cjib, weight, apex, stay1, stay2, cable, hook, load);
      crane.add(jibGrp);
      crane.userData.jib = jibGrp;
      crane.userData.baseRotY = (i === 0 ? 0.5 : -0.4);

      crane.position.set(i === 0 ? -17 : 18, 0, -55 - i * 70);
      this.scene.add(crane);
      this.cranes.push(crane);
    }
  }

  /** garis kecepatan di tepi layar saat ngebut */
  private buildStreaks(): void {
    const geo = this.track(new THREE.BoxGeometry(0.05, 0.05, 3.2));
    const mat = this.track(new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
    }));
    for (let i = 0; i < 36; i += 1) {
      const s = new THREE.Mesh(geo, mat);
      const side = i % 2 === 0 ? -1 : 1;
      s.position.set(side * (4.5 + Math.random() * 5), 0.6 + Math.random() * 3.4, -40 + Math.random() * 50);
      s.userData.speed = 1;
      this.scene.add(s);
      this.streaks.push(s);
    }
    this.streakMat = mat;
  }
  private streakMat!: THREE.MeshBasicMaterial;

  /* ---------------- player: mandor stilasi ---------------- */

  private buildPlayer(): void {
    const skin = this.std(0xe8b088, 0.65);
    const pants = this.std(0x2b3648, 0.85);
    const shoe = this.std(0x6b3a1e, 0.8);
    const vest = this.std(0xf97316, 0.75);
    const stripe = this.mat('vestStripe', () => new THREE.MeshStandardMaterial({
      color: 0xfde047, emissive: 0xffd23f, emissiveIntensity: 0.85, roughness: 0.4,
    }));

    this.rig = new THREE.Group();      // posisi dunia (laneX, y, 0)
    this.rollPivot = new THREE.Group(); // pivot roll di y=0.45
    this.rollPivot.position.y = 0.45;
    const body = new THREE.Group();     // isi badan, offset -0.45
    body.position.y = -0.45;
    this.bodyG = body;
    this.rollPivot.add(body);
    this.rig.add(this.rollPivot);

    const add = (parent: THREE.Object3D, mesh: THREE.Mesh, x = 0, y = 0, z = 0): THREE.Mesh => {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const box = (w: number, h: number, d: number, m: THREE.Material) =>
      new THREE.Mesh(this.track(new THREE.BoxGeometry(w, h, d)), m);

    // --- kaki: paha (pivot pinggul y=0.95) -> lutut -> betis+sepatu
    const mkLeg = (sx: number) => {
      const thigh = new THREE.Group();
      thigh.position.set(sx * 0.14, 0.95, 0);
      add(thigh, box(0.2, 0.5, 0.24, pants), 0, -0.25, 0);
      const shin = new THREE.Group();
      shin.position.set(0, -0.5, 0);
      add(shin, box(0.17, 0.42, 0.2, pants), 0, -0.21, 0);
      add(shin, box(0.19, 0.14, 0.34, shoe), 0, -0.44, 0.06); // sepatu
      thigh.add(shin);
      body.add(thigh);
      return { thigh, shin };
    };
    const legL = mkLeg(-1); const legR = mkLeg(1);
    this.thighL = legL.thigh; this.shinL = legL.shin;
    this.thighR = legR.thigh; this.shinR = legR.shin;

    // --- torso: rompi oranye + 2 stripe reflektif emissive
    this.torso = box(0.52, 0.62, 0.34, vest);
    add(body, this.torso, 0, 1.28, 0);
    add(body, box(0.54, 0.09, 0.36, stripe), 0, 1.38, 0); // stripe dada
    add(body, box(0.54, 0.09, 0.36, stripe), 0, 1.18, 0); // stripe perut
    add(body, box(0.56, 0.1, 0.38, this.std(0x9a3412, 0.8)), 0, 0.99, 0); // sabuk

    // --- lengan: bahu (pivot y=1.52) -> siku -> lengan bawah+tangan
    const mkArm = (sx: number) => {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.34, 1.52, 0);
      add(arm, box(0.15, 0.34, 0.18, vest), 0, -0.17, 0); // lengan atas (rompi)
      add(arm, box(0.17, 0.08, 0.2, stripe), 0, -0.3, 0); // stripe lengan
      const fore = new THREE.Group();
      fore.position.set(0, -0.34, 0);
      add(fore, box(0.13, 0.3, 0.15, skin), 0, -0.15, 0);
      const hand = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.09, 10, 8)), skin);
      add(fore, hand, 0, -0.33, 0);
      arm.add(fore);
      body.add(arm);
      return { arm, fore };
    };
    const armL = mkArm(-1); const armR = mkArm(1);
    this.armL = armL.arm; this.foreL = armL.fore;
    this.armR = armR.arm; this.foreR = armR.fore;

    // --- kepala: wajah sederhana (mata, hidung)
    const head = new THREE.Group();
    head.position.set(0, 1.78, 0);
    const skull = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.21, 18, 14)), skin);
    skull.castShadow = true;
    head.add(skull);
    const eyeMat = this.std(0x1f2937, 0.4);
    const eyeGeo = this.track(new THREE.SphereGeometry(0.032, 8, 8));
    for (const ex of [-0.075, 0.075]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(ex, 0.03, -0.185); // menghadap -z (membelakangi kamera -> mata di belakang)
      head.add(eye);
    }
    const nose = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.035, 8, 8)), skin);
    nose.position.set(0, -0.03, -0.2);
    head.add(nose);
    // telinga
    const earGeo = this.track(new THREE.SphereGeometry(0.045, 8, 8));
    for (const ex of [-0.2, 0.2]) {
      const ear = new THREE.Mesh(earGeo, skin);
      ear.position.set(ex, 0, 0);
      head.add(ear);
    }
    body.add(head);

    // --- helm proyek KUNING BER-BRIM
    const helmet = new THREE.Group();
    const helmMat = this.mat('helmet', () => new THREE.MeshStandardMaterial({
      color: 0xfacc15, roughness: 0.35, metalness: 0.15,
    }));
    const dome = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.235, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)), helmMat);
    dome.scale.y = 0.82;
    dome.castShadow = true;
    helmet.add(dome);
    const brim = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.3, 0.32, 0.045, 20)), helmMat);
    brim.position.y = 0.01;
    brim.castShadow = true;
    helmet.add(brim);
    // ridge helm (ciri khas helm proyek)
    const ridge = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.09, 0.09, 0.4)), helmMat);
    ridge.position.y = 0.19;
    helmet.add(ridge);
    // strip reflektif helm
    const hStripe = new THREE.Mesh(this.track(new THREE.TorusGeometry(0.235, 0.018, 8, 24)), stripe);
    hStripe.rotation.x = Math.PI / 2;
    hStripe.position.y = 0.06;
    helmet.add(hStripe);
    helmet.position.set(0, 1.92, 0);
    body.add(helmet);
    this.helmet = helmet;

    // bayangan kaki: sedikit condong ke depan (pose lari)
    body.rotation.x = 0.08;

    this.rig.position.set(0, 0, 0);
    this.scene.add(this.rig);
  }

  /** animasi prosedural mandor tiap frame */
  private animatePlayer(dt: number): void {
    const p = this.player;
    this.rig.position.x = p.laneX;
    this.rig.position.y = p.y;

    if (this.phase === 'dying') {
      // tersandung: jatuh ke depan + helm mental
      const k = Math.min(1, this.deathT / 0.55);
      const ease = 1 - (1 - k) * (1 - k);
      this.rollPivot.rotation.x = -ease * 1.45;
      this.rollPivot.position.y = 0.45 - ease * 0.18;
      // helm mental
      const hk = Math.min(1, this.deathT / 0.8);
      this.helmet.position.y = 1.92 + hk * 1.4 - 4.9 * hk * hk * 0.5;
      this.helmet.position.z = -hk * 1.6;
      this.helmet.rotation.x = hk * 7;
      return;
    }

    // reset pose
    this.rollPivot.rotation.x = 0;
    this.rollPivot.position.y = 0.45;
    this.bodyG.scale.set(1, 1, 1);
    this.helmet.position.set(0, 1.92, 0);
    this.helmet.rotation.set(0, 0, 0);

    if (!p.grounded) {
      // lompat: kaki tekuk, tangan ke atas
      const airK = Math.min(1, Math.abs(p.vy) / JUMP_V);
      this.thighL.rotation.x = -0.85; this.thighR.rotation.x = -0.5;
      this.shinL.rotation.x = 1.1; this.shinR.rotation.x = 0.9;
      this.armL.rotation.x = -2.4 + airK * 0.3; this.armR.rotation.x = -2.1 - airK * 0.3;
      this.foreL.rotation.x = -0.5; this.foreR.rotation.x = -0.5;
      this.rollPivot.position.y = 0.45;
      this.rig.position.y = p.y;
    } else if (p.rolling) {
      // guling: salto depan + tuck (badan mengecil) agar tak tembus tanah
      const k = 1 - Math.max(0, p.rollT) / ROLL_T;
      this.rollPivot.rotation.x = -k * Math.PI * 2;
      const lift = Math.sin(k * Math.PI); // 0 -> 1 -> 0
      this.rollPivot.position.y = 0.45 + lift * 0.6;
      const tuck = 1 - lift * 0.38; // 1 -> 0.62 -> 1
      this.bodyG.scale.set(1, tuck, 1);
      // tuck: kaki & tangan rapat
      this.thighL.rotation.x = -1.4; this.thighR.rotation.x = -1.4;
      this.shinL.rotation.x = 1.8; this.shinR.rotation.x = 1.8;
      this.armL.rotation.x = -1.2; this.armR.rotation.x = -1.2;
      this.foreL.rotation.x = -1.4; this.foreR.rotation.x = -1.4;
    } else {
      // lari: ayunan bahu/siku/lutut via sin + bobbing
      this.runPhase += dt * (9 + this.speed * 0.55);
      const s = Math.sin(this.runPhase);
      const c = Math.sin(this.runPhase + Math.PI);
      this.thighL.rotation.x = s * 0.95;
      this.thighR.rotation.x = c * 0.95;
      this.shinL.rotation.x = Math.max(0, -Math.sin(this.runPhase - 0.7)) * 1.5;
      this.shinR.rotation.x = Math.max(0, -Math.sin(this.runPhase + Math.PI - 0.7)) * 1.5;
      this.armL.rotation.x = c * 0.8;
      this.armR.rotation.x = s * 0.8;
      this.foreL.rotation.x = -0.55 - Math.max(0, c) * 0.35;
      this.foreR.rotation.x = -0.55 - Math.max(0, s) * 0.35;
      // bobbing badan + goyang helm
      this.rollPivot.position.y = 0.45 + Math.abs(Math.cos(this.runPhase)) * 0.07;
      this.rig.rotation.z = Math.sin(this.runPhase) * 0.03;
    }
  }

  /* ---------------- obstacles: template cache ----------------
     Satu template per kind (geometri & material shared), tiap spawn = clone().
     Tanpa ini tiap spawn bikin puluhan geometry+texture baru (bocor GPU).
     Pengecualian: material ring telegraph bata dibuat per-instance karena
     opacity-nya dianimasikan per rintangan. */

  private obTemplates = new Map<ObKind, THREE.Group>();

  private obTemplate(kind: ObKind): THREE.Group {
    let t = this.obTemplates.get(kind);
    if (!t) {
      t = this.buildObstacleTemplate(kind);
      this.obTemplates.set(kind, t);
    }
    return t;
  }

  /** ref per-instance hasil clone: { ring?, ringMat?, brick?, spin?, glow?, beam? } */
  private resolveObRefs(m: THREE.Group): Record<string, THREE.Object3D | THREE.Material | undefined> {
    const refs: Record<string, THREE.Object3D | THREE.Material | undefined> = {};
    for (const n of ['obRing', 'obBrick', 'obSpin', 'obGlow', 'obBeam']) {
      const found = m.getObjectByName(n);
      if (found) refs[n] = found;
    }
    return refs;
  }

  private buildObstacleTemplate(kind: ObKind): THREE.Group {
    const grp = new THREE.Group();
    if (kind === 'barier') {
      const stripeTex = this.track(stripeTexture('#f97316', '#f8fafc'));
      const board = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(1.7, 0.42, 0.12)),
        this.track(new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 })),
      );
      board.position.y = 0.72;
      board.castShadow = true;
      grp.add(board);
      // papan kedua di bawah
      const board2 = board.clone();
      board2.position.y = 0.36;
      grp.add(board2);
      // kaki A
      const legMat = this.std(0x7c4a21, 0.8);
      for (const lx of [-0.7, 0.7]) {
        for (const lz of [-0.18, 0.18]) {
          const leg = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.09, 0.95, 0.09)), legMat);
          leg.position.set(lx + lz * 0.6, 0.42, lz);
          leg.rotation.z = -lz * 1.2;
          leg.castShadow = true;
          grp.add(leg);
        }
      }
    } else if (kind === 'balok') {
      // scaffold: 2 tiang + palang + rantai + balok chevron
      const poleMat = this.std(0x6b7280, 0.5, 0.6);
      for (const px of [-1.05, 1.05]) {
        const pole = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 10)), poleMat);
        pole.position.set(px, 1.3, 0);
        pole.castShadow = true;
        grp.add(pole);
        const foot = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.4, 0.08, 0.4)), poleMat);
        foot.position.set(px, 0.04, 0);
        grp.add(foot);
      }
      const cross = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.3, 0.09, 0.09)), poleMat);
      cross.position.y = 2.5;
      grp.add(cross);
      const chainMat = this.std(0x374151, 0.5, 0.7);
      for (const cx of [-0.65, 0.65]) {
        const chain = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 6)), chainMat);
        chain.position.set(cx, 2.1, 0);
        grp.add(chain);
      }
      const chevTex = this.track(stripeTexture('#f5c518', '#1f2937'));
      const beam = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(1.8, 0.7, 0.5)),
        this.track(new THREE.MeshStandardMaterial({ map: chevTex, roughness: 0.55, metalness: 0.25 })),
      );
      beam.position.y = 1.05 + 0.35; // yOff + h/2
      beam.castShadow = true;
      grp.add(beam);
      beam.name = 'obBeam';
    } else if (kind === 'barikade') {
      const tex = this.track(barikadeTexture());
      const panel = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(1.8, 2.2, 0.14)),
        this.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })),
      );
      panel.position.y = 1.2;
      panel.castShadow = true;
      grp.add(panel);
      const frameMat = this.std(0x4b5563, 0.6, 0.5);
      for (const fx of [-0.95, 0.95]) {
        const post = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.12, 2.4, 0.12)), frameMat);
        post.position.set(fx, 1.2, 0);
        post.castShadow = true;
        grp.add(post);
      }
      for (const fx of [-0.6, 0.6]) {
        const foot = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.5, 0.1, 0.7)), frameMat);
        foot.position.set(fx, 0.05, 0);
        grp.add(foot);
      }
    } else if (kind === 'bata') {
      // telegraph: ring merah pulsing di tanah
      const ring = new THREE.Mesh(
        this.track(new THREE.RingGeometry(0.55, 0.95, 28)),
        this.track(new THREE.MeshBasicMaterial({
          color: 0xef4444, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false,
        })),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      ring.name = 'obRing';
      grp.add(ring);
      // bata: box bata + bayangan
      const brick = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(1.0, 0.4, 1.0)),
        this.track(new THREE.MeshStandardMaterial({ map: this.track(brickTexture()), roughness: 0.85 })),
      );
      brick.castShadow = true;
      brick.position.y = BATA_HOVER_Y + 0.2;
      brick.visible = false;
      brick.name = 'obBrick';
      grp.add(brick);
    } else if (kind === 'helm') {
      // helm METALIK berputar + glow
      const helmMat = this.mat('helmPickup', () => new THREE.MeshStandardMaterial({
        color: 0xfacc15, roughness: 0.22, metalness: 0.75,
      }));
      const dome = new THREE.Mesh(
        this.track(new THREE.SphereGeometry(0.3, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
        helmMat,
      );
      dome.scale.y = 0.82;
      dome.castShadow = true;
      const brim = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.38, 0.4, 0.05, 18)), helmMat);
      brim.position.y = 0.01;
      const ridge = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.1, 0.1, 0.5)), helmMat);
      ridge.position.y = 0.24;
      const glow = new THREE.Mesh(
        this.track(new THREE.PlaneGeometry(1.5, 1.5)),
        this.track(new THREE.MeshBasicMaterial({
          map: this.track(glowTexture()), transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending,
        })),
      );
      const spin = new THREE.Group();
      spin.add(dome, brim, ridge);
      spin.name = 'obSpin';
      glow.name = 'obGlow';
      grp.add(spin, glow);
      grp.position.y = 1.1; // mkHelm: yOff = 1.1 (dioverride per-instance di addObstacle)
    }
    // template di origin; posisi per-instance dipasang saat clone di addObstacle
    return grp;
  }

  /* ---------------- pooled dust particles (1 draw call) ---------------- */

  private pCol!: Float32Array;

  private buildParticles(): void {
    this.pGeo = this.track(new THREE.BufferGeometry());
    this.pPos = new Float32Array(this.pCount * 3);
    this.pVel = new Float32Array(this.pCount * 3);
    this.pCol = new Float32Array(this.pCount * 3);
    this.pLife = new Float32Array(this.pCount);
    this.pMax = new Float32Array(this.pCount);
    for (let i = 0; i < this.pCount; i += 1) this.pPos[i * 3 + 1] = -999;
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const pMat = this.track(new THREE.PointsMaterial({
      size: 0.22, map: this.track(softDotTexture()), vertexColors: true,
      transparent: true, opacity: 0.85, depthWrite: false,
    }));
    const pts = new THREE.Points(this.pGeo, pMat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  private spawnP(x: number, y: number, z: number, n: number, color: number, spread: number, up: number, life: number): void {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k += 1) {
      const i = this.pCursor;
      this.pCursor = (this.pCursor + 1) % this.pCount;
      this.pPos[i * 3] = x + (Math.random() - 0.5) * 0.3;
      this.pPos[i * 3 + 1] = y + Math.random() * 0.2;
      this.pPos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
      this.pVel[i * 3] = (Math.random() - 0.5) * spread;
      this.pVel[i * 3 + 1] = Math.random() * up;
      this.pVel[i * 3 + 2] = Math.random() * spread * 0.8 + this.speed * 0.25;
      this.pCol[i * 3] = c.r * (0.85 + Math.random() * 0.3);
      this.pCol[i * 3 + 1] = c.g * (0.85 + Math.random() * 0.3);
      this.pCol[i * 3 + 2] = c.b * (0.85 + Math.random() * 0.3);
      this.pLife[i] = this.pMax[i] = life * (0.6 + Math.random() * 0.8);
    }
    this.pGeo.attributes.color.needsUpdate = true;
  }

  private stepParticles(dt: number): void {
    for (let i = 0; i < this.pCount; i += 1) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) { this.pPos[i * 3 + 1] = -999; continue; }
      this.pVel[i * 3 + 1] -= 6 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] = Math.max(0.03, this.pPos[i * 3 + 1] + this.pVel[i * 3 + 1] * dt);
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
    }
    this.pGeo.attributes.position.needsUpdate = true;
  }

  /* ---------------- input ---------------- */

  private input = { left: false, right: false, jump: false, roll: false };
  private touchStart: { x: number; y: number } | null = null;

  pressLeft(): void { this.input.left = true; }
  pressRight(): void { this.input.right = true; }
  pressJump(): void { this.input.jump = true; }
  pressRoll(): void { this.input.roll = true; }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.disposed || e.repeat) return;
    const k = e.code;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(k)) e.preventDefault();
    if (this.phase !== 'run' || this.paused) {
      if (k === 'Escape' || k === 'KeyP') this.togglePauseKey();
      return;
    }
    if (k === 'ArrowLeft' || k === 'KeyA') this.pressLeft();
    else if (k === 'ArrowRight' || k === 'KeyD') this.pressRight();
    else if (k === 'ArrowUp' || k === 'KeyW' || k === 'Space') this.pressJump();
    else if (k === 'ArrowDown' || k === 'KeyS') this.pressRoll();
    else if (k === 'Escape' || k === 'KeyP') this.togglePauseKey();
  };

  private togglePauseKey(): void {
    if (this.phase === 'run') this.setPaused(!this.paused);
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.touchStart = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.touchStart || this.disposed) return;
    if (this.phase !== 'run' || this.paused) { this.touchStart = null; return; }
    const dx = e.clientX - this.touchStart.x;
    const dy = e.clientY - this.touchStart.y;
    this.touchStart = null;
    const adx = Math.abs(dx); const ady = Math.abs(dy);
    if (Math.max(adx, ady) < 14) { this.pressJump(); return; } // tap = lompat
    if (adx > ady) { if (dx > 0) this.pressRight(); else this.pressLeft(); }
    else if (dy < 0) this.pressJump();
    else this.pressRoll();
  };

  private onVisibility = (): void => {
    if (document.hidden && this.phase === 'run' && !this.paused) this.setPaused(true);
  };

  private attachListeners(): void {
    window.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    this.canvas.addEventListener('pointerup', this.onPointerUp, { passive: true });
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

  /* ---------------- public control ---------------- */

  start(): void {
    // reset penuh
    for (const o of [...this.obMeshes.keys()]) this.removeObstacleMesh(o);
    this.obstacles = [];
    this.player = createPlayer();
    this.distance = 0;
    this.speed = speedFor(0);
    this.runTime = 0;
    this.helmCount = 0;
    // aksi cepat: rintangan pertama tiba ~7-8 dtk (bukan ~14 dtk); tetap di luar grace 2 dtk
    this.closeRows = 3;
    this.nextGap = this.speed * 1.2;
    this.helmTimer = 4;
    // baris helm pembuka lebih dekat (tiba ~6 dtk)
    for (const h of spawnHelmRow(this.rng)) { h.z += 25; this.addObstacle(h); }
    this.lastHard = false;
    this.rng = mulberry32((Date.now() % 100000) | 0);
    this.hitStop = 0;
    this.deathT = 0;
    this.deathReason = '';
    this.gameOverSent = false;
    this.shake = 0;
    this.runPhase = 0;
    this.milestoneIdx = 0;
    this.phase = 'run';
    this.paused = false;
    this.sfx.ensure();
    this.sfx.click();
    this.pushHud(true);
  }

  setPaused(p: boolean): void {
    if (this.phase !== 'run') return;
    this.paused = p;
    this.cb.onPauseChange(p);
  }

  isPaused(): boolean { return this.paused; }

  /** state ringkas untuk harness playtest (read-only observasi) */
  debugState(): Record<string, unknown> {
    return {
      phase: this.phase,
      runTime: +this.runTime.toFixed(2),
      distance: +this.distance.toFixed(1),
      speed: +this.speed.toFixed(2),
      obstacles: this.obstacles.length,
      lane: this.player.lane,
      laneX: +this.player.laneX.toFixed(2),
      y: +this.player.y.toFixed(2),
      rolling: this.player.rolling,
      grounded: this.player.grounded,
      helm: this.helmCount,
      shake: +this.shake.toFixed(3),
      closeRows: this.closeRows,
      nextGap: +this.nextGap.toFixed(1),
    };
  }

  toggleMute(): boolean {
    this.sfx.ensure();
    return this.sfx.toggleMute();
  }

  /* ---------------- gameplay ---------------- */

  private addObstacle(o: Obstacle): void {
    this.obstacles.push(o);
    const mesh = this.obTemplate(o.kind).clone();
    mesh.position.set(LANES[o.lane], o.kind === 'helm' ? o.yOff : 0, o.z);
    const refs = this.resolveObRefs(mesh);
    if (o.kind === 'bata') {
      // ring telegraph: material per-instance (opacity dianimasikan per rintangan)
      const ring = refs.obRing as THREE.Mesh | undefined;
      if (ring) {
        const ringMat = (ring.material as THREE.MeshBasicMaterial).clone();
        ring.material = ringMat;
        refs.obRingMat = ringMat;
      }
    }
    mesh.userData.refs = refs;
    this.scene.add(mesh);
    this.obMeshes.set(o, mesh);
  }

  /** buang mesh rintangan + material per-instance (ring bata) */
  private removeObstacleMesh(o: Obstacle): void {
    const m = this.obMeshes.get(o);
    if (m) {
      const refs = m.userData.refs as Record<string, THREE.Object3D | THREE.Material | undefined> | undefined;
      const ringMat = refs?.obRingMat as THREE.Material | undefined;
      if (ringMat) { ringMat.dispose(); this.disposables.delete(ringMat); }
      this.scene.remove(m);
      this.obMeshes.delete(o);
    }
  }

  private popupAt(text: string, color: string, x: number, y: number, z: number): void {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return;
    this.cb.onPopup(text, color, (v.x * 0.5 + 0.5) * 100, (-v.y * 0.5 + 0.5) * 100, 'big');
  }

  private die(reason: string): void {
    if (this.phase !== 'run') return;
    this.phase = 'dying';
    this.deathT = 0;
    this.hitStop = 0.06; // hit-stop 60ms
    this.deathReason = reason;
    this.player.dead = true;
    this.sfx.crash();
    this.shake = 0.8;
    const px = this.player.laneX;
    this.spawnP(px, 0.8, 0, 26, 0xd9a066, 5, 4, 0.9);
    this.spawnP(px, 0.5, 0, 12, 0xef4444, 4, 3, 0.7);
  }

  private sendGameOver(): void {
    const meters = Math.floor(this.distance);
    const score = scoreFor(meters, this.helmCount);
    const prev = this.best;
    const nb = Math.max(prev, score);
    this.writeBest(nb);
    this.best = nb;
    this.cb.onGameOver({
      score, best: nb, helm: this.helmCount, meters,
      reason: QUIPS[this.deathReason] ?? QUIPS.barier,
      newBest: score > prev && prev > 0,
    });
    this.pushHud(true);
  }

  private pushHud(force = false): void {
    const meters = Math.floor(this.distance);
    const h: HudState = {
      score: scoreFor(meters, this.helmCount),
      best: this.best,
      helm: this.helmCount,
      meters,
      kmh: Math.round(this.speed * 3.6),
    };
    const key = `${h.score}|${h.helm}|${h.meters}|${h.kmh}`;
    if (force || key !== this.lastHud) {
      this.lastHud = key;
      this.cb.onHud(h);
    }
  }

  private animateObstacle(o: Obstacle, m: THREE.Group, dt: number): void {
    const refs = (m.userData.refs ?? {}) as Record<string, THREE.Object3D | THREE.Material | undefined>;
    if (o.kind === 'helm') {
      const spin = refs.obSpin as THREE.Group | undefined;
      const glow = refs.obGlow as THREE.Mesh | undefined;
      if (spin) spin.rotation.y += dt * 3.2;
      m.position.y = o.yOff + Math.sin(this.time * 3 + o.z * 0.5) * 0.14;
      if (glow) glow.quaternion.copy(this.camera.quaternion);
    } else if (o.kind === 'bata') {
      const ring = refs.obRing as THREE.Mesh | undefined;
      const brick = refs.obBrick as THREE.Mesh | undefined;
      const mat = refs.obRingMat as THREE.MeshBasicMaterial | undefined;
      if (o.phase === 'warn' && mat) {
        mat.opacity = 0.45 + 0.35 * Math.sin(this.time * 16);
      } else if (mat) {
        mat.opacity = o.phase === 'fall' ? 0.6 : 0;
      }
      if (brick) {
        if (o.phase === 'warn') {
          brick.visible = true;
          brick.position.y = (o.brickY ?? BATA_HOVER_Y) + 0.2 + Math.sin(this.time * 30) * 0.08;
          brick.rotation.y += dt * 2;
        } else if (o.phase === 'fall') {
          brick.visible = true;
          brick.position.y = Math.max(0.2, (o.brickY ?? 0) + 0.2);
          brick.rotation.y += dt * 6;
        } else if (o.phase === 'rubble') {
          brick.visible = true;
          brick.position.y = 0.2;
          brick.rotation.set(0.15, 0.5, 0.28);
        } else {
          brick.visible = false;
        }
      }
    } else if (o.kind === 'balok') {
      const beam = refs.obBeam as THREE.Mesh | undefined;
      if (beam) beam.rotation.z = Math.sin(this.time * 2.2 + o.z) * 0.035;
    }
  }

  private scrollEnvironment(dt: number): void {
    const dz = this.speed * dt;
    // segmen jalan
    const span = this.SEG_N * this.SEG_LEN;
    for (const seg of this.segments) {
      seg.position.z += dz;
      if (seg.position.z - this.SEG_LEN / 2 > 14) seg.position.z -= span;
    }
    // gedung
    for (const b of this.buildings) {
      b.position.z += dz;
      if (b.position.z > 34) b.position.z -= 204;
    }
    // crane
    for (const c of this.cranes) {
      c.position.z += dz;
      if (c.position.z > 34) c.position.z -= 150;
      const jib = c.userData.jib as THREE.Group | undefined;
      if (jib) jib.rotation.y = (c.userData.baseRotY as number) + Math.sin(this.time * 0.12) * 0.35;
    }
    // awan melayang pelan
    for (const cl of this.clouds) {
      cl.position.x += dt * 0.7;
      if (cl.position.x > 130) cl.position.x = -130;
      cl.quaternion.copy(this.camera.quaternion);
    }
    // garis kecepatan
    const targetOp = THREE.MathUtils.clamp((this.speed - 11) / 11, 0, 0.5);
    this.streakMat.opacity += (targetOp - this.streakMat.opacity) * Math.min(1, dt * 3);
    if (this.streakMat.opacity > 0.01) {
      for (const s of this.streaks) {
        s.position.z += dz * 2.4;
        if (s.position.z > 8) {
          s.position.z = -42;
          const side = Math.random() < 0.5 ? -1 : 1;
          s.position.x = side * (4.5 + Math.random() * 5);
          s.position.y = 0.6 + Math.random() * 3.4;
        }
      }
    }
  }

  private dustT = 0;

  private update(dt: number): void {
    this.time += dt;

    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return; // hit-stop: dunia beku 60ms, tetap render
    }

    if (this.phase === 'dying') {
      this.deathT += dt;
      this.speed = Math.max(0, this.speed - dt * 26);
      this.scrollEnvironment(dt);
      this.animatePlayer(dt);
      this.stepParticles(dt);
      if (this.deathT > 1.05 && !this.gameOverSent) {
        this.gameOverSent = true;
        this.phase = 'over';
        this.sendGameOver();
      }
      return;
    }

    if (this.phase !== 'run' || this.paused) return;

    // --- input -> pemain
    const inp = { ...this.input };
    this.input.left = this.input.right = this.input.jump = this.input.roll = false;
    const pevs: PlayerEvent[] = stepPlayer(this.player, dt, inp);
    for (const e of pevs) {
      if (e === 'jump') {
        this.sfx.jump();
        this.spawnP(this.player.laneX, 0.1, 0.3, 5, 0xcbb894, 2.5, 1.6, 0.4);
      } else if (e === 'land') {
        this.sfx.land();
        this.shake = Math.max(this.shake, 0.12);
        this.spawnP(this.player.laneX, 0.08, 0.3, 10, 0xcbb894, 3.5, 2, 0.55);
      } else if (e === 'roll') {
        this.sfx.roll();
        this.spawnP(this.player.laneX, 0.3, 0.2, 6, 0xd8c49a, 3, 1.5, 0.4);
      } else if (e === 'slam') {
        this.sfx.land();
      } else if (e === 'lane') {
        this.sfx.lane();
      }
    }

    // --- dunia maju
    this.speed = speedFor(this.distance);
    this.distance += this.speed * dt;
    this.runTime += dt;

    // --- milestone progresi
    if (this.milestoneIdx < MILESTONES.length && this.distance >= MILESTONES[this.milestoneIdx].at) {
      const ms = MILESTONES[this.milestoneIdx];
      this.milestoneIdx += 1;
      this.sfx.milestone();
      this.cb.onPopup(ms.text, '#fde047', 50, 20, 'big');
      this.cb.onPopup(ms.sub, '#e2e8f0', 50, 28, 'small');
    }

    // --- spawn (rintangan pertama tiba ~7-8 dtk: di luar grace 2 dtk)
    if (this.runTime > 1.0) {
      this.nextGap -= this.speed * dt;
      if (this.nextGap <= 0) {
        const { obstacles, hard } = spawnRow({ rng: this.rng, distanceM: this.distance, lastHard: this.lastHard });
        this.lastHard = hard;
        for (const o of obstacles) {
          if (this.closeRows > 0) o.z = -45; // baris pembuka lebih dekat
          this.addObstacle(o);
        }
        if (this.closeRows > 0) this.closeRows -= 1;
        this.nextGap = gapFor(this.speed, this.distance, this.rng);
      }
      this.helmTimer -= dt;
      if (this.helmTimer <= 0) {
        this.helmTimer = 6 + this.rng() * 4;
        for (const h of spawnHelmRow(this.rng)) this.addObstacle(h);
      }
    }

    // --- step rintangan + event bata
    const wevs = stepWorld(this.obstacles, dt, this.speed);
    for (const we of wevs) {
      const lx = LANES[we.obstacle.lane];
      if (we.kind === 'bataWarn') {
        this.sfx.warn();
      } else {
        this.sfx.thud();
        this.shake = Math.max(this.shake, 0.3);
        this.spawnP(lx, 0.25, we.obstacle.z, 16, 0xb5542f, 4.5, 3, 0.7);
        this.spawnP(lx, 0.15, we.obstacle.z, 8, 0xcbb894, 3, 2, 0.6);
        if (checkBataLanding(this.player, we.obstacle)) this.die('ketiban');
      }
    }

    // --- sinkron mesh + animasi + buang yang mati
    for (let i = this.obstacles.length - 1; i >= 0; i -= 1) {
      const o = this.obstacles[i];
      const m = this.obMeshes.get(o);
      if (o.dead) {
        this.removeObstacleMesh(o);
        this.obstacles.splice(i, 1);
        continue;
      }
      if (m) {
        m.position.z = o.z;
        this.animateObstacle(o, m, dt);
      }
    }

    // --- tabrakan (grace 2 dtk di dalam checkHits)
    if (this.phase === 'run') {
      const hit = checkHits(this.player, this.obstacles, this.runTime);
      if (hit) {
        if (hit.kind === 'helm') {
          this.helmCount += 1;
          this.sfx.helm();
          const hx = LANES[hit.obstacle.lane];
          this.popupAt('+50', '#fde047', hx, 1.7, 0);
          this.spawnP(hx, 1.2, 0, 12, 0xfde047, 3, 2.5, 0.6);
        } else {
          this.die(hit.obstacle.kind);
        }
      }
    }

    // --- debu lari
    this.dustT -= dt;
    if (this.dustT <= 0 && this.player.grounded && !this.player.rolling) {
      this.dustT = 0.07;
      this.spawnP(this.player.laneX + (Math.random() - 0.5) * 0.4, 0.06, 0.6, 2, 0xcbb894, 1.6, 1.2, 0.5);
    }

    this.scrollEnvironment(dt);
    this.animatePlayer(dt);
    this.stepParticles(dt);
    this.pushHud();
  }

  /* ---------------- render loop ---------------- */

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;

    if (!this.paused) this.update(dt);

    // kamera: di belakang pemain, sedikit ikut lajur + shake + FOV kick
    const p = this.player;
    const shX = (Math.random() - 0.5) * this.shake * 0.5;
    const shY = (Math.random() - 0.5) * this.shake * 0.35;
    this.shake *= Math.exp(-6 * dt);
    if (this.shake < 0.001) this.shake = 0;
    this.camera.position.set(p.laneX * 0.35 + shX, 4.4 + shY, 7.4);
    this.camera.lookAt(p.laneX * 0.3, 1.0, -12);
    const targetFov = 62 + THREE.MathUtils.clamp((this.speed - 8) / 14, 0, 1) * 7;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 2);
      this.camera.updateProjectionMatrix();
    }

    this.renderer.render(this.scene, this.camera);
  };

  /* ---------------- dispose ---------------- */

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    LariProyekEngine.activeCount = Math.max(0, LariProyekEngine.activeCount - 1);
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.pGeo?.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.disposables.clear();
    this.matCache.clear();
    this.obMeshes.clear();
    this.renderer.dispose();
  }
}
