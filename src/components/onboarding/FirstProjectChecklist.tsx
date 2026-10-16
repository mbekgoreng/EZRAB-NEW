/**
 * FirstProjectChecklist — checklist proyek pertama untuk pengguna baru.
 *
 * Aturan wajib:
 * - Membuka tutorial TIDAK SAMA dengan menyelesaikan tugas.
 * - Proyek ditandai dibuat hanya setelah `projects.length > 0` terkonfirmasi
 *   dari ProjectContext (penyimpanan berhasil, bukan sekadar klik tombol).
 * - TIDAK membuat proyek dummy; TIDAK menjalankan AI otomatis.
 * - Dapat diminimalkan/dibuka kembali; menutup tidak menghapus progres.
 * - Menyesuaikan dengan pengguna yang sudah punya proyek.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOnboarding } from './OnboardingContext';
import { useProject } from '../../context/ProjectContext';
import { useBrowserLocation } from '../../routing/useBrowserLocation';

const CHECKLIST_KEY = 'ezrab_checklist_dismissed';
const CHECKLIST_MINIMIZED_KEY = 'ezrab_checklist_minimized';

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(CHECKLIST_KEY) === '1';
  } catch {
    return false;
  }
}

export function FirstProjectChecklist() {
  const { hasSeenFeatureTour, markFeatureTourSeen } = useOnboarding();
  const { projects } = useProject();
  const location = useBrowserLocation();
  const [dismissed, setDismissed] = useState(isDismissed);
  const [minimized, setMinimized] = useState(() => {
    try {
      return window.localStorage.getItem(CHECKLIST_MINIMIZED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const hasProjects = projects.length > 0;
  const onProjectsPage = location.pathname.includes('/projects') || location.pathname.includes('/app/projects');
  const onDashboard = location.pathname === '/app/dashboard' || location.pathname === '/app';

  // Deteksi aktivitas nyata
  const items: ChecklistItem[] = useMemo(() => {
    const dashboardSeen = hasSeenFeatureTour('dashboard-tour');
    return [
      {
        id: 'kenal-dashboard',
        label: 'Mengenal dashboard',
        done: dashboardSeen || onDashboard,
      },
      {
        id: 'buka-proyek',
        label: 'Membuka halaman Proyek',
        done: onProjectsPage || hasProjects,
      },
      {
        id: 'buat-proyek',
        label: 'Membuat proyek pertama',
        // HANYA true jika proyek benar-benar tersimpan (bukan sekadar klik)
        done: hasProjects,
      },
      {
        id: 'buka-workspace',
        label: 'Membuka workspace proyek',
        done: hasProjects && location.pathname.includes('/app/projects/'),
      },
      {
        id: 'tinjau-rab',
        label: 'Meninjau RAB atau memulai estimasi',
        done: hasSeenFeatureTour('rab-tour') || location.pathname.includes('/estimate') || location.pathname.includes('/rab'),
      },
    ];
  }, [hasSeenFeatureTour, hasProjects, onProjectsPage, onDashboard, location.pathname]);

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  // Tandai dashboard terlihat saat pengguna di dashboard
  useEffect(() => {
    if (onDashboard && !hasSeenFeatureTour('dashboard-seen')) {
      markFeatureTourSeen('dashboard-seen');
    }
  }, [onDashboard, hasSeenFeatureTour, markFeatureTourSeen]);

  const handleDismiss = useCallback(() => {
    try {
      window.localStorage.setItem(CHECKLIST_KEY, '1');
    } catch {
      /* abaikan */
    }
    setDismissed(true);
  }, []);

  const handleToggleMinimize = useCallback(() => {
    setMinimized((m) => {
      try {
        window.localStorage.setItem(CHECKLIST_MINIMIZED_KEY, m ? '0' : '1');
      } catch {
        /* abaikan */
      }
      return !m;
    });
  }, []);

  // Jangan tampil jika dismissed atau semua selesai
  if (dismissed || allDone) return null;

  // Jika pengguna sudah punya proyek, tampilkan versi ringkas
  const showCompact = hasProjects && doneCount >= 3;

  return (
    <div
      data-tour="checklist"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9000,
        width: 'min(300px, calc(100vw - 40px))',
        background: 'var(--ez-color-surface)',
        border: '1px solid var(--ez-color-border-line)',
        borderRadius: 16,
        boxShadow: '0 12px 32px rgba(2, 6, 23, 0.14)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          background: 'linear-gradient(135deg, var(--ez-color-primary), #1d4ed8)',
          color: '#fff',
        }}
      >
        <div>
          <p style={{ fontSize: 13, fontWeight: 800, margin: 0 }}>
            {showCompact ? 'Progres Kamu' : 'Mulai dengan EZRAB'}
          </p>
          <p style={{ fontSize: 11, margin: '2px 0 0', opacity: 0.9 }}>
            {doneCount}/{items.length} selesai
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={handleToggleMinimize}
            aria-label={minimized ? 'Buka checklist' : 'Minimalkan checklist'}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}
          >
            {minimized ? '+' : '−'}
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Tutup checklist"
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', width: 28, height: 28, cursor: 'pointer', fontSize: 12 }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'var(--ez-color-surface-tertiary)' }}>
        <div
          style={{
            height: '100%',
            width: `${(doneCount / items.length) * 100}%`,
            background: 'var(--ez-color-primary)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* Items */}
      {!minimized && (
        <div style={{ padding: '8px 6px' }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 8,
                opacity: item.done ? 0.7 : 1,
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 9999,
                  border: item.done ? 'none' : '2px solid var(--ez-color-border-line)',
                  background: item.done ? 'var(--ez-color-success, #16a34a)' : 'transparent',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {item.done ? '✓' : ''}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: item.done ? 500 : 600,
                  color: item.done ? 'var(--ez-color-text-muted)' : 'var(--ezrab-text, #111827)',
                  textDecoration: item.done ? 'line-through' : 'none',
                }}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FirstProjectChecklist;
