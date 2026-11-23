/**
 * AI DOKUMEN — Funnel "Mau bikin apa?" (di-ACC owner 2026-11-20).
 *
 * Entri DEFAULT pembuatan dokumen: 5 langkah satu kolom tengah (pola DED
 * v4) — kategori → dokumen → custom prompt + tanggal → periksa → selesai.
 * Pengguna HANYA mengisi isi pokok (custom prompt) + tanggal; struktur,
 * bahasa formal, dan pasal standar disusun AI dari template yang sudah ada
 * (docTemplates.ts) lewat mesin generate yang sama dengan form lama
 * (documentStudioOrchestrator CREATE_DOCUMENT).
 *
 * Komponen ini TIDAK memanggil AI sendiri dan TIDAK menyimpan draf:
 * generate/ekspor/editor didelegasikan ke DocCreator lewat props, sehingga
 * funnel memakai jalur yang sama persis dengan form lama — termasuk ekspor
 * PDF formal (paperExport.ts) dan panel Poles/Revisi di editor.
 *
 * Tombol AI langkah 3 (audit DocAI 2026-11-22): menyempurnakan prompt
 * dengan AI SUNGGUHAN lewat prop onEnhancePrompt (DocCreator →
 * orchestrator ENHANCE_TEXT) bila tersedia + paket mengizinkan; bila
 * tidak, jatuh ke bingkai deterministik enhanceFunnelPrompt (tanpa
 * panggilan berbayar). Sebelum perbaikan ini tombol berlabel AI tetapi
 * SELALU deterministik — janji AI yang tidak ditepati.
 */
import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Briefcase, Check, ClipboardList,
  Download, FileCheck2, FilePlus2, FileText, Loader2, Lock, Mail, PenLine,
  RefreshCw, ScanSearch, ShieldCheck, Sparkles, Users,
} from 'lucide-react';
import {
  FUNNEL_CATEGORIES,
  FUNNEL_PROMPT_MAX,
  FUNNEL_STEPS,
  enhanceFunnelPrompt,
  examplePromptFor,
  formatFunnelDate,
  funnelChoicesFor,
  todayDateString,
  type FunnelCategoryId,
  type FunnelChoice,
} from '../funnel';
import type { DraftRecord } from '../view';

export interface FunnelGenerateRequest {
  choice: FunnelChoice;
  /** Isi pokok ketikan pengguna (custom prompt). */
  prompt: string;
  /** Tanggal dokumen (YYYY-MM-DD). */
  date: string;
}

export type FunnelGenerateResult =
  | { ok: true; draft: DraftRecord; html: string }
  | { ok: false; error: string };

/** Hasil penyempurnaan prompt langkah 3 lewat AI (DocCreator). */
export type FunnelEnhancePromptResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export interface DocFunnelProps {
  /** Generate draf lewat mesin DocCreator (orchestrator CREATE_DOCUMENT). */
  onGenerate: (req: FunnelGenerateRequest) => Promise<FunnelGenerateResult>;
  /**
   * Sempurnakan custom prompt dengan AI (DocCreator → ENHANCE_TEXT).
   * Opsional: bila tidak diberikan (atau paket terkunci), tombol AI memakai
   * bingkai deterministik enhanceFunnelPrompt sebagai fallback.
   */
  onEnhancePrompt?: (prompt: string, docLabel: string) => Promise<FunnelEnhancePromptResult>;
  /** Ekspor draf aktif — fungsi yang sama dengan tombol editor (doExport). */
  onExport: (kind: 'pdf' | 'docx') => void;
  /** Buka draf aktif di editor (panel Poles Dokumen & Revisi ada di sana). */
  onOpenInEditor: () => void;
  /** Navigasi silang ke menu workspace lain (kartu info tender → 'dokumen-tender'). */
  onNavigateToMenu?: (menu: string) => void;
  /** Buka permukaan analisis dokumen (tautan kecil langkah 1). */
  onOpenAnalysis?: () => void;
  /** Kembali ke form lengkap lama (tidak ada fungsi yang dihapus). */
  onUseLegacyForm: () => void;
  /** HTML kop profil aktif untuk pratinjau kertas langkah 5. */
  kopHeaderHtml: string;
  /** Gerbang paket (simulasi) — sama dengan gerbang mode AI form lama. */
  docAiAllowed: boolean;
  docAiLockedMsg: string;
}

