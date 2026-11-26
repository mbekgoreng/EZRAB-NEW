/**
 * EZRAB AI & WORKFLOW COMPLETION SPRINT — Worker D (2026-11-26).
 *
 * REAL RAB DRAFT GENERATION + BUDGET INTELLIGENCE (§3D + §3E).
 *
 * Jalur yang diuji (jalur NYATA, bukan mock): routeIntent →
 * executeIntent (actionRegistry) → buildUniversalDraft (universalRab)
 * → RabTemplateService → computeTotals (engine kanonis draft).
 * Semua total di bawah adalah angka DETERMINISTIK dari katalog +
 * template yang sama — bila total bergerak, ada yang berubah di
 * katalog/template, bukan di tes ini.
 *
 * Yang DIPIN di sini:
 *  1. Draft end-to-end per kategori (rumah, jembatan berbentang,
 *     retaining wall, gudang, drainase, landscape, jalan, pagar):
 *     kategori + template + total kanonis + verdict anggaran.
 *  2. Total kanonis = Σ volume × harga satuan item berharga
 *     (dihitung ulang independen di tes, toleransi Rp1) + item
 *     belum berharga TIDAK masuk total (bukan Rp0).
 *  3. Label provenance hadir per item (RESMI AHSP / REFERENSI PASAR
 *     / BELUM TERSEDIA) + kode AHSP pada item resmi.
 *  4. Budget intelligence (§3E, perbaikan Worker D): seksi
 *     "Kontributor biaya terbesar" + baris "Gambaran selisih" saat
 *     OVER — sebelumnya pesan draft hanya membawa total + verdict
 *     tanpa menyebut item mana yang mendominasi total.
 *  5. Hektar/are (perbaikan Worker D): "1 hektar" kini terbaca
 *     sebagai 10.000 m² di lapisan universal — sebelumnya
 *     buildUniversalDraft("... landscape 1 hektar ...") jatuh ke
 *     needs-spec "ukuran belum lengkap" (workaround pernyataan-ulang
 *     m² hanya ada di generateFromProjectContext, actionRegistry).
 *  6. Pin rekayasa: jembatan tanpa bentang TETAP needs-spec meski
 *     panjang disebut (panjang BUKAN bentang).
 *  9. Follow-up Worker A P1–P3 (2026-11-26, universalTaxonomy.ts):
 *     villa telanjang = rumah (template HOUSE-VILLA-MODERN),
 *     villa konteks resort tetap hotel; guard "rumah sakit /
 *     bersalin / susun"; SPBU DITOLAK (tetap null — lihat §9).
 *
 * Yang SENGAJA TIDAK dipin di sini (celah terbuka, lihat
 * evidence/worker-d-proposed-patch.md):
 *  - Jalur rumah DIRECT (buildDirectRab/formatDirectRabMessage):
 *    anggaran yang disebut pengguna TIDAK PERNAH tampil di pesan
 *    draft maupun kartu pilihan — verdict anggaran hilang di jalur
 *    itu. File pemiliknya (directRab.ts / actionRegistry.ts) bukan
 *    milik Worker D.
 *  - Alternatif lingkup terkuantifikasi ("kurangi panjang ke X m
 *    → hemat RpY") belum ada di pesan draft mana pun — biaya
 *    template tidak linear sehingga angka itu tidak boleh dikarang
 *    dari pesan; butuh komputasi what-if template-aware.
 *
 * Jalankan: npx --yes tsx src/test/aiWorkflowSprintDraft.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import { executeIntent } from '../ai-tools/ezrab-ai/actionRegistry';
import {
  buildUniversalDraft, computeTotals, effectiveItems, formatUniversalDraftMessage,
  extractUniversalSpec, getLastUniversalDraft, clearLastUniversalDraft, pricedAmount,
} from '../ai-tools/ezrab-ai/universalRab';
import { findAreaMentions, cancelledAreaValues, classifyUniversal, coverageFor, subcategoryById } from '../ai-tools/ezrab-ai/universalTaxonomy';
import { RabTemplateService } from '../services/rabTemplateService';
import { assessBudgetFeasibility, formatBudgetFeasibilityLine } from '../ai-tools/ezrab-ai/budgetFeasibility';
import { getLastDirectRab } from '../ai-tools/ezrab-ai/directRab';
import { clearLastRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentFlow';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};
const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;
const hasAction = (res: { actions?: Array<{ action: { kind: string } }> }, kind: string) =>
  (res.actions ?? []).some((a) => a.action.kind === kind);
/** Total independen: Σ volume × harga satuan item berharga saja. */
const independentTotal = (draft: NonNullable<ReturnType<typeof getLastUniversalDraft>>) =>
  effectiveItems(draft).reduce((s, it) => s + (pricedAmount(it) ?? 0), 0);
const close = (a: number, b: number) => Math.abs(a - b) < 1;
const partIds = (res: ReturnType<typeof buildUniversalDraft>) =>
  res.kind === 'draft' ? res.draft.parts.map((p) => p.template.id) : [];

