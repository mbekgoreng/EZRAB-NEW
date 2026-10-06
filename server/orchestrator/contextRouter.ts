export type IntentDomain = 'RAB' | 'KURVA_S' | 'AHSP' | 'PROGRESS' | 'REPORT' | 'GENERAL';

export interface RouteAnalysis {
  primaryDomain: IntentDomain;
  confidence: number;
  relevantTools: string[];
  suggestedPromptAdditions: string[];
}

export class ContextRouter {
  /**
   * Classify user query intent into domain and recommend targeted tools
   */
  public analyzeIntent(query: string, currentPage = 'dashboard'): RouteAnalysis {
    const q = query.toLowerCase();

    // 1. KURVA S / SCHEDULE
    if (
      q.includes('kurva') ||
      q.includes('deviasi') ||
      q.includes('terlambat') ||
      q.includes('jadwal') ||
      q.includes('schedule') ||
      q.includes('keterlambatan') ||
      q.includes('minggu ke')
    ) {
      return {
        primaryDomain: 'KURVA_S',
        confidence: 0.95,
        relevantTools: ['get_kurva_s', 'get_project_progress', 'update_progress'],
        suggestedPromptAdditions: [
          'User is asking about project schedule or Kurva S deviation. Provide exact planned vs actual progress percentages and root causes if delayed.'
        ]
      };
    }

    // 2. AHSP / UNIT PRICE ANALYSIS
    if (
      q.includes('ahsp') ||
      q.includes('analisa') ||
      q.includes('koefisien') ||
      q.includes('upah') ||
      q.includes('tukang') ||
      q.includes('mandor') ||
      q.includes('pupr')
    ) {
      return {
        primaryDomain: 'AHSP',
        confidence: 0.92,
        relevantTools: ['search_ahsp', 'get_ahsp_detail'],
        suggestedPromptAdditions: [
          'User is inquiring about Indonesian AHSP unit price analysis or standard PUPR labor/material coefficients.'
        ]
      };
    }

    // 3. PROGRESS
    if (q.includes('progress') || q.includes('progres') || q.includes('persen') || q.includes('capaian')) {
      return {
        primaryDomain: 'PROGRESS',
        confidence: 0.9,
        relevantTools: ['get_project_progress', 'get_kurva_s', 'update_progress'],
        suggestedPromptAdditions: [
          'User is asking for physical completion progress. Quote exact numerical values and status.'
        ]
      };
    }

    // 4. REPORT / LAPORAN
    if (q.includes('laporan') || q.includes('report') || q.includes('mingguan') || q.includes('rekap')) {
      return {
        primaryDomain: 'REPORT',
        confidence: 0.9,
        relevantTools: ['create_project_report', 'get_project_summary', 'get_rab_summary'],
        suggestedPromptAdditions: [
          'User wants a progress report summary or drafting. Include period, metrics, critical issues, and recommendations.'
        ]
      };
    }

    // 5. RAB / COST / BUDGET
    if (
      q.includes('rab') ||
      q.includes('biaya') ||
      q.includes('anggaran') ||
      q.includes('harga') ||
      q.includes('mahal') ||
      q.includes('total') ||
      q.includes('tambah item') ||
      q.includes('tambah pekerjaan') ||
      q.includes('hapus item') ||
      q.includes('anomali')
    ) {
      return {
        primaryDomain: 'RAB',
        confidence: 0.9,
        relevantTools: [
          'get_rab_summary',
          'search_rab_items',
          'detect_cost_anomalies',
          'add_rab_item',
          'update_rab_item',
          'delete_rab_item'
        ],
        suggestedPromptAdditions: [
          'User is inquiring about project finances, RAB line items, or budget allocations. Use IDR currency formatting.'
        ]
      };
    }

    // Default fallback based on current page
    let domain: IntentDomain = 'GENERAL';
    if (currentPage.includes('rab') || currentPage.includes('boq')) domain = 'RAB';
    else if (currentPage.includes('kurva') || currentPage.includes('schedule')) domain = 'KURVA_S';
    else if (currentPage.includes('ahsp')) domain = 'AHSP';
    else if (currentPage.includes('laporan') || currentPage.includes('report')) domain = 'REPORT';

    return {
      primaryDomain: domain,
      confidence: 0.6,
      relevantTools: ['get_project_summary'],
      suggestedPromptAdditions: ['Provide helpful, precise assistance regarding construction project management.']
    };
  }
}

export const contextRouter = new ContextRouter();
