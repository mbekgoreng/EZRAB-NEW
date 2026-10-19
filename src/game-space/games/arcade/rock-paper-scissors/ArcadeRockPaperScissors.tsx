/**
 * ArcadeRockPaperScissors — "Suit Kontraktor: Bata vs Gergaji vs Gambar Kerja".
 * Best-of melawan AI Mandor Pengamat yang menghafal polamu.
 * DOM + animasi CSS + confetti canvas (Particles2D standalone).
 */
import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d';
import { Particles2D } from '../../../engine2d';
import { popText } from '../../../engine2d';
import {
  createMatch, playRound, resetMatch, currentWinStreak,
  MOVES, MOVE_INFO, type Move, type RpsRound, type RpsState,
} from './logic';

const SLUG = 'rock-paper-scissors';
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;

const A2TEST =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('a2test');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface Ui {
  pScore: number;
  aScore: number;
  round: number;
  last: RpsRound | null;
  revealing: boolean;
  playerPick: Move | null;
  over: boolean;
  winner: 'pemain' | 'ai' | null;
  streak: number;
  bestStreak: number;
}

const KONTRAKTOR_QUOTES = [
  'Klien: "coba diganti dikit ya." — dikitnya 47 revisi.',
  'AHSP bilang cukup, harga pasar bilang tidak.',
  'Mandor: "besok selesai." Besoknya: "besok selesai."',
  'RAB direvisi klien ke-13 kalinya…',
  'Estimasi selesai… eh, gambar revisi.',
];

