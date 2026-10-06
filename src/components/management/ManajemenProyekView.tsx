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
      <div style={{ background: '#ffffff', borderRadius: '16px', padding: '48px 24px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
        <FolderKanban size={36} color="#64748B" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 6px' }}>Belum Ada Proyek Aktif</h3>
        <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>Silakan buat atau pilih proyek di menu utama untuk melihat jadwal dan Kurva S.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #E8EEF0',
          padding: '20px 24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
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
              borderRadius: '12px',
              background: '#EFF6FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
            }}
          >
            <FolderKanban size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {currentProject.name}
              </h1>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: '#DCFCE7',
                  color: '#16A34A',
                  padding: '2px 8px',
                  borderRadius: '999px',
                }}
              >
                {projectScheduleTasks.length === 0 ? 'Fase Persiapan' : 'Fase Konstruksi'}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0' }}>
              Klien: <strong style={{ color: '#0F172A' }}>{currentProject.client || currentProject.clientName || '-'}</strong> · Lokasi:{' '}
              <strong style={{ color: '#0F172A' }}>{currentProject.location || '-'}</strong> · Total RAB:{' '}
              <strong style={{ color: '#2563EB' }}>{formatCurrencyIDR(currentProject.totalRab || 0)}</strong>
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
                background: '#F1F5F9',
                color: '#1E293B',
                fontSize: '12.5px',
                fontWeight: 600,
                border: '1px solid #CBD5E1',
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
              background: '#2563EB',
              color: '#ffffff',
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
        <div style={{ background: '#ffffff', border: '1px solid #E8EEF0', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
              Target Rencana
            </span>
            <Clock size={15} color="#2563EB" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
            {projectScheduleTasks.length === 0 ? '0%' : '100%'}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
            {projectScheduleTasks.length === 0 ? 'Belum ada jadwal tahapan' : `${projectScheduleTasks.length} tahapan terjadwal`}
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #E8EEF0', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
              Realisasi Lapangan
            </span>
            <CheckCircle2 size={15} color="#16A34A" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#16A34A', marginTop: '6px' }}>
            {currentActualProgress}%
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
            Progres kumulatif bobot kerja aktual
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #E8EEF0', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
              Total Nilai Proyek
            </span>
            <TrendingUp size={15} color="#2563EB" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
            {formatCurrencyIDR(currentProject.totalRab || 0)}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
            {projectRabItems.length} item pekerjaan RAB terhubung
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #E8EEF0', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
              Status Pelaksanaan
            </span>
            <ShieldCheck size={15} color="#2563EB" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
            {currentActualProgress >= 100 ? 'Selesai' : (currentActualProgress > 0 ? 'Berjalan' : 'Persiapan')}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
            {projectScheduleTasks.filter((t) => t.status === 'COMPLETED').length} dari {projectScheduleTasks.length} tahapan rampung
          </div>
        </div>
      </div>

      {/* S-Curve (Kurva S) Visual Canvas */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #E8EEF0',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LineChart size={18} color="#2563EB" />
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                Kurva S (S-Curve): Rencana vs Realisasi
              </h2>
            </div>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0' }}>
              Grafik kumulatif bobot (%) pekerjaan selama 12 pekan masa pelaksanaan
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', fontWeight: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '3px', background: '#2563EB', borderRadius: '2px' }} />
              <span style={{ color: '#0F172A' }}>Rencana (Plan)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '3px', background: '#16A34A', borderRadius: '2px' }} />
              <span style={{ color: '#0F172A' }}>Realisasi (Actual)</span>
            </div>
          </div>
        </div>

        {/* Dynamic SVG Curve Display */}
        <div style={{ position: 'relative', width: '100%', height: '240px', background: '#F8FAFC', borderRadius: '12px', padding: '16px', border: '1px solid #EEF2F7' }}>
          <svg viewBox="0 0 1000 200" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((pct, i) => {
              const y = 180 - (pct / 100) * 160;
              return (
                <g key={i}>
                  <line x1="40" y1={y} x2="980" y2={y} stroke="#E2E8F0" strokeDasharray="4 4" strokeWidth="1" />
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
              <line x1="50" y1="180" x2="970" y2="180" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="6 6" />
            ) : (
              <>
                {/* Plan Curve Line */}
                <polyline
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="3"
                  points={projectKurvaSData
                    .map((d, idx) => {
                      const x = 50 + (idx / Math.max(1, projectKurvaSData.length - 1)) * 920;
                      const y = 180 - (d.cumulativePlannedPercent / 100) * 160;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />

                {/* Plan Points */}
                {projectKurvaSData.map((d, idx) => {
                  const x = 50 + (idx / Math.max(1, projectKurvaSData.length - 1)) * 920;
                  const y = 180 - (d.cumulativePlannedPercent / 100) * 160;
                  return <circle key={idx} cx={x} cy={y} r="3.5" fill="#2563EB" />;
                })}

                {/* Actual Curve Points if progress exists */}
                {currentActualProgress > 0 && (
                  <circle
                    cx={50}
                    cy={180 - (currentActualProgress / 100) * 160}
                    r="5"
                    fill="#16A34A"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                )}
              </>
            )}
          </svg>
        </div>
      </div>

      {/* Milestone & Task Table */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #E8EEF0',
          padding: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
              Jadwal Tahapan Pelaksanaan (Time Schedule & Gantt)
            </h3>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>
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
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={24} />
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
              Belum Ada Jadwal Tahapan
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '380px', margin: 0, lineHeight: 1.5 }}>
              Tambahkan tahapan pelaksanaan atau sinkronkan langsung dari RAB untuk mengaktifkan pemantauan Kurva S dan timeline progres proyek.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {projectRabItems.length > 0 && (
                <button
                  onClick={handleAutoSyncFromRab}
                  style={{
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: '8px',
                    background: '#F1F5F9',
                    color: '#1E293B',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    border: '1px solid #CBD5E1',
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
                  borderRadius: '8px',
                  background: '#2563EB',
                  color: '#ffffff',
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
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#64748B', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
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
                  <tr key={task.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>
                      {task.name}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748B' }}>
                      {task.category}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#2563EB' }}>
                      {task.weightPercent}%
                    </td>
                    <td style={{ padding: '12px 14px', color: '#0F172A' }}>
                      {task.startDate} s/d {task.endDate} ({task.durationWeeks} pekan)
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <div style={{ width: '70px', height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${task.actualProgressPercent}%`, height: '100%', background: task.actualProgressPercent === 100 ? '#16A34A' : '#2563EB' }} />
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
                          borderRadius: '6px',
                          background:
                            task.status === 'COMPLETED' ? '#DCFCE7' : task.status === 'ON_TRACK' ? '#DBEAFE' : '#FEF3C7',
                          color:
                            task.status === 'COMPLETED' ? '#16A34A' : task.status === 'ON_TRACK' ? '#2563EB' : '#D97706',
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
                            padding: '4px 8px',
                            background: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            borderRadius: '6px',
                            color: '#2563EB',
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
                            padding: '4px 6px',
                            background: '#FEE2E2',
                            border: '1px solid #FECACA',
                            borderRadius: '6px',
                            color: '#DC2626',
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
          <div style={{ background: '#ffffff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0F172A' }}>Tambah Tahapan Proyek</h3>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Nama Tahapan</label>
                <input
                  type="text"
                  placeholder="e.g. Pekerjaan Pondasi Tapak"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Kategori Pekerjaan</label>
                <select
                  value={taskCategory}
                  onChange={(e) => setTaskCategory(e.target.value)}
                  style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
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
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Mulai Pekan Ke-</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={taskStartWeek}
                    onChange={(e) => setTaskStartWeek(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Selesai Pekan Ke-</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={taskEndWeek}
                    onChange={(e) => setTaskEndWeek(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Bobot Pekerjaan (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={taskWeightInput}
                  onChange={(e) => setTaskWeightInput(Number(e.target.value))}
                  style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{ height: '36px', padding: '0 14px', borderRadius: '8px', background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{ height: '36px', padding: '0 16px', borderRadius: '8px', background: '#2563EB', color: '#ffffff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
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
          <div style={{ background: '#ffffff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#0F172A' }}>Update Progres: {editingTask.name}</h3>
              <button onClick={() => setEditingTask(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProgress} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Progres Realisasi Lapangan (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editProgress}
                  onChange={(e) => setEditProgress(Number(e.target.value))}
                  style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Status Pelaksanaan</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
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
                  style={{ height: '36px', padding: '0 14px', borderRadius: '8px', background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{ height: '36px', padding: '0 16px', borderRadius: '8px', background: '#16A34A', color: '#ffffff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
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
