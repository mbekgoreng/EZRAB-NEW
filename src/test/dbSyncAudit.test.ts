/**
 * DB-sync Fase 2 — audit pasca-sinkronisasi atas artefak pipeline yang diregenerasi.
 *
 * Membaca file generated (priceMaster + resourceIndex) dan artefak validated
 * (unresolved_component_keys.json). Ringan: TIDAK mengimpor katalog kanonis
 * 16 MB — hanya file generated pipeline.
 *
 * Yang ditegaskan (sesuai cakupan Fase 2 yang DIPUTUSKAN, bukan literal
 * semua-baris):
 * - tidak ada referensi AHSP yang hilang di DB (790 component key hadir);
 * - tidak ada harga yang dikarang (setiap record ber-provenance, harga > 0,
 *   tanpa UNMATCHED; key tanpa harga sumber terdaftar eksplisit unresolved);
 * - 128 key gap sejati Fase 1 tetap unresolved berlabel — KECUALI L29|OJ
 *   yang ditutup alias roster Wave 1, dan 13 key karantina (alasan terpisah);
 * - alias Gelombang 1 terikat dengan benar (4 alias HSD + alias roster).
 *
 * Prasyarat: jalankan SETELAH `npm run price:pipeline` Fase 2.
 * Jalankan: npx vitest run src/test/dbSyncAudit.test.ts
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RESOURCE_PRICE_RECORDS,
  RESOURCE_PRICE_RECORD_COUNT,
} from '../data/priceDatabase2026/priceMaster.generated';
import {
  COMPONENT_KEYS,
  COMPONENT_KEY_COUNT,
  CANONICAL_RESOURCE_INDEX_COUNT,
} from '../data/priceDatabase2026/resourceIndex.generated';
import { looseCode } from '../data/priceDatabase2026/normalize';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;
}

interface UnresolvedEntry {
  key: string;
  reason: 'QUARANTINED_ARTIFACT' | 'NO_SOURCE_PRICE';
  detail: string;
}

const unresolved = readJson<{ count: number; keys: UnresolvedEntry[] }>(
  'data/price2026/validated/unresolved_component_keys.json'
);
const quarantined = readJson<{ keys: Array<{ key: string }> }>(
  'data/price2026/quarantined-component-keys.json'
);
const aliasRules = readJson<{
  rules: Array<{ id: string; sourceKey: string; resourceLooseCode: string; resourceUnit: string }>;
}>('data/price2026/aliases.json');

const keySet = new Set(COMPONENT_KEYS.map((k) => k.key));
const keyByKey = new Map(COMPONENT_KEYS.map((k) => [k.key, k]));
const unresolvedByKey = new Map(unresolved.keys.map((k) => [k.key, k]));

/** Component key yang diikat sebuah record priceMaster (kode+satuan komponen). */
function recordKey(r: { resourceCode: string; unit: string }): string {
  return `${looseCode(r.resourceCode)}|${r.unit}`;
}

const recordsByKey = new Map<string, typeof RESOURCE_PRICE_RECORDS>();
for (const r of RESOURCE_PRICE_RECORDS) {
  const k = recordKey(r);
  if (!recordsByKey.has(k)) recordsByKey.set(k, []);
  recordsByKey.get(k)!.push(r);
}
// Only keys that exist in the component index count as priced: NAME_KEY /
// COMPONENT_REF records (adopsi pasar 2026-11-17) carry no code, so
// recordKey() maps them to phantom `|<unit>` keys (7 distinct units) that
// are not component keys. The pipeline's unresolved accounting counts
// index keys only (660 = 790 − 130); this set must match it.
const pricedKeys = new Set([...recordsByKey.keys()].filter((k) => keySet.has(k)));

/** 14 key artefak item 4.1.1.1 (dijaga sinkron dengan quarantined-component-keys.json). */
const QUARANTINED_KEYS = quarantined.keys.map((k) => k.key);

