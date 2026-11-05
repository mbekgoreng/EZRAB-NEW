import React, { useEffect, useState } from 'react';
import { X, Check, Tag } from 'lucide-react';
import { MaterialMaster, MaterialPrice, PriceTier } from '../../domain/material/types';
import { INDONESIA_38_PROVINCES } from '../../domain/material/nationalRegionDatabase';
import { BRAND_CATALOG } from '../../domain/material/brandDatabase';

interface AddBrandPriceModalProps {
  isOpen: boolean;
  material: MaterialMaster | null;
  onClose: () => void;
  onSave: (price: MaterialPrice) => void;
}

/**
 * Form khusus "+ Tambah Merek": menambah SATU record harga bermerek untuk
 * material yang dipilih (bukan membuat material baru). Record masuk lewat
 * matDb.addPriceRecord sehingga langsung tampil di panel Perbandingan Harga
 * Merek inspektur dan bertahan setelah reload.
 */
export const AddBrandPriceModal: React.FC<AddBrandPriceModalProps> = ({
  isOpen,
  material,
  onClose,
  onSave,
}) => {
  const [brand, setBrand] = useState('');
  const [manualBrand, setManualBrand] = useState('');
  const [priceTier, setPriceTier] = useState<PriceTier>('STANDARD');
  const [price, setPrice] = useState<number>(0);
  const [province, setProvince] = useState('Jawa Timur');
  const [city, setCity] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [taxIncluded, setTaxIncluded] = useState(false);
  const [deliveryIncluded, setDeliveryIncluded] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setBrand('');
    setManualBrand('');
    setPriceTier((material?.priceTier as PriceTier) || 'STANDARD');
    setPrice(0);
    setProvince('Jawa Timur');
    setCity('');
    setSupplierName('');
    setTaxIncluded(false);
    setDeliveryIncluded(false);
  }, [isOpen, material]);

  if (!isOpen || !material) return null;

  const finalBrand = (brand === 'Lainnya' ? manualBrand : brand).trim();

  const handleSave = () => {
    if (!finalBrand) {
      alert('Mohon pilih atau isi nama merek terlebih dahulu.');
      return;
    }
    if (!(price > 0)) {
      alert('Mohon isi harga satuan merek ini (harus lebih dari 0).');
      return;
    }
    const rec: MaterialPrice = {
      id: `prc-${Date.now()}`,
      materialId: material.id,
      materialCode: material.materialCode,
      brand: finalBrand,
      brandName: finalBrand,
      regionId: `REG-${(city || province).toUpperCase()}`,
      region: { country: 'Indonesia', province, city },
      price: Number(price),
      currency: 'IDR',
      unit: material.unit,
      priceTier,
      priceType: 'USER_DEFINED',
      sourceType: 'USER_INPUT',
      sourceName: supplierName || 'Input pengguna (tambah merek)',
      supplierName: supplierName || undefined,
      taxIncluded,
      taxRate: 0.11,
      deliveryIncluded,
      confidence: 'HIGH',
      verificationStatus: 'VERIFIED',
      freshness: 'CURRENT',
      priceDate: new Date().toISOString().split('T')[0],
      notes: 'Ditambahkan dari tombol + Tambah Merek di Database Material',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSave(rec);
    onClose();
  };

  const inputCls =
    'w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 outline-none focus:bg-white focus:border-emerald-500';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="ez-bg-surface border border-slate-200 rounded-2xl max-w-md w-full text-xs shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <span className="text-[10px] font-bold text-emerald-700 tracking-wider uppercase flex items-center gap-1">
              <Tag className="w-3 h-3" /> Tambah Merek &amp; Harga
            </span>
            <h3 className="text-base font-black ez-text-primary mt-0.5">
              {material.name}
            </h3>
            <span className="text-[11px] text-slate-400">
              {material.materialCode} • satuan {material.unit}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-3.5">
          <div>
            <label className="block font-bold ez-text-body mb-1">
              Merek / Produsen <span className="text-red-500">*</span>
            </label>
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls}>
              <option value="">— Pilih merek —</option>
              {BRAND_CATALOG.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name} ({b.canonicalBrand})
                </option>
              ))}
              <option value="Lainnya">Merek Lainnya (Ketik Manual)</option>
            </select>
          </div>

          {brand === 'Lainnya' && (
            <div>
              <label className="block font-bold ez-text-body mb-1">Ketik Nama Merek</label>
              <input
                type="text"
                value={manualBrand}
                onChange={(e) => setManualBrand(e.target.value)}
                placeholder="Masukkan nama pabrikan / merek..."
                className={inputCls}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold ez-text-body mb-1">
                Harga Satuan (IDR) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                value={price || ''}
                onChange={(e) => setPrice(Number(e.target.value))}
                placeholder="76500"
                className={`${inputCls} font-mono font-bold`}
              />
            </div>
            <div>
              <label className="block font-bold ez-text-body mb-1">Kelas Harga</label>
              <select
                value={priceTier}
                onChange={(e) => setPriceTier(e.target.value as PriceTier)}
                className={inputCls}
              >
                <option value="ECONOMY">Economy</option>
                <option value="STANDARD">Standard</option>
                <option value="PROFESSIONAL">Professional</option>
                <option value="PREMIUM">Premium</option>
                <option value="LUXURY">Luxury</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold ez-text-body mb-1">Provinsi</label>
              <select value={province} onChange={(e) => setProvince(e.target.value)} className={inputCls}>
                {INDONESIA_38_PROVINCES.map((p) => (
                  <option key={p.code} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold ez-text-body mb-1">Kota / Kabupaten</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Surabaya, Malang..."
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block font-bold ez-text-body mb-1">Sumber / Nama Supplier</label>
            <input
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Distributor / toko tempat harga diperoleh..."
              className={inputCls}
            />
          </div>

          <div className="flex items-center gap-5 pt-1">
            <label className="flex items-center gap-2 cursor-pointer font-medium ez-text-body">
              <input
                type="checkbox"
                checked={taxIncluded}
                onChange={(e) => setTaxIncluded(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              Termasuk PPN 11%
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-medium ez-text-body">
              <input
                type="checkbox"
                checked={deliveryIncluded}
                onChange={(e) => setDeliveryIncluded(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              Termasuk Ongkir
            </label>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg ez-bg-surface border border-slate-300 ez-text-body font-semibold transition"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center gap-1.5 shadow-xs"
          >
            <Check className="w-4 h-4" />
            Simpan Merek &amp; Harga
          </button>
        </div>
      </div>
    </div>
  );
};
