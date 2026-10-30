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
  Building2,
  DraftingCompass,
  Route,
  Droplets,
  Droplet,
  Waves,
  Sprout,
  Landmark,
  Tractor,
  Wheat,
  CloudRain,
  GlassWater,
  Home,
  BrickWall,
  Mountain,
  type LucideIcon,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { CONSTRUCTION_CALCULATORS, getCalculatorById } from '../../engine/constructionCalculators/registry';
import { MASTER_VOLUME_CALCULATOR_SPEC } from '../../engine/constructionCalculators/masterJsonSpec';
import { getCalculatorIllustration } from './calculatorIllustrations';
import { formatRupiah, formatNumberId } from '../../engine/formulaEngine';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';
import { MASTER_PRICE_ITEMS } from '../../data/indonesianPrices';
import { useScopeBasedCost } from '../../hooks/useScopeBasedCost';
import { PriceContext } from '../../engine/pricing/contracts/types';
// PHASE 6A: Weir forensic cost pipeline
import { WeirCostService } from '../../engine/weir/weirCostService';
import { WeirCostInput } from '../../engine/weir/weirTypes';
import { WeirCostSummaryPanel } from '../weir/WeirCostSummaryPanel';
import { WeirAuditTrailPanel } from '../weir/WeirAuditTrailPanel';
import { TutorialHelpButton } from '../onboarding/tutorials/TutorialHelpButton';
// Provenance harga: label sumber tiap baris breakdown (MASTER_DB /
// CALCULATOR_ESTIMATE / UNRESOLVED). Situs fabrikasi QTO sudah dihapus (F1b).
import {
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
  /** null = tidak ada sumber harga nyata (BUKAN Rp0). */
  hargaSatuan: number | null;
  jumlahHarga: number | null;
  isOverridden: boolean;
  priceSource: CostPriceSourceKind;
}