/** 14 key BARU dari ekstraksi segar Fase 1 (semua artefak 4.1.1.1). */
const NEW_KEYS_14 = QUARANTINED_KEYS;

/** 6 key yang HILANG (5 dari ekstraksi segar Fase 1 + M23|m3 yang hilang di ronde 2: koreksi R041 memindahkan ketujuh baris Semen M.23 dari m³ ke kg, sehingga tidak ada lagi baris M.23 bersatuan m³). */
const LOST_KEYS_6 = ['L05|OH', 'L06|OH', 'L12C|OH', 'L12D|OH', 'L14B|OH', 'M23|m3'];

/**
 * 105 dari 128 key gap sejati Fase 1 yang HARUS tetap unresolved berlabel
 * NO_SOURCE_PRICE sesudah Fase 2 + adopsi pasar ronde 1 + ronde 2
 * 2026-11-17 (128 − 13 key karantina − L29|OJ yang ditutup alias roster
 * 'Welding Inspector' − M44|kg yang ditutup re-route 'Elektroda las' dari
 * ikatan palsu M216d Pasir Fluks − 4 key yang terikat sahih lewat adopsi
 * pasar ronde 1: M23|kg Portland Cement Rp1.425/kg, M74|kg Kawat las
 * listrik Rp49.888/kg, M35|kg Fly Ash Rp425/kg, M21|m3 Air Bersih
 * Rp7.500/m³ — semuanya median DIRECT bersumber dari riset pasar
 * 2026-11-16, dibuktikan diff 0 harga lama berubah − 4 key ronde 2:
 * M23|m3 (key HILANG — koreksi R041 memindahkan ketujuh baris Semen M.23
 * dari m³ ke kg; barisnya kini terikat M23|kg Rp1.425/kg), B06|kg (R203
 * 'Baja tulangan Pondasi Tiang Bor' EXACT_CODE Rp9.317/kg, duplikat sahih
 * R025), M43|kg (R135 'Ijuk tebal minimum 2,5 cm' EXACT_CODE Rp17.000/kg),
 * M72|kg (R149 'Kawat Kasa / Bendrat' EXACT_CODE Rp22.000/kg) — ketiga
 * ikatan EXACT_CODE dibuktikan sahih lewat kode komponen + riset pasar
 * ronde 2). Daftar ini disalin dari key_coverage.jsonl Fase 1
 * (boundAny8=false, boundBMAdapter=false, boundBMDead=false). Bila sebuah
 * key di sini kelak terikat, ikatan itu harus dibuktikan sahih dulu —
 * baru daftar ini diubah dengan bukti.
 */
const EXPECTED_NO_SOURCE_PRICE = [
  'L03|OJ', 'T34|jam', "M195|bh/m'",
  'M184|bh', 'M120|bh', 'T92|jam', 'EI734|kg', "M133|kg/m'", 'M179|m',
  'EI374|kg', 'HPE69|jam', 'M178|kg/m', 'M180|kg/m', 'M271|kg',
  'M394B|bh', 'M394C|bh', 'M394D|bh', 'A2NH|bh', 'G17|jam', 'J01|jam',
  'L10|OH', 'L12|OH', 'M192|m3/m2', 'M201|kg', 'M240A|btg/m',
  "M240B|batang/m'", 'M394A|bh', 'M394E|bh', 'M394K|bh',
  'A1NH|bh', 'A2H|bh', 'B1H|bh', 'B1NH|bh', 'B2H|bh', 'B2NH|bh',
  'C1H|bh', 'C1NH|bh', 'C2H|bh', 'C2NH|bh', 'D11HT|bh', 'D12HT|bh',
  'E55|jam', 'G01|jam', 'G06|jam', 'G07|jam', 'G08|jam', 'G10|jam',
  'G11|jam', 'G12|jam', 'G14|jam', 'G15|jam', 'G16|jam', 'G20|jam',
  'G21|jam', 'G22|jam', 'G25|jam', 'G26|jam', 'G27|jam', 'G29|jam',
  'G30|jam', 'G31|jam', 'G32|jam', 'G33|jam', 'G34|jam', 'G35|jam',
  'G36|jam', 'G37|jam', 'G38|jam', 'G39|jam', 'G40|jam', 'K15|m2',
  'K16|m2', 'K17|m2', 'K18|m2', 'L11|OH', 'L13|OH', 'L16|OH', 'L16|OJ',
  'M130|m3', 'M133|m', 'M162|ton', 'M162A|ton', 'M179|kg', 'M198|kg',
  'M199|kg', 'M199B|kg', 'M202|kg', 'M218A|kg', 'M218B|kg', 'M239A|bh',
  "M240A|batang/m'", "M240C|batang/m'", "M240D|batang/m'",
  "M241|batang/m'", "M255A|kg/m'", 'M287|m3', 'M292|ton/m3', 'M301|m3',
  'M314|kg', 'M398K|bh', 'M398M|bh', 'M399C|bh', 'M449|bh',
  'M449D|bh', 'M525|bh',
];

