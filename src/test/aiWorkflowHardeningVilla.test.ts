/**
 * EZRAB AI WORKFLOW HARDENING — Worker E, T28 VILLA CLASSIFICATION (P2).
 *
 * KEPUTUSAN OWNER (final, 2026-11-26): APPROVE villa classification
 * behavior. Villa hunian privat -> RUMAH_TINGGAL; villa resort /
 * multi-unit hospitality -> HOTEL_HOSPITALITY. Pembedanya konteks
 * semantik + proyek yang sebenarnya, bukan kata "villa" saja.
 *
 * Yang DIPIN di sini (jalur NYATA, bukan mock):
 *  1. Villa pribadi 2 lantai di Bali -> rumah (RUMAH_TINGGAL).
 *  2. "Rumah villa untuk keluarga" -> rumah (RUMAH_TINGGAL).
 *  3. "Resort villa 8 unit" -> hotel (HOTEL_HOSPITALITY).
 *  4. "Villa boutique dengan beberapa unit untuk disewakan" -> hotel
 *     bila deskripsinya mendukung pemakaian hospitality.
 *  5. Klasifikasi rumah yang sudah ada tidak berubah.
 *  6. Klasifikasi hotel yang sudah ada tidak berubah.
 *  + Jangkar T28 WaveB (verbatim) + bukti end-to-end lewat
 *    buildUniversalDraft: villa pribadi mengambil template
 *    HOUSE-VILLA-MODERN, resort villa 8 unit mengambil
 *    BLD-BOUTIQUE-VILLA.
 *
 * TEMPAT PEMBEDA ITU HIDUP (verifikasi 2026-11-26, Worker E):
 *  - src/ai-tools/ezrab-ai/universalTaxonomy.ts:91 — def 'hotel'
 *    mengklaim villa HANYA pada frasa berurutan "villa resort" /
 *    "resort villa" / "boutique villa" (katalog HOTEL_HOSPITALITY).
 *  - universalTaxonomy.ts:107-119 (komentar Worker D) + :119 — def
 *    'rumah' mengklaim "villa" telanjang, dengan guard lookbehind /
 *    lookahead agar "resort" yang bersebelahan mengecualikannya
 *    (katalog RUMAH_TINGGAL, `specific` + 'villa' agar coverageFor
 *    menghitung template villa khusus).
 *  - src/services/rabTemplateService.ts:807 — HOUSE-VILLA-MODERN,
 *    "Villa Tropis Modern (Private Pool)", category RUMAH_TINGGAL.
 *  - rabTemplateService.ts:1156 — BLD-BOUTIQUE-VILLA, "Boutique Villa
 *    Resort Kompak (8 Unit)", category HOTEL_HOSPITALITY.
 *  - Klasifikasi mengalir: classifyUniversal (universalTaxonomy.ts:257,
 *    prioritas primer hotel=1 di atas rumah=7) -> extractUniversalContext
 *    (universalIntake.ts:598) -> extractUniversalSpec / buildUniversalDraft
 *    (universalRab.ts:3051) -> pickTemplateForScope.
 *
 * BLOKIR TERBUKA — §3 kasus 4 GAGAL (cek "T28-4" di bawah, sengaja
 * TIDAK dilunakkan): input harfiah direktif "Villa boutique dengan
 * beberapa unit untuk disewakan" terklasifikasi 'rumah'
 * (RUMAH_TINGGAL), padahal deskripsinya mendukung hospitality
 * (multi-unit + disewakan). Penyebab: regex hotel di
 * universalTaxonomy.ts:91 hanya cocok pada "boutique villa" (boutique
 * SEBELUM villa); urutan kata-benda-dulu "villa boutique" — urutan
 * yang natural dalam Bahasa Indonesia — tidak cocok, dan tidak ada
 * sinyal hospitality dari "beberapa unit" / "disewakan". Kontrol
 * "Boutique villa dengan beberapa unit untuk disewakan" (urutan
 * dibalik) LULUS sebagai hotel — membuktikan celahnya murni urutan
 * frasa + tidak adanya sinyal sewa/multi-unit. Perbaikan (di luar
 * kepemilikan Worker E — JANGAN perbaiki di sini): perluasan regex
 * hotel dan/atau sinyal "unit + disewakan" di universalTaxonomy.ts.
 * Varian sibling yang ikut gagal (dilaporkan, tidak di-cek di sini
 * agar permukaan gagal tetap satu cek): "Villa boutique resort 8 unit
 * untuk disewakan" -> 'rumah' juga.
 *
 * CATATAN: "Boutique villa ..." (kontrol §3) primernya hotel tetapi
 * isMulti=true + sekunder 'rumah' — frasa itu juga cocok dengan def
 * 'rumah' (lookahead-nya hanya mengecualikan "villa resort", bukan
 * "villa dengan ..."). Hanya "villa resort"/"resort villa" yang
 * menekan cocok-rumah sepenuhnya (isMulti=false). Itu perilaku yang
 * sudah ada, bukan bagian dari direktif ini — dicatat, tidak di-pin
 * sebagai gagal.
 *
 * Jalankan: npx --yes tsx src/test/aiWorkflowHardeningVilla.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import { extractUniversalContext } from '../ai-tools/ezrab-ai/universalIntake';
import { classifyUniversal } from '../ai-tools/ezrab-ai/universalTaxonomy';
import { buildUniversalDraft } from '../ai-tools/ezrab-ai/universalRab';
import { RabTemplateService } from '../services/rabTemplateService';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const primaryOf = (text: string) => extractUniversalContext(text).primary?.id ?? null;
const catalogOf = (text: string) => extractUniversalContext(text).primary?.catalog ?? [];
const isMultiOf = (text: string) => extractUniversalContext(text).isMulti;

// §0 — Jangkar T28 WaveB (verbatim): villa telanjang = rumah tinggal,
// bukan hotel; kedua kendala tapak tercatat. Ekspektasi 'rumah' + komentar
// penjelasnya dipertahankan di chatConvAcceptanceWaveB.test.ts T28.
console.log('§0 Jangkar T28 WaveB (verbatim)');
{
  const text = 'Saya ingin membangun villa di daerah berbukit dengan akses jalan terbatas.';
  const ext = extractUniversalContext(text);
  check('T28 primary = rumah (bukan hotel)', ext.primary?.id === 'rumah', `actual=${ext.primary?.id}`);
  check('T28 kendala tapak tercatat', ext.siteConditions.includes('akses terbatas') && ext.siteConditions.includes('lahan berbukit'), `siteConditions=${JSON.stringify(ext.siteConditions)}`);
}

// §1 — Kasus direktif 1: villa pribadi -> rumah tinggal.
console.log('§1 Kasus 1 — villa pribadi 2 lantai di Bali');
{
  const text = 'Villa pribadi 2 lantai di Bali';
  check('K1 primary = rumah', primaryOf(text) === 'rumah', `actual=${primaryOf(text)}`);
  check('K1 katalog = RUMAH_TINGGAL', catalogOf(text).includes('RUMAH_TINGGAL'), `actual=${JSON.stringify(catalogOf(text))}`);
  check('K1 classifyUniversal sepakat', classifyUniversal(text).primary?.id === 'rumah', `actual=${classifyUniversal(text).primary?.id}`);
  check('K1 bukan multi-disiplin', isMultiOf(text) === false, `actual=${isMultiOf(text)}`);
}

// §1 — Kasus direktif 2: "rumah villa" untuk keluarga -> rumah tinggal.
console.log('§1 Kasus 2 — rumah villa untuk keluarga');
{
  const text = 'Rumah villa untuk keluarga';
  check('K2 primary = rumah', primaryOf(text) === 'rumah', `actual=${primaryOf(text)}`);
  check('K2 katalog = RUMAH_TINGGAL', catalogOf(text).includes('RUMAH_TINGGAL'), `actual=${JSON.stringify(catalogOf(text))}`);
  check('K2 bukan multi-disiplin', isMultiOf(text) === false, `actual=${isMultiOf(text)}`);
}

// §2 — Kasus direktif 3: resort villa 8 unit -> hospitality.
console.log('§2 Kasus 3 — resort villa 8 unit');
{
  const text = 'Resort villa 8 unit';
  check('K3 primary = hotel', primaryOf(text) === 'hotel', `actual=${primaryOf(text)}`);
  check('K3 katalog = HOTEL_HOSPITALITY', catalogOf(text).includes('HOTEL_HOSPITALITY'), `actual=${JSON.stringify(catalogOf(text))}`);
  check('K3 bukan multi-disiplin', isMultiOf(text) === false, `actual=${isMultiOf(text)}`);
}

// §3 — Kasus direktif 4: villa boutique multi-unit untuk disewakan.
// BLOKIR: cek pertama di bawah GAGAL pada HEAD saat ini (aktual 'rumah').
// JANGAN ubah ekspektasi ini menjadi 'rumah' — itu akan mem-pin bug
// sebagai perilaku benar. Perbaikan milik universalTaxonomy.ts:91.
console.log('§3 Kasus 4 — villa boutique multi-unit untuk disewakan [BLOKIR]');
{
  const text = 'Villa boutique dengan beberapa unit untuk disewakan';
  check('K4 [BLOKIR] primary = hotel', primaryOf(text) === 'hotel', `actual=${primaryOf(text)} (katalog=${JSON.stringify(catalogOf(text))}) — lihat komentar BLOKIR di header`);
  const ordered = 'Boutique villa dengan beberapa unit untuk disewakan';
  check('K4-kontrol frasa berurutan "boutique villa" = hotel', primaryOf(ordered) === 'hotel', `actual=${primaryOf(ordered)}`);
  check('K4-kontrol "villa resort" = hotel', primaryOf('Bangun villa resort di Bali') === 'hotel', `actual=${primaryOf('Bangun villa resort di Bali')}`);
}

// §4 — Kasus direktif 5: klasifikasi rumah yang sudah ada tidak berubah.
console.log('§4 Kasus 5 — rumah yang sudah ada tidak berubah');
{
  check('K5 "Buatkan RAB rumah 2 lantai 120 m2" = rumah', primaryOf('Buatkan RAB rumah 2 lantai 120 m2') === 'rumah', `actual=${primaryOf('Buatkan RAB rumah 2 lantai 120 m2')}`);
  check('K5 katalog rumah = RUMAH_TINGGAL', catalogOf('Buatkan RAB rumah 2 lantai 120 m2').includes('RUMAH_TINGGAL'));
  check('K5 "Rumah tinggal 2 lantai untuk keluarga" = rumah', primaryOf('Rumah tinggal 2 lantai untuk keluarga') === 'rumah', `actual=${primaryOf('Rumah tinggal 2 lantai untuk keluarga')}`);
}

// §4 — Kasus direktif 6: klasifikasi hotel yang sudah ada tidak berubah.
console.log('§4 Kasus 6 — hotel yang sudah ada tidak berubah');
{
  check('K6 "Buatkan RAB hotel 5 lantai 2000 m2" = hotel', primaryOf('Buatkan RAB hotel 5 lantai 2000 m2') === 'hotel', `actual=${primaryOf('Buatkan RAB hotel 5 lantai 2000 m2')}`);
  check('K6 katalog hotel = HOTEL_HOSPITALITY', catalogOf('Buatkan RAB hotel 5 lantai 2000 m2').includes('HOTEL_HOSPITALITY'));
  check('K6 "Hotel bintang 4 di Jakarta" = hotel', primaryOf('Hotel bintang 4 di Jakarta') === 'hotel', `actual=${primaryOf('Hotel bintang 4 di Jakarta')}`);
}

// §5 — Bukti end-to-end lewat jalur draft nyata (buildUniversalDraft):
// template yang diambil membuktikan pemetaan katalog, bukan hanya label.
console.log('§5 Bukti draft — template yang diambil per klasifikasi');
{
  const svc = RabTemplateService.getInstance();
  const priv = buildUniversalDraft('Villa pribadi 2 lantai di Bali luas bangunan 180 m2') as any;
  check('E2E villa pribadi = draft', priv.kind === 'draft', `kind=${priv.kind}`);
  const privTpl = priv.kind === 'draft' ? (priv.draft.parts?.[0]?.templateId ?? priv.draft.parts?.[0]?.template?.id) : null;
  check('E2E villa pribadi -> HOUSE-VILLA-MODERN', privTpl === 'HOUSE-VILLA-MODERN', `actual=${privTpl}`);
  check('E2E HOUSE-VILLA-MODERN kategori RUMAH_TINGGAL', svc.getTemplateById('HOUSE-VILLA-MODERN')?.category === 'RUMAH_TINGGAL', `actual=${svc.getTemplateById('HOUSE-VILLA-MODERN')?.category}`);
  const resort = buildUniversalDraft('Resort villa 8 unit luas per unit 65 m2') as any;
  check('E2E resort villa 8 unit = draft', resort.kind === 'draft', `kind=${resort.kind}`);
  const resortTpl = resort.kind === 'draft' ? (resort.draft.parts?.[0]?.templateId ?? resort.draft.parts?.[0]?.template?.id) : null;
  check('E2E resort villa 8 unit -> BLD-BOUTIQUE-VILLA', resortTpl === 'BLD-BOUTIQUE-VILLA', `actual=${resortTpl}`);
  check('E2E BLD-BOUTIQUE-VILLA kategori HOTEL_HOSPITALITY', svc.getTemplateById('BLD-BOUTIQUE-VILLA')?.category === 'HOTEL_HOSPITALITY', `actual=${svc.getTemplateById('BLD-BOUTIQUE-VILLA')?.category}`);
}

console.log(`\nVilla classification: ${passed} passed, ${failed} failed${failed ? ` — FAILURES: ${failures.join(', ')}` : ''}`);
if (failed) {
  console.log(`BLOKIR: ${failed} cek gagal — kasus direktif 4 (K4) adalah blokir yang diketahui (lihat header). Perbaikan di universalTaxonomy.ts, di luar kepemilikan file ini.`);
  process.exitCode = 1;
}
