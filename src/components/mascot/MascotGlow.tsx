import React from 'react';

export interface MascotGlowProps {
  size?: number | string;
  intensity?: number;
  className?: string;
}

/**
 * EZRAB Soft Blue Atmospheric Glow
 *
 * Implements a calm, premium dual-layer radial blue glow behind the EZRAB 3D mascot.
 * Characteristics:
 * - Diffuse, large, subtle, low contrast
 * - 2 layers: large soft blue aura + smaller concentrated light core
 * - Static atmospheric light with very subtle breathing (opacity 0.85 -> 1.0 -> 0.85)
 * - Purely atmospheric, pointer-events: none, strictly behind mascot
 */
export const MascotGlow: React.FC<MascotGlowProps> = ({
  size = 320,
  intensity = 1.0,
  className = '',
}) => {
  const sizeStyle = typeof size === 'number' ? `${size}px` : size;

  return (
    <div
      className={`mascot-atmospheric-glow ${className}`}
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: sizeStyle,
        height: sizeStyle,
        pointerEvents: 'none',
        zIndex: 0,
        userSelect: 'none',
      }}
    >
      {/* Inline styles for keyframe breathing animation */}
      <style>{`
        @keyframes mascotAtmosphereGlowPrimary {
          0%, 100% {
            opacity: ${0.82 * intensity};
            transform: scale(0.98);
          }
          50% {
            opacity: ${1.0 * intensity};
            transform: scale(1.03);
          }
        }
        @keyframes mascotAtmosphereGlowSecondary {
          0%, 100% {
            opacity: ${0.78 * intensity};
            transform: scale(1.02);
          }
          50% {
            opacity: ${0.96 * intensity};
            transform: scale(0.98);
          }
        }
      `}</style>

      {/* Layer 1: Large soft blue diffuse atmospheric aura */}
      <div
        className="mascot-glow-primary"
        style={{
          position: 'absolute',
          inset: '-15%',
          borderRadius: '50%',
          background: 'radial-gradient(circle at center, rgba(59, 130, 246, 0.18) 0%, rgba(96, 165, 250, 0.08) 40%, rgba(255, 255, 255, 0) 72%)',
          animation: 'mascotAtmosphereGlowPrimary 6.8s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />

      {/* Layer 2: Smaller concentrated light core behind mascot */}
      <div
        className="mascot-glow-secondary"
        style={{
          position: 'absolute',
          inset: '8%',
          borderRadius: '50%',
          background: 'radial-gradient(circle at center, rgba(37, 99, 235, 0.14) 0%, rgba(147, 197, 253, 0.06) 48%, rgba(255, 255, 255, 0) 75%)',
          animation: 'mascotAtmosphereGlowSecondary 5.4s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