/* ------------------------------------------------------------------ */
/* 1 — Jembatan berbentang: draft + total kanonis + verdict UNDER     */
/* ------------------------------------------------------------------ */
console.log('== 1 — Jembatan bentang 12 m, budget 500jt ==');
{
  const res = buildUniversalDraft('buatkan rab jembatan beton bentang 12 m lebar 7 m budget 500jt');
  check('1.1 draft terbentuk', res.kind === 'draft', res.kind);
  if (res.kind === 'draft') {
    const d = res.draft;
    const t = computeTotals(d);
    check('1.2 template BRG-GIRDER-20M', partIds(res).includes('BRG-GIRDER-20M'), partIds(res).join(','));
    check('1.3 judul Jembatan & Struktur Khusus', d.title === 'Jembatan & Struktur Khusus', d.title);
    check('1.4 11 item', effectiveItems(d).length === 11, `${effectiveItems(d).length}`);
    check('1.5 total Rp261.930.612 (toleransi Rp1)', close(t.estimatedTotal, 261930611.918), `${t.estimatedTotal}`);
    check('1.6 total independen = total kanonis', close(independentTotal(d), t.estimatedTotal),
      `${independentTotal(d)} vs ${t.estimatedTotal}`);
    check('1.7 PARSIAL (1 item belum berharga)', t.status === 'PARSIAL' && t.unpricedCount === 1,
      `${t.status} / unpriced=${t.unpricedCount}`);
    check('1.8 7 RESMI AHSP + 3 REFERENSI PASAR', t.officialCount === 7 && t.marketCount === 3,
      `official=${t.officialCount} market=${t.marketCount}`);
    check('1.9 budgetCap 500jt, selisih +238.069.388', d.spec.budgetCap === 500_000_000 &&
      close((d.spec.budgetCap ?? 0) - t.estimatedTotal, 238069388.082), `${d.spec.budgetCap}`);
    check('1.10 item belum berharga ber-unitPrice null (bukan Rp0)',
      effectiveItems(d).some((i) => /Siar Muai/.test(i.description) && i.unitPrice == null),
      effectiveItems(d).filter((i) => i.priceStatus === 'PRICE_UNRESOLVED').map((i) => `${i.description}:${i.unitPrice}`).join(' | '));
    check('1.11 item resmi membawa kode AHSP',
      effectiveItems(d).filter((i) => (i as { priceSourceKind?: string }).priceSourceKind === 'OFFICIAL_AHSP')
        .every((i) => Boolean((i as { ahspCode?: string }).ahspCode)));
    check('1.12 WBS terpasang', d.wbsArtifact != null && (d.wbsArtifact.nodes?.length ?? 0) >= 1);
    check('1.13 asumsi tercatat (termasuk batas anggaran)', d.assumptions.length >= 1 &&
      d.assumptions.some((a) => a.includes('Rp 500.000.000')), d.assumptions.join(' | ').slice(0, 200));
    const msg = formatUniversalDraftMessage(d);
    check('1.14 pesan: verdict DI BAWAH anggaran', msg.includes('DI BAWAH anggaran sebesar Rp238.069.388'));
    check('1.15 pesan: kelayakan SEMENTARA (parsial)', msg.includes('(SEMENTARA — total PARSIAL, ada item belum berharga)'));
    check('1.16 pesan: kontributor terbesar tercantum',
      msg.includes('**Kontributor biaya terbesar:**') && msg.includes('Beton Abutment & Wing Wall fc 15 MPa'));
    check('1.17 pesan: UNDER tanpa baris Gambaran selisih', !msg.includes('Gambaran selisih:'));
  }
  // Jalur live yang sama.
  clearLastUniversalDraft();
  clearLastRabIntentSpec();
  const live = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab jembatan beton bentang 12 m lebar 7 m budget 500jt'));
  const liveDraft = getLastUniversalDraft();
  check('1.18 live: draft dibangun (push-universal)', hasAction(live, 'push-universal'));
  check('1.19 live: total sama dengan builder', liveDraft != null && close(computeTotals(liveDraft).estimatedTotal, 261930611.918),
    liveDraft ? `${computeTotals(liveDraft).estimatedTotal}` : 'null');
  check('1.20 live: pesan memuat verdict DI BAWAH', live.message.includes('DI BAWAH anggaran sebesar Rp238.069.388'));
}

