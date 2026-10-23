/**
 * AI DOCUMENT STUDIO — Panel "Sempurnakan Teks (AI)" (Enhance Text, polish §5).
 *
 * Bekerja pada RENTANG teks yang dipilih pengguna di editor:
 * - Pengguna menyorot teks, menekan "Ambil Teks Terpilih dari Editor",
 *   memilih satu dari 10 transformasi (atau instruksi bebas), dan AI
 *   (intent ENHANCE_TEXT, mode ENHANCE) mengembalikan KANDIDAT rentang.
 * - Kandidat TIDAK pernah langsung diterapkan: pratinjau menampilkan teks
 *   asli vs hasil; dokumen berubah hanya lewat tombol Terapkan, dan
 *   pemanggil (DocCreator) men-snapshot versi 'enhance' sebelum menimpa.
 * - Terapkan memvalidasi rentang: teks pada rentang tersimpan harus masih
 *   sama dengan teks saat diambil; bila dokumen sudah berubah, penerapan
 *   dibatalkan dengan pesan jujur — tidak ada penimpaan sembarangan.
 * - Tidak ada pemanggilan AI otomatis saat kursor/render berubah; AI hanya
 *   berjalan saat tombol transformasi (atau Coba Lagi) ditekan.
 * - Error provider ditampilkan apa adanya (errorCode: message) dan teks
 *   asli tidak berubah.
 */
import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, Wand2, Check, X, RefreshCw, AlertTriangle } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { documentStudioOrchestrator } from '../orchestrator';
import { MAX_ENHANCE_SELECTION_CHARS } from '../service';
import type { EnhanceTransform } from '../types';
import type { DraftRecord } from '../view';
import { ENHANCE_ACTIONS, rangeTextStillMatches, selectionBlockReason } from './enhanceActions';

interface CapturedSelection {
  text: string;
  from: number;
  to: number;
}

interface EnhanceCandidate {
  text: string;
  transform: EnhanceTransform;
  label: string;
}

interface RunParams {
  transform: EnhanceTransform;
  instruction: string;
}

