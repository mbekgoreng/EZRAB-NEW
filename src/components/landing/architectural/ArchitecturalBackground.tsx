import React, { useEffect, useRef } from 'react';
import { ArchitecturalScene } from './buildingScene';
import './architectural-background.css';

interface ArchitecturalBackgroundProps {
  /** 0..5 — demo scene index driving the ambience response */
  mode: number;
}

/**
 * Layer A — architectural ambience (Three.js).
 * Continuous cinematic environment: drawing blueprint, assembling wireframe
 * tower, flowing light, particles, slow camera. Pauses offscreen / hidden tab.
 * Respects prefers-reduced-motion (single static frame) and WebGL failure
 * (gradient fallback). Purely visual — no technical-integration claims.
 */
export const ArchitecturalBackground: React.FC<ArchitecturalBackgroundProps> = ({ mode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ArchitecturalScene | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const small = Math.min(window.innerWidth, window.innerHeight) < 640;

    let scene: ArchitecturalScene | null = null;
    try {
      scene = new ArchitecturalScene(canvas, { detail: coarse || small ? 'low' : 'high' });
    } catch {
      wrap.classList.add('arch-bg--fallback');
      return;
    }
    sceneRef.current = scene;

    const fit = () => {
      const r = wrap.getBoundingClientRect();
      scene?.resize(Math.max(2, r.width), Math.max(2, r.height));
    };
    fit();

    if (reduced) {
      scene.renderStatic();
    } else {
      scene.start();
    }

    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    // Pause when the hero scrolls out of view or the tab hides.
    let visible = true;
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        if (!reduced) scene?.setPaused(!visible || document.hidden);
      },
      { threshold: 0.02 }
    );
    io.observe(wrap);
    const onVis = () => {
      if (!reduced) scene?.setPaused(!visible || document.hidden);
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      io.disconnect();
      ro.disconnect();
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Drive the ambience from the product demo (Layer B).
  useEffect(() => {
    sceneRef.current?.setMode(mode);
  }, [mode]);

  return (
    <div ref={wrapRef} className="arch-bg" aria-hidden="true">
      <canvas ref={canvasRef} className="arch-bg-canvas" />
      {/* Contrast veil: keeps the dashboard + copy readable over the motion */}
      <div className="arch-bg-veil" />
    </div>
  );
};

export default ArchitecturalBackground;
