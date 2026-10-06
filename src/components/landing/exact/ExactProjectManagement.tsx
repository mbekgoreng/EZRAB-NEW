import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Activity,
  TrendingUp,
  ShieldCheck,
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import villaThumb from '../../../assets/template-bertingkat.jpg';

interface ExactProjectManagementProps {
  onOpenWorkspace?: () => void;
}

interface ActivityItem {
  id: string;
  title: string;
  time: string;
  category: string;
}

const ACTIVITIES: ActivityItem[] = [
  { id: 'act-1', title: 'Volume pondasi diperbarui', time: 'Baru saja', category: 'Volume' },
  { id: 'act-2', title: 'RAB proyek diperbarui', time: '3m lalu', category: 'Cost' },
  { id: 'act-3', title: 'AHSP terhubung', time: '8m lalu', category: 'Database' }
];

export const ExactProjectManagement: React.FC<ExactProjectManagementProps> = ({ onOpenWorkspace }) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isVisibleRef = useRef<boolean>(true);

  // prefers-reduced-motion check
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Animation timeline states
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [thumbLoaded, setThumbLoaded] = useState<boolean>(false);
  const [titleVisible, setTitleVisible] = useState<boolean>(false);
  const [progressValue, setProgressValue] = useState<number>(prefersReducedMotion ? 68 : 0);
  const [progressHighlight, setProgressHighlight] = useState<boolean>(false);
  const [budgetText, setBudgetText] = useState<string>(prefersReducedMotion ? 'Rp 1,45 M' : 'Rp 0');
  const [deadlineToShow, setDeadlineToShow] = useState<boolean>(prefersReducedMotion);
  const [activeActivitiesCount, setActiveActivitiesCount] = useState<number>(prefersReducedMotion ? 3 : 0);
  const [healthVisible, setHealthVisible] = useState<boolean>(prefersReducedMotion);
  const [isSettled, setIsSettled] = useState<boolean>(prefersReducedMotion);

  // Highlighting & cursor targets
  const [cursorStep, setCursorStep] = useState<'idle' | 'progress' | 'budget' | 'status' | 'hidden'>('hidden');
  const [activeHighlight, setActiveHighlight] = useState<'none' | 'progress' | 'budget' | 'status'>('none');

  // Hover states
  const [isThumbHovered, setIsThumbHovered] = useState<boolean>(false);
  const [isCardHovered, setIsCardHovered] = useState<boolean>(false);

  // IntersectionObserver to start animation once in viewport
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

  // Master Timeline execution (starts when section becomes visible)
  useEffect(() => {
    if (!hasStarted || prefersReducedMotion) return;

    const timeouts: ReturnType<typeof setTimeout>[] = [];

    // 0.3s: thumbnail subtle zoom (scale 1.02 -> 1.00)
    timeouts.push(setTimeout(() => setThumbLoaded(true), 300));

    // 0.5s: project title appears
    timeouts.push(setTimeout(() => setTitleVisible(true), 500));

    // 0.8s: cursor moves towards progress bar
    timeouts.push(setTimeout(() => {
      setCursorStep('progress');
    }, 800));

    // 1.0s: progress bar starts counting: 0 -> 15 -> 32 -> 48 -> 68
    timeouts.push(setTimeout(() => {
      setProgressHighlight(true);
      setActiveHighlight('progress');
      setProgressValue(15);
    }, 1000));

    timeouts.push(setTimeout(() => setProgressValue(32), 1250));
    timeouts.push(setTimeout(() => setProgressValue(48), 1500));
    timeouts.push(setTimeout(() => {
      setProgressValue(68);
      // moving highlight sweeps once
      setTimeout(() => setProgressHighlight(false), 500);
    }, 1800));

    // 2.0s: Budget count-up starts (Rp 0 -> Rp 350 Jt -> Rp 780 Jt -> Rp 1,12 M -> Rp 1,45 M)
    timeouts.push(setTimeout(() => {
      setCursorStep('budget');
      setActiveHighlight('budget');
      setBudgetText('Rp 350 Jt');
    }, 2000));

    timeouts.push(setTimeout(() => setBudgetText('Rp 780 Jt'), 2150));
    timeouts.push(setTimeout(() => setBudgetText('Rp 1,12 M'), 2300));
    timeouts.push(setTimeout(() => {
      setBudgetText('Rp 1,45 M');
    }, 2450));

    // 2.5s: Deadline appears with days remaining + cursor moves to status
    timeouts.push(setTimeout(() => {
      setDeadlineToShow(true);
      setCursorStep('status');
      setActiveHighlight('status');
    }, 2500));

    // 2.8s: Activity 1 appears
    timeouts.push(setTimeout(() => setActiveActivitiesCount(1), 2800));

    // 3.2s: Activity 2 appears
    timeouts.push(setTimeout(() => setActiveActivitiesCount(2), 3200));

    // 3.6s: Activity 3 appears
    timeouts.push(setTimeout(() => setActiveActivitiesCount(3), 3600));

    // 4.0s: Project Health appears
    timeouts.push(setTimeout(() => {
      setHealthVisible(true);
      setActiveHighlight('none');
    }, 4000));

    // 4.3s: Digital cursor parks & fades away
    timeouts.push(setTimeout(() => {
      setCursorStep('hidden');
    }, 4300));

    // 4.5s: All settle into calm idle state
    timeouts.push(setTimeout(() => {
      setIsSettled(true);
    }, 4500));

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [hasStarted, prefersReducedMotion]);

  return (
    <section className="ez-pm-section" ref={sectionRef}>
      {/* Background blueprint grid & radial glow */}
      <div className="ez-pm-bg-grid" aria-hidden="true" />
      <div className="ez-pm-bg-glow" aria-hidden="true" />

      <div className="ez-pm-container">
        {/* Left Column: Copy & CTA */}
        <div className="ez-pm-left">
          <div className="ez-pm-eyebrow">
            <span className="ez-pm-eyebrow-pill">PROJECT MANAGEMENT</span>
          </div>

          <h2 className="ez-pm-heading">
            Kelola semua proyek
            <br />
            <span className="ez-pm-gradient-text">dalam satu tempat.</span>
          </h2>

          <p className="ez-pm-desc">
            Pantau progres, atur tim, dan akses semua data proyek
            dengan mudah dan terstruktur.
          </p>

          <div className="ez-pm-cta-group">
            <button
              onClick={onOpenWorkspace}
              className="ez-btn-primary-pill ez-pm-cta-btn"
              aria-label="Lihat Fitur Project"
            >
              <span>Lihat Fitur Project</span>
              <ArrowRight size={16} className="ez-pm-arrow-icon" />
            </button>
          </div>

          {/* Micro trust indicators */}
          <div className="ez-pm-trust-row">
            <div className="ez-pm-trust-item">
              <Building2 size={15} className="ez-pm-trust-icon" />
              <span>Multi-proyek Terkoordinasi</span>
            </div>
            <div className="ez-pm-trust-item">
              <Layers size={15} className="ez-pm-trust-icon" />
              <span>Real-time Timeline & Cost</span>
            </div>
          </div>
        </div>

        {/* Right Column: Live Project Management Dashboard */}
        <div className="ez-pm-right">
          <div
            className={`ez-pm-card-mockup ${isCardHovered ? 'ez-pm-card-hovered' : ''} ${isSettled ? 'ez-pm-idle-state' : ''}`}
            onMouseEnter={() => setIsCardHovered(true)}
            onMouseLeave={() => setIsCardHovered(false)}
          >
            {/* Live Status Header Bar */}
            <div className="ez-pm-system-bar">
              <div className="ez-pm-system-left">
                <span className="ez-pm-pulse-beacon" />
                <span className="ez-pm-system-title">EZRAB PROJECT ENGINE</span>
                <span className="ez-pm-version-tag">LIVE v2.6</span>
              </div>
              <div className="ez-pm-system-right">
                <span className="ez-pm-status-pill">
                  <span className="ez-pm-live-dot" />
                  Sedang Berjalan
                </span>
              </div>
            </div>

            {/* 1. Project Header with Construction Thumbnail */}
            <div className="ez-pm-top-info">
              <div
                className={`ez-pm-thumb-wrapper ${thumbLoaded ? 'ez-pm-thumb-settled' : 'ez-pm-thumb-initial'} ${isThumbHovered ? 'is-hovered' : ''}`}
                onMouseEnter={() => setIsThumbHovered(true)}
                onMouseLeave={() => setIsThumbHovered(false)}
              >
                <img
                  src={villaThumb}
                  alt="Pembangunan Villa Modern 2 Lantai"
                  className="ez-pm-thumb"
                />
                <div className="ez-pm-thumb-overlay" />
                <div className="ez-pm-thumb-hover-label">
                  <span>LIHAT PROJECT</span>
                  <ExternalLink size={11} />
                </div>
              </div>

              <div className={`ez-pm-meta ${titleVisible ? 'ez-pm-meta-visible' : ''}`}>
                <div className="ez-pm-meta-category">RESIDENTIAL PROJECT</div>
                <h4>Pembangunan Villa Modern 2 Lantai</h4>
                <div className="ez-pm-meta-sub">
                  <span>Jl. Pantai Berawa, Canggu</span>
                  <span className="ez-pm-meta-divider">·</span>
                  <span className="ez-pm-meta-id">ID: PRJ-2026-08</span>
                </div>
              </div>
            </div>

            {/* 2 & 3. Progress Section with Smooth Count-Up & Moving Highlight */}
            <div className={`ez-pm-progress-section ${activeHighlight === 'progress' ? 'is-element-highlighted' : ''}`}>
              <div className="ez-pm-progress-header">
                <div className="ez-pm-progress-label-wrap">
                  <span className="ez-pm-progress-label">Progres Estimasi & Lapangan</span>
                  <span className="ez-pm-running-indicator">
                    <span className="ez-pm-green-dot" />
                    Sedang Berjalan
                  </span>
                </div>
                <div className="ez-pm-progress-percent">
                  <span className="ez-pm-percent-number">{progressValue}%</span>
                  <span className="ez-pm-percent-status">Selesai</span>
                </div>
              </div>

              <div className="ez-pm-progress-bar">
                <div
                  className="ez-pm-progress-fill"
                  style={{ width: `${progressValue}%` }}
                >
                  {progressHighlight && <div className="ez-pm-progress-shimmer-pulse" />}
                </div>
              </div>
            </div>

            {/* 8. SVG Data Connection Line (Progress -> Budget -> Deadline) */}
            <div className="ez-pm-connection-svg-wrap" aria-hidden="true">
              <svg className="ez-pm-connection-svg" viewBox="0 0 460 20" fill="none">
                <path
                  d="M 20 10 L 440 10"
                  stroke="#e2e8f0"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <path
                  d="M 20 10 L 440 10"
                  stroke="url(#ez-pm-pulse-gradient)"
                  strokeWidth="2"
                  className="ez-pm-pulsing-path"
                />
                <defs>
                  <linearGradient id="ez-pm-pulse-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
                    <stop offset="50%" stopColor="#2563eb" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* 5 & 6. Budget & Deadline Grid */}
            <div className="ez-pm-metrics-grid">
              {/* Metric 1: Budget */}
              <div className={`ez-pm-metric-card ${activeHighlight === 'budget' ? 'is-element-highlighted' : ''}`}>
                <div className="ez-pm-metric-header">
                  <span className="ez-pm-metric-caption">Total Anggaran</span>
                  <span className="ez-pm-badge-mini">RAB Live</span>
                </div>
                <div className="ez-pm-metric-val tabular-nums">
                  {budgetText}
                </div>
                <div className="ez-pm-metric-subtext">
                  Terintegrasi AHSP 2026
                </div>
              </div>

              {/* Metric 2: Deadline */}
              <div className={`ez-pm-metric-card ${deadlineToShow ? 'ez-pm-metric-show' : 'ez-pm-metric-hidden'}`}>
                <div className="ez-pm-metric-header">
                  <span className="ez-pm-metric-caption">Batas Waktu</span>
                  <span className="ez-pm-deadline-badge">
                    <Clock size={10} /> 128 hari tersisa
                  </span>
                </div>
                <div className="ez-pm-metric-val">
                  15 Des 2026
                </div>
                <div className="ez-pm-metric-subtext">
                  Sesuai Kurva S Master
                </div>
              </div>

              {/* Metric 3: Project Health */}
              <div className={`ez-pm-metric-card ${healthVisible ? 'ez-pm-metric-show' : 'ez-pm-metric-hidden'}`}>
                <div className="ez-pm-metric-header">
                  <span className="ez-pm-metric-caption">Project Health</span>
                  <ShieldCheck size={13} className="ez-pm-health-shield" />
                </div>
                <div className="ez-pm-health-status-row">
                  <span className="ez-pm-health-dot" />
                  <span className="ez-pm-health-text">On Track</span>
                </div>
                <div className="ez-pm-health-line">
                  <div className="ez-pm-health-line-fill" />
                </div>
              </div>
            </div>

            {/* 4. Project Activity Feed (Penambahan Utama) */}
            <div className="ez-pm-activity-container">
              <div className="ez-pm-activity-header">
                <div className="ez-pm-activity-title">
                  <Activity size={13} className="ez-pm-act-icon" />
                  <span>AKTIVITAS TERBARU</span>
                </div>
                <span className="ez-pm-live-sync-badge">Auto-sync</span>
              </div>

              <div className="ez-pm-activity-list">
                {ACTIVITIES.map((act, index) => {
                  const isVisible = index < activeActivitiesCount;
                  return (
                    <div
                      key={act.id}
                      className={`ez-pm-activity-item ${isVisible ? 'is-visible' : 'is-hidden'}`}
                      style={{
                        transitionDelay: `${index * 80}ms`
                      }}
                    >
                      <div className="ez-pm-activity-bullet">
                        <CheckCircle2 size={12} className="ez-pm-check-icon" />
                      </div>
                      <div className="ez-pm-activity-content">
                        <span className="ez-pm-act-name">{act.title}</span>
                      </div>
                      <span className="ez-pm-act-time">{act.time}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 7. Bottom Minimal Project Health Footer */}
            <div className={`ez-pm-footer-strip ${healthVisible ? 'is-visible' : 'is-hidden'}`}>
              <div className="ez-pm-footer-health">
                <span className="ez-pm-footer-tag">STATUS KONTROL</span>
                <div className="ez-pm-footer-pill">
                  <span className="ez-pm-green-pulse" />
                  <span>Project ini sedang terkendali</span>
                </div>
              </div>
              <div className="ez-pm-footer-team">
                <span className="ez-pm-avatar-stack">
                  <span className="ez-pm-avatar av-1">PM</span>
                  <span className="ez-pm-avatar av-2">QS</span>
                  <span className="ez-pm-avatar av-3">SE</span>
                </span>
                <span className="ez-pm-team-label">3 Tim Aktif</span>
              </div>
            </div>

            {/* 9. Live Project Cursor (Subtle digital selector pointer) */}
            {cursorStep !== 'hidden' && (
              <div
                className={`ez-pm-live-cursor cursor-step-${cursorStep}`}
                aria-hidden="true"
              >
                <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
                  <path
                    d="M1 1L7.5 18L10.5 11L17 8L1 1Z"
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="ez-pm-cursor-halo" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ExactProjectManagement;
