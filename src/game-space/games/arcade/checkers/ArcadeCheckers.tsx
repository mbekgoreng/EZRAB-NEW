/**
 * ArcadeCheckers ("Dam Bata") — dam Inggris 8x8: bata merah (kamu) vs
 * batako abu (AI). Wajib makan, promosi jadi Bata Raja.
 * AI "sedang": pintar tapi kadang blunder — bisa dikalahkan!
 * Bidak digambar sebagai SVG prosedural: keping bata merah (pola susun
 * bata) vs keping batako abu (pola helm semen); raja = keping ganda
 * bercincin emas + bintang tergambar. Bukan emoji.
 */
import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  initialBoard, genMoves, applyMove, countPieces, gameStatus,
  aiPickMove, forcedCapture, movesEndingAt, captureCount,
  SIZE, type Board, type Move, type Side,
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
  // Pratinjau jalur bila >1 langkah berakhir di kotak tujuan yang sama:
  // pemain memilih jalur lewat bilah konfirmasi, bukan dipaksa jalur pertama.
  const [preview, setPreview] = useState<{ key: string; idx: number } | null>(null);

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
    setPreview(null);
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
      if (wrap) popText(wrap, 'BATA MERAH MENANG!', { size: 26, color: '#4ade80' });
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
    const caps = captureCount(m);
    if (caps > 0) {
      sfx.thud(0.8);
      api_shake_hint();
    } else {
      sfx.click();
    }
    if (m.promote) {
      sfx.chime(3);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, 'BATA RAJA!', { size: 22, color: '#fde047' });
    }
    const last = m.steps[m.steps.length - 1].to;
    setLastMove({ from: m.from, to: last });
    setBoard(nb);
    setSel(null);
    setMoves([]);
    setPreview(null);
    if (endCheck(nb, 'abu')) return;
    setTurn('abu');
  };

  const api_shake_hint = (): void => {
    const wrap = wrapRef.current;
    if (wrap) popText(wrap, 'Makan!', { size: 16, color: '#fdba74' });
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
    // SEMUA langkah ke kotak ini — bisa lebih dari satu jalur (rantai
    // makan berbeda, tujuan akhir sama). Jangan ambil yang pertama saja.
    const variants = movesEndingAt(moves, r, c);
    if (variants.length === 1) {
      doPlayerMove(variants[0]);
      return;
    }
    if (variants.length > 1) {
      const key = `${r},${c}`;
      if (!preview || preview.key !== key) {
        sfx.click();
        setPreview({ key, idx: 0 });
      }
      return;
    }
    const p = board[r][c];
    if (p && p.side === 'merah') {
      sfx.click();
      const all = playerMoves(board);
      const mine = all.filter((m) => m.from[0] === r && m.from[1] === c);
      if (mine.length === 0 && forcedCapture(board, 'merah').mandatory) {
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, 'Wajib makan — pilih bidak bercincin merah!', { size: 14, color: '#fca5a5' });
      }
      setSel([r, c]);
      setMoves(mine);
      setPreview(null);
    } else {
      setSel(null);
      setMoves([]);
      setPreview(null);
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
  // Kewajiban makan dihitung dari papan + giliran, BUKAN dari pilihan
  // pemain — indikator & sorotan tampil sejak awal giliran.
  const duty = turn === 'merah' && screen === 'play' ? forcedCapture(board, 'merah') : null;
  const mustEat = duty?.mandatory === true;
  const mandatorySet = new Set((duty?.capturers ?? []).map(([r, c]) => `${r},${c}`));
  const dests = new Map<string, Move[]>();
  for (const m of moves) {
    const last = m.steps[m.steps.length - 1].to;
    const key = `${last[0]},${last[1]}`;
    const arr = dests.get(key) ?? [];
    arr.push(m);
    dests.set(key, arr);
  }
  const previewVariants = preview ? (dests.get(preview.key) ?? []) : [];
  const previewMove = previewVariants.length > 0
    ? previewVariants[Math.min(preview?.idx ?? 0, previewVariants.length - 1)]
    : null;
  const previewStepCells = new Set((previewMove?.steps ?? []).map((s) => `${s.to[0]},${s.to[1]}`));
  const previewCapCells = new Set(
    (previewMove?.steps ?? []).flatMap((s) => (s.captured ? [`${s.captured[0]},${s.captured[1]}`] : [])),
  );
  const capturedByMerah = 12 - (cnt.abu.man + cnt.abu.king);
  const capturedByAbu = 12 - (cnt.merah.man + cnt.merah.king);

  return (
    <div ref={wrapRef} style={{
      position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden',
      borderRadius: 18, fontFamily: FONT, color: '#f1f5f9', display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(120% 90% at 50% 0%, #4a3b2a 0%, #33271a 55%, #1c130b 100%)',
    }}>
      {/* HUD */}
      <div style={{ position: 'relative', zIndex: 5, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ background: 'rgba(15,10,5,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '6px 12px', backdropFilter: 'blur(6px)', fontSize: 13, fontWeight: 800 }}>
          {aiThinking ? 'Batako mikir…' : turn === 'merah' ? 'Giliranmu!' : '…'}
          {mustEat && (
            <div style={{ color: '#f87171', fontSize: 11 }}>
              WAJIB MAKAN!{duty && duty.maxChain > 1 ? ` Rantai ×${duty.maxChain} tersedia` : ''}
            </div>
          )}
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
            const destArr = dests.get(`${r},${c}`);
            const destIsCapture = destArr !== undefined && destArr[0].steps.some((s) => s.captured);
            const isMandatory = mandatorySet.has(`${r},${c}`);
            const isPreviewStep = previewStepCells.has(`${r},${c}`);
            const isPreviewCap = previewCapCells.has(`${r},${c}`);
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
                {destArr && (
                  destIsCapture ? (
                    <span style={{
                      position: 'absolute', inset: '14%', borderRadius: '50%',
                      border: '3px solid rgba(248,113,113,0.95)',
                      background: 'rgba(248,113,113,0.25)',
                      boxShadow: '0 0 10px rgba(0,0,0,0.4)',
                    }} />
                  ) : (
                    <span style={{
                      position: 'absolute', inset: '32%', borderRadius: '50%',
                      background: 'rgba(74,222,128,0.75)',
                      boxShadow: '0 0 10px rgba(0,0,0,0.4)',
                    }} />
                  ))
                }
                {destArr && destArr.length > 1 && (
                  <span style={{
                    position: 'absolute', top: 1, right: 1, zIndex: 3, minWidth: 15, height: 15,
                    borderRadius: 8, background: '#f59e0b', color: '#1c130b', fontSize: 10,
                    fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 3px',
                  }}>{destArr.length}</span>
                )}
                {isPreviewStep && (
                  <span style={{
                    position: 'absolute', inset: '6%', borderRadius: '50%', zIndex: 2,
                    border: '3px dashed #fde047', pointerEvents: 'none',
                  }} />
                )}
                {p && isMandatory && !isSel && (
                  <span style={{
                    position: 'absolute', inset: '3%', borderRadius: '50%', zIndex: 2,
                    border: '3px solid rgba(248,113,113,0.95)',
                    boxShadow: '0 0 12px rgba(248,113,113,0.55)', pointerEvents: 'none',
                  }} />
                )}
                {p && isPreviewCap && (
                  <span style={{
                    position: 'absolute', inset: '8%', borderRadius: '50%', zIndex: 2,
                    border: '3px solid rgba(239,68,68,0.95)', pointerEvents: 'none',
                  }} />
                )}
                {p && <BrickPiece side={p.side} king={p.king} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* bilah pilihan jalur bila tujuan akhir sama */}
      {previewMove && previewVariants.length > 1 && (
        <div style={{
          position: 'relative', zIndex: 5, margin: '10px 14px 0', padding: '8px 10px',
          background: 'rgba(15,10,5,0.72)', border: '1px solid rgba(253,224,71,0.45)', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
          fontSize: 12, fontWeight: 800,
        }}>
          <span>
            Jalur {(preview?.idx ?? 0) + 1}/{previewVariants.length}: makan {captureCount(previewMove)} bidak
            ({previewMove.steps.length} lompatan, garis kuning = lintasannya)
          </span>
          <button
            style={miniBtn}
            onClick={() => setPreview((pv) => (pv ? { key: pv.key, idx: (pv.idx + 1) % previewVariants.length } : pv))}
          >Ganti Jalur</button>
          <button style={{ ...miniBtn, background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00' }} onClick={() => doPlayerMove(previewMove)}>
            Jalankan
          </button>
          <button style={miniBtn} onClick={() => setPreview(null)}>Batal</button>
        </div>
      )}

      {/* skor bidak */}
      <div style={{ position: 'relative', zIndex: 4, display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10, fontSize: 13, fontWeight: 800 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <PieceGlyph side="merah" king={false} size={17} /> Merah: {cnt.merah.man + cnt.merah.king}
          {cnt.merah.king > 0 && (
            <span style={{ color: '#fde047', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              ({cnt.merah.king}<PieceGlyph side="merah" king size={15} />)
            </span>
          )}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <PieceGlyph side="abu" king={false} size={17} /> Batako: {cnt.abu.man + cnt.abu.king}
          {cnt.abu.king > 0 && (
            <span style={{ color: '#fde047', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              ({cnt.abu.king}<PieceGlyph side="abu" king size={15} />)
            </span>
          )}
        </span>
      </div>

      {/* tray bidak tertangkap — glif SVG yang sama, ukuran kecil */}
      <div style={{ position: 'relative', zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, marginTop: 6, fontSize: 11, fontWeight: 700 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, minHeight: 16 }}>
          <span style={{ opacity: 0.75, marginRight: 4 }}>Tangkapanmu:</span>
          {capturedByMerah === 0
            ? <span style={{ opacity: 0.5 }}>—</span>
            : Array.from({ length: capturedByMerah }, (_, k) => <PieceGlyph key={k} side="abu" king={false} size={14} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, minHeight: 16 }}>
          <span style={{ opacity: 0.75, marginRight: 4 }}>Tangkapan Batako:</span>
          {capturedByAbu === 0
            ? <span style={{ opacity: 0.5 }}>—</span>
            : Array.from({ length: capturedByAbu }, (_, k) => <PieceGlyph key={k} side="merah" king={false} size={14} />)}
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 4, textAlign: 'center', fontSize: 12, opacity: 0.7, marginTop: 6 }}>
        Kemenanganmu: {wins} • {aiThinking ? 'Batako sedang mikir…' : 'Ketuk bidak merah, lalu ketuk tujuan'}
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
            <PieceGlyph side="merah" king={false} size={46} />
            <PieceGlyph side="abu" king={false} size={46} />
          </div>
          <h2 style={h2}>DAM BATA</h2>
          <p style={p}>
            Adu strategi <b>bata merah</b> (kamu) vs <b>batako</b> (AI)!
            <b> Wajib makan</b> bila bisa — bidak yang wajib makan bercincin merah — dan bidak
            yang sampai ujung jadi <b>Bata Raja</b> (keping ganda bercincin emas), bisa jalan dua arah!
          </p>
          <p style={p}>AI-nya <b>sedang</b>: lumayan pintar, tapi kadang blunder. Kalahkan dia!</p>
          {wins > 0 && <p style={p}>Kemenanganmu: <b style={{ color: '#fde047' }}>{wins}</b></p>}
          <button style={primaryBtn} onClick={newGame}>Mulai Masang Bata</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <PieceGlyph side="merah" king size={46} />
          </div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Bata-batanya ikut istirahat. Susunannya aman.</p>
          <button style={primaryBtn} onClick={() => setScreen('play')}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <PieceGlyph side={result === 'merah-menang' ? 'merah' : 'abu'} king size={46} />
          </div>
          <h2 style={h2}>{result === 'merah-menang' ? 'BATA MERAH JUARA!' : 'BATAKO MENANG'}</h2>
          <p style={p}>
            {result === 'merah-menang'
              ? 'Dinding bata merahmu tak tertembus! Mandor kasih acungan jempol.'
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

/** Titik bintang 5 sudut untuk penanda raja (digambar, bukan emoji). */
function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? outer : inner;
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/**
 * Glif bidak SVG prosedural.
 * Merah = keping bata: cakram merah + garis nat susun bata.
 * Abu = keping batako: cakram abu + kubah helm semen & bibir helm.
 * Raja = keping GANDA (cakram kedua di bawah) + cincin emas + bintang.
 */
function PieceGlyph({ side, king, size }: { side: Side; king: boolean; size: number | string }): React.JSX.Element {
  const red = side === 'merah';
  const cy = king ? 21 : 24;
  const baseFill = red ? '#c22f24' : '#9aa3ad';
  const edgeFill = red ? '#7f1d1d' : '#4b5563';
  const faceStroke = red ? '#8f2318' : '#5b6470';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={king ? `bidak ${red ? 'bata merah' : 'batako'} raja` : `bidak ${red ? 'bata merah' : 'batako'}`}
      style={{ display: 'block', flex: 'none' }}
    >
      <ellipse cx="24" cy="43" rx="14" ry="3" fill="rgba(0,0,0,0.35)" />
      {king && <circle cx="24" cy="28" r="18" fill={edgeFill} />}
      <circle cx="24" cy={cy} r="18" fill={baseFill} stroke={faceStroke} strokeWidth="2" />
      <circle cx="24" cy={cy} r="13.5" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="1.4" />
      {red ? (
        <g stroke="rgba(60,10,5,0.45)" strokeWidth="1.7">
          <line x1="11" y1={cy - 5} x2="37" y2={cy - 5} />
          <line x1="9" y1={cy + 4} x2="39" y2={cy + 4} />
          <line x1="24" y1={cy - 12} x2="24" y2={cy - 5} />
          <line x1="17" y1={cy - 5} x2="17" y2={cy + 4} />
          <line x1="31" y1={cy - 5} x2="31" y2={cy + 4} />
          <line x1="24" y1={cy + 4} x2="24" y2={cy + 11} />
        </g>
      ) : (
        <g>
          <path
            d={`M 14 ${cy + 5} A 10 9 0 0 1 34 ${cy + 5} Z`}
            fill="#e5e7eb"
            stroke="#6b7280"
            strokeWidth="1.4"
          />
          <rect x="12" y={cy + 4} width="24" height="3.6" rx="1.8" fill="#d1d5db" stroke="#6b7280" strokeWidth="1.1" />
          <line x1="24" y1={cy - 4} x2="24" y2={cy + 4} stroke="#6b7280" strokeWidth="1.6" />
          <circle cx="17.5" cy={cy + 10.5} r="1.3" fill="rgba(0,0,0,0.28)" />
          <circle cx="29" cy={cy + 11.5} r="1.1" fill="rgba(0,0,0,0.24)" />
          <circle cx="24" cy={cy - 10} r="1.2" fill="rgba(255,255,255,0.4)" />
        </g>
      )}
      <ellipse cx="18" cy={cy - 9} rx="6" ry="3.4" fill="rgba(255,255,255,0.28)" transform={`rotate(-24 18 ${cy - 9})`} />
      {king && (
        <g>
          <circle cx="24" cy={cy} r="18" fill="none" stroke="#fbbf24" strokeWidth="3" />
          <circle cx="24" cy={cy} r="15.2" fill="none" stroke="rgba(251,191,36,0.55)" strokeWidth="1.2" />
          <polygon points={starPoints(24, cy, 6.4, 2.6)} fill="#fde047" stroke="#b45309" strokeWidth="1" />
        </g>
      )}
    </svg>
  );
}

function BrickPiece({ side, king }: { side: Side; king: boolean }): React.JSX.Element {
  return (
    <span style={{
      position: 'absolute', inset: '5%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      filter: 'drop-shadow(0 4px 5px rgba(0,0,0,0.5))',
    }}>
      <PieceGlyph side={side} king={king} size="100%" />
    </span>
  );
}

const iconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(15,10,5,0.6)', color: '#fff', fontSize: 18, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
};
const miniBtn: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.1)', color: '#f5efe4', fontFamily: FONT, fontSize: 12,
  fontWeight: 800, cursor: 'pointer',
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
