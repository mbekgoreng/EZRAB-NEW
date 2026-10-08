/**
 * AI DOKUMEN — Buat Dokumen.
 * Template → isi info proyek → generate draf (AI) → review/edit → simpan → ekspor.
 * Draf selalu berstatus DRAF; jangan mengarang identitas resmi.
 */
import React, { useState } from 'react';
import { Loader2, Save, Download, AlertTriangle, FilePlus2 } from 'lucide-react';
import { dokumenAiService } from '../service';
import { draftStore, historyStore, newId, formatDate, DraftRecord } from '../store';
import { useProject } from '../../../context/ProjectContext';

const TEMPLATES = [
  { id: 'berita-acara', name: 'Berita Acara', desc: 'Serah terima, opname, atau kesepakatan lapangan' },
  { id: 'surat', name: 'Surat Resmi', desc: 'Surat permohonan, pemberitahuan, undangan' },
  { id: 'laporan-harian', name: 'Laporan Harian', desc: 'Progres harian proyek konstruksi' },
  { id: 'notulen', name: 'Notulen Rapat', desc: 'Ringkasan rapat koordinasi proyek' },
  { id: 'checklist-qc', name: 'Checklist QC', desc: 'Pemeriksaan mutu pekerjaan' },
  { id: 'bebas', name: 'Draf Bebas', desc: 'Instruksi sendiri untuk AI' },
];

export const DocCreator: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { currentProject, projects } = useProject();
  const [templateId, setTemplateId] = useState('berita-acara');
  const [projectId, setProjectId] = useState(currentProject?.id || '');
  const [instruction, setInstruction] = useState('');
  const [draft, setDraft] = useState<DraftRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [drafts, setDrafts] = useState<DraftRecord[]>(() => draftStore.list());

  const template = TEMPLATES.find((t) => t.id === templateId)!;
  const project = projects.find((p) => p.id === projectId) || currentProject;

  const generate = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const projInfo = project
        ? `Proyek: ${project.name}\nLokasi: ${project.location || '-'}\nKlien: ${project.clientName || '-'}`
        : 'Proyek: (tidak dipilih)';
      const prompt = `Buatkan ${template.name}.\n${projInfo}\n\nDetail/instruksi pengguna:\n${instruction || '(tidak ada detail tambahan)'}`;
      const res = await dokumenAiService.chat({
        documentText: projInfo, fileName: 'info-proyek', mode: 'DRAFT', prompt,
      });
      if (res.success) {
        const d: DraftRecord = {
          id: newId('draft'), templateId, templateName: template.name,
          title: `${template.name} — ${project?.name || 'Tanpa proyek'}`,
          content: res.reply || '', projectId: project?.id, projectName: project?.name,
          status: 'draft', createdAt: Date.now(), updatedAt: Date.now(),
        };
        setDraft(d);
        historyStore.add({
          type: 'draft', docIds: [], docNames: [],
          title: `Draf: ${d.title}`,
          resultPreview: d.content.slice(0, 300), resultFull: d.content,
        });
        onDone();
      } else {
        setError(`${res.errorCode || 'ERROR'}: ${res.message || 'Gagal.'}`);
      }
    } catch (e: any) {
      setError(e?.message || 'Kesalahan tidak terduga.');
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () => {
    if (!draft) return;
    draftStore.upsert({ ...draft, status: 'reviewed', updatedAt: Date.now() });
    setDrafts(draftStore.list());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const downloadDraft = () => {
    if (!draft) return;
    const blob = new Blob([`[DRAF — belum resmi]\n${draft.title}\n\n${draft.content}`], { type: 'text/plain;charset=utf-8' });
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
          <div className="docai-crumb">EZRAB AI Dokumen</div>
          <h2>Buat Dokumen</h2>
          <p>Susun draf dokumen konstruksi dengan bantuan AI. Semua hasil berstatus DRAF sampai ditinjau.</p>
        </div>
      </div>

      <div className="docai-createlayout">
        <div className="docai-card">
          <div className="docai-step">1 · Pilih template</div>
          <div className="docai-tmplgrid">
            {TEMPLATES.map((t) => (
              <button key={t.id} className={`docai-tmpl ${templateId === t.id ? 'active' : ''}`} onClick={() => setTemplateId(t.id)}>
                <div className="docai-tmpl-n">{t.name}</div>
                <div className="docai-tmpl-d">{t.desc}</div>
              </button>
            ))}
          </div>

          <div className="docai-step" style={{ marginTop: 16 }}>2 · Proyek & instruksi</div>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="docai-select docai-full">
            <option value="">— tanpa proyek —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <textarea
            className="docai-textarea" rows={4} value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Contoh: Berita acara serah terima pekerjaan pondasi tahap 1, tanggal 10 Oktober 2026, dihadiri mandor dan pengawas…"
          />
          <button className="docai-btn-primary docai-runbtn" onClick={generate} disabled={busy}>
            {busy ? <><Loader2 size={15} className="spin" /> Menyusun draf…</> : <><FilePlus2 size={15} /> Buatkan Draf</>}
          </button>
          {error && <div className="docai-error"><AlertTriangle size={14} /> {error}</div>}
        </div>

        <div className="docai-card">
          <div className="docai-step">3 · Review draf</div>
          {!draft ? (
            <p className="docai-hint">Draf akan muncul di sini. Periksa isinya sebelum disimpan — AI tidak mengarang nomor surat, nama pihak, atau nilai kontrak.</p>
          ) : (
            <>
              <div className="docai-draftwarn">STATUS: DRAF — perlu ditinjau manusia sebelum dipakai resmi.</div>
              <input
                className="docai-input" value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <textarea
                className="docai-textarea docai-draftarea" rows={14} value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value, updatedAt: Date.now() })}
              />
              <div className="docai-btnrow">
                <button className="docai-btn-primary" onClick={saveDraft}><Save size={15} /> {saved ? 'Tersimpan ✓' : 'Simpan Draf'}</button>
                <button className="docai-btn-ghost" onClick={downloadDraft}><Download size={15} /> Unduh .txt</button>
              </div>
            </>
          )}

          {drafts.length > 0 && (
            <>
              <div className="docai-step" style={{ marginTop: 18 }}>Draf tersimpan</div>
              <div className="docai-draftlist">
                {drafts.map((d) => (
                  <button key={d.id} className="docai-draftitem" onClick={() => setDraft(d)}>
                    <div><strong>{d.title}</strong><span className="docai-draftst">{d.status === 'draft' ? 'DRAF' : 'Ditinjau'}</span></div>
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
