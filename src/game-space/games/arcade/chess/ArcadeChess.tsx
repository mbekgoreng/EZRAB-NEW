/**
 * ArcadeChess ("Catur Proyek") — catur peran proyek.
 * Kamu = Tim Mandor (emas) vs AI = Tim Klien (merah). Aturan penuh di logic.ts.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  startState, legalMovesFor, applyMove, gameStatus, aiBestMove, squareName,
  kingSquare,
  type State, type Move, type Piece, type PieceType, type Color,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK_STREAK = bestKey('catur-proyek', 'winstreak');
const BK_WINS = bestKey('catur-proyek', 'wins');

/** Buah catur = peran proyek. */
const ROLE: Record<PieceType, { name: string; emoji: string }> = {
  k: { name: 'Mandor', emoji: '👷' },
  q: { name: 'Arsitek', emoji: '📐' },
  r: { name: 'T.Crane', emoji: '🏗️' },
  b: { name: 'Surveyor', emoji: '🧭' },
  n: { name: 'Truk', emoji: '🚚' },
  p: { name: 'Tukang', emoji: '🦺' },
};

const REASON_ID: Record<string, string> = {
  checkmate: 'Skakmat',
  stalemate: 'Stalemate (seri)',
  fifty: 'Seri — 50 langkah',
  material: 'Seri — material kurang',
};

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

