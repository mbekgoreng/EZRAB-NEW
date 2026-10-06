import React from 'react';

export interface DiagramProps {
  activeParam?: string;
  onSelectParam?: (paramId: string) => void;
  inputs?: Record<string, number>;
}

// 1. BOWPLANK & PENGUKURAN
export const BowplankDiagram: React.FC<DiagramProps> = ({ activeParam, onSelectParam, inputs }) => {
  const P = inputs?.P ?? 12;
  const L = inputs?.L ?? 8;
  const C = inputs?.C ?? 0.60;
  const H = inputs?.H ?? 1.0;
  const R = inputs?.R ?? 2.0;

  const isP = activeParam === 'P';
  const isL = activeParam === 'L';
  const isC = activeParam === 'C';
  const isH = activeParam === 'H';
  const isR = activeParam === 'R';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 460 270" style={{ width: '100%', height: 'auto', maxHeight: '250px' }}>
        <defs>
          <linearGradient id="blueprintBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0B132B" />
            <stop offset="100%" stopColor="#1C2541" />
          </linearGradient>
          <pattern id="gridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
          </pattern>
        </defs>

        <rect width="460" height="270" rx="12" fill="url(#blueprintBg)" />
        <rect width="460" height="270" rx="12" fill="url(#gridPattern)" />

        {/* Outer Bowplank Rectangle */}
        <rect
          x="50"
          y="45"
          width="340"
          height="165"
          fill="none"
          stroke={isC ? '#F59E0B' : '#38BDF8'}
          strokeWidth="2.5"
          strokeDasharray="6 4"
        />

        {/* Inner Building Footprint */}
        <rect
          x="80"
          y="75"
          width="280"
          height="105"
          fill="rgba(56, 189, 248, 0.12)"
          stroke="#94A3B8"
          strokeWidth="2"
        />

        {/* Diagonal Stakes (Patok Kayu) */}
        {[
          [50, 45], [135, 45], [220, 45], [305, 45], [390, 45],
          [50, 210], [135, 210], [220, 210], [305, 210], [390, 210],
          [50, 127], [390, 127]
        ].map(([cx, cy], idx) => (
          <g key={idx} onClick={() => onSelectParam?.('R')} style={{ cursor: 'pointer' }}>
            <circle cx={cx} cy={cy} r="5" fill={isR ? '#EF4444' : '#E2E8F0'} stroke="#0F172A" strokeWidth="1.5" />
          </g>
        ))}

        {/* Dimension Lines: P (Panjang) */}
        <g onClick={() => onSelectParam?.('P')} style={{ cursor: 'pointer' }}>
          <line x1="80" y1="195" x2="360" y2="195" stroke={isP ? '#10B981' : '#38BDF8'} strokeWidth={isP ? '3' : '2'} />
          <polygon points="80,195 90,191 90,199" fill={isP ? '#10B981' : '#38BDF8'} />
          <polygon points="360,195 350,191 350,199" fill={isP ? '#10B981' : '#38BDF8'} />
          <rect x="180" y="185" width="80" height="20" rx="4" fill={isP ? '#10B981' : '#1E293B'} stroke="#38BDF8" strokeWidth="1" />
          <text x="220" y="199" fill="#ffffff" fontSize="11" fontWeight="700" textAnchor="middle">
            P = {P} m
          </text>
        </g>

        {/* Dimension Lines: L (Lebar) */}
        <g onClick={() => onSelectParam?.('L')} style={{ cursor: 'pointer' }}>
          <line x1="375" y1="75" x2="375" y2="180" stroke={isL ? '#10B981' : '#38BDF8'} strokeWidth={isL ? '3' : '2'} />
          <polygon points="375,75 371,85 379,85" fill={isL ? '#10B981' : '#38BDF8'} />
          <polygon points="375,180 371,170 379,170" fill={isL ? '#10B981' : '#38BDF8'} />
          <rect x="365" y="115" width="75" height="20" rx="4" fill={isL ? '#10B981' : '#1E293B'} stroke="#38BDF8" strokeWidth="1" />
          <text x="402" y="129" fill="#ffffff" fontSize="11" fontWeight="700" textAnchor="middle">
            L = {L} m
          </text>
        </g>

        {/* Dimension Lines: C (Offset Bebas) */}
        <g onClick={() => onSelectParam?.('C')} style={{ cursor: 'pointer' }}>
          <line x1="50" y1="225" x2="80" y2="225" stroke={isC ? '#F59E0B' : '#CBD5E1'} strokeWidth="2" />
          <rect x="42" y="232" width="60" height="18" rx="4" fill={isC ? '#F59E0B' : '#334155'} />
          <text x="72" y="245" fill="#ffffff" fontSize="10" fontWeight="700" textAnchor="middle">
            C = {C}m
          </text>
        </g>

        {/* Dimension Lines: R (Jarak Patok) */}
        <g onClick={() => onSelectParam?.('R')} style={{ cursor: 'pointer' }}>
          <line x1="50" y1="32" x2="135" y2="32" stroke={isR ? '#EF4444' : '#94A3B8'} strokeWidth="1.5" />
          <rect x="70" y="20" width="55" height="18" rx="4" fill={isR ? '#EF4444' : '#1E293B'} />
          <text x="97" y="33" fill="#ffffff" fontSize="10" fontWeight="700" textAnchor="middle">
            R = {R}m
          </text>
        </g>

        {/* Title Badge */}
        <g onClick={() => onSelectParam?.('H')} style={{ cursor: 'pointer' }}>
          <rect x="15" y="15" width="130" height="22" rx="6" fill="#2563EB" opacity="0.9" />
          <text x="80" y="30" fill="#ffffff" fontSize="11" fontWeight="700" textAnchor="middle">
            📐 Patok H = {H} m
          </text>
        </g>
      </svg>
    </div>
  );
};

