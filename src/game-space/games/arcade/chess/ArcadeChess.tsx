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

/** Buah catur = peran proyek. Bidak digambar sebagai SVG prosedural
 * (PieceGlyph di bawah) — bukan emoji, bukan hasil generate. */
const ROLE: Record<PieceType, { name: string }> = {
  k: { name: 'Mandor' },
  q: { name: 'Arsitek' },
  r: { name: 'T.Crane' },
  b: { name: 'Surveyor' },
  n: { name: 'Truk' },
  p: { name: 'Tukang' },
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
      text = 'PROYEK SELESAI!';
      sub = gs.reason === 'checkmate' ? 'Skakmat! Klien tanda tangan kontrak.' : 'Klien menyerah — proyek dimenangkan Tim Mandor.';
      const ns = setBest(BK_STREAK, getBest(BK_STREAK, 0) + 1);
      setStreak(ns);
      setBest(BK_WINS, getBest(BK_WINS, 0) + 1);
      sfx.chime(4);
    } else if (gs.result === 'b') {
      text = 'PROYEK MANGKRAK!';
      sub = 'Skakmat oleh Tim Klien. Revisi strategi, coba lagi!';
      setBest(BK_STREAK, 0);
      setStreak(0);
      sfx.fail();
    } else {
      text = 'SERI';
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
      if (wrap) popText(wrap, 'SKAK! Teguran dari pengawas!', { size: 18, color: '#fbbf24' });
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
          <div style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.5, color: '#fde047', display: 'flex', alignItems: 'center', gap: 6 }}>
            <PieceGlyph t="r" mine size={18} /> CATUR PROYEK
          </div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.92, display: 'flex', alignItems: 'center', gap: 6 }}>
            {status.over ? 'Selesai' : st.turn === 'w'
              ? <><Dot color="#fbbf24" /> Giliran: Tim Mandor (kamu)</>
              : <span style={{ animation: 'chessThink 1s infinite', display: 'flex', alignItems: 'center', gap: 6 }}><Dot color="#ef4444" /> Tim Klien mikir…</span>}
          </div>
          <div style={{ fontSize: 11, marginTop: 3, opacity: 0.75 }}>
            Menang beruntun: <b style={{ color: '#fde047' }}>{streak}</b> • Total menang: {getBest(BK_WINS, 0)}
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

      {/* papan — label koordinat di GUTTER luar sel (perbaikan P2):
          rank 8..1 di kolom margin kiri, file a..h di baris margin bawah,
          keduanya di atas bingkai papan, TIDAK di dalam sel, sehingga tidak
          pernah tertutup lingkaran bidak (bidak memenuhi 88% sel). */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 12px 0' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '18px 1fr',
          gridTemplateRows: '1fr 18px',
          width: 'min(94vw, 418px)', aspectRatio: '418 / 418',
          background: '#2c3a5e', borderRadius: 14, padding: 6, gap: 4,
          boxShadow: '0 18px 44px rgba(0,0,0,0.5)',
          touchAction: 'manipulation', boxSizing: 'border-box',
        }}>
          {/* gutter rank (kiri, di luar papan) */}
          <div style={{ display: 'grid', gridTemplateRows: 'repeat(8, 1fr)' }} aria-hidden>
            {[8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#dbe4f5' }}>{n}</div>
            ))}
          </div>
          {/* sel-sel papan */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)',
            borderRadius: 8, overflow: 'hidden',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.25)',
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
          {/* sudut kosong di bawah gutter rank */}
          <div />
          {/* gutter file (bawah, di luar papan) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)' }} aria-hidden>
            {'abcdefgh'.split('').map((ch) => (
              <div key={ch} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#dbe4f5' }}>{ch}</div>
            ))}
          </div>
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
            Langkah: {moveLog.join(' · ')}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, opacity: 0.85, lineHeight: 1.7, display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'center' }}>
          {(Object.keys(ROLE) as PieceType[]).map((t) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <PieceGlyph t={t} mine size={15} /> {ROLE[t].name}={t === 'k' ? 'raja' : t === 'q' ? 'menteri' : t === 'r' ? 'benteng' : t === 'b' ? 'gajah' : t === 'n' ? 'kuda' : 'pion'}
            </span>
          ))}
        </div>
        <button onClick={reset} style={{ ...ghostBtn, marginTop: 10, padding: '10px 16px', fontSize: 14 }}>
          Ulangi Pertandingan
        </button>
      </div>

      {/* pilih promosi */}
      {pendingPromo && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}><PieceGlyph t="q" mine size={44} /></div>
          <h2 style={h2}>TUKANG NAIK PANGKAT!</h2>
          <p style={p}>Pion mencapai ujung proyek. Promosikan jadi:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {(['q', 'r', 'b', 'n'] as PieceType[]).map((t) => (
              <button key={t} onClick={() => choosePromo(t)} style={promoBtn}>
                <PieceGlyph t={t} mine size={32} />
                <span style={{ fontSize: 12, fontWeight: 800 }}>{ROLE[t].name}</span>
              </button>
            ))}
          </div>
        </Overlay>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
            <PieceGlyph t="k" mine size={46} />
            <PieceGlyph t="r" mine={false} size={46} />
          </div>
          <h2 style={h2}>CATUR PROYEK</h2>
          <p style={p}>
            Pimpin <b>Tim Mandor</b> (emas) melawan <b>Tim Klien</b> (merah, AI)!
            Ketuk buah lalu ketuk kotak tujuan — titik hijau = langkah, ring merah = rampas.
            Menangkan dengan <b>skakmat</b>!
          </p>
          {streak > 0 && <p style={p}>Menang beruntun: <b style={{ color: '#fde047' }}>{streak}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Proyek</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>⏸</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Rapat ditunda. Papan tetap seperti sedia kala.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && result && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <PieceGlyph t={result.win ? 'k' : 'r'} mine={result.win} size={46} />
          </div>
          <h2 style={{ ...h2, color: result.win ? '#4ade80' : '#f87171' }}>{result.text}</h2>
          <p style={p}>{result.sub}</p>
          <p style={p}>Beruntun: <b style={{ color: '#fde047' }}>{streak}</b> • Total menang: {getBest(BK_WINS, 0)}</p>
          <button style={primaryBtn} onClick={startGame}>Main Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

function Dot({ color }: { color: string }): React.JSX.Element {
  return <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0, boxShadow: `0 0 6px ${color}` }} />;
}

