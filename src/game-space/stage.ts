/**
 * EZRAB Game Space — stage sizing murni (src/game-space/stage.ts)
 *
 * Modul murni (tanpa React/CSS) untuk ukuran panggung game. Dipakai
 * GameSpaceOverlay (GameStage) dan diuji langsung oleh
 * src/test/gameSpace.test.ts.
 *
 * Ukuran desain acuan game (px). Stage mengecil/membesar agar game
 * selalu pas di ruang yang tersedia — tidak ada lagi yang ke-crop di
 * layar pendek.
 *
 * Default-nya portrait 390×700 (acuan desain mayoritas game). Game yang
 * memang dirancang landscape-native (arena/field menyamping) dan
 * square-native (papan persegi) punya acuan sendiri di STAGE_SPECS,
 * supaya panggungnya mengisi layar lebar secara maksimal dengan rasio
 * aspek asli game — tanpa distorsi dan tanpa terpotong. Game
 * portrait-native tetap portrait dan terpusat rapi.
 *
 * Yang diubah di sini HANYA ukuran tampil panggung (kotak CSS). Dimensi
 * logis, resolusi render internal, grafis, dan mekanik tiap game tidak
 * disentuh sama sekali — KECUALI game portrait yang ikut orientasi:
 * lihat effectiveStageSpec.
 */

export const STAGE_W = 390;
export const STAGE_H = 700;
export const STAGE_MAX_SCALE = 1.3;

export interface StageSpec {
  w: number;
  h: number;
  max: number;
}

export const STAGE_PORTRAIT: StageSpec = { w: STAGE_W, h: STAGE_H, max: STAGE_MAX_SCALE };
/** 16:9 — field/arena menyamping penuh (field difraksi W×H / runner / slicer). */
export const LAND_WIDE: StageSpec = { w: 1120, h: 630, max: 2 };
/** 16:10 — adegan 3D/DOM menyamping (kanvas + palet/HUD horizontal). */
export const LAND: StageSpec = { w: 1120, h: 700, max: 2 };
/** 10:7 — arena menyamping ringan (fraksi W×H, formasi, bin, target). */
export const LAND_MILD: StageSpec = { w: 1000, h: 700, max: 2 };
/** 1:1 — papan persegi (board diskalakan min(W,H) atau aspect-ratio 1). */
export const SQUARE: StageSpec = { w: 700, h: 700, max: 2 };

/**
 * Klasifikasi orientasi panggung per game, dari geometri desainnya:
 * dunia virtual tetap (WORLD/VW), papan cols×rows, board min(W,H),
 * atau komposisi adegan fraksi W×H. Game yang tidak terdaftar =
 * portrait-native (termasuk keluarga lebar-logis-tetap LW yang diskalakan
 * dari lebar, papan DOM bertumpuk vertikal, dan sumur/kolom vertikal).
 */
export const STAGE_SPECS: Record<string, StageSpec> = {
  // ---- Landscape-native ----
  'bongkar-rumah': LAND, // adegan 3D + palet horizontal
  'build-challenge': LAND, // site 3D + palet komponen horizontal
  'head-soccer-mandor': LAND_WIDE, // field sepak bola fraksi W×H
  'ketapel-konstruksi': { w: 900, h: 700, max: 2 }, // dunia WORLD 900×700 persis
  'lari-proyek': LAND_WIDE, // endless runner menyamping (Three.js)
  'selamatkan-mandor': LAND_MILD, // adegan crane/bata fraksi W×H
  'tebas-material': LAND_WIDE, // slicer layar penuh
  'arcade-archery': LAND_MILD, // tembak horizontal, ruang virtual VH
  'arcade-breakout': LAND_MILD, // field bata 8 kolom fraksi W×H
  'arcade-capit-crane': LAND_MILD, // rel crane menyamping
  'arcade-dice-roll': LAND_MILD, // elips meja adegan fraksi W×H
  'arcade-emoji-catcher': LAND_MILD, // tangkap jatuh, keranjang menyamping
  'arcade-fruit-slicer': LAND_WIDE, // slicer layar penuh
  'arcade-hangman': LAND_MILD, // komposisi adegan menyamping fraksi W×H
  'arcade-insect-catch': LAND_MILD, // target menyebar fraksi W×H
  'arcade-ping-pong': { w: 1000, h: 600, max: 2 }, // dunia VW×VH 800×480 (5:3)
  'arcade-shape-clicker': LAND_MILD, // target menyebar fraksi W×H
  'arcade-sortir-material': LAND_MILD, // 3 bin membentang selebar W
  'arcade-space-invaders': LAND_MILD, // formasi 8 kolom menyamping
  // ---- Square-native ----
  'gabung-blok': SQUARE, // papan 2048: size = min(W,H)
  'sambung-kata': SQUARE, // roda huruf: komposisi persegi
  'sudoku-tukang': SQUARE, // papan 9×9: n = min(W,H)
  'arcade-candy-crush': SQUARE, // papan 8×8
  'arcade-checkers': SQUARE, // papan DOM aspect 1
  'arcade-chess': SQUARE, // papan DOM aspect 1
  'arcade-connect-four': SQUARE, // papan 7×6 di tengah bidang
  'arcade-crossy-road': SQUARE, // lajur menyamping, progres vertikal
  'arcade-lights-out': SQUARE, // grid 5×5, cell = min(W,H)
  'arcade-minesweeper': SQUARE, // level 9×9 / 16×16 / 30×16
  'arcade-nonogram': SQUARE, // grid 10×10 + petunjuk
  'arcade-pac-man': SQUARE, // labirin 19×17
  'arcade-simon-says': SQUARE, // 4 pad 2×2
  'arcade-sliding-puzzle': SQUARE, // papan DOM aspect 1
  'arcade-snake': SQUARE, // dunia logis 440×440
  'arcade-sudoku': SQUARE, // papan DOM aspect 1
  'arcade-tic-tac-toe': SQUARE, // papan: size = min(W,H)
  'arcade-whack-a-mole': SQUARE, // papan lubang persegi di tengah adegan
};

