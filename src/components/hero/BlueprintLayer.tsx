import React from 'react';

export const BlueprintLayer: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: '0%',
        opacity: 0.5,
        backgroundImage: `
          linear-gradient(rgba(37, 99, 235, 0.09) 1px, transparent 1px),
          linear-gradient(90deg, rgba(37, 99, 235, 0.09) 1px, transparent 1px),
          linear-gradient(rgba(37, 99, 235, 0.03) 2px, transparent 2px),
          linear-gradient(90deg, rgba(37, 99, 235, 0.03) 2px, transparent 2px)
        `,
        backgroundSize: '40px 40px, 40px 40px, 8px 8px, 8px 8px',
        maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 25%, transparent 80%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 25%, transparent 80%)',
        animation: 'blueprint-drift 24s linear infinite',
        pointerEvents: 'none',
      }}
    >
      {/* Blueprint Coordinate Axes */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          fontSize: '10px',
          fontFamily: 'JetBrains Mono, monospace',
          color: 'var(--ezrab-blue)',
          opacity: 0.7,
          letterSpacing: '0.1em',
        }}
      >
        GRID-X: 14.500m &bull; GRID-Y: 08.400m [DATUM +0.00]
      </div>
    </div>
  );
};
