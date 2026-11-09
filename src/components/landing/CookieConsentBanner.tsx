import React, { useEffect, useState } from 'react';
import '../../styles/cookie-consent.css';
import {
  getCookieConsent,
  setCookieConsent,
  type CookieConsentChoice,
} from '../../lib/cookieConsent';
import { navigateTo } from '../../routing/routes';

/**
 * Banner persetujuan cookie — khusus landing publik.
 *
 * Dirender satu kali dari ExactLandingPage (akar landing), sehingga tidak
 * pernah tampil di dalam workspace /app. Muncul hanya bila pengunjung
 * belum pernah memilih; pilihan disimpan via lib/cookieConsent.
 *
 * Teks jujur terhadap keadaan produk: EZRAB belum memasang analitik;
 * pengukuran kunjungan hanya akan berjalan bila pengunjung menekan
 * "Terima" (lihat hasAnalyticsConsent di lib/cookieConsent).
 */
export const CookieConsentBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getCookieConsent() !== null) return;
    // Jeda singkat agar banner tidak berkedip bersama muatan pertama.
    const timer = window.setTimeout(() => setVisible(true), 800);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const choose = (choice: CookieConsentChoice) => {
    setCookieConsent(choice);
    setVisible(false);
  };

  return (
    <div className="ez-cookie-banner" role="region" aria-label="Persetujuan cookie">
      <p className="ez-cookie-banner-text">
        Kami memakai cookie agar sesi kamu tetap aman. Bila kamu setuju, kami
        juga memakai cookie pengukuran untuk memahami kunjungan dan membuat
        EZRAB lebih baik — pengukuran hanya berjalan bila kamu menekan Terima.{' '}
        <a
          href="/privacy"
          className="ez-cookie-banner-link"
          onClick={(e) => {
            e.preventDefault();
            navigateTo('/privacy');
            window.scrollTo({ top: 0 });
          }}
        >
          Kebijakan Privasi
        </a>
      </p>
      <div className="ez-cookie-banner-actions">
        <button
          type="button"
          className="ez-cookie-banner-btn ez-cookie-banner-btn-ghost"
          onClick={() => choose('rejected')}
        >
          Tolak
        </button>
        <button
          type="button"
          className="ez-cookie-banner-btn ez-cookie-banner-btn-primary"
          onClick={() => choose('accepted')}
        >
          Terima
        </button>
      </div>
    </div>
  );
};
