/**
 * MASTER PRICING §13 card, extracted §14 (need #3) — the sync admin
 * gate card from `MasterPricingAdminView`, as a standalone component
 * so it can be render-tested without the full console (which needs
 * `useProject()` / ProjectContext).
 *
 * The card shows the §13 sync gate (DENIED while §4.1 is BLOCKED —
 * the trigger is the CLI, not the browser) plus the three CLI
 * commands, and an honest empty state for the last sync (the browser
 * cannot read the JSONL trail in the repo).
 *
 * The gate is computed by `syncAdminGate()` by default; an optional
 * `gate` prop injects a pre-computed gate (the allowed-variant
 * render test uses it — the local identity is anonymous, so the
 * default gate is always DENIED in this frontend-only state).
 */
import React from 'react';
import { syncAdminGate, type SyncAdminGateViewModel } from '../../engine/pricing/sync/syncUiLogic';

export interface SyncAdminCardProps {
  gate?: SyncAdminGateViewModel | null;
}

export function SyncAdminCard({ gate: gateProp }: SyncAdminCardProps): React.ReactElement {
  const gate = gateProp ?? syncAdminGate();
  return (
    <div className="mpu-card">
      <h2>Sinkronisasi harga &amp; AHSP</h2>
      <div className="mpu-muted" style={{ marginBottom: 8 }}>
        Sinkronisasi adalah operasi build yang dijalankan admin dari repo — pipeline harga (
        <code>price:sync</code>) atau pointer AHSP ke Postgres (<code>ahsp:sync-pointers</code>). Browser tidak
        dapat menjalankannya; konsol ini hanya menampilkan gerbang dan perintahnya.
      </div>
      <div className="mpu-muted" style={{ marginBottom: 8 }}>
        <strong>Status gerbang:</strong> {gate.allowed ? 'diizinkan' : 'ditolak'} — {gate.reason}
      </div>
      <div className="mpu-muted" style={{ marginBottom: 8 }}>
        <strong>Sinkronisasi terakhir:</strong> tidak dapat dibaca dari browser (jejak riwayat ada di{' '}
        <code>data/price2026/reports/sync_history.jsonl</code> di repo — bukan klaim kosong).
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        <div>
          <code>{gate.cliDryRunCommand}</code>
          <span className="mpu-muted"> — laporkan yang AKAN berubah, tanpa menulis apa pun.</span>
        </div>
        <div>
          <code>{gate.cliCommand}</code>
          <span className="mpu-muted"> — jalankan sinkronisasi (sesudah meninjau dry-run).</span>
        </div>
        <div>
          <code>{gate.cliPointerSyncCommand}</code>
          <span className="mpu-muted"> — hasilkan SQL pointer AHSP (definisi saja, tidak dieksekusi).</span>
        </div>
      </div>
    </div>
  );
}
