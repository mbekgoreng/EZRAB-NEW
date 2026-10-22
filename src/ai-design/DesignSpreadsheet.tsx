import React, { useState, useMemo } from 'react';
import type { HouseSpec, RoomSpec } from './specEngine';

export interface SpreadsheetRow {
  id: string;
  kategori: string;
  /** Kelompok WBS untuk baris PEKERJAAN (mis. '01 Persiapan'); kosong untuk PROYEK/RUANG. */
  kelompok?: string;
  kode: string;
  uraian: string;
  panjang: number;
  lebar: number;
  tinggi: number;
  jumlah: number;
  satuan: string;
  volume: number;
  sumber: string;
  status: 'TERHITUNG' | 'ASUMSI' | 'PERLU_REVIEW';
  catatan: string;
}

interface DesignSpreadsheetProps {
  spec: HouseSpec;
}

/**
 * Generate baris spreadsheet dari HouseSpec.
 * Kolom: Kategori | Kode | Uraian | Panjang | Lebar | Tinggi | Jumlah | Satuan | Volume/Luas | Sumber | Status | Catatan
 */
export function specToSpreadsheetRows(spec: HouseSpec): SpreadsheetRow[] {
  const rows: SpreadsheetRow[] = [];
  let idx = 0;
  const nextId = () => `row-${++idx}`;

  // 1. Ringkasan proyek (sebagai baris info)
  rows.push({
    id: nextId(), kategori: 'PROYEK', kode: 'PRJ-001',
    uraian: `${spec.buildingType} ${spec.floors} lantai`,
    panjang: spec.buildingLengthM, lebar: spec.buildingWidthM, tinggi: 0,
    jumlah: 1, satuan: 'unit',
    volume: spec.buildingAreaM2,
    sumber: 'Prompt pengguna', status: 'TERHITUNG',
    catatan: `Target: ${spec.targetAreaM2} m²`,
  });

  // 2. Daftar ruang
  for (const room of spec.rooms) {
    rows.push({
      id: nextId(), kategori: 'RUANG', kode: room.id.toUpperCase(),
      uraian: room.name,
      panjang: room.lengthM, lebar: room.widthM, tinggi: 3.2,
      jumlah: 1, satuan: 'm²',
      volume: room.areaM2,
      sumber: room.isAssumed ? 'Asumsi sistem' : 'Prompt pengguna',
      status: room.isAssumed ? 'ASUMSI' : 'TERHITUNG',
      catatan: `Posisi: (${room.x}, ${room.y})`,
    });
  }

  // 3. Volume pekerjaan LENGKAP — 12 kelompok, dari persiapan sampai finishing.
  //
  // Aturan kejujuran (sama seperti pola lama):
  // - Volume dari geometri desain → sumber 'Turunan geometri', status 'PERLU_REVIEW'.
  // - Volume dari asumsi wajar yang tertelusur ke data desain (jumlah ruang,
  //   tipe ruang, keliling, luas) → sumber 'Asumsi sistem', status 'ASUMSI',
  //   dan asumsinya ditulis eksplisit di `catatan`.
  // - Item yang tidak relevan dengan desain (mis. sanitair tanpa kamar mandi)
  //   tidak dihasilkan sama sekali.
  // - Tiga item lama (W-001, F-001, F-002) dipertahankan persis (kode, dimensi,
  //   volume) dan kini berada di kelompoknya masing-masing.
  // Volume selalu dihitung dengan rumus yang sama seperti hitung ulang sel di
  // spreadsheet (m²: p×l×j; selain m²: p×l×t×j) agar edit pengguna konsisten.
  const wallT = spec.wallThicknessM;
  const wallHeight = 3.2;
  const W = spec.buildingWidthM;
  const L = spec.buildingLengthM;
  const A = spec.buildingAreaM2;
  const F = spec.floors;
  const perimeter = 2 * (W + L);
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const GEO = { sumber: 'Turunan geometri', status: 'PERLU_REVIEW' as const };
  const ASM = { sumber: 'Asumsi sistem', status: 'ASUMSI' as const };

  interface WorkSeed {
    kelompok: string; kode: string; uraian: string;
    panjang: number; lebar: number; tinggi: number; jumlah: number; satuan: string;
    sumber: string; status: SpreadsheetRow['status']; catatan: string;
  }
  const work = (seed: WorkSeed) => {
    const volume = seed.satuan === 'm²'
      ? round2(seed.panjang * seed.lebar * seed.jumlah)
      : round2(seed.panjang * seed.lebar * seed.tinggi * seed.jumlah);
    if (!(volume > 0)) return; // item tak relevan / tak terhitung tidak dipaksakan
    rows.push({ id: nextId(), kategori: 'PEKERJAAN', volume, ...seed });
  };

  // Turunan bersama dari daftar ruang
  const rooms = spec.rooms;
  const byType = (t: RoomSpec['type']) => rooms.filter(r => r.type === t);
  const nBed = byType('bedroom').length;
  const nBath = byType('bathroom').length;
  const nKitchen = byType('kitchen').length;
  // Ruang berdinding (carport/teras terbuka tidak dihitung sebagai dinding)
  const wallRooms = rooms.filter(r => r.type !== 'carport' && r.type !== 'terrace');
  const roomPerimSum = wallRooms.reduce((s, r) => s + 2 * (r.widthM + r.lengthM), 0);
  // Dinding bersama dihitung sekali: (total keliling ruang − keliling luar) / 2
  const partitionLen = Math.max(0, round2((roomPerimSum - perimeter) / 2));
  const wallRunLen = round2(perimeter + partitionLen); // total panjang dinding
  const wallSideLen = round2(wallHeight * 2);          // dua sisi × tinggi dinding
  const columnCount = Math.max(4, Math.round(perimeter / 3));
  const roofSlopeLen = round2(L * 1.2);                // faktor miring + overstak (asumsi)

  /* ---- 01 Persiapan ---- */
  work({ kelompok: '01 Persiapan', kode: 'P-001', uraian: 'Pembersihan dan perataan lahan',
    panjang: L, lebar: W, tinggi: 0, jumlah: 1, satuan: 'm²', ...GEO,
    catatan: 'Asumsi luas lahan sama dengan luas tapak bangunan' });
  work({ kelompok: '01 Persiapan', kode: 'P-002', uraian: 'Pengukuran dan pemasangan bouwplank',
    panjang: perimeter, lebar: 1, tinggi: 1, jumlah: 1, satuan: "m'", ...GEO,
    catatan: 'Sepanjang keliling bangunan' });

  /* ---- 02 Tanah ---- */
  work({ kelompok: '02 Tanah', kode: 'T-001', uraian: 'Galian tanah pondasi',
    panjang: perimeter, lebar: 0.7, tinggi: 0.8, jumlah: 1, satuan: 'm³', ...GEO,
    catatan: 'Asumsi galian lebar 0,7 m, dalam 0,8 m, sepanjang pondasi menerus' });
  work({ kelompok: '02 Tanah', kode: 'T-002', uraian: 'Urugan pasir bawah lantai',
    panjang: L, lebar: W, tinggi: 0.05, jumlah: 1, satuan: 'm³', ...GEO,
    catatan: 'Asumsi tebal urugan pasir 5 cm' });
  work({ kelompok: '02 Tanah', kode: 'T-003', uraian: 'Urugan tanah kembali dan perataan',
    panjang: perimeter, lebar: 0.7, tinggi: 0.2, jumlah: 1, satuan: 'm³', ...ASM,
    catatan: 'Asumsi ±25% volume galian dikembalikan sebagai urugan' });

  /* ---- 03 Pondasi ---- */
  work({ kelompok: '03 Pondasi', kode: 'PD-001', uraian: 'Pondasi batu kali',
    panjang: perimeter, lebar: 0.6, tinggi: 0.7, jumlah: 1, satuan: 'm³', ...GEO,
    catatan: 'Asumsi penampang pondasi 0,6 × 0,7 m menerus sepanjang keliling' });
  work({ kelompok: '03 Pondasi', kode: 'PD-002', uraian: 'Aanstamping batu kosong',
    panjang: perimeter, lebar: 0.6, tinggi: 0.15, jumlah: 1, satuan: 'm³', ...GEO,
    catatan: 'Asumsi tebal aanstamping 15 cm di bawah pondasi' });
  work({ kelompok: '03 Pondasi', kode: 'PD-003', uraian: 'Sloof beton bertulang 15/20',
    panjang: perimeter, lebar: 0.15, tinggi: 0.2, jumlah: 1, satuan: 'm³', ...GEO,
    catatan: 'Penampang asumsi 15×20 cm; penulangan tercakup dalam item' });

  /* ---- 04 Struktur ---- */
  work({ kelompok: '04 Struktur', kode: 'S-001', uraian: 'Kolom beton bertulang 15/15',
    panjang: 0.15, lebar: 0.15, tinggi: wallHeight, jumlah: columnCount * F, satuan: 'm³', ...ASM,
    catatan: `Asumsi kolom 15×15 tiap ±3 m keliling (${columnCount} titik/lantai × ${F} lantai)` });
  work({ kelompok: '04 Struktur', kode: 'F-001', uraian: 'Pelat lantai dasar',
    panjang: L, lebar: W, tinggi: 0.12, jumlah: 1, satuan: 'm³', ...GEO,
    catatan: 'Tebal asumsi 12 cm' });
  work({ kelompok: '04 Struktur', kode: 'S-002', uraian: 'Ringbalk beton bertulang 15/20',
    panjang: perimeter, lebar: 0.15, tinggi: 0.2, jumlah: F, satuan: 'm³', ...GEO,
    catatan: 'Penampang asumsi 15×20 cm; terpasang di tiap lantai' });
  if (F > 1) {
    work({ kelompok: '04 Struktur', kode: 'S-003', uraian: 'Pelat lantai tingkat',
      panjang: L, lebar: W, tinggi: 0.12, jumlah: F - 1, satuan: 'm³', ...GEO,
      catatan: 'Tebal asumsi 12 cm, untuk lantai di atas lantai dasar' });
    work({ kelompok: '04 Struktur', kode: 'S-004', uraian: 'Tangga beton bertulang',
      panjang: 1, lebar: 1, tinggi: 1, jumlah: 1, satuan: 'unit', ...ASM,
      catatan: 'Asumsi 1 unit tangga antar-lantai; volume beton detail perlu review' });
  }

  /* ---- 05 Dinding ---- */
  work({ kelompok: '05 Dinding', kode: 'W-001', uraian: 'Dinding bata perimeter',
    panjang: perimeter, lebar: wallT, tinggi: wallHeight, jumlah: 1, satuan: 'm³', ...GEO,
    catatan: 'Belum dikurangi bukaan pintu/jendela' });
  if (partitionLen > 0) {
    work({ kelompok: '05 Dinding', kode: 'W-002', uraian: 'Dinding bata partisi (dinding dalam)',
      panjang: partitionLen, lebar: wallT, tinggi: wallHeight, jumlah: 1, satuan: 'm³', ...ASM,
      catatan: 'Asumsi panjang partisi = (total keliling ruang berdinding − keliling luar) / 2' });
  }
  work({ kelompok: '05 Dinding', kode: 'W-003', uraian: 'Plesteran dinding',
    panjang: wallRunLen, lebar: wallSideLen, tinggi: 0, jumlah: 1, satuan: 'm²', ...GEO,
    catatan: 'Dua sisi dinding luar + partisi; belum dikurangi bukaan' });
  work({ kelompok: '05 Dinding', kode: 'W-004', uraian: 'Acian dinding',
    panjang: wallRunLen, lebar: wallSideLen, tinggi: 0, jumlah: 1, satuan: 'm²', ...GEO,
    catatan: 'Mengikuti luas plesteran' });

  /* ---- 06 Atap (tidak ada data atap di spec → seluruhnya asumsi eksplisit) ---- */
  work({ kelompok: '06 Atap', kode: 'A-001', uraian: 'Rangka atap baja ringan',
    panjang: roofSlopeLen, lebar: W, tinggi: 0, jumlah: 1, satuan: 'm²', ...ASM,
    catatan: 'Asumsi luas atap = luas tapak × 1,2 (kemiringan ±30° + overstak); material baja ringan — sesuaikan bila spek berbeda' });
  work({ kelompok: '06 Atap', kode: 'A-002', uraian: 'Penutup atap genteng metal',
    panjang: roofSlopeLen, lebar: W, tinggi: 0, jumlah: 1, satuan: 'm²', ...ASM,
    catatan: 'Mengikuti luas rangka atap (asumsi)' });
  work({ kelompok: '06 Atap', kode: 'A-003', uraian: 'Lisplank',
    panjang: perimeter, lebar: 1, tinggi: 1, jumlah: 1, satuan: "m'", ...ASM,
    catatan: 'Asumsi lisplank sepanjang keliling atap' });
  work({ kelompok: '06 Atap', kode: 'A-004', uraian: 'Talang air',
    panjang: round2(2 * L), lebar: 1, tinggi: 1, jumlah: 1, satuan: "m'", ...ASM,
    catatan: 'Asumsi talang sepanjang dua sisi panjang atap' });

  /* ---- 07 Plafond ---- */
  work({ kelompok: '07 Plafond', kode: 'PL-001', uraian: 'Plafond gypsum termasuk rangka',
    panjang: L, lebar: W, tinggi: 0, jumlah: 1, satuan: 'm²', ...GEO,
    catatan: 'Luas tapak; area carport/teras terbuka belum dikurangi' });
  work({ kelompok: '07 Plafond', kode: 'PL-002', uraian: 'List plafond (profil)',
    panjang: perimeter, lebar: 1, tinggi: 1, jumlah: 1, satuan: "m'", ...ASM,
    catatan: 'Asumsi sepanjang keliling bangunan' });

  /* ---- 08 Lantai ---- */
  work({ kelompok: '08 Lantai', kode: 'F-002', uraian: 'Lantai keramik',
    panjang: L, lebar: W, tinggi: 0, jumlah: 1, satuan: 'm²', ...GEO,
    catatan: '' });
  work({ kelompok: '08 Lantai', kode: 'F-003', uraian: 'Plint keramik',
    panjang: wallRunLen, lebar: 1, tinggi: 1, jumlah: 1, satuan: "m'", ...ASM,
    catatan: 'Asumsi sepanjang kaki dinding luar + partisi' });

  /* ---- 09 Kusen, Pintu & Jendela (dari jumlah ruang — asumsi eksplisit) ---- */
  if (rooms.length > 0) {
    work({ kelompok: '09 Kusen, Pintu & Jendela', kode: 'K-001', uraian: 'Pintu utama lengkap (kusen + daun)',
      panjang: 1, lebar: 1, tinggi: 1, jumlah: 1, satuan: 'buah', ...ASM,
      catatan: 'Asumsi 1 pintu utama per rumah' });
    if (nBed + nBath > 0) {
      work({ kelompok: '09 Kusen, Pintu & Jendela', kode: 'K-002', uraian: 'Pintu kamar lengkap (kusen + daun)',
        panjang: 1, lebar: 1, tinggi: 1, jumlah: nBed + nBath, satuan: 'buah', ...ASM,
        catatan: 'Asumsi 1 pintu per kamar tidur dan kamar mandi' });
    }
    const windowCount = nBed + (byType('living').length > 0 ? 1 : 0) + (nKitchen > 0 ? 1 : 0);
    if (windowCount > 0) {
      work({ kelompok: '09 Kusen, Pintu & Jendela', kode: 'K-003', uraian: 'Jendela aluminium + kaca',
        panjang: 1, lebar: 1, tinggi: 1, jumlah: windowCount, satuan: 'buah', ...ASM,
        catatan: 'Asumsi 1 jendela per kamar tidur, ruang tamu, dan dapur' });
    }
  }

  /* ---- 10 Instalasi Listrik (per ruang — asumsi eksplisit) ---- */
  if (rooms.length > 0) {
    const SK_PER_ROOM: Record<RoomSpec['type'], number> = {
      bedroom: 2, bathroom: 1, living: 2, kitchen: 2, dining: 1,
      carport: 1, terrace: 1, storage: 1, other: 1,
    };
    const stopKontak = rooms.reduce((s, r) => s + (SK_PER_ROOM[r.type] ?? 1), 0);
    work({ kelompok: '10 Instalasi Listrik', kode: 'E-001', uraian: 'Titik lampu',
      panjang: 1, lebar: 1, tinggi: 1, jumlah: rooms.length, satuan: 'titik', ...ASM,
      catatan: 'Asumsi 1 titik lampu per ruang' });
    work({ kelompok: '10 Instalasi Listrik', kode: 'E-002', uraian: 'Stop kontak',
      panjang: 1, lebar: 1, tinggi: 1, jumlah: stopKontak, satuan: 'unit', ...ASM,
      catatan: 'Asumsi per ruang: kamar tidur 2, ruang tamu 2, dapur 2, ruang lain 1' });
    work({ kelompok: '10 Instalasi Listrik', kode: 'E-003', uraian: 'Saklar',
      panjang: 1, lebar: 1, tinggi: 1, jumlah: rooms.length, satuan: 'unit', ...ASM,
      catatan: 'Asumsi 1 saklar per ruang (mengikuti titik lampu)' });
    work({ kelompok: '10 Instalasi Listrik', kode: 'E-004', uraian: 'Instalasi kabel dan panel MCB',
      panjang: 1, lebar: 1, tinggi: 1, jumlah: 1, satuan: 'unit', ...ASM,
      catatan: '1 paket instalasi kabel + box MCB (asumsi)' });
  }

  /* ---- 11 Instalasi Air & Sanitasi (hanya bila ada kamar mandi/dapur) ---- */
  if (nBath > 0) {
    work({ kelompok: '11 Instalasi Air & Sanitasi', kode: 'SN-001', uraian: 'Kloset duduk',
      panjang: 1, lebar: 1, tinggi: 1, jumlah: nBath, satuan: 'buah', ...ASM,
      catatan: 'Asumsi 1 kloset per kamar mandi' });
    work({ kelompok: '11 Instalasi Air & Sanitasi', kode: 'SN-002', uraian: 'Wastafel',
      panjang: 1, lebar: 1, tinggi: 1, jumlah: nBath, satuan: 'buah', ...ASM,
      catatan: 'Asumsi 1 wastafel per kamar mandi' });
    work({ kelompok: '11 Instalasi Air & Sanitasi', kode: 'SN-003', uraian: 'Floor drain',
      panjang: 1, lebar: 1, tinggi: 1, jumlah: nBath, satuan: 'buah', ...ASM,
      catatan: 'Asumsi 1 floor drain per kamar mandi' });
    work({ kelompok: '11 Instalasi Air & Sanitasi', kode: 'SN-004', uraian: 'Kran dan shower set',
      panjang: 1, lebar: 1, tinggi: 1, jumlah: nBath, satuan: 'buah', ...ASM,
      catatan: 'Asumsi 1 set kran + shower per kamar mandi' });
  }
  if (nKitchen > 0) {
    work({ kelompok: '11 Instalasi Air & Sanitasi', kode: 'SN-005', uraian: 'Bak cuci piring (kitchen sink)',
      panjang: 1, lebar: 1, tinggi: 1, jumlah: nKitchen, satuan: 'buah', ...ASM,
      catatan: 'Asumsi 1 bak cuci per dapur' });
  }
  const pipeLen = nBath * 8 + nKitchen * 4;
  if (pipeLen > 0) {
    work({ kelompok: '11 Instalasi Air & Sanitasi', kode: 'SN-006', uraian: 'Pipa air bersih dan air kotor',
      panjang: pipeLen, lebar: 1, tinggi: 1, jumlah: 1, satuan: "m'", ...ASM,
      catatan: 'Asumsi 8 m per kamar mandi dan 4 m per dapur' });
  }

  /* ---- 12 Pengecatan & Finishing ---- */
  work({ kelompok: '12 Pengecatan & Finishing', kode: 'C-001', uraian: 'Pengecatan dinding',
    panjang: wallRunLen, lebar: wallSideLen, tinggi: 0, jumlah: 1, satuan: 'm²', ...GEO,
    catatan: 'Mengikuti luas plesteran (dua sisi dinding)' });
  work({ kelompok: '12 Pengecatan & Finishing', kode: 'C-002', uraian: 'Pengecatan plafond',
    panjang: L, lebar: W, tinggi: 0, jumlah: 1, satuan: 'm²', ...GEO,
    catatan: 'Mengikuti luas plafond' });
  work({ kelompok: '12 Pengecatan & Finishing', kode: 'C-003', uraian: 'Pembersihan akhir',
    panjang: L, lebar: W, tinggi: 0, jumlah: 1, satuan: 'm²', ...GEO,
    catatan: 'Pembersihan akhir seluruh area bangunan sebelum serah terima' });

  return rows;
}

