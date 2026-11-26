/**
 * EZRAB AI WORKFLOW HARDENING — Worker F (2026-11-26, FINAL LOCAL).
 *
 * NEGATED FLOOR COUNT → UNKNOWN (keputusan owner FINAL, MEMBALIKKAN
 * aturan sprint fix-up "murni negasi → 1" dan aturan audit ekstrem
 * 2026-11-08 "negasi → 1 lantai eksplisit").
 *
 * Aturan: bila SEMUA penyebutan jumlah lantai dinegasikan/dibatalkan,
 * jumlah lantai tetap UNKNOWN (null) — TIDAK diganti 1. Koreksi
 * negasi-then-positif ("bukan 2 lantai, 3 lantai" → 3) tetap berlaku.
 * Kata perantara ("tidak JADI 3 lantai", "jangan BUAT 4 lantai",
 * "bukan BANGUNAN 2 lantai") ikut dinegasikan — daftar tertutup
 * (jadi/buat/bikin/pakai/bangunan/gedung/rumah).
 *
 * Lapisan yang diuji: parseFloorsMention + extractRabNeeds (rabNeeds.ts)
 * dan extractRabIntentSpec (rabIntentSpec.ts) — keduanya harus sepakat
 * null. Bagian 8 menguji hilir: intake + draft. Draft rumah (specRab)
 * dan draft universal MASIH membangun draft 1 lantai dengan label
 * ASUMSI TERBUKA — itu koersi `?? 1` di specRab.ts:265/:138 (file
 * Worker F TIDAK BOLEH sentuh) yang dipin freeSpecRab.test.ts:408;
 * cek-cek itu ditandai [BATAS TERDOKUMENTASI] dan menegaskan LABELNYA
 * ada, bukan bahwa draft-nya 1 lantai diam-diam.
 *
 * Jalankan: npx --yes tsx src/test/aiWorkflowHardeningFloors.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import {
  parseFloorsMention, extractRabNeeds, looksLikeNeedsAnswer,
  buildDesignPrompt, missingNeeds,
} from '../ai-tools/ezrab-ai/rabNeeds';
import { extractRabIntentSpec, identifyMissingSpec } from '../ai-tools/ezrab-ai/rabIntentSpec';
import {
  executeIntent, continueRabNeeds, continueRabFinalize,
  getLastRabNeeds, setLastRabNeeds, hasActiveRabNeeds,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { getLastDirectRab } from '../ai-tools/ezrab-ai/directRab';
import { clearLastRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentFlow';
import { understandProject } from '../ai-tools/ezrab-ai/buildingTypology';
import { buildUniversalDraft } from '../ai-tools/ezrab-ai/universalRab';

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

function reset(): void {
  setLastRabNeeds(null);
  clearLastRabIntentSpec();
}

type Awaiting = { concept: boolean; needs: boolean };

/** Tiruan setia satu submit view.tsx untuk alur rumah (needs + finalisasi). */
function submit(msg: string, awaiting: Awaiting): { res: { message: string }; awaiting: Awaiting } {
  if (awaiting.needs && looksLikeNeedsAnswer(msg)) {
    const r = continueRabNeeds(msg, null);
    return { res: r, awaiting: { concept: false, needs: r.awaitRabNeeds === true } };
  }
  if (hasActiveRabNeeds(null)) {
    const fin = continueRabFinalize(msg, null);
    if (fin) return { res: fin, awaiting: { concept: false, needs: fin.awaitRabNeeds === true } };
    if (looksLikeNeedsAnswer(msg)) {
      const r = continueRabNeeds(msg, null);
      return { res: r, awaiting: { concept: false, needs: r.awaitRabNeeds === true } };
    }
  }
  const routed = routeIntent(msg);
  const res = executeIntent(routed.intent as never, undefined, ctxFor(msg));
  return { res, awaiting: { concept: false, needs: (res as { awaitRabNeeds?: boolean }).awaitRabNeeds === true } };
}

/** Empat contoh direktif owner — semuanya harus UNKNOWN di kedua lapisan. */
const ALL_NEGATED = [
  'Bukan 2 lantai.',
  'Tidak jadi 3 lantai.',
  'Jangan buat 4 lantai.',
  'Bukan bangunan 2 lantai, saya belum menentukan jumlah lantainya.',
];

