/**
 * Ketapel Konstruksi — slingshot physics 2D ala genre ketapel fisika,
 * reskin konstruksi penuh: proyektil = kepala pekerja berhelm proyek
 * (4 warna, skill berbeda), target = kepala "Klien Revisi" di atas struktur.
 * Tarik kepala di ketapel, lepas, ketuk saat melayang untuk skill.
 */
import React, { useState, useRef, useCallback } from 'react';
import { useGameCanvas, GameApi, clamp } from '../../engine2d';
import { bestKey, getJson, setJson, getBest, setBest } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import {
  LEVELS, WORLD_W, WORLD_H, GROUND_Y, DRAG_MAX,
  predict, launchVel, createState, updateState,
  starFor, leftoverBonus, MAT_SCORE, TARGET_SCORE,
  crackLevel, remainingTargets, launchPowerFrac, launchPowerLabel,
  beginDrag, moveDrag, releaseDrag, activateSkill, skillBall, currentHead, ballMood,
  HELMS, EXPLO_RADIUS, TARGET_W, TARGET_H,
  type Ball, type Block, type KState, type KEvent, type Mat, type HelmColor,
} from './logic';

type Screen = 'tutorial' | 'levels' | 'intro' | 'play' | 'win' | 'lose';

interface Hud {
  score: number; balls: number; level: number; best: number;
  head: HelmColor | null; next: HelmColor[]; skillReady: boolean;
  skillName: string; targets: number;
}

const SLUG = 'ketapel-konstruksi';
const STARS_KEY = bestKey(SLUG, 'stars'); // { [levelIndex]: 1|2|3 } — kunci lama, tetap
const SCORE_KEY = bestKey(SLUG, 'best');

const DEBRIS: Record<Mat, string[]> = {
  kayu: ['#b07a45', '#8a5a2e', '#d9a86c'],
  kaca: ['#bfe3f5', '#e8f7ff', '#7fb3d5'],
  bata: ['#c65b3a', '#96421f', '#e08a5f'],
  beton: ['#9aa0a8', '#6e747c', '#c3c9d1'],
  berkas: ['#ffffff', '#f1f5f9', '#fca5a5'],
};

const QUIP_WIN = [
  'Revisi lunas! Estimator bisa tidur nyenyak malam ini.',
  'Klien revisi tumbang semua. Kayak revisi harga satuan.',
  'Klien: "coba revisi sekali lagi ya." Kamu: sudah tidak ada yang bisa direvisi.',
];
const QUIP_LOSE = [
  'Klien revisi selamat… kayak deadline yang selalu lolos dari RAB.',
  'Kepala habis, klien masih berdiri. Mirip nasib estimator akhir bulan.',
  'Ketapelnya lelah. Istirahat dulu, kayak mandor pas hujan.',
];

interface TrailPt { x: number; y: number; ttl: number }
interface BoomFx { x: number; y: number; t: number }

