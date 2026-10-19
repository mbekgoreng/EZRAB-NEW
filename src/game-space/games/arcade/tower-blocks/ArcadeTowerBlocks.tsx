/**
 * ArcadeTowerBlocks ("Menara Lantai") — susun lantai gedung 3D (three.js).
 * Ketuk untuk menjatuhkan lantai yang meluncur; overhang terpotong,
 * puing jatuh, kamera naik mengikuti menara.
 */
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  dropBlock, slideSpeed, scoreForDrop, slabHue, SLIDE_RANGE,
  type Slab, type Axis,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('menara-lantai', 'best');
const FLOOR_H = 1;
const BASE_SLAB: Slab = { cx: 0, cz: 0, w: 3.4, d: 3.4 };

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface Debris {
  mesh: THREE.Mesh;
  vy: number;
  vx: number;
  vz: number;
  rx: number;
  rz: number;
}

interface Burst {
  alive: boolean;
  n: number;
  pos: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
}

function makeSkyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0b1226');
  grad.addColorStop(0.55, '#1b2b52');
  grad.addColorStop(0.8, '#4a3a5e');
  grad.addColorStop(1, '#8a5a44');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWindowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#8b98ab';
  g.fillRect(0, 0, 128, 128);
  // beton bertekstur
  g.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 40; i += 1) g.fillRect((i * 37) % 128, (i * 53) % 128, 3, 3);
  // jendela
  for (let r = 0; r < 3; r += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x = 8 + col * 30; const y = 12 + r * 40;
      const lit = (r * 7 + col * 3) % 3 !== 0;
      g.fillStyle = lit ? '#ffedb0' : '#2b3648';
      g.fillRect(x, y, 20, 26);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(x, y, 20, 4);
      g.strokeStyle = '#3a4353'; g.lineWidth = 2;
      g.strokeRect(x, y, 20, 26);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function ArcadeTowerBlocks({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ floors: 0, score: 0, best: getBest(BK, 0), combo: 0 });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const togglePauseRef = useRef((): void => {});
  togglePauseRef.current = (): void => {
    if (screenRef.current === 'play') setScreen('pause');
    else if (screenRef.current === 'pause') setScreen('play');
  };

  useEffect(() => {
    const mount = mountRef.current;
    const wrap = wrapRef.current;
    if (!mount) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';

    const scene = new THREE.Scene();
    scene.background = makeSkyTexture();
    scene.fog = new THREE.Fog(0x2a3550, 20, 46);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    const camTarget = new THREE.Vector3(0, 0.4, 0);
    const camPos = new THREE.Vector3(7.4, 6.2, 7.4);

    scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x9a7b55, 1.35));
    const sun = new THREE.DirectionalLight(0xffe8c4, 2.0);
    sun.position.set(8, 14, 6);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x7dd3fc, 0.5);
    fill.position.set(-8, 6, -6);
    scene.add(fill);

    // tanah proyek
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(34, 48),
      new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const grid = new THREE.GridHelper(68, 68, 0x465062, 0x30373f);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.4;
    grid.position.y = 0.02;
    scene.add(grid);

    // properti sekitar: peti material
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a5a28, roughness: 0.9 });
    const crateMat2 = new THREE.MeshStandardMaterial({ color: 0x6e441f, roughness: 0.9 });
    const crates: Array<[number, number, number, number]> = [
      [-5.4, 0.6, -3.2, 1.2], [-4.0, 0.45, -4.4, 0.9], [-4.7, 1.35, -3.8, 0.9],
      [5.6, 0.5, -2.6, 1.0], [4.6, 0.35, 3.8, 0.7],
    ];
    crates.forEach(([x, y, z, sc], i) => {
      const m = new THREE.Mesh(unitBox, i % 2 ? crateMat : crateMat2);
      m.scale.setScalar(sc);
      m.position.set(x, y, z);
      m.rotation.y = i * 0.7;
      scene.add(m);
    });

    const sideTex = makeWindowTexture();
    const slabMats: THREE.Material[] = [];
    const makeSlabMesh = (level: number): THREE.Mesh => {
      const hue = slabHue(level);
      const tint = new THREE.Color(`hsl(${hue},62%,80%)`);
      const side = new THREE.MeshStandardMaterial({ map: sideTex, color: tint, roughness: 0.8 });
      const top = new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${hue},38%,60%)`), roughness: 0.9 });
      slabMats.push(side, top);
      const mesh = new THREE.Mesh(unitBox, [side, side, top, top, side, side]);
      return mesh;
    };
    const placeSlabMesh = (mesh: THREE.Mesh, slab: Slab, level: number): void => {
      mesh.scale.set(Math.max(0.05, slab.w), FLOOR_H, Math.max(0.05, slab.d));
      mesh.position.set(slab.cx, level * FLOOR_H + FLOOR_H / 2, slab.cz);
    };

    // menara
    const tower: Slab[] = [{ ...BASE_SLAB }];
    const towerMeshes: THREE.Mesh[] = [];
    const baseMesh = makeSlabMesh(0);
    placeSlabMesh(baseMesh, BASE_SLAB, 0);
    scene.add(baseMesh);
    towerMeshes.push(baseMesh);

    // lantai yang meluncur
    let moving: Slab = { ...BASE_SLAB };
    let axis: Axis = 'x';
    let moveMesh: THREE.Mesh | null = null;
    let elapsed = 0;
    const spawnMoving = (): void => {
      const prev = tower[tower.length - 1];
      moving = { cx: prev.cx, cz: prev.cz, w: prev.w, d: prev.d };
      if (moveMesh) scene.remove(moveMesh);
      moveMesh = makeSlabMesh(tower.length);
      placeSlabMesh(moveMesh, moving, tower.length);
      scene.add(moveMesh);
    };
    spawnMoving();

    const debris: Debris[] = [];
    const dropDebris = (slab: Slab, level: number, fling: number): void => {
      const mesh = makeSlabMesh(level);
      placeSlabMesh(mesh, slab, level);
      scene.add(mesh);
      debris.push({
        mesh,
        vy: 1.2,
        vx: (Math.random() - 0.5) * fling,
        vz: (Math.random() - 0.5) * fling,
        rx: (Math.random() - 0.5) * 2,
        rz: (Math.random() - 0.5) * 2,
      });
    };

    // partikel debu (pool)
    const PMAX = 140;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(PMAX * 3);
    const pCol = new Float32Array(PMAX * 3);
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    const pMat = new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
    const points = new THREE.Points(pGeo, pMat);
    points.frustumCulled = false;
    scene.add(points);
    const parts: Burst = { alive: true, n: 0, pos: pPos, vel: new Float32Array(PMAX * 3), life: new Float32Array(PMAX), maxLife: new Float32Array(PMAX) };
    const tmpColor = new THREE.Color();
    const burst = (x: number, y: number, z: number, colors: string[], count: number, spread: number): void => {
      if (reduced) return;
      for (let i = 0; i < count; i += 1) {
        const idx = parts.n % PMAX;
        parts.n += 1;
        parts.pos[idx * 3] = x + (Math.random() - 0.5) * 0.6;
        parts.pos[idx * 3 + 1] = y;
        parts.pos[idx * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * spread;
        parts.vel[idx * 3] = Math.cos(a) * sp;
        parts.vel[idx * 3 + 1] = 2 + Math.random() * 4;
        parts.vel[idx * 3 + 2] = Math.sin(a) * sp;
        parts.life[idx] = parts.maxLife[idx] = 0.7 + Math.random() * 0.7;
        tmpColor.set(colors[(Math.random() * colors.length) | 0]);
        pCol[idx * 3] = tmpColor.r; pCol[idx * 3 + 1] = tmpColor.g; pCol[idx * 3 + 2] = tmpColor.b;
      }
    };

    // state game
    let score = 0;
    let combo = 0;
    let over = false;
    let shakeT = 0;
    let overTimer = -1;
    const push = (): void => {
      setHud({ floors: tower.length - 1, score, best: getBest(BK, 0), combo });
    };

    const doDrop = (): void => {
      if (screenRef.current !== 'play' || over || !moveMesh) return;
      sfx.ensure();
      // sinkronkan posisi logis dari mesh yang meluncur
      if (axis === 'x') moving.cx = moveMesh.position.x;
      else moving.cz = moveMesh.position.z;
      const prev = tower[tower.length - 1];
      const level = tower.length;
      const res = dropBlock({ prev, moving, axis });
      if (res.gameOver || !res.placed) {
        over = true;
        dropDebris(moving, level, 3.2);
        scene.remove(moveMesh);
        moveMesh = null;
        sfx.thud(1.3);
        if (!reduced) shakeT = 0.55;
        burst(moving.cx, level * FLOOR_H, moving.cz, ['#d6d3d1', '#a8a29e', '#78716c'], 40, 4);
        if (wrap) popText(wrap, '🏚️ LANTAI MELESET!', { size: 26, color: '#fca5a5' });
        const nb = setBest(BK, score);
        overTimer = 1.25;
        setHud({ floors: tower.length - 1, score, best: nb, combo: 0 });
        return;
      }
      // lantai bertahan
      placeSlabMesh(moveMesh, res.placed, level);
      tower.push(res.placed);
      towerMeshes.push(moveMesh);
      moveMesh = null;
      const pts = scoreForDrop(level, combo, res.perfect);
      score += pts;
      if (res.perfect) {
        combo += 1;
        sfx.chime(3, 660 + Math.min(combo, 8) * 40);
        if (wrap) popText(wrap, `✨ SEMPURNA! +${pts}`, { size: 24, color: '#fde047' });
        burst(res.placed.cx, level * FLOOR_H + 0.6, res.placed.cz, ['#fde047', '#fbbf24', '#fff7d6'], 30, 3);
      } else {
        combo = 0;
        sfx.pop(0.85);
        burst(res.placed.cx, level * FLOOR_H + 0.2, res.placed.cz, ['#d6d3d1', '#a8a29e'], 12, 2);
      }
      if (res.debris) dropDebris(res.debris, level, 2.0);
      axis = axis === 'x' ? 'z' : 'x';
      spawnMoving();
      push();
    };

    const reset = (): void => {
      for (let i = 1; i < towerMeshes.length; i += 1) scene.remove(towerMeshes[i]);
      tower.length = 1;
      towerMeshes.length = 1;
      for (const d of debris) scene.remove(d.mesh);
      debris.length = 0;
      if (moveMesh) scene.remove(moveMesh);
      score = 0; combo = 0; over = false; shakeT = 0; overTimer = -1; elapsed = 0;
      axis = 'x';
      spawnMoving();
      push();
    };
    (mount as unknown as { __reset?: () => void }).__reset = reset;
    (mount as unknown as { __drop?: () => void }).__drop = doDrop;

    const onPointer = (e: PointerEvent): void => {
      e.preventDefault();
      doDrop();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Space' || e.code === 'ArrowDown') { e.preventDefault(); doDrop(); }
      else if (e.code === 'Escape' || e.code === 'KeyP') togglePauseRef.current();
    };
    renderer.domElement.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);

    const resize = (): void => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    const clock = new THREE.Clock();
    let raf = 0;
    const camOffset = new THREE.Vector3(7.4, 6.2, 7.4);

    const animate = (): void => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const playing = screenRef.current === 'play';

      if (playing && !over) elapsed += dt;

      // lantai meluncur
      if (moveMesh && !over) {
        const prev = tower[tower.length - 1];
        const speed = slideSpeed(tower.length - 1);
        const range = SLIDE_RANGE;
        const cyc = 4 * range;
        const ph = (elapsed * speed) % cyc;
        const off = ph < 2 * range ? -range + ph : 3 * range - ph;
        const center = axis === 'x' ? prev.cx : prev.cz;
        if (axis === 'x') moveMesh.position.x = center + off;
        else moveMesh.position.z = center + off;
      }

      // puing jatuh
      for (let i = debris.length - 1; i >= 0; i -= 1) {
        const d = debris[i];
        d.vy -= 20 * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.z += d.vz * dt;
        d.mesh.rotation.x += d.rx * dt;
        d.mesh.rotation.z += d.rz * dt;
        if (d.mesh.position.y < camTarget.y - 14) {
          scene.remove(d.mesh);
          debris.splice(i, 1);
        }
      }

      // partikel
      let anyAlive = false;
      for (let i = 0; i < PMAX; i += 1) {
        if (parts.life[i] <= 0) {
          parts.pos[i * 3 + 1] = -999;
          continue;
        }
        anyAlive = true;
        parts.life[i] -= dt;
        parts.vel[i * 3 + 1] -= 9 * dt;
        parts.pos[i * 3] += parts.vel[i * 3] * dt;
        parts.pos[i * 3 + 1] += parts.vel[i * 3 + 1] * dt;
        parts.pos[i * 3 + 2] += parts.vel[i * 3 + 2] * dt;
        if (parts.life[i] <= 0) parts.pos[i * 3 + 1] = -999;
      }
      if (anyAlive || !reduced) {
        pGeo.attributes.position.needsUpdate = true;
        pGeo.attributes.color.needsUpdate = true;
      }

      // kamera mengikuti puncak menara
      const topY = (tower.length - 1) * FLOOR_H;
      const wantY = Math.max(0.4, topY - 1.6);
      camTarget.y += (wantY - camTarget.y) * (reduced ? 1 : Math.min(1, dt * 4));
      const sway = reduced ? 0 : Math.sin(elapsed * 0.25) * 0.35;
      camPos.set(7.4 + sway, 6.2 + topY * 0.12, 7.4 - sway * 0.6);
      camera.position.copy(camTarget).add(camPos);
      if (shakeT > 0 && !reduced) {
        shakeT -= dt;
        camera.position.x += (Math.random() - 0.5) * shakeT * 1.6;
        camera.position.y += (Math.random() - 0.5) * shakeT * 1.6;
      }
      camera.lookAt(camTarget.x, camTarget.y + 0.6, camTarget.z);

      if (overTimer > 0) {
        overTimer -= dt;
        if (overTimer <= 0) setScreen('over');
      }

      renderer.render(scene, camera);
    };
    animate();
    push();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      for (const m of slabMats) m.dispose();
      sideTex.dispose();
      pGeo.dispose();
      pMat.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startGame = (): void => {
    sfx.ensure();
    const m = mountRef.current as unknown as { __reset?: () => void } | null;
    m?.__reset?.();
    setScreen('play');
  };
  const doDropBtn = (): void => {
    const m = mountRef.current as unknown as { __drop?: () => void } | null;
    m?.__drop?.();
  };
  const toggleMute = (): void => {
    sfx.ensure();
    setMuted((mm) => {
      const next = !mm;
      if (sfx.muted !== next) sfx.toggleMute();
      return next;
    });
  };

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(10,18,32,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#0b1226', fontFamily: FONT }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(10,18,32,0.62)', border: '1px solid rgba(125,211,252,0.3)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>🏢 {hud.floors} lantai</div>
          <div style={{ fontSize: 12, marginTop: 2, opacity: 0.92 }}>
            Skor {hud.score.toLocaleString('id-ID')}
            {hud.combo >= 2 && <span style={{ color: '#7dd3fc', fontWeight: 900 }}> • ✨x{hud.combo}</span>}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>⭐ Terbaik: {hud.best.toLocaleString('id-ID')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {screen === 'play' && (
            <>
              <button style={btn} onClick={togglePauseRef.current} aria-label="Jeda">⏸</button>
              <button style={{ ...btn, width: 56, fontSize: 14, fontWeight: 900 }} onClick={doDropBtn} aria-label="Jatuhkan">⤵</button>
            </>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {screen === 'play' && (
        <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', zIndex: 5, pointerEvents: 'none' }}>
          <span style={{ background: 'rgba(10,18,32,0.6)', color: '#e2e8f0', fontSize: 13, padding: '8px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.18)' }}>
            👆 Ketuk layar / Spasi untuk menjatuhkan lantai
          </span>
        </div>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🏢</div>
          <h2 style={h2}>MENARA LANTAI</h2>
          <p style={p}>
            <b>Ketuk layar</b> untuk menjatuhkan lantai yang meluncur! Bagian yang <b>menonjol terpotong</b> jadi puing —
            menara makin langsing. <b>Pas sempurna</b> = bonus beruntun. Meleset total = proyek ambruk!
          </p>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Membangun</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>ISTIRAHAT</h2>
          <p style={p}>Crane-nya dimatikan dulu. Lantainya tidak ke mana-mana.</p>
          <button style={primaryBtn} onClick={togglePauseRef.current}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🏚️</div>
          <h2 style={h2}>PROYEK AMBRUK!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.floors} lantai</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Skor" value={hud.score.toLocaleString('id-ID')} />
            <Stat label="Terbaik" value={hud.best.toLocaleString('id-ID')} />
          </div>
          <button style={primaryBtn} onClick={startGame}>Bangun Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e2e8f0' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#94a3b8', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,10,20,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#16263f,#0a1220)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 14px' }}>
      <div style={{ fontSize: 11, opacity: 0.7, color: '#e2e8f0' }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>{value}</div>
    </div>
  );
}
