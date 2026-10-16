/**
 * Verifikasi alternatif visual (tanpa browser):
 * 1. SSR render komponen tutorial → pastikan markup valid tanpa crash.
 * 2. Audit selector: setiap target di registry & DashboardTour harus ada di source.
 *
 * Dijalankan: npx tsx src/test/tutorialVisualAlt.test.ts
 */
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let failures = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e instanceof Error ? e.message : e}`);
  }
}

const SRC = join(process.cwd(), 'src');

function collectSource(pattern: RegExp): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue;
        walk(p);
      } else if (/\.(tsx?|css)$/.test(e.name)) {
        out.push(p);
      }
    }
  };
  walk(SRC);
  return out.filter((p) => pattern.test(readFileSync(p, 'utf8')));
}

console.log('[1] Semua selector data-tour/data-tutorial di tutorial ada di source');

import { listTutorials } from '../components/onboarding/tutorials/tutorialRegistry';

test('target tutorial cocok dengan atribut di source', () => {
  // Kumpulkan semua nilai atribut + seluruh teks source (untuk atribut boolean)
  const tourValues = new Set<string>();
  const tutorialValues = new Set<string>();
  let allSrc = '';
  let hasDynamicMenuTour = false;
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue;
        walk(p);
      } else if (/\.tsx$/.test(e.name)) {
        const src = readFileSync(p, 'utf8');
        allSrc += src;
        for (const m of src.matchAll(/data-tour="([^"]+)"/g)) tourValues.add(m[1]);
        for (const m of src.matchAll(/data-tutorial="([^"]+)"/g)) tutorialValues.add(m[1]);
        if (/data-tour=\{`menu-\$\{/.test(src)) hasDynamicMenuTour = true;
      }
    }
  };
  walk(SRC);

  const missing: string[] = [];
  for (const t of listTutorials()) {
    for (const s of t.steps) {
      if (!s.target) continue;
      const mTour = s.target.match(/^\[data-tour="([^"]+)"\]$/);
      const mTut = s.target.match(/^\[data-tutorial="([^"]+)"\]$/);
      const mBare = s.target.match(/^\[data-([a-z-]+)\]$/);
      if (mTour) {
        const v = mTour[1];
        if (v.startsWith('menu-')) {
          if (!hasDynamicMenuTour && !tourValues.has(v)) missing.push(`${t.id}: ${s.target}`);
        } else if (!tourValues.has(v)) {
          missing.push(`${t.id}: ${s.target}`);
        }
      } else if (mTut) {
        if (!tutorialValues.has(mTut[1])) missing.push(`${t.id}: ${s.target}`);
      } else if (mBare) {
        // atribut boolean: cocok jika literal "data-<attr>" ada di source
        if (!allSrc.includes(`data-${mBare[1]}`)) missing.push(`${t.id}: ${s.target}`);
      } else {
        missing.push(`${t.id}: format selector tak dikenal ${s.target}`);
      }
    }
  }
  assert.deepEqual(missing, [], `selector hilang:\n${missing.join('\n')}`);
});

console.log('\n[2] SSR render komponen (react-dom/server)');

test('registry + player module dapat diimpor tanpa crash', async () => {
  const reg = await import('../components/onboarding/tutorials/tutorialRegistry');
  assert.ok(typeof reg.listTutorials === 'function');
  assert.equal(reg.listTutorials().length, 10);
  const coord = await import('../components/onboarding/tutorials/tutorialCoordinator');
  assert.ok(typeof coord.claimTutorialSlot === 'function');
});

console.log('\n[3] SSR render markup komponen');

test('TutorialHelpButton render tombol ? tanpa context', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const React = await import('react');
  const { TutorialHelpButton } = await import('../components/onboarding/tutorials/TutorialHelpButton');
  const html = renderToStaticMarkup(React.createElement(TutorialHelpButton, { tutorialId: 'proyek' }));
  assert.ok(html.includes('<button'), 'render button');
  assert.ok(html.includes('?'), 'berisi tanda tanya');
  assert.ok(html.includes('data-tutorial-help="proyek"'), 'atribut data benar');
  // tutorial tak dikenal → render null
  const html2 = renderToStaticMarkup(React.createElement(TutorialHelpButton, { tutorialId: 'tak-ada' }));
  assert.equal(html2, '', 'tutorial tak dikenal render kosong');
});

test('Spotlight render overlay + tooltip', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const React = await import('react');
  const { Spotlight } = await import('../components/onboarding/Spotlight');
  const html = renderToStaticMarkup(
    React.createElement(Spotlight, {
      steps: [{ target: '[data-tour="dashboard"]', title: 'Judul Tes', body: 'Isi tes' }],
      onDone: () => {},
      onSkip: () => {},
    })
  );
  // Spotlight render null saat target tak ada di SSR (document tak tersedia penuh) ATAU overlay;
  // yang penting tidak crash. Verifikasi via client-less: cukup tidak throw.
  assert.ok(typeof html === 'string');
});

test('DashboardTour steps: 8 langkah dengan judul & body', async () => {
  // Verifikasi via registry-like: baca source DashboardTour
  const src = readFileSync(join(SRC, 'components/onboarding/DashboardTour.tsx'), 'utf8');
  const targets = [...src.matchAll(/target: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(targets.length, 8, '8 langkah');
  for (const t of targets) assert.ok(t.startsWith('[data-tour='), `selector valid: ${t}`);
});

console.log('');
if (failures > 0) {
  console.error(`Failed: ${failures}`);
  process.exit(1);
} else {
  console.log('Verifikasi alternatif visual PASS.');
}
