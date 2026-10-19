/**
 * Ketik Proyek — istilah-istilah proyek Indonesia berjatuhan dari langit site
 * sebagai papan proyek kayu. Ketik kata lengkapnya untuk menghancurkannya
 * sebelum menyentuh GARIS DEADLINE! Salah ketik tidak mengurangi nyawa —
 * kata yang lolos = -1 nyawa (helm).
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, sfx, type GameApi } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import {
  MAX_LIVES, WORDS_PER_LEVEL, levelFor, fallSpeedAt, spawnDelayAt,
  pickWord, wordPoints, matchesNext, gradeFor,
} from './logic';

const SLUG = 'typing-game';
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;
const LW = 480;
const LH = 760;
const DEADLINE_Y = LH - 168; // di atas bilah input DOM
const ARCADE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('arcade');

type Screen = 'ready' | 'play' | 'pause' | 'over';
interface Hud { score: number; lives: number; level: number; best: number; destroyed: number }

interface FallWord {
  word: string;
  x: number;
  y: number;
  typed: number;
  speed: number;
  wob: number; // fase goyangan
  errT: number; // sisa waktu efek salah ketik
  born: number;
}

interface Cloud { x: number; y: number; s: number; v: number }

export default function ArcadeTypingGame({ onExit }: { onExit: () => void }): React.JSX.Element {
  const apiRef = useRef<GameApi | null>(null);
  const rngRef = useRef<() => number>(() => Math.random());
  const screenRef = useRef<Screen>('ready');
  const wordsRef = useRef<FallWord[]>([]);
  const targetRef = useRef(-1);
  const simRef = useRef({ lives: MAX_LIVES, score: 0, destroyed: 0, spawnT: 0.6, t: 0, flashT: 0, levelAnnounced: 1, over: false });
  const cloudsRef = useRef<Cloud[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [screen, setScreen] = useState<Screen>('ready');
  const [kb, setKb] = useState('');
  const [hud, setHud] = useState<Hud>({ score: 0, lives: MAX_LIVES, level: 1, best: getBest(bestKey(SLUG, 'best')), destroyed: 0 });
  const [muted, setMuted] = useState(false);
  const [isTouch] = useState(() => typeof window !== 'undefined' && 'ontouchstart' in window);

  const pushHud = (): void => {
    const s = simRef.current;
    setHud({
      score: s.score,
      lives: s.lives,
      level: levelFor(s.destroyed),
      best: getBest(bestKey(SLUG, 'best')),
      destroyed: s.destroyed,
    });
  };

  const focusKb = (): void => {
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 30);
  };

  const gameOver = (): void => {
    const s = simRef.current;
    if (s.over) return;
    s.over = true;
    const prev = getBest(bestKey(SLUG, 'best'));
    const nb = setBest(bestKey(SLUG, 'best'), s.score);
    sfx.fail();
    pushHud();
    void prev; void nb;
    window.setTimeout(() => { screenRef.current = 'over'; setScreen('over'); }, 900);
  };

  /** Hancurkan kata yang selesai diketik. */
  const destroyWord = (api: GameApi, idx: number): void => {
    const s = simRef.current;
    const w = wordsRef.current[idx];
    if (!w) return;
    const yFrac = Math.max(0, Math.min(1, w.y / DEADLINE_Y));
    const pts = wordPoints(w.word, yFrac);
    s.score += pts;
    s.destroyed += 1;
    wordsRef.current.splice(idx, 1);
    targetRef.current = -1;
    // ledakan serpihan kayu + huruf
    const bw = boardW(w.word);
    if (!api.reducedMotion) {
      api.particles.spawn(w.x, w.y, {
        count: 22, colors: ['#fbbf24', '#d97706', '#fef3c7', '#92400e', '#fff'],
        speed: [90, 380], life: [0.4, 1.0], size: [2, 6], shape: 'rect', rotation: true,
      });
    }
    api.scores.add(w.x, w.y - 24, `+${pts}`, { color: '#fde68a', size: 20 });
    sfx.crumble(0.9);
    const lv = levelFor(s.destroyed);
    if (lv > simRef.current.levelAnnounced) {
      simRef.current.levelAnnounced = lv;
      api.scores.add(LW / 2, 200, `LEVEL ${lv} — Deadline makin ketat!`, { color: '#67e8f9', size: 20 });
      sfx.chime(3);
    }
    pushHud();
  };

  const missFeedback = (api: GameApi): void => {
    if (!api.reducedMotion) api.shake.add(0.08);
    sfx.click();
  };

  /** Umpan satu huruf ke mesin ketik. */
  const feedChar = (api: GameApi, raw: string): void => {
    if (screenRef.current !== 'play') return;
    const ch = raw.toUpperCase();
    if (!/^[A-Z]$/.test(ch)) return;
    const words = wordsRef.current;
    let idx = targetRef.current;
    if (idx < 0 || idx >= words.length) {
      // cari kata yang diawali huruf ini — pilih yang paling rendah (paling bahaya)
      let pick = -1; let bestY = -1;
      for (let i = 0; i < words.length; i += 1) {
        if (words[i].word[0] === ch && words[i].y > bestY) { bestY = words[i].y; pick = i; }
      }
      if (pick < 0) { missFeedback(api); return; }
      targetRef.current = pick;
      words[pick].typed = 0;
      idx = pick;
    }
    const w = words[idx];
    if (matchesNext(w.word, w.typed, ch)) {
      w.typed += 1;
      sfx.pop(0.85 + (w.typed / w.word.length) * 0.7);
      if (!api.reducedMotion) {
        api.particles.spawn(w.x - boardW(w.word) / 2 + 20 + w.typed * 17, w.y - 8, {
          count: 3, colors: ['#fef08a', '#fde047'], speed: [30, 120], life: [0.2, 0.45], size: [1.5, 3],
        });
      }
      if (w.typed >= w.word.length) destroyWord(api, idx);
    } else {
      // salah ketik: papan bergetar merah, nyawa aman
      w.errT = 0.3;
      if (!api.reducedMotion) api.shake.add(0.12);
      sfx.thud(0.4);
    }
  };

  const restart = (): void => {
    simRef.current = { lives: MAX_LIVES, score: 0, destroyed: 0, spawnT: 0.6, t: 0, flashT: 0, levelAnnounced: 1, over: false };
    wordsRef.current = [];
    targetRef.current = -1;
    rngRef.current = mulberry32((Date.now() % 100000) | 0);
    setKb('');
    pushHud();
    screenRef.current = 'ready';
    setScreen('ready');
  };

  const startPlay = (): void => {
    sfx.ensure();
    screenRef.current = 'play';
    setScreen('play');
    focusKb();
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    setMuted(sfx.muted);
    rngRef.current = mulberry32((Date.now() % 100000) | 0);
    // awan
    const rc = mulberry32(99);
    cloudsRef.current = Array.from({ length: 6 }, () => ({
      x: rc() * LW, y: 40 + rc() * 200, s: 0.6 + rc() * 0.9, v: 6 + rc() * 10,
    }));

    api.setUpdate((dt) => {
      const fx = simRef.current;
      fx.t += dt;
      if (fx.flashT > 0) fx.flashT -= dt;
      // awan selalu melayang
      for (const c of cloudsRef.current) {
        c.x += c.v * dt;
        if (c.x > LW + 90) { c.x = -90; c.y = 40 + Math.random() * 200; }
      }
      if (screenRef.current !== 'play' || fx.over) return;

      const level = levelFor(fx.destroyed);
      // spawn
      fx.spawnT -= dt;
      if (fx.spawnT <= 0 && wordsRef.current.length < 6) {
        fx.spawnT = spawnDelayAt(level);
        const word = pickWord(rngRef.current, new Set(wordsRef.current.map((w) => w.word)));
        const bw = boardW(word);
        wordsRef.current.push({
          word,
          x: bw / 2 + 10 + rngRef.current() * Math.max(1, LW - bw - 20),
          y: -50,
          typed: 0,
          speed: fallSpeedAt(level) * (0.92 + rngRef.current() * 0.16),
          wob: rngRef.current() * TAU,
          errT: 0,
          born: fx.t,
        });
      }
      // jatuh
      for (let i = wordsRef.current.length - 1; i >= 0; i -= 1) {
        const w = wordsRef.current[i];
        w.y += w.speed * dt;
        w.wob += dt * 3;
        if (w.errT > 0) w.errT -= dt;
        if (w.y >= DEADLINE_Y) {
          // kata lolos deadline!
          wordsRef.current.splice(i, 1);
          if (targetRef.current === i) targetRef.current = -1;
          else if (targetRef.current > i) targetRef.current -= 1;
          fx.lives -= 1;
          fx.flashT = 0.45;
          if (!api.reducedMotion) {
            api.shake.add(0.7);
            api.particles.spawn(w.x, DEADLINE_Y, {
              count: 24, colors: ['#ef4444', '#f87171', '#7f1d1d', '#fbbf24'],
              speed: [80, 360], life: [0.4, 1.0], size: [2, 6], shape: 'rect', rotation: true,
            });
          }
          api.scores.add(w.x, DEADLINE_Y - 40, '-1 🪖', { color: '#f87171', size: 22 });
          sfx.fail();
          pushHud();
          if (fx.lives <= 0) { gameOver(); return; }
        }
      }
    });

    api.setRender(() => {
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      const t = simRef.current.t;
      ctx.save();
      ctx.scale(s, s);
      drawSite(ctx, t, cloudsRef.current, DEADLINE_Y, lh);
      // papan kata jatuh
      for (const w of wordsRef.current) drawBoard(ctx, w, t);
      // garis deadline
      drawDeadline(ctx, DEADLINE_Y, lh, simRef.current.flashT > 0, t);
      if (screenRef.current === 'ready') {
        ctx.save();
        ctx.fillStyle = 'rgba(2,6,23,0.55)'; ctx.fillRect(0, 0, LW, lh);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff'; ctx.font = `900 30px ${FONT}`;
        ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 18;
        ctx.fillText('⌨️ KETIK PROYEK', LW / 2, lh * 0.3);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#bae6fd'; ctx.font = `700 15px ${FONT}`;
        ctx.fillText('Ketik kata proyek yang jatuh untuk menghancurkannya', LW / 2, lh * 0.3 + 36);
        ctx.fillText('sebelum menyentuh GARIS DEADLINE! 🚧', LW / 2, lh * 0.3 + 60);
        ctx.fillStyle = '#fde68a'; ctx.font = `600 13px ${FONT}`;
        ctx.fillText('Salah ketik tidak apa-apa — tapi kata yang lolos = -1 🪖', LW / 2, lh * 0.3 + 84);
        const pulse = 0.7 + 0.3 * Math.sin(t * 5);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#fde68a'; ctx.font = `900 18px ${FONT}`;
        ctx.fillText(isTouchRef.current ? 'KETUK UNTUK MULAI' : 'TEKAN SPASI / KETUK UNTUK MULAI', LW / 2, lh * 0.3 + 128);
        ctx.restore();
      }
      ctx.restore();
    });

    api.input.onDown = () => {
      sfx.ensure();
      if (screenRef.current === 'ready') { startPlay(); return; }
      if (screenRef.current === 'play') focusKb();
    };

    const kd = (e: KeyboardEvent): void => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (screenRef.current === 'play') { api.loop.setPaused(true); screenRef.current = 'pause'; setScreen('pause'); inputRef.current?.blur(); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); screenRef.current = 'play'; setScreen('play'); focusKb(); }
        return;
      }
      if (screenRef.current === 'ready' && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault(); startPlay(); return;
      }
      if (screenRef.current !== 'play') return;
      if (/^Key[A-Z]$/.test(e.code) && !e.metaKey && !e.ctrlKey) {
        const api2 = apiRef.current;
        if (document.activeElement !== inputRef.current && api2) {
          e.preventDefault();
          feedChar(api2, e.code.slice(3));
          focusKb();
        }
      }
    };
    window.addEventListener('keydown', kd);
    api.loop.start();

    if (ARCADE) {
      (window as unknown as Record<string, unknown>).__typing = {
        get screen() { return screenRef.current; },
        get score() { return simRef.current.score; },
        get lives() { return simRef.current.lives; },
        get words() { return wordsRef.current.map((w) => w.word); },
        start: () => startPlay(),
        type: (ch: string) => { const a = apiRef.current; if (a) feedChar(a, ch); },
        forceSpawn: (word: string, speed = 0) => {
          wordsRef.current.push({ word, x: LW / 2, y: 120, typed: 0, speed, wob: 0, errT: 0, born: 0 });
        },
      };
    }
    return () => {
      window.removeEventListener('keydown', kd);
      apiRef.current = null;
      if (ARCADE) delete (window as unknown as Record<string, unknown>).__typing;
    };
  });

  const isTouchRef = useRef(isTouch);
  isTouchRef.current = isTouch;

  const onKbChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const api = apiRef.current;
    const v = e.target.value.toUpperCase();
    if (api) for (const ch of v) feedChar(api, ch);
    setKb('');
  };

  const doPause = (): void => {
    if (screenRef.current !== 'play') return;
    apiRef.current?.loop.setPaused(true);
    screenRef.current = 'pause'; setScreen('pause'); inputRef.current?.blur();
  };
  const doResume = (): void => {
    sfx.ensure();
    apiRef.current?.loop.setPaused(false);
    screenRef.current = 'play'; setScreen('play'); focusKb();
  };
  const toggleMute = (): void => { sfx.ensure(); setMuted(sfx.toggleMute()); };
  const btn: React.CSSProperties = {
    minWidth: 44, minHeight: 44, borderRadius: 12, border: 'none',
    background: 'rgba(15,23,42,0.6)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: FONT,
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0b1023', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'manipulation' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
        <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: '6px 12px', color: '#fde68a', fontWeight: 800, fontSize: 14 }}>⭐ {hud.score}</div>
        <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: '6px 10px', color: '#fdba74', fontWeight: 800, fontSize: 13 }}>🪖 {'●'.repeat(Math.max(0, hud.lives)) || '—'}</div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#c4b5fd', fontWeight: 800, fontSize: 13 }}>Lv {hud.level}</div>
        <div style={{ flex: 1 }} />
        {(screen === 'play' || screen === 'pause') && (
          <button style={btn} onClick={screen === 'play' ? doPause : doResume} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
        )}
        <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
        <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
      </div>

      {screen === 'play' && (
        <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(15,23,42,0.78)', border: '2px solid #f59e0b', borderRadius: 16, padding: '6px 12px' }}>
            <span style={{ fontSize: 22 }}>⌨️</span>
            <input
              ref={inputRef}
              value={kb}
              onChange={onKbChange}
              placeholder="Ketik kata di sini…"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Ketik kata proyek"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 18, fontWeight: 700, fontFamily: FONT, minHeight: 44, textTransform: 'uppercase' }}
            />
          </div>
        </div>
      )}

      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 44 }}>🚧</div>
          <h2 style={titleStyle}>JEDA</h2>
          <p style={textStyle}>Kata-katanya ikut istirahat. Mandor tidak marah… kali ini.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={primaryBtn} onClick={doResume}>Lanjutkan</button>
            <button style={secondaryBtn} onClick={restart}>Ulangi</button>
          </div>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 44 }}>⏰</div>
          <h2 style={titleStyle}>DEADLINE JEBOL!</h2>
          <p style={{ ...textStyle, fontSize: 16 }}>
            Skor: <b>{hud.score}</b> • Kata hancur: <b>{hud.destroyed}</b> • Level: <b>{hud.level}</b><br />
            Grade: <b>{gradeFor(hud.score)}</b> • Terbaik: <b>{hud.best}</b>
            {hud.score > 0 && hud.score >= hud.best && <span style={{ color: '#4ade80', fontWeight: 900 }}> — REKOR BARU!</span>}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={primaryBtn} onClick={() => { sfx.ensure(); restart(); }}>Main Lagi 🔁</button>
            <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/** mulberry32 — dipakai juga oleh QA (seedable). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boardW(word: string): number {
  return word.length * 20 + 44;
}

/** Latar site konstruksi pagi hari: langit, matahari, crane, gedung, tanah. */
function drawSite(ctx: CanvasRenderingContext2D, t: number, clouds: Cloud[], deadlineY: number, lh: number): void {
  const bg = ctx.createLinearGradient(0, 0, 0, lh);
  bg.addColorStop(0, '#7dd3fc'); bg.addColorStop(0.5, '#bae6fd'); bg.addColorStop(0.75, '#fef3c7'); bg.addColorStop(1, '#fde68a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, lh);
  // matahari
  const sg = ctx.createRadialGradient(392, 92, 8, 392, 92, 74);
  sg.addColorStop(0, 'rgba(255,251,235,1)'); sg.addColorStop(0.4, 'rgba(253,224,71,0.9)'); sg.addColorStop(1, 'rgba(253,224,71,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(392, 92, 74, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fef9c3'; ctx.beginPath(); ctx.arc(392, 92, 30, 0, TAU); ctx.fill();
  // awan berlapis
  for (const c of clouds) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.s, c.s);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 16, 0, 0, TAU);
    ctx.ellipse(-24, 5, 22, 12, 0, 0, TAU);
    ctx.ellipse(24, 5, 24, 13, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(226,232,240,0.7)';
    ctx.beginPath(); ctx.ellipse(0, 9, 30, 9, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // gedung jauh (siluet)
  ctx.fillStyle = 'rgba(148,163,184,0.55)';
  ctx.fillRect(20, 250, 70, 300); ctx.fillRect(400, 220, 60, 330);
  ctx.fillStyle = 'rgba(148,163,184,0.8)';
  for (let wy = 262; wy < 520; wy += 26) { ctx.fillRect(32, wy, 12, 14); ctx.fillRect(54, wy, 12, 14); }
  // tower crane
  ctx.strokeStyle = '#475569'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(120, 560); ctx.lineTo(120, 150); ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(50, 175); ctx.lineTo(230, 175); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(120, 150); ctx.lineTo(50, 175); ctx.moveTo(120, 150); ctx.lineTo(230, 175); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(205, 175); ctx.lineTo(205, 250 + Math.sin(t * 0.8) * 6); ctx.stroke();
  ctx.fillStyle = '#b45309';
  ctx.fillRect(197, 250 + Math.sin(t * 0.8) * 6, 16, 14);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(104, 190, 32, 26); // kabin operator
  // gedung setengah jadi
  const by = 430;
  ctx.fillStyle = '#cbd5e1'; ctx.fillRect(230, by, 150, 200);
  ctx.fillStyle = '#94a3b8';
  for (let r = 0; r < 3; r += 1) for (let c2 = 0; c2 < 4; c2 += 1) ctx.fillRect(240 + c2 * 36, by + 16 + r * 56, 24, 36);
  ctx.fillStyle = '#f59e0b'; // bekisting lantai teratas
  ctx.fillRect(224, by - 8, 162, 12);
  // scaffolding
  ctx.strokeStyle = '#78350f'; ctx.lineWidth = 3;
  for (let sx = 236; sx <= 374; sx += 34) {
    ctx.beginPath(); ctx.moveTo(sx, by - 8); ctx.lineTo(sx, by - 90); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(236, by - 50); ctx.lineTo(374, by - 50); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(236, by - 90); ctx.lineTo(374, by - 90); ctx.stroke();
  // tanah site
  const gy = lh - 110;
  const gr = ctx.createLinearGradient(0, gy, 0, lh);
  gr.addColorStop(0, '#b08954'); gr.addColorStop(1, '#7c5a36');
  ctx.fillStyle = gr; ctx.fillRect(0, gy, LW, lh - gy);
  ctx.fillStyle = 'rgba(90,64,36,0.5)';
  for (let px = 14; px < LW; px += 52) {
    ctx.beginPath(); ctx.ellipse(px, gy + 40 + (px % 3) * 12, 12, 4, 0, 0, TAU); ctx.fill();
  }
  // pagar site
  ctx.strokeStyle = '#8a6a48'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, gy - 30); ctx.lineTo(LW, gy - 30); ctx.stroke();
  for (let px = 30; px < LW; px += 70) {
    ctx.beginPath(); ctx.moveTo(px, gy - 30); ctx.lineTo(px, gy); ctx.stroke();
  }
  void deadlineY;
}

/** Garis deadline: pita kuning-hitam + teks. */
function drawDeadline(ctx: CanvasRenderingContext2D, y: number, lh: number, flash: boolean, t: number): void {
  ctx.save();
  const pulse = flash ? 0.5 + 0.5 * Math.abs(Math.sin(t * 14)) : 0;
  // tiang
  ctx.fillStyle = '#57534e';
  ctx.fillRect(6, y - 64, 8, 64); ctx.fillRect(LW - 14, y - 64, 8, 64);
  // pita bergaris
  ctx.beginPath(); ctx.rect(0, y - 34, LW, 22); ctx.clip();
  ctx.fillStyle = flash ? '#ef4444' : '#fbbf24'; ctx.fillRect(0, y - 34, LW, 22);
  ctx.fillStyle = flash ? '#7f1d1d' : '#1c1917';
  for (let x = -20; x < LW + 20; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, y - 34); ctx.lineTo(x + 14, y - 34); ctx.lineTo(x + 2, y - 12); ctx.lineTo(x - 12, y - 12);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.9 + pulse * 0.1;
  ctx.fillStyle = flash ? '#fecaca' : '#451a03';
  ctx.font = `900 13px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🚧 GARIS DEADLINE — JANGAN LOLOS! 🚧', LW / 2, y - 23);
  ctx.restore();
  void lh;
}

/** Papan proyek kayu yang digantung tali. */
function drawBoard(ctx: CanvasRenderingContext2D, w: FallWord, t: number): void {
  const bw = boardW(w.word);
  const bh = 56;
  const sway = Math.sin(w.wob) * 6;
  const errX = w.errT > 0 ? Math.sin(t * 60) * 5 * w.errT : 0;
  ctx.save();
  ctx.translate(w.x + sway * 0.4 + errX, w.y);
  // tali gantungan
  ctx.strokeStyle = '#78716c'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-bw / 2 + 12, -bh / 2); ctx.lineTo(-bw / 2 + 12 - sway, -bh / 2 - 46);
  ctx.moveTo(bw / 2 - 12, -bh / 2); ctx.lineTo(bw / 2 - 12 - sway, -bh / 2 - 46);
  ctx.stroke();
  // badan papan kayu
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
  const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
  if (w.errT > 0) { g.addColorStop(0, '#fca5a5'); g.addColorStop(1, '#b91c1c'); }
  else { g.addColorStop(0, '#d6a35c'); g.addColorStop(0.5, '#b07a3a'); g.addColorStop(1, '#8a5a26'); }
  ctx.fillStyle = g;
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 10); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = w.errT > 0 ? '#7f1d1d' : '#5b3a1a'; ctx.lineWidth = 3;
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 10); ctx.stroke();
  // serat kayu
  ctx.strokeStyle = 'rgba(90,58,26,0.35)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-bw / 2 + 8, -8); ctx.lineTo(bw / 2 - 8, -8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw / 2 + 8, 10); ctx.lineTo(bw / 2 - 8, 10); ctx.stroke();
  // paku rivet
  ctx.fillStyle = '#44403c';
  for (const [rx, ry] of [[-bw / 2 + 10, -bh / 2 + 10], [bw / 2 - 10, -bh / 2 + 10], [-bw / 2 + 10, bh / 2 - 10], [bw / 2 - 10, bh / 2 - 10]]) {
    ctx.beginPath(); ctx.arc(rx, ry, 3, 0, TAU); ctx.fill();
  }
  // kata: huruf sudah diketik = kuning menyala
  ctx.font = `900 24px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const startX = -(w.word.length - 1) * 10;
  for (let i = 0; i < w.word.length; i += 1) {
    const chx = startX + i * 20;
    const done = i < w.typed;
    ctx.fillStyle = done ? '#fef08a' : '#fffbeb';
    if (done) { ctx.shadowColor = '#fde047'; ctx.shadowBlur = 10; } else { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2; }
    ctx.fillText(w.word[i], chx, 2);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  }
  // kursor ketik berkedip
  if (w.typed > 0 && w.typed < w.word.length) {
    const cxp = startX + w.typed * 20 - 10;
    if (Math.sin(t * 10) > 0) {
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(cxp - 1.5, -14, 3, 28);
    }
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const titleStyle: React.CSSProperties = { color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0', textShadow: '0 2px 12px rgba(245,158,11,0.6)', letterSpacing: 1 };
const textStyle: React.CSSProperties = { color: '#e2e8f0', fontSize: 14, lineHeight: 1.55, margin: '6px 0 12px', maxWidth: 320 };
const primaryBtn: React.CSSProperties = { background: 'linear-gradient(135deg,#fbbf24,#f97316)', color: '#431407', fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14, padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT, boxShadow: '0 6px 20px rgba(251,146,60,0.4)' };
const secondaryBtn: React.CSSProperties = { background: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 800, fontSize: 15, border: '1px solid rgba(255,255,255,0.35)', borderRadius: 14, padding: '12px 20px', cursor: 'pointer', minHeight: 52, fontFamily: FONT };
function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(7,11,26,0.72)', backdropFilter: 'blur(3px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
      {children}
    </div>
  );
}
