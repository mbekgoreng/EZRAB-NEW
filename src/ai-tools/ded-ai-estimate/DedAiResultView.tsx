/**
 * DED-AI Estimate — Tampilan 3: HASIL.
 * Ringkasan jujur + tabel item (edit/filter/detail) + aksi.
 * Aturan: item diblokir & tanpa harga TIDAK masuk total final. Rp0 tidak dipakai
 * sebagai pengganti data kosong — tampilkan "—".
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, AlertTriangle, XCircle, MinusCircle, Pencil, ChevronDown,
  ChevronUp, Save, FolderCheck, Table2, FileSpreadsheet, FileJson,
  ArrowLeft, Info, Check, X, Sparkles, Undo2, MessageSquare, Lock, Eye,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { DedAiItem, DedAiOutput, DedCompletionReport, DedOutputPrefs, DEFAULT_DED_OUTPUT_PREFS } from './types';
import { DedAiCalculator, applyUnitChange, clearStaleProposal } from './calculator';
import {
  completeDedBatch, completeDedItem, derivePlanContext, rejectCompletion, acceptCompletion,
} from './priceCompletion';
import { resolveCanonicalCode } from '../ded-canonical/canonicalDedPricing';
import { groupByWbs, WbsGroup } from './wbsClassifier';
// WD-3.7-08 (Batch 4): label kanonis satuan-diasumsikan untuk ekspor Excel
// + ringkasan WBS — satu sumber dengan dedOutputContract.
import { exportUnitLabel, countUnitUnknown } from './unitUnknownLabel';
// W6 (§8): chip + penjelasan provenance dari SATU tabel kanonis
// (dedProvenance.ts) — estimasi AI dibedakan visual dari data terverifikasi.
import { provenanceBadgeForDedSource, provenanceExplanationForDedSource } from './dedProvenance';
// F3-1 (gelombang perbaikan 2026-11-14): banner "Mode:" memakai mode
// kanonis mesin-menang (modeFromLegacy), bukan policy mentah — lihat
// `resultMode` di bawah. dedMode.ts tanpa impor `src` (tanpa risiko
// impor siklik).
import { modeFromLegacy } from './dedMode';
// DED Hasil + Gerbang Review (mockup v2.3, ACC owner 2026-11-19 04:14):
// taksonomi chip bukti kuantitas + daftar tinjau + keputusan finalisasi
// dari SATU modul murni (dedReviewGate.ts) — dipakai kedua result view.
import {
  QUANTITY_EVIDENCE_LEGEND, quantityEvidenceChipFor, reviewGateItemsForDed,
  reviewGateSummary, reviewedCount, isReviewGateComplete, canFinalizeWithGate,
  countSavableDed,
} from './dedReviewGate';
// Phase B (DED RAB Validation Gate, advisory): per-item gate status —
// DISPLAY ONLY; never changes savable/finalize semantics.
import { validateDedAiItem, blockingSummary } from './dedRabValidationGate';
// Phase C: live self-review audit (display only).
import { runSelfReviewAudit, type SelfReviewAuditReport } from './dedSelfReviewAudit';
import { AHSP_DATABASE_VERSION } from '../../data/nationalCostDatabase/types';
import { useI18n } from '../../i18n/I18nContext';
import { FsFooterPortal } from '../../components/feature-shell/FeatureFullscreenShell';
// I7b — Tinjau visual (split-view, konsep ter-ACC owner 2026-10-07):
// viewer gambar DED di kiri + panel hasil di kanan. ReviewState murni
// (ded-vision/reviewState.ts) + jembatan ke item live
// (ded-vision/reviewIntegration.ts). Viewer TIDAK mengimpor CSS sendiri
// — view ini yang mengimpor dedVisionReview.css (lihat bawah).
import { DedVisionReviewViewer } from './DedVisionReviewViewer';
import type { FocusTarget } from './DedVisionReviewViewer';
import {
  REVIEW_STATUS_LABELS, approveAssumption, clampConfidence, confidenceToColor,
  confirmItem, correctItem, createReviewState, jumpTarget, rejectAssumption,
  rejectItem, reviewItemById,
} from '../ded-vision/reviewState';
import type { ReviewItem, ReviewState } from '../ded-vision/reviewState';
import {
  buildReviewItems, dedAiIdFromReviewId, liveItemFingerprint, mirrorReviewConfirmation,
  mirrorReviewCorrection, mirrorReviewRejection, reconcileReviewState, reviewIdForDedAiItem,
} from '../ded-vision/reviewIntegration';
// I11 Stage 1 — demo visual-test hook (LOCAL TEST ONLY, demo-gated):
// item vision-only sintetis (pita keyakinan kuning) hanya bila URL
// membawa `?dedvr-demo=1` (lihat dedVisionReviewDemo.ts).
import { buildDemoVisionReviewItems, isDedVisionReviewDemoRequested } from './dedVisionReviewDemo';
import './dedAi.css';
import './dedVisionReview.css';
import '../../ai-credits/ai-credits.css';

export type ItemStatus = 'valid' | 'review' | 'blocked' | 'no-price';

export function getItemStatus(it: DedAiItem): ItemStatus {
  if (it.quantity == null) return 'blocked';
  if (it.unitPrice == null) return 'no-price';
  if (it.quantitySource === 'AI_INFERENCE' || it.quantitySource === 'ASSUMPTION') return 'review';
  return 'valid';
}

const getStatusMeta = (
  t: (key: string) => string,
): Record<ItemStatus, { label: string; icon: React.ReactNode }> => ({
  valid: { label: t('ai.ded.result.filter_valid'), icon: <CheckCircle2 size={12} /> },
  review: { label: t('ai.ded.result.status_review'), icon: <AlertTriangle size={12} /> },
  blocked: { label: t('ai.ded.result.status_blocked'), icon: <XCircle size={12} /> },
  'no-price': { label: t('ai.ded.result.stat_no_price'), icon: <MinusCircle size={12} /> },
});

const fmtRp = (n: number | null) =>
  n == null ? '—' : 'Rp' + Math.round(n).toLocaleString('id-ID');
const fmtQty = (n: number | null) => {
  if (n == null) return '—';
  // Tampilkan presisi cukup agar cocok dengan subtotal (q × p).
  // Nilai kecil (< 0.1) butuh 4 desimal, selebihnya 2 desimal.
  if (Number.isInteger(n)) return n.toLocaleString('id-ID');
  const digits = Math.abs(n) < 0.1 ? 4 : 2;
  return n.toLocaleString('id-ID', { maximumFractionDigits: digits });
};

const getFilters = (
  t: (key: string) => string,
): Array<{ id: ItemStatus | 'all'; label: string }> => [
  { id: 'all', label: t('ai.ded.result.filter_all') },
  { id: 'valid', label: t('ai.ded.result.filter_valid') },
  { id: 'review', label: t('ai.ded.result.badge_review') },
  { id: 'blocked', label: t('ai.ded.result.stat_blocked') },
  { id: 'no-price', label: t('ai.ded.result.stat_no_price') },
];

interface Props {
  output: DedAiOutput;
  onBackToInput: () => void;
  onSaveDraft: (items: DedAiItem[]) => void;
  onFinalize: (items: DedAiItem[]) => Promise<{ ok: boolean; message: string }>;
  onOpenSpreadsheet: () => void;
  /**
   * GATE 4 (5D) — kirim hasil DED ini ke Chat AI (permukaan UI yang
   * ditunda Overhaul Fase 5 ke Fase 9; 5D MEMBUTUHKANNYA karena tanpa
   * permukaan ini tidak ada alur DED→Chat AI di browser sama sekali —
   * hanya record memori teks). Opsional: tombol hanya tampil bila
   * pemanggil menyediakan handler. Item yang dikirim adalah item
   * SAAT INI (sesudah edit pengguna di layar ini), seperti onSaveDraft.
   */
  onSendToChat?: (items: DedAiItem[]) => void;
  draftSaved: boolean;
  finalized: boolean;
  /** Estimasi kredit simulasi yang disetujui (dari input view). */
  creditEstimate?: { category: string; credits: number };
  /**
   * Preferensi output dari layar input (USULAN BARU ter-ACC 2026-11-10):
   * mengatur bagian yang tampil di hasil & ekspor Excel. Peringatan
   * kebijakan harga, lencana status, dan aksi koreksi TIDAK digerbang.
   */
  outputPrefs?: DedOutputPrefs;
  /**
   * I7b — gambar halaman DED untuk panel gambar split-view: preview
   * 1.0× per halaman dari parser (`previewDataUrl`, parser.ts). Opsional:
   * lari lama / `withImages: false` tidak membawa gambar — viewer
   * menampilkan empty state jujur per halaman dan panel hasil tetap
   * bekerja penuh (tinjau, koreksi, gerbang, finalisasi). I8 menyambung
   * pemanggil (view.tsx + service) agar mengoper preview parser ke sini.
   */
  pageImages?: Map<number, string> | Array<{ page: number; dataUrl: string }>;
  /**
   * I11 Stage 1b (Finding 3) — pemberitahuan di atas hasil (mis. strip
   * kuantitas asumsi dari view.tsx), dirender sebagai anak PERTAMA
   * .dedai agar ikut bergeser dengan hasil. JANGAN dirender pemanggil
   * sebagai saudara .dedai di dalam .fp-content: sebagai item flex
   * saudara, strip itu tidak bisa menyusut dan .dedai (min-height: 0)
   * menyerap SEMUA susut — di HP .dedai terjepit 53px.
   */
  topNotice?: React.ReactNode;
}

