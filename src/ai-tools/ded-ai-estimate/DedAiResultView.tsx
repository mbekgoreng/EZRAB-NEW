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
import './dedAi.css';

export type ItemStatus = 'valid' | 'review' | 'blocked' | 'no-price';

export function getItemStatus(it: DedAiItem): ItemStatus {
  if (it.quantity == null) return 'blocked';
  if (it.unitPrice == null) return 'no-price';
  if (it.quantitySource === 'AI_INFERENCE' || it.quantitySource === 'ASSUMPTION') return 'review';
  return 'valid';
}

const STATUS_META: Record<ItemStatus, { label: string; icon: React.ReactNode }> = {
  valid: { label: 'Valid', icon: <CheckCircle2 size={12} /> },
  review: { label: 'Perlu Ditinjau', icon: <AlertTriangle size={12} /> },
  blocked: { label: 'Diblokir', icon: <XCircle size={12} /> },
  'no-price': { label: 'Harga Blm Tersedia', icon: <MinusCircle size={12} /> },
};

const fmtRp = (n: number | null) =>
  n == null ? '—' : 'Rp' + Math.round(n).toLocaleString('id-ID');
const fmtQty = (n: number | null) =>
  n == null ? '—' : Number.isInteger(n) ? n.toLocaleString('id-ID') : n.toLocaleString('id-ID', { maximumFractionDigits: 2 });