// 2. PONDASI BATU KALI
export const PondasiDiagram: React.FC<DiagramProps> = ({ activeParam, onSelectParam, inputs }) => {
  const A = inputs?.a ?? 0.30;
  const B = inputs?.b ?? 0.80;
  const H = inputs?.h ?? 0.80;
  const L = inputs?.L ?? 45.0;

  const isA = activeParam === 'a';
  const isB = activeParam === 'b';
  const isH = activeParam === 'h';
  const isL = activeParam === 'L';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 460 270" style={{ width: '100%', height: 'auto', maxHeight: '250px' }}>
        <rect width="460" height="270" rx="12" fill="#0B132B" />
        
        {/* Soil Background Hatch */}
        <path d="M 40 70 L 420 70 L 420 240 L 40 240 Z" fill="#1E293B" opacity="0.5" />
        <line x1="40" y1="70" x2="420" y2="70" stroke="#64748B" strokeWidth="2" strokeDasharray="4 2" />

        {/* Galian Trapesium */}
        <polygon points="120,70 340,70 360,230 100,230" fill="#0F172A" stroke="#334155" strokeWidth="1.5" />

        {/* Pasir Urug (Bottom) */}
        <rect x="110" y="215" width="240" height="15" fill="#F59E0B" opacity="0.4" stroke="#F59E0B" strokeWidth="1" />
        <text x="230" y="226" fill="#FDE68A" fontSize="9" fontWeight="700" textAnchor="middle">Pasir Urug t=5cm</text>

        {/* Batu Kosong (Aanstamping) */}
        <rect x="120" y="190" width="220" height="25" fill="#64748B" opacity="0.6" stroke="#94A3B8" strokeWidth="1" />
        <text x="230" y="206" fill="#FFFFFF" fontSize="9" fontWeight="700" textAnchor="middle">Aanstamping t=15cm</text>

        {/* Pasangan Batu Kali Trapesium */}
        <polygon
          points="180,90 280,90 320,190 140,190"
          fill="#3B82F6"
          opacity="0.3"
          stroke={isA || isB || isH ? '#F59E0B' : '#38BDF8'}
          strokeWidth="3"
        />
        <text x="230" y="145" fill="#93C5FD" fontSize="11" fontWeight="800" textAnchor="middle">BATU KALI 1:4</text>

        {/* Dimension a (Lebar Atas) */}
        <g onClick={() => onSelectParam?.('a')} style={{ cursor: 'pointer' }}>
          <line x1="180" y1="80" x2="280" y2="80" stroke={isA ? '#10B981' : '#38BDF8'} strokeWidth="2" />
          <rect x="205" y="68" width="50" height="18" rx="4" fill={isA ? '#10B981' : '#1E293B'} />
          <text x="230" y="81" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">a = {A} m</text>
        </g>

        {/* Dimension b (Lebar Bawah) */}
        <g onClick={() => onSelectParam?.('b')} style={{ cursor: 'pointer' }}>
          <line x1="140" y1="180" x2="320" y2="180" stroke={isB ? '#10B981' : '#38BDF8'} strokeWidth="2" />
          <rect x="205" y="168" width="50" height="18" rx="4" fill={isB ? '#10B981' : '#1E293B'} />
          <text x="230" y="181" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">b = {B} m</text>
        </g>

        {/* Dimension h (Tinggi Pondasi) */}
        <g onClick={() => onSelectParam?.('h')} style={{ cursor: 'pointer' }}>
          <line x1="335" y1="90" x2="335" y2="190" stroke={isH ? '#10B981' : '#38BDF8'} strokeWidth="2" />
          <rect x="340" y="130" width="55" height="18" rx="4" fill={isH ? '#10B981' : '#1E293B'} />
          <text x="367" y="143" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">h = {H} m</text>
        </g>

        {/* Dimension L (Panjang Total) */}
        <g onClick={() => onSelectParam?.('L')} style={{ cursor: 'pointer' }}>
          <rect x="20" y="20" width="130" height="24" rx="6" fill={isL ? '#10B981' : '#2563EB'} />
          <text x="85" y="36" fill="#FFFFFF" fontSize="11" fontWeight="800" textAnchor="middle">Panjang L = {L} m</text>
        </g>
      </svg>
    </div>
  );
};

