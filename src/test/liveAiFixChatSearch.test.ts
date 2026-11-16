/**
 * Regresi temuan uji AI live 2026-11-15 (workstream 3, Magic AI jalur
 * 'Lanjutkan di Chat AI' — ranking chatSearch).
 *
 * Kasus live persis: query 'pekerjaan plesteran dinding 10 m2' lewat
 * 'Lanjutkan di Chat AI' dipadankan ke item SALAH [1.1.2.3] 'Pembuatan
 * 1 m2 kantor sementara/rumah jaga/gudang semen dan peralatan lantai
 * plesteran, dinding setengah tembok' (Rp3.182.985) — judulnya memuat
 * 'plesteran' + 'dinding' hanya sebagai fitur bangunan, bukan
 * pekerjaan utama. Perbaikan: penalti kecocokan subordinat di
 * scoreItem (chatSearch.ts) — istilah utama kueri yang cocok token
 * di luar frasa kepala judul kehilangan 4 poin (dipagari di ambang
 * relevansi 3).
 *
 * Tes DETERMINISTIK atas engine chat — tidak ada panggilan model live.
 * Cara jalan: npx --yes tsx src/test/liveAiFixChatSearch.test.ts
 * Exit 0 = semua lulus.
 */
import { searchChatAhsp, formatChatAhspResult } from '../ai-tools/ezrab-ai/chatSearch';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

console.log('=== 1. Kasus live persis: plesteran dinding 10 m2 ===');
{
  const r = searchChatAhsp('pekerjaan plesteran dinding 10 m2');
  check(
    'live -> [1.1.2.3] BUKAN hit teratas',
    r.items.length > 0 && r.items[0].code !== '1.1.2.3',
    r.items.map((i) => i.code).join(','),
  );
  check(
    'live -> [1.1.2.3] tidak tampil sebagai jawaban sama sekali',
    !r.items.some((i) => i.code === '1.1.2.3'),
    r.items.map((i) => i.code).join(','),
  );
  check(
    'live -> hit teratas adalah item plesteran kanonis (3.7.1)',
    r.items.length > 0 && r.items[0].code === '3.7.1',
    r.items.map((i) => i.code).join(','),
  );
  check(
    'live -> judul hit teratas memuat plesteran',
    (r.items[0]?.title ?? '').toLowerCase().includes('plesteran'),
    r.items[0]?.title ?? '(kosong)',
  );
  check(
    'live -> satuan hit teratas m2 sesuai permintaan',
    r.items[0]?.unit === 'm2' && !r.items[0]?.unitMismatch,
    r.items[0]?.unit ?? '(kosong)',
  );
  check(
    'live -> PARTIAL jujur (tanpa rasio, 30 varian plesteran cocok)',
    r.outcome === 'FOUND_PARTIAL',
    r.outcome,
  );
  const out = formatChatAhspResult(r);
  check('live -> output tidak memuat [1.1.2.3]', !out.includes('[1.1.2.3]'));
  check('live -> output memuat [3.7.1]', out.includes('[3.7.1]'));
}

console.log('=== 2. Anti-regresi: kueri yang BENAR-BENAR mencari kantor sementara ===');
{
  const r = searchChatAhsp('kantor sementara rumah jaga');
  check('kantor sementara -> RELEVANT', r.outcome === 'FOUND_RELEVANT', r.outcome);
  check(
    'kantor sementara -> [1.1.2.3] tetap teratas',
    r.items.length > 0 && r.items[0].code === '1.1.2.3',
    r.items.map((i) => i.code).join(','),
  );
  const r2 = searchChatAhsp('pembuatan kantor sementara');
  check(
    'pembuatan kantor sementara -> [1.1.2.3] tetap teratas',
    r2.items.length > 0 && r2.items[0].code === '1.1.2.3',
    r2.items.map((i) => i.code).join(','),
  );
}

