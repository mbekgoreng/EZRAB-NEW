/**
 * S6 — FINAL INTEGRITY REPAIR §6: traceabilitas WBS (P3D-O4 + P5-O3).
 *
 * P3D-O4: `RabItem.wbsCode` tidak diisi (tautan hanya di
 * `DraftItem.__wbsNodeId`). P5-O3: artefak WBS tidak dipakai di ekspor
 * Sheet 2 (snapshot beku tidak membawa artefak).
 *
 * Keputusan desain (dibuktikan dari kode + probe atas draft nyata,
 * lihat LAPORAN-S6.md):
 * - Identitas WBS kanonis per item draft = KEANGGOTAAN NODE ARTEFAK
 *   (`wbs:<scopeId>`, divalidasi: node ada + item id ∈ node.itemIds).
 *   Generasi TIDAK mengisi `wbsCode`, dan `code` draft nyata adalah
 *   nomor urut telanjang ('1'..'11') — BUKAN kode WBS. Menyalin `code`
 *   ke `wbsCode` tanpa validasi = mencuci nomor urut menjadi kode.
 * - `wbsCode` diisi HANYA dari kode asli tervalidasi
 *   (`isValidatedWbsCode`: numerik dotted ≥2 segmen, atau kode katalog
 *   DED hidup). Tanpa kode tervalidasi, `wbsCode` tetap kosong — jujur.
 * - Factory = pass-through tervalidasi SAJA, tidak pernah menurunkan
 *   `wbsCode` dari `code` (pin `dedWbsReadiness`: "factory TIDAK
 *   menulis wbsCode" untuk input tanpa wbsCode eksplisit).
 * - Status asosiasi CONFIRMED (keanggotaan tervalidasi) /
 *   PROVISIONAL (hanya saran heuristik `classifyToWbs` — tidak pernah
 *   mengisi `wbsCode`, tidak pernah tampil terverifikasi) / UNMAPPED
 *   (tidak ada keduanya, tanpa kode karangan).
 * - Jalur ekspor membaca SEKSI PROYEK yang dinormalisasi; artefak draft
 *   TIDAK terjangkau dari sana (Project tidak punya field wbsArtifact)
 *   — karena itu P3D-O4 (pengisian SAAT TRANSFER) adalah fondasi P5-O3.
 *   `freezeRabSnapshot` deep-clone tanpa allowlist, jadi field WBS
 *   menumpang otomatis begitu `normalizeSections` meneruskannya.
 * - Sheet 2 TIDAK PERNAH mengklasifikasi ulang di render — kolom M
 *   hanya menampilkan field tersimpan di snapshot.
 *
 * Suite ini membuktikan rantai penuh lewat JALUR KODE NYATA:
 *   [0] validator + label node (helper murni wbsArtifact);
 *   [1] resolveWbsMapping (CONFIRMED/PROVISIONAL/UNMAPPED + matriks kode);
 *   [2] draft nyata + `__wbsNodeId` dipertahankan (pin P3D/P6);
 *   [3] transfer — buildPushPayload (WBS + pin kontrak harga S2);
 *   [4] factory — createRabItemRecord (pass-through tervalidasi);
 *   [5] normalisasi — normalizeSections (threading ke seksi ekspor);
 *   [6] snapshot — freezeRabSnapshot (field menumpang + hash mengikat);
 *   [7] ekspor — buildFiveSheetWorkbook (kolom M Sheet 2 per status);
 *   [8] golden Premium Demo (total tidak berubah).
 *
 * Jalankan: npx --yes tsx src/test/s6WbsTraceability.test.ts
 * (Skrip tsx mandiri dengan assert — pola S2/S4/P5; repo ini tidak
 * punya paket vitest.)
 */
import ExcelJS from 'exceljs';
import { strict as assert } from 'node:assert';
import {
  buildUniversalDraft,
  effectiveItems,
  traceDraftItems,
  buildPushPayload,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  resolveWbsMapping,
  isValidatedWbsCode,
  isKnownWbsNodeId,
  isWbsMappingStatus,
  wbsNodeLabel,
  excludeWbsNode,
  type WbsArtifact,
} from '../ai-tools/ezrab-ai/wbsArtifact';
import { buildWbsForDraft } from '../ai-tools/ezrab-ai/specChain';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import {
  FIVE_SHEET_NAMES,
  buildFiveSheetWorkbook,
  freezeRabSnapshot,
  wbsTraceText,
} from '../export/fiveSheetPreset';
import { summarizeExportSections } from '../export/priceIntegrity';
import { computeRekapSummary } from '../components/estimator/rekapSummary';
import { PREMIUM_DEMO_PROJECT, PREMIUM_DEMO_RAB_ITEMS } from '../data/premiumDemoData';
import type { Project, Company, RabItem } from '../types';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown): void {
  check(name, actual === expected, `aktual=${JSON.stringify(actual)} harap=${JSON.stringify(expected)}`);
}

const PID = 'proj-s6';

function draftOf(text: string): UniversalDraft {
  const res = buildUniversalDraft(text);
  assert.equal(res.kind, 'draft', `diharapkan draft, dapat ${res.kind} untuk "${text}"`);
  if (res.kind !== 'draft') throw new Error('unreachable');
  return res.draft;
}

function company(): Company {
  return {
    id: 'comp-s6', name: 'PT Uji S6', address: '', phone: '', email: '',
    website: '', taxNumber: '', directorName: '', leadEstimatorName: 'Estimator Uji',
    defaultOverheadPercent: 0, defaultProfitPercent: 0,
    defaultContingencyPercent: 0, defaultTaxPercent: 11,
  } as Company;
}