// 3. FOOT PLATE (PONDASI TELAPAK)
export const FootPlateDiagram: React.FC<DiagramProps> = ({ activeParam, onSelectParam, inputs }) => {
  const L = inputs?.L ?? 1.0;
  const W = inputs?.W ?? 1.0;
  const H = inputs?.H ?? 0.35;
  const N = inputs?.N ?? 12;

  const isL = activeParam === 'L';
  const isW = activeParam === 'W';
  const isH = activeParam === 'H';
  const isN = activeParam === 'N';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 460 270" style={{ width: '100%', height: 'auto', maxHeight: '250px' }}>
        <rect width="460" height="270" rx="12" fill="#0B132B" />

        {/* 3D Isometric Tapak Foot Plate */}
        <g transform="translate(130, 80)">
          {/* Base Pad (Tapak) */}
          <polygon points="100,20 200,60 100,100 0,60" fill="#3B82F6" opacity="0.8" stroke="#60A5FA" strokeWidth="2" />
          <polygon points="0,60 100,100 100,140 0,100" fill="#1D4ED8" stroke="#60A5FA" strokeWidth="2" />
          <polygon points="100,100 200,60 200,100 100,140" fill="#2563EB" stroke="#60A5FA" strokeWidth="2" />

          {/* Pedestal Column */}
          <polygon points="100,-30 140,-15 100,0 60,-15" fill="#60A5FA" stroke="#93C5FD" strokeWidth="1.5" />
          <polygon points="60,-15 100,0 100,40 60,25" fill="#2563EB" stroke="#93C5FD" strokeWidth="1.5" />
          <polygon points="100,0 140,-15 140,25 100,40" fill="#1D4ED8" stroke="#93C5FD" strokeWidth="1.5" />

          {/* Rebar Grid Illustration (Inside) */}
          <line x1="20" y1="65" x2="180" y2="65" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="3 3" />
          <line x1="40" y1="75" x2="160" y2="75" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="3 3" />
        </g>

        {/* Dimension L (Panjang Tapak) */}
        <g onClick={() => onSelectParam?.('L')} style={{ cursor: 'pointer' }}>
          <line x1="120" y1="190" x2="220" y2="230" stroke={isL ? '#10B981' : '#38BDF8'} strokeWidth="2.5" />
          <rect x="145" y="215" width="55" height="18" rx="4" fill={isL ? '#10B981' : '#1E293B'} />
          <text x="172" y="228" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">L = {L} m</text>
        </g>

        {/* Dimension W (Lebar Tapak) */}
        <g onClick={() => onSelectParam?.('W')} style={{ cursor: 'pointer' }}>
          <line x1="240" y1="230" x2="340" y2="190" stroke={isW ? '#10B981' : '#38BDF8'} strokeWidth="2.5" />
          <rect x="275" y="215" width="55" height="18" rx="4" fill={isW ? '#10B981' : '#1E293B'} />
          <text x="302" y="228" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">W = {W} m</text>
        </g>

        {/* Dimension H (Tebal Tapak) */}
        <g onClick={() => onSelectParam?.('H')} style={{ cursor: 'pointer' }}>
          <line x1="345" y1="140" x2="345" y2="180" stroke={isH ? '#10B981' : '#38BDF8'} strokeWidth="2.5" />
          <rect x="350" y="150" width="55" height="18" rx="4" fill={isH ? '#10B981' : '#1E293B'} />
          <text x="377" y="163" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">H = {H} m</text>
        </g>

        {/* Jumlah Titik (N) Badge */}
        <g onClick={() => onSelectParam?.('N')} style={{ cursor: 'pointer' }}>
          <rect x="20" y="20" width="140" height="24" rx="6" fill={isN ? '#10B981' : '#2563EB'} />
          <text x="90" y="36" fill="#FFFFFF" fontSize="11" fontWeight="800" textAnchor="middle">Jumlah Titik N = {N} bh</text>
        </g>
      </svg>
    </div>
  );
};

