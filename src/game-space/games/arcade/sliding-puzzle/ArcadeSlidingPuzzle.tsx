/**
 * ArcadeSlidingPuzzle ("Geser Keramik") — susun keping keramik hingga
 * membentuk gambar blueprint yang utuh. Mode 3×3 (mudah) & 4×4.
 * Acakan dijamin solvable. Hitung langkah & waktu.
 */
import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../../../engine2d';
import { bestKey, getJson, setJson, fmtTime } from '../../../engine2d';
import { popText } from '../../../engine2d/juice2d';
import { solvedBoard, shuffleBoard, canMove, moveTile, isSolved, misplaced } from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";

type Screen = 'tutorial' | 'play' | 'pause' | 'win';

/** Blueprint denah rumah sebagai SVG data-URI — dipotong per keping. */
function blueprintUri(): string {
  const s = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
<rect width="400" height="400" fill="#0d2b52"/>
<g stroke="#3b82f6" stroke-width="1" opacity="0.35">
${Array.from({ length: 9 }, (_, i) => `<line x1="${(i + 1) * 40}" y1="0" x2="${(i + 1) * 40}" y2="400"/>`).join('')}
${Array.from({ length: 9 }, (_, i) => `<line x1="0" y1="${(i + 1) * 40}" x2="400" y2="${(i + 1) * 40}"/>`).join('')}
</g>
<g stroke="#dbeafe" stroke-width="10" fill="none" stroke-linecap="square">
<rect x="40" y="40" width="320" height="260"/>
<line x1="200" y1="40" x2="200" y2="180"/>
<line x1="40" y1="180" x2="200" y2="180"/>
<line x1="280" y1="180" x2="280" y2="300"/>
</g>
<g stroke="#fde047" stroke-width="4" fill="none">
<path d="M 120 300 A 46 46 0 0 1 166 254" />
<path d="M 280 300 A 40 40 0 0 0 320 260" />
</g>
<g stroke="#7dd3fc" stroke-width="6">
<line x1="60" y1="40" x2="140" y2="40"/>
<line x1="240" y1="300" x2="320" y2="300"/>
</g>
<g fill="#93c5fd" font-family="sans-serif" font-size="17" font-weight="bold">
<text x="70" y="120">R.TAMU</text>
<text x="225" y="120">KM</text>
<text x="70" y="250">DAPUR</text>
<text x="295" y="250">RG</text>
</g>
<g stroke="#f87171" stroke-width="3" stroke-dasharray="8 5">
<line x1="40" y1="330" x2="360" y2="330"/>
</g>
<g fill="#fca5a5" font-family="sans-serif" font-size="13">
<text x="40" y="356">DENAH LT.1 — SKALA 1:100</text>
<text x="300" y="356">A-101</text>
</g>
</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
}
const BP = blueprintUri();

