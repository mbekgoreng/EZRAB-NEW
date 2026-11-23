/**
 * DOCAI CREATOR + CONTEXT REDESIGN — Child 3 (§5–§10).
 *
 * Membuktikan redesign UI/layout DocCreator + DocContextPanel TIDAK mengubah
 * perilaku: mode buat, placeholder instruksi, 22 field konteks nyata
 * (16 proyek terverifikasi + 6 perusahaan), indikator kelengkapan dari state
 * nyata (tanpa hardcode), toggle sumber + defaultnya, pemberitahuan
 * paket/demo dinamis, tombol "Buat Draf dengan AI" + validasinya, dan
 * gerbang generate.
 *
 * Dua lapis:
 * 1. Kontrak sumber (marker): string perilaku kunci tetap ada di kedua file.
 * 2. Fungsional (tanpa DOM, tanpa AI): collectProjectContext pada fixture
 *    proyek lengkap vs kosong, CONTEXT_FIELD_GROUPS hasil impor, dan
 *    featureGate (planAllowsAiFeature / aiFeatureLockedMessage).
 *
 * Plain-tsx (pola docStudioUi.test.ts, check()) — BUKAN vitest.
 * Jalankan: npx --yes tsx src/test/docaiCreatorContextRedesign.test.ts
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
import { collectProjectContext } from '../ai-tools/document-ai/contextAdapter';
import { emptyProfile } from '../ai-tools/document-ai/companyProfile';
import {
  CONTEXT_FIELD_GROUPS,
  CONTEXT_FIELD_LABELS,
} from '../ai-tools/document-ai/components/DocContextPanel';
import { planAllowsAiFeature, aiFeatureLockedMessage } from '../ai-credits/featureGate';
import type { Project } from '../types';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** 16 field proyek dari brief — SEMUANYA terverifikasi ada di contextAdapter. */
const PROJECT_FIELDS_16 = [
  'namaProyek', 'nomorProyek', 'namaKlien', 'lokasiProyek',
  'provinsi', 'kabupatenKota', 'institusi', 'jenisKontrak', 'sumberDana', 'namaPemilik',
  'konsultanPengawas', 'kontraktorPelaksana',
  'tahunAnggaran', 'tanggalMulai', 'tanggalTargetSelesai', 'totalNilaiRab',
] as const;

/** 6 field profil perusahaan — tambahan nyata di luar brief 16 (contextAdapter). */
const COMPANY_FIELDS_6 = [
  'namaPerusahaan', 'alamatPerusahaan', 'teleponPerusahaan',
  'emailPerusahaan', 'websitePerusahaan', 'infoPerusahaan',
] as const;

const ALL_22 = [...PROJECT_FIELDS_16, ...COMPANY_FIELDS_6];

