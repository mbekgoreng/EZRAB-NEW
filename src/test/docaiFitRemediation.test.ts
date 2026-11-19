/**
 * DOCAI FIT REMEDIATION — Child 5 (2026-11-19).
 *
 * Membuktikan perbaikan muat-viewport halaman AI Document (temuan Child 4):
 * bar tab tidak lagi terjepit, kelompok konteks default-tertutup kecuali
 * Identitas Proyek, header empty-state + pagehead dipadatkan, toggle
 * perluas textarea bekerja di semua tinggi, strip kunci satu baris, field
 * isian template pindah ke kolom compose, dan kompresi diperluas ke
 * 881–900px (inversi 1440×900).
 *
 * Asersi tingkat sumber (string) + satu cek fungsional (derivasi teks
 * singkat strip dari pesan dinamis featureGate). Plain-tsx (pola
 * docaiCreatorContextRedesign.test.ts, check()) — BUKAN vitest.
 * Jalankan: npx --yes tsx src/test/docaiFitRemediation.test.ts
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// Mock localStorage untuk node (impor featureGate/plans aman).
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aiFeatureLockedMessage } from '../ai-credits/featureGate';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const count = (s: string, sub: string) => s.split(sub).length - 1;

async function main() {
  const css = read('../ai-tools/document-ai/document-ai.css');
  const view = read('../ai-tools/document-ai/view.tsx');
  const creator = read('../ai-tools/document-ai/components/DocCreator.tsx');
  const ctx = read('../ai-tools/document-ai/components/DocContextPanel.tsx');

  console.log('\n[1] Tab squish — .docai-tabs tidak boleh menyusut:');
  const tabsRule = css.match(/\.docai-tabs \{[^}]*\}/);
  check('aturan dasar .docai-tabs ditemukan', !!tabsRule);
  check('.docai-tabs { flex-shrink: 0 }', !!tabsRule && tabsRule[0].includes('flex-shrink: 0'));
  check('awalan aturan tab tetap (pin Child 2)', css.includes('.docai-tabs { display: flex; gap: 6px;') && css.includes('margin-bottom: 16px;'));

  console.log('\n[2] Tombol bantuan gabung ke bar tab (baris 38px hilang):');
  /* Re-baseline 2026-11-19 (bar tab tunggal, perintah owner): <nav> kini
     memakai className template literal (modifier docai-tabs-merged saat
     sub-tampilan tampil) — pin disesuaikan, help-row tetap wajib di dalam nav. */
  const iNavOpen = view.indexOf('<nav className={`docai-tabs');
  const iNavClose = view.indexOf('</nav>');
  const iHelp = view.indexOf('className="docai-help-row"');
  check('help-row berada DI DALAM <nav> tab', iNavOpen > -1 && iNavClose > iNavOpen && iHelp > iNavOpen && iHelp < iNavClose);
  check('div help-row tersendiri sudah tidak ada', !view.includes('<div className="docai-help-row">'));
  check('TutorialHelpButton tetap dirender di view', view.includes('<TutorialHelpButton tutorialId="dokumen-ai"'));
  const helpRule = css.match(/\.docai-help-row \{[^}]*\}/);
  check('.docai-help-row = item nav ujung kanan', !!helpRule && helpRule[0].includes('margin-left: auto') && helpRule[0].includes('flex-shrink: 0'));

  console.log('\n[3] Kelompok konteks default-tertutup SEMUA (v3):');
  /* Re-baseline 2026-11-19 (v3, mockup di-ACC owner): pengecualian
     Identitas dihapus — semua kelompok default tertutup. */
  check('init collapsed menutup semua kelompok', ctx.includes('init[g.id] = true') && !ctx.includes("if (g.id !== 'identitas')"));
  check('kelompok Lainnya default tertutup', ctx.includes("lainnya: true"));
  check('init all-open lama sudah tidak ada', !ctx.includes('useState<Record<string, boolean>>({})'));
  check('hitungan per kelompok tetap dirender', ctx.includes('{groupAvailable} / {g.rows.length} tersedia'));
  /* Re-baseline 2026-11-19 (v3): indikator dipendekkan "18/22 tersedia". */
  check('indikator kelengkapan tetap dari state nyata', ctx.includes('{available.length}/{fields.length} tersedia'));
  check('toggle kelompok tetap ada (aria-expanded)', ctx.includes('aria-expanded={!shut}'));

  /* Re-baseline 2026-11-19 (v3, mockup di-ACC owner): hero + subjudul
     pagehead DIHAPUS dari layar buat — pin lama (pemadatan h3/p,
     pagehead-sub, disclosure DRAF, petunjuk cakupan) dibalik menjadi
     pin ketiadaan. Draf tetap berlabel DRAF di editor/riwayat. */
  console.log('\n[4] Header empty-state + pagehead DIHAPUS (v3):');
  check('.docai-edempty h3 DIHAPUS (v3)', !css.includes('.docai-edempty h3 { font-size: 14px; margin: 4px 0 2px; }'));
  check('.docai-edempty > p DIHAPUS (v3)', !css.includes('.docai-edempty > p { font-size: 13px; margin-bottom: 8px; }'));
  check('pagehead-sub DIHAPUS dari creator (v3)', !creator.includes('className="docai-pagehead-sub"'));
  check('CSS pagehead-sub DIHAPUS (v3)', !css.includes('.docai-pagehead p.docai-pagehead-sub { font-size: 12.5px; margin-top: 2px; }'));
  check('pengungkapan DRAF di layar buat DIHAPUS (v3)', !creator.includes("t('ai.doc.create.sub')"));
  check('petunjuk cakupan DIHAPUS (v3)', !creator.includes('Dokumen bebas berbasis AI (surat, berita acara, laporan).'));
  check('hero h3/p DIHAPUS dari empty state (v3)', !creator.includes("<h3>{t('ai.doc.create.ed_empty_h')}</h3>") && !creator.includes("<p>{t('ai.doc.create.ed_empty_p')}</p>"));

  /* Re-baseline 2026-11-19 (v3): toggle perluas DIHAPUS — textarea kini
     120px secara default; pin lama dibalik menjadi pin ketiadaan. */
  console.log('\n[5] Toggle perluas textarea DIHAPUS — textarea 120px default (v3):');
  check('override expanded DIHAPUS (v3)', !css.includes('.docai-edform .docai-textarea.is-expanded { height: auto; }'));
  check('creator tanpa class is-expanded (v3)', !creator.includes('is-expanded'));
  check('rows tetap 5, tanpa toggle (v3)', creator.includes('rows={5}') && !creator.includes('instrExpanded'));
  check('tombol perluas/ciutkan DIHAPUS (v3)', !creator.includes('Perluas kolom') && !creator.includes('Ciutkan kolom'));
  check('steprow DIHAPUS (v3)', !creator.includes('className="docai-steprow"') && !css.includes('.docai-steprow { display: flex;'));
  check('textarea grid field tidak terkunci 78px', css.includes('.docai-fieldgrid .docai-textarea { height: auto; }'));

  console.log('\n[6] Strip kunci satu baris (batasan + MODE DEMO terlihat):');
  check('strip memakai class oneline', creator.includes('className="docai-lockstrip-oneline"'));
  check('baris singkat + wadah pesan lengkap ada', creator.includes('docai-lockstrip-short') && creator.includes('docai-lockstrip-full'));
  check('CSS strip oneline ada', css.includes('.docai-lockstrip-oneline .docai-lockstrip-short') && css.includes('.docai-lockstrip-oneline .docai-lockstrip-full'));
  check('teks singkat diturunkan dari pesan dinamis', creator.includes("docAiLockedMsg.split('. ')") && creator.includes("split(' — ')[0]"));
  check('creator TIDAK menghardcode penanda demo (pin Child 3)', !creator.includes('MODE DEMO'));
  check('pesan lengkap tetap dirender (di balik Detail)', creator.includes('{docAiLockedMsg}'));
  check('tombol Detail/Sembunyikan ada', creator.includes("'Sembunyikan' : 'Detail'") || creator.includes("? 'Sembunyikan' : 'Detail'"));
  check('strip tetap role=alert + Lock 14 + padding pin', creator.includes('role="alert"') && creator.includes('<Lock size={14}') && creator.includes("padding: '8px 10px'"));
  /* Replikasi derivasi creator (kalimat pertama + kepala kalimat terakhir)
     untuk membuktikan teks singkatnya sama dengan yang dirender. */
  const deriveShort = (msg: string) => {
    const p = msg.split('. ');
    return `${p[0]} — ${p[p.length - 1].split(' — ')[0]}`;
  };
  const shortStarter = deriveShort(aiFeatureLockedMessage('starter', 'ai-document'));
  check('derivasi Starter = teks brief', shortStarter === 'AI Document tidak tersedia untuk paket Starter — MODE DEMO', shortStarter);
  const shortFree = deriveShort(aiFeatureLockedMessage('free', 'ai-document'));
  check('derivasi Free menyebut paket + MODE DEMO', shortFree === 'AI Document tidak tersedia untuk paket Free (Gratis) — MODE DEMO', shortFree);

  console.log('\n[7] Field isian template di kolom compose (pilih → isi → generate):');
  const iCompose = creator.indexOf('<div className="docai-col-compose">');
  const iContext = creator.indexOf('<div className="docai-col-context">');
  const iFill = creator.indexOf('{templateFillFields}');
  check('satu situs render fieldgrid (fragmen bersama)', count(creator, '<div className="docai-fieldgrid">') === 1);
  check('fragmen dirender di kolom compose', iCompose > -1 && iContext > iCompose && iFill > iCompose && iFill < iContext);
  check('fragmen tepat sebelum tombol generate', iFill > -1 && iFill < creator.indexOf('Buat Draf dengan AI'));
  check('TIDAK ada fieldgrid di kolom konteks', !creator.slice(iContext).includes('docai-fieldgrid'));
  check('detail template read-only tetap di kolom konteks', iContext < creator.indexOf('docai-tmpldetail'));
  check('label langkah isi field ada', creator.includes('Isi field template'));
  check('subjenis + field satu grid (digabung)', creator.includes('const templateFillFields'));
  check('kartu katalog dipadatkan (padding 10/12)', css.includes('.docai-tmpl { text-align: left; padding: 10px 12px;'));
  check('kartu maks. 3 baris struktur', creator.includes('previewFor(tmpl.id).slice(0, 3)'));

  console.log('\n[8] Jembatan kompresi 881–900px (inversi 1440×900):');
  check('blok 880 dipertahankan (pin Child 2)', css.includes('@media (max-height: 880px)'));
  check('blok jembatan 881–900 ada', css.includes('@media (min-height: 881px) and (max-height: 900px) {'));
  /* Re-baseline 2026-11-19 (v3): textarea lega 120px di kedua blok. */
  check('textarea 120px ada di kedua blok', count(css, '.docai-edform .docai-textarea { height: 120px; min-height: 100px; }') === 2);
  check('padding kartu kompak ada di kedua blok', count(css, '.docai-edempty { padding: 12px 20px; }') === 2);
  check('input dipadatkan pada kompresi', css.includes('.docai-input { padding: 8px 11px; }'));
  /* Re-baseline 2026-11-19 (bar tab tunggal): klausa .docai-subbtn dihapus —
     aturan itu ikut terhapus bersama baris subnav lama; identitas trim kini
     dipin lewat tabs + step. */
  check('trim Round 2 identik di kedua blok', count(css, '.docai-tabs { margin-bottom: 8px; }') === 2 && count(css, '.docai-step { margin-bottom: 5px; }') === 2);
  check('trim Round 2 seksi akhir', css.includes('.docai-edform .docai-select.docai-full { margin-bottom: 6px; }') && css.includes('.docai-edform .docai-runbtn { margin-top: 0; }'));

  console.log('\n[9] Penjaga pin Child 2/3 (tidak ada regresi string):');
  check('.docai-pagehead margin 14px tetap', css.includes('.docai-pagehead { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px;'));
  check('.docai-col-context sticky tetap', css.includes('.docai-col-context { position: sticky; top: 12px; }'));
  check('grid workspace tepat sekali', count(creator, '<div className="docai-workspace-2col">') === 1);
  check('kolom compose + konteks masing-masing sekali', count(creator, '<div className="docai-col-compose">') === 1 && count(creator, '<div className="docai-col-context">') === 1);
  check('tombol generate tidak terduplikasi', count(creator, 'docai-btn-primary docai-runbtn') === 1);
  check('panel konteks tidak terduplikasi', count(creator, '<DocContextPanel') === 1);
  check('gerbang generate tidak berubah', creator.includes("if (!docAiAllowed && createMode === 'ai') { setError(docAiLockedMsg); return; }"));

  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) { console.log('GAGAL:', failures.join(' | ')); process.exit(1); }
  console.log('SEMUA TEST DOCAI FIT REMEDIATION LOLOS');
}

void main();
