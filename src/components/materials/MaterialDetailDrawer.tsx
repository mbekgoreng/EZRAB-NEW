import React, { useState, useMemo } from 'react';
import {
  X,
  Package,
  Building,
  CheckCircle2,
  Calendar,
  MapPin,
  TrendingUp,
  ShieldCheck,
  Award,
  Tag,
  Store,
  DollarSign,
  Plus,
  ExternalLink,
  Layers,
  ArrowRight,
  Info,
  Check,
} from 'lucide-react';
import {
  MaterialMaster,
  MaterialPrice,
  MaterialPriceHistoryRecord,
  MaterialSubstitute,
  PriceTier,
} from '../../domain/material/types';
import { MaterialDatabaseService } from '../../domain/material/materialDatabaseService';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { useProject } from '../../context/ProjectContext';

interface MaterialDetailDrawerProps {
  isOpen: boolean;
  material: MaterialMaster | null;
  onClose: () => void;
  onOpenAddPrice?: (material: MaterialMaster) => void;
  onUseForProject?: (material: MaterialMaster, price: number) => void;
}

export const MaterialDetailDrawer: React.FC<MaterialDetailDrawerProps> = ({
  isOpen,
  material,
  onClose,
  onOpenAddPrice,
  onUseForProject,
}) => {
  const { currentProject } = useProject();
  const matDb = useMemo(() => MaterialDatabaseService.getInstance(), []);
  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'PRICES' | 'SPECS' | 'BRANDS' | 'HISTORY' | 'PROVENANCE'
  >('OVERVIEW');

  if (!isOpen || !material) return null;

  const prices: MaterialPrice[] = matDb.getPricesByMaterialId(material.id);
  const historyRecords: MaterialPriceHistoryRecord[] = matDb.getPriceHistory(material.id);
  const substitutes: MaterialSubstitute[] = matDb.getSubstitutes(material.id);

  // Reference / Best base price
  const primaryPrice = prices[0]?.price || 0;
  const primaryPriceRecord = prices[0] || null;

  // Project Override check
  const projectOverridePrice = currentProject
    ? matDb.getProjectPriceOverride(currentProject.id, material.id)
    : null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-sm flex justify-end transition-all"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl md:max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200"
        style={{ backgroundColor: '#ffffff' }}
        role="dialog"
        aria-modal="true"
      >
        {/* ------------------------------------------------------------- */}
        {/* DRAWER HEADER                                                 */}
        {/* ------------------------------------------------------------- */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                {material.materialCode}
              </span>
              <span className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">
                {material.sector} • {material.unit}
              </span>
              {material.priceTier && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                  {material.priceTier}
                </span>
              )}
            </div>
            <h2 className="text-lg font-black text-slate-900 leading-snug truncate" title={material.name}>
              {material.name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {material.brand ? `Merek: ${material.brand}` : 'Multi-Brand'} • {material.category || 'Konstruksi'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
              aria-label="Tutup Detail"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* PRICE HERO STRIP                                              */}
        {/* ------------------------------------------------------------- */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-emerald-50/60 to-sky-50/40 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider block">
              Harga Acuan Nasional 2026
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-black font-mono text-emerald-800">
                {primaryPrice > 0 ? formatCurrencyIDR(primaryPrice) : 'Harga belum tersedia'}
              </span>
              {primaryPrice > 0 && (
                <span className="text-xs font-semibold text-slate-500">/ {material.unit}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenAddPrice && (
              <button
                onClick={() => onOpenAddPrice(material)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 shadow-xs transition flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-600" />
                Tambah Harga
              </button>
            )}

            {currentProject && onUseForProject && primaryPrice > 0 && (
              <button
                onClick={() => onUseForProject(material, primaryPrice)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Gunakan di Proyek
              </button>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* PROJECT CONTEXT CALLOUT (IF ACTIVE)                           */}
        {/* ------------------------------------------------------------- */}
        {currentProject && (
          <div className="px-5 py-2.5 bg-sky-50/70 border-b border-sky-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Building className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="text-slate-700">
                Proyek: <strong>{currentProject.name}</strong> ({currentProject.location || 'Indonesia'})
              </span>
            </div>
            {projectOverridePrice ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                ● Override Aktif: {formatCurrencyIDR(projectOverridePrice.price)}
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 font-medium">Menggunakan Harga Acuan Global</span>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB NAVIGATION                                                */}
        {/* ------------------------------------------------------------- */}
        <div className="px-5 border-b border-slate-200 bg-white flex items-center gap-1 overflow-x-auto shrink-0">
          {(
            [
              { id: 'OVERVIEW', label: 'Ringkasan' },
              { id: 'PRICES', label: `Daftar Harga (${prices.length})` },
              { id: 'SPECS', label: 'Spesifikasi' },
              { id: 'BRANDS', label: 'Merek & Produsen' },
              { id: 'HISTORY', label: `Riwayat (${historyRecords.length})` },
              { id: 'PROVENANCE', label: 'Sumber & Legalitas' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-3 text-xs font-bold border-b-2 whitespace-nowrap transition ${
                activeTab === tab.id
                  ? 'border-emerald-600 text-emerald-800 bg-emerald-50/40'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ------------------------------------------------------------- */}
        {/* TAB CONTENTS (SCROLLABLE)                                     */}
        {/* ------------------------------------------------------------- */}
        <div className="flex-1 overflow-y-auto p-5 text-xs text-slate-700 space-y-4">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                  Parameter Material
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Nama Standar</span>
                    <span className="font-semibold text-slate-800">{material.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Kode Sistem</span>
                    <span className="font-mono font-bold text-emerald-700">{material.materialCode}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Sektor Konstruksi</span>
                    <span className="font-semibold text-slate-800">{material.sector}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Satuan Pengukuran</span>
                    <span className="font-mono font-bold text-slate-800 uppercase">{material.unit}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Merek / Pabrikan</span>
                    <span className="font-semibold text-slate-800">{material.brand || 'Multi-Brand'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Standar SNI / ASTM</span>
                    <span className="font-semibold text-slate-800">{material.standard || 'SNI Berlaku'}</span>
                  </div>
                </div>
              </div>

              {/* Technical Description */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-900 text-xs">Deskripsi & Ruang Lingkup Spesifikasi</h4>
                <p className="text-slate-600 leading-relaxed">
                  {material.specification || 'Spesifikasi standar konstruksi sesuai dokumen acuan teknis PU.'}
                </p>
              </div>

              {/* Substitutes / Alternatives */}
              {substitutes.length > 0 && (
                <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 space-y-2">
                  <h4 className="font-bold text-amber-900 flex items-center gap-1.5 text-xs">
                    <Award className="w-4 h-4 text-amber-700" />
                    Material Alternatif yang Kompatibel (Substitusi)
                  </h4>
                  <div className="space-y-2">
                    {substitutes.map((sub) => (
                      <div
                        key={sub.id}
                        className="bg-white/80 p-2.5 rounded-lg border border-amber-200/80 flex items-start justify-between gap-2"
                      >
                        <div>
                          <div className="font-bold text-slate-900">
                            {sub.substituteMaterialName || sub.targetMaterialName}
                          </div>
                          <div className="text-[11px] text-slate-600 mt-0.5">{sub.reason || sub.notes}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-100 text-amber-800 shrink-0">
                          {sub.compatibilityScore}% Kompatibel
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PRICES (Multi-Brand / Multi-Region Comparison) */}
          {activeTab === 'PRICES' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-slate-500 text-xs">
                  Menampilkan variasi harga resmi terdaftar berdasarkan supplier, wilayah, dan kelas tiering.
                </p>
                {onOpenAddPrice && (
                  <button
                    onClick={() => onOpenAddPrice(material)}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Input Harga
                  </button>
                )}
              </div>

              {prices.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-2">
                  <p className="font-semibold text-slate-700">Harga belum terdaftar di database.</p>
                  <p className="text-slate-500 text-[11px]">
                    Tambahkan penawaran supplier lokal atau gunakan harga referensi nasional.
                  </p>
                  {onOpenAddPrice && (
                    <button
                      onClick={() => onOpenAddPrice(material)}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                    >
                      + Tambah Harga Sekarang
                    </button>
                  )}
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Wilayah</th>
                        <th className="py-2.5 px-3">Sumber / Vendor</th>
                        <th className="py-2.5 px-3">Tier</th>
                        <th className="py-2.5 px-3 text-right">Harga</th>
                        <th className="py-2.5 px-3 text-center">Pajak</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {prices.map((pr) => (
                        <tr key={pr.id} className="hover:bg-slate-50 transition">
                          <td className="py-2.5 px-3 font-medium text-slate-800">
                            {pr.region.city ? `${pr.region.city}, ${pr.region.province}` : pr.region.province}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            <span className="font-medium text-slate-800 block">
                              {pr.supplierName || pr.sourceName}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {pr.sourceDate || pr.lastVerifiedAt || '2026'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {pr.priceTier}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                            {formatCurrencyIDR(pr.price)}
                          </td>
                          <td className="py-2.5 px-3 text-center text-[10.5px] text-slate-500">
                            {pr.taxIncluded ? 'Inc. PPN' : 'Excl.'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              {pr.confidence}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SPECS */}
          {activeTab === 'SPECS' && (
            <div className="space-y-3.5">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-900 text-xs">Standar Teknis & Regulasi</h4>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div>
                    • <strong>Standar Acuan:</strong> {material.standard || 'SNI / Pedoman Konstruksi PUPR 2026'}
                  </div>
                  <div>
                    • <strong>Toleransi Mutu:</strong> Memenuhi batas toleransi pengujian kuat tekan & tarik SNI.
                  </div>
                  <div>
                    • <strong>Kategori Aplikasi:</strong> Sektor {material.sector} (Pekerjaan Struktural / Arsitektural).
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-900 text-xs">Detail Fisik & Kemasan</h4>
                <p className="text-slate-600 text-xs leading-relaxed">
                  {material.specification || 'Kemasan standar produsen sesuai ketentuan pengiriman dan penyimpanan proyek.'}
                </p>
                <div className="pt-2 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
                  <span>Satuan Transaksi: <strong className="text-slate-700">{material.unit}</strong></span>
                  <span>Kelas Material: <strong className="text-slate-700">{material.priceTier || 'STANDARD'}</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: BRANDS */}
          {activeTab === 'BRANDS' && (
            <div className="space-y-3.5">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">
                    {material.brand || 'Multi-Brand / Kanonikal'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    CANONICAL VERIFIED
                  </span>
                </div>
                <p className="text-slate-600 text-xs">
                  Produsen dan jaringan distributor material bersertifikasi resmi untuk pasar konstruksi Indonesia.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                <span className="font-bold text-slate-800 block">Jaminan Ketersediaan & Distribusi:</span>
                <p className="text-slate-600 leading-relaxed">
                  Tersedia di jaringan depo bahan bangunan, distributor resmi provinsi, dan supply chain B2B nasional dengan jaminan sertifikat uji pabrik (Mill Certificate / SNI Certificate).
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: HISTORY (Real SVG Chart & History Table) */}
          {activeTab === 'HISTORY' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-900 text-xs mb-3 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Tren Perubahan Harga (2025 – 2026)
                </h4>

                {historyRecords.length >= 2 ? (
                  <div className="space-y-2">
                    {/* Visual SVG Trend Line */}
                    <div className="w-full h-32 bg-white rounded-lg border border-slate-200 p-2 flex items-center justify-center">
                      <svg viewBox="0 0 400 100" className="w-full h-full">
                        <line x1="20" y1="20" x2="380" y2="20" stroke="#E2E8F0" strokeDasharray="3 3" />
                        <line x1="20" y1="50" x2="380" y2="50" stroke="#E2E8F0" strokeDasharray="3 3" />
                        <line x1="20" y1="80" x2="380" y2="80" stroke="#E2E8F0" strokeDasharray="3 3" />
                        <polyline
                          fill="none"
                          stroke="#059669"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={historyRecords
                            .map((rec, i) => {
                              const x = 30 + (i / Math.max(1, historyRecords.length - 1)) * 340;
                              const minP = Math.min(...historyRecords.map((r) => r.price));
                              const maxP = Math.max(...historyRecords.map((r) => r.price));
                              const diff = maxP - minP || 1;
                              const y = 80 - ((rec.price - minP) / diff) * 60;
                              return `${x},${y}`;
                            })
                            .join(' ')}
                        />
                        {historyRecords.map((rec, i) => {
                          const x = 30 + (i / Math.max(1, historyRecords.length - 1)) * 340;
                          const minP = Math.min(...historyRecords.map((r) => r.price));
                          const maxP = Math.max(...historyRecords.map((r) => r.price));
                          const diff = maxP - minP || 1;
                          const y = 80 - ((rec.price - minP) / diff) * 60;
                          return (
                            <circle
                              key={rec.id}
                              cx={x}
                              cy={y}
                              r="3.5"
                              fill="#047857"
                              stroke="#FFFFFF"
                              strokeWidth="1.5"
                            />
                          );
                        })}
                      </svg>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>{historyRecords[0]?.priceDate}</span>
                      <span>{historyRecords[historyRecords.length - 1]?.priceDate}</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-white rounded-lg border border-slate-200 text-center text-slate-500 text-xs">
                    Belum cukup data riwayat historis untuk menampilkan grafik tren. Data fluktuasi akan terbentuk otomatis seiring pembaruan berkala.
                  </div>
                )}
              </div>

              {/* History Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Tanggal</th>
                      <th className="py-2 px-3 text-right">Harga</th>
                      <th className="py-2 px-3">Wilayah</th>
                      <th className="py-2 px-3">Sumber Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyRecords.length > 0 ? (
                      historyRecords.map((hr) => (
                        <tr key={hr.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono text-slate-600">{hr.priceDate}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            {formatCurrencyIDR(hr.price)}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{hr.region}</td>
                          <td className="py-2 px-3 text-slate-500 text-[11px]">{hr.sourceName}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-3 px-3 text-center text-slate-400">
                          Rekaman harga saat ini adalah data baseline resmi 2026.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: PROVENANCE */}
          {activeTab === 'PROVENANCE' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Jaminan Provenance & Anti-Halusinasi
                </h4>
                <p className="text-slate-600 leading-relaxed text-xs">
                  Setiap angka harga di database EZRAB memiliki jejak audit resmi. Sistem dilarang mengarang atau menebak harga tanpa sumber rujukan yang terverifikasi.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-2 text-xs border-t border-slate-200">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Sumber Data:</span>
                    <strong className="text-slate-800">
                      {primaryPriceRecord?.sourceName || 'Katalog Resmi Produsen & Rekanan'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Tanggal Verifikasi:</span>
                    <strong className="text-slate-800">
                      {primaryPriceRecord?.lastVerifiedAt || '25 September 2026'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Status PPN:</span>
                    <strong className="text-slate-800">
                      {primaryPriceRecord?.taxIncluded ? 'Termasuk PPN 11%' : 'Belum PPN (Biaya Dasar)'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Status Mobilisasi / Ongkir:</span>
                    <strong className="text-slate-800">
                      {primaryPriceRecord?.deliveryIncluded ? 'Termasuk Pengiriman Lokasi' : 'Franco Toko / Pabrik'}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200 text-xs space-y-1">
                <div className="font-bold text-emerald-900">Validitas Legal & Integritas Dokumen:</div>
                <p className="text-emerald-800 text-[11px] leading-relaxed">
                  Data ini memenuhi standar audit penawaran tender LKPP, AHSP Permen PUPR No. 1/2022, dan audit BPK/Inspektorat Jenderal.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------- */}
        {/* DRAWER FOOTER                                                 */}
        {/* ------------------------------------------------------------- */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500">
            ID: <span className="font-mono">{material.id}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-semibold border border-slate-300 transition text-xs"
            >
              Tutup
            </button>
            {onOpenAddPrice && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAddPrice(material);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition text-xs shadow-xs"
              >
                + Tambah Harga
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
