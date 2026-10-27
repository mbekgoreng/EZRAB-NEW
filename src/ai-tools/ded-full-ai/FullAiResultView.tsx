/**
 * FULL AI DED ESTIMATE — Result View
 *
 * Menampilkan hasil Full AI dengan transparansi penuh:
 * provenance, formula, asumsi, sumber harga, status verifikasi.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import { FullAiOutput, FullAiItem } from './types';
import { resolveCanonicalCode, getDedPriceSourceLabel, DED_PRICE_SOURCE_LABELS } from '../ded-canonical/canonicalDedPricing';
import { resolveFullAiItemStatus } from './service';
import { verifySubtotal, clearAiProposal } from './validator';

interface Props {
  output: FullAiOutput;
  onFinalize: (items: FullAiItem[]) => Promise<{ ok: boolean; message: string }>;
  onBack: () => void;
}

const PROVENANCE_LABEL: Record<string, { label: string; color: string }> = {
  EXPLICIT: { label: 'Dari DED', color: '#16a34a' },
  DERIVED: { label: 'Hitungan AI', color: '#2563EB' },
  ASSUMPTION: { label: 'Asumsi', color: '#d97706' },
  NEEDS_CONFIRMATION: { label: 'Perlu Konfirmasi', color: '#dc2626' },
  UNRESOLVED: { label: 'Belum Jelas', color: '#6b7280' },
  USER_INPUT: { label: 'Input User', color: '#7C3AED' },
};

// Label sumber harga dari adapter kanonis (satu sumber). VERIFIED_SOURCE
// lama tampil netral ("belum terverifikasi independen") — nilainya tidak
// diubah, hanya labelnya, agar draft & riwayat lama tidak direlabel diam-diam.
const PRICE_LABEL = DED_PRICE_SOURCE_LABELS;

const STATUS_ICON: Record<string, React.ReactNode> = {
  READY: <CheckCircle2 size={14} color="#16a34a" />,
  NEEDS_CONFIRMATION: <AlertTriangle size={14} color="#d97706" />,
  UNRESOLVED: <HelpCircle size={14} color="#6b7280" />,
  EXCLUDED: <XCircle size={14} color="#dc2626" />,
};

const fmtRp = (n: number | null) =>
  n == null ? '—' : `Rp${n.toLocaleString('id-ID')}`;

function ItemCard({ item, onUpdate }: { item: FullAiItem; onUpdate: (updated: FullAiItem) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editQty, setEditQty] = useState(item.quantity.value?.toString() || '');
  const [editPrice, setEditPrice] = useState(item.price.unitPrice?.toString() || '');
  const q = item.quantity;
  const p = item.price;
  const prov = PROVENANCE_LABEL[q.provenance] || PROVENANCE_LABEL.UNRESOLVED;
  const priceSrc = getDedPriceSourceLabel(p.source);
  const isEdited = q.provenance === 'USER_INPUT' || p.source === 'USER_INPUT';
  const [confirmMsg, setConfirmMsg] = useState('');

  // Konfirmasi kandidat AHSP (review): resolusi ulang lewat jalur kode
  // eksak adapter — kandidat PARTIAL / satuan tak cocok / karantina akan
  // ditolak di sini, tidak pernah langsung dipakai.
  const handleConfirmCandidate = (code: string) => {
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
      subtotal: includeInTotal ? subtotal : null,
      subtotalVerified: verified && includeInTotal,
      status: includeInTotal ? 'READY' : status,
      exclusionReason: includeInTotal ? null : exclusionReason,
    }));
    setConfirmMsg('');
  };

  return (
    <div className="fullai-item" style={{
      border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 8,
      background: item.status === 'UNRESOLVED' ? '#f9fafb' : '#fff',
    }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span style={{ flex: 1, fontWeight: 500 }}>{item.no}. {item.name}</span>
        {STATUS_ICON[item.status]}
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 10,
          background: `${prov.color}15`, color: prov.color, fontWeight: 600,
        }}>
          {prov.label}
        </span>
      </div>

      {open && (
        <div style={{ padding: '0 12px 12px 36px', fontSize: 13, color: '#374151' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <strong>Volume:</strong>{' '}
              {q.value != null ? `${q.value.toLocaleString('id-ID')} ${q.unit}` : <em>belum jelas</em>}
            </div>
            <div>
              <strong>Harga:</strong>{' '}
              {p.unitPrice != null ? `${fmtRp(p.unitPrice)}/${p.unit}` : <em>belum ada</em>}
              {' '}
              <span style={{ fontSize: 11, color: priceSrc.color }}>({priceSrc.label})</span>
              {p.ahspCode ? <span style={{ fontSize: 11, color: '#6b7280' }}> · AHSP {p.ahspCode}</span> : null}
            </div>
          </div>

          {q.formula && (
            <div style={{ marginBottom: 6 }}>
              <strong>Rumus:</strong> <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{q.formula}</code>
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
            <div style={{ marginBottom: 6, color: '#d97706' }}>
              <strong>Asumsi:</strong> {q.assumptions.join('; ')}
            </div>
          )}

          {q.notes && <div style={{ marginBottom: 6 }}><strong>Catatan:</strong> {q.notes}</div>}

          {p.notes && <div style={{ marginBottom: 6 }}><strong>Catatan harga:</strong> {p.notes}</div>}

          {item.subtotalDiscrepancy && (
            <div style={{ marginBottom: 6, color: '#92400E', background: '#FFFBEB', padding: '6px 8px', borderRadius: 6 }}>
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
            <div style={{ marginTop: 8, padding: 10, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Padanan AHSP menunggu konfirmasi — pilih satu (tidak ada yang dipilih otomatis):</div>
              <div style={{ fontSize: 12, color: '#92400E', marginBottom: 6 }}>{item.price.ahspMatch.reason}</div>
              {item.price.ahspMatch.candidates.map((c) => (
                <div key={c.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: '1px solid #FDE68A', fontSize: 12 }}>
                  <span><b>{c.code}</b> — {c.name} ({c.unit})
                    {c.priceStatus === 'FULL' && c.canonicalPrice != null ? ` — ${fmtRp(c.canonicalPrice)}/${c.unit}` : c.priceStatus === 'PARTIAL' ? ' — komponen belum lengkap' : c.priceStatus === 'UNPRICED' ? ' — tanpa rincian komponen' : ''}
                    {!c.unitExact ? ' — satuan berbeda' : ''}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleConfirmCandidate(c.code); }}
                    style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #2563EB', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', flexShrink: 0 }}
                  >
                    Pilih
                  </button>
                </div>
              ))}
              {confirmMsg && <div style={{ color: '#dc2626', marginTop: 6, fontSize: 12 }}>{confirmMsg}</div>}
            </div>
          )}
          {item.price.ahspMatch && item.price.ahspMatch.status !== 'RESOLVED' && item.price.ahspMatch.status !== 'NEEDS_REVIEW' && (
            <div style={{ marginTop: 8, padding: 10, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, color: '#6b7280' }}>
              <strong>AHSP:</strong> {item.price.ahspMatch.reason}
              {item.price.ahspMatch.matchedCode ? ` (kode: ${item.price.ahspMatch.matchedCode})` : ''}
            </div>
          )}

          {item.sourcePages && item.sourcePages.length > 0 && (
            <div style={{ marginBottom: 6, fontSize: 12, color: '#6b7280' }}>
              Sumber: halaman {item.sourcePages.join(', ')}
            </div>
          )}

          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              <strong>Subtotal:</strong>{' '}
              <span style={{ fontWeight: 700, color: item.subtotal != null ? '#111827' : '#9ca3af' }}>
                {fmtRp(item.subtotal)}
              </span>
              {item.subtotal != null && (
                <span style={{ fontSize: 11, color: item.subtotalVerified ? '#16a34a' : '#d97706', marginLeft: 8 }}>
                  {item.subtotalVerified ? '✓ terverifikasi (volume × harga)' : 'belum terverifikasi'}
                </span>
              )}
              {item.subtotal == null && item.status !== 'UNRESOLVED' && (
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>
                  tidak masuk total{item.exclusionReason ? ` [${item.exclusionReason}]` : ''}
                </span>
              )}
              {isEdited && (
                <span style={{ fontSize: 11, color: '#2563EB', marginLeft: 8, fontWeight: 600 }}>
                  ✏️ diedit user
                </span>
              )}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {item.wbsGroup && (
                <span style={{ fontSize: 11, color: '#6b7280' }}>
                  {item.wbsCode ? `${item.wbsCode} — ` : ''}{item.wbsGroup}
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setEditing(!editing); }}
                style={{
                  fontSize: 12, padding: '4px 12px', borderRadius: 6,
                  border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer',
                }}
              >
                {editing ? 'Batal' : 'Edit'}
              </button>
            </div>
          </div>

          {editing && (
            <div style={{ marginTop: 8, padding: 12, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Volume ({q.unit || 'satuan'})
                  </label>
                  <input
                    type="number" step="any" min="0"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}
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
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}
                    placeholder="Kosongkan jika belum ada"
                  />
                </div>
              </div>
              <button
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
                  onUpdate(clearAiProposal({
                    ...item,
                    quantity: {
                      ...item.quantity,
                      value: validQty,
                      // Provenance asli dipertahankan di notes, tapi status jadi USER_INPUT
                      provenance: 'USER_INPUT' as any,
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
                  background: '#2563EB', color: '#fff', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Simpan Perubahan
              </button>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>
                Perubahan ditandai sebagai input user. Nilai asli AI tetap tercatat di catatan.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const FullAiResultView: React.FC<Props> = ({ output, onFinalize, onBack }) => {
  const [finalizing, setFinalizing] = useState(false);
  const [finalMsg, setFinalMsg] = useState('');
  const [items, setItems] = useState<FullAiItem[]>(output.items);

  // Hitung ulang summary & total saat item diedit
  const handleItemUpdate = (updated: FullAiItem) => {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
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
    setFinalizing(true);
    setFinalMsg('');
    const savable = items.filter(
      (it) => it.status === 'READY' && it.subtotal != null && it.subtotal > 0
    );
    const res = await onFinalize(savable);
    setFinalMsg(res.message);
    setFinalizing(false);
  };

  // Kelompokkan per WBS
  const groups = new Map<string, FullAiItem[]>();
  for (const it of items) {
    const key = it.wbsGroup || 'Lain-lain';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  return (
    <div className="dedai" style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', cursor: 'pointer' }}>
          ← Kembali
        </button>
        <h1 style={{ margin: 0, fontSize: 20 }}>Hasil Full AI Estimate</h1>
        <span style={{
          fontSize: 11, padding: '4px 12px', borderRadius: 12,
          background: '#7C3AED15', color: '#7C3AED', fontWeight: 700,
        }}>
          {output.mode === 'FAST' ? 'Cepat' : 'Mendalam'} •{' '}
          {output.provenance.provider && output.provenance.model
            ? `${output.provenance.provider} / ${output.provenance.model}`
            : output.provenance.model || 'Model tidak diketahui'}
        </span>
      </div>

      {/* ---- Banner kebijakan harga (Full AI vs Database) ---- */}
      {(() => {
        const policy = output.policy ?? 'FULL_AI';
        const canonNote = s.itemsWithCanonicalPrice > 0 ? ` ${s.itemsWithCanonicalPrice} item memakai harga AHSP kanonis (SE 47/2026, biaya langsung).` : '';
        const reviewNote = s.itemsNeedAhspReview > 0 ? ` ${s.itemsNeedAhspReview} item menunggu konfirmasi padanan AHSP.` : '';
        const incompleteNote = s.itemsAhspIncomplete > 0 ? ` ${s.itemsAhspIncomplete} item AHSP-nya belum lengkap komponennya.` : '';
        return policy === 'FULL_AI' ? (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>
            <b>Mode: Estimasi Full AI.</b> {s.itemsWithAiPrice} item memakai harga estimasi AI (AI_ESTIMATE) — bukan harga resmi AHSP.{canonNote}{reviewNote}{incompleteNote} {s.excludedFromTotal} item dikecualikan dari total. Periksa dan validasi sebelum RAB dipakai untuk pengadaan, tender, atau kontrak.
          </div>
        ) : (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>
            <b>Mode: Estimasi Database EZRAB.</b> Estimasi harga AI ditolak di mode ini — {s.itemsWithCanonicalPrice} item teratasi dari AHSP kanonis, {s.itemsUnresolved} item belum tersedia, {s.excludedFromTotal} item dikecualikan dari total.{reviewNote}{incompleteNote} Total di bawah bersifat <b>parsial</b> sampai harga yang hilang dilengkapi.
          </div>
        );
      })()}

      {output.error ? (
        <div style={{ padding: 24, background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
          <h3 style={{ color: '#dc2626', margin: '0 0 8px' }}>Analisis Gagal</h3>
          <p>{output.error.message}</p>
          <p style={{ fontSize: 12, color: '#6b7280' }}>Kode: {output.error.code}</p>
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
                padding: 12, background: '#f9fafb', borderRadius: 8,
                border: '1px solid #e5e7eb', textAlign: 'center',
              }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{val}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Info proyek */}
          {output.projectInfo.scopeSummary && (
            <div style={{ padding: 12, background: '#eff6ff', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              <strong>Ringkasan Proyek:</strong> {output.projectInfo.scopeSummary}
              {output.projectInfo.missingInfo && output.projectInfo.missingInfo.length > 0 && (
                <div style={{ marginTop: 6, color: '#d97706' }}>
                  <strong>Info hilang:</strong> {output.projectInfo.missingInfo.join('; ')}
                </div>
              )}
            </div>
          )}

          {/* Warnings */}
          {output.warnings.length > 0 && (
            <div style={{ padding: 12, background: '#fffbeb', borderRadius: 8, marginBottom: 16, fontSize: 13, border: '1px solid #fde68a' }}>
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
                  padding: '8px 12px', background: '#f3f4f6', borderRadius: 8, marginBottom: 8,
                }}>
                  <strong>{groupName}</strong>
                  <span style={{ fontWeight: 700 }}>{fmtRp(groupTotal)}</span>
                </div>
                {items.map((it) => <ItemCard key={it.id} item={it} onUpdate={handleItemUpdate} />)}
              </div>
            );
          })}

          {/* Grand Total */}
          <div style={{
            padding: 16, background: '#111827', color: '#fff', borderRadius: 8,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
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
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              style={{
                padding: '12px 24px', borderRadius: 8, border: 'none',
                background: '#7C3AED', color: '#fff', fontWeight: 600, cursor: 'pointer',
                opacity: finalizing ? 0.6 : 1,
              }}
            >
              {finalizing ? 'Menyimpan…' : 'Konfirmasi & Masukkan ke RAB'}
            </button>
          </div>

          {finalMsg && (
            <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              {finalMsg}
            </div>
          )}
        </>
      )}
    </div>
  );
};
