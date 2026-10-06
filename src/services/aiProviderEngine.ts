import {
  FullProjectAIContext,
  formatRupiah,
  getRelevantContextSlices,
} from './aiContextService';
import { RabItem } from '../types';
import { findKnowledgeBaseAutoAnswer } from '../data/knowledgeBaseData';
import { masterBuildingTemplateRegistry } from '../data/buildingTemplates/masterTemplateRegistry';
import { parametricVolumeEngine } from '../engine/parametricVolumeEngine/parametricVolumeEngine';
import { HOUSE_TYPE_CATALOG } from '../data/houseTypeCatalog';
import { QUICK_ACTION_CONTRACTS } from '../data/quickActionContracts';
import { LocalDocumentRepository } from '../document-engine/repository';
import { ProjectFinanceRepository } from '../domain/finance/repository';
import { FinancialAnalyticsService } from './financialAnalyticsService';
import {
  buildAiDocumentContext,
  planProjectDocuments,
  reviewDocumentConsistency,
} from './aiDocumentIntelligence';
import { reviewProjectRab } from './aiRabReview';
import {
  buildProjectSourceInventory,
  queryFactInProjectSources,
  formatEvidenceCallout,
} from './aiEvidenceService';
import { MaterialDatabaseService } from '../domain/material/materialDatabaseService';
import { NationalRegionService } from '../domain/material/nationalRegionDatabase';
import { LaborDatabaseService } from '../domain/labor/laborDatabaseService';
import { EquipmentDatabaseService } from '../domain/equipment/equipmentDatabaseService';
import { PriceRepository } from '../engine/pricing/repository/priceRepository';

export interface AiActionProposal {
  id: string;
  type:
    | 'ADD_RAB_ITEM'
    | 'UPDATE_PRICE'
    | 'CREATE_REPORT'
    | 'OPTIMIZE_MATERIAL'
    | 'OPTIMIZE_COST'
    | 'NAVIGATE_SPREADSHEET'
    | 'CREATE_PROJECT_DOCUMENTS'
    | 'CREATE_INVOICE_PROPOSAL'
    | 'OPEN_DRAWING_READER'
    | 'OPEN_RECEIPT_READER'
    | 'OPEN_RAB_REVIEW'
    | 'SET_PROJECT_MATERIAL_PRICE';
  title: string;
  description: string;
  payload?: any;
  itemData?: Partial<RabItem> & { description: string; volume: number; unit: string; unitPrice: number; ahspCode?: string; totalPrice?: number; category?: string };
  items?: Array<{ description: string; volume: number; unit: string; unitPrice: number; ahspCode?: string; category?: string }>;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'APPLIED' | 'DISCARDED';
}

export type ActionProposal = AiActionProposal;

export interface AiStatCallout {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

export interface AiResponseResult {
  content: string;
  badge?: 'RAB' | 'KURVA S' | 'LAPORAN' | 'AHSP' | 'WIZARD';
  intent?: string;
  wizardResponse?: any;
  quickActionResponse?: any;
  followUpSuggestions?: string[];
  citations?: string[];
  stats?: AiStatCallout;
  actionProposal?: AiActionProposal;
  proposals?: AiActionProposal[];
  table?: {
    headers: string[];
    rows: string[][];
  };
}

export interface AIProvider {
  name: string;
  chat: (
    prompt: string,
    context: FullProjectAIContext,
    onThinkingStep?: (step: string) => void
  ) => Promise<AiResponseResult>;
}

export class MockAiProvider implements AIProvider {
  name = 'EZRAB Construction AI (Data-Connected)';

