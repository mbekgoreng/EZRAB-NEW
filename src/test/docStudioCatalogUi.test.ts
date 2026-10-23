/**
 * DOCUMENT STUDIO POLISH (UI-1) — Template Studio berkategori, gerbang
 * status final, kop per-dokumen, dan mode pratinjau.
 *
 * Tiga lapis:
 * 1. Logika murni katalog (components/templateCatalog.ts): pengelompokan
 *    kategori, pencarian, preview struktur scaffold.
 * 2. Gerbang final di level logika yang dipakai komponen (store.ts):
 *    approveDraft adalah satu-satunya jalan ke 'final' dan deriveDisplayStatus
 *    memetakan label tampil polish §4.
 * 3. Kontrak sumber: DocCreator tidak lagi menawarkan opsi final pada select
 *    status, memakai approveDraft/deriveDisplayStatus, memilih kop per
 *    dokumen, dan meneruskan editable ke DocEditor; DocPanels memakai
 *    validateFullKopFile + kopModeEffective + konfirmasi hapus; DocEditor
 *    mendukung prop editable.
 *
 * Jalankan: npx tsx src/test/docStudioCatalogUi.test.ts
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
import {
  catalogCategoryOf, filterCatalogEntries, groupCatalogEntries, scaffoldPreviewLines,
  type CatalogTemplateEntry,
} from '../ai-tools/document-ai/components/templateCatalog';
import { TEMPLATE_CATEGORIES } from '../ai-tools/document-ai/docTemplates';
import { approveDraft, deriveDisplayStatus, type DraftRecord } from '../ai-tools/document-ai/store';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

function main(): void {
  console.log('\n[1] Katalog — pengelompokan kategori (6 grup resmi + Template Saya):');
  check('TEMPLATE_CATEGORIES berisi 6 grup', TEMPLATE_CATEGORIES.length === 6);
  const entries: CatalogTemplateEntry[] = [
    { id: 'surat-penawaran', name: 'Surat Penawaran', desc: 'Penawaran harga proyek.' },
    { id: 'berita-acara', name: 'Berita Acara', desc: 'Catatan kesepakatan para pihak.' },
    { id: 'surat', name: 'Surat Resmi', desc: 'Surat administrasi umum.' },
    { id: 'laporan-k3', name: 'Laporan K3', desc: 'Keselamatan kerja.' },
    { id: 'punya-saya', name: 'BA Kolom Saya', desc: 'Template pribadi.' },
    { id: 'aneh', name: 'Tanpa Kategori', desc: 'Id tidak dikenal.' },
  ];
  const userBase = new Map<string, string>([['punya-saya', 'notulen']]);
  const groups = groupCatalogEntries(entries, userBase);
  const byId = new Map(groups.map((g) => [g.id, g.entries.map((e) => e.id)]));
  check('surat penawaran → grup penawaran-tender', byId.get('penawaran-tender')?.includes('surat-penawaran') === true);
  check('berita acara → grup berita-acara', byId.get('berita-acara')?.includes('berita-acara') === true);
  check('surat → grup surat-administrasi', byId.get('surat-administrasi')?.includes('surat') === true);
  check('laporan K3 → grup qc-k3', byId.get('qc-k3')?.includes('laporan-k3') === true);
  check('template pengguna mengikuti kategori dasarnya (notulen → rapat)', byId.get('rapat')?.includes('punya-saya') === true);
  check('id tak dikenal → grup template-saya', byId.get('template-saya')?.includes('aneh') === true);
  check('grup kosong tidak dirender', groups.every((g) => g.entries.length > 0));
  check('urutan grup kanonis (surat-administrasi sebelum berita-acara)', groups[0].id === 'surat-administrasi' && groups[1].id === 'berita-acara');
  check('catalogCategoryOf: bebas → surat-administrasi', catalogCategoryOf('bebas', new Map()) === 'surat-administrasi');
  check('catalogCategoryOf: dasar pengguna tak dikenal → template-saya', catalogCategoryOf('x', new Map([['x', '???']])) === 'template-saya');

  console.log('\n[2] Katalog — pencarian nama/kegunaan:');
  check('query kosong mengembalikan semua', filterCatalogEntries(entries, '  ').length === entries.length);
  check('cocok pada nama (tidak peka huruf)', filterCatalogEntries(entries, 'PENAWARAN').map((e) => e.id).join() === 'surat-penawaran');
  check('cocok pada deskripsi/kegunaan', filterCatalogEntries(entries, 'keselamatan').map((e) => e.id).join() === 'laporan-k3');
  check('tanpa kecocokan → kosong', filterCatalogEntries(entries, 'xyz-tidak-ada').length === 0);

  console.log('\n[3] Katalog — preview struktur dari scaffold:');
  const lines = scaffoldPreviewLines(
    'Struktur: judul BERITA ACARA, nomor & tanggal, pembuka (hari/tanggal, lokasi proyek), identitas para pihak, dasar pelaksanaan, penutup.',
  );
  check('awalan "Struktur:" dibuang & segmen teratas terpisah', lines[0] === 'judul BERITA ACARA' && lines[1] === 'nomor & tanggal');
  check('koma di dalam kurung tidak memecah segmen', lines[2] === 'pembuka (hari/tanggal, lokasi proyek)');
  check('dibatasi maksimal 4 baris', lines.length === 4);
  check('scaffold kosong → tanpa preview', scaffoldPreviewLines('').length === 0 && scaffoldPreviewLines(undefined).length === 0);

  console.log('\n[4] Gerbang final — approveDraft satu-satunya jalan (logika store):');
  const base: DraftRecord = {
    id: 'd1', templateId: 'surat', templateName: 'Surat Resmi', title: 'Surat Uji',
    content: '<p>isi</p>', contentFormat: 'html', status: 'reviewed', createdAt: 1, updatedAt: 2,
  };
  const okRes = approveDraft(base, 'Budi Santoso', 123456);
  check('nama penyetuju terisi → final + tercatat', okRes.ok && okRes.draft.status === 'final' && okRes.draft.approvedBy === 'Budi Santoso' && okRes.draft.approvedAt === 123456);
  const noName = approveDraft(base, '   ');
  check('nama kosong → ditolak, status tidak berubah', !noName.ok && noName.draft.status === 'reviewed' && !!noName.reason);
  check('approveDraft murni (argumen tidak diubah)', base.status === 'reviewed' && base.approvedBy === undefined);

  console.log('\n[5] deriveDisplayStatus — label tampil polish §4:');
  check('final tetap Final walau ada missing', deriveDisplayStatus({ ...base, status: 'final' }, 3) === 'Final');
  check('missing > 0 → Perlu dilengkapi', deriveDisplayStatus(base, 2) === 'Perlu dilengkapi');
  check('review → Perlu ditinjau', deriveDisplayStatus({ ...base, status: 'review' }, 0) === 'Perlu ditinjau');
  check('editing → Perlu ditinjau', deriveDisplayStatus({ ...base, status: 'editing' }, 0) === 'Perlu ditinjau');
  check('reviewed tanpa missing → Siap disetujui', deriveDisplayStatus(base, 0) === 'Siap disetujui');
  check('draft tanpa missing → Draf', deriveDisplayStatus({ ...base, status: 'draft' }, 0) === 'Draf');

  console.log('\n[6] Kontrak sumber — DocCreator (gerbang final, kop per-dokumen, pratinjau, katalog):');
  const creatorSrc = read('../ai-tools/document-ai/components/DocCreator.tsx');
  check('tidak ada opsi final yang bisa dipilih manual', !creatorSrc.includes('<option value="final">'));
  check('memakai approveDraft dari store', creatorSrc.includes('approveDraft('));
  check('memakai deriveDisplayStatus untuk badge', creatorSrc.includes('deriveDisplayStatus(draft, statusMissingCount)'));
  check('tombol Setujui & Tandai Final ada', creatorSrc.includes('Setujui &amp; Tandai Final') || creatorSrc.includes('Setujui & Tandai Final'));
  check('persetujuan final terkunci (approvedBy ditampilkan)', creatorSrc.includes('disetujui oleh'));
  check('perubahan isi membatalkan persetujuan lama', creatorSrc.includes('approvedBy: undefined'));
  check('kop per-dokumen tersimpan ke companyProfileId', creatorSrc.includes('companyProfileId: profileId || null'));
  check('daftar profil dibaca (listProfiles)', creatorSrc.includes('listProfiles()'));
  check('ekspor memakai profil efektif draf', creatorSrc.includes('profile: effectiveProfile'));
  check('editor memakai kop profil efektif', creatorSrc.includes('kopHtml(effectiveProfile)'));
  check('mode pratinjau diteruskan ke editor', creatorSrc.includes('editable={!previewMode}'));
  check('label mode pratinjau jelas', creatorSrc.includes('Mode Pratinjau — dokumen tidak dapat disunting'));
  check('katalog memakai TEMPLATE_CATEGORIES', creatorSrc.includes('TEMPLATE_CATEGORIES.map'));
  check('katalog memakai pengelompokan + pencarian', creatorSrc.includes('groupCatalogEntries(') && creatorSrc.includes('filterCatalogEntries('));
  check('kartu katalog punya penanda Terpilih', creatorSrc.includes('Terpilih'));
  check('panel detail: data yang diambil dari proyek', creatorSrc.includes('Data yang diambil dari proyek &amp; perusahaan') || creatorSrc.includes('Data yang diambil dari proyek & perusahaan'));
  check('panel detail: pilihan Buat dengan AI / Isi Manual', creatorSrc.includes('Buat dengan AI') && creatorSrc.includes('Isi Manual'));

  console.log('\n[7] Kontrak sumber — DocPanels (kop dua mode + konfirmasi) & DocEditor (editable):');
  const panelsSrc = read('../ai-tools/document-ai/components/DocPanels.tsx');
  check('mode Kop Terstruktur ada', panelsSrc.includes('Kop Terstruktur'));
  check('mode Kop Gambar Penuh ada', panelsSrc.includes('Kop Gambar Penuh'));
  check('upload kop penuh via validateFullKopFile', panelsSrc.includes('validateFullKopFile'));
  check('peringatan fallback via kopModeEffective', panelsSrc.includes('kopModeEffective'));
  check('kontrol lebar % dan margin mm kop penuh', panelsSrc.includes('fullKopWidthPct') && panelsSrc.includes('fullKopMarginMm'));
  check('konfirmasi inline dua langkah (Ya, Hapus)', panelsSrc.includes('Ya, Hapus') && panelsSrc.includes('confirmKind'));
  check('hapus logo lewat konfirmasi, bukan langsung', panelsSrc.includes("setConfirmKind('logo')"));
  check('hapus gambar kop lewat konfirmasi', panelsSrc.includes("setConfirmKind('fullkop')"));
  check('hapus profil lewat konfirmasi', panelsSrc.includes("setConfirmKind('profile')"));
  check(
    'SavedDocsPanel: final terkunci sebagai badge, bukan opsi select status',
    panelsSrc.includes('docai-statusbadge st-final') &&
      (panelsSrc.match(/<option value="final">/g) ?? []).length === 1, // satu-satunya = filter daftar (sah)
  );
  const editorSrc = read('../ai-tools/document-ai/components/DocEditor.tsx');
  check('DocEditorProps.editable opsional ada', editorSrc.includes('editable?: boolean'));
  check('DocEditor menerapkan setEditable', editorSrc.includes('editor.setEditable(editable)'));
  check('toolbar disembunyikan saat tidak editable', editorSrc.includes('{editable && <DocToolbar'));

  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) { console.log('GAGAL:', failures.join(' | ')); process.exit(1); }
  console.log('SEMUA TEST DOC STUDIO CATALOG UI LOLOS');
}

main();
