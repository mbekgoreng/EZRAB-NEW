import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { BlueprintLayer } from './BlueprintLayer';
import { Building3DLayer } from './Building3DLayer';
import { EnergyRingLayer } from './EnergyRingLayer';
import { FloatingCards } from './FloatingCards';
import { MeasurementTags } from './MeasurementTags';

export const InteractiveHeroVisual: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const stage = stageRef.current;
    if (!container || !stage) return;

    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;

      // Restrained micro-parallax: Max 12px translation and 3.5deg subtle tilt
      const targetX = (x / (rect.width / 2)) * 12;
      const targetY = (y / (rect.height / 2)) * 12;
      const rotateY = (x / (rect.width / 2)) * 3.5;
      const rotateX = -(y / (rect.height / 2)) * 3.5;

      gsap.to(stage, {
        x: targetX,
        y: targetY,
        rotationX: rotateX,
        rotationY: rotateY,
        duration: 1.2,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    };

    const handleMouseLeave = () => {
      gsap.to(stage, {
        x: 0,
        y: 0,
        rotationX: 0,
        rotationY: 0,
        duration: 1.5,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '620px',
        height: '100%',
        perspective: '1400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={stageRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          minHeight: '580px',
        }}
      >
        {/* Layer 1: Blueprint Drift Background */}
        <BlueprintLayer />

        {/* Layer 2: 3D Orbital Energy Rings */}
        <EnergyRingLayer />

        {/* Layer 3: Modern 3D Architectural Villa Model with Laser Scanline */}
        <Building3DLayer />

        {/* Layer 4: Technical Architectural Measurement Callouts */}
        <MeasurementTags />

        {/* Layer 5: Independent Floating Cards (AI, Total RAB, Progress, Spreadsheet, Badge) */}
        <FloatingCards />
      </div>
    </div>
  );
};
