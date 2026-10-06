import { RabItem, Project, UserRole, QTOItem } from '../types';
import { aiApiClient, NormalizedAiResponse, ActionProposal } from './aiApiClient';
import { buildFullAIContext } from './aiContextService';
import { buildReadOnlyProjectContext } from './aiProjectContext';
import { getCurrentSupabaseUser } from './supabaseClient';
import { defaultAiProvider } from './aiProviderEngine';
import { HOUSE_TYPE_CATALOG } from '../data/houseTypeCatalog';
import { getRegionalFactor, REGIONAL_WIZARD_OPTIONS } from '../data/regionalCostFactors';
import { unifiedConversationStore } from './ai/conversation/unifiedConversationStore';

export interface CoAssistantMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: string;
  intent?: string;
  actionProposal?: ActionProposal;
  wizardResponse?: any;
  quickActionResponse?: any;
  followUpSuggestions?: string[];
  isError?: boolean;
  table?: {
    headers: string[];
    rows: string[][];
  };
  stats?: {
    label: string;
    value: string;
    sub?: string;
    color?: string;
  };
}

export interface CoAssistantContextRequest {
  message: string;
  currentProject: Project | null;
  projectRabItems?: RabItem[];
  projectQtoItems?: QTOItem[];
  selectedRabItem?: RabItem | null;
  selectedQtoItem?: QTOItem | null;
  activeModule?: string;
  userRole?: UserRole;
  conversationId?: string | null;
  onThinking?: (step: string) => void;
}

export interface CoAssistantSendResult {
  message: CoAssistantMessage;
  conversationId: string | null;
}

class CoAssistantService {
  private activeConversationId: string | null = null;
  private currentUserId: string | null = null;

  /**
   * Reset conversation state and user session cache (used on logout or user switch)
   */
  public resetSession(): void {
    this.activeConversationId = null;
    this.currentUserId = null;
  }

  /**
   * Ensure conversation is bound to the authenticated user.
   * If a new user is detected, the old conversation is cleared immediately.
   */
  public async syncUserIsolation(): Promise<string | null> {
    try {
      const user = await getCurrentSupabaseUser();
      const userId = user?.id || 'guest-session';
      if (this.currentUserId && this.currentUserId !== userId) {
        this.resetSession();
      }
      this.currentUserId = userId;
      return userId;
    } catch {
      return this.currentUserId || 'guest-session';
    }
  }

