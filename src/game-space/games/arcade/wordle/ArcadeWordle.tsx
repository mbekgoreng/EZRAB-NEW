/**
 * KATA PROYEK — Wordle Bahasa Indonesia 5 huruf, 6x kesempatan.
 * Pure rules di ./logic.ts; file ini rendering DOM + juice.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useGameCanvas, type GameApi, sfx } from '../../../engine2d';
import { bestKey, getJson, setJson } from '../../../engine2d/best';
import {
  WORD_LEN, MAX_GUESSES, pickWord, isValidGuess, scoreGuess,
  recordResult, emptyStats, keyStatus, type Mark, type Stats,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const STATS_KEY = bestKey('wordle', 'stats');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';
interface Row { guess: string; marks: Mark[]; }

const MARK_COLOR: Record<Mark, [string, string]> = {
  correct: ['#16a34a', '#4ade80'],
  present: ['#b45309', '#fbbf24'],
  absent: ['#3f4c63', '#232c40'],
};

function confetti(api: GameApi, W: number): void {
  const colors = ['#4ade80', '#fbbf24', '#60a5fa', '#f472b6', '#a78bfa'];
  for (let i = 0; i < 5; i += 1) {
    api.particles.spawn((W / 6) * (i + 0.5) + (Math.random() - 0.5) * 40, -20, {
      count: 34, colors, speed: [120, 320], angle: Math.PI / 2, spread: 1.1,
      gravity: 420, life: [1.2, 2.2], size: [3, 7], shape: 'rect', rotation: true, drag: 0.4,
    });
  }
}

export default function ArcadeWordle({ onExit }: { onExit: () => void }): React.ReactElement {
  const [screen, setScreen] = useState<Screen>('tutorial');
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const [rows, setRows] = useState<Row[]>([]);
  const [cur, setCur] = useState('');
  const [answer, setAnswer] = useState('');
  const [msg, setMsg] = useState('');
  const [shakeRow, setShakeRow] = useState(-1);
  const [flipRow, setFlipRow] = useState(-1);
  const [reveal, setReveal] = useState(false);
  const [stats, setStats] = useState<Stats>(() => getJson<Stats>(STATS_KEY, emptyStats()));
  const [muted, setMuted] = useState(false);
  const [hudRound, setHudRound] = useState(1);
  const apiRef = useRef<GameApi | null>(null);
  const stateRef = useRef({ rows: [] as Row[], cur: '', answer: '', over: false, won: false });
  const msgTimer = useRef<number>(0);

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    // Lapisan partikel + background malam berlapis untuk game DOM ini.
    api.setUpdate(() => {});
    api.setRender(() => {
      const { ctx, W, H } = api;
      const t = performance.now() / 1000;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0b1026'); g.addColorStop(0.55, '#131c3f'); g.addColorStop(1, '#0a0f22');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // bintang-bintang berkelip
      for (let i = 0; i < 42; i += 1) {
        const sx = (i * 173.3) % W, sy = (i * 97.7) % (H * 0.7);
        const tw = 0.25 + 0.55 * Math.abs(Math.sin(t * 0.8 + i * 1.7));
        ctx.fillStyle = `rgba(190,210,255,${(tw * 0.5).toFixed(3)})`;
        ctx.fillRect(sx, sy, 2, 2);
      }
      // bulan berlapis
      const mx = W - 64, my = 74;
      const moon = ctx.createRadialGradient(mx - 8, my - 8, 6, mx, my, 46);
      moon.addColorStop(0, '#fdf6d8'); moon.addColorStop(0.55, '#f3e6ac'); moon.addColorStop(1, 'rgba(243,230,172,0)');
      ctx.fillStyle = moon; ctx.beginPath(); ctx.arc(mx, my, 46, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(216,200,140,0.35)';
      ctx.beginPath(); ctx.arc(mx - 10, my - 4, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + 8, my + 10, 5, 0, Math.PI * 2); ctx.fill();
      // siluet kota di dasar
      ctx.fillStyle = '#070c1c';
      for (let i = 0; i < 14; i += 1) {
        const bw = W / 14;
        const bh = 26 + ((i * 53) % 44);
        ctx.fillRect(i * bw, H - bh, bw - 3, bh);
      }
      const vg = ctx.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,5,14,0.5)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    });
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const flash = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(''), 1600);
  }, []);

  const newRound = useCallback(() => {
    const a = pickWord();
    stateRef.current = { rows: [], cur: '', answer: a, over: false, won: false };
    setRows([]); setCur(''); setAnswer(a); setReveal(false);
    setFlipRow(-1); setShakeRow(-1); setHudRound((r) => r + 1);
  }, []);

  const finish = useCallback((won: boolean, finalRows: Row[], ans: string) => {
    stateRef.current.over = true;
    stateRef.current.won = won;
    setStats((prev) => {
      const next = recordResult(prev, won, finalRows.length);
      setJson(STATS_KEY, next);
      return next;
    });
    if (won) {
      sfx.chime(4);
      const api = apiRef.current;
      if (api) confetti(api, api.W);
    } else {
      sfx.fail();
    }
    window.setTimeout(() => { if (screenRef.current === 'play') setScreen('over'); }, won ? 1500 : 900);
  }, []);

  const submit = useCallback(() => {
    const st = stateRef.current;
    if (st.over || screenRef.current !== 'play') return;
    const guess = st.cur.toUpperCase();
    if (guess.length < WORD_LEN) {
      sfx.click();
      setShakeRow(st.rows.length);
      window.setTimeout(() => setShakeRow(-1), 450);
      flash('Kurang huruf!');
      return;
    }
    if (!isValidGuess(guess)) { flash('Hanya huruf A–Z'); return; }
    const marks = scoreGuess(guess, st.answer);
    const row: Row = { guess, marks };
    const nextRows = [...st.rows, row];
    st.rows = nextRows; st.cur = '';
    setCur(''); setRows(nextRows); setFlipRow(nextRows.length - 1);
    window.setTimeout(() => setFlipRow(-1), 700);
    const won = marks.every((m) => m === 'correct');
    if (won) {
      const msgs = ['HEBAT!', 'KEREN!', 'PAS SEKALI!', 'LUAR BIASA!', 'SEMPURNA!', 'AKHIRNYA!'];
      flash(msgs[Math.min(nextRows.length - 1, 5)]);
      finish(true, nextRows, st.answer);
    } else if (nextRows.length >= MAX_GUESSES) {
      flash(`Jawabannya: ${st.answer}`);
      finish(false, nextRows, st.answer);
    } else {
      sfx.pop(1 + nextRows.length * 0.08);
    }
  }, [finish, flash]);

  const typeKey = useCallback((k: string) => {
    const st = stateRef.current;
    if (st.over || screenRef.current !== 'play') return;
    sfx.ensure();
    if (k === 'ENTER') { submit(); return; }
    if (k === 'BACK') {
      if (st.cur.length > 0) { st.cur = st.cur.slice(0, -1); setCur(st.cur); sfx.click(); }
      return;
    }
    if (/^[A-Z]$/.test(k) && st.cur.length < WORD_LEN) {
      st.cur += k; setCur(st.cur); sfx.pop(1.2);
    }
  }, [submit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screenRef.current === 'play') {
        if (e.key === 'Enter') typeKey('ENTER');
        else if (e.key === 'Backspace') typeKey('BACK');
        else if (/^[a-zA-Z]$/.test(e.key)) typeKey(e.key.toUpperCase());
        else if (e.key === 'Escape') { apiRef.current?.loop.setPaused(true); setScreen('pause'); }
      } else if (screenRef.current === 'pause' && e.key === 'Escape') {
        apiRef.current?.loop.setPaused(false); setScreen('play');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [typeKey]);

  const startGame = (): void => {
    sfx.ensure(); sfx.whoosh();
    newRound();
    apiRef.current?.loop.setPaused(false);
    setScreen('play');
  };

  const togglePause = (): void => {
    const api = apiRef.current;
    if (screenRef.current === 'play') { api?.loop.setPaused(true); setScreen('pause'); }
    else if (screenRef.current === 'pause') { api?.loop.setPaused(false); setScreen('play'); }
  };

  const toggleMute = (): void => {
    setMuted((m) => {
      const next = !m;
      if (apiRef.current && apiRef.current.sfx.muted !== next) apiRef.current.sfx.toggleMute();
      return next;
    });
  };

  const ks = keyStatus(rows);
  const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  const inGame = screen === 'play' || screen === 'pause';

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.22)',
    background: 'rgba(12,18,36,0.6)', color: '#fff', fontSize: 19, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
  };
  const card: React.CSSProperties = {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(5,9,20,0.66)', backdropFilter: 'blur(5px)', zIndex: 20, padding: 18,
  };
  const panel: React.CSSProperties = {
    background: 'linear-gradient(165deg,#16224a,#0b1130)', border: '1px solid rgba(251,191,36,0.3)',
    borderRadius: 22, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center',
    color: '#eef2ff', boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
  };
  const bigBtn: React.CSSProperties = {
    display: 'block', width: '100%', marginTop: 10, padding: '13px 16px', borderRadius: 14,
    border: 'none', fontFamily: FONT, fontWeight: 900, fontSize: 15, cursor: 'pointer',
  };

  const tileSize = 'min(13.5vw, 56px)';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 600, overflow: 'hidden', borderRadius: 18, fontFamily: FONT, userSelect: 'none' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* HUD */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(12,18,36,0.6)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 14, padding: '8px 14px', color: '#fff', backdropFilter: 'blur(6px)' }}>
          <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: 3, color: '#fbbf24' }}>KATA PROYEK</div>
          <div style={{ fontSize: 11.5, opacity: 0.8, marginTop: 2 }}>🔥 Streak {stats.streak} • 🏆 {stats.maxStreak}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {inGame && <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {/* papan */}
      <div style={{ position: 'absolute', top: 86, left: 0, right: 0, bottom: 208, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, zIndex: 5, pointerEvents: 'none' }}>
        {Array.from({ length: MAX_GUESSES }, (_, r) => {
          const row = rows[r];
          const isCur = r === rows.length && screen !== 'over';
          const letters = row ? row.guess.split('') : (isCur ? cur.split('') : []);
          return (
            <div key={r} style={{
              display: 'flex', gap: 6,
              animation: shakeRow === r ? 'wshake 0.4s' : undefined,
            }}>
              {Array.from({ length: WORD_LEN }, (_, c) => {
                const ch = letters[c] ?? '';
                const mark = row?.marks[c];
                const [d1, d2] = mark ? MARK_COLOR[mark] : ['#1b2440', '#141b33'];
                return (
                  <div key={c} style={{
                    width: tileSize, height: tileSize, borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 900, fontSize: 'calc(min(13.5vw,56px)*0.52)', color: '#fff',
                    background: mark ? `linear-gradient(160deg, ${d2}, ${d1})` : 'linear-gradient(160deg, #232c4a, #161d36)',
                    border: `2px solid ${ch && !mark ? '#4a5a86' : mark ? d2 : 'rgba(255,255,255,0.14)'}`,
                    boxShadow: mark ? `0 4px 14px ${d1}55, inset 0 2px 4px rgba(255,255,255,0.25)` : 'inset 0 2px 6px rgba(0,0,0,0.4)',
                    transform: flipRow === r ? 'rotateX(90deg)' : 'none',
                    transition: 'transform 0.32s, background 0.2s',
                    transitionDelay: `${c * 60}ms`,
                  }}>
                    {ch}
                  </div>
                );
              })}
            </div>
          );
        })}
        {msg && (
          <div style={{ position: 'absolute', top: -8, background: 'rgba(8,12,26,0.92)', border: '1px solid rgba(251,191,36,0.5)', color: '#fde68a', fontWeight: 800, fontSize: 14, padding: '8px 16px', borderRadius: 12, zIndex: 12 }}>{msg}</div>
        )}
      </div>

      {/* keyboard */}
      {screen !== 'tutorial' && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '8px 6px 14px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          {KEY_ROWS.map((kr, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 5, justifyContent: 'center', width: '100%' }}>
              {ri === 2 && (
                <button onClick={() => typeKey('ENTER')} style={{ ...keyBtn(ks), flex: '1.5', fontSize: 12 }}>⏎</button>
              )}
              {kr.split('').map((k) => (
                <button key={k} onClick={() => typeKey(k)} style={keyBtn(ks, ks[k])}>{k}</button>
              ))}
              {ri === 2 && (
                <button onClick={() => typeKey('BACK')} style={{ ...keyBtn(ks), flex: '1.5', fontSize: 16 }}>⌫</button>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes wshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-5px)}}`}</style>

      {screen === 'tutorial' && (
        <div style={card}><div style={panel}>
          <div style={{ fontSize: 42 }}>🔤</div>
          <h2 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 24, color: '#fbbf24', letterSpacing: 2 }}>KATA PROYEK</h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, opacity: 0.92 }}>
            Tebak <b>kata proyek 5 huruf</b> dalam <b>6x kesempatan</b>.
          </p>
          <div style={{ textAlign: 'left', fontSize: 13, lineHeight: 2, background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: '10px 14px', margin: '8px 0' }}>
            <div>🟩 Huruf <b>tepat</b> di posisi yang benar</div>
            <div>🟨 Huruf ada di kata, tapi <b>posisinya salah</b></div>
            <div>⬛ Huruf <b>tidak ada</b> di kata rahasia</div>
          </div>
          <p style={{ fontSize: 12.5, opacity: 0.8 }}>Kata baru yang acak setiap ronde. Jaga streak kemenanganmu! 🔥</p>
          <button style={{ ...bigBtn, background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00' }} onClick={startGame}>Mulai Menebak</button>
        </div></div>
      )}

      {screen === 'pause' && (
        <div style={card}><div style={panel}>
          <div style={{ fontSize: 40 }}>☕</div>
          <h2 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 22 }}>JEDA</h2>
          <p style={{ fontSize: 13, opacity: 0.85 }}>Kata rahasianya sabar menunggu. Kopinya jangan sampai dingin.</p>
          <button style={{ ...bigBtn, background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00' }} onClick={togglePause}>Lanjutkan</button>
          <button style={{ ...bigBtn, background: 'transparent', color: '#94a3b8' }} onClick={onExit}>Keluar</button>
        </div></div>
      )}

      {screen === 'over' && (
        <div style={card}><div style={panel}>
          <div style={{ fontSize: 42 }}>{stateRef.current.won ? '🎉' : '😅'}</div>
          <h2 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: stateRef.current.won ? '#4ade80' : '#fbbf24' }}>
            {stateRef.current.won ? 'KETEMU!' : 'BELUM BERUNTUNG'}
          </h2>
          <p style={{ fontSize: 14, opacity: 0.9 }}>
            Kata: <b style={{ letterSpacing: 3, fontSize: 18, color: '#fde047' }}>{answer}</b><br />
            {stateRef.current.won ? `Tebakan ke-${rows.length} • Streak ${stats.streak} 🔥` : 'Coba lagi, kata baru menanti.'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, margin: '12px 0', fontSize: 12 }}>
            {[['Main', stats.played], ['Menang', stats.won], ['Streak', stats.streak], ['Max', stats.maxStreak]].map(([l, v]) => (
              <div key={l as string} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '8px 4px' }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: '#fbbf24' }}>{v}</div>
                <div style={{ opacity: 0.75 }}>{l}</div>
              </div>
            ))}
          </div>
          <button style={{ ...bigBtn, background: 'linear-gradient(180deg,#4ade80,#16a34a)', color: '#052e12' }} onClick={() => { sfx.ensure(); newRound(); setScreen('play'); }}>Kata Baru 🔁</button>
          <button style={{ ...bigBtn, background: 'transparent', color: '#94a3b8' }} onClick={onExit}>Keluar</button>
        </div></div>
      )}
    </div>
  );
}

function keyBtn(ks: Record<string, Mark>, mark?: Mark): React.CSSProperties {
  const [d1, d2] = mark ? MARK_COLOR[mark] : ['#31405f', '#232c46'];
  const bg = mark ? `linear-gradient(160deg, ${d2}, ${d1})` : 'linear-gradient(160deg,#31405f,#232c46)';
  return {
    flex: 1, maxWidth: 44, height: 52, borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)',
    background: bg, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer',
    fontFamily: FONT, boxShadow: '0 3px 0 rgba(0,0,0,0.35)',
  };
}
