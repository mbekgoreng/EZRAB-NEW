import React from 'react';
import { FileImage, Boxes, ClipboardList, Table2, ArrowRight } from 'lucide-react';
import { DED_STEPS } from './featuresContent';

/**
 * Visualisasi alur DED → RAB: dokumen → komponen → item → tabel RAB.
 * Murni ilustratif (CSS/SVG) — tidak terhubung ke engine produksi.
 */
export const DedFlowVisual: React.FC = () => {
  return (
    <div className="ded-visual" aria-label="Ilustrasi alur DED menjadi RAB">
      <div className="ded-chain">
        <div className="ded-node">
          <div className="ded-node-icon"><FileImage size={26} /></div>
          <div className="ded-node-label">Dokumen Desain</div>
          <div className="ded-node-sub">gambar kerja / deskripsi</div>
        </div>
        <ArrowRight size={18} className="ded-arrow" aria-hidden="true" />
        <div className="ded-node">
          <div className="ded-node-icon"><Boxes size={26} /></div>
          <div className="ded-node-label">Komponen Bangunan</div>
          <div className="ded-node-sub">AI membaca & memetakan</div>
        </div>
        <ArrowRight size={18} className="ded-arrow" aria-hidden="true" />
        <div className="ded-node">
          <div className="ded-node-icon"><ClipboardList size={26} /></div>
          <div className="ded-node-label">Daftar Pekerjaan</div>
          <div className="ded-node-sub">draft + volume perkiraan</div>
        </div>
        <ArrowRight size={18} className="ded-arrow" aria-hidden="true" />
        <div className="ded-node ded-node-final">
          <div className="ded-node-icon"><Table2 size={26} /></div>
          <div className="ded-node-label">Tabel RAB</div>
          <div className="ded-node-sub">setelah Anda setujui</div>
        </div>
      </div>

      <ol className="ded-steps">
        {DED_STEPS.map((s) => (
          <li key={s.no} className="ded-step">
            <span className="ded-step-no">{s.no}</span>
            <div>
              <strong>{s.title}</strong>
              <p>{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="ded-note">
        <strong>Prinsipnya:</strong> AI mengusulkan, Anda memutuskan. Harga tidak pernah datang dari AI —
        angka final selalu dihitung dari koefisien AHSP × database harga Anda.
      </p>
    </div>
  );
};
