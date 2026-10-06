import React from 'react';
import { Cpu, Calculator, Database, FileSpreadsheet, FolderGit2, LineChart, Check, Sparkles } from 'lucide-react';

export const FeatureGrid: React.FC = () => {
  const features = [
    {
      icon: Cpu,
      tag: 'Magic AI',
      title: 'AI Interpretation & QTO Parsing',
      desc: 'Konversi prompt teks, gambar denah, file DED, atau dokumen PDF menjadi daftar volume pekerjaan (QTO) siap hitung.',
      accent: 'var(--ezrab-blue)',
    },
    {
      icon: Calculator,
      tag: 'Deterministic Math',
      title: 'Mesin Kalkulasi Finansial Presisi',
      desc: 'AI mengekstrak dan memetakan, namun seluruh perhitungan uang dan volume dihitung mesin deterministik bebas floating-point error.',
      accent: 'var(--ezrab-cyan)',
    },
    {
      icon: Database,
      tag: 'Standar 2026',
      title: 'Database AHSP & Indeks Harga Wilayah',
      desc: 'Ribuan koefisien resmi PUPR 2026 terintegrasi dengan database material, upah tukang, dan alat berat per 38 provinsi.',
      accent: 'var(--ezrab-purple)',
    },
    {
      icon: FileSpreadsheet,
      tag: 'Excel-Grade',
      title: 'Spreadsheet Interaktif & Rumus Dinamis',
      desc: 'Antarmuka tabel responsif dengan dukungan formula otomatis, pengelompokan kategori pekerjaan, dan autosave.',
      accent: 'var(--ezrab-success)',
    },
    {
      icon: FolderGit2,
      tag: 'Enterprise Security',
      title: 'Isolasi Data Proyek & Multi-User',
      desc: 'Setiap proyek terisolasi rapat. Data estimasi dan log riwayat Anda terlindungi tanpa pernah tercampur pengguna lain.',
      accent: 'var(--ezrab-warning)',
    },
    {
      icon: LineChart,
      tag: 'Visual S-Curve',
      title: 'Manajemen Kurva S & Cashflow Proyek',
      desc: 'Pantau deviasi rencana vs realisasi lapangan dengan grafik Kurva S otomatis langsung dari breakdown item RAB.',
      accent: 'var(--ezrab-blue)',
    },
  ];

  return (
    <section id="fitur" style={{ padding: '100px 0', background: 'var(--ezrab-bg)' }}>
      <div className="ezrab-container">
        {/* Section Heading */}
        <div style={{ textAlign: 'center', marginBottom: '64px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="ezrab-section-tag">
            <Sparkles size={14} />
            <span>Pilar Keunggulan EZRAB v2</span>
          </div>
          <h2 className="ezrab-section-title">Teknologi Konstruksi Kelas Dunia</h2>
          <p className="ezrab-section-desc">
            Dirancang dari nol untuk estimator, kontraktor, arsitek, dan quantity surveyor yang menuntut kecepatan tanpa mengorbankan akurasi finansial.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '24px',
          }}
        >
          {features.map(({ icon: Icon, tag, title, desc, accent }, idx) => (
            <div
              key={idx}
              style={{
                background: 'var(--ezrab-surface)',
                border: '1px solid var(--ezrab-border)',
                borderRadius: 'var(--ezrab-radius-lg)',
                padding: '32px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: 'var(--ezrab-shadow-sm)',
                transition: 'transform 0.3s var(--ezrab-transition), box-shadow 0.3s var(--ezrab-transition), border-color 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.3)';
                e.currentTarget.style.boxShadow = 'var(--ezrab-shadow-md)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'var(--ezrab-border)';
                e.currentTarget.style.boxShadow = 'var(--ezrab-shadow-sm)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    background: 'var(--ezrab-surface-soft)',
                    border: '1px solid var(--ezrab-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--ezrab-blue)',
                  }}
                >
                  <Icon size={22} />
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--ezrab-blue)',
                    background: 'var(--ezrab-blue-soft)',
                    padding: '4px 10px',
                    borderRadius: '999px',
                  }}
                >
                  {tag}
                </span>
              </div>

              <h3 style={{ fontSize: '18px', fontWeight: 750, color: 'var(--ezrab-text)', marginBottom: '10px', letterSpacing: '-0.02em' }}>
                {title}
              </h3>

              <p style={{ fontSize: '14.5px', color: 'var(--ezrab-text-secondary)', lineHeight: 1.6, flexGrow: 1 }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
