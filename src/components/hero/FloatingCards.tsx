import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Sparkles, CheckCircle2, TrendingUp, FileSpreadsheet, ShieldCheck, Cpu } from 'lucide-react';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

export const FloatingCards: React.FC = () => {
  const rabNumberRef = useRef<HTMLSpanElement>(null);
  const [aiStep, setAiStep] = useState(0);

  // GSAP Count-up animation for Total RAB
  useEffect(() => {
    const targetValue = 2482350000;
    const obj = { val: 0 };

    const ctx = gsap.context(() => {
      gsap.to(obj, {
        val: targetValue,
        duration: 2.2,
        ease: 'power2.out',
        onUpdate: () => {
          if (rabNumberRef.current) {
            rabNumberRef.current.textContent = formatCurrencyIDR(Math.round(obj.val));
          }
        },
      });
    });

    // Sequential AI Step Progress
    const stepTimer = setInterval(() => {
      setAiStep((prev) => (prev < 3 ? prev + 1 : 0));
    }, 2800);

    return () => {
      ctx.revert();
      clearInterval(stepTimer);
    };
  }, []);

  return (
    <>
      {/* 1. AI Processing Card (Top Left) */}
      <div
        className="ezrab-float-card"
        style={{
          top: '6%',
          left: '2%',
          width: '240px',
          animation: 'ai-card-float 5s ease-in-out infinite',
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'var(--ezrab-blue-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ezrab-blue)',
              }}
            >
              <Cpu size={16} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ezrab-text)' }}>EZRAB AI Engine</span>
          </div>
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--ezrab-blue)',
              background: 'var(--ezrab-blue-soft)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            LIVE
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', color: 'var(--ezrab-text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: aiStep >= 1 ? 'var(--ezrab-success)' : 'inherit' }}>
            <CheckCircle2 size={13} />
            <span>1. CAD/DED QTO Ekstraksi</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: aiStep >= 2 ? 'var(--ezrab-success)' : 'inherit' }}>
            <CheckCircle2 size={13} />
            <span>2. AHSP PUPR 2026 Matched</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: aiStep >= 3 ? 'var(--ezrab-success)' : 'inherit' }}>
            <CheckCircle2 size={13} />
            <span>3. Optimasi Koefisien 100%</span>
          </div>
        </div>

        <div
          style={{
            marginTop: '10px',
            height: '4px',
            borderRadius: '2px',
            background: 'var(--ezrab-border)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: aiStep === 0 ? '25%' : aiStep === 1 ? '50%' : aiStep === 2 ? '75%' : '100%',
              background: 'var(--ezrab-blue)',
              transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </div>
      </div>

      {/* 2. Total RAB Card (Top Right) */}
      <div
        className="ezrab-float-card"
        style={{
          top: '4%',
          right: '0%',
          width: '270px',
          animation: 'rab-float 6s ease-in-out infinite',
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ezrab-text-secondary)' }}>Total Estimasi RAB</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--ezrab-success)',
              background: 'var(--ezrab-success-soft)',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            <TrendingUp size={12} /> -14.2% Cost Opt.
          </span>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <span
            ref={rabNumberRef}
            style={{
              fontSize: '20px',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--ezrab-text)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Rp 0
          </span>
        </div>

        {/* Dynamic Sparkline SVG */}
        <div style={{ width: '100%', height: '28px' }}>
          <svg viewBox="0 0 220 30" fill="none" style={{ width: '100%', height: '100%' }}>
            <path
              d="M0 25 Q 40 10, 80 18 T 140 8 T 200 4 L 220 2"
              stroke="var(--ezrab-blue)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M0 25 Q 40 10, 80 18 T 140 8 T 200 4 L 220 2 L 220 30 L 0 30 Z"
              fill="url(#sparklineGrad)"
              opacity="0.15"
            />
            <defs>
              <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ezrab-blue)" />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* 3. Spreadsheet Mini Calculation Card (Bottom Left) */}
      <div
        className="ezrab-float-card"
        style={{
          bottom: '6%',
          left: '0%',
          width: '280px',
          animation: 'spreadsheet-float 7s ease-in-out infinite',
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <FileSpreadsheet size={16} color="var(--ezrab-blue)" />
          <span style={{ fontSize: '12px', fontWeight: 700 }}>Kalkulasi AHSP Real-time</span>
        </div>

        <table style={{ width: '100%', fontSize: '10.5px', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ color: 'var(--ezrab-text-muted)', borderBottom: '1px solid var(--ezrab-border)' }}>
              <th style={{ paddingBottom: '4px' }}>Item</th>
              <th style={{ paddingBottom: '4px', textAlign: 'right' }}>Vol</th>
              <th style={{ paddingBottom: '4px', textAlign: 'right' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--ezrab-text-secondary)' }}>
            <tr style={{ borderBottom: '1px solid var(--ezrab-border)' }}>
              <td style={{ padding: '4px 0', fontWeight: 500 }}>Beton K-300</td>
              <td style={{ padding: '4px 0', textAlign: 'right', fontFamily: 'JetBrains Mono' }}>184 m³</td>
              <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600, color: 'var(--ezrab-text)' }}>230.0 jt</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--ezrab-border)' }}>
              <td style={{ padding: '4px 0', fontWeight: 500 }}>Baja Tulangan</td>
              <td style={{ padding: '4px 0', textAlign: 'right', fontFamily: 'JetBrains Mono' }}>14.25 t</td>
              <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600, color: 'var(--ezrab-text)' }}>239.4 jt</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 0', fontWeight: 500 }}>Bata Ringan</td>
              <td style={{ padding: '4px 0', textAlign: 'right', fontFamily: 'JetBrains Mono' }}>485 m²</td>
              <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600, color: 'var(--ezrab-text)' }}>68.8 jt</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 4. Progress / QTO Breakdown Card (Bottom Right) */}
      <div
        className="ezrab-float-card"
        style={{
          bottom: '8%',
          right: '2%',
          width: '220px',
          animation: 'progress-float 6.5s ease-in-out infinite',
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700 }}>Kesiapan Proyek</span>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ezrab-blue)', fontFamily: 'JetBrains Mono' }}>88%</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--ezrab-text-secondary)', marginBottom: '2px' }}>
              <span>Pek. Struktur</span>
              <span>100%</span>
            </div>
            <div style={{ height: '4px', background: 'var(--ezrab-border)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: 'var(--ezrab-success)' }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--ezrab-text-secondary)', marginBottom: '2px' }}>
              <span>Pek. Arsitektur</span>
              <span>85%</span>
            </div>
            <div style={{ height: '4px', background: 'var(--ezrab-border)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: '85%', height: '100%', background: 'var(--ezrab-blue)' }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--ezrab-text-secondary)', marginBottom: '2px' }}>
              <span>Pek. MEP & Finishing</span>
              <span>72%</span>
            </div>
            <div style={{ height: '4px', background: 'var(--ezrab-border)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: '72%', height: '100%', background: 'var(--ezrab-purple)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* 5. AHSP 2026 PUPR Certified Badge (Floating Center Top) */}
      <div
        className="ezrab-float-card"
        style={{
          top: '20%',
          right: '25%',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          borderRadius: '999px',
          animation: 'export-badge-float 5.5s ease-in-out infinite',
          zIndex: 4,
        }}
      >
        <ShieldCheck size={14} color="var(--ezrab-blue)" />
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ezrab-text)' }}>AHSP PUPR 2026 Verified</span>
      </div>
    </>
  );
};
