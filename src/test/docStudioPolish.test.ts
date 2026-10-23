/**
 * DOCUMENT STUDIO POLISH — enhance, review kategori/sumber/bahasa, kop penuh,
 * persetujuan, kategori template, dimensi gambar ekspor.
 * Transport AI di-mock; validasi service diuji pada jalur pra-jaringan saja.
 * Pola docStudioEngine (tsx + check()).
 * Jalankan: npx tsx src/test/docStudioPolish.test.ts
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// Mock localStorage untuk node (store.ts / companyProfile.ts)
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};

import { DocumentStudioOrchestrator, type DocAiTransport } from '../ai-tools/document-ai/orchestrator';
import { DokumenAiService, MAX_ENHANCE_SELECTION_CHARS } from '../ai-tools/document-ai/service';
import { ENHANCE_PROMPT_VERSION, DRAFT_PROMPT_VERSION, systemForMode } from '../ai-tools/document-ai/prompt';
import { reviewDocument, summarizeFindings } from '../ai-tools/document-ai/review';
import {
  TEMPLATE_META, EXTRA_BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_BY_ID, resolveTemplate,
} from '../ai-tools/document-ai/docTemplates';
import {
  emptyProfile, kopHtml, kopModeEffective, validateImageFile, validateLogoFile, validateFullKopFile,
  MAX_FULL_KOP_BYTES,
} from '../ai-tools/document-ai/companyProfile';
import { imageSizeFromBytes } from '../ai-tools/document-ai/paperExport';
import { approveDraft, deriveDisplayStatus, type DraftRecord } from '../ai-tools/document-ai/store';
import type { ContextField, DokumenAiChatRequest, DokumenAiChatResponse } from '../ai-tools/document-ai/types';

class MockTransport implements DocAiTransport {
  calls: DokumenAiChatRequest[] = [];
  constructor(private responder: (req: DokumenAiChatRequest) => DokumenAiChatResponse) {}
  async chat(req: DokumenAiChatRequest): Promise<DokumenAiChatResponse> {
    this.calls.push(req);
    return this.responder(req);
  }
}
const ok = (reply: string) => (req: DokumenAiChatRequest): DokumenAiChatResponse => ({ success: true, mode: req.mode, reply });

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function fileOf(bytes: Uint8Array, name: string, type = 'image/png'): File {
  return new File([bytes], name, { type });
}

async function main(): Promise<void> {
  console.log('\n[1] ENHANCE — prompt & validasi service (pra-jaringan):');
  check('ENHANCE_PROMPT_VERSION = doc-enhance-v1', ENHANCE_PROMPT_VERSION === 'doc-enhance-v1');
  check('DRAFT_PROMPT_VERSION tidak berubah', DRAFT_PROMPT_VERSION === 'doc-draft-v2');
  const editorSys = systemForMode('ENHANCE');
  check('system ENHANCE = Professional Document Editor §5', editorSys.includes('EZRAB Professional Document Editor'));
  check('system ENHANCE mempertahankan fakta', editorSys.includes('Pertahankan fakta, angka, nama, tanggal'));
  check('system ENHANCE melarang pengantar panjang', editorSys.includes('Jangan memberikan pengantar panjang'));

  const svc = new DokumenAiService();
  const rNoSel = await svc.chat({ documentText: '', fileName: 'Dokumen', mode: 'ENHANCE' });
  check('ENHANCE tanpa selection → EMPTY_SELECTION', rNoSel.success === false && rNoSel.errorCode === 'EMPTY_SELECTION');
  const rLong = await svc.chat({
    documentText: '', fileName: 'Dokumen', mode: 'ENHANCE',
    selectionText: 'x'.repeat(MAX_ENHANCE_SELECTION_CHARS + 1), transform: 'formal',
  });
  check('ENHANCE selection > 8000 → SELECTION_TOO_LONG', rLong.success === false && rLong.errorCode === 'SELECTION_TOO_LONG');

  console.log('\n[2] ENHANCE_TEXT — orchestrator (mock transport):');
  const tEnh = new MockTransport(ok('Pekerjaan struktur telah diperiksa dan dinyatakan sesuai.'));
  const orcEnh = new DocumentStudioOrchestrator(tEnh);
  const rEnh = await orcEnh.handle({
    intent: 'ENHANCE_TEXT',
    selectionText: 'pekerjaan struktur sudah dicek dan oke',
    transform: 'formal',
    fileName: 'Berita Acara Pemeriksaan',
    documentText: 'SENTINEL-DOKUMEN-UTUH-yang-tidak-boleh-terkirim',
  });
  check('ENHANCE_TEXT sukses', rEnh.success === true);
  check('kandidat = isi reply (rentang saja)', rEnh.content === 'Pekerjaan struktur telah diperiksa dan dinyatakan sesuai.');
  check('mode ENHANCE terpakai', tEnh.calls[0]?.mode === 'ENHANCE');
  check('selectionText diteruskan persis', tEnh.calls[0]?.selectionText === 'pekerjaan struktur sudah dicek dan oke');
  check('transform diteruskan', tEnh.calls[0]?.transform === 'formal');
  check('dokumen utuh TIDAK ikut terkirim', !(JSON.stringify(tEnh.calls[0]) ?? '').includes('SENTINEL-DOKUMEN-UTUH'));
  check('promptVersion enhance tercatat', rEnh.promptVersion === 'doc-enhance-v1');
  check('hasil dinyatakan kandidat belum diterapkan', (rEnh.message ?? '').includes('belum diterapkan'));

  const tEnh2 = new MockTransport(ok('x'));
  const orcEnh2 = new DocumentStudioOrchestrator(tEnh2);
  const rBadTransform = await orcEnh2.handle({ intent: 'ENHANCE_TEXT', selectionText: 'teks', transform: 'acak-acak' });
  check('transform tak dikenal → UNKNOWN_TRANSFORM tanpa panggil transport',
    rBadTransform.success === false && rBadTransform.errorCode === 'UNKNOWN_TRANSFORM' && tEnh2.calls.length === 0);
  const rNoSel2 = await orcEnh2.handle({ intent: 'ENHANCE_TEXT', selectionText: '   ', transform: 'formal' });
  check('selection kosong → EMPTY_SELECTION tanpa panggil transport',
    rNoSel2.success === false && rNoSel2.errorCode === 'EMPTY_SELECTION' && tEnh2.calls.length === 0);
  const rEnhEmpty = await new DocumentStudioOrchestrator(new MockTransport(ok('  '))).handle({
    intent: 'ENHANCE_TEXT', selectionText: 'teks asli', transform: 'ringkas',
  });
  check('reply kosong → EMPTY_RESPONSE (teks asli aman)', rEnhEmpty.success === false && rEnhEmpty.errorCode === 'EMPTY_RESPONSE');
  const tEnhFail = new MockTransport(() => ({ success: false, mode: 'ENHANCE', errorCode: 'TIMEOUT', stage: 'provider:fetch', message: 'timeout' }));
  const rEnhFail = await new DocumentStudioOrchestrator(tEnhFail).handle({
    intent: 'ENHANCE_TEXT', selectionText: 'teks asli', transform: 'sempurnakan',
  });
  check('error provider diteruskan terstruktur', rEnhFail.success === false && rEnhFail.errorCode === 'TIMEOUT');

  console.log('\n[3] REVISE + templateMeta — scaffold ikut prompt revisi:');
  const metaBA = resolveTemplate(TEMPLATE_META['berita-acara']);
  const tRevT = new MockTransport(ok('HASIL REVISI SESUAI TEMPLATE'));
  const rRevT = await new DocumentStudioOrchestrator(tRevT).handle({
    intent: 'REVISE_DOCUMENT', instruction: 'Sesuaikan format dengan template terpilih',
    documentText: 'Isi draf.', templateMeta: metaBA,
  });
  check('REVISE + template sukses', rRevT.success === true);
  check('prompt revisi memuat KERANGKA STRUKTUR template', (tRevT.calls[0]?.prompt ?? '').includes('KERANGKA STRUKTUR'));
  check('prompt revisi memuat PANDUAN KEJUJURAN template', (tRevT.calls[0]?.prompt ?? '').includes('PANDUAN KEJUJURAN ISI'));
  const tRevPlain = new MockTransport(ok('HASIL'));
  await new DocumentStudioOrchestrator(tRevPlain).handle({
    intent: 'REVISE_DOCUMENT', instruction: 'Buat lebih formal', documentText: 'Isi draf.',
  });
  check('REVISE tanpa template → tanpa blok template', !(tRevPlain.calls[0]?.prompt ?? '').includes('KERANGKA STRUKTUR'));

  console.log('\n[4] Review — kategori pada kelas temuan lama:');
  const fIsi = reviewDocument('<h1>Dokumen</h1><p>[ISI: nomor surat]</p>');
  check('[ISI:] → kategori kelengkapan', fIsi.some((f) => f.id.startsWith('rv_isi_') && f.category === 'kelengkapan'));
  const fField = reviewDocument('<h1>Dokumen</h1><p>isi tanpa label wajib</p>', metaBA);
  check('field wajib → kategori kelengkapan', fField.some((f) => f.id.startsWith('rv_field_') && f.category === 'kelengkapan'));
  check('scaffold hilang → kategori struktur', fField.some((f) => f.id.startsWith('rv_scaffold_') && f.category === 'struktur'));
  const fNomor = reviewDocument('<h1>X</h1><p>Nomor: 001/A/2026</p><p>Nomor: 002/A/2026</p>');
  check('inkonsistensi nomor → kategori konsistensi', fNomor.some((f) => f.id.startsWith('rv_nomor_') && f.category === 'konsistensi'));
  const fHead = reviewDocument('paragraf polos tanpa judul sama sekali');
  check('tanpa heading → kategori struktur', fHead.some((f) => f.id.startsWith('rv_heading_') && f.category === 'struktur'));
  check('semua temuan punya kategori valid', [...fIsi, ...fField, ...fNomor, ...fHead].every((f) =>
    ['kelengkapan', 'konsistensi', 'struktur', 'bahasa', 'sumber'].includes(f.category)));

  console.log('\n[5] Review — summarizeFindings:');
  const mixed = reviewDocument('<h1>Dokumen</h1><p>Nomor: 001</p><p>Nomor: 002</p><p>[ISI: tanggal]</p><p>isi</p>', metaBA);
  const sum = summarizeFindings(mixed);
  check('total = jumlah temuan', sum.total === mixed.length);
  check('open = semua (status awal open)', sum.open === mixed.length);
  check('bySeverity menjumlah ke total', sum.bySeverity.high + sum.bySeverity.medium + sum.bySeverity.low === sum.total);
  check('byCategory menjumlah ke total',
    Object.values(sum.byCategory).reduce((a, b) => a + b, 0) === sum.total);
  check('byCategory memuat 5 kategori', Object.keys(sum.byCategory).length === 5);
  check('missingRequired menghitung [ISI:] + field wajib', sum.missingRequired >= 2,
    `missingRequired=${sum.missingRequired}`);
  check('missingRequired = temuan isi+field kategori kelengkapan',
    sum.missingRequired === mixed.filter((f) => f.category === 'kelengkapan' &&
      (f.id.startsWith('rv_isi_') || f.id.startsWith('rv_field_'))).length);
  const sumClosed = summarizeFindings(mixed.map((f, i) => (i === 0 ? { ...f, status: 'checked' as const } : f)));
  check('open berkurang bila status berubah', sumClosed.open === mixed.length - 1);
  const sumEmpty = summarizeFindings([]);
  check('ringkasan kosong aman', sumEmpty.total === 0 && sumEmpty.missingRequired === 0);

  console.log('\n[6] Review — cek bahasa (low, saran keterbacaan):');
  const longSentence = `<h1>Dokumen</h1><p>${'Pekerjaan dilaksanakan dengan memperhatikan seluruh ketentuan teknis yang berlaku pada proyek ini serta mengikuti arahan dari konsultan pengawas dan juga menyesuaikan dengan kondisi lapangan yang berubah setiap hari selama masa pelaksanaan berlangsung hingga selesai seluruhnya tanpa terkecuali bagi semua pihak yang terkait dengan pelaksanaan pekerjaan di lapangan pada setiap tahapan kegiatan proyek ini sampai dengan serah terima pertama.'}</p>`;
  const fLong = reviewDocument(longSentence);
  check('kalimat >45 kata → temuan bahasa low', fLong.some((f) => f.id.startsWith('rv_kalimat_') && f.category === 'bahasa' && f.severity === 'low'));
  const fDup = reviewDocument('<h1>Dokumen</h1><p>Hasil pemeriksaan yang yang dilakukan kemarin.</p>');
  check('kata berulang "yang yang" → temuan bahasa', fDup.some((f) => f.id.startsWith('rv_kataganda_') && f.category === 'bahasa'));
  const fCleanLang = reviewDocument('<h1>Dokumen</h1><p>Kalimat pendek dan jelas. Tidak ada pengulangan kata di sini.</p>');
  check('teks bersih → tanpa temuan bahasa', !fCleanLang.some((f) => f.category === 'bahasa'));

  console.log('\n[7] Review — cek sumber (hanya dengan contextFields):');
  const ctxFields: ContextField[] = [
    { fieldName: 'totalNilaiRab', value: '850000000', sourceType: 'rab', sourceId: 'prj_1', retrievedAt: '2026-10-23T00:00:00.000Z', verificationStatus: 'verified' },
    { fieldName: 'tanggalMulai', value: '2026-10-12', sourceType: 'schedule', sourceId: 'prj_1', retrievedAt: '2026-10-23T00:00:00.000Z', verificationStatus: 'verified' },
  ];
  const docMatch = '<h1>Dokumen</h1><p>Nilai pekerjaan Rp 850.000.000 sesuai rekap RAB. Pelaksanaan mulai 12 Oktober 2026.</p>';
  const fMatch = reviewDocument(docMatch, undefined, ctxFields);
  check('nilai & tanggal yang ada di konteks → TANPA temuan sumber', !fMatch.some((f) => f.category === 'sumber'),
    fMatch.filter((f) => f.category === 'sumber').map((f) => f.description).join(' | '));
  const docGhost = '<h1>Dokumen</h1><p>Nilai pekerjaan Rp 999.000.000 menurut dokumen. Pelaksanaan mulai 15 Oktober 2026.</p>';
  const fGhost = reviewDocument(docGhost, undefined, ctxFields);
  check('nilai Rp tak bersumber → temuan sumber medium',
    fGhost.some((f) => f.category === 'sumber' && f.severity === 'medium' && f.description.includes('Rp 999.000.000')));
  check('tanggal tak bersumber → temuan sumber',
    fGhost.some((f) => f.category === 'sumber' && f.description.includes('15 Oktober 2026')));
  check('temuan sumber dibingkai verifikasi (bukan tuduhan)',
    fGhost.filter((f) => f.category === 'sumber').every((f) => f.description.includes('tidak ditemukan di data sumber')));
  const fNoCtx = reviewDocument(docGhost);
  check('tanpa contextFields → cek sumber tidak berjalan', !fNoCtx.some((f) => f.category === 'sumber'));
  const fIso = reviewDocument('<h1>Dokumen</h1><p>Mulai 2026-10-12 sesuai jadwal.</p>', undefined, ctxFields);
  check('tanggal ISO di konten cocok dengan konteks ISO → tanpa temuan sumber', !fIso.some((f) => f.category === 'sumber'));

  console.log('\n[8] Kop — validateImageFile generalisasi (validateLogoFile tak berubah):');
  const pngValid = await validateImageFile(fileOf(new Uint8Array([...PNG_MAGIC, 1, 2, 3, 4]), 'logo.png'));
  check('PNG valid lolos', pngValid.ok === true && pngValid.kind === 'png');
  check('dataUrl PNG terbentuk', (pngValid.dataUrl ?? '').startsWith('data:image/png;base64,'));
  const fakePng = await validateImageFile(fileOf(new TextEncoder().encode('ini teks biasa, bukan gambar'), 'kop.png'));
  check('file teks berkedok .png tertolak magic bytes', fakePng.ok === false);
  const bigBytes = new Uint8Array(MAX_FULL_KOP_BYTES + 1024);
  bigBytes.set(PNG_MAGIC, 0);
  const tooBig = await validateImageFile(fileOf(bigBytes, 'kop-besar.png'), { maxBytes: MAX_FULL_KOP_BYTES, maxDimension: 6000, label: 'kop' });
  check('>5MB tertolak untuk kop penuh', tooBig.ok === false && (tooBig.error ?? '').includes('5 MB'));
  const logo3mb = new Uint8Array(3 * 1024 * 1024);
  logo3mb.set(PNG_MAGIC, 0);
  const logoTooBig = await validateLogoFile(fileOf(logo3mb, 'logo-besar.png'));
  check('validateLogoFile tetap maks 2 MB', logoTooBig.ok === false && (logoTooBig.error ?? '').includes('2 MB'));
  const kop3mb = await validateFullKopFile(fileOf(logo3mb, 'kop-3mb.png'));
  check('validateFullKopFile menerima 3 MB (di bawah 5 MB)', kop3mb.ok === true);

  console.log('\n[9] Kop — kopHtml mode penuh & kopModeEffective:');
  const kopUrl = 'data:image/png;base64,iVBORw0KGgo=';
  const profFull = emptyProfile({
    name: 'PT Kop Terstruktur', address: 'Jl. Uji 1',
    kopMode: 'full', fullKopDataUrl: kopUrl,
  });
  const htmlFull = kopHtml(profFull);
  check('kop penuh dirender sebagai gambar kop', htmlFull.includes('docai-kop-full') && htmlFull.includes(kopUrl));
  check('kop penuh TANPA elemen terstruktur (nama/kontak tidak ditumpuk)',
    !htmlFull.includes('PT Kop Terstruktur') && !htmlFull.includes('docai-kop-name') && !htmlFull.includes('Jl. Uji 1'));
  const htmlFull80 = kopHtml({ ...profFull, fullKopWidthPct: 80 });
  check('lebar kop penuh mengikuti fullKopWidthPct', htmlFull80.includes('width:80%'));
  const htmlFallback = kopHtml({ ...profFull, fullKopDataUrl: null });
  check('mode full tanpa aset → jatuh ke kop terstruktur', htmlFallback.includes('PT Kop Terstruktur'));
  check('kopModeEffective: full + aset → full', kopModeEffective(profFull) === 'full');
  check('kopModeEffective: full tanpa aset → structured', kopModeEffective({ ...profFull, fullKopDataUrl: null }) === 'structured');
  check('kopModeEffective: structured → structured', kopModeEffective(emptyProfile({ name: 'X' })) === 'structured');
  check('kopModeEffective: null → structured', kopModeEffective(null) === 'structured');

  console.log('\n[10] Persetujuan — approveDraft & deriveDisplayStatus:');
  const baseDraft: DraftRecord = {
    id: 'd-polish', templateId: 'surat', templateName: 'Surat', title: 'Surat Uji',
    content: 'isi', status: 'draft', createdAt: 1, updatedAt: 1,
  };
  const approved = approveDraft(baseDraft, 'Budi Santoso', 1720000000000);
  check('approveDraft bernama → ok', approved.ok === true);
  check('approveDraft → status final + approvedBy/At tercatat',
    approved.draft.status === 'final' && approved.draft.approvedBy === 'Budi Santoso' && approved.draft.approvedAt === 1720000000000);
  check('approveDraft murni (draf asal tidak berubah)', baseDraft.status === 'draft' && baseDraft.approvedBy === undefined);
  const rejected = approveDraft(baseDraft, '   ', 1720000000000);
  check('approveDraft nama kosong → ditolak, draf apa adanya',
    rejected.ok === false && rejected.draft === baseDraft && !!rejected.reason);
  check('derive: final → Final', deriveDisplayStatus(approved.draft, 0) === 'Final');
  check('derive: final tetap Final walau ada missing', deriveDisplayStatus(approved.draft, 5) === 'Final');
  check('derive: draf + missing → Perlu dilengkapi', deriveDisplayStatus(baseDraft, 2) === 'Perlu dilengkapi');
  check('derive: review → Perlu ditinjau', deriveDisplayStatus({ ...baseDraft, status: 'review' }, 0) === 'Perlu ditinjau');
  check('derive: editing → Perlu ditinjau', deriveDisplayStatus({ ...baseDraft, status: 'editing' }, 0) === 'Perlu ditinjau');
  check('derive: reviewed → Siap disetujui', deriveDisplayStatus({ ...baseDraft, status: 'reviewed' }, 0) === 'Siap disetujui');
  check('derive: draf bersih → Draf', deriveDisplayStatus(baseDraft, 0) === 'Draf');

  console.log('\n[11] Kategori template:');
  check('6 kategori katalog', TEMPLATE_CATEGORIES.length === 6);
  check('label kategori sesuai 6 grup', TEMPLATE_CATEGORIES.map((c) => c.label).join('|') ===
    'Surat dan Administrasi|Berita Acara dan Serah Terima|Laporan Pelaksanaan|QC, Inspeksi, dan K3|Rapat dan Koordinasi|Penawaran dan Tender');
  const unmapped = [...Object.keys(TEMPLATE_META), ...EXTRA_BUILTIN_TEMPLATES.map((t) => t.id)]
    .filter((id) => !(id in TEMPLATE_CATEGORY_BY_ID));
  check('semua id template dikenal UI terpetakan kategori', unmapped.length === 0, unmapped.join(','));
  check('bast & opname → berita-acara',
    TEMPLATE_CATEGORY_BY_ID['bast'] === 'berita-acara' && TEMPLATE_CATEGORY_BY_ID['opname'] === 'berita-acara');
  check('laporan-k3 & checklist-qc → qc-k3',
    TEMPLATE_CATEGORY_BY_ID['laporan-k3'] === 'qc-k3' && TEMPLATE_CATEGORY_BY_ID['checklist-qc'] === 'qc-k3');
  check('notulen → rapat', TEMPLATE_CATEGORY_BY_ID['notulen'] === 'rapat');
  check('surat-penawaran → penawaran-tender', TEMPLATE_CATEGORY_BY_ID['surat-penawaran'] === 'penawaran-tender');
  check('bebas → surat-administrasi', TEMPLATE_CATEGORY_BY_ID['bebas'] === 'surat-administrasi');

  console.log('\n[12] Ekspor — imageSizeFromBytes (rasio asli DOCX):');
  const pngBytes = new Uint8Array(24);
  pngBytes.set(PNG_MAGIC, 0);
  pngBytes.set([0, 0, 0, 13], 8); // panjang IHDR
  pngBytes.set([0x49, 0x48, 0x44, 0x52], 12); // 'IHDR'
  pngBytes.set([0, 0, 0x04, 0xb0], 16); // 1200
  pngBytes.set([0, 0, 0x01, 0x2c], 20); // 300
  const pngSize = imageSizeFromBytes(pngBytes);
  check('PNG 1200×300 terbaca', pngSize?.width === 1200 && pngSize?.height === 300);
  const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x03, 0xc8, 0x00]); // 800 × 200 LE
  const gifSize = imageSizeFromBytes(gifBytes);
  check('GIF 800×200 terbaca', gifSize?.width === 800 && gifSize?.height === 200);
  const jpgBytes = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, // APP0, panjang 16
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 14 byte isi APP0
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, // SOF0: presisi 8, tinggi 480, lebar 640
  ]);
  const jpgSize = imageSizeFromBytes(jpgBytes);
  check('JPEG 640×480 terbaca', jpgSize?.width === 640 && jpgSize?.height === 480);
  check('byte acak → null', imageSizeFromBytes(new Uint8Array([1, 2, 3, 4, 5])) === null);

  console.log(`\n=== HASIL: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed) { console.log('Gagal:', failures.join(' | ')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