  async chat(
    prompt: string,
    context: FullProjectAIContext,
    onThinkingStep?: (step: string) => void
  ): Promise<AiResponseResult> {
    const p = prompt.trim().toLowerCase();
    const rawNoPunct = p.replace(/[?!.,]/g, '').trim();
    const normalizedText = p
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const greetings = [
      'hai', 'halo', 'hallow', 'hello', 'hi', 'hi ai', 'hai ai', 'halo ai', 'halo ezrab', 'hai ezrab',
      'pagi', 'selamat pagi', 'siang', 'selamat siang', 'sore', 'selamat sore', 'malam', 'selamat malam',
      'assalamualaikum', 'assalamu’alaikum', 'permisi', 'test', 'tes', 'cek', 'ada orang', 'ada ai',
      'yo', 'yow', 'hei', 'hey', 'hey ai', 'p', 'ping', 'test 1 2 3', 'localhost', 'local host'
    ];

    // =========================================================================
    // 0. AUTOMATIC RAB WIZARD ENTRY POINT (HIGHEST PRIORITY)
    // =========================================================================
    const isDocumentIntent =
      normalizedText.includes('dokumen') ||
      normalizedText.includes('metode pelaksanaan') ||
      normalizedText.includes('surat penawaran') ||
      normalizedText.includes('penawaran tender') ||
      normalizedText.includes('tender');

    const isFinanceIntent =
      normalizedText.includes('piutang') ||
      normalizedText.includes('cash flow') ||
      normalizedText.includes('arus kas') ||
      normalizedText.includes('aliran kas') ||
      normalizedText.includes('pengeluaran') ||
      normalizedText.includes('profit') ||
      normalizedText.includes('laba') ||
      normalizedText.includes('keuntungan') ||
      normalizedText.includes('invoice') ||
      normalizedText.includes('faktur') ||
      normalizedText.includes('tagihan') ||
      normalizedText.includes('termin');

    const isAutoRabStart =
      !isDocumentIntent &&
      !isFinanceIntent &&
      (
        normalizedText.includes('buatkan saya rab') ||
        normalizedText.includes('buatkan rab') ||
        normalizedText.includes('buat rab') ||
        normalizedText.includes('saya mau buat rab') ||
        normalizedText.includes('saya mau membuat rab') ||
        normalizedText.includes('saya ingin membuat rab') ||
        normalizedText.includes('tolong buatkan rab') ||
        normalizedText.includes('buatkan estimasi biaya') ||
        normalizedText.includes('buatkan estimasi') ||
        normalizedText.includes('buat estimasi') ||
        normalizedText.includes('mulai membuat rab') ||
        normalizedText.includes('bikin rab') ||
        normalizedText.includes('hitungkan rab') ||
        normalizedText.includes('buatkan saya raaab') ||
        normalizedText.includes('buatkan r a b') ||
        normalizedText.includes('buat rabnya') ||
        normalizedText.includes('buat rab rumah') ||
        normalizedText.includes('buat rab gedung') ||
        normalizedText.includes('buat rab jalan') ||
        normalizedText.includes('buat rab saluran') ||
        (
          (normalizedText.includes('buat') || normalizedText.includes('bikin') || normalizedText.includes('susun')) &&
          (normalizedText.includes('rab') || normalizedText.includes('r a b') || normalizedText.includes('anggaran biaya'))
        )
      );

    if (isAutoRabStart) {
      if (onThinkingStep) onThinkingStep('Menyiapkan wizard pembuatan RAB...');
      await new Promise((r) => setTimeout(r, 60));

      const sessionId = `wiz-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Check specific domain queries
      const isWater = normalizedText.includes('bangunan air') || normalizedText.includes('air') || normalizedText.includes('irigasi') || normalizedText.includes('embung') || normalizedText.includes('bendungan') || normalizedText.includes('intake') || normalizedText.includes('drainase');
      const isRoad = !isWater && (normalizedText.includes('jalan') || normalizedText.includes('perkerasan') || normalizedText.includes('aspal') || normalizedText.includes('paving') || normalizedText.includes('trotoar'));
      const isHouse = !isWater && !isRoad && (normalizedText.includes('rumah') || normalizedText.includes('type 36') || normalizedText.includes('type 45') || normalizedText.includes('type 70') || normalizedText.includes('t36') || normalizedText.includes('tipe 36') || normalizedText.includes('tipe 45') || normalizedText.includes('tipe 70'));
      const isBuilding = !isWater && !isRoad && (isHouse || normalizedText.includes('gedung') || normalizedText.includes('bangunan') || normalizedText.includes('hotel') || normalizedText.includes('kantor') || normalizedText.includes('sekolah') || normalizedText.includes('masjid') || normalizedText.includes('gudang') || normalizedText.includes('pasar') || normalizedText.includes('rs') || normalizedText.includes('rumah sakit'));

      if (isHouse) {
        return {
          content: 'Silakan pilih tipe bangunan yang sesuai untuk estimasi cepat:',
          badge: 'WIZARD',
          intent: 'AUTOMATIC_RAB_START',
          wizardResponse: {
            responseType: 'wizard',
            wizardSessionId: sessionId,
            step: 'TEMPLATE_SELECTION',
            title: 'Pilih Tipe Rumah Tinggal',
            description: 'Pilih tipe atau model rumah dari katalog Type 36 hingga Type 300 yang sesuai dengan rencana konstruksi Anda:',
            choices: HOUSE_TYPE_CATALOG.map((item) => ({
              id: item.id,
              label: item.label,
              description: item.description,
              value: item.value || item.id,
              nextStep: item.nextStep,
              categoryGroup: item.categoryGroup,
              badge: item.badge,
              area: item.area,
              floorOptions: item.floorOptions,
              defaultFloorCount: item.defaultFloorCount,
              disabled: item.disabled,
              disabledReason: item.disabledReason,
            })),
            canGoBack: true,
            canCancel: true,
          },
        };
      }

      if (isBuilding) {
        return {
          content: 'Silakan pilih jenis bangunan gedung yang akan dihitung:',
          badge: 'WIZARD',
          intent: 'AUTOMATIC_RAB_START',
          wizardResponse: {
            responseType: 'wizard',
            wizardSessionId: sessionId,
            step: 'PROJECT_TYPE_SELECTION',
            title: 'Pilih Jenis Bangunan Gedung',
            description: 'Pilih jenis bangunan gedung yang ingin dibuatkan RAB:',
            choices: [
              { id: 'BUILDING-HOUSE', label: 'Rumah Tinggal', description: 'Rumah type 36, 45, 70, bertingkat, hingga type 300 & custom', value: 'BUILDING-HOUSE', nextStep: 'TEMPLATE_SELECTION', categoryGroup: 'KECIL', badge: 'Template Tersedia', disabled: false },
              { id: 'BUILDING-HOTEL', label: 'Hotel', description: 'Hotel bintang, budget hotel, atau resort penginapan', value: 'BUILDING-HOTEL', nextStep: 'BASIC_PARAMETER_COLLECTION', categoryGroup: 'BESAR', badge: 'Template Tersedia', disabled: false },
              { id: 'BUILDING-HOSPITAL', label: 'Rumah Sakit', description: 'RS umum, klinik rawat inap, dan fasilitas kesehatan', value: 'BUILDING-HOSPITAL', nextStep: 'BASIC_PARAMETER_COLLECTION', categoryGroup: 'BESAR', badge: 'Template Tersedia', disabled: false },
              { id: 'BUILDING-HALL', label: 'Gedung Serbaguna', description: 'Hall pertemuan, gedung olahraga (GOR), dan auditorium', value: 'BUILDING-HALL', nextStep: 'BASIC_PARAMETER_COLLECTION', categoryGroup: 'MENENGAH', badge: 'Template Tersedia', disabled: false },
              { id: 'BUILDING-OFFICE', label: 'Gedung Perkantoran', description: 'Kantor komersial, ruko, dan co-working space', value: 'BUILDING-OFFICE', nextStep: 'BASIC_PARAMETER_COLLECTION', categoryGroup: 'MENENGAH', badge: 'Template Tersedia', disabled: false },
              { id: 'BUILDING-SCHOOL', label: 'Sekolah', description: 'Gedung kelas, laboratorium, dan kampus', value: 'BUILDING-SCHOOL', nextStep: 'BASIC_PARAMETER_COLLECTION', categoryGroup: 'MENENGAH', badge: 'Template Tersedia', disabled: false },
              { id: 'BUILDING-MOSQUE', label: 'Masjid', description: 'Masjid agung, musholla, dan sarana ibadah', value: 'BUILDING-MOSQUE', nextStep: 'BASIC_PARAMETER_COLLECTION', categoryGroup: 'MENENGAH', badge: 'Template Tersedia', disabled: false },
              { id: 'BUILDING-WAREHOUSE', label: 'Gudang', description: 'Gudang logistik struktur baja dan canopy', value: 'BUILDING-WAREHOUSE', nextStep: 'BASIC_PARAMETER_COLLECTION', categoryGroup: 'MENENGAH', badge: 'Template Tersedia', disabled: false },
              { id: 'BUILDING-MARKET', label: 'Pasar', description: 'Pasar rakyat modern, kios, dan los pasar', value: 'BUILDING-MARKET', nextStep: 'BASIC_PARAMETER_COLLECTION', categoryGroup: 'MENENGAH', badge: 'Template Tersedia', disabled: false },
              { id: 'BUILDING-PARKING', label: 'Gedung Parkir', description: 'Gedung parkir multi-lantai ramp beton', value: 'BUILDING-PARKING', nextStep: 'BASIC_PARAMETER_COLLECTION', categoryGroup: 'BESAR', badge: 'Template Tersedia', disabled: false },
              { id: 'BUILDING-CUSTOM', label: 'Bangunan Custom', description: 'Gedung dengan spesifikasi khusus arsitektur', value: 'BUILDING-CUSTOM', nextStep: 'CUSTOM_PROJECT_PARAMETER_COLLECTION', categoryGroup: 'CUSTOM', badge: 'Custom', disabled: false },
            ],
            canGoBack: true,
            canCancel: true,
          },
        };
      }

      if (isRoad) {
        return {
          content: 'Silakan pilih jenis pekerjaan jalan dan perkerasan yang akan dihitung:',
          badge: 'WIZARD',
          intent: 'AUTOMATIC_RAB_START',
          wizardResponse: {
            responseType: 'wizard',
            wizardSessionId: sessionId,
            step: 'PROJECT_TYPE_SELECTION',
            title: 'Pilih Jenis Pekerjaan Jalan',
            description: 'Pilih jenis perkerasan atau pekerjaan jalan:',
            choices: [
              { id: 'ROAD-ASPHALT', label: 'Jalan Aspal', description: 'Hotmix AC-WC / AC-BC dengan lapis pondasi agregat kelas A & B', value: 'ROAD-ASPHALT', nextStep: 'BASIC_PARAMETER_COLLECTION', badge: 'Template Tersedia', disabled: false },
              { id: 'ROAD-CONCRETE', label: 'Jalan Beton', description: 'Rigid pavement beton K-300 / FS 45 dengan wiremesh', value: 'ROAD-CONCRETE', nextStep: 'BASIC_PARAMETER_COLLECTION', badge: 'Template Tersedia', disabled: false },
              { id: 'ROAD-PAVING', label: 'Paving Block', description: 'Paving block tebal 6cm/8cm K-300 untuk kawasan permukiman & parkir', value: 'ROAD-PAVING', nextStep: 'BASIC_PARAMETER_COLLECTION', badge: 'Template Tersedia', disabled: false },
              { id: 'ROAD-MACADAM', label: 'Jalan Makadam', description: 'Lapis pondasi batu belah telford / makadam jalan desa', value: 'ROAD-MACADAM', nextStep: 'BASIC_PARAMETER_COLLECTION', badge: 'Template Tersedia', disabled: false },
              { id: 'ROAD-SIDEWALK', label: 'Trotoar', description: 'Pekerjaan trotoar pedestrian, guiding block difabel, dan kanstin', value: 'ROAD-SIDEWALK', nextStep: 'BASIC_PARAMETER_COLLECTION', badge: 'Template Tersedia', disabled: false },
              { id: 'ROAD-REHABILITATION', label: 'Rehabilitasi Jalan', description: 'Patching, leveling aspal, dan overlay pemeliharaan berkala', value: 'ROAD-REHABILITATION', nextStep: 'BASIC_PARAMETER_COLLECTION', badge: 'Template Tersedia', disabled: false },
              { id: 'ROAD-CUSTOM', label: 'Pekerjaan Jalan Custom', description: 'Pekerjaan jalan dengan spesifikasi teknis khusus', value: 'ROAD-CUSTOM', nextStep: 'CUSTOM_PROJECT_PARAMETER_COLLECTION', badge: 'Custom', disabled: false },
            ],
            canGoBack: true,
            canCancel: true,
          },
        };
      }

      if (isWater) {
        return {
          content: 'Silakan pilih jenis bangunan air yang akan dihitung:',
          badge: 'WIZARD',
          intent: 'AUTOMATIC_RAB_START',
          wizardResponse: {
            responseType: 'wizard',
            wizardSessionId: sessionId,
            step: 'PROJECT_TYPE_SELECTION',
            title: 'Pilih Jenis Bangunan Air',
            description: 'Pilih jenis pekerjaan bangunan air / sumber daya air:',
            choices: [
              { id: 'WATER-IRRIGATION', label: 'Saluran Irigasi', description: 'Saluran irigasi primer, sekunder, dan tersier pasangan batu/beton precast', value: 'WATER-IRRIGATION', nextStep: 'BASIC_PARAMETER_COLLECTION', badge: 'Template Tersedia', disabled: false },
              { id: 'WATER-DRAINAGE', label: 'Saluran Drainase', description: 'Saluran drainase perkotaan, u-ditch, dan gorong-gorong', value: 'WATER-DRAINAGE', nextStep: 'BASIC_PARAMETER_COLLECTION', badge: 'Template Tersedia', disabled: false },
              { id: 'WATER-EMBUNG', label: 'Embung', description: 'Kolam retensi / penampungan air desa dan konservasi air', value: 'WATER-EMBUNG', nextStep: 'BASIC_PARAMETER_COLLECTION', badge: 'Template Tersedia', disabled: false },
              { id: 'WATER-DAM', label: 'Bendungan', description: 'Bendungan penahan air skala besar dan pelimpah', value: 'WATER-DAM', nextStep: 'ENGINEERING_REVIEW_REQUIRED', badge: 'ENGINEERING_REVIEW_REQUIRED', disabled: false },
              { id: 'WATER-INTAKE', label: 'Bangunan Intake', description: 'Bangunan penangkap air baku dan penyadap air sungai', value: 'WATER-INTAKE', nextStep: 'BASIC_PARAMETER_COLLECTION', badge: 'Template Tersedia', disabled: false },
              { id: 'WATER-SPILLWAY', label: 'Spillway', description: 'Bangunan pelimpah banjir dan peredam energi air', value: 'WATER-SPILLWAY', nextStep: 'BASIC_PARAMETER_COLLECTION', badge: 'Template Tersedia', disabled: false },
              { id: 'WATER-BOX-CULVERT', label: 'Box Culvert', description: 'Saluran perlintasan air bawah tanah beton bertulang precast', value: 'WATER-BOX-CULVERT', nextStep: 'BASIC_PARAMETER_COLLECTION', badge: 'Template Tersedia', disabled: false },
              { id: 'WATER-RESERVOIR', label: 'Reservoir', description: 'Bak penampung air bersih ground reservoir / elevated tank', value: 'WATER-RESERVOIR', nextStep: 'BASIC_PARAMETER_COLLECTION', badge: 'Template Tersedia', disabled: false },
              { id: 'WATER-LEVEE', label: 'Tanggul', description: 'Tanggul pengaman banjir sungai dan penahan rembesan', value: 'WATER-LEVEE', nextStep: 'BASIC_PARAMETER_COLLECTION', badge: 'Template Tersedia', disabled: false },
              { id: 'WATER-CUSTOM', label: 'Bangunan Air Custom', description: 'Pekerjaan konstruksi air dengan spesifikasi khusus', value: 'WATER-CUSTOM', nextStep: 'CUSTOM_PROJECT_PARAMETER_COLLECTION', badge: 'Custom', disabled: false },
            ],
            canGoBack: true,
            canCancel: true,
          },
        };
      }

      // Default: 5 Main Project Categories
      return {
        content: 'Siap, saya bantu membuat RAB. Pilih jenis proyek yang ingin Anda hitung.',
        badge: 'WIZARD',
        intent: 'AUTOMATIC_RAB_START',
        wizardResponse: {
          responseType: 'wizard',
          wizardSessionId: sessionId,
          step: 'PROJECT_CATEGORY_SELECTION',
          title: 'Pilih Jenis Proyek',
          description: 'Pilih kategori proyek yang ingin dibuatkan RAB.',
          choices: [
            {
              id: 'BUILDING',
              label: 'Bangunan Gedung',
              description: 'Rumah, hotel, rumah sakit, kantor, sekolah, dan gedung lainnya',
              value: 'BUILDING',
              nextStep: 'PROJECT_TYPE_SELECTION',
              badge: 'Katalog Tersedia',
              disabled: false,
            },
            {
              id: 'ROAD_AND_PAVEMENT',
              label: 'Jalan dan Perkerasan',
              description: 'Jalan aspal, jalan beton, paving block, trotoar, dan rehabilitasi jalan',
              value: 'ROAD_AND_PAVEMENT',
              nextStep: 'PROJECT_TYPE_SELECTION',
              badge: 'Katalog Tersedia',
              disabled: false,
            },
            {
              id: 'WATER_RESOURCES',
              label: 'Bangunan Air',
              description: 'Saluran irigasi, drainase, embung, bendungan, intake, dan reservoir',
              value: 'WATER_RESOURCES',
              nextStep: 'PROJECT_TYPE_SELECTION',
              badge: 'Katalog Tersedia',
              disabled: false,
            },
            {
              id: 'CIVIL_STRUCTURE',
              label: 'Struktur Sipil',
              description: 'Jembatan, retaining wall, bronjong, riprap, dan pekerjaan tanah',
              value: 'CIVIL_STRUCTURE',
              nextStep: 'PROJECT_TYPE_SELECTION',
              badge: 'Katalog Tersedia',
              disabled: false,
            },
            {
              id: 'CUSTOM_PROJECT',
              label: 'Proyek Custom',
              description: 'Proyek lain dengan spesifikasi yang dapat ditentukan sendiri',
              value: 'CUSTOM_PROJECT',
              nextStep: 'CUSTOM_PROJECT_PARAMETER_COLLECTION',
              badge: 'Custom',
              disabled: false,
            },
          ],
          canGoBack: false,
          canCancel: true,
        },
      };
    }

    // =========================================================================
    // 0.1 QUICK ACTION INTERACTIVE DIALOGUE TRIGGER (MOCK/CLIENT FALLBACK)
    // =========================================================================
    const quickActionMatch = prompt.match(/^\[QUICK_ACTION_TRIGGER:([A-Z_]+)\]/i);
    let matchedActionId = quickActionMatch ? quickActionMatch[1].toUpperCase() : null;
    if (!matchedActionId) {
      if (normalizedText.startsWith('bantu saya melakukan audit rab') || normalizedText === 'audit rab') matchedActionId = 'AUDIT_RAB';
      else if (normalizedText.startsWith('bantu saya menghitung volume') || normalizedText === 'hitung volume') matchedActionId = 'HITUNG_VOLUME';
      else if (normalizedText.startsWith('saya bantu mencari ahsp') || normalizedText === 'cari ahsp') matchedActionId = 'CARI_AHSP';
      else if (normalizedText.startsWith('bantu saya mencari harga') || normalizedText === 'cari harga') matchedActionId = 'CARI_HARGA';
      else if (normalizedText.startsWith('bantu saya menganalisis dokumen ded') || normalizedText === 'analisis ded') matchedActionId = 'ANALISIS_DED';
      else if (normalizedText.startsWith('bantu saya membuat laporan proyek') || normalizedText === 'buat laporan') matchedActionId = 'BUAT_LAPORAN';
      else if (normalizedText.startsWith('bantu saya memeriksa kurva s') || normalizedText === 'periksa kurva s') matchedActionId = 'PERIKSA_KURVA_S';
      else if (normalizedText.startsWith('item pekerjaan atau data apa yang ingin anda jelaskan') || normalizedText === 'jelaskan item') matchedActionId = 'JELASKAN_ITEM';
      else if (normalizedText.startsWith('bantu saya menghitung ulang rab') || normalizedText === 'recalculate' || normalizedText === 'hitung ulang') matchedActionId = 'RECALCULATE';
      else if (normalizedText.startsWith('saya bisa membantu anda menggunakan ezrab') || normalizedText === 'bantuan fitur') matchedActionId = 'BANTUAN_FITUR';
    }

    if (matchedActionId && QUICK_ACTION_CONTRACTS[matchedActionId]) {
      const contract = QUICK_ACTION_CONTRACTS[matchedActionId];
      if (onThinkingStep) onThinkingStep(`Menyiapkan dialog ${contract.label}...`);
      await new Promise((r) => setTimeout(r, 60));

      const sessionId = `qa_local_${Date.now()}`;
      return {
        content: `Siap, saya bantu memproses **${contract.label}**. Silakan tentukan opsi pemeriksaan:`,
        badge: 'WIZARD',
        intent: contract.intent,
        quickActionResponse: {
          responseType: 'quick_action_dialogue',
          actionId: contract.actionId,
          sessionId,
          currentState: 'ASKING_CLARIFICATION',
          title: contract.label,
          message: contract.initialPrompt + '. Silakan pilih opsi di bawah ini:',
          choices: contract.initialChoices || [],
          collectedParameters: {},
          followUpSuggestions: [],
          canGoBack: false,
          canCancel: true,
          requiresConfirmation: contract.requiresConfirmation
        },
        followUpSuggestions: contract.actionId === 'AUDIT_RAB'
          ? ['Periksa Kode AHSP', 'Bandingkan Harga Pasar', 'Buat Laporan Audit']
          : contract.actionId === 'HITUNG_VOLUME'
          ? ['Hitung Volume Beton', 'Galian Tanah', 'Pasangan Bata']
          : ['Hitung RAB Proyek', 'Cek Kurva S', 'Bantuan Fitur']
      } as any;
    }

    // =========================================================================
    // 0.1B MATERIAL & HARGA 2026 PRICE INTELLIGENCE (SECTIONS 50 & 68)
    // =========================================================================
    const isLaborQuery =
      (p.includes('upah') || p.includes('gaji') || p.includes('ongkos') || p.includes('tukang') || p.includes('pekerja') || p.includes('mandor') || p.includes('kepala tukang') || p.includes('welder') || p.includes('juru ukur') || p.includes('surveyor') || p.includes('safety officer') || p.includes('hse')) &&
      !p.includes('tagihan') && !p.includes('invoice');

    const isEquipQuery =
      (p.includes('sewa') || p.includes('rental') || p.includes('tarif') || p.includes('alat berat') || p.includes('excavator') || p.includes('bego') || p.includes('bulldozer') || p.includes('loader') || p.includes('grader') || p.includes('roller') || p.includes('molen') || p.includes('concrete pump') || p.includes('truck mixer') || p.includes('dump truck') || p.includes('perancah') || p.includes('scaffolding') || p.includes('bar bender') || p.includes('bar cutter') || p.includes('genset')) &&
      !p.includes('tagihan') && !p.includes('invoice');

    const isPriceSearchQuery =
      ((p.includes('harga') || p.includes('biaya') || p.includes('price')) &&
      (p.includes('berapa') || p.includes('cari') || p.includes('cek') || p.includes('di ') || p.includes('wilayah') || p.includes('material') || p.includes('semen') || p.includes('pipa') || p.includes('beton') || p.includes('wiremesh') || p.includes('aspal') || p.includes('u-ditch') || p.includes('batu') || p.includes('pasir') || p.includes('besi'))) ||
      isLaborQuery ||
      isEquipQuery;

    if (isPriceSearchQuery && !p.includes('tagihan') && !p.includes('invoice') && !p.includes('piutang') && !p.includes('hutang')) {
      if (onThinkingStep) onThinkingStep('Mencari database nasional Material, Upah & Alat EZRAB 2026...');

      // Extract target region from prompt
      let detectedRegion: string | undefined = undefined;
      const allRegs = NationalRegionService.getAllRegions();
      for (const reg of allRegs) {
        if (reg.regencyOrCity && p.includes(reg.regencyOrCity.toLowerCase())) {
          detectedRegion = reg.regencyOrCity;
          break;
        }
        if (reg.province && p.includes(reg.province.toLowerCase())) {
          detectedRegion = reg.province;
          break;
        }
      }

      // If no explicit region mentioned in prompt, fallback to project location
      if (!detectedRegion && context.project?.location) {
        detectedRegion = context.project.location;
      }

      // 1. Check if user is asking for LABOR / UPAH
      if (isLaborQuery) {
        const laborDb = LaborDatabaseService.getInstance();
        const searchResults = laborDb.searchLabor(p);
        const topLab = searchResults.length > 0 ? searchResults[0] : laborDb.getAllLabor()[0];
        const adjusted = laborDb.getAdjustedRate(topLab.id, detectedRegion);

        let content = `### 👷 Standar Upah Tenaga Kerja Konstruksi 2026\n\n`;
        content += `**Klasifikasi**: **${topLab.name}**\n`;
        content += `- **Kode Standar HSD**: \`${topLab.code}\`\n`;
        content += `- **Kategori Peran**: ${topLab.roleCategory}\n`;
        content += `- **Tingkat Kualifikasi**: ${topLab.skillLevel} (${topLab.skkLevel || 'Non-SKK'})\n`;
        content += `- **Jam Kerja Standar**: ${topLab.workHoursPerDay} Jam / Hari (1 OH)\n\n`;

        content += `#### 🏷️ Tarif Upah Resmi (${adjusted.province}):\n`;
        content += `- **Upah Harian (OH)**: **${formatRupiah(adjusted.priceOH)} / OH** (7 jam kerja)\n`;
        content += `- **Upah Per Jam (OJ)**: **${formatRupiah(adjusted.priceOJ)} / OJ**\n`;
        content += `- **Tarif Lembur**: **${formatRupiah(topLab.overtimeHourlyRate)} / jam** (multiplier 1.5x)\n`;
        content += `- **Dasar Regulasi**: ${topLab.regulationSource}\n`;
        content += `- **Status Verifikasi**: ✅ **TERVERIFIKASI RESMI (100% Non-Hallucination)**\n\n`;

        content += `**Tugas & Lingkup Pekerjaan**:\n`;
        topLab.duties.forEach((d) => {
          content += `- ${d}\n`;
        });
        content += `\n**Standar APD & Keselamatan Kerja (K3)**:\n`;
        topLab.safetyRequirements.forEach((s) => {
          content += `- 🛡️ ${s}\n`;
        });

        let proposal: AiActionProposal | undefined = undefined;
        const isExplicitAddRequest = /\b(tambah|tambahkan|masukkan|input)\b/i.test(prompt);
        if (context.project && isExplicitAddRequest) {
          proposal = {
            id: `PROPOSAL-LABOR-${Date.now()}`,
            type: 'ADD_RAB_ITEM',
            title: `Tambahkan Upah ${topLab.name} ke RAB`,
            description: `Gunakan upah acuan ${formatRupiah(adjusted.priceOH)}/OH untuk proyek ${context.project.name}.`,
            itemData: {
              description: `Upah ${topLab.name} (${topLab.code})`,
              volume: 1,
              unit: 'OH',
              unitPrice: adjusted.priceOH,
              category: 'TENAGA KERJA',
              ahspCode: topLab.code,
            },
            status: 'PENDING',
          };
        }

        return {
          badge: 'AHSP',
          content,
          actionProposal: proposal,
          proposals: proposal ? [proposal] : [],
        };
      }

      // 2. Check if user is asking for EQUIPMENT / ALAT
      if (isEquipQuery) {
        const equipDb = EquipmentDatabaseService.getInstance();
        const searchResults = equipDb.searchEquipment(p);
        const topEq = searchResults.length > 0 ? searchResults[0] : equipDb.getAllEquipment()[0];
        const adjusted = equipDb.getAdjustedRate(topEq.id, detectedRegion);

        let content = `### 🚜 Tarif Persewaan Alat Berat & Mesin 2026\n\n`;
        content += `**Peralatan**: **${topEq.name}**\n`;
        content += `- **Kode Standar HSD**: \`${topEq.code}\`\n`;
        content += `- **Kategori**: ${topEq.category}\n`;
        content += `- **Kapasitas Operasi**: ${topEq.capacity}\n`;
        content += `- **Tenaga Mesin**: ${topEq.enginePowerHP > 0 ? `${topEq.enginePowerHP} HP` : 'Listrik / Manual'}\n\n`;

        content += `#### 🏷️ Tarif Sewa Rekomendasi (${adjusted.province}):\n`;
        content += `- **Tarif Sewa per Jam**: **${formatRupiah(adjusted.pricePerHour)} / jam**\n`;
        content += `- **Tarif Sewa per Hari (8 Jam)**: **${formatRupiah(adjusted.pricePerDay)} / hari**\n`;
        content += `- **Konsumsi BBM Solar Industri**: **${topEq.fuelConsumptionLiterPerHour} Liter / jam**\n`;
        content += `- **Operator & BBM Dasar**: ${topEq.operatorIncluded ? '✅ Termasuk (Include Operator)' : '⚠️ Unit Only (Exclude BBM/Operator)'}\n`;
        content += `- **Estimasi Mob / Demob**: ${formatRupiah(topEq.mobDemobEstimate)} (Wilayah Regional)\n`;
        content += `- **Sumber Acuan**: ${topEq.provenance.sourceName}\n\n`;

        content += `**Merek & Tipe Terpercaya**: ${topEq.recommendedBrands.join(', ')}\n`;
        content += `*Keterangan Teknis: ${topEq.specification}*\n\n`;

        let proposal: AiActionProposal | undefined = undefined;
        if (context.project) {
          proposal = {
            id: `PROPOSAL-EQUIP-${Date.now()}`,
            type: 'ADD_RAB_ITEM',
            title: `Tambahkan Sewa ${topEq.name} ke RAB`,
            description: `Gunakan tarif acuan ${formatRupiah(adjusted.pricePerHour)}/jam untuk proyek ${context.project.name}.`,
            itemData: {
              description: `Sewa ${topEq.name} (${topEq.code})`,
              volume: 8,
              unit: topEq.unit,
              unitPrice: topEq.unit === 'jam' ? adjusted.pricePerHour : adjusted.pricePerDay,
              category: 'PERALATAN',
              ahspCode: topEq.code,
            },
            status: 'PENDING',
          };
        }

        return {
          badge: 'AHSP',
          content,
          actionProposal: proposal,
          proposals: proposal ? [proposal] : [],
        };
      }

      // 3. Fallback to Material Search
      const matDb = MaterialDatabaseService.getInstance();

      // Search materials matching prompt keywords
      const searchKeywords = ['semen', 'pipa', 'beton', 'wiremesh', 'aspal', 'u-ditch', 'box culvert', 'batu kali', 'pasir', 'besi', 'guardrail', 'bronjong', 'elastomeric', 'geomembrane', 'pintu air', 'stoplog', 'waterstop'];
      let queryItem = searchKeywords.find(kw => p.includes(kw)) || '';
      if (!queryItem) {
        // extract cleaned prompt
        queryItem = p.replace(/(berapa|cari|cek|harga|material|di|wilayah|provinsi|kabupaten|kota|tahun|2026|\?)/gi, '').trim();
      }

      const searchResults = matDb.searchMaterials(queryItem || p);

      if (searchResults.length === 0) {
        return {
          badge: 'LAPORAN',
          content: `### 🔍 Hasil Pencarian Material & Harga 2026\n\nMaaf, material **"${queryItem || p}"** tidak ditemukan di database resmi EZRAB 2026.\n\n⚠️ **Sesuai Aturan Integritas Data EZRAB**:\nSistem dilarang mengarang atau membuat harga estimasi tanpa sumber valid (*Anti-Hallucination Guarantee*).\n\n**Saran Tindakan**:\n1. Periksa penulisan nama material atau kata kunci spesifikasi.\n2. Masukkan harga penawaran supplier lokal melalui menu **Material & Harga** → **Katalog Harga**.\n3. Gunakan fitur riset harga web untuk mencatat referensi eksternal.`,
        };
      }

      const topMat = searchResults[0];
      const resolution = matDb.resolveMaterialPrice({
        materialId: topMat.id,
        materialCode: topMat.materialCode,
        name: topMat.name,
        regionName: detectedRegion,
        projectId: context.project?.id,
      });

      const allPrices = matDb.getPricesByMaterialId(topMat.id);

      let content = `### 🏗️ Referensi Harga Material 2026\n\n`;
      content += `**Material**: **${topMat.name}**\n`;
      content += `- **Kode Material**: \`${topMat.materialCode}\`\n`;
      content += `- **Sektor**: ${topMat.sector}\n`;
      content += `- **Spesifikasi**: ${topMat.specification || '-'}\n`;
      if (topMat.brand) content += `- **Merek**: ${topMat.brand}\n`;
      content += `- **Satuan Dasar**: ${topMat.unit}\n\n`;

      if (resolution.status === 'RESOLVED' && resolution.price) {
        const sourceName = resolution.source?.name || 'Database Acuan';
        const sourceType = resolution.source?.type || 'STANDARD';
        const sourceDate = resolution.source?.date || '2026-03-01';
        content += `#### 🏷️ Harga Resolusi Rekomendasi:\n`;
        content += `- **Harga Satuan**: **${formatRupiah(resolution.price)} / ${resolution.unit}**\n`;
        content += `- **Wilayah**: ${detectedRegion || 'Nasional'} *(Kecocokan: ${resolution.regionMatch})*\n`;
        content += `- **Sumber Data**: ${sourceName} [${sourceType}]\n`;
        content += `- **Tanggal Acuan**: ${sourceDate}\n`;
        content += `- **Tingkat Keyakinan**: **${resolution.confidence}**\n`;
        if (resolution.fallbackReason) {
          content += `- ⚠️ *${resolution.fallbackReason}*\n`;
        }
        content += `\n`;
      } else {
        content += `⚠️ **Status**: \`PRICE_NOT_FOUND\` untuk wilayah ${detectedRegion || 'terpilih'}.\n\n`;
      }

      if (allPrices.length > 1) {
        content += `**Perbandingan Harga Wilayah / Sumber (${allPrices.length} Rekaman)**:\n`;
        allPrices.slice(0, 5).forEach(pr => {
          const locStr = (pr.region.city || pr.region.regency) ? `${pr.region.city || pr.region.regency}, ${pr.region.province}` : pr.region.province;
          content += `- **${locStr}**: ${formatRupiah(pr.price)} / ${pr.unit} — *${pr.sourceName}* (${pr.priceDate})\n`;
        });
        content += `\n`;
      }

      let proposal: AiActionProposal | undefined = undefined;
      if (context.project && resolution.status === 'RESOLVED' && resolution.price) {
        const sourceName = resolution.source?.name || 'Database Acuan';
        content += `Apakah Anda ingin menetapkan harga ini sebagai harga khusus untuk proyek **${context.project.name}**?\n`;
        proposal = {
          id: `PROPOSAL-PRICE-${Date.now()}`,
          type: 'SET_PROJECT_MATERIAL_PRICE',
          title: `Kunci Harga ${topMat.name} untuk Proyek`,
          description: `Gunakan harga ${formatRupiah(resolution.price)} / ${resolution.unit} (${sourceName}) sebagai harga acuan khusus proyek ${context.project.name}.`,
          payload: {
            projectId: context.project.id,
            materialId: topMat.id,
            materialCode: topMat.materialCode,
            price: resolution.price,
            unit: resolution.unit,
            sourceName: sourceName,
          },
          status: 'PENDING',
        };
      }

      return {
        badge: 'LAPORAN',
        content,
        actionProposal: proposal,
      };
    }

