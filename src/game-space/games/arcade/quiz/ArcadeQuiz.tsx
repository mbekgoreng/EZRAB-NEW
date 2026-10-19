/**
 * ArcadeQuiz ("Kuis Tukang") — kuis pengetahuan proyek & konstruksi Indonesia.
 * 10 soal per ronde, timer 15 detik/soal, bonus streak & kecepatan.
 */
import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import { buildRound, scoreAnswer, gradeFor, TIME_PER_QUESTION, type Question } from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('quiz', 'best');

const CAT_COLOR: Record<string, string> = {
  'RAB & AHSP': '#fbbf24',
  Material: '#fb923c',
  Struktur: '#38bdf8',
  K3: '#4ade80',
  'Alat Berat': '#f472b6',
  Proyek: '#a78bfa',
};

type Screen = 'tutorial' | 'play' | 'pause' | 'result';

export default function ArcadeQuiz({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [screen, setScreen] = useState<Screen>('tutorial');
  const [round, setRound] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [muted, setMuted] = useState(false);
  const [best, setBestState] = useState(() => getBest(BK, 0));
  const [lastGain, setLastGain] = useState(0);
  const lockRef = useRef(false);

  const q = round[idx];

  const startRound = (): void => {
    sfx.ensure();
    setRound(buildRound((Date.now() ^ (Math.random() * 1e9)) | 0));
    setIdx(0);
    setPicked(null);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setCorrectCount(0);
    setTimeLeft(TIME_PER_QUESTION);
    setLastGain(0);
    lockRef.current = false;
    setScreen('play');
  };

  const advance = (nextIdx: number, nextScore: number): void => {
    window.setTimeout(() => {
      if (nextIdx >= round.length) {
        const nb = setBest(BK, nextScore);
        setBestState(nb);
        setScreen('result');
      } else {
        setIdx(nextIdx);
        setPicked(null);
        setTimeLeft(TIME_PER_QUESTION);
        setLastGain(0);
        lockRef.current = false;
      }
    }, 900);
  };

  const answer = (choice: number): void => {
    if (screen !== 'play' || lockRef.current || !q) return;
    lockRef.current = true;
    setPicked(choice);
    const res = scoreAnswer(choice === q.answer, timeLeft, streak);
    const wrap = wrapRef.current;
    if (res.correct) {
      sfx.pop(1 + Math.min(streak, 8) * 0.06);
      setScore((s) => s + res.points);
      setStreak(res.newStreak);
      setBestStreak((b) => Math.max(b, res.newStreak));
      setCorrectCount((c) => c + 1);
      setLastGain(res.points);
      if (wrap) popText(wrap, `+${res.points}`, { size: 26, color: '#4ade80' });
      if (res.newStreak >= 3 && wrap) {
        window.setTimeout(() => popText(wrap, `🔥 Streak x${res.newStreak}!`, { size: 20, color: '#fb923c' }), 180);
      }
    } else {
      sfx.fail();
      setStreak(0);
      setLastGain(0);
      if (wrap) popText(wrap, choice < 0 ? 'Waktu habis!' : 'Kurang tepat!', { size: 20, color: '#f87171' });
    }
    advance(idx + 1, res.correct ? score + res.points : score);
  };

  // timer
  useEffect(() => {
    if (screen !== 'play') return;
    if (timeLeft <= 0) {
      answer(-1);
      return;
    }
    const t = window.setTimeout(() => setTimeLeft((v) => Math.max(0, v - 0.1)), 100);
    return () => window.clearTimeout(t);
  }, [screen, timeLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = (): void => {
    sfx.ensure();
    setMuted((m) => {
      const next = !m;
      if (sfx.muted !== next) sfx.toggleMute();
      return next;
    });
  };

  const grade = gradeFor(score, round.length * (100 + TIME_PER_QUESTION * 5 + 10 * 15));
  const timePct = (timeLeft / TIME_PER_QUESTION) * 100;
  const catColor = q ? CAT_COLOR[q.cat] ?? '#38bdf8' : '#38bdf8';

  return (
    <div ref={wrapRef} style={{
      position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden',
      borderRadius: 18, fontFamily: FONT, color: '#f1f5f9',
      background: 'radial-gradient(120% 90% at 50% 0%, #1e3a5f 0%, #0f2440 45%, #081527 100%)',
    }}>
      {/* lapisan dekorasi */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(125,180,240,0.13) 1.5px, transparent 1.5px)', backgroundSize: '26px 26px' }} />
      <div aria-hidden style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(56,189,248,0.25), transparent 70%)' }} />
      <div aria-hidden style={{ position: 'absolute', bottom: -80, left: -70, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.20), transparent 70%)' }} />

      {/* HUD */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 5 }}>
        <div style={{ background: 'rgba(8,20,38,0.65)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '6px 12px', backdropFilter: 'blur(6px)' }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Skor</div>
          <div style={{ fontWeight: 900, fontSize: 18, color: '#fde047' }}>{score.toLocaleString('id-ID')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {streak >= 2 && (
            <div style={{ background: 'linear-gradient(180deg,#fb923c,#ea580c)', borderRadius: 12, padding: '6px 10px', fontWeight: 900, fontSize: 14, boxShadow: '0 4px 14px rgba(234,88,12,0.5)' }}>
              🔥 x{streak}
            </div>
          )}
          {(screen === 'play' || screen === 'pause') && (
            <button onClick={() => setScreen(screen === 'play' ? 'pause' : 'play')} aria-label="Jeda" style={iconBtn}>
              {screen === 'play' ? '⏸' : '▶'}
            </button>
          )}
          <button onClick={toggleMute} aria-label="Suara" style={iconBtn}>{muted ? '🔇' : '🔊'}</button>
          <button onClick={onExit} aria-label="Keluar" style={iconBtn}>✕</button>
        </div>
      </div>

      {screen === 'play' && q && (
        <div style={{ position: 'relative', zIndex: 2, padding: '70px 16px 16px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
          {/* progress */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, opacity: 0.85 }}>Soal {idx + 1}/{round.length}</span>
            <span style={{ fontSize: 12, fontWeight: 800, background: catColor, color: '#0b1526', borderRadius: 999, padding: '3px 10px' }}>{q.cat}</span>
          </div>
          {/* timer bar */}
          <div style={{ height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginBottom: 14 }}>
            <div style={{
              height: '100%', width: `${timePct}%`, borderRadius: 999,
              background: timePct > 40 ? 'linear-gradient(90deg,#4ade80,#22d3ee)' : 'linear-gradient(90deg,#f87171,#ef4444)',
              transition: 'width 0.1s linear',
            }} />
          </div>
          {/* kartu soal */}
          <div style={card}>
            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.5 }}>{q.q}</div>
          </div>
          {/* opsi */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {q.options.map((opt, i) => {
              const isAns = i === q.answer;
              const isPick = picked === i;
              let bg = 'rgba(13,32,58,0.85)';
              let border = '1px solid rgba(255,255,255,0.14)';
              if (picked !== null) {
                if (isAns) { bg = 'linear-gradient(180deg,#16a34a,#15803d)'; border = '1px solid #4ade80'; }
                else if (isPick) { bg = 'linear-gradient(180deg,#b91c1c,#7f1d1d)'; border = '1px solid #f87171'; }
                else { bg = 'rgba(13,32,58,0.5)'; }
              }
              return (
                <button
                  key={i}
                  onClick={() => answer(i)}
                  disabled={picked !== null}
                  style={{
                    background: bg, border, borderRadius: 14, padding: '13px 14px', color: '#fff',
                    fontFamily: FONT, fontWeight: 700, fontSize: 14.5, textAlign: 'left',
                    cursor: picked === null ? 'pointer' : 'default', display: 'flex', gap: 10, alignItems: 'center',
                    boxShadow: isAns && picked !== null ? '0 0 18px rgba(74,222,128,0.45)' : '0 4px 12px rgba(0,0,0,0.3)',
                    transform: isPick ? 'scale(0.98)' : 'none',
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.14)', fontWeight: 900, fontSize: 13, flexShrink: 0,
                  }}>{'ABCD'[i]}</span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
          {lastGain > 0 && picked !== null && (
            <div style={{ textAlign: 'center', marginTop: 10, fontWeight: 900, color: '#4ade80', fontSize: 15 }}>+{lastGain} poin</div>
          )}
          <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: 12, opacity: 0.6 }}>
            Jawab cepat = bonus • streak = poin berlipat • salah = mandor kecewa
          </div>
        </div>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>👷</div>
          <h2 style={h2}>KUIS TUKANG</h2>
          <p style={p}>
            Uji ilmu proyekmu: <b>10 soal</b> konstruksi dalam <b>15 detik</b> per soal —
            dari RAB & AHSP sampai K3. Jawaban cepat & beruntun (streak) = <b>bonus poin</b>!
          </p>
          {best > 0 && <p style={p}>Skor terbaikmu: <b style={{ color: '#fde047' }}>{best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startRound}>Mulai Kuis</button>
        </Overlay>
      )}

      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>⏸️</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Timer berhenti. Kopinya diminum dulu, soalnya nunggu.</p>
          <button style={primaryBtn} onClick={() => setScreen('play')}>Lanjutkan</button>
        </Overlay>
      )}

      {screen === 'result' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>{grade === 'S' ? '🏆' : grade === 'A' ? '🥇' : grade === 'B' ? '🥈' : '📝'}</div>
          <h2 style={h2}>RONDE SELESAI</h2>
          <div style={{ fontSize: 44, fontWeight: 900, color: '#fde047' }}>{score.toLocaleString('id-ID')}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '10px 0', flexWrap: 'wrap' }}>
            <Stat label="Grade" value={grade} />
            <Stat label="Benar" value={`${correctCount}/${round.length}`} />
            <Stat label="Streak max" value={`x${bestStreak}`} />
          </div>
          <p style={p}>Terbaik: <b style={{ color: '#fde047' }}>{best.toLocaleString('id-ID')}</b></p>
          <button style={primaryBtn} onClick={startRound}>Main Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(8,20,38,0.65)', color: '#fff', fontSize: 18, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
};

const card: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(20,44,78,0.95), rgba(10,24,44,0.95))',
  border: '1px solid rgba(125,180,240,0.25)', borderRadius: 18, padding: '18px 16px',
  boxShadow: '0 12px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
};

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 24, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.92, margin: '8px 0' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00',
  boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = {
  ...primaryBtn, background: 'transparent', color: '#94a3b8', boxShadow: 'none',
  border: '1px solid rgba(255,255,255,0.2)',
};

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(5,12,24,0.66)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20,
    }}>
      <div style={{
        background: 'linear-gradient(160deg,#14294a,#0a1830)', border: '1px solid rgba(125,180,240,0.3)',
        borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
      }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 14px' }}>
      <div style={{ fontSize: 11, opacity: 0.7 }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 18 }}>{value}</div>
    </div>
  );
}
