import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  RotateCcw,
  ChevronLeft,
  X,
  Search,
  FileText,
  Calculator,
  ShieldAlert,
  Layers
} from 'lucide-react';
import '../../styles/assistant-wizard.css';
import { QuickActionChoice } from '../../data/quickActionContracts';

export interface QuickActionDialogueData {
  responseType: 'quick_action_dialogue';
  actionId: string;
  sessionId: string;
  currentState: string;
  title: string;
  message: string;
  choices?: QuickActionChoice[];
  parametersSchema?: Array<{
    name: string;
    label: string;
    type: 'string' | 'number' | 'select' | 'boolean';
    unit?: string;
    required: boolean;
    defaultValue?: any;
    validation?: { min?: number; max?: number; step?: number };
  }>;
  collectedParameters?: Record<string, any>;
  previewData?: {
    summary: string;
    beforeTotal?: number;
    afterTotal?: number;
    costImpact?: number;
    affectedCount?: number;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    requiresConfirmation: boolean;
    diffs?: Array<{ label: string; before: string | number; after: string | number }>;
  };
  resultData?: any;
  followUpSuggestions?: string[];
  canGoBack?: boolean;
  canCancel?: boolean;
  requiresConfirmation?: boolean;
}

interface QuickActionDialogueRendererProps {
  data: QuickActionDialogueData;
  onAnswer: (sessionId: string, choiceId?: string, parameters?: Record<string, any>, textAnswer?: string) => void;
  onGoBack: (sessionId: string) => void;
  onCancel: (sessionId: string) => void;
  onConfirm: (sessionId: string) => void;
  isLoading?: boolean;
}

