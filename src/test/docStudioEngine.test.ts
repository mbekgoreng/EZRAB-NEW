/**
 * DOCUMENT STUDIO — engine test (orchestrator + contextAdapter + review + store versions).
 * Transport AI di-mock: tidak ada panggilan jaringan. Pola docAiWorkspace (tsx + check()).
 * Jalankan: npx tsx src/test/docStudioEngine.test.ts
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// Mock localStorage untuk node (store.ts)
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};

import { DocumentStudioOrchestrator, compareDocumentTexts, type DocAiTransport } from '../ai-tools/document-ai/orchestrator';
import { collectProjectContext, detectMissingFields, formatContextBlock } from '../ai-tools/document-ai/contextAdapter';
import { reviewDocument, scanIsiMarkers } from '../ai-tools/document-ai/review';
import { TEMPLATE_META, resolveTemplate } from '../ai-tools/document-ai/docTemplates';
import { emptyProfile } from '../ai-tools/document-ai/companyProfile';
import { pushVersion, restoreVersion, MAX_DRAFT_VERSIONS, type DraftRecord } from '../ai-tools/document-ai/store';
import { DRAFT_PROMPT_VERSION, systemForMode } from '../ai-tools/document-ai/prompt';
import type { DokumenAiChatRequest, DokumenAiChatResponse } from '../ai-tools/document-ai/types';
import type { Project } from '../types';

class MockTransport implements DocAiTransport {
  calls: DokumenAiChatRequest[] = [];
  constructor(private responder: (req: DokumenAiChatRequest) => DokumenAiChatResponse) {}
  async chat(req: DokumenAiChatRequest): Promise<DokumenAiChatResponse> {
    this.calls.push(req);
    return this.responder(req);
  }
}
const ok = (reply: string) => (req: DokumenAiChatRequest): DokumenAiChatResponse => ({ success: true, mode: req.mode, reply });

const project = {
  id: 'prj_1', name: 'Pembangunan Rumah Tinggal 2 Lantai', projectNumber: 'PRJ-2026-001',
  clientName: '', location: 'Bandung', province: 'Jawa Barat', contractorName: 'CV Pelaksana',
  startDate: '2026-10-01', status: 'active', sections: [],
  costSummary: { grandTotal: 850_000_000 },
  createdAt: '2026-10-01T00:00:00.000Z',
} as unknown as Project;
const company = emptyProfile({ name: 'PT Contoh Konstruksi', address: 'Jl. Contoh No. 1' });

async function main(): Promise<void> {
  console.log('\n[1] prompt DRAFT = Document Assistant §D + disiplin [ISI:]:');
  check('versi prompt diekspor', DRAFT_PROMPT_VERSION === 'doc-draft-v2');
  check('system DRAFT memuat identitas Document Assistant', systemForMode('DRAFT').includes('EZRAB Document Assistant'));
  check('system DRAFT melarang karangan (kontrak tes lama)', systemForMode('DRAFT').includes('jangan mengarang'));
  check('system DRAFT mempertahankan [ISI: ...]', systemForMode('DRAFT').includes('[ISI:'));

  console.log('\n[2] contextAdapter — provenance & missing jujur:');
  const ctx = collectProjectContext(project, company, { sources: { project: true, company: true } });
  const nama = ctx.find((f) => f.fieldName === 'namaProyek');
  check('namaProyek verified + sourceId proyek', !!nama && nama.verificationStatus === 'verified' && nama.sourceId === 'prj_1' && nama.sourceType === 'project');
  check('retrievedAt ISO terisi', !!nama && /^\d{4}-\d{2}-\d{2}T/.test(nama.retrievedAt));
  const klien = ctx.find((f) => f.fieldName === 'namaKlien');
  check('clientName kosong → missing (bukan demo)', !!klien && klien.verificationStatus === 'missing' && klien.value === '');
  const rab = ctx.find((f) => f.fieldName === 'totalNilaiRab');
  check('totalNilaiRab dari costSummary.grandTotal', !!rab && rab.value === '850000000' && rab.sourceType === 'rab');
  const comp = ctx.find((f) => f.fieldName === 'namaPerusahaan');
  check('namaPerusahaan dari profil, sourceType company', !!comp && comp.value === 'PT Contoh Konstruksi' && comp.sourceType === 'company');
  const ctxNoProject = collectProjectContext(project, company, { sources: { project: false, company: true } });
  check('sumber proyek nonaktif → field proyek tidak diambil', !ctxNoProject.some((f) => f.sourceType === 'project'));
  check('formatContextBlock hanya memuat field terverifikasi', formatContextBlock(ctx).includes('PT Contoh Konstruksi') && !formatContextBlock(ctx).includes('namaKlien:'));

  const metaBA = resolveTemplate(TEMPLATE_META['berita-acara']);
  const missing = detectMissingFields(ctx, metaBA, { nomorDokumen: '001/BA/X/2026' });
  check('detectMissingFields: field wajib template kosong terdeteksi', missing.some((m) => m.label === 'Tanggal Dokumen'));
  check('detectMissingFields: field terisi tidak dilaporkan', !missing.some((m) => m.label === 'Nomor Dokumen'));
  const ctxNoName = collectProjectContext({ ...project, name: '' } as Project, null, { sources: { project: true, company: false } });
  check('detectMissingFields: nama proyek kritis missing', detectMissingFields(ctxNoName).some((m) => m.key === 'namaProyek'));

  console.log('\n[3] orchestrator CREATE_DOCUMENT:');
  const t1 = new MockTransport(ok('[DRAF] BERITA ACARA\nNomor: 001/BA/X/2026\n[ISI: nomor kontrak]'));
  const orc1 = new DocumentStudioOrchestrator(t1);
  const r1 = await orc1.handle({
    intent: 'CREATE_DOCUMENT', instruction: 'Buatkan berita acara pemeriksaan',
    templateMeta: metaBA, fieldValues: { nomorDokumen: '001/BA/X/2026' }, contextFields: ctx,
    documentName: 'Berita Acara Pemeriksaan',
  });
  check('CREATE sukses', r1.success === true);
  check('CREATE memakai mode DRAFT', t1.calls[0]?.mode === 'DRAFT');
  check('prompt menyuntikkan data field (buildFieldBlock)', (t1.calls[0]?.prompt ?? '').includes('Nomor Dokumen: 001/BA/X/2026'));
  check('prompt menyuntikkan scaffold template', (t1.calls[0]?.prompt ?? '').includes('KERANGKA STRUKTUR'));
  check('prompt menyuntikkan konteks terverifikasi', (t1.calls[0]?.prompt ?? '').includes('KONTEKS TERVERIFIKASI'));
  check('missingFields pra-generate: Tanggal Dokumen', r1.missingFields.some((m) => m.label === 'Tanggal Dokumen'));
  check('missingFields pasca-generate: [ISI: nomor kontrak] terdeteksi', r1.missingFields.some((m) => m.label.includes('nomor kontrak')));
  check('promptVersion tercatat', r1.promptVersion === 'doc-draft-v2');

  const tEmpty = new MockTransport(ok('   '));
  const rEmpty = await new DocumentStudioOrchestrator(tEmpty).handle({ intent: 'CREATE_DOCUMENT', instruction: 'buat dokumen' });
  check('keluaran kosong → error terstruktur EMPTY_RESPONSE', rEmpty.success === false && rEmpty.errorCode === 'EMPTY_RESPONSE');
  const tFail = new MockTransport(() => ({ success: false, mode: 'DRAFT', errorCode: 'TIMEOUT', stage: 'provider:fetch', message: 'timeout' }));
  const rFail = await new DocumentStudioOrchestrator(tFail).handle({ intent: 'CREATE_DOCUMENT', instruction: 'buat dokumen' });
  check('error provider diteruskan terstruktur (tidak ditelan)', rFail.success === false && rFail.errorCode === 'TIMEOUT' && rFail.stage === 'provider:fetch');

  console.log('\n[4] orchestrator delegasi + scope + ask:');
  const tSum = new MockTransport(ok('Ringkasan isi dokumen.'));
  const rSum = await new DocumentStudioOrchestrator(tSum).handle({ intent: 'SUMMARIZE_DOCUMENT', documentText: 'Isi dokumen panjang.' });
  check('SUMMARIZE delegasi mode SUMMARY', rSum.success && tSum.calls[0]?.mode === 'SUMMARY');
  const rNoDoc = await new DocumentStudioOrchestrator(tSum).handle({ intent: 'SUMMARIZE_DOCUMENT', documentText: ' ' });
  check('SUMMARIZE tanpa teks → NO_DATA', rNoDoc.success === false && rNoDoc.errorCode === 'NO_DATA');
  const rAskNoQ = await new DocumentStudioOrchestrator(tSum).handle({ intent: 'ASK_DOCUMENT', documentText: 'teks' });
  check('ASK tanpa pertanyaan → NO_QUESTION', rAskNoQ.success === false && rAskNoQ.errorCode === 'NO_QUESTION');
  const tScope = new MockTransport(ok('1. Pekerjaan pondasi — Tidak tercantum volume.'));
  const rScope = await new DocumentStudioOrchestrator(tScope).handle({ intent: 'EXTRACT_CONSTRUCTION_SCOPE', documentText: 'RKS: pekerjaan pondasi batu kali.' });
  check('SCOPE memakai prompt lingkup konstruksi', (tScope.calls[0]?.prompt ?? '').includes('LINGKUP PEKERJAAN KONSTRUKSI'));
  check('SCOPE ditandai bukan data resmi', (rScope.message ?? '').includes('bukan data resmi'));

  console.log('\n[5] orchestrator REVIEW (deterministik, tanpa AI):');
  const tRev = new MockTransport(ok('tidak boleh terpanggil'));
  const rRev = await new DocumentStudioOrchestrator(tRev).handle({
    intent: 'REVIEW_DOCUMENT',
    documentText: '<h1>Berita Acara</h1><p>Nomor: 001/BA/2026</p><p>Nomor: 002/BA/2026</p><p>[ISI: tanggal pelaksanaan]</p>',
  });
  check('REVIEW sukses tanpa memanggil transport', rRev.success === true && tRev.calls.length === 0);
  check('REVIEW menemukan penanda [ISI:] severity high', (rRev.findings ?? []).some((f) => f.id.startsWith('rv_isi_') && f.severity === 'high'));
  check('REVIEW menemukan inkonsistensi nomor', (rRev.findings ?? []).some((f) => f.id.startsWith('rv_nomor_')));
  check('REVIEW missingFields dari [ISI:]', rRev.missingFields.some((m) => m.label.includes('tanggal pelaksanaan')));

  console.log('\n[6] orchestrator REVISE = kandidat, tidak menerapkan:');
  const tRevise = new MockTransport(ok('DOKUMEN HASIL REVISI (kandidat)'));
  const rRevise = await new DocumentStudioOrchestrator(tRevise).handle({
    intent: 'REVISE_DOCUMENT', instruction: 'Buat bahasa lebih formal', documentText: 'Isi draf awal.',
  });
  check('REVISE sukses sebagai kandidat', rRevise.success === true && rRevise.content === 'DOKUMEN HASIL REVISI (kandidat)');
  check('REVISE menyatakan belum diterapkan', (rRevise.message ?? '').includes('belum diterapkan'));
  check('prompt REVISE memuat aturan ubah-hanya-yang-diminta', (tRevise.calls[0]?.prompt ?? '').includes('ATURAN REVISI'));
  const rReviseNoInst = await new DocumentStudioOrchestrator(tRevise).handle({ intent: 'REVISE_DOCUMENT', documentText: 'isi' });
  check('REVISE tanpa instruksi → NO_INSTRUCTION', rReviseNoInst.success === false && rReviseNoInst.errorCode === 'NO_INSTRUCTION');

  console.log('\n[7] orchestrator COMPARE + CREATE_REPORT + intent asing:');
  const tCmp = new MockTransport(ok('narasi'));
  const orcCmp = new DocumentStudioOrchestrator(tCmp);
  const rCmpOne = await orcCmp.handle({ intent: 'COMPARE_DOCUMENTS', documentText: 'baris satu' });
  check('COMPARE satu dokumen → error terstruktur', rCmpOne.success === false && rCmpOne.errorCode === 'MISSING_SECOND_DOCUMENT');
  const rCmp = await orcCmp.handle({
    intent: 'COMPARE_DOCUMENTS',
    documentText: 'alpha\nbeta\ngamma', secondDocumentText: 'alpha\nbeta\ndelta',
  });
  check('COMPARE deterministik tanpa AI bila tidak diminta', rCmp.success === true && tCmp.calls.length === 0);
  check('COMPARE hitungan baris benar', rCmp.comparison?.addedLines === 1 && rCmp.comparison?.removedLines === 1 && rCmp.comparison?.unchangedLines === 2);
  const cmpDirect = compareDocumentTexts('<p>satu</p><p>dua</p>', '<p>satu</p><p>tiga</p>');
  check('compareDocumentTexts membersihkan tag HTML', cmpDirect.linesA === 2 && cmpDirect.addedLines === 1);
  const tRep = new MockTransport(ok('[DRAF] LAPORAN MINGGUAN isi'));
  const rRep = await new DocumentStudioOrchestrator(tRep).handle({ intent: 'CREATE_REPORT', reportKind: 'mingguan', contextFields: ctx });
  check('CREATE_REPORT memakai template laporan-mingguan nyata', rRep.success === true && tRep.calls[0]?.mode === 'DRAFT' && (tRep.calls[0]?.prompt ?? '').toLowerCase().includes('laporan'));
  const rUnknown = await orcCmp.handle({ intent: 'HAPUS_DOKUMEN' });
  check('intent tak dikenal → gagal terstruktur stage intent', rUnknown.success === false && rUnknown.errorCode === 'UNKNOWN_INTENT' && rUnknown.stage === 'intent');

  console.log('\n[8] review.ts per jenis temuan:');
  check('scanIsiMarkers menemukan semua penanda', scanIsiMarkers('a [ISI: satu] b [ISI: dua]').length === 2);
  const fField = reviewDocument('<h1>Dokumen</h1><p>isi tanpa label wajib</p>', metaBA);
  check('(b) field wajib tak muncul → temuan medium', fField.some((f) => f.id.startsWith('rv_field_') && f.severity === 'medium'));
  const full = [
    '<h1>BERITA ACARA</h1>', '<p>Nomor Dokumen: 001</p>', '<p>Tanggal Dokumen: 22 Oktober 2026</p>',
    '<p>judul berita acara nomor tanggal pembuka identitas pihak pertama pihak kedua dasar pelaksanaan maksud tujuan uraian hasil tabel hasil catatan tindak lanjut pernyataan penutup blok tanda tangan keterangan lampiran</p>',
    '<table><tr><td>x</td></tr></table>',
  ].join('\n');
  const fFull = reviewDocument(full, metaBA);
  check('(c) scaffold lengkap → tanpa temuan scaffold', !fFull.some((f) => f.id.startsWith('rv_scaffold_')), fFull.map((f) => f.id).join(','));
  const fScaf = reviewDocument('<h1>BERITA ACARA</h1><p>hanya judul berita acara</p>', metaBA);
  check('(c) scaffold hilang → temuan scaffold', fScaf.some((f) => f.id.startsWith('rv_scaffold_')));
  const fDate = reviewDocument('<h1>X</h1><p>Tanggal: 12 Oktober 2026</p><p>Tanggal: 13 Oktober 2026</p>');
  check('(d) tanggal label sama berbeda → temuan', fDate.some((f) => f.id.startsWith('rv_tanggal_')));
  const fDateSame = reviewDocument('<h1>X</h1><p>Tanggal: 12 Oktober 2026</p><p>Tanggal: 12 Oktober 2026</p>');
  check('(d) tanggal sama → tanpa temuan tanggal', !fDateSame.some((f) => f.id.startsWith('rv_tanggal_')));
  const fHead = reviewDocument('paragraf polos tanpa judul sama sekali');
  check('(e) tanpa heading → temuan low', fHead.some((f) => f.id.startsWith('rv_heading_') && f.severity === 'low'));
  check('(e) dengan heading → tanpa temuan heading', !reviewDocument('<h1>Judul</h1><p>isi</p>').some((f) => f.id.startsWith('rv_heading_')));
  const metaTabel = { id: 'x', fields: [], scaffold: 'Struktur: tabel hasil pemeriksaan, penutup dokumen' };
  check('(e) scaffold tabel tanpa tabel → temuan low', reviewDocument('<h1>D</h1><p>tabel hasil pemeriksaan penutup dokumen</p>', metaTabel).some((f) => f.id.startsWith('rv_table_')));
  check('(e) dengan <table> → tanpa temuan tabel', !reviewDocument('<h1>D</h1><p>tabel hasil pemeriksaan penutup dokumen</p><table><tr><td>1</td></tr></table>', metaTabel).some((f) => f.id.startsWith('rv_table_')));
  const fEmpty = reviewDocument('   ');
  check('dokumen kosong → temuan high empty', fEmpty.length === 1 && fEmpty[0].severity === 'high');

  console.log('\n[9] store versions — push membatasi & restore men-snapshot:');
  const base: DraftRecord = {
    id: 'd1', templateId: 'surat', templateName: 'Surat', title: 'T', content: 'isi-0',
    status: 'draft', createdAt: 1, updatedAt: 1,
  };
  let d = base;
  for (let i = 1; i <= 25; i++) {
    d = pushVersion({ ...d, content: `isi-${i}` }, 'manual');
  }
  check('pushVersion membatasi riwayat maks 20', (d.versions ?? []).length === MAX_DRAFT_VERSIONS);
  check('versi tertua dibuang (yang tersisa mulai isi-6)', d.versions?.[0]?.content === 'isi-6');
  const d2base: DraftRecord = { ...base, content: 'isi-berjalan', versions: [{ id: 'v_old', content: 'isi-lama', createdAt: 1, origin: 'generate' }] };
  const d2 = restoreVersion(d2base, 'v_old');
  check('restoreVersion mengembalikan isi versi tujuan', d2.content === 'isi-lama');
  check('restoreVersion men-snapshot isi berjalan (origin restore)', (d2.versions ?? []).some((v) => v.content === 'isi-berjalan' && v.origin === 'restore'));
  const d3 = restoreVersion(d2base, 'tidak-ada');
  check('restoreVersion id asing → draf apa adanya', d3 === d2base);
  check('pushVersion murni (argumen tak berubah)', base.versions === undefined);

  console.log(`\n=== HASIL: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed) { console.log('Gagal:', failures.join(' | ')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
