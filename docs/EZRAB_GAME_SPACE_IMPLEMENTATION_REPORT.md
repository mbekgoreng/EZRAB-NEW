# EZRAB GAME SPACE — Implementation Report

**Tanggal:** 2026-10-19
**Repo:** `mbekgoreng/EZRAB-NEW` — worktree `~/workspace/ezrab-integrasi`
**Branch:** `fix/ai-gateway-403-origin` (HEAD `3231395`) — working tree kotor (pre-existing, tidak disentuh)
**Status:** Implemented & tested. **BELUM commit / push / merge / deploy** (sesuai batasan).

---

## 1. Ringkasan eksekutif

Fitur mini-game 3D interaktif di dalam Ezrab Chat AI selesai diimplementasikan end-to-end:

- Pengguna mengetik `game` (atau `/game`, `main game`, `buka game`, `game space`) → Game Space terbuka sebagai panel interaktif di dalam chat, **tanpa memanggil provider AI dan tanpa memakai AI credits**.
- Game pertama **EZRAB Build Challenge** benar-benar bisa dimainkan sampai selesai: scene konstruksi 3D isometrik (Three.js), pemain menempatkan komponen bangunan mengikuti aturan konstruksi, ada skor, 3 level, kondisi menang, pause/restart, dan layar kemenangan.
- Tidak ada regresi pada chat: pesan biasa, command lain, dan streaming AI tidak tersentuh.

**Definition of Done:** ✅ terpenuhi (dengan 2 catatan pengujian di bawah).

---

## 2. File yang diperiksa (audit)

| File | Temuan |
|---|---|
| `src/ai-tools/ezrab-ai/intentRouter.ts` | Router deterministik: normalisasi → slash command → pola NL → AI online. Lokasi integrasi yang tepat. |
| `src/ai-tools/ezrab-ai/actionRegistry.ts` | `executeIntent` memetakan intent → aksi. Game butuh hasil non-navigasi → ditambah flag `openGameSpace`. |
| `src/ai-tools/ezrab-ai/view.tsx` | `submit()` menjalankan router lokal **sebelum** `ezrabAiService.send`. Cabang lokal adalah titik hook tanpa mengganggu streaming. |
| `src/ai-tools/ezrab-ai/types.ts` | `EzrabAiMessage` — tidak perlu diubah (panel bersifat ephemeral, teks balasan tetap dipersist). |
| `package.json` | `three@^0.186.0` + `@types/three` **sudah** menjadi dependency (dipakai maskot 3D). Tidak ada dependency baru. |
| `src/components/mascot/EZRABMascot3D.tsx` | Preseden pemakaian Three.js di proyek. |
| Skill `local-impeccable` / `local-antislop` | Dibaca; diterapkan: palet blue-gray/navy/electric-blue khas EZRAB, tanpa neon/hitam dominan, tanpa klaim palsu. |

---

## 3. File yang diubah / dibuat

**Diubah (3 file, diff minimal):**

1. `src/ai-tools/ezrab-ai/intentRouter.ts`
   - Intent baru `OPEN_GAME_SPACE`.
   - Slash `/game` → `OPEN_GAME_SPACE`.
   - Deteksi natural via `isGameCommand()` (dari modul game-space) **sebelum** pattern matching umum — confidence 0.95, `localOnly: true`.
   - `HELP_TEXT` + `/game` di daftar perintah.
2. `src/ai-tools/ezrab-ai/actionRegistry.ts`
   - `ActionResult.openGameSpace?: boolean`.
   - `case 'OPEN_GAME_SPACE'`: tidak navigasi, tidak sentuh AI; mengembalikan flag + pesan.
3. `src/ai-tools/ezrab-ai/view.tsx`
   - `GameSpaceOverlay` di-`lazy()` → chunk terpisah, hanya diunduh saat dibuka.
   - State `gameSpaceOpen`; di cabang intent lokal: `if (res.openGameSpace) setGameSpaceOpen(true)`.
   - Render overlay di dalam `.ezchat2` + tombol tutup "Kembali ke chat".

