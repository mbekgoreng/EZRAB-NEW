/**
 * DED-AI Estimate — Tampilan 1: INPUT.
 * Upload multi-file (drag & drop) + deskripsi proyek + pilihan proyek + tipe + mode AI.
 *
 * LAYOUT v4 "CIAMIK" (2026-11-20, ACC owner 01:53 — menggantikan
 * tampilan mockup 2026-11-19): SATU kolom terpusat 880px (.mk4-col),
 * alur vertikal — stepper ramping di dalam kolom (garis tipis + 3
 * titik, menggantikan stepper balok shell di layar input; stepper
 * shell kembali penuh saat analisis/hasil), lalu Kartu 1. Dokumen DED
 * (dropzone lega + daftar berkas nama utuh tanpa potong), Kartu 2.
 * Penyimpanan Proyek (segmen Proyek Baru/Existing + field nama
 * opsional), Kartu 3. Konfigurasi Analisis (dua kartu mode TANPA
 * chevron + catatan keterbukaan mode terpilih + baris Kedalaman),
 * collapsible "Pengaturan lanjutan" tertutup default (Kompleksitas +
 * Cakupan + Jenis Proyek + Deskripsi + Preferensi Output satu kolom),
 * kartu estimasi lega (baris estimasi 1 baris + persetujuan singkat
 * + teks lengkap di balik "Selengkapnya"), catatan ekspektasi jujur
 * verbatim, tombol Mulai Analisis DED lebar penuh 52px, dan daftar
 * Draft tersimpan baris ramping di bawah. Judul + subtitle + pill
 * kredit disediakan shell halaman (FeaturePageShell); subtitle
 * dipulihkan khusus halaman ini lewat pengecualian per-halaman di
 * feature-page-shell.css (aturan kompresi global layar pendek tetap
 * berlaku untuk menu lain). Semua state, handler, dan gerbang kredit
 * TIDAK berubah dari tampilan sebelumnya. Kelas baru hanya .mk4-*
 * (lihat blok V4 CIAMIK di dedAi.css); kelas .dedai-mk-sec-h,
 * .dedai-mk-pick, dan .dedai-mk-start dipakai ulang dari blok
 * REBUILD. v4 TIDAK muat satu layar di desktop mana pun (keputusan
 * desain yang disetujui owner: rapi + lega diutamakan, satu scroll
 * kolom yang bersih diterima).
 *
 * DUAL MODE (§3 directive, 2026-11-13): pemilih mode adalah PERSIS DUA
 * kartu — EZRAB AI MODE (referensi AHSP) atau FULL AI MODE (mandiri).
 * Kedalaman Cepat/Mendalam tetap sebagai sub-pilihan di kedua mode.
 * Policy/fullAi di level service TETAP ADA (backward compat) dan
 * diturunkan dari mode yang dipilih.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UploadCloud, FileText, X, Zap, Brain, FolderOpen, PlusCircle,
  AlertTriangle, Trash2, RotateCcw, Lock, Info,
  Settings2, Sparkles, Database, Check, ChevronDown,
  // v4 CIAMIK 2026-11-20: SlidersHorizontal (ikon ringkasan
  // "Pengaturan lanjutan"). History, PenLine, ListChecks, Package,
  // ChartColumn tidak lagi dipakai (ringkasan draf tanpa ikon;
  // kartu hasil layar input dihapus).
  SlidersHorizontal,
} from 'lucide-react';
import { DedAiMode, DedAiProjectType, DedEstimationPolicy, DedOutputPrefs, DEFAULT_DED_OUTPUT_PREFS } from './types';
import type { DedRabAiMode } from './dedMode';
import { DED_MODE_CARDS, resolveDedAiMode } from './dedModeUi';
import { buildDedAiSession } from './dedSessionBuilder';
import { peekDedAutorun } from '../ezrab-ai/dedDocSessionHolder';
import { savePersistedDedMode } from './dedModePersistence';
import { probeDedPdf, resolvePageScope } from './parser';
import { useI18n } from '../../i18n/I18nContext';
import './dedAi.css';
import '../../ai-credits/ai-credits.css';
import { useCreditSimulation } from '../../ai-credits/useCreditSimulation';
import { tariffFor } from '../../ai-credits/config';
import { CreditTopUpModal } from '../../ai-credits/components/CreditTopUpModal';
import { aiFeatureLockedMessage, planAllowsAiFeature } from '../../ai-credits/featureGate';

export interface DedAiFileItem {
  file: File;
  id: string;
  error?: string;
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
  /**
   * Publish draft sesi (2026-11-17, perintah chat "jalankan analisis
   * DED"): dipanggil setiap kali draft berubah (berkas ditambah /
   * dihapus / diganti, field form berubah) dengan sesi hasil builder
   * yang SAMA dengan yang dipakai onStart; dipanggil dengan null bila
   * draft kosong (tidak ada berkas valid). HANYA memberi tahu —
   * TIDAK memulai analisis. Opsional: tanpa prop ini tidak ada
   * publish (perilaku lama).
   */
  onSessionChange?: (draft: DedAiSession | null) => void;
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
  initialSession, projects, drafts, onStart, onLoadDraft, onDeleteDraft,
  onSessionChange,
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
  // D-45 (Batch E): pilihan mode dipersist ke localStorage
  // (`ezrab_dedai_mode`) — sesi baru sesudah reload memakai mode
  // terakhir yang dipilih, bukan selalu default EZRAB AI. Tepat dua
  // mode tetap berlaku; nilai divalidasi di lapisan persistensi.
  const changeDedMode = (next: DedRabAiMode) => {
    setDedMode(next);
    savePersistedDedMode(next);
  };
  // Rebuild mockup 2026-11-19 (K9, ACC owner): chevron expand kartu mode
  // DIHAPUS — mockup tidak punya chevron. Penjelasan mode (bullets)
  // tidak lagi dirender; catatan keterbukaan mode terpilih TETAP
  // dirender sebagai baris statis di bawah kartu (dipin F-1/F-2
  // dedDocViewportFit + E-2 dedPremiumOneScreen) — state expand
  // kartu ikut dihapus.
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
  // v4 CIAMIK 2026-11-20: teks persetujuan LENGKAP verbatim hanya
  // tampil di balik tombol "Selengkapnya" (label singkat di baris
  // persetujuan); state ini murni tampilan, tidak mengubah gerbang.
  const [showConsentFull, setShowConsentFull] = useState(false);
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

  // Memo: identitas stabil kecuali `files` berubah — buildSession di
  // bawah memakai daftar ini sebagai dependensi (tanpa memo, identitas
  // baru tiap render membuat efek publish jalan tiap render).
  const validFiles = useMemo(() => files.filter((f) => !f.error), [files]);

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

  // Perakitan sesi BERSAMA (2026-11-17): dipakai handleStart DAN
  // publish draft di bawah — kedua jalur tidak bisa melenceng.
  // Logika perakitan hidup di dedSessionBuilder (murni, teruji);
  // di sini hanya memasok keadaan layar input saat ini.
  const buildSession = useCallback(
    (): DedAiSession =>
      buildDedAiSession({
        files: validFiles,
        description,
        projectName,
        projectType,
        mode,
        dedMode,
        useExisting,
        targetProjectId,
        projects,
        complexity,
        complexityLabel: complexityLabel(complexity),
        creditTarget: dedTarget,
        scopeKind,
        scopeSpec,
        fileProbes: fileProbe,
        outputPrefs,
      }),
    [
      validFiles, description, projectName, projectType, mode, dedMode,
      useExisting, targetProjectId, projects, complexity, dedTarget,
      scopeKind, scopeSpec, fileProbe, outputPrefs,
    ],
  );

  // Publish draft sesi ke induk (perintah chat "jalankan analisis
  // DED", 2026-11-17): setiap perubahan draft diteruskan lewat
  // onSessionChange; draft kosong (tidak ada berkas valid) = null.
  // HANYA memberi tahu — tidak memulai analisis.
  // Pengecualian: saat sinyal autorun TERTUNDA, JANGAN sentuh holder
  // — view induk akan mengonsumsi sesi holder saat mount, dan
  // publish di sini (efek anak jalan SEBELUM efek induk) akan
  // menimpa/menghapus sesi yang diperintahkan chat. Cek sinyal (bukan
  // ref "sudah mount") karena StrictMode menjalankan efek dua kali
  // di dev — ref akan lolos pada pemanggilan kedua.
  useEffect(() => {
    if (!onSessionChange) return;
    if (peekDedAutorun()) return;
    onSessionChange(validFiles.length > 0 ? buildSession() : null);
  }, [buildSession, onSessionChange, validFiles.length]);

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
    onStart(buildSession());
  };

  const complexityActive = COMPLEXITY_OPTIONS.find((o) => o.value === complexity);

  return (
    <div className="dedai dedai-input">
      <div className="dedai-input-layout">
        <div className="mk4-col">
          {/* ===== v4: stepper ramping di dalam kolom (menggantikan
              stepper balok shell di layar input — view.tsx tidak
              meneruskan steps ke shell saat screen input; stepper
              shell kembali penuh saat analisis/hasil). ===== */}
          <nav className="mk4-stepper" aria-label="Langkah analisis DED">
            <span className="mk4-step on"><span className="mk4-dot" /><span className="mk4-step-lbl">{t('ai.ded.input.step_1')}</span></span>
            <span className="mk4-line" />
            <span className="mk4-step"><span className="mk4-dot" /><span className="mk4-step-lbl">{t('ai.ded.input.step_2')}</span></span>
            <span className="mk4-line" />
            <span className="mk4-step"><span className="mk4-dot" /><span className="mk4-step-lbl">{t('ai.ded.input.step_3')}</span></span>
          </nav>
          {/* ===== v4 KARTU 1: Dokumen DED ===== */}
          <section className="mk4-card">
            <h2 className="dedai-mk-sec-h">
              <span className="ic"><FileText size={17} /></span>
              <span className="n">1.</span> {t('ai.ded.input.card_doc_title')}
              {/* Catatan scan: tombol info + span sr-only (teks lengkap
                  notice_a/b/c) — dipertahankan dari one-screen. */}
              <button
                type="button"
                className="dedai-os-info"
                title={`${t('ai.ded.input.notice_a')} ${t('ai.ded.input.notice_b')} ${t('ai.ded.input.notice_c')}`}
                aria-describedby="dedai-scan-note"
                aria-label="Catatan tentang PDF hasil scan"
              >
                <Info size={15} />
              </button>
              <span
                id="dedai-scan-note"
                className="dedai-os-sr-only"
                style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}
              >
                {t('ai.ded.input.notice_a')} {t('ai.ded.input.notice_b')} {t('ai.ded.input.notice_c')}
              </span>
            </h2>
            {/* Dropzone selalu tampil penuh meski berkas ada. Teks
                judul + hint mengikuti mockup (kamus drop_text /
                drop_hint_drag); tombol "Pilih File" membuka pemilih
                yang sama dengan klik dropzone. */}
            <div
              className={`dedai-drop${dragOver ? ' over' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
            >
              <div className="big-ico"><UploadCloud size={26} /></div>
              <p>{t('ai.ded.input.drop_text')}</p>
              <span>{t('ai.ded.input.drop_hint_drag')} · {t('ai.ded.input.drop_hint_a')} {MAX_FILES} {t('ai.ded.input.drop_hint_b')} {MAX_FILE_MB} {t('ai.ded.input.drop_hint_c')}</span>
              <button type="button" className="dedai-mk-pick" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
                <FolderOpen size={14} /> {t('ai.ded.input.pick_file')}
              </button>
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
                      {/* K15 (ACC): tag probe + tombol Ganti dipertahankan
                          (mockup hanya badge "Valid" — tag probe adalah
                          informasi kejujuran: membedakan PDF berteks vs
                          hasil scan). */}
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
          </section>
          {/* ===== v4 KARTU 2: Penyimpanan Proyek ===== */}
          <section className="mk4-card">
            <h2 className="dedai-mk-sec-h"><span className="n">2.</span> Penyimpanan Proyek</h2>
            <div className="dedai-seg">
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
              /* K7 (ACC): Nama Proyek tetap OPSIONAL + hint nama-otomatis
                 (mockup menandai wajib "*" — itu perubahan perilaku,
                 tidak diambil). */
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
          {/* ===== v4 KARTU 3: Konfigurasi Analisis ===== */}
          <section className="mk4-card">
            <h2 className="dedai-mk-sec-h"><span className="ic"><Settings2 size={17} /></span><span className="n">3.</span> Konfigurasi Analisis</h2>
            {/* DUAL MODE (§3, G-UI-1): PERSIS DUA kartu mode — EZRAB AI
                (referensi AHSP) atau Full AI (mandiri). K9 (ACC):
                chevron expand DIHAPUS; klik badan kartu memilih mode.
                Kebijakan Harga tetap tidak ada sebagai seksi —
                kebijakan harga diturunkan dari kartu mode terpilih
                (catatan keterbukaan per-kartu). */}
            <div className="dedai-modecards dedai-v23-modecards" role="radiogroup" aria-label="Mode analisis DED">
              {DED_MODE_CARDS.map((card) => {
                const selected = dedMode === card.mode;
                return (
                  <div
                    key={card.mode}
                    role="radio"
                    aria-checked={selected}
                    tabIndex={0}
                    className={`dedai-modecard ${card.accent}${selected ? ' selected' : ''}`}
                    onClick={() => changeDedMode(card.mode)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); changeDedMode(card.mode); }
                    }}
                  >
                    <span className="dedai-modecard-top">
                      <span className="dedai-modecard-ico">
                        {card.mode === 'EZRAB_AI' ? <Database size={17} /> : <Sparkles size={17} />}
                      </span>
                      <span className="dedai-v23-modecard-text">
                        <span className="dedai-modecard-title">{card.title}</span>
                        <span className="dedai-modecard-sub" title={card.subtitle}>{card.subtitle}</span>
                      </span>
                      {selected && (
                        <span className="dedai-modecard-check" aria-hidden="true"><Check size={13} /></span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Catatan keterbukaan mode terpilih (K9): chevron hilang,
                tapi catatan hukum/provenance HARUS tetap terlihat —
                dirender statis di bawah kartu (bukan di dalam detail
                expand). Bullets penjelasan mode tidak lagi dirender
                (bukan pengungkapan). Dipin F-1/F-2 dedDocViewportFit
                + E-2 dedPremiumOneScreen + (a) dedOneScreenBehavior. */}
            {DED_MODE_CARDS.filter((card) => card.mode === dedMode).map((card) => (
              <p key={card.mode} className="dedai-modecard-note mk4-modenote">{card.note}</p>
            ))}
            {/* Kedalaman: label singkat 1 baris + segmen + hint di
                baris sendiri — label panjang lama melipat di kolom
                sempit. */}
            <div className="mk4-depth">
              <div className="mk4-depth-row">
                <span className="mk4-depth-lbl">Kedalaman</span>
                <div className="dedai-seg dedai-cfgseg">
                  <button className={mode === 'FAST' ? 'active' : ''} onClick={() => setMode('FAST')}>
                    <Zap size={14} /> {t('ai.ded.input.mode_fast')}
                  </button>
                  <button className={mode === 'DETAIL' ? 'active' : ''} onClick={() => setMode('DETAIL')}>
                    <Brain size={14} /> {t('ai.ded.input.mode_deep')}
                  </button>
                </div>
              </div>
              <p className="mk4-depth-hint">{mode === 'FAST' ? t('ai.ded.input.hint_mode_fast') : t('ai.ded.input.hint_mode_detail')}</p>
            </div>
          </section>
          {/* ===== v4: Pengaturan lanjutan (SATU collapsible, tertutup default) ===== */}
          <details className="mk4-card mk4-adv">
            <summary>
              <SlidersHorizontal size={16} />
              <span className="mk4-adv-t">Pengaturan lanjutan</span>
              <span className="mk4-adv-s">Kompleksitas · Cakupan · Jenis proyek · Deskripsi · Preferensi output</span>
              <ChevronDown size={16} className="cv" />
            </summary>
            <div className="mk4-adv-body">
              <div className="mk4-adv-col">
                <div className="dedai-v23-cfg">
                  {/* K8 (ACC): Kompleksitas tetap DINONAKTIFKAN di luar
                      DETAIL (mockup menampilkannya aktif — itu perubahan
                      perilaku, tidak diambil). */}
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
                    <span className="dedai-cfglbl">Cakupan Halaman</span>
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
                    <span className="dedai-cfglbl">{t('ai.ded.input.label_type')}</span>
                    <div className="dedai-chips">
                      {PROJECT_TYPE_OPTIONS.map((o) => (
                        <button key={o.value} className={`dedai-chip ${projectType === o.value ? 'active' : ''}`} onClick={() => setProjectType(o.value)}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mk4-adv-col">
                <h3 className="mk4-adv-h">{t('ai.ded.input.card_desc_title')} <span className="opt">{t('ai.ded.input.card_desc_optional')}</span></h3>
                <div className="db">
                  <p className="dedai-set-sub">{t('ai.ded.input.card_desc_sub')}</p>
                  <div className="dedai-field">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('ai.ded.input.desc_ph')}
                    />
                  </div>
                  <p className="ph">Preferensi Output</p>
                  <p className="ps">Mengatur bagian yang tampil pada hasil &amp; ekspor Excel. Peringatan harga dan status item tetap selalu tampil.</p>
                  <div className="dedai-prefs dedai-os-prefs2">
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
                </div>
              </div>
            </div>
          </details>
          {/* ---- Kredit: gerbang paket + saldo rendah (di atas kartu
              estimasi — keduanya kondisional, tidak ada di replika
              yang mengasumsikan paket diizinkan + saldo cukup). ---- */}
          {!dedAllowed && (
            <div
              role="alert"
              style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                background: 'var(--ez-color-danger-soft)', border: '1px solid var(--ez-color-danger-soft)', color: 'var(--ez-color-danger)',
                borderRadius: 10, padding: '12px 14px',
                fontSize: 13.5, lineHeight: 1.55,
              }}
            >
              <Lock size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{aiFeatureLockedMessage(balance.plan, 'ded-ai')}</span>
            </div>
          )}
          {balance.total < dedTarget && (
            <div className="aic-low-notice">
              <AlertTriangle size={16} />
              <span>Saldo simulasi ({balance.total.toLocaleString('id-ID')}) di bawah estimasi. Anda tetap bisa lanjut setelah menyetujui, atau top-up dulu.</span>
              <button type="button" onClick={() => setCreditTopUpOpen(true)}>Top-up</button>
            </div>
          )}
          {/* ---- v4: Estimasi + persetujuan (kartu sendiri, lega) ----
              K5/K6 (ACC): frasa "(maksimum simulasi)" + badge "simulasi"
              + teks persetujuan LENGKAP verbatim di balik
              "Selengkapnya" (label singkat di baris persetujuan). */}
          <section className="mk4-card mk4-est">
            <div className="mk4-est-row">
              <Zap size={15} /> Estimasi Kredit <b>± {dedTarget.toLocaleString('id-ID')} kredit</b>
              <span className="aic-estimate">
                <span>(maksimum simulasi)</span>
                <span className="aic-sim">simulasi</span>
              </span>
            </div>
            <div className="mk4-consent-row">
              <label className="mk4-consent">
                <input
                  type="checkbox"
                  checked={creditApproved}
                  disabled={!dedAllowed}
                  onChange={(e) => setCreditApproved(e.target.checked)}
                />
                <span>Saya menyetujui estimasi ini (simulasi)</span>
              </label>
              <button type="button" className="mk4-more" onClick={() => setShowConsentFull((v) => !v)} aria-expanded={showConsentFull}>
                {showConsentFull ? 'Sembunyikan' : 'Selengkapnya'}
              </button>
            </div>
            {showConsentFull && (
              <p className="mk4-fulltext">
                Saya menyetujui estimasi <strong>{dedTarget.toLocaleString('id-ID')} kredit (simulasi)</strong> untuk
                analisis DED kategori <strong>{complexityLabel(complexity)}</strong>. Saya paham angka ini
                simulasi frontend, bukan penagihan nyata.
              </p>
            )}
          </section>
          {/* Ekspektasi jujur (K1): teks VERBATIM, tidak diubah — tanpa
              prefiks label tebal (replika v4 hanya kalimat + ikon Info). */}
          <p className="mk4-expect">
            <Info size={15} />
            <span>DED membaca lapisan teks PDF. Dimensi yang hanya hidup di garis gambar tidak bisa di-take-off — kuantitas dari situ adalah perkiraan dan ditandai "Klaim" di layar hasil.</span>
          </p>
          {/* Tombol besar lebar penuh kolom (v4). Sub-teks validasi inline
              tidak muat di tombol — alasannya di atribut title (kunci
              cta_hint). */}
          <button
            className="dedai-btn primary dedai-mk-start"
            disabled={!canStart || !creditApproved || !dedAllowed}
            onClick={handleStart}
            title={!canStart ? t('ai.ded.input.cta_hint') : undefined}
          >
            <Sparkles size={17} /> {t('ai.ded.input.cta')} →
          </button>
          {/* ---- Draft tersimpan (baris ramping, tertutup default) ----
              Tombol muat + hapus per draf dipertahankan (bukan hanya
              tautan "Lanjutkan" seperti replika — replika tidak
              memodelkan penghapusan). */}
          {drafts.length > 0 && (
            <details className="mk4-drafts">
              <summary>
                <span className="mk4-adv-t">{t('ai.ded.input.drafts_title')}</span>
                <span className="mk4-adv-s">{drafts.length} draft</span>
                <ChevronDown size={15} className="cv" />
              </summary>
              <div className="mk4-drafts-body">
                {drafts.map((d) => (
                  <div key={d.id} className="mk4-draft">
                    <span className="mk4-draft-n">{d.projectName}</span>
                    <span className="mk4-draft-m">
                      {new Date(d.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {d.itemCount} item
                    </span>
                    <button className="dedai-icon-btn" onClick={() => onLoadDraft(d.id)} title={t('ai.ded.input.open_draft')}>
                      <RotateCcw size={14} />
                    </button>
                    <button className="dedai-icon-btn" onClick={() => onDeleteDraft(d.id)} title={t('ai.ded.input.del_draft')}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
      {creditTopUpOpen && <CreditTopUpModal onClose={() => setCreditTopUpOpen(false)} />}
    </div>
  );
};

export default DedAiInputView;