/* ------------------------------------------------------------------ */
/* 1 — Deklarasi positif (perilaku lama tidak berubah)                 */
/* ------------------------------------------------------------------ */
console.log('== 1 — Deklarasi positif ==');
{
  check('1.1 parse "3 lantai" → 3', parseFloorsMention('3 lantai') === 3);
  check('1.2 spek "3 lantai" → 3', extractRabIntentSpec('3 lantai').floors === 3);
  check('1.3 parse "rumah 2 lantai" → 2', parseFloorsMention('rumah 2 lantai') === 2);
  check('1.4 spek "rumah 2 lantai" → 2', extractRabIntentSpec('rumah 2 lantai').floors === 2);
  check('1.5 parse "lantai 3" → 3', parseFloorsMention('lantai 3') === 3);
  check('1.6 spek "lantai 3" → 3', extractRabIntentSpec('lantai 3').floors === 3);
  check('1.7 parse "dua lantai" → 2 (kata bilangan)', parseFloorsMention('dua lantai') === 2);
  check('1.8 spek "dua lantai" → 2 (kata bilangan)', extractRabIntentSpec('dua lantai').floors === 2);
  check('1.9 parse "bertingkat" → 2 (konvensi katalog)', parseFloorsMention('rumah bertingkat') === 2);
  check('1.10 parse "lantainya 1 saja" → 1 (koreksi kepemilikan)', parseFloorsMention('lantainya 1 saja') === 1);
  check('1.11 parse "1 lantai 60 m2" → 1 (angka luas bukan lantai)', parseFloorsMention('Buatkan RAB rumah 1 lantai 60 m2 di Probolinggo') === 1);
  check('1.12 parse "2 lantai 3 kamar" → 2 (kamar bukan lantai)', parseFloorsMention('2 lantai 3 kamar') === 2);
}

/* ------------------------------------------------------------------ */
/* 2 — Beberapa deklarasi positif: kandidat TERAKHIR menang            */
/* ------------------------------------------------------------------ */
console.log('== 2 — Beberapa deklarasi positif ==');
{
  check('2.1 parse "2 lantai" → "lantai 3" tetap 3', parseFloorsMention('Saya mau buat rumah 2 lantai. Koreksi: lantai 3') === 3);
  check('2.2 spek "2 lantai" → "lantai 3" tetap 3', extractRabIntentSpec('Saya mau buat rumah 2 lantai. Koreksi: lantai 3').floors === 3);
  check('2.3 parse "satu lantai" → "dua lantai" tetap 2', parseFloorsMention('satu lantai saja, maksud saya dua lantai') === 2);
}

/* ------------------------------------------------------------------ */
/* 3 — Deklarasi negasi → UNKNOWN (null), bukan 1                     */
/* ------------------------------------------------------------------ */
console.log('== 3 — Deklarasi negasi → UNKNOWN ==');
{
  check('3.1 parse "jangan dua lantai" → null', parseFloorsMention('jangan dua lantai') === null,
    `dapat ${parseFloorsMention('jangan dua lantai')}`);
  check('3.2 spek "jangan dua lantai" → null', extractRabIntentSpec('jangan dua lantai').floors === null);
  check('3.3 parse "bukan 2 lantai" → null', parseFloorsMention('bukan 2 lantai') === null);
  check('3.4 spek "bukan 2 lantai" → null', extractRabIntentSpec('bukan 2 lantai').floors === null);
  check('3.5 parse "tidak bertingkat" → null', parseFloorsMention('tidak bertingkat') === null);
  check('3.6 parse "buatkan rab rumah tidak bertingkat 6x10" → null', parseFloorsMention('buatkan rab rumah tidak bertingkat 6x10') === null);
  check('3.7 parse "bukan bertingkat" → null', parseFloorsMention('bukan bertingkat') === null);
  check('3.8 needs "jangan dua lantai": floors null + tidak disebut', (() => {
    const n = extractRabNeeds('jangan dua lantai');
    return n.floors === null && n.floorsMentioned === false;
  })());
}

/* ------------------------------------------------------------------ */
/* 4 — Positif lalu negasi (koreksi): nilai sah TERAKHIR menang       */
/* ------------------------------------------------------------------ */
console.log('== 4 — Positif lalu negasi ==');
{
  check('4.1 parse "2 lantai, bukan 3 lantai" → 2', parseFloorsMention('2 lantai, bukan 3 lantai') === 2);
  check('4.2 spek "2 lantai, bukan 3 lantai" → 2', extractRabIntentSpec('2 lantai, bukan 3 lantai').floors === 2);
  check('4.3 parse "3 lantai, jangan 2 lantai" → 3', parseFloorsMention('3 lantai, jangan 2 lantai') === 3);
  check('4.4 spek "3 lantai, jangan 2 lantai" → 3', extractRabIntentSpec('3 lantai, jangan 2 lantai').floors === 3);
}

