import React, { useState } from 'react';
import {
  EntityResolutionSummary,
  CanonicalEntity,
  EntityResolutionStatus
} from '../../domain/document/canonicalEntityTypes';
import {
  Layers,
  FileText,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Clock,
  Search,
  Building2,
  Split,
  Copy,
  Tag,
  ShieldAlert,
  Hash,
  ArrowRight,
  Info
} from 'lucide-react';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

interface EntityResolutionReviewViewProps {
  summary: EntityResolutionSummary;
  onResolveConflict?: (entityId: string, selectedQty: number, notes: string) => void;
}

export const EntityResolutionReviewView: React.FC<EntityResolutionReviewViewProps> = ({
  summary,
  onResolveConflict
}) => {
  const [selectedEntityId, setSelectedEntityId] = useState<string>(
    summary.entities[0]?.entityId || ''
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [floorFilter, setFloorFilter] = useState<string>('ALL');

  const selectedEntity = summary.entities.find(e => e.entityId === selectedEntityId);

  // Distinct floors
  const distinctFloors = Array.from(new Set(summary.entities.map(e => e.location.floor)));

  // Filtered entities
  const filteredEntities = summary.entities.filter(ent => {
    if (statusFilter !== 'ALL' && ent.resolutionStatus !== statusFilter) return false;
    if (floorFilter !== 'ALL' && ent.location.floor !== floorFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        ent.name.toLowerCase().includes(term) ||
        ent.identifier.toLowerCase().includes(term) ||
        ent.elementType.toLowerCase().includes(term) ||
        ent.location.floor.toLowerCase().includes(term) ||
        ent.drawingReferences.some(dr => dr.toLowerCase().includes(term))
      );
    }
    return true;
  });

  const getStatusBadge = (status: EntityResolutionStatus) => {
    switch (status) {
      case 'SAME_ENTITY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Same Entity (Deduplicated)
          </span>
        );
      case 'DIFFERENT_ENTITY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Tag className="w-3 h-3" /> Different Entity (Floor Isolated)
          </span>
        );
      case 'POTENTIAL_DUPLICATE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Copy className="w-3 h-3" /> Duplicate Sheet (Neutralized)
          </span>
        );
      case 'CONFLICT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
            <AlertTriangle className="w-3 h-3" /> Conflict (Discrepancy)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-700 text-slate-300">
            <HelpCircle className="w-3 h-3" /> Unresolved
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Top Header & Summary Stats */}
      <div className="bg-slate-950/90 p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold text-white tracking-wide">
              Entity Resolution & Anti-Duplicate Review
            </h2>
            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
              Phase 6.3
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Prinsip: <strong>RAW EXTRACTION &ne; PHYSICAL ENTITY</strong> &bull; Mencegah double-counting elemen antar lembar gambar
          </p>
        </div>

        {/* Global Metric Counters */}
        <div className="flex items-center gap-2.5 text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span>Raw Evidence: <strong>{summary.totalRawEvidence}</strong></span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Canonical Entities: <strong>{summary.totalCanonicalEntities}</strong></span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Deduplicated Qty: <strong>{summary.totalDeduplicatedQuantityItems}</strong></span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 flex items-center gap-1.5">
            <AlertTriangle className={`w-3.5 h-3.5 ${summary.totalConflicts > 0 ? 'text-red-400' : 'text-slate-500'}`} />
            <span>Conflicts: <strong>{summary.totalConflicts}</strong></span>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-12 flex-1 overflow-hidden">
        {/* Left Column: Entity List (5 cols) */}
        <div className="col-span-12 md:col-span-5 border-r border-slate-800 flex flex-col bg-slate-950/40">
          {/* Filters & Search */}
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Cari entitas, kode (K1, B1), atau lantai..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${
                  statusFilter === 'ALL' ? 'bg-emerald-600 text-white font-semibold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                All Status
              </button>
              <button
                onClick={() => setStatusFilter('CONFLICT')}
                className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${
                  statusFilter === 'CONFLICT' ? 'bg-red-600 text-white font-semibold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Conflicts ({summary.totalConflicts})
              </button>
              <button
                onClick={() => setStatusFilter('SAME_ENTITY')}
                className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${
                  statusFilter === 'SAME_ENTITY' ? 'bg-emerald-600 text-white font-semibold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Deduplicated
              </button>
            </div>
          </div>

          {/* List of Entities */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredEntities.map(ent => {
              const isSelected = ent.entityId === selectedEntityId;

              return (
                <div
                  key={ent.entityId}
                  onClick={() => setSelectedEntityId(ent.entityId)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all text-xs ${
                    isSelected
                      ? 'bg-emerald-600/15 border-emerald-500/50 text-white shadow-sm'
                      : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-850 text-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="font-mono text-emerald-300">{ent.identifier}</span>
                        <span>{ent.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>{ent.location.building}</span>
                        <span>&bull;</span>
                        <span className="text-slate-300 font-medium">{ent.location.floor}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-mono font-bold text-slate-200">
                        {ent.canonicalQuantity.quantity} {ent.canonicalQuantity.unit}
                      </span>
                      <div className="text-[10px] text-slate-400">
                        {ent.evidences.length} evidence
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800/60 text-[10px]">
                    <span className="text-slate-400 truncate max-w-[200px]">
                      Drawings: {ent.drawingReferences.join(', ')}
                    </span>
                    {getStatusBadge(ent.resolutionStatus)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Entity Evidence Inspector & Candidate Table (7 cols) */}
        <div className="col-span-12 md:col-span-7 flex flex-col bg-slate-900 overflow-y-auto p-5 space-y-5">
          {selectedEntity ? (
            <div className="space-y-5">
              {/* Entity Overview Card */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-mono font-bold text-emerald-400">
                        {selectedEntity.identifier}
                      </span>
                      <h3 className="text-base font-bold text-white">
                        {selectedEntity.name}
                      </h3>
                      {getStatusBadge(selectedEntity.resolutionStatus)}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Lokasi Fisik: <strong>{selectedEntity.location.description}</strong>
                      {selectedEntity.location.grid && ` (Grid: ${selectedEntity.location.grid})`}
                    </p>
                  </div>

                  <div className="text-right bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                      Canonical Quantity
                    </span>
                    <span className="text-lg font-mono font-extrabold text-emerald-300">
                      {selectedEntity.canonicalQuantity.quantity} {selectedEntity.canonicalQuantity.unit}
                    </span>
                  </div>
                </div>

                {/* Specs / Parameters */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/80 text-xs">
                  {selectedEntity.dimensions && (
                    <div className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
                      Dimensi: <strong>{selectedEntity.dimensions}</strong>
                    </div>
                  )}
                  {selectedEntity.material && (
                    <div className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
                      Material: <strong>{selectedEntity.material}</strong>
                    </div>
                  )}
                  {selectedEntity.rebar && (
                    <div className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
                      Pembesian: <strong>{selectedEntity.rebar}</strong>
                    </div>
                  )}
                  <div className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono">
                    Confidence: {(selectedEntity.identityConfidence * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              {/* Conflict Alert Box if present */}
              {selectedEntity.resolutionStatus === 'CONFLICT' && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-red-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Discrepancy / Quantity Conflict Detected</span>
                  </div>
                  <p>{selectedEntity.conflictDescription}</p>

                  {onResolveConflict && (
                    <div className="pt-2 flex items-center gap-2">
                      <span className="text-slate-400">Pilih Kuantitas Final:</span>
                      {selectedEntity.quantityCandidates.map(c => (
                        <button
                          key={c.candidateId}
                          onClick={() => onResolveConflict(selectedEntity.entityId, c.quantity, `Selected ${c.source}`)}
                          className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-bold"
                        >
                          Gunakan {c.quantity} {c.unit} ({c.sourceType})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Evidence Inspector: "Column K1 appears on pages..." */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-400" />
                    <span>Multi-Page Evidence Inspector ({selectedEntity.evidences.length} Sumber)</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Ditemukan di: {selectedEntity.provenance.sourcePages.join(', ')}
                  </span>
                </div>

                <div className="space-y-2">
                  {selectedEntity.evidences.map((ev, idx) => (
                    <div
                      key={ev.evidenceId}
                      className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-slate-300">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {ev.sourceType} (Priority {ev.sourcePriority})
                          </span>
                          <span className="font-semibold">{ev.fileName} (Halaman {ev.pageNumber})</span>
                        </div>
                        {ev.extractedValue.quantity !== undefined && (
                          <span className="font-mono font-bold text-emerald-400">
                            Qty: {ev.extractedValue.quantity} {ev.extractedValue.unit}
                          </span>
                        )}
                      </div>

                      <div className="p-2 rounded bg-slate-950 font-mono text-[11px] text-slate-400 italic border border-slate-800/80">
                        "{ev.sourceText}"
                      </div>

                      {/* Extracted value details */}
                      <div className="flex flex-wrap gap-2 text-[10px] text-slate-400 pt-0.5">
                        {ev.extractedValue.dimensions && <span>Dimensi: <strong className="text-slate-200">{ev.extractedValue.dimensions}</strong></span>}
                        {ev.extractedValue.material && <span>Material: <strong className="text-slate-200">{ev.extractedValue.material}</strong></span>}
                        {ev.extractedValue.rebar && <span>Pembesian: <strong className="text-slate-200">{ev.extractedValue.rebar}</strong></span>}
                        {ev.extractedValue.grid && <span>Grid: <strong className="text-slate-200">{ev.extractedValue.grid}</strong></span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quantity Deduplication Proof Table */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-cyan-400" />
                  <span>Deduplication & Canonical Synthesis Proof</span>
                </h4>

                <p className="text-xs text-slate-400">
                  Sistem mengevaluasi kandidat kuantitas dari setiap lembar gambar dan menerapkan reduksi duplikasi:
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="p-2">Sumber Lembar</th>
                        <th className="p-2">Jenis Dokumen</th>
                        <th className="p-2">Kuantitas Terdeteksi</th>
                        <th className="p-2">Status Reduksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {selectedEntity.quantityCandidates.map((c, i) => (
                        <tr key={i} className="hover:bg-slate-900/50">
                          <td className="p-2 font-mono">{c.source}</td>
                          <td className="p-2">{c.sourceType}</td>
                          <td className="p-2 font-mono font-bold text-white">{c.quantity} {c.unit}</td>
                          <td className="p-2">
                            {c.isDeduplicated ? (
                              <span className="text-emerald-400 font-semibold">Deduplicated (Canonical)</span>
                            ) : (
                              <span className="text-slate-400">Single Source</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-10 text-center text-slate-500 text-xs flex flex-col items-center justify-center h-full">
              <Layers className="w-10 h-10 text-slate-600 mb-2" />
              <span>Pilih entitas di sebelah kiri untuk meninjau bukti multi-halaman dan hasil deduplikasi.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
