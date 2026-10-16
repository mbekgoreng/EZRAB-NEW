/**
 * Tujuan navigasi AI untuk onboarding (Tahap D).
 *
 * Kontrak navigasi siap pakai untuk fase berikutnya. Setiap tujuan sudah
 * diverifikasi terhadap src/routing/routes.ts — TIDAK ada route baru,
 * TIDAK ada modal AI tambahan. Langkah onboarding hanya mengarahkan
 * pengguna ke workspace yang sesuai tanpa mengubah data proyek.
 */
import { paths } from '../../routing/routes';

export interface AiDestination {
  /** id stabil untuk flag `ezrab_tour_seen_<id>` */
  id: 'chat-agent' | 'ded-rab-ai' | 'dokumen-ai';
  title: string;
  desc: string;
  /** route terverifikasi */
  path: string;
}

/**
 * Tiga tujuan AI yang benar-benar ada:
 * 1. Chat Agent    → /app/ezrab-ai      (paths.ezrabAi)
 * 2. DED → RAB AI  → /app/ded-ai        (paths.dedAiEstimate)
 * 3. Dokumen AI    → /app/dokumen-ai    (paths.dokumenAi)
 */
export const AI_DESTINATIONS: AiDestination[] = [
  {
    id: 'chat-agent',
    title: 'Chat Agent',
    desc: 'Asisten AI untuk tanya-jawab estimasi, AHSP, dan perhitungan konstruksi.',
    path: paths.ezrabAi(),
  },
  {
    id: 'ded-rab-ai',
    title: 'DED → RAB AI',
    desc: 'Unggah dokumen DED (PDF/gambar kerja), AI mengekstrak item pekerjaan menjadi estimasi RAB.',
    path: paths.dedAiEstimate(),
  },
  {
    id: 'dokumen-ai',
    title: 'Dokumen AI',
    desc: 'Susun dan kelola dokumen proyek — RAB, surat, dan laporan — dengan bantuan AI.',
    path: paths.dokumenAi(),
  },
];

/** Ambil destinasi berdasarkan id; undefined jika id tidak dikenal. */
export function getAiDestination(id: AiDestination['id']): AiDestination | undefined {
  return AI_DESTINATIONS.find((d) => d.id === id);
}
