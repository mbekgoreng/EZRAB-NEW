/**
 * EZRAB DED → RAB WORKFLOW VIEW (V2 PRODUCTION ENGINE)
 *
 * Master wizard orchestrator connecting:
 * - Step 1: Proyek Tujuan (Pilih Proyek Aktif / Buat Proyek Baru)
 * - Step 2: Upload Gambar Kerja / DED (Dropzone PDF & Sample DED)
 * - Step 3: Siap Dianalisis (Mode ⚡ Cepat / 🔎 Mendalam + Loading Progress)
 * - Step 4: Hasil Pembacaan DED (DedRabV2ReviewView)
 *
 * Adheres strictly to:
 * - Clean non-technical wizard UX for non-technical users
 * - Preserves core dedRabPipeline, activePid isolation, and QTO independence
 * - Production handler handleStartAnalysis -> dedRabPipeline.execute(...)
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  UploadCloud,
  FileText,
  AlertTriangle,
  Sparkles,
  Building2,
  Check,
  Calculator,
  ShieldCheck,
  Zap,
  ArrowRight,
  FolderPlus,
  FileSpreadsheet,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Layers,
  Search,
  X,
  Bot,
  MapPin,
} from 'lucide-react';
import { Project, RABSection, RabItem, ProjectDocument } from '../../types';
import { useProject } from '../../context/ProjectContext';
import { dedRabPipeline, PipelineExecutionOutput } from '../../ded-rab-v2/pipeline/dedRabPipeline';
import { DedProcessingMode, PipelineProgressEvent, PipelineStage } from '../../ded-rab-v2/types';
import { ExecutionMode, ProjectLocation } from '../../ded-rab-v2/resolution/providerContracts';
import { DedRabV2ReviewView } from '../../ded-rab-v2/review/DedRabV2ReviewView';
import { DedAiSplitAnalysisView } from './DedAiSplitAnalysisView';
import { dedAnalysisPersistenceService } from '../../services/dedAnalysisPersistenceService';
import { dedRabReviewService } from '../../ded-rab-v2/review/dedRabReviewService';
import { dedSpreadsheetSync } from '../../ded-rab-v2/spreadsheet/dedSpreadsheetSync';
import { honestVolume } from '../../engine/honestVolume';

export function deriveProjectNameFromFileName(fileName?: string): string {
  if (!fileName) return 'Proyek Konstruksi Baru';
  let clean = fileName.replace(/\.[^/.]+$/, '');
  clean = clean.replace(/^(PRJ[-_]|DED[-_]|GAMBAR[-_]|RAB[-_])+/i, '');
  clean = clean.replace(/[-_](DED|RAB|FINAL|REV\d*|v\d*|COMPRESS)+$/i, '');
  clean = clean.replace(/[-_]+/g, ' ').trim();

  if (/rumah.*2.*lt/i.test(clean) || /rumah.*2.*lantai/i.test(clean)) {
    return 'Rumah Tinggal 2 Lantai';
  }
  if (/rumah.*1.*lt/i.test(clean) || /rumah.*1.*lantai/i.test(clean)) {
    return 'Rumah Tinggal 1 Lantai';
  }

  const words = clean.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join(' ') || 'Proyek DED Baru';
}

export interface DedRabWorkflowViewProps {
  currentProject: Project | null;
  projects?: Project[];
  onSelectProject?: (projectId: string) => void;
  onNavigateToTab?: (tab: string) => void;
  onBackToDashboard?: () => void;
  onCommitSuccess?: (sections: RABSection[], grandTotal: number, targetProjectId?: string) => void;
  initialStep?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  magicMode?: 'chat' | 'ded-rab';
  onSwitchMode?: (mode: 'chat' | 'ded-rab') => void;
  embedded?: boolean;
}

const WIZARD_STEPS = [
  { id: 1, label: 'Proyek', shortDesc: 'Pilih proyek tujuan' },
  { id: 2, label: 'Upload DED', shortDesc: 'Gambar kerja / cetak biru' },
  { id: 3, label: 'Analisis', shortDesc: 'Pencocokan AI & AHSP' },
  { id: 4, label: 'Hasil', shortDesc: 'Tinjau & masukkan ke RAB' },
];

const AUTONOMOUS_AI_LOADING_STEPS = [
  'Membaca gambar kerja',
  'Menemukan pekerjaan',
  'Memahami spesifikasi',
  'Menghitung volume',
  'Mencari AHSP',
  'Mencari material',
  'Menentukan harga',
  'Melakukan pengecekan akhir',
];

function calculateFriendlyProgress(stage: PipelineStage | string, event?: PipelineProgressEvent): { progress: number; message: string; activeStepIndex: number } {
  switch (stage) {
    case 'QUEUED':
    case 'INGESTING':
      return { progress: 8, message: 'Menyiapkan dokumen gambar kerja...', activeStepIndex: 0 };
    case 'RENDERING':
      return { progress: 18, message: `Membaca ${event?.renderedPages || 1} lembar gambar kerja...`, activeStepIndex: 0 };
    case 'ANALYZING':
    case 'EXTRACTING_EVIDENCE': {
      const current = event?.pagesAnalyzed || event?.currentPage || 1;
      const total = event?.totalPages || 1;
      const pct = Math.round(20 + (current / Math.max(total, 1)) * 15);
      return { progress: Math.min(35, pct), message: `Menemukan pekerjaan dari gambar (${current}/${total})...`, activeStepIndex: 1 };
    }
    case 'BUILDING_ITEMS':
    case 'SEMANTIC_CLASSIFICATION':
      return { progress: 45, message: `Memahami spesifikasi teknis (${event?.dedItemCount || 0} pekerjaan)...`, activeStepIndex: 2 };
    case 'CALCULATING_QTO':
    case 'QUANTITY_RESOLUTION_STARTED':
    case 'QUANTITY_RESOLUTION_COMPLETED':
      return { progress: 60, message: 'Menghitung volume & dimensi geometris...', activeStepIndex: 3 };
    case 'MATCHING_AHSP':
    case 'AHSP_RESOLUTION_STARTED':
    case 'AHSP_RESOLUTION_COMPLETED':
      return { progress: 72, message: 'Mencari analisa harga satuan (AHSP)...', activeStepIndex: 4 };
    case 'MATERIAL_RESOLUTION_STARTED':
    case 'MATERIAL_RESOLUTION_COMPLETED':
      return { progress: 80, message: 'Mencari spesifikasi material & upah kerja...', activeStepIndex: 5 };
    case 'RESOLVING_PRICES':
    case 'PRICE_STARTED':
    case 'PRICE_COMPLETED':
    case 'PRICE_RESOLUTION_STARTED':
    case 'PRICE_RESOLUTION_COMPLETED':
      return { progress: 90, message: 'Menentukan harga satuan regional & referensi pasar...', activeStepIndex: 6 };
    case 'VALIDATING_GATES':
    case 'SELF_CHECK_STARTED':
    case 'SELF_CHECK_COMPLETED':
    case 'READY_FOR_REVIEW':
    case 'COMPLETED':
      return { progress: 100, message: 'Melakukan pengecekan akhir & menyusun draft RAB...', activeStepIndex: 7 };
    default:
      return { progress: 25, message: (event as any)?.message || 'EZRAB sedang menyusun RAB...', activeStepIndex: 1 };
  }
}

export const DedRabWorkflowView: React.FC<DedRabWorkflowViewProps> = ({
  currentProject,
  projects,
  onSelectProject,
  onNavigateToTab,
  onBackToDashboard,
  onCommitSuccess,
  embedded,
}) => {
  const {
    currentProjectId,
    currentProject: activeProjectFromContext,
    projects: contextProjects = [],
    createProject,
    updateProject,
    setCurrentProjectId,
    allRabItems = [],
    replaceProjectRabItems,
    createEstimateVersion,
    bulkAddRabItems,
    createRabItemDirect,
  } = useProject();

  const allAvailableProjects = projects && projects.length > 0 ? projects : contextProjects;
  const resolvedCurrentProject = currentProject || activeProjectFromContext || null;

  // Target Project Mode: 'ACTIVE' | 'NEW'
  const [targetProjectMode, setTargetProjectMode] = useState<'ACTIVE' | 'NEW'>(() => {
    return resolvedCurrentProject ? 'ACTIVE' : 'NEW';
  });
  const [hasExplicitlyChosenMode, setHasExplicitlyChosenMode] = useState<boolean>(false);
  const [customProjectName, setCustomProjectName] = useState<string>('');
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState<boolean>(false);
  const [projectCreatedSuccess, setProjectCreatedSuccess] = useState<boolean>(false);
  // Results view mode: 'split' (new) | 'detail' (legacy)
  const [resultsViewMode, setResultsViewMode] = useState<'split' | 'detail'>('split');

  // Selector mode toggle: when user clicks "Ganti Proyek" or "＋ Buat Proyek Baru"
  const [isSelectingProject, setIsSelectingProject] = useState<boolean>(() => !resolvedCurrentProject);

  // Active Target Project computation
  const activeTargetProject = createdProjectId
    ? allAvailableProjects.find((p) => p.id === createdProjectId) || (resolvedCurrentProject?.id === createdProjectId ? resolvedCurrentProject : ({ id: createdProjectId, name: customProjectName || 'Proyek Baru' } as Project))
    : resolvedCurrentProject;
  const effectiveProjectId = activeTargetProject?.id || 'PRJ-RUMAH-2LT-01';
  const effectiveProjectName = activeTargetProject?.name || 'PRJ-RUMAH-2LT-01';

  // Upload & Configuration State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isLoadingSample, setIsLoadingSample] = useState<boolean>(false);
  const [processingMode, setProcessingMode] = useState<DedProcessingMode>('FAST');

  // Autonomous AI Estimation State (Master Architecture)
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('AI_RAB');
  const [projectProvince, setProjectProvince] = useState<string>('Jawa Timur');
  const [projectCity, setProjectCity] = useState<string>('Pasuruan');
  const [projectDistrict, setProjectDistrict] = useState<string>('');
  const [projectYear, setProjectYear] = useState<number>(2026);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Execution State
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [pipelineProgress, setPipelineProgress] = useState<{
    stage: PipelineStage;
    progress: number;
    message: string;
    activeStepIndex: number;
  } | null>(null);
  const [executionOutput, setExecutionOutput] = useState<PipelineExecutionOutput | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState<boolean>(true);

  // Sync target project mode only if user hasn't explicitly chosen a mode and not yet created a project
  useEffect(() => {
    if (!hasExplicitlyChosenMode && !createdProjectId) {
      if (resolvedCurrentProject) {
        setTargetProjectMode('ACTIVE');
        setIsSelectingProject(false);
      } else {
        setTargetProjectMode('NEW');
        setIsSelectingProject(true);
      }
    }
  }, [resolvedCurrentProject?.id, hasExplicitlyChosenMode, createdProjectId]);

  // Derive project name whenever file is selected
  useEffect(() => {
    if (selectedFile && !customProjectName) {
      const derived = deriveProjectNameFromFileName(selectedFile.name);
      setCustomProjectName(derived);
    }
  }, [selectedFile, customProjectName]);

  // Existing RAB items count for active project (for safety guard)
  const existingItemsCount = effectiveProjectId
    ? allRabItems.filter((i) => i.projectId === effectiveProjectId).length
    : 0;

  // Handler to explicitly create the new project and mark it active & ready for DED analysis
  const handleCreateNewProject = () => {
    const derivedName = selectedFile ? deriveProjectNameFromFileName(selectedFile.name) : 'Proyek DED Baru';
    const finalName = customProjectName.trim() || derivedName || 'Proyek Konstruksi Baru';
    setIsCreatingProject(true);
    try {
      const newProj = createProject({
        name: finalName,
        buildingType: 'Rumah Tinggal',
        creationMethod: 'magic_ai',
        notes: `Dibuat melalui EZRAB DED → RAB Wizard`,
      });
      const activePid = newProj.id;
      setCreatedProjectId(activePid);
      setCustomProjectName(newProj.name);
      setTargetProjectMode('ACTIVE');
      setHasExplicitlyChosenMode(true);
      setIsSelectingProject(false);
      setProjectCreatedSuccess(true);
      if (setCurrentProjectId) {
        setCurrentProjectId(activePid);
      }
      if (onSelectProject) {
        onSelectProject(activePid);
      }
    } finally {
      setIsCreatingProject(false);
    }
  };

  // Handler to pick an existing project
  const handleSelectExistingProject = (pid: string) => {
    setCreatedProjectId(null);
    setTargetProjectMode('ACTIVE');
    setHasExplicitlyChosenMode(true);
    setIsSelectingProject(false);
    setProjectCreatedSuccess(false);
    if (setCurrentProjectId) {
      setCurrentProjectId(pid);
    }
    if (onSelectProject) {
      onSelectProject(pid);
    }
  };

  // Handler to immediately create a new project and navigate directly to its spreadsheet
  const handleCreateAndOpenSpreadsheet = () => {
    const derivedName = selectedFile ? deriveProjectNameFromFileName(selectedFile.name) : 'Proyek DED Baru';
    const finalName = customProjectName.trim() || derivedName || 'Proyek Konstruksi Baru';
    const newProj = createProject({
      name: finalName,
      buildingType: 'Rumah Tinggal',
      creationMethod: 'magic_ai',
      notes: `Dibuat melalui DED Workflow Target Selector`,
    });
    if (setCurrentProjectId) {
      setCurrentProjectId(newProj.id);
    }
    if (onSelectProject) {
      onSelectProject(newProj.id);
    }
    if (onNavigateToTab) {
      onNavigateToTab('rab-estimasi');
    }
  };

  // Synchronize completed analysis items with Project Context for Spreadsheet RAB
  const syncOutputToProjectRab = useCallback((output: PipelineExecutionOutput, projectId: string) => {
    if (!output.workItems || output.workItems.length === 0) return;
    try {
      const officialItems = dedRabReviewService.convertToOfficialRabItems(output.workItems, projectId);
      if (replaceProjectRabItems) {
        replaceProjectRabItems(officialItems, projectId);
      } else if (bulkAddRabItems) {
        bulkAddRabItems(officialItems, projectId);
      }
    } catch (err) {
      console.warn('[DedRabWorkflowView] Synchronize to Project RAB warning:', err);
    }
  }, [replaceProjectRabItems, bulkAddRabItems]);

  // HYDRATE PERSISTED SESSION ON MOUNT & ON PROJECT CHANGE
  useEffect(() => {
    let isCancelled = false;

    const hydrateAnalysis = async () => {
      setIsHydrating(true);
      try {
        const persisted = await dedAnalysisPersistenceService.getLatestAnalysis(effectiveProjectId);
        if (isCancelled) return;

        if (persisted) {
          if (persisted.status === 'COMPLETED' && persisted.execution_output) {
            setExecutionOutput(persisted.execution_output);
            setIsExecuting(false);
            setPipelineProgress(null);
            setExecutionError(null);
            syncOutputToProjectRab(persisted.execution_output, effectiveProjectId);
          } else if (persisted.status === 'ANALYZING') {
            const inMemory = await dedRabPipeline.getPersistedActiveResult(effectiveProjectId);
            if (inMemory && inMemory.success && inMemory.workItems?.length > 0) {
              setExecutionOutput(inMemory);
              setIsExecuting(false);
            } else {
              setPipelineProgress({
                stage: (persisted.current_stage as PipelineStage) || 'ANALYZING',
                progress: persisted.progress || 50,
                message: persisted.stage_message || 'Melanjutkan proses analisis DED...',
                activeStepIndex: 1,
              });
            }
          } else if (persisted.status === 'FAILED' || persisted.status === 'PERSISTENCE_FAILED') {
            setExecutionError(persisted.stage_message || persisted.error || 'Analisis sebelumnya belum selesai.');
            setExecutionOutput(null);
            setIsExecuting(false);
          } else {
            setExecutionOutput(null);
            setIsExecuting(false);
            setPipelineProgress(null);
          }
        } else {
          setExecutionOutput(null);
          setIsExecuting(false);
          setPipelineProgress(null);
        }
      } catch (err: any) {
        console.warn('[DedRabWorkflowView] Session hydration warning:', err);
      } finally {
        if (!isCancelled) {
          setIsHydrating(false);
        }
      }
    };

    hydrateAnalysis();

    return () => {
      isCancelled = true;
    };
  }, [effectiveProjectId, syncOutputToProjectRab]);

  // Start fresh analysis without losing historical records
  const handleClearActiveAnalysis = () => {
    dedAnalysisPersistenceService.clearActiveAnalysis(effectiveProjectId);
    setExecutionOutput(null);
    setSelectedFile(null);
    setFileBuffer(null);
    setExecutionError(null);
    setPipelineProgress(null);
    setIsExecuting(false);
  };

  // Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  const loadFile = (file: File) => {
    setSelectedFile(file);
    setExecutionError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        setFileBuffer(reader.result);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // 1-Click Load Real Sample DED
  const handleLoadSampleDED = async () => {
    setIsLoadingSample(true);
    setExecutionError(null);
    try {
      const response = await fetch('/samples/pdf-gambar-rumah-1-lantai_compress.pdf');
      if (!response.ok) {
        throw new Error('File contoh DED tidak ditemukan di direktori /samples.');
      }
      const blob = await response.blob();
      const sampleFile = new File([blob], 'PRJ-RUMAH-2LT-01_DED.pdf', {
        type: 'application/pdf',
      });
      setSelectedFile(sampleFile);
      const buffer = await blob.arrayBuffer();
      setFileBuffer(buffer);
    } catch (err: any) {
      console.warn('Gagal memuat sample otomatis, membuka file picker:', err);
      fileInputRef.current?.click();
    } finally {
      setIsLoadingSample(false);
    }
  };

  // Launch DED -> RAB V2 Master Pipeline
  const handleStartAnalysis = async () => {
    if (!selectedFile || !fileBuffer) return;

    setIsExecuting(true);
    setExecutionError(null);
    setExecutionOutput(null);
    setPipelineProgress({
      stage: 'INGESTING',
      progress: 5,
      message: 'Mempersiapkan dokumen DED & target proyek...',
      activeStepIndex: 0,
    });

    try {
      // 1. Resolve Target Project
      let targetProjectId = '';
      let targetProjectName = '';

      if (createdProjectId) {
        targetProjectId = createdProjectId;
        const targetObj = allAvailableProjects.find((p) => p.id === createdProjectId) || resolvedCurrentProject;
        targetProjectName = targetObj?.name || customProjectName || 'Proyek Baru';
      } else if (targetProjectMode === 'NEW' || !resolvedCurrentProject) {
        const derivedName = deriveProjectNameFromFileName(selectedFile.name);
        const finalName = customProjectName.trim() || derivedName || 'Proyek DED Baru';
        const newProj = createProject({
          name: finalName,
          buildingType: 'Rumah Tinggal',
          creationMethod: 'magic_ai',
          notes: `Dibuat melalui EZRAB DED → RAB dari file: ${selectedFile.name}`,
        });
        targetProjectId = newProj.id;
        targetProjectName = newProj.name;
        setCreatedProjectId(newProj.id);
        setCustomProjectName(newProj.name);
        setTargetProjectMode('ACTIVE');
        setHasExplicitlyChosenMode(true);
        if (setCurrentProjectId) {
          setCurrentProjectId(targetProjectId);
        }
        if (onSelectProject) {
          onSelectProject(targetProjectId);
        }
      } else {
        targetProjectId = resolvedCurrentProject.id;
        targetProjectName = resolvedCurrentProject.name;
      }

      // 2. Existing RAB Protection Snapshot
      const existingItemsForTarget = allRabItems.filter((i) => i.projectId === targetProjectId);
      if (existingItemsForTarget.length > 0 && createEstimateVersion) {
        createEstimateVersion(
          'Versi Sebelum Analisis DED AI',
          `Snapshot otomatis sebelum pembaruan DED RAB dari ${selectedFile.name}`,
          'Dibuat otomatis oleh EZRAB Safety Guard untuk mencegah kehilangan data RAB eksisting.',
          targetProjectId
        );
      }

      // 3. Execute Master Pipeline with Autonomous AI Mode & Regional Context
      const output = await dedRabPipeline.execute({
        projectId: targetProjectId,
        projectName: targetProjectName,
        mode: processingMode,
        executionMode,
        location: {
          province: projectProvince,
          city: projectCity,
          district: projectDistrict || undefined,
          year: projectYear,
        },
        files: [
          {
            fileName: selectedFile.name,
            buffer: fileBuffer,
            mimeType: selectedFile.type || 'application/pdf',
          },
        ],
        onProgress: (prog: PipelineProgressEvent) => {
          const friendly = calculateFriendlyProgress(prog.stage, prog);
          setPipelineProgress({
            stage: prog.stage,
            progress: friendly.progress,
            message: friendly.message,
            activeStepIndex: friendly.activeStepIndex,
          });
        },
      });

      if (!output.success || !output.workItems || output.workItems.length === 0) {
        throw new Error(output.error || 'Eksekusi analisis DED → RAB tidak menghasilkan pekerjaan yang valid.');
      }

      // 4. Attach ProjectDocument to Target Project
      if (updateProject) {
        const targetProjObj = allAvailableProjects.find((p) => p.id === targetProjectId) || resolvedCurrentProject;
        const existingDocs = targetProjObj?.documents || [];
        const newDoc: ProjectDocument = {
          id: `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          projectId: targetProjectId,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileType: selectedFile.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'PNG',
          category: 'Struktur',
          uploadedAt: new Date().toISOString(),
          uploadedBy: 'Lead Estimator (EZRAB AI)',
          pageCount: output.sourceDocuments?.[0]?.pageCount || 1,
          analysisStatus: 'COMPLETED',
        };
        updateProject(targetProjectId, {
          documents: [...existingDocs.filter((d) => d.fileName !== selectedFile.name), newDoc],
        });
      }

      // 7. Verify Persistence in Durable Store
      const verified = await dedAnalysisPersistenceService.getLatestAnalysis(targetProjectId);
      if (!verified || verified.status !== 'COMPLETED') {
        throw new Error('Gagal memverifikasi persistensi proyek DED → RAB. Data belum tersimpan dengan aman.');
      }

      // 8. Set Execution Output (Completed!)
      setExecutionOutput(output);
    } catch (err: any) {
      console.error('[DedRabWorkflowView] Pipeline execution error:', err);
      setExecutionError(err.message || 'Terjadi kendala saat membaca DED.');
    } finally {
      setIsExecuting(false);
    }
  };

  // Handle Commit to Official Project RAB
  const handleCommitOfficialRab = (officialItems: RabItem[]) => {
    let grandTotal = 0;
    const sectionMap = new Map<string, RabItem[]>();
    const activePid = executionOutput?.projectId || effectiveProjectId;

    const itemsToSave = officialItems.map((item) => ({
      ...item,
      projectId: activePid,
      verificationStatus: 'NEEDS_VERIFICATION' as const,
      volumeSource: 'AI_GENERATED' as const,
    }));

    if (replaceProjectRabItems) {
      replaceProjectRabItems(itemsToSave, activePid);
    } else if (bulkAddRabItems) {
      bulkAddRabItems(itemsToSave, activePid);
    } else {
      itemsToSave.forEach((item) => createRabItemDirect(item));
    }

    itemsToSave.forEach((item) => {
      grandTotal += item.totalPrice || item.amount || 0;
      const secName = item.sectionName || item.category || 'Pekerjaan Utama';
      const existing = sectionMap.get(secName) || [];
      existing.push(item);
      sectionMap.set(secName, existing);
    });

    const sections: RABSection[] = Array.from(sectionMap.entries()).map(([name, items], idx) => {
      const letterCode = String.fromCharCode(65 + (idx % 26));
      const sectionId = `sec-${idx + 1}`;
      return {
        id: sectionId,
        code: letterCode,
        name,
        items: items.map((it, itemIdx) => ({
          id: it.id || `rab-item-${idx + 1}-${itemIdx + 1}`,
          sectionId,
          itemNumber: `${idx + 1}.${itemIdx + 1}`,
          code: it.code || it.ahspCode || `ITM-${idx + 1}.${itemIdx + 1}`,
          description: it.description || '',
          specification: it.notes || it.description || '',
          // Fase 4A: jangan fabrikasi volume 1 untuk data kosong/tidak valid.
          volume: honestVolume(it.volume),
          unit: it.unit || 'm2',
          materialPrice: it.materialPrice || 0,
          laborPrice: it.laborPrice || 0,
          equipmentPrice: it.equipmentPrice || 0,
          unitPrice: it.unitPrice || 0,
          totalPrice: it.totalPrice || 0,
          verificationStatus: 'NEEDS_VERIFICATION',
          ahspCode: it.ahspCode,
        })),
        subtotal: items.reduce((sum, it) => sum + (it.totalPrice || 0), 0),
      };
    });

    if (createEstimateVersion) {
      createEstimateVersion(
        `Hasil ACC Analisis DED AI (${executionOutput?.executionMode === 'AI_RAB' ? 'AI Estimator' : 'EZRAB Standard'})`,
        `RAB resmi disetujui dari dokumen DED: ${selectedFile?.name || 'Dokumen DED'}`,
        `Commit ${itemsToSave.length} pekerjaan konstruksi dengan grand total Rp ${grandTotal.toLocaleString('id-ID')}.`,
        activePid
      );
    }

    if (updateProject) {
      updateProject(activePid, {
        sections,
      });
    }

    // Explicitly sync 9-sheet spreadsheet workspace on user ACC
    if (executionOutput?.workItems) {
      dedSpreadsheetSync.syncToSheets({
        projectId: activePid,
        projectName: resolvedCurrentProject?.name || customProjectName || 'Proyek DED Baru',
        sourceDocuments: executionOutput.sourceDocuments || [],
        workItems: executionOutput.workItems,
        evidences: executionOutput.evidences || [],
      }).catch((sErr) => {
        console.warn('[DedRabWorkflowView] Sheet sync warning upon ACC:', sErr);
      });
    }

    if (setCurrentProjectId) {
      setCurrentProjectId(activePid);
    }
    if (onSelectProject) {
      onSelectProject(activePid);
    }

    if (onCommitSuccess) {
      onCommitSuccess(sections, grandTotal, activePid);
    } else if (onNavigateToTab) {
      onNavigateToTab('rab-estimasi');
    }
  };

  // Determine active step index (1..4)
  const currentStep = useMemo<number>(() => {
    if (executionOutput && executionOutput.workItems) return 4;
    if (isExecuting) return 3;
    if (selectedFile && fileBuffer && (activeTargetProject || targetProjectMode === 'ACTIVE')) return 3;
    if (activeTargetProject || (targetProjectMode === 'ACTIVE' && !isSelectingProject)) return 2;
    return 1;
  }, [executionOutput, isExecuting, selectedFile, fileBuffer, activeTargetProject, targetProjectMode, isSelectingProject]);

  // Stepper Header Component
  const renderHorizontalStepper = () => (
    <div style={{ marginBottom: '28px' }}>
      {/* Desktop & Tablet Stepper */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '14px 24px',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
        }}
        className="hidden sm:flex"
      >
        {WIZARD_STEPS.map((st, idx) => {
          const isCurrent = currentStep === st.id;
          const isPassed = currentStep > st.id;
          return (
            <React.Fragment key={st.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  opacity: isCurrent || isPassed ? 1 : 0.5,
                  cursor: isPassed ? 'pointer' : 'default',
                }}
                onClick={() => {
                  if (isPassed && st.id === 1) setIsSelectingProject(true);
                  if (isPassed && st.id === 2 && executionOutput) handleClearActiveAnalysis();
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '13px',
                    fontWeight: 800,
                    background: isPassed
                      ? '#10B981'
                      : isCurrent
                      ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)'
                      : '#F1F5F9',
                    color: isPassed || isCurrent ? '#ffffff' : '#64748B',
                    border: isCurrent ? '2px solid #BFDBFE' : '1px solid transparent',
                    boxShadow: isCurrent ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isPassed ? <Check size={16} /> : st.id}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: isCurrent ? 800 : 600,
                      color: isCurrent ? '#1D4ED8' : isPassed ? '#0F172A' : '#64748B',
                    }}
                  >
                    {st.label}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>{st.shortDesc}</div>
                </div>
              </div>

              {idx < WIZARD_STEPS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: '2px',
                    background: isPassed ? '#10B981' : '#E2E8F0',
                    margin: '0 16px',
                    borderRadius: '1px',
                    transition: 'background 0.3s ease',
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Mobile Stepper View */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '12px 16px',
        }}
        className="sm:hidden"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB' }}>
            Langkah {currentStep} dari 4
          </span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>
            {WIZARD_STEPS[currentStep - 1]?.label}
          </span>
        </div>
        <div style={{ width: '100%', height: '6px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${(currentStep / 4) * 100}%`,
              height: '100%',
              background: '#2563EB',
              borderRadius: '3px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>
    </div>
  );

  // IF OUTPUT AVAILABLE: Render Step 4 (Hasil Pembacaan DED)
  if (executionOutput && executionOutput.workItems) {
    const activePid = executionOutput.projectId || effectiveProjectId;
    const targetProjObj = allAvailableProjects.find((p) => p.id === activePid) || resolvedCurrentProject;
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: '24px 20px' }}>
        <div style={{ maxWidth: '1020px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '20px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
              DED → RAB
            </h1>
            <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
              Ubah gambar kerja menjadi draft RAB dengan bantuan AI.
            </p>
          </div>

          {/* Stepper */}
          {renderHorizontalStepper()}

          {/* View toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={() => setResultsViewMode('split')}
              style={{
                padding: '9px 18px', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 13,
                cursor: 'pointer', background: resultsViewMode === 'split' ? 'linear-gradient(135deg,#1D4ED8,#2563EB)' : '#F1F5F9',
                color: resultsViewMode === 'split' ? '#fff' : '#64748B',
              }}
            >
              🖼️ Split View
            </button>
            <button
              onClick={() => setResultsViewMode('detail')}
              style={{
                padding: '9px 18px', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 13,
                cursor: 'pointer', background: resultsViewMode === 'detail' ? 'linear-gradient(135deg,#1D4ED8,#2563EB)' : '#F1F5F9',
                color: resultsViewMode === 'detail' ? '#fff' : '#64748B',
              }}
            >
              📋 Detail
            </button>
          </div>

          {/* Review View */}
          {resultsViewMode === 'split' ? (
            <DedAiSplitAnalysisView
              projectName={targetProjObj?.name || effectiveProjectName}
              sourceDocuments={executionOutput.sourceDocuments}
              workItems={executionOutput.workItems}
              evidences={executionOutput.evidences}
              grandTotal={executionOutput.grandTotal}
              onCommitOfficialRab={() => handleCommitOfficialRab([])}
              onRetry={() => handleStartAnalysis()}
            />
          ) : (
          <DedRabV2ReviewView
            projectId={activePid}
            projectName={targetProjObj?.name || effectiveProjectName}
            sourceDocuments={executionOutput.sourceDocuments}
            workItems={executionOutput.workItems}
            evidences={executionOutput.evidences}
            reviewSummary={executionOutput.reviewSummary}
            diagnostics={executionOutput.diagnostics}
            executionMode={executionOutput.executionMode || executionMode}
            location={executionOutput.location || { province: projectProvince, city: projectCity, district: projectDistrict, year: projectYear }}
            validationComparison={executionOutput.validationComparison}
            selfCheckReport={executionOutput.selfCheckReport}
            grandTotal={executionOutput.grandTotal}
            provenanceSummary={executionOutput.provenanceSummary}
            confidenceSummary={executionOutput.confidenceSummary}
            onCommitOfficialRab={handleCommitOfficialRab}
            onRetry={() => handleStartAnalysis()}
            onBackToUpload={handleClearActiveAnalysis}
          />
          )}
        </div>
      </div>
    );
  }

  // WIZARD VIEW: Steps 1 to 3
  return (
    <div
      style={{
        minHeight: 'calc(100vh - 64px)',
        background: '#F8FAFC',
        padding: '32px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: '820px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
            DED → RAB
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
            Ubah gambar kerja menjadi draft RAB dengan bantuan AI.
          </p>
        </div>

        {/* Stepper */}
        {renderHorizontalStepper()}

        {/* Error Alert */}
        {executionError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '16px 20px',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '14px',
              color: '#991B1B',
              fontSize: '13px',
              marginBottom: '24px',
              flexWrap: 'wrap',
              boxShadow: '0 2px 6px rgba(220, 38, 38, 0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AlertTriangle size={20} color="#DC2626" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: '14px', color: '#991B1B' }}>Analisis belum selesai</div>
                <div style={{ fontSize: '12px', color: '#7F1D1D', marginTop: '2px' }}>
                  EZRAB mengalami kendala saat membaca DED. Data proyek Anda tetap aman.
                </div>
              </div>
            </div>
            {selectedFile && (
              <button
                type="button"
                disabled={isExecuting}
                onClick={handleStartAnalysis}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  background: '#DC2626',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: isExecuting ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)',
                }}
              >
                <RotateCcw size={14} />
                <span>{isExecuting ? 'Menganalisis...' : '↻ Coba Lagi'}</span>
              </button>
            )}
          </div>
        )}

        {/* =====================================================================
            STEP 1 — PROYEK
           ===================================================================== */}
        <div
          style={{
            background: '#ffffff',
            border: `1.5px solid ${currentStep === 1 ? '#2563EB' : '#E2E8F0'}`,
            borderRadius: '16px',
            padding: '22px 24px',
            marginBottom: '20px',
            boxShadow: currentStep === 1 ? '0 4px 16px rgba(37, 99, 235, 0.06)' : '0 1px 3px rgba(0,0,0,0.02)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: activeTargetProject ? '#10B981' : '#2563EB',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 800,
                  }}
                >
                  {activeTargetProject ? '✓' : '1'}
                </span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                  Proyek Tujuan
                </span>
              </div>
              <p style={{ fontSize: '12.5px', color: '#64748B', margin: '4px 0 0 30px' }}>
                Pilih proyek tempat hasil analisis DED akan disimpan.
              </p>
            </div>

            {/* When already selected and not in selection mode */}
            {activeTargetProject && !isSelectingProject && (
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectingProject(true);
                    setTargetProjectMode('ACTIVE');
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    color: '#334155',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Ganti Proyek
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectingProject(true);
                    setTargetProjectMode('NEW');
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    color: '#1D4ED8',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  ＋ Buat Proyek Baru
                </button>
              </div>
            )}
          </div>

          {/* Project Details Card when Selected */}
          {activeTargetProject && !isSelectingProject ? (
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                    color: '#ffffff',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Building2 size={20} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                      {activeTargetProject.name}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: '#ECFDF5',
                        color: '#059669',
                        border: '1px solid #A7F3D0',
                      }}
                    >
                      <CheckCircle2 size={12} /> Dipilih
                    </span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                    Project ID: <strong>{effectiveProjectId}</strong>
                  </div>
                </div>
              </div>

              {projectCreatedSuccess && (
                <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={14} />
                  Semua hasil analisis berikutnya akan disimpan ke proyek ini.
                </div>
              )}
            </div>
          ) : (
            /* Project Selection / Creation Interface */
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {/* Mode Switcher Tabs */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
                {resolvedCurrentProject && (
                  <button
                    type="button"
                    onClick={() => {
                      setTargetProjectMode('ACTIVE');
                      setHasExplicitlyChosenMode(true);
                    }}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      border: '1px solid',
                      cursor: 'pointer',
                      background: targetProjectMode === 'ACTIVE' ? '#2563EB' : '#ffffff',
                      borderColor: targetProjectMode === 'ACTIVE' ? '#2563EB' : '#CBD5E1',
                      color: targetProjectMode === 'ACTIVE' ? '#ffffff' : '#475569',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Gunakan Proyek yang Ada
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTargetProjectMode('NEW');
                    setHasExplicitlyChosenMode(true);
                  }}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    border: '1px solid',
                    cursor: 'pointer',
                    background: targetProjectMode === 'NEW' ? '#2563EB' : '#ffffff',
                    borderColor: targetProjectMode === 'NEW' ? '#2563EB' : '#CBD5E1',
                    color: targetProjectMode === 'NEW' ? '#ffffff' : '#475569',
                    transition: 'all 0.15s ease',
                  }}
                >
                  ＋ Buat Proyek Baru
                </button>
              </div>

              {targetProjectMode === 'ACTIVE' && allAvailableProjects.length > 0 ? (
                /* Select Existing Project */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                    Pilih Proyek:
                  </label>
                  <select
                    value={effectiveProjectId}
                    onChange={(e) => handleSelectExistingProject(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#0F172A',
                      background: '#ffffff',
                      outline: 'none',
                    }}
                  >
                    {allAvailableProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                  </select>
                  {resolvedCurrentProject && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setIsSelectingProject(false)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: '#ffffff',
                          border: '1px solid #CBD5E1',
                          color: '#475569',
                          cursor: 'pointer',
                        }}
                      >
                        Gunakan Proyek Ini
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Create New Project Form */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                    Nama Proyek Baru:
                  </label>
                  <input
                    type="text"
                    value={customProjectName}
                    onChange={(e) => setCustomProjectName(e.target.value)}
                    placeholder="Contoh: Rumah Tinggal 2 Lantai"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#0F172A',
                      outline: 'none',
                      background: '#ffffff',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginTop: '4px' }}>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                      Klik tombol di kanan untuk membuat proyek dan menyimpannya.
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        disabled={isCreatingProject}
                        onClick={handleCreateNewProject}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 700,
                          border: 'none',
                          cursor: isCreatingProject ? 'not-allowed' : 'pointer',
                          boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <FolderPlus size={15} />
                        <span>{isCreatingProject ? 'Membuat proyek...' : '＋ Buat Proyek'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateAndOpenSpreadsheet}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          background: '#ffffff',
                          color: '#334155',
                          fontSize: '12px',
                          fontWeight: 700,
                          border: '1px solid #CBD5E1',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        title="Buat proyek baru sekarang dan langsung buka lembar kerja Spreadsheet RAB"
                      >
                        <FileSpreadsheet size={15} color="#059669" />
                        <span>Buka Spreadsheet</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* =====================================================================
            STEP 2 — UPLOAD DED
           ===================================================================== */}
        <div
          style={{
            background: '#ffffff',
            border: `1.5px solid ${currentStep === 2 ? '#2563EB' : '#E2E8F0'}`,
            borderRadius: '16px',
            padding: '22px 24px',
            marginBottom: '20px',
            boxShadow: currentStep === 2 ? '0 4px 16px rgba(37, 99, 235, 0.06)' : '0 1px 3px rgba(0,0,0,0.02)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: selectedFile ? '#10B981' : currentStep === 2 ? '#2563EB' : '#94A3B8',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 800,
                }}
              >
                {selectedFile ? '✓' : '2'}
              </span>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                Upload Gambar Kerja / DED
              </span>
            </div>
            <p style={{ fontSize: '12.5px', color: '#64748B', margin: '4px 0 0 30px' }}>
              Upload PDF gambar kerja yang ingin dianalisis EZRAB.
            </p>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
          />

          {!selectedFile ? (
            /* Large Dropzone */
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: isDragging ? '#EFF6FF' : '#F8FAFC',
                border: `2px dashed ${isDragging ? '#2563EB' : '#CBD5E1'}`,
                borderRadius: '14px',
                padding: '36px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '14px',
                  background: '#EFF6FF',
                  color: '#2563EB',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 12px',
                }}
              >
                <UploadCloud size={28} />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                Upload DED
              </div>
              <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                Tarik file PDF ke sini atau pilih file dari komputer
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                style={{
                  marginTop: '16px',
                  padding: '9px 20px',
                  borderRadius: '8px',
                  background: '#2563EB',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                }}
              >
                Pilih File
              </button>
            </div>
          ) : (
            /* File Selected Info Card */
            <div
              style={{
                background: '#F0FDF4',
                border: '1.5px solid #BBF7D0',
                borderRadius: '14px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: '#10B981',
                    color: '#ffffff',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <FileText size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                    ✓ {selectedFile.name}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#047857', marginTop: '2px' }}>
                    Ukuran: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • File DED siap dianalisis
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  background: '#ffffff',
                  border: '1px solid #CBD5E1',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ＋ Tambah DED / Ganti File
              </button>
            </div>
          )}

          {/* Sample Helper Button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginTop: '14px' }}>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              Ingin mencoba cepat tanpa unggah file sendiri?
            </span>
            <button
              type="button"
              onClick={handleLoadSampleDED}
              disabled={isLoadingSample}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 700,
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                color: '#1D4ED8',
                cursor: 'pointer',
              }}
            >
              <Zap size={13} />
              {isLoadingSample ? 'Memuat...' : 'Coba File Contoh (Rumah 1 Lantai)'}
            </button>
          </div>

          <div
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              background: '#F8FAFC',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              fontSize: '11.5px',
              color: '#64748B',
              lineHeight: 1.5,
            }}
          >
            EZRAB akan membaca gambar, teks, dimensi, spesifikasi, dan pekerjaan yang terlihat pada DED.
          </div>
        </div>

        {/* =====================================================================
            STEP 3 — ANALISIS (PRIMARY CTA & PROGRESS)
           ===================================================================== */}
        <div
          style={{
            background: '#ffffff',
            border: `1.5px solid ${currentStep === 3 ? '#2563EB' : '#E2E8F0'}`,
            borderRadius: '16px',
            padding: '24px',
            boxShadow: currentStep === 3 ? '0 8px 24px rgba(37, 99, 235, 0.08)' : '0 1px 3px rgba(0,0,0,0.02)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: currentStep >= 3 ? '#2563EB' : '#94A3B8',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 800,
                }}
              >
                3
              </span>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                Siap dianalisis
              </span>
            </div>
            <p style={{ fontSize: '12.5px', color: '#64748B', margin: '4px 0 0 30px' }}>
              EZRAB akan membaca DED dan mencocokkan pekerjaan dengan AHSP yang tersedia.
            </p>
          </div>

          {/* =====================================================================
              STEP 3 — PILIH CARA MENGERJAKAN (MASTER PROMPT SPEC)
             ===================================================================== */}
          <div style={{ marginBottom: '22px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '10px' }}>
              Pilih Cara Mengerjakan:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
              {/* MODE A: AI RAB (RECOMMENDED) */}
              <div
                onClick={() => setExecutionMode('AI_RAB')}
                style={{
                  position: 'relative',
                  padding: '18px 20px',
                  borderRadius: '14px',
                  border: `2px solid ${executionMode === 'AI_RAB' ? '#2563EB' : '#E2E8F0'}`,
                  background: executionMode === 'AI_RAB' ? '#EFF6FF' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: executionMode === 'AI_RAB' ? '0 4px 14px rgba(37, 99, 235, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ position: 'absolute', top: '-10px', right: '14px', background: '#2563EB', color: '#FFFFFF', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.04em' }}>
                  RECOMMENDED
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '18px' }}>🤖</span>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: executionMode === 'AI_RAB' ? '#1D4ED8' : '#0F172A' }}>
                    AI RAB
                  </span>
                </div>
                <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                  Biarkan EZRAB AI mengerjakan DED sampai menjadi draft RAB tanpa membebani Anda dengan validasi teknis.
                </div>
                <div style={{ marginTop: '10px', fontSize: '11px', color: '#2563EB', fontWeight: 600 }}>
                  ✓ AI membaca DED • Volume otonom • AHSP & harga pasar • Second-pass self check
                </div>
              </div>

              {/* MODE B: EZRAB STANDARD */}
              <div
                onClick={() => setExecutionMode('EZRAB_STANDARD')}
                style={{
                  padding: '18px 20px',
                  borderRadius: '14px',
                  border: `2px solid ${executionMode === 'EZRAB_STANDARD' ? '#0F172A' : '#E2E8F0'}`,
                  background: executionMode === 'EZRAB_STANDARD' ? '#F8FAFC' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: executionMode === 'EZRAB_STANDARD' ? '0 4px 14px rgba(15, 23, 42, 0.08)' : '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '18px' }}>🏗️</span>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: executionMode === 'EZRAB_STANDARD' ? '#0F172A' : '#334155' }}>
                    EZRAB Standard
                  </span>
                </div>
                <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                  Gunakan database dan engine EZRAB untuk hasil yang lebih terkontrol dengan prinsip source-of-truth ketat.
                </div>
                <div style={{ marginTop: '10px', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                  ✓ Validasi deterministik • Master database • Unresolved jika data kosong
                </div>
              </div>
            </div>
          </div>

          {/* LOKASI PROYEK & TAHUN ESTIMASI */}
          <div
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '16px 20px',
              marginBottom: '22px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <MapPin size={16} color="#2563EB" />
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                Lokasi Proyek & Tahun Estimasi
              </span>
              <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                (digunakan untuk penyesuaian harga regional & upah kerja)
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Provinsi
                </label>
                <select
                  value={projectProvince}
                  onChange={(e) => setProjectProvince(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '12.5px',
                    color: '#0F172A',
                    fontWeight: 600,
                  }}
                >
                  <option value="Jawa Timur">Jawa Timur</option>
                  <option value="DKI Jakarta">DKI Jakarta</option>
                  <option value="Jawa Barat">Jawa Barat</option>
                  <option value="Jawa Tengah">Jawa Tengah</option>
                  <option value="DI Yogyakarta">DI Yogyakarta</option>
                  <option value="Banten">Banten</option>
                  <option value="Bali">Bali</option>
                  <option value="Sumatera Utara">Sumatera Utara</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Kabupaten / Kota
                </label>
                <input
                  type="text"
                  value={projectCity}
                  onChange={(e) => setProjectCity(e.target.value)}
                  placeholder="Misal: Pasuruan, Surabaya"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '12.5px',
                    color: '#0F172A',
                    fontWeight: 600,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Kecamatan (opsional)
                </label>
                <input
                  type="text"
                  value={projectDistrict}
                  onChange={(e) => setProjectDistrict(e.target.value)}
                  placeholder="Opsional"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '12.5px',
                    color: '#0F172A',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Tahun Estimasi
                </label>
                <input
                  type="number"
                  value={projectYear}
                  onChange={(e) => setProjectYear(parseInt(e.target.value, 10) || 2026)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '12.5px',
                    color: '#0F172A',
                    fontWeight: 700,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Sub-mode speed setting */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', padding: '0 4px' }}>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              Kecepatan Ekstraksi AI:
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setProcessingMode('FAST')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  background: processingMode === 'FAST' ? '#EFF6FF' : '#F1F5F9',
                  border: `1px solid ${processingMode === 'FAST' ? '#BFDBFE' : '#CBD5E1'}`,
                  color: processingMode === 'FAST' ? '#1D4ED8' : '#475569',
                  cursor: 'pointer',
                }}
              >
                ⚡ Cepat (Gemini Flash Lite)
              </button>
              <button
                type="button"
                onClick={() => setProcessingMode('DETAIL')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  background: processingMode === 'DETAIL' ? '#EFF6FF' : '#F1F5F9',
                  border: `1px solid ${processingMode === 'DETAIL' ? '#BFDBFE' : '#CBD5E1'}`,
                  color: processingMode === 'DETAIL' ? '#1D4ED8' : '#475569',
                  cursor: 'pointer',
                }}
              >
                🔎 Mendalam (Gemini Flash 3.8)
              </button>
            </div>
          </div>

          {/* LOADING STATE WHEN EXECUTING */}
          {isExecuting ? (
            <div
              style={{
                background: '#F8FAFC',
                border: '1.5px solid #DBEAFE',
                borderRadius: '16px',
                padding: '26px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                boxShadow: '0 4px 16px rgba(37, 99, 235, 0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                    color: '#ffffff',
                    display: 'grid',
                    placeItems: 'center',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  <Sparkles size={22} className="animate-spin" />
                </div>
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>
                    🤖 EZRAB sedang mengerjakan RAB Anda
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
                    {pipelineProgress?.message || 'Menjalankan Autonomous AI Construction Estimator...'}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${pipelineProgress?.progress || 10}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #2563EB, #3B82F6)',
                    borderRadius: '4px',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              {/* 8-Stage Real Checklist Progress Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                {AUTONOMOUS_AI_LOADING_STEPS.map((stepLabel, idx) => {
                  const activeIdx = pipelineProgress?.activeStepIndex ?? 0;
                  const isDone = activeIdx > idx;
                  const isCurrent = activeIdx === idx;
                  return (
                    <div
                      key={stepLabel}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: '13px',
                        fontWeight: isCurrent ? 750 : isDone ? 600 : 500,
                        color: isDone ? '#059669' : isCurrent ? '#1D4ED8' : '#94A3B8',
                      }}
                    >
                      <span
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '11px',
                          fontWeight: 800,
                          background: isDone ? '#ECFDF5' : isCurrent ? '#EFF6FF' : '#F1F5F9',
                          border: `1.5px solid ${isDone ? '#A7F3D0' : isCurrent ? '#BFDBFE' : '#E2E8F0'}`,
                          color: isDone ? '#059669' : isCurrent ? '#2563EB' : '#94A3B8',
                        }}
                      >
                        {isDone ? '✓' : isCurrent ? '●' : '○'}
                      </span>
                      <span>{stepLabel}</span>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={true}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '10px',
                  background: '#94A3B8',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 750,
                  border: 'none',
                  cursor: 'not-allowed',
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <span>⏳ AI sedang menyelesaikan estimasi...</span>
              </button>
            </div>
          ) : (
            /* Primary CTA Button */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center' }}>
              {!selectedFile ? (
                <div style={{ fontSize: '12.5px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <AlertCircle size={15} color="#D97706" />
                  <span>Upload DED pada Langkah 2 di atas untuk memulai analisis.</span>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                  Target: <strong>{effectiveProjectName}</strong> • Lokasi: <strong>{projectCity}, {projectProvince} ({projectYear})</strong>
                </div>
              )}

              <button
                type="button"
                disabled={!selectedFile || isExecuting}
                onClick={handleStartAnalysis}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  padding: '16px 36px',
                  width: '100%',
                  maxWidth: '440px',
                  borderRadius: '12px',
                  background: !selectedFile
                    ? '#E2E8F0'
                    : executionMode === 'AI_RAB'
                      ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)'
                      : 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                  color: !selectedFile ? '#94A3B8' : '#ffffff',
                  fontSize: '15px',
                  fontWeight: 800,
                  border: 'none',
                  cursor: !selectedFile ? 'not-allowed' : 'pointer',
                  boxShadow: !selectedFile
                    ? 'none'
                    : executionMode === 'AI_RAB'
                      ? '0 8px 20px rgba(37, 99, 235, 0.35)'
                      : '0 8px 20px rgba(15, 23, 42, 0.35)',
                  transition: 'all 0.2s ease',
                }}
              >
                <span>{executionMode === 'AI_RAB' ? '🚀 Buat RAB dengan AI' : '🏗️ Buat RAB dengan EZRAB'}</span>
                <ArrowRight size={18} />
              </button>

              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>
                {executionMode === 'AI_RAB'
                  ? 'EZRAB AI akan menyelesaikan estimasi sampai menjadi draft RAB sebelum meminta Anda mereview.'
                  : 'Hasil akan diverifikasi ketat terhadap database resmi EZRAB.'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DedRabWorkflowView;
