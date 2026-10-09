import React, { memo, useMemo } from 'react';
import { Pause, Play } from 'lucide-react';
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
 */
export const ProductStage: React.FC = memo(() => {
  const scenes = useMemo(() => SCENES, []);
  const { sceneIndex, sceneProgress, elapsed, playing, reducedMotion, totalMs, play, pause, goTo } =
    useSceneMachine(scenes, true);

  const prevIndex = (sceneIndex + scenes.length - 1) % scenes.length;
  const inTransition = sceneProgress * scenes[sceneIndex].durationMs < TRANSITION_MS;

  const ActiveScene = SceneComponents[sceneIndex];
  const PrevScene = SceneComponents[prevIndex];

  return (
    <div className="ch-stage">
      <div className="ch-stage-frame">
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
