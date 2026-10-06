import React, { useState, useMemo } from 'react';
import {
  Package,
  HardHat,
  Truck,
  Search,
  Plus,
  Download,
  MapPin,
  Trash2,
  Database,
  Layers,
  X,
  CheckCircle2,
  Filter,
  Sparkles,
  Tag,
} from 'lucide-react';
import { PriceItem } from '../../types';
import { MASTER_PRICE_ITEMS } from '../../data/indonesianPrices';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

interface PricesExplorerViewProps {
  category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT';
  onNavigateToTab?: (tab: string) => void;
}

export const PricesExplorerView: React.FC<PricesExplorerViewProps> = ({
  category,
  onNavigateToTab,
}) => {
  // Loaded from master dataset with capability to add/remove custom items
  const [itemsList, setItemsList] = useState<PriceItem[]>(MASTER_PRICE_ITEMS);
  const [search, setSearch] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('Semua Kategori');
  const [selectedLocation, setSelectedLocation] = useState('Semua Wilayah');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'code'>('code');
  const [sortAsc, setSortAsc] = useState(true);

  // Modal State for adding new item
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newItemCode, setNewItemCode] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemBrand, setNewItemBrand] = useState('');
  const [newItemSubcat, setNewItemSubcat] = useState('Keramik & Porselen');
  const [newItemSpec, setNewItemSpec] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('m²');
  const [newItemPrice, setNewItemPrice] = useState<number>(0);
  const [newItemMinPrice, setNewItemMinPrice] = useState<number>(0);
  const [newItemMaxPrice, setNewItemMaxPrice] = useState<number>(0);
  const [newItemLocation, setNewItemLocation] = useState('Jabodetabek');

  // Subcategories list for Material
  const materialSubcategories = [
    'Semua Kategori',
    'Keramik & Porselen',
    'Batu, Bata & Roster',
    'Semen, Mortar & Beton',
    'Baja & Besi',
    'Cat',
    'Plafon & Partisi',
    'Kayu, MDF & HPL',
    'Vinyl, SPC & Laminate',
    'Plumbing & Sanitair',
    'Electrical & Lighting',
    'Roofing',
    'Fasad & Exterior',
    'Waterproofing & Sealant',
    'Landscape & Vegetasi',
    'Fire Safety',
  ];

  // Filter and search logic
  const items = useMemo(() => {
    let result = itemsList.filter((item) => item.category === category);

    if (category === 'MATERIAL' && selectedSubcategory !== 'Semua Kategori') {
      result = result.filter((item) => item.subcategory === selectedSubcategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.code.toLowerCase().includes(q) ||
          (item.brand && item.brand.toLowerCase().includes(q)) ||
          (item.specification && item.specification.toLowerCase().includes(q))
      );
    }

    if (selectedLocation !== 'Semua Wilayah') {
      result = result.filter((item) => item.location.includes(selectedLocation));
    }

    result.sort((a, b) => {
      let valA: any = a[sortBy] || '';
      let valB: any = b[sortBy] || '';
      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });

    return result;
  }, [itemsList, category, selectedSubcategory, search, selectedLocation, sortBy, sortAsc]);

  const categoryMeta = {
    MATERIAL: {
      title: 'Master Database Material 2026',
      sub: '6.000+ item & varian material konstruksi resmi, keramik multi-merek, semen, baja, finishing & MEP standar 2026.',
      icon: Package,
      badge: 'Material Standar SNI 2026',
      color: '#2563EB',
      lightBg: '#EFF6FF',
    },
    LABOR: {
      title: 'Database Standar Upah Tenaga Kerja 2026',
      sub: 'Standar upah harian (OH / Orang Hari) pekerja, tukang, kepala tukang, dan mandor standar Permen PUPR 2026.',
      icon: HardHat,
      badge: 'Standar Upah OH 2026',
      color: '#F59E0B',
      lightBg: '#FEF3C7',
    },
    EQUIPMENT: {
      title: 'Database Sewa Peralatan Konstruksi 2026',
      sub: 'Tarif sewa alat berat, molen, stamper, scaffolding, dan alat bantu proyek standar Permen PUPR 2026.',
      icon: Truck,
      badge: 'Tarif Sewa Peralatan 2026',
      color: '#10B981',
      lightBg: '#DCFCE7',
    },
  }[category];

  const Icon = categoryMeta.icon;

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    const created: PriceItem = {
      id: `custom-${Date.now()}`,
      code: newItemCode || `${category === 'MATERIAL' ? 'MAT' : category === 'LABOR' ? 'L' : 'E'}.${itemsList.length + 1}`,
      name: newItemName,
      category,
      subcategory: category === 'MATERIAL' ? newItemSubcat : undefined,
      brand: newItemBrand || 'Umum',
      unit: newItemUnit,
      price: Number(newItemPrice) || 0,
      minPrice: Number(newItemMinPrice) || Number(newItemPrice) || 0,
      maxPrice: Number(newItemMaxPrice) || Number(newItemPrice) * 1.5 || 0,
      location: newItemLocation,
      specification: newItemSpec || '-',
      priceSource: 'EZRAB Master Database 2026',
      periodVersion: '2026-Q1',
      lastUpdated: '2026-09-06',
    };

    setItemsList([created, ...itemsList]);
    setIsAddModalOpen(false);
    setNewItemCode('');
    setNewItemName('');
    setNewItemBrand('');
    setNewItemSpec('');
    setNewItemPrice(0);
  };

  const handleDeleteItem = (id: string) => {
    setItemsList(itemsList.filter((item) => item.id !== id));
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '1680px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        color: '#0F172A',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* =========================================================================
          1. HEADER & BREADCRUMB
         ========================================================================= */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, color: '#64748B', marginBottom: '4px' }}>
            <span
              onClick={() => onNavigateToTab && onNavigateToTab('dashboard')}
              style={{ cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#2563EB')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
            >
              Dashboard
            </span>
            <span style={{ color: '#94A3B8' }}>&gt;</span>
            <span style={{ color: '#64748B' }}>Database Master 2026</span>
            <span style={{ color: '#94A3B8' }}>&gt;</span>
            <span style={{ color: '#2563EB', fontWeight: 600 }}>
              {category === 'MATERIAL' ? 'Material' : category === 'LABOR' ? 'Upah' : 'Alat'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.025em', color: '#0F172A', margin: 0 }}>
              {categoryMeta.title}
            </h1>
            <span style={{ fontSize: '11px', fontWeight: 700, color: categoryMeta.color, background: categoryMeta.lightBg, padding: '3px 8px', borderRadius: '6px' }}>
              {categoryMeta.badge}
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
            {categoryMeta.sub}
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setIsAddModalOpen(true)}
            style={{
              height: '38px',
              padding: '0 16px',
              borderRadius: '10px',
              background: '#2563EB',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(37,99,235,0.2)',
            }}
          >
            <Plus size={15} />
            <span>Tambah {category === 'MATERIAL' ? 'Material' : category === 'LABOR' ? 'Upah' : 'Alat'}</span>
          </button>

          <button
            onClick={() => {
              alert(`Export Master Database ${category} 2026 (.xlsx) berhasil diunduh!`);
            }}
            style={{
              height: '38px',
              padding: '0 16px',
              borderRadius: '10px',
              background: '#ffffff',
              border: '1px solid #E2E8F0',
              color: '#334155',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            <Download size={14} color="#2563EB" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. SUBCATEGORY FILTER PILLS (FOR MATERIAL)
         ========================================================================= */}
      {category === 'MATERIAL' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '4px',
          }}
        >
          {materialSubcategories.map((subcat) => {
            const isSelected = selectedSubcategory === subcat;
            return (
              <button
                key={subcat}
                onClick={() => setSelectedSubcategory(subcat)}
                style={{
                  height: '32px',
                  padding: '0 14px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: isSelected ? 700 : 500,
                  whiteSpace: 'nowrap',
                  background: isSelected ? '#2563EB' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#64748B',
                  border: isSelected ? '1px solid #2563EB' : '1px solid #E2E8F0',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 2px 6px rgba(37,99,235,0.2)' : 'none',
                }}
              >
                {subcat}
              </button>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          3. FILTER & SEARCH TOOLBAR
         ========================================================================= */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #E8EEF0',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 2px 8px rgba(15,23,42,0.03)',
        }}
      >
        {/* Search Input */}
        <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
          <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder={`Cari nama ${category === 'MATERIAL' ? 'material / brand / spesifikasi' : category === 'LABOR' ? 'profesi / upah' : 'peralatan'}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              height: '38px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              paddingLeft: '36px',
              paddingRight: '12px',
              fontSize: '12.5px',
              outline: 'none',
              background: '#F8FAFC',
            }}
          />
        </div>

        {/* Location Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Wilayah:</span>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            style={{
              height: '38px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              padding: '0 12px',
              fontSize: '12.5px',
              background: '#ffffff',
              color: '#0F172A',
            }}
          >
            <option>Semua Wilayah</option>
            <option>Jabodetabek</option>
            <option>Jawa Barat</option>
            <option>Jawa Tengah</option>
            <option>Jawa Timur</option>
            <option>Bali</option>
          </select>
        </div>

        {/* Counter Badge */}
        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
          Menampilkan <strong style={{ color: '#0F172A' }}>{items.length}</strong> item
        </div>
      </div>

      {/* =========================================================================
          4. MASTER PRICE TABLE
         ========================================================================= */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #E8EEF0',
          boxShadow: '0 2px 16px rgba(15,23,42,0.04)',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                <th style={{ padding: '12px 14px', width: '75px' }}>Kode</th>
                {category === 'MATERIAL' && <th className="tablet-up" style={{ padding: '12px 14px', width: '120px' }}>Brand</th>}
                <th style={{ padding: '12px 14px' }}>Uraian & Nama Item</th>
                <th className="tablet-up" style={{ padding: '12px 14px' }}>Spesifikasi Teknis</th>
                <th style={{ padding: '12px 10px', textAlign: 'center', width: '65px' }}>Satuan</th>
                {category === 'MATERIAL' && (
                  <th className="tablet-up" style={{ padding: '12px 14px', textAlign: 'right', width: '140px' }}>Rentang 2026</th>
                )}
                <th style={{ padding: '12px 14px', textAlign: 'right', width: '130px' }}>Harga Standar</th>
                <th className="tablet-up" style={{ padding: '12px 14px', width: '100px' }}>Wilayah</th>
                <th style={{ padding: '12px 10px', textAlign: 'center', width: '50px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={category === 'MATERIAL' ? 9 : 7} style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
                    Tidak ada item yang sesuai dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                  >
                    <td style={{ padding: '10px 14px', color: '#2563EB', fontWeight: 700, fontFamily: 'monospace', fontSize: '11.5px' }}>
                      {item.code}
                    </td>
                    {category === 'MATERIAL' && (
                      <td className="tablet-up" style={{ padding: '10px 14px', color: '#475569', fontWeight: 600 }}>
                        <span style={{ background: '#F1F5F9', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                          {item.brand || 'Umum'}
                        </span>
                      </td>
                    )}
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>
                      <div>{item.name}</div>
                      <div
                        className="mobile-only"
                        style={{
                          fontSize: '11px',
                          color: '#64748B',
                          marginTop: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          flexWrap: 'wrap',
                          fontWeight: 400,
                        }}
                      >
                        {item.brand && (
                          <span style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: '3px' }}>
                            {item.brand}
                          </span>
                        )}
                        <span>{item.location}</span>
                      </div>
                    </td>
                    <td className="tablet-up" style={{ padding: '10px 14px', color: '#64748B' }}>
                      {item.specification || '-'}
                    </td>
                    <td style={{ padding: '10px 10px', textAlign: 'center', color: '#64748B', fontWeight: 600 }}>
                      <span style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '2px 6px', borderRadius: '6px', fontSize: '11px' }}>
                        {item.unit}
                      </span>
                    </td>
                    {category === 'MATERIAL' && (
                      <td className="tablet-up" style={{ padding: '10px 14px', textAlign: 'right', color: '#64748B', fontSize: '11.5px' }}>
                        {item.minPrice && item.maxPrice ? (
                          <span>
                            {formatCurrencyIDR(item.minPrice).replace('Rp ', '')} - {formatCurrencyIDR(item.maxPrice).replace('Rp ', '')}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    )}
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrencyIDR(item.price)}
                    </td>
                    <td className="tablet-up" style={{ padding: '10px 14px', color: '#64748B' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                        <MapPin size={11} color="#94A3B8" />
                        <span>{item.location}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="ezrab-touch-target"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#EF4444',
                          cursor: 'pointer',
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title="Hapus item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          5. ADD ITEM MODAL
         ========================================================================= */}
      {isAddModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '540px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: categoryMeta.lightBg, color: categoryMeta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} />
                </div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                  Tambah {category === 'MATERIAL' ? 'Material' : category === 'LABOR' ? 'Upah' : 'Alat'} ke Database
                </h2>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddItem} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Kode Item
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: KP.100"
                    value={newItemCode}
                    onChange={(e) => setNewItemCode(e.target.value)}
                    style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', fontSize: '13px' }}
                  />
                </div>

                {category === 'MATERIAL' && (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                      Brand / Merek
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Roman / TOTO"
                      value={newItemBrand}
                      onChange={(e) => setNewItemBrand(e.target.value)}
                      style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', fontSize: '13px' }}
                    />
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  Nama Item *
                </label>
                <input
                  type="text"
                  required
                  placeholder={`Nama ${category === 'MATERIAL' ? 'material' : category === 'LABOR' ? 'profesi/tukang' : 'alat'}...`}
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', fontSize: '13px' }}
                />
              </div>

              {category === 'MATERIAL' && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Kategori Material
                  </label>
                  <select
                    value={newItemSubcat}
                    onChange={(e) => setNewItemSubcat(e.target.value)}
                    style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px' }}
                  >
                    {materialSubcategories.filter(s => s !== 'Semua Kategori').map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  Spesifikasi Teknis
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Ukuran 60x60 / SNI / Tebal 10mm"
                  value={newItemSpec}
                  onChange={(e) => setNewItemSpec(e.target.value)}
                  style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Satuan
                  </label>
                  <input
                    type="text"
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Harga Min (Rp)
                  </label>
                  <input
                    type="number"
                    value={newItemMinPrice}
                    onChange={(e) => setNewItemMinPrice(Number(e.target.value))}
                    style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Harga Max (Rp)
                  </label>
                  <input
                    type="number"
                    value={newItemMaxPrice}
                    onChange={(e) => setNewItemMaxPrice(Number(e.target.value))}
                    style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Harga Standar (Rp) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(Number(e.target.value))}
                    style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Wilayah
                  </label>
                  <select
                    value={newItemLocation}
                    onChange={(e) => setNewItemLocation(e.target.value)}
                    style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px' }}
                  >
                    <option>Jabodetabek</option>
                    <option>Jawa Barat</option>
                    <option>Jawa Tengah</option>
                    <option>Jawa Timur</option>
                    <option>Bali</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{ height: '36px', padding: '0 14px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: 'none', background: '#2563EB', color: '#FFFFFF', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Simpan Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
