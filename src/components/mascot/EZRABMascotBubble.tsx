import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { CONTEXTUAL_GREETINGS } from './mascot.constants';

interface EZRABMascotBubbleProps {
  customText?: string;
  autoHideDuration?: number;
  isHovered?: boolean;
  isVisible?: boolean;
  onDismiss?: () => void;
  onClick?: () => void;
}

export const EZRABMascotBubble: React.FC<EZRABMascotBubbleProps> = ({
  customText,
  autoHideDuration = 5500,
  isHovered = false,
  isVisible = true,
  onDismiss,
  onClick,
}) => {
  const [show, setShow] = useState(isVisible);
  const [message, setMessage] = useState(customText || CONTEXTUAL_GREETINGS.default);

  // Resolve contextual greeting based on current path
  useEffect(() => {
    if (customText) {
      setMessage(customText);
      return;
    }

    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const match = Object.keys(CONTEXTUAL_GREETINGS).find(
        (key) => key !== 'default' && path.includes(key)
      );
      setMessage(match ? CONTEXTUAL_GREETINGS[match] : CONTEXTUAL_GREETINGS.default);
    }
  }, [customText]);

  // Timed auto-dismiss with cooldown
  useEffect(() => {
    if (!autoHideDuration || autoHideDuration <= 0) return;

    const timer = setTimeout(() => {
      setShow(false);
      if (onDismiss) onDismiss();
    }, autoHideDuration);

    return () => clearTimeout(timer);
  }, [autoHideDuration, onDismiss]);

  // Re-show on hover if hovered
  useEffect(() => {
    if (isHovered) {
      setShow(true);
    }
  }, [isHovered]);

  if (!show && !isHovered) return null;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        top: '-58px',
        right: '-16px',
        whiteSpace: 'nowrap',
        backgroundColor: '#FFFFFF',
        color: '#0F172A',
        padding: '8px 14px',
        borderRadius: '16px',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '-0.01em',
        boxShadow: '0 14px 34px -4px rgba(15, 23, 42, 0.22), 0 2px 8px rgba(37, 99, 235, 0.12)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: onClick ? 'pointer' : 'default',
        animation: 'mascotBubbleFloat 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        border: '1px solid rgba(226, 232, 240, 0.9)',
        zIndex: 50,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', lineHeight: '1.25' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>
          {message}
        </span>
      </div>

      <Sparkles size={14} color="#00D2FF" fill="#00D2FF" style={{ flexShrink: 0 }} />

      {/* Pointer arrow pointing down-left toward mascot head */}
      <div
        style={{
          position: 'absolute',
          bottom: '-6px',
          left: '26px',
          width: '12px',
          height: '12px',
          backgroundColor: '#FFFFFF',
          transform: 'rotate(45deg)',
          borderRight: '1px solid rgba(226, 232, 240, 0.9)',
          borderBottom: '1px solid rgba(226, 232, 240, 0.9)',
        }}
      />

      <style>{`
        @keyframes mascotBubbleFloat {
          0% {
            opacity: 0;
            transform: translateY(8px) scale(0.92);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
};
