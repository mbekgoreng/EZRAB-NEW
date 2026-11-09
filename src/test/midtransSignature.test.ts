// Suite: Midtrans — verifikasi signature notifikasi, pemetaan status,
// konfigurasi env, dan pembuatan transaksi Snap (fetch disuntikkan).
// Plain harness (tanpa vitest), gaya billingDemoGate.
// Jalankan dari root repo: npx --yes tsx src/test/midtransSignature.test.ts
import {
  getMidtransConfig,
  computeNotificationSignature,
  verifyNotificationSignature,
  mapTransactionStatus,
  formatGrossAmount,
  createSnapTransaction,
  MIDTRANS_SANDBOX_HOST,
  MIDTRANS_PRODUCTION_HOST,
} from '../../api/_lib/midtrans.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

// Vektor tetap: SHA512('order-1' + '200' + '54999.00' + 'test-server-key'),
// dihitung independen dari modul (node:crypto langsung) saat suite ditulis.
const VECTOR_HEX = '4bfeee9b81f1f06185c800ce88a9d343135870a1858b59679e0eedc1ed0bc0b566d6e71ac69cc7d817ff8fda038a4c1aa9b8ff4b746eb91944d2376fd1813b2a';
const KEY = 'test-server-key';

console.log('=== Signature: vektor & verifikasi ===');
check(
  'computeNotificationSignature cocok dengan vektor independen',
  computeNotificationSignature({ orderId: 'order-1', statusCode: '200', grossAmount: '54999.00', serverKey: KEY }) === VECTOR_HEX
);
const notif = { order_id: 'order-1', status_code: '200', gross_amount: '54999.00', signature_key: VECTOR_HEX, transaction_status: 'settlement' };
check('signature valid diterima', verifyNotificationSignature(notif, KEY) === true);
check('signature huruf besar diterima (dinormalisasi)', verifyNotificationSignature({ ...notif, signature_key: VECTOR_HEX.toUpperCase() }, KEY) === true);
check('gross_amount diubah → ditolak', verifyNotificationSignature({ ...notif, gross_amount: '1.00' }, KEY) === false);
check('order_id diubah → ditolak', verifyNotificationSignature({ ...notif, order_id: 'order-2' }, KEY) === false);
check('server key salah → ditolak', verifyNotificationSignature(notif, 'kunci-lain') === false);
check('signature hilang → ditolak', verifyNotificationSignature({ order_id: 'order-1', status_code: '200', gross_amount: '54999.00' }, KEY) === false);
check('notifikasi null → ditolak', verifyNotificationSignature(null, KEY) === false);
check('signature panjang salah → ditolak', verifyNotificationSignature({ ...notif, signature_key: 'abcd' }, KEY) === false);

console.log('=== Pemetaan status transaksi ===');
check('settlement → PAID', mapTransactionStatus({ transaction_status: 'settlement' }) === 'PAID');
check('capture + fraud accept → PAID', mapTransactionStatus({ transaction_status: 'capture', fraud_status: 'accept' }) === 'PAID');
check('capture + fraud challenge → PENDING (bukan lunas)', mapTransactionStatus({ transaction_status: 'capture', fraud_status: 'challenge' }) === 'PENDING');
check('capture + fraud deny → FAILED', mapTransactionStatus({ transaction_status: 'capture', fraud_status: 'deny' }) === 'FAILED');
check('pending → PENDING', mapTransactionStatus({ transaction_status: 'pending' }) === 'PENDING');
check('deny → FAILED', mapTransactionStatus({ transaction_status: 'deny' }) === 'FAILED');
check('cancel → FAILED', mapTransactionStatus({ transaction_status: 'cancel' }) === 'FAILED');
check('failure → FAILED', mapTransactionStatus({ transaction_status: 'failure' }) === 'FAILED');
check('expire → EXPIRED', mapTransactionStatus({ transaction_status: 'expire' }) === 'EXPIRED');
check('refund → REFUNDED', mapTransactionStatus({ transaction_status: 'refund' }) === 'REFUNDED');
check('partial_refund → PARTIALLY_REFUNDED', mapTransactionStatus({ transaction_status: 'partial_refund' }) === 'PARTIALLY_REFUNDED');
check('status asing → UNKNOWN', mapTransactionStatus({ transaction_status: 'whatever' }) === 'UNKNOWN');

