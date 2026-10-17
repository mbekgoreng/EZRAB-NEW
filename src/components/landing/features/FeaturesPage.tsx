import React from 'react';
import { ArrowRight, Zap, Check } from 'lucide-react';
import './features-page.css';
import { ExactFooter } from '../exact/ExactFooter';
import { FeaturesHero } from './FeaturesHero';
import { EcosystemDiagram } from './EcosystemDiagram';
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
} from './FeatureSections';

interface FeaturesPageProps {
  onBackToLanding: () => void;
  onOpenAbout: () => void;
  onOpenWorkspace: () => void;
  onOpenPricing: () => void;
}

const Section: React.FC<{
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  alt?: boolean;
  children: React.ReactNode;
}> = ({ id, eyebrow, title, sub, alt, children }) => (
  <section id={id} className={`fp-section ${alt ? 'fp-section-alt' : ''}`} aria-labelledby={`${id}-title`}>
    <div className="fp-container">
      <div className="fp-eyebrow">{eyebrow}</div>
      <h2 id={`${id}-title`} className="fp-h2">
        {title}
      </h2>
      {sub && <p className="fp-sub">{sub}</p>}
      {children}
    </div>
  </section>
);

/**
 * /fitur — "Kenali EZRAB": pusat penjelasan produk.
 * Bukan hero landing page, bukan dashboard aplikasi.
 */
export const FeaturesPage: React.FC<FeaturesPageProps> = ({
  onBackToLanding,
  onOpenAbout,
  onOpenWorkspace,
  onOpenPricing,
}) => {
  return (
    <div className="fp-page">
      {/* Nav */}
      <header className="fp-nav">
        <button type="button" className="fp-nav-back" onClick={onBackToLanding} aria-label="Kembali ke beranda">
          <span className="fp-nav-logo-text">EZRAB</span>
        </button>
        <button type="button" className="fp-nav-cta" onClick={onOpenWorkspace}>
          Coba EZRAB <ArrowRight size={14} />
        </button>
      </header>

      {/* A — Cinematic hero */}
      <FeaturesHero onOpenWorkspace={onOpenWorkspace} />

      {/* B — Mengapa EZRAB */}
      <Section
        id="mengapa"
        eyebrow="MENGAPA EZRAB"
        title={<>Masalah nyata di meja estimator, <br />diselesaikan dari akarnya.</>}
        sub="Lima pola yang berulang di proyek konstruksi — dan bagaimana EZRAB membantu mengatasinya berdasarkan kemampuan yang benar-benar tersedia."
      >
        <WhySection />
      </Section>

      {/* C — Ekosistem */}
      <Section
        id="ekosistem"
        eyebrow="EKOSISTEM EZRAB"
        title="Satu alur kerja, tiga belas modul yang saling terhubung."
        sub="Setiap modul punya peran berbeda. Diagram ini menunjukkan bagaimana data mengalir di antara mereka — bukan sekadar daftar fitur."
        alt
      >
        <EcosystemDiagram />
      </Section>

      {/* D — DED → RAB AI */}
      <Section
        id="ded-ai"
        eyebrow="DED → RAB AI"
        title="Dari gambar kerja menjadi draft RAB — dengan Anda sebagai penentu akhir."
        sub="AI membaca dan mengusulkan; sistem menghitung dari sumber terverifikasi; Anda meninjau sebelum menyetujui."
      >
        <DedFlowVisual />
      </Section>

      {/* E — QTO & kalkulator */}
      <Section
        id="qto"
        eyebrow="QTO & KALKULATOR VOLUME"
        title="Masukkan dimensi, bukan volume."
        sub="24 kalkulator parametrik bergambar menghitung volume, berat, dan luas dari ukuran gambar kerja. Coba cara kerjanya di demo interaktif ini."
        alt
      >
        <QtoDemo />
      </Section>

      {/* F — AHSP & integritas */}
      <Section
        id="ahsp"
        eyebrow="AHSP 2026 & INTEGRITAS HARGA"
        title="Harga yang bisa ditelusur sampai ke sumbernya."
        sub="Analisa harga satuan bukan sekadar angka — melainkan rantai: pekerjaan, koefisien, komponen, dan harga yang saling terkait."
      >
        <AhspSection />
      </Section>

      {/* G — AI Assistant */}
      <Section
        id="ai-assistant"
        eyebrow="AI ASSISTANT"
        title="Tiga AI, tiga peran yang jelas berbeda."
        sub="Bukan satu fitur yang samar. Masing-masing dipakai di momen yang berbeda dalam alur kerja Anda."
        alt
      >
        <AiRolesSection />
      </Section>

      {/* H — Dokumen AI */}
      <Section
        id="dokumen-ai"
        eyebrow="DOKUMEN AI"
        title="Dokumen proyek yang bisa diajak bekerja."
        sub="Unggah, proses, tinjau, dan hasilkan — dengan riwayat yang transparan."
      >
        <DocAiSection />
      </Section>

      {/* I — Manajemen & laporan */}
      <Section
        id="manajemen"
        eyebrow="MANAJEMEN PROYEK & LAPORAN"
        title="Estimasi selesai bukan berarti pekerjaan selesai."
        sub="Atur proyek, pantau progres dan keuangan, lalu export laporan yang siap dibagikan."
        alt
      >
        <ProjectSection />
      </Section>

      {/* J — Untuk siapa */}
      <Section
        id="untuk-siapa"
        eyebrow="UNTUK SIAPA"
        title="Dibangun untuk orang-orang yang menghitung bangunan."
        sub="Enam peran, enam kebutuhan — masing-masing dengan modul yang relevan."
      >
        <AudienceSection />
      </Section>

      {/* K — Cara mulai */}
      <Section
        id="mulai"
        eyebrow="CARA MEMULAI"
        title="Enam langkah menuju RAB pertama Anda."
        sub="Alur onboarding mengikuti cara kerja estimator — bukan teka-teki."
        alt
      >
        <StartSection onOpenWorkspace={onOpenWorkspace} />
      </Section>

      {/* L — Transparansi */}
      <Section
        id="transparansi"
        eyebrow="KEUNGGULAN & TRANSPARANSI"
        title="Klaim yang bisa Anda periksa sendiri."
        sub="Tanpa 'paling akurat' atau '100% otomatis'. Hanya prinsip kerja yang terbukti di implementasi."
      >
        <TransparencySection />
      </Section>

      {/* M — FAQ */}
      <Section
        id="faq"
        eyebrow="FAQ"
        title="Pertanyaan sebelum mulai."
        alt
      >
        <div className="fp-faq-wrap">
          <FaqSection />
        </div>
      </Section>

      {/* Pricing teaser */}
      <section className="fp-section" aria-label="Informasi paket">
        <div className="fp-container fp-pricing-teaser">
          <div>
            <h2 className="fp-h2">Mulai gratis. Naik kelas saat siap.</h2>
            <p className="fp-sub" style={{ margin: 0 }}>
              Free untuk mencoba · Starter Rp 59.999/bln · Pro Rp 79.999/bln
            </p>
          </div>
          <button type="button" className="fp-btn-primary" onClick={onOpenPricing}>
            Lihat Semua Harga <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* N — Final CTA */}
      <section className="fp-final" aria-labelledby="final-title">
        <div className="fp-container">
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

      <ExactFooter onOpenAbout={onOpenAbout} />
    </div>
  );
};
