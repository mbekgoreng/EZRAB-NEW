// Suite: Klasifikasi Universal + Mixed-Discipline (W2/W10 — program
// Universal Construction Intelligence §2 + §10). Membuktikan:
// taksonomi tunggal konsisten; classifyUniversal diteruskan ke engine
// (SATU klasifikasi, bukan dua); spek universal ↔ rumah round-trip
// tanpa kehilangan data; SATU parser budget kanonis di semua situs;
// spek per-scope; draft parsial + warning; contoh mixed-discipline §10;
// divergensi definisi "kritis" (handoff W6) dipin sebagai perilaku
// saat ini; tabel coverage template→scope (G12).
// Skrip asersi tsx polos (BUKAN vitest).
// Jalankan dari root repo: npx --yes tsx src/test/universalClassification.test.ts
//
// CATATAN CABANG TAK TERUJI: pesan gabungan multi-skip (≥2 scope gagal
// pick dalam satu draft single-building) tidak punya input deterministik
// yang diketahui — satu-satunya gerbang skip yang dapat dipicu andal
// adalah jembatan (bentang/material), dan satu teks hanya punya satu
// scope jembatan. Cabang itu adalah gabungan mekanis dari data yang
// sama dengan jalur single-skip yang DIPIN di §6; bila gerbang skip
// kedua ditambahkan (mis. material guard scope lain), tambahkan tes
// gabungan di sini.
import {
  classifyUniversal,
  SUBCATEGORIES,
  DISCIPLINE_MAP,
  KNOWN_CLASSIFICATION_DIVERGENCES,
  TEMPLATE_FAMILY_COVERAGE,
  coveredScopesForFamily,
  classificationScopeIds,
  validateTaxonomyConsistency,
} from '../ai-tools/ezrab-ai/universalTaxonomy.js';
import {
  classifyUniversal as classifyUniversalFromIntake,
  extractUniversalContext,
  selectNextQuestion,
  parseBudgetMention,
  serializeUniversalIntakeContext,
  rehydrateUniversalIntakeContext,
} from '../ai-tools/ezrab-ai/universalIntake.js';
import {
  SCOPE_GROUPS,
  detectScopes,
  extractUniversalSpec,
  specForScope,
  buildUniversalDraft,
  rabIntentSpecToUniversal,
  classifyParam,
  pickTemplateForScope,
  scopeMeasureAvailable,
  mapSpecToParams,
} from '../ai-tools/ezrab-ai/universalRab.js';
import {
  extractRabIntentSpec,
  universalSpecToRabIntent,
} from '../ai-tools/ezrab-ai/rabIntentSpec.js';
import { parseBudgetMentions, extractUniversalMeasures } from '../ai-tools/ezrab-ai/rabNeeds.js';
import { BUILDING_FUNCTIONS } from '../ai-tools/ezrab-ai/buildingTypology.js';
import { suppressedScopes } from '../ai-tools/ezrab-ai/specChain.js';
import { criticalFieldsFor } from '../ai-tools/ezrab-ai/rabIntentFlow.js';
import { RabTemplateService } from '../services/rabTemplateService.js';
import type { StructuredSpec } from '../ai-tools/ezrab-ai/structuredSpec.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

