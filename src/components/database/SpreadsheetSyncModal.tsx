import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  Link2,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  RefreshCw,
  Copy,
  Check,
  Table,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { PriceRepository } from '../../engine/pricing/repository/priceRepository';
import { MaterialDatabaseService } from '../../domain/material/materialDatabaseService';
import { LaborDatabaseService } from '../../domain/labor/laborDatabaseService';
import { EquipmentDatabaseService } from '../../domain/equipment/equipmentDatabaseService';

interface SpreadsheetSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCategory?: 'MATERIALS' | 'LABOR' | 'EQUIPMENT' | 'PROJECT_PRICE';
  onDataImported?: () => void;
}

export const SpreadsheetSyncModal: React.FC<SpreadsheetSyncModalProps> = ({
  isOpen,
  onClose,
  activeCategory = 'MATERIALS',
  onDataImported,
}) => {
  const [activeTab, setActiveTab] = useState<'EXPORT' | 'IMPORT' | 'GOOGLE_SHEETS'>('EXPORT');

  // Export State
  const [exportScope, setExportScope] = useState<'CURRENT' | 'ALL'>('CURRENT');
  const [exportFormat, setExportFormat] = useState<'CSV' | 'XLSX'>('CSV');
  const [copiedClipboard, setCopiedClipboard] = useState(false);

  // Import State
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState<'IDLE' | 'PARSED' | 'SAVED' | 'ERROR'>('IDLE');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  // Google Sheets State — CATATAN KEJUJURAN: integrasi Google Sheets TIDAK
  // terhubung di aplikasi ini. URL hanya disimpan sebagai preferensi lokal;
  // tidak ada sinkronisasi yang dijalankan (dulu tombolnya berpura-pura
  // berhasil lewat setTimeout). Pindah data dilakukan via Ekspor/Impor CSV.
  const [sheetsUrl, setSheetsUrl] = useState(() => {
    try {
      return localStorage.getItem('ezrab_gsheets_db_url') || '';
    } catch {
      return '';
    }
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime] = useState<string>('Belum pernah disinkronisasi');
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  // ---------------------------------------------------------------------------
  // Ekspor dari dataset yang BENAR-BENAR ditampilkan pengguna (layanan
  // Material/Labor/Equipment), bukan dataset repository terpisah.
  // ---------------------------------------------------------------------------
  const csvCell = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const buildDisplayedDatasetCsv = (): string => {
    const header = 'Kode,Nama,Kategori,Subkategori,Spesifikasi,Brand,Unit,Harga Acuan,Wilayah,Sumber,Tanggal Update';
    const rows: string[] = [header];
    const push = (cols: unknown[]) => rows.push(cols.map(csvCell).join(','));

    const includeMaterials = exportScope === 'ALL' || activeCategory === 'MATERIALS';
    const includeLabor = exportScope === 'ALL' || activeCategory === 'LABOR';
    const includeEquipment = exportScope === 'ALL' || activeCategory === 'EQUIPMENT';

    if (includeMaterials) {
      const matDb = MaterialDatabaseService.getInstance();
      for (const m of matDb.getAllMaterials()) {
        const p = matDb.getPricesByMaterialId(m.id)[0];
        push([
          m.materialCode, m.name, 'MATERIAL', m.subcategory || '', m.specification || '',
          m.brand || '', m.unit, typeof p?.price === 'number' ? p.price : '',
          p?.region?.province || '', p?.sourceName || '', p?.priceDate || '',
        ]);
      }
    }
    if (includeLabor) {
      const laborDb = LaborDatabaseService.getInstance();
      for (const l of laborDb.getAllLabor()) {
        push([
          l.code, l.name, 'LABOR', l.subcategory || '', l.specialization || '',
          '', l.unit, l.basePriceOH, l.province || l.region || '',
          l.regulationSource || '', l.effectiveDate || '',
        ]);
      }
    }
    if (includeEquipment) {
      const equipDb = EquipmentDatabaseService.getInstance();
      for (const e of equipDb.getAllEquipment()) {
        push([
          e.code, e.name, 'EQUIPMENT', e.subcategory || '', e.specification || '',
          e.brand || '', e.unit, e.rentalPricePerDay, '',
          e.provenance?.sourceName || '', e.provenance?.effectiveDate || '',
        ]);
      }
    }
    return rows.join('\n');
  };

  // Handle Export CSV
  const handleDownloadExport = () => {
    let csvData: string;
    if (exportScope === 'CURRENT' && activeCategory === 'PROJECT_PRICE') {
      // Harga proyek hidup di PriceRepository — ekspor dari sana apa adanya.
      const repo = PriceRepository.getInstance();
      csvData = repo.exportToCsv(repo.getAll());
    } else {
      csvData = buildDisplayedDatasetCsv();
    }

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `EZRAB_${exportScope === 'ALL' ? 'MASTER_DATABASE' : activeCategory}_2026.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyClipboard = () => {
    const csvData =
      exportScope === 'CURRENT' && activeCategory === 'PROJECT_PRICE'
        ? PriceRepository.getInstance().exportToCsv(PriceRepository.getInstance().getAll().slice(0, 100))
        : buildDisplayedDatasetCsv()
            .split('\n')
            .slice(0, 101)
            .join('\n'); // 100 baris pertama + header untuk clipboard
    navigator.clipboard.writeText(csvData);
    setCopiedClipboard(true);
    setTimeout(() => setCopiedClipboard(false), 2500);
  };

  // Handle Parse CSV Text
  const handleParseImport = () => {
    try {
      setImportError(null);
      if (!importText.trim()) {
        setImportError('Silakan tempel data CSV atau isi teks spreadsheet.');
        return;
      }

      const lines = importText.trim().split('\n');
      if (lines.length < 2) {
        setImportError('Data harus memiliki minimal 1 baris header dan 1 baris data.');
        return;
      }

      const rows: any[] = [];
      const headerLine = lines[0];
      const headers = headerLine.split(',').map((h) => h.replace(/["\r]/g, '').trim().toLowerCase());

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(',').map((c) => c.replace(/["\r]/g, '').trim());
        const rowObj: any = {
          code: cols[0] || `IMPORT-${Date.now()}-${i}`,
          name: cols[1] || 'Item Tanpa Nama',
          category: (cols[2] || activeCategory).toUpperCase(),
          unit: cols[6] || cols[3] || 'unit',
          price: parseFloat(cols[7] || cols[4] || '0') || 0,
          location: cols[8] || 'Nasional',
          source: cols[9] || 'Import Spreadsheet',
        };
        rows.push(rowObj);
      }

      setParsedRows(rows);
      setImportStatus('PARSED');
    } catch (err: any) {
      setImportError(`Gagal membaca format CSV: ${err?.message || 'Format tidak valid'}`);
      setImportStatus('ERROR');
    }
  };

  // Handle Save Imported Items — impor masuk ke layanan dataset yang DITAMPILKAN
  // (Material/Labor/Equipment), sehingga tabel yang dilihat pengguna berubah.
  // Material tambahan pengguna juga dipersistenkan oleh materialDatabaseService.
  const handleExecuteImport = () => {
    const matDb = MaterialDatabaseService.getInstance();
    const laborDb = LaborDatabaseService.getInstance();
    const equipDb = EquipmentDatabaseService.getInstance();
    let importedCount = 0;

    for (const r of parsedRows) {
      if (!(r.price > 0) || !r.name) continue;
      const category = r.category === 'LABOR' ? 'LABOR' : r.category === 'EQUIPMENT' ? 'EQUIPMENT' : 'MATERIAL';

      if (category === 'MATERIAL') {
        const existing = matDb.getAllMaterials().find(
          (m) => m.materialCode.toUpperCase() === String(r.code).toUpperCase()
        );
        const priceRec = {
          id: `PRC-IMP-${Date.now()}-${importedCount}`,
          materialId: existing?.id || `MAT-IMP-${Date.now()}-${importedCount}`,
          materialCode: r.code,
          regionId: 'REG-NASIONAL',
          region: { country: 'Indonesia' as const, province: r.location || 'Nasional' },
          price: r.price,
          currency: 'IDR' as const,
          unit: r.unit,
          priceTier: 'STANDARD' as const,
          priceType: 'USER_DEFINED' as const,
          sourceType: 'USER_INPUT' as const,
          sourceName: 'Import Spreadsheet',
          taxIncluded: false,
          taxRate: 0.11,
          deliveryIncluded: false,
          confidence: 'LOW' as const,
          verificationStatus: 'UNVERIFIED' as const,
          freshness: 'CURRENT' as const,
          priceDate: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (existing) {
          matDb.addPriceRecord(priceRec);
        } else {
          matDb.addMaterial(
            {
              id: priceRec.materialId,
              materialCode: r.code,
              name: r.name,
              category: 'Konstruksi Umum',
              unit: r.unit,
              specification: '',
              active: true,
              aliases: [],
            } as any,
            priceRec as any
          );
        }
        importedCount++;
      } else if (category === 'LABOR') {
        // Konvensi domain terdokumentasi: 1 OH = 7 jam kerja; tarif lembur 1,5× tarif jam.
        const perHour = Math.round(r.price / 7);
        const res = laborDb.addLabor({
          code: r.code,
          name: r.name,
          aliases: [],
          category: 'Tenaga Umum Konstruksi',
          subcategory: 'Umum',
          roleCategory: 'Tenaga Umum Konstruksi',
          skillLevel: 'NON_SKILLED',
          unit: 'OH',
          basePriceOH: r.price,
          basePriceOJ: perHour,
          workHoursPerDay: 7,
          overtimeHourlyRate: Math.round(perHour * 1.5),
          regionalFactor: 1.0,
          province: r.location || undefined,
          effectiveDate: new Date().toISOString().split('T')[0],
          regulationSource: 'Import Spreadsheet (input pengguna)',
          sourceStatus: 'USER_INPUT',
          status: 'UNVERIFIED',
          duties: [],
          safetyRequirements: [],
        } as any);
        if (res.success) importedCount++;
      } else {
        const res = equipDb.addEquipment({
          code: r.code,
          name: r.name,
          aliases: [],
          category: 'GENERAL_TOOLS',
          subcategory: 'Umum',
          capacity: '',
          enginePowerHP: 0,
          unit: 'hari',
          ownershipMode: 'RENTED',
          rentalPricePerHour: 0,
          rentalPricePerDay: r.price,
          fuelType: 'MANUAL',
          fuelConsumptionLiterPerHour: 0,
          operatorIncluded: false,
          maintenanceFactor: 0.1,
          mobDemobEstimate: 0,
          specification: '',
          recommendedBrands: [],
          provenance: {
            sourceName: 'Import Spreadsheet (input pengguna)',
            effectiveDate: new Date().toISOString().split('T')[0],
            confidenceScore: 0,
          },
          status: 'UNVERIFIED',
        } as any);
        if (res.success) importedCount++;
      }
    }

    setImportStatus('SAVED');
    if (onDataImported) onDataImported();
    return importedCount;
  };

  // Google Sheets: TIDAK ADA sinkronisasi — integrasi belum terhubung.
  // Tombol hanya menyimpan URL sebagai preferensi dan menjelaskan statusnya.
  const handleSyncGoogleSheets = () => {
    setIsSyncing(false);
    try {
      localStorage.setItem('ezrab_gsheets_db_url', sheetsUrl);
    } catch {}
    setSyncFeedback(
      'Belum terhubung: integrasi Google Sheets belum tersedia di aplikasi ini, jadi tidak ada sinkronisasi yang dijalankan. URL di atas hanya disimpan sebagai preferensi. Untuk memindahkan data, gunakan tab Ekspor/Impor CSV.'
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--ez-color-surface)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid var(--ez-color-border-line)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--ez-color-border-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, var(--ez-hue-slate-bg), #FFFFFF)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'var(--ez-hue-emerald-bg)',
                color: 'var(--ez-hue-green-text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--ez-hue-green-border-deep)',
              }}
            >
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                  Koneksi & Sinkronisasi Spreadsheet
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--ez-radius-pill)',
                    backgroundColor: '#D1FAE5',
                    color: 'var(--ez-hue-green-text-deep)',
                  }}
                >
                  Excel & Google Sheets
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--ez-color-text-muted)' }}>
                Ekspor katalog atau unggah berkas CSV dari dataset yang ditampilkan. Integrasi Google Sheets belum terhubung.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--ez-color-border-line)',
            backgroundColor: 'var(--ez-color-surface-secondary)',
            padding: '0 24px',
          }}
        >
          <button
            onClick={() => setActiveTab('EXPORT')}
            style={{
              padding: '12px 18px',
              fontSize: '13.5px',
              fontWeight: activeTab === 'EXPORT' ? 700 : 500,
              color: activeTab === 'EXPORT' ? 'var(--ez-hue-green-text)' : 'var(--ez-color-text-muted)',
              borderBottom: activeTab === 'EXPORT' ? '2px solid #059669' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Download size={15} />
            Ekspor Spreadsheet
          </button>
          <button
            onClick={() => setActiveTab('IMPORT')}
            style={{
              padding: '12px 18px',
              fontSize: '13.5px',
              fontWeight: activeTab === 'IMPORT' ? 700 : 500,
              color: activeTab === 'IMPORT' ? 'var(--ez-hue-green-text)' : 'var(--ez-color-text-muted)',
              borderBottom: activeTab === 'IMPORT' ? '2px solid #059669' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Upload size={15} />
            Impor CSV / Excel
          </button>
          <button
            onClick={() => setActiveTab('GOOGLE_SHEETS')}
            style={{
              padding: '12px 18px',
              fontSize: '13.5px',
              fontWeight: activeTab === 'GOOGLE_SHEETS' ? 700 : 500,
              color: activeTab === 'GOOGLE_SHEETS' ? 'var(--ez-hue-green-text)' : 'var(--ez-color-text-muted)',
              borderBottom: activeTab === 'GOOGLE_SHEETS' ? '2px solid #059669' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Link2 size={15} />
            Google Sheets (Belum Terhubung)
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {/* TAB 1: EXPORT */}
          {activeTab === 'EXPORT' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ez-color-text-body)', display: 'block', marginBottom: '8px' }}>
                  Pilih Cakupan Data yang Akan Diekspor:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div
                    onClick={() => setExportScope('CURRENT')}
                    style={{
                      border: exportScope === 'CURRENT' ? '2px solid #059669' : '1px solid var(--ez-hue-slate-border)',
                      backgroundColor: exportScope === 'CURRENT' ? 'var(--ez-hue-green-bg)' : 'var(--ez-color-surface)',
                      borderRadius: '10px',
                      padding: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)', marginBottom: '4px' }}>
                      Kategori Aktif ({activeCategory})
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>
                      Hanya mengekspor item dari tab yang sedang dibuka saat ini.
                    </div>
                  </div>
                  <div
                    onClick={() => setExportScope('ALL')}
                    style={{
                      border: exportScope === 'ALL' ? '2px solid #059669' : '1px solid var(--ez-hue-slate-border)',
                      backgroundColor: exportScope === 'ALL' ? 'var(--ez-hue-green-bg)' : 'var(--ez-color-surface)',
                      borderRadius: '10px',
                      padding: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)', marginBottom: '4px' }}>
                      Seluruh Database Master
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>
                      Gabungan Material, Upah Tenaga Kerja, dan Peralatan dari database yang ditampilkan.
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ez-color-text-body)', display: 'block', marginBottom: '8px' }}>
                  Format Berkas Ekspor:
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="fmt"
                      checked={exportFormat === 'CSV'}
                      onChange={() => setExportFormat('CSV')}
                    />
                    <span>Comma Separated Values (.CSV) — Kompatibel Excel, Google Sheets, LibreOffice</span>
                  </label>
                </div>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--ez-color-surface-secondary)',
                  borderRadius: '10px',
                  padding: '14px',
                  border: '1px solid var(--ez-color-border-line)',
                  fontSize: '12.5px',
                  color: 'var(--ez-color-text-slate)',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--ez-color-text-primary)', marginBottom: '4px' }}>Kolom Standar Output:</div>
                <code>Kode, Nama Material/Tenaga/Alat, Kategori, Subkategori, Spesifikasi, Brand, Unit, Harga Acuan, Wilayah, Sumber, Tanggal Update</code>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button
                  onClick={handleDownloadExport}
                  style={{
                    flex: 1,
                    backgroundColor: '#059669',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '11px 16px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)',
                  }}
                >
                  <Download size={16} />
                  Unduh Berkas Spreadsheet (.CSV)
                </button>
                <button
                  onClick={handleCopyClipboard}
                  style={{
                    backgroundColor: 'var(--ez-color-surface-tertiary)',
                    color: 'var(--ez-color-text-body)',
                    border: '1px solid var(--ez-hue-slate-border)',
                    borderRadius: '8px',
                    padding: '11px 16px',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {copiedClipboard ? <Check size={16} color="var(--ez-hue-green-text)" /> : <Copy size={16} />}
                  {copiedClipboard ? 'Disalin ke Clipboard!' : 'Salin ke Clipboard'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: IMPORT */}
          {activeTab === 'IMPORT' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '13px', color: 'var(--ez-color-text-slate)' }}>
                Tempel teks CSV atau seret berkas spreadsheet Anda. Format: <code>Kode, Nama, Kategori, Satuan, Harga, Wilayah</code>
              </div>

              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`Kode,Nama Item,Kategori,Satuan,Harga,Wilayah\nMAT-CUS-01,Pasir Urug Halus,MATERIAL,m3,185000,Bandung\nLAB-CUS-01,Tukang Cor Ready Mix,LABOR,OH,175000,Jawa Barat\nEQP-CUS-01,Stamper Kuda 5HP,EQUIPMENT,hari,300000,DKI Jakarta`}
                rows={6}
                style={{
                  width: '100%',
                  borderRadius: '8px',
                  border: '1px solid var(--ez-hue-slate-border)',
                  padding: '12px',
                  fontFamily: 'monospace',
                  fontSize: '12.5px',
                  resize: 'vertical',
                }}
              />

              {importError && (
                <div style={{ backgroundColor: 'var(--ez-hue-rose-bg)', color: 'var(--ez-hue-rose-text)', padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={16} />
                  <span>{importError}</span>
                </div>
              )}

              {importStatus === 'PARSED' && (
                <div style={{ backgroundColor: 'var(--ez-hue-green-bg)', border: '1px solid #86EFAC', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ez-hue-green-text-deep)', fontWeight: 700, fontSize: '13.5px', marginBottom: '8px' }}>
                    <CheckCircle2 size={16} />
                    <span>{parsedRows.length} Baris Data Berhasil Divalidasi</span>
                  </div>
                  <div style={{ maxHeight: '140px', overflowY: 'auto', fontSize: '12px', color: 'var(--ez-color-text-body)' }}>
                    {parsedRows.slice(0, 5).map((r, idx) => (
                      <div key={idx} style={{ padding: '4px 0', borderBottom: '1px solid var(--ez-hue-green-bg-deep)', display: 'flex', justifyContent: 'space-between' }}>
                        <span><strong>{r.code}</strong> — {r.name} ({r.category})</span>
                        <span style={{ fontWeight: 700 }}>Rp {r.price.toLocaleString('id-ID')} / {r.unit}</span>
                      </div>
                    ))}
                    {parsedRows.length > 5 && (
                      <div style={{ padding: '4px 0', fontStyle: 'italic', color: 'var(--ez-color-text-muted)' }}>...dan {parsedRows.length - 5} baris lainnya.</div>
                    )}
                  </div>
                </div>
              )}

              {importStatus === 'SAVED' && (
                <div style={{ backgroundColor: 'var(--ez-hue-emerald-bg)', border: '1px solid #6EE7B7', color: 'var(--ez-hue-green-text-deep)', padding: '14px', borderRadius: '8px', fontSize: '13.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={18} />
                  <span>Impor selesai: baris yang valid tersimpan ke database yang ditampilkan (material tambahan pengguna tersimpan persisten). Baris tanpa harga/nama atau kode duplikat dilewati.</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px' }}>
                {importStatus !== 'PARSED' ? (
                  <button
                    onClick={handleParseImport}
                    style={{
                      flex: 1,
                      backgroundColor: 'var(--ez-color-primary)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Validasi Data Spreadsheet
                  </button>
                ) : (
                  <button
                    onClick={handleExecuteImport}
                    style={{
                      flex: 1,
                      backgroundColor: '#059669',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <CheckCircle2 size={16} />
                    Simpan {parsedRows.length} Item ke Database
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: GOOGLE SHEETS LIVE */}
          {activeTab === 'GOOGLE_SHEETS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ez-color-text-body)', display: 'block', marginBottom: '8px' }}>
                  URL Google Spreadsheet Dokumen Master:
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="url"
                    value={sheetsUrl}
                    onChange={(e) => setSheetsUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    style={{
                      flex: 1,
                      borderRadius: '8px',
                      border: '1px solid var(--ez-hue-slate-border)',
                      padding: '9px 12px',
                      fontSize: '13px',
                    }}
                  />
                  <button
                    onClick={handleSyncGoogleSheets}
                    disabled={isSyncing}
                    style={{
                      backgroundColor: '#059669',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '9px 16px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: isSyncing ? 0.7 : 1,
                    }}
                  >
                    <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
                    Simpan URL
                  </button>
                </div>
              </div>

              {syncFeedback && (
                <div style={{ backgroundColor: 'var(--ez-pastel-cream)', border: '1px solid var(--ez-hue-amber-border)', color: 'var(--ez-hue-amber-text)', padding: '12px 14px', borderRadius: '8px', fontSize: '12.5px' }}>
                  {syncFeedback}
                </div>
              )}

              {/* Status Koneksi — JUJUR: belum terhubung, tidak ada sinkronisasi */}
              <div style={{ border: '1px solid var(--ez-color-border-line)', borderRadius: 'var(--ez-radius-control)', overflow: 'hidden' }}>
                <div style={{ backgroundColor: 'var(--ez-color-surface-secondary)', padding: '12px 16px', borderBottom: '1px solid var(--ez-color-border-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>Status Koneksi:</span>
                  <span style={{ fontSize: '12px', color: 'var(--ez-hue-amber-text)', fontWeight: 600 }}>Belum terhubung — {lastSyncTime}</span>
                </div>
                <div style={{ padding: '12px 16px', fontSize: '12.5px', color: 'var(--ez-color-text-body)', lineHeight: 1.6 }}>
                  Aplikasi ini belum memiliki integrasi Google Sheets (tidak ada kredensial/OAuth yang dikonfigurasi), sehingga
                  sheet <strong>01_MATERIAL</strong>, <strong>02_UPAH</strong>, <strong>03_ALAT</strong>, dan <strong>04_HARGA_PROYEK</strong> tidak
                  tersinkron dengan database lokal. Gunakan tab <strong>Ekspor</strong> dan <strong>Impor CSV</strong> untuk memindahkan data secara manual.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--ez-color-text-muted)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'not-allowed', opacity: 0.6 }}>
                  <input
                    type="checkbox"
                    checked={autoSyncEnabled}
                    onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                    disabled
                  />
                  <span>Sinkronisasi otomatis (tidak tersedia — integrasi belum terhubung)</span>
                </label>
                {sheetsUrl && (
                  <a
                    href={sheetsUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--ez-color-primary)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    Buka URL Tersimpan <ArrowRight size={13} />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            backgroundColor: 'var(--ez-color-surface-secondary)',
            borderTop: '1px solid var(--ez-color-border-line)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: '1px solid var(--ez-hue-slate-border)',
              backgroundColor: 'var(--ez-color-surface)',
              color: 'var(--ez-color-text-body)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
