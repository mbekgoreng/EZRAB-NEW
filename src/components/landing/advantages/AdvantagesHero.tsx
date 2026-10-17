import React from 'react';
import { ArrowRight, ArrowDown } from 'lucide-react';

interface AdvantagesHeroProps {
  onExploreWorkflow: () => void;
  onOpenFeatures: () => void;
}

/**
 * S01 — Opening statement. Editorial asymmetric: copy kiri, visual kanan.
 * Visual: diagram isometrik Dokumen → Volume → RAB dengan garis dimensi,
 * gaya blueprint presisi. Murni SVG, tanpa WebGL.
 */
export const AdvantagesHero: React.FC<AdvantagesHeroProps> = ({ onExploreWorkflow, onOpenFeatures }) => (
  <div className="adv-hero">
    <div className="adv-hero-grid" aria-hidden="true" />
    <div className="adv-container adv-hero-inner">
      <div className="adv-hero-copy">
        <p className="adv-eyebrow adv-reveal">Keunggulan EZRAB</p>
        <h1 className="adv-h1 adv-reveal" style={{ ['--adv-d' as any]: '0.06s' }}>
          Estimasi Konstruksi Harus Bisa <span className="adv-h1-accent">Ditelusuri</span>, Bukan Sekadar
          Dihasilkan.
        </h1>
        <p className="adv-lead adv-reveal" style={{ ['--adv-d' as any]: '0.12s' }}>
          EZRAB membantu menghubungkan proses estimasi, perhitungan volume, referensi AHSP, dan pengelolaan
          proyek agar Anda bekerja dengan alur yang lebih terstruktur — dan setiap angka bisa dijelaskan
          asalnya.
        </p>
        <div className="adv-hero-ctas adv-reveal" style={{ ['--adv-d' as any]: '0.18s' }}>
          <button type="button" className="adv-btn-primary" onClick={onExploreWorkflow}>
            Jelajahi Cara Kerja <ArrowDown size={15} />
          </button>
          <button type="button" className="adv-btn-ghost" onClick={onOpenFeatures}>
            Lihat Fitur EZRAB <ArrowRight size={15} />
          </button>
        </div>
        <p className="adv-hero-note adv-reveal" style={{ ['--adv-d' as any]: '0.24s' }}>
          <span className="adv-note-no">01</span> Pernyataan pembuka — gambar kerja
        </p>
      </div>

      <div className="adv-hero-visual adv-reveal" style={{ ['--adv-d' as any]: '0.15s' }}>
        <svg viewBox="0 0 460 420" role="img" aria-label="Diagram alur dokumen menjadi volume menjadi RAB">
          {/* faint blueprint grid */}
          <defs>
            <pattern id="adv-grid" width="23" height="23" patternUnits="userSpaceOnUse">
              <path d="M 23 0 L 0 0 0 23" fill="none" stroke="#2563EB" strokeOpacity="0.07" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="460" height="420" fill="url(#adv-grid)" rx="14" />

          {/* connector line */}
          <path
            d="M 96 210 C 150 210, 170 150, 224 150 S 320 190, 364 190"
            fill="none"
            stroke="#2563EB"
            strokeWidth="1.5"
            strokeDasharray="6 5"
            className="adv-flow-line"
          />

          {/* Node 1 — Dokumen */}
          <g className="adv-node">
            <rect x="36" y="150" width="120" height="120" rx="10" fill="#FFFFFF" stroke="#142238" strokeWidth="1.5" />
            <rect x="52" y="170" width="88" height="6" rx="3" fill="#E2E8F0" />
            <rect x="52" y="184" width="64" height="6" rx="3" fill="#E2E8F0" />
            {/* mini plan */}
            <rect x="52" y="200" width="88" height="44" fill="none" stroke="#2563EB" strokeWidth="1.2" />
            <line x1="52" y1="222" x2="140" y2="222" stroke="#2563EB" strokeWidth="1" />
            <line x1="96" y1="200" x2="96" y2="244" stroke="#2563EB" strokeWidth="1" />
            <text x="96" y="292" textAnchor="middle" fontSize="11" fontWeight="700" fill="#142238" fontFamily="inherit">
              DOKUMEN
            </text>
            <text x="96" y="306" textAnchor="middle" fontSize="9" fill="#64748B" fontFamily="inherit">
              gambar kerja
            </text>
          </g>

          {/* Node 2 — Volume */}
          <g className="adv-node">
            <rect x="170" y="90" width="120" height="120" rx="10" fill="#FFFFFF" stroke="#142238" strokeWidth="1.5" />
            {/* dimension lines */}
            <line x1="186" y1="76" x2="274" y2="76" stroke="#64748B" strokeWidth="1" />
            <line x1="186" y1="71" x2="186" y2="81" stroke="#64748B" strokeWidth="1" />
            <line x1="274" y1="71" x2="274" y2="81" stroke="#64748B" strokeWidth="1" />
            <text x="230" y="68" textAnchor="middle" fontSize="9" fill="#64748B" fontFamily="inherit">
              8,00 m
            </text>
            {/* cube */}
            <path d="M 205 150 L 230 132 L 255 150 L 255 182 L 230 200 L 205 182 Z" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5" />
            <path d="M 205 150 L 230 168 L 255 150 M 230 168 L 230 200" fill="none" stroke="#2563EB" strokeWidth="1.2" />
            <text x="230" y="232" textAnchor="middle" fontSize="11" fontWeight="700" fill="#142238" fontFamily="inherit">
              VOLUME
            </text>
            <text x="230" y="246" textAnchor="middle" fontSize="9" fill="#64748B" fontFamily="inherit">
              dari dimensi
            </text>
          </g>

          {/* Node 3 — RAB */}
          <g className="adv-node">
            <rect x="304" y="130" width="120" height="120" rx="10" fill="#142238" stroke="none" />
            <text x="364" y="158" textAnchor="middle" fontSize="10" fontWeight="700" fill="#93C5FD" fontFamily="inherit">
              RAB
            </text>
            {[0, 1, 2, 3].map((i) => (
              <g key={i}>
                <rect x="320" y={170 + i * 16} width={58 - i * 8} height="6" rx="3" fill="#334155" />
                <text x="412" y={176 + i * 16} textAnchor="end" fontSize="8" fill="#93C5FD" fontFamily="inherit">
                  Rp
                </text>
              </g>
            ))}
            <text x="364" y="272" textAnchor="middle" fontSize="11" fontWeight="700" fill="#142238" fontFamily="inherit">
              RAB
            </text>
            <text x="364" y="286" textAnchor="middle" fontSize="9" fill="#64748B" fontFamily="inherit">
              bisa ditelusur
            </text>
          </g>

          {/* annotation */}
          <g fontFamily="inherit">
            <circle cx="150" cy="330" r="3" fill="#2563EB" />
            <text x="162" y="334" fontSize="10" fill="#475569">
              Setiap panah = hubungan data yang tercatat
            </text>
            <circle cx="150" cy="352" r="3" fill="none" stroke="#2563EB" strokeWidth="1.5" />
            <text x="162" y="356" fontSize="10" fill="#475569">
              Setiap angka = membawa konteks sumbernya
            </text>
          </g>
        </svg>
      </div>
    </div>
  </div>
);
