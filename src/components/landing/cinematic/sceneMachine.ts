import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface SceneDef {
  /** Stable scene id, e.g. 'project-intelligence' */
  id: string;
  /** Short label shown on the stage controls */
  label: string;
  /** Duration of this scene in milliseconds */
  durationMs: number;
}

export interface SceneMachineState {
  sceneIndex: number;
  /** 0..1 progress inside the current scene */
  sceneProgress: number;
  /** total elapsed ms since cycle start (modulo total) */
  elapsed: number;
  playing: boolean;
  reducedMotion: boolean;
  totalMs: number;
}

export interface SceneMachineApi extends SceneMachineState {
  play: () => void;
  pause: () => void;
  goTo: (index: number) => void;
}

/**
 * rAF-driven demo scene sequencer. Time only advances while `playing` is true
 * and the tab is visible, so there are no overlapping setTimeout chains that
 * break when the tab is backgrounded.
 */
export function useSceneMachine(scenes: SceneDef[], autoStart = true): SceneMachineApi {
  const [playing, setPlaying] = useState(autoStart);
  const [elapsed, setElapsed] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const elapsedRef = useRef(0);
  const playingRef = useRef(autoStart);
  const hiddenRef = useRef(false);

  const totalMs = useMemo(
    () => scenes.reduce((sum, s) => sum + s.durationMs, 0),
    [scenes],
  );

  // Detect prefers-reduced-motion: never auto-play the cinematic loop,
  // render scenes statically and allow manual navigation.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      setReducedMotion(mq.matches);
      if (mq.matches) {
        playingRef.current = false;
        setPlaying(false);
      }
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Pause automatically when the tab is hidden.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => {
      hiddenRef.current = document.hidden;
      lastRef.current = performance.now();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    playingRef.current = playing;
    lastRef.current = performance.now();
  }, [playing]);

  useEffect(() => {
    const tick = (now: number) => {
      const dt = now - lastRef.current;
      lastRef.current = now;
      if (playingRef.current && !hiddenRef.current && dt > 0 && dt < 5000) {
        elapsedRef.current = (elapsedRef.current + dt) % (totalMs || 1);
        setElapsed(elapsedRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalMs]);

  const play = useCallback(() => {
    if (hiddenRef.current) return;
    playingRef.current = true;
    setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(scenes.length - 1, index));
      let offset = 0;
      for (let i = 0; i < clamped; i += 1) offset += scenes[i].durationMs;
      elapsedRef.current = offset;
      setElapsed(offset);
    },
    [scenes],
  );

  // Resolve current scene + progress from elapsed time.
  let acc = 0;
  let sceneIndex = 0;
  let sceneProgress = 0;
  for (let i = 0; i < scenes.length; i += 1) {
    const d = scenes[i].durationMs;
    if (elapsed < acc + d || i === scenes.length - 1) {
      sceneIndex = i;
      sceneProgress = d > 0 ? Math.min(1, Math.max(0, (elapsed - acc) / d)) : 0;
      break;
    }
    acc += d;
  }

  return { sceneIndex, sceneProgress, elapsed, playing, reducedMotion, totalMs, play, pause, goTo };
}
