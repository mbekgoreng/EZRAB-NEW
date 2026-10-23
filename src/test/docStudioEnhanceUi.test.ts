/**
 * DOCUMENT STUDIO POLISH (UI-2) — Enhance Text seleksi, preset poles,
 * review profesional (ringkasan + grup kategori + status persisten).
 *
 * Tiga lapis:
 * 1. Logika murni enhance (components/enhanceActions.ts): 10 aksi §5,
 *    alasan penolakan seleksi, validasi rentang sebelum menerapkan.
 * 2. Logika murni review/poles (components/reviewPolish.ts):
 *    pengelompokan kategori §7 + preset instruksi §6.
 * 3. Kontrak sumber: DocEnhance memakai intent ENHANCE_TEXT dan hanya
 *    memanggil AI dari tombol; DocStudioReview memakai summarizeFindings,
 *    grup kategori, status persisten, konfirmasi abaikan, dan preset
 *    poles; DocCreator me-render DocEnhance, men-snapshot versi 'enhance',
 *    dan meneruskan contextFields + onFindingStatusesChange.
 *
 * Jalankan: npx tsx src/test/docStudioEnhanceUi.test.ts
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ENHANCE_ACTIONS, enhanceActionLabel, rangeTextStillMatches, selectionBlockReason,
} from '../ai-tools/document-ai/components/enhanceActions';
import {
  POLISH_PRESETS, REVIEW_CATEGORY_LABELS, groupFindingsByCategory,
} from '../ai-tools/document-ai/components/reviewPolish';
import { MAX_ENHANCE_SELECTION_CHARS } from '../ai-tools/document-ai/service';
import { ENHANCE_TRANSFORMS, type ReviewFinding } from '../ai-tools/document-ai/types';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

function finding(id: string, category: ReviewFinding['category'], severity: ReviewFinding['severity']): ReviewFinding {
  return {
    id, severity, category,
    description: `Temuan ${id}`, reason: 'alasan uji', suggestion: 'saran uji', status: 'open',
  };
}

function main(): void {
  console.log('\n[1] Enhance — definisi 10 aksi (polish §5):');
  check('tepat 10 aksi', ENHANCE_ACTIONS.length === 10);
  check(
    'transform mencakup seluruh ENHANCE_TRANSFORMS tanpa duplikat',
    ENHANCE_ACTIONS.length === ENHANCE_TRANSFORMS.length &&
      ENHANCE_TRANSFORMS.every((tr) => ENHANCE_ACTIONS.some((a) => a.transform === tr)),
  );
  check(
    'label tombol sesuai rumusan §5',
    JSON.stringify(ENHANCE_ACTIONS.map((a) => a.label)) ===
      JSON.stringify([
        'Sempurnakan bahasa', 'Buat lebih formal', 'Perjelas maksud', 'Ringkas teks',
        'Perluas penjelasan', 'Perbaiki tata bahasa dan ejaan',
        'Ubah menjadi bahasa teknis konstruksi', 'Susun menjadi poin-poin',
        'Ubah menjadi tabel', 'Tulis ulang dengan instruksi sendiri',
      ]),
  );
  check('enhanceActionLabel untuk bebas', enhanceActionLabel('bebas') === 'Tulis ulang dengan instruksi sendiri');

  console.log('\n[2] Enhance — alasan penolakan & validasi rentang:');
  check('teks kosong ditolak', selectionBlockReason('   ') !== null);
  check('teks normal lolos', selectionBlockReason('Satu kalimat resmi.') === null);
  const tooLong = 'x'.repeat(MAX_ENHANCE_SELECTION_CHARS + 1);
  check(
    'teks melebihi batas ditolak dengan alasan menyebut batas',
    (selectionBlockReason(tooLong) ?? '').includes(String(MAX_ENHANCE_SELECTION_CHARS)),
  );
  check(
    'teks tepat di batas lolos',
    selectionBlockReason('x'.repeat(MAX_ENHANCE_SELECTION_CHARS)) === null,
  );
  check('rentang masih sama → valid', rangeTextStillMatches('teks sama', 'teks sama') === true);
  check('rentang berubah → tidak valid', rangeTextStillMatches('teks berubah', 'teks sama') === false);
  check('rentang kosong vs terambil → tidak valid', rangeTextStillMatches('', 'teks sama') === false);

  console.log('\n[3] Review — pengelompokan kategori (polish §7):');
  check(
    'label 5 kategori sesuai §7',
    REVIEW_CATEGORY_LABELS.kelengkapan === 'Kelengkapan data' &&
      REVIEW_CATEGORY_LABELS.konsistensi === 'Konsistensi' &&
      REVIEW_CATEGORY_LABELS.struktur === 'Struktur dokumen' &&
      REVIEW_CATEGORY_LABELS.bahasa === 'Bahasa dan keterbacaan' &&
      REVIEW_CATEGORY_LABELS.sumber === 'Sumber dan verifikasi',
  );
  const sample = [
    finding('s1', 'sumber', 'low'),
    finding('k1', 'kelengkapan', 'medium'),
    finding('k2', 'kelengkapan', 'high'),
    finding('b1', 'bahasa', 'low'),
    finding('k3', 'kelengkapan', 'low'),
    finding('t1', 'struktur', 'high'),
  ];
  const groups = groupFindingsByCategory(sample);
  check(
    'urutan grup mengikuti kategori resmi, grup kosong (konsistensi) tidak dirender',
    JSON.stringify(groups.map((g) => g.category)) ===
      JSON.stringify(['kelengkapan', 'struktur', 'bahasa', 'sumber']),
    groups.map((g) => g.category).join(','),
  );
  check(
    'di dalam grup terurut severity tinggi → sedang → rendah',
    JSON.stringify(groups[0].findings.map((f) => f.id)) === JSON.stringify(['k2', 'k1', 'k3']),
  );
  check(
    'semua temuan terpelihara (tidak ada yang hilang)',
    groups.reduce((n, g) => n + g.findings.length, 0) === sample.length,
  );
  check('daftar kosong → tidak ada grup', groupFindingsByCategory([]).length === 0);

  console.log('\n[4] Polish — preset instruksi (polish §6):');
  check('tepat 4 preset revisi', POLISH_PRESETS.length === 4);
  check(
    'label preset sesuai §6',
    JSON.stringify(POLISH_PRESETS.map((p) => p.label)) ===
      JSON.stringify(['Sempurnakan Bahasa', 'Rapikan Struktur', 'Buat Lebih Profesional', 'Sesuaikan Template']),
  );
  check('id preset unik', new Set(POLISH_PRESETS.map((p) => p.id)).size === POLISH_PRESETS.length);
  check(
    'setiap instruksi preset menegaskan fakta dipertahankan',
    POLISH_PRESETS.every((p) => /fakta/i.test(p.instruction) && /angka/.test(p.instruction)),
  );
  check(
    'setiap instruksi preset menegaskan penanda [ISI: ...] dipertahankan',
    POLISH_PRESETS.every((p) => p.instruction.includes('[ISI:')),
  );
  check(
    'hanya Sesuaikan Template yang memakai templateMeta',
    POLISH_PRESETS.filter((p) => p.usesTemplateMeta).map((p) => p.id).join() === 'sesuaikan-template',
  );

  console.log('\n[5] Kontrak sumber — DocEnhance:');
  const enhSrc = read('../ai-tools/document-ai/components/DocEnhance.tsx');
  check('memakai intent ENHANCE_TEXT', enhSrc.includes("intent: 'ENHANCE_TEXT'"));
  check('batas seleksi dari service (MAX_ENHANCE_SELECTION_CHARS)', enhSrc.includes('MAX_ENHANCE_SELECTION_CHARS'));
  check('tombol ambil teks terpilih ada', enhSrc.includes('Ambil Teks Terpilih dari Editor'));
  check('catatan jujur bila belum memilih teks', enhSrc.includes('Pilih dulu teks di editor'));
  check('pratinjau dua kolom Teks Asli vs Hasil Sempurnaan', enhSrc.includes('Teks Asli') && enhSrc.includes('Hasil Sempurnaan'));
  check('aksi Terapkan/Batalkan/Coba Lagi ada', ['Terapkan pada Rentang', 'Batalkan', 'Coba Lagi'].every((s) => enhSrc.includes(s)));
  check('validasi rentang sebelum menerapkan', enhSrc.includes('rangeTextStillMatches'));
  check('error menampilkan teks asli tidak berubah', enhSrc.includes('Teks asli tidak berubah'));
  check(
    'AI hanya dipanggil dari satu titik (runTransform)',
    enhSrc.split('documentStudioOrchestrator.handle').length - 1 === 1,
  );

  console.log('\n[6] Kontrak sumber — DocStudioReview profesional:');
  const revSrc = read('../ai-tools/document-ai/components/DocStudioReview.tsx');
  check('ringkasan dari summarizeFindings', revSrc.includes('summarizeFindings(findings)'));
  check('chip ringkasan lengkap', ['Kritis (Tinggi)', 'Peringatan (Sedang)', 'Saran (Rendah)', 'Field wajib belum tersedia'].every((s) => revSrc.includes(s)));
  check('pengelompokan kategori dipakai', revSrc.includes('groupFindingsByCategory(findings)'));
  check('preset poles dirender dari POLISH_PRESETS', revSrc.includes('POLISH_PRESETS.map'));
  check('preset Periksa Kelengkapan menjalankan review', revSrc.includes('Periksa Kelengkapan'));
  check('status temuan ditulis balik (onFindingStatusesChange)', revSrc.includes('onFindingStatusesChange'));
  check('status persisten draf dibaca saat review ulang (findingStatuses)', revSrc.includes('draft.findingStatuses'));
  check('abaikan dua langkah dengan konfirmasi inline', revSrc.includes('Yakin abaikan temuan ini') && revSrc.includes('Ya, abaikan'));
  check('konteks diteruskan ke review (contextFields)', revSrc.includes('contextFields,'));
  check('label versi untuk origin enhance', revSrc.includes("enhance: 'Sempurnakan Teks AI'"));
  check('label kejujuran tetap ada', revSrc.includes('bukan penilaian kepatuhan hukum'));
  check('aksi temuan lama tetap lengkap', ['Perbaiki dengan AI', 'Abaikan', 'Tandai diperiksa', 'Buka bagian'].every((s) => revSrc.includes(s)));

  console.log('\n[7] Kontrak sumber — wiring DocCreator:');
  const creatorSrc = read('../ai-tools/document-ai/components/DocCreator.tsx');
  check('panel DocEnhance dirender', creatorSrc.includes('<DocEnhance'));
  check("snapshot versi 'enhance' sebelum menimpa", creatorSrc.includes("pushVersion(current, 'enhance'"));
  check('penggantian hanya pada rentang (insertContentAt)', creatorSrc.includes('insertContentAt'));
  check('contextFields diteruskan ke panel review', creatorSrc.includes('contextFields={contextFields}'));
  check('onFindingStatusesChange dihubungkan', creatorSrc.includes('onFindingStatusesChange={changeFindingStatuses}'));
  check('status temuan disimpan bersama isi editor berjalan', creatorSrc.includes('findingStatuses: statuses'));

  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) { console.log('GAGAL:', failures.join(' | ')); process.exit(1); }
  console.log('SEMUA TEST DOC STUDIO ENHANCE UI LOLOS');
}

main();
