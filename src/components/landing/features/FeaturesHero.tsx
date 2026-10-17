import React, { Suspense } from 'react';
import { ArrowRight, ArrowDown } from 'lucide-react';
import { ANCHORS } from './featuresContent';

const ArchitecturalBackground = React.lazy(() =>
  import('../architectural/ArchitecturalBackground').then((m) => ({
    default: m.ArchitecturalBackground,
  })),
);

interface FeaturesHeroProps {
  onOpenWorkspace: () => void;
}

export const FeaturesHero: React.FC<FeaturesHeroProps> = ({ onOpenWorkspace }) => {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="fh-hero" aria-labelledby="fh-title">
      {/* Cinematic 3D background — lazy, with gradient fallback */}
      <div className="fh-bg" aria-hidden="true">
        <Suspense fallback={null}>
          <ArchitecturalBackground mode={0} />
        </Suspense>
      </div>
      <div className="fh-veil" aria-hidden="true" />

      <div className="fh-inner">
        <p className="fh-eyebrow">KENALI EZRAB</p>
        <h1 id="fh-title" className="fh-title">
          Dari Gambar Kerja Menjadi
          <br />
          Rencana Anggaran yang <span className="fh-accent">Terstruktur.</span>
        </h1>
        <p className="fh-lead">
          EZRAB membantu proses estimasi konstruksi melalui AI, perhitungan
          volume, referensi AHSP, penyusunan RAB, dan pengelolaan data proyek
          dalam satu ekosistem kerja.
        </p>
        <div className="fh-cta-row">
          <button type="button" className="fh-btn-primary" onClick={() => scrollTo('ekosistem')}>
            Jelajahi Fitur EZRAB <ArrowDown size={16} />
          </button>
          <button type="button" className="fh-btn-ghost" onClick={onOpenWorkspace}>
            Coba EZRAB <ArrowRight size={16} />
          </button>
        </div>

        {/* Anchor navigation */}
        <nav className="fh-anchors" aria-label="Navigasi bagian halaman">
          {ANCHORS.map((a) => (
            <button key={a.id} type="button" className="fh-anchor" onClick={() => scrollTo(a.id)}>
              {a.label}
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
};
