export interface PolicyEvaluationResult {
  blocked: boolean;
  requiresRAG: boolean;
  requiresLiveData: boolean;
  requiresTool: boolean;
  requiresConfirmation: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  safeResponse?: string;
  reasons: string[];
}

export class RulesEngine {
  private securitySensitivePatterns = [
    /password/i,
    /token\b/i,
    /secret/i,
    /api[_-]?key/i,
    /otp\b/i,
    /service[_-]?role/i,
    /system[_-]?prompt/i,
    /drop\s+table/i,
    /delete\s+from\s+projects/i,
    /truncate/i,
    /bypass/i,
    /ignore\s+all\s+rules/i,
    /kamu\s+sekarang\s+adalah/i
  ];

  public evaluate(params: {
    message: string;
    intent: string;
    userRole?: string;
    hasActiveProject: boolean;
    isDestructiveAction?: boolean;
  }): PolicyEvaluationResult {
    const { message, intent, userRole = 'ESTIMATOR', hasActiveProject, isDestructiveAction } = params;
    const reasons: string[] = [];

    // 1. Security & Prompt Injection Rule
    for (const pattern of this.securitySensitivePatterns) {
      if (pattern.test(message)) {
        return {
          blocked: true,
          requiresRAG: false,
          requiresLiveData: false,
          requiresTool: false,
          requiresConfirmation: false,
          riskLevel: 'CRITICAL',
          safeResponse: 'Permintaan ini tidak dapat diproses demi mematuhi kebijakan keamanan dan integritas data EZRAB.',
          reasons: ['Terkait informasi kredensial atau pola keamanan sensitif.']
        };
      }
    }

    // 2. Destructive & Financial Confirmation Gate
    if (isDestructiveAction || intent.includes('DELETE') || intent.includes('RESET')) {
      if (userRole !== 'SUPER_ADMIN' && userRole !== 'ESTIMATOR') {
        return {
          blocked: true,
          requiresRAG: false,
          requiresLiveData: false,
          requiresTool: false,
          requiresConfirmation: false,
          riskLevel: 'HIGH',
          safeResponse: 'Anda tidak memiliki wewenang untuk melakukan tindakan penghapusan data ini.',
          reasons: ['Role tidak memiliki hak AI_DELETE']
        };
      }

      return {
        blocked: false,
        requiresRAG: false,
        requiresLiveData: true,
        requiresTool: true,
        requiresConfirmation: true,
        riskLevel: 'HIGH',
        reasons: ['Tindakan destruktif wajib melalui konfirmasi dua tahap.']
      };
    }

    // 3. Small talk & Basic Greetings
    const isSmallTalk = [
      'GREETING',
      'HOW_ARE_YOU',
      'SMALL_TALK',
      'THANKS',
      'GOODBYE',
      'IDENTITY_QUESTION',
      'CAPABILITY_QUESTION'
    ].includes(intent);

    if (isSmallTalk) {
      return {
        blocked: false,
        requiresRAG: false,
        requiresLiveData: false,
        requiresTool: false,
        requiresConfirmation: false,
        riskLevel: 'LOW',
        reasons: ['Percakapan umum tanpa beban data live atau kredit.']
      };
    }

    // 4. Live Data Required Intents
    const requiresLive = [
      'PROJECT_PROGRESS',
      'PROJECT_REPORT',
      'RAB_SUMMARY',
      'RAB_CALCULATE',
      'KURVA_S',
      'TIME_SCHEDULE'
    ].includes(intent);

    if (requiresLive && !hasActiveProject) {
      return {
        blocked: true,
        requiresRAG: true,
        requiresLiveData: false,
        requiresTool: false,
        requiresConfirmation: false,
        riskLevel: 'LOW',
        safeResponse: 'Untuk melihat data proyek atau menghitung RAB, silakan pilih proyek aktif terlebih dahulu.',
        reasons: ['Proyek aktif belum dipilih.']
      };
    }

    return {
      blocked: false,
      requiresRAG: true,
      requiresLiveData: requiresLive,
      requiresTool: intent.includes('ACTION') || intent.includes('CREATE') || intent.includes('UPDATE'),
      requiresConfirmation: false,
      riskLevel: 'LOW',
      reasons: ['Permintaan valid dan memenuhi kebijakan sistem.']
    };
  }
}

export const rulesEngine = new RulesEngine();