/* ------------------------------------------------------------------ */
/* 5 — Negasi lalu positif (koreksi): pengganti sah menang            */
/* ------------------------------------------------------------------ */
console.log('== 5 — Negasi lalu positif ==');
{
  check('5.1 parse "bukan 2 lantai, 3 lantai" → 3', parseFloorsMention('bukan 2 lantai, 3 lantai') === 3);
  check('5.2 spek "bukan 2 lantai, 3 lantai" → 3', extractRabIntentSpec('bukan 2 lantai, 3 lantai').floors === 3);
  check('5.3 parse "bukan dua lantai, tiga lantai" → 3 (kata bilangan)', parseFloorsMention('bukan dua lantai, tiga lantai') === 3);
  check('5.4 spek "bukan dua lantai, tiga lantai" → 3', extractRabIntentSpec('bukan dua lantai, tiga lantai').floors === 3);
  check('5.5 parse "bukan bertingkat, 3 lantai" → 3', parseFloorsMention('bukan bertingkat, 3 lantai') === 3);
  check('5.6 spek "bukan 2 lantai, lantai 3" → 3 (bentuk lantai-N)', extractRabIntentSpec('bukan 2 lantai, lantai 3').floors === 3);
  check('5.7 needs "bukan 2 lantai, 3 lantai" → floors 3', extractRabNeeds('bukan 2 lantai, 3 lantai').floors === 3);
  check('5.8 parse "tidak jadi 2 lantai, jadi 3 lantai" → 3', parseFloorsMention('tidak jadi 2 lantai, jadi 3 lantai') === 3);
}

/* ------------------------------------------------------------------ */
/* 6 — Semua-negasi: empat contoh direktif owner → UNKNOWN            */
/* ------------------------------------------------------------------ */
console.log('== 6 — Semua-negasi (contoh direktif) → UNKNOWN ==');
{
  for (const [i, text] of ALL_NEGATED.entries()) {
    check(`6.${i + 1}a parse ${JSON.stringify(text)} → null`, parseFloorsMention(text) === null,
      `dapat ${parseFloorsMention(text)}`);
    const spec = extractRabIntentSpec(text);
    check(`6.${i + 1}b spek ${JSON.stringify(text)} → null`, spec.floors === null,
      `dapat ${spec.floors}`);
    check(`6.${i + 1}c spek ${JSON.stringify(text)}: 'floors' BUKAN field eksplisit`, !spec.explicitFields.includes('floors'));
    check(`6.${i + 1}d spek ${JSON.stringify(text)}: 'floors' masuk daftar hilang`, identifyMissingSpec(spec).includes('floors'));
    const n = extractRabNeeds(text);
    check(`6.${i + 1}e needs ${JSON.stringify(text)}: floors null + tidak disebut`, n.floors === null && n.floorsMentioned === false);
  }
}

/* ------------------------------------------------------------------ */
/* 7 — Jumlah lantai tidak disebut sama sekali → UNKNOWN               */
/* ------------------------------------------------------------------ */
console.log('== 7 — Tidak disebut → UNKNOWN ==');
{
  check('7.1 parse "buatkan rab rumah luas 120 m2" → null', parseFloorsMention('buatkan rab rumah luas 120 m2') === null);
  check('7.2 spek "buatkan rab rumah luas 120 m2" → null', extractRabIntentSpec('buatkan rab rumah luas 120 m2').floors === null);
  check('7.3 needs "buatkan rab rumah luas 120 m2": floors null', extractRabNeeds('buatkan rab rumah luas 120 m2').floors === null);
  check('7.4 missingNeeds TIDAK menuntut lantai (aturan owner 2026-10-22)',
    !missingNeeds(extractRabNeeds('buatkan rab rumah luas bangunan 120 m2')).some((m) => /lantai/.test(m)));
}