// 4. SLOOF BETON BERTULANG
export const SloofDiagram: React.FC<DiagramProps> = ({ activeParam, onSelectParam, inputs }) => {
  const B = inputs?.b ?? 0.15;
  const H = inputs?.h ?? 0.20;
  const L = inputs?.L ?? 45.0;

  const isB = activeParam === 'b';
  const isH = activeParam === 'h';
  const isL = activeParam === 'L';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 460 270" style={{ width: '100%', height: 'auto', maxHeight: '250px' }}>
        <rect width="460" height="270" rx="12" fill="#0B132B" />

        {/* Concrete Cross Section */}
        <rect x="170" y="70" width="120" height="150" fill="#334155" stroke="#64748B" strokeWidth="2" rx="4" />

        {/* Stirrup Rebar (Sengkang / Begel) */}
        <rect x="185" y="85" width="90" height="120" fill="none" stroke={activeParam === 'diaSengkang' ? '#EF4444' : '#F59E0B'} strokeWidth="3" rx="4" />

        {/* 4 Main Longitudinal Rebars (Besi Utama) */}
        {[
          [190, 90], [270, 90],
          [190, 200], [270, 200]
        ].map(([cx, cy], idx) => (
          <circle key={idx} cx={cx} cy={cy} r="6" fill={activeParam === 'diaUtama' ? '#10B981' : '#EF4444'} stroke="#FFFFFF" strokeWidth="1.5" />
        ))}

        {/* Dimension b (Lebar Balok) */}
        <g onClick={() => onSelectParam?.('b')} style={{ cursor: 'pointer' }}>
          <line x1="170" y1="50" x2="290" y2="50" stroke={isB ? '#10B981' : '#38BDF8'} strokeWidth="2" />
          <rect x="205" y="38" width="50" height="18" rx="4" fill={isB ? '#10B981' : '#1E293B'} />
          <text x="230" y="51" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">b = {B} m</text>
        </g>

        {/* Dimension h (Tinggi Balok) */}
        <g onClick={() => onSelectParam?.('h')} style={{ cursor: 'pointer' }}>
          <line x1="310" y1="70" x2="310" y2="220" stroke={isH ? '#10B981' : '#38BDF8'} strokeWidth="2" />
          <rect x="315" y="135" width="50" height="18" rx="4" fill={isH ? '#10B981' : '#1E293B'} />
          <text x="340" y="148" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">h = {H} m</text>
        </g>

        {/* Dimension L Badge */}
        <g onClick={() => onSelectParam?.('L')} style={{ cursor: 'pointer' }}>
          <rect x="20" y="20" width="130" height="24" rx="6" fill={isL ? '#10B981' : '#2563EB'} />
          <text x="85" y="36" fill="#FFFFFF" fontSize="11" fontWeight="800" textAnchor="middle">Panjang L = {L} m</text>
        </g>

        <text x="230" y="250" fill="#94A3B8" fontSize="10" fontWeight="600" textAnchor="middle">
          Cross-Section Sloof: 4D12 + Begel ⌀8-150 + Begisting 2 Sisi
        </text>
      </svg>
    </div>
  );
};

// 5. KOLOM STRUKTUR / PRAKTIS
export const KolomDiagram: React.FC<DiagramProps> = ({ activeParam, onSelectParam, inputs }) => {
  const B = inputs?.b ?? 0.15;
  const H = inputs?.h ?? 0.15;
  const Tinggi = inputs?.H ?? 3.5;
  const N = inputs?.N ?? 12;

  const isB = activeParam === 'b';
  const isH = activeParam === 'h';
  const isTinggi = activeParam === 'H';
  const isN = activeParam === 'N';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 460 270" style={{ width: '100%', height: 'auto', maxHeight: '250px' }}>
        <rect width="460" height="270" rx="12" fill="#0B132B" />

        {/* 3D Vertical Column */}
        <g transform="translate(190, 40)">
          {/* Top Face */}
          <polygon points="40,0 80,15 40,30 0,15" fill="#60A5FA" stroke="#93C5FD" strokeWidth="1.5" />
          {/* Front Left */}
          <polygon points="0,15 40,30 40,190 0,175" fill="#2563EB" stroke="#93C5FD" strokeWidth="1.5" />
          {/* Front Right */}
          <polygon points="40,30 80,15 80,175 40,190" fill="#1D4ED8" stroke="#93C5FD" strokeWidth="1.5" />

          {/* Sengkang Bands */}
          {[50, 90, 130, 170].map((y, idx) => (
            <line key={idx} x1="0" y1={y} x2="40" y2={y + 15} stroke="#F59E0B" strokeWidth="2" />
          ))}
        </g>

        {/* Dimension Tinggi Kolom */}
        <g onClick={() => onSelectParam?.('H')} style={{ cursor: 'pointer' }}>
          <line x1="290" y1="55" x2="290" y2="215" stroke={isTinggi ? '#10B981' : '#38BDF8'} strokeWidth="2" />
          <rect x="295" y="125" width="60" height="18" rx="4" fill={isTinggi ? '#10B981' : '#1E293B'} />
          <text x="325" y="138" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">Tinggi = {Tinggi}m</text>
        </g>

        {/* Dimension b & h */}
        <g onClick={() => onSelectParam?.('b')} style={{ cursor: 'pointer' }}>
          <rect x="110" y="45" width="55" height="18" rx="4" fill={isB ? '#10B981' : '#1E293B'} />
          <text x="137" y="58" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">b = {B}m</text>
        </g>

        <g onClick={() => onSelectParam?.('h')} style={{ cursor: 'pointer' }}>
          <rect x="110" y="70" width="55" height="18" rx="4" fill={isH ? '#10B981' : '#1E293B'} />
          <text x="137" y="83" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">h = {H}m</text>
        </g>

        {/* Jumlah Titik N */}
        <g onClick={() => onSelectParam?.('N')} style={{ cursor: 'pointer' }}>
          <rect x="20" y="20" width="130" height="24" rx="6" fill={isN ? '#10B981' : '#2563EB'} />
          <text x="85" y="36" fill="#FFFFFF" fontSize="11" fontWeight="800" textAnchor="middle">Jumlah N = {N} unit</text>
        </g>
      </svg>
    </div>
  );
};

