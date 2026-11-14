/**
 * dedQtoIntegration.ts — INTEGRASI DED & QTO (Phase 5 Gate 4 / 5D,
 * direktif master owner 2026-11-12 11:45 WIB §6 + §10 Gate 4).
 *
 * Menyambungkan modul Fase 4 yang SUDAH ADA menjadi alur tertelusur
 * end-to-end — BUKAN pipeline DED kedua:
 *
 *   DED (DedAiOutput kanonis)
 *     → attachDedToProject (lampiran per proyek, localStorage)
 *     → extractSpecsFromDedOutput (dedUnderstanding — kanonis)
 *     → ctx.dedSpecs + deriveStructuredSpecs aturan (g) (questionnaire)
 *     → buildUniversalDraft (structuredSpecs + dedQto)
 *     → draft.structuredSpecs + draft.dedQto (dipersistensi, skema v1)
 *     → rekonsiliasi QTO via qtoBridge (kanonis) vs dimensi intake
 *     → koreksi QTO / revisi spek DED via pratinjau + konfirmasi
 *       eksplisit (pola Gate 3) — penolakan mempertahankan nilai asal
 *     → retrieval + resolusi harga via constructionDomainRetrieval
 *       (resolver kanonis; provenans OFFICIAL/MARKET/ASSUMPTION/
 *       UNRESOLVED dipertahankan; tanpa harga karangan)
 *
 * Keadaan wiring SEBELUM gate ini (ditelusuri dari kode, Gate 4 §1):
 * - `extract_ded_specs` (toolRegistry) hanya mengembalikan TEKS
 *   (baris format + hitungan) — speknya tidak pernah mendarat di
 *   structuredSpec / konteks intake; `buildDedSection` tidak punya
 *   pemanggil produksi; `recordDedUnderstandingToMemory` hanya
 *   menyimpan teks + hitungan di memori.
 * - `check_qto` / `checkBuildingQto` hanya dipanggil tes; verdict
 *   QTO tidak sampai ke user di UI mana pun (Gate 2 §2.4 sengaja
 *   tidak menampilkan verdict per gedung karena ekspektasi berbasis
 *   tapak memberi alarm palsu pada item template).
 * - `deriveStructuredSpecs` hanya menderivasi dari jawaban kuesioner
 *   + jawaban percakapan + budget — spek DED tidak punya rumah
 *   kanonis di konteks intake (serialize menderivasi ulang sehingga
 *   spek DED yang sekadar ditempel ke ctx.structuredSpecs akan
 *   HILANG saat disimpan).
 *
 * Modul ini MENUTUP ketiga celah itu tanpa mengubah satu pun
 * aritmetika kanonis: tidak ada engine RAB kedua, tidak ada store
 * AI duplikat, tidak ada pipeline ekstraksi DED kedua (ARS-02
 * dipertahankan — dua pipeline DED tetap terpisah), tidak ada
 * panggilan provider (semua fungsi deterministik lokal).
 *
 * Aturan kejujuran yang ditegakkan di sini:
 * - DED / USER / ASSUMPTION TIDAK PERNAH disamakan: label berbeda
 *   di seluruh alur (sumber 'DED' vs 'percakapan'/'kuesioner',
 *   status ASSUMPTION tetap asumsi sampai user mengonfirmasi).
 * - Dimensi hilang tetap hilang, kuantitas hilang tetap null, harga
 *   hilang tetap unresolved — tidak pernah diisi diam-diam.
 * - Unit mismatch MEMBLOKIR kalkulasi yang terdampak (tanpa
 *   konversi diam-diam): tidak ada usulan koreksi untuk check
 *   UNIT_MISMATCH, dan applyQtoCorrection MENOLAK check apa pun
 *   yang bukan MISMATCH.
 * - Nilai DED tidak menimpa spek terkonfirmasi user tanpa
 *   konfirmasi (dan sebaliknya): spek user untuk kunci yang sama
 *   SELALU menang di derive/merge; nilai DED asli tetap tersimpan
 *   di ctx.dedSpecs + lampiran (tidak pernah ditimpa).
 * - Koreksi QTO / revisi spek DED hanya berlaku sesudah konfirmasi
 *   eksplisit; penolakan mempertahankan nilai asal + dicatat.
 */

import { extractSpecsFromDedOutput, type DedUnderstandingResult } from './dedUnderstanding';
import {
  checkQtoAgainstUserDimensions,
  formatQtoCheckLines,
  type QtoCheck,
  type QtoItemLike,
  type QtoUserDimensions,
} from './qtoBridge';
import {
  isValidDedSpec,
  type StructuredSpec,
} from './structuredSpec';
import {
  retrieveDomainCandidates,
  type AhspCandidate,
} from './constructionDomainRetrieval';
import type { DedAiOutput, DedAiItem, DedDivisionCoverage } from '../ded-ai-estimate/types';
import {
  modeFromLegacy,
  normalizePolicy,
  type DedEstimationPolicy,
  type DedRabAiMode,
} from '../ded-ai-estimate/dedMode';
import type { UniversalIntakeContext } from './universalIntake';

/* ------------------------------------------------------------------ */
/* Lampiran DED per proyek (storage)                                   */
/* ------------------------------------------------------------------ */

/** Kunci localStorage: peta projectId → DedAttachment (satu DED aktif per proyek). */
export const DED_ATTACHMENT_KEY = 'ezrab_ded_attachment_v1';

/** Cap item lampiran — DED yang lebih besar dipotong dengan catatan jujur (truncatedItems). */
export const DED_ATTACHMENT_MAX_ITEMS = 200;

/** Cap item tanpa harga yang di-retrieval harganya saat konsumsi (deterministik lokal). */
export const DED_PRICE_REVIEW_MAX_ITEMS = 5;

/** Proyeksi ringkas DedAiItem — hanya medan yang dipakai alur 5D.
 *
 * S5 (2026-11-13, FINAL INTEGRITY REPAIR §5 — P3C-F1): `quantityFormula`
 * + `derivation.notes` WAJIB dipertahankan — keduanya adalah bukti
 * kuantitas (rumus/dasar hitung + peringatan derivasi, mis. "bukaan
 * belum diketahui"). Versi lama projectItem() membuang keduanya. */
export interface DedAttachmentItem {
  id: string;
  name: string;
  category: string;
  units: string;
  quantity: number | null;
  quantitySource: string;
  quantityNote?: string | null;
  /** Rumus/dasar hitung terbaca (DedAiItem.quantityFormula) — bukti kuantitas. */
  quantityFormula?: string | null;
  unitPrice: number | null;
  priceSource: string;
  ahspCode?: string;
  sourcePages: number[];
  sourceEvidence?: string;
  provenance: string[];
  derivation?: {
    formulaType: string;
    inputs: Array<{ name: string; value: number; unit: string; source: string }>;
    result: number | null;
    resultUnit: string;
    validationStatus: string;
    /** Catatan derivasi (DedAiItem.derivation.notes) — tempat peringatan
     *  derivasi tinggal (mis. "bukaan belum diketahui"). */
    notes?: string | null;
  };
}

export interface QtoDecision {
  /** Id item DED yang diputuskan. */
  itemId: string;
  description: string;
  /** Verdict check saat keputusan dibuat (selalu 'MISMATCH' untuk koreksi). */
  verdict: QtoCheck['verdict'];
  action: 'confirmed' | 'rejected';
  /** Kuantitas DED asli (tidak pernah hilang — jejak audit). */
  originalQuantity: number | null;
  /** Kuantitas koreksi yang diusulkan (null bila keputusan bukan koreksi angka). */
  correctedQuantity: number | null;
  unit: string;
  decidedAt: string;
}

