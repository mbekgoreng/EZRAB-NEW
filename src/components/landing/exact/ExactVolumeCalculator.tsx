import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  Box,
  Layers,
  Grid,
  Columns,
  Square,
  Home,
  Sliders,
  Ruler,
  Check,
  Loader2,
  Sparkles,
  Maximize2
} from 'lucide-react';
import volumeFoundationImg from '../../../assets/volume-foundation.jpg';

interface ExactVolumeCalculatorProps {
  onOpenWorkspace?: () => void;
}

type AnimationPhase = 'idle' | 'blueprint' | 'scan' | 'input' | 'calculating' | 'result';

interface CategoryPreset {
  id: string;
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  params: {
    label: string;
    targetVal: number;
    unit: string;
    decimals: number;
    initialOffset: number;
  }[];
  volume: number;
  volumeUnit: string;
  highlightPolygon: string;
  markers: {
    label: string;
    value: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    tagX: number;
    tagY: number;
  }[];
  zoningLines: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    isInternal?: boolean;
  }[];
}

const CATEGORY_PRESETS: CategoryPreset[] = [
  {
    id: 'bowplank',
    name: 'Bowplank',
    icon: Ruler,
    params: [
      { label: 'Keliling Proyek', targetVal: 44.0, unit: 'm', decimals: 2, initialOffset: 1.5 },
      { label: 'Lebar Papan', targetVal: 0.20, unit: 'm', decimals: 2, initialOffset: 0.05 },
      { label: 'Tinggi Pasang', targetVal: 1.00, unit: 'm', decimals: 2, initialOffset: 0.2 }
    ],
    volume: 0.22,
    volumeUnit: 'm³',
    highlightPolygon: '6,56 48,15 88,48 47,88',
    zoningLines: [
      { x1: 6, y1: 56, x2: 48, y2: 15 },
      { x1: 48, y1: 15, x2: 88, y2: 48 },
      { x1: 88, y1: 48, x2: 47, y2: 88 },
      { x1: 47, y1: 88, x2: 6, y2: 56 },
      { x1: 6, y1: 56, x2: 6, y2: 48, isInternal: true },
      { x1: 47, y1: 88, x2: 47, y2: 80, isInternal: true }
    ],
    markers: [
      { label: 'Keliling', value: '44.00 m', x1: 6, y1: 56, x2: 47, y2: 88, tagX: 25, tagY: 77 },
      { label: 'Lebar', value: '0.20 m', x1: 47, y1: 88, x2: 88, y2: 48, tagX: 70, tagY: 78 },
      { label: 'Tinggi', value: '1.00 m', x1: 6, y1: 56, x2: 6, y2: 48, tagX: 8, tagY: 48 }
    ]
  },
  {
    id: 'pondasi',
    name: 'Pondasi',
    icon: Layers,
    params: [
      { label: 'Panjang', targetVal: 18.0, unit: 'm', decimals: 2, initialOffset: 1.2 },
      { label: 'Lebar Bawah', targetVal: 0.8, unit: 'm', decimals: 2, initialOffset: 0.15 },
      { label: 'Tinggi', targetVal: 1.2, unit: 'm', decimals: 2, initialOffset: 0.25 }
    ],
    volume: 17.28,
    volumeUnit: 'm³',
    highlightPolygon: '10,56 48,20 83,50 47,83',
    zoningLines: [
      { x1: 10, y1: 56, x2: 48, y2: 20 },
      { x1: 48, y1: 20, x2: 83, y2: 50 },
      { x1: 83, y1: 50, x2: 47, y2: 83 },
      { x1: 47, y1: 83, x2: 10, y2: 56 },
      { x1: 10, y1: 56, x2: 10, y2: 64, isInternal: true },
      { x1: 47, y1: 83, x2: 47, y2: 91, isInternal: true },
      { x1: 21, y1: 57, x2: 41, y2: 32, isInternal: true }
    ],
    markers: [
      { label: 'Panjang', value: '18.00 m', x1: 10, y1: 56, x2: 47, y2: 83, tagX: 26, tagY: 74 },
      { label: 'Lebar', value: '0.80 m', x1: 47, y1: 83, x2: 83, y2: 50, tagX: 68, tagY: 76 },
      { label: 'Tinggi', value: '1.20 m', x1: 10, y1: 56, x2: 10, y2: 64, tagX: 9, tagY: 62 }
    ]
  },
  {
    id: 'sloof',
    name: 'Sloof',
    icon: Box,
    params: [
      { label: 'Panjang', targetVal: 12.0, unit: 'm', decimals: 2, initialOffset: 0.28 },
      { label: 'Lebar', targetVal: 8.0, unit: 'm', decimals: 2, initialOffset: 0.18 },
      { label: 'Tinggi', targetVal: 3.5, unit: 'm', decimals: 2, initialOffset: 0.15 }
    ],
    volume: 336.0,
    volumeUnit: 'm³',
    highlightPolygon: '11,53 48,20 81,50 47,81',
    zoningLines: [
      // Outer 3D Foundation Perimeter (Exact match to user drawing)
      { x1: 11, y1: 53, x2: 48, y2: 20 },
      { x1: 48, y1: 20, x2: 81, y2: 50 },
      { x1: 81, y1: 50, x2: 47, y2: 81 },
      { x1: 47, y1: 81, x2: 11, y2: 53 },
      // Internal Sloof Grid & Formwork Beams (Exact match to user drawing)
      { x1: 21, y1: 55, x2: 40, y2: 31, isInternal: true },
      { x1: 29, y1: 67, x2: 64, y2: 46, isInternal: true },
      // 3D Height risers along building axes
      { x1: 11, y1: 53, x2: 11, y2: 38, isInternal: true },
      { x1: 47, y1: 81, x2: 47, y2: 68, isInternal: true }
    ],
    markers: [
      { label: 'Panjang', value: '12.00 m', x1: 11, y1: 53, x2: 47, y2: 81, tagX: 26, tagY: 72 },
      { label: 'Lebar', value: '8.00 m', x1: 47, y1: 81, x2: 81, y2: 50, tagX: 66, tagY: 76 },
      { label: 'Tinggi', value: '3.50 m', x1: 11, y1: 53, x2: 11, y2: 38, tagX: 10, tagY: 42 }
    ]
  },
  {
    id: 'kolom',
    name: 'Kolom',
    icon: Columns,
    params: [
      { label: 'Panjang Sisi', targetVal: 0.4, unit: 'm', decimals: 2, initialOffset: 0.08 },
      { label: 'Lebar Sisi', targetVal: 0.4, unit: 'm', decimals: 2, initialOffset: 0.08 },
      { label: 'Tinggi', targetVal: 3.8, unit: 'm', decimals: 2, initialOffset: 0.3 }
    ],
    volume: 9.73,
    volumeUnit: 'm³',
    highlightPolygon: '27,42 32,45 32,24 27,22',
    zoningLines: [
      // Column 1 Formwork
      { x1: 27, y1: 42, x2: 32, y2: 45 },
      { x1: 32, y1: 45, x2: 32, y2: 24 },
      { x1: 32, y1: 24, x2: 27, y2: 22 },
      { x1: 27, y1: 22, x2: 27, y2: 42 },
      // Column 2
      { x1: 42, y1: 33, x2: 46, y2: 35, isInternal: true },
      { x1: 46, y1: 35, x2: 46, y2: 17, isInternal: true },
      { x1: 46, y1: 17, x2: 42, y2: 15, isInternal: true },
      { x1: 42, y1: 15, x2: 42, y2: 33, isInternal: true }
    ],
    markers: [
      { label: 'Panjang', value: '0.40 m', x1: 27, y1: 42, x2: 32, y2: 45, tagX: 30, tagY: 49 },
      { label: 'Lebar', value: '0.40 m', x1: 32, y1: 45, x2: 36, y2: 42, tagX: 38, tagY: 45 },
      { label: 'Tinggi', value: '3.80 m', x1: 27, y1: 42, x2: 27, y2: 22, tagX: 21, tagY: 31 }
    ]
  },
  {
    id: 'balok',
    name: 'Balok',
    icon: Maximize2,
    params: [
      { label: 'Panjang Balok', targetVal: 24.0, unit: 'm', decimals: 2, initialOffset: 1.2 },
      { label: 'Lebar Balok', targetVal: 0.25, unit: 'm', decimals: 2, initialOffset: 0.05 },
      { label: 'Tinggi Balok', targetVal: 0.4, unit: 'm', decimals: 2, initialOffset: 0.08 }
    ],
    volume: 2.4,
    volumeUnit: 'm³',
    highlightPolygon: '11,53 47,81 47,75 11,47',
    zoningLines: [
      { x1: 11, y1: 53, x2: 47, y2: 81 },
      { x1: 47, y1: 81, x2: 47, y2: 75 },
      { x1: 47, y1: 75, x2: 11, y2: 47 },
      { x1: 11, y1: 47, x2: 11, y2: 53 },
      { x1: 29, y1: 67, x2: 64, y2: 46, isInternal: true },
      { x1: 29, y1: 62, x2: 64, y2: 41, isInternal: true }
    ],
    markers: [
      { label: 'Panjang', value: '24.00 m', x1: 11, y1: 53, x2: 47, y2: 81, tagX: 27, tagY: 72 },
      { label: 'Lebar', value: '0.25 m', x1: 47, y1: 81, x2: 47, y2: 75, tagX: 52, tagY: 79 },
      { label: 'Tinggi', value: '0.40 m', x1: 11, y1: 53, x2: 11, y2: 47, tagX: 8, tagY: 48 }
    ]
  },
  {
    id: 'dinding',
    name: 'Dinding',
    icon: Square,
    params: [
      { label: 'Keliling', targetVal: 36.0, unit: 'm', decimals: 2, initialOffset: 2.0 },
      { label: 'Tebal Bata', targetVal: 0.15, unit: 'm', decimals: 2, initialOffset: 0.03 },
      { label: 'Tinggi Dinding', targetVal: 3.5, unit: 'm', decimals: 2, initialOffset: 0.3 }
    ],
    volume: 18.9,
    volumeUnit: 'm³',
    highlightPolygon: '11,53 47,81 47,52 11,28',
    zoningLines: [
      { x1: 11, y1: 53, x2: 47, y2: 81 },
      { x1: 47, y1: 81, x2: 47, y2: 52 },
      { x1: 47, y1: 52, x2: 11, y2: 28 },
      { x1: 11, y1: 28, x2: 11, y2: 53 },
      { x1: 47, y1: 81, x2: 81, y2: 50, isInternal: true },
      { x1: 47, y1: 52, x2: 81, y2: 26, isInternal: true }
    ],
    markers: [
      { label: 'Keliling', value: '36.00 m', x1: 11, y1: 53, x2: 47, y2: 81, tagX: 26, tagY: 73 },
      { label: 'Tebal', value: '0.15 m', x1: 47, y1: 81, x2: 49, y2: 79, tagX: 53, tagY: 82 },
      { label: 'Tinggi', value: '3.50 m', x1: 11, y1: 53, x2: 11, y2: 28, tagX: 9, tagY: 37 }
    ]
  },
  {
    id: 'atap',
    name: 'Atap',
    icon: Home,
    params: [
      { label: 'Panjang Bidang', targetVal: 14.0, unit: 'm', decimals: 2, initialOffset: 1.0 },
      { label: 'Lebar Miring', targetVal: 8.5, unit: 'm', decimals: 2, initialOffset: 0.6 },
      { label: 'Kemiringan', targetVal: 30.0, unit: '°', decimals: 1, initialOffset: 2.0 }
    ],
    volume: 137.41,
    volumeUnit: 'm²',
    highlightPolygon: '16,42 48,16 82,34 47,60',
    zoningLines: [
      { x1: 16, y1: 42, x2: 48, y2: 16 },
      { x1: 48, y1: 16, x2: 82, y2: 34 },
      { x1: 82, y1: 34, x2: 47, y2: 60 },
      { x1: 47, y1: 60, x2: 16, y2: 42 },
      { x1: 48, y1: 16, x2: 47, y2: 60, isInternal: true }
    ],
    markers: [
      { label: 'Panjang', value: '14.00 m', x1: 16, y1: 42, x2: 82, y2: 34, tagX: 49, tagY: 32 },
      { label: 'Lebar', value: '8.50 m', x1: 48, y1: 16, x2: 47, y2: 60, tagX: 52, tagY: 22 },
      { label: 'Sudut', value: '30.0°', x1: 16, y1: 42, x2: 28, y2: 36, tagX: 22, tagY: 36 }
    ]
  },
  {
    id: 'lainnya',
    name: 'Lainnya',
    icon: Sliders,
    params: [
      { label: 'Panjang Area', targetVal: 10.0, unit: 'm', decimals: 2, initialOffset: 0.8 },
      { label: 'Lebar Area', targetVal: 6.0, unit: 'm', decimals: 2, initialOffset: 0.5 },
      { label: 'Tebal Cor', targetVal: 0.12, unit: 'm', decimals: 2, initialOffset: 0.02 }
    ],
    volume: 7.2,
    volumeUnit: 'm³',
    highlightPolygon: '22,57 47,35 72,52 47,74',
    zoningLines: [
      { x1: 22, y1: 57, x2: 47, y2: 35 },
      { x1: 47, y1: 35, x2: 72, y2: 52 },
      { x1: 72, y1: 52, x2: 47, y2: 74 },
      { x1: 47, y1: 74, x2: 22, y2: 57 },
      { x1: 22, y1: 57, x2: 22, y2: 63, isInternal: true },
      { x1: 47, y1: 74, x2: 47, y2: 80, isInternal: true }
    ],
    markers: [
      { label: 'Panjang', value: '10.00 m', x1: 22, y1: 57, x2: 47, y2: 74, tagX: 32, tagY: 71 },
      { label: 'Lebar', value: '6.00 m', x1: 47, y1: 74, x2: 72, y2: 52, tagX: 62, tagY: 67 },
      { label: 'Tebal', value: '0.12 m', x1: 22, y1: 57, x2: 22, y2: 63, tagX: 18, tagY: 60 }
    ]
  }
];

