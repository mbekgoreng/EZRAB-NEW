// Suite: Katalog server billing TIDAK boleh bergeser dari definisi kanonis
// frontend (src/billing/plans.ts) dan penawaran top-up Fase 1
// (src/ai-credits/config.ts TOPUP_OFFER). Bila harga berubah, kedua sisi
// wajib diubah bersama secara sadar — suite ini yang meneriakannya.
// Jalankan dari root repo: npx --yes tsx src/test/billingCatalogDrift.test.ts
import { PLAN_DEFINITIONS } from '../billing/plans';
import { TOPUP_OFFER } from '../ai-credits/config';
import { SUBSCRIPTION_CATALOG, TOPUP_CATALOG, getCatalogItem } from '../../api/_lib/billingCatalog.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

console.log('=== Katalog langganan server vs plans.ts ===');
for (const planId of ['starter', 'professional', 'business'] as const) {
  const plan = PLAN_DEFINITIONS[planId];
  const item = SUBSCRIPTION_CATALOG[planId];
  check(`${planId}: item katalog ada`, Boolean(item));
  check(`${planId}: harga sama (${plan.monthlyPriceIdr})`, item?.priceIdr === plan.monthlyPriceIdr);
  const planCredits = plan.credits.kind === 'periodic' ? plan.credits.credits : -1;
  check(`${planId}: kredit periodik sama (${planCredits})`, item?.credits === planCredits);
  check(`${planId}: planId konsisten`, item?.planId === planId);
}
check('free TIDAK dijual', getCatalogItem('SUBSCRIPTION', 'free') === null);
check('item asing ditolak', getCatalogItem('SUBSCRIPTION', 'platinum') === null);
check('kind asing ditolak', getCatalogItem('VOUCHER', 'starter') === null);

console.log('=== Katalog top-up server vs TOPUP_OFFER ===');
const top = TOPUP_CATALOG['topup-3600'];
check('topup-3600 ada', Boolean(top));
check(`harga sama (${TOPUP_OFFER.priceIdr})`, top?.priceIdr === TOPUP_OFFER.priceIdr);
check(`kredit dasar sama (${TOPUP_OFFER.baseCredits})`, top?.baseCredits === TOPUP_OFFER.baseCredits);
check(`bonus sama (${TOPUP_OFFER.bonusCredits})`, top?.bonusCredits === TOPUP_OFFER.bonusCredits);
check('total konsisten (dasar + bonus)', (top?.baseCredits ?? 0) + (top?.bonusCredits ?? 0) === TOPUP_OFFER.totalCredits);
check('harga top-up ditandai menunggu keputusan D8', top?.priceStatus === 'PHASE1_OFFER_PENDING_D8');

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
