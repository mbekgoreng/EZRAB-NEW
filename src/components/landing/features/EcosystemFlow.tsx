/**
 * EcosystemFlow — diagram alur 2D ekosistem EZRAB (pengganti visualisasi 3D).
 * ============================================================================
 * Dirancang agar alur TERBACA JELAS:
 * - Jalur utama bernomor ①→④ horizontal: DED→RAB AI → QTO → RAB & Estimasi → Laporan.
 * - Modul pendukung mengalir vertikal TANPA garis bersilangan:
 *   Kalkulator Volume → QTO; AI Chat ⇢ RAB (putus-putus, pendamping);
 *   AHSP 2026 & Database Harga → RAB (referensi).
 * - Konektor bezier + animasi aliran; hover menyorot jalur terkait;
 *   klik membuka panel detail. Mobile: tumpukan vertikal.
 */
import React, { useState } from 'react';
import {
  ScanSearch, MessagesSquare, Ruler, Calculator, FileSpreadsheet,
  Database, Tags, FileBarChart, ArrowRight, MousePointerClick,
} from 'lucide-react';
import { ECOSYSTEM_MODULES } from './featuresContent';

interface FlowNode {
  id: string;
  icon: React.ReactNode;
  tier: 'ai' | 'core' | 'data' | 'output';
  step?: number;
  x: number; y: number; w: number; h: number;
  role: string;
}

