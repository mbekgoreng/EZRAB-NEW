import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronUp } from 'lucide-react';
import { MascotGlow, EZRABMascotLucu } from '../mascot';

interface EzrabCoAssistantLauncherProps {
  onClick: () => void;
  isOpen: boolean;
  hasActiveContext?: boolean;
}

/**
 * Interactive Floating EZRAB Co Assistant Launcher
 *
 * Features:
 * - Powered by the official EZRAB Mascot Lucu vector graphic.
 * - Interactive 60fps eye tracking following the cursor across the screen.
 * - Natural organic blinking & autonomous curious gaze.
 * - Proximity detection: displays "EZRAB AI ASISSTANT" badge when cursor moves towards bottom-right,
 *   with smooth automatic hide after 2.6s or on cursor exit.
 * - Hide / Minimize capability: user can dismiss the mascot via subtle '×' button, with sleek
 *   unhide pill tab to restore anytime.
 * - Physics-based cursor spring tether: smooth lag, chase, subtle tilt, and settle.
 * - Global shortcut: ⌘J / Ctrl+J.
 * - Context indicator: pulsing green live dot when active context is available.
 */
export const EzrabCoAssistantLauncher: React.FC<EzrabCoAssistantLauncherProps> = ({
  onClick,
  isOpen,
  hasActiveContext = true,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [isLabelVisible, setIsLabelVisible] = useState(false);
  const [isMascotHidden, setIsMascotHidden] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('ezrab_assistant_launcher_hidden') === 'true';
      } catch {
        return false;
      }
    }
    return false;
  });

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') return window.innerWidth < 768;
    return false;
  });

  const anchorRef = useRef<HTMLDivElement>(null);
  const mascotWrapperRef = useRef<HTMLDivElement>(null);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isApproachingRef = useRef(false);

  // Physics state for spring chase
  const physicsRef = useRef({
    posX: 0,
    posY: 0,
    velX: 0,
    velY: 0,
    targetX: 0,
    targetY: 0,
  });
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsMac(/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || ''));
    }
  }, []);

  // Global Keyboard Shortcut: Cmd+J or Ctrl+J to open/close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        if (isMascotHidden) {
          setIsMascotHidden(false);
          try {
            localStorage.removeItem('ezrab_assistant_launcher_hidden');
          } catch {
            // ignore
          }
        }
        onClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClick, isMascotHidden]);

  // Spring Chase Physics & Proximity Detection Loop
  useEffect(() => {
    if (isOpen || isMobile || isMascotHidden) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const handlePointerMove = (e: PointerEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };

      // Proximity detection for "EZRAB AI ASISSTANT" text badge
      if (anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        const anchorCenterX = rect.left + rect.width / 2;
        const anchorCenterY = rect.top + rect.height / 2;
        const dx = e.clientX - anchorCenterX;
        const dy = e.clientY - anchorCenterY;
        const dist = Math.hypot(dx, dy);

        // When cursor approaches the bottom-right mascot (< 280px)
        if (dist < 280) {
          if (!isApproachingRef.current) {
            isApproachingRef.current = true;
            setIsLabelVisible(true);

            // Auto-hide after 2.6 seconds of cursor presence
            if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
            autoHideTimerRef.current = setTimeout(() => {
              setIsLabelVisible(false);
            }, 2600);
          }
        } else if (dist > 320) {
          if (isApproachingRef.current) {
            isApproachingRef.current = false;
            setIsLabelVisible(false);
            if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
          }
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    if (prefersReducedMotion) {
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
      };
    }

    const updatePhysics = () => {
      if (anchorRef.current && mascotWrapperRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        const anchorCenterX = rect.left + rect.width / 2;
        const anchorCenterY = rect.top + rect.height / 2;

        let targetX = 0;
        let targetY = 0;

        if (mousePosRef.current) {
          const dx = mousePosRef.current.x - anchorCenterX;
          const dy = mousePosRef.current.y - anchorCenterY;
          const dist = Math.hypot(dx, dy);

          // Tethered spring pull towards cursor, clamped to max 34px
          const maxTether = 34;
          if (dist > 0) {
            const pullFactor = 0.055;
            const unclampedX = dx * pullFactor;
            const unclampedY = dy * pullFactor;
            const pullDist = Math.hypot(unclampedX, unclampedY);
            if (pullDist > maxTether) {
              targetX = (unclampedX / pullDist) * maxTether;
              targetY = (unclampedY / pullDist) * maxTether;
            } else {
              targetX = unclampedX;
              targetY = unclampedY;
            }
          }
        }

        const p = physicsRef.current;
        p.targetX = targetX;
        p.targetY = targetY;

        // Spring acceleration & damping
        const stiffness = 0.085;
        const damping = 0.82;
        const forceX = (p.targetX - p.posX) * stiffness;
        const forceY = (p.targetY - p.posY) * stiffness;

        p.velX = (p.velX + forceX) * damping;
        p.velY = (p.velY + forceY) * damping;
        p.posX += p.velX;
        p.posY += p.velY;

        // Subtle tilt corresponding to movement velocity
        const tilt = Math.max(-10, Math.min(10, p.velX * 1.4));

        mascotWrapperRef.current.style.transform =
          `translate3d(${p.posX.toFixed(2)}px, ${p.posY.toFixed(2)}px, 0) ` +
          `rotate(${tilt.toFixed(2)}deg)`;
      }

      rafIdRef.current = requestAnimationFrame(updatePhysics);
    };

    rafIdRef.current = requestAnimationFrame(updatePhysics);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
      }
    };
  }, [isOpen, isMobile, isMascotHidden]);

  // Click Handler: opening chatbox
  const handleClick = useCallback(() => {
    onClick();
  }, [onClick]);

  // Hide mascot handler
  const handleHideMascot = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMascotHidden(true);
    setIsLabelVisible(false);
    try {
      localStorage.setItem('ezrab_assistant_launcher_hidden', 'true');
    } catch {
      // ignore
    }
  }, []);

  // Restore/unhide mascot handler
  const handleUnhideMascot = useCallback(() => {
    setIsMascotHidden(false);
    try {
      localStorage.removeItem('ezrab_assistant_launcher_hidden');
    } catch {
      // ignore
    }
  }, []);

  if (isOpen) return null;

  // Unhide mini pill button when user has chosen to hide the mascot
  if (isMascotHidden) {
    return (
      <button
        type="button"
        onClick={handleUnhideMascot}
        className="ezrab-unhide-pill"
        title="Tampilkan EZRAB AI Assistant (⌘J / Ctrl+J)"
        aria-label="Tampilkan EZRAB AI Assistant"
        style={{
          position: 'fixed',
          bottom: isMobile ? 'calc(76px + var(--ezrab-safe-bottom, 0px))' : '22px',
          right: isMobile ? '16px' : '24px',
          zIndex: 9990,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '7px',
          padding: '8px 14px',
          borderRadius: '9999px',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 58, 138, 0.95) 100%)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(59, 130, 246, 0.45)',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35), 0 0 14px rgba(37, 99, 235, 0.32)',
          color: '#FFFFFF',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <span style={{ fontSize: '14px', lineHeight: 1 }}>🤖</span>
        <span
          style={{
            background: 'linear-gradient(90deg, #60A5FA 0%, #93C5FD 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          EZRAB AI
        </span>
        <ChevronUp size={13} style={{ color: '#93C5FD' }} />
      </button>
    );
  }

  const mascotPixelSize = isMobile ? 80 : 92;

  return (
    <div
      ref={anchorRef}
      style={{
        position: 'fixed',
        bottom: isMobile ? 'calc(76px + var(--ezrab-safe-bottom, 0px))' : '24px',
        right: isMobile ? '16px' : '24px',
        zIndex: 9990,
      }}
    >
      {/* "EZRAB AI ASISSTANT" Text Badge on Cursor Approach with Auto-Hide */}
      <div
        className="ezrab-assistant-tooltip"
        style={{
          position: 'absolute',
          right: `${mascotPixelSize + 16}px`,
          top: '50%',
          transform: `translateY(-50%) ${
            isLabelVisible ? 'translateX(0px) scale(1)' : 'translateX(12px) scale(0.92)'
          }`,
          opacity: isLabelVisible ? 1 : 0,
          pointerEvents: 'none',
          transition:
            'opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
          whiteSpace: 'nowrap',
          zIndex: 10,
        }}
      >
        <div
          style={{
            background:
              'linear-gradient(135deg, rgba(10, 25, 47, 0.95) 0%, rgba(15, 30, 65, 0.95) 100%)',
            backdropFilter: 'blur(12px)',
            color: '#FFFFFF',
            padding: '7px 14px',
            borderRadius: '24px',
            border: '1px solid rgba(59, 130, 246, 0.45)',
            boxShadow:
              '0 8px 24px rgba(0, 0, 0, 0.38), 0 0 16px rgba(37, 99, 235, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              animation: 'ezrabSparkleRotate 2.6s ease-in-out infinite',
            }}
          >
            ✨
          </span>
          <span
            style={{
              background:
                'linear-gradient(90deg, #60A5FA 0%, #93C5FD 50%, #FFFFFF 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            EZRAB AI ASISSTANT
          </span>
          <span
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              padding: '2px 6px',
              borderRadius: '8px',
              fontSize: '9px',
              fontWeight: 600,
              color: '#93C5FD',
              marginLeft: '2px',
            }}
          >
            {isMac ? '⌘J' : 'Ctrl+J'}
          </span>
        </div>
      </div>

      {/* Spring Tether Wrapper */}
      <div
        ref={mascotWrapperRef}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          willChange: 'transform',
          position: 'relative',
        }}
      >
        {/* Hide / Dismiss Button ('×') on Mascot Corner */}
        <button
          type="button"
          onClick={handleHideMascot}
          title="Sembunyikan Assistant"
          aria-label="Sembunyikan EZRAB AI Assistant"
          style={{
            position: 'absolute',
            top: '-2px',
            right: '-2px',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            backgroundColor: '#0F172A',
            border: '1px solid rgba(255, 255, 255, 0.28)',
            color: '#94A3B8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            opacity: isHovered ? 1 : 0,
            transform: isHovered ? 'scale(1)' : 'scale(0.65)',
            transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 30,
            boxShadow: '0 3px 10px rgba(0, 0, 0, 0.45)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#FFFFFF';
            e.currentTarget.style.backgroundColor = '#EF4444';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#94A3B8';
            e.currentTarget.style.backgroundColor = '#0F172A';
          }}
        >
          <X size={12} strokeWidth={2.5} />
        </button>

        {/* Mascot Interactive Button */}
        <button
          type="button"
          onClick={handleClick}
          onMouseEnter={() => {
            setIsHovered(true);
            setIsLabelVisible(true);
            if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
            autoHideTimerRef.current = setTimeout(() => {
              setIsLabelVisible(false);
            }, 2600);
          }}
          onMouseLeave={() => {
            setIsHovered(false);
            if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
            autoHideTimerRef.current = setTimeout(() => {
              setIsLabelVisible(false);
            }, 400);
          }}
          aria-label="Buka EZRAB AI Assistant"
          title="Buka EZRAB AI Assistant (⌘J)"
          className="ezrab-touch-target"
          style={{
            width: `${mascotPixelSize + 10}px`,
            height: `${mascotPixelSize + 10}px`,
            borderRadius: '50%',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0',
            overflow: 'visible',
            position: 'relative',
            transform: isHovered ? 'scale(1.07)' : 'scale(1)',
            transition: 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Soft blue atmospheric glow behind mascot */}
          <MascotGlow size={mascotPixelSize * 1.35} intensity={0.92} />

          {/* EZRAB Mascot Lucu with real-time 60fps eye tracking, blinking & float */}
          <div
            style={{
              width: `${mascotPixelSize}px`,
              height: `${mascotPixelSize}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              filter: 'drop-shadow(0 10px 22px rgba(37, 99, 235, 0.35))',
            }}
          >
            <EZRABMascotLucu
              size={mascotPixelSize}
              enableEyeTracking={true}
              enableBlink={true}
              enableFloat={true}
              interactive={false}
            />
          </div>

          {/* Active context / live pulse dot */}
          {hasActiveContext && (
            <span
              style={{
                position: 'absolute',
                bottom: '4px',
                right: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '15px',
                height: '15px',
                pointerEvents: 'none',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  backgroundColor: '#10B981',
                  opacity: 0.75,
                  animation: 'ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite',
                }}
              />
              <span
                style={{
                  position: 'relative',
                  width: '11px',
                  height: '11px',
                  borderRadius: '50%',
                  backgroundColor: '#10B981',
                  border: '2px solid #FFFFFF',
                  boxShadow: '0 0 8px rgba(16, 185, 129, 0.95)',
                }}
              />
            </span>
          )}
        </button>
      </div>

      <style>{`
        @keyframes ezrabSparkleRotate {
          0%, 100% {
            transform: scale(1) rotate(0deg);
          }
          50% {
            transform: scale(1.22) rotate(15deg);
          }
        }
      `}</style>
    </div>
  );
};
