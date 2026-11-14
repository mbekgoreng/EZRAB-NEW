/**
 * draftRevision.ts — REVISI PASCA-GENERATE IMMUTABLE (Phase 5 Gate 3 / 5C,
 * direktif master owner 2026-11-12 11:45 WIB §5).
 *
 * Memutuskan pertanyaan alur revisi pasca-generate yang tertunda sejak
 * rantai spek: tiap revisi menciptakan versi RAB immutable BARU; versi
 * sebelumnya tetap tidak berubah; aktivasi HANYA sesudah konfirmasi
 * eksplisit user.
 *
 * LAPISAN, BUKAN MESIN KEDUA: modul ini TIDAK menggantikan
 * `reviseUniversalDraft` — ia menjalankannya pada KLON draft aktif
 * (pratinjau), lalu mengaktifkan klon itu sebagai versi baru sesudah
 * konfirmasi. Gerbang relevansi, validasi rantai spek (6 butir, via
 * `snapshotVersion` pada klon), komposisi per gedung Gate 2, dan
 * aritmetika kanonis berlaku otomatis karena jalur yang sama yang
 * dipakai — bukan jalur paralel.
 *
 * Kontrak:
 *  - `buildRevisionPreview` TIDAK PERNAH mengubah draft aktif maupun
 *    singleton (singleton dipulihkan sesudah revisi klon) dan TIDAK
 *    PERNAH menulis storage. Hasilnya: pratinjau / klarifikasi /
 *    penolakan / tidak-dikenali (jatuh ke routing normal).
 *  - `activateRevision` adalah SATU-SATUNYA penulis versi baru:
 *    cek kunci idempotensi → cek baseVersion + baseUpdatedAt (stale) →
 *    cek urutan versi kandidat → cek kesiapan kandidat (P4-guard CD-7:
 *    kandidat BLOCKED ditolak dengan kode DRAFT_NOT_READY, memakai
 *    `draftReadiness` yang sama dengan guard transfer — bar yang sama,
 *    NEEDS_SPEC tetap boleh aktif) → seed snapshot versi lama bila
 *    perlu → append snapshot versi baru → SATU tulis `saveVersioned` →
 *    singleton diperbarui HANYA sesudah tulis sukses. Gagal di titik
 *    mana pun = versi aktif utuh.
 *  - Kunci aktivasi memakai `deriveIdempotencyKey` toolRegistry yang
 *    sama dengan registry tool (pola deterministik yang ada — bukan
 *    skema kedua).
 *  - Definisi "komponen yang belum disetujui" (§1.4 laporan Gate 3):
 *    item dengan harga BELUM TERSEDIA (PRICE_UNRESOLVED). Tidak ada
 *    status persetujuan per item di struktur data — definisi ini
 *    dinyatakan, bukan disembunyikan.
 */

import { deriveIdempotencyKey } from './toolRegistry';
import {
  buildPersistedRecord,
  loadDraft,
  peekPersistedDraft,
  writeDraftRecord,
} from './draftPersistence';
import {
  computeSectionTotals,
  computeTotals,
  draftReadiness,
  effectiveItems,
  getLastUniversalDraft,
  getLastUniversalDraftProjectId,
  isPriceValidForTotal,
  itemKey,
  parseRupiahAmount,
  reconcileMultiBuildingTotals,
  reviseUniversalDraft,
  setLastUniversalDraft,
  snapshotVersion,
  rebuildWbsAttachment,
  type DraftItem,
  type UniversalDraft,
} from './universalRab';
import { parseBuildingRevision } from './multiBuildingRab';
import {
  assessBudgetFeasibility,
  formatBudgetFeasibilityLine,
  formatRupiah,
} from './budgetFeasibility';

/* ------------------------------------------------------------------ */
/* Tipe                                                                */
/* ------------------------------------------------------------------ */

/** Snapshot PENUH satu versi draft (immutable — tidak pernah ditulis ulang). */
export interface DraftVersionSnapshot {
  version: number;
  draftId: string;
  summary: string;
  createdAt: string;
  /**
   * Kunci idempotensi aktivasi yang menciptakan versi ini; null untuk
   * benih (keadaan aktif pra-Gate 3 yang disnapshot pada aktivasi
   * pertama — tidak diciptakan oleh satu aktivasi berkunci).
   */
  activationKey: string | null;
  /** Permintaan revisi mentah yang menciptakan versi ini; null untuk benih. */
  requestText: string | null;
  /** Salinan penuh draft versi ini (deep copy — pemilik snapshot). */
  draft: UniversalDraft;
  itemCount: number;
  estimatedTotal: number;
}

/** Perbandingan satu seksi sebelum vs sesudah revisi. */
export interface SectionDiff {
  key: string;
  label: string;
  kind: 'building' | 'shared-works' | 'project';
  beforeTotal: number;
  afterTotal: number;
  beforeItems: number;
  afterItems: number;
  changed: boolean;
}

export interface RevisionTotals {
  estimatedTotal: number;
  itemCount: number;
  unpricedCount: number;
}