const CATEGORY_ICONS: Record<FunnelCategoryId, React.ReactNode> = {
  'surat-administrasi': <Mail size={26} />,
  'berita-acara': <FileCheck2 size={26} />,
  laporan: <ClipboardList size={26} />,
  'qc-k3': <ShieldCheck size={26} />,
  rapat: <Users size={26} />,
  'penawaran-tender': <Briefcase size={26} />,
  bebas: <FilePlus2 size={26} />,
};

const CATEGORY_DESCS: Record<FunnelCategoryId, string> = {
  'surat-administrasi': 'Surat resmi proyek — permohonan, pemberitahuan, undangan, dan lainnya.',
  'berita-acara': 'Catatan resmi hasil pemeriksaan, pengukuran, dan kesepakatan lapangan.',
  laporan: 'Laporan berkala pelaksanaan pekerjaan — harian, mingguan, dan K3.',
  'qc-k3': 'Pemeriksaan mutu pekerjaan berdasarkan spesifikasi proyek.',
  rapat: 'Catatan rapat koordinasi — agenda, keputusan, dan tindak lanjut.',
  'penawaran-tender': 'Paket dokumen resmi tender dari data proyek & RAB.',
  bebas: 'Dokumen bebas — AI menyusun struktur dari prompt Anda.',
};