/* ------------------------------------------------------------------ */
/* 2 — Retaining wall: draft + OVER + kontributor + gambaran selisih  */
/* ------------------------------------------------------------------ */
console.log('== 2 — Retaining wall 50 m, budget 100jt (OVER) ==');
{
  const res = buildUniversalDraft('budget 100jt buatkan rab struktur retaining wall panjang 50 m');
  check('2.1 draft terbentuk', res.kind === 'draft', res.kind);
  if (res.kind === 'draft') {
    const d = res.draft;
    const t = computeTotals(d);
    check('2.2 template STR-RETAINING-RC', partIds(res).includes('STR-RETAINING-RC'), partIds(res).join(','));
    check('2.3 total Rp356.953.225', close(t.estimatedTotal, 356953224.75), `${t.estimatedTotal}`);
    check('2.4 total independen = total kanonis', close(independentTotal(d), t.estimatedTotal));
    check('2.5 8 item, 0 belum berharga', effectiveItems(d).length === 8 && t.unpricedCount === 0,
      `${effectiveItems(d).length} item / unpriced=${t.unpricedCount}`);
    check('2.6 7 RESMI AHSP + 1 REFERENSI PASAR', t.officialCount === 7 && t.marketCount === 1,
      `official=${t.officialCount} market=${t.marketCount}`);
    const msg = formatUniversalDraftMessage(d);
    check('2.7 pesan: MELEBIHI Rp256.953.225', msg.includes('MELEBIHI anggaran sebesar Rp256.953.225'));
    check('2.8 pesan: kontributor terbesar = Penulangan Dinding',
      msg.includes('**Kontributor biaya terbesar:**') && msg.includes('Penulangan Dinding BjTP ≥ 12 mm — Rp 160.036.223 (44,8% dari total estimasi)'),
      msg.split('\n').filter((l) => /Kontributor|Penulangan Dinding BjTP/.test(l)).join(' | '));
    check('2.9 pesan: Gambaran selisih + anggaran menutup 28%',
      msg.includes('Gambaran selisih:') && msg.includes('menutup 28% dari total estimasi'),
      msg.split('\n').find((l) => l.includes('Gambaran selisih:')) ?? '(tanpa baris)');
    check('2.10 pesan: tidak ada pemangkasan diam-diam', msg.includes('tidak dipangkas diam-diam'));
  }
  clearLastUniversalDraft();
  clearLastRabIntentSpec();
  const live = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('budget 100jt buatkan rab struktur retaining wall panjang 50 m'));
  check('2.11 live: draft + vonis MELEBIHI', hasAction(live, 'push-universal') &&
    live.message.includes('MELEBIHI anggaran') && live.message.includes('Rp100.000.000'));

  // Tanpa budget: kontributor tetap ada, verdict TIDAK DAPAT DINILAI.
  const noBudget = buildUniversalDraft('buatkan RAB retaining wall panjang 100 m tinggi 3 m');
  check('2.12 tanpa budget: draft Rp593.301.588', noBudget.kind === 'draft' &&
    close(computeTotals((noBudget as { draft: NonNullable<ReturnType<typeof getLastUniversalDraft>> }).draft).estimatedTotal, 593301588.1),
    noBudget.kind);
  if (noBudget.kind === 'draft') {
    const msg = formatUniversalDraftMessage(noBudget.draft);
    check('2.13 tanpa budget: kontributor tetap tampil', msg.includes('**Kontributor biaya terbesar:**'));
    check('2.14 tanpa budget: TIDAK DAPAT DINILAI + tanpa Gambaran selisih',
      msg.includes('TIDAK DAPAT DINILAI') && !msg.includes('Gambaran selisih:'));
  }
}

/* ------------------------------------------------------------------ */
/* 3 — Gudang 500 m²: draft + OVER (semua REFERENSI PASAR)            */
/* ------------------------------------------------------------------ */
console.log('== 3 — Gudang 500 m², budget 300jt (OVER) ==');
{
  const res = buildUniversalDraft('dana 300jt buatkan rab gudang 500 m2');
  check('3.1 draft terbentuk', res.kind === 'draft', res.kind);
  if (res.kind === 'draft') {
    const d = res.draft;
    const t = computeTotals(d);
    check('3.2 template BLD-IND-WAREHOUSE', partIds(res).includes('BLD-IND-WAREHOUSE'), partIds(res).join(','));
    check('3.3 total Rp672.625.000', close(t.estimatedTotal, 672625000), `${t.estimatedTotal}`);
    check('3.4 total independen = total kanonis', close(independentTotal(d), t.estimatedTotal));
    check('3.5 4 item, semua REFERENSI PASAR (0 RESMI AHSP)',
      effectiveItems(d).length === 4 && t.marketCount === 4 && t.officialCount === 0,
      `${effectiveItems(d).length} item / market=${t.marketCount} official=${t.officialCount}`);
    check('3.6 item membawa kode AHSP NEEDS_MAPPING (jujur, bukan klaim resmi)',
      effectiveItems(d).every((i) => (i as { ahspMappingStatus?: string }).ahspMappingStatus === 'NEEDS_MAPPING'));
    const msg = formatUniversalDraftMessage(d);
    check('3.7 pesan: MELEBIHI Rp372.625.000', msg.includes('MELEBIHI anggaran sebesar Rp372.625.000'));
    check('3.8 pesan: kontributor terbesar = Fabrikasi Baja WF (70,9%)',
      msg.includes('Fabrikasi & Ereksi Struktur Rangka Baja Profil WF 200/250/300 — Rp 477.000.000 (70,9% dari total estimasi)'),
      msg.split('\n').filter((l) => /Fabrikasi/.test(l)).join(' | '));
    check('3.9 pesan: Gambaran selisih tampil', msg.includes('Gambaran selisih:') && msg.includes('menutup 44,6% dari total estimasi'));
  }
  clearLastUniversalDraft();
  clearLastRabIntentSpec();
  const live = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('dana 300jt buatkan rab gudang 500 m2'));
  check('3.10 live: draft + vonis MELEBIHI', hasAction(live, 'push-universal') &&
    live.message.includes('MELEBIHI anggaran') && live.message.includes('Rp300.000.000'));
}