/* ------------------------------------------------------------------ */
/* 8 — Hilir: intake + draft dengan lantai UNKNOWN                     */
/* ------------------------------------------------------------------ */
console.log('== 8 — Hilir: intake + draft, lantai UNKNOWN ==');
{
  // 8.1 — Prompt desain (file Worker F): TANPA frasa lantai karangan.
  const nNeg = extractRabNeeds('buatkan rab rumah, bukan 2 lantai, luas 120 m2');
  check('8.1 buildDesignPrompt: lantai UNKNOWN → TANPA "1 lantai" karangan',
    !/1 lantai/.test(buildDesignPrompt(nNeg, 'buatkan rab rumah, bukan 2 lantai, luas 120 m2')),
    buildDesignPrompt(nNeg, 'buatkan rab rumah, bukan 2 lantai, luas 120 m2'));
  check('8.2 buildDesignPrompt: lantai eksplisit 2 tetap tertulis',
    /2 lantai/.test(buildDesignPrompt(extractRabNeeds('rumah 2 lantai 6x10'), 'rumah 2 lantai 6x10')));

  // 8.3 — Alur intake rumah: "Bukan 2 lantai." bukan perubahan, lantai tetap null.
  reset();
  let st: Awaiting = { concept: false, needs: false };
  st = submit('Saya mau buat rumah dengan anggaran 300 juta.', st).awaiting;
  check('8.3 T1: needs lantai null', getLastRabNeeds(null)?.floors === null);
  const t2 = submit('Bukan 2 lantai.', st);
  st = t2.awaiting;
  check('8.4 T2 "Bukan 2 lantai.": lantai TETAP null (bukan 1, bukan 2)',
    getLastRabNeeds(null)?.floors === null && getLastRabNeeds(null)?.floorsMentioned === false,
    `dapat ${getLastRabNeeds(null)?.floors}`);
  check('8.5 T2: jawaban menyatakan "tidak ada perubahan" (negasi bukan data)',
    /tidak ada perubahan/.test(t2.res.message),
    t2.res.message.slice(0, 200));
  st = submit('Luas bangunan 120 m2.', st).awaiting;
  check('8.6 T3: luas 120 tersimpan, lantai tetap null',
    getLastRabNeeds(null)?.buildingArea === 120 && getLastRabNeeds(null)?.floors === null);

  // 8.7 — Finalisasi "itu aja": draft TERBENTUK (lantai bukan syarat
  // blokir — missingNeeds, aturan owner 2026-10-22) TAPI 1 lantainya
  // BERLABEL asumsi, bukan dari pengguna. [BATAS TERDOKUMENTASI]
  const fin = submit('itu aja', st);
  const d = getLastDirectRab();
  check('8.7 [BATAS] finalisasi: draft tetap disusun (lantai bukan blokir)',
    fin.res.message.includes('Draft RAB rumah tinggal'), fin.res.message.slice(0, 200));
  check('8.8 [BATAS] finalisasi: pesan draft MEMUAT label "Asumsi: 1 lantai"',
    fin.res.message.includes('Asumsi: 1 lantai'));
  check('8.9 [BATAS] finalisasi: provenance lantai = assumption (bukan user)',
    d?.provenance.some((p) => /lantai/i.test(p.label) && p.source === 'assumption') === true,
    JSON.stringify(d?.provenance.filter((p) => /lantai/i.test(p.label))));
  check('8.10 [BATAS] finalisasi: total Rp258.384.658 = draft 1 lantai berlabel (bukan angka diam-diam)',
    d?.calc.totalDirectCost === 258384658, `dapat ${d?.calc.totalDirectCost}`);

  // 8.11 — Draft universal: lantai null di spek, draft jalan di atas luas.
  const uni = buildUniversalDraft('buatkan rab gudang 10x20, jangan dua lantai');
  check('8.11 universal: draft terbentuk (lantai bukan blokir)', uni.kind === 'draft', (uni as { reason?: string }).reason ?? '');
  if (uni.kind === 'draft') {
    check('8.12 universal: spek lantai null + tidak eksplisit',
      uni.draft.spec.floors === null && uni.draft.spec.floorsExplicit === false,
      `floors=${uni.draft.spec.floors} explicit=${uni.draft.spec.floorsExplicit}`);
    check('8.13 [BATAS] universal: asumsi 1 lantai DITULIS TERBUKA di draft',
      uni.draft.assumptions.some((a) => /ASUMSI 1 lantai/i.test(a)),
      uni.draft.assumptions.filter((a) => /lantai/i.test(a)).join(' | '));
  } else {
    check('8.12 universal: spek lantai null + tidak eksplisit', false, 'draft tidak terbentuk');
    check('8.13 [BATAS] universal: asumsi 1 lantai DITULIS TERBUKA di draft', false, 'draft tidak terbentuk');
  }

  // 8.14 — IR tipologi: nilai 1 HANYA sebagai asumsi berlabel, bukan eksplisit.
  const u = understandProject('buatkan rab gudang 10x20, jangan dua lantai');
  check('8.14 [BATAS] tipologi: floors.value 1 DENGAN source assumption + explicit false',
    u.floors.value === 1 && u.floors.source === 'assumption' && u.floors.explicit === false,
    JSON.stringify(u.floors));
  check('8.15 tipologi: totalFloorArea TETAP null (tidak dikali asumsi)',
    u.totalFloorArea.value === null, `dapat ${u.totalFloorArea.value}`);
}

console.log(`\n${failed === 0 ? 'SEMUA TES HARDENING LANTAI WORKER F LULUS' : 'ADA TES GAGAL'} — lulus ${passed}, gagal ${failed}`);
if (failures.length) console.log('Gagal:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);
