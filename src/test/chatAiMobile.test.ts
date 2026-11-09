/**
 * Chat AI Mobile R29 — penjaga pola header dua baris + composer.
 *
 * Perintah owner 2026-11-09 dari screenshot HP (Preview terbaru): header
 * chat masih sesak (nama terpotong "Ezr…") walau R27 sudah memadatkan,
 * placeholder composer menggantung terpotong, dan disclaimer masih
 * mengandung emoji. Pemeriksaan statis pola baca-file:
 *  - blok R29 ada di workspace-mobile-fixes.css (di dalam @media ≤767px)
 *    dengan kontrak: header flex-wrap, .ezchat2-actions display:contents,
 *    order baris 1 (maskot 1, judul 2, pil kredit 3, kebab 4) dan baris 2
 *    (pemilih mode 5, tombol Baru 6), target sentuh ≥36px;
 *  - composer: pill align-items center + min-height, textarea line-height
 *    1,35 + min-height dua baris agar placeholder tidak terpotong;
 *  - keadaan kosong: padding atas + sub-judul max-width;
 *  - string disclaimer di view.tsx TANPA emoji.
 *
 * Run (repo): npx --yes tsx src/test/chatAiMobile.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const read = (rel: string): string => readFileSync(join(repo, rel), 'utf8');

const fixes = read('src/styles/workspace-mobile-fixes.css');
const view = read('src/ai-tools/ezrab-ai/view.tsx');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ GAGAL: ${name}`); }
};

/* Badan aturan CSS untuk selektor (pola sama dengan mobileOverhaul.test):
   kemunculan selektor harus diikuti pemisah selektor yang sah. */
const ruleBody = (cssText: string, selector: string, fromIndex = 0): string => {
  let i = cssText.indexOf(selector, fromIndex);
  while (i >= 0) {
    const after = cssText.charAt(i + selector.length);
    if (after === '' || /[\s{,.:#[>+~]/.test(after)) {
      const open = cssText.indexOf('{', i);
      if (open < 0) return '';
      const close = cssText.indexOf('}', open);
      return cssText.slice(open + 1, close);
    }
    i = cssText.indexOf(selector, i + 1);
  }
  return '';
};

/* Blok R29 = bagian sesudah penanda R29. Pencarian aturan dimulai dari
   @media yang mengikuti penanda (bukan dari penanda itu sendiri) karena
   komentar R29 menyebut beberapa selektor dalam bentuk prosa. */
const r29Idx = fixes.indexOf('R29. Chat AI mobile');
check('blok R29 ada di workspace-mobile-fixes.css', r29Idx > 0);
const r29MediaIdx = fixes.indexOf('@media (max-width: 767px)', r29Idx);
check('blok R29 berada di dalam @media (max-width: 767px)', r29MediaIdx > r29Idx);
const fx = (sel: string): string => ruleBody(fixes, sel, r29MediaIdx);

/* --- Header dua baris ------------------------------------------------------ */
check('R29: header membungkus dua baris (flex-wrap wrap)', /flex-wrap:\s*wrap/.test(fx('.ezchat2-header')));
check('R29: header row-gap 8px antarbaris', /row-gap:\s*8px/.test(fx('.ezchat2-header')));
check('R29: .ezchat2-actions display contents (anak jadi item flex header)', /display:\s*contents/.test(fx('.ezchat2-actions')));
check('R29: maskot order 1 (baris 1)', /order:\s*1/.test(fx('.ezchat2-mascot')));
check('R29: judul order 2 + flex 1 1 auto (ruang penuh baris 1)', /order:\s*2/.test(fx('.ezchat2-title')) && /flex:\s*1 1 auto/.test(fx('.ezchat2-title')));
check('R29: judul min-width 0 (ellipsis wajar, bukan tumpang tindih)', /min-width:\s*0/.test(fx('.ezchat2-title')));
check('R29: nama chat 15px di baris 1', /font-size:\s*15px/.test(fx('.ezchat2-name')));
check('R29: pil kredit order 3 (baris 1)', /order:\s*3/.test(fx('.ezchat2-actions .aic-balance')));
check('R29: menuwrap kebab order 4 (baris 1)', /order:\s*4/.test(fx('.ezchat2-menuwrap')));
check('R29: pemilih mode order 5 (baris 2)', /order:\s*5/.test(fx('.ezchat2-modesel')));
check('R29: tombol Baru order 6 (baris 2)', /order:\s*6/.test(fx('.ezchat2-new')));

/* --- Target sentuh ≥36px ---------------------------------------------------- */
check('R29: pil kredit target 36px', /height:\s*36px/.test(fx('.ezchat2-actions .aic-balance.compact')));
check('R29: tombol kebab target 36px', /width:\s*36px/.test(fx('.ezchat2-menubtn')) && /height:\s*36px/.test(fx('.ezchat2-menubtn')));
check('R29: pemilih mode min-height 36px', /min-height:\s*36px/.test(fx('.ezchat2-modesel')));
check('R29: tombol Baru min-height 36px', /min-height:\s*36px/.test(fx('.ezchat2-new')));

/* --- Composer ---------------------------------------------------------------- */
check('R29: pill composer align-items center', /align-items:\s*center/.test(fx('.ezchat2-pill')));
check('R29: pill composer min-height 56px', /min-height:\s*56px/.test(fx('.ezchat2-pill')));
check('R29: textarea line-height 1,35', /line-height:\s*1\.35/.test(fx('.ezchat2-pill textarea')));
check('R29: textarea min-height 40px (dua baris — placeholder utuh)', /min-height:\s*40px/.test(fx('.ezchat2-pill textarea')));
check('R29: tombol mic target 40px', /width:\s*40px/.test(fx('.ezchat2-tool')) && /height:\s*40px/.test(fx('.ezchat2-tool')));
check('R29: tombol kirim target 42px', /width:\s*42px/.test(fx('.ezchat2-send')) && /height:\s*42px/.test(fx('.ezchat2-send')));

/* --- Keadaan kosong ------------------------------------------------------------ */
check('R29: empty-state padding atas 28px (jarak dari header dua baris)', /padding-top:\s*28px/.test(fx('.ezchat2-empty')));
check('R29: sub-judul empty-state max-width 36ch', /max-width:\s*36ch/.test(fx('.ezchat2-sub')));

/* --- Disclaimer tanpa emoji ------------------------------------------------------ */
check('disclaimer chat tampil tanpa emoji (teks persis)', view.includes('Ezrab AI bisa salah, cek ulang angka penting') && !/cek ulang angka penting\s*😉/.test(view) && !/cek ulang angka penting\s*😊/.test(view));
check('string disclaimer lama ber-emoji sudah hilang dari view chat', !view.includes('angka penting 😉') && !view.includes('angka penting 😊'));

console.log(`\nchatAiMobile: ${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);
