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
        row[t('ai.ded.result.th_unit')] = it.units;
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
      <div className="dedai-head">
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
          <div className="aic-k">Pemakaian kredit AI (simulasi)</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13.5 }}>
              DED AI · kategori <strong>{creditEstimate.category}</strong>
            </span>
            <strong style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>
              {creditEstimate.credits.toLocaleString('id-ID')} kredit <span className="aic-sim" style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--ez-color-surface-secondary)', border: '1px dashed var(--ez-color-border-line)' }}>simulasi</span>
            </strong>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ez-color-text-faint)', marginTop: 4 }}>
            Dicatat sebagai pemakaian simulasi — bukan penagihan nyata.
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
        const canonNote = canonCount > 0 ? ` ${canonCount} item memakai harga AHSP kanonis (SE 47/2026, biaya langsung).` : '';
        const reviewNote = reviewCount > 0 ? ` ${reviewCount} item menunggu konfirmasi padanan AHSP.` : '';
        const incompleteNote = incompleteCount > 0 ? ` ${incompleteCount} item AHSP-nya belum lengkap komponennya.` : '';
        return resultMode === 'FULL_AI' ? (
          <div className="dedai-notice">
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span><b>Mode: FULL AI MODE.</b> {aiCount} item memakai harga estimasi AI (AI_ESTIMATE) — bukan harga resmi AHSP.{canonNote}{reviewNote}{incompleteNote} Periksa dan validasi sebelum RAB dipakai untuk pengadaan, tender, atau kontrak.{excluded > 0 ? ` Total di bawah mengecualikan ${excluded} item yang belum lengkap.` : ''}</span>
          </div>
        ) : (
          <div className="dedai-notice blue">
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span><b>Mode: EZRAB AI MODE.</b> Harga diutamakan dari AHSP kanonis — {canonCount} item teratasi dari AHSP kanonis, {aiCount} item memakai estimasi AI berlabel sebagai fallback karena tidak ada di database (bukan harga database), {excluded} item belum lengkap / tanpa harga.{reviewNote}{incompleteNote} Total di bawah bersifat <b>parsial</b> sampai harga yang hilang dilengkapi (mis. lewat AHSP picker setelah push ke spreadsheet).</span>
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
              Total usulan AI: {fmtRp(proposed)} (untuk perbandingan; total terverifikasi di atas yang dipakai).
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
      {/* ---- FASE P0: Cakupan 12 Divisi & Jejak Analisis ---- */}
      {output.divisionCoverage && output.divisionCoverage.length > 0 && (
        <div className="aic-card" style={{ margin: '0 0 16px' }}>
          <div className="aic-k">Cakupan 12 Divisi Rumah</div>
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
                  {d.status === 'IDENTIFIED' ? 'Teridentifikasi dari DED'
                    : d.status === 'ASSUMPTION_REQUIRES_CONFIRMATION' ? 'Asumsi — perlu konfirmasi'
                    : d.status === 'NOT_APPLICABLE' ? 'Tidak berlaku' : 'Data belum cukup'}
                  {d.itemCount > 0 ? ` · ${d.itemCount} item` : ''}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ez-color-text-faint)', marginTop: 2 }}>{d.note}</div>
                {d.assumptionCandidates.length > 0 && (
                  <div style={{ fontSize: 11.5, color: 'var(--ez-color-text-faint)', marginTop: 4 }}>
                    Kandidat asumsi (tanpa volume/harga): {d.assumptionCandidates.map((c) => c.name).join('; ')}
                  </div>
                )}
              </div>
            ))}
          </div>
          {output.analysisTrace && (
            <div style={{ fontSize: 12, color: 'var(--ez-color-text-faint)', marginTop: 10 }}>
              Jejak analisis: {output.analysisTrace.selectedPageCount} dari {output.analysisTrace.totalPages} halaman dikirim ke model
              ({output.analysisTrace.totalCharsSent.toLocaleString('id-ID')} karakter), {output.analysisTrace.passes.length} pass.
              {output.analysisTrace.skippedPageCount > 0 && (
                <> Halaman terlewat budget: {output.analysisTrace.pages.filter((p) => p.status === 'SKIPPED_BUDGET').map((p) => `hal. ${p.page} (${p.pageType}${p.sourceFile ? `, ${p.sourceFile}` : ''})`).join(', ')}.</>
              )}
              {output.analysisTrace.pages.some((p) => p.status === 'NO_TEXT') && (
                <> Halaman tanpa lapisan teks (tidak dianalisis — butuh OCR): {output.analysisTrace.pages.filter((p) => p.status === 'NO_TEXT').map((p) => `hal. ${p.page}${p.sourceFile ? ` (${p.sourceFile})` : ''}`).join(', ')}.</>
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
          <span>📊 Kelompok Pekerjaan (WBS) — {wbsData.groups.length} kelompok</span>
          <span style={{ fontSize: 18 }}>{showWbs ? '▾' : '▸'}</span>
        </button>

        {showWbs && (
          <div style={{ marginTop: 8, border: '1px solid var(--ez-color-border-line)', borderRadius: 8, overflow: 'hidden' }}>
            {wbsData.groups.map((g) => {
              const isOpen = wbsExpanded.has(g.node.code);
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
                      <span style={{ fontSize: 12, color: 'var(--ez-color-text-muted)' }}>({g.itemCount} item)</span>
                      {g.issueCount > 0 && (
                        <span style={{ fontSize: 11, background: 'var(--ez-hue-amber-bg-deep)', color: 'var(--ez-hue-amber-text-dark)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                          {g.issueCount} bermasalah
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
              <div className="aic-k">Penyelesaian Harga & Kuantitas AI</div>
              <div style={{ fontSize: 12, color: 'var(--ez-color-text-faint)', marginTop: 2 }}>
                Harga kosong dilengkapi dari referensi pasar eksternal berlabel sumber; kuantitas kosong dari asumsi denah berlabel. Harga AHSP resmi & harga manual tidak pernah ditimpa.
              </div>
            </div>
            {gapCount > 0 && (
              <button className="dedai-btn primary" onClick={runBatchCompletion}>
                <Sparkles size={15} /> Lengkapi Harga AI ({gapCount} item)
              </button>
            )}
          </div>
          {completionReport && (
            <div style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.7 }}>
              Dipindai <b>{completionReport.scanned}</b> · terisi referensi pasar <b>{completionReport.filledMarketReference}</b> ·
              terisi estimasi AI <b>{completionReport.filledAiEstimate}</b> · kuantitas dilengkapi <b>{completionReport.quantityFilled}</b> ·
              resmi dipertahankan <b>{completionReport.officialPreserved}</b> · sudah ada dipertahankan <b>{completionReport.existingKept}</b> ·
              butuh kuantitas <b>{completionReport.needsQuantity}</b> · belum terpecahkan <b>{completionReport.unresolved}</b>
              {completionReport.failures > 0 ? <> · gagal diproses <b>{completionReport.failures}</b> (batch tetap lanjut)</> : null}
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
      <div className="dedvr-mobile-toggle" role="group" aria-label="Tampilan tinjau">
        <button
          type="button"
          className={`dedvr-mobile-toggle-btn${mobileView === 'drawing' ? ' active' : ''}`}
          onClick={() => setMobileView('drawing')}
          aria-pressed={mobileView === 'drawing'}
        >
          Gambar DED
        </button>
        <button
          type="button"
          className={`dedvr-mobile-toggle-btn${mobileView === 'results' ? ' active' : ''}`}
          onClick={() => setMobileView('results')}
          aria-pressed={mobileView === 'results'}
        >
          Hasil
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
      <div className="dedai-qlegend" aria-label="Legenda bukti kuantitas">
        <span className="dedai-qlegend-title">Bukti kuantitas:</span>
        {QUANTITY_EVIDENCE_LEGEND.map((chip) => (
          <span key={chip.kind} className={`dedai-qchip ${chip.className}`} title={chip.hint}>{chip.label}</span>
        ))}
        <span className="dedai-qlegend-note">“Klaim: dimensi DED” berarti model mengklaim angka ini dari gambar — bukan bukti terverifikasi. Klik baris untuk melihat dasarnya.</span>
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
              <th>No</th><th>{t('ai.ded.result.th_desc')}</th><th>{t('ai.ded.result.th_volume')}</th><th>Bukti kuantitas</th><th>{t('ai.ded.result.th_unit')}</th>
              <th>{t('ai.ded.result.th_unit_price')}</th><th>{t('ai.ded.result.th_total')}</th><th>{t('ai.ded.result.th_status')}</th><th>{t('ai.ded.result.th_action')}</th>
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
                      <span className={`dedai-qchip ${qtyChip.className}`} title={qtyChip.hint}>{qtyChip.label}</span>
                    </td>
                    <td>
                      {isEditing ? (
                        <input className="dedai-edit-input" style={{ width: 64 }} value={editVals.units} onChange={(e) => setEditVals({ ...editVals, units: e.target.value })} />
                      ) : it.units}
                    </td>
                    <td><span className="dedai-num">{fmtRp(it.unitPrice)}</span></td>
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
                          <span className="dedai-qchip dedai-qchip-confirm" title="Padanan AHSP belum dikonfirmasi — pilih di detail item.">Perlu konfirmasi AHSP</span>
                        </>
                      )}
                      {/* I7b: badge status tinjau visual (taksonomi 6-state,
                          spec §10) — detail lengkapnya di blok tinjau. */}
                      {reviewItem && (
                        <>
                          <br />
                          <span
                            className={`dedvr-status dedvr-status--${reviewItem.status.toLowerCase().replace(/_/g, '-')}`}
                            title="Status tinjau visual — klik baris untuk detail"
                            style={{ marginTop: 4 }}
                          >
                            {REVIEW_STATUS_LABELS[reviewItem.status]}
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
                              Dasar kuantitas
                              <span className={`dedai-qchip ${qtyChip.className}`} title={qtyChip.hint}>{qtyChip.label}</span>
                            </div>
                            {it.rawDimensions && <div className="dl-row"><span className="dl-k">Dimensi mentah</span><span>{it.rawDimensions}</span></div>}
                            {it.quantityFormula && <div className="dl-row"><span className="dl-k">Rumus</span><span>{it.quantityFormula}</span></div>}
                            {it.derivation && (
                              <div className="dl-row"><span className="dl-k">Jejak hitungan</span><span>
                                {it.derivation.formulaType}
                                {it.derivation.inputs.length > 0 && (
                                  <> — {it.derivation.inputs.map((inp) => `${inp.name} ${inp.value} ${inp.unit} (${inp.source})`).join(' · ')}</>
                                )}
                                {it.derivation.result != null && (
                                  <> → hasil {fmtQty(it.derivation.result)} {it.derivation.resultUnit}</>
                                )}
                                {' '}· validasi: {it.derivation.validationStatus}
                                {it.derivation.notes && (<><br />{it.derivation.notes}</>)}
                              </span></div>
                            )}
                            {it.quantityNote && <div className="dl-row"><span className="dl-k">Catatan</span><span>{it.quantityNote}</span></div>}
                            {it.sourceEvidence && <div className="dl-row"><span className="dl-k">Bukti teks</span><span>{it.sourceEvidence}</span></div>}
                            <div className="dl-row"><span className="dl-k">Halaman sumber</span><span>{it.sourcePages.length ? it.sourcePages.map((p) => `${t('ai.ded.result.page_abbr')}${p}${t('ai.ded.result.page_abbr_suffix')}`).join(', ') : 'Tidak tercatat per item'}</span></div>
                            {!it.rawDimensions && !it.quantityFormula && !it.derivation && !it.quantityNote && !it.sourceEvidence && (
                              <div className="dl-row"><span className="dl-k">Keterangan</span><span>Tidak ada dasar kuantitas tersimpan untuk item ini.</span></div>
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
                                    <span className="dedvr-review-title">Tinjau visual</span>
                                    <span className={`dedvr-status dedvr-status--${ri.status.toLowerCase().replace(/_/g, '-')}`}>{REVIEW_STATUS_LABELS[ri.status]}</span>
                                    <span
                                      className={`dedvr-confidence dedvr-confidence--${confColor}`}
                                      title="Keyakinan berbasis provenans kuantitas (heuristik tampilan — bukan pengukuran model)"
                                    >
                                      Keyakinan {confPct}%
                                    </span>
                                    {ri.page !== null && (
                                      <button type="button" className="dedvr-jump-btn" onClick={() => selectReviewItemAndJump(it.id)}>
                                        <Eye size={13} /> Lihat di gambar (hal. {ri.page})
                                      </button>
                                    )}
                                  </div>
                                  <div className="dl-row"><span className="dl-k">Interpretasi</span><span>
                                    {ri.interpretation.value !== null
                                      ? <><b>{fmtQty(ri.interpretation.value)} {ri.interpretation.unit}</b> · {ri.interpretation.detail}</>
                                      : <>Tidak ada nilai — {ri.interpretation.detail}</>}
                                    {ri.originalText ? <> (dari “{ri.originalText}”)</> : null}
                                  </span></div>
                                  {ri.correctedFrom && (
                                    <div className="dl-row"><span className="dl-k">Koreksi terakhir</span><span>{ri.correctedFrom.note}</span></div>
                                  )}
                                  {ri.rejectionReason && (
                                    <div className="dl-row"><span className="dl-k">Alasan penolakan</span><span>{ri.rejectionReason}</span></div>
                                  )}
                                  {ri.notes.length > 0 && (
                                    <div className="dl-row"><span className="dl-k">Catatan tinjau</span><span>{ri.notes.join(' · ')}</span></div>
                                  )}
                                  {/* Koreksi nilai (pola .edit-row prototipe):
                                      koreksi langsung oleh pengguna; rumus
                                      lama disimpan sebagai "rumus asal". */}
                                  <div className="dedvr-edit-row">
                                    <span className="dedvr-edit-label">Koreksi nilai:</span>
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
                                    <button type="button" className="dedvr-btn-primary" disabled={isRejected} onClick={() => handleReviewCorrect(it.id)}>Terapkan</button>
                                    <label className="dedvr-edit-check">
                                      <input
                                        type="checkbox"
                                        checked={!!correctConfirm[it.id]}
                                        onChange={(e) => setCorrectConfirm({ ...correctConfirm, [it.id]: e.target.checked })}
                                        disabled={isRejected}
                                      />
                                      Sekaligus konfirmasi
                                    </label>
                                  </div>
                                  <div className="dedvr-edit-note">Rumus lama disimpan sebagai “rumus asal” — nilai baru tidak lagi mengikuti rumus itu.</div>
                                  {/* Koreksi per input: TIDAK tersedia untuk
                                      item live (tanpa recomputeKind — input
                                      memakai satuan asli, bukan mm; paksa
                                      recompute akan salah baca satuan).
                                      Ditampilkan nonaktif + penjelasan,
                                      bukan disembunyikan. */}
                                  <div className="dedvr-edit-row dedvr-edit-row--disabled" title="Item live tidak punya rumus recompute (input memakai satuan asli, bukan mm) — koreksi per input tidak tersedia.">
                                    <span className="dedvr-edit-label">Koreksi per input:</span>
                                    <input type="text" className="dedvr-edit-input" disabled placeholder="—" />
                                    <button type="button" className="dedvr-btn-primary" disabled>Terapkan</button>
                                    <span className="dedvr-edit-note">Tidak tersedia untuk item ini — pakai koreksi nilai di atas.</span>
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
                                        {a.decision === 'pending' ? 'Menunggu keputusan' : a.decision === 'approved' ? '✓ Disetujui' : '✗ Ditolak'}
                                        {a.note ? ` — ${a.note}` : ''}
                                      </div>
                                      {a.decision === 'pending' && (
                                        <div className="dedvr-assumption-acts">
                                          <button type="button" className="dedvr-assumption-btn dedvr-assumption-btn--ok" onClick={() => handleAssumptionDecision(it.id, a.id, true)}>Setujui</button>
                                          <button type="button" className="dedvr-assumption-btn" onClick={() => handleAssumptionDecision(it.id, a.id, false)}>Tolak</button>
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
                                      <Check size={13} /> {ri.status === 'VERIFIED' ? 'Sudah terverifikasi' : 'Konfirmasi (Terverifikasi)'}
                                    </button>
                                    {isRejecting ? (
                                      <>
                                        <input
                                          type="text"
                                          className="dedvr-reject-input"
                                          placeholder="Alasan penolakan (wajib)"
                                          value={rejectReasons[it.id] ?? ''}
                                          onChange={(e) => setRejectReasons({ ...rejectReasons, [it.id]: e.target.value })}
                                        />
                                        <button type="button" className="dedvr-btn-danger" onClick={() => handleReviewReject(it.id)}>Ya, tolak</button>
                                        <button type="button" className="dedvr-btn-ghost" onClick={() => setRejectingId(null)}>Batal</button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        className="dedvr-btn-danger"
                                        disabled={isRejected}
                                        onClick={() => setRejectingId(it.id)}
                                      >
                                        <X size={13} /> {isRejected ? 'Sudah ditolak' : 'Tolak deteksi'}
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
                          {prefs.priceAnalysis && <div className="dl-row"><span className="dl-k">Provenans harga</span><span>
                            <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: provBadge.bg, color: provBadge.fg, marginRight: 6 }}>{provBadge.text}</span>
                            {provenanceExplanationForDedSource(it.priceSource)}
                          </span></div>}
                          {prefs.priceAnalysis && it.ahspMatch && it.ahspMatch.status !== 'RESOLVED' && it.ahspMatch.status !== 'NEEDS_REVIEW' && (
                            <div className="dl-row"><span className="dl-k">AHSP</span><span style={{ color: 'var(--ez-color-text-muted)' }}>{it.ahspMatch.reason}{it.ahspMatch.matchedCode ? ` (kode: ${it.ahspMatch.matchedCode})` : ''}</span></div>
                          )}
                          {it.ahspMatch && it.ahspMatch.status === 'NEEDS_REVIEW' && it.ahspMatch.candidates.length > 0 && (
                            <div className="dl-row" style={{ alignItems: 'flex-start' }}>
                              <span className="dl-k">Padanan AHSP</span>
                              <span>
                                <span style={{ display: 'block', marginBottom: 6, color: 'var(--ez-color-text-muted)' }}>{it.ahspMatch.reason}</span>
                                {it.ahspMatch.candidates.map((c) => (
                                  <span key={c.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '4px 0', borderTop: '1px solid var(--ez-color-surface-tertiary)' }}>
                                    <span><b>{c.code}</b> — {c.name} ({c.unit})
                                      {c.priceStatus === 'FULL' && c.canonicalPrice != null ? ` — ${fmtRp(c.canonicalPrice)}/${c.unit}` : c.priceStatus === 'PARTIAL' ? ' — komponen belum lengkap' : c.priceStatus === 'UNPRICED' ? ' — tanpa rincian komponen' : ''}
                                      {!c.unitExact ? ' — satuan berbeda' : ''}</span>
                                    <button className="dedai-btn ghost dedai-detail-btn" style={{ padding: '2px 10px', fontSize: 11, flexShrink: 0 }} onClick={() => confirmAhspCandidate(it.id, c.code)}>Pilih</button>
                                  </span>
                                ))}
                                {confirmError[it.id] && <span style={{ display: 'block', color: 'var(--ez-color-danger)', marginTop: 4 }}>{confirmError[it.id]}</span>}
                              </span>
                            </div>
                          )}
                          {prefs.priceAnalysis && it.priceAssumptionNote && <div className="dl-row"><span className="dl-k">{t('ai.ded.result.detail_price_note')}</span><span>{it.priceAssumptionNote}</span></div>}
                          {prefs.priceAnalysis && it.priceCompletion && (
                            <div className="dl-row"><span className="dl-k">Penyelesaian AI</span><span>
                              Klasifikasi: <b>{it.priceCompletion.classification}</b> · keyakinan {it.priceCompletion.confidence}
                              {it.priceCompletion.rangeMin != null && it.priceCompletion.rangeMax != null
                                ? <> · rentang referensi {fmtRp(it.priceCompletion.rangeMin)}–{fmtRp(it.priceCompletion.rangeMax)}/{it.priceCompletion.unit}</>
                                : null}
                              {' '}· cakupan {it.priceCompletion.scope === 'TERPASANG_PENUH' ? 'terpasang penuh' : it.priceCompletion.scope === 'MATERIAL_SAJA' ? 'material saja' : 'tidak dinyatakan'}
                              {it.priceCompletion.region ? <> · wilayah {it.priceCompletion.region}</> : null}
                              {it.priceCompletion.sourceName
                                ? <><br />Sumber: {it.priceCompletion.sourceUrl
                                  ? <a href={it.priceCompletion.sourceUrl} target="_blank" rel="noreferrer">{it.priceCompletion.sourceName}</a>
                                  : it.priceCompletion.sourceName}
                                  {it.priceCompletion.sourceDate ? <> (data {it.priceCompletion.sourceDate}, diambil {it.priceCompletion.accessedAt})</> : null}</>
                                : null}
                              {it.priceCompletion.specAssumption ? <><br />Asumsi spek: {it.priceCompletion.specAssumption}</> : null}
                              {it.priceCompletion.quantityBasis ? <><br />Dasar kuantitas: {it.priceCompletion.quantityBasis}</> : null}
                              {it.priceCompletion.sourceKind ? <><br />Jenis sumber: {it.priceCompletion.sourceKind} · verifikasi: {it.priceCompletion.verificationStatus ?? 'UNVERIFIED'} · persetujuan: {it.priceCompletion.userApprovalStatus ?? '—'}</> : null}
                              {it.priceCompletion.method ? <><br />Metode: {it.priceCompletion.method}</> : null}
                              {it.priceCompletion.sourceStale ? <><br /><b style={{ color: 'var(--ez-color-warning)' }}>Sumber BASI</b> (melewati masa segar 30 hari) — keyakinan diturunkan.</> : null}
                              {it.priceCompletion.originalUnitPrice != null || it.priceCompletion.originalQuantity != null
                                ? <><br />Nilai asli sebelum penyelesaian: {it.priceCompletion.originalQuantity != null ? `kuantitas ${fmtQty(it.priceCompletion.originalQuantity)} ${it.units}` : ''}{it.priceCompletion.originalUnitPrice != null ? ` · harga ${fmtRp(it.priceCompletion.originalUnitPrice)}/${it.units}` : ''}</>
                                : null}
                              {it.priceCompletion.history && it.priceCompletion.history.length > 0
                                ? <><br />Riwayat: {it.priceCompletion.history.map((h) => `${fmtRp(h.unitPrice)} (${h.classification}, ${h.at})`).join(' → ')}</>
                                : null}
                            </span></div>
                          )}
                          {prefs.priceAnalysis && it.quantityAudit && (
                            <div className="dl-row"><span className="dl-k">Audit Kuantitas</span><span>
                              Kelas: <b>{it.quantityAudit.classification}</b> · metode {it.quantityAudit.method} · keyakinan {it.quantityAudit.confidence} · verifikasi {it.quantityAudit.verificationStatus} · persetujuan {it.quantityAudit.userApprovalStatus}
                              {it.quantityAudit.formula ? <><br />Dasar: {it.quantityAudit.formula}</> : null}
                              {it.quantityAudit.originalQuantity != null && it.quantityAudit.originalQuantity !== it.quantityAudit.proposedQuantity
                                ? <><br />Kuantitas asli: {fmtQty(it.quantityAudit.originalQuantity)} {it.quantityAudit.unit} → usulan {it.quantityAudit.proposedQuantity != null ? fmtQty(it.quantityAudit.proposedQuantity) : '—'} {it.quantityAudit.unit}</>
                                : null}
                            </span></div>
                          )}
                          {policy === 'FULL_AI' && (status === 'blocked' || status === 'no-price') && !it.priceCompletion && (
                            <div className="dl-row"><span className="dl-k">Penyelesaian AI</span><span>
                              <button className="dedai-btn ghost dedai-detail-btn" style={{ padding: '2px 10px', fontSize: 11 }} onClick={() => runItemCompletion(it.id)}>
                                <Sparkles size={12} /> Lengkapi item ini dengan AI
                              </button>
                            </span></div>
                          )}
                          {it.priceCompletion && (it.priceCompletion.classification === 'MARKET_REFERENCE' || it.priceCompletion.classification === 'AI_ESTIMATE') && (
                            <div className="dl-row"><span className="dl-k">Penyelesaian AI</span><span>
                              {it.priceCompletion.userApprovalStatus === 'APPROVED'
                                ? <span style={{ fontSize: 11, color: 'var(--ez-color-success)', fontWeight: 600 }}>✓ Diterima pengguna — termasuk total berlabel estimasi.</span>
                                : <button className="dedai-btn ghost dedai-detail-btn" style={{ padding: '2px 10px', fontSize: 11 }} onClick={() => runAcceptCompletion(it.id)}>
                                  <Check size={12} /> Terima penyelesaian ini
                                </button>}
                              <button className="dedai-btn ghost dedai-detail-btn" style={{ padding: '2px 10px', fontSize: 11, marginLeft: 8 }} onClick={() => runRejectCompletion(it.id)}>
                                <Undo2 size={12} /> Tolak penyelesaian — kembalikan seperti semula
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
          <div className="aic-k">Laporan Item Tak Teresolusi</div>
          {(() => {
            const unresolved = withStatus.filter(({ status }) => status === 'blocked' || status === 'no-price');
            if (unresolved.length === 0) {
              return <div style={{ fontSize: 12.5, marginTop: 6 }}>Tidak ada item tak teresolusi — semua item punya kuantitas dan harga.</div>;
            }
            return (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {unresolved.map(({ it, status }) => (
                  <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 12.5, borderBottom: '1px dashed var(--ez-color-border)', paddingBottom: 6 }}>
                    <span className={`dedai-badge ${status}`}>{statusMeta[status].icon}{statusMeta[status].label}</span>
                    <span style={{ flex: 1, minWidth: 0 }}><b>{it.name}</b> — {status === 'blocked' ? t('ai.ded.result.reason_blocked') : t('ai.ded.result.reason_no_price')}</span>
                    <span style={{ color: 'var(--ez-color-text-muted)' }}>{it.sourcePages.length ? `hal. ${it.sourcePages.join(', ')}` : ''}</span>
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
            <h2>{gateComplete ? 'Semua item sudah ditinjau' : 'Tinjau sebelum finalisasi (terkunci)'}</h2>
          </div>
          {gateItems.length === 0 ? (
            <p className="dedai-gate-counts">Tidak ada item yang perlu ditinjau — finalisasi terbuka.</p>
          ) : (
            <>
              <p className="dedai-gate-counts">
                {gateSummary.total} item perlu ditinjau
                {gateSummary.quantityCount > 0 && <> · {gateSummary.quantityCount} kuantitas estimasi</>}
                {gateSummary.priceCount > 0 && <> · {gateSummary.priceCount} harga Estimasi AI</>}
                {gateSummary.ahspCount > 0 && <> · {gateSummary.ahspCount} padanan AHSP</>}
              </p>
              <div className="dedai-gate-progress">
                <div className="dedai-gate-bar"><div className="dedai-gate-fill" style={{ width: `${gateItems.length > 0 ? Math.round((gateCheckedCount / gateItems.length) * 100) : 0}%` }} /></div>
                <span className="dedai-gate-progress-txt">{gateCheckedCount} dari {gateItems.length} ditinjau</span>
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
                  <button className="dedai-gate-lihat" onClick={() => viewGateItem(g.itemId)}>Lihat</button>
                </div>
              ))}
              <p className="dedai-gate-note">Centang satu per satu sesudah memeriksa dasarnya di detail item. Item “Klaim: dimensi DED” dan “Input user” tidak masuk daftar ini.</p>
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
              {counts.blocked + counts['no-price']} item belum lengkap tidak masuk total — lengkapi agar total final.
            </span>
          )}
          <div className="fs-actions-btns">
            <div className="dedai-actions-primary">
              <button
                className="dedai-btn primary"
                disabled={finalizing || finalized || calculableCount === 0 || !gateComplete}
                onClick={handleFinalize}
                title={!gateComplete && !finalized ? `Finalisasi terkunci — ${gateItems.length - gateCheckedCount} item belum ditinjau` : undefined}
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
                  <MessageSquare size={16} /> Kirim ke Chat AI
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
