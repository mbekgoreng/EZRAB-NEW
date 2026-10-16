/**
 * EzrabLandingPage — "Engineering Cinema" landing variant (PREVIEW ONLY)
 *
 * Branch: preview/landing-engineering-cinema
 * Proposal 9-section — TIDAK menyentuh landing utama (ExactLandingPage + CinematicHero).
 * Seluruh angka bersifat DEMO SIMULASI dan diberi label eksplisit.
 * Styling: scoped utility CSS `engineering-cinema.css` (prefix `.ec`), BUKAN Tailwind
 * (repo ini tidak memakai Tailwind).
 */
import React, { useState } from 'react';
import {
  EzrabHero3D,
  HERO_BUILDING_ELEMENTS,
} from './EzrabHero3D';

interface EzrabLandingPageProps {
  isAuthenticated?: boolean;
  onNavigate?: (path: string) => void;
  onStartGuidedWorkspace?: () => void;
}

interface DemoRabRow {
  id: string;
  wbs: string;
  pekerjaan: string;
  sourceDoc: string;
  formula: string;
  volume: number;
  satuan: string;
  ahspRef: string;
  provenance: 'AHSP_RESMI' | 'HARGA_MANUAL' | 'ASUMSI_PASAR' | 'UNIT_MISMATCH' | 'PERLU_VERIFIKASI';
  hargaSatuanDemo: number | null;
  elementKey: string;
}

const SYNTHETIC_DEMO_RAB: DemoRabRow[] = [
  {
    id: 'row-1',
    wbs: '02.01.01',
    pekerjaan: 'Beton K-350 Fondasi Pile Cap & Tie Beam',
    sourceDoc: 'DED-STR-04.pdf (Hal. 2)',
    formula: '12 × (1.8 × 1.8 × 0.8)',
    volume: 31.1,
    satuan: 'm³',
    ahspRef: 'AHSP 2026 - 2.2.1.b (ilustrasi)',
    provenance: 'AHSP_RESMI',
    hargaSatuanDemo: 1425000,
    elementKey: 'foundation',
  },
  {
    id: 'row-2',
    wbs: '02.02.01',
    pekerjaan: 'Beton Struktur Kolom Utama K1 (600×600 mm)',
    sourceDoc: 'DED-STR-07.pdf (Hal. 4)',
    formula: '16 × (0.6 × 0.6 × 16.0)',
    volume: 92.16,
    satuan: 'm³',
    ahspRef: 'AHSP 2026 - 2.2.4.a (ilustrasi)',
    provenance: 'AHSP_RESMI',
    hargaSatuanDemo: 1580000,
    elementKey: 'columns',
  },
  {
    id: 'row-3',
    wbs: '02.03.02',
    pekerjaan: 'Pelat Lantai & Balok Induk Beton Bertulang',
    sourceDoc: 'DED-STR-09.pdf (Hal. 1)',
    formula: '4 × (18.0 × 12.0 × 0.15)',
    volume: 129.6,
    satuan: 'm³',
    ahspRef: 'AHSP 2026 - 2.2.6.c (ilustrasi)',
    provenance: 'HARGA_MANUAL',
    hargaSatuanDemo: 1490000,
    elementKey: 'slabs',
  },
  {
    id: 'row-4',
    wbs: '03.04.01',
    pekerjaan: 'Curtain Wall Double Glazed Low-E + Rangka Mullion',
    sourceDoc: 'DED-ARC-12.pdf (Fasad Utara)',
    formula: '60.0 × 14.5 × 0.65',
    volume: 565.5,
    satuan: 'm²',
    ahspRef: 'Kandidat: Kutipan Vendor kaca-02',
    provenance: 'PERLU_VERIFIKASI',
    hargaSatuanDemo: 1850000,
    elementKey: 'envelope',
  },
  {
    id: 'row-5',
    wbs: '03.04.05',
    pekerjaan: 'Sealant Weatherproof Fasad Eksterior',
    sourceDoc: 'DED-ARC-12.pdf (Catatan Spesifikasi)',
    formula: 'Keliling Panel × 2 sisi',
    volume: 420.0,
    satuan: 'm1 (Spec: kg)',
    ahspRef: 'AHSP 2026 - 3.4.9.d (ilustrasi)',
    provenance: 'UNIT_MISMATCH',
    hargaSatuanDemo: null,
    elementKey: 'envelope',
  },
];