/* ------------------------------------------------------------------ */
/* 4 — Drainase 500 m: draft builder + OVER; live = gerbang intake   */
/* ------------------------------------------------------------------ */
console.log('== 4 — Drainase 500 m, budget 100jt ==');
{
  const res = buildUniversalDraft('buatkan rab drainase panjang 500 m budget 100jt');
  check('4.1 builder: draft terbentuk', res.kind === 'draft', res.kind);
  if (res.kind === 'draft') {
    const d = res.draft;
    const t = computeTotals(d);
    check('4.2 template SDA-DRAIN-UDITCH', partIds(res).includes('SDA-DRAIN-UDITCH'), partIds(res).join(','));
    check('4.3 total Rp373.975.000', close(t.estimatedTotal, 373975000), `${t.estimatedTotal}`);
    check('4.4 total independen = total kanonis', close(independentTotal(d), t.estimatedTotal));
    check('4.5 4 item, semua REFERENSI PASAR', effectiveItems(d).length === 4 && t.marketCount === 4,
      `${effectiveItems(d).length} item / market=${t.marketCount}`);
    const msg = formatUniversalDraftMessage(d);
    check('4.6 pesan: MELEBIHI Rp273.975.000', msg.includes('MELEBIHI anggaran sebesar Rp273.975.000'));
    check('4.7 pesan: kontributor terbesar = U-Ditch (90,9%)',
      msg.includes('Pemasangan Saluran Beton Precast U-Ditch Komplit Joint Mortar — Rp 340.000.000 (90,9% dari total estimasi)'));
    check('4.8 pesan: Gambaran selisih tampil', msg.includes('Gambaran selisih:'));
  }
  // Live: gerbang intake universal menanyakan TIPE saluran dulu
  // (by design — actionRegistry, bukan builder). Draft satu-giliran
  // TIDAK terbentuk di live; builder di atas membuktikan mesinnya bisa.
  clearLastUniversalDraft();
  clearLastRabIntentSpec();
  const live = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab drainase panjang 500 m budget 100jt'));
  check('4.9 live: pertanyaan tipe saluran dulu (awaitProjectConcept)',
    (live as { awaitProjectConcept?: boolean }).awaitProjectConcept === true,
    `awaitProjectConcept=${(live as { awaitProjectConcept?: boolean }).awaitProjectConcept}`);
  check('4.10 live: belum ada draft universal dari live', getLastUniversalDraft() === null);
  check('4.11 live: anggaran + panjang tercatat di pertanyaan', live.message.includes('Rp100.000.000') && live.message.includes('500 m'));
}

