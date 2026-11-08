/**
 * ArcadeDaduProyek ("Dadu Proyek") — dadu bersisi material proyek.
 * Pertandingan 10 ronde: tebak ATAS (4-6) / BAWAH (1-3) / PAS melawan
 * Bandar Mandor, pilih risiko Standar / Berani x2 tiap ronde (semua
 * angka tampil sebelum lempar). Unggul koin di akhir = menang;
 * bangkrut sebelum ronde habis = kalah seketika.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp, sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import { drawSceneSprite, preloadSceneSprites, type SceneSlug } from '../../../shared/sceneSprites';
import {
  FACES, rollDie, clampStake, resultLabel,
  createMatch, resolveMatchRound, previewRound, aiStake, RISK_INFO, MATCH_ROUNDS,
  START_COINS, MIN_STAKE,
  type BetSide, type DieFace, type BetResult, type RiskTier, type MatchState,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('dadu-proyek', 'best'); // rekor koin tertinggi
const STAKES = [5, 10, 25, 50, 100];

type Screen = 'tutorial' | 'play' | 'pause' | 'over';
type Stage = 'bet' | 'rolling' | 'reveal';

interface S {
  coins: number;
  aiCoins: number;
  side: BetSide;
  exact: number;
  stake: number;
  risk: RiskTier;
  stage: Stage;
  rollT: number;
  face: DieFace;
  cycleFace: DieFace;
  result: BetResult | null;
  delta: number;
  t: number;
  dieAng: number;
}

const SIDE_LABEL: Record<BetSide, string> = {
  atas: 'ATAS (4–6)',
  bawah: 'BAWAH (1–3)',
  pas: 'PAS',
};

export default function ArcadeDaduProyek({ onExit }: { onExit: () => void }): React.JSX.Element {
  preloadSceneSprites();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({
    coins: START_COINS, aiCoins: START_COINS, side: 'atas' as BetSide,
    exact: 4, stake: 10, stage: 'bet' as Stage, result: null as BetResult | null,
    delta: 0, best: getBest(BK, 0),
    risk: 'standar' as RiskTier, roundsPlayed: 0, totalRounds: MATCH_ROUNDS,
    aiStakeNext: 0, effP: 10, effAi: 0, pot: 10,
    over: false, winner: null as string | null, bankrupt: null as string | null,
  });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      coins: START_COINS, aiCoins: START_COINS,
      side: 'atas', exact: 4, stake: 10, risk: 'standar', stage: 'bet',
      rollT: 0, face: FACES[0], cycleFace: FACES[0],
      result: null, delta: 0, t: 0, dieAng: 0,
    };
    let rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    const rng = (): number => {
      rngState = (rngState + 0x6d2b79f5) | 0;
      return ((rngState >>> 0) % 100000) / 100000;
    };

    /* Status pertandingan (ronde tetap) + taruhan Bandar ronde berikutnya.
       Taruhan Bandar dihitung & DITAMPILKAN sebelum lempar agar pratinjau
       risiko jujur sepenuhnya. */
    let match: MatchState = createMatch();
    let aiStakeNext = 0;

    const push = (): void => {
      const preview = previewRound(clampStake(s.stake, match.playerCoins), aiStakeNext, s.risk);
      const effP = Math.min(preview.playerEffective, match.playerCoins);
      const effAi = Math.min(preview.aiEffective, match.aiCoins);
      api.pushHud({
        coins: s.coins, aiCoins: s.aiCoins, side: s.side, exact: s.exact,
        stake: s.stake, stage: s.stage, result: s.result, delta: s.delta,
        best: getBest(BK, 0),
        risk: s.risk, roundsPlayed: match.roundsPlayed, totalRounds: match.totalRounds,
        aiStakeNext, effP, effAi, pot: effP + effAi,
        over: match.over, winner: match.winner, bankrupt: match.bankrupt,
      });
    };

    const reset = (): void => {
      match = createMatch();
      aiStakeNext = aiStake(match.aiCoins, rng);
      s.coins = match.playerCoins; s.aiCoins = match.aiCoins;
      s.side = 'atas'; s.exact = 4; s.stake = 10; s.risk = 'standar'; s.stage = 'bet';
      s.result = null; s.delta = 0; s.rollT = 0; s.face = FACES[0];
      push();
    };

    const reveal = (): void => {
      const outcome = resolveMatchRound(match, {
        side: s.side,
        exact: s.side === 'pas' ? s.exact : null,
        stake: clampStake(s.stake, match.playerCoins),
        risk: s.risk,
        aiStake: aiStakeNext,
      }, rng);
      if (!outcome.result) { s.stage = 'bet'; push(); return; }
      match = outcome.state;
      const r = outcome.result;
      s.face = r.roll;
      s.result = r.player;
      s.delta = r.playerDelta;
      s.coins = match.playerCoins;
      s.aiCoins = match.aiCoins;
      setBest(BK, s.coins);
      s.stage = 'reveal';
      const wrap = wrapRef.current;
      const cx = api.W / 2; const cy = api.H * 0.42;
      if (r.player === 'menang') {
        sfx.chime(3);
        api.shake.add(0.35);
        api.particles.spawn(cx, cy, {
          count: 40, colors: ['#fde047', '#fbbf24', '#fff7d6', '#f59e0b'],
          speed: [100, 360], life: [0.5, 1], size: [2, 6], gravity: 480, shape: 'rect', rotation: true,
        });
        if (wrap) popText(wrap, `+${r.playerDelta} KOIN`, { size: 30, color: '#fde047' });
      } else if (r.player === 'kalah') {
        sfx.fail();
        if (wrap) popText(wrap, `${r.playerDelta} KOIN`, { size: 26, color: '#fca5a5' });
      } else {
        sfx.click();
        if (wrap) popText(wrap, resultLabel(r.player), { size: 20, color: '#e2e8f0' });
      }
      push();
      window.setTimeout(() => {
        if (match.over) {
          if (match.winner === 'pemain') sfx.chime(4);
          else if (match.winner === 'ai') sfx.fail();
          setScreen('over');
          return;
        }
        aiStakeNext = aiStake(match.aiCoins, rng);
        s.stage = 'bet';
        s.result = null;
        push();
      }, 1900);
    };

    const startRoll = (): void => {
      if (s.stage !== 'bet') return;
      if (match.over) { setScreen('over'); return; }
      if (s.coins < MIN_STAKE) { setScreen('over'); return; }
      s.stage = 'rolling';
      s.rollT = 0;
      s.dieAng = 0;
      s.result = null;
      sfx.whoosh();
      api.shake.add(0.4);
      push();
    };

    (api as unknown as {
      __reset: () => void; __setSide: (v: BetSide) => void;
      __setExact: (v: number) => void; __setStake: (v: number) => void;
      __setRisk: (v: RiskTier) => void;
      __roll: () => void;
    }).__reset = reset;
    (api as unknown as { __setRisk: (v: RiskTier) => void }).__setRisk = (v) => {
      if (s.stage !== 'bet') return;
      s.risk = v;
      sfx.click();
      push();
    };
    (api as unknown as { __setSide: (v: BetSide) => void }).__setSide = (v) => {
      if (s.stage !== 'bet') return;
      s.side = v;
      sfx.click();
      push();
    };
    (api as unknown as { __setExact: (v: number) => void }).__setExact = (v) => {
      if (s.stage !== 'bet') return;
      s.exact = v;
      sfx.click();
      push();
    };
    (api as unknown as { __setStake: (v: number) => void }).__setStake = (v) => {
      if (s.stage !== 'bet') return;
      s.stake = clampStake(v, s.coins);
      sfx.click();
      push();
    };
    (api as unknown as { __roll: () => void }).__roll = () => { sfx.ensure(); startRoll(); };

    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play') return;
      // ketuk dadu = kocok juga
      const cx = api.W / 2; const cy = api.H * 0.40;
      if (s.stage === 'bet' && Math.hypot(p.x - cx, p.y - cy) < 110) startRoll();
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      if (screenRef.current !== 'play') return;
      s.t += dt;
      if (s.stage === 'rolling') {
        s.rollT += dt;
        s.dieAng += dt * 14;
        if (rng() < 0.45) s.cycleFace = rollDie(rng);
        if (s.rollT > 0.15 && Math.floor(s.rollT / 0.22) !== Math.floor((s.rollT - dt) / 0.22)) sfx.click();
        if (s.rollT >= 1.35) {
          s.dieAng = 0;
          sfx.thud(1.1);
          api.shake.add(0.55);
          reveal();
        }
      }
      push();
    });

    /* ---------------- rendering ---------------- */

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#3f2d1c');
      g.addColorStop(0.55, '#2b1e12');
      g.addColorStop(1, '#1a1109');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // karpet bandar (felt hijau)
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.44, Math.min(W * 0.44, 220), H * 0.20, 0, 0, TAU);
      const felt = ctx.createRadialGradient(W / 2, H * 0.44, 20, W / 2, H * 0.44, 220);
      felt.addColorStop(0, '#166534');
      felt.addColorStop(0.75, '#14532d');
      felt.addColorStop(1, '#052e16');
      ctx.fillStyle = felt;
      ctx.fill();
      ctx.strokeStyle = 'rgba(253,224,71,0.35)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.44, Math.min(W * 0.44, 220) - 14, H * 0.20 - 14, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // lampu gantung hangat
      for (const lx of [W * 0.2, W * 0.8]) {
        const lg = ctx.createRadialGradient(lx, 90, 4, lx, 90, 130);
        lg.addColorStop(0, 'rgba(253,224,71,0.28)');
        lg.addColorStop(1, 'rgba(253,224,71,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(lx - 130, -20, 260, 240);
      }
    };

    /** Gambar dadu 3D-ish dengan pip terdesain + nama material. */
    const drawDie = (ctx: CanvasRenderingContext2D, face: DieFace, cx: number, cy: number, size: number, ang: number, rolling: boolean): void => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      if (rolling) {
        const squash = 1 + Math.sin(s.rollT * 30) * 0.06;
        ctx.scale(squash, 1 / squash);
      }
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 12;
      const d = size / 2;
      // badan dadu
      const body = ctx.createLinearGradient(-d, -d, d, d);
      body.addColorStop(0, '#fefce8');
      body.addColorStop(0.5, '#fef9c3');
      body.addColorStop(1, '#eab308');
      ctx.fillStyle = body;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-d, -d, size, size, size * 0.22);
      else ctx.rect(-d, -d, size, size);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      // bingkai dalam
      ctx.strokeStyle = 'rgba(120,53,15,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-d + 8, -d + 8, size - 16, size - 16, size * 0.16);
      else ctx.rect(-d + 8, -d + 8, size - 16, size - 16);
      ctx.stroke();
      // gloss
      const gl = ctx.createLinearGradient(0, -d, 0, 0);
      gl.addColorStop(0, 'rgba(255,255,255,0.5)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(-d, -d, size, d);
      // pip terdesain (pola titik standar dadu) — digambar, bukan emoji
      const PIP_POS: Record<number, Array<[number, number]>> = {
        1: [[0, 0]],
        2: [[-1, -1], [1, 1]],
        3: [[-1, -1], [0, 0], [1, 1]],
        4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
        5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
        6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
      };
      ctx.fillStyle = '#78350f';
      for (const [px, py] of PIP_POS[face.value] ?? []) {
        ctx.beginPath();
        ctx.arc(px * size * 0.20, py * size * 0.20 - size * 0.10, size * 0.058, 0, TAU);
        ctx.fill();
      }
      // ikon material generate-AI di area atas dadu, menggantikan nama
      // material teks; pip & angka nilai tetap prosedural (fungsional).
      const FACE_ICON: Record<number, SceneSlug> = {
        1: 'scene-ikon-bata', 2: 'scene-ikon-kayu', 3: 'scene-ikon-baut',
        4: 'scene-ikon-cat', 5: 'scene-ikon-lampu', 6: 'scene-ikon-crane',
      };
      const iconSlug = FACE_ICON[face.value];
      const iconOk = iconSlug ? drawSceneSprite(ctx, iconSlug, 0, -size * 0.36, size * 0.32, size * 0.32) : false;
      // nama material di bawah pip (hanya bila ikon belum siap = fallback)
      if (!iconOk) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.floor(size * 0.15)}px ${FONT}`;
        ctx.fillStyle = '#78350f';
        ctx.fillText(face.name.toUpperCase(), 0, size * 0.36);
      }
      ctx.restore();
    };

    /** Bandar Mandor — wajah kartun di pojok. */
    const drawBandar = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, mood: 'idle' | 'win' | 'lose'): void => {
      ctx.save();
      // badan
      const body = ctx.createLinearGradient(0, y, 0, y + r * 1.2);
      body.addColorStop(0, '#b45309');
      body.addColorStop(1, '#78350f');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.75, r * 0.85, r * 0.6, 0, 0, TAU);
      ctx.fill();
      // kepala
      const skin = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
      skin.addColorStop(0, '#fed7aa');
      skin.addColorStop(1, '#c2703d');
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      // helm proyek
      const helm = ctx.createLinearGradient(0, y - r, 0, y - r * 0.1);
      helm.addColorStop(0, '#fde047');
      helm.addColorStop(1, '#f59e0b');
      ctx.fillStyle = helm;
      ctx.beginPath();
      ctx.arc(x, y - r * 0.15, r * 0.95, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(x - r * 1.05, y - r * 0.22, r * 2.1, r * 0.16);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x - r * 0.14, y - r * 1.15, r * 0.28, r * 0.5);
      // wajah
      ctx.fillStyle = '#1c1917';
      const eyeY = y + r * 0.1;
      if (mood === 'win') {
        // mata merem senang
        ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 3;
        for (const ex of [-r * 0.35, r * 0.35]) {
          ctx.beginPath(); ctx.arc(x + ex, eyeY, r * 0.14, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
        }
      } else {
        ctx.beginPath(); ctx.arc(x - r * 0.35, eyeY, r * 0.09, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + r * 0.35, eyeY, r * 0.09, 0, TAU); ctx.fill();
      }
      // mulut
      ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 3;
      ctx.beginPath();
      if (mood === 'lose') ctx.arc(x, y + r * 0.75, r * 0.25, 1.2 * Math.PI, 1.8 * Math.PI);
      else ctx.arc(x, y + r * 0.35, r * 0.32, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      // kumis mandor
      ctx.strokeStyle = '#44403c'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x - r * 0.55, y + r * 0.42); ctx.quadraticCurveTo(x - r * 0.3, y + r * 0.55, x - r * 0.1, y + r * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + r * 0.55, y + r * 0.42); ctx.quadraticCurveTo(x + r * 0.3, y + r * 0.55, x + r * 0.1, y + r * 0.42); ctx.stroke();
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();

      drawBackground(ctx, W, H);
      // bandar mandor
      const mood = s.result === 'kalah' ? 'win' : s.result === 'menang' ? 'lose' : 'idle';
      drawBandar(ctx, W - 62, 148, 34, mood);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `800 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('BANDAR MANDOR', W - 62, 196);
      // dadu
      const cx = W / 2; const cy = H * 0.40;
      const size = clamp(Math.min(W * 0.36, 150), 96, 150);
      const face = s.stage === 'rolling' ? s.cycleFace : s.face;
      drawDie(ctx, face, cx, cy, size, s.dieAng, s.stage === 'rolling');
      // hasil label di bawah dadu
      if (s.stage === 'reveal' && s.result) {
        ctx.font = `900 20px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = resultLabel(s.result);
        ctx.fillStyle = s.result === 'menang' ? '#fde047' : s.result === 'kalah' ? '#fca5a5' : '#e2e8f0';
        ctx.fillText(label, cx, cy + size * 0.5 + 42);
      }
      // koin bandar melayang
      ctx.font = `800 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`KOIN ${s.aiCoins}`, W - 62, 214);
      ctx.restore();
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(10,6,2,0.5)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    (api as unknown as { __reset: () => void }).__reset = reset;
    reset();
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const call = <K extends string>(name: string, arg?: unknown): void => {
    const api = apiRef.current as unknown as Record<string, ((v?: unknown) => void) | undefined> | null;
    api?.[name]?.(arg);
  };
  const startGame = (): void => {
    const api = apiRef.current;
    if (api) sfx.ensure();
    call('__reset');
    setScreen('play');
  };
  const togglePause = (): void => {
    const api = apiRef.current;
    if (!api) return;
    if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
    else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
  };
  const toggleMute = (): void => {
    const api = apiRef.current;
    if (api) sfx.ensure();
    setMuted((m) => {
      const next = !m;
      if (api && api.sfx.muted !== next) api.sfx.toggleMute();
      return next;
    });
  };

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(26,17,9,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };
  const chip: React.CSSProperties = {
    borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', padding: '9px 6px',
    fontFamily: FONT, fontWeight: 800, fontSize: 12, cursor: 'pointer', color: '#fff',
    background: 'rgba(255,255,255,0.08)',
  };

  const matchDone = hud.over;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 600, overflow: 'hidden', borderRadius: 18, background: '#1a1109', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(26,17,9,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 132 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>KOIN {hud.coins}</div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9 }}>
            {hud.best > 0 && <span>Rekor {hud.best} • </span>}
            Ronde {Math.min(hud.roundsPlayed + 1, hud.totalRounds)}/{hud.totalRounds} • taruhan {hud.stake}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {/* panel taruhan bawah */}
      {screen === 'play' && hud.stage === 'bet' && !matchDone && (
        <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 6, background: 'rgba(26,17,9,0.78)', border: '1px solid rgba(253,224,71,0.25)', borderRadius: 18, padding: 12, backdropFilter: 'blur(8px)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {(['atas', 'bawah', 'pas'] as BetSide[]).map((sd) => (
              <button
                key={sd}
                style={{ ...chip, flex: 1, background: hud.side === sd ? 'linear-gradient(180deg,#fde047,#f59e0b)' : chip.background, color: hud.side === sd ? '#3a2a00' : '#fff' }}
                onClick={() => call('__setSide', sd)}
              >
                {SIDE_LABEL[sd]}
              </button>
            ))}
          </div>
          {hud.side === 'pas' && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, justifyContent: 'center' }}>
              {FACES.map((f) => (
                <button
                  key={f.value}
                  style={{ ...chip, width: 44, fontSize: 15, background: hud.exact === f.value ? 'linear-gradient(180deg,#fde047,#f59e0b)' : chip.background, color: hud.exact === f.value ? '#3a2a00' : '#fff' }}
                  onClick={() => call('__setExact', f.value)}
                  aria-label={`Angka ${f.value} ${f.name}`}
                >
                  {f.value}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {(['standar', 'berani'] as RiskTier[]).map((rk) => (
              <button
                key={rk}
                style={{ ...chip, flex: 1, background: hud.risk === rk ? 'linear-gradient(180deg,#fca5a5,#dc2626)' : chip.background, color: hud.risk === rk ? '#450a0a' : '#fff' }}
                onClick={() => call('__setRisk', rk)}
              >
                {RISK_INFO[rk].label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.55, color: '#fef3c7', marginBottom: 10, textAlign: 'center' }}>
            {RISK_INFO[hud.risk].blurb}<br />
            Bandar pasang <b>{hud.aiStakeNext}</b> • Efektif: kamu <b>{hud.effP}</b> vs Bandar <b>{hud.effAi}</b> • Pot <b>{hud.pot}</b><br />
            Menang <b style={{ color: '#4ade80' }}>+{hud.effAi}</b> • Kalah <b style={{ color: '#fca5a5' }}>−{hud.effP}</b> • Seri <b>0</b>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {STAKES.filter((st) => st <= hud.coins).map((st) => (
              <button
                key={st}
                style={{ ...chip, flex: 1, background: hud.stake === st ? 'linear-gradient(180deg,#7dd3fc,#0284c7)' : chip.background, color: hud.stake === st ? '#082f49' : '#fff' }}
                onClick={() => call('__setStake', st)}
              >
                {st}
              </button>
            ))}
          </div>
          <button
            style={{ ...primaryBtn, marginTop: 0 }}
            onClick={() => call('__roll')}
          >
            KOCOK DADU — RONDE {Math.min(hud.roundsPlayed + 1, hud.totalRounds)}/{hud.totalRounds}
          </button>
        </div>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <h2 style={h2}>DADU PROYEK</h2>
          <p style={p}>
            Pertandingan <b>{MATCH_ROUNDS} ronde</b> melawan Bandar Mandor. Tiap ronde tebak
            <b> ATAS (4–6)</b>, <b>BAWAH (1–3)</b>, atau <b>PAS</b> (angka persis), pilih nominal,
            lalu pilih risiko: <b>Standar</b> atau <b>Berani ×2</b> (taruhan efektif kamu DAN Bandar
            digandakan). Semua angka — taruhan Bandar, pot, menang/kalah — tampil <b>sebelum</b> kamu melempar.
          </p>
          <p style={p}>
            Menang pertandingan: akhiri {MATCH_ROUNDS} ronde dengan koin <b>di atas Bandar</b>.
            Bangkrut di tengah jalan = <b>langsung kalah</b>.
          </p>
          {hud.best > 0 && <p style={p}>Rekor koin: <b style={{ color: '#fde047' }}>{hud.best}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Pertandingan</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Bandar ikut ngopi dulu. Pertandingan berhenti di ronde {hud.roundsPlayed}/{hud.totalRounds}.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <h2 style={h2}>
            {hud.winner === 'pemain'
              ? (hud.bankrupt === 'ai' ? 'BANDAR BANGKRUT — KAMU MENANG!' : 'KAMU MENANG PERTANDINGAN!')
              : hud.winner === 'seri'
                ? 'PERTANDINGAN SERI'
                : (hud.bankrupt === 'pemain' ? 'BANGKRUT — KAMU KALAH' : 'KAMU KALAH PERTANDINGAN')}
          </h2>
          <div style={{ fontSize: 34, fontWeight: 900, color: '#fde047' }}>KOIN {hud.coins}</div>
          <p style={p}>
            Koin kamu <b>{hud.coins}</b> vs Bandar <b>{hud.aiCoins}</b> • Ronde dimainkan <b>{hud.roundsPlayed}/{hud.totalRounds}</b>
            {hud.bankrupt === 'pemain' && <><br />Koin proyek ludes sebelum ronde habis. Minta DP lagi ke owner!</>}
            {hud.bankrupt === 'ai' && <><br />Bandar Mandor kehabisan koin. Proyek lanjut!</>}
            {hud.winner === 'seri' && <><br />Sama kuat sampai ronde terakhir!</>}
          </p>
          {hud.best > 0 && <p style={p}>Rekor koin: <b style={{ color: '#fde047' }}>{hud.best}</b></p>}
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
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,12,5,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#3f2d1c,#1a1109)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}