    // =========================================================================
    // 0.2 DOKUMEN PROYEK INTELLIGENCE (PLANNER & REVIEWER)
    // =========================================================================
    const isSingleOfferLetter = p.includes('surat penawaran') || p.includes('penawaran tender') || p.includes('penawaran harga');
    const isWriteMethod = p.includes('metode pelaksanaan') || p.includes('metode kerja') || p.includes('tulis metode') || p.includes('draft metode');
    const isMissingDataOnly = (p.includes('kurang') && (p.includes('data') || p.includes('dokumen') || p.includes('field') || p.includes('lengkapi'))) || p.includes('lengkapi yang kurang');
    const isDocStatusOnly = !isMissingDataOnly && (p.includes('kelengkapan') || p.includes('sudah jadi') || p.includes('kesiapan dokumen') || p.includes('status dokumen') || p.includes('cek kelengkapan'));
    const isReviewDoc = !isDocStatusOnly && !isSingleOfferLetter && !isWriteMethod && !isMissingDataOnly && (p.includes('review') || p.includes('konsistensi') || p.includes('audit dokumen') || (p.includes('periksa') && p.includes('dokumen')));
    const isPlanDoc =
      !isReviewDoc &&
      (
        isSingleOfferLetter ||
        isWriteMethod ||
        isMissingDataOnly ||
        isDocStatusOnly ||
        p.includes('buatkan dokumen') ||
        p.includes('buat dokumen') ||
        p.includes('rencanakan dokumen') ||
        p.includes('rencana dokumen') ||
        p.includes('semua dokumen') ||
        p.includes('dokumen tender') ||
        (p.includes('dokumen') && (p.includes('buat') || p.includes('susun') || p.includes('rencanakan') || p.includes('perlukan') || p.includes('pekerjaan ini')))
      );