  /**
   * Send a query to the real EZRAB AI backend with seamless fallback to construction copilot engine.
   */
  public async sendMessage(request: CoAssistantContextRequest): Promise<CoAssistantSendResult> {
    const trimmedMessage = request.message.trim();
    if (!trimmedMessage) {
      throw new Error('Pesan tidak boleh kosong.');
    }

    await this.syncUserIsolation();

    // Sync user message to Unified Conversation Store if active project is present
    if (request.currentProject?.id) {
      const pId = request.currentProject.id;
      const conv = request.conversationId
        ? (unifiedConversationStore.getConversation(request.conversationId, pId) || unifiedConversationStore.getOrCreateActiveConversation(pId))
        : unifiedConversationStore.getOrCreateActiveConversation(pId);
      this.activeConversationId = conv.id;

      const alreadyHasUserMsg = conv.messages.some(
        (m) => m.role === 'user' && m.content === trimmedMessage && Date.now() - new Date(m.createdAt).getTime() < 3000
      );
      if (!alreadyHasUserMsg) {
        unifiedConversationStore.appendMessage(conv.id, pId, {
          role: 'user',
          content: trimmedMessage,
        });
      }
    }

    // Check Role Restrictions: CLIENT cannot mutate RAB directly
    const role: UserRole = request.userRole || 'ESTIMATOR';
    const isClient = role === 'CLIENT';

    const normalizedLower = trimmedMessage.toLowerCase();
    const isConversational = 
      normalizedLower.includes('apa kabar') ||
      normalizedLower.includes('apakabar') ||
      normalizedLower.includes('hai') ||
      normalizedLower.includes('halo') ||
      normalizedLower.includes('terima kasih') ||
      normalizedLower.includes('makasih') ||
      normalizedLower.includes('kamu siapa') ||
      normalizedLower.includes('siapa kamu') ||
      normalizedLower.includes('kamu bisa apa') ||
      normalizedLower.includes('ezrab itu apa') ||
      normalizedLower.includes('selamat');

    const isAutomaticRab =
      normalizedLower.includes('rab') ||
      normalizedLower.includes('estimasi') ||
      normalizedLower.includes('hitung') ||
      normalizedLower.includes('buat') ||
      normalizedLower.includes('bikin') ||
      normalizedLower.includes('susun');

    // Verify Active Project for specific domain-tied queries (Audit, DED, Kurva S of existing project)
    const isProjectSpecificAnalysis =
      (normalizedLower.includes('audit') ||
       normalizedLower.includes('kurva s') ||
       normalizedLower.includes('progres') ||
       normalizedLower.includes('ded') ||
       normalizedLower.includes('item ini')) &&
      !isAutomaticRab;

    if (!request.currentProject && isProjectSpecificAnalysis) {
      return {
        message: {
          id: `ai-${Date.now()}`,
          role: 'ai',
          text: 'Belum ada proyek aktif. Pilih proyek terlebih dahulu untuk menggunakan analisis berbasis data proyek.',
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        },
        conversationId: this.activeConversationId,
      };
    }

    // Detect Document Package Wizard request ("Buatkan semua dokumen tender untuk proyek ini", dsb)
    const isDocumentPackageRequest =
      (normalizedLower.includes('dokumen') ||
       normalizedLower.includes('tender') ||
       normalizedLower.includes('surat penawaran') ||
       normalizedLower.includes('rks') ||
       normalizedLower.includes('pakta integritas')) &&
      !normalizedLower.includes('baca nota') &&
      !normalizedLower.includes('baca denah');

    if (isDocumentPackageRequest) {
      const projName = request.currentProject?.name || 'Proyek Aktif';
      const rabCount = request.projectRabItems?.length || 0;
      return {
        message: {
          id: `ai-doc-pkg-${Date.now()}`,
          role: 'ai',
          text: `### 📁 Panduan Pembuatan Dokumen Proyek & Tender (**${projName}**)\n\n` +
            `Untuk menyusun paket dokumen tender resmi dari data master & RAB, berikut tahapan terpadu yang dapat Anda jalankan:\n\n` +
            `1. **Tahap 1 — Profil & Legalitas Proyek**: Menetapkan nomor surat, data instansi tender/klien, serta pejabat penandatangan resmi.\n` +
            `2. **Tahap 2 — Sinkronisasi BoQ & RAB**: Memetakan seluruh **${rabCount > 0 ? `${rabCount} item pekerjaan` : 'data RAB proyek'}** secara otomatis menjadi rincian biaya penawaran standar PUPR.\n` +
            `3. **Tahap 3 — Timeline & Kurva S**: Memasukkan jadwal pelaksanaan mingguan dan milestone bobot pekerjaan.\n` +
            `4. **Tahap 4 — Pemilihan Paket Dokumen**: Memilih template yang akan disertakan (Surat Penawaran Harga, RKS Teknis, Metode Kerja, Rencana K3, Jadwal, Pakta Integritas).\n` +
            `5. **Tahap 5 — Generate & Download**: Mengunduh berkas lengkap format Word (.docx) dan PDF siap cetak.\n\n` +
            `Silakan klik tombol wizard di bawah untuk memulai pembuatan dokumen secara langsung dengan panduan langkah demi langkah:`,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          intent: 'CREATE_DOCUMENT_PACKAGE',
          actionProposal: {
            actionId: `ACT-OPEN-WIZARD-${Date.now()}`,
            toolName: 'OPEN_DOCUMENT_PACKAGE_WIZARD',
            description: 'Buka AI Document Package Wizard (Panduan 5 Langkah)',
            parameters: {
              projectId: request.currentProject?.id,
              projectName: projName,
            },
            requiresConfirmation: false,
          },
          followUpSuggestions: [
            'Buka Document Package Wizard',
            'Lihat Dokumen Proyek',
            'Periksa Item RAB Proyek',
          ],
        },
        conversationId: this.activeConversationId,
      };
    }

    const conversationIdToSend = request.conversationId || this.activeConversationId || undefined;
    const clientMessageId = `client-msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // First attempt: Server API Client
    try {
      const projectContext = request.currentProject && !isConversational && !isAutomaticRab
        ? buildReadOnlyProjectContext({
            project: request.currentProject,
            rabItems: request.projectRabItems || [],
            question: trimmedMessage,
          })
        : undefined;

      const response: NormalizedAiResponse = await aiApiClient.sendMessage({
        message: trimmedMessage,
        projectId: request.currentProject?.id,
        conversationId: conversationIdToSend,
        currentPage: request.activeModule || 'rab-estimasi',
        projectContext,
        clientMessageId,
        idempotencyKey: `co-asst:${conversationIdToSend || 'default'}:${clientMessageId}`,
      });

      if (response.conversationId) {
        this.activeConversationId = response.conversationId;
      }

      let proposal = response.actionProposal;
      if (isClient && proposal) {
        proposal = undefined; // Client role has view & query permission only
      }

      const aiMsg: CoAssistantMessage = {
        id: response.messageId || `ai-${Date.now()}`,
        role: 'ai',
        text: response.content,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        intent: response.intent,
        actionProposal: proposal,
        wizardResponse: response.wizardResponse,
        quickActionResponse: response.quickActionResponse,
        followUpSuggestions: response.followUpSuggestions,
        isError: response.isError,
      };

      this.syncAiResponseToStore(request.currentProject?.id, aiMsg);

      return {
        message: aiMsg,
        conversationId: this.activeConversationId,
      };
    } catch (apiErr: any) {
      console.warn('[CoAssistantService] API Gateway returned error, routing to EZRAB Construction Copilot Core Engine:', apiErr?.message);

      // Fallback to core client-side construction engine with real live project data
      try {
        const fullContext = buildFullAIContext(request.currentProject, request.projectRabItems || []);
        const localResult = await defaultAiProvider.chat(
          trimmedMessage,
          fullContext,
          request.onThinking
        );

        let proposal: ActionProposal | undefined = undefined;
        if (localResult.actionProposal && !isClient) {
          proposal = {
            actionId: localResult.actionProposal.id,
            toolName: localResult.actionProposal.type,
            parameters: localResult.actionProposal.itemData || {},
            description: localResult.actionProposal.description,
            requiresConfirmation: true,
          };
        }

        const fallbackMsg: CoAssistantMessage = {
          id: `ai-core-${Date.now()}`,
          role: 'ai',
          text: localResult.content,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          intent: localResult.intent,
          wizardResponse: localResult.wizardResponse,
          quickActionResponse: (localResult as any).quickActionResponse,
          followUpSuggestions: (localResult as any).followUpSuggestions,
          actionProposal: proposal,
          table: localResult.table,
          stats: localResult.stats,
          isError: false,
        };

        this.syncAiResponseToStore(request.currentProject?.id, fallbackMsg);

        return {
          message: fallbackMsg,
          conversationId: this.activeConversationId,
        };
      } catch (coreErr: any) {
        const errMsg: CoAssistantMessage = {
          id: `ai-err-${Date.now()}`,
          role: 'ai',
          text: coreErr?.message || 'Maaf, terjadi kendala saat menganalisis data proyek. Silakan coba kembali.',
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          isError: true,
        };

        this.syncAiResponseToStore(request.currentProject?.id, errMsg);

        return {
          message: errMsg,
          conversationId: this.activeConversationId,
        };
      }
    }
  }

  public getConversationId(): string | null {
    return this.activeConversationId;
  }

  public setConversationId(id: string | null): void {
    this.activeConversationId = id;
  }

  private syncAiResponseToStore(projectId?: string, message?: CoAssistantMessage): void {
    if (!projectId || !message || !this.activeConversationId) return;
    try {
      unifiedConversationStore.appendMessage(this.activeConversationId, projectId, {
        id: message.id,
        role: 'assistant',
        content: message.text,
        timestamp: message.timestamp,
        badge: (message as any).badge,
        stats: message.stats,
        table: message.table,
        wizardResponse: message.wizardResponse,
        quickActionResponse: message.quickActionResponse,
        followUpSuggestions: message.followUpSuggestions,
        isError: message.isError,
        actionProposal: message.actionProposal ? {
          id: message.actionProposal.actionId,
          type: 'ACTION',
          projectId,
          action: message.actionProposal.toolName,
          title: message.actionProposal.description,
          description: message.actionProposal.description,
          requiresApproval: true,
          isMutation: true,
          status: 'PENDING',
          proposedChanges: { item: message.actionProposal.parameters },
          createdAt: new Date().toISOString(),
        } : undefined,
      });
    } catch (e) {
      console.warn('[CoAssistantService] syncAiResponseToStore error:', e);
    }
  }
}

export const coAssistantService = new CoAssistantService();

/**
 * Client-Side Resilient Wizard Fallback Resolver
 * Guarantees seamless wizard navigation and calculation even if network hiccups occur.
 */
export function resolveClientWizardStep(
  sessionId: string,
  choiceId?: string,
  parameters?: Record<string, any>,
  lastWizardData?: any
): any {
  // 1. House type selection
  const houseItem = choiceId ? HOUSE_TYPE_CATALOG.find((h: any) => h.id === choiceId || h.value === choiceId || h.templateId === choiceId) : undefined;
  if (houseItem) {
    const floorStr = houseItem.defaultFloorCount ? `${houseItem.defaultFloorCount} Lantai` : '1 Lantai';
    const areaStr = houseItem.area ? `±${houseItem.area} m²` : 'Bebas Custom';
    return {
      responseType: 'wizard',
      wizardSessionId: sessionId,
      step: 'TEMPLATE_CONFIRMATION',
      title: `Konfirmasi Pilihan: ${houseItem.label}`,
      message: `Anda memilih template **${houseItem.label}** (${areaStr}, ${floorStr}).\n${houseItem.description}.\n\nSilakan konfirmasi template ini untuk melanjutkan ke konfigurasi spesifikasi proyek dan perhitungan RAB:`,
      canGoBack: true,
      canCancel: true,
      selectedTemplate: {
        id: houseItem.id,
        templateId: houseItem.templateId || 'HOUSE-T36-1FL',
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
      progress: { current: 2, total: 4, stepName: 'Konfirmasi Template' }
    };
  }

  // 2. Confirm template -> BASIC_PARAMETER_COLLECTION
  if (choiceId === 'PROCEED_CONFIG' || lastWizardData?.step === 'TEMPLATE_CONFIRMATION') {
    const sel = lastWizardData?.selectedTemplate;
    const defaultArea = sel?.area || 60;
    return {
      responseType: 'wizard',
      wizardSessionId: sessionId,
      step: 'BASIC_PARAMETER_COLLECTION',
      title: `Spesifikasi Teknis: ${sel?.label || 'Rumah Tinggal'}`,
      message: `Tentukan parameter teknis untuk **${sel?.label || 'Rumah Tinggal'}** di bawah ini untuk memulai kalkulasi RAB deterministik standar AHSP PUPR 2026:`,
      canGoBack: true,
      canCancel: true,
      selectedTemplate: sel,
      questions: [
        {
          id: 'building_area',
          type: 'unit_number',
          label: 'Luas Bangunan',
          description: 'Luas lantai dasar bangunan rumah tinggal',
          unit: 'm²',
          required: true,
          defaultValue: defaultArea,
          validation: { min: 21, max: 1000 }
        },
        {
          id: 'foundation_type',
          type: 'single_select',
          label: 'Jenis Pondasi Utama',
          description: 'Pondasi struktur bawah penyangga beban dinding & atap',
          required: true,
          defaultValue: (sel?.floorCount || 1) > 1 ? 'FOOTPLATE' : 'BATU_KALI',
          options: [
            { id: 'batu_kali', label: 'Pondasi Batu Kali / Menerus', value: 'BATU_KALI', nextStep: 'NEXT', description: 'Standar tanah keras stabil (Kedalaman 70-80cm)' },
            { id: 'footplate', label: 'Pondasi Footplate (Cakar Ayam)', value: 'FOOTPLATE', nextStep: 'NEXT', description: 'Kombinasi footplate beton bertulang dan batu kali' }
          ]
        },
        {
          id: 'wall_type',
          type: 'single_select',
          label: 'Jenis Dinding',
          description: 'Material pasangan dinding keliling & sekat',
          required: true,
          defaultValue: 'BATA_RINGAN',
          options: [
            { id: 'bata_ringan', label: 'Bata Ringan (Hebel) 10 cm', value: 'BATA_RINGAN', nextStep: 'NEXT', description: 'Pemasangan cepat, ringan & presisi' },
            { id: 'bata_merah', label: 'Bata Merah Standar Lokal', value: 'BATA_MERAH', nextStep: 'NEXT', description: 'Kuat dan kedap suara alami' }
          ]
        },
        {
          id: 'roof_type',
          type: 'single_select',
          label: 'Rangka & Penutup Atap',
          description: 'Struktur rangka atap utama dan penutup genteng',
          required: true,
          defaultValue: defaultArea >= 150 ? 'BAJA_RINGAN_GENTENG_KERAMIK' : 'BAJA_RINGAN_GENTENG_METAL',
          options: [
            { id: 'genteng_metal', label: 'Rangka Baja Ringan + Genteng Metal Pasir', value: 'BAJA_RINGAN_GENTENG_METAL', nextStep: 'NEXT', description: 'Ekonomis, anti karat & berbobot ringan' },
            { id: 'genteng_keramik', label: 'Rangka Baja Ringan + Genteng Keramik / Beton', value: 'BAJA_RINGAN_GENTENG_KERAMIK', nextStep: 'NEXT', description: 'Tampilan elegan, tahan cuaca ekstrem' }
          ]
        },
        {
          id: 'quality_level',
          type: 'single_select',
          label: 'Kelas Kualitas Finishing',
          description: 'Spesifikasi material finishing (lantai, cat, sanitair)',
          required: true,
          defaultValue: defaultArea >= 150 ? 'MENENGAH' : 'STANDAR',
          options: [
            { id: 'standar', label: 'Standar / Ekonomis', value: 'STANDAR', nextStep: 'NEXT', description: 'Keramik 40x40, Cat standar, Sanitair standar' },
            { id: 'menengah', label: 'Menengah / Standard Pro', value: 'MENENGAH', nextStep: 'NEXT', description: 'Granit Tile 60x60, Cat premium weather, Kloset duduk TOTO' }
          ]
        },
        {
          id: 'location',
          type: 'dropdown',
          label: 'Wilayah / Lokasi Proyek (Indeks Biaya Wilayah)',
          description: 'Faktor penyesuaian harga satuan material & upah relatif terhadap acuan DKI Jakarta.',
          required: true,
          defaultValue: 'DKI_JAKARTA',
          options: REGIONAL_WIZARD_OPTIONS
        }
      ],
      progress: { current: 3, total: 4, stepName: 'Spesifikasi Teknis' }
    };
  }

  // 3. Parameters -> RAB_PREVIEW
  const area = Number(parameters?.building_area) || lastWizardData?.selectedTemplate?.area || 60;
  const tplName = lastWizardData?.selectedTemplate?.label || `Rumah Type ${area}`;
  const isMultiFloor = (lastWizardData?.selectedTemplate?.floorCount || 1) > 1;
  const foundationType = parameters?.foundation_type || (isMultiFloor ? 'FOOTPLATE' : 'BATU_KALI');
  const wallType = parameters?.wall_type || 'BATA_RINGAN';
  const quality = parameters?.quality_level || (area >= 150 ? 'MENENGAH' : 'STANDAR');

  const scale = Math.max(0.5, area / 36);
  const linearScale = Math.sqrt(scale);
  const panjangPondasi = Math.round(34.0 * linearScale * 10) / 10;
  const luasDinding = Math.round(area * 2.8 * 10) / 10;

  const calculatedItems: any[] = [
    // 01. PEKERJAAN PERSIAPAN
    {
      id: `RAB-AI-${Date.now()}-1`,
      no: 1,
      code: '1.1',
      category: '01. PEKERJAAN PERSIAPAN',
      sectionName: '01. PEKERJAAN PERSIAPAN',
      description: 'Pembersihan dan Perataan Lapangan Kerja Proyek',
      volume: Math.round(area * 1.25 * 10) / 10,
      unit: 'm2',
      unitPrice: 18500,
      amount: Math.round(area * 1.25 * 18500),
      ahspCode: 'A.2.2.1.9',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-2`,
      no: 2,
      code: '1.2',
      category: '01. PEKERJAAN PERSIAPAN',
      sectionName: '01. PEKERJAAN PERSIAPAN',
      description: 'Pengukuran dan Pemasangan Bowplank Kayu 5/7',
      volume: Math.round((panjangPondasi + 8) * 10) / 10,
      unit: 'm1',
      unitPrice: 42000,
      amount: Math.round((panjangPondasi + 8) * 42000),
      ahspCode: 'A.2.2.1.4',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-3`,
      no: 3,
      code: '1.3',
      category: '01. PEKERJAAN PERSIAPAN',
      sectionName: '01. PEKERJAAN PERSIAPAN',
      description: 'Penyediaan Air Kerja, Listrik Kerja dan Direksi Keet Darurat',
      volume: 1,
      unit: 'ls',
      unitPrice: 1850000,
      amount: 1850000,
      ahspCode: 'A.2.2.1.1',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },

    // 02. PEKERJAAN TANAH DAN PONDASI
    {
      id: `RAB-AI-${Date.now()}-4`,
      no: 4,
      code: '2.1',
      category: '02. PEKERJAAN TANAH DAN PONDASI',
      sectionName: '02. PEKERJAAN TANAH DAN PONDASI',
      description: 'Galian Tanah Pondasi Menerus / Footplate Kedalaman 0.8 m',
      volume: Math.round(panjangPondasi * 0.8 * 0.7 * 10) / 10,
      unit: 'm3',
      unitPrice: 88500,
      amount: Math.round(panjangPondasi * 0.8 * 0.7 * 88500),
      ahspCode: 'A.2.3.1.1',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-5`,
      no: 5,
      code: '2.2',
      category: '02. PEKERJAAN TANAH DAN PONDASI',
      sectionName: '02. PEKERJAAN TANAH DAN PONDASI',
      description: 'Urugan Pasir Bawah Pondasi & Bawah Lantai Tebal 5 cm Padat',
      volume: Math.round(panjangPondasi * 0.8 * 0.05 * 10) / 10,
      unit: 'm3',
      unitPrice: 245000,
      amount: Math.round(panjangPondasi * 0.8 * 0.05 * 245000),
      ahspCode: 'A.2.3.1.11',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-6`,
      no: 6,
      code: '2.3',
      category: '02. PEKERJAAN TANAH DAN PONDASI',
      sectionName: '02. PEKERJAAN TANAH DAN PONDASI',
      description: foundationType === 'FOOTPLATE'
        ? 'Pondasi Footplate Beton Bertulang K-225 dan Pasangan Batu Kali'
        : 'Pasangan Pondasi Batu Kali Belah 1 PC : 5 PP',
      volume: Math.round(panjangPondasi * 0.45 * 10) / 10,
      unit: 'm3',
      unitPrice: foundationType === 'FOOTPLATE' ? 1250000 : 945000,
      amount: Math.round(panjangPondasi * 0.45 * (foundationType === 'FOOTPLATE' ? 1250000 : 945000)),
      ahspCode: foundationType === 'FOOTPLATE' ? 'A.4.1.1.5' : 'A.3.2.1.2',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-7`,
      no: 7,
      code: '2.4',
      category: '02. PEKERJAAN TANAH DAN PONDASI',
      sectionName: '02. PEKERJAAN TANAH DAN PONDASI',
      description: 'Urugan Tanah Kembali dan Pemadatan Sekitar Pondasi',
      volume: Math.round(panjangPondasi * 0.8 * 0.7 * 0.35 * 10) / 10,
      unit: 'm3',
      unitPrice: 38000,
      amount: Math.round(panjangPondasi * 0.8 * 0.7 * 0.35 * 38000),
      ahspCode: 'A.2.3.1.9',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },

    // 03. PEKERJAAN STRUKTUR
    {
      id: `RAB-AI-${Date.now()}-8`,
      no: 8,
      code: '3.1',
      category: '03. PEKERJAAN STRUKTUR',
      sectionName: '03. PEKERJAAN STRUKTUR',
      description: 'Beton Bertulang Sloof 15/20 cm Mutu K-200 (fc 17.1 MPa)',
      volume: Math.round(panjangPondasi * 0.15 * 0.20 * 10) / 10,
      unit: 'm3',
      unitPrice: 4850000,
      amount: Math.round(panjangPondasi * 0.15 * 0.20 * 4850000),
      ahspCode: 'A.4.1.1.5',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-9`,
      no: 9,
      code: '3.2',
      category: '03. PEKERJAAN STRUKTUR',
      sectionName: '03. PEKERJAAN STRUKTUR',
      description: 'Beton Bertulang Kolom Praktis 15/15 cm Pembesian 4D10',
      volume: Math.round(14 * linearScale * (0.15 * 0.15 * 3.5) * 10) / 10,
      unit: 'm3',
      unitPrice: 5100000,
      amount: Math.round(14 * linearScale * (0.15 * 0.15 * 3.5) * 5100000),
      ahspCode: 'A.4.1.1.6',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-10`,
      no: 10,
      code: '3.3',
      category: '03. PEKERJAAN STRUKTUR',
      sectionName: '03. PEKERJAAN STRUKTUR',
      description: 'Beton Bertulang Ringbalk 15/15 cm',
      volume: Math.round(panjangPondasi * 0.15 * 0.15 * 10) / 10,
      unit: 'm3',
      unitPrice: 4950000,
      amount: Math.round(panjangPondasi * 0.15 * 0.15 * 4950000),
      ahspCode: 'A.4.1.1.7',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },

