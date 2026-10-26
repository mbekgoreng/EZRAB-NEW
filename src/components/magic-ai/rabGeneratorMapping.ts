/**
 * Pemetaan item AI mentah → item review (ekstrak dari RabGeneratorModal
 * yang sudah dihapus — komponennya mati, helper murni ini tetap dipakai
 * dan dites F5 4.6).
 */

export interface GeneratedWorkItem {
  description: string;
  category: string;
  /** F5 (4.6): null = the model did NOT provide a volume. Never silently 1. */
  volume: number | null;
  unit: string;
  unitPrice: number | null;
  ahspCode: string;
  notes: string;
}

/**
 * F5 (4.6): map raw model output onto review items. A volume is accepted
 * ONLY when it is a finite number > 0; anything else (missing, string,
 * zero/negative) becomes null = "volume belum ditentukan" and blocks saving
 * until the user fills it in. Previously a missing volume was silently
 * replaced with 1 — a fabricated quantity one click away from the RAB.
 */
export function mapAiGeneratedItems(parsed: unknown): GeneratedWorkItem[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((p: any) => ({
    description: p?.description || '',
    category: p?.category || 'Lainnya',
    volume:
      typeof p?.volume === 'number' && Number.isFinite(p.volume) && p.volume > 0
        ? p.volume
        : null,
    unit: p?.unit || 'm²',
    unitPrice: typeof p?.unitPrice === 'number' && Number.isFinite(p.unitPrice) ? p.unitPrice : null,
    ahspCode: p?.ahspCode || '',
    notes: p?.notes || '',
  }));
}

/** Indexes of items whose volume is still undetermined (save gate). */
export function missingVolumeIndexes(items: GeneratedWorkItem[]): number[] {
  const out: number[] = [];
  items.forEach((item, idx) => {
    if (item.volume === null) out.push(idx);
  });
  return out;
}