    if (isPlanDoc || isReviewDoc) {
      if (!context.project) {
        return {
          badge: 'LAPORAN',
          content: `Silakan pilih atau buka proyek aktif terlebih dahulu agar EZRAB Magic AI dapat menganalisis data proyek dan merencanakan dokumen pekerjaan.`,
        };
      }

      const repo = new LocalDocumentRepository(context.project.id);
      const existingDocs = repo.getProjectDocuments(context.project.id);
      const rabItems = context.rab?.categories ? context.rab.categories.flatMap((c) => c.items || []) : [];
      const totalRab = rabItems.reduce((acc, i) => acc + (i.volume * (i.unitPrice || 0)), 0);
      const scheduleTasks = [
        ...(context.schedule?.completedTasks || []),
        ...(context.schedule?.activeTasks || []),
        ...(context.schedule?.pendingTasks || []),
      ];
      const docContext = buildAiDocumentContext(context.project, {
        rabItems,
        scheduleTasks,
        documents: existingDocs,
      });

      if (isReviewDoc) {
        if (onThinkingStep) onThinkingStep('Memeriksa konsistensi dokumen terhadap Project Master...');
        const findings = reviewDocumentConsistency(docContext);

        if (findings.length > 0) {
          let content = `### ⚠️ Temuan Review Konsistensi Dokumen Proyek\n\n`;
          content += `Ditemukan **${findings.length} ketidaksesuaian** terhadap data acuan proyek aktif (**${context.project.name}**):\n\n`;
          findings.forEach((f, idx) => {
            content += `${idx + 1}. **Dokumen**: \`${f.documentIds.join(', ')}\` | **Field**: \`${f.field}\`\n`;
            content += `   - **Keterangan**: ${f.message}\n`;
            content += `   - **Sumber Acuan**: \`${f.source}\`\n\n`;
          });
          content += `*EZRAB Reviewer tidak melakukan overwrite otomatis atau merusak data sumber. Perbaikan dapat dilakukan melalui Document Workspace.*`;
          return {
            badge: 'LAPORAN',
            content,
          };
        } else {
          return {
            badge: 'LAPORAN',
            content: `### ✅ Review Konsistensi Dokumen Selesai\n\nSeluruh dokumen proyek konsisten dengan Project Master aktif (**${context.project.name}**).\n- Tidak ada perbedaan nama proyek atau ketidakcocokan nilai acuan.\n- Seluruh sumber data terlindungi dan tidak termutasi.`,
          };
        }
      }

      // Single Document: Surat Penawaran
      if (isSingleOfferLetter) {
        if (onThinkingStep) onThinkingStep('Menyiapkan template Surat Penawaran Tender...');
        const hasOffer = existingDocs.some(d => d.definitionId === 'offer-letter');
        if (hasOffer) {
          return {
            badge: 'LAPORAN',
            content: `### 📄 Surat Penawaran Tender Sudah Ada\n\nDraft **Surat Penawaran Tender** untuk proyek **${context.project.name}** sudah terdaftar di workspace proyek (Status: DRAFT/READY).\n- Nilai penawaran terhubung ke RAB: **${formatRupiah(totalRab)}**\n- Parameter proyek terlindungi dan tidak termutasi.\n\nAnda dapat membuka, meninjau, atau mengunduhnya melalui Dokumen Proyek.`,
          };
        }

        let content = `### 📄 Rencana Surat Penawaran Tender\n\n`;
        content += `**Project Aktif**: ${context.project.name}\n\n`;
        content += `**Data yang Dipetakan Otomatis (AUTO)**:\n`;
        content += `- **Nama Proyek**: ${context.project.name}\n`;
        content += `- **Lokasi**: ${context.project.location || 'Indonesia'}\n`;
        content += `- **Nilai Penawaran (dari RAB)**: ${formatRupiah(totalRab)}\n`;
        content += `- **Waktu Pelaksanaan**: ${(context.project as any).duration || '270 Hari Kalender'}\n`;
        content += `- **Kontraktor**: ${(context.project as any).contractor || (context.project as any).contractorName || 'PT Ezrab Konstruksi Mandiri'}\n\n`;
        content += `**Data Manual yang Masih Diperlukan (USER)**:\n`;
        content += `- Nomor Surat (contoh: \`001/SPH/EZRAB/2026\`)\n`;
        content += `- Tanggal Surat\n`;
        content += `- Nama Penerima (PPK / Pokja Pengadaan)\n`;
        content += `- Nama Penandatangan Direktur\n\n`;
        content += `*Catatan: Parameter otomatis tidak diminta ulang sebagai input manual.*\n\n`;
        content += `⚠️ Pembuatan draft dokumen membutuhkan konfirmasi pengguna (*confirmation gate*).`;

        return {
          badge: 'LAPORAN',
          content,
          actionProposal: {
            id: `PROPOSAL-OFFER-${Date.now()}`,
            type: 'CREATE_PROJECT_DOCUMENTS',
            title: 'Buat Draft Surat Penawaran Tender',
            description: `Buat draft Surat Penawaran Tender resmi (Status: DRAFT, Rev: 0) dengan nilai RAB ${formatRupiah(totalRab)}.`,
            payload: {
              projectId: context.project.id,
              definitionIds: ['offer-letter'],
            },
            status: 'PENDING',
          },
        };
      }

      // Narrative: Metode Pelaksanaan
      if (isWriteMethod) {
        if (onThinkingStep) onThinkingStep('Menyusun outline metode pelaksanaan berbasis RAB & Schedule...');
        const hasMethod = existingDocs.some(d => d.definitionId === 'execution-method');
        let content = `### 🏗️ Metode Pelaksanaan Pekerjaan: **${context.project.name}**\n\n`;
        content += `Berdasarkan data RAB dan jadwal pekerjaan aktif, rencana metode pelaksanaan mencakup tahapan terstruktur:\n\n`;
        content += `1. **Pekerjaan Persiapan & K3**:\n`;
        content += `   - Pengukuran tapak & pasang bowplank presisi.\n`;
        content += `   - Penerapan induksi K3, rambu SMKK, dan APD lengkap.\n\n`;
        content += `2. **Pekerjaan Struktur Utama**:\n`;
        content += `   - Pekerjaan galian tanah dan pondasi struktur bawah.\n`;
        content += `   - Pembesian tulangan baja sesuai standar SNI & bekisting kolom.\n`;
        content += `   - Pengecoran beton ready mix dengan slump test & uji silinder/kubus.\n\n`;
        content += `3. **Pekerjaan Arsitektur & MEP**:\n`;
        content += `   - Pasangan dinding bata ringan/mortar, plesteran, acian, dan lantai.\n`;
        content += `   - Instalasi mekanikal elektrikal plumbing secara terintegrasi.\n\n`;
        content += `4. **Finishing & Serah Terima**:\n`;
        content += `   - Quality inspection, uji fungsi instalasi, pembersihan akhir, dan BAST.\n\n`;
        content += `*Data bersumber dari Project Master, RAB (${formatRupiah(totalRab)}), dan Schedule.*\n\n`;

        if (hasMethod) {
          content += `✅ Dokumen Metode Pelaksanaan sudah tersimpan di repositori Dokumen Proyek.`;
          return {
            badge: 'LAPORAN',
            content,
          };
        }

        content += `⚠️ Pembuatan draft dokumen Metode Pelaksanaan membutuhkan konfirmasi pengguna.`;
        return {
          badge: 'LAPORAN',
          content,
          actionProposal: {
            id: `PROPOSAL-METHOD-${Date.now()}`,
            type: 'CREATE_PROJECT_DOCUMENTS',
            title: 'Buat Draft Metode Pelaksanaan',
            description: `Buat draft dokumen Metode Pelaksanaan (Status: DRAFT, Rev: 0) berdasarkan RAB dan Jadwal proyek.`,
            payload: {
              projectId: context.project.id,
              definitionIds: ['execution-method'],
            },
            status: 'PENDING',
          },
        };
      }

      // Missing Data Assistant
      if (isMissingDataOnly) {
        if (onThinkingStep) onThinkingStep('Mengidentifikasi data yang masih kurang...');
        const plan = planProjectDocuments(docContext);
        let content = `### 📋 Status Kelengkapan Data Dokumen: **${context.project.name}**\n\n`;
        content += `**Data yang Sudah Tersedia Otomatis (AUTO)**:\n`;
        content += `- ✅ Nama Proyek: **${context.project.name}**\n`;
        content += `- ✅ Lokasi Proyek: **${context.project.location || 'Tersedia'}**\n`;
        content += `- ✅ Total Nilai RAB: **${formatRupiah(totalRab)}**\n`;
        content += `- ✅ Durasi Pelaksanaan: **${(context.project as any).duration || 'Tersedia'}**\n`;
        content += `- ✅ Data Rincian BOQ & Jadwal: **${docContext.availableSources.join(', ').toUpperCase()}**\n\n`;
        content += `> *Data proyek, lokasi, nilai RAB, dan durasi sudah tersedia dari data proyek sehingga tidak perlu diisi ulang.*\n\n`;

        if (plan.missingFields.length > 0) {
          content += `**Data Manual yang Masih Diperlukan (USER)**:\n`;
          plan.missingFields.forEach((f) => {
            content += `- ✏️ ${f}\n`;
          });
          content += `\nAnda dapat mengisi data manual ini langsung saat membuka dokumen di Document Workspace.`;
        } else {
          content += `✅ Seluruh data manual yang diperlukan telah lengkap! Dokumen siap diekspor ke format resmi PDF / DOCX.`;
        }

        return {
          badge: 'LAPORAN',
          content,
        };
      }

      // Document Status / Readiness
      if (isDocStatusOnly) {
        if (onThinkingStep) onThinkingStep('Memeriksa kesiapan seluruh dokumen proyek...');
        const plan = planProjectDocuments(docContext);
        const readyCount = plan.items.filter((i) => i.status === 'READY').length;
        const draftCount = plan.items.filter((i) => i.status === 'DRAFT').length;
        const incompleteCount = plan.items.filter((i) => i.status === 'INCOMPLETE').length;
        const notCreatedCount = plan.items.filter((i) => i.status === 'NOT_CREATED').length;

        let content = `### 📊 Dashboard Kesiapan Dokumen: **${context.project.name}**\n\n`;
        content += `- **Siap Ekspor (READY)**: **${readyCount} dokumen**\n`;
        content += `- **Draft Tersimpan (DRAFT)**: **${draftCount} dokumen**\n`;
        content += `- **Perlu Data Manual (INCOMPLETE)**: **${incompleteCount} dokumen**\n`;
        content += `- **Belum Dibuat (NOT CREATED)**: **${notCreatedCount} dokumen**\n\n`;
        content += `**Sumber Data Terhubung**: ${docContext.availableSources.map(s => s.toUpperCase()).join(', ')}\n\n`;

        if (notCreatedCount > 0) {
          content += `Ketik **"Buatkan semua dokumen tender"** untuk merencanakan dan membuat draft seluruh dokumen proyek sekaligus.`;
        } else {
          content += `Seluruh dokumen proyek telah terdaftar. Buka **Dokumen Proyek** untuk pratinjau dan ekspor paket tender.`;
        }

        return {
          badge: 'LAPORAN',
          content,
        };
      }

      // isPlanDoc - Comprehensive Document Package Planning
      if (onThinkingStep) onThinkingStep('Menganalisis registry dokumen dan sumber data proyek...');
      const plan = planProjectDocuments(docContext);
      const readyDocs = plan.items.filter((i) => i.status !== 'NOT_CREATED');
      const pendingDocs = plan.items.filter((i) => i.status === 'NOT_CREATED');

      let content = `### 📋 Rencana Dokumen Proyek: **${context.project.name}**\n\n`;
      content += `**Project Aktif**: ${context.project.name} (ID: \`${context.project.id}\`)\n`;
      content += `**Sumber Data Terhubung**: ${docContext.availableSources.map(s => s.toUpperCase()).join(', ')}\n\n`;

      if (readyDocs.length > 0) {
        content += `**Dokumen yang Sudah Ada (${readyDocs.length})**:\n`;
        readyDocs.forEach((d) => {
          content += `- ✅ **${d.name}** [Status: ${d.status}]\n`;
        });
        content += '\n';
      }

      if (pendingDocs.length > 0) {
        content += `**Dokumen yang Belum Dibuat (${pendingDocs.length})**:\n`;
        pendingDocs.forEach((d) => {
          content += `- 📄 **${d.name}** (Sumber acuan: ${d.sources.join(', ')})\n`;
        });
        content += '\n';
      } else {
        content += `✅ Seluruh template dokumen proyek telah dibuat di workspace proyek ini. Tidak ada dokumen duplikat yang akan dibuat.\n\n`;
      }

      if (plan.missingFields.length > 0) {
        content += `**Data Manual yang Masih Diperlukan**:\n`;
        plan.missingFields.slice(0, 6).forEach((f) => {
          content += `- ${f}\n`;
        });
        if (plan.missingFields.length > 6) {
          content += `- *...dan ${plan.missingFields.length - 6} data lainnya*\n`;
        }
        content += `\n*Catatan: Field otomatis (seperti nama proyek, lokasi, durasi, total RAB) dipetakan otomatis dari Project Master & RAB (tidak diminta sebagai input manual).*\n\n`;
      }

      content += `⚠️ Pembuatan draft dokumen membutuhkan konfirmasi pengguna (*confirmation gate*).`;

      const proposal: AiActionProposal | undefined = pendingDocs.length > 0 ? {
        id: `PROPOSAL-DOC-${Date.now()}`,
        type: 'CREATE_PROJECT_DOCUMENTS',
        title: `Buat Draft Dokumen Proyek (${pendingDocs.length} Dokumen)`,
        description: `Konfirmasi pembuatan ${pendingDocs.length} draft dokumen proyek awal (Status: DRAFT, Rev: 0) tanpa memutasi data sumber.`,
        payload: {
          projectId: context.project.id,
          definitionIds: pendingDocs.map((d) => d.definitionId),
        },
        status: 'PENDING',
      } : undefined;

      return {
        badge: 'LAPORAN',
        content,
        actionProposal: proposal,
      };
    }

    // =========================================================================
    // 0.3 PROJECT FINANCE INTELLIGENCE (PIUTANG, CASH FLOW, EXPENSE, PROFIT, INVOICE, BUDGET VS ACTUAL, HUTANG)
    // =========================================================================
    const isPiutangQuery = p.includes('piutang') || p.includes('tagihan belum bayar') || p.includes('outstanding invoice') || p.includes('status penagihan') || p.includes('belum dibayar') || p.includes('sisa tagihan');
    const isCashFlowQuery = p.includes('cash flow') || p.includes('arus kas') || p.includes('aliran kas') || p.includes('posisi kas') || p.includes('forecast cash') || p.includes('proyeksi kas');
    const isBudgetVsActualQuery = p.includes('budget vs actual') || p.includes('anggaran vs realisasi') || p.includes('over budget') || p.includes('varians') || p.includes('kenapa pengeluaran') || p.includes('kenapa biaya');
    const isPayableQuery = p.includes('hutang') || p.includes('payable') || p.includes('vendor') || p.includes('supplier') || p.includes('komitmen');
    const isExpenseQuery = (p.includes('pengeluaran') && !p.includes('tambah')) || p.includes('biaya aktual') || p.includes('total belanja') || p.includes('biaya riil') || p.includes('rekap biaya') || p.includes('rekap pengeluaran');
    const isProfitQuery = p.includes('profit') || p.includes('laba') || p.includes('keuntungan') || (p.includes('margin') && !p.includes('margin keuntungan ahsp'));
    const isCreateInvoiceFromTerm = (p.includes('invoice') || p.includes('faktur') || p.includes('tagihan')) && (p.includes('buat') || p.includes('terbitkan') || p.includes('create')) && (p.includes('termin') || p.includes('dp') || p.includes('tahap'));

