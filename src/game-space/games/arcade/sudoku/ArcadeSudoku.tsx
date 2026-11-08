/**
 * ArcadeSudoku — "Sudoku Material".
 * Isi 9x9 dengan IKON material proyek (glif SVG prosedural). Generator solusi-unik,
 * 4 difficulty, notes, hint, 3x salah = gagal. DOM + confetti canvas.
 */
import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d';
import { Particles2D } from '../../../engine2d';
import { CoffeeCupIcon } from '../../../engine2d/icons';
import {
  generatePuzzle, isValidPlacement, isCompleteValid, conflictsAt, findHint,
  fmtTime, MATERIALS, DIFFICULTY_INFO, DIFFICULTIES,
  type Difficulty, type Puzzle,
} from './logic';
import { useSprite, MATERIAL_SPRITES, type MaterialSlug } from '../../../shared/materialSprites';

/** Nilai 1..9 -> slug set ikon material bersama (generate-AI). */
const SUDOKU_SLUGS: Record<number, MaterialSlug> = {
  1: 'bata', 2: 'kayu', 3: 'besi', 4: 'batu', 5: 'kaca',
  6: 'cat', 7: 'kawat', 8: 'pipa', 9: 'aspal',
};

/**
 * FALLBACK glif material prosedural (SVG digambar kode — BUKAN emoji, BUKAN
 * hasil generate; provenance dicatat di manifest). Dipakai HANYA bila sprite
 * generate-AI dari set material bersama (shared/materialSprites) belum siap
 * atau gagal muat. Satu kamus visual untuk nilai
 * 1..9, dirancang terbaca pada 24px: siluet + warna khas per material.
 */
