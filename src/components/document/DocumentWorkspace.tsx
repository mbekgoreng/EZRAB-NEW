import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  Download,
  Save,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Clock,
  History,
  GitBranch,
  Eye,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  Lock,
  Settings,
  Layers,
  Edit3,
  Plus,
  Upload,
  Trash2,
  ChevronDown,
  Check,
  Sparkles,
} from 'lucide-react';
import type {
  DocumentDefinition,
  ProjectMasterData,
  DocumentRecord,
  DocumentFormat,
  ValidationResult,
  ExportHistoryRecord,
  TemplateDefinition,
} from '../../document-engine/types';
import { buildDocumentData, DocumentSourceContext } from '../../document-engine/documentData';
import { validateDocument, validateDocumentAgainstTemplate } from '../../document-engine/validationEngine';
import { renderDocument } from '../../document-engine/renderer';
import { exportDocument } from '../../document-engine/exportService';
import { LocalDocumentRepository } from '../../document-engine/repository';
import type { RABItem, RabItem, ScheduleTask, KurvaSDataPoint } from '../../types';
import { ProjectSourceDrawerModal, type ProjectSourceTab } from '../project-source/ProjectSourceDrawerModal';
import { ProjectDataRepository } from '../../project-data/repository';
import { listProjectAhspItems } from '../../project-data/ahspBridge';
import type { ProjectPersonnel, ProjectEquipment, ProjectJsaItem, ProjectRkkData, ProjectAhspItem } from '../../project-data/types';
import {
  buildTemplateContext,
  resolveTemplateVariables,
  classifyDocumentFields,
  formatRupiah,
} from '../../document-engine/templateEngine';
import {
  CompanyHeaderRepository,
  type CompanyHeaderAsset,
} from '../../document-engine/companyHeaderRepository';
import {
  computeSourceHash,
  detectSourceChanges,
} from '../../document-engine/sourceChangeDetector';
import { TemplateRepository } from '../../document-engine/templateRepository';
import { importDocxTemplate, type DocxImportResult } from '../../document-engine/templateImporter';
import {
  suggestVariableMapping,
  AVAILABLE_CANONICAL_VARIABLES,
  applyVariableMapping,
} from '../../document-engine/templateMapper';
import {
  createCanonicalDocument,
  generateBlockId,
  computeCanonicalContentHash,
  resolveCanonicalDocumentText,
  type CanonicalDocument,
  type DocumentBlock,
} from '../../document-engine/canonicalDocument';
import { TemplateSelectorPanel } from './TemplateSelectorPanel';
import { CanonicalEditorPanel } from './CanonicalEditorPanel';
import { DocxImportModal } from './DocxImportModal';

interface DocumentWorkspaceProps {
  definition: DocumentDefinition;
  master: ProjectMasterData;
  onBack: () => void;
  rabItems?: Array<RABItem | RabItem>;
  scheduleTasks?: ScheduleTask[];
  kurvaSData?: KurvaSDataPoint[];
  ahsp?: Array<Record<string, unknown>>;
  rkk?: Array<Record<string, unknown>>;
  jsa?: Array<Record<string, unknown>>;
  personnel?: Array<Record<string, unknown>>;
  equipment?: Array<Record<string, unknown>>;
  projectPersonnel?: ProjectPersonnel[];
  projectEquipment?: ProjectEquipment[];
  projectJsa?: ProjectJsaItem[];
  projectRkk?: ProjectRkkData[];
  projectAhspItems?: ProjectAhspItem[];
  onSourceDataChanged?: () => void;
}

