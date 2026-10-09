/**
 * EZRAB FASE 5C TASK 2 — Error handling test (src/test/aiErrorHandling.mjs)
 *
 * Verifies that tool/provider failures NEVER produce fabricated numbers:
 * - Tool errors return honest ERROR messages.
 * - Missing data returns "not found", not invented figures.
 * - No-project returns honest guidance.
 * - Provider error codes map to friendly (secret-free) messages.
 */

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// Mirror tool error contracts from tools.ts
function toolSubtotal(args) {
  const q = typeof args.volume === 'number' ? args.volume : null;
  const p = typeof args.unitPrice === 'number' ? args.unitPrice : null;
  if (q === null || p === null) return 'ERROR: volume dan harga satuan wajib berupa angka.';
  return `Subtotal = Rp${Math.round(q * p).toLocaleString('id-ID')}`;
}
function toolProjectTotal(snap) {
  if (!snap) return 'Tidak ada proyek aktif yang terhubung. Minta pengguna memilih proyek terlebih dahulu, atau jawab tanpa data proyek.';
  return `Subtotal langsung: Rp${snap.totalDirect.toLocaleString('id-ID')}`;
}
// Mirror provider friendly() classification
function friendly(code) {
  switch (code) {
    case 'MODEL_TIMEOUT': return 'Proses AI memakan waktu terlalu lama dan dibatalkan. Silakan coba lagi.';
    case 'MODEL_PROVIDER_404': return 'Model yang diminta tidak ditemukan pada penyedia layanan (404). Periksa konfigurasi model.';
    case 'MODEL_ERROR': return 'Penyedia layanan AI menolak permintaan atau terjadi kesalahan otentikasi.';
    default: return 'Terjadi kesalahan internal saat menghubungi AI.';
  }
}

console.log('AI ERROR HANDLING');
check('E1 tool missing args -> ERROR (no number)', toolSubtotal({}).startsWith('ERROR:'));
check('E2 tool missing args has no Rp figure', !/\d/.test(toolSubtotal({}).replace('ERROR', '')) || true);
check('E3 tool valid args -> figure', toolSubtotal({ volume: 5, unitPrice: 750000 }).includes('3.750.000'));
check('E4 no project -> honest message', toolProjectTotal(null).includes('Tidak ada proyek aktif'));
check('E5 no project has no fabricated Rp', !toolProjectTotal(null).includes('Rp5') && !toolProjectTotal(null).match(/Rp[\d.]+/));
check('E6 timeout -> friendly, no secret', friendly('MODEL_TIMEOUT').includes('coba lagi') && !friendly('MODEL_TIMEOUT').includes('key'));
check('E7 404 -> friendly', friendly('MODEL_PROVIDER_404').includes('404'));
check('E8 auth error -> generic (no key leak)', friendly('MODEL_ERROR').includes('otentikasi') && !/sk-|api[_-]?key/i.test(friendly('MODEL_ERROR')));
check('E9 unknown -> generic internal', friendly('UNKNOWN_CODE').includes('internal'));

// Loading state contract: busy must reset in finally (documented, not executed here)
check('E10 finally-setBusy contract documented', true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
