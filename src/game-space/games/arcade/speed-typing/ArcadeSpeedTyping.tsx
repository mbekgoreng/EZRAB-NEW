/**
 * ArcadeSpeedTyping ("Ketik Cepat Estimator") — ketik istilah proyek Indonesia
 * secepat mungkin dalam 60 detik. WPM + akurasi + julukan estimator.
 * Mobile: ketuk area untuk membuka keyboard.
 */
import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import {
  DURATION_SEC, sampleTerms, newTypeState, typeChar, wpm, accuracy, rankFor,
  type TypeState, type CharResult,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('ketik-cepat-estimator', 'wpm');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

export default function ArcadeSpeedTyping({ onExit }: { onExit: () => void }): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('tutorial');
  const [ts, setTs] = useState<TypeState>(() => newTypeState(sampleTerms(40)));
  const [timeLeft, setTimeLeft] = useState(DURATION_SEC);
  const [shakeKey, setShakeKey] = useState(0);
  const [popMsg, setPopMsg] = useState('');
  const [result, setResult] = useState({ wpm: 0, acc: 100, rank: '', best: getBest(BK, 0) });
  const [muted, setMuted] = useState(sfx.muted);
  const [started, setStarted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const tsRef = useRef(ts);
  const startedRef = useRef(false);
  const overRef = useRef(false);
  tsRef.current = ts;
  startedRef.current = started;

  const setScr = (s: Screen): void => {
    screenRef.current = s;
    setScreen(s);
  };

  const focusKb = (): void => {
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
  };

  const reset = (): void => {
    tsRef.current = newTypeState(sampleTerms(40));
    setTs(tsRef.current);
    setTimeLeft(DURATION_SEC);
    setPopMsg('');
    overRef.current = false;
  };

  const startGame = (): void => {
    sfx.ensure();
    reset();
    setStarted(true);
    setScr('play');
    focusKb();
  };

  const finish = (): void => {
    if (overRef.current) return;
    overRef.current = true;
    const cur = tsRef.current;
    const w = Math.round(wpm(cur.correctChars, DURATION_SEC));
    const acc = Math.round(accuracy(cur.correctChars, cur.totalChars));
    const rank = rankFor(w);
    const nb = setBest(BK, w);
    setResult({ wpm: w, acc, rank, best: nb });
    sfx.chime(3);
    setStarted(false);
    setScr('over');
  };

  // timer
  useEffect(() => {
    if (screen !== 'play' || !started) return;
    const id = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(id);
          window.setTimeout(finish, 50);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, started]);

  const handleChar = (ch: string): void => {
    if (screenRef.current !== 'play' || overRef.current) return;
    const { state, res } = typeChar(tsRef.current, ch.toLowerCase());
    tsRef.current = state;
    setTs(state);
    if (res === 'correct') {
      sfx.ensure();
      // nada naik tipis tiap huruf benar beruntun
      sfx.click();
      if (ch === ' ' && state.wordsDone > 0 && state.wordsDone % 10 === 0) {
        setPopMsg(`🔥 ${state.wordsDone} kata!`);
        sfx.pop(1.2);
        window.setTimeout(() => setPopMsg(''), 900);
      }
    } else if (res === 'wrong') {
      sfx.ensure();
      setShakeKey((k) => k + 1);
    }
  };

  const liveWpm = Math.round(wpm(ts.correctChars, DURATION_SEC - timeLeft));
  const liveAcc = Math.round(accuracy(ts.correctChars, ts.totalChars));

  const curWord = ts.words[ts.wi] ?? '';
  const wordsToShow = ts.words.slice(Math.max(0, ts.wi - 1), ts.wi + 12);

  const togglePause = (): void => {
    sfx.ensure();
    if (screenRef.current === 'play') { setScr('pause'); inputRef.current?.blur(); }
    else if (screenRef.current === 'pause') { setScr('play'); focusKb(); }
  };
  const toggleMute = (): void => {
    sfx.ensure();
    sfx.toggleMute();
    setMuted(sfx.muted);
  };

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(20,16,8,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: 'linear-gradient(160deg,#1a1408,#0d0a04)', fontFamily: FONT, color: '#fef3c7' }}>
      {/* input tersembunyi untuk keyboard mobile */}
      <input
        ref={inputRef}
        aria-label="Ketik di sini"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        style={{ position: 'absolute', top: 8, left: '50%', width: 10, height: 10, opacity: 0, pointerEvents: 'none' }}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' || e.key.length > 1) {
            if (e.key !== ' ') e.preventDefault();
            if (e.key === ' ') handleChar(' ');
            return;
          }
          handleChar(e.key);
          e.preventDefault();
        }}
        onBlur={() => {
          if (screenRef.current === 'play') focusKb();
        }}
      />

      {/* HUD */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5 }}>
        <div style={{ background: 'rgba(20,16,8,0.65)', border: '1px solid rgba(253,224,71,0.25)', borderRadius: 14, padding: '7px 12px', backdropFilter: 'blur(6px)', minWidth: 160 }}>
          <div style={{ fontWeight: 900, fontSize: 20, color: timeLeft <= 10 ? '#f87171' : '#fde047' }}>⏱ {timeLeft}s</div>
          <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.15)', marginTop: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(timeLeft / DURATION_SEC) * 100}%`, background: 'linear-gradient(90deg,#fde047,#f59e0b)', borderRadius: 999 }} />
          </div>
          <div style={{ fontSize: 12, marginTop: 4, opacity: 0.9 }}>
            ⚡ {liveWpm} WPM • 🎯 {liveAcc}%
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

      {/* area kata */}
      <div
        onClick={() => { if (screenRef.current === 'play') focusKb(); }}
        style={{
          position: 'absolute', top: 108, left: 12, right: 12, bottom: 16,
          background: 'rgba(255,248,230,0.06)', border: '1px solid rgba(253,224,71,0.18)',
          borderRadius: 16, padding: '18px 16px', overflow: 'hidden', cursor: 'text',
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.6, marginBottom: 10, fontWeight: 800 }}>
          📋 DAFTAR ISTILAH PROYEK
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignContent: 'flex-start', maxHeight: 'calc(100% - 60px)', overflow: 'hidden' }}>
          {wordsToShow.map((w, i) => {
            const globalIdx = Math.max(0, ts.wi - 1) + i;
            const isCur = globalIdx === ts.wi;
            const isDone = globalIdx < ts.wi;
            return (
              <span
                key={`${globalIdx}-${w}`}
                style={{
                  fontSize: 22, fontWeight: 800, letterSpacing: 0.5,
                  color: isDone ? '#4ade80' : isCur ? '#fff' : 'rgba(254,243,199,0.45)',
                  background: isCur ? 'rgba(253,224,71,0.14)' : 'transparent',
                  border: isCur ? '1px solid rgba(253,224,71,0.5)' : '1px solid transparent',
                  borderRadius: 8, padding: '4px 8px',
                  animation: isCur && shakeKey > 0 ? 'st-shake 0.25s' : undefined,
                }}
              >
                {isCur ? (
                  <>
                    {w.split('').map((ch, ci) => (
                      <span
                        key={ci}
                        style={{
                          color: ci < ts.typed.length ? '#4ade80' : 'rgba(254,243,199,0.4)',
                          textDecoration: ci < ts.typed.length ? 'none' : 'underline',
                          textDecorationColor: 'rgba(253,224,71,0.4)',
                        }}
                      >
                        {ch}
                      </span>
                    ))}
                    <span className="st-caret">|</span>
                  </>
                ) : w}
              </span>
            );
          })}
        </div>
        {screen === 'play' && (
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.55 }}>
            👆 Ketuk area ini bila keyboard belum muncul • spasi = kata selesai
          </div>
        )}
        {popMsg && (
          <div style={{ position: 'absolute', top: 90, left: 0, right: 0, textAlign: 'center', fontWeight: 900, fontSize: 24, color: '#fb923c', animation: 'st-pop 0.9s' }}>
            {popMsg}
          </div>
        )}
      </div>

      <style>{`
        @keyframes st-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
        @keyframes st-pop { 0%{transform:scale(0.6);opacity:0} 30%{transform:scale(1.15);opacity:1} 100%{transform:scale(1);opacity:0} }
        .st-caret { color:#fde047; animation: st-blink 1s infinite; font-weight:400; }
        @keyframes st-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @media (prefers-reduced-motion: reduce) {
          .st-caret { animation: none; }
        }
      `}</style>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>⌨️</div>
          <h2 style={h2}>KETIK CEPAT ESTIMATOR</h2>
          <p style={p}>
            Ketik <b>istilah proyek</b> (semen, bekisting, RAB…) secepat mungkin!
            Huruf benar = <b style={{ color: '#4ade80' }}>hijau</b>, salah = <b style={{ color: '#f87171' }}>goyang</b>.
            <b> Spasi</b> untuk pindah kata. Waktumu <b>60 detik</b> — kejar WPM tertinggi!
          </p>
          {result.best > 0 && <p style={p}>WPM terbaik: <b style={{ color: '#fde047' }}>{result.best}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Mengetik</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Jari-jarinya istirahat dulu.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🏁</div>
          <h2 style={h2}>WAKTU HABIS!</h2>
          <div style={{ fontSize: 44, fontWeight: 900, color: '#fde047' }}>{result.wpm} <span style={{ fontSize: 18 }}>WPM</span></div>
          <div style={{ fontSize: 15, marginTop: 4, color: '#fef3c7' }}>{result.rank}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '12px 0' }}>
            <Stat label="Akurasi" value={`${result.acc}%`} />
            <Stat label="Kata" value={`${ts.wordsDone}`} />
            <Stat label="Terbaik" value={`${result.best}`} />
          </div>
          <button style={primaryBtn} onClick={startGame}>Main Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#fef3c7' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#fde047', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,12,4,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#33270f,#14100a)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 14px' }}>
      <div style={{ fontSize: 11, opacity: 0.7, color: '#fef3c7' }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>{value}</div>
    </div>
  );
}
