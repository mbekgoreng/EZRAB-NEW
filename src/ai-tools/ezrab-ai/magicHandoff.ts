/**
 * magicHandoff — deteksi kompleksitas untuk tawaran handoff
 * Magic AI → EZRAB Chat AI (direktif §7, Rekonstruksi 2026-11-11).
 *
 * Kedua mode adalah SATU mesin percakapan kanonis (EzrabAiView +
 * unifiedConversationStore + intake yang sama), jadi "handoff" di sini
 * BUKAN transfer data: ia mengganti mode presentasi dari mode masuk
 * Magic AI ke workspace Chat AI lanjutan. Seluruh state (conversation_id,
 * project_id, draft, spek terkonfirmasi/tertunda, asumsi, item tak
 * teresolusi, tahap workflow) hidup di store & konteks sesi yang sama
 * sehingga terpelihara secara konstruksi — tidak ada draft baru, tidak
 * ada duplikasi item, tidak ada restart percakapan.
 *
 * Detektor ini MURNI & deterministik (tanpa panggilan AI tambahan):
 * tawaran hanya muncul untuk sinyal kompleksitas yang nyata.
 */
import { classifyUniversal } from './universalIntake';

export interface HandoffNeed {
  needed: boolean;
  /** Alasan terbaca pengguna (Bahasa Indonesia, singkat). */
  reason: string | null;
  signals: string[];
}

const DED_DOC_RE =
  /\b(ded|gambar kerja|shop drawing|as built|bestek|rks)\b/i;
const MULTI_FILE_RE =
  /\b(banyak|beberapa|semua)\s+(file|dokumen|pdf|gambar)\b|\d+\s*(file|dokumen|pdf)\b/i;
const MULTI_STAGE_RE =
  /\b(bertahap|beberapa tahap|multi[- ]?tahap|tahap demi tahap|kompleks|menyeluruh)\b/i;
const COORDINATION_RE =
  /\b(koordinasi|terpadu|sekaligus)\b[^.]{0,60}\b(struktur|arsitek|elektrikal|plumbing|mep)\b|\b(struktur|arsitek|elektrikal|plumbing)\b[^.]{0,40}\b(dan|serta|,)\s*(struktur|arsitek|elektrikal|plumbing|mep)\b/i;

export function detectHandoffNeed(
  text: string,
  opts?: { floors?: number | null; attachmentCount?: number },
): HandoffNeed {
  const raw = text || '';
  const signals: string[] = [];

  if (DED_DOC_RE.test(raw) && (MULTI_FILE_RE.test(raw) || /\bpdf\b/i.test(raw))) {
    signals.push('dokumen DED/gambar kerja');
  }
  if (MULTI_FILE_RE.test(raw) || (opts?.attachmentCount ?? 0) >= 2) {
    signals.push('banyak dokumen');
  }
  if (MULTI_STAGE_RE.test(raw)) signals.push('analisis beberapa tahap');
  if (COORDINATION_RE.test(raw)) signals.push('koordinasi multi-disiplin');

  const cls = classifyUniversal(raw);
  if (cls.isMulti && cls.secondary.length >= 2) {
    signals.push('proyek multi-disiplin');
  }
  const floors = opts?.floors ?? null;
  if (floors != null && floors >= 5) signals.push(`bangunan ${floors} lantai`);

  if (signals.length === 0) return { needed: false, reason: null, signals };
  return {
    needed: true,
    reason: `Permintaan Anda membutuhkan analisis beberapa tahap (${signals[0]}). Agar spesifikasi dan hasil pekerjaan tetap terjaga, saya menyarankan melanjutkannya di EZRAB Chat AI. Anda juga bisa tetap melanjutkan di sini.`,
    signals,
  };
}

export const HANDOFF_CHOICE_CHAT = 'Lanjutkan di EZRAB Chat AI';
export const HANDOFF_CHOICE_STAY = 'Tetap di Magic AI';
