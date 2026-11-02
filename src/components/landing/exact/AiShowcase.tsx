import React, { useEffect, useRef } from 'react';
import '../../../styles/landing-ai-showcase.css';
import { PLAN_DEFINITIONS, PLAN_IDS, type PlanId } from '../../../billing/plans';
import logoImg from '../../../assets/ezrab-logo.png';
import mascotImg from '../../../assets/mascot-ezrab-new.png';
import mascotFullbody from '../../../assets/mascot-ezrab-fullbody.png';
import mascotSitting from '../../../assets/mascot-ezrab-sitting.png';
import { FaqAccordion } from '../../../faq/FaqAccordion';
import { getFeaturedFaqs } from '../../../faq/faqData';

interface AiShowcaseProps {
  onOpenAuth: (tab?: 'masuk' | 'daftar') => void;
  onOpenDemo: () => void;
  onOpenFaq?: () => void;
}

const PLAN_BULLETS: Record<PlanId, string[]> = {
  free: ['1 proyek aktif', 'Kalkulator Volume dasar', 'Template rumah tinggal'],
  starter: ['7 proyek aktif', 'DED Estimate AI', 'Ekspor Excel & PDF'],
  professional: ['25 proyek aktif', 'AI Document (kredit)', 'Kolaborasi tim'],
  business: ['Proyek tanpa batas', 'AI Document penuh', 'Semua fitur Professional'],
};

const PLAN_CTA: Record<PlanId, string> = {
  free: 'Mulai Gratis',
  starter: 'Pilih Starter',
  professional: 'Pilih Professional',
  business: 'Pilih Business',
};

const formatIdr = (n: number) => 'Rp' + n.toLocaleString('id-ID');
const formatNum = (n: number) => n.toLocaleString('id-ID');

/**
 * Section landing AI-first (pengganti ExactStackedShowcase s.d. footer),
 * port dari mockup v8 yang di-ACC owner 2026-11-02: pembuka AI, DED Estimate AI,
 * Ezrab Chat AI, AI Document + Smart RAB + Co Assistant, Ezrab AI Assistant,
 * strip pendukung, kejujuran AI, harga (data kanonis plans.ts), FAQ, CTA, footer.
 * Semua ilustrasi adalah SIMULASI animasi CSS — diberi label sebagai ilustrasi.
 */