console.log('=== 3. Anti-regresi: plesteran 1:4 tetap 3.7.4 (Q1) ===');
{
  const r = searchChatAhsp('plesteran dinding campuran 1:4 dan berapa harganya per m2?');
  check(
    'Q1 -> item pertama 3.7.4',
    r.items.length > 0 && r.items[0].code === '3.7.4',
    r.items.map((i) => i.code).join(','),
  );
  check('Q1 -> 1.1.2.3 tidak tampil', !r.items.some((i) => i.code === '1.1.2.3'));
}

console.log('=== 4. Anti-regresi: kueri umum lain tetap masuk akal ===');
{
  const bata = searchChatAhsp('pasangan bata merah');
  check('pasangan bata merah -> RELEVANT', bata.outcome === 'FOUND_RELEVANT', bata.outcome);
  check(
    'pasangan bata merah -> hit teratas memuat bata merah',
    (bata.items[0]?.title ?? '').toLowerCase().includes('bata merah'),
    bata.items[0]?.title ?? '(kosong)',
  );
  const pintu = searchChatAhsp('pintu kayu');
  check('pintu kayu -> bukan NOT_FOUND', pintu.outcome !== 'NOT_FOUND', pintu.outcome);
  check(
    'pintu kayu -> hit teratas memuat pintu',
    (pintu.items[0]?.title ?? '').toLowerCase().includes('pintu'),
    pintu.items[0]?.title ?? '(kosong)',
  );
  const galian = searchChatAhsp('galian tanah');
  check('galian tanah -> bukan NOT_FOUND', galian.outcome !== 'NOT_FOUND', galian.outcome);
  check('galian tanah -> ada item', galian.items.length > 0);
  const kloset = searchChatAhsp('kloset duduk dan berapa harganya per buah?');
  check(
    'kloset duduk -> item pertama 3.18.3.1 (Q10)',
    kloset.items.length > 0 && kloset.items[0].code === '3.18.3.1',
    kloset.items.map((i) => i.code).join(','),
  );
  const cat = searchChatAhsp('cat dinding');
  check('cat dinding -> bukan NOT_FOUND', cat.outcome !== 'NOT_FOUND', cat.outcome);
  check(
    'cat dinding -> pengerokan cat lama (3.8.1) bukan lagi teratas',
    cat.items.length > 0 && cat.items[0].code !== '3.8.1',
    cat.items.map((i) => i.code).join(','),
  );
}

console.log('=== 5. Anti-regresi: gerbang C p0Remediation tetap lolos ===');
{
  check(
    'C-014 dynabolt m10 -> FOUND_PARTIAL',
    searchChatAhsp('dynabolt m10').outcome === 'FOUND_PARTIAL',
  );
  check(
    'C-001 persiapan lahan -> FOUND_PARTIAL',
    searchChatAhsp('pekerjaan persiapan lahan').outcome === 'FOUND_PARTIAL',
  );
  check(
    'C-006 gudang material -> FOUND_PARTIAL',
    searchChatAhsp('pekerjaan gudang material').outcome === 'FOUND_PARTIAL',
  );
  check(
    'C-020 kawat las elektroda -> FOUND_PARTIAL',
    searchChatAhsp('kawat las elektroda').outcome === 'FOUND_PARTIAL',
  );
  check('kawat -> FOUND_PARTIAL (broad)', searchChatAhsp('kawat').outcome === 'FOUND_PARTIAL');
  const betonM2 = searchChatAhsp('beton', { unit: 'm2' });
  check('beton m2 -> PARTIAL', betonM2.outcome === 'FOUND_PARTIAL', betonM2.outcome);
  check(
    'beton m2 -> semua jawaban bersatuan m2',
    betonM2.items.length > 0 && betonM2.items.every((i) => i.unit === 'm2'),
  );
  check(
    'beton m2 -> ada item bersatuan berbeda yang ditandai (termasuk m3)',
    betonM2.flaggedItems.length > 0 && betonM2.flaggedItems.some((i) => i.unit === 'm3'),
    betonM2.flaggedItems.map((i) => `${i.code}:${i.unit}`).join(','),
  );
}

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
