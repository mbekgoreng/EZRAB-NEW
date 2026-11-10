/**
 * Kalkulator Volume — penjaga pola FORMULIR HP (ACC owner 2026-11-09).
 *
 * Memeriksa secara statis kontrak perbaikan formulir pengisian versi
 * mobile pada QtoCalculatorView:
 *  1. Class penanda sel parameter, stepper, tip, kolom hasil, dan bar
 *     hasil menempel (stickybar) terpasang di TSX.
 *  2. Stepper − / + dirender dan memakai handleStepParam.
 *  3. Stickybar memakai handler yang sama persis dengan tombol kolom
 *     hasil: handleSaveToQTO (Simpan) & handleSyncToRAB (Ke RAB).
 *  4. Mengosongkan kotak TIDAK lagi memetakan ke 0: onChange input
 *     melewati handleParamTextChange yang hanya meneruskan angka ke
 *     handleInputChange bila teks sudah angka; keadaan belum lengkap
 *     (isParamTextIncomplete / hasIncompleteParams) menjaga
 *     isCalculationValid dan menampilkan "Perlu dilengkapi".
 *  5. CSS: stepper & stickybar display:none di luar media query
 *     (desktop tidak berubah); blok R10 (max-width: 767px) memuat
 *     kotak 48px / font 16px, deskripsi & tip disembunyikan, dan
 *     bar hasil DALAM ALUR (position static) di akhir workbench —
 *     diubah owner 2026-11-10 19:04 dari sticky karena versi menempel
 *     menutupi kolom formulir pada screenshot HP-nya.
 *
 * Run (repo): npx --yes tsx src/test/volcalcFormMobile.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const tsx = readFileSync(join(repo, 'src/components/qto/QtoCalculatorView.tsx'), 'utf8');
const css = readFileSync(join(repo, 'src/styles/workspace-mobile-fixes.css'), 'utf8');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ GAGAL: ${name}`); }
};

const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

/** Ekstrak badan aturan CSS untuk satu selektor, dicari mulai dari indeks tertentu. */
const ruleBodyFrom = (selector: string, fromIndex: number): string => {
  const i = css.indexOf(selector, fromIndex);
  if (i < 0) return '';
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
};

/* 1 — class penanda di TSX ------------------------------------------------ */
for (const cls of [
  'ezrab-param-cell',
  'ezrab-param-labelrow',
  'ezrab-param-desc',
  'ezrab-param-inputrow',
  'ezrab-param-input',
  'ezrab-eng-tip',
  'ezrab-result-col',
  'ezrab-result-stickybar',
]) {
  check(`class "${cls}" terpasang di QtoCalculatorView`, tsx.includes(`className="${cls}"`) || tsx.includes(cls));
}

/* 2 — stepper ------------------------------------------------------------- */
check(
  'stepper dirender dua tombol (kurang & tambah)',
  count(tsx, 'className="ezrab-param-stepper-btn"') >= 2,
);
check('handler handleStepParam terdefinisi', tsx.includes('const handleStepParam'));
check(
  'stepper memakai step parameter & clamp min/max',
  tsx.includes('const step = param.step || 0.1') && tsx.includes('Math.min(max, Math.max(min, base + dir * step))'),
);
check(
  'aria-label stepper jelas',
  tsx.includes('aria-label={`Kurangi ${param.label}`}') && tsx.includes('aria-label={`Tambah ${param.label}`}'),
);

/* 3 — stickybar memakai handler yang sama --------------------------------- */
check(
  'handleSaveToQTO dipakai tombol kolom hasil DAN stickybar (>= 2x)',
  count(tsx, 'onClick={handleSaveToQTO}') >= 2,
);
check(
  'handleSyncToRAB dipakai tombol kolom hasil DAN stickybar (>= 2x)',
  count(tsx, 'onClick={handleSyncToRAB}') >= 2,
);
check(
  'stickybar menampilkan label hasil utama kalkulator aktif',
  tsx.includes('ezrab-result-stickybar-label') && tsx.includes('{activeSpec.primaryQuantityLabel}'),
);

