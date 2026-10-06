import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Maximize2,
  Table,
  Database,
  Calculator,
  FileSpreadsheet,
  PieChart,
  TrendingUp,
  FileCheck2,
  Workflow,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';

interface WorkflowStep {
  id: string;
  name: string;
  sub: string;
  icon: React.ReactNode;
  detailTitle: string;
  detailDesc: string;
  telemetry: string;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: '1',
    name: 'GAMBAR KERJA',
    sub: 'CAD / BIM / PDF',
    icon: <FileText size={18} />,
    detailTitle: 'Spesifikasi Gambar Kerja Terbaca',
    detailDesc: 'Ekstraksi denah lantai, elevasi fondasi, dimensi balok, dan potongan arsitektur langsung dari file teknis.',
    telemetry: 'INPUT DWG / PDF DETECTED',
  },
  {
    id: '2',
    name: 'VOLUME',
    sub: 'Ekstraksi Dimensi',
    icon: <Maximize2 size={18} />,
    detailTitle: 'Kalkulasi Dimensi Geometris',
    detailDesc: 'Perhitungan panjang linier dinding, luas pasangan bata, kubikasi pembetonan kolom, dan tonase tulangan besi.',
    telemetry: 'FORMULA ENGINE: 28 ITEM AKTIF',
  },
  {
    id: '3',
    name: 'QTO',
    sub: 'Takeoff Terstruktur',
    icon: <Table size={18} />,
    detailTitle: 'Quantity Takeoff Terintegrasi',
    detailDesc: 'Tabel daftar kuantitas sistematis yang dikelompokkan berdasarkan zona lantai dan jenis pekerjaan konstruksi.',
    telemetry: 'AUDIT LOG: ZERO ORPHAN ITEMS',
  },
  {
    id: '4',
    name: 'AHSP',
    sub: 'Analisa Satuan',
    icon: <Database size={18} />,
    detailTitle: 'Analisa Harga Satuan Pekerjaan Standar',
    detailDesc: 'Penerapan koefisien resmi PUPR (Cipta Karya, Bina Marga, SDA) mencakup tenaga kerja, bahan, dan sewa alat.',
    telemetry: 'PUPR STANDARDS LOADED: 100%',
  },
  {
    id: '5',
    name: 'RAB',
    sub: 'Kalkulasi Total',
    icon: <Calculator size={18} />,
    detailTitle: 'Rencana Anggaran Biaya Real-Time',
    detailDesc: 'Pengalian otomatis volume QTO dengan harga satuan AHSP, simulasi overhead profit, dan pembulatan pajak PPN 11%.',
    telemetry: 'CALC ENGINE: DETERMINISTIC PRECISION',
  },
  {
    id: '6',
    name: 'BOQ',
    sub: 'Bill of Quantities',
    icon: <FileSpreadsheet size={18} />,
    detailTitle: 'Bill of Quantities Dokumen Tender',
    detailDesc: 'Format baku penawaran tender lelang dengan susunan kode WBS (Work Breakdown Structure) yang terstandarisasi.',
    telemetry: 'WBS COMPLIANT HIERARCHY',
  },
  {
    id: '7',
    name: 'REKAPITULASI',
    sub: 'Ringkasan Biaya',
    icon: <PieChart size={18} />,
    detailTitle: 'Rekapitulasi Total Proyek',
    detailDesc: 'Ringkasan per divisi (Pekerjaan Persiapan, Struktur, Arsitektur, MEP) untuk keputusan manajemen eksekutif.',
    telemetry: 'EXECUTIVE SUMMARY READY',
  },
  {
    id: '8',
    name: 'KURVA S',
    sub: 'Jadwal & Progres',
    icon: <TrendingUp size={18} />,
    detailTitle: 'Jadwal Pelaksanaan & Bobot Mingguan',
    detailDesc: 'Distribusi bobot persentase biaya ke dalam timeline kalender proyek membentuk Kurva S dinamis.',
    telemetry: 'S-CURVE CUMULATIVE: 100.00%',
  },
  {
    id: '9',
    name: 'LAPORAN',
    sub: 'Audit Excel / PDF',
    icon: <FileCheck2 size={18} />,
    detailTitle: 'Dokumentasi & Ekspor Laporan',
    detailDesc: 'Hasil akhir siap diekspor ke format multi-sheet Excel (.xlsx) dengan rumus formula hidup atau format PDF resmi bertanda tangan.',
    telemetry: 'EXCEL & PDF ENGINE STANDBY',
  },
];

export const AboutWorkflowSection: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);

  // Auto-cycle through the 9 steps every 3.5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % WORKFLOW_STEPS.length);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  const current = WORKFLOW_STEPS[activeStep];

  return (
    <section className="ez-about-workflow-section" id="workflow">
      <div className="ez-about-workflow-container">
        {/* Header */}
        <motion.div
          className="ez-about-workflow-header"
          initial={{ opacity: 0, y: 25 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="ez-about-section-tag-light">
            <Workflow size={13} />
            <span>ONE CONNECTED WORKFLOW</span>
          </div>

          <h2 className="ez-about-workflow-headline">
            Satu Data.<br />
            Banyak Kemungkinan.
          </h2>

          <p className="ez-about-workflow-subhead">
            Ketika data proyek saling terhubung, perubahan tidak harus berarti pekerjaan yang berulang. Satu penyesuaian dimensi langsung memperbarui seluruh dokumen turunan.
          </p>
        </motion.div>

        {/* 9-Node Connected Flow */}
        <div className="ez-about-workflow-pipeline">
          {WORKFLOW_STEPS.map((step, idx) => {
            const isActive = activeStep === idx;
            return (
              <motion.div
                key={step.id}
                className={`ez-about-pipeline-node ${isActive ? 'active' : ''}`}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                onClick={() => setActiveStep(idx)}
              >
                <span className="ez-about-pipeline-index">0{idx + 1}</span>
                <div className="ez-about-pipeline-icon">{step.icon}</div>
                <div className="ez-about-pipeline-title">{step.name}</div>
              </motion.div>
            );
          })}
        </div>

        {/* Contextual Inspector Box */}
        <motion.div
          className="ez-about-workflow-inspector"
          key={current.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#EFF6FF',
              color: '#2563EB',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0
            }}>
              {current.icon}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0B1B33', marginBottom: '3px' }}>
                Tahap {activeStep + 1}: {current.detailTitle}
              </div>
              <div style={{ fontSize: '13.5px', color: '#64748B', maxWidth: '680px' }}>
                {current.detailDesc}
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontFamily: 'monospace',
            fontSize: '11.5px',
            color: '#2563EB',
            background: '#EFF6FF',
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid #BFDBFE'
          }}>
            <CheckCircle2 size={15} color="#10B981" />
            <span>{current.telemetry}</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
