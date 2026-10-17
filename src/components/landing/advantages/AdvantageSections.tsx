import React, { useState } from 'react';
import { ArrowRight, Check, ShieldAlert } from 'lucide-react';
import {
  WORKFLOW_STEPS,
  PRICE_CATEGORIES,
  ECOSYSTEM_STAGES,
  ROLES,
  TRANSPARENCY_PRINCIPLES,
  PROBLEMS,
} from './advantagesContent';

/* ------------------------------------------------------------------ S02 */
export const ProblemSection: React.FC = () => (
  <div className="adv-problem-grid">
    <div className="adv-problem-narrative adv-reveal">
      <p className="adv-body">
        Estimasi konstruksi jarang gagal karena salah hitung. Ia gagal karena <strong>hubungannya putus</strong>:
        antara gambar dan volume, antara volume dan harga, antara harga dan sumbernya.
      </p>
      <p className="adv-body adv-muted">
        Lima pola ini berulang di hampir setiap proyek. EZRAB dirancang untuk menjaga agar kelimanya tetap
        terhubung — bukan dengan janji otomatisasi penuh, melainkan dengan alur yang tercatat.
      </p>
    </div>
    <ol className="adv-problem-list">
      {PROBLEMS.map((p, i) => (
        <li key={p.title} className="adv-problem-item adv-reveal" style={{ ['--adv-d' as any]: `${i * 0.06}s` }}>
          <span className="adv-problem-no">{String(i + 1).padStart(2, '0')}</span>
          <div>
            <h3 className="adv-h3">{p.title}</h3>
            <p className="adv-body-sm adv-muted">{p.desc}</p>
          </div>
        </li>
      ))}
    </ol>
  </div>
);

/* ------------------------------------------------------------------ S03 */
export const WorkflowSection: React.FC<{ onOpenWorkspace: () => void }> = ({ onOpenWorkspace }) => (
  <div>
    <div className="adv-flow adv-reveal">
      {WORKFLOW_STEPS.map((s, i) => (
        <React.Fragment key={s.no}>
          <div className="adv-flow-step">
            <span className="adv-flow-no">{s.no}</span>
            <span className="adv-flow-tag">{s.tag}</span>
            <h3 className="adv-h3">{s.title}</h3>
            <p className="adv-body-sm adv-muted">{s.desc}</p>
          </div>
          {i < WORKFLOW_STEPS.length - 1 && <span className="adv-flow-arrow" aria-hidden="true" />}
        </React.Fragment>
      ))}
    </div>
    <div className="adv-callout adv-reveal">
      <p className="adv-body-sm">
        <strong>Catatan jujur:</strong> AI membantu membaca dan mengusulkan — ia tidak menentukan harga resmi dan
        tidak menggantikan peninjauan Anda. Perhitungan volume dan rekapitulasi ditangani engine deterministik
        sesuai implementasi yang tersedia.
      </p>
      <button type="button" className="adv-btn-primary adv-btn-sm" onClick={onOpenWorkspace}>
        Coba Alurnya <ArrowRight size={14} />
      </button>
    </div>
  </div>
);

