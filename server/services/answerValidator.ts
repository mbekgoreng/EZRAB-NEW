export interface AnswerValidationResult {
  isValid: boolean;
  sanitizedAnswer: string;
  isRedacted: boolean;
  warnings: string[];
  groundingScore: number;
}

export class AnswerValidator {
  private sensitivePatterns = [
    /Bearer\s+[A-Za-z0-9_\-\.\~+/]+=*/i,
    /(?:password|otp|secret|api[_-]?key|service[_-]?role)\s*[:=]\s*['"]?[^\s"',]+['"]?/i,
    /postgres(?:ql)?:\/\/[^\s]+/i,
    /(?:Traceback \(most recent call last\)|node_modules[\\\/])/i
  ];

  public validate(params: {
    rawAnswer: string;
    contextMarkdown?: string;
    toolExecutionStatus?: 'SUCCESS' | 'ERROR' | 'NONE';
    toolCallsExecuted?: Array<{ toolName: string; result: any }>;
  }): AnswerValidationResult {
    const { rawAnswer, toolExecutionStatus = 'NONE' } = params;
    const warnings: string[] = [];
    let isRedacted = false;
    let sanitizedAnswer = rawAnswer ? rawAnswer.trim() : '';

    if (!sanitizedAnswer) {
      return {
        isValid: false,
        sanitizedAnswer: 'Maaf, EZRAB AI belum menghasilkan jawaban. Silakan coba lagi.',
        isRedacted: false,
        warnings: ['Empty response detected'],
        groundingScore: 0.0
      };
    }

    // 1. Redact Secrets & Internal Information
    for (const pattern of this.sensitivePatterns) {
      if (pattern.test(sanitizedAnswer)) {
        sanitizedAnswer = sanitizedAnswer.replace(pattern, '[DATA_SENSITIF_DIRAHASIAKAN]');
        isRedacted = true;
        warnings.push('Informasi sensitif/rahasia internal disanitasi.');
      }
    }

    // 2. Tool Execution Claim Verification
    if (toolExecutionStatus === 'ERROR') {
      const claimsSuccess = /(?:berhasil\s+dibuat|berhasil\s+dihapus|berhasil\s+diperbarui|telah\s+tersimpan)/i.test(sanitizedAnswer);
      if (claimsSuccess) {
        sanitizedAnswer = 'Terjadi kendala saat memproses permintaan data pada server backend. Operasi belum berhasil diterapkan.';
        warnings.push('Respons model mengklaim tool berhasil padahal gagal; ditimpa dengan pesan error aman.');
      }
    }

    return {
      isValid: true,
      sanitizedAnswer,
      isRedacted,
      warnings,
      groundingScore: 1.0
    };
  }
}

export const answerValidator = new AnswerValidator();
