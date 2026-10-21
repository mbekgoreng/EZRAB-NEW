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
    <div className="ez-text-primary drd-x1">
      {/* R-01 fix: layout utilities used in this component are absent from the compiled
          src/styles/magic-ai.css snapshot (no Tailwind build), so their layout
          is provided by these scoped classes (drd-x*) with Tailwind values. */}
      <style hidden>{`
/* drd-x1 <- space-y-6 */
.drd-x1 > :not([hidden]) ~ :not([hidden]) { margin-top: 1.5rem; }
/* drd-x2 <- md:flex-row md:items-center */
@media (min-width: 768px) { .drd-x2 { flex-direction: row; align-items: center; } }
/* drd-x3 <- mb-1 */
.drd-x3 { margin-bottom: 0.25rem; }
/* drd-x4 <- items-stretch sm:flex-row sm:items-center */
.drd-x4 { align-items: stretch; }
@media (min-width: 640px) { .drd-x4 { flex-direction: row; align-items: center; } }
/* drd-x5 <- block */
.drd-x5 { display: block; }
/* drd-x6 <- gap-2.5 pt-4 sm:grid-cols-6 */
.drd-x6 { gap: 0.625rem; padding-top: 1rem; }
@media (min-width: 640px) { .drd-x6 { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
/* drd-x7 <- block */
.drd-x7 { display: block; }
/* drd-x8 <- block */
.drd-x8 { display: block; }
/* drd-x9 <- block */
.drd-x9 { display: block; }
/* drd-x10 <- block */
.drd-x10 { display: block; }
/* drd-x11 <- block */
.drd-x11 { display: block; }
/* drd-x12 <- block */
.drd-x12 { display: block; }
/* drd-x13 <- block mt-0.5 */
.drd-x13 { display: block; margin-top: 0.125rem; }
/* drd-x14 <- sm:flex-row sm:items-center */
@media (min-width: 640px) { .drd-x14 { flex-direction: row; align-items: center; } }
/* drd-x15 <- top-2.5 */
.drd-x15 { top: 0.625rem; }
/* drd-x16 <- pl-9 pr-3 sm:w-64 */
.drd-x16 { padding-left: 2.25rem; padding-right: 0.75rem; }
@media (min-width: 640px) { .drd-x16 { width: 16rem; } }
/* drd-x17 <- gap-2.5 */
.drd-x17 { gap: 0.625rem; }
/* drd-x18 <- mt-0.5 */
.drd-x18 { margin-top: 0.125rem; }
/* drd-x19 <- py-0.2 */
.drd-x19 { padding-top: 0.05rem; padding-bottom: 0.05rem; }
/* drd-x20 <- py-0.2 */
.drd-x20 { padding-top: 0.05rem; padding-bottom: 0.05rem; }
/* drd-x21 <- py-0.2 */
.drd-x21 { padding-top: 0.05rem; padding-bottom: 0.05rem; }
/* drd-x22 <- py-0.2 */
.drd-x22 { padding-top: 0.05rem; padding-bottom: 0.05rem; }
/* drd-x23 <- z-50 */
.drd-x23 { z-index: 50; }
/* drd-x24 <- max-w-2xl p-6 */
.drd-x24 { max-width: 42rem; padding: 1.5rem; }
/* drd-x25 <- pb-3 */
.drd-x25 { padding-bottom: 0.75rem; }
/* drd-x26 <- p-3.5 */
.drd-x26 { padding: 0.875rem; }
/* drd-x27 <- block */
.drd-x27 { display: block; }
/* drd-x28 <- p-2.5 */
.drd-x28 { padding: 0.625rem; }
/* drd-x29 <- pt-1 */
.drd-x29 { padding-top: 0.25rem; }
/* drd-x30 <- gap-2.5 */
.drd-x30 { gap: 0.625rem; }
/* drd-x31 <- mt-0.5 */
.drd-x31 { margin-top: 0.125rem; }
/* drd-x32 <- mt-0.5 */
.drd-x32 { margin-top: 0.125rem; }
/* drd-x33 <- justify-end pt-2 */
.drd-x33 { justify-content: flex-end; padding-top: 0.5rem; }
/* drd-x34 <- z-50 */
.drd-x34 { z-index: 50; }
/* drd-x35 <- max-w-lg p-6 */
.drd-x35 { max-width: 32rem; padding: 1.5rem; }
/* drd-x36 <- p-3.5 */
.drd-x36 { padding: 0.875rem; }
/* drd-x37 <- pt-2 */
.drd-x37 { padding-top: 0.5rem; }
/* drd-x38 <- justify-end pt-2 */
.drd-x38 { justify-content: flex-end; padding-top: 0.5rem; }
      
/* --- Stage 2A color fix: token warna di bawah ini tidak ada di snapshot
   src/styles/magic-ai.css sehingga sebelumnya tidak menghasilkan CSS.
   Nilai memakai token --ez-* (otomatis light/dark) atau hex literal
   warna authored untuk zona selalu-gelap (banner gradien, scrim,
   panel terminal/konsol). */
/* bg-amber-50 <- token EZ (bg-amber-50) */
.bg-amber-50 { background-color: var(--ez-color-warning-soft); }
/* bg-amber-500/20 <- literal authored (bg-amber-500/20) — zona selalu-gelap/scrim */
.bg-amber-500\/20 { background-color: rgba(245, 158, 11, 0.2); }
/* bg-blue-50 <- token EZ (bg-blue-50) */
.bg-blue-50 { background-color: var(--ez-color-info-soft); }
/* bg-blue-50/60 <- token EZ (bg-blue-50/60) */
.bg-blue-50\/60 { background-color: color-mix(in srgb, var(--ez-color-info-soft) 60%, transparent); }
/* bg-blue-500/20 <- literal authored (bg-blue-500/20) — zona selalu-gelap/scrim */
.bg-blue-500\/20 { background-color: rgba(59, 130, 246, 0.2); }
/* bg-emerald-50 <- token EZ (bg-emerald-50) */
.bg-emerald-50 { background-color: var(--ez-color-success-soft); }
/* bg-emerald-500/20 <- literal authored (bg-emerald-500/20) — zona selalu-gelap/scrim */
.bg-emerald-500\/20 { background-color: rgba(16, 185, 129, 0.2); }
/* bg-emerald-600 <- token EZ (bg-emerald-600) */
.bg-emerald-600 { background-color: #059669; }
/* bg-gradient-to-r <- gradient direction <- bg-gradient-to-r */
.bg-gradient-to-r { background-image: linear-gradient(to right, var(--tw-gradient-stops)); }
/* bg-indigo-100 <- token EZ (bg-indigo-100) */
.bg-indigo-100 { background-color: var(--ez-color-primary-soft); }
/* bg-indigo-50 <- token EZ (bg-indigo-50) */
.bg-indigo-50 { background-color: var(--ez-ai-surface); }
/* bg-indigo-600 <- token EZ (bg-indigo-600) */
.bg-indigo-600 { background-color: var(--ez-color-primary); }
/* bg-rose-50 <- token EZ (bg-rose-50) */
.bg-rose-50 { background-color: var(--ez-color-danger-soft); }
/* bg-slate-100 <- token EZ (bg-slate-100) */
.bg-slate-100 { background-color: var(--ez-color-border); }
/* bg-slate-50 <- token EZ (bg-slate-50) */
.bg-slate-50 { background-color: var(--ez-color-border-soft); }
/* bg-slate-50/60 <- token EZ (bg-slate-50/60) */
.bg-slate-50\/60 { background-color: color-mix(in srgb, var(--ez-color-border-soft) 60%, transparent); }
/* bg-slate-800 <- literal authored (bg-slate-800) — zona selalu-gelap/scrim */
.bg-slate-800 { background-color: #1E293B; }
/* bg-slate-800/60 <- literal authored (bg-slate-800/60) — zona selalu-gelap/scrim */
.bg-slate-800\/60 { background-color: rgba(30, 41, 59, 0.6); }
/* bg-slate-900/60 <- literal authored (bg-slate-900/60) — zona selalu-gelap/scrim */
.bg-slate-900\/60 { background-color: rgba(15, 23, 42, 0.6); }
/* bg-slate-900/70 <- literal authored (bg-slate-900/70) — zona selalu-gelap/scrim */
.bg-slate-900\/70 { background-color: rgba(15, 23, 42, 0.7); }
/* border-amber-200 <- token EZ (border-amber-200) */
.border-amber-200 { border-color: color-mix(in srgb, var(--ez-color-warning) 32%, var(--ez-color-surface)); }
/* border-amber-500/30 <- literal authored (border-amber-500/30) — zona selalu-gelap/scrim */
.border-amber-500\/30 { border-color: rgba(245, 158, 11, 0.3); }
/* border-blue-100 <- token EZ (border-blue-100) */
.border-blue-100 { border-color: color-mix(in srgb, var(--ez-color-primary) 18%, var(--ez-color-surface)); }
/* border-blue-200 <- token EZ (border-blue-200) */
.border-blue-200 { border-color: color-mix(in srgb, var(--ez-color-primary) 32%, var(--ez-color-surface)); }
/* border-blue-500/30 <- literal authored (border-blue-500/30) — zona selalu-gelap/scrim */
.border-blue-500\/30 { border-color: rgba(59, 130, 246, 0.3); }
/* border-emerald-200 <- token EZ (border-emerald-200) */
.border-emerald-200 { border-color: color-mix(in srgb, var(--ez-color-success) 32%, var(--ez-color-surface)); }
/* border-emerald-500/30 <- literal authored (border-emerald-500/30) — zona selalu-gelap/scrim */
.border-emerald-500\/30 { border-color: rgba(16, 185, 129, 0.3); }
/* border-indigo-100 <- token EZ (border-indigo-100) */
.border-indigo-100 { border-color: color-mix(in srgb, var(--ez-hue-indigo-text) 18%, var(--ez-color-surface)); }
/* border-indigo-200 <- token EZ (border-indigo-200) */
.border-indigo-200 { border-color: color-mix(in srgb, var(--ez-hue-indigo-text) 32%, var(--ez-color-surface)); }
/* border-rose-200 <- token EZ (border-rose-200) */
.border-rose-200 { border-color: color-mix(in srgb, var(--ez-color-danger) 32%, var(--ez-color-surface)); }
/* border-slate-100 <- token EZ (border-slate-100) */
.border-slate-100 { border-color: var(--ez-color-border-soft); }
/* border-slate-200 <- token EZ (border-slate-200) */
.border-slate-200 { border-color: var(--ez-color-border); }
/* border-white/10 <- token EZ (border-white/10) */
.border-white\/10 { border-color: rgba(255, 255, 255, 0.1); }
/* border-white/15 <- token EZ (border-white/15) */
.border-white\/15 { border-color: rgba(255, 255, 255, 0.15); }
/* divide-slate-100 <- token EZ (divide-slate-100) */
.divide-slate-100 > :not([hidden]) ~ :not([hidden]) { border-color: var(--ez-color-border-soft); }
/* focus:border-indigo-500 <- token EZ (border-indigo-500) */
.focus\:border-indigo-500:focus { border-color: var(--ez-color-primary); }
/* from-slate-900 <- gradient stop <- from-slate-900 */
.from-slate-900 { --tw-gradient-from: #0F172A var(--tw-gradient-from-position); --tw-gradient-to: rgba(15, 23, 42, 0) var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
/* hover:bg-emerald-500 <- literal authored (bg-emerald-500) — zona selalu-gelap/scrim */
.hover\:bg-emerald-500:hover { background-color: #10B981; }
/* hover:bg-slate-100 <- token EZ (bg-slate-100) */
.hover\:bg-slate-100:hover { background-color: var(--ez-color-border); }
/* hover:bg-slate-200 <- token EZ (bg-slate-200) */
.hover\:bg-slate-200:hover { background-color: color-mix(in srgb, var(--ez-color-border) 55%, var(--ez-color-text-muted)); }
/* hover:bg-slate-50/80 <- token EZ (bg-slate-50/80) */
.hover\:bg-slate-50\/80:hover { background-color: color-mix(in srgb, var(--ez-color-border-soft) 80%, transparent); }
/* hover:bg-slate-700 <- literal authored (bg-slate-700) — zona selalu-gelap/scrim */
.hover\:bg-slate-700:hover { background-color: #334155; }
/* hover:text-slate-600 <- token EZ (text-slate-600) */
.hover\:text-slate-600:hover { color: var(--ez-color-text-slate); }
/* text-amber-300 <- literal authored (text-amber-300) — zona selalu-gelap/scrim */
.text-amber-300 { color: #FCD34D; }
/* text-amber-400 <- literal authored (text-amber-400) — zona selalu-gelap/scrim */
.text-amber-400 { color: #FBBF24; }
/* text-amber-700 <- token EZ (text-amber-700) */
.text-amber-700 { color: var(--ez-hue-amber-text); }
/* text-blue-300 <- literal authored (text-blue-300) — zona selalu-gelap/scrim */
.text-blue-300 { color: #93C5FD; }
/* text-blue-400 <- literal authored (text-blue-400) — zona selalu-gelap/scrim */
.text-blue-400 { color: #60A5FA; }
/* text-blue-600 <- token EZ (text-blue-600) */
.text-blue-600 { color: var(--ez-color-primary); }
/* text-blue-700 <- token EZ (text-blue-700) */
.text-blue-700 { color: var(--ez-color-primary-hover); }
/* text-blue-800 <- token EZ (text-blue-800) */
.text-blue-800 { color: var(--ez-hue-blue-text-deep); }
/* text-blue-900 <- token EZ (text-blue-900) */
.text-blue-900 { color: var(--ez-hue-blue-text-deep); }
/* text-emerald-300 <- literal authored (text-emerald-300) — zona selalu-gelap/scrim */
.text-emerald-300 { color: #6EE7B7; }
/* text-emerald-400 <- literal authored (text-emerald-400) — zona selalu-gelap/scrim */
.text-emerald-400 { color: #34D399; }
/* text-emerald-600 <- token EZ (text-emerald-600) */
.text-emerald-600 { color: var(--ez-color-success); }
/* text-emerald-700 <- token EZ (text-emerald-700) */
.text-emerald-700 { color: var(--ez-hue-green-text-deep); }
/* text-indigo-600 <- token EZ (text-indigo-600) */
.text-indigo-600 { color: var(--ez-hue-indigo-text); }
/* text-indigo-700 <- token EZ (text-indigo-700) */
.text-indigo-700 { color: var(--ez-hue-indigo-text); }
/* text-indigo-800 <- token EZ (text-indigo-800) */
.text-indigo-800 { color: var(--ez-hue-indigo-text); }
/* text-purple-300 <- literal authored (text-purple-300) — zona selalu-gelap/scrim */
.text-purple-300 { color: #D8B4FE; }
/* text-purple-400 <- literal authored (text-purple-400) — zona selalu-gelap/scrim */
.text-purple-400 { color: #C084FC; }
/* text-rose-300 <- literal authored (text-rose-300) — zona selalu-gelap/scrim */
.text-rose-300 { color: #FDA4AF; }
/* text-rose-400 <- literal authored (text-rose-400) — zona selalu-gelap/scrim */
.text-rose-400 { color: #FB7185; }
/* text-rose-700 <- token EZ (text-rose-700) */
.text-rose-700 { color: var(--ez-hue-rose-text); }
/* text-slate-300 <- literal authored (text-slate-300) — zona selalu-gelap/scrim */
.text-slate-300 { color: #CBD5E1; }
/* text-slate-400 <- literal authored (text-slate-400) — zona selalu-gelap/scrim */
.text-slate-400 { color: #94A3B8; }
/* text-slate-500 <- token EZ (text-slate-500) */
.text-slate-500 { color: var(--ez-color-text-muted); }
/* text-slate-600 <- token EZ (text-slate-600) */
.text-slate-600 { color: var(--ez-color-text-slate); }
/* text-slate-700 <- token EZ (text-slate-700) */
.text-slate-700 { color: var(--ez-color-text-body); }
/* to-blue-950 <- gradient stop <- to-blue-950 */
.to-blue-950 { --tw-gradient-to: #172554 var(--tw-gradient-to-position); }
/* via-indigo-950 <- gradient stop <- via-indigo-950 */
.via-indigo-950 { --tw-gradient-to: rgba(30, 27, 75, 0) var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), #1E1B4B var(--tw-gradient-via-position), var(--tw-gradient-to); }
`}</style>
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-xl p-5 shadow-lg">
        <div className="flex flex-col justify-between gap-4 drd-x2">
          <div>
            <div className="flex items-center gap-2 drd-x3">
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

          <div className="flex flex-col gap-3 drd-x4">
            <div className="bg-white/10 backdrop-blur-sm px-4 py-2.5 rounded-lg border border-white/15 text-center">
              <span className="text-[11px] uppercase tracking-wider text-slate-300 font-medium drd-x5">Grand Total RAB</span>
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
        <div className="grid grid-cols-2 mt-5 border-t border-white/10 text-center drd-x6">
          <div className="bg-slate-800/60 p-2 rounded-lg">
            <span className="text-[11px] text-slate-400 drd-x7">Total Items</span>
            <span className="text-base font-bold text-white">{summary.totalItems}</span>
          </div>
          <div className="bg-slate-800/60 p-2 rounded-lg">
            <span className="text-[11px] text-emerald-400 drd-x8">Mapped WBS</span>
            <span className="text-base font-bold text-emerald-300">{summary.mappedItemsCount}</span>
          </div>
          <div className="bg-slate-800/60 p-2 rounded-lg">
            <span className="text-[11px] text-amber-400 drd-x9">Missing AHSP</span>
            <span className="text-base font-bold text-amber-300">{summary.missingAhspCount}</span>
          </div>
          <div className="bg-slate-800/60 p-2 rounded-lg">
            <span className="text-[11px] text-rose-400 drd-x10">Missing Price</span>
            <span className="text-base font-bold text-rose-300">{summary.missingPriceCount}</span>
          </div>
          <div className="bg-slate-800/60 p-2 rounded-lg">
            <span className="text-[11px] text-purple-400 drd-x11">Conflicts</span>
            <span className="text-base font-bold text-purple-300">{summary.conflictsCount}</span>
          </div>
          <div className="bg-slate-800/60 p-2 rounded-lg">
            <span className="text-[11px] text-blue-400 drd-x12">Subtotal (Netto)</span>
            <span className="text-xs font-bold text-blue-300 truncate drd-x13">
              {formatCurrencyIDR(summary.subtotal)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Filter Toolbar */}
      <div className="flex flex-col justify-between gap-3 ez-bg-surface p-3 rounded-lg border border-slate-200 drd-x14">
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
          <Search className="w-4 h-4 text-slate-400 absolute left-3 drd-x15" />
          <input
            type="text"
            placeholder="Cari deskripsi, WBS, AHSP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="py-1.5 text-xs rounded-md border border-slate-200 w-full focus:outline-none focus:border-indigo-500 drd-x16"
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
            <div key={group.wbsCode} className="border border-slate-200 rounded-lg overflow-hidden ez-bg-surface shadow-sm">
              {/* Group Header */}
              <div
                onClick={() => toggleWbs(group.wbsCode)}
                className="px-4 py-3 bg-slate-50 hover:bg-slate-100 cursor-pointer flex items-center justify-between border-b border-slate-200 transition-colors"
              >
                <div className="flex items-center drd-x17">
                  {isExp ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                  <span className="font-mono font-bold text-indigo-700 text-xs">{group.wbsCode}</span>
                  <span className="font-bold ez-text-primary text-xs uppercase">{group.wbsTitle}</span>
                  <span className="text-[11px] text-slate-500">({group.itemsCount} item)</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">Subtotal:</span>
                  <span className="font-bold text-xs ez-text-primary font-mono">
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
                            <div className="font-semibold ez-text-primary">{item.description}</div>
                            <div className="flex items-center gap-2 drd-x18">
                              {item.validationStatus === 'VALID' ? (
                                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 rounded font-medium border border-emerald-200 drd-x19">
                                  Valid
                                </span>
                              ) : item.validationStatus === 'WARNING' ? (
                                <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 rounded font-medium border border-amber-200 drd-x20">
                                  Warning
                                </span>
                              ) : (
                                <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 rounded font-medium border border-blue-200 drd-x21">
                                  Review
                                </span>
                              )}
                              {item.quantityProvenance.status === 'CONFLICT' && (
                                <span className="text-[10px] text-rose-700 bg-rose-50 px-1.5 rounded font-medium border border-rose-200 drd-x22">
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
                          <td className="py-2.5 px-3 font-mono font-bold text-right ez-text-primary">
                            {item.volume.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 ez-text-slate">{item.unit}</td>
                          <td className="py-2.5 px-3 font-mono text-right ez-text-body">
                            {formatCurrencyIDR(item.unitPrice)}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-right ez-text-primary">
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
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in drd-x23">
          <div className="ez-bg-surface rounded-xl shadow-2xl border border-slate-200 w-full space-y-4 drd-x24">
            <div className="flex items-start justify-between border-b border-slate-100 drd-x25">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800 font-mono">
                  {selectedItemForTrace.wbsCode} • {selectedItemForTrace.sourceTrace.entityIdentifier}
                </span>
                <h3 className="text-base font-bold ez-text-primary mt-1">
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
            <div className="bg-slate-50 rounded-lg border border-slate-200 space-y-2 drd-x26">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 drd-x27">
                Formula Perhitungan Volume Deterministik
              </span>
              <div className="font-mono text-xs ez-text-primary font-bold ez-bg-surface rounded border border-indigo-100 drd-x28">
                {selectedItemForTrace.quantityProvenance.formula}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs drd-x29">
                <div>
                  <span className="text-slate-500">Metode Kalkulasi:</span>{' '}
                  <strong className="ez-text-primary">{selectedItemForTrace.quantityProvenance.calculationMethod}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Status Volume:</span>{' '}
                  <strong className="text-emerald-700">{selectedItemForTrace.quantityProvenance.status}</strong>
                </div>
              </div>
            </div>

            {/* DED Drawing & Page Provenance */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 drd-x27">
                Evidence Dokumen & Gambar Sumber DED
              </span>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {selectedItemForTrace.quantityProvenance.sourceEvidence.map((ev, idx) => (
                  <div key={idx} className="p-3 ez-bg-surface flex items-start text-xs drd-x30">
                    <FileCode className="w-4 h-4 text-blue-600 shrink-0 drd-x31" />
                    <div>
                      <div className="font-semibold ez-text-primary">
                        {ev.drawingId} • Halaman {ev.pageNumber} ({ev.fileName})
                      </div>
                      <p className="ez-text-slate text-[11px] drd-x32">{ev.snippet}</p>
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

            <div className="flex drd-x33">
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
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in drd-x34">
          <div className="ez-bg-surface rounded-xl shadow-2xl border border-slate-200 w-full space-y-4 drd-x35">
            <div className="flex items-center gap-3 text-emerald-600">
              <ShieldCheck className="w-8 h-8" />
              <div>
                <h3 className="text-base font-bold ez-text-primary">Konfirmasi Finalisasi RAB</h3>
                <p className="text-xs text-slate-500">Preview Gate: Tidak ada perubahan langsung tanpa audit Anda.</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2 drd-x36">
              <div className="flex justify-between">
                <span className="ez-text-slate">Total Item Terpetakan:</span>
                <strong className="ez-text-primary">{summary.mappedItemsCount} item</strong>
              </div>
              <div className="flex justify-between">
                <span className="ez-text-slate">Item Memerlukan Review:</span>
                <strong className="text-amber-700">{summary.needsReviewCount} item</strong>
              </div>
              <div className="flex justify-between border-t border-slate-200 drd-x37">
                <span className="ez-text-body font-bold">Total Nilai RAB:</span>
                <strong className="text-emerald-700 font-bold font-mono text-sm">
                  {formatCurrencyIDR(summary.grandTotal)}
                </strong>
              </div>
            </div>

            <p className="text-xs ez-text-slate leading-relaxed">
              Dengan mengklik tombol di bawah, item-item RAB draft ini akan dimasukkan ke spreadsheet utama proyek dan dapat diedit secara leluasa.
            </p>

            <div className="flex gap-2 drd-x38">
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
