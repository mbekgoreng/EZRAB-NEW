import React from 'react';
import { ECOSYSTEM_MODULES } from './featuresContent';

/**
 * Visualisasi hubungan modul EZRAB — bukan sekadar grid kartu.
 * Rantai inti horizontal; modul AI, data, dan output terhubung sebagai satelit.
 * SVG responsif; tetap informatif tanpa JavaScript (statis).
 */

interface Node {
  id: string;
  x: number;
  y: number;
  w: number;
  tier: string;
  status: string;
}

const TIER_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  core: { bg: 'rgba(37,99,235,0.16)', border: '#3b82f6', text: '#dbeafe', label: 'Inti' },
  ai: { bg: 'rgba(168,85,247,0.14)', border: '#a855f7', text: '#ede9fe', label: 'AI' },
  data: { bg: 'rgba(16,185,129,0.12)', border: '#10b981', text: '#d1fae5', label: 'Data' },
  output: { bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#fef3c7', label: 'Output' },
};

// Layout: rantai inti di tengah (y=300); AI di atas; data & output di bawah.
const LAYOUT: Node[] = [
  // Core chain
  { id: 'proyek', x: 60, y: 280, w: 130, tier: 'core', status: 'live' },
  { id: 'qto', x: 250, y: 280, w: 150, tier: 'core', status: 'live' },
  { id: 'kalkulator', x: 460, y: 280, w: 160, tier: 'core', status: 'live' },
  { id: 'rab', x: 680, y: 280, w: 160, tier: 'core', status: 'live' },
  // AI tier (top)
  { id: 'ded-ai', x: 250, y: 90, w: 150, tier: 'ai', status: 'live' },
  { id: 'chat-ai', x: 460, y: 90, w: 160, tier: 'ai', status: 'live' },
  { id: 'dokumen-ai', x: 680, y: 90, w: 160, tier: 'ai', status: 'live' },
  // Data tier (bottom-left)
  { id: 'ahsp', x: 60, y: 470, w: 150, tier: 'data', status: 'live' },
  { id: 'harga', x: 270, y: 470, w: 170, tier: 'data', status: 'live' },
  { id: 'template', x: 500, y: 470, w: 150, tier: 'data', status: 'live' },
  // Output tier (bottom-right)
  { id: 'kurva-s', x: 700, y: 470, w: 130, tier: 'output', status: 'live' },
  { id: 'laporan', x: 850, y: 380, w: 120, tier: 'output', status: 'live' },
  { id: 'keuangan', x: 850, y: 470, w: 130, tier: 'output', status: 'live' },
];

const EDGES: Array<[string, string, string?]> = [
  // Core chain
  ['proyek', 'qto', 'dimensi & parameter'],
  ['qto', 'kalkulator', 'perhitungan'],
  ['kalkulator', 'rab', 'volume final'],
  // AI → core
  ['ded-ai', 'qto', 'usulan item'],
  ['ded-ai', 'rab', 'draft terverifikasi'],
  ['chat-ai', 'proyek', 'panduan'],
  ['dokumen-ai', 'proyek', 'insight'],
  // Data → core
  ['ahsp', 'rab', 'koefisien & acuan'],
  ['harga', 'rab', 'harga satuan'],
  ['template', 'qto', 'titik awal'],
  // Core → output
  ['rab', 'kurva-s', 'bobot nilai'],
  ['rab', 'laporan', 'export'],
  ['rab', 'keuangan', 'anggaran'],
];

const nodeById = (id: string) => LAYOUT.find((n) => n.id === id)!;
const modById = (id: string) => ECOSYSTEM_MODULES.find((m) => m.id === id)!;

function edgePath(a: Node, b: Node): string {
  const ax = a.x + a.w / 2;
  const ay = a.y + 40;
  const bx = b.x + b.w / 2;
  const by = b.y;
  const midY = (ay + by) / 2;
  return `M ${ax} ${ay} C ${ax} ${midY}, ${bx} ${midY}, ${bx} ${by}`;
}

export const EcosystemDiagram: React.FC = () => {
  return (
    <figure className="eco-figure">
      <svg
        viewBox="0 0 1020 620"
        className="eco-svg"
        role="img"
        aria-label="Diagram hubungan modul EZRAB: rantai inti Proyek, QTO, Kalkulator Volume, dan RAB didukung modul AI, data, dan output"
      >
        <defs>
          <marker id="eco-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#64748b" />
          </marker>
        </defs>

        {/* Edges */}
        {EDGES.map(([from, to, label], i) => {
          const a = nodeById(from);
          const b = nodeById(to);
          const mx = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
          const my = (a.y + 40 + b.y) / 2;
          return (
            <g key={i}>
              <path d={edgePath(a, b)} fill="none" stroke="#475569" strokeWidth="1.5" strokeDasharray="5 4" markerEnd="url(#eco-arrow)" opacity="0.8" />
              {label && (
                <text x={mx} y={my - 6} textAnchor="middle" fontSize="11" fill="#94a3b8" fontStyle="italic">
                  {label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {LAYOUT.map((n) => {
          const mod = modById(n.id);
          const c = TIER_COLORS[n.tier];
          return (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width={n.w} height={80} rx={14} fill={c.bg} stroke={c.border} strokeWidth="1.5" />
              <text x={n.x + n.w / 2} y={n.y + 32} textAnchor="middle" fontSize="14" fontWeight="700" fill={c.text}>
                {mod.name}
              </text>
              <text x={n.x + n.w / 2} y={n.y + 52} textAnchor="middle" fontSize="10.5" fill="#94a3b8">
                {mod.desc.split(':')[0].slice(0, 34)}
              </text>
              <text x={n.x + n.w / 2} y={n.y + 68} textAnchor="middle" fontSize="9.5" fill={c.border} letterSpacing="1.5">
                {c.label.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="eco-caption">
        Setiap modul punya peran berbeda, tetapi terhubung dalam satu alur kerja. Panah putus-putus
        menunjukkan arah dukungan data antar modul.
      </figcaption>

      {/* Legend + detail list (juga untuk pembaca layar & mobile) */}
      <div className="eco-legend" aria-hidden="true">
        {Object.entries(TIER_COLORS).map(([tier, c]) => (
          <span key={tier} className="eco-legend-item">
            <span className="eco-legend-dot" style={{ background: c.border }} />
            {c.label}
          </span>
        ))}
      </div>
      <ul className="eco-list">
        {ECOSYSTEM_MODULES.map((m) => (
          <li key={m.id} className="eco-list-item">
            <strong>{m.name}</strong>
            <span>{m.desc}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
};
