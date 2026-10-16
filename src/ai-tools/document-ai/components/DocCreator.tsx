/**
 * AI DOKUMEN — Buat Dokumen.
 * Template → isi info proyek → generate draf (AI) → review/edit → simpan → ekspor.
 * Draf selalu berstatus DRAF; jangan mengarang identitas resmi.
 *
 * ADAPTASI: service cabang ini belum punya mode DRAF milik referensi, jadi
 * instruksi draf (termasuk aturan anti-karangan) dibangun di komponen dan
 * dikirim lewat mode CHAT yang sudah didukung service.
 */
import React, { useState } from 'react';
import { Loader2, Save, Download, AlertTriangle, FilePlus2, Check } from 'lucide-react';
import { dokumenAiService } from '../service';
import type { DraftRecord, HistoryEntry } from '../view';
import { newId, formatDate } from '../view';
import { useProject } from '../../../context/ProjectContext';
import { useI18n } from '../../../i18n/I18nContext';

const getTemplates = (
  t: (key: string) => string,
): Array<{ id: string; name: string; desc: string }> => [
  { id: 'berita-acara', name: t('ai.doc.create.tmpl_berita_n'), desc: t('ai.doc.create.tmpl_berita_d') },
  { id: 'surat', name: t('ai.doc.create.tmpl_surat_n'), desc: t('ai.doc.create.tmpl_surat_d') },
  { id: 'laporan-harian', name: t('ai.doc.create.tmpl_laporan_n'), desc: t('ai.doc.create.tmpl_laporan_d') },
  { id: 'notulen', name: t('ai.doc.create.tmpl_notulen_n'), desc: t('ai.doc.create.tmpl_notulen_d') },
  { id: 'checklist-qc', name: t('ai.doc.create.tmpl_checklist_n'), desc: t('ai.doc.create.tmpl_checklist_d') },
  { id: 'bebas', name: t('ai.doc.create.tmpl_bebas_n'), desc: t('ai.doc.create.tmpl_bebas_d') },
];

