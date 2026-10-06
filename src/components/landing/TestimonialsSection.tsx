import React from 'react';
import { Sparkles, Quote, Star } from 'lucide-react';

export const TestimonialsSection: React.FC = () => {
  const testimonials = [
    {
      name: 'Budi Santoso',
      role: 'Konsultan Struktur',
      quote:
        'Tampilannya clean, fiturnya lengkap, dan sangat membantu pekerjaan saya sehari-hari dalam validasi koefisien & volume.',
      avatarBg: '#dbeafe',
      avatarColor: '#1d4ed8',
      initials: 'BS',
    },
    {
      name: 'Dewi Lestari',
      role: 'Project Manager',
      quote:
        'Proses perhitungan jauh lebih cepat. Sangat cocok untuk kebutuhan proyek kantor kami yang membutuhkan integrasi data real-time.',
      avatarBg: '#fef3c7',
      avatarColor: '#b45309',
      initials: 'DL',
    },
    {
      name: 'Rizky Maulana',
      role: 'Kontraktor',
      quote:
        'Template-nya sesuai dengan standar PUPR, ini tools yang wajib dimiliki semua estimator proyek bangunan dan infrastruktur.',
      avatarBg: '#dcfce7',
      avatarColor: '#15803d',
      initials: 'RM',
    },
  ];

  return (
    <section
      id="testimoni"
      style={{
        padding: '90px 0',
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      <div className="ezrab-container">
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#eff6ff',
              border: '1px solid #dbeafe',
              color: '#2563eb',
              padding: '4px 14px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 700,
              marginBottom: '12px',
            }}
          >
            <Sparkles size={13} />
            <span>Apa Kata Mereka</span>
          </div>

          <h2
            style={{
              fontSize: 'clamp(28px, 3.4vw, 38px)',
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
              marginBottom: '10px',
            }}
          >
            Dipercaya oleh Ribuan Profesional
          </h2>

          <p style={{ fontSize: '15px', color: '#64748b' }}>
            Dari arsitek, kontraktor, hingga konsultan, EZRAB membantu mereka bekerja lebih efisien.
          </p>
        </div>

        {/* 3 Testimonial Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
          }}
        >
          {testimonials.map((item, idx) => (
            <div
              key={idx}
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '18px',
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '20px',
                transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#bfdbfe';
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow =
                  '0 14px 32px -4px rgba(37, 99, 235, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div>
                {/* 5 Stars Rating */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    color: '#f59e0b',
                    marginBottom: '14px',
                  }}
                >
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={15} fill="currentColor" />
                  ))}
                </div>

                <p
                  style={{
                    fontSize: '14px',
                    color: '#334155',
                    lineHeight: 1.65,
                    fontStyle: 'italic',
                  }}
                >
                  "{item.quote}"
                </p>
              </div>

              {/* Author Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: item.avatarBg,
                    color: item.avatarColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 800,
                  }}
                >
                  {item.initials}
                </div>

                <div>
                  <b
                    style={{
                      display: 'block',
                      fontSize: '14.5px',
                      fontWeight: 750,
                      color: '#0f172a',
                    }}
                  >
                    {item.name}
                  </b>
                  <small
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: '#64748b',
                    }}
                  >
                    {item.role}
                  </small>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
