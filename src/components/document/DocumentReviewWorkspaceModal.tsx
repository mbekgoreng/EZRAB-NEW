import React, { useState, useMemo } from 'react';
import {
  X,
  FileText,
  Layers,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  Cpu,
  ArrowRight,
  Check,
  HelpCircle,
  Hash,
  Compass,
  Maximize2,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import { ProjectDocument } from '../../domain/document/types';
import { ConstructionEntity } from '../../domain/document/constructionEntityTypes';
import { GeneratedQtoItem } from '../../../server/services/automaticQtoEngine';
import { RabDraftItem, RabDraftSummary } from '../../../server/services/automaticRabDraftEngine';
import { ConstructionReviewFinding } from '../../domain/document/findingTypes';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { WholeDocumentIntelligenceView } from './WholeDocumentIntelligenceView';
import { DrawingGraphExplorerView } from './DrawingGraphExplorerView';
import { EntityResolutionReviewView } from './EntityResolutionReviewView';
import { TemplateMappingReviewView } from './TemplateMappingReviewView';
import { DeterministicRabDraftWorkspaceView } from './DeterministicRabDraftWorkspaceView';
import { RabReviewWorkspaceModalView } from './RabReviewWorkspaceModalView';
import { DocumentSet } from '../../domain/document/documentSetTypes';
import { DocumentSetService } from '../../../server/services/documentSetService';
import { DrawingGraphBuilder } from '../../../server/services/drawingGraphBuilder';
import { EntityResolutionEngine } from '../../../server/services/entityResolutionEngine';
import { TemplateRegistry } from '../../engine/templateEngine/TemplateRegistry';
import { ParameterExtractionEngine } from '../../../server/services/parameterExtractionEngine';
import { AdaptiveWbsEngine } from '../../../server/services/adaptiveWbsEngine';
import { TemplateEntityMappingEngine } from '../../../server/services/templateEntityMappingEngine';
import { TemplateValidationEngine } from '../../../server/services/templateValidationEngine';
import { DeterministicRabDraftEngine } from '../../../server/services/deterministicRabDraftEngine';
import { TemplateMappingContext } from '../../domain/document/templateMappingTypes';
import { DeterministicRabDraftSummary } from '../../domain/document/deterministicRabTypes';
import { GitBranch, ShieldAlert, LayoutTemplate } from 'lucide-react';

interface DocumentReviewWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  projectId: string;
  documents: ProjectDocument[];
  entities: ConstructionEntity[];
  qtoItems: GeneratedQtoItem[];
  rabDraftSummary: RabDraftSummary;
  findings: ConstructionReviewFinding[];
  documentSet?: DocumentSet;
  templateMappingContext?: TemplateMappingContext;
  onCommitToSpreadsheet: (draftItems: RabDraftItem[]) => void;
  onResolveFinding?: (findingId: string) => void;
  onReanalyzeDocument?: () => void;
}

type ActiveWorkspaceTab = 'drawing_graph' | 'doc_set' | 'entities' | 'template_mapping' | 'qto' | 'rab_draft' | 'findings' | 'doc_preview';

