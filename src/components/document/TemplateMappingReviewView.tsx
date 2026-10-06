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
    <div className="space-y-6 text-slate-800">
      {/* 1. Header Banner & Authoritative Template First Context */}
      <div className="bg-gradient-to-r from-indigo-900 via-blue-900 to-slate-900 text-white rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
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
              <span className="text-xs uppercase tracking-wider text-slate-300 block font-medium">Coverage Pemetaan</span>
              <span className="text-2xl font-black text-emerald-400">{coverage.coveragePercentage}%</span>
            </div>
            <div className="bg-white/10 backdrop-blur-sm px-4 py-2.5 rounded-lg border border-white/15 text-center">
              <span className="text-xs uppercase tracking-wider text-slate-300 block font-medium">Total Entitas</span>
              <span className="text-2xl font-bold text-white">{coverage.totalEntities}</span>
            </div>
          </div>
        </div>

        {/* Coverage Breakdown Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-white/10">
          <div className="bg-slate-800/60 p-2.5 rounded-lg flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Mapped</div>
              <div className="text-base font-semibold text-emerald-300">{coverage.mappedCount} entitas</div>
            </div>
          </div>

          <div className="bg-slate-800/60 p-2.5 rounded-lg flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Unmapped</div>
              <div className="text-base font-semibold text-amber-300">{coverage.unmappedCount} entitas</div>
            </div>
          </div>

          <div className="bg-slate-800/60 p-2.5 rounded-lg flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Needs Review</div>
              <div className="text-base font-semibold text-blue-300">{coverage.needsReviewCount} entitas</div>
            </div>
          </div>

          <div className="bg-slate-800/60 p-2.5 rounded-lg flex items-center gap-2.5">
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
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-sm text-amber-950">
              {unmappedEntities.length} Construction Entities Belum Terpetakan
            </h4>
            <p className="text-xs text-amber-800 mt-0.5">
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
              <span className="font-semibold flex items-center gap-1.5 text-indigo-950 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Cabang WBS Kondisional Aktif Berdasarkan Evidence DED:
              </span>
              <ul className="list-disc list-inside space-y-0.5 text-indigo-800">
                {conditionalWorkActivated.map((cw, idx) => (
                  <li key={idx}>
                    <span className="font-medium">{cw.wbsTitle}</span> ({cw.wbsCode}): {cw.evidence}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 text-xs font-semibold text-slate-600 grid grid-cols-12 gap-2">
              <span className="col-span-6">KODE & CABANG WBS</span>
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
              <span className="text-xs font-semibold text-slate-600">Filter Status:</span>
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

          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
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
                        <div className="font-semibold text-slate-900">{m.entityIdentifier}</div>
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
                            <div className="text-slate-600 text-[11px] line-clamp-1">{m.wbsTitle}</div>
                          </div>
                        ) : (
                          <span className="text-amber-700 italic">Belum terpetakan</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-slate-600">{m.constructionMethod || '-'}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.values(parameterSet).map((p) => (
            <div key={p.parameterId} className="p-3.5 rounded-lg border border-slate-200 bg-white hover:border-indigo-200 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                    {p.group}
                  </span>
                  <h4 className="font-semibold text-slate-900 text-sm mt-0.5">{p.name}</h4>
                </div>
                <SourceBadge source={p.source} />
              </div>

              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900">
                  {typeof p.value === 'boolean' ? (p.value ? 'Ya / Ada' : 'Tidak / Nihil') : String(p.value ?? '-')}
                </span>
                {p.unit && <span className="text-xs text-slate-500 font-medium">{p.unit}</span>}
              </div>

              {p.reasoning && (
                <p className="mt-2 text-xs text-slate-500 border-t border-slate-100 pt-2 line-clamp-2">
                  {p.reasoning}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: VALIDATION FINDINGS */}
      {activeTab === 'validation' && (
        <div className="space-y-3">
          {validationFindings.length === 0 ? (
            <div className="text-center py-8 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-800">
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
                className={`p-4 rounded-lg border flex items-start gap-3.5 ${
                  f.severity === 'CRITICAL'
                    ? 'bg-rose-50 border-rose-300 text-rose-950'
                    : f.severity === 'WARNING'
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-blue-50 border-blue-200 text-blue-950'
                }`}
              >
                {f.severity === 'CRITICAL' ? (
                  <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                ) : f.severity === 'WARNING' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                ) : (
                  <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
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
        className={`px-4 py-2.5 text-xs grid grid-cols-12 gap-2 items-center hover:bg-slate-50 transition-colors ${
          level === 1 ? 'bg-slate-50/50 font-semibold' : ''
        }`}
        style={{ paddingLeft: `${(level - 1) * 1.5 + 1}rem` }}
      >
        <div className="col-span-6 flex items-center gap-2">
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(node.code)}
              className="p-0.5 hover:bg-slate-200 rounded text-slate-500"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <span className="font-mono text-indigo-700 font-bold">{node.code}</span>
          <span className="text-slate-800">{node.title}</span>
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