/** Cari baris berisi teks di kolom tertentu (pola P5/S2). */
function findRowByText(ws: ExcelJS.Worksheet, text: string, col: number): number {
  let found = -1;
  ws.eachRow((row, rowNumber) => {
    const v = row.getCell(col).value;
    if (typeof v === 'string' && v.includes(text)) found = rowNumber;
  });
  return found;
}
function cellText(c: ExcelJS.Cell): string {
  const v = c.value;
  if (typeof v === 'string') return v;
  if (v != null && typeof v === 'object' && 'result' in (v as any)) return String((v as any).result);
  return v == null ? '' : String(v);
}
function cellNum(c: ExcelJS.Cell): number {
  const v = c.value;
  if (typeof v === 'number') return v;
  if (v != null && typeof v === 'object' && 'result' in (v as any)) return Number((v as any).result);
  return NaN;
}

/* ================================================================== */
/* [0] Validator + label node (helper murni)                           */
/* ================================================================== */
function testValidators(): void {
  console.log('\n[0] Validator kode WBS + label node:');
  // Kode numerik dotted (≥2 segmen) — kode komponen template / seed.
  check("isValidatedWbsCode('01.01')", isValidatedWbsCode('01.01'));
  check("isValidatedWbsCode('1.1')", isValidatedWbsCode('1.1'));
  check("isValidatedWbsCode('1.1.2.1')", isValidatedWbsCode('1.1.2.1'));
  check("isValidatedWbsCode(' 01.01 ') — spasi dipangkas", isValidatedWbsCode(' 01.01 '));
  // Kode katalog DED hidup (kelompok + subkelompok).
  check("isValidatedWbsCode('BGN-03') — kelompok DED", isValidatedWbsCode('BGN-03'));
  check("isValidatedWbsCode('JLN-05-A') — subkelompok DED", isValidatedWbsCode('JLN-05-A'));
  check("isValidatedWbsCode('DRN-03-D') — subkelompok DED", isValidatedWbsCode('DRN-03-D'));
  // DITOLAK — bukan kode WBS.
  check("nomor urut '1' DITOLAK", !isValidatedWbsCode('1'));
  check("nomor urut '11' DITOLAK", !isValidatedWbsCode('11'));
  check("kode AHSP huruf 'B.38' DITOLAK", !isValidatedWbsCode('B.38'));
  check("kode AHSP kurung '6.1.(1)' DITOLAK", !isValidatedWbsCode('6.1.(1)'));
  check("kode sintetis 'TPL.01' DITOLAK", !isValidatedWbsCode('TPL.01'));
  check("kode DED tak dikenal 'BGN-99' DITOLAK", !isValidatedWbsCode('BGN-99'));
  check("string kosong DITOLAK", !isValidatedWbsCode(''));
  check('null DITOLAK', !isValidatedWbsCode(null));
  check('angka DITOLAK', !isValidatedWbsCode(123 as never));
  // Label node.
  eq("wbsNodeLabel('wbs:jalan')", wbsNodeLabel('wbs:jalan'), 'Jalan & Perkerasan');
  eq("wbsNodeLabel('wbs:pondasi')", wbsNodeLabel('wbs:pondasi'), 'Pondasi & Geoteknik');
  eq("wbsNodeLabel('wbs:alien') null", wbsNodeLabel('wbs:alien'), null);
  eq("wbsNodeLabel('jalan') null (tanpa prefix)", wbsNodeLabel('jalan'), null);
  eq('wbsNodeLabel(null) null', wbsNodeLabel(null), null);
  eq('wbsNodeLabel(42) null (bukan string, tanpa throw)', wbsNodeLabel(42 as never), null);
  check("isKnownWbsNodeId('wbs:drainase')", isKnownWbsNodeId('wbs:drainase'));
  check("isKnownWbsNodeId('wbs:alien') false", !isKnownWbsNodeId('wbs:alien'));
  check("isWbsMappingStatus('CONFIRMED')", isWbsMappingStatus('CONFIRMED'));
  check("isWbsMappingStatus('PROVISIONAL')", isWbsMappingStatus('PROVISIONAL'));
  check("isWbsMappingStatus('UNMAPPED')", isWbsMappingStatus('UNMAPPED'));
  check("isWbsMappingStatus('VERIFIED') false — bukan status pemetaan", !isWbsMappingStatus('VERIFIED'));
  check("isWbsMappingStatus('confirmed') false — case-sensitive", !isWbsMappingStatus('confirmed'));
}