/* ------------------------------------------------------------------ */
/* 5 — Landscape 1 hektar (PERBAIKAN Worker D) + jalan + pagar        */
/* ------------------------------------------------------------------ */
console.log('== 5 — Hektar/are + landscape / jalan / pagar ==');
{
  // 5a. Parser satuan.
  check('5.1 findAreaMentions: 1 hektar → 10.000 m²',
    JSON.stringify(findAreaMentions('landscape 1 hektar').map((h) => h.valueM2)) === '[10000]',
    JSON.stringify(findAreaMentions('landscape 1 hektar')));
  check('5.2 findAreaMentions: 2,5 hektar → 25.000 m²',
    findAreaMentions('lahan 2,5 hektar')[0]?.valueM2 === 25000);
  check('5.3 findAreaMentions: 1 are → 100 m²', findAreaMentions('taman 1 are')[0]?.valueM2 === 100);
  check('5.4 findAreaMentions: m² tidak berubah', findAreaMentions('landscape 10000 m2')[0]?.valueM2 === 10000);
  check('5.5 cancelledAreaValues: bukan 1 hektar → [10000]',
    JSON.stringify(cancelledAreaValues('bukan 1 hektar, tapi 8.000 m²')) === '[10000]',
    JSON.stringify(cancelledAreaValues('bukan 1 hektar, tapi 8.000 m²')));
  check('5.6 cancelledAreaValues: bukan 500 m2 → [500]',
    JSON.stringify(cancelledAreaValues('bukan 500 m2, tapi 800 m2')) === '[500]');

  // 5b. Spek: hektar menjadi luas kerja (bukan null).
  const specHa = extractUniversalSpec('buatkan rab landscape 1 hektar budget 50jt');
  check('5.7 spek areaM2 10000 dari 1 hektar', specHa.areaM2 === 10000, `${specHa.areaM2}`);
  check('5.8 spek per-scope lanskap areaM2 10000', specHa.scopeSpecs?.['lanskap']?.areaM2 === 10000,
    JSON.stringify(specHa.scopeSpecs));
  check('5.9 spek budgetCap 50jt', specHa.budgetCap === 50_000_000);

  // 5c. Draft landscape 1 hektar = draft 10.000 m² (angka sama).
  const ha = buildUniversalDraft('buatkan rab landscape 1 hektar budget 50jt');
  const m2 = buildUniversalDraft('buatkan rab landscape taman 10000 m2 budget 50jt');
  check('5.10 draft 1 hektar terbentuk', ha.kind === 'draft', ha.kind);
  if (ha.kind === 'draft' && m2.kind === 'draft') {
    check('5.11 template LAND-PARK-RESIDENCE', partIds(ha).includes('LAND-PARK-RESIDENCE'), partIds(ha).join(','));
    check('5.12 total Rp1.919.900.450', close(computeTotals(ha.draft).estimatedTotal, 1919900450),
      `${computeTotals(ha.draft).estimatedTotal}`);
    check('5.13 total hektar = total 10.000 m²', close(computeTotals(ha.draft).estimatedTotal, computeTotals(m2.draft).estimatedTotal));
    check('5.14 total independen = total kanonis', close(independentTotal(ha.draft), computeTotals(ha.draft).estimatedTotal));
    const msg = formatUniversalDraftMessage(ha.draft);
    check('5.15 pesan: MELEBIHI Rp1.869.900.450', msg.includes('MELEBIHI anggaran sebesar Rp1.869.900.450'));
    check('5.16 pesan: kontributor terbesar = Paving Dekoratif (91,2%)',
      msg.includes('Pemasangan Paving Dekoratif Plaza Pejalan Kaki — Rp 1.750.000.000 (91,2% dari total estimasi)'));
    check('5.17 pesan: Gambaran selisih tampil', msg.includes('Gambaran selisih:'));
  }

  // 5d. Penjaga lahan: "luas lahan 1 hektar" TIDAK menjadi luas kerja.
  const landOnly = buildUniversalDraft('buatkan rab gudang luas lahan 1 hektar');
  check('5.18 luas lahan saja → tetap needs-spec (bukan draft 10.000 m²)',
    landOnly.kind === 'needs-spec', landOnly.kind);
  const landPlus = extractUniversalSpec('buatkan rab gudang 15 x 20 m dengan luas lahan 1 hektar');
  check('5.19 gudang 15x20 + lahan 1 hektar → luas kerja 300 (bukan 10.000)',
    landPlus.areaM2 === 300, `${landPlus.areaM2}`);

  // 5e. Koreksi: "bukan 1 hektar, tapi 8000 m2" → 8000 menang.
  const corrected = extractUniversalSpec('buatkan rab landscape bukan 1 hektar, tapi 8000 m2 budget 50jt');
  check('5.20 koreksi hektar → areaM2 8000', corrected.areaM2 === 8000, `${corrected.areaM2}`);

  // 5f. Jalan 1 km + pagar 100 m (kategori tambahan).
  const road = buildUniversalDraft('buatkan RAB jalan beton baru panjang 1 km lebar 6 m budget 2 miliar');
  check('5.21 jalan: draft INFRA-ROAD-RIGID', road.kind === 'draft' && partIds(road).includes('INFRA-ROAD-RIGID'),
    road.kind === 'draft' ? partIds(road).join(',') : road.kind);
  if (road.kind === 'draft') {
    check('5.22 jalan: total Rp4.136.800.000', close(computeTotals(road.draft).estimatedTotal, 4136800000),
      `${computeTotals(road.draft).estimatedTotal}`);
    check('5.23 jalan: total independen = total kanonis',
      close(independentTotal(road.draft), computeTotals(road.draft).estimatedTotal));
    check('5.24 jalan: pesan MELEBIHI Rp2.136.800.000 + Gambaran selisih',
      formatUniversalDraftMessage(road.draft).includes('MELEBIHI anggaran sebesar Rp2.136.800.000') &&
      formatUniversalDraftMessage(road.draft).includes('Gambaran selisih:'));
  }
  const fence = buildUniversalDraft('buatkan rab pagar panjang 100 m tinggi 2 m budget 20jt');
  check('5.25 pagar: draft LAND-FENCE-GATE', fence.kind === 'draft' && partIds(fence).includes('LAND-FENCE-GATE'),
    fence.kind === 'draft' ? partIds(fence).join(',') : fence.kind);
  if (fence.kind === 'draft') {
    check('5.26 pagar: total Rp138.620.000', close(computeTotals(fence.draft).estimatedTotal, 138620000),
      `${computeTotals(fence.draft).estimatedTotal}`);
    check('5.27 pagar: kontributor terbesar = Pagar Besi Hollow (64,9%)',
      formatUniversalDraftMessage(fence.draft).includes('Pagar Besi Hollow Galvanis Minimalis Tinggi 2m — Rp 90.000.000 (64,9% dari total estimasi)'));
  }
}