// 6. DINDING BATA RINGAN (HEBEL) / BATA MERAH / BATAKO
export const DindingDiagram: React.FC<DiagramProps & { type?: 'hebel' | 'merah' | 'batako' }> = ({
  activeParam,
  onSelectParam,
  inputs,
  type = 'hebel',
}) => {
  const P = inputs?.P ?? 12.0;
  const H = inputs?.H ?? 3.5;
  const Abukaan = inputs?.Abukaan ?? 4.8;

  const isP = activeParam === 'P';
  const isH = activeParam === 'H';
  const isAbukaan = activeParam === 'Abukaan';

  const brickColor = type === 'hebel' ? '#E2E8F0' : type === 'merah' ? '#DC2626' : '#94A3B8';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 460 270" style={{ width: '100%', height: 'auto', maxHeight: '250px' }}>
        <rect width="460" height="270" rx="12" fill="#0B132B" />

        {/* Wall Canvas */}
        <rect x="80" y="60" width="300" height="150" fill="#1E293B" stroke="#475569" strokeWidth="2" />

        {/* Brick Pattern Texture */}
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <g key={row}>
            <line x1="80" y1={60 + row * 25} x2="380" y2={60 + row * 25} stroke="#334155" strokeWidth="1" />
            {[0, 1, 2, 3, 4].map((col) => (
              <rect
                key={col}
                x={80 + col * 60 + (row % 2 === 0 ? 0 : 30)}
                y={60 + row * 25}
                width="56"
                height="23"
                fill={brickColor}
                opacity={type === 'hebel' ? 0.35 : 0.45}
              />
            ))}
          </g>
        ))}

        {/* Window & Door Openings (Bukaan) */}
        {/* Door Opening */}
        <rect x="130" y="110" width="45" height="100" fill="#0B132B" stroke="#F59E0B" strokeWidth="2" strokeDasharray="4 2" />
        <text x="152" y="165" fill="#F59E0B" fontSize="9" fontWeight="700" textAnchor="middle">Pintu</text>

        {/* Window Opening */}
        <rect x="250" y="100" width="60" height="60" fill="#0B132B" stroke="#F59E0B" strokeWidth="2" strokeDasharray="4 2" />
        <text x="280" y="135" fill="#F59E0B" fontSize="9" fontWeight="700" textAnchor="middle">Jendela</text>

        {/* Dimension P (Panjang Dinding) */}
        <g onClick={() => onSelectParam?.('P')} style={{ cursor: 'pointer' }}>
          <line x1="80" y1="225" x2="380" y2="225" stroke={isP ? '#10B981' : '#38BDF8'} strokeWidth="2" />
          <rect x="200" y="215" width="60" height="18" rx="4" fill={isP ? '#10B981' : '#1E293B'} />
          <text x="230" y="228" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">P = {P} m</text>
        </g>

        {/* Dimension H (Tinggi Dinding) */}
        <g onClick={() => onSelectParam?.('H')} style={{ cursor: 'pointer' }}>
          <line x1="395" y1="60" x2="395" y2="210" stroke={isH ? '#10B981' : '#38BDF8'} strokeWidth="2" />
          <rect x="400" y="125" width="55" height="18" rx="4" fill={isH ? '#10B981' : '#1E293B'} />
          <text x="427" y="138" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">H = {H} m</text>
        </g>

        {/* Bukaan Badge */}
        <g onClick={() => onSelectParam?.('Abukaan')} style={{ cursor: 'pointer' }}>
          <rect x="15" y="20" width="165" height="24" rx="6" fill={isAbukaan ? '#10B981' : '#D97706'} />
          <text x="97" y="36" fill="#FFFFFF" fontSize="11" fontWeight="800" textAnchor="middle">Bukaan A = {Abukaan} m²</text>
        </g>
      </svg>
    </div>
  );
};

