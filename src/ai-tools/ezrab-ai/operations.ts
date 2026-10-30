/**
 * EZRAB AI Assistant — lapisan operasi spreadsheet bertipe (Fase B/D).
 *
 * Prinsip:
 * - Model hanya MENGUSULKAN operasi (plan). Kode di modul ini memvalidasi,
 *   dan eksekusi hanya terjadi lewat konfirmasi manusia di UI (tombol kartu),
 *   tidak pernah dari keluaran model.
 * - Eksekusi berjalan lewat OperationHost yang disediakan view React dan
 *   memanggil mutator kanonis ProjectContext yang sama dengan spreadsheet
 *   (updateRabItemFull / updateRabItemUnitPrice / deleteRabItem /
 *   bulkDeleteRabItems / bulkAddRabItems) — tidak ada state RAB kedua.
 * - Setiap plan terikat ke proyek + hash daftar item saat plan dibuat.
 *   Bila data berubah sebelum konfirmasi (edit manual, ganti proyek,
 *   tab lain), plan DITOLAK sebagai basi — tidak pernah dieksekusi buta.
 * - Setiap eksekusi dicatat ke log operasi (localStorage) beserta nilai
 *   sebelum/sesudah, dan undo adalah plan invers yang diverifikasi terhadap
 *   state saat ini — undo TIDAK PERNAH menimpa perubahan yang lebih baru.
 * - Harga hilang tetap hilang (null), tidak pernah menjadi Rp0; perubahan
 *   harga satuan oleh asisten adalah harga MANUAL (label resmi tidak
 *   diwarisi — ditangani mutator harga manual milik aplikasi sendiri).
 */
import { snapshotAllItems } from './projectContext';
import type { ProjectItemSnapshot, ProjectSnapshot } from './projectContext';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';

/* ---------------- Format (lokal, hindari sirkular dengan tools.ts) -------- */

