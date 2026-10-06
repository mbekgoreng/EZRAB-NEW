import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import './styles/global.css';
import './styles/magic-ai.css';
import './styles/assistant-wizard.css';
import './styles/landing-experience.css';
import './styles/material-intelligence.css';
import './styles/ded-rab-v3.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
