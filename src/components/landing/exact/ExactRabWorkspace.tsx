import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  FileSpreadsheet,
  Plus,
  Check,
  Database,
  Edit2,
  MoreHorizontal,
  Loader2,
  TrendingUp,
  Filter,
  Layers,
  Sparkles
} from 'lucide-react';

interface ExactRabWorkspaceProps {
  onOpenWorkspace?: () => void;
}

interface RabRowItem {
  no: string;
  ahspCode: string;
  desc: string;
  volTarget: number;
  volUnit: string;
  priceTarget: number;
  totalTarget: number;
  cumulativeTotal: number;
  category: string;
}

const RAB_DATA: RabRowItem[] = [
  {
    no: '01',
    ahspCode: 'A.2.2.1.9',
    desc: 'Pekerjaan Pembersihan Lahan',
    volTarget: 150.0,
    volUnit: 'm²',
    priceTarget: 18500,
    totalTarget: 2775000,
    cumulativeTotal: 2775000,
    category: 'Persiapan'
  },
  {
    no: '02',
    ahspCode: 'A.2.3.1.1',
    desc: 'Galian Tanah Pondasi',
    volTarget: 42.5,
    volUnit: 'm³',
    priceTarget: 85000,
    totalTarget: 3612500,
    cumulativeTotal: 6387500,
    category: 'Tanah'
  },
  {
    no: '03',
    ahspCode: 'A.3.2.1.2',
    desc: 'Pasangan Pondasi Batu Kali 1:4',
    volTarget: 28.0,
    volUnit: 'm³',
    priceTarget: 920000,
    totalTarget: 25760000,
    cumulativeTotal: 32147500,
    category: 'Struktur Bawah'
  },
  {
    no: '04',
    ahspCode: 'A.4.1.1.5',
    desc: 'Pekerjaan Beton Sloof 15/20',
    volTarget: 4.8,
    volUnit: 'm³',
    priceTarget: 4250000,
    totalTarget: 20400000,
    cumulativeTotal: 52547500,
    category: 'Beton'
  },
  {
    no: '05',
    ahspCode: 'A.4.1.1.6',
    desc: 'Pekerjaan Kolom Struktur 20/20',
    volTarget: 6.4,
    volUnit: 'm³',
    priceTarget: 4650000,
    totalTarget: 29760000,
    cumulativeTotal: 82307500,
    category: 'Struktur Atas'
  }
];

const formatRupiah = (val: number): string => {
  return 'Rp ' + Math.round(val).toLocaleString('id-ID');
};

