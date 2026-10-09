/**
 * EZRAB AI — Project Context Builder (src/ai-tools/ezrab-ai/projectContext.ts)
 *
 * Builds a read-only, bounded snapshot of the ACTIVE project for AI grounding.
 * Rules:
 * - Data comes from the app's real state (ProjectContext), never fabricated.
 * - Totals are deterministic: sum of item totalPrice; PRICE_UNRESOLVED items contribute 0.
 * - Bounded: at most 25 items in the snapshot to avoid unbounded prompt growth.
 * - Read-only: this module never mutates project data.
 */

export interface ProjectItemSnapshot {
  id: string;
  code: string;
  description: string;
  unit: string;
  volume: number;
  unitPrice: number | null;
  totalPrice: number;
  priceStatus: 'PRICE_RESOLVED' | 'PRICE_UNRESOLVED';
  sectionName: string;
}

export interface ProjectSnapshot {
  projectId: string;
  projectName: string;
  itemCount: number;
  /** Deterministic direct total: sum of resolved item totals. Unresolved items contribute 0. */
  totalDirect: number;
  unresolvedCount: number;
  unresolvedItems: ProjectItemSnapshot[];
  items: ProjectItemSnapshot[];
  truncated: boolean;
}

const MAX_ITEMS = 25;

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function buildProjectSnapshot(
  project: { id: string; name: string } | null | undefined,
  rabItems: Array<Record<string, unknown>> | null | undefined,
): ProjectSnapshot | null {
  if (!project?.id) return null;
  const items = Array.isArray(rabItems) ? rabItems : [];

  const snapshots: ProjectItemSnapshot[] = items.map((it) => {
    const status =
      it.priceStatus === 'PRICE_UNRESOLVED' ? 'PRICE_UNRESOLVED' : 'PRICE_RESOLVED';
    const volume = toNumber(it.volume);
    const rawPrice = it.unitPrice;
    const unitPrice =
      rawPrice === null || rawPrice === undefined || rawPrice === ''
        ? null
        : toNumber(rawPrice);
    // Deterministic total: unresolved → 0; otherwise stored totalPrice or volume × price.
    const totalPrice =
      status === 'PRICE_UNRESOLVED'
        ? 0
        : toNumber(it.totalPrice) || volume * (unitPrice ?? 0);
    return {
      id: String(it.id ?? ''),
      code: String(it.code ?? ''),
      description: String(it.description ?? ''),
      unit: String(it.unit ?? ''),
      volume,
      unitPrice,
      totalPrice,
      priceStatus: status,
      sectionName: String(it.sectionName ?? it.category ?? ''),
    };
  });

  const totalDirect = snapshots.reduce((s, i) => s + i.totalPrice, 0);
  const unresolvedItems = snapshots.filter((i) => i.priceStatus === 'PRICE_UNRESOLVED');
  const truncated = snapshots.length > MAX_ITEMS;

  return {
    projectId: project.id,
    projectName: project.name,
    itemCount: snapshots.length,
    totalDirect,
    unresolvedCount: unresolvedItems.length,
    unresolvedItems: unresolvedItems.slice(0, MAX_ITEMS),
    items: snapshots.slice(0, MAX_ITEMS),
    truncated,
  };
}

export function formatIDR(n: number): string {
  return `Rp${Math.round(n).toLocaleString('id-ID')}`;
}

/** Compact text summary injected into the AI prompt (bounded). */
export function formatProjectSummary(snap: ProjectSnapshot | null): string {
  if (!snap) return '';
  const lines: string[] = [
    `Proyek aktif: ${snap.projectName} (ID: ${snap.projectId})`,
    `Jumlah item pekerjaan: ${snap.itemCount}`,
    `Total RAB (langsung, deterministik): ${formatIDR(snap.totalDirect)}`,
  ];
  if (snap.unresolvedCount > 0) {
    lines.push(
      `Item belum memiliki harga: ${snap.unresolvedCount} (tidak termasuk dalam total — BUKAN Rp0)`,
    );
    for (const u of snap.unresolvedItems.slice(0, 10)) {
      lines.push(`- ${u.description} (${u.volume} ${u.unit}) — harga belum tersedia`);
    }
  }
  lines.push('Item (maks 25):');
  for (const it of snap.items) {
    const price =
      it.priceStatus === 'PRICE_UNRESOLVED' ? 'harga belum tersedia' : formatIDR(it.unitPrice ?? 0);
    lines.push(
      `- ${it.description}: ${it.volume} ${it.unit} × ${price} = ${formatIDR(it.totalPrice)}`,
    );
  }
  if (snap.truncated) lines.push('(daftar dipotong — gunakan tool get_project_items untuk mencari)');
  return lines.join('\n');
}
