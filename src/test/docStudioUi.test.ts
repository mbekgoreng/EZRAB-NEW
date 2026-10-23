/**
 * DOCUMENT STUDIO — UI wiring test (view 3 jalur + DocCreator orchestrator +
 * panel periksa + kompatibilitas store untuk field Studio pada DraftRecord).
 *
 * Dua lapis:
 * 1. Kontrak sumber (marker): jalur Studio ada di view.tsx, generate di
 *    DocCreator lewat orchestrator (bukan lagi service mode CHAT langsung),
 *    panel konteks & panel periksa terhubung, kunci localStorage TIDAK berubah.
 * 2. Fungsional: draftStore roundtrip mempertahankan field Studio aditif
 *    (versions/contextSnapshot/promptVersion) dan orchestrator dengan
 *    transport mock menerima konteks dari collectProjectContext (mode DRAFT).
 *
 * Jalankan: npx tsx src/test/docStudioUi.test.ts
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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { draftStore, pushVersion, restoreVersion, type DraftRecord } from '../ai-tools/document-ai/store';
import { DocumentStudioOrchestrator, type DocAiTransport } from '../ai-tools/document-ai/orchestrator';
import { collectProjectContext } from '../ai-tools/document-ai/contextAdapter';
import { emptyProfile } from '../ai-tools/document-ai/companyProfile';
import { DRAFT_PROMPT_VERSION } from '../ai-tools/document-ai/prompt';
import type { DokumenAiChatRequest, DokumenAiChatResponse } from '../ai-tools/document-ai/types';
import type { Project } from '../types';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

async function main(): Promise<void> {
  console.log('\n[1] view.tsx — struktur 3 jalur Studio + permukaan pendukung:');
  const viewSrc = read('../ai-tools/document-ai/view.tsx');
  check('jalur "Buat dengan AI" ada', viewSrc.includes('Buat dengan AI'));
  check('jalur "Gunakan Template" ada', viewSrc.includes('Gunakan Template'));
  check('jalur "Edit & Periksa" ada', viewSrc.includes('Edit & Periksa'));
  check('Dokumen Saya tetap ada', viewSrc.includes("t('ai.doc.tab_library')"));
  check('Analisis Dokumen tetap ada', viewSrc.includes("t('ai.doc.tab_analyze')"));
  check('Riwayat tetap ada', viewSrc.includes("t('ai.doc.tab_history')"));
  check('DocCreator menerima studioPath', viewSrc.includes('studioPath'));
  check('kunci LS library tidak berubah', viewSrc.includes("'ezrab_docai_library_v1'"));
  check('kunci LS history tidak berubah', viewSrc.includes("'ezrab_docai_history_v1'"));
  check('kunci LS drafts tidak berubah', viewSrc.includes("'ezrab_docai_drafts_v1'"));
  check('DraftRecord view diperluas versions', /versions\?: DraftVersion\[\]/.test(viewSrc));
  check('DraftRecord view diperluas contextSnapshot', viewSrc.includes('contextSnapshot?: ContextField[]'));
  check('DraftRecord view diperluas promptVersion', viewSrc.includes('promptVersion?: string'));

  console.log('\n[2] DocCreator — generate lewat orchestrator + konteks + versi:');
  const creatorSrc = read('../ai-tools/document-ai/components/DocCreator.tsx');
  check('memakai documentStudioOrchestrator', creatorSrc.includes('documentStudioOrchestrator.handle'));
  check('intent CREATE_DOCUMENT', creatorSrc.includes("intent: 'CREATE_DOCUMENT'"));
  check('konteks dari collectProjectContext', creatorSrc.includes('collectProjectContext('));
  check('missingFields ditampilkan (genMissing)', creatorSrc.includes('setGenMissing(res.missingFields)'));
  check('contextSnapshot disimpan ke draf', creatorSrc.includes('contextSnapshot: contextFields'));
  check('promptVersion disimpan ke draf', creatorSrc.includes('promptVersion: res.promptVersion'));
  check('pushVersion dipakai (revise/generate)', creatorSrc.includes("pushVersion(current, 'revise'") && creatorSrc.includes("pushVersion(current, 'generate'"));
  check('restoreVersion dipakai', creatorSrc.includes('restoreVersion(current, versionId)'));
  check('panel DocStudioReview dirender', creatorSrc.includes('<DocStudioReview'));
  check('panel DocContextPanel dirender', creatorSrc.includes('<DocContextPanel'));
  check('tidak ada lagi panggilan service langsung', !creatorSrc.includes('dokumenAiService'));
  check('tidak ada lagi mode CHAT di DocCreator', !creatorSrc.includes("mode: 'CHAT'"));
  check('mode instruksi-pertama ada', creatorSrc.includes('Buat dengan AI — instruksi dulu'));
  check('mode form-pertama ada', creatorSrc.includes('Form Template — template dulu'));
  check('jenis dokumen opsional di jalur AI', creatorSrc.includes('Otomatis — AI menentukan dari instruksi'));
  check('ekspor PDF/DOCX lama tetap ada', creatorSrc.includes('exportPaperPdf') && creatorSrc.includes('exportPaperDocx'));

  console.log('\n[3] Panel konteks & panel periksa:');
  const ctxSrc = read('../ai-tools/document-ai/components/DocContextPanel.tsx');
  check('judul ringkasan konteks', ctxSrc.includes('Ringkasan informasi yang akan digunakan'));
  check('penanda belum tersedia', ctxSrc.includes('belum tersedia'));
  check('toggle sumber proyek/perusahaan', ctxSrc.includes("onToggleSource('project'") && ctxSrc.includes("onToggleSource('company'"));
  check('daftar perlu dilengkapi', ctxSrc.includes('Perlu dilengkapi'));
  const revSrc = read('../ai-tools/document-ai/components/DocStudioReview.tsx');
  check('intent REVIEW_DOCUMENT', revSrc.includes("intent: 'REVIEW_DOCUMENT'"));
  check('intent REVISE_DOCUMENT', revSrc.includes("intent: 'REVISE_DOCUMENT'"));
  check('intent COMPARE_DOCUMENTS', revSrc.includes("intent: 'COMPARE_DOCUMENTS'"));
  check('label jujur bukan kepatuhan hukum', revSrc.includes('bukan penilaian kepatuhan hukum'));
  check('kandidat belum diterapkan', revSrc.includes('belum diterapkan'));
  check('aksi temuan lengkap', ['Perbaiki dengan AI', 'Abaikan', 'Tandai diperiksa', 'Buka bagian'].every((s) => revSrc.includes(s)));
  check('revisi bahasa alami ada', revSrc.includes('Revisi dengan bahasa alami'));
  check('riwayat versi + pulihkan ada', revSrc.includes('Riwayat Versi') && revSrc.includes('Pulihkan'));

  console.log('\n[4] store — field Studio aditif bertahan roundtrip (draf lama kompatibel):');
  const withStudio: DraftRecord = {
    id: 'draft_studio_1', templateId: 'surat', templateName: 'Surat Resmi',
    title: 'Surat — Uji', content: '<p>isi</p>', contentFormat: 'html',
    status: 'draft', createdAt: 1000, updatedAt: 2000,
    versions: [{ id: 'ver_1', content: '<p>lama</p>', contentFormat: 'html', createdAt: 1500, origin: 'generate' }],
    contextSnapshot: [
      { fieldName: 'namaProyek', value: 'Proyek Uji', sourceType: 'project', retrievedAt: '2026-10-23T00:00:00.000Z', verificationStatus: 'verified' },
      { fieldName: 'namaPerusahaan', value: '', sourceType: 'company', retrievedAt: '2026-10-23T00:00:00.000Z', verificationStatus: 'missing' },
    ],
    promptVersion: DRAFT_PROMPT_VERSION,
  };
  draftStore.upsert(withStudio);
  const back = draftStore.get('draft_studio_1');
  check('versions bertahan', back?.versions?.length === 1 && back.versions[0].origin === 'generate');
  check('contextSnapshot bertahan', back?.contextSnapshot?.length === 2 && back.contextSnapshot[1].verificationStatus === 'missing');
  check('promptVersion bertahan', back?.promptVersion === 'doc-draft-v2');
  check('tersimpan di kunci LS yang sama', mem.has('ezrab_docai_drafts_v1'));
  const legacy: DraftRecord = {
    id: 'draft_legacy_1', templateId: 'bebas', templateName: 'Draf Bebas',
    title: 'Lama', content: 'teks polos lama', status: 'draft', createdAt: 500, updatedAt: 600,
  };
  draftStore.upsert(legacy);
  const legacyBack = draftStore.get('draft_legacy_1');
  check('draf lama tanpa field Studio tetap terbaca', !!legacyBack && legacyBack.content === 'teks polos lama' && legacyBack.versions === undefined);
  const pushed = pushVersion(legacyBack!, 'revise', 'uji');
  check('pushVersion pada draf lama membuat versions[1]', pushed.versions?.length === 1);
  const changed = { ...pushed, content: 'isi baru' };
  const restored = restoreVersion(changed, pushed.versions![0].id);
  check('restoreVersion mengembalikan isi versi + snapshot isi berjalan', restored.content === 'teks polos lama' && (restored.versions?.length ?? 0) === 2);

  console.log('\n[5] Wiring orchestrator dengan konteks UI (transport mock):');
  const project = {
    id: 'prj_1', name: 'Pembangunan Rumah Tinggal 2 Lantai', clientName: 'PT Klien',
    location: 'Bandung', status: 'active', sections: [],
    createdAt: '2026-10-01T00:00:00.000Z',
  } as unknown as Project;
  const company = emptyProfile({ name: 'PT Contoh Konstruksi' });
  const fields = collectProjectContext(project, company, { sources: { project: true, company: true } });
  let captured: DokumenAiChatRequest | null = null;
  const mock: DocAiTransport = {
    async chat(req: DokumenAiChatRequest): Promise<DokumenAiChatResponse> {
      captured = req;
      return { success: true, mode: req.mode, reply: 'DRAF hasil mock. Nomor: [ISI: nomor surat].' };
    },
  };
  const orch = new DocumentStudioOrchestrator(mock);
  const res = await orch.handle({
    intent: 'CREATE_DOCUMENT',
    instruction: 'Buatkan surat pengantar.',
    contextFields: fields,
    documentName: 'Surat Pengantar',
  });
  check('CREATE sukses via mock', res.success);
  check('transport dipanggil mode DRAFT', captured !== null && (captured as DokumenAiChatRequest).mode === 'DRAFT');
  check(
    'konteks proyek masuk ke prompt/teks pendukung',
    !!captured && JSON.stringify(captured).includes('Pembangunan Rumah Tinggal 2 Lantai'),
  );
  check('hasil membawa promptVersion doc-draft-v2', res.promptVersion === 'doc-draft-v2');
  check('penanda [ISI:] dilaporkan sebagai missingFields', res.missingFields.some((m) => m.key.startsWith('isi:')));
  const fieldsNoProject = collectProjectContext(project, company, { sources: { project: false, company: true } });
  check('toggle sumber proyek OFF membuang field proyek', !fieldsNoProject.some((f) => f.sourceType === 'project'));
  let transportCalled = false;
  const orchReview = new DocumentStudioOrchestrator({
    async chat(): Promise<DokumenAiChatResponse> {
      transportCalled = true;
      throw new Error('transport tidak boleh dipanggil untuk review');
    },
  });
  const rev = await orchReview.handle({ intent: 'REVIEW_DOCUMENT', documentText: 'Isi tanpa heading dan [ISI: nomor].' });
  check('REVIEW deterministik tanpa transport', rev.success && !transportCalled && (rev.findings?.length ?? 0) > 0);

  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) { console.log('GAGAL:', failures.join(' | ')); process.exit(1); }
  console.log('SEMUA TEST DOC STUDIO UI LOLOS');
}

void main();
