/**
 * EcosystemScene — visualisasi 3D interaktif ekosistem EZRAB (Three.js langsung).
 * ============================================================================
 * "The Construction Intelligence Hub": maket gedung isometrik di tengah meja
 * blueprint, dikelilingi node modul yang dihubungkan jalur data bercahaya.
 *
 * - Gedung: fondasi + 3 lantai (kolom, balok, pelat, sebagian dinding),
 *   animasi pembentukan bertahap (replayable), wireframe → solid.
 * - 8 node: DED→RAB AI, AI Chat, QTO, Kalkulator Volume, RAB & Estimasi,
 *   AHSP 2026, Database Harga, Laporan.
 * - Koneksi CatmullRom: DED→QTO→RAB→Laporan (utama), AHSP/Harga→RAB
 *   (referensi), Kalkulator→QTO, AI Chat→RAB (pendukung, putus-putus).
 * - Interaksi: hover (membesar + sorot jalur + kartu info), klik (panel detail).
 * - Label memakai HTML (tajam) yang diproyeksikan tiap frame.
 * - Hormati prefers-reduced-motion; pause saat tab/layar tidak aktif;
 *   dispose bersih saat unmount.
 */
import * as THREE from 'three';

export interface EcoNode {
  id: string;
  name: string;
  desc: string;
  role: string;
  tier: 'ai' | 'core' | 'data' | 'output';
  color: number;
  pos: [number, number, number];
}

export interface EcoLink {
  from: string;
  to: string;
  kind: 'main' | 'ref' | 'support';
  lift: number;
}

export const ECO_NODES: EcoNode[] = [
  { id: 'ded-ai', name: 'DED → RAB AI', desc: 'AI membaca gambar kerja dan mengusulkan draft item pekerjaan.', role: 'AI — membaca desain', tier: 'ai', color: 0xa855f7, pos: [-9.5, 4.2, -4.5] },
  { id: 'chat-ai', name: 'AI Chat', desc: 'Asisten percakapan untuk pertanyaan estimasi dan navigasi fitur.', role: 'AI — pendamping', tier: 'ai', color: 0xa855f7, pos: [9.5, 4.6, -5] },
  { id: 'qto', name: 'Quantity Take-Off', desc: 'Ukur dari gambar kerja menjadi daftar volume pekerjaan.', role: 'Proses inti', tier: 'core', color: 0x3b82f6, pos: [-10.5, 1.6, 2.5] },
  { id: 'kalkulator', name: 'Kalkulator Volume', desc: '24 kalkulator parametrik bergambar untuk tiap jenis pekerjaan.', role: 'Proses inti', tier: 'core', color: 0x3b82f6, pos: [-6, 1.1, 7.5] },
  { id: 'rab', name: 'RAB & Estimasi', desc: 'Susun RAB, BOQ, dan rekapitulasi dalam satu alur.', role: 'Proses inti', tier: 'core', color: 0x3b82f6, pos: [7.5, 1.6, 6.5] },
  { id: 'ahsp', name: 'AHSP 2026', desc: '5.792 item analisa harga satuan resmi sebagai acuan.', role: 'Data referensi', tier: 'data', color: 0x14b8a6, pos: [-4.5, 1.1, -9.5] },
  { id: 'harga', name: 'Database Harga', desc: 'Harga material, upah, dan alat milik Anda sendiri.', role: 'Data referensi', tier: 'data', color: 0x14b8a6, pos: [5, 1.1, -9.5] },
  { id: 'laporan', name: 'Laporan', desc: 'Export Excel & PDF: RAB, BOQ, rekapitulasi.', role: 'Output', tier: 'output', color: 0xf59e0b, pos: [10.5, 2.2, 0.5] },
];

export const ECO_LINKS: EcoLink[] = [
  { from: 'ded-ai', to: 'qto', kind: 'main', lift: 2.2 },
  { from: 'qto', to: 'rab', kind: 'main', lift: 2.6 },
  { from: 'rab', to: 'laporan', kind: 'main', lift: 1.8 },
  { from: 'ahsp', to: 'rab', kind: 'ref', lift: 1.6 },
  { from: 'harga', to: 'rab', kind: 'ref', lift: 1.6 },
  { from: 'kalkulator', to: 'qto', kind: 'main', lift: 1.4 },
  { from: 'chat-ai', to: 'rab', kind: 'support', lift: 2.4 },
];

const KIND_COLOR: Record<EcoLink['kind'], number> = {
  main: 0x3b82f6,
  ref: 0x14b8a6,
  support: 0xa855f7,
};