// 7. ATAP BAJA RINGAN
export const AtapBajaRinganDiagram: React.FC<DiagramProps> = ({ activeParam, onSelectParam, inputs }) => {
  const P = inputs?.P ?? 12.0;
  const L = inputs?.L ?? 8.0;
  const Sudut = inputs?.sudut ?? 30;
  const Overstek = inputs?.overstek ?? 0.8;

  const isP = activeParam === 'P';
  const isL = activeParam === 'L';
  const isSudut = activeParam === 'sudut';
  const isOverstek = activeParam === 'overstek';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 460 270" style={{ width: '100%', height: 'auto', maxHeight: '250px' }}>
        <rect width="460" height="270" rx="12" fill="#0B132B" />

        {/* Roof Truss Structure (Kuda-kuda Baja Ringan) */}
        <polygon points="230,50 390,170 70,170" fill="rgba(56, 189, 248, 0.15)" stroke="#38BDF8" strokeWidth="2.5" />
        
        {/* Internal Truss Webs */}
        <line x1="230" y1="50" x2="230" y2="170" stroke="#60A5FA" strokeWidth="1.5" />
        <line x1="150" y1="110" x2="230" y2="170" stroke="#60A5FA" strokeWidth="1.5" />
        <line x1="310" y1="110" x2="230" y2="170" stroke="#60A5FA" strokeWidth="1.5" />
        <line x1="150" y1="110" x2="150" y2="170" stroke="#60A5FA" strokeWidth="1.5" />
        <line x1="310" y1="110" x2="310" y2="170" stroke="#60A5FA" strokeWidth="1.5" />

        {/* Angle Indicator (Sudut Kemiringan) */}
        <g onClick={() => onSelectParam?.('sudut')} style={{ cursor: 'pointer' }}>
          <path d="M 100 170 A 30 30 0 0 1 120 145" fill="none" stroke={isSudut ? '#10B981' : '#F59E0B'} strokeWidth="2" />
          <rect x="110" y="130" width="55" height="18" rx="4" fill={isSudut ? '#10B981' : '#1E293B'} />
          <text x="137" y="143" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">α = {Sudut}°</text>
        </g>

        {/* Overstek Dimension */}
        <g onClick={() => onSelectParam?.('overstek')} style={{ cursor: 'pointer' }}>
          <line x1="50" y1="185" x2="70" y2="185" stroke={isOverstek ? '#10B981' : '#F59E0B'} strokeWidth="2" />
          <rect x="30" y="195" width="60" height="18" rx="4" fill={isOverstek ? '#10B981' : '#1E293B'} />
          <text x="60" y="208" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">Ov = {Overstek}m</text>
        </g>

        {/* Dimension L (Bentang) */}
        <g onClick={() => onSelectParam?.('L')} style={{ cursor: 'pointer' }}>
          <line x1="70" y1="185" x2="390" y2="185" stroke={isL ? '#10B981' : '#38BDF8'} strokeWidth="2" />
          <rect x="200" y="195" width="60" height="18" rx="4" fill={isL ? '#10B981' : '#1E293B'} />
          <text x="230" y="208" fill="#FFFFFF" fontSize="10" fontWeight="700" textAnchor="middle">L = {L} m</text>
        </g>

        {/* Title / Panjang Bangunan Badge */}
        <g onClick={() => onSelectParam?.('P')} style={{ cursor: 'pointer' }}>
          <rect x="20" y="20" width="140" height="24" rx="6" fill={isP ? '#10B981' : '#2563EB'} />
          <text x="90" y="36" fill="#FFFFFF" fontSize="11" fontWeight="800" textAnchor="middle">Panjang Atap P = {P} m</text>
        </g>
      </svg>
    </div>
  );
};

// 8. PENUTUP LANTAI / PLAFON / FINISHING / SANITAIR / LISTRIK
export const FinishingDiagram: React.FC<DiagramProps & { title: string; category: 'lantai' | 'plafon' | 'cat' | 'listrik' | 'pipa' | 'sanitair' | 'kusen' | 'plesteran' }> = ({
  title,
  category,
  activeParam,
  onSelectParam,
  inputs,
}) => {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 460 270" style={{ width: '100%', height: 'auto', maxHeight: '250px' }}>
        <rect width="460" height="270" rx="12" fill="#0B132B" />

        {/* Grid pattern */}
        <g opacity="0.3">
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1="60" y1={70 + i * 35} x2="400" y2={70 + i * 35} stroke="#38BDF8" strokeWidth="0.8" />
          ))}
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <line key={i} x1={60 + i * 55} y1="70" x2={60 + i * 55} y2="210" stroke="#38BDF8" strokeWidth="0.8" />
          ))}
        </g>

        {/* Category Visual Graphics */}
        {category === 'lantai' && (
          <g transform="translate(140, 90)">
            <rect x="0" y="0" width="180" height="100" fill="#3B82F6" opacity="0.4" stroke="#60A5FA" strokeWidth="2" />
            <text x="90" y="55" fill="#FFFFFF" fontSize="12" fontWeight="800" textAnchor="middle">POLA KERAMIK / GRANIT</text>
          </g>
        )}

        {category === 'plafon' && (
          <g transform="translate(140, 90)">
            <rect x="0" y="0" width="180" height="100" fill="#6366F1" opacity="0.4" stroke="#818CF8" strokeWidth="2" />
            <text x="90" y="55" fill="#FFFFFF" fontSize="12" fontWeight="800" textAnchor="middle">RANGKA HOLLOW & GYPSUM</text>
          </g>
        )}

        {category === 'cat' && (
          <g transform="translate(140, 90)">
            <rect x="0" y="0" width="180" height="100" fill="#EC4899" opacity="0.4" stroke="#F472B6" strokeWidth="2" />
            <text x="90" y="55" fill="#FFFFFF" fontSize="12" fontWeight="800" textAnchor="middle">PENGECATAN 3 LAPIS</text>
          </g>
        )}

        {category === 'listrik' && (
          <g transform="translate(140, 90)">
            <circle cx="90" cy="50" r="30" fill="#F59E0B" opacity="0.4" stroke="#FCD34D" strokeWidth="2" />
            <text x="90" y="55" fill="#FFFFFF" fontSize="12" fontWeight="800" textAnchor="middle">⚡ INSTALASI TITIK</text>
          </g>
        )}

        {category === 'pipa' && (
          <g transform="translate(140, 90)">
            <line x1="0" y1="50" x2="180" y2="50" stroke="#06B6D4" strokeWidth="8" strokeLinecap="round" />
            <text x="90" y="35" fill="#22D3EE" fontSize="12" fontWeight="800" textAnchor="middle">JALUR PIPA AIR BERSIH</text>
          </g>
        )}

        {category === 'sanitair' && (
          <g transform="translate(140, 90)">
            <rect x="40" y="10" width="100" height="80" rx="12" fill="#0D9488" opacity="0.4" stroke="#2DD4BF" strokeWidth="2" />
            <text x="90" y="55" fill="#FFFFFF" fontSize="12" fontWeight="800" textAnchor="middle">🚽 SANITAIR FIXTURE</text>
          </g>
        )}

        {category === 'kusen' && (
          <g transform="translate(140, 80)">
            <rect x="20" y="0" width="140" height="110" fill="none" stroke="#F59E0B" strokeWidth="4" />
            <rect x="35" y="10" width="110" height="90" fill="rgba(56, 189, 248, 0.2)" stroke="#38BDF8" strokeWidth="1" />
            <text x="90" y="60" fill="#FFFFFF" fontSize="12" fontWeight="800" textAnchor="middle">KUSEN & KACA/PANIL</text>
          </g>
        )}

        {category === 'plesteran' && (
          <g transform="translate(140, 90)">
            <rect x="0" y="0" width="180" height="100" fill="#475569" opacity="0.6" stroke="#94A3B8" strokeWidth="2" />
            <text x="90" y="55" fill="#FFFFFF" fontSize="12" fontWeight="800" textAnchor="middle">PLESTERAN + ACIAN 2 SISI</text>
          </g>
        )}

        {/* Title Badge */}
        <rect x="20" y="20" width="220" height="26" rx="6" fill="#1E1B4B" stroke="#6366F1" strokeWidth="1" />
        <text x="30" y="37" fill="#A5B4FC" fontSize="11" fontWeight="700">
          📐 {title.toUpperCase()}
        </text>

        {/* Active Param Indicator */}
        {activeParam && (
          <g>
            <rect x="270" y="20" width="170" height="26" rx="6" fill="#F59E0B" />
            <text x="355" y="37" fill="#0F172A" fontSize="11" fontWeight="800" textAnchor="middle">
              Parameter: {activeParam} = {inputs?.[activeParam] ?? ''}
            </text>
          </g>
        )}

        <text x="230" y="245" fill="#94A3B8" fontSize="10" fontWeight="500" textAnchor="middle">
          Parameter terhubung otomatis dengan rumus Quantity Take-Off master SNI/PUPR
        </text>
      </svg>
    </div>
  );
};