const TIER = {
  ai: { color: '#a855f7', bg: 'rgba(168,85,247,0.10)', label: 'AI' },
  core: { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', label: 'Proses Inti' },
  data: { color: '#14b8a6', bg: 'rgba(20,184,166,0.10)', label: 'Data Referensi' },
  output: { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', label: 'Output' },
} as const;

// viewBox 1200x620. Jalur utama y=300; pendukung vertikal tanpa silangan.
const NODES: FlowNode[] = [
  { id: 'ded-ai', icon: <ScanSearch size={22} />, tier: 'ai', step: 1, x: 40, y: 245, w: 210, h: 118, role: 'AI membaca desain' },
  { id: 'qto', icon: <Ruler size={22} />, tier: 'core', step: 2, x: 330, y: 245, w: 210, h: 118, role: 'Ukur volume' },
  { id: 'rab', icon: <FileSpreadsheet size={22} />, tier: 'core', step: 3, x: 620, y: 245, w: 210, h: 118, role: 'Susun estimasi' },
  { id: 'laporan', icon: <FileBarChart size={22} />, tier: 'output', step: 4, x: 910, y: 245, w: 210, h: 118, role: 'Hasilkan laporan' },
  { id: 'kalkulator', icon: <Calculator size={20} />, tier: 'core', x: 350, y: 60, w: 170, h: 100, role: 'Hitung parametrik' },
  { id: 'chat-ai', icon: <MessagesSquare size={20} />, tier: 'ai', x: 640, y: 60, w: 170, h: 100, role: 'AI pendamping' },
  { id: 'ahsp', icon: <Database size={20} />, tier: 'data', x: 560, y: 460, w: 170, h: 100, role: 'Acuan resmi' },
  { id: 'harga', icon: <Tags size={20} />, tier: 'data', x: 770, y: 460, w: 170, h: 100, role: 'Harga sendiri' },
];

interface Edge { from: string; to: string; kind: 'main' | 'feed' | 'support'; label?: string; }

const EDGES: Edge[] = [
  { from: 'ded-ai', to: 'qto', kind: 'main' },
  { from: 'qto', to: 'rab', kind: 'main' },
  { from: 'rab', to: 'laporan', kind: 'main' },
  { from: 'kalkulator', to: 'qto', kind: 'feed' },
  { from: 'chat-ai', to: 'rab', kind: 'support', label: 'pendamping' },
  { from: 'ahsp', to: 'rab', kind: 'feed' },
  { from: 'harga', to: 'rab', kind: 'feed' },
];

const nodeById = (id: string) => NODES.find((n) => n.id === id)!;
const modById = (id: string) => ECOSYSTEM_MODULES.find((m) => m.id === id)!;

function edgePath(from: FlowNode, to: FlowNode): string {
  const fx = from.x + from.w / 2, fy = from.y + from.h / 2;
  const tx = to.x + to.w / 2, ty = to.y + to.h / 2;
  // Horizontal (jalur utama): keluar kanan → masuk kiri
  if (Math.abs(fy - ty) < 40) {
    const x1 = from.x + from.w, x2 = to.x;
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${fy} C ${mx} ${fy}, ${mx} ${ty}, ${x2} ${ty}`;
  }
  // Vertikal: keluar bawah/atas → masuk atas/bawah
  if (fy < ty) {
    const y1 = from.y + from.h, y2 = to.y;
    const my = (y1 + y2) / 2;
    return `M ${fx} ${y1} C ${fx} ${my}, ${tx} ${my}, ${tx} ${y2}`;
  }
  const y1 = from.y, y2 = to.y + to.h;
  const my = (y1 + y2) / 2;
  return `M ${fx} ${y1} C ${fx} ${my}, ${tx} ${my}, ${tx} ${y2}`;
}

interface Props {
  onOpenWorkspace: () => void;
  onExploreFeatures: () => void;
}

export const EcosystemFlow: React.FC<Props> = ({ onOpenWorkspace, onExploreFeatures }) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const active = hovered || selected;

  const related = new Set<string>();
  if (active) {
    related.add(active);
    EDGES.forEach((e) => {
      if (e.from === active || e.to === active) { related.add(e.from); related.add(e.to); }
    });
  }

  const sel = selected ? nodeById(selected) : null;
  const selMod = selected ? modById(selected) : null;

  return (
    <div className="ecoflow-wrap">
      {/* ===== Desktop: SVG ===== */}
      <svg className="ecoflow-svg" viewBox="0 0 1200 620" role="img"
        aria-label="Diagram alur ekosistem EZRAB: DED ke RAB AI, Quantity Take-Off, RAB dan Estimasi, Laporan sebagai jalur utama">
        <defs>
          {(['ai', 'core', 'data', 'output'] as const).map((t) => (
            <marker key={t} id={`ecoflow-arrow-${t}`} viewBox="0 0 10 10" refX="8" refY="5"
              markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill={TIER[t].color} />
            </marker>
          ))}
          <marker id="ecoflow-arrow-dim" viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#475569" opacity="0.5" />
          </marker>
        </defs>

        {/* Edges */}
        {EDGES.map((e) => {
          const f = nodeById(e.from), t = nodeById(e.to);
          const isRel = !active || e.from === active || e.to === active;
          const color = TIER[f.tier].color;
          const main = e.kind === 'main';
          return (
            <g key={`${e.from}-${e.to}`} opacity={isRel ? 1 : 0.18}
              style={{ transition: 'opacity 0.2s ease' }}>
              <path
                d={edgePath(f, t)}
                fill="none"
                stroke={isRel ? color : '#475569'}
                strokeWidth={main ? 3.5 : 2.5}
                strokeDasharray={e.kind === 'support' ? '8 6' : main ? '14 8' : 'none'}
                className={main && isRel ? 'ecoflow-flow' : undefined}
                markerEnd={`url(#ecoflow-arrow-${isRel ? f.tier : 'dim'})`}
                strokeLinecap="round"
              />
              {e.label && (
                <text x={(f.x + f.w / 2 + t.x + t.w / 2) / 2 + 8} y={(f.y + t.y) / 2 + 4}
                  fontSize="11" fill="#94a3b8" fontStyle="italic">{e.label}</text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {NODES.map((n) => {
          const mod = modById(n.id);
          const tc = TIER[n.tier];
          const dim = active && !related.has(n.id);
          const hl = n.id === active;
          return (
            <g key={n.id}
              opacity={dim ? 0.35 : 1}
              style={{ transition: 'opacity 0.2s ease', cursor: 'pointer' }}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setSelected(selected === n.id ? null : n.id)}
            >
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="16"
                fill={hl ? tc.bg : 'rgba(11,18,38,0.85)'}
                stroke={tc.color} strokeWidth={hl ? 2.5 : 1.5}
                style={{ transition: 'all 0.2s ease', filter: hl ? `drop-shadow(0 0 14px ${tc.color}66)` : 'none' }} />
              {n.step && (
                <g>
                  <circle cx={n.x + 22} cy={n.y + 22} r="13" fill={tc.color} />
                  <text x={n.x + 22} y={n.y + 27} textAnchor="middle" fontSize="14"
                    fontWeight="800" fill="#0b1226">{n.step}</text>
                </g>
              )}
              <g transform={`translate(${n.x + 18}, ${n.y + (n.step ? 44 : 18)})`} color={tc.color}>
                {n.icon}
              </g>
              <text x={n.x + 18} y={n.y + (n.step ? 78 : 52)} fontSize="15" fontWeight="800" fill="#f1f5f9">
                {mod.name.length > 20 ? mod.name.slice(0, 20) + '…' : mod.name}
              </text>
              <text x={n.x + 18} y={n.y + (n.step ? 98 : 72)} fontSize="11.5" fill="#94a3b8">
                {n.role}
              </text>
              <text x={n.x + n.w - 14} y={n.y + 20} textAnchor="end" fontSize="10"
                fontWeight="700" fill={tc.color} letterSpacing="1">{tc.label.toUpperCase()}</text>
            </g>
          );
        })}
      </svg>

      {/* ===== Mobile: tumpukan vertikal ===== */}
      <div className="ecoflow-mobile">
        {['ded-ai', 'qto', 'rab', 'laporan'].map((id, i, arr) => {
          const n = nodeById(id); const mod = modById(id); const tc = TIER[n.tier];
          return (
            <React.Fragment key={id}>
              <button type="button" className="ecoflow-mcard" style={{ borderColor: tc.color }}
                onClick={() => setSelected(selected === id ? null : id)}>
                <span className="ecoflow-mstep" style={{ background: tc.color }}>{i + 1}</span>
                <span className="ecoflow-micon" style={{ color: tc.color }}>{n.icon}</span>
                <span>
                  <span className="ecoflow-mname">{mod.name}</span>
                  <span className="ecoflow-mdesc">{mod.desc}</span>
                </span>
              </button>
              {i < arr.length - 1 && <span className="ecoflow-marrow" style={{ color: tc.color }}>↓</span>}
            </React.Fragment>
          );
        })}
        <div className="ecoflow-mside">
          {['kalkulator', 'chat-ai', 'ahsp', 'harga'].map((id) => {
            const n = nodeById(id); const mod = modById(id); const tc = TIER[n.tier];
            return (
              <button key={id} type="button" className="ecoflow-mcard ecoflow-mcard-sm"
                style={{ borderColor: tc.color }} onClick={() => setSelected(selected === id ? null : id)}>
                <span className="ecoflow-micon" style={{ color: tc.color }}>{n.icon}</span>
                <span>
                  <span className="ecoflow-mname">{mod.name}</span>
                  <span className="ecoflow-mdesc">{n.role}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Kontrol + legenda */}
      <div className="ecoflow-bar">
        <span className="ecoflow-hint"><MousePointerClick size={13} /> Arahkan atau ketuk modul untuk detail</span>
        <span className="ecoflow-legend">
          {(Object.keys(TIER) as (keyof typeof TIER)[]).map((k) => (
            <span key={k} className="ecoflow-legend-item">
              <span className="ecoflow-legend-dot" style={{ background: TIER[k].color }} />
              {TIER[k].label}
            </span>
          ))}
        </span>
      </div>

      {/* Panel detail */}
      {sel && selMod && (
        <div className="ecoflow-detail" style={{ borderColor: TIER[sel.tier].color }}>
          <div>
            <div className="ecoflow-detail-tier" style={{ color: TIER[sel.tier].color }}>
              {TIER[sel.tier].label} · {sel.role}
              {sel.step ? ` · Langkah ${sel.step} dari 4` : ''}
            </div>
            <div className="ecoflow-detail-name">{selMod.name}</div>
            <p className="ecoflow-detail-desc">{selMod.desc}</p>
          </div>
          <div className="ecoflow-detail-actions">
            <button type="button" className="ecoflow-cta" onClick={onOpenWorkspace}>
              Coba EZRAB <ArrowRight size={15} />
            </button>
            <button type="button" className="ecoflow-btn" onClick={() => setSelected(null)}>Tutup</button>
          </div>
        </div>
      )}

      {/* Ringkasan alur */}
      <div className="ecoflow-flow">
        <div className="ecoflow-flow-steps">
          {['Pahami desain', 'Hitung volume', 'Susun estimasi', 'Periksa referensi harga', 'Hasilkan laporan'].map((s, i, arr) => (
            <React.Fragment key={s}>
              <span className="ecoflow-flow-step">{s}</span>
              {i < arr.length - 1 && <span className="ecoflow-flow-arrow">→</span>}
            </React.Fragment>
          ))}
        </div>
        <p className="ecoflow-flow-note">Setiap tahap memakai peran berbeda — AI membaca dan mengusulkan, Anda meninjau dan memutuskan.</p>
        <div className="ecoflow-flow-ctas">
          <button type="button" className="ecoflow-cta" onClick={onOpenWorkspace}>
            Coba EZRAB <ArrowRight size={15} />
          </button>
          <button type="button" className="ecoflow-btn" onClick={onExploreFeatures}>Jelajahi Fitur</button>
        </div>
      </div>
    </div>
  );
};

export default EcosystemFlow;
