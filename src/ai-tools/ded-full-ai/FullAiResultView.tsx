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
      setConfirmMsg('Konfirmasi padanan AHSP tidak tersedia di mode Full AI — mode ini tidak mengakses katalog AHSP. Kandidat di bawah adalah usulan AI saja.');
      return;
    }
    const resolved = resolveCanonicalCode(code, item.quantity.unit);
    if (resolved.status !== 'RESOLVED' || resolved.unitPrice == null) {
      setConfirmMsg(`Kandidat ${code} tidak bisa dipakai: ${resolved.reason}`);
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
        <span className={`dedai-qchip ${prov.className}`} title={prov.hint}>
          {prov.label}
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
              <strong>Volume:</strong>{' '}
              {q.value != null ? `${q.value.toLocaleString('id-ID')} ${q.unit}` : <em>belum jelas</em>}
            </div>
            <div>
              <strong>Harga:</strong>{' '}
              {p.unitPrice != null ? `${fmtRp(p.unitPrice)}/${p.unit}` : <em>belum ada</em>}
              {' '}
              <span style={{ fontSize: 11, color: priceSrc.color }}>({priceSrc.label})</span>
              {p.ahspCode ? <span style={{ fontSize: 11, color: 'var(--ez-color-text-muted)' }}> · AHSP {p.ahspCode}</span> : null}
            </div>
          </div>

          {/* W6 (§8): penjelasan provenance harga eksplisit — apa arti
              sumber harga ini (asumsi rinci tetap di blok Asumsi /
              Catatan harga / Penyelesaian AI di bawah). */}
          <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--ez-color-text-muted)' }}>
            <strong>Provenans harga:</strong> {provenanceExplanationForDedSource(p.source)}
          </div>

          {/* Dasar kuantitas (mockup v2.3 §1): rumus, langkah, dimensi,
              asumsi & catatan AI apa adanya + halaman sumber di bawah.
              Full AI TIDAK menyimpan bukti teks per item (tidak ada
              field-nya di FullAiQuantityDetail) — yang tidak ada tidak
              ditampilkan, bukan dikarang. */}
          <div style={{ fontWeight: 800, fontSize: 11.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ez-color-primary-hover)', marginBottom: 6 }}>
            Dasar kuantitas
          </div>

          {q.formula && (
            <div style={{ marginBottom: 6 }}>
              <strong>Rumus:</strong> <code style={{ background: 'var(--ez-color-surface-tertiary)', padding: '2px 6px', borderRadius: 4 }}>{q.formula}</code>
            </div>
          )}

          {q.steps && q.steps.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <strong>Langkah:</strong>
              <ol style={{ margin: '4px 0', paddingLeft: 20 }}>
                {q.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          )}

          {q.dimensions && <div style={{ marginBottom: 6 }}><strong>Dimensi:</strong> {q.dimensions}</div>}

          {q.assumptions && q.assumptions.length > 0 && (
            <div style={{ marginBottom: 6, color: 'var(--ez-hue-amber-text-deep)' }}>
              <strong>Asumsi:</strong> {q.assumptions.join('; ')}
            </div>
          )}

          {q.notes && <div style={{ marginBottom: 6 }}><strong>Catatan:</strong> {q.notes}</div>}

          <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--ez-color-text-muted)' }}>
            <strong>Keyakinan AI:</strong> {q.confidence === 'HIGH' ? 'tinggi' : q.confidence === 'MEDIUM' ? 'sedang' : 'rendah'}
          </div>

          {!q.formula && !(q.steps && q.steps.length > 0) && !q.dimensions && !(q.assumptions && q.assumptions.length > 0) && !q.notes && (
            <div style={{ marginBottom: 6, color: 'var(--ez-color-text-muted)' }}>Tidak ada dasar kuantitas tersimpan untuk item ini.</div>
          )}

          {p.notes && <div style={{ marginBottom: 6 }}><strong>Catatan harga:</strong> {p.notes}</div>}

          {/* SPRINT 4 (paritas): blok penyelesaian harga terstruktur —
              bentuk yang sama dengan DedAiResultView pipeline standar. */}
          {pc && (
            <div style={{ marginBottom: 6, background: 'var(--ez-hue-green-bg)', border: '1px solid var(--ez-hue-green-border)', borderRadius: 6, padding: '6px 8px' }}>
              <strong>Penyelesaian AI:</strong> klasifikasi <b>{pc.classification}</b>
              {pc.sourceKind ? <> · jenis sumber {pc.sourceKind}</> : null}
              {' '}· verifikasi {pc.verificationStatus ?? 'UNVERIFIED'} · persetujuan {pc.userApprovalStatus ?? '—'}
              {pc.rangeMin != null && pc.rangeMax != null
                ? <> · rentang referensi {fmtRp(pc.rangeMin)}–{fmtRp(pc.rangeMax)}/{pc.unit}</>
                : null}
              {' '}· cakupan {pc.scope === 'TERPASANG_PENUH' ? 'terpasang penuh' : pc.scope === 'MATERIAL_SAJA' ? 'material saja' : 'tidak dinyatakan'}
              {pc.region ? <> · wilayah {pc.region}</> : null}
              {pc.sourceName
                ? <><br />Sumber: {pc.sourceUrl
                  ? <a href={pc.sourceUrl} target="_blank" rel="noreferrer">{pc.sourceName}</a>
                  : pc.sourceName}
                  {pc.sourceDate ? <> (data {pc.sourceDate}, diambil {pc.accessedAt})</> : null}</>
                : null}
              {pc.specAssumption ? <><br />Asumsi spek: {pc.specAssumption}</> : null}
              {pc.quantityBasis ? <><br />Dasar kuantitas: {pc.quantityBasis}</> : null}
              {pc.method ? <><br />Metode: {pc.method}</> : null}
              {pc.sourceStale ? <><br /><b style={{ color: 'var(--ez-hue-amber-text-deep)' }}>Sumber BASI</b> (melewati masa segar 30 hari) — keyakinan diturunkan.</> : null}
              {pc.originalUnitPrice != null || pc.originalQuantity != null
                ? <><br />Nilai asli sebelum penyelesaian: {pc.originalQuantity != null ? `kuantitas ${pc.originalQuantity} ${q.unit}` : ''}{pc.originalUnitPrice != null ? ` · harga ${fmtRp(pc.originalUnitPrice)}/${pc.unit}` : ' · harga kosong'}</>
                : null}
              {pc.history && pc.history.length > 0
                ? <><br />Riwayat: {pc.history.map((h) => `${fmtRp(h.unitPrice)} (${h.classification}, ${h.at})`).join(' → ')}</>
                : null}
            </div>
          )}

          {/* SPRINT 4 (paritas): blok audit kuantitas bersama (8 kelas). */}
          {qa && (
            <div style={{ marginBottom: 6, background: 'var(--ez-hue-blue-bg)', border: '1px solid var(--ez-hue-blue-border)', borderRadius: 6, padding: '6px 8px' }}>
              <strong>Audit Kuantitas:</strong> kelas <b>{qa.classification}</b> · metode {qa.method} · keyakinan {qa.confidence} · verifikasi {qa.verificationStatus} · persetujuan {qa.userApprovalStatus}
              {qa.formula ? <><br />Dasar: {qa.formula}</> : null}
              {qa.originalQuantity != null && qa.originalQuantity !== qa.proposedQuantity
                ? <><br />Kuantitas asli: {qa.originalQuantity} {qa.unit} → usulan {qa.proposedQuantity != null ? qa.proposedQuantity : '—'} {qa.unit}</>
                : null}
              {qa.assumptions ? <><br />Asumsi: {qa.assumptions}</> : null}
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
                <span style={{ fontSize: 12, color: 'var(--ez-hue-green-text-bright)', fontWeight: 600 }}>✓ Penyelesaian diterima pengguna — termasuk total berlabel estimasi (verifikasi tidak berubah).</span>
              ) : (
                <button
                  className="dedai-fcard-mini"
                  onClick={(e) => { e.stopPropagation(); onUpdate(acceptFullAiCompletion(item)); }}
                  style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-green-text-bright)', background: 'var(--ez-hue-green-bg)', color: 'var(--ez-hue-green-text)', cursor: 'pointer' }}
                >
                  Terima penyelesaian ini
                </button>
              )}
              <button
                className="dedai-fcard-mini"
                onClick={(e) => { e.stopPropagation(); onUpdate(rejectFullAiCompletion(item)); }}
                style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', cursor: 'pointer' }}
              >
                Tolak penyelesaian — kembalikan seperti semula
              </button>
            </div>
          )}

          {item.subtotalDiscrepancy && (
            <div style={{ marginBottom: 6, color: 'var(--ez-hue-amber-text-dark)', background: 'var(--ez-hue-amber-bg)', padding: '6px 8px', borderRadius: 6 }}>
              <strong>Selisih usulan AI:</strong> {item.subtotalDiscrepancy}
              {item.price.source === 'AHSP_2026'
                ? ' Selisih ini kemungkinan karena harga kanonis menggantikan estimasi AI, bukan semata kesalahan hitung AI.'
                : ' Selisih ini adalah perbedaan hitung AI atas subtotal ini.'}
              {item.aiProposedSubtotal != null && (
                <> Usulan AI: {fmtRp(item.aiProposedSubtotal)}; terverifikasi aplikasi: {item.subtotal != null ? fmtRp(item.subtotal) : '—'}.</>
              )}
            </div>
          )}

          {item.price.ahspMatch && item.price.ahspMatch.status === 'NEEDS_REVIEW' && item.price.ahspMatch.candidates.length > 0 && (
            <div style={{ marginTop: 8, padding: 10, background: 'var(--ez-hue-amber-bg)', border: '1px solid var(--ez-hue-amber-border)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{allowCanonicalConfirm ? 'Padanan AHSP menunggu konfirmasi — pilih satu (tidak ada yang dipilih otomatis):' : 'Usulan padanan AHSP dari AI — belum dikonfirmasi (mode Full AI tidak mengakses katalog AHSP). Akui harga Estimasi AI lewat daftar tinjau di bawah, atau jalankan ulang di mode EZRAB AI untuk mengonfirmasi harga kanonis.'}</div>
              <div style={{ fontSize: 12, color: 'var(--ez-hue-amber-text-dark)', marginBottom: 6 }}>{item.price.ahspMatch.reason}</div>
              {item.price.ahspMatch.candidates.map((c) => (
                <div key={c.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--ez-hue-amber-border)', fontSize: 12 }}>
                  <span><b>{c.code}</b> — {c.name} ({c.unit})
                    {c.priceStatus === 'FULL' && c.canonicalPrice != null ? ` — ${fmtRp(c.canonicalPrice)}/${c.unit}` : c.priceStatus === 'PARTIAL' ? ' — komponen belum lengkap' : c.priceStatus === 'UNPRICED' ? ' — tanpa rincian komponen' : ''}
                    {!c.unitExact ? ' — satuan berbeda' : ''}</span>
                  {allowCanonicalConfirm && (
                    <button
                      className="dedai-fcard-mini"
                      onClick={(e) => { e.stopPropagation(); handleConfirmCandidate(c.code); }}
                      style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--ez-color-primary)', background: 'var(--ez-hue-blue-bg)', color: 'var(--ez-color-primary-hover)', cursor: 'pointer', flexShrink: 0 }}
                    >
                      Pilih
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
              {item.price.ahspMatch.matchedCode ? ` (kode: ${item.price.ahspMatch.matchedCode})` : ''}
            </div>
          )}

          {item.sourcePages && item.sourcePages.length > 0 && (
            <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--ez-color-text-muted)' }}>
              Sumber: halaman {item.sourcePages.join(', ')}
            </div>
          )}

          <div className="dedai-fcard-subtotal" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--ez-color-surface-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              <strong>Subtotal:</strong>{' '}
              <span style={{ fontWeight: 700, color: item.subtotal != null ? 'var(--ez-color-text-primary)' : 'var(--ez-color-text-faint)' }}>
                {fmtRp(item.subtotal)}
              </span>
              {item.subtotal != null && (
                <span style={{ fontSize: 11, color: item.subtotalVerified ? 'var(--ez-hue-green-text-bright)' : 'var(--ez-hue-amber-text-deep)', marginLeft: 8 }}>
                  {item.subtotalVerified ? '✓ terverifikasi (volume × harga)' : 'belum terverifikasi'}
                </span>
              )}
              {item.subtotal == null && item.status !== 'UNRESOLVED' && (
                <span style={{ fontSize: 11, color: 'var(--ez-color-text-faint)', marginLeft: 8 }}>
                  tidak masuk total{item.exclusionReason ? ` [${item.exclusionReason}]` : ''}
                </span>
              )}
              {isEdited && (
                <span style={{ fontSize: 11, color: 'var(--ez-color-primary)', marginLeft: 8, fontWeight: 600 }}>
                  ✏️ diedit user
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
                {editing ? 'Batal' : 'Edit'}
              </button>
            </div>
          </div>

          {editing && (
            <div style={{ marginTop: 8, padding: 12, background: 'var(--ez-color-surface-secondary)', borderRadius: 8, border: '1px solid var(--ez-color-border-neutral)' }}>
              <div className="dedai-fcard-editgrid">
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Volume ({q.unit || 'satuan'})
                  </label>
                  <input
                    type="number" step="any" min="0"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--ez-color-border-strong)' }}
                    placeholder="Kosongkan jika belum jelas"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Harga Satuan (Rp/{p.unit || q.unit || 'satuan'})
                  </label>
                  <input
                    type="number" step="any" min="0"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--ez-color-border-strong)' }}
                    placeholder="Kosongkan jika belum ada"
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
                Simpan Perubahan
              </button>
              <div style={{ fontSize: 11, color: 'var(--ez-color-text-muted)', marginTop: 8 }}>
                Perubahan ditandai sebagai input user. Nilai asli AI tetap tercatat di catatan.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const FullAiResultView: React.FC<Props> = ({ output, onFinalize, onSaveDraft, draftSaved = false, onSendToChat, onBack, embedded = false }) => {
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
      setFinalMsg(`Finalisasi terkunci: masih ada ${gateItems.length - gateCheckedCount} item yang belum ditinjau di daftar tinjau di bawah.`);
      return;
    }
    if (!gateAllowsFinalize) {
      setFinalMsg('Tidak ada item yang bisa difinalisasi — semua item belum lengkap (tanpa kuantitas/harga).');
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
    const key = it.wbsGroup || it.category || 'Lain-lain';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  return (
    <div className="dedai" style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={onBack} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--ez-color-border-neutral)', cursor: 'pointer', minHeight: 44 }}>
            ← Kembali
          </button>
          <h1 style={{ margin: 0, fontSize: 20 }}>Hasil FULL AI MODE</h1>
          <span style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 12,
            background: 'var(--ez-hue-violet-bg)', color: 'var(--ez-hue-violet-text)', fontWeight: 700,
          }}>
            {output.mode === 'FAST' ? 'Cepat' : 'Mendalam'} •{' '}
            {output.provenance.provider && output.provenance.model
              ? `${output.provenance.provider} / ${output.provenance.model}`
              : output.provenance.model || 'Model tidak diketahui'}
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
        const canonNote = s.itemsWithCanonicalPrice > 0 ? ` ${s.itemsWithCanonicalPrice} item memakai harga AHSP kanonis (SE 47/2026, biaya langsung).` : '';
        const reviewNote = s.itemsNeedAhspReview > 0 ? ` ${s.itemsNeedAhspReview} item menunggu konfirmasi padanan AHSP.` : '';
        const incompleteNote = s.itemsAhspIncomplete > 0 ? ` ${s.itemsAhspIncomplete} item AHSP-nya belum lengkap komponennya.` : '';
        return rabMode === 'FULL_AI' ? (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--ez-hue-amber-bg)', border: '1px solid var(--ez-hue-amber-border)', fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>
            <b>Mode: FULL AI MODE.</b> {s.itemsWithAiPrice} item memakai harga estimasi AI (AI_ESTIMATE) — bukan harga resmi AHSP.{canonNote}{reviewNote}{incompleteNote} {s.excludedFromTotal} item dikecualikan dari total. Periksa dan validasi sebelum RAB dipakai untuk pengadaan, tender, atau kontrak.
          </div>
        ) : (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--ez-hue-blue-bg)', border: '1px solid var(--ez-hue-blue-border)', fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>
            <b>Mode: EZRAB AI MODE.</b> Harga diutamakan dari AHSP kanonis — {s.itemsWithCanonicalPrice} item teratasi dari AHSP kanonis, {s.itemsWithAiPrice} item memakai estimasi AI berlabel sebagai fallback karena tidak ada di database (bukan harga database), {s.itemsUnresolved} item belum tersedia, {s.excludedFromTotal} item dikecualikan dari total.{reviewNote}{incompleteNote} Total di bawah bersifat <b>parsial</b> sampai harga yang hilang dilengkapi.
          </div>
        );
      })()}

      {output.error ? (
        <div style={{ padding: 24, background: 'var(--ez-hue-rose-bg)', borderRadius: 8, border: '1px solid var(--ez-hue-rose-border)' }}>
          <h3 style={{ color: 'var(--ez-color-danger-strong)', margin: '0 0 8px' }}>Analisis Gagal</h3>
          <p>{output.error.message}</p>
          <p style={{ fontSize: 12, color: 'var(--ez-color-text-muted)' }}>Kode: {output.error.code}</p>
          {output.error.retryable && <p style={{ fontSize: 13 }}>Silakan coba lagi.</p>}
        </div>
      ) : (
        <>
          {/* Ringkasan */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 8, marginBottom: 16,
          }}>
            {[
              ['Total Item', s.totalItems],
              ['Ada Volume', s.itemsWithQuantity],
              ['Asumsi', s.itemsWithAssumption],
              ['Perlu Konfirmasi', s.itemsNeedConfirmation],
              ['Harga Estimasi AI', s.itemsWithAiPrice],
              ['Harga AHSP Kanonis', s.itemsWithCanonicalPrice],
              ['Harga Terverifikasi (lama)', s.itemsWithVerifiedPrice],
              ['Perlu Konfirmasi AHSP', s.itemsNeedAhspReview],
              ['Belum Jelas', s.itemsUnresolved],
              ['Dikecualikan', s.excludedFromTotal],
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
              <strong>Ringkasan Proyek:</strong> {output.projectInfo.scopeSummary}
              {output.projectInfo.missingInfo && output.projectInfo.missingInfo.length > 0 && (
                <div style={{ marginTop: 6, color: 'var(--ez-hue-amber-text-deep)' }}>
                  <strong>Info hilang:</strong> {output.projectInfo.missingInfo.join('; ')}
                </div>
              )}
            </div>
          )}

          {/* Warnings */}
          {output.warnings.length > 0 && (
            <div style={{ padding: 12, background: 'var(--ez-hue-amber-bg)', borderRadius: 8, marginBottom: 16, fontSize: 13, border: '1px solid var(--ez-hue-amber-border)' }}>
              <strong>⚠️ Perhatian:</strong>
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
                <p className="dedai-gate-note">Centang satu per satu sesudah memeriksa dasarnya di detail kartu. Item “Klaim: dari DED” dan “Input user” tidak masuk daftar ini.</p>
              </>
            )}
          </div>

          {/* Grand Total */}
          <div className="dedai-ftotal" style={{
            padding: 16, background: '#111827', color: '#fff', borderRadius: 8,
            marginBottom: 16,
          }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>Total Estimasi Sementara</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtRp(grandTotal)}</div>
              <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 4 }}>
                Termasuk {s.itemsWithAssumption} item asumsi berlabel — bukan total final terverifikasi.
              </div>
              {s.excludedFromTotal > 0 && (
                <div style={{ fontSize: 12, color: '#fbbf24', marginTop: 4 }}>
                  Mengecualikan {s.excludedFromTotal} item yang belum lengkap.
                </div>
              )}
              {proposedGrandTotalLive > 0 && Math.round(proposedGrandTotalLive) !== Math.round(grandTotal) && (
                <div style={{ fontSize: 12, color: '#fbbf24', marginTop: 4 }}>
                  Total usulan AI: {fmtRp(proposedGrandTotalLive)} (untuk perbandingan; total terverifikasi di atas yang dipakai).
                  {hasCanonicalSubstitution
                    ? ' Selisih dapat mencerminkan substitusi harga kanonis atas estimasi AI, bukan semata kesalahan hitung.'
                    : ' Selisih ini adalah perbedaan hitung AI.'}
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
                  {draftSaved ? 'Draft Tersimpan' : 'Simpan Draft'}
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
                  <MessageSquare size={16} /> Kirim ke Chat AI
                </button>
              )}
              <button
                onClick={handleFinalize}
                disabled={finalizing || !gateComplete}
                title={!gateComplete ? `Finalisasi terkunci — ${gateItems.length - gateCheckedCount} item belum ditinjau` : undefined}
                className="dedai-ftotal-btn"
                style={{
                  padding: '12px 24px', borderRadius: 8, border: 'none',
                  background: '#7C3AED', color: '#fff', fontWeight: 600, cursor: 'pointer',
                  opacity: (finalizing || !gateComplete) ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {!gateComplete && !finalizing && <Lock size={16} />}
                {finalizing ? 'Menyimpan…' : 'Konfirmasi & Masukkan ke RAB'}
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
