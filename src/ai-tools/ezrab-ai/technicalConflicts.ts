/**
 * technicalConflicts.ts — DETEKSI KONFLIK TEKNIS (AI Intelligence
 * Overhaul Fase 4 — Construction Intelligence).
 *
 * Spek yang bertentangan secara teknis terdeteksi DETERMINISTIK dan
 * dicatat sebagai konflik — TIDAK PERNAH dipilih diam-diam. Aturan di
 * sini hanya memakai geometri/logika yang dapat dibuktikan dari data
 * yang ada (bukan standar yang dikarang):
 *
 *  - luas bangunan > luas tanah → KONFLIK (geometri mustahil);
 *  - tinggi < lantai × 2,4 m → KONFLIK (ambang minimum eksplisit
 *    2,4 m/lantai, dinyatakan sebagai asumsi — bukan SNI);
 *  - volume ≠ panjang × lebar × kedalaman (selisih >10%) → KONFLIK;
 *  - atap genteng + struktur dak beton (keduanya terkonfirmasi) → KONFLIK;
 *  - budget total > cap (dari penilaian kelayakan) → KONFLIK budget vs lingkup;
 *  - dua nilai berbeda untuk kunci spek yang sama → KONFLIK
 *    (diselesaikan lewat resolusi konflik memori Fase 2 bila relevan).
 *
 * Konflik yang dicatat dapat direkam ke memori Fase 2
 * (`storeMemoryWithConflictResolution`) bila scope diberikan — nilai
 * yang bertentangan TIDAK menimpa nilai kini diam-diam (semantik
 * memori: eksplisit → supersede; tidak jelas → contradictory).
 */

import type { StructuredSpec } from './structuredSpec';
import type { BuildingModel } from './multiBuilding';
import {
  storeMemoryWithConflictResolution,
  createMemoryRecord,
  type MemoryScope,
} from './memory';

export type TechnicalConflictKind =
  | 'area-exceeds-land'
  | 'height-vs-floors'
  | 'volume-vs-dimensions'
  | 'material-vs-structure'
  | 'budget-vs-scope'
  | 'duplicate-spec-value';

export interface TechnicalConflict {
  kind: TechnicalConflictKind;
  /** Yang bertentangan, dalam bahasa pengguna. */
  detail: string;
  /** Nilai-nilai yang bertentangan (untuk audit). */
  values: Record<string, string | number | null>;
  severity: 'high' | 'medium';
  /** Yang harus terjadi: selalu keputusan pengguna (bukan auto-pilih). */
  resolution: 'needs-user-decision';
}

export interface ConflictDetectionInput {
  specs?: StructuredSpec[];
  /** Dimensi pengguna (dari konteks intake / draft spec). */
  dimensions?: {
    landAreaM2?: number | null;
    buildingAreaM2?: number | null;
    lengthM?: number | null;
    widthM?: number | null;
    depthM?: number | null;
    heightM?: number | null;
    floors?: number | null;
    volumeM3?: number | null;
  };
  buildings?: BuildingModel[];
  /** Total berharga + cap (bila keduanya diketahui). */
  budget?: { totalPriced?: number | null; cap?: number | null };
}

function specText(s: StructuredSpec): string {
  if (s.value == null) return '';
  return Array.isArray(s.value) ? s.value.join(' ') : String(s.value);
}

