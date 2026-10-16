/**
 * EzrabHero3D — Three.js Visual Experience Engine (PREVIEW VARIANT)
 *
 * Branch: preview/landing-engineering-cinema
 * Proposal "Engineering Cinema" — TIDAK menyentuh landing utama (CinematicHero).
 * Seluruh angka bersifat DEMO SIMULASI dan diberi label eksplisit.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

export type HeroStage = 'opening' | 'construction' | 'connection' | 'completion';

interface EzrabHero3DProps {
  activeStage?: HeroStage;
  onStageChange?: (stage: HeroStage) => void;
  onSelectElement?: (elementId: string) => void;
  selectedElement?: string | null;
}

export interface BuildingElementMeta {
  id: string;
  code: string;
  name: string;
  level: string;
  formulaDemo: string;
  volumeDemo: string;
  ahspCodeDemo: string;
  status: 'VERIFIED_AHSP' | 'NEEDS_REVIEW';
}

export const HERO_BUILDING_ELEMENTS: Record<string, BuildingElementMeta> = {
  foundation: {
    id: 'foundation',
    code: 'STR-FND-01',
    name: 'Fondasi Pile Cap & Sloof Beton Bertulang',
    level: 'Substruktur (-2.40m)',
    formulaDemo: '12 titik × (1.8m × 1.8m × 0.8m)',
    volumeDemo: '31.10 m³',
    ahspCodeDemo: 'AHSP 2026 - 2.2.1.b (ilustrasi DEMO)',
    status: 'VERIFIED_AHSP',
  },
  columns: {
    id: 'columns',
    code: 'STR-COL-02',
    name: 'Kolom Struktur Utama K1 (600×600 mm)',
    level: 'Lantai 1 - Lantai 4 (+0.00 s/d +16.00m)',
    formulaDemo: '16 kolom × (0.6m × 0.6m × 16.0m)',
    volumeDemo: '92.16 m³',
    ahspCodeDemo: 'AHSP 2026 - 2.2.4.a (ilustrasi DEMO)',
    status: 'VERIFIED_AHSP',
  },
  slabs: {
    id: 'slabs',
    code: 'STR-SLB-03',
    name: 'Pelat Lantai & Balok Induk Beton Ekspos',
    level: 'Elevasi +4.00m, +8.00m, +12.00m, Atap',
    formulaDemo: '4 lapis × (18.0m × 12.0m × 0.15m)',
    volumeDemo: '129.60 m³',
    ahspCodeDemo: 'AHSP 2026 - 2.2.6.c (ilustrasi DEMO)',
    status: 'VERIFIED_AHSP',
  },
  envelope: {
    id: 'envelope',
    code: 'ARC-FAC-04',
    name: 'Fasad Curtain Wall Double Glazed Low-E & Louver Aluminium',
    level: 'Selubung Arsitektural L1-L4',
    formulaDemo: 'Keliling 60.0m × Tinggi 14.5m × Rasio Bukaan 0.65',
    volumeDemo: '565.50 m²',
    ahspCodeDemo: 'Kandidat AHSP / Harga Vendor Manual (ilustrasi DEMO)',
    status: 'NEEDS_REVIEW',
  },
};

export const EzrabHero3D: React.FC<EzrabHero3DProps> = ({
  activeStage: externalStage,
  onStageChange,
  onSelectElement,
  selectedElement = 'columns',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [internalStage, setInternalStage] = useState<HeroStage>('completion');
  const [isExploded, setIsExploded] = useState<boolean>(false);
  const [isWireframeOnly, setIsWireframeOnly] = useState<boolean>(false);
  const [webglAvailable, setWebglAvailable] = useState<boolean>(true);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  const currentStage = externalStage ?? internalStage;

  // Refs for animation loop access without triggering React re-renders every frame
  const stateRef = useRef({
    exploded: false,
    wireframeOnly: false,
    selected: 'columns' as string | null,
    pointerX: 0,
    pointerY: 0,
    stageProgress: 1,
  });

  useEffect(() => {
    stateRef.current.exploded = isExploded;
  }, [isExploded]);

  useEffect(() => {
    stateRef.current.wireframeOnly = isWireframeOnly;
  }, [isWireframeOnly]);

  useEffect(() => {
    stateRef.current.selected = selectedElement ?? null;
  }, [selectedElement]);

  const handleResetCamera = useCallback(() => {
    stateRef.current.pointerX = 0;
    stateRef.current.pointerY = 0;
    setIsExploded(false);
    setIsWireframeOnly(false);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Check WebGL support safely
    let renderer: THREE.WebGLRenderer;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) {
        setWebglAvailable(false);
        return;
      }
      renderer = new THREE.WebGLRenderer({
        antialias: window.innerWidth > 768,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglAvailable(false);
      return;
    }

    const isMobile = window.innerWidth < 768;
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Camera setup — architectural three-quarter perspective
    const camera = new THREE.PerspectiveCamera(
      36,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      120
    );
    const baseCamPos = new THREE.Vector3(isMobile ? 15.5 : 13.5, isMobile ? 11.5 : 9.8, isMobile ? 17.5 : 15.0);
    camera.position.copy(baseCamPos);
    const targetLookAt = new THREE.Vector3(0, 2.2, 0);
    camera.lookAt(targetLookAt);

    // Lighting — Daylight Architectural Engineering Studio
    const ambientLight = new THREE.AmbientLight(0xf5f8fc, 1.35);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(14, 24, 16);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x56c8f5, 0.65);
    fillLight.position.set(-14, 10, -10);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x2563eb, 0.5);
    rimLight.position.set(0, -10, 12);
    scene.add(rimLight);

    // Root architectural group
    const buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    // Disposables tracking for strict cleanup
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];

    const registerGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries.push(g);
      return g;
    };
    const registerMat = <T extends THREE.Material>(m: T): T => {
      materials.push(m);
      return m;
    };

    // 1. Subtle Engineering Blueprint Grid
    const gridHelper = new THREE.GridHelper(22, 22, 0x2563eb, 0xdce6f2);
    gridHelper.position.y = -0.5;
    if (Array.isArray(gridHelper.material)) {
      gridHelper.material.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.45;
        registerMat(m);
      });
    } else {
      gridHelper.material.transparent = true;
      gridHelper.material.opacity = 0.45;
      registerMat(gridHelper.material);
    }
    registerGeo(gridHelper.geometry);
    buildingGroup.add(gridHelper);

    // Materials per group for highlight & wireframe transition
    const createGroupMaterials = (baseHex: number, edgeHex: number, initialOpacity = 0.92) => {
      const solid = registerMat(
        new THREE.MeshPhysicalMaterial({
          color: baseHex,
          roughness: 0.32,
          metalness: 0.08,
          clearcoat: 0.15,
          transparent: true,
          opacity: initialOpacity,
        })
      );
      const line = registerMat(
        new THREE.LineBasicMaterial({
          color: edgeHex,
          transparent: true,
          opacity: 0.75,
        })
      );
      return { solid, line };
    };

    const mats = {
      foundation: createGroupMaterials(0xdce6f2, 0x647d9b, 0.95),
      columns: createGroupMaterials(0xffffff, 0x2563eb, 0.96),
      slabs: createGroupMaterials(0xf5f8fc, 0x647d9b, 0.94),
      envelope: createGroupMaterials(0x56c8f5, 0x2563eb, 0.28),
    };

    // Sub-groups for exploded view & selection highlighting
    const groups = {
      foundation: new THREE.Group(),
      columns: new THREE.Group(),
      slabs: new THREE.Group(),
      envelope: new THREE.Group(),
    };

    buildingGroup.add(groups.foundation, groups.columns, groups.slabs, groups.envelope);

    const addBoxWithEdges = (
      parent: THREE.Group,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      matPair: { solid: THREE.MeshPhysicalMaterial; line: THREE.LineBasicMaterial }
    ) => {
      const geo = registerGeo(new THREE.BoxGeometry(w, h, d));
      const mesh = new THREE.Mesh(geo, matPair.solid);
      mesh.position.set(x, y, z);

      const edgesGeo = registerGeo(new THREE.EdgesGeometry(geo));
      const line = new THREE.LineSegments(edgesGeo, matPair.line);
      mesh.add(line);

      parent.add(mesh);
    };

    // Build Foundation (Pile caps + Tie beams)
    addBoxWithEdges(groups.foundation, 8.4, 0.45, 5.8, 0, -0.22, 0, mats.foundation);
    const colX = [-3.4, -1.1, 1.1, 3.4];
    const colZ = [-2.1, 0, 2.1];
    colX.forEach((cx) => {
      colZ.forEach((cz) => {
        addBoxWithEdges(groups.foundation, 0.75, 0.4, 0.75, cx, -0.5, cz, mats.foundation);
      });
    });

    // Build Columns (4 levels)
    const totalHeight = 4.8;
    colX.forEach((cx) => {
      colZ.forEach((cz) => {
        addBoxWithEdges(
          groups.columns,
          0.24,
          totalHeight,
          0.24,
          cx,
          totalHeight / 2,
          cz,
          mats.columns
        );
      });
    });

    // Build Slabs & Structural Beams (4 levels + roof overhang)
    const slabLevels = [0.05, 1.25, 2.45, 3.65, 4.85];
    slabLevels.forEach((ly, idx) => {
      const isRoof = idx === slabLevels.length - 1;
      const width = isRoof ? 8.2 : 7.6;
      const depth = isRoof ? 5.4 : 5.0;
      addBoxWithEdges(groups.slabs, width, 0.16, depth, 0, ly, 0, mats.slabs);
    });

    // Build Architectural Glass Envelope & Louvers
    addBoxWithEdges(groups.envelope, 7.45, 4.65, 4.85, 0, 2.42, 0, mats.envelope);

    // Subtle Coordinate Points (Minimal engineering datum markers)
    const datumPoints: THREE.Vector3[] = [
      new THREE.Vector3(-4.2, -0.2, 2.9),
      new THREE.Vector3(4.2, -0.2, 2.9),
      new THREE.Vector3(4.2, 4.9, 2.9),
      new THREE.Vector3(-4.2, 4.9, -2.9),
    ];
    const datumGeo = registerGeo(new THREE.BufferGeometry().setFromPoints(datumPoints));
    const datumMat = registerMat(
      new THREE.PointsMaterial({
        color: 0x2563eb,
        size: 0.18,
        transparent: true,
        opacity: 0.85,
      })
    );
    const datumCloud = new THREE.Points(datumGeo, datumMat);
    buildingGroup.add(datumCloud);

    // Dimension Guide Lines (Vertical & Horizontal Engineering Callouts)
    const dimPoints = [
      new THREE.Vector3(4.6, 0, 2.5),
      new THREE.Vector3(4.6, 4.85, 2.5),
      new THREE.Vector3(-3.8, -0.45, 3.3),
      new THREE.Vector3(3.8, -0.45, 3.3),
    ];
    const dimGeo = registerGeo(new THREE.BufferGeometry().setFromPoints(dimPoints));
    const dimMat = registerMat(
      new THREE.LineBasicMaterial({ color: 0x56c8f5, transparent: true, opacity: 0.8 })
    );
    const dimSegments = new THREE.LineSegments(dimGeo, dimMat);
    buildingGroup.add(dimSegments);

    // Intro opening animation timer (if reduced motion is off)
    let introElapsed = reducedMotion ? 10 : 0;
    const clock = new THREE.Clock();

    // Pointer interactivity
    const handlePointerMove = (e: PointerEvent) => {
      if (reducedMotion) return;
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      stateRef.current.pointerX = Math.max(-1, Math.min(1, nx));
      stateRef.current.pointerY = Math.max(-1, Math.min(1, ny));
    };

    container.addEventListener('pointermove', handlePointerMove, { passive: true });

    // Resize handling without layout shift
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Visibility & IntersectionObserver to stop rendering when offscreen/inactive
    let isVisible = true;
    let isTabActive = !document.hidden;
    let rafId: number | null = null;

    const renderFrame = () => {
      if (!isVisible || !isTabActive) {
        rafId = null;
        return;
      }

      const delta = Math.min(clock.getDelta(), 0.1);
      introElapsed += delta;

      // Stage transitions during initial 4.5s cinematic reveal
      if (!externalStage && !reducedMotion) {
        if (introElapsed < 1.1) {
          setInternalStage('opening');
        } else if (introElapsed < 2.4) {
          setInternalStage('construction');
        } else if (introElapsed < 3.6) {
          setInternalStage('connection');
        } else {
          setInternalStage('completion');
        }
      }

      // Exploded view smooth interpolation
      const targetExplode = stateRef.current.exploded ? 1 : 0;
      groups.foundation.position.y = THREE.MathUtils.lerp(
        groups.foundation.position.y,
        targetExplode * -0.85,
        0.08
      );
      groups.columns.position.y = THREE.MathUtils.lerp(
        groups.columns.position.y,
        targetExplode * 0.35,
        0.08
      );
      groups.slabs.position.y = THREE.MathUtils.lerp(
        groups.slabs.position.y,
        targetExplode * 1.15,
        0.08
      );
      groups.envelope.position.y = THREE.MathUtils.lerp(
        groups.envelope.position.y,
        targetExplode * 2.1,
        0.08
      );

      // Highlight selected structural component & handle wireframe toggle
      const sel = stateRef.current.selected;
      const wf = stateRef.current.wireframeOnly || introElapsed < 1.1;

      (Object.keys(mats) as Array<keyof typeof mats>).forEach((key) => {
        const isSelected = sel === key;
        const pair = mats[key];

        let targetSolidOpacity = key === 'envelope' ? 0.24 : 0.94;
        if (wf) {
          targetSolidOpacity = 0.06;
        } else if (sel && !isSelected) {
          targetSolidOpacity = key === 'envelope' ? 0.1 : 0.38;
        } else if (isSelected && key === 'envelope') {
          targetSolidOpacity = 0.48;
        }

        pair.solid.opacity = THREE.MathUtils.lerp(pair.solid.opacity, targetSolidOpacity, 0.1);
        pair.solid.color.setHex(
          isSelected ? (key === 'envelope' ? 0x56c8f5 : 0xeff6ff) : key === 'foundation' ? 0xdce6f2 : 0xffffff
        );
        pair.line.color.setHex(isSelected ? 0x2563eb : 0x647d9b);
        pair.line.opacity = isSelected ? 1.0 : 0.65;
      });

      // Subtle camera damping & gentle rotation
      if (!reducedMotion) {
        buildingGroup.rotation.y = THREE.MathUtils.lerp(
          buildingGroup.rotation.y,
          stateRef.current.pointerX * 0.35 + Math.sin(introElapsed * 0.25) * 0.06,
          0.05
        );
        buildingGroup.rotation.x = THREE.MathUtils.lerp(
          buildingGroup.rotation.x,
          -stateRef.current.pointerY * 0.12,
          0.05
        );
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(renderFrame);
    };

    const startLoop = () => {
      if (rafId === null && isVisible && isTabActive) {
        clock.getDelta();
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isVisible = entry.isIntersecting;
          if (isVisible) startLoop();
        });
      },
      { threshold: 0.05 }
    );
    observer.observe(container);

    const handleVisibilityChange = () => {
      isTabActive = !document.hidden;
      if (isTabActive) startLoop();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    startLoop();

    // Strict cleanup on unmount
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('pointermove', handlePointerMove);

      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, [externalStage, reducedMotion]);

  useEffect(() => {
    onStageChange?.(currentStage);
  }, [currentStage, onStageChange]);

  const activeMeta =
    (selectedElement && HERO_BUILDING_ELEMENTS[selectedElement]) ||
    HERO_BUILDING_ELEMENTS.columns;

  return (
    <div className="relative w-full h-[460px] sm:h-[540px] lg:h-[620px] rounded-2xl bg-[#F5F8FC] border border-[#DCE6F2] overflow-hidden shadow-[0_24px_60px_-15px_rgba(15,23,42,0.08)] select-none">
      {/* Subtle Engineering Blueprint Grid Backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-65"
        style={{
          backgroundImage:
            'linear-gradient(to right, #DCE6F2 1px, transparent 1px), linear-gradient(to bottom, #DCE6F2 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />

      {/* Top Engineering Telemetry Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-white/85 backdrop-blur-md border-b border-[#DCE6F2] text-xs text-[#0F172A]">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded font-semibold bg-[#2563EB]/10 text-[#2563EB] border border-[#2563EB]/20">
            DEMO SIMULASI
          </span>
          <span className="font-mono text-[#647D9B] hidden sm:inline">
            MODEL: EZR-BIM-4F • SKALA ILUSTRASI
          </span>
        </div>

        {/* Interactive Camera & Layer Controls */}
        <div className="flex items-center gap-1.5" role="toolbar" aria-label="Kontrol tampilan 3D">
          <button
            type="button"
            onClick={() => setIsWireframeOnly((v) => !v)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
              isWireframeOnly
                ? 'bg-[#2563EB] text-white border-[#2563EB]'
                : 'bg-white text-[#0F172A] border-[#DCE6F2] hover:border-[#647D9B]'
            }`}
          >
            {isWireframeOnly ? 'Mode: Wireframe' : 'Mode: Solid + Wireframe'}
          </button>
          <button
            type="button"
            onClick={() => setIsExploded((v) => !v)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
              isExploded
                ? 'bg-[#2563EB] text-white border-[#2563EB]'
                : 'bg-white text-[#0F172A] border-[#DCE6F2] hover:border-[#647D9B]'
            }`}
          >
            {isExploded ? 'Satukan Struktur' : 'Explode Struktur'}
          </button>
          <button
            type="button"
            onClick={handleResetCamera}
            className="px-2.5 py-1 rounded text-xs font-medium bg-white text-[#647D9B] border border-[#DCE6F2] hover:text-[#0F172A] transition-colors"
            title="Reset posisi kamera ke awal"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Three.js Canvas Mount or Fallback SVG */}
      {webglAvailable ? (
        <div
          ref={containerRef}
          className="w-full h-[calc(100%-48px)] cursor-grab active:cursor-grabbing"
          role="img"
          aria-label="Visualisasi 3D interaktif struktur bangunan 4 lantai yang menghubungkan volume komponen dengan kode AHSP dan estimasi biaya EZRAB"
        />
      ) : (
        <div className="w-full h-[calc(100%-48px)] flex flex-col items-center justify-center p-6 text-center bg-[#F5F8FC]">
          <svg
            className="w-48 h-48 text-[#2563EB] mb-3"
            viewBox="0 0 200 200"
            fill="none"
            aria-hidden="true"
          >
            <polygon
              points="100,25 170,60 170,140 100,175 30,140 30,60"
              stroke="currentColor"
              strokeWidth="2"
              fill="#DCE6F2"
              fillOpacity="0.4"
            />
            <line x1="100" y1="25" x2="100" y2="175" stroke="#2563EB" strokeWidth="1.5" strokeDasharray="4 4" />
            <line x1="30" y1="60" x2="170" y2="60" stroke="#647D9B" strokeWidth="1.5" />
            <line x1="30" y1="100" x2="170" y2="100" stroke="#647D9B" strokeWidth="1.5" />
          </svg>
          <p className="text-sm font-medium text-[#0F172A]">
            Mode Blueprint Statis Aktif (Ilustrasi Struktur EZRAB)
          </p>
          <p className="text-xs text-[#647D9B] max-w-sm mt-1">
            Pilih komponen struktur di bawah untuk meninjau simulasi hubungan dimensi, volume QTO, dan referensi AHSP.
          </p>
        </div>
      )}

      {/* Structural Layer Selector Pills (Bottom Left) */}
      <div className="absolute bottom-4 left-4 right-4 sm:right-auto z-10 flex flex-wrap gap-1.5 bg-white/90 backdrop-blur-md p-1.5 rounded-xl border border-[#DCE6F2] shadow-sm">
        {(Object.keys(HERO_BUILDING_ELEMENTS) as Array<keyof typeof HERO_BUILDING_ELEMENTS>).map(
          (key) => {
            const item = HERO_BUILDING_ELEMENTS[key];
            const active = selectedElement === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectElement?.(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  active
                    ? 'bg-[#0F172A] text-white shadow-sm'
                    : 'text-[#647D9B] hover:text-[#0F172A] hover:bg-[#F5F8FC]'
                }`}
              >
                {item.code.split('-')[1]}
              </button>
            );
          }
        )}
      </div>

      {/* Floating Engineering Telemetry Overlay (Bottom Right on Desktop) */}
      <div className="hidden md:block absolute bottom-4 right-4 z-10 w-80 bg-white/92 backdrop-blur-md rounded-xl border border-[#DCE6F2] p-4 shadow-lg">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-mono text-[11px] font-semibold text-[#2563EB]">
            {activeMeta.code}
          </span>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              activeMeta.status === 'VERIFIED_AHSP'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            {activeMeta.status === 'VERIFIED_AHSP' ? 'Contoh Tautan AHSP (DEMO)' : 'Perlu Verifikasi Estimator'}
          </span>
        </div>
        <h4 className="text-xs font-semibold text-[#0F172A] leading-snug">{activeMeta.name}</h4>
        <p className="text-[11px] text-[#647D9B] mt-0.5">{activeMeta.level}</p>

        <div className="mt-3 pt-2.5 border-t border-[#DCE6F2] space-y-1.5 text-[11px]">
          <div className="flex justify-between">
            <span className="text-[#647D9B]">Rumus QTO (DEMO):</span>
            <span className="font-mono text-[#0F172A]">{activeMeta.formulaDemo}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#647D9B]">Volume Terhitung (DEMO):</span>
            <span className="font-mono font-semibold text-[#2563EB]">{activeMeta.volumeDemo}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#647D9B]">Tautan AHSP:</span>
            <span className="font-mono text-[#0F172A] truncate max-w-[165px]">
              {activeMeta.ahspCodeDemo}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
