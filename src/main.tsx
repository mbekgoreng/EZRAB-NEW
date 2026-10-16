import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <RoleProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </RoleProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>
);
