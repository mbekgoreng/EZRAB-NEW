/**
 * MASTER PRICING §11 — ADMIN GATE UI (UX only, §4.1 BLOCKED).
 *
 * The §4 authorization module (`masterPriceAuthorization.ts`) is the ONLY
 * gate. These components RENDER its decision; they never grant access.
 * There is no local "login as admin" toggle anywhere in §11. When the
 * gate denies (the expected state while AUTH_ENABLED=false), the action
 * is shown as unavailable with the honest reason — never hidden and
 * never bypassed.
 */
import React, { useMemo } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import type {
  AhspVersionOperation,
  GlobalWriteOperation,
  MasterPriceOperation,
} from '../../engine/pricing/admin/masterPriceAuthorization';
import {
  adminGateForOperation,
  ahspVersionWriteGate,
  ADMIN_GATE_ENFORCEMENT_NOTE,
  type AdminGateViewModel,
} from '../../engine/pricing/admin/masterPricingUiLogic';

/** The §4 gate decision for one global operation (memoized; the decision is deterministic). */
export function useAdminGate(operation: GlobalWriteOperation): AdminGateViewModel {
  return useMemo(() => adminGateForOperation(operation), [operation]);
}

/** Banner stating that global edits are admin-only, with the live gate decision. */
export function AdminGateBanner({ operation }: { operation: MasterPriceOperation }): React.ReactElement {
  const gate = useAdminGate(operation);
  return (
    <div className="mpu-banner amber" role="note">
      {gate.allowed ? <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} /> : <Lock size={16} style={{ flexShrink: 0, marginTop: 2 }} />}
      <div>
        <div>
          <strong>Edit global hanya untuk administrator.</strong>{' '}
          {gate.allowed
            ? `Aksi “${gate.operationLabel}” diizinkan untuk identitas ini.`
            : gate.reason}
        </div>
        <div style={{ marginTop: 4, fontSize: 12 }}>{ADMIN_GATE_ENFORCEMENT_NOTE}</div>
      </div>
    </div>
  );
}

/**
 * Same banner for AHSP version writes (clone / publish / rollback / apply).
 * MASTER PRICING §12: the banner gates a NAMED AHSP-version operation
 * (default PUBLISH_AHSP_VERSION — the decision is uniform across the
 * four version ops today, since the rule is identity-based, not
 * operation-based). The per-action buttons in AhspDatabaseView each
 * carry their own operation's gate.
 */
export function AhspVersionGateBanner({
  operation = 'PUBLISH_AHSP_VERSION',
}: {
  operation?: AhspVersionOperation;
}): React.ReactElement {
  const gate = useMemo(() => ahspVersionWriteGate(operation), [operation]);
  return (
    <div className="mpu-banner amber" role="note">
      <Lock size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <div>
          <strong>Perubahan versi AHSP hanya untuk administrator.</strong>{' '}
          {gate.allowed ? `Aksi “${gate.operationLabel}” diizinkan untuk identitas ini.` : gate.reason}
        </div>
        <div style={{ marginTop: 4, fontSize: 12 }}>{ADMIN_GATE_ENFORCEMENT_NOTE}</div>
      </div>
    </div>
  );
}

/** One-line reason under a disabled action (renders nothing when allowed). */
export function GateReason({ gate }: { gate: Pick<AdminGateViewModel, 'allowed' | 'reason'> }): React.ReactElement | null {
  if (gate.allowed) return null;
  return (
    <div className="mpu-muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <Lock size={13} style={{ flexShrink: 0 }} />
      <span>{gate.reason}</span>
    </div>
  );
}