export const DocEnhance: React.FC<{
  draft: DraftRecord;
  getEditor: () => Editor | null;
  /** Terapkan kandidat ke rentang: pemanggil men-snapshot versi 'enhance'
      SEBELUM mengganti rentang di editor, lalu persist draf. */
  onApplyEnhance: (
    range: { from: number; to: number },
    candidateText: string,
    note: string,
  ) => Promise<void>;
}> = ({ draft, getEditor, onApplyEnhance }) => {
  const [captured, setCaptured] = useState<CapturedSelection | null>(null);
  const [captureNote, setCaptureNote] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [busyTransform, setBusyTransform] = useState<EnhanceTransform | null>(null);
  const [candidate, setCandidate] = useState<EnhanceCandidate | null>(null);
  const [lastRun, setLastRun] = useState<RunParams | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyNote, setApplyNote] = useState<string | null>(null);

  // Panel menempel pada SATU draf aktif; ganti draf = state bersih.
  useEffect(() => {
    setCaptured(null);
    setCaptureNote(null);
    setInstruction('');
    setCandidate(null);
    setLastRun(null);
    setError(null);
    setApplyNote(null);
  }, [draft.id]);

  const blockReason = captured ? selectionBlockReason(captured.text) : null;
  const busy = busyTransform !== null;

  /* ---------------- ambil seleksi dari editor ---------------- */

  const captureSelection = () => {
    setApplyNote(null);
    const ed = getEditor();
    if (!ed) {
      setCaptureNote('Editor belum siap — tunggu sebentar lalu coba lagi.');
      return;
    }
    const { from, to } = ed.state.selection;
    const text = from === to ? '' : ed.state.doc.textBetween(from, to, '\n');
    if (!text.trim()) {
      setCaptured(null);
      setCaptureNote('Pilih dulu teks di editor — sorot bagian yang ingin disempurnakan, lalu tekan tombol ini lagi.');
      return;
    }
    setCaptured({ text, from, to });
    setCaptureNote(null);
    setCandidate(null);
    setError(null);
  };

  /* ---------------- jalankan transformasi (kandidat) ---------------- */

  const runTransform = async (params: RunParams) => {
    if (!captured || blockReason) return;
    if (params.transform === 'bebas' && !params.instruction.trim()) {
      setError('Transformasi "Tulis ulang dengan instruksi sendiri" membutuhkan instruksi — tulis dulu arahannya pada kolom instruksi bebas.');
      return;
    }
    setBusyTransform(params.transform);
    setError(null);
    setApplyNote(null);
    try {
      const res = await documentStudioOrchestrator.handle({
        intent: 'ENHANCE_TEXT',
        selectionText: captured.text,
        transform: params.transform,
        instruction: params.instruction.trim() || undefined,
        fileName: draft.title,
      });
      if (!res.success) {
        setError(`${res.errorCode || 'ERROR'}: ${res.message || 'Penyempurnaan teks gagal.'}`);
        return;
      }
      const label = ENHANCE_ACTIONS.find((a) => a.transform === params.transform)?.label ?? params.transform;
      setCandidate({ text: res.content || '', transform: params.transform, label });
      setLastRun(params);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Penyempurnaan teks gagal.');
    } finally {
      setBusyTransform(null);
    }
  };

  /* ---------------- terapkan kandidat ke rentang ---------------- */

  const applyCandidate = async () => {
    if (!captured || !candidate) return;
    const ed = getEditor();
    if (!ed) {
      setApplyNote('Editor tidak tersedia — kandidat tidak diterapkan.');
      return;
    }
    // Validasi rentang: teks pada rentang tersimpan harus masih sama.
    let currentRangeText: string | null = null;
    try {
      currentRangeText = ed.state.doc.textBetween(captured.from, captured.to, '\n');
    } catch {
      currentRangeText = null;
    }
    if (currentRangeText === null || !rangeTextStillMatches(currentRangeText, captured.text)) {
      setApplyNote(
        'Teks pada rentang terpilih sudah berubah sejak diambil, sehingga kandidat tidak diterapkan agar tidak menimpa bagian yang salah. Ambil ulang teks terpilih lalu jalankan transformasi lagi.',
      );
      return;
    }
    setApplyBusy(true);
    setApplyNote(null);
    try {
      await onApplyEnhance(
        { from: captured.from, to: captured.to },
        candidate.text,
        `Sempurnakan teks: ${candidate.label}`,
      );
      setCandidate(null);
      setCaptured(null);
      setInstruction('');
      setApplyNote('Kandidat diterapkan pada rentang terpilih. Isi sebelumnya tersimpan sebagai versi (origin: enhance) dan dapat dipulihkan dari Riwayat Versi.');
    } catch (e) {
      setApplyNote(e instanceof Error ? e.message : 'Penerapan kandidat gagal — dokumen tidak berubah.');
    } finally {
      setApplyBusy(false);
    }
  };

  const previewText = captured
    ? captured.text.length > 600
      ? `${captured.text.slice(0, 600)}…`
      : captured.text
    : '';

  return (
    <section className="docai-studio docai-enhance" aria-label="Sempurnakan Teks">
      <div className="docai-studio-head">
        <div>
          <div className="docai-studio-t">
            <Sparkles size={16} /> Sempurnakan Teks (AI)
          </div>
          <p className="docai-studio-sub">
            Sunting bagian dokumen yang Anda pilih — bukan seluruh dokumen. Hasil AI adalah kandidat:
            tinjau pratinjaunya, dokumen hanya berubah bila Anda menekan Terapkan, dan isi sebelumnya
            tersimpan sebagai versi. Sesuai prompt editor profesional, AI mempertahankan fakta, angka,
            nama, dan tanggal sebagaimana sumbernya.
          </p>
        </div>
        <button className="docai-btn-ghost" onClick={captureSelection}>
          <Wand2 size={15} /> Ambil Teks Terpilih dari Editor
        </button>
      </div>

      {captureNote && <div className="docai-warn">{captureNote}</div>}

      {captured && (
        <div className="docai-enhance-capture">
          <div className="docai-enhance-capture-h">
            <strong>Teks terpilih</strong>
            <span>
              {captured.text.length} karakter · rentang posisi {captured.from}–{captured.to}
            </span>
          </div>
          <pre className="docai-enhance-capture-body">{previewText}</pre>
          {blockReason && (
            <div className="docai-warn" role="alert">
              <AlertTriangle size={13} /> {blockReason} (batas {MAX_ENHANCE_SELECTION_CHARS} karakter)
            </div>
          )}
        </div>
      )}

      <div className="docai-enhance-actions" role="group" aria-label="Pilih transformasi teks">
        {ENHANCE_ACTIONS.map((a) => (
          <button
            key={a.transform}
            className="docai-btn-ghost docai-mini"
            onClick={() => void runTransform({ transform: a.transform, instruction })}
            disabled={!captured || !!blockReason || busy || applyBusy}
            title={
              !captured
                ? 'Ambil dulu teks terpilih dari editor'
                : blockReason ?? `Jalankan: ${a.label}`
            }
          >
            {busyTransform === a.transform ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}{' '}
            {a.label}
          </button>
        ))}
      </div>

      <textarea
        className="docai-textarea"
        rows={2}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Instruksi bebas — wajib untuk “Tulis ulang dengan instruksi sendiri”, opsional sebagai arahan tambahan untuk aksi lain. mis. Perbaiki bagian ini agar sesuai bahasa berita acara pemeriksaan pekerjaan konstruksi."
        aria-label="Instruksi bebas untuk penyempurnaan teks"
      />
      <p className="docai-hint" style={{ marginTop: 0 }}>
        AI hanya dipanggil saat Anda menekan salah satu tombol transformasi di atas — tidak otomatis
        saat kursor bergerak atau teks berubah.
      </p>

      {error && (
        <div className="docai-error" role="alert">
          {error} Teks asli tidak berubah.
        </div>
      )}

      {candidate && captured && (
        <div className="docai-candidate" role="dialog" aria-label="Pratinjau hasil sempurnaan">
          <div className="docai-candidate-head">
            <strong>Kandidat sempurnaan — belum diterapkan</strong>
            <span>
              Transformasi: {candidate.label} · rentang {captured.from}–{captured.to} ({captured.text.length}{' '}
              karakter)
            </span>
          </div>
          <div className="docai-enhance-compare">
            <div>
              <div className="docai-enhance-colh">Teks Asli</div>
              <pre className="docai-candidate-body">{captured.text}</pre>
            </div>
            <div>
              <div className="docai-enhance-colh">Hasil Sempurnaan (AI)</div>
              <pre className="docai-candidate-body">{candidate.text}</pre>
            </div>
          </div>
          <p className="docai-hint" style={{ marginTop: 0 }}>
            Kandidat adalah teks dari AI (markdown ringan); menerapkan akan mengganti HANYA rentang
            terpilih di editor — tebal, daftar, dan tabel pada kandidat dikonversi menjadi format
            editor sungguhan, sedangkan format kaya asli di dalam rentang yang diganti tidak
            dipertahankan — setelah isi saat ini disimpan sebagai versi.
          </p>
          {applyNote && (
            <div className="docai-warn" role="alert">
              {applyNote}
            </div>
          )}
          <div className="docai-btnrow">
            <button className="docai-btn-primary" onClick={() => void applyCandidate()} disabled={applyBusy || busy}>
              {applyBusy ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Terapkan pada Rentang
            </button>
            <button
              className="docai-btn-ghost"
              onClick={() => lastRun && void runTransform(lastRun)}
              disabled={applyBusy || busy}
            >
              {busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Coba Lagi
            </button>
            <button className="docai-btn-ghost" onClick={() => setCandidate(null)} disabled={applyBusy || busy}>
              <X size={14} /> Batalkan
            </button>
          </div>
        </div>
      )}

      {applyNote && !candidate && (
        <div className="docai-warn" style={{ marginTop: 10 }}>
          {applyNote}
        </div>
      )}
    </section>
  );
};

export default DocEnhance;
