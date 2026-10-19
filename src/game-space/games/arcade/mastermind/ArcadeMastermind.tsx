/**
 * ArcadeMastermind ("Tebak Campuran") — racik beton mutu K-300!
 * Tebak 4 takaran dari 6 bahan dalam 10× tebakan.
 * ● hitam = bahan & takaran tepat · ○ putih = bahan benar, takaran salah.
 */
import React, { useRef, useState } from 'react';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import { BAHAN, SLOTS, MAX_GUESSES, genCode, evaluate, isWin, scoreFor, type Feedback } from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('tebak-campuran', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'win' | 'lose';

interface Row {
  guess: number[];
  fb: Feedback;
}

export default function ArcadeMastermind({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [screen, setScreen] = useState<Screen>('tutorial');
  const [code, setCode] = useState<number[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [cur, setCur] = useState<number[]>([]);
  const [muted, setMuted] = useState(false);
  const [best, setBestState] = useState(() => getBest(BK, 0));
  const [score, setScore] = useState(0);

  const newGame = (): void => {
    sfx.ensure();
    setCode(genCode(Math.random));
    setRows([]);
    setCur([]);
    setScore(0);
    setScreen('play');
  };

  const pick = (id: number): void => {
    if (screen !== 'play' || cur.length >= SLOTS) return;
    sfx.click();
    setCur([...cur, id]);
  };

  const unpick = (pos: number): void => {
    if (screen !== 'play') return;
    sfx.click();
    setCur(cur.filter((_, i) => i !== pos));
  };

  const submit = (): void => {
    if (screen !== 'play' || cur.length < SLOTS) return;
    const fb = evaluate(cur, code);
    const nRows = [...rows, { guess: [...cur], fb }];
    setRows(nRows);
    setCur([]);
    if (isWin(fb)) {
      const sc = scoreFor(nRows.length);
      setScore(sc);
      const nb = setBest(BK, sc);
      setBestState(nb);
      sfx.chime(4);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, 'BETON K-300 LULUS! 🏗️', { size: 26, color: '#4ade80' });
      window.setTimeout(() => setScreen('win'), 900);
    } else if (nRows.length >= MAX_GUESSES) {
      sfx.fail();
      window.setTimeout(() => setScreen('lose'), 700);
    } else {
      sfx.pop(0.9);
      if (fb.hitam > 0) {
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, `● ${fb.hitam} takaran tepat!`, { size: 16, color: '#e2e8f0' });
      }
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

  const emptyRows = MAX_GUESSES - rows.length;

  return (
    <div ref={wrapRef} style={{
      position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden',
      borderRadius: 18, fontFamily: FONT, color: '#f1f5f9', display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(120% 90% at 50% 0%, #3f3f46 0%, #27272a 55%, #131315 100%)',
    }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }} />

      {/* HUD */}
      <div style={{ position: 'relative', zIndex: 5, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ background: 'rgba(10,10,12,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '6px 12px', backdropFilter: 'blur(6px)' }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Tebakan {rows.length}/{MAX_GUESSES}</div>
          <div style={{ fontWeight: 900, fontSize: 15, color: '#fde047' }}>Target: Beton K-300</div>
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

      {/* papan tebakan */}
      <div style={{ position: 'relative', zIndex: 4, flex: 1, overflowY: 'auto', padding: '4px 14px 8px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.map((r, ri) => (
          <div key={ri} style={rowStyle}>
            <span style={rowNum}>{ri + 1}</span>
            {r.guess.map((g, gi) => (
              <Peg key={gi} bahanId={g} small />
            ))}
            <span style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
              <FbPegs fb={r.fb} />
            </span>
          </div>
        ))}
        {screen === 'play' && (
          <div style={{ ...rowStyle, borderColor: 'rgba(253,224,71,0.55)', background: 'rgba(253,224,71,0.06)' }}>
            <span style={rowNum}>▶</span>
            {Array.from({ length: SLOTS }, (_, i) => (
              cur[i] !== undefined
                ? <button key={i} onClick={() => unpick(i)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} aria-label="Hapus"><Peg bahanId={cur[i]} /></button>
                : <div key={i} style={emptySlot} />
            ))}
            <button
              onClick={submit}
              disabled={cur.length < SLOTS}
              style={{
                marginLeft: 'auto', padding: '9px 14px', borderRadius: 11, border: 'none',
                fontFamily: FONT, fontWeight: 900, fontSize: 13, cursor: cur.length < SLOTS ? 'default' : 'pointer',
                background: cur.length < SLOTS ? 'rgba(255,255,255,0.12)' : 'linear-gradient(180deg,#fde047,#f59e0b)',
                color: cur.length < SLOTS ? '#71717a' : '#3a2a00',
              }}
            >
              COR! 🪣
            </button>
          </div>
        )}
        {Array.from({ length: Math.max(0, emptyRows - (screen === 'play' ? 1 : 0)) }, (_, i) => (
          <div key={`e${i}`} style={{ ...rowStyle, opacity: 0.35 }}>
            <span style={rowNum}>{rows.length + (screen === 'play' ? 1 : 0) + i + 1}</span>
            {Array.from({ length: SLOTS }, (_, j) => <div key={j} style={emptySlot} />)}
          </div>
        ))}
      </div>

      {/* pemilih bahan */}
      {screen === 'play' && (
        <div style={{ position: 'relative', zIndex: 5, padding: '10px 12px 14px', background: 'rgba(8,8,10,0.55)', borderTop: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
          <div style={{ fontSize: 11.5, opacity: 0.75, marginBottom: 8, textAlign: 'center' }}>
            Ketuk bahan untuk mengisi takaran • ketuk takaran terisi untuk menghapus
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {BAHAN.map((b) => (
              <button key={b.id} onClick={() => pick(b.id)} aria-label={b.nama} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <Peg bahanId={b.id} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#d4d4d8' }}>{b.nama}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🪣</div>
          <h2 style={h2}>TEBAK CAMPURAN</h2>
          <p style={p}>
            Mandor minta <b>beton K-300</b> tapi resepnya hilang! Tebak <b>4 takaran</b> dari{' '}
            <b>6 bahan</b> dalam <b>10× tebakan</b>.
          </p>
          <p style={p}>
            <span style={dot('#111827')}>●</span> hitam = bahan & takaran <b>tepat</b><br />
            <span style={dot('#f8fafc')}>●</span> putih = bahan benar, <b>takaran salah</b>
          </p>
          {best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{best}</b></p>}
          <button style={primaryBtn} onClick={newGame}>Mulai Meracik</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Adukan cor menunggu. Jangan sampai mengeras!</p>
          <button style={primaryBtn} onClick={() => setScreen('play')}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'win' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🏗️</div>
          <h2 style={h2}>K-300 LULUS UJI!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{score}</div>
          <p style={p}>Tebakan ke-{rows.length} • Terbaik: <b style={{ color: '#fde047' }}>{best}</b></p>
          <button style={primaryBtn} onClick={newGame}>Racik Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
      {screen === 'lose' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🧪</div>
          <h2 style={h2}>CAMPURAN GAGAL</h2>
          <p style={p}>Resep yang benar:</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '8px 0 12px' }}>
            {code.map((c, i) => <Peg key={i} bahanId={c} />)}
          </div>
          <p style={p}>Betonnya keropos, mandor manyun. Coba racik lagi!</p>
          <button style={primaryBtn} onClick={newGame}>Coba Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

function Peg({ bahanId, small }: { bahanId: number; small?: boolean }): React.JSX.Element {
  const b = BAHAN[bahanId];
  const d = small ? 30 : 40;
  return (
    <div style={{
      width: d, height: d, borderRadius: '50%',
      background: `radial-gradient(circle at 32% 30%, ${b.warna}, ${b.gelap} 78%)`,
      border: '2px solid rgba(255,255,255,0.35)',
      boxShadow: '0 3px 8px rgba(0,0,0,0.45), inset 0 2px 4px rgba(255,255,255,0.3)',
    }} title={b.nama} />
  );
}

function FbPegs({ fb }: { fb: Feedback }): React.JSX.Element {
  const pegs: React.ReactNode[] = [];
  for (let i = 0; i < fb.hitam; i += 1) {
    pegs.push(<span key={`h${i}`} style={fbDot('#111827', '#f8fafc')} />);
  }
  for (let i = 0; i < fb.putih; i += 1) {
    pegs.push(<span key={`p${i}`} style={fbDot('#f8fafc', '#111827')} />);
  }
  for (let i = pegs.length; i < SLOTS; i += 1) {
    pegs.push(<span key={`e${i}`} style={fbDot('transparent', 'rgba(255,255,255,0.25)')} />);
  }
  return <>{pegs}</>;
}

const fbDot = (bg: string, border: string): React.CSSProperties => ({
  width: 13, height: 13, borderRadius: '50%', background: bg, border: `2px solid ${border}`, display: 'inline-block',
});
const dot = (c: string): React.CSSProperties => ({ color: c, fontSize: 18 });

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14, padding: '8px 10px',
};
const rowNum: React.CSSProperties = { fontSize: 12, fontWeight: 800, opacity: 0.6, width: 18, textAlign: 'center' };
const emptySlot: React.CSSProperties = {
  width: 40, height: 40, borderRadius: '50%',
  border: '2px dashed rgba(255,255,255,0.25)', background: 'rgba(0,0,0,0.25)',
};

const iconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(10,10,12,0.6)', color: '#fff', fontSize: 18, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
};
const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#f4f4f5' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#a1a1aa', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,8,10,0.66)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#3f3f46,#18181b)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}
