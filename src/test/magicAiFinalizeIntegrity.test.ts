/**
 * P0-A (D-02) — integritas finalisasi Magic AI.
 *
 * Menguji fungsi produksi nyata `mapMagicAiItemToRabInput`
 * (src/ai-tools/ded-ai-estimate/finalizeMapping.ts) yang dipakai
 * `DedAnalysisDashboard.handleCommitToProject`:
 * harga hilang tidak pernah menjadi baris Rp0, harga jalur AI selalu
 * berlabel Estimasi AI (bukan resmi/terverifikasi), kode AHSP tidak
 * pernah diteruskan dari jalur yang tak tervalidasi kanonis.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapMagicAiItemToRabInput } from '../ai-tools/ded-ai-estimate/finalizeMapping';
import type { AiEstimateWorkItem } from '../ai-estimate/types';

let total = 0;
let failed = 0;
function ok(cond: boolean, label: string) {
  total += 1;
  if (cond) {
    console.log(`ok ${total} - ${label}`);
  } else {
    failed += 1;
    console.log(`not ok ${total} - ${label}`);
  }
}

function fixture(overrides: Partial<AiEstimateWorkItem>): AiEstimateWorkItem {
  return {
    id: 'w1',
    category: 'Pekerjaan Struktur',
    workName: 'Kolom beton 30x30',
    quantity: 10,
    unit: 'm3',
    quantitySource: 'DED_GEOMETRIC',
    priceSource: 'AI_ESTIMATE',
    confidence: 'HIGH',
    sourcePages: [1],
    assumptions: [],
    warnings: [],
    ...overrides,
  };
}

/* Kasus A — harga hilang tetap tak teresolusi, tidak pernah jadi 0 */
ok(
  mapMagicAiItemToRabInput(fixture({ unitPrice: null, estimatedUnitPrice: null, priceSource: 'UNRESOLVED' })) === null,
  'A1 null + UNRESOLVED -> ditahan (null)'
);
ok(
  mapMagicAiItemToRabInput(fixture({ unitPrice: 99999, estimatedUnitPrice: 99999, priceStatus: 'PRICE_UNRESOLVED' })) === null,
  'A2 priceStatus PRICE_UNRESOLVED menang atas angka nyasar -> ditahan'
);
ok(
  mapMagicAiItemToRabInput(fixture({ unitPrice: null, estimatedUnitPrice: 50000, priceSource: 'UNRESOLVED' })) === null,
  'A3 priceSource UNRESOLVED dengan estimatedUnitPrice terisi -> ditahan'
);

/* Kasus B — nol eksplisit & nilai tak valid mengikuti aturan domain pipeline (<= 0 tak masuk total) */
ok(
  mapMagicAiItemToRabInput(fixture({ unitPrice: 0, estimatedUnitPrice: 0 })) === null,
  'B1 nol eksplisit dari jalur AI -> ditahan (bukan baris resolved-0)'
);
ok(
  mapMagicAiItemToRabInput(fixture({ unitPrice: Number.NaN, estimatedUnitPrice: undefined })) === null,
  'B2 NaN -> ditahan'
);
ok(
  mapMagicAiItemToRabInput(fixture({ unitPrice: -5, estimatedUnitPrice: null })) === null,
  'B3 harga negatif -> ditahan'
);

/* Kasus C — harga positif sah dipertahankan persis, provenance jujur */
const c = mapMagicAiItemToRabInput(
  fixture({ unitPrice: 150000, estimatedUnitPrice: 150000, priceStatus: 'PRICE_ESTIMATED' })
);
ok(c !== null, 'C1 harga positif sah -> lolos');
ok(c?.unitPrice === 150000, 'C2 nilai persis 150000 dipertahankan');
ok(c?.priceSourceKind === 'EZRAB_ASSUMPTION', 'C3 kind EZRAB_ASSUMPTION (bukan OFFICIAL_AHSP)');
ok(c?.priceSourceLabel === 'Estimasi AI', 'C4 label Estimasi AI');
ok(c?.verificationStatus === 'NEEDS_VERIFICATION', 'C5 NEEDS_VERIFICATION (bukan VERIFIED)');
ok(c !== null && !('ahspCode' in c && c.ahspCode), 'C6 tanpa ahspCode');
ok(c?.volume === 10 && c?.unit === 'm3' && c?.description === 'Kolom beton 30x30', 'C7 volume/unit/deskripsi utuh');
const c2 = mapMagicAiItemToRabInput(fixture({ unitPrice: null, estimatedUnitPrice: 75000 }));
ok(c2?.unitPrice === 75000, 'C8 fallback nullish ke estimatedUnitPrice bekerja (75000)');

