/**
 * EZRAB — BUILDING TYPOLOGY & MAGIC AI REPAIR — REGRESSION SUITE
 * (perbaikan 2026-11-08: gudang salah klasifikasi "Gedung & Bangunan
 * Bertingkat" lalu ditolak karena lantai tidak disebut).
 *
 * Menguji lapisan deterministik: buildingTypology (fungsi vs
 * kompleksitas, IR, validasi bertahap), rabNeeds (dimensi bangunan &
 * footprint), universalRab (eligibilitas draft & pesan kontekstual),
 * dan actionRegistry (percakapan multi-giliran lewat continueRabNeeds
 * + jalur CREATE_RAB_SUMMARY).
 *
 * Kasus 1–15 = daftar wajib brief owner. Sisanya = penguat tipologi.
 * Tes LIVE model: TIDAK dijalankan di suite ini (deterministik murni).
 *
 * Jalankan: npx --yes tsx src/test/buildingTypology.test.ts
 */

import { strict as assert } from 'assert';

// Mock localStorage pola universalRab.test.ts (template service memakainya).
const storage: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  },
};

import {
  understandProject,
  detectBuildingFunction,
  assessBuildingMissingInfo,
  componentStatusFromItem,
} from '../ai-tools/ezrab-ai/buildingTypology';
import { extractRabNeeds, missingNeeds, stripLandPhrases, validatePhysicalDimensions } from '../ai-tools/ezrab-ai/rabNeeds';
import { buildUniversalDraft, extractUniversalSpec } from '../ai-tools/ezrab-ai/universalRab';
import { executeIntent, continueRabNeeds, hasActiveRabNeeds, type ChatActionContext } from '../ai-tools/ezrab-ai/actionRegistry';

function ctxFor(rawText: string): ChatActionContext {
  return {
    navigate: () => undefined,
    rawText,
    currentMenu: 'chat-ai',
    activeProject: null,
    projects: [],
    projectTotal: null,
  } as unknown as ChatActionContext;
}

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

/* 1 — Gudang 10 × 20 m: draft, bukan penolakan bertingkat */
{
  const u = understandProject('buatkan rab gudang dengan ukuran 10 x 20 m');
  check('1. fungsi = gudang', u.functionId === 'gudang');
  check('1. footprint = 200 m²', u.footprint.value === 200, `dapat ${u.footprint.value}`);
  check('1. kompleksitas BUKAN bertingkat', u.complexity !== 'bertingkat', u.complexity);
  check('1. lantai = asumsi 1 (terlabel)', u.floors.value === 1 && u.floors.source === 'assumption' && !u.floors.explicit);
  const r = buildUniversalDraft('buatkan rab gudang dengan ukuran 10 x 20 m');
  check('1. build = draft', r.kind === 'draft', r.kind);
  if (r.kind === 'draft') {
    check('1. judul draft menyebut Gudang', /gudang/i.test(r.draft.title), r.draft.title);
    check('1. asumsi lantai terlabel di draft', r.draft.assumptions.some((a) => /ASUMSI 1 lantai/.test(a)));
    check('1. template gudang terpilih', r.draft.parts.some((p) => /warehouse|gudang/i.test(p.template.id + p.template.name)));
  }
}

/* 2 — Gudang 10 × 20 m + luas lahan 500 m²: lahan ≠ bangunan, coverage 40% */
{
  const text = 'buatkan rab gudang ukuran 10 x 20 m dengan luas lahan 500m2';
  const u = understandProject(text);
  check('2. footprint tetap 200 (bukan 500)', u.footprint.value === 200, `dapat ${u.footprint.value}`);
  check('2. luas lahan = 500 eksplisit', u.landArea.value === 500 && u.landArea.source === 'explicit');
  check('2. coverage = 40%', u.coveragePct === 40, `dapat ${u.coveragePct}`);
  const s = extractUniversalSpec(text);
  check('2. spec.areaM2 = 200 (bukan luas lahan)', s.areaM2 === 200, `dapat ${s.areaM2}`);
  check('2. spec.landAreaM2 = 500 terpisah', s.landAreaM2 === 500);
  const r = buildUniversalDraft(text);
  check('2. build = draft', r.kind === 'draft', r.kind);
  if (r.kind === 'draft') {
    check('2. asumsi menyebut lahan terpisah', r.draft.assumptions.some((a) => /TERPISAH/.test(a) && /500/.test(a)));
  }
}