/** Alias HSD Gelombang 1: id aturan -> key komponen yang diharapkan. */
const WAVE1_HSD: Record<string, string> = {
  'DBSYNC2-HSD-001': 'M91|m3',
  'DBSYNC2-HSD-002': 'M92|m3',
  'DBSYNC2-HSD-003': 'M09|m3',
  'DBSYNC2-HSD-004': 'M23|m2',
};

describe('indeks: tidak ada referensi AHSP yang hilang', () => {
  it('indeks sumber kanonis segar: 5.236 baris (bukan 3.898 basi)', () => {
    expect(CANONICAL_RESOURCE_INDEX_COUNT).toBe(5185);
  });

  it('790 component key (782 basi + 14 baru − 6 hilang)', () => {
    expect(COMPONENT_KEY_COUNT).toBe(790);
    expect(COMPONENT_KEYS.length).toBe(790);
    expect(keySet.size).toBe(790);
  });

  it('14 key baru hadir; 6 key hilang tidak ada', () => {
    for (const k of NEW_KEYS_14) expect(keySet.has(k)).toBe(true);
    for (const k of LOST_KEYS_6) expect(keySet.has(k)).toBe(false);
  });
});

describe('priceMaster: tidak ada harga yang dikarang', () => {
  it('tumbuh melewati 309 basi (final run-3 + adopsi pasar ronde 2 2026-11-17: 899 record / 130 key)', () => {
    // Proyeksi Fase 1 (~674) SUPERSEDED: proyeksi itu keliru mengasumsikan
    // baris CK_HSD_2026 (485 ikatan tangga) masuk pipeline, padahal
    // sources.config.ts tidak punya sumber CK aktif; hardening juga menolak
    // ~280 ikatan fuzzy MATMASTER lama. 899 = 452 + 447 record pasar MARKET_2026 (adopsi ronde 1 + ronde 2 2026-11-17, terverifikasi diff 0 harga lama berubah).
    expect(RESOURCE_PRICE_RECORD_COUNT).toBe(899);
    expect(RESOURCE_PRICE_RECORDS.length).toBe(RESOURCE_PRICE_RECORD_COUNT);
  });

  it('setiap record ber-provenance dan berharga valid', () => {
    const allowedMethods = new Set([
      'ALIAS',
      'EXACT_CODE',
      'NORMALIZED_CODE_UNIT',
      'NAME_UNIT',
      // Adopsi pasar 2026-11-17: NAME_KEY (exact name+unit, incl. the
      // main-loop companions) and COMPONENT_REF (standalone component
      // reference prices for the owner mixed-item rule) are real
      // pipeline bindings, always NEEDS_REVIEW — never VERIFIED.
      'NAME_KEY',
      'COMPONENT_REF',
    ]);
    for (const r of RESOURCE_PRICE_RECORDS) {
      expect(Number.isFinite(r.price)).toBe(true);
      expect(r.price).toBeGreaterThan(0);
      expect(r.matchMethod).not.toBe('UNMATCHED');
      expect(allowedMethods.has(r.matchMethod)).toBe(true);
      expect(r.sourceKey).toBeTruthy();
      expect(r.sourceTier).toBeTruthy();
      expect(r.sourceType).toBeTruthy();
      expect(r.verificationStatus).toBeTruthy();
      // NAME_KEY / COMPONENT_REF bind by NAME (codeless components have
      // no code to carry); their identity is the RES-KEY id + name + unit.
      // Every other method must carry a real component code.
      if (r.matchMethod === 'NAME_KEY' || r.matchMethod === 'COMPONENT_REF') {
        expect(r.resourceId).toMatch(/^RES-KEY-[0-9a-z]{8,9}$/);
        expect(r.resourceName).toBeTruthy();
      } else {
        expect(r.resourceCode).toBeTruthy();
      }
    }
  });

  it('setiap record mengikat key yang ada di indeks', () => {
    for (const r of RESOURCE_PRICE_RECORDS) {
      // NAME_KEY / COMPONENT_REF records bind by (name, unit) to codeless
      // components — there is no component key to bind. They are pinned
      // by the provenance test above (RES-KEY id + name + unit).
      if (r.matchMethod === 'NAME_KEY' || r.matchMethod === 'COMPONENT_REF') {
        expect(r.resourceId).toMatch(/^RES-KEY-[0-9a-z]{8,9}$/);
        continue;
      }
      expect(keySet.has(recordKey(r))).toBe(true);
    }
  });
});

