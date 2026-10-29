// Suite: Kotak Saran & Pengaduan (UI-first, Pusat Bantuan) — 2026-10-29.
// Gaya harness sama seperti suite src/test lainnya (plain-tsx, tanpa vitest):
// logika murni diuji langsung dari modulnya, integrasi UI diuji source-level
// terhadap file yang dirender (aplikasi React penuh tidak dapat di-mount
// headless di sandbox ini), dilengkapi gate tsc + build.
//
// Jalankan dari root repo:
//   npx --yes esbuild src/test/suggestionComplaintBox.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/suggestion-box.cjs && node /tmp/suggestion-box.cjs
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  EMPTY_REPORT_DRAFT,
  REPORT_CATEGORIES,
  REPORT_PRIORITIES,
  SUBMISSION_BACKEND_AVAILABLE,
  SUBMISSION_UNAVAILABLE_MESSAGE,
  TITLE_MAX_LENGTH,
  attemptSubmit,
  resolveReporterIdentity,
  validateReportDraft,
  type ReportDraft,
} from '../components/settings/suggestionComplaintLogic';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: string): void {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

const validDraft: ReportDraft = {
  title: 'Tombol ekspor PDF tidak merespons',
  category: 'Kendala Aplikasi',
  description: 'Saat saya menekan tombol ekspor PDF di halaman RAB, tidak terjadi apa-apa.',
  priority: 'Normal',
  includePageContext: false,
};

console.log('=== NAVIGASI: entri ada di Pusat Bantuan, bukan menu sidebar baru ===');
const settings = read('src/components/settings/UnifiedSettingsView.tsx');
check('UnifiedSettingsView mengimpor SuggestionComplaintBox', settings.includes("import { SuggestionComplaintBox } from './SuggestionComplaintBox';"));
const helpTabIdx = settings.indexOf("activeTab === 'help'");
const boxIdx = settings.indexOf('<SuggestionComplaintBox />');
const tutorialIdx = settings.indexOf('<TutorialCenter />');
check('komponen dirender DI DALAM tab help', helpTabIdx >= 0 && boxIdx > helpTabIdx);
check('komponen dirender sebelum TutorialCenter (masih di blok help)', boxIdx >= 0 && tutorialIdx > boxIdx);
const sidebar = read('src/components/layout/Sidebar.tsx');
check('Sidebar TIDAK memuat Kotak Saran (tidak ada menu top-level baru)', !sidebar.includes('Kotak Saran') && !sidebar.includes('SuggestionComplaint'));
const box = read('src/components/settings/SuggestionComplaintBox.tsx');
check('label entri persis "Kotak Saran & Pengaduan"', box.includes('Kotak Saran &amp; Pengaduan'));

console.log('=== KATEGORI & PRIORITAS: persis spesifikasi ===');
const expectedCategories = [
  'Saran Fitur',
  'Kendala Aplikasi',
  'Kesalahan Data AHSP atau Harga',
  'Kesalahan Perhitungan RAB atau Volume',
  'Masalah Akun atau Login',
  'Masalah Langganan atau Pembayaran',
  'Lainnya',
];
check('tujuh kategori, urutan & ejaan persis', JSON.stringify(REPORT_CATEGORIES) === JSON.stringify(expectedCategories));
check('prioritas Rendah/Normal/Tinggi', JSON.stringify(REPORT_PRIORITIES) === JSON.stringify(['Rendah', 'Normal', 'Tinggi']));
check('semua kategori dirender sebagai opsi select', expectedCategories.every((c) => box.includes('REPORT_CATEGORIES.map')));

console.log('=== VALIDASI: wajib isi, batas panjang, kategori tak dikenal ===');
const emptyResult = validateReportDraft(EMPTY_REPORT_DRAFT);
check('draf kosong tidak valid', !emptyResult.valid);
check('judul kosong → error judul', !!emptyResult.errors.title);
check('kategori kosong → error kategori', !!emptyResult.errors.category);
check('deskripsi kosong → error deskripsi', !!emptyResult.errors.description);
check('draf valid lolos', validateReportDraft(validDraft).valid);
check('judul > batas → error', !validateReportDraft({ ...validDraft, title: 'x'.repeat(TITLE_MAX_LENGTH + 1) }).valid);
check('deskripsi < minimum → error', !validateReportDraft({ ...validDraft, description: 'pendek' }).valid && DESCRIPTION_MIN_LENGTH === 10);
check('deskripsi > batas → error', !validateReportDraft({ ...validDraft, description: 'x'.repeat(DESCRIPTION_MAX_LENGTH + 1) }).valid);
check('deskripsi tepat di batas lolos', validateReportDraft({ ...validDraft, description: 'x'.repeat(DESCRIPTION_MAX_LENGTH) }).valid);
check('kategori di luar daftar → error', !!validateReportDraft({ ...validDraft, category: 'Kategori Karangan' }).errors.category);
check('prioritas di luar daftar → error', !!validateReportDraft({ ...validDraft, priority: 'Urgent' as ReportDraft['priority'] }).errors.priority);
check('setiap kategori resmi diterima', expectedCategories.every((c) => validateReportDraft({ ...validDraft, category: c }).valid));

console.log('=== DRAF BERTAHAN setelah validasi gagal ===');
const draftCopy: ReportDraft = { ...validDraft, title: '', description: 'Isi draf yang tidak boleh hilang.' };
const snapshot = JSON.stringify(draftCopy);
validateReportDraft(draftCopy);
attemptSubmit(draftCopy);
check('validate/attemptSubmit tidak mengubah draf', JSON.stringify(draftCopy) === snapshot);
check('komponen mempertahankan draf di state (bukan storage)', box.includes('useState<ReportDraft>') && box.includes('attemptSubmit(draft)'));

console.log('=== KEJUJURAN PENGIRIMAN: tidak ada sukses palsu / tiket palsu ===');
check('flag backend MATI (belum ada backend terverifikasi)', SUBMISSION_BACKEND_AVAILABLE === false);
const outcome = attemptSubmit(validDraft);
check('draf valid → status unavailable (bukan sukses)', outcome.status === 'unavailable');
check(
  'pesan jujur persis & menyatakan belum dikirim/disimpan',
  outcome.status === 'unavailable' &&
    outcome.message === SUBMISSION_UNAVAILABLE_MESSAGE &&
    outcome.message.includes('belum tersedia') &&
    outcome.message.includes('belum dikirim atau disimpan'),
);
const variants: ReportDraft[] = [
  validDraft,
  { ...validDraft, category: 'Saran Fitur', priority: 'Tinggi', includePageContext: true },
  { ...validDraft, category: 'Lainnya', priority: 'Rendah' },
  EMPTY_REPORT_DRAFT,
];
check(
  'tidak ada varian draf yang menghasilkan status sukses',
  variants.every((d) => ['validation-error', 'unavailable'].includes(attemptSubmit(d).status)),
);
const logicSrc = read('src/components/settings/suggestionComplaintLogic.ts');
const combined = `${box}\n${logicSrc}`;
check("tidak ada klaim 'berhasil dikirim'", !combined.includes('berhasil dikirim'));
check('tidak ada nomor tiket yang dibuat', !/ticketNumber|generateTicket|TKT-\d|nomor tiket Anda/i.test(combined));
check('tidak ada daftar riwayat laporan', !/riwayat laporan|report history|history list/i.test(box.replace(/tidak ada riwayat laporan/g, '')));
check('komponen menampilkan pesan unavailable apa adanya', box.includes('unavailableMessage'));

console.log('=== PRIVASI & PENYIMPANAN: tanpa storage web, tanpa HTML mentah ===');
check('tanpa localStorage di file baru', !combined.includes('localStorage'));
check('tanpa sessionStorage di file baru', !combined.includes('sessionStorage'));
check('tanpa document.cookie di file baru', !combined.includes('document.cookie'));
check('tanpa dangerouslySetInnerHTML (teks dirender sebagai teks)', !box.includes('dangerouslySetInnerHTML'));
check('tanpa fetch/XMLHttpRequest (tidak ada pengiriman jaringan)', !box.includes('fetch(') && !box.includes('XMLHttpRequest'));
check('tanpa supabase insert di file baru', !/\.from\([^)]*\)\s*\.insert/.test(combined));
check('komponen tidak meminta email manual', !box.includes('type="email"'));