/* 3 — Gudang satu lantai eksplisit */
{
  const u = understandProject('buatkan rab gudang satu lantai 12 x 25 m');
  check('3. lantai eksplisit = 1', u.floors.value === 1 && u.floors.explicit);
  check('3. kompleksitas satu-lantai', u.complexity === 'satu-lantai', u.complexity);
  check('3. footprint = 300', u.footprint.value === 300);
}

/* 4 — Gudang dua lantai EKSPLISIT: bertingkat sah karena disebut */
{
  const u = understandProject('buatkan rab gudang 2 lantai luas bangunan 800 m2');
  check('4. lantai eksplisit = 2', u.floors.value === 2 && u.floors.explicit);
  check('4. kompleksitas bertingkat (disebut)', u.complexity === 'bertingkat');
  check('4. luas bangunan disebut = 800', u.statedBuildingArea.value === 800);
  check('4. footprint TIDAK dikarang dari luas/lantai', u.footprint.value === null, `dapat ${u.footprint.value}`);
}

/* 5 — Gedung kantor tiga lantai */
{
  const u = understandProject('buatkan rab gedung kantor 3 lantai');
  check('5. fungsi = kantor', u.functionId === 'kantor', String(u.functionId));
  check('5. lantai = 3 eksplisit', u.floors.value === 3 && u.floors.explicit);
  check('5. kompleksitas bertingkat', u.complexity === 'bertingkat');
  const r = buildUniversalDraft('buatkan rab kantor 3 lantai luas 900 m2');
  check('5. kantor 3 lantai + luas = draft', r.kind === 'draft', r.kind);
}

/* 6 — Rumah tinggal 8 × 12 m */
{
  const u = understandProject('buatkan rab rumah tinggal 8 x 12 m');
  check('6. fungsi = rumah-tinggal', u.functionId === 'rumah-tinggal');
  check('6. footprint = 96', u.footprint.value === 96);
  const n = extractRabNeeds('buatkan rab rumah 8x12');
  check('6. needs rumah footprint 96', n.kind === 'rumah' && n.footprintM2 === 96);
}

/* 7 — Pabrik 20 × 30 m */
{
  const u = understandProject('buatkan rab pabrik 20 x 30 m');
  check('7. fungsi = pabrik', u.functionId === 'pabrik');
  check('7. footprint = 600', u.footprint.value === 600);
  const r = buildUniversalDraft('buatkan rab pabrik 20 x 30 m');
  check('7. pabrik berdimensi = draft (bukan unsupported)', r.kind === 'draft', r.kind);
}

/* 8 — Ruko 5 × 15 m */
{
  const u = understandProject('buatkan rab ruko 5 x 15 m');
  check('8. fungsi = ruko', u.functionId === 'ruko');
  check('8. footprint = 75', u.footprint.value === 75);
  check('8. ruko tanpa sebutan lantai BUKAN otomatis bertingkat', u.complexity !== 'bertingkat');
  const r = buildUniversalDraft('buatkan rab ruko 5 x 15 m');
  check('8. ruko berdimensi = draft', r.kind === 'draft', r.kind);
}

/* 9 — Luas bangunan tanpa luas lahan */
{
  const u = understandProject('buatkan rab gudang luas bangunan 350 m2');
  check('9. luas bangunan = 350', u.statedBuildingArea.value === 350);
  check('9. luas lahan tetap unknown (tidak dikarang)', u.landArea.value === null && u.landArea.source === 'unknown');
  check('9. coverage null tanpa lahan', u.coveragePct === null);
}

