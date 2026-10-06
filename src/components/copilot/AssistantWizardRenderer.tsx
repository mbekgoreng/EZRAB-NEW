import React, { useState } from 'react';
import {
  Home,
  Layers,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Calculator,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Building,
  Check,
  Search,
  SlidersHorizontal
} from 'lucide-react';
import '../../styles/assistant-wizard.css';

export interface AssistantChoice {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  badge?: string;
  value: string;
  nextStep: string;
  templateId?: string;
  disabled?: boolean;
  disabledReason?: string;
  area?: number | null;
  floorOptions?: number[];
  defaultFloorCount?: number;
  readinessStatus?: string;
  categoryGroup?: string;
  displayOrder?: number;
  availability?: boolean;
}

export interface AssistantQuestion {
  id: string;
  type:
    | 'single_select'
    | 'multi_select'
    | 'number'
    | 'text'
    | 'unit_number'
    | 'dropdown'
    | 'location'
    | 'confirmation';
  label: string;
  description?: string;
  required: boolean;
  options?: AssistantChoice[];
  unit?: string;
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    step?: number;
  };
}

export interface AssistantWizardData {
  responseType: 'wizard';
  wizardSessionId: string;
  step: string;
  title: string;
  message: string;
  questions?: AssistantQuestion[];
  choices?: AssistantChoice[];
  progress?: {
    current: number;
    total: number;
    stepName: string;
  };
  canGoBack?: boolean;
  canCancel?: boolean;
  selectedTemplate?: {
    id: string;
    templateId: string;
    label: string;
    area: number | null;
    floorCount: number;
    description: string;
    badge?: string;
    categoryGroup?: string;
  };
  summary?: {
    templateId?: string;
    templateName?: string;
    collectedParameters: Record<string, any>;
    itemsCount: number;
    directCost: number;
    overheadPercent: number;
    overheadAmount: number;
    profitPercent: number;
    profitAmount: number;
    subtotalBeforeTax: number;
    taxPercent: number;
    taxAmount: number;
    grandTotal: number;
    regionInfo?: {
      key: string;
      name: string;
      multiplier: number;
      percentage: number;
      description: string;
    };
    categories: Array<{ category: string; subtotal: number }>;
  };
}

interface AssistantWizardRendererProps {
  data: AssistantWizardData;
  onAnswer: (sessionId: string, choiceId?: string, parameters?: Record<string, any>) => void;
  onGoBack: (sessionId: string) => void;
  onCancel: (sessionId: string) => void;
  onConfirm: (sessionId: string) => void;
  onNavigateToSpreadsheet?: () => void;
  isLoading?: boolean;
}