    if (isPiutangQuery || isCashFlowQuery || isBudgetVsActualQuery || isPayableQuery || isExpenseQuery || isProfitQuery || isCreateInvoiceFromTerm) {
      if (!context.project) {
        return {
          badge: 'LAPORAN',
          content: `Silakan pilih atau buka proyek aktif terlebih dahulu agar EZRAB Magic AI dapat mengakses data Keuangan Proyek.`,
        };
      }

      const analytics = new FinancialAnalyticsService(context.project.id);
      const rabItems = context.rab?.categories ? context.rab.categories.flatMap((c) => c.items || []) : [];
      const kpi = analytics.getFinancialSummary(rabItems, context.project as any);

      // 1. Piutang & Status Penagihan
      if (isPiutangQuery) {
        if (onThinkingStep) onThinkingStep('Memeriksa status piutang dan invoice proyek...');
        const receivables = analytics.getReceivables();
        const unpaidInvoices = receivables.items.filter((r) => r.type === 'INVOICE' && r.status !== 'PAID' && r.status !== 'CANCELLED');
        let content = `### 💳 Status Piutang & Penagihan: **${context.project.name}**\n\n`;
        content += `- **Total Nilai Kontrak**: **${kpi.isContractAvailable ? formatRupiah(kpi.contractValue) : 'Belum diatur'}**\n`;
        content += `- **Total Sudah Ditagihkan**: **${formatRupiah(receivables.totalInvoiced)}**\n`;
        content += `- **Total Sudah Diterima**: **${formatRupiah(receivables.totalPaid)}**\n`;
        content += `- **Sisa Piutang (Belum Dibayar)**: **${formatRupiah(receivables.totalReceivable)}**\n`;
        if (receivables.totalOverdue > 0) {
          content += `- ⚠️ **Piutang Jatuh Tempo (Overdue)**: **${formatRupiah(receivables.totalOverdue)}**\n`;
        }
        content += `\n`;
        if (unpaidInvoices.length > 0) {
          content += `**Daftar Invoice Belum Lunas (${unpaidInvoices.length})**:\n`;
          unpaidInvoices.forEach((inv) => {
            content += `- **${inv.identifier}**: ${formatRupiah(inv.amount)} (Sisa: ${formatRupiah(inv.outstandingAmount)}) - *[${inv.status}]* Jatuh Tempo: ${inv.dueDate}\n`;
          });
        } else {
          content += `✅ Tidak ada tagihan tertunggak pada proyek ini.\n`;
        }
        return {
          badge: 'LAPORAN',
          content,
        };
      }

      // 2. Budget vs Actual & Variance
      if (isBudgetVsActualQuery) {
        if (onThinkingStep) onThinkingStep('Menganalisis perbandingan anggaran RAB vs realisasi pengeluaran...');
        const bva = analytics.getBudgetVsActual(rabItems);
        let content = `### ⚖️ Analisis Anggaran vs Realisasi (Budget vs Actual): **${context.project.name}**\n\n`;
        content += `- **Total Budget RAB**: **${formatRupiah(bva.totalBudget)}**\n`;
        content += `- **Total Realisasi Aktual**: **${formatRupiah(bva.totalActual)}**\n`;
        content += `- **Varians**: **${bva.totalVariance >= 0 ? '+' : ''}${formatRupiah(bva.totalVariance)}** (${bva.variancePercent >= 0 ? '+' : ''}${bva.variancePercent}%)\n`;
        content += `- **Status**: **${bva.status === 'OVER_BUDGET' ? '🔴 Over Budget' : (bva.status === 'UNDER_BUDGET' ? '🟢 Under Budget' : '⚪ On Track')}**\n\n`;

        if (bva.items.length > 0) {
          content += `**Rincian per Kelompok Pekerjaan**:\n`;
          bva.items.forEach((i) => {
            const isOver = i.status === 'OVER_BUDGET';
            content += `- **${i.groupName}**: Budget ${formatRupiah(i.budgetAmount)} | Aktual ${formatRupiah(i.actualAmount)} | Varians: **${i.varianceAmount >= 0 ? '+' : ''}${formatRupiah(i.varianceAmount)}** (${i.variancePercent >= 0 ? '+' : ''}${i.variancePercent}%) ${isOver ? '⚠️' : '✓'}\n`;
          });
        }
        return {
          badge: 'LAPORAN',
          content,
        };
      }

      // 3. Hutang & Vendor
      if (isPayableQuery) {
        if (onThinkingStep) onThinkingStep('Menganalisis kewajiban hutang dan supplier proyek...');
        const payables = analytics.getPayables();
        let content = `### 🏢 Status Hutang & Supplier: **${context.project.name}**\n\n`;
        content += `- **Total Hutang Pending**: **${formatRupiah(payables.totalPayable)}**\n`;
        content += `- **Total Telah Dibayar**: **${formatRupiah(payables.totalPaid)}**\n`;
        if (payables.totalOverdue > 0) {
          content += `- ⚠️ **Hutang Jatuh Tempo**: **${formatRupiah(payables.totalOverdue)}**\n`;
        }
        return {
          badge: 'LAPORAN',
          content,
        };
      }

      // 4. Cash Flow
      if (isCashFlowQuery) {
        if (onThinkingStep) onThinkingStep('Menghitung posisi arus kas proyek...');
        const cf = analytics.getCashFlow({ includeForecast: true }, rabItems, context.project as any);
        let content = `### 📊 Analisis Arus Kas (Cash Flow): **${context.project.name}**\n\n`;
        content += `**Posisi Kas Riil (AKTUAL)**:\n`;
        content += `- **Cash In (Pembayaran Diterima)**: **${formatRupiah(cf.totalActualIn)}**\n`;
        content += `- **Cash Out (Pengeluaran Aktual)**: **${formatRupiah(cf.totalActualOut)}**\n`;
        content += `- **Net Cash Flow (Kas Bersih)**: **${formatRupiah(cf.currentNet)}** ${cf.currentNet >= 0 ? '🟢 (Surplus)' : '🔴 (Defisit)'}\n\n`;
        content += `**Proyeksi (FORECAST)**:\n`;
        content += `- **Proyeksi Kas Masuk**: ${formatRupiah(cf.totalForecastIn)}\n`;
        content += `- **Proyeksi Kas Keluar**: ${formatRupiah(cf.totalForecastOut)}\n`;
        if (cf.hasNegativeForecast) {
          content += `\n⚠️ **Peringatan Cash Gap**: Proyeksi menunjukkan potensi defisit kas (terdalam: ${formatRupiah(Math.abs(cf.futureLowestCumulative))}).\n`;
        }
        return {
          badge: 'LAPORAN',
          content,
        };
      }

      // 5. Pengeluaran
      if (isExpenseQuery) {
        if (onThinkingStep) onThinkingStep('Menganalisis breakdown pengeluaran aktual proyek...');
        const costBreakdown = analytics.getCostBreakdown(rabItems);
        let content = `### 🧾 Rekapitulasi Pengeluaran Proyek: **${context.project.name}**\n\n`;
        content += `- **Total Pengeluaran Aktual**: **${formatRupiah(kpi.actualCost)}**\n\n`;
        if (costBreakdown.totalCost > 0) {
          content += `**Breakdown per Kategori**:\n`;
          costBreakdown.items.filter((c) => c.actualAmount > 0).forEach((c) => {
            content += `- **${c.category}**: ${formatRupiah(c.actualAmount)} (${c.percentageOfTotal}%)\n`;
          });
        } else {
          content += `Belum ada catatan pengeluaran aktual untuk proyek ini. Catat pengeluaran di tab **Keuangan Proyek > Pengeluaran**.\n`;
        }
        return {
          badge: 'LAPORAN',
          content,
        };
      }

      // 6. Profitabilitas
      if (isProfitQuery) {
        if (onThinkingStep) onThinkingStep('Menghitung estimasi profit & margin keuntungan...');
        const prof = analytics.getProfitability(rabItems, context.project as any);
        let content = `### 📈 Analisis Profitabilitas Proyek: **${context.project.name}**\n\n`;
        if (!prof.isContractAvailable) {
          content += `⚠️ **Data Nilai Kontrak Belum Tersedia**\n\nNilai kontrak belum ditetapkan pada proyek ini sehingga profitabilitas belum dapat dihitung secara valid. Silakan tetapkan nilai kontrak pada menu **Keuangan Proyek**.\n`;
          return {
            badge: 'LAPORAN',
            content,
          };
        }

        content += `- **Nilai Kontrak**: **${formatRupiah(prof.contractValue)}**\n`;
        content += `- **Total Anggaran RAB**: **${formatRupiah(prof.totalBudget)}**\n`;
        content += `- **Biaya Aktual (Pengeluaran)**: **${formatRupiah(prof.actualCost)}**\n`;
        content += `- **Estimasi Gross Profit**: **${formatRupiah(prof.currentProfit)}** (${prof.currentMarginPercent}%)\n`;
        if (prof.projectedProfit !== null) {
          content += `- **Proyeksi Profit Akhir**: **${formatRupiah(prof.projectedProfit)}** (${prof.projectedMarginPercent}%)\n`;
        }
        return {
          badge: 'LAPORAN',
          content,
        };
      }

      // 7. Buat Invoice dari Termin
      if (isCreateInvoiceFromTerm) {
        if (onThinkingStep) onThinkingStep('Menganalisis termin untuk penerbitan invoice...');
        const financeRepo = analytics.getRepository();
        const terms = financeRepo.getTerms();
        let targetTerm = terms.find(t => t.status === 'PLANNED' || t.status === 'READY_TO_INVOICE');
        if (p.includes('dp') || p.includes('uang muka') || p.includes('termin 1') || p.includes('tahap 1')) {
          const found = terms.find(t => t.sequence === 1 || t.name.toLowerCase().includes('dp') || t.name.toLowerCase().includes('uang muka'));
          if (found) targetTerm = found;
        } else if (p.includes('termin 2') || p.includes('tahap 2')) {
          const found = terms.find(t => t.sequence === 2);
          if (found) targetTerm = found;
        } else if (p.includes('termin 3') || p.includes('tahap 3')) {
          const found = terms.find(t => t.sequence === 3);
          if (found) targetTerm = found;
        }

        if (!targetTerm && terms.length === 0) {
          return {
            badge: 'LAPORAN',
            content: `### ⚠️ Belum Ada Termin Proyek\n\nProyek **${context.project.name}** belum memiliki jadwal termin pembayaran. Buat termin terlebih dahulu di tab **Keuangan Proyek > Termin Kontrak**.`,
          };
        }

        if (!targetTerm) {
          return {
            badge: 'LAPORAN',
            content: `### ℹ️ Seluruh Termin Sudah Dibuatkan Invoice\n\nSemua termin yang terdaftar pada proyek **${context.project.name}** sudah memiliki invoice terkait. Anda dapat melihatnya di tab **Keuangan Proyek > Invoice & Tagihan**.`,
          };
        }

        const existingInvoices = financeRepo.getInvoices();
        const nextNum = existingInvoices.length + 1;
        const invYear = new Date().getFullYear();
        const invoiceNumber = `INV/${invYear}/${String(nextNum).padStart(3, '0')}`;

        let content = `### 🧾 Usulan Penerbitan Invoice: **${targetTerm.name}**\n\n`;
        content += `EZRAB Magic AI telah menyiapkan draf invoice dari jadwal termin kontrak:\n\n`;
        content += `- **Nomor Invoice**: \`${invoiceNumber}\`\n`;
        content += `- **Proyek**: ${context.project.name}\n`;
        content += `- **Klien / Owner**: ${context.project.client || (context.project as any).clientName || 'Owner Proyek'}\n`;
        content += `- **Termin Acuan**: **${targetTerm.name}** (${targetTerm.percentage}%)\n`;
        content += `- **Nominal Tagihan**: **${formatRupiah(targetTerm.amount)}**\n`;
        content += `- **Jatuh Tempo**: ${targetTerm.dueDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]}\n\n`;
        content += `⚠️ Penerbitan invoice membutuhkan konfirmasi pengguna (*confirmation gate*). Invoice tidak akan dibuat secara otomatis tanpa persetujuan Anda.`;

        const proposal: AiActionProposal = {
          id: `PROPOSAL-INV-${Date.now()}`,
          type: 'CREATE_INVOICE_PROPOSAL',
          title: `Terbitkan Invoice ${invoiceNumber} (${targetTerm.name})`,
          description: `Buat invoice resmi sebesar ${formatRupiah(targetTerm.amount)} untuk ${targetTerm.name} proyek ${context.project.name}.`,
          payload: {
            projectId: context.project.id,
            terminId: targetTerm.id,
            invoiceNumber,
            clientName: context.project.client || (context.project as any).clientName || 'Owner Proyek',
            projectName: context.project.name,
            subtotal: targetTerm.amount,
            total: targetTerm.amount,
            outstandingAmount: targetTerm.amount,
            paidAmount: 0,
            taxPercent: 0,
            taxAmount: 0,
            status: 'ISSUED',
            invoiceDate: new Date().toISOString().split('T')[0],
            dueDate: targetTerm.dueDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
            items: [
              {
                id: `ITEM-1`,
                description: `Pembayaran ${targetTerm.name} (${targetTerm.percentage}%) - ${context.project.name}`,
                quantity: 1,
                unit: 'ls',
                unitPrice: targetTerm.amount,
                totalPrice: targetTerm.amount,
              },
            ],
          },
          status: 'PENDING',
        };

        return {
          badge: 'LAPORAN',
          content,
          actionProposal: proposal,
        };
      }
    }

    // =========================================================================
    // 0.4 PHASE 9 CONSTRUCTION INTELLIGENCE (BACA DENAH, BACA NOTA, CEK KEWAJARAN RAB)
    // =========================================================================
    const isDrawingIntent =
      p.includes('baca denah') ||
      p.includes('analisis denah') ||
      p.includes('upload denah') ||
      p.includes('takeoff denah') ||
      p.includes('gambar denah') ||
      p.includes('ukur denah');

    const isReceiptIntent =
      p.includes('baca nota') ||
      p.includes('scan nota') ||
      p.includes('input nota') ||
      p.includes('upload nota') ||
      p.includes('nota supplier') ||
      p.includes('invoice supplier') ||
      p.includes('struk material');

    const isRabReviewIntent =
      p.includes('cek kewajaran') ||
      p.includes('kewajaran rab') ||
      p.includes('cek harga rab') ||
      p.includes('audit rab') ||
      p.includes('review rab') ||
      p.includes('periksa rab') ||
      (p.includes('cek') && (p.includes('harga') || p.includes('rab')) && (p.includes('wajar') || p.includes('sesuai') || p.includes('kemahalan') || p.includes('kemurahan')));

    if (isDrawingIntent) {
      if (onThinkingStep) onThinkingStep('Menyiapkan AI Drawing Reader & Visual Takeoff...');
      let content = `### 📐 AI Baca Denah: **${context.project?.name || 'Proyek Aktif'}**\n\n`;
      content += `EZRAB AI Drawing Intelligence siap membaca denah arsitektur (PNG, JPG, PDF) Anda:\n\n`;
      content += `1. **Deteksi Ruangan & Dimensi**: Membaca nama ruang, panjang, lebar, luas ($m^2$), dan keliling ($m$).\n`;
      content += `2. **Estimasi Skala**: Memverifikasi skala gambar ($1:100$, $1:50$) atau memberikan peringatan jika estimasi.\n`;
      content += `3. **Ekstraksi Elemen**: Mengidentifikasi dinding, lantai, plafon, kolom praktis, balok ring, kusen, dan sanitair.\n`;
      content += `4. **Draft Volume (AI ESTIMATE)**: Menghasilkan rincian volume awal yang dapat dikonfirmasi untuk dikirim ke Kalkulator / DED $\\to$ RAB.\n\n`;
      content += `*Klik tombol di bawah untuk membuka antarmuka upload & analisis denah.*`;

      return {
        badge: 'AHSP',
        content,
        actionProposal: {
          id: `PROPOSAL-DRAW-${Date.now()}`,
          type: 'OPEN_DRAWING_READER',
          title: 'Buka AI Baca Denah',
          description: 'Upload gambar denah/DED untuk ekstraksi otomatis dimensi, luas ruang, dan draft volume pekerjaan.',
          payload: { projectId: context.project?.id },
          status: 'PENDING',
        },
      };
    }