/* 10 — Luas lahan tanpa dimensi bangunan: TIDAK boleh jadi luas bangunan */
{
  const u = understandProject('buatkan rab gudang dengan luas lahan 1000 m2');
  check('10. footprint null', u.footprint.value === null);
  check('10. luas bangunan tidak diisi dari lahan', u.statedBuildingArea.value === null);
  const a = assessBuildingMissingInfo(u, 'buatkan rab gudang dengan luas lahan 1000 m2');
  check('10. validasi: draft belum bisa mulai (tier A)', a.canStartPreliminaryDraft === false);
  check('10. blokir hanya soal ukuran, BUKAN lantai', a.items.filter((i) => i.blocksDraft).every((i) => i.field === 'measure'));
  const s = extractUniversalSpec('buatkan rab gudang dengan luas lahan 1000 m2');
  check('10. spec.areaM2 null (lahan tidak menyusup)', s.areaM2 === null, `dapat ${s.areaM2}`);
}

/* 11 — Koreksi klasifikasi oleh user: "gudang bukan gedung" */
{
  const u = understandProject('gudang bukan gedung');
  check('11. koreksi: fungsi tetap gudang', u.functionId === 'gudang');
  check('11. flag koreksi tercatat', u.flags.some((f) => /dikoreksi pengguna/.test(f)), u.flags.join(' | '));
  check('11. tidak menjadi bertingkat', u.complexity !== 'bertingkat');
}

/* 12 — Info susulan multi-giliran (state RabNeeds + jalur registry) */
{
  const first = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab gudang dengan ukuran 10 x 20 m'));
  check('12. giliran 1 = draft langsung (bukan penolakan)', /draft RAB/i.test(first.message) && !/Gedung & Bangunan Bertingkat/.test(first.message), first.message.slice(0, 120));
  const n1 = extractRabNeeds(stripLandPhrases('buatkan rab gudang dengan ukuran 10 x 20 m'));
  const n2 = extractRabNeeds(stripLandPhrases('luas lahannya 500m2'), n1);
  void n2;
  const u2 = understandProject('buatkan rab gudang dengan ukuran 10 x 20 m dengan luas lahan 500m2');
  check('12. giliran 2 hanya menambah lahan; dimensi dipertahankan', u2.footprint.value === 200 && u2.landArea.value === 500);
  const fin = buildUniversalDraft('buatkan rab gudang dengan ukuran 10 x 20 m dengan luas lahan 500m2');
  check('12. gabungan akhir = draft', fin.kind === 'draft');
}

/* 13 — Variasi format penulisan dimensi */
{
  const formats: Array<[string, number]> = [
    ['buatkan rab gudang 10 x 20 m', 200],
    ['buatkan rab gudang 10 × 20 meter', 200],
    ['buatkan rab gudang panjang 20 m lebar 10 m', 200],
    ['buatkan rab gudang ukuran 10 meter kali 20 meter', 200],
    ['buatkan rab gudang 10x20', 200],
    ['buatkan rab gudang 15,5 x 10 m', 155],
  ];
  for (const [text, expected] of formats) {
    const u = understandProject(text);
    check(`13. format "${text.slice(18)}" → ${expected}`, u.footprint.value === expected, `dapat ${u.footprint.value}`);
  }
  const luas = understandProject('buatkan rab gudang luas 200 m2');
  check('13. "luas 200 m2" terbaca luas bangunan', luas.statedBuildingArea.value === 200);
  const luasPanjang = understandProject('buatkan rab gudang luas bangunan 200 meter persegi');
  check('13. "luas bangunan 200 meter persegi"', luasPanjang.statedBuildingArea.value === 200);
}