function sortedEqual(a: string[], b: string[]): boolean {
  const x = [...a].sort();
  const y = [...b].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

function containsCI(list: string[], needle: string): boolean {
  return list.some((x) => x.toLowerCase().includes(needle.toLowerCase()));
}

console.log('§1 — Konsistensi taksonomi tunggal (S1-R3, G13)');
{
  check('SCOPE_GROUPS = 18 scope (pin)', SCOPE_GROUPS.length === 18, SCOPE_GROUPS.length);
  check('SUBCATEGORIES = 54 subkategori', SUBCATEGORIES.length === 54, SUBCATEGORIES.length);
  check('DISCIPLINE_MAP = 18 baris (satu per scope)', DISCIPLINE_MAP.length === 18, DISCIPLINE_MAP.length);
  const problems = validateTaxonomyConsistency({
    scopes: SCOPE_GROUPS,
    subcategories: SUBCATEGORIES,
    functions: BUILDING_FUNCTIONS,
  });
  check('validator taksonomi: 0 masalah atas registry hidup', problems.length === 0, problems);
  // Arah balik eksplisit (di luar validator): tiap subkategori muncul
  // di ≥1 baris DISCIPLINE_MAP.
  const mappedSubs = new Set(DISCIPLINE_MAP.flatMap((r) => r.subcategoryIds));
  check(
    'tiap subkategori termuat di DISCIPLINE_MAP',
    SUBCATEGORIES.every((s) => mappedSubs.has(s.id)),
    SUBCATEGORIES.filter((s) => !mappedSubs.has(s.id)).map((s) => s.id),
  );
  // Re-ekspor intake = referensi fungsi yang sama (taksonomi tunggal).
  check(
    'universalIntake.classifyUniversal === universalTaxonomy.classifyUniversal',
    classifyUniversalFromIntake === classifyUniversal,
  );
  // Tabel divergensi yang didokumentasikan — diverifikasi HIDUP
  // (bukan sekadar data): klasifikasi + engine benar-benar
  // menghasilkan himpunan scope yang tertulis di tabel.
  check('tabel divergensi punya 6 entri', KNOWN_CLASSIFICATION_DIVERGENCES.length === 6, KNOWN_CLASSIFICATION_DIVERGENCES.length);
  for (const d of KNOWN_CLASSIFICATION_DIVERGENCES) {
    const clsScopes = classificationScopeIds(classifyUniversal(d.example));
    const engScopes = detectScopes(d.example).map((s) => s.id);
    check(
      `divergensi hidup: ${d.example.slice(0, 42)}… (klasifikasi)`,
      sortedEqual(clsScopes, d.classificationScopes),
      { expected: d.classificationScopes, got: clsScopes },
    );
    check(
      `divergensi hidup: ${d.example.slice(0, 42)}… (engine)`,
      sortedEqual(engScopes, d.engineScopes),
      { expected: d.engineScopes, got: engScopes },
    );
  }
}

console.log('§2 — classifyUniversal → engine (S1-R3)');
{
  const texts = [
    'buatkan RAB jalan 2 km + drainase 500 m',
    'perumahan + jalan + drainase + retaining wall',
    'gudang 10 x 20 m + jembatan beton bentang 12 m',
  ];
  for (const t of texts) {
    const cls = classifyUniversal(t);
    const spec = extractUniversalSpec(t);
    check(
      `spec.classification = classifyUniversal untuk ${t.slice(0, 30)}…`,
      spec.classification?.primaryId === cls.primary.id &&
        sortedEqual(spec.classification.secondaryIds, cls.secondary.map((s) => s.id)) &&
        spec.classification.isMulti === cls.isMulti,
      spec.classification,
    );
  }
  // Threading opts: klasifikasi yang diteruskan DIHORMATI (bukan
  // dihitung ulang) — dibuktikan dengan klasifikasi teks lain.
  const clsA = classifyUniversal('jalan 2 km');
  const specB = extractUniversalSpec('drainase 500 m', { classification: clsA });
  check(
    'opts.classification diteruskan apa adanya (bukan dihitung ulang)',
    specB.classification?.primaryId === clsA.primary.id,
    specB.classification,
  );
  // buildUniversalDraft meneruskan opts.classification ke spek.
  const clsC = classifyUniversal('buatkan RAB jalan 2 km + drainase 500 m');
  const d = buildUniversalDraft('buatkan RAB jalan 2 km + drainase 500 m', undefined, { classification: clsC });
  check(
    'buildUniversalDraft menyimpan classification di draft.spec',
    d.kind === 'draft' &&
      d.draft.spec.classification?.primaryId === clsC.primary.id &&
      d.draft.spec.classification?.isMulti === true,
    d.kind === 'draft' ? d.draft.spec.classification : d.kind,
  );
  // Intake memakai classifier yang sama (primary identik).
  const ctx = extractUniversalContext('buatkan RAB jalan 2 km + drainase 500 m');
  check(
    'extractUniversalContext.primary = classifyUniversal.primary',
    ctx.primary?.id === clsC.primary.id,
    ctx.primary?.id,
  );
  // Pin: rumah typed TIDAK PERNAH scope engine (keputusan alignment).
  check(
    "detectScopes('Buatkan RAB rumah type 70 2 lantai') === [] (pin)",
    detectScopes('Buatkan RAB rumah type 70 2 lantai').length === 0,
    detectScopes('Buatkan RAB rumah type 70 2 lantai').map((s) => s.id),
  );
  // 'perumahan': kedua taksonomi sepakat → gedung.
  check(
    "classifyUniversal('perumahan …').primary = 'rumah'",
    classifyUniversal('perumahan + jalan + drainase + retaining wall').primary.id === 'rumah',
  );
  check(
    "detectScopes('perumahan …') memuat 'gedung'",
    detectScopes('perumahan + jalan + drainase + retaining wall').some((s) => s.id === 'gedung'),
  );
}

console.log('§3 — Round-trip spek dua arah (S1-R3)');
{
  // Rumah → universal → rumah: tanpa kehilangan data.
  const houseText =
    'buatkan RAB rumah 3 kamar tidur 2 kamar mandi luas 120 m2 2 lantai kualitas premium tanpa pagar, budget 500 juta';
  const r1 = extractRabIntentSpec(houseText);
  const u1 = rabIntentSpecToUniversal(r1);
  const r2 = universalSpecToRabIntent(u1);
  check('round-trip rumah: bedrooms', r2.bedrooms === 3, r2.bedrooms);
  check('round-trip rumah: bathrooms', r2.bathrooms === 2, r2.bathrooms);
  check('round-trip rumah: quality', r2.quality === 'premium', r2.quality);
  check('round-trip rumah: exclusions', containsCI(r2.exclusions, 'pagar'), r2.exclusions);
  check('round-trip rumah: buildingAreaM2', r2.buildingAreaM2 === 120, r2.buildingAreaM2);
  check('round-trip rumah: floors', r2.floors === 2, r2.floors);
  check('round-trip rumah: budgetIdr', r2.budgetIdr === 500_000_000, r2.budgetIdr);
  // Universal → rumah → universal: tanpa kehilangan data.
  const uniText = 'jembatan beton bentang 12 meter tebal 20 cm volume 250 m3';
  const u2 = extractUniversalSpec(uniText);
  const r3 = universalSpecToRabIntent(u2);
  const u3 = rabIntentSpecToUniversal(r3);
  check('round-trip universal: spanM', u3.spanM === 12, u3.spanM);
  check('round-trip universal: thicknessCm', u3.thicknessCm === 20, u3.thicknessCm);
  check('round-trip universal: volumeM3', u3.volumeM3 === 250, u3.volumeM3);
  // Field universal dapat DIBACA jalur rumah (sub-model universal).
  check(
    'RabIntentSpec.universal memuat bentang/tebal/volume',
    r3.universal?.spanM === 12 && r3.universal?.thicknessCm === 20 && r3.universal?.volumeM3 === 250,
    r3.universal,
  );
  // Field rumah dapat DIBACA jalur universal (sub-model house).
  const uHouse = extractUniversalSpec('rumah 3 kamar tidur kualitas premium tanpa pagar');
  check(
    'UniversalSpec.house memuat kamar/kualitas/pengecualian',
    uHouse.house?.bedrooms === 3 &&
      uHouse.house?.quality === 'premium' &&
      containsCI(uHouse.house?.exclusions ?? [], 'pagar'),
    uHouse.house,
  );
  // Konteks intake: view rumah lestari antar-giliran + persistensi.
  const ctx1 = extractUniversalContext('rumah 3 kamar tidur');
  const ctx2 = extractUniversalContext('kualitas premium', ctx1);
  check(
    'ctx.house tergabung antar-giliran (kamar giliran 1 + kualitas giliran 2)',
    ctx2.house?.bedrooms === 3 && ctx2.house?.quality === 'premium',
    ctx2.house,
  );
  const restored = rehydrateUniversalIntakeContext(serializeUniversalIntakeContext(ctx2));
  check(
    'ctx.house lestari lewat serialize/rehydrate',
    restored?.house?.bedrooms === 3 && restored?.house?.quality === 'premium',
    restored?.house,
  );
  check('ctx.house absen bila tak ada field rumah', extractUniversalContext('jembatan bentang 12 m').house == null);
  // Ambiguitas PRA-ADA (didokumentasikan, bukan diperbaiki di sini):
  // extractor rumah membaca "km" sebagai "kamar mandi" (konvensi
  // listing properti "2 KM" — rabIntentSpec.ts:628), sehingga
  // "jalan 2 km" ikut terbaca bathrooms=2 di view rumah. Jembatan
  // ini HANYA meneruskan apa yang dibaca extractor sumber — tidak
  // mengarang dan tidak mengubahnya. Perbaikan ambiguitas itu
  // (konteks jalan vs rumah) adalah keputusan worker/owner terpisah.
  check(
    "DOKUMENTASI: 'jalan 2 km' → house.bathrooms=2 (ambiguitas 'km' pra-ada)",
    extractUniversalSpec('jalan 2 km').house?.bathrooms === 2,
    extractUniversalSpec('jalan 2 km').house,
  );
}

console.log('§4 — Parser budget tunggal (S1-R2, F11)');
{
  const OWNER = 'saya ada uang 120jt, buatkan RAB rumah type 36, apa saja pekerjaan dan spek materialnya?';
  check(
    'prompt owner persis → 120jt (rabIntentSpec)',
    extractRabIntentSpec(OWNER).budgetIdr === 120_000_000,
    extractRabIntentSpec(OWNER).budgetIdr,
  );
  check(
    'prompt owner persis → 120jt (universalRab)',
    extractUniversalSpec(OWNER).budgetCap === 120_000_000,
    extractUniversalSpec(OWNER).budgetCap,
  );
  check(
    'prompt owner persis → 120jt (universalIntake)',
    parseBudgetMention(OWNER)?.amount === 120_000_000,
    parseBudgetMention(OWNER),
  );
  check(
    'prompt owner persis → 120jt (parser kanonis = situs draftRevision)',
    parseBudgetMentions(OWNER)[0]?.amount === 120_000_000,
    parseBudgetMentions(OWNER),
  );
  // Guard "uang" — di semua situs publik.
  for (const t of ['uang muka 50 juta', 'uang jalan 2 juta', 'uang saku 500 ribu', 'uang mukanya 50 juta']) {
    check(`guard: '${t}' → null (rabIntentSpec)`, extractRabIntentSpec(t).budgetIdr === null);
    check(`guard: '${t}' → null (universalRab)`, extractUniversalSpec(t).budgetCap === null);
    check(`guard: '${t}' → null (intake)`, parseBudgetMention(t) === null);
  }
  check(
    "'ruang 120 juta' bukan budget (\\b cegah 'ruang')",
    parseBudgetMentions('ruang 120 juta').length === 0,
    parseBudgetMentions('ruang 120 juta'),
  );
  // Celah fallback rp yang ditutup: "uang muka Rp …" → null.
  check(
    "'uang muka Rp 50 juta' → null (semua situs)",
    extractRabIntentSpec('uang muka Rp 50 juta').budgetIdr === null &&
      extractUniversalSpec('uang muka Rp 50 juta').budgetCap === null &&
      parseBudgetMention('uang muka Rp 50 juta') === null,
  );
  // "budget menjadi …" (celah W4-era: filler 'menjadi').
  check(
    "'budget menjadi 250 juta' → 250jt (universalRab)",
    extractUniversalSpec('budget menjadi 250 juta').budgetCap === 250_000_000,
  );
  check(
    "'budget menjadi 250 juta' → 250jt (intake)",
    parseBudgetMention('budget menjadi 250 juta')?.amount === 250_000_000,
  );
  // Koreksi "bukan X": nilai yang dibatalkan tidak pernah dipakai.
  const corr = parseBudgetMention('budgetnya bukan 500jt, tapi maksimal 450jt');
  check(
    "'bukan 500jt, tapi maksimal 450jt' → 450jt + MAXIMUM",
    corr?.amount === 450_000_000 && corr?.kind === 'MAXIMUM',
    corr,
  );
  check(
    "'anggaran 300 juta, bukan 300 juta tapi anggaran 250 juta' → 250jt (first-match, nilai batal dilewati)",
    extractRabIntentSpec('anggaran 300 juta, bukan 300 juta tapi anggaran 250 juta').budgetIdr === 250_000_000,
  );
  // Semantik last-match universalRab dipertahankan.
  check(
    'universalRab: last-match (300jt lalu 250jt → 250jt)',
    extractUniversalSpec('anggaran 300 juta anggaran 250 juta').budgetCap === 250_000_000,
  );
  // Bentuk lama yang dipin suite lain.
  check(
    "'Rp 500.000.000' telanjang → 500jt (rabIntentSpec)",
    extractRabIntentSpec('Rp 500.000.000').budgetIdr === 500_000_000,
  );
  check(
    "'anggaran Rp 1,2 M' → 1,2 miliar (rabIntentSpec)",
    extractRabIntentSpec('anggaran Rp 1,2 M').budgetIdr === 1_200_000_000,
  );
  // Ambang unitless: < Rp1 jt bukan nominal budget.
  check(
    "'budget Rp 500.000' → null (di bawah ambang unitless)",
    parseBudgetMentions('budget Rp 500.000').length === 0,
  );
  // Keterbatasan yang DIKETAHUI (didokumentasikan, bukan bug): tanpa
  // kata kunci budget di mana pun, koreksi "bukan X tapi Y" tidak
  // dapat dibedakan dari angka biasa → null (bukan tebakan).
  check(
    "'bukan 300 juta, tapi 250 juta' → null (tanpa kata kunci budget)",
    parseBudgetMentions('bukan 300 juta, tapi 250 juta').length === 0,
  );
}

console.log('§5 — Spek per-scope (S1-R4, inti §10)');
{
  const s = extractUniversalSpec('buatkan RAB jalan 2 km + drainase 500 m');
  check('jalan.lengthM = 2000', s.scopeSpecs['jalan']?.lengthM === 2000, s.scopeSpecs);
  check('drainase.lengthM = 500', s.scopeSpecs['drainase']?.lengthM === 500, s.scopeSpecs);
  check('global lengthM tetap first-match (2000)', s.lengthM === 2000, s.lengthM);
  check('specForScope(jalan).lengthM = 2000', specForScope(s, 'jalan').lengthM === 2000);
  check('specForScope(drainase).lengthM = 500', specForScope(s, 'drainase').lengthM === 500);
  check('specForScope(scope tak dikenal) = spek global', specForScope(s, 'jembatan').lengthM === 2000);
  // Draft memakai spek per-scope (parameter template benar per part).
  const d = buildUniversalDraft('buatkan RAB jalan 2 km + drainase 500 m');
  if (d.kind === 'draft') {
    const jalanPart = d.draft.parts.find((p) => p.scope.id === 'jalan');
    const drainPart = d.draft.parts.find((p) => p.scope.id === 'drainase');
    check('draft jalan: road_length = 2000', jalanPart?.evaluatedParams?.road_length === 2000, jalanPart?.evaluatedParams);
    check('draft drainase: channel_length = 500', drainPart?.evaluatedParams?.channel_length === 500, drainPart?.evaluatedParams);
  } else {
    check('draft jalan+drainase terbentuk', false, d.kind);
  }
  // Single-scope = no-op (nilai per-scope == global).
  check(
    'gudang 10x20: scopeSpecs kosong (sisi dimensi dikecualikan)',
    Object.keys(extractUniversalSpec('gudang 10 x 20 m').scopeSpecs).length === 0,
    extractUniversalSpec('gudang 10 x 20 m').scopeSpecs,
  );
  const j = extractUniversalSpec('Buat RAB jembatan beton bentang 12 meter');
  check(
    'jembatan 12m: scopeSpecs == global (spanM 12, lengthM 12)',
    j.scopeSpecs['jembatan']?.spanM === 12 && j.scopeSpecs['jembatan']?.lengthM === 12 && j.spanM === 12,
    j.scopeSpecs,
  );
  // Sisi dimensi tidak bocor ke scope lain.
  const dg = extractUniversalSpec('gudang 10 x 20 m + jalan 2 km');
  check('gudang 10x20 + jalan 2km: gedung tanpa lengthM', dg.scopeSpecs['gedung']?.lengthM == null, dg.scopeSpecs);
  check('gudang 10x20 + jalan 2km: jalan.lengthM = 2000', dg.scopeSpecs['jalan']?.lengthM === 2000, dg.scopeSpecs);
  // Nilai yang dibatalkan ("bukan 2 km") tidak dipakai.
  const c = extractUniversalSpec('jalan bukan 2 km, tapi 1500 meter + drainase 500 m');
  check("jalan 'bukan 2 km, tapi 1500 m' → 1500", c.scopeSpecs['jalan']?.lengthM === 1500, c.scopeSpecs);
  // Bentang + panjang terpisah per scope.
  const sj = extractUniversalSpec('jembatan bentang 12 m + jalan 500 m');
  check('jembatan spanM = 12', sj.scopeSpecs['jembatan']?.spanM === 12, sj.scopeSpecs);
  check('jalan lengthM = 500', sj.scopeSpecs['jalan']?.lengthM === 500, sj.scopeSpecs);
  // Luas per-scope.
  const a = extractUniversalSpec('gedung kantor luas 900 m2 + lapangan 400 m2');
  check('gedung areaM2 = 900', a.scopeSpecs['gedung']?.areaM2 === 900, a.scopeSpecs);
  check('olahraga areaM2 = 400', a.scopeSpecs['olahraga']?.areaM2 === 400, a.scopeSpecs);
  // Count per-scope.
  const n = extractUniversalSpec('pondasi 24 titik + IPAL 2 unit');
  check('pondasi count = 24', n.scopeSpecs['pondasi']?.count === 24, n.scopeSpecs);
  check('sanitasi count = 2', n.scopeSpecs['sanitasi']?.count === 2, n.scopeSpecs);
}

console.log('§6 — Draft parsial (G10, S1-R4)');
{
  // Gerbang ukuran single-building kini == multi-gedung: scope gagal
  // pick → warning + lanjutkan part lain.
  const d = buildUniversalDraft('gudang 10 x 20 m + jembatan beton bentang 50 m');
  check(
    'gudang + jembatan-50m → DRAFT (bukan needs-spec)',
    d.kind === 'draft',
    d.kind === 'needs-spec' ? d.reason : d.kind,
  );
  if (d.kind === 'draft') {
    check('draft parsial: part hanya gedung', d.draft.parts.map((p) => p.scope.id).join() === 'gedung', d.draft.parts.map((p) => p.scope.id));
    check(
      'draft parsial: warning menyebut jembatan tidak dibangun',
      d.draft.warnings.some((w) => w.toLowerCase().includes('jembatan') && w.includes('tidak dibangun')),
      d.draft.warnings,
    );
  }
  // Jalur guard material yang sama (jembatan baja 60 m vs template beton).
  const d2 = buildUniversalDraft('jembatan baja bentang 60 m + gudang 10 x 20 m');
  check(
    'jembatan-baja-60m + gudang → DRAFT parsial',
    d2.kind === 'draft' && d2.draft.parts.some((p) => p.scope.id === 'gedung'),
    d2.kind,
  );
  // Pin perilaku lama: single-scope gagal → TETAP needs-spec.
  const d3 = buildUniversalDraft('Buat RAB jembatan beton bentang 50 meter');
  check(
    'jembatan-50m TUNGGAL → needs-spec (pin lama dipertahankan)',
    d3.kind === 'needs-spec',
    d3.kind,
  );
  if (d3.kind === 'needs-spec') {
    check(
      'needs-spec tunggal: missing menyebut DED',
      d3.missing.some((m) => m.includes('DED')),
      d3.missing,
    );
    check(
      'needs-spec tunggal: reason = alasan skip verbatim (bukan gabungan)',
      d3.reason === 'Bentang 50 m di luar cakupan template beton katalog (maks 40 m).',
      d3.reason,
    );
  }
}

console.log('§7 — Mixed-discipline §10 (tanpa klaim harga)');
{
  // Contoh 1: jalan + drainase.
  const cls1 = classifyUniversal('buatkan RAB jalan 2 km + drainase 500 m');
  check('jalan+drainase: isMulti', cls1.isMulti === true, cls1.isMulti);
  const d1 = buildUniversalDraft('buatkan RAB jalan 2 km + drainase 500 m');
  check(
    'jalan+drainase: draft 2 part (jalan + drainase)',
    d1.kind === 'draft' && sortedEqual(d1.draft.parts.map((p) => p.scope.id), ['jalan', 'drainase']),
    d1.kind === 'draft' ? d1.draft.parts.map((p) => p.scope.id) : d1.kind,
  );
  // Contoh 2: perumahan + jalan + drainase + retaining wall.
  const text2 = 'perumahan 20 unit + jalan 1 km + drainase 500 m + retaining wall 100 m';
  const cls2 = classifyUniversal(text2);
  check("perumahan-mixed: primary = 'rumah' (aturan intent-first)", cls2.primary.id === 'rumah', cls2.primary.id);
  check('perumahan-mixed: isMulti', cls2.isMulti === true, cls2.isMulti);
  const s2 = extractUniversalSpec(text2);
  check(
    'perumahan-mixed: scopeSpecs per scope benar',
    s2.scopeSpecs['jalan']?.lengthM === 1000 &&
      s2.scopeSpecs['drainase']?.lengthM === 500 &&
      s2.scopeSpecs['lanskap']?.lengthM === 100 &&
      s2.scopeSpecs['gedung']?.count === 20,
    s2.scopeSpecs,
  );
  const d2 = buildUniversalDraft(text2);
  check(
    'perumahan-mixed: draft 4 part',
    d2.kind === 'draft' && d2.draft.parts.length === 4,
    d2.kind === 'draft' ? d2.draft.parts.map((p) => p.scope.id) : d2.kind,
  );
  if (d2.kind === 'draft') {
    const byScope = (id: string) => d2.draft.parts.find((p) => p.scope.id === id)?.evaluatedParams;
    check('perumahan-mixed: jalan road_length = 1000', byScope('jalan')?.road_length === 1000, byScope('jalan'));
    check('perumahan-mixed: drainase channel_length = 500', byScope('drainase')?.channel_length === 500, byScope('drainase'));
    // B1 (2026-11-23): gedung kini BLD-RUSUN (bukan hotel) — count 20
    // diteruskan ke num_units (jumlah unit hunian), bukan num_rooms.
    check('perumahan-mixed: gedung num_units = 20 (count)', byScope('gedung')?.num_units === 20, byScope('gedung'));
    // B1 (2026-11-23): lanskap kini STR-RETAINING-RC (bukan taman kota)
    // — panjang 100 diteruskan ke wall_length, bukan path_length.
    check('perumahan-mixed: lanskap wall_length = 100', byScope('lanskap')?.wall_length === 100, byScope('lanskap'));
  }
}

console.log('§8 — Divergensi definisi "kritis" (handoff W6 — dipin sebagai perilaku saat ini)');
{
  // Sisi W6 (tabel kritis klarifikasi): field-field ini KRITIS di sana.
  check(
    "criticalFieldsFor('jembatan') memuat span + width",
    criticalFieldsFor('jembatan').some((f) => f.key === 'span') &&
      criticalFieldsFor('jembatan').some((f) => f.key === 'width'),
    criticalFieldsFor('jembatan'),
  );
  check(
    "criticalFieldsFor('drainase') memuat channelDims",
    criticalFieldsFor('drainase').some((f) => f.key === 'channelDims'),
    criticalFieldsFor('drainase'),
  );
  check(
    "criticalFieldsFor('renovasi') memuat area",
    criticalFieldsFor('renovasi').some((f) => f.key === 'area'),
    criticalFieldsFor('renovasi'),
  );
  // Sisi intake: ketiga pertanyaan itu NON-KRITIS di sini — dipin
  // lewat perilaku selectNextQuestion (non-kritis hanya diajukan
  // sebagai pertanyaan pertama; sesudah satu jawaban, dilewati).
  // bridge-width:
  const jb = extractUniversalContext('jembatan bentang 12 m');
  check('bridge-width: diajukan sebagai pertanyaan pertama', selectNextQuestion(jb)?.key === 'bridge-width', selectNextQuestion(jb)?.key);
  jb.askedKeys = ['bridge-span'];
  check('bridge-width: DILEWATI sesudah satu jawaban (non-kritis)', selectNextQuestion(jb)?.key === 'bridge-type', selectNextQuestion(jb)?.key);
  // drainage-dims:
  const dr = extractUniversalContext('drainase 500 m');
  dr.drainageType = 'U-ditch pracetak';
  check('drainage-dims: diajukan sebagai pertanyaan pertama', selectNextQuestion(dr)?.key === 'drainage-dims', selectNextQuestion(dr)?.key);
  dr.askedKeys = ['drainage-type'];
  check('drainage-dims: DILEWATI sesudah satu jawaban (non-kritis)', selectNextQuestion(dr) === null, selectNextQuestion(dr)?.key);
  // renovation-area:
  const rv = extractUniversalContext('renovasi dapur dan kamar mandi');
  check('renovation-area: diajukan sebagai pertanyaan pertama', selectNextQuestion(rv)?.key === 'renovation-area', selectNextQuestion(rv)?.key);
  rv.askedKeys = ['renovation-scope'];
  check('renovation-area: DILEWATI sesudah satu jawaban (non-kritis)', selectNextQuestion(rv) === null, selectNextQuestion(rv)?.key);
  // Gudang: tabel W6 menuntut clearSpan+height, intake TIDAK PUNYA
  // pertanyaan itu — dipin: sesudah semua pertanyaan gudang terjawab,
  // tidak ada pertanyaan lanjutan.
  const gd = extractUniversalContext('gudang 10 x 20 m');
  gd.answers['warehouse-system'] = 'wh-portal';
  gd.floors = 1;
  gd.askedKeys = ['warehouse-system', 'building-floors'];
  check('gudang: TIDAK ADA pertanyaan clearSpan/height (null)', selectNextQuestion(gd) === null, selectNextQuestion(gd)?.key);
}

console.log('§9 — Tabel coverage template→scope (G12)');
{
  check('TEMPLATE_FAMILY_COVERAGE = 2 baris', TEMPLATE_FAMILY_COVERAGE.length === 2, TEMPLATE_FAMILY_COVERAGE.length);
  check("coveredScopesForFamily('kandang') = ['atap']", sortedEqual(coveredScopesForFamily('kandang'), ['atap']));
  check("coveredScopesForFamily('gudang-industri') = ['atap']", sortedEqual(coveredScopesForFamily('gudang-industri'), ['atap']));
  check('coveredScopesForFamily(null) = []', coveredScopesForFamily(null).length === 0);
  check("coveredScopesForFamily('rumah') = [] (keluarga tak dikenal)", coveredScopesForFamily('rumah').length === 0);
  // suppressedScopes membaca tabel (bukan hardcode).
  check("suppressedScopes([], 'kandang') memuat 'atap'", suppressedScopes([], 'kandang').has('atap'));
  check("suppressedScopes([], 'gudang-industri') memuat 'atap'", suppressedScopes([], 'gudang-industri').has('atap'));
  check('suppressedScopes([], null) kosong', suppressedScopes([], null).size === 0);
  // Aturan road-drainage 'tanpa'/'eksisting' dipertahankan.
  const tanpaDrain: StructuredSpec = {
    key: 'road-drainage', kind: 'condition', label: 'Drainase jalan',
    value: 'tanpa drainase', status: 'CONFIRMED', source: 'kuesioner', updatedAt: '2026-11-22',
  };
  check(
    "road-drainage 'tanpa drainase' → suppress 'drainase'",
    suppressedScopes([tanpaDrain], null).has('drainase'),
  );
  // Bukti tiap baris DIVERIFIKASI terhadap katalog hidup (bukan
  // sekadar data yang mengklaim dirinya sendiri).
  const svc = RabTemplateService.getInstance();
  for (const row of TEMPLATE_FAMILY_COVERAGE) {
    const template = svc.getTemplateById(row.evidenceTemplateId);
    check(
      `bukti ${row.familyId}: template ${row.evidenceTemplateId} ada di katalog`,
      template != null,
    );
    check(
      `bukti ${row.familyId}: komponen '${row.evidenceComponent}' ada di template`,
      template?.components?.some((c) => c.name === row.evidenceComponent) === true,
      template?.components?.map((c) => c.name),
    );
  }
}

console.log('§10 — Kedalaman sebagai dimensi sendiri (final gate A-079, koordinator 2026-11-22)');
{
  // Ekstraksi global berjangkar.
  check(
    "'kedalaman 30 m' → depthM 30",
    extractUniversalMeasures('sumur bor kedalaman 30 m').depthM === 30,
  );
  check(
    "'dalam 30 m' → depthM 30",
    extractUniversalMeasures('sumur dalam 30 m').depthM === 30,
  );
  check(
    "'jalan 2 km' → depthM null (tanpa positif palsu)",
    extractUniversalMeasures('buatkan rab jalan 2 km').depthM === null,
  );
  // Panjang telanjang pada kata-kunci kedalaman = kedalaman (per-scope).
  const borSpec = extractUniversalSpec('buatkan rab sumur bor 30 m');
  check(
    "'sumur bor 30 m' → scopeSpecs.mep.depthM 30",
    borSpec.scopeSpecs['mep']?.depthM === 30,
    borSpec.scopeSpecs,
  );
  check(
    "'sumur bor 30 m' → scopeSpecs.mep.lengthM tetap 30",
    borSpec.scopeSpecs['mep']?.lengthM === 30,
  );
  check(
    'specForScope(mep).depthM 30',
    specForScope(borSpec, 'mep').depthM === 30,
  );
  // Klasifikasi param: depth adalah jenis sendiri.
  check(
    "classifyParam('well_depth') = 'depth'",
    classifyParam('well_depth', 'Kedalaman Sumur Bor') === 'depth',
  );
  check(
    "classifyParam('channel_depth') = 'depth'",
    classifyParam('channel_depth', 'Kedalaman Saluran') === 'depth',
  );
  check(
    "classifyParam('channel_length') tetap 'length'",
    classifyParam('channel_length', 'Panjang Saluran') === 'length',
  );
  // Gerbang ukuran: kedalaman saja cukup untuk areaOrLength (mep).
  const mep = SCOPE_GROUPS.find((s) => s.id === 'mep')!;
  const depthOnly = { ...specForScope(borSpec, 'mep'), lengthM: null, areaM2: null, depthM: 30 as number | null };
  check('mep + depthM saja → basis ukuran tersedia', scopeMeasureAvailable(depthOnly, mep));
  const noBasis = { ...depthOnly, depthM: null as number | null };
  check('mep tanpa ukuran apa pun → basis tidak tersedia', !scopeMeasureAvailable(noBasis, mep));
  // Pick: UTIL-DEEP-WELL menang atas UTIL-PLUMBING-ELEC untuk sumur bor.
  const pick = pickTemplateForScope(specForScope(borSpec, 'mep'), mep);
  check(
    "pick sumur bor = UTIL-DEEP-WELL (bukan UTIL-PLUMBING-ELEC)",
    pick.pick?.template.id === 'UTIL-DEEP-WELL',
    pick.ranked.slice(0, 3).map((r) => `${r.template.id}:${r.score}`),
  );
  // End-to-end A-079: draft sumur bor memakai kedalaman pengguna.
  const draft = buildUniversalDraft('buatkan rab sumur bor 30 m') as any;
  check("A-079 kind = 'draft'", draft.kind === 'draft', draft.kind);
  check(
    'A-079 template = UTIL-DEEP-WELL',
    draft.kind === 'draft' && draft.draft.parts[0]?.template?.id === 'UTIL-DEEP-WELL',
    draft.draft?.parts?.[0]?.template?.id,
  );
  check(
    'A-079 well_depth = 30 (angka pengguna, bukan default 80)',
    draft.kind === 'draft' && draft.draft.parts[0]?.evaluatedParams?.well_depth === 30,
    draft.draft?.parts?.[0]?.evaluatedParams,
  );
  check(
    'A-079 item pertama = pengeboran (bukan jalan kebun / PJU)',
    draft.kind === 'draft' &&
      /pengeboran sumur bor/i.test(draft.draft.parts[0]?.generation?.items?.[0]?.description ?? ''),
    draft.draft?.parts?.[0]?.generation?.items?.[0]?.description,
  );
  // Anti-tabrakan: panjang TIDAK mengisi param depth template lain.
  const svc = RabTemplateService.getInstance();
  const concrete = svc.getTemplateById('SDA-IRRIGATION-CONCRETE')!;
  const mapped = mapSpecToParams(
    { ...extractUniversalSpec('buatkan rab saluran beton 400 m'), lengthM: 400, depthM: null },
    concrete,
  );
  check(
    "'saluran 400 m' → channel_length 400",
    mapped.params['channel_length'] === 400,
    mapped.params,
  );
  check(
    "'saluran 400 m' → channel_depth tetap default 0,8 (BUKAN 400)",
    mapped.params['channel_depth'] === 0.8,
    mapped.params,
  );
  const mappedDeep = mapSpecToParams(
    { ...extractUniversalSpec('buatkan rab saluran beton 400 m kedalaman 1,5 m'), lengthM: 400, depthM: 1.5 },
    concrete,
  );
  check(
    "'saluran 400 m kedalaman 1,5 m' → channel_depth 1,5",
    mappedDeep.params['channel_depth'] === 1.5,
    mappedDeep.params,
  );
  // Round-trip jembatan dua arah membawa depthM.
  const anchored = extractUniversalSpec('buatkan rab sumur bor kedalaman 45 m');
  check('global "kedalaman 45 m" → depthM 45', anchored.depthM === 45, anchored.depthM);
  const rt = universalSpecToRabIntent(anchored);
  check('universal → rabIntent: universal.depthM 45', rt.universal?.depthM === 45, rt.universal);
  const back = rabIntentSpecToUniversal(rt);
  check('rabIntent → universal: depthM 45 kembali', back.depthM === 45, back.depthM);
  // A-078 tidak berubah: saluran pasangan batu tetap template saluran.
  const saluran = buildUniversalDraft('buatkan rab saluran pasangan batu 400 m') as any;
  check(
    'A-078 template tetap SDA-IRRIGATION-STONE',
    saluran.kind === 'draft' && saluran.draft.parts[0]?.template?.id === 'SDA-IRRIGATION-STONE',
    saluran.draft?.parts?.[0]?.template?.id,
  );
}

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