**Baru (7 file):**

| File | Peran |
|---|---|
| `src/game-space/command.ts` | Matcher command murni (tanpa dependensi): `game`, `/game`, `main game`, `buka game`, `game space` (case/space-insensitive). Kalimat yang hanya menyebut kata "game" **tidak** dicocokkan. |
| `src/game-space/GameSpaceOverlay.tsx` | Panel: header + tombol tutup, kartu menu game, `Suspense` lazy-load game. |
| `src/game-space/game-space.css` | Styling khas EZRAB; responsif 390px; `prefers-reduced-motion`. |
| `src/game-space/games/build-challenge/logic.ts` | **Seluruh aturan main (murni, tanpa THREE/DOM):** grid 8×8, aturan susun (pondasi→kolom→balok→atap, dinding menempel pondasi), skor +100/−25 (floor 0), bonus kecepatan, 3 level, kondisi menang. |
| `src/game-space/games/build-challenge/BuildChallengeEngine.ts` | Engine Three.js: 1 renderer + 1 scene + 1 RAF loop, kamera ortografik isometrik, raycast matematis (tanpa mesh tak terlihat), ghost preview hijau/merah, animasi drop-in, `dispose()` penuh (geometri, material, listener, RAF). `static activeCount` untuk audit lifecycle. |
| `src/game-space/games/build-challenge/BuildChallenge.tsx` | Host React: tutorial, HUD (skor/timer/progres), palet komponen + auto-select cerdas, pause/restart, modal level-selesai & kemenangan, fallback ramah bila WebGL tak tersedia, `stopPropagation` keyboard agar shortcut chat tak terganggu. |
| `src/test/gameSpace.test.ts` | 54 unit test (`npx tsx`). |

---

## 4. Arsitektur integrasi command chat

```
pengguna mengetik "game"
  → view.tsx submit()
  → routeIntent("game")
      → isGameCommand() ✅ (confidence 0.95, localOnly: true)
  → executeIntent(OPEN_GAME_SPACE)
      → { ok, message, openGameSpace: true }   // tanpa navigate(), tanpa AI
  → view: setGameSpaceOpen(true) + balasan teks "Membuka EZRAB Game Space 🎮…"
  → <Suspense><GameSpaceOverlay/></Suspense>   // chunk game + three.js baru diunduh di sini
  → tutup → unmount → engine.dispose() → kembali ke chat, riwayat utuh
```

Jaminan isolasi: cabang `localOnly` return **sebelum** `ezrabAiService.send()` — tidak ada request AI, tidak ada konsumsi credits, tidak ada akses Supabase/proyek/RAB/harga. Skor hanya di memori sesi (tidak ada leaderboard, tidak ada monetisasi).

---

## 5. Fitur yang benar-benar selesai

- [x] Deteksi 5 varian command (termasuk `/game`), case/space-insensitive; pesan biasa tidak dibajak.
- [x] Game Space: header, kartu game, tombol mulai, tombol kembali/tutup.
- [x] Build Challenge: scene 3D isometrik (tanah, grid site 8×8, pohon dekorasi low-poly, pencahayaan + bayangan).
- [x] Gameplay nyata: 5 komponen (pondasi, kolom, balok, dinding, atap) dengan aturan penempatan yang ditegakkan; ghost preview hijau = valid, merah = invalid + pesan alasan.
- [x] Input mouse & touch (pointer events); picking via raycast ke bidang matematis.
- [x] Skor (+100 benar / −25 salah, tidak di bawah 0), timer, progres target per level, bonus kecepatan.
- [x] 3 level dengan briefing & target jelas; layar "Level selesai" + layar kemenangan (skor akhir, total langkah, jumlah salah tempat).
- [x] Tutorial singkat sebelum mulai; palet auto-select komponen yang belum selesai.
- [x] Pause (auto-pause saat tab disembunyikan), restart level, tutup & buka ulang tanpa renderer/listener ganda.
- [x] Fallback ramah jika WebGL tidak tersedia; `prefers-reduced-motion` dihormati (tanpa sway kamera & animasi drop).
- [x] Perayaan confetti ringan (dependency `canvas-confetti` yang sudah ada).

