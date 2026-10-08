import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { I18nProvider } from './i18n';
import { RoleProvider } from './auth/RoleContext';
import './styles/global.css';
import './styles/magic-ai.css';
import './styles/assistant-wizard.css';
import './styles/landing-experience.css';
import './styles/material-intelligence.css';
import './styles/ded-rab-v3.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <RoleProvider>
          <App />
        </RoleProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>
);

// Hide the loading splash once React has mounted
(window as unknown as { __reactMounted?: boolean; __hideLoading?: () => void }).__reactMounted = true;
if (typeof (window as unknown as { __hideLoading?: () => void }).__hideLoading === 'function') {
  // Small delay so the app has painted at least once
  setTimeout(() => (window as unknown as { __hideLoading?: () => void }).__hideLoading?.(), 300);
}