function fmtRp(n: number): string {
  return 'Rp' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function fmtNum(n: number): string {
  return n.toLocaleString('id-ID', { maximumFractionDigits: 4 });
}

/* ---------------- Konteks operasi (dipasang view; default: tulis MATI) ---- */

export interface AssistantOperationContext {
  actor: string;
  /** true hanya bila peran aktif memegang capability 'edit-estimate'. */
  writesEnabled: boolean;
}

let opContext: AssistantOperationContext | null = null;

export function setAssistantOperationContext(ctx: AssistantOperationContext | null): void {
  opContext = ctx;
}
export function getAssistantOperationContext(): AssistantOperationContext | null {
  return opContext;
}

/**
 * Pagar dataset operasi tulis: bila daftar alat terpotong pada batas keras
 * (proyek > 1.000 item), pratinjau/hash/verifikasi hanya mencakup sebagian
 * proyek — operasi tulis harus menolak agar tidak mengklaim cakupan penuh.
 * Mengembalikan pesan penolakan, atau null bila aman.
 */
export function writesDatasetGuard(snap: ProjectSnapshot): string | null {
  if (!snap.allTruncated) return null;
  return (
    `Proyek "${snap.projectName}" memiliki lebih dari 1.000 item — di luar batas dataset tervalidasi ` +
    'untuk operasi tulis Asisten AI. Operasi tulis dinonaktifkan untuk proyek sebesar ini agar pratinjau, ' +
    'hash state, dan verifikasi tetap mencakup seluruh proyek. Tidak ada perubahan yang dibuat.'
  );
}

/* ---------------- Hash state (deteksi pratinjau basi) ---------------------- */

/** Hash deterministik atas proyeksi stabil daftar item sebuah proyek. */
export function hashProjectItems(items: ProjectItemSnapshot[]): string {
  const proj = items
    .map((i) => [i.id, i.volume, i.unitPrice ?? 'null', i.description, i.code, i.unit].join('|'))
    .join('§');
  let h1 = 5381;
  let h2 = 52711;
  for (let k = 0; k < proj.length; k++) {
    const c = proj.charCodeAt(k);
    h1 = ((h1 << 5) + h1 + c) | 0;
    h2 = ((h2 << 5) + h2 - c) | 0;
  }
  return `${items.length}:${(h1 >>> 0).toString(36)}.${(h2 >>> 0).toString(36)}`;
}

/* ---------------- Resolusi target ------------------------------------------ */

export type TargetResolution =
  | { kind: 'one'; item: ProjectItemSnapshot }
  | { kind: 'ambiguous'; candidates: ProjectItemSnapshot[] }
  | { kind: 'none' };

/** Samakan aturan pencocokan dengan get_item_detail: id persis, atau semua kata cocok. */
export function resolveTargetItem(
  items: ProjectItemSnapshot[],
  query: { id?: string; nama?: string },
): TargetResolution {
  if (query.id) {
    const byId = items.find((i) => i.id === query.id);
    if (byId) return { kind: 'one', item: byId };
    return { kind: 'none' };
  }
  const q = (query.nama ?? '').trim().toLowerCase();
  if (!q) return { kind: 'none' };
  const words = q.split(/\s+/).filter(Boolean);
  const matches = items.filter((i) => {
    const hay = `${i.description} ${i.code} ${i.sectionName}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  if (matches.length === 1) return { kind: 'one', item: matches[0] };
  if (matches.length > 1) return { kind: 'ambiguous', candidates: matches };
  return { kind: 'none' };
}

/* ---------------- Tipe plan & record --------------------------------------- */

export type PlanKind =
  | 'update_quantity'
  | 'update_unit_price'
  | 'add_item'
  | 'delete_items'
  | 'undo';

export interface PlanTarget {
  itemId: string;
  description: string;
  code: string;
  unit: string;
  sectionName: string;
}

export interface AddItemData {
  code: string;
  description: string;
  unit: string;
  volume: number;
  unitPrice: number | null;
  priceResolved: boolean;
  /** Baris snapshot asal (untuk undo hapus: memulihkan isi persis). */
  restoreOf?: ProjectItemSnapshot;
  /** Baris MENTAH RabItem penuh (untuk undo hapus fidelitas penuh — factory
   * aplikasi mempertahankan ID yang diberikan, jadi ID asal ikut pulih). */
  restoreRaw?: Record<string, unknown>;
}

export interface ChangePlan {
  id: string;
  kind: PlanKind;
  /** Untuk plan hasil terapan (add/delete/update): jenis aksi yang dijalankan. */
  action: 'update_quantity' | 'update_unit_price' | 'add_item' | 'delete_items';
  projectId: string;
  projectName: string;
  targets: PlanTarget[];
  field?: 'volume' | 'unitPrice';
  before?: number | null;
  after?: number | null;
  addItems?: AddItemData[];
  /** Baris lengkap sebelum penghapusan (bahan undo). */
  beforeItems?: ProjectItemSnapshot[];
  expectedTotalBefore: number;
  expectedTotalAfter: number;
  stateHash: string;
  warnings: string[];
  actor: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'executed' | 'cancelled' | 'expired' | 'failed';
  /** Record operasi yang di-undo oleh plan ini (bila kind='undo'). */
  undoOfRecordId?: string;
  previewText: string;
}

export interface OperationRecord {
  id: string;
  ts: number;
  projectId: string;
  projectName: string;
  actor: string;
  kind: ChangePlan['action'] | 'undo';
  summary: string;
  targetIds: string[];
  before: unknown;
  after: unknown;
  status: 'executed' | 'failed' | 'undone';
  persistence: 'saved' | 'error' | 'unknown';
  safetySnapshotId?: string | null;
  createdItemIds?: string[];
  beforeItems?: ProjectItemSnapshot[];
  /** Baris mentah RabItem penuh sebelum penghapusan (fidelitas undo). */
  beforeRawItems?: Array<Record<string, unknown>>;
  undoneByRecordId?: string;
}

/* ---------------- Penyimpanan log operasi ---------------------------------- */

const OPS_LOG_KEY = 'ezrab_ai_operations_v1';
const OPS_LOG_MAX = 200;
let memoryLog: OperationRecord[] | null = null;

function loadLog(): OperationRecord[] {
  if (memoryLog) return memoryLog;
  try {
    const raw = (globalThis as any).localStorage?.getItem(OPS_LOG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryLog = parsed as OperationRecord[];
        return memoryLog;
      }
    }
  } catch { /* storage tak tersedia — jatuh ke memori */ }
  memoryLog = [];
  return memoryLog;
}

function saveLog(): void {
  try {
    (globalThis as any).localStorage?.setItem(OPS_LOG_KEY, JSON.stringify(loadLog().slice(-OPS_LOG_MAX)));
  } catch { /* memori tetap menjadi sumber di sesi ini */ }
}

/** Khusus pengujian: jatuhkan cache memori agar pembacaan berikutnya
 * benar-benar memuat dari storage (simulasi refresh halaman). */
export function __resetOpsLogCacheForTests(): void {
  memoryLog = null;
}

export function appendOperationRecord(rec: OperationRecord): void {
  const log = loadLog();
  log.push(rec);
  while (log.length > OPS_LOG_MAX) log.shift();
  saveLog();
}

export function listOperationRecords(projectId?: string): OperationRecord[] {
  const log = loadLog();
  const rows = projectId ? log.filter((r) => r.projectId === projectId) : [...log];
  return rows.sort((a, b) => b.ts - a.ts);
}

export function getLastUndoableRecord(projectId: string): OperationRecord | null {
  const rows = listOperationRecords(projectId);
  return rows.find((r) => r.status === 'executed') ?? null;
}

function markRecordUndone(recordId: string, undoneByRecordId: string): void {
  const log = loadLog();
  const rec = log.find((r) => r.id === recordId);
  if (rec) {
    rec.status = 'undone';
    rec.undoneByRecordId = undoneByRecordId;
    saveLog();
  }
}

/* ---------------- Plan store ------------------------------------------------ */

const planStore = new Map<string, ChangePlan>();
let planCounter = 0;

function newPlanId(): string {
  planCounter += 1;
  return `plan-${Date.now().toString(36)}-${planCounter}`;
}
function newRecordId(): string {
  return `op-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function registerPlan(plan: ChangePlan): ChangePlan {
  planStore.set(plan.id, plan);
  return plan;
}
export function getPlan(planId: string): ChangePlan | null {
  return planStore.get(planId) ?? null;
}
export function listPendingPlans(): ChangePlan[] {
  return [...planStore.values()].filter((p) => p.status === 'pending');
}
export function setPlanStatus(planId: string, status: ChangePlan['status']): void {
  const p = planStore.get(planId);
  if (p) p.status = status;
}

const PLAN_TTL_MS = 10 * 60 * 1000;

function itemTotal(it: ProjectItemSnapshot): number {
  return it.priceStatus === 'PRICE_UNRESOLVED' ? 0 : it.totalPrice;
}
function sumTotal(items: ProjectItemSnapshot[]): number {
  return items.reduce((s, i) => s + itemTotal(i), 0);
}

/* ---------------- Pembangun plan -------------------------------------------- */

export type PlanBuildResult =
  | { ok: true; plan: ChangePlan }
  | { ok: false; message: string };

function basePlan(
  snap: ProjectSnapshot,
  kind: PlanKind,
  action: ChangePlan['action'],
  actor: string,
): ChangePlan {
  const now = Date.now();
  return {
    id: newPlanId(),
    kind,
    action,
    projectId: snap.projectId,
    projectName: snap.projectName,
    targets: [],
    expectedTotalBefore: sumTotal(snapshotAllItems(snap)),
    expectedTotalAfter: sumTotal(snapshotAllItems(snap)),
    stateHash: hashProjectItems(snapshotAllItems(snap)),
    warnings: snap.unresolvedCount > 0
      ? [`Proyek memiliki ${snap.unresolvedCount} item yang belum berharga — total proyek pada pratinjau ini (sebelum & sesudah) bersifat PARSIAL, bukan total lengkap.`]
      : [],
    actor,
    createdAt: now,
    expiresAt: now + PLAN_TTL_MS,
    status: 'pending',
    previewText: '',
  };
}

function targetOf(it: ProjectItemSnapshot): PlanTarget {
  return { itemId: it.id, description: it.description, code: it.code, unit: it.unit, sectionName: it.sectionName };
}

export function buildUpdateQuantityPlan(
  snap: ProjectSnapshot,
  query: { id?: string; nama?: string },
  newVolume: number,
  actor: string,
): PlanBuildResult {
  if (!Number.isFinite(newVolume) || newVolume < 0) {
    return { ok: false, message: `Volume baru tidak valid (${newVolume}). Volume harus berupa angka ≥ 0.` };
  }
  const res = resolveTargetItem(snapshotAllItems(snap), query);
  if (res.kind === 'none') return { ok: false, message: 'Item target tidak ditemukan di proyek aktif. Sebutkan nama atau kode item persis seperti di RAB.' };
  if (res.kind === 'ambiguous') {
    return {
      ok: false,
      message:
        `Target ambigu — ${res.candidates.length} item cocok. Sebutkan yang mana (tidak ada perubahan yang dibuat):\n` +
        res.candidates.map((c) => `- ${c.description} (${c.code || 'tanpa kode'}), volume saat ini ${fmtNum(c.volume)} ${c.unit}, seksi ${c.sectionName || '-'}`).join('\n'),
    };
  }
  const it = res.item;
  const plan = basePlan(snap, 'update_quantity', 'update_quantity', actor);
  plan.targets = [targetOf(it)];
  plan.field = 'volume';
  plan.before = it.volume;
  plan.after = newVolume;
  const newItemTotal = it.priceStatus === 'PRICE_UNRESOLVED' ? 0 : newVolume * (it.unitPrice ?? 0);
  plan.expectedTotalAfter = plan.expectedTotalBefore - itemTotal(it) + newItemTotal;
  if (it.priceStatus === 'PRICE_UNRESOLVED') {
    plan.warnings.push('Harga satuan item ini belum tersedia — perubahan volume tidak mengubah total sampai harganya terisi. Harga tidak akan diisi otomatis.');
  }
  plan.previewText = formatPlanPreview(plan, snap);
  return { ok: true, plan: registerPlan(plan) };
}

export function buildUpdateUnitPricePlan(
  snap: ProjectSnapshot,
  query: { id?: string; nama?: string },
  newPrice: number,
  actor: string,
): PlanBuildResult {
  if (!Number.isFinite(newPrice) || newPrice < 0) {
    return { ok: false, message: `Harga satuan baru tidak valid (${newPrice}). Harga harus berupa angka ≥ 0.` };
  }
  const res = resolveTargetItem(snapshotAllItems(snap), query);
  if (res.kind === 'none') return { ok: false, message: 'Item target tidak ditemukan di proyek aktif.' };
  if (res.kind === 'ambiguous') {
    return {
      ok: false,
      message:
        `Target ambigu — ${res.candidates.length} item cocok. Sebutkan yang mana (tidak ada perubahan yang dibuat):\n` +
        res.candidates.map((c) => `- ${c.description} (${c.code || 'tanpa kode'}), harga saat ini ${c.unitPrice != null ? fmtRp(c.unitPrice) : 'belum tersedia'}/${c.unit}`).join('\n'),
    };
  }
  const it = res.item;
  const plan = basePlan(snap, 'update_unit_price', 'update_unit_price', actor);
  plan.targets = [targetOf(it)];
  plan.field = 'unitPrice';
  plan.before = it.unitPrice;
  plan.after = newPrice;
  plan.expectedTotalAfter = plan.expectedTotalBefore - itemTotal(it) + it.volume * newPrice;
  plan.warnings.push('Harga baru dicatat sebagai HARGA MANUAL — label sumber resmi AHSP pada item ini tidak diwarisi ke harga manual.');
  plan.previewText = formatPlanPreview(plan, snap);
  return { ok: true, plan: registerPlan(plan) };
}

export function buildDeletePlan(
  snap: ProjectSnapshot,
  queries: Array<{ id?: string; nama?: string }>,
  actor: string,
): PlanBuildResult {
  if (queries.length === 0) return { ok: false, message: 'Tidak ada item yang disebutkan untuk dihapus.' };
  if (queries.length > 25) return { ok: false, message: 'Maksimal 25 item per operasi hapus.' };
  const found: ProjectItemSnapshot[] = [];
  for (const q of queries) {
    const res = resolveTargetItem(snapshotAllItems(snap), q);
    if (res.kind === 'none') return { ok: false, message: `Item "${q.nama ?? q.id ?? ''}" tidak ditemukan — operasi dibatalkan, tidak ada yang dihapus.` };
    if (res.kind === 'ambiguous') {
      return {
        ok: false,
        message:
          `Target "${q.nama}" ambigu (${res.candidates.length} item cocok) — operasi dibatalkan, tidak ada yang dihapus:\n` +
          res.candidates.map((c) => `- ${c.description} (${c.code || 'tanpa kode'}), ${fmtNum(c.volume)} ${c.unit}`).join('\n'),
      };
    }
    if (!found.some((f) => f.id === res.item.id)) found.push(res.item);
  }
  const plan = basePlan(snap, 'delete_items', 'delete_items', actor);
  plan.targets = found.map(targetOf);
  plan.beforeItems = found;
  plan.expectedTotalAfter = plan.expectedTotalBefore - found.reduce((s, i) => s + itemTotal(i), 0);
  plan.warnings.push('Penghapusan dicatat di log operasi dan dapat di-undo selama belum ada perubahan lain sesudahnya. Snapshot versi proyek juga dibuat otomatis sebelum penghapusan.');
  plan.previewText = formatPlanPreview(plan, snap);
  return { ok: true, plan: registerPlan(plan) };
}

export function buildAddPlan(
  snap: ProjectSnapshot,
  ahspCode: string,
  volume: number | undefined,
  actor: string,
): PlanBuildResult {
  const code = (ahspCode ?? '').trim();
  if (!code) return { ok: false, message: 'Kode AHSP wajib disebutkan untuk menambah item.' };
  const rec = officialAhspRepository.getOfficialAhsp(code);
  if (!rec) {
    return {
      ok: false,
      message:
        `Kode ${code} tidak ditemukan di katalog AHSP resmi — item tidak ditambahkan. ` +
        'Penambahan hanya menerima kode katalog yang valid; kode tidak ditebak dan tidak dipetakan diam-diam. ' +
        'Gunakan tool cari_ahsp untuk menemukan kode yang benar.',
    };
  }
  const vol = volume != null && Number.isFinite(volume) && volume > 0 ? volume : 1;
  const priced = priceResolver2026.resolveAhspUnitPrice(rec);
  const resolved = priced.pricingStatus === 'FULL' && priced.unitPrice != null;
  const plan = basePlan(snap, 'add_item', 'add_item', actor);
  plan.addItems = [{
    code: rec.code,
    description: rec.name,
    unit: rec.unit,
    volume: vol,
    unitPrice: resolved ? priced.unitPrice : null,
    priceResolved: resolved,
  }];
  plan.expectedTotalAfter = plan.expectedTotalBefore + (resolved ? vol * (priced.unitPrice as number) : 0);
  if (volume == null) plan.warnings.push('Volume tidak disebutkan — memakai 1 ' + rec.unit + '. Ubah setelahnya bila perlu.');
  if (!resolved) plan.warnings.push(`Komposisi ${rec.code} belum lengkap di katalog (status ${priced.pricingStatus}) — item ditambahkan TANPA harga (tetap kosong, bukan Rp0).`);
  plan.previewText = formatPlanPreview(plan, snap);
  return { ok: true, plan: registerPlan(plan) };
}

/** Bangun plan undo dari record operasi terakhir yang masih bisa di-undo. */
export function buildUndoPlan(
  snap: ProjectSnapshot,
  record: OperationRecord,
  actor: string,
): PlanBuildResult {
  if (record.projectId !== snap.projectId) return { ok: false, message: 'Record operasi bukan milik proyek aktif.' };
  if (record.status !== 'executed') return { ok: false, message: 'Operasi itu sudah di-undo atau gagal — tidak bisa di-undo lagi.' };
  const plan = basePlan(snap, 'undo', record.kind === 'undo' ? 'update_quantity' : record.kind, actor);
  plan.undoOfRecordId = record.id;

  if (record.kind === 'update_quantity' || record.kind === 'update_unit_price') {
    const b = record.before as { itemId: string; value: number | null } | null;
    const a = record.after as { itemId: string; value: number | null } | null;
    if (!b || !a) return { ok: false, message: 'Record operasi tidak memuat nilai sebelum/sesudah — undo tidak tersedia.' };
    const cur = snapshotAllItems(snap).find((i) => i.id === b.itemId);
    if (!cur) return { ok: false, message: 'Item target undo sudah tidak ada di proyek — undo dibatalkan agar tidak menimpa keadaan sekarang.' };
    const curVal = record.kind === 'update_quantity' ? cur.volume : cur.unitPrice;
    if (curVal !== a.value) {
      return { ok: false, message: `Nilai item sudah berubah sejak operasi itu (sekarang ${curVal == null ? 'belum tersedia' : fmtNum(curVal)}, hasil operasi ${a.value == null ? 'belum tersedia' : fmtNum(a.value)}). Undo DITOLAK agar tidak menimpa perubahan yang lebih baru.` };
    }
    plan.action = record.kind;
    plan.targets = [targetOf(cur)];
    plan.field = record.kind === 'update_quantity' ? 'volume' : 'unitPrice';
    plan.before = a.value;
    plan.after = b.value;
    const restoredTotal = record.kind === 'update_quantity'
      ? (cur.priceStatus === 'PRICE_UNRESOLVED' ? 0 : (b.value ?? 0) * (cur.unitPrice ?? 0))
      : cur.volume * (b.value ?? 0);
    plan.expectedTotalAfter = plan.expectedTotalBefore - itemTotal(cur) + restoredTotal;
  } else if (record.kind === 'add_item') {
    const ids = record.createdItemIds ?? [];
    const cur = ids.length === 1 ? snapshotAllItems(snap).find((i) => i.id === ids[0]) : undefined;
    if (!cur) return { ok: false, message: 'Item hasil penambahan sudah tidak ditemukan apa adanya — undo dibatalkan agar tidak menghapus item yang salah.' };
    plan.action = 'delete_items';
    plan.targets = [targetOf(cur)];
    plan.beforeItems = [cur];
    plan.expectedTotalAfter = plan.expectedTotalBefore - itemTotal(cur);
  } else if (record.kind === 'delete_items') {
    const before = record.beforeItems ?? [];
    if (before.length === 0) return { ok: false, message: 'Record penghapusan tidak memuat baris asal — undo tidak tersedia.' };
    if (before.some((b) => snapshotAllItems(snap).some((i) => i.id === b.id))) {
      return { ok: false, message: 'Sebagian item yang dihapus ternyata sudah ada lagi di proyek — undo dibatalkan untuk menghindari duplikasi.' };
    }
    plan.action = 'add_item';
    const rawRows = record.beforeRawItems;
    const hasRaw = Array.isArray(rawRows) && rawRows.length === before.length;
    plan.addItems = before.map((b, idx) => ({
      code: b.code,
      description: b.description,
      unit: b.unit,
      volume: b.volume,
      unitPrice: b.unitPrice,
      priceResolved: b.priceStatus === 'PRICE_RESOLVED',
      restoreOf: b,
      restoreRaw: hasRaw ? rawRows[idx] : undefined,
    }));
    plan.expectedTotalAfter = plan.expectedTotalBefore + before.reduce((s, i) => s + itemTotal(i), 0);
    plan.warnings.push(hasRaw
      ? 'Item dipulihkan PERSIS seperti sebelum dihapus — baris mentah tersimpan utuh, dan ID asal ikut pulih sehingga kaitan lain (mis. pemetaan QTO) tetap berlaku.'
      : 'Item dipulihkan dengan ID baru yang diberikan aplikasi; isi (uraian, volume, harga, satuan) persis seperti sebelum dihapus, tetapi kaitan eksternal berbasis ID lama (mis. pemetaan QTO) tidak otomatis tersambung kembali.');
  } else {
    return { ok: false, message: 'Jenis operasi ini tidak mendukung undo.' };
  }
  plan.previewText = formatPlanPreview(plan, snap);
  return { ok: true, plan: registerPlan(plan) };
}

/* ---------------- Teks pratinjau --------------------------------------------- */

const ACTION_LABEL: Record<ChangePlan['action'], string> = {
  update_quantity: 'Ubah kuantitas item',
  update_unit_price: 'Ubah harga satuan item (manual)',
  add_item: 'Tambah item dari katalog AHSP',
  delete_items: 'Hapus item',
};

export function formatPlanPreview(plan: ChangePlan, _snap?: ProjectSnapshot): string {
  const L: string[] = [];
  L.push(plan.kind === 'undo' ? 'PRATINJAU UNDO — belum dieksekusi.' : 'PRATINJAU OPERASI — belum dieksekusi.');
  L.push('Perubahan hanya berjalan bila Anda menekan tombol Konfirmasi pada kartu ini. Bila data proyek berubah sebelum konfirmasi, pratinjau batal otomatis.');
  L.push(`Proyek: ${plan.projectName}`);
  L.push(`Operasi: ${ACTION_LABEL[plan.action]}${plan.kind === 'undo' ? ' (undo)' : ''}`);
  if (plan.action === 'update_quantity' || plan.action === 'update_unit_price') {
    const t = plan.targets[0];
    if (t) L.push(`Item: ${t.description} (${t.code || 'tanpa kode'}) — Seksi: ${t.sectionName || '-'}`);
    if (plan.field === 'volume') {
      L.push(`Field: Volume`);
      L.push(`Nilai saat ini: ${fmtNum(plan.before ?? 0)} ${t?.unit ?? ''}`);
      L.push(`Nilai usulan: ${fmtNum(plan.after ?? 0)} ${t?.unit ?? ''}`);
      L.push(`Perubahan: ${fmtNum((plan.after ?? 0) - (plan.before ?? 0))} ${t?.unit ?? ''}`);
    } else {
      L.push(`Field: Harga satuan (manual)`);
      L.push(`Nilai saat ini: ${plan.before != null ? fmtRp(plan.before) + '/' + (t?.unit ?? '') : 'belum tersedia'}`);
      L.push(`Nilai usulan: ${plan.after != null ? fmtRp(plan.after) + '/' + (t?.unit ?? '') : '—'}`);
    }
  } else if (plan.action === 'delete_items') {
    L.push(`Item yang akan dihapus (${plan.targets.length}):`);
    for (const t of plan.targets) L.push(`- ${t.description} (${t.code || 'tanpa kode'}) — Seksi: ${t.sectionName || '-'}`);
  } else if (plan.action === 'add_item') {
    for (const a of plan.addItems ?? []) {
      L.push(`Item baru: ${a.description} (${a.code}) — ${fmtNum(a.volume)} ${a.unit} × ${a.unitPrice != null ? fmtRp(a.unitPrice) : 'harga belum tersedia'}`);
    }
  }
  const delta = plan.expectedTotalAfter - plan.expectedTotalBefore;
  L.push(`Perkiraan total proyek: ${fmtRp(plan.expectedTotalBefore)} → ${fmtRp(plan.expectedTotalAfter)} (Δ ${delta >= 0 ? '+' : '−'}${fmtRp(Math.abs(delta))}). Angka final direkalkulasi mesin EZRAB saat eksekusi dan diverifikasi sesudahnya.`);
  for (const w of plan.warnings) L.push(`Peringatan: ${w}`);
  L.push(`Berlaku sampai: ${new Date(plan.expiresAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB.`);
  return L.join('\n');
}

/* ---------------- Host & eksekusi --------------------------------------------- */

export interface OperationHost {
  projectId: string;
  /** Item proyek aktif saat ini juga (dibangun ulang dari state aplikasi). */
  readItems: () => ProjectItemSnapshot[];
  applyUpdateQuantity: (itemId: string, volume: number) => void;
  /** Harga manual lewat mutator harga manual milik aplikasi (label resmi gugur). */
  applyManualUnitPrice: (itemId: string, price: number) => void;
  applyDelete: (itemIds: string[]) => void;
  /** Mengembalikan ID item yang benar-benar dibuat, atau null bila gagal. */
  applyAdd: (itemData: Record<string, unknown>) => string | null;
  /** Snapshot versi proyek (createVersionSnapshot) — pengaman sebelum hapus. */
  createSafetySnapshot?: (description: string) => string | null;
  /** Baris mentah RabItem penuh menurut ID — untuk fidelitas undo hapus. */
  readRawItem?: (itemId: string) => Record<string, unknown> | null;
  persistenceStatus: () => 'saved' | 'saving' | 'dirty' | 'error';
}

export interface ExecuteResult {
  ok: boolean;
  message: string;
  recordId?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function outcomeVerified(plan: ChangePlan, items: ProjectItemSnapshot[], createdIds: string[]): boolean {
  if (plan.action === 'update_quantity' || plan.action === 'update_unit_price') {
    const t = items.find((i) => i.id === plan.targets[0]?.itemId);
    if (!t) return false;
    return plan.field === 'volume' ? t.volume === plan.after : t.unitPrice === plan.after;
  }
  if (plan.action === 'delete_items') {
    return plan.targets.every((t) => !items.some((i) => i.id === t.itemId));
  }
  // add_item
  return createdIds.length > 0 && createdIds.every((id) => items.some((i) => i.id === id));
}

export async function executePlan(plan: ChangePlan, host: OperationHost): Promise<ExecuteResult> {
  const fail = (message: string, recordIt = false): ExecuteResult => {
    plan.status = 'failed';
    if (recordIt) {
      appendOperationRecord({
        id: newRecordId(), ts: Date.now(), projectId: plan.projectId, projectName: plan.projectName,
        actor: plan.actor, kind: plan.kind === 'undo' ? 'undo' : plan.action,
        summary: `${ACTION_LABEL[plan.action]} — GAGAL: ${message}`,
        targetIds: plan.targets.map((t) => t.itemId), before: null, after: null,
        status: 'failed', persistence: 'unknown',
      });
    }
    return { ok: false, message };
  };

  if (plan.status !== 'pending') return { ok: false, message: 'Pratinjau ini sudah tidak berlaku (sudah diproses atau dibatalkan). Buat permintaan baru bila masih diperlukan.' };
  if (Date.now() > plan.expiresAt) {
    plan.status = 'expired';
    return { ok: false, message: 'Pratinjau kedaluwarsa (lebih dari 10 menit). Buat permintaan baru agar angka yang ditampilkan selalu data terbaru.' };
  }
  if (host.projectId !== plan.projectId) {
    return fail('Proyek aktif sudah berganti sejak pratinjau dibuat — operasi DIBATALKAN agar tidak menyentuh proyek yang salah.');
  }
  const currentItems = host.readItems();
  if (hashProjectItems(currentItems) !== plan.stateHash) {
    return fail('Data proyek berubah sejak pratinjau dibuat (edit lain terdeteksi) — operasi DIBATALKAN. Minta pratinjau baru agar perubahan dihitung dari data terbaru.');
  }

  // Tangkap baris mentah penuh sebelum penghapusan (fidelitas undo: factory
  // aplikasi mempertahankan ID yang diberikan, jadi pemulihan bersifat
  // persis — seluruh field + ID asal — bila baris mentah tersedia).
  let beforeRawItems: Array<Record<string, unknown>> | undefined;
  if (plan.action === 'delete_items' && host.readRawItem) {
    const rows: Array<Record<string, unknown>> = [];
    for (const t of plan.targets) {
      const raw = host.readRawItem(t.itemId);
      if (raw) rows.push(raw);
    }
    if (rows.length === plan.targets.length) beforeRawItems = rows;
  }

  // Snapshot pengaman sebelum penghapusan (infrastruktur versi yang sudah ada).
  let safetySnapshotId: string | null = null;
  if (plan.action === 'delete_items' && host.createSafetySnapshot) {
    try {
      safetySnapshotId = host.createSafetySnapshot(`Asisten AI: sebelum hapus ${plan.targets.length} item`);
    } catch { safetySnapshotId = null; }
  }

  // Terapkan lewat mutator kanonis.
  const createdIds: string[] = [];
  try {
    if (plan.action === 'update_quantity') {
      host.applyUpdateQuantity(plan.targets[0].itemId, plan.after as number);
    } else if (plan.action === 'update_unit_price') {
      host.applyManualUnitPrice(plan.targets[0].itemId, plan.after as number);
    } else if (plan.action === 'delete_items') {
      host.applyDelete(plan.targets.map((t) => t.itemId));
    } else if (plan.action === 'add_item') {
      for (const a of plan.addItems ?? []) {
        const data: Record<string, unknown> = a.restoreRaw
          ? { ...a.restoreRaw }
          : a.restoreOf
          ? {
              description: a.restoreOf.description, volume: a.restoreOf.volume, unit: a.restoreOf.unit,
              code: a.restoreOf.code, ahspCode: a.restoreOf.ahspCode ?? '', unitPrice: a.restoreOf.unitPrice,
              priceStatus: a.restoreOf.priceStatus,
            }
          : {
              description: a.description, volume: a.volume, unit: a.unit, code: a.code,
              ahspCode: a.code, unitPrice: a.unitPrice,
              priceStatus: a.priceResolved ? 'PRICE_RESOLVED' : 'PRICE_UNRESOLVED',
              priceSourceKind: a.priceResolved ? 'OFFICIAL_AHSP' : 'UNRESOLVED',
              ahspMappingStatus: 'VERIFIED',
            };
        const id = host.applyAdd(data);
        if (id) createdIds.push(id);
      }
      if (createdIds.length !== (plan.addItems?.length ?? 0)) {
        return fail('Penambahan item tidak terkonfirmasi seluruhnya di state aplikasi — hasil dilaporkan gagal agar tidak menyesatkan.', true);
      }
    }
  } catch {
    return fail('Mutator aplikasi melempar kesalahan saat menerapkan perubahan — operasi dilaporkan gagal.', true);
  }

  // Verifikasi hasil + persistensi (state React menetap asinkron; polling singkat).
  let verifiedItems: ProjectItemSnapshot[] | null = null;
  let persistence: OperationRecord['persistence'] = 'unknown';
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const items = host.readItems();
    if (outcomeVerified(plan, items, createdIds)) {
      verifiedItems = items;
      const st = host.persistenceStatus();
      if (st === 'saved') { persistence = 'saved'; break; }
      if (st === 'error') { persistence = 'error'; break; }
    }
    await sleep(120);
  }
  if (!verifiedItems) {
    return fail('Perubahan tidak terverifikasi di state aplikasi dalam batas waktu — operasi TIDAK dinyatakan berhasil. Periksa spreadsheet proyek secara manual.', true);
  }
  if (persistence === 'unknown') {
    const st = host.persistenceStatus();
    persistence = st === 'saved' ? 'saved' : st === 'error' ? 'error' : 'unknown';
  }

  const verifiedTotal = sumTotal(verifiedItems);
  const totalNote = Math.abs(verifiedTotal - plan.expectedTotalAfter) <= 1
    ? `Total proyek terverifikasi: ${fmtRp(verifiedTotal)}.`
    : `Total proyek setelah rekalkulasi: ${fmtRp(verifiedTotal)} (perkiraan pratinjau ${fmtRp(plan.expectedTotalAfter)} — selisih berasal dari rekalkulasi mesin atas seluruh item).`;

  const recordId = newRecordId();
  const beforeVal = plan.action === 'update_quantity' || plan.action === 'update_unit_price'
    ? { itemId: plan.targets[0]?.itemId, value: plan.before }
    : null;
  const afterVal = plan.action === 'update_quantity' || plan.action === 'update_unit_price'
    ? { itemId: plan.targets[0]?.itemId, value: plan.after }
    : null;
  appendOperationRecord({
    id: recordId, ts: Date.now(), projectId: plan.projectId, projectName: plan.projectName,
    actor: plan.actor, kind: plan.kind === 'undo' ? 'undo' : plan.action,
    summary: plan.kind === 'undo' ? `Undo: ${ACTION_LABEL[plan.action]}` : ACTION_LABEL[plan.action],
    targetIds: plan.targets.map((t) => t.itemId),
    before: beforeVal, after: afterVal,
    status: 'executed', persistence, safetySnapshotId,
    createdItemIds: createdIds.length ? createdIds : undefined,
    beforeItems: plan.beforeItems,
    beforeRawItems,
  });
  if (plan.kind === 'undo' && plan.undoOfRecordId) {
    markRecordUndone(plan.undoOfRecordId, recordId);
  }
  plan.status = 'executed';

  const persistNote = persistence === 'saved'
    ? 'Penyimpanan lokal terkonfirmasi tersimpan.'
    : persistence === 'error'
      ? 'PERINGATAN: perubahan tampil di aplikasi tetapi penyimpanan lokal melaporkan error — jangan tutup aplikasi sebelum status simpan pulih.'
      : 'Status penyimpanan lokal belum terkonfirmasi saat pemeriksaan (perubahan sudah ada di state aplikasi).';
  const targetDesc = plan.targets[0]?.description ?? plan.addItems?.[0]?.description ?? '';
  return {
    ok: true,
    recordId,
    message:
      `Operasi berhasil dan terverifikasi: ${ACTION_LABEL[plan.action]}${targetDesc ? ` — ${targetDesc}` : ''}. ` +
      `${totalNote} ${persistNote} Operasi tercatat di riwayat Asisten AI dan dapat di-undo selama belum ada perubahan lain pada item yang sama.`,
  };
}
