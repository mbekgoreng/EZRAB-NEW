import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Ruler,
  Calculator,
  Plus,
  Layers,
  Check,
  ChevronRight,
  RefreshCw,
  Box,
  Compass,
  FileSpreadsheet,
  ArrowRight,
  History,
  Info,
  ShieldCheck,
  HardHat,
  Package,
  Wrench,
  AlertCircle,
  ExternalLink,
  Edit3,
  Trash2,
  FolderPlus,
  Copy,
  Search,
  Download,
  Code,
  FileText,
  Printer,
  Zap,
  Sliders,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  X,
  ArrowLeft,
  DollarSign,
  ClipboardCheck,
  Star,
  Filter,
  RotateCcw,
  LayoutGrid,
  List,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { CONSTRUCTION_CALCULATORS, getCalculatorById } from '../../engine/constructionCalculators/registry';
import {
  BowplankDiagram,
  PondasiDiagram,
  FootPlateDiagram,
  SloofDiagram,
  KolomDiagram,
  DindingDiagram,
  AtapBajaRinganDiagram,
  FinishingDiagram,
  GenericCalculatorDiagram,
  BajaWfDiagram,
} from '../../engine/constructionCalculators/diagrams';
import { MASTER_VOLUME_CALCULATOR_SPEC } from '../../engine/constructionCalculators/masterJsonSpec';
import { formatRupiah, formatNumberId } from '../../engine/formulaEngine';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';
import { TechnicalReferenceViewer } from './TechnicalReferenceViewer';
import { MASTER_PRICE_ITEMS } from '../../data/indonesianPrices';
import { useScopeBasedCost } from '../../hooks/useScopeBasedCost';
import { PriceContext } from '../../engine/pricing/contracts/types';
// PHASE 6A: Weir forensic cost pipeline
import { WeirCostService } from '../../engine/weir/weirCostService';
import { WeirCostInput } from '../../engine/weir/weirTypes';
import { WeirCostSummaryPanel } from '../weir/WeirCostSummaryPanel';
import { WeirAuditTrailPanel } from '../weir/WeirAuditTrailPanel';
// PHASE 1 (audit §16): record every fabricated price. Recording only — no value is changed.
import {
  recordFabricatedTotal,
  exposeFabricatedPriceTelemetry,
  type CostPriceSourceKind,
  type CostPriceStatus,
} from '../../engine/pricing/telemetry/fabricatedPriceTelemetry';

exposeFabricatedPriceTelemetry();

interface QtoCalculatorViewProps {
  initialCalcId?: string;
  initialQtoId?: string;
  onNavigateToTab?: (tab: string) => void;
}

/**
 * PHASE 1 step 1.1 — one row of the live price breakdown.
 * `priceSource` carries provenance metadata. The monetary fields are unchanged
 * from the pre-audit behaviour; only the label is new.
 */
interface QtoPriceRow {
  key: string;
  uraian: string;
  volume: number;
  satuan: string;
  hargaSatuan: number;
  jumlahHarga: number;
  isOverridden: boolean;
  priceSource: CostPriceSourceKind;
}