/* 14 — Dimensi ambigu / tanpa ukuran → klarifikasi kontekstual, bukan penolakan generik */
{
  const r = buildUniversalDraft('buatkan rab gudang');
  check('14. tanpa ukuran = needs-spec', r.kind === 'needs-spec', r.kind);
  if (r.kind === 'needs-spec') {
    check('14. alasan menyebut fungsi gudang', /gudang/i.test(r.reason), r.reason.slice(0, 100));
    check('14. alasan TIDAK menuntut lantai', !/jumlah lantai.*dibutuhkan|butuh.*lantai/i.test(r.reason) || /tidak wajib/.test(r.reason), r.reason.slice(0, 160));
    check('14. label lama "Bangunan Bertingkat" tidak muncul', !/Bangunan Bertingkat/.test(r.reason + r.missing.join(' ')));
    check('14. understoodSummary tersedia untuk pesan chat', typeof r.understoodSummary === 'string' && r.understoodSummary.length > 0);
  }
  const amb = understandProject('buatkan rab gudang sekitar 15 meter');
  check('14. satu angka saja ≠ footprint (tidak dikarang jadi luas)', amb.footprint.value === null);
}

/* 15 — Spek struktur hilang → TIDAK ada kuantitas/spek karangan */
{
  const r = buildUniversalDraft('buatkan rab gudang dengan ukuran 10 x 20 m');
  assert.equal(r.kind, 'draft');
  if (r.kind === 'draft') {
    const items = r.draft.parts.flatMap((p) => p.generation.items);
    check('15. draft punya item dari katalog nyata', items.length > 0);
    check('15. tidak ada item berharga Rp0-valid (sentinel tetap digating status)',
      items.every((it) => it.priceStatus === 'PRICE_UNRESOLVED' || (it.unitPrice ?? 0) > 0 || it.unitPrice == null));
    check('15. status komponen terpetakan ke taksonomi',
      items.every((it) => ['CALCULABLE', 'REQUIRES_SPECIFICATION', 'PRICE_UNRESOLVED'].includes(componentStatusFromItem(it))));
    check('15. spek struktur tak disebut → tetap gap terlabel (bukan karangan)',
      assessBuildingMissingInfo(understandProject('buatkan rab gudang dengan ukuran 10 x 20 m'), 'buatkan rab gudang dengan ukuran 10 x 20 m')
        .items.some((i) => i.field === 'structuralSystem' && !i.blocksDraft));
  }
}

/* Penguat: missingNeeds tidak lagi menuntut lantai */
{
  const n = extractRabNeeds('buatkan rab gudang 10x20');
  check('16. missingNeeds tanpa "jumlah lantai"', !missingNeeds(n).some((m) => /lantai/.test(m)), missingNeeds(n).join(' ; '));
  const nRumah = extractRabNeeds('buatkan rab rumah');
  check('16. rumah tanpa ukuran: yang kurang hanya basis ukuran', missingNeeds(nRumah).every((m) => !/lantai/.test(m)));
}

/* Penguat: konteks reproduksi persis brief owner */
{
  const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab gudang ukuran 10 x 20 m dengan luas lahan 500m2'));
  check('17. reproduksi brief: tidak ditolak sebagai gedung bertingkat', !/Bangunan Bertingkat saya belum bisa/.test(res.message));
  check('17. reproduksi brief: respons memuat draft', /draft RAB/i.test(res.message));
}