const PROVENANCE_BADGE_MAP: Record<
  DemoRabRow['provenance'],
  { label: string; badgeClass: string; desc: string }
> = {
  AHSP_RESMI: {
    label: 'Referensi AHSP Resmi',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    desc: 'Koefisien material, upah, dan alat tertaut langsung ke master AHSP yang dipilih proyek.',
  },
  HARGA_MANUAL: {
    label: 'Harga Manual Estimator',
    badgeClass: 'bg-blue-50 text-[#2563EB] border-blue-200',
    desc: 'Harga satuan dimasukkan atau disesuaikan secara eksplisit oleh estimator proyek.',
  },
  ASUMSI_PASAR: {
    label: 'Asumsi Pasar (Sementara)',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    desc: 'Menggunakan rentang harga pasar sementara; tidak diklaim sebagai harga kontrak resmi.',
  },
  UNIT_MISMATCH: {
    label: 'Unit Mismatch',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    desc: 'Satuan pada dokumen DED (m1) berbeda dengan satuan koefisien AHSP (kg). Wajib diselaraskan.',
  },
  PERLU_VERIFIKASI: {
    label: 'Perlu Verifikasi',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    desc: 'Usulan pencocokan AI menunggu persetujuan estimator sebelum dikomit ke RAB aktif.',
  },
};