export function MaterialGlyph({ v, size = 26 }: { v: number; size?: number }): React.JSX.Element {
  const slug = SUDOKU_SLUGS[v];
  const img = useSprite(slug ? MATERIAL_SPRITES[slug] : null);
  if (img && slug) {
    // Sprite generate-AI dari set material bersama; glif prosedural di bawah
    // menjadi FALLBACK bila sprite belum siap / gagal muat.
    return (
      <img
        src={img.src}
        alt={MATERIALS[v].nama}
        aria-label={MATERIALS[v].nama}
        draggable={false}
        style={{ width: size, height: size, objectFit: 'contain', display: 'block', userSelect: 'none' }}
      />
    );
  }
  const s = { width: size, height: size, display: 'block' } as React.CSSProperties;
  switch (v) {
    case 1: // Bata
      return (<svg style={s} viewBox="0 0 40 40" aria-label="Bata"><rect x="4" y="10" width="32" height="20" rx="3" fill="#c4502e" stroke="#7e2f16" strokeWidth="2" /><line x1="20" y1="10" x2="20" y2="20" stroke="#7e2f16" strokeWidth="2" /><line x1="12" y1="20" x2="12" y2="30" stroke="#7e2f16" strokeWidth="2" /><line x1="28" y1="20" x2="28" y2="30" stroke="#7e2f16" strokeWidth="2" /><line x1="4" y1="20" x2="36" y2="20" stroke="#7e2f16" strokeWidth="2" /></svg>);
    case 2: // Kayu
      return (<svg style={s} viewBox="0 0 40 40" aria-label="Kayu"><rect x="5" y="8" width="30" height="24" rx="2" fill="#a06a35" stroke="#5d3a1a" strokeWidth="2" /><line x1="5" y1="16" x2="35" y2="16" stroke="#5d3a1a" strokeWidth="2" /><line x1="5" y1="24" x2="35" y2="24" stroke="#5d3a1a" strokeWidth="2" /><path d="M8 12 q6 -2 12 0 M20 28 q6 -2 12 0" stroke="#7c5228" strokeWidth="1.6" fill="none" /></svg>);
    case 3: // Besi (baut)
      return (<svg style={s} viewBox="0 0 40 40" aria-label="Besi"><polygon points="20,5 32,12 32,28 20,35 8,28 8,12" fill="#94a3b8" stroke="#475569" strokeWidth="2" /><circle cx="20" cy="20" r="6.5" fill="#64748b" stroke="#334155" strokeWidth="2" /><line x1="16" y1="16" x2="24" y2="24" stroke="#e2e8f0" strokeWidth="2.4" /></svg>);
    case 4: // Batu
      return (<svg style={s} viewBox="0 0 40 40" aria-label="Batu"><polygon points="8,28 6,16 14,8 26,6 34,14 33,28 20,33" fill="#9aa0a8" stroke="#565d66" strokeWidth="2" /><path d="M14 8 L18 18 L12 26 M18 18 L30 16" stroke="#6b7280" strokeWidth="1.6" fill="none" /></svg>);
    case 5: // Kaca
      return (<svg style={s} viewBox="0 0 40 40" aria-label="Kaca"><rect x="8" y="6" width="24" height="28" rx="2" fill="#a8d4f0" stroke="#3a6ea8" strokeWidth="2" /><line x1="20" y1="6" x2="20" y2="34" stroke="#3a6ea8" strokeWidth="2" /><line x1="8" y1="20" x2="32" y2="20" stroke="#3a6ea8" strokeWidth="2" /><path d="M11 30 L22 10" stroke="#ffffff" strokeWidth="3" opacity="0.65" /></svg>);
    case 6: // Cat (ember)
      return (<svg style={s} viewBox="0 0 40 40" aria-label="Cat"><path d="M10 14 L30 14 L27 34 L13 34 Z" fill="#e8e4da" stroke="#78716c" strokeWidth="2" /><rect x="10" y="14" width="20" height="6" fill="#2563eb" /><path d="M12 14 a8 6 0 0 1 16 0" fill="none" stroke="#78716c" strokeWidth="2" /><circle cx="20" cy="27" r="3" fill="#2563eb" /></svg>);
    case 7: // Kawat (rantai)
      return (<svg style={s} viewBox="0 0 40 40" aria-label="Kawat"><g fill="none" stroke="#57534e" strokeWidth="3.4"><rect x="6" y="13" width="16" height="12" rx="6" transform="rotate(-24 14 19)" /><rect x="18" y="15" width="16" height="12" rx="6" transform="rotate(-24 26 21)" /></g></svg>);
    case 8: // Pipa (siku)
      return (<svg style={s} viewBox="0 0 40 40" aria-label="Pipa"><path d="M10 6 V20 a8 8 0 0 0 8 8 H34" fill="none" stroke="#38bdf8" strokeWidth="9" /><path d="M10 6 V20 a8 8 0 0 0 8 8 H34" fill="none" stroke="#0369a1" strokeWidth="9" strokeDasharray="2.5 7" opacity="0.45" /><rect x="5" y="3" width="10" height="6" fill="#0369a1" /><rect x="31" y="23" width="6" height="10" fill="#0369a1" /></svg>);
    case 9: // Aspal (drum)
      return (<svg style={s} viewBox="0 0 40 40" aria-label="Aspal"><rect x="11" y="6" width="18" height="28" rx="4" fill="#3f3f46" stroke="#18181b" strokeWidth="2" /><line x1="11" y1="14" x2="29" y2="14" stroke="#a1a1aa" strokeWidth="2.4" /><line x1="11" y1="26" x2="29" y2="26" stroke="#a1a1aa" strokeWidth="2.4" /><ellipse cx="20" cy="7" rx="9" ry="2.6" fill="#52525b" /></svg>);
    default:
      return (<svg style={s} viewBox="0 0 40 40" aria-label=""><circle cx="20" cy="20" r="4" fill="#cbd5e1" /></svg>);
  }
}

const SLUG = 'sudoku';
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const MAX_MISTAKES = 3;
const MAX_HINTS = 3;

