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
    <div className="space-y-4 ez-text-primary dark:text-slate-200">
      {/* R-01 fix: layout utilities used in this component are absent from the compiled
          src/styles/magic-ai.css snapshot (no Tailwind build), so their layout
          is provided by these scoped classes (wdi-x*) with Tailwind values. */}
      <style hidden>{`
/* wdi-x1 <- flex-wrap */
.wdi-x1 { flex-wrap: wrap; }
/* wdi-x2 <- w-px */
.wdi-x2 { width: 1px; }
/* wdi-x3 <- inline-block */
.wdi-x3 { display: inline-block; }
/* wdi-x4 <- pb-2 */
.wdi-x4 { padding-bottom: 0.5rem; }
/* wdi-x5 <- left-2.5 */
.wdi-x5 { left: 0.625rem; }
/* wdi-x6 <- pl-8 pr-3 w-48 */
.wdi-x6 { padding-left: 2rem; padding-right: 0.75rem; width: 12rem; }
/* wdi-x7 <- lg:grid-cols-12 */
@media (min-width: 1024px) { .wdi-x7 { grid-template-columns: repeat(12, minmax(0, 1fr)); } }
/* wdi-x8 <- lg:col-span-8 */
@media (min-width: 1024px) { .wdi-x8 { grid-column: span 8 / span 8; } }
/* wdi-x9 <- max-h-[480px] */
.wdi-x9 { max-height: 480px; }
/* wdi-x10 <- max-w-[160px] */
.wdi-x10 { max-width: 160px; }
/* wdi-x11 <- lg:col-span-4 space-y-3 */
.wdi-x11 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.75rem; }
@media (min-width: 1024px) { .wdi-x11 { grid-column: span 4 / span 4; } }
/* wdi-x12 <- pb-2 */
.wdi-x12 { padding-bottom: 0.5rem; }
/* wdi-x13 <- mt-0.5 */
.wdi-x13 { margin-top: 0.125rem; }
/* wdi-x14 <- mt-0.5 space-y-0.5 */
.wdi-x14 { margin-top: 0.125rem; }
.wdi-x14 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.125rem; }
/* wdi-x15 <- max-h-24 p-2.5 */
.wdi-x15 { padding: 0.625rem; max-height: 6rem; }
/* wdi-x16 <- p-6 */
.wdi-x16 { padding: 1.5rem; }
/* wdi-x17 <- space-y-3 */
.wdi-x17 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.75rem; }
/* wdi-x18 <- space-y-3 */
.wdi-x18 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.75rem; }
/* wdi-x19 <- pl-4 */
.wdi-x19 { padding-left: 1rem; }
/* wdi-x20 <- md:grid-cols-3 */
@media (min-width: 768px) { .wdi-x20 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
/* wdi-x21 <- p-2.5 */
.wdi-x21 { padding: 0.625rem; }
/* wdi-x22 <- mb-1 */
.wdi-x22 { margin-bottom: 0.25rem; }
/* wdi-x23 <- max-w-[120px] */
.wdi-x23 { max-width: 120px; }
/* wdi-x24 <- py-0.2 */
.wdi-x24 { padding-top: 0.05rem; padding-bottom: 0.05rem; }
      
/* --- Stage 2A color fix: token warna di bawah ini tidak ada di snapshot
   src/styles/magic-ai.css sehingga sebelumnya tidak menghasilkan CSS.
   Nilai memakai token --ez-* (otomatis light/dark) atau hex literal
   warna authored untuk zona selalu-gelap (banner gradien, scrim,
   panel terminal/konsol). */
/* bg-amber-100 <- token EZ (bg-amber-100) */
.bg-amber-100 { background-color: var(--ez-color-warning-soft); }
/* bg-blue-100 <- token EZ (bg-blue-100) */
.bg-blue-100 { background-color: var(--ez-color-primary-soft); }
/* bg-blue-50/90 <- token EZ (bg-blue-50/90) */
.bg-blue-50\/90 { background-color: color-mix(in srgb, var(--ez-color-info-soft) 90%, transparent); }
/* bg-blue-500/20 <- literal authored (bg-blue-500/20) — zona selalu-gelap/scrim */
.bg-blue-500\/20 { background-color: rgba(59, 130, 246, 0.2); }
/* bg-blue-600 <- token EZ (bg-blue-600) */
.bg-blue-600 { background-color: var(--ez-color-primary); }
/* bg-emerald-100 <- token EZ (bg-emerald-100) */
.bg-emerald-100 { background-color: var(--ez-color-success-soft); }
/* bg-emerald-500/30 <- literal authored (bg-emerald-500/30) — zona selalu-gelap/scrim */
.bg-emerald-500\/30 { background-color: rgba(16, 185, 129, 0.3); }
/* bg-gradient-to-r <- gradient direction <- bg-gradient-to-r */
.bg-gradient-to-r { background-image: linear-gradient(to right, var(--tw-gradient-stops)); }
/* bg-purple-100 <- token EZ (bg-purple-100) */
.bg-purple-100 { background-color: var(--ez-ai-surface); }
/* bg-slate-100 <- token EZ (bg-slate-100) */
.bg-slate-100 { background-color: var(--ez-color-border); }
/* bg-slate-50 <- token EZ (bg-slate-50) */
.bg-slate-50 { background-color: var(--ez-color-border-soft); }
/* bg-white/20 <- literal authored (bg-white/20) — zona selalu-gelap/scrim */
.bg-white\/20 { background-color: rgba(255, 255, 255, 0.2); }
/* border-blue-400/30 <- literal authored (border-blue-400/30) — zona selalu-gelap/scrim */
.border-blue-400\/30 { border-color: rgba(96, 165, 250, 0.3); }
/* border-blue-500/40 <- token EZ (border-blue-500/40) */
.border-blue-500\/40 { border-color: color-mix(in srgb, var(--ez-color-primary) 40%, transparent); }
/* border-blue-800/40 <- literal authored (border-blue-800/40) — zona selalu-gelap/scrim */
.border-blue-800\/40 { border-color: rgba(30, 64, 175, 0.4); }
/* border-emerald-400/30 <- literal authored (border-emerald-400/30) — zona selalu-gelap/scrim */
.border-emerald-400\/30 { border-color: rgba(52, 211, 153, 0.3); }
/* border-slate-100 <- token EZ (border-slate-100) */
.border-slate-100 { border-color: var(--ez-color-border-soft); }
/* border-slate-200 <- token EZ (border-slate-200) */
.border-slate-200 { border-color: var(--ez-color-border); }
/* border-slate-200/80 <- token EZ (border-slate-200/80) */
.border-slate-200\/80 { border-color: color-mix(in srgb, var(--ez-color-border) 80%, transparent); }
/* border-white/10 <- literal authored (border-white/10) — zona selalu-gelap/scrim */
.border-white\/10 { border-color: rgba(255, 255, 255, 0.1); }
/* dark:bg-amber-950 <- dark: -> token EZ (bg-amber-950) */
[data-theme="dark"] .dark\:bg-amber-950 { background-color: var(--ez-color-warning-soft); }
/* dark:bg-blue-900/40 <- dark: -> token EZ (bg-blue-900/40) */
[data-theme="dark"] .dark\:bg-blue-900\/40 { background-color: var(--ez-color-primary-soft); }
/* dark:bg-blue-950 <- dark: -> token EZ (bg-blue-950) */
[data-theme="dark"] .dark\:bg-blue-950 { background-color: var(--ez-color-primary-soft); }
/* dark:bg-blue-950/50 <- dark: -> token EZ (bg-blue-950/50) */
[data-theme="dark"] .dark\:bg-blue-950\/50 { background-color: var(--ez-color-primary-soft); }
/* dark:bg-emerald-950 <- dark: -> token EZ (bg-emerald-950) */
[data-theme="dark"] .dark\:bg-emerald-950 { background-color: var(--ez-color-success-soft); }
/* dark:bg-purple-950 <- dark: -> token EZ (bg-purple-950) */
[data-theme="dark"] .dark\:bg-purple-950 { background-color: var(--ez-ai-surface); }
/* dark:bg-slate-800 <- dark: -> token EZ (bg-slate-800) */
[data-theme="dark"] .dark\:bg-slate-800 { background-color: var(--ez-color-surface-tertiary); }
/* dark:bg-slate-800/40 <- dark: -> token EZ (bg-slate-800/40) */
[data-theme="dark"] .dark\:bg-slate-800\/40 { background-color: color-mix(in srgb, var(--ez-color-surface-tertiary) 40%, transparent); }
/* dark:bg-slate-800/50 <- dark: -> token EZ (bg-slate-800/50) */
[data-theme="dark"] .dark\:bg-slate-800\/50 { background-color: color-mix(in srgb, var(--ez-color-surface-tertiary) 50%, transparent); }
/* dark:bg-slate-800/60 <- dark: -> token EZ (bg-slate-800/60) */
[data-theme="dark"] .dark\:bg-slate-800\/60 { background-color: color-mix(in srgb, var(--ez-color-surface-tertiary) 60%, transparent); }
/* dark:bg-slate-800/80 <- dark: -> token EZ (bg-slate-800/80) */
[data-theme="dark"] .dark\:bg-slate-800\/80 { background-color: color-mix(in srgb, var(--ez-color-surface-tertiary) 80%, transparent); }
/* dark:bg-slate-950 <- dark: -> token EZ (bg-slate-950) */
[data-theme="dark"] .dark\:bg-slate-950 { background-color: var(--ez-color-background); }
/* dark:border-slate-700 <- dark: -> token EZ (border-slate-700) */
[data-theme="dark"] .dark\:border-slate-700 { border-color: var(--ez-color-border-strong); }
/* dark:border-slate-700/60 <- dark: -> token EZ (border-slate-700/60) */
[data-theme="dark"] .dark\:border-slate-700\/60 { border-color: color-mix(in srgb, var(--ez-color-border-strong) 60%, transparent); }
/* dark:border-slate-800 <- dark: -> token EZ (border-slate-800) */
[data-theme="dark"] .dark\:border-slate-800 { border-color: var(--ez-color-border); }
/* dark:divide-slate-800 <- dark: -> token EZ (divide-slate-800) */
[data-theme="dark"] .dark\:divide-slate-800 > :not([hidden]) ~ :not([hidden]) { border-color: var(--ez-color-border); }
/* dark:hover:bg-slate-800 <- dark: -> token EZ (bg-slate-800) */
[data-theme="dark"] .dark\:hover\:bg-slate-800:hover { background-color: var(--ez-color-surface-tertiary); }
/* dark:hover:bg-slate-800/40 <- dark: -> token EZ (bg-slate-800/40) */
[data-theme="dark"] .dark\:hover\:bg-slate-800\/40:hover { background-color: color-mix(in srgb, var(--ez-color-surface-tertiary) 40%, transparent); }
/* dark:text-amber-400 <- dark: -> token EZ (text-amber-400) */
[data-theme="dark"] .dark\:text-amber-400 { color: var(--ez-hue-amber-text); }
/* dark:text-blue-300 <- dark: -> token EZ (text-blue-300) */
[data-theme="dark"] .dark\:text-blue-300 { color: var(--ez-hue-blue-text); }
/* dark:text-blue-400 <- dark: -> token EZ (text-blue-400) */
[data-theme="dark"] .dark\:text-blue-400 { color: var(--ez-hue-blue-text); }
/* dark:text-emerald-400 <- dark: -> token EZ (text-emerald-400) */
[data-theme="dark"] .dark\:text-emerald-400 { color: var(--ez-hue-green-text); }
/* dark:text-purple-400 <- dark: -> token EZ (text-purple-400) */
[data-theme="dark"] .dark\:text-purple-400 { color: var(--ez-hue-purple-text); }
/* dark:text-slate-200 <- dark: -> token EZ (text-slate-200) */
[data-theme="dark"] .dark\:text-slate-200 { color: var(--ez-color-text-primary); }
/* dark:text-slate-300 <- dark: -> token EZ (text-slate-300) */
[data-theme="dark"] .dark\:text-slate-300 { color: var(--ez-color-text-body); }
/* dark:text-slate-400 <- dark: -> token EZ (text-slate-400) */
[data-theme="dark"] .dark\:text-slate-400 { color: var(--ez-color-text-muted); }
/* dark:text-white <- dark: -> token EZ (text-white) */
[data-theme="dark"] .dark\:text-white { color: var(--ez-color-text-primary); }
/* divide-slate-100 <- token EZ (divide-slate-100) */
.divide-slate-100 > :not([hidden]) ~ :not([hidden]) { border-color: var(--ez-color-border-soft); }
/* focus:border-blue-500 <- token EZ (border-blue-500) */
.focus\:border-blue-500:focus { border-color: var(--ez-color-primary); }
/* from-blue-900 <- gradient stop <- from-blue-900 */
.from-blue-900 { --tw-gradient-from: #1E3A8A var(--tw-gradient-from-position); --tw-gradient-to: rgba(30, 58, 138, 0) var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
/* hover:bg-slate-100 <- token EZ (bg-slate-100) */
.hover\:bg-slate-100:hover { background-color: var(--ez-color-border); }
/* hover:bg-slate-50/50 <- token EZ (bg-slate-50/50) */
.hover\:bg-slate-50\/50:hover { background-color: color-mix(in srgb, var(--ez-color-border-soft) 50%, transparent); }
/* text-amber-800 <- token EZ (text-amber-800) */
.text-amber-800 { color: var(--ez-hue-amber-text-dark); }
/* text-blue-200 <- literal authored (text-blue-200) — zona selalu-gelap/scrim */
.text-blue-200 { color: #BFDBFE; }
/* text-blue-200/80 <- literal authored (text-blue-200/80) — zona selalu-gelap/scrim */
.text-blue-200\/80 { color: rgba(191, 219, 254, 0.8); }
/* text-blue-300 <- literal authored (text-blue-300) — zona selalu-gelap/scrim */
.text-blue-300 { color: #93C5FD; }
/* text-blue-600 <- token EZ (text-blue-600) */
.text-blue-600 { color: var(--ez-color-primary); }
/* text-blue-700 <- token EZ (text-blue-700) */
.text-blue-700 { color: var(--ez-color-primary-hover); }
/* text-blue-800 <- token EZ (text-blue-800) */
.text-blue-800 { color: var(--ez-hue-blue-text-deep); }
/* text-emerald-300 <- literal authored (text-emerald-300) — zona selalu-gelap/scrim */
.text-emerald-300 { color: #6EE7B7; }
/* text-emerald-800 <- token EZ (text-emerald-800) */
.text-emerald-800 { color: var(--ez-hue-green-text-deep); }
/* text-indigo-500 <- token EZ (text-indigo-500) */
.text-indigo-500 { color: var(--ez-hue-indigo-text); }
/* text-purple-800 <- token EZ (text-purple-800) */
.text-purple-800 { color: var(--ez-hue-purple-text); }
/* text-slate-400 <- token EZ (text-slate-400) */
.text-slate-400 { color: var(--ez-color-text-muted); }
/* text-slate-500 <- token EZ (text-slate-500) */
.text-slate-500 { color: var(--ez-color-text-muted); }
/* text-slate-600 <- token EZ (text-slate-600) */
.text-slate-600 { color: var(--ez-color-text-slate); }
/* text-slate-700 <- token EZ (text-slate-700) */
.text-slate-700 { color: var(--ez-color-text-body); }
/* text-slate-800 <- token EZ (text-slate-800) */
.text-slate-800 { color: var(--ez-color-text-strong); }
/* text-slate-900 <- token EZ (text-slate-900) */
.text-slate-900 { color: var(--ez-color-text-primary); }
/* to-indigo-950 <- gradient stop <- to-indigo-950 */
.to-indigo-950 { --tw-gradient-to: #1E1B4B var(--tw-gradient-to-position); }
`}</style>
      {/* 1. DOCUMENT SET OVERVIEW CARD */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl p-5 shadow-lg border border-blue-800/40">
        <div className="flex items-center justify-between gap-4 wdi-x1">
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
            <div className="h-8 bg-white/20 wdi-x2" />
            <div className="text-center px-2">
              <p className="text-[10px] text-blue-200 uppercase font-semibold">Total Halaman</p>
              <p className="text-base font-bold text-white">{documentSet.totalPages}</p>
            </div>
            <div className="h-8 bg-white/20 wdi-x2" />
            <div className="text-center px-2">
              <p className="text-[10px] text-blue-200 uppercase font-semibold">Status Set</p>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 wdi-x3">
                {documentSet.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. SUB NAVIGATION TABS */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 wdi-x4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('inventory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeSubTab === 'inventory'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'ez-text-slate dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                : 'ez-text-slate dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>Document Map Tree ({documentSet.documentMap?.totalBuildings || 1} Gedung)</span>
          </button>
        </div>

        {activeSubTab === 'inventory' && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 text-slate-400 wdi-x5" />
              <input
                type="text"
                placeholder="Cari gambar, nomor, role..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 ez-bg-surface focus:outline-none focus:border-blue-500 wdi-x6"
              />
            </div>
          </div>
        )}
      </div>

      {/* 3A. PAGE INVENTORY TABLE */}
      {activeSubTab === 'inventory' && (
        <div className="grid grid-cols-1 gap-4 wdi-x7">
          <div className="ez-bg-surface rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm wdi-x8">
            <div className="overflow-x-auto wdi-x9">
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
                      <td className="px-3 py-2 ez-text-primary dark:text-white truncate wdi-x10">
                        {page.metadata.title || page.fileName}
                      </td>
                      <td className="px-3 py-2 ez-text-slate dark:text-slate-400">{page.metadata.discipline || '-'}</td>
                      <td className="px-3 py-2 ez-text-slate dark:text-slate-400">{page.metadata.floor || '-'}</td>
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
          <div className="ez-bg-surface rounded-xl border border-slate-200 dark:border-slate-800 p-4 wdi-x11">
            {selectedPage ? (
              <>
                <div className="border-b border-slate-100 dark:border-slate-800 wdi-x12">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                      {selectedPage.classification.pageRole}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Hal #{selectedPage.pageNumber}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold ez-text-primary dark:text-white mt-1">
                    {selectedPage.metadata.title || selectedPage.fileName}
                  </h4>
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-mono">
                    No. Gambar: {selectedPage.metadata.drawingNumber || 'N/A'} • Skala: {selectedPage.metadata.scale || 'N/A'}
                  </p>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Klasifikasi & Keyakinan</span>
                    <p className="ez-text-body dark:text-slate-300 font-semibold wdi-x13">
                      {selectedPage.classification.reason} ({(selectedPage.classification.confidence * 100).toFixed(0)}%)
                    </p>
                  </div>

                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Bukti Klasifikasi</span>
                    <ul className="list-disc list-inside ez-text-slate dark:text-slate-400 text-[11px] wdi-x14">
                      {selectedPage.classification.evidence.map((ev, i) => (
                        <li key={i}>{ev}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Snippet Teks / Title Block</span>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-950 font-mono text-[10.5px] text-slate-600 dark:text-slate-400 overflow-y-auto mt-1 border border-slate-200 dark:border-slate-800 wdi-x15">
                      {selectedPage.extractedText.slice(0, 300)}...
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-xs text-slate-400 wdi-x16">Pilih salah satu halaman untuk melihat inspeksi metadata.</div>
            )}
          </div>
        </div>
      )}

      {/* 3B. DOCUMENT MAP TREE */}
      {activeSubTab === 'map' && documentSet.documentMap && (
        <div className="ez-bg-surface rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
          <div>
            <h4 className="text-sm font-bold ez-text-primary dark:text-white">
              Hierarki Bangunan & Hubungan Antar Lembar Gambar
            </h4>
            <p className="text-xs text-slate-500">
              Memetakan struktur proyek dari Gedung $\rightarrow$ Lantai $\rightarrow$ Disiplin $\rightarrow$ Gambar Referensi.
            </p>
          </div>

          <div className="wdi-x17">
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
                    <div className="p-4 ez-bg-surface wdi-x18">
                      {bld.floors.map(fl => (
                        <div key={fl.floorId} className="border-l-2 border-blue-500/40 space-y-2 wdi-x19">
                          <h5 className="text-xs font-bold ez-text-primary dark:text-slate-200">
                            {fl.floorName}
                          </h5>

                          <div className="grid grid-cols-1 gap-2 wdi-x20">
                            {Object.entries(fl.disciplines).map(([discName, discGroup]) => (
                              discGroup.pageCount > 0 && (
                                <div key={discName} className="rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 text-xs wdi-x21">
                                  <div className="flex items-center justify-between wdi-x22">
                                    <span className="font-bold text-[11px] text-blue-600 dark:text-blue-400">{discName}</span>
                                    <span className="text-[10px] text-slate-400 font-bold">{discGroup.pageCount} lembar</span>
                                  </div>
                                  <div className="space-y-1">
                                    {discGroup.pages.map(p => (
                                      <div key={p.pageId} className="flex items-center justify-between text-[11px] ez-text-slate dark:text-slate-300">
                                        <span className="font-mono">{p.metadata.drawingNumber || `Hal ${p.pageNumber}`}</span>
                                        <span className="text-slate-400 truncate wdi-x23">{p.metadata.title || p.fileName}</span>
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
                  <div key={i} className="text-xs ez-text-slate dark:text-slate-400 flex items-center gap-2">
                    <span className="px-1.5 rounded text-[10px] font-mono bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 wdi-x24">
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