/** Lampiran DED aktif satu proyek — snapshot ringkas DedAiOutput + keputusan user. */
export interface DedAttachment {
  jobId: string;
  fileName: string | null;
  projectName: string;
  projectType: string;
  mode: string;
  /**
   * Kebijakan harga asal DED (Dual Mode W1, G-ST-1) — tersimpan agar
   * Chat AI tahu mode asal lampiran ini. Opsional: lampiran lama
   * tanpa field ini dibaca sebagai FULL_AI (perilaku hardcode lama).
   */
  policy?: DedEstimationPolicy;
  /**
   * Mode kanonis asal DED (C1) — diturunkan dari policy + mesin
   * standar saat lampir (lampiran hanya menerima DedAiOutput mesin
   * standar). Opsional seperti policy (lampiran lama tak punya).
   */
  dedMode?: DedRabAiMode;
  projectId: string;
  receivedAt: string;
  /** Kapan Chat AI mengonsumsi lampiran ini (null = belum dikonsumsi). */
  consumedAt: string | null;
  items: DedAttachmentItem[];
  /** Jumlah item yang dipotong cap (0 = utuh). */
  truncatedItems: number;
  coverage: {
    totalItems: number;
    itemsWithQuantity: number;
    itemsWithPrice: number;
    itemsFullyResolved: number;
    itemsUnresolved: number;
    partial: boolean;
  };
  divisionCoverage?: DedDivisionCoverage[];
  /** Divisi dengan data tidak cukup (nama, dari divisionCoverage). */
  insufficientDivisions: string[];
  /** Keputusan konfirmasi/penolakan koreksi QTO (append-only per item+angka). */
  decisions: QtoDecision[];
}

/** Rekonsiliasi DED/QTO yang dibawa draft (dipersistensi bersama draft, skema v1). */
export interface DedQtoDraftInfo {
  attachmentRef: { jobId: string; fileName: string | null; projectName: string };
  reconciledAt: string;
  checks: QtoCheck[];
  decisions: QtoDecision[];
  /**
   * GATE 4 (5D) — dimensi pengguna yang dipakai untuk rekonsiliasi ini.
   * WAJIB tersimpan: tombol koreksi QTO milik draft ini harus dapat
   * menghitung ulang checks yang SAMA sesudah konteks intake hidup
   * hilang (jalur cepat tidak pernah membuat singleton; generate
   * membersihkan singleton) — tanpa dims tersimpan, handler tombol
   * menghitung ulang dengan dimensi kosong dan "tidak menemukan"
   * usulan yang jelas-jelas tampil di pesan (temuan E2E Gate 4 run 1).
   * Opsional (record lama tanpa dims tetap valid — handler jatuh ke
   * dimensi hidup, lalu ke checks tersimpan).
   */
  dims?: QtoUserDimensions;
  summary: {
    total: number;
    ok: number;
    mismatch: number;
    missing: number;
    assumption: number;
    unitMismatch: number;
    cannotCheck: number;
  };
}

function storage(): Storage | null {
  try {
    const g = globalThis as { localStorage?: Storage };
    return g.localStorage ?? null;
  } catch {
    return null;
  }
}

function projectItem(item: DedAiItem): DedAttachmentItem {
  return {
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    category: String(item.category ?? ''),
    units: String(item.units ?? ''),
    quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : null,
    quantitySource: String(item.quantitySource ?? 'UNRESOLVED'),
    quantityNote: item.quantityNote ?? null,
    // S5 (P3C-F1): rumus + catatan derivasi adalah bukti kuantitas —
    // diteruskan apa adanya bila ada (string tak kosong); tanpa bukti,
    // medan absen (tidak dikarang, tidak ada default).
    ...(typeof item.quantityFormula === 'string' && item.quantityFormula.trim() !== ''
      ? { quantityFormula: item.quantityFormula }
      : {}),
    unitPrice: typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice) ? item.unitPrice : null,
    priceSource: String(item.priceSource ?? 'UNRESOLVED'),
    ahspCode: item.ahspCode,
    sourcePages: Array.isArray(item.sourcePages) ? item.sourcePages.filter((p) => Number.isFinite(p)) : [],
    sourceEvidence: item.sourceEvidence,
    provenance: Array.isArray(item.provenance) ? item.provenance.map(String) : [],
    derivation: item.derivation
      ? {
          formulaType: String(item.derivation.formulaType ?? ''),
          inputs: (item.derivation.inputs ?? []).map((i) => ({
            name: String(i.name ?? ''),
            value: i.value,
            unit: String(i.unit ?? ''),
            source: String(i.source ?? ''),
          })),
          result: item.derivation.result ?? null,
          resultUnit: String(item.derivation.resultUnit ?? ''),
          validationStatus: String(item.derivation.validationStatus ?? ''),
          ...(typeof item.derivation.notes === 'string' && item.derivation.notes.trim() !== ''
            ? { notes: item.derivation.notes }
            : {}),
        }
      : undefined,
  };
}

/**
 * Lampirkan hasil DED kanonis ke satu proyek. Lampiran BARU MENGGANTIKAN
 * lampiran lama proyek itu (preseden: record memori DED memakai
 * explicitReplacement) — satu DED aktif per proyek; keputusan QTO
 * lampiran lama ikut terganti karena basisnya (DED itu) sudah tidak
 * berlaku. Gagal simpan (kuota/corrupt) dilaporkan jujur, tanpa throw.
 */
export function attachDedToProject(
  projectId: string,
  output: DedAiOutput,
): { ok: boolean; attachment?: DedAttachment; message: string } {
  if (!projectId || typeof projectId !== 'string') {
    return { ok: false, message: 'DED tidak dapat dilampirkan: proyek target kosong.' };
  }
  if (!output || typeof output !== 'object' || !Array.isArray((output as { items?: unknown }).items)) {
    return { ok: false, message: 'DED tidak dapat dilampirkan: hasil DED bukan objek DedAiOutput yang sah (tanpa array items).' };
  }
  const items = (output.items as DedAiItem[]).map(projectItem);
  const kept = items.slice(0, DED_ATTACHMENT_MAX_ITEMS);
  const attachment: DedAttachment = {
    jobId: String(output.jobId ?? ''),
    fileName: output.fileName ?? null,
    projectName: String(output.projectName ?? ''),
    projectType: String(output.projectType ?? ''),
    mode: String(output.mode ?? ''),
    // G-ST-1: mode/policy ASAL diteruskan — lampiran hanya menerima
    // DedAiOutput mesin standar, jadi fullAi=false (mode diturunkan
    // dari policy; hibrida lama tetap membawa policy aslinya).
    policy: normalizePolicy(output.policy),
    dedMode: modeFromLegacy({ policy: normalizePolicy(output.policy), fullAi: false }),
    projectId,
    receivedAt: new Date().toISOString(),
    consumedAt: null,
    items: kept,
    truncatedItems: Math.max(0, items.length - kept.length),
    coverage: {
      totalItems: output.coverage?.totalItems ?? output.items.length,
      itemsWithQuantity: output.coverage?.itemsWithQuantity ?? items.filter((i) => i.quantity != null).length,
      itemsWithPrice: output.coverage?.itemsWithPrice ?? items.filter((i) => i.unitPrice != null).length,
      itemsFullyResolved: output.coverage?.itemsFullyResolved ?? 0,
      itemsUnresolved: output.coverage?.itemsUnresolved ?? 0,
      partial: output.partial === true,
    },
    divisionCoverage: output.divisionCoverage,
    insufficientDivisions: (output.divisionCoverage ?? [])
      .filter((d) => d.status === 'INSUFFICIENT_DATA')
      .map((d) => `${d.divisionCode} ${d.divisionName}`.trim()),
    decisions: [],
  };
  const store = storage();
  if (!store) {
    return { ok: false, message: 'DED tidak dapat dilampirkan: penyimpanan lokal tidak tersedia di lingkungan ini.' };
  }
  try {
    const raw = store.getItem(DED_ATTACHMENT_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, DedAttachment>) : {};
    map[projectId] = attachment;
    store.setItem(DED_ATTACHMENT_KEY, JSON.stringify(map));
  } catch (e) {
    return { ok: false, message: `DED tidak dapat dilampirkan: gagal menyimpan lampiran (${e instanceof Error ? e.message : 'error tak dikenal'}).` };
  }
  return {
    ok: true,
    attachment,
    message: `DED dilampirkan ke proyek (${kept.length} item${attachment.truncatedItems > 0 ? `; ${attachment.truncatedItems} item terpotong cap lampiran` : ''}).`,
  };
}

