/**
 * FULL AI DED ESTIMATE — Result View
 *
 * Menampilkan hasil Full AI dengan transparansi penuh:
 * provenance, formula, asumsi, sumber harga, status verifikasi.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, HelpCircle, XCircle, MessageSquare, Lock } from 'lucide-react';
import { FullAiOutput, FullAiItem } from './types';
// DED Hasil + Gerbang Review (mockup v2.3, ACC owner 2026-11-19 04:14):
// taksonomi chip bukti kuantitas + gerbang review dari SATU modul murni
// (dedReviewGate.ts) — dipakai kedua result view. CSS gerbang/chip
// dipakai ulang dari dedAi.css (blok "DED Hasil + Gerbang Review").
import {
  quantityEvidenceChipForFullAiItem, reviewGateItemsForFullAi, reviewGateSummary,
  reviewedCount, isReviewGateComplete, canFinalizeWithGate, countSavableFullAi,
} from '../ded-ai-estimate/dedReviewGate';
import '../ded-ai-estimate/dedAi.css';
import { resolveCanonicalCode, getDedPriceSourceLabel, DED_PRICE_SOURCE_LABELS } from '../ded-canonical/canonicalDedPricing';
import { modeFromPolicy, canConfirmCanonicalCandidate } from './dataSourcePolicy';
import type { DedRabAiMode } from '../ded-ai-estimate/dedMode';
import {
  resolveFullAiItemStatus, acceptFullAiCompletion, rejectFullAiCompletion,
  fullAiPriceCompletionOf, fullAiQuantityAuditOf,
} from './service';
import { verifySubtotal, clearAiProposal } from './validator';
// W6 (§8): chip + penjelasan provenance harga dari SATU tabel kanonis
// (dedProvenance.ts) — estimasi AI dibedakan visual dari data terverifikasi.
import { provenanceBadgeForDedSource, provenanceExplanationForDedSource } from '../ded-ai-estimate/dedProvenance';
import { useI18n } from '../../i18n/I18nContext';

interface Props {
  output: FullAiOutput;
  onFinalize: (items: FullAiItem[]) => Promise<{ ok: boolean; message: string }>;
  /**
   * Simpan hasil Full AI sebagai draft (Dual Mode W1, G-ST-2) —
   * opsional agar pemakai lama tanpa handler tidak rusak; bila
   * tidak diisi, tombol simpan tidak tampil.
   */
  onSaveDraft?: (items: FullAiItem[]) => void;
  /** true bila draft sudah tersimpan (label tombol berubah). */
  draftSaved?: boolean;
  /**
   * G-UI-3 (§3): kirim hasil Full AI ke Chat AI — sejajar
   * DedAiResultView.onSendToChat. Opsional; bila tidak diisi, tombol
   * tidak tampil.
   */
  onSendToChat?: (items: FullAiItem[]) => void;
  onBack: () => void;
  /**
   * true = dirender di dalam FeatureFullscreenShell: baris header internal
   * (tombol kembali + judul + chip provenans) disembunyikan karena shell
   * sudah menyediakannya di bar atasnya. Murni presentasi.
   */
  embedded?: boolean;
}

// Label sumber harga dari adapter kanonis (satu sumber). VERIFIED_SOURCE
// lama tampil netral ("belum terverifikasi independen") — nilainya tidak
// diubah, hanya labelnya, agar draft & riwayat lama tidak direlabel diam-diam.
// Chip bukti KUANTITAS (dulu tabel PROVENANCE_LABEL di sini, dengan label
// "Dari DED" hijau yang menyesatkan) kini dari dedReviewGate.ts —
// taksonomi yang sama dengan mode standar; EXPLICIT menjadi "Klaim: dari
// DED" (kuning, mockup v2.3 §1).
const PRICE_LABEL = DED_PRICE_SOURCE_LABELS;

const STATUS_ICON: Record<string, React.ReactNode> = {
  READY: <span style={{ color: 'var(--ez-hue-green-text-bright)', display: 'inline-flex' }}><CheckCircle2 size={14} /></span>,
  NEEDS_CONFIRMATION: <span style={{ color: 'var(--ez-hue-amber-text-deep)', display: 'inline-flex' }}><AlertTriangle size={14} /></span>,
  UNRESOLVED: <span style={{ color: 'var(--ez-color-text-muted)', display: 'inline-flex' }}><HelpCircle size={14} /></span>,
  EXCLUDED: <span style={{ color: 'var(--ez-color-danger-strong)', display: 'inline-flex' }}><XCircle size={14} /></span>,
};

const fmtRp = (n: number | null) =>
  n == null ? '—' : `Rp${n.toLocaleString('id-ID')}`;

