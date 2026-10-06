import React from 'react';
import HeroComponent from '../Hero';

export interface HeroProps {
  onStartFree?: () => void;
  onOpenDemo?: () => void;
}

export const Hero: React.FC<HeroProps> = (props) => {
  return <HeroComponent {...props} />;
};

export default Hero;
