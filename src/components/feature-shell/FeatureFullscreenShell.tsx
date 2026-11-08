/**
 * FeatureFullscreenShell — Kerangka tampilan SATU LAYAR PENUH untuk fitur AI
 * (DED Estimate AI & Document AI), mengikuti mockup yang di-ACC owner
 * (EZRAB-DED-DOC-FULLSCREEN-MOCKUP, 2026-11-08).
 *
 * Shell mengambil seluruh viewport (fixed inset-0) menggantikan chrome
 * workspace: bar atas ramping milik fitur (Kembali ke Workspace, judul +
 * konteks aktif, chip mode/status, Kredit AI, tombol tutup), stepper tahap,
 * area konten yang scroll sendiri, dan bar aksi menempel di bawah.
 *
 * Bar aksi diisi lewat FsFooterPortal: sub-view yang sudah ada merender
 * tombol aksinya SENDIRI (state & handler tidak berpindah) ke dalam footer
 * shell via portal. Bila shell tidak ada (mount mandiri), FsFooterPortal
 * merender anak-anaknya di tempat seperti biasa — perilaku lama utuh.
 *
 * Murni presentasi: tidak ada logika service/perhitungan di sini.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, X } from 'lucide-react';
import './feature-shell.css';

export interface FsStep {
  /** Label tahap, mis. "Upload DED" — nomor ditambahkan shell ("1 · Upload DED"). */
  label: string;
  state: 'done' | 'active' | 'upcoming';
  /** Boleh diklik hanya untuk tahap yang sudah dilewati / permukaan nyata yang bisa dibuka. */
  onClick?: () => void;
}

interface FeatureFullscreenShellProps {
  title: string;
  icon: React.ReactNode;
  /** Label konteks di bar atas, mis. "Proyek aktif:" / "Dokumen:". */
  contextLabel?: string;
  /** Nilai konteks (nama proyek / nama dokumen + metadata). Kosong = baris konteks disembunyikan. */
  contextText?: string;
  /** Chip mode/status di bar atas (di samping judul). */
  chips?: React.ReactNode;
  /** Teks indikator Kredit AI — HANYA dari sumber data nyata aplikasi (saldo simulasi). */
  creditText?: string;
  /** Aksi tombol "Kembali ke Workspace" dan tombol tutup (sama). */
  onBack: () => void;
  steps?: FsStep[];
  stepsNote?: string;
  children: React.ReactNode;
}

const FsFooterContext = createContext<HTMLElement | null>(null);

/**
 * Render aksi sub-view ke bar aksi shell. Di luar shell: render di tempat
 * (fallback perilaku lama). State/handler tombol tidak berubah — hanya
 * posisi DOM-nya yang berpindah ke footer.
 */
export const FsFooterPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const footerNode = useContext(FsFooterContext);
  if (!footerNode) return <>{children}</>;
  return createPortal(children, footerNode);
};

/** Chip standar bar atas (mode/status). */
export const FsChip: React.FC<{ kind?: 'mode' | 'ok' | 'warn' | 'danger' | 'plain'; children: React.ReactNode }> = ({
  kind = 'mode',
  children,
}) => <span className={`fs-chip fs-chip-${kind}`}>{children}</span>;

export const FeatureFullscreenShell: React.FC<FeatureFullscreenShellProps> = ({
  title,
  icon,
  contextLabel,
  contextText,
  chips,
  creditText,
  onBack,
  steps,
  stepsNote,
  children,
}) => {
  const [footerNode, setFooterNode] = useState<HTMLElement | null>(null);

  // Kunci scroll latar (workspace) selama layar-penuh aktif.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fs-shell" role="dialog" aria-modal="false" aria-label={title}>
      <header className="fs-topbar">
        <button type="button" className="fs-backbtn" onClick={onBack}>
          <ArrowLeft size={15} /> Kembali ke Workspace
        </button>
        <div className="fs-vdiv" aria-hidden="true" />
        <div className="fs-feat">
          <div className="fs-feat-ico">{icon}</div>
          <div className="fs-feat-txt">
            <h1>{title}</h1>
            {contextText ? (
              <div className="fs-ctx">
                {contextLabel ? <>{contextLabel} </> : null}
                <b>{contextText}</b>
              </div>
            ) : null}
          </div>
        </div>
        {chips}
        <div className="fs-topright">
          {creditText ? <span className="fs-chip fs-chip-credit">{creditText}</span> : null}
          <button type="button" className="fs-xbtn" onClick={onBack} title="Tutup" aria-label="Tutup">
            <X size={15} />
          </button>
        </div>
      </header>

      {steps && steps.length > 0 ? (
        <nav className="fs-stepper" aria-label={`Tahap ${title}`}>
          {steps.map((s, i) => (
            <React.Fragment key={`${i}-${s.label}`}>
              {i > 0 ? <div className="fs-stepline" aria-hidden="true" /> : null}
              <button
                type="button"
                className={`fs-step ${s.state}`}
                onClick={s.onClick}
                disabled={!s.onClick}
                aria-current={s.state === 'active' ? 'step' : undefined}
              >
                <span className="fs-step-n">{s.state === 'done' ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
                <span className="fs-step-lbl">{`${i + 1} · ${s.label}`}</span>
              </button>
            </React.Fragment>
          ))}
          <div className="fs-stepper-spacer" />
          {stepsNote ? <span className="fs-stepper-note">{stepsNote}</span> : null}
        </nav>
      ) : null}

      <div className="fs-content">
        <FsFooterContext.Provider value={footerNode}>{children}</FsFooterContext.Provider>
      </div>

      {/* Bar aksi bawah: kosong (dan disembunyikan CSS) sampai ada sub-view
          yang memportalkan aksinya ke sini. */}
      <footer className="fs-actionbar" ref={setFooterNode} />
    </div>
  );
};

export default FeatureFullscreenShell;
