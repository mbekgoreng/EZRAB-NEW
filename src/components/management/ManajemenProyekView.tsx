import React, { useState, useMemo } from 'react';
import {
  FolderKanban,
  LineChart,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  Plus,
  TrendingUp,
  Download,
  Filter,
  BarChart2,
  ArrowUpRight,
  ShieldCheck,
  Layers,
  X,
  RefreshCw,
  Edit2,
  Trash2,
  Check,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { ScheduleTask } from '../../types';

interface ManajemenProyekViewProps {
  projects?: any[];
  onNavigateToTab?: (tab: string) => void;
}

export const ManajemenProyekView: React.FC<ManajemenProyekViewProps> = ({ projects: propProjects, onNavigateToTab }) => {
  const {
    currentProject,
    currentProjectId,
    setCurrentProjectId,
    projects,
    projectRabItems,
    projectScheduleTasks,
    projectKurvaSData,
    addScheduleTask,
    updateScheduleTask,
    deleteScheduleTask,
  } = useProject();

  // Modal for adding task
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [taskCategory, setTaskCategory] = useState('Pekerjaan Struktur');
  const [taskStartWeek, setTaskStartWeek] = useState(1);
  const [taskEndWeek, setTaskEndWeek] = useState(4);
  const [taskWeightInput, setTaskWeightInput] = useState<number>(10);

  // Edit Task Progress Modal
  const [editingTask, setEditingTask] = useState<ScheduleTask | null>(null);
  const [editProgress, setEditProgress] = useState<number>(0);
  const [editStatus, setEditStatus] = useState<ScheduleTask['status']>('ON_TRACK');

  // Calculate live project metrics from active project data
  const totalDirectCost = useMemo(() => {
    return projectRabItems.reduce((acc, item) => acc + (item.amount || 0), 0);
  }, [projectRabItems]);

  const totalWeight = useMemo(() => {
    return projectScheduleTasks.reduce((sum, t) => sum + (t.weightPercent || 0), 0);
  }, [projectScheduleTasks]);

  const currentActualProgress = useMemo(() => {
    if (projectScheduleTasks.length === 0) return currentProject?.progress || 0;
    if (totalWeight === 0) return 0;
    const progressAcc = projectScheduleTasks.reduce((sum, t) => {
      return sum + (t.weightPercent * (t.actualProgressPercent / 100));
    }, 0);
    return Number(progressAcc.toFixed(1));
  }, [projectScheduleTasks, totalWeight, currentProject?.progress]);

  // Current planned progress at current week (assuming current timeline progress)
  const currentPlannedProgress = useMemo(() => {
    if (projectScheduleTasks.length === 0) return 0;
    const activeTasks = projectScheduleTasks.filter((t) => t.status === 'COMPLETED' || t.actualProgressPercent > 0);
    return activeTasks.length > 0 ? 100 : 0;
  }, [projectScheduleTasks]);

  const deviasi = Number((currentActualProgress - (projectKurvaSData[0]?.plannedWeeklyPercent || 0)).toFixed(1));

  // --- S-Curve chart enhancements: hover tooltip state ---
  const [scurveHoverIdx, setScurveHoverIdx] = useState<number | null>(null);

  // Smooth path (Catmull-Rom → cubic bezier) for the S-curve line
  const scurveSmoothPath = (pts: { x: number; y: number }[]): string => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  };

  // Auto-sync tasks from RAB Categories
  const handleAutoSyncFromRab = () => {
    if (projectRabItems.length === 0) return;

    const catMap = new Map<string, number>();
    projectRabItems.forEach((itm) => {
      const cat = itm.category || 'Pekerjaan Utama';
      catMap.set(cat, (catMap.get(cat) || 0) + itm.amount);
    });

    const categories = Array.from(catMap.entries());
    categories.forEach(([cat, amount], idx) => {
      const weight = totalDirectCost > 0 ? Number(((amount / totalDirectCost) * 100).toFixed(2)) : 15;
      const startWeek = Math.min(idx * 2 + 1, 10);
      const endWeek = Math.min(startWeek + 3, 12);

      addScheduleTask({
        name: cat,
        category: cat,
        weightPercent: weight,
        startDate: `Minggu ${startWeek}`,
        endDate: `Minggu ${endWeek}`,
        startWeek,
        endWeek,
        durationWeeks: endWeek - startWeek + 1,
        actualProgressPercent: 0,
        status: 'PENDING',
      });
    });
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim()) return;

    const startW = Number(taskStartWeek) || 1;
    const endW = Math.max(startW, Number(taskEndWeek) || startW + 2);

    addScheduleTask({
      name: taskName,
      category: taskCategory,
      weightPercent: Number(taskWeightInput) || 10,
      startDate: `Minggu ${startW}`,
      endDate: `Minggu ${endW}`,
      startWeek: startW,
      endWeek: endW,
      durationWeeks: endW - startW + 1,
      actualProgressPercent: 0,
      status: 'PENDING',
    });

    setIsAddModalOpen(false);
    setTaskName('');
  };

  const handleSaveProgress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;

    updateScheduleTask(editingTask.id, {
      actualProgressPercent: Math.min(100, Math.max(0, Number(editProgress))),
      status: editStatus,
    });

    setEditingTask(null);
  };

  if (!currentProject) {
    return (
      <div style={{ background: 'var(--ez-color-surface)', borderRadius: 'var(--ez-radius-card)', padding: '48px 24px', textAlign: 'center', border: '1px solid #EEF1F6', boxShadow: '0 4px 20px rgba(0,0,0,0.045)', fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        <FolderKanban size={36} color="#64748B" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ez-color-text-primary)', margin: '0 0 6px' }}>Belum Ada Proyek Aktif</h3>
        <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', margin: 0 }}>Silakan buat atau pilih proyek di menu utama untuk melihat jadwal dan Kurva S.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* Header Card */}
      <div
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: 'var(--ez-radius-card)',
          border: '1px solid #EEF1F6',
          padding: '20px 24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--ez-radius-control)',
              background: 'var(--ez-hue-blue-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ez-color-primary)',
            }}
          >
            <FolderKanban size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                {currentProject.name}
              </h1>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: 'var(--ez-pastel-mint)',
                  color: 'var(--ez-hue-green-text)',
                  padding: '2px 8px',
                  borderRadius: 'var(--ez-radius-pill)',
                }}
              >
                {projectScheduleTasks.length === 0 ? 'Fase Persiapan' : 'Fase Konstruksi'}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: '4px 0 0' }}>
              Klien: <strong style={{ color: 'var(--ez-color-text-primary)' }}>{currentProject.client || currentProject.clientName || '-'}</strong> · Lokasi:{' '}
              <strong style={{ color: 'var(--ez-color-text-primary)' }}>{currentProject.location || '-'}</strong> · Total RAB:{' '}
              <strong style={{ color: 'var(--ez-color-primary)' }}>{formatCurrencyIDR(currentProject.totalRab || 0)}</strong>
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {projectRabItems.length > 0 && projectScheduleTasks.length === 0 && (
            <button
              onClick={handleAutoSyncFromRab}
              style={{
                height: '38px',
                padding: '0 14px',
                borderRadius: '10px',
                background: 'var(--ez-color-surface-tertiary)',
                color: 'var(--ez-color-text-strong)',
                fontSize: '12.5px',
                fontWeight: 600,
                border: '1px solid var(--ez-hue-slate-border)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={14} color="#2563EB" />
              <span>Sinkronkan dari RAB ({projectRabItems.length} item)</span>
            </button>
          )}

          <button
            onClick={() => setIsAddModalOpen(true)}
            style={{
              height: '38px',
              padding: '0 16px',
              borderRadius: '10px',
              background: 'var(--ez-color-primary)',
              color: '#FFFFFF',
              fontSize: '12.5px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(37,99,235,0.2)',
            }}
          >
            <Plus size={15} />
            <span>Tambah Tahapan</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="ez-stat" style={{ background: 'var(--ez-pastel-cream)', borderRadius: 'var(--ez-radius-card)', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.045)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase' }}>
              Target Rencana
            </span>
            <Clock size={15} color="#2563EB" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '6px' }}>
            {projectScheduleTasks.length === 0 ? '0%' : '100%'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', marginTop: '4px' }}>
            {projectScheduleTasks.length === 0 ? 'Belum ada jadwal tahapan' : `${projectScheduleTasks.length} tahapan terjadwal`}
          </div>
        </div>

        <div className="ez-stat" style={{ background: 'var(--ez-pastel-mint)', borderRadius: 'var(--ez-radius-card)', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.045)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase' }}>
              Realisasi Lapangan
            </span>
            <CheckCircle2 size={15} color="#16A34A" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ez-hue-green-text-bright)', marginTop: '6px' }}>
            {currentActualProgress}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', marginTop: '4px' }}>
            Progres kumulatif bobot kerja aktual
          </div>
        </div>

        <div className="ez-stat" style={{ background: 'var(--ez-pastel-peach)', borderRadius: 'var(--ez-radius-card)', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.045)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase' }}>
              Total Nilai Proyek
            </span>
            <TrendingUp size={15} color="#2563EB" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '6px' }}>
            {formatCurrencyIDR(currentProject.totalRab || 0)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', marginTop: '4px' }}>
            {projectRabItems.length} item pekerjaan RAB terhubung
          </div>
        </div>

        <div className="ez-stat" style={{ background: 'var(--ez-pastel-sky)', borderRadius: 'var(--ez-radius-card)', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.045)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase' }}>
              Status Pelaksanaan
            </span>
            <ShieldCheck size={15} color="#2563EB" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '6px' }}>
            {currentActualProgress >= 100 ? 'Selesai' : (currentActualProgress > 0 ? 'Berjalan' : 'Persiapan')}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', marginTop: '4px' }}>
            {projectScheduleTasks.filter((t) => t.status === 'COMPLETED').length} dari {projectScheduleTasks.length} tahapan rampung
          </div>
        </div>
      </div>

      {/* S-Curve (Kurva S) Visual Canvas */}
      <div
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: 'var(--ez-radius-card)',
          border: '1px solid #EEF1F6',
          padding: '24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LineChart size={18} color="#2563EB" />
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                Kurva S (S-Curve): Rencana vs Realisasi
              </h2>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: '4px 0 0' }}>
              Grafik kumulatif bobot (%) pekerjaan selama 12 pekan masa pelaksanaan
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', fontWeight: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '3px', background: 'var(--ez-color-primary)', borderRadius: '2px' }} />
              <span style={{ color: 'var(--ez-color-text-primary)' }}>Rencana (Plan)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '3px', background: '#16A34A', borderRadius: '2px' }} />
              <span style={{ color: 'var(--ez-color-text-primary)' }}>Realisasi (Actual)</span>
            </div>
          </div>
        </div>

        {/* Dynamic SVG Curve Display — animated, smooth, gradient */}
        <style>{`
          @keyframes scurve-draw { to { stroke-dashoffset: 0; } }
          @keyframes scurve-pop {
            0% { transform: scale(0); opacity: 0; }
            70% { transform: scale(1.3); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes scurve-ping {
            0% { transform: scale(0.6); opacity: 0.7; }
            80%, 100% { transform: scale(2.2); opacity: 0; }
          }
          .scurve-line { stroke-dasharray: 2600; stroke-dashoffset: 2600; animation: scurve-draw 1.6s ease-out 0.15s forwards; }
          .scurve-area { opacity: 0; animation: scurve-pop 0.9s ease-out 0.9s forwards; }
          .scurve-dot { transform-box: fill-box; transform-origin: center; opacity: 0; animation: scurve-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards; }
          .scurve-ping { transform-box: fill-box; transform-origin: center; animation: scurve-ping 1.8s cubic-bezier(0,0,0.2,1) infinite; }
          @media (prefers-reduced-motion: reduce) {
            .scurve-line, .scurve-area, .scurve-dot, .scurve-ping { animation: none !important; opacity: 1 !important; stroke-dashoffset: 0 !important; transform: none !important; }
          }
        `}</style>
        <div style={{ position: 'relative', width: '100%', height: '240px', background: 'var(--ez-color-surface)', borderRadius: '16px', padding: '16px', border: '1px solid #EEF1F6' }}>
          <svg viewBox="0 0 1000 200" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
            <defs>
              <linearGradient id="scurvePlanGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
              </linearGradient>
              <filter id="scurveGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#16A34A" floodOpacity="0.55" />
              </filter>
            </defs>
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((pct, i) => {
              const y = 180 - (pct / 100) * 160;
              return (
                <g key={i}>
                  <line x1="40" y1={y} x2="980" y2={y} stroke="var(--ez-color-border-line)" strokeDasharray="4 4" strokeWidth="1" />
                  <text x="30" y={y + 4} textAnchor="end" fontSize="10" fill="#94A3B8">
                    {pct}%
                  </text>
                </g>
              );
            })}

            {/* X Axis Weeks */}
            {projectKurvaSData.map((d, idx) => {
              const x = 50 + (idx / Math.max(1, projectKurvaSData.length - 1)) * 920;
              return (
                <text key={idx} x={x} y="195" textAnchor="middle" fontSize="10" fill="#64748B" fontWeight="600">
                  W{d.weekIndex}
                </text>
              );
            })}

            {projectScheduleTasks.length === 0 ? (
              <line x1="50" y1="180" x2="970" y2="180" stroke="var(--ez-hue-slate-border)" strokeWidth="2" strokeDasharray="6 6" />
            ) : (
              (() => {
                const n = projectKurvaSData.length;
                const pts = projectKurvaSData.map((d, idx) => ({
                  x: 50 + (idx / Math.max(1, n - 1)) * 920,
                  y: 180 - (d.cumulativePlannedPercent / 100) * 160,
                  pct: d.cumulativePlannedPercent,
                  weekIndex: d.weekIndex,
                }));
                const lineD = scurveSmoothPath(pts);
                const areaD = pts.length > 0
                  ? `${lineD} L ${pts[pts.length - 1].x.toFixed(1)} 180 L ${pts[0].x.toFixed(1)} 180 Z`
                  : '';
                const hovered = scurveHoverIdx !== null ? pts[scurveHoverIdx] : null;
                return (
                  <>
                    {/* Gradient area under plan curve */}
                    {areaD && <path d={areaD} fill="url(#scurvePlanGrad)" className="scurve-area" />}

                    {/* Smooth animated plan line */}
                    <path
                      d={lineD}
                      fill="none"
                      stroke="#2563EB"
                      strokeWidth="3"
                      strokeLinecap="round"
                      className="scurve-line"
                    />

                    {/* Plan points — staggered pop-in + hover tooltip */}
                    {pts.map((p, idx) => (
                      <g key={idx}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={scurveHoverIdx === idx ? 6 : 3.5}
                          fill="#2563EB"
                          stroke="#FFFFFF"
                          strokeWidth="2"
                          className="scurve-dot"
                          style={{ animationDelay: `${0.5 + idx * 0.07}s`, cursor: 'pointer' }}
                          onMouseEnter={() => setScurveHoverIdx(idx)}
                          onMouseLeave={() => setScurveHoverIdx(null)}
                        />
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="12"
                          fill="transparent"
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => setScurveHoverIdx(idx)}
                          onMouseLeave={() => setScurveHoverIdx(null)}
                        />
                      </g>
                    ))}

                    {/* Hover tooltip */}
                    {hovered && (
                      <g transform={`translate(${Math.min(Math.max(hovered.x - 62, 46), 830)}, ${Math.max(hovered.y - 62, 8)})`}>
                        <rect width="124" height="44" rx="8" fill="#0F172A" opacity="0.94" />
                        <text x="10" y="18" fill="#94A3B8" fontSize="10" fontWeight="700">W{hovered.weekIndex} · Rencana</text>
                        <circle cx="14" cy="32" r="3.5" fill="#3B82F6" />
                        <text x="22" y="35" fill="#FFFFFF" fontSize="10.5" fontWeight="700">
                          {hovered.pct.toFixed(1)}%
                        </text>
                      </g>
                    )}

                    {/* Actual progress point with pulse glow */}
                    {currentActualProgress > 0 && (
                      <g filter="url(#scurveGlow)">
                        <circle cx={50} cy={180 - (currentActualProgress / 100) * 160} r="8" fill="#16A34A" opacity="0.35" className="scurve-ping" />
                        <circle
                          cx={50}
                          cy={180 - (currentActualProgress / 100) * 160}
                          r="5.5"
                          fill="#16A34A"
                          stroke="#FFFFFF"
                          strokeWidth="2.5"
                          className="scurve-dot"
                          style={{ animationDelay: '1.4s' }}
                        />
                      </g>
                    )}
                  </>
                );
              })()
            )}
          </svg>
        </div>
      </div>

      {/* Milestone & Task Table */}
      <div
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: 'var(--ez-radius-card)',
          border: '1px solid #EEF1F6',
          padding: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ez-color-text-primary)', margin: 0 }}>
              Jadwal Tahapan Pelaksanaan (Time Schedule & Gantt)
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: '2px 0 0' }}>
              Bobot (%) dan progres aktual tiap tahapan pekerjaan
            </p>
          </div>
        </div>

        {projectScheduleTasks.length === 0 ? (
          <div
            style={{
              padding: '48px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div style={{ width: '48px', height: '48px', borderRadius: 'var(--ez-radius-control)', background: 'var(--ez-hue-blue-bg)', color: 'var(--ez-color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={24} />
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
              Belum Ada Jadwal Tahapan
            </div>
            <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', maxWidth: '380px', margin: 0, lineHeight: 1.5 }}>
              Tambahkan tahapan pelaksanaan atau sinkronkan langsung dari RAB untuk mengaktifkan pemantauan Kurva S dan timeline progres proyek.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {projectRabItems.length > 0 && (
                <button
                  onClick={handleAutoSyncFromRab}
                  style={{
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: '10px',
                    background: 'var(--ez-color-surface-tertiary)',
                    color: 'var(--ez-color-text-strong)',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    border: '1px solid var(--ez-hue-slate-border)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <RefreshCw size={14} color="#2563EB" />
                  <span>Sinkronkan dari RAB</span>
                </button>
              )}
              <button
                onClick={() => setIsAddModalOpen(true)}
                style={{
                  height: '36px',
                  padding: '0 16px',
                  borderRadius: '10px',
                  background: 'var(--ez-color-primary)',
                  color: '#FFFFFF',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Plus size={15} />
                <span>Tambah Manual</span>
              </button>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)', textAlign: 'left', color: 'var(--ez-color-text-muted)', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px' }}>Tahapan Pekerjaan</th>
                  <th style={{ padding: '10px 14px' }}>Kategori</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Bobot (%)</th>
                  <th style={{ padding: '10px 14px' }}>Periode Waktu</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>Progres Lapangan</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {projectScheduleTasks.map((task) => (
                  <tr key={task.id} style={{ borderBottom: '1px solid var(--ez-color-surface-tertiary)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ez-color-text-primary)' }}>
                      {task.name}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--ez-color-text-muted)' }}>
                      {task.category}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--ez-color-primary)' }}>
                      {task.weightPercent}%
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--ez-color-text-primary)' }}>
                      {task.startDate} s/d {task.endDate} ({task.durationWeeks} pekan)
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <div style={{ width: '70px', height: '6px', background: 'var(--ez-color-border-line)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${task.actualProgressPercent}%`, height: '100%', background: task.actualProgressPercent === 100 ? '#16A34A' : 'var(--ez-color-primary)' }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: task.actualProgressPercent === 100 ? '#16A34A' : '#0F172A' }}>
                          {task.actualProgressPercent}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 'var(--ez-radius-pill)',
                          background:
                            task.status === 'COMPLETED' ? 'var(--ez-pastel-mint)' : task.status === 'ON_TRACK' ? 'var(--ez-pastel-sky)' : 'var(--ez-pastel-cream)',
                          color:
                            task.status === 'COMPLETED' ? '#2c6e2c' : task.status === 'ON_TRACK' ? '#2456a8' : '#a8780a',
                        }}
                      >
                        {task.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          onClick={() => {
                            setEditingTask(task);
                            setEditProgress(task.actualProgressPercent);
                            setEditStatus(task.status);
                          }}
                          style={{
                            padding: '4px 10px',
                            background: 'var(--ez-pastel-sky)',
                            border: 'none',
                            borderRadius: 'var(--ez-radius-pill)',
                            color: 'var(--ez-hue-blue-text-deep)',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Edit2 size={12} />
                          <span>Update</span>
                        </button>
                        <button
                          onClick={() => deleteScheduleTask(task.id)}
                          style={{
                            padding: '4px 8px',
                            background: 'var(--ez-hue-red-bg)',
                            border: 'none',
                            borderRadius: 'var(--ez-radius-pill)',
                            color: 'var(--ez-hue-rose-text)',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Task Modal */}
      {isAddModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--ez-color-surface)', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--ez-color-text-primary)' }}>Tambah Tahapan Proyek</h3>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ez-color-text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>Nama Tahapan</label>
                <input
                  type="text"
                  placeholder="e.g. Pekerjaan Pondasi Tapak"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>Kategori Pekerjaan</label>
                <select
                  value={taskCategory}
                  onChange={(e) => setTaskCategory(e.target.value)}
                  style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                >
                  <option value="Pekerjaan Persiapan">Pekerjaan Persiapan</option>
                  <option value="Pekerjaan Tanah & Pondasi">Pekerjaan Tanah & Pondasi</option>
                  <option value="Pekerjaan Struktur">Pekerjaan Struktur</option>
                  <option value="Pekerjaan Arsitektur">Pekerjaan Arsitektur</option>
                  <option value="Pekerjaan MEP">Pekerjaan MEP</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>Mulai Pekan Ke-</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={taskStartWeek}
                    onChange={(e) => setTaskStartWeek(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>Selesai Pekan Ke-</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={taskEndWeek}
                    onChange={(e) => setTaskEndWeek(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>Bobot Pekerjaan (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={taskWeightInput}
                  onChange={(e) => setTaskWeightInput(Number(e.target.value))}
                  style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{ height: '36px', padding: '0 14px', borderRadius: '10px', background: 'var(--ez-color-surface-tertiary)', color: 'var(--ez-color-text-slate)', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{ height: '36px', padding: '0 16px', borderRadius: '10px', background: 'var(--ez-color-primary)', color: '#FFFFFF', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  Simpan Tahapan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Progress Modal */}
      {editingTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--ez-color-surface)', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--ez-color-text-primary)' }}>Update Progres: {editingTask.name}</h3>
              <button onClick={() => setEditingTask(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ez-color-text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProgress} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>Progres Realisasi Lapangan (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editProgress}
                  onChange={(e) => setEditProgress(Number(e.target.value))}
                  style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>Status Pelaksanaan</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                >
                  <option value="PENDING">PENDING</option>
                  <option value="ON_TRACK">ON_TRACK</option>
                  <option value="DELAYED">DELAYED</option>
                  <option value="COMPLETED">COMPLETED</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  style={{ height: '36px', padding: '0 14px', borderRadius: '10px', background: 'var(--ez-color-surface-tertiary)', color: 'var(--ez-color-text-slate)', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{ height: '36px', padding: '0 16px', borderRadius: '10px', background: '#16A34A', color: '#FFFFFF', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
