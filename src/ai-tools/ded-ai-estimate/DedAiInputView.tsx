/**
 * DED-AI Estimate — Tampilan 1: INPUT.
 * Upload multi-file (drag & drop) + deskripsi proyek + pilihan proyek + tipe + mode AI.
 *
 * Tata letak pola app shell (mockup ter-ACC owner 2026-11-10): keadaan awal
 * = kotak upload besar di tengah + SATU panel Pengaturan di pinggir kanan
 * (simpan hasil ke, jenis proyek, preferensi output, kompleksitas &
 * estimasi kredit, deskripsi opsional) dengan tombol Mulai Analisis
 * menempel di bawah panel. Judul + stepper kini disediakan shell halaman
 * (FeaturePageShell) — blok head/steps internal lama dihapus agar tidak
 * ganda. Semua state, handler, dan gerbang kredit TIDAK berubah.
 *
 * DUAL MODE (§3 directive, 2026-11-13): pemilih mode adalah PERSIS DUA
 * kartu — EZRAB AI MODE (referensi AHSP) atau FULL AI MODE (mandiri) —
 * di kartu Konfigurasi Analisis; radio Kebijakan Harga + checkbox mesin
 * lama dihapus (G-UI-1/G-UI-2). Kedalaman Cepat/Mendalam tetap sebagai
 * sub-pilihan di kedua mode. Policy/fullAi di level service TETAP ADA
 * (backward compat) dan diturunkan dari mode yang dipilih.
 *
 * REDESIGN PREMIUM ONE-SCREEN (ter-ACC owner 2026-11-10 21:21, mockup D6):
 * kolom tengah kini memuat kartu Konfigurasi Analisis kompak (Mode
 * Analisis dua kartu + Kedalaman, Kompleksitas — hanya aktif pada DETAIL,
 * Cakupan dokumen, ringkasan ekstraksi) dan strip Pratinjau Hasil dari
 * keadaan nyata;
 * panel kanan memuat Preferensi Output. Tiga elemen USULAN BARU yang ikut
 * ter-ACC dibangun sebagai fitur nyata: cakupan halaman (diteruskan ke
 * service dan diterapkan di lapisan ekstraksi), preferensi output
 * (mengatur tampilan hasil & ekspor), strip pratinjau (angka nyata sesi
 * ini — "—" sebelum ada). Logika AI/harga/kredit tidak berubah.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  UploadCloud, FileText, X, Zap, Brain, FolderOpen, PlusCircle,
  AlertTriangle, History, Trash2, RotateCcw, Lock,
  Settings2, Sparkles, Database, Check,
} from 'lucide-react';
import { DedAiMode, DedAiProjectType, DedEstimationPolicy, DedOutputPrefs, DEFAULT_DED_OUTPUT_PREFS } from './types';
import type { DedRabAiMode } from './dedMode';
import { DED_MODE_CARDS, resolveDedAiMode, withDedMode } from './dedModeUi';
import { probeDedPdf, resolvePageScope } from './parser';
import { useI18n } from '../../i18n/I18nContext';
import './dedAi.css';
import '../../ai-credits/ai-credits.css';
import { useCreditSimulation } from '../../ai-credits/useCreditSimulation';
import { tariffFor } from '../../ai-credits/config';
import { CreditBalance } from '../../ai-credits/components/CreditBalance';
import { CreditTopUpModal } from '../../ai-credits/components/CreditTopUpModal';
import { aiFeatureLockedMessage, planAllowsAiFeature } from '../../ai-credits/featureGate';

export interface DedAiFileItem {
  file: File;
  id: string;
  error?: string;
}

/** Ringkasan lari analisis terakhir pada sesi view ini (untuk strip pratinjau). */
export interface DedLastRunSummary {
  items: number;
  volumesIdentified: number;
  pricesNeedVerify: number;
}

