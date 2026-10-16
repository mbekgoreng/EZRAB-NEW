/**
 * TutorialCenter — daftar tutorial di Pusat Bantuan.
 *
 * Fitur:
 * - Kelompok per kategori
 * - Pencarian (judul, deskripsi, kategori)
 * - Status tiap tutorial: Belum dimulai / Sedang berjalan / Selesai / Dilewati
 * - Buka, ulangi, dan buka fitur terkait
 * - Reset progres per tutorial (eksplisit)
 */
import { useMemo, useState } from 'react';
import { useToast } from '../Toast';
import {
  TUTORIAL_CATEGORY_LABEL,
  TUTORIAL_STATUS_LABEL,
  getTutorialCategories,
  getTutorialProgress,
  listTutorials,
  openTutorial,
  resetTutorialProgress,
  searchTutorials,
  type FeatureTutorial,
  type TutorialStatus,
} from './tutorialRegistry';
import { useOnboarding } from '../OnboardingContext';

const STATUS_STYLE: Record<TutorialStatus, { bg: string; color: string }> = {
  'not-started': { bg: 'var(--ez-color-surface-tertiary)', color: 'var(--ez-color-text-muted)' },
  'in-progress': { bg: 'var(--ez-hue-blue-bg)', color: 'var(--ez-color-primary)' },
  completed: { bg: 'var(--ez-hue-green-bg, #dcfce7)', color: 'var(--ez-color-success, #16a34a)' },
  skipped: { bg: 'var(--ez-hue-amber-bg, #fef3c7)', color: 'var(--ez-color-warning, #d97706)' },
};

function TutorialCard({ tutorial }: { tutorial: FeatureTutorial }) {
  const { showToast } = useToast();
  const { goToFeature } = useOnboarding();
  const [status, setStatus] = useState<TutorialStatus>(() => getTutorialProgress(tutorial.id).status);

  const open = () => {
    openTutorial(tutorial.id);
    // Refresh status setelah player ditutup — polling ringan satu kali
    setTimeout(() => setStatus(getTutorialProgress(tutorial.id).status), 1200);
  };

  const reset = () => {
    resetTutorialProgress(tutorial.id);
    setStatus('not-started');
    showToast(`Progres tutorial "${tutorial.title}" direset.`, 'info');
  };

  const style = STATUS_STYLE[status];

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 16,
        background: 'var(--ez-color-surface)',
        border: '1px solid var(--ez-color-border-line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>{tutorial.title}</div>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            padding: '3px 10px',
            borderRadius: 9999,
            background: style.bg,
            color: style.color,
            whiteSpace: 'nowrap',
          }}
        >
          {TUTORIAL_STATUS_LABEL[status]}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ez-color-text-muted)', lineHeight: 1.55 }}>{tutorial.description}</div>
      <div style={{ fontSize: 11.5, color: 'var(--ez-color-text-faint)' }}>
        {tutorial.steps.length} langkah · {TUTORIAL_CATEGORY_LABEL[tutorial.category]}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        <button
          onClick={open}
          style={{
            height: 36,
            padding: '0 16px',
            borderRadius: 10,
            border: 'none',
            background: 'var(--ez-color-primary)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {status === 'not-started' ? 'Mulai Tutorial' : 'Ulangi Tutorial'}
        </button>
        <button
          onClick={() => goToFeature(tutorial.route)}
          style={{
            height: 36,
            padding: '0 16px',
            borderRadius: 10,
            border: '1px solid var(--ez-color-border-line)',
            background: 'transparent',
            color: 'var(--ez-color-text-body)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Buka Fitur
        </button>
        {status !== 'not-started' && (
          <button
            onClick={reset}
            style={{
              height: 36,
              padding: '0 12px',
              borderRadius: 10,
              border: 'none',
              background: 'transparent',
              color: 'var(--ez-color-text-muted)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

export function TutorialCenter() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const categories = useMemo(() => getTutorialCategories(), []);
  const filtered = useMemo(() => {
    const base = searchTutorials(query);
    if (activeCategory === 'all') return base;
    return base.filter((t) => t.category === activeCategory);
  }, [query, activeCategory]);

  const grouped = useMemo(() => {
    const map = new Map<string, FeatureTutorial[]>();
    for (const t of filtered) {
      const key = activeCategory === 'all' ? t.category : activeCategory;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()];
  }, [filtered, activeCategory]);

  const total = listTutorials().length;

  return (
    <div data-tutorial-center style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
          Tutorial Fitur
        </h3>
        <p style={{ fontSize: 12.5, color: 'var(--ez-color-text-muted)', margin: 0 }}>
          Panduan langkah demi langkah untuk setiap fitur EZRAB. Buka kapan saja, ulangi sesukamu — {total} tutorial tersedia.
        </p>
      </div>

      {/* Cari */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari tutorial…"
        aria-label="Cari tutorial"
        style={{
          height: 40,
          borderRadius: 12,
          border: '1px solid var(--ez-color-border-line)',
          background: 'var(--ez-color-surface)',
          color: 'var(--ez-color-text-primary)',
          fontSize: 13.5,
          padding: '0 14px',
          fontFamily: 'inherit',
          maxWidth: 360,
        }}
      />

      {/* Kategori */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['all', ...categories].map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              height: 32,
              padding: '0 14px',
              borderRadius: 9999,
              border: activeCategory === cat ? 'none' : '1px solid var(--ez-color-border-line)',
              background: activeCategory === cat ? 'var(--ez-color-primary)' : 'transparent',
              color: activeCategory === cat ? '#fff' : 'var(--ez-color-text-body)',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {cat === 'all' ? 'Semua' : TUTORIAL_CATEGORY_LABEL[cat as keyof typeof TUTORIAL_CATEGORY_LABEL]}
          </button>
        ))}
      </div>

      {/* Daftar */}
      {grouped.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ez-color-text-muted)', padding: '24px 0', textAlign: 'center' }}>
          Tidak ada tutorial yang cocok dengan pencarianmu.
        </div>
      ) : (
        grouped.map(([cat, tutorials]) => (
          <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeCategory === 'all' && (
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {TUTORIAL_CATEGORY_LABEL[cat as keyof typeof TUTORIAL_CATEGORY_LABEL]}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {tutorials.map((t) => (
                <TutorialCard key={t.id} tutorial={t} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default TutorialCenter;
