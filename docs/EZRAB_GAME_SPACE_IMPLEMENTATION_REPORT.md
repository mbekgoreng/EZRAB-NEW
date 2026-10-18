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