---

## 6. Bukti test & hasil build

### 6.1 Unit test — `npx tsx src/test/gameSpace.test.ts`
**54/54 PASS**, mencakup:
- 24 varian command cocok (`game`, `GAME`, `  game  `, `/game`, `main game`, `buka game dong`, `game space`, …) dan 11 non-command tidak cocok (`gambarkan denah`, `apa itu game?`, `game over`, …).
- `routeIntent` → `OPEN_GAME_SPACE` dengan `localOnly: true`; pesan biasa → `UNKNOWN`/`localOnly: false` (tetap ke AI); command lain (`/rab`, `buka template rab`) tidak berubah.
- `executeIntent` mengembalikan `openGameSpace: true` tanpa memanggil `navigate`.
- Aturan penempatan: semua 6 alasan invalid (`occupied`, `need-pondasi`, `need-kolom`, `need-balok`, `need-adjacent`, `out`), skoring, floor 0, bonus kecepatan, reset level, kemurnian `canPlace`.

### 6.2 Regresi chat — `npx tsx src/test/chatAiContextAware.test.ts`
**25/25 PASS** (tidak ada perubahan perilaku router yang sudah ada).

### 6.3 Browser test — Playwright + Chromium headless (WebGL SwiftShader nyata)
Metode: halaman uji sementara memuat `GameSpaceOverlay` persis seperti `EzrabAiView` me-render-nya (di dalam `.ezchat2`); klik sel dihitung dari proyeksi ortografik isometrik; `reducedMotion: reduce` untuk determinisme. **21/21 PASS:**

| # | Uji | Hasil |
|---|---|---|
| 1–3 | Overlay terbuka, kartu game tampil, tutorial muncul | PASS |
| 4–5 | Canvas WebGL render; tepat 1 engine (`activeCount=1`) | PASS |
| 6 | 4× klik sel → 4 pondasi, skor 0→400 | PASS |
| 7 | Penempatan invalid: toast alasan + penalti 400→375 | PASS |
| 8–9 | 4 kolom → "Level 1 selesai!" + bonus (skor 1200) | PASS |
| 10–11 | Pindah level: dispose+recreate seimbang (`activeCount=1`), target reset | PASS |
| 12–13 | Pause overlay → resume | PASS |
| 14 | Restart level membersihkan papan | PASS |
| 15–17 | Tutup ke menu → tutup ke chat → engine disposed (`activeCount=0`); buka ulang = 1 engine | PASS |
| 18–19 | Mobile 390px: tidak ada overflow horizontal; tap touch → skor +200 | PASS |
| 20–21 | Nol console/page error dari fitur | PASS |

### 6.4 Typecheck & build
- `tsc` scoped `src/game-space/**`: **PASS, 0 error** (strict mode).
- `tsc` full-project: **BLOCKED** — OOM di VM (pre-existing, tercatat di memori 2026-10-16; modul generated 16 MB).
- `vite build`: **tidak dijalankan** — gagal pre-existing pada `canvg`/`core-js` (catatan AGENTS.md 2026-10-08), tidak terkait perubahan ini.
- Import game terverifikasi resolve & berjalan via vite dev (browser test di atas memuat seluruh chunk).

### 6.5 Hasil uji desktop / mobile
- Desktop 1280×800: seluruh alur lolos (tabel 6.3).
- Mobile 390×844 touch: tap menempatkan komponen (skor +200), `scrollWidth=390` (tanpa overflow), palet scroll horizontal, HUD terbaca.

