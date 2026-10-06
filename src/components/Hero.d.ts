import React from 'react';

export interface HeroProps {
  onStartFree?: () => void;
  onOpenDemo?: () => void;
}

export const Hero: React.FC<HeroProps>;
export default Hero;
