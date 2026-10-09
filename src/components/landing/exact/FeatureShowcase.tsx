import React, { useEffect, useState, useRef } from 'react';
import {
  Sparkles,
  Database,
  FileSpreadsheet,
  TrendingUp,
  FileText,
  Zap,
  Check,
} from 'lucide-react';

/**
 * FeatureShowcase — menggantikan video bangunan di hero.
 * Panel kaca auto-rotate yang menampilkan 6 fitur unggulan EZRAB,
 * masing-masing dengan mini-visual CSS murni (tanpa video/gambar).
 */
interface FeatureSlide {
  id: string;
  icon: React.ReactNode;
  accent: string; // css class suffix
  label: string;
  title: string;
  desc: string;
  visual: React.ReactNode;
  stat: string;
}

const SLIDES: FeatureSlide[] = [
  {
    id: 'ded-ai',
    icon: <Sparkles size={18} />,
    accent: 'cyan',
    label: 'DED AI ESTIMATE',
    title: 'Gambar DED → RAB Otomatis',
    desc: 'AI membaca dokumen DED dan mengurai pekerjaan beserta volumenya dalam hitungan detik.',
    visual: (
      <div className="ez-fs-rows">
        <div className="ez-fs-row"><span>Pondasi batu kali</span><b>5 m³</b></div>
        <div className="ez-fs-row"><span>Beton sloof K-225</span><b>0,6 m³</b></div>
        <div className="ez-fs-row"><span>Dinding bata</span><b>90 m²</b></div>
        <div className="ez-fs-progress"><div className="ez-fs-progress-bar cyan" style={{ width: '92%' }} /></div>
      </div>
    ),
    stat: 'Analisis 1,8 detik',
  },
  {
    id: 'ahsp',
    icon: <Database size={18} />,
    accent: 'blue',
    label: 'AHSP 2026',
    title: 'Harga Satuan Resmi Terupdate',
    desc: 'Katalog AHSP Permen PUPR 2026 — ribuan item pekerjaan, upah, dan material.',
    visual: (
      <div className="ez-fs-rows">
        <div className="ez-fs-row"><span>Beton bertulang K-300</span><b>Rp 820rb<small>/m³</small></b></div>
        <div className="ez-fs-row"><span>Baja tulangan</span><b>Rp 15,2rb<small>/kg</small></b></div>
        <div className="ez-fs-row"><span>Pasangan bata</span><b>Rp 148rb<small>/m²</small></b></div>
        <div className="ez-fs-pill blue"><Check size={12} /> 5.768 item terverifikasi</div>
      </div>
    ),
    stat: 'Permen PUPR No. 1/2026',
  },
  {
    id: 'rab',
    icon: <FileSpreadsheet size={18} />,
    accent: 'green',
    label: 'RAB SPREADSHEET',
    title: 'Susun RAB Seperti Excel',
    desc: 'Spreadsheet interaktif dengan formula otomatis, rekap per divisi, dan pajak.',
    visual: (
      <div className="ez-fs-table">
        <div className="ez-fs-thead"><span>Pekerjaan</span><span>Vol</span><span>Jumlah</span></div>
        <div className="ez-fs-trow"><span>Pek. Tanah</span><span>12 m³</span><b>Rp 4,2jt</b></div>
        <div className="ez-fs-trow"><span>Pek. Beton</span><span>8 m³</span><b>Rp 9,6jt</b></div>
        <div className="ez-fs-tfoot"><span>Total</span><b>Rp 13,8jt</b></div>
      </div>
    ),
    stat: 'PPN & profit otomatis',
  },
  {
    id: 'kurva-s',
    icon: <TrendingUp size={18} />,
    accent: 'amber',
    label: 'KURVA S',
    title: 'Pantau Progres Proyek',
    desc: 'Kurva S rencana vs realisasi — deviasi terlihat sekilas, bukan di akhir proyek.',
    visual: (
      <div className="ez-fs-chart" aria-hidden="true">
        {[18, 26, 34, 42, 52, 60, 68, 76, 84, 90, 95, 100].map((h, i) => (
          <div key={i} className="ez-fs-bar" style={{ height: `${h}%` }} />
        ))}
        <div className="ez-fs-chart-line" />
      </div>
    ),
    stat: 'Deviasi +2,1% bulan ini',
  },
  {
    id: 'ai-doc',
    icon: <FileText size={18} />,
    accent: 'purple',
    label: 'AI DOCUMENT',
    title: 'Dokumen Dibaca AI',
    desc: 'Ringkasan, tanya-jawab, dan ekstraksi data dari PDF kontrak maupun laporan.',
    visual: (
      <div className="ez-fs-doc">
        <div className="ez-fs-doc-line w90" />
        <div className="ez-fs-doc-line w70" />
        <div className="ez-fs-doc-line w85" />
        <div className="ez-fs-doc-line w60" />
        <div className="ez-fs-pill purple"><Check size={12} /> 12 halaman → 1 menit</div>
      </div>
    ),
    stat: 'Tanya jawab per halaman',
  },
  {
    id: 'magic-ai',
    icon: <Zap size={18} />,
    accent: 'pink',
    label: 'MAGIC AI',
    title: 'Tambah Item via Chat',
    desc: 'Ketik kebutuhan dalam bahasa sehari-hari — AI menyusun item RAB-nya.',
    visual: (
      <div className="ez-fs-chat">
        <div className="ez-fs-bubble user">tambah pondasi 5 m³</div>
        <div className="ez-fs-bubble ai">✓ 1 item ditambahkan ke RAB</div>
      </div>
    ),
    stat: 'Tanpa buka spreadsheet',
  },
];

const ROTATE_MS = 3600;

export const FeatureShowcase: React.FC = () => {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    timer.current = setInterval(() => {
      setActive((a) => (a + 1) % SLIDES.length);
    }, ROTATE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused]);

  const slide = SLIDES[active];

  return (
    <div
      className="ez-feature-showcase"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="region"
      aria-label="Fitur unggulan EZRAB"
    >
      <div className="ez-fs-glow" aria-hidden="true" />
      <div className={`ez-fs-card accent-${slide.accent}`} key={slide.id}>
        <div className="ez-fs-header">
          <div className={`ez-fs-icon accent-${slide.accent}`}>{slide.icon}</div>
          <div className="ez-fs-header-text">
            <span className="ez-fs-label">{slide.label}</span>
            <span className="ez-fs-stat">{slide.stat}</span>
          </div>
        </div>
        <h3 className="ez-fs-title">{slide.title}</h3>
        <p className="ez-fs-desc">{slide.desc}</p>
        <div className="ez-fs-visual">{slide.visual}</div>
      </div>
      <div className="ez-fs-dots" role="tablist" aria-label="Pilih fitur">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={s.label}
            className={`ez-fs-dot${i === active ? ' is-active' : ''}`}
            onClick={() => setActive(i)}
          />
        ))}
      </div>
      <div className="ez-fs-thumbs" aria-hidden="true">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            tabIndex={-1}
            className={`ez-fs-thumb${i === active ? ' is-active' : ''}`}
            onClick={() => setActive(i)}
          >
            {s.icon}
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
