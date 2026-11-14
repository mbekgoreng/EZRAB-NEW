/**
 * D-68 (P2) + D-84 (P2) + NEW-10 — delete buttons must work through the
 * in-app confirmation dialog, never through native confirm() (which the
 * audit browser auto-dismissed, making both buttons look like no-ops).
 * Source-structural tests (same precedent as versionScenarioModalHooks:
 * pin the wiring from source, since this sandbox has no React renderer).
 * Run: npx tsx src/test/d68d84DeleteConfirm.test.ts
 *
 * The mutations themselves (deleteQtoItem / bulkDeleteRabItems) were
 * already correct — this suite pins the DIALOG PATH: open -> confirm ->
 * mutation runs; cancel -> nothing happens.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };
const contains = (src: string, needle: string, m: string) => {
  if (!src.includes(needle)) throw new Error(`${m}: missing ${JSON.stringify(needle)}`);
};
const notContains = (src: string, needle: string, m: string) => {
  if (src.includes(needle)) throw new Error(`${m}: must NOT contain ${JSON.stringify(needle)}`);
};

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const qtoView = read('../components/qto/QtoRekapVolumeView.tsx');
const rabView = read('../components/rab/RabEstimasiView.tsx');
const bulkBar = read('../components/estimator/EstimatorBulkActionBar.tsx');
const versionModal = read('../components/versioning/EstimateVersionAndScenarioModal.tsx');

// --- D-68: QTO row "Hapus Item" ------------------------------------------------

test('D-68: row delete opens an in-app dialog (pending state), not confirm()', () => {
  contains(qtoView, 'const [pendingDeleteQto, setPendingDeleteQto] = useState<QTOItem | null>(null);', 'pending-delete state');
  // The row delete button (title="Hapus Item") must set the pending item.
  const titleIdx = qtoView.indexOf('title="Hapus Item"');
  ok(titleIdx > -1, 'row delete button exists');
  eqUnique(qtoView, 'title="Hapus Item"', 'exactly one row delete button');
  const handlerWindow = qtoView.slice(Math.max(0, titleIdx - 700), titleIdx);
  contains(handlerWindow, 'setPendingDeleteQto(item)', 'button opens the dialog');
  notContains(handlerWindow, 'confirm(', 'button must not gate on native confirm()');
  notContains(handlerWindow, 'deleteQtoItem(', 'button must not delete directly (dialog first)');
});

test('D-68: dialog confirm deletes exactly the pending item and cleans selection', () => {
  contains(qtoView, '{pendingDeleteQto && (', 'delete dialog renders on pending state');
  contains(qtoView, 'onClick={handleConfirmDeleteQto}', 'dialog confirm wired to the handler');
  const hStart = qtoView.indexOf('const handleConfirmDeleteQto');
  ok(hStart > -1, 'confirm handler exists');
  const hBody = qtoView.slice(hStart, qtoView.indexOf('\n  };', hStart));
  contains(hBody, 'deleteQtoItem(deletedId)', 'confirm deletes the pending item');
  contains(hBody, "if (selectedQtoId === deletedId) setSelectedQtoId(null);", 'detail-panel selection cleared when its item is deleted');
  contains(hBody, "setSelectedItemIds((prev) => prev.filter((id) => id !== deletedId));", 'bulk selection drops the deleted id');
  contains(hBody, "showToast('Item QTO berhasil dihapus.');", 'toast fires on confirm');
});

test('D-68: dialog cancel closes WITHOUT deleting (all rows preserved)', () => {
  contains(qtoView, 'onClick={() => setPendingDeleteQto(null)}', 'cancel only closes the dialog');
  const dialogStart = qtoView.indexOf('{pendingDeleteQto && (');
  const dialogEnd = qtoView.indexOf('{pendingUnpricedSync && (', dialogStart);
  const dialog = qtoView.slice(dialogStart, dialogEnd > -1 ? dialogEnd : undefined);
  const cancelIdx = dialog.indexOf('setPendingDeleteQto(null)');
  ok(cancelIdx > -1, 'cancel button inside the dialog');
  // The cancel button's own onClick is the close-only call (no mutation nearby).
  const cancelWindow = dialog.slice(Math.max(0, cancelIdx - 120), cancelIdx);
  notContains(cancelWindow, 'deleteQtoItem', 'cancel path must not call the mutation');
});

test('D-68: delete dialog shows the linked-RAB impact (detach, not delete)', () => {
  contains(qtoView, 'projectMappings.filter((m) => m.qtoItemId === pendingDeleteQto.id)', 'linked RAB count computed');
  contains(qtoView, 'akan dialihkan ke sumber manual (tidak ikut terhapus)', 'dialog explains linked items are detached, not deleted');
});

test('D-68: QTO bulk delete still uses native confirm() (known follow-up, NOT this batch)', () => {
  // The task fences this batch to the TWO defect sites. The QTO *bulk*
  // delete is a third site — pin its current state so a later batch can
  // find it, and so this suite fails loudly if someone "fixes" it silently
  // without updating the follow-up record.
  contains(qtoView, 'if (!confirm(`Hapus ${selectedItemIds.length} item QTO terpilih?`)) return;', 'QTO bulk delete still native (follow-up)');
});

// --- D-84: spreadsheet bulk-bar "Hapus" ----------------------------------------

test('D-84: bulk delete opens an in-app dialog with the affected count', () => {
  contains(rabView, 'const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);', 'dialog state');
  contains(rabView, 'const [bulkDeleteCount, setBulkDeleteCount] = useState(0);', 'count captured at open');
  const hStart = rabView.indexOf('onBulkDelete={() => {');
  ok(hStart > -1, 'bulk delete handler exists');
  const hEnd = rabView.indexOf('onBulkDuplicate', hStart);
  const handler = rabView.slice(hStart, hEnd);
  contains(handler, 'setBulkDeleteCount(selectedItemIds.size);', 'count captured when opening');
  contains(handler, 'setShowBulkDeleteConfirm(true);', 'dialog opened');
  notContains(handler, 'confirm(', 'handler must not gate on native confirm()');
  notContains(handler, 'bulkDeleteRabItems(', 'handler must not delete directly (dialog first)');
  notContains(rabView, 'Hapus ${count} item pekerjaan yang dipilih?', 'old native-confirm text is gone');
});

test('D-84: dialog shows the count and the honest Undo note', () => {
  contains(rabView, '{showBulkDeleteConfirm && (', 'bulk delete dialog renders on state');
  contains(rabView, 'Hapus {bulkDeleteCount} item pekerjaan?', 'dialog names the affected count');
  contains(rabView, 'Dapat diurungkan dengan Undo (Ctrl+Z)', 'dialog states the honest undo path');
  contains(rabView, 'Baris lain dan kelompok WBS tidak berubah', 'dialog states unrelated rows/groups are untouched');
});

test('D-84: dialog confirm deletes ONLY the selected items and clears selection', () => {
  const dStart = rabView.indexOf('{showBulkDeleteConfirm && (');
  ok(dStart > -1, 'dialog exists');
  const dEnd = rabView.indexOf('MODALS & DRAWERS', dStart);
  const dialog = rabView.slice(dStart, dEnd);
  contains(dialog, 'bulkDeleteRabItems(Array.from(selectedItemIds));', 'confirm deletes exactly the selected ids');
  contains(dialog, 'setSelectedItemIds(new Set());', 'selection cleared after delete');
  contains(dialog, 'setShowBulkDeleteConfirm(false);', 'dialog closes after delete');
  contains(dialog, 'item terpilih berhasil dihapus', 'toast fires on confirm');
});

test('D-84: dialog cancel closes WITHOUT deleting (all rows preserved)', () => {
  contains(rabView, 'onClick={() => setShowBulkDeleteConfirm(false)}', 'cancel only closes the dialog');
  const dStart = rabView.indexOf('{showBulkDeleteConfirm && (');
  const dialog = rabView.slice(dStart, rabView.indexOf('MODALS & DRAWERS', dStart));
  const cancelIdx = dialog.indexOf('setShowBulkDeleteConfirm(false)}');
  const cancelWindow = dialog.slice(Math.max(0, cancelIdx - 120), cancelIdx);
  notContains(cancelWindow, 'bulkDeleteRabItems', 'cancel path must not call the mutation');
});

test('D-84: bulk bar Hapus button is wired to onBulkDelete', () => {
  contains(bulkBar, 'onClick={onBulkDelete}', 'bulk bar delegates to the view handler');
});

// --- NEW-10: version modal active badge ---------------------------------------

test('NEW-10: CURRENT ACTIVE follows the active-version pointer, not index 0', () => {
  notContains(versionModal, 'const isLatest = vIdx === 0;', 'inverted vIdx===0 rule is gone');
  contains(versionModal, 'activeVersionId: string | null;', 'activeVersionId prop declared');
  contains(versionModal, 'const isActive = activeVersionId !== null && ver.id === activeVersionId;', 'active determined by id');
  contains(versionModal, '{isActive && (', 'CURRENT ACTIVE badge gated on isActive');
  contains(versionModal, '{!isActive && (', 'Pulihkan hidden only for the active version');
  contains(versionModal, 'onRestoreVersion(ver, activeVersionId);', 'restore passes the observed active id (stale guard)');
  contains(versionModal, 'placeholder={nextVersionNumber(versions)}', 'placeholder from max-based numbering');
  contains(rabView, 'activeVersionId={activeEstimateVersionId}', 'view passes the effective active id into the modal');
});

// --- helpers -------------------------------------------------------------------

function eqUnique(src: string, needle: string, m: string) {
  const first = src.indexOf(needle);
  const last = src.lastIndexOf(needle);
  if (first === -1) throw new Error(`${m}: not found`);
  if (first !== last) throw new Error(`${m}: found more than once`);
}

console.log(failures === 0 ? `\nALL D-68/D-84/NEW-10 DELETE CONFIRM TESTS PASSED (${passes}/${passes + failures})` : `\n${failures} TEST(S) FAILED (${passes} passed)`);
process.exit(failures === 0 ? 0 : 1);