export const DocumentReviewWorkspaceModal: React.FC<DocumentReviewWorkspaceModalProps> = ({
  isOpen,
  onClose,
  projectName,
  projectId,
  documents,
  entities,
  qtoItems,
  rabDraftSummary,
  findings,
  documentSet,
  templateMappingContext,
  onCommitToSpreadsheet,
  onResolveFinding,
  onReanalyzeDocument
}) => {
  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>('entities');
  const [selectedEntity, setSelectedEntity] = useState<ConstructionEntity | null>(entities[0] || null);
  const [selectedDocId, setSelectedDocId] = useState<string>(documents[0]?.documentId || '');
  const [isCommitting, setIsCommitting] = useState(false);
  const [committedSuccess, setCommittedSuccess] = useState(false);

  const selectedDocument = useMemo(() => {
    return documents.find(d => d.documentId === selectedDocId) || documents[0];
  }, [documents, selectedDocId]);

  if (!isOpen) return null;

  const handleCommit = () => {
    setIsCommitting(true);
    setTimeout(() => {
      onCommitToSpreadsheet(rabDraftSummary.items);
      setIsCommitting(false);
      setCommittedSuccess(true);
      setTimeout(() => {
        setCommittedSuccess(false);
        onClose();
      }, 1500);
    }, 600);
  };

  const activeDocSet = useMemo(() => {
    if (documentSet) return documentSet;
    // Synthesize DocumentSet from documents or defaults
    const rawPages = documents.flatMap(d => d.parsedChunks.map(c => c.content));
    return DocumentSetService.getInstance().ingestDocumentSet({
      projectId,
      workspaceId: 'ws-default',
      userId: 'usr-default',
      documentSetName: `Document Set: ${projectName}`,
      files: documents.map(d => ({
        fileName: d.fileName,
        fileSizeBytes: d.fileSizeBytes,
        rawText: d.parsedChunks.map(c => c.content).join('\n\n'),
        revision: d.currentVersion
      }))
    }) as any; // fallback sync accessor
  }, [documentSet, documents, projectId, projectName]);

  const activeDrawingGraph = useMemo(() => {
    if (!activeDocSet) return null;
    return DrawingGraphBuilder.getInstance().buildDrawingGraph(activeDocSet);
  }, [activeDocSet]);

  const canonicalResolutionSummary = useMemo(() => {
    if (!activeDrawingGraph || !activeDocSet) return null;
    return EntityResolutionEngine.getInstance().resolveEntities(activeDrawingGraph, activeDocSet);
  }, [activeDrawingGraph, activeDocSet]);

  const activeTemplateMappingContext = useMemo(() => {
    if (templateMappingContext) return templateMappingContext;
    if (!canonicalResolutionSummary) return null;
    try {
      const template = TemplateRegistry.getInstance().getById('tmpl-bld-residential-pilot') || TemplateRegistry.getInstance().getAll()[0];
      const params = ParameterExtractionEngine.extractParameters({
        projectId,
        template,
        entities: canonicalResolutionSummary.entities,
        drawingGraph: activeDrawingGraph || undefined
      });
      const { adaptiveWBS, activatedConditionalNodes } = AdaptiveWbsEngine.buildAdaptiveWBS({
        template,
        parameters: params,
        entities: canonicalResolutionSummary.entities
      });
      const { mappedEntities, unmappedEntities, coverage, updatedWBS } = TemplateEntityMappingEngine.mapEntitiesToWBS({
        projectId,
        entities: canonicalResolutionSummary.entities,
        adaptiveWBS
      });
      const validationFindings = TemplateValidationEngine.validate({
        template,
        parameters: params,
        adaptiveWBS: updatedWBS,
        mappedEntities,
        unmappedEntities,
        coverage
      });

      return {
        projectId,
        templateSnapshot: {
          templateId: template.id,
          templateVersion: template.version || '1.0.0',
          templateName: template.name,
          category: template.category,
          type: template.type,
          variant: template.variant,
          snapshotAt: new Date().toISOString(),
          parameters: template.parameters || [],
          wbsHierarchy: template.wbsHierarchy || [],
          optionalWbsNodes: template.optionalWbsNodes || []
        },
        parameterSet: params,
        adaptiveWBS: updatedWBS,
        mappedEntities,
        unmappedEntities,
        conditionalWorkActivated: activatedConditionalNodes,
        assumptionsApplied: {},
        coverage,
        validationFindings,
        generatedAt: new Date().toISOString()
      };
    } catch (e) {
      console.warn('Template mapping failed:', e);
      return null;
    }
  }, [templateMappingContext, canonicalResolutionSummary, activeDrawingGraph, projectId]);

  const deterministicRabSummary = useMemo(() => {
    if (!activeTemplateMappingContext || !canonicalResolutionSummary) return null;
    try {
      return DeterministicRabDraftEngine.getInstance().generateRabDraft({
        projectId,
        projectName,
        templateContext: activeTemplateMappingContext,
        entities: canonicalResolutionSummary.entities,
        ppnPercent: 11
      });
    } catch (e) {
      console.warn('Deterministic RAB Draft generation failed:', e);
      return null;
    }
  }, [activeTemplateMappingContext, canonicalResolutionSummary, projectId, projectName]);

  const highFindingsCount = findings.filter(f => f.severity === 'HIGH' && f.status === 'OPEN').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* TOP HEADER */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  AI Construction Review & Document Intelligence
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                  Phase 6.2 Drawing Intelligence
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Proyek: <span className="font-semibold text-slate-700 dark:text-slate-300">{projectName}</span> ({projectId})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* WORKSPACE NAVIGATION TABS */}
        <div className="px-6 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between overflow-x-auto">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('drawing_graph')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'drawing_graph'
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <GitBranch className="w-4 h-4 text-indigo-500" />
              <span>Drawing Graph & Relations</span>
            </button>

            <button
              onClick={() => setActiveTab('doc_set')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'doc_set'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              <span>Document Set ({documents.length} Dok)</span>
            </button>

            <button
              onClick={() => setActiveTab('entities')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'entities'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Entitas & Parameter ({entities.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('template_mapping')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'template_mapping'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <LayoutTemplate className="w-4 h-4 text-indigo-500" />
              <span>Template & Adaptive WBS</span>
            </button>

            <button
              onClick={() => setActiveTab('qto')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'qto'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Hash className="w-4 h-4" />
              <span>Perhitungan QTO ({qtoItems.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('rab_draft')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'rab_draft'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>WBS & Draft RAB ({rabDraftSummary.totalItems})</span>
            </button>

            <button
              onClick={() => setActiveTab('findings')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'findings'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <AlertTriangle className={`w-4 h-4 ${highFindingsCount > 0 ? 'text-amber-500' : ''}`} />
              <span>Temuan & Audit ({findings.length})</span>
              {highFindingsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
                  {highFindingsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('doc_preview')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'doc_preview'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>Preview Dokumen ({documents.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">
              Total Draft: <strong className="text-slate-800 dark:text-slate-200">{formatCurrencyIDR(rabDraftSummary.grandTotal)}</strong>
            </span>
          </div>
        </div>

        {/* WORKSPACE CONTENT BODY */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950/40">
          
          {/* TAB -1: DRAWING GRAPH & RELATIONSHIPS */}
          {activeTab === 'drawing_graph' && activeDrawingGraph && (
            <DrawingGraphExplorerView graph={activeDrawingGraph} />
          )}

          {/* TAB 0: WHOLE DOCUMENT SET & INVENTORY */}
          {activeTab === 'doc_set' && activeDocSet && (
            <WholeDocumentIntelligenceView documentSet={activeDocSet} />
          )}

          {/* TAB 0.5: TEMPLATE DRIVEN ADAPTIVE WBS MAPPING */}
          {activeTab === 'template_mapping' && activeTemplateMappingContext && (
            <TemplateMappingReviewView context={activeTemplateMappingContext} />
          )}
          
          {/* TAB 1: ENTITIES & RESOLUTION REVIEW */}
          {activeTab === 'entities' && (
            canonicalResolutionSummary ? (
              <EntityResolutionReviewView summary={canonicalResolutionSummary} />
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Entity List */}
              <div className="lg:col-span-5 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Daftar Entitas Terdeteksi ({entities.length})
                  </h3>
                  <span className="text-xs text-slate-500">Pilih untuk melihat detail</span>
                </div>

                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {entities.map(ent => (
                    <div
                      key={ent.entityId}
                      onClick={() => setSelectedEntity(ent)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        selectedEntity?.entityId === ent.entityId
                          ? 'bg-blue-50/80 border-blue-300 dark:bg-blue-950/40 dark:border-blue-700 shadow-sm'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {ent.discipline}
                            </span>
                            <span className="font-semibold text-xs text-slate-900 dark:text-white">
                              {ent.name}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Kuantitas: <strong className="text-slate-700 dark:text-slate-300">{ent.quantity} {ent.unit}</strong>
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            ent.confidenceLevel === 'HIGH'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400'
                              : ent.confidenceLevel === 'MEDIUM'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400'
                              : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400'
                          }`}
                        >
                          {ent.confidenceLevel} ({(ent.confidence * 100).toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Entity Detail / Inspector */}
              <div className="lg:col-span-7">
                {selectedEntity ? (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <h4 className="text-base font-bold text-slate-900 dark:text-white">
                          {selectedEntity.name}
                        </h4>
                        <p className="text-xs text-slate-500">
                          ID: {selectedEntity.entityId} • Tag: {selectedEntity.tag || 'N/A'}
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                        Provenance: {selectedEntity.provenance}
                      </span>
                    </div>

                    {/* Parameters Table */}
                    <div>
                      <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                        Parameter & Dimensi Geometris
                      </h5>
                      <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            <tr>
                              <th className="px-3 py-2 font-medium">Parameter</th>
                              <th className="px-3 py-2 font-medium">Nilai</th>
                              <th className="px-3 py-2 font-medium">Satuan</th>
                              <th className="px-3 py-2 font-medium">Sumber</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {Object.entries(selectedEntity.parameters).map(([key, param]) => (
                              <tr key={key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{param.name}</td>
                                <td className="px-3 py-2 font-bold text-blue-600 dark:text-blue-400">{String(param.value)}</td>
                                <td className="px-3 py-2 text-slate-500">{param.unit || '-'}</td>
                                <td className="px-3 py-2 text-slate-500">{param.provenance}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Provenance & Source Snippet */}
                    <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs">
                      <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        <Compass className="w-4 h-4 text-blue-500" />
                        <span>Keterangan Dokumen Sumber</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        {selectedEntity.sourceSnippet || 'Terekstraksi dari DED denah arsitektur dan struktur.'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-2">
                        Dokumen: {selectedEntity.sourceDocumentId || 'DED Utama'} • Halaman {selectedEntity.sourcePageNumber || 1}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center p-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                    Pilih salah satu entitas di sebelah kiri untuk melihat rincian parameter.
                  </div>
                )}
              </div>
            </div>
            )
          )}

          {/* TAB 2: TRACEABLE QTO DRAFT */}
          {activeTab === 'qto' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Traceable Quantity Take-Off (QTO) Calculation
                  </h3>
                  <p className="text-xs text-slate-500">
                    Volume dihitung secara matematis deterministik dari entitas terverifikasi.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Deterministic SafeDecimal
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Kode QTO</th>
                      <th className="px-4 py-3 font-semibold">Kategori WBS</th>
                      <th className="px-4 py-3 font-semibold">Deskripsi Pekerjaan</th>
                      <th className="px-4 py-3 font-semibold text-right">Volume</th>
                      <th className="px-4 py-3 font-semibold">Satuan</th>
                      <th className="px-4 py-3 font-semibold">Formula Geometris</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {qtoItems.map(item => (
                      <tr key={item.itemCode} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-mono font-bold text-blue-600 dark:text-blue-400">{item.itemCode}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.category}</td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{item.description}</td>
                        <td className="px-4 py-3 font-bold text-right text-slate-900 dark:text-white">{item.volume.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-3 text-slate-500">{item.unit}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/60 rounded px-2 py-1">
                          {item.formula}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                            {item.reviewStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: WBS & RAB DRAFT REVIEW */}
          {activeTab === 'rab_draft' && (
            deterministicRabSummary ? (
              <RabReviewWorkspaceModalView
                summary={deterministicRabSummary}
                projectId={projectId}
                projectName={projectName}
                totalPages={documents.reduce((sum, d) => sum + (d.pageCount || 1), 0)}
                totalEntities={entities.length}
                onCommitSuccess={(sections, grandTotal) => {
                  onCommitToSpreadsheet(sections as any);
                }}
                onClose={onClose}
              />
            ) : (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Draft Estimasi RAB Terstruktur (AHSP PUPR 2026)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Hasil pemetaan otomatis volume QTO ke katalog analisa harga satuan resmi.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400">Subtotal Estimasi</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrencyIDR(rabDraftSummary.subtotal)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400">Grand Total (+PPN 11%)</p>
                    <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatCurrencyIDR(rabDraftSummary.grandTotal)}</p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">No</th>
                      <th className="px-4 py-3 font-semibold">Kode AHSP</th>
                      <th className="px-4 py-3 font-semibold">Uraian Pekerjaan</th>
                      <th className="px-4 py-3 font-semibold text-right">Volume</th>
                      <th className="px-4 py-3 font-semibold">Satuan</th>
                      <th className="px-4 py-3 font-semibold text-right">Harga Satuan</th>
                      <th className="px-4 py-3 font-semibold text-right">Total Harga</th>
                      <th className="px-4 py-3 font-semibold">Sumber & Validasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rabDraftSummary.items.map((item, idx) => (
                      <tr key={item.itemId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-slate-400">{item.itemNumber || `${idx + 1}.0`}</td>
                        <td className="px-4 py-3 font-mono font-medium text-slate-700 dark:text-slate-300">{item.ahspCode || '-'}</td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{item.description}</td>
                        <td className="px-4 py-3 font-bold text-right text-slate-900 dark:text-white">{item.volume.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-3 text-slate-500">{item.unit}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatCurrencyIDR(item.unitPrice)}</td>
                        <td className="px-4 py-3 font-bold text-right text-blue-600 dark:text-blue-400">{formatCurrencyIDR(item.totalPrice)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              item.verificationStatus === 'VERIFIED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400'
                            }`}
                          >
                            {item.verificationStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )
          )}

          {/* TAB 4: FINDINGS & CROSS-AUDIT */}
          {activeTab === 'findings' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Hasil Cross-Audit Konstruksi AI
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pemeriksaan inkonsistensi antara Gambar Kerja DED vs Daftar RAB.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {findings.length === 0 ? (
                  <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Semua Pekerjaan Sesuai DED</h4>
                    <p className="text-xs text-slate-500 mt-1">Tidak ditemukan anomali atau deviasi material pada RAB ini.</p>
                  </div>
                ) : (
                  findings.map(fnd => (
                    <div
                      key={fnd.findingId}
                      className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              fnd.severity === 'HIGH'
                                ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400'
                            }`}
                          >
                            {fnd.severity} • {fnd.category}
                          </span>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white">{fnd.title}</h4>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">{fnd.findingId}</span>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300">{fnd.description}</p>
                      
                      <div className="p-2.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-300">
                        <strong>Rekomendasi AI:</strong> {fnd.suggestedAction}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 5: DOCUMENT PREVIEW */}
          {activeTab === 'doc_preview' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Document List */}
              <div className="lg:col-span-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Daftar Dokumen Proyek
                </h4>
                {documents.map(doc => (
                  <div
                    key={doc.documentId}
                    onClick={() => setSelectedDocId(doc.documentId)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedDocument?.documentId === doc.documentId
                        ? 'bg-blue-50 border-blue-300 dark:bg-blue-950/40 dark:border-blue-700'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{doc.fileName}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                      <span>{doc.discipline}</span>
                      <span className="font-bold">{doc.currentVersion}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Document Content View */}
              <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{selectedDocument?.fileName}</h4>
                    <p className="text-xs text-slate-500">Versi: {selectedDocument?.currentVersion} • Total Chunks: {selectedDocument?.parsedChunks.length}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Security Verified
                  </span>
                </div>

                <div className="bg-slate-950 text-slate-100 rounded-xl p-4 font-mono text-xs max-h-[350px] overflow-y-auto space-y-2">
                  {selectedDocument?.parsedChunks.map((chk, i) => (
                    <div key={chk.chunkId} className="border-b border-slate-800 pb-2">
                      <div className="text-blue-400 text-[10px]">[Halaman {chk.pageNumber}]</div>
                      <p className="text-slate-300">{chk.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* WORKSPACE FOOTER ACTIONS */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Semua formula & harga diverifikasi oleh EZRAB SafeDecimal Engine.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Tutup
            </button>

            <button
              onClick={handleCommit}
              disabled={isCommitting || committedSuccess}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-lg transition-all ${
                committedSuccess
                  ? 'bg-emerald-600 shadow-emerald-500/20'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20'
              }`}
            >
              {isCommitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memasukkan ke Spreadsheet...</span>
                </>
              ) : committedSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Berhasil Dimasukkan ke Spreadsheet!</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Approve & Terapkan ke Spreadsheet</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
