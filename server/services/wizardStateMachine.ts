import { aiDbAdapter } from '../database/dbAdapter';
import { TemplateResolver, AssistantChoice, AssistantQuestion, TemplateDefinition } from './templateResolver';
import { CalculationService } from './calculationService';
import { SafeDecimalEngine } from '../../src/engine/safeDecimalEngine';
import { RabItem } from '../../src/types';
import { HouseTypeCatalog } from '../../src/data/houseTypeCatalog';
import { getRegionalFactor, detectRegionFromText } from '../../src/data/regionalCostFactors';

export type WizardStep =
  | 'IDLE'
  | 'PROJECT_CATEGORY_SELECTION'
  | 'PROJECT_TYPE_SELECTION'
  | 'TEMPLATE_SELECTION'
  | 'TEMPLATE_CONFIRMATION'
  | 'TEMPLATE_NOT_READY'
  | 'BASIC_PARAMETER_COLLECTION'
  | 'ADVANCED_PARAMETER_COLLECTION'
  | 'VALIDATION'
  | 'RAB_PREVIEW'
  | 'USER_CONFIRMATION'
  | 'RAB_GENERATION'
  | 'ENGINEERING_REVIEW_REQUIRED'
  | 'SAVE_DRAFT'
  | 'CANCELLED';

export interface AssistantWizardResponse {
  responseType: 'wizard';
  wizardSessionId: string;
  step: WizardStep;
  title: string;
  message: string;
  questions: AssistantQuestion[];
  choices?: AssistantChoice[];
  progress?: {
    current: number;
    total: number;
    stepName: string;
  };
  canGoBack: boolean;
  canCancel: boolean;
  draftId?: string;
  selectedTemplate?: {
    id: string;
    templateId: string;
    label: string;
    area: number | null;
    floorCount: number;
    description: string;
    badge?: string;
    categoryGroup?: string;
  };
  summary?: {
    templateId?: string;
    templateName?: string;
    collectedParameters: Record<string, any>;
    itemsCount: number;
    directCost: number;
    overheadPercent: number;
    overheadAmount: number;
    profitPercent: number;
    profitAmount: number;
    subtotalBeforeTax: number;
    taxPercent: number;
    taxAmount: number;
    grandTotal: number;
    categories: Array<{ category: string; subtotal: number }>;
  };
}

export interface WizardSession {
  sessionId: string;
  workspaceId: string;
  userId: string;
  projectId: string;
  conversationId: string;
  currentStep: WizardStep;
  category?: string;
  subCategory?: string;
  templateId?: string;
  stepHistory: WizardStep[];
  collectedParameters: Record<string, any>;
  calculatedItems?: RabItem[];
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  appliedResult?: { success: boolean; projectId: string; addedItemsCount: number; grandTotal: number; message: string; idempotencyKey?: string };
  createdAt: string;
  updatedAt: string;
}

export class WizardStateMachine {
  private static sessions: Map<string, WizardSession> = new Map();