export interface DedAiSession {
  files: DedAiFileItem[];
  description: string;
  projectName: string;
  projectType: DedAiProjectType;
  mode: DedAiMode;
  /**
   * DUAL MODE (§3, G-UI-1): mode kanonis sesi ini — SATU-SATUNYA pemilih
   * mode user-facing, tersimpan di STATE WORKFLOW (bukan hanya state UI).
   * `policy`/`fullAi` di bawah DITURUNKAN dari mode ini saat analisis
   * dimulai (policyForMode/engineForMode, C1) dan dipertahankan hanya
   * untuk kompatibilitas service + sesi/draft lama.
   */
  dedMode?: DedRabAiMode;
  /** Kebijakan harga — DITURUNKAN dari `dedMode` (C1); jangan diisi manual. */
  policy?: DedEstimationPolicy;
  /** null = buat proyek baru saat finalisasi; string = pakai proyek existing */
  targetProjectId: string | null;
  /** true = pipeline Full AI — DITURUNKAN dari `dedMode` (C1); jangan diisi manual. */
  fullAi?: boolean;
  /** Estimasi kredit simulasi yang disetujui user (kategori dipilih user). */
  creditEstimate?: { category: string; credits: number };
  /**
   * F-E2 (keputusan owner 2026-11-10): nilai kompleksitas MENTAH yang
   * dipilih user — diteruskan lewat session ke service agar kunci fitur
   * pada catatan usage sesuai pilihan user (bukan default). Tampilan
   * simulasi tidak berubah.
   */
  complexity?: 'simple' | 'medium' | 'complex';
  /** Cakupan dokumen (USULAN BARU ter-ACC 2026-11-10): semua halaman atau rentang pilihan. */
  pageScope?: { kind: 'ALL' } | { kind: 'SELECTED'; spec: string };
  /** Jumlah halaman nyata per berkas (id berkas → halaman), hasil probe di layar input. */
  filePageCounts?: Record<string, number>;
  /** Preferensi output (USULAN BARU ter-ACC 2026-11-10) — mengatur hasil & ekspor. */
  outputPrefs?: DedOutputPrefs;
}

interface Props {
  initialSession: DedAiSession;
  projects: Array<{ id: string; name: string }>;
  drafts: Array<{ id: string; createdAt: number; projectName: string; itemCount: number; grandTotal: number }>;
  onStart: (session: DedAiSession) => void;
  onLoadDraft: (id: string) => void;
  onDeleteDraft: (id: string) => void;
  /** Ringkasan analisis terakhir sesi ini untuk strip pratinjau (null = belum ada). */
  lastRunSummary?: DedLastRunSummary | null;
}

const MAX_FILE_MB = 25;
const MAX_FILES = 5;

const fmtSize = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/** Label kategori kompleksitas DED (dipilih user — bukan hasil deteksi AI). */
const COMPLEXITY_OPTIONS = [
  { value: 'simple' as const, label: 'Sederhana', desc: '1–2 lantai, denah simpel', tariffKey: 'ded-ai/simple' },
  { value: 'medium' as const, label: 'Menengah', desc: '2–3 lantai / ruko', tariffKey: 'ded-ai/medium' },
  { value: 'complex' as const, label: 'Kompleks', desc: 'Gedung / struktur khusus', tariffKey: 'ded-ai/complex' },
];
const complexityLabel = (v: string) => COMPLEXITY_OPTIONS.find((o) => o.value === v)?.label ?? v;

/** Hasil probe per berkas: jumlah halaman + karakter teks sampel (keterbacaan). */
type FileProbe = { pages: number; textChars: number } | 'error';

