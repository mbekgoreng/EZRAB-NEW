/**
 * MASTER PRICING §14 need #3 — SYNC ADMIN CARD RENDER TEST.
 *
 * Renders the extracted `SyncAdminCard` (§13 card, extracted §14 so
 * it can be tested without the full console, which needs
 * `useProject()` / ProjectContext) with `renderToStaticMarkup`
 * (node environment — no jsdom needed; the repo precedent is
 * `chatRendering.test.ts`).
 *
 * Asserts the card's honest content: the heading, the gate status
 * (DENIED for the local anonymous identity while §4.1 is BLOCKED),
 * the three CLI commands, and the honest "cannot be read from the
 * browser" empty state for the last sync. The allowed variant is
 * covered via the injected-gate prop (the local identity can never
 * be allowed in the frontend-only state, so the variant is
 * constructed, not faked through a real identity).
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SyncAdminCard } from '../components/masterPricing/SyncAdminCard';
import {
  SYNC_CLI_COMMAND,
  SYNC_CLI_DRY_RUN_COMMAND,
  SYNC_CLI_POINTER_SYNC_COMMAND,
  syncAdminGate,
} from '../engine/pricing/sync/syncUiLogic';

function renderCard(props: Parameters<typeof SyncAdminCard>[0] = {}): string {
  return renderToStaticMarkup(React.createElement(SyncAdminCard, props));
}

describe('§14 need #3 — SyncAdminCard render', () => {
  it('renders the heading and the honest browser limitation', () => {
    const html = renderCard();
    expect(html).toContain('Sinkronisasi harga');
    expect(html).toContain('Browser tidak');
    expect(html).toContain('tidak dapat dibaca dari browser');
    expect(html).toContain('data/price2026/reports/sync_history.jsonl');
  });

  it('default gate is DENIED (local identity is anonymous; §4.1 BLOCKED)', () => {
    const html = renderCard();
    expect(html).toContain('Status gerbang:');
    expect(html).toContain('ditolak');
    expect(html).not.toContain('diizinkan');
    // The gate reason is rendered verbatim (denial code text).
    const gate = syncAdminGate();
    expect(gate.allowed).toBe(false);
    expect(html).toContain(gate.reason);
  });

  it('shows all three CLI commands', () => {
    const html = renderCard();
    expect(html).toContain(SYNC_CLI_DRY_RUN_COMMAND);
    expect(html).toContain(SYNC_CLI_COMMAND);
    expect(html).toContain(SYNC_CLI_POINTER_SYNC_COMMAND);
    expect(html).toContain('laporkan yang AKAN berubah');
    expect(html).toContain('jalankan sinkronisasi');
    expect(html).toContain('hasilkan SQL pointer AHSP');
  });

  it('injected allowed gate renders "diizinkan" (variant, not a real identity)', () => {
    const denied = syncAdminGate();
    const html = renderCard({
      gate: {
        ...denied,
        allowed: true,
        code: 'ALLOWED',
        reason: 'Diizinkan: global admin terverifikasi.',
        engineReason: 'allowed (injected test variant)',
      },
    });
    expect(html).toContain('diizinkan');
    expect(html).toContain('Diizinkan: global admin terverifikasi.');
    expect(html).not.toContain('ditolak');
  });
});
