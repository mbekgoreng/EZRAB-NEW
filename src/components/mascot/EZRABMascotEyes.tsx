import React from 'react';
import { LEFT_EYE_PATH_D, RIGHT_EYE_PATH_D, LEFT_EYE_CX, LEFT_EYE_CY, RIGHT_EYE_CX, RIGHT_EYE_CY } from './mascot.constants';

interface EZRABMascotEyesProps {
  leftEyeRef: React.RefObject<SVGGElement | null>;
  rightEyeRef: React.RefObject<SVGGElement | null>;
  isBlinking?: boolean;
}

export const EZRABMascotEyes: React.FC<EZRABMascotEyesProps> = ({
  leftEyeRef,
  rightEyeRef,
  isBlinking = false,
}) => {
  return (
    <>
      {/* 3D Left Eye */}
      <g
        ref={leftEyeRef}
        id="ezrab-mascot-left-eye"
        style={{
          transformOrigin: `${LEFT_EYE_CX}px ${LEFT_EYE_CY}px`,
          transition: isBlinking ? 'transform 0.08s ease-in-out' : 'none',
        }}
      >
        {/* Base Eye Dome with Deep 3D Radial Gradient */}
        <path
          fill="url(#mascotEyeRadialDepth)"
          d={LEFT_EYE_PATH_D}
        />
        {/* Primary Specular Highlight (Upper-Right Sparkle) */}
        <circle cx="10100" cy="15920" r="300" fill="#FFFFFF" opacity="0.95" />
      </g>

      {/* 3D Right Eye */}
      <g
        ref={rightEyeRef}
        id="ezrab-mascot-right-eye"
        style={{
          transformOrigin: `${RIGHT_EYE_CX}px ${RIGHT_EYE_CY}px`,
        }}
      >
        {/* Base Eye Dome with Deep 3D Radial Gradient */}
        <path
          fill="url(#mascotEyeRadialDepth)"
          d={RIGHT_EYE_PATH_D}
        />
        {/* Primary Specular Highlight (Upper-Right Sparkle) */}
        <circle cx="12720" cy="16060" r="300" fill="#FFFFFF" opacity="0.95" />
      </g>
    </>
  );
};
