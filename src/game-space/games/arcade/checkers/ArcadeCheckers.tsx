/**
 * ArcadeCheckers ("Dam Bata") — dam Inggris 8×8: bata merah (kamu) vs
 * batako abu (AI). Wajib makan, promosi jadi Bata Raja 👑.
 * AI "sedang": pintar tapi kadang blunder — bisa dikalahkan!
 */
import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  initialBoard, genMoves, applyMove, countPieces, gameStatus,
  aiPickMove, SIZE, type Board, type Move, type Side,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('dam-bata', 'menang');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

export default function ArcadeCheckers({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [screen, setScreen] = useState<Screen>('tutorial');
  const [board, setBoard] = useState<Board>(() => initialBoard());
  const [turn, setTurn] = useState<Side>('merah');
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [result, setResult] = useState<'' | 'merah-menang' | 'abu-menang'>('');
  const [wins, setWins] = useState(() => getBest(BK, 0));
  const [muted, setMuted] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: [number, number]; to: [number, number] } | null>(null);

  const playerMoves = (b: Board): Move[] => genMoves(b, 'merah');

  const newGame = (): void => {
    sfx.ensure();
    setBoard(initialBoard());
    setTurn('merah');
    setSel(null);
    setMoves([]);
    setAiThinking(false);
    setResult('');
    setLastMove(null);
    setScreen('play');
  };

  const endCheck = (b: Board, nextTurn: Side): boolean => {
    const st = gameStatus(b, nextTurn);
    if (st === 'jalan') return false;
    const wrap = wrapRef.current;
    if (st === 'merah-menang') {
      const nb = setBest(BK, wins + 1);
      setWins(nb);
      setResult('merah-menang');
      sfx.chime(4);
      if (wrap) popText(wrap, 'BATA MERAH MENANG! 🧱🏆', { size: 26, color: '#4ade80' });
    } else {
      setResult('abu-menang');
      sfx.fail();
      if (wrap) popText(wrap, 'Batako menang…', { size: 22, color: '#f87171' });
    }
    window.setTimeout(() => setScreen('over'), 1100);
    return true;
  };

  const doPlayerMove = (m: Move): void => {
    const nb = applyMove(board, m);
    const caps = m.steps.filter((s) => s.captured).length;
    if (caps > 0) {
      sfx.thud(0.8);
      api_shake_hint();
    } else {
      sfx.click();
    }
    if (m.promote) {
      sfx.chime(3);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, '👑 BATA RAJA!', { size: 22, color: '#fde047' });
    }
    const last = m.steps[m.steps.length - 1].to;
    setLastMove({ from: m.from, to: last });
    setBoard(nb);
    setSel(null);
    setMoves([]);
    if (endCheck(nb, 'abu')) return;
    setTurn('abu');
  };

  const api_shake_hint = (): void => {
    const wrap = wrapRef.current;
    if (wrap) popText(wrap, 'Makan! 😋', { size: 16, color: '#fdba74' });
  };

  // giliran AI
  useEffect(() => {
    if (screen !== 'play' || turn !== 'abu' || result) return;
    setAiThinking(true);
    const t = window.setTimeout(() => {
      const m = aiPickMove(board, 'abu', Math.random);
      setAiThinking(false);
      if (!m) {
        endCheck(board, 'abu');
        return;
      }
      const nb = applyMove(board, m);
      const caps = m.steps.filter((s) => s.captured).length;
      if (caps > 0) sfx.thud(0.6);
      else sfx.click();
      if (m.promote) sfx.chime(2);
      const last = m.steps[m.steps.length - 1].to;
      setLastMove({ from: m.from, to: last });
      setBoard(nb);
      if (endCheck(nb, 'merah')) return;
      setTurn('merah');
    }, 700);
    return () => window.clearTimeout(t);
  }, [screen, turn, board, result]); // eslint-disable-line react-hooks/exhaustive-deps

  const tapCell = (r: number, c: number): void => {
    if (screen !== 'play' || turn !== 'merah' || aiThinking || result) return;
    // ada langkah ke sini?
    const mv = moves.find((m) => {
      const last = m.steps[m.steps.length - 1].to;
      return last[0] === r && last[1] === c;
    });
    if (mv) {
      doPlayerMove(mv);
      return;
    }
    const p = board[r][c];
    if (p && p.side === 'merah') {
      sfx.click();
      const all = playerMoves(board);
      const mine = all.filter((m) => m.from[0] === r && m.from[1] === c);
      setSel([r, c]);
      setMoves(mine);
    } else {
      setSel(null);
      setMoves([]);
    }
  };

  const toggleMute = (): void => {
    sfx.ensure();
    setMuted((m) => {
      const next = !m;
      if (sfx.muted !== next) sfx.toggleMute();
      return next;
    });
  };

  const cnt = countPieces(board);
  const mustEat = moves.length > 0 && moves[0].steps.some((s) => s.captured);
  const dests = new Map<string, Move>();
  for (const m of moves) {
    const last = m.steps[m.steps.length - 1].to;
    dests.set(`${last[0]},${last[1]}`, m);
  }

  return (
    <div ref={wrapRef} style={{
      position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden',
      borderRadius: 18, fontFamily: FONT, color: '#f1f5f9', display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(120% 90% at 50% 0%, #4a3b2a 0%, #33271a 55%, #1c130b 100%)',
    }}>
      {/* HUD */}
      <div style={{ position: 'relative', zIndex: 5, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ background: 'rgba(15,10,5,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '6px 12px', backdropFilter: 'blur(6px)', fontSize: 13, fontWeight: 800 }}>
          {aiThinking ? '🤔 Batako mikir…' : turn === 'merah' ? '🧱 Giliranmu!' : '⏳ …'}
          {mustEat && <div style={{ color: '#f87171', fontSize: 11 }}>WAJIB MAKAN!</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(screen === 'play' || screen === 'pause') && (
            <button style={iconBtn} onClick={() => setScreen(screen === 'play' ? 'pause' : 'play')} aria-label="Jeda">
              {screen === 'play' ? '⏸' : '▶'}
            </button>
          )}
          <button style={iconBtn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={iconBtn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {/* papan */}
      <div style={{ position: 'relative', zIndex: 4, display: 'flex', justifyContent: 'center', padding: '2px 14px' }}>
        <div style={{
          width: '100%', maxWidth: 380, aspectRatio: '1', borderRadius: 14, overflow: 'hidden',
          display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)',
          border: '6px solid #5e3a16',
          boxShadow: '0 16px 44px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(255,255,255,0.1)',
        }}>
          {Array.from({ length: SIZE * SIZE }, (_, i) => {
            const r = Math.floor(i / SIZE);
            const c = i % SIZE;
            const dark = (r + c) % 2 === 1;
            const p = board[r][c];
            const isSel = sel?.[0] === r && sel?.[1] === c;
            const dest = dests.get(`${r},${c}`);
            const isLastFrom = lastMove?.from[0] === r && lastMove?.from[1] === c;
            const isLastTo = lastMove?.to[0] === r && lastMove?.to[1] === c;
            return (
              <button
                key={i}
                onClick={() => tapCell(r, c)}
                aria-label={`kotak ${r},${c}`}
                style={{
                  position: 'relative', border: 'none', padding: 0, cursor: 'pointer',
                  background: isLastTo ? 'rgba(74,222,128,0.45)' : isLastFrom ? 'rgba(253,224,71,0.35)' : dark ? '#6b4f2e' : '#c9b189',
                  boxShadow: isSel ? 'inset 0 0 0 3px #fde047' : 'none',
                }}
              >
                {dest && (
                  <span style={{
                    position: 'absolute', inset: '30%', borderRadius: '50%',
                    background: dest.steps.some((s) => s.captured) ? 'rgba(248,113,113,0.85)' : 'rgba(74,222,128,0.7)',
                    boxShadow: '0 0 10px rgba(0,0,0,0.4)',
                  }} />
                )}
                {p && <BrickPiece side={p.side} king={p.king} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* skor bidak */}
      <div style={{ position: 'relative', zIndex: 4, display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10, fontSize: 13, fontWeight: 800 }}>
        <span>🧱 Merah: {cnt.merah.man + cnt.merah.king} {cnt.merah.king > 0 && <span style={{ color: '#fde047' }}>({cnt.merah.king}👑)</span>}</span>
        <span>⬜ Batako: {cnt.abu.man + cnt.abu.king} {cnt.abu.king > 0 && <span style={{ color: '#fde047' }}>({cnt.abu.king}👑)</span>}</span>
      </div>
      <div style={{ position: 'relative', zIndex: 4, textAlign: 'center', fontSize: 12, opacity: 0.7, marginTop: 6 }}>
        🏆 Kemenanganmu: {wins} • {aiThinking ? 'Batako sedang mikir…' : 'Ketuk bidak merah, lalu ketuk tujuan'}
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🧱</div>
          <h2 style={h2}>DAM BATA</h2>
          <p style={p}>
            Adu strategi <b>bata merah</b> (kamu) vs <b>batako</b> (AI)!
            <b> Wajib makan</b> bila bisa, dan bidak yang sampai ujung jadi <b>👑 Bata Raja</b> —
            bisa jalan dua arah!
          </p>
          <p style={p}>AI-nya <b>sedang</b>: lumayan pintar, tapi kadang blunder. Kalahkan dia!</p>
          {wins > 0 && <p style={p}>Kemenanganmu: <b style={{ color: '#fde047' }}>{wins}</b></p>}
          <button style={primaryBtn} onClick={newGame}>Mulai Masang Bata</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Bata-batanya ikut istirahat. Susunannya aman.</p>
          <button style={primaryBtn} onClick={() => setScreen('play')}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>{result === 'merah-menang' ? '🏆' : '🧱'}</div>
          <h2 style={h2}>{result === 'merah-menang' ? 'BATA MERAH JUARA!' : 'BATAKO MENANG'}</h2>
          <p style={p}>
            {result === 'merah-menang'
              ? 'Dinding bata merahmu tak tertembus! Mandor kasih acungan jempol. 👍'
              : 'Batako kali ini lebih rapi. Ayo balas dendam!'}
          </p>
          <p style={p}>Total kemenanganmu: <b style={{ color: '#fde047' }}>{wins}</b></p>
          <button style={primaryBtn} onClick={newGame}>Main Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

function BrickPiece({ side, king }: { side: Side; king: boolean }): React.JSX.Element {
  const isRed = side === 'merah';
  return (
    <span style={{
      position: 'absolute', inset: '8%', borderRadius: '50%',
      background: isRed
        ? 'repeating-linear-gradient(0deg, transparent, transparent 5px, rgba(0,0,0,0.22) 5px, rgba(0,0,0,0.22) 7px), radial-gradient(circle at 32% 28%, #f87171, #b91c1c 75%)'
        : 'repeating-linear-gradient(90deg, transparent, transparent 7px, rgba(0,0,0,0.18) 7px, rgba(0,0,0,0.18) 9px), radial-gradient(circle at 32% 28%, #d1d5db, #6b7280 75%)',
      border: king ? '3px solid #fde047' : '2px solid rgba(0,0,0,0.35)',
      boxShadow: king
        ? '0 0 12px rgba(253,224,71,0.7), 0 4px 8px rgba(0,0,0,0.5)'
        : '0 4px 8px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: king ? 20 : 0,
    }}>
      {king ? '👑' : ''}
    </span>
  );
}

const iconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(15,10,5,0.6)', color: '#fff', fontSize: 18, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
};
const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#f5efe4' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#d6c9b0', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,10,5,0.66)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#4a3b2a,#241a0e)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}