const A2TEST =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('a2test');

type Screen = 'tutorial' | 'play' | 'pause' | 'win' | 'over';

interface GameData {
  puzzle: Puzzle;
  grid: number[]; // nilai pemain
  givens: boolean[]; // sel soal (tak bisa diubah)
  notes: Record<number, number[]>; // idx -> kandidat
  mistakes: number;
  hintsLeft: number;
  seconds: number;
  selected: number; // -1 = tidak ada
  notesMode: boolean;
}

function newGameData(diff: Difficulty): GameData {
  const puzzle = generatePuzzle(Math.random, diff);
  return {
    puzzle,
    grid: puzzle.puzzle.slice(),
    givens: puzzle.puzzle.map((v) => v !== 0),
    notes: {},
    mistakes: 0,
    hintsLeft: MAX_HINTS,
    seconds: 0,
    selected: -1,
    notesMode: false,
  };
}

export default function ArcadeSudoku({ onExit }: { onExit: () => void }): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('tutorial');
  const [diff, setDiff] = useState<Difficulty>('mudah');
  const [muted, setMuted] = useState(sfx.muted);
  const [best, setBestUi] = useState<Record<Difficulty, number>>({
    mudah: getBest(bestKey(SLUG, 'time-mudah'), 0),
    sedang: getBest(bestKey(SLUG, 'time-sedang'), 0),
    sulit: getBest(bestKey(SLUG, 'time-sulit'), 0),
    ekstrem: getBest(bestKey(SLUG, 'time-ekstrem'), 0),
  });
  const [gd, setGd] = useState<GameData>(() => newGameData('mudah'));
  const [conflict, setConflict] = useState<number[]>([]);
  const [popKey, setPopKey] = useState(0);
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<number>(0);
  const gdRef = useRef(gd);
  gdRef.current = gd;
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const reducedRef = useRef(
    typeof window !== 'undefined' &&
    typeof window.matchMedia !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  /* auto-pause saat tab disembunyikan */
  useEffect(() => {
    const onVis = (): void => {
      if (document.hidden && screenRef.current === 'play') setScreen('pause');
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  /* timer */
  useEffect(() => {
    if (screen !== 'play') return;
    timerRef.current = window.setInterval(() => {
      setGd((g) => ({ ...g, seconds: g.seconds + 1 }));
    }, 1000);
    return () => window.clearInterval(timerRef.current);
  }, [screen]);

  /* confetti */
  useEffect(() => {
    const cv = confettiRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const ps = new Particles2D(reducedRef.current);
    let raf = 0;
    let last = performance.now();
    const fit = (): void => {
      cv.width = cv.clientWidth * 2;
      cv.height = cv.clientHeight * 2;
    };
    fit();
    window.addEventListener('resize', fit);
    const loop = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ps.update(dt);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.save();
      ctx.scale(2, 2);
      ps.draw(ctx);
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    (cv as unknown as { __ps: Particles2D }).__ps = ps;
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, []);

  const celebrate = (): void => {
    const cv = confettiRef.current;
    const ps = (cv as unknown as { __ps?: Particles2D } | null)?.__ps;
    if (cv && ps) {
      ps.spawn(cv.clientWidth / 2, 140, {
        count: 110, colors: ['#ffd166', '#4ade80', '#fb923c', '#ffffff', '#4cc9f0'],
        speed: [120, 430], up: 170, gravity: 430, life: [0.9, 1.7],
        size: [3, 7], shape: 'rect', rotation: true,
      });
    }
  };

  const startGame = (d: Difficulty): void => {
    sfx.ensure();
    sfx.click();
    setDiff(d);
    setGd(newGameData(d));
    setConflict([]);
    setScreen('play');
  };

  const cellPeers = (idx: number): boolean => {
    const s = gd.selected;
    if (s < 0 || idx === s) return false;
    const r1 = Math.floor(idx / 9);
    const c1 = idx % 9;
    const r2 = Math.floor(s / 9);
    const c2 = s % 9;
    return r1 === r2 || c1 === c2 ||
      (Math.floor(r1 / 3) === Math.floor(r2 / 3) && Math.floor(c1 / 3) === Math.floor(c2 / 3));
  };

  const placeValue = (val: number): void => {
    const g = gdRef.current;
    const sel = g.selected;
    if (screenRef.current !== 'play' || sel < 0 || g.givens[sel]) return;
    sfx.ensure();
    if (g.notesMode) {
      const cur = g.notes[sel] ?? [];
      const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val].sort();
      sfx.click();
      setGd({ ...g, notes: { ...g.notes, [sel]: next } });
      return;
    }
    const grid = g.grid.slice();
    grid[sel] = val;
    const notes = { ...g.notes };
    delete notes[sel];
    const conf = conflictsAt(grid, sel);
    if (conf.length > 0 || val !== g.puzzle.solution[sel]) {
      // salah: tandai, hitung mistake bila benar-benar salah (bukan sekadar konflik ganda)
      const wrong = val !== g.puzzle.solution[sel];
      sfx.fail();
      setConflict([sel, ...conf]);
      window.setTimeout(() => setConflict([]), reducedRef.current ? 60 : 500);
      if (wrong) {
        const mistakes = g.mistakes + 1;
        setGd({ ...g, grid, notes, mistakes });
        if (mistakes >= MAX_MISTAKES) {
          window.setTimeout(() => setScreen('over'), 600);
          return;
        }
        return;
      }
      setGd({ ...g, grid, notes });
      return;
    }
    sfx.pop(1 + val * 0.04);
    setGd({ ...g, grid, notes });
    setPopKey((k) => k + 1);
    if (isCompleteValid(grid)) {
      sfx.chime(4);
      celebrate();
      const key = bestKey(SLUG, `time-${g.puzzle.difficulty}`);
      const prev = getBest(key, 0);
      if (prev === 0 || g.seconds < prev) {
        setBest(key, g.seconds);
        setBestUi((b) => ({ ...b, [g.puzzle.difficulty]: g.seconds }));
      }
      window.setTimeout(() => setScreen('win'), 900);
    }
  };

  const erase = (): void => {
    const g = gdRef.current;
    const sel = g.selected;
    if (screenRef.current !== 'play' || sel < 0 || g.givens[sel]) return;
    sfx.ensure();
    sfx.click();
    const grid = g.grid.slice();
    grid[sel] = 0;
    const notes = { ...g.notes };
    delete notes[sel];
    setGd({ ...g, grid, notes });
  };

  const useHint = (): void => {
    const g = gdRef.current;
    if (screenRef.current !== 'play' || g.hintsLeft <= 0) return;
    sfx.ensure();
    const h = findHint(g.grid, g.puzzle.solution, Math.random);
    if (!h) return;
    sfx.chime(2);
    const grid = g.grid.slice();
    grid[h.idx] = h.value;
    const notes = { ...g.notes };
    delete notes[h.idx];
    const givens = g.givens.slice();
    givens[h.idx] = true; // hint jadi permanen
    const ng = { ...g, grid, notes, givens, hintsLeft: g.hintsLeft - 1, selected: h.idx };
    setGd(ng);
    if (isCompleteValid(grid)) {
      sfx.chime(4);
      celebrate();
      window.setTimeout(() => setScreen('win'), 900);
    }
  };

  /* keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (screenRef.current !== 'play') return;
      const g = gdRef.current;
      if (e.key >= '1' && e.key <= '9') placeValue(Number(e.key));
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') erase();
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const s = g.selected < 0 ? 40 : g.selected;
        const r = Math.floor(s / 9);
        const c = s % 9;
        let nr = r;
        let nc = c;
        if (e.key === 'ArrowUp') nr = (r + 8) % 9;
        if (e.key === 'ArrowDown') nr = (r + 1) % 9;
        if (e.key === 'ArrowLeft') nc = (c + 8) % 9;
        if (e.key === 'ArrowRight') nc = (c + 1) % 9;
        sfx.click();
        setGd({ ...g, selected: nr * 9 + nc });
      } else if (e.key === 'Escape') {
        setScreen('pause');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!A2TEST) return;
    (window as unknown as Record<string, unknown>).__sudoku = {
      getState: () => ({
        screen: screenRef.current,
        mistakes: gdRef.current.mistakes,
        hintsLeft: gdRef.current.hintsLeft,
        givens: gdRef.current.givens.filter(Boolean).length,
        seconds: gdRef.current.seconds,
        complete: isCompleteValid(gdRef.current.grid),
        solution: gdRef.current.puzzle.solution.slice(),
        grid: gdRef.current.grid.slice(),
        selected: gdRef.current.selected,
      }),
      start: (d: Difficulty) => startGame(d),
      select: (idx: number) => setGd((g) => ({ ...g, selected: idx })),
      place: (v: number) => placeValue(v),
      hint: () => useHint(),
    };
    return () => { delete (window as unknown as Record<string, unknown>).__sudoku; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const selVal = gd.selected >= 0 ? gd.grid[gd.selected] : 0;

  const cellStyle = (idx: number): React.CSSProperties => {
    const v = gd.grid[idx];
    const isSel = idx === gd.selected;
    const isGiven = gd.givens[idx];
    const isConflict = conflict.includes(idx);
    const sameVal = selVal > 0 && v === selVal;
    const r = Math.floor(idx / 9);
    const c = idx % 9;
    return {
      aspectRatio: '1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: v > 0 ? 21 : 9,
      cursor: isGiven ? 'default' : 'pointer',
      userSelect: 'none',
      background: isConflict
        ? '#fecaca'
        : isSel
          ? '#fde68a'
          : sameVal && v > 0
            ? '#fef3c7'
            : cellPeers(idx)
              ? '#f1f5f9'
              : '#ffffff',
      borderRight: `1px solid ${(c + 1) % 3 === 0 && c < 8 ? '#0f172a' : '#e2e8f0'}`,
      borderBottom: `1px solid ${(r + 1) % 3 === 0 && r < 8 ? '#0f172a' : '#e2e8f0'}`,
      color: isGiven ? '#0f172a' : '#1d4ed8',
      fontWeight: isGiven ? 900 : 700,
      transition: 'background 0.12s',
      outline: isSel ? '3px solid #b45309' : isConflict ? '3px solid #dc2626' : 'none',
      outlineOffset: -3,
      boxShadow: isGiven ? 'inset 0 0 0 2px rgba(15,23,42,0.12)' : undefined,
    };
  };

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%', overflow: 'hidden auto',
      background: 'linear-gradient(165deg,#fff7ed 0%,#ffedd5 60%,#fed7aa 100%)',
      fontFamily: FONT, color: '#0f172a', display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @keyframes sdkPop { 0%{transform:scale(.5)} 60%{transform:scale(1.25)} 100%{transform:scale(1)} }
        @keyframes sdkShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
        .sdk-pop { animation: sdkPop .22s ease-out; }
        .sdk-shake { animation: sdkShake .18s linear 2; }
      `}</style>
      <canvas ref={confettiRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 8 }} />

      {/* header */}
      <div style={{ padding: '10px 12px 4px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
        <div style={{ fontWeight: 900, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}><MaterialGlyph v={1} size={18} /> SUDOKU MATERIAL</div>
        <div style={{ flex: 1 }} />
        {(screen === 'play' || screen === 'pause') && (
          <button style={btn} onClick={() => { sfx.click(); setScreen(screen === 'play' ? 'pause' : 'play'); }} aria-label="Jeda">
            {screen === 'play' ? '⏸' : '▶'}
          </button>
        )}
        <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
        <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
      </div>

      {/* info bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 14px 6px', zIndex: 5, fontSize: 13, fontWeight: 800 }}>
        <span style={{ background: '#0f172a', color: '#ffd166', borderRadius: 10, padding: '4px 10px' }}>
          {DIFFICULTY_INFO[gd.puzzle.difficulty].label}
        </span>
        <span>Waktu {fmtTime(gd.seconds)}</span>
        <span style={{ color: gd.mistakes > 0 ? '#dc2626' : '#64748b' }} aria-label={`Salah ${gd.mistakes} dari ${MAX_MISTAKES}`}>
          {'✕'.repeat(gd.mistakes)}{'○'.repeat(MAX_MISTAKES - gd.mistakes)} salah
        </span>
        <div style={{ flex: 1 }} />
        {best[gd.puzzle.difficulty] > 0 && (
          <span style={{ color: '#b45309' }}>Terbaik {fmtTime(best[gd.puzzle.difficulty])}</span>
        )}
      </div>

      {/* grid */}
      <div style={{ padding: '0 14px', zIndex: 5 }}>
        <div
          className={conflict.length > 0 && !reducedRef.current ? 'sdk-shake' : ''}
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)',
            border: '3px solid #0f172a', borderRadius: 10, overflow: 'hidden',
            background: '#fff', boxShadow: '0 10px 28px rgba(120,60,10,0.18)',
            filter: screen === 'pause' ? 'blur(8px)' : 'none',
          }}
        >
          {gd.grid.map((v, idx) => {
            const note = gd.notes[idx];
            return (
              <div
                key={`${idx}-${popKey > 0 && idx === gd.selected ? popKey : 0}`}
                className={idx === gd.selected && v > 0 && !reducedRef.current ? 'sdk-pop' : ''}
                style={cellStyle(idx)}
                onClick={() => {
                  if (screen !== 'play') return;
                  sfx.ensure();
                  if (!gd.givens[idx]) sfx.click();
                  setGd({ ...gdRef.current, selected: idx });
                }}
                title={v > 0 ? MATERIALS[v].nama : note?.length ? `Catatan: ${note.map((n) => MATERIALS[n].nama).join(', ')}` : 'Kosong'}
              >
                {v > 0 ? (
                  <MaterialGlyph v={v} size={24} />
                ) : note && note.length > 0 ? (
                  <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0, width: '100%', justifyItems: 'center', opacity: 0.75 }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <span key={n}>{note.includes(n) ? <MaterialGlyph v={n} size={9} /> : null}</span>
                    ))}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        {gd.selected >= 0 && gd.grid[gd.selected] > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#92400e', marginTop: 4 }}>
            <MaterialGlyph v={gd.grid[gd.selected]} size={16} /> {MATERIALS[gd.grid[gd.selected]].nama}
            {gd.givens[gd.selected] ? ' • soal (tetap)' : ''}
          </div>
        )}
      </div>

      {/* pad material */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 6, padding: '10px 14px 4px', zIndex: 5 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => {
          const done = gd.grid.filter((x) => x === v).length >= 9;
          return (
            <button
              key={v}
              onClick={() => placeValue(v)}
              disabled={screen !== 'play'}
              title={MATERIALS[v].nama}
              aria-label={MATERIALS[v].nama}
              style={{
                aspectRatio: '0.85', borderRadius: 12, border: selVal === v ? '2px solid #b45309' : '2px solid #e2e8f0',
                background: done ? '#e2e8f0' : selVal === v ? '#fef3c7' : 'linear-gradient(160deg,#ffffff,#f1f5f9)',
                cursor: 'pointer', opacity: done ? 0.35 : 1,
                boxShadow: '0 3px 8px rgba(0,0,0,0.08)',
                minHeight: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
              }}
            >
              <MaterialGlyph v={v} size={24} />
              <span style={{ fontSize: 8, fontWeight: 800, color: '#64748b', fontFamily: FONT }}>{MATERIALS[v].nama}</span>
            </button>
          );
        })}
      </div>

      {/* toolbar */}
      <div style={{ display: 'flex', gap: 8, padding: '6px 14px 16px', zIndex: 5 }}>
        <ToolBtn
          active={gd.notesMode}
          onClick={() => { sfx.ensure(); sfx.click(); setGd({ ...gdRef.current, notesMode: !gdRef.current.notesMode }); }}
          icon={<NotesIcon />} label={`Catatan ${gd.notesMode ? 'ON' : 'OFF'}`}
        />
        <ToolBtn onClick={erase} icon={<EraserIcon />} label="Hapus" />
        <ToolBtn
          onClick={useHint}
          icon={<HintIcon />}
          label={`Hint (${gd.hintsLeft})`}
          disabled={gd.hintsLeft <= 0}
        />
        <ToolBtn
          onClick={() => startGame(gd.puzzle.difficulty)}
          icon={<DiceIcon />}
          label="Acak Baru"
        />
      </div>

      {/* pilih difficulty (di bawah toolbar, compact) */}
      {screen === 'play' && (
        <div style={{ display: 'flex', gap: 6, padding: '0 14px 14px', zIndex: 5 }}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              onClick={() => startGame(d)}
              style={{
                flex: 1, minHeight: 40, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: d === gd.puzzle.difficulty ? '#0f172a' : 'rgba(15,23,42,0.08)',
                color: d === gd.puzzle.difficulty ? '#ffd166' : '#334155',
                fontWeight: 800, fontSize: 12, fontFamily: FONT,
              }}
            >
              {DIFFICULTY_INFO[d].label}
            </button>
          ))}
        </div>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ display: 'flex', gap: 6 }}><MaterialGlyph v={1} size={40} /><MaterialGlyph v={8} size={40} /><MaterialGlyph v={3} size={40} /></div>
          <h2 style={titleStyle}>SUDOKU MATERIAL</h2>
          <p style={textStyle}>
            Isi 9×9 dengan 9 material proyek — tiap baris, kolom, dan kotak 3×3 harus berisi
            semua material tepat sekali. 3x salah = mandor marah, proyek gagal!
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 6 }}>
            {DIFFICULTIES.map((d) => (
              <button key={d} style={diffBtn} onClick={() => { setDiff(d); startGame(d); }}>
                {DIFFICULTY_INFO[d].label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 8 }}>{DIFFICULTY_INFO[diff].desc}</div>
        </Overlay>
      )}

      {screen === 'pause' && (
        <Overlay>
          <div><CoffeeCupIcon size={40} /></div>
          <h2 style={titleStyle}>JEDA</h2>
          <p style={textStyle}>Materialnya ditungguin satpam. Aman.</p>
          <button style={primaryBtn} onClick={() => { sfx.ensure(); setScreen('play'); }}>Lanjutkan</button>
        </Overlay>
      )}

      {screen === 'win' && (
        <Overlay>
          <div style={{ fontSize: 48, color: '#ffd166' }}>★</div>
          <h2 style={titleStyle}>GUDANG RAPI!</h2>
          <p style={textStyle}>
            Semua material terpetakan sempurna. Bagian logistik proyek menangis haru.
          </p>
          <p style={{ ...textStyle, fontSize: 16 }}>
            Waktu {fmtTime(gd.seconds)} • {DIFFICULTY_INFO[gd.puzzle.difficulty].label}
            {best[gd.puzzle.difficulty] > 0 && <> • Terbaik: <b>{fmtTime(best[gd.puzzle.difficulty])}</b></>}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={() => startGame(gd.puzzle.difficulty)}>Main Lagi</button>
            <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
          </div>
        </Overlay>
      )}

      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 48, color: '#f87171', fontWeight: 900 }}>✕✕✕</div>
          <h2 style={titleStyle}>MANDOR MARAH!</h2>
          <p style={textStyle}>
            3x salah pasang material. "Ini bata apa puzzle?!" — proyek dihentikan sementara.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={() => startGame(gd.puzzle.difficulty)}>Coba Lagi</button>
            <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

