import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { DesignWizardFlow } from './DesignWizardFlow';
import type { RabWizardData } from './RabWizard';
import { useProject } from '../context/ProjectContext';
import { navigateTo, routeForMenu } from '../routing/routes';
import { consumePendingAiEntry } from '../ai-tools/aiNavigation';

/**
 * Chat-to-RAB Workspace (Fase 3) — halaman penuh, BUKAN overlay.
 *
 * Menampung alur yang sudah ada tanpa engine baru:
 *   DesignWizardFlow (Wizard kebutuhan → AiDesignStudio)
 *   AiDesignStudio   (Spesifikasi → Spreadsheet/QTO → Review & AHSP)
 *
 * Stepper mencerminkan posisi nyata pengguna (fase wizard / tab studio),
 * bukan navigasi palsu: Kebutuhan → Desain → Validasi → QTO → AHSP & Harga
 * → Review. Validasi terjadi di tab Spesifikasi; AHSP & Harga di tab Review.
 *
 * Draft sesi (prompt + data wizard) disimpan di sessionStorage per proyek
 * agar kembali dari chat tidak menghapus pekerjaan tanpa pemberitahuan.
 * Desain final tetap disimpan eksplisit via designStorage di dalam studio.
 */

const STEPS = ['Kebutuhan', 'Desain', 'Validasi', 'QTO', 'AHSP & Harga', 'Review'] as const;

type Phase = 'wizard' | 'design';
type StudioTab = 'spec' | 'spreadsheet' | 'review';

const draftKey = (projectId: string | null) => `ezrab.desainRab.draft.${projectId ?? 'global'}`;

interface SessionDraft {
  prompt: string;
  wizardData?: RabWizardData;
}

function readDraft(projectId: string | null): SessionDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(projectId));
    return raw ? (JSON.parse(raw) as SessionDraft) : null;
  } catch {
    return null;
  }
}

export const ChatToRabWorkspace: React.FC = () => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id ?? null;

  // Konteks dari chat (sekali pakai): prompt hasil ringkasan kebutuhan.
  const [entry] = useState(() => consumePendingAiEntry('design_workspace'));
  const [restoredDraft] = useState<SessionDraft | null>(() => readDraft(projectId));

  const initialPrompt = entry?.initialPrompt || restoredDraft?.prompt || undefined;
  const [promptUsed] = useState(initialPrompt ?? '');
  const [wizardData, setWizardData] = useState<RabWizardData | undefined>(
    restoredDraft?.wizardData,
  );
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>(initialPrompt ? 'design' : 'wizard');
  const [studioTab, setStudioTab] = useState<StudioTab>('spec');

  // Pertahankan draft sesi setiap prompt/data wizard berubah.
  useEffect(() => {
    if (!promptUsed && !wizardData) return;
    try {
      sessionStorage.setItem(
        draftKey(projectId),
        JSON.stringify({ prompt: promptUsed, wizardData } satisfies SessionDraft),
      );
      setDraftSavedAt(new Date().toLocaleTimeString('id-ID'));
    } catch {
      /* sessionStorage tidak tersedia — draft hanya hidup selama halaman terbuka */
    }
  }, [promptUsed, wizardData, projectId]);

  const currentStep = useMemo(() => {
    if (phase === 'wizard') return 0;
    if (studioTab === 'spec') return 2;        // Desain selesai, Validasi aktif
    if (studioTab === 'spreadsheet') return 3; // QTO
    return 5;                                   // Review (AHSP & Harga ada di tab yang sama, tepat di atasnya)
  }, [phase, studioTab]);

  const handlePhase = useCallback((p: Phase) => setPhase(p), []);
  const handleTab = useCallback((t: StudioTab) => setStudioTab(t), []);
  const handleWizardData = useCallback((d: RabWizardData) => setWizardData(d), []);

  const backToChat = useCallback(() => {
    navigateTo(routeForMenu('ezrab-ai', projectId));
  }, [projectId]);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 16px 40px' }}>
      {/* Header workspace */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <button
          onClick={backToChat}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10,
            border: '1px solid var(--ez-color-border)', background: 'var(--ez-color-surface)',
            color: 'var(--ez-color-text-secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          <ArrowLeft size={15} /> Kembali ke Chat
        </button>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
            Workspace Desain &amp; RAB
          </h1>
          <div style={{ fontSize: 13, color: 'var(--ez-color-text-secondary)', marginTop: 2 }}>
            {currentProject ? `Proyek: ${currentProject.name}` : 'Tanpa proyek aktif — kirim ke RAB memerlukan proyek'}
            {' · '}Jenis pekerjaan: bangunan (rumah/gedung)
          </div>
        </div>
        <span style={{
          padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
          background: 'var(--ez-ai-surface)', color: 'var(--ez-ai-text)', border: '1px solid var(--ez-ai-border)',
        }}>
          Status: Draft
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ez-color-text-muted)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <MessageSquare size={13} />
        Konteks dari Ezrab Chat AI{entry?.initialPrompt ? ' diterima dari ringkasan kebutuhan' : ''}.
        {draftSavedAt ? ` Draft sesi tersimpan ${draftSavedAt} — aman kembali ke chat dan membuka lagi.` : ' Draft sesi akan tersimpan otomatis.'}
        {' '}Harga item tetap null sampai ditentukan via AHSP/manual di tahap Review.
      </div>

      {/* Stepper tahap */}
      <nav aria-label="Tahap Desain & RAB" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {STEPS.map((label, i) => {
          const state = i < currentStep ? 'done' : i === currentStep ? 'current' : 'todo';
          return (
            <div
              key={label}
              aria-current={state === 'current' ? 'step' : undefined}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 13px', borderRadius: 999,
                border: `1px solid ${state === 'current' ? 'var(--ez-color-primary)' : 'var(--ez-color-border)'}`,
                background: state === 'current' ? 'var(--ez-color-primary-soft)' : state === 'done' ? 'var(--ez-color-surface-faint)' : 'var(--ez-color-surface)',
                color: state === 'todo' ? 'var(--ez-color-text-muted)' : 'var(--ez-color-text-primary)',
                fontSize: 12.5, fontWeight: state === 'current' ? 750 : 600,
              }}
            >
              <span style={{
                width: 20, height: 20, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, flexShrink: 0,
                background: state === 'done' ? '#059669' : state === 'current' ? 'var(--ez-color-primary)' : 'var(--ez-color-surface-tertiary)',
                color: '#FFF',
              }}>
                {state === 'done' ? '✓' : i + 1}
              </span>
              {label}
            </div>
          );
        })}
      </nav>

      {/* Area kerja utama — komponen yang sudah ada, tanpa modal bersarang */}
      <DesignWizardFlow
        initialPrompt={initialPrompt}
        initialWizardData={wizardData}
        onWizardDataChange={handleWizardData}
        onPhaseChange={handlePhase}
        onStudioTabChange={handleTab}
        onClose={backToChat}
      />
    </div>
  );
};

export default ChatToRabWorkspace;