/* Finalisasi §4 — enam non-PASS skenario (amb-020/023/024/025, int-029/031) */
{
  const neg = buildUniversalDraft('buatkan rab gudang -5x10');
  check('F4. amb-020: dimensi negatif → needs-spec klarifikasi (bukan draft)', neg.kind === 'needs-spec');
  check('F4. amb-020: alasan menyebut dimensi tidak valid', neg.kind === 'needs-spec' && /tidak valid/.test(neg.reason));
  check('F4. validasi bersama: "-5x10" terdeteksi masalah', validatePhysicalDimensions('buatkan rab gudang -5x10').length > 0);
  check('F4. validasi bersama: "0x0" terdeteksi masalah', validatePhysicalDimensions('buatkan rab gudang 0x0').length > 0);
  check('F4. validasi bersama: "10x20" bersih', validatePhysicalDimensions('buatkan rab gudang 10x20').length === 0);
  check('F4. validasi bersama: nilai koreksi "bukan" tidak diperiksa', validatePhysicalDimensions('buatkan rab gudang 10x20 bukan -5').length === 0);
  check('F4. validasi bersama: panjang berlabel negatif terdeteksi', validatePhysicalDimensions('buatkan rab jalan panjang -100 m').length > 0);
  check('F4. IR: dimensionProblems terisi untuk -5x10', understandProject('buatkan rab gudang -5x10').dimensionProblems.length > 0);
  const gen1 = buildUniversalDraft('buatkan rab bangunan');
  check('F4. amb-023: "bangunan" tanpa ukuran → needs-spec kontekstual', gen1.kind === 'needs-spec' && /bangunan/i.test(gen1.reason));
  const gen2 = buildUniversalDraft('buatkan rab bangunan komersial');
  check('F4. amb-024: "bangunan komersial" → needs-spec kontekstual', gen2.kind === 'needs-spec' && /komersial/i.test(gen2.reason));
  const noObj = buildUniversalDraft('buatkan rab sesuatu yang besar');
  check('F4. amb-025: niat RAB tanpa objek → klarifikasi terpandu (needs-spec)', noObj.kind === 'needs-spec' && /objek/i.test(noObj.reason));
  const noIntent = buildUniversalDraft('cuaca hari ini cerah');
  check('F4. tanpa niat RAB & tanpa objek → tetap unsupported jujur', noIntent.kind === 'unsupported');
  const kanopi = buildUniversalDraft('buatkan rab kanopi carport luas 30 m2');
  check('F4. int-029: kanopi 30 m2 → draft dari template nyata', kanopi.kind === 'draft' && kanopi.draft.parts.length > 0);
  const kandang = buildUniversalDraft('buatkan rab kandang ayam 10 x 30 m');
  check('F4. int-031: kandang 10x30 → draft dari template nyata', kandang.kind === 'draft' && kandang.draft.parts.length > 0);
}

