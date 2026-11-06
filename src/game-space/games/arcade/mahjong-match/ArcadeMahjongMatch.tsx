/**
 * UBIN MATERIAL — Mahjong Match reskin konstruksi.
 * Cocokkan pasangan ubin material yang BEBAS (tidak tertimpa & sisi kiri/kanan terbuka).
 * Timer 5 menit, tombol kocok & petunjuk terbatas.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi } from '../../../engine2d';
import { sfx } from '../../../engine2d';
import { bestKey, setJson, getJson } from '../../../engine2d/best';
import {
  buildLayout, isFree, freePairs, remaining, isCleared, shuffleRemaining,
  countAvailablePairs, isDeadlocked, isStuck,
  mulberry, TILE_W, TILE_H, COLS, ROWS,
  type Tile,
} from './logic';

const SLUG = 'mahjong-match';
const LW = 390;
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;

const ARCADE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('arcade');

type Screen = 'ready' | 'play' | 'pause' | 'over';

interface Hud {
  left: number;
  score: number;
  time: number;
  shuffles: number;
  hints: number;
  pairs: number;
}

interface Run {
  tiles: Tile[];
  selected: number; // tile id, -1 = tidak ada
  score: number;
  time: number; // sisa detik
  elapsed: number;
  shuffles: number;
  hints: number;
  hintIds: number[];
  hintT: number;
  msg: string;
  msgT: number;
  result: { score: number; cleared: boolean; newBest: boolean } | null;
}

/** 12 jenis material; glifnya digambar prosedural oleh drawMaterialGlyph (bukan emoji). */
const MATERIALS: { name: string; color: string }[] = [
  { name: 'Keramik', color: '#fb923c' },
  { name: 'Bata', color: '#ef4444' },
  { name: 'Marmer', color: '#e2e8f0' },
  { name: 'Kayu', color: '#a16207' },
  { name: 'Besi', color: '#64748b' },
  { name: 'Cat', color: '#f472b6' },
  { name: 'Semen', color: '#cbd5e1' },
  { name: 'Pasir', color: '#facc15' },
  { name: 'Kaca', color: '#7dd3fc' },
  { name: 'Genteng', color: '#dc2626' },
  { name: 'Pipa', color: '#0ea5e9' },
  { name: 'Kabel', color: '#8b5cf6' },
];

const TIME_LIMIT = 300;
const Z_OFF = 7;
const BX = (LW - COLS * TILE_W) / 2;
const BY = 158;

function tilePos(t: Tile): { x: number; y: number } {
  return { x: BX + t.x * TILE_W - t.z * Z_OFF, y: BY + t.y * TILE_H - t.z * Z_OFF };
}

