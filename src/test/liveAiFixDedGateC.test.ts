/**
 * Gerbang C DED — auto-accept kandidat unik bermargin (keputusan owner
 * 2026-11-15, opsi ii; kalibrasi 2026-11-15, 69 fixture berlabel).
 *
 * Run: npx esbuild src/test/liveAiFixDedGateC.test.ts --bundle --platform=node
 *      --format=cjs --outfile=/tmp/liveAiFixDedGateC.cjs && node /tmp/liveAiFixDedGateC.cjs
 *
 * Mengunci aturan Gerbang C di canonicalDedPricing.ts:
 * - Auto-RESOLVED hanya bila top-1 unik (margin >= 15 atas top-2 SEMUA
 *   kandidat) + FULL + satuan persis + tanpa konflik spek + kata isi
 *   pertama kueri SAMA DENGAN token pertama frasa kepala judul top-1.
 * - Harga auto-accept SELALU harga komposisi kanonis (3.9.8.10 = Rp104.309,
 *   BUKAN total DHSP Rp104.310; 3.5.2.1 = Rp47.255).
 * - Gerbang A (kode klaim) dan B (judul verbatim) tidak berubah.
 */
import {
  matchDedItemToAhsp, resolveCanonicalCode,
} from '../ai-tools/ded-canonical/canonicalDedPricing';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const hasGateCMarker = (m: { resolutionPath: string[] }) =>
  m.resolutionPath.includes('GATE_C_UNIQUE_MARGIN');

console.log('\n== 1. Kasus baik — auto-accept via Gerbang C ==');
const f1 = matchDedItemToAhsp({ name: 'Pemasangan Lantai Keramik 25x25 cm Unpolished KM/WC', unit: 'm2' });
check('1.1 keramik 25x25 → RESOLVED 3.9.8.10', f1.status === 'RESOLVED' && f1.matchedCode === '3.9.8.10', f1.status);
check('1.2 harga komposisi kanonis 104309 (bukan DHSP 104310)', f1.unitPrice === 104309, String(f1.unitPrice));
check('1.3 jalur tercatat GATE_C_UNIQUE_MARGIN', hasGateCMarker(f1), f1.resolutionPath.join('>'));
const f6 = matchDedItemToAhsp({ name: 'Pemasangan Plafon Gypsum', unit: 'm2' });
check('1.4 plafon gypsum → RESOLVED 3.5.2.1', f6.status === 'RESOLVED' && f6.matchedCode === '3.5.2.1', f6.status);
check('1.5 harga komposisi kanonis 47255', f6.unitPrice === 47255, String(f6.unitPrice));
check('1.6 jalur tercatat GATE_C_UNIQUE_MARGIN', hasGateCMarker(f6));
const k6 = matchDedItemToAhsp({ name: 'Lantai keramik 25x25 Unpolished', unit: 'm2' });
check('1.7 keramik pendek → RESOLVED 3.9.8.10', k6.status === 'RESOLVED' && k6.matchedCode === '3.9.8.10', k6.status);
const k7 = matchDedItemToAhsp({ name: 'Pemasangan 1 m2 lantai keramik uk. 25x25 cm Unpolished', unit: 'm2' });
check('1.8 keramik tanpa rasio → RESOLVED 3.9.8.10', k7.status === 'RESOLVED' && k7.matchedCode === '3.9.8.10', k7.status);
const k9 = matchDedItemToAhsp({ name: 'Plafon gypsum tebal 9 mm', unit: 'm2' });
check('1.9 gypsum + tebal → RESOLVED 3.5.2.1', k9.status === 'RESOLVED' && k9.matchedCode === '3.5.2.1', k9.status);

console.log('\n== 2. Jebakan — tetap NEEDS_REVIEW ==');
const f5 = matchDedItemToAhsp({ name: 'Plesteran Dinding 1:4', unit: 'm2' });
check('2.1 plesteran 1:4 → NEEDS_REVIEW (bukan 1.1.2.3)', f5.status === 'NEEDS_REVIEW', f5.status);
check('2.2 plesteran 1:4: harga null', f5.unitPrice === null);
check('2.3 plesteran 1:4: 1.1.2.3 hanya kandidat, bukan match', f5.matchedCode === undefined && f5.candidates[0]?.code === '1.1.2.3');
const f8 = matchDedItemToAhsp({ name: 'Pengecatan Dinding', unit: 'm2' });
check('2.4 pengecatan dinding → NEEDS_REVIEW', f8.status === 'NEEDS_REVIEW', f8.status);
const x3 = matchDedItemToAhsp({ name: 'Plesteran Dinding 1:6', unit: 'm2' });
check('2.5 plesteran 1:6 → NEEDS_REVIEW', x3.status === 'NEEDS_REVIEW', x3.status);
const row19 = matchDedItemToAhsp({ name: 'Plafon Gypsum 9mm Rangka Hollow', unit: 'm2' });
check('2.6 plafon gypsum rangka hollow → NEEDS_REVIEW (3.5.3.1 hanya rangka, bukan plafon utuh)', row19.status === 'NEEDS_REVIEW', row19.status);
check('2.7 rangka hollow: harga null (golden 38 baris terlindungi)', row19.unitPrice === null);

