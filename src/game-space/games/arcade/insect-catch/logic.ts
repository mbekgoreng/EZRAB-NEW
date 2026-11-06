/**
 * ArcadeInsectCatch ("Tangkap Perkakas") — pure logic.
 * Perkakas jatuh dari lantai atas — ketuk sebelum menyentuh tanah!
 * Ketukan beruntun tanpa meleset = kombo. Bor emas = bonus.
 */

export type ToolKind = 'palu' | 'obeng' | 'kunci' | 'meteran' | 'bor-emas';

export const GAME_DURATION = 60; // detik
export const COMBO_STEP = 5; // tiap 5 kombo → bonus popup

export const TOOL_META: Record<ToolKind, { icon: string; name: string; base: number }> = {
  palu: { icon: '🔨', name: 'Palu', base: 10 },
  obeng: { icon: '🪛', name: 'Obeng', base: 10 },
  kunci: { icon: '🔧', name: 'Kunci Pas', base: 15 },
  meteran: { icon: '📏', name: 'Meteran', base: 15 },
  'bor-emas': { icon: '🪚', name: 'Bor Emas', base: 50 },
};

export const GOLD_CHANCE = 0.08;

/** Jenis perkakas berikutnya (bor emas langka). */
export function nextTool(rng: () => number): ToolKind {
  if (rng() < GOLD_CHANCE) return 'bor-emas';
  const r = rng();
  if (r < 0.3) return 'palu';
  if (r < 0.55) return 'obeng';
  if (r < 0.8) return 'kunci';
  return 'meteran';
}

/** Kecepatan jatuh (px/detik) — naik seiring waktu. */
export function fallSpeedAt(elapsed: number, rng: () => number): number {
  const d = Math.min(1, Math.max(0, elapsed / GAME_DURATION));
  return (170 + d * 260) * (0.85 + rng() * 0.3);
}

/** Jeda spawn (detik): 0.95s → 0.4s. */
export function spawnDelayAt(elapsed: number, rng: () => number): number {
  const d = Math.min(1, Math.max(0, elapsed / GAME_DURATION));
  return (0.95 - d * 0.55) * (0.7 + rng() * 0.6);
}

/** Poin ketukan: base + kombo×2. */
export function tapPoints(kind: ToolKind, combo: number): number {
  return TOOL_META[kind].base + combo * 2;
}

/** Grade akhir. */
export function gradeFor(score: number): string {
  if (score >= 1400) return 'S';
  if (score >= 950) return 'A';
  if (score >= 600) return 'B';
  if (score >= 300) return 'C';
  return 'D';
}

/* ==================================================================
 * MODE MISI SET PERKAKAS (Gelombang 5) — pembeda mekanik dari
 * "Tangkap Helm" (emoji-catcher). Di sana SEMUA tangkapan baik
 * menghitung progres level. Di sini hanya perkakas TARGET dalam
 * daftar misi ronde yang mengisi progres; perkakas non-target yang
 * diketuk tetap memberi poin dasar (tidak menghukum), tetapi tidak
 * mengisi misi. Ronde selesai saat misi penuh -> ronde berikutnya
 * set lebih besar. Perkakas TARGET yang jatuh ke lantai kena
 * penalti waktu; non-target yang jatuh hanya mematahkan kombo
 * (perilaku lama). Bor emas tidak pernah jadi target: selalu bonus.
 * ================================================================== */

/** Perkakas yang boleh jadi target misi (bor emas dikecualikan). */
export const MISSION_KINDS: ToolKind[] = ['palu', 'obeng', 'kunci', 'meteran'];

/** Penalti waktu (detik) bila perkakas TARGET jatuh ke lantai. */
export const TARGET_MISS_TIME_PENALTY = 4;

export type MissionMap = Partial<Record<ToolKind, number>>;

export interface MissionState {
  round: number;
  mission: MissionMap; // kebutuhan per jenis
  collected: MissionMap; // yang sudah terkumpul per jenis
}

/**
 * Misi untuk ronde tertentu (deterministik, tanpa rng):
 * jumlah jenis target tumbuh 2 -> 3 -> 4 lalu tetap 4; total target
 * tumbuh +2 per ronde (5, 7, 9, 11, ...). Distribusi round-robin
 * mengikuti urutan MISSION_KINDS yang digeser per ronde supaya set
 * bervariasi tanpa keacakan.
 */
