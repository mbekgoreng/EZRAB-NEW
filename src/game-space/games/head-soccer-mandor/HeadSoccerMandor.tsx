/**
 * Head Soccer Mandor — head soccer 2D: kepala besar + helm vs AI mandor.
 * Kontrol: A/D / Panah (tahan) gerak, W / PanahAtas / Spasi lompat,
 * J / X tendang. Mobile: tombol ◀ ▶ + LOMPAT + TENDANG.
 */
import React, { useRef, useState, useCallback } from 'react';
import { useGameCanvas, GameApi, clamp } from '../../engine2d';
import { bestKey, getJson, setJson } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import {
  Ball, Player, Field, Match, AiBrain,
  makeBall, makePlayer, stepBall, stepPlayer, collidePlayerBall, kick,
  checkGoal, makeBrain, aiDecide, brainToCtl, AI_LEVELS,
  makeMatch, onGoal, stepMatch, GOAL_COMMENTS, CONCEDE_COMMENTS, KICK_RANGE,
} from './logic';

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface Hud {
  time: string;
  scoreL: number;
  scoreR: number;
  levelName: string;
  suddenDeath: boolean;
}

const MAXLEVEL_KEY = bestKey('head-soccer-mandor', 'maxLevel');
const PLAYER_KICK = 560;

const pick = <T,>(arr: readonly T[]): T => arr[(Math.random() * arr.length) | 0];

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeField(W: number, H: number): Field {
  return {
    w: W, h: H,
    groundY: H - 96,
    goalH: Math.min(120, H * 0.2),
    goalDepth: 34,
    gravity: 1500,
  };
}

interface GS {
  field: Field;
  ball: Ball;
  player: Player;
  ai: Player;
  brain: AiBrain;
  match: Match;
  time: number;
  level: number;
  lastSec: number;
}

