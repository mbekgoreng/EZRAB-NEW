/**
 * MASTER PRICING §9 — WORKSPACE PROJECT COLLECTOR.
 * ================================================
 *
 * Reads the REAL projects in the workspace (the same stores the app
 * itself reads) and shapes them into `ProjectImpactInput[]` for the
 * impact calculator. This is the ONLY §9 module that touches storage,
 * and it only READS — it never writes, never migrates, never seeds.
 *
 * Stores read (exactly the keys `ProjectContext` uses):
 * - `ezrab_prod_projects` — Project[] (versioned envelope or legacy raw).
 * - `ezrab_prod_rab_items` — RabItem[] (flat; filtered by projectId —
 *   the same list `recalculateProjectSummary` totals).
 * - `ezrab_prod_price_overrides` — ProjectPriceOverride[].
 * - `ezrab_prod_estimate_versions` — EstimateVersion[] (for the pricing
 *   mode + version pins of the project's ACTIVE version only; the live
 *   RAB items above are the priced state, not the frozen snapshot).
 *
 * Honesty rules:
 * - A missing key = an empty dataset (a fresh workspace has no
 *   projects — that is a real 0, not an error).
 * - A CORRUPT key = that dataset is skipped and the corruption is
 *   reported in `warnings` (the collector never invents replacement
 *   data, and never fails the whole collection over one bad key).
 * - The pricing mode comes from the project record itself when present
 *   (`pricingMode` — §10's field, stamped LIVE for new projects by
 *   `createProject`, writable via §10's `setProjectPricingMode`), else
 *   the ACTIVE estimate version's mode, else ABSENT — and absent mode
 *   reads as SNAPSHOT_PRICE downstream (Decision D). The collector never
 *   assigns LIVE itself: no project is live until §10 records it.
 * - The cost-summary config is built EXACTLY the way
 *   `recalculateProjectSummary` builds it (project-level
 *   overhead/profit/tax percents over the stored costSummary), so the
 *   preview's baseline totals match the totals the app itself shows.
 * - Demo projects (Premium Demo) are included and flagged `isDemo` —
 *   they are real stored projects; the preview distinguishes them, it
 *   does not hide them.
 * - In a non-browser environment (Node, tests) there is no localStorage:
 *   the default reader returns null for every key and the collection is
 *   honestly empty. Tests inject a fake reader with fixture data.
 */

import type { ProjectImpactInput } from './masterPriceImpactPreview';
import type {
  EstimateVersion,
  Project,
  ProjectCostSummary,
  ProjectPriceOverride,
  RabItem,
} from '../../../types';
import type { ProjectPricingMode } from '../../../data/priceDatabase2026/types';

/** Minimal storage reader (localStorage-compatible). Injectable for tests. */
export interface WorkspaceStorageReader {
  getItem(key: string): string | null;
}

export interface WorkspaceProjectCollection {
  projects: ProjectImpactInput[];
  /** Non-fatal problems (corrupt keys, malformed records) — reported, never hidden. */
  warnings: string[];
  /** Keys read (for audit). */
  sourceKeys: string[];
}

const PROJECTS_KEY = 'ezrab_prod_projects';
const RAB_ITEMS_KEY = 'ezrab_prod_rab_items';
const OVERRIDES_KEY = 'ezrab_prod_price_overrides';
const ESTIMATE_VERSIONS_KEY = 'ezrab_prod_estimate_versions';

/** Default reader: the real localStorage when it exists, else an always-empty reader. */
function defaultReader(): WorkspaceStorageReader {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls && typeof ls.getItem === 'function') {
      return { getItem: (key: string) => ls.getItem(key) };
    }
  } catch {
    // Non-browser environment or denied storage — fall through to empty.
  }
  return { getItem: () => null };
}

/**
 * Parse one store key: versioned envelope (`{v, savedAt, writeId, data}`)
 * or legacy raw JSON (the same two shapes `loadVersioned` accepts).
 * Returns the data array (or [] when missing) plus a warning when the
 * stored value is corrupt or not an array.
 */
function readDataset<T>(
  reader: WorkspaceStorageReader,
  key: string,
  warnings: string[],
): T[] {
  let raw: string | null;
  try {
    raw = reader.getItem(key);
  } catch (e) {
    warnings.push(`${key}: unreadable (${e instanceof Error ? e.message : String(e)}) — dataset skipped`);
    return [];
  }
  if (raw === null || raw === undefined || raw === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnings.push(`${key}: corrupt JSON — dataset skipped (no data invented)`);
    return [];
  }
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    'v' in (parsed as Record<string, unknown>) &&
    'data' in (parsed as Record<string, unknown>)
  ) {
    parsed = (parsed as { data: unknown }).data;
  }
  if (!Array.isArray(parsed)) {
    warnings.push(`${key}: stored value is not an array — dataset skipped`);
    return [];
  }
  return parsed as T[];
}

/**
 * The cost-summary config for one project, built EXACTLY the way
 * `ProjectContext.recalculateProjectSummary` builds it — so the
 * preview's baseline (`recalculateCostSummary` over the stored items
 * with this config) equals the total the app shows for the project.
 */
