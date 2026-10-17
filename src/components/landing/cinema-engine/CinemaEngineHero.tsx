/**
 * CinemaEngineHero — Phase 1 technical prototype (ISOLATED).
 *
 * Master prompt "EZRAB CINEMATIC 3D EXPERIENCE ENGINE", Phase 1:
 * satu scene hero 3D yang terisolasi, membuktikan pola integrasi
 * (lifecycle, lazy-mount, reduced-motion, WebGL fallback, pause saat
 * tidak terlihat, dispose bersih) sebelum dipakai di landing.
 *
 * Keputusan desain (diaudit Phase 0):
 * - Memakai ulang ArchitecturalScene (buildingScene.ts) — Layer A yang
 *   sudah disetujui user (blueprint → wireframe → solid, loop 32 dtk).
 *   Tidak ada bahasa visual baru yang dikarang di fase ini.
 * - three.js mentah via komponen terisolasi (pola yang sudah dipakai
 *   codebase); tanpa menambah dependency baru.
 * - TIDAK menampilkan angka/volume/harga apa pun — murni ambience
 *   visual, jadi tidak ada risiko data karangan.
 * - Kill switch: CINEMA_ENGINE_ENABLED = false menonaktifkan total.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ArchitecturalScene } from '../architectural/buildingScene';

/** Kill switch — set false untuk menonaktifkan prototipe sepenuhnya. */
export const CINEMA_ENGINE_ENABLED = true;

/** Route preview terisolasi (tidak menyentuh route landing/app yang ada). */
export const CINEMA_ENGINE_PREVIEW_PATH = '/preview/cinema-engine';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function pickDetail(): 'high' | 'low' {
  if (typeof window === 'undefined') return 'high';
  const narrow = window.innerWidth < 640;
  const weakCpu =
    typeof navigator !== 'undefined' &&
    typeof navigator.hardwareConcurrency === 'number' &&
    navigator.hardwareConcurrency <= 4;
  return narrow || weakCpu ? 'low' : 'high';
}

type SceneStatus = 'idle' | 'loading' | 'ready' | 'static';

export const CinemaEngineHero: React.FC = () => {
  const hostRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<ArchitecturalScene | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [status, setStatus] = useState<SceneStatus>('idle');

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    // Kill switch / reduced motion / no WebGL → poster statis, tanpa scene.
    if (!CINEMA_ENGINE_ENABLED || reducedMotion || !isWebGLAvailable()) {
      setStatus('static');
      return;
    }

    let disposed = false;
    let io: IntersectionObserver | null = null;
    let ro: ResizeObserver | null = null;

    const mountScene = () => {
      if (disposed || sceneRef.current || !canvasRef.current) return;
      setStatus('loading');
      try {
        const scene = new ArchitecturalScene(canvasRef.current, { detail: pickDetail() });
        if (disposed) {
          scene.dispose();
          return;
        }
        sceneRef.current = scene;
        const fit = () => {
          const w = host.clientWidth || 16;
          const h = host.clientHeight || 9;
          scene.resize(w, h);
        };
        fit();
        scene.start(); // start() me-render frame pertama secara sinkron
        setStatus('ready');

        ro = new ResizeObserver(fit);
        ro.observe(host);
      } catch {
        // WebGL gagal saat konstruksi → fallback poster statis.
        setStatus('static');
      }
    };

    // Lazy-mount: scene hanya dibangun saat hero mendekati viewport.
    io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          mountScene();
        }
        // Hemat resource: jeda render saat hero tidak terlihat.
        sceneRef.current?.setPaused(!entry.isIntersecting || entry.intersectionRatio < 0.05);
      },
      { rootMargin: '400px 0px', threshold: [0, 0.05, 0.5] },
    );
    io.observe(host);

    const onVisibility = () => {
      sceneRef.current?.setPaused(document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      io?.disconnect();
      ro?.disconnect();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // reducedMotion disengaja tidak di-deps: perubahan preferensi di tengah
    // jalan tidak me-rebuild scene (menghindari glitch); reload halaman
    // menerapkan preferensi baru.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showCanvas = status === 'loading' || status === 'ready';

  return (
    <section ref={hostRef} className="ce-hero" aria-label="EZRAB — hero sinematik">
      {/* Lapisan 3D / poster statis */}
      <div className="ce-hero__bg" aria-hidden="true">
        <canvas
          ref={canvasRef}
          className={`ce-hero__canvas${showCanvas ? ' ce-hero__canvas--on' : ''}`}
        />
        {!showCanvas && <div className="ce-hero__poster" />}
        {status === 'loading' && (
          <div className="ce-hero__loader" role="status">
            <span className="ce-hero__spinner" aria-hidden="true" />
            Menyiapkan visual 3D…
          </div>
        )}
      </div>

      {/* Konten — selalu DOM biasa, tidak pernah tertutup canvas */}
      <div className="ce-hero__content">
        <p className="ce-hero__eyebrow">RAB &amp; Estimasi Konstruksi</p>
        <h1 className="ce-hero__title">
          Dari Gambar DED ke RAB,
          <br />
          <span className="ce-hero__title-accent">dihitung dengan presisi.</span>
        </h1>
        <p className="ce-hero__sub">
          EZRAB menyusun volume pekerjaan (QTO), menerapkan AHSP 2026, dan
          menelusur sumber harga — dalam satu alur kerja yang transparan.
        </p>
        <div className="ce-hero__ctas">
          <a className="ce-hero__cta ce-hero__cta--primary" href="/app/dashboard">
            Mulai Gratis
          </a>
          <a className="ce-hero__cta ce-hero__cta--ghost" href="#tentang-prototipe">
            Lihat Cara Kerja
          </a>
        </div>
        <p className="ce-hero__honesty">
          Visualisasi konseptual — ilustrasi suasana, bukan render proyek Anda.
          {status === 'static' && ' Mode statis aktif (tanpa WebGL / reduced motion).'}
        </p>
      </div>
    </section>
  );
};
