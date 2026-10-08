/**
 * ProjectHistory — undo/redo engine terisolasi per proyek.
 *
 * Dibuat untuk memperbaiki P0-A: history undo/redo sebelumnya adalah flat array
 * tanpa projectId, sehingga snapshot proyek A bisa diterapkan ke proyek B
 * (Ctrl+Z setelah pindah proyek menimpa data proyek aktif).
 *
 * Jaminan modul ini:
 * 1. Setiap entry terikat pada `projectId` + `docKey` (konteks dokumen/entitas).
 * 2. undo()/redo() TIDAK PERNAH menerapkan entry milik proyek/dokumen lain —
 *    mengembalikan `null` jika entry teratas tidak cocok dengan konteks aktif.
 * 3. History tiap proyek disimpan terpisah (Map), jadi pindah proyek tidak
 *    menghapus history proyek lama; kembali ke proyek A = history A utuh.
 * 4. Murni (tanpa React), sehingga bisa diuji regresi secara deterministik.
 */

export interface HistoryEntry<T> {
  /** Proyek asal snapshot — TIDAK PERNAH diterapkan ke proyek lain. */
  projectId: string;
  /** Konteks dokumen/entitas, mis. 'rab-items', 'qto-items'. */
  docKey: string;
  /** Deep snapshot state pada saat push. */
  items: T[];
  /** Waktu push (ms epoch), untuk diagnosis. */
  ts: number;
}

interface ProjectStack<T> {
  entries: HistoryEntry<T>[];
  index: number; // posisi entry yang sedang aktif; -1 = kosong
}

const MAX_ENTRIES_PER_PROJECT = 100;

export class ProjectHistory<T> {
  private stacks = new Map<string, ProjectStack<T>>();

  private stackKey(projectId: string, docKey: string): string {
    return `${projectId}::${docKey}`;
  }

  private getStack(projectId: string, docKey: string): ProjectStack<T> {
    const key = this.stackKey(projectId, docKey);
    let stack = this.stacks.get(key);
    if (!stack) {
      stack = { entries: [], index: -1 };
      this.stacks.set(key, stack);
    }
    return stack;
  }

  /**
   * Rekam snapshot baru. Entry selalu diberi label projectId+docKey eksplisit
   * dari pemanggil — modul tidak menebak konteks dari state global.
   */
  push(projectId: string, docKey: string, items: T[]): void {
    if (!projectId || !docKey) return;
    const stack = this.getStack(projectId, docKey);
    const trimmed = stack.entries.slice(0, stack.index + 1);
    const snapshot: T[] = JSON.parse(JSON.stringify(items));
    trimmed.push({ projectId, docKey, items: snapshot, ts: Date.now() });
    // Batasi memori: buang entry tertua, jaga index tetap valid.
    const bounded =
      trimmed.length > MAX_ENTRIES_PER_PROJECT
        ? trimmed.slice(trimmed.length - MAX_ENTRIES_PER_PROJECT)
        : trimmed;
    stack.entries = bounded;
    stack.index = bounded.length - 1;
  }

  /**
   * Undo: kembalikan snapshot SEBELUM posisi aktif.
   * Mengembalikan `null` (tanpa efek samping) bila:
   * - tidak ada history untuk proyek/dokumen ini, atau
   * - entry target tidak cocok dengan projectId/docKey yang diminta.
   */
  undo(projectId: string, docKey: string): T[] | null {
    if (!projectId || !docKey) return null;
    const stack = this.getStack(projectId, docKey);
    if (stack.index <= 0) return null;
    const target = stack.entries[stack.index - 1];
    // Verifikasi ganda: entry harus milik konteks yang meminta.
    if (!target || target.projectId !== projectId || target.docKey !== docKey) {
      return null;
    }
    stack.index -= 1;
    return JSON.parse(JSON.stringify(target.items));
  }

  /**
   * Redo: majukan ke snapshot SETELAH posisi aktif.
   * Aturan keamanan sama dengan undo().
   */
  redo(projectId: string, docKey: string): T[] | null {
    if (!projectId || !docKey) return null;
    const stack = this.getStack(projectId, docKey);
    if (stack.index < 0 || stack.index >= stack.entries.length - 1) return null;
    const target = stack.entries[stack.index + 1];
    if (!target || target.projectId !== projectId || target.docKey !== docKey) {
      return null;
    }
    stack.index += 1;
    return JSON.parse(JSON.stringify(target.items));
  }

  canUndo(projectId: string, docKey: string): boolean {
    if (!projectId || !docKey) return false;
    const stack = this.getStack(projectId, docKey);
    return stack.index > 0;
  }

  canRedo(projectId: string, docKey: string): boolean {
    if (!projectId || !docKey) return false;
    const stack = this.getStack(projectId, docKey);
    return stack.index >= 0 && stack.index < stack.entries.length - 1;
  }

  /** Jumlah entry tersimpan untuk konteks ini (untuk test/diagnosis). */
  size(projectId: string, docKey: string): number {
    return this.getStack(projectId, docKey).entries.length;
  }

  /**
   * Hapus history satu proyek/dokumen. Dipakai hanya saat proyek dihapus —
   * BUKAN saat pindah proyek (history per proyek dipertahankan).
   */
  clearProject(projectId: string, docKey?: string): void {
    if (!projectId) return;
    for (const key of Array.from(this.stacks.keys())) {
      if (docKey ? key === this.stackKey(projectId, docKey) : key.startsWith(`${projectId}::`)) {
        this.stacks.delete(key);
      }
    }
  }
}
