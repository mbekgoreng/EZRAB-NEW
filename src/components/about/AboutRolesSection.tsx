import React from 'react';
import { motion } from 'framer-motion';
import { Ruler, Calculator, HardHat, Compass, Users2, ArrowUpRight } from 'lucide-react';

interface RoleItem {
  id: string;
  title: string;
  subtitle: string;
  desc: string;
  icon: React.ReactNode;
}

const ROLES: RoleItem[] = [
  {
    id: 'qs',
    title: 'Quantity Surveyor',
    subtitle: 'Presisi Volume & BoQ',
    desc: 'Ekstraksi kuantitas pekerjaan dari denah gambar kerja dan penyusunan BoQ terstruktur tanpa rumus manual berulang.',
    icon: <Ruler size={20} />,
  },
  {
    id: 'estimator',
    title: 'Estimator',
    subtitle: 'Analisa AHSP Cepat',
    desc: 'Penyesuaian koefisien bahan, upah tenaga kerja lokal, dan simulasi harga penawaran proyek secara instan.',
    icon: <Calculator size={20} />,
  },
  {
    id: 'kontraktor',
    title: 'Kontraktor',
    subtitle: 'Pengendalian Biaya',
    desc: 'Pengawasan anggaran pelaksanaan, pengendalian cash flow mingguan, serta monitoring kurva S real-time.',
    icon: <HardHat size={20} />,
  },
  {
    id: 'konsultan',
    title: 'Konsultan Perencana',
    subtitle: 'Owner Estimate (OE)',
    desc: 'Penyusunan dokumen Engineer Estimate dan HPS yang transparan, akuntabel, serta siap diaudit oleh pemberi tugas.',
    icon: <Compass size={20} />,
  },
  {
    id: 'team',
    title: 'Project Team',
    subtitle: 'Kolaborasi Terpadu',
    desc: 'Sinkronisasi menyeluruh antara divisi engineering lapangan, pengadaan material, dan bagian keuangan proyek.',
    icon: <Users2 size={20} />,
  },
];

export const AboutRolesSection: React.FC = () => {
  return (
    <section className="ez-about-roles-section" id="roles">
      <div className="ez-about-roles-container">
        {/* Section Header */}
        <motion.div
          className="ez-about-roles-header"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="ez-about-section-tag-light">
            <Compass size={13} />
            <span>DIRANCANG UNTUK PROFESIONAL</span>
          </div>

          <h2 className="ez-about-roles-headline">
            Dibangun untuk mereka yang bekerja<br />
            di balik angka-angka konstruksi.
          </h2>
        </motion.div>

        {/* 5-Column Grid */}
        <div className="ez-about-roles-grid">
          {ROLES.map((role, idx) => (
            <motion.div
              key={role.id}
              className="ez-about-role-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.08 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="ez-about-role-icon-box">
                  {role.icon}
                </div>
                <ArrowUpRight size={18} color="#94A3B8" />
              </div>

              <div>
                <div className="ez-about-role-title">{role.title}</div>
                <div style={{ fontSize: '11.5px', color: '#2563EB', fontWeight: 650, marginTop: '2px' }}>
                  {role.subtitle}
                </div>
              </div>

              <div className="ez-about-role-desc">
                {role.desc}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