export default function ArcadeRockPaperScissors({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<RpsState>(createMatch(3));
  const reducedRef = useRef(
    typeof window !== 'undefined' &&
    typeof window.matchMedia !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [screen, setScreen] = useState<Screen>('tutorial');
  const screenRef = useRef<Screen>('tutorial');
  const goto = (s: Screen): void => {
    screenRef.current = s;
    setScreen(s);
  };
  const [muted, setMuted] = useState(sfx.muted);
  const [quote] = useState(() => KONTRAKTOR_QUOTES[Math.floor(Math.random() * KONTRAKTOR_QUOTES.length)]);
  const [ui, setUi] = useState<Ui>({
    pScore: 0, aScore: 0, round: 0, last: null, revealing: false,
    playerPick: null, over: false, winner: null, streak: 0,
    bestStreak: getBest(bestKey(SLUG, 'streak')),
  });

  const uiRef = useRef(ui);
  uiRef.current = ui;

  const syncUi = (extra?: Partial<Ui>): void => {
    const st = stRef.current;
    setUi((u) => ({
      ...u,
      pScore: st.pScore,
      aScore: st.aScore,
      round: st.round,
      over: st.over,
      winner: st.winner,
      streak: currentWinStreak(st),
      ...extra,
    }));
  };

  /* confetti mandiri untuk kemenangan match */
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

  const burst = (win: boolean): void => {
    const cv = confettiRef.current;
    const ps = (cv as unknown as { __ps?: Particles2D } | null)?.__ps;
    if (!cv || !ps) return;
    const w = cv.clientWidth;
    const colors = win
      ? ['#ffd166', '#4ade80', '#f5b301', '#ffffff']
      : ['#ef4444', '#94a3b8', '#64748b'];
    ps.spawn(w / 2, 120, {
      count: win ? 90 : 30, colors,
      speed: [120, 420], up: 160, gravity: 420,
      life: [0.8, 1.6], size: [3, 7], shape: 'rect', rotation: true,
    });
  };

  const choose = (m: Move): void => {
    const cur = uiRef.current;
    if (screenRef.current !== 'play' || cur.revealing || cur.over) return;
    sfx.ensure();
    sfx.click();
    setUi((u) => ({ ...u, revealing: true, playerPick: m, last: null }));
    // AI "berpikir" 550ms — tangan bergetar
    window.setTimeout(() => {
      const round = playRound(stRef.current, m, Math.random);
      if (round.outcome === 'menang') {
        sfx.pop(1.3);
        if (wrapRef.current) popText(wrapRef.current, 'MENANG! +1', { size: 30, color: '#4ade80' });
      } else if (round.outcome === 'kalah') {
        sfx.fail();
        if (wrapRef.current) popText(wrapRef.current, 'KALAH!', { size: 30, color: '#ef4444' });
      } else {
        sfx.click();
      }
      const st = stRef.current;
      const streak = currentWinStreak(st);
      const best = setBest(bestKey(SLUG, 'streak'), streak);
      if (st.over) {
        if (st.winner === 'pemain') {
          sfx.chime(3);
          burst(true);
        } else {
          burst(false);
        }
        window.setTimeout(() => goto('over'), 900);
      }
      setUi((u) => ({
        ...u,
        pScore: st.pScore,
        aScore: st.aScore,
        round: st.round,
        last: round,
        revealing: false,
        playerPick: null,
        over: st.over,
        winner: st.winner,
        streak,
        bestStreak: best,
      }));
    }, reducedRef.current ? 120 : 550);
  };

  const newMatch = (): void => {
    sfx.ensure();
    sfx.click();
    resetMatch(stRef.current);
    syncUi({ last: null, revealing: false, playerPick: null });
    goto('play');
  };

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

  const pips = (n: number, target: number, color: string): React.JSX.Element => (
    <div style={{ display: 'flex', gap: 6 }}>
      {Array.from({ length: target }, (_, i) => (
        <div key={i} style={{
          width: 14, height: 14, borderRadius: '50%',
          background: i < n ? color : 'rgba(255,255,255,0.18)',
          border: '2px solid rgba(255,255,255,0.35)',
          boxShadow: i < n ? `0 0 8px ${color}` : 'none',
        }} />
      ))}
    </div>
  );

  const revealText = ui.last
    ? ui.last.outcome === 'menang'
      ? MOVE_INFO[ui.last.player].aksiMenang
      : ui.last.outcome === 'kalah'
        ? MOVE_INFO[ui.last.ai].aksiMenang
        : 'Seri! Sama-sama ngotot kayak negosiasi termin.'
    : '';

  const shakeCls = ui.last?.outcome === 'kalah' && !reducedRef.current ? 'rps-shake' : '';

  return (
    <div ref={wrapRef} style={{
      position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
      background: 'linear-gradient(160deg,#1e293b 0%,#334155 55%,#475569 100%)',
      fontFamily: FONT, color: '#fff', display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @keyframes rpsShakeHand { 0%,100%{transform:rotate(0)} 25%{transform:rotate(-18deg)} 75%{transform:rotate(18deg)} }
        @keyframes rpsPop { 0%{transform:scale(.4);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
        @keyframes rpsFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .rps-shake { animation: rpsShakeHand .12s linear 4; }
        .rps-reveal { animation: rpsShakeHand .18s linear 3; }
        .rps-pop { animation: rpsPop .28s ease-out; }
        .rps-float { animation: rpsFloat 2.6s ease-in-out infinite; }
        .rps-move-btn { transition: transform .12s, box-shadow .12s; }
        .rps-move-btn:active { transform: scale(.93); }
      `}</style>

      <canvas ref={confettiRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 8 }} />

      {/* header */}
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
        <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: 0.5 }}>🥊 SUIT KONTRAKTOR</div>
        <div style={{ flex: 1 }} />
        {(screen === 'play' || screen === 'pause') && (
          <button style={btn} onClick={() => { sfx.click(); goto(screen === 'play' ? 'pause' : 'play'); }} aria-label="Jeda">
            {screen === 'play' ? '⏸' : '▶'}
          </button>
        )}
        <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
        <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
      </div>

      {/* papan skor */}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '4px 16px', zIndex: 5 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#93c5fd' }}>👷 KAMU</div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>{ui.pScore}</div>
          {pips(ui.pScore, stRef.current.target, '#4ade80')}
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>
          RONDE {ui.round + (ui.over ? 0 : 1)}
          <div style={{ fontSize: 11, color: '#94a3b8' }}>best of {stRef.current.target * 2 - 1}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fca5a5' }}>🤖 MANDOR AI</div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>{ui.aScore}</div>
          {pips(ui.aScore, stRef.current.target, '#ef4444')}
        </div>
      </div>

      {/* arena */}
      <div className={shakeCls} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, zIndex: 5, padding: '0 12px' }}>
        <Fighter
          label="KAMU"
          move={ui.revealing ? ui.playerPick : ui.last?.player ?? null}
          thinking={ui.revealing}
          side="left"
          reduced={reducedRef.current}
        />
        <div style={{ fontSize: 30, fontWeight: 900, color: '#fbbf24' }}>VS</div>
        <Fighter
          label="MANDOR AI"
          move={ui.revealing ? null : ui.last?.ai ?? null}
          thinking={ui.revealing}
          side="right"
          reduced={reducedRef.current}
        />
      </div>

      {/* hasil ronde */}
      <div style={{ minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', zIndex: 5 }}>
        {ui.revealing ? (
          <div style={{ fontWeight: 800, color: '#fbbf24', fontSize: 15 }}>Mandor AI mikir… 🤔</div>
        ) : ui.last ? (
          <div key={ui.round} className="rps-pop" style={{
            fontWeight: 800, fontSize: 14, textAlign: 'center', lineHeight: 1.45,
            color: ui.last.outcome === 'menang' ? '#4ade80' : ui.last.outcome === 'kalah' ? '#fca5a5' : '#e2e8f0',
          }}>
            {revealText}
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic', textAlign: 'center' }}>
            “{quote}”
          </div>
        )}
      </div>

      {/* tombol jurus */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 16px 18px', zIndex: 5 }}>
        {MOVES.map((m) => (
          <button
            key={m}
            className="rps-move-btn"
            onClick={() => choose(m)}
            disabled={screen !== 'play' || ui.revealing || ui.over}
            style={{
              flex: 1, minHeight: 76, borderRadius: 18, cursor: 'pointer',
              border: '2px solid rgba(255,255,255,0.22)',
              background: 'linear-gradient(160deg,rgba(255,255,255,0.14),rgba(255,255,255,0.05))',
              color: '#fff', fontFamily: FONT, opacity: screen !== 'play' || ui.over ? 0.45 : 1,
            }}
          >
            <div style={{ fontSize: 34 }} className={ui.revealing ? '' : 'rps-float'}>{MOVE_INFO[m].ikon}</div>
            <div style={{ fontWeight: 900, fontSize: 13, marginTop: 2 }}>{MOVE_INFO[m].nama}</div>
          </button>
        ))}
      </div>

      {/* streak */}
      <div style={{ position: 'absolute', bottom: 100, right: 14, zIndex: 5, background: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: '6px 10px', fontSize: 12, fontWeight: 800, color: '#ffd166' }}>
        🔥 Streak {ui.streak} • Best {ui.bestStreak}
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 46 }}>🧱🪚📐</div>
          <h2 style={titleStyle}>SUIT KONTRAKTOR</h2>
          <p style={textStyle}>
            Adu jurus melawan Mandor AI yang menghafal polamu — pertama menang 3 ronde yang juara.
            🧱 Bata menumpulkan 🪚 Gergaji, 🪚 mencacah 📐 Gambar Kerja, 📐 merevisi 🧱 Bata!
          </p>
          <button style={primaryBtn} onClick={() => { sfx.ensure(); sfx.click(); goto('play'); }}>Mulai Suit 🥊</button>
        </Overlay>
      )}

      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 40 }}>☕</div>
          <h2 style={titleStyle}>JEDA</h2>
          <p style={textStyle}>Mandor AI pura-pura tidak mengintip polamu.</p>
          <button style={primaryBtn} onClick={() => { sfx.ensure(); goto('play'); }}>Lanjutkan</button>
        </Overlay>
      )}

      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 48 }}>{ui.winner === 'pemain' ? '🏆' : '🤖'}</div>
          <h2 style={titleStyle}>{ui.winner === 'pemain' ? 'KAMU MENANG!' : 'MANDOR AI MENANG!'}</h2>
          <p style={textStyle}>
            {ui.winner === 'pemain'
              ? 'Kontrak dimenangkan tanpa revisi! Besok… ya revisi juga sih.'
              : 'AI-nya belajar dari polamu. Ganti strategi, jangan spam satu jurus!'}
          </p>
          <p style={{ ...textStyle, fontSize: 16 }}>
            Skor <b>{ui.pScore} – {ui.aScore}</b> • 🔥 Streak terbaik: <b>{ui.bestStreak}</b>
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={newMatch}>Tanding Lagi 🔁</button>
            <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
          </div>
        </Overlay>
      )}

      {A2TEST && (
        <TestHook
          choose={choose}
          getState={() => {
            const u = uiRef.current;
            return {
              screen: screenRef.current,
              pScore: u.pScore, aScore: u.aScore, round: u.round,
              over: u.over, winner: u.winner, last: u.last,
            };
          }}
          newMatch={newMatch}
          start={() => goto('play')}
        />
      )}
    </div>
  );
}

function Fighter({ label, move, thinking, reduced }: {
  label: string; move: Move | null; thinking: boolean; side: string; reduced: boolean;
}): React.JSX.Element {
  const info = move ? MOVE_INFO[move] : null;
  return (
    <div style={{ textAlign: 'center', width: 120 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', marginBottom: 6 }}>{label}</div>
      <div
        className={thinking && !reduced ? 'rps-reveal' : ''}
        style={{
          width: 104, height: 104, margin: '0 auto', borderRadius: 22,
          background: 'linear-gradient(160deg,rgba(255,255,255,0.16),rgba(255,255,255,0.04))',
          border: '2px solid rgba(255,255,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 56, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}
      >
        {thinking ? '❔' : info ? <span key={info.nama} className={reduced ? '' : 'rps-pop'}>{info.ikon}</span> : <span style={{ fontSize: 40, opacity: 0.4 }}>✊</span>}
      </div>
      <div style={{ fontWeight: 800, fontSize: 13, marginTop: 6, minHeight: 18 }}>
        {thinking ? '…' : info?.nama ?? '—'}
      </div>
    </div>
  );
}

/** Hook uji Playwright (aktif hanya dengan ?a2test). */
function TestHook({ choose, getState, newMatch, start }: {
  choose: (m: Move) => void;
  getState: () => Record<string, unknown>;
  newMatch: () => void;
  start: () => void;
}): React.JSX.Element {
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__rps = {
      choose,
      getState,
      newMatch,
      start,
    };
    return () => { delete (window as unknown as Record<string, unknown>).__rps; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <></>;
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

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: 'rgba(10,18,32,0.72)', backdropFilter: 'blur(3px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 24,
    }}>
      {children}
    </div>
  );
}
