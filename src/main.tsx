import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { I18nProvider } from './i18n';
import { RoleProvider } from './auth/RoleContext';
import { AuthProvider } from './auth/AuthContext';
import './styles/global.css';
import './styles/premium-themes.css';
import './styles/magic-ai.css';
import './styles/assistant-wizard.css';
import './styles/landing-experience.css';
import './styles/material-intelligence.css';
import './styles/ded-rab-v3.css';
import './blog/blog.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <CurrencyProvider>
      <I18nProvider>
        <RoleProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </RoleProvider>
      </I18nProvider>
      </CurrencyProvider>
    </ThemeProvider>
    {/* Vercel Web Analytics: cookieless visitor/pageview counting.
        Inert until Web Analytics is enabled on the Vercel project and
        this build is deployed; sends nothing in development. */}
    <Analytics />
  </React.StrictMode>
);

// Daftarkan service worker sejak awal (produksi saja) supaya EZRAB bisa
// dipasang sebagai app/shortcut di layar utama HP tanpa menunggu fitur
// notifikasi dibuka. Modul notifikasi mendaftarkan SW yang sama —
// pendaftaran ganda pada script yang sama tidak berpengaruh.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* gagal daftar tidak boleh mengganggu aplikasi */
    });
  });
}