function specNumber(s: StructuredSpec): number | null {
  const v = s.value;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.,-]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function detectTechnicalConflicts(input: ConflictDetectionInput): TechnicalConflict[] {
  const out: TechnicalConflict[] = [];
  const dims = input.dimensions ?? {};
  const specs = input.specs ?? [];

  // 1. Luas bangunan melebihi luas tanah (geometri mustahil).
  if (dims.landAreaM2 != null && dims.buildingAreaM2 != null && dims.buildingAreaM2 > dims.landAreaM2) {
    out.push({
      kind: 'area-exceeds-land',
      detail: `Luas bangunan ${dims.buildingAreaM2} m² melebihi luas tanah ${dims.landAreaM2} m² — tidak mungkin dibangun dalam tapak itu.`,
      values: { buildingAreaM2: dims.buildingAreaM2, landAreaM2: dims.landAreaM2 },
      severity: 'high',
      resolution: 'needs-user-decision',
    });
  }

  // 2. Tinggi vs jumlah lantai (ambang minimum eksplisit 2,4 m/lantai).
  const floors = dims.floors ?? (input.buildings?.[0]?.floors ?? null);
  if (dims.heightM != null && floors != null && floors > 0) {
    const minHeight = floors * 2.4;
    if (dims.heightM < minHeight) {
      out.push({
        kind: 'height-vs-floors',
        detail: `Tinggi ${dims.heightM} m tidak cukup untuk ${floors} lantai (minimum asumsi 2,4 m/lantai = ${minHeight.toFixed(1)} m).`,
        values: { heightM: dims.heightM, floors, minHeight },
        severity: 'high',
        resolution: 'needs-user-decision',
      });
    }
  }
  // Per bangunan (multi-gedung): tiap bangunan diperiksa sendiri.
  for (const b of input.buildings ?? []) {
    if (b.floors != null && dims.heightM == null) continue; // tanpa tinggi bangunan itu, tak dapat dinilai
  }

  // 3. Volume vs dimensi (selisih >10% dari L×W×kedalaman).
  if (
    dims.volumeM3 != null &&
    dims.lengthM != null &&
    dims.widthM != null &&
    dims.depthM != null &&
    dims.lengthM > 0 && dims.widthM > 0 && dims.depthM > 0
  ) {
    const expected = dims.lengthM * dims.widthM * dims.depthM;
    const diff = Math.abs(dims.volumeM3 - expected) / expected;
    if (diff > 0.1) {
      out.push({
        kind: 'volume-vs-dimensions',
        detail: `Volume ${dims.volumeM3} m³ tidak cocok dengan dimensi ${dims.lengthM}×${dims.widthM}×${dims.depthM} m (= ${expected.toFixed(1)} m³; selisih ${(diff * 100).toFixed(0)}%).`,
        values: { volumeM3: dims.volumeM3, expectedVolumeM3: Number(expected.toFixed(2)) },
        severity: 'medium',
        resolution: 'needs-user-decision',
      });
    }
  }

  // 4. Material vs struktur: genteng + dak beton terkonfirmasi bersamaan.
  const roofText = specs
    .filter((s) => /roof|atap/.test(s.key))
    .map((s) => specText(s).toLowerCase())
    .join(' ');
  if (roofText.includes('genteng') && roofText.includes('dak beton')) {
    out.push({
      kind: 'material-vs-structure',
      detail: 'Atap Genteng dan Dak Beton sama-sama terkonfirmasi — keduanya tidak dapat menjadi penutup atap yang sama.',
      values: { roofSpecs: roofText },
      severity: 'high',
      resolution: 'needs-user-decision',
    });
  }

  // 5. Budget vs lingkup: total berharga melebihi cap.
  if (
    input.budget?.totalPriced != null &&
    input.budget?.cap != null &&
    input.budget.totalPriced > input.budget.cap
  ) {
    out.push({
      kind: 'budget-vs-scope',
      detail: `Total ${input.budget.totalPriced.toLocaleString('id-ID')} melebihi budget ${input.budget.cap.toLocaleString('id-ID')} — lingkup melebihi anggaran.`,
      values: { totalPriced: input.budget.totalPriced, cap: input.budget.cap },
      severity: 'medium',
      resolution: 'needs-user-decision',
    });
  }

  // 6. Dua nilai berbeda untuk kunci spek yang sama (duplikat di daftar spek).
  const byKey = new Map<string, StructuredSpec[]>();
  for (const s of specs) {
    const list = byKey.get(s.key) ?? [];
    list.push(s);
    byKey.set(s.key, list);
  }
  for (const [key, list] of byKey) {
    const distinct = new Set(list.map((s) => JSON.stringify(s.value)));
    if (list.length > 1 && distinct.size > 1) {
      out.push({
        kind: 'duplicate-spec-value',
        detail: `Spek "${list[0].label || key}" punya dua nilai berbeda: ${[...distinct].join(' vs ')} — pilih satu, jangan gabung diam-diam.`,
        values: { key, values: [...distinct].join(' | ') },
        severity: 'medium',
        resolution: 'needs-user-decision',
      });
    }
  }
  void specNumber;

  return out;
}

/** Baris konflik untuk pesan draft / jawaban (selalu eksplisit). */
export function formatConflictLines(conflicts: TechnicalConflict[]): string[] {
  if (conflicts.length === 0) return [];
  const lines = ['**Konflik teknis terdeteksi — perlu keputusan Anda (tidak dipilih diam-diam):**'];
  for (const c of conflicts) lines.push(`• [${c.kind}] ${c.detail}`);
  return lines;
}

/**
 * Rekam konflik ke memori Fase 2 (opsional): satu record per konflik,
 * kualitas 'contradictory', lewat resolusi konflik memori yang sudah
 * ada — nilai kini TIDAK ditimpa. Mengembalikan jumlah yang terekam.
 */
export function recordConflictsToMemory(
  conflicts: TechnicalConflict[],
  scope: MemoryScope,
): { recorded: number; errors: string[] } {
  let recorded = 0;
  const errors: string[] = [];
  for (const c of conflicts) {
    const rec = createMemoryRecord({
      userId: scope.userId ?? null,
      projectId: scope.projectId ?? null,
      conversationId: scope.conversationId ?? null,
      layer: 'project',
      memoryKey: `technical-conflict:${c.kind}`,
      content: c.detail,
      memoryType: 'fact',
      quality: 'contradictory',
      importance: c.severity === 'high' ? 3 : 2,
      confidence: c.severity === 'high' ? 0.9 : 0.7,
      sourceType: 'system-consolidation',
      sourceMessageId: null,
      provenance: 'deteksi konflik teknis deterministik Fase 4',
      structuredPayload: { kind: c.kind, values: c.values, resolution: c.resolution },
    });
    if (!rec.ok) {
      errors.push(`gagal membuat record konflik ${c.kind}`);
      continue;
    }
    const stored = storeMemoryWithConflictResolution(rec.value, scope);
    if (stored.ok) recorded++;
    else errors.push(`gagal menyimpan konflik ${c.kind}`);
  }
  return { recorded, errors };
}
