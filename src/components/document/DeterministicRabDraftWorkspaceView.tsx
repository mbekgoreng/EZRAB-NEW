import React, { useState } from 'react';
import {
  DeterministicRabDraftSummary,
  DeterministicRabDraftItem
} from '../../domain/document/deterministicRabTypes';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Calculator,
  Compass,
  FileCode,
  Tag,
  Search,
  Filter,
  Layers,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight,
  X,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

interface DeterministicRabDraftWorkspaceViewProps {
  summary: DeterministicRabDraftSummary;
  onCommitToSpreadsheet?: (items: DeterministicRabDraftItem[]) => void;
}

export const DeterministicRabDraftWorkspaceView: React.FC<DeterministicRabDraftWorkspaceViewProps> = ({
  summary,
  onCommitToSpreadsheet
}) => {
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemForTrace, setSelectedItemForTrace] = useState<DeterministicRabDraftItem | null>(null);
  const [expandedWbs, setExpandedWbs] = useState<Set<string>>(new Set(Object.keys(summary.wbsSubtotals)));
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const toggleWbs = (code: string) => {
    const next = new Set(expandedWbs);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setExpandedWbs(next);
  };

  const filteredItems = summary.items.filter(item => {
    if (activeFilter === 'VALID' && item.validationStatus !== 'VALID') return false;
    if (activeFilter === 'MISSING_AHSP' && item.ahspCode !== null) return false;
    if (activeFilter === 'MISSING_PRICE' && item.unitPrice !== null && item.unitPrice > 0) return false;
    if (activeFilter === 'CONFLICT' && item.quantityProvenance.status !== 'CONFLICT') return false;
    if (activeFilter === 'NEEDS_REVIEW' && item.validationStatus !== 'NEEDS_REVIEW' && item.validationStatus !== 'WARNING') return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.description.toLowerCase().includes(q) ||
        item.wbsCode.toLowerCase().includes(q) ||
        (item.ahspCode && item.ahspCode.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 text-slate-800">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <Calculator className="w-3.5 h-3.5" /> Deterministic SafeDecimal Engine
              </span>
              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                PUPR AHSP Bridge
              </span>
              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                RAB DRAFT (Review Gate)
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              RAB Draft Workspace: {summary.projectName}
            </h2>
            <p className="text-sm text-slate-300 mt-1">
              Volume dihitung deterministik dari geometri DED. Total dikalkulasi murni dengan arithmetic core tanpa halusinasi AI.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="bg-white/10 backdrop-blur-sm px-4 py-2.5 rounded-lg border border-white/15 text-center">
              <span className="text-[11px] uppercase tracking-wider text-slate-300 block font-medium">Grand Total RAB</span>
              <span className="text-xl sm:text-2xl font-black text-emerald-400">
                {formatCurrencyIDR(summary.grandTotal)}
              </span>
            </div>

            {onCommitToSpreadsheet && (
              <button
                onClick={() => setShowConfirmModal(true)}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-md transition-all flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" /> Finalisasi ke Spreadsheet
              </button>
            )}
          </div>
        </div>

        {/* Breakdown Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 mt-5 pt-4 border-t border-white/10 text-center">
          <div className="bg-slate-800/60 p-2 rounded-lg">
            <span className="text-[11px] text-slate-400 block">Total Items</span>
            <span className="text-base font-bold text-white">{summary.totalItems}</span>
          </div>
          <div className="bg-slate-800/60 p-2 rounded-lg">
            <span className="text-[11px] text-emerald-400 block">Mapped WBS</span>
            <span className="text-base font-bold text-emerald-300">{summary.mappedItemsCount}</span>
          </div>
          <div className="bg-slate-800/60 p-2 rounded-lg">
            <span className="text-[11px] text-amber-400 block">Missing AHSP</span>
            <span className="text-base font-bold text-amber-300">{summary.missingAhspCount}</span>
          </div>
          <div className="bg-slate-800/60 p-2 rounded-lg">
            <span className="text-[11px] text-rose-400 block">Missing Price</span>
            <span className="text-base font-bold text-rose-300">{summary.missingPriceCount}</span>
          </div>
          <div className="bg-slate-800/60 p-2 rounded-lg">
            <span className="text-[11px] text-purple-400 block">Conflicts</span>
            <span className="text-base font-bold text-purple-300">{summary.conflictsCount}</span>
          </div>
          <div className="bg-slate-800/60 p-2 rounded-lg">
            <span className="text-[11px] text-blue-400 block">Subtotal (Netto)</span>
            <span className="text-xs font-bold text-blue-300 truncate block mt-0.5">
              {formatCurrencyIDR(summary.subtotal)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <Filter className="w-4 h-4 text-slate-500 shrink-0" />
          {(['ALL', 'VALID', 'MISSING_AHSP', 'MISSING_PRICE', 'CONFLICT', 'NEEDS_REVIEW'] as const).map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors shrink-0 ${
                activeFilter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari deskripsi, WBS, AHSP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-3 py-1.5 text-xs rounded-md border border-slate-200 w-full sm:w-64 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 3. WBS Grouped RAB Table */}
      <div className="space-y-4">
        {Object.values(summary.wbsSubtotals).map(group => {
          const isExp = expandedWbs.has(group.wbsCode);
          const groupItems = group.items.filter(item => filteredItems.includes(item));
          if (groupItems.length === 0 && searchQuery) return null;

          return (
            <div key={group.wbsCode} className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
              {/* Group Header */}
              <div
                onClick={() => toggleWbs(group.wbsCode)}
                className="px-4 py-3 bg-slate-50 hover:bg-slate-100 cursor-pointer flex items-center justify-between border-b border-slate-200 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  {isExp ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                  <span className="font-mono font-bold text-indigo-700 text-xs">{group.wbsCode}</span>
                  <span className="font-bold text-slate-900 text-xs uppercase">{group.wbsTitle}</span>
                  <span className="text-[11px] text-slate-500">({group.itemsCount} item)</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">Subtotal:</span>
                  <span className="font-bold text-xs text-slate-900 font-mono">
                    {formatCurrencyIDR(group.subtotal)}
                  </span>
                </div>
              </div>

              {/* Items List */}
              {isExp && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500 font-semibold text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Uraian Pekerjaan</th>
                        <th className="py-2.5 px-3">Kode AHSP</th>
                        <th className="py-2.5 px-3 text-right">Volume</th>
                        <th className="py-2.5 px-3">Satuan</th>
                        <th className="py-2.5 px-3 text-right">Harga Satuan (Rp)</th>
                        <th className="py-2.5 px-3 text-right">Total Harga (Rp)</th>
                        <th className="py-2.5 px-3 text-center">Source Trace</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {groupItems.map(item => (
                        <tr key={item.rabDraftItemId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">{item.description}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {item.validationStatus === 'VALID' ? (
                                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-medium border border-emerald-200">
                                  Valid
                                </span>
                              ) : item.validationStatus === 'WARNING' ? (
                                <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded font-medium border border-amber-200">
                                  Warning
                                </span>
                              ) : (
                                <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded font-medium border border-blue-200">
                                  Review
                                </span>
                              )}
                              {item.quantityProvenance.status === 'CONFLICT' && (
                                <span className="text-[10px] text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded font-medium border border-rose-200">
                                  Conflict
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {item.ahspCode ? (
                              <span className="font-mono text-indigo-700 font-medium bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                                {item.ahspCode}
                              </span>
                            ) : (
                              <span className="text-amber-700 italic text-[11px]">Belum Ada AHSP</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-right text-slate-900">
                            {item.volume.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{item.unit}</td>
                          <td className="py-2.5 px-3 font-mono text-right text-slate-700">
                            {formatCurrencyIDR(item.unitPrice)}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-right text-slate-900">
                            {formatCurrencyIDR(item.totalPrice)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => setSelectedItemForTrace(item)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium transition-colors inline-flex items-center gap-1"
                            >
                              <Compass className="w-3 h-3 text-indigo-600" />
                              <span>Source</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 4. Traceability Modal / Drawer */}
      {selectedItemForTrace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800 font-mono">
                  {selectedItemForTrace.wbsCode} • {selectedItemForTrace.sourceTrace.entityIdentifier}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {selectedItemForTrace.description}
                </h3>
              </div>
              <button
                onClick={() => setSelectedItemForTrace(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formula & Calculation Trace */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                Formula Perhitungan Volume Deterministik
              </span>
              <div className="font-mono text-xs text-indigo-950 font-bold bg-white p-2.5 rounded border border-indigo-100">
                {selectedItemForTrace.quantityProvenance.formula}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div>
                  <span className="text-slate-500">Metode Kalkulasi:</span>{' '}
                  <strong className="text-slate-800">{selectedItemForTrace.quantityProvenance.calculationMethod}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Status Volume:</span>{' '}
                  <strong className="text-emerald-700">{selectedItemForTrace.quantityProvenance.status}</strong>
                </div>
              </div>
            </div>

            {/* DED Drawing & Page Provenance */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                Evidence Dokumen & Gambar Sumber DED
              </span>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {selectedItemForTrace.quantityProvenance.sourceEvidence.map((ev, idx) => (
                  <div key={idx} className="p-3 bg-white flex items-start gap-2.5 text-xs">
                    <FileCode className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-900">
                        {ev.drawingId} • Halaman {ev.pageNumber} ({ev.fileName})
                      </div>
                      <p className="text-slate-600 text-[11px] mt-0.5">{ev.snippet}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AHSP & Price Details */}
            <div className="bg-blue-50/60 p-3 rounded-lg border border-blue-100 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-blue-900 font-semibold">Referensi AHSP:</span>
                <span className="font-mono text-blue-800 font-bold">{selectedItemForTrace.ahspCode || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-900 font-semibold">Sumber Harga:</span>
                <span className="text-blue-800">{selectedItemForTrace.priceLookup.priceSourceDetail}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedItemForTrace(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700"
              >
                Tutup Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Confirmation Gate Modal */}
      {showConfirmModal && onCommitToSpreadsheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-emerald-600">
              <ShieldCheck className="w-8 h-8" />
              <div>
                <h3 className="text-base font-bold text-slate-900">Konfirmasi Finalisasi RAB</h3>
                <p className="text-xs text-slate-500">Preview Gate: Tidak ada perubahan langsung tanpa audit Anda.</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600">Total Item Terpetakan:</span>
                <strong className="text-slate-900">{summary.mappedItemsCount} item</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Item Memerlukan Review:</span>
                <strong className="text-amber-700">{summary.needsReviewCount} item</strong>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-700 font-bold">Total Nilai RAB:</span>
                <strong className="text-emerald-700 font-bold font-mono text-sm">
                  {formatCurrencyIDR(summary.grandTotal)}
                </strong>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Dengan mengklik tombol di bawah, item-item RAB draft ini akan dimasukkan ke spreadsheet utama proyek dan dapat diedit secara leluasa.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  onCommitToSpreadsheet(summary.items);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md"
              >
                Ya, Finalisasi ke Spreadsheet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