export default function HeadSoccerMandor({ onExit }: { onExit: () => void }): React.ReactElement {
  // Hook visual-test: ?over=win|lose → langsung tampilkan layar akhir (tanpa gameplay).
  const debugOver = ((): 'win' | 'lose' | null => {
    try {
      const q = new URLSearchParams(window.location.search).get('over');
      return q === 'win' || q === 'lose' ? q : null;
    } catch {
      return null;
    }
  })();
  const [hud, setHud] = useState<Hud>(() => debugOver
    ? {
      time: '0:00',
      scoreL: debugOver === 'win' ? 3 : 1,
      scoreR: debugOver === 'win' ? 1 : 3,
      levelName: AI_LEVELS[0].name, suddenDeath: false,
    }
    : { time: '1:00', scoreL: 0, scoreR: 0, levelName: AI_LEVELS[0].name, suddenDeath: false });
  const [screen, setScreen] = useState<Screen>(debugOver ? 'over' : 'tutorial');
  const [muted, setMuted] = useState(false);
  const [maxLevel, setMaxLevel] = useState<number>(() => getJson<number>(MAXLEVEL_KEY, 1));
  const [levelSel, setLevelSel] = useState(0);
  const [result, setResult] = useState<'win' | 'lose' | null>(debugOver);
  const apiRef = useRef<GameApi | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const gsRef = useRef<GS | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  screenRef.current = screen;
  const touchRef = useRef({ left: false, right: false, jump: false, kick: false });

  const fmt = (sec: number): string => {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const pushHud = useCallback((gs: GS) => {
    setHud({
      time: fmt(gs.match.timeLeft),
      scoreL: gs.match.scoreL, scoreR: gs.match.scoreR,
      levelName: AI_LEVELS[gs.level].name,
      suddenDeath: gs.match.suddenDeath,
    });
  }, []);

  const kickoff = useCallback((gs: GS) => {
    const f = gs.field;
    gs.ball = makeBall(f);
    gs.ball.vx = (Math.random() - 0.5) * 120;
    gs.player = makePlayer(f.w * 0.28, f.groundY, 1);
    gs.ai = makePlayer(f.w * 0.72, f.groundY, -1);
    gs.brain = makeBrain();
  }, []);

  const newGame = useCallback((level: number) => {
    const api = apiRef.current;
    if (!api) return;
    const field = makeField(api.W, api.H);
    const gs: GS = {
      field,
      ball: makeBall(field),
      player: makePlayer(field.w * 0.28, field.groundY, 1),
      ai: makePlayer(field.w * 0.72, field.groundY, -1),
      brain: makeBrain(),
      match: makeMatch(),
      time: 0, level, lastSec: -1,
    };
    gsRef.current = gs;
    setResult(null);
    pushHud(gs);
  }, [pushHud]);

  const doKick = useCallback((gs: GS, p: Player, power: number, isPlayer: boolean) => {
    const api = apiRef.current;
    if (!api) return;
    if (kick(p, gs.ball, power)) {
      api.sfx.whoosh();
      api.shake.add(0.06);
      api.particles.spawn(gs.ball.x, gs.ball.y, {
        count: 10, colors: ['#ffffff', '#FFD94D'],
        speed: [80, 260], life: [0.3, 0.6], size: [2, 4], gravity: 200,
      });
      if (!isPlayer) api.scores.add(gs.ball.x, gs.ball.y - 30, 'Ditendang mandor!', { color: '#FFB3B3', size: 15 });
    }
  }, []);

  const onGoalScored = useCallback((gs: GS, side: 'left' | 'right') => {
    const api = apiRef.current;
    if (!api || !wrapRef.current) return;
    const scorer = onGoal(gs.match, side);
    api.sfx.chime(3, scorer === 'L' ? 660 : 330);
    api.shake.add(0.25);
    const gx = side === 'right' ? gs.field.w : 0;
    const gy = gs.field.groundY - gs.field.goalH / 2;
    popText(wrapRef.current, 'GOOOL!', { size: 44, color: '#FFE08A' });
    api.scores.add(gs.field.w / 2, gs.field.groundY - gs.field.goalH - 60,
      scorer === 'L' ? pick(GOAL_COMMENTS) : pick(CONCEDE_COMMENTS),
      { color: scorer === 'L' ? '#B8F5C8' : '#FFB3B3', size: 17, life: 1.6 });
    for (let k = 0; k < 3; k += 1) {
      window.setTimeout(() => {
        api.particles.spawn(gx + (Math.random() - 0.5) * 60, gy, {
          count: 24,
          colors: scorer === 'L' ? ['#FFD94D', '#FF8A3D', '#ffffff'] : ['#9AA5B1', '#5F6B78', '#ffffff'],
          speed: [60, 300], life: [0.5, 1.1], size: [2, 6], gravity: 320, shape: 'rect',
        });
      }, k * 150);
    }
    pushHud(gs);
  }, [pushHud]);

  const finishMatch = useCallback((gs: GS) => {
    const api = apiRef.current;
    if (!api || screenRef.current !== 'play') return;
    const m = gs.match;
    setResult(m.result);
    if (m.result === 'win') {
      api.sfx.chime(5, 523);
      const unlocked = Math.min(5, gs.level + 2);
      if (unlocked > maxLevel) {
        setMaxLevel(unlocked);
        setJson(MAXLEVEL_KEY, unlocked);
      }
      if (wrapRef.current) popText(wrapRef.current, 'MENANG!', { size: 40, color: '#B8F5C8' });
    } else {
      api.sfx.fail();
      if (wrapRef.current) popText(wrapRef.current, 'KALAH…', { size: 40, color: '#FF8A8A' });
    }
    pushHud(gs);
    window.setTimeout(() => {
      api.loop.setPaused(true);
      setScreen('over');
    }, 1100);
  }, [maxLevel, pushHud]);

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;

    api.setUpdate((dt) => {
      const gs = gsRef.current;
      if (!gs || screenRef.current !== 'play') return;
      gs.time += dt;
      const m = gs.match;
      const f = gs.field;
      const inp = api.input;
      const tc = touchRef.current;

      if (inp.wasPressed('KeyP') || inp.wasPressed('Escape')) {
        api.loop.setPaused(true);
        setScreen('pause');
        return;
      }

      const freezeBefore = m.freezeT;
      const ev = stepMatch(m, dt);
      if (ev === 'suddenDeath' && wrapRef.current) {
        popText(wrapRef.current, 'SUDDEN DEATH!', { size: 30, color: '#FFE08A' });
        api.sfx.chime(3, 880);
      }
      if (ev === 'end') {
        finishMatch(gs);
        return;
      }
      if (freezeBefore > 0 && m.freezeT <= 0) {
        kickoff(gs); // selebrasi selesai → kickoff lagi
        pushHud(gs);
        return;
      }
      if (m.freezeT > 0) return; // bola & pemain dibekukan saat selebrasi

      // --- pemain ---
      const ctl = {
        left: inp.down('ArrowLeft') || inp.down('KeyA') || tc.left,
        right: inp.down('ArrowRight') || inp.down('KeyD') || tc.right,
        jump: inp.wasPressed('ArrowUp') || inp.wasPressed('KeyW') || inp.wasPressed('Space') || tc.jump,
        kick: inp.wasPressed('KeyJ') || inp.wasPressed('KeyX') || tc.kick,
      };
      tc.jump = false;
      tc.kick = false;
      stepPlayer(gs.player, ctl, dt, f);
      if (ctl.kick) doKick(gs, gs.player, PLAYER_KICK, true);

      // --- AI ---
      const lv = AI_LEVELS[gs.level];
      aiDecide(gs.brain, gs.ai, gs.ball, lv, dt);
      stepPlayer(gs.ai, brainToCtl(gs.brain), dt, f, lv.speed);
      if (gs.brain.kick) {
        gs.brain.kick = false;
        doKick(gs, gs.ai, lv.kickPower, false);
      }

      // --- bola ---
      collidePlayerBall(gs.player, gs.ball);
      collidePlayerBall(gs.ai, gs.ball);
      stepBall(gs.ball, dt, f);
      const goal = checkGoal(gs.ball, f);
      if (goal) onGoalScored(gs, goal);

      // HUD tiap detik
      const sec = Math.ceil(m.timeLeft);
      if (sec !== gs.lastSec) {
        gs.lastSec = sec;
        pushHud(gs);
      }
    });

    api.setRender(() => {
      const gs = gsRef.current;
      if (gs) drawGame(api, gs);
      else drawBackdrop(api);
    });

    api.onResize((w, h) => {
      const gs = gsRef.current;
      if (!gs) return;
      const oldG = gs.field.groundY;
      gs.field = makeField(w, h);
      const dy = gs.field.groundY - oldG;
      gs.ball.y += dy;
      if (gs.player.onGround) gs.player.y = gs.field.groundY; else gs.player.y += dy;
      if (gs.ai.onGround) gs.ai.y = gs.field.groundY; else gs.ai.y += dy;
    });

    return () => {
      apiRef.current = null;
    };
  });

  const start = (level: number): void => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    api.sfx.click();
    newGame(level);
    api.loop.setPaused(false);
    api.loop.start();
    setScreen('play');
  };

  const togglePause = (): void => {
    const api = apiRef.current;
    if (!api || (screen !== 'play' && screen !== 'pause')) return;
    api.sfx.click();
    if (screen === 'play') {
      api.loop.setPaused(true);
      setScreen('pause');
    } else {
      api.loop.setPaused(false);
      setScreen('play');
    }
  };

  const toggleMute = (): void => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    setMuted(api.sfx.toggleMute());
  };

  const holdProps = (key: 'left' | 'right') => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); touchRef.current[key] = true; },
    onPointerUp: () => { touchRef.current[key] = false; },
    onPointerLeave: () => { touchRef.current[key] = false; },
    onPointerCancel: () => { touchRef.current[key] = false; },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const tapProps = (key: 'jump' | 'kick') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      apiRef.current?.sfx.ensure();
      touchRef.current[key] = true;
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const btn: React.CSSProperties = {
    border: 'none', borderRadius: 12, padding: '10px 18px',
    fontWeight: 800, fontSize: 15, cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans','Inter',system-ui,sans-serif",
  };

  return (
    <div ref={wrapRef} style={{
      position: 'relative', display: 'flex', flexDirection: 'column',
      height: '100%', background: '#7EC8F7', overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans','Inter',system-ui,sans-serif",
    }}>
      {/* HUD */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', zIndex: 5 }}>
        <div style={{ ...scoreBox, minWidth: 64 }}>
          <span style={{ color: '#1D4ED8' }}>{hud.scoreL}</span>
          <span style={{ color: '#8EA2C7' }}> - </span>
          <span style={{ color: '#DC2626' }}>{hud.scoreR}</span>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ ...timer, color: hud.suddenDeath ? '#B45309' : '#0F172A' }}>
            {hud.suddenDeath ? '☠️ ' : '⏱️ '}{hud.time}
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#475569' }}>
            {hud.suddenDeath ? 'SUDDEN DEATH' : `Lawan: ${hud.levelName}`}
          </div>
        </div>
        <button onClick={togglePause} style={iconBtn} aria-label="Jeda">{screen === 'pause' ? '▶' : '⏸'}</button>
        <button onClick={toggleMute} style={iconBtn} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
        <button onClick={onExit} style={iconBtn} aria-label="Keluar">✕</button>
      </div>

      <div style={{ position: 'relative', flex: 1 }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

        {/* kontrol sentuh */}
        {screen === 'play' && (
          <>
            <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', gap: 10, zIndex: 6 }}>
              <button {...holdProps('left')} style={touchBtn} aria-label="Kiri">◀</button>
              <button {...holdProps('right')} style={touchBtn} aria-label="Kanan">▶</button>
            </div>
            <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', gap: 10, zIndex: 6 }}>
              <button {...tapProps('jump')} style={{ ...touchBtn, background: 'rgba(29,78,216,0.85)' }} aria-label="Lompat">⤒</button>
              <button {...tapProps('kick')} style={{ ...touchBtn, background: 'rgba(220,38,38,0.85)' }} aria-label="Tendang">⚽</button>
            </div>
          </>
        )}
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <h2 style={h2}>⚽ Head Soccer Mandor</h2>
          <p style={p}>
            Kepala besar + helm kuning vs mandor helm merah.
            Cetak gol sebanyak-banyaknya dalam 60 detik!
          </p>
          <p style={{ ...p, fontSize: 12 }}>
            🎮 <b>A/D</b> atau <b>←/→</b> gerak • <b>W / ↑ / Spasi</b> lompat • <b>J / X</b> tendang
            <br />📱 Di HP: tombol ◀ ▶ + LOMPAT + TENDANG
          </p>
          <p style={{ ...p, fontStyle: 'italic', color: '#9FB3D9', fontSize: 12 }}>
            "Anggap bolanya deadline revisi. Tendang sejauh mungkin."
          </p>
          <div style={{ margin: '8px 0' }}>
            <div style={{ color: '#8EA2C7', fontSize: 11, fontWeight: 800, marginBottom: 6 }}>PILIH LAWAN</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              {AI_LEVELS.map((lv, i) => {
                const locked = i + 1 > maxLevel;
                return (
                  <button
                    key={lv.name}
                    disabled={locked}
                    onClick={() => { setLevelSel(i); apiRef.current?.sfx.click(); }}
                    style={{
                      ...btn, padding: '8px 10px', fontSize: 12,
                      background: levelSel === i ? '#F2B441' : '#33456B',
                      color: levelSel === i ? '#3A2A08' : '#fff',
                      opacity: locked ? 0.35 : 1, cursor: locked ? 'not-allowed' : 'pointer',
                    }}
                  >{locked ? '🔒' : `${i + 1}. ${lv.name}`}</button>
                );
              })}
            </div>
          </div>
          <button onClick={() => start(levelSel)} style={{ ...btn, background: '#22C55E', color: '#062B14', marginTop: 6 }}>
            Mulai Main
          </button>
        </Overlay>
      )}

      {screen === 'pause' && (
        <Overlay>
          <h2 style={h2}>⏸️ Babak Istirahat</h2>
          <p style={p}>Minum dulu. Bola nggak akan ke mana-mana… semoga.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={togglePause} style={{ ...btn, background: '#22C55E', color: '#062B14' }}>Lanjut</button>
            <button onClick={() => start(gsRef.current?.level ?? 0)} style={{ ...btn, background: '#33456B', color: '#fff' }}>Ulangi</button>
          </div>
        </Overlay>
      )}

      {screen === 'over' && (
        <Overlay>
          <h2 style={{ ...h2, color: result === 'win' ? '#B8F5C8' : '#FF8A8A' }}>
            {result === 'win' ? '🏆 MENANG!' : '😤 KALAH'}
          </h2>
          <p style={{ ...p, fontSize: 20, fontWeight: 900 }}>
            {hud.scoreL} - {hud.scoreR}
          </p>
          <p style={p}>
            {result === 'win'
              ? `Level ${AI_LEVELS[gsRef.current?.level ?? 0].name} takluk! Bonus cair, estimator ikut selebrasi.`
              : 'AI menang! Dia lembur tiap hari, kamu cuma main pas istirahat.'}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {result === 'win' && (gsRef.current?.level ?? 0) < 4 && (
              <button onClick={() => start((gsRef.current?.level ?? 0) + 1)} style={{ ...btn, background: '#F2B441', color: '#3A2A08' }}>
                Level Berikutnya
              </button>
            )}
            <button onClick={() => start(gsRef.current?.level ?? 0)} style={{ ...btn, background: '#22C55E', color: '#062B14' }}>Main Lagi</button>
            <button onClick={onExit} style={{ ...btn, background: '#33456B', color: '#fff' }}>Keluar</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/* ---------------- styles ---------------- */
const scoreBox: React.CSSProperties = {
  background: 'rgba(255,255,255,0.9)', borderRadius: 10, padding: '6px 10px',
  fontSize: 18, fontWeight: 900, textAlign: 'center',
};
const timer: React.CSSProperties = { fontSize: 18, fontWeight: 900 };
const iconBtn: React.CSSProperties = {
  border: 'none', borderRadius: 10, width: 36, height: 36, fontSize: 16,
  background: 'rgba(255,255,255,0.85)', color: '#0F172A', cursor: 'pointer',
};
const touchBtn: React.CSSProperties = {
  border: 'none', borderRadius: '50%', width: 64, height: 64, fontSize: 24,
  background: 'rgba(15,23,42,0.55)', color: '#fff', cursor: 'pointer',
  touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
};
function Overlay({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(7,12,24,0.72)', backdropFilter: 'blur(3px)',
      padding: 20, textAlign: 'center',
    }}>
      <div style={{
        background: '#141F38', borderRadius: 18, padding: 22, maxWidth: 360, width: '100%',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>{children}</div>
    </div>
  );
}
const h2: React.CSSProperties = { color: '#fff', margin: '0 0 10px', fontSize: 24, fontWeight: 900 };
const p: React.CSSProperties = { color: '#C7D4EE', margin: '0 0 10px', fontSize: 14, lineHeight: 1.5 };

/* ---------------- render ---------------- */

function drawBackdrop(api: GameApi): void {
  const { ctx, W, H } = api;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#5EB6F2');
  sky.addColorStop(1, '#CDEBFF');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
}

function drawGame(api: GameApi, gs: GS): void {
  const { ctx, W, H } = api;
  const f = gs.field;
  const t = gs.time;

  // --- langit ---
  const sky = ctx.createLinearGradient(0, 0, 0, f.groundY);
  sky.addColorStop(0, '#4AA8EC');
  sky.addColorStop(0.7, '#9BDCF7');
  sky.addColorStop(1, '#D8F3FF');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, f.groundY + 2);

  // matahari
  const sunX = W * 0.82;
  const sunY = H * 0.12;
  const glow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 90);
  glow.addColorStop(0, 'rgba(255,240,180,0.9)');
  glow.addColorStop(1, 'rgba(255,240,180,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 90, sunY - 90, 180, 180);
  ctx.fillStyle = '#FFF3B0';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
  ctx.fill();

  // awan parallax
  drawClouds(ctx, W, H, t, 0.1, 34, 0.5, api.reducedMotion);
  drawClouds(ctx, W, H, t, 0.22, 52, 0.8, api.reducedMotion);

  // --- tribun penonton ---
  const standH = Math.min(150, f.groundY * 0.34);
  const standY = f.groundY - standH;
  const sg = ctx.createLinearGradient(0, standY, 0, f.groundY);
  sg.addColorStop(0, '#334155');
  sg.addColorStop(1, '#1E293B');
  ctx.fillStyle = sg;
  ctx.fillRect(0, standY, W, standH);
  // baris penonton (titik-titik)
  const palette = ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#F472B6', '#FDE68A', '#E2E8F0'];
  const rows = 5;
  const cols = Math.floor(W / 16);
  for (let rI = 0; rI < rows; rI += 1) {
    for (let cI = 0; cI < cols; cI += 1) {
      const seed = (rI * 131 + cI * 17) % 97;
      const bounce = api.reducedMotion ? 0 : Math.abs(Math.sin(t * 3 + seed)) * 3;
      const px = 8 + cI * 16 + (seed % 5);
      const py = standY + 14 + rI * ((standH - 20) / rows) - bounce;
      ctx.fillStyle = palette[seed % palette.length];
      ctx.beginPath();
      ctx.arc(px, py, 4.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(px - 4.6, py + 4.6, 9.2, 7); // badan
    }
  }
  // atap tribun
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, standY - 8, W, 10);
  // papan iklan
  ctx.fillStyle = '#F2B441';
  ctx.fillRect(0, f.groundY - 22, W, 22);
  ctx.fillStyle = '#3A2A08';
  ctx.font = `800 ${Math.min(13, W * 0.032)}px 'Plus Jakarta Sans','Inter',system-ui,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★ EZRAB CUP ★  RAB LUNAS • MANDOR SENANG • KLIEN PUAS  ★ EZRAB CUP ★', W / 2, f.groundY - 11);

  // --- lapangan ---
  const fg = ctx.createLinearGradient(0, f.groundY, 0, H);
  fg.addColorStop(0, '#4CAF5D');
  fg.addColorStop(1, '#2E7D3E');
  ctx.fillStyle = fg;
  ctx.fillRect(0, f.groundY, W, H - f.groundY);
  // garis rumput belang
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  const stripeW = W / 8;
  for (let i = 0; i < 8; i += 2) ctx.fillRect(i * stripeW, f.groundY, stripeW, H - f.groundY);
  // garis lapangan
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2, f.groundY);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(W / 2, f.groundY + (H - f.groundY) * 0.45, 54, 30, 0, 0, Math.PI * 2);
  ctx.stroke();

  // --- gawang ---
  drawGoal(ctx, 0, f, true);
  drawGoal(ctx, W, f, false);

  // bayangan
  drawShadow(ctx, gs.ball.x, f.groundY, gs.ball.r * 1.1, clamp(1 - (f.groundY - gs.ball.y) / 300, 0.15, 0.5));
  drawShadow(ctx, gs.player.x, f.groundY, 34, 0.35);
  drawShadow(ctx, gs.ai.x, f.groundY, 34, 0.35);

  // pemain & bola
  drawPlayer(ctx, gs.player, '#F2B441', '#1D4ED8', 'KAMU', t, api.reducedMotion);
  drawPlayer(ctx, gs.ai, '#DC2626', '#7C2D12', AI_LEVELS[gs.level].name.toUpperCase(), t, api.reducedMotion);
  drawBall(ctx, gs.ball);

  // freeze overlay (selebrasi gol)
  if (gs.match.freezeT > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, 0, W, H);
  }
  // sudden death tint
  if (gs.match.suddenDeath) {
    ctx.fillStyle = 'rgba(180,83,9,0.08)';
    ctx.fillRect(0, 0, W, H);
  }

  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function drawClouds(
  ctx: CanvasRenderingContext2D, W: number, H: number, t: number,
  yFrac: number, scale: number, speed: number, reduced: boolean,
): void {
  const off = reduced ? 0 : (t * 12 * speed) % (W + 320);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 3; i += 1) {
    const cx = ((i * 430 + 80) % (W + 320)) - 160 - off;
    const cy = H * yFrac + (i % 2) * 20;
    const s = scale * (0.8 + (i % 3) * 0.2);
    ctx.beginPath();
    ctx.ellipse(cx, cy, s, s * 0.34, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - s * 0.62, cy + s * 0.1, s * 0.55, s * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + s * 0.62, cy + s * 0.1, s * 0.55, s * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGoal(ctx: CanvasRenderingContext2D, x: number, f: Field, isLeft: boolean): void {
  const top = f.groundY - f.goalH;
  const dir = isLeft ? 1 : -1; // jaring masuk ke dalam
  const gx = x + dir * f.goalDepth;

  // jaring
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(gx, top - 6);
  ctx.lineTo(gx, f.groundY);
  ctx.lineTo(x, f.groundY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i += 1) {
    const yy = top + (f.groundY - top) * (i / 5);
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(gx, yy - 6 * (i / 5)); ctx.stroke();
  }
  for (let i = 1; i < 4; i += 1) {
    const xx = x + dir * f.goalDepth * (i / 4);
    ctx.beginPath(); ctx.moveTo(xx, top - 6 * (i / 4)); ctx.lineTo(xx, f.groundY); ctx.stroke();
  }

  // tiang + mistar
  ctx.strokeStyle = '#F8FAFC';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, f.groundY);
  ctx.lineTo(x, top);
  ctx.lineTo(gx, top - 6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(15,23,42,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 3, f.groundY);
  ctx.lineTo(x + 3, top);
  ctx.stroke();
}

function drawShadow(ctx: CanvasRenderingContext2D, x: number, groundY: number, r: number, alpha: number): void {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, groundY + 6, r, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D, p: Player,
  helmet: string, jersey: string, label: string,
  t: number, reduced: boolean,
): void {
  const w = p.w;
  const h = p.h;
  const x = p.x;
  const feetY = p.y;
  const moving = Math.abs(p.vx) > 40;
  const legSwing = reduced || !moving ? 0 : Math.sin(t * 14) * 10;
  const bob = reduced || !moving ? 0 : Math.abs(Math.sin(t * 14)) * 3;

  ctx.save();

  // kaki
  ctx.strokeStyle = '#1F2937';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 8, feetY - 26);
  ctx.lineTo(x - 10 + legSwing, feetY);
  ctx.moveTo(x + 8, feetY - 26);
  ctx.lineTo(x + 10 - legSwing, feetY);
  ctx.stroke();

  // badan (jersey)
  const bodyY = feetY - 52 - bob;
  const bg = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  bg.addColorStop(0, jersey);
  bg.addColorStop(0.5, '#ffffff');
  bg.addColorStop(1, jersey);
  ctx.fillStyle = jersey;
  rr(ctx, x - 14, bodyY - 14, 28, 30, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // nomor punggung
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `900 13px 'Plus Jakarta Sans','Inter',system-ui,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(helmet === '#F2B441' ? '9' : '1', x, bodyY + 2);

  // kepala BESAR
  const headR = w * 0.52;
  const headY = bodyY - 16 - headR + 6;
  const hg = ctx.createRadialGradient(x - headR * 0.3, headY - headR * 0.3, headR * 0.2, x, headY, headR * 1.2);
  hg.addColorStop(0, '#FFDDBB');
  hg.addColorStop(1, '#E8A96B');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(x, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,60,20,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // helm
  ctx.fillStyle = helmet;
  ctx.beginPath();
  ctx.arc(x, headY - 4, headR + 2, Math.PI * 1.02, Math.PI * 1.98);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // highlight helm
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(x - headR * 0.35, headY - headR * 0.55, headR * 0.28, headR * 0.14, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // garis tengah helm
  ctx.strokeStyle = 'rgba(15,23,42,0.3)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, headY - headR - 4);
  ctx.lineTo(x, headY - 8);
  ctx.stroke();

  // mata (menghadap arah facing)
  const ex = x + p.facing * headR * 0.32;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(ex, headY + 2, 7.5, 8.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1F2937';
  ctx.beginPath();
  ctx.arc(ex + p.facing * 3, headY + 3, 3.4, 0, Math.PI * 2);
  ctx.fill();
  // mulut semangat
  ctx.strokeStyle = '#7C3F12';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x + p.facing * 4, headY + headR * 0.45, 7, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // label nama
  ctx.font = `800 11px 'Plus Jakarta Sans','Inter',system-ui,sans-serif`;
  const tw = ctx.measureText(label).width + 12;
  ctx.fillStyle = 'rgba(15,23,42,0.65)';
  rr(ctx, x - tw / 2, headY - headR - 26, tw, 17, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x, headY - headR - 17);

  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, b: Ball): void {
  ctx.save();
  ctx.translate(b.x, b.y);
  const g = ctx.createRadialGradient(-4, -5, 3, 0, 0, b.r + 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#CBD5E1');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, b.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // patch segi-lima berputar
  ctx.rotate(b.spin);
  ctx.fillStyle = '#1F2937';
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * b.r * 0.55, Math.sin(a) * b.r * 0.55, b.r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#1F2937';
  ctx.beginPath();
  ctx.arc(0, 0, b.r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
