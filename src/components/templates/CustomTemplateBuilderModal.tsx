import React, { useState } from 'react';
import {
  X,
  Layers,
  Sliders,
  Maximize2,
  ListPlus,
  Calculator,
  CheckCircle2,
  Plus,
  Trash2,
  Save,
  ArrowRight,
  ArrowLeft,
  Building,
  HelpCircle,
} from 'lucide-react';
import {
  RabTemplate,
  TemplateCategory,
  TemplateParameter,
  SpaceTemplate,
  ConstructionComponentTemplate,
  ParameterInputType
} from '../../types/rabTemplate';
import { RabTemplateService } from '../../services/rabTemplateService';

interface CustomTemplateBuilderModalProps {
  initialTemplate?: RabTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (template: RabTemplate) => void;
}

const CATEGORY_OPTIONS: Array<{ value: TemplateCategory; label: string }> = [
  { value: 'RUMAH_TINGGAL', label: 'Rumah Tinggal' },
  { value: 'CUSTOM', label: 'Custom' },
  { value: 'JALAN_TRANSPORTASI', label: 'Jalan & Transportasi' },
  { value: 'PERKERASAN', label: 'Perkerasan (Paving)' },
  { value: 'SDA_IRIGASI', label: 'SDA & Irigasi' },
  { value: 'GEDUNG', label: 'Gedung' },
  { value: 'BANGUNAN_TINGGI', label: 'Bangunan Tinggi' },
  { value: 'HOTEL_HOSPITALITY', label: 'Hotel & Hospitality' },
  { value: 'KESEHATAN', label: 'Kesehatan' },
  { value: 'PENDIDIKAN', label: 'Pendidikan' },
  { value: 'INDUSTRI', label: 'Industri' },
  { value: 'UTILITAS', label: 'Utilitas' },
  { value: 'LANDSCAPE_SITE', label: 'Landscape & Kawasan' },
  { value: 'MEP_SYSTEM', label: 'MEP & Sistem Bangunan' },
  { value: 'RENOVASI_MAINTENANCE', label: 'Renovasi & Maintenance' }
];

