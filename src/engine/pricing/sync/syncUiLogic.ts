/**
 * MASTER PRICING §13 — SYNC ADMIN GATE (pure view-model).
 * ========================================================
 *
 * The admin trigger for the price sync (§13 capability (3)) is the
 * `price:sync` CLI — a build operation the operator runs and reviews
 * (reconciliation report + git diff) before any deploy. The browser
 * cannot run the pipeline, so the console UI does NOT offer a live
 * "sync now" button: it shows the gate (which is DENIED in the
 * frontend-only state, honestly — §4.1 BLOCKED) plus the CLI command
 * to run. When §4.1 opens, the same gate allows a verified global
 * admin and the UI can offer the trigger through the admin API.
 *
 * `syncAdminGate` authorizes PUBLISH_PRICE_UPDATE via the SYNC
 * channel (§4) and shapes the result as the §11 AdminGateViewModel
 * plus the CLI commands. The last-sync state is an honest empty
 * state: the browser cannot read the JSONL trail
 * (data/price2026/reports/sync_history.jsonl) — the same limitation
 * as the §4.4 history in §11.
 */
import {
  adminGateForOperation,
  type AdminGateViewModel,
} from '../admin/masterPricingUiLogic';
import type { MasterPriceIdentity } from '../admin/masterPriceAuthorization';

export interface SyncAdminGateViewModel extends AdminGateViewModel {
  /** The admin-triggered sync command (run in the repo, then review the reconciliation report). */
  cliCommand: string;
  /** The dry-run command (reports what WOULD change, writes nothing). */
  cliDryRunCommand: string;
  /** The AHSP pointer-sync command (§13.5 — generates the Postgres upsert SQL). */
  cliPointerSyncCommand: string;
}

export const SYNC_CLI_COMMAND = 'npm run price:sync';
export const SYNC_CLI_DRY_RUN_COMMAND = 'npm run price:sync -- --dry-run';
export const SYNC_CLI_POINTER_SYNC_COMMAND = 'npm run ahsp:sync-pointers -- --dry-run';

export function syncAdminGate(identity?: MasterPriceIdentity): SyncAdminGateViewModel {
  const gate = adminGateForOperation('PUBLISH_PRICE_UPDATE', identity, 'SYNC');
  return {
    ...gate,
    cliCommand: SYNC_CLI_COMMAND,
    cliDryRunCommand: SYNC_CLI_DRY_RUN_COMMAND,
    cliPointerSyncCommand: SYNC_CLI_POINTER_SYNC_COMMAND,
  };
}
