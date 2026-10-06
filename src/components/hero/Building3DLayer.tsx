import React from 'react';

export const Building3DLayer: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '52%',
        width: '78%',
        maxWidth: '560px',
        aspectRatio: '1.1 / 1',
        transform: 'translate(-50%, -50%)',
        animation: 'building-float 6s ease-in-out infinite',
        transformStyle: 'preserve-3d',
        zIndex: 2,
        pointerEvents: 'none',
      }}
    >
      {/* SVG Modern Architectural Construction Villa / Commercial Building */}
      <svg
        viewBox="0 0 600 520"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 25px 45px rgba(15, 23, 42, 0.12))' }}
      >
        <defs>
          <linearGradient id="wallGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.85" />
          </linearGradient>

          <linearGradient id="wallGradDark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.8" />
          </linearGradient>

          <linearGradient id="glassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#2563eb" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.5" />
          </linearGradient>

          <linearGradient id="timberGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d97706" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#92400e" stopOpacity="0.85" />
          </linearGradient>

          <linearGradient id="laserGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.9" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>

          <filter id="laserGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Foundation & Ground Slab Base */}
        <polygon points="300,470 540,360 300,280 60,360" fill="url(#wallGradDark)" stroke="#2563eb" strokeWidth="1.5" strokeOpacity="0.3" />
        <polygon points="60,360 300,470 300,490 60,380" fill="#64748b" fillOpacity="0.7" />
        <polygon points="300,470 540,360 540,380 300,490" fill="#475569" fillOpacity="0.8" />

        {/* Ground Floor Main Block */}
        <polygon points="120,330 300,420 300,280 120,200" fill="url(#wallGrad1)" stroke="#cbd5e1" strokeWidth="1" />
        <polygon points="300,420 480,330 480,200 300,280" fill="url(#wallGradDark)" stroke="#cbd5e1" strokeWidth="1" />

        {/* Ground Floor Large Glass Facade */}
        <polygon points="140,315 280,385 280,270 140,210" fill="url(#glassGrad)" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.6" />
        {/* Glass Mullions */}
        <line x1="210" y1="240" x2="210" y2="350" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.8" />
        <line x1="140" y1="262" x2="280" y2="327" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.8" />

        {/* Cantilever 2nd Floor Modern Overhang */}
        <polygon points="80,220 320,330 320,180 80,80" fill="url(#wallGrad1)" stroke="#2563eb" strokeWidth="1.5" strokeOpacity="0.4" />
        <polygon points="320,330 520,230 520,90 320,180" fill="url(#wallGradDark)" stroke="#cbd5e1" strokeWidth="1" />

        {/* 2nd Floor Architectural Ribbon Window */}
        <polygon points="100,195 300,290 300,180 100,95" fill="url(#glassGrad)" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.7" />
        <polygon points="335,268 500,185 500,110 335,185" fill="url(#glassGrad)" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.7" />

        {/* Timber Texture Accent Screen */}
        <polygon points="260,110 310,132 310,250 260,225" fill="url(#timberGrad)" />
        <line x1="260" y1="130" x2="310" y2="152" stroke="#451a03" strokeWidth="1.5" strokeOpacity="0.5" />
        <line x1="260" y1="150" x2="310" y2="172" stroke="#451a03" strokeWidth="1.5" strokeOpacity="0.5" />
        <line x1="260" y1="170" x2="310" y2="192" stroke="#451a03" strokeWidth="1.5" strokeOpacity="0.5" />
        <line x1="260" y1="190" x2="310" y2="212" stroke="#451a03" strokeWidth="1.5" strokeOpacity="0.5" />

        {/* Roof Deck / Pergola Minimalist Crown */}
        <polygon points="70,75 320,175 530,75 280,0" fill="#1e293b" fillOpacity="0.15" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="4 3" />

        {/* Animated Scan Line (AI Analysis Simulation) */}
        <g style={{ animation: 'scan-line 4s ease-in-out infinite' }}>
          <line x1="40" y1="200" x2="560" y2="200" stroke="url(#laserGrad)" strokeWidth="3" filter="url(#laserGlow)" />
          <circle cx="300" cy="200" r="4" fill="#60a5fa" filter="url(#laserGlow)" />
        </g>
      </svg>
    </div>
  );
};
