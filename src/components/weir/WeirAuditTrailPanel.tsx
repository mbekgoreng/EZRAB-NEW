/**
 * EZRAB PHASE 6A — WEIR AUDIT TRAIL PANEL
 *
 * Renders the 14-step forensic audit trail for the Weir/Bendung cost pipeline.
 * Each step is expandable to show full detail and data.
 *
 * Steps:
 *   1. Geometry       2. Quantity       3. Work Item      4. AHSP Mapping
 *   5. Coefficient    6. Resource       7. Unit Validation 8. Price Resolution
 *   9. Direct Cost   10. SMKK          11. Overhead       12. Profit
 *  13. Tax           14. Final Cost
 */

import React, { useState } from 'react';
import { AuditEngineStep } from '../../engine/weir/weirTypes';

interface WeirAuditTrailPanelProps {
  auditTrail: AuditEngineStep[];
}

const STEP_COLORS: Record<number, string> = {
  1: '#3B82F6', // Geometry — blue
  2: '#3B82F6', // Quantity — blue
  3: '#8B5CF6', // Work Item — purple
  4: '#8B5CF6', // AHSP Mapping — purple
  5: '#8B5CF6', // Coefficient — purple
  6: '#8B5CF6', // Resource — purple
  7: '#F59E0B', // Unit Validation — amber
  8: '#F59E0B', // Price Resolution — amber
  9: '#10B981', // Direct Cost — green
  10: '#10B981', // SMKK — green
  11: '#10B981', // Overhead — green
  12: '#10B981', // Profit — green
  13: '#10B981', // Tax — green
  14: '#EF4444', // Final Cost — red
};

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'number') return val.toLocaleString('id-ID');
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    if (val.length <= 3) return JSON.stringify(val, null, 2);
    return `[\n  ...${val.length} items\n]`;
  }
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

export const WeirAuditTrailPanel: React.FC<WeirAuditTrailPanelProps> = ({ auditTrail }) => {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
      }}
    >
      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div
        style={{
          background: '#0F172A',
          padding: '10px 14px',
          color: '#F8FAFC',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          14-Step Audit Engine Trail
        </span>
        <span style={{ fontSize: '9px', opacity: 0.6 }}>
          {auditTrail.length} steps | Forensic Pipeline
        </span>
      </div>

      {/* ── STEPS ──────────────────────────────────────────────── */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {auditTrail.map((step) => {
          const color = STEP_COLORS[step.stepIndex] || '#6B7280';
          const isExpanded = expandedStep === step.stepIndex;

          return (
            <div
              key={step.stepIndex}
              style={{
                borderBottom: step.stepIndex < 14 ? '1px solid #F1F5F9' : 'none',
              }}
            >
              {/* Step Header */}
              <button
                onClick={() => setExpandedStep(isExpanded ? null : step.stepIndex)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  background: isExpanded ? '#F8FAFC' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  textAlign: 'left',
                }}
              >
                {/* Step Number Badge */}
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: color,
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {step.stepIndex}
                </div>

                {/* Step Name + Detail */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E293B' }}>
                    {step.stageName}
                  </div>
                  <div
                    style={{
                      fontSize: '9.5px',
                      color: '#64748B',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {step.detail}
                  </div>
                </div>

                {/* Expand Indicator */}
                <span style={{ fontSize: '12px', color: '#94A3B8', flexShrink: 0 }}>
                  {isExpanded ? '−' : '+'}
                </span>
              </button>

              {/* Step Data (Expanded) */}
              {isExpanded && (
                <div
                  style={{
                    padding: '8px 12px 12px 46px',
                    background: '#F8FAFC',
                  }}
                >
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Step Data
                  </div>
                  <pre
                    style={{
                      fontSize: '9.5px',
                      fontFamily: 'monospace',
                      color: '#334155',
                      background: '#F1F5F9',
                      padding: '8px',
                      borderRadius: '4px',
                      overflow: 'auto',
                      maxHeight: '200px',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {formatValue(step.data)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeirAuditTrailPanel;