export const DocCreator: React.FC<{
  drafts: DraftRecord[];
  onUpsertDraft: (d: DraftRecord) => void;
  onAddHistory: (e: Omit<HistoryEntry, 'id' | 'at'>) => void;
}> = ({ drafts, onUpsertDraft, onAddHistory }) => {
  const { t } = useI18n();
  const TEMPLATES = getTemplates(t);
  const { currentProject, projects } = useProject();
  const [templateId, setTemplateId] = useState('berita-acara');
  const [projectId, setProjectId] = useState(currentProject?.id || '');
  const [instruction, setInstruction] = useState('');
  const [draft, setDraft] = useState<DraftRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const template = TEMPLATES.find((t) => t.id === templateId)!;
  const project = projects.find((p) => p.id === projectId) || currentProject;

  const generate = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const projInfo = project
        ? `Proyek: ${project.name}\nLokasi: ${project.location || '-'}\nKlien: ${project.clientName || '-'}`
        : 'Proyek: (tidak dipilih)';
      const prompt =
        `Buatkan ${template.name}.\n${projInfo}\n\nDetail/instruksi pengguna:\n${instruction || '(tidak ada detail tambahan)'}` +
        `\n\nAturan: gunakan HANYA informasi yang diberikan; jangan mengarang nomor surat, nama pihak, ` +
        `nilai kontrak, tanggal, atau persetujuan. Tandai bagian yang perlu dilengkapi pengguna dengan ` +
        `[ISI: ...]. Hasilkan draf yang jelas berstatus DRAF.`;
      const res = await dokumenAiService.chat({
        documentText: projInfo, fileName: 'info-proyek', mode: 'CHAT', prompt,
      });
      if (res.success) {
        const d: DraftRecord = {
          id: newId('draft'), templateId, templateName: template.name,
          title: `${template.name} — ${project?.name || t('ai.doc.create.no_project')}`,
          content: res.reply || '', projectId: project?.id, projectName: project?.name,
          status: 'draft', createdAt: Date.now(), updatedAt: Date.now(),
        };
        setDraft(d);
        onAddHistory({
          type: 'draft', docIds: [], docNames: [],
          title: `${t('ai.doc.create.hist_a')} ${d.title}`,
          resultPreview: d.content.slice(0, 300), resultFull: d.content,
        });
      } else {
        setError(`${res.errorCode || 'ERROR'}: ${res.message || t('ai.doc.err_failed')}`);
      }
    } catch (e: any) {
      setError(e?.message || t('ai.doc.err_unexpected'));
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () => {
    if (!draft) return;
    onUpsertDraft({ ...draft, status: 'reviewed', updatedAt: Date.now() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const downloadDraft = () => {
    if (!draft) return;
    const blob = new Blob([`${t('ai.doc.create.draft_header')}\n${draft.title}\n\n${draft.content}`], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = draft.title.replace(/[^\w\- ]/g, '').slice(0, 60) + '.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="docai-tab">
      <div className="docai-pagehead">
        <div>
          <div className="docai-crumb">{t('ai.doc.create.crumb')}</div>
          <h2>{t('ai.doc.create.h2')}</h2>
          <p>{t('ai.doc.create.sub')}</p>
        </div>
      </div>

      <div className="docai-createlayout">
        <div className="docai-card">
          <div className="docai-step">{t('ai.doc.create.step_1')}</div>
          <div className="docai-tmplgrid">
            {TEMPLATES.map((tmpl) => (
              <button key={tmpl.id} className={`docai-tmpl ${templateId === tmpl.id ? 'active' : ''}`} onClick={() => setTemplateId(tmpl.id)}>
                <div className="docai-tmpl-n">{tmpl.name}</div>
                <div className="docai-tmpl-d">{tmpl.desc}</div>
              </button>
            ))}
          </div>

          <div className="docai-step" style={{ marginTop: 16 }}>{t('ai.doc.create.step_2')}</div>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="docai-select docai-full">
            <option value="">{t('ai.doc.create.opt_no_project')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <textarea
            className="docai-textarea" rows={4} value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={t('ai.doc.create.instr_ph')}
          />
          <button className="docai-btn-primary docai-runbtn" onClick={generate} disabled={busy}>
            {busy ? <><Loader2 size={15} className="spin" /> {t('ai.doc.create.gen_busy')}</> : <><FilePlus2 size={15} /> {t('ai.doc.create.gen')}</>}
          </button>
          {error && <div className="docai-error"><AlertTriangle size={14} /> {error}</div>}
        </div>

        <div className="docai-card">
          <div className="docai-step">{t('ai.doc.create.step_3')}</div>
          {!draft ? (
            <p className="docai-hint">{t('ai.doc.create.hint_empty')}</p>
          ) : (
            <>
              <div className="docai-draftwarn">{t('ai.doc.create.draft_warn')}</div>
              <input
                className="docai-input" value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <textarea
                className="docai-textarea docai-draftarea" rows={14} value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value, updatedAt: Date.now() })}
              />
              <div className="docai-btnrow">
                <button className="docai-btn-primary" onClick={saveDraft}>
                  {saved ? <Check size={15} /> : <Save size={15} />} {saved ? t('ai.doc.create.saved') : t('ai.doc.create.save')}
                </button>
                <button className="docai-btn-ghost" onClick={downloadDraft}><Download size={15} /> {t('ai.doc.create.unduh')}</button>
              </div>
            </>
          )}

          {drafts.length > 0 && (
            <>
              <div className="docai-step" style={{ marginTop: 18 }}>{t('ai.doc.create.draft_saved_list')}</div>
              <div className="docai-draftlist">
                {drafts.map((d) => (
                  <button key={d.id} className="docai-draftitem" onClick={() => setDraft(d)}>
                    <div><strong>{d.title}</strong><span className="docai-draftst">{d.status === 'draft' ? t('ai.doc.create.st_draft') : t('ai.doc.create.st_reviewed')}</span></div>
                    <span>{formatDate(d.updatedAt)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
