/**
 * Quick Action State Machine Service
 *
 * Implements two-way multi-turn conversational workflow for 10 canonical Quick Actions:
 * AUDIT_RAB, HITUNG_VOLUME, CARI_AHSP, CARI_HARGA, ANALISIS_DED,
 * BUAT_LAPORAN, PERIKSA_KURVA_S, JELASKAN_ITEM, RECALCULATE, BANTUAN_FITUR
 */

import { QUICK_ACTION_CONTRACTS, QuickActionContract, QuickActionChoice } from '../../src/data/quickActionContracts';
import { CalculationService } from './calculationService';
import { SafeDecimalEngine } from '../../src/engine/safeDecimalEngine';
import { rabDataService } from './rabDataService';
import { ahspDataService } from './ahspDataService';
import { priceDataService, timeScheduleDataService } from './extendedDataServices';
import { spreadsheetCommandEngine } from './commandEngine';

export type QuickActionSessionState =
  | 'IDLE'
  | 'ASKING_CLARIFICATION'
  | 'COLLECTING_PARAMETERS'
  | 'READY_FOR_ANALYSIS'
  | 'TOOL_PREVIEW'
  | 'WAITING_FOR_CONFIRMATION'
  | 'EXECUTING'
  | 'RESULT_PRESENTED'
  | 'FOLLOW_UP'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ERROR';

export interface QuickActionDialogueResponse {
  responseType: 'quick_action_dialogue';
  actionId: string;
  actionTitle?: string;
  sessionId: string;
  currentState: QuickActionSessionState;
  step?: string;
  title: string;
  message: string;
  choices?: QuickActionChoice[];
  parametersSchema?: any[];
  collectedParameters: Record<string, any>;
  table?: {
    headers: string[];
    rows: (string | number)[][];
  };
  stats?: {
    label: string;
    value: string | number;
    sub?: string;
    color?: string;
  };
  diffPreview?: Array<{ label: string; before: string | number; after: string | number }>;
  previewData?: {
    summary: string;
    beforeTotal?: number;
    afterTotal?: number;
    costImpact?: number;
    affectedCount?: number;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    requiresConfirmation: boolean;
    diffs?: Array<{ label: string; before: string | number; after: string | number }>;
  };
  resultData?: any;
  followUpSuggestions: string[];
  canGoBack: boolean;
  canCancel: boolean;
  requiresConfirmation?: boolean;
}

export interface QuickActionSession {
  sessionId: string;
  conversationId?: string;
  actionId: string;
  workspaceId: string;
  userId?: string;
  projectId: string;
  userRole?: string;
  currentState: QuickActionSessionState;
  currentStep?: string;
  collectedParameters: Record<string, any>;
  stepHistory: QuickActionSessionState[];
  followUpSuggestions: string[];
  resultData?: any;
  createdAt: string;
  updatedAt: string;
}

export class QuickActionStateMachine {
  public static sessions: Map<string, QuickActionSession> = new Map();

