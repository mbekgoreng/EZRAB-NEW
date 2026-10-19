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

const MATERIALS: { name: string; emoji: string; color: string }[] = [
  { name: 'Keramik', emoji: '🟧', color: '#fb923c' },
  { name: 'Bata', emoji: '🧱', color: '#ef4444' },
  { name: 'Marmer', emoji: '⬜', color: '#e2e8f0' },
  { name: 'Kayu', emoji: '🪵', color: '#a16207' },
  { name: 'Besi', emoji: '🔩', color: '#64748b' },
  { name: 'Cat', emoji: '🎨', color: '#f472b6' },
  { name: 'Semen', emoji: '⚪', color: '#cbd5e1' },
  { name: 'Pasir', emoji: '🟨', color: '#facc15' },
  { name: 'Kaca', emoji: '🪟', color: '#7dd3fc' },
  { name: 'Genteng', emoji: '🟥', color: '#dc2626' },
  { name: 'Pipa', emoji: '🛢️', color: '#0ea5e9' },
  { name: 'Kabel', emoji: '🔌', color: '#8b5cf6' },
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
  const [hud, setHud] = useState<Hud>({ left: 0, score: 0, time: TIME_LIMIT, shuffles: 3, hints: 3 });

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };
  const pushHud = (run: Run): void => {
    apiRef.current?.pushHud({
      left: remaining(run.tiles), score: run.score, time: Math.ceil(run.time),
      shuffles: run.shuffles, hints: run.hints,
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
      run.msg = '🚧 Ubin tertutup! Cari yang bebas.';
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
      if (freePairs(run.tiles).length === 0) {
        run.msg = '😵 Buntu! Kocok ubin 🔀';
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
    run.msg = '🔀 Ubin dikocok (−50)';
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
      run.msg = '😵 Tidak ada pasangan bebas!';
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
          🧱 {hud.left} ubin
        </div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#ffd166', fontWeight: 800, fontSize: 13 }}>
          ⭐ {hud.score}
        </div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: hud.time < 60 ? '#f87171' : '#7dd3fc', fontWeight: 800, fontSize: 13 }}>
          ⏱ {fmt(hud.time)}
        </div>
        <div style={{ flex: 1 }} />
        {(screen === 'play' || screen === 'pause') && (
          <button style={btn} onClick={screen === 'play' ? doPause : doResume} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
        )}
        <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
        <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
      </div>

      {screen === 'ready' && (
        <Overlay>
          <div style={{ fontSize: 44 }}>🧱</div>
          <h2 style={titleStyle}>UBIN MATERIAL</h2>
          <p style={textStyle}>Ketuk dua ubin material yang SAMA &amp; BEBAS (tidak tertimpa, sisi kiri/kanan terbuka). Bersihkan semua sebelum timer habis!</p>
          <button style={primaryBtn} onClick={startGame}>Mulai Nyusun 🧱</button>
          {best > 0 && (
            <p style={{ ...textStyle, marginTop: 10, fontSize: 13 }}>🏅 Skor terbaik: {best}</p>
          )}
        </Overlay>
      )}

      {screen === 'play' && (
        <div style={{ position: 'absolute', right: 12, bottom: 18, zIndex: 6, display: 'flex', gap: 8 }}>
          <button style={toolBtn} onClick={doHint} aria-label="Petunjuk">💡 {hud.hints}</button>
          <button style={toolBtn} onClick={doShuffle} aria-label="Kocok">🔀 {hud.shuffles}</button>
        </div>
      )}

      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 40 }}>⏸</div>
          <h2 style={titleStyle}>JEDA</h2>
          <p style={textStyle}>Ubin-ubin ikut istirahat.</p>
          <button style={primaryBtn} onClick={doResume}>Lanjut</button>
        </Overlay>
      )}

      {screen === 'over' && res && (
        <Overlay>
          <div style={{ fontSize: 44 }}>{res.cleared ? '🏆' : '⏰'}</div>
          <h2 style={titleStyle}>{res.cleared ? 'GUDANG BERSIH!' : 'WAKTU HABIS!'}</h2>
          <p style={{ ...textStyle, fontSize: 16 }}>
            ⭐ Skor: {res.score}
            {res.newBest && <span style={{ color: '#4ade80', fontWeight: 900 }}> — REKOR BARU!</span>}
          </p>
          <p style={textStyle}>{res.cleared ? 'Semua ubin kepakai. Mandor puas!' : 'Sisa ubin numpuk — coba lebih cepat!'}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={primaryBtn} onClick={startGame}>Main Lagi 🔁</button>
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
  ctx.fillText('📦 GUDANG MATERIAL — cari pasangan bebas', 195, 118);
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
  // emoji material
  const pop = sel && !rm ? 1 + 0.08 * Math.sin(t * 10) : 1;
  ctx.font = `${Math.round(26 * pop)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = free ? 1 : 0.45;
  ctx.fillText(mat.emoji, x + TILE_W / 2, y + TILE_H / 2 - 2);
  ctx.globalAlpha = 1;
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