/* ================================================================== */
/* [1] resolveWbsMapping — tiga status + matriks kode                  */
/* ================================================================== */
function testResolver(draft: UniversalDraft): WbsArtifact {
  console.log('\n[1] resolveWbsMapping — CONFIRMED / PROVISIONAL / UNMAPPED:');
  const artifact = draft.wbsArtifact as WbsArtifact;
  assert.ok(artifact, 'draft jalan membawa artefak WBS');
  const items = effectiveItems(draft);
  const first = items[0];

  // CONFIRMED — keanggotaan artefak tervalidasi.
  const confirmed = resolveWbsMapping({
    itemId: first.id, description: first.description,
    templateCode: first.code, ownerScopeId: 'jalan', artifact,
  });
  eq('CONFIRMED: status', confirmed.status, 'CONFIRMED');
  eq('CONFIRMED: node wbs:jalan', confirmed.wbsNodeId, 'wbs:jalan');
  eq('CONFIRMED: tanpa saran heuristik', confirmed.suggestedNodeId, undefined);
  eq('CONFIRMED: nomor urut code "1" TIDAK menjadi wbsCode', confirmed.wbsCode, undefined);
  const allConfirmed = items.every((it) =>
    resolveWbsMapping({ itemId: it.id, description: it.description, templateCode: it.code, ownerScopeId: 'jalan', artifact }).status === 'CONFIRMED');
  check('CONFIRMED: semua 8 item jalan terkonfirmasi via artefak', allConfirmed);

  // CONFIRMED + kode tervalidasi menempel (kode template asli).
  const withCode = resolveWbsMapping({
    itemId: first.id, description: first.description,
    templateCode: '01.01', ownerScopeId: 'jalan', artifact,
  });
  eq('CONFIRMED + templateCode 01.01 → wbsCode 01.01', withCode.wbsCode, '01.01');
  eq('CONFIRMED + templateCode 01.01 → status tetap CONFIRMED', withCode.status, 'CONFIRMED');
  const withDed = resolveWbsMapping({
    itemId: first.id, description: first.description,
    wbsCode: 'BGN-03', templateCode: '01.01', ownerScopeId: 'jalan', artifact,
  });
  eq('wbsCode eksplisit BGN-03 didahulukan atas templateCode', withDed.wbsCode, 'BGN-03');

  // Keanggotaan DITOLAK bila item tidak ada di node (bukan percaya buta).
  const notMember = resolveWbsMapping({
    itemId: 'TEMPLATE-LAIN::item-asing', description: first.description,
    templateCode: '01.01', ownerScopeId: 'jalan', artifact,
  });
  check('item asing (bukan anggota node) TIDAK CONFIRMED', notMember.status !== 'CONFIRMED');
  const wrongScope = resolveWbsMapping({
    itemId: first.id, description: first.description,
    templateCode: '01.01', ownerScopeId: 'pondasi', artifact,
  });
  check('scope pemilik salah (pondasi untuk item jalan) TIDAK CONFIRMED', wrongScope.status !== 'CONFIRMED');

  // Node DIKECUALIKAN: identitas tetap CONFIRMED (pengecualian adalah
  // keputusan kelengkapan, bukan perubahan fakta keanggotaan).
  const excluded = excludeWbsNode(artifact, 'wbs:jalan', 'Alasan uji S6 — paket dikecualikan user.');
  const excludedNode = excluded.nodes.find((n) => n.id === 'wbs:jalan')!;
  eq('node hasil exclude berstatus DIKECUALIKAN', excludedNode.status, 'DIKECUALIKAN');
  const afterExclude = resolveWbsMapping({
    itemId: first.id, description: first.description,
    templateCode: first.code, ownerScopeId: 'jalan', artifact: excluded,
  });
  eq('item di node DIKECUALIKAN tetap CONFIRMED (identitas faktual)', afterExclude.status, 'CONFIRMED');

  // PROVISIONAL — tanpa pemilik tervalidasi, hanya saran heuristik.
  // (artifact null → katalog fallback 'BANGUNAN'; probe: 'Pekerjaan
  // Pondasi Tiang Pancang' → BGN-03-C → scope pondasi.)
  const provisional = resolveWbsMapping({
    itemId: 'luar-draft::pondasi-1', description: 'Pekerjaan Pondasi Tiang Pancang',
    ownerScopeId: null, artifact: null,
  });
  eq('PROVISIONAL: status', provisional.status, 'PROVISIONAL');
  eq('PROVISIONAL: saran wbs:pondasi', provisional.suggestedNodeId, 'wbs:pondasi');
  eq('PROVISIONAL: TIDAK ada wbsNodeId (bukan pemetaan terverifikasi)', provisional.wbsNodeId, undefined);
  eq('PROVISIONAL: heuristik TIDAK mengisi wbsCode', provisional.wbsCode, undefined);
  // Dengan artefak jalan (katalog JALAN + lintas katalog): status tetap
  // PROVISIONAL dengan saran berscope dikenal (node persisnya mengikuti
  // aturan margin klasifikasi — tidak dipin).
  const provisional2 = resolveWbsMapping({
    itemId: 'luar-draft::pondasi-2', description: 'Pekerjaan Pondasi Tiang Pancang',
    ownerScopeId: null, artifact,
  });
  eq('PROVISIONAL (dengan artefak): status', provisional2.status, 'PROVISIONAL');
  check('PROVISIONAL (dengan artefak): saran berscope dikenal',
    isKnownWbsNodeId(provisional2.suggestedNodeId), JSON.stringify(provisional2.suggestedNodeId));

  // UNMAPPED — tanpa pemilik, tanpa kecocokan heuristik.
  const unmapped = resolveWbsMapping({
    itemId: 'luar-draft::aneh-1', description: 'Xyzqwv barang aneh tak dikenal',
    ownerScopeId: null, artifact: null,
  });
  eq('UNMAPPED: status', unmapped.status, 'UNMAPPED');
  eq('UNMAPPED: tanpa node', unmapped.wbsNodeId, undefined);
  eq('UNMAPPED: tanpa saran', unmapped.suggestedNodeId, undefined);
  eq('UNMAPPED: tanpa kode karangan', unmapped.wbsCode, undefined);
  const unmappedEmpty = resolveWbsMapping({
    itemId: 'luar-draft::aneh-2', description: '',
    ownerScopeId: null, artifact: null,
  });
  eq('UNMAPPED: deskripsi kosong → UNMAPPED', unmappedEmpty.status, 'UNMAPPED');

  // UNMAPPED + kode asli tervalidasi: kode menempel (identitas item),
  // status tetap UNMAPPED (kode bukan klaim pemetaan).
  const unmappedCoded = resolveWbsMapping({
    itemId: 'luar-draft::aneh-3', description: 'Xyzqwv barang aneh tak dikenal',
    templateCode: '01.01', ownerScopeId: null, artifact: null,
  });
  eq('UNMAPPED + templateCode 01.01 → wbsCode menempel', unmappedCoded.wbsCode, '01.01');
  eq('UNMAPPED + templateCode 01.01 → status tetap UNMAPPED', unmappedCoded.status, 'UNMAPPED');

  // Matriks kode (tanpa pemilik, tanpa artefak — hanya sumbu kode).
  const codeOnly = (wbsCode?: string, templateCode?: string) => resolveWbsMapping({
    itemId: 'luar-draft::kode', description: 'Xyzqwv barang aneh tak dikenal',
    wbsCode, templateCode, ownerScopeId: null, artifact: null,
  }).wbsCode;
  eq("matriks: templateCode '01.01' → wbsCode", codeOnly(undefined, '01.01'), '01.01');
  eq("matriks: templateCode '1' → tanpa wbsCode", codeOnly(undefined, '1'), undefined);
  eq("matriks: templateCode 'B.38' → tanpa wbsCode", codeOnly(undefined, 'B.38'), undefined);
  eq("matriks: templateCode '6.1.(1)' → tanpa wbsCode", codeOnly(undefined, '6.1.(1)'), undefined);
  eq("matriks: templateCode 'TPL.01' → tanpa wbsCode", codeOnly(undefined, 'TPL.01'), undefined);
  eq("matriks: wbsCode 'BGN-03' → wbsCode", codeOnly('BGN-03', undefined), 'BGN-03');
  eq("matriks: wbsCode 'BGN-99' → tanpa wbsCode", codeOnly('BGN-99', undefined), undefined);
  eq("matriks: wbsCode 'B.38' + templateCode '01.01' → fallback ke 01.01",
    codeOnly('B.38', '01.01'), '01.01');
  return artifact;
}

