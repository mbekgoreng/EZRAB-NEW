import React from 'react';

interface LogoProps {
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  height?: number;
  showSubtitle?: boolean;
  subtitleText?: string;
}

export const Logo: React.FC<LogoProps> = ({
  onClick,
  className,
  style,
  height = 36,
  showSubtitle = true,
  subtitleText = 'Build Better, Estimate Smarter',
}) => {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`ezrab-logo-container ${className || ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        textDecoration: 'none',
        ...style,
      }}
    >
      <img
        src="/images/ezrab-logo.png"
        alt="EZRAB"
        style={{
          height: `${height}px`,
          width: 'auto',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </div>
  );
};
