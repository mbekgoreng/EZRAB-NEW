// Suite: Registri kebijakan harga berversi (api/_lib/pricingPolicy.js).
// - v1.1-token-metering LOCKED: 1 kredit = 200 token terbobot, input ×1,
//   cached ×1, output ×3 interim, minimum 1 kredit/operasi.
// - margin-formula-proposal PENDING: tanpa parameter owner, jawabannya
//   PENDING_CONFIGURATION — bukan angka tebakan.
// Jalankan dari root repo: npx --yes tsx src/test/pricingPolicy.test.ts
import {
  PRICING_POLICIES,
  getPricingPolicy,
  weightedTokensForUsage,
  creditsForTokenUsage,
  deriveTokenRate,
  evaluateMarginPrice,
} from '../../api/_lib/pricingPolicy.js';
import { creditsFromTokens } from '../../api/_lib/tariffRegistry.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

console.log('=== Registri kebijakan ===');
check('dua kebijakan terdaftar', PRICING_POLICIES.length === 2);
const v11 = getPricingPolicy();
check('default adalah v1.1', v11?.version === 'v1.1-token-metering');
check('v1.1 LOCKED_OWNER', v11?.status === 'LOCKED_OWNER');
check('v1.1 basis TOKEN_METERING', v11?.basis === 'TOKEN_METERING');
check('v1.1 200 token terbobot/kredit', v11?.weightedTokensPerCredit === 200);
check('v1.1 bobot output interim 3', v11?.outputWeight?.interimValue === 3 && v11?.outputWeight?.interim === true);
const margin = getPricingPolicy('margin-formula-proposal');
check('margin PENDING_OWNER_DECISION', margin?.status === 'PENDING_OWNER_DECISION');
check('margin semua param null', margin?.params?.creditValueIdr === null && margin?.params?.costMultiplierMilli === null && margin?.params?.targetGrossMarginBps === null && margin?.params?.fxIdrPerUsd === null);
check('versi tak dikenal -> null', getPricingPolicy('v9-tidak-ada') === null);

console.log('=== Metering v1.1: contoh kanonis Amendemen v1.1 ===');
// 2.000 in + 1.000 out -> terbobot 2.000×1 + 1.000×3 = 5.000 -> 25 kredit.
const w1 = weightedTokensForUsage({ tokensIn: 2000, tokensOut: 1000, tokensCached: 0 }, v11);
check('terbobot contoh chat = 5000', w1?.weightedTokens === 5000);
check('contoh chat interim=true', w1?.interim === true);
const c1 = creditsForTokenUsage({ tokensIn: 2000, tokensOut: 1000 });
check('contoh chat = 25 kredit', c1.ok === true && c1.credits === 25);
check('hasil menyebut policyVersion v1.1', c1.ok === true && c1.policyVersion === 'v1.1-token-metering');

// Usage ber-terbobot 150.000 (DED menengah): in 75.000 + out 25.000 -> 750 kredit.
const c2 = creditsForTokenUsage({ tokensIn: 75000, tokensOut: 25000 });
check('terbobot 150000 -> 750 kredit', c2.ok === true && c2.weightedTokens === 150000 && c2.credits === 750);

console.log('=== Ceil + minimum ===');
// Terbobot 201 -> ceil(201/200) = 2.
check('ceil: terbobot 201 -> 2 kredit', creditsForTokenUsage({ tokensIn: 201, tokensOut: 0 }).ok && (creditsForTokenUsage({ tokensIn: 201, tokensOut: 0 }) as any).credits === 2);
// Usage kecil -> minimum 1 kredit per operasi AI.
const cMin = creditsForTokenUsage({ tokensIn: 10, tokensOut: 0 });
check('minimum 1 kredit', cMin.ok === true && cMin.credits === 1);
// Bobot output terverifikasi dari pemanggil menggantikan interim.
const wVerified = weightedTokensForUsage({ tokensIn: 1000, tokensOut: 1000 }, v11, { outputWeight: 2 });
check('bobot output terverifikasi dipakai (1000+2000=3000)', wVerified?.weightedTokens === 3000 && wVerified?.interim === false);