export function missionForRound(round: number): MissionMap {
  const r = Math.max(1, Math.floor(round));
  const kindCount = Math.min(MISSION_KINDS.length, 1 + r); // R1=2, R2=3, R3+=4
  const total = 3 + r * 2; // R1=5, R2=7, R3=9, ...
  const mission: MissionMap = {};
  for (let i = 0; i < total; i += 1) {
    const kind = MISSION_KINDS[(i + (r - 1)) % kindCount];
    mission[kind] = (mission[kind] ?? 0) + 1;
  }
  return mission;
}

export function createMission(round: number): MissionState {
  return { round: Math.max(1, Math.floor(round)), mission: missionForRound(round), collected: {} };
}

/** Apakah jenis ini target yang MASIH dibutuhkan misi? */
export function isTargetKind(st: MissionState, kind: ToolKind): boolean {
  return kind !== 'bor-emas' && (st.mission[kind] ?? 0) - (st.collected[kind] ?? 0) > 0;
}

/** Sisa kebutuhan satu jenis (0 bila bukan target / sudah penuh). */
export function remainingFor(st: MissionState, kind: ToolKind): number {
  return Math.max(0, (st.mission[kind] ?? 0) - (st.collected[kind] ?? 0));
}

/** Total sisa target di misi berjalan. */
export function totalRemaining(st: MissionState): number {
  return MISSION_KINDS.reduce((acc, k) => acc + remainingFor(st, k), 0);
}

/** Misi penuh? */
export function isMissionComplete(st: MissionState): boolean {
  return totalRemaining(st) === 0;
}

export type TapOutcome = 'target' | 'non-target' | 'bonus';

export interface TapResult {
  state: MissionState;
  outcome: TapOutcome;
  /** true tepat pada ketukan yang menuntaskan misi ronde ini. */
  roundCompleted: boolean;
}

/**
 * Terapkan satu ketukan berhasil ke state misi (murni, tidak memutasi
 * state masukan). Target -> collected+1. Non-target & bor emas ->
 * state tidak berubah (bonus ditandai terpisah).
 */
export function applyTapToMission(st: MissionState, kind: ToolKind): TapResult {
  if (kind === 'bor-emas') return { state: st, outcome: 'bonus', roundCompleted: false };
  if (!isTargetKind(st, kind)) return { state: st, outcome: 'non-target', roundCompleted: false };
  const collected: MissionMap = { ...st.collected, [kind]: (st.collected[kind] ?? 0) + 1 };
  const next: MissionState = { ...st, collected };
  return { state: next, outcome: 'target', roundCompleted: isMissionComplete(next) };
}

/** Bonus poin saat ronde tuntas: tumbuh per ronde. */
export function roundBonus(round: number): number {
  return 100 + Math.max(0, Math.floor(round) - 1) * 50;
}

/** Ronde berikutnya dari state yang tuntas. */
export function advanceMission(st: MissionState): MissionState {
  return createMission(st.round + 1);
}

/**
 * Penalti waktu (detik) saat perkakas jatuh ke lantai: hanya TARGET
 * yang masih dibutuhkan yang kena penalti; non-target = 0 (cukup
 * kombo putus, sesuai perilaku lama).
 */
export function missTimePenalty(st: MissionState, kind: ToolKind): number {
  return isTargetKind(st, kind) ? TARGET_MISS_TIME_PENALTY : 0;
}

/**
 * Jenis perkakas spawn berikutnya dengan bias misi: peluang
 * TARGET_SPAWN_BIAS mengambil dari target yang masih dibutuhkan
 * (round-robin deterministik via pickIndex), sisanya jalur acak lama
 * nextTool(). Menjamin misi selalu bisa diselesaikan.
 */
export const TARGET_SPAWN_BIAS = 0.62;
export function spawnKindForMission(st: MissionState, rng: () => number, pickIndex: number): ToolKind {
  if (rng() < TARGET_SPAWN_BIAS) {
    const needed = MISSION_KINDS.filter((k) => remainingFor(st, k) > 0);
    if (needed.length > 0) return needed[Math.abs(Math.floor(pickIndex)) % needed.length];
  }
  return nextTool(rng);
}