/* 4 — kosong tidak lagi menjadi 0 ------------------------------------------ */
check('state teks per parameter (inputText) ada', tsx.includes('const [inputText, setInputText]'));
check('handler teks handleParamTextChange terdefinisi', tsx.includes('const handleParamTextChange'));
check(
  'input memakai handleParamTextChange, bukan parseFloat langsung',
  tsx.includes('onChange={(e) => handleParamTextChange(param.id, e.target.value)}') &&
    !tsx.includes('onChange={(e) => handleInputChange(param.id, parseFloat(e.target.value))}'),
);
check(
  'angka efektif hanya diteruskan bila teks sudah angka',
  tsx.includes("raw.trim() !== '' && Number.isFinite(parsed)"),
);
check(
  'penanda belum lengkap: isParamTextIncomplete & hasIncompleteParams',
  tsx.includes('const isParamTextIncomplete') && tsx.includes('const hasIncompleteParams'),
);
check(
  'isCalculationValid menolak keadaan belum lengkap',
  tsx.includes('if (hasIncompleteParams) return false;'),
);
check(
  'kotak hasil menampilkan "Perlu dilengkapi" saat belum lengkap',
  tsx.includes("hasIncompleteParams ? 'Perlu dilengkapi' : formatNumberId(calculationResult.primaryQuantity, 2)"),
);
check(
  'teks tersinkron ulang saat inputs diganti dari luar (setInputText({}) >= 3x)',
  count(tsx, 'setInputText({})') >= 3,
);

/* 5 — CSS: dasar display:none + blok R10 ----------------------------------- */
const r10Marker = css.indexOf('R10. Formulir');
check('blok R10 ada di workspace-mobile-fixes.css', r10Marker > 0);
const r10MediaIdx = css.indexOf('@media (max-width: 767px)', r10Marker);
check('blok R10 berada di dalam media max-width 767px', r10MediaIdx > r10Marker);

const stepperBase = ruleBodyFrom('.ezrab-param-stepper-btn', 0);
check(
  'stepper display:none di luar media (desktop tidak berubah)',
  stepperBase.includes('display: none') && css.indexOf('.ezrab-param-stepper-btn') < r10Marker,
);
const stickyBase = ruleBodyFrom('.ezrab-result-stickybar', 0);
check(
  'stickybar display:none di luar media (desktop tidak berubah)',
  stickyBase.includes('display: none') && css.indexOf('.ezrab-result-stickybar') < r10Marker,
);

const inputBody = ruleBodyFrom('.ezrab-param-input {', r10MediaIdx);
check('kotak isian 48px di R10', inputBody.includes('height: 48px'));
check('kotak isian font 16px di R10', inputBody.includes('font-size: 16px'));

const stepperBody = ruleBodyFrom('.ezrab-param-stepper-btn', r10MediaIdx);
check(
  'stepper tampil inline-flex 40x48 di R10',
  stepperBody.includes('display: inline-flex') && stepperBody.includes('width: 40px') && stepperBody.includes('height: 48px'),
);

const stickyBody = ruleBodyFrom('.ezrab-result-stickybar', r10MediaIdx);
check(
  'bar hasil dalam alur (position static, tanpa bottom menempel — owner 2026-11-10)',
  stickyBody.includes('position: static') && !stickyBody.includes('position: sticky') && !stickyBody.includes('bottom:'),
);
check(
  'stickybar bergaya navy gradient seperti mockup',
  stickyBody.includes('linear-gradient(120deg, #0B2B57, #123E7D)'),
);

check(
  'deskripsi parameter disembunyikan di HP',
  ruleBodyFrom('.ezrab-param-desc', r10MediaIdx).includes('display: none'),
);
check(
  'tip "tekan Tab" disembunyikan di HP',
  ruleBodyFrom('.ezrab-eng-tip', r10MediaIdx).includes('display: none'),
);
check(
  'sel parameter menjadi baris (flex-direction row) di R10',
  ruleBodyFrom('.ezrab-param-cell', r10MediaIdx).includes('flex-direction: row'),
);

console.log(`\nvolcalcFormMobile: ${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);