/* ------------------------------------------------------------------ */
/* 6 — Rumah via CREATE_RAB_DIRECT: draft nyata + total (tanpa        */
/*     verdict anggaran — celah terbuka, lihat header)                 */
/* ------------------------------------------------------------------ */
console.log('== 6 — Rumah 120 m² 2 lantai via DIRECT ==');
{
  clearLastRabIntentSpec();
  const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('buatkan rab rumah 2 lantai luas bangunan 120 m2 budget 500jt'));
  const d = getLastDirectRab();
  check('6.1 handler berhasil + tombol push-rab', res.ok === true && hasAction(res, 'push-rab'));
  check('6.2 draft direct terbentuk', d !== null);
  if (d) {
    check('6.3 total biaya langsung Rp186.183.407', d.calc.totalDirectCost === 186183407, `${d.calc.totalDirectCost}`);
    check('6.4 total RAB = total langsung (overhead/profit 0)', d.calc.totalRabCost === d.calc.totalDirectCost);
    check('6.5 25 item, 24 berharga (1 belum berharga)', d.calc.items.length === 25 &&
      d.calc.items.filter((i) => typeof i.unitPrice === 'number' && (i.unitPrice as number) > 0).length === 24,
      `${d.calc.items.length} item`);
    check('6.6 total = Σ totalPrice item berharga',
      close(d.calc.items.reduce((s, i) => s + (typeof i.totalPrice === 'number' ? i.totalPrice : 0), 0), 186183407));
    check('6.7 item membawa kode AHSP + WBS',
      d.calc.items.every((i) => Boolean(i.ahspCode) && Boolean(i.wbsCode)));
    check('6.8 provenance: luas dari Anda', d.provenance.some((p) => p.label === 'Luas bangunan' && p.source === 'user'));
    check('6.9 template Rumah Tinggal Tipe 36/60 (2 Lantai)', d.templateName === 'Rumah Tinggal Tipe 36/60 (2 Lantai)', d.templateName);
  }
}

/* ------------------------------------------------------------------ */
/* 7 — Pin rekayasa: jembatan tanpa bentang tetap needs-spec           */
/* ------------------------------------------------------------------ */
console.log('== 7 — Jembatan tanpa bentang (pin rekayasa) ==');
{
  const res = buildUniversalDraft('buatkan rab jembatan beton panjang 20 m budget 500jt');
  check('7.1 needs-spec (panjang BUKAN bentang)', res.kind === 'needs-spec', res.kind);
  if (res.kind === 'needs-spec') {
    check('7.2 alasan menggema panjang 20 m + anggaran', res.reason.includes('panjang 20 m') && res.reason.includes('Rp 500.000.000'), res.reason.slice(0, 200));
    check('7.3 missing = bentang', (res.missing ?? []).some((m) => m.includes('bentang')), JSON.stringify(res.missing));
  }
  clearLastUniversalDraft();
  clearLastRabIntentSpec();
  const live = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('dana 500jt bisa ga buatkan rab jembatan beton panjang 20 m'));
  check('7.4 live: menunggu bentang, tanpa draft', (live as { awaitProjectConcept?: boolean }).awaitProjectConcept === true &&
    getLastUniversalDraft() === null);
  check('7.5 live: menggema anggaran + panjang', live.message.includes('Rp 500.000.000') && live.message.includes('panjang 20 m'));
}

