import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import './cinematic-hero.css';
import { useSceneMachine, type SceneDef } from './sceneMachine';
import {
  SceneAiEstimate,
  SceneAhspRab,
  SceneDedDokumen,
  SceneLaporanKurvaS,
  SceneProjectIntelligence,
  SceneQtoVolume,
} from './scenes';

const SCENES: SceneDef[] = [
  { id: 'project-intelligence', label: 'Proyek', durationMs: 3500 },
  { id: 'ai-estimate', label: 'AI Estimate', durationMs: 4000 },
  { id: 'ded-dokumen', label: 'AI Dokumen', durationMs: 3500 },
  { id: 'qto-volume', label: 'QTO Volume', durationMs: 3500 },
  { id: 'ahsp-rab', label: 'AHSP & RAB', durationMs: 4000 },
  { id: 'laporan-kurva-s', label: 'Kurva S', durationMs: 3500 },
];

const SceneComponents = [
  SceneProjectIntelligence,
  SceneAiEstimate,
  SceneDedDokumen,
  SceneQtoVolume,
  SceneAhspRab,
  SceneLaporanKurvaS,
] as const;

const TRANSITION_MS = 450;

/**
 * Foreground product stage: a realistically framed dashboard demo driven by
 * the rAF scene machine. No backend calls — every figure is demo data.
 *
 * `flat` renders without the 3D perspective tilt (for the classic hero).
 */
export const ProductStage: React.FC<{ flat?: boolean; onSceneChange?: (index: number) => void }> = memo(
  ({ flat = false, onSceneChange }) => {
  const scenes = useMemo(() => SCENES, []);
  const { sceneIndex, sceneProgress, elapsed, playing, reducedMotion, totalMs, play, pause, goTo } =
    useSceneMachine(scenes, true);

  const prevIndex = (sceneIndex + scenes.length - 1) % scenes.length;
  const inTransition = sceneProgress * scenes[sceneIndex].durationMs < TRANSITION_MS;

  const ActiveScene = SceneComponents[sceneIndex];
  const PrevScene = SceneComponents[prevIndex];

  // Report the active demo scene so the architectural background (Layer A)
  // can respond visually. Purely visual — no technical-integration claim.
  useEffect(() => {
    onSceneChange?.(sceneIndex);
  }, [sceneIndex, onSceneChange]);

  /* Pan vertikal khusus HP (<=639px, breakpoint yang sama dengan CSS
     mobile hero): layar demo hanya menampilkan ~121px isi, sementara isi
     scene setinggi 254–843px, jadi tanpa ini 52–86% isi tiap scene
     terpotong permanen. Konten digeser mengikuti progres scene — bagian
     yang di-reveal oleh animasi fade scene memang berurutan atas ke
     bawah, jadi geseran ini sejalan dengan urutan tampilnya. Desktop
     dan reduced-motion tidak disentuh. */
  const stageRef = useRef<HTMLDivElement>(null);
  const [panVersion, setPanVersion] = useState(0);
  useEffect(() => {
    const onResize = () => setPanVersion((v) => v + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    const layers = root.querySelectorAll('.ch-scene-layer');
    const layer = layers[layers.length - 1];
    const box = layer?.querySelector('.ch-dash-content');
    const inner = layer?.querySelector<HTMLElement>('.ch-dash-scroll');
    if (!box || !inner) return;
    const mobile = window.matchMedia('(max-width: 639px)').matches;
    if (!mobile || reducedMotion) {
      inner.style.transform = '';
      return;
    }
    const cs = window.getComputedStyle(box);
    const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const overflow = Math.max(0, inner.scrollHeight - (box.clientHeight - padV));
    // Beri jeda di awal (atas terbaca dulu) dan pastikan dasar tercapai
    // sedikit sebelum scene berganti.
    const t = Math.min(1, Math.max(0, (sceneProgress - 0.04) / 0.92));
    inner.style.transform = overflow > 0 ? `translateY(${(-overflow * t).toFixed(1)}px)` : '';
  }, [sceneIndex, sceneProgress, reducedMotion, panVersion]);

  return (
    <div className="ch-stage" ref={stageRef}>
      {/* Cahaya gradasi di belakang frame: dekorasi murni, bukan bagian demo.
          Dua lapis: aura putih pudar paling luar + wash warna di tengah. */}
      <div className="ch-stage-glow-white" aria-hidden="true" />
      <div className="ch-stage-glow" aria-hidden="true" />
      <div className={`ch-stage-frame${flat ? ' ch-stage-frame--flat' : ''}`}>
        <div className="ch-stage-screen">
          {/* Crossfade: previous scene fades out beneath the incoming one. */}
          {!reducedMotion && inTransition && (
            <div className="ch-scene-layer ch-scene-layer--prev" aria-hidden="true">
              <PrevScene progress={1} reduced={false} />
            </div>
          )}
          <div className="ch-scene-layer" key={scenes[sceneIndex].id}>
            <ActiveScene progress={sceneProgress} reduced={reducedMotion} />
          </div>
          {/* Scene label chip */}
          <div className="ch-scene-chip" aria-live="polite">
            <span className="ch-scene-chip-dot" aria-hidden="true" />
            {scenes[sceneIndex].label}
          </div>
        </div>
        {/* Controls */}
        <div className="ch-stage-controls">
          <button
            type="button"
            className="ch-play-btn"
            onClick={() => (playing ? pause() : play())}
            aria-label={playing ? 'Jeda demo' : 'Putar demo'}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <div className="ch-dots" role="tablist" aria-label="Pilih scene demo">
            {scenes.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === sceneIndex}
                aria-label={`Scene ${i + 1}: ${s.label}`}
                className={`ch-dot${i === sceneIndex ? ' is-active' : ''}`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
          <div className="ch-progress" aria-hidden="true">
            <span style={{ width: `${totalMs > 0 ? (elapsed / totalMs) * 100 : 0}%` }} />
          </div>
        </div>
      </div>
      <p className="ch-honest-caption ch-honest-caption--stage">
        Animasi demonstrasi — bukan rekaman aplikasi langsung. Semua angka adalah data demonstrasi.
      </p>
    </div>
  );
});

ProductStage.displayName = 'ProductStage';