export const DedAiResultView: React.FC<Props> = ({
  output, onBackToInput, onSaveDraft, onFinalize, onOpenSpreadsheet, onSendToChat, draftSaved, finalized,
  creditEstimate, outputPrefs, pageImages, topNotice,
}) => {
  const prefs = outputPrefs ?? DEFAULT_DED_OUTPUT_PREFS;
  const { t } = useI18n();
  const statusMeta = getStatusMeta(t);
  const filters = getFilters(t);
  const [items, setItems] = useState<DedAiItem[]>(output.items);
  const [filter, setFilter] = useState<ItemStatus | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVals, setEditVals] = useState<{ name: string; quantity: string; units: string }>({ name: '', quantity: '', units: '' });
  const [finalizing, setFinalizing] = useState(false);
  const [finalMsg, setFinalMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bulkFill, setBulkFill] = useState(false);
  const [bulkVals, setBulkVals] = useState<Record<string, string>>({});
  const [wbsExpanded, setWbsExpanded] = useState<Set<string>>(new Set());
  const [showWbs, setShowWbs] = useState(false);
  const [confirmError, setConfirmError] = useState<Record<string, string>>({});
  const [completionReport, setCompletionReport] = useState<DedCompletionReport | null>(
    output.completionReport ?? null,
  );
  // Gerbang review (mockup v2.3): centang per item tinjau — state lokal
  // view ini saja (view.tsx tidak disentuh). TIDAK ADA "tandai semua"
  // (keputusan owner no. 3 masih terbuka — default fail-closed).
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  // ---- I7b: tinjau visual (split-view) ----
  // ReviewState dibangun sekali dari item hasil; keputusan tinjau
  // (konfirmasi/koreksi/penolakan/asumsi) hidup di sini dan DICERMINKAN
  // ke `items` — satu-satunya daftar yang difinalisasi, disimpan draf,
  // dan diekspor. TIDAK ADA jalur finalisasi kedua: gerbang review
  // (dedReviewGate) diturunkan dari `items`, sehingga ia melihat
  // keputusan tinjau secara otomatis (item terkoreksi jadi USER_INPUT
  // dan keluar dari alasan kuantitas gerbang; item ditolak jadi
  // terblokir dan tidak savable). Konfirmasi juga mencentang gerbang
  // item itu (pengguna sudah meninjaunya) — lihat handleReviewConfirm.
  const [reviewState, setReviewState] = useState<ReviewState>(
    () =>
      createReviewState(
        // I11 Stage 1 (demo-gated `?dedvr-demo=1`): tambahkan item
        // vision-only sintetis (pita kuning) — tanpa param, persis
        // seperti sebelumnya (item live saja).
        isDedVisionReviewDemoRequested()
          ? [...buildReviewItems(output.items), ...buildDemoVisionReviewItems()]
          : buildReviewItems(output.items),
      ),
  );
  // Sidik jari item live terakhir yang disinkronkan dengan reviewState
  // (reconcile di bawah). Aksi tinjau memperbaruinya di handler agar
  // cerminnya sendiri tidak me-reset keputusan yang baru dibuat.
  const reviewFingerprintsRef = useRef<Map<string, string>>(
    new Map(output.items.map((it) => [it.id, liveItemFingerprint(it)])),
  );
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  // Mobile (≤768px): toggle gambar/hasil, default hasil (perilaku prototipe).
  const [mobileView, setMobileView] = useState<'drawing' | 'results'>('results');
  // State UI per item tinjau (dikunci id DedAi, sejajar confirmError).
  const [correctVals, setCorrectVals] = useState<Record<string, string>>({});
  const [correctConfirm, setCorrectConfirm] = useState<Record<string, boolean>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [reviewError, setReviewError] = useState<Record<string, string>>({});
  const [reviewMsg, setReviewMsg] = useState<Record<string, string>>({});

  // Sinkronisasi review ↔ item live: bila `items` berubah DI LUAR panel
  // tinjau (edit pensil, isi cepat, pilih AHSP, penyelesaian AI), item
  // terkait di-reset ke baseline adapter — nilai yang ditinjau sudah
  // tidak ada lagi — sementara keputusan item lain dipertahankan.
  useEffect(() => {
    const res = reconcileReviewState(reviewState, items, reviewFingerprintsRef.current);
    reviewFingerprintsRef.current = res.fingerprints;
    if (res.changed) setReviewState(res.state);
    // reviewState sengaja tidak di deps: efek ini bereaksi pada `items`
    // saja; aksi tinjau memperbarui kedua state dalam satu handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Judul lembar dari jejak analisis (ditampilkan viewer bila ada; tanpa
  // jejak, judul kosong — bukan karangan).
  const pageTitles = useMemo(() => {
    const titles: Record<number, string> = {};
    for (const p of output.analysisTrace?.pages ?? []) {
      if (p.title && p.title.trim() !== '') titles[p.page] = p.title;
    }
    return titles;
  }, [output.analysisTrace]);

  // ReviewItem per id DedAi — untuk badge status di baris + blok detail.
  const reviewByLiveId = useMemo(() => {
    const m = new Map<string, ReviewItem>();
    for (const ri of reviewState.items) {
      const dedAiId = dedAiIdFromReviewId(ri.id);
      if (dedAiId !== null) m.set(dedAiId, ri);
    }
    return m;
  }, [reviewState]);
  // WBS grouping — dihitung dari items aktual, tidak mengubah data
  const wbsData = useMemo(
    () => groupByWbs(items, output.projectType || 'BANGUNAN'),
    [items, output.projectType]
  );


  const withStatus = useMemo(
    () => items.map((it) => ({ it, status: getItemStatus(it) })),
    [items]
  );
  const counts = useMemo(() => {
    const c: Record<ItemStatus, number> = { valid: 0, review: 0, blocked: 0, 'no-price': 0 };
    withStatus.forEach(({ status }) => { c[status] += 1; });
    return c;
  }, [withStatus]);

  // Total hanya dari item yang punya kuantitas & harga (valid + review).
  const grandTotal = useMemo(
    () => withStatus.reduce((acc, { it, status }) =>
      (status === 'valid' || status === 'review') && it.subtotal != null ? acc + it.subtotal : acc, 0),
    [withStatus]
  );
  const calculableCount = withStatus.filter(({ status }) => status === 'valid' || status === 'review').length;

  // Volume dikelompokkan per satuan — tidak dijumlah lintas satuan.
  const volumeByUnit = useMemo(() => {
    const m = new Map<string, number>();
    withStatus.forEach(({ it, status }) => {
      if ((status === 'valid' || status === 'review') && it.quantity != null) {
        m.set(it.units, (m.get(it.units) || 0) + it.quantity);
      }
    });
    return Array.from(m.entries());
  }, [withStatus]);

  const filtered = filter === 'all' ? withStatus : withStatus.filter(({ status }) => status === filter);

  // ---- Gerbang review: daftar tinjau diturunkan dari items SAAT INI
  // (edit/Pilih AHSP/penyelesaian otomatis mengubah daftar — item yang
  // sudah terkonfirmasi keluar dari gerbang dengan sendirinya). ----
  const gateItems = useMemo(() => reviewGateItemsForDed(items), [items]);
  const gateSummary = useMemo(() => reviewGateSummary(gateItems), [gateItems]);
  const gateCheckedCount = reviewedCount(gateItems, reviewed);
  const gateComplete = isReviewGateComplete(gateItems, reviewed);
  const savableCount = useMemo(() => countSavableDed(items), [items]);
  const gateAllowsFinalize = canFinalizeWithGate({ gateItems, checkedIds: reviewed, savableCount });

  // ---- Phase B: hasil gate validasi RAB per item (advisory, tampil saja).
  // Dihitung ulang dari `items` SAAT INI (edit pengguna ikut tercermin).
  // Tidak memengaruhi savable/finalisasi — hanya anotasi tampilan. ----
  const validationGateById = useMemo(
    () => new Map(items.map((it) => [it.id, validateDedAiItem(it, output.policy, { targetAhspVersion: AHSP_DATABASE_VERSION })])),
    [items, output.policy],
  );

  // ---- Phase C: audit self-review (tampil saja). ----
  // Audit hasil analisis (bila service sudah menghitungnya) dipakai apa
  // adanya; untuk hasil lama tanpa audit, dihitung ulang dari item SAAT
  // INI (diberi label hitung-ulang) dengan hasil gate Phase B sebagai
  // masukan Q14/Q15. Tidak memengaruhi savable/finalisasi.
  const storedAudit = (output as DedAiOutput & { selfReviewAudit?: SelfReviewAuditReport }).selfReviewAudit;
  const [showAudit, setShowAudit] = useState(false);
  const selfReviewAudit = useMemo(() => {
    if (storedAudit) return { audit: storedAudit, recomputed: false };
    const pagesProcessed = output.analysisTrace?.selectedPageCount ?? output.pageCount;
    return {
      audit: runSelfReviewAudit({
        items,
        pagesTotal: output.pageCount,
        pagesProcessed,
        planContext: derivePlanContext(items),
        gateResults: validationGateById,
      }),
      recomputed: true,
    };
  }, [storedAudit, items, output.pageCount, output.analysisTrace, validationGateById]);

  const toggleReviewed = (id: string) => {
    setReviewed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  // "Lihat" di gerbang: tampilkan semua baris, buka detail item, scroll ke barisnya.
  const viewGateItem = (id: string) => {
    setFilter('all');
    setExpanded(id);
    window.setTimeout(() => {
      document.getElementById(`dedai-row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  // ---- I7b: aksi tinjau visual ----
  // Klik baris hasil → pilih item + lompat ke halaman sumbernya. Viewer
  // HANYA bereaksi pada objek focusTarget BARU (kontrak props-driven),
  // jadi selalu bangun objek literal segar — termasuk bila targetnya
  // sama dengan lompat sebelumnya. Item live hari ini tanpa bbox:
  // lompatnya halaman saja, tidak ada penanda posisi palsu.
  const selectReviewItemAndJump = (dedAiId: string) => {
    const reviewId = reviewIdForDedAiItem(dedAiId);
    const ri = reviewItemById(reviewState, reviewId);
    setSelectedReviewId(reviewId);
    if (!ri) return;
    const target = jumpTarget(ri);
    if (target) setFocusTarget({ page: target.page, bbox: target.bbox });
  };

  // Klik penanda di viewer → pilih item + buka & sorot baris hasilnya.
  // Pemilihan saja TIDAK menggerakkan viewer (kontrak viewer: penanda
  // yang diklik sudah terlihat). Item visi-only (I8+) belum punya baris
  // live — hanya dipilih, tanpa scroll.
  const handleViewerSelect = (reviewId: string | null) => {
    setSelectedReviewId(reviewId);
    if (!reviewId) return;
    const dedAiId = dedAiIdFromReviewId(reviewId);
    if (!dedAiId) return;
    setFilter('all');
    setExpanded(dedAiId);
    window.setTimeout(() => {
      document.getElementById(`dedai-row-${dedAiId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  const setReviewNotice = (dedAiId: string, msg?: string, err?: string) => {
    setReviewMsg((m) => {
      const next = { ...m };
      if (msg) next[dedAiId] = msg; else delete next[dedAiId];
      return next;
    });
    setReviewError((e) => {
      const next = { ...e };
      if (err) next[dedAiId] = err; else delete next[dedAiId];
      return next;
    });
  };

  // Terapkan cermin keputusan tinjau ke `items` + tandai sidik jari item
  // itu agar reconcile tidak me-reset keputusan yang baru dibuat.
  const applyReviewMirror = (nextItems: DedAiItem[], dedAiId: string) => {
    const touched = nextItems.find((it) => it.id === dedAiId);
    if (touched) reviewFingerprintsRef.current.set(dedAiId, liveItemFingerprint(touched));
    setItems(nextItems);
  };

  const handleReviewConfirm = (dedAiId: string) => {
    const reviewId = reviewIdForDedAiItem(dedAiId);
    const res = confirmItem(reviewState, reviewId);
    if (!res.ok) { setReviewNotice(dedAiId, undefined, res.error); return; }
    setReviewState(res.state);
    applyReviewMirror(mirrorReviewConfirmation(items, dedAiId), dedAiId);
    // Konfirmasi tinjau = pengguna sudah meninjau item ini → centang
    // gerbangnya (bukan "tandai semua": satu aksi eksplisit per item).
    setReviewed((prev) => new Set(prev).add(dedAiId));
    setReviewNotice(dedAiId, 'Item dikonfirmasi — status Terverifikasi.');
  };

  const handleReviewReject = (dedAiId: string) => {
    const reason = (rejectReasons[dedAiId] ?? '').trim();
    const reviewId = reviewIdForDedAiItem(dedAiId);
    const res = rejectItem(reviewState, reviewId, reason);
    if (!res.ok) { setReviewNotice(dedAiId, undefined, res.error); return; }
    setReviewState(res.state);
    applyReviewMirror(mirrorReviewRejection(items, dedAiId, reason), dedAiId);
    // Item ditolak → terblokir (kuantitas null), keluar dari gerbang;
    // bersihkan centangnya agar tidak mengendap.
    setReviewed((prev) => {
      const next = new Set(prev);
      next.delete(dedAiId);
      return next;
    });
    setRejectingId(null);
    setReviewNotice(dedAiId, 'Deteksi ditolak — kuantitas dikosongkan, item tidak masuk total/finalisasi.');
  };

  const handleReviewCorrect = (dedAiId: string) => {
    const raw = (correctVals[dedAiId] ?? '').trim().replace(',', '.');
    const value = raw === '' ? NaN : Number(raw);
    const reviewId = reviewIdForDedAiItem(dedAiId);
    // Koreksi NILAI langsung (satu-satunya bentuk koreksi untuk item
    // live — koreksi per input ditolak reviewState karena item live
    // tanpa recomputeKind; UI menampilkan baris itu dalam keadaan
    // nonaktif dengan penjelasan). Penolakan (NaN/negatif/pecahan
    // untuk satuan hitung) ditampilkan apa adanya dari reviewState.
    const res = correctItem(
      reviewState,
      reviewId,
      { type: 'value', value },
      { confirm: !!correctConfirm[dedAiId] },
    );
    if (!res.ok) { setReviewNotice(dedAiId, undefined, res.error); return; }
    const corrected = reviewItemById(res.state, reviewId);
    setReviewState(res.state);
    if (corrected) applyReviewMirror(mirrorReviewCorrection(items, dedAiId, corrected), dedAiId);
    setCorrectVals((v) => {
      const next = { ...v };
      delete next[dedAiId];
      return next;
    });
    setReviewNotice(
      dedAiId,
      correctConfirm[dedAiId]
        ? 'Koreksi diterapkan dan dikonfirmasi — status Terverifikasi.'
        : 'Koreksi diterapkan — nilai baru masuk total & finalisasi. Rumus lama disimpan sebagai rumus asal.',
    );
  };

  const handleAssumptionDecision = (dedAiId: string, assumptionId: string, approve: boolean) => {
    const reviewId = reviewIdForDedAiItem(dedAiId);
    const res = approve
      ? approveAssumption(reviewState, reviewId, assumptionId)
      : rejectAssumption(reviewState, reviewId, assumptionId);
    if (!res.ok) { setReviewNotice(dedAiId, undefined, res.error); return; }
    setReviewState(res.state);
    if (!approve) {
      // Asumsi ditolak → dasar item digugat (reviewState memflag
      // NEEDS_REVIEW); centang gerbang lama — bila ada — tidak lagi
      // berlaku atas dasar yang digugat.
      setReviewed((prev) => {
        const next = new Set(prev);
        next.delete(dedAiId);
        return next;
      });
      setReviewNotice(dedAiId, 'Asumsi ditolak — item diflag Perlu ditinjau.');
    } else {
      setReviewNotice(dedAiId, 'Asumsi disetujui.');
    }
  };

  const startEdit = (it: DedAiItem) => {
    setEditing(it.id);
    setEditVals({ name: it.name, quantity: it.quantity != null ? String(it.quantity) : '', units: it.units });
  };
  const cancelEdit = () => { setEditing(null); };
  const commitEdit = (id: string) => {
    const q = editVals.quantity.trim() === '' ? null : Number(editVals.quantity.replace(',', '.'));
    const quantity = q != null && Number.isFinite(q) && q > 0 ? q : null;
    setItems((prev) => {
      const updated = prev.map((it) => {
        if (it.id !== id) return it;
        const newUnits = editVals.units.trim() || it.units;
        const newName = editVals.name.trim() || it.name;
        // Ganti satuan membatalkan harga kanonis (applyUnitChange) — harga
        // per satuan lama tidak boleh bertahan dengan label AHSP untuk
        // satuan baru. Edit kuantitas/satuan apa pun juga membatalkan
        // usulan AI lama (clearStaleProposal) agar tidak dibandingkan
        // dengan subtotal baru.
        const base = clearStaleProposal(applyUnitChange(it, newUnits));
        return {
          ...base,
          name: newName,
          quantity,
          // HARDENING Tahap 1: angka ketikan user adalah USER_PROVIDED —
          // label ASSUMPTION/AI lama tidak boleh bertahan atasnya, dan
          // blok audit kuantitas isian AI dicabut (sudah tidak berlaku).
          quantitySource: quantity != null ? ('USER_INPUT' as const) : base.quantitySource,
          quantityAudit: undefined,
          units: newUnits,
          quantityFormula: quantity != null
            ? `${t('ai.ded.result.formula_manual_a')} ${fmtQty(quantity)} ${newUnits}`
            : t('ai.ded.result.formula_cleared'),
          provenance: [...base.provenance, 'user-edit'],
        };
      });
      // Hitung ulang subtotal & stage via logika kanonis (sama seperti pipeline).
      return DedAiCalculator.finalizeItems(updated);
    });
    setEditing(null);
  };

  // Konfirmasi kandidat AHSP (review): resolusi ulang lewat jalur kode
  // eksak adapter, lalu staging ulang via finalizeItems (aturan yang sama
  // seperti pipeline — kuantitas tetap divalidasi, subtotal dihitung mesin).
  // Kandidat PARTIAL / satuan tak cocok / karantina ditolak di sini.
  const confirmAhspCandidate = (id: string, code: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (!target) return prev;
      const resolved = resolveCanonicalCode(code, target.units);
      if (resolved.status !== 'RESOLVED' || resolved.unitPrice == null) {
        setConfirmError((e) => ({ ...e, [id]: `Kandidat ${code} tidak bisa dipakai: ${resolved.reason}` }));
        return prev;
      }
      setConfirmError((e) => {
        const next = { ...e };
        delete next[id];
        return next;
      });
      const updated = prev.map((it) => it.id === id
        ? {
          ...it,
          unitPrice: resolved.unitPrice as number,
          priceSource: 'AHSP_2026' as const,
          ahspCode: resolved.matchedCode,
          ahspMatch: resolved,
          // Harga berubah jadi kanonis → usulan AI lama basi.
          aiProposedSubtotal: undefined,
          priceAssumptionNote: `AHSP kanonis ${resolved.matchedCode} (${resolved.sourceDocument}, biaya langsung) — dikonfirmasi pengguna dari kandidat review.`,
          provenance: [...it.provenance, `ahsp:${resolved.matchedCode}`],
        }
        : it);
      return DedAiCalculator.finalizeItems(updated);
    });
  };

  const commitBulkFill = () => {
    setItems((prev) => {
      const updated = prev.map((it) => {
        const val = bulkVals[it.id];
        if (val === undefined || val.trim() === '') return it;
        const q = Number(val.replace(',', '.'));
        const quantity = Number.isFinite(q) && q > 0 ? q : null;
        if (quantity == null) return it;
        return {
          ...it,
          quantity,
          // Sama seperti edit per item: isian massal = USER_PROVIDED.
          quantitySource: 'USER_INPUT' as const,
          quantityAudit: undefined,
          quantityFormula: `${t('ai.ded.result.formula_input_a')} ${fmtQty(quantity)} ${it.units}`,
          provenance: [...it.provenance, 'bulk-fill'],
          // Kuantitas berubah → usulan AI lama basi.
          aiProposedSubtotal: undefined,
        };
      });
      // Hitung ulang subtotal & stage via logika kanonis (sama seperti pipeline).
      return DedAiCalculator.finalizeItems(updated);
    });
    setBulkFill(false);
    setBulkVals({});
  };

  // ---- Lapisan penyelesaian AI (mode FULL_AI saja) ----
  // Batch: satu item gagal tidak menghentikan sisanya (completeDedBatch
  // menangkap kegagalan per item dan melaporkannya). Per item: tombol di
  // baris detail. Tolak: memulihkan keadaan sebelum penyelesaian.
  const policy = output.policy ?? 'FULL_AI';
  // F3-1 (gelombang perbaikan 2026-11-14): MODE KANONIS untuk banner
  // "Mode:" — mesin-menang via modeFromLegacy, konsisten dengan chip
  // shell (view.tsx:887, resolveDedAiMode). View ini selalu menampilkan
  // hasil MESIN STANDAR (mesin Full AI ditangani FullAiResultView —
  // view.tsx:943), sehingga fullAi=false dan modenya EZRAB_AI; policy
  // mentah TIDAK lagi menentukan label mode. Sebelumnya, draft legacy
  // hibrida (mesin standar + policy FULL_AI — justru default lama)
  // salah berlabel "FULL AI MODE" di banner padahal chip shell bilang
  // "EZRAB AI". Lari kanonis baru tidak berubah: EZRAB_AI ↔ DATABASE
  // selalu berpasangan. Policy mentah di atas tetap dipakai
  // penyelesaian harga (completeDedBatch/completeDedItem) — bukan
  // label mode. Policy diteruskan ke modeFromLegacy agar bila aturan
  // migrasi di dedMode.ts kelak memakainya, view ini ikut (pola yang
  // sama dengan modeFromPolicy di dataSourcePolicy.ts).
  const resultMode = modeFromLegacy({ policy, fullAi: false });
  const gapCount = withStatus.filter(({ status }) => status === 'blocked' || status === 'no-price').length;
  const runBatchCompletion = () => {
    setItems((prev) => {
      const res = completeDedBatch(prev, derivePlanContext(prev), { policy });
      setCompletionReport(res.report);
      return DedAiCalculator.finalizeItems(res.items);
    });
  };
  const runItemCompletion = (id: string) => {
    setItems((prev) => {
      const ctx = derivePlanContext(prev);
      const updated = prev.map((it) => (it.id === id ? completeDedItem(it, ctx, { policy }).item : it));
      return DedAiCalculator.finalizeItems(updated);
    });
  };
  const runRejectCompletion = (id: string) => {
    setItems((prev) => DedAiCalculator.finalizeItems(prev.map((it) => (it.id === id ? rejectCompletion(it) : it))));
  };
  // HARDENING Tahap 5: terima adalah AKSI eksplisit yang tercatat
  // (userApprovalStatus APPROVED), bukan lagi teks pasif "biarkan
  // terpasang". Nilai tidak berubah — hanya status persetujuannya.
  const runAcceptCompletion = (id: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? acceptCompletion(it) : it)));
  };

  const handleFinalize = async () => {
    if (finalizing || finalized) return;
    // Pertahanan lapis kedua: tombol sudah disabled saat gerbang belum
    // lengkap, tapi handler WAJIB memeriksa lagi sebelum memanggil
    // onFinalize (disable saja tidak cukup). Validator fail-closed di
    // handler (dedFinalizeValidation) tetap menjadi gerbang akhir.
    if (!gateComplete) {
      const remaining = gateItems.length - gateCheckedCount;
      setFinalMsg({ ok: false, text: `Finalisasi terkunci: masih ada ${remaining} item yang belum ditinjau di daftar tinjau di bawah tabel.` });
      return;
    }
    if (!gateAllowsFinalize) {
      setFinalMsg({ ok: false, text: 'Tidak ada item yang bisa difinalisasi — semua item belum lengkap (tanpa kuantitas/harga).' });
      return;
    }
    setFinalizing(true);
    setFinalMsg(null);
    try {
      const res = await onFinalize(items);
      setFinalMsg({ ok: res.ok, text: res.message });
    } catch (e: any) {
      setFinalMsg({ ok: false, text: e?.message || t('ai.ded.result.err_finalize') });
    } finally {
      setFinalizing(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ ...output, items }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ded-ai-${output.projectName.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportExcel = () => {
    // Preferensi output mengatur kolom & lembar ekspor (USULAN BARU
    // ter-ACC 2026-11-10): volume → kolom Volume; analisis harga → kolom
    // provenans; laporan tak teresolusi → lembar tersendiri; detail RAB
    // nonaktif → ekspor ringkasan saja, bukan baris item.
    const wb = XLSX.utils.book_new();
    if (!prefs.detailRab) {
      const ws = XLSX.utils.json_to_sheet([{
        Proyek: output.projectName,
        'Total Item': items.length,
        'Item Terhitung': calculableCount,
        'Total (Rp)': grandTotal,
        'Item Diblokir': counts.blocked,
        'Item Tanpa Harga': counts['no-price'],
      }]);
      ws['!cols'] = [{ wch: 42 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 13 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Ringkasan');
    } else {
      const rows = withStatus.map(({ it, status }, i) => {
        const row: Record<string, unknown> = {
          'No': i + 1,
          [t('ai.ded.result.th_desc')]: it.name,
          [t('ai.ded.result.x_category')]: it.category,
        };
        if (prefs.volume) row[t('ai.ded.result.th_volume')] = it.quantity ?? '';
        // WD-3.7-08 (Batch 4): satuan diasumsikan ikut teranotasi di kolom
        // satuan ekspor — sebelumnya tampil polos 'm2' seolah dinyatakan.
        row[t('ai.ded.result.th_unit')] = exportUnitLabel(it.units, it.unitUnknown);
        row[t('ai.ded.result.x_unit_price')] = it.unitPrice ?? '';
        row[t('ai.ded.result.x_total')] = it.subtotal ?? '';
        row[t('ai.ded.result.x_status')] = statusMeta[status].label;
        if (prefs.priceAnalysis) {
          row[t('ai.ded.result.x_qty_src')] = it.quantitySource;
          row[t('ai.ded.result.x_formula')] = it.quantityFormula || '';
          row[t('ai.ded.result.x_pages')] = it.sourcePages.join(', ');
        }
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const cols = [{ wch: 5 }, { wch: 42 }, { wch: 18 }];
      if (prefs.volume) cols.push({ wch: 12 });
      cols.push({ wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 18 });
      if (prefs.priceAnalysis) cols.push({ wch: 16 }, { wch: 36 }, { wch: 14 });
      ws['!cols'] = cols;
      XLSX.utils.book_append_sheet(wb, ws, t('ai.ded.result.sheet_name'));
    }
    if (prefs.unresolvedReport) {
      const unresolved = withStatus.filter(({ status }) => status === 'blocked' || status === 'no-price');
      const uRows = unresolved.map(({ it, status }, i) => ({
        'No': i + 1,
        [t('ai.ded.result.th_desc')]: it.name,
        [t('ai.ded.result.x_status')]: statusMeta[status].label,
        Alasan: status === 'blocked' ? t('ai.ded.result.reason_blocked') : t('ai.ded.result.reason_no_price'),
        [t('ai.ded.result.x_pages')]: it.sourcePages.join(', '),
      }));
      const uws = XLSX.utils.json_to_sheet(uRows.length > 0 ? uRows : [{ Keterangan: 'Tidak ada item tak teresolusi.' }]);
      uws['!cols'] = [{ wch: 5 }, { wch: 42 }, { wch: 18 }, { wch: 60 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, uws, 'Item Tak Teresolusi');
    }
    XLSX.writeFile(wb, `ded-ai-${output.projectName.replace(/\s+/g, '-').toLowerCase()}.xlsx`);
  };

  return (
    <div className="dedai dedai-result">
      {topNotice}
      {/* Kepala ramping layar hasil (mockup "DED & Document AI Lebih
          Luas", ACC owner 2026-11-27): satu baris — tombol "← Input"
          (pengganti stepper sebagai jalan pulang; label + handler sama
          persis dengan tombol di bar aksi bawah) + judul + nama proyek
          inline. Subtitle penjelasan disembunyikan CSS (.dedai-result
          .dedai-head p) — fungsinya selesai di layar hasil. Header
          shell SUDAH dihapus (724fc61); ini bukan header baru. */}
      <div className="dedai-head">
        <button type="button" className="dedai-btn ghost dedai-result-back" onClick={onBackToInput}>
          <ArrowLeft size={15} /> {t('ai.ded.result.act_back_input')}
        </button>
        <h1>{t('ai.ded.result.head_a')} <span className="accent">{output.projectName}</span></h1>
        <p>{t('ai.ded.result.head_sub')}</p>
      </div>

      <div className="dedai-steps">
        <div className="dedai-step done"><span className="n">✓</span> {t('ai.ded.input.step_1')}</div>
        <div className="dedai-step-line done" />
        <div className="dedai-step done"><span className="n">✓</span> {t('ai.ded.input.step_2')}</div>
        <div className="dedai-step-line done" />
        <div className="dedai-step active"><span className="n">3</span> {t('ai.ded.input.step_3')}</div>
      </div>

      {/* ---- Ringkasan pemakaian kredit (simulasi) ---- */}
      {creditEstimate && (
        <div className="aic-card" style={{ margin: '0 0 16px' }}>
          <div className="aic-k">{t('ai.ded.result.credit_usage')}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13.5 }}>
              {t('ai.ded.result.credit_cat')}<strong>{creditEstimate.category}</strong>
            </span>
            <strong style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>
              {creditEstimate.credits.toLocaleString('id-ID')} kredit <span className="aic-sim" style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--ez-color-surface-secondary)', border: '1px dashed var(--ez-color-border-line)' }}>{t('ai.ded.input.sim_badge')}</span>
            </strong>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ez-color-text-faint)', marginTop: 4 }}>
            {t('ai.ded.result.credit_note')}
          </div>
        </div>
      )}

      {/* ---- Banner mode kanonis (F3-1: cabang pada resultMode — mode
           kanonis mesin-menang — bukan policy mentah) ---- */}
      {(() => {
        const aiCount = items.filter((it) => it.priceSource === 'AI_ESTIMATE').length;
        const canonCount = items.filter((it) => it.priceSource === 'AHSP_2026').length;
        const reviewCount = items.filter((it) => it.ahspMatch?.status === 'NEEDS_REVIEW').length;
        const incompleteCount = items.filter((it) => it.ahspMatch?.status === 'INCOMPLETE_COMPONENTS').length;
        const excluded = items.length - calculableCount;
        const canonNote = canonCount > 0 ? ` ${canonCount}${t('ai.ded.result.banner_full_canon_a')}` : '';
        const reviewNote = reviewCount > 0 ? ` ${reviewCount}${t('ai.ded.result.banner_full_review_a')}` : '';
        const incompleteNote = incompleteCount > 0 ? ` ${incompleteCount}${t('ai.ded.result.banner_full_incomplete_a')}` : '';
        return resultMode === 'FULL_AI' ? (
          <div className="dedai-notice">
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span><b>Mode: FULL AI MODE.</b> {aiCount}{t('ai.ded.result.banner_full_a')}{canonNote}{reviewNote}{incompleteNote}{t('ai.ded.result.banner_full_b')}{excluded > 0 ? `${t('ai.ded.result.banner_full_excl_a')}${excluded}${t('ai.ded.result.banner_full_excl_b')}` : ''}</span>
          </div>
        ) : (
          <div className="dedai-notice blue">
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span><b>Mode: EZRAB AI MODE.</b>{t('ai.ded.result.banner_ez_a')}{canonCount}{t('ai.ded.result.banner_ez_b')}{aiCount}{t('ai.ded.result.banner_ez_c')}{excluded}{t('ai.ded.result.banner_ez_d')}{reviewNote}{incompleteNote}{t('ai.ded.result.banner_ez_e')}<b>{t('ai.ded.result.banner_ez_partial')}</b>{t('ai.ded.result.banner_ez_f')}</span>
          </div>
        );
      })()}

      {/* ---- Ringkasan: total hero + kartu hitung ---- */}
      <div className="dedai-hero-total">
        <div className="lbl">{t('ai.ded.result.stat_valid_total')}</div>
        <div className="val">{fmtRp(grandTotal)}</div>
        <div className="hint">{calculableCount} {t('ai.ded.result.stat_valid_total_hint_a')} {items.length} {t('ai.ded.result.stat_valid_total_hint_b')}</div>
        {(() => {
          // Total usulan AI dihitung LANGSUNG dari item saat ini (bukan dari
          // prop output.totalDiscrepancyNote yang bisa basi sesudah edit —
          // edit membersihkan usulan item, sehingga catatan ini hilang
          // dengan sendirinya bila dasarnya berubah).
          const proposed = items
            .map((it) => it.aiProposedSubtotal)
            .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
            .reduce((a, b) => a + b, 0);
          if (proposed <= 0 || Math.round(proposed) === Math.round(grandTotal)) return null;
          const hasCanon = items.some((it) => it.priceSource === 'AHSP_2026' && it.aiProposedSubtotal != null);
          return (
            <div className="hint">
              {t('ai.ded.result.proposed_a')}{fmtRp(proposed)}{t('ai.ded.result.proposed_b')}
              {hasCanon ? ' Selisih dapat mencerminkan substitusi harga kanonis atas estimasi AI.' : ' Selisih ini adalah perbedaan hitung AI.'}
            </div>
          );
        })()}
        {prefs.volume && volumeByUnit.length > 0 && (
          <div className="vol">
            <Info size={13} style={{ verticalAlign: -2 }} /> {t('ai.ded.result.vol_per_unit')}{' '}
            {volumeByUnit.map(([u, v]) => <b key={u}>{fmtQty(v)} {u}</b>).reduce((a, b) => <>{a} · {b}</>)}
          </div>
        )}
      </div>
      <div className="dedai-stats">
        <div className="dedai-stat">
          <div className="lbl">{t('ai.ded.result.stat_valid')}</div>
          <div className="val green">{counts.valid}</div>
          <div className="hint">{t('ai.ded.result.stat_valid_hint')}</div>
        </div>
        <div className="dedai-stat">
          <div className="lbl">{t('ai.ded.result.badge_review')}</div>
          <div className="val amber">{counts.review}</div>
          <div className="hint">{t('ai.ded.result.stat_review_hint')}</div>
        </div>
        <div className="dedai-stat">
          <div className="lbl">{t('ai.ded.result.stat_blocked')}</div>
          <div className="val red">{counts.blocked}</div>
          <div className="hint">{t('ai.ded.result.stat_blocked_hint')}</div>
        </div>
        <div className="dedai-stat">
          <div className="lbl">{t('ai.ded.result.stat_no_price')}</div>
          <div className="val slate">{counts['no-price']}</div>
          <div className="hint">{t('ai.ded.result.stat_no_price_hint')}</div>
        </div>
        <div className="dedai-stat">
          <div className="lbl">{t('ai.ded.result.stat_total')}</div>
          <div className="val slate">{items.length}</div>
          <div className="hint">{output.pageCount} {t('ai.ded.result.stat_total_hint_a')}</div>
        </div>
      </div>
      {/* ---- Phase C: panel audit self-review (tampil saja) ----
          Per-question LOLOS/GAGAL/BELUM DINILAI + metrics. Audit hasil
          analisis dipakai apa adanya; hasil lama dihitung ulang dari
          item saat ini (diberi label). Tidak memengaruhi
          savable/finalisasi — hanya anotasi. */}
      <div className="aic-card" style={{ margin: '0 0 16px' }}>
        <button
          type="button"
          onClick={() => setShowAudit(!showAudit)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', justifyContent: 'space-between', padding: 0,
            border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13.5, fontWeight: 700, color: 'var(--ez-color-text)',
          }}
        >
          <span>
            Audit Self-Review (DED) — {selfReviewAudit.audit.passedCount} lolos · {selfReviewAudit.audit.failedCount} gagal · {selfReviewAudit.audit.notEvaluatedCount} belum dinilai
            {selfReviewAudit.audit.cleanPass ? ' · Lolos bersih' : ''}
            {selfReviewAudit.recomputed ? ' · dihitung ulang dari item saat ini' : ''}
          </span>
          <span style={{ fontSize: 18 }}>{showAudit ? '▾' : '▸'}</span>
        </button>
        {showAudit && (
          <div style={{ marginTop: 8 }}>
            {selfReviewAudit.audit.questions.map((qq) => (
              <div key={qq.number} style={{ display: 'flex', gap: 8, padding: '6px 0', borderTop: '1px solid var(--ez-color-surface-tertiary)', fontSize: 12.5 }}>
                <span style={{ fontWeight: 700, minWidth: 22 }}>{qq.number}.</span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700 }}>{qq.question}</span>
                  <span style={{ display: 'block', color: 'var(--ez-color-text-faint)', marginTop: 2 }}>{qq.reason}</span>
                </span>
                <span style={{
                  fontWeight: 700, whiteSpace: 'nowrap',
                  color: qq.verdict === 'PASS' ? 'var(--ez-color-success)' : qq.verdict === 'FAIL' ? 'var(--ez-color-danger-strong)' : 'var(--ez-hue-amber-text-deep)',
                }}>
                  {qq.verdict === 'PASS' ? t('ai.ded.result.qq_pass') : qq.verdict === 'FAIL' ? t('ai.ded.result.qq_fail') : t('ai.ded.result.qq_pending')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* ---- FASE P0: Cakupan 12 Divisi & Jejak Analisis ---- */}
      {output.divisionCoverage && output.divisionCoverage.length > 0 && (
        <div className="aic-card" style={{ margin: '0 0 16px' }}>
          <div className="aic-k">{t('ai.ded.result.div_title')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8, marginTop: 8 }}>
            {output.divisionCoverage.map((d) => (
              <div key={d.divisionCode} style={{ border: '1px solid var(--ez-color-border-line)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                  {d.order}. {d.divisionName}
                </div>
                <div style={{ fontSize: 11.5, marginTop: 2, fontWeight: 700, color:
                  d.status === 'IDENTIFIED' ? 'var(--ez-color-success)'
                  : d.status === 'ASSUMPTION_REQUIRES_CONFIRMATION' ? 'var(--ez-hue-amber-text-deep)'
                  : d.status === 'NOT_APPLICABLE' ? 'var(--ez-color-text-faint)' : 'var(--ez-color-danger-strong)' }}>
                  {d.status === 'IDENTIFIED' ? t('ai.ded.result.div_identified')
                    : d.status === 'ASSUMPTION_REQUIRES_CONFIRMATION' ? t('ai.ded.result.div_assumption')
                    : d.status === 'NOT_APPLICABLE' ? t('ai.ded.result.div_na') : t('ai.ded.result.div_insufficient')}
                  {d.itemCount > 0 ? ` · ${d.itemCount} item` : ''}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ez-color-text-faint)', marginTop: 2 }}>{d.note}</div>
                {d.assumptionCandidates.length > 0 && (
                  <div style={{ fontSize: 11.5, color: 'var(--ez-color-text-faint)', marginTop: 4 }}>
                    {t('ai.ded.result.div_candidates_a')}{d.assumptionCandidates.map((c) => c.name).join('; ')}
                  </div>
                )}
              </div>
            ))}
          </div>
          {output.analysisTrace && (
            <div style={{ fontSize: 12, color: 'var(--ez-color-text-faint)', marginTop: 10 }}>
              {t('ai.ded.result.trace_a')}{output.analysisTrace.selectedPageCount}{t('ai.ded.result.trace_b')}{output.analysisTrace.totalPages}{t('ai.ded.result.trace_c')}
              {output.analysisTrace.totalCharsSent.toLocaleString('id-ID')}{t('ai.ded.result.trace_d')}{output.analysisTrace.passes.length}{t('ai.ded.result.trace_e')}
              {output.analysisTrace.skippedPageCount > 0 && (
                <>{t('ai.ded.result.trace_skip_a')}{output.analysisTrace.pages.filter((p) => p.status === 'SKIPPED_BUDGET').map((p) => `${t('ai.ded.result.trace_page')}${p.page} (${p.pageType}${p.sourceFile ? `, ${p.sourceFile}` : ''})`).join(', ')}{t('ai.ded.result.trace_skip_b')}</>
              )}
              {output.analysisTrace.pages.some((p) => p.status === 'NO_TEXT') && (
                <>{t('ai.ded.result.trace_notext_a')}{output.analysisTrace.pages.filter((p) => p.status === 'NO_TEXT').map((p) => `${t('ai.ded.result.trace_page')}${p.page}${p.sourceFile ? ` (${p.sourceFile})` : ''}`).join(', ')}{t('ai.ded.result.trace_notext_b')}</>
              )}
              {output.analysisTrace.warnings.map((w, i) => (
                <div key={i} style={{ color: 'var(--ez-hue-amber-text-deep)', marginTop: 3 }}>⚠ {w}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- WBS Kelompok Pekerjaan ---- */}
      <div style={{ margin: '0 0 16px' }}>
        <button
          className="dedai-wbs-toggle"
          onClick={() => setShowWbs(!showWbs)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderRadius: 8,
            border: '1px solid var(--ez-color-border-line)', background: showWbs ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
            color: 'var(--ez-hue-blue-text-deep)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
            width: '100%', justifyContent: 'space-between',
          }}
        >
          <span>{t('ai.ded.result.wbs_title_a')}{wbsData.groups.length}{t('ai.ded.result.wbs_title_b')}</span>
          <span style={{ fontSize: 18 }}>{showWbs ? '▾' : '▸'}</span>
        </button>

        {showWbs && (
          <div style={{ marginTop: 8, border: '1px solid var(--ez-color-border-line)', borderRadius: 8, overflow: 'hidden' }}>
            {wbsData.groups.map((g) => {
              const isOpen = wbsExpanded.has(g.node.code);
              // WD-3.7-08 (Batch 4): kelompok yang memuat item bersatuan
              // diasumsikan menandainya di baris ringkasan — bukan hanya di
              // tabel utama. Advisory: tidak mengubah issueCount/total.
              const unknownCount = countUnitUnknown(g.items);
              return (
                <div key={g.node.code} style={{ borderBottom: '1px solid var(--ez-color-surface-tertiary)' }}>
                  <button
                    className="dedai-wbs-group"
                    onClick={() => {
                      const next = new Set(wbsExpanded);
                      if (isOpen) next.delete(g.node.code);
                      else next.add(g.node.code);
                      setWbsExpanded(next);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '10px 14px', background: isOpen ? 'var(--ez-color-surface-secondary)' : 'var(--ez-color-surface)',
                      border: 'none', cursor: 'pointer', fontSize: 13.5,
                    }}
                  >
                    <span className="dedai-wbs-group-main" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--ez-color-text-muted)' }}>{isOpen ? '▾' : '▸'}</span>
                      <code style={{ fontSize: 11.5, background: 'var(--ez-color-surface-tertiary)', padding: '2px 6px', borderRadius: 4, color: 'var(--ez-color-text-slate)' }}>
                        {g.node.code}
                      </code>
                      <b style={{ color: 'var(--ez-color-text-primary)' }}>{g.node.name}</b>
                      <span style={{ fontSize: 12, color: 'var(--ez-color-text-muted)' }}>({g.itemCount} {t('ai.ded.input.items_word')})</span>
                      {g.issueCount > 0 && (
                        <span style={{ fontSize: 11, background: 'var(--ez-hue-amber-bg-deep)', color: 'var(--ez-hue-amber-text-dark)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                          {g.issueCount} {t('ai.ded.result.wbs_issues')}
                        </span>
                      )}
                      {unknownCount > 0 && (
                        <span title={t('ai.ded.result.wbs_assumed_title')} style={{ fontSize: 11, background: 'var(--ez-hue-amber-bg-deep)', color: 'var(--ez-hue-amber-text-dark)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                          {unknownCount} {t('ai.ded.result.wbs_assumed_units')}
                        </span>
                      )}
                    </span>
                    <b className="dedai-wbs-group-total" style={{ color: 'var(--ez-color-primary-hover)', fontSize: 13.5 }}>{fmtRp(g.subtotal)}</b>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '4px 14px 10px 38px', background: 'var(--ez-color-surface-secondary)' }}>
                      {g.items.map((it) => (
                        <div key={it.id} className="dedai-wbs-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--ez-color-surface-tertiary)', fontSize: 13 }}>
                          <span className="dedai-wbs-item-name" style={{ color: 'var(--ez-color-text-body)' }}>
                            {it.name}
                            <span style={{ color: 'var(--ez-color-text-faint)', fontSize: 11.5, marginLeft: 6 }}>
                              {it.quantity != null ? `${fmtQty(it.quantity)} ${it.units}` : '—'}
                            </span>
                            {/* WD-3.7-08 (Batch 4): badge satuan-diasumsikan di
                                baris item WBS — cermin badge tabel utama. */}
                            {it.unitUnknown && (
                              <span
                                title="Satuan tidak tercantum di DED/model — m² diasumsikan oleh sistem, bukan dinyatakan. Verifikasi satuan sebelum finalisasi."
                                style={{ display: 'inline-block', marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: 'var(--ez-hue-amber-bg-deep)', color: 'var(--ez-hue-amber-text-dark)', whiteSpace: 'nowrap' }}
                              >
                                satuan diasumsikan
                              </span>
                            )}
                          </span>
                          <span className="dedai-wbs-item-price" style={{ color: it.subtotal != null ? 'var(--ez-color-text-primary)' : 'var(--ez-color-text-faint)', fontWeight: 600 }}>
                            {fmtRp(it.subtotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {wbsData.unclassified.length > 0 && (
              <div style={{ padding: '10px 14px', background: 'var(--ez-hue-amber-bg)', fontSize: 12.5, color: 'var(--ez-hue-amber-text-dark)' }}>
                ⚠️ {wbsData.unclassified.length} item tidak terkategorisasi — periksa manual.
              </div>
            )}
            <div style={{ padding: '8px 14px', background: 'var(--ez-color-surface-secondary)', fontSize: 11.5, color: 'var(--ez-color-text-muted)' }}>
              Katalog WBS adalah referensi. Hanya kelompok dengan item aktual yang ditampilkan.
              Kelompok kosong tidak masuk total.
            </div>
          </div>
        )}
      </div>


      {/* ---- Panel penyelesaian AI (mode FULL_AI) ---- */}
      {policy === 'FULL_AI' && (gapCount > 0 || completionReport) && (
        <div className="aic-card" style={{ margin: '0 0 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div className="aic-k">{t('ai.ded.result.completion_title')}</div>
              <div style={{ fontSize: 12, color: 'var(--ez-color-text-faint)', marginTop: 2 }}>
                {t('ai.ded.result.completion_sub')}
              </div>
            </div>
            {gapCount > 0 && (
              <button className="dedai-btn primary" onClick={runBatchCompletion}>
                <Sparkles size={15} /> {t('ai.ded.result.completion_run_a')}{gapCount}{t('ai.ded.result.completion_run_b')}
              </button>
            )}
          </div>
          {completionReport && (
            <div style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.7 }}>
              {t('ai.ded.result.comp_rep_a')}<b>{completionReport.scanned}</b>{t('ai.ded.result.comp_rep_b')}<b>{completionReport.filledMarketReference}</b>
              {t('ai.ded.result.comp_rep_c')}<b>{completionReport.filledAiEstimate}</b>{t('ai.ded.result.comp_rep_d')}<b>{completionReport.quantityFilled}</b>
              {t('ai.ded.result.comp_rep_e')}<b>{completionReport.officialPreserved}</b>{t('ai.ded.result.comp_rep_f')}<b>{completionReport.existingKept}</b>
              {t('ai.ded.result.comp_rep_g')}<b>{completionReport.needsQuantity}</b>{t('ai.ded.result.comp_rep_h')}<b>{completionReport.unresolved}</b>
              {completionReport.failures > 0 ? <>{t('ai.ded.result.comp_rep_i')}<b>{completionReport.failures}</b>{t('ai.ded.result.comp_rep_j')}</> : null}
            </div>
          )}
        </div>
      )}

      {/* ---- I7b: split-view tinjau visual (konsep ter-ACC owner
          2026-10-07): gambar DED di KIRI, panel hasil di KANAN — satu
          layar, bukan wizard. Header/ringkasan di atas tetap selebar
          penuh; yang terbagi hanya wilayah hasil (filter + tabel +
          laporan + gerbang). Di layar ≤768px, data-dedvr-view pada
          wrapper mengendalikan pane mana yang tampil (default: hasil);
          tombol toggle di bawah hanya tampil di layar kecil. ---- */}
      <div className="dedvr-mobile-toggle" role="group" aria-label={t('ai.ded.result.view_aria')}>
        <button
          type="button"
          className={`dedvr-mobile-toggle-btn${mobileView === 'drawing' ? ' active' : ''}`}
          onClick={() => setMobileView('drawing')}
          aria-pressed={mobileView === 'drawing'}
        >
          {t('ai.ded.result.view_drawing')}
        </button>
        <button
          type="button"
          className={`dedvr-mobile-toggle-btn${mobileView === 'results' ? ' active' : ''}`}
          onClick={() => setMobileView('results')}
          aria-pressed={mobileView === 'results'}
        >
          {t('ai.ded.result.view_results')}
        </button>
      </div>
      <div className="dedvr-split" data-dedvr-view={mobileView}>
        <div className="dedvr-split-viewer">
          <DedVisionReviewViewer
            pageImages={pageImages ?? []}
            items={reviewState.items}
            selectedItemId={selectedReviewId}
            onSelectItem={handleViewerSelect}
            focusTarget={focusTarget}
            totalPages={output.pageCount}
            pageTitles={pageTitles}
          />
        </div>
        <div className="dedvr-split-results">
      {/* ---- Detail RAB: filter + isi cepat + tabel (digerbang preferensi
          output "Detail RAB" — USULAN BARU ter-ACC 2026-11-10) ---- */}
      {prefs.detailRab && (<>
      {/* ---- Filter ---- */}
      <div className="dedai-filters">
        {filters.map((f) => (
          <button
            key={f.id}
            className={`dedai-chip ${filter === f.id ? 'active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}{f.id !== 'all' && ` (${counts[f.id as ItemStatus]})`}
          </button>
        ))}
      </div>

      {/* ---- Legenda bukti kuantitas (mockup v2.3 §1) — klik baris untuk
          melihat dasar mentahnya di detail "Dasar kuantitas". ---- */}
      <div className="dedai-qlegend" aria-label={t('ai.ded.result.qlegend_aria')}>
        <span className="dedai-qlegend-title">{t('ai.ded.result.qlegend_title')}</span>
        {QUANTITY_EVIDENCE_LEGEND.map((chip) => (
          <span key={chip.kind} className={`dedai-qchip ${chip.className}`} title={t('ai.ded.result.qev_hint_' + chip.kind.replace('-', '_'))}>{t('ai.ded.result.qev_' + chip.kind.replace('-', '_'))}</span>
        ))}
        <span className="dedai-qlegend-note">{t('ai.ded.result.qlegend_note')}</span>
      </div>

      {/* ---- Tombol Isi Cepat untuk item tanpa kuantitas ---- */}
      {counts.blocked > 0 && (
        <div style={{ margin: '0 0 16px', padding: '12px 16px', background: 'var(--ez-color-warning-soft)', border: '1px solid var(--ez-color-warning-soft)', borderRadius: 'var(--ez-radius-card)' }}>
          <div style={{ fontSize: 13.5, color: 'var(--ez-color-warning)', marginBottom: 8 }}>
            <b>{counts.blocked} {t('ai.ded.result.bulk_text_a')}</b> {t('ai.ded.result.bulk_text_b')}
          </div>
          {/* Latar amber-700 tetap (bukan token warning): token menjadi
              amber-400 di mode gelap sehingga teks putih tak terbaca. */}
          <button
            className="dedai-bulk-btn"
            onClick={() => setBulkFill(true)}
            style={{ padding: '8px 16px', background: '#B45309', color: '#fff', border: 'none', borderRadius: 'var(--ez-radius-control)', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Pencil size={14} /> {t('ai.ded.result.bulk_btn')} {counts.blocked} {t('ai.ded.result.bulk_item_suffix')}
          </button>
        </div>
      )}

      {/* ---- Modal Isi Cepat ---- */}
      {bulkFill && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--ez-color-surface)', borderRadius: 'var(--ez-radius-card)', maxWidth: 600, width: '100%', maxHeight: '80vh', overflow: 'auto', padding: 24 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>{t('ai.ded.result.modal_title')}</h3>
            <p style={{ fontSize: 12.5, color: 'var(--ez-color-text-muted)', margin: '0 0 16px' }}>
              {t('ai.ded.result.modal_sub')}
            </p>
            {withStatus.filter(({ status }) => status === 'blocked').map(({ it }) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--ez-color-surface-secondary)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{it.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ez-color-text-muted)', overflowWrap: 'anywhere' }}>{it.quantityFormula || t('ai.ded.result.modal_no_qty')}</div>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  className="dedai-modal-input"
                  value={bulkVals[it.id] || ''}
                  onChange={(e) => setBulkVals({ ...bulkVals, [it.id]: e.target.value })}
                  style={{ width: 100, padding: '8px 12px', border: '1px solid var(--ez-color-border)', borderRadius: 'var(--ez-radius-control)', textAlign: 'right' }}
                />
                <span style={{ fontSize: 13, color: 'var(--ez-color-text-muted)', width: 40 }}>{it.units}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 12, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                className="dedai-modal-btn"
                onClick={() => { setBulkFill(false); setBulkVals({}); }}
                style={{ padding: '8px 16px', background: 'var(--ez-color-surface-secondary)', border: 'none', borderRadius: 'var(--ez-radius-control)', cursor: 'pointer', fontSize: 13.5 }}
              >
                {t('ai.ded.result.modal_batal')}
              </button>
              <button
                className="dedai-modal-btn"
                onClick={commitBulkFill}
                style={{ padding: '8px 16px', background: 'var(--ez-color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--ez-radius-control)', cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}
              >
                {t('ai.ded.result.modal_save_all')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Tabel ---- */}
      <div className="dedai-table-wrap">
        <table className="dedai-table">
          <thead>
            <tr>
              <th>No</th><th>{t('ai.ded.result.th_desc')}</th><th>{t('ai.ded.result.th_volume')}</th><th>{t('ai.ded.result.qlegend_title')}</th><th>{t('ai.ded.result.th_unit')}</th>
              <th className="dedai-col-unitprice">{t('ai.ded.result.th_unit_price')}</th><th>{t('ai.ded.result.th_total')}</th><th>{t('ai.ded.result.th_status')}</th><th>{t('ai.ded.result.th_action')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ it, status }, i) => {
              const isEditing = editing === it.id;
              const isOpen = expanded === it.id;
              // W6 (§8): chip provenance harga — estimasi AI (kuning)
              // dibedakan visual dari AHSP kanonis (hijau) & input user
              // (ungu) pada baris yang masih tertutup sekalipun.
              const provBadge = provenanceBadgeForDedSource(it.priceSource);
              // Chip bukti KUANTITAS (mockup v2.3 §1) — taksonomi dari
              // dedReviewGate.ts; terpisah dari chip provenans HARGA.
              const qtyChip = quantityEvidenceChipFor(it.quantitySource);
              // I7b: status tinjau visual item ini (badge di sel status +
              // blok detail). Selalu ada untuk item live (adapter 1:1).
              const reviewItem = reviewByLiveId.get(it.id);
              const needsAhsp = it.ahspMatch?.status === 'NEEDS_REVIEW' && it.ahspMatch.candidates.length > 0;
              // Phase B: hasil gate validasi RAB item ini (advisory).
              const vGate = validationGateById.get(it.id);
              return (
                <React.Fragment key={it.id}>
                  <tr
                    id={`dedai-row-${it.id}`}
                    className={`dedai-row-clickable${selectedReviewId === reviewIdForDedAiItem(it.id) ? ' dedvr-row-selected' : ''}`}
                    onClick={() => { if (!isEditing) { setExpanded(isOpen ? null : it.id); selectReviewItemAndJump(it.id); } }}
                  >
                    <td className="dedai-num">{i + 1}</td>
                    <td style={{ minWidth: 200 }}>
                      {isEditing ? (
                        <input className="dedai-edit-input name" value={editVals.name} onChange={(e) => setEditVals({ ...editVals, name: e.target.value })} />
                      ) : (
                        <><b>{it.name}</b><br /><span style={{ fontSize: 11.5, color: 'var(--ez-color-text-muted)' }}>{it.category}</span></>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input className="dedai-edit-input" value={editVals.quantity} onChange={(e) => setEditVals({ ...editVals, quantity: e.target.value })} placeholder="—" inputMode="decimal" />
                      ) : (
                        <span className="dedai-num">{fmtQty(it.quantity)}</span>
                      )}
                    </td>
                    <td>
                      <span className={`dedai-qchip ${qtyChip.className}`} title={t('ai.ded.result.qev_hint_' + qtyChip.kind.replace('-', '_'))}>{t('ai.ded.result.qev_' + qtyChip.kind.replace('-', '_'))}</span>
                      </td>
                    <td>
                      {isEditing ? (
                        <input className="dedai-edit-input" style={{ width: 64 }} value={editVals.units} onChange={(e) => setEditVals({ ...editVals, units: e.target.value })} />
                      ) : (
                        <>
                          {it.units}
                          {/* WD-3.7-08: satuan diasumsikan m² — jangan tampil seolah dinyatakan model/DED. */}
                          {it.unitUnknown && (
                            <span
                              title={t('ai.ded.result.wbs_assumed_title')}
                              style={{ display: 'inline-block', marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: 'var(--ez-hue-amber-bg-deep)', color: 'var(--ez-hue-amber-text-dark)', whiteSpace: 'nowrap' }}
                            >
                              {t('ai.ded.result.wbs_assumed_units')}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="dedai-col-unitprice"><span className="dedai-num">{fmtRp(it.unitPrice)}</span></td>
                    <td><span className="dedai-num">{fmtRp(it.subtotal)}</span></td>
                    <td>
                      <span className={`dedai-badge ${status}`}>{statusMeta[status].icon}{statusMeta[status].label}</span>
                      <br />
                      <span
                        title={provenanceExplanationForDedSource(it.priceSource)}
                        style={{ display: 'inline-block', marginTop: 4, fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: provBadge.bg, color: provBadge.fg }}
                      >
                        {provBadge.text}
                      </span>
                      {needsAhsp && (
                        <>
                          <br />
                          <span className="dedai-qchip dedai-qchip-confirm" title={t('ai.ded.result.need_ahsp_title')}>{t('ai.ded.result.need_ahsp')}</span>
                        </>
                      )}
                      {/* I7b: badge status tinjau visual (taksonomi 6-state,
                          spec §10) — detail lengkapnya di blok tinjau. */}
                      {reviewItem && (
                        <>
                          <br />
                          <span
                            className={`dedvr-status dedvr-status--${reviewItem.status.toLowerCase().replace(/_/g, '-')}`}
                            title={t('ai.ded.result.review_status_title')}
                            style={{ marginTop: 4 }}
                          >
                            {t('ai.ded.result.rv_' + reviewItem.status.toLowerCase())}
                          </span>
                        </>
                      )}
                      {/* Phase B: chip gate validasi RAB (advisory — tampil
                          saja): gate mana yang gagal + alasannya (tooltip).
                          BLOCKING = amber klaim, asumsi berlabel = oranye,
                          WARNING saja = amber garis putus. Item bersih
                          tanpa asumsi tidak menampilkan chip. */}
                      {vGate && (vGate.blockingFailures.length > 0 || vGate.warningFailures.length > 0 || vGate.assumptionLabeled) && (
                        <>
                          <br />
                          <span
                            className={`dedai-qchip ${vGate.blockingFailures.length > 0 ? 'dedai-qchip-claim' : vGate.assumptionLabeled ? 'dedai-qchip-assumption' : 'dedai-qchip-confirm'}`}
                            title={[
                              ...(vGate.blockingFailures.length > 0 ? [`BLOCKING — ${blockingSummary(vGate)}`] : []),
                              ...(vGate.warningFailures.length > 0 ? [`${t('ai.ded.result.gate_review_a')}${vGate.warningFailures.map((g) => `Gate ${g.gate} (${g.name}): ${g.reason}`).join(' | ')}`] : []),
                              ...(vGate.assumptionLabeled ? [vGate.assumptionNote ?? t('ai.ded.result.gate_assump_note')] : []),
                            ].join('\n')}
                          >
                            {vGate.blockingFailures.length > 0
                              ? `${t('ai.ded.result.gate_blocking_a')}${vGate.blockingFailures.map((g) => g.gate).join(', ')}${t('ai.ded.result.gate_blocking_b')}`
                              : vGate.assumptionLabeled
                                ? t('ai.ded.result.gate_assump')
                                : `${t('ai.ded.result.gate_warn_a')}${vGate.warningFailures.map((g) => g.gate).join(', ')}${t('ai.ded.result.gate_warn_b')}`}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      <div className="dedai-row-actions" onClick={(e) => e.stopPropagation()}>
                        {isEditing ? (
                          <>
                            <button className="dedai-icon-btn" onClick={() => commitEdit(it.id)} title={t('ai.ded.result.title_simpan')}><Check size={14} color="var(--ez-color-success)" /></button>
                            <button className="dedai-icon-btn" onClick={cancelEdit} title={t('ai.ded.result.title_batal')}><X size={14} /></button>
                          </>
                        ) : (
                          <>
                            <button className="dedai-icon-btn" onClick={() => startEdit(it)} title={t('ai.ded.result.detail_edit')}><Pencil size={14} /></button>
                            <button className="dedai-icon-btn" onClick={() => setExpanded(isOpen ? null : it.id)} title={t('ai.ded.result.detail_aksi')}>
                              {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="detail-row">
                      <td colSpan={9}>
                        <div className="dedai-detail">
                          {/* ---- Dasar kuantitas (mockup v2.3 §1): dasar
                              MENTAH apa adanya — dimensi, rumus, jejak
                              derivasi, catatan, bukti teks + halaman
                              sumber bila tersimpan per item. TIDAK ADA
                              klaim "terverifikasi" di sini; yang kosong
                              tampil sebagai tidak tersedia, bukan dikarang. ---- */}
                          <div className="dedai-evidence">
                            <div className="dedai-evidence-head">
                              {t('ai.ded.result.detail_basis')}
                              <span className={`dedai-qchip ${qtyChip.className}`} title={t('ai.ded.result.qev_hint_' + qtyChip.kind.replace('-', '_'))}>{t('ai.ded.result.qev_' + qtyChip.kind.replace('-', '_'))}</span>
                            </div>
                            {it.rawDimensions && <div className="dl-row"><span className="dl-k">{t('ai.ded.result.ev_dim')}</span><span>{it.rawDimensions}</span></div>}
                            {it.quantityFormula && <div className="dl-row"><span className="dl-k">{t('ai.ded.result.ev_formula')}</span><span>{it.quantityFormula}</span></div>}
                            {it.derivation && (
                              <div className="dl-row"><span className="dl-k">{t('ai.ded.result.ev_trace')}</span><span>
                                {it.derivation.formulaType}
                                {it.derivation.inputs.length > 0 && (
                                  <> — {it.derivation.inputs.map((inp) => `${inp.name} ${inp.value} ${inp.unit} (${inp.source})`).join(' · ')}</>
                                )}
                                {it.derivation.result != null && (
                                  <>{t('ai.ded.result.ev_result_a')}{fmtQty(it.derivation.result)} {it.derivation.resultUnit}</>
                                )}
                                {t('ai.ded.result.ev_valid')}{it.derivation.validationStatus}
                                {it.derivation.notes && (<><br />{it.derivation.notes}</>)}
                              </span></div>
                            )}
                            {it.quantityNote && <div className="dl-row"><span className="dl-k">{t('ai.ded.result.ev_note')}</span><span>{it.quantityNote}</span></div>}
                            {it.sourceEvidence && <div className="dl-row"><span className="dl-k">{t('ai.ded.result.ev_text')}</span><span>{it.sourceEvidence}</span></div>}
                            <div className="dl-row"><span className="dl-k">{t('ai.ded.result.ev_pages')}</span><span>{it.sourcePages.length ? it.sourcePages.map((p) => `${t('ai.ded.result.page_abbr')}${p}${t('ai.ded.result.page_abbr_suffix')}`).join(', ') : t('ai.ded.result.ev_no_pages')}</span></div>
                            {!it.rawDimensions && !it.quantityFormula && !it.derivation && !it.quantityNote && !it.sourceEvidence && (
                              <div className="dl-row"><span className="dl-k">{t('ai.ded.result.ev_remark')}</span><span>{t('ai.ded.result.ev_none')}</span></div>
                            )}
                            {/* ---- Phase B: rincian gate validasi RAB (advisory) ----
                                Gate yang gagal + alasannya; asumsi berlabel
                                (FULL_AI tanpa AHSP) dinyatakan eksplisit.
                                Bukan penghalang finalisasi — hanya anotasi. */}
                            {vGate && (
                              <div className="dedai-evidence">
                                <div className="dedai-evidence-head">{t('ai.ded.result.gate_title')}</div>
                                {vGate.gates.filter((g) => g.status === 'FAIL').map((g) => (
                                  <div className="dl-row" key={g.gate}><span className="dl-k">Gate {g.gate} · {g.name}</span><span>{g.reason}</span></div>
                                ))}
                                {vGate.assumptionLabeled && (
                                  <div className="dl-row"><span className="dl-k">{t('ai.ded.result.gate_assump_label')}</span><span>{vGate.assumptionNote}</span></div>
                                )}
                                {vGate.gates.every((g) => g.status !== 'FAIL') && !vGate.assumptionLabeled && (
                                  <div className="dl-row"><span className="dl-k">{t('ai.ded.result.ev_remark')}</span><span>{t('ai.ded.result.gate_none')}</span></div>
                                )}
                              </div>
                            )}
                            {/* ---- I7b: blok tinjau visual (spec §10) ----
                                Interpretasi + keyakinan + status 6-state +
                                koreksi nilai + log asumsi + konfirmasi /
                                penolakan. Dimensi mentah & rumus di atas
                                adalah dasar yang sama (blok ini tidak
                                menggantikannya — hanya menambahkan tinjau). */}
                            {(() => {
                              const ri = reviewItem;
                              if (!ri) return null;
                              const confColor = confidenceToColor(ri.confidence);
                              const confPct = Math.round(clampConfidence(ri.confidence) * 100);
                              const isRejecting = rejectingId === it.id;
                              const isRejected = ri.status === 'NOT_DETECTED';
                              return (
                                <div className="dedvr-review-block">
                                  <div className="dedvr-review-head">
                                    <span className="dedvr-review-title">{t('ai.ded.result.review_title')}</span>
                                    <span className={`dedvr-status dedvr-status--${ri.status.toLowerCase().replace(/_/g, '-')}`}>{t('ai.ded.result.rv_' + ri.status.toLowerCase())}</span>
                                    <span
                                      className={`dedvr-confidence dedvr-confidence--${confColor}`}
                                      title={t('ai.ded.result.conf_title')}
                                    >
                                      {t('ai.ded.result.conf_a')}{confPct}%
                                    </span>
                                    {ri.page !== null && (
                                      <button type="button" className="dedvr-jump-btn" onClick={() => selectReviewItemAndJump(it.id)}>
                                        <Eye size={13} /> {t('ai.ded.result.view_in_image_a')}{ri.page}{t('ai.ded.result.view_in_image_b')}
                                      </button>
                                    )}
                                  </div>
                                  <div className="dl-row"><span className="dl-k">{t('ai.ded.result.review_interp')}</span><span>
                                    {ri.interpretation.value !== null
                                      ? <><b>{fmtQty(ri.interpretation.value)} {ri.interpretation.unit}</b> · {ri.interpretation.detail}</>
                                      : <>{t('ai.ded.result.review_no_value')}{ri.interpretation.detail}</>}
                                    {ri.originalText ? <> {t('ai.ded.result.review_from_a')}{ri.originalText}{t('ai.ded.result.review_from_b')}</> : null}
                                  </span></div>
                                  {ri.correctedFrom && (
                                    <div className="dl-row"><span className="dl-k">{t('ai.ded.result.review_last_fix')}</span><span>{ri.correctedFrom.note}</span></div>
                                  )}
                                  {ri.rejectionReason && (
                                    <div className="dl-row"><span className="dl-k">{t('ai.ded.result.review_reject_reason')}</span><span>{ri.rejectionReason}</span></div>
                                  )}
                                  {ri.notes.length > 0 && (
                                    <div className="dl-row"><span className="dl-k">{t('ai.ded.result.review_notes')}</span><span>{ri.notes.join(' · ')}</span></div>
                                  )}
                                  {/* Koreksi nilai (pola .edit-row prototipe):
                                      koreksi langsung oleh pengguna; rumus
                                      lama disimpan sebagai "rumus asal". */}
                                  <div className="dedvr-edit-row">
                                    <span className="dedvr-edit-label">{t('ai.ded.result.correct_value')}</span>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      className="dedvr-edit-input"
                                      placeholder={ri.interpretation.value !== null ? String(ri.interpretation.value) : '—'}
                                      value={correctVals[it.id] ?? ''}
                                      onChange={(e) => setCorrectVals({ ...correctVals, [it.id]: e.target.value })}
                                      disabled={isRejected}
                                    />
                                    <span className="dedvr-edit-unit">{ri.interpretation.unit}</span>
                                    <button type="button" className="dedvr-btn-primary" disabled={isRejected} onClick={() => handleReviewCorrect(it.id)}>{t('ai.ded.result.apply_btn')}</button>
                                    <label className="dedvr-edit-check">
                                      <input
                                        type="checkbox"
                                        checked={!!correctConfirm[it.id]}
                                        onChange={(e) => setCorrectConfirm({ ...correctConfirm, [it.id]: e.target.checked })}
                                        disabled={isRejected}
                                      />
                                      {t('ai.ded.result.confirm_too')}
                                    </label>
                                  </div>
                                  <div className="dedvr-edit-note">{t('ai.ded.result.formula_note')}</div>
                                  {/* Koreksi per input: TIDAK tersedia untuk
                                      item live (tanpa recomputeKind — input
                                      memakai satuan asli, bukan mm; paksa
                                      recompute akan salah baca satuan).
                                      Ditampilkan nonaktif + penjelasan,
                                      bukan disembunyikan. */}
                                  <div className="dedvr-edit-row dedvr-edit-row--disabled" title={t('ai.ded.result.correct_input_title')}>
                                    <span className="dedvr-edit-label">{t('ai.ded.result.correct_input')}</span>
                                    <input type="text" className="dedvr-edit-input" disabled placeholder="—" />
                                    <button type="button" className="dedvr-btn-primary" disabled>{t('ai.ded.result.apply_btn')}</button>
                                    <span className="dedvr-edit-note">{t('ai.ded.result.correct_input_na')}</span>
                                  </div>
                                  {/* Log asumsi (pola .assumption prototipe):
                                      tolak → item diflag Perlu ditinjau. */}
                                  {ri.assumptions.map((a) => (
                                    <div
                                      key={a.id}
                                      className={`dedvr-assumption${a.decision !== 'pending' ? ' dedvr-assumption--resolved' : ''}${a.decision === 'rejected' ? ' dedvr-assumption--danger' : ''}`}
                                    >
                                      <div>⚠️ {a.text}</div>
                                      <div className="dedvr-assumption-state">
                                        {a.decision === 'pending' ? t('ai.ded.result.asmp_pending') : a.decision === 'approved' ? t('ai.ded.result.asmp_approved') : t('ai.ded.result.asmp_rejected')}
                                        {a.note ? ` — ${a.note}` : ''}
                                      </div>
                                      {a.decision === 'pending' && (
                                        <div className="dedvr-assumption-acts">
                                          <button type="button" className="dedvr-assumption-btn dedvr-assumption-btn--ok" onClick={() => handleAssumptionDecision(it.id, a.id, true)}>{t('ai.ded.result.asmp_ok')}</button>
                                          <button type="button" className="dedvr-assumption-btn" onClick={() => handleAssumptionDecision(it.id, a.id, false)}>{t('ai.ded.result.asmp_no')}</button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                  {/* Konfirmasi / penolakan item. Konfirmasi
                                      butuh nilai (guard reviewState); tolak
                                      butuh alasan (input inline). */}
                                  <div className="dedvr-review-acts">
                                    <button
                                      type="button"
                                      className="dedvr-btn-primary"
                                      disabled={ri.status === 'VERIFIED' || isRejected}
                                      onClick={() => handleReviewConfirm(it.id)}
                                    >
                                      <Check size={13} /> {ri.status === 'VERIFIED' ? t('ai.ded.result.review_verified') : t('ai.ded.result.review_confirm')}
                                    </button>
                                    {isRejecting ? (
                                      <>
                                        <input
                                          type="text"
                                          className="dedvr-reject-input"
                                          placeholder={t('ai.ded.result.reject_ph')}
                                          value={rejectReasons[it.id] ?? ''}
                                          onChange={(e) => setRejectReasons({ ...rejectReasons, [it.id]: e.target.value })}
                                        />
                                        <button type="button" className="dedvr-btn-danger" onClick={() => handleReviewReject(it.id)}>{t('ai.ded.result.reject_yes')}</button>
                                        <button type="button" className="dedvr-btn-ghost" onClick={() => setRejectingId(null)}>{t('ai.ded.result.modal_batal')}</button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        className="dedvr-btn-danger"
                                        disabled={isRejected}
                                        onClick={() => setRejectingId(it.id)}
                                      >
                                        <X size={13} /> {isRejected ? t('ai.ded.result.review_rejected') : t('ai.ded.result.review_reject')}
                                      </button>
                                    )}
                                  </div>
                                  {reviewError[it.id] && <div className="dedvr-review-error" role="alert">{reviewError[it.id]}</div>}
                                  {reviewMsg[it.id] && <div className="dedvr-review-msg" role="status">{reviewMsg[it.id]}</div>}
                                </div>
                              );
                            })()}
                          </div>
                          {prefs.priceAnalysis && <div className="dl-row"><span className="dl-k">{t('ai.ded.result.detail_source')}</span><span><code>{it.quantitySource}</code> · <code>{it.priceSource}</code>{it.ahspCode ? <> · <code>AHSP {it.ahspCode}</code></> : null}</span></div>}
                          {/* W6 (§8): baris provenance eksplisit — chip +
                              penjelasan jujur apa arti sumber harga ini
                              (asumsi rinci tetap di baris catatan harga /
                              blok penyelesaian di bawah). */}
                          {prefs.priceAnalysis && <div className="dl-row"><span className="dl-k">{t('ai.ded.result.prov_title')}</span><span>
                            <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: provBadge.bg, color: provBadge.fg, marginRight: 6 }}>{provBadge.text}</span>
                            {provenanceExplanationForDedSource(it.priceSource)}
                          </span></div>}
                          {prefs.priceAnalysis && it.ahspMatch && it.ahspMatch.status !== 'RESOLVED' && it.ahspMatch.status !== 'NEEDS_REVIEW' && (
                            <div className="dl-row"><span className="dl-k">AHSP</span><span style={{ color: 'var(--ez-color-text-muted)' }}>{it.ahspMatch.reason}{it.ahspMatch.matchedCode ? ` (kode: ${it.ahspMatch.matchedCode})` : ''}</span></div>
                          )}
                          {it.ahspMatch && it.ahspMatch.status === 'NEEDS_REVIEW' && it.ahspMatch.candidates.length > 0 && (
                            <div className="dl-row" style={{ alignItems: 'flex-start' }}>
                              <span className="dl-k">{t('ai.ded.result.ahsp_match')}</span>
                              <span>
                                <span style={{ display: 'block', marginBottom: 6, color: 'var(--ez-color-text-muted)' }}>{it.ahspMatch.reason}</span>
                                {it.ahspMatch.candidates.map((c) => (
                                  <span key={c.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '4px 0', borderTop: '1px solid var(--ez-color-surface-tertiary)' }}>
                                    <span><b>{c.code}</b> — {c.name} ({c.unit})
                                      {c.priceStatus === 'FULL' && c.canonicalPrice != null ? ` — ${fmtRp(c.canonicalPrice)}/${c.unit}` : c.priceStatus === 'PARTIAL' ? t('ai.ded.result.cand_partial') : c.priceStatus === 'UNPRICED' ? t('ai.ded.result.cand_unpriced') : ''}
                                      {!c.unitExact ? t('ai.ded.result.cand_unit_diff') : ''}</span>
                                    <button className="dedai-btn ghost dedai-detail-btn" style={{ padding: '2px 10px', fontSize: 11, flexShrink: 0 }} onClick={() => confirmAhspCandidate(it.id, c.code)}>{t('ai.ded.result.cand_pick')}</button>
                                  </span>
                                ))}
                                {confirmError[it.id] && <span style={{ display: 'block', color: 'var(--ez-color-danger)', marginTop: 4 }}>{confirmError[it.id]}</span>}
                              </span>
                            </div>
                          )}
                          {prefs.priceAnalysis && it.priceAssumptionNote && <div className="dl-row"><span className="dl-k">{t('ai.ded.result.detail_price_note')}</span><span>{it.priceAssumptionNote}</span></div>}
                          {prefs.priceAnalysis && it.priceCompletion && (
                            <div className="dl-row"><span className="dl-k">{t('ai.ded.result.comp_title')}</span><span>
                              {t('ai.ded.result.comp_class_a')}<b>{it.priceCompletion.classification}</b>{t('ai.ded.result.comp_conf')}{it.priceCompletion.confidence}
                              {it.priceCompletion.rangeMin != null && it.priceCompletion.rangeMax != null
                                ? <>{t('ai.ded.result.comp_range')}{fmtRp(it.priceCompletion.rangeMin)}–{fmtRp(it.priceCompletion.rangeMax)}/{it.priceCompletion.unit}</>
                                : null}
                              {' '}{t('ai.ded.result.comp_scope')}{it.priceCompletion.scope === 'TERPASANG_PENUH' ? t('ai.ded.result.comp_scope_full') : it.priceCompletion.scope === 'MATERIAL_SAJA' ? t('ai.ded.result.comp_scope_mat') : t('ai.ded.result.comp_scope_na')}
                              {it.priceCompletion.region ? <>{t('ai.ded.result.comp_region')}{it.priceCompletion.region}</> : null}
                              {it.priceCompletion.sourceName
                                ? <><br />{t('ai.ded.result.comp_source')}{it.priceCompletion.sourceUrl
                                  ? <a href={it.priceCompletion.sourceUrl} target="_blank" rel="noreferrer">{it.priceCompletion.sourceName}</a>
                                  : it.priceCompletion.sourceName}
                                  {it.priceCompletion.sourceDate ? <>{t('ai.ded.result.comp_source_date_a')}{it.priceCompletion.sourceDate}{t('ai.ded.result.comp_source_date_b')}{it.priceCompletion.accessedAt}{t('ai.ded.result.comp_source_date_c')}</> : null}</>
                                : null}
                              {it.priceCompletion.specAssumption ? <><br />{t('ai.ded.result.comp_spec')}{it.priceCompletion.specAssumption}</> : null}
                              {it.priceCompletion.quantityBasis ? <><br />{t('ai.ded.result.comp_qty_basis')}{it.priceCompletion.quantityBasis}</> : null}
                              {it.priceCompletion.sourceKind ? <><br />{t('ai.ded.result.comp_kind')}{it.priceCompletion.sourceKind}{t('ai.ded.result.comp_verify')}{it.priceCompletion.verificationStatus ?? 'UNVERIFIED'}{t('ai.ded.result.comp_approval')}{it.priceCompletion.userApprovalStatus ?? '—'}</> : null}
                              {it.priceCompletion.method ? <><br />{t('ai.ded.result.comp_method')}{it.priceCompletion.method}</> : null}
                              {it.priceCompletion.sourceStale ? <><br /><b style={{ color: 'var(--ez-color-warning)' }}>{t('ai.ded.result.comp_stale')}</b>{t('ai.ded.result.comp_stale_b')}</> : null}
                              {it.priceCompletion.originalUnitPrice != null || it.priceCompletion.originalQuantity != null
                                ? <><br />{t('ai.ded.result.comp_orig')}{it.priceCompletion.originalQuantity != null ? `${t('ai.ded.result.comp_orig_qty')}${fmtQty(it.priceCompletion.originalQuantity)} ${it.units}` : ''}{it.priceCompletion.originalUnitPrice != null ? `${t('ai.ded.result.comp_orig_price')}${fmtRp(it.priceCompletion.originalUnitPrice)}/${it.units}` : ''}</>
                                : null}
                              {it.priceCompletion.history && it.priceCompletion.history.length > 0
                                ? <><br />{t('ai.ded.result.comp_hist')}{it.priceCompletion.history.map((h) => `${fmtRp(h.unitPrice)} (${h.classification}, ${h.at})`).join(' → ')}</>
                                : null}
                            </span></div>
                          )}
                          {prefs.priceAnalysis && it.quantityAudit && (
                            <div className="dl-row"><span className="dl-k">{t('ai.ded.result.audit_title')}</span><span>
                              {t('ai.ded.result.audit_class')}<b>{it.quantityAudit.classification}</b>{t('ai.ded.result.audit_method')}{it.quantityAudit.method}{t('ai.ded.result.audit_conf')}{it.quantityAudit.confidence}{t('ai.ded.result.audit_verify')}{it.quantityAudit.verificationStatus}{t('ai.ded.result.audit_approval')}{it.quantityAudit.userApprovalStatus}
                              {it.quantityAudit.formula ? <><br />{t('ai.ded.result.audit_basis')}{it.quantityAudit.formula}</> : null}
                              {it.quantityAudit.originalQuantity != null && it.quantityAudit.originalQuantity !== it.quantityAudit.proposedQuantity
                                ? <><br />{t('ai.ded.result.audit_orig')}{fmtQty(it.quantityAudit.originalQuantity)} {it.quantityAudit.unit}{t('ai.ded.result.audit_proposed')}{it.quantityAudit.proposedQuantity != null ? fmtQty(it.quantityAudit.proposedQuantity) : '—'} {it.quantityAudit.unit}</>
                                : null}
                            </span></div>
                          )}
                          {policy === 'FULL_AI' && (status === 'blocked' || status === 'no-price') && !it.priceCompletion && (
                            <div className="dl-row"><span className="dl-k">{t('ai.ded.result.comp_title')}</span><span>
                              <button className="dedai-btn ghost dedai-detail-btn" style={{ padding: '2px 10px', fontSize: 11 }} onClick={() => runItemCompletion(it.id)}>
                                <Sparkles size={12} /> {t('ai.ded.result.comp_run_item')}
                              </button>
                            </span></div>
                          )}
                          {it.priceCompletion && (it.priceCompletion.classification === 'MARKET_REFERENCE' || it.priceCompletion.classification === 'AI_ESTIMATE') && (
                            <div className="dl-row"><span className="dl-k">{t('ai.ded.result.comp_title')}</span><span>
                              {it.priceCompletion.userApprovalStatus === 'APPROVED'
                                ? <span style={{ fontSize: 11, color: 'var(--ez-color-success)', fontWeight: 600 }}>{t('ai.ded.result.comp_accepted')}</span>
                                : <button className="dedai-btn ghost dedai-detail-btn" style={{ padding: '2px 10px', fontSize: 11 }} onClick={() => runAcceptCompletion(it.id)}>
                                  <Check size={12} /> {t('ai.ded.result.comp_accept')}
                                </button>}
                              <button className="dedai-btn ghost dedai-detail-btn" style={{ padding: '2px 10px', fontSize: 11, marginLeft: 8 }} onClick={() => runRejectCompletion(it.id)}>
                                <Undo2 size={12} /> {t('ai.ded.result.comp_reject')}
                              </button>
                            </span></div>
                          )}
                          {status === 'blocked' && <div className="dl-row"><span className="dl-k">{t('ai.ded.result.detail_reason')}</span><span style={{ color: 'var(--ez-color-danger)', fontWeight: 600 }}>{t('ai.ded.result.reason_blocked')}</span></div>}
                          {status === 'no-price' && <div className="dl-row"><span className="dl-k">{t('ai.ded.result.detail_reason')}</span><span style={{ color: 'var(--ez-color-warning)', fontWeight: 600 }}>{t('ai.ded.result.reason_no_price')}</span></div>}
                          {status === 'review' && <div className="dl-row"><span className="dl-k">{t('ai.ded.result.detail_reason')}</span><span style={{ color: 'var(--ez-color-warning)', fontWeight: 600 }}>{t('ai.ded.result.reason_review')}</span></div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="dedai-empty">{t('ai.ded.result.empty_filter')}</div>}
      </div>
      </>)}

      {/* ---- Laporan Item Tak Teresolusi (preferensi output — USULAN BARU
          ter-ACC 2026-11-10): daftar khusus item diblokir & tanpa harga
          beserta alasannya; item yang sama tetap tampil berlencana di
          tabel & statistik di atas — ini laporan tambahan, bukan pengganti
          peringatan. ---- */}
      {prefs.unresolvedReport && (
        <div className="aic-card" style={{ marginTop: 16 }}>
          <div className="aic-k">{t('ai.ded.result.unres_title')}</div>
          {(() => {
            const unresolved = withStatus.filter(({ status }) => status === 'blocked' || status === 'no-price');
            if (unresolved.length === 0) {
              return <div style={{ fontSize: 12.5, marginTop: 6 }}>{t('ai.ded.result.unres_none')}</div>;
            }
            return (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {unresolved.map(({ it, status }) => (
                  <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 12.5, borderBottom: '1px dashed var(--ez-color-border)', paddingBottom: 6 }}>
                    <span className={`dedai-badge ${status}`}>{statusMeta[status].icon}{statusMeta[status].label}</span>
                    <span style={{ flex: 1, minWidth: 0 }}><b>{it.name}</b> — {status === 'blocked' ? t('ai.ded.result.reason_blocked') : t('ai.ded.result.reason_no_price')}</span>
                    <span style={{ color: 'var(--ez-color-text-muted)' }}>{it.sourcePages.length ? `${t('ai.ded.result.trace_page')}${it.sourcePages.join(', ')}` : ''}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ---- Gerbang review sebelum finalisasi (mockup v2.3 §2) ----
          Lapisan TAMBAHAN di atas validasi fail-closed: finalisasi
          terkunci sampai semua item tinjau dicentang satu per satu.
          TIDAK ADA tombol "tandai semua" (keputusan owner no. 3 masih
          terbuka — default fail-closed). Panel di luar gerbang
          prefs.detailRab agar finalisasi selalu digerbang walau tabel
          detail disembunyikan. ---- */}
      {!finalized && (
        <div className={`dedai-gate ${gateComplete ? 'complete' : 'locked'}`}>
          <div className="dedai-gate-head">
            {gateComplete
              ? <CheckCircle2 size={18} className="dedai-gate-ico" />
              : <Lock size={18} className="dedai-gate-ico" />}
            <h2>{gateComplete ? t('ai.ded.result.gate_done') : t('ai.ded.result.gate_locked')}</h2>
          </div>
          {gateItems.length === 0 ? (
            <p className="dedai-gate-counts">{t('ai.ded.result.gate_review_none')}</p>
          ) : (
            <>
              <p className="dedai-gate-counts">
                {gateSummary.total}{t('ai.ded.result.gate_count_a')}
                {gateSummary.quantityCount > 0 && <> · {gateSummary.quantityCount}{t('ai.ded.result.gate_count_qty_b')}</>}
                {gateSummary.priceCount > 0 && <> · {gateSummary.priceCount}{t('ai.ded.result.gate_count_price_b')}</>}
                {gateSummary.ahspCount > 0 && <> · {gateSummary.ahspCount}{t('ai.ded.result.gate_count_ahsp_b')}</>}
              </p>
              <div className="dedai-gate-progress">
                <div className="dedai-gate-bar"><div className="dedai-gate-fill" style={{ width: `${gateItems.length > 0 ? Math.round((gateCheckedCount / gateItems.length) * 100) : 0}%` }} /></div>
                <span className="dedai-gate-progress-txt">{gateCheckedCount}{t('ai.ded.result.trace_b')}{gateItems.length}{t('ai.ded.result.gate_prog_b')}</span>
              </div>
              {gateItems.map((g) => (
                <div className="dedai-gate-item" key={g.itemId}>
                  <label className="dedai-gate-label">
                    <input
                      type="checkbox"
                      className="dedai-gate-check"
                      checked={reviewed.has(g.itemId)}
                      onChange={() => toggleReviewed(g.itemId)}
                    />
                    <span className="dedai-gate-body">
                      <span className="dedai-gate-title">{g.itemName}</span>
                      <span className="dedai-gate-tags">
                        {g.tags.map((tag) => (
                          <span key={tag.kind} className={`dedai-qchip ${tag.chipClass}`}>{tag.label}</span>
                        ))}
                      </span>
                      <span className="dedai-gate-desc">{g.description}</span>
                    </span>
                  </label>
                  <button className="dedai-gate-lihat" onClick={() => viewGateItem(g.itemId)}>{t('ai.doc.lib.title_view')}</button>
                </div>
              ))}
              <p className="dedai-gate-note">{t('ai.ded.result.gate_note')}</p>
            </>
          )}
        </div>
      )}
        </div>
      </div>

      {finalMsg && (
        <div className={finalMsg.ok ? 'dedai-notice blue' : 'dedai-error'} style={{ marginTop: 16 }}>
          {finalMsg.ok ? <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} /> : <XCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />}
          <span>{finalMsg.text}</span>
        </div>
      )}

      {/* ---- Aksi: utama dulu, sekunder sesudahnya ----
          Di dalam shell layar-penuh, blok aksi yang sama ini diportalkan ke
          bar aksi menempel di bawah (state & handler tetap di komponen ini —
          hanya posisi DOM yang berpindah). Di luar shell tampil di tempat. */}
      <FsFooterPortal>
        <div className="fs-actions">
          {(counts.blocked + counts['no-price'] > 0) && (
            <span className="fs-action-note">
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              {counts.blocked + counts['no-price']}{t('ai.ded.result.fs_incomplete_a')}
            </span>
          )}
          <div className="fs-actions-btns">
            <div className="dedai-actions-primary">
              <button
                className="dedai-btn primary"
                disabled={finalizing || finalized || calculableCount === 0 || !gateComplete}
                onClick={handleFinalize}
                title={!gateComplete && !finalized ? `${t('ai.ded.result.finalize_locked_a')}${gateItems.length - gateCheckedCount}${t('ai.ded.result.finalize_locked_b')}` : undefined}
              >
                {!gateComplete && !finalized ? <Lock size={16} /> : <FolderCheck size={16} />} {finalized ? t('ai.ded.result.act_finalized') : finalizing ? t('ai.ded.result.act_finalizing') : t('ai.ded.result.act_finalize')}
              </button>
              <button className="dedai-btn ghost" onClick={onOpenSpreadsheet}>
                <Table2 size={16} /> {t('ai.ded.result.act_open_rab')}
              </button>
            </div>
            <div className="dedai-actions">
              <button className="dedai-btn ghost" onClick={() => onSaveDraft(items)}>
                <Save size={16} /> {draftSaved ? t('ai.ded.result.act_saved_draft') : t('ai.ded.result.act_save_draft')}
              </button>
              {/* GATE 4 (5D) — kirim DED ke Chat AI (lampirkan + navigasi). */}
              {onSendToChat && (
                <button className="dedai-btn ghost" onClick={() => onSendToChat(items)}>
                  <MessageSquare size={16} /> {t('ai.ded.result.send_chat')}
                </button>
              )}
              <button className="dedai-btn ghost" onClick={onBackToInput}>
                <ArrowLeft size={16} /> {t('ai.ded.result.act_back_input')}
              </button>
              <button className="dedai-btn ghost" onClick={exportExcel}>
                <FileSpreadsheet size={16} /> {t('ai.ded.result.act_export_excel')}
              </button>
              <button className="dedai-btn ghost" onClick={exportJson}>
                <FileJson size={16} /> {t('ai.ded.result.act_export_json')}
              </button>
            </div>
          </div>
        </div>
      </FsFooterPortal>

      {!finalized && (
        <p style={{ fontSize: 12, color: 'var(--ez-color-text-muted)', marginTop: 10, lineHeight: 1.6 }}>
          {t('ai.ded.result.footnote_a')} {calculableCount} {t('ai.ded.result.footnote_b')} ({counts.blocked}) {t('ai.ded.result.footnote_c')} ({counts['no-price']}) {t('ai.ded.result.footnote_d')}
        </p>
      )}
    </div>
  );
};

export default DedAiResultView;