export const ExactRabWorkspace: React.FC<ExactRabWorkspaceProps> = ({ onOpenWorkspace }) => {
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);
  const [currentRowStage, setCurrentRowStage] = useState<'scan' | 'vol' | 'price' | 'subtotal' | 'settled'>('scan');
  const [completedRows, setCompletedRows] = useState<number>(0);
  const [displayTotalRab, setDisplayTotalRab] = useState<number>(0);
  const [isTotalPulsing, setIsTotalPulsing] = useState<boolean>(false);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Animated values initialized with live targets so table is never blank
  const [rowVolumes, setRowVolumes] = useState<number[]>(RAB_DATA.map((r) => r.volTarget));
  const [rowPrices, setRowPrices] = useState<number[]>(RAB_DATA.map((r) => r.priceTarget));
  const [rowTotals, setRowTotals] = useState<number[]>(RAB_DATA.map((r) => r.totalTarget));

  const sectionRef = useRef<HTMLDivElement>(null);
  const isVisibleRef = useRef<boolean>(true); // Default true so it never stalls

  // prefers-reduced-motion check
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Auto-start and viewport observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isVisibleRef.current = entry.isIntersecting;
        });
      },
      { threshold: 0.15 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const resetCycle = () => {
    setActiveRowIndex(0);
    setCurrentRowStage('scan');
    setCompletedRows(0);
    setDisplayTotalRab(0);
  };

  // Main Live Continuous Pipeline
  useEffect(() => {
    if (prefersReducedMotion || isPaused || !isVisibleRef.current) return;
    if (activeRowIndex < 0 || activeRowIndex >= RAB_DATA.length) return;

    const row = RAB_DATA[activeRowIndex];
    let stepTimer: ReturnType<typeof setTimeout>;

    if (currentRowStage === 'scan') {
      // Step 1: AHSP Code scan and row activation
      stepTimer = setTimeout(() => {
        setCurrentRowStage('vol');
      }, 500);
    } else if (currentRowStage === 'vol') {
      // Step 2: Volume counts up dynamically
      const targetVol = row.volTarget;
      const startVol = Number((targetVol * 0.4).toFixed(2));
      const steps = 8;
      let step = 0;

      const vInterval = setInterval(() => {
        step++;
        const factor = step / steps;
        const current = Number((startVol + (targetVol - startVol) * factor).toFixed(2));
        setRowVolumes((prev) => {
          const next = [...prev];
          next[activeRowIndex] = current;
          return next;
        });

        if (step >= steps) {
          clearInterval(vInterval);
          setRowVolumes((prev) => {
            const next = [...prev];
            next[activeRowIndex] = targetVol;
            return next;
          });
        }
      }, 35);

      stepTimer = setTimeout(() => {
        clearInterval(vInterval);
        setCurrentRowStage('price');
      }, 550);
    } else if (currentRowStage === 'price') {
      // Step 3: Unit price verified from AHSP database
      stepTimer = setTimeout(() => {
        setCurrentRowStage('subtotal');
      }, 600);
    } else if (currentRowStage === 'subtotal') {
      // Step 4: Subtotal calculated & Total RAB increments smoothly
      const prevTotal = activeRowIndex === 0 ? 0 : RAB_DATA[activeRowIndex - 1].cumulativeTotal;
      const targetTotal = row.cumulativeTotal;
      const targetSubtotal = row.totalTarget;
      const startSubtotal = Math.round(targetSubtotal * 0.3);
      const steps = 10;
      let step = 0;

      setIsTotalPulsing(true);

      const countInterval = setInterval(() => {
        step++;
        const factor = step / steps;
        const curSub = Math.round(startSubtotal + (targetSubtotal - startSubtotal) * factor);
        const curTot = Math.round(prevTotal + (targetTotal - prevTotal) * factor);

        setRowTotals((prev) => {
          const next = [...prev];
          next[activeRowIndex] = curSub;
          return next;
        });

        setDisplayTotalRab(curTot);

        if (step >= steps) {
          clearInterval(countInterval);
          setRowTotals((prev) => {
            const next = [...prev];
            next[activeRowIndex] = targetSubtotal;
            return next;
          });
          setDisplayTotalRab(targetTotal);
        }
      }, 35);

      stepTimer = setTimeout(() => {
        clearInterval(countInterval);
        setIsTotalPulsing(false);
        setCompletedRows(activeRowIndex + 1);
        setCurrentRowStage('settled');
      }, 650);
    } else if (currentRowStage === 'settled') {
      // Step 5: Advance to next row
      if (activeRowIndex + 1 < RAB_DATA.length) {
        stepTimer = setTimeout(() => {
          setActiveRowIndex((prev) => prev + 1);
          setCurrentRowStage('scan');
        }, 400);
      } else {
        // Complete cycle reached!
        setIsTotalPulsing(true);
        setTimeout(() => setIsTotalPulsing(false), 1400);

        // Pause 3.5 seconds in completed state, then loop smoothly
        stepTimer = setTimeout(() => {
          if (isVisibleRef.current && !isPaused) {
            resetCycle();
          }
        }, 3600);
      }
    }

    return () => clearTimeout(stepTimer);
  }, [activeRowIndex, currentRowStage, isPaused, prefersReducedMotion]);

  // Click on row to focus/calculate immediately
  const handleRowClick = (idx: number) => {
    setActiveRowIndex(idx);
    setCurrentRowStage('scan');
  };

  return (
    <section className="ez-rab-section" ref={sectionRef}>
      {/* Background Subtle Blueprint Grid & Radial Glow */}
      <div className="ez-rab-bg-grid" aria-hidden="true" />
      <div className="ez-rab-bg-glow" aria-hidden="true" />

      <div className="ez-rab-container">
        {/* Left Column: Copy & CTA */}
        <div className="ez-rab-left">
          <div className="ez-rab-eyebrow">
            <span className="ez-rab-eyebrow-pill">RAB WORKSPACE</span>
          </div>

          <h2 className="ez-rab-heading">
            Susun RAB seperti
            <br />
            <span className="ez-rab-gradient-text">spreadsheet profesional.</span>
          </h2>

          <p className="ez-rab-desc">
            Dengan perhitungan otomatis, integrasi AHSP, dan kontrol penuh di setiap detail pekerjaan.
          </p>

          <div className="ez-rab-cta-group">
            <button
              onClick={onOpenWorkspace}
              className="ez-btn-primary-pill ez-rab-cta-btn"
              aria-label="Lihat Demo RAB"
            >
              <span>Lihat Demo RAB</span>
              <ArrowRight size={16} className="ez-rab-cta-arrow" />
            </button>
          </div>

          {/* Value Highlights / Badges */}
          <div className="ez-rab-features-row">
            <div className="ez-rab-feat-item">
              <div className="ez-rab-feat-dot" />
              <span>Database AHSP Terintegrasi</span>
            </div>
            <div className="ez-rab-feat-item">
              <div className="ez-rab-feat-dot" />
              <span>Formula Otomatis PU</span>
            </div>
            <div className="ez-rab-feat-item">
              <div className="ez-rab-feat-dot" />
              <span>Multi-Format Export</span>
            </div>
          </div>
        </div>

        {/* Right Column: Real-Time Spreadsheet Window */}
        <div
          className="ez-spreadsheet-window"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Window Topbar */}
          <div className="ez-sheet-topbar">
            <div className="ez-sheet-top-left">
              <div className="ez-cad-dots">
                <span className="ez-cad-dot red" />
                <span className="ez-cad-dot yellow" />
                <span className="ez-cad-dot green" />
              </div>
              <div className="ez-sheet-file-title">
                <FileSpreadsheet size={15} className="ez-sheet-file-icon" />
                <span>RAB_Proyek_Gedung_B.xlsx</span>
                <span className="ez-sheet-live-tag">LIVE SYNC</span>
              </div>
            </div>

            {/* Mini Progress Indicator: 5 / 12 pekerjaan */}
            <div className="ez-rab-mini-progress">
              <div className="ez-progress-header">
                <span className="ez-progress-label">RAB PROGRESS</span>
                <span className="ez-progress-count">
                  <b>{Math.min(12, Math.max(1, activeRowIndex + 1))}</b> / 12 pekerjaan
                </span>
              </div>
              <div className="ez-progress-track">
                <div
                  className="ez-progress-bar"
                  style={{ width: `${(Math.min(12, Math.max(1, activeRowIndex + 1)) / 12) * 100}%` }}
                />
              </div>
            </div>

            {/* Topbar Quick Action Buttons */}
            <div className="ez-sheet-top-actions">
              <button onClick={onOpenWorkspace} className="ez-sheet-btn-secondary" title="Filter Kategori">
                <Filter size={12} />
                <span>Filter</span>
              </button>
              <button onClick={onOpenWorkspace} className="ez-sheet-btn-primary">
                <Plus size={12} />
                <span>Baris Baru</span>
              </button>
            </div>
          </div>

          {/* Floating Total RAB Card */}
          <div className={`ez-sheet-total-badge ${isTotalPulsing ? 'pulse-glow' : ''}`}>
            <div className="ez-total-top-row">
              <span className="ez-total-label">TOTAL RAB PROYEK</span>
              <span className="ez-total-badge-status">
                <TrendingUp size={12} />
                <span>Real-Time</span>
              </span>
            </div>
            <div className="ez-total-amount">
              <b>{formatRupiah(displayTotalRab || 82307500)}</b>
            </div>
            <div className="ez-total-subtext">
              {completedRows >= RAB_DATA.length
                ? '✓ 5 Item pekerjaan terverifikasi'
                : `Menghitung item ${activeRowIndex + 1} dari 12...`}
            </div>
          </div>

          {/* Interactive Spreadsheet Table */}
          <div className="ez-sheet-table-wrapper">
            <table className="ez-sheet-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>No</th>
                  <th style={{ width: '108px', textAlign: 'left' }}>Kode AHSP</th>
                  <th style={{ minWidth: '185px' }}>Uraian Pekerjaan</th>
                  <th style={{ width: '85px', textAlign: 'right' }}>Volume</th>
                  <th style={{ width: '50px', textAlign: 'center' }}>Sat</th>
                  <th style={{ width: '125px', textAlign: 'right' }}>Harga Satuan</th>
                  <th style={{ width: '138px', textAlign: 'right' }}>Jumlah Harga</th>
                  <th style={{ width: '38px', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {RAB_DATA.map((row, idx) => {
                  const isActive = idx === activeRowIndex;
                  const isDone = idx < activeRowIndex || completedRows >= RAB_DATA.length;
                  const isHover = hoveredRow === idx;

                  return (
                    <tr
                      key={row.no}
                      onClick={() => handleRowClick(idx)}
                      className={`ez-rab-row ${isActive ? 'active-processing' : ''} ${
                        isDone ? 'row-settled' : ''
                      }`}
                      onMouseEnter={() => setHoveredRow(idx)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Column 1: No with Live Cursor Indicator */}
                      <td className="ez-td-no">
                        <div className="ez-no-wrapper">
                          {isActive && <span className="ez-live-cursor-dot" />}
                          <span>{row.no}</span>
                        </div>
                      </td>

                      {/* Column 2: Kode AHSP with Live Animated Badge */}
                      <td className="ez-td-ahsp-code">
                        <div className="ez-ahsp-badge-wrapper">
                          <span
                            className={`ez-ahsp-code-pill ${
                              isActive ? 'active-sync' : isDone ? 'verified' : ''
                            }`}
                          >
                            {isActive ? (
                              <Database size={10} className="ez-ahsp-icon animate-pulse text-blue-600" />
                            ) : (
                              <Check size={9} className="ez-ahsp-icon-check" />
                            )}
                            <span className="ez-ahsp-text">{row.ahspCode}</span>
                            {isActive && <span className="ez-ahsp-scan-shimmer" />}
                          </span>
                        </div>
                      </td>

                      {/* Column 3: Uraian Pekerjaan */}
                      <td className="ez-td-desc">
                        <div className="ez-desc-content">
                          <span className="ez-desc-text">{row.desc}</span>
                          {isActive && (
                            <span className="ez-row-processing-pill">
                              <Loader2 size={10} className="animate-spin" />
                              <span>Calculating...</span>
                            </span>
                          )}
                          {isDone && !isActive && <span className="ez-row-done-pill">✓ Added</span>}
                        </div>
                      </td>

                      {/* Column 4: Volume */}
                      <td className="ez-td-vol">
                        <span className={`ez-num-font ${isActive && currentRowStage === 'vol' ? 'active-counting' : ''}`}>
                          {(rowVolumes[idx] || row.volTarget).toFixed(2)}
                        </span>
                      </td>

                      {/* Column 5: Satuan */}
                      <td className="ez-td-sat">
                        <span className="ez-sat-pill">{row.volUnit}</span>
                      </td>

                      {/* Column 6: Harga Satuan with AHSP Micro-Badge */}
                      <td className="ez-td-price">
                        <div className="ez-price-wrapper">
                          {isActive && (currentRowStage === 'price' || currentRowStage === 'subtotal') && (
                            <div className="ez-ahsp-micro-badge">
                              <Database size={9} />
                              <span>AHSP ✓ Terhubung</span>
                            </div>
                          )}
                          <span className="ez-num-font">
                            {formatRupiah(rowPrices[idx] || row.priceTarget)}
                          </span>
                        </div>
                      </td>

                      {/* Column 7: Jumlah Harga (Visual Focal Point) */}
                      <td className="ez-td-total">
                        <span
                          className={`ez-total-number ${
                            isActive && currentRowStage === 'subtotal' ? 'active-counting' : ''
                          }`}
                        >
                          {formatRupiah(rowTotals[idx] || row.totalTarget)}
                        </span>
                      </td>

                      {/* Column 8: Hover Quick Action Icons */}
                      <td className="ez-td-actions">
                        <div className={`ez-row-actions ${isHover ? 'show' : ''}`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenWorkspace?.();
                            }}
                            className="ez-action-icon-btn"
                            title="Edit Baris"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenWorkspace?.();
                            }}
                            className="ez-action-icon-btn"
                            title="Lainnya"
                          >
                            <MoreHorizontal size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Table Summary Footer */}
          <div className="ez-sheet-footer">
            <div className="ez-footer-left">
              <span className="ez-sync-indicator" />
              <span>Database AHSP Standar PUPR terhubung secara otomatis</span>
            </div>
            <div className="ez-footer-right">
              <span className="ez-footer-subtotal-label">Subtotal (5 Item):</span>
              <span className="ez-footer-subtotal-val">
                {formatRupiah(displayTotalRab || 82307500)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
