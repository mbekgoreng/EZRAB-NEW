/**
 * EZRAB AI Design — Persistensi Desain (localStorage)
 *
 * Menyimpan HouseSpec per proyek ID di localStorage.
 * Key: `ezrab_designs` → Record<projectId, SavedDesign[]>
 *
 * BATASAN: Ini penyimpanan lokal perangkat (bukan backend server).
 * Backend/persistensi server = BLOCKED (menunggu VPS).
 */

import type { HouseSpec } from './specEngine';

export interface SavedDesign {
  id: string;
  projectId: string;
  name: string;
  spec: HouseSpec;
  savedAt: number;
  version: 1;
}

const STORAGE_KEY = 'ezrab_designs';

function loadAll(): Record<string, SavedDesign[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, SavedDesign[]>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Simpan desain. Tidak menimpa desain lain (id unik).
 */
export function saveDesign(projectId: string, name: string, spec: HouseSpec): SavedDesign {
  const all = loadAll();
  const design: SavedDesign = {
    id: `design-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    name,
    spec,
    savedAt: Date.now(),
    version: 1,
  };
  const list = all[projectId] || [];
  list.push(design);
  all[projectId] = list;
  saveAll(all);
  return design;
}

/**
 * Daftar desain untuk proyek.
 */
export function listDesigns(projectId: string): SavedDesign[] {
  const all = loadAll();
  return (all[projectId] || []).slice().sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Ambil satu desain.
 */
export function getDesign(projectId: string, designId: string): SavedDesign | null {
  return listDesigns(projectId).find(d => d.id === designId) || null;
}

/**
 * Hapus desain.
 */
export function deleteDesign(projectId: string, designId: string): boolean {
  const all = loadAll();
  const list = all[projectId] || [];
  const filtered = list.filter(d => d.id !== designId);
  if (filtered.length === list.length) return false;
  all[projectId] = filtered;
  saveAll(all);
  return true;
}

/**
 * Verifikasi round-trip: simpan → muat → bandingkan.
 * Mengembalikan true jika spec identik.
 */
export function verifyRoundTrip(original: HouseSpec, loaded: HouseSpec): {
  identical: boolean;
  diffs: string[];
} {
  const diffs: string[] = [];
  if (original.buildingWidthM !== loaded.buildingWidthM) diffs.push('buildingWidthM');
  if (original.buildingLengthM !== loaded.buildingLengthM) diffs.push('buildingLengthM');
  if (original.buildingAreaM2 !== loaded.buildingAreaM2) diffs.push('buildingAreaM2');
  if (original.floors !== loaded.floors) diffs.push('floors');
  if (original.rooms.length !== loaded.rooms.length) diffs.push(`rooms.length (${original.rooms.length} vs ${loaded.rooms.length})`);
  for (let i = 0; i < Math.min(original.rooms.length, loaded.rooms.length); i++) {
    const a = original.rooms[i], b = loaded.rooms[i];
    if (a.name !== b.name || a.widthM !== b.widthM || a.lengthM !== b.lengthM || a.areaM2 !== b.areaM2) {
      diffs.push(`room[${i}]: ${a.name} vs ${b.name}`);
    }
  }
  return { identical: diffs.length === 0, diffs };
}
