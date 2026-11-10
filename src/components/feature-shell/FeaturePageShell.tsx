/**
 * FeaturePageShell — Kerangka halaman fitur DI DALAM workspace (pola app
 * shell), mengikuti mockup yang di-ACC owner 2026-11-10
 * (EZRAB-DED-DOC-SHELL-MOCKUP revisi keadaan awal).
 *
 * Berbeda dari FeatureFullscreenShell: shell ini TIDAK menutupi workspace —
 * ia dirender sebagai halaman biasa di dalam WorkspaceView (sidebar +
 * topbar tetap terlihat). Area fitur dikunci setinggi sisa viewport dan
 * HALAMAN TIDAK SCROLL: konten panjang bergeser di wilayah internalnya
 * sendiri (panel/tabel), bukan di halaman.
 *
 * Struktur: header fitur (ikon + judul + konteks/chip + Kredit AI),
 * stepper ramping opsional, wilayah konten terkunci, dan bar aksi menempel
 * di bawah yang diisi sub-view lewat FsFooterPortal yang sama persis dengan
 * shell lama (konteks bersama di FeatureFullscreenShell.tsx) — state &
 * handler tombol tidak berpindah, hanya posisi DOM-nya.
 *
 * Tombol "Kembali ke Workspace"/tutup TIDAK ada di sini: navigasi kembali
 * memakai sidebar/topbar workspace yang selalu terlihat.
 *
 * Murni presentasi: tidak ada logika service/perhitungan di sini.
 */
import React, { useState } from 'react';
import { Check, Zap } from 'lucide-react';
import { FsFooterContext, FsStep } from './FeatureFullscreenShell';
import './feature-page-shell.css';

export type { FsStep };

interface FeaturePageShellProps {
  title: string;
  /** Baris keterangan singkat di bawah judul (bahasa mockup ter-ACC). */
  subtitle?: string;
  icon: React.ReactNode;
  /** Label konteks, mis. "Proyek aktif:" / "Dokumen:". */
  contextLabel?: string;
  /** Nilai konteks (nama proyek / nama dokumen + metadata). */
  contextText?: string;
  /** Chip mode/status di bar atas (di samping judul). */
  chips?: React.ReactNode;
  /** Teks indikator Kredit AI — HANYA dari sumber data nyata aplikasi (saldo simulasi). */
  creditText?: string;
  steps?: FsStep[];
  stepsNote?: string;
  children: React.ReactNode;
}

export const FeaturePageShell: React.FC<FeaturePageShellProps> = ({
  title,
  subtitle,
  icon,
  contextLabel,
  contextText,
  chips,
  creditText,
  steps,
  stepsNote,
  children,
}) => {
  const [footerNode, setFooterNode] = useState<HTMLElement | null>(null);

  return (
    <div className="fp-shell">
      <header className="fp-head">
        <div className="fp-feat-ico">{icon}</div>
        <div className="fp-feat-txt">
          <h1>{title}</h1>
          {subtitle ? <p className="fp-sub">{subtitle}</p> : null}
          {contextText ? (
            <div className="fp-ctx">
              {contextLabel ? <>{contextLabel} </> : null}
              <b>{contextText}</b>
            </div>
          ) : null}
        </div>
        {chips}
        {creditText ? (
          <span className="fp-credit">
            <Zap size={13} strokeWidth={2.5} /> {creditText}
          </span>
        ) : null}
      </header>

      {steps && steps.length > 0 ? (
        <nav className="fp-stepper" aria-label={`Tahap ${title}`}>
          {steps.map((s, i) => (
            <React.Fragment key={`${i}-${s.label}`}>
              {i > 0 ? <div className="fp-stepline" aria-hidden="true" /> : null}
              <button
                type="button"
                className={`fp-step ${s.state}`}
                onClick={s.onClick}
                disabled={!s.onClick}
                aria-current={s.state === 'active' ? 'step' : undefined}
              >
                <span className="fp-step-n">{s.state === 'done' ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
                <span className="fp-step-lbl">{`${i + 1} · ${s.label}`}</span>
              </button>
            </React.Fragment>
          ))}
          <div className="fp-stepper-spacer" />
          {stepsNote ? <span className="fp-stepper-note">{stepsNote}</span> : null}
        </nav>
      ) : null}

      <div className="fp-content">
        <FsFooterContext.Provider value={footerNode}>{children}</FsFooterContext.Provider>
      </div>

      {/* Bar aksi bawah: kosong (dan disembunyikan CSS) sampai ada sub-view
          yang memportalkan aksinya ke sini. */}
      <footer className="fp-actionbar" ref={setFooterNode} />
    </div>
  );
};

export default FeaturePageShell;