export const DocFunnel: React.FC<DocFunnelProps> = ({
  onGenerate,
  onEnhancePrompt,
  onExport,
  onOpenInEditor,
  onNavigateToMenu,
  onOpenAnalysis,
  onUseLegacyForm,
  kopHeaderHtml,
  docAiAllowed,
  docAiLockedMsg,
}) => {
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<FunnelCategoryId | null>(null);
  const [choice, setChoice] = useState<FunnelChoice | null>(null);
  const [prompt, setPrompt] = useState('');
  const [date, setDate] = useState<string>(() => todayDateString());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneDraft, setDoneDraft] = useState<DraftRecord | null>(null);
  const [doneHtml, setDoneHtml] = useState('');
  /** Penyempurnaan prompt AI sedang berjalan (tombol AI langkah 3). */
  const [enhanceBusy, setEnhanceBusy] = useState(false);
  /** Catatan bila AI tidak tersedia dan fallback deterministik dipakai. */
  const [enhanceNote, setEnhanceNote] = useState<string | null>(null);

  const choices = useMemo(
    () => (category ? funnelChoicesFor(category) : []),
    [category],
  );
  const example = choice ? examplePromptFor(choice) : undefined;
  const categoryLabel = category
    ? FUNNEL_CATEGORIES.find((c) => c.id === category)?.label ?? ''
    : '';

  const resetToStart = () => {
    setStep(1);
    setCategory(null);
    setChoice(null);
    setPrompt('');
    setDate(todayDateString());
    setError(null);
    setDoneDraft(null);
    setDoneHtml('');
  };

  const pickCategory = (id: FunnelCategoryId) => {
    setCategory(id);
    setChoice(null);
    setPrompt('');
    setError(null);
    setStep(2);
  };

  const pickChoice = (c: FunnelChoice) => {
    setChoice(c);
    setPrompt('');
    setError(null);
    setStep(3);
  };

  /**
   * Tombol AI (ikon Sparkles): kotak kosong → isi contoh (bila ada);
   * terisi → sempurnakan dengan AI SUNGGUHAN bila tersedia + paket
   * mengizinkan (onEnhancePrompt), bila tidak → bingkai deterministik
   * enhanceFunnelPrompt dengan catatan jujur.
   */
  const handleEnhance = async () => {
    if (!choice || enhanceBusy) return;
    if (!prompt.trim()) {
      if (example) setPrompt(example);
      return;
    }
    setEnhanceNote(null);
    if (onEnhancePrompt && docAiAllowed) {
      setEnhanceBusy(true);
      try {
        const res = await onEnhancePrompt(prompt.trim(), choice.label);
        if (res.ok && res.text.trim()) {
          setPrompt(res.text.trim().slice(0, FUNNEL_PROMPT_MAX));
          return;
        }
        setEnhanceNote(
          res.ok
            ? 'AI mengembalikan hasil kosong — prompt dibingkai otomatis sebagai gantinya.'
            : `AI tidak tersedia (${res.error}) — prompt dibingkai otomatis sebagai gantinya.`,
        );
      } catch {
        setEnhanceNote('AI tidak tersedia — prompt dibingkai otomatis sebagai gantinya.');
      } finally {
        setEnhanceBusy(false);
      }
    }
    const enhanced = enhanceFunnelPrompt(prompt, choice.label);
    if (enhanced) setPrompt(enhanced);
  };

  const handleGenerate = async () => {
    if (!choice || busy) return;
    if (!docAiAllowed) {
      setError(docAiLockedMsg);
      return;
    }
    if (!prompt.trim()) {
      setError('Isi custom prompt terlebih dahulu — ceritakan isi pokok dokumen yang ingin dibuat.');
      return;
    }
    if (!date) {
      setError('Pilih tanggal dokumen terlebih dahulu.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onGenerate({ choice, prompt: prompt.trim(), date });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDoneDraft(res.draft);
      setDoneHtml(res.html);
      setStep(5);
    } finally {
      setBusy(false);
    }
  };

  const stepper = (
    <ol className="docai-funnel-steps" aria-label="Langkah pembuatan dokumen">
      {FUNNEL_STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'active' : 'todo';
        return (
          <li key={label} className={`docai-funnel-step ${state}`}>
            <span className="docai-funnel-stepnum">
              {state === 'done' ? <Check size={13} /> : n}
            </span>
            <span className="docai-funnel-steplabel">{label}</span>
          </li>
        );
      })}
    </ol>
  );

  const backBtn = (to: number, label = 'Kembali') => (
    <button type="button" className="docai-btn-ghost docai-funnel-back" onClick={() => setStep(to)}>
      <ArrowLeft size={14} /> {label}
    </button>
  );

  return (
    <div className="docai-funnel">
      <div className="docai-funnel-head">
        <h2 className="docai-funnel-title">Mau bikin apa?</h2>
        <p className="docai-funnel-sub">
          Pilih jenis dokumen, tulis isi pokoknya, dan AI menyusun dokumen lengkap dari template.
        </p>
      </div>
      {stepper}

      {/* ---------- Langkah 1: kategori ---------- */}
      {step === 1 && (
        <div className="docai-funnel-body">
          <div className="docai-funnel-cards" role="list">
            {FUNNEL_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="listitem"
                className="docai-funnel-card"
                onClick={() => pickCategory(c.id)}
              >
                <span className="docai-funnel-cardicon">{CATEGORY_ICONS[c.id]}</span>
                <span className="docai-funnel-cardlabel">{c.label}</span>
                <span className="docai-funnel-carddesc">{CATEGORY_DESCS[c.id]}</span>
                <ArrowRight size={16} className="docai-funnel-cardarrow" />
              </button>
            ))}
          </div>
          <div className="docai-funnel-links">
            {onOpenAnalysis && (
              <button type="button" className="docai-linkbtn" onClick={onOpenAnalysis}>
                <ScanSearch size={14} /> Analisis dokumen yang sudah ada
              </button>
            )}
            <button type="button" className="docai-linkbtn" onClick={onUseLegacyForm}>
              Gunakan form lengkap (cara lama)
            </button>
          </div>
        </div>
      )}

      {/* ---------- Langkah 2: pilih dokumen ---------- */}
      {step === 2 && category && (
        <div className="docai-funnel-body">
          {backBtn(1, 'Kembali ke kategori')}
          <h3 className="docai-funnel-h">{categoryLabel}</h3>
          {category === 'penawaran-tender' ? (
            <div className="docai-funnel-infocard">
              <Briefcase size={22} />
              <div>
                <strong>Paket 18 dokumen tender</strong>
                <p>
                  Dokumen tender resmi — surat penawaran, kontrak, dan administrasi tender —
                  disusun dari data proyek &amp; RAB di Dokumen Proyek.
                </p>
              </div>
              {onNavigateToMenu && (
                <button
                  type="button"
                  className="docai-btn-primary"
                  onClick={() => onNavigateToMenu('dokumen-tender')}
                >
                  Buka Dokumen Proyek <ArrowRight size={14} />
                </button>
              )}
            </div>
          ) : (
            <div className="docai-funnel-choices" role="list">
              {choices.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="listitem"
                  className="docai-funnel-choice"
                  onClick={() => pickChoice(c)}
                >
                  <span>
                    <span className="docai-funnel-choicelabel">{c.label}</span>
                    {c.desc && <span className="docai-funnel-choicedesc">{c.desc}</span>}
                  </span>
                  <ArrowRight size={16} className="docai-funnel-cardarrow" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------- Langkah 3: custom prompt ---------- */}
      {step === 3 && choice && (
        <div className="docai-funnel-body">
          {backBtn(2, 'Kembali ke pilih dokumen')}
          <h3 className="docai-funnel-h">{choice.label}</h3>
          <label className="docai-funnel-fieldlabel" htmlFor="docai-funnel-date">
            Tanggal dokumen
          </label>
          <input
            id="docai-funnel-date"
            type="date"
            className="docai-input docai-funnel-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <label className="docai-funnel-fieldlabel" htmlFor="docai-funnel-prompt">
            Custom Prompt
          </label>
          <div className="docai-funnel-promptbox">
            <textarea
              id="docai-funnel-prompt"
              className="docai-funnel-promptarea"
              rows={5}
              maxLength={FUNNEL_PROMPT_MAX}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Jelaskan dokumen yang ingin dibuat. Anda dapat menambahkan detail: ditujukan kepada siapa, pokok permasalahannya apa, dan hal khusus yang perlu dicantumkan."
            />
            <div className="docai-funnel-promptbar">
              <button
                type="button"
                className="docai-funnel-aibtn"
                onClick={() => void handleEnhance()}
                disabled={enhanceBusy}
                title={
                  !prompt.trim()
                    ? 'Isi dengan contoh'
                    : onEnhancePrompt && docAiAllowed
                      ? 'Sempurnakan prompt ini dengan AI'
                      : 'Susun prompt ini menjadi instruksi lengkap'
                }
              >
                {enhanceBusy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} AI
              </button>
              <span className="docai-funnel-count" aria-live="polite">
                {prompt.length}/{FUNNEL_PROMPT_MAX}
              </span>
            </div>
          </div>
          <p className="docai-hint" style={{ textAlign: 'left' }}>
            Tombol AI menyempurnakan prompt Anda — hasilnya tetap dapat diubah manual.
            Bila AI tidak tersedia, prompt dibingkai otomatis tanpa mengubah isinya.
          </p>
          {enhanceNote && (
            <div className="docai-warn" role="status" style={{ marginTop: 8 }}>
              {enhanceNote}
            </div>
          )}
          {example && (
            <div className="docai-funnel-examples">
              <span className="docai-funnel-fieldlabel">Contoh</span>
              <button
                type="button"
                className="docai-funnel-examplechip"
                onClick={() => setPrompt(example)}
                title={example}
              >
                CONTOH: {example}
              </button>
            </div>
          )}
          <div className="docai-funnel-actions">
            <button
              type="button"
              className="docai-btn-primary"
              disabled={!prompt.trim() || !date}
              onClick={() => setStep(4)}
            >
              Lanjut ke Periksa <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ---------- Langkah 4: periksa ---------- */}
      {step === 4 && choice && (
        <div className="docai-funnel-body">
          {backBtn(3, 'Kembali ke Custom Prompt')}
          <h3 className="docai-funnel-h">Periksa</h3>
          <div className="docai-funnel-review">
            <div className="docai-funnel-reviewrow">
              <span className="docai-funnel-reviewkey">Dokumen</span>
              <span className="docai-funnel-reviewval">{choice.label}</span>
              <button type="button" className="docai-linkbtn" onClick={() => setStep(2)}>
                Ubah
              </button>
            </div>
            <div className="docai-funnel-reviewrow">
              <span className="docai-funnel-reviewkey">Tanggal dokumen</span>
              <span className="docai-funnel-reviewval">{formatFunnelDate(date)}</span>
              <button type="button" className="docai-linkbtn" onClick={() => setStep(3)}>
                Ubah
              </button>
            </div>
            <div className="docai-funnel-reviewrow">
              <span className="docai-funnel-reviewkey">Custom prompt</span>
              <span className="docai-funnel-reviewval">{prompt}</span>
              <button type="button" className="docai-linkbtn" onClick={() => setStep(3)}>
                Ubah
              </button>
            </div>
          </div>
          <p className="docai-hint" style={{ textAlign: 'left' }}>
            Struktur, bahasa formal, dan pasal standar disusun AI dari template. Data yang belum
            Anda berikan ditandai <strong>[ISI: ...]</strong> pada draf — tidak dikarang.
          </p>
          {!docAiAllowed && (
            <div role="alert" className="docai-funnel-lock">
              <Lock size={14} /> {docAiLockedMsg}
            </div>
          )}
          {error && (
            <div className="docai-error">
              <span>{error}</span>
            </div>
          )}
          <div className="docai-funnel-actions">
            <button
              type="button"
              className="docai-btn-primary docai-runbtn"
              onClick={() => void handleGenerate()}
              disabled={busy || !docAiAllowed}
            >
              {busy ? (
                <>
                  <Loader2 size={15} className="spin" /> AI sedang menyusun dokumen…
                </>
              ) : (
                <>
                  <Sparkles size={15} /> Buat Dokumen
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ---------- Langkah 5: selesai ---------- */}
      {step === 5 && doneDraft && (
        <div className="docai-funnel-body">
          <div className="docai-funnel-done" role="status">
            <span className="docai-funnel-doneicon">
              <Check size={18} />
            </span>
            <div>
              <strong>Draf selesai dibuat</strong>
              <p>
                {doneDraft.title} — tersimpan sebagai draf. Periksa isinya sebelum dipakai
                secara resmi.
              </p>
            </div>
          </div>
          <div className="docai-funnel-paperwrap" aria-label="Pratinjau dokumen">
            <div className="docai-funnel-paper">
              {kopHeaderHtml && (
                <div
                  className="docai-funnel-paperkop"
                  dangerouslySetInnerHTML={{ __html: kopHeaderHtml }}
                />
              )}
              <div dangerouslySetInnerHTML={{ __html: doneHtml }} />
            </div>
          </div>
          <div className="docai-funnel-actions docai-funnel-doneactions">
            <button type="button" className="docai-btn-primary" onClick={() => onExport('pdf')}>
              <Download size={15} /> Unduh PDF
            </button>
            <button type="button" className="docai-btn-ghost" onClick={() => onExport('docx')}>
              <Download size={15} /> Unduh Word
            </button>
            <button type="button" className="docai-btn-ghost" onClick={onOpenInEditor} title="Poles Dokumen (AI) tersedia di editor, di bawah dokumen">
              <Sparkles size={15} /> Poles Dokumen (AI) <span className="docai-funnel-btnnote">di editor</span>
            </button>
            <button type="button" className="docai-btn-ghost" onClick={onOpenInEditor} title="Revisi dengan bahasa alami tersedia di editor, di bawah dokumen">
              <PenLine size={15} /> Revisi dengan bahasa alami <span className="docai-funnel-btnnote">di editor</span>
            </button>
          </div>
          <div className="docai-funnel-links">
            <button type="button" className="docai-linkbtn" onClick={resetToStart}>
              <RefreshCw size={14} /> Buat dokumen lain
            </button>
            <button type="button" className="docai-linkbtn" onClick={onOpenInEditor}>
              <FileText size={14} /> Buka di editor
            </button>
          </div>
        </div>
      )}

      {step > 1 && step < 5 && (
        <div className="docai-funnel-links">
          <button type="button" className="docai-linkbtn" onClick={onUseLegacyForm}>
            Gunakan form lengkap (cara lama)
          </button>
        </div>
      )}

    </div>
  );
};

export default DocFunnel;