async function main(): Promise<void> {
  const creatorSrc = read('../ai-tools/document-ai/components/DocCreator.tsx');
  const ctxSrc = read('../ai-tools/document-ai/components/DocContextPanel.tsx');

  console.log('\n[1] Mode buat (§5) — dua mode, perilaku seleksi utuh, tanpa duplikasi:');
  /* Re-baseline 2026-11-19 (v3, mockup di-ACC owner): label modeline
     dipendekkan menjadi "Instruksi" / "Template". */
  check('label mode AI', creatorSrc.includes('<Sparkles size={14} /> Instruksi'));
  check('label mode form', creatorSrc.includes('<LayoutTemplate size={14} /> Template'));
  check('state mode bertipe ai|form', creatorSrc.includes("useState<'ai' | 'form'>"));
  check('mode awal dari studioPath template→form', creatorSrc.includes("studioPath === 'template' ? 'form' : 'ai'"));
  check('seleksi AI memanggil setCreateMode(ai)', creatorSrc.includes("setCreateMode('ai')"));
  check('seleksi form memanggil setCreateMode(form)', creatorSrc.includes("setCreateMode('form')"));
  check('semantik tab dipertahankan (role=tab + aria-selected)', creatorSrc.includes('role="tab"') && creatorSrc.includes('aria-selected={createMode === \'ai\'}'));
  check('efek studioPath ai→ai / template→form', creatorSrc.includes("if (studioPath === 'ai') setCreateMode('ai')") && creatorSrc.includes("if (studioPath === 'template') setCreateMode('form')"));
  check('deskripsi mode duplikat di detail template DIHAPUS', !creatorSrc.includes('AI menyusun draf dari instruksi + data konteks') && !creatorSrc.includes('Anda mengisi field template di bawah'));
  check('tombol mini alih-mode di detail template tetap ada', creatorSrc.includes('Isi Manual') && creatorSrc.includes('setAiAutoType(false)'));
  check('input khusus mode AI tetap ada (jenis dokumen opsional)', creatorSrc.includes('Otomatis — AI menentukan dari instruksi'));
  check('input khusus mode form tetap ada (pencarian template)', creatorSrc.includes('Cari template (nama / kegunaan)'));

  console.log('\n[2] Input instruksi AI (§6) — makna placeholder utuh + perluas opsional:');
  check('frasa kunci placeholder: AI hanya memakai instruksi ini', creatorSrc.includes('AI hanya memakai instruksi ini'));
  check('frasa kunci placeholder: data pada ringkasan konteks', creatorSrc.includes('data pada ringkasan konteks'));
  check('frasa kunci placeholder: [ISI: ...]', creatorSrc.includes('ditandai [ISI: ...]'));
  check('frasa kunci placeholder: tidak dikarang', creatorSrc.includes('tidak dikarang'));
  check('frasa kunci placeholder: Bahasa Indonesia', creatorSrc.includes('dalam Bahasa Indonesia'));
  check('placeholder netral-layout (tanpa "di bawah")', !creatorSrc.includes('ringkasan konteks di bawah'));
  /* Re-baseline 2026-11-19 (v3, mockup di-ACC owner): nomor langkah
     dihapus ("1 · Instruksi untuk AI" → "Instruksi"); tombol
     Perluas/Ciutkan kolom + state instrExpanded dihapus — textarea kini
     120px secara default (dipin di docaiFitRemediation §8). */
  check('judul seksi instruksi', creatorSrc.includes(`<div className="docai-step" style={{ textAlign: 'left' }}>Instruksi</div>`));
  check('tinggi default 5 baris (tanpa toggle perluas)', creatorSrc.includes('rows={5}') && !creatorSrc.includes('instrExpanded'));
  check('tombol perluas/ciutkan kolom DIHAPUS (v3)', !creatorSrc.includes('Perluas kolom') && !creatorSrc.includes('Ciutkan kolom'));
  check('state perluas DIHAPUS (v3)', !creatorSrc.includes('instrExpanded'));
  check('wiring nilai instruksi utuh', creatorSrc.includes('value={instruction}') && creatorSrc.includes('setInstruction(e.target.value)'));
  check('pemrosesan instruksi ke orchestrator TIDAK berubah', creatorSrc.includes('instruction: instruction.trim() || undefined'));

  console.log('\n[3] Inventaris field konteks (§7) — fungsional via collectProjectContext:');
  const fullProject = {
    id: 'prj_full', name: 'Pembangunan Gedung Kantor 3 Lantai',
    projectNumber: 'PRJ-2026-001', clientName: 'PT Klien Sejahtera',
    location: 'Jl. Merdeka No. 10, Bandung', province: 'Jawa Barat',
    cityRegency: 'Kota Bandung', institution: 'Dinas PU Kota Bandung',
    contractType: 'Lump Sum', fundingSource: 'APBD',
    ownerName: 'Budi Santoso', consultantName: 'PT Konsultan Pengawas Jaya',
    contractorName: 'PT Kontraktor Pelaksana Makmur', budgetYear: 2026,
    startDate: '2026-01-05', targetDate: '2026-12-20',
    costSummary: { grandTotal: 1250000000 },
  } as unknown as Project;
  const fullCompany = emptyProfile({
    name: 'PT Contoh Konstruksi', address: 'Jl. Industri No. 5, Surabaya',
    phone: '031-1234567', email: 'info@contoh.co.id',
    website: 'https://contoh.co.id', extra: 'NPWP 01.234.567.8-901.000',
  });
  const fullFields = collectProjectContext(fullProject, fullCompany, { sources: { project: true, company: true } });
  const fullNames = fullFields.map((f) => f.fieldName);
  check('proyek lengkap + perusahaan lengkap = 22 field', fullFields.length === 22, `dapat ${fullFields.length}`);
  for (const key of PROJECT_FIELDS_16) {
    check(`field proyek brief ada: ${key}`, fullNames.includes(key));
  }
  for (const key of COMPANY_FIELDS_6) {
    check(`field perusahaan tambahan ada: ${key}`, fullNames.includes(key));
  }
  check('semua 22 field terverifikasi bila terisi', fullFields.every((f) => f.verificationStatus === 'verified'));
  const rab = fullFields.find((f) => f.fieldName === 'totalNilaiRab');
  check('totalNilaiRab dari costSummary.grandTotal + sumber rab', rab?.value === '1250000000' && rab?.sourceType === 'rab');
  check('tanggal memakai sumber schedule', fullFields.find((f) => f.fieldName === 'tanggalMulai')?.sourceType === 'schedule' && fullFields.find((f) => f.fieldName === 'tanggalTargetSelesai')?.sourceType === 'schedule');
  check('namaKlien memakai clientName', fullFields.find((f) => f.fieldName === 'namaKlien')?.value === 'PT Klien Sejahtera');

  console.log('\n[3b] Field kosong = missing, TIDAK pernah dikarang:');
  const bareProject = { id: 'prj_bare', name: 'Proyek Tanpa Data' } as unknown as Project;
  const bareFields = collectProjectContext(bareProject, emptyProfile({}), { sources: { project: true, company: true } });
  check('proyek minim tetap mengembalikan 22 field', bareFields.length === 22, `dapat ${bareFields.length}`);
  const bareMissing = bareFields.filter((f) => f.fieldName !== 'namaProyek');
  check('21 field kosong berstatus missing + nilai kosong', bareMissing.every((f) => f.verificationStatus === 'missing' && f.value === ''));
  check('namaProyek terisi tetap verified', bareFields.find((f) => f.fieldName === 'namaProyek')?.verificationStatus === 'verified');
  check('tanpa proyek + tanpa profil = 0 field (bukan fallback)', collectProjectContext(null, null, { sources: { project: true, company: true } }).length === 0);

  console.log('\n[3c] Pengelompokan panel (§7) — ekspor CONTEXT_FIELD_GROUPS:');
  const groupedNames = CONTEXT_FIELD_GROUPS.flatMap((g) => g.fields);
  check('5 kelompok', CONTEXT_FIELD_GROUPS.length === 5, `dapat ${CONTEXT_FIELD_GROUPS.length}`);
  check('label kelompok sesuai brief + perusahaan', CONTEXT_FIELD_GROUPS.map((g) => g.label).join('|') === 'Identitas Proyek|Informasi Administratif|Pelaksana Proyek|Jadwal dan Anggaran|Profil Perusahaan');
  check('ukuran kelompok 4/6/2/4/6', CONTEXT_FIELD_GROUPS.map((g) => g.fields.length).join(',') === '4,6,2,4,6');
  check('kelompok mencakup semua 22 field tepat sekali', ALL_22.every((k) => groupedNames.filter((n) => n === k).length === 1) && groupedNames.length === 22);
  check('semua 22 field punya label ramah', ALL_22.every((k) => typeof CONTEXT_FIELD_LABELS[k] === 'string' && CONTEXT_FIELD_LABELS[k].length > 0));
  check('panel merender kelompok + fallback Lainnya', ctxSrc.includes('groupsToRender') && ctxSrc.includes("'Lainnya'"));
  /* Re-baseline 2026-11-19 (v3, mockup di-ACC owner): SEMUA kelompok
     default tertutup, termasuk Identitas Proyek — pengecualian identitas
     dihapus; panel konteks adalah rel ringkas. */
  check('kelompok dapat diciutkan (default: semua tertutup — v3)', ctxSrc.includes('init[g.id] = true') && !ctxSrc.includes("if (g.id !== 'identitas')") && ctxSrc.includes('aria-expanded={!shut}') && ctxSrc.includes('toggleGroup'));
  check('baris field: nama + nilai + penanda missing + label sumber', ctxSrc.includes('docai-ctxname') && ctxSrc.includes('docai-ctxvalue') && ctxSrc.includes('docai-ctxmissing') && ctxSrc.includes('CONTEXT_SOURCE_LABELS[f.sourceType]'));
  check('penanda "belum tersedia" dipertahankan', ctxSrc.includes('belum tersedia'));
  /* Re-baseline 2026-11-19 (v3): judul panel dipendekkan menjadi
     "Data konteks". */
  check('judul panel konteks (v3: Data konteks)', ctxSrc.includes('Data konteks') && !ctxSrc.includes('Ringkasan informasi yang akan digunakan'));
  check('kotak Perlu dilengkapi + [ISI: ...] dipertahankan', ctxSrc.includes('Perlu dilengkapi') && ctxSrc.includes('[ISI: ...]'));

  console.log('\n[4] Indikator kelengkapan (§7) — dari state nyata, tanpa hardcode:');
  /* Re-baseline 2026-11-19 (v3): indikator dipendekkan "18/22 tersedia". */
  check('header memakai available.length dari fields.length', ctxSrc.includes('{available.length}/{fields.length} tersedia'));
  check('available dihitung dari verificationStatus + value', ctxSrc.includes("f.verificationStatus !== 'missing' && f.value.trim()"));
  check('hitungan per kelompok dihitung nyata', ctxSrc.includes('{groupAvailable} / {g.rows.length} tersedia'));
  check('TIDAK ada hardcode "5 / 16" di panel', !ctxSrc.includes('5 / 16') && !ctxSrc.includes('5 dari 16'));
  check('TIDAK ada hardcode "5 / 16" di creator', !creatorSrc.includes('5 / 16') && !creatorSrc.includes('5 dari 16'));
  check('missing TIDAK memblokir generate (komentar + alur utuh)', creatorSrc.includes('TIDAK memblokir generate') && creatorSrc.includes('setGenMissing(res.missingFields)'));

  console.log('\n[5] Toggle sumber konteks (§8) — dua sumber, default ON, perilaku utuh:');
  check('default Data Proyek ON', creatorSrc.includes('const [srcProject, setSrcProject] = useState(true)'));
  check('default Profil Perusahaan ON', creatorSrc.includes('const [srcCompany, setSrcCompany] = useState(true)'));
  check('toggle diteruskan ke collectProjectContext', creatorSrc.includes('sources: { project: srcProject, company: srcCompany }'));
  check('toggle diteruskan ke panel', creatorSrc.includes('sources={{ project: srcProject, company: srcCompany }}'));
  check('panel: checkbox Data Proyek', ctxSrc.includes("onToggleSource('project'") && ctxSrc.includes('Data Proyek'));
  check('panel: checkbox Profil Perusahaan', ctxSrc.includes("onToggleSource('company'") && ctxSrc.includes('Profil Perusahaan'));
  check('panel: tidak ada sumber ketiga', !ctxSrc.includes("onToggleSource('rab'") && !ctxSrc.includes("onToggleSource('schedule'"));
  const noProject = collectProjectContext(fullProject, fullCompany, { sources: { project: false, company: true } });
  check('fungsional: proyek OFF membuang 16 field proyek', noProject.length === 6 && noProject.every((f) => f.sourceType === 'company'), `dapat ${noProject.length}`);
  const noCompany = collectProjectContext(fullProject, fullCompany, { sources: { project: true, company: false } });
  check('fungsional: perusahaan OFF membuang 6 field perusahaan', noCompany.length === 16 && noCompany.every((f) => f.sourceType !== 'company'), `dapat ${noCompany.length}`);
  check('fungsional: kedua sumber OFF = 0 field', collectProjectContext(fullProject, fullCompany, { sources: { project: false, company: false } }).length === 0);

  console.log('\n[6] Pemberitahuan paket/demo (§9) — dinamis, restriksi + disclosure utuh:');
  check('creator memakai gerbang dinamis planAllowsAiFeature', creatorSrc.includes("planAllowsAiFeature(creditBalance.plan, 'ai-document')"));
  check('creator memakai pesan dinamis aiFeatureLockedMessage', creatorSrc.includes("aiFeatureLockedMessage(creditBalance.plan, 'ai-document')"));
  check('creator merender pesan dinamis (bukan teks hardcode)', creatorSrc.includes('{docAiLockedMsg}'));
  check('creator TIDAK menghardcode teks Starter', !creatorSrc.includes('tidak tersedia untuk paket Starter'));
  check('creator TIDAK menghardcode MODE DEMO', !creatorSrc.includes('MODE DEMO'));
  check('creator TIDAK punya cek plan starter literal', !creatorSrc.includes("plan === 'starter'") && !creatorSrc.includes('creditBalance.plan === "starter"'));
  check('strip kompak: role=alert + ikon Lock kecil', creatorSrc.includes('role="alert"') && creatorSrc.includes('<Lock size={14}'));
  check('strip kompak: padding ringkas', creatorSrc.includes("padding: '8px 10px'"));
  check('fungsional: Free TIDAK boleh ai-document', planAllowsAiFeature('free', 'ai-document') === false);
  check('fungsional: Starter TIDAK boleh ai-document', planAllowsAiFeature('starter', 'ai-document') === false);
  check('fungsional: Pro BOLEH ai-document', planAllowsAiFeature('pro', 'ai-document') === true);
  check('fungsional: Business BOLEH ai-document', planAllowsAiFeature('business', 'ai-document') === true);
  const starterMsg = aiFeatureLockedMessage('starter', 'ai-document');
  check('pesan Starter menyebut paket + Professional', starterMsg.includes('Starter') && starterMsg.includes('Professional'));
  check('pesan Starter membawa disclosure MODE DEMO', starterMsg.includes('MODE DEMO') && starterMsg.includes('simulasi, bukan penagihan nyata'));
  const freeMsg = aiFeatureLockedMessage('free', 'ai-document');
  check('pesan Free menyebut hanya Chat AI + disclosure demo', freeMsg.includes('hanya Chat AI') && freeMsg.includes('MODE DEMO'));

  console.log('\n[7] Aksi utama (§10) — "Buat Draf dengan AI" + validasi utuh:');
  check('label tombol utama', creatorSrc.includes('Buat Draf dengan AI'));
  check('tombol full-width dalam kolom (docai-runbtn)', creatorSrc.includes('className="docai-btn-primary docai-runbtn"'));
  check('tombol nonaktif saat sibuk', creatorSrc.includes('disabled={busy}'));
  check('status loading (spinner + teks sibuk)', creatorSrc.includes("t('ai.doc.create.gen_busy')") && creatorSrc.includes('className="spin"'));
  check('status error dirender', creatorSrc.includes('className="docai-error"'));
  // Audit DocAI 2026-11-22 (D4): gerbang generate kini berlaku di KEDUA mode —
  // pengecualian `createMode === 'ai'` lama membiarkan paket terkunci generate
  // draf AI lewat mode form (tombol yang sama, panggilan AI yang sama).
  check('gerbang generate: AI terkunci → error + batal (kedua mode)', creatorSrc.includes("if (!docAiAllowed) { setError(docAiLockedMsg); return; }"));
  check('gerbang generate: pengecualian mode-form lama SUDAH dihapus', !creatorSrc.includes("if (!docAiAllowed && createMode === 'ai')"));
  check('tombol mode form tetap memakai label i18n gen', creatorSrc.includes("t('ai.doc.create.gen')"));
  check('klik tombol tetap memanggil runGenerate(false)', creatorSrc.includes('onClick={() => void runGenerate(false)}'));

  console.log('\n[8] Penjaga perilaku — generate, konteks, dan panel tidak berubah:');
  check('generate lewat orchestrator intent CREATE_DOCUMENT', creatorSrc.includes("intent: 'CREATE_DOCUMENT'") && creatorSrc.includes('documentStudioOrchestrator.handle'));
  check('konteks dari collectProjectContext', creatorSrc.includes('collectProjectContext('));
  check('contextSnapshot + promptVersion disimpan ke draf', creatorSrc.includes('contextSnapshot: contextFields') && creatorSrc.includes('promptVersion: res.promptVersion'));
  check('availableContext = field terverifikasi + bernilai', creatorSrc.includes('const availableContext = contextFields.filter('));
  check('panel dirender dengan props yang sama', creatorSrc.includes('<DocContextPanel') && creatorSrc.includes('fields={contextFields}') && creatorSrc.includes('missing={liveMissing}'));
  check('panel: antarmuka props tidak berubah', ctxSrc.includes('fields: ContextField[]') && ctxSrc.includes('sources: { project: boolean; company: boolean }') && ctxSrc.includes("onToggleSource: (which: 'project' | 'company', on: boolean) => void") && ctxSrc.includes('missing: MissingFieldInfo[]'));
  check('panel: ekspor label + grup tetap ada', ctxSrc.includes('export const CONTEXT_FIELD_LABELS') && ctxSrc.includes('export const CONTEXT_SOURCE_LABELS') && ctxSrc.includes('export const CONTEXT_FIELD_GROUPS'));
  check('creator: impor panel + label tetap ada', creatorSrc.includes("import { DocContextPanel, CONTEXT_FIELD_LABELS } from './DocContextPanel'"));
  check('ringkasan +N netral-layout (tanpa "di atas")', creatorSrc.includes('field tersedia lainnya (lihat ringkasan konteks)') && !creatorSrc.includes('lihat ringkasan konteks di atas'));

  console.log('\n[9] Workspace dua kolom (kontrak Child 2) — compose kiri, konteks kanan:');
  const count = (s: string, sub: string) => s.split(sub).length - 1;
  check('grid workspace ada tepat sekali', count(creatorSrc, '<div className="docai-workspace-2col">') === 1);
  check('kolom compose ada tepat sekali', count(creatorSrc, '<div className="docai-col-compose">') === 1);
  check('kolom konteks ada tepat sekali', count(creatorSrc, '<div className="docai-col-context">') === 1);
  const iWs = creatorSrc.indexOf('<div className="docai-workspace-2col">');
  const iCompose = creatorSrc.indexOf('<div className="docai-col-compose">');
  const iContext = creatorSrc.indexOf('<div className="docai-col-context">');
  check('urutan: grid → compose → konteks', iWs > -1 && iWs < iCompose && iCompose < iContext);
  check('mode buat di kolom compose', iCompose < creatorSrc.indexOf('docai-modeline') && creatorSrc.indexOf('docai-modeline') < iContext);
  check('instruksi AI di kolom compose', iCompose < creatorSrc.indexOf(`<div className="docai-step" style={{ textAlign: 'left' }}>Instruksi</div>`) && creatorSrc.indexOf(`<div className="docai-step" style={{ textAlign: 'left' }}>Instruksi</div>`) < iContext);
  check('pilih proyek di kolom compose', iCompose < creatorSrc.indexOf("t('ai.doc.create.opt_no_project')") && creatorSrc.indexOf("t('ai.doc.create.opt_no_project')") < iContext);
  check('instruksi mode form di kolom compose', iCompose < creatorSrc.indexOf("t('ai.doc.create.instr_ph')") && creatorSrc.indexOf("t('ai.doc.create.instr_ph')") < iContext);
  check('tombol generate di kolom compose', iCompose < creatorSrc.indexOf('Buat Draf dengan AI') && creatorSrc.indexOf('Buat Draf dengan AI') < iContext);
  check('panel konteks di kolom konteks', iContext < creatorSrc.indexOf('<DocContextPanel'));
  check('detail template di kolom konteks', iContext < creatorSrc.indexOf('docai-tmpldetail'));
  check('tombol generate TIDAK terduplikasi oleh pemindahan', count(creatorSrc, 'docai-btn-primary docai-runbtn') === 1);
  check('textarea form TIDAK terduplikasi oleh pemindahan', count(creatorSrc, "t('ai.doc.create.instr_ph')") === 1);
  check('panel konteks TIDAK terduplikasi oleh pemindahan', count(creatorSrc, '<DocContextPanel') === 1);

  console.log('\n[10] Judul ganda (koordinasi Child 2) — h2 + crumb dihapus, disclosure utuh:');
  check('TIDAK ada lagi crumb di DocCreator', !creatorSrc.includes('docai-crumb'));
  check('TIDAK ada lagi kunci crumb di DocCreator', !creatorSrc.includes("t('ai.doc.create.crumb')"));
  check('TIDAK ada lagi h2 AI Document di DocCreator', !creatorSrc.includes("t('ai.doc.create.ed_title')"));
  check('TIDAK ada lagi elemen h2 di DocCreator', !creatorSrc.includes('<h2>'));
  /* Re-baseline 2026-11-19 (v3, mockup di-ACC owner): subjudul halaman
     (pengungkapan DRAF + petunjuk cakupan) dan hero empty state DIHAPUS
     dari layar buat — form langsung mulai di bawah tab. Draf tetap
     berlabel DRAF di editor/riwayat. Kunci ed_empty_h tetap dipakai
     dialog konfirmasi draf kotor (:906) — hanya elemen h3/p hero yang
     hilang. */
  check('pengungkapan DRAF di layar buat DIHAPUS (v3)', !creatorSrc.includes("t('ai.doc.create.sub')"));
  check('petunjuk cakupan dokumen bebas DIHAPUS (v3)', !creatorSrc.includes('Dokumen bebas berbasis AI (surat, berita acara, laporan).'));
  check('hero empty state DIHAPUS (v3: tanpa h3 + p)', !creatorSrc.includes("<h3>{t('ai.doc.create.ed_empty_h')}</h3>") && !creatorSrc.includes("<p>{t('ai.doc.create.ed_empty_p')}</p>"));
  check('header editor tetap ada (input judul + meta)', creatorSrc.includes('className="docai-edtitle"') && creatorSrc.includes('className="docai-edmeta"'));

  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) { console.log('GAGAL:', failures.join(' | ')); process.exit(1); }
  console.log('SEMUA TEST DOCAI CREATOR + CONTEXT REDESIGN LOLOS');
}

void main();
