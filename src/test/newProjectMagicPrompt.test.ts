/**
 * newProjectMagicPrompt — penyintesis prompt + sapaan Magic AI dari form
 * Step 1 alur proyek baru (CreateProjectModal).
 *
 * Yang diuji (pure, tanpa registry/AI):
 *  1. Prompt memuat nama, kategori, luas bangunan + luas lahan, lantai,
 *     lokasi, tanggal mulai (format Indonesia), catatan, dan — yang
 *     paling penting — budget sebagai frasa "anggaran maksimal Rp…"
 *     (D5: rantai ask-back hanya melihat budget lewat teks prompt).
 *  2. Tanpa budget, frasa anggaran maksimal TIDAK muncul (tidak ada
 *     angka karangan).
 *  3. Sapaan memakai nama proyek + menegaskan budget sebagai batas atas;
 *     tanpa budget, kalimat budget tidak ada.
 *  4. Chip saran: tepat 6, kategori form di urutan pertama, tanpa duplikat.
 *  5. Format tampilan: digit budget berkelompok id-ID; tanggal ISO ke
 *     format Indonesia tanpa geser zona waktu.
 *
 * Jalankan: npx tsx src/test/newProjectMagicPrompt.test.ts
 */
import {
  buildNewProjectMagicPrompt,
  buildNewProjectGreeting,
  buildNewProjectGreetingSuggestions,
  formatBudgetInputDigits,
  formatDateId,
  formatRupiahId,
  NEW_PROJECT_GREETING_SUGGESTIONS,
  type NewProjectFormInput,
} from '../ai-tools/ezrab-ai/newProjectMagicPrompt';

let failures = 0;
let passes = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passes++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}
function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
function eq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function contains(haystack: string, needle: string, msg: string): void {
  ok(haystack.includes(needle), `${msg} — tidak ditemukan: ${JSON.stringify(needle)}`);
}
function notContains(haystack: string, needle: string, msg: string): void {
  ok(!haystack.includes(needle), `${msg} — seharusnya tidak ada: ${JSON.stringify(needle)}`);
}

const FULL_FORM: NewProjectFormInput = {
  name: 'Rumah Tinggal 2 Lantai Modern',
  clientName: 'Bpk. Hendra',
  location: 'Jakarta Selatan',
  buildingType: 'Rumah Tinggal',
  buildingAreaM2: 120,
  landAreaM2: 240,
  floorCount: 2,
  maxBudgetRp: 850000000,
  startDate: '2026-12-01',
  notes: 'Akses jalan sempit, material diutamakan lokal.',
};

console.log('newProjectMagicPrompt (form Step 1 -> Magic AI):');

console.log('\n[1] Prompt dari form lengkap:');
test('nama + kategori + kedua luas + lantai termuat', () => {
  const p = buildNewProjectMagicPrompt(FULL_FORM);
  contains(p, 'Rumah Tinggal 2 Lantai Modern', 'nama');
  contains(p, 'Kategori: Rumah Tinggal.', 'kategori');
  contains(p, 'Luas bangunan 120 m², luas lahan 240 m².', 'kedua luas');
  contains(p, 'Jumlah lantai: 2 lantai.', 'lantai');
});
test('budget muncul sebagai frasa "anggaran maksimal Rp…"', () => {
  const p = buildNewProjectMagicPrompt(FULL_FORM);
  contains(p, 'Anggaran maksimal Rp850.000.000.', 'frasa max-budget');
  contains(p, 'jangan melebihi anggaran maksimal Rp850.000.000', 'penegasan batas atas');
});
test('lokasi + tanggal mulai Indonesia + klien + catatan termuat', () => {
  const p = buildNewProjectMagicPrompt(FULL_FORM);
  contains(p, 'Lokasi: Jakarta Selatan.', 'lokasi');
  contains(p, 'Rencana mulai: 1 Desember 2026.', 'tanggal');
  contains(p, 'Klien: Bpk. Hendra.', 'klien');
  contains(p, 'Catatan: Akses jalan sempit, material diutamakan lokal.', 'catatan');
});
test('prompt selalu menutup dengan instruksi AHSP', () => {
  const p = buildNewProjectMagicPrompt(FULL_FORM);
  contains(p, 'analisa harga satuan (AHSP)', 'AHSP');
});