// 12. BAJA WF (I-BEAM / H-BEAM STRUCTURAL STEEL)
export const BajaWfDiagram: React.FC<DiagramProps> = ({ activeParam, onSelectParam, inputs }) => {
  const h = inputs?.h ?? 200;
  const bf = inputs?.bf ?? 100;
  const tw = inputs?.tw ?? 5.5;
  const tf = inputs?.tf ?? 8;
  const L = inputs?.L ?? 6.0;
  const n = inputs?.n ?? 1;

  const isH = activeParam === 'h';
  const isBf = activeParam === 'bf';
  const isTw = activeParam === 'tw';
  const isTf = activeParam === 'tf';
  const isL = activeParam === 'L';
  const isN = activeParam === 'n';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 460 270" style={{ width: '100%', height: 'auto', maxHeight: '250px' }}>
        <defs>
          <linearGradient id="wfBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0B132B" />
            <stop offset="100%" stopColor="#1E293B" />
          </linearGradient>
          <linearGradient id="steelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#94A3B8" />
            <stop offset="50%" stopColor="#64748B" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
        </defs>

        <rect width="460" height="270" rx="12" fill="url(#wfBg)" />

        {/* Title badge */}
        <rect x="20" y="16" width="220" height="24" rx="6" fill="#1E1B4B" stroke="#6366F1" strokeWidth="1" />
        <text x="30" y="32" fill="#A5B4FC" fontSize="10" fontWeight="700">
          🔩 PROFIL BAJA WF (SNI 07-7178)
        </text>

        {/* Status badge */}
        <rect x="250" y="16" width="190" height="24" rx="6" fill="rgba(245, 158, 11, 0.15)" stroke="#F59E0B" strokeWidth="1" />
        <text x="345" y="32" fill="#FBBF24" fontSize="9" fontWeight="700" textAnchor="middle">
          PROPOSED / SEPARATELY SOURCED
        </text>

        {/* WF Section Drawing (Left) */}
        <g transform="translate(100, 55)">
          {/* Top Flange */}
          <rect
            x="-45"
            y="0"
            width="90"
            height="18"
            rx="2"
            fill="url(#steelGrad)"
            stroke={isBf || isTf ? '#F59E0B' : '#38BDF8'}
            strokeWidth="2"
            onClick={() => onSelectParam?.('bf')}
            style={{ cursor: 'pointer' }}
          />

          {/* Web */}
          <rect
            x="-8"
            y="18"
            width="16"
            height="114"
            fill="url(#steelGrad)"
            stroke={isTw || isH ? '#F59E0B' : '#38BDF8'}
            strokeWidth="2"
            onClick={() => onSelectParam?.('tw')}
            style={{ cursor: 'pointer' }}
          />

          {/* Bottom Flange */}
          <rect
            x="-45"
            y="132"
            width="90"
            height="18"
            rx="2"
            fill="url(#steelGrad)"
            stroke={isBf || isTf ? '#F59E0B' : '#38BDF8'}
            strokeWidth="2"
            onClick={() => onSelectParam?.('bf')}
            style={{ cursor: 'pointer' }}
          />

          {/* Dimension: bf (Flange Width Top) */}
          <g onClick={() => onSelectParam?.('bf')} style={{ cursor: 'pointer' }}>
            <line x1="-45" y1="-8" x2="45" y2="-8" stroke={isBf ? '#10B981' : '#38BDF8'} strokeWidth="1.5" />
            <polygon points="-45,-8 -38,-11 -38,-5" fill={isBf ? '#10B981' : '#38BDF8'} />
            <polygon points="45,-8 38,-11 38,-5" fill={isBf ? '#10B981' : '#38BDF8'} />
            <rect x="-30" y="-22" width="60" height="15" rx="3" fill={isBf ? '#10B981' : '#0F172A'} stroke="#38BDF8" strokeWidth="0.8" />
            <text x="0" y="-11" fill="#FFFFFF" fontSize="9" fontWeight="700" textAnchor="middle">
              bf = {bf} mm
            </text>
          </g>

          {/* Dimension: h (Total Height) */}
          <g onClick={() => onSelectParam?.('h')} style={{ cursor: 'pointer' }}>
            <line x1="60" y1="0" x2="60" y2="150" stroke={isH ? '#10B981' : '#38BDF8'} strokeWidth="1.5" />
            <polygon points="60,0 57,7 63,7" fill={isH ? '#10B981' : '#38BDF8'} />
            <polygon points="60,150 57,143 63,143" fill={isH ? '#10B981' : '#38BDF8'} />
            <rect x="68" y="65" width="55" height="18" rx="3" fill={isH ? '#10B981' : '#0F172A'} stroke="#38BDF8" strokeWidth="0.8" />
            <text x="95" y="78" fill="#FFFFFF" fontSize="9" fontWeight="700" textAnchor="middle">
              h = {h} mm
            </text>
          </g>

          {/* Dimension: tf (Flange thickness) */}
          <g onClick={() => onSelectParam?.('tf')} style={{ cursor: 'pointer' }}>
            <line x1="-58" y1="0" x2="-58" y2="18" stroke={isTf ? '#10B981' : '#E2E8F0'} strokeWidth="1" />
            <text x="-62" y="13" fill="#E2E8F0" fontSize="8" fontWeight="600" textAnchor="end">
              tf = {tf}
            </text>
          </g>

          {/* Dimension: tw (Web thickness) */}
          <g onClick={() => onSelectParam?.('tw')} style={{ cursor: 'pointer' }}>
            <text x="18" y="78" fill="#E2E8F0" fontSize="8" fontWeight="600">
              tw = {tw}
            </text>
          </g>
        </g>

        {/* 3D Longitudinal Beam Preview (Right) */}
        <g transform="translate(260, 60)">
          {/* 3D Isometric Steel Beam Shape */}
          <path
            d="M 10 30 L 140 10 L 170 30 L 40 50 Z"
            fill="#475569"
            stroke="#94A3B8"
            strokeWidth="1.5"
          />
          <path
            d="M 10 30 L 10 110 L 40 130 L 40 50 Z"
            fill="#334155"
            stroke="#64748B"
            strokeWidth="1.5"
          />
          <path
            d="M 40 130 L 170 110 L 170 30 L 40 50 Z"
            fill="#1E293B"
            stroke="#475569"
            strokeWidth="1.5"
          />

          {/* Beam Length L */}
          <g onClick={() => onSelectParam?.('L')} style={{ cursor: 'pointer' }}>
            <line x1="10" y1="145" x2="170" y2="125" stroke={isL ? '#10B981' : '#38BDF8'} strokeWidth="2" strokeDasharray="3 3" />
            <rect x="65" y="138" width="65" height="18" rx="3" fill={isL ? '#10B981' : '#0F172A'} stroke="#38BDF8" strokeWidth="0.8" />
            <text x="97" y="151" fill="#FFFFFF" fontSize="9" fontWeight="700" textAnchor="middle">
              L = {L} m
            </text>
          </g>

          {/* Count n */}
          <g onClick={() => onSelectParam?.('n')} style={{ cursor: 'pointer' }}>
            <rect x="50" y="75" width="90" height="20" rx="4" fill={isN ? '#10B981' : 'rgba(15, 23, 42, 0.85)'} stroke="#F59E0B" strokeWidth="1" />
            <text x="95" y="89" fill="#FBBF24" fontSize="10" fontWeight="700" textAnchor="middle">
              Jumlah = {n} Batang
            </text>
          </g>
        </g>

        {/* Footer Note */}
        <text x="230" y="252" fill="#94A3B8" fontSize="9" fontWeight="500" textAnchor="middle">
          Massa Baja Nominal: Berat = Panjang Total (m) × kg/m + Waste% + Plat Sambung + Baut + Las
        </text>
      </svg>
    </div>
  );
};

// Generic Fallback Diagram
export const GenericCalculatorDiagram: React.FC<DiagramProps & { title: string; primaryUnit: string }> = ({
  title,
  primaryUnit,
  activeParam,
  onSelectParam,
  inputs,
}) => {
  return (
    <FinishingDiagram
      title={title}
      category="lantai"
      activeParam={activeParam}
      onSelectParam={onSelectParam}
      inputs={inputs}
    />
  );
};

