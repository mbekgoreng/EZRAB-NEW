/**
 * Scroll ke target hash sesudah mount (Batch G1, D-04 + D-35).
 *
 * Masalah: pada fresh load, scroll anchor bawaan browser berjalan
 * SEBELUM React me-mount section target (apalagi halaman lazy seperti
 * /fitur), sehingga pengguna mendarat di hero. Penanganan lama memakai
 * `setTimeout` tetap (150–250 ms) yang diam-diam gagal bila chunk
 * lambat dimuat.
 *
 * Helper ini mencoba segera, lalu MENGULANG sampai elemen ada (maks.
 * ~3 detik) — pola yang sama dengan `goLandingSection` di navbar.
 * Mengembalikan fungsi cleanup untuk `useEffect`.
 */

/** Jarak atas agar target tidak tertutup navbar fixed (52px + ruang). */
export const HASH_SCROLL_OFFSET_PX = 70;
/** Batas percobaan & jeda antar percobaan (20 × 150 ms ≈ 3 detik). */
export const HASH_SCROLL_MAX_ATTEMPTS = 20;
export const HASH_SCROLL_RETRY_MS = 150;

export function scrollToHashTarget(
  hash: string,
  opts?: { maxAttempts?: number; retryMs?: number }
): () => void {
  const id = decodeURIComponent(hash.replace(/^#/, '')).trim();
  if (!id || typeof document === 'undefined') return () => {};
  const maxAttempts = opts?.maxAttempts ?? HASH_SCROLL_MAX_ATTEMPTS;
  const retryMs = opts?.retryMs ?? HASH_SCROLL_RETRY_MS;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;

  const tryScroll = () => {
    if (cancelled) return;
    const el = document.getElementById(id);
    if (el) {
      const top =
        el.getBoundingClientRect().top + window.scrollY - HASH_SCROLL_OFFSET_PX;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      return;
    }
    attempts += 1;
    if (attempts < maxAttempts) {
      timer = setTimeout(tryScroll, retryMs);
    }
    // Bila target tidak pernah muncul (hash tidak dikenal / halaman
    // lain), diam — bukan error.
  };

  tryScroll();
  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
