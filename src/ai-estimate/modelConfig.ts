/**
 * EZRAB AI ESTIMATE 2.0 — Centralized Model Configuration
 *
 * Single source of truth for AI Estimate analysis modes:
 * - FAST   : Gemini 3.5 Flash-Lite (Speed + Preliminary Estimate)
 * - DETAIL : Gemini 3.8 Flash (Depth + Completeness + Traceability)
 *
 * In browser: capability modes 'quick' and 'advanced' are used with server routing.
 * In server/node: exact model IDs are configured here.
 */

export type AiEstimateAnalysisMode = 'FAST' | 'DETAIL';

export interface AiEstimateProgressStep {
  stage: string;
  label: string;
  desc: string;
}

export interface AiEstimateModelConfig {
  id: AiEstimateAnalysisMode;
  title: string;
  subtitle: string;
  modelName: string;
  modelId: string;
  capabilityMode: 'quick' | 'advanced';
  description: string;
  badge: string;
  speed: string;
  depth: string;
  progressSteps: AiEstimateProgressStep[];
}

export const AI_ESTIMATE_MODELS: Record<AiEstimateAnalysisMode, AiEstimateModelConfig> = {
  FAST: {
    id: 'FAST',
    title: 'Estimasi Cepat',
    subtitle: 'Analisis awal untuk mendapatkan gambaran biaya proyek dengan cepat.',
    modelName: 'Gemini 3.5 Flash-Lite',
    modelId: 'gemini-3.5-flash-lite',
    capabilityMode: 'quick',
    description: 'Analisis ringkas untuk mendapatkan WBS pekerjaan dan estimasi biaya pendahuluan.',
    badge: 'FAST',
    speed: '~15-30 detik',
    depth: 'Preliminary WBS',
    progressSteps: [
      { stage: 'READING_DED', label: 'Membaca DED', desc: 'Scan visual dan identifikasi lembar dokumen' },
      { stage: 'IDENTIFY_WORK', label: 'Mengenali pekerjaan', desc: 'Identifikasi komponen struktur & arsitektur' },
      { stage: 'CALCULATE_ESTIMATE', label: 'Menghitung estimasi', desc: 'Estimasi volume dan harga satuan awal' },
      { stage: 'BUILD_RAB', label: 'Menyusun RAB', desc: 'Sanity check deterministik & penyusunan tabel' },
    ],
  },
  DETAIL: {
    id: 'DETAIL',
    title: 'Estimasi Detail',
    subtitle: 'Analisis DED lebih mendalam dengan pemeriksaan dimensi dan konsistensi.',
    modelName: 'Gemini 3.8 Flash',
    modelId: 'gemini-3.8-flash',
    capabilityMode: 'advanced',
    description: 'Analisis multi-halaman lengkap dengan rekonstruksi dimensi, cross-check gambar, dan penelusuran audit.',
    badge: 'DETAIL',
    speed: '~45-90 detik',
    depth: 'Full Geometry & Traceability',
    progressSteps: [
      { stage: 'READING_IMAGES', label: 'Membaca gambar', desc: 'Analisis visual setiap lembar kerja DED' },
      { stage: 'UNDERSTAND_STRUCTURE', label: 'Memahami struktur proyek', desc: 'Korelasi arsitektur, struktur & MEP' },
      { stage: 'MEASURE_WORK', label: 'Mengukur pekerjaan', desc: 'Ekstraksi dimensi dan rekonstruksi volume' },
      { stage: 'CHECK_CONSISTENCY', label: 'Memeriksa konsistensi', desc: 'Cross-check gambar dan deteksi anomali' },
      { stage: 'BUILD_ESTIMATE', label: 'Menyusun estimasi', desc: 'Sanity gate deterministik, kalkulasi subtotal & RAB' },
    ],
  },
};

/**
 * Returns model config by mode
 */
export function getAiEstimateModelConfig(mode: AiEstimateAnalysisMode = 'FAST'): AiEstimateModelConfig {
  return AI_ESTIMATE_MODELS[mode] || AI_ESTIMATE_MODELS.FAST;
}
