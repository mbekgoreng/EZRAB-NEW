/**
 * FULL AI DED ESTIMATE — Result View
 *
 * Menampilkan hasil Full AI dengan transparansi penuh:
 * provenance, formula, asumsi, sumber harga, status verifikasi.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import { FullAiOutput, FullAiItem } from './types';

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

const PRICE_LABEL: Record<string, { label: string; color: string }> = {
  VERIFIED_SOURCE: { label: 'Terverifikasi', color: '#16a34a' },
  USER_INPUT: { label: 'Input User', color: '#2563EB' },
  AI_ESTIMATE: { label: 'Estimasi AI', color: '#d97706' },
  UNRESOLVED: { label: 'Belum Ada', color: '#6b7280' },
};

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
  const priceSrc = PRICE_LABEL[p.source] || PRICE_LABEL.UNRESOLVED;
  const isEdited = q.provenance === 'USER_INPUT' || p.source === 'USER_INPUT';

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
              {item.subtotal == null && item.status !== 'UNRESOLVED' && (
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>tidak masuk total</span>
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

                  // Tentukan status baru
                  let newStatus: FullAiItem['status'] = 'READY';
                  if (validQty == null) newStatus = 'UNRESOLVED';
                  else if (validPrice == null) newStatus = 'NEEDS_CONFIRMATION';

                  const includeInTotal = newStatus === 'READY' && newSubtotal != null && newSubtotal > 0;

                  onUpdate({
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
                      notes: validPrice != null
                        ? `${item.price.notes || ''} [Diedit user: harga asli ${item.price.unitPrice} (${item.price.source})]`.trim()
                        : item.price.notes,
                    },
                    subtotal: includeInTotal ? newSubtotal : null,
                    status: includeInTotal ? 'READY' : newStatus,
                  });
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

  const s = {
    totalItems: items.length,
    itemsWithQuantity: items.filter((it) => it.quantity.value != null).length,
    itemsWithAssumption: items.filter((it) => it.quantity.provenance === 'ASSUMPTION').length,
    itemsNeedConfirmation: items.filter((it) => it.status === 'NEEDS_CONFIRMATION').length,
    itemsWithAiPrice: items.filter((it) => it.price.source === 'AI_ESTIMATE').length,
    itemsWithVerifiedPrice: items.filter((it) => it.price.source === 'VERIFIED_SOURCE').length,
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
          {output.mode === 'FAST' ? 'Cepat' : 'Mendalam'} • {output.provenance.model}
        </span>
      </div>

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
              ['Harga Terverifikasi', s.itemsWithVerifiedPrice],
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
              <div style={{ fontSize: 13, opacity: 0.7 }}>Total RAB</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtRp(grandTotal)}</div>
              {s.excludedFromTotal > 0 && (
                <div style={{ fontSize: 12, color: '#fbbf24', marginTop: 4 }}>
                  Total Rp{grandTotal.toLocaleString('id-ID')} mengecualikan {s.excludedFromTotal} item yang belum lengkap.
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
