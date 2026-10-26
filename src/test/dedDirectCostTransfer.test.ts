// DED → RAB Direct-Cost Transfer — regression test.
//
// Keputusan owner 2026-10-27: jalur transfer DED → RAB memakai BIAYA LANGSUNG
// (jumlah komponen resolver), BUKAN total DHSP sebagai harga dasar. Total DHSP
// sudah mengandung markup sehingga memakainya menyebabkan markup ganda saat
// rekap menambahkan overhead + profit + PPN.
//
// Perbaikan I.95 (2026-10-27, validator — bukan data): satuan "Buah" untuk
// "Patok Lalu Lintas Beton" (I.95 = 9.2.(11a)) adalah RESMI menurut SE DJBK
// No. 47/SE/Dk/2026 Lampiran V p.1957. Aturan sanity beton curah (VOLUME)
// keliru menolak produk beton per buah; `priceSanityValidator` kini
// mengecualikan produk satuan (patok/bangku/kursi/berpola/stamp) dari trade
// beton curah — mereka tetap diperiksa batas global. Data (satuan, koefisien,
// harga) TIDAK diubah.
//
// Prinsip anti-hardcode: TIDAK ADA harga rupiah yang ditulis di tes ini.
// Semua nilai harapan dihitung live dari data sumber saat tes berjalan
// (repository + resolver + DHSP map). Yang diuji adalah HUBUNGAN:
//   harga transfer == biaya langsung, dan harga transfer != total DHSP
//   (bila keduanya berbeda di data sumber).
// Kode-kode di bawah adalah kasus pembanding audit P0 (bukan harga produksi).
//
// Tes ini menguji JALUR TRANSFER, bukan sekadar fungsi resolver terisolasi:
// untuk setiap kode, empat lapisan yang benar-benar dipakai transfer DED → RAB
// harus memberi angka yang sama — canonical resolver (dipakai mesin v2/v3),
// transfer service utama, resolver DED v2, dan mesin harga DED v3
// (unitPrice + totalPrice = unitPrice x kuantitas).
// Mesin PENCARIAN harga v2 (priceResolutionEngine, provider-first, fallback
// AI_ESTIMATED) sengaja TIDAK diuji di sini: ia bukan jalur transfer
// (dipakai aiResolutionEngine, bukan dedRabPipeline), dan estimasi AI-nya
// adalah perilaku terdokumentasi aliran itu, bukan harga transfer resmi.

import assert from 'node:assert';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import { canonicalPriceResolver } from '../engine/pricing/canonical/canonicalPriceResolver';
import { priceSanityValidator } from '../engine/pricing/canonical/priceSanityValidator';
import { dedToRabPipelineService } from '../services/dedToRabPipelineService';
import { ahspPriceResolver } from '../ded-rab-v2/ahsp/ahspPriceResolver';
import { dedPriceResolutionEngine } from '../ded-rab-v3/pricing/dedPriceResolutionEngine';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const QTY = 10;

// Kasus pembanding audit P0: biaya langsung vs total DHSP berbeda jauh.
// Termasuk 5 produk beton per buah yang dulu ditolak validator (I.95 + saudaranya).
const AUDIT_CODES = [
  'E.1', 'F.27', 'F.22', 'F.1', 'F.2', 'I.44', 'I.64', 'I.95', 'I.124',
  'I.101', 'I.102', 'I.242', 'I.250',
];

