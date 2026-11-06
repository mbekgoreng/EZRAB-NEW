/**
 * ArcadePingPong ("Tenis Sendok Semen") — bet = sendok semen, bola = bola beton.
 * Pemain (kiri) vs AI "Tukang Beton" (kanan). AI adil: kecepatan dibatasi,
 * bidikan meleset acak. Best-of: pertama capai 7 poin menang.
 *
 * Grafis (Gelombang 1 rekonstruksi): SEMUA prosedural Canvas/SVG digambar
 * kode — bet sendok semen vektor, bola beton bergradasi + bayangan, helm &
 * penonton digambar bentuk, ikon overlay SVG. Tanpa emoji sebagai grafis
 * permainan dan tanpa aset raster (paling tajam pada ukuran main; preseden
 * glif prosedural pilot Sudoku). Sisa simbol di file hanya tombol
 * fungsional shell (jeda/suara/keluar).
 */
import React, { useRef, useState } from 'react';
import {
  useGameCanvas, type GameApi, TAU, clamp, sfx,
} from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  VW, VH, PADDLE_W, PADDLE_H, PLAYER_X, AI_X, WIN_SCORE,
  newMatch, placeServe, serve, step, aiMove, type PPState, type AISense,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('tenis-sendok-semen', 'wins');
const BK_RALLY = bestKey('tenis-sendok-semen', 'rally');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface S {
  st: PPState;
  sense: AISense;
  errT: number;
  targetPY: number;
  t: number;
  trail: Array<{ x: number; y: number; age: number }>;
  /** sisa detik kilau bet setelah memukul bola (umpan balik pantulan) */
  hitP: number;
  hitA: number;
  /** sisa detik kilat tepi meja setelah gol: siapa yang baru mencetak poin */
  flashScorer: 'p' | 'a' | null;
  flashT: number;
  /** sisa detik denyut angka skor setelah berubah */
  scoreT: number;
  /** rally kelipatan 5 terakhir yang sudah diumumkan (pop progresi) */
  milestone: number;
}

