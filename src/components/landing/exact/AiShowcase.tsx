import React, { useEffect, useRef } from 'react';
import '../../../styles/landing-ai-showcase.css';
import { PricingCards } from './PricingBlocks';
import logoImg from '../../../assets/ezrab-logo.png';
import mascotImg from '../../../assets/mascot-ezrab-new.png';
import mascotFullbody from '../../../assets/mascot-ezrab-fullbody.png';
import mascotSitting from '../../../assets/mascot-ezrab-sitting.png';
import { FaqAccordion } from '../../../faq/FaqAccordion';
import { getFeaturedFaqs } from '../../../faq/faqData';
import { navigateTo } from '../../../routing/routes';
import { useI18n } from '../../../i18n';

interface AiShowcaseProps {
  onOpenAuth: (tab?: 'masuk' | 'daftar') => void;
  onOpenDemo: () => void;
  onOpenFaq?: () => void;
  onOpenPricing?: () => void;
}

const formatIdr = (n: number) => 'Rp' + n.toLocaleString('id-ID');
const formatNum = (n: number) => n.toLocaleString('id-ID');

/**
 * Section landing AI-first (pengganti ExactStackedShowcase s.d. footer),
 * port dari mockup v8 yang di-ACC owner 2026-11-02: pembuka AI, DED Estimate AI,
 * Ezrab Chat AI, AI Document + Smart RAB + Co Assistant, Ezrab AI Assistant,
 * strip pendukung, kejujuran AI, harga (data kanonis plans.ts), FAQ, CTA, footer.
 * Semua ilustrasi adalah SIMULASI animasi CSS — diberi label sebagai ilustrasi.
 */
