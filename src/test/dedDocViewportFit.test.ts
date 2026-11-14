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
 *     PERBAIKAN F (2026-11-14): seksi Kebijakan Harga dihapus program
 *     Dual Mode (W2 G-UI-1) — kedua catatan keterbukaan pindah ke
 *     `DED_MODE_CARDS[].note` di dedModeUi.ts dan tetap dirender
 *     InputView via `{card.note}`. Redaksi kartu EZRAB BUKAN sekadar
 *     pindahan: dua frasa notice lama ("Hanya harga terverifikasi /
 *     input pengguna", "tidak mengkueri master AHSP") sudah TIDAK
 *     BENAR sejak keputusan owner 2026-10-27 (f68030f: DATABASE memakai
 *     estimasi AI sebagai fallback berlabel bila kanonis gagal, dan
 *     mencoba AHSP kanonis dulu lewat adapter ded-canonical) — teks
 *     notice lama tidak pernah diperbarui sesudah keputusan itu, jadi
 *     mengembalikannya berarti mengembalikan klaim yang salah. Pin
 *     di bawah mematok redaksi baru yang faktual + rendernya.
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
// PERBAIKAN F: catatan keterbukaan harga kini hidup di kartu mode
// (dedModeUi.ts, W2 G-UI-1), bukan inline di InputView; gerbang
// kebijakan harga hidup di service layer (pricing.ts).
const modeCards = read('src/ai-tools/ded-ai-estimate/dedModeUi.ts');
const dedPricing = read('src/ai-tools/ded-ai-estimate/pricing.ts');

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
// PERBAIKAN F (F-1): pin lama mematok disclaimer di InputView inline —
// teks itu pindah ke kartu FULL_AI (dedModeUi.ts) oleh W2 G-UI-1, isi
// hukumnya utuh (sama seperti E-2 di dedPremiumOneScreen). Cek baru:
// 2 frasa di sumbernya + 2 penanda render di InputView (LEBIH KUAT
// dari pin lama: gagal bila disclaimer dihapus, kalimat validasinya
// dipotong, ATAU InputView berhenti merender catatan kartu).
check('disclaimer Full AI: makna hukum utuh (di kartu Full AI, dirender InputView)',
  modeCards.includes('bukan harga resmi AHSP') && modeCards.includes('pengadaan, tender, atau kontrak')
  && dedInput.includes('dedai-modecard-note') && dedInput.includes('{card.note}'));
// PERBAIKAN F (F-2): pin lama mematok dua frasa notice Database yang
// TIDAK LAGI BENAR sejak keputusan owner 2026-10-27 (f68030f):
// "Estimasi harga AI ditolak" dibatalkan — DATABASE memakai estimasi AI
// sebagai fallback berlabel bila kanonis gagal (dipin
// dedEstimationPolicy 2.1 + pricing.ts); "tidak mengkueri master AHSP"
// dibatalkan — DATABASE mencoba AHSP kanonis DULU lewat adapter
// ded-canonical (service.ts:242-246, canonicalDedPricing +
// officialAhspRepository). Teks notice lama tidak pernah diperbarui
// sesudah f68030f, jadi mengembalikan kedua frasa itu berarti
// mengembalikan klaim yang salah ke user. Setiap klaim BENAR dari
// notice lama bertahan di catatan kartu EZRAB (item tanpa harga
// terverifikasi tetap belum tersedia; total bisa parsial; dilengkapi
// lewat AHSP picker sesudah push ke spreadsheet) + koreksi faktualnya
// (harga mengacu database AHSP EZRAB). Cek baru mematok redaksi baru
// yang faktual (4 frasa di sumbernya + 2 penanda render) — LEBIH KUAT
// dari pin lama (2 substring di 1 berkas).
check('notice Database: makna utuh (di kartu EZRAB, dirender InputView)',
  modeCards.includes('Harga mengacu pada database AHSP EZRAB')
  && modeCards.includes('item tanpa harga terverifikasi tetap belum tersedia')
  && modeCards.includes('total bisa parsial')
  && modeCards.includes('AHSP picker')
  && dedInput.includes('dedai-modecard-note') && dedInput.includes('{card.note}'));
// PERBAIKAN F (F-3): pin lama mematok sub-teks seksi Kebijakan Harga
// ("dikunci ke hasil estimasi dan ditegakkan di service...") yang
// dihapus beserta seksinya oleh W2 G-UI-1 — tidak ada lagi pemilih
// kebijakan di UI (pemilih mode legacy DILARANG dikembalikan; policy
// kini DITURUNKAN dari kartu mode). Substansinya — kebijakan ditegakkan
// di service layer, bukan sekadar tampilan — tetap benar dan kini
// dipin di lapisan tempat ia hidup: gerbang service (pricing.ts,
// "service layer, bukan instruksi UI", bercabang pada DATABASE) +
// turunan policy dari mode (dedModeUi.ts `policyForMode(mode)`) +
// InputView menerapkannya saat Mulai (`withDedMode(`). 4 syarat di
// 3 berkas — LEBIH KUAT dari pin lama (1 substring klaim tampilan).
check('kebijakan harga ditegakkan di service, bukan sekadar tampilan (diturunkan dari kartu mode)',
  dedPricing.includes('service layer, bukan instruksi UI')
  && dedPricing.includes("if (effective === 'DATABASE')")
  && modeCards.includes('policy: policyForMode(mode)')
  && dedInput.includes('withDedMode('));

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
