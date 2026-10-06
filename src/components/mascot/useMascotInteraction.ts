import { useState, useEffect, useRef, useCallback } from 'react';
import { MascotState } from './mascot.types';

interface UseMascotInteractionOptions {
  externalState?: MascotState;
  enableBlink?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  onHoverChange?: (isHovered: boolean) => void;
}

export function useMascotInteraction({
  externalState = 'idle',
  enableBlink = true,
  interactive = true,
  onClick,
  onHoverChange,
}: UseMascotInteractionOptions) {
  const [effectiveState, setEffectiveState] = useState<MascotState>(externalState);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isClickingRef = useRef(false);

  // Sync with external state changes (priority overriding)
  useEffect(() => {
    if (!isClickingRef.current) {
      setEffectiveState(externalState);
    }
  }, [externalState]);

  // 1. Blinking disabled per user request ("cukup eye tracking saja, tidak usah kedip dll")
  useEffect(() => {
    setIsBlinking(false);
  }, []);

  // 2. Direct Click Handler without blinking
  const handleClick = useCallback(() => {
    if (!interactive) return;
    if (onClick) {
      onClick();
    }
  }, [interactive, onClick]);

  // 3. Hover Handlers
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (onHoverChange) onHoverChange(true);
    if (externalState === 'idle') {
      setEffectiveState('curious');
    }
  }, [onHoverChange, externalState]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    if (onHoverChange) onHoverChange(false);
    if (!isClickingRef.current) {
      setEffectiveState(externalState);
    }
  }, [onHoverChange, externalState]);

  return {
    effectiveState,
    isBlinking,
    isHovered,
    handleClick,
    handleMouseEnter,
    handleMouseLeave,
  };
}
