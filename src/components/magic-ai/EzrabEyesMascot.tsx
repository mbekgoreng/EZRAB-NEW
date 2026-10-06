import React from 'react';
import { EZRABMascot3D } from '../mascot/EZRABMascot3D';
import { EZRABMascotProps, MascotState } from '../mascot/mascot.types';

export type { MascotState } from '../mascot/mascot.types';

export interface EzrabEyesMascotProps extends EZRABMascotProps {}

/**
 * Official EZRAB AI Master 3D Mascot Bridge
 *
 * Points directly to the master real-time 3D WebGL mascot in `src/components/mascot/EZRABMascot3D.tsx`.
 * Provides 3D PBR helmet with official EZ logo, glossy blue body, recessed white face plate,
 * 3D cute glossy eyes with cursor tracking, organic blinking, and atmospheric glow.
 */
export const EzrabEyesMascot: React.FC<EzrabEyesMascotProps> = ({
  size,
  state,
  interactive = true,
  enableEyeTracking = true,
  enableFloating = true,
  enableBlink = true,
  onClick,
  className,
  style,
}) => {
  const isThinking = state === 'thinking' || state === 'processing';
  const numericSize = typeof size === 'number' ? size : size === 'sm' ? 44 : size === 'lg' ? 120 : 64;

  return (
    <EZRABMascot3D
      size={numericSize}
      interactive={interactive}
      enableEyeTracking={enableEyeTracking}
      enableFloat={enableFloating}
      enableBlink={enableBlink}
      isThinking={isThinking}
      onClick={onClick}
      className={className}
      style={style}
    />
  );
};

export const EzrabInteractiveMascot = EzrabEyesMascot;
export default EzrabEyesMascot;