/** Bentuk lampiran yang sah (fail-soft: bentuk rusak → null, bukan tebakan). */
function isValidAttachment(raw: unknown): raw is DedAttachment {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const a = raw as Record<string, unknown>;
  return (
    typeof a.jobId === 'string' &&
    typeof a.projectId === 'string' &&
    typeof a.receivedAt === 'string' &&
    Array.isArray(a.items) &&
    Array.isArray(a.decisions) &&
    !!a.coverage && typeof a.coverage === 'object'
  );
}

export function loadDedAttachment(projectId: string | null | undefined): DedAttachment | null {
  if (!projectId) return null;
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(DED_ATTACHMENT_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, unknown>;
    const att = map[projectId];
    return isValidAttachment(att) ? (att as DedAttachment) : null;
  } catch {
    return null;
  }
}

export function saveDedAttachment(attachment: DedAttachment): boolean {
  const store = storage();
  if (!store) return false;
  try {
    const raw = store.getItem(DED_ATTACHMENT_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, DedAttachment>) : {};
    map[attachment.projectId] = attachment;
    store.setItem(DED_ATTACHMENT_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

export function clearDedAttachment(projectId: string): void {
  const store = storage();
  if (!store) return;
  try {
    const raw = store.getItem(DED_ATTACHMENT_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, DedAttachment>;
    delete map[projectId];
    store.setItem(DED_ATTACHMENT_KEY, JSON.stringify(map));
  } catch {
    /* abaikan */
  }
}

/**
 * Rekonstruksi DedAiOutput MINIMAL dari lampiran — hanya untuk dipakai
 * Ulang `extractSpecsFromDedOutput` / `buildDedSection` (yang membaca
 * items + coverage + partial + divisionCoverage + fileName). BUKAN
 * hasil analisis baru dan TIDAK PERNAH dipakai sebagai total DED
 * (grandTotal diisi 0 + ditandai rekonstruksi di pemakaian internal).
 */
export function attachmentToDedOutput(attachment: DedAttachment): DedAiOutput {
  return {
    success: true,
    jobId: attachment.jobId,
    projectType: attachment.projectType as DedAiOutput['projectType'],
    mode: attachment.mode as DedAiOutput['mode'],
    // G-ST-1: teruskan policy ASAL yang tersimpan di lampiran —
    // hardcode 'FULL_AI' lama membuat DED DATABASE terbaca sebagai
    // FULL_AI di Chat AI. Lampiran lama tanpa policy → FULL_AI
    // (perilaku lama, bukan tebakan baru).
    policy: normalizePolicy(attachment.policy),
    projectName: attachment.projectName,
    fileName: attachment.fileName ?? undefined,
    pageCount: 0,
    items: attachment.items as unknown as DedAiItem[],
    grandTotal: 0,
    categorySummaries: [],
    coverage: attachment.coverage,
    partial: attachment.coverage.partial,
    divisionCoverage: attachment.divisionCoverage,
  } as DedAiOutput;
}

/** Spek DED hasil ekstraksi kanonis dari lampiran (dengan provenans per spek). */
export function dedSpecsFromAttachment(attachment: DedAttachment): DedUnderstandingResult {
  return extractSpecsFromDedOutput(attachmentToDedOutput(attachment));
}

/** Saring spek DED yang sah per entri (entri rusak dibuang, yang sah dipertahankan). */
export function sanitizeDedSpecs(raw: unknown): StructuredSpec[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => isValidDedSpec(e));
}

/* ------------------------------------------------------------------ */
/* Dimensi pengguna (konteks QTO kanonis)                              */
/*                                                                     */
/* Konteks QTO kanonis repo ini (Gate 4 §1c, ditelusuri dari kode):    */
/*  (1) sisi DED: DedAiItem quantity + derivation (ded-ai-estimate);   */
/*  (2) mesin banding: qtoBridge.checkQtoAgainstUserDimensions;        */
/*  (3) sisi pengguna: dimensi UniversalIntakeContext (lengthM,        */
/*      widthM, depthM, heightM, buildingAreaM2, landAreaM2, floors).  */
/*      Konteks TIDAK punya thicknessM — rekonsiliasi tidak            */
/*      mengarangnya (basis luas×tebal tidak tersedia dari intake).    */
/*  (4) sisi draft: specChain.computeVolumeBasis (basis volume per     */
/*      item: USER_DIMENSION vs ASSUMPTION) — tidak diubah gate ini.   */
/* ------------------------------------------------------------------ */

/**
 * Dimensi pengguna dari konteks intake kanonis (null ctx → dimensi kosong, jujur).
 *
 * SUMBER GANDA (terbukti probe 5D): `extractUniversalContext`
 * TIDAK mengisi lengthM/widthM tingkat proyek untuk "gedung 12 x 8 m"
 * — dimensi itu hidup di `ctx.buildings[0]` (model per-gedung Gate 2)
 * + buildingAreaM2 tingkat proyek. Tanpa fallback, rekonsiliasi QTO
 * di alur nyata akan selalu CANNOT_CHECK (dimensi "tidak ada") meski
 * pengguna sudah menyebut ukuran. Fallback: bila TEPAT SATU bangunan
 * membawa dimensi, pakai dimensinya untuk medan tingkat proyek yang
 * null. Multi-gedung: TIDAK ditebak (DED terlampir per proyek, bukan
 * per gedung — bangunan mana yang dimaksud tidak dapat ditentukan).
 */
export function dimsFromIntakeContext(ctx: UniversalIntakeContext | null | undefined): QtoUserDimensions {
  if (!ctx) return {};
  const single = (ctx.buildings ?? []).length === 1 ? ctx.buildings[0] : null;
  return {
    lengthM: ctx.lengthM ?? single?.lengthM ?? null,
    widthM: ctx.widthM ?? single?.widthM ?? null,
    depthM: ctx.depthM ?? null,
    heightM: ctx.heightM ?? null,
    buildingAreaM2: ctx.buildingAreaM2 ?? single?.buildingAreaM2 ?? null,
    landAreaM2: ctx.landAreaM2 ?? null,
    floors: ctx.floors ?? single?.floors ?? null,
  };
}

/** Item DED → bentuk QtoItemLike untuk jembatan kanonis.
 *
 * S5 (P3C-F1): rumus + catatan derivasi diteruskan ke jembatan —
 * passthrough P3C (`QtoCheck.formula`) kini terisi dari jalur DED,
 * dan catatan derivasi (peringatan) ikut terbawa ke QtoCheck. */
export function dedItemsAsQto(attachment: DedAttachment): QtoItemLike[] {
  return attachment.items.map((it) => ({
    description: it.name,
    quantity: it.quantity,
    unit: it.units,
    derivationInputs: (it.derivation?.inputs ?? []).map((i) => ({
      name: i.name,
      value: i.value,
      unit: i.unit,
      source: i.source,
    })),
    quantityNote: it.quantityNote ?? null,
    quantityFormula: it.quantityFormula ?? null,
    derivationNotes: it.derivation?.notes ?? null,
  }));
}

/**
 * Rekonsiliasi QTO: kuantitas DED vs dimensi pengguna, memakai
 * `checkQtoAgainstUserDimensions` (qtoBridge — kanonis, tidak diubah).
 *
 * Gerbang unit (jujur, dari data DED sendiri): bila item membawa
 * `derivation.resultUnit`, unit itu dipakai sebagai unit yang
 * diminta — bila berbeda dari `item.units`, jembatan menghasilkan
 * UNIT_MISMATCH (bukan konversi diam-diam). Item tanpa resultUnit
 * tidak diberi unit yang diminta (tidak dikarang).
 */
export function reconcileDedQto(
  attachment: DedAttachment,
  dims: QtoUserDimensions,
): { checks: QtoCheck[]; requestedUnitByDescription: Record<string, string> } {
  const requestedUnitByDescription: Record<string, string> = {};
  for (const it of attachment.items) {
    const ru = it.derivation?.resultUnit?.trim();
    if (ru) requestedUnitByDescription[it.name] = ru;
  }
  const checks = checkQtoAgainstUserDimensions(dedItemsAsQto(attachment), dims, {
    requestedUnitByDescription,
  });
  return { checks, requestedUnitByDescription };
}

/** Ringkasan hitungan verdict (dipakai pesan draft + umpan balik). */
export function summarizeDedQtoChecks(checks: QtoCheck[]): DedQtoDraftInfo['summary'] {
  const s = { total: checks.length, ok: 0, mismatch: 0, missing: 0, assumption: 0, unitMismatch: 0, cannotCheck: 0 };
  for (const c of checks) {
    if (c.verdict === 'OK') s.ok++;
    else if (c.verdict === 'MISMATCH') s.mismatch++;
    else if (c.verdict === 'MISSING') s.missing++;
    else if (c.verdict === 'ASSUMPTION') s.assumption++;
    else if (c.verdict === 'UNIT_MISMATCH') s.unitMismatch++;
    else if (c.verdict === 'CANNOT_CHECK') s.cannotCheck++;
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Konflik spek DED vs dimensi terkonfirmasi user                      */
/* ------------------------------------------------------------------ */

export interface DedSpecConflict {
  key: string;
  label: string;
  dedValue: number;
  dedUnit: string | undefined;
  dedProvenance: string | undefined;
  userValue: number;
  userUnit: string;
  /** Selisih relatif terhadap nilai user (0.2 = 20%). */
  diffRatio: number;
}

const CONFLICT_TOLERANCE = 0.1;

/**
 * Bandingkan spek dimensi DED dengan dimensi terkonfirmasi user dari
 * konteks intake. Selisih >10% → KONFLIK (dilaporkan dengan kedua
 * angka, tidak pernah dipilih diam-diam). Sisi yang hilang (salah
 * satu null) BUKAN konflik — itu data hilang (ditangani missingData).
 */
export function detectDedSpecConflicts(
  dedSpecs: StructuredSpec[],
  userDims: { lengthM?: number | null; widthM?: number | null; heightM?: number | null; buildingAreaM2?: number | null },
): DedSpecConflict[] {
  const pairs: Array<{
    key: string;
    label: string;
    userValue: number | null | undefined;
    userUnit: string;
  }> = [
    { key: 'ded-length', label: 'Panjang', userValue: userDims.lengthM, userUnit: 'm' },
    { key: 'ded-width', label: 'Lebar', userValue: userDims.widthM, userUnit: 'm' },
    { key: 'ded-height', label: 'Tinggi', userValue: userDims.heightM, userUnit: 'm' },
    { key: 'ded-area', label: 'Luas', userValue: userDims.buildingAreaM2, userUnit: 'm²' },
  ];
  const out: DedSpecConflict[] = [];
  for (const p of pairs) {
    if (p.userValue == null || p.userValue <= 0) continue;
    const ded = dedSpecs.find((s) => s.key === p.key && typeof s.value === 'number' && Number.isFinite(s.value));
    if (!ded || typeof ded.value !== 'number') continue;
    const diffRatio = Math.abs(ded.value - p.userValue) / p.userValue;
    if (diffRatio > CONFLICT_TOLERANCE) {
      out.push({
        key: p.key,
        label: p.label,
        dedValue: ded.value,
        dedUnit: ded.unit,
        dedProvenance: ded.provenance,
        userValue: p.userValue,
        userUnit: p.userUnit,
        diffRatio,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Penggabungan spek DED ke spek terstruktur                           */
/*                                                                     */
/* Aturan menang (ditegakkan di derive aturan (g) DAN di sini): spek  */
/* user (kuesioner/percakapan) untuk kunci yang sama SELALU menang    */
/* atas spek DED — nilai DED tidak menimpa spek terkonfirmasi user    */
/* tanpa konfirmasi. Spek DED yang kalah DILAPORKAN (skipped), bukan  */
/* dibuang diam-diam; nilai DED aslinya tetap tersimpan di            */
/* ctx.dedSpecs + lampiran.                                            */
/* ------------------------------------------------------------------ */

export function mergeDedSpecsIntoSpecs(
  specs: StructuredSpec[],
  dedSpecs: StructuredSpec[],
): { merged: StructuredSpec[]; skippedDedKeys: string[] } {
  const covered = new Set(specs.map((s) => s.key));
  const merged = [...specs];
  const skippedDedKeys: string[] = [];
  for (const d of sanitizeDedSpecs(dedSpecs)) {
    if (covered.has(d.key)) {
      skippedDedKeys.push(d.key);
      continue;
    }
    covered.add(d.key);
    merged.push(d);
  }
  return { merged, skippedDedKeys };
}

/* ------------------------------------------------------------------ */
/* Usulan koreksi QTO + konfirmasi/penolakan (pola Gate 3)             */
/*                                                                     */
/* Pratinjau = usulan koreksi (before/after + basis) yang ditampilkan */
/* ke user; konfirmasi eksplisit (tombol) menerapkan; penolakan       */
/* mempertahankan nilai DED asal. TIDAK ADA penerapan diam-diam.      */
/* Keputusan dicatat di lampiran (append-only per item+angka) —       */
/* keputusan yang sama tidak dapat diterapkan dua kali, dan usulan    */
/* yang sudah diputuskan tidak ditawarkan lagi.                        */
/* ------------------------------------------------------------------ */

export interface QtoCorrectionProposal {
  /** Id stabil: `qto:<itemId>` — sama di tiap rekomputasi untuk item itu. */
  id: string;
  itemId: string;
  description: string;
  dedQuantity: number;
  dedUnit: string;
  /** Kuantitas yang diharapkan dari dimensi pengguna (basis koreksi). */
  expectedQuantity: number;
  expectedUnit: string;
  basis: string;
  checkDetail: string;
}

/** Hanya check MISMATCH yang menghasilkan usulan koreksi. */
export function proposeQtoCorrections(
  attachment: DedAttachment,
  checks: QtoCheck[],
): QtoCorrectionProposal[] {
  const out: QtoCorrectionProposal[] = [];
  for (const c of checks) {
    if (c.verdict !== 'MISMATCH') continue;
    // MISSING / UNIT_MISMATCH / CANNOT_CHECK / ASSUMPTION / OK tidak
    // pernah menghasilkan usulan: tidak ada angka pembanding yang sah
    // (MISSING), kalkulasi diblokir (UNIT_MISMATCH), atau tidak ada
    // yang perlu dikoreksi (OK / CANNOT_CHECK / ASSUMPTION).
    if (c.quantity == null || c.expectedFromUserDimensions == null) continue;
    const item = attachment.items.find((it) => it.name === c.description);
    if (!item) continue;
    out.push({
      id: `qto:${item.id}`,
      itemId: item.id,
      description: c.description,
      dedQuantity: c.quantity,
      dedUnit: c.unit,
      expectedQuantity: c.expectedFromUserDimensions,
      expectedUnit: c.unit,
      basis: c.detail,
      checkDetail: c.detail,
    });
  }
  return out;
}

function findDecision(
  attachment: DedAttachment,
  itemId: string,
  correctedQuantity: number | null,
): QtoDecision | undefined {
  return attachment.decisions.find(
    (d) => d.itemId === itemId && d.correctedQuantity === correctedQuantity,
  );
}

/** Usulan yang BELUM diputuskan (sudah dikonfirmasi/ditolak tidak ditawarkan lagi). */
export function pendingQtoCorrections(
  attachment: DedAttachment,
  checks: QtoCheck[],
): QtoCorrectionProposal[] {
  return proposeQtoCorrections(attachment, checks).filter(
    (p) => !findDecision(attachment, p.itemId, p.expectedQuantity),
  );
}

/**
 * Terapkan koreksi QTO sesudah konfirmasi eksplisit user.
 * Pertahanan berlapis (bukan hanya UI):
 * - check SAAT INI untuk item itu HARUS MISMATCH (dari `currentChecks`
 *   yang dihitung segar pemanggil) — UNIT_MISMATCH / MISSING / OK /
 *   CANNOT_CHECK / ASSUMPTION DITOLAK (kalkulasi diblokir / tidak ada
 *   dasar koreksi);
 * - usulan yang sudah diputuskan (dengan angka yang sama) tidak
 *   diterapkan dua kali (idempotent — mengembalikan alreadyApplied);
 * - kuantitas DED asli TIDAK PERNAH hilang: tersimpan di keputusan
 *   + quantityNote item.
 * Kuantitas hasil koreksi dicatat sebagai USER_INPUT (sumbernya kini
 * keputusan user, bukan DED) — perbedaan DED/USER dipertahankan.
 */
export function applyQtoCorrection(
  attachment: DedAttachment,
  proposal: QtoCorrectionProposal,
  currentChecks: QtoCheck[],
): { ok: boolean; attachment: DedAttachment; message: string; alreadyApplied?: boolean } {
  const existing = findDecision(attachment, proposal.itemId, proposal.expectedQuantity);
  if (existing) {
    if (existing.action === 'confirmed') {
      return {
        ok: true,
        attachment,
        alreadyApplied: true,
        message: `Koreksi "${proposal.description}" sudah diterapkan sebelumnya (${existing.originalQuantity} → ${existing.correctedQuantity} ${existing.unit}) — tidak diterapkan dua kali.`,
      };
    }
    return {
      ok: false,
      attachment,
      message: `Koreksi "${proposal.description}" (→ ${proposal.expectedQuantity} ${proposal.expectedUnit}) sudah DITOLAK sebelumnya — nilai DED dipertahankan. Minta koreksi baru bila angkanya berubah.`,
    };
  }
  const current = currentChecks.find((c) => c.description === proposal.description);
  if (!current || current.verdict !== 'MISMATCH') {
    return {
      ok: false,
      attachment,
      message: `Koreksi "${proposal.description}" TIDAK dapat diterapkan: pemeriksaan QTO saat ini berverdict ${current?.verdict ?? 'tidak ditemukan'} (bukan MISMATCH) — hanya MISMATCH yang boleh dikoreksi; UNIT_MISMATCH memblokir kalkulasi, MISSING berarti tidak ada angka untuk dikoreksi.`,
    };
  }
  const next: DedAttachment = {
    ...attachment,
    items: attachment.items.map((it) =>
      it.id === proposal.itemId
        ? {
            ...it,
            quantity: proposal.expectedQuantity,
            quantitySource: 'USER_INPUT',
            quantityNote:
              `Dikoreksi pengguna dari ${proposal.dedQuantity} ${proposal.dedUnit} → ${proposal.expectedQuantity} ${proposal.expectedUnit} (basis: dimensi pengguna). Nilai DED asli tersimpan di riwayat keputusan.`,
          }
        : it,
    ),
    decisions: [
      ...attachment.decisions,
      {
        itemId: proposal.itemId,
        description: proposal.description,
        verdict: 'MISMATCH',
        action: 'confirmed',
        originalQuantity: proposal.dedQuantity,
        correctedQuantity: proposal.expectedQuantity,
        unit: proposal.expectedUnit,
        decidedAt: new Date().toISOString(),
      } satisfies QtoDecision,
    ],
  };
  return {
    ok: true,
    attachment: next,
    message: `Koreksi diterapkan: "${proposal.description}" ${proposal.dedQuantity} → ${proposal.expectedQuantity} ${proposal.expectedUnit} (nilai DED asli tersimpan di riwayat keputusan).`,
  };
}

/** Tolak koreksi QTO — nilai DED asal DIPERTAHANKAN, penolakan dicatat. */
export function rejectQtoCorrection(
  attachment: DedAttachment,
  proposal: QtoCorrectionProposal,
): { ok: boolean; attachment: DedAttachment; message: string; alreadyDecided?: boolean } {
  const existing = findDecision(attachment, proposal.itemId, proposal.expectedQuantity);
  if (existing) {
    return {
      ok: false,
      attachment,
      alreadyDecided: true,
      message: `Koreksi "${proposal.description}" sudah diputuskan sebelumnya (${existing.action === 'confirmed' ? 'diterima' : 'ditolak'}) — keputusan tidak diubah.`,
    };
  }
  const next: DedAttachment = {
    ...attachment,
    decisions: [
      ...attachment.decisions,
      {
        itemId: proposal.itemId,
        description: proposal.description,
        verdict: 'MISMATCH',
        action: 'rejected',
        originalQuantity: proposal.dedQuantity,
        correctedQuantity: proposal.expectedQuantity,
        unit: proposal.expectedUnit,
        decidedAt: new Date().toISOString(),
      } satisfies QtoDecision,
    ],
  };
  return {
    ok: true,
    attachment: next,
    message: `Koreksi ditolak — "${proposal.description}" tetap ${proposal.dedQuantity} ${proposal.dedUnit} (nilai DED dipertahankan).`,
  };
}

/* ------------------------------------------------------------------ */
/* Revisi spek DED (pratinjau + konfirmasi — pola Gate 3)              */
/*                                                                     */
/* Merevisi spek DED TIDAK PERNAH menimpa spek DED aslinya: nilai     */
/* DED tetap tersimpan di ctx.dedSpecs; revisi yang dikonfirmasi      */
/* menjadi jawaban percakapan (ctx.answers) sehingga derive aturan    */
/* (c) mengeluarkannya sebagai spek CONFIRMED bersumber 'percakapan'  */
/* dengan `supersedes: 'ded-spec:<key>'` — DED/USER tetap terbedakan */
/* dan nilai DED asli dapat dibuktikan kapan pun.                     */
/* ------------------------------------------------------------------ */

export interface DedSpecRevisionPreview {
  id: string;
  key: string;
  label: string;
  oldValue: number;
  oldUnit: string | undefined;
  oldProvenance: string | undefined;
  newValue: number;
  newUnit: string;
  createdAt: string;
}

export const DED_DIMENSION_KEYS: Record<string, { key: string; label: string; unit: string }> = {
  panjang: { key: 'ded-length', label: 'Panjang (dari DED)', unit: 'm' },
  lebar: { key: 'ded-width', label: 'Lebar (dari DED)', unit: 'm' },
  tinggi: { key: 'ded-height', label: 'Tinggi (dari DED)', unit: 'm' },
  luas: { key: 'ded-area', label: 'Luas (dari DED)', unit: 'm²' },
  volume: { key: 'ded-volume', label: 'Volume (dari DED)', unit: 'm³' },
};

/**
 * Bangun pratinjau revisi spek DED — BELUM mengubah apa pun.
 * Gagal jujur bila: tidak ada spek DED untuk kunci itu; nilai baru
 * tidak valid (bukan angka / ≤ 0); nilai baru sama dengan nilai DED
 * (tidak ada perubahan).
 */
export function buildDedSpecRevisionPreview(
  dedSpecs: StructuredSpec[],
  key: string,
  newValue: number,
): { ok: boolean; preview?: DedSpecRevisionPreview; message: string } {
  const current = dedSpecs.find((s) => s.key === key && typeof s.value === 'number');
  if (!current || typeof current.value !== 'number') {
    return { ok: false, message: `Tidak ada spek DED untuk "${key}" yang dapat direvisi — revisi dibatalkan, tidak ada yang berubah.` };
  }
  if (!Number.isFinite(newValue) || newValue <= 0) {
    return { ok: false, message: `Nilai revisi "${newValue}" tidak valid untuk dimensi (harus angka lebih dari 0) — revisi dibatalkan.` };
  }
  if (newValue === current.value) {
    return { ok: false, message: `Nilai baru sama dengan nilai DED (${current.value} ${current.unit ?? ''}) — tidak ada perubahan, revisi dibatalkan.` };
  }
  const unit =
    current.unit ??
    Object.values(DED_DIMENSION_KEYS).find((e) => e.key === key)?.unit ??
    '';
  return {
    ok: true,
    preview: {
      id: `dedrev:${key}:${Date.now().toString(36)}`,
      key,
      label: current.label,
      oldValue: current.value,
      oldUnit: current.unit,
      oldProvenance: current.provenance,
      newValue,
      newUnit: unit,
      createdAt: new Date().toISOString(),
    },
    message: `Pratinjau revisi spek DED siap — belum aktif sampai Anda mengonfirmasi.`,
  };
}

/**
 * Terapkan revisi spek DED yang SUDAH dikonfirmasi: jawaban user
 * dicatat di ctx.answers (sumber 'percakapan' di derive) + catatan
 * koreksi; ctx.dedSpecs TIDAK DIUBAH (nilai DED asli dipertahankan).
 * Mengembalikan konteks BARU (klon dangkal + answers/corrections
 * baru) — pemanggil yang memasang singleton (restoreUniversalContext).
 */
export function applyDedSpecRevision(
  ctx: UniversalIntakeContext,
  preview: DedSpecRevisionPreview,
): UniversalIntakeContext {
  return {
    ...ctx,
    answers: { ...ctx.answers, [preview.key]: String(preview.newValue) },
    corrections: [
      ...ctx.corrections,
      {
        key: preview.key,
        from: `DED: ${preview.oldValue}${preview.oldUnit ? ` ${preview.oldUnit}` : ''}`,
        to: `Anda: ${preview.newValue}${preview.newUnit ? ` ${preview.newUnit}` : ''}`,
      },
    ],
  };
}

/**
 * Parser deterministik perintah revisi spek DED (dua bentuk):
 * - "ubah panjang DED jadi 12 m" / "ganti lebar DED menjadi 9"
 * - "panjang DED seharusnya 12 m" / "luas DED yang benar 120"
 * Bukan perintah revisi DED → null (jatuh ke routing normal).
 * Nilai desimal koma didukung ("12,5" → 12.5).
 */
export function parseDedSpecRevisionCommand(msg: string): { key: string; value: number } | null {
  const t = ` ${(msg || '').toLowerCase().replace(/\s+/g, ' ')} `;
  const dimWords = Object.keys(DED_DIMENSION_KEYS).join('|');
  const m1 = t.match(
    new RegExp(`\\b(ubah|ganti|koreksi|ralat)\\s+(${dimWords})\\s+(?:ded|dari\\s+ded)\\s+(?:jadi|menjadi)\\s+(\\d+(?:[.,]\\d+)?)`),
  );
  const m2 = !m1
    ? t.match(
        new RegExp(`\\b(${dimWords})\\s+(?:ded|dari\\s+ded)\\s+(?:seharusnya|harusnya|yang\\s+benar)\\s+(\\d+(?:[.,]\\d+)?)`),
      )
    : null;
  const m = m1 ?? m2;
  if (!m) return null;
  // m1: [verb, dimWord, value]; m2: [dimWord, value].
  const dimWord = m1 ? m[2] : m[1];
  const valueRaw = m1 ? m[3] : m[2];
  const entry = DED_DIMENSION_KEYS[dimWord];
  if (!entry) return null;
  const value = Number(String(valueRaw).replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return { key: entry.key, value };
}

/** Pesan pratinjau revisi spek DED (BELUM AKTIF sampai dikonfirmasi). */
export function formatDedSpecRevisionPreviewMessage(preview: DedSpecRevisionPreview): string {
  const lines = [
    `**Pratinjau revisi spek DED — BELUM AKTIF**`,
    '',
    `• ${preview.label}: ${preview.oldValue}${preview.oldUnit ? ` ${preview.oldUnit}` : ''} (DED) → **${preview.newValue}${preview.newUnit ? ` ${preview.newUnit}` : ''} (Anda)**.`,
  ];
  if (preview.oldProvenance) lines.push(`• Provenans nilai DED: ${preview.oldProvenance}.`);
  lines.push(
    '',
    'Nilai DED asli TIDAK ditimpa — revisi ini dicatat sebagai jawaban Anda yang menimpa spek DED (sumber berubah menjadi "percakapan", nilai DED tetap tersimpan di data DED dan dapat dibuktikan).',
    'Konfirmasi untuk menerapkan, atau batalkan — spek DED tetap berlaku sampai Anda mengonfirmasi.',
  );
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Resolusi harga DED (resolver kanonis — tanpa harga karangan)        */
/* ------------------------------------------------------------------ */

export interface DedPriceReview {
  itemId: string;
  name: string;
  unit: string;
  /** Kandidat AHSP resmi terverifikasi (harga dari resolver; null bila unresolved). */
  candidates: AhspCandidate[];
  /** True bila tidak satu pun kandidat ditemukan (dinyatakan unresolved). */
  unresolved: boolean;
}

/**
 * Resolusi harga untuk item DED tanpa harga, memakai resolver kanonis
 * (`retrieveDomainCandidates` → `verifyAhspCandidate`): kandidat AHSP
 * resmi + provenans; tanpa kandidat → unresolved (bukan Rp0, bukan
 * karangan); UNIT_MISMATCH → harga null (diblokir di resolver).
 * Deterministik lokal — tanpa panggilan provider. Dibatasi
 * DED_PRICE_REVIEW_MAX_ITEMS item pertama tanpa harga agar konsumsi
 * lampiran tetap cepat; sisanya dilaporkan sebagai belum di-review.
 */
export function resolveDedItemPrices(
  attachment: DedAttachment,
  maxItems: number = DED_PRICE_REVIEW_MAX_ITEMS,
): { reviews: DedPriceReview[]; unreviewedCount: number } {
  const unpriced = attachment.items.filter((it) => it.unitPrice == null);
  const reviews: DedPriceReview[] = [];
  for (const it of unpriced.slice(0, maxItems)) {
    const result = retrieveDomainCandidates([it.name], { maxAhspPerQuery: 2, requestedUnit: it.units });
    reviews.push({
      itemId: it.id,
      name: it.name,
      unit: it.units,
      candidates: result.ahspCandidates,
      unresolved: result.ahspCandidates.length === 0 && result.kbHits.length === 0,
    });
  }
  return { reviews, unreviewedCount: Math.max(0, unpriced.length - reviews.length) };
}

/* ------------------------------------------------------------------ */
/* Umpan balik UI (label visual berbeda per kategori)                  */
/*                                                                     */
/* Label yang dipakai konsisten di pesan chat, brief, dan pesan draft: */
/*  [DED] data DED terkonfirmasi · [ANDA] data terkonfirmasi user ·   */
/*  [ASUMSI] asumsi (belum dikonfirmasi) · [HILANG] data hilang ·     */
/*  [KONFLIK] DED vs user berbeda · [QTO] rekonsiliasi ·              */
/*  [DIBLOKIR] unit mismatch · [BELUM BERHARGA] harga unresolved.     */
/* ------------------------------------------------------------------ */

export interface DedFeedbackInput {
  attachment: DedAttachment;
  understanding: DedUnderstandingResult;
  userDims: QtoUserDimensions;
  conflicts: DedSpecConflict[];
  checks: QtoCheck[];
  proposals: QtoCorrectionProposal[];
  priceReview: { reviews: DedPriceReview[]; unreviewedCount: number };
}

const fmtQty = (v: number): string =>
  v.toLocaleString('id-ID', { maximumFractionDigits: 2 });

/** Pesan umpan balik konsumsi DED (satu pesan chat, seksi berlabel). */
export function formatDedFeedbackLines(input: DedFeedbackInput): string[] {
  const { attachment, understanding, userDims, conflicts, checks, proposals, priceReview } = input;
  const lines: string[] = [];
  const fileLabel = attachment.fileName ? `"${attachment.fileName}"` : attachment.projectName || 'tanpa nama';
  lines.push(`**DED diterima: ${fileLabel}** (job ${attachment.jobId || 'tanpa-id'}; ${understanding.coverage.totalItems} item; ${understanding.coverage.itemsFullyResolved} ter-resolver penuh${understanding.coverage.partial ? '; HASIL PARSIAL' : ''}).`);
  lines.push('');
  // --- Spek DED terkonfirmasi ---
  const confirmed = understanding.specs.filter((s) => s.status === 'CONFIRMED');
  const assumed = understanding.specs.filter((s) => s.status === 'ASSUMPTION');
  if (confirmed.length > 0) {
    lines.push('**[DED] Data DED terkonfirmasi**');
    for (const s of confirmed) {
      lines.push(`• [DED] ${s.label}: ${fmtQty(s.value as number)}${s.unit ? ` ${s.unit}` : ''}${s.provenance ? ` — ${s.provenance}` : ''}.`);
    }
    lines.push('');
  }
  // --- Dimensi user yang dipakai sebagai pembanding ---
  const userDimParts: string[] = [];
  if (userDims.lengthM != null && userDims.widthM != null) userDimParts.push(`${fmtQty(userDims.lengthM)} × ${fmtQty(userDims.widthM)} m`);
  else {
    if (userDims.lengthM != null) userDimParts.push(`panjang ${fmtQty(userDims.lengthM)} m`);
    if (userDims.widthM != null) userDimParts.push(`lebar ${fmtQty(userDims.widthM)} m`);
  }
  if (userDims.depthM != null) userDimParts.push(`kedalaman ${fmtQty(userDims.depthM)} m`);
  if (userDims.buildingAreaM2 != null) userDimParts.push(`luas bangunan ${fmtQty(userDims.buildingAreaM2)} m²`);
  if (userDims.heightM != null) userDimParts.push(`tinggi ${fmtQty(userDims.heightM)} m`);
  if (userDimParts.length > 0) {
    lines.push(`**[ANDA] Dimensi Anda (pembanding QTO):** ${userDimParts.join('; ')}.`);
    lines.push('');
  }
  // --- Asumsi ---
  if (assumed.length > 0) {
    lines.push('**[ASUMSI] Asumsi dari DED (belum dikonfirmasi — bukan fakta)**');
    for (const s of assumed) {
      lines.push(`• [ASUMSI] ${s.label}: ${fmtQty(s.value as number)}${s.unit ? ` ${s.unit}` : ''} — input derivasi bersumber ASUMPTION; tetap asumsi sampai Anda mengonfirmasi.`);
    }
    lines.push('');
  }
  // --- Data hilang ---
  if (understanding.missingData.length > 0) {
    lines.push('**[HILANG] Data hilang (tidak diisi karangan)**');
    for (const m of understanding.missingData) lines.push(`• [HILANG] ${m}`);
    lines.push('');
  }
  if (understanding.insufficientDivisions.length > 0) {
    lines.push(`• [HILANG] Divisi dengan data tidak cukup: ${understanding.insufficientDivisions.join(', ')}.`);
    lines.push('');
  }
  // --- Konflik ---
  if (conflicts.length > 0) {
    lines.push('**[KONFLIK] DED vs Anda — perlu keputusan Anda (tidak dipilih diam-diam)**');
    for (const c of conflicts) {
      lines.push(`• [KONFLIK] ${c.label}: DED ${fmtQty(c.dedValue)}${c.dedUnit ? ` ${c.dedUnit}` : ''} vs Anda ${fmtQty(c.userValue)} ${c.userUnit} (selisih ${(c.diffRatio * 100).toFixed(0)}%). Koreksi spek DED lewat perintah "ubah ${c.label.toLowerCase()} DED jadi <angka> m" — nilai DED asli tetap tersimpan.`);
    }
    lines.push('');
  }
  // --- Rekonsiliasi QTO ---
  const summary = summarizeDedQtoChecks(checks);
  lines.push('**[QTO] Rekonsiliasi QTO (kuantitas DED vs dimensi Anda)**');
  if (userDimParts.length === 0) {
    lines.push('• Dimensi Anda belum ada — rekonsiliasi belum dapat membandingkan angka (semua item CANNOT_CHECK). Sebutkan dimensi (mis. "gedung 10 x 8 m, kedalaman 0,5 m") lalu susun draft; rekonsiliasi berjalan saat draft disusun.');
  } else {
    lines.push(`• Ringkasan: ${summary.ok} cocok · ${summary.mismatch} tidak cocok · ${summary.missing} kuantitas hilang · ${summary.unitMismatch} unit tidak cocok (diblokir) · ${summary.assumption} berasumsi · ${summary.cannotCheck} tidak dapat diperiksa.`);
    for (const c of checks) {
      if (c.verdict === 'MISMATCH') {
        lines.push(`• [QTO MISMATCH] ${c.description}: DED ${fmtQty(c.quantity as number)} ${c.unit} vs dimensi Anda ${fmtQty(c.expectedFromUserDimensions as number)} ${c.unit} — ${c.detail}`);
      } else if (c.verdict === 'MISSING') {
        lines.push(`• [QTO HILANG] ${c.description}: kuantitas hilang (null, bukan 0) — ${c.detail}`);
      } else if (c.verdict === 'UNIT_MISMATCH') {
        lines.push(`• [DIBLOKIR] ${c.description}: ${c.detail}`);
      } else if (c.verdict === 'ASSUMPTION') {
        lines.push(`• [QTO ASUMSI] ${c.description}: ${fmtQty(c.quantity as number)} ${c.unit} — ${c.detail}`);
      }
    }
    if (proposals.length > 0) {
      lines.push(`• ${proposals.length} koreksi QTO ditawarkan di bawah — terima atau tolak per item (tombol). Penolakan mempertahankan nilai DED.`);
    }
  }
  lines.push('');
  // --- Harga ---
  if (priceReview.reviews.length > 0 || priceReview.unreviewedCount > 0) {
    lines.push('**[HARGA] Resolusi harga item DED tanpa harga (resolver kanonis)**');
    for (const r of priceReview.reviews) {
      if (r.candidates.length === 0) {
        lines.push(`• [BELUM BERHARGA] "${r.name}": tidak ditemukan kandidat AHSP resmi — dinyatakan belum berharga, bukan Rp0.`);
      } else {
        for (const cand of r.candidates) {
          const price = cand.unitPrice != null
            ? `Rp${cand.unitPrice.toLocaleString('id-ID')}/${cand.unit}`
            : `harga ${cand.priceStatus} (bukan Rp0)`;
          lines.push(`• [HARGA] "${r.name}" → AHSP ${cand.code} — ${cand.name} (${cand.unit}): ${price}. ${cand.provenance}`);
        }
      }
    }
    if (priceReview.unreviewedCount > 0) {
      lines.push(`• ${priceReview.unreviewedCount} item tanpa harga belum di-review (cap review ${DED_PRICE_REVIEW_MAX_ITEMS} item) — tetap belum berharga, bukan Rp0.`);
    }
    lines.push('');
  }
  if (attachment.truncatedItems > 0) {
    lines.push(`Catatan lampiran: ${attachment.truncatedItems} item DED terpotong cap lampiran (${DED_ATTACHMENT_MAX_ITEMS} item) — tidak dihitung di rekonsiliasi ini.`);
    lines.push('');
  }
  lines.push('Spek DED kini masuk spek terstruktur proyek (sumber DED, provenans per spek) dan dipakai untuk rekonsiliasi QTO. Dimensi DED TIDAK menimpa dimensi Anda — bila berbeda, konflik di atas yang berlaku.');
  return lines;
}

/** Seksi DED/QTO untuk pesan draft (dipakai formatUniversalDraftMessage). */
export function formatDedQtoDraftLines(dedQto: DedQtoDraftInfo): string[] {
  const lines: string[] = [];
  const s = dedQto.summary;
  const fileLabel = dedQto.attachmentRef.fileName
    ? `"${dedQto.attachmentRef.fileName}"`
    : dedQto.attachmentRef.projectName || 'tanpa nama';
  lines.push(`**Rekonsiliasi DED/QTO** (DED ${fileLabel}, job ${dedQto.attachmentRef.jobId || 'tanpa-id'}):`);
  lines.push(`• Ringkasan QTO: ${s.ok} cocok · ${s.mismatch} tidak cocok · ${s.missing} kuantitas hilang · ${s.unitMismatch} unit tidak cocok (diblokir) · ${s.assumption} berasumsi · ${s.cannotCheck} tidak dapat diperiksa.`);
  for (const c of dedQto.checks) {
    if (c.verdict === 'MISMATCH') {
      lines.push(`• [QTO MISMATCH] ${c.description}: DED ${fmtQty(c.quantity as number)} ${c.unit} vs dimensi Anda ${fmtQty(c.expectedFromUserDimensions as number)} ${c.unit} — dilaporkan, bukan dikoreksi diam-diam.`);
    } else if (c.verdict === 'MISSING') {
      lines.push(`• [QTO HILANG] ${c.description}: kuantitas hilang (null, bukan 0).`);
    } else if (c.verdict === 'UNIT_MISMATCH') {
      lines.push(`• [DIBLOKIR] ${c.description}: ${c.detail}`);
    }
  }
  for (const d of dedQto.decisions) {
    if (d.action === 'confirmed') {
      lines.push(`• [QTO TERKOREKSI] ${d.description}: ${fmtQty(d.originalQuantity as number)} → ${fmtQty(d.correctedQuantity as number)} ${d.unit} (dikoreksi atas konfirmasi Anda; nilai DED asli tersimpan).`);
    } else {
      lines.push(`• [QTO DITOLAK] ${d.description}: koreksi ke ${fmtQty(d.correctedQuantity as number)} ${d.unit} ditolak — nilai DED ${fmtQty(d.originalQuantity as number)} ${d.unit} dipertahankan.`);
    }
  }
  lines.push('• Dimensi DED tidak menimpa dimensi Anda dan tidak mengubah total RAB kanonis — rekonsiliasi ini adalah lapisan validasi, bukan input angka baru ke mesin RAB.');
  return lines;
}

/** Bangun DedQtoDraftInfo dari lampiran + hasil rekonsiliasi (untuk buildUniversalDraft). */
export function buildDedQtoDraftInfo(
  attachment: DedAttachment,
  checks: QtoCheck[],
  dims?: QtoUserDimensions,
): DedQtoDraftInfo {
  return {
    attachmentRef: {
      jobId: attachment.jobId,
      fileName: attachment.fileName,
      projectName: attachment.projectName,
    },
    reconciledAt: new Date().toISOString(),
    checks,
    decisions: attachment.decisions.map((d) => ({ ...d })),
    ...(dims ? { dims: { ...dims } } : {}),
    summary: summarizeDedQtoChecks(checks),
  };
}

/**
 * Dimensi efektif untuk rekonsiliasi lanjutan (handler tombol koreksi):
 * dimensi yang dipakai saat draft disusun (`dedQto.dims`) DIUTAMAKAN;
 * dimensi hidup hanya fallback bila draft tak membawa dims tersimpan.
 * Null bila keduanya kosong — jujur: tidak ada dasar hitung ulang
 * (handler lalu memakai checks tersimpan draft, bukan mengarang dimensi).
 *
 * F9-QTO-1 (gelombang perbaikan 2026-11-12): urutan lama mendahulukan
 * dimensi hidup bila satu pun medannya terisi — tetapi singleton
 * konteks hidup sesudah generate/remount kosong ATAU milik konteks
 * lain (mis. snapshot multi-gedung ter-link membawa lengthM: 50 jalan
 * akses tanpa lebar/kedalaman), sehingga dimensi parsial usang
 * membayangi dims tersimpan yang benar dan rekomputasi menghasilkan
 * CANNOT_CHECK. Usulan yang tampil dihitung dari dims tersimpan, jadi
 * handler WAJIB mereproduksi rekonsiliasi yang sama untuk menemukan
 * usulan itu. Satu-satunya pemanggil produksi fungsi ini adalah
 * handler koreksi QTO (view.tsx); tidak ada jalur lain yang berubah.
 * Semantik rekonsiliasi kanonis (checkQtoAgainstUserDimensions)
 * TIDAK disentuh.
 */
export function resolveQtoDims(
  liveDims: QtoUserDimensions | null | undefined,
  draftDedQto?: DedQtoDraftInfo | null,
): QtoUserDimensions | null {
  const hasAny = (d: QtoUserDimensions | null | undefined): d is QtoUserDimensions =>
    !!d &&
    (d.lengthM != null ||
      d.widthM != null ||
      d.depthM != null ||
      d.heightM != null ||
      d.buildingAreaM2 != null ||
      d.landAreaM2 != null);
  if (hasAny(draftDedQto?.dims)) return draftDedQto!.dims!;
  if (hasAny(liveDims)) return liveDims;
  return null;
}

/**
 * Segarkan checks tersimpan sesudah keputusan koreksi TANPA dimensi
 * (rekomputasi penuh tidak mungkin): item yang DIKONFIRMASI menjadi
 * OK — kuantitas baru SAMA DENGAN ekspektasi usulan menurut konstruksi
 * proposal (bukan tebakan); penolakan tidak mengubah checks. Dipakai
 * hanya bila resolveQtoDims mengembalikan null; bila dims tersedia,
 * handler selalu rekomputasi penuh lewat reconcileDedQto.
 */
export function patchDedQtoChecksAfterDecision(
  checks: QtoCheck[],
  decision: QtoDecision,
): QtoCheck[] {
  if (decision.action !== 'confirmed') return checks;
  return checks.map((c) =>
    c.description === decision.description
      ? {
          ...c,
          quantity: decision.correctedQuantity,
          verdict: 'OK' as const,
          detail: `Dikoreksi atas konfirmasi Anda: ${decision.originalQuantity} → ${decision.correctedQuantity} ${decision.unit} (sesuai dimensi Anda).`,
          expectedFromUserDimensions: decision.correctedQuantity,
        }
      : c,
  );
}

/** Seksi QTO siap tempel ke builder kanonis (dipakai view sebelum send). */
export function buildQtoSectionForAttachment(
  attachment: DedAttachment,
  dims: QtoUserDimensions,
): string {
  return formatQtoCheckLines(reconcileDedQto(attachment, dims).checks).join('\n');
}