/* ------------------------------------------------------------------ S04 */
export const PriceIntegritySection: React.FC = () => (
  <div>
    <div className="adv-price-table adv-reveal" role="table" aria-label="Kategori sumber harga">
      {PRICE_CATEGORIES.map((c) => (
        <div key={c.name} className="adv-price-row" role="row">
          <span className="adv-price-chip" style={{ color: c.color, background: c.bg, borderColor: c.border }}>
            {c.name}
          </span>
          <p className="adv-body-sm adv-price-desc">{c.desc}</p>
          <code className="adv-price-ex">{c.example}</code>
        </div>
      ))}
    </div>
    <div className="adv-rules adv-reveal">
      <div className="adv-rule">
        <ShieldAlert size={18} />
        <p className="adv-body-sm">
          <strong>Harga yang belum tersedia tidak diperlakukan sebagai nol.</strong> Ia tampil sebagai
          &ldquo;belum diisi&rdquo; dan wajib dilengkapi — total tidak pernah diam-diam mengecil.
        </p>
      </div>
      <div className="adv-rule">
        <ShieldAlert size={18} />
        <p className="adv-body-sm">
          <strong>Satuan yang tidak kompatibel tidak dikalikan diam-diam.</strong> Sistem menandainya untuk
          diperiksa, bukan menghasilkan angka yang terlihat benar padahal salah.
        </p>
      </div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ S05 */
const AI_LANES = [
  {
    title: 'AI membantu',
    desc: 'Menganalisis dokumen, mengusulkan item pekerjaan, menyusun draf perhitungan.',
    items: ['Analisis gambar & dokumen', 'Usulan item pekerjaan', 'Draf volume awal'],
    tone: 'blue' as const,
  },
  {
    title: 'Engine menghitung',
    desc: 'Kalkulasi deterministik dari data yang sudah tervalidasi — sama setiap kali dijalankan.',
    items: ['Volume dari dimensi', 'Koefisien AHSP', 'Rekapitulasi RAB'],
    tone: 'navy' as const,
  },
  {
    title: 'Anda memutuskan',
    desc: 'Meninjau draf, mengoreksi asumsi, menyetujui angka final sebelum dokumen diterbitkan.',
    items: ['Review & koreksi', 'Persetujuan angka', 'Penerbitan dokumen'],
    tone: 'sky' as const,
  },
];

export const AiOversightSection: React.FC = () => (
  <div className="adv-lanes adv-reveal">
    {AI_LANES.map((lane) => (
      <div key={lane.title} className={`adv-lane adv-lane-${lane.tone}`}>
        <h3 className="adv-h3">{lane.title}</h3>
        <p className="adv-body-sm adv-muted">{lane.desc}</p>
        <ul className="adv-check-list">
          {lane.items.map((it) => (
            <li key={it}>
              <Check size={13} /> {it}
            </li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

/* ------------------------------------------------------------------ S06 */
export const EcosystemSection: React.FC = () => (
  <div className="adv-stages">
    {ECOSYSTEM_STAGES.map((st, i) => (
      <div key={st.stage} className="adv-stage adv-reveal" style={{ ['--adv-d' as any]: `${i * 0.07}s` }}>
        <div className="adv-stage-head">
          <span className="adv-stage-no">{String(i + 1).padStart(2, '0')}</span>
          <div>
            <h3 className="adv-h3">{st.stage}</h3>
            <p className="adv-body-sm adv-muted">{st.desc}</p>
          </div>
        </div>
        <div className="adv-module-chips">
          {st.modules.map((m) => (
            <span key={m} className="adv-module-chip">
              {m}
            </span>
          ))}
        </div>
      </div>
    ))}
  </div>
);

/* ------------------------------------------------------------------ S07 */
export const RolesSection: React.FC = () => {
  const [active, setActive] = useState(ROLES[0].id);
  const role = ROLES.find((r) => r.id === active) ?? ROLES[0];
  return (
    <div className="adv-reveal">
      <div className="adv-tabs" role="tablist" aria-label="Peran pengguna">
        {ROLES.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={active === r.id}
            className={`adv-tab ${active === r.id ? 'is-active' : ''}`}
            onClick={() => setActive(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="adv-role-panel" role="tabpanel">
        <p className="adv-body adv-role-scenario">{role.scenario}</p>
        <ul className="adv-check-list adv-role-points">
          {role.points.map((pt) => (
            <li key={pt}>
              <Check size={14} /> {pt}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ S08 */
export const TransparencySection: React.FC = () => (
  <div>
    <ul className="adv-principles">
      {TRANSPARENCY_PRINCIPLES.map((p, i) => (
        <li key={p.title} className="adv-principle adv-reveal" style={{ ['--adv-d' as any]: `${i * 0.05}s` }}>
          <span className="adv-principle-no">{String(i + 1).padStart(2, '0')}</span>
          <div>
            <h3 className="adv-h3">{p.title}</h3>
            <p className="adv-body-sm adv-muted">{p.desc}</p>
          </div>
        </li>
      ))}
    </ul>
    <p className="adv-fineprint adv-reveal">
      Prinsip ini adalah komitmen desain produk — bukan sertifikasi, jaminan hukum, atau klaim kepatuhan
      eksternal.
    </p>
  </div>
);

/* ------------------------------------------------------------------ S09 */
export const FinalCtaSection: React.FC<{
  onOpenFeatures: () => void;
  onOpenWorkspace: () => void;
}> = ({ onOpenFeatures, onOpenWorkspace }) => (
  <div className="adv-final adv-reveal">
    <p className="adv-eyebrow adv-eyebrow-center">Mulai dengan benar</p>
    <h2 className="adv-h2 adv-h2-center">Mulai dari Data yang Jelas. Bangun Estimasi dengan Lebih Terstruktur.</h2>
    <p className="adv-lead adv-lead-center">
      Kenali cara kerja EZRAB dan temukan alat yang sesuai dengan kebutuhan proyek Anda.
    </p>
    <div className="adv-hero-ctas adv-ctas-center">
      <button type="button" className="adv-btn-primary" onClick={onOpenFeatures}>
        Jelajahi Fitur <ArrowRight size={15} />
      </button>
      <button type="button" className="adv-btn-ghost" onClick={onOpenWorkspace}>
        Mulai Menggunakan EZRAB <ArrowRight size={15} />
      </button>
    </div>
  </div>
);