  public static startSession(input: {
    workspaceId: string;
    userId: string;
    projectId: string;
    conversationId: string;
    initialQuery?: string;
  }): AssistantWizardResponse {
    const sessionId = `wiz_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const rawQ = (input.initialQuery || '').toLowerCase().trim();
    const q = rawQ
      .replace(/\br[\s\.\-_]*a[\s\.\-_]*b(?:nya)?\b/gi, 'rab')
      .replace(/\bra+b+\b/gi, 'rab')
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Specific intent detection
    const houseQueryResult = HouseTypeCatalog.findFromQuery(rawQ);

    const isBuildingQuery =
      q.includes('gedung') ||
      q.includes('hotel') ||
      q.includes('kantor') ||
      q.includes('perkantoran') ||
      q.includes('sekolah') ||
      q.includes('masjid') ||
      q.includes('musholla') ||
      q.includes('mushola') ||
      q.includes('gudang') ||
      q.includes('warehouse') ||
      q.includes('parkir') ||
      q.includes('parking') ||
      q.includes('pasar') ||
      q.includes('market') ||
      q.includes('los') ||
      q.includes('rumah sakit') ||
      (q.includes('bangunan') && !q.includes('bangunan air') && !q.includes('rumah'));

    const isWaterQuery =
      !isBuildingQuery &&
      (q.includes('bangunan air') ||
        q.includes('saluran') ||
        q.includes('irigasi') ||
        q.includes('drainase') ||
        q.includes('uditch') ||
        q.includes('u ditch') ||
        q.includes('embung') ||
        q.includes('bendungan') ||
        q.includes('intake') ||
        q.includes('spillway') ||
        q.includes('box culvert') ||
        q.includes('reservoir') ||
        q.includes('tanggul'));

    const isRoadQuery =
      !isBuildingQuery &&
      !isWaterQuery &&
      (q.includes('jalan') ||
        q.includes('paving') ||
        q.includes('aspal') ||
        q.includes('rigid') ||
        q.includes('makadam') ||
        q.includes('trotoar'));

    const isCivilQuery =
      !isBuildingQuery &&
      !isWaterQuery &&
      !isRoadQuery &&
      (q.includes('sipil') ||
        q.includes('jembatan') ||
        q.includes('retaining wall') ||
        q.includes('bronjong') ||
        q.includes('riprap') ||
        q.includes('pekerjaan tanah'));

    const isHouseQuery =
      !isBuildingQuery &&
      !isWaterQuery &&
      !isRoadQuery &&
      !isCivilQuery &&
      (q.includes('rumah') ||
        !!houseQueryResult.item ||
        (houseQueryResult.extractedArea !== undefined && !q.includes('jalan') && !q.includes('saluran')) ||
        q.includes('tipe 36') ||
        q.includes('type 36') ||
        q.includes('tipe 45') ||
        q.includes('type 45') ||
        q.includes('tipe 70') ||
        q.includes('type 70') ||
        q.includes('2 lantai'));

    let initialStep: WizardStep = 'PROJECT_CATEGORY_SELECTION';
    let choices: AssistantChoice[] = [];
    let title = 'Pilih Jenis Proyek';
    let message = 'Siap, saya bantu membuat RAB. Pilih jenis proyek yang ingin Anda hitung.';
    let category: string | undefined = undefined;
    let subCategory: string | undefined = undefined;
    let initialTemplateId: string | undefined = undefined;
    let initialQuestions: AssistantQuestion[] = [];
    let initialCollectedParams: Record<string, any> = {};

    if (isHouseQuery) {
      category = 'BUILDING';
      subCategory = 'HOUSE';

      // 1. Direct match on specific house item
      if (houseQueryResult.item) {
        if (houseQueryResult.item.disabled) {
          // Template is coming soon / not ready -> inform user gracefully without fake calculations
          initialStep = 'TEMPLATE_SELECTION';
          title = `Status Template: ${houseQueryResult.item.label}`;
          message = `⚠️ **${houseQueryResult.item.label}** (${houseQueryResult.item.description}) belum memiliki modul kalkulasi dan template AHSP terverifikasi.\n\n${houseQueryResult.item.disabledReason || 'Template belum tersedia.'}\n\nSilakan pilih tipe rumah yang sudah memiliki template terverifikasi (Type 36, Type 45, Type 70) atau gunakan **Rumah Custom** untuk estimasi parametrik.`;
          choices = TemplateResolver.getHouseTemplateChoices();
        } else if (houseQueryResult.item.templateId) {
          // Template is verified and ready
          const registeredTemplate = TemplateResolver.getTemplate(houseQueryResult.item.templateId);
          if (registeredTemplate) {
            initialStep = 'BASIC_PARAMETER_COLLECTION';
            initialTemplateId = registeredTemplate.templateId;
            title = `Spesifikasi Teknis: ${registeredTemplate.name}`;
            message = `Template **${registeredTemplate.name}** telah dipilih. Tentukan parameter teknis di bawah ini untuk memulai kalkulasi RAB deterministik:`;
            initialQuestions = registeredTemplate.questions;
            const detectedRegion = detectRegionFromText(q);
            initialCollectedParams = {
              ...registeredTemplate.defaultValues,
              houseType: houseQueryResult.item.houseTypeId,
              building_area: houseQueryResult.extractedArea || registeredTemplate.defaultValues.building_area,
              buildingArea: houseQueryResult.extractedArea || registeredTemplate.defaultValues.building_area,
              floorCount: houseQueryResult.extractedFloors || houseQueryResult.item.defaultFloorCount || 1,
              areaSource: houseQueryResult.extractedArea ? 'USER_DEFINED' : 'TYPE_DEFAULT',
              location: detectedRegion
            };
          } else {
            initialStep = 'TEMPLATE_SELECTION';
            title = 'Pilih Tipe Rumah Tinggal';
            message = 'Silakan pilih tipe rumah tinggal yang ingin Anda buatkan estimasi RAB-nya:';
            choices = TemplateResolver.getHouseTemplateChoices();
          }
        } else {
          initialStep = 'TEMPLATE_SELECTION';
          title = 'Pilih Tipe Rumah Tinggal';
          message = 'Silakan pilih tipe rumah tinggal yang ingin Anda buatkan estimasi RAB-nya:';
          choices = TemplateResolver.getHouseTemplateChoices();
        }
      } else {
        // General house request (e.g. "buatkan saya rab rumah")
        initialStep = 'TEMPLATE_SELECTION';
        title = 'Pilih Tipe Rumah Tinggal';
        message = 'Silakan pilih tipe rumah tinggal (Type 36 hingga Type 300 atau Custom) yang ingin Anda buatkan estimasi RAB-nya:';
        choices = TemplateResolver.getHouseTemplateChoices();
      }
    } else if (isWaterQuery) {
      category = 'WATER_RESOURCES';
      subCategory = 'WATER';

      if (q.includes('uditch') || q.includes('u-ditch') || q.includes('u ditch') || q.includes('irigasi') || q.includes('drainase') || q.includes('saluran')) {
        const t = TemplateResolver.getTemplate('DRAIN-OPEN-UDITCH');
        if (t) {
          initialStep = 'BASIC_PARAMETER_COLLECTION';
          initialTemplateId = t.templateId;
          title = `Spesifikasi Teknis: ${t.name}`;
          message = `Template **${t.name}** telah dipilih. Tentukan dimensi saluran dan spesifikasi teknis di bawah ini:`;
          initialQuestions = t.questions;
          initialCollectedParams = { ...t.defaultValues };
        } else {
          initialStep = 'PROJECT_TYPE_SELECTION';
          title = 'Pilih Tipe Bangunan Air';
          message = 'Silakan pilih jenis bangunan air atau saluran drainase yang ingin Anda susunkan RAB-nya:';
          choices = TemplateResolver.getWaterTemplateChoices();
        }
      } else {
        initialStep = 'PROJECT_TYPE_SELECTION';
        title = 'Pilih Tipe Bangunan Air';
        message = 'Silakan pilih jenis bangunan air atau saluran drainase yang ingin Anda susunkan RAB-nya:';
        choices = TemplateResolver.getWaterTemplateChoices();
      }
    } else if (isBuildingQuery) {
      category = 'BUILDING';
      const detectedRegion = detectRegionFromText(q);

      if (q.includes('masjid') || q.includes('musholla') || q.includes('mushola')) {
        const t = TemplateResolver.getTemplate('BUILDING-MOSQUE');
        if (t) {
          initialStep = 'BASIC_PARAMETER_COLLECTION';
          initialTemplateId = t.templateId;
          subCategory = 'BUILDING_MOSQUE';
          title = `Spesifikasi Teknis: ${t.name}`;
          message = `Template **${t.name}** telah dipilih. Tentukan parameter teknis kubah, atap, dan fasilitas wudhu di bawah ini:`;
          initialQuestions = t.questions;
          initialCollectedParams = { ...t.defaultValues, location: detectedRegion };
        } else {
          initialStep = 'PROJECT_TYPE_SELECTION';
          title = 'Pilih Tipe Bangunan Gedung';
          message = 'Silakan pilih jenis bangunan gedung yang ingin Anda susunkan RAB-nya:';
          choices = TemplateResolver.getBuildingChoices();
        }
      } else if (q.includes('gudang') || q.includes('warehouse') || q.includes('pabrik')) {
        const t = TemplateResolver.getTemplate('BUILDING-WAREHOUSE');
        if (t) {
          initialStep = 'BASIC_PARAMETER_COLLECTION';
          initialTemplateId = t.templateId;
          subCategory = 'BUILDING_WAREHOUSE';
          title = `Spesifikasi Teknis: ${t.name}`;
          message = `Template **${t.name}** telah dipilih. Tentukan dimensi gudang, struktur rangka baja WF, dan lantai kerja di bawah ini:`;
          initialQuestions = t.questions;
          initialCollectedParams = { ...t.defaultValues, location: detectedRegion };
        } else {
          initialStep = 'PROJECT_TYPE_SELECTION';
          title = 'Pilih Tipe Bangunan Gedung';
          message = 'Silakan pilih jenis bangunan gedung yang ingin Anda susunkan RAB-nya:';
          choices = TemplateResolver.getBuildingChoices();
        }
      } else if (q.includes('parkir') || q.includes('parking')) {
        const t = TemplateResolver.getTemplate('BUILDING-PARKING');
        if (t) {
          initialStep = 'BASIC_PARAMETER_COLLECTION';
          initialTemplateId = t.templateId;
          subCategory = 'BUILDING_PARKING';
          title = `Spesifikasi Teknis: ${t.name}`;
          message = `Template **${t.name}** telah dipilih. Tentukan luas lantai, jumlah lantai parkir, dan spesifikasi komposit baja WF di bawah ini:`;
          initialQuestions = t.questions;
          initialCollectedParams = { ...t.defaultValues, location: detectedRegion };
        } else {
          initialStep = 'PROJECT_TYPE_SELECTION';
          title = 'Pilih Tipe Bangunan Gedung';
          message = 'Silakan pilih jenis bangunan gedung yang ingin Anda susunkan RAB-nya:';
          choices = TemplateResolver.getBuildingChoices();
        }
      } else if (q.includes('pasar') || q.includes('market') || q.includes('los')) {
        const t = TemplateResolver.getTemplate('BUILDING-MARKET');
        if (t) {
          initialStep = 'BASIC_PARAMETER_COLLECTION';
          initialTemplateId = t.templateId;
          subCategory = 'BUILDING_MARKET';
          title = `Spesifikasi Teknis: ${t.name}`;
          message = `Template **${t.name}** telah dipilih. Tentukan luas pasar, los basah, dan sistem drainase di bawah ini:`;
          initialQuestions = t.questions;
          initialCollectedParams = { ...t.defaultValues, location: detectedRegion };
        } else {
          initialStep = 'PROJECT_TYPE_SELECTION';
          title = 'Pilih Tipe Bangunan Gedung';
          message = 'Silakan pilih jenis bangunan gedung yang ingin Anda susunkan RAB-nya:';
          choices = TemplateResolver.getBuildingChoices();
        }
      } else if (q.includes('kantor') || q.includes('perkantoran') || q.includes('office')) {
        const t = TemplateResolver.getTemplate('BUILDING-OFFICE');
        if (t) {
          initialStep = 'BASIC_PARAMETER_COLLECTION';
          initialTemplateId = t.templateId;
          subCategory = 'BUILDING_OFFICE';
          title = `Spesifikasi Teknis: ${t.name}`;
          message = `Template **${t.name}** telah dipilih. Tentukan parameter lantai tinggi, material lampu LED, dan stop kontak di bawah ini:`;
          initialQuestions = t.questions;
          initialCollectedParams = { ...t.defaultValues, location: detectedRegion };
        } else {
          initialStep = 'PROJECT_TYPE_SELECTION';
          title = 'Pilih Tipe Bangunan Gedung';
          message = 'Silakan pilih jenis bangunan gedung yang ingin Anda susunkan RAB-nya:';
          choices = TemplateResolver.getBuildingChoices();
        }
      } else if (q.includes('custom') && !q.includes('rumah')) {
        const t = TemplateResolver.getTemplate('BUILDING-CUSTOM');
        if (t) {
          initialStep = 'BASIC_PARAMETER_COLLECTION';
          initialTemplateId = t.templateId;
          subCategory = 'BUILDING_CUSTOM';
          title = `Spesifikasi Teknis: ${t.name}`;
          message = `Template **${t.name}** telah dipilih. Tentukan spesifikasi bebas sesuai kebutuhan proyek Anda:`;
          initialQuestions = t.questions;
          initialCollectedParams = { ...t.defaultValues, location: detectedRegion };
        } else {
          initialStep = 'PROJECT_TYPE_SELECTION';
          title = 'Pilih Tipe Bangunan Gedung';
          message = 'Silakan pilih jenis bangunan gedung yang ingin Anda susunkan RAB-nya:';
          choices = TemplateResolver.getBuildingChoices();
        }
      } else {
        initialStep = 'PROJECT_TYPE_SELECTION';
        title = 'Pilih Tipe Bangunan Gedung';
        message = 'Silakan pilih jenis bangunan gedung yang ingin Anda susunkan RAB-nya:';
        choices = TemplateResolver.getBuildingChoices();
      }
    } else if (isRoadQuery) {
      category = 'ROAD_AND_PAVEMENT';
      subCategory = 'ROAD';

      if (q.includes('aspal') || q.includes('hotmix') || q.includes('laston')) {
        const t = TemplateResolver.getTemplate('ASPHALT-ROAD-LIGHT');
        if (t) {
          initialStep = 'BASIC_PARAMETER_COLLECTION';
          initialTemplateId = t.templateId;
          title = `Spesifikasi Teknis: ${t.name}`;
          message = `Template **${t.name}** telah dipilih. Tentukan panjang, lebar, dan ketebalan aspal di bawah ini untuk memulai estimasi:`;
          initialQuestions = t.questions;
          initialCollectedParams = { ...t.defaultValues };
        } else {
          initialStep = 'PROJECT_TYPE_SELECTION';
          title = 'Pilih Tipe Prasarana Jalan & Perkerasan';
          message = 'Silakan pilih jenis perkerasan jalan atau pekerjaan jalan yang ingin Anda susunkan RAB-nya:';
          choices = TemplateResolver.getRoadTemplateChoices();
        }
      } else if (q.includes('paving')) {
        const t = TemplateResolver.getTemplate('PAVING-BLOCK-STANDARD');
        if (t) {
          initialStep = 'BASIC_PARAMETER_COLLECTION';
          initialTemplateId = t.templateId;
          title = `Spesifikasi Teknis: ${t.name}`;
          message = `Template **${t.name}** telah dipilih. Tentukan parameter teknis jalan paving di bawah ini:`;
          initialQuestions = t.questions;
          initialCollectedParams = { ...t.defaultValues };
        } else {
          initialStep = 'PROJECT_TYPE_SELECTION';
          title = 'Pilih Tipe Prasarana Jalan & Perkerasan';
          message = 'Silakan pilih jenis perkerasan jalan atau pekerjaan jalan yang ingin Anda susunkan RAB-nya:';
          choices = TemplateResolver.getRoadTemplateChoices();
        }
      } else if (q.includes('rigid') || q.includes('beton')) {
        const t = TemplateResolver.getTemplate('RIGID-CONCRETE-ROAD');
        if (t) {
          initialStep = 'BASIC_PARAMETER_COLLECTION';
          initialTemplateId = t.templateId;
          title = `Spesifikasi Teknis: ${t.name}`;
          message = `Template **${t.name}** telah dipilih. Tentukan parameter teknis jalan beton semen di bawah ini:`;
          initialQuestions = t.questions;
          initialCollectedParams = { ...t.defaultValues };
        } else {
          initialStep = 'PROJECT_TYPE_SELECTION';
          title = 'Pilih Tipe Prasarana Jalan & Perkerasan';
          message = 'Silakan pilih jenis perkerasan jalan atau pekerjaan jalan yang ingin Anda susunkan RAB-nya:';
          choices = TemplateResolver.getRoadTemplateChoices();
        }
      } else {
        initialStep = 'PROJECT_TYPE_SELECTION';
        title = 'Pilih Tipe Prasarana Jalan & Perkerasan';
        message = 'Silakan pilih jenis perkerasan jalan atau pekerjaan jalan yang ingin Anda susunkan RAB-nya:';
        choices = TemplateResolver.getRoadTemplateChoices();
      }
    } else if (isCivilQuery) {
      initialStep = 'PROJECT_TYPE_SELECTION';
      category = 'CIVIL_STRUCTURE';
      subCategory = 'CIVIL';
      title = 'Pilih Tipe Struktur Sipil';
      message = 'Silakan pilih jenis struktur sipil yang ingin Anda buatkan RAB:';
      choices = TemplateResolver.getCivilTemplateChoices();
    } else {
      // General request -> Category Selection
      initialStep = 'PROJECT_CATEGORY_SELECTION';
      title = 'Pilih Jenis Proyek';
      message = 'Siap, saya bantu membuat RAB. Pilih jenis proyek yang ingin Anda hitung.';
      choices = TemplateResolver.getCategoryChoices();
    }

    const session: WizardSession = {
      sessionId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      projectId: input.projectId,
      conversationId: input.conversationId,
      currentStep: initialStep,
      category,
      subCategory,
      templateId: initialTemplateId,
      stepHistory: ['IDLE'],
      collectedParameters: initialCollectedParams,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    WizardStateMachine.sessions.set(sessionId, session);

    return {
      responseType: 'wizard',
      wizardSessionId: sessionId,
      step: initialStep,
      title,
      message,
      questions: initialQuestions,
      choices,
      progress: {
        current: initialStep === 'BASIC_PARAMETER_COLLECTION' ? 3 : (initialStep === 'PROJECT_CATEGORY_SELECTION' ? 1 : 2),
        total: 4,
        stepName: initialStep === 'PROJECT_CATEGORY_SELECTION' ? 'Kategori Proyek' : (initialStep === 'BASIC_PARAMETER_COLLECTION' ? 'Spesifikasi Teknis' : 'Pemilihan Tipe Proyek')
      },
      canGoBack: false,
      canCancel: true,
      selectedTemplate: initialTemplateId ? {
        id: initialTemplateId,
        templateId: initialTemplateId,
        label: title.replace('Spesifikasi Teknis: ', ''),
        area: initialCollectedParams.building_area || null,
        floorCount: initialCollectedParams.floorCount || 1,
        description: message
      } : undefined
    };
  }

  public static getSession(sessionId: string, workspaceId: string): WizardSession | undefined {
    let session = WizardStateMachine.sessions.get(sessionId);
    if (!session || session.workspaceId !== workspaceId) {
      // Auto-recovery: If session is missing (e.g. client generated or server reloaded), create a resilient active session
      const now = new Date().toISOString();
      session = {
        sessionId,
        workspaceId,
        userId: 'estimator-auto',
        projectId: 'PRJ-TROPIS-MODERN-01',
        conversationId: `conv_${Date.now()}`,
        currentStep: 'TEMPLATE_SELECTION',
        category: 'BUILDING',
        subCategory: 'HOUSE',
        templateId: 'HOUSE-T36-1FL',
        stepHistory: ['PROJECT_CATEGORY_SELECTION'],
        collectedParameters: {},
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      };
      WizardStateMachine.sessions.set(sessionId, session);
    }
    return session;
  }

  public static answerStep(input: {
    sessionId: string;
    workspaceId: string;
    userId: string;
    choiceId?: string;
    parameters?: Record<string, any>;
  }): AssistantWizardResponse {
    let session = WizardStateMachine.getSession(input.sessionId, input.workspaceId);
    if (!session) {
      // Fallback initialization
      WizardStateMachine.startSession({
        workspaceId: input.workspaceId,
        userId: input.userId,
        projectId: 'PRJ-TROPIS-MODERN-01',
        conversationId: `conv_${Date.now()}`
      });
      session = WizardStateMachine.getSession(input.sessionId, input.workspaceId);
    }
    if (!session || session.status !== 'ACTIVE') {
      throw new Error('Sesi wizard tidak ditemukan atau sudah tidak aktif.');
    }

    session.updatedAt = new Date().toISOString();

    // 1. Handling PROJECT_CATEGORY_SELECTION -> PROJECT_TYPE_SELECTION
    if (session.currentStep === 'PROJECT_CATEGORY_SELECTION' || ['BUILDING', 'ROAD_AND_PAVEMENT', 'WATER_RESOURCES', 'CIVIL_STRUCTURE', 'CUSTOM_PROJECT', 'CATEGORY_HOUSE', 'CATEGORY_ROAD'].includes(input.choiceId || '')) {
      const selectedCategory = input.choiceId || 'BUILDING';
      session.stepHistory.push(session.currentStep);

      if (selectedCategory === 'BUILDING' || selectedCategory === 'CATEGORY_HOUSE') {
        session.category = 'BUILDING';
        session.currentStep = 'PROJECT_TYPE_SELECTION';
        return {
          responseType: 'wizard',
          wizardSessionId: session.sessionId,
          step: 'PROJECT_TYPE_SELECTION',
          title: 'Pilih Tipe Bangunan Gedung',
          message: 'Silakan pilih tipe bangunan gedung yang ingin dihitung:',
          questions: [],
          choices: TemplateResolver.getBuildingChoices(),
          progress: {
            current: 2,
            total: 4,
            stepName: 'Pemilihan Tipe Gedung'
          },
          canGoBack: true,
          canCancel: true
        };
      } else if (selectedCategory === 'ROAD_AND_PAVEMENT' || selectedCategory === 'CATEGORY_ROAD') {
        session.category = 'ROAD_AND_PAVEMENT';
        session.subCategory = 'ROAD';
        session.currentStep = 'PROJECT_TYPE_SELECTION';
        return {
          responseType: 'wizard',
          wizardSessionId: session.sessionId,
          step: 'PROJECT_TYPE_SELECTION',
          title: 'Pilih Tipe Prasarana Jalan & Perkerasan',
          message: 'Pilih jenis perkerasan jalan atau pekerjaan jalan yang ingin dihitung:',
          questions: [],
          choices: TemplateResolver.getRoadTemplateChoices(),
          progress: {
            current: 2,
            total: 4,
            stepName: 'Pemilihan Tipe Jalan'
          },
          canGoBack: true,
          canCancel: true
        };
      } else if (selectedCategory === 'WATER_RESOURCES') {
        session.category = 'WATER_RESOURCES';
        session.subCategory = 'WATER';
        session.currentStep = 'PROJECT_TYPE_SELECTION';
        return {
          responseType: 'wizard',
          wizardSessionId: session.sessionId,
          step: 'PROJECT_TYPE_SELECTION',
          title: 'Pilih Tipe Bangunan Air',
          message: 'Pilih jenis bangunan air yang ingin dihitung:',
          questions: [],
          choices: TemplateResolver.getWaterTemplateChoices(),
          progress: {
            current: 2,
            total: 4,
            stepName: 'Pemilihan Tipe Bangunan Air'
          },
          canGoBack: true,
          canCancel: true
        };
      } else if (selectedCategory === 'CIVIL_STRUCTURE') {
        session.category = 'CIVIL_STRUCTURE';
        session.subCategory = 'CIVIL';
        session.currentStep = 'PROJECT_TYPE_SELECTION';
        return {
          responseType: 'wizard',
          wizardSessionId: session.sessionId,
          step: 'PROJECT_TYPE_SELECTION',
          title: 'Pilih Tipe Struktur Sipil',
          message: 'Pilih jenis struktur sipil yang ingin dihitung:',
          questions: [],
          choices: TemplateResolver.getCivilTemplateChoices(),
          progress: {
            current: 2,
            total: 4,
            stepName: 'Pemilihan Tipe Struktur Sipil'
          },
          canGoBack: true,
          canCancel: true
        };
      } else {
        // CUSTOM_PROJECT
        session.category = 'CUSTOM_PROJECT';
        session.currentStep = 'TEMPLATE_SELECTION';
        return {
          responseType: 'wizard',
          wizardSessionId: session.sessionId,
          step: 'TEMPLATE_SELECTION',
          title: 'Pilih Jenis Proyek Custom',
          message: 'Pilih kategori proyek kustom yang ingin Anda rancang:',
          questions: [],
          choices: [
            {
              id: 'custom_house',
              label: 'Bangunan Rumah / Gedung Custom',
              description: 'Tentukan dimensi luas & spesifikasi bebas sendiri',
              value: 'CUSTOM_HOUSE',
              templateId: 'CUSTOM_HOUSE',
              nextStep: 'BASIC_PARAMETER_COLLECTION'
            },
            {
              id: 'road_custom',
              label: 'Pekerjaan Jalan Custom',
              description: 'Perkerasan jalan dengan spesifikasi kustom',
              value: 'PAVING-BLOCK-STANDARD',
              templateId: 'PAVING-BLOCK-STANDARD',
              nextStep: 'BASIC_PARAMETER_COLLECTION'
            }
          ],
          progress: {
            current: 2,
            total: 4,
            stepName: 'Proyek Custom'
          },
          canGoBack: true,
          canCancel: true
        };
      }
    }

    // 2. Handling PROJECT_TYPE_SELECTION -> TEMPLATE_SELECTION or direct template resolution
    if (session.currentStep === 'PROJECT_TYPE_SELECTION' || input.choiceId === 'HOUSE_RESIDENTIAL' || input.choiceId === 'WATER_DAM') {
      const choice = input.choiceId;

      // Special check for Dams (Bendungan requires engineering review)
      if (choice === 'WATER_DAM') {
        session.stepHistory.push(session.currentStep);
        session.currentStep = 'ENGINEERING_REVIEW_REQUIRED';
        return {
          responseType: 'wizard',
          wizardSessionId: session.sessionId,
          step: 'ENGINEERING_REVIEW_REQUIRED',
          title: 'Engineering Review Required: Bendungan',
          message: 'Penyusunan RAB Bendungan memerlukan data engineering terperinci (DED, Geoteknik, Analisis Hidrologi & Stabilitas Lereng). Silakan konsultasikan dengan tim ahli teknik sipil sebelum estimasi final dibuat.',
          questions: [],
          choices: [
            {
              id: 'water_irrigation',
              label: 'Hitung Saluran Irigasi / Drainase Saja',
              description: 'Lanjutkan estimasi untuk bangunan pelengkap irigasi',
              value: 'DRAIN-OPEN-UDITCH',
              nextStep: 'BASIC_PARAMETER_COLLECTION'
            }
          ],
          progress: {
            current: 2,
            total: 4,
            stepName: 'Review Engineering'
          },
          canGoBack: true,
          canCancel: true
        };
      }

      if (choice === 'HOUSE_RESIDENTIAL' || choice === 'HOUSE') {
        session.stepHistory.push(session.currentStep);
        session.currentStep = 'TEMPLATE_SELECTION';
        session.subCategory = 'HOUSE';
        return {
          responseType: 'wizard',
          wizardSessionId: session.sessionId,
          step: 'TEMPLATE_SELECTION',
          title: 'Pilih Tipe Rumah Tinggal',
          message: 'Silakan pilih tipe rumah tinggal yang ingin dihitung:',
          questions: [],
          choices: TemplateResolver.getHouseTemplateChoices(),
          progress: {
            current: 2,
            total: 4,
            stepName: 'Pemilihan Template Rumah'
          },
          canGoBack: true,
          canCancel: true
        };
      }

      // Check if choice corresponds to an existing registered template
      const registeredTemplate = TemplateResolver.getTemplate(choice || '');
      if (registeredTemplate) {
        session.templateId = registeredTemplate.templateId;
        session.category = registeredTemplate.category;
        session.subCategory = registeredTemplate.subCategory;
        session.stepHistory.push(session.currentStep);
        session.currentStep = 'BASIC_PARAMETER_COLLECTION';
        session.collectedParameters = {
          ...registeredTemplate.defaultValues,
          ...(input.parameters || {})
        };

        return {
          responseType: 'wizard',
          wizardSessionId: session.sessionId,
          step: 'BASIC_PARAMETER_COLLECTION',
          title: `Spesifikasi Teknis: ${registeredTemplate.name}`,
          message: `Template **${registeredTemplate.name}** telah dipilih. Tentukan parameter teknis di bawah ini untuk memulai kalkulasi RAB deterministik:`,
          questions: registeredTemplate.questions,
          progress: {
            current: 3,
            total: 4,
            stepName: 'Spesifikasi Teknis'
          },
          canGoBack: true,
          canCancel: true
        };
      }

      // If building subtype (Hotel, Hospital, School, etc.), fallback gracefully to CUSTOM_HOUSE template with custom name
      if (session.category === 'BUILDING') {
        const customTemplate = TemplateResolver.getTemplate('CUSTOM_HOUSE')!;
        session.templateId = 'CUSTOM_HOUSE';
        session.subCategory = choice || 'BUILDING';
        session.stepHistory.push(session.currentStep);
        session.currentStep = 'BASIC_PARAMETER_COLLECTION';
        session.collectedParameters = {
          ...customTemplate.defaultValues,
          ...(input.parameters || {})
        };

        const labelMap: Record<string, string> = {
          BUILDING_HOTEL: 'Hotel',
          BUILDING_HOSPITAL: 'Rumah Sakit',
          BUILDING_HALL: 'Gedung Serbaguna',
          BUILDING_OFFICE: 'Gedung Perkantoran',
          BUILDING_SCHOOL: 'Sekolah',
          BUILDING_MOSQUE: 'Masjid',
          BUILDING_WAREHOUSE: 'Gudang',
          BUILDING_MARKET: 'Pasar',
          BUILDING_PARKING: 'Gedung Parkir',
          BUILDING_CUSTOM: 'Bangunan Custom'
        };
        const typeLabel = labelMap[choice || ''] || 'Bangunan Gedung';

        return {
          responseType: 'wizard',
          wizardSessionId: session.sessionId,
          step: 'BASIC_PARAMETER_COLLECTION',
          title: `Spesifikasi Teknis: ${typeLabel}`,
          message: `Tentukan parameter luas dan spesifikasi teknis untuk **${typeLabel}** di bawah ini:`,
          questions: customTemplate.questions,
          progress: {
            current: 3,
            total: 4,
            stepName: 'Spesifikasi Teknis'
          },
          canGoBack: true,
          canCancel: true
        };
      }
    }

    // 2.1 Handling TEMPLATE_SELECTION -> TEMPLATE_CONFIRMATION
    if (session.currentStep === 'TEMPLATE_SELECTION' || (input.choiceId && TemplateResolver.getTemplate(input.choiceId)) || (input.choiceId && HouseTypeCatalog.findById(input.choiceId))) {
      const choiceId = input.choiceId || (session.category === 'ROAD_AND_PAVEMENT' ? 'PAVING-BLOCK-STANDARD' : 'HOUSE-T36-1FL');

      // Check if user selected a house catalog item
      const houseItem = HouseTypeCatalog.findById(choiceId);
      if (houseItem) {
        if (houseItem.disabled) {
          session.stepHistory.push(session.currentStep);
          session.currentStep = 'TEMPLATE_NOT_READY';
          return {
            responseType: 'wizard',
            wizardSessionId: session.sessionId,
            step: 'TEMPLATE_NOT_READY',
            title: `Template Belum Tersedia: ${houseItem.label}`,
            message: `⚠️ **${houseItem.label}** (${houseItem.description}) belum memiliki modul kalkulasi dan template AHSP terverifikasi.\n\n${houseItem.disabledReason || 'Template belum tersedia.'}\n\nSilakan pilih tipe rumah yang sudah memiliki template terverifikasi (Type 36 s.d. Type 300) atau gunakan mode **Rumah Custom** untuk estimasi parametrik.`,
            questions: [],
            choices: [
              {
                id: 'custom_house',
                label: 'Gunakan Rumah Custom (Estimasi Parametrik)',
                description: `Rancang estimasi parametrik untuk luas ${houseItem.area || 'custom'} m²`,
                badge: 'Estimasi Parametrik',
                value: 'CUSTOM_HOUSE',
                templateId: 'CUSTOM_HOUSE',
                nextStep: 'BASIC_PARAMETER_COLLECTION'
              },
              ...TemplateResolver.getHouseTemplateChoices().filter(c => !c.disabled)
            ],
            progress: {
              current: 2,
              total: 4,
              stepName: 'Template Belum Tersedia'
            },
            canGoBack: true,
            canCancel: true
          };
        }

        const templateId = houseItem.templateId || 'HOUSE-T36-1FL';
        const registeredTemplate = TemplateResolver.getTemplate(templateId) || TemplateResolver.getTemplate('HOUSE-T36-1FL')!;

        session.templateId = registeredTemplate.templateId;
        session.category = registeredTemplate.category;
        session.subCategory = registeredTemplate.subCategory;
        session.stepHistory.push(session.currentStep);
        session.currentStep = 'TEMPLATE_CONFIRMATION';
        session.collectedParameters = {
          ...registeredTemplate.defaultValues,
          houseType: houseItem.houseTypeId,
          building_area: houseItem.area || registeredTemplate.defaultValues.building_area,
          buildingArea: houseItem.area || registeredTemplate.defaultValues.building_area,
          floorCount: houseItem.defaultFloorCount || 1,
          areaSource: 'TYPE_DEFAULT',
          ...(input.parameters || {})
        };

        const floorStr = houseItem.defaultFloorCount ? `${houseItem.defaultFloorCount} Lantai` : '1 Lantai';
        const areaStr = houseItem.area ? `±${houseItem.area} m²` : 'Bebas Custom';

        return {
          responseType: 'wizard',
          wizardSessionId: session.sessionId,
          step: 'TEMPLATE_CONFIRMATION',
          title: `Konfirmasi Pilihan: ${houseItem.label}`,
          message: `Anda memilih template **${houseItem.label}** (${areaStr}, ${floorStr}).\n${houseItem.description}.\n\nSilakan konfirmasi template ini untuk melanjutkan ke konfigurasi spesifikasi proyek dan perhitungan RAB:`,
          questions: [],
          selectedTemplate: {
            id: houseItem.id,
            templateId: registeredTemplate.templateId,
            label: houseItem.label,
            area: houseItem.area,
            floorCount: houseItem.defaultFloorCount || 1,
            description: houseItem.description,
            badge: houseItem.badge,
            categoryGroup: houseItem.categoryGroup
          },
          choices: [
            {
              id: 'PROCEED_CONFIG',
              label: 'Lanjutkan ke Spesifikasi Teknis Proyek →',
              description: 'Tentukan jenis pondasi, material dinding, rangka atap, dan mutu finishing',
              value: 'PROCEED_CONFIG',
              nextStep: 'BASIC_PARAMETER_COLLECTION',
              badge: 'Langkah Selanjutnya'
            },
            {
              id: 'CHANGE_TEMPLATE',
              label: '← Pilih Tipe Rumah Lainnya',
              description: 'Kembali ke katalog untuk melihat tipe rumah lainnya',
              value: 'CHANGE_TEMPLATE',
              nextStep: 'TEMPLATE_SELECTION'
            }
          ],
          progress: {
            current: 2,
            total: 4,
            stepName: 'Konfirmasi Template'
          },
          canGoBack: true,
          canCancel: true
        };
      }

      const registeredTemplate = TemplateResolver.getTemplate(choiceId) || TemplateResolver.getTemplate('HOUSE-T36-1FL')!;

      session.templateId = registeredTemplate.templateId;
      session.category = registeredTemplate.category;
      session.subCategory = registeredTemplate.subCategory;
      session.stepHistory.push(session.currentStep);
      session.currentStep = 'BASIC_PARAMETER_COLLECTION';
      session.collectedParameters = {
        ...registeredTemplate.defaultValues,
        ...(input.parameters || {})
      };

      return {
        responseType: 'wizard',
        wizardSessionId: session.sessionId,
        step: 'BASIC_PARAMETER_COLLECTION',
        title: `Spesifikasi Teknis: ${registeredTemplate.name}`,
        message: `Template **${registeredTemplate.name}** telah dipilih. Tentukan parameter teknis di bawah ini untuk memulai kalkulasi RAB deterministik:`,
        questions: registeredTemplate.questions,
        progress: {
          current: 3,
          total: 4,
          stepName: 'Spesifikasi Teknis'
        },
        canGoBack: true,
        canCancel: true
      };
    }

    // 2.2 Handling TEMPLATE_CONFIRMATION -> BASIC_PARAMETER_COLLECTION or back to TEMPLATE_SELECTION
    if (session.currentStep === 'TEMPLATE_CONFIRMATION') {
      if (input.choiceId === 'CHANGE_TEMPLATE') {
        session.currentStep = 'TEMPLATE_SELECTION';
        return {
          responseType: 'wizard',
          wizardSessionId: session.sessionId,
          step: 'TEMPLATE_SELECTION',
          title: 'Pilih Tipe Rumah Tinggal',
          message: 'Silakan pilih kembali tipe rumah yang sesuai dari katalog:',
          questions: [],
          choices: TemplateResolver.getHouseTemplateChoices(),
          progress: {
            current: 2,
            total: 4,
            stepName: 'Pemilihan Template Rumah'
          },
          canGoBack: true,
          canCancel: true
        };
      }

      // Default: Proceed to BASIC_PARAMETER_COLLECTION
      const template = TemplateResolver.getTemplate(session.templateId || 'HOUSE-T36-1FL') || TemplateResolver.getTemplate('HOUSE-T36-1FL')!;
      session.stepHistory.push(session.currentStep);
      session.currentStep = 'BASIC_PARAMETER_COLLECTION';
      session.collectedParameters = {
        ...template.defaultValues,
        ...session.collectedParameters,
        ...(input.parameters || {})
      };

      return {
        responseType: 'wizard',
        wizardSessionId: session.sessionId,
        step: 'BASIC_PARAMETER_COLLECTION',
        title: `Spesifikasi Teknis: ${template.name}`,
        message: `Konfigurasi parameter teknis untuk **${template.name}** di bawah ini untuk menghitung RAB deterministik standar AHSP PUPR 2026:`,
        questions: template.questions,
        progress: {
          current: 3,
          total: 4,
          stepName: 'Spesifikasi Teknis'
        },
        canGoBack: true,
        canCancel: true
      };
    }

    // 3. Handling BASIC_PARAMETER_COLLECTION -> RAB_PREVIEW
    if (session.currentStep === 'BASIC_PARAMETER_COLLECTION' || session.currentStep === 'VALIDATION') {
      const template = TemplateResolver.getTemplate(session.templateId || 'HOUSE-T36-1FL');
      if (!template) throw new Error('Template tidak valid.');

      // Normalize parameter aliases
      const rawParams = input.parameters || {};
      const normalizedParams: Record<string, any> = { ...rawParams };
      if (rawParams.roof_covering && !rawParams.roof_type) normalizedParams.roof_type = rawParams.roof_covering;
      if (rawParams.mihrab_finish && !rawParams.interior_mihrab) normalizedParams.interior_mihrab = rawParams.mihrab_finish;
      if (rawParams.floor_count && !rawParams.num_floors) normalizedParams.num_floors = rawParams.floor_count;
      if (rawParams.floor_to_floor_height && !rawParams.floor_height) normalizedParams.floor_height = rawParams.floor_to_floor_height;
      if (rawParams.electrical_grade && !rawParams.electrical_outlet) normalizedParams.electrical_outlet = rawParams.electrical_grade;
      if (rawParams.finish_grade && !rawParams.quality_level) normalizedParams.quality_level = rawParams.finish_grade;

      // Normalize specific building template enum aliases
      if (normalizedParams.lighting_type === 'TROFFER_60X60') normalizedParams.lighting_type = 'TROFFER_PANEL_60X60';
      if (normalizedParams.lighting_type === 'TUBE_LED') normalizedParams.lighting_type = 'TUBE_LED_LINEAR';
      if (normalizedParams.electrical_outlet === 'SCHNEIDER_POPUP') normalizedParams.electrical_outlet = 'SCHNEIDER_FLOOR_OUTLET';
      if (normalizedParams.paint_type === 'LOW_VOC_PREMIUM' || normalizedParams.paint_type === 'LOW_VOC') normalizedParams.paint_type = 'CAT_PREMIUM_LOW_VOC';

      // Merge collected parameters with defaults
      session.collectedParameters = {
        ...template.defaultValues,
        ...session.collectedParameters,
        ...normalizedParams
      };

      // Validate required parameters
      const missingParams = template.requiredParameters.filter(p => session.collectedParameters[p] === undefined || session.collectedParameters[p] === '');
      if (missingParams.length > 0) {
        return {
          responseType: 'wizard',
          wizardSessionId: session.sessionId,
          step: 'BASIC_PARAMETER_COLLECTION',
          title: `Lengkapi Parameter: ${template.name}`,
          message: `Mohon lengkapi parameter berikut sebelum kalkulasi: **${missingParams.join(', ')}**`,
          questions: template.questions.filter(q => missingParams.includes(q.id)),
          progress: {
            current: 2,
            total: 4,
            stepName: 'Parameter Belum Lengkap'
          },
          canGoBack: true,
          canCancel: true
        };
      }

      // Generate deterministic items using TemplateResolver
      const items = template.generateRabItems(session.collectedParameters);
      session.calculatedItems = items;

      // Calculate totals using CalculationService & SafeDecimalEngine
      let directCost = 0;
      const categoryMap = new Map<string, number>();

      for (const item of items) {
        const itemSubtotal = SafeDecimalEngine.safeMultiply(item.volume, item.unitPrice || 0);
        directCost = SafeDecimalEngine.safeAdd(directCost, itemSubtotal);
        const cat = item.category || 'LAIN-LAIN';
        categoryMap.set(cat, SafeDecimalEngine.safeAdd(categoryMap.get(cat) || 0, itemSubtotal));
      }

      // Ensure all 13 standard PUPR categories are present in summary
      const STANDARD_13_CATEGORIES = [
        '01. PEKERJAAN PERSIAPAN',
        '02. PEKERJAAN TANAH DAN PONDASI',
        '03. PEKERJAAN STRUKTUR',
        '04. PEKERJAAN DINDING',
        '05. PEKERJAAN LANTAI',
        '06. PEKERJAAN ATAP',
        '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
        '08. PEKERJAAN PLAFON',
        '09. PEKERJAAN INSTALASI LISTRIK',
        '10. PEKERJAAN PLAMBING DAN SANITASI',
        '11. PEKERJAAN PENGECATAN',
        '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
        '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
      ];

      for (const stdCat of STANDARD_13_CATEGORIES) {
        const prefix = stdCat.substring(0, 3);
        const hasCat = Array.from(categoryMap.keys()).some(k => k.startsWith(prefix));
        if (!hasCat) {
          categoryMap.set(stdCat, 0);
        }
      }

      const overheadPercent = 5;
      const profitPercent = 5;
      const overheadAmount = Math.round(SafeDecimalEngine.safeMultiply(directCost, 0.05));
      const profitAmount = Math.round(SafeDecimalEngine.safeMultiply(directCost, 0.05));
      const subtotalBeforeTax = directCost + overheadAmount + profitAmount;
      const taxPercent = 11;
      const taxAmount = Math.round(SafeDecimalEngine.safeMultiply(subtotalBeforeTax, 0.11));
      const grandTotal = subtotalBeforeTax + taxAmount;

      session.stepHistory.push(session.currentStep);
      session.currentStep = 'RAB_PREVIEW';

      const categoriesList = Array.from(categoryMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([category, subtotal]) => ({
          category,
          subtotal
        }));

      const reg = getRegionalFactor(session.collectedParameters.location);
      const regionText = ` [${reg.label} - ${reg.percentageVsJakarta}% Acuan]`;
      const paramSummary = (session.collectedParameters.building_area
        ? `Luas ${session.collectedParameters.building_area} m²`
        : session.collectedParameters.length
        ? `Panjang ${session.collectedParameters.length} m`
        : 'Spesifikasi Standar') + regionText;

      return {
        responseType: 'wizard',
        wizardSessionId: session.sessionId,
        step: 'RAB_PREVIEW',
        title: `Preview Estimasi RAB: ${template.name}`,
        message: `RAB untuk **${template.name}** (${paramSummary}) telah berhasil dikalkulasi secara presisi dengan standar AHSP PUPR 2026. Silakan tinjau ringkasan biaya sebelum menerapkan ke spreadsheet proyek:`,
        questions: [],
        calculatedItems: items,
        summary: {
          templateId: template.templateId,
          templateName: template.name,
          regionInfo: {
            code: reg.code,
            key: reg.code,
            label: reg.label,
            name: reg.label,
            factor: reg.factor,
            multiplier: reg.multiplier,
            percentageVsJakarta: reg.percentageVsJakarta,
            percentage: reg.percentage,
            description: reg.description
          },
          collectedParameters: session.collectedParameters,
          itemsCount: items.length,
          directCost,
          overheadPercent,
          overheadAmount,
          profitPercent,
          profitAmount,
          subtotalBeforeTax,
          taxPercent,
          taxAmount,
          grandTotal,
          categories: categoriesList
        },
        progress: {
          current: 3,
          total: 4,
          stepName: 'Review & Konfirmasi RAB'
        },
        canGoBack: true,
        canCancel: true
      };
    }

    throw new Error(`Step ${session.currentStep} tidak mendukung aksi answer.`);
  }

  public static goBack(sessionId: string, workspaceId: string): AssistantWizardResponse {
    const session = WizardStateMachine.getSession(sessionId, workspaceId);
    if (!session) throw new Error('Sesi wizard tidak ditemukan.');

    const prevStep = session.stepHistory.pop() || 'PROJECT_CATEGORY_SELECTION';
    session.currentStep = prevStep;
    session.updatedAt = new Date().toISOString();

    if (prevStep === 'PROJECT_CATEGORY_SELECTION') {
      return {
        responseType: 'wizard',
        wizardSessionId: session.sessionId,
        step: 'PROJECT_CATEGORY_SELECTION',
        title: 'Pilih Jenis Proyek',
        message: 'Siap, saya bantu membuat RAB. Pilih jenis proyek yang ingin Anda hitung.',
        questions: [],
        choices: TemplateResolver.getCategoryChoices(),
        progress: {
          current: 1,
          total: 4,
          stepName: 'Kategori Proyek'
        },
        canGoBack: false,
        canCancel: true
      };
    }

    if (prevStep === 'PROJECT_TYPE_SELECTION') {
      const choices = session.category === 'ROAD_AND_PAVEMENT'
        ? TemplateResolver.getRoadTemplateChoices()
        : session.category === 'WATER_RESOURCES'
        ? TemplateResolver.getWaterTemplateChoices()
        : session.category === 'CIVIL_STRUCTURE'
        ? TemplateResolver.getCivilTemplateChoices()
        : TemplateResolver.getBuildingChoices();

      return {
        responseType: 'wizard',
        wizardSessionId: session.sessionId,
        step: 'PROJECT_TYPE_SELECTION',
        title: session.category === 'ROAD_AND_PAVEMENT'
          ? 'Pilih Tipe Prasarana Jalan & Perkerasan'
          : session.category === 'WATER_RESOURCES'
          ? 'Pilih Tipe Bangunan Air'
          : session.category === 'CIVIL_STRUCTURE'
          ? 'Pilih Tipe Struktur Sipil'
          : 'Pilih Tipe Bangunan Gedung',
        message: 'Silakan pilih kembali tipe pekerjaan:',
        questions: [],
        choices,
        progress: {
          current: 2,
          total: 4,
          stepName: 'Pemilihan Tipe Proyek'
        },
        canGoBack: true,
        canCancel: true
      };
    }

    if (prevStep === 'TEMPLATE_SELECTION' || prevStep === 'IDLE') {
      const choices = session.category === 'ROAD_AND_PAVEMENT'
        ? TemplateResolver.getRoadTemplateChoices()
        : session.category === 'WATER_RESOURCES'
        ? TemplateResolver.getWaterTemplateChoices()
        : session.category === 'CIVIL_STRUCTURE'
        ? TemplateResolver.getCivilTemplateChoices()
        : TemplateResolver.getHouseTemplateChoices();

      return {
        responseType: 'wizard',
        wizardSessionId: session.sessionId,
        step: 'TEMPLATE_SELECTION',
        title: session.category === 'ROAD_AND_PAVEMENT'
          ? 'Pilih Tipe Prasarana Jalan & Perkerasan'
          : session.category === 'WATER_RESOURCES'
          ? 'Pilih Tipe Bangunan Air'
          : 'Pilih Tipe Rumah Tinggal',
        message: 'Silakan pilih kembali template pekerjaan:',
        questions: [],
        choices,
        progress: {
          current: 2,
          total: 4,
          stepName: 'Pemilihan Template'
        },
        canGoBack: true,
        canCancel: true
      };
    }

    const template = TemplateResolver.getTemplate(session.templateId || 'HOUSE-T36-1FL') || TemplateResolver.getTemplate('HOUSE-T36-1FL')!;
    return {
      responseType: 'wizard',
      wizardSessionId: session.sessionId,
      step: 'BASIC_PARAMETER_COLLECTION',
      title: `Spesifikasi Teknis: ${template.name}`,
      message: 'Ubah parameter spesifikasi teknis di bawah ini:',
      questions: template.questions,
      progress: {
        current: 3,
        total: 4,
        stepName: 'Spesifikasi Teknis'
      },
      canGoBack: true,
      canCancel: true
    };
  }

  public static cancelSession(sessionId: string, workspaceId: string): { success: boolean; message: string } {
    const session = WizardStateMachine.getSession(sessionId, workspaceId);
    if (session) {
      session.status = 'CANCELLED';
      session.updatedAt = new Date().toISOString();
      WizardStateMachine.sessions.delete(sessionId);
    }
    return { success: true, message: 'Pembuatan RAB interaktif telah dibatalkan.' };
  }

  public static confirmAndApply(input: {
    sessionId: string;
    workspaceId: string;
    userId: string;
    projectId: string;
    idempotencyKey?: string;
  }): {
    success: boolean;
    projectId: string;
    addedItemsCount: number;
    grandTotal: number;
    message: string;
    idempotencyKey?: string;
    items?: RabItem[];
  } {
    const session = WizardStateMachine.getSession(input.sessionId, input.workspaceId);
    if (!session) {
      throw new Error('Sesi wizard tidak ditemukan.');
    }

    // Idempotent replay protection
    if (session.status === 'COMPLETED' && session.appliedResult) {
      return session.appliedResult;
    }

    if (session.status !== 'ACTIVE') {
      throw new Error('Sesi wizard sudah tidak aktif atau telah dibatalkan.');
    }

    if (!session.calculatedItems || session.calculatedItems.length === 0) {
      throw new Error('Belum ada data RAB yang dikalkulasi untuk diterapkan.');
    }

    // Ensure project exists in aiDbAdapter before adding items
    const existingProject = aiDbAdapter.getProject(input.workspaceId, input.projectId);
    if (!existingProject) {
      aiDbAdapter.createProject(input.workspaceId, {
        id: input.projectId,
        name: session.selectedTemplate?.label ? `Proyek ${session.selectedTemplate.label}` : 'Proyek Baru Magic AI',
        budget: 0,
        status: 'ACTIVE',
      });
    }

    // Apply items to the project in aiDbAdapter
    for (const item of session.calculatedItems) {
      aiDbAdapter.addRabItem(input.workspaceId, input.projectId, {
        ...item,
        id: `RAB-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      });
    }

    session.status = 'COMPLETED';
    session.currentStep = 'SAVE_DRAFT';

    let total = 0;
    for (const item of session.calculatedItems) {
      total = SafeDecimalEngine.safeAdd(total, SafeDecimalEngine.safeMultiply(item.volume, item.unitPrice || 0));
    }

    const result = {
      success: true,
      projectId: input.projectId,
      addedItemsCount: session.calculatedItems.length,
      grandTotal: total,
      message: `Berhasil menambahkan ${session.calculatedItems.length} item pekerjaan RAB ke proyek.`,
      idempotencyKey: input.idempotencyKey,
      items: session.calculatedItems
    };

    session.appliedResult = result;
    return result;
  }
}