console.log('=== Konfigurasi env ===');
check('tanpa server key → null', getMidtransConfig({}) === null);
check('server key kosong → null', getMidtransConfig({ MIDTRANS_SERVER_KEY: '  ' }) === null);
const sandboxCfg = getMidtransConfig({ MIDTRANS_SERVER_KEY: KEY });
check('default = sandbox', sandboxCfg?.snapHost === MIDTRANS_SANDBOX_HOST && sandboxCfg?.isProduction === false);
const prodCfg = getMidtransConfig({ MIDTRANS_SERVER_KEY: KEY, MIDTRANS_IS_PRODUCTION: 'true' });
check('IS_PRODUCTION=true → host produksi', prodCfg?.snapHost === MIDTRANS_PRODUCTION_HOST && prodCfg?.isProduction === true);

console.log('=== formatGrossAmount ===');
check('54999 → "54999.00"', formatGrossAmount(54999) === '54999.00');
check('0 → "0.00"', formatGrossAmount(0) === '0.00');
check('pecahan → null', formatGrossAmount(1.5) === null);
check('negatif → null', formatGrossAmount(-5) === null);

console.log('=== createSnapTransaction (fetch suntikan) ===');
{
  let seenUrl = '';
  let seenInit: any = null;
  const fakeFetch = async (url: string, init: any) => {
    seenUrl = url;
    seenInit = init;
    return { ok: true, status: 201, json: async () => ({ token: 'snap-token-1', redirect_url: 'https://pay.example/1' }) };
  };
  const out = await createSnapTransaction(sandboxCfg, { orderId: 'EZR-SUB-1', amountIdr: 54999 }, fakeFetch as any);
  check('URL sandbox benar', seenUrl === 'https://app.sandbox.midtrans.com/snap/v1/transactions');
  const expectedAuth = 'Basic ' + Buffer.from(`${KEY}:`, 'utf8').toString('base64');
  check('Authorization = Basic serverKey:', seenInit.headers.Authorization === expectedAuth);
  const sentBody = JSON.parse(seenInit.body);
  check('body order_id sesuai', sentBody.transaction_details.order_id === 'EZR-SUB-1');
  check('body gross_amount = jumlah yang diberikan', sentBody.transaction_details.gross_amount === 54999);
  check('token + redirect_url diteruskan', out.token === 'snap-token-1' && out.redirectUrl === 'https://pay.example/1');
}
{
  const failFetch = async () => ({ ok: false, status: 401, json: async () => ({ error_messages: ['Unauthorized'] }) });
  let code = '';
  try {
    await createSnapTransaction(sandboxCfg, { orderId: 'EZR-SUB-2', amountIdr: 1000 }, failFetch as any);
  } catch (e: any) { code = e.code; }
  check('HTTP 401 dari Midtrans → MIDTRANS_API_ERROR', code === 'MIDTRANS_API_ERROR');
}
{
  let code = '';
  try {
    await createSnapTransaction(null, { orderId: 'EZR-SUB-3', amountIdr: 1000 }, (async () => { throw new Error('tidak boleh dipanggil'); }) as any);
  } catch (e: any) { code = e.code; }
  check('tanpa konfigurasi → MIDTRANS_NOT_CONFIGURED', code === 'MIDTRANS_NOT_CONFIGURED');
}
{
  let code = '';
  try {
    await createSnapTransaction(sandboxCfg, { orderId: 'EZR-SUB-4', amountIdr: 0 }, (async () => { throw new Error('tidak boleh dipanggil'); }) as any);
  } catch (e: any) { code = e.code; }
  check('jumlah 0 → INVALID_AMOUNT', code === 'INVALID_AMOUNT');
}

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