const FILTERS: Array<{ id: ItemStatus | 'all'; label: string }> = [
  { id: 'all', label: 'Semua' },
  { id: 'valid', label: 'Valid' },
  { id: 'review', label: 'Perlu Ditinjau' },
  { id: 'blocked', label: 'Diblokir' },
  { id: 'no-price', label: 'Harga Blm Tersedia' },
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
  const [items, setItems] = useState<DedAiItem[]>(output.items);
  const [filter, setFilter] = useState<ItemStatus | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVals, setEditVals] = useState<{ name: string; quantity: string; units: string }>({ name: '', quantity: '', units: '' });
  const [finalizing, setFinalizing] = useState(false);
  const [finalMsg, setFinalMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      const unitPrice = it.unitPrice;
      const subtotal = quantity != null && unitPrice != null ? quantity * unitPrice : null;
      return {
        ...it,
        name: editVals.name.trim() || it.name,
        quantity,
        units: editVals.units.trim() || it.units,
        quantitySource: 'DED_EXPLICIT' as const,
        quantityFormula: `${quantity != null ? `koreksi manual: ${fmtQty(quantity)} ${it.units}` : 'dikosongkan manual'}`,
        subtotal,
        provenance: [...it.provenance, 'user-edit'],
      };
    }));
    setEditing(null);
  };

  const handleFinalize = async () => {
    if (finalizing || finalized) return;
    setFinalizing(true);
    setFinalMsg(null);
    try {
      const res = await onFinalize(items);
      setFinalMsg({ ok: res.ok, text: res.message });
    } catch (e: any) {
      setFinalMsg({ ok: false, text: e?.message || 'Finalisasi gagal.' });
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
      'Uraian Pekerjaan': it.name,
      'Kategori': it.category,
      'Volume': it.quantity ?? '',
      'Satuan': it.units,
      'Harga Satuan (Rp)': it.unitPrice ?? '',
      'Jumlah Harga (Rp)': it.subtotal ?? '',
      'Status': STATUS_META[status].label,
      'Sumber Kuantitas': it.quantitySource,
      'Formula / Dasar': it.quantityFormula || '',
      'Halaman Sumber': it.sourcePages.join(', '),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 42 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 36 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estimasi');
    XLSX.writeFile(wb, `ded-ai-${output.projectName.replace(/\s+/g, '-').toLowerCase()}.xlsx`);
  };

  return (
    <div className="dedai">
      <div className="dedai-head">
        <h1>Hasil Estimasi — <span className="accent">{output.projectName}</span></h1>
        <p>Periksa hasil analisis, validasi kuantitas, dan tinjau nilai estimasi sebelum menyimpan ke proyek.</p>
      </div>

      <div className="dedai-steps">
        <div className="dedai-step done"><span className="n">✓</span> Input</div>
        <div className="dedai-step-line done" />
        <div className="dedai-step done"><span className="n">✓</span> Progress</div>
        <div className="dedai-step-line done" />
        <div className="dedai-step active"><span className="n">3</span> Hasil</div>
      </div>

      {/* ---- Ringkasan ---- */}
      <div className="dedai-stats">
        <div className="dedai-stat">
          <div className="lbl">Total Estimasi Valid</div>
          <div className="val blue">{fmtRp(grandTotal)}</div>
          <div className="hint">{calculableCount} dari {items.length} item masuk total</div>
        </div>
        <div className="dedai-stat">
          <div className="lbl">Item Valid</div>
          <div className="val green">{counts.valid}</div>
          <div className="hint">kuantitas & harga OK</div>
        </div>
        <div className="dedai-stat">
          <div className="lbl">Perlu Ditinjau</div>
          <div className="val amber">{counts.review}</div>
          <div className="hint">dari inferensi / asumsi AI</div>
        </div>
        <div className="dedai-stat">
          <div className="lbl">Diblokir</div>
          <div className="val red">{counts.blocked}</div>
          <div className="hint">tanpa kuantitas — di luar total</div>
        </div>
        <div className="dedai-stat">
          <div className="lbl">Harga Blm Tersedia</div>
          <div className="val slate">{counts['no-price']}</div>
          <div className="hint">tidak dihitung sebagai gratis</div>
        </div>
        <div className="dedai-stat">
          <div className="lbl">Total Item</div>
          <div className="val slate">{items.length}</div>
          <div className="hint">{output.pageCount} halaman DED dibaca</div>
        </div>
      </div>
      {volumeByUnit.length > 0 && (
        <p style={{ fontSize: 12.5, color: '#64748B', margin: '-6px 0 16px' }}>
          <Info size={13} style={{ verticalAlign: -2 }} /> Volume per satuan:{' '}
          {volumeByUnit.map(([u, v]) => <b key={u} style={{ color: '#334155' }}>{fmtQty(v)} {u}</b>).reduce((a, b) => <>{a} · {b}</>)}
        </p>
      )}

      {/* ---- Filter ---- */}
      <div className="dedai-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`dedai-chip ${filter === f.id ? 'active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}{f.id !== 'all' && ` (${counts[f.id as ItemStatus]})`}
          </button>
        ))}
      </div>

      {/* ---- Tabel ---- */}
      <div className="dedai-table-wrap">
        <table className="dedai-table">
          <thead>
            <tr>
              <th>No</th><th>Uraian Pekerjaan</th><th>Volume</th><th>Satuan</th>
              <th>Harga Satuan</th><th>Jumlah Harga</th><th>Status</th><th>Aksi</th>
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
                        <><b>{it.name}</b><br /><span style={{ fontSize: 11.5, color: '#94A3B8' }}>{it.category}</span></>
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
                      <span className={`dedai-badge ${status}`}>{STATUS_META[status].icon}{STATUS_META[status].label}</span>
                    </td>
                    <td>
                      <div className="dedai-row-actions">
                        {isEditing ? (
                          <>
                            <button className="dedai-icon-btn" onClick={() => commitEdit(it.id)} title="Simpan"><Check size={14} color="#059669" /></button>
                            <button className="dedai-icon-btn" onClick={cancelEdit} title="Batal"><X size={14} /></button>
                          </>
                        ) : (
                          <>
                            <button className="dedai-icon-btn" onClick={() => startEdit(it)} title="Ubah volume / satuan / uraian"><Pencil size={14} /></button>
                            <button className="dedai-icon-btn" onClick={() => setExpanded(isOpen ? null : it.id)} title="Detail & dasar kuantitas">
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
                          <div className="dl-row"><span className="dl-k">Dasar kuantitas</span><span>{it.quantityFormula || '—'}</span></div>
                          <div className="dl-row"><span className="dl-k">Sumber</span><span><code>{it.quantitySource}</code> · <code>{it.priceSource}</code></span></div>
                          {it.priceAssumptionNote && <div className="dl-row"><span className="dl-k">Catatan harga</span><span>{it.priceAssumptionNote}</span></div>}
                          {it.sourceEvidence && <div className="dl-row"><span className="dl-k">Bukti DED</span><span>{it.sourceEvidence}</span></div>}
                          <div className="dl-row"><span className="dl-k">Halaman</span><span>{it.sourcePages.length ? it.sourcePages.map((p) => `hlm. ${p}`).join(', ') : '—'}</span></div>
                          {status === 'blocked' && <div className="dl-row"><span className="dl-k">Alasan</span><span style={{ color: '#DC2626', fontWeight: 600 }}>{it.quantityNote || 'Kuantitas tidak dapat ditentukan — item ini dikecualikan dari total.'}</span></div>}
                          {status === 'no-price' && <div className="dl-row"><span className="dl-k">Alasan</span><span style={{ color: '#B45309', fontWeight: 600 }}>Harga satuan belum tersedia — tidak dihitung sebagai Rp0.</span></div>}
                          {status === 'review' && <div className="dl-row"><span className="dl-k">Alasan</span><span style={{ color: '#B45309', fontWeight: 600 }}>{it.quantityNote || 'Kuantitas dari inferensi/asumsi AI — periksa dan koreksi bila perlu.'}</span></div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="dedai-empty">Tidak ada item pada filter ini.</div>}
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
          <Save size={16} /> {draftSaved ? 'Draft Tersimpan ✓' : 'Simpan Draft'}
        </button>
        <button className="dedai-btn ghost" onClick={onBackToInput}>
          <ArrowLeft size={16} /> Kembali ke Input
        </button>
        <button className="dedai-btn primary" disabled={finalizing || finalized || calculableCount === 0} onClick={handleFinalize}>
          <FolderCheck size={16} /> {finalized ? 'Sudah Difinalisasi ✓' : finalizing ? 'Menyimpan…' : 'Finalisasi & Simpan'}
        </button>
        <button className="dedai-btn ghost" onClick={onOpenSpreadsheet}>
          <Table2 size={16} /> Buka Spreadsheet RAB
        </button>
        <button className="dedai-btn ghost" onClick={exportExcel}>
          <FileSpreadsheet size={16} /> Ekspor Excel
        </button>
        <button className="dedai-btn ghost" onClick={exportJson}>
          <FileJson size={16} /> Ekspor JSON
        </button>
      </div>
      {!finalized && (
        <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 10, lineHeight: 1.6 }}>
          Finalisasi menyimpan {calculableCount} item (valid + perlu ditinjau) ke proyek. Item diblokir ({counts.blocked}) dan tanpa harga ({counts['no-price']}) tidak ikut tersimpan.
        </p>
      )}
    </div>
  );
};

export default DedAiResultView;