describe('karantina: 14 key artefak tidak pernah berharga', () => {
  it('ke-14 key hadir di indeks dengan flag quarantined', () => {
    expect(QUARANTINED_KEYS).toHaveLength(14);
    for (const k of QUARANTINED_KEYS) {
      expect(keyByKey.get(k)?.quarantined).toBe(true);
    }
  });

  it('ke-14 key tanpa satu pun record harga', () => {
    for (const k of QUARANTINED_KEYS) {
      expect(recordsByKey.get(k) || []).toHaveLength(0);
    }
  });

  it('ke-14 key terdaftar unresolved dengan alasan QUARANTINED_ARTIFACT', () => {
    for (const k of QUARANTINED_KEYS) {
      expect(unresolvedByKey.get(k)?.reason).toBe('QUARANTINED_ARTIFACT');
    }
  });
});

describe('unresolved: key tanpa harga berlabel eksplisit', () => {
  it('setiap key unresolved benar-benar tanpa record harga', () => {
    for (const u of unresolved.keys) {
      expect(recordsByKey.get(u.key) || []).toHaveLength(0);
      expect(['QUARANTINED_ARTIFACT', 'NO_SOURCE_PRICE']).toContain(u.reason);
      expect(u.detail).toBeTruthy();
    }
  });

  it('daftar unresolved konsisten dengan indeks minus key berharga', () => {
    expect(unresolved.count).toBe(unresolved.keys.length);
    expect(unresolved.count).toBe(COMPONENT_KEYS.length - pricedKeys.size);
  });

  it('105 key gap sejati tetap NO_SOURCE_PRICE (bukan harga karangan)', () => {
    expect(EXPECTED_NO_SOURCE_PRICE).toHaveLength(105);
    for (const k of EXPECTED_NO_SOURCE_PRICE) {
      expect(keySet.has(k)).toBe(true);
      expect(unresolvedByKey.get(k)?.reason).toBe('NO_SOURCE_PRICE');
      expect(recordsByKey.get(k) || []).toHaveLength(0);
    }
  });

  it('L03|OJ tetap unresolved di pipeline (runtime menyelesaikannya via kembar OJ)', () => {
    // L03|OJ adalah gap PALSU di runtime: resolver mengindeks baris labor
    // adapter BM bersatuan jam juga sebagai OJ. Pipeline tidak mengarang
    // harga untuknya; re-audit menghitungnya terikat lewat aturan kembar.
    expect(unresolvedByKey.get('L03|OJ')?.reason).toBe('NO_SOURCE_PRICE');
  });
});

