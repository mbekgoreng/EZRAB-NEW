/**
 * AI DOKUMEN — Orchestrator (4 menu utama).
 *
 * 1. Dokumen Saya   — library dokumen
 * 2. Analisis Dokumen — workspace kontekstual (dibuka dari Dokumen Saya)
 * 3. Buat Dokumen   — template → draf → review → ekspor
 * 4. Riwayat        — jejak analisis & draf
 *
 * Aturan assistant (master prompt):
 * - Floating assistant global TAMPIL di halaman utama AI Dokumen.
 * - Disembunyikan HANYA saat workspace analisis aktif (ada dokumen dibuka).
 * - Tidak ada dua chatbot bersamaan; riwayat chat tidak dicampur.
 * DokumenAiView melaporkan status workspace via onAnalysisActiveChange.
 */
import React, { useState, useEffect } from 'react';
import { FolderOpen, ScanSearch, FilePlus2, History } from 'lucide-react';
import { DocLibrary } from './components/DocLibrary';
import { DocAnalyzer } from './components/DocAnalyzer';
import { DocCreator } from './components/DocCreator';
import { DocHistory } from './components/DocHistory';
import { DocRecord } from './store';
import './document-ai.css';

type Tab = 'library' | 'analyze' | 'create' | 'history';

interface DokumenAiViewProps {
  /** Dipanggil saat workspace analisis aktif/nonaktif — WorkspaceView memakai ini untuk menyembunyikan floating assistant. */
  onAnalysisActiveChange?: (active: boolean) => void;
}

export const DokumenAiView: React.FC<DokumenAiViewProps> = ({ onAnalysisActiveChange }) => {
  const [tab, setTab] = useState<Tab>('library');
  const [activeDoc, setActiveDoc] = useState<DocRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  const analysisActive = tab === 'analyze' && activeDoc !== null;

  useEffect(() => {
    onAnalysisActiveChange?.(analysisActive);
  }, [analysisActive, onAnalysisActiveChange]);

  const openAnalyze = (doc: DocRecord) => {
    setActiveDoc(doc);
    setTab('analyze');
  };

  return (
    <div className="docai-shell">
      <nav className="docai-tabs" aria-label="Menu AI Dokumen">
        {[
          { id: 'library', label: 'Dokumen Saya', icon: FolderOpen },
          { id: 'analyze', label: 'Analisis Dokumen', icon: ScanSearch },
          { id: 'create', label: 'Buat Dokumen', icon: FilePlus2 },
          { id: 'history', label: 'Riwayat', icon: History },
        ].map((t) => {
          const Icon = t.icon;
          const disabled = t.id === 'analyze' && !activeDoc;
          return (
            <button
              key={t.id}
              className={`docai-tabbtn ${tab === t.id ? 'active' : ''}`}
              disabled={disabled}
              title={disabled ? 'Pilih dokumen di "Dokumen Saya" dulu' : t.label}
              onClick={() => setTab(t.id as Tab)}
            >
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </nav>

      <div className="docai-content">
        {tab === 'library' && (
          <DocLibrary onAnalyze={openAnalyze} refreshKey={refreshKey} onChanged={bump} />
        )}
        {tab === 'analyze' && activeDoc && (
          <DocAnalyzer doc={activeDoc} onBack={() => setTab('library')} onDone={bump} />
        )}
        {tab === 'create' && <DocCreator onDone={bump} />}
        {tab === 'history' && <DocHistory refreshKey={refreshKey} />}
      </div>
    </div>
  );
};

export default DokumenAiView;