function ItemCard({ item, onUpdate, rabMode, openRequest }: {
  item: FullAiItem;
  onUpdate: (updated: FullAiItem) => void;
  /** Mode dual DED-RAB (§7, G-IS-3): di FULL_AI konfirmasi kandidat AHSP ke katalog ditutup. Absen = perilaku lama (diizinkan). */
  rabMode?: DedRabAiMode;
  /** Permintaan buka dari gerbang ("Lihat"): kartu yang id-nya cocok membuka detailnya. */
  openRequest?: { id: string; n: number } | null;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editQty, setEditQty] = useState(item.quantity.value?.toString() || '');
  const [editPrice, setEditPrice] = useState(item.price.unitPrice?.toString() || '');
  // "Lihat" dari gerbang: buka kartu ini (state buka tetap lokal di kartu).
  useEffect(() => {
    if (openRequest && openRequest.id === item.id) setOpen(true);
  }, [openRequest, item.id]);
  const q = item.quantity;
  const p = item.price;
  // SPRINT 4 (paritas): blok penyelesaian terstruktur bersama pipeline
  // standar (DedPriceCompletion / DedQuantityAudit).
  const pc = fullAiPriceCompletionOf(item);
  const qa = fullAiQuantityAuditOf(item);
  const hasPendingCompletion = Boolean(
    (pc && pc.referenceId) || qa?.method === 'plan-context-estimate'
  );
  const completionApproved = Boolean(
    (pc?.userApprovalStatus === 'APPROVED' || qa?.userApprovalStatus === 'APPROVED')
    && hasPendingCompletion
  );
  const prov = quantityEvidenceChipForFullAiItem(item);
  const priceSrc = getDedPriceSourceLabel(p.source);
  // W6 (§8): chip provenance HARGA (terpisah dari chip provenance
  // kuantitas `prov` di atas) — estimasi AI (kuning) dibedakan visual
  // dari AHSP kanonis (hijau) & input user (ungu) pada kartu tertutup.
  const priceBadge = provenanceBadgeForDedSource(p.source);
  const isEdited = q.provenance === 'USER_INPUT' || p.source === 'USER_INPUT';
  const [confirmMsg, setConfirmMsg] = useState('');

  // §7 (G-IS-3): konfirmasi kandidat AHSP ke katalog HANYA di mode
  // EZRAB_AI. Di mode FULL_AI kandidat hanya usulan AI — tombol "Pilih"
  // disembunyikan dan handler di bawah menolak memanggil adapter.
  const allowCanonicalConfirm = rabMode === undefined || canConfirmCanonicalCandidate(rabMode);

  // Konfirmasi kandidat AHSP (review): resolusi ulang lewat jalur kode
  // eksak adapter — kandidat PARTIAL / satuan tak cocok / karantina akan
  // ditolak di sini, tidak pernah langsung dipakai.
  const handleConfirmCandidate = (code: string) => {
    // §7 (G-IS-3): pertahanan kedua — tombolnya sudah disembunyikan di
    // mode FULL_AI, tapi handler ini pun menolak memanggil katalog.
    if (!allowCanonicalConfirm) {
      setConfirmMsg(t('ai.ded.fullai.confirm_na'));
      return;
    }
    const resolved = resolveCanonicalCode(code, item.quantity.unit);
    if (resolved.status !== 'RESOLVED' || resolved.unitPrice == null) {
      setConfirmMsg(t('ai.ded.fullai.cand_fail_a') + code + t('ai.ded.fullai.cand_fail_b') + resolved.reason);
      return;
    }
    const newPrice = {
      ...item.price,
      unitPrice: resolved.unitPrice,
      unit: resolved.unit || item.quantity.unit,
      source: 'AHSP_2026' as const,
      region: 'Nasional',
      period: '2026',
      ahspCode: resolved.matchedCode,
      notes: `AHSP kanonis ${resolved.matchedCode} (${resolved.sourceDocument}, biaya langsung) — dikonfirmasi pengguna dari kandidat review.`,
      ahspMatch: resolved,
      // Harga menjadi kanonis: blok penyelesaian referensi eksternal
      // (SPRINT 4) tidak lagi menjelaskan harga ini — dicabut.
      filledFromExternalRef: undefined,
      priceCompletion: undefined,
    };
    const { subtotal, verified } = verifySubtotal(item.quantity.value, newPrice.unitPrice);
    const { status, exclusionReason } = resolveFullAiItemStatus(
      { value: item.quantity.value, unit: item.quantity.unit, provenance: item.quantity.provenance },
      { unitPrice: newPrice.unitPrice, unit: newPrice.unit, source: newPrice.source },
    );
    const includeInTotal = status === 'READY' && subtotal != null && subtotal > 0;
    // Harga berubah jadi kanonis → usulan AI lama basi, dibersihkan.
    onUpdate(clearAiProposal({
      ...item,
      price: newPrice,
      priceCompletion: undefined,
      subtotal: includeInTotal ? subtotal : null,
      subtotalVerified: verified && includeInTotal,
      status: includeInTotal ? 'READY' : status,
      exclusionReason: includeInTotal ? null : exclusionReason,
    }));
    setConfirmMsg('');
  };

  return (
    <div id={`fullai-card-${item.id}`} className="fullai-item" style={{
      border: '1px solid var(--ez-color-border-neutral)', borderRadius: 8, marginBottom: 8,
      background: item.status === 'UNRESOLVED' ? 'var(--ez-color-surface-secondary)' : 'var(--ez-color-surface)',
    }}>
      <div
        onClick={() => setOpen(!open)}
        className="dedai-fcard-head"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="dedai-fcard-name">{item.no}. {item.name}</span>
        {STATUS_ICON[item.status]}
        <span className={`dedai-qchip ${prov.className}`} title={t('ai.ded.result.qev_hint_' + prov.kind.replace('-', '_'))}>
          {prov.kind === 'claim' ? t('ai.ded.fullai.qev_claim') : t('ai.ded.result.qev_' + prov.kind.replace('-', '_'))}
        </span>
        <span title={provenanceExplanationForDedSource(p.source)} style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 10,
          background: priceBadge.bg, color: priceBadge.fg, fontWeight: 600,
        }}>
          {priceBadge.text}
        </span>
      </div>

      {open && (
        <div style={{ padding: '0 12px 12px 36px', fontSize: 13, color: 'var(--ez-color-text-body)' }}>
          <div className="dedai-fcard-grid">
            <div>
              <strong>{t('ai.ded.fullai.vol')}</strong>{' '}
              {q.value != null ? `${q.value.toLocaleString('id-ID')} ${q.unit}` : <em>{t('ai.ded.fullai.vol_na')}</em>}
            </div>
            <div>
              <strong>{t('ai.ded.fullai.price')}</strong>{' '}
              {p.unitPrice != null ? `${fmtRp(p.unitPrice)}/${p.unit}` : <em>{t('ai.ded.fullai.price_na')}</em>}
              {' '}
              <span style={{ fontSize: 11, color: priceSrc.color }}>({priceSrc.label})</span>
              {p.ahspCode ? <span style={{ fontSize: 11, color: 'var(--ez-color-text-muted)' }}> · AHSP {p.ahspCode}</span> : null}
            </div>
          </div>

          {/* W6 (§8): penjelasan provenance harga eksplisit — apa arti
              sumber harga ini (asumsi rinci tetap di blok Asumsi /
              Catatan harga / Penyelesaian AI di bawah). */}
          <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--ez-color-text-muted)' }}>
            <strong>{t('ai.ded.result.prov_title')}:</strong> {provenanceExplanationForDedSource(p.source)}
          </div>

          {/* Dasar kuantitas (mockup v2.3 §1): rumus, langkah, dimensi,
              asumsi & catatan AI apa adanya + halaman sumber di bawah.
              Full AI TIDAK menyimpan bukti teks per item (tidak ada
              field-nya di FullAiQuantityDetail) — yang tidak ada tidak
              ditampilkan, bukan dikarang. */}
          <div style={{ fontWeight: 800, fontSize: 11.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ez-color-primary-hover)', marginBottom: 6 }}>
            {t('ai.ded.result.detail_basis')}
          </div>

          {q.formula && (
            <div style={{ marginBottom: 6 }}>
              <strong>{t('ai.ded.result.ev_formula')}:</strong> <code style={{ background: 'var(--ez-color-surface-tertiary)', padding: '2px 6px', borderRadius: 4 }}>{q.formula}</code>
            </div>
          )}

          {q.steps && q.steps.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <strong>{t('ai.ded.fullai.steps')}</strong>
              <ol style={{ margin: '4px 0', paddingLeft: 20 }}>
                {q.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          )}

          {q.dimensions && <div style={{ marginBottom: 6 }}><strong>{t('ai.ded.fullai.dim')}</strong> {q.dimensions}</div>}

          {q.assumptions && q.assumptions.length > 0 && (
            <div style={{ marginBottom: 6, color: 'var(--ez-hue-amber-text-deep)' }}>
              <strong>{t('ai.ded.result.gate_assump_label')}:</strong> {q.assumptions.join('; ')}
            </div>
          )}

          {q.notes && <div style={{ marginBottom: 6 }}><strong>{t('ai.ded.result.ev_note')}:</strong> {q.notes}</div>}

          <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--ez-color-text-muted)' }}>
            <strong>{t('ai.ded.fullai.conf')}</strong> {q.confidence === 'HIGH' ? t('ai.ded.fullai.conf_high') : q.confidence === 'MEDIUM' ? t('ai.ded.fullai.conf_med') : t('ai.ded.fullai.conf_low')}
          </div>

          {!q.formula && !(q.steps && q.steps.length > 0) && !q.dimensions && !(q.assumptions && q.assumptions.length > 0) && !q.notes && (
            <div style={{ marginBottom: 6, color: 'var(--ez-color-text-muted)' }}>{t('ai.ded.result.ev_none')}</div>
          )}

          {p.notes && <div style={{ marginBottom: 6 }}><strong>{t('ai.ded.result.detail_price_note')}:</strong> {p.notes}</div>}

          {/* SPRINT 4 (paritas): blok penyelesaian harga terstruktur —
              bentuk yang sama dengan DedAiResultView pipeline standar. */}
          {pc && (
            <div style={{ marginBottom: 6, background: 'var(--ez-hue-green-bg)', border: '1px solid var(--ez-hue-green-border)', borderRadius: 6, padding: '6px 8px' }}>
              <strong>{t('ai.ded.fullai.comp_title')}</strong>{t('ai.ded.fullai.comp_class_a')}<b>{pc.classification}</b>
              {pc.sourceKind ? <>{t('ai.ded.fullai.comp_kind_a')}{pc.sourceKind}</> : null}
              {' '}{t('ai.ded.fullai.comp_verify_a')}{pc.verificationStatus ?? 'UNVERIFIED'}{t('ai.ded.fullai.comp_approval_a')}{pc.userApprovalStatus ?? '—'}
              {pc.rangeMin != null && pc.rangeMax != null
                ? <>{t('ai.ded.result.comp_range')}{fmtRp(pc.rangeMin)}–{fmtRp(pc.rangeMax)}/{pc.unit}</>
                : null}
              {' '}{t('ai.ded.result.comp_scope')}{pc.scope === 'TERPASANG_PENUH' ? t('ai.ded.result.comp_scope_full') : pc.scope === 'MATERIAL_SAJA' ? t('ai.ded.result.comp_scope_mat') : t('ai.ded.result.comp_scope_na')}
              {pc.region ? <>{t('ai.ded.result.comp_region')}{pc.region}</> : null}
              {pc.sourceName
                ? <><br />{t('ai.ded.result.comp_source')}{pc.sourceUrl
                  ? <a href={pc.sourceUrl} target="_blank" rel="noreferrer">{pc.sourceName}</a>
                  : pc.sourceName}
                  {pc.sourceDate ? <>{t('ai.ded.result.comp_source_date_a')}{pc.sourceDate}{t('ai.ded.result.comp_source_date_b')}{pc.accessedAt}{t('ai.ded.result.comp_source_date_c')}</> : null}</>
                : null}
              {pc.specAssumption ? <><br />{t('ai.ded.result.comp_spec')}{pc.specAssumption}</> : null}
              {pc.quantityBasis ? <><br />{t('ai.ded.result.comp_qty_basis')}{pc.quantityBasis}</> : null}
              {pc.method ? <><br />{t('ai.ded.result.comp_method')}{pc.method}</> : null}
              {pc.sourceStale ? <><br /><b style={{ color: 'var(--ez-hue-amber-text-deep)' }}>{t('ai.ded.result.comp_stale')}</b>{t('ai.ded.result.comp_stale_b')}</> : null}
              {pc.originalUnitPrice != null || pc.originalQuantity != null
                ? <><br />{t('ai.ded.result.comp_orig')}{pc.originalQuantity != null ? `${t('ai.ded.result.comp_orig_qty')}${pc.originalQuantity} ${q.unit}` : ''}{pc.originalUnitPrice != null ? `${t('ai.ded.result.comp_orig_price')}${fmtRp(pc.originalUnitPrice)}/${pc.unit}` : t('ai.ded.fullai.comp_orig_price_empty')}</>
                : null}
              {pc.history && pc.history.length > 0
                ? <><br />{t('ai.ded.result.comp_hist')}{pc.history.map((h) => `${fmtRp(h.unitPrice)} (${h.classification}, ${h.at})`).join(' → ')}</>
                : null}
            </div>
          )}

          {/* SPRINT 4 (paritas): blok audit kuantitas bersama (8 kelas). */}
          {qa && (
            <div style={{ marginBottom: 6, background: 'var(--ez-hue-blue-bg)', border: '1px solid var(--ez-hue-blue-border)', borderRadius: 6, padding: '6px 8px' }}>
              <strong>{t('ai.ded.fullai.audit_title')}</strong>{t('ai.ded.fullai.audit_class_a')}<b>{qa.classification}</b>{t('ai.ded.result.audit_method')}{qa.method}{t('ai.ded.result.audit_conf')}{qa.confidence}{t('ai.ded.result.audit_verify')}{qa.verificationStatus}{t('ai.ded.result.audit_approval')}{qa.userApprovalStatus}
              {qa.formula ? <><br />{t('ai.ded.result.audit_basis')}{qa.formula}</> : null}
              {qa.originalQuantity != null && qa.originalQuantity !== qa.proposedQuantity
                ? <><br />{t('ai.ded.result.audit_orig')}{qa.originalQuantity} {qa.unit}{t('ai.ded.result.audit_proposed')}{qa.proposedQuantity != null ? qa.proposedQuantity : '—'} {qa.unit}</>
                : null}
              {qa.assumptions ? <><br />{t('ai.ded.fullai.audit_assump')}{qa.assumptions}</> : null}
            </div>
          )}

          {/* SPRINT 4 (paritas): persetujuan tercatat — setara
              acceptCompletion/rejectCompletion pipeline standar.
              Terima = menerima nilai usulan; status verifikasi TIDAK
              berubah dan referensi pasar TIDAK menjadi AHSP resmi.
              Tolak memulihkan nilai asli & mencabut blok isian. */}
          {hasPendingCompletion && (
            <div style={{ marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {completionApproved ? (
                <span style={{ fontSize: 12, color: 'var(--ez-hue-green-text-bright)', fontWeight: 600 }}>{t('ai.ded.fullai.comp_accepted_full')}</span>
              ) : (
                <button
                  className="dedai-fcard-mini"
                  onClick={(e) => { e.stopPropagation(); onUpdate(acceptFullAiCompletion(item)); }}
                  style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-green-text-bright)', background: 'var(--ez-hue-green-bg)', color: 'var(--ez-hue-green-text)', cursor: 'pointer' }}
                >
                  {t('ai.ded.result.comp_accept')}
                </button>
              )}
              <button
                className="dedai-fcard-mini"
                onClick={(e) => { e.stopPropagation(); onUpdate(rejectFullAiCompletion(item)); }}
                style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', cursor: 'pointer' }}
              >
                {t('ai.ded.result.comp_reject')}
              </button>
            </div>
          )}

          {item.subtotalDiscrepancy && (
            <div style={{ marginBottom: 6, color: 'var(--ez-hue-amber-text-dark)', background: 'var(--ez-hue-amber-bg)', padding: '6px 8px', borderRadius: 6 }}>
              <strong>{t('ai.ded.fullai.disc_title')}</strong> {item.subtotalDiscrepancy}
              {item.price.source === 'AHSP_2026'
                ? t('ai.ded.fullai.disc_canon')
                : t('ai.ded.fullai.disc_ai')}
              {item.aiProposedSubtotal != null && (
                <>{t('ai.ded.fullai.disc_a')}{fmtRp(item.aiProposedSubtotal)}{t('ai.ded.fullai.disc_b')}{item.subtotal != null ? fmtRp(item.subtotal) : '—'}.</>
              )}
            </div>
          )}

          {item.price.ahspMatch && item.price.ahspMatch.status === 'NEEDS_REVIEW' && item.price.ahspMatch.candidates.length > 0 && (
            <div style={{ marginTop: 8, padding: 10, background: 'var(--ez-hue-amber-bg)', border: '1px solid var(--ez-hue-amber-border)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{allowCanonicalConfirm ? t('ai.ded.fullai.cand_head_confirm') : t('ai.ded.fullai.cand_head_ai')}</div>
              <div style={{ fontSize: 12, color: 'var(--ez-hue-amber-text-dark)', marginBottom: 6 }}>{item.price.ahspMatch.reason}</div>
              {item.price.ahspMatch.candidates.map((c) => (
                <div key={c.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--ez-hue-amber-border)', fontSize: 12 }}>
                  <span><b>{c.code}</b> — {c.name} ({c.unit})
                    {c.priceStatus === 'FULL' && c.canonicalPrice != null ? ` — ${fmtRp(c.canonicalPrice)}/${c.unit}` : c.priceStatus === 'PARTIAL' ? t('ai.ded.result.cand_partial') : c.priceStatus === 'UNPRICED' ? t('ai.ded.result.cand_unpriced') : ''}
                    {!c.unitExact ? t('ai.ded.result.cand_unit_diff') : ''}</span>
                  {allowCanonicalConfirm && (
                    <button
                      className="dedai-fcard-mini"
                      onClick={(e) => { e.stopPropagation(); handleConfirmCandidate(c.code); }}
                      style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--ez-color-primary)', background: 'var(--ez-hue-blue-bg)', color: 'var(--ez-color-primary-hover)', cursor: 'pointer', flexShrink: 0 }}
                    >
                      {t('ai.ded.result.cand_pick')}
                    </button>
                  )}
                </div>
              ))}
              {confirmMsg && <div style={{ color: 'var(--ez-color-danger-strong)', marginTop: 6, fontSize: 12 }}>{confirmMsg}</div>}
            </div>
          )}
          {item.price.ahspMatch && item.price.ahspMatch.status !== 'RESOLVED' && item.price.ahspMatch.status !== 'NEEDS_REVIEW' && (
            <div style={{ marginTop: 8, padding: 10, background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-neutral)', borderRadius: 8, fontSize: 12, color: 'var(--ez-color-text-muted)' }}>
              <strong>AHSP:</strong> {item.price.ahspMatch.reason}
              {item.price.ahspMatch.matchedCode ? `${t('ai.ded.fullai.code_a')}${item.price.ahspMatch.matchedCode}${t('ai.ded.fullai.code_b')}` : ''}
            </div>
          )}

          {item.sourcePages && item.sourcePages.length > 0 && (
            <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--ez-color-text-muted)' }}>
              {t('ai.ded.fullai.src_pages_a')}{item.sourcePages.join(', ')}
            </div>
          )}

          <div className="dedai-fcard-subtotal" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--ez-color-surface-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              <strong>{t('ai.ded.fullai.subtotal')}</strong>{' '}
              <span style={{ fontWeight: 700, color: item.subtotal != null ? 'var(--ez-color-text-primary)' : 'var(--ez-color-text-faint)' }}>
                {fmtRp(item.subtotal)}
              </span>
              {item.subtotal != null && (
                <span style={{ fontSize: 11, color: item.subtotalVerified ? 'var(--ez-hue-green-text-bright)' : 'var(--ez-hue-amber-text-deep)', marginLeft: 8 }}>
                  {item.subtotalVerified ? t('ai.ded.fullai.sub_verified') : t('ai.ded.fullai.sub_unverified')}
                </span>
              )}
              {item.subtotal == null && item.status !== 'UNRESOLVED' && (
                <span style={{ fontSize: 11, color: 'var(--ez-color-text-faint)', marginLeft: 8 }}>
                  {t('ai.ded.fullai.sub_excluded')}{item.exclusionReason ? ` [${item.exclusionReason}]` : ''}
                </span>
              )}
              {isEdited && (
                <span style={{ fontSize: 11, color: 'var(--ez-color-primary)', marginLeft: 8, fontWeight: 600 }}>
                  {t('ai.ded.fullai.edited')}
                </span>
              )}
            </span>
            <div className="dedai-fcard-subtotal-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {item.wbsGroup && (
                <span style={{ fontSize: 11, color: 'var(--ez-color-text-muted)' }}>
                  {item.wbsCode ? `${item.wbsCode} — ` : ''}{item.wbsGroup}
                </span>
              )}
              <button
                className="dedai-fcard-mini"
                onClick={(e) => { e.stopPropagation(); setEditing(!editing); }}
                style={{
                  fontSize: 12, padding: '4px 12px', borderRadius: 6,
                  border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', cursor: 'pointer',
                }}
              >
                {editing ? t('ai.ded.result.modal_batal') : t('ai.ded.fullai.edit_btn')}
              </button>
            </div>
          </div>

          {editing && (
            <div style={{ marginTop: 8, padding: 12, background: 'var(--ez-color-surface-secondary)', borderRadius: 8, border: '1px solid var(--ez-color-border-neutral)' }}>
              <div className="dedai-fcard-editgrid">
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    {t('ai.ded.fullai.edit_vol_a')}{q.unit || 'satuan'}{t('ai.ded.fullai.edit_vol_b')}
                  </label>
                  <input
                    type="number" step="any" min="0"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--ez-color-border-strong)' }}
                    placeholder={t('ai.ded.fullai.edit_qty_ph')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    {t('ai.ded.fullai.edit_price_a')}{p.unit || q.unit || 'satuan'}{t('ai.ded.fullai.edit_price_b')}
                  </label>
                  <input
                    type="number" step="any" min="0"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--ez-color-border-strong)' }}
                    placeholder={t('ai.ded.fullai.edit_price_ph')}
                  />
                </div>
              </div>
              <button
                className="dedai-fcard-save"
                onClick={() => {
                  const newQty = editQty.trim() === '' ? null : parseFloat(editQty);
                  const newPrice = editPrice.trim() === '' ? null : parseFloat(editPrice);
                  const validQty = newQty != null && Number.isFinite(newQty) && newQty >= 0 ? newQty : null;
                  const validPrice = newPrice != null && Number.isFinite(newPrice) && newPrice >= 0 ? newPrice : null;

                  const newSubtotal = (validQty != null && validPrice != null && validQty > 0 && validPrice > 0)
                    ? Math.round(validQty * validPrice) : null;

                  // Tentukan status baru dan alasan eksklusi
                  let newStatus: FullAiItem['status'] = 'READY';
                  let newExclusion: FullAiItem['exclusionReason'] = null;
                  if (validQty == null) { newStatus = 'UNRESOLVED'; newExclusion = 'MISSING_QUANTITY'; }
                  else if (validPrice == null) { newStatus = 'NEEDS_CONFIRMATION'; newExclusion = 'MISSING_UNIT_PRICE'; }

                  const includeInTotal = newStatus === 'READY' && newSubtotal != null && newSubtotal > 0;

                  // Edit kuantitas/harga → usulan AI lama basi, dibersihkan.
                  // SPRINT 4: blok penyelesaian/audit isian AI juga dicabut
                  // — nilai ketikan user adalah USER_PROVIDED, bukan lagi
                  // isian penyelesaian (setara edit pipeline standar yang
                  // mencabut quantityAudit isian).
                  onUpdate(clearAiProposal({
                    ...item,
                    priceCompletion: undefined,
                    quantityAudit: undefined,
                    quantity: {
                      ...item.quantity,
                      value: validQty,
                      // Provenance asli dipertahankan di notes, tapi status jadi USER_INPUT
                      provenance: 'USER_INPUT' as any,
                      quantityAudit: undefined,
                      notes: `${item.quantity.notes || ''} [Diedit user: nilai asli ${item.quantity.value} ${item.quantity.unit} (${item.quantity.provenance})]`.trim(),
                    },
                    price: {
                      ...item.price,
                      unitPrice: validPrice,
                      source: validPrice != null ? 'USER_INPUT' : item.price.source,
                      // Edit harga mengganti harga itu sendiri: kode + match
                      // kanonis lama TIDAK boleh bertahan (nanti tampil
                      // "AHSP 3.7.4" dan masuk catatan finalisasi untuk
                      // harga yang bukan lagi harga kanonis).
                      ahspCode: undefined,
                      ahspMatch: undefined,
                      filledFromExternalRef: undefined,
                      priceCompletion: undefined,
                      notes: validPrice != null
                        ? `${item.price.notes || ''} [Diedit user: harga asli ${item.price.unitPrice} (${item.price.source})]`.trim()
                        : item.price.notes,
                    },
                    subtotal: includeInTotal ? newSubtotal : null,
                    // Subtotal hasil edit dihitung aplikasi dari volume × harga
                    // yang terisi — terverifikasi hanya bila benar-benar terhitung.
                    subtotalVerified: includeInTotal && newSubtotal != null,
                    status: includeInTotal ? 'READY' : newStatus,
                    exclusionReason: includeInTotal ? null : newExclusion,
                  }));
                  setEditing(false);
                }}
                style={{
                  padding: '8px 20px', borderRadius: 6, border: 'none',
                  background: 'var(--ez-color-primary)', color: '#fff', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t('ai.ded.fullai.save_changes')}
              </button>
              <div style={{ fontSize: 11, color: 'var(--ez-color-text-muted)', marginTop: 8 }}>
                {t('ai.ded.fullai.edit_note')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const FullAiResultView: React.FC<Props> = ({ output, onFinalize, onSaveDraft, draftSaved = false, onSendToChat, onBack, embedded = false }) => {
  const { t } = useI18n();
  const [finalizing, setFinalizing] = useState(false);
  const [finalMsg, setFinalMsg] = useState('');
  const [items, setItems] = useState<FullAiItem[]>(output.items);
  // Gerbang review (mockup v2.3 §2): centang per item tinjau — state
  // lokal view ini saja. TIDAK ADA "tandai semua" (keputusan owner
  // no. 3 masih terbuka — default fail-closed). openRequest membuka
  // kartu yang ditunjuk tombol "Lihat" di gerbang.
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [openRequest, setOpenRequest] = useState<{ id: string; n: number } | null>(null);

  // §7 (G-IS-3): mode dual diturunkan dari policy hasil lewat
  // modeFromPolicy (REKONSILIASI: mesin-menang — view ini selalu
  // menampilkan hasil mesin Full AI sehingga modenya FULL_AI) dan
  // diteruskan ke kartu item agar konfirmasi kandidat AHSP tunduk
  // pada gerbang isolasi.
  const rabMode = modeFromPolicy(output.policy);

  // Hitung ulang summary & total saat item diedit
  const handleItemUpdate = (updated: FullAiItem) => {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
  };

  // ---- Gerbang review: daftar tinjau diturunkan dari items SAAT INI
  // (edit user otomatis mengubah daftar — item yang diedit menjadi
  // Input user keluar dari gerbang dengan sendirinya). ----
  const gateItems = useMemo(() => reviewGateItemsForFullAi(items), [items]);
  const gateSummary = useMemo(() => reviewGateSummary(gateItems), [gateItems]);
  const gateCheckedCount = reviewedCount(gateItems, reviewed);
  const gateComplete = isReviewGateComplete(gateItems, reviewed);
  const savableCount = useMemo(() => countSavableFullAi(items), [items]);
  const gateAllowsFinalize = canFinalizeWithGate({ gateItems, checkedIds: reviewed, savableCount });

  const toggleReviewed = (id: string) => {
    setReviewed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  // "Lihat" di gerbang: buka kartu item + scroll ke kartunya.
  const viewGateItem = (id: string) => {
    setOpenRequest({ id, n: Date.now() });
    window.setTimeout(() => {
      document.getElementById(`fullai-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  const grandTotal = items
    .filter((it) => it.subtotal != null && it.subtotal > 0)
    .reduce((sum, it) => sum + (it.subtotal || 0), 0);

  // Total usulan AI dihitung LANGSUNG dari item saat ini (bukan dari prop
  // output yang bisa basi sesudah edit — edit membersihkan usulan item).
  const proposedGrandTotalLive = items
    .map((it) => it.aiProposedSubtotal)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    .reduce((a, b) => a + b, 0);
  const hasCanonicalSubstitution = items.some(
    (it) => it.price.source === 'AHSP_2026' && it.aiProposedSubtotal != null
  );

  const s = {
    totalItems: items.length,
    itemsWithQuantity: items.filter((it) => it.quantity.value != null).length,
    itemsWithAssumption: items.filter((it) => it.quantity.provenance === 'ASSUMPTION').length,
    itemsNeedConfirmation: items.filter((it) => it.status === 'NEEDS_CONFIRMATION').length,
    itemsWithAiPrice: items.filter((it) => it.price.source === 'AI_ESTIMATE').length,
    itemsWithCanonicalPrice: items.filter((it) => it.price.source === 'AHSP_2026').length,
    itemsWithVerifiedPrice: items.filter((it) => it.price.source === 'VERIFIED_SOURCE').length,
    itemsNeedAhspReview: items.filter((it) => it.price.ahspMatch?.status === 'NEEDS_REVIEW').length,
    itemsAhspIncomplete: items.filter((it) => it.price.ahspMatch?.status === 'INCOMPLETE_COMPONENTS').length,
    itemsUnresolved: items.filter((it) => it.status === 'UNRESOLVED').length,
    excludedFromTotal: items.filter((it) => it.subtotal == null).length,
  };

  const handleFinalize = async () => {
    // Pertahanan lapis kedua: tombol sudah disabled saat gerbang belum
    // lengkap, tapi handler WAJIB memeriksa lagi sebelum memanggil
    // onFinalize (disable saja tidak cukup). Validator fail-closed di
    // handler (dedFinalizeValidation) tetap menjadi gerbang akhir.
    if (!gateComplete) {
      setFinalMsg(t('ai.ded.fullai.final_locked_a') + (gateItems.length - gateCheckedCount) + t('ai.ded.fullai.final_locked_b'));
      return;
    }
    if (!gateAllowsFinalize) {
      setFinalMsg(t('ai.ded.fullai.final_none'));
      return;
    }
    setFinalizing(true);
    setFinalMsg('');
    const savable = items.filter(
      (it) => it.status === 'READY' && it.subtotal != null && it.subtotal > 0
    );
    const res = await onFinalize(savable);
    setFinalMsg(res.message);
    setFinalizing(false);
  };

  // Kelompokkan per WBS. Bila model tidak mengisi wbsGroup, pakai label
  // kategori asli item (bukan "Lain-lain" generik) agar kategori model
  // tetap terlihat — "Lain-lain" hanya bila keduanya kosong.
  const groups = new Map<string, FullAiItem[]>();
  for (const it of items) {
    const key = it.wbsGroup || it.category || t('ai.ded.fullai.group_other');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  return (
    <div className="dedai" style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={onBack} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--ez-color-border-neutral)', cursor: 'pointer', minHeight: 44 }}>
            {t('ai.ded.fullai.back')}
          </button>
          <h1 style={{ margin: 0, fontSize: 20 }}>{t('ai.ded.fullai.title')}</h1>
          <span style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 12,
            background: 'var(--ez-hue-violet-bg)', color: 'var(--ez-hue-violet-text)', fontWeight: 700,
          }}>
            {output.mode === 'FAST' ? t('ai.ded.input.mode_fast') : t('ai.ded.input.mode_deep')} •{' '}
            {output.provenance.provider && output.provenance.model
              ? `${output.provenance.provider} / ${output.provenance.model}`
              : output.provenance.model || t('ai.ded.fullai.model_unknown')}
          </span>
        </div>
      )}

      {/* ---- Banner mode kanonis (F3-1: cabang pada rabMode — mode
           kanonis mesin-menang, diturunkan :506 via modeFromPolicy —
           bukan policy mentah; konsisten dengan chip shell view.tsx:887.
           View ini selalu menampilkan hasil mesin Full AI sehingga
           rabMode selalu FULL_AI; cabang EZRAB di bawah dipertahankan
           agar bila aturan migrasi di dedMode.ts kelak memakai policy,
           banner ini ikut tanpa perubahan) ---- */}
      {(() => {
        const canonNote = s.itemsWithCanonicalPrice > 0 ? ` ${s.itemsWithCanonicalPrice}${t('ai.ded.result.banner_full_canon_a')}` : '';
        const reviewNote = s.itemsNeedAhspReview > 0 ? ` ${s.itemsNeedAhspReview}${t('ai.ded.result.banner_full_review_a')}` : '';
        const incompleteNote = s.itemsAhspIncomplete > 0 ? ` ${s.itemsAhspIncomplete}${t('ai.ded.result.banner_full_incomplete_a')}` : '';
        return rabMode === 'FULL_AI' ? (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--ez-hue-amber-bg)', border: '1px solid var(--ez-hue-amber-border)', fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>
            <b>Mode: FULL AI MODE.</b> {s.itemsWithAiPrice}{t('ai.ded.result.banner_full_a')}{canonNote}{reviewNote}{incompleteNote}{s.excludedFromTotal > 0 ? ` ${s.excludedFromTotal}${t('ai.ded.fullai.banner_excluded_a')}` : ''}{t('ai.ded.result.banner_full_b')}
          </div>
        ) : (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--ez-hue-blue-bg)', border: '1px solid var(--ez-hue-blue-border)', fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>
            <b>Mode: EZRAB AI MODE.</b>{t('ai.ded.fullai.banner_ez_lead')}{s.itemsWithCanonicalPrice}{t('ai.ded.result.banner_ez_b')}{s.itemsWithAiPrice}{t('ai.ded.result.banner_ez_c')}{s.itemsUnresolved}{t('ai.ded.fullai.banner_ez_unavail_a')}{s.excludedFromTotal}{t('ai.ded.fullai.banner_ez_excl')}{reviewNote}{incompleteNote}{t('ai.ded.fullai.banner_ez_tail')}<b>{t('ai.ded.result.banner_ez_partial')}</b>{t('ai.ded.fullai.banner_ez_tail_b')}
          </div>
        );
      })()}

      {output.error ? (
        <div style={{ padding: 24, background: 'var(--ez-hue-rose-bg)', borderRadius: 8, border: '1px solid var(--ez-hue-rose-border)' }}>
          <h3 style={{ color: 'var(--ez-color-danger-strong)', margin: '0 0 8px' }}>{t('ai.ded.fullai.err_title')}</h3>
          <p>{output.error.message}</p>
          <p style={{ fontSize: 12, color: 'var(--ez-color-text-muted)' }}>{t('ai.ded.fullai.err_code')}{output.error.code}</p>
          {output.error.retryable && <p style={{ fontSize: 13 }}>{t('ai.ded.fullai.err_retry')}</p>}
        </div>
      ) : (
        <>
          {/* Ringkasan */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 8, marginBottom: 16,
          }}>
            {[
              [t('ai.ded.fullai.sum_total'), s.totalItems],
              [t('ai.ded.fullai.sum_volume'), s.itemsWithQuantity],
              [t('ai.ded.fullai.sum_assump'), s.itemsWithAssumption],
              [t('ai.ded.fullai.sum_confirm'), s.itemsNeedConfirmation],
              [t('ai.ded.fullai.sum_ai_price'), s.itemsWithAiPrice],
              [t('ai.ded.fullai.sum_canon_price'), s.itemsWithCanonicalPrice],
              [t('ai.ded.fullai.sum_verified_price'), s.itemsWithVerifiedPrice],
              [t('ai.ded.fullai.sum_ahsp_review'), s.itemsNeedAhspReview],
              [t('ai.ded.fullai.sum_unresolved'), s.itemsUnresolved],
              [t('ai.ded.fullai.sum_excluded'), s.excludedFromTotal],
            ].map(([label, val]) => (
              <div key={label as string} style={{
                padding: 12, background: 'var(--ez-color-surface-secondary)', borderRadius: 8,
                border: '1px solid var(--ez-color-border-neutral)', textAlign: 'center',
              }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{val}</div>
                <div style={{ fontSize: 11, color: 'var(--ez-color-text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Info proyek */}
          {output.projectInfo.scopeSummary && (
            <div style={{ padding: 12, background: 'var(--ez-hue-blue-bg)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              <strong>{t('ai.ded.fullai.proj_summary')}</strong> {output.projectInfo.scopeSummary}
              {output.projectInfo.missingInfo && output.projectInfo.missingInfo.length > 0 && (
                <div style={{ marginTop: 6, color: 'var(--ez-hue-amber-text-deep)' }}>
                  <strong>{t('ai.ded.fullai.proj_missing')}</strong> {output.projectInfo.missingInfo.join('; ')}
                </div>
              )}
            </div>
          )}

          {/* Warnings */}
          {output.warnings.length > 0 && (
            <div style={{ padding: 12, background: 'var(--ez-hue-amber-bg)', borderRadius: 8, marginBottom: 16, fontSize: 13, border: '1px solid var(--ez-hue-amber-border)' }}>
              <strong>{t('ai.ded.fullai.warn_title')}</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                {output.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* Items per WBS */}
          {Array.from(groups.entries()).map(([groupName, items]) => {
            const groupTotal = items.reduce((sum, it) => sum + (it.subtotal || 0), 0);
            return (
              <div key={groupName} style={{ marginBottom: 20 }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  flexWrap: 'wrap', gap: 8,
                  padding: '8px 12px', background: 'var(--ez-color-surface-tertiary)', borderRadius: 8, marginBottom: 8,
                }}>
                  <strong>{groupName}</strong>
                  <span style={{ fontWeight: 700 }}>{fmtRp(groupTotal)}</span>
                </div>
                {items.map((it) => <ItemCard key={it.id} item={it} onUpdate={handleItemUpdate} rabMode={rabMode} openRequest={openRequest} />)}
              </div>
            );
          })}

          {/* ---- Gerbang review sebelum finalisasi (mockup v2.3 §2) ----
              Lapisan TAMBAHAN di atas validasi fail-closed: finalisasi
              terkunci sampai semua item tinjau dicentang satu per satu.
              TIDAK ADA tombol "tandai semua" (keputusan owner no. 3
              masih terbuka — default fail-closed). Di mode Full AI,
              padanan AHSP tidak bisa dipilih (keputusan 5) — gerbang
              hanya meminta pengakuan harga Estimasi AI. ---- */}
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
                <p className="dedai-gate-note">{t('ai.ded.fullai.gate_note')}</p>
              </>
            )}
          </div>

          {/* Grand Total */}
          <div className="dedai-ftotal" style={{
            padding: 16, background: '#111827', color: '#fff', borderRadius: 8,
            marginBottom: 16,
          }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>{t('ai.ded.fullai.grand_title')}</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtRp(grandTotal)}</div>
              <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 4 }}>
                {t('ai.ded.fullai.grand_assump_a')}{s.itemsWithAssumption}{t('ai.ded.fullai.grand_assump_b')}
              </div>
              {s.excludedFromTotal > 0 && (
                <div style={{ fontSize: 12, color: '#fbbf24', marginTop: 4 }}>
                  {t('ai.ded.fullai.grand_excl_a')}{s.excludedFromTotal}{t('ai.ded.fullai.grand_excl_b')}
                </div>
              )}
              {proposedGrandTotalLive > 0 && Math.round(proposedGrandTotalLive) !== Math.round(grandTotal) && (
                <div style={{ fontSize: 12, color: '#fbbf24', marginTop: 4 }}>
                  {t('ai.ded.result.proposed_a')}{fmtRp(proposedGrandTotalLive)}{t('ai.ded.result.proposed_b')}
                  {hasCanonicalSubstitution
                    ? t('ai.ded.fullai.proposed_canon')
                    : t('ai.ded.fullai.proposed_ai')}
                </div>
              )}
            </div>
            <div className="dedai-ftotal-btns" style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
              {onSaveDraft && (
                <button
                  onClick={() => onSaveDraft(items)}
                  className="dedai-ftotal-btn"
                  style={{
                    padding: '12px 24px', borderRadius: 8, border: '1px solid #4b5563',
                    background: 'transparent', color: '#fff', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {draftSaved ? t('ai.ded.result.act_saved_draft') : t('ai.ded.result.act_save_draft')}
                </button>
              )}
              {/* G-UI-3 (§3) — kirim hasil Full AI ke Chat AI (sejajar DedAiResultView). */}
              {onSendToChat && (
                <button
                  onClick={() => onSendToChat(items)}
                  className="dedai-ftotal-btn"
                  style={{
                    padding: '12px 24px', borderRadius: 8, border: '1px solid #4b5563',
                    background: 'transparent', color: '#fff', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <MessageSquare size={16} /> {t('ai.ded.result.send_chat')}
                </button>
              )}
              <button
                onClick={handleFinalize}
                disabled={finalizing || !gateComplete}
                title={!gateComplete ? t('ai.ded.result.finalize_locked_a') + (gateItems.length - gateCheckedCount) + t('ai.ded.result.finalize_locked_b') : undefined}
                className="dedai-ftotal-btn"
                style={{
                  padding: '12px 24px', borderRadius: 8, border: 'none',
                  background: '#7C3AED', color: '#fff', fontWeight: 600, cursor: 'pointer',
                  opacity: (finalizing || !gateComplete) ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {!gateComplete && !finalizing && <Lock size={16} />}
                {finalizing ? t('ai.ded.result.act_finalizing') : t('ai.ded.fullai.finalize_btn')}
              </button>
            </div>
          </div>

          {finalMsg && (
            <div style={{ padding: 12, background: 'var(--ez-hue-green-bg)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              {finalMsg}
            </div>
          )}
        </>
      )}
    </div>
  );
};