/** Spesifikasi panggung untuk satu id game (default = portrait). */
export function specForGame(gameId: string): StageSpec {
  return STAGE_SPECS[gameId] ?? STAGE_PORTRAIT;
}

/**
 * Apakah game ini landscape-native (spesifikasi desainnya menyamping)?
 * Sumber kebenaran orientasi per-game = STAGE_SPECS via specForGame —
 * game yang tidak terdaftar (portrait) dan game square (w == h) bukan
 * landscape. Dipakai prompt rotate: hanya game landscape yang
 * menyarankan putar HP.
 */
export function isLandscapeGame(gameId: string): boolean {
  const spec = specForGame(gameId);
  return spec.w > spec.h;
}

/**
 * Apakah prompt "putar HP" boleh tampil untuk game & ruang tersedia ini?
 * Perintah owner 2026-11-19: "bila game landscape kasih notif rotate hpmu".
 *
 * Keempat syarat harus terpenuhi sekaligus:
 * 1. Game landscape-native (spec.w > spec.h) — game portrait/square
 *    tidak perlu diputar, dan game di PORTRAIT_LOCKED_IDS semuanya
 *    portrait sehingga tidak pernah memicu prompt ini.
 * 2. Ruang tersedia portrait (availH > availW) — di landscape prompt
 *    hilang sendiri tanpa perlu ditutup.
 * 3. Perangkat ringkas (sisi pendek < COMPACT_SHORT_SIDE) — tablet/
 *    desktop sudah cukup lapang; ambang yang sama dengan
 *    effectiveStageSpec.
 * 4. Pointer kasar (layar sentuh) — membedakan HP dari jendela
 *    desktop yang kebetulan sempit-tinggi; di desktop tidak ada HP
 *    yang bisa diputar.
 *
 * Murni fungsi — GameStage mengoper nilai matchMedia
 * '(pointer: coarse)' dari browser; diuji langsung oleh
 * src/test/gameRotatePrompt.test.ts.
 */
export function shouldShowRotatePrompt(
  spec: StageSpec,
  availW: number,
  availH: number,
  coarsePointer: boolean,
): boolean {
  if (spec.w <= spec.h) return false;
  if (!coarsePointer) return false;
  if (availH <= availW) return false;
  return Math.min(availW, availH) < COMPACT_SHORT_SIDE;
}

/**
 * Game portrait yang TIDAK ikut orientasi landscape — panggungnya tetap
 * portrait (kotak kecil terpusat, seperti sekarang) walau HP diputar.
 * Tiga alasan, dikelompokkan di dalam daftar: (1) tumpukan DOM vertikal
 * tetap yang tidak bisa di-reflow tanpa merombak tata letak; (2)
 * gameplay vertikal-inheren yang rusak bila dipaksa ke kanvas pendek;
 * (3) konten memenuhi penuh tinggi desain sehingga tukar aspek tidak
 * memberi keuntungan ukuran apa pun. Game-game ini tetap sepenuhnya
 * bisa dimainkan di landscape — hanya tidak membesar.
 *
 * Game canvas portrait yang TIDAK ada di sini SUDAH diperbaiki
 * render-nya agar muat di kanvas landscape (skala tinggi-sadar +
 * konten tetap terlihat penuh) — lihat LH_CONTENT di tiap game.
 */