/* ================================================================== */
/* [2] Draft nyata + __wbsNodeId dipertahankan                         */
/* ================================================================== */
function testDraft(draft: UniversalDraft): void {
  console.log('\n[2] Draft nyata — artefak + __wbsNodeId dipertahankan:');
  eq('draft jalan: 8 item efektif', effectiveItems(draft).length, 8);
  check('draft jalan: artefak WBS terpasang (hook P6)', !!draft.wbsArtifact);
  eq('draft jalan: 1 node wbs:jalan LENGKAP',
    draft.wbsArtifact!.nodes.map((n) => `${n.id}[${n.status}]`).join(','), 'wbs:jalan[LENGKAP]');
  const traced = traceDraftItems(draft);
  check('__wbsNodeId dipertahankan: semua item wbs:jalan',
    traced.every((t) => t.__wbsNodeId === 'wbs:jalan'));
  check('generasi TIDAK mengisi wbsCode (fakta — bukan cacat S6)',
    effectiveItems(draft).every((it) => (it as any).wbsCode === undefined));
  check('code draft adalah nomor urut telanjang (bukan kode WBS)',
    effectiveItems(draft).every((it) => /^\d+$/.test(it.code || '')),
    effectiveItems(draft).map((it) => it.code).join(','));
}

/* ================================================================== */
/* [3] Transfer — buildPushPayload                                     */
/* ================================================================== */
function testTransfer(draft: UniversalDraft): void {
  console.log('\n[3] Transfer — buildPushPayload membawa traceabilitas WBS:');
  const payload = buildPushPayload(draft);
  eq('payload jalan: 8 item', payload.length, 8);
  check('payload: semua item CONFIRMED',
    payload.every((p) => p.wbsMappingStatus === 'CONFIRMED'));
  check('payload: semua item node wbs:jalan',
    payload.every((p) => p.wbsNodeId === 'wbs:jalan'));
  check('payload: semua item TANPA wbsCode (nomor urut ditolak jujur)',
    payload.every((p) => p.wbsCode === undefined));
  check('payload: tanpa saran heuristik pada item CONFIRMED',
    payload.every((p) => p.wbsSuggestedNodeId === undefined));
  check('payload: priceStatus tetap terisi (kontrak S2 utuh)',
    payload.every((p) => !!p.priceStatus));
  check('payload: tidak ada item kehilangan priceStatus karena S6',
    payload.every((p) => ['PRICE_RESOLVED', 'PRICE_ESTIMATED', 'PRICE_MANUAL', 'PRICE_UNRESOLVED'].includes(p.priceStatus)));

  const bridge = draftOf('Buatkan RAB jembatan beton bentang 12 meter');
  const bridgePayload = buildPushPayload(bridge);
  eq('payload jembatan: 11 item', bridgePayload.length, 11);
  check('payload jembatan: semua CONFIRMED wbs:jembatan',
    bridgePayload.every((p) => p.wbsMappingStatus === 'CONFIRMED' && p.wbsNodeId === 'wbs:jembatan'));

  // Draft legacy tanpa artefak terpasang → dibangun on-demand.
  const legacy = draftOf('Buatkan RAB jalan beton 1 km');
  delete (legacy as any).wbsArtifact;
  const legacyPayload = buildPushPayload(legacy);
  check('draft tanpa artefak: payload tetap CONFIRMED (on-demand)',
    legacyPayload.every((p) => p.wbsMappingStatus === 'CONFIRMED' && p.wbsNodeId === 'wbs:jalan'));

  // Mutasi kode generasi: hanya kode tervalidasi yang menjadi wbsCode.
  const mutated = draftOf('Buatkan RAB jalan beton 1 km');
  const gen = mutated.parts[0].generation.items as any[];
  gen[0].code = '01.01'; // kode template asli (houseType36-style)
  gen[1].code = 'B.38'; // kode AHSP — bukan kode WBS
  gen[2].wbsCode = 'BGN-03'; // wbsCode eksplisit dari jalur lain
  const mutatedPayload = buildPushPayload(mutated);
  const effMut = effectiveItems(mutated);
  const byDesc = (d: string) => mutatedPayload.find((p) => p.description === `[Chat AI] ${d}`)!;
  eq("mutasi: code '01.01' → wbsCode '01.01'", byDesc(effMut[0].description).wbsCode, '01.01');
  eq("mutasi: code 'B.38' → tanpa wbsCode", byDesc(effMut[1].description).wbsCode, undefined);
  eq("mutasi: wbsCode eksplisit 'BGN-03' → wbsCode 'BGN-03'", byDesc(effMut[2].description).wbsCode, 'BGN-03');
  check('mutasi: ketiganya tetap CONFIRMED wbs:jalan',
    [0, 1, 2].every((i) => {
      const p = byDesc(effMut[i].description);
      return p.wbsMappingStatus === 'CONFIRMED' && p.wbsNodeId === 'wbs:jalan';
    }));
  // Artefak on-demand == artefak terpasang (buildWbsForDraft deterministik).
  const fresh = buildWbsForDraft(draft, draft.structuredSpecs ?? []);
  eq('artefak on-demand: node sama dengan artefak terpasang',
    fresh.nodes.map((n) => n.id).join(','), draft.wbsArtifact!.nodes.map((n) => n.id).join(','));
}