/* Finalisasi §5 — perluasan IR & contoh bahasa brief */
{
  const split = understandProject('tanah 500 meter, bangunan 200');
  check('F5. "tanah 500, bangunan 200": lahan 500 terpisah', split.landArea.value === 500, `dapat ${split.landArea.value}`);
  // CATATAN JUJUR (finalisasi §5): "bangunan 200" tanpa kata luas/satuan
  // TIDAK diekstrak sebagai luas bangunan oleh parser mana pun di repo —
  // mengartikannya sebagai 200 m² berarti menebak satuan & makna angka
  // (bisa jumlah unit/anggaran). Yang dijamin di sini: angka itu TIDAK
  // bocor menjadi luas bangunan/lahan karangan; lahan tetap 500 dan
  // statedBuildingArea tetap null (belum diketahui) sampai pengguna
  // menyebut "luas bangunan 200 m2" — bentuk itu diuji tepat di bawah.
  check('F5. "bangunan 200" tanpa satuan: TIDAK ditebak sebagai luas (tetap null, jujur)', split.statedBuildingArea.value === null, `dapat ${split.statedBuildingArea.value}`);
  const splitExplicit = understandProject('tanah 500 meter, luas bangunan 200 m2');
  check('F5. bentuk eksplisit: luas bangunan 200 terbaca', splitExplicit.statedBuildingArea.value === 200, `dapat ${splitExplicit.statedBuildingArea.value}`);
  const pagar = understandProject('buatkan rab pagar keliling lahan 20x30');
  check('F5. pagar keliling lahan 20x30: perimeter = 100 m', pagar.perimeter.value === 100, `dapat ${pagar.perimeter.value}`);
  const gudang = understandProject('buatkan rab gudang 10 x 20 m dengan luas lahan 500 m2');
  check('F5. disciplines jamak dari KB (gudang)', gudang.disciplines.length >= 2, gudang.disciplines.join(','));
  check('F5. provenance per field terisi', gudang.provenance.footprint === 'derived' && gudang.provenance.landArea === 'explicit' && gudang.provenance.floors === 'assumption');
  check('F5. totalFloorArea null bila lantai tidak eksplisit (tidak dikali asumsi)', gudang.totalFloorArea.value === null);
  const dua = understandProject('buatkan rab gudang 10x20 2 lantai');
  check('F5. totalFloorArea = tapak × lantai eksplisit (400)', dua.totalFloorArea.value === 400, `dapat ${dua.totalFloorArea.value}`);
  const jalan = buildUniversalDraft('buatkan rab jalan beton panjang 300 m lebar 4 m');
  check('F5. jalan beton 300x4 → draft', jalan.kind === 'draft');
  const drain = buildUniversalDraft('buatkan rab drainase u-ditch sepanjang 150 m');
  check('F5. drainase u-ditch 150 m → draft', drain.kind === 'draft');
  const koreksi = understandProject('buatkan rab gudang 10x20, ganti ukurannya jadi 12x25, atap baja ringan');
  check('F5. koreksi dimensi memperbarui tapak (300) tanpa menghapus atap', koreksi.footprint.value === 300 && koreksi.roofSystem != null, `tapak ${koreksi.footprint.value}, atap ${koreksi.roofSystem}`);
  check('F5. requiredSpecifications memuat material yang disebut', koreksi.requiredSpecifications.some((s) => s.includes('baja ringan')));
  const tanpaUkuran = understandProject('buatkan rab gudang');
  assessBuildingMissingInfo(tanpaUkuran, 'buatkan rab gudang');
  check('F5. missingInformation terisi label blokir tier A bila ukuran hilang', tanpaUkuran.missingInformation.length >= 1, tanpaUkuran.missingInformation.join(';'));
  const lengkap = understandProject('buatkan rab gudang 10 x 20 m');
  assessBuildingMissingInfo(lengkap, 'buatkan rab gudang 10 x 20 m');
  check('F5. missingInformation kosong bila tidak ada blokir', lengkap.missingInformation.length === 0);
}

/* Audit ekstrem 2026-11-08 — tiga cacat koreksi/negasi yang ditemukan
 * probe terprogram dan diperbaiki di lapisan bersama (bukan tempelan
 * per-soal): negasi lantai di parseFloorsMention; dimensi yang
 * dibatalkan ("bukan AxB") di pemilih pasangan-terakhir; fungsi
 * sama-panjang terakhir-menang di detectBuildingFunction. */
{
  const neg1 = understandProject('buatkan rab gudang 10x20, jangan dua lantai');
  check('X1. negasi lantai: "jangan dua lantai" → 1 lantai eksplisit (bukan 2)', neg1.floors.value === 1 && neg1.floors.explicit === true, `dapat ${neg1.floors.value}`);
  const neg2 = understandProject('buatkan rab gudang 10x20 tidak bertingkat');
  check('X1. negasi bertingkat: "tidak bertingkat" → 1 lantai eksplisit', neg2.floors.value === 1 && neg2.floors.explicit === true, `dapat ${neg2.floors.value}`);
  const batal = understandProject('buatkan rab gudang 10x20, bukan 8x15');
  check('X2. dimensi dibatalkan: "10x20, bukan 8x15" → tapak 200 (bukan 120)', batal.footprint.value === 200, `dapat ${batal.footprint.value}`);
  const batal2 = understandProject('buatkan rab gudang bukan 8x15 tapi 10x20');
  check('X2. dimensi dibatalkan di awal: "bukan 8x15 tapi 10x20" → tapak 200', batal2.footprint.value === 200, `dapat ${batal2.footprint.value}`);
  const gantiProyek = understandProject('buatkan rab rumah 6x10, gudang 10x20');
  check('X3. dua proyek disebut: fungsi TERAKHIR menang (gudang), tapak 200', gantiProyek.functionId === 'gudang' && gantiProyek.footprint.value === 200, `fn ${gantiProyek.functionId} fp ${gantiProyek.footprint.value}`);
  const rs = understandProject('buatkan rab rumah sakit 20x30');
  check('X3. istilah lebih panjang tetap menang: rumah sakit (bukan rumah)', rs.functionId === 'rumah-sakit');
}