console.log('\n== 3. Seri ambigu — tetap NEEDS_REVIEW ==');
const ambig: Array<[string, string]> = [
  ['Pemasangan Plafon KM/WC', 'm2'],
  ['Pemasangan Lantai Keramik 40x40 cm', 'm2'],
  ['Pekerjaan Pondasi Batu Kali', 'm3'],
  ['Galian Tanah Biasa', 'm3'],
  ['Pemasangan Keramik Lantai 30x30 cm', 'm2'],
  ['Pemasangan Plafon Akustik', 'm2'],
  ['Pemasangan Pondasi Batu Belah', 'm3'],
  ['Pengecatan Tembok Baru', 'm2'],
  ['pasang keramik lantai', 'm2'],
];
ambig.forEach(([name, unit], i) => {
  const m = matchDedItemToAhsp({ name, unit });
  check(`3.${i + 1} "${name}" → NEEDS_REVIEW`, m.status === 'NEEDS_REVIEW' && m.unitPrice === null, m.status);
});

console.log('\n== 4. PARTIAL / satuan / tanpa padanan — tetap NEEDS_REVIEW ==');
const f10 = matchDedItemToAhsp({ name: 'Pemasangan Kusen Pintu Kayu', unit: 'buah' });
check('4.1 kusen pintu kayu (PARTIAL + satuan m\') → NEEDS_REVIEW', f10.status === 'NEEDS_REVIEW', f10.status);
const x8 = matchDedItemToAhsp({ name: 'Pemasangan Kusen Jendela Kayu', unit: 'buah' });
check('4.2 kusen jendela → NEEDS_REVIEW', x8.status === 'NEEDS_REVIEW', x8.status);
const x9 = matchDedItemToAhsp({ name: 'Pekerjaan Bekisting Kolom', unit: 'm2' });
check('4.3 bekisting kolom (top-1 PARTIAL; pracetak bukan pengganti) → NEEDS_REVIEW', x9.status === 'NEEDS_REVIEW', x9.status);
const f2 = matchDedItemToAhsp({ name: 'Pemasangan Dinding Keramik 25x60 cm Trassram KM/WC', unit: 'm2' });
check('4.4 keramik 25x60 (ukuran tak ada di katalog) → NEEDS_REVIEW', f2.status === 'NEEDS_REVIEW', f2.status);
const fict = matchDedItemToAhsp({ name: 'pekerjaan fiktif tidak ada xyz', unit: 'm2' });
check('4.5 kueri fiktif → NO_MATCH', fict.status === 'NO_MATCH' && fict.candidates.length === 0, fict.status);

console.log('\n== 5. Gerbang A/B tidak berubah ==');
const claimGood = matchDedItemToAhsp({ name: 'Pemasangan Lantai Keramik 25x25 cm Unpolished KM/WC', unit: 'm2', claimedAhspCode: '3.9.8.10' });
check('5.1 klaim benar 3.9.8.10 → RESOLVED 104309 (Gerbang A)', claimGood.status === 'RESOLVED' && claimGood.unitPrice === 104309, claimGood.status);
check('5.2 klaim benar: bukan jalur Gerbang C', !hasGateCMarker(claimGood));
const claimBad = matchDedItemToAhsp({ name: 'Pemasangan Lantai Keramik 25x25 cm Unpolished KM/WC', unit: 'm2', claimedAhspCode: '3.9.8.9' });
check('5.3 klaim salah ukuran 3.9.8.9 → NEEDS_REVIEW (penjaga spek A)', claimBad.status === 'NEEDS_REVIEW', claimBad.status);
const verbatim = matchDedItemToAhsp({ name: 'Pemasangan 1 m2 plesteran 1SP : 4PP tebal 15 mm', unit: 'm2' });
check('5.4 judul verbatim → RESOLVED 3.7.4 Rp51622 (Gerbang B)', verbatim.status === 'RESOLVED' && verbatim.matchedCode === '3.7.4' && verbatim.unitPrice === 51622, verbatim.status);
check('5.5 judul verbatim: bukan jalur Gerbang C', !hasGateCMarker(verbatim));
const k8 = matchDedItemToAhsp({ name: 'lantai keramik uk. 25x25 cm (1SP : 2PP) Unpolished', unit: 'm2' });
check('5.6 keramik + rasio → RESOLVED via Gerbang B (bukan C)', k8.status === 'RESOLVED' && k8.matchedCode === '3.9.8.10' && !hasGateCMarker(k8), k8.status);
const k4 = matchDedItemToAhsp({ name: 'Pemasangan 1 m2 plesteran 1SP : 4PP tebal 20 mm', unit: 'm2' });
check('5.7 tebal 20mm vs katalog 15mm → NEEDS_REVIEW (penjaga spek juga menahan C)', k4.status === 'NEEDS_REVIEW', k4.status);
const k5 = matchDedItemToAhsp({ name: 'Pemasangan 1 m2 plesteran 1SP : 4PP tebal 15 cm', unit: 'm2' });
check('5.8 tebal 15cm vs 15mm → TIDAK RESOLVED', k5.status !== 'RESOLVED', k5.status);
const direct = resolveCanonicalCode('3.9.8.10', 'm2');
check('5.9 resolveCanonicalCode langsung tetap RESOLVED 104309', direct.status === 'RESOLVED' && direct.unitPrice === 104309);

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
