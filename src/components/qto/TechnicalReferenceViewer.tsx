import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  Compass,
  FileImage,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info,
  CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react';
import {
  WorkTechnicalReference,
  TechnicalReferenceImage,
  getWorkTechnicalReference,
} from '../../data/volumeTechnicalReferences';

interface TechnicalReferenceViewerProps {
  workId: string;
  categoryName?: string;
  workName?: string;
  renderCadDiagram?: () => React.ReactNode;
  activeParamLabel?: string;
}

export const TechnicalReferenceViewer: React.FC<TechnicalReferenceViewerProps> = ({
  workId,
  categoryName = 'Pekerjaan Konstruksi',
  workName,
  renderCadDiagram,
  activeParamLabel,
}) => {
  const refData: WorkTechnicalReference | null = getWorkTechnicalReference(workId);
  const images = refData?.images || [];

  // Active image index
  const [selectedImgIndex, setSelectedImgIndex] = useState(0);
  // View mode: 'reference_image' | 'cad_vector'
  const [viewMode, setViewMode] = useState<'reference_image' | 'cad_vector'>('reference_image');

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // When workId changes, reset zoom, pan, and active image index
  useEffect(() => {
    setSelectedImgIndex(0);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    // If no images exist, switch to CAD schematic if available
    if (images.length === 0 && renderCadDiagram) {
      setViewMode('cad_vector');
    } else {
      setViewMode('reference_image');
    }
  }, [workId, images.length]);

  const activeImage: TechnicalReferenceImage | undefined = images[selectedImgIndex] || images[0];

  // Zoom controls
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(3.5, Number((prev + 0.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((prev) => {
      const next = Math.max(0.6, Number((prev - 0.25).toFixed(2)));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleFit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoom((prev) => {
      const next = Math.max(0.6, Math.min(3.5, Number((prev + delta).toFixed(2))));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Pan / Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        right: isFullscreen ? 0 : 'auto',
        bottom: isFullscreen ? 0 : 'auto',
        zIndex: isFullscreen ? 99999 : 'auto',
        width: isFullscreen ? '100vw' : '100%',
        height: isFullscreen ? '100vh' : 'auto',
        transition: 'all 0.2s ease',
      }}
    >
      {/* 1. TOP HEADER BAR */}
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid #F1F5F9',
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* Left Title & Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: '#EFF6FF',
              border: '1px solid #DBEAFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
              flexShrink: 0,
            }}
          >
            <Compass size={18} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  color: '#2563EB',
                  background: '#EFF6FF',
                  padding: '2px 8px',
                  borderRadius: '5px',
                  textTransform: 'uppercase',
                }}
              >
                GAMBAR TEKNIK
              </span>
              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                {refData?.category || categoryName} • {refData?.workName || workName || workId}
              </span>
              {refData?.standard && (
                <span
                  style={{
                    fontSize: '11px',
                    color: '#059669',
                    background: '#ECFDF5',
                    border: '1px solid #A7F3D0',
                    padding: '2px 8px',
                    borderRadius: '5px',
                    fontWeight: 700,
                  }}
                >
                  {refData.standard}
                </span>
              )}
            </div>

            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
              Detail: {activeImage ? activeImage.title : (refData?.workName || workName || workId)}
              {activeImage?.subtitle && (
                <span style={{ fontWeight: 500, color: '#64748B', marginLeft: '6px', fontSize: '12px' }}>
                  — {activeImage.subtitle}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Controls Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Mode Switcher: Image vs CAD vector (if available) */}
          {renderCadDiagram && images.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: '#F1F5F9',
                padding: '3px',
                borderRadius: '8px',
                marginRight: '6px',
              }}
            >
              <button
                onClick={() => setViewMode('reference_image')}
                style={{
                  padding: '4px 10px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'reference_image' ? '#ffffff' : 'transparent',
                  color: viewMode === 'reference_image' ? '#2563EB' : '#64748B',
                  boxShadow: viewMode === 'reference_image' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <FileImage size={13} />
                <span>Gambar Kerja</span>
              </button>
              <button
                onClick={() => setViewMode('cad_vector')}
                style={{
                  padding: '4px 10px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'cad_vector' ? '#ffffff' : 'transparent',
                  color: viewMode === 'cad_vector' ? '#2563EB' : '#64748B',
                  boxShadow: viewMode === 'cad_vector' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Layers size={13} />
                <span>Skematik CAD Interaktif</span>
              </button>
            </div>
          )}

          {/* Zoom controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '2px 4px',
            }}
          >
            <button
              onClick={handleZoomIn}
              title="Perbesar (Zoom In)"
              style={{
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <ZoomIn size={15} />
            </button>
            <span
              style={{
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#0F172A',
                fontFamily: 'monospace',
                minWidth: '42px',
                textAlign: 'center',
              }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomOut}
              title="Perkecil (Zoom Out)"
              style={{
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <ZoomOut size={15} />
            </button>
            <button
              onClick={handleFit}
              title="Sesuaikan Ukuran (Fit)"
              style={{
                padding: '0 8px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '5px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              Fit
            </button>
            <button
              onClick={handleReset}
              title="Reset Zoom & Posisi"
              style={{
                width: '28px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '5px',
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={12} />
            </button>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh (Fullscreen)'}
            style={{
              height: '34px',
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: isFullscreen ? '#0F172A' : '#EFF6FF',
              color: isFullscreen ? '#ffffff' : '#2563EB',
              border: isFullscreen ? 'none' : '1px solid #BFDBFE',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span>{isFullscreen ? 'Tutup Fullscreen' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN TECHNICAL DRAWING CANVAS */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          width: '100%',
          flex: 1,
          minHeight: isFullscreen ? 'calc(100vh - 140px)' : '460px',
          maxHeight: isFullscreen ? 'calc(100vh - 140px)' : '580px',
          background: '#0B132B',
          backgroundImage:
            'radial-gradient(#1E293B 1px, transparent 1px), radial-gradient(#1E293B 1px, #0B132B 1px)',
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0, 12px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
          cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          userSelect: 'none',
        }}
      >
        {/* Watermark / Badge pojok kiri atas */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '16px',
            fontSize: '10.5px',
            color: '#38BDF8',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            opacity: 0.9,
            pointerEvents: 'none',
            background: 'rgba(11, 19, 43, 0.75)',
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            backdropFilter: 'blur(4px)',
            zIndex: 10,
          }}
        >
          EZRAB TECHNICAL REFERENCE • 16:9 HD
        </div>

        {/* Floating Indicator Pan/Zoom Tip pojok kanan bawah */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            right: '16px',
            fontSize: '10px',
            color: '#94A3B8',
            background: 'rgba(15, 23, 42, 0.8)',
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.08)',
            pointerEvents: 'none',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>Scroll untuk Zoom • Drag saat zoom untuk Pan</span>
        </div>

        {/* ACTIVE CONTENT VIEW */}
        {viewMode === 'cad_vector' && renderCadDiagram ? (
          <div
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              maxWidth: '92%',
              maxHeight: '92%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {renderCadDiagram()}
          </div>
        ) : images.length > 0 && activeImage ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            }}
          >
            <img
              src={activeImage.src}
              alt={activeImage.title}
              loading="lazy"
              draggable={false}
              style={{
                maxWidth: '96%',
                maxHeight: '92%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            />
          </div>
        ) : (
          /* EMPTY STATE (PHASE 11) */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '36px',
              textAlign: 'center',
              color: '#CBD5E1',
              maxWidth: '480px',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '14px',
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38BDF8',
                marginBottom: '16px',
              }}
            >
              <Compass size={28} />
            </div>

            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.1em',
                color: '#38BDF8',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}
            >
              TECHNICAL REFERENCE
            </span>

            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: '0 0 8px' }}>
              Referensi gambar belum tersedia untuk pekerjaan ini.
            </h3>

            <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
              Perhitungan volume tetap dapat dilakukan secara presisi menggunakan parameter di formulir bawah.
            </p>

            {renderCadDiagram && (
              <button
                onClick={() => setViewMode('cad_vector')}
                style={{
                  marginTop: '16px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: '#2563EB',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Layers size={14} />
                <span>Buka Skematik CAD Interaktif</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 3. BOTTOM THUMBNAILS BAR (Hanya jika memiliki > 1 gambar - Phase 8) */}
      {images.length > 1 && (
        <div
          style={{
            padding: '10px 18px',
            borderTop: '1px solid #F1F5F9',
            background: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            overflowX: 'auto',
          }}
        >
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748B', whiteSpace: 'nowrap' }}>
            Gambar Referensi ({images.length}):
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {images.map((img, idx) => {
              const isSelected = selectedImgIndex === idx && viewMode === 'reference_image';
              return (
                <button
                  key={img.id}
                  onClick={() => {
                    setSelectedImgIndex(idx);
                    setViewMode('reference_image');
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 8px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                    background: isSelected ? '#EFF6FF' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 2px 6px rgba(37,99,235,0.2)' : 'none',
                  }}
                >
                  <img
                    src={img.src}
                    alt={img.title}
                    style={{
                      width: '42px',
                      height: '26px',
                      objectFit: 'cover',
                      borderRadius: '4px',
                      border: '1px solid #CBD5E1',
                    }}
                  />
                  <div style={{ textAlign: 'left' }}>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: isSelected ? '#1D4ED8' : '#334155',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {img.title}
                    </div>
                    {img.subtitle && (
                      <div
                        style={{
                          fontSize: '9.5px',
                          color: '#64748B',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {img.subtitle}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
