/**
 * sidebarSubmenuEvents — event bersama untuk membuka submenu sidebar dari
 * luar Sidebar (tur terpandu).
 *
 * D-16 / D-86 (Batch G2, 2026-11-14): langkah tur yang menarget item di
 * dalam submenu yang tertutup (RAB / Database) tidak pernah menemukan
 * targetnya di DOM — Spotlight & FeatureTutorialPlayer lalu melewati
 * langkah itu (D-16: langkah 4 lompat ke 6; D-86: tutorial AHSP mulai
 * di langkah 2). Submenu adalah state lokal Sidebar, jadi tur meminta
 * pembukaan lewat event window — pola yang sama dengan
 * `ezrab:open-dashboard-tour` di OnboardingOrchestrator.
 *
 * Sidebar mendengarkan event ini dan membuka submenu yang diminta.
 * Pengirim bertanggung jawab menunggu render ulang (Spotlight memakai
 * retry tertunda; FeatureTutorialPlayer memakai waitForSelector 4,5 dtk).
 */

export type SidebarSubmenuId = 'rab' | 'database';

export const EXPAND_SIDEBAR_SUBMENU_EVENT = 'ezrab:expand-sidebar-submenu';

/** Minta Sidebar membuka submenu yang berisi target langkah tur. */
export function expandSidebarSubmenu(which: SidebarSubmenuId): void {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent(EXPAND_SIDEBAR_SUBMENU_EVENT, { detail: which }),
      );
    }
  } catch {
    /* lingkungan non-DOM (tes) — abaikan */
  }
}
