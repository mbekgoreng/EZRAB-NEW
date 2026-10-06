import React, { useState } from 'react';
import {
  Sparkles,
  Upload,
  Eye,
  Layers,
  FileStack,
  Calculator,
  Check,
  BadgeCheck,
  FileText,
  FileSpreadsheet,
  Building2,
  ListChecks,
  Clock,
  Cpu,
  Download,
  Ruler,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import magicAiBlueprintImg from '../../assets/magic-ai-blueprint.webp';
import magicAiIsometricImg from '../../assets/magic-ai-isometric.webp';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

interface MagicAiPlaygroundProps {
  onOpenWorkspace?: () => void;
}

export const MagicAiPlayground: React.FC<MagicAiPlaygroundProps> = ({ onOpenWorkspace }) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('Bangun rumah tinggal 2 lantai minimalis tropis ukuran 8x15m di BSD dengan struktur beton K-300 dan atap baja ringan');
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('gedung_kantor.pdf');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const samplePrompts = [
    'Bangun rumah tinggal 2 lantai 8x15m di BSD',
    'Renovasi gedung kantor 3 lantai luas 450 m²',
    'Pembangunan ruko 2 pintu 3 lantai di Surabaya Barat',
  ];

  const handleSimulateUpload = () => {
    showToast('Memilih file gambar kerja (JPG, PDF, DWG)...');
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setUploadedFileName('desain_proyek_rev4.dwg');
      showToast('File gambar kerja berhasil diproses dengan presisi 99.9%!');
    }, 1200);
  };

  return (
    <section id="magic-ai" style={{ padding: '80px 0', background: 'var(--ezrab-bg)' }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-2.5 rounded-full bg-[#0F172A] text-white text-[13px] font-medium shadow-2xl animate-fade-in border border-slate-700 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-yellow-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="ezrab-container">
        {/* Section Heading */}
        <div style={{ textAlign: 'center', marginBottom: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="ezrab-section-tag">
            <Sparkles size={14} />
            <span>EZRAB Magic AI (Beta)</span>
          </div>
          <h2 className="ezrab-section-title">
            Ubah Gambar Kerja Menjadi <span style={{ color: 'var(--ezrab-blue)' }}>RAB dalam Hitungan Menit</span>
          </h2>
          <p className="ezrab-section-desc">
            Upload gambar kerja atau ketik spesifikasi, biarkan EZRAB Magic AI membaca, menghitung volume (QTO), mencocokkan AHSP 2026, dan menghasilkan estimasi RAB secara otomatis.
          </p>
        </div>

        {/* Quick Interactive Prompt Box */}
        <div
          style={{
            maxWidth: '1000px',
            marginInline: 'auto',
            background: 'var(--ezrab-surface)',
            border: '1px solid var(--ezrab-border)',
            borderRadius: 'var(--ezrab-radius-lg)',
            boxShadow: 'var(--ezrab-shadow-lg)',
            padding: '24px',
            marginBottom: '32px',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ezrab-text-muted)' }}>
              Contoh Prompt:
            </span>
            {samplePrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => setPrompt(p)}
                style={{
                  fontSize: '12px',
                  padding: '5px 12px',
                  borderRadius: '999px',
                  background: 'var(--ezrab-surface-soft)',
                  border: '1px solid var(--ezrab-border)',
                  color: 'var(--ezrab-text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ketik spesifikasi proyek atau upload gambar kerja..."
              style={{
                flexGrow: 1,
                minWidth: '260px',
                height: '46px',
                padding: '0 16px',
                borderRadius: '10px',
                border: '1.5px solid var(--ezrab-border-strong)',
                background: 'var(--ezrab-bg)',
                color: 'var(--ezrab-text)',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSimulateUpload}
              disabled={isGenerating}
              className="inline-flex items-center justify-center gap-2 h-[46px] px-5 rounded-[10px] bg-[#2563EB] text-white text-[13.5px] font-semibold hover:bg-[#1D4ED8] transition-all cursor-pointer shadow-md disabled:opacity-75"
            >
              {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{isGenerating ? 'Menganalisis...' : 'Generate Magic RAB'}</span>
            </button>
          </div>
        </div>

        {/* Full Super Visual Experience (Matching Ezrab-Magic-Ai-Super.html) */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
          {/* Left Column (Canvas & 5-Step Process) */}
          <div className="min-w-0 space-y-5 overflow-hidden">
            {/* Interactive Blueprint Visualization Stage */}
            <div className="relative bg-gradient-to-br from-white via-white to-[#EFF6FF] rounded-[20px] border border-[#E8EEF0] shadow-[0_4px_24px_rgba(37,99,235,0.06)] h-[480px] lg:h-[360px] overflow-hidden">
              <div
                className="absolute inset-0 opacity-[0.35] pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(#CBD5E1 1.2px, transparent 1.2px)',
                  backgroundSize: '22px 22px',
                }}
              />

              <svg className="absolute inset-0 w-full h-full pointer-events-none hidden lg:block">
                <line x1="22%" y1="50%" x2="42%" y2="50%" stroke="#BFDBFE" strokeWidth="2" strokeDasharray="6 6" />
                <line x1="58%" y1="50%" x2="76%" y2="50%" stroke="#BFDBFE" strokeWidth="2" strokeDasharray="6 6" />
              </svg>

              {/* Step 1: Input Blueprint */}
              <div className="absolute left-[3%] lg:left-[4%] top-[4%] lg:top-1/2 lg:-translate-y-1/2 w-[46%] lg:w-[200px] max-w-[175px] lg:max-w-[200px] bg-white rounded-[16px] shadow-[0_8px_24px_rgba(15,23,42,0.08)] border border-[#EEF2F7] p-3 z-10">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-[8px] bg-[#EFF6FF] flex items-center justify-center">
                    <Upload className="w-4 h-4 text-[#2563EB]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold leading-tight truncate">Gambar Kerja</p>
                    <p className="text-[9px] text-[#94A3B8]">JPG/PDF/DWG</p>
                  </div>
                  <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400" />
                </div>

                <div className="relative rounded-[10px] overflow-hidden bg-[#F8FAFC] border border-[#EEF2F7] h-[98px] flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#F1F5F9] to-[#E2E8F0]" />
                  <div className="relative w-[86%] h-[74%] bg-white rounded-[6px] shadow-sm border border-[#E2E8F0] p-1.5 rotate-[-2deg]">
                    <div className="w-full h-full border border-dashed border-[#CBD5E1] rounded-[4px] flex flex-col gap-1 p-1">
                      <div className="h-[2px] w-3/4 bg-[#CBD5E1] rounded" />
                      <div className="h-[2px] w-1/2 bg-[#CBD5E1] rounded" />
                      <div className="flex-1 mt-1 grid grid-cols-3 gap-1">
                        <div className="bg-[#F1F5F9] rounded-[2px]" />
                        <div className="bg-[#F1F5F9] rounded-[2px]" />
                        <div className="bg-[#F1F5F9] rounded-[2px]" />
                      </div>
                    </div>
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-[78%] h-[70%] bg-white rounded-[6px] shadow-md border border-[#E2E8F0] p-1.5 rotate-[3deg]">
                    <img src={magicAiIsometricImg} alt="blueprint" className="w-full h-full object-contain opacity-95" />
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-1.5 text-[9px] text-[#64748B]">
                  <div className="flex -space-x-1 shrink-0">
                    <div className="w-3.5 h-3.5 rounded-full bg-[#DBEAFE] border border-white" />
                    <div className="w-3.5 h-3.5 rounded-full bg-[#BFDBFE] border border-white" />
                  </div>
                  <span className="truncate">{uploadedFileName} • 2.4 MB</span>
                </div>
              </div>

              {/* Step 2: Center AI Processing Engine */}
              <div className="absolute left-1/2 top-[62%] lg:top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20">
                <div className="absolute -top-[86px] lg:-top-[72px] w-[200px] lg:w-[380px] h-[100px] lg:h-[160px] -z-10 opacity-70 pointer-events-none">
                  <img src={magicAiBlueprintImg} alt="AI Processing" className="w-full h-full object-contain mix-blend-multiply" />
                  <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
                </div>

                <div className="absolute -left-[112px] top-[18px] hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-[#BFDBFE] shadow-[0_2px_8px_rgba(37,99,235,0.12)] text-[10px] font-semibold text-[#2563EB]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-ping" />
                  <span>AI Processing...</span>
                </div>

                <div className="relative w-[80px] h-[80px] rounded-[18px] bg-gradient-to-br from-[#3B82F6] to-[#1E40AF] shadow-[0_8px_28px_rgba(37,99,235,0.4),0_0_0_8px_rgba(37,99,235,0.08)] flex items-center justify-center">
                  <span className="text-white font-black text-[28px] tracking-tight">AI</span>
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-white rounded-full shadow flex items-center justify-center">
                    <div className="w-2 h-2 bg-[#22C55E] rounded-full" />
                  </div>
                  <div className="absolute inset-0 rounded-[18px] bg-white/10" />
                </div>

                <div className="mt-3 px-3 py-1 rounded-full bg-[#EFF6FF] border border-[#DBEAFE] text-[10px] font-bold text-[#2563EB] shadow-sm whitespace-nowrap">
                  EZRAB MAGIC
                </div>
              </div>

              {/* Step 3: Analysis Results */}
              <div className="absolute right-[3%] lg:right-[4%] top-[4%] lg:top-1/2 lg:-translate-y-1/2 w-[46%] lg:w-[210px] max-w-[175px] lg:max-w-[210px] bg-white rounded-[16px] shadow-[0_8px_24px_rgba(15,23,42,0.08)] border border-[#EEF2F7] p-3 z-10">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[11px] font-bold text-[#0F172A]">Hasil Analisis</p>
                  <span className="px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[9px] font-bold border border-[#BBF7D0]">
                    Selesai
                  </span>
                </div>

                <div className="space-y-2">
                  {['Membaca gambar kerja', 'Menghitung volume (QTO)', 'Mencocokkan AHSP 2026', 'Menghasilkan RAB'].map((r) => (
                    <div key={r} className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-[#DCFCE7] flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5 text-[#16A34A] stroke-[3]" />
                      </div>
                      <span className="text-[10px] font-medium text-[#334155] leading-tight">{r}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 h-[28px] rounded-[8px] bg-[#F8FAFC] border border-[#EEF2F7] flex items-center justify-between px-2.5">
                  <span className="text-[9px] text-[#64748B]">Akurasi AI</span>
                  <span className="text-[10px] font-extrabold text-[#16A34A]">99.9%</span>
                </div>
              </div>

              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/95 backdrop-blur border border-[#E2E8F0] shadow-sm max-w-[90%] z-10">
                <div className="w-5 h-5 rounded-full bg-[#EFF6FF] flex items-center justify-center">
                  <Ruler className="w-3 h-3 text-[#2563EB]" />
                </div>
                <span className="text-[9px] lg:text-[10px] font-medium text-[#64748B] whitespace-nowrap">
                  Deteksi otomatis struktur • arsitektur • MEP
                </span>
              </div>
            </div>

            {/* 5 Process Steps */}
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                {/* Step 1 */}
                <div className="bg-white rounded-[16px] border border-[#E8EEF0] p-4 h-[300px] flex flex-col shadow-[0_1px_8px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-between">
                    <div className="w-6 h-6 rounded-full bg-[#2563EB] text-white text-[11px] font-bold flex items-center justify-center">1</div>
                    <div className="w-6 h-6 rounded-full bg-[#DCFCE7] flex items-center justify-center"><Check className="w-3.5 h-3.5 text-[#16A34A] stroke-[3]" /></div>
                  </div>
                  <h4 className="mt-3 text-[12.5px] font-bold text-[#0F172A]">Upload Gambar</h4>
                  <p className="mt-1 text-[10px] text-[#64748B] leading-[14px]">Unggah file gambar kerja (JPG, PDF, DWG)</p>
                  <div className="mt-3 flex-1 rounded-[10px] bg-[#F8FAFC] border border-[#EEF2F7] p-2 flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-[6px] bg-[#FEE2E2] flex items-center justify-center"><FileText className="w-3.5 h-3.5 text-[#EF4444]" /></div>
                      <div className="min-w-0"><p className="text-[10px] font-semibold truncate text-[#0F172A]">{uploadedFileName}</p><p className="text-[9px] text-[#94A3B8]">2.4 MB</p></div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#16A34A]">
                      <BadgeCheck className="w-3.5 h-3.5 text-[#16A34A]" /><span>Selesai diupload</span>
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="bg-white rounded-[16px] border border-[#E8EEF0] p-4 h-[300px] flex flex-col shadow-[0_1px_8px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-between">
                    <div className="w-6 h-6 rounded-full bg-[#2563EB] text-white text-[11px] font-bold flex items-center justify-center">2</div>
                    <span className="text-[11px] font-bold text-[#2563EB]">96%</span>
                  </div>
                  <h4 className="mt-3 text-[12.5px] font-bold text-[#0F172A]">AI Membaca & Analisis</h4>
                  <p className="mt-1 text-[10px] text-[#64748B] leading-[14px]">AI mengenali elemen struktur & arsitektur.</p>
                  <div className="mt-2.5"><div className="h-1.5 w-full bg-[#EFF6FF] rounded-full overflow-hidden"><div className="h-full w-[96%] bg-[#2563EB] rounded-full" /></div></div>
                  <div className="mt-2 flex-1 rounded-[10px] bg-[#F8FAFC] border border-[#EEF2F7] p-1 flex items-center justify-center overflow-hidden">
                    <img src={magicAiIsometricImg} alt="isometric" className="w-full h-full object-contain" />
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-white rounded-[16px] border border-[#E8EEF0] p-4 h-[300px] flex flex-col shadow-[0_1px_8px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-between">
                    <div className="w-6 h-6 rounded-full bg-[#2563EB] text-white text-[11px] font-bold flex items-center justify-center">3</div>
                    <span className="text-[11px] font-bold text-[#16A34A]">100%</span>
                  </div>
                  <h4 className="mt-3 text-[12.5px] font-bold text-[#0F172A]">Perhitungan Volume (QTO)</h4>
                  <p className="mt-1 text-[10px] text-[#64748B] leading-[14px]">Menghitung volume pekerjaan otomatis.</p>
                  <div className="mt-2.5"><div className="h-1.5 w-full bg-[#DCFCE7] rounded-full overflow-hidden"><div className="h-full w-full bg-[#16A34A] rounded-full" /></div></div>
                  <div className="mt-2.5 space-y-1.5 flex-1 flex flex-col justify-center text-[10px]">
                    <div className="flex justify-between"><span>Pekerjaan Tanah</span><span className="font-semibold">1.250 m³</span></div>
                    <div className="flex justify-between"><span>Pondasi</span><span className="font-semibold">450 m³</span></div>
                    <div className="flex justify-between"><span>Beton Bertulang</span><span className="font-semibold">320 m³</span></div>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="bg-white rounded-[16px] border border-[#E8EEF0] p-4 h-[300px] flex flex-col shadow-[0_1px_8px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-between">
                    <div className="w-6 h-6 rounded-full bg-[#2563EB] text-white text-[11px] font-bold flex items-center justify-center">4</div>
                    <span className="text-[11px] font-bold text-[#16A34A]">100%</span>
                  </div>
                  <h4 className="mt-3 text-[12.5px] font-bold text-[#0F172A]">Cocokkan AHSP 2026</h4>
                  <p className="mt-1 text-[10px] text-[#64748B] leading-[14px]">Mencocokkan harga satuan terbaru.</p>
                  <div className="mt-2.5"><div className="h-1.5 w-full bg-[#DCFCE7] rounded-full overflow-hidden"><div className="h-full w-full bg-[#16A34A] rounded-full" /></div></div>
                  <div className="mt-2.5 flex-1 rounded-[10px] bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] border border-[#BFDBFE] p-2.5 flex flex-col justify-between text-[9.5px]">
                    <div className="flex items-center gap-1.5"><FileStack className="w-3.5 h-3.5 text-[#2563EB]" /><span className="font-bold">AHSP 2026</span></div>
                    <div className="flex justify-between"><span>Wilayah</span><span className="font-semibold">DKI Jakarta</span></div>
                    <div className="flex items-center gap-1 text-[9px] text-[#2563EB] font-semibold"><BadgeCheck className="w-3 h-3" /> Terverifikasi 2026</div>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="bg-white rounded-[16px] border border-[#E8EEF0] p-4 h-[300px] flex flex-col shadow-[0_1px_8px_rgba(15,23,42,0.04)] text-center relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="w-6 h-6 rounded-full bg-[#2563EB] text-white text-[11px] font-bold flex items-center justify-center">5</div>
                    <span className="text-[11px] font-bold text-[#16A34A]">100%</span>
                  </div>
                  <h4 className="mt-3 text-[12.5px] font-bold text-[#0F172A]">Hasil RAB</h4>
                  <p className="mt-1 text-[10px] text-[#64748B] leading-[14px]">RAB lengkap siap diexport.</p>
                  <div className="mt-2.5"><div className="h-1.5 w-full bg-[#DCFCE7] rounded-full overflow-hidden"><div className="h-full w-full bg-[#16A34A] rounded-full" /></div></div>
                  <div className="mt-2 flex-1 flex flex-col items-center justify-center gap-1.5">
                    <span className="text-[20px]">🏆</span>
                    <p className="text-[11px] font-bold text-[#0F172A]">RAB Siap!</p>
                    <p className="text-[9.5px] text-[#64748B]">Total Rp 2,48 M</p>
                    {onOpenWorkspace && (
                      <button
                        onClick={onOpenWorkspace}
                        className="mt-1 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#2563EB] text-white text-[11px] font-semibold hover:bg-[#1D4ED8] transition-colors cursor-pointer"
                      >
                        Buka di Workspace →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (Sidebar Summary Cards) */}
          <div className="space-y-4 min-w-0">
            {/* Card 1: Hasil Perhitungan */}
            <div className="bg-white rounded-[16px] border border-[#EEF2F7] shadow-[0_2px_12px_rgba(15,23,42,0.04)] p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[13px] font-bold text-[#0F172A]">Hasil Perhitungan</h4>
                <span className="px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[10px] font-bold">Selesai</span>
              </div>
              <p className="text-[11px] text-[#94A3B8]">Total RAB</p>
              <p className="text-[19px] font-extrabold tracking-tight text-[#0F172A]">Rp 2.482.350.000</p>
              <div className="mt-3 h-[85px] w-full relative overflow-hidden rounded-[10px] bg-[#F8FAFC] border border-[#EEF2F7]">
                <svg viewBox="0 0 300 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                  <path d="M0 70 C 40 60, 80 80, 120 55 S 200 20, 240 35 S 280 45, 300 30 L 300 100 L 0 100 Z" fill="rgba(37,99,235,0.15)" />
                  <path d="M0 70 C 40 60, 80 80, 120 55 S 200 20, 240 35 S 280 45, 300 30" fill="none" stroke="#2563EB" strokeWidth="2.5" />
                </svg>
              </div>
            </div>

            {/* Card 2: Ringkasan Proyek */}
            <div className="bg-white rounded-[16px] border border-[#EEF2F7] shadow-[0_2px_12px_rgba(15,23,42,0.04)] p-4">
              <h4 className="text-[13px] font-bold mb-3 text-[#0F172A]">Ringkasan Proyek</h4>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-[10px] bg-[#F8FAFC] border border-[#EEF2F7] p-2">
                  <p className="text-[#94A3B8]">Volume Total</p>
                  <p className="font-bold text-[12px] text-[#0F172A]">1.245,60 m³</p>
                </div>
                <div className="rounded-[10px] bg-[#F8FAFC] border border-[#EEF2F7] p-2">
                  <p className="text-[#94A3B8]">Item Pekerjaan</p>
                  <p className="font-bold text-[12px] text-[#0F172A]">24</p>
                </div>
                <div className="rounded-[10px] bg-[#F8FAFC] border border-[#EEF2F7] p-2">
                  <p className="text-[#94A3B8]">Durasi</p>
                  <p className="font-bold text-[12px] text-[#0F172A]">120 Hari</p>
                </div>
                <div className="rounded-[10px] bg-[#EFF6FF] border border-[#DBEAFE] p-2">
                  <p className="text-[#2563EB]">Akurasi AI</p>
                  <p className="font-bold text-[12px] text-[#2563EB]">99.9%</p>
                </div>
              </div>
            </div>

            {/* Card 3: Dokumen Hasil */}
            <div className="bg-white rounded-[16px] border border-[#EEF2F7] shadow-[0_2px_12px_rgba(15,23,42,0.04)] p-4">
              <h4 className="text-[13px] font-bold mb-2.5 text-[#0F172A]">Dokumen Hasil</h4>
              <div className="space-y-2">
                {[
                  { name: 'RAB (PDF)', size: '2.4 MB', icon: FileText, color: 'bg-[#FEE2E2] text-[#EF4444]' },
                  { name: 'QTO (Excel)', size: '1.8 MB', icon: FileSpreadsheet, color: 'bg-[#DCFCE7] text-[#16A34A]' },
                ].map((r) => (
                  <div
                    key={r.name}
                    onClick={() => showToast(`Mengunduh dokumen ${r.name}...`)}
                    className="flex items-center gap-2.5 p-2 rounded-[8px] hover:bg-[#F8FAFC] transition-colors cursor-pointer border border-[#EEF2F7]"
                  >
                    <div className={`w-7 h-7 rounded-[6px] flex items-center justify-center ${r.color} shrink-0`}>
                      <r.icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold truncate text-[#0F172A]">{r.name}</p>
                      <p className="text-[9.5px] text-[#94A3B8]">{r.size}</p>
                    </div>
                    <Download className="w-3.5 h-3.5 text-[#2563EB]" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
