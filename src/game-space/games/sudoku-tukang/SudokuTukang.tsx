/**
 * Sudoku Tukang — Sudoku 9x9 klasik rasa proyek.
 * Isi sel yang kosong sampai RAB klop tanpa revisi. 3x salah baca gambar = proyek dibatalkan.
 */
import React, { useState, useRef, useEffect } from 'react';
import { useGameCanvas } from '../../engine2d';
import type { GameApi } from '../../engine2d';
import { bestKey, getJson, setJson } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import { fmtTime, clamp } from '../../engine2d/helpers';
import {
  generatePuzzle, createState, setCellValue, eraseCell, toggleNote,
  useHint, isComplete, cellValue, cellWrong,
  DIFF_LABEL, CLUES, MAX_HINTS,
  type Difficulty, type SudokuState,
} from './logic';
import { drawNoise, drawBlueprintGrid } from './fx';

type Screen = 'diff' | 'loading' | 'tutorial' | 'play' | 'win' | 'lose';

interface Rt {
  state: SudokuState | null;
  selected: number | null;
  flash: Map<number, number>; // idx -> expiry timestamp (performance.now ms)
  t: number;
  elapsed: number;
  diff: Difficulty;
}

const DIFFS: Difficulty[] = ['gampang', 'sedang', 'sulit', 'ahli'];
const DIFF_EMOJI: Record<Difficulty, string> = {
  gampang: '🟢', sedang: '🟡', sulit: '🟠', ahli: '🔴',
};

function bestTimeKey(diff: Difficulty): string {
  return bestKey('sudoku-tukang', `time-${diff}`);
}

