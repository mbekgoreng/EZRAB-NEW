/**
 * MobileManajemenProyek — presentasi native mobile untuk menu Jadwal &
 * Kurva S (Manajemen Proyek), Gelombang Native 2 (2026-11-10).
 *
 * Semua data, metrik, dan handler berasal dari ManajemenProyekView
 * (useProject yang sama: projectScheduleTasks, projectKurvaSData,
 * addScheduleTask/updateScheduleTask/deleteScheduleTask lewat modal yang
 * sama). Geometri grafik memakai scurveSmoothPath bersama
 * (src/lib/scurvePath.ts) — angka dan garis identik desktop. Yang berubah
 * hanya presentasi: KPI 2 kolom, grafik dalam bingkai geser, dan tahapan
 * sebagai kartu (bukan tabel terjepit).
 */
import React, { useEffect, useRef } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  LineChart,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { KurvaSDataPoint, ScheduleTask } from '../../types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { scurveSmoothPath } from '../../lib/scurvePath';

export interface MobileManajemenProyekProps {
  projectName: string;
  clientLabel: string;
  locationLabel: string;
  totalRab: number;
  rabItemCount: number;
  tasks: ScheduleTask[];
  kurvaSData: KurvaSDataPoint[];
  actualSeries: KurvaSDataPoint[];
  deviasi: number | null;
  currentPlannedProgress: number | null;
  currentActualProgress: number;
  initialSection?: 'jadwal' | 'kurva-s';
  onAddTask: () => void;
  onSyncFromRab: () => void;
  onEditTask: (task: ScheduleTask) => void;
  onDeleteTask: (taskId: string) => void;
}

const statusBadge = (status: ScheduleTask['status']): { cls: string; label: string } => {
  if (status === 'COMPLETED') return { cls: 'full', label: status };
  if (status === 'ON_TRACK') return { cls: 'partial', label: status };
  return { cls: 'missing', label: status };
};

