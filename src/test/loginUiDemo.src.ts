// Suite: login UI frontend-only (user 2026-10-28) — matriks resolveLoginUi.
// Gaya harness sama seperti suite src/test lainnya (plain-tsx, tanpa vitest).
import { resolveLoginUi } from '../auth/authMode';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: string): void {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

console.log('=== 1. real-login: modal penuh, tanpa peduli flag ===');
check(
  'real-login + flag on -> tampil, bukan demoOnly',
  (() => {
    const d = resolveLoginUi('real-login', true);
    return d.showModal === true && d.demoOnly === false;
  })(),
);
check(
  'real-login + flag off -> tampil, bukan demoOnly',
  (() => {
    const d = resolveLoginUi('real-login', false);
    return d.showModal === true && d.demoOnly === false;
  })(),
);

console.log('=== 2. open + flag: modal demo-only (perintah user) ===');
check(
  'open + flag on -> tampil, demoOnly',
  (() => {
    const d = resolveLoginUi('open', true);
    return d.showModal === true && d.demoOnly === true;
  })(),
);
check(
  'open + flag off -> perilaku lama (langsung workspace)',
  (() => {
    const d = resolveLoginUi('open', false);
    return d.showModal === false && d.demoOnly === false;
  })(),
);

console.log('=== 3. failsafe-demo: tanpa friksi, modal tidak tampil ===');
check(
  'failsafe-demo + flag on -> tidak tampil (fail-safe dipertahankan)',
  (() => {
    const d = resolveLoginUi('failsafe-demo', true);
    return d.showModal === false && d.demoOnly === false;
  })(),
);
check(
  'failsafe-demo + flag off -> tidak tampil',
  (() => {
    const d = resolveLoginUi('failsafe-demo', false);
    return d.showModal === false && d.demoOnly === false;
  })(),
);

console.log('=== 4. Invarian: demoOnly hanya bila modal tampil ===');
check(
  'tidak ada kombinasi demoOnly=true + showModal=false',
  (['open', 'real-login', 'failsafe-demo'] as const).every((m) =>
    [true, false].every((f) => {
      const d = resolveLoginUi(m, f);
      return !(d.demoOnly && !d.showModal);
    }),
  ),
);

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
