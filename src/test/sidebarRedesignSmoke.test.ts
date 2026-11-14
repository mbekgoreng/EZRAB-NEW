/** Sidebar redesign smoke test — source-level structure verification. */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __d = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__d, '../components/layout/Sidebar.tsx'), 'utf-8');
// Header grup AI / DATA & REFERENSI / LAINNYA TIDAK dihapus — sejak
// migrasi i18n 692d077 (2026-10-14, sehari sesudah tes ini ditulis di
// 2f841f4) ketiganya dirender lewat kunci i18n t('nav.group_*') dengan
// nilai Indonesia di dictionaries.ts ('AI', 'DATA & REFERENSI',
// 'LAINNYA'). Pin di bawah memin wiring kunci + nilai kamusnya (2
// berkas) — lebih kuat dari 1 substring literal, dan selaras dengan
// cek PROYEK yang sudah memakai bentuk kunci i18n.
const dict = readFileSync(join(__d, '../i18n/dictionaries.ts'), 'utf-8');

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { c ? (passed++, console.log(`  [PASS] ${n}`)) : (failed++, console.log(`  [FAIL] ${n}`)); };

console.log('Sidebar redesign structure checks:');
check('no project picker dropdown', !src.includes('Workspace Selector'));
check('PROYEK group header', src.includes("t('nav.proyek')"));
check('VOLUME & QTO header', src.includes('VOLUME & QTO'));
check('JADWAL & MANAJEMEN header', src.includes('JADWAL & MANAJEMEN'));
check('RAB & ESTIMASI header', src.includes('RAB & ESTIMASI'));
check('AI header present', src.includes("t('nav.group_ai')") && dict.includes("group_ai: 'AI'"));
check('AI TOOLS header removed', !src.includes('AI TOOLS'));
check('DATA & REFERENSI header', src.includes("t('nav.group_data')") && dict.includes("group_data: 'DATA & REFERENSI'"));
check('LAINNYA header', src.includes("t('nav.group_lainnya')") && dict.includes("group_lainnya: 'LAINNYA'"));
check('floating pill toggle kept', src.includes('Floating pill toggle'));
check('no hardcoded 36-300 badge', !src.includes("badge: '36-300'"));
check('template count from real registry', src.includes('RabTemplateService.getInstance().getAllTemplates().length'));
check('real project counts (no hardcode)', src.includes('projects.filter((p) => p.status'));
check('all routes preserved (onSelectMenu calls)', (src.match(/onSelectMenu\(/g) || []).length >= 10);

console.log(`\n${passed} PASSED, ${failed} FAILED`);
if (failed) process.exit(1);