export const CustomTemplateBuilderModal: React.FC<CustomTemplateBuilderModalProps> = ({
  initialTemplate,
  isOpen,
  onClose,
  onSaved
}) => {
  const [activeStep, setActiveStep] = useState<number>(1);

  // Step 1: Informasi Dasar
  const [name, setName] = useState(initialTemplate?.name || '');
  const [category, setCategory] = useState<TemplateCategory>(initialTemplate?.category || 'CUSTOM');
  const [subcategory, setSubcategory] = useState(initialTemplate?.subcategory || '');
  const [description, setDescription] = useState(initialTemplate?.description || '');
  const [projectUnit, setProjectUnit] = useState('m²');
  const [defaultFloors, setDefaultFloors] = useState<number>(1);
  const [defaultArea, setDefaultArea] = useState<number>(100);

  // Step 2: Parameter Proyek (Dynamic)
  const [parameters, setParameters] = useState<TemplateParameter[]>(
    initialTemplate?.parameters || [
      { id: 'p_area', key: 'building_area', label: 'Luas Bangunan', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 100, min: 10, max: 10000, group: 'dimensions' },
      { id: 'p_floors', key: 'num_floors', label: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 1, min: 1, max: 10, group: 'dimensions' }
    ]
  );

  // Step 3: Program Ruang
  const [spaces, setSpaces] = useState<SpaceTemplate[]>(
    initialTemplate?.spaces || [
      { id: 'sp-1', name: 'Ruang Utama', category: 'Umum', quantityRule: '1', targetArea: 24 }
    ]
  );

  // Step 4 & 5 & 6: Komponen Pekerjaan & Rule Perhitungan & AHSP
  const [components, setComponents] = useState<ConstructionComponentTemplate[]>(
    initialTemplate?.components || [
      {
        id: 'comp-1',
        name: 'Pembersihan Lapangan Proyek',
        category: '01. PEKERJAAN PERSIAPAN',
        unit: 'm2',
        calculationRule: 'building_area * 1.2',
        variables: ['building_area'],
        ahspCode: 'A.2.2.1.9',
        unitPrice: 8500
      },
      {
        id: 'comp-2',
        name: 'Galian Tanah Pondasi',
        category: '02. PEKERJAAN TANAH DAN PONDASI',
        unit: 'm3',
        calculationRule: 'building_area * 0.4',
        variables: ['building_area'],
        ahspCode: 'A.2.3.1.1',
        unitPrice: 88500
      },
      {
        id: 'comp-3',
        name: 'Pekerjaan Struktur Beton Bertulang',
        category: '03. PEKERJAAN STRUKTUR',
        unit: 'm3',
        calculationRule: 'building_area * 0.15',
        variables: ['building_area'],
        ahspCode: 'A.4.1.1.4',
        unitPrice: 4850000
      },
      {
        id: 'comp-4',
        name: 'Pasangan Dinding Bata Ringan t=10cm',
        category: '04. PEKERJAAN DINDING',
        unit: 'm2',
        calculationRule: 'building_area * 2.2',
        variables: ['building_area'],
        ahspCode: 'A.4.4.1.1',
        unitPrice: 145000
      },
      {
        id: 'comp-5',
        name: 'Lantai Granit Tile 60x60 cm',
        category: '05. PEKERJAAN LANTAI',
        unit: 'm2',
        calculationRule: 'building_area * 0.9',
        variables: ['building_area'],
        ahspCode: 'A.4.4.3.1',
        unitPrice: 295000
      }
    ]
  );

  if (!isOpen) return null;

  // Handlers for parameters
  const handleAddParameter = () => {
    const newId = `param_${Date.now()}`;
    setParameters([
      ...parameters,
      {
        id: newId,
        key: `custom_param_${parameters.length + 1}`,
        label: `Parameter ${parameters.length + 1}`,
        type: 'NUMBER',
        unit: '',
        required: false,
        defaultValue: 1,
        group: 'general'
      }
    ]);
  };

  const handleUpdateParameter = (id: string, updates: Partial<TemplateParameter>) => {
    setParameters(parameters.map(p => (p.id === id ? { ...p, ...updates } : p)));
  };

  const handleDeleteParameter = (id: string) => {
    setParameters(parameters.filter(p => p.id !== id));
  };

  // Handlers for spaces
  const handleAddSpace = () => {
    const newId = `sp_${Date.now()}`;
    setSpaces([
      ...spaces,
      {
        id: newId,
        name: `Ruang Baru ${spaces.length + 1}`,
        category: 'Umum',
        quantityRule: '1',
        targetArea: 15
      }
    ]);
  };

  const handleUpdateSpace = (id: string, updates: Partial<SpaceTemplate>) => {
    setSpaces(spaces.map(s => (s.id === id ? { ...s, ...updates } : s)));
  };

  const handleDeleteSpace = (id: string) => {
    setSpaces(spaces.filter(s => s.id !== id));
  };

  // Handlers for components
  const handleAddComponent = () => {
    const newId = `comp_${Date.now()}`;
    setComponents([
      ...components,
      {
        id: newId,
        name: 'Item Pekerjaan Baru',
        category: '04. PEKERJAAN DINDING',
        unit: 'm2',
        detailLevel: 'PROFESSIONAL',
        calculationRule: 'building_area * 1.0',
        variables: ['building_area'],
        ahspCode: '',
        unitPrice: 150000
      }
    ]);
  };

  const handleUpdateComponent = (id: string, updates: Partial<ConstructionComponentTemplate>) => {
    setComponents(components.map(c => (c.id === id ? { ...c, ...updates } : c)));
  };

  const handleDeleteComponent = (id: string) => {
    setComponents(components.filter(c => c.id !== id));
  };

  // Save handler
  const handleSaveTemplate = () => {
    if (!name.trim()) {
      alert('Nama template wajib diisi.');
      setActiveStep(1);
      return;
    }

    const tplService = RabTemplateService.getInstance();
    const saved = tplService.saveCustomTemplate({
      id: initialTemplate?.id,
      name: name.trim(),
      category: category === 'CUSTOM' ? 'TEMPLATE_SAYA' : category,
      subcategory: subcategory.trim() || undefined,
      description: description.trim() || `Template ${name}`,
      badge: 'Template Saya',
      icon: 'Layers',
      parameters,
      spaces,
      components
    });

    onSaved(saved);
    onClose();
  };

  // Preview Calculations
  const previewContext: Record<string, number> = {};
  parameters.forEach(p => {
    if (typeof p.defaultValue === 'number') {
      previewContext[p.key] = p.defaultValue;
    } else if (!isNaN(Number(p.defaultValue))) {
      previewContext[p.key] = Number(p.defaultValue);
    }
  });

  const previewItems = components.map((comp, idx) => {
    let vol = 1.0;
    try {
      let expr = comp.calculationRule;
      for (const [k, v] of Object.entries(previewContext)) {
        expr = expr.replace(new RegExp(`\\b${k}\\b`, 'g'), String(v));
      }
      const sanitized = expr.replace(/[^0-9+\-*/(). ]/g, '');
      const fn = new Function(`return (${sanitized});`);
      vol = Number(fn()) || 1.0;
    } catch {
      vol = 1.0;
    }
    vol = Number(vol.toFixed(2));
    const price = comp.unitPrice || 0;
    const subtotal = vol * price;
    return {
      no: idx + 1,
      name: comp.name,
      category: comp.category,
      volume: vol,
      unit: comp.unit,
      unitPrice: price,
      subtotal,
      ahspCode: comp.ahspCode || 'CUSTOM'
    };
  });

  const previewTotal = previewItems.reduce((acc, i) => acc + i.subtotal, 0);

  const steps = [
    { num: 1, label: 'Informasi', icon: Layers },
    { num: 2, label: 'Parameter', icon: Sliders },
    { num: 3, label: 'Program Ruang', icon: Maximize2 },
    { num: 4, label: 'Komponen & Rule', icon: Calculator },
    { num: 5, label: 'Preview & Simpan', icon: CheckCircle2 }
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '920px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC'
          }}
        >
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              {initialTemplate ? 'Edit Template RAB' : 'Buat Template RAB Custom'}
            </h2>
            <p style={{ fontSize: '12.5px', color: '#64748B', margin: '4px 0 0' }}>
              Definisikan parameter, program ruang, dan formula QTO deterministik sesuai standar proyek Anda.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              background: '#EDF2F7',
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Stepper Tabs */}
        <div
          style={{
            display: 'flex',
            background: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
            padding: '0 24px',
            overflowX: 'auto'
          }}
        >
          {steps.map(s => {
            const isActive = activeStep === s.num;
            const Icon = s.icon;
            return (
              <button
                key={s.num}
                onClick={() => setActiveStep(s.num)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '14px 18px',
                  border: 'none',
                  background: 'none',
                  borderBottom: isActive ? '2px solid #2563EB' : '2px solid transparent',
                  color: isActive ? '#2563EB' : '#64748B',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: isActive ? '#2563EB' : '#E2E8F0',
                    color: isActive ? '#FFFFFF' : '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700
                  }}
                >
                  {s.num}
                </div>
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body / Step Content */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {/* STEP 1: INFORMASI DASAR */}
          {activeStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Nama Template <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Rumah Minimalis 2 Lantai 180 m² atau Gudang Baja WF"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13.5px'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Kategori Sektor
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as TemplateCategory)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      background: '#FFFFFF'
                    }}
                  >
                    {CATEGORY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Subkategori (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 2 Lantai / Rigid Pavement / Rangka Baja"
                    value={subcategory}
                    onChange={e => setSubcategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Deskripsi Singkat
                </label>
                <textarea
                  rows={3}
                  placeholder="Jelaskan ruang lingkup konstruksi, spesifikasi material, dan asumsi acuan template ini..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    lineHeight: 1.5
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Satuan Proyek
                  </label>
                  <select
                    value={projectUnit}
                    onChange={e => setProjectUnit(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      background: '#FFFFFF'
                    }}
                  >
                    <option value="m²">Luas Bangunan (m²)</option>
                    <option value="m">Panjang (m)</option>
                    <option value="unit">Unit</option>
                    <option value="km">Kilometer (km)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Default Luas / Dimensi
                  </label>
                  <input
                    type="number"
                    value={defaultArea}
                    onChange={e => setDefaultArea(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Default Jumlah Lantai
                  </label>
                  <input
                    type="number"
                    value={defaultFloors}
                    onChange={e => setDefaultFloors(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px'
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PARAMETER PROYEK */}
          {activeStep === 2 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                    Parameter Dinamis Proyek
                  </h3>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>
                    Variabel input yang akan diminta kepada user saat template diterapkan (cth. building_area, road_length).
                  </p>
                </div>
                <button
                  onClick={handleAddParameter}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: '#EFF6FF',
                    color: '#2563EB',
                    border: '1px solid #BFDBFE',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={15} />
                  <span>+ Tambah Parameter</span>
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {parameters.map((param, idx) => (
                  <div
                    key={param.id}
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      display: 'grid',
                      gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr auto',
                      gap: '12px',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '2px' }}>Label</span>
                      <input
                        type="text"
                        value={param.label}
                        onChange={e => handleUpdateParameter(param.id, { label: e.target.value })}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '2px' }}>Variabel Key</span>
                      <input
                        type="text"
                        value={param.key}
                        onChange={e => handleUpdateParameter(param.id, { key: e.target.value })}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '2px' }}>Tipe Input</span>
                      <select
                        value={param.type}
                        onChange={e => handleUpdateParameter(param.id, { type: e.target.value as ParameterInputType })}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', background: '#FFFFFF' }}
                      >
                        <option value="NUMBER">NUMBER</option>
                        <option value="TEXT">TEXT</option>
                        <option value="BOOLEAN">BOOLEAN</option>
                        <option value="SELECT">SELECT</option>
                      </select>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '2px' }}>Satuan</span>
                      <input
                        type="text"
                        placeholder="m², m, unit"
                        value={param.unit || ''}
                        onChange={e => handleUpdateParameter(param.id, { unit: e.target.value })}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '2px' }}>Default</span>
                      <input
                        type="text"
                        value={param.defaultValue ?? ''}
                        onChange={e => handleUpdateParameter(param.id, { defaultValue: isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) })}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                    <div>
                      <button
                        onClick={() => handleDeleteParameter(param.id)}
                        style={{ padding: '6px', borderRadius: '6px', border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer' }}
                        title="Hapus Parameter"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: PROGRAM RUANG */}
          {activeStep === 3 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                    Program Ruang (Space Planning)
                  </h3>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>
                    Daftar kebutuhan ruang beserta target luas standar untuk kategori bangunan.
                  </p>
                </div>
                <button
                  onClick={handleAddSpace}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: '#EFF6FF',
                    color: '#2563EB',
                    border: '1px solid #BFDBFE',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={15} />
                  <span>+ Tambah Ruang</span>
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {spaces.map(sp => (
                  <div
                    key={sp.id}
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      display: 'grid',
                      gridTemplateColumns: '2fr 1.5fr 1fr 1fr auto',
                      gap: '12px',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '2px' }}>Nama Ruang</span>
                      <input
                        type="text"
                        value={sp.name}
                        onChange={e => handleUpdateSpace(sp.id, { name: e.target.value })}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '2px' }}>Kategori Ruang</span>
                      <input
                        type="text"
                        value={sp.category}
                        onChange={e => handleUpdateSpace(sp.id, { category: e.target.value })}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '2px' }}>Rule Jumlah / Count</span>
                      <input
                        type="text"
                        placeholder="1 atau param"
                        value={sp.quantityRule}
                        onChange={e => handleUpdateSpace(sp.id, { quantityRule: e.target.value })}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '2px' }}>Target Luas (m²)</span>
                      <input
                        type="number"
                        value={sp.targetArea || 0}
                        onChange={e => handleUpdateSpace(sp.id, { targetArea: Number(e.target.value) })}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                    <div>
                      <button
                        onClick={() => handleDeleteSpace(sp.id)}
                        style={{ padding: '6px', borderRadius: '6px', border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: KOMPONEN PEKERJAAN & CALCULATION RULES */}
          {activeStep === 4 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                    Komponen Pekerjaan, Rule QTO & AHSP
                  </h3>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>
                    Setiap komponen dihitung secara deterministik dari parameter melalui formula transparan.
                  </p>
                </div>
                <button
                  onClick={handleAddComponent}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: '#EFF6FF',
                    color: '#2563EB',
                    border: '1px solid #BFDBFE',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={15} />
                  <span>+ Tambah Komponen</span>
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {components.map((comp, idx) => (
                  <div
                    key={comp.id}
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.5fr 1fr auto', gap: '12px', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '2px' }}>
                          Nama Pekerjaan #{idx + 1}
                        </span>
                        <input
                          type="text"
                          value={comp.name}
                          onChange={e => handleUpdateComponent(comp.id, { name: e.target.value })}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '2px' }}>Divisi / Kategori WBS</span>
                        <input
                          type="text"
                          value={comp.category}
                          onChange={e => handleUpdateComponent(comp.id, { category: e.target.value })}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '2px' }}>Satuan</span>
                        <input
                          type="text"
                          value={comp.unit}
                          onChange={e => handleUpdateComponent(comp.id, { unit: e.target.value })}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                        />
                      </div>
                      <div>
                        <button
                          onClick={() => handleDeleteComponent(comp.id)}
                          style={{ padding: '6px', borderRadius: '6px', border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', marginTop: '16px' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', alignItems: 'center', background: '#FFFFFF', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 650, display: 'block', marginBottom: '2px' }}>
                          Formula QTO (Rule Perhitungan)
                        </span>
                        <input
                          type="text"
                          placeholder="e.g. building_area * 1.05"
                          value={comp.calculationRule}
                          onChange={e => handleUpdateComponent(comp.id, { calculationRule: e.target.value })}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #93C5FD', fontSize: '12px', fontFamily: 'monospace' }}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '2px' }}>Kode AHSP PUPR</span>
                        <input
                          type="text"
                          placeholder="e.g. A.4.1.1.4"
                          value={comp.ahspCode || ''}
                          onChange={e => handleUpdateComponent(comp.id, { ahspCode: e.target.value })}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '2px' }}>Harga Satuan (IDR)</span>
                        <input
                          type="number"
                          value={comp.unitPrice || 0}
                          onChange={e => handleUpdateComponent(comp.id, { unitPrice: Number(e.target.value) })}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 5: PREVIEW & SIMPAN */}
          {activeStep === 5 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                    Live Preview Kalkulasi RAB
                  </h3>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>
                    Simulasi hasil kalkulasi otomatis berdasarkan default parameter yang Anda tentukan.
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>Estimasi Total RAB</span>
                  <strong style={{ fontSize: '17px', color: '#2563EB', fontWeight: 800 }}>
                    Rp {previewTotal.toLocaleString('id-ID')}
                  </strong>
                </div>
              </div>

              {/* Summary Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '18px' }}>
                <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>Kategori</span>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{category}</div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>Parameter</span>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{parameters.length} Parameter</div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>Program Ruang</span>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{spaces.length} Ruang</div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>Item Pekerjaan</span>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{components.length} Komponen</div>
                </div>
              </div>

              {/* Items Table */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px', width: '36px' }}>No</th>
                      <th style={{ padding: '8px 12px' }}>Uraian Pekerjaan</th>
                      <th style={{ padding: '8px 12px' }}>Kategori</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Volume</th>
                      <th style={{ padding: '8px 12px' }}>Satuan</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Harga Satuan</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map(item => (
                      <tr key={item.no} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 12px', color: '#64748B' }}>{item.no}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0F172A' }}>{item.name}</td>
                        <td style={{ padding: '8px 12px', color: '#64748B' }}>{item.category}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{item.volume.toLocaleString('id-ID')}</td>
                        <td style={{ padding: '8px 12px', color: '#64748B' }}>{item.unit}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748B' }}>Rp {item.unitPrice.toLocaleString('id-ID')}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>Rp {item.subtotal.toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 28px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC'
          }}
        >
          <button
            onClick={() => setActiveStep(prev => Math.max(1, prev - 1))}
            disabled={activeStep === 1}
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: activeStep === 1 ? '#94A3B8' : '#334155',
              fontSize: '13px',
              fontWeight: 600,
              cursor: activeStep === 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <ArrowLeft size={15} />
            <span>Kembali</span>
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            {activeStep < 5 ? (
              <button
                onClick={() => setActiveStep(prev => Math.min(5, prev + 1))}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Lanjut</span>
                <ArrowRight size={15} />
              </button>
            ) : (
              <button
                onClick={handleSaveTemplate}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#16A34A',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 6px -1px rgba(22, 163, 74, 0.3)'
                }}
              >
                <Save size={16} />
                <span>Simpan Template</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
