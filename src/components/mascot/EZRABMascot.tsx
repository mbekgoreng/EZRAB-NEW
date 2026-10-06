import React, { useRef } from 'react';
import {
  MASCOT_VIEW_BOX,
  FACE_PATH_D,
  BODY_OUTLINE_PATH_D,
} from './mascot.constants';
import { EZRABMascotProps } from './mascot.types';
import { useMascotInteraction } from './useMascotInteraction';
import { useEyeTracking } from './useEyeTracking';
import { EZRABMascotEyes } from './EZRABMascotEyes';
import { EZRABMascotBubble } from './EZRABMascotBubble';

/**
 * EZRAB AI — Official Interactive 3D Master Mascot
 *
 * Implements the full 3D visual specifications matching the reference design:
 * - Rounded organic AI companion with dark navy / electric blue outer shell
 * - Concave 3D porcelain white inner face
 * - 3D glossy dark navy eyes with crisp specular highlights and ambient bounce light
 * - Neon cyan floor glow & realistic ambient contact shadow
 * - 60fps cursor eye tracking with spring interpolation & distance decay
 * - Organic blinking engine & 10 expression states
 * - Contextual speech bubble ("Halo! Aku EZRAB AI ✨")
 * - 100% vector fidelity to original CorelDRAW master asset
 */