export default function KetapelKonstruksi({ onExit }: { onExit: () => void }) {
  const [screen, setScreen] = useState<Screen>('tutorial');
  const [hud, setHud] = useState<Hud>({
    score: 0, balls: 3, level: 1, best: 0, head: null, next: [], skillReady: false, skillName: '', targets: 0,
  });
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stars, setStars] = useState<Record<string, number>>(() => getJson(STARS_KEY, {}));
  const [quip, setQuip] = useState('');
  const [winStars, setWinStars] = useState(0);
  const [introColor, setIntroColor] = useState<HelmColor>('putih');
  const apiRef = useRef<GameApi | null>(null);
  const sRef = useRef<KState | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const doneHandled = useRef(false);
  const lastHud = useRef('');
  const pendingLevel = useRef(0);
  const seenIntro = useRef<Set<HelmColor>>(new Set());

  const beginLevel = useCallback((idx: number) => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    sRef.current = createState(idx);
    doneHandled.current = false;
    api.particles.clear();
    api.loop.setPaused(false);
    setPaused(false);
    setScreen('play');
    api.loop.start();
    const s = sRef.current;
    const h = JSON.stringify({ score: 0, balls: s.ballsLeft, level: idx + 1 });
    lastHud.current = h;
    api.pushHud({
      score: 0, balls: s.ballsLeft, level: idx + 1, best: getBest(SCORE_KEY, 0),
      head: currentHead(s), next: s.level.queue.slice(s.nextIdx + 1, s.nextIdx + 4),
      skillReady: false, skillName: '', targets: remainingTargets(s.targets),
    });
  }, []);

  const startLevel = useCallback((idx: number) => {
    const intro = LEVELS[idx].intro;
    if (intro && !seenIntro.current.has(intro)) {
      seenIntro.current.add(intro);
      pendingLevel.current = idx;
      setIntroColor(intro);
      setScreen('intro');
      return;
    }
    beginLevel(idx);
  }, [beginLevel]);

  const startLevelRef = useRef(startLevel);
  startLevelRef.current = startLevel;
  const beginLevelRef = useRef(beginLevel);
  beginLevelRef.current = beginLevel;

  const togglePause = useCallback(() => {
    const api = apiRef.current;
    if (!api || screen !== 'play') return;
    const p = !api.loop.isPaused;
    api.loop.setPaused(p);
    setPaused(p);
    api.sfx.click();
  }, [screen]);

  const toggleMute = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    setMuted(api.sfx.toggleMute());
  }, []);

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);

    const view = () => {
      const W = api.W; const H = api.H;
      const sc = Math.min(W / WORLD_W, H / WORLD_H);
      return { sc, ox: (W - WORLD_W * sc) / 2, oy: (H - WORLD_H * sc) / 2 };
    };
    const toWorld = (px: number, py: number) => {
      const v = view();
      return { x: (px - v.ox) / v.sc, y: (py - v.oy) / v.sc };
    };

    // ---- juice state (renderer-side) ----
    let camX = 0;
    let slowmo = 0; // detik (waktu nyata) slow-motion tersisa
    let flash = 0; // kilatan ledakan 0..1
    const trails = new Map<number, { color: HelmColor; pts: TrailPt[] }>();
    const booms: BoomFx[] = [];
    let timeNow = 0;

    const handleEvents = (events: KEvent[], s: KState) => {
      for (const e of events) {
        if (e.type === 'launch') {
          api.sfx.whoosh();
          api.shake.add(0.1);
        } else if (e.type === 'skill') {
          if (e.skill === 'ledak') { api.sfx.crumble(1.2); api.shake.add(0.5); }
          else if (e.skill === 'boost') { api.sfx.whoosh(); api.sfx.pop(1.5); }
          else if (e.skill === 'tumbuk') { api.sfx.thud(0.7); }
          else { api.sfx.pop(1.25); }
          api.particles.spawn(e.x, e.y, {
            count: 10, colors: [HELMS[e.color].helm, '#ffffff'],
            speed: [60, 200], life: [0.25, 0.55], size: [2, 5], gravity: 200, shape: 'circle',
          });
        } else if (e.type === 'explode') {
          booms.push({ x: e.x, y: e.y, t: 0 });
          flash = 1;
          if (!api.reducedMotion) slowmo = Math.max(slowmo, 0.22);
          api.shake.add(0.55);
          api.particles.spawn(e.x, e.y, {
            count: 34, colors: ['#f97316', '#fbbf24', '#78716c', '#d6d3d1'],
            speed: [140, 520], life: [0.35, 0.9], size: [2, 8], gravity: 1000, shape: 'rect', rotation: true,
          });
        } else if (e.type === 'ballHit') {
          if (e.dmg > 0) {
            api.sfx.thud(e.hard ? 1 : 0.55);
            if (e.hard) api.shake.add(0.18);
            api.particles.spawn(e.x, e.y, {
              count: e.hard ? 13 : 6, colors: DEBRIS[e.mat],
              speed: [90, 300], life: [0.3, 0.7], size: [2, 6], gravity: 900, shape: 'rect', rotation: true,
            });
          }
        } else if (e.type === 'blockBreak') {
          api.sfx.crumble(e.mat === 'beton' ? 1.1 : 0.85);
          api.shake.add(e.mat === 'beton' ? 0.26 : 0.15);
          if (e.mat === 'beton' && !api.reducedMotion) slowmo = Math.max(slowmo, 0.14);
          api.particles.spawn(e.x, e.y, {
            count: 24, colors: DEBRIS[e.mat],
            speed: [130, 430], life: [0.4, 1], size: [2, 8], gravity: 1100, shape: 'rect', rotation: true,
          });
          api.scores.add(e.x, e.y - 10, `+${MAT_SCORE[e.mat]}`, { color: '#ffffff', size: 19 });
        } else if (e.type === 'blockLand') {
          if (e.hard) { api.sfx.thud(0.75); api.shake.add(0.12); }
          api.particles.spawn(e.x, e.y - 4, {
            count: e.hard ? 12 : 6, colors: ['#cbb59a', '#a98f6f', '#e5d6bd'],
            speed: [40, 160], angle: -Math.PI / 2, spread: 1.6,
            life: [0.3, 0.7], size: [2, 5], gravity: 300, shape: 'circle',
          });
        } else if (e.type === 'targetDown') {
          api.sfx.pop(0.75);
          api.sfx.chime(2, 520);
          if (!api.reducedMotion) slowmo = Math.max(slowmo, 0.16);
          api.shake.add(0.22);
          api.particles.spawn(e.x, e.y, {
            count: 20, colors: ['#fca5a5', '#dc2626', '#f8fafc', '#1f2937'],
            speed: [110, 360], life: [0.35, 0.85], size: [2, 7], gravity: 1000, shape: 'rect', rotation: true,
          });
          api.scores.add(e.x, e.y - 16, `+${TARGET_SCORE}`, { color: '#fde047', size: 24 });
          if (wrapRef.current) popText(wrapRef.current, 'KLIEN TUMBANG!', { size: 24, color: '#fde047' });
        } else if (e.type === 'targetHit') {
          api.sfx.thud(0.35);
        }
        void s;
      }
    };

    const trySkill = () => {
      const s = sRef.current;
      if (!s || s.phase !== 'flying' || api.loop.isPaused) return;
      const sr = { v: s.score };
      const events: KEvent[] = [];
      if (activateSkill(s, events, sr)) {
        s.score = sr.v;
        handleEvents(events, s);
      }
    };

    const releaseCurrent = () => {
      const s = sRef.current;
      if (!s || api.loop.isPaused) return;
      const events: KEvent[] = [];
      if (releaseDrag(s, events)) handleEvents(events, s);
    };

    api.setUpdate((dt) => {
      const s = sRef.current;
      if (!s) return;
      if (api.input.wasPressed('Escape')) togglePauseRef.current();
      if (api.loop.isPaused) return;
      timeNow += dt;

      if (api.input.wasPressed('Space')) trySkill();

      // slow-motion: langkah fisika diperkecil sebentar setelah momen besar
      let effDt = dt;
      if (slowmo > 0) { effDt = dt * 0.35; slowmo -= dt; }
      flash = Math.max(0, flash - dt * 2.6);
      for (let i = booms.length - 1; i >= 0; i -= 1) {
        booms[i].t += dt;
        if (booms[i].t > 0.55) booms.splice(i, 1);
      }

      const events = updateState(s, effDt);
      handleEvents(events, s);

      // jejak lintasan per bola
      for (const b of s.balls) {
        let entry = trails.get(b.flightId);
        if (!entry) { entry = { color: b.color, pts: [] }; trails.set(b.flightId, entry); }
        const last = entry.pts[entry.pts.length - 1];
        if (!last || Math.hypot(b.x - last.x, b.y - last.y) > 9) {
          entry.pts.push({ x: b.x, y: b.y, ttl: 0.55 });
          if (entry.pts.length > 16) entry.pts.shift();
        }
      }
      for (const [id, entry] of trails) {
        for (const p of entry.pts) p.ttl -= dt;
        while (entry.pts.length && entry.pts[0].ttl <= 0) entry.pts.shift();
        if (!entry.pts.length) trails.delete(id);
      }

      // kamera: geser ringan mengikuti bola, kembali saat membidik
      const lead = s.phase === 'flying' && s.balls.length ? s.balls[0] : null;
      const camTarget = lead ? clamp((lead.x - 470) * 0.045, -18, 22) : 0;
      camX += (camTarget - camX) * Math.min(1, dt * 5);

      // HUD push saat berubah
      const sb = skillBall(s);
      const key = `${s.score}|${s.ballsLeft}|${s.levelIndex}|${remainingTargets(s.targets)}|${sb ? sb.flightId : 0}|${s.phase}`;
      if (key !== lastHud.current) {
        lastHud.current = key;
        api.pushHud({
          score: s.score, balls: s.ballsLeft, level: s.levelIndex + 1, best: getBest(SCORE_KEY, 0),
          head: currentHead(s), next: s.level.queue.slice(s.nextIdx + 1, s.nextIdx + 4),
          skillReady: !!sb, skillName: sb ? HELMS[sb.color].skillName : '',
          targets: remainingTargets(s.targets),
        });
      }

      if (s.phase === 'done' && !doneHandled.current) {
        doneHandled.current = true;
        if (s.won) {
          const st = starFor(Math.max(1, s.nextIdx), s.level.queue.length);
          s.score += leftoverBonus(s.ballsLeft);
          setBest(SCORE_KEY, s.score);
          setWinStars(st);
          setQuip(QUIP_WIN[(s.levelIndex + s.nextIdx) % QUIP_WIN.length]);
          setStars((prev) => {
            const next = { ...prev, [String(s.levelIndex)]: Math.max(prev[String(s.levelIndex)] ?? 0, st) };
            setJson(STARS_KEY, next);
            return next;
          });
          api.sfx.chime(3);
          if (wrapRef.current) popText(wrapRef.current, 'REVISI LUNAS!', { size: 34, color: '#4ade80' });
          api.pushHud({
            score: s.score, balls: s.ballsLeft, level: s.levelIndex + 1, best: getBest(SCORE_KEY, 0),
            head: null, next: [], skillReady: false, skillName: '', targets: 0,
          });
          window.setTimeout(() => setScreen('win'), 900);
        } else {
          setQuip(QUIP_LOSE[s.levelIndex % QUIP_LOSE.length]);
          api.sfx.fail();
          window.setTimeout(() => setScreen('lose'), 900);
        }
      }
    });

    api.setRender(() => {
      const s = sRef.current;
      const { ctx } = api;
      const v = view();
      ctx.save();
      ctx.translate(v.ox + camX * v.sc, v.oy);
      ctx.scale(v.sc, v.sc);
      drawWorld(ctx, api, s, trails, booms, flash, timeNow);
      ctx.restore();
    });

    // ---- input: tarik ketapel / ketuk untuk skill ----
    api.input.onDown = (p) => {
      const s = sRef.current;
      if (!s || api.loop.isPaused) return;
      if (s.phase === 'flying') { trySkill(); return; }
      if (s.phase !== 'aim') return;
      const w = toWorld(p.x, p.y);
      if (beginDrag(s, w.x, w.y)) api.sfx.ensure();
    };
    api.input.onMove = (p) => {
      const s = sRef.current;
      if (!s || !s.drag) return;
      const w = toWorld(p.x, p.y);
      moveDrag(s, w.x, w.y);
    };
    api.input.onUp = () => { releaseCurrent(); };

    // Hook baca-state untuk harness playtest (no-op di produksi).
    (window as unknown as { __kkDbg?: unknown }).__kkDbg = {
      get: () => sRef.current,
      levels: LEVELS,
      start: (i: number) => beginLevelRef.current(i),
      dragTo: (x: number, y: number) => {
        const s = sRef.current;
        if (!s) return false;
        if (!s.drag) beginDrag(s, s.level.sling.x, s.level.sling.y);
        moveDrag(s, x, y);
        return !!s.drag;
      },
      release: () => releaseCurrent(),
      skill: () => trySkill(),
    };

    return () => { apiRef.current = null; };
  });

  const togglePauseRef = useRef(togglePause);
  togglePauseRef.current = togglePause;

  const introDef = HELMS[introColor];

  return (
    <div ref={wrapRef} className="gs2d-wrap" style={{ position: 'relative' }}>
      <style>{`
        .kk-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
          background:rgba(10,18,32,.72); backdrop-filter: blur(3px); z-index:10; padding:16px; }
        .kk-card { background:linear-gradient(160deg,#1e293b,#0f172a); border:1px solid rgba(148,163,184,.25);
          border-radius:20px; padding:22px 20px; max-width:360px; width:100%; text-align:center; color:#f1f5f9;
          box-shadow:0 18px 50px rgba(0,0,0,.5); max-height:100%; overflow:auto; }
        .kk-title { font-weight:900; font-size:24px; margin:0 0 6px; }
        .kk-sub { color:#94a3b8; font-size:13px; line-height:1.55; margin:0 0 14px; }
        .kk-btn { display:block; width:100%; border:0; border-radius:14px; padding:13px; margin-top:10px;
          font-weight:800; font-size:16px; cursor:pointer; color:#fff;
          background:linear-gradient(180deg,#3b82f6,#1d4ed8); box-shadow:0 6px 18px rgba(37,99,235,.4); }
        .kk-btn:active { transform:translateY(1px); }
        .kk-btn.ghost { background:rgba(148,163,184,.15); box-shadow:none; border:1px solid rgba(148,163,184,.3); }
        .kk-stars { font-size:34px; letter-spacing:8px; margin:2px 0 8px; }
        .kk-stars .on { color:#fbbf24; text-shadow:0 0 16px rgba(251,191,36,.75); animation:kkpop .5s cubic-bezier(.2,1.6,.4,1) backwards; display:inline-block; }
        .kk-stars .off { color:#475569; display:inline-block; }
        @keyframes kkpop { from { transform:scale(0) rotate(-40deg); } to { transform:scale(1) rotate(0); } }
        .kk-lvlgrid { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin:12px 0 4px; }
        .kk-lvl { border:1px solid rgba(148,163,184,.3); background:rgba(148,163,184,.12); color:#f1f5f9;
          border-radius:12px; padding:10px 4px; font-weight:800; font-size:15px; cursor:pointer; }
        .kk-lvl small { display:block; font-size:10px; color:#fbbf24; margin-top:2px; min-height:12px; }
        .kk-lvl:active { transform:scale(.94); }
        .kk-quip { font-style:italic; color:#cbd5e1; font-size:13px; line-height:1.5; margin:8px 0 4px; }
        .kk-helmrow { display:flex; align-items:center; gap:10px; text-align:left; background:rgba(148,163,184,.1);
          border:1px solid rgba(148,163,184,.18); border-radius:12px; padding:8px 10px; margin-top:8px; }
        .kk-helmrow b { font-size:13px; display:block; }
        .kk-helmrow span { font-size:11.5px; color:#94a3b8; line-height:1.4; display:block; }
        .kk-dot { width:30px; height:30px; border-radius:50%; flex:none; border:2px solid rgba(10,15,25,.55);
          box-shadow: inset 0 -4px 6px rgba(0,0,0,.18); }
        .kk-skillhint { position:absolute; left:50%; bottom:14px; transform:translateX(-50%); z-index:5;
          background:rgba(10,18,32,.82); color:#fde68a; font-weight:800; font-size:13.5px;
          padding:9px 16px; border-radius:999px; border:1px solid rgba(253,230,138,.45);
          pointer-events:none; animation:kkpulse 1s ease-in-out infinite alternate; white-space:nowrap; }
        @keyframes kkpulse { from { transform:translateX(-50%) scale(1); } to { transform:translateX(-50%) scale(1.05); } }
        @media (prefers-reduced-motion: reduce) { .kk-stars .on, .kk-skillhint { animation:none; } }
      `}</style>
      <canvas ref={canvasRef} className="gs2d-canvas" />

      {/* HUD atas */}
      {(screen === 'play') && (
        <div className="gs2d-hud" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="gs2d-iconbtn" onClick={onExit} aria-label="Keluar" style={iconBtn}>✕</button>
            <button className="gs2d-iconbtn" onClick={togglePause} aria-label="Pause" style={iconBtn}>{paused ? '▶' : '⏸'}</button>
            <button className="gs2d-iconbtn" onClick={toggleMute} aria-label="Suara" style={iconBtn}>{muted ? '🔇' : '🔊'}</button>
          </div>
          <div style={{ textAlign: 'center', color: '#fff', fontWeight: 800 }}>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Level {hud.level} · {LEVELS[hud.level - 1]?.name}</div>
            <div style={{ fontSize: 20 }}>Skor {hud.score}</div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>Klien Revisi tersisa: {hud.targets}</div>
          </div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }} aria-label="Antrean kepala">
            {hud.head && (
              <span title={`${HELMS[hud.head].name} — ${HELMS[hud.head].skillName}`} style={{
                ...dotStyle(HELMS[hud.head].helm), width: 30, height: 30,
                outline: '2px solid #fbbf24', outlineOffset: 1,
              }} />
            )}
            {hud.next.map((c, i) => (
              <span key={i} title={HELMS[c].name} style={{ ...dotStyle(HELMS[c].helm), width: 19, height: 19, opacity: 0.85 }} />
            ))}
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 800, opacity: 0.85 }}>×{hud.balls}</span>
          </div>
        </div>
      )}

      {/* Petunjuk skill saat kepala melayang */}
      {screen === 'play' && !paused && hud.skillReady && (
        <div className="kk-skillhint">KETUK untuk {hud.skillName}!</div>
      )}

      {screen === 'tutorial' && (
        <div className="kk-overlay">
          <div className="kk-card">
            <h2 className="kk-title">Ketapel Konstruksi</h2>
            <p className="kk-sub">
              Klien sudah revisi gambar <b>13 kali</b> dan sekarang berdiri manis di atas
              struktur site. Saatnya tim proyek yang melempar.
              <br />
              <b>Tarik kepala berhelm</b> ke belakang, <b>lepas</b> untuk meluncurkan.
              <b> Ketuk saat melayang</b> untuk memakai skill helmnya (sekali per lemparan).
              Jatuhkan <b>semua Klien Revisi</b> untuk menang — timpa, ledakkan, atau
              runtuhkan bangunannya sekalian.
            </p>
            {(Object.keys(HELMS) as HelmColor[]).map((c) => (
              <div className="kk-helmrow" key={c}>
                <span className="kk-dot" style={dotStyle(HELMS[c].helm)} />
                <div>
                  <b>{HELMS[c].name} · helm {c} — {HELMS[c].skillName}</b>
                  <span>{HELMS[c].desc}</span>
                </div>
              </div>
            ))}
            <p className="kk-sub" style={{ marginTop: 12 }}>
              Kayu &amp; kaca rapuh · bata kuat · beton sangat kuat.
              Blok yang rusak akan <b>retak</b> — retakannya menunjukkan sisa kekuatannya.
            </p>
            <button className="kk-btn" onClick={() => { apiRef.current?.sfx.ensure(); apiRef.current?.sfx.click(); setScreen('levels'); }}>
              Pilih Level →
            </button>
          </div>
        </div>
      )}

      {screen === 'intro' && (
        <div className="kk-overlay">
          <div className="kk-card">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <span className="kk-dot" style={{ ...dotStyle(introDef.helm), width: 72, height: 72, borderWidth: 3 }} />
            </div>
            <h2 className="kk-title">Kepala Baru: {introDef.name}!</h2>
            <p className="kk-sub">
              Helm <b>{introColor}</b> · {introDef.role}
              <br />
              Skill: <b>{introDef.skillName}</b>
              <br />
              {introDef.desc}
              <br /><br />
              Ingat: skill dipakai dengan <b>ketuk saat kepala sedang melayang</b>,
              dan hanya bisa <b>sekali</b> per lemparan.
            </p>
            <button className="kk-btn" onClick={() => beginLevel(pendingLevel.current)}>
              Siap, Lempar! →
            </button>
            <button className="kk-btn ghost" onClick={() => setScreen('levels')}>Pilih Level Lain</button>
          </div>
        </div>
      )}

      {screen === 'levels' && (
        <div className="kk-overlay">
          <div className="kk-card">
            <h2 className="kk-title">Pilih Level</h2>
            <p className="kk-sub">Makin hemat kepala, makin banyak bintang (maks 3 per level). Estimator yang baik tidak buang-buang resource.</p>
            <div className="kk-lvlgrid">
              {LEVELS.map((l, i) => (
                <button key={i} className="kk-lvl" onClick={() => startLevel(i)}>
                  {i + 1}
                  <small>{(stars[String(i)] ?? 0) > 0 ? `${stars[String(i)]}/3 bintang` : ''}</small>
                </button>
              ))}
            </div>
            <button className="kk-btn ghost" onClick={onExit}>← Kembali</button>
          </div>
        </div>
      )}

      {screen === 'play' && paused && (
        <div className="kk-overlay">
          <div className="kk-card">
            <h2 className="kk-title">⏸ Jeda</h2>
            <p className="kk-sub">Istirahat dulu. Kayak mandor pas hujan — wajar.</p>
            <button className="kk-btn" onClick={togglePause}>Lanjutkan ▶</button>
            <button className="kk-btn ghost" onClick={() => beginLevel(sRef.current?.levelIndex ?? 0)}>↻ Ulangi Level</button>
            <button className="kk-btn ghost" onClick={() => { apiRef.current?.loop.setPaused(false); setPaused(false); setScreen('levels'); }}>Pilih Level</button>
          </div>
        </div>
      )}

      {screen === 'win' && (
        <div className="kk-overlay">
          <div className="kk-card">
            <div className="kk-stars" aria-label={`${winStars} dari 3 bintang`}>
              {[1, 2, 3].map((i) => (
                <span key={i} className={i <= winStars ? 'on' : 'off'} style={{ animationDelay: `${i * 0.15}s` }}>★</span>
              ))}
            </div>
            <h2 className="kk-title">Level {hud.level} Lunas!</h2>
            <p className="kk-sub">Skor: <b>{hud.score}</b> · Terbaik: <b>{getBest(SCORE_KEY, 0)}</b></p>
            <p className="kk-quip">"{quip}"</p>
            {hud.level < 10
              ? <button className="kk-btn" onClick={() => startLevel(hud.level)}>Level Berikutnya →</button>
              : <button className="kk-btn" onClick={() => startLevel(0)}>↻ Main Lagi dari Level 1</button>}
            <button className="kk-btn ghost" onClick={() => beginLevel(hud.level - 1)}>↻ Ulangi Level Ini</button>
            <button className="kk-btn ghost" onClick={() => setScreen('levels')}>Pilih Level</button>
          </div>
        </div>
      )}

      {screen === 'lose' && (
        <div className="kk-overlay">
          <div className="kk-card">
            <h2 className="kk-title">Klien Masih Berdiri…</h2>
            <p className="kk-sub">Skor: <b>{hud.score}</b></p>
            <p className="kk-quip">"{quip}"</p>
            <button className="kk-btn" onClick={() => beginLevel(sRef.current?.levelIndex ?? 0)}>Coba Lagi</button>
            <button className="kk-btn ghost" onClick={() => setScreen('levels')}>Pilih Level</button>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,.25)',
  background: 'rgba(15,23,42,.55)', color: '#fff', fontSize: 17, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)',
};