export const EzrabLandingPage: React.FC<EzrabLandingPageProps> = ({
  isAuthenticated = false,
  onNavigate,
  onStartGuidedWorkspace,
}) => {
  const [selectedBuildingElement, setSelectedBuildingElement] = useState<string>('columns');
  const [activeTourRowId, setActiveTourRowId] = useState<string>('row-2');
  const [approvedIds, setApprovedIds] = useState<string[]>(['row-1', 'row-2']);
  const [activeProvenanceFilter, setActiveProvenanceFilter] = useState<string>('ALL');

  const navigateSafe = (target: string) => {
    if (onNavigate) {
      onNavigate(target);
    } else {
      window.location.href = target;
    }
  };

  const activeTourRow =
    SYNTHETIC_DEMO_RAB.find((r) => r.id === activeTourRowId) || SYNTHETIC_DEMO_RAB[0];

  const toggleApproveDemoRow = (id: string) => {
    setApprovedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="ec min-h-screen bg-[#F5F8FC] text-[#0F172A] antialiased selection:bg-[#2563EB] selection:text-white">
      {/* Sticky Precision Navbar */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-[#DCE6F2]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#0F172A] flex items-center justify-center text-white font-mono font-bold text-sm border border-[#2563EB]/40 shadow-sm">
              EZ
            </div>
            <div>
              <span className="font-bold tracking-tight text-base text-[#0F172A]">EZRAB</span>
              <span className="hidden sm:inline-block ml-2 text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-[#F5F8FC] text-[#647D9B] border border-[#DCE6F2]">
                Engineering Workspace
              </span>
            </div>
          </div>

          <nav aria-label="Navigasi Utama" className="hidden md:flex items-center gap-6 text-sm text-[#647D9B]">
            <a href="#alur-kerja" className="hover:text-[#0F172A] transition-colors">
              Alur Kerja
            </a>
            <a href="#ded-ke-rab" className="hover:text-[#0F172A] transition-colors">
              DED ke RAB
            </a>
            <a href="#quantity-intelligence" className="hover:text-[#0F172A] transition-colors">
              QTO 3D
            </a>
            <a href="#provenance" className="hover:text-[#0F172A] transition-colors">
              Transparansi Harga
            </a>
            <a href="#interactive-tour" className="hover:text-[#0F172A] transition-colors">
              Simulasi Demo
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigateSafe(isAuthenticated ? '/dashboard' : '/login')}
              className="px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium text-[#0F172A] hover:bg-[#F5F8FC] border border-transparent hover:border-[#DCE6F2] transition-colors"
            >
              {isAuthenticated ? 'Buka Workspace' : 'Masuk'}
            </button>
            <a
              href="#interactive-tour"
              className="px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-[#2563EB] text-white hover:bg-blue-700 transition-colors shadow-sm"
            >
              Jelajahi EZRAB
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* SECTION 01 — CINEMATIC HERO */}
        <section className="relative pt-10 pb-20 lg:pt-16 lg:pb-28 overflow-hidden border-b border-[#DCE6F2]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
              {/* Left Editorial Column */}
              <div className="lg:col-span-5 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#DCE6F2] shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
                  <span className="text-xs font-medium text-[#647D9B]">
                    Engineering Intelligence. Built Around Real Construction Work.
                  </span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-[#0F172A] leading-[1.08]">
                  From Drawings to Decisions.
                </h1>

                <p className="text-base sm:text-lg text-[#647D9B] leading-relaxed">
                  Hubungkan dokumen proyek, perhitungan volume, referensi AHSP, dan estimasi
                  konstruksi dalam satu engineering workspace.
                </p>

                <p className="text-xs sm:text-sm text-[#647D9B] bg-white/80 p-3.5 rounded-xl border border-[#DCE6F2]">
                  EZRAB membantu profesional konstruksi menghubungkan dokumen, kuantitas,
                  referensi harga, dan estimasi dalam satu alur kerja yang dapat diperiksa.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      navigateSafe(isAuthenticated ? '/dashboard' : '#interactive-tour')
                    }
                    className="px-6 py-3.5 rounded-xl font-semibold text-sm bg-[#2563EB] text-white hover:bg-blue-700 transition-all shadow-sm"
                  >
                    Jelajahi EZRAB
                  </button>
                  <a
                    href="#alur-kerja"
                    className="px-5 py-3.5 rounded-xl font-semibold text-sm bg-white text-[#0F172A] border border-[#DCE6F2] hover:border-[#647D9B] transition-all"
                  >
                    Lihat Cara Kerjanya
                  </a>
                </div>
              </div>

              {/* Right 3D Architectural Engine Column */}
              <div className="lg:col-span-7">
                <EzrabHero3D
                  selectedElement={selectedBuildingElement}
                  onSelectElement={(el) => setSelectedBuildingElement(el)}
                />
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 02 — THE ENGINEERING CHALLENGE */}
        <section id="alur-kerja" className="py-20 bg-white border-b border-[#DCE6F2]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <span className="font-mono text-xs uppercase tracking-widest text-[#2563EB] font-semibold">
                02 / THE ENGINEERING CHALLENGE
              </span>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-[#0F172A]">
                Menyatukan Artefak Konstruksi yang Semula Terpisah
              </h2>
              <p className="mt-3 text-[#647D9B] text-sm sm:text-base leading-relaxed">
                Dalam proyek konstruksi nyata, gambar kerja (DED), perhitungan volume (QTO),
                tabel koefisien AHSP, dan penyusunan RAB sering tersebar di banyak file. Ketika
                satu dimensi berubah, melacak dampaknya ke biaya dan laporan membutuhkan pemeriksaan
                berulang.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                {
                  step: '01',
                  title: 'Dokumen DED',
                  desc: 'Spesifikasi teknis, daftar gambar struktur, arsitektur, dan MEP.',
                },
                {
                  step: '02',
                  title: 'Perhitungan Volume',
                  desc: 'Rumus dimensi, jumlah elemen, dan kuantitas QTO per item pekerjaan.',
                },
                {
                  step: '03',
                  title: 'AHSP & Referensi Harga',
                  desc: 'Koefisien material, upah, peralatan, serta status sumber harga.',
                },
                {
                  step: '04',
                  title: 'Penyusunan RAB',
                  desc: 'Rekapitulasi biaya per divisi pekerjaan dengan jejak perhitungan jelas.',
                },
                {
                  step: '05',
                  title: 'Laporan Konstruksi',
                  desc: 'Ekspor rincian estimasi, rekap bobot pekerjaan, dan dokumen penawaran.',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="p-5 rounded-xl bg-[#F5F8FC] border border-[#DCE6F2] flex flex-col justify-between"
                >
                  <div>
                    <span className="font-mono text-xs font-bold text-[#2563EB]">{item.step}</span>
                    <h3 className="mt-2 font-semibold text-base text-[#0F172A]">{item.title}</h3>
                    <p className="mt-1.5 text-xs text-[#647D9B] leading-relaxed">{item.desc}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#DCE6F2] flex items-center justify-between text-[11px] font-mono text-[#647D9B]">
                    <span>TERHUBUNG</span>
                    <span className="text-[#2563EB]">→</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 03 — AI-ASSISTED DED TO RAB */}
        <section id="ded-ke-rab" className="py-20 bg-[#F5F8FC] border-b border-[#DCE6F2]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-5 space-y-4">
                <span className="font-mono text-xs uppercase tracking-widest text-[#2563EB] font-semibold">
                  03 / AI-ASSISTED DED TO RAB
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A]">
                  AI Membantu Membaca &amp; Mencocokkan, Estimator Memegang Kendali Keputusan
                </h2>
                <p className="text-sm sm:text-base text-[#647D9B] leading-relaxed">
                  EZRAB memisahkan dengan tegas antara ekstraksi berbantuan AI dan mesin kalkulasi
                  deterministik. AI membantu mengidentifikasi item pekerjaan dari dokumen DED dan
                  mengusulkan kandidat AHSP, sementara seluruh perkalian volume, koefisien, dan
                  harga dihitung secara deterministik serta harus ditinjau pengguna sebelum dikomit.
                </p>

                <ul className="space-y-2.5 text-xs sm:text-sm text-[#0F172A] pt-2">
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#2563EB]/10 text-[#2563EB] font-mono text-xs flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </span>
                    <span>Dokumen DED masuk dan diurai menjadi daftar kandidat item pekerjaan.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#2563EB]/10 text-[#2563EB] font-mono text-xs flex items-center justify-center shrink-0 mt-0.5">
                      2
                    </span>
                    <span>Sistem menampilkan kandidat referensi AHSP beserta tingkat kecocokan satuan.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#2563EB]/10 text-[#2563EB] font-mono text-xs flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </span>
                    <span>Data yang belum pasti atau memiliki perbedaan satuan ditandai untuk pemeriksaan.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#2563EB]/10 text-[#2563EB] font-mono text-xs flex items-center justify-center shrink-0 mt-0.5">
                      4
                    </span>
                    <span>Estimator menyetujui atau menyesuaikan usulan sebelum dimasukkan ke RAB proyek.</span>
                  </li>
                </ul>
              </div>

              {/* Interactive Review Staging Card (DEMO) */}
              <div className="lg:col-span-7 bg-white rounded-2xl border border-[#DCE6F2] p-5 sm:p-6 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#DCE6F2]">
                  <div>
                    <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-[#2563EB]/10 text-[#2563EB] font-semibold">
                      DEMO SIMULASI PENINJAUAN DED → RAB
                    </span>
                    <h3 className="text-sm font-semibold text-[#0F172A] mt-1">
                      Antrean Verifikasi Kandidat Pekerjaan (Human-in-the-Loop)
                    </h3>
                  </div>
                  <span className="text-xs text-[#647D9B]">
                    Disetujui: <strong>{approvedIds.length}</strong> / {SYNTHETIC_DEMO_RAB.length} item
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {SYNTHETIC_DEMO_RAB.slice(0, 4).map((item) => {
                    const isApproved = approvedIds.includes(item.id);
                    const prov = PROVENANCE_BADGE_MAP[item.provenance];
                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isApproved
                            ? 'bg-[#F5F8FC] border-[#DCE6F2]'
                            : 'bg-amber-50/30 border-amber-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-[#647D9B]">{item.wbs}</span>
                            <span className="text-xs sm:text-sm font-semibold text-[#0F172A]">
                              {item.pekerjaan}
                            </span>
                          </div>
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${prov.badgeClass}`}
                          >
                            {prov.label}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#647D9B]">
                          <div>
                            <span>Sumber: {item.sourceDoc}</span>
                            <span className="mx-2">•</span>
                            <span>Kandidat: {item.ahspRef}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleApproveDemoRow(item.id)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                              isApproved
                                ? 'bg-emerald-600 text-white'
                                : 'bg-white text-[#0F172A] border border-[#DCE6F2] hover:border-[#2563EB]'
                            }`}
                          >
                            {isApproved ? 'Telah Disetujui (Demo)' : 'Setujui Kandidat'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 04 — QUANTITY INTELLIGENCE */}
        <section id="quantity-intelligence" className="py-20 bg-white border-b border-[#DCE6F2]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="max-w-2xl">
                <span className="font-mono text-xs uppercase tracking-widest text-[#2563EB] font-semibold">
                  04 / QUANTITY INTELLIGENCE (QTO)
                </span>
                <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-[#0F172A]">
                  Jejak Perhitungan: Dimensi → Rumus → Volume → Item Pekerjaan
                </h2>
                <p className="mt-2 text-sm sm:text-base text-[#647D9B]">
                  Setiap angka volume dapat ditelusuri kembali ke parameter dimensi dan rumus
                  geometrinya. Pilih komponen bangunan di bawah untuk melihat rantai perhitungan
                  pada data simulasi (<span className="font-mono font-semibold">DEMO</span>).
                </p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-4 gap-4">
              {Object.values(HERO_BUILDING_ELEMENTS).map((el) => {
                const isSelected = selectedBuildingElement === el.id;
                return (
                  <button
                    key={el.id}
                    type="button"
                    onClick={() => setSelectedBuildingElement(el.id)}
                    className={`text-left p-5 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-[#0F172A] text-white border-[#0F172A] shadow-md'
                        : 'bg-[#F5F8FC] text-[#0F172A] border-[#DCE6F2] hover:border-[#647D9B]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-mono text-xs font-semibold ${
                          isSelected ? 'text-[#56C8F5]' : 'text-[#2563EB]'
                        }`}
                      >
                        {el.code}
                      </span>
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/10 border border-white/20">
                        DEMO
                      </span>
                    </div>
                    <h3 className="mt-2 font-semibold text-sm leading-snug">{el.name}</h3>
                    <div className={`mt-4 pt-3 border-t space-y-1 text-xs ${isSelected ? 'border-white/15' : 'border-[#DCE6F2]'}`}>
                      <p className={isSelected ? 'text-slate-300' : 'text-[#647D9B]'}>
                        Rumus: <span className="font-mono">{el.formulaDemo}</span>
                      </p>
                      <p className="font-mono font-bold text-sm">
                        Volume: {el.volumeDemo}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 05 — TRUSTED ESTIMATION (COST PROVENANCE) */}
        <section id="provenance" className="py-20 bg-[#F5F8FC] border-b border-[#DCE6F2]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <span className="font-mono text-xs uppercase tracking-widest text-[#2563EB] font-semibold">
                05 / TRUSTED ESTIMATION &amp; COST PROVENANCE
              </span>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-[#0F172A]">
                Status dan Sumber Harga yang Transparan, Tanpa Klaim Tersembunyi
              </h2>
              <p className="mt-3 text-sm sm:text-base text-[#647D9B]">
                EZRAB tidak pernah menyamarkan asumsi pasar sebagai harga resmi. Setiap baris
                estimasi memuat indikator asal-usul harga (*cost provenance*) agar tim proyek
                tahu persis mana item yang sudah terverifikasi dan mana yang membutuhkan konfirmasi.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  status: 'Referensi AHSP Resmi',
                  badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                  detail:
                    'Mengacu pada katalog AHSP yang dipilih proyek dengan rincian koefisien upah, bahan, dan alat yang dapat diperiksa.',
                },
                {
                  status: 'Harga Manual',
                  badge: 'bg-blue-50 text-[#2563EB] border-blue-200',
                  detail:
                    'Nilai harga satuan dimasukkan langsung oleh estimator berdasarkan penawaran vendor atau histori proyek.',
                },
                {
                  status: 'Asumsi Pasar (Sementara)',
                  badge: 'bg-indigo-50 text-indigo-800 border-indigo-200',
                  detail:
                    'Diberi penanda tegas sebagai estimasi awal dan dipisahkan dari harga referensi resmi.',
                },
                {
                  status: 'Harga Belum Tersedia',
                  badge: 'bg-slate-100 text-slate-700 border-slate-300',
                  detail:
                    'Item pekerjaan sudah teridentifikasi dari dokumen atau QTO, namun menunggu input harga satuan.',
                },
                {
                  status: 'Unit Mismatch',
                  badge: 'bg-rose-50 text-rose-800 border-rose-200',
                  detail:
                    'Peringatan otomatis saat satuan volume pada QTO tidak identik dengan satuan analisis pada AHSP.',
                },
                {
                  status: 'Perlu Verifikasi',
                  badge: 'bg-amber-50 text-amber-800 border-amber-200',
                  detail:
                    'Menandakan item hasil pencocokan berbantuan AI yang wajib ditinjau manusia sebelum masuk ke laporan.',
                },
              ].map((card) => (
                <div
                  key={card.status}
                  className="bg-white p-5 rounded-xl border border-[#DCE6F2] shadow-2xs"
                >
                  <span
                    className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${card.badge}`}
                  >
                    {card.status}
                  </span>
                  <p className="mt-3 text-xs sm:text-sm text-[#647D9B] leading-relaxed">
                    {card.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 06 — CONNECTED WORKSPACE */}
        <section className="py-20 bg-white border-b border-[#DCE6F2]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <span className="font-mono text-xs uppercase tracking-widest text-[#2563EB] font-semibold">
              06 / CONNECTED WORKSPACE
            </span>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-[#0F172A]">
              Modul yang Terintegrasi di Dalam Aplikasi EZRAB
            </h2>
            <p className="mt-2 text-sm sm:text-base text-[#647D9B] max-w-2xl">
              Seluruh modul dirancang untuk saling berbagi struktur WBS, kuantitas, dan referensi
              harga dalam satu ruang kerja proyek.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  title: 'Proyek',
                  desc: 'Pengelolaan metadata proyek, lokasi, tahun acuan harga, dan struktur divisi pekerjaan.',
                },
                {
                  title: 'RAB & Estimasi',
                  desc: 'Tabel estimasi biaya lengkap dengan rincian koefisien, bobot pekerjaan, dan rekapitulasi.',
                },
                {
                  title: 'DED → RAB',
                  desc: 'Alur pembacaan dokumen teknis berbantuan AI dengan antrean persetujuan estimator.',
                },
                {
                  title: 'Quantity Takeoff (QTO)',
                  desc: 'Perhitungan volume berbasis parameter dimensi dan rumus yang tertaut ke item RAB.',
                },
                {
                  title: 'Katalog AHSP',
                  desc: 'Pencarian dan pemeriksaan analisa harga satuan pekerjaan beserta komponen penyusunnya.',
                },
                {
                  title: 'Manajemen Proyek',
                  desc: 'Pemantauan progres biaya, ringkasan anggaran, dan kesiapan item pekerjaan.',
                },
                {
                  title: 'Laporan & Dokumen',
                  desc: 'Penyusunan dokumen rincian RAB, rekapitulasi divisi, dan format siap cetak.',
                },
                {
                  title: 'Tutorial Center',
                  desc: 'Panduan interaktif langkah demi langkah langsung di dalam workspace EZRAB.',
                },
              ].map((mod) => (
                <div
                  key={mod.title}
                  className="p-5 rounded-xl bg-[#F5F8FC] border border-[#DCE6F2] flex flex-col justify-between"
                >
                  <div>
                    <h3 className="font-semibold text-base text-[#0F172A]">{mod.title}</h3>
                    <p className="mt-2 text-xs text-[#647D9B] leading-relaxed">{mod.desc}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#DCE6F2] text-xs font-medium text-[#2563EB]">
                    Modul Tersedia
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 07 — INTERACTIVE PRODUCT TOUR (SANDBOXED DEMO) */}
        <section id="interactive-tour" className="py-20 bg-[#F5F8FC] border-b border-[#DCE6F2]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="font-mono text-xs uppercase tracking-widest text-[#2563EB] font-semibold">
                  07 / INTERACTIVE PRODUCT TOUR (ISOLATED DEMO)
                </span>
                <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0F172A]">
                  Coba Alur Pemeriksaan RAB Tanpa Mengubah Data Proyek
                </h2>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                DATA SINTETIS • LABEL: DEMO
              </span>
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Table: Synthetic RAB Inspector */}
              <div className="lg:col-span-8 bg-white rounded-2xl border border-[#DCE6F2] overflow-hidden shadow-xs">
                <div className="p-4 border-b border-[#DCE6F2] flex flex-wrap items-center justify-between gap-2 bg-[#F5F8FC]">
                  <span className="text-xs font-semibold text-[#0F172A]">
                    Proyek Demo: Gedung Kantor 4 Lantai (Data Sintetis Terisolasi)
                  </span>
                  <div className="flex items-center gap-1.5">
                    {['ALL', 'AHSP_RESMI', 'PERLU_VERIFIKASI', 'UNIT_MISMATCH'].map((flt) => (
                      <button
                        key={flt}
                        type="button"
                        onClick={() => setActiveProvenanceFilter(flt)}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                          activeProvenanceFilter === flt
                            ? 'bg-[#0F172A] text-white'
                            : 'bg-white text-[#647D9B] border border-[#DCE6F2]'
                        }`}
                      >
                        {flt === 'ALL' ? 'Semua Status' : flt.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#DCE6F2] text-[#647D9B] bg-white">
                        <th className="py-3 px-4 font-mono">WBS</th>
                        <th className="py-3 px-4">Uraian Pekerjaan</th>
                        <th className="py-3 px-4 font-mono">Volume (DEMO)</th>
                        <th className="py-3 px-4">Status Sumber Harga</th>
                        <th className="py-3 px-4 text-right">Subtotal (DEMO)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE6F2]">
                      {SYNTHETIC_DEMO_RAB.filter(
                        (r) =>
                          activeProvenanceFilter === 'ALL' ||
                          r.provenance === activeProvenanceFilter
                      ).map((row) => {
                        const isSelected = row.id === activeTourRow.id;
                        const badge = PROVENANCE_BADGE_MAP[row.provenance];
                        const subtotal =
                          row.hargaSatuanDemo !== null
                            ? row.volume * row.hargaSatuanDemo
                            : null;
                        return (
                          <tr
                            key={row.id}
                            onClick={() => {
                              setActiveTourRowId(row.id);
                              setSelectedBuildingElement(row.elementKey);
                            }}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-50/70' : 'hover:bg-[#F5F8FC]'
                            }`}
                          >
                            <td className="py-3 px-4 font-mono text-[#647D9B]">{row.wbs}</td>
                            <td className="py-3 px-4 font-medium text-[#0F172A]">
                              {row.pekerjaan}
                            </td>
                            <td className="py-3 px-4 font-mono">
                              {row.volume.toFixed(2)} {row.satuan}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.badgeClass}`}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-medium">
                              {subtotal !== null
                                ? `Rp ${subtotal.toLocaleString('id-ID')}`
                                : 'Menunggu Penyelarasan'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Inspector: Document & Provenance Preview */}
              <div className="lg:col-span-4 bg-white rounded-2xl border border-[#DCE6F2] p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-[#DCE6F2] pb-3">
                    <span className="font-mono text-xs font-bold text-[#2563EB]">
                      INSPEKTOR ITEM ({activeTourRow.wbs})
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F5F8FC] border border-[#DCE6F2]">
                      DEMO PREVIEW
                    </span>
                  </div>

                  <h3 className="mt-3 font-semibold text-sm text-[#0F172A]">
                    {activeTourRow.pekerjaan}
                  </h3>

                  <dl className="mt-4 space-y-2.5 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-[#DCE6F2]">
                      <dt className="text-[#647D9B]">Dokumen Sumber:</dt>
                      <dd className="font-mono text-[#0F172A]">{activeTourRow.sourceDoc}</dd>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-[#DCE6F2]">
                      <dt className="text-[#647D9B]">Rumus QTO:</dt>
                      <dd className="font-mono text-[#0F172A]">{activeTourRow.formula}</dd>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-[#DCE6F2]">
                      <dt className="text-[#647D9B]">Referensi AHSP (ilustrasi):</dt>
                      <dd className="font-mono text-[#0F172A]">{activeTourRow.ahspRef}</dd>
                    </div>
                  </dl>

                  <div className="mt-4 p-3 rounded-xl bg-[#F5F8FC] border border-[#DCE6F2] text-xs text-[#647D9B]">
                    <strong className="text-[#0F172A] block mb-1">Catatan Provenance:</strong>
                    {PROVENANCE_BADGE_MAP[activeTourRow.provenance].desc}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-[#DCE6F2]">
                  {onStartGuidedWorkspace && (
                    <button
                      type="button"
                      onClick={onStartGuidedWorkspace}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-[#0F172A] text-white hover:bg-slate-800 transition-colors"
                    >
                      Buka Panduan Interaktif Workspace
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 08 — AUDIENCE */}
        <section className="py-20 bg-white border-b border-[#DCE6F2]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <span className="font-mono text-xs uppercase tracking-widest text-[#2563EB] font-semibold">
              08 / DIRANCANG UNTUK PROFESIONAL KONSTRUKSI
            </span>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-[#0F172A]">
              Mendukung Peran Teknis di Seluruh Siklus Estimasi
            </h2>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                {
                  role: 'Estimator & Quantity Surveyor',
                  benefit:
                    'Menjaga konsistensi rumus volume QTO, koefisien AHSP, dan melacak perubahan harga satuan dengan cepat.',
                },
                {
                  role: 'Kontraktor',
                  benefit:
                    'Menyusun dokumen penawaran dan memeriksa kembali asumsi harga pasar sebelum pengajuan tender.',
                },
                {
                  role: 'Konsultan Engineering',
                  benefit:
                    'Menghubungkan spesifikasi gambar DED dengan Engineer’s Estimate (EE) yang terdokumentasi.',
                },
                {
                  role: 'Pengelola Proyek',
                  benefit:
                    'Memantau distribusi bobot biaya per divisi pekerjaan dan meninjau kelengkapan referensi harga.',
                },
                {
                  role: 'Mahasiswa Teknik Sipil & Arsitektur',
                  benefit:
                    'Mempelajari struktur penyusunan RAB, QTO, dan pembacaan koefisien AHSP secara sistematis.',
                },
              ].map((aud) => (
                <div
                  key={aud.role}
                  className="p-5 rounded-xl bg-[#F5F8FC] border border-[#DCE6F2]"
                >
                  <h3 className="font-semibold text-sm text-[#0F172A]">{aud.role}</h3>
                  <p className="mt-2 text-xs text-[#647D9B] leading-relaxed">{aud.benefit}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 09 — FINAL CTA */}
        <section className="py-20 bg-[#0F172A] text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
            <span className="inline-block font-mono text-xs uppercase tracking-widest text-[#56C8F5]">
              EZRAB ENGINEERING WORKSPACE
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Make Every Estimate More Traceable.
            </h2>
            <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto">
              Mulai dari data proyek yang terstruktur, lanjutkan ke estimasi yang dapat ditinjau.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigateSafe(isAuthenticated ? '/dashboard' : '/login')}
                className="px-6 py-3.5 rounded-xl font-semibold text-sm bg-[#2563EB] text-white hover:bg-blue-600 transition-colors"
              >
                {isAuthenticated ? 'Masuk ke Workspace Proyek' : 'Masuk ke Akun EZRAB'}
              </button>
              <a
                href="#interactive-tour"
                className="px-6 py-3.5 rounded-xl font-semibold text-sm bg-white/10 text-white hover:bg-white/15 border border-white/15 transition-colors"
              >
                Jelajahi Simulasi Demo
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-[#DCE6F2] py-8 text-xs text-[#647D9B]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#0F172A]">EZRAB</span>
            <span>— Engineering Intelligence. Built Around Real Construction Work.</span>
          </div>
          <div>
            <span>Seluruh angka pada halaman orientasi ini merupakan simulasi berlabel DEMO.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
