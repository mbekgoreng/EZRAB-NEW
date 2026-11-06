/**
 * Test regresi AI Intelligence Overhaul (2026-11-06) — skenario wajib
 * prompt §4 + §12: percakapan rumah bertahap, koreksi luas, finalisasi
 * "itu aja" menjadi draft RAB nyata, dan integritas angka builder.
 * Dijalankan via tsx (pola tes rumah repo).
 */
import { extractRabNeeds, emptyRabNeeds, missingNeeds } from '../ai-tools/ezrab-ai/rabNeeds';
import {
  executeIntent,
  continueRabNeeds,
  continueRabFinalize,
  isRabFinalizeText,
  hasActiveRabNeeds,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { buildSpecRabFromNeeds, parseFreeSpec } from '../ai-tools/ezrab-ai/specRab';
import { formatDirectRabMessage } from '../ai-tools/ezrab-ai/directRab';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}`); }
}

const ctx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
} as never;
const ctxWith = (rawText: string) => ({ ...(ctx as unknown as object), rawText }) as never;

console.log('== Ekstraksi bertahap (skenario wajib §4) ==');
let n = emptyRabNeeds();
n = extractRabNeeds('buatkan RAB rumah tinggal', n);
check('jenis rumah terbaca', n.kind === 'rumah');
n = extractRabNeeds('2 lantai, 6x15, 3 kamar tidur, 2 kamar mandi, ada carport', n);
check('lantai 2', n.floors === 2);
check('dimensi lahan 6x15', n.landLength === 6 && n.landWidth === 15);
check('luas lahan turunan 90 m²', (n.landLength ?? 0) * (n.landWidth ?? 0) === 90);
check('kamar tidur 3', n.bedrooms === 3);
check('kamar mandi 2', n.bathrooms === 2);
check('carport ada', n.carport === true);
check('luas bangunan belum ada (tidak dikarang)', n.buildingArea === null);
n = extractRabNeeds('luas 100m2', n);
check('luas bangunan 100', n.buildingArea === 100);
check('kolom lain utuh setelah koreksi parsial', n.floors === 2 && n.bedrooms === 3 && n.carport === true);
n = extractRabNeeds('2 lantai, 6x15, 3 kamar tidur, 2 kamar mandi, ada carport, luas 120m2', n);
check('koreksi terakhir menang: luas 120', n.buildingArea === 120);
check('lahan tetap 90 (bukan konflik, tidak ditimpa)', (n.landLength ?? 0) * (n.landWidth ?? 0) === 90);

console.log('== Alokasi tapak & builder dari kebutuhan ==');
const spec = parseFreeSpec('buatkan rab rumah 2 lantai, 6x15, 3 kamar tidur, 2 kamar mandi, ada carport, luas 120m2');
check('parseFreeSpec: total 120', spec?.totalArea === 120);
check('parseFreeSpec: tapak alokasi awal 60 (120 ÷ 2 lantai)', spec?.footprintArea === 60);
const built = buildSpecRabFromNeeds(n);
check('buildSpecRabFromNeeds menghasilkan draft', built !== null);
check('draft: 2 lantai, total 120 m²', built?.floors === 2 && built?.totalArea === 120);
check('draft: item lintas divisi (> 10 item, > 3 kelompok)', (built?.calc.items.length ?? 0) > 10 &&
  new Set((built?.calc.items ?? []).map((i) => i.category)).size > 3);
const unpriced = (built?.calc.items ?? []).filter((i) => !(typeof i.unitPrice === 'number' && i.unitPrice > 0));
check('harga item hanya: > 0 (berharga) atau null/0 (tak berharga)', (built?.calc.items ?? []).every((i) => i.unitPrice === null || i.unitPrice === undefined || i.unitPrice === 0 || i.unitPrice > 0));
if (built && unpriced.length > 0) {
  const msg = formatDirectRabMessage(built);
  check('item tak berharga tampil "Harga belum tersedia"', msg.includes('Harga belum tersedia'));
  check('total berlabel PARSIAL bila ada item tak berharga', msg.includes('PARSIAL'));
  check('tidak ada sel harga "Rp0" di tabel', !/\|\s*Rp0\s*\|/.test(msg));
}

console.log('== Kebutuhan inti vs opsional ==');
const noBed = extractRabNeeds('buatkan rab rumah 2 lantai luas 100 m2');
check('tanpa kamar tidur TIDAK tercatat kekurangan inti', !missingNeeds(noBed).some((m) => /kamar tidur/i.test(m)));
const noArea = extractRabNeeds('buatkan rab rumah 2 lantai');
check('tanpa luas/dimensi tercatat kekurangan inti', missingNeeds(noArea).length > 0);

console.log('== Finalisasi percakapan ==');
check('"itu aja" dikenali sebagai finalisasi', isRabFinalizeText('itu aja'));
check('"sudah cukup" dikenali', isRabFinalizeText('sudah cukup'));
check('kalimat biasa BUKAN finalisasi', !isRabFinalizeText('berapa harga semen sekarang'));
check('perintah baru BUKAN finalisasi', !isRabFinalizeText('buatkan rab jalan 1 km'));
console.log('== Afirmasi tunggal = eksekusi (aturan owner 2026-11-06) ==');
check('"oke" adalah konfirmasi', isRabFinalizeText('oke'));
check('"iya" adalah konfirmasi', isRabFinalizeText('iya'));
check('"ya" adalah konfirmasi', isRabFinalizeText('ya'));
check('"siap" adalah konfirmasi', isRabFinalizeText('siap'));
check('"Oke." (dengan titik) adalah konfirmasi', isRabFinalizeText('Oke.'));
check('"oke siap" adalah konfirmasi', isRabFinalizeText('oke siap'));
check('kalimat tanya berawalan iya BUKAN konfirmasi', !isRabFinalizeText('iya, berapa harga semen?'));
check('"baiklah kita bahas harga dulu" BUKAN konfirmasi', !isRabFinalizeText('baiklah kita bahas harga dulu'));

executeIntent('CREATE_RAB_SUMMARY', undefined, ctxWith('buatkan RAB rumah tinggal'));
check('sesi kebutuhan aktif setelah ringkasan pertama', hasActiveRabNeeds());
const refine = continueRabNeeds('2 lantai, 6x15, 3 kamar tidur, 2 kamar mandi, ada carport');
check('refinement: balasan ringkas (tanpa ringkasan penuh berulang)', !refine.message.includes('ringkasan kebutuhan yang saya tangkap'));
check('refinement menyebut kolom yang diperbarui', refine.message.includes('Kamar tidur: 3'));
continueRabNeeds('luas 100m2');
continueRabNeeds('2 lantai, 6x15, 3 kamar tidur, 2 kamar mandi, ada carport, luas 120m2');
const fin = continueRabFinalize('itu aja');
check('finalisasi menghasilkan hasil (bukan null)', fin !== null);
check('finalisasi ok', fin?.ok === true);
check('finalisasi = draft nyata (ada total)', /Total/.test(fin?.message ?? ''));
check('finalisasi menyebut luas final 120 m²', (fin?.message ?? '').includes('120'));
check('finalisasi membawa tombol Push ke Spreadsheet', (fin?.actions ?? []).some((a) => a.action.kind === 'push-rab'));
check('finalisasi lokal: tanpa fullAiPrompt (tanpa kredit LLM)', !fin?.fullAiPrompt);

console.log('== Finalisasi tanpa data inti: blokir jujur ==');
executeIntent('CREATE_RAB_SUMMARY', undefined, ctxWith('buatkan rab rumah 2 lantai, 3 kamar tidur'));
const blocked = continueRabFinalize('itu aja');
check('hasil tetap diberikan (bukan null)', blocked !== null);
check('TIDAK mengarang draft: tanpa tombol push-rab', !(blocked?.actions ?? []).some((a) => a.action.kind === 'push-rab'));
check('meminta data inti luas/dimensi', /luas bangunan|ukuran/i.test(blocked?.message ?? ''));
check('status menunggu kebutuhan disetel', blocked?.awaitRabNeeds === true);

console.log('== Finalisasi data inti minimal (opsional kosong) ==');
executeIntent('CREATE_RAB_SUMMARY', undefined, ctxWith('buatkan rab rumah'));
continueRabNeeds('1 lantai, luas 45 m2');
const finMin = continueRabFinalize('itu aja');
check('draft tetap tersusun dari data inti saja', finMin !== null && /Total/.test(finMin.message) &&
  (finMin.actions ?? []).some((a) => a.action.kind === 'push-rab'));

console.log('== "oke" mengeksekusi draft (bukan jawaban lain) ==');
executeIntent('CREATE_RAB_SUMMARY', undefined, ctxWith('buatkan RAB rumah tinggal'));
continueRabNeeds('2 lantai, 6x15, 3 kamar tidur, 2 kamar mandi, ada carport, luas 120m2');
const finOke = continueRabFinalize('oke');
check('"oke" menghasilkan draft nyata', finOke !== null && /Total/.test(finOke.message) &&
  (finOke.actions ?? []).some((a) => a.action.kind === 'push-rab'));
const finIya = continueRabFinalize('iya');
check('"iya" pada sesi yang sama juga mengeksekusi (draft konsisten)', finIya !== null && /Total/.test(finIya.message));

console.log(`\nTOTAL: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