/** Pratinjau revisi — kandidat BELUM AKTIF sampai `activateRevision`. */
export interface RevisionPreview {
  requestText: string;
  projectId: string | null;
  draftId: string;
  baseVersion: number;
  /** updatedAt record saat pratinjau dibuat (penjaga stale — null bila draft belum tersimpan). */
  baseUpdatedAt: string | null;
  targetVersion: number;
  /** Kunci idempotensi deterministik aktivasi ini. */
  activationKey: string;
  changes: string[];
  before: RevisionTotals;
  after: RevisionTotals;
  sections: SectionDiff[];
  /** Label gedung yang model/part-nya berubah. */
  affectedBuildings: string[];
  /** Label seksi yang TIDAK berubah (total + jumlah item identik). */
  unchangedSections: string[];
  /** Catatan kelayakan budget (bila draft membawa budgetCap / revisi budget). */
  budgetNote: string | null;
  reconciled: boolean;
  reconciliationDiffRp: number;
  /** Kandidat versi baru (klon hasil revisi — BELUM aktif, BELUM tersimpan). */
  candidate: UniversalDraft;
}

export type RevisionPreviewOutcome =
  | { kind: 'preview'; preview: RevisionPreview }
  | { kind: 'clarification'; message: string; questions: string[] }
  | { kind: 'rejected'; message: string }
  | { kind: 'unrecognized' };

export type ActivationResult =
  | {
      ok: true;
      alreadyActivated: boolean;
      version: number;
      updatedAt: string;
      message: string;
    }
  | {
      ok: false;
      stale?: boolean;
      error: string;
      message: string;
    };

/** Maksimum snapshot penuh yang disimpan per proyek (ringkasan versions[] tetap utuh). */
export const MAX_VERSION_SNAPSHOTS = 20;

/* ------------------------------------------------------------------ */
/* Util                                                                */
/* ------------------------------------------------------------------ */

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeRequest(rawText: string): string {
  return (rawText || '').trim().replace(/\s+/g, ' ');
}

function totalsOf(draft: UniversalDraft): RevisionTotals {
  const t = computeTotals(draft);
  return {
    estimatedTotal: t.estimatedTotal,
    itemCount: effectiveItems(draft).length,
    unpricedCount: t.unpricedCount,
  };
}

/** Diff per seksi + gedung terdampak antara dua draft. */
function diffDrafts(
  before: UniversalDraft,
  after: UniversalDraft,
): {
  sections: SectionDiff[];
  affectedBuildings: string[];
  unchangedSections: string[];
  reconciled: boolean;
  reconciliationDiffRp: number;
} {
  const beforeSecs = new Map(computeSectionTotals(before).map((s) => [s.key, s]));
  const afterSecs = new Map(computeSectionTotals(after).map((s) => [s.key, s]));
  const keys = new Set([...beforeSecs.keys(), ...afterSecs.keys()]);
  const sections: SectionDiff[] = [];
  for (const key of keys) {
    const b = beforeSecs.get(key);
    const a = afterSecs.get(key);
    const beforeTotal = b?.totals.estimatedTotal ?? 0;
    const afterTotal = a?.totals.estimatedTotal ?? 0;
    const beforeItems = b?.itemCount ?? 0;
    const afterItems = a?.itemCount ?? 0;
    sections.push({
      key,
      label: (a ?? b)?.label ?? key,
      kind: (a ?? b)?.kind ?? 'project',
      beforeTotal,
      afterTotal,
      beforeItems,
      afterItems,
      changed: beforeTotal !== afterTotal || beforeItems !== afterItems,
    });
  }
  // Gedung terdampak: seksi gedung berubah ATAU model gedung berubah.
  const changedBuildingIds = new Set(
    sections.filter((s) => s.kind === 'building' && s.changed).map((s) => s.key),
  );
  const beforeModels = new Map((before.buildings ?? []).map((b) => [b.id, b]));
  const afterModels = new Map((after.buildings ?? []).map((b) => [b.id, b]));
  for (const [id, m] of afterModels) {
    const prev = beforeModels.get(id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(m)) changedBuildingIds.add(id);
  }
  const labelOf = (id: string): string =>
    afterModels.get(id)?.label ?? beforeModels.get(id)?.label ?? id;
  const affectedBuildings = [...changedBuildingIds].map(labelOf);
  const unchangedSections = sections.filter((s) => !s.changed).map((s) => s.label);
  const rec = reconcileMultiBuildingTotals(after);
  return {
    sections,
    affectedBuildings,
    unchangedSections,
    reconciled: rec.balanced,
    reconciliationDiffRp: rec.diffRp,
  };
}

function budgetNoteFor(draft: UniversalDraft): string | null {
  const cap = draft.spec.budgetCap;
  if (cap == null) return null;
  const t = computeTotals(draft);
  return formatBudgetFeasibilityLine(
    assessBudgetFeasibility({
      totalPriced: t.estimatedTotal,
      unpricedCount: t.unpricedCount,
      budgetCap: cap,
    }),
  );
}

function makePreview(
  active: UniversalDraft,
  candidate: UniversalDraft,
  rawText: string,
  projectId: string | null,
  changes: string[],
  baseUpdatedAt: string | null,
): RevisionPreview {
  // P6 (P3D-O2): kandidat dibangun ulang artefak + laporan WBS-nya
  // dari parts terbarunya, dengan artefak versi aktif sebagai
  // previousArtifact — pengecualian node + catatan user bertahan
  // lintas revisi (kontrak P3D §8). Satu situs ini melayani KETIGA
  // jalur pratinjau (budget-only, hapus-unresolved, umum) karena
  // ketiganya bermuara ke makePreview. Kandidat adalah klon milik
  // pratinjau — draft aktif tidak tersentuh.
  rebuildWbsAttachment(candidate, active.wbsArtifact ?? null);
  const diff = diffDrafts(active, candidate);
  return {
    requestText: normalizeRequest(rawText),
    projectId,
    draftId: active.id,
    baseVersion: active.version,
    baseUpdatedAt,
    targetVersion: candidate.version,
    activationKey: deriveIdempotencyKey('activate_revision', projectId ?? null, {
      draftId: active.id,
      baseVersion: active.version,
      request: normalizeRequest(rawText).toLowerCase(),
    }),
    changes,
    before: totalsOf(active),
    after: totalsOf(candidate),
    sections: diff.sections,
    affectedBuildings: diff.affectedBuildings,
    unchangedSections: diff.unchangedSections,
    budgetNote: budgetNoteFor(candidate),
    reconciled: diff.reconciled,
    reconciliationDiffRp: diff.reconciliationDiffRp,
    candidate,
  };
}

