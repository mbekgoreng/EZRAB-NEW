import React, { useState } from 'react';
import {
  X,
  Package,
  Building,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Tag,
  DollarSign,
  MapPin,
  Check,
} from 'lucide-react';
import {
  ConstructionSector,
  MaterialMaster,
  MaterialPrice,
  PriceTier,
} from '../../domain/material/types';
import { INDONESIA_38_PROVINCES } from '../../domain/material/nationalRegionDatabase';
import { BRAND_CATALOG } from '../../domain/material/brandDatabase';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

interface AddMaterialWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (material: MaterialMaster, price?: MaterialPrice) => void;
}

export const AddMaterialWizardModal: React.FC<AddMaterialWizardModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Form State
  const [formData, setFormData] = useState({
    // Step 1: Basic Info
    name: '',
    sector: 'BANGUNAN' as ConstructionSector,
    category: 'Material Pokok',
    unit: 'sak',

    // Step 2: Specs
    specification: '',
    standard: 'SNI Berlaku',
    grade: '',

    // Step 3: Brand & Tier
    brand: 'Semen Gresik',
    productLine: '',
    priceTier: 'STANDARD' as PriceTier,

    // Step 4: Price & Region
    price: 75000,
    province: 'Jawa Timur',
    city: 'Surabaya',
    supplierName: 'Distributor Resmi',
    taxIncluded: false,
    deliveryIncluded: false,
    notes: '',
  });

  if (!isOpen) return null;

  const handleNext = () => {
    if (step === 1 && !formData.name.trim()) {
      alert('Mohon isi nama material terlebih dahulu.');
      return;
    }
    if (step < 5) {
      setStep((step + 1) as any);
    }
  };

  const handlePrev = () => {
    if (step > 1) {
      setStep((step - 1) as any);
    }
  };

  const handleSubmit = () => {
    const autoCode = `MAT-${formData.sector.slice(0, 3)}-${Date.now().toString().slice(-5)}`;
    const newMaterial: MaterialMaster = {
      id: `mat-${Date.now()}`,
      materialCode: autoCode,
      name: formData.name.trim(),
      category: formData.category,
      sector: formData.sector,
      unit: formData.unit.trim().toLowerCase(),
      specification: formData.specification.trim() || 'Spesifikasi standar konstruksi',
      standard: formData.standard.trim(),
      grade: formData.grade.trim() || undefined,
      brand: formData.brand.trim() || 'Multi-Brand',
      product: formData.productLine.trim() || undefined,
      priceTier: formData.priceTier,
      active: true,
      coverageStatus: 'VERIFIED',
    };

    let newPriceRec: MaterialPrice | undefined = undefined;
    if (formData.price > 0) {
      newPriceRec = {
        id: `prc-${Date.now()}`,
        materialId: newMaterial.id,
        materialCode: autoCode,
        regionId: `REG-${formData.city.toUpperCase()}`,
        region: {
          country: 'Indonesia',
          province: formData.province,
          city: formData.city,
        },
        price: Number(formData.price),
        currency: 'IDR',
        unit: newMaterial.unit,
        priceTier: formData.priceTier,
        priceType: 'USER_DEFINED',
        sourceType: 'USER_INPUT',
        sourceName: formData.supplierName || 'Penawaran Rekanan',
        supplierName: formData.supplierName,
        taxIncluded: formData.taxIncluded,
        taxRate: 0.11,
        deliveryIncluded: formData.deliveryIncluded,
        confidence: 'HIGH',
        verificationStatus: 'VERIFIED',
        freshness: 'CURRENT',
        priceDate: new Date().toISOString().split('T')[0],
        notes: formData.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    onSave(newMaterial, newPriceRec);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full text-xs shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <span className="text-[10px] font-bold text-emerald-700 tracking-wider uppercase">
              Wizard Tambah Material
            </span>
            <h3 className="text-base font-black text-slate-900 mt-0.5">
              Registrasi Material Baru ke Database 2026
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-3 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between gap-1">
          {[
            { num: 1, label: 'Info Dasar' },
            { num: 2, label: 'Spesifikasi' },
            { num: 3, label: 'Merek' },
            { num: 4, label: 'Harga' },
            { num: 5, label: 'Review' },
          ].map((st) => (
            <div key={st.num} className="flex items-center gap-1.5 flex-1">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition ${
                  step === st.num
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : step > st.num
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {step > st.num ? '✓' : st.num}
              </span>
              <span
                className={`text-[10.5px] font-semibold truncate hidden sm:inline ${
                  step === st.num ? 'text-slate-900' : 'text-slate-400'
                }`}
              >
                {st.label}
              </span>
            </div>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* STEP 1: BASIC INFO */}
          {step === 1 && (
            <div className="space-y-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Resmi Material <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Semen Portland Komposit PCC 50kg / Pipa PVC AW 1/2 inch..."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Sektor Konstruksi</label>
                  <select
                    value={formData.sector}
                    onChange={(e) => setFormData({ ...formData, sector: e.target.value as any })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-emerald-500"
                  >
                    <option value="BANGUNAN">Gedung & Perumahan</option>
                    <option value="JALAN">Jalan & Jembatan</option>
                    <option value="DRAINASE">Drainase & Saluran</option>
                    <option value="JEMBATAN">Jembatan Khusus</option>
                    <option value="IRIGASI">Irigasi & Air Baku</option>
                    <option value="SUNGAI">Sungai & Proteksi Banjir</option>
                    <option value="BENDUNG">Bendung & Mercu</option>
                    <option value="EMBUNG">Embung & Retensi</option>
                    <option value="BENDUNGAN">Bendungan Urugan</option>
                    <option value="BANGUNAN_AIR">Bangunan Air / WTP</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Satuan Standar</label>
                  <input
                    type="text"
                    required
                    placeholder="sak, m, m2, m3, kg, batang, lonjor..."
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 outline-none focus:bg-white focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Kategori Material</label>
                <input
                  type="text"
                  placeholder="Bahan Semen, Baja & Pembesian, Perpipaan, Pasangan..."
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 outline-none focus:bg-white focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* STEP 2: SPECIFICATION */}
          {step === 2 && (
            <div className="space-y-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Spesifikasi Teknis Rinci</label>
                <textarea
                  rows={4}
                  placeholder="Karakteristik teknis, kuat tekan, dimensi, ketebalan, toleransi mutu..."
                  value={formData.specification}
                  onChange={(e) => setFormData({ ...formData, specification: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 outline-none focus:bg-white focus:border-emerald-500 leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Standar Acuan (SNI / ASTM)</label>
                  <input
                    type="text"
                    placeholder="SNI 7064:2014 / ASTM C150..."
                    value={formData.standard}
                    onChange={(e) => setFormData({ ...formData, standard: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 outline-none focus:bg-white focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipe Mutu / Grade</label>
                  <input
                    type="text"
                    placeholder="Tipe I, K-300, D-13, AW..."
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 outline-none focus:bg-white focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: BRAND & TIER */}
          {step === 3 && (
            <div className="space-y-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Merek / Produsen</label>
                <div className="flex gap-2">
                  <select
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-emerald-500"
                  >
                    {BRAND_CATALOG.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name} ({b.canonicalBrand})
                      </option>
                    ))}
                    <option value="Lainnya">Merek Lainnya (Ketik Manual)</option>
                  </select>
                </div>
              </div>

              {formData.brand === 'Lainnya' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ketik Nama Merek</label>
                  <input
                    type="text"
                    placeholder="Masukkan nama pabrikan / merk..."
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 outline-none focus:bg-white focus:border-emerald-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Lini Produk / Seri</label>
                  <input
                    type="text"
                    placeholder="PCC, Maxima, Super, JIS..."
                    value={formData.productLine}
                    onChange={(e) => setFormData({ ...formData, productLine: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 outline-none focus:bg-white focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kelas Harga (Tiering)</label>
                  <select
                    value={formData.priceTier}
                    onChange={(e) => setFormData({ ...formData, priceTier: e.target.value as any })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-emerald-500"
                  >
                    <option value="ECONOMY">Economy</option>
                    <option value="STANDARD">Standard</option>
                    <option value="PROFESSIONAL">Professional</option>
                    <option value="PREMIUM">Premium</option>
                    <option value="LUXURY">Luxury</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: PRICE & REGION */}
          {step === 4 && (
            <div className="space-y-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Harga Satuan Acuan Awal (IDR)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="75000"
                  value={formData.price || ''}
                  onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono font-bold text-emerald-800 outline-none focus:bg-white focus:border-emerald-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Kosongkan jika harga belum tersedia. Jangan isi angka palsu.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Provinsi</label>
                  <select
                    value={formData.province}
                    onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 outline-none focus:bg-white focus:border-emerald-500"
                  >
                    {INDONESIA_38_PROVINCES.map((p) => (
                      <option key={p.code} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kota / Kabupaten</label>
                  <input
                    type="text"
                    placeholder="Surabaya, Bandung, Jakarta..."
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 outline-none focus:bg-white focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Sumber / Nama Supplier</label>
                <input
                  type="text"
                  placeholder="PT Semen Indonesia Tbk / Distributor Resmi..."
                  value={formData.supplierName}
                  onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 outline-none focus:bg-white focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.taxIncluded}
                    onChange={(e) => setFormData({ ...formData, taxIncluded: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  Termasuk PPN 11%
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.deliveryIncluded}
                    onChange={(e) => setFormData({ ...formData, deliveryIncluded: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  Termasuk Ongkir ke Proyek
                </label>
              </div>
            </div>
          )}

          {/* STEP 5: REVIEW */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                  Ringkasan Material yang Akan Didaftarkan
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Nama Material:</span>
                    <strong className="text-slate-900">{formData.name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Sektor & Satuan:</span>
                    <strong className="text-slate-900">
                      {formData.sector} • {formData.unit}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Merek & Lini:</span>
                    <strong className="text-slate-900">
                      {formData.brand} {formData.productLine ? `(${formData.productLine})` : ''}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Kelas Harga:</span>
                    <strong className="text-slate-900">{formData.priceTier}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Harga Acuan:</span>
                    <strong className="text-emerald-700 font-mono font-bold">
                      {formData.price > 0 ? `${formatCurrencyIDR(formData.price)} / ${formData.unit}` : 'Belum Ditentukan'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Wilayah & Supplier:</span>
                    <strong className="text-slate-900">
                      {formData.city}, {formData.province}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Jaminan Integritas Data EZRAB:</strong> Material ini akan mendapatkan kode unik kanonikal, siap digunakan untuk estimasi RAB, AHSP, dan kalkulator konstruksi.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={step === 1 ? onClose : handlePrev}
            className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition"
          >
            {step === 1 ? 'Batal' : 'Kembali'}
          </button>

          {step < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold transition flex items-center gap-1.5 shadow-xs"
            >
              Lanjut
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center gap-1.5 shadow-xs"
            >
              <Check className="w-4 h-4" />
              Simpan ke Database
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
