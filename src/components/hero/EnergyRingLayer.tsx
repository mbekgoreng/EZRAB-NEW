import React from 'react';

export const EnergyRingLayer: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {/* Primary Energy Ring */}
      <div
        style={{
          position: 'absolute',
          width: '80%',
          aspectRatio: '1',
          left: '50%',
          top: '50%',
          borderRadius: '50%',
          border: '1.5px dashed rgba(37, 99, 235, 0.25)',
          transform: 'translate(-50%, -50%) rotateX(68deg)',
          boxShadow: '0 0 60px rgba(37, 99, 235, 0.12), inset 0 0 30px rgba(37, 99, 235, 0.05)',
          animation: 'ring-rotate 16s linear infinite',
        }}
      >
        {/* Orbiting Satellite Node */}
        <div
          style={{
            position: 'absolute',
            top: '0%',
            left: '50%',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: 'var(--ezrab-blue)',
            boxShadow: '0 0 16px 4px rgba(37, 99, 235, 0.8)',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>

      {/* Secondary Counter-Rotating Subtle Ring */}
      <div
        style={{
          position: 'absolute',
          width: '95%',
          aspectRatio: '1',
          left: '50%',
          top: '50%',
          borderRadius: '50%',
          border: '1px solid rgba(96, 165, 250, 0.15)',
          transform: 'translate(-50%, -50%) rotateX(72deg)',
          animation: 'ring-rotate-reverse 24s linear infinite',
        }}
      />
    </div>
  );
};
