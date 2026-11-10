/**
 * Fit Satu Viewport DED + Dokumen AI — penjaga pola (owner 2026-11-10
 * 19:15: "saya tu pengen 1 tampilan ini muat 1 menu. bukan kepotong
 * begini. coba kompress aja menu yang tidak dibutuhkan banget" +
 * "begitu juga dengan dokumen ai").
 *
 * Memeriksa secara statis kontrak KOMPRESI keadaan awal pada layar
 * pendek (max-height: 880px — mencakup laptop 1366×768 & 1600×864):
 *  1. Shell: blok max-height di feature-page-shell.css — header ramping
 *     (ikon 34px, subjudul sembunyi), stepper ramping (nomor 20px),
 *     padding konten & bar aksi padat; cangkang tetap terkunci
 *     (height: 100%, halaman tidak scroll).
 *  2. DED: blok max-height di dedAi.css — dropzone 16px, kartu 14px,
 *     panel dipadatkan (padding 12px, seksi 9px), peringatan kompak
 *     (padding 8px, font 11.5px), textarea 52px, baris konfigurasi
 *     analisis redesign kompak; panel 404px pada layar lebar (blok
 *     min-width 1281px, mockup D6); kaki panel tetap flex 0 0 auto
 *     (CTA menempel & selalu terlihat).
 *  3. Teks: status stepper dipersingkat; disclaimer Full AI DIPADATKAN
 *     tetapi makna hukumnya utuh (bukan harga resmi AHSP; validasi
 *     sebelum pengadaan/tender/kontrak); notice Database utuh.
 *  4. Dokumen AI: blok max-height di document-ai.css — kartu awal 16px,
 *     kepala halaman padat, area instruksi 78px, petunjuk ganda sembunyi.
 *
 * Batas jujur: pemeriksaan ini statis (kontrak CSS/teks). Bukti visual
 * keadaan awal di dalam workspace tidak dapat diambil dari sandbox
 * (PasscodeGate fail-closed) — verifikasi visual final di perangkat owner.
 *
 * Run (repo): npx --yes tsx src/test/dedDocViewportFit.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const read = (rel: string): string => readFileSync(join(repo, rel), 'utf8');

const fpCss = read('src/components/feature-shell/feature-page-shell.css');
const dedCss = read('src/ai-tools/ded-ai-estimate/dedAi.css');
const docCss = read('src/ai-tools/document-ai/document-ai.css');
const dedView = read('src/ai-tools/ded-ai-estimate/view.tsx');
const dedInput = read('src/ai-tools/ded-ai-estimate/DedAiInputView.tsx');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ GAGAL: ${name}`); }
};

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

/* 1 — Shell kompak ---------------------------------------------------------- */
const fpH = fpCss.indexOf('@media (max-height: 880px)');
check('shell punya blok max-height 880px', fpH > 0);
check('shell terkunci: .fp-shell height 100%', ruleBody(fpCss, '.fp-shell').includes('height: 100%'));
check('header kompak: padding 8px 22px 4px', ruleBody(fpCss, '.fp-head', fpH).includes('padding: 8px 22px 4px'));
check('header kompak: ikon 34px', ruleBody(fpCss, '.fp-feat-ico', fpH).includes('width: 34px'));
check('header kompak: subjudul disembunyikan', ruleBody(fpCss, '.fp-sub', fpH).includes('display: none'));
check('stepper kompak: padding 5px 12px', ruleBody(fpCss, '.fp-stepper', fpH).includes('padding: 5px 12px'));
check('stepper kompak: nomor langkah 20px', ruleBody(fpCss, '.fp-step-n', fpH).includes('width: 20px'));
check('konten kompak: padding 8px 22px 10px', ruleBody(fpCss, '.fp-content', fpH).includes('padding: 8px 22px 10px'));

/* 2 — DED kompak ------------------------------------------------------------ */
const dedH = dedCss.indexOf('@media (max-height: 880px)');
check('dedAi.css punya blok max-height 880px', dedH > 0);
check('dropzone kompak: padding 16px', ruleBody(dedCss, '.dedai-input-main .dedai-drop', dedH).includes('padding: 16px'));
check('kartu kompak: padding 14px 16px', ruleBody(dedCss, '.fp-shell .dedai-card', dedH).includes('padding: 14px 16px'));
check('peringatan kompak: padding 8px + font 11.5px',
  ruleBody(dedCss, '.dedai-notice', dedH).includes('padding: 8px 10px') &&
  ruleBody(dedCss, '.dedai-notice', dedH).includes('font-size: 11.5px'));
check('panel kompak: scroll padding 12px', ruleBody(dedCss, '.dedai-settings-scroll', dedH).includes('padding: 12px 14px 2px'));
check('seksi panel kompak: padding 9px 0 10px', ruleBody(dedCss, '.dedai-set-sec', dedH).includes('padding: 9px 0 10px'));
check('textarea deskripsi kompak: min-height 52px', dedCss.slice(dedH).includes('.dedai-field textarea { min-height: 52px'));
check('baris konfigurasi kompak terpasang', ruleBody(dedCss, '.dedai-cfgrow', dedH).includes('padding: 4px 0'));
const dedWide = dedCss.indexOf('@media (min-width: 1281px)');
check('panel 404px di layar lebar (mockup D6)',
  dedWide > 0 && ruleBody(dedCss, '.dedai-input-layout', dedWide).includes('404px'));
check('kaki panel pinned: flex 0 0 auto (CTA selalu terlihat)',
  ruleBody(dedCss, '.dedai-settings-foot').includes('flex: 0 0 auto'));
check('baris konfigurasi analisis terpasang di TSX (Mode/Kompleksitas/Cakupan)',
  dedInput.includes('dedai-cfgrow') && dedInput.includes('dedai-cfglbl') && dedInput.includes('Cakupan'));

/* 3 — Teks dipersingkat, makna utuh ------------------------------------------ */
check('status stepper dipersingkat', dedView.includes("'Langkah 1 dari 3'") && !dedView.includes('belum ada proses yang berjalan'));
check('disclaimer Full AI: makna hukum utuh',
  dedInput.includes('bukan harga resmi AHSP') && dedInput.includes('pengadaan, tender, atau kontrak'));
check('notice Database: makna utuh',
  dedInput.includes('Hanya harga terverifikasi / input pengguna') && dedInput.includes('tidak mengkueri master AHSP'));
check('sub kebijakan dipadatkan', dedInput.includes('dikunci ke hasil estimasi dan ditegakkan di service, bukan sekadar tampilan'));

/* 4 — Dokumen AI kompak ------------------------------------------------------- */
const docH = docCss.indexOf('@media (max-height: 880px)');
check('document-ai.css punya blok max-height 880px', docH > 0);
check('kartu awal kompak: padding 16px 20px', ruleBody(docCss, '.docai-edempty', docH).includes('padding: 16px 20px'));
check('kepala halaman kompak: margin 8px', ruleBody(docCss, '.docai-pagehead', docH).includes('margin-bottom: 8px'));
check('petunjuk ganda di kepala halaman disembunyikan', ruleBody(docCss, '.docai-pagehead .docai-hint', docH).includes('display: none'));
check('area instruksi kompak: height 78px', ruleBody(docCss, '.docai-edform .docai-textarea', docH).includes('height: 78px'));
check('tab kompak: margin-bottom 10px', ruleBody(docCss, '.docai-tabs', docH).includes('margin-bottom: 10px'));

console.log(`\ndedDocViewportFit: ${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);