export const PORTRAIT_LOCKED_IDS: ReadonlySet<string> = new Set([
  'arcade-blackjack', // tumpukan DOM: kartu dealer + pemain + tombol
  'arcade-mastermind', // tumpukan DOM: baris tebakan + palet
  'arcade-quiz', // tumpukan DOM: soal + 4 opsi + progres
  'arcade-rock-paper-scissors', // tumpukan DOM: arena + pilihan
  'arcade-speed-typing', // tumpukan DOM: teks + keyboard
  'arcade-wordle', // DOM: grid 6 baris (366px) + keyboard (160px) + HUD (86px) tidak muat di tinggi landscape; butuh desain ulang berdampingan, bukan skala
  // Gameplay vertikal-inheren: dunia vertikal (gravitasi/jatuh/turun)
  // tidak bermakna di kanvas pendek — tetap kotak portrait (kecil tapi
  // bisa dimainkan normal) daripada dipaksa landscape yang merusak
  // kesulitan/mekanik:
  'flappy-mandor', // gravitasi + celah vertikal; di dunia ~217 tinggi, gap 150–214 nyaris memenuhi layar
  'arcade-flappy-bird', // sama seperti flappy-mandor
  'arcade-bubble-shooter', // grid awal 5 baris sudah melewati garis kalah (deadY) di kanvas 344 tinggi — kalah instan
  'arcade-typing-game', // dunia 480×760: kata jatuh tak terbaca di kanvas pendek; memendekkan jatuh = ubah gameplay
  // Konten memenuhi penuh tinggi desain 700 — tukar aspek tidak memberi
  // keuntungan ukuran apa pun (tetap sekecil kotak portrait):
  'arcade-battleship', // konten s.d. y=710 (grid mini MARKASMU)
  'arcade-maze-drag', // labirin mengisi penuh tinggi logis yang tersedia
]);

/**
 * Ambang sisi pendek ruang tersedia (px) untuk menganggap perangkat
 * sebagai HP. HP portrait (lebar 360–430) dan HP landscape (tinggi
 * 320–430) selalu di bawah ambang ini; tablet (768) dan desktop
 * (biasanya ≥600 di kedua sisi) di atasnya — di sana panggung
 * portrait yang tinggi sudah cukup besar sehingga tidak perlu dibalik.
 */
export const COMPACT_SHORT_SIDE = 520;

/**
 * Spesifikasi panggung EFEKTIF untuk ruang tersedia saat ini.
 *
 * Perilaku mengikuti orientasi (perintah owner 2026-11-17): di HP
 * landscape — ruang tersedia menyamping (lebar > tinggi) dan ringkas
 * (sisi pendek < 520px) — game portrait-native dibalik spesifikasinya
 * (w↔h) sehingga panggungnya ikut landscape dan mengisi layar, bukan
 * terjepit jadi kotak portrait kecil di tengah layar lebar. Di HP
 * portrait, di tablet, dan di desktop, spesifikasi desain game dipakai
 * apa adanya. Game landscape/square tidak berubah (sudah landscape
 * atau simetris), begitu pula game di PORTRAIT_LOCKED_IDS.
 *
 * Murni fungsi (w, h) ruang tersedia — GameStage memanggilnya di
 * dalam ResizeObserver sehingga rotasi perangkat langsung mengubah
 * panggung tanpa listener orientasi tambahan.
 */
export function effectiveStageSpec(
  spec: StageSpec,
  availW: number,
  availH: number,
  locked: boolean,
): StageSpec {
  if (locked) return spec;
  if (spec.w >= spec.h) return spec; // landscape/square: sudah sesuai
  if (availW > availH && Math.min(availW, availH) < COMPACT_SHORT_SIDE) {
    return { w: spec.h, h: spec.w, max: spec.max };
  }
  return spec;
}

/**
 * Ukuran kotak panggung (px, dibulatkan ke bawah) untuk spesifikasi
 * dan ruang tersedia tertentu. Skala dibatasi agar game tidak
 * membesar melewati max (desain tetap tajam, tidak pecah).
 */
export function stageBox(
  spec: StageSpec,
  availW: number,
  availH: number,
): { w: number; h: number } {
  const s = Math.min(availW / spec.w, availH / spec.h, spec.max);
  return {
    w: Math.max(1, Math.floor(spec.w * s)),
    h: Math.max(1, Math.floor(spec.h * s)),
  };
}