// 6 Structured Categories (24 Master SNI/Workbook + 30 Residential Pack)
export const CALCULATOR_CATEGORIES = [
  {
    id: 'LEGACY_WORKBOOK',
    name: 'A. MASTER STANDAR SNI & CAD (24)',
    icon: DraftingCompass,
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
    icon: Tractor,
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
    icon: HardHat,
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
    icon: BrickWall,
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
    icon: Home,
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
    icon: Zap,
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
    icon: Route,
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
    icon: Droplets,
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
    icon: Landmark,
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
    icon: Wheat,
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
    icon: CloudRain,
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
    icon: Waves,
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
    icon: Droplet,
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
    icon: Mountain,
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
    icon: GlassWater,
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
  icon: LucideIcon;
  packs: string[];
}

export const CIVIL_DOMAINS: CivilDomainDef[] = [
  { id: 'BUILDING', name: 'Bangunan', subtitle: 'Building', icon: Building2, packs: ['RESIDENTIAL', 'LEGACY'] },
  { id: 'MASTER_SNI', name: 'Master SNI / CAD (24)', subtitle: 'Kalkulator Utama', icon: DraftingCompass, packs: ['LEGACY'] },
  { id: 'ROAD', name: 'Jalan', subtitle: 'Road', icon: Route, packs: ['ROAD'] },
  { id: 'DRAINAGE', name: 'Drainase & Saluran', subtitle: 'Drainage', icon: Droplets, packs: ['DRAINAGE'] },
  { id: 'BRIDGE', name: 'Jembatan', subtitle: 'Bridge', icon: Landmark, packs: ['BRIDGE'] },
  { id: 'IRRIGATION', name: 'Irigasi', subtitle: 'Irrigation', icon: Sprout, packs: ['IRRIGATION'] },
  { id: 'RIVER', name: 'Sungai & Proteksi Banjir', subtitle: 'River & Flood', icon: Waves, packs: ['RIVER'] },
  { id: 'WEIR', name: 'Bendung', subtitle: 'Weir', icon: HardHat, packs: ['WEIR'] },
  { id: 'EMBUNG', name: 'Embung & Retensi', subtitle: 'Embung', icon: Droplet, packs: ['EMBUNG'] },
  { id: 'DAM', name: 'Bendungan', subtitle: 'Dam', icon: Mountain, packs: ['DAM'] },
  { id: 'WATER_STRUCTURE', name: 'Bangunan Air', subtitle: 'Water Structure', icon: GlassWater, packs: ['WATER_STRUCTURE'] },
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
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [collapsedDomains, setCollapsedDomains] = useState<Record<string, boolean>>({});
  // Layout konsep final (acc owner 2026-10-30): langkah formula
  // tersembunyi di balik tombol "?" pada header workbench.
  const [showFormulaSteps, setShowFormulaSteps] = useState(false);
  const [activeDomainChip, setActiveDomainChip] = useState<string | null>(null);

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
    setShowFormulaSteps(false);
    recordRecent(id);

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

  // Reset Confirmation Modal State
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  // CATATAN: state override harga per item yang lama (useState tanpa setter &
  // tanpa UI) DIHAPUS — cabangnya mati dan menyesatkan. Harga hanya berasal
  // dari sumber nyata (MASTER_DB / estimasi kalkulator), selain itu null.

  // Mobile / Tablet Active View
  const [mobileStep, setMobileStep] = useState<'dimensi' | 'volume' | 'result'>('dimensi');

  // Editing QTO Item ID (if loaded from QTO list)
  const [editingQtoId, setEditingQtoId] = useState<string | null>(initialQtoId || null);

  // Sync initialCalcId if provided or changed
  useEffect(() => {
    if (initialCalcId && initialCalcId !== selectedCalcId) {
      setSelectedCalcId(initialCalcId);
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

  // Ikuti initialQtoId dari navigasi (mis. tombol Edit di Rekap QTO).
  useEffect(() => {
    if (initialQtoId) setEditingQtoId(initialQtoId);
  }, [initialQtoId]);

  // MUAT parameterSnapshot item yang diedit ke form. Tanpa ini form menampilkan
  // nilai default kalkulator, dan tombol Update menimpa quantity item lama
  // dengan hasil perhitungan default (temuan audit).
  const loadedEditIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editingQtoId) {
      loadedEditIdRef.current = null;
      return;
    }
    if (loadedEditIdRef.current === editingQtoId) return;
    const item = projectQtoItems.find((q) => q.id === editingQtoId);
    if (!item) return;
    loadedEditIdRef.current = editingQtoId;
    if (item.calculatorId && item.calculatorId !== selectedCalcId) {
      setSelectedCalcId(item.calculatorId);
    }
    const spec = getCalculatorById(item.calculatorId || selectedCalcId) || activeSpec;
    const snap = (item.parameterSnapshot || {}) as Record<string, any>;
    const loaded: Record<string, number> = {};
    spec.parameters.forEach((p) => {
      const raw = snap[p.id];
      const num = typeof raw === 'number' ? raw : Number(raw);
      loaded[p.id] = Number.isFinite(num) ? num : p.defaultValue;
    });
    setInputs(loaded);
    setActiveParam(spec.parameters[0]?.id || 'P');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingQtoId, projectQtoItems]);

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
    // Tanpa satu pun harga dari sumber nyata, sinkron akan mencatat harga
    // satuan Rp0 di RAB — batalkan dengan jujur.
    if (priceBreakdown.grandTotal <= 0) {
      showToast('Harga belum tersedia dari sumber nyata — sinkron ke RAB dibatalkan agar tidak tercatat Rp0. Simpan ke QTO terlebih dahulu, lalu lengkapi harga komponennya.', 'warning');
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
  }, [searchQuery, filterUnit, filterFavoritesOnly, favoriteIds]);

  // Satu daftar gabungan: Domain -> Kategori -> Item (pengganti strip
  // domain terpisah + filter kategori). Satu kategori bisa muncul di lebih
  // dari satu domain bila pack-nya diklaim beberapa domain (mis. LEGACY di
  // Bangunan & Master SNI) — sama seperti semantik hitungan domain lama.
  // Kategori yang tidak diklaim domain mana pun masuk kelompok "Lainnya".
  const domainGroups = useMemo(() => {
    const groups = CIVIL_DOMAINS.map((domain) => ({
      ...domain,
      categories: groupedCalculators.filter((cat) => domain.packs.includes(cat.pack)),
    })).filter((d) => d.categories.length > 0);
    const covered = new Set(groups.flatMap((d) => d.categories.map((c) => c.id)));
    const others = groupedCalculators.filter((c) => !covered.has(c.id));
    if (others.length > 0) {
      groups.push({
        id: 'OTHER',
        name: 'Lainnya',
        subtitle: 'Other',
        icon: LayoutGrid,
        packs: [] as string[],
        categories: others,
      });
    }
    return groups;
  }, [groupedCalculators]);

  const toggleDomainCollapse = (domainId: string) => {
    setCollapsedDomains((prev) => ({
      ...prev,
      [domainId]: !prev[domainId],
    }));
  };

  const totalFilteredCount = useMemo(() => {
    return groupedCalculators.reduce((sum, g) => sum + g.items.length, 0);
  }, [groupedCalculators]);

  const allCategoriesCollapsed = useMemo(() => {
    return groupedCalculators.length > 0
      && domainGroups.every((d) => !!collapsedDomains[d.id])
      && groupedCalculators.every((g) => !!collapsedCategories[g.id]);
  }, [groupedCalculators, collapsedCategories, domainGroups, collapsedDomains]);

  const toggleAllCategories = () => {
    if (allCategoriesCollapsed) {
      setCollapsedCategories({});
      setCollapsedDomains({});
    } else {
      const next: Record<string, boolean> = {};
      groupedCalculators.forEach((g) => {
        next[g.id] = true;
      });
      setCollapsedCategories(next);
      const nextDomains: Record<string, boolean> = {};
      domainGroups.forEach((d) => {
        nextDomains[d.id] = true;
      });
      setCollapsedDomains(nextDomains);
    }
  };

  // Filtered calculators (semua domain, sesuai filter aktif)
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

  // Compute live price breakdown (Tenaga Kerja, Bahan, Peralatan).
  // ATURAN F1b: harga HANYA dari sumber nyata — record MASTER_PRICE_ITEMS atau
  // estimasi yang dideklarasikan kalkulator itu sendiri (CALCULATOR_ESTIMATE).
  // Rantai tebakan kata-kunci, tarif tebak-peran, dan last-resort Rp50.000
  // DIHAPUS: tanpa sumber → harga null berlabel UNRESOLVED (bukan angka tebak).
  const priceBreakdown = useMemo(() => {
    // 1. Tenaga Kerja
    const laborRows: QtoPriceRow[] = calculationResult.labor.map((l) => {
      const match = MASTER_PRICE_ITEMS.find(p => p.category === 'LABOR' && p.name.toLowerCase().includes(l.role.toLowerCase()));
      const unitRate: number | null = match
        ? match.price
        : l.rateEstimate && l.rateEstimate > 0
          ? l.rateEstimate
          : null;
      const laborPriceSource: CostPriceSourceKind = match
        ? 'MASTER_DB'
        : unitRate != null
          ? 'CALCULATOR_ESTIMATE'
          : 'UNRESOLVED';
      return {
        key: `labor_${l.role}`,
        uraian: l.role,
        volume: l.hoursOrDays,
        satuan: l.unit || 'OH',
        hargaSatuan: unitRate,
        jumlahHarga: unitRate == null ? null : SafeDecimalEngine.safeMultiply(l.hoursOrDays, unitRate),
        isOverridden: false,
        priceSource: laborPriceSource,
      };
    });
    const subtotalLabor = laborRows.reduce((acc, row) => acc + (row.jumlahHarga ?? 0), 0);

    // 2. Bahan
    const materialRows: QtoPriceRow[] = calculationResult.materials.map((m) => {
      const match =
        m.unitPriceEstimate && m.unitPriceEstimate > 0
          ? null
          : MASTER_PRICE_ITEMS.find(p => p.category === 'MATERIAL' && (p.name.toLowerCase().includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(p.name.toLowerCase())));
      const unitPrice: number | null =
        m.unitPriceEstimate && m.unitPriceEstimate > 0 ? m.unitPriceEstimate : match ? match.price : null;
      const materialPriceSource: CostPriceSourceKind =
        m.unitPriceEstimate && m.unitPriceEstimate > 0
          ? 'CALCULATOR_ESTIMATE'
          : match
            ? 'MASTER_DB'
            : 'UNRESOLVED';
      return {
        key: `mat_${m.name}`,
        uraian: m.name,
        volume: m.quantity,
        satuan: m.unit,
        hargaSatuan: unitPrice,
        jumlahHarga: unitPrice == null ? null : SafeDecimalEngine.safeMultiply(m.quantity, unitPrice),
        isOverridden: false,
        priceSource: materialPriceSource,
      };
    });
    const subtotalMaterials = materialRows.reduce((acc, row) => acc + (row.jumlahHarga ?? 0), 0);

    // 3. Peralatan — hanya alat yang benar-benar dideklarasikan kalkulator;
    // baris "Alat Bantu" implisit Rp45.000 DIHAPUS.
    const equipmentRows: QtoPriceRow[] = (calculationResult.equipment || []).map((eq) => {
      const match = MASTER_PRICE_ITEMS.find(p => p.category === 'EQUIPMENT' && p.name.toLowerCase().includes(eq.name.toLowerCase()));
      const unitPrice: number | null = match
        ? match.price
        : eq.unitPriceEstimate && eq.unitPriceEstimate > 0
          ? eq.unitPriceEstimate
          : null;
      const equipmentPriceSource: CostPriceSourceKind = match
        ? 'MASTER_DB'
        : unitPrice != null
          ? 'CALCULATOR_ESTIMATE'
          : 'UNRESOLVED';
      return {
        key: `eq_${eq.name}`,
        uraian: eq.name,
        volume: eq.quantity,
        satuan: eq.unit,
        hargaSatuan: unitPrice,
        jumlahHarga: unitPrice == null ? null : SafeDecimalEngine.safeMultiply(eq.quantity, unitPrice),
        isOverridden: false,
        priceSource: equipmentPriceSource,
      };
    });
    const subtotalEquipment = equipmentRows.reduce((acc, row) => acc + (row.jumlahHarga ?? 0), 0);

    const finalLaborRows = [...laborRows];
    const finalSubtotalLabor = subtotalLabor;
    // Total = jumlah baris yang BENAR-BENAR berharga saja. Fallback "borongan"
    // dari kata-kunci judul kalkulator DIHAPUS — total 0 di sini berarti
    // "belum ada harga", dan UI menampilkannya sebagai belum tersedia.
    const finalGrandTotal = subtotalLabor + subtotalMaterials + subtotalEquipment;

    type PricedRow = { hargaSatuan?: number | null; priceSource?: CostPriceSourceKind };
    const allDisplayedRows: PricedRow[] = [
      ...(finalLaborRows as PricedRow[]),
      ...(materialRows as PricedRow[]),
      ...(equipmentRows as PricedRow[]),
    ];
    const fabricatedRowCount = allDisplayedRows.filter((r) => r.priceSource === 'FABRICATED').length;
    const estimatedRowCount = allDisplayedRows.filter((r) => r.priceSource === 'CALCULATOR_ESTIMATE').length;
    const unresolvedRowCount = allDisplayedRows.filter((r) => r.hargaSatuan == null).length;
    const priceStatus: CostPriceStatus =
      unresolvedRowCount > 0 ? 'INCOMPLETE'
        : estimatedRowCount > 0 ? 'REFERENCE_ESTIMATE'
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
  }, [calculationResult, activeSpec, selectedCalcId]);

  // Empty State if No Project Available
  if (!effectiveProject) {
    return (
      <div
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: '20px',
          border: '1px solid #EEF1F6',
          padding: '48px 24px',
          textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: 'var(--ez-pastel-sky)',
            border: '1px solid #C9DEF7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: 'var(--ez-color-primary)',
          }}
        >
          <Ruler size={32} />
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ez-color-text-primary)', marginBottom: '8px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Belum ada proyek aktif
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', maxWidth: '460px', margin: '0 auto 24px', lineHeight: 1.6 }}>
          Volume Calculator EZRAB beroperasi secara terintegrasi dengan database proyek. Setiap hasil kalkulasi menghasilkan snapshot CalculationRun yang terhubung langsung ke QTO dan Spreadsheet RAB.
        </p>
        <button
          onClick={() => onNavigateToTab?.('proyek')}
          style={{
            height: '42px',
            padding: '0 20px',
            borderRadius: '10px',
            background: 'var(--ez-color-primary)',
            color: '#FFFFFF',
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

  // Ilustrasi statis pekerjaan terpilih (bila ada di peta ilustrasi final).
  const activeIllustration = getCalculatorIllustration(selectedCalcId);

  return (
    <div
      onPaste={handlePasteExcelData}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
        maxWidth: isFullscreen ? 'none' : '1440px',
        margin: isFullscreen ? 0 : '0 auto',
        width: '100%',
        color: 'var(--ez-color-text-primary)',
        fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        right: isFullscreen ? 0 : 'auto',
        bottom: isFullscreen ? 0 : 'auto',
        zIndex: isFullscreen ? 9999 : 'auto',
        background: isFullscreen ? 'var(--ez-color-background)' : 'transparent',
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
            color: '#FFFFFF',
            padding: '14px 22px',
            borderRadius: 'var(--ez-radius-control)',
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
              background: 'var(--ez-color-surface)',
              borderRadius: '20px',
              padding: '24px',
              maxWidth: '420px',
              width: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: '1px solid #EEF1F6',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: 'var(--ez-radius-control)', background: 'var(--ez-hue-rose-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}>
                <RefreshCw size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Reset Parameter Kalkulator?
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: '2px 0 0' }}>
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
                  background: 'var(--ez-color-surface-tertiary)',
                  border: '1px solid var(--ez-hue-slate-border)',
                  color: 'var(--ez-color-text-slate)',
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
                  color: '#FFFFFF',
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

      {/* 1. PROFESSIONAL CAD / QUANTITY SURVEYOR WORKSTATION HEADER (70-80px) */}
      <div
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: 'var(--ez-radius-card)',
          border: '1px solid #EEF1F6',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 4px 20px rgba(38, 54, 75, 0.045)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '14px',
              background: 'var(--ez-pastel-sky)',
              color: 'var(--ez-color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(37,99,235,0.12)',
              flexShrink: 0,
            }}
          >
            <Calculator size={22} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 data-tutorial="qto-calc" style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0, letterSpacing: '-0.01em', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Volume Calculator
              </h1>
              <TutorialHelpButton tutorialId="qto" label="Buka tutorial QTO" />
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  background: 'var(--ez-hue-blue-bg)',
                  color: 'var(--ez-color-primary)',
                  padding: '1px 6px',
                  borderRadius: 'var(--ez-radius-pill)',
                  border: '1px solid var(--ez-hue-blue-bg-deep)',
                }}
              >
                QTO WORKSTATION
              </span>
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>•</span>
              <span style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', fontWeight: 500 }}>
                {domainCounts.ALL} Kalkulator / 10 Domain
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: '2px 0 0', lineHeight: 1.3 }}>
              QTO • Hitung volume pekerjaan konstruksi dengan cepat, presisi dan terstandarisasi SNI.
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => onNavigateToTab?.('qto')}
            style={{
              height: '36px',
              padding: '0 14px',
              borderRadius: 'var(--ez-radius-control)',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-color-border-line)',
              color: 'var(--ez-color-text-body)',
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
            <span>Kembali</span>
          </button>

          <button
            onClick={handleResetClick}
            style={{
              height: '36px',
              padding: '0 14px',
              borderRadius: 'var(--ez-radius-control)',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-color-border-line)',
              color: hasUnsavedChanges ? 'var(--ez-hue-amber-text-deep)' : 'var(--ez-color-text-muted)',
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
            onClick={() => setIsFullscreen(!isFullscreen)}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: 'var(--ez-radius-control)',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-color-border-line)',
              color: 'var(--ez-color-text-slate)',
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
          background: 'var(--ez-color-surface)',
          borderRadius: 'var(--ez-radius-card)',
          border: '1px solid #EEF1F6',
          boxShadow: '0 4px 20px rgba(38, 54, 75, 0.045)',
          padding: '8px 16px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--ez-color-text-slate)', fontWeight: 700, flexShrink: 0 }}>
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
                      background: isSelected ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
                      border: isSelected ? '1px solid #2563EB' : '1px solid var(--ez-hue-slate-border)',
                      color: isSelected ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-body)',
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
              background: filterFavoritesOnly ? 'var(--ez-hue-amber-bg-deep)' : 'var(--ez-color-surface)',
              border: filterFavoritesOnly ? '1px solid #F59E0B' : '1px solid var(--ez-hue-slate-border)',
              color: filterFavoritesOnly ? 'var(--ez-hue-amber-text)' : 'var(--ez-color-text-slate)',
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

      {/* 3. ALUR VERTIKAL (konsep final acc owner 2026-10-30): DAFTAR KALKULATOR
          (panel atas) -> ILUSTRASI LEBAR PENUH -> WORKBENCH KALKULATOR AKTIF */}
      <div className="ezrab-workstation-split">
        {/* =========================================================================
            PANEL ATAS: DAFTAR KALKULATOR (CHIP DOMAIN + CARI + LIST)
           ========================================================================= */}
        <div className="ezrab-workstation-sidebar">
          {/* Top Controls: Search + Unit Filter + Status & Expand/Collapse */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Chip Domain — pintasan membuka satu kelompok domain pada
                daftar di bawahnya (murni navigasi expand/collapse). */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {domainGroups.map((domain) => {
                const isActive = activeDomainChip === domain.id;
                return (
                  <button
                    key={domain.id}
                    type="button"
                    onClick={() => {
                      setActiveDomainChip(domain.id);
                      setCollapsedDomains(() => {
                        const next: Record<string, boolean> = {};
                        domainGroups.forEach((d) => { next[d.id] = d.id !== domain.id; });
                        return next;
                      });
                    }}
                    style={{
                      height: '28px',
                      padding: '0 10px',
                      borderRadius: 'var(--ez-radius-pill)',
                      background: isActive ? 'var(--ez-color-primary)' : 'var(--ez-color-surface-secondary)',
                      border: isActive ? '1px solid var(--ez-color-primary)' : '1px solid var(--ez-color-border-line)',
                      color: isActive ? '#FFFFFF' : 'var(--ez-color-text-body)',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.12s ease',
                    }}
                    title={`Buka kelompok ${domain.name}`}
                  >
                    <domain.icon size={13} />
                    <span>{domain.name}</span>
                  </button>
                );
              })}
            </div>

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
                  height: '36px',
                  paddingLeft: '34px',
                  paddingRight: searchQuery ? '32px' : '12px',
                  borderRadius: 'var(--ez-radius-control)',
                  border: '1px solid var(--ez-color-border-line)',
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  background: 'var(--ez-color-surface-secondary)',
                  color: 'var(--ez-color-text-primary)',
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

            {/* Compact Filters Row: Unit Dropdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
              {/* Unit Dropdown */}
              <div>
                <label htmlFor="filter-work-unit" style={{ display: 'none' }}>Satuan</label>
                <select
                  id="filter-work-unit"
                  value={filterUnit}
                  onChange={(e) => setFilterUnit(e.target.value)}
                  style={{
                    width: '100%',
                    height: '32px',
                    borderRadius: '10px',
                    border: '1px solid var(--ez-color-border-line)',
                    background: 'var(--ez-color-surface)',
                    fontSize: '11px',
                    color: 'var(--ez-color-text-body)',
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ez-color-text-muted)', paddingTop: '2px' }}>
              <span>
                Menampilkan <strong>{totalFilteredCount}</strong> dari {domainCounts.ALL} kalkulator
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={toggleAllCategories}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--ez-color-text-slate)',
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

                {(searchQuery || filterUnit !== 'ALL' || filterFavoritesOnly) && (
                  <>
                    <span style={{ color: '#CBD5E1' }}>•</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setFilterUnit('ALL');
                        setFilterFavoritesOnly(false);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--ez-color-primary)',
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
                  background: 'var(--ez-color-surface-secondary)',
                  borderRadius: '8px',
                  border: '1px dashed var(--ez-hue-slate-border)',
                  flexShrink: 0,
                }}
              >
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-body)', margin: '0 0 6px' }}>
                  Tidak ada kalkulator yang cocok.
                </p>
                <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', textAlign: 'left', display: 'inline-block', lineHeight: 1.6 }}>
                  Coba:
                  <ul style={{ margin: '4px 0 10px 16px', padding: 0 }}>
                    <li>Gunakan kata kunci pencarian yang lebih umum</li>
                    <li>Hapus filter satuan</li>
                  </ul>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setFilterUnit('ALL');
                      setFilterFavoritesOnly(false);
                    }}
                    style={{
                      height: '28px',
                      padding: '0 12px',
                      borderRadius: '6px',
                      background: 'var(--ez-color-primary)',
                      color: '#FFFFFF',
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
              domainGroups.map((domain) => {
                const isDomainCollapsed = !!collapsedDomains[domain.id];
                const domainItemCount = domain.categories.reduce((n, c) => n + c.items.length, 0);
                return (
                  <div
                    key={domain.id}
                    style={{
                      flexShrink: 0,
                      border: '1px solid #EEF1F6',
                      borderRadius: 'var(--ez-radius-card)',
                      overflow: 'hidden',
                      background: 'var(--ez-color-surface)',
                      boxShadow: '0 4px 20px rgba(38, 54, 75, 0.045)',
                    }}
                  >
                    {/* Header Domain — satu kelompok, isinya langsung di bawah */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleDomainCollapse(domain.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') toggleDomainCollapse(domain.id);
                      }}
                      style={{
                        padding: '10px 12px',
                        background: 'var(--ez-hue-blue-bg)',
                        borderBottom: isDomainCollapsed ? 'none' : '1px solid #EEF1F6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '9px',
                            background: 'var(--ez-hue-blue-bg-deep)',
                            color: 'var(--ez-color-primary-hover)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <domain.icon size={15} />
                        </span>
                        <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--ez-color-text-strong)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                          {domain.name}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
                          {domain.subtitle}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            background: 'var(--ez-color-surface)',
                            color: 'var(--ez-color-text-slate)',
                            padding: '1px 6px',
                            borderRadius: 'var(--ez-radius-pill)',
                            border: '1px solid var(--ez-color-border-line)',
                          }}
                        >
                          {domainItemCount}
                        </span>
                        {isDomainCollapsed ? <ChevronDown size={14} color="#64748B" /> : <ChevronUp size={14} color="#64748B" />}
                      </div>
                    </div>
                    {!isDomainCollapsed && (
                      <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {domain.categories.map((group) => {
                const isCollapsed = !!collapsedCategories[group.id];
                return (
                  <div
                    key={group.id}
                    className="ezrab-calc-group-card"
                    style={{
                      flexShrink: 0,
                      border: '1px solid #EEF1F6',
                      borderRadius: 'var(--ez-radius-card)',
                      overflow: 'hidden',
                      background: 'var(--ez-color-surface)',
                      boxShadow: '0 4px 20px rgba(38, 54, 75, 0.045)',
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
                        background: 'var(--ez-color-surface-secondary)',
                        borderBottom: isCollapsed ? 'none' : '1px solid #EEF1F6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '8px',
                            background: 'var(--ez-hue-blue-bg)',
                            color: 'var(--ez-color-primary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <group.icon size={14} />
                        </span>
                        <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--ez-color-text-strong)', textTransform: 'uppercase', letterSpacing: '0.02em', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                          {group.name.replace(/^[A-Z][.]\s*/, '')}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            background: 'var(--ez-color-border-line)',
                            color: 'var(--ez-color-text-slate)',
                            padding: '1px 6px',
                            borderRadius: 'var(--ez-radius-pill)',
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
                                background: isSelected ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
                                border: isSelected ? '1.5px solid #2563EB' : '1px solid var(--ez-color-border-line)',
                                borderLeft: isSelected ? '3.5px solid #2563EB' : '1px solid var(--ez-color-border-line)',
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
                                    color: item.isFavorite ? '#F59E0B' : 'var(--ez-hue-slate-border)',
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
                                    <span style={{ fontSize: '12px', fontWeight: isSelected ? 800 : 700, color: isSelected ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {item.name}
                                    </span>
                                  </div>
                                  <p
                                    style={{
                                      fontSize: '10.5px',
                                      color: 'var(--ez-color-text-muted)',
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
                                    color: 'var(--ez-color-text-slate)',
                                    background: 'var(--ez-color-surface-tertiary)',
                                    padding: '2px 6px',
                                    borderRadius: 'var(--ez-radius-pill)',
                                    border: '1px solid #EEF1F6',
                                  }}
                                >
                                  {item.primaryUnit}
                                </span>
                                <span style={{ color: isSelected ? 'var(--ez-color-primary)' : 'var(--ez-hue-slate-border)', display: 'flex', alignItems: 'center' }}>
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
              borderTop: '1px solid var(--ez-color-surface-tertiary)',
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

          {/* Ilustrasi Pekerjaan — lebar penuh: di bawah daftar kalkulator,
              di atas workbench (konsep final acc owner 2026-10-30). */}
            {/* Ilustrasi Pekerjaan — gambar render-style sebagai satu-satunya
                visual kalkulator (diagram CAD sudah diganti ilustrasi). */}
            {activeIllustration && (
              <div
                style={{
                  background: 'var(--ez-color-surface)',
                  border: '1px solid #EEF1F6',
                  borderRadius: '20px',
                  padding: '14px',
                  boxShadow: '0 4px 20px rgba(38, 54, 75, 0.045)',
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ez-color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em', fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: '10px' }}>
                  Ilustrasi Pekerjaan
                </div>
                <figure
                  style={{
                    margin: 0,
                    border: '1px solid #EEF1F6',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    background: 'var(--ez-color-surface)',
                  }}
                >
                  <img
                    src={activeIllustration.src}
                    alt={activeIllustration.title}
                    title={activeIllustration.title}
                    loading="eager"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </figure>
              </div>
            )}

        {/* =========================================================================
            WORKBENCH KALKULATOR AKTIF (MESIN HITUNG PENUH)
           ========================================================================= */}
        <div
          id="active-calculator-workbench"
          style={{
            background: 'var(--ez-color-surface)',
            borderRadius: 'var(--ez-radius-card)',
            border: '1px solid #EEF1F6',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 4px 20px rgba(38, 54, 75, 0.045)',
          }}
        >
          {/* Workbench Header */}
          <div
            style={{
              borderBottom: '1px solid var(--ez-color-surface-tertiary)',
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
                <span style={{ fontSize: '10.5px', fontWeight: 800, background: '#0F172A', color: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                  {(activeSpec as any)?.code || selectedCalcId}
                </span>
                <span style={{ fontSize: '11px', background: 'var(--ez-hue-blue-bg)', color: 'var(--ez-color-primary-hover)', padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', fontWeight: 700, border: '1px solid var(--ez-hue-blue-bg-deep)' }}>
                  {activeSpec.category}
                </span>
                <span style={{ fontSize: '10.5px', color: 'var(--ez-hue-green-text)', background: 'var(--ez-hue-green-bg-deep)', padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={12} /> SNI-STANDARDIZED
                </span>
              </div>

              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {activeSpec.title}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: '4px 0 0', lineHeight: 1.4 }}>
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
                  background: favoriteIds.includes(selectedCalcId) ? 'var(--ez-hue-amber-bg-deep)' : 'var(--ez-color-surface)',
                  border: favoriteIds.includes(selectedCalcId) ? '1px solid #F59E0B' : '1px solid var(--ez-hue-slate-border)',
                  color: favoriteIds.includes(selectedCalcId) ? 'var(--ez-hue-amber-text)' : 'var(--ez-color-text-slate)',
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
                onClick={handleResetClick}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  background: 'var(--ez-color-surface)',
                  border: '1px solid var(--ez-hue-slate-border)',
                  color: 'var(--ez-color-text-slate)',
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

              {/* Tombol "?" — formula & langkah perhitungan tersembunyi
                  di balik tombol ini (konsep final acc owner 2026-10-30). */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowFormulaSteps((prev) => !prev)}
                  aria-expanded={showFormulaSteps}
                  aria-label="Lihat formula dan langkah perhitungan"
                  title="Formula & Langkah Perhitungan"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: showFormulaSteps ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-primary)',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '16px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  ?
                </button>
                {showFormulaSteps && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 10px)',
                      right: 0,
                      width: 'min(580px, 92vw)',
                      maxHeight: '62vh',
                      overflowY: 'auto',
                      background: 'var(--ez-color-surface)',
                      border: '1px solid #EEF1F6',
                      borderRadius: '16px',
                      padding: '14px',
                      boxShadow: '0 16px 44px rgba(15, 23, 42, 0.20)',
                      zIndex: 70,
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <Calculator size={14} color="var(--ez-hue-blue-text)" />
                      <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ez-color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        Formula &amp; Langkah Perhitungan
                      </span>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', margin: '0 0 10px', lineHeight: 1.4 }}>
                      Hasil audit engine untuk kalkulator terpilih.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {calculationResult.formulaSteps.length === 0 ? (
                        <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }}>
                          Belum ada langkah formula untuk kalkulator ini.
                        </div>
                      ) : (
                        calculationResult.formulaSteps.map((step) => (
                          <div
                            key={step.stepNumber}
                            style={{
                              background: 'var(--ez-color-surface-secondary)',
                              borderRadius: '10px',
                              padding: '8px 10px',
                              border: '1px solid #EEF1F6',
                              fontSize: '11.5px',
                              minWidth: 0,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontWeight: 700, color: 'var(--ez-color-text-strong)' }}>
                              <span style={{ minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{step.stepNumber}. {step.description}</span>
                              <span style={{ color: 'var(--ez-color-primary)', fontFamily: 'monospace', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                {formatNumberId(step.calculatedValue, 2)} {step.unit}
                              </span>
                            </div>
                            <div style={{ fontFamily: 'monospace', color: 'var(--ez-color-text-muted)', fontSize: '11px', marginTop: '2px', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                              = {step.formulaText}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Two-Column Grid: Left Inputs / Right Results & Actions */}
          <div className="ezrab-volume-bottom-grid">
            {/* COLUMN 1: FORMULIR PARAMETER GEOMETRIS */}
            <div
              style={{
                background: 'var(--ez-color-surface)',
                borderRadius: '20px',
                border: '1px solid #EEF1F6',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--ez-color-surface-tertiary)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ez-color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Formulir Parameter Geometris
                </span>
                <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>
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
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        minWidth: 0,
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: isFocused ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
                        border: isInvalid
                          ? '1px solid #EF4444'
                          : isFocused
                          ? '1.5px solid #2563EB'
                          : '1px solid var(--ez-color-border-line)',
                        transition: 'all 0.1s ease',
                      }}
                    >
                      {/* Label blok penuh: selalu wrap, tidak pernah ellipsis/terpotong.
                          Perilaku lama (grid label 1fr + input 88px + satuan 30px)
                          memotong label panjang di panel sempit karena item flex
                          tanpa minWidth: 0 tidak mau menyusut. */}
                      <div style={{ minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            background: isFocused ? 'var(--ez-hue-blue-bg-deep)' : 'var(--ez-color-surface-tertiary)',
                            color: isFocused ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            flexShrink: 0,
                          }}
                        >
                          {param.id}
                        </span>
                        <span style={{ fontSize: '12.5px', fontWeight: isFocused ? 700 : 600, color: isFocused ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-strong)', lineHeight: 1.4, minWidth: 0, flex: 1, overflowWrap: 'break-word', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                          {param.label}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', lineHeight: 1.4, overflowWrap: 'break-word', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                        {param.description}
                      </div>
                      {/* Input lebar penuh + satuan */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
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
                            flex: 1,
                            minWidth: 0,
                            height: '36px',
                            background: isFocused ? 'var(--ez-color-surface)' : 'var(--ez-color-surface-secondary)',
                            border: '1px solid var(--ez-hue-slate-border)',
                            borderRadius: '6px',
                            padding: '0 10px',
                            fontSize: '13px',
                            fontWeight: 700,
                            fontFamily: 'monospace, "Courier New", sans-serif',
                            textAlign: 'right',
                            color: 'var(--ez-color-text-primary)',
                            outline: 'none',
                            boxSizing: 'border-box',
                            boxShadow: isFocused ? '0 0 0 2px rgba(37,99,235,0.2)' : 'none',
                          }}
                        />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-muted)', flexShrink: 0, minWidth: '28px' }}>
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
                  background: 'var(--ez-color-surface-secondary)',
                  borderRadius: '6px',
                  border: '1px dashed var(--ez-hue-slate-border)',
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  color: 'var(--ez-color-text-muted)',
                }}
              >
                <ClipboardCheck size={14} color="var(--ez-hue-blue-text)" style={{ flexShrink: 0 }} />
                <span>Tekan <strong>Tab</strong> untuk navigasi antar sel. Mendukung copy-paste angka dari tabel Excel.</span>
              </div>
            </div>

            {/* COLUMN 2: HASIL VOLUME & ESTIMASI BIAYA PEKERJAAN */}
            <div
              style={{
                background: 'var(--ez-color-surface)',
                borderRadius: '20px',
                border: '1px solid #EEF1F6',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {/* PRIMARY VOLUME RESULT BOX */}
              <div
                style={{
                  background: 'var(--ez-pastel-cream)',
                  borderRadius: '20px',
                  padding: '18px 20px',
                  color: 'var(--ez-color-text-primary)',
                  border: 'none',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {activeSpec.primaryQuantityLabel}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ez-hue-green-text-deep)', background: 'var(--ez-pastel-mint)', padding: '1px 6px', borderRadius: 'var(--ez-radius-pill)' }}>
                    DETERMINISTIC
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '30px', fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--ez-color-text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {formatNumberId(calculationResult.primaryQuantity, 2)}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ez-color-text-slate)' }}>
                    {calculationResult.primaryUnit}
                  </span>
                </div>

                <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(15,23,42,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
                  <span>Rumus Dasar:</span>
                  <span style={{ color: 'var(--ez-color-text-primary)', fontFamily: 'monospace', fontWeight: 600 }}>
                    {activeSpec.excelSheetName || 'SNI-AHSP Formulation'}
                  </span>
                </div>
              </div>

              {/* Intermediate Breakdown Table */}
              {Object.keys(calculationResult.breakdown).length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-slate)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '6px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Rincian Volume Teknis
                  </div>
                  <div style={{ border: '1px solid #EEF1F6', borderRadius: '20px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid #EEF1F6', color: 'var(--ez-color-text-slate)', fontWeight: 700 }}>
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
                                borderBottom: '1px solid var(--ez-color-surface-tertiary)',
                                background: idx % 2 === 0 ? '#ffffff' : 'var(--ez-color-surface-faint)',
                              }}
                            >
                              <td style={{ padding: '5px 8px', color: 'var(--ez-color-text-strong)', fontWeight: 500 }}>
                                {label}
                              </td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                                {typeof val === 'number' ? formatNumberId(val, 2) : val}
                              </td>
                              <td style={{ padding: '5px 8px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>
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
                      scopeCost.status === 'RESOLVED' ? 'var(--ez-hue-green-bg)'
                        : scopeCost.status === 'PRICE_MISSING' || scopeCost.status === 'PARTIAL' ? 'var(--ez-hue-amber-bg)'
                          : scopeCost.status === 'AHSP_MISSING' ? 'var(--ez-hue-rose-bg)'
                            : 'var(--ez-color-surface-secondary)',
                    border:
                      scopeCost.status === 'RESOLVED' ? '1px solid var(--ez-hue-green-border)'
                        : scopeCost.status === 'PRICE_MISSING' || scopeCost.status === 'PARTIAL' ? '1px solid var(--ez-hue-amber-border)'
                          : scopeCost.status === 'AHSP_MISSING' ? '1px solid var(--ez-hue-rose-border)'
                            : '1px solid var(--ez-hue-slate-border)',
                    borderRadius: '20px',
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
                            scopeCost.status === 'RESOLVED' ? 'var(--ez-hue-green-text-deep)'
                              : scopeCost.status === 'PRICE_MISSING' || scopeCost.status === 'PARTIAL' ? 'var(--ez-hue-amber-text-dark)'
                                : 'var(--ez-hue-red-text)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {scopeCost.status === 'RESOLVED' && 'BIAYA TEPAT (CostPolicyEngine)'}
                        {(scopeCost.status === 'PRICE_MISSING' || scopeCost.status === 'PARTIAL') && 'HARGA REGIONAL BELUM TERSEDIA'}
                        {scopeCost.status === 'AHSP_MISSING' && 'AHSP BELUM TERDAFTAR'}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 700,
                        background:
                          scopeCost.status === 'RESOLVED' ? 'var(--ez-hue-green-bg-deep)'
                            : scopeCost.status === 'PRICE_MISSING' || scopeCost.status === 'PARTIAL' ? 'var(--ez-hue-amber-bg-deep)'
                              : 'var(--ez-hue-red-bg)',
                        color:
                          scopeCost.status === 'RESOLVED' ? 'var(--ez-hue-green-text)'
                            : scopeCost.status === 'PRICE_MISSING' || scopeCost.status === 'PARTIAL' ? 'var(--ez-hue-amber-text)'
                              : 'var(--ez-hue-red-text)',
                        padding: '1px 6px',
                        borderRadius: 'var(--ez-radius-pill)',
                      }}
                    >
                      {scopeCost.lineItems.length} Sub-Pekerjaan AHSP
                    </span>
                  </div>

                  {scopeCost.status === 'RESOLVED' && scopeCost.summary && (
                    <div style={{ fontSize: '12px', color: 'var(--ez-color-text-strong)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--ez-color-text-muted)' }}>Biaya Langsung (Direct Cost):</span>
                        <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{formatRupiah(scopeCost.summary.directCost)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
                        <span>Overhead & Keuntungan:</span>
                        <span>{formatRupiah(scopeCost.summary.overheadAmount + scopeCost.summary.profitAmount)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
                        <span>PPN (11%):</span>
                        <span>{formatRupiah(scopeCost.summary.taxAmount)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: 'var(--ez-color-text-primary)', borderTop: '1px solid #EEF1F6', paddingTop: '4px', marginTop: '2px' }}>
                        <span>Grand Total (Resmi):</span>
                        <span style={{ color: 'var(--ez-hue-green-text-deep)', fontFamily: 'monospace' }}>{formatRupiah(scopeCost.summary.grandTotal)}</span>
                      </div>
                    </div>
                  )}

                  {(scopeCost.status === 'PRICE_MISSING' || scopeCost.status === 'PARTIAL') && (
                    <div style={{ fontSize: '11.5px', color: 'var(--ez-hue-amber-text-dark)' }}>
                      <p style={{ margin: '0 0 6px 0', lineHeight: 1.4 }}>
                        Struktur pekerjaan dipecah menjadi <strong>{scopeCost.lineItems.length} item AHSP resmi</strong>.
                        Namun data harga HSD (Upah/Bahan/Alat) untuk wilayah <em>{priceContext.location}</em> belum lengkap di database nasional.
                      </p>
                      {scopeCost.missingPrices.length > 0 && (
                        <div style={{ background: 'var(--ez-hue-amber-bg-deep)', padding: '6px 8px', borderRadius: 'var(--ez-radius-pill)', fontSize: '10.5px' }}>
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
                  background: 'var(--ez-pastel-sky)',
                  borderRadius: '20px',
                  border: 'none',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    {scopeCost.hasMapping && scopeCost.status === 'RESOLVED'
                      ? 'Estimasi Biaya Resmi (CostPolicyEngine)'
                      : 'Estimasi Biaya Referensi (Bina Konstruksi)'}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", marginTop: '2px' }}>
                    {scopeCost.hasMapping && scopeCost.summary?.grandTotal
                      ? formatRupiah(scopeCost.summary.grandTotal)
                      : priceBreakdown.grandTotal > 0
                        ? formatRupiah(priceBreakdown.grandTotal)
                        : 'Belum tersedia'}
                  </div>
                  {!(scopeCost.hasMapping && scopeCost.status === 'RESOLVED') && priceBreakdown.unresolvedRowCount > 0 && (
                    <div style={{ fontSize: '10.5px', color: 'var(--ez-hue-amber-text-dark)', marginTop: '2px', maxWidth: '260px', lineHeight: 1.4 }}>
                      {priceBreakdown.unresolvedRowCount} komponen belum memiliki harga dari sumber nyata — total bersifat parsial (referensi tak lengkap), bukan Rp0.
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    background: scopeCost.hasMapping ? 'var(--ez-hue-blue-bg)' : 'var(--ez-hue-green-bg-deep)',
                    color: scopeCost.hasMapping ? 'var(--ez-color-primary-hover)' : 'var(--ez-hue-green-text)',
                    padding: '2px 6px',
                    borderRadius: 'var(--ez-radius-pill)',
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
                    background: 'var(--ez-color-primary)',
                    color: '#FFFFFF',
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
                    color: '#FFFFFF',
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

            </div>
          </div>

        </div>
      </div>

      {/* 4. SAVED QTO PREVIEW TABLE AT BOTTOM */}
      <div
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: '20px',
          border: '1px solid #EEF1F6',
          padding: '16px 20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          marginTop: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Daftar Volume Tersimpan ({effectiveProject.name})
              </h3>
              <span style={{ fontSize: '11px', background: 'var(--ez-hue-blue-bg)', color: 'var(--ez-color-primary)', padding: '1px 6px', borderRadius: 'var(--ez-radius-pill)', fontWeight: 700 }}>
                {projectQtoItems.length} Item QTO
              </span>
            </div>
            <p style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', margin: '2px 0 0' }}>
              Seluruh hasil perhitungan tersimpan dan terhubung langsung ke Master Spreadsheet RAB.
            </p>
          </div>

          <button
            onClick={() => onNavigateToTab?.('qto')}
            style={{
              height: '30px',
              padding: '0 12px',
              borderRadius: '6px',
              background: 'var(--ez-hue-blue-bg)',
              border: '1px solid var(--ez-hue-blue-border)',
              color: 'var(--ez-color-primary-hover)',
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
          <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '12px', background: 'var(--ez-color-surface-secondary)', borderRadius: '20px', border: '1px dashed var(--ez-hue-slate-border)' }}>
            Belum ada item QTO yang disimpan. Klik <strong>Tambahkan ke QTO</strong> di atas untuk menyimpan volume pekerjaan aktif.
          </div>
        ) : (
          <div style={{ border: '1px solid #EEF1F6', borderRadius: '20px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid #EEF1F6', color: 'var(--ez-color-text-slate)', fontWeight: 700 }}>
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
                      borderBottom: '1px solid var(--ez-color-surface-tertiary)',
                      background: item.calculatorId === selectedCalcId ? 'var(--ez-hue-blue-bg)' : idx % 2 === 0 ? '#ffffff' : 'var(--ez-color-surface-faint)',
                    }}
                  >
                    <td style={{ padding: '7px 10px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{item.uraian}</span>
                      <span style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)', marginLeft: '6px', fontFamily: 'monospace' }}>({item.kode})</span>
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: 'var(--ez-color-primary)' }}>
                      {formatNumberId(item.quantity, 2)}
                    </td>
                    <td style={{ padding: '7px 10px', color: 'var(--ez-color-text-slate)', fontWeight: 600 }}>{item.unit}</td>
                    <td style={{ padding: '7px 10px', fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>
                      <span style={{ background: 'var(--ez-color-surface-tertiary)', padding: '1px 5px', borderRadius: 'var(--ez-radius-pill)', fontFamily: 'monospace' }}>
                        {item.calculationRunId || 'CALC-DIRECT'}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      {item.status === 'SYNCED_TO_RAB' ? (
                        <span style={{ color: 'var(--ez-hue-green-text-bright)', background: 'var(--ez-hue-green-bg-deep)', padding: '1px 6px', borderRadius: 'var(--ez-radius-pill)', fontSize: '10px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Check size={10} /> Tersinkron RAB
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ez-hue-amber-text-deep)', background: 'var(--ez-hue-amber-bg-deep)', padding: '1px 6px', borderRadius: 'var(--ez-radius-pill)', fontSize: '10px', fontWeight: 600 }}>
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