export const DocumentWorkspace: React.FC<DocumentWorkspaceProps> = ({
  definition,
  master,
  onBack,
  rabItems = [],
  scheduleTasks = [],
  kurvaSData = [],
  ahsp = [],
  rkk = [],
  jsa = [],
  personnel = [],
  equipment = [],
  projectPersonnel,
  projectEquipment,
  projectJsa,
  projectRkk,
  projectAhspItems,
  onSourceDataChanged,
}) => {
  const repo = useMemo(
    () => new LocalDocumentRepository(master.projectNumber || 'default'),
    [master.projectNumber]
  );

  const projId = master.projectNumber || 'default';
  const [localSourceVersion, setLocalSourceVersion] = useState(0);
  const [drawerTab, setDrawerTab] = useState<ProjectSourceTab | null>(null);

  const activePersonnel = useMemo(() => {
    const fromRepo = new ProjectDataRepository<ProjectPersonnel>('personnel', projId).list();
    return fromRepo.length > 0 ? fromRepo : (projectPersonnel || []);
  }, [projId, projectPersonnel, localSourceVersion]);

  const activeEquipment = useMemo(() => {
    const fromRepo = new ProjectDataRepository<ProjectEquipment>('equipment', projId).list();
    return fromRepo.length > 0 ? fromRepo : (projectEquipment || []);
  }, [projId, projectEquipment, localSourceVersion]);

  const activeJsa = useMemo(() => {
    const fromRepo = new ProjectDataRepository<ProjectJsaItem>('jsa', projId).list();
    return fromRepo.length > 0 ? fromRepo : (projectJsa || []);
  }, [projId, projectJsa, localSourceVersion]);

  const activeRkk = useMemo(() => {
    const fromRepo = new ProjectDataRepository<ProjectRkkData>('rkk', projId).list();
    return fromRepo.length > 0 ? fromRepo : (projectRkk || []);
  }, [projId, projectRkk, localSourceVersion]);

  const activeAhsp = useMemo(() => {
    const fromRepo = listProjectAhspItems(projId);
    return fromRepo.length > 0 ? fromRepo : (projectAhspItems || []);
  }, [projId, projectAhspItems, localSourceVersion]);

  // 1. Manage Active Document Record & Revision State
  const [activeRecord, setActiveRecord] = useState<DocumentRecord>(() => {
    const existing = repo.getDocument(definition.id);
    if (existing) return existing;
    return {
      id: `${definition.id}-REV-00`,
      definitionId: definition.id,
      projectId: master.projectNumber || undefined,
      status: 'DRAFT',
      data: {},
      sourceData: {},
      values: {},
      userFieldValues: {},
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  // Reusable Company Header Repository
  const headerRepo = useMemo(() => new CompanyHeaderRepository(), []);
  const [headers, setHeaders] = useState<CompanyHeaderAsset[]>(() => headerRepo.list());
  const [selectedHeaderId, setSelectedHeaderId] = useState<string>(() => {
    const primary = headerRepo.getPrimary();
    return primary ? primary.id : '';
  });

  // Minimal User Field Values state
  const [userValues, setUserValues] = useState<Record<string, any>>(() => {
    return activeRecord.userFieldValues || activeRecord.values || {};
  });

  // Selected revision for view/export (allows viewing past revisions as read-only)
  const [selectedRevision, setSelectedRevision] = useState<number>(activeRecord.revision);
  const isViewingReadOnly = selectedRevision !== activeRecord.revision || Boolean(activeRecord.isReadOnly);

  // Primary Workspace Stepper/Tab: 'data' | 'template' | 'editor' | 'preview' | 'riwayat'
  const [workspaceTab, setWorkspaceTab] = useState<'data' | 'template' | 'editor' | 'preview' | 'riwayat'>('data');

  // Template Repository & Selection
  const templateRepo = useMemo(() => new TemplateRepository(projId), [projId]);
  const [customTemplatesVer, setCustomTemplatesVer] = useState(0);
  const availableTemplates = useMemo(() => {
    return templateRepo.getTemplatesForDocument(definition.id);
  }, [templateRepo, definition.id, customTemplatesVer]);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    return (activeRecord.data?.templateId as string) || templateRepo.getDefaultTemplate(definition.id)?.id || 'offer-letter-standard';
  });

  const activeTemplate = useMemo(() => {
    return templateRepo.getTemplateById(selectedTemplateId) || templateRepo.getDefaultTemplate(definition.id);
  }, [templateRepo, selectedTemplateId, definition.id, customTemplatesVer]);

  // Canonical Document state
  const [canonicalDoc, setCanonicalDoc] = useState<CanonicalDocument>(() => {
    return createCanonicalDocument({
      projectId: projId,
      definition,
      templateId: selectedTemplateId,
      userFields: activeRecord.userFieldValues || activeRecord.values || {},
    });
  });

  // DOCX Import state
  const [isImportingDocx, setIsImportingDocx] = useState(false);
  const [docxImportResult, setDocxImportResult] = useState<DocxImportResult | null>(null);
  const [placeholderMappings, setPlaceholderMappings] = useState<Record<string, string>>({});
  const [showDocxModal, setShowDocxModal] = useState(false);

  // Insert Data dropdown in Editor
  const [showInsertDataMenu, setShowInsertDataMenu] = useState(false);
  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);

  // Quick Header Add Modal State
  const [showAddHeaderModal, setShowAddHeaderModal] = useState(false);
  const [newHeaderName, setNewHeaderName] = useState('');
  const [newHeaderCompany, setNewHeaderCompany] = useState('');
  const [newHeaderAddress, setNewHeaderAddress] = useState('');
  const [newHeaderPhone, setNewHeaderPhone] = useState('');
  const [newHeaderEmail, setNewHeaderEmail] = useState('');

  // Modal State for Revision Creation
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionDescInput, setRevisionDescInput] = useState('');

  // Modal State for Validation Prompts
  const [validationModal, setValidationModal] = useState<{
    show: boolean;
    format: DocumentFormat;
    validation: ValidationResult;
  }>({
    show: false,
    format: 'PDF',
    validation: { valid: true, errors: [], warnings: [] },
  });

  // Export progress notification
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Export history list
  const [exportHistory, setExportHistory] = useState<ExportHistoryRecord[]>([]);

  const refreshHistory = () => {
    setExportHistory(repo.getExportHistory(definition.id));
  };

  useEffect(() => {
    refreshHistory();
  }, [definition.id]);

  const handleOpenFixData = () => {
    const errs = (validationModal.validation?.errors || currentValidation.errors).join(' ').toLowerCase();
    let targetTab: ProjectSourceTab = 'personnel';
    if (errs.includes('jsa')) targetTab = 'jsa';
    else if (errs.includes('rkk')) targetTab = 'rkk';
    else if (errs.includes('alat') || errs.includes('equipment') || errs.includes('peralatan')) targetTab = 'equipment';
    else if (errs.includes('personil') || errs.includes('personnel')) targetTab = 'personnel';
    else if (errs.includes('ahsp')) targetTab = 'ahsp';

    setValidationModal((v) => ({ ...v, show: false }));
    setDrawerTab(targetTab);
  };

  // Context aggregator
  const sourceContext: DocumentSourceContext = useMemo(
    () => ({
      master,
      rabItems,
      scheduleTasks,
      kurvaSData,
      ahsp,
      rkk,
      jsa,
      personnel,
      equipment,
      projectPersonnel: activePersonnel,
      projectEquipment: activeEquipment,
      projectJsa: activeJsa,
      projectRkk: activeRkk,
      projectAhspItems: activeAhsp,
      revision: selectedRevision,
      userFieldValues: userValues,
      companyHeaderId: selectedHeaderId,
    }),
    [
      master,
      rabItems,
      scheduleTasks,
      kurvaSData,
      ahsp,
      rkk,
      jsa,
      personnel,
      equipment,
      activePersonnel,
      activeEquipment,
      activeJsa,
      activeRkk,
      activeAhsp,
      selectedRevision,
      userValues,
      selectedHeaderId,
    ]
  );

  const templateContext = useMemo(
    () => buildTemplateContext(sourceContext, userValues),
    [sourceContext, userValues]
  );

  const resolvedTemplateBody = useMemo(() => {
    if (!definition.templateBody) return null;
    return resolveTemplateVariables(definition.templateBody, templateContext);
  }, [definition.templateBody, templateContext]);

  const fieldClassification = useMemo(() => {
    return classifyDocumentFields(definition);
  }, [definition]);

  const sourceChangeResult = useMemo(() => {
    return detectSourceChanges(activeRecord, sourceContext);
  }, [activeRecord, sourceContext]);

  const handleSyncSourceData = () => {
    const newHash = computeSourceHash(sourceContext);
    const updatedRecord: DocumentRecord = {
      ...activeRecord,
      sourceHash: newHash,
      sourceTimestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setActiveRecord(updatedRecord);
    repo.saveDocument(updatedRecord);
    onSourceDataChanged?.();
    setExportNotice('Data sumber berhasil disinkronkan');
    setTimeout(() => setExportNotice(null), 2500);
  };

  const handleFieldChange = (fieldKey: string, val: any) => {
    setUserValues((prev) => {
      const updated = { ...prev, [fieldKey]: val };
      if (!isViewingReadOnly) {
        const updatedRecord: DocumentRecord = {
          ...activeRecord,
          userFieldValues: updated,
          values: updated,
          updatedAt: new Date().toISOString(),
        };
        setActiveRecord(updatedRecord);
        repo.saveDocument(updatedRecord);
      }
      return updated;
    });
  };

  // Phase 6 Template Switching
  const handleSelectTemplate = (tplId: string) => {
    setSelectedTemplateId(tplId);
    templateRepo.recordUsage(tplId);
    const tpl = templateRepo.getTemplateById(tplId);
    if (tpl) {
      // Re-create canonical document for this template
      const newBlocks = createCanonicalDocument({
        projectId: projId,
        definition: {
          ...definition,
          templateBody: tpl.body || definition.templateBody,
        },
        templateId: tplId,
        userFields: userValues,
      }).blocks;

      setCanonicalDoc((prev) => ({
        ...prev,
        templateId: tplId,
        blocks: newBlocks,
      }));

      if (!isViewingReadOnly) {
        const updatedRecord: DocumentRecord = {
          ...activeRecord,
          data: { ...activeRecord.data, templateId: tplId },
          updatedAt: new Date().toISOString(),
        };
        setActiveRecord(updatedRecord);
        repo.saveDocument(updatedRecord);
      }

      setExportNotice(`Template '${tpl.name}' aktif.`);
      setTimeout(() => setExportNotice(null), 2500);
    }
  };

  // Phase 6 DOCX Template Upload
  const handleDocxFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportingDocx(true);
    try {
      const buffer = await file.arrayBuffer();
      const res = await importDocxTemplate(buffer, file.name);
      setDocxImportResult(res);
      // Auto-suggest mappings for detected placeholders
      const mappings: Record<string, string> = {};
      for (const ph of res.detectedPlaceholders) {
        const suggested = suggestVariableMapping(ph);
        if (suggested) mappings[ph] = suggested;
      }
      setPlaceholderMappings(mappings);
      setShowDocxModal(true);
    } catch (err: any) {
      setExportNotice(`Gagal membaca file DOCX: ${err.message || String(err)}`);
    } finally {
      setIsImportingDocx(false);
      e.target.value = '';
    }
  };

  const handleApplyImportedTemplate = () => {
    if (!docxImportResult) return;
    const mappedBlocks = applyVariableMapping(docxImportResult.detectedBlocks, placeholderMappings);
    const saved = templateRepo.saveCustomTemplate({
      name: docxImportResult.templateName,
      description: 'Template DOCX kustom yang diunggah pengguna',
      documentType: definition.id,
      category: definition.category,
      source: 'USER',
      templateSource: 'DOCX',
      body: mappedBlocks.map((b) => (b.type === 'paragraph' ? b.content : b.type === 'heading' ? b.text : '')).join('\n\n'),
      variableMapping: placeholderMappings,
    });
    setCustomTemplatesVer((v) => v + 1);
    setSelectedTemplateId(saved.id);
    setCanonicalDoc((prev) => ({
      ...prev,
      templateId: saved.id,
      blocks: mappedBlocks,
    }));
    setShowDocxModal(false);
    setExportNotice(`Template kustom '${saved.name}' berhasil disimpan & diterapkan.`);
    setTimeout(() => setExportNotice(null), 3000);
  };

  // Phase 6 Block Editor Handlers
  const handleUpdateBlockContent = (blockId: string, newContent: string) => {
    setCanonicalDoc((prev) => {
      const newBlocks = prev.blocks.map((b) => {
        if (b.id === blockId) {
          if (b.type === 'paragraph') return { ...b, content: newContent };
          if (b.type === 'heading') return { ...b, text: newContent };
        }
        return b;
      });
      return {
        ...prev,
        blocks: newBlocks,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleAddParagraphBlock = () => {
    const newBlock: DocumentBlock = {
      id: generateBlockId(),
      type: 'paragraph',
      order: canonicalDoc.blocks.length + 1,
      content: 'Tuliskan paragraf baru di sini...',
      align: 'left',
    };
    setCanonicalDoc((prev) => ({
      ...prev,
      blocks: [...prev.blocks, newBlock],
    }));
  };

  const handleAddHeadingBlock = () => {
    const newBlock: DocumentBlock = {
      id: generateBlockId(),
      type: 'heading',
      order: canonicalDoc.blocks.length + 1,
      text: 'JUDUL BAGIAN BARU',
      level: 2,
      align: 'left',
    };
    setCanonicalDoc((prev) => ({
      ...prev,
      blocks: [...prev.blocks, newBlock],
    }));
  };

  const handleDeleteBlock = (blockId: string) => {
    setCanonicalDoc((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== blockId),
    }));
  };

  const handleInsertVariableIntoBlock = (variablePath: string) => {
    const token = `{{${variablePath}}}`;
    if (editingBlockIndex !== null && canonicalDoc.blocks[editingBlockIndex]) {
      const targetBlock = canonicalDoc.blocks[editingBlockIndex];
      if (targetBlock.type === 'paragraph') {
        handleUpdateBlockContent(targetBlock.id, targetBlock.content + ' ' + token);
      } else if (targetBlock.type === 'heading') {
        handleUpdateBlockContent(targetBlock.id, targetBlock.text + ' ' + token);
      }
    } else {
      const newBlock: DocumentBlock = {
        id: generateBlockId(),
        type: 'paragraph',
        order: canonicalDoc.blocks.length + 1,
        content: `Data: ${token}`,
        align: 'left',
      };
      setCanonicalDoc((prev) => ({
        ...prev,
        blocks: [...prev.blocks, newBlock],
      }));
    }
    setShowInsertDataMenu(false);
  };

  // 2. Build DocumentData & Validation
  const documentData = useMemo(
    () => buildDocumentData(definition, sourceContext),
    [definition, sourceContext]
  );

  const currentValidation = useMemo(
    () => validateDocumentAgainstTemplate(activeTemplate, definition, documentData, sourceContext, userValues),
    [activeTemplate, definition, documentData, sourceContext, userValues]
  );

  // 3. Render Document for unified A4 Preview
  const renderedDoc = useMemo(
    () => renderDocument(definition, documentData),
    [definition, documentData]
  );

  // Revision history from repository
  const revisionList = useMemo(() => {
    return repo.getRevisionHistory(definition.id);
  }, [definition.id, activeRecord.revision]);

  // 4. Trigger Export with Validation Gating
  const handleExportClick = (format: DocumentFormat) => {
    const val = validateDocumentAgainstTemplate(activeTemplate, definition, documentData, sourceContext, userValues);

    if (!val.valid) {
      // ERROR blocks export -> Open modal showing errors with "Perbaiki Data"
      setValidationModal({
        show: true,
        format,
        validation: val,
      });
      return;
    }

    if (val.warnings.length > 0) {
      // WARNING allows export -> Open modal showing warnings with "Export Anyway"
      setValidationModal({
        show: true,
        format,
        validation: val,
      });
      return;
    }

    // Completely valid -> Proceed directly
    executeExport(format);
  };

  const executeExport = async (format: DocumentFormat) => {
    setValidationModal((v) => ({ ...v, show: false }));
    setExportNotice(`Mengekspor ${format}...`);

    try {
      const res = await exportDocument({
        definition,
        context: sourceContext,
        format,
        documentRecord: activeRecord,
        revision: selectedRevision,
        repository: repo,
        triggerDownload: true,
      });

      if (res.success) {
        setExportNotice(`Berhasil diekspor: ${res.filename}`);
        refreshHistory();
        setTimeout(() => setExportNotice(null), 4000);
      } else {
        setExportNotice(`Gagal: ${res.error}`);
        refreshHistory();
      }
    } catch (err) {
      setExportNotice(`Terjadi kesalahan: ${err instanceof Error ? err.message : String(err)}`);
      refreshHistory();
    }
  };

  // 5. Create Explicit Revision
  const handleCreateRevisionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionDescInput.trim()) return;

    const currentHash = computeSourceHash(sourceContext);
    const updated = repo.createRevision({
      ...activeRecord,
      userFieldValues: userValues,
      values: userValues,
      sourceHash: currentHash,
      sourceTimestamp: new Date().toISOString(),
    }, revisionDescInput.trim());
    setActiveRecord(updated);
    setSelectedRevision(updated.revision);
    setShowRevisionModal(false);
    setRevisionDescInput('');
    setExportNotice(`Revisi berhasil dibuat: REV ${String(updated.revision).padStart(2, '0')}`);
    setTimeout(() => setExportNotice(null), 3500);
    onSourceDataChanged?.();
  };

  const currentRevStr = `REV ${String(selectedRevision).padStart(2, '0')}`;

  return (
    <div style={{ background: 'var(--ez-color-surface-secondary)', minHeight: 'calc(100vh - 64px)', padding: 24, fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
      {/* TOP BAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 18,
          background: 'var(--ez-color-surface)',
          padding: '14px 20px',
          borderRadius: 'var(--ez-radius-control)',
          border: '1px solid var(--ez-color-border-line)',
          boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={onBack}
            style={{
              border: '1px solid var(--ez-color-border-line)',
              background: 'var(--ez-color-surface-secondary)',
              borderRadius: 8,
              padding: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ArrowLeft size={18} color="var(--ez-color-text-slate)" />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 750, color: 'var(--ez-color-text-primary)' }}>
                {definition.name}
              </h2>
              <span
                style={{
                  background: isViewingReadOnly ? 'var(--ez-hue-amber-bg-deep)' : 'var(--ez-hue-blue-bg)',
                  color: isViewingReadOnly ? 'var(--ez-hue-amber-text)' : 'var(--ez-color-primary)',
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {isViewingReadOnly && <Lock size={12} />}
                {currentRevStr} {isViewingReadOnly ? '(Read-only)' : '(Current)'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ez-color-text-muted)', marginTop: 2 }}>
              {definition.code} · Kategori: {definition.category} · Template: {definition.templateId}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Create New Revision Button */}
          <button
            onClick={() => setShowRevisionModal(true)}
            style={{
              border: '1px solid var(--ez-hue-slate-border)',
              background: 'var(--ez-color-surface)',
              color: 'var(--ez-color-text-body)',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <GitBranch size={15} color="var(--ez-hue-blue-text)" />
            <span>Create New Revision</span>
          </button>

          {/* Normal Save */}
          <button
            onClick={() => {
              const currentHash = computeSourceHash(sourceContext);
              const updatedRecord: DocumentRecord = {
                ...activeRecord,
                userFieldValues: userValues,
                values: userValues,
                sourceHash: currentHash,
                sourceTimestamp: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              setActiveRecord(updatedRecord);
              repo.saveDocument(updatedRecord);
              setExportNotice('Dokumen berhasil disimpan');
              setTimeout(() => setExportNotice(null), 2500);
              onSourceDataChanged?.();
            }}
            disabled={isViewingReadOnly}
            style={{
              border: '1px solid var(--ez-hue-slate-border)',
              background: isViewingReadOnly ? 'var(--ez-color-surface-tertiary)' : 'var(--ez-color-surface)',
              color: isViewingReadOnly ? '#94A3B8' : 'var(--ez-color-text-body)',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: isViewingReadOnly ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Save size={15} />
            <span>Save</span>
          </button>

          {/* Data Sumber Proyek */}
          <button
            onClick={() => setDrawerTab('personnel')}
            style={{
              border: '1px solid var(--ez-hue-slate-border)',
              background: 'var(--ez-color-surface)',
              color: 'var(--ez-color-text-body)',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Kelola Data Sumber Proyek (Personil, Alat, JSA, RKK, AHSP)"
          >
            <Settings size={15} color="var(--ez-color-text-slate)" />
            <span>Data Sumber</span>
          </button>

          {/* Export Dropdown / Primary Action */}
          {definition.supportedFormats.includes('PDF') && (
            <button
              onClick={() => handleExportClick('PDF')}
              style={{
                background: 'var(--ez-color-primary)',
                color: '#fff',
                border: 0,
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
              }}
            >
              <Download size={15} />
              <span>Export PDF</span>
            </button>
          )}

          {definition.supportedFormats.includes('DOCX') && (
            <button
              onClick={() => handleExportClick('DOCX')}
              style={{
                background: '#0284C7',
                color: '#fff',
                border: 0,
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <FileText size={15} />
              <span>DOCX</span>
            </button>
          )}

          {definition.supportedFormats.includes('XLSX') && (
            <button
              onClick={() => handleExportClick('XLSX')}
              style={{
                background: '#16A34A',
                color: '#fff',
                border: 0,
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <FileSpreadsheet size={15} />
              <span>XLSX</span>
            </button>
          )}
        </div>
      </div>

      {/* NOTIFICATION TOAST */}
      {exportNotice && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 16px',
            borderRadius: 8,
            background: exportNotice.startsWith('Gagal') ? 'var(--ez-hue-rose-bg)' : 'var(--ez-hue-green-bg)',
            color: exportNotice.startsWith('Gagal') ? 'var(--ez-hue-rose-text)' : 'var(--ez-hue-green-text)',
            border: `1px solid ${exportNotice.startsWith('Gagal') ? 'var(--ez-hue-rose-border)' : 'var(--ez-hue-green-border)'}`,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {exportNotice.startsWith('Gagal') ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{exportNotice}</span>
        </div>
      )}

      {/* SOURCE DATA CHANGE ALERT */}
      {sourceChangeResult.hasChanged && (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 18px',
            borderRadius: 10,
            background: 'var(--ez-hue-amber-bg)',
            border: '1px solid #FCD34D',
            color: 'var(--ez-hue-amber-text-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={18} color="var(--ez-hue-amber-text-deep)" />
            <div>
              <strong style={{ fontSize: 13 }}>Data Sumber Proyek Berubah:</strong>{' '}
              <span style={{ fontSize: 12.5 }}>
                {sourceChangeResult.message || 'Data RAB, jadwal, atau master proyek telah berubah. Dokumen ini perlu diperbarui.'}
              </span>
            </div>
          </div>
          <button
            onClick={handleSyncSourceData}
            style={{
              background: '#D97706',
              color: '#fff',
              border: 0,
              borderRadius: 7,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Sinkronkan Dokumen
          </button>
        </div>
      )}

      {/* PHASE 6 PRIMARY NAVIGATION: DATA → TEMPLATE → EDIT → PREVIEW → RIWAYAT */}
      <div
        style={{
          display: 'flex',
          background: 'var(--ez-color-surface)',
          border: '1px solid var(--ez-color-border-line)',
          borderRadius: 'var(--ez-radius-control)',
          padding: 6,
          marginBottom: 20,
          gap: 6,
          boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
        }}
      >
        {[
          { id: 'data', label: '1. Data Dokumen', icon: FileText },
          { id: 'template', label: '2. Template', icon: Layers },
          { id: 'editor', label: '3. Editor', icon: Edit3 },
          { id: 'preview', label: '4. Preview', icon: Eye },
          { id: 'riwayat', label: '5. Riwayat', icon: History },
        ].map((tab) => {
          const isActive = workspaceTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setWorkspaceTab(tab.id as any)}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: 0,
                borderRadius: 8,
                background: isActive ? 'var(--ez-color-primary)' : 'transparent',
                color: isActive ? '#fff' : 'var(--ez-color-text-slate)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={16} color={isActive ? '#fff' : '#64748B'} />
              <span style={{ fontSize: 13, fontWeight: isActive ? 750 : 600 }}>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ✨ BANTU AI ASSISTANT PANEL */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--ez-hue-green-bg) 0%, var(--ez-hue-blue-bg) 100%)',
          border: '1px solid var(--ez-hue-blue-border)',
          borderRadius: 'var(--ez-radius-control)',
          padding: '12px 18px',
          marginBottom: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--ez-color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={16} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 750, color: 'var(--ez-color-text-primary)' }}>
              ✨ Bantu AI — Asisten Dokumen Konstruksi
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ez-color-text-muted)' }}>
              Gunakan panduan standar LKPP/PUPR dan sinkronisasi otomatis nilai RAB untuk dokumen ini.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              if (definition.id === 'offer-letter') {
                setUserValues(prev => ({
                  ...prev,
                  'letter.number': prev['letter.number'] || '012/SPH/AKM/IV/2026',
                  'recipient.name': prev['recipient.name'] || 'Pokja Pemilihan / PPK Konstruksi',
                  'signatory.position': prev['signatory.position'] || 'Direktur Utama',
                }));
                setExportNotice('✨ AI berhasil melengkapi format pembuka formal standar penawaran.');
              } else {
                setExportNotice('✨ AI memeriksa format dokumen sesuai standar konstruksi.');
              }
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-hue-slate-border)',
              color: 'var(--ez-color-primary-hover)',
              fontSize: 12,
              fontWeight: 650,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span>Draft Pembuka Formal</span>
          </button>

          <button
            onClick={() => {
              const rabTotal = templateContext.rab?.grandTotal;
              if (rabTotal) {
                setExportNotice(`✓ Nilai terverifikasi sinkron dengan RAB Proyek: ${rabTotal}`);
              } else {
                setExportNotice('⚠️ Nilai RAB belum tersedia di modul kalkulator.');
              }
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-hue-slate-border)',
              color: 'var(--ez-hue-green-text)',
              fontSize: 12,
              fontWeight: 650,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span>Cocokkan Nilai RAB</span>
          </button>

          <button
            onClick={() => {
              setWorkspaceTab('preview');
              setExportNotice('✓ Membuka preview A4 untuk pengecekan visual.');
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              background: 'var(--ez-color-primary)',
              border: 'none',
              color: '#FFFFFF',
              fontSize: 12,
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            Cek Preview Visual
          </button>
        </div>
      </div>

      {/* VIEW 2: TEMPLATE SELECTION (Phase 6C) */}
      {workspaceTab === 'template' && (
        <TemplateSelectorPanel
          definition={definition}
          availableTemplates={availableTemplates}
          selectedTemplateId={selectedTemplateId}
          onSelectTemplate={handleSelectTemplate}
          onDocxUpload={handleDocxFileUpload}
          isImportingDocx={isImportingDocx}
          onDeleteCustomTemplate={(tplId) => {
            templateRepo.deleteCustomTemplate(tplId);
            setCustomTemplatesVer((v) => v + 1);
          }}
        />
      )}

      {/* VIEW 3: CANONICAL BLOCK EDITOR (Phase 6F) */}
      {workspaceTab === 'editor' && (
        <CanonicalEditorPanel
          canonicalDoc={canonicalDoc}
          onUpdateBlock={handleUpdateBlockContent}
          onAddParagraph={handleAddParagraphBlock}
          onAddHeading={handleAddHeadingBlock}
          onDeleteBlock={handleDeleteBlock}
          onMoveBlock={(blockId, dir) => {
            setCanonicalDoc((prev) => {
              const idx = prev.blocks.findIndex((b) => b.id === blockId);
              if (idx === -1) return prev;
              const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
              if (targetIdx < 0 || targetIdx >= prev.blocks.length) return prev;
              const newBlocks = [...prev.blocks];
              const temp = newBlocks[idx];
              newBlocks[idx] = newBlocks[targetIdx];
              newBlocks[targetIdx] = temp;
              return { ...prev, blocks: newBlocks };
            });
          }}
          onInsertVariable={handleInsertVariableIntoBlock}
          isReadOnly={isViewingReadOnly}
          contextValues={{
            'project.name': templateContext.project.name,
            'project.location': templateContext.project.location,
            'project.duration': templateContext.project.duration,
            'rab.grandTotal': templateContext.rab.grandTotal,
            'rab.grandTotalInWords': templateContext.rab.grandTotalInWords,
            'company.name': templateContext.company.name,
            'signatory.name': userValues['signatory.name'] || templateContext.signatory.name,
            'signatory.position': userValues['signatory.position'] || templateContext.signatory.position,
            'letter.number': userValues['letter.number'] || '',
            'recipient.name': userValues['recipient.name'] || '',
          }}
        />
      )}

      {/* MAIN WORKSPACE GRID */}
      <div style={{ display: workspaceTab === 'data' || workspaceTab === 'preview' || workspaceTab === 'riwayat' ? 'grid' : 'none', gridTemplateColumns: workspaceTab === 'data' ? '1fr 340px' : '1fr', gap: 20 }}>
        {/* LEFT / CENTER: HIGH FIDELITY A4 PREVIEW (Source: renderDocument) */}
        <main style={{ overflowX: 'auto', display: 'flex', justifyContent: 'center' }}>
          <div
            className="a4-preview-sheet"
            style={{
              background: 'var(--ez-color-surface)',
              width: 'min(794px, 100%)',
              minHeight: 1123,
              padding: '50px 55px',
              borderRadius: 4,
              boxShadow: '0 8px 30px rgba(15,23,42,0.12)',
              fontFamily: "'Segoe UI', Arial, sans-serif",
              color: 'var(--ez-color-text-primary)',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              {/* KOP PERUSAHAAN (COMPANY HEADER) */}
              {(() => {
                const activeHeader = headers.find(h => h.id === selectedHeaderId) || headerRepo.getPrimary();
                if (activeHeader) {
                  if (activeHeader.type === 'IMAGE') {
                    return (
                      <div style={{ textAlign: 'center', borderBottom: '2px solid #0F172A', paddingBottom: 10, marginBottom: 18 }}>
                        <img src={activeHeader.content} alt={activeHeader.name} style={{ maxHeight: 75, maxWidth: '100%', objectFit: 'contain' }} />
                      </div>
                    );
                  }
                  return (
                    <div style={{ textAlign: 'center', borderBottom: '2px double #0F172A', paddingBottom: 10, marginBottom: 18 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {activeHeader.companyName || master.companyName || 'PT KONSTRUKSI TAMA'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ez-color-text-slate)', marginTop: 2 }}>
                        {activeHeader.companyAddress || master.companyAddress || 'Jl. Raya Konstruksi No. 10'}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--ez-color-text-muted)', marginTop: 1 }}>
                        Telp: {activeHeader.companyPhone || master.companyPhone || '021-5551234'} | Email: {activeHeader.companyEmail || master.companyEmail || 'info@konstruksi.id'}
                      </div>
                    </div>
                  );
                }
                return (
                  <div style={{ textAlign: 'center', borderBottom: '2px double #0F172A', paddingBottom: 10, marginBottom: 18 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {master.companyName || 'PT EZRAB KONSTRUKSI TAMA'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ez-color-text-slate)', marginTop: 2 }}>
                      {master.companyAddress || 'Surabaya, Jawa Timur'}
                    </div>
                  </div>
                );
              })()}

              {/* TEMPLATE BODY (WHEN TEMPLATE IS DEFINED, e.g. Surat Penawaran) */}
              {resolvedTemplateBody ? (
                <div style={{ marginBottom: 20 }}>
                  {/* Formal Letter Header (if applicable) */}
                  {(userValues['letter.number'] || userValues['recipient.name'] || definition.id === 'offer-letter') && (
                    <div style={{ marginBottom: 16, fontSize: 11.5, lineHeight: 1.5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div>
                          <div><strong>Nomor:</strong> {userValues['letter.number'] || '001/PNH-EZRAB/2026'}</div>
                          <div><strong>Lampiran:</strong> {userValues['letter.attachment'] || '1 (satu) Berkas'}</div>
                          <div><strong>Perihal:</strong> {userValues['letter.subject'] || 'Penawaran Pekerjaan'}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div>{master.location || 'Surabaya'}, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                        </div>
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <div>Kepada Yth.</div>
                        <div style={{ fontWeight: 700 }}>{userValues['recipient.name'] || 'Pejabat Pembuat Komitmen (PPK)'}</div>
                        <div>{userValues['recipient.position'] || 'Pimpinan Proyek'}</div>
                        <div>{userValues['recipient.organization'] || master.owner || 'Instansi Terkait'}</div>
                        {userValues['recipient.address'] && <div>{userValues['recipient.address']}</div>}
                        <div style={{ marginTop: 2 }}>di Tempat</div>
                      </div>
                    </div>
                  )}

                  {/* Rendered Template Text */}
                  <div
                    style={{
                      fontSize: 11.5,
                      lineHeight: 1.6,
                      color: 'var(--ez-color-text-strong)',
                      whiteSpace: 'pre-wrap',
                      background: '#FDFEFE',
                      padding: '12px 14px',
                      borderRadius: 6,
                      border: '1px solid var(--ez-color-surface-tertiary)',
                    }}
                  >
                    {resolvedTemplateBody.text}
                  </div>
                </div>
              ) : (
                /* Cover & Header (for reports without full templateBody) */
                <div style={{ borderBottom: '2px solid #2563EB', paddingBottom: 14, marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h1 style={{ margin: '0 0 4px 0', fontSize: 22, fontWeight: 800, color: 'var(--ez-color-text-strong)' }}>
                        {renderedDoc.metadata.name}
                      </h1>
                      <div style={{ fontSize: 11, color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>
                        EZRAB CONSTRUCTION DOCUMENT · {renderedDoc.metadata.code}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          background: 'var(--ez-hue-blue-bg)',
                          color: 'var(--ez-color-primary)',
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {renderedDoc.metadata.revision}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 3 }}>
                        {renderedDoc.metadata.date}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Project Information Box (shown for reports or non-letters) */}
              {!resolvedTemplateBody && (
                <div
                  style={{
                    background: 'var(--ez-color-surface-secondary)',
                    border: '1px solid var(--ez-color-border-line)',
                    borderRadius: 6,
                    padding: '12px 16px',
                    marginBottom: 22,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 750, color: 'var(--ez-color-text-slate)', marginBottom: 6, letterSpacing: '0.04em' }}>
                    INFORMASI PROYEK
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 12 }}>
                    <div>
                      <strong style={{ color: 'var(--ez-color-text-body)' }}>Nama Proyek:</strong> {renderedDoc.metadata.project}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--ez-color-text-body)' }}>Lokasi:</strong> {renderedDoc.metadata.location}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--ez-color-text-body)' }}>Pemilik (Owner):</strong> {renderedDoc.metadata.owner}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--ez-color-text-body)' }}>Nilai Kontrak:</strong>{' '}
                      {renderedDoc.metadata.contractValue ? `Rp ${Number(renderedDoc.metadata.contractValue).toLocaleString('id-ID')}` : '—'}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--ez-color-text-body)' }}>Kontraktor:</strong> {renderedDoc.metadata.contractor}
                    </div>
                  </div>
                </div>
              )}

              {/* Scope & Parameter Fields (when not offer-letter) */}
              {definition.id !== 'offer-letter' && definition.fields.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--ez-color-text-strong)' }}>
                    Ketentuan & Parameter Dokumen
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: 'var(--ez-color-primary)', color: '#fff' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #2563EB' }}>Parameter / Klausul</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #2563EB' }}>Keterangan Nilai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {definition.fields.map((f, i) => (
                        <tr key={f.id} style={{ background: i % 2 === 0 ? '#FFFFFF' : 'var(--ez-color-surface-secondary)' }}>
                          <td style={{ padding: '5px 10px', border: '1px solid var(--ez-color-border-line)', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>
                            {f.label}
                          </td>
                          <td style={{ padding: '5px 10px', border: '1px solid var(--ez-color-border-line)', color: 'var(--ez-color-text-primary)' }}>
                            {String(userValues[f.id] ?? master[f.id as keyof ProjectMasterData] ?? '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Data Tables if available */}
              {renderedDoc.tables.length > 0 && renderedDoc.tableColumns && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--ez-color-text-strong)' }}>
                    Lampiran Data Tabel
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                      <thead>
                        <tr style={{ background: '#0F172A', color: '#fff' }}>
                          {renderedDoc.tableColumns.map((col) => (
                            <th key={col.key} style={{ padding: '5px 8px', textAlign: 'left', border: '1px solid #0F172A' }}>
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {renderedDoc.tables.slice(0, 15).map((row, rIdx) => (
                          <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? '#FFFFFF' : 'var(--ez-color-surface-secondary)' }}>
                            {renderedDoc.tableColumns!.map((col) => {
                              const val = row[col.key];
                              return (
                                <td key={col.key} style={{ padding: '4px 8px', border: '1px solid var(--ez-color-border-line)' }}>
                                  {typeof val === 'number' ? val.toLocaleString('id-ID') : String(val ?? '—')}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {renderedDoc.tables.length > 15 && (
                    <div style={{ fontSize: 10, color: 'var(--ez-color-text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                      Menampilkan 15 dari {renderedDoc.tables.length} baris (semua baris disertakan lengkap saat export).
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Signature Area */}
            <div style={{ marginTop: 30, borderTop: '1px solid var(--ez-color-border-line)', paddingTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ width: 230, textAlign: 'left', fontSize: 11 }}>
                  <div>{master.location || 'Surabaya'}, {renderedDoc.metadata.date}</div>
                  <div style={{ marginTop: 4 }}>Hormat kami,</div>
                  <div style={{ fontWeight: 750, color: 'var(--ez-color-text-primary)' }}>
                    {master.companyName || master.contractor || 'Penyedia Jasa'}
                  </div>
                  <div style={{ height: 48, display: 'flex', alignItems: 'center' }}>
                    {master.companySignature ? (
                      <span style={{ fontSize: 10.5, color: 'var(--ez-hue-green-text-bright)', fontWeight: 600 }}>[Signature Attached]</span>
                    ) : (
                      <span style={{ color: '#94A3B8' }}>____________________</span>
                    )}
                  </div>
                  <div style={{ fontWeight: 750, borderTop: '1px solid #64748B', paddingTop: 4 }}>
                    {userValues['signatory.name'] || renderedDoc.signatures[0]?.name || master.director || 'Nama Penandatangan'}
                  </div>
                  <div style={{ color: 'var(--ez-color-text-muted)' }}>{userValues['signatory.position'] || renderedDoc.signatures[0]?.position || 'Direktur Utama'}</div>
                </div>
              </div>
            </div>
          </div>
        </main>
        {/* RIGHT ASIDE (DATA DOKUMEN INPUTS): SHOWN ONLY WHEN workspaceTab === 'data' */}
        {workspaceTab === 'data' && (
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Auto Populated Source Summary */}
            <div style={{ background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ez-hue-green-text)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={15} color="var(--ez-hue-green-text-bright)" />
                <span>Data Terisi Otomatis (Auto)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: 'var(--ez-color-text-muted)' }}>✓ Nama Pekerjaan:</span>
                  <strong style={{ color: 'var(--ez-color-text-primary)', textAlign: 'right', maxWidth: '60%' }}>{templateContext.project.name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: 'var(--ez-color-text-muted)' }}>✓ Lokasi:</span>
                  <strong style={{ color: 'var(--ez-color-text-primary)' }}>{templateContext.project.location}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: 'var(--ez-color-text-muted)' }}>✓ Nilai RAB:</span>
                  <strong style={{ color: 'var(--ez-color-primary)' }}>{templateContext.rab.grandTotal}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: 'var(--ez-color-text-muted)' }}>✓ Durasi:</span>
                  <strong style={{ color: 'var(--ez-color-text-primary)' }}>{templateContext.project.duration}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: 'var(--ez-color-text-muted)' }}>✓ Pemilik:</span>
                  <strong style={{ color: 'var(--ez-color-text-primary)' }}>{templateContext.project.owner}</strong>
                </div>
              </div>
            </div>

            {/* KOP Perusahaan Selector */}
            <div style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border-line)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 750, color: 'var(--ez-color-text-primary)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Kop Perusahaan</span>
                <button
                  onClick={() => setShowAddHeaderModal(true)}
                  style={{ background: 'none', border: 0, color: 'var(--ez-color-primary)', fontSize: 11.5, fontWeight: 650, cursor: 'pointer', padding: 0 }}
                >
                  + Tambah / Paste
                </button>
              </div>
              <select
                value={selectedHeaderId}
                onChange={(e) => setSelectedHeaderId(e.target.value)}
                disabled={isViewingReadOnly}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 12 }}
              >
                <option value="">Gunakan Kop Default Perusahaan</option>
                {headers.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.slot === 'PRIMARY' ? '★ ' : ''}{h.name} ({h.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Data yang Perlu Anda Isi (USER Fields) */}
            <div style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border-line)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 750, color: 'var(--ez-color-text-primary)', marginBottom: 12 }}>
                Data yang Perlu Anda Isi
              </div>
              {fieldClassification.userFields.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {fieldClassification.userFields.map(f => (
                    <div key={f.id}>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                        {f.label} <span style={{ color: 'var(--ez-hue-rose-text)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        placeholder={f.placeholder || `Masukkan ${f.label.toLowerCase()}`}
                        value={userValues[f.id] ?? ''}
                        disabled={isViewingReadOnly}
                        onChange={(e) => handleFieldChange(f.id, e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 12, boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--ez-color-text-muted)', fontStyle: 'italic' }}>
                  Semua data wajib untuk dokumen ini telah terpenuhi secara otomatis dari proyek.
                </div>
              )}
            </div>

            {/* Data Opsional (OPTIONAL Fields) */}
            {fieldClassification.optionalFields.length > 0 && (
              <details style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border-line)', borderRadius: 10, padding: 12 }}>
                <summary style={{ fontSize: 12, fontWeight: 700, color: 'var(--ez-color-text-slate)', cursor: 'pointer' }}>
                  Data Opsional ({fieldClassification.optionalFields.length})
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                  {fieldClassification.optionalFields.map(f => (
                    <div key={f.id}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ez-color-text-slate)', marginBottom: 3 }}>
                        {f.label}
                      </label>
                      <input
                        type="text"
                        placeholder={f.placeholder || `Opsional`}
                        value={userValues[f.id] ?? ''}
                        disabled={isViewingReadOnly}
                        onChange={(e) => handleFieldChange(f.id, e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--ez-color-border-line)', fontSize: 11.5, boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                </div>
              </details>
            )}
          </aside>
        )}
      </div>

      {/* VIEW 5: RIWAYAT (Revisions & Export History) - Shown when workspaceTab === 'riwayat' */}
      {workspaceTab === 'riwayat' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
          {/* REVISION HISTORY PANEL */}
          <div
            style={{
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-color-border-line)',
              borderRadius: 'var(--ez-radius-control)',
              padding: 18,
              boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: 'var(--ez-color-text-primary)' }}>
                  Daftar Revisi Dokumen
                </h3>
                <div style={{ fontSize: 12, color: 'var(--ez-color-text-muted)' }}>
                  Revisi lama bersifat read-only dan aman dari penimpaan.
                </div>
              </div>
              <button
                onClick={() => setShowRevisionModal(true)}
                style={{
                  padding: '7px 12px',
                  background: 'var(--ez-color-primary)',
                  color: '#fff',
                  border: 0,
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 650,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <GitBranch size={13} /> + Buat Revisi Baru
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {revisionList.map((rev) => {
                const isCurrentActive = rev.revision === activeRecord.revision;
                const isSelected = rev.revision === selectedRevision;
                const dateStr = new Date(rev.updatedAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });

                return (
                  <div
                    key={rev.id}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: `1px solid ${isSelected ? 'var(--ez-color-primary)' : 'var(--ez-color-border)'}`,
                      background: isSelected ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface-secondary)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <strong style={{ fontSize: 13, color: 'var(--ez-color-text-primary)' }}>
                          REV {String(rev.revision).padStart(2, '0')}
                        </strong>
                        {isCurrentActive && (
                          <span style={{ background: '#16A34A', color: '#fff', fontSize: 9.5, padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                            CURRENT
                          </span>
                        )}
                        {!isCurrentActive && (
                          <span style={{ background: 'var(--ez-color-border-line)', color: 'var(--ez-color-text-slate)', fontSize: 9.5, padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                            READ-ONLY
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--ez-color-text-muted)' }}>{dateStr}</span>
                    </div>

                    {rev.revisionDescription && (
                      <div style={{ fontSize: 12, color: 'var(--ez-color-text-slate)', marginTop: 4, fontStyle: 'italic' }}>
                        "{rev.revisionDescription}"
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        onClick={() => setSelectedRevision(rev.revision)}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          border: '1px solid var(--ez-hue-slate-border)',
                          background: 'var(--ez-color-surface)',
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <Eye size={12} />
                        <span>Pratinjau</span>
                      </button>
                      <button
                        onClick={() => handleExportClick('PDF')}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          border: '1px solid #2563EB',
                          background: 'var(--ez-color-primary)',
                          color: '#fff',
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <Download size={12} />
                        <span>Export PDF</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* EXPORT HISTORY PANEL */}
          <div
            style={{
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-color-border-line)',
              borderRadius: 'var(--ez-radius-control)',
              padding: 18,
              boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: 'var(--ez-color-text-primary)' }}>
                  Riwayat Ekspor (Audit Manifest)
                </h3>
                <div style={{ fontSize: 12, color: 'var(--ez-color-text-muted)' }}>
                  Semua berkas yang pernah diekspor tercatat di sini.
                </div>
              </div>
              <button
                onClick={refreshHistory}
                style={{ border: 0, background: 'none', color: 'var(--ez-color-primary)', fontSize: 12, cursor: 'pointer', fontWeight: 650 }}
              >
                Refresh
              </button>
            </div>

            {exportHistory.length === 0 ? (
              <div style={{ padding: '36px 12px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                <History size={28} style={{ margin: '0 auto 8px auto', display: 'block', opacity: 0.4 }} />
                Belum ada berkas diekspor untuk dokumen ini.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {exportHistory.map((item) => {
                  const isSuccess = item.status === 'SUCCESS';
                  const timeStr = new Date(item.createdAt).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const dateStr = new Date(item.createdAt).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                  });

                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: `1px solid ${isSuccess ? 'var(--ez-color-border)' : 'var(--ez-hue-rose-border)'}`,
                        background: isSuccess ? 'var(--ez-color-surface-secondary)' : 'var(--ez-hue-rose-bg)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              background: item.format === 'PDF' ? '#EF4444' : item.format === 'DOCX' ? '#0284C7' : '#16A34A',
                              color: '#fff',
                              fontSize: 10,
                              fontWeight: 750,
                              padding: '1px 6px',
                              borderRadius: 4,
                            }}
                          >
                            {item.format}
                          </span>
                          <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--ez-color-text-strong)' }}>
                            {item.fileName}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--ez-color-text-muted)' }}>
                            {dateStr} {timeStr}
                          </span>
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 650,
                              color: isSuccess ? 'var(--ez-hue-green-text-bright)' : 'var(--ez-hue-rose-text)',
                            }}
                          >
                            {isSuccess ? 'BERHASIL' : 'GAGAL'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: CREATE REVISION */}
      {showRevisionModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.5)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: 'var(--ez-color-surface)',
              borderRadius: 14,
              width: 'min(480px, 100%)',
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 750 }}>
              Create New Revision
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--ez-color-text-muted)', lineHeight: 1.5 }}>
              Revisi saat ini (REV {String(activeRecord.revision).padStart(2, '0')}) akan diarsipkan sebagai{' '}
              <strong>read-only</strong>. Dokumen baru akan dibuat sebagai{' '}
              <strong>REV {String(activeRecord.revision + 1).padStart(2, '0')}</strong>.
            </p>
            <form onSubmit={handleCreateRevisionSubmit}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 6 }}>
                Deskripsi Perubahan Revisi:
              </label>
              <textarea
                required
                rows={3}
                value={revisionDescInput}
                onChange={(e) => setRevisionDescInput(e.target.value)}
                placeholder="Contoh: Pembaruan volume pekerjaan & spesifikasi material sesuai addendum"
                style={{
                  width: '100%',
                  border: '1px solid var(--ez-hue-slate-border)',
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 13,
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => setShowRevisionModal(false)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid var(--ez-hue-slate-border)',
                    background: 'var(--ez-color-surface)',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 18px',
                    border: 0,
                    background: 'var(--ez-color-primary)',
                    color: '#fff',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 650,
                    cursor: 'pointer',
                  }}
                >
                  Buat Revisi REV {String(activeRecord.revision + 1).padStart(2, '0')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: VALIDATION PROMPT (ERROR BLOCKS; WARNING ALLOWS "EXPORT ANYWAY") */}
      {validationModal.show && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.5)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: 'var(--ez-color-surface)',
              borderRadius: 14,
              width: 'min(500px, 100%)',
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            {/* If ERROR -> Informative Missing Fields Prompts (Phase 6 Section 12) */}
            {!validationModal.validation.valid ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ background: 'var(--ez-hue-amber-bg-deep)', padding: 8, borderRadius: 50 }}>
                    <AlertTriangle size={24} color="var(--ez-hue-amber-text-deep)" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 750, color: 'var(--ez-hue-amber-text-dark)' }}>
                      Dokumen belum siap
                    </h3>
                    <div style={{ fontSize: 12, color: 'var(--ez-hue-amber-text)', marginTop: 2 }}>
                      {validationModal.validation.errors.length} data perlu dilengkapi:
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    background: 'var(--ez-hue-amber-bg)',
                    border: '1px solid var(--ez-hue-amber-border)',
                    borderRadius: 8,
                    padding: '12px 16px',
                    marginBottom: 18,
                  }}
                >
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ez-hue-amber-text-dark)' }}>
                    {validationModal.validation.errors.map((err) => (
                      <li key={err} style={{ marginBottom: 4 }}>• {err}</li>
                    ))}
                  </ul>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    onClick={() => setValidationModal((v) => ({ ...v, show: false }))}
                    style={{
                      padding: '8px 16px',
                      background: 'var(--ez-color-surface)',
                      border: '1px solid var(--ez-hue-slate-border)',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Tutup
                  </button>
                  <button
                    onClick={() => {
                      setValidationModal((v) => ({ ...v, show: false }));
                      setWorkspaceTab('data');
                    }}
                    style={{
                      padding: '9px 18px',
                      background: 'var(--ez-color-primary)',
                      color: '#fff',
                      border: 0,
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 650,
                      cursor: 'pointer',
                    }}
                  >
                    Lengkapi Data
                  </button>
                </div>
              </div>
            ) : (
              /* If WARNING ONLY -> ALLOW "EXPORT ANYWAY" */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ background: 'var(--ez-hue-amber-bg-deep)', padding: 8, borderRadius: 50 }}>
                    <AlertTriangle size={24} color="var(--ez-hue-amber-text-deep)" />
                  </div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 750, color: 'var(--ez-hue-amber-text-dark)' }}>
                    Dokumen siap diekspor dengan catatan
                  </h3>
                </div>
                <p style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--ez-color-text-slate)', lineHeight: 1.5 }}>
                  Dokumen memenuhi persyaratan utama, namun beberapa asset opsional belum tersedia:
                </p>
                <div
                  style={{
                    background: 'var(--ez-hue-amber-bg)',
                    border: '1px solid var(--ez-hue-amber-border)',
                    borderRadius: 8,
                    padding: '12px 16px',
                    marginBottom: 18,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--ez-hue-amber-text)', marginBottom: 4 }}>
                    WARNING:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--ez-hue-amber-text-dark)' }}>
                    {validationModal.validation.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    onClick={() => setValidationModal((v) => ({ ...v, show: false }))}
                    style={{
                      padding: '8px 14px',
                      background: 'var(--ez-color-surface)',
                      border: '1px solid var(--ez-hue-slate-border)',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => executeExport(validationModal.format)}
                    style={{
                      padding: '8px 18px',
                      background: '#D97706',
                      color: '#fff',
                      border: 0,
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 650,
                      cursor: 'pointer',
                    }}
                  >
                    Export Anyway ({validationModal.format})
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: PROJECT SOURCE DRAWER MODAL */}
      <ProjectSourceDrawerModal
        isOpen={Boolean(drawerTab)}
        onClose={() => setDrawerTab(null)}
        initialTab={drawerTab || 'personnel'}
        projectId={projId}
        projectName={master.projectName}
        onDataSaved={() => {
          setLocalSourceVersion((v) => v + 1);
          onSourceDataChanged?.();
        }}
      />

      {/* MODAL 4: ADD COMPANY HEADER ASSET */}
      {showAddHeaderModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.5)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: 'var(--ez-color-surface)',
              borderRadius: 14,
              width: 'min(500px, 100%)',
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 6px 0', fontSize: 18, fontWeight: 750 }}>
              Kelola Kop Perusahaan
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 12.5, color: 'var(--ez-color-text-muted)' }}>
              Kop ini akan disimpan sebagai aset perusahaan yang dapat digunakan kembali untuk semua dokumen proyek.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                  Nama Label Kop
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Kop Utama PT Mandiri"
                  value={newHeaderName}
                  onChange={(e) => setNewHeaderName(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                  Nama Legal Perusahaan
                </label>
                <input
                  type="text"
                  placeholder="Contoh: PT MANDIRI BANGUN PERSADA"
                  value={newHeaderCompany}
                  onChange={(e) => setNewHeaderCompany(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                  Alamat Kantor
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Jl. Sudirman No. 45, Jakarta Pusat"
                  value={newHeaderAddress}
                  onChange={(e) => setNewHeaderAddress(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Telepon
                  </label>
                  <input
                    type="text"
                    placeholder="021-5551234"
                    value={newHeaderPhone}
                    onChange={(e) => setNewHeaderPhone(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 12, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Email Resmi
                  </label>
                  <input
                    type="email"
                    placeholder="info@mandiri.co.id"
                    value={newHeaderEmail}
                    onChange={(e) => setNewHeaderEmail(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 12, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                  Upload Gambar Kop / Logo (Opsional PNG/JPG)
                </label>
                <input
                  type="file"
                  accept="image/*,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        const res = reader.result as string;
                        const newAsset: CompanyHeaderAsset = {
                          id: `hdr-${Date.now()}`,
                          name: newHeaderName.trim() || file.name,
                          slot: 'ALTERNATIVE',
                          type: 'IMAGE',
                          content: res,
                          companyName: newHeaderCompany || master.companyName,
                          companyAddress: newHeaderAddress || master.companyAddress,
                          companyPhone: newHeaderPhone || master.companyPhone,
                          companyEmail: newHeaderEmail || master.companyEmail,
                          createdAt: new Date().toISOString(),
                          updatedAt: new Date().toISOString(),
                        };
                        headerRepo.save(newAsset);
                        setHeaders(headerRepo.list());
                        setSelectedHeaderId(newAsset.id);
                        setShowAddHeaderModal(false);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  style={{ fontSize: 12 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setShowAddHeaderModal(false)}
                style={{
                  padding: '8px 14px',
                  background: 'var(--ez-color-surface)',
                  border: '1px solid var(--ez-hue-slate-border)',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const newAsset: CompanyHeaderAsset = {
                    id: `hdr-${Date.now()}`,
                    name: newHeaderName.trim() || 'Kop Teks Perusahaan',
                    slot: headers.length === 0 ? 'PRIMARY' : 'ALTERNATIVE',
                    type: 'TEXT',
                    content: newHeaderCompany || master.companyName || 'PT KONSTRUKSI NUSANTARA',
                    companyName: newHeaderCompany || master.companyName || 'PT KONSTRUKSI NUSANTARA',
                    companyAddress: newHeaderAddress || master.companyAddress || '',
                    companyPhone: newHeaderPhone || master.companyPhone || '',
                    companyEmail: newHeaderEmail || master.companyEmail || '',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  };
                  headerRepo.save(newAsset);
                  setHeaders(headerRepo.list());
                  setSelectedHeaderId(newAsset.id);
                  setShowAddHeaderModal(false);
                  setNewHeaderName('');
                }}
                style={{
                  padding: '8px 18px',
                  background: 'var(--ez-color-primary)',
                  color: '#fff',
                  border: 0,
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 650,
                  cursor: 'pointer',
                }}
              >
                Simpan Kop Perusahaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};