export default function ArcadeChess({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [screen, setScreen] = useState<Screen>('tutorial');
  const screenRef = useRef<Screen>('tutorial');
  const [st, setSt] = useState<State>(() => startState());
  const [sel, setSel] = useState<number | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [thinking, setThinking] = useState(false);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: number; to: number } | null>(null);
  const [captured, setCaptured] = useState<Piece[]>([]);
  const [moveLog, setMoveLog] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const [result, setResult] = useState<{ text: string; sub: string; win: boolean } | null>(null);
  const [streak, setStreak] = useState(() => getBest(BK_STREAK, 0));
  const status = useMemo(() => gameStatus(st), [st]);
  const aiTimer = useRef<number | null>(null);

  const setScr = (s: Screen): void => {
    screenRef.current = s;
    setScreen(s);
  };

  const finishGame = (s: State): void => {
    const gs = gameStatus(s);
    if (!gs.over || !gs.result) return;
    let text: string;
    let sub: string;
    let win = false;
    if (gs.result === 'w') {
      win = true;
      text = '🏆 PROYEK SELESAI!';
      sub = gs.reason === 'checkmate' ? 'Skakmat! Klien tanda tangan kontrak.' : 'Klien menyerah — proyek dimenangkan Tim Mandor.';
      const ns = setBest(BK_STREAK, getBest(BK_STREAK, 0) + 1);
      setStreak(ns);
      setBest(BK_WINS, getBest(BK_WINS, 0) + 1);
      sfx.chime(4);
    } else if (gs.result === 'b') {
      text = '🚧 PROYEK MANGKRAK!';
      sub = 'Skakmat oleh Tim Klien. Revisi strategi, coba lagi!';
      setBest(BK_STREAK, 0);
      setStreak(0);
      sfx.fail();
    } else {
      text = '🤝 SERI';
      sub = `${REASON_ID[gs.reason ?? 'stalemate']}. Proyek ditunda bersama.`;
      sfx.chime(2);
    }
    setResult({ text, sub, win });
    const wrap = wrapRef.current;
    if (wrap) popText(wrap, text, { size: 26, color: win ? '#4ade80' : gs.result === 'b' ? '#f87171' : '#7dd3fc' });
    window.setTimeout(() => setScr('over'), 1300);
  };

  const doMove = (s: State, m: Move): State => {
    const target = s.board[m.to];
    const ns = applyMove(s, m);
    setLastMove(m);
    setMoveLog((l) => [...l.slice(-9), `${squareName(m.from)}${m.castle ? (m.castle === 'K' ? '-0' : '-0-0') : `-${squareName(m.to)}`}${m.promo ? `=${ROLE[m.promo].name}` : ''}`]);
    if (target || m.ep) {
      setCaptured((c) => [...c, (target ?? { t: 'p' as PieceType, c: s.turn === 'w' ? 'b' as Color : 'w' as Color }) as Piece]);
      sfx.thud(0.9);
    } else {
      sfx.pop(m.castle ? 1.3 : 1);
    }
    const gs = gameStatus(ns);
    if (gs.inCheck && !gs.over) {
      sfx.chime(2);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, '⚠️ SKAK! Teguran dari pengawas!', { size: 18, color: '#fbbf24' });
    }
    setSt(ns);
    setSel(null);
    setMoves([]);
    setPendingPromo(null);
    finishGame(ns);
    return ns;
  };

  // giliran AI (Tim Klien)
  useEffect(() => {
    if (screenRef.current !== 'play' || status.over || st.turn !== 'b' || result) return;
    setThinking(true);
    aiTimer.current = window.setTimeout(() => {
      const r = aiBestMove(st, 'b', 2);
      setThinking(false);
      if (r) {
        setSt((cur) => {
          if (cur.turn !== 'b' || gameStatus(cur).over) return cur;
          return doMove(cur, r.move);
        });
      }
    }, 450);
    return () => {
      if (aiTimer.current) window.clearTimeout(aiTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, screen, status.over, result]);

  const onSquare = (i: number): void => {
    sfx.ensure();
    if (screenRef.current !== 'play' || status.over || st.turn !== 'w' || thinking || pendingPromo) return;
    const p = st.board[i];
    if (sel !== null) {
      const cand = moves.filter((m) => m.to === i);
      if (cand.length > 0) {
        if (cand[0].promo) {
          setPendingPromo({ from: sel, to: i });
          sfx.click();
          return;
        }
        doMove(st, cand[0]);
        return;
      }
    }
    if (p && p.c === 'w') {
      if (sel === i) {
        setSel(null);
        setMoves([]);
      } else {
        setSel(i);
        setMoves(legalMovesFor(st, i));
        sfx.click();
      }
    } else {
      setSel(null);
      setMoves([]);
    }
  };

  const choosePromo = (t: PieceType): void => {
    if (!pendingPromo) return;
    const cand = legalMovesFor(st, pendingPromo.from).find((m) => m.to === pendingPromo.to && m.promo === t);
    if (cand) doMove(st, cand);
  };

  const reset = (): void => {
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    setSt(startState());
    setSel(null);
    setMoves([]);
    setThinking(false);
    setLastMove(null);
    setPendingPromo(null);
    setCaptured([]);
    setMoveLog([]);
    setResult(null);
  };

  const startGame = (): void => {
    sfx.ensure();
    reset();
    setScr('play');
  };

  const togglePause = (): void => {
    if (screenRef.current === 'play') setScr('pause');
    else if (screenRef.current === 'pause') setScr('play');
  };

  const toggleMute = (): void => {
    sfx.ensure();
    setMuted((m) => {
      const next = !m;
      if (sfx.muted !== next) sfx.toggleMute();
      return next;
    });
  };

  // keyboard: Escape = jeda
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') {
        if (screenRef.current === 'play') setScr('pause');
        else if (screenRef.current === 'pause') setScr('play');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const moveTargets = useMemo(() => new Map(moves.map((m) => [m.to, m])), [moves]);
  const checkSq = status.inCheck && !status.over ? kingSquare(st.board, st.turn) : -1;
  const myCaptured = captured.filter((p) => p.c === 'b');
  const aiCaptured = captured.filter((p) => p.c === 'w');

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(20,28,48,0.6)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 600, overflowY: 'auto', borderRadius: 18, background: 'linear-gradient(165deg,#1a2440,#0d1428)', fontFamily: FONT, color: '#e8eefc' }}>
      <style>{`
        @keyframes chessPulse { 0%,100% { box-shadow: 0 0 0 3px rgba(239,68,68,.9), 0 0 18px rgba(239,68,68,.7);} 50% { box-shadow: 0 0 0 6px rgba(239,68,68,.4), 0 0 26px rgba(239,68,68,.9);} }
        @keyframes chessThink { 0%,100% { opacity:.45;} 50% { opacity:1;} }
      `}</style>
      <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ background: 'rgba(10,16,34,0.7)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 14, padding: '8px 12px', backdropFilter: 'blur(6px)', minWidth: 190 }}>
          <div style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.5, color: '#fde047' }}>🏗️ CATUR PROYEK</div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.92 }}>
            {status.over ? '⏹️ Selesai' : st.turn === 'w'
              ? '🟡 Giliran: Tim Mandor (kamu)'
              : <span style={{ animation: 'chessThink 1s infinite' }}>🔴 Tim Klien mikir…</span>}
          </div>
          <div style={{ fontSize: 11, marginTop: 3, opacity: 0.75 }}>
            🔥 Menang beruntun: <b style={{ color: '#fde047' }}>{streak}</b> • 🏆 Menang: {getBest(BK_WINS, 0)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {/* papan */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 12px 0' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)',
          width: 'min(94vw, 400px)', aspectRatio: '1',
          borderRadius: 14, overflow: 'hidden',
          border: '6px solid #2c3a5e',
          boxShadow: '0 18px 44px rgba(0,0,0,0.5), inset 0 0 40px rgba(0,0,0,0.25)',
          touchAction: 'manipulation',
        }}>
          {st.board.map((p, i) => {
            const r = Math.floor(i / 8);
            const c = i % 8;
            const light = (r + c) % 2 === 1;
            const isSel = sel === i;
            const isLast = lastMove && (lastMove.from === i || lastMove.to === i);
            const tgt = moveTargets.get(i);
            const isCheck = checkSq === i;
            return (
              <div
                key={i}
                onClick={() => onSquare(i)}
                style={{
                  position: 'relative',
                  background: isSel ? '#b8860b' : isLast ? (light ? '#c9b458' : '#a8943f') : light ? '#dbe4f5' : '#5b6b8f',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  animation: isCheck ? 'chessPulse 1s infinite' : undefined,
                }}
              >
                {c === 0 && (
                  <span style={{ position: 'absolute', top: 1, left: 3, fontSize: 9, fontWeight: 800, color: light ? '#5b6b8f' : '#dbe4f5', opacity: 0.8 }}>{8 - r}</span>
                )}
                {r === 7 && (
                  <span style={{ position: 'absolute', bottom: 1, right: 4, fontSize: 9, fontWeight: 800, color: light ? '#5b6b8f' : '#dbe4f5', opacity: 0.8 }}>{'abcdefgh'[c]}</span>
                )}
                {tgt && !p && (
                  <span style={{ width: '32%', height: '32%', borderRadius: '50%', background: 'rgba(34,197,94,0.55)', boxShadow: '0 0 8px rgba(34,197,94,0.8)' }} />
                )}
                {tgt && p && (
                  <span style={{ position: 'absolute', inset: 3, borderRadius: '50%', border: '3px solid rgba(239,68,68,0.75)', pointerEvents: 'none' }} />
                )}
                {p && <PieceToken p={p} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* info bawah */}
      <div style={{ padding: '10px 14px 16px', maxWidth: 440, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <Tray title="Dirampas Mandor" pieces={myCaptured} color="#fde047" />
          <Tray title="Dirampas Klien" pieces={aiCaptured} color="#f87171" />
        </div>
        {moveLog.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '6px 10px' }}>
            📝 {moveLog.join(' · ')}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, opacity: 0.65, lineHeight: 1.7 }}>
          👷Mandor=raja • 📐Arsitek=menteri • 🏗️Tower Crane=benteng • 🧭Surveyor=gajah • 🚚Truk=kuda • 🦺Tukang=pion
        </div>
        <button onClick={reset} style={{ ...ghostBtn, marginTop: 10, padding: '10px 16px', fontSize: 14 }}>
          🔄 Ulangi Pertandingan
        </button>
      </div>

      {/* pilih promosi */}
      {pendingPromo && (
        <Overlay>
          <div style={{ fontSize: 40 }}>🎓</div>
          <h2 style={h2}>TUKANG NAIK PANGKAT!</h2>
          <p style={p}>Pion mencapai ujung proyek. Promosikan jadi:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {(['q', 'r', 'b', 'n'] as PieceType[]).map((t) => (
              <button key={t} onClick={() => choosePromo(t)} style={promoBtn}>
                <span style={{ fontSize: 30 }}>{ROLE[t].emoji}</span>
                <span style={{ fontSize: 12, fontWeight: 800 }}>{ROLE[t].name}</span>
              </button>
            ))}
          </div>
        </Overlay>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🏗️</div>
          <h2 style={h2}>CATUR PROYEK</h2>
          <p style={p}>
            Pimpin <b>Tim Mandor</b> (emas) melawan <b>Tim Klien</b> (merah, AI)!
            Ketuk buah lalu ketuk kotak tujuan — titik hijau = langkah, ring merah = rampas.
            Menangkan dengan <b>skakmat</b>!
          </p>
          {streak > 0 && <p style={p}>🔥 Menang beruntun: <b style={{ color: '#fde047' }}>{streak}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Proyek</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Rapat ditunda. Papan tetap seperti sedia kala.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && result && (
        <Overlay>
          <div style={{ fontSize: 42 }}>{result.win ? '🏆' : '🚧'}</div>
          <h2 style={{ ...h2, color: result.win ? '#4ade80' : '#f87171' }}>{result.text}</h2>
          <p style={p}>{result.sub}</p>
          <p style={p}>🔥 Beruntun: <b style={{ color: '#fde047' }}>{streak}</b> • 🏆 Total menang: {getBest(BK_WINS, 0)}</p>
          <button style={primaryBtn} onClick={startGame}>Main Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

function PieceToken({ p }: { p: Piece }): React.JSX.Element {
  const mine = p.c === 'w';
  const role = ROLE[p.t];
  return (
    <div style={{
      width: '88%', height: '88%', borderRadius: '50%',
      background: mine
        ? 'radial-gradient(circle at 32% 28%, #fef3c7, #fbbf24 55%, #b45309)'
        : 'radial-gradient(circle at 32% 28%, #fecaca, #ef4444 55%, #7f1d1d)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      boxShadow: mine
        ? '0 3px 8px rgba(0,0,0,0.4), inset 0 -3px 6px rgba(120,53,15,0.5), 0 0 10px rgba(251,191,36,0.35)'
        : '0 3px 8px rgba(0,0,0,0.4), inset 0 -3px 6px rgba(60,10,10,0.55)',
      border: `2px solid ${mine ? '#92400e' : '#450a0a'}`,
      pointerEvents: 'none',
    }}>
      <span style={{ fontSize: 'clamp(15px, 5.4vw, 24px)', lineHeight: 1, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))' }}>{role.emoji}</span>
      <span style={{ fontSize: 'clamp(6px, 1.9vw, 8.5px)', fontWeight: 900, color: mine ? '#451a03' : '#fff1f2', letterSpacing: 0.2, marginTop: 1 }}>{role.name}</span>
    </div>
  );
}

function Tray({ title, pieces, color }: { title: string; pieces: Piece[]; color: string }): React.JSX.Element {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '6px 8px', minHeight: 44 }}>
      <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 16, lineHeight: 1.3 }}>
        {pieces.length === 0 ? <span style={{ opacity: 0.3 }}>—</span> : pieces.map((p, i) => (
          <span key={i} title={ROLE[p.t].name} style={{ color }}>{ROLE[p.t].emoji}</span>
        ))}
      </div>
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#dbe7ff' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14,
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'transparent', color: '#93b4e8', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)',
};
const promoBtn: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  padding: '12px 8px', borderRadius: 12, border: '1px solid rgba(253,224,71,0.4)',
  background: 'rgba(253,224,71,0.08)', color: '#fff', cursor: 'pointer', fontFamily: FONT,
};

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,13,28,0.68)', backdropFilter: 'blur(5px)', zIndex: 20, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#26355c,#0f1830)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)', maxHeight: '92%', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
