// Suite: Katalog server billing TIDAK boleh bergeser dari definisi kanonis
// frontend (src/billing/plans.ts) dan paket top-up Spec v1.0 §7.2
// (src/ai-credits/config.ts TOPUP_OFFERS, ratifikasi K6). Bila harga
// berubah, kedua sisi wajib diubah bersama secara sadar — suite ini yang
// meneriakannya.
// Jalankan dari root repo: npx --yes tsx src/test/billingCatalogDrift.test.ts
import { PLAN_DEFINITIONS } from '../billing/plans';
import { TOPUP_OFFERS } from '../ai-credits/config';
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

console.log('=== Katalog top-up server vs TOPUP_OFFERS (K6, Spec §7.2) ===');
check('tepat 4 tier top-up', Object.keys(TOPUP_CATALOG).length === 4 && TOPUP_OFFERS.length === 4);
for (const tier of TOPUP_OFFERS) {
  const item = (TOPUP_CATALOG as Record<string, any>)[tier.itemId];
  check(`${tier.itemId}: item katalog ada`, Boolean(item));
  check(`${tier.itemId}: harga sama (${tier.priceIdr})`, item?.priceIdr === tier.priceIdr);
  check(`${tier.itemId}: kredit sama (${tier.credits})`, item?.credits === tier.credits);
  check(`${tier.itemId}: ditandai ratifikasi K6`, item?.priceStatus === 'SPEC_V1_0_RATIFIED_K6');
  check(`${tier.itemId}: tanpa bonus terpisah`, item?.bonusCredits === undefined && item?.baseCredits === undefined);
}
check('penawaran interim topup-3600 SUDAH DIHAPUS', getCatalogItem('TOP_UP', 'topup-3600') === null);
check('item top-up asing ditolak', getCatalogItem('TOP_UP', 'topup-99999') === null);

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
