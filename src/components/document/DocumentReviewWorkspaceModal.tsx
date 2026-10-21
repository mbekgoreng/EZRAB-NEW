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
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200 drwm-x1">
      {/* R-01 fix: layout utilities used in this component are absent from the compiled
          src/styles/magic-ai.css snapshot (no Tailwind build), so their layout
          is provided by these scoped classes (drwm-x*) with Tailwind values. */}
      <style hidden>{`
/* drwm-x1 <- z-50 */
.drwm-x1 { z-index: 50; }
/* drwm-x2 <- max-h-[92vh] max-w-7xl */
.drwm-x2 { max-width: 80rem; max-height: 92vh; }
/* drwm-x3 <- py-4 */
.drwm-x3 { padding-top: 1rem; padding-bottom: 1rem; }
/* drwm-x4 <- px-8 py-16 */
.drwm-x4 { padding-left: 2rem; padding-right: 2rem; padding-top: 4rem; padding-bottom: 4rem; }
/* drwm-x5 <- h-16 mb-5 w-16 */
.drwm-x5 { width: 4rem; height: 4rem; margin-bottom: 1.25rem; }
/* drwm-x6 <- max-w-md mb-6 */
.drwm-x6 { max-width: 28rem; margin-bottom: 1.5rem; }
/* drwm-x7 <- px-5 */
.drwm-x7 { padding-left: 1.25rem; padding-right: 1.25rem; }
/* drwm-x8 <- py-0.2 */
.drwm-x8 { padding-top: 0.05rem; padding-bottom: 0.05rem; }
/* drwm-x9 <- p-6 */
.drwm-x9 { padding: 1.5rem; }
/* drwm-x10 <- gap-6 lg:grid-cols-12 */
.drwm-x10 { gap: 1.5rem; }
@media (min-width: 1024px) { .drwm-x10 { grid-template-columns: repeat(12, minmax(0, 1fr)); } }
/* drwm-x11 <- lg:col-span-5 space-y-3 */
.drwm-x11 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.75rem; }
@media (min-width: 1024px) { .drwm-x11 { grid-column: span 5 / span 5; } }
/* drwm-x12 <- max-h-[500px] pr-1 */
.drwm-x12 { max-height: 500px; padding-right: 0.25rem; }
/* drwm-x13 <- p-3.5 */
.drwm-x13 { padding: 0.875rem; }
/* drwm-x14 <- lg:col-span-7 */
@media (min-width: 1024px) { .drwm-x14 { grid-column: span 7 / span 7; } }
/* drwm-x15 <- pb-3 */
.drwm-x15 { padding-bottom: 0.75rem; }
/* drwm-x16 <- p-3.5 */
.drwm-x16 { padding: 0.875rem; }
/* drwm-x17 <- mb-1 */
.drwm-x17 { margin-bottom: 0.25rem; }
/* drwm-x18 <- p-8 */
.drwm-x18 { padding: 2rem; }
/* drwm-x19 <- space-y-3 */
.drwm-x19 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.75rem; }
/* drwm-x20 <- p-8 */
.drwm-x20 { padding: 2rem; }
/* drwm-x21 <- p-2.5 */
.drwm-x21 { padding: 0.625rem; }
/* drwm-x22 <- lg:col-span-4 */
@media (min-width: 1024px) { .drwm-x22 { grid-column: span 4 / span 4; } }
/* drwm-x23 <- lg:col-span-8 */
@media (min-width: 1024px) { .drwm-x23 { grid-column: span 8 / span 8; } }
/* drwm-x24 <- max-h-[350px] */
.drwm-x24 { max-height: 350px; }
/* drwm-x25 <- pb-2 */
.drwm-x25 { padding-bottom: 0.5rem; }
/* drwm-x26 <- py-4 */
.drwm-x26 { padding-top: 1rem; padding-bottom: 1rem; }
/* drwm-x27 <- px-5 */
.drwm-x27 { padding-left: 1.25rem; padding-right: 1.25rem; }
      
/* --- Stage 2A color fix: token warna di bawah ini tidak ada di snapshot
   src/styles/magic-ai.css sehingga sebelumnya tidak menghasilkan CSS.
   Nilai memakai token --ez-* (otomatis light/dark) atau hex literal
   warna authored untuk zona selalu-gelap (banner gradien, scrim,
   panel terminal/konsol). */
/* bg-amber-100 <- token EZ (bg-amber-100) */
.bg-amber-100 { background-color: var(--ez-color-warning-soft); }
/* bg-blue-100 <- token EZ (bg-blue-100) */
.bg-blue-100 { background-color: var(--ez-color-primary-soft); }
/* bg-blue-50 <- token EZ (bg-blue-50) */
.bg-blue-50 { background-color: var(--ez-color-info-soft); }
/* bg-blue-50/60 <- token EZ (bg-blue-50/60) */
.bg-blue-50\/60 { background-color: color-mix(in srgb, var(--ez-color-info-soft) 60%, transparent); }
/* bg-blue-50/80 <- token EZ (bg-blue-50/80) */
.bg-blue-50\/80 { background-color: color-mix(in srgb, var(--ez-color-info-soft) 80%, transparent); }
/* bg-emerald-100 <- token EZ (bg-emerald-100) */
.bg-emerald-100 { background-color: var(--ez-color-success-soft); }
/* bg-emerald-600 <- token EZ (bg-emerald-600) */
.bg-emerald-600 { background-color: #059669; }
/* bg-gradient-to-r <- gradient direction <- bg-gradient-to-r */
.bg-gradient-to-r { background-image: linear-gradient(to right, var(--tw-gradient-stops)); }
/* bg-indigo-50 <- token EZ (bg-indigo-50) */
.bg-indigo-50 { background-color: var(--ez-ai-surface); }
/* bg-red-100 <- token EZ (bg-red-100) */
.bg-red-100 { background-color: var(--ez-color-danger-soft); }
/* bg-slate-100 <- token EZ (bg-slate-100) */
.bg-slate-100 { background-color: var(--ez-color-border); }
/* bg-slate-50 <- token EZ (bg-slate-50) */
.bg-slate-50 { background-color: var(--ez-color-border-soft); }
/* bg-slate-50/50 <- token EZ (bg-slate-50/50) */
.bg-slate-50\/50 { background-color: color-mix(in srgb, var(--ez-color-border-soft) 50%, transparent); }
/* bg-slate-900/75 <- literal authored (bg-slate-900/75) — zona selalu-gelap/scrim */
.bg-slate-900\/75 { background-color: rgba(15, 23, 42, 0.75); }
/* bg-slate-950 <- literal authored (bg-slate-950) — zona selalu-gelap/scrim */
.bg-slate-950 { background-color: #020617; }
/* border-blue-100 <- token EZ (border-blue-100) */
.border-blue-100 { border-color: color-mix(in srgb, var(--ez-color-primary) 18%, var(--ez-color-surface)); }
/* border-blue-200 <- token EZ (border-blue-200) */
.border-blue-200 { border-color: color-mix(in srgb, var(--ez-color-primary) 32%, var(--ez-color-surface)); }
/* border-blue-300 <- token EZ (border-blue-300) */
.border-blue-300 { border-color: color-mix(in srgb, var(--ez-color-primary) 48%, var(--ez-color-surface)); }
/* border-indigo-200 <- token EZ (border-indigo-200) */
.border-indigo-200 { border-color: color-mix(in srgb, var(--ez-hue-indigo-text) 32%, var(--ez-color-surface)); }
/* border-slate-100 <- token EZ (border-slate-100) */
.border-slate-100 { border-color: var(--ez-color-border-soft); }
/* border-slate-200 <- token EZ (border-slate-200) */
.border-slate-200 { border-color: var(--ez-color-border); }
/* border-slate-800 <- literal authored (border-slate-800) — zona selalu-gelap/scrim */
.border-slate-800 { border-color: #1E293B; }
/* dark:bg-amber-950 <- dark: -> token EZ (bg-amber-950) */
[data-theme="dark"] .dark\:bg-amber-950 { background-color: var(--ez-color-warning-soft); }
/* dark:bg-blue-900/40 <- dark: -> token EZ (bg-blue-900/40) */
[data-theme="dark"] .dark\:bg-blue-900\/40 { background-color: var(--ez-color-primary-soft); }
/* dark:bg-blue-950/30 <- dark: -> token EZ (bg-blue-950/30) */
[data-theme="dark"] .dark\:bg-blue-950\/30 { background-color: color-mix(in srgb, var(--ez-color-primary) 12%, transparent); }
/* dark:bg-blue-950/40 <- dark: -> token EZ (bg-blue-950/40) */
[data-theme="dark"] .dark\:bg-blue-950\/40 { background-color: var(--ez-color-primary-soft); }
/* dark:bg-blue-950/50 <- dark: -> token EZ (bg-blue-950/50) */
[data-theme="dark"] .dark\:bg-blue-950\/50 { background-color: var(--ez-color-primary-soft); }
/* dark:bg-emerald-950 <- dark: -> token EZ (bg-emerald-950) */
[data-theme="dark"] .dark\:bg-emerald-950 { background-color: var(--ez-color-success-soft); }
/* dark:bg-indigo-950/50 <- dark: -> token EZ (bg-indigo-950/50) */
[data-theme="dark"] .dark\:bg-indigo-950\/50 { background-color: var(--ez-ai-surface); }
/* dark:bg-red-950 <- dark: -> token EZ (bg-red-950) */
[data-theme="dark"] .dark\:bg-red-950 { background-color: var(--ez-color-danger-soft); }
/* dark:bg-slate-800 <- dark: -> token EZ (bg-slate-800) */
[data-theme="dark"] .dark\:bg-slate-800 { background-color: var(--ez-color-surface-tertiary); }
/* dark:bg-slate-800/60 <- dark: -> token EZ (bg-slate-800/60) */
[data-theme="dark"] .dark\:bg-slate-800\/60 { background-color: color-mix(in srgb, var(--ez-color-surface-tertiary) 60%, transparent); }
/* dark:bg-slate-900/50 <- dark: -> token EZ (bg-slate-900/50) */
[data-theme="dark"] .dark\:bg-slate-900\/50 { background-color: color-mix(in srgb, var(--ez-color-background) 50%, transparent); }
/* dark:bg-slate-950/40 <- dark: -> token EZ (bg-slate-950/40) */
[data-theme="dark"] .dark\:bg-slate-950\/40 { background-color: color-mix(in srgb, var(--ez-color-background) 40%, transparent); }
/* dark:bg-slate-950/60 <- dark: -> token EZ (bg-slate-950/60) */
[data-theme="dark"] .dark\:bg-slate-950\/60 { background-color: color-mix(in srgb, var(--ez-color-background) 60%, transparent); }
/* dark:border-blue-700 <- dark: -> token EZ (border-blue-700) */
[data-theme="dark"] .dark\:border-blue-700 { border-color: color-mix(in srgb, var(--ez-color-primary) 55%, transparent); }
/* dark:border-blue-800 <- dark: -> token EZ (border-blue-800) */
[data-theme="dark"] .dark\:border-blue-800 { border-color: color-mix(in srgb, var(--ez-color-primary) 55%, transparent); }
/* dark:border-blue-900/40 <- dark: -> token EZ (border-blue-900/40) */
[data-theme="dark"] .dark\:border-blue-900\/40 { border-color: color-mix(in srgb, var(--ez-color-primary) 40%, transparent); }
/* dark:border-indigo-800 <- dark: -> token EZ (border-indigo-800) */
[data-theme="dark"] .dark\:border-indigo-800 { border-color: color-mix(in srgb, var(--ez-hue-indigo-text) 45%, transparent); }
/* dark:border-slate-700/60 <- dark: -> token EZ (border-slate-700/60) */
[data-theme="dark"] .dark\:border-slate-700\/60 { border-color: color-mix(in srgb, var(--ez-color-border-strong) 60%, transparent); }
/* dark:border-slate-800 <- dark: -> token EZ (border-slate-800) */
[data-theme="dark"] .dark\:border-slate-800 { border-color: var(--ez-color-border); }
/* dark:divide-slate-800 <- dark: -> token EZ (divide-slate-800) */
[data-theme="dark"] .dark\:divide-slate-800 > :not([hidden]) ~ :not([hidden]) { border-color: var(--ez-color-border); }
/* dark:hover:bg-slate-800 <- dark: -> token EZ (bg-slate-800) */
[data-theme="dark"] .dark\:hover\:bg-slate-800:hover { background-color: var(--ez-color-surface-tertiary); }
/* dark:hover:bg-slate-800/50 <- dark: -> token EZ (bg-slate-800/50) */
[data-theme="dark"] .dark\:hover\:bg-slate-800\/50:hover { background-color: color-mix(in srgb, var(--ez-color-surface-tertiary) 50%, transparent); }
/* dark:hover:border-slate-700 <- dark: -> token EZ (border-slate-700) */
[data-theme="dark"] .dark\:hover\:border-slate-700:hover { border-color: var(--ez-color-border-strong); }
/* dark:hover:text-slate-300 <- dark: -> token EZ (text-slate-300) */
[data-theme="dark"] .dark\:hover\:text-slate-300:hover { color: var(--ez-color-text-body); }
/* dark:text-amber-400 <- dark: -> token EZ (text-amber-400) */
[data-theme="dark"] .dark\:text-amber-400 { color: var(--ez-hue-amber-text); }
/* dark:text-blue-300 <- dark: -> token EZ (text-blue-300) */
[data-theme="dark"] .dark\:text-blue-300 { color: var(--ez-hue-blue-text); }
/* dark:text-blue-400 <- dark: -> token EZ (text-blue-400) */
[data-theme="dark"] .dark\:text-blue-400 { color: var(--ez-hue-blue-text); }
/* dark:text-emerald-400 <- dark: -> token EZ (text-emerald-400) */
[data-theme="dark"] .dark\:text-emerald-400 { color: var(--ez-hue-green-text); }
/* dark:text-indigo-400 <- dark: -> token EZ (text-indigo-400) */
[data-theme="dark"] .dark\:text-indigo-400 { color: var(--ez-hue-indigo-text); }
/* dark:text-red-400 <- dark: -> token EZ (text-red-400) */
[data-theme="dark"] .dark\:text-red-400 { color: var(--ez-color-danger); }
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
/* from-blue-600 <- gradient stop <- from-blue-600 */
.from-blue-600 { --tw-gradient-from: var(--ez-color-primary) var(--tw-gradient-from-position); --tw-gradient-to: transparent var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
/* from-indigo-500 <- gradient stop <- from-indigo-500 */
.from-indigo-500 { --tw-gradient-from: #6366F1 var(--tw-gradient-from-position); --tw-gradient-to: rgba(99, 102, 241, 0) var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
/* hover:bg-slate-100 <- token EZ (bg-slate-100) */
.hover\:bg-slate-100:hover { background-color: var(--ez-color-border); }
/* hover:bg-slate-50/50 <- token EZ (bg-slate-50/50) */
.hover\:bg-slate-50\/50:hover { background-color: color-mix(in srgb, var(--ez-color-border-soft) 50%, transparent); }
/* hover:border-slate-300 <- token EZ (border-slate-300) */
.hover\:border-slate-300:hover { border-color: color-mix(in srgb, var(--ez-color-border) 60%, var(--ez-color-text-muted)); }
/* hover:from-blue-700 <- gradient stop <- hover:from-blue-700 */
.hover\:from-blue-700:hover { --tw-gradient-from: var(--ez-color-primary-hover) var(--tw-gradient-from-position); --tw-gradient-to: transparent var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
/* hover:text-slate-600 <- token EZ (text-slate-600) */
.hover\:text-slate-600:hover { color: var(--ez-color-text-slate); }
/* hover:to-indigo-700 <- gradient stop <- hover:to-indigo-700 */
.hover\:to-indigo-700:hover { --tw-gradient-to: #4338CA var(--tw-gradient-to-position); }
/* shadow-blue-500/20 <- shadow color <- shadow-blue-500/20 */
.shadow-blue-500\/20 { --tw-shadow-color: rgba(59, 130, 246, 0.2); --tw-shadow: var(--tw-shadow-colored); }
/* shadow-emerald-500/20 <- shadow color <- shadow-emerald-500/20 */
.shadow-emerald-500\/20 { --tw-shadow-color: rgba(16, 185, 129, 0.2); --tw-shadow: var(--tw-shadow-colored); }
/* text-amber-500 <- token EZ (text-amber-500) */
.text-amber-500 { color: var(--ez-color-warning); }
/* text-amber-800 <- token EZ (text-amber-800) */
.text-amber-800 { color: var(--ez-hue-amber-text-dark); }
/* text-blue-400 <- literal authored (text-blue-400) — zona selalu-gelap/scrim */
.text-blue-400 { color: #60A5FA; }
/* text-blue-500 <- token EZ (text-blue-500) */
.text-blue-500 { color: var(--ez-color-primary); }
/* text-blue-600 <- token EZ (text-blue-600) */
.text-blue-600 { color: var(--ez-color-primary); }
/* text-blue-700 <- token EZ (text-blue-700) */
.text-blue-700 { color: var(--ez-color-primary-hover); }
/* text-blue-800 <- token EZ (text-blue-800) */
.text-blue-800 { color: var(--ez-hue-blue-text-deep); }
/* text-blue-900 <- token EZ (text-blue-900) */
.text-blue-900 { color: var(--ez-hue-blue-text-deep); }
/* text-emerald-500 <- token EZ (text-emerald-500) */
.text-emerald-500 { color: var(--ez-color-success); }
/* text-emerald-800 <- token EZ (text-emerald-800) */
.text-emerald-800 { color: var(--ez-hue-green-text-deep); }
/* text-indigo-500 <- token EZ (text-indigo-500) */
.text-indigo-500 { color: var(--ez-hue-indigo-text); }
/* text-indigo-700 <- token EZ (text-indigo-700) */
.text-indigo-700 { color: var(--ez-hue-indigo-text); }
/* text-red-700 <- token EZ (text-red-700) */
.text-red-700 { color: var(--ez-color-danger); }
/* text-red-800 <- token EZ (text-red-800) */
.text-red-800 { color: var(--ez-hue-red-text); }
/* text-slate-100 <- literal authored (text-slate-100) — zona selalu-gelap/scrim */
.text-slate-100 { color: #F1F5F9; }
/* text-slate-300 <- literal authored (text-slate-300) — zona selalu-gelap/scrim */
.text-slate-300 { color: #CBD5E1; }
/* text-slate-400 <- token EZ (text-slate-400) */
.text-slate-400 { color: var(--ez-color-text-muted); }
/* text-slate-500 <- token EZ (text-slate-500) */
.text-slate-500 { color: var(--ez-color-text-muted); }
/* text-slate-600 <- token EZ (text-slate-600) */
.text-slate-600 { color: var(--ez-color-text-slate); }
/* text-slate-700 <- token EZ (text-slate-700) */
.text-slate-700 { color: var(--ez-color-text-body); }
/* to-blue-600 <- gradient stop <- to-blue-600 */
.to-blue-600 { --tw-gradient-to: var(--ez-color-primary) var(--tw-gradient-to-position); }
/* to-indigo-600 <- gradient stop <- to-indigo-600 */
.to-indigo-600 { --tw-gradient-to: #4F46E5 var(--tw-gradient-to-position); }
`}</style>
      <div className="ez-bg-surface rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full flex flex-col overflow-hidden drwm-x2">
        
        {/* TOP HEADER */}
        <div className="px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 drwm-x3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold ez-text-primary dark:text-white">
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

        {documents.length === 0 ? (
          /* Empty state jujur: belum ada dokumen DED.
             JANGAN memfabrikasi dokumen/entitas/QTO/draf RAB — tidak ada
             data turunan yang boleh lahir dari dokumen fiktif. */
          <div className="flex-1 flex flex-col items-center justify-center text-center drwm-x4">
            <div
              className="rounded-2xl flex items-center justify-center drwm-x5"
              style={{ background: 'var(--ez-hue-blue-bg)' }}
            >
              <FileText className="w-8 h-8" color="var(--ez-color-primary)" />
            </div>
            <h3 className="text-base font-bold ez-text-primary mb-2">Belum ada dokumen DED</h3>
            <p className="text-sm ez-text-slate drwm-x6" style={{ lineHeight: 1.6 }}>
              Unggah dokumen DED (gambar kerja atau foto dokumen) untuk memulai analisis AI:
              ekstraksi entitas konstruksi, perhitungan QTO, draf RAB, dan audit temuan.
            </p>
            <button
              onClick={onClose}
              className="py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20 transition-all drwm-x7"
            >
              Tutup
            </button>
          </div>
        ) : (
          <>
        {/* WORKSPACE NAVIGATION TABS */}
        <div className="px-6 py-2 border-b border-slate-200 dark:border-slate-800 ez-bg-surface flex items-center justify-between overflow-x-auto">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('drawing_graph')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'drawing_graph'
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                  : 'ez-text-slate dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                  : 'ez-text-slate dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                  : 'ez-text-slate dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                  : 'ez-text-slate dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                  : 'ez-text-slate dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                  : 'ez-text-slate dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                  : 'ez-text-slate dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <AlertTriangle className={`w-4 h-4 ${highFindingsCount > 0 ? 'text-amber-500' : ''}`} />
              <span>Temuan & Audit ({findings.length})</span>
              {highFindingsCount > 0 && (
                <span className="px-1.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 drwm-x8">
                  {highFindingsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('doc_preview')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'doc_preview'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                  : 'ez-text-slate dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>Preview Dokumen ({documents.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">
              Total Draft: <strong className="ez-text-primary dark:text-slate-200">{formatCurrencyIDR(rabDraftSummary.grandTotal)}</strong>
            </span>
          </div>
        </div>

        {/* WORKSPACE CONTENT BODY */}
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950/40 drwm-x9">
          
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
            <div className="grid grid-cols-1 drwm-x10">
              {/* Entity List */}
              <div className="drwm-x11">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold ez-text-primary dark:text-white">
                    Daftar Entitas Terdeteksi ({entities.length})
                  </h3>
                  <span className="text-xs text-slate-500">Pilih untuk melihat detail</span>
                </div>

                <div className="space-y-2 overflow-y-auto drwm-x12">
                  {entities.map(ent => (
                    <div
                      key={ent.entityId}
                      onClick={() => setSelectedEntity(ent)}
                      className={`rounded-xl border cursor-pointer transition-all ${
                        selectedEntity?.entityId === ent.entityId
                          ? 'bg-blue-50/80 border-blue-300 dark:bg-blue-950/40 dark:border-blue-700 shadow-sm'
                          : 'ez-bg-surface border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      } drwm-x13`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {ent.discipline}
                            </span>
                            <span className="font-semibold text-xs ez-text-primary dark:text-white">
                              {ent.name}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Kuantitas: <strong className="ez-text-body dark:text-slate-300">{ent.quantity} {ent.unit}</strong>
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
              <div className="drwm-x14">
                {selectedEntity ? (
                  <div className="ez-bg-surface rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 drwm-x15">
                      <div>
                        <h4 className="text-base font-bold ez-text-primary dark:text-white">
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
                      <h5 className="text-xs font-bold ez-text-body dark:text-slate-300 uppercase tracking-wider mb-2">
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
                                <td className="px-3 py-2 font-medium ez-text-primary dark:text-slate-200">{param.name}</td>
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
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs drwm-x16">
                      <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 drwm-x17">
                        <Compass className="w-4 h-4 text-blue-500" />
                        <span>Keterangan Dokumen Sumber</span>
                      </div>
                      <p className="ez-text-slate dark:text-slate-400">
                        {selectedEntity.sourceSnippet || 'Terekstraksi dari DED denah arsitektur dan struktur.'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-2">
                        Dokumen: {selectedEntity.sourceDocumentId || 'DED Utama'} • Halaman {selectedEntity.sourcePageNumber || 1}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center ez-bg-surface rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs drwm-x18">
                    Pilih salah satu entitas di sebelah kiri untuk melihat rincian parameter.
                  </div>
                )}
              </div>
            </div>
            )
          )}

          {/* TAB 2: TRACEABLE QTO DRAFT */}
          {activeTab === 'qto' && (
            <div className="ez-bg-surface rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold ez-text-primary dark:text-white">
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
                        <td className="px-4 py-3 ez-text-slate dark:text-slate-400">{item.category}</td>
                        <td className="px-4 py-3 font-medium ez-text-primary dark:text-white">{item.description}</td>
                        <td className="px-4 py-3 font-bold text-right ez-text-primary dark:text-white">{item.volume.toLocaleString('id-ID')}</td>
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
            <div className="ez-bg-surface rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold ez-text-primary dark:text-white">
                    Draft Estimasi RAB Terstruktur (AHSP PUPR 2026)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Hasil pemetaan otomatis volume QTO ke katalog analisa harga satuan resmi.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400">Subtotal Estimasi</p>
                    <p className="text-sm font-bold ez-text-primary dark:text-white">{formatCurrencyIDR(rabDraftSummary.subtotal)}</p>
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
                        <td className="px-4 py-3 font-mono font-medium ez-text-body dark:text-slate-300">{item.ahspCode || '-'}</td>
                        <td className="px-4 py-3 font-medium ez-text-primary dark:text-white">{item.description}</td>
                        <td className="px-4 py-3 font-bold text-right ez-text-primary dark:text-white">{item.volume.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-3 text-slate-500">{item.unit}</td>
                        <td className="px-4 py-3 text-right ez-text-body dark:text-slate-300">{formatCurrencyIDR(item.unitPrice)}</td>
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
                  <h3 className="text-sm font-bold ez-text-primary dark:text-white">
                    Hasil Cross-Audit Konstruksi AI
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pemeriksaan inkonsistensi antara Gambar Kerja DED vs Daftar RAB.
                  </p>
                </div>
              </div>

              <div className="drwm-x19">
                {findings.length === 0 ? (
                  <div className="text-center ez-bg-surface rounded-xl border border-slate-200 dark:border-slate-800 drwm-x20">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <h4 className="text-sm font-bold ez-text-primary dark:text-white">Semua Pekerjaan Sesuai DED</h4>
                    <p className="text-xs text-slate-500 mt-1">Tidak ditemukan anomali atau deviasi material pada RAB ini.</p>
                  </div>
                ) : (
                  findings.map(fnd => (
                    <div
                      key={fnd.findingId}
                      className="p-4 rounded-xl ez-bg-surface border border-slate-200 dark:border-slate-800 shadow-sm space-y-2"
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
                          <h4 className="text-xs font-bold ez-text-primary dark:text-white">{fnd.title}</h4>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">{fnd.findingId}</span>
                      </div>

                      <p className="text-xs ez-text-slate dark:text-slate-300">{fnd.description}</p>
                      
                      <div className="rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-300 drwm-x21">
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
            <div className="grid grid-cols-1 drwm-x10">
              {/* Document List */}
              <div className="space-y-2 drwm-x22">
                <h4 className="text-xs font-bold ez-text-body dark:text-slate-300 uppercase tracking-wider mb-2">
                  Daftar Dokumen Proyek
                </h4>
                {documents.map(doc => (
                  <div
                    key={doc.documentId}
                    onClick={() => setSelectedDocId(doc.documentId)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedDocument?.documentId === doc.documentId
                        ? 'bg-blue-50 border-blue-300 dark:bg-blue-950/40 dark:border-blue-700'
                        : 'ez-bg-surface border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-semibold ez-text-primary dark:text-slate-200 truncate">{doc.fileName}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                      <span>{doc.discipline}</span>
                      <span className="font-bold">{doc.currentVersion}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Document Content View */}
              <div className="ez-bg-surface rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 drwm-x23">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 drwm-x15">
                  <div>
                    <h4 className="text-sm font-bold ez-text-primary dark:text-white">{selectedDocument?.fileName}</h4>
                    <p className="text-xs text-slate-500">Versi: {selectedDocument?.currentVersion} • Total Chunks: {selectedDocument?.parsedChunks.length}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Security Verified
                  </span>
                </div>

                <div className="bg-slate-950 text-slate-100 rounded-xl p-4 font-mono text-xs overflow-y-auto space-y-2 drwm-x24">
                  {selectedDocument?.parsedChunks.map((chk, i) => (
                    <div key={chk.chunkId} className="border-b border-slate-800 drwm-x25">
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
        <div className="px-6 border-t border-slate-200 dark:border-slate-800 ez-bg-surface flex items-center justify-between drwm-x26">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Semua formula & harga diverifikasi oleh EZRAB SafeDecimal Engine.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium ez-text-slate dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Tutup
            </button>

            <button
              onClick={handleCommit}
              disabled={isCommitting || committedSuccess}
              className={`py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-lg transition-all ${
                committedSuccess
                  ? 'bg-emerald-600 shadow-emerald-500/20'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20'
              } drwm-x27`}
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
          </>
        )}

      </div>
    </div>
  );
};
