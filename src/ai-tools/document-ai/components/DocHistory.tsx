/**
 * AI DOKUMEN — Riwayat.
 * Jejak analisis, ekstraksi, perbandingan, dan draf. State diangkat ke view.tsx.
 */
import React, { useState } from 'react';
import { History, Trash2, Eye, X, Search } from 'lucide-react';
import type { HistoryEntry, HistoryType } from '../view';
import { formatDate } from '../view';
import { useI18n } from '../../../i18n/I18nContext';

const getTypeLabel = (
  t: (key: string) => string,
): Record<HistoryType, string> => ({
  summary: t('ai.doc.hist.type_summary'), qa: t('ai.doc.hist.type_qa'), extract: t('ai.doc.hist.type_extract'),
  compare: t('ai.doc.hist.type_compare'), checklist: t('ai.doc.hist.type_checklist'), draft: t('ai.doc.hist.type_draft'),
});

export const DocHistory: React.FC<{
  history: HistoryEntry[];
  onRemoveHistory: (id: string) => void;
}> = ({ history, onRemoveHistory }) => {
  const { t } = useI18n();
  const TYPE_LABEL = getTypeLabel(t);
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
          <div className="docai-crumb">{t('ai.doc.create.crumb')}</div>
          <h2>{t('ai.doc.hist.h2')}</h2>
          <p>{t('ai.doc.hist.sub')}</p>
        </div>
        <div className="docai-search" style={{ maxWidth: 260 }}>
          <Search size={15} color="var(--ez-color-text-muted)" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('ai.doc.hist.search_ph')} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="docai-empty">
          <History size={40} color="var(--ez-color-border)" />
          <h3>{t('ai.doc.hist.empty_h')}</h3>
          <p>{t('ai.doc.hist.empty_p')}</p>
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
                <button title={t('ai.doc.hist.title_view')} onClick={() => setOpen(h)}><Eye size={15} /></button>
                <button title={t('ai.doc.hist.title_delete')} onClick={() => remove(h.id)}><Trash2 size={15} /></button>
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