export default function ArcadePingPong({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ p: 0, a: 0, rally: 0, wins: getBest(BK, 0), bestRally: getBest(BK_RALLY, 0) });
  const [muted, setMuted] = useState(sfx.muted);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);
    // auto-pause saat tab disembunyikan (pola pilot Pak Mandor: api.onHidden)
    api.onHidden = () => {
      if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
    };
    const s: S = {
      st: newMatch(), sense: { err: 0 }, errT: 0, targetPY: VH / 2, t: 0, trail: [],
      hitP: 0, hitA: 0, flashScorer: null, flashT: 0, scoreT: 0, milestone: 0,
    };

    // skala: ruang virtual 800×480 → canvas
    const sc = (): number => Math.min(api.W / VW, api.H / VH);
    const ox = (): number => (api.W - VW * sc()) / 2;
    const oy = (): number => (api.H - VH * sc()) / 2;
    const X = (x: number): number => ox() + x * sc();
    const Y = (y: number): number => oy() + y * sc();
    const S2 = (v: number): number => v * sc();

    const push = (): void => {
      api.pushHud({ p: s.st.p, a: s.st.a, rally: s.st.rally, wins: getBest(BK, 0), bestRally: getBest(BK_RALLY, 0) });
    };

    const reset = (): void => {
      s.st = placeServe(newMatch(), 'p');
      s.sense = { err: 0 };
      s.errT = 0;
      s.targetPY = VH / 2;
      s.trail = [];
      s.t = 0;
      s.hitP = 0; s.hitA = 0;
      s.flashScorer = null; s.flashT = 0; s.scoreT = 0; s.milestone = 0;
      (s as { serveT?: number }).serveT = 0;
      push();
    };

    const endMatch = (): void => {
      s.st = { ...s.st, over: true };
      const win = s.st.winner === 'p';
      const wrap = wrapRef.current;
      if (win) {
        const nb = setBest(BK, getBest(BK, 0) + 1);
        setBest(BK_RALLY, 0); // rally best di-update per rally
        sfx.chime(3);
        if (wrap) popText(wrap, 'KAMU MENANG!', { size: 30, color: '#fde047' });
        api.particles.spawn(api.W / 2, api.H * 0.4, {
          count: 80, colors: ['#fde047', '#fbbf24', '#fff7d6', '#4ade80'],
          speed: [120, 420], life: [0.6, 1.2], size: [2, 6], gravity: 320, shape: 'rect', rotation: true,
        });
        void nb;
      } else {
        sfx.fail();
        if (wrap) popText(wrap, 'Tukang Beton menang...', { size: 24, color: '#fca5a5' });
      }
      window.setTimeout(() => {
        push();
        setScreen('over');
      }, 1400);
    };

    api.input.onMove = (p) => {
      if (screenRef.current !== 'play' || s.st.over) return;
      // peta balik dari canvas ke ruang virtual
      s.targetPY = clamp((p.y - oy()) / sc(), PADDLE_H / 2, VH - PADDLE_H / 2);
    };
    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play' || s.st.over) return;
      s.targetPY = clamp((p.y - oy()) / sc(), PADDLE_H / 2, VH - PADDLE_H / 2);
      if (s.st.serving === 'p') {
        s.st = serve(s.st);
        sfx.whoosh();
      }
    };
    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      s.t += dt;
      // peluruhan timer umpan balik visual
      s.hitP = Math.max(0, s.hitP - dt);
      s.hitA = Math.max(0, s.hitA - dt);
      s.flashT = Math.max(0, s.flashT - dt);
      s.scoreT = Math.max(0, s.scoreT - dt);
      if (screenRef.current !== 'play' || s.st.over) return;

      // AI: acak galat bidikan tiap ~0.45 dtk (adil)
      s.errT -= dt;
      if (s.errT <= 0) {
        s.errT = 0.45;
        s.sense.err = (Math.random() * 2 - 1) * 55;
      }

      // serve otomatis untuk AI
      if (s.st.serving === 'a' && s.t % 1 < dt) {
        // tunda sedikit biar dramatis
      }

      const aiY = aiMove(s.st, dt, s.sense);
      const res = step(s.st, s.targetPY, aiY, dt);
      const prevP = s.st.p;
      const prevA = s.st.a;
      const prevOver = s.st.over;
      s.st = res.state;
      for (const ev of res.events) {
        if (ev === 'pHit' || ev === 'aHit') {
          if (ev === 'pHit') s.hitP = 0.18; else s.hitA = 0.18;
          sfx.thud(0.5);
          setBest(BK_RALLY, s.st.rally);
          api.shake.add(0.25);
          for (let i = 0; i < 6; i += 1) {
            api.particles.spawn(X(s.st.ball.x), Y(s.st.ball.y), {
              count: 5, colors: ['#d6d3d1', '#a8a29e', '#fde047'],
              speed: [40, 160], life: [0.15, 0.4], size: [1.5, 3.5], gravity: 300, shape: 'circle',
            });
          }
        } else if (ev === 'wall') {
          sfx.click();
        } else if (ev === 'pScore' || ev === 'aScore') {
          if (ev === 'pScore') sfx.pop(1.2); else sfx.fail();
          s.flashScorer = ev === 'pScore' ? 'p' : 'a';
          s.flashT = 0.5;
          s.scoreT = 0.35;
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, ev === 'pScore' ? 'POIN!' : 'KEBOBOLAN', {
            size: 18, color: ev === 'pScore' ? '#4ade80' : '#fca5a5',
          });
        }
      }
      // progresi rally terasa: umumkan tiap kelipatan 5 (bola memang makin
      // cepat di logic: x1.045 per pantulan, plafon 760)
      if (s.st.rally >= 5 && s.st.rally % 5 === 0 && s.st.rally !== s.milestone) {
        s.milestone = s.st.rally;
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, `RALLY ${s.st.rally} — BOLA MAKIN CEPAT!`, { size: 16, color: '#fde047' });
      }
      if ((s.st.p !== prevP || s.st.a !== prevA) || s.st.over !== prevOver) push();
      if (s.st.over && !prevOver) { endMatch(); return; }

      // jejak bola
      if (!s.st.serving) {
        s.trail.push({ x: s.st.ball.x, y: s.st.ball.y, age: 0 });
        if (s.trail.length > 14) s.trail.shift();
      } else {
        s.trail = [];
      }
      for (const tr of s.trail) tr.age += dt;
      s.trail = s.trail.filter((tr) => tr.age < 0.22);

      // serve otomatis AI setelah jeda
      if (s.st.serving === 'a') {
        (s as { serveT?: number }).serveT = ((s as { serveT?: number }).serveT ?? 0) + dt;
        if ((s as { serveT?: number }).serveT! > 0.9) {
          (s as { serveT?: number }).serveT = 0;
          s.st = serve(s.st);
          sfx.whoosh();
        }
      } else {
        (s as { serveT?: number }).serveT = 0;
      }
    });

    // ---------- gambar ----------
    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#10243a');
      g.addColorStop(1, '#0a1526');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // garis meja beton (meja = area virtual)
      ctx.save();
      // meja
      const mg = ctx.createLinearGradient(0, Y(0), 0, Y(VH));
      mg.addColorStop(0, '#3f6212');
      mg.addColorStop(0.5, '#365314');
      mg.addColorStop(1, '#1a2e05');
      ctx.fillStyle = mg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(X(0), Y(0), S2(VW), S2(VH), 14);
      else ctx.rect(X(0), Y(0), S2(VW), S2(VH));
      ctx.fill();
      // garis tengah (net semen)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = Math.max(2, S2(4));
      ctx.setLineDash([S2(14), S2(10)]);
      ctx.beginPath();
      ctx.moveTo(X(VW / 2), Y(0));
      ctx.lineTo(X(VW / 2), Y(VH));
      ctx.stroke();
      ctx.setLineDash([]);
      // net: jaring kawat
      ctx.strokeStyle = 'rgba(200,200,200,0.35)';
      ctx.lineWidth = 1;
      for (let yy = Y(0); yy < Y(VH); yy += 8) {
        ctx.beginPath(); ctx.moveTo(X(VW / 2) - 3, yy); ctx.lineTo(X(VW / 2) + 3, yy); ctx.stroke();
      }
      // bingkai meja
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = Math.max(3, S2(6));
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(X(0), Y(0), S2(VW), S2(VH), 14);
      else ctx.rect(X(0), Y(0), S2(VW), S2(VH));
      ctx.stroke();
      ctx.restore();
      // penonton jauh: barisan helm proyek prosedural (kubah + brim + ridge)
      for (let i = 0; i < 8; i += 1) {
        const hx = X(40 + i * 100);
        const hy = Y(0) - Math.max(18, S2(30)) - (i % 2) * 6;
        const hr = Math.max(7, S2(11));
        ctx.save();
        ctx.translate(hx, hy);
        ctx.fillStyle = i % 3 === 0 ? '#f97316' : '#F5B301';
        ctx.beginPath(); ctx.arc(0, 0, hr, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillRect(-hr * 1.25, -1.5, hr * 2.5, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(-2, -hr, 4, hr);
        ctx.restore();
      }
      // sorot lampu arena
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = '#fef9c3';
      for (const fx of [0.25, 0.75]) {
        ctx.beginPath();
        ctx.moveTo(W * fx - 30, 0);
        ctx.lineTo(W * fx + 30, 0);
        ctx.lineTo(X(VW * fx) + 60, Y(VH / 2));
        ctx.lineTo(X(VW * fx) - 60, Y(VH / 2));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // spanduk arena (teks UI + belah ketupat digambar, tanpa simbol emoji)
      ctx.fillStyle = 'rgba(253,224,71,0.85)';
      ctx.font = `900 ${Math.max(11, S2(15))}px ${FONT}`;
      ctx.textAlign = 'center';
      const bannerY = Y(0) - Math.max(44, S2(58));
      if (bannerY > 76) {
        ctx.fillText('ARENA SENDOK SEMEN', W / 2, bannerY);
        const tw = ctx.measureText('ARENA SENDOK SEMEN').width;
        for (const sgn of [-1, 1]) {
          const dx = W / 2 + sgn * (tw / 2 + 16);
          ctx.save();
          ctx.translate(dx, bannerY - 5);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-4, -4, 8, 8);
          ctx.restore();
        }
      }
      // barisan tukang nonton di bawah: kepala + helm + bahu rompi prosedural
      const crowdY = Y(VH) + Math.max(52, S2(64));
      if (crowdY < H - 12) {
        const skins = ['#c68e5e', '#8d5a33', '#e0aa72', '#a06a3b'];
        for (let i = 0; i < 8; i += 1) {
          const bx = X(60 + i * 100);
          const bob = Math.sin(s.t * 2.4 + i * 1.3) * S2(4);
          const by = crowdY + bob;
          const hr = Math.max(9, S2(13));
          ctx.save();
          ctx.translate(bx, by);
          // bahu rompi keselamatan
          ctx.fillStyle = i % 2 ? '#2563EB' : '#F97316';
          ctx.beginPath(); ctx.arc(0, hr * 1.5, hr * 1.05, Math.PI, 0); ctx.closePath(); ctx.fill();
          // kepala
          ctx.fillStyle = skins[i % skins.length];
          ctx.beginPath(); ctx.arc(0, 0, hr * 0.78, 0, TAU); ctx.fill();
          // helm kuning helm (#F5B301 arah seni)
          ctx.fillStyle = '#F5B301';
          ctx.beginPath(); ctx.arc(0, -hr * 0.12, hr * 0.85, Math.PI, 0); ctx.closePath(); ctx.fill();
          ctx.fillRect(-hr * 1.05, -hr * 0.16, hr * 2.1, 3);
          ctx.restore();
        }
      }
    };

    /**
     * Sendok semen (trowel) sebagai bet — vektor Canvas prosedural:
     * daun baja segitiga khas sendok semen (lebar di pangkal, runcing di
     * ujung atas), leher menekuk, gagang kayu menjauhi lapangan, kilau
     * logam, noda semen. `flash` 0..1 = kilau sesaat sesudah memukul bola.
     */
    const drawSpoon = (ctx: CanvasRenderingContext2D, px: number, py: number, facing: 1 | -1, color: string, flash: number): void => {
      const w = S2(PADDLE_W);
      const h = S2(PADDLE_H);
      ctx.save();
      ctx.translate(X(px), Y(py));
      // kilau pantulan (umpan balik pukulan)
      if (flash > 0) {
        ctx.save();
        ctx.globalAlpha = flash / 0.18 * 0.55;
        ctx.fillStyle = '#fef9c3';
        ctx.beginPath(); ctx.arc(0, 0, h * 0.62, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      // daun sendok: pangkal lebar di bawah -> ujung runcing di atas
      const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      g.addColorStop(0, color);
      g.addColorStop(0.5, '#ffffff');
      g.addColorStop(1, '#8a8a8a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -h / 2); // ujung runcing
      ctx.lineTo(w / 2, -h / 2 + S2(16));
      ctx.lineTo(w / 2, h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.lineTo(-w / 2, -h / 2 + S2(16));
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(30,30,30,0.55)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // tulang tengah daun (ridge) dari ujung ke pangkal
      ctx.strokeStyle = 'rgba(70,70,70,0.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -h / 2 + 3); ctx.lineTo(0, h / 2 - 3); ctx.stroke();
      // leher + gagang kayu: menjauhi lapangan (pemain kiri -> gagang ke kiri)
      const hx0 = facing * (w / 2);
      const hg = ctx.createLinearGradient(hx0, 0, hx0 + facing * S2(36), 0);
      hg.addColorStop(0, '#9a3412');
      hg.addColorStop(1, '#431407');
      ctx.fillStyle = '#57534e'; // leher baja
      ctx.fillRect(Math.min(0, hx0), -S2(3), Math.abs(hx0), S2(6));
      ctx.fillStyle = hg;
      const gx = facing === 1 ? w / 2 : -w / 2 - S2(36);
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(gx, -S2(8), S2(36), S2(16), S2(7));
      else ctx.rect(gx, -S2(8), S2(36), S2(16));
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; // paku gagang
      ctx.beginPath(); ctx.arc(gx + S2(36) / 2, 0, S2(2), 0, TAU); ctx.fill();
      // kilau logam
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(-w * 0.16, -h / 4, w * 0.16, h * 0.1, -0.5, 0, TAU);
      ctx.fill();
      // noda semen
      ctx.fillStyle = 'rgba(160,160,150,0.5)';
      ctx.beginPath(); ctx.arc(w * 0.1, h * 0.25, S2(7), 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(-w * 0.18, h * 0.38, S2(4.5), 0, TAU); ctx.fill();
      ctx.restore();
    };

    const drawBall = (ctx: CanvasRenderingContext2D): void => {
      const b = s.st.ball;
      // jejak
      for (const tr of s.trail) {
        const a = 1 - tr.age / 0.22;
        ctx.fillStyle = `rgba(180,170,160,${(a * 0.35).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(X(tr.x), Y(tr.y), S2(8) * a, 0, TAU); ctx.fill();
      }
      // bayangan kontak di atas meja (cahaya kiri-atas -> bayangan kanan-bawah)
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath(); ctx.ellipse(X(b.x) + S2(7), Y(b.y) + S2(10), S2(10), S2(4.5), 0, 0, TAU); ctx.fill();
      ctx.restore();
      // garis kecepatan saat bola kencang (progresi rally terbaca)
      const spd = Math.hypot(b.vx, b.vy);
      if (!s.st.serving && spd > 470) {
        const ux = b.vx / spd; const uy = b.vy / spd;
        ctx.save();
        ctx.strokeStyle = 'rgba(254,249,195,0.5)';
        ctx.lineWidth = 2;
        for (const off of [-6, 0, 6]) {
          ctx.beginPath();
          ctx.moveTo(X(b.x) - ux * S2(14) - uy * off, Y(b.y) - uy * S2(14) + ux * off);
          ctx.lineTo(X(b.x) - ux * S2(30) - uy * off, Y(b.y) - uy * S2(30) + ux * off);
          ctx.stroke();
        }
        ctx.restore();
      }
      const r = S2(9);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 8;
      const g = ctx.createRadialGradient(X(b.x) - 3, Y(b.y) - 3, 1, X(b.x), Y(b.y), r);
      g.addColorStop(0, '#e7e5e4');
      g.addColorStop(0.55, '#a8a29e');
      g.addColorStop(1, '#44403c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(X(b.x), Y(b.y), r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(60,55,50,0.55)';
      ctx.beginPath(); ctx.arc(X(b.x) - 2, Y(b.y) + 3, S2(2.4), 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(X(b.x) + 4, Y(b.y) - 2, S2(1.8), 0, TAU); ctx.fill();
      ctx.restore();
    };

    /** Api rally prosedural: dua lidah bezier oranye/kuning. */
    const drawFlame = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#F97316';
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.85, -r * 0.1, r * 0.6, r * 0.75, 0, r * 0.9);
      ctx.bezierCurveTo(-r * 0.6, r * 0.75, -r * 0.85, -r * 0.1, 0, -r);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.35);
      ctx.bezierCurveTo(r * 0.45, r * 0.15, r * 0.3, r * 0.6, 0, r * 0.72);
      ctx.bezierCurveTo(-r * 0.3, r * 0.6, -r * 0.45, r * 0.15, 0, -r * 0.35);
      ctx.fill();
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      drawBackground(ctx, W, H);
      // kilat tepi meja sesudah gol: hijau di tepi kanan (kamu mencetak),
      // merah di tepi kiri (kebobolan) — sisi = arah bola keluar
      if (s.flashT > 0 && s.flashScorer) {
        const a = (s.flashT / 0.5) * 0.4;
        const fx = s.flashScorer === 'p' ? X(VW) : X(0);
        const fg = ctx.createLinearGradient(fx, 0, fx + (s.flashScorer === 'p' ? -1 : 1) * S2(90), 0);
        fg.addColorStop(0, s.flashScorer === 'p' ? `rgba(74,222,128,${a.toFixed(2)})` : `rgba(248,113,113,${a.toFixed(2)})`);
        fg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(Math.min(fx, fx + (s.flashScorer === 'p' ? -1 : 1) * S2(90)), Y(0), S2(90), S2(VH));
      }
      drawSpoon(ctx, PLAYER_X + PADDLE_W / 2, s.st.pY, -1, '#cbd5e1', s.hitP);
      drawSpoon(ctx, AI_X + PADDLE_W / 2, s.st.aY, 1, '#fbbf24', s.hitA);
      // label pemain: teks + penanda warna (biru EZRAB vs emas lawan)
      ctx.font = `800 ${Math.max(11, S2(16))}px ${FONT}`;
      ctx.fillStyle = '#2563EB';
      ctx.fillRect(X(PLAYER_X + 6), Y(VH) + Math.max(8, S2(14)), S2(10), S2(10));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.textAlign = 'left';
      ctx.fillText('KAMU', X(PLAYER_X + 22), Y(VH) + Math.max(16, S2(26)));
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(X(VW - 66), Y(VH) + Math.max(8, S2(14)), S2(10), S2(10));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.textAlign = 'right';
      ctx.fillText('TUKANG BETON', X(VW - 8), Y(VH) + Math.max(16, S2(26)));
      ctx.textAlign = 'center';
      if (s.st.serving === 'p' && screenRef.current === 'play' && !s.st.over) {
        // petunjuk serve: pil berdenyut + segitiga penunjuk ke bola
        const pulse = 0.72 + Math.sin(s.t * 5) * 0.28;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = 'rgba(8,14,26,0.72)';
        const label = 'KETUK UNTUK SERVE';
        ctx.font = `800 ${Math.max(12, S2(18))}px ${FONT}`;
        const tw = ctx.measureText(label).width;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(X(VW / 2) - tw / 2 - 14, Y(VH / 2) - S2(64), tw + 28, S2(34), 10);
        else ctx.rect(X(VW / 2) - tw / 2 - 14, Y(VH / 2) - S2(64), tw + 28, S2(34));
        ctx.fill();
        ctx.fillStyle = '#fde047';
        ctx.textAlign = 'center';
        ctx.fillText(label, X(VW / 2), Y(VH / 2) - S2(41));
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.moveTo(X(s.st.ball.x) - 7, Y(s.st.ball.y) - S2(30) + Math.sin(s.t * 5) * 3);
        ctx.lineTo(X(s.st.ball.x) + 7, Y(s.st.ball.y) - S2(30) + Math.sin(s.t * 5) * 3);
        ctx.lineTo(X(s.st.ball.x), Y(s.st.ball.y) - S2(18) + Math.sin(s.t * 5) * 3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      drawBall(ctx);
      // skor besar (berdenyut sesaat setelah berubah)
      const pulseS = 1 + (s.scoreT / 0.35) * 0.22;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `900 ${Math.max(28, S2(52) * pulseS)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${s.st.p} : ${s.st.a}`, X(VW / 2), Y(0) + Math.max(30, S2(56)));
      // rally + meter kecepatan bola (plafon logic 760) — progresi terbaca
      if (s.st.rally >= 2) {
        const spd = Math.hypot(s.st.ball.vx, s.st.ball.vy);
        const cy = Y(VH) - Math.max(14, S2(22));
        ctx.font = `800 ${Math.max(11, S2(17))}px ${FONT}`;
        const label = `RALLY x${s.st.rally}`;
        const tw = ctx.measureText(label).width;
        drawFlame(ctx, X(VW / 2) - tw / 2 - S2(14), cy - S2(6), S2(9));
        ctx.fillStyle = '#fde047';
        ctx.textAlign = 'center';
        ctx.fillText(label, X(VW / 2), cy);
        if (!s.st.serving) {
          const bw = S2(120);
          const bx = X(VW / 2) - bw / 2;
          const by = cy + S2(7);
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(bx, by, bw, 4);
          ctx.fillStyle = spd > 620 ? '#f87171' : spd > 470 ? '#fb923c' : '#4ade80';
          ctx.fillRect(bx, by, bw * Math.min(1, spd / 760), 4);
        }
      }
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(4,8,16,0.5)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    // PERBAIKAN LOOP: reset sungguhan untuk tombol Mulai/Tanding Lagi.
    // Sebelumnya startGame memanggil __reset yang tidak pernah dipasang,
    // sehingga setelah game-over tombol Tanding Lagi tidak mereset state
    // (st.over tetap true) dan permainan macet.
    (api as unknown as { __reset: () => void }).__reset = reset;
    reset();
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (): void => {
    const api = apiRef.current;
    sfx.ensure();
    (api as unknown as { __reset?: () => void } | null)?.__reset?.();
    setScreen('play');
  };
  const togglePause = (): void => {
    const api = apiRef.current;
    if (!api) return;
    sfx.ensure();
    if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
    else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
  };
  const toggleMute = (): void => {
    sfx.ensure();
    sfx.toggleMute();
    setMuted(sfx.muted);
  };

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(8,14,26,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#10243a', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(8,14,26,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>{hud.p} : {hud.a}</div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9 }}>
            Menang {hud.wins}x{hud.bestRally > 0 && <span> • Rally terbaik {hud.bestRally}</span>}
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

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}><TrowelIcon size={46} /></div>
          <h2 style={h2}>TENIS SENDOK SEMEN</h2>
          <p style={p}>
            Bet-mu <b>sendok semen</b>, bolanya <b>bola beton</b>! <b>Geser jari / mouse</b>
            untuk menggerakkan sendok, ketuk untuk <b>serve</b>. Lawanmu <b>Tukang Beton</b> —
            cepat tapi bisa dikalahkan. Pertama capai <b>{WIN_SCORE} poin</b> menang!
          </p>
          {hud.wins > 0 && <p style={p}>Kemenangan: <b style={{ color: '#fde047' }}>{hud.wins}x</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Bertanding</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}><CoffeeIcon size={44} /></div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Semennya jangan sampai kering.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}>{hud.p >= WIN_SCORE ? <TrophyIcon size={46} /> : <TrowelIcon size={46} />}</div>
          <h2 style={h2}>{hud.p >= WIN_SCORE ? 'KAMU MENANG!' : 'KALAH TIPIS!'}</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.p} : {hud.a}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Kemenangan" value={`${hud.wins}x`} />
            <Stat label="Rally max" value={`${hud.bestRally}`} />
          </div>
          <button style={primaryBtn} onClick={startGame}>Tanding Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e0e7ff' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#fde047', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,10,22,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#1d3350,#0a1526)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Ikon overlay prosedural (SVG digambar kode — BUKAN emoji, BUKAN hasil
 * generate; pola yang sama dengan MaterialGlyph pilot Sudoku).
 */
function TrowelIcon({ size = 44 }: { size?: number }): React.JSX.Element {
  const s = { width: size, height: size, display: 'block' } as React.CSSProperties;
  return (
    <svg style={s} viewBox="0 0 48 48" aria-label="Sendok semen">
      <polygon points="10,38 10,16 16,8 24,4 24,30 17,38" fill="#cbd5e1" stroke="#64748b" strokeWidth="2" />
      <line x1="17" y1="10" x2="17" y2="36" stroke="#94a3b8" strokeWidth="1.6" />
      <rect x="22" y="28" width="7" height="4" fill="#57534e" />
      <rect x="28" y="26" width="15" height="8" rx="4" fill="#9a3412" stroke="#431407" strokeWidth="1.6" />
      <circle cx="35" cy="30" r="1.6" fill="#431407" />
    </svg>
  );
}

function TrophyIcon({ size = 44 }: { size?: number }): React.JSX.Element {
  const s = { width: size, height: size, display: 'block' } as React.CSSProperties;
  return (
    <svg style={s} viewBox="0 0 48 48" aria-label="Piala">
      <path d="M14 6 h20 v10 a10 10 0 0 1 -20 0 Z" fill="#fbbf24" stroke="#b45309" strokeWidth="2" />
      <path d="M14 9 C7 9 6 17 14 19 M34 9 c7 0 8 8 0 10" fill="none" stroke="#b45309" strokeWidth="2.4" />
      <rect x="21" y="25" width="6" height="7" fill="#b45309" />
      <rect x="15" y="32" width="18" height="5" rx="2" fill="#92400e" />
      <rect x="17" y="40" width="14" height="3" rx="1.5" fill="#78350f" />
    </svg>
  );
}

function CoffeeIcon({ size = 44 }: { size?: number }): React.JSX.Element {
  const s = { width: size, height: size, display: 'block' } as React.CSSProperties;
  return (
    <svg style={s} viewBox="0 0 48 48" aria-label="Kopi">
      <path d="M17 6 c-2 3 2 4 0 7 M25 6 c-2 3 2 4 0 7" fill="none" stroke="#a8a29e" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 18 h24 v10 a8 8 0 0 1 -8 8 h-8 a8 8 0 0 1 -8 -8 Z" fill="#e7e5e4" stroke="#78716c" strokeWidth="2" />
      <path d="M34 21 c5 -1 7 2 6 5 c-1 3 -4 4 -7 3" fill="none" stroke="#78716c" strokeWidth="2.2" />
      <ellipse cx="22" cy="19" rx="11" ry="2" fill="#78350f" />
      <rect x="8" y="40" width="30" height="3" rx="1.5" fill="#a8a29e" />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 14px' }}>
      <div style={{ fontSize: 11, opacity: 0.7, color: '#e0e7ff' }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>{value}</div>
    </div>
  );
}
