/**
 * AI DOKUMEN — Riwayat.
 * Jejak analisis, ekstraksi, perbandingan, dan draf. State diangkat ke view.tsx.
 */
import React, { useState } from 'react';
import { History, Trash2, Eye, X, Search } from 'lucide-react';
import type { HistoryEntry, HistoryType } from '../view';
import { formatDate } from '../view';

const TYPE_LABEL: Record<HistoryType, string> = {
  summary: 'Ringkasan', qa: 'Tanya Jawab', extract: 'Ekstraksi',
  compare: 'Perbandingan', checklist: 'Kelengkapan', draft: 'Draf',
};

export const DocHistory: React.FC<{
  history: HistoryEntry[];
  onRemoveHistory: (id: string) => void;
}> = ({ history, onRemoveHistory }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<HistoryEntry | null>(null);

  const filtered = history.filter((h) =>
    !query || h.title.toLowerCase().includes(query.toLowerCase())
  );

  const remove = (id: string) => {
    onRemoveHistory(id);
    if (open?.id === id) setOpen(null);
  };

  return (
    <div className="docai-tab">
      <div className="docai-pagehead">
        <div>
          <div className="docai-crumb">EZRAB AI Dokumen</div>
          <h2>Riwayat</h2>
          <p>Jejak analisis, ekstraksi, perbandingan, dan draf yang pernah dibuat.</p>
        </div>
        <div className="docai-search" style={{ maxWidth: 260 }}>
          <Search size={15} color="#94A3B8" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari riwayat…" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="docai-empty">
          <History size={40} color="#CBD5E1" />
          <h3>Belum ada riwayat</h3>
          <p>Hasil analisis dokumen akan tercatat di sini.</p>
        </div>
      ) : (
        <div className="docai-histlist">
          {filtered.map((h) => (
            <div key={h.id} className="docai-histitem">
              <div className="docai-histmain">
                <span className="docai-histtype">{TYPE_LABEL[h.type]}</span>
                <strong>{h.title}</strong>
                <p>{h.resultPreview}{h.resultFull.length > 300 ? '…' : ''}</p>
                <span className="docai-histdate">{formatDate(h.at)}</span>
              </div>
              <div className="docai-actions">
                <button title="Lihat" onClick={() => setOpen(h)}><Eye size={15} /></button>
                <button title="Hapus" onClick={() => remove(h.id)}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="docai-modalback" onClick={() => setOpen(null)}>
          <div className="docai-modal" onClick={(e) => e.stopPropagation()}>
            <div className="docai-result-head">
              <span>{open.title}</span>
              <button onClick={() => setOpen(null)}><X size={15} /></button>
            </div>
            <div className="docai-result-body docai-modalbody">
              {open.chat ? open.chat.map((m, i) => (
                <div key={i} className={`docai-msg ${m.role}`}><div className="docai-msg-b">{m.text}</div></div>
              )) : open.resultFull}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
