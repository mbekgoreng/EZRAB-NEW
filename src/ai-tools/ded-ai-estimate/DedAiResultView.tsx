/**
 * DED-AI Estimate — Tampilan 3: HASIL.
 * Ringkasan jujur + tabel item (edit/filter/detail) + aksi.
 * Aturan: item diblokir & tanpa harga TIDAK masuk total final. Rp0 tidak dipakai
 * sebagai pengganti data kosong — tampilkan "—".
 */
import React, { useMemo, useState } from 'react';
import {
  CheckCircle2, AlertTriangle, XCircle, MinusCircle, Pencil, ChevronDown,
  ChevronUp, Save, FolderCheck, Table2, FileSpreadsheet, FileJson,
  ArrowLeft, Info, Check, X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { DedAiItem, DedAiOutput } from './types';
import { DedAiCalculator } from './calculator';
import { useI18n } from '../../i18n/I18nContext';
import './dedAi.css';

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
  draftSaved: boolean;
  finalized: boolean;
}

export const DedAiResultView: React.FC<Props> = ({
  output, onBackToInput, onSaveDraft, onFinalize, onOpenSpreadsheet, draftSaved, finalized,
}) => {
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
        return {
          ...it,
          name: newName,
          quantity,
          units: newUnits,
          quantityFormula: quantity != null
            ? `${t('ai.ded.result.formula_manual_a')} ${fmtQty(quantity)} ${newUnits}`
            : t('ai.ded.result.formula_cleared'),
          provenance: [...it.provenance, 'user-edit'],
        };
      });
      // Hitung ulang subtotal & stage via logika kanonis (sama seperti pipeline).
      return DedAiCalculator.finalizeItems(updated);
    });
    setEditing(null);
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
          quantityFormula: `${t('ai.ded.result.formula_input_a')} ${fmtQty(quantity)} ${it.units}`,
          provenance: [...it.provenance, 'bulk-fill'],
        };
      });
      // Hitung ulang subtotal & stage via logika kanonis (sama seperti pipeline).
      return DedAiCalculator.finalizeItems(updated);
    });
    setBulkFill(false);
    setBulkVals({});
  };

  const handleFinalize = async () => {
    if (finalizing || finalized) return;
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
    const rows = withStatus.map(({ it, status }, i) => ({
      'No': i + 1,
      [t('ai.ded.result.th_desc')]: it.name,
      [t('ai.ded.result.x_category')]: it.category,
      [t('ai.ded.result.th_volume')]: it.quantity ?? '',
      [t('ai.ded.result.th_unit')]: it.units,
      [t('ai.ded.result.x_unit_price')]: it.unitPrice ?? '',
      [t('ai.ded.result.x_total')]: it.subtotal ?? '',
      [t('ai.ded.result.x_status')]: statusMeta[status].label,
      [t('ai.ded.result.x_qty_src')]: it.quantitySource,
      [t('ai.ded.result.x_formula')]: it.quantityFormula || '',
      [t('ai.ded.result.x_pages')]: it.sourcePages.join(', '),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 42 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 36 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t('ai.ded.result.sheet_name'));
    XLSX.writeFile(wb, `ded-ai-${output.projectName.replace(/\s+/g, '-').toLowerCase()}.xlsx`);
  };

  return (
    <div className="dedai">
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

      {/* ---- Ringkasan ---- */}
      <div className="dedai-stats">
        <div className="dedai-stat">
          <div className="lbl">{t('ai.ded.result.stat_valid_total')}</div>
          <div className="val blue">{fmtRp(grandTotal)}</div>
          <div className="hint">{calculableCount} {t('ai.ded.result.stat_valid_total_hint_a')} {items.length} {t('ai.ded.result.stat_valid_total_hint_b')}</div>
        </div>
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
      {volumeByUnit.length > 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--ez-color-text-muted)', margin: '-6px 0 16px' }}>
          <Info size={13} style={{ verticalAlign: -2 }} /> {t('ai.ded.result.vol_per_unit')}{' '}
          {volumeByUnit.map(([u, v]) => <b key={u} style={{ color: 'var(--ez-color-text-primary)' }}>{fmtQty(v)} {u}</b>).reduce((a, b) => <>{a} · {b}</>)}
        </p>
      )}

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

      {/* ---- Tombol Isi Cepat untuk item tanpa kuantitas ---- */}
      {counts.blocked > 0 && (
        <div style={{ margin: '0 0 16px', padding: '12px 16px', background: 'var(--ez-color-warning-soft)', border: '1px solid var(--ez-color-warning-soft)', borderRadius: 'var(--ez-radius-card)' }}>
          <div style={{ fontSize: 13.5, color: 'var(--ez-color-warning)', marginBottom: 8 }}>
            <b>{counts.blocked} {t('ai.ded.result.bulk_text_a')}</b> {t('ai.ded.result.bulk_text_b')}
          </div>
          <button
            onClick={() => setBulkFill(true)}
            style={{ padding: '8px 16px', background: 'var(--ez-color-warning)', color: '#fff', border: 'none', borderRadius: 'var(--ez-radius-control)', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}
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
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{it.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ez-color-text-muted)' }}>{it.quantityFormula || t('ai.ded.result.modal_no_qty')}</div>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={bulkVals[it.id] || ''}
                  onChange={(e) => setBulkVals({ ...bulkVals, [it.id]: e.target.value })}
                  style={{ width: 100, padding: '8px 12px', border: '1px solid var(--ez-color-border)', borderRadius: 'var(--ez-radius-control)', fontSize: 14, textAlign: 'right' }}
                />
                <span style={{ fontSize: 13, color: 'var(--ez-color-text-muted)', width: 40 }}>{it.units}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 12, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setBulkFill(false); setBulkVals({}); }}
                style={{ padding: '8px 16px', background: 'var(--ez-color-surface-secondary)', border: 'none', borderRadius: 'var(--ez-radius-control)', cursor: 'pointer', fontSize: 13.5 }}
              >
                {t('ai.ded.result.modal_batal')}
              </button>
              <button
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
              <th>No</th><th>{t('ai.ded.result.th_desc')}</th><th>{t('ai.ded.result.th_volume')}</th><th>{t('ai.ded.result.th_unit')}</th>
              <th>{t('ai.ded.result.th_unit_price')}</th><th>{t('ai.ded.result.th_total')}</th><th>{t('ai.ded.result.th_status')}</th><th>{t('ai.ded.result.th_action')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ it, status }, i) => {
              const isEditing = editing === it.id;
              const isOpen = expanded === it.id;
              return (
                <React.Fragment key={it.id}>
                  <tr>
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
                      {isEditing ? (
                        <input className="dedai-edit-input" style={{ width: 64 }} value={editVals.units} onChange={(e) => setEditVals({ ...editVals, units: e.target.value })} />
                      ) : it.units}
                    </td>
                    <td><span className="dedai-num">{fmtRp(it.unitPrice)}</span></td>
                    <td><span className="dedai-num">{fmtRp(it.subtotal)}</span></td>
                    <td>
                      <span className={`dedai-badge ${status}`}>{statusMeta[status].icon}{statusMeta[status].label}</span>
                    </td>
                    <td>
                      <div className="dedai-row-actions">
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
                      <td colSpan={8}>
                        <div className="dedai-detail">
                          <div className="dl-row"><span className="dl-k">{t('ai.ded.result.detail_basis')}</span><span>{it.quantityFormula || '—'}</span></div>
                          <div className="dl-row"><span className="dl-k">{t('ai.ded.result.detail_source')}</span><span><code>{it.quantitySource}</code> · <code>{it.priceSource}</code></span></div>
                          {it.priceAssumptionNote && <div className="dl-row"><span className="dl-k">{t('ai.ded.result.detail_price_note')}</span><span>{it.priceAssumptionNote}</span></div>}
                          {it.sourceEvidence && <div className="dl-row"><span className="dl-k">{t('ai.ded.result.detail_proof')}</span><span>{it.sourceEvidence}</span></div>}
                          <div className="dl-row"><span className="dl-k">{t('ai.ded.result.detail_pages')}</span><span>{it.sourcePages.length ? it.sourcePages.map((p) => `${t('ai.ded.result.page_abbr')}${p}${t('ai.ded.result.page_abbr_suffix')}`).join(', ') : '—'}</span></div>
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

      {finalMsg && (
        <div className={finalMsg.ok ? 'dedai-notice blue' : 'dedai-error'} style={{ marginTop: 16 }}>
          {finalMsg.ok ? <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} /> : <XCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />}
          <span>{finalMsg.text}</span>
        </div>
      )}

      {/* ---- Aksi ---- */}
      <div className="dedai-actions">
        <button className="dedai-btn ghost" onClick={() => onSaveDraft(items)}>
          <Save size={16} /> {draftSaved ? t('ai.ded.result.act_saved_draft') : t('ai.ded.result.act_save_draft')}
        </button>
        <button className="dedai-btn ghost" onClick={onBackToInput}>
          <ArrowLeft size={16} /> {t('ai.ded.result.act_back_input')}
        </button>
        <button className="dedai-btn primary" disabled={finalizing || finalized || calculableCount === 0} onClick={handleFinalize}>
          <FolderCheck size={16} /> {finalized ? t('ai.ded.result.act_finalized') : finalizing ? t('ai.ded.result.act_finalizing') : t('ai.ded.result.act_finalize')}
        </button>
        <button className="dedai-btn ghost" onClick={onOpenSpreadsheet}>
          <Table2 size={16} /> {t('ai.ded.result.act_open_rab')}
        </button>
        <button className="dedai-btn ghost" onClick={exportExcel}>
          <FileSpreadsheet size={16} /> {t('ai.ded.result.act_export_excel')}
        </button>
        <button className="dedai-btn ghost" onClick={exportJson}>
          <FileJson size={16} /> {t('ai.ded.result.act_export_json')}
        </button>
      </div>
      {!finalized && (
        <p style={{ fontSize: 12, color: 'var(--ez-color-text-muted)', marginTop: 10, lineHeight: 1.6 }}>
          {t('ai.ded.result.footnote_a')} {calculableCount} {t('ai.ded.result.footnote_b')} ({counts.blocked}) {t('ai.ded.result.footnote_c')} ({counts['no-price']}) {t('ai.ded.result.footnote_d')}
        </p>
      )}
    </div>
  );
};

export default DedAiResultView;
