/**
 * TemplateRabMinimal — Template RAB catalog in the dashboard's clean language.
 * Pastel category tiles, lucide icons, dashboard card tokens. Logic unchanged.
 */
import React, { useState, useMemo } from 'react';
import {
  Search,
  Home,
  Building2,
  Route,
  Waves,
  FileText,
  LayoutGrid,
  Eye,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
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

const CAT_META: Record<string, { icon: LucideIcon; label: string; bg: string; color: string }> = {
  residential: { icon: Home, label: 'Hunian', bg: 'var(--ez-pastel-cream)', color: '#A8780A' },
  commercial: { icon: Building2, label: 'Komersial', bg: 'var(--ez-pastel-sky)', color: '#2456A8' },
  road: { icon: Route, label: 'Jalan', bg: 'var(--ez-pastel-peach)', color: '#B45309' },
  drainage: { icon: Waves, label: 'Drainase', bg: 'var(--ez-pastel-mint)', color: '#2C6E2C' },
};

const CAT_DEFAULT: { icon: LucideIcon; bg: string; color: string } = {
  icon: FileText,
  bg: '#F1F5F9',
  color: 'var(--ez-color-text-muted)',
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
      <div className="tmpl-head tmpl-anim" style={{ animationDelay: '0s' }}>
        <div>
          <h1>Template RAB</h1>
          <p>{templates.length} template siap pakai — pilih, sesuaikan, jadi RAB.</p>
        </div>
        <div className="tmpl-search">
          <Search size={16} color="#94A3B8" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari template..." />
        </div>
      </div>

      <div className="tmpl-cats tmpl-anim" style={{ animationDelay: '0.07s' }}>
        {cats.map((c) => {
          const meta = c === 'all' ? null : CAT_META[c];
          const Icon: LucideIcon = c === 'all' ? LayoutGrid : (meta?.icon ?? CAT_DEFAULT.icon);
          const label = c === 'all' ? 'Semua' : (meta?.label ?? c);
          return (
            <button key={c} className={`tmpl-cat ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>
              <Icon size={14} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="tmpl-grid tmpl-anim" style={{ animationDelay: '0.14s' }}>
        {filtered.map((t: any) => {
          const meta = CAT_META[t.category] ?? { ...CAT_DEFAULT, label: t.category };
          const Icon: LucideIcon = meta.icon;
          const itemCount = Array.isArray(t.workItems) ? t.workItems.length : 0;
          return (
            <div key={t.id} className="tmpl-card" onClick={() => onSelectTemplate?.(t)}>
              <div className="tmpl-icon" style={{ background: meta.bg, color: meta.color }}>
                <Icon size={24} />
              </div>
              <div className="tmpl-name">{t.name}</div>
              <div className="tmpl-meta">{t.code} • {itemCount} item</div>
              <div className="tmpl-actions">
                <button className="tmpl-btn" onClick={(e) => { e.stopPropagation(); onSelectTemplate?.(t); }}>
                  <Eye size={14} />
                  <span>Lihat</span>
                </button>
                <button className="tmpl-btn primary" onClick={(e) => { e.stopPropagation(); (onApplyTemplate ?? onCreateProjectWithTemplate)?.(t); }}>
                  <span>Pakai</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && <div className="tmpl-empty tmpl-anim">Tidak ada template yang cocok.</div>}
    </div>
  );
};

export default TemplateRabMinimal;
