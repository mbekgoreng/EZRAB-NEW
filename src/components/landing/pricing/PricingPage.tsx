import React, { useEffect, useRef } from 'react';
import '../../../styles/landing-ai-showcase.css';
import '../../../styles/landing-critical.css';
import '../../../styles/exact-landing-flagship-mobile.css';
import { ExactNavbar } from '../exact/ExactNavbar';
import { ExactFooter } from '../exact/ExactFooter';
import { PricingCards, PricingComparison } from '../exact/PricingBlocks';
import { enhanceLandingMotion } from '../exact/motionEnhancer';

interface PricingPageProps {
  onOpenAuth: (tab?: 'masuk' | 'daftar') => void;
  onBackToLanding?: () => void;
  onOpenAbout?: () => void;
  onOpenAdvantages?: () => void;
}

/**
 * Halaman Harga & Paket (/harga) — rumah lengkap billing EZRAB:
 * empat kartu paket + tabel perbandingan fitur Spec Billing v1.0 +
 * ketentuan transparan. Landing hanya menampilkan versi minimal
 * (kartu + tombol ke halaman ini). Harga/kredit dari plans.ts.
 */
export const PricingPage: React.FC<PricingPageProps> = ({
  onOpenAuth,
  onBackToLanding,
  onOpenAbout,
  onOpenAdvantages,
}) => {
  useEffect(() => {
    void import('../../../styles/exact-landing.css');
  }, []);

  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pageRef.current) return;
    return enhanceLandingMotion(pageRef.current);
  }, []);

  return (
    <div ref={pageRef} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
      <ExactNavbar
        onOpenAuth={onOpenAuth}
        onBackToLanding={onBackToLanding}
        onOpenAbout={onOpenAbout}
        onOpenAdvantages={onOpenAdvantages}
      />
      <main style={{ flexGrow: 1 }}>
        <div className="ezai-scope">
          <section className="ezai-sec" style={{ paddingTop: '120px' }}>
            <div className="grid-bg"></div>
            <div className="wrap" style={{ position: 'relative' }}>
              <div className="center">
                <span className="eyebrow">Harga & Paket</span>
                <h2>Paket mengikuti <span className="bl">kebutuhan AI Anda.</span></h2>
                <p className="sub" style={{ margin: '0 auto' }}>
                  Semua paket memakai mesin hitung dan ketepatan numerik yang sama. Yang berbeda:
                  akses AHSP, jatah kredit AI, kuota ekspor, dan kolaborasi tim.
                  Free gratis selamanya — bukan uji coba berbatas waktu.
                </p>
              </div>
              <PricingCards onOpenAuth={onOpenAuth} />
              <PricingComparison />
              <p className="demo-note" style={{ textAlign: 'center' }}>
                Mode simulasi — langganan belum aktif, belum ada penagihan nyata.
              </p>
            </div>
          </section>
        </div>
      </main>
      <ExactFooter />
    </div>
  );
};