/* ------------------------------------------------------------------ */
/* 8 — Budget intelligence unit (budgetFeasibility.ts): verdict,      */
/*     selisih, provisional, tanpa-budget                              */
/* ------------------------------------------------------------------ */
console.log('== 8 — assessBudgetFeasibility (unit) ==');
{
  const under = assessBudgetFeasibility({ totalPriced: 186183407, unpricedCount: 1, budgetCap: 500_000_000 });
  check('8.1 UNDER + selisih +313.816.593', under.verdict === 'UNDER' && under.diff === 313816593, `${under.verdict}/${under.diff}`);
  check('8.2 UNDER provisional (ada item belum berharga)', under.provisional === true);
  check('8.3 format UNDER memuat DI BAWAH', formatBudgetFeasibilityLine(under).includes('DI BAWAH anggaran sebesar Rp313.816.593'));
  const over = assessBudgetFeasibility({ totalPriced: 672625000, unpricedCount: 0, budgetCap: 300_000_000 });
  check('8.4 OVER + selisih -372.625.000', over.verdict === 'OVER' && over.diff === -372625000, `${over.verdict}/${over.diff}`);
  check('8.5 OVER tidak provisional bila semua berharga', over.provisional === false);
  check('8.6 format OVER memuat MELEBIHI + tanpa pemangkasan diam-diam',
    formatBudgetFeasibilityLine(over).includes('MELEBIHI anggaran sebesar Rp372.625.000') &&
    formatBudgetFeasibilityLine(over).includes('tidak dipangkas diam-diam'));
  const noBudget = assessBudgetFeasibility({ totalPriced: 100_000_000, unpricedCount: 0, budgetCap: null });
  check('8.7 NO_BUDGET bila cap null', noBudget.verdict === 'NO_BUDGET');
  check('8.8 NO_BUDGET beralasan (bukan diam)', (noBudget.reason ?? '').includes('Budget belum disebutkan'));
  const cannot = assessBudgetFeasibility({ totalPriced: null, unpricedCount: 3, budgetCap: 100_000_000 });
  check('8.9 CANNOT_ASSESS bila total null', cannot.verdict === 'CANNOT_ASSESS');
  check('8.10 CANNOT_ASSESS beralasan', (cannot.reason ?? '').length > 0);
}