### 6.6 Dampak loading & lifecycle Three.js
- `three` sudah ada di bundle utama (dipakai maskot chat) — tidak ada penambahan dependency.
- Kode game + overlay berada di **chunk lazy** terpisah; dashboard/chat tidak memuatnya sebelum command `game` dipakai (terbukti: tidak ada canvas/engine sebelum "Mulai main").
- Satu engine per level; `dispose()` membatalkan RAF, melepas `ResizeObserver`/listener pointer/visibility, dan dispose seluruh geometri+material. Audit `activeCount`: buka=1, pindah level=1, tutup=0, buka ulang=1 — **tidak ada renderer atau listener ganda**.
- Pixel ratio dibatasi (≤2 desktop, ≤1.5 mobile); render loop melewatkan frame saat paused; sway kamera mati saat `prefers-reduced-motion`.

---

## 7. Bug yang belum terselesaikan / catatan

1. **Satu flake harness sekali terjadi** (tidak ter-reproduksi): pada run pertama, `page.evaluate(window.__GS)` melempar setelah klik "Level 2"; dua run penuh berikutnya (termasuk debug terisolasi langkah yang sama) hijau 21/21. Dinilai artefak race pada harness uji, bukan bug produk — lifecycle terverifikasi seimbang di run-run berikutnya.
2. **Jalur chat-penuh-di-browser NOT TESTED**: aplikasi penuh tidak bisa di-mount di headless Chromium sandbox (modul generated 16 MB stall — pre-existing). Wiring `game` → overlay di chat nyata terverifikasi via unit test + review kode (cabang 5 baris di `view.tsx`); disarankan verifikasi klik manual di preview Vercel.
3. **Layar victory & fallback WebGL**: victory memakai jalur kode yang sama dengan level-complete (teruji); fallback WebGL diimplementasikan tetapi tidak terpicu di uji (SwiftShader menyediakan WebGL) — keduanya belum diklik/di-render di browser.
4. Full-project `tsc` dan `vite build` tidak bisa dijalankan di VM ini karena masalah pre-existing (OOM & canvg); tidak terkait perubahan ini.

---

## 8. Status akhir & langkah lanjutan

**Status:** implementasi selesai, seluruh test yang direncanakan lolos, tidak ada regresi. Kode **belum di-commit/push/deploy** — menunggu perintah eksplisit user (satu grant = satu push, dengan pre-flight branch + secret scan sesuai aturan).

**Langkah lanjutan yang disarankan (butuh keputusan user):**
1. Verifikasi manual di preview Vercel: ketik `game` di Ezrab Chat AI → mainkan 1 level → kembali ke chat.
2. Jika OK: grant push tunggal untuk branch ini.
3. (Opsional, di luar scope) Skor persisten lintas sesi (localStorage, mengikuti pola penyimpanan aman aplikasi) dan game kedua setelah Build Challenge terbukti disukai.

---

## 9. Game Space v2 — tiga game pelepas stres (2026-10-19)

Permintaan user: "game apa yang menarik? fungsi hanya menghilangkan stress" — dijawab dengan ranking 3 opsi, user memilih **ketiganya sekaligus**, dengan arahan visual: "tidak 3d yang bosenin, ada depth texture nya, seperti game asli".

**Status:** diimplementasikan & teruji, **BELUM commit/push/deploy** (sesuai batasan). Tidak ada dependency npm baru, tidak ada AI calls, tidak ada DB migration. Test lama tetap hijau.

### 9.1 Arsitektur v2