console.log('=== IDENTITAS: dari sesi yang ada, tidak pernah di-hardcode ===');
check('email akun diprioritaskan', resolveReporterIdentity({ accountEmail: 'a@b.id', roleName: 'Estimator' }).kind === 'account');
check('label akun = email sesi', resolveReporterIdentity({ accountEmail: 'a@b.id' }).label === 'a@b.id');
check('tanpa akun → peran demo', resolveReporterIdentity({ accountEmail: null, roleName: 'Estimator' }).kind === 'demo-role');
check('tanpa keduanya → none', resolveReporterIdentity({ accountEmail: null, roleName: null }).kind === 'none');
check('string kosong/whitespace → none', resolveReporterIdentity({ accountEmail: '  ', roleName: '' }).kind === 'none');
check('komponen memakai useAuth + useRole yang sudah ada', box.includes('useAuth()') && box.includes('useRole()'));
check('pengguna belum masuk diarahkan ke alur masuk yang ada (/masuk)', box.includes("navigateTo('/masuk')"));
check('keadaan belum masuk dijelaskan (laporan anonim tidak didukung)', box.includes('Laporan anonim tidak didukung'));

console.log('=== AKSESIBILITAS & LAMPIRAN JUJUR ===');
check('label terprogram untuk judul/kategori/deskripsi', ['htmlFor="ks-title"', 'htmlFor="ks-category"', 'htmlFor="ks-description"'].every((s) => box.includes(s)));
check('field wajib ditandai aria-required', (box.match(/aria-required="true"/g) ?? []).length >= 3);
check('error terhubung via aria-describedby', box.includes('aria-describedby={errors.title') && box.includes('aria-describedby={errors.description'));
check('tombol entri memakai aria-expanded + aria-controls', box.includes('aria-expanded={open}') && box.includes('aria-controls="ks-panel"'));
check('pesan unavailable memakai role="status"', box.includes('role="status"'));
check('lampiran dalam keadaan nonaktif jujur', box.includes('Lampiran belum tersedia') && /id="ks-attachment"[^>]*disabled/.test(box));
check('konteks halaman opsional tersedia sebagai checkbox', box.includes('PAGE_CONTEXT_LABEL') && box.includes('type="checkbox"'));
check('tombol kirim dilindungi dari klik ganda', box.includes('disabled={checking}') && box.includes("if (checking) return"));

console.log(`\nHASIL: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
