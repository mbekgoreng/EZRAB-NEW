import React, { useState } from 'react';
import '../../styles/features-page.css';
import {
  ArrowRight,
  ArrowLeft,
  Calculator,
  Database,
  FileSpreadsheet,
  BrainCircuit,
  MessageSquareText,
  FileSearch,
  TrendingUp,
  LayoutTemplate,
  Wallet,
  FolderKanban,
  FileDown,
  Check,
  ChevronDown,
  Sparkles,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { ExactFooter } from './exact/ExactFooter';

interface FeaturesPageProps {
  onBackToLanding: () => void;
  onOpenWorkspace: () => void;
  onOpenPricing: () => void;
}

const STATS = [
  { value: '24', label: 'Kalkulator QTO bergambar' },
  { value: '5.792', label: 'Item AHSP 2026' },
  { value: '10', label: 'Tutorial interaktif' },
  { value: '3', label: 'Asisten AI' },
];

const PAINS = [
  {
    no: '01',
    title: 'Volume dihitung manual, diketik ulang.',
    desc: 'Ukur dari gambar kerja pakai kalkulator HP, salin ke Excel, satu angka salah ketik — seluruh penawaran ikut meleset. Baru ketahuan setelah proyek jalan.',
  },
  {
    no: '02',
    title: 'Harga dari ingatan dan chat supplier.',
    desc: 'Tidak ada acuan harga satuan yang konsisten. Estimator senior dan junior menghasilkan angka berbeda untuk pekerjaan yang sama.',
  },
  {
    no: '03',
    title: 'Revisi owner = hitung ulang dari nol.',
    desc: 'Ganti spesifikasi sedikit, semua sheet Excel harus disisir satu per satu. Tidak ada rantai yang otomatis menyesuaikan.',
  },
];

const DIFFERENTIATORS = [
  {
    no: '01',
    title: 'Masukkan dimensi, bukan volume.',
    desc: 'EZRAB tidak meminta volume yang sudah jadi. Masukkan panjang, lebar, tinggi, dan jumlah dari gambar kerja — 24 kalkulator parametrik menghitung volume beton, berat pembesian, dan luas bekisting sekaligus, lalu masuk RAB dengan kode AHSP yang tepat.',
  },
  {
    no: '02',
    title: 'AI mengusulkan, sistem yang menghitung.',
    desc: 'DED Estimate AI menyusun draft daftar pekerjaan dari gambar kerja Anda. Tapi harga tidak pernah datang dari AI: angka final selalu dihitung dari koefisien AHSP resmi × harga Anda sendiri. Setiap angka bisa diklik untuk melihat dasarnya.',
  },
  {
    no: '03',
    title: 'Rantainya tidak berhenti di RAB.',
    desc: 'QTO → RAB → Kurva S → keuangan proyek → laporan Excel/PDF. Satu angka diubah di hulu, semuanya di hilir ikut menyesuaikan. Tidak ada file bercabang.',
  },
];

const STEPS = [
  {
    no: 'LANGKAH 1',
    title: 'Buat proyek',
    desc: 'Nama, lokasi, tanggal mulai. Pilih dan atur parameter proyek Anda.',
  },
  {
    no: 'LANGKAH 2',
    title: 'Susun RAB',
    desc: 'Pakai kalkulator parametrik, ambil dari library AHSP 2026, atau biarkan AI menyusun draft dari gambar DED.',
  },
  {
    no: 'LANGKAH 3',
    title: 'Kelola & laporkan',
    desc: 'Pantau progres, lihat Kurva S, catat keuangan proyek, export laporan Excel & PDF siap tender.',
  },
];

const MODULES = [
  { icon: Calculator, title: 'Kalkulator QTO', desc: '24 kalkulator parametrik bergambar: beton, pembesian, bekisting, pasangan, plesteran, atap, dan lainnya.' },
  { icon: Database, title: 'AHSP 2026', desc: '5.792 item analisa harga satuan resmi — Cipta Karya, SDA, Bina Marga.' },
  { icon: FileSpreadsheet, title: 'RAB & BOQ', desc: 'Spreadsheet RAB, rekapitulasi, dan BOQ dalam satu alur.' },
  { icon: BrainCircuit, title: 'DED Estimate AI', desc: 'Upload gambar kerja → AI menyusun RAB otomatis untuk Anda periksa.' },
  { icon: MessageSquareText, title: 'Ezrab Chat AI', desc: 'Tanya soal estimasi dan proyek, dijawab dari data EZRAB sendiri.' },
  { icon: FileSearch, title: 'AI Document', desc: 'Analisis dokumen proyek dengan AI.' },
  { icon: TrendingUp, title: 'Kurva S', desc: 'Progres fisik tertimbang bobot nilai, rencana vs aktual.' },
  { icon: LayoutTemplate, title: 'Template RAB', desc: 'Mulai dari template siap pakai, bukan halaman kosong.' },
  { icon: Wallet, title: 'Keuangan Proyek', desc: 'Catat pemasukan-pengeluaran, saldo berjalan per proyek.' },
  { icon: FolderKanban, title: 'Manajemen Proyek', desc: 'Semua proyek dalam satu dashboard dengan status jelas.' },
  { icon: FileDown, title: 'Export Excel & PDF', desc: 'Laporan RAB, BOQ, dan rekap siap cetak.' },
  { icon: Database, title: 'Database Harga', desc: 'Harga material, upah, dan alat acuan Anda sendiri.' },
];

const AI_FEATURES = [
  {
    no: 'AI · 01',
    title: 'DED Estimate AI',
    desc: 'Jelaskan atau unggah gambar kerja — AI menyusun draft daftar pekerjaan dengan kode AHSP dan volume perkiraan untuk Anda periksa.',
  },
  {
    no: 'AI · 02',
    title: 'AI Document',
    desc: 'Dokumen proyek dibaca dan dianalisis AI menjadi insight yang bisa ditindaklanjuti.',
  },
  {
    no: 'AI · 03',
    title: 'Ezrab Chat AI',
    desc: 'Asisten chat yang menjawab dari data EZRAB sendiri — RAB, AHSP, dan harga — bukan dari hafalan model.',
  },
];

const TRUST = [
  {
    title: 'AHSP resmi 2026',
    desc: 'Library analisa harga satuan mengacu regulasi resmi 2026 — Cipta Karya, SDA, dan Bina Marga.',
  },
  {
    title: 'Harga tidak pernah dikarang',
    desc: 'Setiap angka punya sumber jelas: resmi, pasar, atau asumsi berlabel. Yang belum ada datanya tetap kosong dan berlabel — tidak diisi angka palsu.',
  },
  {
    title: 'Tutorial untuk semua',
    desc: '10 tutorial interaktif + tur terpandu. Estimator baru bisa langsung produktif.',
  },
];

const FAQS = [
  {
    q: 'Apakah perlu install aplikasi?',
    a: 'Tidak. EZRAB berjalan di browser — buka dari laptop maupun HP, langsung pakai.',
  },
  {
    q: 'Dari mana harga satuannya?',
    a: 'Dari koefisien AHSP 2026 resmi dikali database harga material, upah, dan alat milik Anda sendiri. AI hanya menyusun draft — angka final selalu hasil perhitungan sistem.',
  },
  {
    q: 'Apakah cocok untuk yang baru belajar RAB?',
    a: 'Ya. Ada 10 tutorial interaktif, tur terpandu, dan template RAB siap pakai. Alurnya mengikuti cara kerja estimator.',
  },
  {
    q: 'Bisa export ke Excel?',
    a: 'Bisa — laporan RAB, BOQ, dan rekapitulasi dapat diexport ke Excel dan PDF.',
  },
  {
    q: 'Bagaimana dengan data proyek saya?',
    a: 'Setiap proyek tersimpan terpisah di workspace Anda. Fitur AI hanya memakai ringkasan yang diperlukan untuk menjawab.',
  },
];

const FaqItem: React.FC<{ q: string; a: string }> = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`fp-faq-item ${open ? 'is-open' : ''}`}>
      <button type="button" className="fp-faq-q" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{q}</span>
        <ChevronDown size={18} className="fp-faq-chevron" />
      </button>
      {open && <p className="fp-faq-a">{a}</p>}
    </div>
  );
};