const toolStroke = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round',
} as const;
/** Ikon alat prosedural (Fase F — pengganti ikon emoji toolbar lama). */
const NotesIcon = (): React.JSX.Element => (
  <svg width={19} height={19} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14M5 9h14M5 14h9" {...toolStroke} /><path d="M15.5 20.5l4.7-4.7a1.8 1.8 0 0 0-2.5-2.5l-4.7 4.7-0.7 3.2z" {...toolStroke} /></svg>
);
const EraserIcon = (): React.JSX.Element => (
  <svg width={19} height={19} viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 19.5h12" {...toolStroke} /><path d="M5.6 15.2l6.8-8.6a1.6 1.6 0 0 1 2.3-0.2l3.4 3a1.6 1.6 0 0 1-0.1 2.4l-5.5 5.4a1.6 1.6 0 0 1-1.1 0.5H8.2a1.6 1.6 0 0 1-1.2-0.5l-1.2-1.2a1.6 1.6 0 0 1-0.2-0.8z" {...toolStroke} /></svg>
);
const HintIcon = (): React.JSX.Element => (
  <svg width={19} height={19} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="10" r="5.5" {...toolStroke} /><path d="M9.8 19h4.4M10.6 21.5h2.8M12 1.8v2M3.6 10H1.6M22.4 10h-2M5.4 4.2L3.9 2.8M18.6 4.2l1.5-1.4" {...toolStroke} /></svg>
);
const DiceIcon = (): React.JSX.Element => (
  <svg width={19} height={19} viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" {...toolStroke} /><circle cx="8.6" cy="8.6" r="1.5" fill="currentColor" /><circle cx="15.4" cy="8.6" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="8.6" cy="15.4" r="1.5" fill="currentColor" /><circle cx="15.4" cy="15.4" r="1.5" fill="currentColor" /></svg>
);

