export type IntentCategory =
  | 'GREETING'
  | 'HOW_ARE_YOU'
  | 'SMALL_TALK'
  | 'THANKS'
  | 'GOODBYE'
  | 'IDENTITY_QUESTION'
  | 'CAPABILITY_QUESTION'
  | 'PROJECT_INFORMATION'
  | 'PROJECT_PROGRESS'
  | 'PROJECT_BUDGET'
  | 'RAB_INFORMATION'
  | 'QTO_INFORMATION'
  | 'AHSP_INFORMATION'
  | 'KURVA_S_INFORMATION'
  | 'REPORT_INFORMATION'
  | 'SUBSCRIPTION_INFORMATION'
  | 'ACCOUNT_HELP'
  | 'BASIC_HELP'
  | 'PRODUCT_OVERVIEW'
  | 'GENERAL_QUESTION'
  | 'SERIOUS_TECHNICAL_REQUEST'
  | 'SECURITY_SENSITIVE'
  | 'PAYMENT_SENSITIVE'
  | 'GENERATE_TEMPLATE_RAB'
  | 'AUTOMATIC_RAB_START'
  | 'CREATE_DOCUMENT_PACKAGE'
  | 'UNKNOWN'
  | 'GENERAL_CHAT'
  | 'PROJECT_QUERY'
  | 'RAB_QUERY'
  | 'QTO_QUERY'
  | 'VOLUME_CALCULATION'
  | 'AHSP_SEARCH'
  | 'PRICE_SEARCH'
  | 'MATERIAL_SEARCH'
  | 'LABOR_SEARCH'
  | 'EQUIPMENT_SEARCH'
  | 'DED_ANALYSIS'
  | 'PDF_ANALYSIS'
  | 'IMAGE_ANALYSIS'
  | 'SPREADSHEET_ACTION'
  | 'RAB_ITEM_ACTION'
  | 'WBS_ACTION'
  | 'KURVA_S_ACTION'
  | 'TIME_SCHEDULE_ACTION'
  | 'REPORT_ACTION'
  | 'EXPORT_ACTION'
  | 'PROJECT_MANAGEMENT'
  | 'TEAM_MANAGEMENT'
  | 'ACCOUNT_QUERY'
  | 'SUBSCRIPTION_QUERY'
  | 'PAYMENT_QUERY'
  | 'CREDIT_QUERY'
  | 'HELP_QUERY'
  | 'AUDIT_RAB'
  | 'AUDIT_ITEM'
  | 'EXPLAIN_CALCULATION'
  | 'COMPARE_PROJECT'
  | 'OUT_OF_SCOPE'
  | 'INSUFFICIENT_DATA'
  | 'UNAUTHORIZED_ACTION'
  | 'PRIVACY_VIOLATION'
  | 'SECURITY_BYPASS'
  | 'PAYMENT_BYPASS'
  | 'ROLE_ESCALATION'
  | 'SECRET_DISCLOSURE'
  | 'DATA_DESTRUCTION'
  | 'UNSUPPORTED_FEATURE'
  | 'DANGEROUS_REQUEST'
  | 'JOKING'
  | 'UNKNOWN_REQUEST';

export type UniversalIntent =
  | 'GENERAL_CHAT'
  | 'EZRAB_FAQ'
  | 'AUTOMATIC_RAB_START'
  | 'CREATE_DOCUMENT_PACKAGE'
  | 'RAB_ANALYSIS'
  | 'QTO_REQUEST'
  | 'VOLUME_CALCULATION'
  | 'AHSP_LOOKUP'
  | 'MATERIAL_PRICE_LOOKUP'
  | 'WAGE_PRICE_LOOKUP'
  | 'DED_ANALYSIS'
  | 'PROJECT_LOOKUP'
  | 'SCHEDULE_GENERATION'
  | 'CURVE_S_GENERATION'
  | 'WBS_GENERATION'
  | 'REPORT_GENERATION'
  | 'EXCEL_EXPORT'
  | 'PDF_EXPORT'
  | 'NAVIGATION_COMMAND'
  | 'TOOL_ACTION_REQUEST'
  | 'FILE_ANALYSIS'
  | 'CLARIFICATION_REQUIRED'
  | 'UNKNOWN';

export interface ExtractedEntities {
  projectType?: 'HOUSE' | 'BUILDING' | 'ROAD' | 'WATER' | 'CIVIL' | 'CUSTOM';
  houseType?: string;
  buildingArea?: number;
  floorCount?: number;
  length?: number;
  width?: number;
  height?: number;
  thickness?: number;
  location?: string;
  projectId?: string;
  projectName?: string;
  outputFormat?: 'EXCEL' | 'PDF' | 'TABLE' | 'JSON';
  workType?: string;
  material?: string;
  unit?: string;
  foundationType?: string;
  wallType?: string;
  roofType?: string;
  qualityLevel?: string;
  [key: string]: any;
}

export interface UniversalClassificationResult {
  intent: UniversalIntent;
  confidence: number;
  entities: ExtractedEntities;
  missingParameters: string[];
  activeWorkflow: string | null;
  requiresClarification: boolean;
  clarificationQuestion?: string;
  legacyCategory: IntentCategory;
}

export type SeriousnessLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ClassifiedIntent {
  category: IntentCategory;
  confidence: number;
  seriousnessLevel: SeriousnessLevel;
  requiresProjectData: boolean;
  requiresFunction: boolean;
  requiresConfirmation: boolean;
  requiresPermissionCheck: boolean;
  requiresHumanReview: boolean;
  suggestedTools: string[];
}

import { findKnowledgeBaseAutoAnswer } from '../data/knowledgeBaseData';
import { HouseTypeCatalog } from '../../src/data/houseTypeCatalog';

