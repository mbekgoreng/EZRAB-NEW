import React, { useState } from 'react';
import {
  Sparkles,
  Calculator,
  Layers,
  FileSpreadsheet,
  ArrowRight,
  ChevronLeft,
  X,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';

interface OnboardingTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartFirstProject: () => void;
}

export const OnboardingTourModal: React.FC<OnboardingTourModalProps> = ({
  isOpen,
  onClose,
  onStartFirstProject,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      stepNumber: 1,
      badge: 'Selamat Datang',
      title: 'Selamat datang di Platform EZRAB 👋',
      description:
        'EZRAB adalah platform kecerdasan konstruksi terintegrasi untuk menyusun Rencana Anggaran Biaya (RAB), menghitung volume QTO, dan memetakan analisa harga satuan (AHSP) secara akurat dan efisien.',
      highlight: 'Kalkulasi deterministik berbasis standar PUPR 2026 dan SNI tanpa koefisien fiktif.',
      icon: Sparkles,
      iconColor: '#4F46E5',
      iconBg: '#EEF2FF',
    },
    {
      stepNumber: 2,
      badge: 'Metode Fleksibel',
      title: '4 Cara Mudah Memulai Proyek Anda',
      description:
        'Anda memiliki kebebasan penuh dalam memulai estimasi proyek sesuai data yang tersedia saat ini:',
      items: [
        '✨ Magic AI: Generate instan dari prompt, gambar kerja, atau dokumen DED.',
        '📝 Manual RAB: Isi identitas proyek dan bangun struktur pekerjaan sendiri.',
        '📐 Volume Calculation: Hitung dimensi galian, sloof, dinding, atap secara parametrik.',
        '🏗️ Template RAB: Gunakan template standar Type 36 hingga Type 300 yang siap pakai.',
      ],
      icon: Layers,
      iconColor: '#2563EB',
      iconBg: '#EFF6FF',
    },
    {
      stepNumber: 3,
      badge: 'Standar Standar Nasional',
      title: 'Database AHSP PUPR 2026 & Indeks Wilayah',
      description:
        'Setiap item pekerjaan terhubung ke analisa komponen upah tenaga kerja, material berspesifikasi resmi, dan sewa alat berat yang disesuaikan dengan indeks harga wilayah Indonesia.',
      highlight: 'Riwayat modifikasi dan penyesuaian harga dapat diaudit kapan saja dengan aman.',
      icon: Calculator,
      iconColor: '#059669',
      iconBg: '#ECFDF5',
    },
    {
      stepNumber: 4,
      badge: 'Spreadsheet & Ekspor',
      title: 'Spreadsheet Interaktif, Kurva S, & Ekspor',
      description:
        'Kelola lembar RAB layaknya spreadsheet modern dengan auto-formula instan. Pantau jadwal pekerjaan melalui Kurva S dan ekspor laporan profesional berstandar institusi (Excel & PDF).',
      highlight: 'Siap untuk langsung mulai? Buat proyek pertama Anda sekarang juga!',
      icon: FileSpreadsheet,
      iconColor: '#D97706',
      iconBg: '#FFFBEB',
    },
  ];

  const active = steps[currentStep];
  const IconComponent = active.icon;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      onClose();
      onStartFirstProject();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 120,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '520px',
          padding: '30px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                background: active.iconBg,
                color: active.iconColor,
                padding: '3px 10px',
                borderRadius: '999px',
                letterSpacing: '0.03em',
              }}
            >
              {active.badge} • LANGKAH {active.stepNumber} DARI 4
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
            }}
            title="Tutup Panduan"
          >
            <X size={20} />
          </button>
        </div>

        {/* Hero Visual Icon */}
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '16px',
            background: active.iconBg,
            color: active.iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '18px',
          }}
        >
          <IconComponent size={30} />
        </div>

        {/* Step Title & Copy */}
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 10px 0', lineHeight: 1.3 }}>
          {active.title}
        </h2>
        <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.6, margin: '0 0 16px 0' }}>
          {active.description}
        </p>

        {/* Step 2 Feature Items List */}
        {active.items && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
            {active.items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '12.5px',
                  color: '#334155',
                  lineHeight: 1.45,
                }}
              >
                {item}
              </div>
            ))}
          </div>
        )}

        {/* Highlight Callout */}
        {active.highlight && (
          <div
            style={{
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '12px',
              color: '#1E40AF',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '20px',
            }}
          >
            <CheckCircle2 size={16} color="#2563EB" style={{ flexShrink: 0 }} />
            <span>{active.highlight}</span>
          </div>
        )}

        {/* Stepper Dots & Navigation Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
          {/* 4 Step Dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {[0, 1, 2, 3].map((dotIdx) => (
              <div
                key={dotIdx}
                onClick={() => setCurrentStep(dotIdx)}
                style={{
                  width: currentStep === dotIdx ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '999px',
                  background: currentStep === dotIdx ? '#2563EB' : '#CBD5E1',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
          </div>

          {/* Action CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                background: 'transparent',
                border: 'none',
                color: '#64748B',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Lewati
            </button>

            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: '#F1F5F9',
                  border: '1px solid #E2E8F0',
                  color: '#475569',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <ChevronLeft size={15} />
                <span>Sebelumnya</span>
              </button>
            )}

            <button
              onClick={handleNext}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                background: '#2563EB',
                color: '#ffffff',
                border: 'none',
                fontSize: '13px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              }}
            >
              <span>{currentStep === 3 ? 'Mulai Proyek Pertama' : 'Lanjut'}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTourModal;
