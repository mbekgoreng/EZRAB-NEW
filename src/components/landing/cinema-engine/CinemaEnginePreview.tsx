/**
 * CinemaEnginePreview — halaman host untuk prototipe Phase 1.
 *
 * Route: /preview/cinema-engine (lihat CINEMA_ENGINE_PREVIEW_PATH).
 * Terisolasi penuh: tidak mengubah landing utama, tidak mengubah /app/*.
 * Berisi hero + catatan jujur tentang apa yang diuji di fase ini.
 */
import React from 'react';
import { CinemaEngineHero, CINEMA_ENGINE_ENABLED } from './CinemaEngineHero';

const CHECKS = [
  'Scene 3D terisolasi: memakai ulang ArchitecturalScene (Layer A), tanpa dependency baru',
  'Lazy-mount saat mendekati viewport; render dijeda saat hero tidak terlihat / tab disembunyikan',
  'prefers-reduced-motion → poster statis, scene tidak dibangun',
  'WebGL tidak tersedia / gagal → poster statis + pesan jujur',
  'Resize adaptif; detail "low" otomatis di layar kecil / CPU lemah; DPR dibatasi 2',
  'Dispose geometry, material, renderer, dan observer saat komponen dilepas',
  'CTA mengarah ke route nyata (/app/dashboard); tanpa statistik/angka karangan',
];

export const CinemaEnginePreview: React.FC = () => (
  <div className="ce-preview">
    <header className="ce-preview__bar">
      <span className="ce-preview__badge">PROTOTIPE — FASE 1</span>
      <span className="ce-preview__title">Cinema Engine Hero</span>
      <a className="ce-preview__back" href="/">
        ← Kembali ke Beranda
      </a>
    </header>

    {!CINEMA_ENGINE_ENABLED && (
      <p className="ce-preview__disabled" role="alert">
        Prototipe dinonaktifkan via <code>CINEMA_ENGINE_ENABLED</code>.
      </p>
    )}

    <CinemaEngineHero />

    <section id="tentang-prototipe" className="ce-preview__notes">
      <h2>Apa yang diuji di fase ini</h2>
      <ul>
        {CHECKS.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <h2>Batasan yang diketahui</h2>
      <ul>
        <li>
          QA visual (desktop, mobile 390px, reduced-motion, fallback WebGL) belum dijalankan —
          membutuhkan browser nyata / preview deployment.
        </li>
        <li>
          Pengukuran performa (frame time, memori) belum dilakukan — butuh profiling di perangkat nyata.
        </li>
        <li>
          Scene memakai visual Layer A yang sudah ada; Scene B–E (DED→RAB, QTO, AHSP, workspace)
          adalah fase berikutnya dan belum dibangun.
        </li>
      </ul>
    </section>
  </div>
);