function ToolBtn({ icon, label, onClick, active, disabled }: {
  icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; disabled?: boolean;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, minHeight: 48, borderRadius: 12, cursor: disabled ? 'default' : 'pointer',
        border: 'none', fontFamily: FONT, fontWeight: 800, fontSize: 12,
        background: active ? '#0f172a' : 'rgba(15,23,42,0.08)',
        color: active ? '#ffd166' : '#334155',
        opacity: disabled ? 0.4 : 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      {label}
    </button>
  );
}

const titleStyle: React.CSSProperties = {
  color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0',
  textShadow: '0 2px 12px rgba(0,0,0,0.5)', letterSpacing: 1,
};
const textStyle: React.CSSProperties = {
  color: '#e2e8f0', fontSize: 14, lineHeight: 1.55, margin: '6px 0 12px', maxWidth: 310,
};
const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg,#ffd166,#ff7847)', color: '#3b1d05',
  fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14,
  padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT,
  boxShadow: '0 6px 20px rgba(255,120,71,0.4)',
};
const secondaryBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.16)', color: '#fff',
  fontWeight: 800, fontSize: 15, border: '1px solid rgba(255,255,255,0.35)',
  borderRadius: 14, padding: '12px 20px', cursor: 'pointer', minHeight: 52, fontFamily: FONT,
};
const diffBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.14)', color: '#fff',
  fontWeight: 800, fontSize: 14, border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: 12, padding: '10px 16px', cursor: 'pointer', minHeight: 44, fontFamily: FONT,
};

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: 'rgba(30,20,10,0.72)', backdropFilter: 'blur(3px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 24, overflow: 'hidden auto',
    }}>
      {children}
    </div>
  );
}