// 6 Structured Categories (24 Master SNI/Workbook + 30 Residential Pack)
export const CALCULATOR_CATEGORIES = [
  {
    id: 'LEGACY_WORKBOOK',
    name: 'A. MASTER STANDAR SNI & CAD (24)',
    icon: '📐',
    pack: 'LEGACY',
    items: [
      { id: 'BOWPLANK', name: 'Pengukuran & Pemasangan Bowplank', shortDesc: 'Penetapan as bangunan, kayu patok 5/7, papan 3/20, paku', inputPreview: 'P × L Lahan', outputPreview: 'Keliling (m\')' },
      { id: 'PONDASI', name: 'Pondasi Batu Kali & Aanstamping', shortDesc: 'Pondasi batu belah trapesium, batu kosong & urugan pasir', inputPreview: 'P × Penampang', outputPreview: 'Batu Belah (m³)' },
      { id: 'FOOT_PLATE', name: 'Foot Plate (Pondasi Tapak Beton)', shortDesc: 'Pondasi telapak setempat beton bertulang & penulangan', inputPreview: 'P × L × T × Qty', outputPreview: 'Beton (m³), Besi (kg)' },
      { id: 'SLOOF', name: 'Sloof Beton Bertulang', shortDesc: 'Balok sloof pengikat pondasi, beton cor & tulangan sengkang', inputPreview: 'P × b × h', outputPreview: 'Beton (m³), Besi (kg)' },
      { id: 'KOLOM', name: 'Kolom Beton Bertulang', shortDesc: 'Kolom struktur utama & kolom praktis, beton & tulangan', inputPreview: 'b × h × T × Qty', outputPreview: 'Beton (m³), Besi (kg)' },
      { id: 'BALOK', name: 'Balok Beton Bertulang', shortDesc: 'Balok lantai & ring balk pengikat dinding, beton & besi', inputPreview: 'P × b × h', outputPreview: 'Beton (m³), Besi (kg)' },
      { id: 'BAJA_WF', name: 'Baja WF (Struktur Profil I/H)', shortDesc: 'Profil baja struktural Wide Flange canai panas (hot rolled)', inputPreview: 'Profil × Panjang', outputPreview: 'Berat Baja (kg)' },
      { id: 'BATA_RINGAN', name: 'Bata Ringan (Hebel)', shortDesc: 'Pasangan dinding bata ringan AAC tebal 7.5/10cm & mortar perekat', inputPreview: 'P × T - Bukaan', outputPreview: 'Luas Dinding (m²)' },
      { id: 'BATA_MERAH', name: 'Dinding Pasangan Bata Merah', shortDesc: 'Pasangan dinding bata merah 1/2 bata dengan spesi semen pasir', inputPreview: 'P × T - Bukaan', outputPreview: 'Luas Dinding (m²)' },
      { id: 'BATAKO', name: 'Dinding Pasangan Batako', shortDesc: 'Pasangan dinding batako cetak semen PC spesi 1:4', inputPreview: 'P × T - Bukaan', outputPreview: 'Luas Dinding (m²)' },
      { id: 'PINTU_JENDELA', name: 'Kusen Pintu & Jendela', shortDesc: 'Kusen kayu/aluminium, daun pintu solid/panil & jendela kaca', inputPreview: 'Kusen & Daun', outputPreview: 'Panjang Kusen (m\')' },
      { id: 'PLESTERAN_ACIAN', name: 'Plesteran & Acian Standar', shortDesc: 'Plesteran dinding 2 sisi tebal 15mm & acian semen halus', inputPreview: 'Luas Dinding × Sisi', outputPreview: 'Luas Plester/Aci (m²)' },
      { id: 'PENUTUP_LANTAI', name: 'Penutup Lantai Keramik / Granit', shortDesc: 'Pasangan lantai keramik, granit tile, plint & mortar perekat', inputPreview: 'Luas Ruangan', outputPreview: 'Luas Lantai (m²)' },
      { id: 'PENUTUP_DINDING', name: 'Penutup Dinding Keramik', shortDesc: 'Keramik dinding kamar mandi, dapur basah & ruang servis', inputPreview: 'Luas Pasang Dinding', outputPreview: 'Luas Dinding (m²)' },
      { id: 'PLAFON', name: 'Plafon Gypsum & Rangka Hollow', shortDesc: 'Plafon gypsum 9mm, rangka hollow galvanis & list gypsum profil', inputPreview: 'Luas Ruangan', outputPreview: 'Luas Plafon (m²)' },
      { id: 'PENGECATAN', name: 'Pengecatan Dinding & Plafon', shortDesc: 'Cat dasar alkali sealer & cat penutup interior/eksterior 2 lapis', inputPreview: 'Luas Cat', outputPreview: 'Luas Cat (m²)' },
      { id: 'ATAP_BAJA_RINGAN', name: 'Rangka & Penutup Atap Baja Ringan', shortDesc: 'Kuda-kuda truss C75, reng baja ringan, penutup atap genteng', inputPreview: 'Luas Bidang Atap', outputPreview: 'Luas Rangka & Atap (m²)' },
      { id: 'KELISTRIKAN', name: 'Instalasi Kelistrikan & Titik Lampu', shortDesc: 'Titik lampu, stop kontak, saklar & instalasi kabel NYM', inputPreview: 'Jumlah Titik Lampu', outputPreview: 'Titik Kelistrikan' },
      { id: 'AIR_BERSIH', name: 'Instalasi Air Bersih (Plumbing)', shortDesc: 'Pipa distribusi air bersih PVC/PPR, kran & sambungan pipa', inputPreview: 'Panjang Pipa Air', outputPreview: 'Panjang Pipa (m\')' },
      { id: 'SANITAIR', name: 'Peralatan Sanitair Standar', shortDesc: 'Kloset duduk/jongkok, wastafel cuci tangan & floor drain', inputPreview: 'Unit Sanitair', outputPreview: 'Unit Alat Sanitair' },
      { id: 'PAVING_BLOCK', name: 'Perkerasan Paving Block (Conblock)', shortDesc: 'Paving block tebal 6/8cm K-300, pasir alas & kanstin beton', inputPreview: 'P × L Jalan/Halaman', outputPreview: 'Luas (m²), Pcs Paving' },
      { id: 'JALAN_ASPAL', name: 'Perkerasan Jalan Aspal Hotmix', shortDesc: 'Lapis agregat pondasi A & B, prime coat & laston AC-WC', inputPreview: 'P × L Jalan × Tebal', outputPreview: 'Luas (m²), Ton Aspal' },
      { id: 'JALAN_RIGID', name: 'Perkerasan Jalan Beton Semen (Rigid)', shortDesc: 'Beton FS-45 / K-300, lean concrete LC, wiremesh M8 & dowel', inputPreview: 'P × L × Tebal Pelat', outputPreview: 'Volume Beton (m³)' },
      { id: 'SALURAN_UDITCH', name: 'Saluran U-Ditch Precast & Cover', shortDesc: 'Saluran drainase U-Ditch beton pracetak & tutup cover slab', inputPreview: 'Panjang Saluran', outputPreview: 'Panjang Saluran (m\')' },
    ],
  },
  {
    id: 'PEKERJAAN_TANAH',
    name: 'B. PEKERJAAN TANAH',
    icon: '🚜',
    pack: 'RESIDENTIAL',
    items: [
      { id: 'residential.cut_and_fill', name: 'Cut & Fill', shortDesc: 'Hitung volume cut, fill, dan balance tanah', inputPreview: 'L × W × Elevasi', outputPreview: 'Cut / Fill / Net (m³)' },
      { id: 'residential.galian_tanah', name: 'Galian Tanah', shortDesc: 'Galian tanah pondasi, sloof, dan saluran', inputPreview: 'P × L × T galian', outputPreview: 'Volume Galian (m³)' },
      { id: 'residential.urugan_tanah', name: 'Urugan Tanah', shortDesc: 'Urugan tanah kembali & peninggian peil lantai', inputPreview: 'Luas × Tebal urug', outputPreview: 'Volume Urugan (m³)' },
      { id: 'residential.pasir_batu_urug', name: 'Pasir / Batu Urug', shortDesc: 'Lapisan pasir alas & batu urug bawah lantai', inputPreview: 'P × L × Tebal', outputPreview: 'Volume Pasir/Batu (m³)' },
      { id: 'residential.drainase', name: 'Drainase', shortDesc: 'Saluran keliling tapak & pembuangan air hujan', inputPreview: 'Panjang × Dimensi', outputPreview: 'Volume Saluran (m\')' },
    ],
  },
  {
    id: 'PONDASI_DAN_BETON',
    name: 'C. PONDASI & BETON',
    icon: '🏗️',
    pack: 'RESIDENTIAL',
    items: [
      { id: 'residential.pondasi_batu_kali', name: 'Pondasi Batu Kali', shortDesc: 'Pasangan pondasi batu belah & aanstamping', inputPreview: 'P × Lebar atas/bawah × T', outputPreview: 'Pas. Batu & Uruk (m³)' },
      { id: 'residential.lantai_kerja', name: 'Lantai Kerja', shortDesc: 'Beton rabat B0 / lean concrete lantai kerja', inputPreview: 'Luas Area × Tebal', outputPreview: 'Volume Rabat (m³)' },
      { id: 'residential.beton', name: 'Beton', shortDesc: 'Kalkulator volume pembetonan struktur umum', inputPreview: 'Dimensi Geometri', outputPreview: 'Volume Cor Beton (m³)' },
      { id: 'residential.pembesian', name: 'Pembesian', shortDesc: 'Kebutuhan besi tulangan utama & sengkang begel', inputPreview: 'Panjang, Diameter, Spasi', outputPreview: 'Berat Besi (kg)' },
      { id: 'residential.bekisting', name: 'Bekisting', shortDesc: 'Kebutuhan luas acuan bekisting & perancah', inputPreview: 'Keliling Penampang × T', outputPreview: 'Luas Bekisting (m²)' },
      { id: 'residential.pondasi_beton_footing', name: 'Pondasi Beton / Footing', shortDesc: 'Pondasi telapak / footplate beton bertulang', inputPreview: 'P × L × T × Jumlah', outputPreview: 'Beton, Besi, Bekisting' },
      { id: 'residential.sloof', name: 'Sloof', shortDesc: 'Balok sloof beton bertulang pengikat pondasi', inputPreview: 'P × b × h × Tulangan', outputPreview: 'Beton (m³), Besi (kg)' },
      { id: 'residential.kolom', name: 'Kolom', shortDesc: 'Kolom struktur utama & kolom praktis', inputPreview: 'b × h × T × Jumlah', outputPreview: 'Beton (m³), Besi, Bekisting' },
      { id: 'residential.balok', name: 'Balok', shortDesc: 'Balok struktur lantai & ring balk atap', inputPreview: 'P × b × h × Tulangan', outputPreview: 'Beton (m³), Besi, Bekisting' },
      { id: 'residential.plat_lantai', name: 'Plat Lantai', shortDesc: 'Plat lantai tingkat, dak beton, dan mezzanine', inputPreview: 'P × L × Tebal plat', outputPreview: 'Beton (m³), Wiremesh/Besi' },
      { id: 'residential.tangga_beton', name: 'Tangga Beton', shortDesc: 'Struktur anak tangga, bordes, dan optrede', inputPreview: 'Lebar, Antrede, Optrede', outputPreview: 'Beton Tangga (m³)' },
    ],
  },
  {
    id: 'DINDING_DAN_FINISHING',
    name: 'D. DINDING & FINISHING',
    icon: '🧱',
    pack: 'RESIDENTIAL',
    items: [
      { id: 'residential.dinding', name: 'Dinding Bata Ringan / Merah', shortDesc: 'Pasangan bata merah, hebel, dan batako', inputPreview: 'P × T - Luas Bukaan', outputPreview: 'Luas Dinding Netto (m²)' },
      { id: 'residential.plester_acian', name: 'Plester & Acian', shortDesc: 'Plesteran 2 sisi dinding dan acian semen', inputPreview: 'Luas Dinding × Sisi', outputPreview: 'Luas Plester/Acian (m²)' },
      { id: 'residential.penutup_lantai', name: 'Penutup Lantai', shortDesc: 'Keramik, granit tile, marmer & plint', inputPreview: 'P × L Ruangan + Waste', outputPreview: 'Luas Lantai (m²)' },
      { id: 'residential.penutup_dinding', name: 'Penutup Dinding', shortDesc: 'Keramik & panel dinding kamar mandi/dapur', inputPreview: 'Keliling × T Keramik', outputPreview: 'Luas Pasang Dinding (m²)' },
      { id: 'residential.plafon', name: 'Plafon', shortDesc: 'Plafon gypsum, PVC, GRC & rangka hollow', inputPreview: 'Luas Ruangan + Drop ceiling', outputPreview: 'Luas Plafon & List (m²)' },
      { id: 'residential.pengecatan', name: 'Pengecatan', shortDesc: 'Cat interior, eksterior, dasar & plafon', inputPreview: 'Luas Dinding/Plafon × Lapis', outputPreview: 'Luas Pengecatan (m²)' },
    ],
  },
  {
    id: 'ATAP_DAN_BUKAAN',
    name: 'E. ATAP & BUKAAN',
    icon: '🏠',
    pack: 'RESIDENTIAL',
    items: [
      { id: 'residential.atap_baja_ringan', name: 'Atap Baja Ringan', shortDesc: 'Rangka kuda-kuda, reng, dan truss baja ringan', inputPreview: 'Luas Denah / cos(Sudut)', outputPreview: 'Luas Bidang Atap (m²)' },
      { id: 'residential.penutup_atap', name: 'Penutup Atap', shortDesc: 'Genteng beton/keramik, spandek & nok bubungan', inputPreview: 'Luas Atap + Nok/Jurai', outputPreview: 'Penutup (m²), Nok (m\')' },
      { id: 'residential.pintu_jendela', name: 'Pintu & Jendela', shortDesc: 'Kusen aluminium/kayu, daun pintu & jendela', inputPreview: 'Jumlah Unit × Dimensi', outputPreview: 'Kusen (m\'), Daun (unit)' },
      { id: 'residential.talang_lisplank', name: 'Talang & Lisplank', shortDesc: 'Talang jurai, talang datar & papan lisplank GRC', inputPreview: 'Panjang Tepi Atap', outputPreview: 'Panjang Pasang (m\')' },
    ],
  },
  {
    id: 'MEP_DAN_SANITAIR',
    name: 'F. MEP & SANITASI',
    icon: '⚡',
    pack: 'RESIDENTIAL',
    items: [
      { id: 'residential.instalasi_listrik_basic', name: 'Instalasi Listrik Basic', shortDesc: 'Titik lampu, stop kontak, saklar & panel MCB', inputPreview: 'Jumlah Titik & Stop Kontak', outputPreview: 'Total Titik Listrik' },
      { id: 'residential.instalasi_air_bersih', name: 'Instalasi Air Bersih', shortDesc: 'Pipa distribusi air dingin & kran air', inputPreview: 'Panjang Jalur Pipa PVC/PPR', outputPreview: 'Panjang Pipa (m\')' },
      { id: 'residential.air_kotor_bekas', name: 'Air Kotor & Air Bekas', shortDesc: 'Pipa air kotor WC, air bekas cuci & pipa vent', inputPreview: 'Panjang Pipa 3" / 4"', outputPreview: 'Panjang Pipa Saluran (m\')' },
      { id: 'residential.sanitair', name: 'Sanitair', shortDesc: 'Kloset duduk/jongkok, wastafel & floor drain', inputPreview: 'Jumlah Sanitair Unit', outputPreview: 'Total Unit Sanitair' },
    ],
  },
  {
    id: 'ROAD',
    name: 'G. ROAD & HIGHWAY (39)',
    icon: '🛣️',
    pack: 'ROAD',
    items: [
      // CORE ROAD (11)
      { id: 'road.alignment', name: 'Road Alignment (Trase)', shortDesc: 'Geometri trase, tikungan, station awal & akhir', inputPreview: 'Panjang Segmen & Lebar', outputPreview: 'Panjang & Luas Trase' },
      { id: 'road.stationing', name: 'Road Stationing (STA)', shortDesc: 'Interval patok stasioning & penomoran STA', inputPreview: 'STA Awal, STA Akhir, Spasi', outputPreview: 'Daftar & Jumlah STA' },
      { id: 'road.chainage', name: 'Road Chainage Segment', shortDesc: 'Segmentasi chainage per zona & cross section', inputPreview: 'STA 0+000 s/d 1+000', outputPreview: 'Segment Panjang & Lebar' },
      { id: 'road.cross_section', name: 'Road Cross Section', shortDesc: 'Geometri penampang melintang lajur & bahu', inputPreview: 'Lajur, Bahu, Median', outputPreview: 'Luas Penampang (m²)' },
      { id: 'road.earthwork', name: 'Road Earthwork (Average End Area)', shortDesc: 'Volume galian & timbunan tanah trase jalan', inputPreview: 'A1, A2, Panjang Segmen', outputPreview: 'Cut / Fill (m³)' },
      { id: 'road.cut', name: 'Road Cut (Galian Trase)', shortDesc: 'Volume galian tanah trase berdasar cross section', inputPreview: 'Luas Cut Cross Section', outputPreview: 'Volume Cut (m³)' },
      { id: 'road.fill', name: 'Road Fill (Timbunan Trase)', shortDesc: 'Volume timbunan badan jalan', inputPreview: 'Luas Fill Cross Section', outputPreview: 'Volume Fill (m³)' },
      { id: 'road.embankment', name: 'Road Embankment (Timbunan Badan Jalan)', shortDesc: 'Timbunan peninggian badan jalan (embankment)', inputPreview: 'P × Lebar Rata² × Tinggi', outputPreview: 'Volume Embankment (m³)' },
      { id: 'road.excavation', name: 'Road Excavation (Galian Badan Jalan)', shortDesc: 'Galian badan jalan dan saluran samping', inputPreview: 'P × Lebar × Kedalaman', outputPreview: 'Volume Galian (m³)' },
      { id: 'road.disposal', name: 'Road Disposal (Pembuangan Tanah Sisa)', shortDesc: 'Volume tanah sisa galian yang harus dibuang', inputPreview: 'Surplus Galian - Timbunan', outputPreview: 'Volume Buangan (m³)' },
      { id: 'road.borrow_material', name: 'Road Borrow Material (Tanah Datang)', shortDesc: 'Volume defisit timbunan tanah dari borrow pit', inputPreview: 'Defisit Timbunan', outputPreview: 'Volume Borrow (m³)' },

      // PAVEMENT (7)
      { id: 'road.subgrade', name: 'Road Subgrade (Penyiapan Badan Jalan)', shortDesc: 'Pemadatan & penyiapan tanah dasar subgrade', inputPreview: 'Panjang × Lebar Subgrade', outputPreview: 'Luas Subgrade (m²)' },
      { id: 'road.selected_material', name: 'Selected Material (Timbunan Pilihan)', shortDesc: 'Lapisan timbunan pilihan penopang perkerasan', inputPreview: 'P × L × Tebal', outputPreview: 'Volume Pilihan (m³)' },
      { id: 'road.granular_subbase', name: 'Granular Subbase (Lapis Pondasi Bawah)', shortDesc: 'Agregat Kelas B / Granular Subbase', inputPreview: 'P × L × Tebal', outputPreview: 'Volume Subbase (m³)' },
      { id: 'road.aggregate_base', name: 'Aggregate Base Class A (LPA)', shortDesc: 'Lapis pondasi agregat kelas A (LPA)', inputPreview: 'P × L × Tebal', outputPreview: 'Volume LPA (m³)' },
      { id: 'road.cement_treated_base', name: 'Cement Treated Base (CTB)', shortDesc: 'Pondasi semen / CTB perkerasan lentur/kaku', inputPreview: 'P × L × Tebal', outputPreview: 'Volume CTB (m³)' },
      { id: 'road.lean_concrete', name: 'Lean Concrete / LC Lantai Kerja', shortDesc: 'Lantai kerja beton kurus (B0/K125)', inputPreview: 'P × L × Tebal', outputPreview: 'Volume LC (m³)' },
      { id: 'road.rigid_pavement', name: 'Rigid Pavement (Perkerasan Kaku Beton)', shortDesc: 'Perkerasan beton semen rigid pavement (Fs45)', inputPreview: 'P × L × Tebal Pelat', outputPreview: 'Volume Beton (m³)' },

      // ASPHALT (6)
      { id: 'road.asphalt_base', name: 'Asphalt Concrete - Base (AC-Base)', shortDesc: 'Lapis pondasi aspal beton AC-Base', inputPreview: 'P × L × Tebal', outputPreview: 'Luas (m²), Volume (m³)' },
      { id: 'road.asphalt_binder', name: 'Asphalt Concrete - Binder (AC-BC)', shortDesc: 'Lapis antara aspal beton AC-BC', inputPreview: 'P × L × Tebal', outputPreview: 'Luas (m²), Volume (m³)' },
      { id: 'road.asphalt_wearing_course', name: 'Asphalt Wearing Course (AC-WC)', shortDesc: 'Lapis aus permukaan aspal AC-WC / HRS-WC', inputPreview: 'P × L × Tebal', outputPreview: 'Luas (m²), Volume (m³)' },
      { id: 'road.prime_coat', name: 'Prime Coat (Lapis Resap Pengikat)', shortDesc: 'Semprotan aspal cair resap pengikat di atas pondasi agregat', inputPreview: 'Luas Semprot × Kadar', outputPreview: 'Luas (m²), Aspal (Liter)' },
      { id: 'road.tack_coat', name: 'Tack Coat (Lapis Perekat)', shortDesc: 'Semprotan aspal emulsi perekat antar lapis aspal', inputPreview: 'Luas Semprot × Kadar', outputPreview: 'Luas (m²), Aspal (Liter)' },
      { id: 'road.asphalt_surface', name: 'Asphalt Surface (HRS / Lataston / Burtu)', shortDesc: 'Lapis permukaan aspal tipis / penetrasi macadam', inputPreview: 'P × L × Tebal', outputPreview: 'Luas (m²), Volume (m³)' },

      // ROAD ELEMENTS (5)
      { id: 'road.shoulder', name: 'Road Shoulder (Bahu Jalan)', shortDesc: 'Bahu jalan berbutir atau diperkeras (kiri & kanan)', inputPreview: 'Panjang × Lebar × Tebal × 2 Sisi', outputPreview: 'Luas & Volume Bahu' },
      { id: 'road.median', name: 'Road Median (Median Jalan)', shortDesc: 'Median pemisah jalur tengah & peninggian kerb', inputPreview: 'Panjang × Lebar × Tebal', outputPreview: 'Luas & Volume Median' },
      { id: 'road.kerb', name: 'Road Kerb / Curb (Kerb Pembatas Jalan)', shortDesc: 'Kerb beton pracetak pembatas lajur & trotoar', inputPreview: 'Panjang Kerb × Tipe', outputPreview: 'Panjang (m\'), Volume (m³)' },
      { id: 'road.side_ditch', name: 'Road Side Ditch (Saluran Samping Jalan)', shortDesc: 'Saluran samping tanah/pasangan batu trase jalan', inputPreview: 'Panjang × Dimensi Penampang', outputPreview: 'Galian & Pasangan (m³)' },
      { id: 'road.road_drainage', name: 'Road Drainage (Drainase Jalan Raya)', shortDesc: 'Drainase permukaan, gorong-gorong pipa & box', inputPreview: 'Panjang Saluran × Dimensi', outputPreview: 'Panjang & Volume' },

      // GEOSYNTHETIC (2)
      { id: 'road.geotextile', name: 'Geotextile (Woven / Non-Woven)', shortDesc: 'Geotekstil separator & stabilisasi tanah dasar lunak', inputPreview: 'Panjang × Lebar + Overlap', outputPreview: 'Luas Terpasang & Lembar (m²)' },
      { id: 'road.geogrid', name: 'Geogrid (Biaxial / Triaxial Reinforcement)', shortDesc: 'Geogrid perkuatan lapis pondasi jalan & lereng', inputPreview: 'Panjang × Lebar + Overlap', outputPreview: 'Luas Geogrid (m²)' },

      // ROAD SAFETY (5)
      { id: 'road.road_marking', name: 'Road Marking (Marka Jalan Termoplastik)', shortDesc: 'Marka garis membujur putus/utuh, zebra cross & panah', inputPreview: 'Panjang Garis × Lebar Garis', outputPreview: 'Luas Pengecatan Marka (m²)' },
      { id: 'road.guardrail', name: 'Guardrail (Pagar Pengaman Jalan)', shortDesc: 'Pagar pengaman baja galvanis W-Beam & tiang post', inputPreview: 'Panjang Pagar, Jarak Tiang', outputPreview: 'Panjang (m\'), Tiang (btg)' },
      { id: 'road.traffic_barrier', name: 'Traffic Barrier (Barrier Beton Pembatas)', shortDesc: 'Pembatas lalu lintas beton masif / jersey barrier', inputPreview: 'Panjang Barrier / Modul', outputPreview: 'Panjang (m\'), Volume Beton' },
      { id: 'road.road_delineator', name: 'Road Delineator (Patok Pengarah Jalan)', shortDesc: 'Patok pengarah delineator post jalur berbahaya/tikungan', inputPreview: 'Jumlah Patok (Unit)', outputPreview: 'Jumlah Patok (unit)' },
      { id: 'road.road_sign_foundation', name: 'Road Sign Foundation (Pondasi Rambu Jalan)', shortDesc: 'Pondasi beton rambu petunjuk jalan & portal RPPJ', inputPreview: 'P × L × D × Jumlah Titik', outputPreview: 'Volume Beton Pondasi (m³)' },

      // JOINT / SPECIAL (2)
      { id: 'road.pavement_joint', name: 'Rigid Pavement Joint (Sambungan Melintang/Memanjang)', shortDesc: 'Sambungan susut/lentur, dowel bar, tie bar & sealant', inputPreview: 'Panjang Jalan, Lebar, Spasi Joint', outputPreview: 'Panjang Joint (m\'), Dowel (btg)' },
      { id: 'road.expansion_joint', name: 'Road Expansion Joint (Sambungan Muai)', shortDesc: 'Sambungan muai expansion joint jembatan/jalan kaku', inputPreview: 'Panjang Joint × Celah', outputPreview: 'Panjang Sambungan (m\')' },

      // HAULING (1)
      { id: 'road.material_hauling', name: 'Material Hauling (Pengangkutan Material Jalan)', shortDesc: 'Pengangkutan material tanah/agregat/aspal ke lokasi proyek', inputPreview: 'Volume Material × Jarak Angkut', outputPreview: 'Volume-Jarak (m³·km)' },
    ],
  },
  {
    id: 'DRAINAGE',
    name: 'H. DRAINAGE & SALURAN (15)',
    icon: '🌊',
    pack: 'DRAINAGE',
    items: [
      { id: 'drainage.channel', name: 'Drainage Channel (Saluran Terbuka)', shortDesc: 'Saluran drainase trapesium/persegi', inputPreview: 'Panjang, Lebar Atas/Bawah, T', outputPreview: 'Galian & Lining (m³)' },
      { id: 'drainage.u_ditch', name: 'U-Ditch Precast', shortDesc: 'Saluran U-Ditch beton pracetak & bedding', inputPreview: 'Panjang, Modul, Dimensi', outputPreview: 'Panjang & Unit U-Ditch' },
      { id: 'drainage.box_culvert', name: 'Box Culvert (Gorong-Gorong Persegi)', shortDesc: 'Gorong-gorong persegi beton bertulang', inputPreview: 'Panjang, Bentang, Tinggi', outputPreview: 'Volume Beton Box (m³)' },
      { id: 'drainage.pipe_culvert', name: 'Pipe Culvert (RCP / Pipa Beton)', shortDesc: 'Gorong-gorong pipa beton bertulang', inputPreview: 'Panjang, Diameter, Jalur', outputPreview: 'Panjang Pipa (m\')' },
      { id: 'drainage.ditch', name: 'Roadside Ditch (Parit Samping)', shortDesc: 'Galian parit tanah penampung limpasan', inputPreview: 'Panjang, Lebar, Kedalaman', outputPreview: 'Volume Galian Parit (m³)' },
      { id: 'drainage.inlet', name: 'Drainage Inlet', shortDesc: 'Struktur mulut pemasukan drainase', inputPreview: 'Jumlah Unit × Dimensi', outputPreview: 'Unit & Volume Beton (m³)' },
      { id: 'drainage.outlet', name: 'Drainage Outlet (Drop Structure)', shortDesc: 'Struktur pembuangan & apron pelindung', inputPreview: 'Jumlah Unit × Dimensi Apron', outputPreview: 'Unit & Volume Apron (m³)' },
      { id: 'drainage.manhole', name: 'Drainage Manhole (Bak Kontrol)', shortDesc: 'Bak kontrol drainase dan tutup manhole', inputPreview: 'Jumlah Titik, P × L × T', outputPreview: 'Unit & Beton Manhole' },
      { id: 'drainage.headwall', name: 'Culvert Headwall', shortDesc: 'Dinding kepala gorong-gorong inlet/outlet', inputPreview: 'Jumlah Titik, Lebar, Tinggi', outputPreview: 'Volume Pasangan/Beton (m³)' },
      { id: 'drainage.excavation', name: 'Drainage Trench Excavation', shortDesc: 'Galian tanah parit saluran drainase', inputPreview: 'Panjang × Penampang Galian', outputPreview: 'Volume Galian Saluran (m³)' },
      { id: 'drainage.bedding', name: 'Drainage Bedding (Landasan Pasir)', shortDesc: 'Pasir urug landasan dasar saluran/pipa', inputPreview: 'P × L × Tebal Pasir', outputPreview: 'Volume Pasir Urug (m³)' },
      { id: 'drainage.backfill', name: 'Drainage Trench Backfill', shortDesc: 'Urugan tanah kembali sisi saluran/pipa', inputPreview: 'Vol Galian - Vol Struktur', outputPreview: 'Volume Urugan Kembali (m³)' },
      { id: 'drainage.concrete_drain', name: 'Concrete Drain (Saluran Beton Cor)', shortDesc: 'Saluran drainase beton cor di tempat', inputPreview: 'P × Dimensi Dalam × Tebal', outputPreview: 'Volume Cor Beton (m³)' },
      { id: 'drainage.lining', name: 'Channel Lining (Pasangan Batu)', shortDesc: 'Lapis lindung pasangan batu kali saluran', inputPreview: 'Panjang × Keliling Pasangan', outputPreview: 'Luas & Volume Lining (m³)' },
      { id: 'drainage.cover', name: 'Drainage Cover Slab (Tutup Saluran)', shortDesc: 'Pelat penutup beton atau grating saluran', inputPreview: 'Panjang, Lebar, Modul', outputPreview: 'Jumlah Buah & Luas Cover' },
    ],
  },
  {
    id: 'BRIDGE',
    name: 'I. BRIDGE / JEMBATAN (16)',
    icon: '🌉',
    pack: 'BRIDGE',
    items: [
      { id: 'bridge.geometry', name: 'Bridge Geometry', shortDesc: 'Geometri bentang jembatan dan luas lantai', inputPreview: 'Panjang Bentang × Lebar', outputPreview: 'Luas Lantai Jembatan (m²)' },
      { id: 'bridge.deck', name: 'Bridge Deck Slab', shortDesc: 'Plat lantai jembatan beton bertulang', inputPreview: 'Panjang, Lebar, Tebal Plat', outputPreview: 'Volume Beton Plat (m³)' },
      { id: 'bridge.girder', name: 'Bridge Girder', shortDesc: 'Balok girder pracetak I-Girder / Box-Girder', inputPreview: 'Panjang × Jumlah Balok × Luas', outputPreview: 'Volume Beton Girder (m³)' },
      { id: 'bridge.abutment', name: 'Bridge Abutment', shortDesc: 'Kepala jembatan (dinding dada & tapak)', inputPreview: 'Jumlah Abutmen, Dimensi', outputPreview: 'Volume Beton Abutmen (m³)' },
      { id: 'bridge.pier', name: 'Bridge Pier & Pier Head', shortDesc: 'Pilar tengah jembatan dan kepala pilar', inputPreview: 'Jumlah Pilar, Kolom, Pier Head', outputPreview: 'Volume Beton Pilar (m³)' },
      { id: 'bridge.foundation', name: 'Bridge Foundation (Pile Cap)', shortDesc: 'Pile cap dan tiang pancang / bored pile', inputPreview: 'Pile Cap + Tiang Pancang', outputPreview: 'Beton Cap (m³), Tiang (m\')' },
      { id: 'bridge.approach_slab', name: 'Approach Slab (Plat Injak)', shortDesc: 'Plat injak beton transisi oprit jembatan', inputPreview: 'Panjang × Lebar × Tebal × 2 Sisi', outputPreview: 'Volume Beton Plat Injak (m³)' },
      { id: 'bridge.barrier', name: 'Bridge Barrier', shortDesc: 'Barier beton pembatas pengaman jembatan', inputPreview: 'Panjang × Luas Penampang × 2 Sisi', outputPreview: 'Volume Beton Barrier (m³)' },
      { id: 'bridge.parapet', name: 'Bridge Railing', shortDesc: 'Pagar pengaman pipa baja galvanis', inputPreview: 'Panjang Jembatan × Jarak Tiang', outputPreview: 'Panjang Railing (m\'), Tiang' },
      { id: 'bridge.bearing', name: 'Elastomeric Bearing Pad', shortDesc: 'Bantalan karet elastomer penumpu girder', inputPreview: 'Jumlah Girder × Bentang × Tumpuan', outputPreview: 'Jumlah Bearing (buah)' },
      { id: 'bridge.expansion_joint', name: 'Bridge Expansion Joint', shortDesc: 'Sambungan siar muai modular / asphaltic', inputPreview: 'Lebar Lantai × Titik Joint', outputPreview: 'Panjang Sambungan (m\')' },
      { id: 'bridge.excavation', name: 'Bridge Substructure Excavation', shortDesc: 'Galian tanah pondasi abutmen & pilar', inputPreview: 'P × L × Kedalaman × Titik', outputPreview: 'Volume Galian Struktur (m³)' },
      { id: 'bridge.backfill', name: 'Bridge Abutment Backfill', shortDesc: 'Timbunan pilihan oprit di belakang abutmen', inputPreview: 'Panjang Oprit, Lebar, Tinggi', outputPreview: 'Volume Timbunan Oprit (m³)' },
      { id: 'bridge.concrete', name: 'Bridge Structural Concrete', shortDesc: 'Volume cor beton komponen jembatan umum', inputPreview: 'P × L × T × Jumlah', outputPreview: 'Volume Cor Beton (m³)' },
      { id: 'bridge.formwork', name: 'Bridge Formwork', shortDesc: 'Acuan bekisting elemen jembatan', inputPreview: 'Keliling Kontak × Panjang', outputPreview: 'Luas Bekisting (m²)' },
      { id: 'bridge.reinforcement', name: 'Bridge Reinforcement Steel', shortDesc: 'Baja tulangan sirip/polos struktur jembatan', inputPreview: 'Volume Beton × Rasio Besi', outputPreview: 'Berat Besi Tulangan (kg)' },
    ],
  },
  {
    id: 'IRRIGATION',
    name: 'J. IRRIGATION / IRIGASI (11)',
    icon: '🌾',
    pack: 'IRRIGATION',
    items: [
      { id: 'irrigation.canal', name: 'Irrigation Canal', shortDesc: 'Saluran irigasi trapesium primer/sekunder', inputPreview: 'Panjang, Lebar Dasar, Tinggi, Slope', outputPreview: 'Galian & Luas Basah (m³)' },
      { id: 'irrigation.excavation', name: 'Canal Excavation', shortDesc: 'Galian tanah trase saluran pembawa', inputPreview: 'Panjang × Luas Penampang Galian', outputPreview: 'Volume Galian Tanah (m³)' },
      { id: 'irrigation.lining', name: 'Canal Lining', shortDesc: 'Pasangan batu kali lining dinding saluran', inputPreview: 'Panjang × Keliling × Tebal', outputPreview: 'Volume Pasangan Batu (m³)' },
      { id: 'irrigation.embankment', name: 'Canal Embankment', shortDesc: 'Tanggul tanah jalan inspeksi saluran', inputPreview: 'Panjang × Penampang Tanggul', outputPreview: 'Volume Timbunan Tanggul (m³)' },
      { id: 'irrigation.gate', name: 'Sluice Gate (Pintu Air)', shortDesc: 'Pintu air sorong baja pengatur debit', inputPreview: 'Jumlah Unit, Lebar, Tinggi', outputPreview: 'Jumlah Unit Pintu Air' },
      { id: 'irrigation.intake', name: 'Intake / Offtake Structure', shortDesc: 'Bangunan bagi / sadap saluran irigasi', inputPreview: 'Jumlah Unit Bangunan Sadap', outputPreview: 'Volume Beton Sadap (m³)' },
      { id: 'irrigation.outlet', name: 'Canal Spillway / Waste Way', shortDesc: 'Bangunan pelimpah samping & pembuang', inputPreview: 'Jumlah Unit Pelimpah', outputPreview: 'Volume Pasangan/Beton (m³)' },
      { id: 'irrigation.box_channel', name: 'Irrigation Flume / Culvert', shortDesc: 'Talang pembawa & gorong-gorong silang', inputPreview: 'Panjang × Dimensi Dalam × Tebal', outputPreview: 'Volume Beton Talang (m³)' },
      { id: 'irrigation.concrete', name: 'Irrigation Concrete Structure', shortDesc: 'Beton struktur bangunan air irigasi', inputPreview: 'P × L × T × Jumlah', outputPreview: 'Volume Cor Beton (m³)' },
      { id: 'irrigation.formwork', name: 'Irrigation Formwork', shortDesc: 'Bekisting dinding & lantai bangunan irigasi', inputPreview: 'Panjang × Tinggi × Sisi', outputPreview: 'Luas Bekisting (m²)' },
      { id: 'irrigation.backfill', name: 'Canal Backfill', shortDesc: 'Urugan tanah kembali sisi bangunan irigasi', inputPreview: 'P × Lebar Urugan × Kedalaman', outputPreview: 'Volume Urugan Kembali (m³)' },
    ],
  },
  {
    id: 'RIVER',
    name: 'K. RIVER & FLOOD PROTECTION (9)',
    icon: '🏞️',
    pack: 'RIVER',
    items: [
      { id: 'river.segment', name: 'River Reach Protection', shortDesc: 'Penanganan perkuatan tebing sungai', inputPreview: 'Panjang Penanganan × Kemiringan', outputPreview: 'Luas Bidang Penanganan (m²)' },
      { id: 'river.riprap', name: 'Riprap Bank Protection', shortDesc: 'Lapisan batu belah armor riprap tebing', inputPreview: 'Panjang × Panjang Miring × Tebal', outputPreview: 'Volume Batu Riprap (m³)' },
      { id: 'river.gabion', name: 'Gabion Bank Protection (Bronjong)', shortDesc: 'Kawat bronjong pabrikasi pengaman tebing', inputPreview: 'Panjang Dinding, Lapisan, Modul', outputPreview: 'Jumlah Unit Bronjong & Batu' },
      { id: 'river.revetment', name: 'Revetment (Pasangan Batu Tebing)', shortDesc: 'Pasangan batu kali perkuatan tebing sungai', inputPreview: 'Panjang × Panjang Miring × Tebal', outputPreview: 'Volume Pasangan Batu (m³)' },
      { id: 'river.protection_concrete', name: 'Concrete Mattress Protection', shortDesc: 'Plat beton / matras pelindung lereng sungai', inputPreview: 'Panjang × Panjang Miring × Tebal', outputPreview: 'Volume Plat Beton (m³)' },
      { id: 'river.sheet_pile', name: 'Sheet Pile (Turap Beton CCSP/Baja)', shortDesc: 'Dinding penahan turap pemancangan tebing', inputPreview: 'Panjang Dinding, Kedalaman Tiang', outputPreview: 'Panjang Pemancangan (m\')' },
      { id: 'river.toe_protection', name: 'Toe Protection (Krib / Kaki Tebing)', shortDesc: 'Pelindung kaki tebing penahan gerusan dasar', inputPreview: 'Panjang × Lebar × Kedalaman', outputPreview: 'Volume Pasangan Kaki (m³)' },
      { id: 'river.excavation', name: 'River Dredging & Excavation', shortDesc: 'Pengerukan sedimen & pelebaran alur sungai', inputPreview: 'Panjang × Lebar × Kedalaman Keruk', outputPreview: 'Volume Pengerukan (m³)' },
      { id: 'river.backfill', name: 'Flood Embankment (Tanggul Banjir)', shortDesc: 'Tanggul tanah pengendali banjir sungai', inputPreview: 'Panjang, Lebar Mercu, Tinggi, Slope', outputPreview: 'Volume Timbunan Tanggul (m³)' },
    ],
  },
  {
    id: 'WEIR',
    name: 'L. WEIR / BENDUNG (10)',
    icon: '🧱',
    pack: 'WEIR',
    items: [
      { id: 'weir.body', name: 'Weir Body (Tubuh Bendung)', shortDesc: 'Tubuh bendung tetap pasangan batu/beton', inputPreview: 'Panjang Mercu, Tinggi, Lebar', outputPreview: 'Volume Tubuh Bendung (m³)' },
      { id: 'weir.spillway', name: 'Weir Crest & Spillway', shortDesc: 'Permukaan mercu ogee pelimpah bendung', inputPreview: 'Panjang Mercu × Busur Mercu', outputPreview: 'Luas & Volume Skin Mercu' },
      { id: 'weir.apron', name: 'Upstream / Downstream Apron', shortDesc: 'Lantai apron pelindung hulu dan hilir', inputPreview: 'Lebar Bentang × Panjang × Tebal', outputPreview: 'Volume Plat Apron (m³)' },
      { id: 'weir.stilling_basin', name: 'Stilling Basin (Kolam Olak)', shortDesc: 'Kolam olak peredam energi & end sill', inputPreview: 'Lebar, Panjang, Tebal Plat Lantai', outputPreview: 'Volume Beton Kolam Olak (m³)' },
      { id: 'weir.wing_wall', name: 'Weir Wing Wall (Tembok Sayap)', shortDesc: 'Tembok sayap hulu/hilir bendung', inputPreview: 'Panjang, Tinggi, Tebal × Jumlah', outputPreview: 'Volume Pasangan Sayap (m³)' },
      { id: 'weir.gate', name: 'Flushing Sluice Gate', shortDesc: 'Pintu penguras / bilas bendung', inputPreview: 'Jumlah Unit × Dimensi Bukaan', outputPreview: 'Jumlah Unit Pintu Bilas' },
      { id: 'weir.excavation', name: 'Weir Foundation Excavation', shortDesc: 'Galian tanah/batu tapak pondasi bendung', inputPreview: 'Panjang × Lebar × Kedalaman', outputPreview: 'Volume Galian Pondasi (m³)' },
      { id: 'weir.backfill', name: 'Weir Backfill', shortDesc: 'Urugan tanah/batu kembali dinding bendung', inputPreview: 'Volume Bersih Urugan', outputPreview: 'Volume Urugan Kembali (m³)' },
      { id: 'weir.concrete', name: 'Weir Concrete Works', shortDesc: 'Beton struktur pilar & jembatan layanan', inputPreview: 'P × L × T × Jumlah', outputPreview: 'Volume Beton Struktur (m³)' },
      { id: 'weir.formwork', name: 'Weir Formwork', shortDesc: 'Bekisting dinding pilar & mercu bendung', inputPreview: 'Panjang × Tinggi × Sisi', outputPreview: 'Luas Pasang Bekisting (m²)' },
    ],
  },
  {
    id: 'EMBUNG',
    name: 'M. EMBUNG & RETENSI (11)',
    icon: '💧',
    pack: 'EMBUNG',
    items: [
      { id: 'embung.reservoir', name: 'Embung Reservoir Capacity', shortDesc: 'Estimasi volume kapasitas tampungan embung', inputPreview: 'Luas Muka Air, Luas Dasar, Kedalaman', outputPreview: 'Volume Tampungan (m³)' },
      { id: 'embung.embankment', name: 'Embung Embankment (Tanggul)', shortDesc: 'Timbunan tanah tanggul keliling embung', inputPreview: 'Panjang Tanggul, Lebar Puncak, H', outputPreview: 'Volume Timbunan Tanggul (m³)' },
      { id: 'embung.excavation', name: 'Embung Basin Excavation', shortDesc: 'Galian pembentukan kolam waduk embung', inputPreview: 'P × L × Kedalaman × Slope', outputPreview: 'Volume Galian Kolam (m³)' },
      { id: 'embung.fill', name: 'Embung Common Fill', shortDesc: 'Timbunan tanah penataan tapak embung', inputPreview: 'Luas Bidang × Tinggi Rata²', outputPreview: 'Volume Timbunan Tanah (m³)' },
      { id: 'embung.core', name: 'Embung Clay Core (Inti Lempung)', shortDesc: 'Zona inti lempung kedap air tanggul', inputPreview: 'Panjang, Lebar Puncak/Dasar, H', outputPreview: 'Volume Inti Lempung (m³)' },
      { id: 'embung.filter', name: 'Embung Granular Filter', shortDesc: 'Zona filter pasir & kerikil tanggul', inputPreview: 'Panjang × Tinggi × Tebal Filter', outputPreview: 'Volume Filter Gradasi (m³)' },
      { id: 'embung.drainage', name: 'Embung Toe Drain', shortDesc: 'Drainase kaki tanggul (toe drain porous)', inputPreview: 'Panjang × Penampang Toe Drain', outputPreview: 'Volume Batu Toe Drain (m³)' },
      { id: 'embung.spillway', name: 'Embung Overflow Spillway', shortDesc: 'Saluran pelimpah luapan darurat embung', inputPreview: 'Panjang Pelimpah × Koef/meter', outputPreview: 'Volume Beton Pelimpah (m³)' },
      { id: 'embung.outlet', name: 'Embung Bottom Outlet', shortDesc: 'Pipa outlet pengeluaran bawah & selimut', inputPreview: 'Panjang Pipa, Diameter, Selimut', outputPreview: 'Panjang Pipa & Beton (m³)' },
      { id: 'embung.intake', name: 'Embung Intake Tower', shortDesc: 'Menara / bak pengambilan air embung', inputPreview: 'Jumlah Unit × Volume per Unit', outputPreview: 'Unit & Volume Beton (m³)' },
      { id: 'embung.protection', name: 'Embung Geomembrane Protection', shortDesc: 'Lining geomembran HDPE kedap air embung', inputPreview: 'Luas Basah Kolam + Overlap', outputPreview: 'Luas Geomembran (m²)' },
    ],
  },
  {
    id: 'DAM',
    name: 'N. DAM / BENDUNGAN BESAR (12)',
    icon: '🏔️',
    pack: 'DAM',
    items: [
      { id: 'dam.body', name: 'Dam Body (Tubuh Bendungan)', shortDesc: 'Volume kubikasi total tubuh bendungan besar', inputPreview: 'Panjang Puncak, Tinggi, Kemiringan', outputPreview: 'Volume Tubuh Bendungan (m³)' },
      { id: 'dam.embankment', name: 'Dam Shell Embankment', shortDesc: 'Timbunan zona shell / urugan batu random', inputPreview: 'Volume Total × Proporsi Shell', outputPreview: 'Volume Zona Shell (m³)' },
      { id: 'dam.excavation', name: 'Dam Foundation Excavation', shortDesc: 'Galian tapak pondasi & kupasan batuan', inputPreview: 'Luas Tapak Dasar × Kedalaman', outputPreview: 'Volume Galian Tapak (m³)' },
      { id: 'dam.fill', name: 'Dam Site Fill / Saddle Dam', shortDesc: 'Timbunan tanah/batu bendungan pelana', inputPreview: 'Volume Bersih Timbunan', outputPreview: 'Volume Timbunan Pelana (m³)' },
      { id: 'dam.core', name: 'Dam Clay Core (Zona 1 Inti)', shortDesc: 'Zona 1 inti lempung kedap air bendungan', inputPreview: 'Panjang Puncak, Tinggi, Kemiringan', outputPreview: 'Volume Inti Lempung (m³)' },
      { id: 'dam.filter', name: 'Dam Fine/Coarse Filter (Zona 2)', shortDesc: 'Zona filter pasir-kerikil chimney & blanket', inputPreview: 'Panjang × Tinggi × Tebal Filter', outputPreview: 'Volume Zona Filter (m³)' },
      { id: 'dam.drainage', name: 'Dam Grouting Gallery', shortDesc: 'Galeri grouting inspeksi & drainase pondasi', inputPreview: 'Panjang Galeri × Volume/meter', outputPreview: 'Panjang Galeri & Beton (m³)' },
      { id: 'dam.rockfill', name: 'Dam Rockfill (Zona 3 Kuari)', shortDesc: 'Zona 3 batuan pecah kuari penopang luar', inputPreview: 'Volume Timbunan Batuan Kuari', outputPreview: 'Volume Batu Kuari (m³)' },
      { id: 'dam.spillway', name: 'Dam Chute Spillway', shortDesc: 'Bangunan pelimpah & saluran luncur chute', inputPreview: 'Panjang Luncur, Lebar, Dinding', outputPreview: 'Volume Beton Pelimpah (m³)' },
      { id: 'dam.outlet', name: 'Dam Diversion Tunnel', shortDesc: 'Terowongan pengelak & bottom outlet', inputPreview: 'Panjang Terowongan, Diameter, Lining', outputPreview: 'Galian & Beton Lining (m³)' },
      { id: 'dam.intake', name: 'Dam Intake Tower', shortDesc: 'Menara intake pengambilan air bendungan', inputPreview: 'Tinggi Menara × Volume/meter', outputPreview: 'Volume Beton Menara (m³)' },
      { id: 'dam.protection', name: 'Dam Upstream Riprap (Zona 4)', shortDesc: 'Batu armor riprap pelindung lereng hulu', inputPreview: 'Panjang Lereng × Bidang Miring × Tebal', outputPreview: 'Volume Batu Armor (m³)' },
    ],
  },
  {
    id: 'WATER_STRUCTURE',
    name: 'O. WATER STRUCTURE / SPAM (13)',
    icon: '🚰',
    pack: 'WATER_STRUCTURE',
    items: [
      { id: 'water.intake', name: 'Raw Water Intake (SPAM)', shortDesc: 'Bangunan intake penyadap air baku', inputPreview: 'P × L × Tinggi × Tebal Dinding', outputPreview: 'Volume Beton Intake (m³)' },
      { id: 'water.outlet', name: 'Water Discharge Outlet', shortDesc: 'Struktur outlet pelimpah pembuang air', inputPreview: 'Volume Bersih Beton', outputPreview: 'Volume Beton Outlet (m³)' },
      { id: 'water.chamber', name: 'Sedimentation Chamber', shortDesc: 'Bak penenang / pengendap pasir air bersih', inputPreview: 'P × L × Kedalaman × Tebal Dinding', outputPreview: 'Volume Beton Bak (m³)' },
      { id: 'water.manhole', name: 'Valve Chamber Box', shortDesc: 'Bak kontrol katup pipa & pelepas udara', inputPreview: 'Jumlah Titik, Dimensi Dalam', outputPreview: 'Unit & Volume Beton (m³)' },
      { id: 'water.reservoir', name: 'Ground Water Reservoir', shortDesc: 'Reservoir air minum bawah tanah / ground', inputPreview: 'P × L × Tinggi, Plat Dasar & Atap', outputPreview: 'Kapasitas Air & Beton (m³)' },
      { id: 'water.tank', name: 'Elevated Water Tank', shortDesc: 'Menara tangki tandon air distribusi', inputPreview: 'Kapasitas Tangki, Tinggi Menara', outputPreview: 'Kapasitas Tangki (m³)' },
      { id: 'water.pipe', name: 'Water Distribution Pipeline', shortDesc: 'Jaringan pipa transmisi HDPE/DIP/PVC', inputPreview: 'Panjang Pipa, Diameter, Parit', outputPreview: 'Panjang Pipa & Galian (m³)' },
      { id: 'water.box_structure', name: 'Pump House Structure', shortDesc: 'Gedung rumah pompa instalasi air', inputPreview: 'P × L Bangunan, Volume Beton', outputPreview: 'Luas Lantai & Beton (m³)' },
      { id: 'water.concrete_structure', name: 'Water Retaining Concrete', shortDesc: 'Beton struktur bertulang kedap air', inputPreview: 'P × L × Tebal × Jumlah', outputPreview: 'Volume Cor Beton (m³)' },
      { id: 'water.excavation', name: 'Water Structure Excavation', shortDesc: 'Galian tanah lubang bak penampung air', inputPreview: 'P × L × Kedalaman Galian', outputPreview: 'Volume Galian Pit (m³)' },
      { id: 'water.backfill', name: 'Water Structure Backfill', shortDesc: 'Urugan tanah kembali sekeliling bak air', inputPreview: 'Vol Galian - Vol Struktur', outputPreview: 'Volume Urugan Kembali (m³)' },
      { id: 'water.lining', name: 'Waterproofing & Epoxy Coating', shortDesc: 'Pelapisan waterproofing food-grade bak', inputPreview: 'Luas Lantai + Keliling Dinding', outputPreview: 'Luas Waterproofing (m²)' },
      { id: 'water.cover', name: 'Reservoir Roof Cover Slab', shortDesc: 'Plat atap penutup reservoir & manhole hatch', inputPreview: 'Luas Plat Atap, Pintu Akses', outputPreview: 'Luas Penutup & Pintu Akses' },
    ],
  },
];