function costSummaryConfigFor(project: Project): Partial<ProjectCostSummary> {
  const cs = (project.costSummary ?? {}) as Partial<ProjectCostSummary>;
  const p = project as unknown as Record<string, unknown>;
  return {
    ...cs,
    overheadPercent: (p.overheadPercent as number | undefined) ?? undefined,
    profitPercent: (p.profitPercent as number | undefined) ?? cs.profitPercent,
    taxPercent: (p.ppnPercent as number | undefined) ?? cs.taxPercent,
    ppnEnabled: p.ppnEnabled === true,
    pphEnabled: p.pphEnabled === true,
    pphPercent: (p.pphPercent as number | undefined) ?? cs.pphPercent ?? 0,
  };
}

/** The project's active estimate version (by `activeEstimateVersionId`, else the latest by timestamp). */
function activeEstimateVersion(
  project: Project,
  versions: readonly EstimateVersion[],
): EstimateVersion | null {
  const mine = versions.filter((v) => v.projectId === project.id);
  if (mine.length === 0) return null;
  if (project.activeEstimateVersionId) {
    const active = mine.find((v) => v.id === project.activeEstimateVersionId);
    if (active) return active;
  }
  const sorted = [...mine].sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
  return sorted[0] ?? null;
}

function isValidMode(value: unknown): value is ProjectPricingMode {
  return value === 'LIVE_MASTER_PRICE' || value === 'SNAPSHOT_PRICE' || value === 'PROJECT_OVERRIDE';
}

/**
 * Collect the workspace's projects as impact inputs. Pure read: no
 * writes, no mutation of the stored data (the returned inputs reference
 * freshly parsed objects, never live store state).
 */
export function collectWorkspaceProjects(
  reader?: WorkspaceStorageReader | null,
): WorkspaceProjectCollection {
  const storage = reader ?? defaultReader();
  const warnings: string[] = [];
  const sourceKeys = [PROJECTS_KEY, RAB_ITEMS_KEY, OVERRIDES_KEY, ESTIMATE_VERSIONS_KEY];
  const projects = readDataset<Project>(storage, PROJECTS_KEY, warnings);
  const rabItems = readDataset<RabItem>(storage, RAB_ITEMS_KEY, warnings);
  const overrides = readDataset<ProjectPriceOverride>(storage, OVERRIDES_KEY, warnings);
  const versions = readDataset<EstimateVersion>(storage, ESTIMATE_VERSIONS_KEY, warnings);

  const itemsByProject = new Map<string, RabItem[]>();
  for (const item of rabItems) {
    // NOTE: no `as RabItem` cast here — TS only narrows `item.projectId`
    // from a check on the exact reference; the cast defeated narrowing
    // (§9 gate fix 2026-11-16; runtime-identical, casts are erased).
    if (!item || typeof item !== 'object' || typeof item.projectId !== 'string') {
      warnings.push(`${RAB_ITEMS_KEY}: a row has no projectId — row skipped`);
      continue;
    }
    const list = itemsByProject.get(item.projectId);
    if (list) list.push(item);
    else itemsByProject.set(item.projectId, [item]);
  }
  const overridesByProject = new Map<string, ProjectPriceOverride[]>();
  for (const o of overrides) {
    if (!o || typeof o !== 'object' || typeof (o as ProjectPriceOverride).projectId !== 'string') {
      warnings.push(`${OVERRIDES_KEY}: a row has no projectId — row skipped`);
      continue;
    }
    const list = overridesByProject.get(o.projectId);
    if (list) list.push(o);
    else overridesByProject.set(o.projectId, [o]);
  }

  const collected: ProjectImpactInput[] = [];
  for (const project of projects) {
    if (!project || typeof project !== 'object' || typeof (project as Project).id !== 'string') {
      warnings.push(`${PROJECTS_KEY}: a row has no id — project skipped`);
      continue;
    }
    const activeVersion = activeEstimateVersion(project, versions);
    // Mode: the project record first (§10's field, stamped LIVE for
    // new projects by `createProject`), then the active estimate
    // version's mode, else ABSENT (reads as SNAPSHOT downstream —
    // Decision D; the collector never assigns LIVE itself).
    const recordedMode = project.pricingMode;
    let pricingMode: ProjectPricingMode | null = null;
    if (isValidMode(recordedMode)) {
      pricingMode = recordedMode;
    } else if (recordedMode !== undefined && recordedMode !== null) {
      warnings.push(
        `${PROJECTS_KEY}: project ${project.id} carries invalid pricingMode ${JSON.stringify(recordedMode)} — mode treated as absent (SNAPSHOT downstream)`,
      );
    }
    if (pricingMode === null && activeVersion && isValidMode(activeVersion.pricingMode)) {
      pricingMode = activeVersion.pricingMode;
    }
    collected.push({
      projectId: project.id,
      projectName: project.name ?? project.id,
      isDemo: (project as { isDemo?: boolean }).isDemo === true,
      pricingMode,
      pinnedAhspDatabaseVersion: activeVersion?.ahspDatabaseVersion ?? null,
      pinnedMasterPriceVersion: activeVersion?.masterPriceVersion ?? null,
      items: itemsByProject.get(project.id) ?? [],
      costSummary: costSummaryConfigFor(project),
      overrides: overridesByProject.get(project.id) ?? [],
    });
  }
  collected.sort((a, b) => (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0));
  return { projects: collected, warnings, sourceKeys };
}