console.log('\n[2] Prompt tanpa budget / tanpa field opsional:');
test('tanpa budget: frasa anggaran maksimal TIDAK muncul', () => {
  const p = buildNewProjectMagicPrompt({ ...FULL_FORM, maxBudgetRp: undefined });
  notContains(p, 'anggaran maksimal', 'frasa max-budget');
  notContains(p, 'Rp', 'tidak ada angka rupiah karangan');
});
test('tanpa luas lahan: hanya luas bangunan yang ditulis', () => {
  const p = buildNewProjectMagicPrompt({ ...FULL_FORM, landAreaM2: undefined });
  contains(p, 'Luas bangunan 120 m².', 'luas bangunan');
  notContains(p, 'luas lahan', 'luas lahan');
});
test('nama kosong: fallback "Proyek Baru", tanpa crash', () => {
  const p = buildNewProjectMagicPrompt({ name: '   ' });
  contains(p, 'Buatkan RAB untuk proyek Proyek Baru.', 'fallback nama');
});

console.log('\n[3] Sapaan:');
test('sapaan memakai nama + budget sebagai batas atas', () => {
  const g = buildNewProjectGreeting(FULL_FORM);
  contains(g, 'Rumah Tinggal 2 Lantai Modern', 'nama di sapaan');
  contains(g, 'Anggaran maksimal Rp850.000.000 akan saya jadikan batas atas', 'budget batas atas');
});
test('sapaan tanpa budget: tanpa kalimat budget', () => {
  const g = buildNewProjectGreeting({ ...FULL_FORM, maxBudgetRp: undefined });
  notContains(g, 'Anggaran maksimal', 'kalimat budget');
  contains(g, 'Rumah Tinggal 2 Lantai Modern', 'nama tetap ada');
});

console.log('\n[4] Chip saran:');
test('tepat 6 chip kanonis, kategori form pertama', () => {
  const chips = buildNewProjectGreetingSuggestions({ ...FULL_FORM, buildingType: 'Gudang & Pabrik' });
  eq(chips.length, 6, 'jumlah chip');
  eq(chips[0], 'Gudang', 'kategori form pertama');
  eq(new Set(chips).size, 6, 'tanpa duplikat');
  eq(chips.slice(1).join('|'), 'Rumah Tinggal|Landscape & Taman|Drainase|Jembatan|Renovasi', 'sisa urutan kanonis');
});
test('kategori tanpa chip (mis. Apartemen): urutan kanonis utuh', () => {
  const chips = buildNewProjectGreetingSuggestions({ ...FULL_FORM, buildingType: 'Apartemen' });
  eq(chips.join('|'), [...NEW_PROJECT_GREETING_SUGGESTIONS].join('|'), 'urutan kanonis');
});
test('Landscape & Kawasan dipetakan ke chip Landscape & Taman', () => {
  const chips = buildNewProjectGreetingSuggestions({ ...FULL_FORM, buildingType: 'Landscape & Kawasan' });
  eq(chips[0], 'Landscape & Taman', 'chip pertama');
});

console.log('\n[5] Format tampilan:');
test('formatBudgetInputDigits mengelompokkan ribuan id-ID', () => {
  eq(formatBudgetInputDigits('850000000'), '850.000.000', '850 jt');
  eq(formatBudgetInputDigits(''), '', 'kosong tetap kosong');
  eq(formatBudgetInputDigits('Rp 850.000.000'), '850.000.000', 'non-digit diabaikan');
});
test('formatDateId tanpa geser zona waktu', () => {
  eq(formatDateId('2026-12-01'), '1 Desember 2026', '1 Des');
  eq(formatDateId('2026-01-31'), '31 Januari 2026', '31 Jan');
  eq(formatDateId(undefined), null, 'undefined -> null');
  eq(formatDateId('bukan-tanggal'), null, 'invalid -> null');
});
test('formatRupiahId: null untuk 0/negatif/undefined', () => {
  eq(formatRupiahId(850000000), 'Rp850.000.000', 'format');
  eq(formatRupiahId(0), null, '0 -> null');
  eq(formatRupiahId(undefined), null, 'undefined -> null');
});

console.log(`\nHasil newProjectMagicPrompt: ${passes} lolos, ${failures} gagal`);
if (failures > 0) process.exit(1);
console.log('SEMUA TEST newProjectMagicPrompt LOLOS');
