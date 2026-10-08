/**
 * TemplateRabMinimal — Minimalist redesign of Template RAB catalog.
 * Clean grid, subtle hover, one-tap apply. No clutter.
 */
import React, { useState, useMemo } from 'react';
import { masterBuildingTemplateRegistry } from '../../data/buildingTemplates/masterTemplateRegistry';
import './TemplateRabMinimal.css';

interface Props {
  currentProject?: any;
  projects?: any[];
  onSelectTemplate?: (template: any) => void;
  onNavigateToTab?: (tab: string, projectId?: string | null) => void;
  onCreateProjectWithTemplate?: (template: any) => void;
  onApplyTemplate?: (template: any, params?: any, targetProjectId?: string, newProjectMeta?: any, detailLevel?: any, selectedOptionalIds?: string[]) => void;
}

const CAT_META: Record<string, { icon: string; label: string }> = {
  residential: { icon: '🏠', label: 'Hunian' },
  commercial: { icon: '🏢', label: 'Komersial' },
  road: { icon: '🛣️', label: 'Jalan' },
  drainage: { icon: '🌊', label: 'Drainase' },
};

export const TemplateRabMinimal: React.FC<Props> = ({ onSelectTemplate, onCreateProjectWithTemplate, onApplyTemplate }) => {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');

  const templates = useMemo(() => masterBuildingTemplateRegistry.getAllTemplates(), []);
  const cats = useMemo(() => ['all', ...Array.from(new Set(templates.map((t: any) => t.category)))], [templates]);

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return templates.filter((t: any) => {
      if (cat !== 'all' && t.category !== cat) return false;
      if (!words.length) return true;
      const hay = `${t.name} ${t.code} ${t.description ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [templates, q, cat]);

  return (
    <div className="tmpl">
      <div className="tmpl-head">
        <div>
          <h1>Template RAB</h1>
          <p>{templates.length} template siap pakai — pilih, sesuaikan, jadi RAB.</p>
        </div>
        <div className="tmpl-search">
          <span>🔍</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari template..." />
        </div>
      </div>

      <div className="tmpl-cats">
        {cats.map((c) => (
          <button key={c} className={`tmpl-cat ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>
            {c === 'all' ? 'Semua' : `${CAT_META[c]?.icon ?? '📑'} ${CAT_META[c]?.label ?? c}`}
          </button>
        ))}
      </div>

      <div className="tmpl-grid">
        {filtered.map((t: any) => {
          const meta = CAT_META[t.category] ?? { icon: '📑', label: t.category };
          const itemCount = Array.isArray(t.workItems) ? t.workItems.length : 0;
          return (
            <div key={t.id} className="tmpl-card" onClick={() => onSelectTemplate?.(t)}>
              <div className="tmpl-icon">{meta.icon}</div>
              <div className="tmpl-name">{t.name}</div>
              <div className="tmpl-meta">{t.code} • {itemCount} item</div>
              <div className="tmpl-actions">
                <button className="tmpl-btn" onClick={(e) => { e.stopPropagation(); onSelectTemplate?.(t); }}>Lihat</button>
                <button className="tmpl-btn primary" onClick={(e) => { e.stopPropagation(); (onApplyTemplate ?? onCreateProjectWithTemplate)?.(t); }}>Pakai →</button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && <div className="tmpl-empty">Tidak ada template yang cocok.</div>}
    </div>
  );
};

export default TemplateRabMinimal;
