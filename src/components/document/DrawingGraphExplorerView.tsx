import React, { useState } from 'react';
import {
  DrawingGraph,
  DrawingEntity,
  DrawingRelationship,
  DrawingConflictCandidate,
  CrossReferenceEvidence,
  DrawingDisciplineType
} from '../../domain/document/drawingGraphTypes';
import {
  Folder,
  Layers,
  FileText,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Clock,
  Search,
  ExternalLink,
  Building2,
  Compass,
  FileCode,
  ShieldCheck,
  Split,
  ChevronRight,
  ChevronDown
} from 'lucide-react';

interface DrawingGraphExplorerViewProps {
  graph: DrawingGraph;
  onSelectDrawing?: (drawing: DrawingEntity) => void;
  onResolveConflict?: (conflictId: string, status: 'REVISION_RESOLVED' | 'CONSISTENT') => void;
}

export const DrawingGraphExplorerView: React.FC<DrawingGraphExplorerViewProps> = ({
  graph,
  onSelectDrawing,
  onResolveConflict
}) => {
  const [selectedDrawingId, setSelectedDrawingId] = useState<string>(
    Object.keys(graph.drawings)[0] || ''
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFloorFilter, setSelectedFloorFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'RELATIONSHIPS' | 'XREFS' | 'CONFLICTS'>('DETAILS');

  const [expandedBuildings, setExpandedBuildings] = useState<Record<string, boolean>>({
    [Object.keys(graph.buildings)[0] || '']: true
  });
  const [expandedFloors, setExpandedFloors] = useState<Record<string, boolean>>({
    [Object.keys(graph.buildings)[0] ? Object.keys(graph.buildings[Object.keys(graph.buildings)[0]]?.floors || {})[0] || '' : '']: true
  });

  const selectedDrawing = graph.drawings[selectedDrawingId];

  const toggleBuilding = (bldName: string) => {
    setExpandedBuildings(prev => ({ ...prev, [bldName]: !prev[bldName] }));
  };

  const toggleFloor = (flrKey: string) => {
    setExpandedFloors(prev => ({ ...prev, [flrKey]: !prev[flrKey] }));
  };

  // Filtered drawings
  const allDrawings = Object.values(graph.drawings);
  const filteredDrawings = allDrawings.filter(d => {
    if (selectedFloorFilter !== 'ALL' && d.floor !== selectedFloorFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        d.drawingNumber.toLowerCase().includes(term) ||
        d.title.toLowerCase().includes(term) ||
        d.discipline.toLowerCase().includes(term) ||
        d.crossReferences.some(x => x.identifier.toLowerCase().includes(term))
      );
    }
    return true;
  });

  // Extract relationships for selected drawing
  const selectedRelationships: DrawingRelationship[] = selectedDrawing
    ? selectedDrawing.relationshipIds
        .map(id => graph.relationships[id])
        .filter(Boolean)
    : [];

  // Conflicts related to selected drawing
  const selectedConflicts: DrawingConflictCandidate[] = selectedDrawing
    ? graph.conflicts.filter(
        c => c.sourceDrawingId === selectedDrawing.drawingId || c.conflictingDrawingId === selectedDrawing.drawingId
      )
    : [];

  // All distinct floors for filter
  const distinctFloors = Array.from(new Set(allDrawings.map(d => d.floor)));

  const getDisciplineBadgeColor = (disc: DrawingDisciplineType) => {
    switch (disc) {
      case 'ARCHITECTURAL': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'STRUCTURAL': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'MECHANICAL':
      case 'ELECTRICAL':
      case 'PLUMBING': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'FIRE': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'CIVIL':
      case 'ROAD':
      case 'BRIDGE': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      default: return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  const getConflictBadge = (status: string) => {
    switch (status) {
      case 'CONFLICT':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30"><AlertTriangle className="w-3 h-3" /> Conflict</span>;
      case 'REVISION_RESOLVED':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"><CheckCircle2 className="w-3 h-3" /> Resolved</span>;
      case 'NEEDS_REVIEW':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30"><HelpCircle className="w-3 h-3" /> Review</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-700 text-slate-300"><ShieldCheck className="w-3 h-3" /> Consistent</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Top Header & Summary Stats */}
      <div className="bg-slate-950/80 p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <GitBranch className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold text-white tracking-wide">
              Document Map & Drawing Relationship Graph
            </h2>
            <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-500/20 text-indigo-300 font-mono">
              Phase 6.2
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Hierarki Project &rarr; Building &rarr; Floor &rarr; Zone &rarr; Discipline &rarr; Drawing &rarr; Pages & Evidence
          </p>
        </div>

        {/* Global Metric Counters */}
        <div className="flex items-center gap-3 text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Buildings: <strong>{graph.totalBuildings}</strong></span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>Floors: <strong>{graph.totalFloors}</strong></span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 flex items-center gap-1.5">
            <FileCode className="w-3.5 h-3.5 text-amber-400" />
            <span>Drawings: <strong>{graph.totalDrawings}</strong></span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 flex items-center gap-1.5">
            <Split className="w-3.5 h-3.5 text-cyan-400" />
            <span>Relationships: <strong>{graph.totalRelationships}</strong></span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 flex items-center gap-1.5">
            <AlertTriangle className={`w-3.5 h-3.5 ${graph.totalConflicts > 0 ? 'text-red-400' : 'text-emerald-400'}`} />
            <span>Conflicts: <strong>{graph.totalConflicts}</strong></span>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Tree Navigation, Right Drawing Detail View */}
      <div className="grid grid-cols-12 flex-1 overflow-hidden">
        {/* Left Column: Hierarchical Navigation (4 cols) */}
        <div className="col-span-12 md:col-span-4 border-r border-slate-800 flex flex-col bg-slate-950/40">
          {/* Search & Floor Filter */}
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Cari gambar, nomor, atau kode (K1, B1)..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <button
                onClick={() => setSelectedFloorFilter('ALL')}
                className={`px-2 py-0.5 rounded text-xs whitespace-nowrap transition-colors ${
                  selectedFloorFilter === 'ALL'
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                All Floors
              </button>
              {distinctFloors.map(flr => (
                <button
                  key={flr}
                  onClick={() => setSelectedFloorFilter(flr)}
                  className={`px-2 py-0.5 rounded text-xs whitespace-nowrap transition-colors ${
                    selectedFloorFilter === flr
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {flr}
                </button>
              ))}
            </div>
          </div>

          {/* Hierarchical Document Map Tree */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {Object.values(graph.buildings).map(bld => {
              const isBldOpen = expandedBuildings[bld.buildingName] ?? true;

              return (
                <div key={bld.buildingId} className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/50">
                  {/* Building Header */}
                  <div
                    onClick={() => toggleBuilding(bld.buildingName)}
                    className="flex items-center justify-between p-2 bg-slate-800/60 hover:bg-slate-800 cursor-pointer text-xs font-semibold text-slate-200"
                  >
                    <div className="flex items-center gap-1.5">
                      {isBldOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                      <Building2 className="w-4 h-4 text-indigo-400" />
                      <span>{bld.buildingName}</span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {Object.keys(bld.floors).length} Floors
                    </span>
                  </div>

                  {isBldOpen && (
                    <div className="p-2 space-y-2">
                      {Object.values(bld.floors).map(floor => {
                        const flrKey = `${bld.buildingName}_${floor.floorName}`;
                        const isFlrOpen = expandedFloors[flrKey] ?? true;

                        // Filter drawings in this floor
                        const floorDrawings = allDrawings.filter(
                          d => d.building === bld.buildingName && d.floor === floor.floorName && filteredDrawings.some(fd => fd.drawingId === d.drawingId)
                        );

                        if (floorDrawings.length === 0 && searchTerm) return null;

                        return (
                          <div key={floor.floorId} className="border border-slate-800/80 rounded bg-slate-950/40">
                            <div
                              onClick={() => toggleFloor(flrKey)}
                              className="flex items-center justify-between p-1.5 bg-slate-900/70 hover:bg-slate-850 cursor-pointer text-xs text-slate-300"
                            >
                              <div className="flex items-center gap-1.5">
                                {isFlrOpen ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                                <Layers className="w-3.5 h-3.5 text-blue-400" />
                                <span className="font-medium">{floor.floorName}</span>
                              </div>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                                {floorDrawings.length} dwg
                              </span>
                            </div>

                            {isFlrOpen && (
                              <div className="p-1 space-y-1">
                                {floorDrawings.map(dwg => {
                                  const isSelected = dwg.drawingId === selectedDrawingId;

                                  return (
                                    <div
                                      key={dwg.drawingId}
                                      onClick={() => {
                                        setSelectedDrawingId(dwg.drawingId);
                                        if (onSelectDrawing) onSelectDrawing(dwg);
                                      }}
                                      className={`p-2 rounded-md cursor-pointer transition-all border text-xs ${
                                        isSelected
                                          ? 'bg-indigo-600/20 border-indigo-500/50 text-white shadow-sm'
                                          : 'bg-slate-900/80 border-slate-800/60 hover:bg-slate-800/60 text-slate-300'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-1.5 truncate">
                                          <span className="font-mono font-bold text-indigo-300">
                                            {dwg.drawingNumber}
                                          </span>
                                          <span className="truncate">{dwg.title}</span>
                                        </div>
                                        <span className="text-[10px] font-mono px-1 rounded bg-slate-800 text-slate-400">
                                          {dwg.revision}
                                        </span>
                                      </div>

                                      <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                                        <span className={`px-1.5 py-0.2 rounded border ${getDisciplineBadgeColor(dwg.discipline)}`}>
                                          {dwg.discipline}
                                        </span>
                                        <span className="flex items-center gap-1 font-mono">
                                          {dwg.crossReferences.length > 0 && (
                                            <span className="text-amber-400 font-semibold">
                                              {dwg.crossReferences.length} xref
                                            </span>
                                          )}
                                          {dwg.status === 'CONFLICT' && (
                                            <AlertTriangle className="w-3 h-3 text-red-400" />
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Drawing Details, Graph Relationships & Evidence (8 cols) */}
        <div className="col-span-12 md:col-span-8 flex flex-col bg-slate-900 overflow-y-auto">
          {selectedDrawing ? (
            <div className="p-5 space-y-5">
              {/* Header Info Banner */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold font-mono text-indigo-400">
                        {selectedDrawing.drawingNumber}
                      </span>
                      <h3 className="text-base font-semibold text-white">
                        {selectedDrawing.title}
                      </h3>
                      <span className={`px-2 py-0.5 rounded text-xs border ${getDisciplineBadgeColor(selectedDrawing.discipline)}`}>
                        {selectedDrawing.discipline}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 font-mono">
                        {selectedDrawing.revision}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      <span>Gedung: <strong className="text-slate-200">{selectedDrawing.building}</strong></span>
                      <span>&bull;</span>
                      <span>Lantai: <strong className="text-slate-200">{selectedDrawing.floor}</strong></span>
                      {selectedDrawing.zone && (
                        <>
                          <span>&bull;</span>
                          <span>Zona: <strong className="text-slate-200">{selectedDrawing.zone}</strong></span>
                        </>
                      )}
                      {selectedDrawing.scale && (
                        <>
                          <span>&bull;</span>
                          <span>Skala: <strong className="text-slate-200">{selectedDrawing.scale}</strong></span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedDrawing.isSuperseded && (
                      <span className="px-2 py-1 rounded text-xs bg-red-500/20 border border-red-500/30 text-red-400 font-semibold flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Superseded
                      </span>
                    )}
                    {selectedDrawing.isDuplicate && (
                      <span className="px-2 py-1 rounded text-xs bg-amber-500/20 border border-amber-500/30 text-amber-400 font-semibold flex items-center gap-1">
                        <Split className="w-3 h-3" /> Duplicate
                      </span>
                    )}
                  </div>
                </div>

                {/* Sub Navigation Tabs */}
                <div className="flex border-b border-slate-800 gap-4 pt-2 text-xs">
                  <button
                    onClick={() => setActiveTab('DETAILS')}
                    className={`pb-2 font-medium transition-colors border-b-2 ${
                      activeTab === 'DETAILS'
                        ? 'border-indigo-500 text-indigo-400 font-bold'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Overview & Pages ({selectedDrawing.pageIds.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('RELATIONSHIPS')}
                    className={`pb-2 font-medium transition-colors border-b-2 ${
                      activeTab === 'RELATIONSHIPS'
                        ? 'border-indigo-500 text-indigo-400 font-bold'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Drawing Relationships ({selectedRelationships.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('XREFS')}
                    className={`pb-2 font-medium transition-colors border-b-2 ${
                      activeTab === 'XREFS'
                        ? 'border-indigo-500 text-indigo-400 font-bold'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Cross References & Evidence ({selectedDrawing.crossReferences.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('CONFLICTS')}
                    className={`pb-2 font-medium transition-colors border-b-2 ${
                      activeTab === 'CONFLICTS'
                        ? 'border-indigo-500 text-indigo-400 font-bold'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Conflicts & Quality Audit ({selectedConflicts.length})
                  </button>
                </div>
              </div>

              {/* TAB 1: OVERVIEW & PAGES */}
              {activeTab === 'DETAILS' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Page Inventory Alignment
                    </h4>
                    <p className="text-xs text-slate-400">
                      Sesuai prinsip <strong>Page &ne; Entity &ne; RAB</strong>, gambar ini dipetakan dari lembar halaman dokumen fisik berikut:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedDrawing.pageIds.map((pId, idx) => (
                        <div key={pId} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-indigo-400" />
                            <span className="font-mono text-slate-300">{pId}</span>
                          </div>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400">
                            Page {idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Primary & Parent Hierarchy */}
                  {selectedDrawing.primaryDrawingId && (
                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
                      <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                        Primary / Master Drawing
                      </h4>
                      <p className="text-slate-400">
                        Gambar ini merinci elemen yang terpasang pada gambar denah induk:
                      </p>
                      <div
                        onClick={() => setSelectedDrawingId(selectedDrawing.primaryDrawingId!)}
                        className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 cursor-pointer flex items-center justify-between"
                      >
                        <span className="font-mono font-bold">{selectedDrawing.primaryDrawingId}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: RELATIONSHIPS */}
              {activeTab === 'RELATIONSHIPS' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    Koneksi visual & teknis antar lembar gambar dalam set dokumen:
                  </p>
                  {selectedRelationships.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
                      Belum ada relasi spesifik yang terdeteksi untuk gambar ini.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedRelationships.map(rel => {
                        const targetDwg = graph.drawings[rel.targetDrawingId] || graph.drawings[rel.sourceDrawingId];

                        return (
                          <div
                            key={rel.relationshipId}
                            className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-start justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  {rel.type}
                                </span>
                                <span className="text-slate-300 font-medium">{rel.description}</span>
                              </div>
                              {rel.evidenceSnippets && rel.evidenceSnippets.length > 0 && (
                                <div className="p-1.5 rounded bg-slate-900 border border-slate-800/80 font-mono text-[11px] text-slate-400 italic">
                                  "{rel.evidenceSnippets[0]}"
                                </div>
                              )}
                            </div>

                            {targetDwg && targetDwg.drawingId !== selectedDrawing.drawingId && (
                              <button
                                onClick={() => setSelectedDrawingId(targetDwg.drawingId)}
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 whitespace-nowrap"
                              >
                                View {targetDwg.drawingNumber}
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: CROSS REFERENCES & EVIDENCE */}
              {activeTab === 'XREFS' && (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2">
                    <Compass className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Prinsip Floor Awareness:</strong> Entitas seperti <code>{selectedDrawing.crossReferences[0]?.identifier || 'K1'}</code> pada {selectedDrawing.floor} dilacak secara terpisah dari lantai lain agar tidak terjadi agregasi volume keliru.
                    </span>
                  </div>

                  {selectedDrawing.crossReferences.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
                      Tidak ada entitas structural/architectural eksplisit yang terdeteksi di gambar ini.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedDrawing.crossReferences.map(xref => (
                        <div
                          key={xref.referenceId}
                          className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded font-mono font-bold bg-indigo-500/20 text-indigo-300 text-xs">
                                {xref.identifier}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                                {xref.category}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400">{xref.floor}</span>
                          </div>

                          <p className="font-mono text-[11px] text-slate-400 bg-slate-900 p-1.5 rounded border border-slate-800/80 truncate">
                            {xref.contextSnippet}
                          </p>

                          {xref.parameters && Object.keys(xref.parameters).length > 0 && (
                            <div className="flex flex-wrap gap-1 text-[10px]">
                              {Object.entries(xref.parameters).map(([k, v]) => (
                                <span key={k} className="px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-300">
                                  {k}: <strong>{String(v)}</strong>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: CONFLICTS & AUDIT */}
              {activeTab === 'CONFLICTS' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    Pemeriksaan inkonsistensi dimensi, material, atau pembesian antar lembar gambar:
                  </p>

                  {selectedConflicts.length === 0 ? (
                    <div className="p-6 text-center text-xs text-emerald-400 bg-emerald-500/5 rounded-xl border border-emerald-500/20 flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                      <span>Semua dimensi dan spesifikasi pada gambar ini konsisten dengan gambar terkait.</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedConflicts.map(conf => (
                        <div
                          key={conf.conflictId}
                          className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {getConflictBadge(conf.status)}
                              <span className="font-bold text-white">
                                {conf.discrepancyType} Mismatch: {conf.entityIdentifier}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400">{conf.floor}</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div className="p-2 rounded bg-slate-900 border border-slate-800 text-slate-300">
                              <span className="text-[10px] text-slate-500 block uppercase font-semibold">Sumber A</span>
                              <span>{conf.sourceDescription}</span>
                            </div>
                            <div className="p-2 rounded bg-slate-900 border border-slate-800 text-slate-300">
                              <span className="text-[10px] text-slate-500 block uppercase font-semibold">Sumber B (Terkait)</span>
                              <span>{conf.conflictingDescription}</span>
                            </div>
                          </div>

                          {conf.suggestedResolution && (
                            <p className="text-slate-400 text-xs italic bg-slate-900/50 p-2 rounded border border-slate-800/60">
                              Saran Resolusi: {conf.suggestedResolution}
                            </p>
                          )}

                          {onResolveConflict && conf.status === 'CONFLICT' && (
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => onResolveConflict(conf.conflictId, 'REVISION_RESOLVED')}
                                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                              >
                                Tandai Diselesaikan Revisi
                              </button>
                              <button
                                onClick={() => onResolveConflict(conf.conflictId, 'CONSISTENT')}
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                              >
                                Konfirmasi Konsisten
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-10 text-center text-slate-500 text-xs flex flex-col items-center justify-center h-full">
              <Compass className="w-10 h-10 text-slate-600 mb-2" />
              <span>Pilih lembar gambar dari pohon dokumen di sebelah kiri untuk melihat relasi dan bukti teknis.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