function snapshotOf(
  draft: UniversalDraft,
  summary: string,
  activationKey: string | null,
  requestText: string | null,
): DraftVersionSnapshot {
  const t = computeTotals(draft);
  return {
    version: draft.version,
    draftId: draft.id,
    summary,
    createdAt: new Date().toISOString(),
    activationKey,
    requestText,
    draft: deepCopy(draft),
    itemCount: effectiveItems(draft).length,
    estimatedTotal: t.estimatedTotal,
  };
}

/* ------------------------------------------------------------------ */
/* Parsing permintaan revisi khusus                                    */
/* ------------------------------------------------------------------ */

/** Nominal rupiah dari teks ("250 juta", "Rp 1,5 miliar", "Rp 250.000.000"). */
function parseBudgetAmount(text: string): number | null {
  const t = (text || '').toLowerCase();
  const m = t.match(
    /(?:anggaran|budget|dana)\b[^.\d]{0,40}?(?:rp\.?\s*)?([\d.]+(?:,\d+)?)\s*(miliar|milyar|jt|juta|rb|ribu)?\b/,
  );
  if (!m) return null;
  const v = parseRupiahAmount(m[1], m[2]);
  if (!Number.isFinite(v) || v <= 0) return null;
  // Tanpa satuan, angka kecil (< Rp1 juta) hampir pasti bukan nominal
  // budget (mis. "anggaran 50" tanpa konteks) — tolak sebagai bukan
  // nominal agar tidak ditebak.
  if (!m[2] && v < 1_000_000) return null;
  return v;
}

function isBudgetRevisionRequest(text: string): boolean {
  const t = (text || '').toLowerCase();
  return (
    /\b(budget|anggaran|dana)\b/.test(t) &&
    /\b(revisi|ubah|ganti|menjadi|jadi|naik|turun|tambah|kurang|sesuaikan|setel|atur|naikkan|turunkan)\b/.test(t)
  );
}

function isUnresolvedRemovalRequest(text: string): boolean {
  const t = (text || '').toLowerCase();
  return (
    /\b(hapus|hilangkan)\b/.test(t) &&
    /belum disetujui|belum ada harga|tanpa harga|belum berharga|belum ditentukan harganya/.test(t)
  );
}

const SCOPE_NOUNS = [
  'atap', 'pondasi', 'struktur', 'finishing', 'dinding', 'lantai', 'plafon',
  'cat', 'keramik', 'genteng', 'kuda-kuda', 'kolom', 'balok', 'sloof',
  'pintu', 'jendela', 'mep', 'listrik', 'plumbing', 'sanitasi', 'tangga',
];

function mentionedBuildingLabel(text: string): string | null {
  const patch = parseBuildingRevision(text);
  if (patch) return patch.label;
  const m = (text || '').toLowerCase().match(/(?:gedung|bangunan|blok|tower|menara)\s+([a-z])\b/);
  return m ? `Gedung ${m[1].toUpperCase()}` : null;
}

/**
 * Deteksi permintaan KURANG-SPESIFIK yang tidak boleh ditebak — dievaluasi
 * SEBELUM mesin revisi berjalan. Mengembalikan pesan klarifikasi bila
 * kurang-spesifik, null bila cukup spesifik untuk diteruskan.
 *
 * Yang SUDAH ditangani mesin revisi (penjaga ambiguitas Gate 2 — revisi
 * ukuran tanpa alamat gedung) sengaja TIDAK diduplikasi di sini: mesin
 * mengembalikannya sebagai penolakan dengan pesan klarifikasinya sendiri.
 */