export default function ArcadeSlidingPuzzle({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [screen, setScreen] = useState<Screen>('tutorial');
  const [size, setSize] = useState(4);
  const [board, setBoard] = useState<number[]>(() => solvedBoard(4));
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [bestMoves, setBestMoves] = useState<number | null>(null);
  const [newBest, setNewBest] = useState(false);

  const bestK = bestKey('geser-keramik', `moves-${size}`);

  const refreshBest = (sz: number): void => {
    setBestMoves(getJson<number | null>(bestKey('geser-keramik', `moves-${sz}`), null));
  };

  useEffect(() => { refreshBest(size); }, [size]); // eslint-disable-line react-hooks/exhaustive-deps

  const newGame = (sz: number): void => {
    sfx.ensure();
    const rng = Math.random;
    setBoard(shuffleBoard(sz, sz === 3 ? 40 : 120, rng));
    setMoves(0);
    setSeconds(0);
    setNewBest(false);
    setScreen('play');
  };

  // timer
  useEffect(() => {
    if (screen !== 'play') return;
    const t = window.setInterval(() => setSeconds((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, [screen]);

  const tap = (idx: number): void => {
    if (screen !== 'play') return;
    if (!canMove(board, size, idx)) return;
    const nb = moveTile(board, size, idx);
    if (!nb) return;
    sfx.click();
    const nm = moves + 1;
    setMoves(nm);
    setBoard(nb);
    if (isSolved(nb)) {
      sfx.chime(4);
      const prev = getJson<number | null>(bestK, null);
      if (prev === null || nm < prev) {
        setJson(bestK, nm);
        setBestMoves(nm);
        setNewBest(true);
      }
      const wrap = wrapRef.current;
      if (wrap) {
        window.setTimeout(() => popText(wrap, 'BLUEPRINT UTUH! 🏗️', { size: 30, color: '#7dd3fc' }), 250);
      }
      window.setTimeout(() => setScreen('win'), 900);
    } else if (misplaced(nb) <= 2) {
      sfx.pop(1.2);
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

  const pct = 100 / size;

  return (
    <div ref={wrapRef} style={{
      position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden',
      borderRadius: 18, fontFamily: FONT, color: '#e0f2fe',
      background: 'radial-gradient(120% 90% at 50% 0%, #12325e 0%, #0b2145 50%, #060f22 100%)',
    }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(125,180,240,0.10) 1.5px, transparent 1.5px)', backgroundSize: '26px 26px' }} />

      {/* HUD */}
      <div style={{ position: 'relative', zIndex: 5, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <HudBox label="Langkah" value={String(moves)} />
          <HudBox label="Waktu" value={fmtTime(seconds)} />
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

      {/* mode */}
      <div style={{ position: 'relative', zIndex: 5, display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        {[3, 4].map((sz) => (
          <button
            key={sz}
            onClick={() => { setSize(sz); if (screen === 'play' || screen === 'win') newGame(sz); }}
            style={{
              padding: '7px 16px', borderRadius: 999, border: size === sz ? '2px solid #7dd3fc' : '1px solid rgba(255,255,255,0.2)',
              background: size === sz ? 'rgba(125,211,252,0.18)' : 'rgba(255,255,255,0.06)',
              color: '#fff', fontFamily: FONT, fontWeight: 800, fontSize: 13, cursor: 'pointer',
            }}
          >
            {sz}×{sz} {sz === 3 ? '· Mudah' : ''}
          </button>
        ))}
        <button onClick={() => newGame(size)} style={{
          padding: '7px 16px', borderRadius: 999, border: '1px solid rgba(253,224,71,0.5)',
          background: 'rgba(253,224,71,0.12)', color: '#fde047', fontFamily: FONT, fontWeight: 800, fontSize: 13, cursor: 'pointer',
        }}>
          🔀 Acak
        </button>
      </div>

      {/* papan */}
      <div style={{ position: 'relative', zIndex: 4, display: 'flex', justifyContent: 'center', padding: '0 16px' }}>
        <div style={{
          position: 'relative', width: '100%', maxWidth: 360, aspectRatio: '1',
          borderRadius: 16, padding: 8, boxSizing: 'border-box',
          background: 'linear-gradient(160deg,#1b3a68,#0a1a35)',
          border: '1px solid rgba(125,211,252,0.35)',
          boxShadow: '0 16px 44px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {board.map((v, idx) => {
              const col = idx % size;
              const row = Math.floor(idx / size);
              if (v === 0) {
                return (
                  <div key={idx} style={{
                    position: 'absolute', left: `${col * pct}%`, top: `${row * pct}%`,
                    width: `${pct}%`, height: `${pct}%`, padding: 3, boxSizing: 'border-box',
                  }}>
                    <div style={{
                      width: '100%', height: '100%', borderRadius: 10,
                      background: 'rgba(4,10,22,0.9)',
                      border: '1px dashed rgba(125,211,252,0.35)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'rgba(125,211,252,0.5)', fontSize: 20, fontWeight: 900,
                    }}>+</div>
                  </div>
                );
              }
              const hc = (v - 1) % size;
              const hr = Math.floor((v - 1) / size);
              const movable = screen === 'play' && canMove(board, size, idx);
              return (
                <button
                  key={idx}
                  onClick={() => tap(idx)}
                  aria-label={`Keping ${v}`}
                  style={{
                    position: 'absolute', left: `${col * pct}%`, top: `${row * pct}%`,
                    width: `${pct}%`, height: `${pct}%`, padding: 3, boxSizing: 'border-box',
                    background: 'none', border: 'none', cursor: movable ? 'pointer' : 'default',
                    transition: 'left 0.18s ease, top 0.18s ease',
                  }}
                >
                  <div style={{
                    position: 'relative', width: '100%', height: '100%', borderRadius: 10, overflow: 'hidden',
                    backgroundImage: BP,
                    backgroundSize: `${size * 100}% ${size * 100}%`,
                    backgroundPosition: `${size === 1 ? 50 : (hc / (size - 1)) * 100}% ${size === 1 ? 50 : (hr / (size - 1)) * 100}%`,
                    border: movable ? '2px solid #fde047' : '1px solid rgba(219,234,254,0.5)',
                    boxShadow: movable
                      ? '0 0 14px rgba(253,224,71,0.55), 0 4px 10px rgba(0,0,0,0.4)'
                      : '0 4px 10px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
                    transform: movable ? 'scale(1.03)' : 'none',
                  }}>
                    <span style={{
                      position: 'absolute', top: 4, left: 4, minWidth: 22, height: 22, borderRadius: 8,
                      background: 'rgba(6,15,34,0.78)', color: '#7dd3fc', fontSize: 12, fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                    }}>{v}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 4, textAlign: 'center', marginTop: 12, fontSize: 12.5, color: 'rgba(224,242,254,0.75)', padding: '0 20px' }}>
        {bestMoves !== null
          ? <>🏅 Terbaik {size}×{size}: <b style={{ color: '#fde047' }}>{bestMoves} langkah</b></>
          : <>Susun keping hingga gambar blueprint utuh kembali</>}
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🗺️</div>
          <h2 style={h2}>GESER KERAMIK</h2>
          <p style={p}>
            Blueprint denah rumah <b>acak berantakan</b>! Ketuk keping di samping
            <b> kotak kosong</b> untuk menggesernya. Susun hingga gambar utuh —
            dengan <b>langkah sesedikit mungkin</b>!
          </p>
          <button style={primaryBtn} onClick={() => newGame(size)}>Mulai Menyusun</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Timer berhenti. Kepingnya tidak akan geser sendiri.</p>
          <button style={primaryBtn} onClick={() => setScreen('play')}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'win' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🏗️</div>
          <h2 style={h2}>BLUEPRINT UTUH!</h2>
          <p style={p}>
            Selesai dalam <b style={{ color: '#fde047' }}>{moves} langkah</b> • {fmtTime(seconds)}
            {newBest && <> — <b style={{ color: '#4ade80' }}>rekor baru! 🎉</b></>}
          </p>
          <button style={primaryBtn} onClick={() => newGame(size)}>Acak Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

function HudBox({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ background: 'rgba(8,20,40,0.6)', border: '1px solid rgba(125,211,252,0.25)', borderRadius: 12, padding: '6px 12px', backdropFilter: 'blur(6px)' }}>
      <div style={{ fontSize: 10.5, opacity: 0.7 }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 16, color: '#7dd3fc' }}>{value}</div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(8,20,40,0.6)', color: '#fff', fontSize: 18, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
};
const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#7dd3fc', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e0f2fe' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#7dd3fc,#0284c7)', color: '#082f49', boxShadow: '0 8px 20px rgba(2,132,199,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#93c5fd', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,10,24,0.66)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#14305c,#081426)', border: '1px solid rgba(125,211,252,0.35)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}