export default function SudokuTukang({ onExit }: { onExit: () => void }) {
  const [screen, setScreen] = useState<Screen>('diff');
  const [diff, setDiff] = useState<Difficulty>('sedang');
  const [hud, setHud] = useState({ mistakes: 0, hintsLeft: MAX_HINTS, elapsed: 0, filled: 0 });
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [noteMode, setNoteMode] = useState(false);
  const [bestTimes, setBestTimes] = useState<Record<Difficulty, number | null>>({
    gampang: getJson<number | null>(bestTimeKey('gampang'), null),
    sedang: getJson<number | null>(bestTimeKey('sedang'), null),
    sulit: getJson<number | null>(bestTimeKey('sulit'), null),
    ahli: getJson<number | null>(bestTimeKey('ahli'), null),
  });
  const [winInfo, setWinInfo] = useState({ time: 0, isBest: false });

  const apiRef = useRef<GameApi | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rt = useRef<Rt>({
    state: null, selected: null, flash: new Map(), t: 0, elapsed: 0, diff: 'sedang',
  });
  const screenRef = useRef<Screen>(screen);
  screenRef.current = screen;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const noteModeRef = useRef(noteMode);
  noteModeRef.current = noteMode;

  const syncHud = () => {
    const s = rt.current.state;
    if (!s) return;
    let filled = 0;
    for (let i = 0; i < 81; i += 1) if (cellValue(s, i) !== null) filled += 1;
    setHud({
      mistakes: s.mistakes,
      hintsLeft: s.hintsLeft,
      elapsed: rt.current.elapsed,
      filled,
    });
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    setMuted(api.sfx.muted);
    api.setUpdate((dt) => {
      rt.current.t += dt;
    });
    api.setRender(() => drawSudoku(api, rt.current));
    api.input.onDown = (p) => {
      if (screenRef.current !== 'play' || pausedRef.current) return;
      const cell = cellAt(p.x, p.y, api.W, api.H);
      if (cell !== null) {
        api.sfx.ensure();
        rt.current.selected = cell;
        api.sfx.click();
      }
    };
    return () => {
      apiRef.current = null;
    };
  });

  /* timer — freezes while paused or off the play screen */
  useEffect(() => {
    if (screen !== 'play' || paused) return;
    const id = window.setInterval(() => {
      rt.current.elapsed += 1;
      setHud((h) => ({ ...h, elapsed: rt.current.elapsed }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [screen, paused]);

  /* keyboard: 1-9, backspace */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screenRef.current !== 'play' || pausedRef.current) return;
      if (e.key >= '1' && e.key <= '9') pressDigit(Number(e.key));
      else if (e.key === 'Backspace' || e.key === 'Delete') pressErase();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseDiff = (d: Difficulty) => {
    setDiff(d);
    rt.current.diff = d;
    setScreen('loading');
    window.setTimeout(() => {
      const p = generatePuzzle(d, Math.random);
      rt.current.state = createState(p.puzzle, p.solution);
      rt.current.selected = null;
      rt.current.flash.clear();
      rt.current.elapsed = 0;
      rt.current.t = 0;
      setNoteMode(false);
      setPaused(false);
      apiRef.current?.loop.setPaused(false);
      syncHud();
      setScreen('tutorial');
    }, 80);
  };

  const startGame = () => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    api.sfx.whoosh();
    api.loop.start();
    setScreen('play');
  };

  const doWin = () => {
    const api = apiRef.current;
    const elapsed = rt.current.elapsed;
    const key = bestTimeKey(rt.current.diff);
    const prev = getJson<number | null>(key, null);
    const isBest = prev === null || elapsed < prev;
    if (isBest) {
      setJson(key, elapsed);
      setBestTimes((b) => ({ ...b, [rt.current.diff]: elapsed }));
    }
    setWinInfo({ time: elapsed, isBest });
    setScreen('win');
    if (api) {
      api.sfx.chime(4, 660);
      const cx = api.W / 2;
      const cy = api.H / 3;
      api.particles.spawn(cx, cy, {
        count: 90, colors: ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#ffffff'],
        speed: [120, 420], angle: -Math.PI / 2, spread: Math.PI * 2,
        gravity: 500, life: [0.8, 1.6], size: [3, 7], shape: 'rect',
      });
      if (wrapRef.current) popText(wrapRef.current, 'RAB KLOP! 🎉', { size: 34, color: '#fbbf24' });
    }
  };

  const doLose = () => {
    apiRef.current?.sfx.fail();
    apiRef.current?.shake.add(0.5);
    setScreen('lose');
  };

  const checkEnd = (res: { gameOver: boolean }) => {
    const s = rt.current.state;
    if (!s) return;
    if (res.gameOver) {
      doLose();
      return;
    }
    if (isComplete(s)) doWin();
  };

  const cellCenter = (idx: number): { x: number; y: number } => {
    const api = apiRef.current;
    const W = api ? api.W : 360;
    const pad = 10;
    const cell = (W - pad * 2) / 9;
    return {
      x: pad + (idx % 9) * cell + cell / 2,
      y: pad + Math.floor(idx / 9) * cell + cell / 2,
    };
  };

  const pressDigit = (n: number) => {
    const api = apiRef.current;
    const s = rt.current.state;
    const sel = rt.current.selected;
    if (!api || !s || sel === null) return;
    api.sfx.ensure();
    if (noteModeRef.current) {
      if (toggleNote(s, sel, n)) {
        api.sfx.click();
        syncHud();
      }
      return;
    }
    const res = setCellValue(s, sel, n);
    if (!res.ok) return;
    const c = cellCenter(sel);
    if (res.mistake) {
      rt.current.flash.set(sel, performance.now() + 900);
      api.sfx.fail();
      api.shake.add(0.3);
      api.particles.spawn(c.x, c.y, {
        count: 14, colors: ['#f87171', '#ef4444'], speed: [60, 220],
        life: [0.4, 0.8], size: [2, 5],
      });
      api.scores.add(c.x, c.y - 18, 'SALAH!', { color: '#ef4444', size: 18 });
    } else {
      api.sfx.pop(1 + n * 0.06);
      api.particles.spawn(c.x, c.y, {
        count: 10, colors: ['#93c5fd', '#3b82f6'], speed: [40, 160],
        life: [0.3, 0.7], size: [2, 4],
      });
    }
    syncHud();
    checkEnd(res);
  };

  const pressErase = () => {
    const api = apiRef.current;
    const s = rt.current.state;
    const sel = rt.current.selected;
    if (!api || !s || sel === null) return;
    if (eraseCell(s, sel)) {
      api.sfx.click();
      syncHud();
    }
  };

  const pressHint = () => {
    const api = apiRef.current;
    const s = rt.current.state;
    if (!api || !s || s.hintsLeft <= 0) return;
    api.sfx.ensure();
    const idx = useHint(s);
    if (idx !== null) {
      rt.current.selected = idx;
      const c = cellCenter(idx);
      api.sfx.chime(2, 880);
      api.particles.spawn(c.x, c.y, {
        count: 22, colors: ['#fde68a', '#fbbf24', '#ffffff'], speed: [50, 200],
        life: [0.5, 1], size: [2, 5], shape: 'spark',
      });
      api.scores.add(c.x, c.y - 18, '💡', { size: 22 });
      syncHud();
      if (isComplete(s)) doWin();
    }
  };

  const togglePause = () => {
    const api = apiRef.current;
    if (!api || screen !== 'play') return;
    const next = !pausedRef.current;
    api.loop.setPaused(next);
    setPaused(next);
    api.sfx.click();
  };

  const toggleMute = () => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    const m = api.sfx.toggleMute();
    setMuted(m);
  };

  const restart = () => {
    apiRef.current?.sfx.click();
    chooseDiff(rt.current.diff);
  };

  const digitCounts = (): number[] => {
    const s = rt.current.state;
    const counts = new Array(9).fill(0);
    if (!s) return counts;
    for (let i = 0; i < 81; i += 1) {
      const v = cellValue(s, i);
      if (v !== null && !cellWrong(s, i)) counts[v - 1] += 1;
    }
    return counts;
  };
  const counts = screen === 'play' || screen === 'win' ? digitCounts() : new Array(9).fill(0);

  return (
    <div ref={wrapRef} style={styles.wrap}>
      {/* 3D keycap skin: layered gradient + top highlight + bottom edge (pure CSS, no assets) */}
      <style>{`
        .stk-padbtn{background:linear-gradient(180deg,#ffffff 0%,#edf2fb 55%,#d8e3f6 100%);border:1px solid #b2c0d9;box-shadow:0 3px 0 #a6b6d2,0 8px 16px rgba(30,58,138,.16),inset 0 1px 0 #ffffff;transition:transform .06s ease,box-shadow .06s ease,opacity .15s ease;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        .stk-padbtn:active{transform:translateY(3px);box-shadow:0 0 0 #a6b6d2,0 3px 8px rgba(30,58,138,.16),inset 0 1px 0 #ffffff}
        .stk-toolbtn{background:linear-gradient(180deg,#ffffff 0%,#edf2fb 55%,#d8e3f6 100%);border:1px solid #b2c0d9;box-shadow:0 3px 0 #a6b6d2,0 6px 12px rgba(30,58,138,.12),inset 0 1px 0 #ffffff;transition:transform .06s ease,box-shadow .06s ease,background .15s ease;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        .stk-toolbtn:active{transform:translateY(3px);box-shadow:0 0 0 #a6b6d2,0 2px 6px rgba(30,58,138,.12),inset 0 1px 0 #ffffff}
        .stk-toolbtn.on{background:linear-gradient(180deg,#3b78f5 0%,#1d4ed8 60%,#1a44b8 100%);border-color:#1e40af;color:#ffffff;box-shadow:0 3px 0 #162e75,0 6px 14px rgba(29,78,216,.40),inset 0 1px 0 rgba(255,255,255,.40)}
        .stk-diffbtn{background:linear-gradient(180deg,#ffffff 0%,#f4f7fc 60%,#e6ecf7 100%);border:2px solid #dbe3f2;box-shadow:0 3px 0 #c3cede,0 8px 16px rgba(30,58,138,.10),inset 0 1px 0 #ffffff;transition:transform .06s ease,box-shadow .06s ease;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        .stk-diffbtn:active{transform:translateY(3px);box-shadow:0 0 0 #c3cede,0 3px 8px rgba(30,58,138,.10),inset 0 1px 0 #ffffff}
      `}</style>
      {/* ===== header ===== */}
      <div style={styles.topbar}>
        <button style={styles.iconBtn} onClick={onExit} title="Keluar">✕</button>
        <div style={styles.title}>🧱 Sudoku Tukang</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(screen === 'play') && (
            <button style={styles.iconBtn} onClick={togglePause} title={paused ? 'Lanjut' : 'Jeda'}>
              {paused ? '▶' : '⏸'}
            </button>
          )}
          <button style={styles.iconBtn} onClick={toggleMute} title="Suara">
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {/* ===== HUD ===== */}
      {(screen === 'play' || screen === 'win' || screen === 'lose') && (
        <div style={styles.hud}>
          <div style={styles.hudItem}>⏱ <b>{fmtTime(hud.elapsed)}</b></div>
          <div style={styles.hudItem} title="Salah baca gambar">
            ❌ <b>{hud.mistakes}/3</b>
          </div>
          <div style={styles.hudItem}>💡 <b>{hud.hintsLeft}</b></div>
          <div style={styles.hudItem}>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {DIFF_EMOJI[diff]} {DIFF_LABEL[diff]}
              {bestTimes[diff] !== null && ` · 🏆 ${fmtTime(bestTimes[diff] as number)}`}
            </span>
          </div>
        </div>
      )}

      {/* ===== canvas ===== */}
      <div style={styles.canvasBox}>
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>

      {/* ===== pad ===== */}
      {screen === 'play' && !paused && (
        <div style={styles.padArea}>
          <div style={styles.padGrid}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                className="stk-padbtn"
                style={{ ...styles.padBtn, opacity: counts[n - 1] >= 9 ? 0.35 : 1 }}
                onClick={() => pressDigit(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <div style={styles.toolRow}>
            <button className="stk-toolbtn" style={{ ...styles.toolBtn, flex: 1 }} onClick={pressErase}>⌫ Hapus</button>
            <button
              className={noteMode ? 'stk-toolbtn on' : 'stk-toolbtn'}
              style={{ ...styles.toolBtn, flex: 1 }}
              onClick={() => { apiRef.current?.sfx.click(); setNoteMode((m) => !m); }}
            >
              ✏️ Catatan {noteMode ? 'ON' : 'OFF'}
            </button>
            <button
              className="stk-toolbtn"
              style={{ ...styles.toolBtn, flex: 1, opacity: hud.hintsLeft > 0 ? 1 : 0.4 }}
              onClick={pressHint}
            >
              💡 Hint ({hud.hintsLeft})
            </button>
          </div>
        </div>
      )}

      {/* ===== overlays ===== */}
      {screen === 'diff' && (
        <Overlay>
          <div style={styles.cardTitle}>🧱 Sudoku Tukang</div>
          <p style={styles.cardText}>
            Gambar kerja 9×9 dari mandor. Isi semua kotak dengan angka 1–9 —
            tiap baris, kolom, dan kotak 3×3 tidak boleh kembar.
          </p>
          <p style={styles.cardText}>Pilih tingkat kesulitan gambar:</p>
          <div style={styles.diffGrid}>
            {DIFFS.map((d) => (
              <button key={d} className="stk-diffbtn" style={styles.diffBtn} onClick={() => chooseDiff(d)}>
                <div style={{ fontSize: 20 }}>{DIFF_EMOJI[d]}</div>
                <div style={{ fontWeight: 800 }}>{DIFF_LABEL[d]}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{CLUES[d]} petunjuk</div>
                <div style={{ fontSize: 11, color: '#b45309' }}>
                  {bestTimes[d] !== null ? `🏆 ${fmtTime(bestTimes[d] as number)}` : 'belum ada rekor'}
                </div>
              </button>
            ))}
          </div>
        </Overlay>
      )}

      {screen === 'loading' && (
        <Overlay>
          <div style={styles.cardTitle}>📐 Menyiapkan gambar kerja…</div>
          <p style={styles.cardText}>Mandor sedang menghapus coretan yang salah.</p>
        </Overlay>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <div style={styles.cardTitle}>📋 Briefing Mandor</div>
          <div style={{ ...styles.cardText, textAlign: 'left' }}>
            <p>👆 <b>Ketuk kotak</b> lalu pilih angka 1–9.</p>
            <p>✏️ <b>Mode Catatan</b> untuk corat-coret kandidat angka.</p>
            <p>❌ <b>3x salah baca gambar</b> = proyek DIBATALKAN.</p>
            <p>💡 <b>Hint 3x</b> — tanya konsultan, tapi jatah terbatas.</p>
            <p style={{ color: '#64748b', fontSize: 13 }}>
              *"AHSP bilang cukup, harga pasar bilang tidak. Sudoku tidak peduli — yang penting konsisten."*
            </p>
          </div>
          <button style={styles.primaryBtn} onClick={startGame}>Mulai Kerja 🔨</button>
        </Overlay>
      )}

      {screen === 'play' && paused && (
        <Overlay>
          <div style={styles.cardTitle}>⏸ Istirahat Ngopi</div>
          <p style={styles.cardText}>Timer dibekukan. Gambarnya aman, tidak ada yang revisi.</p>
          <div style={styles.btnRow}>
            <button style={styles.primaryBtn} onClick={togglePause}>Lanjut ▶</button>
            <button style={styles.ghostBtn} onClick={restart}>Ulangi 🔄</button>
            <button style={styles.ghostBtn} onClick={() => { apiRef.current?.loop.setPaused(false); setPaused(false); setScreen('diff'); }}>
              Ganti Level
            </button>
          </div>
        </Overlay>
      )}

      {screen === 'win' && (
        <Overlay>
          <div style={{ fontSize: 52 }}>🏆</div>
          <div style={styles.cardTitle}>RAB klop tanpa revisi!</div>
          <p style={styles.cardText}>
            Selesai dalam <b>{fmtTime(winInfo.time)}</b>
            {winInfo.isBest && <span style={{ color: '#b45309' }}> — 🏆 rekor baru!</span>}
          </p>
          <p style={{ ...styles.cardText, fontSize: 13, color: '#64748b' }}>
            *"Estimasi selesai… eh, gambar revisi." — tidak kali ini. Kerja bagus, estimator!*
          </p>
          <div style={styles.btnRow}>
            <button style={styles.primaryBtn} onClick={restart}>Main Lagi 🔄</button>
            <button style={styles.ghostBtn} onClick={() => setScreen('diff')}>Ganti Level</button>
          </div>
        </Overlay>
      )}

      {screen === 'lose' && (
        <Overlay>
          <div style={{ fontSize: 52 }}>🚧</div>
          <div style={styles.cardTitle}>Proyek DIBATALKAN!</div>
          <p style={styles.cardText}>
            Mandor salah baca gambar <b>3x</b>. Owner ngamuk, konsultan geleng-geleng,
            RAB direvisi ke-13 kalinya… lalu dibatalkan.
          </p>
          <p style={{ ...styles.cardText, fontSize: 13, color: '#64748b' }}>
            *"Konsultan: 'coba dihitung ulang ya.'"*
          </p>
          <div style={styles.btnRow}>
            <button style={styles.primaryBtn} onClick={restart}>Coba Lagi 💪</button>
            <button style={styles.ghostBtn} onClick={() => setScreen('diff')}>Ganti Level</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/* ---------- canvas geometry ---------- */

function cellAt(x: number, y: number, W: number, H: number): number | null {
  const pad = 10;
  const n = Math.min(W, H);
  const cell = (n - pad * 2) / 9;
  const gx = x - (W - n) / 2 - pad;
  const gy = y - (H - n) / 2 - pad;
  const c = Math.floor(gx / cell);
  const r = Math.floor(gy / cell);
  if (c < 0 || c > 8 || r < 0 || r > 8) return null;
  return r * 9 + c;
}

/* ---------- canvas drawing ---------- */

function drawSudoku(api: GameApi, rt: Rt): void {
  const { ctx, W, H } = api;
  const s = rt.state;

  // background: soft blueprint-desk gradient + faint grid + grain
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#f8fafc');
  bg.addColorStop(0.6, '#eef2f7');
  bg.addColorStop(1, '#e2e8f0');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  drawBlueprintGrid(ctx, W, H, 30, 'rgba(90,120,170,0.08)');
  drawNoise(ctx, W, H, '#8aa0c2', 0.05);

  const pad = 10;
  const n = Math.min(W, H);
  const ox = (W - n) / 2;
  const oy = (H - n) / 2;
  const cell = (n - pad * 2) / 9;
  const gx = ox + pad;
  const gy = oy + pad;

  // panel
  ctx.save();
  ctx.shadowColor = 'rgba(15,23,42,0.18)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  roundRect(ctx, gx - 6, gy - 6, cell * 9 + 12, cell * 9 + 12, 14);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  // bevel: bright top-inner edge fading down (machined-paper look)
  ctx.save();
  roundRect(ctx, gx - 6, gy - 6, cell * 9 + 12, cell * 9 + 12, 14);
  ctx.clip();
  const bevel = ctx.createLinearGradient(0, gy - 6, 0, gy + 44);
  bevel.addColorStop(0, 'rgba(255,255,255,0.9)');
  bevel.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bevel;
  ctx.fillRect(gx - 6, gy - 6, cell * 9 + 12, 50);
  // faint paper grain inside the panel
  drawNoise(ctx, W, H, '#94a3b8', 0.04);
  ctx.restore();

  if (!s) {
    // empty placeholder board before generation
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 9; i += 1) {
      const p = gx + i * cell;
      ctx.beginPath(); ctx.moveTo(p, gy); ctx.lineTo(p, gy + cell * 9); ctx.stroke();
      const q = gy + i * cell;
      ctx.beginPath(); ctx.moveTo(gx, q); ctx.lineTo(gx + cell * 9, q); ctx.stroke();
    }
    return;
  }

  const sel = rt.selected;
  const selR = sel !== null ? Math.floor(sel / 9) : -1;
  const selC = sel !== null ? sel % 9 : -1;
  const selVal = sel !== null ? cellValue(s, sel) : null;

  // highlights
  for (let r = 0; r < 9; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const i = r * 9 + c;
      const v = cellValue(s, i);
      let fill: string | null = null;
      if (sel !== null) {
        if (i === sel) fill = '#fde68a';
        else if (selVal !== null && v === selVal) fill = 'rgba(59,130,246,0.22)';
        else if (r === selR || c === selC || (Math.floor(r / 3) === Math.floor(selR / 3) && Math.floor(c / 3) === Math.floor(selC / 3))) {
          fill = 'rgba(148,163,184,0.14)';
        }
      }
      if (fill) {
        if (i === sel) {
          // selected cell: soft radial glow (lampiran sorot mandor)
          const ccx = gx + c * cell + cell / 2;
          const ccy = gy + r * cell + cell / 2;
          const sg = ctx.createRadialGradient(ccx, ccy, cell * 0.08, ccx, ccy, cell * 0.75);
          sg.addColorStop(0, '#fffbd6');
          sg.addColorStop(0.6, '#fde68a');
          sg.addColorStop(1, 'rgba(253,230,138,0.45)');
          ctx.fillStyle = sg;
          ctx.fillRect(gx + c * cell + 0.5, gy + r * cell + 0.5, cell - 1, cell - 1);
        } else {
          ctx.fillStyle = fill;
          ctx.fillRect(gx + c * cell + 0.5, gy + r * cell + 0.5, cell - 1, cell - 1);
        }
      }
    }
  }

  // digits + notes
  const now = performance.now();
  for (let r = 0; r < 9; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const i = r * 9 + c;
      const cx = gx + c * cell + cell / 2;
      const cy = gy + r * cell + cell / 2;
      const v = cellValue(s, i);
      const wrong = cellWrong(s, i);
      const flashUntil = rt.flash.get(i) ?? 0;

      if (wrong && now < flashUntil) {
        // red pulse behind the wrong digit
        const t = 1 - (flashUntil - now) / 900;
        ctx.fillStyle = `rgba(239,68,68,${0.35 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * (0.32 + 0.1 * Math.sin(t * 20)), 0, Math.PI * 2);
        ctx.fill();
      }

      if (v !== null) {
        ctx.font = `${s.locked[i] ? 800 : 700} ${Math.round(cell * 0.52)}px 'Plus Jakarta Sans','Inter',system-ui,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const main = s.locked[i] ? '#1e293b' : wrong ? '#dc2626' : '#1d4ed8';
        // embossed digit: light underlay 1px below, then the ink on top
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillText(String(v), cx, cy + 2);
        ctx.fillStyle = main;
        ctx.fillText(String(v), cx, cy + 1);
      } else if (s.notes[i].length > 0) {
        ctx.font = `600 ${Math.round(cell * 0.24)}px 'Plus Jakarta Sans','Inter',system-ui,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#64748b';
        for (const d of s.notes[i]) {
          const nr = Math.floor((d - 1) / 3);
          const nc = (d - 1) % 3;
          ctx.fillText(String(d), gx + c * cell + (nc + 0.5) * cell / 3, gy + r * cell + (nr + 0.5) * cell / 3);
        }
      }
    }
  }

  // grid lines
  for (let i = 0; i <= 9; i += 1) {
    const major = i % 3 === 0;
    ctx.strokeStyle = major ? '#334155' : '#cbd5e1';
    ctx.lineWidth = major ? 2.4 : 1;
    const p = gx + i * cell;
    ctx.beginPath(); ctx.moveTo(p, gy - 2); ctx.lineTo(p, gy + cell * 9 + 2); ctx.stroke();
    const q = gy + i * cell;
    ctx.beginPath(); ctx.moveTo(gx - 2, q); ctx.lineTo(gx + cell * 9 + 2, q); ctx.stroke();
  }

  // subtle vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(15,23,42,0)');
  vg.addColorStop(1, 'rgba(15,23,42,0.10)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = clamp(r, 0, Math.min(w, h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ---------- overlay + styles ---------- */

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.card}>{children}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'relative', display: 'flex', flexDirection: 'column',
    width: '100%', height: '100%', minHeight: 560,
    background: '#f1f5f9', overflow: 'hidden',
    fontFamily: "'Plus Jakarta Sans','Inter',system-ui,sans-serif",
  },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px', background: '#0f172a', color: '#fff', zIndex: 5,
  },
  title: { fontWeight: 900, fontSize: 16 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12, border: '1px solid rgba(255,255,255,.25)',
    background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: 17,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  hud: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
    background: '#ffffff', borderBottom: '1px solid #e2e8f0', fontSize: 14, zIndex: 4,
  },
  hudItem: { display: 'flex', alignItems: 'center', gap: 4, color: '#0f172a' },
  canvasBox: { padding: '10px 12px 4px', display: 'flex', justifyContent: 'center' },
  canvas: {
    width: '100%', maxWidth: 430, aspectRatio: '1 / 1',
    borderRadius: 14, touchAction: 'none', userSelect: 'none',
  },
  padArea: { padding: '6px 12px 12px' },
  padGrid: { display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 5, marginBottom: 8 },
  padBtn: {
    height: 46, borderRadius: 10,
    fontSize: 20, fontWeight: 800, color: '#1d4ed8', cursor: 'pointer',
  },
  toolRow: { display: 'flex', gap: 8 },
  toolBtn: {
    height: 44, borderRadius: 10,
    fontSize: 13, fontWeight: 700, color: '#1e293b', cursor: 'pointer',
  },
  overlay: {
    position: 'absolute', inset: 0, zIndex: 10,
    background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(3px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
  },
  card: {
    background: '#ffffff', borderRadius: 20, padding: 22, maxWidth: 340, width: '100%',
    textAlign: 'center', boxShadow: '0 24px 60px rgba(15,23,42,.35)',
    maxHeight: '92%', overflowY: 'auto',
  },
  cardTitle: { fontSize: 22, fontWeight: 900, color: '#0f172a', marginBottom: 8 },
  cardText: { fontSize: 14, color: '#334155', lineHeight: 1.55, margin: '6px 0' },
  diffGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 },
  diffBtn: {
    borderRadius: 14,
    padding: '12px 6px', cursor: 'pointer', display: 'flex',
    flexDirection: 'column', alignItems: 'center', gap: 3,
  },
  primaryBtn: {
    marginTop: 14, width: '100%', height: 50, borderRadius: 14, border: 'none',
    background: '#1d4ed8', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer',
  },
  ghostBtn: {
    marginTop: 10, height: 44, borderRadius: 12, border: '1px solid #cbd5e1',
    background: '#fff', color: '#334155', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', padding: '0 14px',
  },
  btnRow: { display: 'flex', flexDirection: 'column', gap: 2 },
};