/* ================================================================== */
/* [4] Factory — pass-through tervalidasi                              */
/* ================================================================== */
function testFactory(): void {
  console.log('\n[4] Factory — createRabItemRecord (pass-through tervalidasi):');
  const base = { description: 'Item uji S6', volume: 10, unit: 'm2', unitPrice: 5000 } as const;

  const recOk = createRabItemRecord({
    ...base, code: '1', wbsCode: '01.01', wbsNodeId: 'wbs:jalan',
    wbsMappingStatus: 'CONFIRMED',
  } as never, PID, { index: 0 });
  eq('factory: wbsCode 01.01 diteruskan', (recOk as any).wbsCode, '01.01');
  eq('factory: wbsNodeId diteruskan', (recOk as any).wbsNodeId, 'wbs:jalan');
  eq('factory: status CONFIRMED diteruskan', (recOk as any).wbsMappingStatus, 'CONFIRMED');
  eq('factory: amount tetap volume × harga (50000)', recOk.amount, 50000);

  const recDed = createRabItemRecord({
    ...base, wbsCode: 'BGN-03', wbsMappingStatus: 'PROVISIONAL',
    wbsSuggestedNodeId: 'wbs:pondasi',
  } as never, PID, { index: 1 });
  eq('factory: wbsCode DED BGN-03 diteruskan', (recDed as any).wbsCode, 'BGN-03');
  eq('factory: status PROVISIONAL diteruskan', (recDed as any).wbsMappingStatus, 'PROVISIONAL');
  eq('factory: saran node diteruskan', (recDed as any).wbsSuggestedNodeId, 'wbs:pondasi');

  // Nilai tak tervalidasi DIBUANG (bukan disimpan).
  const recBad = createRabItemRecord({
    ...base, wbsCode: 'B.38', wbsNodeId: 'wbs:alien',
    wbsMappingStatus: 'VERIFIED' as never, wbsSuggestedNodeId: 'jalan',
  } as never, PID, { index: 2 });
  eq("factory: wbsCode 'B.38' dibuang", (recBad as any).wbsCode, undefined);
  eq("factory: node 'wbs:alien' dibuang", (recBad as any).wbsNodeId, undefined);
  eq("factory: status 'VERIFIED' dibuang", (recBad as any).wbsMappingStatus, undefined);
  eq("factory: saran 'jalan' dibuang", (recBad as any).wbsSuggestedNodeId, undefined);
  const recSeq = createRabItemRecord({ ...base, wbsCode: '1' } as never, PID, { index: 3 });
  eq("factory: wbsCode nomor urut '1' dibuang", (recSeq as any).wbsCode, undefined);
  const recUnknown = createRabItemRecord({ ...base, wbsCode: 'BGN-99' } as never, PID, { index: 4 });
  eq("factory: wbsCode DED tak dikenal 'BGN-99' dibuang", (recUnknown as any).wbsCode, undefined);

  // Pin kontrak dedWbsReadiness: factory TIDAK PERNAH menurunkan wbsCode
  // dari `code` — bahkan bila code tampak seperti kode WBS.
  const recCode = createRabItemRecord({ ...base, code: '03.01' } as never, PID, { index: 5 });
  eq("factory: code '03.01' saja → wbsCode tetap undefined (tanpa derivasi)",
    (recCode as any).wbsCode, undefined);
  const recCodeDed = createRabItemRecord({ ...base, code: 'BGN-03' } as never, PID, { index: 6 });
  eq("factory: code 'BGN-03' saja → wbsCode tetap undefined (tanpa derivasi)",
    (recCodeDed as any).wbsCode, undefined);

  // Fallback `code` lama TIDAK berubah perilakunya.
  const recFallback = createRabItemRecord({ ...base, code: '', wbsCode: '1.1' } as never, PID, { index: 7 });
  eq("factory: code kosong + wbsCode '1.1' → code '1.1' (fallback lama)", recFallback.code, '1.1');
  eq("factory: code kosong + wbsCode '1.1' → wbsCode tersimpan", (recFallback as any).wbsCode, '1.1');
  const recCodeWins = createRabItemRecord({ ...base, code: 'X-9', wbsCode: '1.1' } as never, PID, { index: 8 });
  eq("factory: code 'X-9' menang atas fallback wbsCode", recCodeWins.code, 'X-9');
  eq("factory: wbsCode '1.1' tetap tersimpan di samping code", (recCodeWins as any).wbsCode, '1.1');
}

