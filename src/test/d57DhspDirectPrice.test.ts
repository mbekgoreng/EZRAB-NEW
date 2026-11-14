/**
 * D-57 (P2) — Badge "Harga lengkap" (FULL) padahal HSP "belum tersedia":
 * resolver memberi FULL lewat fallback DHSP (1.1.2.6 -> Rp1.281.336)
 * sementara `getAhspDirectPrice` mengabaikan DHSP untuk item berkomponen.
 * Run: npx tsx src/test/d57DhspDirectPrice.test.ts
 *
 * Fix (OD-16 opsi (a), kriteria direkam di 04-REPAIR-EXECUTION-LOG.md):
 * harga DHSP resmi DITAMPILKAN (bukan disembunyikan) dengan label basis
 * "DHSP resmi" — badge, harga kartu, dialog, dan gate finalisasi kini
 * memakai kriteria "ada harga" yang sama.
 *
 * INVARIAN: item ber-badge FULL selalu punya harga tampil non-null.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import {
  getAhspDirectPrice,
  getAhspDirectPriceBasis,
  canFinalizeAhsp,
  type FinalizableComposition,
} from '../data/priceDatabase2026/ahspDisplayPolicy';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const synth = (over: Partial<FinalizableComposition>): FinalizableComposition => ({
  pricingStatus: 'FULL',
  totalComponents: 4,
  missingComponents: 0,
  unitPrice: null,
  officialDhspPrice: null,
  ...over,
});

// --- policy branches (synthetic compositions) -------------------------------

test('item berkomponen dengan harga komponen -> jumlah komponen (COMPONENTS)', () => {
  const c = synth({ unitPrice: 6000 });
  eq(getAhspDirectPrice(c), 6000, 'direct price');
  eq(getAhspDirectPriceBasis(c), 'COMPONENTS', 'basis');
});

test('item berkomponen tanpa harga komponen tapi ber-DHSP -> DHSP (basis DHSP)', () => {
  const c = synth({ unitPrice: null, officialDhspPrice: 1281336 });
  eq(getAhspDirectPrice(c), 1281336, 'direct price must be the DHSP value');
  eq(getAhspDirectPriceBasis(c), 'DHSP', 'basis');
});

test('item berkomponen tanpa harga apa pun -> null, bukan Rp0', () => {
  const c = synth({ unitPrice: null, officialDhspPrice: null });
  eq(getAhspDirectPrice(c), null, 'no price anywhere must stay null');
  eq(getAhspDirectPriceBasis(c), null, 'basis null');
});

test('item PARSIAL (ada jumlah komponen) TIDAK memakai DHSP — D parsial tetap jumlah komponen', () => {
  const c = synth({ pricingStatus: 'PARTIAL', unitPrice: 5000, officialDhspPrice: 1281336, missingComponents: 1 });
  eq(getAhspDirectPrice(c), 5000, 'partial sum wins over DHSP');
  eq(getAhspDirectPriceBasis(c), 'COMPONENTS', 'basis');
});

test('item tanpa komponen dengan harga baked item (tanpa DHSP) -> harga baked', () => {
  const c = synth({ totalComponents: 0, unitPrice: 450000, officialDhspPrice: null });
  eq(getAhspDirectPrice(c), 450000, 'baked item price must surface (was null before the fix)');
  eq(getAhspDirectPriceBasis(c), 'COMPONENTS', 'basis');
});

test('item tanpa komponen ber-DHSP -> DHSP', () => {
  const c = synth({ totalComponents: 0, unitPrice: null, officialDhspPrice: 750000 });
  eq(getAhspDirectPrice(c), 750000, 'direct price');
  eq(getAhspDirectPriceBasis(c), 'DHSP', 'basis');
});

test('unitPrice 0 bukan harga — DHSP tetap dipakai', () => {
  const c = synth({ unitPrice: 0, officialDhspPrice: 1281336 });
  eq(getAhspDirectPrice(c), 1281336, '0 is not a price');
});

test('komposisi null -> null', () => {
  eq(getAhspDirectPrice(null), null, 'price');
  eq(getAhspDirectPriceBasis(null), null, 'basis');
});

// --- the defect's own item --------------------------------------------------

test('1.1.2.6 (Jalan Tanah): FULL + harga tampil Rp1.281.336 (DHSP) + finalisasi lolos', () => {
  const item = officialAhspRepository.getOfficialAhsp('1.1.2.6');
  ok(!!item, '1.1.2.6 must exist in the canonical catalog');
  const comp = priceResolver2026.resolveAhspUnitPrice(item!);
  eq(comp.pricingStatus, 'FULL', 'badge must be FULL');
  eq(comp.officialDhspPrice, 1281336, 'DHSP from the CK DHSP map');
  eq(getAhspDirectPrice(comp), 1281336, 'displayed price must be the DHSP value');
  eq(getAhspDirectPriceBasis(comp), 'DHSP', 'basis must be DHSP');
  const fin = canFinalizeAhsp(comp, { code: item!.code, name: item!.name });
  ok(fin.ok, `finalize must pass for a FULL item with a displayable price (got: ${fin.reason})`);
});

// --- catalog-wide invariant -------------------------------------------------

test('INVARIAN katalog: tidak ada item FULL tanpa harga tampil (5.725 item aktif)', () => {
  const items = officialAhspRepository.getActiveOfficialAhsp();
  let full = 0;
  let dhspBacked = 0;
  const bad: string[] = [];
  for (const it of items) {
    const c = priceResolver2026.resolveAhspUnitPrice(it);
    if (c.pricingStatus !== 'FULL') continue;
    full++;
    const d = getAhspDirectPrice(c);
    if (d === null || d <= 0) bad.push(`${it.code} unit=${c.unitPrice} dhsp=${c.officialDhspPrice}`);
    if (getAhspDirectPriceBasis(c) === 'DHSP') dhspBacked++;
  }
  eq(bad.length, 0, `FULL items without a displayable price: ${bad.slice(0, 5).join('; ')}`);
  ok(full > 0, 'catalog must contain FULL items');
  ok(dhspBacked > 0, `at least one FULL item must be DHSP-backed (else the fix is untested); found ${dhspBacked}`);
  console.log(`  (FULL=${full}, DHSP-backed=${dhspBacked})`);
});

// --- wiring guard -----------------------------------------------------------

test('explorer menampilkan label basis DHSP di kartu dan dialog', () => {
  const viewPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'components', 'ahsp', 'AhspExplorerView.tsx');
  const src = fs.readFileSync(viewPath, 'utf8');
  ok(src.includes('getAhspDirectPriceBasis'), 'explorer must import getAhspDirectPriceBasis');
  ok(src.includes('DHSP resmi'), 'explorer must render the "DHSP resmi" tag');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-57: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