**Shared FX kit** (`src/game-space/fx/`) — dipakai ketiga game:
- `textures.ts` — tekstur prosedural via canvas (TANPA aset eksternal): beton (speckle + retak rambut), fasad kaca (grid jendela + jendela menyala + kilau diagonal), bata (running bond + mortar), kayu (serat + knot), aspal, tanah, gradient langit, blob shadow, soft dot sprite. Semua SRGB + RepeatWrapping.
- `particles.ts` — `DustBurst` (pooled THREE.Points, 900 partikel, gravitasi + bounce + fade tanpa alokasi per-frame) dan `AmbientMotes` (kunang-kunang ambient).
- `audio.ts` — SFX WebAudio prosedural: pop (perfect), thud (mendarat), crumble (roboh), chime (kombo/menang), whoosh, fail, click. Singleton `sfx`; mute persisten di localStorage.
- `juice.ts` — `Shake` (trauma-based camera shake), `SkyDome` (shader gradient + bintang + transisi palet, sudah include tonemapping/colorspace chunks agar cocok dengan renderer), `comboPopup` (teks HTML melayang), `SlowMo` (dip time-scale saat perfect).
- `BaseEngine.ts` — renderer antialias + PCFSoftShadowMap + ACESFilmicToneMapping; directional hangat ber-shadow + hemisphere sejuk + rim light; kamera perspektif (parallax pointer + shake); ResizeObserver; loop rAF dt-clamp + slow-mo; tracked disposables; registry activeCount per game. Pelajaran: jangan panggil tick() sinkron di constructor (field subclass belum ada) dan jangan pakai deklarasi field `!:` untuk nilai yang di-assign di buildScene() (define-semantics menimpanya jadi undefined — bug stack tertangkap di test browser, diperbaiki pakai `declare`).

**Tiga game baru** (masing-masing `logic.ts` murni + `*Engine.ts` + `*.tsx`):
1. **Bongkar Bangunan** (`games/demolition/`) — ketuk blok gedung (44 blok, fasad kaca/beton/pilar) jadi puing; blok tanpa penyangga runtuh berantai (chain reaction — inti pelepas stres); skor = % diratakan + bonus kombo; puing fisik (gravitasi + bounce + debu + camera shake); tumpukan rubble tumbuh di kaki gedung; selebrasi 100% + tombol "Bangun Lagi".
2. **Zen Build** (`games/zen-build/`) — mode bebas: tanpa timer/skor/aturan, 5 potongan (beton/kayu/bata/kaca/atap) tak terbatas, undo + clear; langit senja + kunang-kunang + bayangan panjang; ghost preview; suara lembut.
3. **Stack Menara** (`games/stack/`) — balok meluncur, ketuk untuk jatuhkan; overhang terpotong jadi puing jatuh; perfect = lebar penuh + glow + slow-mo + kombo; kamera naik mengikuti menara; langit siang → senja → malam berbintang (transisi di ketinggian 8 & 16); game over hanya jika meleset total; best score di localStorage.

**Menu** (`GameSpaceOverlay.tsx`): 4 kartu gradien kaya (demolition oranye, zen senja, stack ungu, build biru) + badge (PELEPAS STRES/SANTAI/FOKUS), deskripsi, meta. **CSS** (`game-space.css`): tema kartu, vignette overlay di canvas (depth), progress bar demolition, hint bar, badge kombo, reduced-motion.

### 9.2 Hasil test v2

**Unit (tsx, logika murni):** `src/test/gameSpaceV2.test.ts` — **18/18 PASS**: generasi gedung deterministik 44 blok, hit langsung vs cascade (kolom roboh 6 blok, tower ikut 8 blok), miss tidak mengubah skor, jendela kombo 1.5 dtk, 100% → won; zen place/undo/clear/bounds; stack mover bounce, perfect/slice/miss, footprint benar saat sumbu berganti (bug logika sumbu-z tertangkap & diperbaiki sebelum test), akumulasi bonus kombo.

**Browser (Playwright + Chromium SwiftShader, harness throwaway yang sudah dihapus):** **18/18 PASS** —
- demolition: tap canvas asli → skor 50; cascade → skor 230 & 39%; HUD sinkron; activeCount 1→0; 0 console error.
- zen: tap asli → count 1; 20 potongan via probe; HUD sinkron; activeCount 1→0; 0 console error.
- stack: 8 perfect deterministik → skor 44 + kombo 8 (sesuai rumus); tap asli tidak crash; activeCount 1→0; 0 console error.
- mobile 390px touch: tap menghancurkan blok, tanpa overflow horizontal.
- **tsc scoped** `src/game-space/**`: 0 error. **Regresi:** gameSpace.test.ts 54/54, chatAiContextAware 25/25 — tetap hijau.