/* ================================================================== */
/* [5] Normalisasi — threading ke seksi ekspor                         */
/* ================================================================== */
function testNormalize(draft: UniversalDraft): { project: Project; sections: any[]; records: RabItem[] } {
  console.log('\n[5] Normalisasi — normalizeSections meneruskan field WBS:');
  const payload = buildPushPayload(draft);
  const records = payload.map((p, i) => createRabItemRecord(p as never, PID, { index: i }));
  // Item sintetis per status (mensimulasikan transfer dengan status itu —
  // factory + normalize + ekspor adalah kode nyata yang diuji).
  const recProv = createRabItemRecord({
    description: 'Pondasi Tiang Pancang S6 (saran heuristik)', volume: 1, unit: 'm3',
    unitPrice: 100000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE',
    code: 'S6-P', wbsMappingStatus: 'PROVISIONAL', wbsSuggestedNodeId: 'wbs:pondasi',
  } as never, PID, { index: 100 });
  const recUnmapped = createRabItemRecord({
    description: 'Item Tanpa Peta S6', volume: 2, unit: 'ls',
    unitPrice: 50000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE',
    code: 'S6-U', wbsMappingStatus: 'UNMAPPED',
  } as never, PID, { index: 101 });
  const recLegacy = createRabItemRecord({
    description: 'Item Legacy S6 (tanpa field WBS)', volume: 1, unit: 'ls',
    unitPrice: 75000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE',
    code: 'S6-L',
  } as never, PID, { index: 102 });
  const recCodeOnly = createRabItemRecord({
    description: 'Item Kode Saja S6', volume: 1, unit: 'ls',
    unitPrice: 25000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE',
    code: '', wbsCode: '1.1',
  } as never, PID, { index: 103 });
  const all = [...records, recProv, recUnmapped, recLegacy, recCodeOnly];

  const project = {
    id: PID, name: 'Proyek Uji S6', currentVersion: 'Rev 01',
    sections: [], rabItems: all, costSummary: {},
  } as unknown as Project;
  const sections = UnifiedProjectEngine.normalizeSections(project, all as never);
  const flat = sections.flatMap((s) => (s.items || []) as any[]);
  eq('normalisasi: 12 item hadir (8 transfer + 4 sintetis)', flat.length, 12);
  const byDesc = (d: string) => flat.find((x) => x.description === d || x.description === `[Chat AI] ${d}`)!;

  const eff0 = effectiveItems(draft)[0];
  const n0 = byDesc(eff0.description);
  eq('normalisasi CONFIRMED: node bertahan', n0.wbsNodeId, 'wbs:jalan');
  eq('normalisasi CONFIRMED: status bertahan', n0.wbsMappingStatus, 'CONFIRMED');
  eq('normalisasi CONFIRMED: wbsCode tetap absen (jujur)', n0.wbsCode, undefined);
  check('normalisasi: semua 8 item transfer CONFIRMED wbs:jalan',
    effectiveItems(draft).every((it) => {
      const n = byDesc(it.description);
      return n && n.wbsNodeId === 'wbs:jalan' && n.wbsMappingStatus === 'CONFIRMED';
    }));
  const nProv = byDesc('Pondasi Tiang Pancang S6 (saran heuristik)');
  eq('normalisasi PROVISIONAL: status bertahan', nProv.wbsMappingStatus, 'PROVISIONAL');
  eq('normalisasi PROVISIONAL: saran bertahan', nProv.wbsSuggestedNodeId, 'wbs:pondasi');
  eq('normalisasi PROVISIONAL: tanpa node terverifikasi', nProv.wbsNodeId, undefined);
  const nUnm = byDesc('Item Tanpa Peta S6');
  eq('normalisasi UNMAPPED: status bertahan', nUnm.wbsMappingStatus, 'UNMAPPED');
  eq('normalisasi UNMAPPED: tanpa node', nUnm.wbsNodeId, undefined);
  eq('normalisasi UNMAPPED: tanpa kode karangan', nUnm.wbsCode, undefined);
  const nLeg = byDesc('Item Legacy S6 (tanpa field WBS)');
  eq('normalisasi LEGACY: tanpa status (data lama)', nLeg.wbsMappingStatus, undefined);
  eq('normalisasi LEGACY: tanpa node', nLeg.wbsNodeId, undefined);
  const nCode = byDesc('Item Kode Saja S6');
  eq("normalisasi CODE-ONLY: wbsCode '1.1' bertahan (gaya Premium Demo)", nCode.wbsCode, '1.1');
  eq('normalisasi CODE-ONLY: tanpa node', nCode.wbsNodeId, undefined);

  // Total tidak berubah oleh threading WBS (field non-finansial).
  const subtotalSum = sections.reduce((a, s) => a + (s.subtotal || 0), 0);
  const engine = UnifiedProjectEngine.recalculateCostSummary(all as never, {
    overheadPercent: 0, profitPercent: 0, taxPercent: 11,
  } as never);
  eq('Σ subtotal seksi == directCost engine', subtotalSum, engine.directCost);
  const fromSections = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections as never);
  eq('grand dari seksi == grand engine (0/0, tanpa pajak)', fromSections.grandTotal, engine.grandTotal);
  return { project, sections, records: all };
}