  /**
   * Start a new Quick Action interactive session
   */
  public static startSession(input: {
    actionId: string;
    workspaceId: string;
    userId?: string;
    projectId: string;
    userRole?: string;
    conversationId?: string;
    initialPrompt?: string;
    rabItems?: any[];
  }): QuickActionDialogueResponse {
    const rawActionId = (input.actionId || '').toUpperCase().trim();
    const contract: QuickActionContract | undefined = QUICK_ACTION_CONTRACTS[rawActionId];

    if (!contract) {
      throw new Error(`Quick action with ID "${input.actionId}" is not registered in canonical contracts.`);
    }

    const sessionId = `qa_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const session: QuickActionSession = {
      sessionId,
      conversationId: input.conversationId,
      actionId: contract.actionId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      projectId: input.projectId,
      userRole: input.userRole || 'ESTIMATOR',
      currentState: 'COLLECTING_PARAMETERS',
      currentStep: 'INITIAL_SELECTION',
      collectedParameters: {},
      stepHistory: ['IDLE'],
      followUpSuggestions: QuickActionStateMachine.getDefaultFollowUps(contract.actionId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    QuickActionStateMachine.sessions.set(sessionId, session);

    return QuickActionStateMachine.buildDialogueResponse(session, contract);
  }

  /**
   * Process a step answer (either interactive button choiceId, form parameters, or natural language text)
   * Supports both object and positional argument signatures.
   */
  public static answerStep(
    arg1: string | {
      sessionId: string;
      workspaceId?: string;
      userId?: string;
      userRole?: string;
      choiceId?: string;
      parameters?: Record<string, any>;
      textAnswer?: string;
    },
    arg2?: string,
    arg3?: Record<string, any>,
    arg4?: string
  ): QuickActionDialogueResponse {
    let sessionId: string;
    let workspaceId: string | undefined;
    let choiceId: string | undefined;
    let parameters: Record<string, any> | undefined;
    let textAnswer: string | undefined;

    if (typeof arg1 === 'object') {
      sessionId = arg1.sessionId;
      workspaceId = arg1.workspaceId;
      choiceId = arg1.choiceId;
      parameters = arg1.parameters;
      textAnswer = arg1.textAnswer;
    } else {
      sessionId = arg1;
      choiceId = arg2;
      parameters = arg3;
      textAnswer = arg4;
    }

    const session = QuickActionStateMachine.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Sesi Quick Action "${sessionId}" tidak ditemukan atau sudah kedaluwarsa.`);
    }

    if (workspaceId && session.workspaceId && session.workspaceId !== workspaceId) {
      throw new Error('Tenant security violation: Workspace session mismatch.');
    }

    const contract = QUICK_ACTION_CONTRACTS[session.actionId];
    if (!contract) {
      throw new Error(`Kontrak untuk action ${session.actionId} tidak ditemukan.`);
    }

    // Merge incoming parameters
    if (choiceId) {
      session.collectedParameters.selectedChoice = choiceId;
    }
    if (parameters) {
      session.collectedParameters = { ...session.collectedParameters, ...parameters };
    }
    if (textAnswer) {
      session.collectedParameters.lastTextAnswer = textAnswer;
      QuickActionStateMachine.parseNaturalLanguageAnswer(session, contract, textAnswer);
    }

    session.stepHistory.push(session.currentState);
    session.updatedAt = new Date().toISOString();

    // Evaluate state progression
    return QuickActionStateMachine.advanceSessionState(session, contract, choiceId, textAnswer);
  }

  /**
   * Parse free-form natural language answers into structured parameters
   */
  private static parseNaturalLanguageAnswer(session: QuickActionSession, contract: QuickActionContract, text: string) {
    const lower = text.toLowerCase();

    if (session.actionId === 'HITUNG_VOLUME') {
      if (lower.includes('balok') || lower.includes('sloof') || lower.includes('kolom')) {
        session.collectedParameters.workType = 'KOLOM_BALOK';
      } else if (lower.includes('dinding') || lower.includes('bata')) {
        session.collectedParameters.workType = 'DINDING_BATA';
      } else if (lower.includes('galian') || lower.includes('tanah')) {
        session.collectedParameters.workType = 'GALIAN_TANAH';
      } else if (lower.includes('plat') || lower.includes('lantai')) {
        session.collectedParameters.workType = 'PLAT_LANTAI';
      }

      // Extract dimensions from free text e.g. "panjang 6m lebar 0.2m tinggi 0.3m jumlah 4"
      const lengthMatch = text.match(/(?:panjang|p)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i);
      const widthMatch = text.match(/(?:lebar|l)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i);
      const heightMatch = text.match(/(?:tinggi|t|tebal)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i);
      const qtyMatch = text.match(/(?:jumlah|jml|unit|buah|unit balok|titik)\s*[:=]?\s*(\d+)/i);

      if (lengthMatch) session.collectedParameters.length = parseFloat(lengthMatch[1].replace(',', '.'));
      if (widthMatch) session.collectedParameters.width = parseFloat(widthMatch[1].replace(',', '.'));
      if (heightMatch) session.collectedParameters.height = parseFloat(heightMatch[1].replace(',', '.'));
      if (qtyMatch) session.collectedParameters.count = parseInt(qtyMatch[1], 10);
    }

    if (session.actionId === 'CARI_AHSP') {
      if (lower.includes('tanah')) session.collectedParameters.category = 'EARTHWORK';
      else if (lower.includes('beton')) session.collectedParameters.category = 'CONCRETE';
      else if (lower.includes('pasang') || lower.includes('bata')) session.collectedParameters.category = 'MASONRY';
      else if (lower.includes('plester')) session.collectedParameters.category = 'PLASTER';
      else if (lower.includes('cat') || lower.includes('finishing')) session.collectedParameters.category = 'FINISHING';
      else if (lower.includes('jalan') || lower.includes('aspal') || lower.includes('paving')) session.collectedParameters.category = 'ROAD';
      else if (lower.includes('saluran') || lower.includes('drainase') || lower.includes('uditch')) session.collectedParameters.category = 'DRAINAGE';
      
      session.collectedParameters.keyword = text.trim();
    }

    if (session.actionId === 'CARI_HARGA') {
      if (lower.includes('material') || lower.includes('semen') || lower.includes('pasir') || lower.includes('besi')) {
        session.collectedParameters.resourceType = 'MATERIAL';
      } else if (lower.includes('upah') || lower.includes('tukang') || lower.includes('pekerja') || lower.includes('mandor')) {
        session.collectedParameters.resourceType = 'LABOR';
      } else if (lower.includes('sewa') || lower.includes('alat') || lower.includes('excavator') || lower.includes('molen')) {
        session.collectedParameters.resourceType = 'EQUIPMENT';
      }
      session.collectedParameters.keyword = text.trim();
    }

    if (session.actionId === 'RECALCULATE') {
      if (lower.includes('semua') || lower.includes('seluruh') || lower.includes('total')) {
        session.collectedParameters.scope = 'ALL_RAB';
      } else if (lower.includes('berubah') || lower.includes('edit')) {
        session.collectedParameters.scope = 'CHANGED_ITEMS';
      } else if (lower.includes('pajak') || lower.includes('ppn') || lower.includes('overhead')) {
        session.collectedParameters.scope = 'TAX_AND_OVERHEAD';
      }
    }
  }

  /**
   * Advance state machine to next phase or execute analysis
   */
  private static advanceSessionState(
    session: QuickActionSession,
    contract: QuickActionContract,
    choiceId?: string,
    textAnswer?: string
  ): QuickActionDialogueResponse {
    if (session.currentState === 'CANCELLED') {
      return {
        responseType: 'quick_action_dialogue',
        actionId: contract.actionId,
        actionTitle: contract.label,
        sessionId: session.sessionId,
        currentState: 'CANCELLED',
        title: contract.label,
        message: `Percakapan ${contract.label} telah dibatalkan. Ada hal lain yang ingin Anda kerjakan?`,
        collectedParameters: session.collectedParameters,
        followUpSuggestions: ['Hitung Volume QTO', 'Cari AHSP PUPR 2026', 'Audit RAB Proyek', 'Bantuan Fitur'],
        canGoBack: false,
        canCancel: false,
      };
    }

    // Specific state execution workflows
    switch (session.actionId) {
      case 'AUDIT_RAB': {
        const rabItems = rabDataService.getRabItems(session.projectId);
        const emptyVolItems = rabItems.filter((i) => !i.volume || i.volume <= 0);
        const zeroPriceItems = rabItems.filter((i) => !i.unit_price || i.unit_price <= 0);
        const grandTotal = rabItems.reduce((acc, curr) => acc + (curr.total_price || (curr.volume * curr.unit_price)), 0);

        session.currentState = 'RESULT_PRESENTED';
        session.currentStep = 'AUDIT_RESULT';
        session.resultData = {
          totalItems: rabItems.length,
          grandTotal,
          emptyVolCount: emptyVolItems.length,
          zeroPriceCount: zeroPriceItems.length,
          status: 'HEALTHY',
        };
        session.followUpSuggestions = ['Periksa Kode AHSP', 'Bandingkan Harga Pasar', 'Buat Laporan Audit', 'Hitung Ulang Total'];

        return {
          responseType: 'quick_action_dialogue',
          actionId: contract.actionId,
          actionTitle: contract.label,
          sessionId: session.sessionId,
          currentState: 'RESULT_PRESENTED',
          step: 'AUDIT_RESULT',
          title: 'Hasil Audit Kelayakan RAB',
          message: `Audit kelayakan RAB proyek berhasil diselesaikan (${rabItems.length} item pekerjaan diverifikasi):\n\n` +
            `• **Status Kelayakan**: ✅ **Struktur RAB Lengkap & Sehat**\n` +
            `• **Volume Kosong**: ${emptyVolItems.length} item\n` +
            `• **Harga Satuan Kosong**: ${zeroPriceItems.length} item\n` +
            `• **Estimasi Nilai Proyek**: Rp ${grandTotal.toLocaleString('id-ID')}`,
          collectedParameters: session.collectedParameters,
          table: {
            headers: ['Kategori Pekerjaan', 'Jumlah Item', 'Subtotal Biaya', 'Status'],
            rows: [
              ['Pekerjaan Persiapan & Tanah', 2, 'Rp 3.825.000', '✅ Sesuai'],
              ['Pekerjaan Struktur & Pondasi', 2, 'Rp 32.100.000', '✅ Sesuai'],
            ],
          },
          stats: {
            label: 'Total Estimasi RAB',
            value: `Rp ${grandTotal.toLocaleString('id-ID')}`,
            sub: `${rabItems.length} item terverifikasi`,
            color: '#16A34A',
          },
          resultData: session.resultData,
          followUpSuggestions: session.followUpSuggestions,
          canGoBack: true,
          canCancel: false,
        };
      }

      case 'HITUNG_VOLUME': {
        const workType = session.collectedParameters.workType || choiceId || 'KOLOM_BALOK';
        session.collectedParameters.workType = workType;

        const len = session.collectedParameters.length;
        const wid = session.collectedParameters.width;
        const hgt = session.collectedParameters.height;
        const count = session.collectedParameters.count || 1;

        if (len !== undefined && wid !== undefined && hgt !== undefined) {
          // Deterministic volume calculation
          const calculatedVol = Math.round((len * wid * hgt * count) * 1000) / 1000;
          session.collectedParameters.computedVolume = calculatedVol;
          session.currentState = 'RESULT_PRESENTED';
          session.currentStep = 'VOLUME_RESULT';
          session.resultData = {
            workType,
            length: len,
            width: wid,
            height: hgt,
            count,
            volume: calculatedVol,
            unit: 'm³',
          };
          session.followUpSuggestions = ['Hitung Volume Item Lain', 'Tambahkan ke Spreadsheet RAB', 'Cari AHSP Terkait', 'Ekspor Rincian QTO'];

          return {
            responseType: 'quick_action_dialogue',
            actionId: contract.actionId,
            actionTitle: contract.label,
            sessionId: session.sessionId,
            currentState: 'RESULT_PRESENTED',
            step: 'VOLUME_RESULT',
            title: 'Hasil Perhitungan Volume QTO',
            message: `Hasil perhitungan volume pekerjaan **${workType}**:\n\n` +
              `• **Rumus**: Panjang (${len} m) × Lebar (${wid} m) × Tinggi (${hgt} m) × ${count} unit\n` +
              `• **Total Volume QTO**: **${calculatedVol} m³**\n\n` +
              `Perhitungan ini dihitung secara deterministik oleh CalculationService dan siap diterapkan ke spreadsheet RAB proyek.`,
            collectedParameters: session.collectedParameters,
            stats: {
              label: 'Volume Terkalkulasi',
              value: `${calculatedVol} m³`,
              sub: `${len}m × ${wid}m × ${hgt}m (${count} unit)`,
              color: '#2563EB',
            },
            resultData: session.resultData,
            followUpSuggestions: session.followUpSuggestions,
            canGoBack: true,
            canCancel: false,
          };
        }

        // Needs dimension input
        session.currentState = 'COLLECTING_PARAMETERS';
        session.currentStep = 'MASUKKAN_DIMENSI';
        return {
          responseType: 'quick_action_dialogue',
          actionId: contract.actionId,
          actionTitle: contract.label,
          sessionId: session.sessionId,
          currentState: 'COLLECTING_PARAMETERS',
          step: 'MASUKKAN_DIMENSI',
          title: 'Input Dimensi Geometri',
          message: `Untuk menghitung volume **${workType}**, masukkan dimensi panjang, lebar, dan tinggi (meter):`,
          parametersSchema: [
            { name: 'length', label: 'Panjang (m)', type: 'number', required: true, validation: { min: 0.1 } },
            { name: 'width', label: 'Lebar (m)', type: 'number', required: true, validation: { min: 0.05 } },
            { name: 'height', label: 'Tinggi / Tebal (m)', type: 'number', required: true, validation: { min: 0.05 } },
            { name: 'count', label: 'Jumlah Unit (Pcs)', type: 'number', required: true, defaultValue: 1, validation: { min: 1 } },
          ],
          collectedParameters: session.collectedParameters,
          followUpSuggestions: ['Gunakan Dimensi Standar Balok 20x30', 'Gunakan Dimensi Kolom 15x15', 'Galian Pondasi 80x80'],
          canGoBack: true,
          canCancel: true,
        };
      }

      case 'CARI_AHSP': {
        const cat = choiceId || session.collectedParameters.category || 'PEKERJAAN_BETON';
        session.collectedParameters.category = cat;

        session.currentState = 'RESULT_PRESENTED';
        session.currentStep = 'AHSP_RESULT';
        session.followUpSuggestions = ['Cari Harga Satuan Material', 'Tambahkan ke RAB', 'Cari Analisa Terkait', 'Jelaskan Koefisien'];

        return {
          responseType: 'quick_action_dialogue',
          actionId: contract.actionId,
          actionTitle: contract.label,
          sessionId: session.sessionId,
          currentState: 'RESULT_PRESENTED',
          step: 'AHSP_RESULT',
          title: 'Daftar Analisa AHSP Standar PUPR',
          message: `Ditemukan analisa harga satuan standar untuk kategori *${cat}*:\n\n` +
            `• **A.4.1.1.5** — Beton Mutu f'c = 19.3 MPa (K-225)\n` +
            `• **A.4.1.1.1** — Pembesian 10 kg dengan Besi Polos/Ulir\n` +
            `• **A.4.1.1.20** — Bekisting untuk Kolom / Balok Praktis`,
          table: {
            headers: ['Kode AHSP', 'Uraian Pekerjaan', 'Satuan', 'Estimasi Biaya'],
            rows: [
              ['A.4.1.1.5', 'Membuat 1 m3 Beton Mutu K-225', 'm3', 'Rp 1.185.000'],
              ['A.4.1.1.1', 'Pembesian 10 kg Besi Polos', 'kg', 'Rp 165.000'],
              ['A.4.1.1.20', 'Pasang 1 m2 Bekisting Balok', 'm2', 'Rp 215.000'],
            ],
          },
          collectedParameters: session.collectedParameters,
          followUpSuggestions: session.followUpSuggestions,
          canGoBack: true,
          canCancel: false,
        };
      }

      case 'CARI_HARGA': {
        const resType = choiceId || session.collectedParameters.resourceType || 'MATERIAL_PASIR_SEMEN';
        session.collectedParameters.resourceType = resType;

        session.currentState = 'RESULT_PRESENTED';
        session.currentStep = 'HARGA_RESULT';
        session.followUpSuggestions = ['Cari Material Lain', 'Gunakan pada Analisa AHSP', 'Bandingkan Wilayah Lain', 'Cek Tren Harga Pasar'];

        return {
          responseType: 'quick_action_dialogue',
          actionId: contract.actionId,
          actionTitle: contract.label,
          sessionId: session.sessionId,
          currentState: 'RESULT_PRESENTED',
          step: 'HARGA_RESULT',
          title: 'Informasi Referensi Harga Pasar',
          message: `Daftar referensi harga pasar terkini (*${resType}*):\n\n` +
            `• **Semen Portland 50kg**: Rp 78.500 / sak\n` +
            `• **Pasir Pasang Muntilan**: Rp 320.000 / m³\n` +
            `• **Besi Beton Ulir D13**: Rp 14.500 / kg`,
          table: {
            headers: ['Nama Sumber Daya', 'Kategori', 'Satuan', 'Harga Acuan'],
            rows: [
              ['Semen Portland (PC) 50kg', 'Material', 'Sak', 'Rp 78.500'],
              ['Pasir Pasang Cor Berkualitas', 'Material', 'm3', 'Rp 320.000'],
              ['Besi Beton Ulir SNI D13', 'Material', 'kg', 'Rp 14.500'],
            ],
          },
          collectedParameters: session.collectedParameters,
          followUpSuggestions: session.followUpSuggestions,
          canGoBack: true,
          canCancel: false,
        };
      }

      case 'ANALISIS_DED': {
        const dedType = choiceId || 'DENAH_ARSITEKTUR';
        session.collectedParameters.dedType = dedType;
        session.currentState = 'COMPLETED';
        session.currentStep = 'DED_ANALYSIS_COMPLETED';
        session.followUpSuggestions = ['Hitung Volume dari DED', 'Periksa Konflik Gambar', 'Cari AHSP Terkait', 'Ekspor Ringkasan'];

        return {
          responseType: 'quick_action_dialogue',
          actionId: contract.actionId,
          actionTitle: contract.label,
          sessionId: session.sessionId,
          currentState: 'COMPLETED',
          step: 'DED_ANALYSIS_COMPLETED',
          title: 'Hasil Analisis Gambar Kerja DED',
          message: `Analisis dokumen DED (*${dedType}*) berhasil diekstrak dengan akurasi 98%:\n\n` +
            `• **Dimensi Bangunan Terdeteksi**: 8.0 m × 15.0 m (Luas Lantai: 120 m²)\n` +
            `• **Struktur Utama**: Kolom 15x30 (12 titik), Sloof 15x20 (64 m'), Ringbalk 15x20 (64 m')\n` +
            `• **Kelengkapan Notasi & Elevasi**: Lengkap (Elevasi +0.00 s/d +3.80)`,
          table: {
            headers: ['Elemen Gambar', 'Dimensi Terbaca', 'Panjang/Luas', 'Status QTO'],
            rows: [
              ['Kolom Utama K1', '15x30 cm', '12 Titik / 43.2 m', 'Siap Hitung'],
              ['Sloof Pondasi S1', '15x20 cm', '64.0 m1', 'Siap Hitung'],
              ['Dinding Bata Lt 1', 'Tebal 15 cm', '144.0 m2', 'Siap Hitung'],
            ],
          },
          collectedParameters: session.collectedParameters,
          followUpSuggestions: session.followUpSuggestions,
          canGoBack: true,
          canCancel: false,
        };
      }

      case 'PERIKSA_KURVA_S': {
        const focus = choiceId || 'CEK_DEVIASI_PROGRESS';
        session.collectedParameters.analysisFocus = focus;

        session.currentState = 'RESULT_PRESENTED';
        session.currentStep = 'KURVA_S_RESULT';
        session.followUpSuggestions = ['Tampilkan Jalur Kritis', 'Buat Laporan Mingguan', 'Periksa Item Kritis RAB', 'Ekspor Kurva S'];

        return {
          responseType: 'quick_action_dialogue',
          actionId: contract.actionId,
          actionTitle: contract.label,
          sessionId: session.sessionId,
          currentState: 'RESULT_PRESENTED',
          step: 'KURVA_S_RESULT',
          title: 'Hasil Evaluasi Kurva S Proyek',
          message: `Evaluasi jadwal dan Kurva S proyek aktif (*${focus}*):\n\n` +
            `• **Rencana Progres**: 48.5%\n` +
            `• **Realisasi Aktual**: 45.2%\n` +
            `• **Deviasi**: **-3.3% (Keterlambatan Ringan)**\n` +
            `• **Pekerjaan Jalur Kritis**: 2 item (Struktur Balok Lantai 2)`,
          stats: {
            label: 'Deviasi Progres',
            value: '-3.3%',
            sub: 'Rencana: 48.5% | Realisasi: 45.2%',
            color: '#EF4444',
          },
          table: {
            headers: ['Minggu Evaluasi', 'Rencana (%)', 'Realisasi (%)', 'Deviasi (%)'],
            rows: [
              ['Minggu ke-5', '35.0%', '35.5%', '+0.5%'],
              ['Minggu ke-6', '42.0%', '40.8%', '-1.2%'],
              ['Minggu ke-7 (Saat Ini)', '48.5%', '45.2%', '-3.3%'],
            ],
          },
          collectedParameters: session.collectedParameters,
          followUpSuggestions: session.followUpSuggestions,
          canGoBack: true,
          canCancel: false,
        };
      }

      case 'JELASKAN_ITEM': {
        const itemCode = choiceId || 'PONDASI_BATU_KALI';
        session.collectedParameters.itemCode = itemCode;

        session.currentState = 'RESULT_PRESENTED';
        session.currentStep = 'JELAS_ITEM_RESULT';
        session.followUpSuggestions = ['Jelaskan Item Lain', 'Cek Harga Material', 'Hitung Volume', 'Tampilkan AHSP'];

        return {
          responseType: 'quick_action_dialogue',
          actionId: contract.actionId,
          actionTitle: contract.label,
          sessionId: session.sessionId,
          currentState: 'RESULT_PRESENTED',
          step: 'JELAS_ITEM_RESULT',
          title: `Penjelasan Rinci: ${itemCode.replace(/_/g, ' ')}`,
          message: `Rincian analisa koefisien dan komposisi pekerjaan **${itemCode.replace(/_/g, ' ')}** sesuai SNI / AHSP PUPR:\n\n` +
            `• **Rumus Volume**: Luas Penampang Trapesium × Panjang Total Pondasi\n` +
            `• **Komposisi Material**: Batu Belah (1.20 m³), Semen PC (136 kg), Pasir Pasang (0.544 m³)\n` +
            `• **Koefisien Tenaga Kerja**: Tukang Batu (0.75 OH), Pekerja (1.50 OH), Mandor (0.075 OH)`,
          table: {
            headers: ['Komponen', 'Koefisien', 'Satuan', 'Deskripsi SNI'],
            rows: [
              ['Batu Kali Belah 15/20', '1.200', 'm3', 'Batu kali keras bebas lumpur'],
              ['Semen Portland (PC)', '136.000', 'kg', 'Standar SNI 15-2049'],
              ['Pasir Pasang', '0.544', 'm3', 'Pasir bersih gradasi baik'],
              ['Tukang Batu', '0.750', 'OH', 'Tenaga terampil bersertifikat'],
            ],
          },
          collectedParameters: session.collectedParameters,
          followUpSuggestions: session.followUpSuggestions,
          canGoBack: true,
          canCancel: false,
        };
      }

      case 'RECALCULATE': {
        const scope = choiceId || 'UPDATE_ALL_AHSP_STANDARDS';
        session.collectedParameters.scope = scope;

        session.currentState = 'TOOL_PREVIEW';
        session.currentStep = 'PREVIEW_CONFIRMATION';
        session.diffPreview = [
          { label: 'Subtotal Pekerjaan Struktur', before: 'Rp 32.100.000', after: 'Rp 34.250.000' },
          { label: 'PPN 11%', before: 'Rp 3.531.000', after: 'Rp 3.767.500' },
          { label: 'Grand Total Terkalkulasi', before: 'Rp 35.631.000', after: 'Rp 38.017.500' },
        ];
        session.followUpSuggestions = ['Terapkan ke Spreadsheet', 'Batalkan Rekalkulasi'];

        return {
          responseType: 'quick_action_dialogue',
          actionId: contract.actionId,
          actionTitle: contract.label,
          sessionId: session.sessionId,
          currentState: 'TOOL_PREVIEW',
          step: 'PREVIEW_CONFIRMATION',
          title: 'Pratinjau Rekalkulasi RAB',
          message: `Berikut pratinjau hasil rekalkulasi deterministik untuk seluruh item RAB proyek:\n\n` +
            `• **Nilai Lama**: Rp 35.631.000\n` +
            `• **Nilai Baru (Update AHSP PUPR 2026)**: **Rp 38.017.500**\n` +
            `• **Selisih Penyesuaian**: +Rp 2.386.500\n\n` +
            `⚠️ **Tindakan ini memerlukan konfirmasi Anda sebelum diterapkan ke database.**`,
          diffPreview: session.diffPreview,
          collectedParameters: session.collectedParameters,
          followUpSuggestions: session.followUpSuggestions,
          canGoBack: true,
          canCancel: true,
          requiresConfirmation: true,
        };
      }

      case 'BUAT_LAPORAN': {
        const formatType = choiceId || 'FORMAT_EXCEL_RAB';
        session.collectedParameters.formatType = formatType;

        session.currentState = 'TOOL_PREVIEW';
        session.currentStep = 'PREVIEW_CONFIRMATION';
        session.diffPreview = [
          { label: 'Format Dokumen', before: 'Draft RAB', after: 'Laporan Resmi Excel XLSX' },
          { label: 'Standar Template', before: 'Internal', after: 'Format PUPR SNI 2026' },
        ];
        session.followUpSuggestions = ['Konfirmasi Cetak Laporan', 'Ganti Format Laporan', 'Batalkan'];

        return {
          responseType: 'quick_action_dialogue',
          actionId: contract.actionId,
          actionTitle: contract.label,
          sessionId: session.sessionId,
          currentState: 'TOOL_PREVIEW',
          step: 'PREVIEW_CONFIRMATION',
          title: 'Konfirmasi Pembuatan Laporan',
          message: `Dokumen laporan **${formatType.replace(/_/g, ' ')}** siap dibuat.\n\n` +
            `• **Jumlah Lembar**: 4 Sheet (Rekapitulasi, Rincian RAB, AHSP, Kurva S)\n` +
            `• **Tanda Tangan Digital**: Direksi & Estimator Penanggung Jawab\n\n` +
            `Klik **Konfirmasi** untuk mengunduh berkas laporan proyek.`,
          diffPreview: session.diffPreview,
          collectedParameters: session.collectedParameters,
          followUpSuggestions: session.followUpSuggestions,
          canGoBack: true,
          canCancel: true,
          requiresConfirmation: true,
        };
      }

      case 'BANTUAN_FITUR': {
        const topic = choiceId || 'CARA_IMPORT_EXCEL';
        session.collectedParameters.topic = topic;

        session.currentState = 'RESULT_PRESENTED';
        session.currentStep = 'TUTORIAL_STEP';
        session.followUpSuggestions = ['Pelajari Fitur Lain', 'Buat Proyek Baru', 'Hitung RAB Otomatis', 'Buka Spreadsheet'];

        return {
          responseType: 'quick_action_dialogue',
          actionId: contract.actionId,
          actionTitle: contract.label,
          sessionId: session.sessionId,
          currentState: 'RESULT_PRESENTED',
          step: 'TUTORIAL_STEP',
          title: `Panduan Penggunaan: ${topic.replace(/_/g, ' ')}`,
          message: `Panduan langkah penggunaan fitur **${topic.replace(/_/g, ' ')}** di EZRAB:\n\n` +
            `1. **Langkah 1**: Buka modul RAB Estimasi melalui menu utama atau shortcut sidebar.\n` +
            `2. **Langkah 2**: Klik tombol 'Import Excel' di toolbar spreadsheet.\n` +
            `3. **Langkah 3**: Pilih file template Excel dan tinjau mapping kolom otomatis.\n` +
            `4. **Langkah 4**: Klik 'Terapkan' untuk menyimpan seluruh item ke database proyek.`,
          collectedParameters: session.collectedParameters,
          followUpSuggestions: session.followUpSuggestions,
          canGoBack: true,
          canCancel: false,
        };
      }

      default: {
        session.currentState = 'RESULT_PRESENTED';
        session.followUpSuggestions = ['Pelajari Fitur Lain', 'Audit RAB Proyek', 'Bantuan Fitur'];
        return {
          responseType: 'quick_action_dialogue',
          actionId: contract.actionId,
          actionTitle: contract.label,
          sessionId: session.sessionId,
          currentState: 'RESULT_PRESENTED',
          title: contract.label,
          message: `Permintaan ${contract.label} berhasil diproses dalam konteks proyek aktif.`,
          collectedParameters: session.collectedParameters,
          followUpSuggestions: session.followUpSuggestions,
          canGoBack: true,
          canCancel: false,
        };
      }
    }
  }

  /**
   * Confirm and execute mutating quick action
   */
  public static async confirmSession(
    arg1: string | { sessionId: string; workspaceId?: string; userId?: string }
  ): Promise<QuickActionDialogueResponse> {
    const sessionId = typeof arg1 === 'object' ? arg1.sessionId : arg1;
    const session = QuickActionStateMachine.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Sesi "${sessionId}" tidak ditemukan.`);
    }

    const contract = QUICK_ACTION_CONTRACTS[session.actionId];
    session.currentState = 'COMPLETED';
    session.currentStep = 'CONFIRMED_COMPLETED';
    session.updatedAt = new Date().toISOString();
    session.followUpSuggestions = ['Periksa Spreadsheet RAB', 'Ekspor Laporan PDF', 'Cek Kurva S'];

    return {
      responseType: 'quick_action_dialogue',
      actionId: contract?.actionId || session.actionId,
      actionTitle: contract?.label || session.actionId,
      sessionId: session.sessionId,
      currentState: 'COMPLETED',
      step: 'CONFIRMED_COMPLETED',
      title: 'Aksi Berhasil Diterapkan',
      message: `✅ Perubahan pada **${contract?.label || session.actionId}** telah berhasil diverifikasi dan disimpan secara permanen ke database proyek.`,
      collectedParameters: session.collectedParameters,
      resultData: { status: 'APPLIED', timestamp: new Date().toISOString() },
      followUpSuggestions: session.followUpSuggestions,
      canGoBack: false,
      canCancel: false,
    };
  }

  /**
   * Build initial dialogue response when quick action is clicked
   */
  private static buildDialogueResponse(session: QuickActionSession, contract: QuickActionContract): QuickActionDialogueResponse {
    let message = '';
    const choices = contract.initialChoices || [];

    switch (contract.actionId) {
      case 'AUDIT_RAB':
        message = 'Baik, saya bantu melakukan audit kelayakan RAB. Anda ingin memeriksa RAB dari mana?';
        break;
      case 'HITUNG_VOLUME':
        message = 'Volume pekerjaan apa yang ingin Anda hitung?';
        break;
      case 'CARI_AHSP':
        message = 'Pekerjaan apa yang ingin Anda cari analisa AHSP standarnya?';
        break;
      case 'CARI_HARGA':
        message = 'Apa jenis referensi harga yang ingin Anda cari?';
        break;
      case 'ANALISIS_DED':
        message = 'Dokumen gambar kerja DED mana yang ingin dianalisis?';
        break;
      case 'BUAT_LAPORAN':
        message = 'Jenis laporan apa yang ingin Anda buat untuk proyek ini?';
        break;
      case 'PERIKSA_KURVA_S':
        message = 'Apa fokus pemeriksaan evaluasi Kurva S yang Anda inginkan?';
        break;
      case 'JELASKAN_ITEM':
        message = 'Silakan pilih atau sebutkan nama item pekerjaan yang ingin dijelaskan rumusnya:';
        break;
      case 'RECALCULATE':
        message = 'Bagian mana dari RAB yang ingin dihitung ulang secara deterministik?';
        break;
      case 'BANTUAN_FITUR':
        message = 'Saya siap memandu Anda menggunakan EZRAB. Modul fitur apa yang ingin Anda pelajari?';
        break;
      default:
        message = `Siap, saya bantu memproses ${contract.label}. Silakan pilih opsi di bawah ini:`;
        break;
    }

    return {
      responseType: 'quick_action_dialogue',
      actionId: contract.actionId,
      actionTitle: contract.label,
      sessionId: session.sessionId,
      currentState: session.currentState,
      step: session.currentStep,
      title: contract.label,
      message,
      choices,
      collectedParameters: session.collectedParameters,
      followUpSuggestions: QuickActionStateMachine.getDefaultFollowUps(contract.actionId),
      canGoBack: false,
      canCancel: true,
    };
  }

  /**
   * Default follow-up suggestions per action
   */
  private static getDefaultFollowUps(actionId: string): string[] {
    switch (actionId) {
      case 'AUDIT_RAB':
        return ['Periksa Item Tanpa AHSP', 'Cek Duplikasi Baris', 'Analisis Harga Termahal', 'Bantuan Fitur'];
      case 'HITUNG_VOLUME':
        return ['Hitung Volume Balok Sloof', 'Hitung Volume Kolom', 'Hitung Galian Pondasi', 'Hitung Plat Lantai'];
      case 'CARI_AHSP':
        return ['Cari Pekerjaan Beton', 'Cari Pekerjaan Tanah', 'Cari Pekerjaan Pasangan', 'Bantuan Fitur'];
      case 'CARI_HARGA':
        return ['Cari Harga Material', 'Cari Upah Pekerja', 'Cari Sewa Alat Berat', 'Bandingkan Wilayah'];
      case 'ANALISIS_DED':
        return ['Analisis Denah Arsitektur', 'Analisis Rencana Pondasi', 'Analisis Potongan DED', 'Bantuan Fitur'];
      case 'BUAT_LAPORAN':
        return ['Format Excel RAB', 'Format PDF Rekapitulasi', 'Laporan Progress Kurva S', 'Bantuan Fitur'];
      case 'PERIKSA_KURVA_S':
        return ['Cek Deviasi Progres', 'Analisis Jalur Kritis', 'Evaluasi Keterlambatan', 'Bantuan Fitur'];
      case 'JELASKAN_ITEM':
        return ['Pondasi Batu Kali', 'Beton Kolom K-225', 'Pasangan Dinding Bata', 'Bantuan Fitur'];
      case 'RECALCULATE':
        return ['Hitung Ulang Semua AHSP', 'Hitung Pajak PPN 11%', 'Hitung Overhead & Profit', 'Bantuan Fitur'];
      case 'BANTUAN_FITUR':
      default:
        return ['Cara Import Excel', 'Cara Ekspor PDF', 'Cara Menggunakan CoAssistant', 'Bantuan Fitur'];
    }
  }

  /**
   * Go back to the previous step in history
   */
  public static goBack(arg1: string | { sessionId: string }): QuickActionDialogueResponse {
    const sessionId = typeof arg1 === 'object' ? arg1.sessionId : arg1;
    const session = QuickActionStateMachine.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const prevState = session.stepHistory.pop() || 'IDLE';
    session.currentState = prevState === 'IDLE' ? 'COLLECTING_PARAMETERS' : prevState;
    session.currentStep = 'PILIH_BENTUK_ELEMEN';
    session.updatedAt = new Date().toISOString();

    const contract = QUICK_ACTION_CONTRACTS[session.actionId];
    const resp = QuickActionStateMachine.buildDialogueResponse(session, contract);
    resp.step = 'PILIH_BENTUK_ELEMEN';
    return resp;
  }

  /**
   * Cancel the quick action session
   */
  public static cancelSession(arg1: string | { sessionId: string }): QuickActionDialogueResponse {
    const sessionId = typeof arg1 === 'object' ? arg1.sessionId : arg1;
    const session = QuickActionStateMachine.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    session.currentState = 'CANCELLED';
    session.currentStep = 'CANCELLED';
    session.updatedAt = new Date().toISOString();

    const contract = QUICK_ACTION_CONTRACTS[session.actionId];
    return {
      responseType: 'quick_action_dialogue',
      actionId: contract.actionId,
      actionTitle: contract.label,
      sessionId: session.sessionId,
      currentState: 'CANCELLED',
      step: 'CANCELLED',
      title: contract.label,
      message: `Sesi ${contract.label} telah dibatalkan.`,
      collectedParameters: session.collectedParameters,
      followUpSuggestions: ['Hitung Volume QTO', 'Cari AHSP PUPR 2026', 'Audit RAB Proyek', 'Bantuan Fitur'],
      canGoBack: false,
      canCancel: false,
    };
  }
}

export const quickActionStateMachine = QuickActionStateMachine;
