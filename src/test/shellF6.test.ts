/**
 * F6 REGRESSION TEST — shell, maskot kanonis, route publik, kejujuran label.
 *
 * Pemeriksaan SUMBER (readFileSync) + uji fungsi murni:
 *  1. Daftar sembunyi launcher mencakup 'ai-assistant' & 'ded-rab'.
 *  2. Maskot kanonis EZRABMascotLucu di semua permukaan yang diubah;
 *     tidak ada lagi EZRABMascot3D / GreetingMascot / mascot-ezrab-new.png.
 *  3. State sembunyi launcher tidak dipersistenkan ke localStorage.
 *  4. Footer: tidak ada tautan mati (#integrasi/#karier/#kontak/#panduan/
 *     #dukungan/#privacy/#terms sebagai jangkar) & tidak ada sosial generik;
 *     ada /privacy, /terms, FAQ → /fitur#faq, #fitur, #harga.
 *  5. App merutekan Privacy/Terms/AuthNotice/404 publik; file yatim terhapus.
 *  6. parseWorkspaceRoute: reports/ahsp → 'laporan' (bukan explorer);
 *     route ahsp proyek tetap 'ahsp-2026'.
 *  7. DemoModal: tanpa klaim "Demo Interaktif"; judul "Gambaran Fitur EZRAB".
 *  8. TopBar: indeks cari memuat kredit-ai & dokumen-tender; item
 *     "Hubungi Support Teknis" hilang; Panduan memicu ONBOARDING_OPEN_EVENT.
 *  9. getCurveSContext: data kosong → konteks jujur (null/NO_DATA, tanpa
 *     placeholder 45.5/42.6/12/5); data nyata → nilai terhitung.
 *
 * Jalankan: npx tsx src/test/shellF6.test.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

import { getCurveSContext } from '../services/aiContextService';
import { parseWorkspaceRoute } from '../routing/routes';
import type { KurvaSDataPoint } from '../types';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(name);
  }
}

/* ---------- 1. Daftar sembunyi launcher ---------- */
const workspaceView = read('components/dashboard/WorkspaceView.tsx');
check(
  "launcher sembunyi di menu 'ai-assistant'",
  workspaceView.includes("activeMenu !== 'ai-assistant'")
);
check(
  "launcher sembunyi di menu 'ded-rab'",
  workspaceView.includes("activeMenu !== 'ded-rab'")
);
check(
  'launcher tetap sembunyi di magic-ai/ezrab-ai/ded-ai/dokumen-ai',
  workspaceView.includes("activeMenu !== 'magic-ai'") &&
    workspaceView.includes("activeMenu !== 'ezrab-ai'") &&
    workspaceView.includes("activeMenu !== 'ded-ai'") &&
    workspaceView.includes("activeMenu !== 'dokumen-ai'")
);

/* ---------- 2 & 3. Maskot kanonis + state sesi ---------- */
const chatbox = read('components/copilot/EzrabCoAssistantChatbox.tsx');
check('chatbox: tanpa EZRABMascot3D', !chatbox.includes('EZRABMascot3D'));
check('chatbox: tanpa mascot-ezrab-new', !chatbox.includes('mascot-ezrab-new'));
check('chatbox: memakai EZRABMascotLucu', chatbox.includes('EZRABMascotLucu'));

const fullView = read('components/copilot/EzrabAiAssistantFullView.tsx');
check('full view: tanpa mascot-ezrab-new', !fullView.includes('mascot-ezrab-new'));
check('full view: memakai EZRABMascotLucu', fullView.includes('EZRABMascotLucu'));

const chatAiView = read('ai-tools/ezrab-ai/view.tsx');
check('chat AI: tanpa EZRABMascot3D', !chatAiView.includes('EZRABMascot3D'));
check('chat AI: memakai EZRABMascotLucu', chatAiView.includes('EZRABMascotLucu'));

const tour = read('components/onboarding/OnboardingTour.tsx');
check('tour: tanpa GreetingMascot', !tour.includes('GreetingMascot'));
check('tour: memakai EZRABMascotLucu', tour.includes('EZRABMascotLucu'));

const launcher = read('components/copilot/EzrabCoAssistantLauncher.tsx');
check(
  'launcher: kunci localStorage hidden sudah tidak dipakai',
  !launcher.includes('ezrab_assistant_launcher_hidden')
);
check('launcher: memakai EZRABMascotLucu', launcher.includes('EZRABMascotLucu'));

/* ---------- 4. Footer ---------- */
const footer = read('components/landing/exact/ExactFooter.tsx');
for (const dead of ['#integrasi', '#karier', '#kontak', '#panduan', '#dukungan']) {
  check(`footer: tautan mati ${dead} hilang`, !footer.includes(`href="${dead}"`));
}
check('footer: tanpa jangkar #privacy', !footer.includes('href="#privacy"'));
check('footer: tanpa jangkar #terms', !footer.includes('href="#terms"'));
check('footer: tanpa sosial x.com generik', !footer.includes('https://x.com'));
check('footer: tanpa sosial instagram generik', !footer.includes('https://instagram.com'));
check('footer: tanpa sosial linkedin generik', !footer.includes('https://linkedin.com'));
check('footer: ada tautan /privacy', footer.includes('/privacy'));
check('footer: ada tautan /terms', footer.includes('/terms'));
check('footer: FAQ menuju /fitur#faq', footer.includes('/fitur#faq'));
check('footer: #fitur dipertahankan', footer.includes('href="#fitur"'));
check('footer: #harga dipertahankan', footer.includes('href="#harga"'));

