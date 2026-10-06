import { useEffect, useRef } from 'react';
import {
  LEFT_EYE_CX,
  LEFT_EYE_CY,
  RIGHT_EYE_CX,
  RIGHT_EYE_CY,
  MASCOT_CX,
  MASCOT_CY,
  MAX_EYE_OFFSET_X,
  MAX_EYE_OFFSET_Y,
} from './mascot.constants';
import { MascotState } from './mascot.types';

interface UseEyeTrackingOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  leftEyeRef: React.RefObject<SVGGElement | null>;
  rightEyeRef: React.RefObject<SVGGElement | null>;
  headGroupRef: React.RefObject<SVGGElement | null>;
  state: MascotState;
  isBlinking: boolean;
  enableEyeTracking?: boolean;
  enable3DTilt?: boolean;
}

export function useEyeTracking({
  containerRef,
  leftEyeRef,
  rightEyeRef,
  headGroupRef,
  state,
  isBlinking,
  enableEyeTracking = true,
  enable3DTilt = true,
}: UseEyeTrackingOptions) {
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const eyeCoordsRef = useRef({
    currX: 0,
    currY: 0,
    targetX: 0,
    targetY: 0,
  });
  const rafIdRef = useRef<number | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActiveTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || !enableEyeTracking) return;

    // 1. Pointer Tracking (Desktop & Coarse Pointer)
    const handlePointerMove = (e: PointerEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
      lastActiveTimeRef.current = Date.now();
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    // 2. Autonomous Idle Glance (When cursor is still for >3.5s or on mobile)
    const triggerIdleGlance = () => {
      const now = Date.now();
      if (now - lastActiveTimeRef.current > 3200 && state === 'idle' || state === 'normal') {
        const glanceDirections = [
          { x: 0, y: 0 },
          { x: -160, y: 0 },
          { x: 160, y: 0 },
          { x: 0, y: -120 },
          { x: 0, y: 0 },
        ];
        const next = glanceDirections[Math.floor(Math.random() * glanceDirections.length)];
        eyeCoordsRef.current.targetX = next.x;
        eyeCoordsRef.current.targetY = next.y;
      }
      idleTimerRef.current = setTimeout(triggerIdleGlance, 2800 + Math.random() * 2600);
    };

    idleTimerRef.current = setTimeout(triggerIdleGlance, 3000);

    // 3. 60fps Animation Loop with Spring Physics
    const animate = () => {
      if (containerRef.current) {
        let targetX = 0;
        let targetY = 0;

        // Expression-specific target adjustments
        if (state === 'thinking') {
          targetX = 180;
          targetY = -190;
        } else if (state === 'reading') {
          targetX = 30;
          targetY = 170;
        } else if (state === 'curious') {
          targetX = 120;
          targetY = -80;
        } else if (state === 'sleepy') {
          targetX = 0;
          targetY = 120;
        } else if (state === 'mata_lurus') {
          targetX = 0;
          targetY = 0;
        } else if (state === 'processing') {
          const t = performance.now() * 0.0035;
          targetX = Math.sin(t) * 190;
          targetY = Math.cos(t * 0.5) * 50;
        } else if (state === 'happy' || state === 'success') {
          targetX = 0;
          targetY = -60;
        } else if (mousePosRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          const dx = mousePosRef.current.x - centerX;
          const dy = mousePosRef.current.y - centerY;
          const dist = Math.hypot(dx, dy);

          if (dist > 0) {
            // Distance attenuation: when cursor is far (>750px), decay back forward
            const maxTrackDist = 750;
            const factor = Math.max(0, 1 - dist / maxTrackDist);
            const intensity = Math.min(1, Math.pow(factor, 0.65));

            const angle = Math.atan2(dy, dx);
            targetX = Math.cos(angle) * MAX_EYE_OFFSET_X * intensity;
            targetY = Math.sin(angle) * MAX_EYE_OFFSET_Y * intensity;
          }
        }

        // Spring smoothing (lerp factor 0.12 with follow-through)
        const eye = eyeCoordsRef.current;
        eye.currX += (targetX - eye.currX) * 0.12;
        eye.currY += (targetY - eye.currY) * 0.12;

        // Pure eye tracking translation without blinking or distortion
        if (leftEyeRef.current) {
          leftEyeRef.current.setAttribute(
            'transform',
            `translate(${LEFT_EYE_CX}, ${LEFT_EYE_CY}) ` +
            `translate(${eye.currX}, ${eye.currY}) ` +
            `translate(${-LEFT_EYE_CX}, ${-LEFT_EYE_CY})`
          );
        }

        if (rightEyeRef.current) {
          rightEyeRef.current.setAttribute(
            'transform',
            `translate(${RIGHT_EYE_CX}, ${RIGHT_EYE_CY}) ` +
            `translate(${eye.currX}, ${eye.currY}) ` +
            `translate(${-RIGHT_EYE_CX}, ${-RIGHT_EYE_CY})`
          );
        }

        // 3D Micro-Parallax on Head Group
        if (headGroupRef.current && enable3DTilt) {
          const headShiftX = eye.currX * 0.12;
          const headShiftY = eye.currY * 0.12;
          const headRot = state === 'thinking' ? -3.5 : state === 'curious' ? 3.0 : eye.currX * 0.015;
          headGroupRef.current.setAttribute(
            'transform',
            `translate(${MASCOT_CX}, ${MASCOT_CY}) ` +
            `translate(${headShiftX}, ${headShiftY}) ` +
            `rotate(${headRot}) ` +
            `translate(${-MASCOT_CX}, ${-MASCOT_CY})`
          );
        }
      }

      rafIdRef.current = requestAnimationFrame(animate);
    };

    rafIdRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [enableEyeTracking, enable3DTilt, state, isBlinking]);

  return { eyeCoordsRef };
}
