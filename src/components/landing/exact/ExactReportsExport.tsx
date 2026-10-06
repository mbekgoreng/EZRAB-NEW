import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  FileText,
  FileSpreadsheet,
  Download,
  Check,
  TrendingUp,
  Stamp,
  Sparkles,
  FileCheck,
  Printer,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { exportProjectToPDF } from '../../../export/pdfExporter';
import { Project, Company } from '../../../types';

interface ExactReportsExportProps {
  onOpenWorkspace?: () => void;
}

interface SPoint {
  week: string;
  percent: number;
  x: number;
  y: number;
  label: string;
}

const S_POINTS: SPoint[] = [
  { week: 'M1', percent: 12, x: 100, y: 92, label: 'Minggu 1: 12%' },
  { week: 'M2', percent: 32, x: 180, y: 72, label: 'Minggu 2: 32%' },
  { week: 'M3', percent: 50, x: 270, y: 46, label: 'Minggu 3: 50%' },
  { week: 'M4', percent: 68, x: 370, y: 26, label: 'Minggu 4: 68%' }
];

export const ExactReportsExport: React.FC<ExactReportsExportProps> = ({ onOpenWorkspace }) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isVisibleRef = useRef<boolean>(true);

  // Accessibility: prefers-reduced-motion
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Timeline States
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'preparing' | 'ready'>(
    prefersReducedMotion ? 'ready' : 'idle'
  );
  const [excelReady, setExcelReady] = useState<boolean>(prefersReducedMotion);
  const [chartActive, setChartActive] = useState<boolean>(prefersReducedMotion);
  const [rencanaDrawn, setRencanaDrawn] = useState<boolean>(prefersReducedMotion);
  const [realisasiProgress, setRealisasiProgress] = useState<number>(prefersReducedMotion ? 100 : 0);
  const [activeTooltipIndex, setActiveTooltipIndex] = useState<number | null>(null);
  const [pointsVisible, setPointsVisible] = useState<boolean>(prefersReducedMotion);
  const [trackStatus, setTrackStatus] = useState<'analyzing' | 'onTrack'>(
    prefersReducedMotion ? 'onTrack' : 'analyzing'
  );
  const [dataPulseActive, setDataPulseActive] = useState<boolean>(false);
  const [previewVisible, setPreviewVisible] = useState<boolean>(prefersReducedMotion);
  const [exportBtnState, setExportBtnState] = useState<'idle' | 'generating' | 'ready'>(
    prefersReducedMotion ? 'ready' : 'idle'
  );
  const [isSettled, setIsSettled] = useState<boolean>(prefersReducedMotion);

  // Micro-interaction hovers
  const [hoveredBadge, setHoveredBadge] = useState<'pdf' | 'excel' | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [isCardHovered, setIsCardHovered] = useState<boolean>(false);

  // IntersectionObserver to trigger animation when in viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            isVisibleRef.current = true;
            if (!hasStarted) {
              setHasStarted(true);
            }
          }
        });
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, [hasStarted]);

  // Master Animation Timeline (based on user timeline specifications)
  useEffect(() => {
    if (!hasStarted || prefersReducedMotion) return;

    const timeouts: ReturnType<typeof setTimeout>[] = [];

    // 0.4s: PDF / Excel buttons appear and activate
    timeouts.push(setTimeout(() => {
      setPdfStatus('preparing');
    }, 800));

    // 1.0s: PDF status turns to ready
    timeouts.push(setTimeout(() => {
      setPdfStatus('ready');
      setExcelReady(true);
    }, 1200));

    // 1.2s: Chart container activates
    timeouts.push(setTimeout(() => {
      setChartActive(true);
    }, 1200));

    // 1.4s: Rencana line starts drawing
    timeouts.push(setTimeout(() => {
      setRencanaDrawn(true);
    }, 1400));

    // 2.0s: Realisasi line progressive drawing (0% to 100% over 1.4s)
    timeouts.push(setTimeout(() => {
      const startTime = Date.now();
      const duration = 1400;

      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const p = Math.min(1, elapsed / duration);
        setRealisasiProgress(Math.round(p * 100));

        if (p >= 1) {
          clearInterval(interval);
        }
      }, 30);
    }, 2000));

    // 3.6s: Data points appear & highlight active tooltip
    timeouts.push(setTimeout(() => {
      setPointsVisible(true);
      setActiveTooltipIndex(3); // Highlight latest point (Minggu 4: 68%)

      setTimeout(() => {
        setActiveTooltipIndex(null);
      }, 1400);
    }, 3600));

    // 4.0s: "On Track (+1.2%)" appears with checkmark
    timeouts.push(setTimeout(() => {
      setTrackStatus('onTrack');
    }, 4000));

    // 4.4s: Data pulse travels toward report preview
    timeouts.push(setTimeout(() => {
      setDataPulseActive(true);
    }, 4400));

    // 4.8s: Mini document preview enters from bottom
    timeouts.push(setTimeout(() => {
      setPreviewVisible(true);
      setDataPulseActive(false);
    }, 4800));

    // 5.2s: Export 1-Click highlight & "Generating..." simulation
    timeouts.push(setTimeout(() => {
      setExportBtnState('generating');
    }, 5200));

    // 5.7s: Export Ready
    timeouts.push(setTimeout(() => {
      setExportBtnState('ready');
    }, 5700));

    // 6.2s: Settle into calm idle state
    timeouts.push(setTimeout(() => {
      setIsSettled(true);
      setExportBtnState('idle');
    }, 6200));

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [hasStarted, prefersReducedMotion]);

  // Manual trigger for 1-Click Export test - generates real PDF download
  const handleExportClick = async () => {
    if (exportBtnState !== 'idle') return;
    setExportBtnState('generating');

    try {
      const sampleCompany: Company = {
        id: 'comp-ezrab',
        name: 'PT EZRAB KONSTRUKSI DIGITAL',
        address: 'SCBD District 8 Tower A Lt. 28, Jakarta Selatan',
        phone: '021-5088-9900',
        email: 'support@ezrab.co.id',
        website: 'https://ezrab.co.id',
        taxNumber: '01.234.567.8-012.000',
        directorName: 'Ir. Ahmad Yusuf, M.T.',
        leadEstimatorName: 'Ahmad Yusuf (Lead Estimator)',
        defaultOverheadPercent: 5,
        defaultProfitPercent: 5,
        defaultContingencyPercent: 0,
        defaultTaxPercent: 11,
      };

      const sampleProject: Project = {
        id: 'PRJ-DEMO-TROPIS-01',
        projectNumber: 'PRJ-2026-001',
        name: 'Rumah Tinggal Modern Tropis 2 Lantai',
        client: 'Ir. Hendra Kusuma',
        clientName: 'Ir. Hendra Kusuma',
        location: 'BSD City, Tangerang Selatan',
        buildingType: 'Rumah Tinggal',
        status: 'in_progress',
        progress: 33,
        totalRab: 813111324,
        createdAt: '2026-08-10T08:00:00.000Z',
        updatedAt: '2026-08-14T10:24:00.000Z',
        itemsCount: 6,
        sections: [
          {
            id: 'sec-1',
            code: 'DIV-01',
            name: 'Pekerjaan Persiapan & Pengukuran',
            subtotal: 12038250,
            items: [
              {
                id: 'it-1',
                sectionId: 'sec-1',
                itemNumber: '1.1',
                code: 'A.2.2.1.1',
                description: 'Pengukuran dan Pemasangan Bowplank',
                specification: 'Kayu 5/7 & papan 2/20 terpasang presisi',
                volume: 124.5,
                unit: 'm¹',
                materialPrice: 30500,
                laborPrice: 18000,
                equipmentPrice: 0,
                unitPrice: 48500,
                totalPrice: 6038250,
                verificationStatus: 'VERIFIED',
              },
              {
                id: 'it-2',
                sectionId: 'sec-1',
                itemNumber: '1.2',
                code: 'A.2.1.1.2',
                description: 'Pembersihan Lapangan & Perataan Lahan',
                specification: 'Pembersihan semak & puing sisa galian',
                volume: 150,
                unit: 'm²',
                materialPrice: 0,
                laborPrice: 25000,
                equipmentPrice: 15000,
                unitPrice: 40000,
                totalPrice: 6000000,
                verificationStatus: 'VERIFIED',
              },
            ],
          },
          {
            id: 'sec-2',
            code: 'DIV-02',
            name: 'Pekerjaan Tanah & Pondasi',
            subtotal: 5878840,
            items: [
              {
                id: 'it-3',
                sectionId: 'sec-2',
                itemNumber: '2.1',
                code: 'A.2.3.1.1',
                description: 'Galian Tanah Pondasi Footplat Kedalaman 2m',
                specification: 'Tanah keras kedalaman 2m',
                volume: 68.2,
                unit: 'm³',
                materialPrice: 0,
                laborPrice: 86200,
                equipmentPrice: 0,
                unitPrice: 86200,
                totalPrice: 5878840,
                verificationStatus: 'VERIFIED',
              },
            ],
          },
          {
            id: 'sec-3',
            code: 'DIV-03',
            name: 'Pekerjaan Struktur Beton Bertulang',
            subtotal: 230000000,
            items: [
              {
                id: 'it-4',
                sectionId: 'sec-3',
                itemNumber: '3.1',
                code: 'A.4.1.1.5',
                description: 'Beton K-300 Ready Mix untuk Kolom & Balok Lt. 1 & 2',
                specification: 'Mutu f\'c 25 MPa / K-300 slump 12±2 cm',
                volume: 184.0,
                unit: 'm³',
                materialPrice: 950000,
                laborPrice: 250000,
                equipmentPrice: 50000,
                unitPrice: 1250000,
                totalPrice: 230000000,
                verificationStatus: 'VERIFIED',
              },
            ],
          },
        ],
        costSummary: {
          directCost: 247917090,
          overheadPercent: 5,
          overheadAmount: 12395855,
          profitPercent: 5,
          profitAmount: 12395855,
          contingencyPercent: 0,
          contingencyAmount: 0,
          directorMarkupPercent: 0,
          directorMarkupNominal: 0,
          directorMarkupTotal: 0,
          showMarkupToEditor: false,
          showMarkupToClient: false,
          subtotalBeforeTax: 272708800,
          taxPercent: 11,
          taxAmount: 29997968,
          grandTotal: 302706768,
          costPerM2: 2450000,
        },
      };

      await exportProjectToPDF(sampleProject, sampleCompany, {
        subscriptionPlan: 'pro',
        isWatermarkRequired: false,
      });

      setExportBtnState('ready');
      setTimeout(() => setExportBtnState('idle'), 3000);
    } catch (err) {
      console.error('[Landing Export Error]:', err);
      setExportBtnState('idle');
    }
  };

  // SVG dimensions & path definitions
  // Rencana line: smooth curve across full 6 weeks
  const rencanaPath = 'M 30 105 C 100 102, 170 85, 250 55 C 320 28, 380 18, 430 14';
  // Realisasi line: curve from W0 to W4 (ends at x=370, y=26)
  const realisasiPath = 'M 30 105 C 100 102, 160 86, 240 54 C 300 32, 340 28, 370 26';
  const realisasiArea = 'M 30 105 C 100 102, 160 86, 240 54 C 300 32, 340 28, 370 26 L 370 115 L 30 115 Z';

  return (
    <section className="ez-reports-section" ref={sectionRef}>
      {/* Subtle blueprint grid & soft glow */}
      <div className="ez-reports-bg-grid" aria-hidden="true" />
      <div className="ez-reports-bg-glow" aria-hidden="true" />

      <div className="ez-reports-container">
        {/* Left Column: Copy & CTA */}
        <div className="ez-reports-left">
          <div className="ez-reports-eyebrow">
            <span className="ez-reports-eyebrow-pill">LAPORAN & EXPORT</span>
          </div>

          <h2 className="ez-reports-heading">
            Hasil kerja siap
            <br />
            <span className="ez-reports-gradient-text">digunakan.</span>
          </h2>

          <p className="ez-reports-desc">
            Export RAB, BOQ, rekapitulasi, kurva S, dan laporan proyek
            dalam format PDF maupun Excel.
          </p>

          <div className="ez-reports-cta-group">
            <button
              onClick={onOpenWorkspace}
              className="ez-btn-primary-pill ez-reports-cta-btn"
              aria-label="Lihat Semua Laporan"
            >
              <span>Lihat Semua Laporan</span>
              <ArrowRight size={16} className="ez-reports-arrow-icon" />
            </button>
          </div>

          {/* Value props list */}
          <div className="ez-reports-features-list">
            <div className="ez-reports-feature-item">
              <CheckCircle2 size={15} className="ez-reports-check" />
              <span>Format Standar Tender & Owner</span>
            </div>
            <div className="ez-reports-feature-item">
              <CheckCircle2 size={15} className="ez-reports-check" />
              <span>Formula Matematika Excel Tetap Utuh</span>
            </div>
            <div className="ez-reports-feature-item">
              <CheckCircle2 size={15} className="ez-reports-check" />
              <span>Kop Surat & Stempel Siap Cetak</span>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Report Generation Workspace */}
        <div className="ez-reports-right">
          <div
            className={`ez-reports-stack-box ${isCardHovered ? 'is-card-hovered' : ''} ${isSettled ? 'is-settled-idle' : ''}`}
            onMouseEnter={() => setIsCardHovered(true)}
            onMouseLeave={() => setIsCardHovered(false)}
          >
            {/* Top Workspace System Strip */}
            <div className="ez-reports-system-header">
              <div className="ez-reports-system-title">
                <span className="ez-reports-dot-pulse" />
                <span>REPORT GENERATION ENGINE</span>
              </div>
              <div className="ez-reports-system-badge">
                <ShieldCheck size={12} />
                <span>Siap Digunakan</span>
              </div>
            </div>

            {/* 1 & 2. Format Badges (PDF & Excel with micro-animations & tooltips) */}
            <div className="ez-export-badges-row">
              {/* PDF Badge */}
              <div
                className={`ez-export-badge pdf ${pdfStatus === 'ready' ? 'is-ready' : ''} ${pdfStatus === 'preparing' ? 'is-preparing' : ''}`}
                onMouseEnter={() => setHoveredBadge('pdf')}
                onMouseLeave={() => setHoveredBadge(null)}
              >
                <div className="ez-badge-icon-wrap pdf-icon">
                  <FileText size={16} />
                </div>
                <div className="ez-badge-text-wrap">
                  {pdfStatus === 'preparing' ? (
                    <span className="ez-badge-loading">
                      <span className="ez-badge-mini-spinner" />
                      Menyiapkan PDF...
                    </span>
                  ) : pdfStatus === 'ready' ? (
                    <span className="ez-badge-content">
                      <Check size={13} className="ez-badge-check-icon" />
                      PDF Siap Cetak
                    </span>
                  ) : (
                    <span>PDF Siap Cetak</span>
                  )}
                </div>
                {hoveredBadge === 'pdf' && (
                  <div className="ez-badge-tooltip">Siap dicetak</div>
                )}
              </div>

              {/* Excel Badge */}
              <div
                className={`ez-export-badge xlsx ${excelReady ? 'is-ready' : ''}`}
                onMouseEnter={() => setHoveredBadge('excel')}
                onMouseLeave={() => setHoveredBadge(null)}
              >
                <div className="ez-badge-icon-wrap xlsx-icon">
                  <FileSpreadsheet size={16} />
                </div>
                <div className="ez-badge-text-wrap">
                  {excelReady ? (
                    <span className="ez-badge-content">
                      <Check size={13} className="ez-badge-check-icon" />
                      Excel Berformula (.xlsx)
                    </span>
                  ) : (
                    <span>Excel Berformula (.xlsx)</span>
                  )}
                </div>
                {hoveredBadge === 'excel' && (
                  <div className="ez-badge-tooltip">Formula tetap aktif</div>
                )}
              </div>
            </div>

            {/* 3, 4, 5. HERO VISUAL: Kurva S Rencana vs Realisasi */}
            <div className={`ez-kurva-container ${chartActive ? 'is-active' : ''}`}>
              {/* Kurva Header */}
              <div className="ez-kurva-header">
                <div className="ez-kurva-title">
                  <TrendingUp size={16} className="ez-kurva-icon" />
                  <span>Kurva S Rencana vs Realisasi</span>
                </div>
                <div className="ez-kurva-status-wrap">
                  {trackStatus === 'analyzing' ? (
                    <span className="ez-kurva-status-badge analyzing">
                      <span className="ez-status-dot-pulse" />
                      Analisis...
                    </span>
                  ) : (
                    <span className="ez-kurva-status-badge on-track">
                      <Check size={12} />
                      On Track (+1.2%)
                    </span>
                  )}
                </div>
              </div>

              {/* Kurva Chart Area (SVG) */}
              <div className="ez-kurva-chart-area">
                <svg
                  viewBox="0 0 460 130"
                  className="ez-kurva-svg"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    {/* Area fill gradient for Realisasi */}
                    <linearGradient id="ezKurvaAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
                      <stop offset="85%" stopColor="#38bdf8" stopOpacity="0.04" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                    </linearGradient>

                    {/* Shimmer on Realisasi path */}
                    <linearGradient id="ezLineGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="50%" stopColor="#2563eb" />
                      <stop offset="100%" stopColor="#60a5fa" />
                    </linearGradient>
                  </defs>

                  {/* Extremely subtle horizontal grid lines */}
                  <line x1="30" y1="20" x2="430" y2="20" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="30" y1="50" x2="430" y2="50" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="30" y1="80" x2="430" y2="80" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="30" y1="110" x2="430" y2="110" stroke="#e2e8f0" strokeWidth="1" />

                  {/* Y-axis percentage labels */}
                  <text x="22" y="24" className="ez-chart-axis-label" textAnchor="end">100%</text>
                  <text x="22" y="68" className="ez-chart-axis-label" textAnchor="end">50%</text>
                  <text x="22" y="113" className="ez-chart-axis-label" textAnchor="end">0%</text>

                  {/* 1. Rencana line (subtle dashed gray line) */}
                  <path
                    d={rencanaPath}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="1.75"
                    strokeDasharray="4 4"
                    className={`ez-path-rencana ${rencanaDrawn ? 'is-drawn' : ''}`}
                  />

                  {/* 2. Gradient Area for Realisasi */}
                  <path
                    d={realisasiArea}
                    fill="url(#ezKurvaAreaGrad)"
                    className="ez-path-area"
                    style={{
                      opacity: realisasiProgress > 15 ? (realisasiProgress / 100) : 0,
                      transition: 'opacity 0.4s ease'
                    }}
                  />

                  {/* 3. Realisasi line (solid electric blue line, progressive drawing) */}
                  <path
                    d={realisasiPath}
                    fill="none"
                    stroke="url(#ezLineGlow)"
                    strokeWidth="2.75"
                    strokeLinecap="round"
                    strokeDasharray="450"
                    strokeDashoffset={450 - (450 * realisasiProgress) / 100}
                    className="ez-path-realisasi"
                  />

                  {/* 4. Data Points & Tooltips */}
                  {S_POINTS.map((point, idx) => {
                    const isPassed = realisasiProgress >= (idx + 1) * 25 - 5;
                    const isHovered = hoveredPoint === idx;
                    const isAutoTooltip = activeTooltipIndex === idx;
                    const showTooltip = isHovered || isAutoTooltip;

                    return (
                      <g
                        key={point.week}
                        className={`ez-chart-point-group ${pointsVisible && isPassed ? 'is-visible' : 'is-hidden'}`}
                        onMouseEnter={() => setHoveredPoint(idx)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      >
                        {/* Outer ping */}
                        {isPassed && idx === 3 && (
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r="8"
                            className="ez-point-ping"
                          />
                        )}

                        {/* Point dot */}
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={isHovered ? 5.5 : 4}
                          className="ez-chart-point-dot"
                        />

                        {/* X-axis week label */}
                        <text
                          x={point.x}
                          y="125"
                          className="ez-chart-x-label"
                          textAnchor="middle"
                        >
                          {point.week}
                        </text>

                        {/* Interactive Tooltip */}
                        {showTooltip && (
                          <g className="ez-chart-tooltip-group" transform={`translate(${point.x}, ${point.y - 14})`}>
                            <rect
                              x="-42"
                              y="-22"
                              width="84"
                              height="20"
                              rx="5"
                              className="ez-chart-tooltip-bg"
                            />
                            <text
                              x="0"
                              y="-8"
                              textAnchor="middle"
                              className="ez-chart-tooltip-text"
                            >
                              {point.label}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Chart Legend Footer */}
              <div className="ez-kurva-legend">
                <div className="ez-legend-item">
                  <span className="ez-legend-dash" />
                  <span>Rencana Target</span>
                </div>
                <div className="ez-legend-item">
                  <span className="ez-legend-solid" />
                  <span>Realisasi Progres</span>
                </div>
                <div className="ez-legend-delta">
                  <span>Varian Terkendali: +1.2%</span>
                </div>
              </div>
            </div>

            {/* 6. Data Pulse Connector to Document Preview */}
            <div className="ez-reports-connector-row" aria-hidden="true">
              <div className="ez-connector-line">
                <div className={`ez-connector-pulse ${dataPulseActive ? 'is-pulsing' : ''}`} />
              </div>
              <div className="ez-connector-label">
                <span className="ez-pulse-dot-tiny" />
                <span>Laporan siap dicetak & diexport</span>
              </div>
            </div>

            {/* 7. Document Preview (Mini Document Card that slides up) */}
            <div className={`ez-doc-preview-card ${previewVisible ? 'is-visible' : 'is-hidden'}`}>
              <div className="ez-doc-preview-header">
                <div className="ez-doc-title-box">
                  <span className="ez-doc-tag">DOKUMEN UTAMA</span>
                  <h4 className="ez-doc-project-name">Laporan Lengkap Proyek Villa Modern</h4>
                </div>
                <div className="ez-doc-ready-chip">
                  <CheckCircle2 size={12} />
                  <span>Siap Cetak</span>
                </div>
              </div>

              {/* Checklist document chips */}
              <div className="ez-doc-chips-grid">
                <div className="ez-doc-chip">
                  <Check size={11} className="ez-chip-check" />
                  <span>RAB Proyek</span>
                </div>
                <div className="ez-doc-chip">
                  <Check size={11} className="ez-chip-check" />
                  <span>BOQ Tender</span>
                </div>
                <div className="ez-doc-chip">
                  <Check size={11} className="ez-chip-check" />
                  <span>Kurva S Master</span>
                </div>
                <div className="ez-doc-chip">
                  <Check size={11} className="ez-chip-check" />
                  <span>Rekapitulasi Biaya</span>
                </div>
              </div>
            </div>

            {/* 8 & 10. Bottom Actions: Kop Surat & Stempel + 1-Click Export */}
            <div className="ez-reports-footer-bar">
              {/* 10. Kop Surat & Stempel Otomatis Preview */}
              <div className="ez-kop-stempel-box">
                <div className="ez-stamp-mini-icon">
                  <Stamp size={14} />
                </div>
                <div className="ez-kop-labels">
                  <span className="ez-kop-main-title">Kop Surat & Stempel Otomatis</span>
                  <div className="ez-kop-tags">
                    <span className="ez-kop-check-pill">
                      <Check size={10} /> KOP
                    </span>
                    <span className="ez-kop-check-pill">
                      <Check size={10} /> STEMPEL
                    </span>
                  </div>
                </div>
              </div>

              {/* 8. Export 1-Click Button */}
              <button
                onClick={handleExportClick}
                className={`ez-export-oneclick-btn ${exportBtnState}`}
                aria-label="Export 1-Click"
              >
                {exportBtnState === 'generating' ? (
                  <>
                    <span className="ez-btn-mini-spinner" />
                    <span>Generating...</span>
                  </>
                ) : exportBtnState === 'ready' ? (
                  <>
                    <Check size={14} className="ez-export-success-icon" />
                    <span>Export Ready</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>Export 1-Click</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ExactReportsExport;