export const EZRABMascot: React.FC<EZRABMascotProps> = ({
  state = 'idle',
  size = 'md',
  enableEyeTracking = true,
  enableFloating = true,
  enableBlink = false,
  enable3DTilt = true,
  enableGlow = true,
  enableSpeechBubble = false,
  speechBubbleText,
  speechBubbleDuration = 5500,
  interactive = true,
  glowColor = '#2563EB',
  className = '',
  style = {},
  onClick,
  onHoverChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftEyeRef = useRef<SVGGElement>(null);
  const rightEyeRef = useRef<SVGGElement>(null);
  const headGroupRef = useRef<SVGGElement>(null);

  // 1. Mascot State Machine & Interaction
  const {
    effectiveState,
    isBlinking,
    isHovered,
    handleClick,
    handleMouseEnter,
    handleMouseLeave,
  } = useMascotInteraction({
    externalState: state,
    enableBlink,
    interactive,
    onClick,
    onHoverChange,
  });

  // 2. High performance 60fps Eye Tracking
  useEyeTracking({
    containerRef,
    leftEyeRef,
    rightEyeRef,
    headGroupRef,
    state: effectiveState,
    isBlinking,
    enableEyeTracking,
    enable3DTilt,
  });

  // Pixel sizing calculation
  const pixelSize =
    typeof size === 'number'
      ? size
      : size === 'xs'
      ? 42
      : size === 'sm'
      ? 58
      : size === 'md'
      ? 88
      : size === 'lg'
      ? 136
      : 180; // xl

  const isExcited = effectiveState === 'excited' || effectiveState === 'clicked';
  const isHappy = effectiveState === 'happy' || effectiveState === 'success';

  return (
    <div
      ref={containerRef}
      className={`ezrab-3d-mascot-container ${className}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="img"
      aria-label="EZRAB AI 3D Mascot"
      style={{
        width: `${pixelSize}px`,
        height: `${pixelSize}px`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        perspective: '800px',
        ...style,
      }}
    >
      {/* Speech Bubble (when enabled) */}
      {enableSpeechBubble && (
        <EZRABMascotBubble
          customText={speechBubbleText}
          autoHideDuration={speechBubbleDuration}
          isHovered={isHovered}
          onClick={onClick}
        />
      )}

      {/* Ambient Electric Cyan / Blue Floor Glow */}
      {enableGlow && (
        <div
          style={{
            position: 'absolute',
            bottom: '-12%',
            left: '10%',
            right: '10%',
            height: '24%',
            borderRadius: '50%',
            background: `radial-gradient(ellipse at center, #00D2FF 0%, ${glowColor}40 45%, transparent 75%)`,
            filter: 'blur(10px)',
            opacity: isHovered || isExcited ? 0.95 : effectiveState === 'processing' ? 0.85 : 0.65,
            transform: isHovered ? 'scale(1.15)' : 'scale(1)',
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Dynamic Contact Floor Shadow (scales inversely with float height) */}
      <div
        style={{
          position: 'absolute',
          bottom: '-10%',
          left: '15%',
          right: '15%',
          height: '18%',
          borderRadius: '50%',
          backgroundColor: '#020617',
          filter: 'blur(6px)',
          opacity: 0.28,
          animation: enableFloating
            ? 'ezrabMascotShadowPulse 3.8s ease-in-out infinite'
            : undefined,
          pointerEvents: 'none',
        }}
      />

      {/* Floating & Breathing 3D Character Wrapper */}
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: enableFloating
            ? 'ezrabMascotFloat3D 3.8s ease-in-out infinite'
            : undefined,
          transform: isHovered
            ? 'scale(1.06) translateY(-2px)'
            : isExcited
            ? 'scale(1.1) translateY(-4px)'
            : 'scale(1)',
          transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox={MASCOT_VIEW_BOX}
          style={{
            width: '100%',
            height: '100%',
            overflow: 'visible',
            fillRule: 'evenodd',
            clipRule: 'evenodd',
            filter: isHovered
              ? 'drop-shadow(0 16px 32px rgba(3, 3, 82, 0.25)) drop-shadow(0 0 18px rgba(0, 210, 255, 0.35))'
              : 'drop-shadow(0 12px 24px rgba(3, 3, 82, 0.18)) drop-shadow(0 2px 8px rgba(37, 99, 235, 0.15))',
            transition: 'filter 0.3s ease',
          }}
        >
          <defs>
            {/* 1. Deep 3D Shell Multi-Stop Gradient (Sapphire to Deep Navy) */}
            <linearGradient id="mascotShell3dGrad" x1="20%" y1="15%" x2="80%" y2="85%">
              <stop offset="0%" stopColor="#2563EB" />
              <stop offset="28%" stopColor="#1D4ED8" />
              <stop offset="70%" stopColor="#0B1A54" />
              <stop offset="100%" stopColor="#030728" />
            </linearGradient>

            {/* 2. Bevel Specular Sheen (Curved Top-Left Shoulder Highlight) */}
            <linearGradient id="mascotShellBevel" x1="10%" y1="10%" x2="70%" y2="70%">
              <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.85" />
              <stop offset="25%" stopColor="#38BDF8" stopOpacity="0.55" />
              <stop offset="60%" stopColor="#1E40AF" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#0B1A54" stopOpacity="0" />
            </linearGradient>

            {/* 3. Electric Cyan Neon Under-Rim Strip */}
            <linearGradient id="mascotCyanUnderRim" x1="20%" y1="0%" x2="80%" y2="0%">
              <stop offset="0%" stopColor="#00F0FF" stopOpacity="0" />
              <stop offset="25%" stopColor="#00F0FF" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#38BDF8" stopOpacity="1" />
              <stop offset="75%" stopColor="#00F0FF" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
            </linearGradient>

            {/* 4. Recessed Porcelain White Face Plate */}
            <radialGradient id="mascotFacePorcelain" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="65%" stopColor="#FAFCFF" />
              <stop offset="88%" stopColor="#F1F5F9" />
              <stop offset="100%" stopColor="#E2E8F0" />
            </radialGradient>

            {/* 5. 3D Glossy Eye Radial Depth */}
            <radialGradient id="mascotEyeRadialDepth" cx="42%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#0C1B4A" />
              <stop offset="75%" stopColor="#030722" />
              <stop offset="100%" stopColor="#020414" />
            </radialGradient>

            {/* 6. Soft Glow Filter for Neon Accents */}
            <filter id="mascotNeonGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="90" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Master 3D Head Group (undergoes micro-parallax & subtle tilt) */}
          <g ref={headGroupRef}>
            {/* 1. Pure Spotless White Face (No shadows under eyes) */}
            <path
              fill="#FFFFFF"
              d={FACE_PATH_D}
            />

            {/* 2. 3D Glossy Eyes with Highlights & Spring Tracking */}
            <EZRABMascotEyes
              leftEyeRef={leftEyeRef}
              rightEyeRef={rightEyeRef}
              isBlinking={isBlinking}
            />

            {/* 3. 3D Outer Shell Body (Rich Sapphire / Navy Casing) */}
            <path
              fill="url(#mascotShell3dGrad)"
              fillRule="evenodd"
              d={BODY_OUTLINE_PATH_D}
            />

            {/* 4. 3D Shell Bevel Specular Sheen (Glossy Shoulder Highlight) */}
            <path
              fill="url(#mascotShellBevel)"
              opacity="0.75"
              fillRule="evenodd"
              d={BODY_OUTLINE_PATH_D}
            />

            {/* 5. Electric Cyan Under-Rim Light Glow */}
            <ellipse
              cx="9900"
              cy="21650"
              rx="2600"
              ry="140"
              fill="url(#mascotCyanUnderRim)"
              filter="url(#mascotNeonGlow)"
            />

            {/* 6. Cheerful Golden Spark Rays (active on hover, happy, excited) */}
            {(isHovered || isHappy || isExcited) && (
              <g id="mascot-happy-sparks" opacity="0.95">
                <rect x="3600" y="14800" width="800" height="240" rx="120" fill="#F59E0B" transform="rotate(-30 3600 14800)" />
                <rect x="3300" y="15600" width="800" height="240" rx="120" fill="#F59E0B" transform="rotate(-5 3300 15600)" />
                <rect x="3400" y="16400" width="800" height="240" rx="120" fill="#F59E0B" transform="rotate(20 3400 16400)" />
              </g>
            )}
          </g>
        </svg>
      </div>

      {/* Keyframe Styles for Organic Float & Shadow Sync */}
      <style>{`
        @keyframes ezrabMascotFloat3D {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-7px) rotate(1.4deg);
          }
        }

        @keyframes ezrabMascotShadowPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.28;
          }
          50% {
            transform: scale(0.86);
            opacity: 0.16;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ezrab-3d-mascot-container div {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default EZRABMascot;