/* ================================================================== */
/* [6] Snapshot — freezeRabSnapshot                                    */
/* ================================================================== */
function testSnapshot(project: Project, sections: any[]): { snapshot: any; costs: any } {
  console.log('\n[6] Snapshot — freezeRabSnapshot membawa field WBS:');
  const costs = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections as never);
  const summary = summarizeExportSections(sections as any);
  const snapshot = freezeRabSnapshot(project, sections as never, costs, summary, {
    createdAt: '2026-11-13T20:00:00.000Z',
  });
  const flat = (snapshot.sections as any[]).flatMap((s) => s.items || []);
  eq('snapshot: 12 item', flat.length, 12);
  check('snapshot: field WBS menumpang (deep clone tanpa allowlist)',
    flat.some((x: any) => x.wbsNodeId === 'wbs:jalan' && x.wbsMappingStatus === 'CONFIRMED'));
  check('snapshot: saran PROVISIONAL menumpang',
    flat.some((x: any) => x.wbsSuggestedNodeId === 'wbs:pondasi'));
  check("snapshot: wbsCode '1.1' menumpang",
    flat.some((x: any) => x.wbsCode === '1.1'));
  // Beku: mutasi proyek sesudah freeze tidak mengubah snapshot.
  const first = (sections[0].items as any[])[0];
  const beforeNode = (snapshot.sections[0].items as any[])[0].wbsNodeId;
  first.wbsNodeId = 'wbs:alien';
  first.wbsMappingStatus = 'UNMAPPED';
  eq('snapshot beku: mutasi hilir tidak mengubah node snapshot',
    (snapshot.sections[0].items as any[])[0].wbsNodeId, beforeNode);
  first.wbsNodeId = beforeNode;
  first.wbsMappingStatus = 'CONFIRMED';
  // Hash mengikat isi WBS: snapshot tanpa field WBS → hash berbeda.
  const stripped = JSON.parse(JSON.stringify(sections)) as any[];
  for (const s of stripped) for (const it of s.items || []) {
    delete it.wbsCode; delete it.wbsNodeId; delete it.wbsMappingStatus; delete it.wbsSuggestedNodeId;
  }
  const snapStripped = freezeRabSnapshot(project, stripped as never, costs, summary, {
    createdAt: '2026-11-13T20:00:00.000Z',
  });
  check('hash snapshot berubah bila field WBS dihapus (hash mengikat isi)',
    snapStripped.snapshotHash !== snapshot.snapshotHash,
    `${snapshot.snapshotHash} vs ${snapStripped.snapshotHash}`);
  return { snapshot, costs };
}

/* ================================================================== */
/* [7] Ekspor — kolom M Sheet 2                                        */
/* ================================================================== */
function testExport(project: Project, sections: any[], draft: UniversalDraft): void {
  console.log('\n[7] Ekspor — kolom M TRACEABILITAS WBS di Sheet 2:');
  // Unit helper tampilan (tanpa workbook).
  eq('wbsTraceText CONFIRMED',
    wbsTraceText({ wbsNodeId: 'wbs:jalan', wbsMappingStatus: 'CONFIRMED', wbsCode: '01.01' } as never),
    'TERPETAKAN — Jalan & Perkerasan (wbs:jalan) • Kode: 01.01');
  eq('wbsTraceText CONFIRMED tanpa kode',
    wbsTraceText({ wbsNodeId: 'wbs:jembatan', wbsMappingStatus: 'CONFIRMED' } as never),
    'TERPETAKAN — Jembatan & Struktur Khusus (wbs:jembatan)');
  eq('wbsTraceText PROVISIONAL',
    wbsTraceText({ wbsMappingStatus: 'PROVISIONAL', wbsSuggestedNodeId: 'wbs:pondasi' } as never),
    'PERLU KONFIRMASI — Pondasi & Geoteknik (wbs:pondasi) — klasifikasi heuristik, belum terverifikasi');
  eq('wbsTraceText UNMAPPED',
    wbsTraceText({ wbsMappingStatus: 'UNMAPPED' } as never), 'Tidak terpetakan');
  eq('wbsTraceText LEGACY (tanpa field)',
    wbsTraceText({} as never), 'Tidak terpetakan');
  eq("wbsTraceText CODE-ONLY (kode tanpa node)",
    wbsTraceText({ wbsCode: '1.1' } as never), 'Tidak terpetakan • Kode: 1.1');
  eq('wbsTraceText LEGACY + node dikenal → CONFIRMED (fakta transfer)',
    wbsTraceText({ wbsNodeId: 'wbs:drainase' } as never),
    'TERPETAKAN — Drainase & Saluran (wbs:drainase)');
  eq('wbsTraceText CONFIRMED tanpa node → turun ke UNMAPPED (data tak konsisten)',
    wbsTraceText({ wbsMappingStatus: 'CONFIRMED' } as never), 'Tidak terpetakan');
  eq('wbsTraceText PROVISIONAL tanpa saran → turun ke UNMAPPED',
    wbsTraceText({ wbsMappingStatus: 'PROVISIONAL' } as never), 'Tidak terpetakan');
  eq('wbsTraceText node tak dikenal → UNMAPPED (tanpa throw)',
    wbsTraceText({ wbsNodeId: 'wbs:alien', wbsMappingStatus: 'CONFIRMED' } as never), 'Tidak terpetakan');
  check('wbsTraceText PROVISIONAL tidak memakai kata TERPETAKAN/TERVERIFIKASI',
    !wbsTraceText({ wbsMappingStatus: 'PROVISIONAL', wbsSuggestedNodeId: 'wbs:pondasi' } as never)
      .includes('TERPETAKAN') &&
    !wbsTraceText({ wbsMappingStatus: 'PROVISIONAL', wbsSuggestedNodeId: 'wbs:pondasi' } as never)
      .includes('TERVERIFIKASI'));

  // Workbook nyata dari snapshot.
  const costs = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections as never);
  const summary = summarizeExportSections(sections as any);
  const snapshot = freezeRabSnapshot(project, sections as never, costs, summary, {
    createdAt: '2026-11-13T20:00:00.000Z',
  });
  const wb = new ExcelJS.Workbook();
  buildFiveSheetWorkbook(wb, snapshot, company(), {});
  const ws2 = wb.getWorksheet(FIVE_SHEET_NAMES.detail)!;
  const head = ws2.getRow(5);
  eq('Sheet 2: header kolom M = TRACEABILITAS WBS', cellText(head.getCell(13)), 'TRACEABILITAS WBS');
  const headers12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((c) => cellText(head.getCell(c)));
  check('Sheet 2: header A–L utuh (pin P5)', headers12.includes('STATUS VERIFIKASI') && headers12.includes('KETERANGAN'));

  const eff0 = effectiveItems(draft)[0];
  const rConf = findRowByText(ws2, eff0.description, 3);
  check('Sheet 2: baris item CONFIRMED ditemukan', rConf > 0);
  eq('Sheet 2 CONFIRMED: kolom M',
    cellText(ws2.getCell(`M${rConf}`)), 'TERPETAKAN — Jalan & Perkerasan (wbs:jalan)');
  eq('Sheet 2 CONFIRMED: kolom B tetap kode item (pin perilaku lama)',
    cellText(ws2.getCell(`B${rConf}`)), '1');
  check('Sheet 2 CONFIRMED: kolom K status verifikasi utuh',
    cellText(ws2.getCell(`K${rConf}`)).includes('VERIFIED') || cellText(ws2.getCell(`K${rConf}`)).includes('VERIFIKASI'));

  const rProv = findRowByText(ws2, 'Pondasi Tiang Pancang S6', 3);
  check('Sheet 2: baris PROVISIONAL ditemukan', rProv > 0);
  eq('Sheet 2 PROVISIONAL: kolom M',
    cellText(ws2.getCell(`M${rProv}`)),
    'PERLU KONFIRMASI — Pondasi & Geoteknik (wbs:pondasi) — klasifikasi heuristik, belum terverifikasi');
  check('Sheet 2 PROVISIONAL: kolom M TIDAK menyebut TERPETAKAN/TERVERIFIKASI',
    !cellText(ws2.getCell(`M${rProv}`)).includes('TERPETAKAN') &&
    !cellText(ws2.getCell(`M${rProv}`)).includes('TERVERIFIKASI'));

  const rUnm = findRowByText(ws2, 'Item Tanpa Peta S6', 3);
  check('Sheet 2: baris UNMAPPED ditemukan', rUnm > 0);
  eq('Sheet 2 UNMAPPED: kolom M', cellText(ws2.getCell(`M${rUnm}`)), 'Tidak terpetakan');

  const rLeg = findRowByText(ws2, 'Item Legacy S6', 3);
  check('Sheet 2: baris LEGACY ditemukan', rLeg > 0);
  eq('Sheet 2 LEGACY: kolom M jujur tidak terpetakan', cellText(ws2.getCell(`M${rLeg}`)), 'Tidak terpetakan');

  const rCode = findRowByText(ws2, 'Item Kode Saja S6', 3);
  check('Sheet 2: baris CODE-ONLY ditemukan', rCode > 0);
  eq('Sheet 2 CODE-ONLY: kolom M', cellText(ws2.getCell(`M${rCode}`)), 'Tidak terpetakan • Kode: 1.1');

  // Total tidak berubah oleh kolom M (nilai finansial utuh).
  const grandRow = findRowByText(ws2, 'GRAND TOTAL', 3);
  eq('Sheet 2 grand == grand kanonis snapshot', cellNum(ws2.getCell(`H${grandRow}`)), costs.grandTotal);
  const ws1 = wb.getWorksheet(FIVE_SHEET_NAMES.summary)!;
  const g1Row = findRowByText(ws1, 'GRAND TOTAL', 1);
  eq('Sheet 1 grand == grand kanonis snapshot', cellNum(ws1.getCell(`B${g1Row}`)), costs.grandTotal);
}