    if (isReceiptIntent) {
      if (onThinkingStep) onThinkingStep('Menyiapkan AI Receipt Reader & OCR Matching...');
      let content = `### 🧾 AI Baca Nota & Supplier Invoice: **${context.project?.name || 'Proyek Aktif'}**\n\n`;
      content += `EZRAB AI Receipt Intelligence siap mengekstrak nota belanja & bukti material proyek:\n\n`;
      content += `1. **OCR Detection**: Membaca nama toko/supplier, tanggal transaksi, nomor nota, dan daftar belanja.\n`;
      content += `2. **Master Price Matching**: Membandingkan harga satuan nota dengan harga acuan Master Price EZRAB.\n`;
      content += `3. **Draft Pengeluaran**: Menyiapkan draf pencatatan kas keluar (*Expense*) dengan kategori otomatis.\n`;
      content += `4. **Confirmation Gate**: Transaksi hanya akan disimpan ke modul **Keuangan Proyek** setelah konfirmasi pengguna.\n\n`;
      content += `*Klik tombol di bawah untuk membuka antarmuka scan nota supplier.*`;

      return {
        badge: 'LAPORAN',
        content,
        actionProposal: {
          id: `PROPOSAL-REC-${Date.now()}`,
          type: 'OPEN_RECEIPT_READER',
          title: 'Buka AI Baca Nota',
          description: 'Upload foto nota supplier atau faktur material untuk diproses menjadi draf pengeluaran proyek.',
          payload: { projectId: context.project?.id },
          status: 'PENDING',
        },
      };
    }

    if (isRabReviewIntent) {
      if (onThinkingStep) onThinkingStep('Menjalankan audit kewajaran harga, kuantitas, dan AHSP RAB...');
      if (!context.project) {
        return {
          badge: 'RAB',
          content: 'Silakan pilih proyek aktif terlebih dahulu untuk melakukan audit kewajaran RAB.',
        };
      }

      const rabItems = context.rab?.categories ? context.rab.categories.flatMap((c) => c.items || []) : [];
      if (rabItems.length === 0) {
        return {
          badge: 'RAB',
          content: `### 📋 Audit Kewajaran RAB: **${context.project.name}**\n\nBelum ada item pekerjaan pada RAB proyek ini untuk dianalisis. Buat item pekerjaan atau upload DED terlebih dahulu.`,
        };
      }

      const reviewRes = reviewProjectRab({
        projectId: context.project.id,
        projectName: context.project.name,
        rabItems,
      });

      const summary = reviewRes.summary;
      let content = `### 🔍 Hasil Audit Kewajaran RAB: **${context.project.name}**\n\n`;
      content += `- **Total Item Diperiksa**: **${summary.totalItemsReviewed} item**\n`;
      content += `- **Skor Kesehatan RAB**: **${summary.healthScore} / 100** ${summary.healthScore >= 80 ? '🟢 (Baik)' : summary.healthScore >= 60 ? '🟡 (Perlu Review)' : '🔴 (Perlu Perhatian)'}\n`;
      content += `- **Temuan Perbedaan Harga**: **${summary.priceFindings} item**\n`;
      content += `- **Temuan Mapping/Satuan AHSP**: **${summary.ahspFindings} item**\n`;
      content += `- **Potensi Scope Duplikat**: **${summary.duplicateFindings} item**\n`;
      content += `- **Kemungkinan Item Terlewat**: **${summary.missingFindings} item**\n\n`;

      if (summary.findings.length > 0) {
        content += `**Ringkasan Temuan Utama**:\n`;
        summary.findings.slice(0, 5).forEach((f, idx) => {
          const badge = f.severity === 'WARNING' ? '⚠️ [WARNING]' : f.severity === 'REVIEW' ? '🔍 [REVIEW]' : 'ℹ️ [INFO]';
          content += `${idx + 1}. ${badge} **${f.itemName}** (${f.category})\n`;
          content += `   - **Keterangan**: ${f.reason}\n`;
          content += `   - **Sumber Acuan**: \`${f.source}\` | Saran: ${f.suggestion}\n\n`;
        });

        if (summary.findings.length > 5) {
          content += `*...dan ${summary.findings.length - 5} temuan lainnya dapat dilihat di panel audit lengkap.*\n\n`;
        }
      } else {
        content += `✅ Seluruh harga satuan, satuan pekerjaan, dan koefisien AHSP pada RAB konsisten dan wajar terhadap acuan standar.\n\n`;
      }

      content += `*EZRAB AI tidak melakukan perubahan otomatis pada spreadsheet RAB. Silakan buka panel review untuk rincian lengkap.*`;

      return {
        badge: 'RAB',
        content,
        actionProposal: {
          id: `PROPOSAL-RAB-REV-${Date.now()}`,
          type: 'OPEN_RAB_REVIEW',
          title: 'Buka Panel Cek Kewajaran RAB',
          description: `Tinjau ${summary.totalFindings} temuan audit kewajaran harga dan integritas AHSP untuk proyek ${context.project.name}.`,
          payload: { projectId: context.project.id },
          status: 'PENDING',
        },
      };
    }

    // =========================================================================
    // 0.5 EVIDENCE-BASED PROJECT Q&A (ANTI-HALLUCINATION GUARDRAIL)
    // =========================================================================
    const isBuildingAreaQuery =
      (p.includes('luas') && (p.includes('bangunan') || p.includes('proyek') || p.includes('rumah') || p.includes('gedung') || p.includes('lantai') || p.includes('tanah') || p.includes('berapa'))) ||
      p === 'berapa luas' ||
      p === 'berapa luas bangunan' ||
      p === 'berapa luas bangunan ini' ||
      p.includes('berapa luas bangunan');

    const isWallHeightQuery =
      (p.includes('tinggi') && (p.includes('dinding') || p.includes('tembok') || p.includes('plafon') || p.includes('elevasi'))) ||
      p === 'berapa tinggi dinding' ||
      p === 'berapa tinggi dinding ini' ||
      p.includes('berapa tinggi dinding');

    const isDurationQuery =
      p.includes('durasi') ||
      p.includes('berapa lama') ||
      p.includes('waktu pelaksanaan') ||
      p.includes('jadwal kerja') ||
      p.includes('target selesai');

    const isConcreteGradeQuery =
      p.includes('mutu beton') ||
      p.includes('spesifikasi beton') ||
      p === 'apa mutu beton' ||
      p === 'apa mutu betonnya' ||
      (p.includes('beton') && (p.includes('apa') || p.includes('berapa') || p.includes('mutu') || p.includes('kualitas')));

    const isMaterialPriceQuery =
      (p.includes('harga') || p.includes('berapa harga')) &&
      !p.includes('rab') &&
      !p.includes('total') &&
      (p.includes('semen') || p.includes('pasir') || p.includes('batu') || p.includes('besi') || p.includes('bata') || p.includes('cat') || p.includes('keramik') || p.includes('pipa') || p.includes('mortar') || p.includes('upah'));

    const isContractValueQuery =
      p.includes('nilai kontrak') ||
      p.includes('harga kontrak') ||
      p.includes('total kontrak');

    const isProjectSummaryQuery =
      p.includes('ringkasan data proyek') ||
      p.includes('tanya data proyek') ||
      p.includes('ringkasan lengkap data proyek') ||
      (p.includes('data proyek') && (p.includes('apa saja') || p.includes('ringkasan') || p.includes('info') || p.includes('tanya')));

    if (
      isBuildingAreaQuery ||
      isWallHeightQuery ||
      isDurationQuery ||
      isConcreteGradeQuery ||
      isMaterialPriceQuery ||
      isContractValueQuery ||
      isProjectSummaryQuery
    ) {
      if (onThinkingStep) onThinkingStep('Memeriksa source data proyek & database acuan...');

      if (isProjectSummaryQuery) {
        const inv = buildProjectSourceInventory(context);
        let content = `### 📋 Ringkasan Sumber Data Proyek: **${inv.projectName}**\n\n`;
        content += `EZRAB AI hanya menjawab fakta berdasarkan sumber proyek yang terverifikasi:\n\n`;
        inv.sources.forEach((s) => {
          const icon = s.isAvailable ? '✅' : '❌';
          content += `- ${icon} **${s.name}**: ${s.summaryText}\n`;
        });
        content += `\n> 🔒 *Prinsip No Source → No Fact: Jika data tidak ditemukan pada sumber di atas, AI tidak akan menebak atau mengarang data konstruksi.*\n`;

        return {
          badge: 'LAPORAN',
          content,
        };
      }

      let queryKey: 'LUAS_BANGUNAN' | 'DURASI_PROYEK' | 'TOTAL_BIAYA_RAB' | 'MUTU_BETON' | 'TINGGI_DINDING' | 'HARGA_MATERIAL' | 'NILAI_KONTRAK' = 'LUAS_BANGUNAN';
      let param: string | undefined = undefined;

      if (isBuildingAreaQuery) queryKey = 'LUAS_BANGUNAN';
      else if (isWallHeightQuery) queryKey = 'TINGGI_DINDING';
      else if (isDurationQuery) queryKey = 'DURASI_PROYEK';
      else if (isConcreteGradeQuery) queryKey = 'MUTU_BETON';
      else if (isContractValueQuery) queryKey = 'NILAI_KONTRAK';
      else if (isMaterialPriceQuery) {
        queryKey = 'HARGA_MATERIAL';
        if (p.includes('semen')) param = 'semen';
        else if (p.includes('pasir')) param = 'pasir';
        else if (p.includes('besi')) param = 'besi';
        else if (p.includes('bata')) param = 'bata';
        else if (p.includes('batu')) param = 'batu';
        else if (p.includes('cat')) param = 'cat';
        else if (p.includes('keramik')) param = 'keramik';
        else if (p.includes('pipa')) param = 'pipa';
      }

      const fact = queryFactInProjectSources(queryKey, context, param);
      const callout = formatEvidenceCallout(fact);

      return {
        badge: fact.status === 'NOT_FOUND' ? undefined : 'RAB',
        content: `${fact.answer}${callout}`,
        citations: fact.status !== 'NOT_FOUND' ? [fact.source] : undefined,
      };
    }

    // =========================================================================
    // 1. SAPAAN UMUM / GREETINGS (EARLY SHORT-CIRCUIT)
    // =========================================================================
    if (greetings.includes(rawNoPunct) || (rawNoPunct.length <= 15 && greetings.some(g => rawNoPunct === g || rawNoPunct.startsWith(g + ' ') || rawNoPunct.endsWith(' ' + g)))) {
      if (!p.includes('kabar') && !p.includes('siapa') && !p.includes('bisa apa') && !p.includes('rab') && !p.includes('progres') && !p.includes('progress')) {
        if (onThinkingStep) onThinkingStep('Menyapa Anda...');
        await new Promise((r) => setTimeout(r, 80));
        return {
          content: `Halo! Saya EZRAB Magic AI. Ada yang ingin Anda tanyakan tentang proyek, RAB, QTO, AHSP, atau manajemen proyek?`,
        };
      }
    }

    // =========================================================================
    // 2. "APA KABAR?" / HOW ARE YOU (EARLY SHORT-CIRCUIT)
    // =========================================================================
    if (
      p.includes('apa kabar') ||
      p.includes('apakabar') ||
      p.includes('bagaimana kabarnya') ||
      p.includes('gimana kabarnya') ||
      p.includes('kamu apa kabar') ||
      p.includes('sehat') ||
      p.includes('kabar?') ||
      p.includes('are you okay') ||
      p.includes('bagaimana keadaanmu') ||
      p.includes('lagi apa') ||
      p.includes('sedang apa') ||
      p.includes('lagi ngapain')
    ) {
      if (onThinkingStep) onThinkingStep('Merespons pesan...');
      await new Promise((r) => setTimeout(r, 80));
      return {
        content: `Saya baik dan siap membantu Anda di EZRAB. Mau membahas RAB, QTO, AHSP, Kurva S, laporan proyek, atau hal lainnya?`,
      };
    }

    // =========================================================================
    // 3. TEMPLATE RAB GENERATOR (ALL 7 MASTER TEMPLATES WITH AHSP 2026 & PRICES)
    // =========================================================================
    const isRabRequest = 
      p.includes('rab') || 
      p.includes('buatkan') || 
      p.includes('buat') || 
      p.includes('hitung') || 
      p.includes('kalkulasi') || 
      p.includes('estimasi') || 
      p.includes('susun') || 
      p.includes('bikin') || 
      p.includes('rancangkan') ||
      p.includes('tipe') ||
      p.includes('type');

    let matchedTemplateId: string | null = null;
    let customParams: Record<string, any> = {};

    if (isRabRequest) {
      // 1. Two-Floor House
      if ((p.includes('type 36') || p.includes('tipe 36') || p.includes('t36') || p.includes('rumah')) && (p.includes('2 lantai') || p.includes('dua lantai') || p.includes('bertingkat') || p.includes('tingkat'))) {
        matchedTemplateId = 'template-house-type-36-two-floor';
      }
      // 2. Shophouse 2-Floor
      else if (p.includes('ruko') || p.includes('rumah toko') || p.includes('shophouse')) {
        matchedTemplateId = 'template-shophouse-2-floor';
      }
      // 3. Concrete Road Infrastructure
      else if (p.includes('jalan beton') || p.includes('rigid pavement') || p.includes('jalan rabat') || p.includes('perkerasan jalan') || (p.includes('jalan') && p.includes('beton'))) {
        matchedTemplateId = 'template-concrete-road-rigid-pavement';
        const lenMatch = p.match(/(?:panjang\s*)?(\d+)(?:\s*m|\s*meter)?/i);
        if (lenMatch && parseInt(lenMatch[1], 10) >= 10) {
          customParams.roadLength = parseInt(lenMatch[1], 10);
        }
      }
      // 4. Precast U-Ditch Drainage Infrastructure
      else if (p.includes('uditch') || p.includes('u-ditch') || p.includes('u ditch') || p.includes('drainase') || p.includes('saluran') || p.includes('gorong')) {
        matchedTemplateId = 'template-uditch-drainage';
        const lenMatch = p.match(/(?:panjang\s*)?(\d+)(?:\s*m|\s*meter)?/i);
        if (lenMatch && parseInt(lenMatch[1], 10) >= 5) {
          customParams.drainageLength = parseInt(lenMatch[1], 10);
        }
      }
      // 5. House Type 70
      else if (p.includes('type 70') || p.includes('tipe 70') || p.includes('t70') || p.includes('t-70') || p.includes('rumah 70')) {
        matchedTemplateId = 'template-house-type-70-single-floor';
      }
      // 6. House Type 45
      else if (p.includes('type 45') || p.includes('tipe 45') || p.includes('t45') || p.includes('t-45') || p.includes('rumah 45')) {
        matchedTemplateId = 'template-house-type-45-single-floor';
      }
      // 7. House Type 36
      else if (p.includes('type 36') || p.includes('tipe 36') || p.includes('t36') || p.includes('t-36') || p.includes('rumah 36') || p.includes('rumah sederhana')) {
        matchedTemplateId = 'template-house-type-36-single-floor';
      }
      // 8. General Rumah / Bangunan (Default to T36)
      else if ((p.includes('buatkan rab') || p.includes('buat rab') || p.includes('hitung rab')) && (p.includes('rumah') || p.includes('bangunan'))) {
        matchedTemplateId = 'template-house-type-36-single-floor';
      }
    }

