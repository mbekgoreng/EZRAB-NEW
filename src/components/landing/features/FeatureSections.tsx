import React, { useState } from 'react';
import { ChevronDown, Check, ShieldCheck, ArrowRight, Layers, Award, Tag } from 'lucide-react';
import {
  PROBLEMS,
  AI_ROLES,
  AUDIENCES,
  START_STEPS,
  TRANSPARENCY,
  FAQS,
} from './featuresContent';

/* ---------- B — Mengapa EZRAB: pernyataan editorial ---------- */
export const WhySection: React.FC = () => (
  <div className="fp-problems">
    {PROBLEMS.map((p, i) => (
      <article key={p.title} className="fp-problem">
        <span className="fp-problem-no" aria-hidden="true">
          {String(i + 1).padStart(2, '0')}
        </span>
        <h3 className="fp-problem-title">{p.title}</h3>
        <div className="fp-problem-body">
          <p className="fp-problem-desc">{p.desc}</p>
          <p className="fp-problem-how">
            <Check size={14} aria-hidden="true" /> {p.how}
          </p>
        </div>
      </article>
    ))}
  </div>
);

/* ---------- F — AHSP 2026 & integritas harga ---------- */
export const AhspSection: React.FC = () => (
  <div className="ahsp-wrap">
    <div className="ahsp-chain" aria-label="Rantai analisis harga satuan">
      {['Pekerjaan', 'Koefisien', 'Material · Upah · Alat', 'Harga Satuan'].map((s, i, arr) => (
        <React.Fragment key={s}>
          <div className="ahsp-node">
            <span className="ahsp-node-num">{i + 1}</span>
            <span>{s}</span>
          </div>
          {i < arr.length - 1 && <span className="ahsp-link" aria-hidden="true">→</span>}
        </React.Fragment>
      ))}
    </div>
    <div className="fp-grid-3">
      <div className="fp-card">
        <h3 className="fp-card-title">Acuan resmi</h3>
        <p className="fp-card-desc">
          Library AHSP 2026 — 5.792 item analisa harga satuan (Cipta Karya, SDA, Bina Marga) —
          terintegrasi langsung dengan penyusunan RAB Anda.
        </p>
      </div>
      <div className="fp-card">
        <h3 className="fp-card-title">Sumber harga berlapis</h3>
        <p className="fp-card-desc">
          Setiap harga berlabel jelas: resmi, pasar, asumsi, atau input manual Anda. Yang belum ada
          datanya tetap kosong dan berlabel — tidak diisi angka karangan.
        </p>
      </div>
      <div className="fp-card">
        <h3 className="fp-card-title">Bisa ditelusur</h3>
        <p className="fp-card-desc">
          Klik angka mana pun untuk melihat dasarnya: koefisien apa, harga dari mana, satuan apa.
          Tidak ada angka misterius di RAB Anda.
        </p>
      </div>
    </div>
  </div>
);

/* ---------- G — Peran AI: panel editorial ---------- */
export const AiRolesSection: React.FC = () => (
  <div className="fp-roles">
    {AI_ROLES.map((r, i) => (
      <article key={r.name} className="fp-role">
        <span className="fp-role-ghost" aria-hidden="true">
          {['I', 'II', 'III'][i]}
        </span>
        <div>
          <span className="fp-role-when">{r.when}</span>
          <h3 className="fp-role-name">{r.name}</h3>
          <p className="fp-role-desc">{r.desc}</p>
          <p className="fp-role-cta">{r.cta}</p>
        </div>
      </article>
    ))}
  </div>
);

/* ---------- H — Dokumen AI ---------- */
export const DocAiSection: React.FC = () => (
  <div>
    <div className="ded-chain" aria-label="Alur Dokumen AI">
      {['Dokumen sumber', 'Pemrosesan AI', 'Hasil tinjauan', 'Dokumen keluaran'].map((s, i, arr) => (
        <React.Fragment key={s}>
          <div className="ded-node">
            <div className="ded-node-label">{s}</div>
            <div className="ded-node-sub">{['unggah / pilih', 'analisis & ekstraksi', 'periksa & koreksi', 'simpan / export'][i]}</div>
          </div>
          {i < arr.length - 1 && <ArrowRight size={18} className="ded-arrow" aria-hidden="true" />}
        </React.Fragment>
      ))}
    </div>
    <div className="fp-grid-3" style={{ marginTop: '28px' }}>
      <div className="fp-card">
        <h3 className="fp-card-title">Analisis dokumen</h3>
        <p className="fp-card-desc">Dokumen proyek dibaca dan dianalisis AI menjadi insight yang bisa ditindaklanjuti.</p>
      </div>
      <div className="fp-card">
        <h3 className="fp-card-title">Penyusunan berbantuan</h3>
        <p className="fp-card-desc">Susun dokumen dengan bantuan AI, dengan riwayat proses yang bisa ditinjau ulang.</p>
      </div>
      <div className="fp-card">
        <h3 className="fp-card-title">Anda memegang kendali</h3>
        <p className="fp-card-desc">Setiap hasil bisa diperiksa dan dikoreksi sebelum disimpan atau diexport.</p>
      </div>
    </div>
  </div>
);