export const DedAiInputView: React.FC<Props> = ({
  initialSession, projects, drafts, onStart, onLoadDraft, onDeleteDraft, lastRunSummary,
}) => {
  const { t } = useI18n();
  const PROJECT_TYPE_OPTIONS: Array<{ value: DedAiProjectType; label: string }> = [
    { value: 'BANGUNAN', label: t('ai.ded.input.type_bangunan') },
    { value: 'GEDUNG', label: t('ai.ded.input.type_gedung') },
    { value: 'BANGUNAN AIR', label: t('ai.ded.input.type_bangunan_air') },
    { value: 'JALAN', label: t('ai.ded.input.type_jalan') },
    { value: 'PAVING', label: t('ai.ded.input.type_paving') },
    // Readiness WBS 2026-10-28: ditambahkan di AKHIR agar urutan & posisi
    // kelima opsi lama tidak bergeser bagi pengguna yang sudah terbiasa.
    { value: 'BENDUNGAN', label: t('ai.ded.input.type_bendungan') },
    { value: 'IRIGASI', label: t('ai.ded.input.type_irigasi') },
  ];
  const [files, setFiles] = useState<DedAiFileItem[]>(initialSession.files);
  const [description, setDescription] = useState(initialSession.description);
  const [projectName, setProjectName] = useState(initialSession.projectName);
  const [projectType, setProjectType] = useState<DedAiProjectType>(initialSession.projectType);
  const [mode, setMode] = useState<DedAiMode>(initialSession.mode);
  // DUAL MODE (§3, G-UI-1): SATU pemilih mode — dua kartu (EZRAB AI /
  // Full AI). Sesi lama tanpa dedMode dimigrasikan dari {policy, fullAi}
  // (mesin menang — modeFromLegacy); sesi baru membawa dedMode EZRAB_AI
  // dari view (default C2). Kedalaman (mode) tetap sub-pilihan terpisah.
  const [dedMode, setDedMode] = useState<DedRabAiMode>(() => resolveDedAiMode(initialSession));
  const [targetProjectId, setTargetProjectId] = useState<string | null>(initialSession.targetProjectId);
  const [useExisting, setUseExisting] = useState(initialSession.targetProjectId !== null);
  // Perbaikan final: sinkronkan prefill deskripsi dari entry DED yang tiba
  // setelah mount (hanya bila kolom masih kosong — tidak menimpa ketikan).
  useEffect(() => {
    if (initialSession.description && !description) {
      setDescription(initialSession.description);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSession.description]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // --- AI Credits (simulasi): kategori dipilih user, bukan dideteksi AI ---
  const [complexity, setComplexity] = useState<'simple' | 'medium' | 'complex'>('simple');
  const [creditApproved, setCreditApproved] = useState(false);
  const [creditTopUpOpen, setCreditTopUpOpen] = useState(false);
  const { balance, consume } = useCreditSimulation();
  // Gerbang paket (simulasi): DED AI tidak termasuk paket Free (fitur AI
  // Free hanya Chat AI — Keputusan Owner 2026-11-07 / Amendemen v1.2).
  const dedAllowed = planAllowsAiFeature(balance.plan, 'ded-ai');
  const dedEstimate = tariffFor(`ded-ai/${complexity}`);
  const dedTarget = dedEstimate.target ?? dedEstimate.max;

  // --- Cakupan dokumen & preferensi output (USULAN BARU ter-ACC) ---
  const [scopeKind, setScopeKind] = useState<'ALL' | 'SELECTED'>(
    initialSession.pageScope?.kind === 'SELECTED' ? 'SELECTED' : 'ALL',
  );
  const [scopeSpec, setScopeSpec] = useState(
    initialSession.pageScope?.kind === 'SELECTED' ? initialSession.pageScope.spec : '',
  );
  const [outputPrefs, setOutputPrefs] = useState<DedOutputPrefs>(
    initialSession.outputPrefs ?? DEFAULT_DED_OUTPUT_PREFS,
  );

  // --- Probe berkas: jumlah halaman + keterbacaan teks (keadaan nyata) ---
  const [fileProbe, setFileProbe] = useState<Record<string, FileProbe>>({});
  const probingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const item of files) {
      if (item.error || probingRef.current.has(item.id) || fileProbe[item.id] !== undefined) continue;
      probingRef.current.add(item.id);
      const target = item;
      target.file.arrayBuffer()
        .then((buf) => probeDedPdf(buf))
        .then((res) => {
          setFileProbe((prev) => ({
            ...prev,
            [target.id]: res ? { pages: res.pageCount, textChars: res.sampleTextChars } : 'error',
          }));
        })
        .catch(() => setFileProbe((prev) => ({ ...prev, [target.id]: 'error' as FileProbe })));
    }
    // fileProbe sengaja bukan dependensi: probe berjalan sekali per id berkas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const validateFile = (f: File): string | undefined => {
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    if (!isPdf) return t('ai.ded.input.err_pdf_only');
    if (f.size > MAX_FILE_MB * 1048576) return `${t('ai.ded.input.err_size_a')} ${MAX_FILE_MB} ${t('ai.ded.input.err_size_b')}`;
    if (f.size === 0) return t('ai.ded.input.err_empty');
    return undefined;
  };

  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list);
    setFiles((prev) => {
      const next = [...prev];
      for (const f of arr) {
        if (next.length >= MAX_FILES) break;
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        next.push({ file: f, id, error: validateFile(f) });
      }
      return next;
    });
  };

  // Ganti berkas pada barisnya (fungsi yang sama seperti mockup D6:
  // aksi ganti + hapus per berkas) — validasi identik dengan tambah berkas.
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceIdRef = useRef<string | null>(null);
  const startReplace = (id: string) => { replaceIdRef.current = id; replaceRef.current?.click(); };
  const onReplacePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    const id = replaceIdRef.current;
    replaceIdRef.current = null;
    if (!f || !id) return;
    setFiles((prev) => prev.map((x) => (x.id === id ? { file: f, id, error: validateFile(f) } : x)));
    setFileProbe((prev) => { const next = { ...prev }; delete next[id]; return next; });
    probingRef.current.delete(id);
  };

  const validFiles = files.filter((f) => !f.error);

  // Validasi cakupan halaman: sintaks rentang + (bila jumlah halaman sudah
  // terprobe) halaman terpilih harus ada di dalam dokumen.
  const knownCounts = validFiles
    .map((f) => fileProbe[f.id])
    .filter((p): p is { pages: number; textChars: number } => !!p && p !== 'error')
    .map((p) => p.pages);
  const scopeError = (() => {
    if (scopeKind !== 'SELECTED') return null;
    if (!scopeSpec.trim()) return 'Isi rentang halaman dulu, mis. 1-5, 8, 12.';
    const probe = resolvePageScope(scopeSpec, 100000);
    if (probe.invalid.length > 0) return `Format tidak dikenal: ${probe.invalid.join(', ')}`;
    if (probe.pages.length === 0) return 'Rentang halaman kosong.';
    if (knownCounts.length > 0 && knownCounts.every((c) => resolvePageScope(scopeSpec, c).pages.length === 0)) {
      return `Halaman terpilih di luar dokumen (dokumen terpanjang ${Math.max(...knownCounts)} halaman).`;
    }
    return null;
  })();

  const canStart = validFiles.length > 0 && !scopeError;

  const handleStart = () => {
    if (!canStart || !creditApproved || !dedAllowed) return;
    // --- AI Credits: catat pemakaian SIMULASI (batas target kategori) ---
    // SIMULASI SAJA (mockAdapter lokal, bukan backend/billing nyata):
    // nilai balik consume() — boolean "saldo simulasi cukup" — SENGAJA
    // diabaikan di sini; ia TIDAK menegakkan apa pun. Satu-satunya
    // gerbang yang berjalan sebelum titik ini adalah gerbang paket
    // simulasi (dedAllowed dari planAllowsAiFeature) di handleStart.
    // Keadaan ini tercatat sebagai WIRED_SIMULATION_PARTIAL untuk
    // ded-ai/simple|medium|complex di api/_lib/featureBillingMatrix.js
    // dan didokumentasikan di docs/architecture/DED_UNIFIED_CREDITS_SPRINT_4.md.
    consume('ded-ai', dedTarget, `DED AI (${complexityLabel(complexity)}): ${validFiles.length} dokumen`, {
      jobReference: `ded-${Date.now().toString(36)}`,
    });
    const chosenProjectId = useExisting ? targetProjectId : null;
    const name =
      projectName.trim() ||
      (chosenProjectId ? projects.find((p) => p.id === chosenProjectId)?.name || '' : '') ||
      validFiles[0].file.name.replace(/\.pdf$/i, '');
    const filePageCounts: Record<string, number> = {};
    for (const f of validFiles) {
      const p = fileProbe[f.id];
      if (p && p !== 'error') filePageCounts[f.id] = p.pages;
    }
    // DUAL MODE (§3): policy/fullAi DITURUNKAN dari kartu mode yang
    // dipilih — tidak ada state policy/mesin terpisah yang bisa basi
    // (ganti mode tidak membocorkan konfigurasi eksekusi lama).
    onStart(withDedMode({
      files: validFiles,
      description: description.trim(),
      projectName: name,
      projectType,
      mode,
      targetProjectId: chosenProjectId,
      creditEstimate: { category: complexityLabel(complexity), credits: dedTarget },
      // F-E2: sertakan nilai mentahnya juga (satu field aditif).
      complexity,
      pageScope: scopeKind === 'SELECTED' ? { kind: 'SELECTED', spec: scopeSpec.trim() } : { kind: 'ALL' },
      filePageCounts,
      outputPrefs,
    }, dedMode));
  };

  const complexityActive = COMPLEXITY_OPTIONS.find((o) => o.value === complexity);
  const probedPagesTotal = validFiles.reduce((acc, f) => {
    const p = fileProbe[f.id];
    return acc + (p && p !== 'error' ? p.pages : 0);
  }, 0);
  const allFilesProbed = validFiles.length > 0 && validFiles.every((f) => fileProbe[f.id] !== undefined);
  const stripDocs = validFiles.length === 0
    ? { v: '—', s: 'belum ada berkas' }
    : {
        v: allFilesProbed ? `${validFiles.length} dokumen · ${probedPagesTotal} halaman` : `${validFiles.length} dokumen`,
        s: allFilesProbed ? 'berkas terunggah sesi ini' : 'menghitung halaman…',
      };

  return (
    <div className="dedai dedai-input">
      <div className="dedai-input-layout">
        {/* ================= Kolom utama: upload + konfigurasi + pratinjau ================= */}
        <div className="dedai-input-main">
          {/* ---- Upload ---- */}
          <div className="dedai-card">
            <h2><span className="ico"><UploadCloud size={18} /></span> {t('ai.ded.input.card_doc_title')}</h2>
            <p className="sub">{t('ai.ded.input.card_doc_sub')}</p>
            <div
              className={`dedai-drop ${dragOver ? 'over' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
            >
              <div className="big-ico"><UploadCloud size={26} /></div>
              <p>{t('ai.ded.input.drop_text')}</p>
              <span>{t('ai.ded.input.drop_hint_a')} {MAX_FILES} {t('ai.ded.input.drop_hint_b')} {MAX_FILE_MB} {t('ai.ded.input.drop_hint_c')}</span>
              <br /><span className="fmt">PDF</span>
              <input
                ref={inputRef} type="file" accept=".pdf,application/pdf" multiple hidden
                onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }}
              />
            </div>
            <input
              ref={replaceRef} type="file" accept=".pdf,application/pdf" hidden
              onChange={onReplacePicked}
            />
            {files.length > 0 && (
              <div className="dedai-files">
                {files.map((f) => {
                  const probe = fileProbe[f.id];
                  return (
                    <div key={f.id} className={`dedai-file ${f.error ? 'err' : ''}`}>
                      <div className="f-ico"><FileText size={18} /></div>
                      <div className="f-info">
                        <div className="f-name">{f.file.name}</div>
                        <div className="f-meta">
                          {probe && probe !== 'error' ? `${probe.pages} halaman · ` : ''}{fmtSize(f.file.size)}
                        </div>
                        {f.error && <div className="f-err"><AlertTriangle size={13} /> {f.error}</div>}
                      </div>
                      {!f.error && probe && probe !== 'error' && (
                        probe.textChars > 0
                          ? <span className="f-tag ok">Teks terbaca · siap</span>
                          : <span className="f-tag warn">Tanpa teks — mungkin scan</span>
                      )}
                      {!f.error && probe === 'error' && <span className="f-tag warn">Tidak terprobe</span>}
                      <button className="f-act" onClick={() => startReplace(f.id)} title="Ganti berkas">
                        <RotateCcw size={14} />
                      </button>
                      <button className="f-del" onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} title={t('ai.ded.input.del_file')}>
                        <X size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="dedai-notice blue">
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{t('ai.ded.input.notice_a')} <b>{t('ai.ded.input.notice_b')}</b> {t('ai.ded.input.notice_c')}</span>
            </div>
          </div>

          {/* ---- Konfigurasi analisis kompak (mockup D6) ---- */}
          <div className="dedai-card dedai-cfgcard">
            {/* DUAL MODE (§3, G-UI-1): PERSIS DUA kartu mode — EZRAB AI
                (referensi AHSP) atau Full AI (mandiri). Kedalaman
                Cepat/Mendalam adalah sub-pilihan di bawahnya, berlaku
                untuk kedua mode (bukan mode ketiga). */}
            <div className="dedai-modesec">
              <div className="dedai-modesec-head">
                <span className="dedai-cfglbl">Mode Analisis</span>
                <span className="dedai-cfghint">Pilih satu — menentukan mesin &amp; sumber harga.</span>
              </div>
              <div className="dedai-modecards" role="radiogroup" aria-label="Mode analisis DED">
                {DED_MODE_CARDS.map((card) => {
                  const selected = dedMode === card.mode;
                  return (
                    <button
                      type="button"
                      key={card.mode}
                      role="radio"
                      aria-checked={selected}
                      className={`dedai-modecard ${card.accent}${selected ? ' selected' : ''}`}
                      onClick={() => setDedMode(card.mode)}
                    >
                      <span className="dedai-modecard-top">
                        <span className="dedai-modecard-ico">
                          {card.mode === 'EZRAB_AI' ? <Database size={17} /> : <Sparkles size={17} />}
                        </span>
                        <span className="dedai-modecard-title">{card.title}</span>
                        {selected && (
                          <span className="dedai-modecard-check" aria-hidden="true"><Check size={13} /></span>
                        )}
                      </span>
                      <span className="dedai-modecard-sub">{card.subtitle}</span>
                      <ul className="dedai-modecard-list">
                        {card.bullets.map((b) => <li key={b}>{b}</li>)}
                      </ul>
                      <span className="dedai-modecard-note">{card.note}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="dedai-cfgrow">
              <span className="dedai-cfglbl">Kedalaman</span>
              <div className="dedai-seg dedai-cfgseg">
                <button className={mode === 'FAST' ? 'active' : ''} onClick={() => setMode('FAST')}>
                  <Zap size={14} /> {t('ai.ded.input.mode_fast')}
                </button>
                <button className={mode === 'DETAIL' ? 'active' : ''} onClick={() => setMode('DETAIL')}>
                  <Brain size={14} /> {t('ai.ded.input.mode_deep')}
                </button>
              </div>
              <span className="dedai-cfghint">{mode === 'FAST' ? t('ai.ded.input.hint_mode_fast') : t('ai.ded.input.hint_mode_detail')}</span>
            </div>
            <div className={`dedai-cfgrow ${mode !== 'DETAIL' ? 'is-dim' : ''}`}>
              <span className="dedai-cfglbl">Kompleksitas</span>
              <div className="dedai-seg dedai-cfgseg" role="group" aria-label="Kompleksitas analisis DETAIL">
                {COMPLEXITY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={complexity === o.value ? 'active' : ''}
                    disabled={mode !== 'DETAIL' || !dedAllowed}
                    onClick={() => { setComplexity(o.value); setCreditApproved(false); }}
                    aria-pressed={complexity === o.value}
                    title={o.desc}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <span className="dedai-cfghint">
                {mode !== 'DETAIL'
                  ? 'Aktif pada mode DETAIL — menentukan estimasi kredit.'
                  : `${complexityActive?.desc ?? ''} · ±${(tariffFor(complexityActive?.tariffKey ?? 'ded-ai/simple').target ?? 0).toLocaleString('id-ID')} kredit`}
              </span>
            </div>
            <div className="dedai-cfgrow">
              <span className="dedai-cfglbl">Cakupan</span>
              <div className="dedai-seg dedai-cfgseg">
                <button className={scopeKind === 'ALL' ? 'active' : ''} onClick={() => setScopeKind('ALL')}>
                  Semua halaman
                </button>
                <button className={scopeKind === 'SELECTED' ? 'active' : ''} onClick={() => setScopeKind('SELECTED')}>
                  Halaman dipilih
                </button>
              </div>
              {scopeKind === 'SELECTED' ? (
                <span className="dedai-scopepick">
                  <input
                    type="text"
                    value={scopeSpec}
                    onChange={(e) => setScopeSpec(e.target.value)}
                    placeholder="mis. 1-5, 8, 12"
                    aria-label="Rentang halaman yang dianalisis"
                  />
                  {scopeError
                    ? <span className="dedai-scopeerr">{scopeError}</span>
                    : <span className="dedai-cfghint">Hanya halaman ini yang diteruskan ke analisis, per berkas.</span>}
                </span>
              ) : (
                <span className="dedai-cfghint">Seluruh halaman setiap berkas dianalisis.</span>
              )}
            </div>
            <div className="dedai-cfgrow last">
              <span className="dedai-cfglbl">Yang diekstrak</span>
              <span className="dedai-cfgtext">AI mengekstrak item pekerjaan, dimensi &amp; volume, serta konteks material dari dokumen untuk disusun menjadi draf RAB.</span>
            </div>
          </div>

          {/* ---- Strip pratinjau hasil: keadaan NYATA sesi ini ---- */}
          <div className="dedai-preview">
            <div className="dedai-preview-head">
              Pratinjau hasil <span>— keadaan sesi ini; terisi dari berkas &amp; analisis terakhir, bukan contoh</span>
            </div>
            <div className="dedai-preview-grid">
              <div className="pv">
                <div className="k">Dokumen terdeteksi</div>
                <div className={`v ${stripDocs.v === '—' ? 'empty' : ''}`}>{stripDocs.v}</div>
                <div className="s">{stripDocs.s}</div>
              </div>
              <div className="pv">
                <div className="k">Item pekerjaan</div>
                <div className={`v ${lastRunSummary ? '' : 'empty'}`}>{lastRunSummary ? lastRunSummary.items.toLocaleString('id-ID') : '—'}</div>
                <div className="s">{lastRunSummary ? 'dari analisis terakhir' : 'belum ada analisis'}</div>
              </div>
              <div className="pv">
                <div className="k">Volume teridentifikasi</div>
                <div className={`v ${lastRunSummary ? '' : 'empty'}`}>{lastRunSummary ? lastRunSummary.volumesIdentified.toLocaleString('id-ID') : '—'}</div>
                <div className="s">{lastRunSummary ? 'item bervolume, analisis terakhir' : 'belum ada analisis'}</div>
              </div>
              <div className="pv">
                <div className="k">Harga perlu verifikasi</div>
                <div className={`v ${lastRunSummary ? '' : 'empty'}`}>{lastRunSummary ? lastRunSummary.pricesNeedVerify.toLocaleString('id-ID') : '—'}</div>
                <div className="s">{lastRunSummary ? 'item analisis terakhir' : 'belum ada analisis'}</div>
              </div>
            </div>
          </div>

          {/* ---- Draft tersimpan ---- */}
          {drafts.length > 0 && (
            <div className="dedai-card">
              <h2><span className="ico"><History size={18} /></span> {t('ai.ded.input.drafts_title')}</h2>
              <p className="sub">{t('ai.ded.input.drafts_sub')}</p>
              <div className="dedai-drafts">
                {drafts.map((d) => (
                  <div key={d.id} className="dedai-draft">
                    <div className="d-info">
                      <div className="d-name">{d.projectName}</div>
                      <div className="d-meta">
                        {new Date(d.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {d.itemCount} item
                      </div>
                    </div>
                    <button className="dedai-icon-btn" onClick={() => onLoadDraft(d.id)} title={t('ai.ded.input.open_draft')}>
                      <RotateCcw size={14} />
                    </button>
                    <button className="dedai-icon-btn" onClick={() => onDeleteDraft(d.id)} title={t('ai.ded.input.del_draft')}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ================= Panel Pengaturan (pinggir kanan) ================= */}
        <aside className="dedai-settings" aria-label="Pengaturan DED">
          <div className="dedai-settings-scroll">
            <div className="dedai-settings-head">
              <h2><span className="ico"><Settings2 size={18} /></span> Pengaturan</h2>
              <p>Atur sekali sebelum analisis dimulai</p>
            </div>

            {/* DUAL MODE (§3, G-UI-1): seksi Kebijakan Harga lama DIHAPUS —
                kebijakan harga kini diturunkan dari kartu mode di kolom
                tengah (EZRAB AI → Database EZRAB, Full AI → estimasi AI);
                catatan keterbukaannya pindah ke kartu masing-masing. */}

            {/* ---- Simpan hasil ke: proyek baru / existing ---- */}
            <section className="dedai-set-sec">
              <h3><FolderOpen size={14} /> Simpan Hasil Ke</h3>
              <div className="dedai-seg" style={{ marginBottom: 16 }}>
                <button className={!useExisting ? 'active' : ''} onClick={() => setUseExisting(false)}>
                  <PlusCircle size={15} /> {t('ai.ded.input.seg_new')}
                </button>
                <button className={useExisting ? 'active' : ''} onClick={() => setUseExisting(true)} disabled={projects.length === 0}>
                  <FolderOpen size={15} /> {t('ai.ded.input.seg_existing')}
                </button>
              </div>
              {useExisting ? (
                <div className="dedai-field">
                  <label>{t('ai.ded.input.label_pick_project')}</label>
                  <select value={targetProjectId || ''} onChange={(e) => setTargetProjectId(e.target.value || null)}>
                    <option value="">{t('ai.ded.input.opt_pick')}</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {projects.length === 0 && <div className="hint">{t('ai.ded.input.hint_no_projects')}</div>}
                </div>
              ) : (
                <div className="dedai-field">
                  <label>{t('ai.ded.input.label_new_name')}</label>
                  <input
                    type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)}
                    placeholder={t('ai.ded.input.name_ph')}
                  />
                  <div className="hint">{t('ai.ded.input.hint_name_auto')}</div>
                </div>
              )}
            </section>

            {/* ---- Jenis proyek ---- */}
            <section className="dedai-set-sec">
              <h3>{t('ai.ded.input.label_type')}</h3>
              <div className="dedai-chips">
                {PROJECT_TYPE_OPTIONS.map((o) => (
                  <button key={o.value} className={`dedai-chip ${projectType === o.value ? 'active' : ''}`} onClick={() => setProjectType(o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </section>

            {/* ---- Preferensi Output (USULAN BARU ter-ACC): mengatur hasil ---- */}
            <section className="dedai-set-sec">
              <h3>Preferensi Output</h3>
              <p className="dedai-set-sub">Mengatur bagian yang tampil pada hasil &amp; ekspor Excel. Peringatan harga dan status item tetap selalu tampil.</p>
              <div className="dedai-prefs">
                <label>
                  <input
                    type="checkbox"
                    checked={outputPrefs.detailRab}
                    onChange={(e) => setOutputPrefs((p) => ({ ...p, detailRab: e.target.checked }))}
                  />
                  <span>Detail RAB</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={outputPrefs.volume}
                    onChange={(e) => setOutputPrefs((p) => ({ ...p, volume: e.target.checked }))}
                  />
                  <span>Volume pekerjaan</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={outputPrefs.priceAnalysis}
                    onChange={(e) => setOutputPrefs((p) => ({ ...p, priceAnalysis: e.target.checked }))}
                  />
                  <span>Analisis harga &amp; asal-usul harga</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={outputPrefs.unresolvedReport}
                    onChange={(e) => setOutputPrefs((p) => ({ ...p, unresolvedReport: e.target.checked }))}
                  />
                  <span>Laporan item tak teresolusi</span>
                </label>
              </div>
            </section>

            {/* ---- Estimasi Kredit AI (simulasi) ---- */}
            <section className="dedai-set-sec">
              <h3><Zap size={14} /> Kompleksitas & Estimasi Kredit</h3>
              <p className="dedai-set-sub">
                Kategori kompleksitas dipilih pada kartu Konfigurasi Analisis di tengah (mode DETAIL) — pilihan Anda, bukan deteksi otomatis. Angka berikut simulasi frontend.
              </p>
              {!dedAllowed && (
                <div
                  role="alert"
                  style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    background: '#FDF2F2', border: '1px solid #F3C2C2', color: '#8A2A2A',
                    borderRadius: 10, padding: '12px 14px', marginBottom: 12,
                    fontSize: 13.5, lineHeight: 1.55,
                  }}
                >
                  <Lock size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{aiFeatureLockedMessage(balance.plan, 'ded-ai')}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <CreditBalance compact showTopUp={false} />
                <span style={{ fontSize: 12, color: 'var(--ez-color-text-faint)' }}>saldo simulasi</span>
              </div>
              <div className="aic-estimate" style={{ marginBottom: 10 }}>
                <span>Estimasi pemakaian: <strong>{dedTarget.toLocaleString('id-ID')} kredit</strong> (maksimum simulasi)</span>
                <span className="aic-sim">simulasi</span>
              </div>
              {balance.total < dedTarget && (
                <div className="aic-low-notice" style={{ marginBottom: 10 }}>
                  <AlertTriangle size={16} />
                  <span>Saldo simulasi ({balance.total.toLocaleString('id-ID')}) di bawah estimasi. Anda tetap bisa lanjut setelah menyetujui, atau top-up dulu.</span>
                  <button type="button" onClick={() => setCreditTopUpOpen(true)}>Top-up</button>
                </div>
              )}
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer', lineHeight: 1.5 }}>
                <input
                  type="checkbox"
                  checked={creditApproved}
                  disabled={!dedAllowed}
                  onChange={(e) => setCreditApproved(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  Saya menyetujui estimasi <strong>{dedTarget.toLocaleString('id-ID')} kredit (simulasi)</strong> untuk
                  analisis DED kategori <strong>{complexityLabel(complexity)}</strong>. Saya paham angka ini
                  simulasi frontend, bukan penagihan nyata.
                </span>
              </label>
            </section>

            {/* ---- Deskripsi proyek (opsional) ---- */}
            <section className="dedai-set-sec">
              <h3><FileText size={14} /> {t('ai.ded.input.card_desc_title')} <span style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--ez-color-text-muted)' }}>{t('ai.ded.input.card_desc_optional')}</span></h3>
              <p className="dedai-set-sub">{t('ai.ded.input.card_desc_sub')}</p>
              <div className="dedai-field">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('ai.ded.input.desc_ph')}
                />
              </div>
            </section>
          </div>

          {/* ---- CTA utama menempel di bawah panel (mockup ter-ACC) ---- */}
          <div className="dedai-settings-foot">
            {validFiles.length > 0 && (
              <div className="dedai-settings-meta">
                {validFiles.length} file terpilih · mode dan detail proyek bisa diubah sebelum analisis dimulai.
              </div>
            )}
            <div className="dedai-cta">
              <button className="dedai-btn primary" disabled={!canStart || !creditApproved || !dedAllowed} onClick={handleStart}>
                <Sparkles size={17} /> {t('ai.ded.input.cta')}
                {!canStart && <small className="dedai-cta-sub">— unggah berkas valid dulu</small>}
              </button>
            </div>
            {!canStart && !scopeError && (
              <p className="dedai-settings-hint">
                {t('ai.ded.input.cta_hint')}
              </p>
            )}
            {canStart && !creditApproved && (
              <p className="dedai-settings-hint">
                Centang persetujuan estimasi kredit di atas untuk memulai analisis.
              </p>
            )}
            <p className="dedai-settings-hint">
              Estimasi dapat ditinjau dan divalidasi sebelum disimpan ke proyek.
            </p>
          </div>
        </aside>
      </div>
      {creditTopUpOpen && <CreditTopUpModal onClose={() => setCreditTopUpOpen(false)} />}
    </div>
  );
};

export default DedAiInputView;