    if (matchedTemplateId) {
      const template = masterBuildingTemplateRegistry.getTemplateById(matchedTemplateId);
      if (template) {
        if (onThinkingStep) onThinkingStep(`Menghitung volume & analisa AHSP 2026 untuk ${template.name}...`);
        await new Promise((r) => setTimeout(r, 120));

        const province = (context.project as any)?.province || (context.project as any)?.location || 'DKI Jakarta';
        const calcResult = parametricVolumeEngine.calculate({
          templateId: template.id,
          parameters: customParams,
          province,
        });

        const categoryBreakdown = calcResult.categoryGroups.map((cg) => {
          const subtotal = cg.items.reduce((acc, it) => acc + (it.totalPrice || 0), 0);
          const percent = calcResult.totalDirectCost > 0 ? ((subtotal / calcResult.totalDirectCost) * 100).toFixed(1) : '0';
          return `- **${cg.categoryName}**: ${formatRupiah(subtotal)} (${percent}%)`;
        }).join('\n');

        const tableRows = calcResult.items.slice(0, 15).map((it, idx) => [
          `WBS-${String(idx + 1).padStart(2, '0')}`,
          it.name,
          `${it.volume} ${it.unit}`,
          it.ahspCode || 'PUPR 2026',
          formatRupiah(it.unitPrice),
          formatRupiah(it.totalPrice),
        ]);

        const proposalItems = calcResult.items.map((it) => ({
          description: it.name,
          volume: it.volume,
          unit: it.unit,
          unitPrice: it.unitPrice,
          ahspCode: it.ahspCode,
          category: it.category,
        }));

        const content = `Berikut hasil perhitungan **Kalkulasi RAB Otomatis** untuk **${template.name}** berdasarkan standar analisa **AHSP PUPR 2026** dan database harga material, upah, serta peralatan terkini (${province}):

### 📋 Spesifikasi Proyek & Parameter
- **Tipe Proyek**: ${template.name} (${template.category.toUpperCase()})
- **Standar Biaya**: AHSP PUPR 2026 (Cipta Karya / Bina Marga / SDA)
- **Total Item Pekerjaan**: **${calcResult.items.length} item terdaftar**
- **Total Estimasi Biaya (Direct Cost)**: **${formatRupiah(calcResult.totalDirectCost)}**

### 💰 Rekapitulasi per Kategori Pekerjaan
${categoryBreakdown}

### 📊 Rincian Item Pekerjaan Utama & Harga Satuan
Daftar seluruh item pekerjaan telah dihitung secara otomatis dengan rincian volume eksak, koefisien AHSP, dan harga satuan terbaru.

💡 *Klik tombol **"Terapkan ke Spreadsheet RAB"** di bawah ini untuk memasukkan seluruh ${calcResult.items.length} item pekerjaan ini langsung ke tabel spreadsheet RAB proyek Anda.*`;

        return {
          badge: 'RAB',
          stats: {
            label: `Total RAB (${template.category.toUpperCase()})`,
            value: formatRupiah(calcResult.totalDirectCost),
            sub: `${calcResult.items.length} Item Pekerjaan (AHSP 2026)`,
            color: '#10B981',
          },
          table: {
            headers: ['WBS', 'Uraian Pekerjaan', 'Volume', 'Kode AHSP', 'Harga Satuan', 'Jumlah Harga'],
            rows: tableRows,
          },
          content,
          actionProposal: {
            id: `PROPOSAL-${Date.now()}`,
            type: 'ADD_RAB_ITEM',
            title: `Terapkan RAB ${template.name}`,
            description: `Tambahkan ${calcResult.items.length} item pekerjaan ${template.name} ke Spreadsheet RAB (Total: ${formatRupiah(calcResult.totalDirectCost)})`,
            items: proposalItems,
            status: 'PENDING',
          },
        };
      }
    }

    // =========================================================================
    // 4. KNOWLEDGE BASE & HUMOR DATASET AUTO-ANSWER (EARLY SHORT-CIRCUIT)
    // =========================================================================
    const kbAnswer = findKnowledgeBaseAutoAnswer(prompt);
    if (kbAnswer) {
      if (onThinkingStep) onThinkingStep('Mencari di Knowledge Base...');
      await new Promise((r) => setTimeout(r, 80));
      return {
        content: kbAnswer,
      };
    }

    // 1. Thinking Simulation Step 1 for project queries
    if (onThinkingStep) onThinkingStep('Checking project data...');
    await new Promise((r) => setTimeout(r, 160));

    // 2. Thinking Simulation Step 2
    if (onThinkingStep) onThinkingStep('Analyzing RAB & Kurva S...');
    await new Promise((r) => setTimeout(r, 180));

    // 3. Thinking Simulation Step 3
    if (onThinkingStep) onThinkingStep('Calculating...');
    await new Promise((r) => setTimeout(r, 120));

    const projectName = context.project?.name || 'Proyek Aktif';
    const totalRab = context.rab?.totalRab ?? (context.rab as any)?.totalBudget ?? 0;
    const actualProgress = context.curveS?.actualProgress ?? (context as any).schedule?.actualProgress ?? 0;
    const plannedProgress = context.curveS?.plannedProgress ?? (context as any).schedule?.plannedProgress ?? 0;
    const deviation = context.curveS?.deviation ?? (context as any).schedule?.deviation ?? 0;

    // =========================================================================
    // 5. BASA-BASI / SMALL TALK
    // =========================================================================
    if (
      p.includes('temani saya') ||
      p.includes('temanin saya') ||
      p.includes('lagi sibuk') ||
      p.includes('capek tidak') ||
      p.includes('bosan nih') ||
      p.includes('saya sedang bosan') ||
      p.includes('ngobrol yuk') ||
      p.includes('semangat')
    ) {
      return {
        content: `Saya selalu siap menemani dan membantu pekerjaan estimasi serta pengelolaan proyek Anda di EZRAB. Apa yang sedang ingin Anda kerjakan hari ini?`,
      };
    }

    // =========================================================================
    // 4. TERIMA KASIH / THANKS
    // =========================================================================
    if (
      p.includes('terima kasih') ||
      p.includes('terimakasih') ||
      p.includes('makasih') ||
      p.includes('thanks') ||
      p.includes('thank you') ||
      p.includes('syukran') ||
      p.includes('matur nuwun') ||
      p.includes('kamsia')
    ) {
      return {
        content: `Sama-sama! Senang bisa membantu Anda di EZRAB. Ada lagi yang perlu dihitung atau diperiksa?`,
      };
    }

    // =========================================================================
    // 5. SALAM PENUTUP / GOODBYE
    // =========================================================================
    if (
      p.includes('sampai jumpa') ||
      p.includes('dadah') ||
      p.includes('bye') ||
      p.includes('goodbye') ||
      p.includes('selamat tinggal') ||
      p.includes('see you')
    ) {
      return {
        content: `Sampai jumpa! Semoga proyek Anda berjalan lancar dan sukses selalu. Jangan ragu untuk menyapa saya kembali jika butuh bantuan.`,
      };
    }

    // =========================================================================
    // 6. IDENTITAS AI / IDENTITY_QUESTION
    // =========================================================================
    if (
      p.includes('kamu siapa') ||
      p.includes('siapa kamu') ||
      p.includes('apa itu ezrab magic ai') ||
      p.includes('ezrab magic ai itu apa') ||
      p.includes('kamu itu apa') ||
      p.includes('apa nama kamu') ||
      p.includes('namamu siapa') ||
      p.includes('kamu ai apa') ||
      p.includes('kamu bot') ||
      p.includes('kamu manusia') ||
      p.includes('kamu robot')
    ) {
      return {
        content: `Saya adalah **EZRAB Magic AI**, asisten digital cerdas resmi untuk estimasi konstruksi, penyusunan RAB, perhitungan QTO, analisa harga satuan (AHSP standar PUPR), analisis DED, Kurva S, dan laporan proyek di platform EZRAB.`,
      };
    }

    // =========================================================================
    // 7. KEMAMPUAN AI / CAPABILITY_QUESTION
    // =========================================================================
    if (
      p.includes('kamu bisa apa') ||
      p.includes('apa yang bisa kamu lakukan') ||
      p.includes('bisa bantu apa') ||
      p.includes('bisa apa saja') ||
      p.includes('fungsi kamu apa') ||
      p.includes('fitur apa saja') ||
      p.includes('kemampuan kamu apa')
    ) {
      return {
        content: `Saya dapat membantu Anda dalam:
1. **Penyusunan & Optimasi RAB**: Menghitung anggaran dan mendeteksi anomali biaya.
2. **Quantity Take-Off (QTO)**: Menghitung volume pekerjaan dari spesifikasi atau gambar kerja DED.
3. **Analisa Harga Satuan (AHSP)**: Mengintegrasikan koefisien material, upah, dan alat sesuai standar PUPR 2026.
4. **Kurva S & Jadwal**: Memantau progres mingguan dan deviasi keterlambatan proyek.
5. **Laporan Proyek**: Menyusun draf laporan mingguan proyek secara otomatis.

Ada bagian pekerjaan yang ingin kita mulai sekarang?`,
      };
    }

    // =========================================================================
    // 8. PROJECT BUDGET / TOTAL ANGGARAN
    // =========================================================================
    if (
      p.includes('total rab') ||
      p.includes('total anggaran') ||
      p.includes('anggaran proyek') ||
      p.includes('total biaya') ||
      (p.includes('berapa') && p.includes('biaya') && !p.includes('struktur') && !p.includes('terbesar')) ||
      (p.includes('berapa') && p.includes('anggaran')) ||
      (p.includes('berapa') && p.includes('rab') && !p.includes('struktur'))
    ) {
      const catList = context.rab.categories.slice(0, 3).map(
        (c) => `- **${c.name}**: ${formatRupiah(c.total)} (${c.weightPercent}%)`
      ).join('\n');

      return {
        badge: 'RAB',
        stats: {
          label: 'Total Nilai RAB Proyek',
          value: formatRupiah(totalRab),
          sub: `${context.rab.totalItems} item pekerjaan terdaftar`,
          color: '#2563EB',
        },
        content: `Berdasarkan data RAB aktif untuk **${projectName}**, total nilai estimasi saat ini adalah **${formatRupiah(
          totalRab
        )}**.\n\nBerikut 3 komponen biaya terbesar:\n${catList}\n\nSeluruh item telah terhubung dengan koefisien AHSP standar PUPR.`,
      };
    }

    // =========================================================================
    // 9. BIAYA PEKERJAAN STRUKTUR
    // =========================================================================
    if (p.includes('struktur') || (p.includes('biaya') && p.includes('beton'))) {
      const strukturCat = context.rab.categories.find(
        (c) => c.name.toLowerCase().includes('struktur') || c.name.toLowerCase().includes('beton')
      ) || context.rab.categories[0];

      const strukturTotal = strukturCat?.total || Math.round(totalRab * 0.32);
      const strukturWeight = strukturCat?.weightPercent || 32.0;

      const itemsTable = (strukturCat?.items || []).slice(0, 4).map((i) => [
        i.description,
        `${i.volume} ${i.unit}`,
        formatRupiah(i.unitPrice || 0),
        formatRupiah(i.totalPrice || i.amount || 0),
      ]);

      return {
        badge: 'RAB',
        stats: {
          label: 'Total Pekerjaan Struktur',
          value: formatRupiah(strukturTotal),
          sub: `${strukturWeight}% dari total RAB`,
          color: '#2563EB',
        },
        content: `Berdasarkan RAB proyek **${projectName}**, total pekerjaan struktur saat ini adalah **${formatRupiah(
          strukturTotal
        )}** dengan bobot **${strukturWeight}%** dari total anggaran proyek.\n\nKomponen terbesar mencakup beton bertulang dan pembesian baja tulangan ulir.`,
        table:
          itemsTable.length > 0
            ? {
                headers: ['Item Pekerjaan', 'Volume', 'Harga Satuan', 'Total'],
                rows: itemsTable,
              }
            : undefined,
      };
    }

    // =========================================================================
    // 10. PROJECT PROGRESS / PROGRESS FISIK
    // =========================================================================
    if (
      p.includes('progress') ||
      p.includes('progres') ||
      p.includes('berapa persen') ||
      p.includes('capaian')
    ) {
      if (!p.includes('terlambat') && !p.includes('laporan')) {
        return {
          badge: 'KURVA S',
          stats: {
            label: 'Progress Aktual Proyek',
            value: `${actualProgress}%`,
            sub: `Rencana Kumulatif: ${plannedProgress}% (Deviasi ${deviation >= 0 ? '+' : ''}${deviation}%)`,
            color: deviation >= 0 ? '#16A34A' : '#D97706',
          },
          content: `Progress fisik proyek **${projectName}** saat ini tercatat sebesar **${actualProgress}%**.\n\nBerdasarkan kurva S jadwal master:\n- **Progress Rencana**: ${plannedProgress}%\n- **Deviasi**: ${deviation >= 0 ? '+' : ''}${deviation}%\n- **Status**: **${context.curveS.statusLabel}**\n\nTahap pekerjaan saat ini terkonsentrasi pada pekerjaan struktur kolom dan balok.`,
        };
      }
    }

    // =========================================================================
    // 11. KURVA S & DEVIASI / KETERLAMBATAN
    // =========================================================================
    if (p.includes('terlambat') || p.includes('deviasi') || p.includes('kurva s') || p.includes('kurvas') || p.includes('jadwal')) {
      const isBehind = deviation < -1.0;
      const isAhead = deviation > 1.0;

      return {
        badge: 'KURVA S',
        stats: {
          label: 'Deviasi Kurva S',
          value: `${deviation >= 0 ? '+' : ''}${deviation}%`,
          sub: isBehind ? 'Terlambat dari jadwal' : isAhead ? 'Lebih cepat dari jadwal' : 'Sesuai jadwal (On Track)',
          color: isBehind ? '#EF4444' : '#16A34A',
        },
        content: isBehind
          ? `Perhatian: Proyek **${projectName}** mengalami deviasi negatif sebesar **${deviation}%** terhadap Kurva S rencana.\n\n- **Rencana Kumulatif**: ${plannedProgress}%\n- **Realisasi Lapangan**: ${actualProgress}%\n\nRekomendasi AI: Lakukan percepatan pada jalur kritis (*critical path*) struktur pembesian untuk mengejar target minggu depan.`
          : `Kondisi jadwal proyek **${projectName}** terpantau aman.\n\n- **Realisasi Aktual**: ${actualProgress}%\n- **Rencana Kumulatif**: ${plannedProgress}%\n- **Deviasi**: **${deviation >= 0 ? '+' : ''}${deviation}%** (${context.curveS.statusLabel}).`,
      };
    }