export const AiShowcase: React.FC<AiShowcaseProps> = ({ onOpenAuth, onOpenDemo, onOpenFaq, onOpenPricing }) => {
  const { t } = useI18n();
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

  // FAQ unggulan landing: petakan ke terjemahan per id stabil (t() literal,
  // tanpa key dinamis) sebelum diteruskan ke FaqAccordion.
  const featuredFaqs = getFeaturedFaqs().map((item) => {
    switch (item.id) {
      case 'mengenal-apa-itu-ezrab':
        return { ...item, question: t('landing.faq_mengenal-apa-itu-ezrab_q'), answer: t('landing.faq_mengenal-apa-itu-ezrab_a') };
      case 'mengenal-siapa-pengguna':
        return { ...item, question: t('landing.faq_mengenal-siapa-pengguna_q'), answer: t('landing.faq_mengenal-siapa-pengguna_a') };
      case 'rab-membantu-membuat':
        return { ...item, question: t('landing.faq_rab-membantu-membuat_q'), answer: t('landing.faq_rab-membantu-membuat_a') };
      case 'ai-apa-itu-magic-ai':
        return { ...item, question: t('landing.faq_ai-apa-itu-magic-ai_q'), answer: t('landing.faq_ai-apa-itu-magic-ai_a') };
      case 'ai-langsung-diterapkan':
        return { ...item, question: t('landing.faq_ai-langsung-diterapkan_q'), answer: t('landing.faq_ai-langsung-diterapkan_a') };
      case 'ahsp-2026':
        return { ...item, question: t('landing.faq_ahsp-2026_q'), answer: t('landing.faq_ahsp-2026_a') };
      case 'qto-hitung-volume':
        return { ...item, question: t('landing.faq_qto-hitung-volume_q'), answer: t('landing.faq_qto-hitung-volume_a') };
      case 'akun-sudah-dibuka':
        return { ...item, question: t('landing.faq_akun-sudah-dibuka_q'), answer: t('landing.faq_akun-sudah-dibuka_a') };
      case 'keamanan-acuan-final':
        return { ...item, question: t('landing.faq_keamanan-acuan-final_q'), answer: t('landing.faq_keamanan-acuan-final_a') };
      default:
        return item;
    }
  });

  return (
    <div className="ezai-scope" ref={scopeRef}>
      <section className="ezai-sec"><div className="grid-bg"></div><div className="glow" style={{width: '560px', height: '560px', background: 'rgba(37,99,235,.15)', top: '-160px', left: '50%', transform: 'translateX(-50%)'}}></div>
      <div className="wrap center" style={{position: 'relative'}}>
      <span className="eyebrow"> {t('landing.hero_eyebrow')}</span>
      <h2>{t('landing.hero_title_a')} <span className="bl">{t('landing.hero_title_b')}</span></h2>
      <p className="sub">{t('landing.hero_sub')}</p>
      <div className="pillars" style={{textAlign: 'left'}}>
      <div className="pillar"><div className="mini-scene"><svg viewBox="0 0 200 76" style={{width: '100%', height: '100%'}}><rect x="8" y="6" width="184" height="64" fill="#fff" stroke="#33506E" strokeWidth="3"/><path d="M84,6 V44 M8,44 H192 M132,44 V70" stroke="#33506E" strokeWidth="3" fill="none"/><rect x="96" y="16" width="30" height="16" fill="#EFF4FB" stroke="#B9CBDF"/><rect x="20" y="50" width="34" height="14" fill="#EFF4FB" stroke="#B9CBDF"/></svg><div className="beam-mini"></div></div><h3>DED Estimate AI</h3><p>{t('landing.pillar_ded_desc')}</p><ul><li>{t('landing.pillar_ded_bullet1')}</li><li>{t('landing.pillar_ded_bullet2')}</li><li>{t('landing.pillar_ded_bullet3')}</li></ul><div className="go">{t('landing.pillar_ded_go')}</div></div>
      <div className="pillar"><div className="mini-scene col"><div className="mbub u">{t('landing.pillar_chat_q')}</div><div className="mbub a">{t('landing.pillar_chat_a_pre')}<b>Rp56.784/m²</b>{t('landing.pillar_chat_a_post')}</div><div className="mbub u" style={{animationDelay: '1.4s'}}>{t('landing.chat_quick_calc')}</div></div><h3>Ezrab Chat AI</h3><p>{t('landing.pillar_chat_desc')}</p><ul><li>{t('landing.pillar_chat_bullet1')}</li><li>{t('landing.pillar_chat_bullet2')}</li><li>{t('landing.pillar_chat_bullet3')}</li></ul><div className="go">{t('landing.pillar_chat_go')}</div></div>
      <div className="pillar"><div className="mini-scene col" style={{gap: '8px'}}><div style={{display: 'flex', alignItems: 'center', gap: '7px'}}><span className="pdfchip">PDF</span><b style={{fontSize: '12px', color: '#0A2540'}}>{t('landing.pillar_doc_mini')}</b></div><div className="line" style={{animationDelay: '.2s'}}></div><div className="line" style={{animationDelay: '.5s', width: '88%'}}></div><div className="line" style={{animationDelay: '.8s', width: '60%'}}></div></div><h3>AI Document</h3><p>{t('landing.pillar_doc_desc')}</p><ul><li>{t('landing.pillar_doc_bullet1')}</li><li>{t('landing.pillar_doc_bullet2')}</li><li>{t('landing.pillar_doc_bullet3')}</li></ul><div className="go">{t('landing.pillar_doc_go')}</div></div>
      </div></div></section>

      <section className="ezai-sec" id="ded" style={{paddingTop: '30px'}}><div className="wrap"><div className="split">
      <div><span className="eyebrow"> DED Estimate AI</span>
      <h2>{t('landing.ded_title_a')}<span className="bl">{t('landing.ded_title_b')}</span></h2>
      <p className="sub">{t('landing.ded_sub')}</p>
      <div className="steps">
      <div className="step"><div className="n">1</div><div><b>{t('landing.ded_step1_title')}</b><p>{t('landing.ded_step1_desc')}</p></div></div>
      <div className="step"><div className="n">2</div><div><b>{t('landing.ded_step2_title')}</b><p>{t('landing.ded_step2_desc')}</p></div></div>
      <div className="step"><div className="n">3</div><div><b>{t('landing.ded_step3_title')}</b><p>{t('landing.ded_step3_desc')}</p></div></div>
      </div></div>
      <div><div className="win"><div className="win-head"><span className="dot" style={{background: '#F87171'}}></span><span className="dot" style={{background: '#FBBF24'}}></span><span className="dot" style={{background: '#34D399'}}></span><span className="win-title">{t('landing.ded_win_title')}</span></div><div className="sim sim-ded" style={{borderRadius: '0 0 19px 19px', overflow: 'hidden'}}>
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
      <text x="102" y="42">{t('landing.ded_room_living')}</text><text x="262" y="104">{t('landing.ded_room_bed')}</text><text x="80" y="172">{t('landing.ded_room_kitchen')}</text><text x="202" y="172">{t('landing.ded_room_bath')}</text><text x="292" y="140" fontSize="9">{t('landing.ded_room_terrace')}</text>
      </g>
      </svg>
      <div className="pstat"><span>{t('landing.ded_plan_label')}</span><span className="pctstack"><span>{t('landing.ded_scan_24')}</span><span>{t('landing.ded_scan_57')}</span><span>{t('landing.ded_scan_86')}</span><span>{t('landing.ded_scan_done')}</span></span></div>
      <div className="pbar"><i></i></div>
      </div>
      <div className="resbox simfade12">
      <div className="rhead"><b>{t('landing.ded_result_title')}</b><span className="cnt">{t('landing.ded_result_count')}</span></div>
      <div className="rrow" style={{animationDelay: '5s'}}><span style={{flex: '1'}}>{t('landing.ded_item_foundation')}</span><span className="rv">12,40 m³</span><span className="chip ai">{t('landing.ded_chip_ai')}</span></div>
      <div className="rrow" style={{animationDelay: '5.8s'}}><span style={{flex: '1'}}>{t('landing.ded_item_wall')}</span><span className="rv">96,20 m²</span><span className="chip ai">{t('landing.ded_chip_ai')}</span></div>
      <div className="rrow" style={{animationDelay: '6.6s'}}><span style={{flex: '1'}}>{t('landing.ded_item_plaster')}</span><span className="rv">192,40 m²</span><span className="chip ok">{t('landing.ded_chip_official')}</span></div>
      <div className="rrow" style={{animationDelay: '7.4s'}}><span style={{flex: '1'}}>{t('landing.ded_item_ceramic')}</span><span className="rv">84,00 m²</span><span className="chip ai">{t('landing.ded_chip_ai')}</span></div>
      <div className="rrow" style={{animationDelay: '8.2s'}}><span style={{flex: '1'}}>{t('landing.ded_item_paint')}</span><span className="rv">210,50 m²</span><span className="chip ai">{t('landing.ded_chip_ai')}</span></div>
      {/* D-05: dulu <button> tanpa onClick — tampak aktif tapi tidak
          berbuat apa-apa. Tidak ada alur nyata yang bermakna dari
          ilustrasi landing ini (tanpa konteks proyek; demo terkunci
          kode), jadi tombol diganti krom mockup non-interaktif:
          <span> ber-aria-hidden, bukan <button>, kursor default. */}
      <span className="btn ctaglow mock-btn" aria-hidden="true" style={{width: '100%', justifyContent: 'center', marginTop: '4px'}}>{t('landing.ded_cta')}</span>
      <p style={{fontSize: '11px', color: '#8498AF', marginTop: '9px', lineHeight: '1.5'}}>{t('landing.ded_step3_desc')}</p>
      </div>
      <div className="ring ringDed"></div>
      <div className="cur curDed"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 3 L19 12 L12.5 13.5 L9.5 20 Z" fill="#0A2540" stroke="#fff" strokeWidth="1.6"/></svg></div>
      </div></div><div className="demo-note">{t('landing.demo_note')}</div></div>
      </div></div></section>

      <section className="ezai-sec" id="chat" style={{paddingTop: '30px'}}><div className="grid-bg"></div><div className="wrap"><div className="split rev">
      <div><div className="win"><div className="win-head"><span className="dot" style={{background: '#F87171'}}></span><span className="dot" style={{background: '#FBBF24'}}></span><span className="dot" style={{background: '#34D399'}}></span><span className="win-title">{t('landing.chat_win_title')}</span></div><div className="sim" style={{borderRadius: '0 0 19px 19px', overflow: 'hidden'}}>
      <div className="simchat">
      <div className="msgs simfade14" style={{display: 'flex', flexDirection: 'column', gap: '9px'}}>
      <div className="bub u anim-bub" style={{animationDuration: '14s'}}>{t('landing.chat_q1')}</div>
      <div className="bub a typing" style={{animationDuration: '14s', animationDelay: '.9s'}}><i></i><i></i><i></i></div>
      <div className="bub a anim-bub" style={{animationDuration: '14s', animationDelay: '2.6s'}}>{t('landing.chat_a_intro')}
      <div className="dcard">
      <div className="dr"><span>{t('landing.chat_label_code')}</span><b>3.7.4</b></div>
      <div className="dr"><span>{t('landing.chat_item_plaster')}</span><b>Rp56.784/m²</b></div>
      <div style={{marginTop: '6px'}}><span className="src">{t('landing.chat_source')}</span></div>
      </div></div>
      <div className="quickrow anim-bub" style={{animationDuration: '14s', animationDelay: '5.6s'}}><span className="qchip chipGlow">{t('landing.chat_quick_calc')}</span><span>{t('landing.chat_quick_audit')}</span><span>{t('landing.chat_quick_search')}</span></div>
      <div className="bub u anim-bub" style={{animationDuration: '14s', animationDelay: '7.6s'}}>{t('landing.chat_q2')}</div>
      <div className="bub a typing2" style={{animationDelay: '1.2s'}}><i></i><i></i><i></i></div>
      <div className="bub a anim-bub" style={{animationDuration: '14s', animationDelay: '9.9s'}}>{t('landing.chat_a2_intro')}
      <table className="mtab">
      <tr><td>{t('landing.ded_item_wall')}</td><td>96,20 m²</td></tr>
      <tr><td>{t('landing.ded_item_plaster')}</td><td>192,40 m²</td></tr>
      </table>
      <p style={{fontSize: '12px', color: '#5A718C', marginTop: '7px'}}>{t('landing.chat_note')}</p>
      <span className="abtn">{t('landing.chat_cta')}</span></div>
      </div>
      <div className="composer"><span className="ct">{t('landing.chat_composer')}<span className="caret"></span></span><span className="sendb">↑</span></div>
      </div>
      <div className="ring ringChat"></div>
      <div className="cur curChat"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 3 L19 12 L12.5 13.5 L9.5 20 Z" fill="#0A2540" stroke="#fff" strokeWidth="1.6"/></svg></div>
      </div><div className="demo-note">{t('landing.demo_note')}</div></div></div>
      <div><span className="eyebrow"> Ezrab Chat AI</span>
      <h2>{t('landing.chat_title_a')}<span className="bl">{t('landing.chat_title_b')}</span></h2>
      <p className="sub">{t('landing.chat_sub')}</p>
      <div className="steps">
      <div className="step"><div className="n">1</div><div><b>{t('landing.chat_step1_title')}</b><p>{t('landing.chat_step1_desc')}</p></div></div>
      <div className="step"><div className="n">2</div><div><b>{t('landing.chat_step2_title')}</b><p>{t('landing.chat_step2_desc')}</p></div></div>
      <div className="step"><div className="n">3</div><div><b>{t('landing.chat_step3_title')}</b><p>{t('landing.chat_step3_desc')}</p></div></div>
      </div></div>
      </div></div></section>

      <section className="ezai-sec" id="dokumen" style={{paddingTop: '30px'}}><div className="wrap"><div className="split">
      <div><span className="eyebrow"> AI Document</span>
      <h2>{t('landing.doc_title_a')}<span className="bl">{t('landing.doc_title_b')}</span></h2>
      <p className="sub">{t('landing.doc_sub')}</p>
      <div className="steps">
      <div className="step"><div className="n">1</div><div><b>{t('landing.doc_step1_title')}</b><p>{t('landing.doc_step1_desc')}</p></div></div>
      <div className="step"><div className="n">2</div><div><b>{t('landing.doc_step2_title')}</b><p>{t('landing.doc_step2_desc')}</p></div></div>
      <div className="step"><div className="n">3</div><div><b>{t('landing.doc_step3_title')}</b><p>{t('landing.doc_step3_desc')}</p></div></div>
      </div></div>
      <div><div className="win"><div className="win-head"><span className="dot" style={{background: '#F87171'}}></span><span className="dot" style={{background: '#FBBF24'}}></span><span className="dot" style={{background: '#34D399'}}></span><span className="win-title">{t('landing.doc_win_title')}</span></div><div className="sim simdoc" style={{borderRadius: '0 0 19px 19px', overflow: 'hidden'}}>
      <div className="docpage simfade12">
      <div className="lh"><img src={logoImg} alt="" /><div><b>CV. BERKAH KONSTRUKSI</b><span>Jl. Raya Pembangunan No. 88 — Probolinggo, Jawa Timur</span></div></div>
      <h4>{t('landing.doc_letter_title')}</h4>
      <p className="meta">{t('landing.doc_meta_no')}<br/>{t('landing.doc_meta_to')}<br/>{t('landing.doc_meta_re')}</p>
      <div className="line" style={{animationDelay: '.2s'}}></div>
      <div className="line" style={{animationDelay: '.55s', width: '92%'}}></div>
      <div className="line" style={{animationDelay: '.9s', width: '64%'}}></div>
      <table className="dtab">
      <tr><th>{t('landing.doc_th_desc')}</th><th>{t('landing.doc_th_amount')}</th></tr>
      <tr><td style={{animationDelay: '3.4s'}}>{t('landing.doc_row1')}</td><td style={{animationDelay: '3.4s'}}>Rp148.500.000</td></tr>
      <tr><td style={{animationDelay: '4.2s'}}>{t('landing.doc_row2')}</td><td style={{animationDelay: '4.2s'}}>Rp96.750.000</td></tr>
      <tr><td style={{animationDelay: '5s'}}>{t('landing.doc_row3')}</td><td style={{animationDelay: '5s'}}>Rp72.300.000</td></tr>
      <tr className="tot"><td style={{animationDelay: '5.8s'}}>{t('landing.doc_total')}</td><td style={{animationDelay: '5.8s'}}>Rp317.550.000</td></tr>
      </table>
      <div className="sign">{t('landing.doc_sign_open')}
      <div className="stamp">BERKAH<br/>KONSTRUKSI</div>
      <div><svg className="scrib" width="92" height="30" viewBox="0 0 90 30"><path d="M4 22 C 18 4, 30 28, 44 12 S 74 8, 86 16" stroke="#33506E" fill="none" strokeWidth="2" strokeLinecap="round"/></svg></div>
      <b style={{color: '#0A2540'}}>Ir. B. Prasetyo</b><br/>{t('landing.doc_sign_role')}</div>
      </div>
      <div className="docside simfade12">
      <b style={{fontSize: '13.5px', color: '#0A2540'}}>{t('landing.doc_side_title')}</b>
      <div className="chk" style={{animationDelay: '2.2s'}}><span className="ck">✓</span><span>{t('landing.doc_chk1')}</span></div>
      <div className="chk" style={{animationDelay: '3s'}}><span className="ck">✓</span><span>{t('landing.doc_chk2')}</span></div>
      <div className="chk" style={{animationDelay: '3.8s'}}><span className="ck">✓</span><span>{t('landing.doc_chk3')}</span></div>
      <p style={{fontSize: '11.5px', color: '#8498AF', lineHeight: '1.55'}}>{t('landing.doc_side_note')}</p>
      {/* D-05: sama seperti di atas — krom mockup, bukan tombol. */}
      <span className="btn dlGlow mock-btn" aria-hidden="true" style={{justifyContent: 'center', marginTop: 'auto', width: '100%'}}>{t('landing.doc_download')}</span>
      </div>
      <div className="ring ringDoc"></div>
      <div className="cur curDoc"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 3 L19 12 L12.5 13.5 L9.5 20 Z" fill="#0A2540" stroke="#fff" strokeWidth="1.6"/></svg></div>
      </div></div>
      <div className="demo-note">{t('landing.demo_note')}</div></div></div>
      <div className="half2">
      <div className="mini" id="smart-rab"><img className="mini-img" src={logoImg} alt="" /><h3>Smart RAB</h3><p>{t('landing.pillar_smartrab_desc')}</p></div>
      <div className="mini"><img className="mini-img" src={mascotImg} alt="" /><h3>Co Assistant</h3><p>{t('landing.pillar_coasst_desc')}</p></div>
      </div></div></section>

      <section className="ezai-sec" id="asisten">
      <div className="grid-bg"></div>
      <div className="wrap">
      <div className="split">
      <div>
      <span className="eyebrow">{t('landing.asst_eyebrow')}</span>
      <h2>{t('landing.asst_title_a')} <span className="bl">{t('landing.asst_title_b')}</span></h2>
      <p className="sub">{t('landing.asst_sub')}</p>
      <div className="steps">
      <div className="step"><span className="n">1</span><div><b>{t('landing.asst_step1_t')}</b><p>{t('landing.asst_step1_d')}</p></div></div>
      <div className="step"><span className="n">2</span><div><b>{t('landing.asst_step2_t')}</b><p>{t('landing.asst_step2_d')}</p></div></div>
      <div className="step"><span className="n">3</span><div><b>{t('landing.asst_step3_t')}</b><p>{t('landing.asst_step3_d')}</p></div></div>
      </div>
      </div>
      <div style={{position: 'relative'}}>
      <img className="mascot-hero" src={mascotFullbody} alt="Maskot EZRAB" />
      <div className="win">
      <div className="win-head"><span className="dot" style={{background: '#F87171'}}></span><span className="dot" style={{background: '#FBBF24'}}></span><span className="dot" style={{background: '#34D399'}}></span><span className="win-title">{t('landing.asst_win_title')}</span></div>
      <div className="sim" style={{borderRadius: '0 0 19px 19px', overflow: 'hidden'}}>
      <div className="asst">
      <div className="msgs simfade12" style={{display: 'flex', flexDirection: 'column', gap: '9px'}}>
      <div className="ahead"><img src={mascotImg} alt="" /><div><b style={{fontSize: '14px', color: '#0A2540', display: 'block'}}>{t('landing.asst_header')}</b><span className="on">{t('landing.asst_online')}</span></div></div>
      <div className="bub u anim-bub" style={{animationDuration: '12s'}}>{t('landing.asst_u1')}</div>
      <div className="bub a anim-bub" style={{animationDuration: '12s', animationDelay: '2.4s'}}>{t('landing.asst_a1')}{' '}<b>{t('landing.asst_project')}</b>.
      <div className="acard"><span style={{fontWeight: '800'}}>✓</span><span>{t('landing.asst_nav_done')}</span></div></div>
      <div className="bub u anim-bub" style={{animationDuration: '12s', animationDelay: '5.8s'}}>{t('landing.asst_u2')}</div>
      <div className="bub a anim-bub" style={{animationDuration: '12s', animationDelay: '8.2s'}}>{t('landing.asst_a2')}{' '}{t('landing.asst_project')}:
      <div className="dcard"><div className="bigamt">Rp317.550.000</div><p style={{fontSize: '12px', color: '#5A718C', marginTop: '4px'}}>{t('landing.asst_a2_note')}</p></div></div>
      <div className="quickrow anim-bub" style={{animationDuration: '12s', animationDelay: '10.2s'}}><span>{t('landing.asst_chip1')}</span><span>{t('landing.asst_chip2')}</span><span>{t('landing.asst_chip3')}</span></div>
      </div>
      <div className="composer"><span className="ct">{t('landing.asst_composer')}<span className="caret"></span></span><span className="sendb">↑</span></div>
      </div>
      <div className="ring ringAsst"></div>
      <div className="cur curAsst"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 3 L19 12 L12.5 13.5 L9.5 20 Z" fill="#0A2540" stroke="#fff" strokeWidth="1.6"/></svg></div>
      </div>
      </div>
      <div className="demo-note">{t('landing.demo_note')}</div>
      </div>
      </div>
      </div>
      </section>


      <section className="ezai-sec" id="perkakas" style={{paddingTop: '26px'}}><div className="wrap">
      <div className="center"><span className="eyebrow"> {t('landing.bento_eyebrow')}</span>
      <h2 style={{fontSize: '32px'}}>{t('landing.bento_title_a')} <span className="bl">{t('landing.bento_title_b')}</span></h2></div>
      <div className="bento">
      {/* D-07: tiap tile punya id sendiri — tautan footer Produk kini
          menunjuk ke tile yang sesuai, bukan semuanya ke #perkakas. */}
      <div className="tile" id="kalkulator-volume"><div className="motif"><div className="keys"><i></i><i></i><i></i><i></i><i className="hot"></i><i></i><i></i><i></i><i></i></div></div><b>{t('landing.bento_calc_t')}</b><p>{t('landing.bento_calc_d')}</p></div>
      <div className="tile" id="ahsp-2026"><div className="motif col2"><i className="brow" style={{width: '72%'}}></i><i className="brow" style={{width: '54%', animationDelay: '.5s'}}></i><i className="brow" style={{width: '64%', animationDelay: '1s'}}></i></div><b>{t('landing.bento_ahsp_t')}</b><p>{t('landing.bento_ahsp_d')}</p></div>
      <div className="tile" id="spreadsheet-rab"><div className="motif"><div className="sgrid"><i></i><i></i><i></i><i></i><i></i><i className="hl"></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div><b>{t('landing.bento_sheet_t')}</b><p>{t('landing.bento_sheet_d')}</p></div>
      <div className="tile" id="kurva-s"><div className="motif"><svg width="120" height="44" viewBox="0 0 120 44"><path className="scurve" d="M6 38 C 40 36, 52 30, 66 20 S 100 6, 114 5" stroke="#2563EB" strokeWidth="3" fill="none" strokeLinecap="round"/><line x1="6" y1="40" x2="114" y2="40" stroke="#D7E3F2" strokeWidth="2"/></svg></div><b>{t('landing.bento_curve_t')}</b><p>{t('landing.bento_curve_d')}</p></div>
      <div className="tile"><div className="motif"><div className="sheet">↓ PDF</div></div><b>{t('landing.bento_export_t')}</b><p>{t('landing.bento_export_d')}</p></div>
      </div></div></section>

      <section className="ezai-sec" style={{paddingTop: '10px'}}><div className="wrap">
      <div className="center"><h2 style={{fontSize: '32px'}}>{t('landing.honest_title_a')} <span className="bl">{t('landing.honest_title_b')}</span></h2>
      <p className="sub">{t('landing.honest_sub')}</p></div>
      <div className="honest">
      <div className="hcard"><div className="hnum">01</div><div><b>{t('landing.honest_1_t')}</b><p>{t('landing.honest_1_d')}</p></div></div>
      <div className="hcard"><div className="hnum">02</div><div><b>{t('landing.honest_2_t')}</b><p>{t('landing.honest_2_d')}</p></div></div>
      <div className="hcard"><div className="hnum">03</div><div><b>{t('landing.honest_3_t')}</b><p>{t('landing.honest_3_d')}</p></div></div>
      </div></div></section>

      <section className="ezai-sec" id="harga" style={{paddingTop: '20px'}}><div className="grid-bg"></div><div className="wrap" style={{position: 'relative'}}>
      <div className="center"><span className="eyebrow"> {t('landing.price_eyebrow')}</span>
      <h2>{t('landing.price_title_a')} <span className="bl">{t('landing.price_title_b')}</span></h2>
      <p className="sub" style={{margin: '0 auto'}}>{t('landing.price_sub')}</p></div>
      <PricingCards onOpenAuth={onOpenAuth} />
      <p className="cmp-link"><button type="button" className="btn soft" onClick={() => onOpenPricing?.()}>{t('landing.price_compare')}</button></p>
      <p className="demo-note" style={{textAlign: 'center'}}>{t('landing.price_sim_note')}</p>
      </div></section>

      <section className="ezai-sec" id="faq" style={{paddingTop: '16px'}}><div className="wrap">
      <div className="center"><span className="eyebrow">{t('landing.faqsec_eyebrow')}</span><h2 style={{fontSize: '32px'}}>{t('landing.faqsec_title_a')} <span className="bl">{t('landing.faqsec_title_b')}</span></h2></div>
      <div style={{maxWidth: '860px', margin: '34px auto 0'}}><FaqAccordion items={featuredFaqs} idPrefix="home-faq" /></div>
      <div className="center" style={{marginTop: '26px'}}><button type="button" className="btn" onClick={() => onOpenFaq?.()}>{t('landing.faqsec_all')}</button></div>
      <div className="cta-box" style={{marginTop: '132px'}}><img className="mascot-cta" src={mascotSitting} alt="Maskot EZRAB" /><span className="eyebrow" style={{background: 'rgba(255,255,255,.14)', borderColor: 'rgba(255,255,255,.3)', color: '#DCEBFF'}}> {t('landing.cta_eyebrow')}</span>
      <h2>{t('landing.cta_ai_title_a')}<br/>{t('landing.cta_ai_title_b')}</h2>
      <p className="sub" style={{margin: '0 auto 30px', color: '#C9DCF7'}}>{t('landing.cta_ai_sub')}</p>
      <div style={{display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap'}}><button className="btn" style={{background: '#fff', color: '#1E40AF'}} onClick={onOpenDemo}>{t('landing.cta_demo')}</button><button className="btn ghost" onClick={() => onOpenAuth('daftar')}>{t('landing.cta_daftar_gratis')}</button></div></div>
      </div></section>
      <footer className="ezai-footer"><div className="wrap"><div className="fgrid">
      <div><div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px'}}><img src={logoImg} alt="Logo EZRAB" style={{width: '38px', height: '38px', borderRadius: '9px', objectFit: 'cover'}} /><b style={{margin: '0', fontSize: '16px'}}>EZRAB</b></div>
      <p style={{fontSize: '13.5px', lineHeight: '1.65', color: '#5F7694', maxWidth: '300px'}}>{t('landing.foot_desc')}</p></div>
      <div><b>{t('landing.foot_ai')}</b><a href="#ded">DED Estimate AI</a><a href="#chat">Ezrab Chat AI</a><a href="#dokumen">AI Document</a><a href="#smart-rab">Smart RAB</a></div>
      <div><b>{t('landing.foot_product')}</b><a href="#kalkulator-volume">Kalkulator Volume</a><a href="#ahsp-2026">AHSP 2026</a><a href="#spreadsheet-rab">Spreadsheet RAB</a><a href="#kurva-s">Kurva S</a></div>
      <div><b>{t('landing.foot_company')}</b><a href="#harga">{t('landing.foot_price')}</a><a href="#faq">{t('landing.foot_faq')}</a><a href="/privacy" onClick={(e) => { e.preventDefault(); navigateTo('/privacy'); window.scrollTo({ top: 0 }); }}>{t('landing.foot_privacy')}</a><a href="/terms" onClick={(e) => { e.preventDefault(); navigateTo('/terms'); window.scrollTo({ top: 0 }); }}>{t('landing.foot_terms')}</a><button type="button" onClick={() => onOpenAuth('masuk')}>{t('landing.foot_login')}</button>
      <button type="button" onClick={() => onOpenAuth('daftar')}>{t('landing.foot_signup')}</button></div>
      </div>
      <div className="fbot"><span>{t('landing.foot_copyright')}</span><span>ezrab.site</span></div>
      </div></footer>
    </div>
  );
};