/* ------------------------------------------------------------------ */
/* 9 — Taksonomi follow-up (Worker A P1–P3, diimplementasi Worker D  */
/*     2026-11-26 di universalTaxonomy.ts): villa = rumah, guard      */
/*     "rumah sakit/bersalin/susun", SPBU tetap OPEN (null).           */
/* ------------------------------------------------------------------ */
console.log('== 9 — Klasifikasi villa / rumah sakit / SPBU ==');
{
  const cls = (t: string) => classifyUniversal(t);
  // 9a. P1: villa telanjang = rumah tinggal (bukan hotel).
  const villa = cls('buatkan rab villa 2 lantai di Bali luas bangunan 180 m2');
  check('9.1 villa: primer rumah', villa.primary?.id === 'rumah', villa.primary?.id ?? 'null');
  check('9.2 villa: satu disiplin (tanpa hotel)', villa.matches.map((m) => m.id).join(',') === 'rumah' && villa.isMulti === false,
    `matches=[${villa.matches.map((m) => m.id).join(',')}] isMulti=${villa.isMulti}`);
  check('9.3 villa: tanpa sekunder hotel', !villa.secondary.some((m) => m.id === 'hotel'));
  // Alasan katalognya (bukan sekadar label): template villa khusus
  // ada di RUMAH_TINGGAL, template resort-villa di HOTEL_HOSPITALITY.
  const svc = RabTemplateService.getInstance();
  check('9.4 katalog: HOUSE-VILLA-MODERN ∈ RUMAH_TINGGAL',
    svc.getTemplateById('HOUSE-VILLA-MODERN')?.category === 'RUMAH_TINGGAL',
    svc.getTemplateById('HOUSE-VILLA-MODERN')?.category ?? 'null');
  check('9.5 katalog: BLD-BOUTIQUE-VILLA ∈ HOTEL_HOSPITALITY',
    svc.getTemplateById('BLD-BOUTIQUE-VILLA')?.category === 'HOTEL_HOSPITALITY',
    svc.getTemplateById('BLD-BOUTIQUE-VILLA')?.category ?? 'null');
  // Hilirnya: draft villa memakai template villa khusus, bukan hotel.
  const villaDraft = buildUniversalDraft('buatkan rab villa 2 lantai di Bali luas bangunan 180 m2');
  check('9.6 villa: draft HOUSE-VILLA-MODERN', villaDraft.kind === 'draft' && partIds(villaDraft).includes('HOUSE-VILLA-MODERN'),
    villaDraft.kind === 'draft' ? partIds(villaDraft).join(',') : villaDraft.kind);
  if (villaDraft.kind === 'draft') {
    check('9.7 villa: total Rp386.234.000', close(computeTotals(villaDraft.draft).estimatedTotal, 386234000),
      `${computeTotals(villaDraft.draft).estimatedTotal}`);
  }
  clearLastUniversalDraft();
  clearLastRabIntentSpec();
  const villaLive = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab villa 2 lantai di Bali luas bangunan 180 m2'));
  const villaLiveDraft = getLastUniversalDraft();
  check('9.8 villa live: draft dibangun, tanpa label Hotel', hasAction(villaLive, 'push-universal') &&
    !villaLive.message.includes('Hotel & hospitality'));
  check('9.9 villa live: template HOUSE-VILLA-MODERN',
    villaLiveDraft?.parts.some((p) => p.template.id === 'HOUSE-VILLA-MODERN') === true,
    villaLiveDraft?.parts.map((p) => p.template.id).join(',') ?? 'null');

  // 9b. P1 lanjutan: villa konteks resort TETAP hotel (tunggal).
  const boutique = cls('buatkan rab boutique villa resort 8 unit');
  check('9.10 boutique villa resort: primer hotel', boutique.primary?.id === 'hotel', boutique.primary?.id ?? 'null');
  check('9.11 boutique villa resort: tunggal (tanpa rumah)', boutique.isMulti === false &&
    !boutique.matches.some((m) => m.id === 'rumah'), `matches=[${boutique.matches.map((m) => m.id).join(',')}]`);
  check('9.12 villa resort: primer hotel', cls('buatkan rab villa resort di Bali').primary?.id === 'hotel');
  check('9.13 resort villa (urutan balik): primer hotel', cls('buatkan rab resort villa 8 unit').primary?.id === 'hotel');
  clearLastRabIntentSpec();
  const boutiqueLive = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab boutique villa resort 8 unit'));
  check('9.14 boutique live: label Hotel + tanya luas (tanpa area tak bisa dihitung)',
    boutiqueLive.message.includes('Hotel & hospitality') &&
    (boutiqueLive as { awaitProjectConcept?: boolean }).awaitProjectConcept === true);

  // 9c. P2: "rumah sakit/bersalin/susun" bukan rumah + disiplin lain.
  const rs = cls('buatkan rab rumah sakit tipe C 4 lantai');
  check('9.15 rumah sakit: primer kesehatan, tunggal', rs.primary?.id === 'kesehatan' && rs.isMulti === false &&
    rs.matches.map((m) => m.id).join(',') === 'kesehatan', `primary=${rs.primary?.id} matches=[${rs.matches.map((m) => m.id).join(',')}]`);
  const bersalin = cls('buatkan rab rumah bersalin 2 lantai');
  check('9.16 rumah bersalin: primer kesehatan, tunggal', bersalin.primary?.id === 'kesehatan' && bersalin.isMulti === false,
    `primary=${bersalin.primary?.id} matches=[${bersalin.matches.map((m) => m.id).join(',')}]`);
  const susun = cls('buatkan rab rumah susun 5 lantai');
  check('9.17 rumah susun: primer apartemen, tunggal', susun.primary?.id === 'apartemen' && susun.isMulti === false,
    `primary=${susun.primary?.id} matches=[${susun.matches.map((m) => m.id).join(',')}]`);
  check('9.18 rumah biasa tetap rumah', cls('buatkan rab rumah 2 lantai luas 120 m2').primary?.id === 'rumah');
  check('9.19 rumah tinggal tetap rumah', cls('buatkan rab rumah tinggal 2 lantai').primary?.id === 'rumah');
  check('9.20 hotel tetap hotel', cls('buatkan rab hotel 5 lantai').primary?.id === 'hotel');
  check('9.21 kondotel tetap hotel', cls('buatkan rab kondotel 10 lantai').primary?.id === 'hotel');

  // 9d. P3 DITOLAK (tetap OPEN — lihat header + laporan Worker D):
  //     SPBU tidak punya template katalog; entri taksonomi baru akan
  //     memecahkan pin SUBCATEGORIES=54 + butuh baris DISCIPLINE_MAP
  //     dan akan mengarahkan SPBU ke draft gedung generik yang
  //     menyesatkan. Yang dipin: TIDAK ada klasifikasi diam-diam yang
  //     salah + jawaban live jujur (bukan menu generik, bukan draft).
  const spbu = cls('buatkan rab SPBU 1 lantai');
  check('9.22 SPBU: primer null (tidak diklasifikasi diam-diam)', spbu.primary === null && spbu.matches.length === 0,
    `primary=${spbu.primary?.id ?? null}`);
  clearLastUniversalDraft();
  clearLastRabIntentSpec();
  const spbuLive = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab SPBU 1 lantai'));
  check('9.23 SPBU live: jujur belum mengenali (tanpa draft, tanpa menu generik)',
    spbuLive.message.includes('belum bisa mengenali') && !spbuLive.message.includes('Pilih jalurnya') &&
    getLastUniversalDraft() === null);

  // 9e. Coverage: rumah kini 'didukung' dengan template villa khusus.
  const covRumah = coverageFor(subcategoryById('rumah'));
  check('9.24 coverage rumah: didukung', covRumah.support === 'didukung' && covRumah.specificTemplateCount >= 1,
    `${covRumah.support} / specific=${covRumah.specificTemplateCount}`);
  const covHotel = coverageFor(subcategoryById('hotel'));
  check('9.25 coverage hotel: tetap didukung', covHotel.support === 'didukung' && covHotel.specificTemplateCount >= 1,
    `${covHotel.support} / specific=${covHotel.specificTemplateCount}`);
}

console.log(`\n${failed === 0 ? 'SEMUA TES DRAFT RAB WORKER D LULUS' : 'ADA TES GAGAL'} — lulus ${passed}, gagal ${failed}`);
if (failures.length) console.log('Gagal:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);