export const AssistantWizardRenderer: React.FC<AssistantWizardRendererProps> = ({
  data,
  onAnswer,
  onGoBack,
  onCancel,
  onConfirm,
  onNavigateToSpreadsheet,
  isLoading = false
}) => {
  const [formValues, setFormValues] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    if (data.questions) {
      data.questions.forEach(q => {
        initial[q.id] = q.defaultValue !== undefined ? q.defaultValue : (q.options && q.options[0]?.value) || '';
      });
    }
    return initial;
  });

  const [appliedSuccess, setAppliedSuccess] = useState(false);

  const handleInputChange = (fieldId: string, value: any) => {
    setFormValues(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAnswer(data.wizardSessionId, undefined, formValues);
  };

  const formatRupiah = (val: number) => {
    return 'Rp ' + Number(val || 0).toLocaleString('id-ID');
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'KECIL' | 'MENENGAH' | 'BESAR' | 'CUSTOM'>('ALL');
  const [selectedFloor, setSelectedFloor] = useState<'ALL' | '1' | '2'>('ALL');

  const hasCatalogGroups = (data.choices || []).some(c => !!c.categoryGroup || c.area !== undefined);
  const showCatalogFilters = (data.choices || []).length > 4 || hasCatalogGroups;

  const filteredChoices = (data.choices || []).filter(c => {
    if (!c) return false;
    if (selectedCategory !== 'ALL' && c.categoryGroup && c.categoryGroup !== selectedCategory) {
      return false;
    }
    if (selectedFloor !== 'ALL') {
      const floorNum = parseInt(selectedFloor, 10);
      const matchesFloor = c.defaultFloorCount === floorNum || (c.floorOptions && c.floorOptions.includes(floorNum));
      if (!matchesFloor) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const label = (c.label || '').toLowerCase();
      const desc = (c.description || '').toLowerCase();
      const id = (c.id || '').toLowerCase();
      const val = (c.value || '').toLowerCase();
      const areaStr = c.area !== undefined && c.area !== null ? String(c.area) : '';
      const matches =
        label.includes(q) ||
        desc.includes(q) ||
        (areaStr !== '' && areaStr.includes(q)) ||
        id.includes(q) ||
        val.includes(q);
      if (!matches) return false;
    }
    return true;
  });

  return (
    <div className="ezrab-wizard-container">
      {/* 1. Header & Progress Stepper */}
      <div className="ezrab-wizard-header">
        <div className="ezrab-wizard-title-group">
          <div className="ezrab-wizard-icon-box">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="ezrab-wizard-subtitle">
              Interactive RAB Wizard
            </div>
            <div className="ezrab-wizard-title">{data.title}</div>
          </div>
        </div>

        {data.progress && (
          <div className="ezrab-wizard-progress">
            <span className="ezrab-wizard-step-label">
              Langkah {data.progress.current} / {data.progress.total}
            </span>
            <div className="ezrab-wizard-progress-track">
              <div
                className="ezrab-wizard-progress-bar"
                style={{
                  width: `${(data.progress.current / data.progress.total) * 100}%`
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. Step Message */}
      {(data.message || (data as any).description) && (
        <p className="ezrab-wizard-message">
          {data.message || (data as any).description}
        </p>
      )}

      {/* 2.1 TEMPLATE CONFIRMATION CARD */}
      {data.step === 'TEMPLATE_CONFIRMATION' && data.selectedTemplate && (
        <div className="ezrab-confirmation-card">
          <div className="ezrab-confirmation-header">
            <div>
              <div className="ezrab-confirmation-title">{data.selectedTemplate.label}</div>
              <div className="ezrab-confirmation-desc">{data.selectedTemplate.description}</div>
            </div>
            <span className="ezrab-confirmation-badge">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{data.selectedTemplate.badge || 'Template Terpilih'}</span>
            </span>
          </div>

          <div className="ezrab-confirmation-specs">
            <div className="ezrab-confirmation-spec-item">
              <span className="ezrab-confirmation-spec-label">Luas Bangunan</span>
              <span className="ezrab-confirmation-spec-val highlight">
                {data.selectedTemplate.area ? `±${data.selectedTemplate.area} m²` : 'Custom Bebas'}
              </span>
            </div>
            <div className="ezrab-confirmation-spec-item">
              <span className="ezrab-confirmation-spec-label">Jumlah Lantai</span>
              <span className="ezrab-confirmation-spec-val">
                {data.selectedTemplate.floorCount} Lantai
              </span>
            </div>
            <div className="ezrab-confirmation-spec-item">
              <span className="ezrab-confirmation-spec-label">Kategori</span>
              <span className="ezrab-confirmation-spec-val">
                {data.selectedTemplate.categoryGroup || 'Rumah Tinggal'}
              </span>
            </div>
            <div className="ezrab-confirmation-spec-item">
              <span className="ezrab-confirmation-spec-label">Standar Harga</span>
              <span className="ezrab-confirmation-spec-val">AHSP PUPR 2026</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. STEP A: SELECTABLE CHOICE CARDS */}
      {data.choices && data.choices.length > 0 && (
        <div>
          {/* Search & Category Filter Controls */}
          {showCatalogFilters && (
            <div className="ezrab-wizard-filter-box">
              {/* Search Bar */}
              <div className="ezrab-wizard-search-wrapper">
                <Search className="ezrab-wizard-search-icon" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari tipe rumah, misalnya Type 120..."
                  className="ezrab-wizard-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="ezrab-wizard-search-clear"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Category Pills & Floor Filter */}
              <div className="ezrab-wizard-filter-row">
                <div className="ezrab-wizard-pills">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('ALL')}
                    className={`ezrab-wizard-pill-btn ${selectedCategory === 'ALL' ? 'active' : 'inactive'}`}
                  >
                    Semua ({data.choices.length})
                  </button>
                  {hasCatalogGroups && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedCategory('KECIL')}
                        className={`ezrab-wizard-pill-btn ${selectedCategory === 'KECIL' ? 'active' : 'inactive'}`}
                      >
                        Kecil (T36–70)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCategory('MENENGAH')}
                        className={`ezrab-wizard-pill-btn ${selectedCategory === 'MENENGAH' ? 'active' : 'inactive'}`}
                      >
                        Menengah (T90–150)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCategory('BESAR')}
                        className={`ezrab-wizard-pill-btn ${selectedCategory === 'BESAR' ? 'active' : 'inactive'}`}
                      >
                        Besar (T180–300)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCategory('CUSTOM')}
                        className={`ezrab-wizard-pill-btn ${selectedCategory === 'CUSTOM' ? 'active' : 'inactive'}`}
                      >
                        Custom
                      </button>
                    </>
                  )}
                </div>

                {/* Floor Filter */}
                {hasCatalogGroups && (
                  <div className="ezrab-wizard-floor-select">
                    <span>Lantai:</span>
                    <select
                      value={selectedFloor}
                      onChange={(e) => setSelectedFloor(e.target.value as any)}
                      className="ezrab-wizard-floor-dropdown"
                    >
                      <option value="ALL">Semua</option>
                      <option value="1">1 Lantai</option>
                      <option value="2">2 Lantai</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cards Grid */}
          {filteredChoices.length === 0 ? (
            <div className="ezrab-wizard-empty">
              <AlertCircle className="mx-auto h-6 w-6 text-slate-400 mb-1" style={{ margin: '0 auto' }} />
              <div className="ezrab-wizard-empty-title">Tipe rumah tidak ditemukan</div>
              <div className="ezrab-wizard-empty-desc">Coba gunakan kata kunci pencarian lain atau pilih Rumah Custom.</div>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('ALL');
                  setSelectedFloor('ALL');
                }}
                className="ezrab-wizard-reset-btn"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <div className="ezrab-wizard-grid">
              {filteredChoices.map(choice => {
                const isEngineeringReview = choice.badge === 'ENGINEERING_REVIEW_REQUIRED' || choice.nextStep === 'ENGINEERING_REVIEW_REQUIRED';
                const isComingSoon = choice.disabled;
                const isReady = !choice.disabled;

                return (
                  <div
                    key={choice.id}
                    className={`ezrab-wizard-card ${
                      isComingSoon
                        ? 'coming-soon'
                        : isEngineeringReview
                        ? 'engineering-review'
                        : ''
                    }`}
                  >
                    <div>
                      {/* Card Header: Icon + Title + Badge */}
                      <div className="ezrab-card-header">
                        <div className="ezrab-card-icon">
                          {choice.id.includes('road') || choice.id.includes('paving') || choice.id.includes('asphalt') || choice.id === 'ROAD_AND_PAVEMENT' ? (
                            <Layers className="h-3.5 w-3.5" />
                          ) : choice.id.includes('water') || choice.id.includes('drain') || choice.id === 'WATER_RESOURCES' ? (
                            <Layers className="h-3.5 w-3.5" />
                          ) : choice.id.includes('civil') || choice.id === 'CIVIL_STRUCTURE' ? (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          ) : choice.id === 'CUSTOM_PROJECT' || choice.id.includes('custom') ? (
                            <Sparkles className="h-3.5 w-3.5" />
                          ) : (
                            <Home className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="ezrab-card-title">
                          {choice.label}
                        </div>
                      </div>

                      {/* Card Details: Luas Bangunan & Jumlah Lantai */}
                      <div className="ezrab-card-meta">
                        {choice.area !== undefined && choice.area !== null ? (
                          <div className="ezrab-card-meta-row">
                            <span className="ezrab-card-meta-label">Luas Bangunan:</span>
                            <span className="ezrab-card-meta-val">±{choice.area} m²</span>
                          </div>
                        ) : choice.id.includes('custom') ? (
                          <div className="ezrab-card-meta-row">
                            <span className="ezrab-card-meta-label">Luas Bangunan:</span>
                            <span className="ezrab-card-meta-val highlight">Custom Bebas</span>
                          </div>
                        ) : null}

                        <div className="ezrab-card-meta-row">
                          <span className="ezrab-card-meta-label">Jumlah Lantai:</span>
                          <span className="ezrab-card-meta-val">
                            {choice.defaultFloorCount
                              ? `${choice.defaultFloorCount} Lantai`
                              : choice.floorOptions
                              ? `${choice.floorOptions.join(' - ')} Lantai`
                              : '1 Lantai'}
                          </span>
                        </div>
                      </div>

                      {/* Status / Description */}
                      <div style={{ marginTop: '8px' }}>
                        <span className={`ezrab-card-badge ${
                          isComingSoon
                            ? 'coming-soon'
                            : isEngineeringReview
                            ? 'review'
                            : 'ready'
                        }`}>
                          {isComingSoon ? 'Coming Soon' : (choice.badge || 'Template Tersedia')}
                        </span>
                        {choice.description && (
                          <p className="ezrab-card-desc">
                            {choice.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="ezrab-card-footer">
                      <span className="ezrab-card-status-text">
                        {isComingSoon ? 'Belum Tersedia' : 'Siap Dihitung'}
                      </span>
                      <button
                        type="button"
                        disabled={isLoading || choice.disabled}
                        onClick={() => onAnswer(data.wizardSessionId, choice.value || choice.id)}
                        className="ezrab-card-btn-choose"
                      >
                        <span>Pilih</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(data.canGoBack || data.canCancel) && (
            <div className="ezrab-wizard-actions">
              {data.canGoBack ? (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => onGoBack(data.wizardSessionId)}
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
                  onClick={() => onCancel(data.wizardSessionId)}
                  className="ezrab-wizard-btn-cancel"
                >
                  Batalkan
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. STEP B: PARAMETER QUESTION FORM */}
      {data.questions && data.questions.length > 0 && (
        <form onSubmit={handleFormSubmit}>
          <div className="ezrab-wizard-form-grid">
            {data.questions.map(q => (
              <div
                key={q.id}
                className={`ezrab-wizard-question-box ${
                  q.type === 'single_select' || q.type === 'dropdown' ? 'full-width' : ''
                }`}
              >
                <label className="ezrab-wizard-label">
                  {q.label} {q.unit && <span className="unit">({q.unit})</span>}
                  {q.required && <span className="required">*</span>}
                </label>
                {q.description && (
                  <p className="ezrab-wizard-sublabel">{q.description}</p>
                )}

                {/* Number / Unit Number Input */}
                {(q.type === 'number' || q.type === 'unit_number') && (
                  <div className="ezrab-wizard-input-wrapper">
                    <input
                      type="number"
                      required={q.required}
                      min={q.validation?.min}
                      max={q.validation?.max}
                      step={q.validation?.step || 1}
                      value={formValues[q.id] ?? ''}
                      onChange={e => handleInputChange(q.id, Number(e.target.value))}
                      className="ezrab-wizard-input"
                    />
                    {q.unit && (
                      <span className="ezrab-wizard-input-unit">
                        {q.unit}
                      </span>
                    )}
                  </div>
                )}

                {/* Single Select Options Pills */}
                {q.type === 'single_select' && q.options && (
                  <div className="ezrab-wizard-options-grid">
                    {q.options.map(opt => {
                      const isSelected = (formValues[q.id] ?? q.defaultValue) === opt.value;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleInputChange(q.id, opt.value)}
                          className={`ezrab-wizard-option-btn ${isSelected ? 'selected' : ''}`}
                        >
                          <div>
                            <div className="ezrab-wizard-option-label">
                              {isSelected && <Check className="h-3.5 w-3.5 text-blue-600" style={{ color: '#2563EB', flexShrink: 0 }} />}
                              <span>{opt.label}</span>
                            </div>
                            {opt.description && (
                              <p className="ezrab-wizard-option-desc">{opt.description}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Dropdown / Location Select */}
                {(q.type === 'dropdown' || q.type === 'location') && q.options && (
                  <div className="ezrab-wizard-select-wrapper">
                    <select
                      value={formValues[q.id] ?? q.defaultValue ?? q.options[0]?.value}
                      onChange={e => handleInputChange(q.id, e.target.value)}
                      className="ezrab-wizard-select"
                    >
                      {q.options.map(opt => (
                        <option key={opt.id} value={opt.value}>
                          {opt.label} {opt.description ? `(${opt.description})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="ezrab-wizard-actions">
            {data.canGoBack ? (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => onGoBack(data.wizardSessionId)}
                className="ezrab-wizard-btn-back"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Kembali</span>
              </button>
            ) : <div />}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {data.canCancel && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => onCancel(data.wizardSessionId)}
                  className="ezrab-wizard-btn-cancel"
                >
                  Batalkan
                </button>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="ezrab-wizard-btn-calculate"
              >
                <Calculator className="h-3.5 w-3.5" />
                <span>{isLoading ? 'Menghitung...' : 'Hitung Preview RAB'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* 5. STEP C: RAB SUMMARY PREVIEW */}
      {data.step === 'RAB_PREVIEW' && data.summary && (
        <div>
          {/* Summary Metric Cards */}
          <div className="ezrab-wizard-metrics-grid">
            <div className="ezrab-wizard-metric-box">
              <div className="ezrab-wizard-metric-label">Luas Bangunan</div>
              <div className="ezrab-wizard-metric-value">
                {data.summary.collectedParameters.building_area} m²
              </div>
            </div>
            {data.summary.regionInfo && (
              <div className="ezrab-wizard-metric-box">
                <div className="ezrab-wizard-metric-label">Indeks Wilayah</div>
                <div className="ezrab-wizard-metric-value" style={{ fontSize: '12.5px', color: '#1E40AF' }}>
                  {data.summary.regionInfo.name} ({data.summary.regionInfo.percentage}%)
                </div>
              </div>
            )}
            <div className="ezrab-wizard-metric-box">
              <div className="ezrab-wizard-metric-label">Total Item</div>
              <div className="ezrab-wizard-metric-value">
                {data.summary.itemsCount} Pekerjaan
              </div>
            </div>
            <div className="ezrab-wizard-metric-box">
              <div className="ezrab-wizard-metric-label">Biaya Langsung</div>
              <div className="ezrab-wizard-metric-value">
                {formatRupiah(data.summary.directCost)}
              </div>
            </div>
            <div className="ezrab-wizard-metric-box highlight">
              <div className="ezrab-wizard-metric-label">Grand Total (PPN 11%)</div>
              <div className="ezrab-wizard-metric-value">
                {formatRupiah(data.summary.grandTotal)}
              </div>
            </div>
          </div>

          {/* Categories Table Breakdown */}
          <div className="ezrab-wizard-category-table">
            <div className="ezrab-wizard-category-title">
              <Layers className="h-3.5 w-3.5" style={{ color: '#2563EB' }} />
              <span>Rincian Kelompok Pekerjaan (AHSP PUPR 2026):</span>
            </div>
            <div className="ezrab-wizard-category-list">
              {data.summary.categories.map((cat, idx) => (
                <div key={idx} className="ezrab-wizard-category-row">
                  <span className="ezrab-wizard-cat-name">{cat.category}</span>
                  <span className="ezrab-wizard-cat-val">
                    {formatRupiah(cat.subtotal)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Confirmation Buttons */}
          <div className="ezrab-wizard-actions">
            <button
              type="button"
              disabled={isLoading || appliedSuccess}
              onClick={() => onGoBack(data.wizardSessionId)}
              className="ezrab-wizard-btn-back"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Ubah Parameter</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {!appliedSuccess && data.canCancel && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => onCancel(data.wizardSessionId)}
                  className="ezrab-wizard-btn-cancel"
                >
                  Batalkan
                </button>
              )}

              <button
                type="button"
                disabled={isLoading || appliedSuccess}
                onClick={() => {
                  onConfirm(data.wizardSessionId);
                  setAppliedSuccess(true);
                }}
                className={`ezrab-wizard-btn-confirm ${appliedSuccess ? 'success' : ''}`}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{appliedSuccess ? 'Tersimpan ke Spreadsheet!' : 'Terapkan ke Spreadsheet RAB'}</span>
              </button>

              {appliedSuccess && onNavigateToSpreadsheet && (
                <button
                  type="button"
                  onClick={onNavigateToSpreadsheet}
                  className="ezrab-btn-open-spreadsheet"
                >
                  <span>Buka Spreadsheet RAB</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
