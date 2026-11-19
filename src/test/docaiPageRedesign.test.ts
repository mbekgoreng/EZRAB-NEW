/**
 * docaiPageRedesign.test — AI DOCUMENT FULL-PAGE REDESIGN, Child 2
 * (page structure), 2026-11-19.
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/docaiPageRedesign.test.ts`
 *
 * Yang dibuktikan (asersi tingkat sumber — tidak ada render browser):
 * 1. Keenam tab utama tetap terdefinisi dengan id & label yang sama.
 * 2. Semua destinasi sekunder tetap ada (sub-view Studio, mode analisis,
 *    pemilih profil, modeline mode buat).
 * 3. Kontrak kolom dua-kolom ada di CSS dengan proporsi spek
 *    (compose 55–60%, konteks 40–45%) + penumpukan di ≤900px.
 * 4. Batas lebar konten berbasis keterbacaan, bukan kartu sempit lama:
 *    shell 1440px → none; kartu buat 880px → none; form 720px → none;
 *    lebar kertas A4 210mm & cap paragraf 760px TIDAK berubah (disengaja).
 * 5. Tidak ada hack `overflow-x: hidden` yang diperkenalkan.
 * 6. Perilaku state tab dipertahankan (default, switchTab, disable
 *    analisis tanpa dokumen, instance DocCreator tunggal per jalur Studio).
 * 7. Judul halaman tidak lagi digandakan di dalam section (crumb
 *    "AI Document / EZRAB AI Dokumen" dihapus dari panel milik Child 2).
 * 8. Semua breakpoint yang sudah ada tetap dipertahankan.
 *
 * Yang TIDAK dibuktikan di sini (milik Child 3 / koordinator):
 * penerapan class .docai-workspace-2col di dalam DocCreator.tsx —
 * Child 2 mendefinisikan kontraknya; Child 3 yang merestruktur JSX.
 * Bila Child 3 sudah menerapkannya saat tes ini jalan, asersi 3 tetap
 * lolos karena ia hanya memeriksa definisi CSS, bukan pemakaian.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e: any) {
    failed += 1;
    console.log(`  FAIL ${name}: ${e?.message ?? e}`);
  }
}

async function main(): Promise<void> {
  console.log('docaiPageRedesign:');

  await check('1. keenam tab utama terdefinisi dengan id identik (view.tsx type Tab)', () => {
    const view = read('src/ai-tools/document-ai/view.tsx');
    const m = view.match(/type Tab = ((?:'[^']+'(?: \| )?)+);/);
    assert(m, 'type Tab tidak ditemukan');
    for (const id of ['buat-ai', 'template', 'periksa', 'library', 'analyze', 'history']) {
      assert(m![1].includes(`'${id}'`), `tab '${id}' hilang dari type Tab`);
    }
    assert((m![1].match(/'/g) ?? []).length === 12, 'type Tab harus berisi tepat 6 id');
  });

  await check('2. label tab utama identik (3 literal + 3 kunci i18n + nilai id)', () => {
    const view = read('src/ai-tools/document-ai/view.tsx');
    for (const label of ['Buat dengan AI', 'Gunakan Template', 'Edit & Periksa']) {
      assert(view.includes(`label: '${label}'`), `label literal '${label}' hilang dari bar tab`);
    }
    for (const key of ['ai.doc.tab_library', 'ai.doc.tab_analyze', 'ai.doc.tab_history']) {
      assert(view.includes(`t('${key}')`), `kunci i18n '${key}' hilang dari view.tsx`);
    }
    const dict = read('src/i18n/dictionaries.ts');
    for (const val of ["tab_library: 'Dokumen Saya'", "tab_analyze: 'Analisis Dokumen'", "tab_history: 'Riwayat'"]) {
      assert(dict.includes(val), `nilai kamus id hilang: ${val}`);
    }
  });

  await check('3. pemetaan tab → komponen dipertahankan (termasuk instance DocCreator tunggal)', () => {
    const view = read('src/ai-tools/document-ai/view.tsx');
    assert(view.includes("const STUDIO_TABS: Tab[] = ['buat-ai', 'template', 'periksa'];"), 'STUDIO_TABS berubah');
    assert(view.includes("'buat-ai': 'ai'") && view.includes("template: 'template'") && view.includes("periksa: 'periksa'"), 'STUDIO_PATH berubah');
    assert(view.includes("{tab === 'library' && (") && view.includes('<DocLibrary'), 'library → DocLibrary hilang');
    assert(view.includes("{tab === 'analyze' && activeDoc && (") && view.includes('<DocAnalyzer'), 'analyze → DocAnalyzer hilang');
    assert(view.includes('{STUDIO_TABS.includes(tab) && (') && view.includes('<DocCreator'), 'jalur Studio → DocCreator hilang');
    /* Re-baseline 2026-11-19 (bar tab tunggal): <DocCreator diikuti spasi/>
       adalah elemen JSX; penggunaan tipe useState<DocCreatorSubView> tidak
       ikut dihitung. */
    assert((view.match(/<DocCreator[\s>]/g) ?? []).length === 1, 'DocCreator harus dirender tepat 1× (satu instance per jalur Studio)');
    assert(view.includes("{tab === 'history' && <DocHistory"), 'history → DocHistory hilang');
  });

  await check('4. perilaku state tab dipertahankan (default, switchTab, disable analisis)', () => {
    const view = read('src/ai-tools/document-ai/view.tsx');
    assert(view.includes("useState<Tab>('buat-ai')"), 'tab default bukan buat-ai');
    const sw = view.slice(view.indexOf('const switchTab'));
    assert(sw.includes('setAnalyzerRunRequest(null);'), 'switchTab tidak lagi mengosongkan runRequest');
    assert(sw.includes('setTab(next);'), 'switchTab tidak lagi memanggil setTab');
    assert(view.includes("const disabled = tabItem.id === 'analyze' && !activeDoc;"), 'aturan disable tab analisis berubah');
    assert(view.includes('onClick={() => switchTab(tabItem.id as Tab)}'), 'klik tab tidak lagi lewat switchTab');
  });

  await check('5. destinasi sekunder Studio tetap ada (4 sub-view + 3 panel DocPanels)', () => {
    const creator = read('src/ai-tools/document-ai/components/DocCreator.tsx');
    /* Re-baseline 2026-11-19 (bar tab tunggal, perintah owner): union subView
       pindah dari useState lokal ke tipe ekspor DocCreatorSubView (nilai
       sama persis); label lengkap pindah ke bar tab view.tsx (tooltip).
       'Buat Dokumen' hidup sebagai tooltip klik-ulang tab Studio aktif,
       bukan tombol sub-tampilan sendiri. */
    assert(
      creator.includes("export type DocCreatorSubView = 'buat' | 'tersimpan' | 'template' | 'identitas';"),
      'union subView DocCreator berubah',
    );
    const view = read('src/ai-tools/document-ai/view.tsx');
    for (const label of ['Buat Dokumen', 'Dokumen Tersimpan', 'Template Saya', 'Identitas Perusahaan']) {
      assert(view.includes(label), `sub-view '${label}' hilang dari bar tab view.tsx`);
    }
    assert(creator.includes('<CompanyIdentityPanel'), 'sub-view identitas → CompanyIdentityPanel hilang');
    assert(creator.includes('<MyTemplatesPanel'), 'sub-view template → MyTemplatesPanel hilang');
    assert(creator.includes('<SavedDocsPanel'), 'sub-view tersimpan → SavedDocsPanel hilang');
    const panels = read('src/ai-tools/document-ai/components/DocPanels.tsx');
    assert(panels.includes('export const CompanyIdentityPanel'), 'CompanyIdentityPanel hilang dari DocPanels');
    assert(panels.includes('export const MyTemplatesPanel'), 'MyTemplatesPanel hilang dari DocPanels');
    assert(panels.includes('export const SavedDocsPanel'), 'SavedDocsPanel hilang dari DocPanels');
  });

  await check('6. destinasi sekunder lain tetap ada (5 mode analisis, pemilih profil, modeline)', () => {
    const analyzer = read('src/ai-tools/document-ai/components/DocAnalyzer.tsx');
    assert(
      analyzer.includes("export type AnaTab = 'summary' | 'qa' | 'extract' | 'compare' | 'checklist';"),
      'AnaTab berubah',
    );
    assert(analyzer.includes('export const getTabs'), 'getTabs (dipakai modecard Dokumen Saya) hilang');
    const library = read('src/ai-tools/document-ai/components/DocLibrary.tsx');
    assert(library.includes('docai-modecards'), 'kartu mode analisis di panel Pengaturan Dokumen hilang');
    const panels = read('src/ai-tools/document-ai/components/DocPanels.tsx');
    assert(panels.includes('docai-subnav') && panels.includes('+ Profil Baru'), 'pemilih profil Identitas Perusahaan hilang');
    const creator = read('src/ai-tools/document-ai/components/DocCreator.tsx');
    /* Re-baseline 2026-11-19 (v3, mockup di-ACC owner): label modeline
       dipendekkan — "Buat dengan AI — instruksi dulu" → "Instruksi",
       "Form Template — template dulu" → "Template". */
    assert(creator.includes('docai-modeline') && creator.includes('<Sparkles size={14} /> Instruksi') && creator.includes('<LayoutTemplate size={14} /> Template'), 'modeline mode buat hilang');
  });

  /* Re-baseline 2026-11-19 (v3, mockup di-ACC owner): kontrak kolom
     berubah — rasio fr lama 1.15/0.85 (57,5% / 42,5%) diganti
     minmax(0, 1fr) / 280px: kolom kerja ±70%, rel konteks tetap 280px. */
  await check('7. kontrak kolom dua-kolom ada di CSS dengan proporsi v3 (kerja ±70% / rel 280px)', () => {
    const css = read('src/ai-tools/document-ai/document-ai.css');
    assert(css.includes('.docai-workspace-2col { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 16px; align-items: start; }'), '.docai-workspace-2col v3 (1fr / 280px) tidak ditemukan');
    assert(css.includes('.docai-col-compose'), '.docai-col-compose tidak ditemukan');
    assert(css.includes('.docai-col-context'), '.docai-col-context tidak ditemukan');
    assert(css.includes('.docai-workspace-2col > * { min-width: 0; }'), 'penjaga min-width: 0 anak grid hilang');
  });

  await check('8. kolom menumpuk di ≤900px (breakpoint yang sama dengan .docai-analayout)', () => {
    const css = read('src/ai-tools/document-ai/document-ai.css');
    const idx = css.indexOf('@media (max-width: 900px)');
    assert(idx !== -1, 'breakpoint 900px hilang');
    const tail = css.slice(css.lastIndexOf('@media (max-width: 900px)'));
    assert(tail.includes('.docai-workspace-2col { grid-template-columns: 1fr; }'), 'aturan tumpuk 2-kolom di ≤900px hilang');
    assert(css.includes('.docai-col-context { position: sticky; top: 12px; }'), 'sticky kolom konteks desktop hilang');
  });

  await check('9. lebar konten berbasis keterbacaan — kartu sempit lama dilepas (1440/880/720 → none)', () => {
    const css = read('src/ai-tools/document-ai/document-ai.css');
    const shell = css.match(/\.docai-shell \{[^}]*\}/);
    assert(shell && shell[0].includes('max-width: none'), `.docai-shell masih dibatasi (lama: 1440px): ${shell?.[0] ?? '?'}`);
    const edempty = css.match(/\.docai-edempty \{[^}]*\}/);
    assert(edempty && edempty[0].includes('max-width: none'), `.docai-edempty masih dibatasi (lama: 880px): ${edempty?.[0] ?? '?'}`);
    const edform = css.match(/\.docai-edform \{[^}]*\}/);
    assert(edform && edform[0].includes('max-width: none'), `.docai-edform masih dibatasi (lama: 720px): ${edform?.[0] ?? '?'}`);
    assert(!css.includes('max-width: 1440px') && !css.includes('max-width: 880px'), 'nilai sempit lama 1440px/880px masih ada di CSS');
    // 720px hanya boleh tersisa sebagai breakpoint media query fieldgrid
    // (pra-ada, sah) — bukan sebagai max-width aturan konten.
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const noMedia720 = noComments.replaceAll('@media (max-width: 720px)', '');
    assert(!noMedia720.includes('max-width: 720px'), 'max-width: 720px masih ada sebagai aturan konten');
    console.log('      sebelum → sesudah: shell 1440px → none; kartu buat 880px → none; form 720px → none');
  });

  await check('10. lebar yang disengaja TIDAK berubah (lembar A4 210mm, cap paragraf 760px)', () => {
    const css = read('src/ai-tools/document-ai/document-ai.css');
    assert(css.includes('.docai-page {\n  max-width: 210mm;'), 'lebar kertas A4 210mm berubah (harus tetap — ukuran kertas)');
    assert(css.includes('.docai-studio-sub { margin: 5px 0 0; font-size: 12.5px; color: var(--ez-color-text-muted); line-height: 1.6; max-width: 760px; }'), 'cap keterbacaan .docai-studio-sub 760px berubah');
  });

  await check('11. tidak ada hack overflow-x hidden yang diperkenalkan', () => {
    const css = read('src/ai-tools/document-ai/document-ai.css');
    assert(!css.includes('overflow-x: hidden'), 'overflow-x: hidden ditemukan di document-ai.css');
    const section = css.slice(css.indexOf('PAGE REDESIGN 2026-11-19'));
    const sectionNoComments = section.replace(/\/\*[\s\S]*?\*\//g, '');
    assert(!/overflow\s*:/.test(sectionNoComments), 'blok baru redesign memakai properti overflow');
  });

  await check('12. judul halaman tidak digandakan di section milik Child 2 (crumb dihapus, h2 tetap)', () => {
    const panels = read('src/ai-tools/document-ai/components/DocPanels.tsx');
    assert(!panels.includes('docai-crumb'), 'crumb "AI Document · Paper System" masih ada di DocPanels');
    for (const h2 of ['Identitas Perusahaan', 'Template Saya', 'Dokumen Tersimpan']) {
      assert(panels.includes(h2), `h2 section '${h2}' hilang dari DocPanels`);
    }
    const history = read('src/ai-tools/document-ai/components/DocHistory.tsx');
    assert(!history.includes('docai-crumb'), 'crumb masih ada di DocHistory');
    assert(history.includes("{t('ai.doc.hist.h2')}"), 'h2 Riwayat hilang dari DocHistory');
    // Crumb di DocCreator (milik Child 3) sengaja TIDAK ditegaskan di sini.
  });

  await check('13. bar tab ringkas + state aktif jelas; heading section ringkas', () => {
    const css = read('src/ai-tools/document-ai/document-ai.css');
    assert(css.includes('.docai-tabs { display: flex; gap: 6px;') && css.includes('margin-bottom: 16px;'), '.docai-tabs margin-bottom bukan 16px');
    assert(css.includes('.docai-tabbtn.active { background: var(--ez-color-primary-soft); color: var(--ez-color-primary-hover); box-shadow: inset 0 0 0 1.5px var(--ez-color-primary); }'), 'cincin aktif tab bukan warna primary');
    assert(css.includes('.docai-pagehead { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px;'), '.docai-pagehead margin-bottom bukan 14px');
    assert(css.includes('.docai-pagehead h2 { margin: 0; font-size: 19px;'), '.docai-pagehead h2 bukan 19px');
  });

  await check('14. layout inline view.tsx/DocAnalyzer dipindah ke class CSS bersama', () => {
    const view = read('src/ai-tools/document-ai/view.tsx');
    assert(view.includes('className="docai-help-row"'), 'baris tombol bantuan tidak memakai .docai-help-row');
    assert(view.includes('className="docai-entrybanner"'), 'spanduk entry tidak memakai .docai-entrybanner');
    assert(view.includes('className="docai-entrybanner-prompt"'), 'prompt spanduk tidak memakai .docai-entrybanner-prompt');
    assert(view.includes('className="docai-lockalert"'), 'alert kunci view tidak memakai .docai-lockalert');
    const analyzer = read('src/ai-tools/document-ai/components/DocAnalyzer.tsx');
    assert(analyzer.includes('className="docai-lockalert"'), 'alert kunci analyzer tidak memakai .docai-lockalert');
    const css = read('src/ai-tools/document-ai/document-ai.css');
    for (const cls of ['.docai-help-row', '.docai-entrybanner', '.docai-entrybanner-prompt', '.docai-lockalert']) {
      assert(css.includes(`${cls} {`), `definisi ${cls} hilang dari CSS`);
    }
  });

  await check('15. semua breakpoint yang sudah ada tetap dipertahankan', () => {
    const css = read('src/ai-tools/document-ai/document-ai.css');
    for (const bp of ['@media (max-width: 560px)', '@media (max-width: 640px)', '@media (max-width: 700px)', '@media (max-width: 719px)', '@media (max-width: 720px)', '@media (max-width: 767px)', '@media (max-width: 900px)', '@media (max-width: 1100px)', '@media (max-height: 880px)', '@media print', '@media (prefers-reduced-motion: reduce)']) {
      assert(css.includes(bp), `breakpoint hilang: ${bp}`);
    }
    assert(css.includes('[data-theme="dark"] .docai-kop-preview'), 'override mode gelap hilang');
  });

  await check('16. bar tab tunggal (owner 2026-11-19): sub-tampilan menyatu di satu baris', () => {
    const view = read('src/ai-tools/document-ai/view.tsx');
    const creator = read('src/ai-tools/document-ai/components/DocCreator.tsx');
    const css = read('src/ai-tools/document-ai/document-ai.css');
    // Satu <nav> saja di halaman; sub-tampilan dirender di dalamnya.
    assert((view.match(/<nav/g) ?? []).length === 1, 'harus tepat 1 <nav> di view.tsx');
    assert(view.includes('docai-tabbtn-sub'), 'tombol sub-tampilan hilang dari bar tab');
    for (const lbl of ["label: 'Tersimpan'", "label: 'Template'", "label: 'Identitas'"]) {
      assert(view.includes(lbl), `label sub-tampilan hilang: ${lbl}`);
    }
    /* 'Buat' dilipat ke klik-ulang tab Studio aktif (ukur replika: 10 tombol
       overflow 150px di 1366px) — bukan tombol sub-tampilan sendiri. */
    assert(!view.includes("{ id: 'buat', label:"), "sub-tampilan 'Buat' harus dilipat ke klik-ulang tab Studio, bukan tombol sendiri");
    assert(view.includes("if (next === tab && STUDIO_TABS.includes(next)) setCreatorSubView('buat');"), 'klik-ulang tab Studio tidak lagi kembali ke Buat Dokumen');
    assert(view.includes("'Kembali ke Buat Dokumen'"), 'tooltip kembali-ke-Buat hilang');
    assert(view.includes('STUDIO_TABS.includes(tab) && creatorEmpty'), 'gating sub-tampilan (Studio + empty) hilang');
    assert(view.includes('useState<DocCreatorSubView>'), 'state subView tidak diangkat ke view.tsx');
    assert(view.includes('subView={creatorSubView}') && view.includes('onSubViewChange={setCreatorSubView}') && view.includes('onEmptyChange={setCreatorEmpty}'), 'props subView tidak diteruskan ke DocCreator');
    // Kreator: tanpa state lokal + tanpa baris subnav sendiri.
    assert(!creator.includes("useState<'buat'"), 'state subView lokal masih ada di DocCreator');
    assert(!creator.includes('docai-subnav') && !creator.includes('{subnav}'), 'subnav lama masih dirender di DocCreator');
    assert(creator.includes('subView: DocCreatorSubView') && creator.includes('onSubViewChange: (v: DocCreatorSubView) => void'), 'props subView tidak dideklarasi di DocCreator');
    assert(creator.includes('onEmptyChange?.(mode === \'empty\')'), 'pelaporan mode empty ke view.tsx hilang');
    for (const sv of ["subView === 'identitas'", "subView === 'template'", "subView === 'tersimpan'"]) {
      assert(creator.includes(sv), `cabang sub-tampilan hilang: ${sv}`);
    }
    // CSS: aturan baris gabung ada, aturan subnav lama sudah dihapus.
    assert(css.includes('.docai-tabs-merged {') && css.includes('.docai-tabbtn-sub {'), 'aturan CSS bar tab gabung hilang');
    assert(!css.includes('.docai-subnav {') && !css.includes('.docai-subbtn {'), 'aturan CSS subnav lama masih ada');
  });

  console.log(`\ndocaiPageRedesign: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