export class IntentClassifier {
  /**
   * Classify incoming user query into exact intent categories and evaluate control flags
   */
  public classify(query: string, currentPage = 'dashboard'): ClassifiedIntent {
    const q = query.toLowerCase().trim();
    const rawNoPunct = q.replace(/[?!.,]/g, '').trim();

    // 0. EXPLICIT ADVERSARIAL ATTACKS (CRITICAL)
    const isExplicitAttack = 
      (q.includes('password') || q.includes('otp') || q.includes('server key') || q.includes('api key') || q.includes('token')) &&
      (q.includes('berikan') || q.includes('tampilkan') || q.includes('minta') || q.includes('curi') || q.includes('bocorkan') || q.includes('database password'));

    if (isExplicitAttack) {
      return {
        category: 'SECRET_DISCLOSURE',
        confidence: 0.99,
        seriousnessLevel: 'CRITICAL',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    // 0.1 TEMPLATE RAB & AUTOMATIC RAB GENERATION INTENT (HIGH PRIORITY OPERATIONAL REQUEST)
    const normRab = q
      .replace(/\br[\s\.\-_]*a[\s\.\-_]*b(?:nya)?\b/gi, 'rab')
      .replace(/\bra+b+\b/gi, 'rab')
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const isAuditOrAnomaly = normRab.includes('audit') || normRab.includes('anomali') || normRab.includes('periksa kesalahan') || normRab.includes('cek anomali');

    const hasRabCreationAction =
      normRab.includes('buat') ||
      normRab.includes('bikin') ||
      normRab.includes('hitung') ||
      normRab.includes('kalkulasi') ||
      normRab.includes('estimasi') ||
      normRab.includes('susun') ||
      normRab.includes('mulai') ||
      normRab.includes('generate') ||
      normRab.includes('ingin') ||
      normRab.includes('mau') ||
      normRab.includes('tolong');

    const hasRabTarget =
      normRab.includes('rab') ||
      normRab.includes('estimasi biaya') ||
      normRab.includes('estimasi proyek') ||
      normRab.includes('anggaran biaya') ||
      normRab.includes('biaya proyek') ||
      normRab.includes('biaya bangunan') ||
      normRab.includes('biaya rumah');

    const isExplicitAutomaticRab =
      !isAuditOrAnomaly &&
      (
        // Direct Action + Target (e.g. "buatkan saya rab", "tolong buatkan rab", "saya mau membuat rab", "buatkan estimasi biaya")
        (hasRabCreationAction && hasRabTarget) ||
        // Specific project type RAB requests (e.g. "buatkan rab rumah", "rab jalan", "rab bangunan air", "rab hotel", "rab gedung")
        (/\b(buat|bikin|hitung|kalkulasi|estimasi|susun|mulai|generate)\b.*\b(rab|estimasi|biaya|rumah|gedung|bangunan|jalan|hotel|saluran|irigasi|jembatan|konstruksi|proyek)\b/i.test(normRab) &&
         (normRab.includes('rab') || normRab.includes('estimasi') || normRab.includes('rumah') || normRab.includes('jalan') || normRab.includes('gedung') || normRab.includes('bangunan air') || normRab.includes('hotel'))) ||
        // Direct patterns
        /\brab\s+(rumah|gedung|bangunan|jalan|bangunan air|hotel|saluran|irigasi|jembatan|ruko|paving|konstruksi|proyek)\b/i.test(normRab) ||
        normRab === 'buat rab' ||
        normRab === 'buatkan rab' ||
        normRab === 'hitung rab' ||
        normRab === 'mulai rab'
      );

    if (isExplicitAutomaticRab) {
      return {
        category: 'AUTOMATIC_RAB_START',
        confidence: 0.99,
        seriousnessLevel: 'HIGH',
        requiresProjectData: false,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: ['wizard_start']
      };
    }

    // 0.2 AUDIT & ANOMALY DETECTION (HIGH PRIORITY OPERATIONAL REQUEST)
    if (q.includes('audit rab') || q.includes('periksa rab') || q.includes('cek anomali') || q.includes('kesalahan rab') || q.includes('audit item')) {
      return {
        category: q.includes('item') ? 'AUDIT_ITEM' : 'AUDIT_RAB',
        confidence: 0.98,
        seriousnessLevel: 'HIGH',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: true,
        requiresHumanReview: true,
        suggestedTools: ['audit_rab', 'audit_rab_item', 'detect_cost_anomalies']
      };
    }

    // 1. KNOWLEDGE BASE & HUMOR DATASET EARLY MATCH (LOW SERIOUSNESS - ZERO CONTEXT REQUIRED)
    const kbMatch = findKnowledgeBaseAutoAnswer(query);
    if (kbMatch) {
      const isHumor = kbMatch.includes('planet lain') || kbMatch.includes('gravitasi dan deadline');
      const isProductOverview = q.includes('apa itu ezrab') || q.includes('ezrab itu apa') || q.includes('tentang ezrab') || q.includes('pengenalan ezrab');
      const isCapability = q.includes('kamu bisa apa') || q.includes('kemampuan co assistant') || q.includes('apa yang bisa');
      
      const isBasicHelp = q.includes('bagaimana cara membuat rab') || q.includes('mulai dari mana') || q.includes('bagaimana menggunakan') || q.includes('bagaimana membuat');
      
      const category: IntentCategory = isHumor 
        ? 'JOKING' 
        : isProductOverview 
        ? 'PRODUCT_OVERVIEW' 
        : isCapability 
        ? 'CAPABILITY_QUESTION' 
        : isBasicHelp
        ? 'BASIC_HELP'
        : 'GENERAL_QUESTION';

      return {
        category,
        confidence: 0.99,
        seriousnessLevel: 'LOW',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    // 2. SECURITY & DANGEROUS & ADVERSARIAL (CRITICAL)
    if (
      q.includes('password') ||
      q.includes('otp') ||
      q.includes('api key') ||
      q.includes('server key') ||
      q.includes('access token') ||
      q.includes('secret') ||
      q.includes('data saya aman') ||
      q.includes('kebocoran')
    ) {
      return {
        category: (q.includes('password') || q.includes('otp') || q.includes('server key') || q.includes('api key'))
          ? 'SECRET_DISCLOSURE'
          : 'SECURITY_SENSITIVE',
        confidence: 0.99,
        seriousnessLevel: 'CRITICAL',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    if (q.includes('ubah role') || q.includes('ubah saya jadi super admin') || q.includes('escalate') || q.includes('jadikan saya admin')) {
      return {
        category: 'ROLE_ESCALATION',
        confidence: 0.98,
        seriousnessLevel: 'CRITICAL',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: true,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    if (q.includes('drop table') || q.includes('drop database') || q.includes('delete from') || q.includes('hapus database') || q.includes('hapus audit')) {
      return {
        category: 'DATA_DESTRUCTION',
        confidence: 0.99,
        seriousnessLevel: 'CRITICAL',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: true,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    if (q.includes('bypass') || q.includes('hack') || q.includes('tanpa bayar') || q.includes('gratis selamanya')) {
      return {
        category: q.includes('bayar') ? 'PAYMENT_BYPASS' : 'SECURITY_BYPASS',
        confidence: 0.95,
        seriousnessLevel: 'CRITICAL',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: true,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    if (q.includes('user lain') || q.includes('intip data') || q.includes('project orang lain')) {
      return {
        category: 'PRIVACY_VIOLATION',
        confidence: 0.95,
        seriousnessLevel: 'CRITICAL',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: true,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    // 2. PAYMENT / SUBSCRIPTION SENSITIVE
    if (
      q.includes('membayar paket pro') ||
      q.includes('bayar pro') ||
      q.includes('pembayaran qris') ||
      q.includes('cara cek qris') ||
      q.includes('cek qris') ||
      q.includes('qris') ||
      q.includes('transaksi paket') ||
      q.includes('harga langganan')
    ) {
      return {
        category: 'PAYMENT_SENSITIVE',
        confidence: 0.95,
        seriousnessLevel: 'HIGH',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: ['get_subscription']
      };
    }

    // 2.1 ACCOUNT HELP
    if (
      q.includes('akun') ||
      q.includes('login') ||
      q.includes('sesi') ||
      q.includes('profil') ||
      q.includes('ganti password') ||
      q.includes('lupa password') ||
      q.includes('masuk akun') ||
      q.includes('keluar akun') ||
      q.includes('logout')
    ) {
      return {
        category: 'ACCOUNT_HELP',
        confidence: 0.94,
        seriousnessLevel: 'LOW',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    // 3. SAPAAN UMUM (GREETINGS)
    const exactGreetings = [
      'hai', 'halo', 'hallow', 'hello', 'hi', 'hi ai', 'hai ai', 'halo ai', 'halo ezrab', 'hai ezrab',
      'pagi', 'selamat pagi', 'siang', 'selamat siang', 'sore', 'selamat sore', 'malam', 'selamat malam',
      'assalamualaikum', 'assalamu’alaikum', 'assalamu\'alaikum', 'permisi', 'test', 'tes', 'cek',
      'ada orang', 'ada ai', 'bisa dengar', 'bisa bantu', 'kamu aktif', 'kamu online', 'apakah kamu ada',
      'bot', 'ai', 'hello there', 'yo', 'yow', 'hei', 'hey', 'hey ai', 'p', 'ping', 'test 1 2 3',
      'localhost', 'local host'
    ];

    if (exactGreetings.includes(rawNoPunct) || (rawNoPunct.length <= 15 && exactGreetings.some(g => rawNoPunct === g || rawNoPunct.startsWith(g + ' ') || rawNoPunct.endsWith(' ' + g)))) {
      if (!q.includes('kabar') && !q.includes('siapa') && !q.includes('bisa apa')) {
        return {
          category: 'GREETING',
          confidence: 0.98,
          seriousnessLevel: 'LOW',
          requiresProjectData: false,
          requiresFunction: false,
          requiresConfirmation: false,
          requiresPermissionCheck: false,
          requiresHumanReview: false,
          suggestedTools: []
        };
      }
    }

    // 4. "APA KABAR?" (HOW_ARE_YOU)
    if (
      q.includes('apa kabar') ||
      q.includes('apakabar') ||
      q.includes('bagaimana kabarnya') ||
      q.includes('gimana kabarnya') ||
      q.includes('kabarnya bagaimana') ||
      q.includes('kamu apa kabar') ||
      q.includes('sehat') ||
      q.includes('kamu sehat') ||
      q.includes('kabar?') ||
      q === 'kabar' ||
      q.startsWith('kabar ') ||
      q.includes('are you okay') ||
      q.includes('how are you') ||
      q.includes('bagaimana keadaanmu') ||
      q.includes('baik-baik saja') ||
      q.includes('lagi apa') ||
      q.includes('sedang apa') ||
      q.includes('lagi ngapain') ||
      q.includes('bagaimana harimu') ||
      q.includes('hari ini bagaimana')
    ) {
      return {
        category: 'HOW_ARE_YOU',
        confidence: 0.99,
        seriousnessLevel: 'LOW',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    // 5. IDENTITAS AI (IDENTITY_QUESTION)
    if (
      q.includes('kamu siapa') ||
      q.includes('siapa kamu') ||
      q.includes('kamu itu apa') ||
      q.includes('apa nama kamu') ||
      q.includes('namamu siapa') ||
      q.includes('kamu ai apa') ||
      q.includes('kamu bot') ||
      q.includes('kamu manusia') ||
      q.includes('kamu robot') ||
      q.includes('kamu chatgpt') ||
      q.includes('kamu ezrab')
    ) {
      return {
        category: 'IDENTITY_QUESTION',
        confidence: 0.96,
        seriousnessLevel: 'LOW',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    // 6. KEMAMPUAN AI (CAPABILITY_QUESTION)
    if (
      q.includes('kamu bisa apa') ||
      q.includes('apa yang bisa kamu lakukan') ||
      q.includes('kamu dapat membantu apa') ||
      q.includes('fungsi kamu apa') ||
      q.includes('kamu dibuat untuk apa') ||
      q.includes('kamu ahli di bidang apa') ||
      q.includes('bisa apa saja')
    ) {
      return {
        category: 'CAPABILITY_QUESTION',
        confidence: 0.95,
        seriousnessLevel: 'LOW',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    // 7. PRODUCT OVERVIEW (EZRAB ITU APA?)
    if (
      q.includes('apa itu ezrab') ||
      q.includes('ezrab itu apa') ||
      q.includes('ezrab untuk apa') ||
      q.includes('tentang ezrab') ||
      q.includes('platform ezrab')
    ) {
      return {
        category: 'PRODUCT_OVERVIEW',
        confidence: 0.95,
        seriousnessLevel: 'LOW',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    // 8. BASIC HELP / USER ONBOARDING
    if (
      q.includes('saya bingung') ||
      q.includes('mulai dari mana') ||
      q.includes('tolong arahkan') ||
      q.includes('apa yang harus saya lakukan') ||
      q.includes('langkah selanjutnya apa') ||
      q.includes('bagaimana cara membuat rab') ||
      q.includes('bagaimana cara menggunakan ezrab') ||
      q.includes('bagaimana membuat proyek baru') ||
      q.includes('bagaimana mengisi volume') ||
      q.includes('bagaimana mengimpor excel') ||
      q.includes('bagaimana mengekspor pdf')
    ) {
      return {
        category: 'BASIC_HELP',
        confidence: 0.94,
        seriousnessLevel: 'LOW',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    // 9. BASA-BASI & PERCAKAPAN RINGAN (SMALL_TALK)
    if (
      q.includes('temani saya') ||
      q.includes('temanin saya') ||
      q.includes('lagi sibuk') ||
      q.includes('capek tidak') ||
      q.includes('saya sedang bosan') ||
      q.includes('hari ini panas') ||
      q.includes('hari ini hujan') ||
      q.includes('belum minum kopi') ||
      q.includes('saya mengantuk') ||
      q.includes('baru belajar konstruksi') ||
      q.includes('masih pemula') ||
      q.includes('bahasa sederhana')
    ) {
      return {
        category: 'SMALL_TALK',
        confidence: 0.92,
        seriousnessLevel: 'LOW',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    // 10. TERIMA KASIH (THANKS)
    if (
      q.includes('terima kasih') ||
      q.includes('terimakasih') ||
      q.includes('makasih') ||
      q.includes('thanks') ||
      q.includes('thank you') ||
      q.includes('syukran') ||
      q.includes('matur nuwun') ||
      q.includes('kamsia')
    ) {
      return {
        category: 'THANKS',
        confidence: 0.98,
        seriousnessLevel: 'LOW',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    // 11. GOODBYE / SALAM PENUTUP
    if (
      q.includes('selamat tinggal') ||
      q.includes('sampai jumpa') ||
      q.includes('bye') ||
      q.includes('goodbye') ||
      q.includes('dadah') ||
      q.includes('see you') ||
      q.includes('pamit')
    ) {
      return {
        category: 'GOODBYE',
        confidence: 0.95,
        seriousnessLevel: 'LOW',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    // 11. HUMOR & ABSURD / JOKING (LOW)
    if (
      q.includes('mars') ||
      q.includes('awan') ||
      q.includes('naga') ||
      q.includes('alien') ||
      q.includes('ufo') ||
      q.includes('rasa malas') ||
      q.includes('perjalanan cinta') ||
      q.includes('pasir jadi emas')
    ) {
      return {
        category: 'JOKING',
        confidence: 0.95,
        seriousnessLevel: 'LOW',
        requiresProjectData: false,
        requiresFunction: false,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    // 11.1 AUTOMATIC INTERACTIVE RAB WIZARD START (HIGH)
    if (
      (q.includes('buatkan rab') ||
        q.includes('buat rab') ||
        q.includes('hitung rab') ||
        q.includes('hitungkan rab') ||
        q.includes('estimasi rab') ||
        q.includes('bikinkan rab') ||
        q.includes('bikin rab') ||
        q.includes('buat estimasi') ||
        q.includes('buatkan estimasi') ||
        q.includes('ingin membuat rab') ||
        q.includes('mau membuat rab') ||
        q.includes('rab rumah') ||
        q.includes('rab gedung') ||
        q.includes('rab jalan') ||
        q.includes('rab bangunan air') ||
        q.includes('rab hotel') ||
        q.includes('rab paving') ||
        q.includes('rab saluran') ||
        q.includes('rab rumah sakit')) &&
      !q.includes('audit') &&
      !q.includes('cek anomali')
    ) {
      return {
        category: 'AUTOMATIC_RAB_START',
        confidence: 0.98,
        seriousnessLevel: 'HIGH',
        requiresProjectData: false,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: []
      };
    }

    // 11.2 CREATE DOCUMENT PACKAGE (HIGH)
    if (
      (q.includes('dokumen tender') ||
        q.includes('dokumen proyek') ||
        q.includes('paket dokumen') ||
        q.includes('semua dokumen')) &&
      (q.includes('buat') ||
        q.includes('siapkan') ||
        q.includes('bikin') ||
        q.includes('susun') ||
        q.includes('semua'))
    ) {
      return {
        category: 'CREATE_DOCUMENT_PACKAGE',
        confidence: 0.99,
        seriousnessLevel: 'HIGH',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: ['getDocumentStatus', 'getDocumentCompleteness']
      };
    }

    // 12. AUDIT RAB & ITEM (HIGH)
    if (q.includes('audit rab') || q.includes('periksa rab') || q.includes('cek anomali') || q.includes('kesalahan rab') || q.includes('audit item')) {
      return {
        category: q.includes('item') ? 'AUDIT_ITEM' : 'AUDIT_RAB',
        confidence: 0.95,
        seriousnessLevel: 'HIGH',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: true,
        requiresHumanReview: true,
        suggestedTools: ['audit_rab', 'audit_rab_item', 'detect_cost_anomalies']
      };
    }

    // 13. WRITE SPREADSHEET / RAB ACTIONS (HIGH - Requires Confirmation)
    if (q.includes('tambah item') || q.includes('tambah pekerjaan') || q.includes('masukkan item')) {
      return {
        category: 'RAB_ITEM_ACTION',
        confidence: 0.94,
        seriousnessLevel: 'HIGH',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: true,
        requiresPermissionCheck: true,
        requiresHumanReview: true,
        suggestedTools: ['add_rab_item', 'recalculate_rab']
      };
    }

    if (q.includes('hapus item') || q.includes('delete item') || q.includes('buang item')) {
      return {
        category: 'RAB_ITEM_ACTION',
        confidence: 0.94,
        seriousnessLevel: 'HIGH',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: true,
        requiresPermissionCheck: true,
        requiresHumanReview: true,
        suggestedTools: ['delete_rab_item', 'recalculate_rab']
      };
    }

    if (q.includes('ubah harga') || q.includes('update volume') || q.includes('edit item') || q.includes('recalculate')) {
      return {
        category: 'SPREADSHEET_ACTION',
        confidence: 0.92,
        seriousnessLevel: 'HIGH',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: true,
        requiresPermissionCheck: true,
        requiresHumanReview: true,
        suggestedTools: ['update_rab_item', 'recalculate_rab']
      };
    }

    // 14. WBS ACTION
    if (q.includes('wbs') || q.includes('struktur rincian') || q.includes('sub-kategori')) {
      const isAction = q.includes('tambah') || q.includes('ubah') || q.includes('hapus') || q.includes('pindah');
      return {
        category: 'WBS_ACTION',
        confidence: 0.9,
        seriousnessLevel: isAction ? 'HIGH' : 'MEDIUM',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: isAction,
        requiresPermissionCheck: true,
        requiresHumanReview: isAction,
        suggestedTools: isAction ? ['add_wbs', 'update_wbs', 'delete_wbs'] : ['list_wbs']
      };
    }

    // 15. QTO & VOLUME CALCULATION
    if (q.includes('hitung volume') || q.includes('qto') || q.includes('take-off') || q.includes('take off') || q.includes('rumus volume') || q.includes('dimensi')) {
      return {
        category: q.includes('hitung') ? 'VOLUME_CALCULATION' : 'QTO_QUERY',
        confidence: 0.92,
        seriousnessLevel: 'MEDIUM',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: true,
        requiresHumanReview: false,
        suggestedTools: ['calculate_volume', 'get_qto', 'explain_volume']
      };
    }

    // 16. AHSP SEARCH & ANALYSIS
    if (q.includes('ahsp') || q.includes('analisa') || q.includes('koefisien') || q.includes('standar pupr')) {
      return {
        category: 'AHSP_SEARCH',
        confidence: 0.92,
        seriousnessLevel: 'MEDIUM',
        requiresProjectData: false,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: ['search_ahsp', 'get_ahsp_detail', 'get_ahsp_coefficients']
      };
    }

    // 17. PRICE & MATERIAL & LABOR & EQUIPMENT SEARCH
    if (q.includes('harga material') || q.includes('harga semen') || q.includes('harga besi') || q.includes('harga bata')) {
      return {
        category: 'MATERIAL_SEARCH',
        confidence: 0.93,
        seriousnessLevel: 'MEDIUM',
        requiresProjectData: false,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: ['search_material_price', 'compare_prices']
      };
    }
    if (q.includes('upah tukang') || q.includes('gaji tukang') || q.includes('upah pekerja') || q.includes('mandor')) {
      return {
        category: 'LABOR_SEARCH',
        confidence: 0.93,
        seriousnessLevel: 'MEDIUM',
        requiresProjectData: false,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: ['search_labor_price']
      };
    }
    if (q.includes('sewa alat') || q.includes('excavator') || q.includes('alat berat') || q.includes('molen')) {
      return {
        category: 'EQUIPMENT_SEARCH',
        confidence: 0.93,
        seriousnessLevel: 'MEDIUM',
        requiresProjectData: false,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: ['search_equipment_price']
      };
    }
    if (q.includes('harga') || q.includes('tarif') || q.includes('biaya satuan')) {
      return {
        category: 'PRICE_SEARCH',
        confidence: 0.88,
        seriousnessLevel: 'MEDIUM',
        requiresProjectData: false,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: false,
        requiresHumanReview: false,
        suggestedTools: ['search_material_price', 'search_labor_price', 'compare_prices']
      };
    }

    // 18. DED / PDF / IMAGE ANALYSIS
    if (q.includes('ded') || q.includes('gambar kerja') || q.includes('denah') || q.includes('pdf') || q.includes('autocad') || q.includes('blueprint')) {
      return {
        category: q.includes('pdf') ? 'PDF_ANALYSIS' : q.includes('gambar') || q.includes('foto') ? 'IMAGE_ANALYSIS' : 'DED_ANALYSIS',
        confidence: 0.9,
        seriousnessLevel: 'HIGH',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: true,
        requiresHumanReview: true,
        suggestedTools: ['analyze_ded', 'analyze_pdf', 'extract_dimensions']
      };
    }

    // 19. PROGRESS, KURVA S & TIME SCHEDULE
    if (
      q.includes('progress') ||
      q.includes('progres') ||
      q.includes('kurva s') ||
      q.includes('deviasi') ||
      q.includes('keterlambatan') ||
      q.includes('bobot') ||
      q.includes('kemajuan')
    ) {
      const isUpdate = q.includes('update') || q.includes('ubah') || q.includes('edit');
      return {
        category: 'PROJECT_PROGRESS',
        confidence: 0.94,
        seriousnessLevel: isUpdate ? 'HIGH' : 'MEDIUM',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: isUpdate,
        requiresPermissionCheck: true,
        requiresHumanReview: isUpdate,
        suggestedTools: isUpdate ? ['update_activity_progress', 'recalculate_kurva_s'] : ['get_kurva_s', 'compare_planned_actual_progress']
      };
    }

    if (q.includes('jadwal') || q.includes('schedule') || q.includes('timeline') || q.includes('durasi')) {
      const isUpdate = q.includes('tambah') || q.includes('ubah') || q.includes('hapus');
      return {
        category: 'TIME_SCHEDULE_ACTION',
        confidence: 0.9,
        seriousnessLevel: isUpdate ? 'HIGH' : 'MEDIUM',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: isUpdate,
        requiresPermissionCheck: true,
        requiresHumanReview: isUpdate,
        suggestedTools: isUpdate ? ['add_schedule_activity', 'recalculate_schedule'] : ['get_time_schedule']
      };
    }

    // 20. REPORTS & EXPORTS
    if (q.includes('ekspor pdf') || q.includes('ekspor excel') || q.includes('download rab')) {
      return {
        category: 'EXPORT_ACTION',
        confidence: 0.95,
        seriousnessLevel: 'MEDIUM',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: true,
        requiresHumanReview: false,
        suggestedTools: ['export_pdf', 'export_excel']
      };
    }
    if (q.includes('laporan') || q.includes('report') || q.includes('mingguan') || q.includes('rekap')) {
      return {
        category: 'REPORT_ACTION',
        confidence: 0.92,
        seriousnessLevel: 'MEDIUM',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: true,
        requiresHumanReview: false,
        suggestedTools: ['generate_project_report', 'generate_rab_report']
      };
    }

    // 21. BUDGET & GENERAL RAB / PROJECT QUERIES
    if (
      q.includes('total anggaran') ||
      q.includes('anggaran proyek') ||
      q.includes('nilai proyek') ||
      q.includes('budget') ||
      q.includes('total rab') ||
      q.includes('biaya proyek')
    ) {
      return {
        category: 'PROJECT_BUDGET',
        confidence: 0.94,
        seriousnessLevel: 'MEDIUM',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: true,
        requiresHumanReview: false,
        suggestedTools: ['get_rab', 'get_project_summary']
      };
    }

    if (q.includes('rab') || q.includes('rencana anggaran') || q.includes('item pekerjaan')) {
      return {
        category: 'RAB_QUERY',
        confidence: 0.90,
        seriousnessLevel: 'MEDIUM',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: true,
        requiresHumanReview: false,
        suggestedTools: ['get_rab', 'get_project_summary']
      };
    }

    if (q.includes('proyek') || q.includes('project') || q.includes('informasi')) {
      return {
        category: 'PROJECT_QUERY',
        confidence: 0.85,
        seriousnessLevel: 'LOW',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: true,
        requiresHumanReview: false,
        suggestedTools: ['get_project', 'get_project_summary']
      };
    }

    // 15. MASTER BUILDING TEMPLATE & PARAMETRIC VOLUME INTENT (HIGH)
    if (
      q.includes('tipe 36') ||
      q.includes('tipe 45') ||
      q.includes('tipe 70') ||
      q.includes('ruko') ||
      q.includes('jalan beton') ||
      q.includes('saluran u-ditch') ||
      q.includes('u-ditch') ||
      q.includes('template bangunan') ||
      q.includes('generator rab') ||
      q.includes('parametric')
    ) {
      return {
        category: 'SERIOUS_TECHNICAL_REQUEST',
        confidence: 0.98,
        seriousnessLevel: 'HIGH',
        requiresProjectData: true,
        requiresFunction: true,
        requiresConfirmation: false,
        requiresPermissionCheck: true,
        requiresHumanReview: true,
        suggestedTools: ['generate_rab_from_building_template', 'list_master_templates']
      };
    }

    return {
      category: 'GENERAL_CHAT',
      confidence: 0.7,
      seriousnessLevel: 'LOW',
      requiresProjectData: false,
      requiresFunction: false,
      requiresConfirmation: false,
      requiresPermissionCheck: false,
      requiresHumanReview: false,
      suggestedTools: []
    };
  }

  /**
   * Universal entity extraction from user prompt
   */
  public extractEntities(query: string): ExtractedEntities {
    const q = query.toLowerCase();
    const entities: ExtractedEntities = {};

    // 1. House Type & Area via Canonical HouseTypeCatalog
    const houseQuery = HouseTypeCatalog.findFromQuery(query);
    if (houseQuery.item) {
      entities.projectType = 'HOUSE';
      entities.houseType = houseQuery.item.houseTypeId;
      if (houseQuery.extractedArea) entities.buildingArea = houseQuery.extractedArea;
      if (houseQuery.extractedFloors) entities.floorCount = houseQuery.extractedFloors;
    }

    // 2. Project Types
    if (!entities.projectType) {
      if (q.includes('rumah')) entities.projectType = 'HOUSE';
      else if (q.includes('gedung') || q.includes('bangunan') || q.includes('hotel') || q.includes('kantor') || q.includes('sekolah') || q.includes('masjid') || q.includes('gudang') || q.includes('pasar') || q.includes('rumah sakit')) entities.projectType = 'BUILDING';
      else if (q.includes('jalan') || q.includes('paving') || q.includes('aspal') || q.includes('rigid') || q.includes('makadam') || q.includes('trotoar')) entities.projectType = 'ROAD';
      else if (q.includes('air') || q.includes('saluran') || q.includes('irigasi') || q.includes('drainase') || q.includes('uditch') || q.includes('u-ditch') || q.includes('embung') || q.includes('bendungan') || q.includes('intake') || q.includes('spillway') || q.includes('box culvert') || q.includes('reservoir') || q.includes('tanggul')) entities.projectType = 'WATER';
      else if (q.includes('sipil') || q.includes('jembatan') || q.includes('retaining wall') || q.includes('bronjong') || q.includes('riprap') || q.includes('tanah')) entities.projectType = 'CIVIL';
      else if (q.includes('custom')) entities.projectType = 'CUSTOM';
    }

    // 3. Dimensions
    // Length (panjang)
    const lenMatch = q.match(/(?:panjang|p)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:m|meter)?/i) || q.match(/(\d+(?:[.,]\d+)?)\s*(?:m|meter)\s*panjang/i);
    if (lenMatch) entities.length = parseFloat(lenMatch[1].replace(',', '.'));

    // Width (lebar)
    const widthMatch = q.match(/(?:lebar|l)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:m|meter)?/i) || q.match(/(\d+(?:[.,]\d+)?)\s*(?:m|meter)\s*lebar/i);
    if (widthMatch) entities.width = parseFloat(widthMatch[1].replace(',', '.'));

    // Height (tinggi)
    const heightMatch = q.match(/(?:tinggi|t)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:m|meter)?/i) || q.match(/(\d+(?:[.,]\d+)?)\s*(?:m|meter)\s*tinggi/i);
    if (heightMatch) entities.height = parseFloat(heightMatch[1].replace(',', '.'));

    // Thickness (tebal)
    const thickMatch = q.match(/(?:tebal|t)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:cm|centi|m|meter)?/i);
    if (thickMatch) entities.thickness = parseFloat(thickMatch[1].replace(',', '.'));

    // Area (luas)
    if (!entities.buildingArea) {
      const areaMatch = q.match(/(?:luas|type|tipe|t)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:m2|m²|meter)?/i) || q.match(/(\d+(?:[.,]\d+)?)\s*(?:m2|m²|meter)\b/i);
      if (areaMatch) entities.buildingArea = parseFloat(areaMatch[1].replace(',', '.'));
    }

    // Floors (lantai)
    if (!entities.floorCount) {
      if (q.includes('1 lantai') || q.includes('satu lantai') || q.includes('single floor')) entities.floorCount = 1;
      else if (q.includes('2 lantai') || q.includes('dua lantai') || q.includes('bertingkat') || q.includes('two floor')) entities.floorCount = 2;
      else if (q.includes('3 lantai') || q.includes('tiga lantai')) entities.floorCount = 3;
    }

    // 4. Output Format
    if (q.includes('excel') || q.includes('xlsx') || q.includes('spreadsheet')) entities.outputFormat = 'EXCEL';
    else if (q.includes('pdf')) entities.outputFormat = 'PDF';
    else if (q.includes('tabel') || q.includes('table')) entities.outputFormat = 'TABLE';
    else if (q.includes('json')) entities.outputFormat = 'JSON';

    // 5. Work Type & Materials
    if (q.includes('pondasi')) entities.workType = 'PONDASI';
    else if (q.includes('dinding') || q.includes('bata')) entities.workType = 'PASANGAN_DINDING';
    else if (q.includes('atap') || q.includes('genteng') || q.includes('kuda-kuda')) entities.workType = 'ATAP';
    else if (q.includes('beton') || q.includes('struktur') || q.includes('kolom') || q.includes('balok')) entities.workType = 'STRUKTUR_BETON';
    else if (q.includes('tanah') || q.includes('galian') || q.includes('timbunan')) entities.workType = 'PEKERJAAN_TANAH';
    else if (q.includes('mep') || q.includes('listrik') || q.includes('plumbing') || q.includes('sanitasi')) entities.workType = 'MEP';

    if (q.includes('batu kali')) entities.material = 'batu kali';
    else if (q.includes('bata ringan') || q.includes('hebel')) entities.material = 'bata ringan';
    else if (q.includes('bata merah')) entities.material = 'bata merah';
    else if (q.includes('baja ringan')) entities.material = 'baja ringan';
    else if (q.includes('aspal') || q.includes('laston')) entities.material = 'aspal laston ac-wc';
    else if (q.includes('paving')) entities.material = 'paving block';
    else if (q.includes('u-ditch') || q.includes('uditch')) entities.material = 'beton u-ditch';

    return entities;
  }

  /**
   * Universal intent classifier with confidence scoring, entity extraction, and missing parameter discovery
   */
  public classifyUniversal(query: string, options?: { currentPage?: string; activeWorkflow?: string; projectId?: string }): UniversalClassificationResult {
    const rawClassified = this.classify(query, options?.currentPage || 'dashboard');
    const entities = this.extractEntities(query);
    const missingParameters: string[] = [];

    // Map legacy category to UniversalIntent
    let universalIntent: UniversalIntent = 'UNKNOWN';

    switch (rawClassified.category) {
      case 'GREETING':
      case 'HOW_ARE_YOU':
      case 'SMALL_TALK':
      case 'THANKS':
      case 'GOODBYE':
      case 'JOKING':
        universalIntent = 'GENERAL_CHAT';
        break;
      case 'GENERAL_CHAT':
      case 'GENERAL_QUESTION':
        if (!entities.projectType && !entities.houseType && !entities.material && !entities.workType) {
          universalIntent = 'CLARIFICATION_REQUIRED';
        } else {
          universalIntent = 'GENERAL_CHAT';
        }
        break;
      case 'PRODUCT_OVERVIEW':
      case 'BASIC_HELP':
      case 'IDENTITY_QUESTION':
      case 'CAPABILITY_QUESTION':
      case 'ACCOUNT_HELP':
      case 'PAYMENT_SENSITIVE':
      case 'HELP_QUERY':
        universalIntent = 'EZRAB_FAQ';
        break;
      case 'AUTOMATIC_RAB_START':
      case 'GENERATE_TEMPLATE_RAB':
        universalIntent = 'AUTOMATIC_RAB_START';
        break;
      case 'AUDIT_RAB':
      case 'AUDIT_ITEM':
      case 'RAB_QUERY':
      case 'RAB_INFORMATION':
      case 'RAB_ITEM_ACTION':
      case 'SPREADSHEET_ACTION':
        universalIntent = 'RAB_ANALYSIS';
        break;
      case 'QTO_QUERY':
      case 'QTO_INFORMATION':
        universalIntent = 'QTO_REQUEST';
        break;
      case 'VOLUME_CALCULATION':
      case 'EXPLAIN_CALCULATION':
        universalIntent = 'VOLUME_CALCULATION';
        break;
      case 'AHSP_SEARCH':
      case 'AHSP_INFORMATION':
        universalIntent = 'AHSP_LOOKUP';
        break;
      case 'PRICE_SEARCH':
      case 'MATERIAL_SEARCH':
      case 'EQUIPMENT_SEARCH':
        universalIntent = 'MATERIAL_PRICE_LOOKUP';
        break;
      case 'LABOR_SEARCH':
        universalIntent = 'WAGE_PRICE_LOOKUP';
        break;
      case 'DED_ANALYSIS':
        universalIntent = 'DED_ANALYSIS';
        break;
      case 'PDF_ANALYSIS':
      case 'IMAGE_ANALYSIS':
        universalIntent = 'FILE_ANALYSIS';
        break;
      case 'PROJECT_QUERY':
      case 'PROJECT_INFORMATION':
      case 'PROJECT_PROGRESS':
      case 'PROJECT_BUDGET':
      case 'PROJECT_MANAGEMENT':
      case 'TEAM_MANAGEMENT':
        universalIntent = 'PROJECT_LOOKUP';
        break;
      case 'TIME_SCHEDULE_ACTION':
        universalIntent = 'SCHEDULE_GENERATION';
        break;
      case 'KURVA_S_ACTION':
      case 'KURVA_S_INFORMATION':
        universalIntent = 'CURVE_S_GENERATION';
        break;
      case 'WBS_ACTION':
        universalIntent = 'WBS_GENERATION';
        break;
      case 'REPORT_ACTION':
      case 'REPORT_INFORMATION':
        universalIntent = 'REPORT_GENERATION';
        break;
      case 'CREATE_DOCUMENT_PACKAGE':
        universalIntent = 'CREATE_DOCUMENT_PACKAGE';
        break;
      case 'EXPORT_ACTION':
        universalIntent = entities.outputFormat === 'EXCEL' ? 'EXCEL_EXPORT' : 'PDF_EXPORT';
        break;
      default:
        if (['GENERAL_CHAT', 'GENERAL_QUESTION', 'UNKNOWN'].includes(rawClassified.category)) {
          // If vague and no specific entity found
          if (!entities.projectType && !entities.houseType && !entities.material && !entities.workType) {
            universalIntent = 'CLARIFICATION_REQUIRED';
          } else {
            universalIntent = 'GENERAL_CHAT';
          }
        } else {
          universalIntent = rawClassified.confidence < 0.65 ? 'CLARIFICATION_REQUIRED' : 'UNKNOWN';
        }
    }

    // Evaluate Missing Parameters for workflow
    if (universalIntent === 'AUTOMATIC_RAB_START') {
      if (entities.projectType === 'ROAD') {
        if (!entities.length) missingParameters.push('length');
        if (!entities.width) missingParameters.push('width');
      } else if (entities.projectType === 'WATER') {
        if (!entities.length) missingParameters.push('length');
      } else if (entities.projectType === 'HOUSE') {
        if (!entities.buildingArea && !entities.houseType) missingParameters.push('buildingArea');
      }
    }

    const requiresClarification = universalIntent === 'CLARIFICATION_REQUIRED' || rawClassified.confidence < 0.65;
    let clarificationQuestion: string | undefined = undefined;
    if (requiresClarification) {
      clarificationQuestion = 'Bisa jelaskan lebih spesifik apa yang ingin Anda kerjakan? Misalnya: "Buatkan RAB rumah type 36", "Hitung volume galian tanah", atau "Cek harga semen".';
    }

    return {
      intent: universalIntent,
      confidence: requiresClarification ? Math.min(rawClassified.confidence, 0.60) : rawClassified.confidence,
      entities,
      missingParameters,
      activeWorkflow: options?.activeWorkflow || null,
      requiresClarification,
      clarificationQuestion,
      legacyCategory: rawClassified.category
    };
  }
}


export const intentClassifier = new IntentClassifier();
export const classifyIntent = (query: string, page?: string) => intentClassifier.classify(query, page);

export function isSmallTalkIntent(category: string): boolean {
  return [
    'GREETING',
    'HOW_ARE_YOU',
    'SMALL_TALK',
    'THANKS',
    'GOODBYE',
    'CASUAL_CHAT',
    'IDENTITY_QUESTION',
    'CAPABILITY_QUESTION',
    'PRODUCT_OVERVIEW',
    'BASIC_HELP',
    'CHATBOT_HELP',
    'JOKING',
    'HUMOR',
    'GENERAL_CHAT'
  ].includes(category);
}