export interface CivilDomainDef {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  packs: string[];
}

export const CIVIL_DOMAINS: CivilDomainDef[] = [
  { id: 'BUILDING', name: 'Bangunan', subtitle: 'Building', icon: '🏠', packs: ['RESIDENTIAL', 'LEGACY'] },
  { id: 'MASTER_SNI', name: 'Master SNI / CAD (24)', subtitle: 'Kalkulator Utama', icon: '📐', packs: ['LEGACY'] },
  { id: 'ROAD', name: 'Jalan', subtitle: 'Road', icon: '🛣️', packs: ['ROAD'] },
  { id: 'DRAINAGE', name: 'Drainase & Saluran', subtitle: 'Drainage', icon: '💧', packs: ['DRAINAGE'] },
  { id: 'BRIDGE', name: 'Jembatan', subtitle: 'Bridge', icon: '🌉', packs: ['BRIDGE'] },
  { id: 'IRRIGATION', name: 'Irigasi', subtitle: 'Irrigation', icon: '🌱', packs: ['IRRIGATION'] },
  { id: 'RIVER', name: 'Sungai & Proteksi Banjir', subtitle: 'River & Flood', icon: '🌊', packs: ['RIVER'] },
  { id: 'WEIR', name: 'Bendung', subtitle: 'Weir', icon: '🏗️', packs: ['WEIR'] },
  { id: 'EMBUNG', name: 'Embung & Retensi', subtitle: 'Embung', icon: '💦', packs: ['EMBUNG'] },
  { id: 'DAM', name: 'Bendungan', subtitle: 'Dam', icon: '🏔️', packs: ['DAM'] },
  { id: 'WATER_STRUCTURE', name: 'Bangunan Air', subtitle: 'Water Structure', icon: '🏞️', packs: ['WATER_STRUCTURE'] },
];

