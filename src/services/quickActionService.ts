import { QUICK_ACTION_CONTRACTS, QuickActionContract } from '../data/quickActionContracts';
import { QuickActionDialogueData } from '../components/copilot/QuickActionDialogueRenderer';

/**
 * P9.1 (audit perintah AI 2026-11-17) — KEJUJURAN FALLBACK:
 * Endpoint /api/ai/quick-action/* TIDAK ADA di deployment Vercel
 * (hanya ada di server Express server/api/aiRoutes.ts, yang tidak
 * berjalan di Preview/Produksi), dan tidak ada kode klien yang pernah
 * memanggil startSession — semua sesi adalah qa_local_* yang tidak
 * dikenal server. Karena itu fetch di bawah SELALU gagal dalam
 * praktik, dan fallback di sini adalah JALUR UTAMA, bukan cadangan.
 * Fallback lama mengklaim sukses palsu ("Permintaan Anda telah
 * diproses." / "Perubahan berhasil diterapkan ke database proyek.")
 * tanpa mutasi apa pun. Mulai sini fallback MENGAKU GAGAL dengan
 * state ERROR dan TIDAK PERNAH mengklaim sukses tanpa mutasi nyata.
 */
export class QuickActionService {
  private baseUrl = '/api/ai';

  /**
   * Start a quick action dialogue session via backend or client fallback
   */
  public async startSession(
    actionId: string,
    projectId?: string,
    conversationId?: string,
    initialPrompt?: string
  ): Promise<QuickActionDialogueData> {
    try {
      const res = await fetch(`${this.baseUrl}/quick-action/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, projectId, conversationId, initialPrompt })
      });

      if (res.ok) {
        const json = await res.json();
        return json.quickActionResponse;
      }
    } catch (err) {
      console.warn('[QuickActionService] API gateway unavailable, running local fallback state:', err);
    }

    // Fallback response
    const contract = QUICK_ACTION_CONTRACTS[actionId] || QUICK_ACTION_CONTRACTS['AUDIT_RAB'];
    return {
      responseType: 'quick_action_dialogue',
      actionId: contract.actionId,
      sessionId: `qa_local_${Date.now()}`,
      currentState: 'ASKING_CLARIFICATION',
      title: contract.label,
      message: `Siap, saya bantu memproses ${contract.label}. Silakan pilih opsi di bawah ini:`,
      choices: contract.initialChoices || [],
      collectedParameters: {},
      followUpSuggestions: [],
      canGoBack: false,
      canCancel: true
    };
  }

  /**
   * Answer a quick action dialogue step
   */
  public async answerStep(
    sessionId: string,
    choiceId?: string,
    parameters?: Record<string, any>,
    textAnswer?: string
  ): Promise<QuickActionDialogueData> {
    try {
      const res = await fetch(`${this.baseUrl}/quick-action/${encodeURIComponent(sessionId)}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choiceId, parameters, textAnswer })
      });

      if (res.ok) {
        const json = await res.json();
        return json.quickActionResponse;
      }
    } catch (err) {
      console.warn('[QuickActionService] API error on answerStep:', err);
    }

    // P9.1 — server tidak terjangkau / menolak: AKUI GAGAL. Jangan
    // pernah mengembalikan pesan sukses di sini: tidak ada langkah
    // yang diproses dan tidak ada mutasi yang terjadi.
    return {
      responseType: 'quick_action_dialogue',
      actionId: 'GENERAL',
      sessionId,
      currentState: 'ERROR',
      title: 'Layanan Tidak Tersedia',
      message: 'Layanan quick action tidak dapat dihubungi, jadi permintaan ini tidak diproses. Tidak ada perubahan yang terjadi — silakan coba lagi nanti atau gunakan menu terkait secara langsung.',
      collectedParameters: { ...parameters, choiceId },
      followUpSuggestions: ['Hitung Volume QTO', 'Audit RAB Proyek', 'Cari AHSP 2026'],
      canGoBack: false,
      canCancel: false
    };
  }

  /**
   * Confirm and execute mutating quick action
   */
  public async confirmSession(sessionId: string): Promise<QuickActionDialogueData> {
    try {
      const res = await fetch(`${this.baseUrl}/quick-action/${encodeURIComponent(sessionId)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (res.ok) {
        const json = await res.json();
        return json.quickActionResponse;
      }
    } catch (err) {
      console.warn('[QuickActionService] API error on confirmSession:', err);
    }

    // P9.1 — server tidak terjangkau / menolak: AKUI GAGAL. Konfirmasi
    // ini TIDAK menerapkan apa pun; klaim lama ("Perubahan berhasil
    // diterapkan ke database proyek.") adalah sukses palsu.
    return {
      responseType: 'quick_action_dialogue',
      actionId: 'GENERAL',
      sessionId,
      currentState: 'ERROR',
      title: 'Tidak Diterapkan',
      message: 'Konfirmasi tidak dapat diproses karena layanan quick action tidak dapat dihubungi. Tidak ada perubahan yang diterapkan ke proyek — data RAB Anda tidak berubah.',
      collectedParameters: {},
      followUpSuggestions: ['Periksa Spreadsheet RAB', 'Ekspor Laporan PDF'],
      canGoBack: false,
      canCancel: false
    };
  }

  /**
   * Go back to previous step
   */
  public async goBack(sessionId: string): Promise<QuickActionDialogueData> {
    const res = await fetch(`${this.baseUrl}/quick-action/${encodeURIComponent(sessionId)}/back`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await res.json();
    return json.quickActionResponse;
  }

  /**
   * Cancel session
   */
  public async cancelSession(sessionId: string): Promise<QuickActionDialogueData> {
    const res = await fetch(`${this.baseUrl}/quick-action/${encodeURIComponent(sessionId)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await res.json();
    return json.quickActionResponse;
  }
}

export const quickActionService = new QuickActionService();
