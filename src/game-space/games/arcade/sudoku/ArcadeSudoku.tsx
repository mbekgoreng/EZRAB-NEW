/**
 * ArcadeSudoku — "Sudoku Material".
 * Isi 9x9 dengan IKON material proyek (🧱🪵🔩…). Generator solusi-unik,
 * 4 difficulty, notes, hint, 3x salah = gagal. DOM + confetti canvas.
 */
import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d';
import { Particles2D } from '../../../engine2d';
import {
  generatePuzzle, isValidPlacement, isCompleteValid, conflictsAt, findHint,
  fmtTime, MATERIALS, DIFFICULTY_INFO, DIFFICULTIES,
  type Difficulty, type Puzzle,
} from './logic';

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
        <div style={{ fontWeight: 900, fontSize: 15 }}>🧱 SUDOKU MATERIAL</div>
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
        <span>⏱️ {fmtTime(gd.seconds)}</span>
        <span style={{ color: gd.mistakes > 0 ? '#dc2626' : '#64748b' }}>
          {'❌'.repeat(gd.mistakes)}{'🤍'.repeat(MAX_MISTAKES - gd.mistakes)}
        </span>
        <div style={{ flex: 1 }} />
        {best[gd.puzzle.difficulty] > 0 && (
          <span style={{ color: '#b45309' }}>🏅 {fmtTime(best[gd.puzzle.difficulty])}</span>
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
                  <span>{MATERIALS[v].ikon}</span>
                ) : note && note.length > 0 ? (
                  <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', fontSize: 8, lineHeight: 1.1, color: '#64748b', width: '100%', textAlign: 'center' }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <span key={n}>{note.includes(n) ? MATERIALS[n].ikon : ''}</span>
                    ))}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        {gd.selected >= 0 && gd.grid[gd.selected] > 0 && (
          <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#92400e', marginTop: 4 }}>
            {MATERIALS[gd.grid[gd.selected]].ikon} {MATERIALS[gd.grid[gd.selected]].nama}
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
              style={{
                aspectRatio: '0.85', borderRadius: 12, border: '2px solid #e2e8f0',
                background: done ? '#e2e8f0' : 'linear-gradient(160deg,#ffffff,#f1f5f9)',
                fontSize: 22, cursor: 'pointer', opacity: done ? 0.35 : 1,
                boxShadow: '0 3px 8px rgba(0,0,0,0.08)',
                minHeight: 44,
              }}
            >
              {MATERIALS[v].ikon}
            </button>
          );
        })}
      </div>

      {/* toolbar */}
      <div style={{ display: 'flex', gap: 8, padding: '6px 14px 16px', zIndex: 5 }}>
        <ToolBtn
          active={gd.notesMode}
          onClick={() => { sfx.ensure(); sfx.click(); setGd({ ...gdRef.current, notesMode: !gdRef.current.notesMode }); }}
          icon="📝" label={`Catatan ${gd.notesMode ? 'ON' : 'OFF'}`}
        />
        <ToolBtn onClick={erase} icon="🧽" label="Hapus" />
        <ToolBtn
          onClick={useHint}
          icon="💡"
          label={`Hint (${gd.hintsLeft})`}
          disabled={gd.hintsLeft <= 0}
        />
        <ToolBtn
          onClick={() => startGame(gd.puzzle.difficulty)}
          icon="🎲"
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
          <div style={{ fontSize: 46 }}>🧱📋</div>
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
          <div style={{ fontSize: 40 }}>☕</div>
          <h2 style={titleStyle}>JEDA</h2>
          <p style={textStyle}>Materialnya ditungguin satpam. Aman.</p>
          <button style={primaryBtn} onClick={() => { sfx.ensure(); setScreen('play'); }}>Lanjutkan</button>
        </Overlay>
      )}

      {screen === 'win' && (
        <Overlay>
          <div style={{ fontSize: 48 }}>🏆</div>
          <h2 style={titleStyle}>GUDANG RAPI!</h2>
          <p style={textStyle}>
            Semua material terpetakan sempurna. Bagian logistik proyek menangis haru.
          </p>
          <p style={{ ...textStyle, fontSize: 16 }}>
            ⏱️ {fmtTime(gd.seconds)} • {DIFFICULTY_INFO[gd.puzzle.difficulty].label}
            {best[gd.puzzle.difficulty] > 0 && <> • 🏅 Terbaik: <b>{fmtTime(best[gd.puzzle.difficulty])}</b></>}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={() => startGame(gd.puzzle.difficulty)}>Main Lagi 🔁</button>
            <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
          </div>
        </Overlay>
      )}

      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 48 }}>👷💢</div>
          <h2 style={titleStyle}>MANDOR MARAH!</h2>
          <p style={textStyle}>
            3x salah pasang material. "Ini bata apa puzzle?!" — proyek dihentikan sementara.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={() => startGame(gd.puzzle.difficulty)}>Coba Lagi 🔁</button>
            <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function ToolBtn({ icon, label, onClick, active, disabled }: {
  icon: string; label: string; onClick: () => void; active?: boolean; disabled?: boolean;
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
