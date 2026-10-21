import React, { useState } from 'react';
import {
  TemplateMappingContext,
  EntityWbsMapping,
  ExtractedConstructionParameter,
  AdaptiveWbsNode,
  TemplateValidationFinding
} from '../../domain/document/templateMappingTypes';
import {
  LayoutTemplate,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  Layers,
  FileCode,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Filter,
  Sparkles,
  Info,
  GitMerge,
  Sliders,
  AlertCircle
} from 'lucide-react';

interface TemplateMappingReviewViewProps {
  context: TemplateMappingContext;
}

export const TemplateMappingReviewView: React.FC<TemplateMappingReviewViewProps> = ({ context }) => {
  const [activeTab, setActiveTab] = useState<'wbs' | 'mappings' | 'parameters' | 'validation'>('wbs');
  const [mappingFilter, setMappingFilter] = useState<string>('ALL');
  const [expandedWbsCodes, setExpandedWbsCodes] = useState<Set<string>>(new Set(['01', '02', '03']));

  const toggleWbsExpand = (code: string) => {
    const next = new Set(expandedWbsCodes);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setExpandedWbsCodes(next);
  };

  const {
    templateSnapshot,
    parameterSet,
    adaptiveWBS,
    mappedEntities,
    unmappedEntities,
    conditionalWorkActivated,
    coverage,
    validationFindings
  } = context;

  const allMappings = [...mappedEntities, ...unmappedEntities];

  const filteredMappings = allMappings.filter(m => {
    if (mappingFilter === 'ALL') return true;
    return m.status === mappingFilter;
  });

  return (
    <div className="ez-text-primary tmr-x1">
      {/* R-01 fix: layout utilities used in this component are absent from the compiled
          src/styles/magic-ai.css snapshot (no Tailwind build), so their layout
          is provided by these scoped classes (tmr-x*) with Tailwind values. */}
      <style hidden>{`
/* tmr-x1 <- space-y-6 */
.tmr-x1 > :not([hidden]) ~ :not([hidden]) { margin-top: 1.5rem; }
/* tmr-x2 <- md:flex-row md:items-center */
@media (min-width: 768px) { .tmr-x2 { flex-direction: row; align-items: center; } }
/* tmr-x3 <- mb-1 */
.tmr-x3 { margin-bottom: 0.25rem; }
/* tmr-x4 <- block */
.tmr-x4 { display: block; }
/* tmr-x5 <- pt-4 sm:grid-cols-4 */
.tmr-x5 { padding-top: 1rem; }
@media (min-width: 640px) { .tmr-x5 { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
/* tmr-x6 <- gap-2.5 p-2.5 */
.tmr-x6 { padding: 0.625rem; gap: 0.625rem; }
/* tmr-x7 <- mt-0.5 */
.tmr-x7 { margin-top: 0.125rem; }
/* tmr-x8 <- mt-0.5 */
.tmr-x8 { margin-top: 0.125rem; }
/* tmr-x9 <- mb-1 */
.tmr-x9 { margin-bottom: 0.25rem; }
/* tmr-x10 <- space-y-0.5 */
.tmr-x10 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.125rem; }
/* tmr-x11 <- grid-cols-12 */
.tmr-x11 { grid-template-columns: repeat(12, minmax(0, 1fr)); }
/* tmr-x12 <- col-span-6 */
.tmr-x12 { grid-column: span 6 / span 6; }
/* tmr-x13 <- md:grid-cols-2 */
@media (min-width: 768px) { .tmr-x13 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
/* tmr-x14 <- p-3.5 */
.tmr-x14 { padding: 0.875rem; }
/* tmr-x15 <- block */
.tmr-x15 { display: block; }
/* tmr-x16 <- mt-0.5 */
.tmr-x16 { margin-top: 0.125rem; }
/* tmr-x17 <- items-baseline */
.tmr-x17 { align-items: baseline; }
/* tmr-x18 <- pt-2 */
.tmr-x18 { padding-top: 0.5rem; }
/* tmr-x19 <- space-y-3 */
.tmr-x19 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.75rem; }
/* tmr-x20 <- py-8 */
.tmr-x20 { padding-top: 2rem; padding-bottom: 2rem; }
/* tmr-x21 <- gap-3.5 */
.tmr-x21 { gap: 0.875rem; }
/* tmr-x22 <- mt-0.5 */
.tmr-x22 { margin-top: 0.125rem; }
/* tmr-x23 <- mt-0.5 */
.tmr-x23 { margin-top: 0.125rem; }
/* tmr-x24 <- grid-cols-12 */
.tmr-x24 { grid-template-columns: repeat(12, minmax(0, 1fr)); }
/* tmr-x25 <- col-span-6 */
.tmr-x25 { grid-column: span 6 / span 6; }
/* tmr-x26 <- p-0.5 */
.tmr-x26 { padding: 0.125rem; }
      
/* --- Stage 2A color fix: token warna di bawah ini tidak ada di snapshot
   src/styles/magic-ai.css sehingga sebelumnya tidak menghasilkan CSS.
   Nilai memakai token --ez-* (otomatis light/dark) atau hex literal
   warna authored untuk zona selalu-gelap (banner gradien, scrim,
   panel terminal/konsol). */
/* bg-amber-100 <- token EZ (bg-amber-100) */
.bg-amber-100 { background-color: var(--ez-color-warning-soft); }
/* bg-amber-50 <- token EZ (bg-amber-50) */
.bg-amber-50 { background-color: var(--ez-color-warning-soft); }
/* bg-amber-500/20 <- literal authored (bg-amber-500/20) — zona selalu-gelap/scrim */
.bg-amber-500\/20 { background-color: rgba(245, 158, 11, 0.2); }
/* bg-blue-100 <- token EZ (bg-blue-100) */
.bg-blue-100 { background-color: var(--ez-color-primary-soft); }
/* bg-blue-50 <- token EZ (bg-blue-50) */
.bg-blue-50 { background-color: var(--ez-color-info-soft); }
/* bg-blue-500/20 <- literal authored (bg-blue-500/20) — zona selalu-gelap/scrim */
.bg-blue-500\/20 { background-color: rgba(59, 130, 246, 0.2); }
/* bg-emerald-100 <- token EZ (bg-emerald-100) */
.bg-emerald-100 { background-color: var(--ez-color-success-soft); }
/* bg-emerald-50 <- token EZ (bg-emerald-50) */
.bg-emerald-50 { background-color: var(--ez-color-success-soft); }
/* bg-emerald-500/20 <- literal authored (bg-emerald-500/20) — zona selalu-gelap/scrim */
.bg-emerald-500\/20 { background-color: rgba(16, 185, 129, 0.2); }
/* bg-gradient-to-r <- gradient direction <- bg-gradient-to-r */
.bg-gradient-to-r { background-image: linear-gradient(to right, var(--tw-gradient-stops)); }
/* bg-indigo-100 <- token EZ (bg-indigo-100) */
.bg-indigo-100 { background-color: var(--ez-color-primary-soft); }
/* bg-indigo-50 <- token EZ (bg-indigo-50) */
.bg-indigo-50 { background-color: var(--ez-ai-surface); }
/* bg-indigo-500/30 <- literal authored (bg-indigo-500/30) — zona selalu-gelap/scrim */
.bg-indigo-500\/30 { background-color: rgba(99, 102, 241, 0.3); }
/* bg-indigo-600 <- token EZ (bg-indigo-600) */
.bg-indigo-600 { background-color: var(--ez-color-primary); }
/* bg-purple-100 <- token EZ (bg-purple-100) */
.bg-purple-100 { background-color: var(--ez-ai-surface); }
/* bg-rose-100 <- token EZ (bg-rose-100) */
.bg-rose-100 { background-color: var(--ez-color-danger-soft); }
/* bg-rose-50 <- token EZ (bg-rose-50) */
.bg-rose-50 { background-color: var(--ez-color-danger-soft); }
/* bg-rose-500/20 <- literal authored (bg-rose-500/20) — zona selalu-gelap/scrim */
.bg-rose-500\/20 { background-color: rgba(244, 63, 94, 0.2); }
/* bg-slate-100 <- token EZ (bg-slate-100) */
.bg-slate-100 { background-color: var(--ez-color-border); }
/* bg-slate-50 <- token EZ (bg-slate-50) */
.bg-slate-50 { background-color: var(--ez-color-border-soft); }
/* bg-slate-50/50 <- token EZ (bg-slate-50/50) */
.bg-slate-50\/50 { background-color: color-mix(in srgb, var(--ez-color-border-soft) 50%, transparent); }
/* bg-slate-700 <- literal authored (bg-slate-700) — zona selalu-gelap/scrim */
.bg-slate-700 { background-color: #334155; }
/* bg-slate-800/60 <- literal authored (bg-slate-800/60) — zona selalu-gelap/scrim */
.bg-slate-800\/60 { background-color: rgba(30, 41, 59, 0.6); }
/* bg-white/70 <- token EZ (bg-white/70) */
.bg-white\/70 { background-color: color-mix(in srgb, var(--ez-color-surface) 70%, transparent); }
/* bg-white/80 <- token EZ (bg-white/80) */
.bg-white\/80 { background-color: color-mix(in srgb, var(--ez-color-surface) 80%, transparent); }
/* border-amber-200 <- token EZ (border-amber-200) */
.border-amber-200 { border-color: color-mix(in srgb, var(--ez-color-warning) 32%, var(--ez-color-surface)); }
/* border-amber-300 <- token EZ (border-amber-300) */
.border-amber-300 { border-color: color-mix(in srgb, var(--ez-color-warning) 48%, var(--ez-color-surface)); }
/* border-blue-200 <- token EZ (border-blue-200) */
.border-blue-200 { border-color: color-mix(in srgb, var(--ez-color-primary) 32%, var(--ez-color-surface)); }
/* border-current <- token EZ (border-current) */
.border-current { border-color: currentColor; }
/* border-current/20 <- token EZ (border-current/20) */
.border-current\/20 { border-color: color-mix(in srgb, currentColor 20%, transparent); }
/* border-emerald-200 <- token EZ (border-emerald-200) */
.border-emerald-200 { border-color: color-mix(in srgb, var(--ez-color-success) 32%, var(--ez-color-surface)); }
/* border-emerald-500/30 <- literal authored (border-emerald-500/30) — zona selalu-gelap/scrim */
.border-emerald-500\/30 { border-color: rgba(16, 185, 129, 0.3); }
/* border-indigo-200 <- token EZ (border-indigo-200) */
.border-indigo-200 { border-color: color-mix(in srgb, var(--ez-hue-indigo-text) 32%, var(--ez-color-surface)); }
/* border-indigo-400/30 <- literal authored (border-indigo-400/30) — zona selalu-gelap/scrim */
.border-indigo-400\/30 { border-color: rgba(129, 140, 248, 0.3); }
/* border-indigo-600 <- token EZ (border-indigo-600) */
.border-indigo-600 { border-color: var(--ez-hue-indigo-text); }
/* border-purple-200 <- token EZ (border-purple-200) */
.border-purple-200 { border-color: color-mix(in srgb, var(--ez-hue-violet-text) 32%, var(--ez-color-surface)); }
/* border-rose-200 <- token EZ (border-rose-200) */
.border-rose-200 { border-color: color-mix(in srgb, var(--ez-color-danger) 32%, var(--ez-color-surface)); }
/* border-rose-300 <- token EZ (border-rose-300) */
.border-rose-300 { border-color: color-mix(in srgb, var(--ez-color-danger) 48%, var(--ez-color-surface)); }
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
/* from-indigo-900 <- gradient stop <- from-indigo-900 */
.from-indigo-900 { --tw-gradient-from: #312E81 var(--tw-gradient-from-position); --tw-gradient-to: rgba(49, 46, 129, 0) var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
/* hover:bg-slate-200 <- token EZ (bg-slate-200) */
.hover\:bg-slate-200:hover { background-color: color-mix(in srgb, var(--ez-color-border) 55%, var(--ez-color-text-muted)); }
/* hover:bg-slate-50 <- token EZ (bg-slate-50) */
.hover\:bg-slate-50:hover { background-color: var(--ez-color-border-soft); }
/* hover:bg-slate-50/80 <- token EZ (bg-slate-50/80) */
.hover\:bg-slate-50\/80:hover { background-color: color-mix(in srgb, var(--ez-color-border-soft) 80%, transparent); }
/* hover:border-indigo-200 <- token EZ (border-indigo-200) */
.hover\:border-indigo-200:hover { border-color: color-mix(in srgb, var(--ez-hue-indigo-text) 32%, var(--ez-color-surface)); }
/* hover:text-slate-700 <- token EZ (text-slate-700) */
.hover\:text-slate-700:hover { color: var(--ez-color-text-body); }
/* text-amber-300 <- literal authored (text-amber-300) — zona selalu-gelap/scrim */
.text-amber-300 { color: #FCD34D; }
/* text-amber-400 <- literal authored (text-amber-400) — zona selalu-gelap/scrim */
.text-amber-400 { color: #FBBF24; }
/* text-amber-600 <- token EZ (text-amber-600) */
.text-amber-600 { color: var(--ez-hue-amber-text); }
/* text-amber-700 <- token EZ (text-amber-700) */
.text-amber-700 { color: var(--ez-hue-amber-text); }
/* text-amber-800 <- token EZ (text-amber-800) */
.text-amber-800 { color: var(--ez-hue-amber-text-dark); }
/* text-amber-900 <- token EZ (text-amber-900) */
.text-amber-900 { color: var(--ez-hue-amber-text-dark); }
/* text-amber-950 <- token EZ (text-amber-950) */
.text-amber-950 { color: var(--ez-hue-amber-text-dark); }
/* text-blue-300 <- literal authored (text-blue-300) — zona selalu-gelap/scrim */
.text-blue-300 { color: #93C5FD; }
/* text-blue-400 <- literal authored (text-blue-400) — zona selalu-gelap/scrim */
.text-blue-400 { color: #60A5FA; }
/* text-blue-600 <- token EZ (text-blue-600) */
.text-blue-600 { color: var(--ez-color-primary); }
/* text-blue-800 <- token EZ (text-blue-800) */
.text-blue-800 { color: var(--ez-hue-blue-text-deep); }
/* text-blue-950 <- token EZ (text-blue-950) */
.text-blue-950 { color: var(--ez-hue-blue-text-deep); }
/* text-emerald-300 <- literal authored (text-emerald-300) — zona selalu-gelap/scrim */
.text-emerald-300 { color: #6EE7B7; }
/* text-emerald-400 <- literal authored (text-emerald-400) — zona selalu-gelap/scrim */
.text-emerald-400 { color: #34D399; }
/* text-emerald-600 <- token EZ (text-emerald-600) */
.text-emerald-600 { color: var(--ez-color-success); }
/* text-emerald-700 <- token EZ (text-emerald-700) */
.text-emerald-700 { color: var(--ez-hue-green-text-deep); }
/* text-emerald-800 <- token EZ (text-emerald-800) */
.text-emerald-800 { color: var(--ez-hue-green-text-deep); }
/* text-indigo-200 <- literal authored (text-indigo-200) — zona selalu-gelap/scrim */
.text-indigo-200 { color: #C7D2FE; }
/* text-indigo-600 <- token EZ (text-indigo-600) */
.text-indigo-600 { color: var(--ez-hue-indigo-text); }
/* text-indigo-700 <- token EZ (text-indigo-700) */
.text-indigo-700 { color: var(--ez-hue-indigo-text); }
/* text-indigo-800 <- token EZ (text-indigo-800) */
.text-indigo-800 { color: var(--ez-hue-indigo-text); }
/* text-indigo-900 <- token EZ (text-indigo-900) */
.text-indigo-900 { color: var(--ez-hue-indigo-text); }
/* text-indigo-950 <- token EZ (text-indigo-950) */
.text-indigo-950 { color: var(--ez-hue-indigo-text); }
/* text-purple-800 <- token EZ (text-purple-800) */
.text-purple-800 { color: var(--ez-hue-purple-text); }
/* text-rose-300 <- literal authored (text-rose-300) — zona selalu-gelap/scrim */
.text-rose-300 { color: #FDA4AF; }
/* text-rose-400 <- literal authored (text-rose-400) — zona selalu-gelap/scrim */
.text-rose-400 { color: #FB7185; }
/* text-rose-600 <- token EZ (text-rose-600) */
.text-rose-600 { color: var(--ez-hue-rose-text); }
/* text-rose-800 <- token EZ (text-rose-800) */
.text-rose-800 { color: var(--ez-hue-rose-text); }
/* text-rose-950 <- token EZ (text-rose-950) */
.text-rose-950 { color: var(--ez-hue-red-text); }
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
/* to-slate-900 <- gradient stop <- to-slate-900 */
.to-slate-900 { --tw-gradient-to: #0F172A var(--tw-gradient-to-position); }
/* via-blue-900 <- gradient stop <- via-blue-900 */
.via-blue-900 { --tw-gradient-to: rgba(30, 58, 138, 0) var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), #1E3A8A var(--tw-gradient-via-position), var(--tw-gradient-to); }
`}</style>
      {/* 1. Header Banner & Authoritative Template First Context */}
      <div className="bg-gradient-to-r from-indigo-900 via-blue-900 to-slate-900 text-white rounded-xl p-5 shadow-lg">
        <div className="flex flex-col justify-between gap-4 tmr-x2">
          <div>
            <div className="flex items-center gap-2 tmr-x3">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 flex items-center gap-1">
                <LayoutTemplate className="w-3.5 h-3.5" /> Authoritative Template First
              </span>
              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                v{templateSnapshot.templateVersion} Snapshot Preserved
              </span>
              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-700 text-slate-300">
                {templateSnapshot.category}
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              {templateSnapshot.templateName}
            </h2>
            <p className="text-sm text-slate-300 mt-1">
              DED entities secara otomatis dipetakan ke Adaptive WBS berdasarkan Construction Knowledge Graph.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-sm px-4 py-2.5 rounded-lg border border-white/15 text-center">
              <span className="text-xs uppercase tracking-wider text-slate-300 font-medium tmr-x4">Coverage Pemetaan</span>
              <span className="text-2xl font-black text-emerald-400">{coverage.coveragePercentage}%</span>
            </div>
            <div className="bg-white/10 backdrop-blur-sm px-4 py-2.5 rounded-lg border border-white/15 text-center">
              <span className="text-xs uppercase tracking-wider text-slate-300 font-medium tmr-x4">Total Entitas</span>
              <span className="text-2xl font-bold text-white">{coverage.totalEntities}</span>
            </div>
          </div>
        </div>

        {/* Coverage Breakdown Cards */}
        <div className="grid grid-cols-2 gap-3 mt-5 border-t border-white/10 tmr-x5">
          <div className="bg-slate-800/60 rounded-lg flex items-center tmr-x6">
            <div className="w-8 h-8 rounded-md bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Mapped</div>
              <div className="text-base font-semibold text-emerald-300">{coverage.mappedCount} entitas</div>
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-lg flex items-center tmr-x6">
            <div className="w-8 h-8 rounded-md bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Unmapped</div>
              <div className="text-base font-semibold text-amber-300">{coverage.unmappedCount} entitas</div>
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-lg flex items-center tmr-x6">
            <div className="w-8 h-8 rounded-md bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Needs Review</div>
              <div className="text-base font-semibold text-blue-300">{coverage.needsReviewCount} entitas</div>
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-lg flex items-center tmr-x6">
            <div className="w-8 h-8 rounded-md bg-rose-500/20 flex items-center justify-center text-rose-400 font-bold">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Conflicts</div>
              <div className="text-base font-semibold text-rose-300">{coverage.conflictCount} entitas</div>
            </div>
          </div>
        </div>
      </div>

      {/* Unmapped Warning Banner */}
      {unmappedEntities.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3 text-amber-900">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 tmr-x7" />
          <div>
            <h4 className="font-semibold text-sm text-amber-950">
              {unmappedEntities.length} Construction Entities Belum Terpetakan
            </h4>
            <p className="text-xs text-amber-800 tmr-x8">
              Sistem tidak memaksa entitas masuk ke WBS yang tidak sesuai. Anda dapat meninjau dan memetakan entitas secara manual.
            </p>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('wbs')}
          className={`py-2.5 px-4 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'wbs'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Layers className="w-4 h-4" /> Adaptive WBS ({adaptiveWBS.length})
        </button>
        <button
          onClick={() => setActiveTab('mappings')}
          className={`py-2.5 px-4 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'mappings'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <GitMerge className="w-4 h-4" /> Entity Mappings ({allMappings.length})
        </button>
        <button
          onClick={() => setActiveTab('parameters')}
          className={`py-2.5 px-4 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'parameters'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Sliders className="w-4 h-4" /> Parameters ({Object.keys(parameterSet).length})
        </button>
        <button
          onClick={() => setActiveTab('validation')}
          className={`py-2.5 px-4 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'validation'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ShieldCheck className="w-4 h-4" /> Validation Findings ({validationFindings.length})
        </button>
      </div>

      {/* TAB 1: ADAPTIVE WBS */}
      {activeTab === 'wbs' && (
        <div className="space-y-4">
          {conditionalWorkActivated.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-900">
              <span className="font-semibold flex items-center gap-1.5 text-indigo-950 tmr-x9">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Cabang WBS Kondisional Aktif Berdasarkan Evidence DED:
              </span>
              <ul className="list-disc list-inside text-indigo-800 tmr-x10">
                {conditionalWorkActivated.map((cw, idx) => (
                  <li key={idx}>
                    <span className="font-medium">{cw.wbsTitle}</span> ({cw.wbsCode}): {cw.evidence}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border border-slate-200 rounded-lg overflow-hidden ez-bg-surface">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 text-xs font-semibold text-slate-600 grid gap-2 tmr-x11">
              <span className="tmr-x12">KODE & CABANG WBS</span>
              <span className="col-span-3 text-center">TIPE / STATUS</span>
              <span className="col-span-3 text-right">MAPPED ENTITIES</span>
            </div>
            <div className="divide-y divide-slate-100">
              {adaptiveWBS.map((node) => (
                <WbsTreeRow
                  key={node.code}
                  node={node}
                  level={1}
                  expandedCodes={expandedWbsCodes}
                  toggleExpand={toggleWbsExpand}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ENTITY MAPPINGS */}
      {activeTab === 'mappings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-semibold ez-text-slate">Filter Status:</span>
              {(['ALL', 'MAPPED', 'UNMAPPED', 'NEEDS_REVIEW', 'CONFLICT'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setMappingFilter(st)}
                  className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                    mappingFilter === st
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500">
              Menampilkan {filteredMappings.length} dari {allMappings.length} entitas
            </span>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden ez-bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Identitas Entitas</th>
                    <th className="py-2.5 px-3">Lantai / Lokasi</th>
                    <th className="py-2.5 px-3">Target WBS</th>
                    <th className="py-2.5 px-3">Metode Konstruksi</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMappings.map((m) => (
                    <tr key={m.mappingId} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold ez-text-primary">{m.entityIdentifier}</div>
                        <div className="text-slate-500 text-[11px]">{m.entityName}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                          {m.floor}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {m.wbsCode ? (
                          <div>
                            <span className="font-mono font-medium text-indigo-700">{m.wbsCode}</span>
                            <div className="ez-text-slate text-[11px] line-clamp-1">{m.wbsTitle}</div>
                          </div>
                        ) : (
                          <span className="text-amber-700 italic">Belum terpetakan</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="ez-text-slate">{m.constructionMethod || '-'}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="py-2.5 px-3 font-mono ez-text-body">
                        {Math.round(m.confidence * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: EXTRACTED PARAMETERS */}
      {activeTab === 'parameters' && (
        <div className="grid grid-cols-1 gap-4 tmr-x13">
          {Object.values(parameterSet).map((p) => (
            <div key={p.parameterId} className="rounded-lg border border-slate-200 ez-bg-surface hover:border-indigo-200 transition-colors tmr-x14">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 tmr-x15">
                    {p.group}
                  </span>
                  <h4 className="font-semibold ez-text-primary text-sm tmr-x16">{p.name}</h4>
                </div>
                <SourceBadge source={p.source} />
              </div>

              <div className="mt-3 flex gap-2 tmr-x17">
                <span className="text-xl font-bold ez-text-primary">
                  {typeof p.value === 'boolean' ? (p.value ? 'Ya / Ada' : 'Tidak / Nihil') : String(p.value ?? '-')}
                </span>
                {p.unit && <span className="text-xs text-slate-500 font-medium">{p.unit}</span>}
              </div>

              {p.reasoning && (
                <p className="mt-2 text-xs text-slate-500 border-t border-slate-100 line-clamp-2 tmr-x18">
                  {p.reasoning}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: VALIDATION FINDINGS */}
      {activeTab === 'validation' && (
        <div className="tmr-x19">
          {validationFindings.length === 0 ? (
            <div className="text-center bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-800 tmr-x20">
              <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <h4 className="font-semibold text-base">Validasi Template Sempurna</h4>
              <p className="text-xs text-emerald-700 mt-1">
                Semua parameter wajib terpenuhi dan struktur WBS adaptif konsisten dengan evidence DED.
              </p>
            </div>
          ) : (
            validationFindings.map((f) => (
              <div
                key={f.findingId}
                className={`p-4 rounded-lg border flex items-start ${
                  f.severity === 'CRITICAL'
                    ? 'bg-rose-50 border-rose-300 text-rose-950'
                    : f.severity === 'WARNING'
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-blue-50 border-blue-200 text-blue-950'
                } tmr-x21`}
              >
                {f.severity === 'CRITICAL' ? (
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 tmr-x22" />
                ) : f.severity === 'WARNING' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 tmr-x7" />
                ) : (
                  <Info className="w-5 h-5 text-blue-600 shrink-0 tmr-x23" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/70 border border-current">
                      {f.severity}
                    </span>
                    <span className="text-xs font-mono text-slate-500">{f.category}</span>
                  </div>
                  <h4 className="font-bold text-sm mt-1">{f.title}</h4>
                  <p className="text-xs mt-1 leading-relaxed opacity-90">{f.description}</p>
                  <div className="mt-2 text-xs bg-white/80 p-2 rounded border border-current/20 font-medium">
                    <span className="font-semibold">Saran Aksi:</span> {f.suggestedAction}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// Helper Sub-components
const WbsTreeRow: React.FC<{
  node: AdaptiveWbsNode;
  level: number;
  expandedCodes: Set<string>;
  toggleExpand: (code: string) => void;
}> = ({ node, level, expandedCodes, toggleExpand }) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedCodes.has(node.code);

  return (
    <>
      <div
        className={`px-4 py-2.5 text-xs grid gap-2 items-center hover:bg-slate-50 transition-colors ${
          level === 1 ? 'bg-slate-50/50 font-semibold' : ''
        } tmr-x24`}
        style={{ paddingLeft: `${(level - 1) * 1.5 + 1}rem` }}
      >
        <div className="flex items-center gap-2 tmr-x25">
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(node.code)}
              className="hover:bg-slate-200 rounded text-slate-500 tmr-x26"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <span className="font-mono text-indigo-700 font-bold">{node.code}</span>
          <span className="ez-text-primary">{node.title}</span>
        </div>

        <div className="col-span-3 text-center">
          {node.activationReason === 'EVIDENCE_TRIGGERED' ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
              Evidence Triggered
            </span>
          ) : node.isOptional ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
              Optional
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              Mandatory
            </span>
          )}
        </div>

        <div className="col-span-3 text-right">
          <span className="px-2 py-0.5 rounded-full font-mono text-[11px] font-bold bg-slate-100 text-slate-700">
            {node.mappedEntityCount} entities
          </span>
        </div>
      </div>

      {hasChildren && isExpanded && (
        node.children!.map((child) => (
          <WbsTreeRow
            key={child.code}
            node={child}
            level={level + 1}
            expandedCodes={expandedCodes}
            toggleExpand={toggleExpand}
          />
        ))
      )}
    </>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'MAPPED':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
          MAPPED
        </span>
      );
    case 'UNMAPPED':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
          UNMAPPED
        </span>
      );
    case 'AMBIGUOUS':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-100 text-purple-800 border border-purple-200">
          AMBIGUOUS
        </span>
      );
    case 'NEEDS_REVIEW':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800 border border-blue-200">
          NEEDS_REVIEW
        </span>
      );
    case 'CONFLICT':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-100 text-rose-800 border border-rose-200">
          CONFLICT
        </span>
      );
    default:
      return <span className="text-slate-500">{status}</span>;
  }
};

const SourceBadge: React.FC<{ source: string }> = ({ source }) => {
  switch (source) {
    case 'USER_INPUT':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
          USER INPUT
        </span>
      );
    case 'DED_EXTRACTED':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
          DED EXTRACTED
        </span>
      );
    case 'ASSUMPTION':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
          ASSUMPTION
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
          DEFAULT
        </span>
      );
  }
};