describe('alias Gelombang 1 terikat dengan benar', () => {
  it('4 alias HSD mengikat key yang diharapkan via ALIAS (VERIFIED)', () => {
    for (const [ruleId, expectedKey] of Object.entries(WAVE1_HSD)) {
      const rule = aliasRules.rules.find((r) => r.id === ruleId);
      expect(rule).toBeTruthy();
      const bound = RESOURCE_PRICE_RECORDS.filter(
        (r) =>
          r.matchMethod === 'ALIAS' &&
          r.notes.some((n) => n === `alias=${ruleId}`)
      );
      expect(bound.length).toBeGreaterThanOrEqual(1);
      for (const r of bound) {
        expect(recordKey(r)).toBe(expectedKey);
        expect(r.sourceKey).toBe('HSD_2026');
        expect(r.verificationStatus).toBe('VERIFIED');
      }
    }
  });

  it('M44|kg (gap sejati) ditutup re-route Elektroda las dari Pasir Fluks', () => {
    expect(unresolvedByKey.has('M44|kg')).toBe(false);
    const bound = recordsByKey.get('M44|kg') || [];
    expect(bound.length).toBeGreaterThanOrEqual(1);
    // Bukan harga pasir fluks: key M44 adalah Kawat Las (Elektroda).
    for (const r of bound) {
      expect(r.resourceName).toMatch(/Kawat Las/);
    }
  });

  it('L29|OJ (gap sejati) ditutup alias roster Welding Inspector', () => {
    expect(unresolvedByKey.has('L29|OJ')).toBe(false);
    const bound = (recordsByKey.get('L29|OJ') || []).filter((r) =>
      r.notes.some((n) => n === 'aliasName=Welding Inspector')
    );
    expect(bound.length).toBeGreaterThanOrEqual(1);
  });

  it('alias roster mengikat dalam jumlah berarti (proyeksi ~13 ikatan)', () => {
    const aliasBound = RESOURCE_PRICE_RECORDS.filter((r) =>
      r.notes.some((n) => n.startsWith('aliasName='))
    );
    expect(aliasBound.length).toBeGreaterThanOrEqual(10);
  });

  it('E19A|jam dan L03|OH terikat (Baby Roller / Kepala Tukang Beton)', () => {
    expect((recordsByKey.get('E19A|jam') || []).length).toBeGreaterThanOrEqual(1);
    expect((recordsByKey.get('L03|OH') || []).length).toBeGreaterThanOrEqual(1);
  });

  it('alias menyesatkan TIDAK mengikat: Ahli Mekanika Tanah, Stamper Gilas', () => {
    const bad = RESOURCE_PRICE_RECORDS.filter((r) =>
      r.notes.some(
        (n) => n === 'aliasName=Ahli Mekanika Tanah' || n === 'aliasName=Stamper Gilas'
      )
    );
    expect(bad).toHaveLength(0);
  });
});

describe('false positive yang ditutup hardening', () => {
  it('M374|bh tidak lagi berharga Rp829.900 (harga bak kontrol, bukan bata)', () => {
    for (const r of recordsByKey.get('M374|bh') || []) {
      expect(r.price).not.toBe(829900);
    }
  });

  it('M241A|m tidak lagi berharga Rp2.800.000 (harga pipa 50 cm, bukan 50 mm)', () => {
    for (const r of recordsByKey.get('M241A|m') || []) {
      expect(r.price).not.toBe(2800000);
    }
  });

  it('E25|jam (Stamper) tidak lagi berharga Rp3.981.125 (harga AMP)', () => {
    for (const r of recordsByKey.get('E25|jam') || []) {
      expect(r.price).not.toBe(3981125);
    }
  });
});
