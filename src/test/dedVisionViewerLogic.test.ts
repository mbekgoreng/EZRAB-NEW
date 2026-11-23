// Suite: DED vision — pure viewer logic (increment I11 Stage 1b).
// src/ai-tools/ded-vision/viewerLogic.ts — drag/click threshold +
// image-load race resolution extracted from DedVisionReviewViewer so
// the Bug 1 / Bug 2 decisions are unit-testable without a DOM. The
// component's visual behaviour is verified by the I11 browser suite.
// Ground truth dihitung tangan (bukan dari output modul):
//   ambang drag 4 px, jarak Manhattan: |dx| + |dy| > 4 = drag.
//   gambar 1200×1600 yang sudah complete -> size dipertahankan.
// Jalankan dari root repo: npx --yes tsx src/test/dedVisionViewerLogic.test.ts
import {
  DEDVR_DRAG_CLICK_THRESHOLD_PX,
  dragExceedsThreshold,
  resolveImageStateFromSnapshot,
} from '../ai-tools/ded-vision/viewerLogic';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

/* ------------------------------------------------------------------ */
/* Drag/click threshold (Bug 1: capture hanya sesudah drag dimulai)    */
/* ------------------------------------------------------------------ */
check('threshold: DEDVR_DRAG_CLICK_THRESHOLD_PX = 4', DEDVR_DRAG_CLICK_THRESHOLD_PX === 4);
check('drag: (0,0) bukan drag', dragExceedsThreshold(0, 0) === false);
check('drag: (2,2) = 4, tepat di ambang -> bukan drag', dragExceedsThreshold(2, 2) === false);
check('drag: (4,0) = 4, tepat di ambang -> bukan drag', dragExceedsThreshold(4, 0) === false);
check('drag: (3,2) = 5 > 4 -> drag', dragExceedsThreshold(3, 2) === true);
check('drag: (0,5) = 5 > 4 -> drag', dragExceedsThreshold(0, 5) === true);
check('drag: (-3,-2) = 5, arah negatif tetap drag', dragExceedsThreshold(-3, -2) === true);
check('drag: (150,80) pan besar -> drag', dragExceedsThreshold(150, 80) === true);
check('drag: (1,1) = 2, jitter klik kecil -> bukan drag', dragExceedsThreshold(1, 1) === false);
check('drag: ambang kustom (2,2) > 3 -> drag', dragExceedsThreshold(2, 2, 3) === true);
check('drag: ambang kustom (2,2) > 4 -> bukan drag', dragExceedsThreshold(2, 2, 4) === false);

/* ------------------------------------------------------------------ */
/* Image-load race resolution (Bug 2: load sudah fired sebelum efek)   */
/* ------------------------------------------------------------------ */
{
  const r = resolveImageStateFromSnapshot(null);
  check('image: img null -> pending (size null, error false)', r.size === null && r.error === false);
}
{
  const r = resolveImageStateFromSnapshot({ complete: false, naturalWidth: 0, naturalHeight: 0 });
  check('image: belum complete -> pending (size null, error false)', r.size === null && r.error === false);
}
{
  const r = resolveImageStateFromSnapshot({ complete: false, naturalWidth: 1200, naturalHeight: 1600 });
  check('image: belum complete meski ada dimensi -> tetap pending', r.size === null && r.error === false);
}
{
  const r = resolveImageStateFromSnapshot({ complete: true, naturalWidth: 1200, naturalHeight: 1600 });
  check('image: complete 1200x1600 -> size dipertahankan (Bug 2)',
    r.size !== null && r.size.width === 1200 && r.size.height === 1600 && r.error === false);
}
{
  const r = resolveImageStateFromSnapshot({ complete: true, naturalWidth: 0, naturalHeight: 0 });
  check('image: complete tanpa dimensi -> error (bukan pending)', r.size === null && r.error === true);
}
{
  const r = resolveImageStateFromSnapshot({ complete: true, naturalWidth: 1200, naturalHeight: 0 });
  check('image: complete tinggi 0 -> error', r.size === null && r.error === true);
}
{
  const r = resolveImageStateFromSnapshot({ complete: true, naturalWidth: 800, naturalHeight: 600 });
  check('image: complete 800x600 -> size 800x600 dipertahankan',
    r.size !== null && r.size.width === 800 && r.size.height === 600 && r.error === false);
}

const totalChecks = pass + fail;
console.log(`\nPASS ${pass}/${totalChecks}`);
if (fail > 0) process.exit(1);
