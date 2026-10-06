import React from 'react';

export type MascotExpression =
  | 'normal'
  | 'blink'
  | 'happy'
  | 'curious'
  | 'thinking'
  | 'processing'
  | 'surprised'
  | 'excited'
  | 'sleepy'
  | 'mata_lurus'
  | 'error'
  | 'success'
  | 'idle'
  | 'reading'
  | 'warning'
  | 'clicked';

export type MascotState = MascotExpression;

export type MascotVariant = 'dashboard' | 'chatbot' | 'magic-ai' | 'floating' | 'avatar' | 'compact';

export type MascotSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

export interface MascotDimensions {
  pixelSize: number;
  maxEyeOffsetX: number;
  maxEyeOffsetY: number;
}

export interface EZRABMascotProps {
  state?: MascotState;
  size?: MascotSize;
  enableEyeTracking?: boolean;
  enableFloating?: boolean;
  enableBlink?: boolean;
  enable3DTilt?: boolean;
  enableGlow?: boolean;
  enableSpeechBubble?: boolean;
  speechBubbleText?: string;
  speechBubbleDuration?: number;
  interactive?: boolean;
  glowColor?: string;
  showMouth?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  onHoverChange?: (isHovered: boolean) => void;
}