export const FeaturesPage: React.FC<FeaturesPageProps> = ({
  onBackToLanding,
  onOpenWorkspace,
  onOpenPricing,
}) => {
  return (
    <div className="fp-page">
      {/* Nav */}
      <header className="fp-nav">
        <button type="button" className="fp-nav-back" onClick={onBackToLanding} aria-label="Kembali ke beranda">
          <ArrowLeft size={18} />
          <span className="fp-nav-logo-text">EZRAB</span>
        </button>
        <button type="button" className="fp-nav-cta" onClick={onOpenWorkspace}>
          Mulai Gratis <ArrowRight size={14} />
        </button>
      </header>

      {/* 1. Hero */}
      <section className="fp-hero">
        <div className="fp-hero-bg" aria-hidden="true" />
        <div className="fp-container">
          <div className="fp-eyebrow">
            <Sparkles size={13} /> PANDUAN LENGKAP
          </div>
          <h1 className="fp-h1">
            Semua yang bisa EZRAB lakukan,
            <br />
            <span className="fp-accent">dalam satu halaman.</span>
          </h1>
          <p className="fp-lead">
            Dari mengukur gambar kerja sampai laporan siap tender — ini seluruh
            fitur EZRAB dan cara semuanya saling terhubung.
          </p>
          <div className="fp-cta-row">
            <button type="button" className="fp-btn-primary" onClick={onOpenWorkspace}>
              Mulai dengan EZRAB <ArrowRight size={16} />
            </button>
            <button type="button" className="fp-btn-ghost" onClick={onOpenPricing}>
              Lihat Harga
            </button>
          </div>
          <div className="fp-stats">
            {STATS.map((s) => (
              <div key={s.label} className="fp-stat">
                <div className="fp-stat-value">{s.value}</div>
                <div className="fp-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Pain points */}
      <section className="fp-section">
        <div className="fp-container">
          <h2 className="fp-h2">Yang membuat RAB meleset bukan niatnya.<br />Tapi caranya yang terputus.</h2>
          <div className="fp-grid-3">
            {PAINS.map((p) => (
              <div key={p.no} className="fp-card">
                <div className="fp-card-no">{p.no}</div>
                <h3 className="fp-card-title">{p.title}</h3>
                <p className="fp-card-desc">{p.desc}</p>
              </div>
            ))}
          </div>
          <p className="fp-bridge">
            EZRAB menyambung rantainya: <strong>dimensi → volume → AHSP → RAB → Kurva S → laporan.</strong> Satu
            angka diubah di hulu, semuanya di hilir ikut menyesuaikan.
          </p>
        </div>
      </section>

      {/* 3. Differentiators */}
      <section className="fp-section fp-section-alt">
        <div className="fp-container">
          <div className="fp-eyebrow">KEUNGGULAN</div>
          <h2 className="fp-h2">Tiga hal yang tidak Anda dapat di tempat lain</h2>
          <div className="fp-stack">
            {DIFFERENTIATORS.map((d) => (
              <div key={d.no} className="fp-diff">
                <div className="fp-diff-no">{d.no}</div>
                <div>
                  <h3 className="fp-card-title">{d.title}</h3>
                  <p className="fp-card-desc">{d.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. How it works */}
      <section className="fp-section">
        <div className="fp-container">
          <div className="fp-eyebrow">CARA KERJA</div>
          <h2 className="fp-h2">Tiga langkah, dari gambar kerja ke laporan</h2>
          <div className="fp-grid-3">
            {STEPS.map((s) => (
              <div key={s.no} className="fp-card">
                <div className="fp-step-no">{s.no}</div>
                <h3 className="fp-card-title">{s.title}</h3>
                <p className="fp-card-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Modules */}
      <section className="fp-section fp-section-alt">
        <div className="fp-container">
          <div className="fp-eyebrow">FITUR INTI</div>
          <h2 className="fp-h2">Modul yang dipakai tiap hari</h2>
          <p className="fp-sub">Semua saling terhubung — hasil satu modul jadi masukan modul berikutnya.</p>
          <div className="fp-grid-4">
            {MODULES.map((m, i) => (
              <div key={m.title} className="fp-module">
                <div className="fp-module-icon"><m.icon size={20} /></div>
                <div className="fp-module-no">{String(i + 1).padStart(2, '0')}</div>
                <h3 className="fp-module-title">{m.title}</h3>
                <p className="fp-module-desc">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. AI layer */}
      <section className="fp-section">
        <div className="fp-container">
          <div className="fp-eyebrow">LAPISAN AI · OPSIONAL</div>
          <h2 className="fp-h2">Sudah cepat. Mau lebih cepat lagi?</h2>
          <p className="fp-sub">
            Setiap keluaran AI melewati database AHSP resmi dan harga Anda sebelum jadi angka.
            AI tidak pernah mengarang harga — dan setiap draft bisa Anda periksa serta ubah sebelum masuk RAB.
          </p>
          <div className="fp-grid-3">
            {AI_FEATURES.map((f) => (
              <div key={f.no} className="fp-card">
                <div className="fp-step-no">{f.no}</div>
                <h3 className="fp-card-title">{f.title}</h3>
                <p className="fp-card-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Trust */}
      <section className="fp-section fp-section-alt">
        <div className="fp-container">
          <div className="fp-eyebrow">DASAR KEPERCAYAAN</div>
          <h2 className="fp-h2">Yang bisa Anda periksa sendiri</h2>
          <div className="fp-grid-3">
            {TRUST.map((t) => (
              <div key={t.title} className="fp-card">
                <div className="fp-trust-icon"><ShieldCheck size={20} /></div>
                <h3 className="fp-card-title">{t.title}</h3>
                <p className="fp-card-desc">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Pricing teaser */}
      <section className="fp-section">
        <div className="fp-container fp-pricing-teaser">
          <div>
            <h2 className="fp-h2">Mulai gratis. Naik kelas saat siap.</h2>
            <p className="fp-sub">Free untuk mencoba · Starter Rp 59.999/bln · Pro Rp 79.999/bln</p>
          </div>
          <button type="button" className="fp-btn-primary" onClick={onOpenPricing}>
            Lihat Semua Harga <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* 9. FAQ */}
      <section className="fp-section fp-section-alt">
        <div className="fp-container fp-faq-wrap">
          <h2 className="fp-h2">Pertanyaan sebelum mulai</h2>
          <div className="fp-faq-list">
            {FAQS.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* 10. Final CTA */}
      <section className="fp-final">
        <div className="fp-container">
          <Zap size={28} className="fp-final-icon" />
          <h2 className="fp-h2">Mulai dari proyek yang sedang Anda hitung sekarang.</h2>
          <p className="fp-sub">Gratis untuk memulai · Tanpa kartu kredit</p>
          <button type="button" className="fp-btn-primary fp-btn-lg" onClick={onOpenWorkspace}>
            Mulai dengan EZRAB <ArrowRight size={16} />
          </button>
          <div className="fp-checks">
            {['24 kalkulator QTO', 'AHSP 2026 resmi', 'Export Excel & PDF'].map((c) => (
              <span key={c} className="fp-check"><Check size={14} /> {c}</span>
            ))}
          </div>
        </div>
      </section>

      <ExactFooter onOpenAbout={onBackToLanding} />
    </div>
  );
};