/* Kasus D — kode AHSP yang menempel pada item estimasi tidak menghasilkan status resmi */
const dFixture = fixture({ unitPrice: 56000, estimatedUnitPrice: 56000 });
(dFixture as unknown as Record<string, unknown>).ahspCode = '3.7.4';
const d = mapMagicAiItemToRabInput(dFixture);
ok(d !== null && !('ahspCode' in d && d.ahspCode), 'D1 ahspCode 3.7.4 TIDAK diteruskan');
ok(d?.priceSourceKind !== 'OFFICIAL_AHSP' && d?.verificationStatus !== 'VERIFIED', 'D2 tidak ada status resmi palsu');

/* Kasus E — invariant: tidak ada kombinasi sumber/status yang menghasilkan OFFICIAL dari jalur ini */
{
  const sources = ['AI_ESTIMATE', 'UNRESOLVED'] as const;
  const statuses = ['PRICE_ESTIMATED', 'PRICE_UNRESOLVED', 'USER_INPUT', undefined] as const;
  let invariantHolds = true;
  for (const ps of sources) {
    for (const st of statuses) {
      const r = mapMagicAiItemToRabInput(
        fixture({ unitPrice: 100000, estimatedUnitPrice: 100000, priceSource: ps, priceStatus: st })
      );
      if (r && (r.priceSourceKind === 'OFFICIAL_AHSP' || r.verificationStatus === 'VERIFIED' || r.ahspCode)) {
        invariantHolds = false;
      }
    }
  }
  ok(invariantHolds, 'E1 invariant: jalur Magic tidak pernah menghasilkan OFFICIAL/VERIFIED/kode');
}

/* Kasus F — alur campuran: partisi persis seperti yang dilakukan dashboard */
{
  const items = [
    fixture({ id: 'ok1', unitPrice: 150000, estimatedUnitPrice: 150000 }),
    fixture({ id: 'no-price', unitPrice: null, estimatedUnitPrice: null, priceSource: 'UNRESOLVED' }),
    fixture({ id: 'blocked', unitPrice: 200000, estimatedUnitPrice: 200000, status: 'BLOCKED' }),
    fixture({ id: 'ok2', unitPrice: null, estimatedUnitPrice: 75000 }),
  ];
  const mapped = items.map((it) => mapMagicAiItemToRabInput(it));
  const committable = mapped.filter((m) => m !== null);
  ok(committable.length === 2 && mapped.length - committable.length === 2, 'F1 campuran 4 item -> 2 masuk, 2 ditahan');
  ok(mapMagicAiItemToRabInput(items[2]) === null, 'F2 item BLOCKED berharga -> ditahan');
}

/* Penjaga sumber — dashboard memakai mapper dan pola lama hilang */
{
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '../components/magic-ai/DedAnalysisDashboard.tsx'),
    join(process.cwd(), 'src/components/magic-ai/DedAnalysisDashboard.tsx'),
  ];
  const dashPath = candidates.find((p) => {
    try {
      readFileSync(p, 'utf8');
      return true;
    } catch {
      return false;
    }
  });
  const dash = dashPath ? readFileSync(dashPath, 'utf8') : '';
  ok(!dash.includes('estimatedUnitPrice || 0'), 'F3 pola `estimatedUnitPrice || 0` hilang dari dashboard');
  ok(dash.includes('mapMagicAiItemToRabInput'), 'F4 dashboard memanggil mapper kanonis');
  ok(!dash.includes('ahspCode: (it as any)'), 'F5 penerusan ahspCode hilang dari payload commit (badge tampil di tabel review adalah display, di luar jalur persistensi)');
}

console.log(`# ${total - failed}/${total} lulus`);
if (failed > 0) process.exit(1);
