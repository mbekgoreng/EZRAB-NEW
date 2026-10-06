import React, { useState } from 'react';
import {
  FolderOpen,
  FileText,
  Layers,
  ChevronRight,
  ChevronDown,
  Building,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Clock,
  ShieldCheck,
  Search,
  Filter,
  Eye,
  GitBranch,
  Network
} from 'lucide-react';
import { DocumentSet, DocumentPageInventoryItem } from '../../domain/document/documentSetTypes';

interface WholeDocumentIntelligenceViewProps {
  documentSet: DocumentSet;
  onSelectPage?: (page: DocumentPageInventoryItem) => void;
}

export const WholeDocumentIntelligenceView: React.FC<WholeDocumentIntelligenceViewProps> = ({
  documentSet,
  onSelectPage
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'inventory' | 'map'>('inventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [selectedPageId, setSelectedPageId] = useState<string>(documentSet.pages[0]?.pageId || '');
  const [expandedBuildings, setExpandedBuildings] = useState<Record<string, boolean>>({
    bld_gedung_utama: true
  });

  const toggleBuilding = (bldId: string) => {
    setExpandedBuildings(prev => ({ ...prev, [bldId]: !prev[bldId] }));
  };

  const filteredPages = documentSet.pages.filter(page => {
    const matchesSearch = 
      page.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (page.metadata.drawingNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (page.metadata.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.classification.pageRole.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === 'ALL' || page.classification.pageRole === roleFilter;

    return matchesSearch && matchesRole;
  });

  const selectedPage = documentSet.pages.find(p => p.pageId === selectedPageId) || documentSet.pages[0];

  return (
    <div className="space-y-4 text-slate-800 dark:text-slate-200">
      {/* 1. DOCUMENT SET OVERVIEW CARD */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl p-5 shadow-lg border border-blue-800/40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                Document Set Level
              </span>
              <span className="text-xs text-blue-200 font-mono">ID: {documentSet.documentSetId}</span>
            </div>
            <h3 className="text-lg font-bold mt-1 text-white">{documentSet.name}</h3>
            <p className="text-xs text-blue-200/80">
              Prinsip: Whole Document Understanding — Seluruh dokumen dianalisis secara terpadu sebagai satu set gambar kerja.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10">
            <div className="text-center px-2">
              <p className="text-[10px] text-blue-200 uppercase font-semibold">Total Dokumen</p>
              <p className="text-base font-bold text-white">{documentSet.documents.length}</p>
            </div>
            <div className="h-8 w-px bg-white/20" />
            <div className="text-center px-2">
              <p className="text-[10px] text-blue-200 uppercase font-semibold">Total Halaman</p>
              <p className="text-base font-bold text-white">{documentSet.totalPages}</p>
            </div>
            <div className="h-8 w-px bg-white/20" />
            <div className="text-center px-2">
              <p className="text-[10px] text-blue-200 uppercase font-semibold">Status Set</p>
              <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-400/30">
                {documentSet.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. SUB NAVIGATION TABS */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('inventory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeSubTab === 'inventory'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Page Inventory ({documentSet.pages.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('map')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeSubTab === 'map'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>Document Map Tree ({documentSet.documentMap?.totalBuildings || 1} Gedung)</span>
          </button>
        </div>

        {activeSubTab === 'inventory' && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari gambar, nomor, role..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:border-blue-500 w-48"
              />
            </div>
          </div>
        )}
      </div>

      {/* 3A. PAGE INVENTORY TABLE */}
      {activeSubTab === 'inventory' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 sticky top-0 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">No</th>
                    <th className="px-3 py-2.5 font-semibold">Drawing #</th>
                    <th className="px-3 py-2.5 font-semibold">Judul Gambar</th>
                    <th className="px-3 py-2.5 font-semibold">Disiplin</th>
                    <th className="px-3 py-2.5 font-semibold">Floor</th>
                    <th className="px-3 py-2.5 font-semibold">Page Role</th>
                    <th className="px-3 py-2.5 font-semibold">Rev</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredPages.map((page, idx) => (
                    <tr
                      key={page.pageId}
                      onClick={() => {
                        setSelectedPageId(page.pageId);
                        onSelectPage?.(page);
                      }}
                      className={`cursor-pointer transition-colors ${
                        selectedPageId === page.pageId
                          ? 'bg-blue-50/90 dark:bg-blue-950/50 font-medium'
                          : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="px-3 py-2 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {page.metadata.drawingNumber || `P-${page.pageNumber}`}
                      </td>
                      <td className="px-3 py-2 text-slate-900 dark:text-white max-w-[160px] truncate">
                        {page.metadata.title || page.fileName}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{page.metadata.discipline || '-'}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{page.metadata.floor || '-'}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {page.classification.pageRole}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-500">
                        {page.metadata.revision || 'REV 00'}
                      </td>
                      <td className="px-3 py-2">
                        {page.isSuperseded ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Superseded
                          </span>
                        ) : page.duplicateStatus === 'POSSIBLE_DUPLICATE' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400 flex items-center gap-1">
                            <Copy className="w-3 h-3" />
                            Duplikat
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Valid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Page Inspector Drawer */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            {selectedPage ? (
              <>
                <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                      {selectedPage.classification.pageRole}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Hal #{selectedPage.pageNumber}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                    {selectedPage.metadata.title || selectedPage.fileName}
                  </h4>
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-mono">
                    No. Gambar: {selectedPage.metadata.drawingNumber || 'N/A'} • Skala: {selectedPage.metadata.scale || 'N/A'}
                  </p>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Klasifikasi & Keyakinan</span>
                    <p className="text-slate-700 dark:text-slate-300 font-semibold mt-0.5">
                      {selectedPage.classification.reason} ({(selectedPage.classification.confidence * 100).toFixed(0)}%)
                    </p>
                  </div>

                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Bukti Klasifikasi</span>
                    <ul className="list-disc list-inside text-slate-600 dark:text-slate-400 text-[11px] space-y-0.5 mt-0.5">
                      {selectedPage.classification.evidence.map((ev, i) => (
                        <li key={i}>{ev}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Snippet Teks / Title Block</span>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 font-mono text-[10.5px] text-slate-600 dark:text-slate-400 max-h-24 overflow-y-auto mt-1 border border-slate-200 dark:border-slate-800">
                      {selectedPage.extractedText.slice(0, 300)}...
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center p-6 text-xs text-slate-400">Pilih salah satu halaman untuk melihat inspeksi metadata.</div>
            )}
          </div>
        </div>
      )}

      {/* 3B. DOCUMENT MAP TREE */}
      {activeSubTab === 'map' && documentSet.documentMap && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Hierarki Bangunan & Hubungan Antar Lembar Gambar
            </h4>
            <p className="text-xs text-slate-500">
              Memetakan struktur proyek dari Gedung $\rightarrow$ Lantai $\rightarrow$ Disiplin $\rightarrow$ Gambar Referensi.
            </p>
          </div>

          <div className="space-y-3">
            {documentSet.documentMap.buildings.map(bld => {
              const isExpanded = expandedBuildings[bld.buildingId] !== false;
              return (
                <div key={bld.buildingId} className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div
                    onClick={() => toggleBuilding(bld.buildingId)}
                    className="p-3 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Building className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{bld.buildingName}</span>
                      <span className="text-[10px] text-slate-400">({bld.floors.length} Lantai/Level)</span>
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>

                  {isExpanded && (
                    <div className="p-4 space-y-3 bg-white dark:bg-slate-900">
                      {bld.floors.map(fl => (
                        <div key={fl.floorId} className="pl-4 border-l-2 border-blue-500/40 space-y-2">
                          <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {fl.floorName}
                          </h5>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {Object.entries(fl.disciplines).map(([discName, discGroup]) => (
                              discGroup.pageCount > 0 && (
                                <div key={discName} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 text-xs">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-bold text-[11px] text-blue-600 dark:text-blue-400">{discName}</span>
                                    <span className="text-[10px] text-slate-400 font-bold">{discGroup.pageCount} lembar</span>
                                  </div>
                                  <div className="space-y-1">
                                    {discGroup.pages.map(p => (
                                      <div key={p.pageId} className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                                        <span className="font-mono">{p.metadata.drawingNumber || `Hal ${p.pageNumber}`}</span>
                                        <span className="text-slate-400 truncate max-w-[120px]">{p.metadata.title || p.fileName}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Relationships panel */}
          {documentSet.documentMap.relationships.length > 0 && (
            <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-indigo-500" />
                <span>Hubungan & Referensi Silang Gambar ({documentSet.documentMap.relationships.length})</span>
              </h5>
              <div className="space-y-1.5">
                {documentSet.documentMap.relationships.map((rel, i) => (
                  <div key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                      {rel.relationshipType}
                    </span>
                    <span>{rel.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
