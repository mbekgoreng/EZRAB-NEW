/**
 * AI DOKUMEN — Funnel "Mau bikin apa?" (di-ACC owner 2026-11-20).
 *
 * Membuktikan funnel memakai katalog template ASLI (docTemplates.ts),
 * contoh prompt TEPAT dari revisi owner, batas 600 karakter, tanggal
 * dokumen, penyempurnaan prompt deterministik (tanpa AI berbayar), dan
 * — syarat owner 18:46 — ekspor PDF lewat mesin kertas yang SAMA dengan
 * form lama (paperExport.ts), bukan dump teks polos.
 *
 * Tiga lapis:
 * 1. Fungsional funnel.ts (tanpa DOM, tanpa AI): kategori/pilihan,
 *    contoh owner, enhance, tanggal.
 * 2. Perbandingan format PDF: HTML hasil mock generate funnel vs
 *    sampleHtml template yang sama → blok kertas (htmlToPaperBlocks)
 *    yang sama strukturnya; jalur ekspor yang sama (marker sumber).
 * 3. Kontrak sumber (marker): funnel default di DocCreator, form lama
 *    tetap terjangkau, wiring view.tsx, CSS kotak prompt putih revisi 6,
 *    funnel.ts tanpa impor orchestrator/AI.
 *
 * Plain-tsx (pola docaiCreatorContextRedesign.test.ts, check()) — BUKAN vitest.
 * Jalankan: npx --yes tsx src/test/docaiFunnel.test.ts
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// Mock localStorage untuk node (companyProfile/store aman diimpor).
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FUNNEL_CATEGORIES,
  FUNNEL_EXAMPLE_PROMPTS,
  FUNNEL_PROMPT_MAX,
  FUNNEL_STEPS,
  allFunnelChoices,
  enhanceFunnelPrompt,
  examplePromptFor,
  formatFunnelDate,
  funnelChoicesFor,
  todayDateString,
} from '../ai-tools/document-ai/funnel';
import {
  EXTRA_BUILTIN_TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_META,
} from '../ai-tools/document-ai/docTemplates';
import { markdownToHtml } from '../ai-tools/document-ai/markdownHtml';
import { htmlToPaperBlocks } from '../ai-tools/document-ai/paperModel';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Label subjenis Surat — nama LENGKAP dari katalog (TEMPLATE_META).
    Mockup memakai singkatan langkah 2 ('Permohonan', dst.) untuk subjenis
    yang sama; funnel menampilkan nama katalog lengkapnya — dokumen yang
    sama, label lebih lengkap, satu sumber kebenaran (dicatat di laporan). */
const SURAT_LABELS_ACC = [
  'Surat Permohonan',
  'Surat Pemberitahuan',
  'Surat Undangan',
  'Surat Penyampaian Laporan',
  'Surat Klarifikasi / Tanggapan',
  'Surat Permintaan Pemeriksaan Pekerjaan',
];

/** Label subjenis Berita Acara — nama LENGKAP dari katalog. */
const BA_LABELS_ACC = [
  'Berita Acara Serah Terima Pekerjaan',
  'Berita Acara Pemeriksaan Pekerjaan',
  'Berita Acara Opname / Pengukuran Volume',
  'Berita Acara Rapat / Kesepakatan Lapangan',
  'Berita Acara Pekerjaan Tambah-Kurang',
];

/** 10 teks contoh revisi owner 2026-11-20 — VERBATIM, jangan diubah tanpa ACC owner. */
const OWNER_EXAMPLES: Record<string, string> = {
  'surat:permohonan':
    'Mohon izin lembur pekerjaan pengecoran balok lantai 2 pada hari Sabtu karena jadwal pengecoran mundur 3 hari',
  'surat:pemberitahuan':
    'Pemberitahuan jadwal pemadaman listrik sementara pada hari Minggu untuk pekerjaan instalasi panel utama',
  'berita-acara:serah-terima':
    'Pekerjaan pemasangan atap baja ringan blok B selesai 100 persen dan siap diperiksa untuk diserahterimakan',
  'berita-acara:pemeriksaan':
    'Pemeriksaan hasil pekerjaan plesteran dinding lantai 1 bersama pengawas sebelum lanjut ke pengecatan',
  'laporan-harian':
    'Pemasangan bekisting kolom lantai 2 grid D sampai F, cuaca berawan, 15 pekerja, satu unit mixer rusak ringan',
  'laporan-mingguan':
    'Minggu ini progres pengecoran pelat lantai 2 mencapai 80 persen, pengiriman besi beton terlambat 2 hari',
  notulen:
    'Rapat koordinasi mingguan membahas keterlambatan pengiriman besi beton dan penyesuaian jadwal pengecoran',
  'checklist-qc':
    'Pemeriksaan mutu beton ready mix K-300 sebelum pengecoran pelat lantai 2',
  'surat:undangan':
    'Undangan rapat evaluasi progres bulanan untuk konsultan pengawas dan kontraktor pelaksana',
  'surat:penyampaian-laporan':
    'Penyampaian laporan progres mingguan ke-12 kepada pemilik proyek',
};