/* ================================================================== */
/* [8] Golden totals — Premium Demo (pin langsung)                     */
/* ================================================================== */
function testGoldenTotals(): void {
  console.log('\n[8] Golden totals — Premium Demo:');
  const r = computeRekapSummary(PREMIUM_DEMO_RAB_ITEMS as never, PREMIUM_DEMO_PROJECT as never);
  eq('Premium Demo directCost 892.612.393', r.directCost, 892612393);
  eq('Premium Demo overhead 44.630.620', r.overheadNominal, 44630620);
  eq('Premium Demo profit 44.630.620', r.profitNominal, 44630620);
  eq('Premium Demo PPN 108.006.100', r.ppnNominal, 108006100);
  eq('Premium Demo grand Rp1.089.879.733 (TIDAK BERUBAH)', r.grandTotal, 1089879733);
  eq('Premium Demo grand == costSummary tersimpan', r.grandTotal, PREMIUM_DEMO_PROJECT.costSummary!.grandTotal);
  // Item Premium Demo membawa wbsCode asli ('1.1' dst.) — kini diteruskan
  // normalizeSections ke ekspor (sebelum S6 dibuang di pemetaan).
  const project = {
    id: PREMIUM_DEMO_PROJECT.id, name: PREMIUM_DEMO_PROJECT.name,
    currentVersion: 'Rev 00', sections: [],
    rabItems: PREMIUM_DEMO_RAB_ITEMS, costSummary: PREMIUM_DEMO_PROJECT.costSummary,
  } as unknown as Project;
  const sections = UnifiedProjectEngine.normalizeSections(project, PREMIUM_DEMO_RAB_ITEMS as never);
  const flat = sections.flatMap((s) => (s.items || []) as any[]);
  eq('Premium Demo: 213 item ternormalisasi', flat.length, 213);
  check("Premium Demo: item pertama membawa wbsCode '1.1' ke seksi",
    flat[0].wbsCode === '1.1', JSON.stringify(flat[0].wbsCode));
  check('Premium Demo: semua item ber-wbsCode (data seed asli)',
    flat.every((x: any) => typeof x.wbsCode === 'string' && x.wbsCode.length > 0));
  check('Premium Demo: tanpa node (proyek lama pra-S6 — jujur UNMAPPED)',
    flat.every((x: any) => x.wbsNodeId === undefined));
}

async function main(): Promise<void> {
  console.log('S6 — Traceabilitas WBS (P3D-O4 + P5-O3)');
  testValidators();
  const draft = draftOf('Buatkan RAB jalan beton 1 km');
  testResolver(draft);
  testDraft(draft);
  testTransfer(draft);
  testFactory();
  const { project, sections } = testNormalize(draft);
  testSnapshot(project, sections);
  testExport(project, sections, draft);
  testGoldenTotals();
  console.log(`\nS6: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('Gagal:', failures.join(' | '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('S6 run error:', err);
  process.exit(1);
});