async function main(): Promise<void> {
  for (const code of AUDIT_CODES) {
    const item = officialAhspRepository.getOfficialAhsp(code);
    check(`${code}: ada di repository`, item !== undefined);
    if (!item) continue;
    const comp = priceResolver2026.resolveAhspUnitPrice(item);
    const direct = comp.unitPrice;
    const dhsp = comp.officialDhspPrice;
    check(`${code}: biaya langsung tersedia dan > 0`, direct !== null && (direct as number) > 0, `direct=${direct}`);
    check(`${code}: total DHSP tersedia dan berbeda dari biaya langsung`, dhsp !== null && dhsp !== direct, `dhsp=${dhsp} direct=${direct}`);
    if (direct === null || dhsp === null) continue;

    // Lapisan 1: canonical resolver (dipakai mesin DED v2/v3).
    const can = canonicalPriceResolver.resolve({ code, name: item.name, itemType: 'AHSP' });
    check(`${code}: canonical RESOLVED`, can.status === 'RESOLVED', `status=${can.status}`);
    check(`${code}: canonical == biaya langsung`, can.price === direct, `canonical=${can.price} direct=${direct}`);
    check(`${code}: canonical != total DHSP (tanpa markup ganda)`, can.price !== dhsp, `canonical=${can.price} dhsp=${dhsp}`);

    // Lapisan 2: jalur transfer utama DED → RAB.
    const svc = dedToRabPipelineService.resolvePrice(code);
    check(`${code}: transfer service == biaya langsung`, svc.unitPrice === direct, `svc=${svc.unitPrice} direct=${direct}`);
    check(`${code}: transfer service bukan PRICE_NOT_FOUND`, svc.priceSource !== 'PRICE_NOT_FOUND', `source=${svc.priceSource}`);

    // Lapisan 3: resolver DED v2 (dipakai dedRabPipeline / firstPrinciples / review).
    const v2 = ahspPriceResolver.resolvePrice(
      { name: item.name, ahspMatch: { code, matchType: 'EXACT_MATCH' } } as any,
    );
    check(`${code}: resolver v2 == biaya langsung`, v2.unitPrice === direct, `v2=${v2.unitPrice} direct=${direct}`);

    // Lapisan 4: mesin harga DED v3 — unitPrice DAN totalPrice transfer.
    const v3 = dedPriceResolutionEngine.resolveItemPrice(
      { name: item.name, quantity: QTY, quantityUnit: item.unit, ahsp: { code } } as any,
    );
    check(`${code}: mesin v3 == biaya langsung`, v3.unitPrice === direct, `v3=${v3.unitPrice} direct=${direct}`);
    check(`${code}: mesin v3 total == langsung x kuantitas`, v3.totalPrice === (direct as number) * QTY, `total=${v3.totalPrice} expected=${(direct as number) * QTY}`);
    check(`${code}: mesin v3 total != DHSP x kuantitas`, v3.totalPrice !== (dhsp as number) * QTY, `total=${v3.totalPrice} dhspTotal=${(dhsp as number) * QTY}`);
    check(`${code}: mesin v3 bukan PRICE_NOT_FOUND`, v3.source !== 'PRICE_NOT_FOUND', `source=${v3.source}`);

    // Konsistensi lintas lapisan + penjaga Rp0: semua lapisan sama, semua > 0.
    check(`${code}: konsistensi 4 lapisan`, can.price === svc.unitPrice && svc.unitPrice === v2.unitPrice && v2.unitPrice === v3.unitPrice,
      `canonical=${can.price} svc=${svc.unitPrice} v2=${v2.unitPrice} v3=${v3.unitPrice}`);
    check(`${code}: tidak ada lapisan yang memberi Rp0 sebagai harga valid`,
      (can.price as number) > 0 && (svc.unitPrice as number) > 0 && (v2.unitPrice as number) > 0 && (v3.unitPrice as number) > 0,
      `canonical=${can.price} svc=${svc.unitPrice} v2=${v2.unitPrice} v3=${v3.unitPrice}`);
  }

  // Kontrol non-BM: CK 3.7.4 — harga tersimpan == biaya langsung, DHSP = direct x 1,10.
  // Perbaikan juga menghapus preferensi DHSP di jalur canonical untuk CK;
  // perilaku harga tersimpan tidak berubah.
  {
    const item = officialAhspRepository.getOfficialAhsp('3.7.4');
    check('3.7.4: ada di repository', item !== undefined);
    if (item) {
      const comp = priceResolver2026.resolveAhspUnitPrice(item);
      check('3.7.4: harga tersimpan == biaya langsung', item.unitPrice === comp.unitPrice, `stored=${item.unitPrice} direct=${comp.unitPrice}`);
      const can = canonicalPriceResolver.resolve({ code: '3.7.4', name: item.name, itemType: 'AHSP' });
      check('3.7.4: canonical == biaya langsung (bukan DHSP)', can.price === comp.unitPrice && can.price !== comp.officialDhspPrice, `canonical=${can.price} direct=${comp.unitPrice} dhsp=${comp.officialDhspPrice}`);
    }
  }

  // Bukti perbaikan validator I.95: aturan beton curah tetap menggigit untuk
  // beton curah (m2 ditolak, m3 dalam batas lolos), tetapi produk satuan lolos.
  {
    const it95 = officialAhspRepository.getOfficialAhsp('I.95')!;
    const direct95 = priceResolver2026.resolveAhspUnitPrice(it95).unitPrice as number;
    const vPatok = priceSanityValidator.validatePrice('Patok Lalu Lintas Beton', direct95, 'Buah');
    check('validator: patok Buah VALID (carve-out produk satuan)', vPatok.status === 'VALID' && vPatok.isValid, `status=${vPatok.status}`);
    const vBulkBad = priceSanityValidator.validatePrice('Cor Sloof Beton', 1000000, 'Meter Persegi');
    check('validator: beton curah m2 tetap PRICE_INVALID', vBulkBad.status === 'PRICE_INVALID', `status=${vBulkBad.status}`);
    const vBulkOk = priceSanityValidator.validatePrice('Cor Sloof Beton', 1000000, 'Meter Kubik');
    check('validator: beton curah m3 dalam batas tetap VALID', vBulkOk.status === 'VALID', `status=${vBulkOk.status}`);
  }

  // Kondisi biaya langsung null / tidak valid — SEMUA lapisan harus fail-closed:
  // tidak ada harga, tidak ada DHSP, tidak ada Rp0 yang disajikan sebagai valid.
  // (a) Karantina: E.2 (semua kapitalisasi) tidak boleh menghasilkan harga apa pun.
  for (const q of ['E.2', 'e.2']) {
    check(`${q}: tidak ada di repository (karantina)`, officialAhspRepository.getOfficialAhsp(q) === undefined);
    const can = canonicalPriceResolver.resolve({ code: q, name: q, itemType: 'AHSP' });
    check(`${q}: canonical fail-closed (MISSING/null)`, can.status === 'MISSING' && can.price === null, `status=${can.status} price=${can.price}`);
    const svc = dedToRabPipelineService.resolvePrice(q);
    check(`${q}: transfer service fail-closed`, svc.unitPrice === undefined && svc.priceSource === 'PRICE_NOT_FOUND', `unit=${svc.unitPrice} source=${svc.priceSource}`);
    const v2 = ahspPriceResolver.resolvePrice(
      { name: q, ahspMatch: { code: q, matchType: 'EXACT_MATCH' } } as any,
    );
    check(`${q}: resolver v2 fail-closed`, (v2.unitPrice === null || v2.unitPrice === 0) && v2.priceSource === 'PRICE_NOT_FOUND', `unit=${v2.unitPrice} source=${v2.priceSource}`);
    const v3 = dedPriceResolutionEngine.resolveItemPrice(
      { name: q, quantity: QTY, quantityUnit: 'Meter', ahsp: { code: q } } as any,
    );
    check(`${q}: mesin v3 fail-closed (0/PRICE_NOT_FOUND/total null)`, v3.unitPrice === 0 && v3.source === 'PRICE_NOT_FOUND' && v3.totalPrice === null,
      `unit=${v3.unitPrice} total=${v3.totalPrice} source=${v3.source}`);
  }
  // (b) Kode yang sama sekali tidak dikenal.
  {
    const can = canonicalPriceResolver.resolve({ code: 'ZZZ-NOT-FOUND', name: 'ZZZ-NOT-FOUND-ITEM', itemType: 'AHSP' });
    check('bogus: canonical tidak RESOLVED dan harga null', can.status !== 'RESOLVED' && can.price === null, `status=${can.status} price=${can.price}`);
    const svc = dedToRabPipelineService.resolvePrice('ZZZ-NOT-FOUND');
    check('bogus: transfer service PRICE_NOT_FOUND', svc.unitPrice === undefined && svc.priceSource === 'PRICE_NOT_FOUND', `unit=${svc.unitPrice} source=${svc.priceSource}`);
  }

  console.log(`\nDED DIRECT COST TRANSFER: ${pass} PASS, ${fail} FAIL`);
  assert.strictEqual(fail, 0, `${fail} direct-cost transfer check(s) failed`);
}

main().catch((e) => {
  console.error('DED DIRECT COST TRANSFER ERROR', e);
  process.exit(1);
});
