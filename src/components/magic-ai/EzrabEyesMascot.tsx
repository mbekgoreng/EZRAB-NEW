import React from 'react';
import { EZRABMascotLucu } from '../mascot/EZRABMascotLucu';
import { EZRABMascotProps, MascotState } from '../mascot/mascot.types';

export type { MascotState } from '../mascot/mascot.types';

export interface EzrabEyesMascotProps extends EZRABMascotProps {}

/**
 * EZRAB Mascot Bridge — meneruskan ke maskot kanonis tunggal EZRAB
 * (`EZRABMascotLucu`, vektor) agar rupa maskot sama di semua permukaan.
 * Prop `state` diterima demi kompatibilitas pemanggil; karakter kanonis
 * tidak memiliki varian state terpisah.
 */
export const EzrabEyesMascot: React.FC<EzrabEyesMascotProps> = ({
  size,
  interactive = true,
  enableEyeTracking = true,
  enableFloating = true,
  enableBlink = true,
  onClick,
  className,
  style,
}) => {
  const numericSize = typeof size === 'number' ? size : size === 'sm' ? 44 : size === 'lg' ? 120 : 64;

  return (
    <EZRABMascotLucu
      size={numericSize}
      interactive={interactive}
      enableEyeTracking={enableEyeTracking}
      enableFloat={enableFloating}
      enableBlink={enableBlink}
      onClick={onClick}
      className={className}
      style={style}
    />
  );
};

export const EzrabInteractiveMascot = EzrabEyesMascot;
export default EzrabEyesMascot;