/* ---------- 5. Route publik & file yatim ---------- */
const app = read('App.tsx');
check('App: merender PrivacyPage', app.includes('PrivacyPage'));
check('App: merender TermsPage', app.includes('TermsPage'));
check('App: merender AuthNoticePage', app.includes('AuthNoticePage'));
check('App: merender PublicNotFoundPage', app.includes('PublicNotFoundPage'));
check('file yatim AuthPage.tsx terhapus', !existsSync(resolve(SRC, 'AuthPage.tsx')));
check(
  'file yatim BootLoadingScreen.tsx terhapus',
  !existsSync(resolve(SRC, 'components/boot/BootLoadingScreen.tsx'))
);
check(
  'file yatim TestimonialsSection.tsx terhapus',
  !existsSync(resolve(SRC, 'components/landing/TestimonialsSection.tsx'))
);

/* ---------- 6. parseWorkspaceRoute ---------- */
const ahspReport = parseWorkspaceRoute('/app/projects/p1/reports/ahsp');
check("reports/ahsp → menu 'laporan'", ahspReport.menu === 'laporan' && ahspReport.status === 'ok');
const ahspExplorer = parseWorkspaceRoute('/app/projects/p1/ahsp');
check("route ahsp proyek → menu 'ahsp-2026' (explorer tetap)", ahspExplorer.menu === 'ahsp-2026');
const rabReport = parseWorkspaceRoute('/app/projects/p1/reports/rab');
check("reports/rab → menu 'laporan'", rabReport.menu === 'laporan');

/* ---------- 7. DemoModal ---------- */
const demo = read('components/common/DemoModal.tsx');
check('DemoModal: tanpa klaim "Demo Interaktif"', !demo.includes('Demo Interaktif'));
check('DemoModal: judul "Gambaran Fitur EZRAB"', demo.includes('Gambaran Fitur EZRAB'));
check('DemoModal: tanpa kata "Simulasi"', !demo.includes('Simulasi'));

/* ---------- 8. TopBar ---------- */
const topbar = read('components/navigation/TopBar.tsx');
check('TopBar: indeks cari memuat kredit-ai', topbar.includes("id: 'kredit-ai'"));
check('TopBar: indeks cari memuat dokumen-tender', topbar.includes("id: 'dokumen-tender'"));
check('TopBar: item "Hubungi Support Teknis" hilang', !topbar.includes('Hubungi Support Teknis'));
check('TopBar: Panduan memicu ONBOARDING_OPEN_EVENT', topbar.includes('ONBOARDING_OPEN_EVENT'));

/* ---------- 9. getCurveSContext ---------- */
const empty = getCurveSContext([], []);
check('kurva kosong: plannedProgress null', empty.plannedProgress === null);
check('kurva kosong: actualProgress null', empty.actualProgress === null);
check('kurva kosong: deviation null', empty.deviation === null);
check('kurva kosong: status NO_DATA', empty.status === 'NO_DATA');
check('kurva kosong: totalWeeks 0 (bukan 12)', empty.totalWeeks === 0);
check('kurva kosong: currentWeek 0 (bukan 5)', empty.currentWeek === 0);
check('kurva kosong: dataPoints []', Array.isArray(empty.dataPoints) && empty.dataPoints.length === 0);

const withFallback = getCurveSContext([], [], 30);
check(
  'kurva kosong + progres proyek nyata: actualProgress dari data nyata',
  withFallback.actualProgress === 30 && withFallback.plannedProgress === null
);

const pts: KurvaSDataPoint[] = [
  { weekIndex: 1, weekLabel: 'W1', startDate: '', endDate: '', plannedWeeklyPercent: 40, cumulativePlannedPercent: 40, plannedWeeklyCost: 0, cumulativePlannedCost: 0, actualProgressPercent: 35 },
  { weekIndex: 2, weekLabel: 'W2', startDate: '', endDate: '', plannedWeeklyPercent: 60, cumulativePlannedPercent: 100, plannedWeeklyCost: 0, cumulativePlannedCost: 0 },
];
const real = getCurveSContext([], pts);
check('kurva nyata: planned dari titik aktual terakhir (40)', real.plannedProgress === 40);
check('kurva nyata: actual 35', real.actualProgress === 35);
check('kurva nyata: deviasi -5 & BEHIND', real.deviation === -5 && real.status === 'BEHIND_SCHEDULE');
check('kurva nyata: totalWeeks = jumlah titik (2)', real.totalWeeks === 2);

const plannedOnly: KurvaSDataPoint[] = [
  { weekIndex: 1, weekLabel: 'W1', startDate: '', endDate: '', plannedWeeklyPercent: 50, cumulativePlannedPercent: 50, plannedWeeklyCost: 0, cumulativePlannedCost: 0 },
];
const noActual = getCurveSContext([], plannedOnly);
check(
  'kurva rencana saja: actual null & status NO_DATA (tidak mengklaim on-track)',
  noActual.actualProgress === null && noActual.status === 'NO_DATA' && noActual.deviation === null
);

console.log(`\nF6 shell: ${passed} lulus, ${failed} gagal`);
if (failed > 0) {
  console.log('Gagal:', failures.join(' | '));
  process.exit(1);
}
