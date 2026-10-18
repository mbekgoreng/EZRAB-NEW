/**
 * EZRAB Game Space 2D — React canvas host hook (src/game-space/engine2d/useGameCanvas.ts)
 *
 * Gives every 2D game a ready-to-use canvas:
 *  - DPR-aware sizing + ResizeObserver (W/H in CSS pixels)
 *  - fixed-timestep Loop (update 60Hz, render every frame)
 *  - unified pointer+keyboard Input
 *  - Particles2D, Shake2D (auto-applied), FloatScores (auto-drawn)
 *  - prefers-reduced-motion flag (shake/particles already toned down)
 *  - sfx singleton
 *
 * Usage:
 *   const canvasRef = useGameCanvas((api) => {
 *     api.setUpdate((dt) => { ...mutate state...; api.pushHud({...}); });
 *     api.setRender(() => { const { ctx, W, H } = api; ...draw... });
 *     api.input.onDown = (p) => { ... };
 *     api.loop.start();
 *     return () => { /* optional extra cleanup *\/ };
 *   });
 *   return <canvas ref={canvasRef} className="..." />;
 *
 * pushHud: assign api.pushHud = setHud in setup; call it at most ~10x/sec
 * or on discrete events (score change, level change) — never every frame.
 */

import { useEffect, useRef } from 'react';
import { fitCanvas, withDpr } from './canvas';
import { Loop } from './loop';
import { Input } from './input';
import { Particles2D } from './particles';
import { Shake2D, FloatScores } from './juice2d';
import { sfx } from './audio';

export interface GameApi {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** CSS-pixel dimensions (updated on resize) */
  W: number;
  H: number;
  dpr: number;
  input: Input;
  loop: Loop;
  particles: Particles2D;
  shake: Shake2D;
  scores: FloatScores;
  sfx: typeof sfx;
  reducedMotion: boolean;
  setUpdate: (fn: (dt: number) => void) => void;
  setRender: (fn: () => void) => void;
  /** Subscribe to canvas resize (CSS px). */
  onResize: (cb: (w: number, h: number) => void) => void;
  /** Push React HUD state — assign in setup: api.pushHud = setHud */
  pushHud: (h: unknown) => void;
}

// React 19: useRef requires an initial value argument.
export function useGameCanvas(
  setup: (api: GameApi) => void | (() => void),
): React.RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const setupRef = useRef(setup);
  setupRef.current = setup;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion =
      typeof window.matchMedia !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let size = fitCanvas(canvas);
    const input = new Input(canvas);
    const particles = new Particles2D(reducedMotion);
    const shake = new Shake2D(reducedMotion);
    const scores = new FloatScores();
    const resizeCbs = new Set<(w: number, h: number) => void>();

    let updateFn: (dt: number) => void = () => {};
    let renderFn: () => void = () => {};
    let pushHud: (h: unknown) => void = () => {};

    const loop = new Loop(
      (dt) => {
        shake.update(dt);
        particles.update(dt);
        scores.update(dt);
        updateFn(dt);
      },
      () => {
        withDpr(ctx, size.dpr);
        ctx.clearRect(0, 0, size.w, size.h);
        ctx.save();
        if (shake.active) ctx.translate(shake.x, shake.y);
        renderFn();
        ctx.restore();
        particles.draw(ctx);
        scores.draw(ctx);
      },
    );

    const api: GameApi = {
      canvas,
      ctx,
      get W() {
        return size.w;
      },
      get H() {
        return size.h;
      },
      get dpr() {
        return size.dpr;
      },
      input,
      loop,
      particles,
      shake,
      scores,
      sfx,
      reducedMotion,
      setUpdate: (fn) => {
        updateFn = fn;
      },
      setRender: (fn) => {
        renderFn = fn;
      },
      onResize: (cb) => {
        resizeCbs.add(cb);
      },
      pushHud: (h: unknown) => pushHud(h),
    };
    // allow worker to replace pushHud: api.pushHud = setHud
    Object.defineProperty(api, 'pushHud', {
      configurable: true,
      get: () => pushHud,
      set: (fn: (h: unknown) => void) => {
        pushHud = fn;
      },
    });

    const ro = new ResizeObserver(() => {
      size = fitCanvas(canvas);
      resizeCbs.forEach((cb) => cb(size.w, size.h));
    });
    ro.observe(canvas);

    const cleanup = setupRef.current(api) as void | (() => void);

    return () => {
      ro.disconnect();
      if (typeof cleanup === 'function') cleanup();
      loop.dispose();
      input.dispose();
      particles.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return canvasRef;
}