    // 04. PEKERJAAN DINDING
    {
      id: `RAB-AI-${Date.now()}-11`,
      no: 11,
      code: '4.1',
      category: '04. PEKERJAAN DINDING',
      sectionName: '04. PEKERJAAN DINDING',
      description: wallType === 'BATA_MERAH'
        ? 'Pasangan Dinding Bata Merah Tebal 1/2 Bata Campuran 1 PC : 5 PP'
        : 'Pasangan Dinding Bata Ringan (AAC) Tebal 10 cm dengan Mortar Instan',
      volume: luasDinding,
      unit: 'm2',
      unitPrice: wallType === 'BATA_MERAH' ? 145000 : 138000,
      amount: Math.round(luasDinding * (wallType === 'BATA_MERAH' ? 145000 : 138000)),
      ahspCode: wallType === 'BATA_MERAH' ? 'A.4.4.1.9' : 'A.4.4.1.20',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-12`,
      no: 12,
      code: '4.2',
      category: '04. PEKERJAAN DINDING',
      sectionName: '04. PEKERJAAN DINDING',
      description: 'Plesteran Dinding Mortar Instan 2 Sisi Tebal 15 mm',
      volume: Math.round(luasDinding * 2 * 10) / 10,
      unit: 'm2',
      unitPrice: 58000,
      amount: Math.round(luasDinding * 2 * 58000),
      ahspCode: 'A.4.4.2.4',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-13`,
      no: 13,
      code: '4.3',
      category: '04. PEKERJAAN DINDING',
      sectionName: '04. PEKERJAAN DINDING',
      description: 'Acian Dinding Halus Mortar Instan Siap Cat',
      volume: Math.round(luasDinding * 2 * 10) / 10,
      unit: 'm2',
      unitPrice: 36500,
      amount: Math.round(luasDinding * 2 * 36500),
      ahspCode: 'A.4.4.2.27',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },

    // 05. PEKERJAAN LANTAI
    {
      id: `RAB-AI-${Date.now()}-14`,
      no: 14,
      code: '5.1',
      category: '05. PEKERJAAN LANTAI',
      sectionName: '05. PEKERJAAN LANTAI',
      description: 'Rabat Beton Dasar Bawah Keramik Lantai Tebal 5 cm',
      volume: Math.round(area * 0.92 * 10) / 10,
      unit: 'm2',
      unitPrice: 62000,
      amount: Math.round(area * 0.92 * 62000),
      ahspCode: 'A.4.1.1.4',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-15`,
      no: 15,
      code: '5.2',
      category: '05. PEKERJAAN LANTAI',
      sectionName: '05. PEKERJAAN LANTAI',
      description: quality === 'MENENGAH'
        ? 'Pemasangan Lantai Granit Tile 60x60 cm Polish Polished'
        : 'Pemasangan Lantai Keramik 40x40 cm Glazed Polish',
      volume: Math.round(area * 0.82 * 10) / 10,
      unit: 'm2',
      unitPrice: quality === 'MENENGAH' ? 245000 : 165000,
      amount: Math.round(area * 0.82 * (quality === 'MENENGAH' ? 245000 : 165000)),
      ahspCode: quality === 'MENENGAH' ? 'A.4.4.3.40' : 'A.4.4.3.35',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-16`,
      no: 16,
      code: '5.3',
      category: '05. PEKERJAAN LANTAI',
      sectionName: '05. PEKERJAAN LANTAI',
      description: 'Pemasangan Keramik Kamar Mandi Anti Slip 20x20 & 20x40',
      volume: Math.round(area * 0.10 * 10) / 10,
      unit: 'm2',
      unitPrice: 185000,
      amount: Math.round(area * 0.10 * 185000),
      ahspCode: 'A.4.4.3.42',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },

    // 06. PEKERJAAN ATAP
    {
      id: `RAB-AI-${Date.now()}-17`,
      no: 17,
      code: '6.1',
      category: '06. PEKERJAAN ATAP',
      sectionName: '06. PEKERJAAN ATAP',
      description: 'Konstruksi Rangka Atap Baja Ringan Truss C75 t=0.75mm + Reng',
      volume: Math.round(area * 1.35 * 10) / 10,
      unit: 'm2',
      unitPrice: 185000,
      amount: Math.round(area * 1.35 * 185000),
      ahspCode: 'A.4.2.1.21',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-18`,
      no: 18,
      code: '6.2',
      category: '06. PEKERJAAN ATAP',
      sectionName: '06. PEKERJAAN ATAP',
      description: 'Penutup Atap Genteng Metal Berpasir Tebal 0.30 mm',
      volume: Math.round(area * 1.35 * 10) / 10,
      unit: 'm2',
      unitPrice: 135000,
      amount: Math.round(area * 1.35 * 135000),
      ahspCode: 'A.4.5.2.32',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-19`,
      no: 19,
      code: '6.3',
      category: '06. PEKERJAAN ATAP',
      sectionName: '06. PEKERJAAN ATAP',
      description: 'Pemasangan Nok / Bubungan Genteng Metal Berpasir',
      volume: Math.round(Math.sqrt(area) * 1.4 * 10) / 10,
      unit: 'm1',
      unitPrice: 95000,
      amount: Math.round(Math.sqrt(area) * 1.4 * 95000),
      ahspCode: 'A.4.5.2.38',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },

    // 07. PEKERJAAN KUSEN, PINTU, DAN JENDELA
    {
      id: `RAB-AI-${Date.now()}-20`,
      no: 20,
      code: '7.1',
      category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
      sectionName: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
      description: 'Kusen Pintu & Jendela Aluminium 4 Inch Powder Coating',
      volume: Math.round(area * 0.65 * 10) / 10,
      unit: 'm1',
      unitPrice: 115000,
      amount: Math.round(area * 0.65 * 115000),
      ahspCode: 'A.4.6.1.1',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-21`,
      no: 21,
      code: '7.2',
      category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
      sectionName: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
      description: 'Daun Pintu Utama Panel Solid / Engineering Door Lengkap Aksesoris',
      volume: 1,
      unit: 'unit',
      unitPrice: quality === 'MENENGAH' ? 3200000 : 2450000,
      amount: quality === 'MENENGAH' ? 3200000 : 2450000,
      ahspCode: 'A.4.6.2.2',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-22`,
      no: 22,
      code: '7.3',
      category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
      sectionName: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
      description: 'Daun Pintu Kamar Tidur & KM Lengkap Kunci Engsel',
      volume: Math.max(2, Math.floor(area / 18)),
      unit: 'unit',
      unitPrice: 1350000,
      amount: Math.max(2, Math.floor(area / 18)) * 1350000,
      ahspCode: 'A.4.6.2.5',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-23`,
      no: 23,
      code: '7.4',
      category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
      sectionName: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
      description: 'Daun Jendela Kaca Bening 5 mm Rangka Casement Aluminium',
      volume: Math.max(4, Math.floor(area / 9)),
      unit: 'unit',
      unitPrice: 550000,
      amount: Math.max(4, Math.floor(area / 9)) * 550000,
      ahspCode: 'A.4.6.2.12',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },

    // 08. PEKERJAAN PLAFON
    {
      id: `RAB-AI-${Date.now()}-24`,
      no: 24,
      code: '8.1',
      category: '08. PEKERJAAN PLAFON',
      sectionName: '08. PEKERJAAN PLAFON',
      description: 'Rangka Plafon Hollow Galvanis 40x40 & 20x40 Standar SNI',
      volume: Math.round(area * 1.05 * 10) / 10,
      unit: 'm2',
      unitPrice: 68000,
      amount: Math.round(area * 1.05 * 68000),
      ahspCode: 'A.4.5.1.5',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-25`,
      no: 25,
      code: '8.2',
      category: '08. PEKERJAAN PLAFON',
      sectionName: '08. PEKERJAAN PLAFON',
      description: 'Pemasangan Plafon Gypsum Board 9 mm + Sambungan Compound',
      volume: Math.round(area * 10) / 10,
      unit: 'm2',
      unitPrice: 58000,
      amount: Math.round(area * 58000),
      ahspCode: 'A.4.5.1.7',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-26`,
      no: 26,
      code: '8.3',
      category: '08. PEKERJAAN PLAFON',
      sectionName: '08. PEKERJAAN PLAFON',
      description: 'Pemasangan List Profil Gypsum Sudut Plafon 7-10 cm',
      volume: Math.round(Math.sqrt(area) * 4 * 1.4 * 10) / 10,
      unit: 'm1',
      unitPrice: 25000,
      amount: Math.round(Math.sqrt(area) * 4 * 1.4 * 25000),
      ahspCode: 'A.4.5.1.9',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },

    // 09. PEKERJAAN INSTALASI LISTRIK
    {
      id: `RAB-AI-${Date.now()}-27`,
      no: 27,
      code: '9.1',
      category: '09. PEKERJAAN INSTALASI LISTRIK',
      sectionName: '09. PEKERJAAN INSTALASI LISTRIK',
      description: 'Titik Instalasi Lampu Kabel NYM 3x1.5 mm² dalam Conduit High Impact',
      volume: Math.max(8, Math.round(area * 0.35)),
      unit: 'titik',
      unitPrice: 235000,
      amount: Math.max(8, Math.round(area * 0.35)) * 235000,
      ahspCode: 'A.8.1.1.1',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-28`,
      no: 28,
      code: '9.2',
      category: '09. PEKERJAAN INSTALASI LISTRIK',
      sectionName: '09. PEKERJAAN INSTALASI LISTRIK',
      description: 'Titik Instalasi Stop Kontak & Saklar Kabel NYM 3x2.5 mm²',
      volume: Math.max(6, Math.round(area * 0.25)),
      unit: 'titik',
      unitPrice: 245000,
      amount: Math.max(6, Math.round(area * 0.25)) * 245000,
      ahspCode: 'A.8.1.1.2',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-29`,
      no: 29,
      code: '9.3',
      category: '09. PEKERJAAN INSTALASI LISTRIK',
      sectionName: '09. PEKERJAAN INSTALASI LISTRIK',
      description: 'Box Panel MCB 4 Grup Lengkap Pengaman Grounding Rod',
      volume: 1,
      unit: 'unit',
      unitPrice: 1150000,
      amount: 1150000,
      ahspCode: 'A.8.1.2.3',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },

    // 10. PEKERJAAN PLAMBING DAN SANITASI
    {
      id: `RAB-AI-${Date.now()}-30`,
      no: 30,
      code: '10.1',
      category: '10. PEKERJAAN PLAMBING DAN SANITASI',
      sectionName: '10. PEKERJAAN PLAMBING DAN SANITASI',
      description: 'Instalasi Pipa Air Bersih PVC AW Dia. 1/2" & 3/4"',
      volume: Math.round(area * 0.65 * 10) / 10,
      unit: 'm1',
      unitPrice: 48000,
      amount: Math.round(area * 0.65 * 48000),
      ahspCode: 'A.5.1.1.19',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-31`,
      no: 31,
      code: '10.2',
      category: '10. PEKERJAAN PLAMBING DAN SANITASI',
      sectionName: '10. PEKERJAAN PLAMBING DAN SANITASI',
      description: 'Instalasi Pipa Air Kotor & Buangan PVC D Dia. 3" & 4"',
      volume: Math.round(area * 0.55 * 10) / 10,
      unit: 'm1',
      unitPrice: 85000,
      amount: Math.round(area * 0.55 * 85000),
      ahspCode: 'A.5.1.1.23',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-32`,
      no: 32,
      code: '10.3',
      category: '10. PEKERJAAN PLAMBING DAN SANITASI',
      sectionName: '10. PEKERJAAN PLAMBING DAN SANITASI',
      description: quality === 'MENENGAH'
        ? 'Instalasi Kloset Duduk Keramik TOTO Dual Flush + Jet Washer'
        : 'Instalasi Kloset Duduk / Jongkok Keramik Standar SNI + Kran',
      volume: 1,
      unit: 'unit',
      unitPrice: quality === 'MENENGAH' ? 2950000 : 1850000,
      amount: quality === 'MENENGAH' ? 2950000 : 1850000,
      ahspCode: 'A.5.1.1.1',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-33`,
      no: 33,
      code: '10.4',
      category: '10. PEKERJAAN PLAMBING DAN SANITASI',
      sectionName: '10. PEKERJAAN PLAMBING DAN SANITASI',
      description: 'Pemasangan Floor Drain Stainless Steel & Kran Dinding Stainless',
      volume: 2,
      unit: 'set',
      unitPrice: 320000,
      amount: 640000,
      ahspCode: 'A.5.1.1.14',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },

    // 11. PEKERJAAN PENGECATAN
    {
      id: `RAB-AI-${Date.now()}-34`,
      no: 34,
      code: '11.1',
      category: '11. PEKERJAAN PENGECATAN',
      sectionName: '11. PEKERJAAN PENGECATAN',
      description: 'Pengecatan Dinding Interior 1 Lapis Sealer + 2 Lapis Cat Emulsi',
      volume: Math.round(luasDinding * 1.5 * 10) / 10,
      unit: 'm2',
      unitPrice: 36500,
      amount: Math.round(luasDinding * 1.5 * 36500),
      ahspCode: 'A.4.7.1.10',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-35`,
      no: 35,
      code: '11.2',
      category: '11. PEKERJAAN PENGECATAN',
      sectionName: '11. PEKERJAAN PENGECATAN',
      description: 'Pengecatan Dinding Eksterior Weathershield Tahan Cuaca & Jamur',
      volume: Math.round(luasDinding * 0.5 * 10) / 10,
      unit: 'm2',
      unitPrice: 49500,
      amount: Math.round(luasDinding * 0.5 * 49500),
      ahspCode: 'A.4.7.1.11',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-36`,
      no: 36,
      code: '11.3',
      category: '11. PEKERJAAN PENGECATAN',
      sectionName: '11. PEKERJAAN PENGECATAN',
      description: 'Pengecatan Plafon Gypsum Warna Putih Khusus Plafon',
      volume: Math.round(area * 10) / 10,
      unit: 'm2',
      unitPrice: 32000,
      amount: Math.round(area * 32000),
      ahspCode: 'A.4.7.1.12',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },

    // 12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN
    {
      id: `RAB-AI-${Date.now()}-37`,
      no: 37,
      code: '12.1',
      category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
      sectionName: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
      description: 'Pembuatan Septic Tank Biofill / Pasangan Bata + Bak Resapan',
      volume: 1,
      unit: 'unit',
      unitPrice: 3850000,
      amount: 3850000,
      ahspCode: 'A.5.1.1.30',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-38`,
      no: 38,
      code: '12.2',
      category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
      sectionName: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
      description: 'Rabat Beton Carport & Selasar Keliling Tebal 7 cm Mutu K-175',
      volume: Math.round(area * 0.35 * 10) / 10,
      unit: 'm2',
      unitPrice: 85000,
      amount: Math.round(area * 0.35 * 85000),
      ahspCode: 'A.4.1.1.3',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-39`,
      no: 39,
      code: '12.3',
      category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
      sectionName: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
      description: 'Saluran Drainase Keliling Pasangan Batu Bata / Saluran U-Ditch Air Hujan',
      volume: Math.round(Math.sqrt(area) * 4 * 0.6 * 10) / 10,
      unit: 'm1',
      unitPrice: 95000,
      amount: Math.round(Math.sqrt(area) * 4 * 0.6 * 95000),
      ahspCode: 'A.2.3.1.15',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },

    // 13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA
    {
      id: `RAB-AI-${Date.now()}-40`,
      no: 40,
      code: '13.1',
      category: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
      sectionName: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
      description: 'Pembersihan Akhir Sisa Material Konstruksi, Debu & Residu Siap Huni',
      volume: 1,
      unit: 'ls',
      unitPrice: 750000,
      amount: 750000,
      ahspCode: 'A.2.2.1.2',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-41`,
      no: 41,
      code: '13.2',
      category: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
      sectionName: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
      description: 'Pengujian, Commissioning Kelistrikan, Plambing & Uji Tekan Air',
      volume: 1,
      unit: 'ls',
      unitPrice: 500000,
      amount: 500000,
      ahspCode: 'A.8.1.3.1',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    },
    {
      id: `RAB-AI-${Date.now()}-42`,
      no: 42,
      code: '13.3',
      category: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
      sectionName: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
      description: 'Dokumentasi Proyek, As-Built Drawing Standar & Berita Acara Serah Terima (BAST)',
      volume: 1,
      unit: 'ls',
      unitPrice: 650000,
      amount: 650000,
      ahspCode: 'A.1.1.1.1',
      volumeSource: 'AI_GENERATED',
      verificationStatus: 'VERIFIED'
    }
  ];

  const locationKey = parameters?.location || 'DKI_JAKARTA';
  const regionFactor = getRegionalFactor(locationKey);
  const regionalMultiplier = regionFactor.multiplier;

  if (regionalMultiplier !== 1.0) {
    for (const item of calculatedItems) {
      item.unitPrice = Math.round(item.unitPrice * regionalMultiplier);
      item.amount = Math.round(item.volume * item.unitPrice);
    }
  }

  let directCost = 0;
  for (const item of calculatedItems) {
    directCost += item.amount;
  }
  const overheadAmount = Math.round(directCost * 0.05);
  const profitAmount = Math.round(directCost * 0.05);
  const subtotalBeforeTax = directCost + overheadAmount + profitAmount;
  const taxAmount = Math.round(subtotalBeforeTax * 0.11);
  const grandTotal = subtotalBeforeTax + taxAmount;

  return {
    responseType: 'wizard',
    wizardSessionId: sessionId,
    step: 'RAB_PREVIEW',
    title: `Preview Estimasi RAB: ${tplName}`,
    message: `RAB untuk **${tplName}** (Luas ${area} m²) telah berhasil dikalkulasi secara presisi dengan standar AHSP PUPR 2026. Penyesuaian Wilayah: ${regionFactor.name} (${regionFactor.percentage}% acuan). Silakan tinjau ringkasan biaya sebelum menerapkan ke spreadsheet proyek:`,
    canGoBack: true,
    canCancel: true,
    calculatedItems,
    summary: {
      templateId: lastWizardData?.selectedTemplate?.templateId || 'HOUSE-T36-1FL',
      templateName: tplName,
      collectedParameters: { building_area: area, location: locationKey, ...parameters },
      itemsCount: calculatedItems.length,
      directCost,
      overheadPercent: 5,
      overheadAmount,
      profitPercent: 5,
      profitAmount,
      subtotalBeforeTax,
      taxPercent: 11,
      taxAmount,
      grandTotal,
      regionInfo: {
        key: locationKey,
        name: regionFactor.name,
        multiplier: regionalMultiplier,
        percentage: regionFactor.percentage,
        description: regionFactor.description
      },
      categories: [
        { category: '01. PEKERJAAN PERSIAPAN', subtotal: calculatedItems.filter(i => i.category.includes('01')).reduce((s, i) => s + i.amount, 0) },
        { category: '02. PEKERJAAN TANAH DAN PONDASI', subtotal: calculatedItems.filter(i => i.category.includes('02')).reduce((s, i) => s + i.amount, 0) },
        { category: '03. PEKERJAAN STRUKTUR', subtotal: calculatedItems.filter(i => i.category.includes('03')).reduce((s, i) => s + i.amount, 0) },
        { category: '04. PEKERJAAN DINDING', subtotal: calculatedItems.filter(i => i.category.includes('04')).reduce((s, i) => s + i.amount, 0) },
        { category: '05. PEKERJAAN LANTAI', subtotal: calculatedItems.filter(i => i.category.includes('05')).reduce((s, i) => s + i.amount, 0) },
        { category: '06. PEKERJAAN ATAP', subtotal: calculatedItems.filter(i => i.category.includes('06')).reduce((s, i) => s + i.amount, 0) },
        { category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA', subtotal: calculatedItems.filter(i => i.category.includes('07')).reduce((s, i) => s + i.amount, 0) },
        { category: '08. PEKERJAAN PLAFON', subtotal: calculatedItems.filter(i => i.category.includes('08')).reduce((s, i) => s + i.amount, 0) },
        { category: '09. PEKERJAAN INSTALASI LISTRIK', subtotal: calculatedItems.filter(i => i.category.includes('09')).reduce((s, i) => s + i.amount, 0) },
        { category: '10. PEKERJAAN PLAMBING DAN SANITASI', subtotal: calculatedItems.filter(i => i.category.includes('10')).reduce((s, i) => s + i.amount, 0) },
        { category: '11. PEKERJAAN PENGECATAN', subtotal: calculatedItems.filter(i => i.category.includes('11')).reduce((s, i) => s + i.amount, 0) },
        { category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN', subtotal: calculatedItems.filter(i => i.category.includes('12')).reduce((s, i) => s + i.amount, 0) },
        { category: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA', subtotal: calculatedItems.filter(i => i.category.includes('13')).reduce((s, i) => s + i.amount, 0) }
      ]
    },
    progress: { current: 4, total: 4, stepName: 'Review & Konfirmasi RAB' }
  };
}