**Review visual (screenshot dibaca manual):** demolition — gedung kaca/beton bertekstur + puing beterbangan + debu + rubble + hazard ring + langit gradien = layak "game asli" ✅; zen — senja lembut + potongan bata/kayu/kaca bertekstur + kunang-kunang ✅ (langit sempat terlalu jenuh → diperbaiki via kompresi gradien sky dome + koreksi output color space); stack — menara gradien + langit senja bergradasi + badge Perfect x8 ✅ (awan sempat menutupi langit → opacity dikecilkan & digeser ke tepi); menu 4 kartu gradien ✅.

### 9.3 Yang belum terverifikasi / catatan

1. **Jalur chat-penuh-di-browser** (ketik `game` di chat nyata) tetap NOT TESTED — batasan pre-existing (aplikasi penuh tidak bisa di-mount di headless sandbox). Wiring tidak berubah dari v1 (sudah teruji).
2. **SFX di perangkat nyata** belum didengar telinga manusia — WebAudio prosedural teruji tidak error di headless; verifikasi rasa di preview.
3. **Performa di HP kentang**: pixel ratio dibatasi + partikel pooled, tetapi belum diukur FPS di device low-end — disarankan uji di HP user.
4. Full-project `tsc`/`vite build` tidak dijalankan (pre-existing OOM & canvg); scoped tsc game-space bersih.
5. File throwaway test (`test-harness.tsx`, `scripts/gs-*.mjs`) sudah dihapus; yang tersisa hanya kode produk + `src/test/gameSpaceV2.test.ts`.

**File baru (17):** `fx/{textures,audio,particles,juice,BaseEngine}.ts`, `games/demolition/{logic,DemolitionEngine,Demolition}.tsx`, `games/zen-build/{logic,ZenEngine,ZenBuild}.tsx`, `games/stack/{logic,StackEngine,Stack}.tsx`, `src/test/gameSpaceV2.test.ts`. **Diubah (3):** `GameSpaceOverlay.tsx` (4 kartu + lazy), `game-space.css` (v2 styles), laporan ini.

## 10. Game Space REBUILD — 10 game 2D canvas (2026-10-19)

**Latar:** user menolak 3 game 3D v2 ("jelek"). Diganti total dengan 10 game 2D canvas kelas "game asli", semua bertema konstruksi + humor "frustasi estimator/konsultan". Dihapus: `games/zen-build/`, `games/stack/`, `games/demolition/` (3D), `src/test/gameSpaceV2.test.ts`. Dipertahankan: `games/build-challenge/` (apa adanya), `fx/audio.ts` (sfx dipakai ulang).

### 10.1 Arsitektur 2D

Shared kit baru `src/game-space/engine2d/` (kontrak di `engine2d/README.md`):
- `helpers.ts` — rand/clamp/lerp/AABB/distToSegment/ease/fmtTime (pure, testable)
- `canvas.ts` — DPR-resize (cap 2x)
- `loop.ts` — rAF fixed-timestep 60Hz + pause + spiral guard
- `input.ts` — Pointer Events (mouse+touch) + keyboard (edge-trigger `wasPressed`)
- `particles.ts` — pool 700 partikel 2D (circle/rect/spark), hormati reduced-motion
- `juice2d.ts` — Shake2D (trauma-based), FloatScores (teks melayang di canvas), popText (popup DOM)
- `audio.ts` — re-export `sfx` (WebAudio prosedural, tanpa aset)
- `best.ts` — best score localStorage (guarded)
- `useGameCanvas.ts` — hook React: canvas + loop + input + particles + shake + scores + auto-resize + pushHud throttled

