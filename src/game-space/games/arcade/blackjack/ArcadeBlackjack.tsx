/**
 * ArcadeBlackjack (meja proyek) — lawan "Mandor Besar", taruhan sak semen.
 * Aturan 21 baku: bandar hit sampai 17, blackjack bayar 3:2, bisa double.
 */
import React, { useRef, useState } from 'react';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest, getJson, setJson } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  makeShoe, handValue, isBlackjack, dealerShouldHit, resolve, payout, isRed,
  RESHUFFLE_AT, RANKS, SUITS, type Card, type Outcome,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('blackjack-meja', 'best');
const SALDO_K = bestKey('blackjack-meja', 'saldo');
const START_SALDO = 1000;
const BETS = [10, 25, 50, 100, 250];

type Phase = 'bet' | 'player' | 'dealer' | 'done';

export default function ArcadeBlackjack({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const shoeRef = useRef<Card[]>([]);
  const [screen, setScreen] = useState<'tutorial' | 'play' | 'pause'>('tutorial');
  const [phase, setPhase] = useState<Phase>('bet');
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [dealerHidden, setDealerHidden] = useState(true);
  const [bet, setBet] = useState(50);
  const [saldo, setSaldo] = useState(() => getJson<number>(SALDO_K, START_SALDO));
  const [best, setBestState] = useState(() => getBest(BK, 0));
  const [msg, setMsg] = useState('');
  const [muted, setMuted] = useState(false);
  const busyRef = useRef(false);

  const saveSaldo = (v: number): void => {
    setSaldo(v);
    setJson(SALDO_K, v);
    const nb = setBest(BK, v);
    setBestState(nb);
  };

  const draw = (): Card => {
    if (shoeRef.current.length < RESHUFFLE_AT) {
      shoeRef.current = makeShoe(Math.random);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, '🃏 Sepatu kartu dikocok ulang', { size: 15, color: '#93c5fd' });
    }
    return shoeRef.current.pop() as Card;
  };

  const deal = (): void => {
    if (saldo < bet) {
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, 'Sak semen kurang! Turunkan taruhan.', { size: 16, color: '#f87171' });
      sfx.click();
      return;
    }
    sfx.ensure();
    sfx.whoosh();
    saveSaldo(saldo - bet);
    const p = [draw(), draw()];
    const d = [draw(), draw()];
    setPlayer(p);
    setDealer(d);
    setDealerHidden(true);
    setMsg('');
    // cek natural
    const pBJ = isBlackjack(p);
    const dBJ = isBlackjack(d);
    if (pBJ || dBJ) {
      setDealerHidden(false);
      settle(p, d);
    } else {
      setPhase('player');
    }
  };

  // Saldo dipotong saat deal & double; settle/applyResult hanya menambah payout.
  // Pakai ref agar hitung akurat meski state async.
  const saldoRef = useRef(saldo);
  saldoRef.current = saldo;

  const doHit = (): void => {
    if (phase !== 'player' || busyRef.current) return;
    sfx.click();
    const p = [...player, draw()];
    setPlayer(p);
    if (handValue(p).value > 21) {
      setDealerHidden(false);
      settle(p, dealer);
    } else if (handValue(p).value === 21) {
      doStand(p);
    }
  };

  const doStand = (p: Card[] = player): void => {
    if (phase !== 'player' || busyRef.current) return;
    busyRef.current = true;
    setDealerHidden(false);
    sfx.click();
    setPhase('dealer');
    let d = [...dealer];
    const step = (): void => {
      if (dealerShouldHit(d)) {
        d = [...d, draw()];
        setDealer(d);
        sfx.click();
        window.setTimeout(step, 650);
      } else {
        busyRef.current = false;
        settle(p, d);
      }
    };
    window.setTimeout(step, 650);
  };

  const doDouble = (): void => {
    if (phase !== 'player' || player.length !== 2 || saldoRef.current < bet) return;
    sfx.whoosh();
    const nb = bet * 2;
    saveSaldo(saldoRef.current - bet);
    setBet(nb);
    const p = [...player, draw()];
    setPlayer(p);
    if (handValue(p).value > 21) {
      setDealerHidden(false);
      settleDouble(p, dealer, nb);
    } else {
      // satu kartu lalu wajib stand
      busyRef.current = true;
      setDealerHidden(false);
      setPhase('dealer');
      let d = [...dealer];
      const step = (): void => {
        if (dealerShouldHit(d)) {
          d = [...d, draw()];
          setDealer(d);
          window.setTimeout(step, 650);
        } else {
          busyRef.current = false;
          settleDouble(p, d, nb);
        }
      };
      window.setTimeout(step, 650);
    }
  };

  const settle = (p: Card[], d: Card[]): void => {
    const { outcome, reason } = resolve(p, d, false);
    applyResult(outcome, reason, bet);
  };

  const settleDouble = (p: Card[], d: Card[], nb: number): void => {
    const { outcome, reason } = resolve(p, d, true);
    applyResult(outcome, reason + ' (double)', nb);
  };

  const applyResult = (outcome: Outcome, reason: string, b: number): void => {
    const win = payout(outcome, b);
    saveSaldo(saldoRef.current + win);
    setMsg(reason);
    const wrap = wrapRef.current;
    if (outcome === 'blackjack') {
      sfx.chime(4);
      if (wrap) popText(wrap, `BLACKJACK! +${win} sak 🎉`, { size: 24, color: '#fde047' });
    } else if (outcome === 'win') {
      sfx.chime(3);
      if (wrap) popText(wrap, `Menang +${win} sak!`, { size: 22, color: '#4ade80' });
    } else if (outcome === 'push') {
      sfx.click();
      if (wrap) popText(wrap, 'Seri — taruhan kembali', { size: 18, color: '#93c5fd' });
    } else {
      sfx.fail();
      if (wrap) popText(wrap, 'Mandor Besar menang…', { size: 18, color: '#f87171' });
    }
    setPhase('done');
  };

  const newRound = (): void => {
    setPlayer([]);
    setDealer([]);
    setDealerHidden(true);
    setMsg('');
    setBet(Math.min(bet, Math.max(10, saldo)));
    setPhase('bet');
    if (shoeRef.current.length === 0) shoeRef.current = makeShoe(Math.random);
  };

  const resetSaldo = (): void => {
    saveSaldo(START_SALDO);
    newRound();
    const wrap = wrapRef.current;
    if (wrap) popText(wrap, 'Mandor kasih modal 1000 sak lagi 😅', { size: 16, color: '#fde047' });
  };

  const toggleMute = (): void => {
    sfx.ensure();
    setMuted((m) => {
      const next = !m;
      if (sfx.muted !== next) sfx.toggleMute();
      return next;
    });
  };

  const pVal = handValue(player);
  const dVal = handValue(dealer);

  return (
    <div ref={wrapRef} style={{
      position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden',
      borderRadius: 18, fontFamily: FONT, color: '#f1f5f9', display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(130% 100% at 50% 0%, #166534 0%, #14532d 45%, #052e16 100%)',
    }}>
      {/* trim emas meja */}
      <div aria-hidden style={{ position: 'absolute', inset: 10, borderRadius: 16, border: '2px solid rgba(253,224,71,0.35)', pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1.5px, transparent 1.5px)', backgroundSize: '30px 30px' }} />

      {/* HUD */}
      <div style={{ position: 'relative', zIndex: 5, padding: '14px 16px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ background: 'rgba(4,20,10,0.6)', border: '1px solid rgba(253,224,71,0.4)', borderRadius: 12, padding: '7px 12px' }}>
          <div style={{ fontSize: 11, opacity: 0.75 }}>💰 Sak semen</div>
          <div style={{ fontWeight: 900, fontSize: 18, color: '#fde047' }}>{saldo.toLocaleString('id-ID')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(screen === 'play' || screen === 'pause') && phase !== 'dealer' && (
            <button style={iconBtn} onClick={() => setScreen(screen === 'play' ? 'pause' : 'play')} aria-label="Jeda">
              {screen === 'play' ? '⏸' : '▶'}
            </button>
          )}
          <button style={iconBtn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={iconBtn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {/* area bandar */}
      <div style={{ position: 'relative', zIndex: 4, padding: '8px 16px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1, color: '#fde047' }}>👷 MANDOR BESAR {dealerHidden || dealer.length === 0 ? '' : `· ${dVal.value}`}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8, minHeight: 92 }}>
          {dealer.map((c, i) => (
            <CardView key={i} card={c} hidden={dealerHidden && i === 1} />
          ))}
          {dealer.length === 0 && <div style={slotHint}>Kartu bandar</div>}
        </div>
      </div>

      {/* pesan */}
      <div style={{ position: 'relative', zIndex: 4, textAlign: 'center', minHeight: 30, marginTop: 6, padding: '0 16px' }}>
        {msg && <span style={{ fontSize: 14, fontWeight: 800, color: '#fef08a', background: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: '5px 12px' }}>{msg}</span>}
        {phase === 'dealer' && <span style={{ fontSize: 13, color: '#bbf7d0' }}>Mandor Besar mikir…</span>}
      </div>

      {/* area pemain */}
      <div style={{ position: 'relative', zIndex: 4, padding: '0 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1, color: '#bbf7d0' }}>
          🧑‍🔧 KAMU {player.length > 0 && `· ${pVal.value}${pVal.soft && pVal.value !== 21 ? ' (soft)' : ''}`}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8, minHeight: 92 }}>
          {player.map((c, i) => (
            <CardView key={i} card={c} />
          ))}
          {player.length === 0 && <div style={slotHint}>Kartumu</div>}
        </div>
      </div>

      {/* kontrol */}
      <div style={{ position: 'relative', zIndex: 5, marginTop: 'auto', padding: '12px 14px 16px', background: 'rgba(3,15,8,0.6)', borderTop: '1px solid rgba(253,224,71,0.25)', backdropFilter: 'blur(8px)' }}>
        {phase === 'bet' && (
          <>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, textAlign: 'center', color: '#fef08a' }}>
              Pasang taruhan (sak semen)
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              {BETS.map((b) => (
                <button key={b} onClick={() => { sfx.click(); setBet(b); }} style={{
                  padding: '8px 0', width: 56, borderRadius: 999, cursor: 'pointer',
                  border: bet === b ? '2px solid #fde047' : '1px solid rgba(255,255,255,0.25)',
                  background: bet === b ? 'rgba(253,224,71,0.2)' : 'rgba(255,255,255,0.07)',
                  color: '#fff', fontFamily: FONT, fontWeight: 900, fontSize: 14,
                }}>{b}</button>
              ))}
            </div>
            <button style={primaryBtn} onClick={deal}>BAGI KARTU 🃏</button>
            {saldo < 10 && (
              <button style={ghostBtn} onClick={resetSaldo}>Bangkrut! Minta modal ke Mandor 🙏</button>
            )}
          </>
        )}
        {phase === 'player' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={actionBtn('#4ade80')} onClick={doHit}>TAMBAH ➕</button>
            <button style={actionBtn('#38bdf8')} onClick={() => doStand()}>CUKUP ✋</button>
            <button
              style={{ ...actionBtn('#fbbf24'), opacity: player.length === 2 && saldo >= bet ? 1 : 0.4 }}
              onClick={doDouble}
              disabled={!(player.length === 2 && saldo >= bet)}
            >
              GANDA ×2
            </button>
          </div>
        )}
        {phase === 'dealer' && (
          <div style={{ textAlign: 'center', fontSize: 13, color: '#bbf7d0', padding: 10 }}>Mandor Besar sedang main…</div>
        )}
        {phase === 'done' && (
          <button style={primaryBtn} onClick={newRound}>RONDE BARU 🎲</button>
        )}
        <div style={{ textAlign: 'center', fontSize: 11, opacity: 0.65, marginTop: 8 }}>
          Saldo puncak: {best.toLocaleString('id-ID')} sak • Blackjack bayar 3:2
        </div>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🃏</div>
          <h2 style={h2}>BLACKJACK<br />MEJA PROYEK</h2>
          <p style={p}>
            Duel kartu melawan <b>👷 Mandor Besar</b>! Dekati <b>21</b> tanpa lewat.
            Taruhan pakai <b>sak semen</b> — menang dapat semen, kalah disuruh lembur.
          </p>
          <ul style={{ textAlign: 'left', fontSize: 13, lineHeight: 1.9, margin: '0 0 6px', paddingLeft: 20, color: '#e2e8f0' }}>
            <li>🂡 Blackjack (A+10) bayar <b>3:2</b></li>
            <li>✋ Bandar berhenti di semua 17</li>
            <li>×2 <b>Ganda</b>: tambah taruhan, 1 kartu, wajib cukup</li>
          </ul>
          <button style={primaryBtn} onClick={() => { sfx.ensure(); setScreen('play'); }}>Duduk di Meja</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Kartunya ditutup dulu. Mandor tidak ngintip, janji.</p>
          <button style={primaryBtn} onClick={() => setScreen('play')}>Lanjutkan</button>
        </Overlay>
      )}
    </div>
  );
}

function CardView({ card, hidden }: { card: Card; hidden?: boolean }): React.JSX.Element {
  if (hidden) {
    return (
      <div style={{
        width: 62, height: 88, borderRadius: 10,
        background: 'repeating-linear-gradient(45deg,#1e3a8a,#1e3a8a 8px,#1d4ed8 8px,#1d4ed8 16px)',
        border: '3px solid #f8fafc', boxShadow: '0 6px 14px rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 900, fontSize: 11, textAlign: 'center',
      }}>SEMEN<br />🦺</div>
    );
  }
  const red = isRed(card.suit);
  return (
    <div style={{
      width: 62, height: 88, borderRadius: 10, background: 'linear-gradient(160deg,#ffffff,#e2e8f0)',
      border: '1px solid #cbd5e1', boxShadow: '0 6px 14px rgba(0,0,0,0.4)',
      color: red ? '#dc2626' : '#1e293b', position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: 5, left: 7, fontWeight: 900, fontSize: 15, lineHeight: 1.1, textAlign: 'center' }}>
        {RANKS[card.rank - 1]}<br />{SUITS[card.suit]}
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>
        {SUITS[card.suit]}
      </div>
      <div style={{ position: 'absolute', bottom: 5, right: 7, fontWeight: 900, fontSize: 15, lineHeight: 1.1, textAlign: 'center', transform: 'rotate(180deg)' }}>
        {RANKS[card.rank - 1]}<br />{SUITS[card.suit]}
      </div>
    </div>
  );
}

const slotHint: React.CSSProperties = {
  border: '2px dashed rgba(255,255,255,0.25)', borderRadius: 12, padding: '30px 26px',
  color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 700,
};
const iconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(4,20,10,0.6)', color: '#fff', fontSize: 18, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
};
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#fde047', boxShadow: 'none', border: '1px solid rgba(253,224,71,0.5)', marginTop: 8 };
const actionBtn = (c: string): React.CSSProperties => ({
  flex: 1, padding: '13px 8px', borderRadius: 14, border: 'none', fontFamily: FONT,
  fontWeight: 900, fontSize: 14, cursor: 'pointer', color: '#052e16',
  background: `linear-gradient(180deg,${c},${c}cc)`, boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
});
const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1, lineHeight: 1.3 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e2e8f0' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(3,12,6,0.7)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#14532d,#052e16)', border: '1px solid rgba(253,224,71,0.4)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}