interface BuildPart {
  obj: THREE.Object3D;
  mats: THREE.Material[];
  delay: number;
  dur: number;
}

export interface EcosystemSceneCallbacks {
  onHoverNode: (id: string | null) => void;
  onSelectNode: (id: string | null) => void;
  onProjectLabels: (items: { id: string; x: number; y: number; visible: boolean }[]) => void;
}

export class EcosystemScene {
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera!: THREE.PerspectiveCamera;
  private container!: HTMLElement;
  private raf = 0;
  private running = false;
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-10, -10);
  private cb: EcosystemSceneCallbacks;

  private nodeMeshes = new Map<string, THREE.Group>();
  private nodeCores = new Map<string, THREE.Mesh>();
  private nodeHitProxies: THREE.Mesh[] = [];
  private linkMeshes: { mesh: THREE.Line | THREE.Mesh; link: EcoLink; curve: THREE.CatmullRomCurve3; mat: THREE.Material }[] = [];
  private pulses: { mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; t: number; speed: number }[] = [];
  private buildParts: BuildPart[] = [];
  private buildT = 0;
  private buildDur = 4.2;
  private building!: THREE.Group;
  private dimGroup!: THREE.Group;
  private particles!: THREE.Points;

  private hovered: string | null = null;
  private selected: string | null = null;
  private reducedMotion = false;
  private parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  private baseCamPos = new THREE.Vector3(16, 11, 16);
  private disposed = false;
  private lastLabelPush = 0;
  private lastLabelKey = '';

  constructor(container: HTMLElement, cb: EcosystemSceneCallbacks) {
    this.container = container;
    this.cb = cb;
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  init(): boolean {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return false;
    }
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 520;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    this.container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.Fog(0x0b1226, 34, 70);
    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 200);
    this.camera.position.copy(this.baseCamPos);
    this.camera.lookAt(0, 2.4, 0);

    this.scene.add(new THREE.AmbientLight(0x8fb4ff, 0.85));
    const dir = new THREE.DirectionalLight(0xdbeafe, 1.1);
    dir.position.set(10, 18, 8);
    this.scene.add(dir);

    this.buildGround();
    this.buildBuilding();
    this.buildNodes();
    this.buildLinks();
    this.buildParticles();

    if (this.reducedMotion) {
      this.buildT = 1; // langsung tampil utuh
      this.applyBuild(1);
    }

    this.bindEvents();
    this.running = true;
    this.clock.start();
    this.loop();
    return true;
  }

  // ---- Ground: meja blueprint -------------------------------------------
  private buildGround() {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(17, 64),
      new THREE.MeshBasicMaterial({ color: 0x0d1528, transparent: true, opacity: 0.92 })
    );
    disc.rotation.x = -Math.PI / 2;
    this.scene.add(disc);

    const grid = new THREE.GridHelper(34, 34, 0x274b73, 0x16283f);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    grid.position.y = 0.01;
    this.scene.add(grid);

    // Cincin blueprint di sekitar gedung (digambar progresif)
    const ringPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.cos(a) * 5.2, 0.02, Math.sin(a) * 5.2));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
    const ringMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 });
    const ring = new THREE.Line(ringGeo, ringMat);
    this.scene.add(ring);
    this.buildParts.push({ obj: ring, mats: [ringMat], delay: 0, dur: 0.8 });
    (ring as any).userData.isDrawRange = true;
  }

  // ---- Gedung ------------------------------------------------------------
  private buildBuilding() {
    this.building = new THREE.Group();
    const wireMat = (op: number) =>
      new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: op });
    const solidMat = (color: number, op: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op });

    const addPart = (obj: THREE.Object3D, delay: number, dur = 0.5) => {
      const mats: THREE.Material[] = [];
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if ((m as any).material) {
          const mm = (m as any).material as THREE.Material;
          mats.push(mm);
          mm.transparent = true;
          mm.opacity = 0;
        }
      });
      // garis blueprint selalu terlihat samar
      obj.traverse((o) => {
        if ((o as any).isLineSegments) {
          const mm = ((o as THREE.LineSegments).material as THREE.Material);
          mm.transparent = true;
        }
      });
      this.building.add(obj);
      this.buildParts.push({ obj, mats, delay, dur });
    };

    // Fondasi
    const found = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.6, 6.4), solidMat(0x1d3a5f, 0.95));
    found.position.y = 0.3;
    const foundEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(found.geometry), wireMat(0.9)
    );
    foundEdges.position.copy(found.position);
    const foundG = new THREE.Group();
    foundG.add(found, foundEdges);
    addPart(foundG, 0.1);

    // Lantai: pelat + kolom + balok
    const floorY = [1.5, 3.3, 5.1];
    floorY.forEach((y, fi) => {
      const g = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.32, 5.2), solidMat(0x274d78, 0.9));
      slab.position.y = y;
      g.add(slab, new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), wireMat(0.85)).translateY(y));

      // Kolom di 4 sudut
      const colGeo = new THREE.BoxGeometry(0.32, 1.8, 0.32);
      [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]].forEach(([cx, cz]) => {
        const col = new THREE.Mesh(colGeo, solidMat(0x3b6ea5, 0.92));
        col.position.set(cx, y + 1.05, cz);
        g.add(col, new THREE.LineSegments(new THREE.EdgesGeometry(colGeo), wireMat(0.8)).translateX(cx).translateY(y + 1.05).translateZ(cz));
      });

      // Balok tepi
      const beamGeoX = new THREE.BoxGeometry(5.2, 0.28, 0.28);
      const beamGeoZ = new THREE.BoxGeometry(0.28, 0.28, 5.2);
      [[0, -2.3, beamGeoX], [0, 2.3, beamGeoX]].forEach(([bx, bz, geo]) => {
        const beam = new THREE.Mesh(geo as THREE.BufferGeometry, solidMat(0x3b6ea5, 0.9));
        beam.position.set(bx as number, y + 1.9, bz as number);
        g.add(beam);
      });
      [[-2.3, 0], [2.3, 0]].forEach(([bx, bz]) => {
        const beam = new THREE.Mesh(beamGeoZ, solidMat(0x3b6ea5, 0.9));
        beam.position.set(bx as number, y + 1.9, bz as number);
        g.add(beam);
      });

      // Dinding sebagian (sisi terbuka agar struktur terlihat)
      if (fi < 2) {
        const wallGeo = new THREE.BoxGeometry(5.2, 1.5, 0.18);
        const wall = new THREE.Mesh(wallGeo, solidMat(0x7fb2e8, 0.5));
        wall.position.set(0, y + 1.05, -2.5);
        g.add(wall, new THREE.LineSegments(new THREE.EdgesGeometry(wallGeo), wireMat(0.7)).translateY(y + 1.05).translateZ(-2.5));
      }
      addPart(g, 0.5 + fi * 0.7);
    });

    // Atap dak
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.3, 5.2), solidMat(0x274d78, 0.9));
    roof.position.y = 6.9;
    const roofG = new THREE.Group();
    roofG.add(roof, new THREE.LineSegments(new THREE.EdgesGeometry(roof.geometry), wireMat(0.85)).translateY(6.9));
    addPart(roofG, 2.7);

    this.scene.add(this.building);

    // Garis dimensi (muncul setelah bangunan jadi)
    this.dimGroup = new THREE.Group();
    const dimMat = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0 });
    const dimPts = [
      new THREE.Vector3(-3.4, 0.1, 3.4), new THREE.Vector3(-3.4, 7.2, 3.4),
      new THREE.Vector3(-3.7, 0.1, 3.4), new THREE.Vector3(-3.1, 0.1, 3.4),
      new THREE.Vector3(-3.7, 7.2, 3.4), new THREE.Vector3(-3.1, 7.2, 3.4),
    ];
    this.dimGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(dimPts), dimMat));
    this.scene.add(this.dimGroup);
    this.buildParts.push({ obj: this.dimGroup, mats: [dimMat], delay: 3.4, dur: 0.8 });
  }

  private applyBuild(t: number) {
    // t: 0..1 atas buildDur
    for (const p of this.buildParts) {
      const local = Math.min(1, Math.max(0, (t * this.buildDur - p.delay) / p.dur));
      const e = local * local * (3 - 2 * local);
      for (const m of p.mats) {
        const target = (m as any).userData.targetOp ?? 1;
        if ((m as any).userData.targetOp === undefined) {
          (m as any).userData.targetOp = m.opacity === 0 ? 1 : m.opacity;
        }
        m.opacity = (m as any).userData.targetOp * e;
      }
      const isDraw = (p.obj as any).userData.isDrawRange;
      if (isDraw) {
        const geo = ((p.obj as THREE.Line).geometry as THREE.BufferGeometry);
        const total = geo.getAttribute('position').count;
        geo.setDrawRange(0, Math.floor(total * e));
      }
      // scale-in halus untuk grup bangunan
      if (p.obj !== this.dimGroup && !(p.obj as any).userData.isDrawRange) {
        const s = 0.92 + 0.08 * e;
        p.obj.scale.set(s, e < 1 ? Math.max(0.01, e) : 1, s);
      }
    }
  }

  // ---- Node --------------------------------------------------------------
  private buildNodes() {
    for (const n of ECO_NODES) {
      const g = new THREE.Group();
      g.position.set(...n.pos);

      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.5),
        new THREE.MeshBasicMaterial({ color: n.color, transparent: true, opacity: 0.95 })
      );
      const wire = new THREE.LineSegments(
        new THREE.EdgesGeometry(core.geometry),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
      );
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.75, 0.85, 40),
        new THREE.MeshBasicMaterial({ color: n.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      // Proksi klik tak terlihat (lebih besar dari inti agar mudah diklik)
      const hitProxy = new THREE.Mesh(
        new THREE.SphereGeometry(1.15, 8, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hitProxy.userData.nodeId = n.id;
      // Halo selalu menghadap kamera → update tiap frame via lookAt
      g.add(core, wire, halo, hitProxy);
      g.userData = { id: n.id, halo, core, baseScale: 1 };
      core.userData.nodeId = n.id;
      this.scene.add(g);
      this.nodeMeshes.set(n.id, g);
      this.nodeCores.set(n.id, core);
      this.nodeHitProxies.push(hitProxy);

      // Tiang cahaya ke tanah
      const stemGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(n.pos[0], 0.05, n.pos[2]),
        new THREE.Vector3(n.pos[0], n.pos[1] - 0.6, n.pos[2]),
      ]);
      this.scene.add(new THREE.Line(stemGeo, new THREE.LineBasicMaterial({ color: n.color, transparent: true, opacity: 0.25 })));
    }
  }

  // ---- Koneksi ------------------------------------------------------------
  private nodePos(id: string): THREE.Vector3 {
    const n = ECO_NODES.find((x) => x.id === id)!;
    return new THREE.Vector3(...n.pos);
  }

  private buildLinks() {
    for (const link of ECO_LINKS) {
      const a = this.nodePos(link.from);
      const b = this.nodePos(link.to);
      const mid = a.clone().lerp(b, 0.5);
      mid.y = Math.max(a.y, b.y) + link.lift;
      const curve = new THREE.CatmullRomCurve3([a, mid, b]);
      const color = KIND_COLOR[link.kind];

      let mesh: THREE.Line | THREE.Mesh;
      let mat: THREE.Material;
      if (link.kind === 'support') {
        const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
        mat = new THREE.LineDashedMaterial({ color, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.55 });
        mesh = new THREE.Line(geo, mat);
        (mesh as THREE.Line).computeLineDistances();
      } else {
        const geo = new THREE.TubeGeometry(curve, 48, 0.035, 6, false);
        mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: link.kind === 'main' ? 0.75 : 0.5 });
        mesh = new THREE.Mesh(geo, mat);
      }
      this.scene.add(mesh);
      this.linkMeshes.push({ mesh, link, curve, mat });

      // Pulsa cahaya di jalur utama
      if (link.kind === 'main' && !this.reducedMotion) {
        const pulse = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 10, 10),
          new THREE.MeshBasicMaterial({ color: 0x22d3ee })
        );
        this.scene.add(pulse);
        this.pulses.push({ mesh: pulse, curve, t: Math.random(), speed: 0.12 + Math.random() * 0.08 });
      }
    }
  }

  private buildParticles() {
    const count = 110;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 6 + Math.random() * 12;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 9;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0x60a5fa, size: 0.08, transparent: true, opacity: 0.6 })
    );
    this.scene.add(this.particles);
  }

  // ---- Interaksi ----------------------------------------------------------
  private onPointerMove = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    if (e.pointerType === 'mouse' && !this.reducedMotion) {
      this.parallax.tx = this.pointer.x * 0.35;
      this.parallax.ty = this.pointer.y * 0.22;
    }
  };

  private onClick = () => {
    if (this.hovered) {
      this.selected = this.selected === this.hovered ? null : this.hovered;
      this.cb.onSelectNode(this.selected);
      this.refreshHighlights();
    } else if (this.selected) {
      this.selected = null;
      this.cb.onSelectNode(null);
      this.refreshHighlights();
    }
  };

  private refreshHighlights() {
    const active = this.hovered || this.selected;
    const related = new Set<string>();
    if (active) {
      related.add(active);
      for (const l of this.linkMeshes) {
        if (l.link.from === active || l.link.to === active) {
          related.add(l.link.from);
          related.add(l.link.to);
        }
      }
    }
    for (const [id, g] of this.nodeMeshes) {
      const on = !active || related.has(id);
      const core = g.userData.core as THREE.Mesh;
      (core.material as THREE.MeshBasicMaterial).opacity = on ? 0.95 : 0.35;
      const halo = g.userData.halo as THREE.Mesh;
      (halo.material as THREE.MeshBasicMaterial).opacity = on ? 0.35 : 0.1;
      const s = id === active ? 1.3 : 1;
      g.userData.baseScale = s;
    }
    for (const l of this.linkMeshes) {
      const isRel = !active || l.link.from === active || l.link.to === active;
      const m = l.mat as THREE.Material;
      m.transparent = true;
      m.opacity = isRel ? (l.link.kind === 'main' ? 0.85 : 0.6) : 0.12;
    }
  }

  private bindEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('click', this.onClick);
    el.style.cursor = 'pointer';
    el.style.touchAction = 'pan-y';
  }

  replay() {
    this.buildT = 0;
    if (this.reducedMotion) {
      this.buildT = 1;
      this.applyBuild(1);
    }
  }

  resetView() {
    this.selected = null;
    this.hovered = null;
    this.cb.onSelectNode(null);
    this.cb.onHoverNode(null);
    this.parallax.tx = 0;
    this.parallax.ty = 0;
    this.refreshHighlights();
  }

  // ---- Loop ---------------------------------------------------------------
  private loop = () => {
    if (!this.running || this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // Build animation
    if (this.buildT < 1 && !this.reducedMotion) {
      this.buildT = Math.min(1, this.buildT + dt / this.buildDur);
      this.applyBuild(this.buildT);
    }

    // Hover raycast (pakai proksi tak terlihat yang lebih besar)
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.nodeHitProxies, false);
    const hitId = hits.length > 0 ? (hits[0].object.userData.nodeId as string) : null;
    if (hitId !== this.hovered) {
      this.hovered = hitId;
      this.cb.onHoverNode(hitId);
      this.refreshHighlights();
    }

    // Node: rotasi pelan + halo menghadap kamera + scale lerp
    for (const [, g] of this.nodeMeshes) {
      const core = g.userData.core as THREE.Mesh;
      if (!this.reducedMotion) core.rotation.y += dt * 0.6;
      const halo = g.userData.halo as THREE.Mesh;
      halo.lookAt(this.camera.position);
      const s = g.userData.baseScale as number;
      const cur = g.scale.x;
      g.scale.setScalar(cur + (s - cur) * Math.min(1, dt * 10));
    }

    // Pulsa di jalur utama
    if (!this.reducedMotion) {
      for (const p of this.pulses) {
        p.t = (p.t + dt * p.speed) % 1;
        p.mesh.position.copy(p.curve.getPointAt(p.t));
      }
      // Partikel melayang pelan
      this.particles.rotation.y += dt * 0.015;
    }

    // Parallax kamera (desktop, mouse)
    this.parallax.x += (this.parallax.tx - this.parallax.x) * Math.min(1, dt * 3);
    this.parallax.y += (this.parallax.ty - this.parallax.y) * Math.min(1, dt * 3);
    this.camera.position.set(
      this.baseCamPos.x + this.parallax.x,
      this.baseCamPos.y + this.parallax.y,
      this.baseCamPos.z
    );
    this.camera.lookAt(0, 2.4, 0);

    // Proyeksi label HTML — throttle: maks ~8x/detik & hanya bila berubah.
    const now = performance.now();
    if (now - this.lastLabelPush > 120) {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      const items: { id: string; x: number; y: number; visible: boolean }[] = [];
      const v = new THREE.Vector3();
      let key = '';
      for (const n of ECO_NODES) {
        v.set(n.pos[0], n.pos[1] + 1.05, n.pos[2]).project(this.camera);
        const x = Math.round((v.x * 0.5 + 0.5) * w);
        const y = Math.round((-v.y * 0.5 + 0.5) * h);
        const visible = v.z < 1;
        items.push({ id: n.id, x, y, visible });
        key += `${x},${y},${visible ? 1 : 0};`;
      }
      if (key !== this.lastLabelKey) {
        this.lastLabelKey = key;
        this.lastLabelPush = now;
        this.cb.onProjectLabels(items);
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  resize() {
    if (!this.renderer) return;
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 520;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    const el = this.renderer?.domElement;
    if (el) {
      el.removeEventListener('pointermove', this.onPointerMove);
      el.removeEventListener('click', this.onClick);
    }
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      const mat = (m as any).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => { x.dispose(); });
      else if (mat) mat.dispose();
      const geo = (m as any).geometry as THREE.BufferGeometry | undefined;
      if (geo) geo.dispose();
    });
    this.renderer?.dispose();
    if (el && el.parentElement === this.container) this.container.removeChild(el);
  }
}
