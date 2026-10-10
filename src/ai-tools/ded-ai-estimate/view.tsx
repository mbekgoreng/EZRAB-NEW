/**
 * DED-AI Estimate — Orkestrator 3 tampilan: Input → Progress → Hasil.
 * Memakai pipeline aktif src/ai-tools/ded-ai-estimate/* (tidak membuat pipeline baru).
 * Multi-file: service dijalankan per file, hasilnya digabung via DedAiCalculator.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { dedAiEstimateService, DedAiOutputEnvelope } from './service';
import { DedAiCalculator } from './calculator';
import {
  DedAiItem, DedAiMode, DedAiOutput, DedAiProjectType,
} from './types';
import { DedAiInputView, DedAiSession } from './DedAiInputView';
import { DedAiProgressView, DedAiStage, STAGE_DEFS, ProgressSummary } from './DedAiProgressView';
import { DedAiResultView } from './DedAiResultView';
import { fullAiDedService } from '../ded-full-ai/service';
import { FullAiOutput, FullAiItem } from '../ded-full-ai/types';
import { FullAiResultView } from '../ded-full-ai/FullAiResultView';
import { notificationBus } from '../../notifications/notificationBus';
import { useProject } from '../../context/ProjectContext';

interface Props {
  onNavigateToTab?: (tab: string) => void;
}

type Screen = 'input' | 'progress' | 'result';

interface DraftRecord {
  id: string;
  createdAt: number;
  projectName: string;
  projectType: DedAiProjectType;
  mode: DedAiMode;
  fileNames: string[];
  output: DedAiOutput;
}
const DRAFT_KEY = 'ezrab_dedai_drafts_v1';

const loadDrafts = (): DraftRecord[] => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as DraftRecord[]) : [];
  } catch { return []; }
};

const initialStages = (): DedAiStage[] =>
  STAGE_DEFS.map((d) => ({ ...d, status: 'waiting' as const }));

export const DedAiEstimateView: React.FC<Props> = ({ onNavigateToTab }) => {
  const { projects, createProject, bulkAddRabItems, setCurrentProjectId } = useProject();
  const [screen, setScreen] = useState<Screen>('input');
  const [session, setSession] = useState<DedAiSession>({
    files: [], description: '', projectName: '',
    projectType: 'BANGUNAN', mode: 'FAST', targetProjectId: null,
  });
  const [stages, setStages] = useState<DedAiStage[]>(initialStages);
  const [percent, setPercent] = useState(0);
  const [statusLine, setStatusLine] = useState('Mempersiapkan…');
  const [summary, setSummary] = useState<ProgressSummary>({
    projectName: '', fileCount: 0, totalSize: 0, mode: 'FAST', startedAt: Date.now(),
  });
  const [error, setError] = useState<{ message: string; errorCode?: string; stage?: string; retryable?: boolean } | null>(null);
  const [result, setResult] = useState<DedAiOutput | null>(null);
  const [resultReady, setResultReady] = useState(false);
  const [fullAiOutput, setFullAiOutput] = useState<FullAiOutput | null>(null);
  const [drafts, setDrafts] = useState<DraftRecord[]>(loadDrafts);
  const [draftSaved, setDraftSaved] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const cancelRef = useRef(false);

  const persistDrafts = (d: DraftRecord[]) => {
    setDrafts(d);
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* abaikan */ }
  };

  const setStage = (key: string, status: DedAiStage['status']) =>
    setStages((prev) => prev.map((s) => (s.key === key ? { ...s, status } : s)));
  const markUpTo = (key: string, status: DedAiStage['status']) => {
    const order = STAGE_DEFS.map((d) => d.key);
    const idx = order.indexOf(key);
    setStages((prev) => prev.map((s) => {
      const si = order.indexOf(s.key);
      if (si < idx) return s.status === 'waiting' ? { ...s, status: 'done' as const } : s;
      if (si === idx) return { ...s, status };
      return s;
    }));
  };

  /**
   * FULL AI: jalur terisolasi. AI sebagai mesin estimasi utama.
   * Tidak me-recalculate kuantitas AI. Validasi struktur + verifikasi aritmetika saja.
   */
  const runFullAiAnalysis = async (sess: DedAiSession) => {
    try {
      markUpTo('received', 'done');
      setPercent(5);
      setStatusLine('Full AI: Dokumen diterima — memulai pembacaan…');

      // Gabungkan buffer dari semua file (Full AI v1: proses file pertama + catat sisanya)
      // Untuk multi-file, proses per file dan gabungkan items.
      const allItems: FullAiItem[] = [];
      const allWarnings: string[] = [];
      let projectInfo: FullAiOutput['projectInfo'] | null = null;
      let totalPages = 0;
      let totalChars = 0;
      let lastOutput: FullAiOutput | null = null;

      for (let fi = 0; fi < sess.files.length; fi += 1) {
        if (cancelRef.current) return;
        const f = sess.files[fi];
        setSummary((s) => ({ ...s, currentFile: f.file.name }));
        markUpTo('reading', 'active');
        setStatusLine(`Full AI: Membaca ${f.file.name}…`);
        setPercent(5 + (fi / sess.files.length) * 20);

        const buffer = await f.file.arrayBuffer();
        markUpTo('extract', 'done');
        markUpTo('identify', 'active');
        setStatusLine(`Full AI: Menganalisis ${f.file.name}…`);

        const out = await fullAiDedService.execute({
          fileName: f.file.name,
          buffer,
          projectType: sess.projectType,
          mode: sess.mode === 'FAST' ? 'FAST' : 'ADVANCED',
          projectName: sess.projectName,
          onProgress: (stage, pct, msg) => {
            if (cancelRef.current) return;
            setStatusLine(`Full AI: ${msg}`);
            const base = 25 + (fi / sess.files.length) * 70;
            setPercent(base + (pct / 100) * (70 / sess.files.length));
            if (stage === 'ANALYZE') markUpTo('identify', 'active');
            if (stage === 'VALIDATE') { markUpTo('identify', 'done'); markUpTo('validate', 'active'); }
            if (stage === 'FINALIZE') { markUpTo('validate', 'done'); markUpTo('prepare', 'active'); }
          },
        });

        if (!out.success) {
          markUpTo('identify', 'failed');
          setError({
            message: out.error?.message || `Full AI gagal menganalisis ${f.file.name}.`,
            errorCode: out.error?.code,
            retryable: out.error?.retryable,
          });
          setStatusLine('Full AI: Analisis gagal');
          return;
        }

        // Gabungkan items dengan renumbering
        const offset = allItems.length;
        out.items.forEach((it, idx) => {
          allItems.push({ ...it, id: `fullai-f${fi + 1}-${idx + 1}`, no: offset + idx + 1 });
        });
        allWarnings.push(...out.warnings.map((w) => `[${f.file.name}] ${w}`));
        totalPages += out.provenance.documentPages;
        totalChars += out.provenance.documentChars;
        if (!projectInfo) projectInfo = out.projectInfo;
        lastOutput = out;
      }

      // Hitung ulang summary & total gabungan
      const grandTotal = allItems
        .filter((it) => it.subtotal != null && it.subtotal > 0)
        .reduce((sum, it) => sum + (it.subtotal || 0), 0);

      const summary = {
        totalItems: allItems.length,
        itemsWithQuantity: allItems.filter((it) => it.quantity.value != null).length,
        itemsWithAssumption: allItems.filter((it) => it.quantity.provenance === 'ASSUMPTION').length,
        itemsNeedConfirmation: allItems.filter((it) => it.status === 'NEEDS_CONFIRMATION').length,
        itemsWithAiPrice: allItems.filter((it) => it.price.source === 'AI_ESTIMATE').length,
        itemsWithVerifiedPrice: allItems.filter((it) => it.price.source === 'VERIFIED_SOURCE').length,
        itemsUnresolved: allItems.filter((it) => it.status === 'UNRESOLVED').length,
        excludedFromTotal: allItems.filter((it) => it.subtotal == null).length,
      };

      const excluded = summary.excludedFromTotal;
      const combined: FullAiOutput = {
        success: true,
        mode: sess.mode === 'FAST' ? 'FAST' : 'ADVANCED',
        projectInfo: projectInfo || { projectType: sess.projectType, scopeSummary: '' },
        items: allItems,
        grandTotal,
        grandTotalNote: excluded > 0
          ? `Total Rp${grandTotal.toLocaleString('id-ID')} mengecualikan ${excluded} item yang belum lengkap.`
          : undefined,
        summary,
        warnings: allWarnings,
        provenance: {
          model: lastOutput?.provenance.model || '',
          timestamp: new Date().toISOString(),
          documentPages: totalPages,
          documentChars: totalChars,
        },
      };

      markUpTo('prepare', 'done');
      setPercent(100);
      setStatusLine('Full AI: Analisis selesai');
      setFullAiOutput(combined);
      setResultReady(true);
      notificationBus.publish({
        type: 'success',
        title: 'Full AI selesai',
        message: `${allItems.length} pekerjaan dari ${sess.files.length} dokumen (${sess.mode === 'FAST' ? 'Cepat' : 'Mendalam'}).`,
        link: 'ded-ai',
      });
      setTimeout(() => { if (!cancelRef.current) setScreen('result'); }, 900);
    } catch (e: any) {
      markUpTo('reading', 'failed');
      setError({ message: e?.message || 'Full AI: Kesalahan tidak terduga.', retryable: true });
      setStatusLine('Full AI: Analisis gagal');
    }
  };

  const runAnalysis = useCallback(async (sess: DedAiSession) => {
    cancelRef.current = false;
    setError(null);
    setResult(null);
    setFullAiOutput(null);
    setResultReady(false);
    setDraftSaved(false);
    setFinalized(false);
    setStages(initialStages());
    setPercent(2);
    const startedAt = Date.now();
    const totalSize = sess.files.reduce((a, f) => a + f.file.size, 0);
    setSummary({
      projectName: sess.projectName, fileCount: sess.files.length,
      totalSize, mode: sess.mode, startedAt, currentFile: sess.files[0]?.file.name,
    });
    setScreen('progress');

    // FULL AI: jalur terisolasi — AI sebagai mesin estimasi utama
    if (sess.fullAi) {
      await runFullAiAnalysis(sess);
      return;
    }

    // Tahap 1: dokumen diterima (validasi sudah di input)
    markUpTo('received', 'done');
    setPercent(5);
    setStatusLine('Dokumen diterima — memulai pembacaan…');

    const mergedItems: DedAiItem[] = [];
    let totalPages = 0;
    const fileNames: string[] = [];

    try {
      for (let fi = 0; fi < sess.files.length; fi += 1) {
        if (cancelRef.current) return;
        const f = sess.files[fi];
        fileNames.push(f.file.name);
        setSummary((s) => ({ ...s, currentFile: f.file.name }));

        // Tahap 2-3: baca dokumen
        markUpTo('reading', 'active');
        setStatusLine(`Membaca dokumen ${fi + 1}/${sess.files.length}: ${f.file.name}`);
        const buffer = await f.file.arrayBuffer();

        const res: DedAiOutputEnvelope = await dedAiEstimateService.execute({
          fileName: f.file.name,
          buffer,
          mimeType: f.file.type,
          projectType: sess.projectType,
          mode: sess.mode,
          projectName: sess.projectName,
          onProgress: (e) => {
            if (cancelRef.current) return;
            // Petakan progress service (10/30/50) ke 6 tahap, dibagi per file.
            const base = (fi / sess.files.length) * 100;
            const span = 100 / sess.files.length;
            if (e.stage === 'PARSE') {
              markUpTo('reading', 'active');
              setStatusLine(e.message);
              setPercent(base + span * 0.1);
            } else if (e.stage === 'PICK_MODE') {
              markUpTo('reading', 'done');
              markUpTo('extract', 'done');
              markUpTo('identify', 'active');
              setStatusLine(e.message);
              setPercent(base + span * 0.3);
            } else if (e.stage === 'ANALYZE') {
              setStatusLine(`AI menganalisis ${f.file.name}… (ini tahap terlama, mohon tunggu)`);
              setPercent(base + span * 0.55);
            }
          },
        });

        if (!res || !res.success) {
          const fail = res as unknown as { errorCode?: string; stage?: string; message?: string; retryable?: boolean };
          markUpTo('identify', 'failed');
          setError({
            message: fail?.message || `Gagal menganalisis ${f.file.name}.`,
            errorCode: fail?.errorCode, stage: fail?.stage, retryable: fail?.retryable,
          });
          setStatusLine('Analisis gagal');
          return;
        }

        const out = res as unknown as DedAiOutput;
        // Tahap 5: validasi (convertAiItem + calculator sudah jalan di service; tandai)
        markUpTo('identify', 'done');
        markUpTo('validate', 'active');
        setStatusLine(`Memvalidasi ${out.items.length} item dari ${f.file.name}…`);
        setPercent((fi / sess.files.length) * 100 + (100 / sess.files.length) * 0.85);

        const pageOffset = totalPages;
        out.items.forEach((it, idx) => {
          mergedItems.push({
            ...it,
            id: `dedai-f${fi + 1}-${idx + 1}`,
            sourcePages: it.sourcePages.map((p) => p + pageOffset),
          });
        });
        totalPages += out.pageCount;
        markUpTo('validate', 'done');
      }

      // Tahap 6: siapkan estimasi gabungan
      markUpTo('prepare', 'active');
      setStatusLine('Menyiapkan estimasi akhir…');
      const merged = DedAiCalculator.buildOutput({
        jobId: `dedai-${Date.now()}`,
        projectType: sess.projectType,
        mode: sess.mode,
        projectName: sess.projectName,
        fileName: fileNames.join(', '),
        pageCount: totalPages,
        items: mergedItems,
      });
      markUpTo('prepare', 'done');
      setPercent(100);
      setStatusLine('Analisis selesai');
      setResult(merged);
      setResultReady(true);
      notificationBus.publish({
        type: 'success',
        title: 'Analisis DED selesai',
        message: `${merged.items.length} pekerjaan terdeteksi dari ${fileNames.length} dokumen (${sess.mode === 'FAST' ? 'Cepat' : 'Mendalam'}).`,
        link: 'ded-ai',
      });
      // Otomatis ke hasil setelah jeda singkat
      setTimeout(() => { if (!cancelRef.current) setScreen('result'); }, 900);
    } catch (e: any) {
      markUpTo('reading', 'failed');
      setError({ message: e?.message || 'Kesalahan tidak terduga saat analisis.', retryable: true });
      setStatusLine('Analisis gagal');
    }
  }, []);

  const handleStart = (sess: DedAiSession) => {
    setSession(sess);
    runAnalysis(sess);
  };

  const handleRetry = () => runAnalysis(session);
  const handleBack = () => { cancelRef.current = true; setScreen('input'); };
  const handleSeeResult = () => { if (result) setScreen('result'); };

  const handleSaveDraft = (items: DedAiItem[]) => {
    if (!result) return;
    const rec: DraftRecord = {
      id: `draft-${Date.now()}`,
      createdAt: Date.now(),
      projectName: result.projectName,
      projectType: result.projectType as DedAiProjectType,
      mode: result.mode,
      fileNames: session.files.map((f) => f.file.name),
      output: { ...result, items },
    };
    persistDrafts([rec, ...drafts].slice(0, 20));
    setDraftSaved(true);
  };

  const handleLoadDraft = (id: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    setResult(d.output);
    setResultReady(true);
    setDraftSaved(true);
    setFinalized(false);
    setSession((s) => ({ ...s, projectName: d.projectName, projectType: d.projectType, mode: d.mode, files: [] }));
    setSummary((s) => ({ ...s, projectName: d.projectName, fileCount: d.fileNames.length, mode: d.mode }));
    setScreen('result');
  };

  const handleDeleteDraft = (id: string) => persistDrafts(drafts.filter((d) => d.id !== id));

  const handleFinalize = async (items: DedAiItem[]): Promise<{ ok: boolean; message: string }> => {
    // FASE DED-FIX TASK 3: hanya item yang lolos validasi kuantitas (stage CALCULATED,
    // subtotal terhitung) yang boleh masuk RAB. Item REJECTED/UNRESOLVED tidak lolos
    // jalur finalisasi apa pun — tidak disamarkan menjadi angka.
    const savable = items.filter((it) => it.stage === 'CALCULATED' && it.subtotal != null && it.unitPrice != null);
    const blocked = items.length - savable.length;
    const needsReview = savable.filter((it) => it.quantitySource === 'AI_INFERENCE' || it.quantitySource === 'ASSUMPTION').length;
    if (savable.length === 0) {
      return { ok: false, message: 'Tidak ada item yang bisa disimpan (semua diblokir / tanpa harga).' };
    }
    try {
      let projectId = session.targetProjectId;
      let projectName = result?.projectName || 'Proyek DED AI';
      if (!projectId) {
        const created = createProject({
          name: projectName,
          buildingType: 'Rumah Tinggal',
          status: 'draft',
          creationMethod: 'ai-ded',
          description: session.description || `Hasil analisis DED-AI (${savable.length} item)`,
        } as any);
        projectId = created.id;
        projectName = created.name;
      } else {
        const existing = projects.find((p) => p.id === projectId);
        if (existing) projectName = existing.name;
      }
      const added = bulkAddRabItems(
        savable.map((it) => ({
          description: it.name,
          volume: it.quantity as number,
          unit: it.units,
          unitPrice: it.unitPrice as number,
          category: it.category,
          notes: `DED-AI · ${it.quantitySource}${it.quantityFormula ? ` · ${it.quantityFormula}` : ''}`,
        })),
        projectId
      );
      setCurrentProjectId(projectId);
      setFinalized(true);
      notificationBus.publish({
        type: 'success',
        title: 'Estimasi tersimpan ke proyek',
        message: `${added.length} item RAB tersimpan ke "${projectName}".`,
        link: 'rab-estimasi',
      });
      return { ok: true, message: `${added.length} item berhasil disimpan ke proyek "${projectName}".${blocked > 0 ? ` ${blocked} item ditahan (perlu tinjau/ditolak) dan tidak masuk RAB.` : ''}${needsReview > 0 ? ` ${needsReview} item dari inferensi AI — periksa badge "Perlu Ditinjau" di spreadsheet.` : ''} Buka Spreadsheet RAB untuk melihatnya.` };
    } catch (e: any) {
      return { ok: false, message: e?.message || 'Gagal menyimpan ke proyek.' };
    }
  };

  const handleOpenSpreadsheet = () => {
    if (onNavigateToTab) onNavigateToTab('rab-estimasi');
  };

  /**
   * FULL AI finalize: hanya item READY dengan subtotal valid yang masuk RAB.
   * Item UNRESOLVED/NEEDS_CONFIRMATION tidak disamarkan menjadi angka.
   */
  const handleFullAiFinalize = async (items: FullAiItem[]): Promise<{ ok: boolean; message: string }> => {
    const savable = items.filter(
      (it) => it.status === 'READY' && it.subtotal != null && it.subtotal > 0 && it.price.unitPrice != null
    );
    const blocked = items.length - savable.length;
    if (savable.length === 0) {
      return { ok: false, message: 'Tidak ada item yang bisa disimpan (semua belum lengkap / tanpa harga).' };
    }
    try {
      let projectId = session.targetProjectId;
      let projectName = session.projectName || 'Proyek Full AI DED';
      if (!projectId) {
        const created = createProject({
          name: projectName,
          buildingType: 'Rumah Tinggal',
          status: 'draft',
          creationMethod: 'ai-ded-full',
          description: session.description || `Hasil Full AI DED (${savable.length} item)`,
        } as any);
        projectId = created.id;
        projectName = created.name;
      } else {
        const existing = projects.find((p) => p.id === projectId);
        if (existing) projectName = existing.name;
      }
      const added = bulkAddRabItems(
        savable.map((it) => ({
          description: it.name,
          volume: it.quantity.value as number,
          unit: it.quantity.unit,
          unitPrice: it.price.unitPrice as number,
          category: it.category,
          notes: `FullAI · ${it.quantity.provenance}${it.quantity.formula ? ` · ${it.quantity.formula}` : ''} · Harga: ${it.price.source}`,
        })),
        projectId
      );
      setCurrentProjectId(projectId);
      setFinalized(true);
      notificationBus.publish({
        type: 'success',
        title: 'Full AI tersimpan ke proyek',
        message: `${added.length} item RAB tersimpan ke "${projectName}".`,
        link: 'rab-estimasi',
      });
      return {
        ok: true,
        message: `${added.length} item berhasil disimpan ke proyek "${projectName}".` +
          (blocked > 0 ? ` ${blocked} item ditahan dan tidak masuk RAB.` : '') +
          ' Buka Spreadsheet RAB untuk melihatnya.',
      };
    } catch (e: any) {
      return { ok: false, message: e?.message || 'Gagal menyimpan ke proyek.' };
    }
  };

  // Bersihkan flag cancel saat unmount
  useEffect(() => () => { cancelRef.current = true; }, []);

  if (screen === 'progress') {
    return (
      <DedAiProgressView
        stages={stages}
        percent={percent}
        statusLine={statusLine}
        summary={summary}
        error={error}
        onRetry={handleRetry}
        onBack={handleBack}
        onSeeResult={handleSeeResult}
        resultReady={resultReady}
      />
    );
  }

  if (screen === 'result' && fullAiOutput) {
    return (
      <FullAiResultView
        output={fullAiOutput}
        onFinalize={handleFullAiFinalize}
        onBack={() => setScreen('input')}
      />
    );
  }

  if (screen === 'result' && result) {
    return (
      <DedAiResultView
        output={result}
        onBackToInput={() => setScreen('input')}
        onSaveDraft={handleSaveDraft}
        onFinalize={handleFinalize}
        onOpenSpreadsheet={handleOpenSpreadsheet}
        draftSaved={draftSaved}
        finalized={finalized}
      />
    );
  }

  return (
    <DedAiInputView
      initialSession={session}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      drafts={drafts.map((d) => ({
        id: d.id, createdAt: d.createdAt, projectName: d.projectName,
        itemCount: d.output.items.length, grandTotal: d.output.grandTotal,
      }))}
      onStart={handleStart}
      onLoadDraft={handleLoadDraft}
      onDeleteDraft={handleDeleteDraft}
    />
  );
};

export default DedAiEstimateView;