/** Titik helm untuk HUD/tutorial: separuh atas warna helm, separuh bawah kulit. */
function dotStyle(helm: string): React.CSSProperties {
  return {
    borderRadius: '50%', display: 'inline-block',
    background: `linear-gradient(180deg, ${helm} 0 52%, #f2c094 53% 100%)`,
    border: '2px solid rgba(10,15,25,.5)',
    boxShadow: 'inset 0 -3px 5px rgba(0,0,0,.18)',
  };
}

/* ============================== RENDER ============================== */

type TrailMap = Map<number, { color: HelmColor; pts: TrailPt[] }>;

function drawWorld(
  ctx: CanvasRenderingContext2D, api: GameApi,
  s: KState | null,
  trails: TrailMap, booms: BoomFx[], flash: number, timeNow: number,
): void {
  const sc = Math.min(api.W / WORLD_W, api.H / WORLD_H);
  const extX = (api.W - WORLD_W * sc) / 2 / sc;
  const extY = (api.H - WORLD_H * sc) / 2 / sc;
  drawSky(ctx, api, extX, extY);
  drawGround(ctx, extX, extY);
  if (s) {
    drawSlingshot(ctx, s);
    for (const b of s.blocks) if (!b.dead) drawBlock(ctx, b);
    for (const t of s.targets) if (!t.dead) drawTarget(ctx, t);
    // jejak lintasan memudar
    for (const { color, pts } of trails.values()) {
      ctx.fillStyle = HELMS[color].helm;
      for (const p of pts) {
        ctx.globalAlpha = Math.max(0, p.ttl / 0.55) * 0.4;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // kepala-kepala yang terbang
    const sb = skillBall(s);
    for (const b of s.balls) {
      drawHead(ctx, b, ballMood(b, s.phase), b === sb, timeNow, true);
    }
    // efek ledakan: cincin mengembang + kilatan
    for (const fx of booms) {
      const k = fx.t / 0.55;
      const r = EXPLO_RADIUS * (1 - (1 - k) * (1 - k));
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 7 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.4;
      ctx.fillStyle = '#fed7aa';
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,196,110,${flash * 0.16})`;
      ctx.fillRect(-extX - 60, -extY - 60, WORLD_W + 2 * (extX + 60), WORLD_H + 2 * (extY + 60));
    }
    if (s.phase === 'aim') drawTrajectory(ctx, s);
    if (s.phase === 'aim' && s.levelIndex === 0 && s.nextIdx === 0) {
      ctx.fillStyle = 'rgba(10,25,45,.78)';
      roundRect(ctx, 62, 268, 300, 34, 10); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = "800 15px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TARIK kepala ke belakang, lalu LEPAS!', 212, 286);
    }
  }
}

/** Kepala pekerja berhelm — digambar prosedural, ekspresi per mood. */
function drawHead(
  ctx: CanvasRenderingContext2D, b: Ball,
  mood: 'semangat' | 'biasa' | 'pusing',
  ring: boolean, timeNow: number, withShadow: boolean,
): void {
  const def = HELMS[b.color];
  const { x, y, r } = b;
  if (withShadow && y < GROUND_Y - 10) {
    const hgt = clamp(1 - (GROUND_Y - y) / 500, 0.15, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.26 * hgt})`;
    ctx.beginPath();
    ctx.ellipse(x, GROUND_Y + 6, r * (1.5 - hgt * 0.5), 6 * hgt + 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const sp = Math.hypot(b.vx, b.vy);
  const tilt = sp > 60 ? clamp(Math.atan2(b.vy, b.vx) * 0.28, -0.45, 0.6) : 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  // wajah
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.2, 0, 0, r * 1.05);
  g.addColorStop(0, '#f8d3a1');
  g.addColorStop(1, '#e8a96b');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,72,20,.4)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // helm: kubah + brim
  ctx.fillStyle = def.helm;
  ctx.beginPath();
  ctx.arc(0, -r * 0.1, r * 0.99, Math.PI * 0.98, Math.PI * 2.02);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = def.helmDark;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(r * 0.34, -r * 0.14, r * 0.62, Math.PI * 1.15, Math.PI * 1.95);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  // strip tengah helm
  ctx.fillStyle = def.helmDark;
  roundRect(ctx, -r * 0.14, -r * 1.12, r * 0.28, r * 0.5, r * 0.1); ctx.fill();
  // brim
  const bg = ctx.createLinearGradient(0, -r * 0.24, 0, r * 0.08);
  bg.addColorStop(0, def.helm);
  bg.addColorStop(1, def.helmDark);
  ctx.fillStyle = bg;
  roundRect(ctx, -r * 1.14, -r * 0.24, r * 2.28, r * 0.3, r * 0.13); ctx.fill();
  ctx.strokeStyle = 'rgba(60,40,10,.35)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, -r * 1.14, -r * 0.24, r * 2.28, r * 0.3, r * 0.13); ctx.stroke();
  // tali dagu
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = Math.max(2, r * 0.11);
  ctx.beginPath();
  ctx.moveTo(-r * 0.82, r * 0.1);
  ctx.quadraticCurveTo(0, r * 0.86, r * 0.82, r * 0.1);
  ctx.stroke();

  // mata & mulut per ekspresi
  ctx.fillStyle = '#1f2937';
  ctx.strokeStyle = '#1f2937';
  const ey = r * 0.22;
  if (mood === 'pusing') {
    ctx.lineWidth = Math.max(1.8, r * 0.09);
    for (const sx of [-1, 1]) {
      const cx = sx * r * 0.33;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.13, ey - r * 0.13); ctx.lineTo(cx + r * 0.13, ey + r * 0.13);
      ctx.moveTo(cx + r * 0.13, ey - r * 0.13); ctx.lineTo(cx - r * 0.13, ey + r * 0.13);
      ctx.stroke();
    }
    // mulut bergelombang
    ctx.lineWidth = Math.max(1.8, r * 0.08);
    ctx.beginPath();
    for (let i = 0; i <= 6; i += 1) {
      const mx = -r * 0.3 + (i / 6) * r * 0.6;
      const my = r * 0.52 + Math.sin(i * 1.7) * r * 0.07;
      if (i === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my);
    }
    ctx.stroke();
  } else {
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.arc(sx * r * 0.33, ey, Math.max(1.8, r * 0.1), 0, Math.PI * 2); ctx.fill();
    }
    if (mood === 'semangat') {
      // alis miring penuh tekad
      ctx.lineWidth = Math.max(2, r * 0.11);
      ctx.beginPath();
      ctx.moveTo(-r * 0.52, ey - r * 0.3); ctx.lineTo(-r * 0.16, ey - r * 0.13);
      ctx.moveTo(r * 0.52, ey - r * 0.3); ctx.lineTo(r * 0.16, ey - r * 0.13);
      ctx.stroke();
      // mulut terbuka bersemangat
      ctx.fillStyle = '#7c2d12';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.52, r * 0.24, r * 0.16, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-r * 0.2, r * 0.5, r * 0.4, r * 0.06);
    } else {
      ctx.lineWidth = Math.max(1.8, r * 0.08);
      ctx.beginPath();
      ctx.arc(0, r * 0.38, r * 0.3, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  }
  ctx.restore();

  // cincin skill siap (di luar rotasi kepala)
  if (ring) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.65 + 0.3 * Math.sin(timeNow * 6);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.setLineDash([9, 7]);
    ctx.lineDashOffset = -timeNow * 34;
    ctx.beginPath(); ctx.arc(0, 0, r + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

/** Kepala "Klien Revisi" — figur berdiri dengan dasi merah & papan REV. */
function drawTarget(ctx: CanvasRenderingContext2D, t: KState['targets'][number]): void {
  const cx = t.x + TARGET_W / 2;
  const feetY = t.y + TARGET_H;
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath(); ctx.ellipse(cx, feetY + 3, 20, 4.5, 0, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.translate(cx, feetY);
  ctx.rotate(t.grounded ? Math.sin(t.wobble) * 0.035 : t.angle);
  // kaki & sepatu
  ctx.fillStyle = '#334155';
  ctx.fillRect(-11, -13, 9, 13);
  ctx.fillRect(2, -13, 9, 13);
  ctx.fillStyle = '#111827';
  ctx.fillRect(-13, -3, 12, 3.4);
  ctx.fillRect(1, -3, 12, 3.4);
  // badan kemeja + dasi merah
  ctx.fillStyle = '#e2e8f0';
  roundRect(ctx, -13, -34, 26, 22, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(70,85,105,.5)';
  ctx.lineWidth = 1;
  roundRect(ctx, -13, -34, 26, 22, 5); ctx.stroke();
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(0, -33); ctx.lineTo(3.4, -29); ctx.lineTo(1.2, -19); ctx.lineTo(-1.2, -19); ctx.lineTo(-3.4, -29);
  ctx.closePath(); ctx.fill();
  // lengan (naik saat jatuh)
  ctx.strokeStyle = '#d9a066';
  ctx.lineWidth = 4.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (t.grounded) {
    ctx.moveTo(-13, -30); ctx.lineTo(-17, -16);
    ctx.moveTo(13, -30); ctx.lineTo(17, -16);
  } else {
    ctx.moveTo(-13, -30); ctx.lineTo(-19, -42);
    ctx.moveTo(13, -30); ctx.lineTo(19, -42);
  }
  ctx.stroke();
  // papan REV di tangan kiri
  ctx.save();
  ctx.translate(-21, -22);
  ctx.rotate(-0.12);
  ctx.fillStyle = '#fdfdf8';
  roundRect(ctx, -9, -7, 18, 14, 2); ctx.fill();
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1.6;
  roundRect(ctx, -9, -7, 18, 14, 2); ctx.stroke();
  ctx.fillStyle = '#dc2626';
  ctx.font = "900 7.5px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('REV', 0, 0.5);
  ctx.restore();
  // kepala + rambut rapi
  const hy = -44;
  ctx.fillStyle = '#f2c094';
  ctx.beginPath(); ctx.arc(0, hy, 10.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#26221f';
  ctx.beginPath(); ctx.arc(0, hy - 1.5, 10.5, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
  ctx.fillRect(4, hy - 11, 6.5, 5);
  // alis marah + mata + cemberut
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(-7.5, hy + 0.5); ctx.lineTo(-2.5, hy + 2.6);
  ctx.moveTo(7.5, hy + 0.5); ctx.lineTo(2.5, hy + 2.6);
  ctx.stroke();
  ctx.fillStyle = '#1f2937';
  ctx.beginPath(); ctx.arc(-4, hy + 4.4, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(4, hy + 4.4, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, hy + 10.5, 3.6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.restore();
}

function drawSky(ctx: CanvasRenderingContext2D, api: GameApi, extX: number, extY: number): void {
  const t = performance.now() / 1000;
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  g.addColorStop(0, '#2f7fc4');
  g.addColorStop(0.55, '#8ec9ef');
  g.addColorStop(0.82, '#f6e3bd');
  g.addColorStop(1, '#f2cf9a');
  ctx.fillStyle = g;
  ctx.fillRect(-extX - 60, -extY - 60, WORLD_W + 2 * (extX + 60), WORLD_H + 2 * (extY + 60));

  const sx = 740; const sy = 130;
  const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 120);
  glow.addColorStop(0, 'rgba(255,244,200,.95)');
  glow.addColorStop(1, 'rgba(255,244,200,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - 130, sy - 130, 260, 260);
  ctx.fillStyle = '#fff6d8';
  ctx.beginPath(); ctx.arc(sx, sy, 34, 0, Math.PI * 2); ctx.fill();

  drawClouds(ctx, t * 6, 0.35, 0.5, ['rgba(255,255,255,.75)']);
  drawClouds(ctx, t * 14 + 300, 0.75, 0.75, ['rgba(255,255,255,.9)']);

  ctx.fillStyle = 'rgba(70,110,150,.35)';
  const bld = [40, 120, 210, 330, 470, 560, 700, 800];
  bld.forEach((x, i) => {
    const h = 90 + ((i * 53) % 70);
    ctx.fillRect(x, GROUND_Y - h, 64, h);
  });
  ctx.strokeStyle = 'rgba(50,80,115,.5)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(880, GROUND_Y); ctx.lineTo(880, GROUND_Y - 230);
  ctx.moveTo(800, GROUND_Y - 215); ctx.lineTo(940, GROUND_Y - 215);
  ctx.moveTo(930, GROUND_Y - 215); ctx.lineTo(930, GROUND_Y - 160);
  ctx.stroke();
  ctx.fillStyle = 'rgba(50,80,115,.5)';
  ctx.fillRect(922, GROUND_Y - 150, 16, 22);
}

function drawClouds(ctx: CanvasRenderingContext2D, off: number, yFrac: number, scale: number, colors: string[]): void {
  ctx.fillStyle = colors[0];
  for (let i = 0; i < 5; i += 1) {
    const x = ((i * 260 + off) % (WORLD_W + 320)) - 160;
    const y = 60 + yFrac * 130 + (i % 3) * 26;
    cloud(ctx, x, y, scale);
  }
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
  ctx.arc(x + 28 * s, y - 10 * s, 32 * s, 0, Math.PI * 2);
  ctx.arc(x + 58 * s, y, 24 * s, 0, Math.PI * 2);
  ctx.arc(x + 30 * s, y + 12 * s, 26 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawGround(ctx: CanvasRenderingContext2D, extX: number, extY: number): void {
  const g = ctx.createLinearGradient(0, GROUND_Y, 0, WORLD_H);
  g.addColorStop(0, '#8a5f3d');
  g.addColorStop(1, '#5e3f26');
  ctx.fillStyle = g;
  ctx.fillRect(-70, GROUND_Y, WORLD_W + 140, WORLD_H - GROUND_Y + extY + 70);
  const gr = ctx.createLinearGradient(0, GROUND_Y - 14, 0, GROUND_Y + 6);
  gr.addColorStop(0, '#86c95a');
  gr.addColorStop(1, '#5da23e');
  ctx.fillStyle = gr;
  ctx.fillRect(-extX - 60, GROUND_Y - 14, WORLD_W + 2 * (extX + 60), 20);
  ctx.fillStyle = 'rgba(30,60,20,.35)';
  ctx.fillRect(-extX - 60, GROUND_Y - 14, WORLD_W + 2 * (extX + 60), 3);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  for (let i = 0; i < 40; i += 1) {
    const x = (i * 97 + 13) % WORLD_W;
    const y = GROUND_Y + 18 + ((i * 41) % 52);
    ctx.beginPath(); ctx.ellipse(x, y, 3 + (i % 3), 2 + (i % 2), 0, 0, Math.PI * 2); ctx.fill();
  }
  const v = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 260, WORLD_W / 2, WORLD_H / 2, 620);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(10,20,40,.22)');
  ctx.fillStyle = v;
  ctx.fillRect(-extX - 60, -extY - 60, WORLD_W + 2 * (extX + 60), WORLD_H + 2 * (extY + 60));
}

function drawSlingshot(ctx: CanvasRenderingContext2D, s: KState): void {
  const bx = s.level.sling.x;
  const baseY = GROUND_Y;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(bx, baseY + 8, 46, 10, 0, 0, Math.PI * 2); ctx.fill();

  const branch = (x1: number, y1: number, x2: number, y2: number, w: number) => {
    ctx.strokeStyle = '#5a3a1e';
    ctx.lineWidth = w + 4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = '#8a5a2e';
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,35,12,.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x1 + 2, y1); ctx.lineTo(x2 + 2, y2); ctx.stroke();
  };
  branch(bx, baseY, bx, 510, 22);
  branch(bx, 520, bx - 30, 462, 15);
  branch(bx, 520, bx + 30, 462, 15);

  const tipL = { x: bx - 30, y: 462 };
  const tipR = { x: bx + 30, y: 462 };
  const pk = s.drag ?? { x: s.level.sling.x, y: s.level.sling.y };
  const head = currentHead(s);

  // kepala berikutnya mengantre di tanah samping ketapel
  if (s.phase === 'aim') {
    const upcoming = s.level.queue.slice(s.nextIdx + 1, s.nextIdx + 3);
    upcoming.forEach((c, i) => {
      const qb: Ball = {
        x: bx + 52 + i * 34, y: GROUND_Y - 12, vx: 0, vy: 0, r: 12,
        color: c, mini: false, dead: false, age: 0, slowT: 0, flightId: -1 - i,
        skillUsed: true, boosted: false, slammed: false, spin: 0,
      };
      drawHead(ctx, qb, 'biasa', false, 0, false);
    });
    if (s.level.queue.length - s.nextIdx - 1 > 2) {
      ctx.fillStyle = 'rgba(10,25,45,.75)';
      ctx.font = "800 12px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`+${s.level.queue.length - s.nextIdx - 3}`, bx + 122, GROUND_Y - 12);
    }
  }

  // karet
  ctx.strokeStyle = '#3f2a18';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(tipL.x, tipL.y); ctx.lineTo(pk.x, pk.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tipR.x, tipR.y); ctx.lineTo(pk.x, pk.y); ctx.stroke();

  if (s.phase === 'aim' && head) {
    const hb: Ball = {
      x: pk.x, y: pk.y, vx: 0, vy: 0, r: HELMS[head].radius,
      color: head, mini: false, dead: false, age: 0, slowT: 0, flightId: 0,
      skillUsed: false, boosted: false, slammed: false, spin: 0,
    };
    drawHead(ctx, hb, 'semangat', false, 0, false);
    ctx.strokeStyle = 'rgba(63,42,24,.85)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(tipL.x, tipL.y); ctx.lineTo(pk.x, pk.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tipR.x, tipR.y); ctx.lineTo(pk.x, pk.y); ctx.stroke();
  }
}

function drawTrajectory(ctx: CanvasRenderingContext2D, s: KState): void {
  if (!s.drag) return;
  const pk = s.drag;
  const dx = s.level.sling.x - pk.x;
  const dy = s.level.sling.y - pk.y;
  if (Math.hypot(dx, dy) < 18) return;
  const v = launchVel(s.level.sling.x, s.level.sling.y, pk.x, pk.y);
  const pts = predict(s.level.sling.x, s.level.sling.y, v.vx, v.vy);
  ctx.fillStyle = '#fff';
  const n = Math.min(pts.length, 16);
  for (let i = 0; i < n; i += 2) {
    const p = pts[i];
    ctx.globalAlpha = 0.85 - (i / n) * 0.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, 5 - (i / n) * 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const frac = launchPowerFrac(Math.hypot(dx, dy));
  const mx = s.level.sling.x - 62; const my = s.level.sling.y + 74;
  ctx.fillStyle = 'rgba(10,18,32,.62)';
  roundRect(ctx, mx, my, 124, 26, 7); ctx.fill();
  ctx.fillStyle = frac >= 0.95 ? '#ef4444' : frac >= 0.6 ? '#f97316' : '#22c55e';
  if (frac > 0) { roundRect(ctx, mx + 4, my + 4, 116 * frac, 8, 4); ctx.fill(); }
  ctx.fillStyle = '#fff';
  ctx.font = "800 10px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`DAYA ${launchPowerLabel(frac)} ${Math.round(frac * 100)}%`, mx + 62, my + 19);
}

function drawBlock(ctx: CanvasRenderingContext2D, b: Block): void {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  ctx.save();
  ctx.translate(3, 5);
  ctx.rotate(b.angle);
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  roundRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 3);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(b.angle);
  const w = b.w; const h = b.h;
  const x0 = -w / 2; const y0 = -h / 2;

  if (b.mat === 'kayu') {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, '#c08a4e'); g.addColorStop(1, '#8a5a2e');
    ctx.fillStyle = g;
    roundRect(ctx, x0, y0, w, h, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(70,40,15,.55)'; ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i += 1) {
      const yy = y0 + (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(x0 + 3, yy); ctx.lineTo(x0 + w - 3, yy); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,235,200,.25)';
    ctx.fillRect(x0 + 2, y0 + 2, w - 4, 5);
  } else if (b.mat === 'kaca') {
    ctx.fillStyle = 'rgba(200,232,248,.92)';
    roundRect(ctx, x0, y0, w, h, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath();
    ctx.moveTo(x0 + 4, y0 + h - 4); ctx.lineTo(x0 + w * 0.45, y0 + 4);
    ctx.lineTo(x0 + w * 0.62, y0 + 4); ctx.lineTo(x0 + 4, y0 + h - 4 + (w * 0.17));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(120,170,200,.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0 + w / 2, y0 + 4); ctx.lineTo(x0 + w / 2, y0 + h - 4); ctx.stroke();
  } else if (b.mat === 'bata') {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, '#d4693f'); g.addColorStop(1, '#a34a26');
    ctx.fillStyle = g;
    roundRect(ctx, x0, y0, w, h, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(240,220,200,.7)'; ctx.lineWidth = 2;
    const rows = Math.max(2, Math.round(h / 26));
    for (let i = 1; i < rows; i += 1) {
      const yy = y0 + (h / rows) * i;
      ctx.beginPath(); ctx.moveTo(x0 + 2, yy); ctx.lineTo(x0 + w - 2, yy); ctx.stroke();
      const off = (i % 2) * (w / 4);
      ctx.beginPath(); ctx.moveTo(x0 + w / 2 + (off ? -w / 4 : 0), yy - h / rows);
      ctx.lineTo(x0 + w / 2 + (off ? -w / 4 : 0), yy); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,220,180,.22)';
    ctx.fillRect(x0 + 2, y0 + 2, w - 4, 5);
  } else if (b.mat === 'beton') {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, '#aeb4bc'); g.addColorStop(1, '#7d838c');
    ctx.fillStyle = g;
    roundRect(ctx, x0, y0, w, h, 3); ctx.fill();
    ctx.fillStyle = 'rgba(60,64,70,.35)';
    const n = Math.floor((w * h) / 260);
    for (let i = 0; i < n; i += 1) {
      const px = x0 + 4 + ((i * 37) % Math.max(2, w - 8));
      const py = y0 + 4 + ((i * 53) % Math.max(2, h - 8));
      ctx.fillRect(px, py, 2.4, 2.4);
    }
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.fillRect(x0 + 2, y0 + 2, w - 4, 5);
  } else {
    ctx.fillStyle = '#fdfdf8';
    roundRect(ctx, x0, y0, w, h, 2); ctx.fill();
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x0 + 4, y0 + 4, w - 8, 10);
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${Math.min(9, w / 5)}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('REV-13', 0, y0 + 9);
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i += 1) {
      const yy = y0 + 22 + i * 8;
      if (yy > y0 + h - 6) break;
      ctx.beginPath(); ctx.moveTo(x0 + 6, yy); ctx.lineTo(x0 + w - 6, yy); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(148,163,184,.6)';
    ctx.beginPath(); ctx.moveTo(x0 + w, y0); ctx.lineTo(x0 + w - 9, y0); ctx.lineTo(x0 + w, y0 + 9); ctx.closePath(); ctx.fill();
  }

  const crack = crackLevel(b.mat, b.hp);
  if (crack > 0) {
    ctx.strokeStyle = 'rgba(15,18,24,.72)';
    ctx.lineWidth = 1.6;
    const lines = crack === 1 ? 2 : 4;
    for (let i = 0; i < lines; i += 1) {
      const sx = x0 + w * (0.22 + 0.18 * i);
      ctx.beginPath();
      ctx.moveTo(sx, y0 + 2);
      ctx.lineTo(sx + w * 0.08, y0 + h * 0.38);
      ctx.lineTo(sx - w * 0.05, y0 + h * 0.66);
      if (crack === 2) ctx.lineTo(sx + w * 0.1, y0 + h - 3);
      ctx.stroke();
    }
    if (crack === 2) {
      ctx.fillStyle = 'rgba(15,18,24,.35)';
      ctx.beginPath();
      ctx.moveTo(x0 + w, y0 + h); ctx.lineTo(x0 + w - 9, y0 + h); ctx.lineTo(x0 + w, y0 + h - 9);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.strokeStyle = b.mat === 'berkas' ? '#94a3b8' : 'rgba(20,25,35,.65)';
  ctx.lineWidth = 2;
  roundRect(ctx, x0, y0, w, h, 3); ctx.stroke();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