export const MobileManajemenProyek: React.FC<MobileManajemenProyekProps> = ({
  projectName,
  clientLabel,
  locationLabel,
  totalRab,
  rabItemCount,
  tasks,
  kurvaSData,
  actualSeries,
  deviasi,
  currentPlannedProgress,
  currentActualProgress,
  initialSection,
  onAddTask,
  onSyncFromRab,
  onEditTask,
  onDeleteTask,
}) => {
  const kurvaRef = useRef<HTMLDivElement>(null);
  const jadwalRef = useRef<HTMLDivElement>(null);

  // Sama seperti desktop: menu asal (Jadwal / Kurva S) menggulir ke
  // bagiannya saat layar dimuat.
  useEffect(() => {
    if (!initialSection) return;
    const target = initialSection === 'jadwal' ? jadwalRef.current : kurvaRef.current;
    if (!target) return;
    const t = window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [initialSection]);

  const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;
  const statusPelaksanaan = currentActualProgress >= 100 ? 'Selesai' : currentActualProgress > 0 ? 'Berjalan' : 'Persiapan';

  const n = kurvaSData.length;
  const planPts = kurvaSData.map((d, idx) => ({
    x: 50 + (idx / Math.max(1, n - 1)) * 920,
    y: 180 - (d.cumulativePlannedPercent / 100) * 160,
    pct: d.cumulativePlannedPercent,
    weekIndex: d.weekIndex,
  }));
  const planLineD = scurveSmoothPath(planPts);
  const planAreaD =
    planPts.length > 0 ? `${planLineD} L ${planPts[planPts.length - 1].x.toFixed(1)} 180 L ${planPts[0].x.toFixed(1)} 180 Z` : '';
  const actualPts = actualSeries.map((d) => {
    const idx = kurvaSData.indexOf(d);
    return {
      x: 50 + (idx / Math.max(1, n - 1)) * 920,
      y: 180 - ((d.actualProgressPercent || 0) / 100) * 160,
    };
  });
  const actualLineD = scurveSmoothPath(actualPts);

  return (
    <div className="mnw-screen">
      <div className="mnw-eyebrow">Manajemen Proyek</div>
      <h2 className="mnw-title">Jadwal &amp; Kurva S</h2>

      {/* Kartu proyek */}
      <div className="mnw-projcard" style={{ marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mnw-projcard-name">{projectName}</div>
          <div className="mnw-projcard-meta">
            Klien: {clientLabel} · Lokasi: {locationLabel}
          </div>
          <div className="mnw-projcard-meta">
            Total RAB: <strong style={{ color: '#FFFFFF' }}>{formatCurrencyIDR(totalRab || 0)}</strong> ·{' '}
            {tasks.length === 0 ? 'Fase Persiapan' : 'Fase Konstruksi'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {rabItemCount > 0 && tasks.length === 0 && (
          <button type="button" className="mnw-action-btn" onClick={onSyncFromRab}>
            <RefreshCw size={15} /> Sinkronkan dari RAB ({rabItemCount} item)
          </button>
        )}
        <button type="button" className="mnw-action-btn primary" onClick={onAddTask}>
          <Plus size={15} /> Tambah Tahapan
        </button>
      </div>

      {/* KPI — angka yang sama dengan kartu statistik desktop */}
      <div className="mnw-kpi-grid">
        <div className="mnw-kpi-card">
          <span className="mnw-kpi-label">
            <Clock size={13} /> Target Rencana
          </span>
          <span className="mnw-kpi-value">{currentPlannedProgress != null ? `${Math.round(currentPlannedProgress)}%` : '—'}</span>
          <span className="mnw-kpi-sub">
            {tasks.length === 0
              ? 'Belum ada jadwal tahapan'
              : `Kumulatif rencana akhir · ${kurvaSData.length} pekan · ${tasks.length} tahapan`}
          </span>
        </div>
        <div className="mnw-kpi-card">
          <span className="mnw-kpi-label">
            <CheckCircle2 size={13} /> Realisasi Lapangan
          </span>
          <span className="mnw-kpi-value">{currentActualProgress}%</span>
          <span className="mnw-kpi-sub">Progres kumulatif bobot kerja aktual</span>
        </div>
        <div className="mnw-kpi-card">
          <span className="mnw-kpi-label">
            <TrendingUp size={13} /> Total Nilai Proyek
          </span>
          <span className="mnw-kpi-value small">{formatCurrencyIDR(totalRab || 0)}</span>
          <span className="mnw-kpi-sub">{rabItemCount} item pekerjaan RAB terhubung</span>
        </div>
        <div className="mnw-kpi-card">
          <span className="mnw-kpi-label">
            <ShieldCheck size={13} /> Status Pelaksanaan
          </span>
          <span className="mnw-kpi-value small">{statusPelaksanaan}</span>
          <span className="mnw-kpi-sub">
            {completedCount} dari {tasks.length} tahapan rampung
          </span>
        </div>
      </div>

      {/* Kurva S — grafik yang sama dalam bingkai geser */}
      <div ref={kurvaRef} style={{ scrollMarginTop: 84 }}>
        <div className="mnw-group-title">
          <LineChart size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
          Kurva S: Rencana vs Realisasi
        </div>
        <div className="mnw-card">
          <div className="mnw-kurva-legend">
            <span className="mnw-kurva-legend-item">
              <span className="mnw-kurva-dot" style={{ background: '#2563EB' }} /> Rencana (Plan)
            </span>
            {actualSeries.length > 0 && (
              <span className="mnw-kurva-legend-item">
                <span className="mnw-kurva-dot" style={{ background: '#16A34A' }} /> Realisasi (Actual)
              </span>
            )}
            {deviasi != null && (
              <span className="mnw-kurva-legend-item" style={{ color: deviasi < 0 ? '#DC2626' : '#15803D', fontWeight: 700 }}>
                Deviasi: {deviasi > 0 ? '+' : ''}
                {deviasi}%
              </span>
            )}
          </div>

          {tasks.length > 0 && actualSeries.length === 0 && (
            <div className="mnw-warn" style={{ margin: '0 0 10px' }}>
              <strong>Belum ada data realisasi mingguan</strong> — garis realisasi tidak digambar. Perbarui progres
              aktual tahapan pelaksanaan; seri realisasi dihitung dari titik aktual Kurva S, bukan disebar dari satu
              angka snapshot.
            </div>
          )}
          {tasks.length === 0 && (
            <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.55, marginBottom: 10 }}>
              <strong style={{ color: '#0F172A' }}>Belum ada jadwal tahapan.</strong> Buat tahapan pertama untuk
              menyusun jadwal proyek, atau tambah item RAB terlebih dahulu agar Kurva S dapat dihitung otomatis.
            </div>
          )}

          <div className="mnw-chartscroll">
            <svg viewBox="0 0 1000 200" className="mnw-kurva-svg wide" role="img" aria-label="Grafik Kurva S rencana vs realisasi">
              <defs>
                <linearGradient id="mnwScurvePlanGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {[0, 25, 50, 75, 100].map((pct) => {
                const y = 180 - (pct / 100) * 160;
                return (
                  <g key={pct}>
                    <line x1="40" y1={y} x2="980" y2={y} stroke="#E2E8F0" strokeDasharray="4 4" strokeWidth="1" />
                    <text x="30" y={y + 4} textAnchor="end" fontSize="10" fill="#94A3B8">
                      {pct}%
                    </text>
                  </g>
                );
              })}
              {kurvaSData.map((d, idx) => {
                const x = 50 + (idx / Math.max(1, n - 1)) * 920;
                return (
                  <text key={idx} x={x} y="195" textAnchor="middle" fontSize="10" fill="#64748B" fontWeight="600">
                    W{d.weekIndex}
                  </text>
                );
              })}
              {tasks.length === 0 ? (
                <line x1="50" y1="180" x2="970" y2="180" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="6 6" />
              ) : (
                <>
                  {planAreaD && <path d={planAreaD} fill="url(#mnwScurvePlanGrad)" />}
                  {planLineD && <path d={planLineD} fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" />}
                  {planPts.map((p, idx) => (
                    <circle key={idx} cx={p.x} cy={p.y} r="3.5" fill="#2563EB" stroke="#FFFFFF" strokeWidth="2" />
                  ))}
                  {actualSeries.length > 0 && (
                    <>
                      {actualLineD && <path d={actualLineD} fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" />}
                      {actualPts.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r="4.5" fill="#16A34A" stroke="#FFFFFF" strokeWidth="2" />
                      ))}
                    </>
                  )}
                </>
              )}
            </svg>
          </div>
          <div className="mnw-kurva-scrollhint">
            Grafik kumulatif bobot (%) selama {kurvaSData.length > 0 ? kurvaSData.length : '—'} pekan — geser untuk melihat penuh
          </div>
        </div>
      </div>

      {/* Jadwal tahapan — kartu per tahap */}
      <div ref={jadwalRef} style={{ scrollMarginTop: 84 }}>
        <div className="mnw-group-title">
          <Calendar size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
          Jadwal Tahapan Pelaksanaan
        </div>
        {tasks.length === 0 ? (
          <div className="mnw-empty">
            <Calendar size={26} color="#94A3B8" />
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Belum Ada Jadwal Tahapan</div>
            <div>
              Tambahkan tahapan pelaksanaan atau sinkronkan langsung dari RAB untuk mengaktifkan pemantauan Kurva S
              dan timeline progres proyek.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {rabItemCount > 0 && (
                <button type="button" className="mnw-action-btn" onClick={onSyncFromRab}>
                  <RefreshCw size={15} /> Sinkronkan dari RAB
                </button>
              )}
              <button type="button" className="mnw-action-btn primary" onClick={onAddTask}>
                <Plus size={15} /> Tambah Manual
              </button>
            </div>
          </div>
        ) : (
          tasks.map((task) => {
            const badge = statusBadge(task.status);
            return (
              <div key={task.id} className="mnw-card" style={{ marginBottom: 10 }}>
                <div className="mnw-kurva-stage-head">
                  <span className="mnw-kurva-stage-name">{task.name}</span>
                  <span className={`mnw-badge ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="mnw-param-row">
                  <span>Kategori</span>
                  <b style={{ textAlign: 'right' }}>{task.category}</b>
                </div>
                <div className="mnw-param-row">
                  <span>Bobot</span>
                  <b style={{ color: '#1D4ED8' }}>{task.weightPercent}%</b>
                </div>
                <div className="mnw-param-row">
                  <span>Periode</span>
                  <b style={{ textAlign: 'right' }}>
                    {task.startDate} s/d {task.endDate} ({task.durationWeeks} pekan)
                  </b>
                </div>
                <div className="mnw-rekap-weight" style={{ marginTop: 8 }}>
                  <div className="mnw-rekap-track">
                    <div
                      className="mnw-rekap-fill"
                      style={{
                        width: `${task.actualProgressPercent}%`,
                        background: task.actualProgressPercent === 100 ? '#16A34A' : '#2563EB',
                      }}
                    />
                  </div>
                  <span className="mnw-rekap-pct">{task.actualProgressPercent}%</span>
                </div>
                <div className="mnw-detail-actions">
                  <button type="button" className="mnw-action-btn" onClick={() => onEditTask(task)}>
                    <Pencil size={14} /> Update
                  </button>
                  <button
                    type="button"
                    className="mnw-action-btn danger"
                    style={{ flex: '0 0 auto', minWidth: 52 }}
                    onClick={() => onDeleteTask(task.id)}
                    aria-label={`Hapus tahapan ${task.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MobileManajemenProyek;
