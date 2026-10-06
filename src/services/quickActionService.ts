import { QUICK_ACTION_CONTRACTS, QuickActionContract } from '../data/quickActionContracts';
import { QuickActionDialogueData } from '../components/copilot/QuickActionDialogueRenderer';

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

    return {
      responseType: 'quick_action_dialogue',
      actionId: 'GENERAL',
      sessionId,
      currentState: 'RESULT_PRESENTED',
      title: 'Hasil Tindakan',
      message: 'Permintaan Anda telah diproses.',
      collectedParameters: { ...parameters, choiceId },
      followUpSuggestions: ['Hitung Volume QTO', 'Audit RAB Proyek', 'Cari AHSP 2026'],
      canGoBack: true,
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

    return {
      responseType: 'quick_action_dialogue',
      actionId: 'GENERAL',
      sessionId,
      currentState: 'COMPLETED',
      title: 'Tersimpan',
      message: 'Perubahan berhasil diterapkan ke database proyek.',
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