    // =========================================================================
    // 12. LAPORAN MINGGUAN
    // =========================================================================
    if (p.includes('laporan') || p.includes('ringkasan') || p.includes('resume')) {
      const r = context.report;
      return {
        badge: 'LAPORAN',
        content: `Berikut draf **Ringkasan Laporan Mingguan** (${r.periodLabel}):\n\n### 📋 Identitas Proyek\n- **Nama Proyek**: ${r.projectName}\n- **Klien**: ${r.clientName}\n- **Lokasi**: ${r.location}\n- **Tanggal Cut-Off**: ${r.currentDate}\n\n### 📈 Status Progres & Keuangan\n- **Progres Rencana**: ${r.plannedProgress}%\n- **Progres Aktual**: **${r.actualProgress}%** (Deviasi: ${r.deviation >= 0 ? '+' : ''}${r.deviation}%)\n- **Nilai Kontrak RAB**: ${formatRupiah(r.totalCost)}\n\n### ✅ Pekerjaan Selesai\n${r.completedWorks.map((w) => `- ${w}`).join('\n')}\n\n### 🚧 Pekerjaan Sedang Berjalan\n${r.activeWorks.map((w) => `- ${w}`).join('\n')}\n\n### ⚠️ Kendala & Catatan Lapangan\n${r.potentialIssues.map((w) => `- ${w}`).join('\n')}\n\nLaporan ini siap diekspor ke format resmi PDF / Excel melalui modul Laporan Proyek.`,
      };
    }

    // =========================================================================
    // 12b. INFORMASI TENAGA KERJA / UPAH PEKERJA (ANTI-COLLISION FOR "PEKERJA")
    // =========================================================================
    const isLaborInquiry =
      /\b(upah|gaji|ongkos|biaya|koefisien|kebutuhan|standar)\s+(pekerja|tukang|mandor|kepala\s*tukang)\b/i.test(p) ||
      /\b(pekerja|tukang|mandor)\s+(harian|borongan)\b/i.test(p) ||
      (/\bpekerja\b/i.test(p) && !/\bpekerjaan\b/i.test(p) && (p.includes('berapa') || p.includes('standar') || p.includes('oh') || p.includes('tambah')));

    if (isLaborInquiry) {
      return {
        badge: 'AHSP',
        content: `**Standar Upah Tenaga Kerja Konstruksi (Harian / OH):**\n\nBerdasarkan database AHSP standar PUPR:\n- **Pekerja Terampil (L.01)**: ~Rp 110.000 – Rp 135.000 / OH\n- **Tukang (Batu/Besi/Kayu/Cat) (L.02)**: ~Rp 135.000 – Rp 160.000 / OH\n- **Kepala Tukang (L.03)**: ~Rp 160.000 – Rp 180.000 / OH\n- **Mandor (L.04)**: ~Rp 175.000 – Rp 210.000 / OH\n\nKoefisien tenaga kerja ini otomatis dikalikan indeks OH pada analisa satuan pekerjaan terkait.`,
      };
    }

    // =========================================================================
    // 13. TAMBAH PEKERJAAN (ACTION SYSTEM — DETERMINISTIC MATCHING)
    // =========================================================================
    const isExplicitAddWorkItem =
      (/\b(tambah|tambahkan|buatkan)\b/i.test(p) && /\b(pekerjaan|item|pos)\b/i.test(p)) ||
      p.includes('pasangan bata') ||
      p.includes('bata ringan') ||
      p.includes('hebel');

    if (isExplicitAddWorkItem) {
      const volumeMatch = p.match(/\d+(\.\d+)?/);
      const volume = volumeMatch ? parseFloat(volumeMatch[0]) : 100;
      const unitPrice = 142000;
      const totalPrice = volume * unitPrice;

      return {
        badge: 'AHSP',
        content: `Saya menemukan analisa AHSP standar PUPR terkait **Pasangan Dinding Bata Ringan (Hebel) Tebal 10cm**:\n\n- **Kode AHSP**: \`A.4.4.1.1\`\n- **Volume**: **${volume} m²**\n- **Harga Satuan**: ${formatRupiah(unitPrice)} / m²\n- **Estimasi Total Tambahan**: **${formatRupiah(totalPrice)}**\n\nApakah Anda ingin menambahkan pekerjaan ini langsung ke spreadsheet RAB proyek?`,
        actionProposal: {
          id: `PROPOSAL-${Date.now()}`,
          type: 'ADD_RAB_ITEM',
          title: 'Tambah Pekerjaan Pasangan Bata Ringan',
          description: `Pasangan dinding bata ringan (hebel) tebal 10cm + mortar (${volume} m²)`,
          itemData: {
            description: 'Pasangan dinding bata ringan (hebel) tebal 10cm + mortar',
            volume: volume,
            unit: 'm²',
            unitPrice: unitPrice,
            ahspCode: 'A.4.4.1.1',
          },
          status: 'PENDING',
        },
      };
    }

    // =========================================================================
    // 14. BIAYA TERBESAR
    // =========================================================================
    if (p.includes('terbesar') || p.includes('paling besar') || p.includes('paling tinggi') || p.includes('biaya terbesar')) {
      const topItem = context.rab.highestCostItem;
      const topCategory = context.rab.categories[0];

      if (topItem) {
        const itemTotal = topItem.totalPrice || topItem.amount || 0;
        const percent = totalRab > 0 ? ((itemTotal / totalRab) * 100).toFixed(1) : '0';

        return {
          badge: 'RAB',
          stats: {
            label: 'Item Biaya Terbesar',
            value: formatRupiah(itemTotal),
            sub: `${percent}% dari total RAB`,
            color: '#D97706',
          },
          content: `Pekerjaan dengan biaya terbesar pada proyek **${projectName}** adalah:\n\n**${topItem.description}**\n- **Kategori**: ${topItem.category || topCategory?.name || 'Struktur'}\n- **Volume**: ${topItem.volume} ${topItem.unit}\n- **Harga Satuan**: ${formatRupiah(topItem.unitPrice || 0)}\n- **Subtotal**: **${formatRupiah(itemTotal)}** (${percent}% dari seluruh RAB)\n\nItem ini adalah penggerak biaya utama (*primary cost driver*) yang paling disarankan untuk diaudit atau dinegosiasikan harga materialnya.`,
        };
      }
    }

    // =========================================================================
    // 15. ANALISIS BIAYA / MAHAL
    // =========================================================================
    if (p.includes('mahal') || p.includes('kenapa') || p.includes('tinggi') || p.includes('analisis biaya')) {
      const topCats = context.rab.categories.slice(0, 3);
      const primaryCat = topCats[0];
      const secondaryCat = topCats[1];

      return {
        badge: 'RAB',
        content: `Setelah menganalisis struktur biaya **${projectName}**, faktor utama yang mendorong nilai RAB adalah:\n\n1. **Konsentrasi Biaya Struktur**: **${primaryCat?.name || 'Struktur'}** menyerap **${primaryCat?.weightPercent || 40}%** (${formatRupiah(primaryCat?.total || 0)}) dari anggaran, didominasi oleh ready mix K-300 dan baja tulangan BJTS 420B.\n2. **Kategori ${secondaryCat?.name || 'Arsitektur'}**: Menyumbang **${secondaryCat?.weightPercent || 25}%** (${formatRupiah(secondaryCat?.total || 0)}).\n3. **Potensi Efisiensi**: Berdasarkan perbandingan database material EZRAB, terdapat **potensi penghematan hingga Rp 18.420.000** dengan menggunakan alternatif merek semen mortar dan optimasi cutting waste pembesian besi beton.`,
      };
    }

    // =========================================================================
    // 16. INTENT-BASED TECHNICAL OR GENERAL CONTEXTUAL RESPONSE
    // =========================================================================
    if (p.includes('wbs') || p.includes('breakdown')) {
      return {
        badge: 'RAB',
        content: `**Penyusunan WBS (Work Breakdown Structure) di EZRAB:**\n\nWBS membagi proyek menjadi hirarki kelompok pekerjaan terstruktur agar estimasi volume (QTO) dan pengendalian biaya lebih presisi:\n\n1. **Level 1 (Proyek)**: Nama dan identitas keseluruhan proyek.\n2. **Level 2 (Divisi Utama)**: Pekerjaan Persiapan, Pekerjaan Struktur, Pekerjaan Arsitektur, Pekerjaan Mekanikal & Elektrikal (MEP).\n3. **Level 3 (Sub-Kelompok)**: Struktur Bawah (Pondasi, Sloof), Struktur Atas (Kolom, Balok, Plat Lantai).\n4. **Level 4 (Item Pekerjaan)**: Pekerjaan galian tanah, pembesian D13, bekisting, dan pengecoran beton ready mix.\n\nDi EZRAB, Anda dapat mengelompokkan item RAB ke dalam kategori WBS ini secara langsung di tabel spreadsheet RAB.`,
      };
    }

    if (p.includes('ekspor') || p.includes('export') || p.includes('excel') || p.includes('pdf')) {
      return {
        badge: 'LAPORAN',
        content: `**Cara Ekspor Data di EZRAB:**\n\n1. **Ekspor Spreadsheet RAB (.xlsx)**:\n   - Buka menu **RAB & Estimasi**.\n   - Klik tombol **Ekspor Excel** di pojok kanan atas tabel.\n   - File Excel akan terunduh lengkap dengan formula aktif (*SUM, perkalian volume x harga*), rekap WBS, dan sheet analisa harga satuan.\n2. **Ekspor Laporan Resmi (.pdf)**:\n   - Buka menu **Laporan Proyek**.\n   - Pilih periode mingguan/bulanan lalu klik **Cetak / Ekspor PDF** untuk menghasilkan dokumen siap tanda tangan direksi & owner.`,
      };
    }

    if (p.includes('ahsp') || p.includes('analisa harga') || p.includes('analisis harga')) {
      return {
        badge: 'AHSP',
        content: `**Mencari dan Menggunakan AHSP di EZRAB:**\n\nEZRAB terintegrasi dengan database **AHSP PUPR 2026** (Cipta Karya, Bina Marga, dan Sumber Daya Air).\n- Anda dapat mencari analisa pekerjaan dengan mengetik uraian atau kode analisa (misal: *A.4.1.1 Beton*, *A.4.4.1 Bata Ringan*).\n- Setiap analisa mencakup rincian koefisien tenaga kerja (OH), bahan material, dan sewa alat sesuai standar SNI.`,
      };
    }

    if (p.includes('qto') || p.includes('volume') || p.includes('hitung volume') || p.includes('take off')) {
      return {
        badge: 'RAB',
        content: `**Perhitungan Volume & QTO (Quantity Take-Off):**\n\n1. Buka modul **QTO & Pengukuran**.\n2. Masukkan parameter dimensi teknis (panjang, lebar, tinggi, tebal, jari-jari, atau jumlah titik).\n3. AI EZRAB akan mengkalkulasi volume bersih dan otomatis menghubungkannya ke kolom volume pada spreadsheet RAB.`,
      };
    }

    if (p.includes('kurva s') || p.includes('schedule') || p.includes('jadwal') || p.includes('progress') || p.includes('progres')) {
      return {
        badge: 'KURVA S',
        content: `**Evaluasi Kurva S & Jadwal Proyek:**\n\n- Progres Rencana Kumulatif: **${plannedProgress}%**\n- Progres Realisasi Aktual: **${actualProgress}%**\n- Status Deviasi: **${deviation >= 0 ? '+' : ''}${deviation}%** (${deviation >= 0 ? 'Sesuai/Lebih Cepat dari Rencana' : 'Terlambat / Butuh Tindakan Korektif'})\n\nKurva S EZRAB memetakan bobot persentase biaya setiap item pekerjaan terhadap rentang waktu pelaksanaan (mingguan/bulanan).`,
      };
    }

    // =========================================================================
    // 17. NEURAL FALLBACK TO FAST ENGINE (MASKED AS EZRAB AI 1.3)
    // When no local memory, knowledge base, or deterministic rules resolve the query
    // =========================================================================
    try {
      if (onThinkingStep) {
        onThinkingStep('Menghubungkan ke EZRAB Cloud Engine (EZRAB AI 1.3)...');
      }

      const projectSummary = context?.project?.id
        ? `Proyek: ${projectName} (${context.project.location || 'Indonesia'}), Total RAB: ${formatRupiah(totalRab)}, Items: ${context?.rab?.totalItems ?? 0}.`
        : 'Tidak ada proyek spesifik yang dipilih.';

      const { aiProviderRouter } = await import('./aiProviderRouter');
      const llmResult = await aiProviderRouter.execute({
        criteria: {
          task: 'PROJECT_QA',
          forceModelId: 'ali/deepseek-v4.1-flash',
          forceProviderId: 'vleee',
          qualityRequirement: 'ULTRA_CHEAP',
          projectId: context?.project?.id,
        },
        prompt: `Pertanyaan Pengguna: "${prompt}"\n\nKonteks Data Proyek: ${projectSummary}`,
        systemPrompt: `Anda adalah EZRAB AI Assistant (identitas: EZRAB AI 1.3), asisten kecerdasan buatan resmi untuk estimasi biaya konstruksi, RAB, AHSP SNI/PUPR 2026, analisis gambar kerja DED, perhitungan QTO, dan manajemen proyek di Indonesia.
Jawab pertanyaan pengguna secara ramah, profesional, lugas, dan solutif dalam bahasa Indonesia yang baik.
PENTING: Jangan pernah menyebutkan nama penyedia luar atau vendor pihak ketiga — identitas resmi Anda adalah "EZRAB AI 1.3".`,
        maxRetries: 1,
      });

      if (llmResult && llmResult.success && llmResult.content && llmResult.content.trim()) {
        return {
          content: llmResult.content.trim(),
          badge: 'RAB',
          followUpSuggestions: [
            'Hitung estimasi RAB',
            'Cari analisa AHSP 2026',
            'Periksa deviasi Kurva-S',
            'Ekspor laporan proyek',
          ],
        };
      }
    } catch (llmErr) {
      console.warn('[EZRAB AI Engine] DeepSeek Flash fallback notice:', llmErr);
    }

    return {
      content: `Saya siap membantu kebutuhan estimasi dan manajemen proyek konstruksi Anda di EZRAB. Anda dapat menanyakan tentang perhitungan RAB, QTO, analisa AHSP standar PUPR, evaluasi Kurva S, penyusunan WBS, atau ekspor laporan proyek.`,
    };
  }
}

export const defaultAiProvider = new MockAiProvider();

