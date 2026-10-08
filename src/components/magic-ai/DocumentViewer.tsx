import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Terminal,
  Layers,
  CheckCircle2,
  Clock,
  Download,
} from 'lucide-react';

export interface DocumentViewerProps {
  file: File | null;
  fileBuffer: ArrayBuffer | null;
  totalPages?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  logs?: Array<{ timestamp: string; level: 'INFO' | 'SUCCESS' | 'WARN'; message: string; stage?: string }>;
  isAnalyzing?: boolean;
}

// Architectural sheet names for the 32-page residential house DED fixture
const DED_SHEET_TITLES: Record<number, string> = {
  1: 'Cover & Informasi Proyek',
  2: 'Daftar Gambar & Catatan Umum',
  3: 'Denah Situasi & Rencana Tapak',
  4: 'Denah Rumah Tinggal Lt. 1',
  5: 'Tampak Depan & Tampak Belakang',
  6: 'Tampak Samping Kanan & Kiri',
  7: 'Potongan Melintang A-A',
  8: 'Potongan Memanjang B-B',
  9: 'Rencana Pondasi & Cerucuk Ulin',
  10: 'Detail Pondasi Batu Belah & Cerucuk',
  11: 'Rencana Sloof & Kolom Praktis',
  12: 'Detail Pembesian Sloof 15x20',
  13: 'Rencana Balok & Ringbalk 15x20',
  14: 'Detail Pembesian Ringbalk (4 D12)',
  15: 'Rencana Pelat Lantai & Dak Beton',
  16: 'Rencana Dinding & Pasangan Bata',
  17: 'Detail Plesteran & Acian',
  18: 'Rencana Kuda-Kuda Baja Ringan C75',
  19: 'Detail Reng & Sambungan Atap',
  20: 'Rencana Penutup Atap Spandek',
  21: 'Rencana Plafond Gypsum 9 mm',
  22: 'Detail Rangka Plafond Hollow',
  23: 'Rencana Pola Lantai Keramik 40x40',
  24: 'Detail Keramik Kamar Mandi',
  25: 'Rencana Kusen Pintu & Jendela Aluminium',
  26: 'Detail Tipe Pintu P1, P2 & Jendela J1',
  27: 'Detail Kaca Bening 5 mm & Aksesoris',
  28: 'Rencana Instalasi Air Bersih',
  29: 'Rencana Instalasi Air Kotor & Sanitair',
  30: 'Rencana Instalasi Listrik & Titik Lampu',
  31: 'Rencana Septic Tank & Resapan',
  32: 'Detail Saluran Drainase Keliling',
};

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  file,
  fileBuffer,
  totalPages = 32,
  currentPage: externalPage,
  onPageChange,
  logs = [],
  isAnalyzing = false,
}) => {
  const [activeTab, setActiveTab] = useState<'PREVIEW' | 'LOGS'>('PREVIEW');
  const [activePage, setActivePage] = useState<number>(1);
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isPdfLoading, setIsPdfLoading] = useState<boolean>(false);
  const [pdfRenderError, setPdfRenderError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentPageNum = externalPage !== undefined ? externalPage : activePage;
  const numPages = pdfDoc ? pdfDoc.numPages : totalPages;

  // Sync internal page
  const handleSelectPage = (pageNum: number) => {
    const valid = Math.max(1, Math.min(pageNum, numPages));
    setActivePage(valid);
    if (onPageChange) onPageChange(valid);
  };

  // Load PDF document using pdfjs-dist
  useEffect(() => {
    let isCancelled = false;

    async function loadPdf() {
      if (!fileBuffer) {
        setPdfDoc(null);
        return;
      }

      setIsPdfLoading(true);
      setPdfRenderError(null);

      try {
        const { loadPdfjs } = await import('../../lib/pdfjsSetup');
        const pdfjs = await loadPdfjs();

        const uint8 = new Uint8Array(fileBuffer);
        const loadingTask = pdfjs.getDocument({
          data: uint8,
          useSystemFonts: true,
        } as any);

        const doc = await loadingTask.promise;
        if (!isCancelled) {
          setPdfDoc(doc);
          setIsPdfLoading(false);
        }
      } catch (err: any) {
        console.warn('[DocumentViewer] PDF load fallback to architectural renderer:', err?.message || err);
        if (!isCancelled) {
          setPdfRenderError(err?.message || 'Gagal memuat PDF canvas langsung');
          setIsPdfLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [fileBuffer]);

  // Render current page onto canvas
  useEffect(() => {
    let renderTask: any = null;

    async function renderPage() {
      if (!pdfDoc || !canvasRef.current) return;

      try {
        const page = await pdfDoc.getPage(currentPageNum);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const baseViewport = page.getViewport({ scale: 1.0 });
        // Target high-DPI rendering
        const targetScale = 1.4 * zoomScale;
        const viewport = page.getViewport({ scale: targetScale });

        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);

        const renderContext = {
          canvasContext: ctx,
          viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('[DocumentViewer] Render error:', err);
        }
      }
    }

    renderPage();

    return () => {
      if (renderTask && renderTask.cancel) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, currentPageNum, zoomScale]);

  // Zoom handlers
  const handleZoomIn = () => setZoomScale((prev) => Math.min(prev + 0.2, 2.5));
  const handleZoomOut = () => setZoomScale((prev) => Math.max(prev - 0.2, 0.6));
  const handleZoomReset = () => setZoomScale(1.0);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const sheetTitle = DED_SHEET_TITLES[currentPageNum] || `Lembar Gambar ${currentPageNum}`;

  return (
    <div
      ref={containerRef}
      className={`bg-white border border-[#E2E8F0] rounded-[12px] flex flex-col overflow-hidden transition-all duration-200 ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'h-[620px]'
      }`}
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
    >
      {/* =========================================================================
          VIEWER TOP TOOLBAR
         ========================================================================= */}
      <div className="h-[46px] border-b border-[#E2E8F0] bg-[#F8FAFC] px-3 flex items-center justify-between shrink-0 select-none">
        {/* Left: Tab Switcher */}
        <div className="flex items-center gap-1 bg-[#E2E8F0]/60 p-0.5 rounded-[8px]">
          <button
            type="button"
            onClick={() => setActiveTab('PREVIEW')}
            className={`px-3 py-1 rounded-[6px] text-[12px] font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'PREVIEW'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <FileText size={13} className={activeTab === 'PREVIEW' ? 'text-[#2563EB]' : ''} />
            <span>Preview Gambar</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('LOGS')}
            className={`px-3 py-1 rounded-[6px] text-[12px] font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'LOGS'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <Terminal size={13} className={activeTab === 'LOGS' ? 'text-[#2563EB]' : ''} />
            <span>Log Analisis</span>
            {logs.length > 0 && (
              <span className="text-[10px] bg-[#EFF6FF] text-[#2563EB] px-1.5 py-0.2 rounded-full font-bold">
                {logs.length}
              </span>
            )}
          </button>
        </div>

        {/* Center: Page Navigation (Only for Preview Tab) */}
        {activeTab === 'PREVIEW' && (
          <div className="flex items-center gap-1.5 text-[12px] text-[#0F172A]">
            <button
              type="button"
              disabled={currentPageNum <= 1}
              onClick={() => handleSelectPage(currentPageNum - 1)}
              className="p-1 rounded-[6px] text-[#475569] hover:bg-[#E2E8F0] disabled:opacity-30 disabled:hover:bg-transparent transition"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft size={15} />
            </button>
            <div className="flex items-center gap-1 font-medium">
              <span className="font-bold text-[#0F172A]">Hal. {currentPageNum}</span>
              <span className="text-[#94A3B8]">/</span>
              <span className="text-[#64748B]">{numPages}</span>
            </div>
            <button
              type="button"
              disabled={currentPageNum >= numPages}
              onClick={() => handleSelectPage(currentPageNum + 1)}
              className="p-1 rounded-[6px] text-[#475569] hover:bg-[#E2E8F0] disabled:opacity-30 disabled:hover:bg-transparent transition"
              title="Halaman Selanjutnya"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}

        {/* Right: Zoom & Fullscreen Controls */}
        <div className="flex items-center gap-1 text-[#475569]">
          {activeTab === 'PREVIEW' && (
            <>
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomScale <= 0.6}
                className="p-1.5 rounded-[6px] hover:bg-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] transition disabled:opacity-30"
                title="Perkecil (-)"
              >
                <ZoomOut size={14} />
              </button>
              <button
                type="button"
                onClick={handleZoomReset}
                className="px-2 py-0.5 rounded-[6px] hover:bg-[#E2E8F0] text-[11px] font-mono font-semibold text-[#475569] transition"
                title="Reset Zoom (100%)"
              >
                {Math.round(zoomScale * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomScale >= 2.5}
                className="p-1.5 rounded-[6px] hover:bg-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] transition disabled:opacity-30"
                title="Perbesar (+)"
              >
                <ZoomIn size={14} />
              </button>
              <div className="h-3.5 w-px bg-[#CBD5E1] mx-1" />
            </>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-[6px] hover:bg-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] transition"
            title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* =========================================================================
          VIEWER BODY: TWO-PANE (THUMBNAIL STRIP + CANVAS VIEWPORT)
         ========================================================================= */}
      <div className="flex-1 flex overflow-hidden bg-[#F1F5F9]">
        {activeTab === 'PREVIEW' ? (
          <>
            {/* Left Thumbnail Strip */}
            <div className="w-[140px] shrink-0 border-r border-[#E2E8F0] bg-[#FFFFFF] overflow-y-auto p-2 flex flex-col gap-2">
              <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider px-1 mb-1">
                Daftar Halaman ({numPages})
              </div>
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pNum) => {
                const isSelected = pNum === currentPageNum;
                const title = DED_SHEET_TITLES[pNum] || `Halaman ${pNum}`;
                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => handleSelectPage(pNum)}
                    className={`group w-full text-left p-1.5 rounded-[8px] border transition-all ${
                      isSelected
                        ? 'border-[#2563EB] bg-[#EFF6FF] shadow-xs'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#CBD5E1] hover:bg-white'
                    }`}
                  >
                    {/* Thumbnail Sheet Preview Box */}
                    <div
                      className={`h-[68px] w-full rounded-[4px] border flex flex-col items-center justify-between p-1.5 mb-1 relative overflow-hidden transition-colors ${
                        isSelected
                          ? 'border-[#BFDBFE] bg-white'
                          : 'border-[#E2E8F0] bg-white/80 group-hover:bg-white'
                      }`}
                    >
                      {/* Blueprint Grid Watermark */}
                      <div
                        className="absolute inset-0 opacity-15 pointer-events-none"
                        style={{
                          backgroundImage:
                            'linear-gradient(to right, #2563EB 1px, transparent 1px), linear-gradient(to bottom, #2563EB 1px, transparent 1px)',
                          backgroundSize: '8px 8px',
                        }}
                      />
                      <div className="w-full flex items-center justify-between text-[8px] text-[#94A3B8] font-mono relative z-1">
                        <span>A-0{pNum}</span>
                        <span className="font-bold text-[#64748B]">{pNum}</span>
                      </div>
                      <div className="w-full text-center text-[9px] font-medium text-[#475569] truncate relative z-1 px-0.5">
                        {title.split(' ')[0]}
                      </div>
                      <div className="w-full h-1 bg-[#E2E8F0] rounded-full overflow-hidden relative z-1">
                        <div
                          className={`h-full ${isSelected ? 'bg-[#2563EB]' : 'bg-[#94A3B8]'}`}
                          style={{ width: `${(pNum / numPages) * 100}%` }}
                        />
                      </div>
                    </div>
                    {/* Caption */}
                    <div className="flex items-center justify-between text-[10px]">
                      <span className={`font-bold ${isSelected ? 'text-[#2563EB]' : 'text-[#0F172A]'}`}>
                        Hal. {pNum}
                      </span>
                    </div>
                    <div className="text-[9.5px] text-[#64748B] truncate mt-0.5" title={title}>
                      {title}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Center Canvas Viewport */}
            <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-start relative">
              {/* Sheet Title Breadcrumb Overlay */}
              <div className="sticky top-0 z-10 mb-3 bg-white/95 backdrop-blur-xs border border-[#E2E8F0] px-3.5 py-1.5 rounded-[8px] shadow-xs flex items-center gap-2 text-[12px]">
                <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
                <span className="font-bold text-[#0F172A]">Halaman {currentPageNum}:</span>
                <span className="font-medium text-[#475569]">{sheetTitle}</span>
                <span className="text-[#94A3B8]">•</span>
                <span className="text-[11px] text-[#64748B] font-mono">Skala Asli 1:100</span>
              </div>

              {/* Real PDF Canvas (if PDF is loaded) */}
              {pdfDoc && !pdfRenderError ? (
                <div
                  className="bg-white rounded-[6px] shadow-md border border-[#CBD5E1] p-2 flex items-center justify-center transition-transform duration-150"
                  style={{
                    transform: `scale(${zoomScale})`,
                    transformOrigin: 'top center',
                  }}
                >
                  <canvas ref={canvasRef} className="max-w-full h-auto block" />
                </div>
              ) : (
                /* Crisp Architectural Blueprint Wireframe (Fallback / Sample View) */
                <div
                  className="bg-white rounded-[8px] shadow-md border border-[#CBD5E1] p-6 w-full max-w-[780px] min-h-[460px] flex flex-col justify-between relative transition-transform duration-150"
                  style={{
                    transform: `scale(${zoomScale})`,
                    transformOrigin: 'top center',
                  }}
                >
                  {/* Outer Title Block Border (Standard SNI Architectural Format) */}
                  <div className="absolute inset-4 border-2 border-[#0F172A] pointer-events-none rounded-[2px]" />
                  <div className="absolute inset-5 border border-[#94A3B8] border-dashed pointer-events-none" />

                  {/* Blueprint Grid Background */}
                  <div
                    className="absolute inset-6 opacity-10 pointer-events-none"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, #0F172A 1px, transparent 1px), linear-gradient(to bottom, #0F172A 1px, transparent 1px)',
                      backgroundSize: '24px 24px',
                    }}
                  />

                  {/* Top Drawing Header */}
                  <div className="relative z-1 pt-3 px-3 flex items-start justify-between">
                    <div>
                      <div className="text-[11px] font-bold text-[#2563EB] tracking-wider uppercase">
                        GAMBAR KERJA DED — ARSITEKTUR & STRUKTUR
                      </div>
                      <div className="text-[18px] font-black text-[#0F172A] tracking-tight mt-0.5">
                        {sheetTitle.toUpperCase()}
                      </div>
                      <div className="text-[11px] text-[#64748B] mt-0.5">
                        Proyek Rumah Tinggal 1 Lantai • Standar Teknis PU Cipta Karya
                      </div>
                    </div>
                    <div className="text-right border border-[#CBD5E1] bg-[#F8FAFC] p-2 rounded-[6px] text-[10px] font-mono">
                      <div className="font-bold text-[#0F172A]">LEMBAR: A-0{currentPageNum}</div>
                      <div className="text-[#64748B]">DARI {numPages} LEMBAR</div>
                    </div>
                  </div>

                  {/* Center Architectural Illustration Diagram */}
                  <div className="relative z-1 my-6 flex flex-col items-center justify-center p-6 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px]">
                    <div className="w-full max-w-[520px] space-y-4">
                      {/* Technical Dimension Marks */}
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#2563EB] border-b border-[#2563EB]/40 pb-1">
                        <span>|← 3.00 m →|</span>
                        <span>|← 3.50 m →|</span>
                        <span>|← 3.00 m →|</span>
                        <span className="font-bold text-[#0F172A]">Total Bentang: 9.50 m</span>
                      </div>

                      {/* Schematic Box Representation based on current sheet */}
                      <div className="grid grid-cols-3 gap-2 h-[160px]">
                        <div className="border border-[#0F172A] bg-white p-2 rounded-[4px] flex flex-col justify-between text-[10px]">
                          <span className="font-bold text-[#0F172A]">R. Tamu</span>
                          <span className="text-[#64748B]">3.00 × 3.50</span>
                          <span className="text-[9px] text-[#2563EB] font-mono">+0.00 Keramik</span>
                        </div>
                        <div className="border border-[#0F172A] bg-white p-2 rounded-[4px] flex flex-col justify-between text-[10px]">
                          <span className="font-bold text-[#0F172A]">R. Keluarga</span>
                          <span className="text-[#64748B]">3.50 × 4.00</span>
                          <span className="text-[9px] text-[#2563EB] font-mono">+0.00 Keramik</span>
                        </div>
                        <div className="border border-[#0F172A] bg-white p-2 rounded-[4px] flex flex-col justify-between text-[10px]">
                          <span className="font-bold text-[#0F172A]">K. Tidur 1</span>
                          <span className="text-[#64748B]">3.00 × 3.50</span>
                          <span className="text-[9px] text-[#2563EB] font-mono">+0.00 Keramik</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-[#64748B]">
                        <span>Struktur: Sloof 15x20 • Kolom 15x15 • Ringbalk 15x20</span>
                        <span className="font-mono text-[#0F172A]">Elevasi: ±0.00</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Title Block (Kop Gambar Resmi) */}
                  <div className="relative z-1 border-t-2 border-[#0F172A] pt-2 px-3 grid grid-cols-4 gap-3 text-[10px]">
                    <div>
                      <div className="font-bold text-[#64748B] text-[8.5px] uppercase">Digambar Oleh:</div>
                      <div className="font-semibold text-[#0F172A]">Drafter & QS Tim</div>
                    </div>
                    <div>
                      <div className="font-bold text-[#64748B] text-[8.5px] uppercase">Diperiksa:</div>
                      <div className="font-semibold text-[#0F172A]">Lead Structural Eng.</div>
                    </div>
                    <div>
                      <div className="font-bold text-[#64748B] text-[8.5px] uppercase">Skala / Satuan:</div>
                      <div className="font-mono text-[#0F172A]">1 : 100 / Centimeter</div>
                    </div>
                    <div>
                      <div className="font-bold text-[#64748B] text-[8.5px] uppercase">Status Gambar:</div>
                      <div className="font-bold text-[#16A34A]">FOR TENDER & ESTIMATE</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* =========================================================================
              LOG ANALISIS TAB
             ========================================================================= */
          <div className="flex-1 bg-[#0F172A] text-[#F8FAFC] font-mono text-[11.5px] p-4 overflow-y-auto flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-[#334155] pb-2 text-[11px] text-[#94A3B8]">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-[#38BDF8]" />
                <span className="font-bold text-white">AI ESTIMATE LOG CONSOLE</span>
                <span>• Kernel: Gemini Vision Multi-Stage</span>
              </div>
              <span className="text-[#64748B]">{logs.length} entri terekam</span>
            </div>

            {logs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[#64748B] py-12">
                <Terminal size={28} className="mb-2 opacity-40" />
                <div>Belum ada log analisis.</div>
                <div className="text-[10px] text-[#475569]">
                  Log akan muncul secara real-time saat proses analisis DED dijalankan.
                </div>
              </div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2.5 leading-relaxed hover:bg-[#1E293B]/60 p-1 rounded"
                >
                  <span className="text-[#64748B] shrink-0 text-[10px] pt-0.5">[{log.timestamp}]</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold shrink-0 ${
                      log.level === 'SUCCESS'
                        ? 'bg-[#16A34A]/20 text-[#4ADE80] border border-[#16A34A]/40'
                        : log.level === 'WARN'
                        ? 'bg-[#D97706]/20 text-[#FBBF24] border border-[#D97706]/40'
                        : 'bg-[#0284C7]/20 text-[#38BDF8] border border-[#0284C7]/40'
                    }`}
                  >
                    {log.stage || log.level}
                  </span>
                  <span className="text-[#E2E8F0] break-words">{log.message}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