/* ---------- I — Manajemen proyek & laporan ---------- */
export const ProjectSection: React.FC = () => (
  <div className="fp-grid-3">
    {[
      { t: 'Status proyek jelas', d: 'Kelola proyek dengan status: Draft, Sedang Dikerjakan, Selesai, Arsip — semua dalam satu dashboard.' },
      { t: 'Kurva S', d: 'Pantau progres fisik tertimbang bobot nilai: rencana vs aktual dalam satu grafik.' },
      { t: 'Keuangan proyek', d: 'Catat pemasukan dan pengeluaran dengan saldo berjalan per proyek.' },
      { t: 'Rekapitulasi anggaran', d: 'Lihat ringkasan biaya per divisi pekerjaan sebelum finalisasi.' },
      { t: 'Laporan siap export', d: 'Export RAB, BOQ, dan rekapitulasi ke Excel dan PDF.' },
      { t: 'Catatan proyek', d: 'Simpan catatan dan konteks penting langsung di tiap proyek.' },
    ].map((f) => (
      <div key={f.t} className="fp-card">
        <h3 className="fp-card-title">{f.t}</h3>
        <p className="fp-card-desc">{f.d}</p>
      </div>
    ))}
  </div>
);

/* ---------- J — Audiens ---------- */
export const AudienceSection: React.FC = () => (
  <div className="fp-grid-3">
    {AUDIENCES.map((a) => (
      <div key={a.role} className="fp-card">
        <h3 className="fp-card-title">{a.role}</h3>
        <p className="fp-card-desc">{a.need}</p>
        <div className="fp-tags">
          {a.modules.map((m) => (
            <span key={m} className="fp-tag">{m}</span>
          ))}
        </div>
      </div>
    ))}
  </div>
);

/* ---------- K — Cara mulai ---------- */
export const StartSection: React.FC<{ onOpenWorkspace: () => void }> = ({ onOpenWorkspace }) => (
  <div>
    <ol className="start-steps">
      {START_STEPS.map((s) => (
        <li key={s.no} className="start-step">
          <span className="start-step-no">{s.no}</span>
          <div>
            <strong>{s.title}</strong>
            <p>{s.desc}</p>
          </div>
        </li>
      ))}
    </ol>
    <div className="fp-cta-row" style={{ marginTop: '36px', marginBottom: 0 }}>
      <button type="button" className="fp-btn-primary" onClick={onOpenWorkspace}>
        Mulai Menggunakan EZRAB <ArrowRight size={16} />
      </button>
    </div>
  </div>
);

/* ---------- L — Transparansi ---------- */
export const TransparencySection: React.FC = () => (
  <div className="fp-grid-3">
    {TRANSPARENCY.map((t) => (
      <div key={t.title} className="fp-card">
        <div className="fp-trust-icon"><ShieldCheck size={20} /></div>
        <h3 className="fp-card-title">{t.title}</h3>
        <p className="fp-card-desc">{t.desc}</p>
      </div>
    ))}
  </div>
);

/* ---------- M — FAQ ---------- */
const FaqItem: React.FC<{ q: string; a: string; id: string }> = ({ q, a, id }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`fp-faq-item ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="fp-faq-q"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
      >
        <span>{q}</span>
        <ChevronDown size={18} className="fp-faq-chevron" aria-hidden="true" />
      </button>
      {open && (
        <p className="fp-faq-a" id={id}>
          {a}
        </p>
      )}
    </div>
  );
};

export const FaqSection: React.FC = () => (
  <div className="fp-faq-list">
    {FAQS.map((f, i) => (
      <FaqItem key={f.q} q={f.q} a={f.a} id={`faq-a-${i}`} />
    ))}
  </div>
);

/* ---------- Wayfinding: tiga jalur + CTA mulai (hub "Kenali EZRAB") ---------- */
export const WayfindingSection: React.FC<{
  onExploreFeatures: () => void;
  onOpenAdvantages: () => void;
  onOpenPricing: () => void;
  onOpenWorkspace: () => void;
}> = ({ onExploreFeatures, onOpenAdvantages, onOpenPricing, onOpenWorkspace }) => {
  const paths = [
    {
      icon: Layers,
      title: 'Pelajari Fitur',
      desc: 'Tiga belas modul dalam satu alur kerja — dari DED hingga laporan.',
      action: onExploreFeatures,
      cta: 'Lihat ekosistem',
    },
    {
      icon: Award,
      title: 'Pahami Keunggulan',
      desc: 'Mengapa memilih EZRAB: integritas harga, AI yang bisa ditinjau.',
      action: onOpenAdvantages,
      cta: 'Buka halaman Keunggulan',
    },
    {
      icon: Tag,
      title: 'Lihat Harga',
      desc: 'Free untuk mencoba · Starter Rp 59.999/bln · Pro Rp 79.999/bln.',
      action: onOpenPricing,
      cta: 'Bandingkan paket',
    },
  ];
  return (
    <div>
      <div className="fp-grid-3">
        {paths.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.title}
              type="button"
              onClick={p.action}
              className="fp-card fp-wayfind-card"
              aria-label={`${p.title}: ${p.cta}`}
            >
              <span className="fp-wayfind-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <h3 className="fp-card-title">{p.title}</h3>
              <p className="fp-card-desc">{p.desc}</p>
              <span className="fp-wayfind-link">
                {p.cta} <ArrowRight size={14} aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
      <div className="fp-wayfind-cta">
        <button type="button" className="fp-btn-primary fp-btn-lg" onClick={onOpenWorkspace}>
          Mulai Menggunakan EZRAB <ArrowRight size={16} />
        </button>
        <p className="fp-wayfind-note">Tanpa kartu kredit · Mode demo langsung bisa dicoba</p>
      </div>
    </div>
  );
};
