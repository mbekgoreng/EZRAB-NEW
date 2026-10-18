import React, { useEffect, lazy, Suspense } from 'react';
import { ArrowRight, Zap, Check } from 'lucide-react';
import './features-page.css';
import { ExactFooter } from '../exact/ExactFooter';
import { ExactNavbar } from '../exact/ExactNavbar';
import { FeaturesHero } from './FeaturesHero';
import { DedFlowVisual } from './DedFlowVisual';
import { QtoDemo } from './QtoDemo';
import {
  WhySection,
  AhspSection,
  AiRolesSection,
  DocAiSection,
  ProjectSection,
  AudienceSection,
  StartSection,
  TransparencySection,
  FaqSection,
  WayfindingSection,
} from './FeatureSections';

interface FeaturesPageProps {
  onBackToLanding: () => void;
  onOpenWorkspace: () => void;
  onOpenPricing: () => void;
  onOpenAdvantages: () => void;
}

const Section: React.FC<{
  id: string;
  marker: string;
  meta: string;
  title: React.ReactNode;
  sub?: string;
  alt?: boolean;
  children: React.ReactNode;
}> = ({ id, marker, meta, title, sub, alt, children }) => (
  <section id={id} className={`fp-section ${alt ? 'fp-section-alt' : ''}`} aria-labelledby={`${id}-title`}>
    <div className="fp-container">
      <div className="fp-sec-head fp-reveal" aria-hidden="true">
        <span className="fp-sec-tag">{marker}</span>
        <span className="fp-sec-rule" />
        <span className="fp-sec-meta">{meta}</span>
      </div>
      <h2 id={`${id}-title`} className="fp-h2 fp-reveal">
        {title}
      </h2>
      {sub && <p className="fp-sub fp-reveal">{sub}</p>}
      <div className="fp-reveal" style={{ ['--fp-d' as any]: '0.08s' }}>{children}</div>
    </div>
  </section>
);

const EcosystemFlow = lazy(() =>
  import('./EcosystemFlow').then((m) => ({ default: m.EcosystemFlow }))
);

/**
 * /fitur — "Kenali EZRAB": pusat penjelasan produk.
 * Bukan hero landing page, bukan dashboard aplikasi.
 */