export default function ArcadeMahjongMatch({ onExit }: { onExit: () => void }): React.JSX.Element {
  const apiRef = useRef<GameApi | null>(null);
  const runRef = useRef<Run | null>(null);
  const screenRef = useRef<Screen>('ready');
  const [screen, setScreenState] = useState<Screen>('ready');
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<Hud>({ left: 0, score: 0, time: TIME_LIMIT, shuffles: 3, hints: 3, pairs: 0 });

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };
  const pushHud = (run: Run): void => {
    apiRef.current?.pushHud({
      left: remaining(run.tiles), score: run.score, time: Math.ceil(run.time),
      shuffles: run.shuffles, hints: run.hints, pairs: countAvailablePairs(run.tiles),
    } as Hud);
  };

  const scoreKey = bestKey(SLUG, 'score');

  const startGame = (): void => {
    const api = apiRef.current;
    if (!api) return;
    runRef.current = {
      tiles: buildLayout((Date.now() % 100000) | 0),
      selected: -1, score: 0, time: TIME_LIMIT, elapsed: 0,
      shuffles: 3, hints: 3, hintIds: [], hintT: 0, msg: '', msgT: 0, result: null,
    };
    setScreen('play');
    api.sfx.ensure();
    api.sfx.click();
    pushHud(runRef.current);
  };

  const finishGame = (cleared: boolean): void => {
    const api = apiRef.current;
    const run = runRef.current;
    if (!api || !run || run.result) return;
    const bonus = cleared ? Math.ceil(run.time) * 2 : 0;
    const score = run.score + bonus;
    const prev = getJson<number>(scoreKey, 0);
    const newBest = score > prev;
    if (newBest) setJson(scoreKey, score);
    run.result = { score, cleared, newBest };
    if (cleared) {
      api.sfx.chime(5);
      for (let k = 0; k < 3; k += 1) {
        api.particles.spawn(60 + k * 135, 200, {
          count: 26, colors: ['#ffd166', '#4ade80', '#7dd3fc', '#fff'],
          speed: [80, 300], gravity: 420, life: [0.8, 1.6], size: [3, 7], shape: 'rect', rotation: true,
        });
      }
    } else {
      api.sfx.fail();
    }
    pushHud(run);
    window.setTimeout(() => setScreen('over'), 1100);
  };

  const doTap = (id: number): void => {
    const api = apiRef.current;
    const run = runRef.current;
    if (!api || !run || screenRef.current !== 'play' || run.result) return;
    api.sfx.ensure();
    const t = run.tiles.find((x) => x.id === id && x.alive);
    if (!t) return;
    if (!isFree(run.tiles, t)) {
      api.sfx.thud(0.3);
      api.shake.add(0.12);
      run.msg = 'Ubin tertutup! Cari yang bebas.';
      run.msgT = 1.2;
      return;
    }
    if (run.selected === -1) {
      run.selected = id;
      api.sfx.click();
      return;
    }
    if (run.selected === id) {
      run.selected = -1;
      api.sfx.click();
      return;
    }
    const a = run.tiles.find((x) => x.id === run.selected)!;
    if (a.kind === t.kind) {
      // cocok!
      a.alive = false;
      t.alive = false;
      run.selected = -1;
      run.score += 100;
      const { x, y } = tilePos(t);
      const mat = MATERIALS[t.kind];
      api.sfx.pop(1 + Math.min(0.5, run.score / 3000));
      api.particles.spawn(x + TILE_W / 2, y + TILE_H / 2, {
        count: 18, colors: [mat.color, '#ffffff', '#ffd166'],
        speed: [60, 240], gravity: 200, life: [0.4, 0.8], size: [2.5, 5.5], shape: 'rect', rotation: true,
      });
      api.scores.add(x + TILE_W / 2, y - 8, '+100', { color: mat.color, size: 16 });
      if (isCleared(run.tiles)) return finishGame(true);
      if (isDeadlocked(run.tiles)) {
        if (isStuck(run.tiles, run.shuffles)) {
          // Perbaikan soft-lock: buntu + kocok habis -> akhiri sekarang,
          // jangan biarkan pemain menunggu timer 5 menit tanpa aksi valid.
          run.msg = 'Buntu & kocok habis — permainan berakhir.';
          run.msgT = 2;
          pushHud(run);
          return finishGame(false);
        }
        run.msg = 'Buntu! Kocok ubin sekarang';
        run.msgT = 2;
      }
    } else {
      run.selected = id;
      api.sfx.thud(0.2);
    }
    pushHud(run);
  };

  const doShuffle = (): void => {
    const api = apiRef.current;
    const run = runRef.current;
    if (!api || !run || screenRef.current !== 'play' || run.shuffles <= 0 || run.result) return;
    api.sfx.ensure();
    run.tiles = shuffleRemaining(run.tiles, mulberry((Date.now() % 100000) | 0));
    run.selected = -1;
    run.shuffles -= 1;
    run.score = Math.max(0, run.score - 50);
    api.sfx.whoosh();
    api.shake.add(0.2);
    run.msg = 'Ubin dikocok (−50)';
    run.msgT = 1.4;
    pushHud(run);
  };

  const doHint = (): void => {
    const api = apiRef.current;
    const run = runRef.current;
    if (!api || !run || screenRef.current !== 'play' || run.hints <= 0 || run.result) return;
    api.sfx.ensure();
    const pairs = freePairs(run.tiles);
    if (pairs.length === 0) {
      run.msg = 'Tidak ada pasangan bebas!';
      run.msgT = 1.4;
      return;
    }
    const [a, b] = pairs[0];
    run.hintIds = [a.id, b.id];
    run.hintT = 1.6;
    run.hints -= 1;
    api.sfx.chime(1);
    pushHud(run);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);
    setMuted(api.sfx.muted);

    const toLogical = (px: number, py: number): { x: number; y: number } => {
      const s = api.W / LW;
      return { x: px / s, y: py / s };
    };

    api.input.onDown = (p) => {
      const run = runRef.current;
      if (!run || screenRef.current !== 'play') return;
      const lp = toLogical(p.x, p.y);
      // cari ubin dari lapis teratas
      const alive = run.tiles.filter((t) => t.alive).sort((a, b) => b.z - a.z);
      for (const t of alive) {
        const { x, y } = tilePos(t);
        if (lp.x >= x && lp.x <= x + TILE_W && lp.y >= y && lp.y <= y + TILE_H) {
          doTap(t.id);
          return;
        }
      }
    };

    api.setUpdate((dt) => {
      const run = runRef.current;
      if (!run || run.result) return;
      if (screenRef.current !== 'play') return;
      run.time -= dt;
      run.elapsed += dt;
      if (run.hintT > 0) run.hintT -= dt;
      if (run.msgT > 0) run.msgT -= dt;
      if (run.time <= 0) {
        run.time = 0;
        pushHud(run);
        finishGame(false);
        return;
      }
      pushHudThrottled(run, dt);
    });

    let hudAcc = 0;
    function pushHudThrottled(run: Run, dt: number): void {
      hudAcc += dt;
      if (hudAcc > 0.5) { hudAcc = 0; pushHud(run); }
    }

    api.setRender(() => {
      const run = runRef.current;
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      const t = performance.now() / 1000;
      ctx.save();
      ctx.scale(s, s);
      drawDepot(ctx, t, lh, api.reducedMotion);
      if (run) {
        // render lapis bawah dulu
        const sorted = run.tiles.filter((x) => x.alive).sort((a, b) => a.z - b.z);
        for (const tl of sorted) {
          const free = isFree(run.tiles, tl);
          const sel = run.selected === tl.id;
          const hint = run.hintIds.includes(tl.id) && run.hintT > 0;
          drawTile(ctx, tl, run.tiles, free, sel, hint, t, api.reducedMotion);
        }
        if (run.msgT > 0) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, run.msgT);
          ctx.font = `900 15px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff';
          ctx.fillText(run.msg, 195, 540);
          ctx.restore();
        }
      }
      ctx.restore();
    });

    api.loop.start();

    if (ARCADE) {
      (window as unknown as Record<string, unknown>).__mahjong = {
        get screen() { return screenRef.current; },
        get left() { return runRef.current ? remaining(runRef.current.tiles) : 0; },
        get score() { return runRef.current?.score ?? 0; },
        get pairs() { return runRef.current ? countAvailablePairs(runRef.current.tiles) : 0; },
        get result() { return runRef.current?.result ?? null; },
        tiles() {
          return runRef.current
            ? runRef.current.tiles.filter((t) => t.alive).map((t) => ({ id: t.id, x: t.x, y: t.y, z: t.z, kind: t.kind }))
            : [];
        },
        freePair() {
          const r = runRef.current;
          if (!r) return null;
          const p = freePairs(r.tiles)[0];
          return p ? [p[0].id, p[1].id] : null;
        },
        start() { startGame(); },
        tap(id: number) { doTap(id); },
        shuffle() { doShuffle(); },
      };
    }
    return () => {
      apiRef.current = null;
      if (ARCADE) delete (window as unknown as Record<string, unknown>).__mahjong;
    };
  });

  const doPause = (): void => {
    if (screenRef.current !== 'play') return;
    apiRef.current?.loop.setPaused(true);
    setScreen('pause');
  };
  const doResume = (): void => {
    sfx.ensure();
    apiRef.current?.loop.setPaused(false);
    setScreen('play');
  };
  const toggleMute = (): void => {
    sfx.ensure();
    setMuted(sfx.toggleMute());
  };

  const btn: React.CSSProperties = {
    minWidth: 44, minHeight: 44, borderRadius: 12, border: 'none',
    background: 'rgba(15,23,42,0.55)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    fontFamily: FONT, fontWeight: 700, padding: '0 10px',
  };
  const fmt = (sec: number): string =>
    `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  const best = getJson<number>(scoreKey, 0);
  const res = runRef.current?.result ?? null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#101827', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
        <div style={{ background: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: '6px 12px', color: '#fff', fontWeight: 800, fontSize: 14 }}>
          {hud.left} ubin
        </div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#ffd166', fontWeight: 800, fontSize: 13 }}>
          Skor {hud.score}
        </div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: hud.time < 60 ? '#f87171' : '#7dd3fc', fontWeight: 800, fontSize: 13 }}>
          {fmt(hud.time)}
        </div>
        <div style={{ flex: 1 }} />
        {(screen === 'play' || screen === 'pause') && (
          <button style={btn} onClick={screen === 'play' ? doPause : doResume} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
        )}
        <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
        <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
      </div>

      {screen === 'play' && (
        <div style={{
          position: 'absolute', left: 12, top: 62, zIndex: 5,
          background: hud.pairs === 0 ? 'rgba(127,29,29,0.75)' : 'rgba(15,23,42,0.55)',
          borderRadius: 12, padding: '6px 12px', color: hud.pairs === 0 ? '#fecaca' : '#a7f3d0',
          fontWeight: 800, fontSize: 13,
        }}>
          {hud.pairs === 0
            ? (hud.shuffles > 0 ? 'Pasangan bebas: 0 — buntu, kocok ubin!' : 'Pasangan bebas: 0 — buntu!')
            : `Pasangan bebas: ${hud.pairs}`}
        </div>
      )}

      {screen === 'ready' && (
        <Overlay>
          <div aria-hidden style={{
            width: 54, height: 62, borderRadius: 9,
            background: 'repeating-linear-gradient(0deg,#dc2626 0 10px,#fef3c7 10px 12px), #dc2626',
            border: '3px solid #fff', boxShadow: '0 8px 20px rgba(0,0,0,0.45)',
          }} />
          <h2 style={titleStyle}>UBIN MATERIAL</h2>
          <p style={textStyle}>Ketuk dua ubin material yang SAMA &amp; BEBAS (tidak tertimpa, sisi kiri/kanan terbuka). Bersihkan semua sebelum timer habis!</p>
          <button style={primaryBtn} onClick={startGame}>Mulai Nyusun</button>
          {best > 0 && (
            <p style={{ ...textStyle, marginTop: 10, fontSize: 13 }}>Skor terbaik: {best}</p>
          )}
        </Overlay>
      )}

      {screen === 'play' && (
        <div style={{ position: 'absolute', right: 12, bottom: 18, zIndex: 6, display: 'flex', gap: 8 }}>
          <button style={toolBtn} onClick={doHint} aria-label="Petunjuk">Petunjuk {hud.hints}</button>
          <button style={toolBtn} onClick={doShuffle} aria-label="Kocok">Kocok {hud.shuffles}</button>
        </div>
      )}

      {screen === 'pause' && (
        <Overlay>
          <div aria-hidden style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 12, height: 40, background: '#fff', borderRadius: 3 }} />
            <div style={{ width: 12, height: 40, background: '#fff', borderRadius: 3 }} />
          </div>
          <h2 style={titleStyle}>JEDA</h2>
          <p style={textStyle}>Ubin-ubin ikut istirahat.</p>
          <button style={primaryBtn} onClick={doResume}>Lanjut</button>
        </Overlay>
      )}

      {screen === 'over' && res && (
        <Overlay>
          <h2 style={titleStyle}>{res.cleared ? 'GUDANG BERSIH!' : hud.time > 0 ? 'BUNTU TOTAL!' : 'WAKTU HABIS!'}</h2>
          <p style={{ ...textStyle, fontSize: 16 }}>
            Skor: {res.score}
            {res.newBest && <span style={{ color: '#4ade80', fontWeight: 900 }}> — REKOR BARU!</span>}
          </p>
          <p style={textStyle}>{res.cleared ? 'Semua ubin kepakai. Mandor puas!' : hud.time > 0 ? 'Tidak ada pasangan bebas dan kocok sudah habis.' : 'Sisa ubin numpuk — coba lebih cepat!'}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={primaryBtn} onClick={startGame}>Main Lagi</button>
            <button style={secondaryBtn} onClick={() => setScreen('ready')}>Menu</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function drawDepot(ctx: CanvasRenderingContext2D, t: number, lh: number, rm: boolean): void {
  const g = ctx.createLinearGradient(0, 0, 0, lh);
  g.addColorStop(0, '#1a2338');
  g.addColorStop(1, '#0c1220');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LW, lh);
  // rak gudang: garis horizontal samar
  ctx.strokeStyle = 'rgba(140,170,220,0.07)';
  ctx.lineWidth = 1;
  for (let gy = 90; gy < lh; gy += 40) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(LW, gy); ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.font = `900 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('GUDANG MATERIAL — cari pasangan bebas', 195, 118);
  ctx.font = `700 11.5px ${FONT}`;
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('ubin terang = bebas • ubin gelap = tertutup/kejepit', 195, 138);
  // lampu gudang berdenyut lembut
  if (!rm) {
    const a = 0.05 + 0.03 * Math.sin(t * 2);
    ctx.fillStyle = `rgba(255,220,150,${a})`;
    ctx.fillRect(0, 0, LW, 90);
  }
}

/**
 * Glif material PROSEDURAL — digambar dari primitif canvas (bukan emoji,
 * bukan aset generate). Kotak glif: x+7..x+37, y+6..y+32 di dalam ubin 44x56,
 * cukup besar & kontras bentuknya agar 12 jenis terbedakan sekilas.
 * kind mengikuti urutan MATERIALS: 0 Keramik 1 Bata 2 Marmer 3 Kayu 4 Besi
 * 5 Cat 6 Semen 7 Pasir 8 Kaca 9 Genteng 10 Pipa 11 Kabel.
 */
function drawMaterialGlyph(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number): void {
  const gx = x + 7;
  const gy = y + 6;
  const cx = x + TILE_W / 2;
  const cy = y + 19;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (kind) {
    case 0: { // Keramik: kisi 2x2 ubin oranye + garis nat
      const shades = ['#fb923c', '#f97316', '#fdba74', '#ea580c'];
      for (let i = 0; i < 4; i += 1) {
        ctx.fillStyle = shades[i];
        ctx.fillRect(gx + (i % 2) * 15, gy + ((i / 2) | 0) * 13, 14, 12);
      }
      ctx.strokeStyle = '#fff7ed';
      ctx.lineWidth = 2;
      ctx.strokeRect(gx, gy, 29, 25);
      ctx.beginPath(); ctx.moveTo(cx, gy); ctx.lineTo(cx, gy + 25);
      ctx.moveTo(gx, cy); ctx.lineTo(gx + 29, cy); ctx.stroke();
      break;
    }
    case 1: { // Bata: pola bata 3 baris berselang-seling
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(gx, gy, 30, 26);
      const bw = 14; const bh = 7;
      for (let row = 0; row < 3; row += 1) {
        const off = row % 2 === 0 ? 0 : -bw / 2;
        for (let col = 0; col < 3; col += 1) {
          ctx.fillStyle = row % 2 === 0 ? '#dc2626' : '#b91c1c';
          ctx.fillRect(gx + off + col * (bw + 1) + 1, gy + row * (bh + 1) + 1, bw - 1, bh - 1);
        }
      }
      ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 1.5; ctx.strokeRect(gx, gy, 30, 26);
      break;
    }
    case 2: { // Marmer: lempeng terang + urat abu melengkung
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(gx, gy, 30, 26);
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5; ctx.strokeRect(gx, gy, 30, 26);
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(gx + 3, gy + 20);
      ctx.bezierCurveTo(gx + 10, gy + 8, gx + 16, gy + 22, gx + 27, gy + 6); ctx.stroke();
      ctx.strokeStyle = '#cbd5e1';
      ctx.beginPath(); ctx.moveTo(gx + 4, gy + 6);
      ctx.bezierCurveTo(gx + 12, gy + 14, gx + 18, gy + 4, gx + 27, gy + 16); ctx.stroke();
      break;
    }
    case 3: { // Kayu: potongan log — lingkaran tahun konsentris
      ctx.fillStyle = '#92400e';
      ctx.beginPath(); ctx.arc(cx, cy, 13, 0, TAU); ctx.fill();
      const rings: [number, string][] = [[10.5, '#d97706'], [8, '#b45309'], [5.5, '#f59e0b'], [3, '#fbbf24']];
      for (const [r, c] of rings) {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 9, cy - 7); ctx.stroke();
      break;
    }
    case 4: { // Besi: kepala baut heksagon + lubang + celah obeng
      ctx.fillStyle = '#94a3b8';
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU - Math.PI / 6;
        const px = cx + 12 * Math.cos(a); const py = cy + 12 * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 4, cy + 4); ctx.lineTo(cx + 4, cy - 4); ctx.stroke();
      break;
    }
    case 5: { // Cat: kaleng + tumpahan cat merah muda di bibir & badan
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(gx + 6, gy + 7, 18, 18);
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.5;
      ctx.strokeRect(gx + 6, gy + 7, 18, 18);
      ctx.fillStyle = '#f472b6';
      ctx.beginPath(); ctx.ellipse(cx, gy + 7, 9, 3, 0, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 6, gy + 8); ctx.lineTo(cx - 2, gy + 8); ctx.lineTo(cx - 2, gy + 16);
      ctx.quadraticCurveTo(cx - 4, gy + 19, cx - 6, gy + 16); ctx.closePath(); ctx.fill();
      ctx.fillRect(gx + 6, gy + 18, 18, 4);
      break;
    }
    case 6: { // Semen: karung kertas — lipatan atas + badan trapezium + label
      ctx.fillStyle = '#d6a860';
      ctx.beginPath();
      ctx.moveTo(gx + 7, gy + 6); ctx.lineTo(gx + 23, gy + 6);
      ctx.lineTo(gx + 27, gy + 25); ctx.lineTo(gx + 3, gy + 25);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#92400e'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = '#b45309'; ctx.fillRect(gx + 7, gy + 3, 16, 4);
      ctx.fillStyle = '#f8fafc'; ctx.fillRect(gx + 9, gy + 12, 12, 8);
      ctx.fillStyle = '#64748b';
      ctx.beginPath(); ctx.arc(cx, gy + 16, 2.6, 0, TAU); ctx.fill();
      break;
    }
    case 7: { // Pasir: gundukan kuning + butiran
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.moveTo(gx + 1, gy + 24);
      ctx.quadraticCurveTo(gx + 10, gy + 4, cx, gy + 3);
      ctx.quadraticCurveTo(gx + 20, gy + 4, gx + 29, gy + 24);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(gx + 9, gy + 24);
      ctx.quadraticCurveTo(cx, gy + 10, gx + 21, gy + 24);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a16207';
      for (const [dx, dy] of [[12, 19], [17, 15], [20, 21], [15, 22]] as const) {
        ctx.beginPath(); ctx.arc(gx + dx, gy + dy, 1.1, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = '#a16207'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(gx, gy + 25); ctx.lineTo(gx + 30, gy + 25); ctx.stroke();
      break;
    }
    case 8: { // Kaca: panel jendela biru + mullion silang + kilau diagonal
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(gx + 3, gy + 1, 24, 24);
      ctx.strokeStyle = '#0369a1'; ctx.lineWidth = 2.4; ctx.strokeRect(gx + 3, gy + 1, 24, 24);
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(cx, gy + 1); ctx.lineTo(cx, gy + 25);
      ctx.moveTo(gx + 3, cy); ctx.lineTo(gx + 27, cy); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.moveTo(gx + 7, gy + 21); ctx.lineTo(gx + 15, gy + 5); ctx.lineTo(gx + 19, gy + 5);
      ctx.lineTo(gx + 11, gy + 21); ctx.closePath(); ctx.fill();
      break;
    }
    case 9: { // Genteng: baris lengkung tumpang tindih merah tua
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          ctx.fillStyle = (row + col) % 2 === 0 ? '#dc2626' : '#991b1b';
          ctx.beginPath();
          ctx.arc(gx + 4 + col * 7.5, gy + 6 + row * 8, 4.6, Math.PI, 0);
          ctx.lineTo(gx + 8.6 + col * 7.5, gy + 12 + row * 8);
          ctx.lineTo(gx - 0.6 + col * 7.5, gy + 12 + row * 8);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
      break;
    }
    case 10: { // Pipa: silinder horizontal biru baja + dua gelang flensa
      const pg = ctx.createLinearGradient(0, gy + 6, 0, gy + 20);
      pg.addColorStop(0, '#7dd3fc'); pg.addColorStop(0.5, '#0284c7'); pg.addColorStop(1, '#075985');
      ctx.fillStyle = pg;
      ctx.fillRect(gx + 1, gy + 7, 28, 12);
      ctx.fillStyle = '#0369a1';
      ctx.fillRect(gx + 5, gy + 5, 4, 16);
      ctx.fillRect(gx + 21, gy + 5, 4, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(gx + 1, gy + 9, 28, 3);
      ctx.strokeStyle = '#0c4a6e'; ctx.lineWidth = 1.4;
      ctx.strokeRect(gx + 1, gy + 7, 28, 12);
      break;
    }
    case 11: { // Kabel: colokan ungu — dua colok di atas + kabel melengkung
      ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(cx - 5, gy + 2); ctx.lineTo(cx - 5, gy + 8);
      ctx.moveTo(cx + 5, gy + 2); ctx.lineTo(cx + 5, gy + 8); ctx.stroke();
      ctx.fillStyle = '#8b5cf6';
      if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(cx - 8, gy + 8, 16, 11, 3); ctx.fill(); }
      else ctx.fillRect(cx - 8, gy + 8, 16, 11);
      ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(cx, gy + 19);
      ctx.bezierCurveTo(cx, gy + 25, gx + 24, gy + 21, gx + 27, gy + 26); ctx.stroke();
      ctx.fillStyle = '#ede9fe';
      ctx.beginPath(); ctx.arc(cx, gy + 13.5, 2.2, 0, TAU); ctx.fill();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

function drawTile(
  ctx: CanvasRenderingContext2D, tl: Tile, tiles: Tile[], free: boolean,
  sel: boolean, hint: boolean, t: number, rm: boolean,
): void {
  const { x, y } = tilePos(tl);
  const mat = MATERIALS[tl.kind];
  const r = 7;
  ctx.save();
  // bayangan tumpukan (lapisan terlihat)
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x + 3, y + 4, TILE_W, TILE_H, r);
  else ctx.rect(x + 3, y + 4, TILE_W, TILE_H);
  ctx.fill();
  // badan ubin berlapis
  const g = ctx.createLinearGradient(x, y, x, y + TILE_H);
  if (free) {
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#dbe4f0');
  } else {
    g.addColorStop(0, '#5b6b85');
    g.addColorStop(1, '#3d4a61');
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, TILE_W, TILE_H, r);
  else ctx.rect(x, y, TILE_W, TILE_H);
  ctx.fill();
  // highlight atas
  ctx.fillStyle = free ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.08)';
  ctx.fillRect(x + 4, y + 3, TILE_W - 8, 5);
  // pita warna material
  ctx.fillStyle = free ? mat.color : '#2b3548';
  ctx.fillRect(x, y + TILE_H - 10, TILE_W, 10);
  // glif material prosedural (vektor canvas, bukan emoji)
  const pop = sel && !rm ? 1 + 0.08 * Math.sin(t * 10) : 1;
  ctx.save();
  ctx.globalAlpha = free ? 1 : 0.45;
  ctx.translate(x + TILE_W / 2, y + 19);
  ctx.scale(pop, pop);
  ctx.translate(-(x + TILE_W / 2), -(y + 19));
  drawMaterialGlyph(ctx, tl.kind, x, y);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // nama material
  ctx.fillStyle = free ? '#1e293b' : '#94a3b8';
  ctx.font = `800 8px ${FONT}`;
  ctx.fillText(mat.name.toUpperCase(), x + TILE_W / 2, y + TILE_H - 16);
  // outline
  ctx.strokeStyle = sel ? '#fbbf24' : hint ? '#4ade80' : free ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
  ctx.lineWidth = sel || hint ? 3 : 1.5;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, TILE_W, TILE_H, r);
  else ctx.rect(x, y, TILE_W, TILE_H);
  ctx.stroke();
  // penanda lapis
  if (tl.z > 0) {
    ctx.fillStyle = 'rgba(15,23,42,0.7)';
    ctx.font = `800 9px ${FONT}`;
    ctx.fillText(`L${tl.z + 1}`, x + TILE_W - 10, y + 11);
  }
  ctx.restore();
}

const toolBtn: React.CSSProperties = {
  minWidth: 56, minHeight: 52, borderRadius: 14, border: '1px solid rgba(255,255,255,0.3)',
  background: 'rgba(15,23,42,0.6)', color: '#fff', fontSize: 16, fontWeight: 800,
  cursor: 'pointer', fontFamily: FONT, padding: '0 12px',
};
const titleStyle: React.CSSProperties = {
  color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0',
  textShadow: '0 2px 12px rgba(15,23,42,0.5)', letterSpacing: 1,
};
const textStyle: React.CSSProperties = {
  color: '#f1f5f9', fontSize: 14, lineHeight: 1.6, margin: '6px 0 14px', maxWidth: 300,
};
const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg,#f59e0b,#ea580c)', color: '#fff',
  fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14,
  padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT,
  boxShadow: '0 6px 20px rgba(245,158,11,0.4)',
};
const secondaryBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.16)', color: '#fff',
  fontWeight: 800, fontSize: 15, border: '1px solid rgba(255,255,255,0.35)',
  borderRadius: 14, padding: '12px 20px', cursor: 'pointer', minHeight: 52, fontFamily: FONT,
};

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: 'rgba(10,18,32,0.66)', backdropFilter: 'blur(3px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 24,
    }}>
      {children}
    </div>
  );
}
