/**
 * AI DOKUMEN — Orchestrator (4 menu utama).
 *
 * 1. Dokumen Saya   — library dokumen
 * 2. Analisis Dokumen — workspace kontekstual (dibuka dari Dokumen Saya)
 * 3. Buat Dokumen   — template → draf → review → ekspor
 * 4. Riwayat        — jejak analisis & draf
 *
 * Floating assistant global disembunyikan di menu ini oleh WorkspaceView
 * (single-mascot rule) — tidak ada dua chatbot bersamaan.
 */
import React, { useState } from 'react';
import { FolderOpen, ScanSearch, FilePlus2, History } from 'lucide-react';
import { DocLibrary } from './components/DocLibrary';
import { DocAnalyzer } from './components/DocAnalyzer';
import { DocCreator } from './components/DocCreator';
import { DocHistory } from './components/DocHistory';
import { DocRecord } from './store';
import './document-ai.css';

type Tab = 'library' | 'analyze' | 'create' | 'history';

export const DokumenAiView: React.FC = () => {
  const [tab, setTab] = useState<Tab>('library');
  const [activeDoc, setActiveDoc] = useState<DocRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

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
