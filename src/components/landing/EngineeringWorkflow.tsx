import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, Box, Check, FileText, FolderKanban, Layers3, ScanLine, Sparkles, Table2, Upload } from 'lucide-react';

interface Props { onStart?: () => void }

const steps = ['Gambar Kerja', 'Volume', 'QTO', 'AHSP', 'RAB', 'BOQ', 'Rekap', 'Kurva S', 'Laporan'];

export const EngineeringWorkflow: React.FC<Props> = ({ onStart }) => {
  const ref = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      setProgress(Math.max(0, Math.min(1, (window.innerHeight * .72 - rect.top) / (rect.height * .68))));
    };
    window.addEventListener('scroll', update, { passive: true }); update();
    return () => window.removeEventListener('scroll', update);
  }, []);

  const active = Math.min(steps.length - 1, Math.floor(progress * steps.length));

  return <>
    <section id="fitur" className="engineering-workflow" ref={ref}>
      <div className="ezrab-container">
        <div className="eyebrow"><span />Workflow terintegrasi</div>
        <h2>Satu workflow.<br />Dari gambar kerja ke laporan.</h2>
        <p className="section-lead">Setiap perhitungan tetap saling terhubung—sehingga perubahan volume bisa ditelusuri hingga dokumen akhir.</p>
        <div className="workflow-rail" aria-label="Alur pekerjaan EZRAB">
          {steps.map((step, i) => <React.Fragment key={step}>
            <div className={`workflow-node ${i <= active ? 'is-active' : ''}`}><i>{String(i + 1).padStart(2, '0')}</i><b>{step}</b></div>
            {i < steps.length - 1 && <div className={`workflow-line ${i < active ? 'is-active' : ''}`} />}
          </React.Fragment>)}
        </div>
        <div className="workflow-caption"><span className="pulse-dot" /> {steps[active]} <small>· tahap {active + 1} dari {steps.length}</small></div>
      </div>
    </section>

    <section className="ai-section">
      <div className="ezrab-container split-grid">
        <div><div className="eyebrow"><Sparkles size={14} />EZRAB Magic AI</div><h2>Kerjakan lebih cepat dengan <em>EZRAB Magic AI.</em></h2><p className="section-lead">Asisten untuk mempercepat penyusunan pekerjaan dan draft. Semua hasil tetap dapat diperiksa, diedit, dan disesuaikan oleh tim Anda.</p><button className="dark-cta" onClick={onStart}>Coba workspace <ArrowRight size={16} /></button></div>
        <div className="ai-console">
          <div className="console-bar"><span /><span /><span /><b>EZRAB MAGIC / DEMO</b></div>
          <div className="chat-message user">Buat draft RAB rumah 2 lantai<br />luas bangunan 180 m².</div>
          <div className="chat-message assistant"><Bot size={17} /><div><b>Draft workspace disiapkan</b><p>Struktur proyek dan pekerjaan awal siap ditinjau.</p></div></div>
          <div className="ai-output"><div><small>PROJECT</small><b>Rumah 2 Lantai</b></div><div><small>QTO</small><b>Siap ditinjau</b></div><div><small>AHSP</small><b>Database terhubung</b></div><div><small>RAB</small><b>Draft tersedia</b></div></div>
          <div className="ai-disclaimer">AI membantu mempercepat workflow, bukan menjamin akurasi hasil.</div>
        </div>
      </div>
    </section>

    <section className="tool-section">
      <div className="ezrab-container tool-grid">
        <div className="upload-stage"><div className="scan-beam" /><Upload size={28}/><b>Upload Gambar Kerja</b><span>PDF / JPG / PNG</span><button>Pilih File</button><small><ScanLine size={13}/> Preview workflow — bukan proses proyek aktual</small></div>
        <div><div className="eyebrow"><Box size={14}/>Upload to RAB</div><h2>Mulai dari dokumen yang sudah Anda punya.</h2><p className="section-lead">Unggah gambar kerja atau PDF untuk memulai draft QTO dan RAB dalam workspace yang dapat disusun ulang oleh tim.</p><div className="mini-flow"><span>File</span><i /> <span>Draft QTO</span><i /> <span>Workspace RAB</span></div></div>
      </div>
    </section>

    <section className="volume-section"><div className="ezrab-container split-grid">
      <div><div className="eyebrow">Volume calculator</div><h2>Dimensi masuk.<br /><em>Volume terukur.</em></h2><p className="section-lead">Kalkulator volume adalah bagian dari alur estimasi, bukan alat yang berdiri sendiri.</p><button className="outline-cta" onClick={onStart}>Lihat Volume Calculator <ArrowRight size={16}/></button></div>
      <div className="volume-panel"><div className="panel-title"><Layers3 size={17}/> Kalkulasi elemen · demo</div><div className="dimension-grid">{[['Panjang','15.00','m'],['Lebar','8.00','m'],['Tinggi','3.50','m']].map(v => <div key={v[0]}><small>{v[0]}</small><b>{v[1]} <em>{v[2]}</em></b></div>)}</div><div className="calc-line"><span>DIMENSI</span><i/><span>PERHITUNGAN</span><i/><span>VOLUME</span></div><div className="volume-result"><small>VOLUME</small><b>420.00 <em>m³</em></b></div></div>
    </div></section>

    <section className="rab-section"><div className="ezrab-container"><div className="section-head"><div><div className="eyebrow"><Table2 size={14}/>RAB workspace</div><h2>Estimasi yang bisa dibaca,<br />ditelusuri, dan disesuaikan.</h2></div><p className="section-lead">Tampilan data teknis untuk merangkai volume, harga satuan, dan rekap dalam satu tempat.</p></div><div className="spreadsheet"><div className="sheet-top"><span>RAB / DEMO PROJECT</span><b>Perkiraan biaya pekerjaan</b><button>+ Tambah baris</button></div><div className="sheet-table"><div className="sheet-row sheet-header"><span>No</span><span>Kode</span><span>Uraian pekerjaan</span><span>Volume</span><span>Satuan</span><span>Harga satuan</span><span>Jumlah harga</span></div>{[['01','STR-01','Beton bertulang struktur','45.00','m³','—','Draft'],['02','ARS-04','Pasangan dinding','280.00','m²','—','Draft'],['03','FIN-02','Pekerjaan lantai','180.00','m²','—','Draft']].map(row => <div className="sheet-row" key={row[0]}>{row.map((cell, i) => <span key={i}>{cell}</span>)}</div>)}</div><div className="sheet-total"><span>Nilai contoh ditampilkan sebagai draft.</span><b>Total RAB <em>Menunggu perhitungan</em></b></div></div></div></section>

    <section className="ahsp-section"><div className="ezrab-container split-grid"><div className="ahsp-diagram"><div className="ahsp-main"><DatabaseIcon /> AHSP<br/><small>Database aktif</small></div>{['Pekerjaan','Koefisien','Material','Upah','Alat','Harga Satuan'].map((x,i)=><div className="ahsp-chip" style={{'--i': i} as React.CSSProperties} key={x}>{x}</div>)}</div><div><div className="eyebrow">AHSP</div><h2>Hubungkan pekerjaan dengan AHSP.</h2><p className="section-lead">Struktur data yang membantu tim menelusuri komponen pekerjaan, koefisien, material, upah, alat, hingga harga satuan.</p></div></div></section>

    <section className="connected-section"><div className="ezrab-container"><div className="connected-copy"><div className="eyebrow">Sistem terpadu</div><h2>Semua data<br /><em>terhubung.</em></h2><p className="section-lead">Satu sumber kerja untuk seluruh dokumen estimasi dan pelaporan proyek.</p></div><div className="data-network">{steps.map((x,i)=><React.Fragment key={x}><div className={`network-node n${i}`}><span>{String(i+1).padStart(2,'0')}</span>{x}</div>{i<steps.length-1&&<div className="network-link"/>}</React.Fragment>)}</div></div></section>

    <section className="management-section"><div className="ezrab-container split-grid"><div><div className="eyebrow"><FolderKanban size={14}/>Project management</div><h2>Satu pusat kerja untuk proyek dan tim.</h2><p className="section-lead">Pantau pekerjaan, RAB, BOQ, jadwal, hingga laporan dari konteks proyek yang sama.</p></div><div className="project-window"><div className="project-nav"><b>Rumah Tinggal 2 Lantai</b><span>DEMO PROJECT</span></div><div className="project-menu">{['QTO','RAB','BOQ','Schedule','Reports'].map((x,i)=><div className={i===1?'selected':''} key={x}>{x}<Check size={14}/></div>)}</div><div className="report-stack"><FileText/><div><b>Laporan proyek siap ditata</b><small>RAB · BOQ · Rekapitulasi · Kurva S</small></div></div></div></div></section>
  </>;
};

const DatabaseIcon = () => <span className="database-mark">⌘</span>;