Pola tiap game: `games/<slug>/{logic.ts (pure), <Nama>.tsx (default export, props {onExit}), logic.test.ts}`. Menu `GameSpaceOverlay.tsx` ditulis ulang: 11 kartu lazy (10 baru + Build Challenge).

### 10.2 Daftar game

| # | Game | Konsep | Level/progression |
|---|------|--------|-------------------|
| 1 | Bongkar Rumah 💥 | Ketuk blok rumah sampai rata; fisika runtuh berantai | 4 level (rumah→ruko→apartemen→tower), kombo x5, best % |
| 2 | Flappy Mandor 🪖 | Flappy bird mandor berhelm vs crane & balok | Gap/speed naik, medali per 10 gate |
| 3 | Ketapel Konstruksi 🎯 | Angry-birds: wrecking ball robohkan struktur + berkas REV-13 | 10 level, bintang 1–3 persist |
| 4 | Lari Proyek 🏃 | Endless runner: lompat/nunduk, bata jatuh berperingatan | Speed tier, langit siang→malam, helm +50 |
| 5 | Sudoku Tukang 🧩 | Sudoku 9×9, generator solusi-unik | 4 difficulty, notes, hint 3×, 3 salah = gagal, best time |
| 6 | Selamatkan Mandor ✏️ | Save-the-dog: gambar garis lindungi mandor | 15 level, ink meter, fisika pantul |
| 7 | Tebas Material 🍉 | Fruit-ninja swipe; awas dinamit | Wave makin cepat, kombo, 3 nyawa |
| 8 | Sambung Kata 🔤 | Word-connect kosakata konstruksi ID (80+ kata) | 3 pack × 20 level, hint, progress persist |
| 9 | Gabung Blok 🧱 | 2048: BATA→…→MENARA (8 tier) | Best score, lanjut setelah menang |
| 10 | Head Soccer Mandor ⚽ | Head soccer vs AI | Turnamen 5 level AI, 60 dtk, sudden death |

Semua game: tutorial overlay, pause, mute, best score, juice (partikel/shake/sfx/popup), layar menang/kalah + teks humor estimator, 390px touch, reduced-motion.

### 10.3 Hasil test (dijalankan ulang independen oleh koordinator)

| Game | Unit test |
|------|-----------|
| bongkar-rumah | 19/19 |
| flappy-mandor | 17/17 |
| ketapel-konstruksi | 26/26 |
| lari-proyek | 26/26 |
| sudoku-tukang | 28/28 |
| selamatkan-mandor | 16/16 |
| tebas-material | 20/20 |
| sambung-kata | 85/85 |
| gabung-blok | 25/25 |
| head-soccer-mandor | 25/25 |
| **Total baru** | **287/287** |
| gameSpace.test.ts (lama) | 54/54 |

- `tsc` scoped (engine2d + overlay + 10 game): 0 error.
- Screenshot Playwright per game (harness /tmp/gs2d-w1..w5): tiap worker membaca & mengiterasi sendiri; koordinator spot-check independen (ketapel, lari-proyek) — **lolos "seperti game asli"** (objek berlapis base+highlight+outline+detail, background gradien + parallax, bayangan, partikel). 0 console/page error di semua sesi.
- Dikerjakan 5 worker paralel (2 game/worker), masing-masing: implementasi penuh + test + screenshot + review visual sendiri.

### 10.4 Yang belum terverifikasi / catatan

1. **Jalur chat-penuh-di-browser** tetap NOT TESTED (batasan pre-existing).
2. **SFX di perangkat nyata** belum didengar (WebAudio butuh gesture; wiring benar di headless).
3. **HP fisik** — pointer events menyatukan mouse+touch, belum diuji di device nyata.
4. **Performa HP low-end** belum diukur FPS (DPR cap 2, partikel pooled).
5. Full-project `tsc`/`vite build` tidak dijalankan (pre-existing OOM & canvg).
6. File game: 10 folder × 3 file + engine2d (11 file + README). Semua uncommitted — menunggu push oleh parent.