export const ExactVolumeCalculator: React.FC<ExactVolumeCalculatorProps> = ({ onOpenWorkspace }) => {
  const [activeCategory, setActiveCategory] = useState<CategoryPreset>(() => {
    return CATEGORY_PRESETS.find((c) => c.id === 'sloof') || CATEGORY_PRESETS[2];
  });

  const [phase, setPhase] = useState<AnimationPhase>('idle');
  const [displayedValues, setDisplayedValues] = useState<number[]>([12.0, 8.0, 3.5]);
  const [displayedVolume, setDisplayedVolume] = useState<number>(336.0);
  const [laserPosition, setLaserPosition] = useState<number>(0);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [manualTrigger, setManualTrigger] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const isVisibleRef = useRef<boolean>(false);

  // Sync displayed values when category changes
  useEffect(() => {
    setDisplayedValues(activeCategory.params.map((p) => p.targetVal));
    setDisplayedVolume(activeCategory.volume);
    // Restart animation sequence on category switch
    setPhase('blueprint');
  }, [activeCategory, manualTrigger]);

  // Intersection Observer to run animation only when section is visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isVisibleRef.current = entry.isIntersecting;
          if (entry.isIntersecting && phase === 'idle') {
            setPhase('blueprint');
          }
        });
      },
      { threshold: 0.25 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [phase]);

  // Check prefers-reduced-motion
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Main Animation Sequence Orchestrator
  useEffect(() => {
    if (prefersReducedMotion) {
      setPhase('result');
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    if (phase === 'blueprint') {
      // Step 1: Draw lines (500-700ms per measurement)
      timer = setTimeout(() => {
        if (!isHovered) setPhase('scan');
      }, 1600);
    } else if (phase === 'scan') {
      // Step 2: Dimension scan line moving left to right
      setLaserPosition(0);
      const scanStartTime = Date.now();
      const scanDuration = 1800;

      const scanInterval = setInterval(() => {
        const elapsed = Date.now() - scanStartTime;
        const progress = Math.min(100, (elapsed / scanDuration) * 100);
        setLaserPosition(progress);
        if (progress >= 100) {
          clearInterval(scanInterval);
        }
      }, 30);

      timer = setTimeout(() => {
        clearInterval(scanInterval);
        if (!isHovered) setPhase('input');
      }, 2000);
    } else if (phase === 'input') {
      // Step 3: Calculator sequential count-up
      const targets = activeCategory.params.map((p) => p.targetVal);
      const startVals = activeCategory.params.map((p) => p.targetVal - p.initialOffset);
      const steps = 14;
      let currentStep = 0;

      const countInterval = setInterval(() => {
        currentStep++;
        const factor = currentStep / steps;
        setDisplayedValues(
          targets.map((tgt, idx) => {
            const start = startVals[idx];
            return Number((start + (tgt - start) * factor).toFixed(2));
          })
        );

        if (currentStep >= steps) {
          clearInterval(countInterval);
          setDisplayedValues(targets);
        }
      }, 50);

      timer = setTimeout(() => {
        clearInterval(countInterval);
        if (!isHovered) setPhase('calculating');
      }, 1200);
    } else if (phase === 'calculating') {
      // Step 4: Hitung button glows & shows "Menghitung..." with spinner (~800ms)
      timer = setTimeout(() => {
        if (!isHovered) setPhase('result');
      }, 900);
    } else if (phase === 'result') {
      // Hasil Perhitungan count-up
      const targetVol = activeCategory.volume;
      const volSteps = 16;
      let volStep = 0;

      const volInterval = setInterval(() => {
        volStep++;
        const factor = volStep / volSteps;
        setDisplayedVolume(Number((targetVol * factor).toFixed(2)));
        if (volStep >= volSteps) {
          clearInterval(volInterval);
          setDisplayedVolume(targetVol);
        }
      }, 40);

      // Loop pause 3s, then smoothly return to blueprint/idle
      timer = setTimeout(() => {
        clearInterval(volInterval);
        if (!isHovered && isVisibleRef.current) {
          setPhase('blueprint');
        } else {
          setPhase('idle');
        }
      }, 3400);
    } else if (phase === 'idle') {
      // Idle pause before restarting next cycle
      timer = setTimeout(() => {
        if (!isHovered && isVisibleRef.current) {
          setPhase('blueprint');
        }
      }, 2000);
    }

    return () => clearTimeout(timer);
  }, [phase, activeCategory, isHovered, prefersReducedMotion]);

  const handleManualCalculate = () => {
    setPhase('calculating');
  };

  const handleCategorySelect = (category: CategoryPreset) => {
    setActiveCategory(category);
    setManualTrigger((prev) => prev + 1);
  };

  return (
    <section className="ez-volume-section" ref={containerRef}>
      {/* Background Subtle Architectural Grid */}
      <div className="ez-vol-bg-grid" aria-hidden="true" />
      <div className="ez-vol-bg-glow" aria-hidden="true" />

      <div className="ez-volume-container">
        {/* 2-Column Split Layout */}
        <div className="ez-volume-split">
          {/* Left Column: Copy & CTA */}
          <div className="ez-volume-left">
            <div className="ez-vol-eyebrow">
              <span className="ez-vol-eyebrow-pill">VOLUME CALCULATOR</span>
            </div>

            <h2 className="ez-vol-heading">
              Hitung volume
              <br />
              <span className="ez-vol-gradient-text">dengan cepat.</span>
            </h2>

            <p className="ez-vol-desc">
              Gunakan kalkulator volume untuk berbagai jenis pekerjaan konstruksi dengan parameter yang fleksibel.
            </p>

            <div className="ez-vol-cta-group">
              <button
                onClick={onOpenWorkspace}
                className="ez-btn-primary-pill ez-vol-cta-btn"
                aria-label="Lihat Volume Calculator"
              >
                <span>Lihat Volume Calculator</span>
                <ArrowRight size={16} className="ez-vol-cta-arrow" />
              </button>
            </div>

            {/* Subtle engineering badges */}
            <div className="ez-vol-features-row">
              <div className="ez-vol-feat-item">
                <div className="ez-vol-feat-dot" />
                <span>Parameter Dinamis</span>
              </div>
              <div className="ez-vol-feat-item">
                <div className="ez-vol-feat-dot" />
                <span>Format Standar PU</span>
              </div>
              <div className="ez-vol-feat-item">
                <div className="ez-vol-feat-dot" />
                <span>Terkoneksi Otomatis</span>
              </div>
            </div>
          </div>

          {/* Right Column: 3D Construction Model + Digital Measurement + Floating Calculator */}
          <div
            className={`ez-volume-visual-box ${isHovered ? 'hovered' : ''}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {/* Status indicator bar in CAD header */}
            <div className="ez-vol-cad-header">
              <div className="ez-vol-cad-left">
                <div className="ez-vol-cad-dot red" />
                <div className="ez-vol-cad-dot yellow" />
                <div className="ez-vol-cad-dot green" />
                <span className="ez-vol-cad-title">EZRAB_CAD_VOLUME // {activeCategory.name.toUpperCase()}</span>
              </div>
              <div className="ez-vol-cad-status">
                <span className={`ez-vol-status-beacon ${phase}`} />
                <span className="ez-vol-status-text">
                  {phase === 'blueprint' && 'BLUEPRINT ACTIVATED'}
                  {phase === 'scan' && 'DIMENSION SCANNING...'}
                  {phase === 'input' && 'PROCESSING PARAMETERS'}
                  {phase === 'calculating' && 'CALCULATING VOLUME...'}
                  {phase === 'result' && 'VOLUME COMPLETE'}
                  {phase === 'idle' && 'SYSTEM READY'}
                </span>
              </div>
            </div>

            {/* Base Image Container with Blueprint Grid & Measurement Overlays */}
            <div className="ez-vol-scene">
              <img
                src={volumeFoundationImg}
                alt="Volume Calculator 3D Construction Model"
                className={`ez-volume-img ${phase === 'blueprint' || phase === 'scan' ? 'blueprint-active' : ''}`}
              />

              {/* Blueprint Grid Overlay */}
              <div className="ez-vol-blueprint-grid" />

              {/* Interactive SVG Measurement Layer */}
              <svg className="ez-vol-svg-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  {/* Electric blue glow filter */}
                  <filter id="electricGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="0.8" floodColor="#38bdf8" floodOpacity="0.8" />
                  </filter>
                  <linearGradient id="scanGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
                    <stop offset="50%" stopColor="#2563eb" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Relevant Construction Area Highlight Polygon */}
                <polygon
                  points={activeCategory.highlightPolygon}
                  className={`ez-vol-highlight-poly ${
                    phase === 'scan' || phase === 'input' || phase === 'result' ? 'active' : ''
                  }`}
                />

                {/* 3D Zoning Wireframe Lines (Exact Match to User's Drawing) */}
                <g className={`ez-vol-zoning-group ${phase !== 'idle' ? 'draw-active' : ''}`}>
                  {activeCategory.zoningLines?.map((line, idx) => (
                    <line
                      key={`zline-${idx}`}
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      className={`ez-vol-zoning-line ${line.isInternal ? 'internal' : 'boundary'}`}
                      filter="url(#electricGlow)"
                      style={{
                        animationDelay: `${idx * 0.15}s`,
                        transitionDelay: `${idx * 0.12}s`
                      }}
                    />
                  ))}
                </g>

                {/* Measurement Lines (Step 1 Draw-Line Animation) */}
                {activeCategory.markers.map((marker, idx) => (
                  <g
                    key={marker.label}
                    className={`ez-vol-measure-group measure-line-${idx + 1} ${
                      phase !== 'idle' ? 'draw-active' : ''
                    }`}
                  >
                    {/* Dimension Lead Line */}
                    <line
                      x1={marker.x1}
                      y1={marker.y1}
                      x2={marker.x2}
                      y2={marker.y2}
                      className="ez-vol-dimension-line"
                      filter="url(#electricGlow)"
                    />
                    {/* Dimension Start & End Ticks */}
                    <circle cx={marker.x1} cy={marker.y1} r="1.1" className="ez-vol-tick-dot" />
                    <circle cx={marker.x2} cy={marker.y2} r="1.1" className="ez-vol-tick-dot" />
                  </g>
                ))}
              </svg>

              {/* Laser Scanning Line (Step 2 Dimension Scan) */}
              {phase === 'scan' && (
                <div
                  className="ez-vol-laser-beam"
                  style={{ left: `${laserPosition}%` }}
                >
                  <div className="ez-vol-laser-glow" />
                </div>
              )}

              {/* Floating Measurement Markers (12.00 m, 8.00 m, 3.50 m) */}
              {activeCategory.markers.map((marker, idx) => {
                const isRevealed =
                  phase === 'scan'
                    ? laserPosition >= marker.tagX - 10
                    : phase !== 'idle' && phase !== 'blueprint';

                return (
                  <div
                    key={marker.label}
                    className={`ez-vol-measurement-tag tag-${idx + 1} ${
                      isRevealed || phase === 'result' ? 'visible' : ''
                    }`}
                    style={{ left: `${marker.tagX}%`, top: `${marker.tagY}%` }}
                  >
                    <span className="ez-vol-tag-lbl">{marker.label}</span>
                    <span className="ez-vol-tag-val">{marker.value}</span>
                  </div>
                );
              })}

              {/* Real-time Watermark / Brand */}
              <div className="ez-vol-model-badge">
                <span className="ez-vol-badge-dot" />
                <span>MODEL 3D // REAL-TIME QTO</span>
              </div>
            </div>

            {/* Floating Glass Calculator Card */}
            <div className="ez-volume-floating-card">
              <div className="ez-vol-card-top">
                <div className="ez-vol-card-eyebrow">PARAMETER DIMENSI</div>
                <div className="ez-vol-category-badge">{activeCategory.name}</div>
              </div>

              {/* Dimension Parameter Inputs with Count-up */}
              <div className="ez-vol-inputs-list">
                {activeCategory.params.map((param, idx) => (
                  <div key={param.label} className="ez-vol-input-row">
                    <span className="ez-vol-param-label">{param.label}</span>
                    <span className="ez-vol-param-value">
                      <b>{displayedValues[idx]?.toFixed(param.decimals) ?? param.targetVal.toFixed(param.decimals)}</b>{' '}
                      <small>{param.unit}</small>
                    </span>
                  </div>
                ))}
              </div>

              {/* Action Button: Hitung */}
              <button
                type="button"
                onClick={handleManualCalculate}
                className={`ez-vol-calc-btn ${phase === 'calculating' ? 'is-calculating' : ''} ${
                  phase === 'result' ? 'is-done' : ''
                }`}
                disabled={phase === 'calculating'}
              >
                {phase === 'calculating' ? (
                  <span className="ez-vol-btn-content">
                    <Loader2 size={14} className="ez-vol-spinner animate-spin" />
                    <span>Menghitung...</span>
                  </span>
                ) : phase === 'result' ? (
                  <span className="ez-vol-btn-content">
                    <Check size={14} />
                    <span>Hasil Volume</span>
                  </span>
                ) : (
                  <span className="ez-vol-btn-content">
                    <Sparkles size={14} />
                    <span>Hitung</span>
                    <ArrowRight size={14} className="ez-vol-btn-arrow" />
                  </span>
                )}
              </button>

              {/* Volume Result Panel (Count-up & Perhitungan Selesai) */}
              <div className={`ez-vol-result-panel ${phase === 'result' ? 'visible' : ''}`}>
                <div className="ez-vol-result-header">
                  <span className="ez-vol-result-label">VOLUME</span>
                  <span className="ez-vol-result-status">
                    <Check size={12} />
                    <span>Perhitungan selesai</span>
                  </span>
                </div>
                <div className="ez-vol-result-number">
                  <b>{displayedVolume.toFixed(2)}</b>
                  <span className="ez-vol-result-unit">{activeCategory.volumeUnit}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Category Selector — Interactive Pill Navigation */}
        <div className="ez-volume-category-section">
          <div className="ez-vol-selector-label">
            <span>PILIH KATEGORI PEKERJAAN:</span>
          </div>

          <div className="ez-volume-chips-bar" role="tablist">
            {CATEGORY_PRESETS.map((cat) => {
              const IconComp = cat.icon;
              const isActive = activeCategory.id === cat.id;

              return (
                <button
                  key={cat.id}
                  role="tab"
                  aria-selected={isActive}
                  className={`ez-volume-chip ${isActive ? 'active' : ''}`}
                  onClick={() => handleCategorySelect(cat)}
                >
                  <IconComp size={15} className="ez-vol-chip-icon" />
                  <span>{cat.name}</span>
                  {isActive && <div className="ez-vol-active-glow" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
