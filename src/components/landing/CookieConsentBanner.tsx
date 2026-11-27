import React, { useEffect, useState } from 'react';
import '../../styles/cookie-consent.css';
import {
  getCookieConsent,
  setCookieConsent,
  type CookieConsentChoice,
} from '../../lib/cookieConsent';
import { navigateTo } from '../../routing/routes';
import { useI18n } from '../../i18n';

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
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getCookieConsent() !== null) return;
    // D-06: dulu banner muncul otomatis setelah 800 ms sebagai overlay
    // fixed — tepat saat klik pertama, dan audit membuktikan ia pernah
    // menutupi CTA "Mulai Gratis". Kini banner tampil pada INTERAKSI
    // PERTAMA pengguna (klik/scroll/ketik — sesudah klik itu mendarat)
    // atau setelah 8 detik bila tidak ada interaksi sama sekali.
    let shown = false;
    let timer: number | undefined;
    const show = () => {
      if (shown) return;
      shown = true;
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', show);
      window.removeEventListener('keydown', show);
      window.removeEventListener('scroll', show);
      setVisible(true);
    };
    timer = window.setTimeout(show, 8000);
    window.addEventListener('pointerdown', show);
    window.addEventListener('keydown', show);
    window.addEventListener('scroll', show, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', show);
      window.removeEventListener('keydown', show);
      window.removeEventListener('scroll', show);
    };
  }, []);

  if (!visible) return null;

  const choose = (choice: CookieConsentChoice) => {
    setCookieConsent(choice);
    setVisible(false);
  };

  return (
    <div className="ez-cookie-banner" role="region" aria-label={t('landing.cookie_aria')}>
      <p className="ez-cookie-banner-text">
        {t('landing.cookie_text')}{' '}
        <a
          href="/privacy"
          className="ez-cookie-banner-link"
          onClick={(e) => {
            e.preventDefault();
            navigateTo('/privacy');
            window.scrollTo({ top: 0 });
          }}
        >
          {t('landing.cookie_privacy')}
        </a>
      </p>
      <div className="ez-cookie-banner-actions">
        <button
          type="button"
          className="ez-cookie-banner-btn ez-cookie-banner-btn-ghost"
          onClick={() => choose('rejected')}
        >
          {t('landing.cookie_decline')}
        </button>
        <button
          type="button"
          className="ez-cookie-banner-btn ez-cookie-banner-btn-primary"
          onClick={() => choose('accepted')}
        >
          {t('landing.cookie_accept')}
        </button>
      </div>
    </div>
  );
};
