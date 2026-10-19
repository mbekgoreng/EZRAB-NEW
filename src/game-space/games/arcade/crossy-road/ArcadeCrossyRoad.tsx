/**
 * ArcadeCrossyRoad ("Nyebrang Proyek") — tukang menyeberangi jalan proyek,
 * menghindari truk molen, pickup & beko. Render 2.5D: lajur berlapis,
 * kendaraan kotak 3D, bayangan, dan kabut jarak.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp, lerp } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  createState, hop, step, getLane, COLS,
  type State, type Lane, type Vehicle,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('nyebrang-proyek', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface S {
  st: State;
  camRow: number;
  hopT: number; // animasi lompat 0..1
  fromX: number;
  fromY: number;
  deathT: number;
}

export default function ArcadeCrossyRoad({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, best: getBest(BK, 0), hops: 0 });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      st: createState((Date.now() % 100000) | 0),
      camRow: 0, hopT: 1, fromX: 4, fromY: 0, deathT: 0,
    };
    let tile = 40;
    let swipeStart: { x: number; y: number } | null = null;

    const layout = (): void => {
      tile = api.W / COLS;
    };
    layout();
    api.onResize(() => layout());

    const rowY = (row: number, H: number): number => H * 0.68 - (row - s.camRow) * tile;

    const push = (): void => {
      api.pushHud({ score: s.st.score, best: getBest(BK, 0), hops: s.st.hops });
    };

    const reset = (): void => {
      s.st = createState((Date.now() % 100000) | 0);
      s.camRow = 0;
      s.hopT = 1;
      s.fromX = 4; s.fromY = 0;
      s.deathT = 0;
      push();
    };

    const doHop = (dx: number, dy: number): void => {
      if (s.st.over || screenRef.current !== 'play') return;
      s.fromX = s.st.px;
      s.fromY = s.st.py;
      const before = s.st.score;
      if (hop(s.st, dx, dy)) {
        s.hopT = 0;
        api.sfx.ensure();
        api.sfx.pop(0.9 + Math.random() * 0.2);
        const cx = (s.st.px + 0.5) * tile;
        api.particles.spawn(cx, rowY(s.st.py, api.H), {
          count: 6, colors: ['#d6c39a', '#a8916a', '#fef3c7'],
          speed: [40, 140], life: [0.25, 0.5], size: [2, 4], gravity: 400, shape: 'rect',
        });
        if (s.st.score > before) {
          api.scores.add(cx, rowY(s.st.py, api.H) - tile, `+1`, { color: '#4ade80', size: 16 });
        }
        push();
      }
    };

    const endGame = (): void => {
      const nb = setBest(BK, s.st.score);
      s.deathT = 1.2;
      api.shake.add(0.8);
      api.sfx.fail();
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, '🚚 KEGILAS MOLEN!', { size: 24, color: '#f87171' });
      api.particles.spawn((s.st.px + 0.5) * tile, rowY(s.st.py, api.H), {
        count: 30, colors: ['#f87171', '#fbbf24', '#78716c'],
        speed: [100, 400], life: [0.4, 0.9], size: [2, 6], gravity: 600, shape: 'rect', rotation: true,
      });
      window.setTimeout(() => {
        api.pushHud({ score: s.st.score, best: nb, hops: s.st.hops });
        setScreen('over');
      }, 1300);
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      swipeStart = { x: p.x, y: p.y };
    };
    api.input.onUp = (p) => {
      if (!swipeStart || screenRef.current !== 'play' || s.st.over) { swipeStart = null; return; }
      const dx = p.x - swipeStart.x;
      const dy = p.y - swipeStart.y;
      if (Math.hypot(dx, dy) > 20) {
        if (Math.abs(dx) > Math.abs(dy)) doHop(dx > 0 ? 1 : -1, 0);
        else doHop(0, dy > 0 ? -1 : 1);
      } else {
        // ketuk: atas=maju, bawah=mundur, kiri/kanan
        const third = api.W / 3;
        if (p.y < api.H * 0.45) doHop(0, 1);
        else if (p.y > api.H * 0.8) doHop(0, -1);
        else if (p.x < third) doHop(-1, 0);
        else if (p.x > third * 2) doHop(1, 0);
        else doHop(0, 1);
      }
      swipeStart = null;
    };

    const keyDir = (): void => {
      if (api.input.wasPressed('ArrowUp') || api.input.wasPressed('KeyW')) doHop(0, 1);
      if (api.input.wasPressed('ArrowDown') || api.input.wasPressed('KeyS')) doHop(0, -1);
      if (api.input.wasPressed('ArrowLeft') || api.input.wasPressed('KeyA')) doHop(-1, 0);
      if (api.input.wasPressed('ArrowRight') || api.input.wasPressed('KeyD')) doHop(1, 0);
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      if (screenRef.current !== 'play' || s.st.over) {
        if (s.deathT > 0) s.deathT -= dt;
        return;
      }
      keyDir();
      step(s.st, dt);
      s.camRow = lerp(s.camRow, s.st.py - 4.2, Math.min(1, dt * 5));
      if (s.hopT < 1) s.hopT = Math.min(1, s.hopT + dt / 0.14);
      if (s.st.over) endGame();
    });

    /* ---------------- render 2.5D ---------------- */

    const drawLane = (ctx: CanvasRenderingContext2D, row: number, lane: Lane, W: number, H: number): void => {
      const y = rowY(row, H) - tile / 2;
      if (y < -tile * 2 || y > H + tile) return;
      if (lane.kind === 'jalan') {
        // aspal berlapis
        const g = ctx.createLinearGradient(0, y, 0, y + tile);
        g.addColorStop(0, '#3f4756');
        g.addColorStop(0.12, '#333a49');
        g.addColorStop(1, '#22262f');
        ctx.fillStyle = g;
        ctx.fillRect(0, y, W, tile);
        // marka tengah putus-putus
        ctx.fillStyle = 'rgba(253,224,71,0.75)';
        const dashW = tile * 0.5;
        const off = (s.st.t * lane.speed * lane.dir * tile) % (dashW * 2);
        for (let x = -dashW * 2 + off; x < W + dashW; x += dashW * 2) {
          ctx.fillRect(x, y + tile / 2 - 2, dashW, 4);
        }
        // tepi jalan (sisi depan lebih gelap = kedalaman)
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, y + tile - 5, W, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(0, y, W, 3);
      } else {
        // tanah proyek
        const rest = row % 7 === 6;
        const g = ctx.createLinearGradient(0, y, 0, y + tile);
        if (rest) {
          g.addColorStop(0, '#b8a06a');
          g.addColorStop(1, '#8a744a');
        } else {
          g.addColorStop(0, '#a08c5f');
          g.addColorStop(1, '#77653f');
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, y, W, tile);
        // tekstur kerikil
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        const n = Math.floor(W / 26);
        for (let i = 0; i < n; i += 1) {
          const gx = ((i * 47 + row * 31) % Math.max(1, W - 8)) + 4;
          const gy = y + ((i * 29 + row * 17) % Math.max(1, Math.floor(tile) - 8)) + 4;
          ctx.beginPath(); ctx.arc(gx, gy, 2, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(0, y + tile - 4, W, 4);
        // pita pembatas di zona istirahat
        if (rest) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, y + 4, W, 10);
          ctx.clip();
          for (let x = -10; x < W + 10; x += 20) {
            ctx.fillStyle = (x / 20) % 2 === 0 ? '#facc15' : '#1f2937';
            ctx.beginPath();
            ctx.moveTo(x, y + 14); ctx.lineTo(x + 10, y + 4); ctx.lineTo(x + 20, y + 4); ctx.lineTo(x + 10, y + 14);
            ctx.closePath(); ctx.fill();
          }
          ctx.restore();
          ctx.fillStyle = 'rgba(60,45,20,0.8)';
          ctx.font = `800 ${Math.max(9, tile * 0.28)}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🛖 POS ISTIRAHAT', W / 2, y + tile * 0.68);
        }
        // dekorasi: cone & tumpukan material
        for (const c of lane.deco) {
          const dx = (c + 0.5) * tile;
          if (c % 3 === 0) {
            // cone
            ctx.fillStyle = '#f97316';
            ctx.beginPath();
            ctx.moveTo(dx - 8, y + tile - 8); ctx.lineTo(dx, y + 8); ctx.lineTo(dx + 8, y + tile - 8);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillRect(dx - 5, y + tile * 0.5, 10, 5);
            ctx.fillStyle = '#7c2d12';
            ctx.fillRect(dx - 10, y + tile - 8, 20, 5);
          } else if (c % 3 === 1) {
            // tumpukan bata mini (kubus 2.5D)
            const bw = tile * 0.42;
            const bh = tile * 0.3;
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath(); ctx.ellipse(dx, y + tile - 6, bw * 0.6, 5, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = '#b45309';
            ctx.fillRect(dx - bw / 2, y + tile - 8 - bh, bw, bh);
            ctx.fillStyle = '#d97706';
            ctx.fillRect(dx - bw / 2, y + tile - 8 - bh, bw, bh * 0.35);
            ctx.strokeStyle = 'rgba(80,40,5,0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(dx - bw / 2, y + tile - 8 - bh, bw, bh);
          } else {
            // drum aspal
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath(); ctx.ellipse(dx, y + tile - 6, 12, 4, 0, 0, TAU); ctx.fill();
            const dg = ctx.createLinearGradient(dx - 10, 0, dx + 10, 0);
            dg.addColorStop(0, '#1e40af');
            dg.addColorStop(0.5, '#3b82f6');
            dg.addColorStop(1, '#1e3a8a');
            ctx.fillStyle = dg;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') ctx.roundRect(dx - 10, y + tile - 30, 20, 24, 4);
            else ctx.rect(dx - 10, y + tile - 30, 20, 24);
            ctx.fill();
          }
        }
      }
    };

    const drawVehicle = (ctx: CanvasRenderingContext2D, v: Vehicle, lane: Lane, row: number, H: number): void => {
      const y = rowY(row, H);
      const x = (v.x + v.w / 2) * tile;
      const wpx = v.w * tile;
      const hpx = tile * (v.kind === 'molen' ? 0.95 : 0.72);
      const top = y - hpx / 2;
      const flip = lane.dir === -1;
      // bayangan
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(x, y + tile * 0.42, wpx * 0.48, tile * 0.12, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      if (flip) ctx.scale(-1, 1);
      const bx = -wpx / 2;
      // badan
      let body: CanvasGradient;
      if (v.kind === 'molen') {
        body = ctx.createLinearGradient(0, top - y, 0, top - y + hpx);
        body.addColorStop(0, '#e2e8f0');
        body.addColorStop(0.55, '#94a3b8');
        body.addColorStop(1, '#475569');
      } else if (v.kind === 'beko') {
        body = ctx.createLinearGradient(0, top - y, 0, top - y + hpx);
        body.addColorStop(0, '#fde047');
        body.addColorStop(1, '#b45309');
      } else {
        body = ctx.createLinearGradient(0, top - y, 0, top - y + hpx);
        body.addColorStop(0, '#fca5a5');
        body.addColorStop(1, '#991b1b');
      }
      ctx.fillStyle = body;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, top - y - hpx * 0.35, wpx, hpx, 8);
      else ctx.rect(bx, top - y - hpx * 0.35, wpx, hpx);
      ctx.fill();
      // kabin depan
      ctx.fillStyle = 'rgba(15,23,42,0.85)';
      const cabW = wpx * 0.22;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(bx + wpx - cabW - 4, top - y - hpx * 0.35 + 6, cabW, hpx * 0.42, 5);
      else ctx.rect(bx + wpx - cabW - 4, top - y - hpx * 0.35 + 6, cabW, hpx * 0.42);
      ctx.fill();
      ctx.fillStyle = 'rgba(186,230,253,0.7)';
      ctx.fillRect(bx + wpx - cabW, top - y - hpx * 0.35 + 10, cabW - 8, hpx * 0.2);
      if (v.kind === 'molen') {
        // drum molen
        const dw = wpx * 0.5;
        const dh = hpx * 0.5;
        const dg = ctx.createLinearGradient(0, top - y - hpx * 0.1, 0, top - y - hpx * 0.1 + dh);
        dg.addColorStop(0, '#f8fafc');
        dg.addColorStop(1, '#94a3b8');
        ctx.fillStyle = dg;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(bx + wpx * 0.32, top - y - hpx * 0.1 + dh / 2, dw / 2, dh / 2, 0, 0, TAU);
        ctx.clip();
        ctx.fillRect(bx + wpx * 0.32 - dw / 2, top - y - hpx * 0.1, dw, dh);
        ctx.fillStyle = 'rgba(249,115,22,0.55)';
        const stripeOff = (s.st.t * 40) % 24;
        for (let sx = -24 + stripeOff; sx < dw; sx += 24) {
          ctx.fillRect(bx + wpx * 0.32 - dw / 2 + sx, top - y - hpx * 0.1, 10, dh);
        }
        ctx.restore();
      }
      if (v.kind === 'beko') {
        // lengan beko
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(bx + wpx * 0.3, top - y - hpx * 0.3);
        ctx.lineTo(bx + wpx * 0.62, top - y - hpx * 0.85);
        ctx.stroke();
        ctx.fillStyle = '#57534e';
        ctx.fillRect(bx + wpx * 0.62 - 8, top - y - hpx * 0.85 - 4, 16, 12);
      }
      // roda
      const wy = tile * 0.32;
      const wheels = v.kind === 'molen' ? 3 : 2;
      for (let i = 0; i < wheels; i += 1) {
        const wx = bx + (wpx / (wheels + 1)) * (i + 1);
        ctx.fillStyle = '#111827';
        ctx.beginPath(); ctx.arc(wx, wy, tile * 0.16, 0, TAU); ctx.fill();
        ctx.fillStyle = '#9ca3af';
        ctx.beginPath(); ctx.arc(wx, wy, tile * 0.07, 0, TAU); ctx.fill();
      }
      // lampu depan + sorot
      ctx.fillStyle = '#fef08a';
      ctx.beginPath(); ctx.arc(bx + wpx - 2, top - y + hpx * 0.32, 4, 0, TAU); ctx.fill();
      const lg = ctx.createLinearGradient(bx + wpx, 0, bx + wpx + tile * 1.6, 0);
      lg.addColorStop(0, 'rgba(254,240,138,0.28)');
      lg.addColorStop(1, 'rgba(254,240,138,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(bx + wpx, top - y + hpx * 0.1);
      ctx.lineTo(bx + wpx + tile * 1.6, top - y - hpx * 0.1);
      ctx.lineTo(bx + wpx + tile * 1.6, top - y + hpx * 0.7);
      ctx.lineTo(bx + wpx, top - y + hpx * 0.55);
      ctx.closePath(); ctx.fill();
      // kilau atas
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(bx + 4, top - y - hpx * 0.35 + 3, wpx - 8, 5);
      ctx.restore();
    };

    const drawPlayer = (ctx: CanvasRenderingContext2D, H: number): void => {
      const t = s.hopT < 1 ? s.hopT : 1;
      const ix = lerp(s.fromX, s.st.px, t);
      const iy = lerp(s.fromY, s.st.py, t);
      const jumpArc = Math.sin(t * Math.PI) * tile * 0.55;
      const x = (ix + 0.5) * tile;
      const y = rowY(iy, H) - (t < 1 ? jumpArc : 0);
      const u = tile / 40;
      // bayangan
      const shScale = 1 - (t < 1 ? Math.sin(t * Math.PI) * 0.45 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(x, rowY(iy, H) + tile * 0.4, 13 * u * shScale, 5 * u * shScale, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      if (s.deathT > 0) {
        const k = clamp(s.deathT / 1.2, 0, 1);
        ctx.scale(1.3 - 0.3 * k, 0.4 + 0.6 * k);
        ctx.globalAlpha = 0.4 + 0.6 * k;
      }
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      // kaki
      ctx.fillStyle = '#1f2937';
      const stepPh = s.hopT < 1 ? Math.sin(t * Math.PI * 2) * 4 * u : Math.sin(performance.now() / 200) * 1.5 * u;
      ctx.fillRect(-8 * u, -12 * u, 6 * u, 12 * u + stepPh);
      ctx.fillRect(2 * u, -12 * u, 6 * u, 12 * u - stepPh);
      // badan rompi
      const bg = ctx.createLinearGradient(0, -34 * u, 0, -10 * u);
      bg.addColorStop(0, '#fdba74');
      bg.addColorStop(1, '#ea580c');
      ctx.fillStyle = bg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-10 * u, -36 * u, 20 * u, 26 * u, 7 * u);
      else ctx.rect(-10 * u, -36 * u, 20 * u, 26 * u);
      ctx.fill();
      ctx.fillStyle = 'rgba(253,224,71,0.95)';
      ctx.fillRect(-10 * u, -28 * u, 20 * u, 4 * u);
      // kepala + helm
      ctx.fillStyle = '#f2c79b';
      ctx.beginPath(); ctx.arc(0, -44 * u, 9 * u, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1f2937';
      ctx.beginPath(); ctx.arc(-3.5 * u, -45 * u, 1.6 * u, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(3.5 * u, -45 * u, 1.6 * u, 0, TAU); ctx.fill();
      const hg = ctx.createLinearGradient(0, -62 * u, 0, -48 * u);
      hg.addColorStop(0, '#fde047');
      hg.addColorStop(1, '#d97706');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(0, -48 * u, 10.5 * u, Math.PI, 0); ctx.fill();
      ctx.fillRect(-12.5 * u, -50 * u, 25 * u, 3.5 * u);
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      // langit-langit lokasi (atas = jauh)
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0e1628');
      bg.addColorStop(0.5, '#1a2b1a');
      bg.addColorStop(1, '#2b2118');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      const r0 = Math.floor(s.camRow) - 2;
      const r1 = Math.ceil(s.camRow + H / tile) + 2;
      // lajur dari jauh ke dekat (painter's algorithm)
      for (let r = r1; r >= r0; r -= 1) {
        if (r < 0) continue;
        drawLane(ctx, r, getLane(s.st, r), W, H);
      }
      // tanah basecamp di bawah baris 0
      const gy0 = rowY(0, H) + tile / 2;
      if (gy0 < H) {
        const gg = ctx.createLinearGradient(0, gy0, 0, H);
        gg.addColorStop(0, '#6b5a3e');
        gg.addColorStop(1, '#2b2118');
        ctx.fillStyle = gg;
        ctx.fillRect(0, gy0, W, H - gy0);
        ctx.fillStyle = 'rgba(220,230,250,0.55)';
        ctx.font = `800 11px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🏕️ BASECAMP', W / 2, Math.min(H - 24, gy0 + 30));
      }
      // kendaraan (di atas lajur, di bawah pemain)
      for (let r = r0; r <= r1; r += 1) {
        if (r < 0) continue;
        const lane = getLane(s.st, r);
        if (lane.kind !== 'jalan') continue;
        for (const v of lane.vehicles) drawVehicle(ctx, v, lane, r, H);
      }
      if (!(s.st.over && s.deathT <= 0)) drawPlayer(ctx, H);
      // kabut jarak di atas
      const fog = ctx.createLinearGradient(0, 0, 0, H * 0.35);
      fog.addColorStop(0, 'rgba(10,14,28,0.75)');
      fog.addColorStop(1, 'rgba(10,14,28,0)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, 0, W, H * 0.35);
      // judul
      ctx.fillStyle = 'rgba(220,230,250,0.6)';
      ctx.font = `800 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚧 AWAS KENDARAAN PROYEK', W / 2, H - 14);
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(8,6,2,0.45)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    (api as unknown as { __reset: () => void }).__reset = reset;
    reset();
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (): void => {
    const api = apiRef.current;
    api?.sfx.ensure();
    (api as unknown as { __reset?: () => void } | null)?.__reset?.();
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
    if (api) api.sfx.ensure();
    setMuted((m) => {
      const next = !m;
      if (api && api.sfx.muted !== next) api.sfx.toggleMute();
      return next;
    });
  };

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(12,18,34,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 600, overflow: 'hidden', borderRadius: 18, background: '#1a2b1a', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(12,18,34,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 130 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>🚧 {hud.score.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>Terbaik: <b>{hud.best.toLocaleString('id-ID')}</b> • 🐾 {hud.hops}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🚧</div>
          <h2 style={h2}>NYEBRANG PROYEK</h2>
          <p style={p}>
            <b>Geser / ketuk / panah</b> untuk melompatkan tukang.
            Seberangi jalan proyek sejauh mungkin — hindari <b>truk molen 🚚</b>, pickup & beko!
            Tiap 7 baris ada <b>🛖 pos istirahat</b> yang aman.
          </p>
          {hud.best > 0 && <p style={p}>Rekor: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b> baris</p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Nyebrang</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Tukang istirahat di pos. Kendaraan ikut berhenti.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🚚</div>
          <h2 style={h2}>KEGILAS!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <p style={p}>Baris terjauh: <b>{hud.score}</b> • Terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>
          <button style={primaryBtn} onClick={startGame}>Nyebrang Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e7f0e7' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#bbf7d0', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,16,10,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#2a3a24,#101a10)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}