export const AiShowcase: React.FC<AiShowcaseProps> = ({ onOpenAuth, onOpenDemo, onOpenFaq }) => {
  // Animasi transisi: teks & gambar muncul berjenjang (fade + naik) saat
  // masuk viewport. Kelas .rv/.rv-on diatur di landing-ai-showcase.css;
  // prefers-reduced-motion menonaktifkannya dari sisi CSS.
  const scopeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = scopeRef.current;
    if (!root) return;
    const targets = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.ezai-sec h2, .ezai-sec .eyebrow, .ezai-sec .sub, .ezai-sec .step, .win, .plan, .pillar, .tile, .hcard, .faq-acc-item, .mini, .cta-box'
      )
    );
    targets.forEach((el) => el.classList.add('rv'));
    const perParent = new Map<Element, number>();
    targets.forEach((el) => {
      const p = el.parentElement;
      if (!p) return;
      const n = perParent.get(p) ?? 0;
      perParent.set(p, n + 1);
      el.style.transitionDelay = `${Math.min(n * 70, 350)}ms`;
    });
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('rv-on'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          el.classList.add('rv-on');
          io.unobserve(el);
          window.setTimeout(() => {
            el.style.transitionDelay = '0ms';
          }, 1000);
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' }
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  const plansBlock = (
    <div className="plans">
      {PLAN_IDS.map((id) => {
        const p = PLAN_DEFINITIONS[id];
        const popular = id === 'professional';
        return (
          <div className={popular ? 'plan pop' : 'plan'} key={id}>
            {popular && <span className="tag">PALING POPULER</span>}
            <h3>{p.displayName}</h3>
            <div className="price">
              {formatIdr(p.monthlyPriceIdr)}
              {p.monthlyPriceIdr > 0 && <small>/bln</small>}
            </div>
            <div className="cred">
              {p.credits.kind === 'initial'
                ? `${formatNum(p.credits.credits)} kredit awal`
                : `${formatNum(p.credits.credits)} kredit AI/bln`}
            </div>
            <ul>
              {PLAN_BULLETS[id].map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <button
              type="button"
              className={popular ? 'btn' : 'btn soft'}
              onClick={() => onOpenAuth('daftar')}
            >
              {PLAN_CTA[id]}
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="ezai-scope" ref={scopeRef}>
      <section className="ezai-sec"><div className="grid-bg"></div><div className="glow" style={{width: '560px', height: '560px', background: 'rgba(37,99,235,.15)', top: '-160px', left: '50%', transform: 'translateX(-50%)'}}></div>
      <div className="wrap center" style={{position: 'relative'}}>
      <span className="eyebrow"> Fitur AI EZRAB</span>
      <h2>Tiga AI. <span className="bl">Satu Workspace Estimasi.</span></h2>
      <p className="sub">EZRAB sekarang bertumpu pada AI: membaca gambar kerja, menjawab dari data proyek Anda, dan menyusun dokumen — pekerjaan berminggu-minggu dipadatkan jadi hitungan menit.</p>
      <div className="pillars" style={{textAlign: 'left'}}>
      <div className="pillar"><div className="mini-scene"><svg viewBox="0 0 200 76" style={{width: '100%', height: '100%'}}><rect x="8" y="6" width="184" height="64" fill="#fff" stroke="#33506E" strokeWidth="3"/><path d="M84,6 V44 M8,44 H192 M132,44 V70" stroke="#33506E" strokeWidth="3" fill="none"/><rect x="96" y="16" width="30" height="16" fill="#EFF4FB" stroke="#B9CBDF"/><rect x="20" y="50" width="34" height="14" fill="#EFF4FB" stroke="#B9CBDF"/></svg><div className="beam-mini"></div></div><h3>DED Estimate AI</h3><p>Upload gambar kerja, AI membaca denah & detail lalu menyusun item pekerjaan beserta volumenya.</p><ul><li>Deteksi item & volume otomatis</li><li>Langsung masuk ke RAB proyek</li><li>Setiap angka berlabel & bisa ditelusur</li></ul><div className="go">Lihat cara kerjanya ↓</div></div>
      <div className="pillar"><div className="mini-scene col"><div className="mbub u">Harga plesteran 1:4?</div><div className="mbub a">Kode 3.7.4 — <b>Rp56.784/m²</b> · AHSP resmi</div><div className="mbub u" style={{animationDelay: '1.4s'}}>Hitung volume dinding</div></div><h3>Ezrab Chat AI</h3><p>Tanya harga, hitung volume, minta rekap — dijawab dari data EZRAB sendiri, bukan karangan model.</p><ul><li>Terhubung AHSP 2026 & harga pasar</li><li>Paham konteks proyek aktif Anda</li><li>Bisa menjalankan perintah navigasi</li></ul><div className="go">Lihat contoh percakapan ↓</div></div>
      <div className="pillar"><div className="mini-scene col" style={{gap: '8px'}}><div style={{display: 'flex', alignItems: 'center', gap: '7px'}}><span className="pdfchip">PDF</span><b style={{fontSize: '12px', color: '#0A2540'}}>Surat Penawaran</b></div><div className="line" style={{animationDelay: '.2s'}}></div><div className="line" style={{animationDelay: '.5s', width: '88%'}}></div><div className="line" style={{animationDelay: '.8s', width: '60%'}}></div></div><h3>AI Document</h3><p>Surat penawaran, laporan, dan dokumen proyek tersusun otomatis dari data proyek yang sudah ada.</p><ul><li>Template resmi siap pakai</li><li>Angka mengikuti RAB terbaru</li><li>Tetap bisa diedit sebelum unduh</li></ul><div className="go">Lihat contoh dokumen ↓</div></div>
      </div></div></section>

      <section className="ezai-sec" id="ded" style={{paddingTop: '30px'}}><div className="wrap"><div className="split">
      <div><span className="eyebrow"> DED Estimate AI</span>
      <h2>Dari gambar kerja, <span className="bl">langsung jadi draf RAB.</span></h2>
      <p className="sub">Tidak perlu lagi mengukur ulang satu per satu. AI membaca gambar Anda, mengenali elemen bangunan, lalu menghitung volume dan menyusunnya sebagai item RAB.</p>
      <div className="steps">
      <div className="step"><div className="n">1</div><div><b>Upload gambar kerja</b><p>Denah, potongan, atau detail — PNG, JPG, atau PDF.</p></div></div>
      <div className="step"><div className="n">2</div><div><b>AI membaca & menghitung</b><p>Item pekerjaan dan volume terdeteksi, lengkap dengan basis perhitungannya.</p></div></div>
      <div className="step"><div className="n">3</div><div><b>Masuk ke RAB proyek</b><p>Item yang belum ada harga resminya ditahan & diberi label — tidak pernah masuk sebagai Rp0.</p></div></div>
      </div></div>
      <div><div className="win"><div className="win-head"><span className="dot" style={{background: '#F87171'}}></span><span className="dot" style={{background: '#FBBF24'}}></span><span className="dot" style={{background: '#34D399'}}></span><span className="win-title">DED Estimate AI — denah-rumah-2lt.png</span></div><div className="sim sim-ded" style={{borderRadius: '0 0 19px 19px', overflow: 'hidden'}}>
      <div className="planbox simfade12">
      <svg viewBox="0 0 340 236" style={{width: '100%', display: 'block'}} role="img" aria-label="Denah lantai 1">
      <rect x="12" y="12" width="316" height="212" fill="#FFFFFF"/>
      <rect className="rm" style={{animationDelay: '.8s'}} x="14" y="14" width="178" height="130" fill="#2563EB" fillOpacity=".13"/>
      <rect className="rm" style={{animationDelay: '1.7s'}} x="198" y="14" width="128" height="130" fill="#2563EB" fillOpacity=".13"/>
      <rect className="rm" style={{animationDelay: '2.6s'}} x="14" y="148" width="134" height="74" fill="#2563EB" fillOpacity=".13"/>
      <rect className="rm" style={{animationDelay: '3.5s'}} x="154" y="148" width="98" height="74" fill="#2563EB" fillOpacity=".13"/>
      <rect className="rm" style={{animationDelay: '4.4s'}} x="260" y="148" width="64" height="74" fill="#2563EB" fillOpacity=".13"/>
      <g stroke="#B9CBDF" strokeWidth="1.5" fill="#EFF4FB">
      <rect x="30" y="94" width="74" height="30" rx="4"/><rect x="30" y="86" width="74" height="9" rx="4"/><rect x="52" y="56" width="30" height="16" rx="2"/>
      <rect x="238" y="26" width="76" height="54" rx="3"/><rect x="246" y="32" width="26" height="14" rx="3"/><rect x="304" y="20" width="16" height="52"/>
      <rect x="14" y="196" width="86" height="26"/><rect x="56" y="202" width="20" height="12" fill="#DCE9F8"/>
      <rect x="166" y="184" width="20" height="10"/><rect x="226" y="190" width="22" height="28"/>
      <circle cx="176" cy="206" r="9"/><circle cx="284" cy="166" r="7"/><circle cx="306" cy="198" r="7"/><circle cx="295" cy="182" r="6"/>
      </g>
      <rect x="28" y="20" width="3.5" height="44" fill="#C7D8EE"/>
      <g stroke="#33506E" strokeWidth="4.5" fill="none">
      <rect x="12" y="12" width="316" height="212"/>
      <path d="M196,12 V146 M12,146 H84 M112,146 H226 M254,146 H328 M152,146 V224 M256,146 V224"/>
      </g>
      <g stroke="#33506E" strokeWidth="1.6" fill="none"><path d="M84,146 L84,118 A28,28 0 0 1 112,146"/><path d="M226,146 L226,118 A28,28 0 0 0 254,146"/></g>
      <rect x="60" y="9" width="46" height="6" fill="#fff" stroke="#33506E" strokeWidth="1.5"/>
      <rect x="325" y="58" width="6" height="42" fill="#fff" stroke="#33506E" strokeWidth="1.5"/>
      <g fontSize="10.5" fontWeight="700" fill="#5A718C" letterSpacing=".06em" textAnchor="middle">
      <text x="102" y="42">R. TAMU</text><text x="262" y="104">K. TIDUR</text><text x="80" y="172">DAPUR</text><text x="202" y="172">KM/WC</text><text x="292" y="140" fontSize="9">TERAS</text>
      </g>
      </svg>
      <div className="pstat"><span>Denah Lt. 1 — 96 m²</span><span className="pctstack"><span>Memindai 24%</span><span>Memindai 57%</span><span>Memindai 86%</span><span>Selesai — 24 item</span></span></div>
      <div className="pbar"><i></i></div>
      </div>
      <div className="resbox simfade12">
      <div className="rhead"><b>Hasil deteksi AI</b><span className="cnt">24 item</span></div>
      <div className="rrow" style={{animationDelay: '5s'}}><span style={{flex: '1'}}>Pondasi batu kali</span><span className="rv">12,40 m³</span><span className="chip ai">Estimasi AI</span></div>
      <div className="rrow" style={{animationDelay: '5.8s'}}><span style={{flex: '1'}}>Dinding bata merah 1:4</span><span className="rv">96,20 m²</span><span className="chip ai">Estimasi AI</span></div>
      <div className="rrow" style={{animationDelay: '6.6s'}}><span style={{flex: '1'}}>Plesteran 1:4 (3.7.4)</span><span className="rv">192,40 m²</span><span className="chip ok">AHSP Resmi</span></div>
      <div className="rrow" style={{animationDelay: '7.4s'}}><span style={{flex: '1'}}>Keramik lantai 40×40</span><span className="rv">84,00 m²</span><span className="chip ai">Estimasi AI</span></div>
      <div className="rrow" style={{animationDelay: '8.2s'}}><span style={{flex: '1'}}>Cat tembok interior</span><span className="rv">210,50 m²</span><span className="chip ai">Estimasi AI</span></div>
      <button className="btn ctaglow" style={{width: '100%', justifyContent: 'center', marginTop: '4px'}}>Masukkan ke RAB Proyek</button>
      <p style={{fontSize: '11px', color: '#8498AF', marginTop: '9px', lineHeight: '1.5'}}>Item yang belum ada harga resminya ditahan & diberi label — tidak pernah masuk sebagai Rp0.</p>
      </div>
      <div className="ring ringDed"></div>
      <div className="cur curDed"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 3 L19 12 L12.5 13.5 L9.5 20 Z" fill="#0A2540" stroke="#fff" strokeWidth="1.6"/></svg></div>
      </div></div><div className="demo-note">Ilustrasi animasi cara kerja EZRAB.</div></div>
      </div></div></section>

      <section className="ezai-sec" id="chat" style={{paddingTop: '30px'}}><div className="grid-bg"></div><div className="wrap"><div className="split rev">
      <div><div className="win"><div className="win-head"><span className="dot" style={{background: '#F87171'}}></span><span className="dot" style={{background: '#FBBF24'}}></span><span className="dot" style={{background: '#34D399'}}></span><span className="win-title">Ezrab Chat AI — Proyek: Rumah Tinggal 2 Lantai</span></div><div className="sim" style={{borderRadius: '0 0 19px 19px', overflow: 'hidden'}}>
      <div className="simchat">
      <div className="msgs simfade14" style={{display: 'flex', flexDirection: 'column', gap: '9px'}}>
      <div className="bub u anim-bub" style={{animationDuration: '14s'}}>Berapa harga plesteran 1:4 per m²?</div>
      <div className="bub a typing" style={{animationDuration: '14s', animationDelay: '.9s'}}><i></i><i></i><i></i></div>
      <div className="bub a anim-bub" style={{animationDuration: '14s', animationDelay: '2.6s'}}>Berikut data resmi dari database EZRAB:
      <div className="dcard">
      <div className="dr"><span>Kode AHSP</span><b>3.7.4</b></div>
      <div className="dr"><span>Plesteran 1:4 tebal 15 mm</span><b>Rp56.784/m²</b></div>
      <div style={{marginTop: '6px'}}><span className="src">Sumber: AHSP 2026 resmi</span></div>
      </div></div>
      <div className="quickrow anim-bub" style={{animationDuration: '14s', animationDelay: '5.6s'}}><span className="qchip chipGlow">Hitung volume dinding</span><span>Audit RAB</span><span>Cari AHSP</span></div>
      <div className="bub u anim-bub" style={{animationDuration: '14s', animationDelay: '7.6s'}}>Hitung volume dinding bata untuk denah ini</div>
      <div className="bub a typing2" style={{animationDelay: '1.2s'}}><i></i><i></i><i></i></div>
      <div className="bub a anim-bub" style={{animationDuration: '14s', animationDelay: '9.9s'}}>Siap — dihitung dari denah proyek aktif yang sedang Anda buka:
      <table className="mtab">
      <tr><td>Dinding bata merah 1:4</td><td>96,20 m²</td></tr>
      <tr><td>Plesteran 1:4 (3.7.4)</td><td>192,40 m²</td></tr>
      </table>
      <p style={{fontSize: '12px', color: '#5A718C', marginTop: '7px'}}>Berlabel <b>Estimasi AI</b> — klik angkanya untuk melihat basis perhitungannya.</p>
      <span className="abtn">Masukkan ke RAB</span></div>
      </div>
      <div className="composer"><span className="ct">Tanya harga, hitung volume, minta rekap…<span className="caret"></span></span><span className="sendb">↑</span></div>
      </div>
      <div className="ring ringChat"></div>
      <div className="cur curChat"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 3 L19 12 L12.5 13.5 L9.5 20 Z" fill="#0A2540" stroke="#fff" strokeWidth="1.6"/></svg></div>
      </div><div className="demo-note">Ilustrasi animasi cara kerja EZRAB.</div></div></div>
      <div><span className="eyebrow"> Ezrab Chat AI</span>
      <h2>Tanya apa pun, <span className="bl">dijawab dari data EZRAB.</span></h2>
      <p className="sub">Chat AI lain menjawab dari ingatan model. Ezrab Chat AI menjawab dari database AHSP 2026, harga material, upah, dan peralatan di dalam EZRAB — lengkap dengan sumbernya.</p>
      <div className="steps">
      <div className="step"><div className="n">1</div><div><b>Terhubung data resmi</b><p>AHSP 2026, harga material, upah, dan alat — bukan angka karangan.</p></div></div>
      <div className="step"><div className="n">2</div><div><b>Paham proyek aktif</b><p>Jawaban mengikuti konteks proyek yang sedang Anda buka.</p></div></div>
      <div className="step"><div className="n">3</div><div><b>Langsung bertindak</b><p>Menghitung volume, membuka menu, menyusun draf — bukan sekadar teks.</p></div></div>
      </div></div>
      </div></div></section>

      <section className="ezai-sec" id="dokumen" style={{paddingTop: '30px'}}><div className="wrap"><div className="split">
      <div><span className="eyebrow"> AI Document</span>
      <h2>Dokumen proyek, <span className="bl">tersusun otomatis.</span></h2>
      <p className="sub">Surat penawaran, laporan kemajuan, hingga berita acara — AI Document menyusunnya dari data proyek dan RAB terbaru Anda. Anda tinggal memeriksa dan mengunduh.</p>
      <div className="steps">
      <div className="step"><div className="n">1</div><div><b>Pilih template</b><p>Katalog template dokumen konstruksi siap pakai.</p></div></div>
      <div className="step"><div className="n">2</div><div><b>AI menyusun dari data proyek</b><p>Nama proyek, nilai RAB, dan jadwal terisi otomatis — konsisten dengan angka terbaru.</p></div></div>
      <div className="step"><div className="n">3</div><div><b>Periksa, edit, unduh</b><p>Semua hasil tetap bisa diedit manual sebelum diekspor ke PDF.</p></div></div>
      </div></div>
      <div><div className="win"><div className="win-head"><span className="dot" style={{background: '#F87171'}}></span><span className="dot" style={{background: '#FBBF24'}}></span><span className="dot" style={{background: '#34D399'}}></span><span className="win-title">AI Document — dokumen proyek</span></div><div className="sim simdoc" style={{borderRadius: '0 0 19px 19px', overflow: 'hidden'}}>
      <div className="docpage simfade12">
      <div className="lh"><img src={logoImg} alt="" /><div><b>CV. BERKAH KONSTRUKSI</b><span>Jl. Raya Pembangunan No. 88 — Probolinggo, Jawa Timur</span></div></div>
      <h4>SURAT PENAWARAN</h4>
      <p className="meta">Nomor: 014/SP/XI/2026<br/>Kepada: Pemilik Proyek Rumah Tinggal 2 Lantai<br/>Perihal: Penawaran harga pembangunan — mengikuti RAB terbaru</p>
      <div className="line" style={{animationDelay: '.2s'}}></div>
      <div className="line" style={{animationDelay: '.55s', width: '92%'}}></div>
      <div className="line" style={{animationDelay: '.9s', width: '64%'}}></div>
      <table className="dtab">
      <tr><th>URAIAN PEKERJAAN</th><th>JUMLAH</th></tr>
      <tr><td style={{animationDelay: '3.4s'}}>Pondasi & struktur beton</td><td style={{animationDelay: '3.4s'}}>Rp148.500.000</td></tr>
      <tr><td style={{animationDelay: '4.2s'}}>Dinding, plesteran & pengecatan</td><td style={{animationDelay: '4.2s'}}>Rp96.750.000</td></tr>
      <tr><td style={{animationDelay: '5s'}}>Finishing & sanitair</td><td style={{animationDelay: '5s'}}>Rp72.300.000</td></tr>
      <tr className="tot"><td style={{animationDelay: '5.8s'}}>TOTAL PENAWARAN</td><td style={{animationDelay: '5.8s'}}>Rp317.550.000</td></tr>
      </table>
      <div className="sign">Hormat kami,
      <div className="stamp">BERKAH<br/>KONSTRUKSI</div>
      <div><svg className="scrib" width="92" height="30" viewBox="0 0 90 30"><path d="M4 22 C 18 4, 30 28, 44 12 S 74 8, 86 16" stroke="#33506E" fill="none" strokeWidth="2" strokeLinecap="round"/></svg></div>
      <b style={{color: '#0A2540'}}>Ir. B. Prasetyo</b><br/>Direktur</div>
      </div>
      <div className="docside simfade12">
      <b style={{fontSize: '13.5px', color: '#0A2540'}}>Disusun AI dari data proyek</b>
      <div className="chk" style={{animationDelay: '2.2s'}}><span className="ck">✓</span><span>Angka mengikuti RAB proyek terbaru</span></div>
      <div className="chk" style={{animationDelay: '3s'}}><span className="ck">✓</span><span>Template surat resmi siap pakai</span></div>
      <div className="chk" style={{animationDelay: '3.8s'}}><span className="ck">✓</span><span>Setiap angka berlabel sumbernya</span></div>
      <p style={{fontSize: '11.5px', color: '#8498AF', lineHeight: '1.55'}}>Seluruh isi tetap bisa Anda edit sebelum diunduh atau dikirim.</p>
      <button className="btn dlGlow" style={{justifyContent: 'center', marginTop: 'auto', width: '100%'}}>Unduh PDF</button>
      </div>
      <div className="ring ringDoc"></div>
      <div className="cur curDoc"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 3 L19 12 L12.5 13.5 L9.5 20 Z" fill="#0A2540" stroke="#fff" strokeWidth="1.6"/></svg></div>
      </div></div>
      <div className="demo-note">Ilustrasi animasi cara kerja EZRAB.</div></div></div>
      <div className="half2">
      <div className="mini"><img className="mini-img" src={logoImg} alt="" /><h3>Smart RAB</h3><p>Ceritakan proyek Anda di chat — mis. "rumah 2 lantai 120 m²" — dan draf RAB tersusun dari kode AHSP resmi, siap Anda periksa item per item.</p></div>
      <div className="mini"><img className="mini-img" src={mascotImg} alt="" /><h3>Co Assistant</h3><p>Asisten pendamping di setiap halaman: audit RAB, periksa Kurva S, jelaskan item, hitung ulang — tanpa berpindah menu.</p></div>
      </div></div></section>

      <section className="ezai-sec" id="asisten">
      <div className="grid-bg"></div>
      <div className="wrap">
      <div className="split">
      <div>
      <span className="eyebrow">Ezrab AI Assistant</span>
      <h2>Asisten pribadi di dalam <span className="bl">seluruh workspace.</span></h2>
      <p className="sub">Panel pendamping yang bisa Anda perintahkan dengan bahasa sehari-hari — membuka menu, menghitung, dan menyiapkan draf, sementara Anda tetap memegang kendali.</p>
      <div className="steps">
      <div className="step"><span className="n">1</span><div><b>Perintah bahasa sehari-hari</b><p>"Buka kurva S", "hitung volume dinding", "buatkan rekap" — langsung dipahami & dijalankan.</p></div></div>
      <div className="step"><span className="n">2</span><div><b>Menavigasi & menyiapkan untuk Anda</b><p>Membuka menu yang tepat, mengisi draf, menyusun rekap — bukan sekadar menjawab teks.</p></div></div>
      <div className="step"><span className="n">3</span><div><b>Tetap dengan izin Anda</b><p>Setiap aksi penting menunggu konfirmasi Anda. Tidak ada perubahan diam-diam.</p></div></div>
      </div>
      </div>
      <div style={{position: 'relative'}}>
      <img className="mascot-hero" src={mascotFullbody} alt="Maskot EZRAB" />
      <div className="win">
      <div className="win-head"><span className="dot" style={{background: '#F87171'}}></span><span className="dot" style={{background: '#FBBF24'}}></span><span className="dot" style={{background: '#34D399'}}></span><span className="win-title">Ezrab AI Assistant — panel pendamping</span></div>
      <div className="sim" style={{borderRadius: '0 0 19px 19px', overflow: 'hidden'}}>
      <div className="asst">
      <div className="msgs simfade12" style={{display: 'flex', flexDirection: 'column', gap: '9px'}}>
      <div className="ahead"><img src={mascotImg} alt="" /><div><b style={{fontSize: '14px', color: '#0A2540', display: 'block'}}>Ezrab AI Assistant</b><span className="on">● Online — siap membantu</span></div></div>
      <div className="bub u anim-bub" style={{animationDuration: '12s'}}>Buka Spreadsheet RAB proyek ini</div>
      <div className="bub a anim-bub" style={{animationDuration: '12s', animationDelay: '2.4s'}}>Siap — membuka Spreadsheet RAB untuk <b>Rumah Tinggal 2 Lantai</b>.
      <div className="acard"><span style={{fontWeight: '800'}}>✓</span><span>Navigasi selesai — Spreadsheet RAB terbuka</span></div></div>
      <div className="bub u anim-bub" style={{animationDuration: '12s', animationDelay: '5.8s'}}>Berapa total RAB proyek aktif?</div>
      <div className="bub a anim-bub" style={{animationDuration: '12s', animationDelay: '8.2s'}}>Total RAB — Rumah Tinggal 2 Lantai:
      <div className="dcard"><div className="bigamt">Rp317.550.000</div><p style={{fontSize: '12px', color: '#5A718C', marginTop: '4px'}}>Dihitung langsung dari item RAB proyek aktif — lengkap dengan label sumber di setiap angkanya.</p></div></div>
      <div className="quickrow anim-bub" style={{animationDuration: '12s', animationDelay: '10.2s'}}><span>Buka Kurva S</span><span>Buat Laporan</span><span>Cek Harga Material</span></div>
      </div>
      <div className="composer"><span className="ct">Perintahkan apa saja…<span className="caret"></span></span><span className="sendb">↑</span></div>
      </div>
      <div className="ring ringAsst"></div>
      <div className="cur curAsst"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 3 L19 12 L12.5 13.5 L9.5 20 Z" fill="#0A2540" stroke="#fff" strokeWidth="1.6"/></svg></div>
      </div>
      </div>
      <div className="demo-note">Ilustrasi animasi cara kerja EZRAB.</div>
      </div>
      </div>
      </div>
      </section>


      <section className="ezai-sec" id="perkakas" style={{paddingTop: '26px'}}><div className="wrap">
      <div className="center"><span className="eyebrow"> Mesin Estimasi Lengkap</span>
      <h2 style={{fontSize: '32px'}}>AI-nya bintang utama. <span className="bl">Mesin di baliknya tetap lengkap.</span></h2></div>
      <div className="bento">
      <div className="tile"><div className="motif"><div className="keys"><i></i><i></i><i></i><i></i><i className="hot"></i><i></i><i></i><i></i><i></i></div></div><b>Kalkulator Volume</b><p>190 kalkulator pekerjaan konstruksi terstandarisasi SNI.</p></div>
      <div className="tile"><div className="motif col2"><i className="brow" style={{width: '72%'}}></i><i className="brow" style={{width: '54%', animationDelay: '.5s'}}></i><i className="brow" style={{width: '64%', animationDelay: '1s'}}></i></div><b>AHSP 2026</b><p>Database analisa harga satuan resmi, selalu jadi rujukan harga.</p></div>
      <div className="tile"><div className="motif"><div className="sgrid"><i></i><i></i><i></i><i></i><i></i><i className="hl"></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div><b>Spreadsheet RAB</b><p>Susun dan edit RAB seperti spreadsheet yang Anda kenal.</p></div>
      <div className="tile"><div className="motif"><svg width="120" height="44" viewBox="0 0 120 44"><path className="scurve" d="M6 38 C 40 36, 52 30, 66 20 S 100 6, 114 5" stroke="#2563EB" strokeWidth="3" fill="none" strokeLinecap="round"/><line x1="6" y1="40" x2="114" y2="40" stroke="#D7E3F2" strokeWidth="2"/></svg></div><b>Kurva S & Jadwal</b><p>Pantau rencana vs realisasi proyek dalam satu grafik.</p></div>
      <div className="tile"><div className="motif"><div className="sheet">↓ PDF</div></div><b>Ekspor Excel & PDF</b><p>Hasil akhir siap dibagikan ke klien dan tim lapangan.</p></div>
      </div></div></section>

      <section className="ezai-sec" style={{paddingTop: '10px'}}><div className="wrap">
      <div className="center"><h2 style={{fontSize: '32px'}}>AI yang <span className="bl">tidak mengarang angka.</span></h2>
      <p className="sub">Prinsip yang kami pegang sejak awal — dan alasan estimator profesional bisa percaya.</p></div>
      <div className="honest">
      <div className="hcard"><div className="hnum">01</div><div><b>Harga dari AHSP resmi</b><p>Harga satuan bersumber dari AHSP 2026 dan data proyek Anda — bukan hasil tebakan model AI.</p></div></div>
      <div className="hcard"><div className="hnum">02</div><div><b>Label & basis transparan</b><p>Setiap angka perkiraan berlabel "Estimasi AI" dan dapat diklik untuk melihat dasar perhitungannya.</p></div></div>
      <div className="hcard"><div className="hnum">03</div><div><b>Anda tetap memegang kendali</b><p>Semua hasil AI bisa diperiksa dan diedit manual. Item tanpa harga resmi tidak pernah masuk sebagai Rp0.</p></div></div>
      </div></div></section>

      <section className="ezai-sec" id="harga" style={{paddingTop: '20px'}}><div className="grid-bg"></div><div className="wrap" style={{position: 'relative'}}>
      <div className="center"><span className="eyebrow"> Harga & Kredit AI</span>
      <h2>Paket mengikuti <span className="bl">kebutuhan AI Anda.</span></h2>
      <p className="sub" style={{margin: '0 auto'}}>Setiap paket berbayar dilengkapi kredit AI bulanan untuk DED Estimate AI, Chat AI, dan AI Document.</p></div>
      {plansBlock}
      <p className="demo-note" style={{textAlign: 'center'}}>Mode simulasi — langganan belum aktif, belum ada penagihan nyata.</p>
      </div></section>

      <section className="ezai-sec" id="faq" style={{paddingTop: '16px'}}><div className="wrap">
      <div className="center"><span className="eyebrow">Pusat Bantuan</span><h2 style={{fontSize: '32px'}}>Sering ditanyakan <span className="bl">soal EZRAB</span></h2></div>
      <div style={{maxWidth: '860px', margin: '34px auto 0'}}><FaqAccordion items={getFeaturedFaqs()} idPrefix="home-faq" /></div>
      <div className="center" style={{marginTop: '26px'}}><button type="button" className="btn" onClick={() => onOpenFaq?.()}>Lihat Semua Pertanyaan</button></div>
      <div className="cta-box" style={{marginTop: '132px'}}><img className="mascot-cta" src={mascotSitting} alt="Maskot EZRAB" /><span className="eyebrow" style={{background: 'rgba(255,255,255,.14)', borderColor: 'rgba(255,255,255,.3)', color: '#DCEBFF'}}> Mulai Sekarang</span>
      <h2>Rasakan estimator<br/>yang bekerja dengan AI.</h2>
      <p className="sub" style={{margin: '0 auto 30px', color: '#C9DCF7'}}>Masuk sebagai peran demo dan coba DED Estimate AI, Chat AI, dan AI Document — tanpa kartu kredit.</p>
      <div style={{display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap'}}><button className="btn" style={{background: '#fff', color: '#1E40AF'}} onClick={onOpenDemo}>Coba Masuk sebagai Demo</button><button className="btn ghost" onClick={() => onOpenAuth('daftar')}>Daftar Gratis</button></div></div>
      </div></section>
      <footer className="ezai-footer"><div className="wrap"><div className="fgrid">
      <div><div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px'}}><img src={logoImg} alt="Logo EZRAB" style={{width: '38px', height: '38px', borderRadius: '9px', objectFit: 'cover'}} /><b style={{margin: '0', fontSize: '16px'}}>EZRAB</b></div>
      <p style={{fontSize: '13.5px', lineHeight: '1.65', color: '#8498AF', maxWidth: '300px'}}>Workspace estimasi konstruksi bertenaga AI — dari gambar kerja sampai RAB dan dokumen, dalam satu tempat.</p></div>
      <div><b>Fitur AI</b><a href="#ded">DED Estimate AI</a><a href="#chat">Ezrab Chat AI</a><a href="#dokumen">AI Document</a><a href="#dokumen">Smart RAB</a></div>
      <div><b>Produk</b><a href="#perkakas">Kalkulator Volume</a><a href="#perkakas">AHSP 2026</a><a href="#perkakas">Spreadsheet RAB</a><a href="#perkakas">Kurva S</a></div>
      <div><b>Perusahaan</b><a href="#harga">Harga</a><a href="#faq">Sering Ditanyakan</a><button type="button" onClick={() => onOpenAuth('masuk')}>Masuk</button><button type="button" onClick={() => onOpenAuth('daftar')}>Daftar</button></div>
      </div>
      <div className="fbot"><span>© 2026 EZRAB — YF ARCH. Seluruh hak cipta dilindungi.</span><span>ezrab.site</span></div>
      </div></footer>
    </div>
  );
};