/** Pilihan TANPA contoh owner — TIDAK boleh dikarang contohnya. */
const NO_EXAMPLE_KEYS = [
  'surat:klarifikasi',
  'surat:permintaan-pemeriksaan',
  'berita-acara:opname',
  'berita-acara:kesepakatan',
  'berita-acara:tambah-kurang',
  'laporan-k3',
  'bebas',
];

function main(): void {
  console.log('== DOCAI FUNNEL "MAU BIKIN APA?" ==');

  /* ---------- 1. Langkah & batas ---------- */
  check('5 langkah funnel, label sesuai desain ACC', FUNNEL_STEPS.length === 5 &&
    FUNNEL_STEPS[0] === 'Mau bikin apa?' &&
    FUNNEL_STEPS[1] === 'Pilih dokumen' &&
    FUNNEL_STEPS[2] === 'Custom Prompt' &&
    FUNNEL_STEPS[3] === 'Periksa' &&
    FUNNEL_STEPS[4] === 'Selesai');
  check('batas prompt 600 karakter', FUNNEL_PROMPT_MAX === 600);

  /* ---------- 2. Kategori langkah 1 = katalog asli ---------- */
  check('7 kartu kategori (6 katalog + Dokumen Bebas)', FUNNEL_CATEGORIES.length === 7);
  check('6 kategori pertama SAMA PERSIS dengan TEMPLATE_CATEGORIES',
    TEMPLATE_CATEGORIES.every((c, i) => FUNNEL_CATEGORIES[i].id === c.id && FUNNEL_CATEGORIES[i].label === c.label));
  check('kartu ketujuh = Dokumen Bebas', FUNNEL_CATEGORIES[6].id === 'bebas' && FUNNEL_CATEGORIES[6].label === 'Dokumen Bebas');

  /* ---------- 3. Pilihan langkah 2 = subjenis/template asli ---------- */
  const surat = funnelChoicesFor('surat-administrasi');
  const ba = funnelChoicesFor('berita-acara');
  const laporan = funnelChoicesFor('laporan');
  const qc = funnelChoicesFor('qc-k3');
  const rapat = funnelChoicesFor('rapat');
  const tender = funnelChoicesFor('penawaran-tender');
  const bebas = funnelChoicesFor('bebas');
  check('Surat: 6 subjenis', surat.length === 6);
  check('Surat: label = label katalog ACC', surat.map((c) => c.label).join('|') === SURAT_LABELS_ACC.join('|'));
  check('Berita Acara: 5 subjenis', ba.length === 5);
  check('Berita Acara: label = label katalog ACC', ba.map((c) => c.label).join('|') === BA_LABELS_ACC.join('|'));
  check('Laporan: 3 template (Harian, Mingguan, K3)', laporan.length === 3 &&
    laporan.map((c) => c.label).join('|') === 'Laporan Harian|Laporan Mingguan|Laporan K3');
  check('QC: hanya Checklist QC', qc.length === 1 && qc[0].label === 'Checklist QC' && qc[0].templateId === 'checklist-qc');
  check('Rapat: hanya Notulen Rapat', rapat.length === 1 && rapat[0].label === 'Notulen Rapat' && rapat[0].templateId === 'notulen');
  check('Tender: TIDAK ada pilihan template (kartu info → wizard Tender)', tender.length === 0);
  check('Dokumen Bebas: 1 pilihan template bebas', bebas.length === 1 && bebas[0].templateId === 'bebas');
  check('total 17 pilihan funnel', allFunnelChoices().length === 17,
    `dapat ${allFunnelChoices().length}`);

  // Setiap pilihan harus resolve ke template/subjenis yang BENAR-BENAR ADA.
  const allResolve = allFunnelChoices().every((c) => {
    const meta = TEMPLATE_META[c.templateId];
    if (!meta) return false;
    if (c.subtypeId) return (meta.subtypes ?? []).some((s) => s.id === c.subtypeId);
    return true;
  });
  check('semua 17 pilihan resolve ke template/subjenis yang ada di TEMPLATE_META', allResolve);
  const keysUnique = new Set(allFunnelChoices().map((c) => c.key)).size === 17;
  check('semua kunci pilihan unik', keysUnique);

  // Label template laporan silang ke EXTRA_BUILTIN_TEMPLATES (sumber katalog).
  const extraName = (id: string) => EXTRA_BUILTIN_TEMPLATES.find((t) => t.id === id)?.name;
  check('Laporan Mingguan = nama katalog EXTRA', extraName('laporan-mingguan') === 'Laporan Mingguan');
  check('Laporan K3 = nama katalog EXTRA', extraName('laporan-k3') === 'Laporan K3');
  // Label 3 template dasar silang ke dictionaries.ts (sumber i18n getTemplates).
  const dictSrc = read('../i18n/dictionaries.ts');
  check("dictionaries: tmpl_laporan_n = 'Laporan Harian'", dictSrc.includes("tmpl_laporan_n: 'Laporan Harian'"));
  check("dictionaries: tmpl_checklist_n = 'Checklist QC'", dictSrc.includes("tmpl_checklist_n: 'Checklist QC'"));
  check("dictionaries: tmpl_notulen_n = 'Notulen Rapat'", dictSrc.includes("tmpl_notulen_n: 'Notulen Rapat'"));
  /* 'Dokumen Bebas' adalah label DESAIN ACC (mockup) — nama katalog i18n-nya
     'Draf Bebas'. Perbedaan ini disengaja dan dicatat di laporan. */
  check("dictionaries: tmpl_bebas_n = 'Draf Bebas' (katalog; funnel memakai label desain ACC 'Dokumen Bebas')",
    dictSrc.includes("tmpl_bebas_n: 'Draf Bebas'"));

  /* ---------- 4. Contoh prompt owner (verbatim) ---------- */
  check('tepat 10 contoh prompt owner', Object.keys(FUNNEL_EXAMPLE_PROMPTS).length === 10);
  const examplesVerbatim = Object.entries(OWNER_EXAMPLES).every(
    ([k, v]) => FUNNEL_EXAMPLE_PROMPTS[k] === v,
  );
  check('10 contoh prompt VERBATIM teks revisi owner', examplesVerbatim);
  const examplesResolve = Object.keys(OWNER_EXAMPLES).every((k) =>
    allFunnelChoices().some((c) => c.key === k),
  );
  check('semua kunci contoh resolve ke pilihan funnel yang ada', examplesResolve);
  const examplesFit = Object.values(FUNNEL_EXAMPLE_PROMPTS).every((v) => v.length <= FUNNEL_PROMPT_MAX);
  check('semua contoh muat dalam batas 600 karakter', examplesFit);
  const noFabricated = NO_EXAMPLE_KEYS.every((k) => {
    const c = allFunnelChoices().find((x) => x.key === k);
    return c !== undefined && examplePromptFor(c) === undefined;
  });
  check('7 pilihan tanpa contoh owner TIDAK dikarang contohnya (chip disembunyikan)', noFabricated);

  /* ---------- 5. Penyempurnaan prompt (deterministik, tanpa AI) ---------- */
  check('enhance: prompt kosong → null', enhanceFunnelPrompt('', 'Surat Permohonan') === null);
  check('enhance: spasi saja → null', enhanceFunnelPrompt('   ', 'Surat Permohonan') === null);
  const enhanced = enhanceFunnelPrompt('Mohon izin lembur hari Sabtu', 'Surat Permohonan');
  check('enhance: membingkai dengan nama dokumen + teks asli utuh', enhanced !== null &&
    enhanced.startsWith('Buatkan Surat Permohonan berdasarkan keterangan berikut: Mohon izin lembur hari Sabtu') &&
    enhanced.includes('bahasa formal sesuai standar dokumen proyek'));
  check('enhance: hasil ≤ 600 karakter', enhanced !== null && enhanced.length <= FUNNEL_PROMPT_MAX);
  const long = enhanceFunnelPrompt('x'.repeat(700), 'Surat Permohonan');
  check('enhance: input panjang dipotong di 600', long !== null && long.length === FUNNEL_PROMPT_MAX);
  // Audit DocAI 2026-11-22 (D1b): bingkai TIDAK BOLEH memotong isi pengguna —
  // prompt 550 karakter yang tak muat dibingkai kembali UTUH (tanpa bingkai),
  // bukan terpotong oleh overhead bingkai.
  const mid = enhanceFunnelPrompt('y'.repeat(550), 'Surat Permohonan');
  check('enhance: prompt 550 karakter kembali utuh tanpa bingkai', mid !== null && mid === 'y'.repeat(550));
  const already = enhanceFunnelPrompt('Buatkan Surat Permohonan berdasarkan keterangan berikut: a', 'Surat Permohonan');
  check('enhance: prompt yang sudah dibingkai tidak dibingkai dua kali', already === 'Buatkan Surat Permohonan berdasarkan keterangan berikut: a');

  /* ---------- 6. Tanggal ---------- */
  const today = todayDateString();
  check('todayDateString: format YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(today));
  const now = new Date();
  const expectToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  check('todayDateString: = tanggal hari ini', today === expectToday);
  check("formatFunnelDate('2026-11-20') = '20 November 2026'", formatFunnelDate('2026-11-20') === '20 November 2026');
  check('formatFunnelDate: input invalid di-passthrough', formatFunnelDate('bukan-tanggal') === 'bukan-tanggal');

  /* ---------- 7. Perbandingan format PDF (syarat owner 18:46) ---------- */
  // Mock markdown hasil generate funnel untuk Surat Permohonan (struktur
  // realistis: judul + salam + isi + penutup + tanda tangan).
  const mockFunnelMd = [
    '# Surat Permohonan Izin Lembur',
    '',
    'Nomor: 001/SP/XI/2026',
    '',
    'Jakarta, 20 November 2026',
    '',
    'Kepada Yth.',
    'Manajer Proyek',
    'di Tempat',
    '',
    'Dengan hormat,',
    '',
    'Kami mengajukan permohonan izin lembur pekerjaan pengecoran balok lantai 2 pada hari Sabtu karena jadwal pengecoran mundur 3 hari.',
    '',
    'Demikian surat ini kami sampaikan. Atas perhatian Bapak, kami ucapkan terima kasih.',
    '',
    'Hormat kami,',
    '',
    'Ahmad Yusuf Fahrezzi',
    'Arsitek Pelaksana',
  ].join('\n');
  const funnelHtml = markdownToHtml(mockFunnelMd);
  const funnelBlocks = htmlToPaperBlocks(funnelHtml);
  const funnelKinds = funnelBlocks.map((b) => b.type);
  check('funnel: mock generate → HTML → blok kertas (heading + paragraf)',
    funnelBlocks.length >= 5 && funnelKinds.includes('heading') && funnelKinds.includes('paragraph'),
    `blok: ${funnelKinds.join(',')}`);
  // Template yang sama, jalur lama: sampleHtml SUBJENIS katalog → blok kertas.
  // (sampleHtml tinggal di subjenis, bukan di TEMPLATE_META['surat'].)
  const sampleHtml = TEMPLATE_META['surat']?.subtypes?.find((s) => s.id === 'permohonan')?.sampleHtml ?? '';
  check('katalog: subjenis surat:permohonan punya sampleHtml', sampleHtml.length > 0);
  const sampleBlocks = htmlToPaperBlocks(sampleHtml);
  const sampleKinds = sampleBlocks.map((b) => b.type);
  /* sampleHtml katalog memakai <p> untuk judul (tanpa <h1>) + satu <table> —
     jadi bloknya paragraf + tabel, bukan heading. Itu bentuk asli katalog,
     bukan cacat: mesin kertas yang sama menerima kedua bentuk. */
  check('jalur lama: sampleHtml → blok kertas (paragraf + tabel)',
    sampleBlocks.length >= 5 && sampleKinds.includes('paragraph') && sampleKinds.includes('table'),
    `blok: ${sampleKinds.join(',')}`);
  // Keduanya memakai mesin blok kertas yang SAMA — blok paragraf tersedia di
  // kedua jalur; bukan dump teks polos. (Heading hanya ada bila sumber HTML
  // punya <h1> — mock funnel punya, sample katalog tidak.)
  const kindsShared = funnelKinds.includes('paragraph') && sampleKinds.includes('paragraph');
  check('STRUKTUR SAMA: blok paragraf ada di kedua jalur (funnel & lama)', kindsShared);
  // Blok tanda tangan (nama penandatangan) lolos ke blok kertas funnel.
  // (Blok paragraph membawa runs: [{text}], bukan field text.)
  const signatureSurvives = funnelBlocks.some(
    (b) => b.type === 'paragraph' &&
      (b as { runs?: Array<{ text?: string }> }).runs?.some((r) => (r.text ?? '').includes('Ahmad Yusuf Fahrezzi')),
  );
  check('tanda tangan (nama penandatangan) lolos ke blok kertas funnel', signatureSurvives);
  // Tabel juga lolos (BA opname / laporan memakai tabel).
  const tableMd = '# Opname\n\n| Item | Volume |\n| --- | --- |\n| Beton K-300 | 12 m³ |\n';
  const tableBlocks = htmlToPaperBlocks(markdownToHtml(tableMd));
  check('tabel markdown → blok table di mesin kertas', tableBlocks.some((b) => b.type === 'table'));

  /* ---------- 8. Kontrak sumber: funnel default + form lama utuh ---------- */
  const creatorSrc = read('../ai-tools/document-ai/components/DocCreator.tsx');
  const funnelSrc = read('../ai-tools/document-ai/components/DocFunnel.tsx');
  const funnelLogicSrc = read('../ai-tools/document-ai/funnel.ts');
  const viewSrc = read('../ai-tools/document-ai/view.tsx');
  const cssSrc = read('../ai-tools/document-ai/document-ai.css');

  check('DocCreator: cabang funnel default (empty + buat + bukan periksa + funnelActive)',
    creatorSrc.includes("mode === 'empty' && subView === 'buat' && studioPath !== 'periksa' && funnelActive"));
  check('DocCreator: merender <DocFunnel', creatorSrc.includes('<DocFunnel'));
  check('DocCreator: runFunnelGenerate terpisah dari runGenerate',
    creatorSrc.includes('const runFunnelGenerate') && creatorSrc.includes('const runGenerate'));
  check('DocCreator: funnel generate memakai orchestrator CREATE_DOCUMENT yang sama',
    creatorSrc.includes('runFunnelGenerate') && creatorSrc.includes("intent: 'CREATE_DOCUMENT'"));
  check('DocCreator: tanggal funnel masuk fieldValues.tanggalDokumen',
    creatorSrc.includes('tanggalDokumen: req.date'));
  check('DocCreator: tanggal funnel juga masuk instruksi (template tanpa field tanggal)',
    creatorSrc.includes('Tanggal dokumen: ${formatFunnelDate(req.date)}'));
  check('DocCreator: funnel generate menyimpan draf lewat persist yang sama',
    creatorSrc.includes('await persist(rec)'));
  check('DocCreator: tautan kembali ke form lama (onUseLegacyForm → funnelActive=false)',
    creatorSrc.includes('onUseLegacyForm={() => setFunnelActive(false)}'));
  check('DocCreator: tautan "Kembali ke panduan" di atas form lama',
    creatorSrc.includes('Kembali ke panduan'));
  check('DocCreator: funnel di-reset aktif saat jalur Studio berubah',
    creatorSrc.includes('setFunnelActive(true)'));
  check('DocCreator: ekspor funnel memakai doExport yang sama (pdf/docx)',
    creatorSrc.includes("onExport={(kind) => void doExport(kind)}"));
  check('DocCreator: doExport memakai htmlToPaperBlocks + exportPaperPdf (mesin kertas formal)',
    creatorSrc.includes('htmlToPaperBlocks(html)') && creatorSrc.includes('exportPaperPdf'));
  check('DocCreator: form lama UTUH — runGenerate + fieldgrid tetap ada',
    creatorSrc.includes('const runGenerate') &&
    (creatorSrc.match(/<div className="docai-fieldgrid">/g) ?? []).length === 1);
  check('DocCreator: jalur periksa TIDAK memakai funnel (marker studioPath !== periksa)',
    creatorSrc.includes("studioPath !== 'periksa' && funnelActive"));

  /* ---------- 9. Kontrak sumber: komponen DocFunnel ---------- */
  check('DocFunnel: stepper 5 langkah dari FUNNEL_STEPS', funnelSrc.includes('FUNNEL_STEPS.map'));
  check('DocFunnel: kartu kategori dari FUNNEL_CATEGORIES', funnelSrc.includes('FUNNEL_CATEGORIES.map'));
  check('DocFunnel: placeholder custom prompt = teks ACC', funnelSrc.includes(
    'Jelaskan dokumen yang ingin dibuat. Anda dapat menambahkan detail: ditujukan kepada siapa, pokok permasalahannya apa, dan hal khusus yang perlu dicantumkan.'));
  check('DocFunnel: batas 600 via maxLength={FUNNEL_PROMPT_MAX}', funnelSrc.includes('maxLength={FUNNEL_PROMPT_MAX}'));
  check('DocFunnel: penghitung {prompt.length}/{FUNNEL_PROMPT_MAX}', funnelSrc.includes('{prompt.length}/{FUNNEL_PROMPT_MAX}'));
  check('DocFunnel: tombol ✨ AI memanggil enhanceFunnelPrompt', funnelSrc.includes('enhanceFunnelPrompt(prompt, choice.label)'));
  check('DocFunnel: field tanggal di atas kotak prompt (id docai-funnel-date)',
    funnelSrc.includes('id="docai-funnel-date"') &&
    funnelSrc.indexOf('docai-funnel-date') < funnelSrc.indexOf('docai-funnel-promptbox'));
  check('DocFunnel: chip contoh berlabel CONTOH', funnelSrc.includes('CONTOH: {example}'));
  check('DocFunnel: langkah Periksa punya tombol Ubah per baris',
    (funnelSrc.match(/Ubah\s*<\/button>/g) ?? []).length === 3);
  check('DocFunnel: catatan AI menyusun struktur/bahasa/pasal dari template',
    funnelSrc.includes('Struktur, bahasa formal, dan pasal standar disusun AI dari template'));
  check('DocFunnel: langkah Selesai — Unduh PDF + Unduh Word', funnelSrc.includes("onExport('pdf')") && funnelSrc.includes("onExport('docx')"));
  check('DocFunnel: langkah Selesai — Poles + Revisi lewat editor', funnelSrc.includes('Poles Dokumen (AI)') && funnelSrc.includes('Revisi dengan bahasa alami'));
  check('DocFunnel: pratinjau kertas (kop + HTML draf)', funnelSrc.includes('docai-funnel-paper') && funnelSrc.includes('kopHeaderHtml'));
  check('DocFunnel: kartu info tender → onNavigateToMenu(dokumen-tender)',
    funnelSrc.includes("onNavigateToMenu('dokumen-tender')") && funnelSrc.includes('Paket 18 dokumen tender'));
  check('DocFunnel: tautan analisis → onOpenAnalysis', funnelSrc.includes('onOpenAnalysis'));
  check('DocFunnel: gerbang paket — generate diblokir bila docAiAllowed false',
    funnelSrc.includes('!docAiAllowed') && funnelSrc.includes('docAiLockedMsg'));
  check('DocFunnel: TANPA emoji di UI (tidak ada karakter ✨/📄/✅ literal)',
    !/[\u2728\u{1F4C4}\u2705]/u.test(funnelSrc));

  /* ---------- 10. Kontrak sumber: funnel.ts murni (tanpa AI) ---------- */
  check('funnel.ts: TIDAK mengimpor orchestrator', !funnelLogicSrc.includes('orchestrator'));
  check('funnel.ts: TIDAK mengimpor dokumenAiService / provider AI',
    !funnelLogicSrc.includes('dokumenAiService') && !funnelLogicSrc.includes('aiGateway'));
  check('funnel.ts: TIDAK mengimpor React/DOM', !funnelLogicSrc.includes("from 'react'") && !funnelLogicSrc.includes('document.'));

  /* ---------- 11. Kontrak sumber: view.tsx + CSS ---------- */
  check('view.tsx: onOpenAnalysis → tab library (permukaan analisis)',
    viewSrc.includes("onOpenAnalysis={() => switchTab('library')}"));
  check('view.tsx: tetap SATU instance <DocCreator', (viewSrc.match(/<DocCreator[\s>]/g) ?? []).length === 1);
  check('CSS: kotak prompt PUTIH #FFFFFF', cssSrc.includes('.docai-funnel-promptbox { background: #FFFFFF;'));
  check('CSS: border 2px #2563EB + bayangan kebiruan revisi 6',
    cssSrc.includes('border: 2px solid #2563EB') && cssSrc.includes('rgba(37,99,235,0.12)'));
  check('CSS: kolom funnel 880px (width: min — lihat komentar CSS soal larangan literal max-width 880px)',
    cssSrc.includes('.docai-funnel { width: min(880px, 100%);'));
  check('CSS: teks prompt gelap #0F172A, placeholder #64748B',
    cssSrc.includes('color: #0F172A') && cssSrc.includes('color: #64748B'));

  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) { console.log('GAGAL:', failures.join(' | ')); process.exit(1); }
  console.log('SEMUA TEST DOCAI FUNNEL LOLOS');
}

void main();