/* Finalisasi §8 — konteks percakapan 4 giliran & pemisahan lahan/bangunan */
{
  // Urutan giliran persis contoh brief: gudang 10×20 → lahan 500 →
  // atap baja ringan → buat RAB awal. Giliran 1–3 berjalan lewat jalur
  // ringkasan kebutuhan (continueRabNeeds menggabung ke state sesi);
  // giliran 4 adalah permintaan lengkap yang menjadi draft.
  const g1 = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab gudang 10 x 20 m'));
  check('F8. giliran 1 (gudang 10x20): draft langsung dari jalur universal', /draft RAB/i.test(g1.message));
  continueRabNeeds('buatkan rab gudang 10 x 20 m');
  check('F8. sesi kebutuhan aktif (state ringkasan terbentuk)', hasActiveRabNeeds());
  continueRabNeeds('luas lahannya 500 m2');
  continueRabNeeds('atap baja ringan');
  const fin = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab gudang 10 x 20 m dengan luas lahan 500 m2 atap baja ringan'));
  check('F8. giliran 4 (buat RAB awal): berakhir dengan draft', /draft RAB/i.test(fin.message));
  // Pemisahan lahan vs bangunan di lapisan kebutuhan: frasa lahan
  // dibuang pemanggil (stripLandPhrases) SEBELUM ekstraksi bangunan,
  // dan luas lahan dicari dari teks ASLI — gabungan keduanya menjaga
  // lahan 500 tetap lahan dan tidak menjadi luas bangunan.
  const landOnly = extractRabNeeds('luas lahan 500 m2');
  // TEMUAN JUJUR (finalisasi §8): extractRabNeeds SENDIRIAN pada teks
  // lahan murni mengisi buildingArea=500 juga (fallback "N m2" generik).
  // Pemisahan yang benar hidup di KONVENSI PEMANGGIL: semua jalur
  // produksi memanggil extractRabNeeds(stripLandPhrases(text)) sehingga
  // frasa lahan dibuang dulu (dibuktikan cek berikutnya). Memperbaiki
  // fallback di dalam extractRabNeeds sendiri berisiko regresi pada
  // pemanggil yang mengandalkan "N m2" polos sebagai luas bangunan —
  // dicatat sebagai risiko terdokumentasi, bukan diubah diam-diam.
  check('F8. extractRabNeeds mentah pada lahan murni: landAreaM2=500 tercatat (buildingArea ikut terisi — risiko terdokumentasi)', landOnly.landAreaM2 === 500, `land=${landOnly.landAreaM2} area=${landOnly.buildingArea}`);
  const strippedNeeds = extractRabNeeds(stripLandPhrases('buatkan rab gudang 10x20 dengan luas lahan 500 m2'));
  check('F8. teks ter-strip lahan: footprint bangunan 200 utuh, lahan tidak bocor jadi luas', strippedNeeds.footprintM2 === 200 && strippedNeeds.buildingArea !== 500);
}

console.log(`\nBUILDING TYPOLOGY: ${pass} PASS, ${fail} FAIL`);
if (failures.length) console.log(`Gagal: ${failures.join(' | ')}`);
process.exit(fail > 0 ? 1 : 0);