export const FeaturesPage: React.FC<FeaturesPageProps> = ({
  onBackToLanding,
  onOpenWorkspace,
  onOpenPricing,
  onOpenAdvantages,
}) => {
  // Satu momen gerak: reveal saat scroll, sekali saja per elemen.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.fp-page .fp-reveal'));
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="fp-page">
      {/* Nav — sama seperti landing page */}
      <ExactNavbar
        onOpenAuth={() => onOpenWorkspace()}
        onBackToLanding={onBackToLanding}
        onOpenAdvantages={onOpenAdvantages}
      />

      {/* A — Cinematic hero */}
      <FeaturesHero onOpenWorkspace={onOpenWorkspace} />

      {/* B — Mengapa EZRAB */}
      <Section
        id="mengapa"
        marker="B"
        meta="MENGAPA EZRAB"
        title={<>Masalah nyata di meja estimator, <br />diselesaikan dari akarnya.</>}
        sub="Lima pola yang berulang di proyek konstruksi — dan bagaimana EZRAB membantu mengatasinya berdasarkan kemampuan yang benar-benar tersedia."
      >
        <WhySection />
      </Section>

      {/* C — Ekosistem */}
      <Section
        id="ekosistem"
        marker="C"
        meta="EKOSISTEM"
        title="Kenali Ekosistem EZRAB"
        sub="Dari gambar kerja hingga kendali biaya proyek, setiap proses dirancang untuk saling terhubung."
        alt
      >
        <Suspense fallback={<div style={{ height: 420 }} />}>
          <EcosystemFlow
            onOpenWorkspace={onOpenWorkspace}
            onExploreFeatures={() => {
              document.getElementById('ded-ai')?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        </Suspense>
      </Section>

      {/* D — DED → RAB AI */}
      <Section
        id="ded-ai"
        marker="D"
        meta="DED → RAB AI"
        title="Dari gambar kerja menjadi draft RAB — dengan Anda sebagai penentu akhir."
        sub="AI membaca dan mengusulkan; sistem menghitung dari sumber terverifikasi; Anda meninjau sebelum menyetujui."
      >
        <DedFlowVisual />
      </Section>

      {/* E — QTO & kalkulator */}
      <Section
        id="qto"
        marker="E"
        meta="QTO & KALKULATOR"
        title="Masukkan dimensi, bukan volume."
        sub="24 kalkulator parametrik bergambar menghitung volume, berat, dan luas dari ukuran gambar kerja. Coba cara kerjanya di demo interaktif ini."
        alt
      >
        <QtoDemo />
      </Section>

      {/* F — AHSP & integritas */}
      <Section
        id="ahsp"
        marker="F"
        meta="AHSP 2026"
        title="Harga yang bisa ditelusur sampai ke sumbernya."
        sub="Analisa harga satuan bukan sekadar angka — melainkan rantai: pekerjaan, koefisien, komponen, dan harga yang saling terkait."
      >
        <AhspSection />
      </Section>

      {/* G — AI Assistant */}
      <Section
        id="ai-assistant"
        marker="G"
        meta="AI ASSISTANT"
        title="Tiga AI, tiga peran yang jelas berbeda."
        sub="Bukan satu fitur yang samar. Masing-masing dipakai di momen yang berbeda dalam alur kerja Anda."
        alt
      >
        <AiRolesSection />
      </Section>

      {/* H — Dokumen AI */}
      <Section
        id="dokumen-ai"
        marker="H"
        meta="DOKUMEN AI"
        title="Dokumen proyek yang bisa diajak bekerja."
        sub="Unggah, proses, tinjau, dan hasilkan — dengan riwayat yang transparan."
      >
        <DocAiSection />
      </Section>

      {/* I — Manajemen & laporan */}
      <Section
        id="manajemen"
        marker="I"
        meta="MANAJEMEN & LAPORAN"
        title="Estimasi selesai bukan berarti pekerjaan selesai."
        sub="Atur proyek, pantau progres dan keuangan, lalu export laporan yang siap dibagikan."
        alt
      >
        <ProjectSection />
      </Section>

      {/* J — Untuk siapa */}
      <Section
        id="untuk-siapa"
        marker="J"
        meta="UNTUK SIAPA"
        title="Dibangun untuk orang-orang yang menghitung bangunan."
        sub="Enam peran, enam kebutuhan — masing-masing dengan modul yang relevan."
      >
        <AudienceSection />
      </Section>

      {/* K — Cara mulai */}
      <Section
        id="mulai"
        marker="K"
        meta="CARA MEMULAI"
        title="Enam langkah menuju RAB pertama Anda."
        sub="Alur onboarding mengikuti cara kerja estimator — bukan teka-teki."
        alt
      >
        <StartSection onOpenWorkspace={onOpenWorkspace} />
      </Section>

      {/* L — Transparansi */}
      <Section
        id="transparansi"
        marker="L"
        meta="TRANSPARANSI"
        title="Klaim yang bisa Anda periksa sendiri."
        sub="Tanpa 'paling akurat' atau '100% otomatis'. Hanya prinsip kerja yang terbukti di implementasi."
      >
        <TransparencySection />
      </Section>

      {/* M — FAQ */}
      <Section
        id="faq"
        marker="M"
        meta="FAQ"
        title="Pertanyaan sebelum mulai."
        alt
      >
        <div className="fp-faq-wrap">
          <FaqSection />
        </div>
      </Section>

      {/* Wayfinding — hub "Kenali EZRAB": tiga jalur + mulai menggunakan */}
      <section id="mulai-dari-sini" className="fp-section" aria-labelledby="mulai-dari-sini-title">
        <div className="fp-container">
          <div className="fp-sec-head fp-reveal" aria-hidden="true">
            <span className="fp-sec-tag">N</span>
            <span className="fp-sec-rule" />
            <span className="fp-sec-meta">MULAI DARI SINI</span>
          </div>
          <h2 id="mulai-dari-sini-title" className="fp-h2 fp-reveal">
            Kenali prosesnya. Pahami estimasinya. Kendalikan hasilnya.
          </h2>
          <p className="fp-sub fp-reveal">
            Tiga jalur untuk melanjutkan — pilih yang paling sesuai dengan kebutuhan Anda saat ini.
          </p>
          <div className="fp-reveal" style={{ ['--fp-d' as any]: '0.08s' }}>
            <WayfindingSection
              onExploreFeatures={() =>
                document.getElementById('ekosistem')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              onOpenAdvantages={onOpenAdvantages}
              onOpenPricing={onOpenPricing}
              onOpenWorkspace={onOpenWorkspace}
            />
          </div>
        </div>
      </section>

      {/* O — Final CTA */}
      <section className="fp-final" aria-labelledby="final-title">
        <div className="fp-final-ring" aria-hidden="true" />
        <div className="fp-container fp-reveal">
          <Zap size={28} className="fp-final-icon" aria-hidden="true" />
          <h2 id="final-title" className="fp-h2">
            Kenali Alur Kerjanya. Temukan Cara Kerja yang Lebih Terstruktur.
          </h2>
          <p className="fp-sub">
            Jelajahi ekosistem EZRAB dan pilih alat yang sesuai dengan kebutuhan proyek konstruksi Anda.
          </p>
          <button type="button" className="fp-btn-primary fp-btn-lg" onClick={onOpenWorkspace}>
            Jelajahi EZRAB <ArrowRight size={16} />
          </button>
          <div className="fp-checks">
            {['24 kalkulator QTO', 'AHSP 2026 resmi', 'Export Excel & PDF'].map((c) => (
              <span key={c} className="fp-check">
                <Check size={14} aria-hidden="true" /> {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      <ExactFooter />
    </div>
  );
};
