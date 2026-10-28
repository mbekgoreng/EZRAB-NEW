import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, useScroll, useTransform, useSpring, useReducedMotion } from 'framer-motion';
import { Sparkles, Database, FileSpreadsheet, CheckCircle2, Cpu, ArrowUpRight } from 'lucide-react';

interface DrawingsToDecisionsSectionProps {
  id?: string;
  className?: string;
}

export const DrawingsToDecisionsSection: React.FC<DrawingsToDecisionsSectionProps> = ({
  id = 'statement',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  // Mouse interaction for subtle cursor parallax
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let rafId: number;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    // Only push mouse-parallax state while the section is near the viewport,
    // so the 60fps loop never triggers re-renders while it is off-screen.
    let sectionNearViewport = true;

    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      targetX = (e.clientX / innerWidth - 0.5) * 2; // -1 to 1
      targetY = (e.clientY / innerHeight - 0.5) * 2;
    };

    const animateMouse = () => {
      currentX += (targetX - currentX) * 0.06;
      currentY += (targetY - currentY) * 0.06;
      if (sectionNearViewport) {
        setMousePos({ x: currentX, y: currentY });
      }
      rafId = requestAnimationFrame(animateMouse);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    rafId = requestAnimationFrame(animateMouse);

    const io = new IntersectionObserver(
      ([entry]) => {
        sectionNearViewport = entry ? entry.isIntersecting : true;
      },
      { rootMargin: '200px 0px' },
    );
    if (containerRef.current) io.observe(containerRef.current);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      io.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Scroll Progress within this section [0, 1]
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 24,
    restDelta: 0.001,
  });

  // Kinetic Typography Transforms
  // Line 1: FROM DRAWINGS subtly moves up and separates
  const line1Y = useTransform(smoothProgress, [0, 0.35, 0.7, 1], [0, -8, -24, -40]);
  const line1Opacity = useTransform(smoothProgress, [0, 0.65, 0.9, 1], [1, 1, 0.75, 0.4]);
  const line1Tracking = useTransform(smoothProgress, [0, 0.7, 1], ['-0.045em', '-0.035em', '-0.02em']);

  // Line 2: TO DECISIONS moves forward, scales up, intensifies in electric blue
  const line2Y = useTransform(smoothProgress, [0, 0.35, 0.7, 1], [0, 6, 12, 18]);
  const line2Scale = useTransform(smoothProgress, [0, 0.5, 0.85, 1], [1, 1.02, 1.06, 1.08]);
  const line2Glow = useTransform(
    smoothProgress,
    [0, 0.5, 0.8, 1],
    [
      '0 0 0px rgba(0, 168, 255, 0)',
      '0 0 25px rgba(0, 168, 255, 0.2)',
      '0 0 50px rgba(0, 168, 255, 0.35)',
      '0 0 65px rgba(0, 168, 255, 0.45)',
    ]
  );

  // Label & Stamp
  const brandOpacity = useTransform(smoothProgress, [0, 0.3, 0.8, 1], [0.8, 1, 0.9, 0.6]);
  const brandSpacing = useTransform(smoothProgress, [0, 0.7, 1], ['0.24em', '0.32em', '0.36em']);

  // Building & Blueprint Assembly Stages
  // 1. Grid & Base Axis Lines (0.0 -> 0.3)
  const gridPathLength = useTransform(smoothProgress, [0, 0.35], [0.15, 1]);
  const gridOpacity = useTransform(smoothProgress, [0, 0.2, 0.8, 1], [0.4, 0.85, 0.85, 0.3]);

  // 2. Structural Columns & Slabs (0.2 -> 0.55)
  const structureLength = useTransform(smoothProgress, [0.15, 0.6], [0, 1]);
  const structureOpacity = useTransform(smoothProgress, [0.1, 0.25, 0.85, 1], [0, 1, 1, 0.45]);

  // 3. Walls, Enclosure & BIM Model (0.4 -> 0.8)
  const enclosureLength = useTransform(smoothProgress, [0.35, 0.8], [0, 1]);
  const enclosureOpacity = useTransform(smoothProgress, [0.3, 0.45, 0.9, 1], [0, 1, 1, 0.5]);

  // 4. Dimensions & Engineering Data Tags (0.5 -> 0.9)
  const dataTagsOpacity = useTransform(smoothProgress, [0.45, 0.65, 0.9, 1], [0, 1, 1, 0.3]);
  const dataPulseY = useTransform(smoothProgress, [0.3, 0.95], ['-10%', '110%']);

  // Dynamic parallax offset based on cursor
  const mouseParallaxX = mousePos.x * 12;
  const mouseParallaxY = mousePos.y * 10;
  const mouseGridX = mousePos.x * 6;
  const mouseGridY = mousePos.y * 5;

  return (
    <div
      ref={containerRef}
      id={id}
      className={`ez-drawings-decisions-scroll-track ${className}`}
      style={{
        position: 'relative',
        minHeight: prefersReduced ? 'auto' : '160vh',
        background: '#f8fafc',
      }}
    >
      {/* Sticky Cinematic Viewport */}
      <div
        className="ez-drawings-decisions-viewport"
        style={{
          position: prefersReduced ? 'relative' : 'sticky',
          top: 0,
          left: 0,
          width: '100%',
          minHeight: '100vh',
          height: prefersReduced ? 'auto' : '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          background: 'radial-gradient(ellipse at 50% 45%, #ffffff 0%, #f8fafc 65%, #f1f5f9 100%)',
          color: '#0f172a',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* ===================================================================
            LAYER 1: Precision Architectural Grid & Blueprint Compass
            =================================================================== */}
        <div
          className="ez-blueprint-grid-canvas"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            transform: `translate3d(${mouseGridX}px, ${mouseGridY}px, 0)`,
            transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: 0.85,
          }}
        >
          {/* Subtle Coordinate Blueprint Grid */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `
                linear-gradient(to right, rgba(37, 99, 235, 0.05) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(37, 99, 235, 0.05) 1px, transparent 1px),
                linear-gradient(to right, rgba(37, 99, 235, 0.12) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(37, 99, 235, 0.12) 1px, transparent 1px)
              `,
              backgroundSize: '24px 24px, 24px 24px, 120px 120px, 120px 120px',
              opacity: 0.65,
            }}
          />

          {/* Technical Corner Crosshairs */}
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            viewBox="0 0 1440 900"
            preserveAspectRatio="none"
          >
            {/* Top Left Precision Origin Marker */}
            <path d="M 48,36 L 48,60 M 36,48 L 60,48" stroke="rgba(37, 99, 235, 0.35)" strokeWidth="1" />
            <text x="68" y="52" fill="rgba(37, 99, 235, 0.45)" fontSize="10" fontFamily="monospace" letterSpacing="0.1em">
              ORIGIN [0, 0] • SCALE 1:100
            </text>

            {/* Top Right Project Coordinate Marker */}
            <path d="M 1392,36 L 1392,60 M 1380,48 L 1404,48" stroke="rgba(37, 99, 235, 0.35)" strokeWidth="1" />
            <text x="1270" y="52" fill="rgba(37, 99, 235, 0.45)" fontSize="10" fontFamily="monospace" letterSpacing="0.1em">
              BIM REVISION 2026.04
            </text>

            {/* Bottom Left Elevation Marker */}
            <path d="M 48,852 L 48,876 M 36,864 L 60,864" stroke="rgba(37, 99, 235, 0.35)" strokeWidth="1" />
            <text x="68" y="868" fill="rgba(37, 99, 235, 0.45)" fontSize="10" fontFamily="monospace" letterSpacing="0.1em">
              DATUM LEVEL: +0.000 FFL
            </text>

            {/* Bottom Right System Metric */}
            <path d="M 1392,852 L 1392,876 M 1380,864 L 1404,864" stroke="rgba(37, 99, 235, 0.35)" strokeWidth="1" />
            <text x="1260" y="868" fill="rgba(37, 99, 235, 0.45)" fontSize="10" fontFamily="monospace" letterSpacing="0.1em">
              DECISION ACCURACY 99.8%
            </text>
          </svg>
        </div>

        {/* ===================================================================
            LAYER 2: Isometric BIM Architectural Wireframe (Scroll-Driven Assemble)
            =================================================================== */}
        <motion.div
          className="ez-bim-wireframe-layer"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            transform: `translate3d(${mouseParallaxX}px, ${mouseParallaxY}px, 0)`,
            transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <svg
            className="ez-bim-isometric-svg"
            viewBox="0 0 1200 800"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              width: '100%',
              maxWidth: '1280px',
              height: 'auto',
              maxHeight: '92vh',
              overflow: 'visible',
            }}
          >
            <defs>
              {/* Electric Blue Laser Gradient */}
              <linearGradient id="ezLaserGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0066FF" stopOpacity="0.9" />
                <stop offset="50%" stopColor="#00A8FF" stopOpacity="1" />
                <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.8" />
              </linearGradient>

              {/* Blueprint Ghost Line Gradient */}
              <linearGradient id="ezBlueprintGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#94A3B8" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.2" />
              </linearGradient>

              {/* Glowing Pulse Filter */}
              <filter id="ezGlowFilter" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* ---------------------------------------------------------------
                PHASE 1: Foundation Axis & Ground Grid (Iso Plane)
                --------------------------------------------------------------- */}
            <motion.g style={{ opacity: gridOpacity }}>
              {/* Isometric Ground Grid Lines */}
              <path
                d="
                  M 250,540 L 600,720 L 950,540 L 600,360 Z
                  M 320,505 L 670,685
                  M 390,470 L 740,650
                  M 460,435 L 810,615
                  M 530,400 L 880,580
                  M 320,575 L 670,395
                  M 390,610 L 740,430
                  M 460,645 L 810,465
                  M 530,680 L 880,500
                "
                stroke="rgba(37, 99, 235, 0.18)"
                strokeWidth="0.75"
                strokeDasharray="4 4"
              />

              {/* Inward Horizon Extension Construction Rays */}
              <motion.line
                x1="80"
                y1="140"
                x2="450"
                y2="340"
                stroke="#00A8FF"
                strokeWidth="1"
                strokeDasharray="5 5"
                strokeOpacity="0.35"
                style={{ pathLength: gridPathLength }}
              />
              <motion.line
                x1="1120"
                y1="140"
                x2="750"
                y2="340"
                stroke="#00A8FF"
                strokeWidth="1"
                strokeDasharray="5 5"
                strokeOpacity="0.35"
                style={{ pathLength: gridPathLength }}
              />
              <motion.line
                x1="80"
                y1="680"
                x2="450"
                y2="540"
                stroke="#00A8FF"
                strokeWidth="1"
                strokeDasharray="5 5"
                strokeOpacity="0.35"
                style={{ pathLength: gridPathLength }}
              />
              <motion.line
                x1="1120"
                y1="680"
                x2="750"
                y2="540"
                stroke="#00A8FF"
                strokeWidth="1"
                strokeDasharray="5 5"
                strokeOpacity="0.35"
                style={{ pathLength: gridPathLength }}
              />

              {/* Grid Axis Labels */}
              <text x="235" y="545" fill="rgba(37, 99, 235, 0.5)" fontSize="9" fontFamily="monospace">GRID A</text>
              <text x="600" y="735" fill="rgba(37, 99, 235, 0.5)" fontSize="9" fontFamily="monospace" textAnchor="middle">GRID B</text>
              <text x="960" y="545" fill="rgba(37, 99, 235, 0.5)" fontSize="9" fontFamily="monospace">GRID C</text>
            </motion.g>

            {/* ---------------------------------------------------------------
                PHASE 2: Structural Columns, Footings & Floor Slabs (BIM Level 1)
                --------------------------------------------------------------- */}
            <motion.g style={{ opacity: structureOpacity }}>
              {/* Foundation Footing Pads (Level -0.80) */}
              <path
                d="
                  M 390,560 L 430,580 L 410,590 L 370,570 Z
                  M 580,660 L 620,680 L 600,690 L 560,670 Z
                  M 770,560 L 810,580 L 790,590 L 750,570 Z
                  M 580,450 L 620,470 L 600,480 L 560,460 Z
                "
                stroke="#2563EB"
                strokeWidth="1.2"
                strokeOpacity="0.4"
                fill="rgba(37, 99, 235, 0.03)"
              />

              {/* Structural Vertical Columns (Level +0.00 to +3.60) */}
              <motion.path
                d="
                  M 390,560 L 390,410
                  M 430,580 L 430,430
                  M 580,660 L 580,510
                  M 620,680 L 620,530
                  M 770,560 L 770,410
                  M 810,580 L 810,430
                  M 580,450 L 580,300
                  M 620,470 L 620,320
                "
                stroke="url(#ezLaserGrad)"
                strokeWidth="1.6"
                style={{ pathLength: structureLength }}
              />

              {/* Ground Floor Slab & Perimeter Beams */}
              <motion.path
                d="
                  M 350,530 L 600,660 L 850,530 L 600,400 Z
                  M 350,538 L 600,668 L 850,538
                  M 350,530 L 350,538
                  M 600,660 L 600,668
                  M 850,530 L 850,538
                "
                stroke="#1E40AF"
                strokeWidth="1.4"
                strokeOpacity="0.6"
                fill="rgba(37, 99, 235, 0.04)"
                style={{ pathLength: structureLength }}
              />
            </motion.g>

            {/* ---------------------------------------------------------------
                PHASE 3: Architectural Cantilever, Second Floor & Roof (BIM Level 2)
                --------------------------------------------------------------- */}
            <motion.g style={{ opacity: enclosureOpacity }}>
              {/* Second Floor Slab (Level +3.60) with Cantilever Balcony */}
              <motion.path
                d="
                  M 320,410 L 600,560 L 880,410 L 600,260 Z
                  M 320,418 L 600,568 L 880,418
                  M 320,410 L 320,418
                  M 600,560 L 600,568
                  M 880,410 L 880,418
                "
                stroke="#0066FF"
                strokeWidth="1.8"
                fill="rgba(0, 168, 255, 0.05)"
                style={{ pathLength: enclosureLength }}
              />

              {/* Upper Floor Columns & Geometric Glass Curtain Frame */}
              <motion.path
                d="
                  M 360,400 L 360,260
                  M 480,460 L 480,320
                  M 600,530 L 600,390
                  M 720,460 L 720,320
                  M 840,400 L 840,260
                  M 600,260 L 600,120
                "
                stroke="url(#ezLaserGrad)"
                strokeWidth="1.4"
                strokeDasharray="3 3"
                style={{ pathLength: enclosureLength }}
              />

              {/* Architectural Roof Envelope & Pergola Framing (Level +7.20) */}
              <motion.path
                d="
                  M 360,260 L 600,390 L 840,260 L 600,130 Z
                  M 400,240 L 640,370 L 880,240 L 640,110 Z
                  M 360,260 L 400,240
                  M 600,390 L 640,370
                  M 840,260 L 880,240
                  M 600,130 L 640,110
                "
                stroke="#0284C7"
                strokeWidth="1.6"
                fill="rgba(56, 189, 248, 0.04)"
                style={{ pathLength: enclosureLength }}
              />

              {/* Modern Linear Pergola Rafters */}
              <path
                d="
                  M 440,220 L 680,350
                  M 480,200 L 720,330
                  M 520,180 L 760,310
                  M 560,160 L 800,290
                "
                stroke="#38BDF8"
                strokeWidth="1"
                strokeOpacity="0.45"
              />
            </motion.g>

            {/* ---------------------------------------------------------------
                PHASE 4: Digital Data Nodes & Dynamic Engineering Telemetry
                --------------------------------------------------------------- */}
            <motion.g style={{ opacity: dataTagsOpacity }}>
              {/* Node 1: Foundation QTO Dimension Tag */}
              <g transform="translate(230, 580)">
                <rect x="0" y="0" width="130" height="26" rx="6" fill="#FFFFFF" stroke="#38BDF8" strokeWidth="1" filter="url(#ezGlowFilter)" />
                <circle cx="14" cy="13" r="3.5" fill="#00A8FF" />
                <text x="26" y="17" fill="#0F172A" fontSize="10" fontWeight="700" fontFamily="monospace">
                  QTO: 142.5 m³
                </text>
              </g>

              {/* Node 2: AHSP Standard Reference Tag */}
              <g transform="translate(850, 580)">
                <rect x="0" y="0" width="145" height="26" rx="6" fill="#FFFFFF" stroke="#0066FF" strokeWidth="1" filter="url(#ezGlowFilter)" />
                <circle cx="14" cy="13" r="3.5" fill="#2563EB" />
                <text x="26" y="17" fill="#0F172A" fontSize="10" fontWeight="700" fontFamily="monospace">
                  AHSP: 2026-B.11
                </text>
              </g>

              {/* Node 3: Structural Elevation Marker Level +3.60 */}
              <g transform="translate(200, 395)">
                <line x1="0" y1="12" x2="110" y2="12" stroke="#00A8FF" strokeWidth="1" strokeDasharray="3 3" />
                <polygon points="110,12 118,8 118,16" fill="#00A8FF" />
                <rect x="0" y="0" width="100" height="24" rx="4" fill="#0B1B33" />
                <text x="12" y="16" fill="#38BDF8" fontSize="10" fontWeight="700" fontFamily="monospace">
                  EL +3.600 FFL
                </text>
              </g>

              {/* Node 4: BOQ Verified Decision Stamp */}
              <g transform="translate(860, 395)">
                <rect x="0" y="0" width="140" height="24" rx="4" fill="#0B1B33" />
                <text x="12" y="16" fill="#10B981" fontSize="10" fontWeight="700" fontFamily="monospace">
                  STATUS: VERIFIED ✓
                </text>
              </g>

              {/* Digital Node Connectors with Pulsing Cyan Dots */}
              <circle cx="390" cy="410" r="4.5" fill="#00A8FF" filter="url(#ezGlowFilter)">
                <animate attributeName="r" values="3.5;5.5;3.5" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle cx="600" cy="560" r="5" fill="#2563EB" filter="url(#ezGlowFilter)">
                <animate attributeName="r" values="4;6.5;4" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx="880" cy="410" r="4.5" fill="#00A8FF" filter="url(#ezGlowFilter)">
                <animate attributeName="r" values="3.5;5.5;3.5" dur="2.8s" repeatCount="indefinite" />
              </circle>
              <circle cx="600" cy="260" r="4.5" fill="#38BDF8" filter="url(#ezGlowFilter)">
                <animate attributeName="r" values="3.5;5.5;3.5" dur="2.2s" repeatCount="indefinite" />
              </circle>
            </motion.g>
          </svg>
        </motion.div>

        {/* ===================================================================
            LAYER 3: Flagship Kinetic Editorial Typography
            =================================================================== */}
        <div
          className="ez-statement-typography-container"
          style={{
            position: 'relative',
            zIndex: 20,
            maxWidth: '1360px',
            margin: '0 auto',
            padding: '0 32px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
          }}
        >
          {/* Top Subtle Engineering Pill Label */}
          <motion.div
            className="ez-statement-badge-pill"
            initial={{ opacity: 0, y: -10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 18px',
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(37, 99, 235, 0.18)',
              borderRadius: '999px',
              boxShadow: '0 4px 20px rgba(37, 99, 235, 0.08)',
              marginBottom: '28px',
            }}
          >
            <Sparkles size={13} color="#0066FF" />
            <span
              style={{
                fontSize: '11.5px',
                fontWeight: 750,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#1E3A8A',
                fontFamily: 'monospace',
              }}
            >
              ARCHITECTURAL INTELLIGENCE
            </span>
          </motion.div>

          {/* LINE 1: FROM DRAWINGS (Deep Architectural Navy) */}
          <motion.div
            className="ez-statement-hero-line1"
            style={{
              fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
              fontSize: 'clamp(46px, 8.8vw, 132px)',
              fontWeight: 900,
              lineHeight: 0.96,
              color: '#0B1B33',
              letterSpacing: line1Tracking,
              y: line1Y,
              opacity: line1Opacity,
              textTransform: 'uppercase',
              userSelect: 'none',
              marginBottom: '6px',
            }}
          >
            FROM DRAWINGS
          </motion.div>

          {/* LINE 2: TO DECISIONS. (EZRAB Electric Blue Hero Scale) */}
          <motion.div
            className="ez-statement-hero-line2"
            style={{
              fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
              fontSize: 'clamp(46px, 8.8vw, 132px)',
              fontWeight: 900,
              lineHeight: 0.96,
              letterSpacing: '-0.045em',
              background: 'linear-gradient(135deg, #0055FF 0%, #0099FF 50%, #00D2FF 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: line2Glow,
              scale: line2Scale,
              y: line2Y,
              textTransform: 'uppercase',
              userSelect: 'none',
              marginBottom: '34px',
            }}
          >
            TO DECISIONS.
          </motion.div>

          {/* Label Underneath: EZRAB WORKSPACE */}
          <motion.div
            className="ez-statement-brand-stamp"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 'clamp(12px, 1.4vw, 15px)',
              fontWeight: 750,
              letterSpacing: brandSpacing,
              color: '#64748B',
              textTransform: 'uppercase',
              opacity: brandOpacity,
            }}
          >
            <span style={{ width: '28px', height: '1.5px', background: 'rgba(37, 99, 235, 0.4)' }} />
            <span>EZRAB WORKSPACE</span>
            <span style={{ width: '28px', height: '1.5px', background: 'rgba(37, 99, 235, 0.4)' }} />
          </motion.div>

          {/* Subtle Live Pipeline Flow Indicators */}
          <motion.div
            className="ez-statement-pipeline-flow"
            style={{
              marginTop: '42px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'clamp(10px, 2vw, 24px)',
              flexWrap: 'wrap',
              opacity: dataTagsOpacity,
            }}
          >
            {[
              { label: 'DRAWING (CAD/PDF)', icon: ArrowUpRight, active: true },
              { label: 'STRUCTURED DATA', icon: Database, active: true },
              { label: 'AHSP 2026 ESTIMATION', icon: FileSpreadsheet, active: true },
              { label: 'ACTIONABLE DECISION', icon: CheckCircle2, active: true },
            ].map((step, idx, arr) => (
              <React.Fragment key={step.label}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '6px 14px',
                    background: 'rgba(255, 255, 255, 0.75)',
                    border: '1px solid rgba(226, 232, 240, 0.9)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 650,
                    color: '#334155',
                    fontFamily: 'monospace',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                  }}
                >
                  <step.icon size={12} color="#0066FF" />
                  <span>{step.label}</span>
                </div>
                {idx < arr.length - 1 && (
                  <span style={{ color: '#94A3B8', fontSize: '12px', fontWeight: 600 }}>→</span>
                )}
              </React.Fragment>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
};