function detectUnderspecified(
  active: UniversalDraft,
  rawText: string,
): { message: string; questions: string[] } | null {
  const t = (rawText || '').toLowerCase();
  const isMulti = (active.buildings?.length ?? 0) >= 2;
  const buildings = (active.buildings ?? []).map((b) => b.label).join(', ');

  // 1. Budget tanpa nominal — tidak ada angka yang bisa dipakai.
  if (isBudgetRevisionRequest(rawText) && parseBudgetAmount(rawText) == null) {
    return {
      message:
        'Revisi budget butuh nominal baru — sebutkan angkanya (mis. "revisi budget menjadi Rp 900 juta"). Spek terkonfirmasi tidak akan berubah; hanya batas anggaran yang diperbarui dan dinilai kelayakannya.',
      questions: ['Berapa batas anggaran yang baru?'],
    };
  }

  // 2. Ukuran tanpa angka ("tambah luas bangunan") — tidak ada nilai baru.
  if (
    /\b(tambah|tambahkan|kurang|kurangi|ubah|ganti|naik|turun)\b/.test(t) &&
    /\b(luas|panjang|lebar|lantai|tebal|bentang|tinggi)\b/.test(t) &&
    !/\d/.test(t)
  ) {
    const where = isMulti ? ` dan gedung mana (${buildings})` : '';
    return {
      message: `Perubahan ukuran butuh nilai baru — sebutkan angkanya${where} (mis. "tambah luas bangunan menjadi 200 m²"${isMulti ? ' atau "ubah luas Gedung B menjadi 120 m²"' : ''}). Draft tidak berubah sampai nilainya jelas.`,
      questions: ['Berapa nilai baru yang diminta?', ...(isMulti ? ['Gedung mana yang diubah?'] : [])],
    };
  }

  // 3. Ganti cakupan tanpa varian pengganti ("ganti atap Gedung A",
  //    "ubah atapnya") — varian pengganti tidak disebut.
  // 3. Ganti cakupan tanpa varian pengganti ("ganti atap Gedung A",
  //    "ubah atapnya") — varian pengganti tidak disebut. Revisi
  //    beralamat gedung (parseBuildingRevision non-null — mis. "ubah
  //    Gedung B dari 2 lantai jadi 3 lantai", yang menyebut "lantai")
  //    BUKAN ganti-cakupan dan didahulukan; konektor varian "jadi"
  //    juga mengecualikan (ditangani cabang switch mesin revisi).
  //    Sufiks posesif ("atapnya", "lantainya") ikut dikenali.
  const scopeHit = SCOPE_NOUNS.find((n) => new RegExp(`\\b${n}(nya|ku|mu)?\\b`).test(t));
  if (
    scopeHit &&
    /\b(ganti|ubah)\b/.test(t) &&
    !/\b(menjadi|dengan|jadi)\b/.test(t) &&
    !parseBuildingRevision(rawText)
  ) {
    const building = mentionedBuildingLabel(rawText);
    const questions: string[] = [`${scopeHit} diganti menjadi apa?`];
    if (isMulti && !building) questions.push(`Gedung mana yang ${scopeHit}-nya diganti? (${buildings})`);
    return {
      message:
        `Ganti ${scopeHit} butuh varian pengganti — sebutkan menjadi apa` +
        (isMulti && !building ? ` dan gedung mana (${buildings})` : building ? ` untuk ${building}` : '') +
        ` (mis. "ganti atap${isMulti ? ' Gedung A' : ''} menjadi baja ringan"). Draft tidak berubah sampai variannya jelas.`,
      questions,
    };
  }

  // 4. Hapus berdasarkan nama yang cocok di LEBIH DARI SATU gedung —
  //    mesin revisi akan mengenai kecocokan pertama (gedung yang salah).
  if (isMulti && /\b(hapus|hilangkan)\b/.test(t) && !isUnresolvedRemovalRequest(rawText)) {
    const m = t.match(/(?:hapus|hilangkan)\s+(?:item\s+)?(?:nomor\s+)?(\d+|.*)/);
    const arg = (m?.[1] ?? '').trim();
    if (arg && !/^\d+$/.test(arg) && !mentionedBuildingLabel(rawText)) {
      const items = effectiveItems(active);
      const hits = items.filter((i) => i.description.toLowerCase().includes(arg));
      const hitBuildings = new Set(hits.map((i) => i.__buildingId ?? 'project'));
      if (hits.length > 0 && hitBuildings.size > 1) {
        return {
          message: `Item "${arg}" ada di lebih dari satu gedung (${hits.length} kecocokan) — sebutkan gedungnya agar hanya gedung itu yang berubah (mis. "hapus ${arg} di Gedung B"). Draft tidak berubah.`,
          questions: [`Item "${arg}" di gedung mana yang dihapus? (${buildings})`],
        };
      }
      if (hits.length === 0) {
        // Diteruskan ke mesin revisi — ia mengembalikan penolakan
        // "tidak ditemukan" yang sama jujurnya. Bukan klarifikasi.
        return null;
      }
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* buildRevisionPreview — pratinjau di atas klon (tanpa efek samping)  */
/* ------------------------------------------------------------------ */

export function buildRevisionPreview(
  active: UniversalDraft,
  rawText: string,
  projectId?: string | null,
): RevisionPreviewOutcome {
  const pid = projectId ?? null;
  const baseUpdatedAt = pid ? (peekPersistedDraft(pid)?.updatedAt ?? null) : null;

  // --- Klarifikasi tertarget untuk permintaan kurang-spesifik ---
  const underspecified = detectUnderspecified(active, rawText);
  if (underspecified) {
    return { kind: 'clarification', message: underspecified.message, questions: underspecified.questions };
  }

  // --- Jalur budget-only: ubah budgetCap SAJA, spek lain byte-identik ---
  if (isBudgetRevisionRequest(rawText)) {
    const amount = parseBudgetAmount(rawText);
    if (amount != null) {
      if (active.spec.budgetCap === amount) {
        return {
          kind: 'rejected',
          message: `Batas anggaran sudah ${formatRupiah(amount)} — tidak ada perubahan. Draft tidak berubah.`,
        };
      }
      const candidate = deepCopy(active);
      const beforeCap = candidate.spec.budgetCap;
      candidate.spec.budgetCap = amount;
      // VERIFIKASI: spek lain harus identik byte-per-byte (budget adalah
      // constraint, bukan spek — revisi budget tidak mengubah spek
      // terkonfirmasi). Perbandingan meniadakan budgetCap di kedua sisi.
      const stripCap = (s: UniversalDraft['spec']) => {
        const c = { ...s, budgetCap: null };
        return JSON.stringify(c);
      };
      if (stripCap(active.spec) !== stripCap(candidate.spec)) {
        return {
          kind: 'rejected',
          message: 'Revisi budget gagal verifikasi internal (spek ikut berubah) — dibatalkan. Draft tidak berubah.',
        };
      }
      const capText = beforeCap == null
        ? `Batas anggaran ditetapkan ${formatRupiah(amount)}`
        : `Batas anggaran diubah dari ${formatRupiah(beforeCap)} menjadi ${formatRupiah(amount)}`;
      candidate.changes = [`${capText} (spek tidak berubah)`];
      snapshotVersion(candidate, `${capText} (spek tidak berubah)`);
      return { kind: 'preview', preview: makePreview(active, candidate, rawText, pid, candidate.changes, baseUpdatedAt) };
    }
    // Budget tanpa nominal sudah ditangkap detectUnderspecified; bila
    // sampai di sini, teruskan ke mesin umum (akan tidak dikenali).
  }

  // --- Jalur hapus komponen yang belum disetujui (PRICE_UNRESOLVED) ---
  if (isUnresolvedRemovalRequest(rawText)) {
    const items = effectiveItems(active);
    const unresolved = items.filter((i) => !isPriceValidForTotal(i));
    if (unresolved.length === 0) {
      return {
        kind: 'rejected',
        message: 'Tidak ada komponen yang belum disetujui di draft ini — semua item sudah punya harga yang dapat dipertanggungjawabkan. Draft tidak berubah.',
      };
    }
    const candidate = deepCopy(active);
    const findPart = (target: DraftItem) =>
      candidate.parts.find(
        (p) => p.template.name === target.__partTemplate
          && (p.buildingId ?? null) === (target.__buildingId ?? null),
      ) ?? candidate.parts.find((p) => p.template.name === target.__partTemplate);
    let removed = 0;
    for (const target of unresolved) {
      const part = findPart(target);
      if (!part) continue;
      const key = itemKey(target);
      if (!part.removedKeys.includes(key)) {
        part.removedKeys.push(key);
        removed += 1;
      }
    }
    if (removed === 0) {
      return {
        kind: 'rejected',
        message: 'Komponen yang belum disetujui tidak dapat dipetakan ke bagiannya — dibatalkan. Draft tidak berubah.',
      };
    }
    const sample = unresolved.slice(0, 3).map((i) => `"${i.description}"`).join(', ');
    const more = unresolved.length > 3 ? ` dan ${unresolved.length - 3} item lainnya` : '';
    candidate.changes = [
      `${removed} komponen yang belum disetujui (harga belum tersedia) dihapus: ${sample}${more}`,
    ];
    snapshotVersion(candidate, candidate.changes[0]);
    return { kind: 'preview', preview: makePreview(active, candidate, rawText, pid, candidate.changes, baseUpdatedAt) };
  }

  // --- Jalur umum: mesin revisi yang sama, dijalankan pada KLON ---
  const candidate = deepCopy(active);
  // reviseUniversalDraft mengikat singleton ke draft yang direvisinya —
  // tangkap singleton sebelumnya dan PULIHKAN sesudahnya agar pratinjau
  // tidak pernah mengubah draft aktif in-memory.
  const singletonBefore = getLastUniversalDraft();
  const singletonProjectBefore = getLastUniversalDraftProjectId();
  let rev: ReturnType<typeof reviseUniversalDraft>;
  try {
    rev = reviseUniversalDraft(candidate, rawText, pid);
  } catch (e) {
    if (getLastUniversalDraft() !== singletonBefore) {
      setLastUniversalDraft(singletonBefore, singletonProjectBefore);
    }
    return {
      kind: 'rejected',
      message: `Revisi gagal diterapkan (${e instanceof Error ? e.message : String(e)}). Versi aktif tidak berubah — tidak ada state setengah-jadi.`,
    };
  } finally {
    if (getLastUniversalDraft() !== singletonBefore) {
      setLastUniversalDraft(singletonBefore, singletonProjectBefore);
    }
  }
  if (rev === null) return { kind: 'unrecognized' };
  if (!rev.ok) return { kind: 'rejected', message: rev.message };
  return {
    kind: 'preview',
    preview: makePreview(active, candidate, rawText, pid, candidate.changes, baseUpdatedAt),
  };
}

/* ------------------------------------------------------------------ */
/* Pesan pratinjau                                                     */
/* ------------------------------------------------------------------ */

function fmtDelta(before: number, after: number): string {
  const d = after - before;
  if (d === 0) return 'tetap';
  return `${d > 0 ? '+' : '−'}${formatRupiah(Math.abs(d))}`;
}

export function formatRevisionPreviewMessage(preview: RevisionPreview): string {
  const lines: string[] = [];
  lines.push(`**Pratinjau revisi — versi ${preview.baseVersion} → ${preview.targetVersion} (BELUM AKTIF)**`);
  lines.push(`Permintaan: "${preview.requestText}"`);
  lines.push('');
  lines.push('**Perubahan yang diajukan:**');
  for (const c of preview.changes) lines.push(`• ${c}`);
  lines.push('');
  lines.push('**Sebelum → Sesudah:**');
  lines.push(`• Total estimasi: ${formatRupiah(preview.before.estimatedTotal)} → ${formatRupiah(preview.after.estimatedTotal)} (${fmtDelta(preview.before.estimatedTotal, preview.after.estimatedTotal)})`);
  lines.push(`• Jumlah item: ${preview.before.itemCount} → ${preview.after.itemCount}`);
  if (preview.before.unpricedCount !== preview.after.unpricedCount) {
    lines.push(`• Item belum berharga: ${preview.before.unpricedCount} → ${preview.after.unpricedCount}`);
  }
  lines.push('');
  lines.push('**Per seksi:**');
  for (const s of preview.sections) {
    if (s.changed) {
      lines.push(`• ${s.label}: ${formatRupiah(s.beforeTotal)} → ${formatRupiah(s.afterTotal)} (${s.beforeItems} → ${s.afterItems} item) — BERUBAH`);
    } else {
      lines.push(`• ${s.label}: ${formatRupiah(s.beforeTotal)} (${s.beforeItems} item) — tidak berubah`);
    }
  }
  if (preview.affectedBuildings.length > 0) {
    lines.push('');
    lines.push(`**Gedung terdampak:** ${preview.affectedBuildings.join(', ')}`);
  }
  if (preview.unchangedSections.length > 0) {
    lines.push(`**Tidak berubah:** ${preview.unchangedSections.join(', ')}`);
  }
  if (preview.budgetNote) {
    lines.push('');
    lines.push(preview.budgetNote);
  }
  lines.push('');
  lines.push(
    preview.reconciled
      ? 'Rekonsiliasi total: Σ seksi = total proyek (selisih Rp 0 — seimbang).'
      : `Rekonsiliasi total: selisih ${formatRupiah(Math.abs(preview.reconciliationDiffRp))} — TIDAK seimbang; periksa sebelum mengaktifkan.`,
  );
  lines.push('');
  lines.push(
    `Versi aktif saat ini TETAP versi ${preview.baseVersion} sampai Anda mengaktifkan revisi ini. ` +
      `Tekan **Aktifkan revisi** untuk menjadikan versi ${preview.targetVersion} aktif (versi ${preview.baseVersion} tetap tersimpan utuh di riwayat), ` +
      `atau **Batalkan revisi** untuk membuang pratinjau ini.`,
  );
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* activateRevision — aktivasi atomik + idempotent                     */
/* ------------------------------------------------------------------ */

export function activateRevision(
  projectId: string,
  preview: RevisionPreview,
): ActivationResult {
  if (!projectId) {
    return { ok: false, error: 'DRAFT_PERSISTENCE_FAILED', message: 'projectId kosong — revisi tidak dapat diaktifkan.' };
  }
  const record = peekPersistedDraft(projectId);
  if (!record) {
    return {
      ok: false,
      error: 'DRAFT_NOT_FOUND',
      message: 'Draft belum tersimpan untuk proyek ini — revisi tidak dapat diaktifkan. Susun draft dulu, lalu kirim ulang revisi.',
    };
  }
  if (record.draftId !== preview.draftId) {
    return {
      ok: false,
      stale: true,
      error: 'DRAFT_VERSION_CONFLICT',
      message: `Draft aktif sudah diganti sejak pratinjau ini dibuat (draft lain kini aktif). Pratinjau ini sudah basi — kirim ulang revisi dari draft terbaru.`,
    };
  }
  const history = record.versionHistory ?? [];
  // Idempotensi: kunci yang sama sudah pernah diaktifkan → kembalikan
  // versi yang sudah ada, TANPA versi baru.
  const prior = history.find((h) => h.activationKey != null && h.activationKey === preview.activationKey);
  if (prior) {
    return {
      ok: true,
      alreadyActivated: true,
      version: prior.version,
      updatedAt: record.updatedAt,
      message: `Revisi ini sudah aktif sebelumnya sebagai versi ${prior.version} — tidak ada versi ganda yang dibuat.`,
    };
  }
  // Stale: revisi lain sudah menang (versi bergerak) atau record berubah
  // sejak pratinjau dibuat (mis. transfer dicatat — aktivasi yang
  // dipaksakan akan menghilangkan receipt itu).
  if (record.baseVersion !== preview.baseVersion) {
    return {
      ok: false,
      stale: true,
      error: 'DRAFT_VERSION_CONFLICT',
      message: `Revisi ini dibuat dari versi ${preview.baseVersion}, tetapi versi aktif kini ${record.baseVersion} — revisi lain sudah diaktifkan lebih dulu. Kirim ulang revisi dari versi terbaru; tidak ada state yang rusak.`,
    };
  }
  if (preview.baseUpdatedAt != null && record.updatedAt !== preview.baseUpdatedAt) {
    return {
      ok: false,
      stale: true,
      error: 'DRAFT_VERSION_CONFLICT',
      message: `Draft berubah sejak pratinjau ini dibuat (mis. transfer dicatat sesudah pratinjau) — aktivasi dibatalkan agar perubahan itu tidak hilang. Kirim ulang revisi dari keadaan terbaru.`,
    };
  }
  if (preview.candidate.version !== preview.baseVersion + 1) {
    return {
      ok: false,
      error: 'DRAFT_VERSION_CONFLICT',
      message: `Kandidat revisi berversi ${preview.candidate.version}, bukan ${preview.baseVersion + 1} yang diharapkan — aktivasi dibatalkan. Versi aktif tidak berubah.`,
    };
  }
  // P4-guard (CD-7, 2026-11-13): kandidat yang BLOCKED tidak boleh
  // diaktifkan — bar yang SAMA dengan guard transfer (buildPushPayload /
  // validateTransfer): hanya BLOCKED yang ditolak; NEEDS_SPEC (mis.
  // item belum berharga / pemetaan AHSP belum lengkap) tetap boleh
  // diaktifkan karena label parsialnya sudah jujur. Dievaluasi LANGSUNG
  // dari kandidat saat ini via draftReadiness yang sama (bukan status
  // tersimpan yang bisa basi, dan bukan logika kesiapan baru). Guard
  // ini berjalan SEBELUM penulisan apa pun — penolakan tidak menyentuh
  // revisi aktif, riwayat, singleton, maupun storage. Penempatan di
  // sini (di dalam activateRevision, bukan di UI) membuatnya tidak
  // dapat dilewati jalur mana pun yang mengaktifkan revisi.
  const readiness = draftReadiness(preview.candidate);
  if (readiness.status === 'BLOCKED') {
    return {
      ok: false,
      error: 'DRAFT_NOT_READY',
      message:
        `Revisi ini belum dapat diaktifkan — kandidat versi ${preview.targetVersion} diblokir kesiapannya: ${readiness.blockedReasons.join('; ')}. ` +
        `Lengkapi spesifikasinya lewat revisi, lalu kirim ulang. Versi aktif (v${preview.baseVersion}) tidak berubah.`,
    };
  }

  // Seed: snapshot keadaan aktif pra-revisi bila versi dasar belum ada
  // di riwayat (aktivasi pertama untuk draft ini).
  const nextHistory: DraftVersionSnapshot[] = [...history];
  if (!nextHistory.some((h) => h.version === preview.baseVersion)) {
    const loaded = loadDraft(projectId);
    if (!loaded.ok) {
      return {
        ok: false,
        error: loaded.error,
        message: `Versi aktif tidak dapat dibaca untuk diarsipkan (${loaded.message}) — aktivasi dibatalkan. Versi aktif tidak berubah.`,
      };
    }
    nextHistory.push(
      snapshotOf(
        loaded.draft,
        `Versi ${preview.baseVersion} (keadaan aktif sebelum revisi ini — diarsipkan pada aktivasi pertama)`,
        null,
        null,
      ),
    );
  }
  nextHistory.push(
    snapshotOf(preview.candidate, preview.changes.join('; '), preview.activationKey, preview.requestText),
  );
  // Cap: prune snapshot tertua (ringkasan versions[] di record tetap utuh).
  while (nextHistory.length > MAX_VERSION_SNAPSHOTS) nextHistory.shift();

  const nextRecord = buildPersistedRecord(
    {
      draft: preview.candidate,
      projectId,
      workflowStage: record.workflowStage,
      savedBy: 'manual',
    },
    record,
  );
  nextRecord.versionHistory = nextHistory;
  const written = writeDraftRecord(nextRecord);
  if (!written.ok) {
    return {
      ok: false,
      error: written.error,
      message: `Aktivasi gagal disimpan (${written.message}) — versi aktif tidak berubah. Coba lagi; tidak ada state setengah-jadi.`,
    };
  }
  // Singleton diperbarui HANYA sesudah tulis storage sukses — dan
  // sebagai salinan terpisah dari snapshot riwayat (mutasi singleton
  // di masa depan tidak pernah merembes ke snapshot yang diarsipkan).
  setLastUniversalDraft(deepCopy(preview.candidate), projectId);
  return {
    ok: true,
    alreadyActivated: false,
    version: preview.targetVersion,
    updatedAt: nextRecord.updatedAt,
    message: `Revisi diaktifkan — versi ${preview.targetVersion} kini aktif. Versi ${preview.baseVersion} tetap tersimpan utuh di riwayat.`,
  };
}

/* ------------------------------------------------------------------ */
/* Riwayat & perbandingan                                              */
/* ------------------------------------------------------------------ */

export function listVersionHistory(projectId: string): {
  activeVersion: number | null;
  snapshots: DraftVersionSnapshot[];
} {
  const record = peekPersistedDraft(projectId);
  if (!record) return { activeVersion: null, snapshots: [] };
  return {
    activeVersion: record.baseVersion,
    snapshots: [...(record.versionHistory ?? [])].sort((a, b) => a.version - b.version),
  };
}

export function formatVersionHistoryMessage(projectId: string): string {
  const record = peekPersistedDraft(projectId);
  if (!record) return 'Belum ada draft tersimpan untuk proyek ini — belum ada riwayat versi.';
  const { activeVersion, snapshots } = listVersionHistory(projectId);
  const lines: string[] = [];
  lines.push(`**Riwayat versi — ${record.title}**`);
  lines.push(`Versi aktif: ${activeVersion}`);
  lines.push('');
  if (snapshots.length === 0) {
    lines.push('Belum ada revisi teraktivasi lewat alur revisi immutable — belum ada snapshot versi penuh.');
    if (record.versions.length > 0) {
      lines.push('Ringkasan versi lama (tanpa snapshot penuh):');
      for (const v of record.versions) {
        lines.push(`• v${v.n}: ${v.summary} — ${v.itemCount} item, ${formatRupiah(v.estimatedTotal)}`);
      }
    }
    lines.push('');
    lines.push('Kirim revisi lewat chat (mis. "gedung B jadi 3 lantai"), tinjau pratinjaunya, lalu aktifkan — versi lama akan diarsipkan utuh.');
    return lines.join('\n');
  }
  for (const s of snapshots) {
    const active = s.version === activeVersion ? ' (AKTIF)' : '';
    lines.push(
      `• v${s.version}${active}: ${s.summary} — ${s.itemCount} item, ${formatRupiah(s.estimatedTotal)} (${s.createdAt.slice(0, 10)})`,
    );
  }
  lines.push('');
  lines.push('Bandingkan dua versi dengan perintah "bandingkan versi X dan Y".');
  return lines.join('\n');
}

/** Perbandingan dua draft (versi apa pun) — murni, tanpa storage. */
export function compareDraftVersions(a: UniversalDraft, b: UniversalDraft): string {
  const ta = totalsOf(a);
  const tb = totalsOf(b);
  const diff = diffDrafts(a, b);
  const lines: string[] = [];
  lines.push(`**Perbandingan versi ${a.version} vs ${b.version}**`);
  lines.push(`• Total estimasi: ${formatRupiah(ta.estimatedTotal)} → ${formatRupiah(tb.estimatedTotal)} (${fmtDelta(ta.estimatedTotal, tb.estimatedTotal)})`);
  lines.push(`• Jumlah item: ${ta.itemCount} → ${tb.itemCount}`);
  lines.push(`• Item belum berharga: ${ta.unpricedCount} → ${tb.unpricedCount}`);
  lines.push('');
  lines.push('**Per seksi:**');
  for (const s of diff.sections) {
    lines.push(
      s.changed
        ? `• ${s.label}: ${formatRupiah(s.beforeTotal)} → ${formatRupiah(s.afterTotal)} (${s.beforeItems} → ${s.afterItems} item) — BERUBAH`
        : `• ${s.label}: ${formatRupiah(s.beforeTotal)} (${s.beforeItems} item) — tidak berubah`,
    );
  }
  if (diff.affectedBuildings.length > 0) lines.push(`**Gedung terdampak:** ${diff.affectedBuildings.join(', ')}`);
  if (diff.unchangedSections.length > 0) lines.push(`**Tidak berubah:** ${diff.unchangedSections.join(', ')}`);
  if (a.spec.budgetCap !== b.spec.budgetCap) {
    lines.push(
      `**Budget:** ${a.spec.budgetCap == null ? 'belum ditetapkan' : formatRupiah(a.spec.budgetCap)} → ${b.spec.budgetCap == null ? 'belum ditetapkan' : formatRupiah(b.spec.budgetCap)}`,
    );
  }
  return lines.join('\n');
}

export function compareStoredVersions(projectId: string, versionA: number, versionB: number): string {
  const record = peekPersistedDraft(projectId);
  if (!record) return 'Belum ada draft tersimpan untuk proyek ini.';
  if (versionA === versionB) return `Kedua versi yang diminta sama (v${versionA}) — tidak ada yang dibandingkan.`;
  const history = record.versionHistory ?? [];
  const findSnapshot = (v: number): DraftVersionSnapshot | null => {
    const hit = history.find((h) => h.version === v);
    if (hit) return hit;
    // Versi aktif kini tidak selalu ada di riwayat bila ia lahir dari
    // jalur lama (pra-Gate 3) dan belum pernah direvisi lewat Gate 3.
    if (v === record.baseVersion) {
      const loaded = loadDraft(projectId);
      if (loaded.ok) {
        return snapshotOf(loaded.draft, `Versi ${v} (aktif kini)`, null, null);
      }
    }
    return null;
  };
  const snapA = findSnapshot(versionA);
  const snapB = findSnapshot(versionB);
  const missing: number[] = [];
  if (!snapA) missing.push(versionA);
  if (!snapB) missing.push(versionB);
  if (missing.length > 0) {
    const known = history.map((h) => `v${h.version}`).join(', ') || '—';
    const summaryOf = (v: number): string => {
      const s = record.versions.find((x) => x.n === v);
      return s ? `v${v}: ${s.summary} — ${s.itemCount} item, ${formatRupiah(s.estimatedTotal)}` : `v${v}: tidak ada ringkasan`;
    };
    return (
      `Versi ${missing.map((v) => `v${v}`).join(' dan ')} tidak punya snapshot tersimpan ` +
      `(dibuat sebelum riwayat versi aktif, atau sudah terprune dari cap ${MAX_VERSION_SNAPSHOTS} snapshot) — perbandingan penuh tidak dapat dibuat tanpa mengarang data.\n\n` +
      `Ringkasan yang tersedia:\n• ${summaryOf(versionA)}\n• ${summaryOf(versionB)}\n\n` +
      `Versi dengan snapshot penuh: ${known}.`
    );
  }
  return compareDraftVersions((snapA as DraftVersionSnapshot).draft, (snapB as DraftVersionSnapshot).draft);
}

/* ------------------------------------------------------------------ */
/* Konfirmasi lewat teks                                               */
/* ------------------------------------------------------------------ */

/** Afirmasi singkat = konfirmasi eksplisit pratinjau yang menunggu. */
export function isAffirmativeConfirmation(text: string): boolean {
  const t = normalizeRequest(text).toLowerCase().replace(/[.!]+$/, '');
  return /^(ya|iya|oke|ok|setuju|aktifkan|konfirmasi|lanjut|ya aktifkan|iya aktifkan|silakan|silahkan|aktifkan revisi|konfirmasi revisi|ya, aktifkan|ok aktifkan)$/.test(t);
}

/** Penolakan singkat = batalkan pratinjau yang menunggu. */
export function isNegativeConfirmation(text: string): boolean {
  const t = normalizeRequest(text).toLowerCase().replace(/[.!]+$/, '');
  return /^(tidak|nggak|gak|batal|batalkan|jangan|tidak jadi|nggak jadi|gak jadi|cancel|batalkan revisi|tidak, batalkan)$/.test(t);
}