export const QuickActionDialogueRenderer: React.FC<QuickActionDialogueRendererProps> = ({
  data,
  onAnswer,
  onGoBack,
  onCancel,
  onConfirm,
  isLoading = false
}) => {
  const [formValues, setFormValues] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    if (data.parametersSchema) {
      data.parametersSchema.forEach(p => {
        initial[p.name] = p.defaultValue !== undefined ? p.defaultValue : '';
      });
    }
    return initial;
  });

  const [appliedSuccess, setAppliedSuccess] = useState(false);

  const handleInputChange = (field: string, value: any) => {
    setFormValues(prev => ({ ...prev, [field]: value }));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAnswer(data.sessionId, undefined, formValues);
  };

  const isConfirmed = data.currentState === 'COMPLETED';
  const isCancelled = data.currentState === 'CANCELLED';

  if (isCancelled) {
    return (
      <div className="ezrab-dialogue-cancelled">
        <X className="h-4 w-4" style={{ color: '#94A3B8' }} />
        <span>Sesi <strong>{data.title}</strong> telah dibatalkan.</span>
      </div>
    );
  }

  return (
    <div className="ezrab-dialogue-container">
      {/* 1. Card Header */}
      <div className="ezrab-dialogue-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex',
            width: '28px',
            height: '28px',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '7px',
            backgroundColor: '#EFF6FF',
            color: '#2563EB',
            border: '1px solid #DBEAFE'
          }}>
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="ezrab-dialogue-badge">
              Interactive Dialogue
            </div>
            <h4 className="ezrab-dialogue-title">{data.title}</h4>
          </div>
        </div>

        {data.requiresConfirmation && (
          <span style={{
            borderRadius: '9999px',
            backgroundColor: '#FFFBEB',
            padding: '2px 8px',
            fontSize: '10px',
            fontWeight: 700,
            color: '#D97706',
            border: '1px solid #FDE68A'
          }}>
            Perlu Konfirmasi
          </span>
        )}
      </div>

      {/* 2. Message Body */}
      {data.message && (
        <div style={{
          marginBottom: '12px',
          fontSize: '12.5px',
          color: '#334155',
          lineHeight: '1.55',
          whiteSpace: 'pre-line'
        }}>
          {data.message}
        </div>
      )}

      {/* 3. STEP A: Interactive Choices Grid */}
      {data.choices && data.choices.length > 0 && !isConfirmed && (
        <div style={{ marginBottom: '12px' }}>
          <div className="ezrab-wizard-grid">
            {data.choices.map(choice => (
              <button
                key={choice.id}
                type="button"
                disabled={isLoading || choice.disabled}
                onClick={() => onAnswer(data.sessionId, choice.value || choice.id)}
                className={`ezrab-wizard-card ${choice.disabled ? 'coming-soon' : ''}`}
                style={{ cursor: choice.disabled ? 'not-allowed' : 'pointer', width: '100%' }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                      {choice.label}
                    </span>
                    {choice.badge && (
                      <span className="ezrab-card-badge ready">
                        {choice.badge}
                      </span>
                    )}
                  </div>
                  {choice.description && (
                    <p className="ezrab-card-desc">
                      {choice.description}
                    </p>
                  )}
                </div>

                <div className="ezrab-card-footer">
                  <span style={{ fontSize: '10.5px', color: '#2563EB', fontWeight: 600 }}>Pilih Opsi</span>
                  <ArrowRight className="h-3 w-3" style={{ color: '#2563EB' }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. STEP B: Parameter Form */}
      {data.parametersSchema && data.parametersSchema.length > 0 && !isConfirmed && (
        <form onSubmit={handleFormSubmit} style={{ marginTop: '10px' }}>
          <div className="ezrab-wizard-form-grid">
            {data.parametersSchema.map(param => (
              <div key={param.name} className="ezrab-wizard-question-box">
                <label className="ezrab-wizard-label">
                  {param.label} {param.unit && <span className="unit">({param.unit})</span>}
                  {param.required && <span className="required">*</span>}
                </label>
                <div className="ezrab-wizard-input-wrapper">
                  <input
                    type={param.type === 'number' ? 'number' : 'text'}
                    required={param.required}
                    min={param.validation?.min}
                    max={param.validation?.max}
                    step={param.validation?.step || 'any'}
                    value={formValues[param.name] ?? ''}
                    onChange={e => handleInputChange(param.name, param.type === 'number' ? Number(e.target.value) : e.target.value)}
                    className="ezrab-wizard-input"
                  />
                  {param.unit && (
                    <span className="ezrab-wizard-input-unit">
                      {param.unit}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={isLoading}
              className="ezrab-wizard-btn-calculate"
            >
              <Calculator className="h-3.5 w-3.5" />
              <span>Hitung Hasil QTO</span>
            </button>
          </div>
        </form>
      )}

      {/* 5. STEP C: Preview & Diff Card */}
      {data.previewData && !isConfirmed && (
        <div className="ezrab-dialogue-preview-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#D97706', marginBottom: '8px' }}>
            <ShieldAlert className="h-4 w-4" />
            <span>Pratinjau Perubahan (Diff Preview)</span>
          </div>

          {data.previewData.diffs && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {data.previewData.diffs.map((diff, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', padding: '4px 0', fontSize: '11px' }}>
                  <span style={{ color: '#64748B' }}>{diff.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'monospace' }}>
                    <span style={{ color: '#94A3B8', textDecoration: 'line-through' }}>{String(diff.before)}</span>
                    <ArrowRight className="h-3 w-3" style={{ color: '#94A3B8' }} />
                    <span style={{ fontWeight: 700, color: '#059669' }}>{String(diff.after)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="ezrab-wizard-actions" style={{ marginTop: '12px' }}>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onCancel(data.sessionId)}
              className="ezrab-wizard-btn-cancel"
            >
              Batalkan
            </button>
            <button
              type="button"
              disabled={isLoading || appliedSuccess}
              onClick={() => {
                onConfirm(data.sessionId);
                setAppliedSuccess(true);
              }}
              className="ezrab-wizard-btn-confirm"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{appliedSuccess ? 'Diterapkan!' : 'Terapkan Perubahan'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 6. Navigation Controls */}
      {(data.canGoBack || data.canCancel) && !isConfirmed && (
        <div className="ezrab-wizard-actions">
          {data.canGoBack ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onGoBack(data.sessionId)}
              className="ezrab-wizard-btn-back"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Kembali</span>
            </button>
          ) : <div />}

          {data.canCancel && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onCancel(data.sessionId)}
              className="ezrab-wizard-btn-cancel"
            >
              Batalkan Sesi
            </button>
          )}
        </div>
      )}
    </div>
  );
};