/**
 * Export ke CSV (valid, dengan escaping).
 */
export function rowsToCSV(rows: SpreadsheetRow[]): string {
  const headers = ['Kategori', 'Kode', 'Uraian', 'Panjang', 'Lebar', 'Tinggi', 'Jumlah', 'Satuan', 'Volume/Luas', 'Sumber', 'Status', 'Catatan'];
  const esc = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) {
    lines.push([r.kategori, r.kode, r.uraian, r.panjang, r.lebar, r.tinggi, r.jumlah, r.satuan, r.volume, r.sumber, r.status, r.catatan].map(esc).join(','));
  }
  return lines.join('\n');
}

/**
 * Download file (browser).
 */
export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Spreadsheet editable untuk desain rumah AI.
 * Bahasa desain dashboard EZRAB (token --ez-*): header terang, status pill,
 * tanpa tombol ekspor (keputusan owner 2026-10-21 — buat simple).
 * Helper rowsToCSV/downloadFile tetap diekspor untuk test & pemakaian lain.
 */
export const DesignSpreadsheet: React.FC<DesignSpreadsheetProps> = ({ spec }) => {
  const initialRows = useMemo(() => specToSpreadsheetRows(spec), [spec]);
  const [rows, setRows] = useState<SpreadsheetRow[]>(initialRows);
  const [activeTab, setActiveTab] = useState<'ruang' | 'pekerjaan' | 'semua'>('semua');

  // Sync ketika spec berubah (tanpa duplikasi: regenerate dari spec)
  React.useEffect(() => {
    setRows(specToSpreadsheetRows(spec));
  }, [spec]);

  const updateCell = (id: string, field: keyof SpreadsheetRow, value: string | number) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      // Hitung ulang volume jika dimensi berubah
      if (['panjang', 'lebar', 'tinggi', 'jumlah'].includes(field as string)) {
        const p = Number(updated.panjang) || 0;
        const l = Number(updated.lebar) || 0;
        const t = Number(updated.tinggi) || 0;
        const j = Number(updated.jumlah) || 0;
        updated.volume = updated.satuan === 'm²'
          ? Math.round(p * l * j * 100) / 100
          : Math.round(p * l * t * j * 100) / 100;
        updated.status = 'TERHITUNG';
      }
      return updated;
    }));
  };

  const filtered = activeTab === 'semua' ? rows : rows.filter(r =>
    activeTab === 'ruang' ? r.kategori === 'RUANG' : r.kategori === 'PEKERJAAN'
  );

  const statusPill = (s: SpreadsheetRow['status']): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap',
    color: s === 'TERHITUNG' ? '#059669' : s === 'ASUMSI' ? '#D97706' : '#DC2626',
    background: s === 'TERHITUNG' ? 'rgba(16,185,129,0.12)' : s === 'ASUMSI' ? 'rgba(245,158,11,0.14)' : 'rgba(239,68,68,0.10)',
  });

  const cellInput: React.CSSProperties = {
    border: '1px solid transparent', borderRadius: 7, padding: '4px 6px', width: '100%',
    fontSize: 12.5, background: 'transparent', color: 'var(--ez-color-text-primary)', outline: 'none',
  };
  const numInput: React.CSSProperties = { ...cellInput, width: 58, textAlign: 'right' };

  return (
    <div className="ai-design-spreadsheet">
      {/* Filter — segmented control (selaras tab studio) */}
      <div style={{
        display: 'inline-flex', gap: 4, marginBottom: 14, flexWrap: 'wrap',
        background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-soft)',
        borderRadius: 12, padding: 4,
      }}>
        {(['semua', 'ruang', 'pekerjaan'] as const).map(tab => (
          <button key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '6px 14px', borderRadius: 9, border: 'none',
              background: activeTab === tab ? 'var(--ez-color-surface)' : 'transparent',
              color: activeTab === tab ? 'var(--ez-color-text-primary)' : 'var(--ez-color-text-secondary)',
              fontWeight: activeTab === tab ? 700 : 550, fontSize: 12.5, cursor: 'pointer',
              boxShadow: activeTab === tab ? '0 1px 3px rgba(15, 23, 42, 0.10)' : 'none',
              transition: 'all 0.15s ease',
            }}>
            {tab === 'semua' ? 'Semua' : tab === 'ruang' ? 'Daftar Ruang' : 'Pekerjaan'}
          </button>
        ))}
      </div>
      <div style={{
        overflowX: 'auto', borderRadius: 16, border: '1px solid var(--ez-color-border)',
        background: 'var(--ez-color-surface)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
      }}>
        <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr style={{ background: 'var(--ez-color-surface-secondary)' }}>
              {['Kategori', 'Kode', 'Uraian', 'Pjg', 'Lbr', 'Tgi', 'Jml', 'Sat', 'Volume', 'Sumber', 'Status'].map(h => (
                <th key={h} style={{
                  padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap',
                  fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: 'var(--ez-color-text-muted)', borderBottom: '1px solid var(--ez-color-border-soft)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--ez-color-border-soft)' }}>
                <td style={{ padding: '5px 8px', color: 'var(--ez-color-text-secondary)', fontWeight: 600 }}>{r.kategori}</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 11.5, color: 'var(--ez-color-text-muted)' }}>{r.kode}</td>
                <td style={{ padding: '5px 4px', minWidth: 170 }}>
                  <input value={r.uraian} onChange={e => updateCell(r.id, 'uraian', e.target.value)} style={cellInput} />
                </td>
                {(['panjang', 'lebar', 'tinggi', 'jumlah'] as const).map(f => (
                  <td key={f} style={{ padding: '5px 4px' }}>
                    <input type="number" value={r[f]} onChange={e => updateCell(r.id, f, parseFloat(e.target.value) || 0)} style={numInput} />
                  </td>
                ))}
                <td style={{ padding: '5px 8px', color: 'var(--ez-color-text-secondary)' }}>{r.satuan}</td>
                <td style={{ padding: '5px 8px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{r.volume}</td>
                <td style={{ padding: '5px 8px', fontSize: 11.5, color: 'var(--ez-color-text-muted)' }}>{r.sumber}</td>
                <td style={{ padding: '5px 8px' }}>
                  <span style={statusPill(r.status)}>{r.status === 'PERLU_REVIEW' ? 'PERLU REVIEW' : r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ez-color-text-muted)' }}>
        {filtered.length} dari {rows.length} baris · Edit sel untuk mengubah · Volume dihitung otomatis dari dimensi
      </div>
    </div>
  );
};

export default DesignSpreadsheet;
