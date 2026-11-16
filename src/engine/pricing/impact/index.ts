/**
 * MASTER PRICING §9 — impact preview barrel.
 *
 * The real impact calculator (`masterPriceImpactPreview.ts`) + the
 * workspace project collector (`workspaceProjectCollector.ts`).
 * The calculator is pure (no storage, no mutation); the collector only
 * reads the workspace stores.
 */
export * from './masterPriceImpactPreview';
export * from './workspaceProjectCollector';