console.log('=== Penolakan usage/kebijakan ===');
const cNull = creditsForTokenUsage({ tokensIn: null, tokensOut: 10 });
check('usage null -> USAGE_UNAVAILABLE', cNull.ok === false && cNull.error === 'USAGE_UNAVAILABLE');
const cFloat = creditsForTokenUsage({ tokensIn: 10.5, tokensOut: 10 });
check('usage float -> USAGE_UNAVAILABLE', cFloat.ok === false && cFloat.error === 'USAGE_UNAVAILABLE');
const cUnknown = creditsForTokenUsage({ tokensIn: 10, tokensOut: 10 }, { policyVersion: 'v9-tidak-ada' });
check('kebijakan tak dikenal -> UNKNOWN_POLICY', cUnknown.ok === false && cUnknown.error === 'UNKNOWN_POLICY');
check('weighted usage null -> null', weightedTokensForUsage({ tokensIn: null, tokensOut: 1 }, v11) === null);

console.log('=== deriveTokenRate ekuivalen creditsFromTokens ===');
const rate = deriveTokenRate(v11);
check('rate in = 5', rate?.creditsPer1kIn === 5);
check('rate out = 15 (interim)', rate?.creditsPer1kOut === 15 && rate?.interim === true);
const tariffDummy: any = { version: 'x' };
for (const usage of [
  { tokensIn: 2000, tokensOut: 1000, tokensCached: 0 },
  { tokensIn: 75000, tokensOut: 25000, tokensCached: 0 },
  { tokensIn: 1234, tokensOut: 567, tokensCached: 234 },
]) {
  const viaRate = creditsFromTokens(usage, tariffDummy, rate);
  const viaPolicy = creditsForTokenUsage(usage);
  check(
    `ekuivalen untuk in=${usage.tokensIn} out=${usage.tokensOut} cached=${usage.tokensCached}`,
    viaRate.status === 'OK' && viaPolicy.ok === true && viaRate.credits === viaPolicy.credits,
  );
}

console.log('=== Formula margin ===');
const pending = evaluateMarginPrice({ providerCostIdr: 100000 });
check('kebijakan bawaan -> PENDING_CONFIGURATION', pending.ok === false && pending.error === 'PENDING_CONFIGURATION');
check(
  'keempat param disebut hilang',
  pending.ok === false && Array.isArray((pending as any).missingParams)
    && ['creditValueIdr', 'costMultiplierMilli', 'targetGrossMarginBps', 'fxIdrPerUsd'].every((p) => (pending as any).missingParams.includes(p)),
);
const injected: any = {
  version: 'margin-formula-proposal',
  status: 'PENDING_OWNER_DECISION',
  basis: 'MARGIN_FORMULA',
  params: { creditValueIdr: 55, costMultiplierMilli: 2000, targetGrossMarginBps: 3000, fxIdrPerUsd: 16000 },
};
// revenue = ceil(100000 × 2000 × 10000 / (1000 × 7000)) = ceil(285714,28..) = 285715
// credits = ceil(285715 / 55) = 5195
const priced = evaluateMarginPrice({ providerCostIdr: 100000 }, injected);
check('revenue suntikan lengkap = 285715', priced.ok === true && priced.targetRevenueIdr === 285715);
check('credits suntikan lengkap = 5195', priced.ok === true && priced.credits === 5195);
const badMargin = evaluateMarginPrice(
  { providerCostIdr: 100000 },
  { ...injected, params: { ...injected.params, targetGrossMarginBps: 10000 } },
);
check('marginBps 10000 -> INVALID_POLICY', badMargin.ok === false && badMargin.error === 'INVALID_POLICY');
const badCost = evaluateMarginPrice({ providerCostIdr: -5 }, injected);
check('biaya negatif -> INVALID_COST', badCost.ok === false && badCost.error === 'INVALID_COST');
const floatCost = evaluateMarginPrice({ providerCostIdr: 100.5 }, injected);
check('biaya float -> INVALID_COST', floatCost.ok === false && floatCost.error === 'INVALID_COST');

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