/**
 * Glif bidak TERDESAIN — SVG prosedural digambar kode (BUKAN hasil generate,
 * dicatat jujur mengikuti pola Sudoku pilot). Satu siluet khas per peran
 * proyek + tanda peran bergaya mahkota catur agar tetap terbaca sebagai
 * bidak: Mandor = helm + mahkota kecil, Arsitek = mahkota + segitiga siku,
 * T.Crane = menara crane, Surveyor = tripod theodolite, Truk = truk molen,
 * Tukang = helm + rompi. Warna tim: emas (Mandor) vs merah (Klien).
 */
function PieceGlyph({ t, mine, size = 24 }: { t: PieceType; mine: boolean; size?: number }): React.JSX.Element {
  const team = mine ? '#92400e' : '#7f1d1d'; // garis gelap tim
  const accent = mine ? '#b45309' : '#991b1b';
  const helm = '#f5b301';
  const skin = '#fcd9b8';
  const metal = mine ? '#dbe4f5' : '#fecaca';
  const common = { stroke: team, strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      {t === 'k' && (<>
        {/* mahkota raja di atas helm */}
        <path d="M14 10 L18 4 L24 9 L30 4 L34 10 L33 14 L15 14 Z" fill={mine ? '#fbbf24' : '#f87171'} {...common} />
        {/* helm proyek */}
        <path d="M10 26 a14 11 0 0 1 28 0 Z" fill={helm} {...common} />
        <rect x="6" y="25" width="36" height="5" rx="2.5" fill={helm} {...common} />
        {/* wajah + rompi */}
        <circle cx="24" cy="33" r="5.5" fill={skin} {...common} />
        <path d="M14 44 a10 6 0 0 1 20 0 Z" fill={accent} {...common} />
      </>)}
      {t === 'q' && (<>
        {/* mahkota menteri 3 ujung + permata */}
        <path d="M10 20 L13 8 L20 15 L24 6 L28 15 L35 8 L38 20 Z" fill={mine ? '#fbbf24' : '#f87171'} {...common} />
        <circle cx="24" cy="14" r="2.4" fill={metal} {...common} />
        {/* segitiga siku arsitek */}
        <path d="M24 24 L38 40 L10 40 Z" fill={metal} {...common} />
        <path d="M24 30 L31 40 L17 40 Z" fill={accent} opacity={0.55} />
        <rect x="8" y="42" width="32" height="3.4" rx="1.7" fill={accent} {...common} />
      </>)}
      {t === 'r' && (<>
        {/* tower crane: menara + jib + counter-jib + kait */}
        <rect x="21" y="14" width="6" height="28" fill={accent} {...common} />
        <path d="M21 20 L27 26 M27 20 L21 26 M21 30 L27 36 M27 30 L21 36" stroke={team} strokeWidth={1.6} />
        <rect x="4" y="8" width="40" height="5" rx="2" fill={mine ? '#fbbf24' : '#f87171'} {...common} />
        <rect x="4" y="13" width="7" height="7" fill={accent} {...common} />
        <line x1="38" y1="13" x2="38" y2="22" stroke={team} strokeWidth={2} />
        <rect x="34.5" y="22" width="7" height="6" rx="1" fill={metal} {...common} />
        <rect x="12" y="42" width="24" height="3.4" rx="1.7" fill={accent} {...common} />
      </>)}
      {t === 'b' && (<>
        {/* theodolite surveyor: kotak alat + lensa + tripod */}
        <rect x="14" y="8" width="20" height="13" rx="3" fill={mine ? '#fbbf24' : '#f87171'} {...common} />
        <circle cx="24" cy="14.5" r="4.4" fill={metal} {...common} />
        <circle cx="24" cy="14.5" r="1.8" fill={team} />
        <line x1="24" y1="21" x2="24" y2="27" stroke={team} strokeWidth={2.4} />
        <path d="M24 27 L12 42 M24 27 L24 43 M24 27 L36 42" stroke={team} strokeWidth={2.6} strokeLinecap="round" fill="none" />
        <circle cx="24" cy="27" r="2.6" fill={accent} {...common} />
      </>)}
      {t === 'n' && (<>
        {/* truk molen (kuda = kendaraan proyek) */}
        <path d="M6 16 h20 v14 H6 Z" fill={accent} {...common} />
        <ellipse cx="16" cy="23" rx="7.5" ry="6" fill={metal} {...common} transform="rotate(-24 16 23)" />
        <path d="M26 21 h8 l6 6 v3 H26 Z" fill={mine ? '#fbbf24' : '#f87171'} {...common} />
        <rect x="29" y="23" width="6" height="5" fill={metal} {...common} />
        <circle cx="14" cy="33" r="4.6" fill={team} /><circle cx="14" cy="33" r="2" fill={metal} />
        <circle cx="33" cy="33" r="4.6" fill={team} /><circle cx="33" cy="33" r="2" fill={metal} />
        <line x1="4" y1="38" x2="44" y2="38" stroke={team} strokeWidth={2.4} strokeLinecap="round" />
      </>)}
      {t === 'p' && (<>
        {/* tukang: helm kecil + rompi keselamatan */}
        <path d="M13 19 a11 8.5 0 0 1 22 0 Z" fill={helm} {...common} />
        <rect x="9" y="18" width="30" height="4.4" rx="2.2" fill={helm} {...common} />
        <circle cx="24" cy="25" r="4.4" fill={skin} {...common} />
        <path d="M13 43 a11 9 0 0 1 22 0 Z" fill="#f97316" {...common} />
        <line x1="17" y1="36" x2="31" y2="36" stroke="#e2e8f0" strokeWidth={2.6} />
      </>)}
    </svg>
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
    }} title={role.name}>
      <PieceGlyph t={p.t} mine={mine} size={24} />
      <span style={{ fontSize: 'clamp(6px, 1.9vw, 8.5px)', fontWeight: 900, color: mine ? '#451a03' : '#fff1f2', letterSpacing: 0.2, marginTop: 0 }}>{role.name}</span>
    </div>
  );
}

function Tray({ title, pieces, color }: { title: string; pieces: Piece[]; color: string }): React.JSX.Element {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '6px 8px', minHeight: 44 }}>
      <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
        {pieces.length === 0 ? <span style={{ opacity: 0.3 }}>—</span> : pieces.map((p, i) => (
          <span key={i} title={ROLE[p.t].name} style={{ background: color, borderRadius: '50%', padding: 1, display: 'inline-flex' }}>
            <PieceGlyph t={p.t} mine={p.c === 'w'} size={15} />
          </span>
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