export const QtoCalculatorView: React.FC<QtoCalculatorViewProps> = ({
  initialCalcId,
  initialQtoId,
  onNavigateToTab,
}) => {
  const {
    projects,
    currentProject,
    currentProjectId,
    setCurrentProjectId,
    projectQtoItems,
    projectCalculationRuns,
    executeCalculationAndSave,
    syncQtoToRabSpreadsheet,
    deleteQtoItem,
  } = useProject();

  const effectiveProject = currentProject || (projects && projects.length > 0 ? projects[0] : null);

  useEffect(() => {
    if (!currentProjectId && projects && projects.length > 0) {
      setCurrentProjectId(projects[0].id);
    }
  }, [currentProjectId, projects, setCurrentProjectId]);

  // Active Calculator & Domain Selector (Default: BOWPLANK in BUILDING)
  const [selectedCalcId, setSelectedCalcId] = useState<string>(initialCalcId || 'BOWPLANK');
  const [activeDomain, setActiveDomain] = useState<string>('BUILDING');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Workstation Favorites & Recents Persistence (Real localStorage integration)
  const RECENT_KEY = 'ezrab_recent_calculators';
  const FAVORITE_KEY = 'ezrab_favorite_calculators';

  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try {
      const val = typeof window !== 'undefined' ? localStorage.getItem(RECENT_KEY) : null;
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  });

  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const val = typeof window !== 'undefined' ? localStorage.getItem(FAVORITE_KEY) : null;
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  });

  // Workstation Filter States
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState<boolean>(false);
  const [filterUnit, setFilterUnit] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [showCadDiagram, setShowCadDiagram] = useState<boolean>(true);

  const recordRecent = (id: string) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 6);
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        }
      } catch {}
      return next;
    });
  };

  const toggleFavorite = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setFavoriteIds((prev) => {
      const isFav = prev.includes(id);
      const next = isFav ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(FAVORITE_KEY, JSON.stringify(next));
        }
      } catch {}
      return next;
    });
  };

  const toggleCategoryCollapse = (catId: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  const handleSelectCalculator = (id: string) => {
    setSelectedCalcId(id);
    setEditingQtoId(null);
    recordRecent(id);

    // Auto-switch domain if active domain doesn't contain this calculator
    if (activeDomain !== 'ALL') {
      const currentDomainDef = CIVIL_DOMAINS.find((d) => d.id === activeDomain);
      const currentPacks = currentDomainDef ? currentDomainDef.packs : [activeDomain];
      const isVisibleInCurrent = CALCULATOR_CATEGORIES.some(
        (cat) => currentPacks.includes(cat.pack) && cat.items.some((it) => it.id === id)
      );
      if (!isVisibleInCurrent) {
        const targetDomain = CIVIL_DOMAINS.find((d) =>
          CALCULATOR_CATEGORIES.some(
            (cat) => d.packs.includes(cat.pack) && cat.items.some((it) => it.id === id)
          )
        );
        if (targetDomain) {
          setActiveDomain(targetDomain.id);
        } else {
          setActiveDomain('ALL');
        }
      }
    }

    const cat = CALCULATOR_CATEGORIES.find((c) => c.items.some((it) => it.id === id));
    if (cat) {
      setCollapsedCategories((prev) => {
        if (prev[cat.id]) {
          return { ...prev, [cat.id]: false };
        }
        return prev;
      });
    }
    const el = document.getElementById('active-calculator-workbench');
    if (el && typeof window !== 'undefined' && window.innerWidth < 1080) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Active Selected Parameter for Diagram Highlighting
  const [activeParam, setActiveParam] = useState<string>('P');

  // Fullscreen & Lightbox States
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Magic Takeoff & Preset States
  const [showFormulaDrawer, setShowFormulaDrawer] = useState<boolean>(false);

  // Reset Confirmation Modal State
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  // Price Override State
  const [priceOverrides] = useState<Record<string, number>>({});

  // Mobile / Tablet Active View
  const [mobileStep, setMobileStep] = useState<'dimensi' | 'volume' | 'result'>('dimensi');

  // Editing QTO Item ID (if loaded from QTO list)
  const [editingQtoId, setEditingQtoId] = useState<string | null>(initialQtoId || null);

  // Sync initialCalcId if provided or changed
  useEffect(() => {
    if (initialCalcId && initialCalcId !== selectedCalcId) {
      setSelectedCalcId(initialCalcId);
      // Auto-detect domain if needed
      for (const domain of CIVIL_DOMAINS) {
        const found = CALCULATOR_CATEGORIES.some(
          (cat) => domain.packs.includes(cat.pack) && cat.items.some((it) => it.id === initialCalcId)
        );
        if (found) {
          setActiveDomain(domain.id);
          break;
        }
      }
    }
  }, [initialCalcId]);

  // Active Calculator Specification
  const activeSpec = useMemo(() => {
    return getCalculatorById(selectedCalcId) || CONSTRUCTION_CALCULATORS[0];
  }, [selectedCalcId]);

  // Form Inputs State
  const [inputs, setInputs] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    activeSpec.parameters.forEach((p) => {
      initial[p.id] = p.defaultValue;
    });
    return initial;
  });

  // Track if inputs have changed from default
  const hasUnsavedChanges = useMemo(() => {
    for (const p of activeSpec.parameters) {
      if (inputs[p.id] !== undefined && inputs[p.id] !== p.defaultValue) return true;
    }
    return false;
  }, [activeSpec, inputs]);

  // When active calculator changes, reset inputs to default
  useEffect(() => {
    if (!editingQtoId) {
      const initial: Record<string, number> = {};
      activeSpec.parameters.forEach((p) => {
        initial[p.id] = p.defaultValue;
      });
      setInputs(initial);
      setActiveParam(activeSpec.parameters[0]?.id || 'P');
    }
  }, [selectedCalcId, activeSpec, editingQtoId]);

  // Real-time calculation result
  const calculationResult = useMemo(() => {
    return activeSpec.calculate(inputs);
  }, [activeSpec, inputs]);

  // Toast message
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleInputChange = (id: string, val: number) => {
    setInputs((prev) => ({
      ...prev,
      [id]: isNaN(val) ? 0 : val,
    }));
    setActiveParam(id);
  };

  // Excel Paste Handler
  const handlePasteExcelData = (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData.getData('text');
    if (!clipboardData) return;

    const values = clipboardData
      .split(/[\r\n\t,]+/)
      .map((v) => parseFloat(v.trim()))
      .filter((v) => !isNaN(v));

    if (values.length > 0) {
      e.preventDefault();
      const updated = { ...inputs };
      activeSpec.parameters.forEach((param, idx) => {
        if (values[idx] !== undefined) {
          updated[param.id] = values[idx];
        }
      });
      setInputs(updated);
      showToast(`Berhasil menyalin ${values.length} nilai dari Clipboard Excel!`);
    }
  };

  // Validation Check
  const isCalculationValid = useMemo(() => {
    if (calculationResult.primaryQuantity <= 0) return false;
    for (const p of activeSpec.parameters) {
      const val = inputs[p.id] ?? p.defaultValue;
      if (val < (p.min ?? 0)) return false;
    }
    return true;
  }, [calculationResult, activeSpec, inputs]);

  // Handle Save Calculation Run & Create QTO Item
  const handleSaveToQTO = () => {
    if (!currentProjectId) return;
    if (!isCalculationValid) {
      showToast('Parameter perhitungan belum valid. Periksa nilai input.', 'warning');
      return;
    }
    try {
      const { qto, run } = executeCalculationAndSave(selectedCalcId, inputs, {
        targetQtoId: editingQtoId || undefined,
        autoSyncRab: false,
      });
      showToast(`Hasil kalkulasi berhasil ditambahkan ke QTO: ${qto.uraian} (${qto.quantity} ${qto.unit}) - Run ${run.id}`);
      if (editingQtoId) setEditingQtoId(null);
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan kalkulasi', 'warning');
    }
  };

  // Handle Save and Direct Sync to RAB
  const handleSyncToRAB = () => {
    if (!currentProjectId) return;
    if (!isCalculationValid) {
      showToast('Parameter perhitungan belum valid.', 'warning');
      return;
    }
    try {
      const unitPrice = calculationResult.primaryQuantity > 0 
        ? priceBreakdown.grandTotal / calculationResult.primaryQuantity 
        : 0;

      const { qto } = executeCalculationAndSave(selectedCalcId, inputs, {
        targetQtoId: editingQtoId || undefined,
        autoSyncRab: true,
        unitPrice: unitPrice,
      });
      showToast(`Berhasil disinkronkan langsung ke Spreadsheet RAB: ${qto.uraian} (${qto.quantity} ${qto.unit})!`);
      if (editingQtoId) setEditingQtoId(null);
    } catch (err: any) {
      showToast(err.message || 'Gagal sinkronisasi ke RAB', 'warning');
    }
  };

  // Handle Reset with confirmation if changed
  const handleResetClick = () => {
    if (hasUnsavedChanges) {
      setShowResetConfirm(true);
    } else {
      performReset();
    }
  };

  const performReset = () => {
    const initial: Record<string, number> = {};
    activeSpec.parameters.forEach((p) => {
      initial[p.id] = p.defaultValue;
    });
    setInputs(initial);
    setShowResetConfirm(false);
    showToast('Parameter kalkulator direset ke nilai standar.', 'info');
  };

  // Dynamic Domain Counts computed directly from CALCULATOR_CATEGORIES
  const domainCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: CALCULATOR_CATEGORIES.reduce((n, c) => n + c.items.length, 0),
    };
    CIVIL_DOMAINS.forEach((domain) => {
      counts[domain.id] = CALCULATOR_CATEGORIES
        .filter((c) => domain.packs.includes(c.pack))
        .reduce((n, c) => n + c.items.length, 0);
    });
    return counts;
  }, []);

  // Available categories for current domain filter
  const domainCategoryOptions = useMemo(() => {
    if (activeDomain === 'ALL') return CALCULATOR_CATEGORIES;
    const domainDef = CIVIL_DOMAINS.find((d) => d.id === activeDomain);
    const packs = domainDef ? domainDef.packs : [activeDomain];
    return CALCULATOR_CATEGORIES.filter((c) => packs.includes(c.pack));
  }, [activeDomain]);

  // Reset category filter if it doesn't belong to the active domain
  useEffect(() => {
    if (filterCategory !== 'ALL') {
      const exists = domainCategoryOptions.some((c) => c.id === filterCategory);
      if (!exists) setFilterCategory('ALL');
    }
  }, [activeDomain, domainCategoryOptions, filterCategory]);

  // Unique available units across all registered calculators
  const availableUnits = useMemo(() => {
    const units = new Set<string>();
    CALCULATOR_CATEGORIES.forEach((cat) => {
      cat.items.forEach((it) => {
        const s = getCalculatorById(it.id);
        if (s?.primaryUnit) units.add(s.primaryUnit);
      });
    });
    return Array.from(units).sort();
  }, []);

  // Multi-facet Grouped Calculators for Workstation Catalog
  const groupedCalculators = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let candidateCategories = CALCULATOR_CATEGORIES;

    if (activeDomain !== 'ALL') {
      const domainDef = CIVIL_DOMAINS.find((d) => d.id === activeDomain);
      const packs = domainDef ? domainDef.packs : [activeDomain];
      candidateCategories = candidateCategories.filter((c) => packs.includes(c.pack));
    }

    if (filterCategory !== 'ALL') {
      candidateCategories = candidateCategories.filter((c) => c.id === filterCategory);
    }

    return candidateCategories
      .map((cat) => {
        const filteredItems = cat.items
          .map((item) => {
            const spec = getCalculatorById(item.id);
            const isFav = favoriteIds.includes(item.id);
            return {
              ...item,
              categoryName: cat.name,
              categoryIcon: cat.icon,
              pack: cat.pack,
              primaryUnit: spec?.primaryUnit || 'm³',
              code: (spec as any)?.code || item.id.split('.').pop()?.toUpperCase() || item.id,
              isFavorite: isFav,
              spec,
            };
          })
          .filter((item) => {
            if (filterFavoritesOnly && !item.isFavorite) return false;
            if (filterUnit !== 'ALL' && item.primaryUnit !== filterUnit) return false;
            if (!q) return true;

            const nameMatch = item.name.toLowerCase().includes(q);
            const idMatch = item.id.toLowerCase().includes(q);
            const codeMatch = item.code.toLowerCase().includes(q);
            const shortDescMatch = (item.shortDesc || '').toLowerCase().includes(q);
            const titleMatch = (item.spec?.title || '').toLowerCase().includes(q);
            const descMatch = (item.spec?.description || '').toLowerCase().includes(q);
            const catMatch = (item.categoryName || '').toLowerCase().includes(q);
            const sheetMatch = (item.spec?.excelSheetName || '').toLowerCase().includes(q);
            const ahspMatch = (item.spec?.defaultAhspCode || '').toLowerCase().includes(q);

            return nameMatch || idMatch || codeMatch || shortDescMatch || titleMatch || descMatch || catMatch || sheetMatch || ahspMatch;
          });

        return {
          id: cat.id,
          name: cat.name,
          icon: cat.icon,
          pack: cat.pack,
          items: filteredItems,
        };
      })
      .filter((cat) => cat.items.length > 0);
  }, [activeDomain, searchQuery, filterCategory, filterUnit, filterFavoritesOnly, favoriteIds]);

  const totalFilteredCount = useMemo(() => {
    return groupedCalculators.reduce((sum, g) => sum + g.items.length, 0);
  }, [groupedCalculators]);

  const allCategoriesCollapsed = useMemo(() => {
    return groupedCalculators.length > 0 && groupedCalculators.every((g) => !!collapsedCategories[g.id]);
  }, [groupedCalculators, collapsedCategories]);

  const toggleAllCategories = () => {
    if (allCategoriesCollapsed) {
      setCollapsedCategories({});
    } else {
      const next: Record<string, boolean> = {};
      groupedCalculators.forEach((g) => {
        next[g.id] = true;
      });
      setCollapsedCategories(next);
    }
  };

  // Filtered calculators based on active domain and search
  const filteredCalculators = useMemo(() => {
    return groupedCalculators.flatMap((g) => g.items);
  }, [groupedCalculators]);

  // Context for Scope-Based Cost Policy Engine
  const priceContext: PriceContext = useMemo(() => {
    return {
      projectId: currentProjectId || 'default-project',
      location: effectiveProject?.location || 'Indonesia (Standar Nasional)',
      effectiveDate: '2026-01-01',
      periodVersion: '2026',
    };
  }, [currentProjectId, effectiveProject?.location]);

  // Scope-based cost evaluation via CostPolicyEngine
  const scopeCost = useScopeBasedCost(
    selectedCalcId,
    inputs,
    priceContext,
    currentProjectId || 'default-project'
  );

  // PHASE 6A: Compute Weir forensic cost when active calculator is weir.body
  const weirCostResult = useMemo(() => {
    if (selectedCalcId !== 'weir.body') return null;
    const L = Number(inputs.weirLength) || 25;
    const H = Number(inputs.weirHeight) || 3.5;
    const Wc = Number(inputs.crestWidth) || 2.0;
    const Wb = Number(inputs.baseWidth) || 6.0;
    const weirInput: WeirCostInput = {
      weirLength: L,
      weirHeight: H,
      crestWidth: Wc,
      baseWidth: Wb,
      includeReinforcement: 1,
      includeFormwork: 1,
      includeJoint: 1,
      includeWaterstop: 1,
      rebarRatio: 85,
      projectLocation: priceContext.location || 'Kabupaten Probolinggo',
    };
    try {
      return WeirCostService.calculate(weirInput);
    } catch (e) {
      console.error('[Phase6A] WeirCostService error:', e);
      return null;
    }
  }, [selectedCalcId, inputs, priceContext.location]);

  // Compute live price breakdown (Tenaga Kerja, Bahan, Peralatan)
  const priceBreakdown = useMemo(() => {
    // 1. Tenaga Kerja
    const laborRows: QtoPriceRow[] = calculationResult.labor.map((l) => {
      let defaultRate = 0;
      const match = MASTER_PRICE_ITEMS.find(p => p.category === 'LABOR' && p.name.toLowerCase().includes(l.role.toLowerCase()));
      if (match) {
        defaultRate = match.price;
      } else {
        defaultRate = l.rateEstimate || (l.role.includes('Pekerja') ? 100000 : l.role.includes('Tukang') ? 145000 : l.role.includes('Kepala') ? 175000 : 200000);
        if (!l.rateEstimate) {
          // PHASE 1 telemetry: the upah was guessed from the role name, not resolved from a price source.
          recordFabricatedTotal(
            'qto.labor.role-default',
            SafeDecimalEngine.safeMultiply(l.hoursOrDays, defaultRate),
            {
              constant: defaultRate,
              unit: l.unit || 'OH',
              itemName: l.role,
              calculatorId: selectedCalcId,
              calculatorTitle: activeSpec.title,
            },
          );
        }
      }
      const unitRate = priceOverrides[`labor_${l.role}`] ?? defaultRate;
      const totalCost = SafeDecimalEngine.safeMultiply(l.hoursOrDays, unitRate);
      // PHASE 1 step 1.1: provenance marker only. `unitRate` itself is unchanged.
      const laborPriceSource: CostPriceSourceKind =
        priceOverrides[`labor_${l.role}`] !== undefined ? 'OVERRIDE'
          : match ? 'MASTER_DB'
            : l.rateEstimate ? 'CALCULATOR_ESTIMATE'
              : 'FABRICATED';
      return {
        key: `labor_${l.role}`,
        uraian: l.role,
        volume: l.hoursOrDays,
        satuan: l.unit || 'OH',
        hargaSatuan: unitRate,
        jumlahHarga: totalCost,
        isOverridden: priceOverrides[`labor_${l.role}`] !== undefined,
        priceSource: laborPriceSource,
      };
    });
    const subtotalLabor = laborRows.reduce((acc, row) => acc + row.jumlahHarga, 0);

    // 2. Bahan
    const materialRows: QtoPriceRow[] = calculationResult.materials.map((m) => {
      let defaultPrice = 0;
      // PHASE 1 telemetry: which fabricated branch (if any) supplied this price.
      let fabricatedSiteId: string | null = null;
      let match = null;

      if (m.unitPriceEstimate && m.unitPriceEstimate > 0) {
        defaultPrice = m.unitPriceEstimate;
      } else {
        match = MASTER_PRICE_ITEMS.find(p => p.category === 'MATERIAL' && (p.name.toLowerCase().includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(p.name.toLowerCase())));
        if (match) {
          defaultPrice = match.price;
        } else {
          if (m.name.includes('Besi')) { defaultPrice = 14500; fabricatedSiteId = 'qto.material.keyword-branch'; }
          else if (m.name.includes('Kawat')) { defaultPrice = 28000; fabricatedSiteId = 'qto.material.keyword-branch'; }
          else if (m.name.includes('Kayu papan')) { defaultPrice = 3200000; fabricatedSiteId = 'qto.material.keyword-branch'; }
          else if (m.name.includes('Paku')) { defaultPrice = 22000; fabricatedSiteId = 'qto.material.keyword-branch'; }
          else if (m.name.includes('Minyak')) { defaultPrice = 18000; fabricatedSiteId = 'qto.material.keyword-branch'; }
          else if (m.name.includes('Semen')) { defaultPrice = 72000; fabricatedSiteId = 'qto.material.keyword-branch'; }
          else if (m.name.includes('Pasir beton') || m.name.includes('Pasir pasang')) { defaultPrice = 320000; fabricatedSiteId = 'qto.material.keyword-branch'; }
          else if (m.name.includes('Batu split')) { defaultPrice = 360000; fabricatedSiteId = 'qto.material.keyword-branch'; }
          else if (m.name.includes('Air')) { defaultPrice = 120; fabricatedSiteId = 'qto.material.keyword-branch'; }
          else if (m.name.includes('Bata Ringan')) { defaultPrice = 750000; fabricatedSiteId = 'qto.material.keyword-branch'; }
          else if (m.name.includes('Batu Belah')) { defaultPrice = 295000; fabricatedSiteId = 'qto.material.keyword-branch'; }
          // Civil & Infrastructure keywords (SDA SE DJBK No. 47 / Bina Marga 2026)
          else if (m.name.includes('Pintu') && (m.name.includes('Baja') || m.name.includes('Penguras') || m.name.includes('Bilas') || m.name.includes('Air'))) {
            defaultPrice = 38500000; // Standar Lampiran IV SE DJBK No. 47 Tahun 2026 (SDA-MASTER-1396)
          }
          else if (m.name.includes('Girder')) { defaultPrice = 45000000; }
          else if (m.name.includes('Sheet Pile') || m.name.includes('CCSP')) { defaultPrice = 2850000; }
          else if (m.name.includes('Bearing Pad')) { defaultPrice = 2500000; }
          else if (m.name.includes('Expansion Joint')) { defaultPrice = 1850000; }
          else if (m.name.includes('U-Ditch')) { defaultPrice = 850000; }
          else if (m.name.includes('Box Culvert')) { defaultPrice = 2200000; }
          else if (m.name.includes('Bronjong')) { defaultPrice = 185000; }
          else if (m.name.includes('Pasangan Batu') || m.name.includes('Batu Kali')) { defaultPrice = 850000; }
          else if (m.name.includes('Beton') && (m.name.includes('K-350') || m.name.includes('fc 30') || m.name.includes('30 MPa'))) { defaultPrice = 1450000; }
          else if (m.name.includes('Beton') && m.name.includes('K-300')) { defaultPrice = 1350000; }
          else if (m.name.includes('Beton') && m.name.includes('K-250')) { defaultPrice = 1250000; }
          else if (m.name.includes('Beton') && (m.name.includes('K-225') || m.name.includes('Siklop'))) { defaultPrice = 1150000; }
          else if (m.name.includes('Bekisting')) { defaultPrice = 185000; }
          else if (m.name.includes('Timbunan') || m.name.includes('Urug')) { defaultPrice = 125000; }
          else if (m.name.includes('Galian') || m.name.includes('Dredging')) { defaultPrice = 85000; }
          else if (m.name.includes('Tiang Pancang') || m.name.includes('Bored Pile')) { defaultPrice = 1200000; }
          else if (m.name.includes('Pipa') || m.name.includes('Pipe')) { defaultPrice = 450000; }
          else if (m.name.includes('Geomembran')) { defaultPrice = 85000; }
          else if (m.name.includes('Waterproofing')) { defaultPrice = 95000; }
          else if (m.name.includes('Riprap') || m.name.includes('Armor')) { defaultPrice = 380000; }
          else if (m.name.includes('Manhole')) { defaultPrice = 1250000; }
          else if (m.name.includes('Cover Plat') || m.name.includes('Cover Manhole')) { defaultPrice = 350000; }
          else if (m.name.includes('Plesteran') || m.name.includes('Siar')) { defaultPrice = 48000; }
          else if (m.name.includes('Tangki')) { defaultPrice = 15000000; }
          else { defaultPrice = 50000; fabricatedSiteId = 'qto.material.last-resort'; }
        }
      }

      const unitPrice = priceOverrides[`mat_${m.name}`] ?? defaultPrice;
      if (fabricatedSiteId && priceOverrides[`mat_${m.name}`] === undefined) {
        // PHASE 1 telemetry: price came from a hardcoded constant, not from a price source.
        recordFabricatedTotal(
          fabricatedSiteId,
          SafeDecimalEngine.safeMultiply(m.quantity, unitPrice),
          {
            constant: unitPrice,
            quantity: m.quantity,
            unit: m.unit,
            itemName: m.name,
            calculatorId: selectedCalcId,
            calculatorTitle: activeSpec.title,
          },
        );
      }
      const totalCost = SafeDecimalEngine.safeMultiply(m.quantity, unitPrice);
      // PHASE 1 step 1.1: provenance marker only. `unitPrice` itself is unchanged.
      const materialPriceSource: CostPriceSourceKind =
        priceOverrides[`mat_${m.name}`] !== undefined ? 'OVERRIDE'
          : m.unitPriceEstimate ? 'CALCULATOR_ESTIMATE'
            : match ? 'MASTER_DB'
              : fabricatedSiteId ? 'FABRICATED'
                : 'CALCULATOR_ESTIMATE';
      return {
        key: `mat_${m.name}`,
        uraian: m.name,
        volume: m.quantity,
        satuan: m.unit,
        hargaSatuan: unitPrice,
        jumlahHarga: totalCost,
        isOverridden: priceOverrides[`mat_${m.name}`] !== undefined,
        priceSource: materialPriceSource,
      };
    });
    const subtotalMaterials = materialRows.reduce((acc, row) => acc + row.jumlahHarga, 0);

    // 3. Peralatan
    const hasDeclaredEquipment = Array.isArray(calculationResult.equipment) && calculationResult.equipment.length > 0;
    if (!hasDeclaredEquipment) {
      // PHASE 1 telemetry: an empty equipment list is silently replaced by one paid line item.
      recordFabricatedTotal('qto.equipment.implicit-default', 45000, {
        constant: 45000,
        quantity: 1,
        unit: 'ls',
        itemName: 'Alat Bantu Konstruksi & Pengadukan',
        calculatorId: selectedCalcId,
        calculatorTitle: activeSpec.title,
      });
    }
    const equipmentRows: QtoPriceRow[] = (calculationResult.equipment || [
      { name: 'Alat Bantu Konstruksi & Pengadukan', quantity: 1, unit: 'ls', unitPriceEstimate: 45000 },
    ]).map((eq) => {
      let defaultPrice = 0;
      const match = MASTER_PRICE_ITEMS.find(p => p.category === 'EQUIPMENT' && p.name.toLowerCase().includes(eq.name.toLowerCase()));
      if (match) {
        defaultPrice = match.price;
      } else {
        defaultPrice = eq.unitPriceEstimate || 45000;
        if (!eq.unitPriceEstimate && priceOverrides[`eq_${eq.name}`] === undefined) {
          recordFabricatedTotal(
            'qto.equipment.last-resort',
            SafeDecimalEngine.safeMultiply(eq.quantity, defaultPrice),
            {
              constant: defaultPrice,
              quantity: eq.quantity,
              unit: eq.unit,
              itemName: eq.name,
              calculatorId: selectedCalcId,
              calculatorTitle: activeSpec.title,
            },
          );
        }
      }
      const unitPrice = priceOverrides[`eq_${eq.name}`] ?? defaultPrice;
      const totalCost = SafeDecimalEngine.safeMultiply(eq.quantity, unitPrice);
      // PHASE 1 step 1.1: provenance marker only. `unitPrice` itself is unchanged.
      const equipmentPriceSource: CostPriceSourceKind =
        priceOverrides[`eq_${eq.name}`] !== undefined ? 'OVERRIDE'
          : match ? 'MASTER_DB'
            : !hasDeclaredEquipment ? 'FABRICATED'
              : eq.unitPriceEstimate ? 'CALCULATOR_ESTIMATE'
                : 'FABRICATED';
      return {
        key: `eq_${eq.name}`,
        uraian: eq.name,
        volume: eq.quantity,
        satuan: eq.unit,
        hargaSatuan: unitPrice,
        jumlahHarga: totalCost,
        isOverridden: priceOverrides[`eq_${eq.name}`] !== undefined,
        priceSource: equipmentPriceSource,
      };
    });
    const subtotalEquipment = equipmentRows.reduce((acc, row) => acc + row.jumlahHarga, 0);

    let finalLaborRows = [...laborRows];
    let finalSubtotalLabor = subtotalLabor;
    let finalGrandTotal = subtotalLabor + subtotalMaterials + subtotalEquipment;

    if (finalGrandTotal === 0 && calculationResult.primaryQuantity > 0) {
      const calcName = (activeSpec.title || '').toLowerCase();
      let fallbackUnitPrice = 150000;
      
      if (calcName.includes('galian') || calcName.includes('cut')) fallbackUnitPrice = 85000;
      else if (calcName.includes('urugan') || calcName.includes('fill')) fallbackUnitPrice = 120000;
      else if (calcName.includes('beton') || calcName.includes('cor') || calcName.includes('lantai kerja')) fallbackUnitPrice = 1200000;
      else if (calcName.includes('besi') || calcName.includes('tulangan')) fallbackUnitPrice = 18000;
      else if (calcName.includes('bekisting')) fallbackUnitPrice = 175000;
      else if (calcName.includes('pondasi') || calcName.includes('pasangan') || calcName.includes('bata')) fallbackUnitPrice = 145000;
      else if (calcName.includes('plesteran') || calcName.includes('acian')) fallbackUnitPrice = 65000;
      else if (calcName.includes('atap') || calcName.includes('baja')) fallbackUnitPrice = 250000;
      else if (calcName.includes('plafond') || calcName.includes('plafon')) fallbackUnitPrice = 135000;
      else if (calcName.includes('keramik') || calcName.includes('lantai')) fallbackUnitPrice = 220000;
      else if (calcName.includes('pengecatan') || calcName.includes('cat')) fallbackUnitPrice = 45000;
      else if (calcName.includes('pintu') || calcName.includes('jendela')) fallbackUnitPrice = 3500000;
      else if (calcName.includes('sanitasi') || calcName.includes('pipa') || calcName.includes('drainase')) fallbackUnitPrice = 250000;
      else if (calcName.includes('listrik') || calcName.includes('kabel')) fallbackUnitPrice = 350000;
      else if (calcName.includes('jalan') || calcName.includes('paving')) fallbackUnitPrice = 185000;

      const totalCost = SafeDecimalEngine.safeMultiply(calculationResult.primaryQuantity, fallbackUnitPrice);

      // PHASE 1 telemetry: the unit price was chosen from a keyword in the calculator TITLE.
      recordFabricatedTotal('qto.borongan.title-keyword', totalCost, {
        constant: fallbackUnitPrice,
        quantity: calculationResult.primaryQuantity,
        unit: calculationResult.primaryUnit,
        itemName: activeSpec.title || '',
        calculatorId: selectedCalcId,
        calculatorTitle: activeSpec.title,
      });

      finalLaborRows = [{
        key: 'borongan_ahsp',
        uraian: `Borongan ${activeSpec.title || ''} (Estimasi AHSP)`,
        volume: calculationResult.primaryQuantity,
        satuan: calculationResult.primaryUnit,
        hargaSatuan: fallbackUnitPrice,
        jumlahHarga: totalCost,
        isOverridden: false,
        priceSource: 'FABRICATED' as CostPriceSourceKind,
      }];
      finalSubtotalLabor = totalCost;
      finalGrandTotal = totalCost;
    }

    // PHASE 1 step 1.1: expose completeness without altering any number.
    // This is what lets the UI say "REFERENCE ESTIMATE" instead of silently showing a total.
    type PricedRow = { hargaSatuan?: number; priceSource?: CostPriceSourceKind };
    const allDisplayedRows: PricedRow[] = [
      ...(finalLaborRows as PricedRow[]),
      ...(materialRows as PricedRow[]),
      ...(equipmentRows as PricedRow[]),
    ];
    const fabricatedRowCount = allDisplayedRows.filter((r) => r.priceSource === 'FABRICATED').length;
    const estimatedRowCount = allDisplayedRows.filter((r) => r.priceSource === 'CALCULATOR_ESTIMATE').length;
    const unresolvedRowCount = allDisplayedRows.filter((r) => !r.hargaSatuan || r.hargaSatuan <= 0).length;
    const priceStatus: CostPriceStatus =
      unresolvedRowCount > 0 ? 'INCOMPLETE'
        : fabricatedRowCount > 0 || estimatedRowCount > 0 ? 'REFERENCE_ESTIMATE'
          : 'RESOLVED';

    return {
      laborRows: finalLaborRows,
      subtotalLabor: finalSubtotalLabor,
      materialRows,
      subtotalMaterials,
      equipmentRows,
      subtotalEquipment,
      grandTotal: finalGrandTotal,
      priceStatus,
      fabricatedRowCount,
      estimatedRowCount,
      unresolvedRowCount,
    };
  }, [calculationResult, priceOverrides, activeSpec, selectedCalcId]);

  // Export to Excel / CSV
  const handleExportExcel = () => {
    const rows = [
      ['EZRAB — VOLUME CALCULATOR & AHSP CALCULATION SHEET'],
      [`Proyek: ${currentProject?.name || 'Proyek EZRAB'}`],
      [`Modul: ${activeSpec.title} (${activeSpec.excelSheetName})`],
      [`Tanggal: ${new Date().toLocaleDateString('id-ID')}`],
      [''],
      ['4.1 DIMENSI UTAMA (INPUT PARAMETERS)'],
      ['Parameter', 'Simbol', 'Nilai', 'Satuan'],
      ...activeSpec.parameters.map((p) => [p.label, p.id, inputs[p.id] ?? p.defaultValue, p.unit]),
      [''],
      ['4.2 VOLUME (INTERMEDIATE CALCULATIONS)'],
      ['Uraian Hasil Antara', 'Nilai', 'Satuan'],
      ...Object.entries(calculationResult.breakdown).map(([k, v]) => [k, v, '']),
      [''],
      ['4.3 RESULT & REKAPITULASI BIAYA (AHSP S.E. BINA KONSTRUKSI 2025/2026)'],
      ['Kategori', 'Uraian', 'Volume', 'Satuan', 'Harga Satuan (Rp)', 'Jumlah Harga (Rp)'],
      ...priceBreakdown.laborRows.map((r) => ['TENAGA KERJA', r.uraian, r.volume, r.satuan, r.hargaSatuan, r.jumlahHarga]),
      ['', 'SUBTOTAL TENAGA KERJA', '', '', '', priceBreakdown.subtotalLabor],
      ...priceBreakdown.materialRows.map((r) => ['BAHAN', r.uraian, r.volume, r.satuan, r.hargaSatuan, r.jumlahHarga]),
      ['', 'SUBTOTAL BAHAN', '', '', '', priceBreakdown.subtotalMaterials],
      ...priceBreakdown.equipmentRows.map((r) => ['PERALATAN', r.uraian, r.volume, r.satuan, r.hargaSatuan, r.jumlahHarga]),
      ['', 'SUBTOTAL PERALATAN', '', '', '', priceBreakdown.subtotalEquipment],
      ['', 'TOTAL BIAYA PEKERJAAN', '', '', '', priceBreakdown.grandTotal],
    ];

    const csvContent = rows.map((e) => e.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `EZRAB_VC_${activeSpec.shortName.replace(/\s+/g, '_')}_${effectiveProject?.name?.replace(/\s+/g, '_') || 'PROYEK'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('File kalkulasi Volume Calculator berhasil diexport!');
  };

  // Empty State if No Project Available
  if (!effectiveProject) {
    return (
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '48px 24px',
          textAlign: 'center',
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: '#EFF6FF',
            border: '1px solid #DBEAFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: '#2563EB',
          }}
        >
          <Ruler size={32} />
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
          Belum ada proyek aktif
        </h2>
        <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '460px', margin: '0 auto 24px', lineHeight: 1.6 }}>
          Volume Calculator EZRAB beroperasi secara terintegrasi dengan database proyek. Setiap hasil kalkulasi menghasilkan snapshot CalculationRun yang terhubung langsung ke QTO dan Spreadsheet RAB.
        </p>
        <button
          onClick={() => onNavigateToTab?.('proyek')}
          style={{
            height: '42px',
            padding: '0 20px',
            borderRadius: '10px',
            background: '#2563EB',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
          }}
        >
          <FolderPlus size={16} />
          <span>Pilih / Buat Proyek</span>
        </button>
      </div>
    );
  }

  // Render Diagram Component
  const renderDiagram = () => {
    switch (selectedCalcId) {
      case 'BOWPLANK':
        return <BowplankDiagram activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'PONDASI':
        return <PondasiDiagram activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'FOOT_PLATE':
        return <FootPlateDiagram activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'SLOOF':
      case 'BALOK':
        return <SloofDiagram activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'BAJA_WF':
        return <BajaWfDiagram activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'KOLOM':
        return <KolomDiagram activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'BATA_RINGAN':
        return <DindingDiagram type="hebel" activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'BATA_MERAH':
        return <DindingDiagram type="merah" activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'BATAKO':
        return <DindingDiagram type="batako" activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'ATAP_BAJA_RINGAN':
        return <AtapBajaRinganDiagram activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'PINTU_JENDELA':
        return <FinishingDiagram title={activeSpec.title} category="kusen" activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'PLESTERAN_ACIAN':
        return <FinishingDiagram title={activeSpec.title} category="plesteran" activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'PENUTUP_LANTAI':
      case 'PENUTUP_DINDING':
        return <FinishingDiagram title={activeSpec.title} category="lantai" activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'PLAFON':
        return <FinishingDiagram title={activeSpec.title} category="plafon" activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'PENGECATAN':
        return <FinishingDiagram title={activeSpec.title} category="cat" activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'KELISTRIKAN':
        return <FinishingDiagram title={activeSpec.title} category="listrik" activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'INSTALASI_AIR':
        return <FinishingDiagram title={activeSpec.title} category="pipa" activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      case 'SANITAIR':
        return <FinishingDiagram title={activeSpec.title} category="sanitair" activeParam={activeParam} onSelectParam={(p) => setActiveParam(p)} inputs={inputs} />;
      default:
        return (
          <GenericCalculatorDiagram
            title={activeSpec.title}
            primaryUnit={activeSpec.primaryUnit}
            activeParam={activeParam}
            onSelectParam={(p) => setActiveParam(p)}
            inputs={inputs}
          />
        );
    }
  };

  return (
    <div
      onPaste={handlePasteExcelData}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        right: isFullscreen ? 0 : 'auto',
        bottom: isFullscreen ? 0 : 'auto',
        zIndex: isFullscreen ? 9999 : 'auto',
        background: isFullscreen ? '#F8FAFC' : 'transparent',
        padding: isFullscreen ? '20px' : 0,
        overflowY: isFullscreen ? 'auto' : 'visible',
      }}
    >
      {/* Toast Notification */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: toastMsg.type === 'success' ? '#0F172A' : toastMsg.type === 'warning' ? '#B45309' : '#1E293B',
            color: '#ffffff',
            padding: '14px 22px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            zIndex: 100000,
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          {toastMsg.type === 'success' ? (
            <Check size={18} color="#4ADE80" />
          ) : (
            <AlertCircle size={18} color="#FBBF24" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15,23,42,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '420px',
              width: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}>
                <RefreshCw size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Reset Parameter Kalkulator?
                </h3>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>
                  Perubahan belum disimpan. Seluruh nilai input akan dikembalikan ke nilai default.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setShowResetConfirm(false)}
                style={{
                  height: '36px',
                  padding: '0 16px',
                  borderRadius: '8px',
                  background: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  color: '#475569',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Batal
              </button>
              <button
                onClick={performReset}
                style={{
                  height: '36px',
                  padding: '0 16px',
                  borderRadius: '8px',
                  background: '#EF4444',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Reset Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Diagram */}
      {lightboxOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(11,19,43,0.95)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 100000,
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', color: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Compass size={20} color="#38BDF8" />
              <span style={{ fontSize: '15px', fontWeight: 800 }}>
                Gambar Teknik CAD: {activeSpec.title} ({activeSpec.excelSheetName})
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
                style={{ background: '#1E293B', color: '#ffffff', border: '1px solid #334155', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                title="Zoom In"
              >
                <ZoomIn size={16} />
              </button>
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                style={{ background: '#1E293B', color: '#ffffff', border: '1px solid #334155', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                title="Zoom Out"
              >
                <ZoomOut size={16} />
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                style={{ background: '#1E293B', color: '#ffffff', border: '1px solid #334155', borderRadius: '8px', padding: '0 12px', height: '36px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Reset Zoom ({Math.round(zoomLevel * 100)}%)
              </button>
              <button
                onClick={() => setLightboxOpen(false)}
                style={{ background: '#EF4444', color: '#ffffff', border: 'none', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: '8px' }}
                title="Tutup"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <div style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.15s ease', maxWidth: '90%', maxHeight: '90%' }}>
              {renderDiagram()}
            </div>
          </div>
        </div>
      )}

      {/* 1. PROFESSIONAL CAD / QUANTITY SURVEYOR WORKSTATION HEADER (70-80px) */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: '#0F172A',
              color: '#38BDF8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #1E293B',
              flexShrink: 0,
            }}
          >
            <Calculator size={20} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>
                Volume Calculator
              </h1>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  background: '#EFF6FF',
                  color: '#2563EB',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  border: '1px solid #DBEAFE',
                }}
              >
                QTO WORKSTATION
              </span>
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>•</span>
              <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500 }}>
                {domainCounts.ALL} Kalkulator / 10 Domain
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0', lineHeight: 1.3 }}>
              QTO • Hitung volume pekerjaan konstruksi dengan cepat, presisi dan terstandarisasi SNI.
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => onNavigateToTab?.('qto')}
            style={{
              height: '34px',
              padding: '0 12px',
              borderRadius: '7px',
              background: '#F8FAFC',
              border: '1px solid #CBD5E1',
              color: '#334155',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.12s ease',
            }}
          >
            <ArrowLeft size={13} />
            <span>← Kembali</span>
          </button>

          <button
            onClick={handleResetClick}
            style={{
              height: '34px',
              padding: '0 12px',
              borderRadius: '7px',
              background: '#ffffff',
              border: '1px solid #CBD5E1',
              color: hasUnsavedChanges ? '#D97706' : '#64748B',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
            title="Reset parameter kalkulator aktif ke nilai standar"
          >
            <RefreshCw size={12} />
            <span>Reset {hasUnsavedChanges ? '(*)' : ''}</span>
          </button>

          <button
            onClick={handleExportExcel}
            style={{
              height: '34px',
              padding: '0 12px',
              borderRadius: '7px',
              background: '#ffffff',
              border: '1px solid #CBD5E1',
              color: '#059669',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            style={{
              height: '34px',
              padding: '0 9px',
              borderRadius: '7px',
              background: '#F8FAFC',
              border: '1px solid #CBD5E1',
              color: '#475569',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* 2. QUICK ACCESS (TERAKHIR DIGUNAKAN) & FAVORIT BAR */}
      <div
        style={{
          background: '#F8FAFC',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          fontSize: '11.5px',
        }}
      >
        {/* Left: Terakhir Digunakan Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#475569', fontWeight: 700, flexShrink: 0 }}>
            <History size={13} color="#64748B" />
            <span>Terakhir digunakan:</span>
          </div>

          {recentIds.length === 0 ? (
            <span style={{ color: '#94A3B8', fontStyle: 'italic', fontSize: '11px' }}>
              Belum ada kalkulator terakhir digunakan
            </span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {recentIds.map((id) => {
                const spec = getCalculatorById(id);
                const title = spec?.shortName || spec?.title || id;
                const isSelected = selectedCalcId === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleSelectCalculator(id)}
                    style={{
                      height: '24px',
                      padding: '0 8px',
                      borderRadius: '5px',
                      background: isSelected ? '#EFF6FF' : '#ffffff',
                      border: isSelected ? '1px solid #2563EB' : '1px solid #CBD5E1',
                      color: isSelected ? '#1D4ED8' : '#334155',
                      fontSize: '11px',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.1s ease',
                    }}
                    title={`Pilih kalkulator ${title}`}
                  >
                    <span>{title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Starred Favorite Quick Filter Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={() => setFilterFavoritesOnly((prev) => !prev)}
            style={{
              height: '24px',
              padding: '0 9px',
              borderRadius: '5px',
              background: filterFavoritesOnly ? '#FEF3C7' : '#ffffff',
              border: filterFavoritesOnly ? '1px solid #F59E0B' : '1px solid #CBD5E1',
              color: filterFavoritesOnly ? '#B45309' : '#475569',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.12s ease',
            }}
            title="Filter daftar hanya kalkulator berbintang (favorit)"
          >
            <Star size={11} fill={filterFavoritesOnly ? '#F59E0B' : 'none'} color={filterFavoritesOnly ? '#F59E0B' : '#64748B'} />
            <span>Favorit ({favoriteIds.length})</span>
          </button>
        </div>
      </div>

      {/* 3. DOMAIN NAVIGATION BAR (COMPACT HORIZONTAL PILLS - 10 DOMAINS + SEMUA) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          overflowX: 'auto',
          paddingBottom: '2px',
          scrollbarWidth: 'none',
        }}
      >
        {/* Semua Domain Pill */}
        <button
          onClick={() => setActiveDomain('ALL')}
          style={{
            height: '34px',
            padding: '0 12px',
            borderRadius: '8px',
            background: activeDomain === 'ALL' ? '#EFF6FF' : '#ffffff',
            border: activeDomain === 'ALL' ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
            color: activeDomain === 'ALL' ? '#1D4ED8' : '#334155',
            fontSize: '12px',
            fontWeight: activeDomain === 'ALL' ? 700 : 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'all 0.12s ease',
          }}
        >
          <span>🌐</span>
          <span>Semua Domain</span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              background: activeDomain === 'ALL' ? '#2563EB' : '#F1F5F9',
              color: activeDomain === 'ALL' ? '#ffffff' : '#64748B',
              padding: '1px 5px',
              borderRadius: '999px',
            }}
          >
            {domainCounts.ALL}
          </span>
        </button>

        {/* 10 Civil Domain Pills */}
        {CIVIL_DOMAINS.map((domain) => {
          const isActive = activeDomain === domain.id;
          const count = domainCounts[domain.id] || 0;
          return (
            <button
              key={domain.id}
              onClick={() => setActiveDomain(domain.id)}
              style={{
                height: '34px',
                padding: '0 12px',
                borderRadius: '8px',
                background: isActive ? '#EFF6FF' : '#ffffff',
                border: isActive ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                color: isActive ? '#1D4ED8' : '#334155',
                fontSize: '12px',
                fontWeight: isActive ? 700 : 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.12s ease',
              }}
            >
              <span>{domain.icon}</span>
              <span>{domain.name}</span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  background: isActive ? '#2563EB' : '#F1F5F9',
                  color: isActive ? '#ffffff' : '#64748B',
                  padding: '1px 5px',
                  borderRadius: '999px',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 4. WORKSTATION SPLIT VIEW (LEFT: CATALOG TREE, RIGHT: ACTIVE WORKBENCH) */}
      <div className="ezrab-workstation-split">
        {/* =========================================================================
            LEFT COLUMN: CALCULATOR CATALOG & REALTIME FILTER PANE
           ========================================================================= */}
        <div className="ezrab-workstation-sidebar">
          {/* Top Controls: Search + Category/Unit Filters + Status & Expand/Collapse */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Search Bar */}
            <div style={{ position: 'relative', width: '100%' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94A3B8',
                }}
              />
              <label
                htmlFor="volume-calculator-search"
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: 'hidden',
                  clip: 'rect(0, 0, 0, 0)',
                  whiteSpace: 'nowrap',
                  border: 0,
                }}
              >
                Cari kalkulator
              </label>
              <input
                id="volume-calculator-search"
                type="text"
                placeholder="Cari kalkulator (nama, kode, kelompok)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '34px',
                  paddingLeft: '32px',
                  paddingRight: searchQuery ? '30px' : '10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  background: '#F8FAFC',
                  color: '#0F172A',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Hapus pencarian"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Compact Filters Row: Category & Unit Dropdowns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {/* Category Dropdown */}
              <div>
                <label htmlFor="filter-work-category" style={{ display: 'none' }}>Kelompok Pekerjaan</label>
                <select
                  id="filter-work-category"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  style={{
                    width: '100%',
                    height: '28px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    background: '#F8FAFC',
                    fontSize: '11px',
                    color: '#334155',
                    padding: '0 6px',
                    outline: 'none',
                    cursor: 'pointer',
                    fontWeight: filterCategory !== 'ALL' ? 700 : 500,
                  }}
                >
                  <option value="ALL">Semua Kelompok</option>
                  {domainCategoryOptions.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name.replace(/^[A-Z][.]\s*/, '')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Unit Dropdown */}
              <div>
                <label htmlFor="filter-work-unit" style={{ display: 'none' }}>Satuan</label>
                <select
                  id="filter-work-unit"
                  value={filterUnit}
                  onChange={(e) => setFilterUnit(e.target.value)}
                  style={{
                    width: '100%',
                    height: '28px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    background: '#F8FAFC',
                    fontSize: '11px',
                    color: '#334155',
                    padding: '0 6px',
                    outline: 'none',
                    cursor: 'pointer',
                    fontWeight: filterUnit !== 'ALL' ? 700 : 500,
                  }}
                >
                  <option value="ALL">Semua Satuan</option>
                  {availableUnits.map((u) => (
                    <option key={u} value={u}>
                      Satuan: {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter Status, Collapse/Expand All & Reset Action */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', paddingTop: '2px' }}>
              <span>
                Menampilkan <strong>{totalFilteredCount}</strong> dari {domainCounts[activeDomain] || domainCounts.ALL} kalkulator
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={toggleAllCategories}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#475569',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '11px',
                    fontWeight: 600,
                    textDecoration: 'underline',
                  }}
                  title={allCategoriesCollapsed ? 'Buka semua kelompok' : 'Tutup semua kelompok'}
                >
                  {allCategoriesCollapsed ? 'Buka Semua' : 'Tutup Semua'}
                </button>

                {(searchQuery || filterCategory !== 'ALL' || filterUnit !== 'ALL' || filterFavoritesOnly) && (
                  <>
                    <span style={{ color: '#CBD5E1' }}>•</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setFilterCategory('ALL');
                        setFilterUnit('ALL');
                        setFilterFavoritesOnly(false);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563EB',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: '11px',
                        fontWeight: 700,
                        textDecoration: 'underline',
                      }}
                    >
                      Reset
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Grouped Calculator Scrollable Tree */}
          <div className="ezrab-workstation-scrollable">
            {groupedCalculators.length === 0 ? (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  background: '#F8FAFC',
                  borderRadius: '8px',
                  border: '1px dashed #CBD5E1',
                  flexShrink: 0,
                }}
              >
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#334155', margin: '0 0 6px' }}>
                  Tidak ada kalkulator yang cocok.
                </p>
                <div style={{ fontSize: '11px', color: '#64748B', textAlign: 'left', display: 'inline-block', lineHeight: 1.6 }}>
                  Coba:
                  <ul style={{ margin: '4px 0 10px 16px', padding: 0 }}>
                    <li>Gunakan kata kunci pencarian yang lebih umum</li>
                    <li>Pilih domain yang berbeda</li>
                    <li>Hapus filter satuan atau kategori</li>
                  </ul>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setFilterCategory('ALL');
                      setFilterUnit('ALL');
                      setFilterFavoritesOnly(false);
                    }}
                    style={{
                      height: '28px',
                      padding: '0 12px',
                      borderRadius: '6px',
                      background: '#2563EB',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Reset Semua Filter
                  </button>
                </div>
              </div>
            ) : (
              groupedCalculators.map((group) => {
                const isCollapsed = !!collapsedCategories[group.id];
                return (
                  <div
                    key={group.id}
                    className="ezrab-calc-group-card"
                    style={{
                      flexShrink: 0,
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: '#ffffff',
                    }}
                  >
                    {/* Collapsible Section Header */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleCategoryCollapse(group.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') toggleCategoryCollapse(group.id);
                      }}
                      style={{
                        padding: '8px 10px',
                        background: '#F8FAFC',
                        borderBottom: isCollapsed ? 'none' : '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px' }}>{group.icon}</span>
                        <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                          {group.name.replace(/^[A-Z][.]\s*/, '')}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            background: '#E2E8F0',
                            color: '#475569',
                            padding: '1px 6px',
                            borderRadius: '999px',
                          }}
                        >
                          {group.items.length}
                        </span>
                        {isCollapsed ? <ChevronDown size={14} color="#64748B" /> : <ChevronUp size={14} color="#64748B" />}
                      </div>
                    </div>

                    {/* Category Items List */}
                    {!isCollapsed && (
                      <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
                        {group.items.map((item) => {
                          const isSelected = selectedCalcId === item.id;
                          return (
                            <div
                              key={item.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleSelectCalculator(item.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') handleSelectCalculator(item.id);
                              }}
                              className={`ezrab-calc-compact-row ${isSelected ? 'active' : ''}`}
                              style={{
                                flexShrink: 0,
                                background: isSelected ? '#EFF6FF' : '#ffffff',
                                border: isSelected ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                                borderLeft: isSelected ? '3.5px solid #2563EB' : '1px solid #E2E8F0',
                              }}
                            >
                              {/* Left Info: Star + Name + Description */}
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0, flex: 1, paddingRight: '8px' }}>
                                <button
                                  type="button"
                                  onClick={(e) => toggleFavorite(item.id, e)}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '2px 0 0',
                                    color: item.isFavorite ? '#F59E0B' : '#CBD5E1',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}
                                  title={item.isFavorite ? 'Hapus dari favorit' : 'Tambahkan ke favorit'}
                                >
                                  <Star size={13} fill={item.isFavorite ? '#F59E0B' : 'none'} />
                                </button>

                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: isSelected ? 800 : 700, color: isSelected ? '#1D4ED8' : '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {item.name}
                                    </span>
                                  </div>
                                  <p
                                    style={{
                                      fontSize: '10.5px',
                                      color: '#64748B',
                                      margin: '1px 0 0',
                                      lineHeight: 1.3,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {item.shortDesc}
                                  </p>
                                </div>
                              </div>

                              {/* Right Badges: Unit + Action */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                <span
                                  style={{
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    color: '#475569',
                                    background: '#F1F5F9',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    border: '1px solid #E2E8F0',
                                  }}
                                >
                                  {item.primaryUnit}
                                </span>
                                <span style={{ color: isSelected ? '#2563EB' : '#CBD5E1', display: 'flex', alignItems: 'center' }}>
                                  <ChevronRight size={14} />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Sidebar Bottom Standard Indicator */}
          <div
            style={{
              flexShrink: 0,
              paddingTop: '8px',
              borderTop: '1px solid #F1F5F9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '10.5px',
              color: '#94A3B8',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
              Standar PUPR 2026 & SNI
            </span>
            <span>Deterministic QTO</span>
          </div>
        </div>

        {/* =========================================================================
            RIGHT COLUMN: ACTIVE CALCULATOR WORKBENCH (FULL WORKING ENGINE)
           ========================================================================= */}
        <div
          id="active-calculator-workbench"
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          {/* Workbench Header */}
          <div
            style={{
              borderBottom: '1px solid #F1F5F9',
              paddingBottom: '14px',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 800, background: '#0F172A', color: '#ffffff', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                  {(activeSpec as any)?.code || selectedCalcId}
                </span>
                <span style={{ fontSize: '11px', background: '#EFF6FF', color: '#1D4ED8', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, border: '1px solid #DBEAFE' }}>
                  {activeSpec.category}
                </span>
                <span style={{ fontSize: '10.5px', color: '#15803D', background: '#DCFCE7', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={12} /> SNI-STANDARDIZED
                </span>
              </div>

              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {activeSpec.title}
              </h2>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0', lineHeight: 1.4 }}>
                {activeSpec.description}
              </p>
            </div>

            {/* Top Workbench Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={(e) => toggleFavorite(selectedCalcId, e)}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  background: favoriteIds.includes(selectedCalcId) ? '#FEF3C7' : '#ffffff',
                  border: favoriteIds.includes(selectedCalcId) ? '1px solid #F59E0B' : '1px solid #CBD5E1',
                  color: favoriteIds.includes(selectedCalcId) ? '#B45309' : '#475569',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Star size={12} fill={favoriteIds.includes(selectedCalcId) ? '#F59E0B' : 'none'} color={favoriteIds.includes(selectedCalcId) ? '#F59E0B' : '#64748B'} />
                <span>{favoriteIds.includes(selectedCalcId) ? 'Favorit' : 'Bintang'}</span>
              </button>

              <button
                onClick={() => setShowCadDiagram((v) => !v)}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  background: showCadDiagram ? '#EFF6FF' : '#ffffff',
                  border: showCadDiagram ? '1px solid #2563EB' : '1px solid #CBD5E1',
                  color: showCadDiagram ? '#1D4ED8' : '#475569',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Tampilkan / sembunyikan gambar teknik CAD"
              >
                <Compass size={13} />
                <span>Gambar CAD ({showCadDiagram ? 'Tutup' : 'Buka'})</span>
              </button>

              <button
                onClick={handleResetClick}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  background: '#ffffff',
                  border: '1px solid #CBD5E1',
                  color: '#475569',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Reset parameter kalkulator aktif"
              >
                <RefreshCw size={12} />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Technical CAD Diagram Viewer (Collapsible) */}
          {showCadDiagram && (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
              <TechnicalReferenceViewer
                workId={selectedCalcId}
                categoryName={activeSpec.category}
                workName={activeSpec.title}
                renderCadDiagram={renderDiagram}
                activeParamLabel={activeSpec.parameters.find((p) => p.id === activeParam)?.label}
              />
            </div>
          )}

          {/* Two-Column Grid: Left Inputs / Right Results & Actions */}
          <div className="ezrab-volume-bottom-grid">
            {/* COLUMN 1: FORMULIR PARAMETER GEOMETRIS */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Formulir Parameter Geometris
                </span>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                  {activeSpec.parameters.length} Parameter
                </span>
              </div>

              {/* Parameter Input Cells */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {activeSpec.parameters.map((param) => {
                  const isFocused = activeParam === param.id;
                  const currentVal = inputs[param.id] ?? param.defaultValue;
                  const isInvalid = currentVal < (param.min ?? 0);

                  return (
                    <div
                      key={param.id}
                      onClick={() => setActiveParam(param.id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) 100px 38px',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: isFocused ? '#EFF6FF' : '#ffffff',
                        border: isInvalid
                          ? '1px solid #EF4444'
                          : isFocused
                          ? '1.5px solid #2563EB'
                          : '1px solid #E2E8F0',
                        transition: 'all 0.1s ease',
                      }}
                    >
                      <div style={{ minWidth: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '10.5px',
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              background: isFocused ? '#DBEAFE' : '#F1F5F9',
                              color: isFocused ? '#1D4ED8' : '#64748B',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              flexShrink: 0,
                            }}
                          >
                            {param.id}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: isFocused ? 700 : 600, color: isFocused ? '#1D4ED8' : '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {param.label}
                          </span>
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {param.description}
                        </div>
                      </div>

                      <div>
                        <input
                          type="number"
                          inputMode="decimal"
                          step={param.step || 0.1}
                          min={param.min || 0}
                          max={param.max || 10000}
                          value={currentVal}
                          onChange={(e) => handleInputChange(param.id, parseFloat(e.target.value))}
                          onFocus={() => setActiveParam(param.id)}
                          style={{
                            width: '100%',
                            height: '32px',
                            background: isFocused ? '#ffffff' : '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '5px',
                            padding: '0 8px',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            fontFamily: 'monospace, "Courier New", sans-serif',
                            textAlign: 'right',
                            color: '#0F172A',
                            outline: 'none',
                            boxSizing: 'border-box',
                            boxShadow: isFocused ? '0 0 0 2px rgba(37,99,235,0.2)' : 'none',
                          }}
                        />
                      </div>

                      <div style={{ textAlign: 'left' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>
                          {param.unit}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Engineering Tip */}
              <div
                style={{
                  background: '#F8FAFC',
                  borderRadius: '6px',
                  border: '1px dashed #CBD5E1',
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  color: '#64748B',
                }}
              >
                <ClipboardCheck size={14} color="#2563EB" style={{ flexShrink: 0 }} />
                <span>Tekan <strong>Tab</strong> untuk navigasi antar sel. Mendukung copy-paste angka dari tabel Excel.</span>
              </div>
            </div>

            {/* COLUMN 2: HASIL VOLUME & ESTIMASI BIAYA PEKERJAAN */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {/* PRIMARY VOLUME RESULT BOX */}
              <div
                style={{
                  background: '#0F172A',
                  borderRadius: '10px',
                  padding: '14px 18px',
                  color: '#ffffff',
                  border: '1px solid #1E293B',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {activeSpec.primaryQuantityLabel}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#4ADE80', background: 'rgba(74,222,128,0.15)', padding: '1px 6px', borderRadius: '4px' }}>
                    ✓ DETERMINISTIC
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '30px', fontWeight: 800, fontFamily: 'monospace', color: '#38BDF8', letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {formatNumberId(calculationResult.primaryQuantity, 2)}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#E2E8F0' }}>
                    {calculationResult.primaryUnit}
                  </span>
                </div>

                <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#94A3B8' }}>
                  <span>Rumus Dasar:</span>
                  <span style={{ color: '#E2E8F0', fontFamily: 'monospace', fontWeight: 600 }}>
                    {activeSpec.excelSheetName || 'SNI-AHSP Formulation'}
                  </span>
                </div>
              </div>

              {/* Intermediate Breakdown Table */}
              {Object.keys(calculationResult.breakdown).length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '6px' }}>
                    Rincian Volume Teknis
                  </div>
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                          <th style={{ padding: '6px 8px' }}>Uraian Hasil Antara</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Nilai</th>
                          <th style={{ padding: '6px 8px', width: '40px' }}>Sat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(calculationResult.breakdown).map(([key, val], idx) => {
                          const label = key
                            .replace(/([A-Z])/g, ' $1')
                            .replace(/^./, (str) => str.toUpperCase())
                            .replace('Set', ' 1 Set')
                            .replace('M2', ' (m²)')
                            .replace('M3', ' (m³)')
                            .replace('Kg', ' (kg)')
                            .replace('M$', ' (m\')');

                          let unit = '';
                          if (key.toLowerCase().includes('m3') || key.toLowerCase().includes('cor') || key.toLowerCase().includes('galian') || key.toLowerCase().includes('pondasi')) unit = 'm³';
                          else if (key.toLowerCase().includes('m2') || key.toLowerCase().includes('luas') || key.toLowerCase().includes('bekisting') || key.toLowerCase().includes('dinding')) unit = 'm²';
                          else if (key.toLowerCase().includes('kg') || key.toLowerCase().includes('besi') || key.toLowerCase().includes('kawat') || key.toLowerCase().includes('berat')) unit = 'kg';
                          else if (key.toLowerCase().includes('panjang') || key.toLowerCase().includes('keliling') || key.toLowerCase().includes('m')) unit = 'm';
                          else if (key.toLowerCase().includes('jumlah') || key.toLowerCase().includes('batang') || key.toLowerCase().includes('titik') || key.toLowerCase().includes('set')) unit = 'unit';

                          return (
                            <tr
                              key={key}
                              style={{
                                borderBottom: '1px solid #F1F5F9',
                                background: idx % 2 === 0 ? '#ffffff' : '#FAFAFA',
                              }}
                            >
                              <td style={{ padding: '5px 8px', color: '#1E293B', fontWeight: 500 }}>
                                {label}
                              </td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>
                                {typeof val === 'number' ? formatNumberId(val, 2) : val}
                              </td>
                              <td style={{ padding: '5px 8px', color: '#64748B', fontWeight: 600 }}>
                                {unit}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Scope-based Cost Policy Banner (Phase 3 & UI Integration) */}
              {scopeCost.hasMapping && (
                <div
                  style={{
                    background:
                      scopeCost.status === 'RESOLVED' ? '#F0FDF4'
                        : scopeCost.status === 'PRICE_MISSING' || scopeCost.status === 'PARTIAL' ? '#FFFBEB'
                          : scopeCost.status === 'AHSP_MISSING' ? '#FEF2F2'
                            : '#F8FAFC',
                    border:
                      scopeCost.status === 'RESOLVED' ? '1px solid #BBF7D0'
                        : scopeCost.status === 'PRICE_MISSING' || scopeCost.status === 'PARTIAL' ? '1px solid #FDE68A'
                          : scopeCost.status === 'AHSP_MISSING' ? '1px solid #FECACA'
                            : '1px solid #CBD5E1',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color:
                            scopeCost.status === 'RESOLVED' ? '#166534'
                              : scopeCost.status === 'PRICE_MISSING' || scopeCost.status === 'PARTIAL' ? '#92400E'
                                : '#991B1B',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {scopeCost.status === 'RESOLVED' && '✓ BIAYA TEPAT (CostPolicyEngine)'}
                        {(scopeCost.status === 'PRICE_MISSING' || scopeCost.status === 'PARTIAL') && '⚠️ HARGA REGIONAL BELUM TERSEDIA'}
                        {scopeCost.status === 'AHSP_MISSING' && '❌ AHSP BELUM TERDAFTAR'}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 700,
                        background:
                          scopeCost.status === 'RESOLVED' ? '#DCFCE7'
                            : scopeCost.status === 'PRICE_MISSING' || scopeCost.status === 'PARTIAL' ? '#FEF3C7'
                              : '#FEE2E2',
                        color:
                          scopeCost.status === 'RESOLVED' ? '#15803D'
                            : scopeCost.status === 'PRICE_MISSING' || scopeCost.status === 'PARTIAL' ? '#B45309'
                              : '#B91C1C',
                        padding: '1px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      {scopeCost.lineItems.length} Sub-Pekerjaan AHSP
                    </span>
                  </div>

                  {scopeCost.status === 'RESOLVED' && scopeCost.summary && (
                    <div style={{ fontSize: '12px', color: '#1E293B', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748B' }}>Biaya Langsung (Direct Cost):</span>
                        <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{formatRupiah(scopeCost.summary.directCost)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B' }}>
                        <span>Overhead & Keuntungan:</span>
                        <span>{formatRupiah(scopeCost.summary.overheadAmount + scopeCost.summary.profitAmount)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B' }}>
                        <span>PPN (11%):</span>
                        <span>{formatRupiah(scopeCost.summary.taxAmount)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#0F172A', borderTop: '1px solid #E2E8F0', paddingTop: '4px', marginTop: '2px' }}>
                        <span>Grand Total (Resmi):</span>
                        <span style={{ color: '#166534', fontFamily: 'monospace' }}>{formatRupiah(scopeCost.summary.grandTotal)}</span>
                      </div>
                    </div>
                  )}

                  {(scopeCost.status === 'PRICE_MISSING' || scopeCost.status === 'PARTIAL') && (
                    <div style={{ fontSize: '11.5px', color: '#78350F' }}>
                      <p style={{ margin: '0 0 6px 0', lineHeight: 1.4 }}>
                        Struktur pekerjaan dipecah menjadi <strong>{scopeCost.lineItems.length} item AHSP resmi</strong>.
                        Namun data harga HSD (Upah/Bahan/Alat) untuk wilayah <em>{priceContext.location}</em> belum lengkap di database nasional.
                      </p>
                      {scopeCost.missingPrices.length > 0 && (
                        <div style={{ background: '#FEF3C7', padding: '6px 8px', borderRadius: '4px', fontSize: '10.5px' }}>
                          <span style={{ fontWeight: 700 }}>Komponen belum ada harga: </span>
                          <span>
                            {scopeCost.missingPrices.slice(0, 3).map((mp) => `${mp.componentName} (${mp.type})`).join(', ')}
                            {scopeCost.missingPrices.length > 3 ? ` + ${scopeCost.missingPrices.length - 3} lainnya` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {scopeCost.status === 'AHSP_MISSING' && (
                    <div style={{ fontSize: '11.5px', color: '#7F1D1D' }}>
                      Beberapa scope pekerjaan belum memiliki nomor koefisien AHSP resmi pada registri Lampiran II/III/IV.
                    </div>
                  )}
                </div>
              )}

              {/* PHASE 6A: Weir Forensic Cost Summary + Audit Trail */}
              {weirCostResult && (
                <>
                  <WeirCostSummaryPanel result={weirCostResult} />
                  <WeirAuditTrailPanel auditTrail={weirCostResult.auditTrail} />
                </>
              )}

              {/* AHSP Cost Summary Box — hidden for weir.body (replaced by WeirCostSummaryPanel) */}
              {!weirCostResult && (
              <div
                style={{
                  background: '#F8FAFC',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                    {scopeCost.hasMapping && scopeCost.status === 'RESOLVED'
                      ? 'Estimasi Biaya Resmi (CostPolicyEngine)'
                      : 'Estimasi Biaya Referensi (Bina Konstruksi)'}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace', marginTop: '2px' }}>
                    {formatRupiah(scopeCost.hasMapping && scopeCost.summary?.grandTotal ? scopeCost.summary.grandTotal : priceBreakdown.grandTotal)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    background: scopeCost.hasMapping ? '#EFF6FF' : '#DCFCE7',
                    color: scopeCost.hasMapping ? '#1D4ED8' : '#15803D',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 700,
                  }}
                >
                  {scopeCost.hasMapping ? 'Scope-Based AHSP' : 'AHSP 2025/2026'}
                </span>
              </div>
              )}

              {/* Action Buttons: Tambah ke QTO & Tambah ke RAB */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={handleSaveToQTO}
                  disabled={!isCalculationValid}
                  style={{
                    height: '40px',
                    borderRadius: '8px',
                    background: '#2563EB',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: isCalculationValid ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(37,99,235,0.2)',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <Plus size={15} />
                  <span>{editingQtoId ? 'Update Item di QTO' : 'Tambahkan ke QTO'}</span>
                </button>

                <button
                  onClick={handleSyncToRAB}
                  disabled={!isCalculationValid}
                  style={{
                    height: '36px',
                    borderRadius: '8px',
                    background: '#059669',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: isCalculationValid ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <FileSpreadsheet size={14} />
                  <span>Tambahkan & Sinkron ke RAB</span>
                </button>
              </div>

              {/* Collapsible Formula Steps (Audit Calculation) */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                <button
                  onClick={() => setShowFormulaDrawer(!showFormulaDrawer)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: '#F8FAFC',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: '#334155',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calculator size={13} color="#2563EB" />
                    <span>Langkah Formula (Audit Engine)</span>
                  </div>
                  {showFormulaDrawer ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                {showFormulaDrawer && (
                  <div style={{ padding: '10px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid #E2E8F0' }}>
                    {calculationResult.formulaSteps.map((step) => (
                      <div
                        key={step.stepNumber}
                        style={{
                          background: '#F8FAFC',
                          borderRadius: '6px',
                          padding: '6px 8px',
                          border: '1px solid #E2E8F0',
                          fontSize: '11px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1E293B' }}>
                          <span>{step.stepNumber}. {step.description}</span>
                          <span style={{ color: '#2563EB', fontFamily: 'monospace' }}>
                            {formatNumberId(step.calculatedValue, 2)} {step.unit}
                          </span>
                        </div>
                        <div style={{ fontFamily: 'monospace', color: '#64748B', fontSize: '10.5px', marginTop: '2px' }}>
                          = {step.formulaText}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. SAVED QTO PREVIEW TABLE AT BOTTOM */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          marginTop: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Daftar Volume Tersimpan ({effectiveProject.name})
              </h3>
              <span style={{ fontSize: '11px', background: '#EFF6FF', color: '#2563EB', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                {projectQtoItems.length} Item QTO
              </span>
            </div>
            <p style={{ fontSize: '11.5px', color: '#64748B', margin: '2px 0 0' }}>
              Seluruh hasil perhitungan tersimpan dan terhubung langsung ke Master Spreadsheet RAB.
            </p>
          </div>

          <button
            onClick={() => onNavigateToTab?.('qto')}
            style={{
              height: '30px',
              padding: '0 12px',
              borderRadius: '6px',
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              color: '#1D4ED8',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span>Buka di Rekap Volume QTO</span>
            <ArrowRight size={12} />
          </button>
        </div>

        {projectQtoItems.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '12px', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #CBD5E1' }}>
            Belum ada item QTO yang disimpan. Klik <strong>Tambahkan ke QTO</strong> di atas untuk menyimpan volume pekerjaan aktif.
          </div>
        ) : (
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                  <th style={{ padding: '7px 10px', width: '36px' }}>No</th>
                  <th style={{ padding: '7px 10px' }}>Kode & Uraian Pekerjaan</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>Volume QTO</th>
                  <th style={{ padding: '7px 10px', width: '60px' }}>Satuan</th>
                  <th style={{ padding: '7px 10px' }}>Sumber Run</th>
                  <th style={{ padding: '7px 10px' }}>Status RAB</th>
                </tr>
              </thead>
              <tbody>
                {projectQtoItems.map((item, idx) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      background: item.calculatorId === selectedCalcId ? '#EFF6FF' : idx % 2 === 0 ? '#ffffff' : '#FAFAFA',
                    }}
                  >
                    <td style={{ padding: '7px 10px', color: '#64748B', fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ fontWeight: 700, color: '#0F172A' }}>{item.uraian}</span>
                      <span style={{ fontSize: '10.5px', color: '#64748B', marginLeft: '6px', fontFamily: 'monospace' }}>({item.kode})</span>
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#2563EB' }}>
                      {formatNumberId(item.quantity, 2)}
                    </td>
                    <td style={{ padding: '7px 10px', color: '#475569', fontWeight: 600 }}>{item.unit}</td>
                    <td style={{ padding: '7px 10px', fontSize: '10.5px', color: '#64748B' }}>
                      <span style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace' }}>
                        {item.calculationRunId || 'CALC-DIRECT'}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      {item.status === 'SYNCED_TO_RAB' ? (
                        <span style={{ color: '#16A34A', background: '#DCFCE7', padding: '1px 6px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Check size={10} /> Tersinkron RAB
                        </span>
                      ) : (
                        <span style={{ color: '#D97706', background: '#FEF3C7', padding: '1px 6px', borderRadius: '999px', fontSize: '10px', fontWeight: 600 }}>
                          QTO Tersimpan
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
