/**
 * DED-AI Estimate — Builder sesi murni (2026-11-17, perbaikan susulan
 * perintah chat "jalankan analisis DED").
 *
 * SATU-SATUNYA tempat perakitan DedAiSession dari keadaan layar input:
 * dipakai bersama oleh tombol Mulai Analisis (`handleStart`,
 * DedAiInputView) dan oleh publish draft (`onSessionChange`) — kedua
 * jalur TIDAK BOLEH melenceng (sebelumnya perakitan hanya ada inline
 * di handleStart, sehingga draft yang diterbitkan bisa berbeda dari
 * sesi yang dijalankan tombol).
 *
 * Modul MURNI TypeScript (tanpa React, tanpa CSS): impor nilai hanya
 * dari dedModeUi (murni) — impor dari DedAiInputView HANYA TIPE
 * (dihapus saat kompilasi, tidak ada siklus runtime). Diuji suite
 * chatDedDocCommands (bagian I) via tsx tanpa render.
 */
import type { DedAiFileItem, DedAiSession } from './DedAiInputView';
import type { DedAiMode, DedAiProjectType, DedOutputPrefs } from './types';
import type { DedRabAiMode } from './dedMode';
import { withDedMode } from './dedModeUi';

/** Masukan builder — cermin state layar input yang membentuk sesi. */
export interface DedSessionBuildInput {
  /** Berkas VALID saja (tanpa error) — pemanggil memfilter; berkas
   *  berekor (bukan PDF / terlalu besar / kosong) tidak pernah masuk
   *  sesi, sama seperti di handleStart. */
  files: DedAiFileItem[];
  description: string;
  projectName: string;
  projectType: DedAiProjectType;
  mode: DedAiMode;
  dedMode: DedRabAiMode;
  /** true = simpan ke proyek existing (targetProjectId dipakai). */
  useExisting: boolean;
  targetProjectId: string | null;
  projects: Array<{ id: string; name: string }>;
  complexity: 'simple' | 'medium' | 'complex';
  /** Label kategori kompleksitas untuk creditEstimate (mis. "Sederhana"). */
  complexityLabel: string;
  /** Target kredit simulasi kategori (dedTarget di layar input). */
  creditTarget: number;
  scopeKind: 'ALL' | 'SELECTED';
  scopeSpec: string;
  /** Hasil probe per id berkas — hanya `pages` yang dipakai builder
   *  (untuk filePageCounts); probe 'error'/belum ada dilewati. */
  fileProbes: Record<string, { pages: number } | 'error' | undefined>;
  outputPrefs: DedOutputPrefs;
}

/**
 * Rakit DedAiSession dari keadaan layar input. Aturan NAMA (salinan
 * persis handleStart lama): nama ketikan → nama proyek existing yang
 * dipilih → nama berkas pertama tanpa .pdf. Satu-satunya perbedaan
 * dari kode lama: rantai fallback memakai `?.` sehingga berkas kosong
 * menghasilkan nama '' (bukan crash) — handleStart tetap terlindungi
 * gerbang canStart, publish draft hanya memanggil builder bila ada
 * berkas valid.
 *
 * DUAL MODE (§3): policy/fullAi DITURUNKAN dari dedMode lewat
 * withDedMode — tidak ada state policy/mesin terpisah yang bisa basi.
 */
export function buildDedAiSession(input: DedSessionBuildInput): DedAiSession {
  const chosenProjectId = input.useExisting ? input.targetProjectId : null;
  const name =
    input.projectName.trim() ||
    (chosenProjectId ? input.projects.find((p) => p.id === chosenProjectId)?.name || '' : '') ||
    input.files[0]?.file.name.replace(/\.pdf$/i, '') ||
    '';
  const filePageCounts: Record<string, number> = {};
  for (const f of input.files) {
    const p = input.fileProbes[f.id];
    if (p && p !== 'error') filePageCounts[f.id] = p.pages;
  }
  return withDedMode(
    {
      files: input.files,
      description: input.description.trim(),
      projectName: name,
      projectType: input.projectType,
      mode: input.mode,
      targetProjectId: chosenProjectId,
      creditEstimate: { category: input.complexityLabel, credits: input.creditTarget },
      // F-E2: sertakan nilai mentah kompleksitas juga (satu field aditif).
      complexity: input.complexity,
      pageScope:
        input.scopeKind === 'SELECTED'
          ? { kind: 'SELECTED', spec: input.scopeSpec.trim() }
          : { kind: 'ALL' },
      filePageCounts,
      outputPrefs: input.outputPrefs,
    },
    input.dedMode,
  );
}
