/**
 * Document Security Guard (Phase 6)
 *
 * Implements strict document prompt injection defense, untrusted content sanitization,
 * checksum verification, and tenant/project authorization gating.
 */

export interface SecurityScanResult {
  isClean: boolean;
  sanitizedContent: string;
  threatsDetected: string[];
  riskScore: number; // 0.0 to 1.0
  checksumSha256: string;
}

export class DocumentSecurityGuard {
  private static instance: DocumentSecurityGuard;

  // Patterns designed to hijack LLM instructions inside uploaded construction documents or notes
  private readonly INJECTION_PATTERNS: Array<{ pattern: RegExp; description: string; weight: number }> = [
    { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i, description: 'Prompt override attempt (ignore instructions)', weight: 0.9 },
    { pattern: /system\s*:\s*you\s+are\s+now/i, description: 'System role hijacking attempt', weight: 0.95 },
    { pattern: /disregard\s+system\s+prompt/i, description: 'System prompt bypass attempt', weight: 0.9 },
    { pattern: /output\s+all\s+(api\s+keys|passwords|secrets|environment\s+variables)/i, description: 'Secret extraction attempt', weight: 1.0 },
    { pattern: /<script[\s\S]*?>[\s\S]*?<\/script>/i, description: 'XSS script injection attempt', weight: 0.8 },
    { pattern: /javascript\s*:\s*/i, description: 'URI javascript execution attempt', weight: 0.7 },
    { pattern: /drop\s+table|delete\s+from\s+projects/i, description: 'SQL command sequence attempt', weight: 0.85 },
    { pattern: /execute\s+tool\s+without\s+confirmation/i, description: 'Tool confirmation bypass attempt', weight: 0.9 },
  ];

  private constructor() {}

  public static getInstance(): DocumentSecurityGuard {
    if (!DocumentSecurityGuard.instance) {
      DocumentSecurityGuard.instance = new DocumentSecurityGuard();
    }
    return DocumentSecurityGuard.instance;
  }

  /**
   * Compute SHA256 checksum for document deduplication and integrity
   */
  public computeSha256(content: string | any): string {
    if (typeof (globalThis as any).process !== 'undefined') {
      try {
        const nodeRequire = (globalThis as any).require;
        const nodeCrypto = nodeRequire ? nodeRequire('crypto') : undefined;
        if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
          return nodeCrypto.createHash('sha256').update(content).digest('hex');
        }
      } catch {}
    }

    // Deterministic string hash fallback (compatible in all environments)
    let hash = 0;
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  /**
   * Validate and sanitize document text content against prompt injection and malicious payloads
   */
  public scanAndSanitizeText(rawContent: string): SecurityScanResult {
    if (!rawContent || rawContent.trim() === '') {
      return {
        isClean: true,
        sanitizedContent: '',
        threatsDetected: [],
        riskScore: 0,
        checksumSha256: this.computeSha256(''),
      };
    }

    const threatsDetected: string[] = [];
    let totalRisk = 0;
    let sanitizedContent = rawContent;

    for (const item of this.INJECTION_PATTERNS) {
      if (item.pattern.test(rawContent)) {
        threatsDetected.push(item.description);
        totalRisk = Math.max(totalRisk, item.weight);

        // Sanitize the malicious pattern into inert text
        sanitizedContent = sanitizedContent.replace(item.pattern, (match) => `[SANITIZED_UNTRUSTED_CONTENT: ${match.slice(0, 10)}...]`);
      }
    }

    const isClean = threatsDetected.length === 0;
    const checksumSha256 = this.computeSha256(rawContent);

    return {
      isClean,
      sanitizedContent,
      threatsDetected,
      riskScore: Math.min(1.0, totalRisk),
      checksumSha256,
    };
  }

  /**
   * Validate project and workspace tenant scoping
   */
  public validateTenantAccess(params: {
    projectId: string;
    workspaceId: string;
    userId: string;
    targetProjectId: string;
    targetWorkspaceId?: string;
  }): { allowed: boolean; reason?: string } {
    const { projectId, workspaceId, targetProjectId, targetWorkspaceId } = params;

    if (!projectId || !workspaceId) {
      return { allowed: false, reason: 'Invalid tenant session: missing projectId or workspaceId.' };
    }

    if (projectId !== targetProjectId) {
      return {
        allowed: false,
        reason: `Cross-project access forbidden: current project '${projectId}' cannot access target project '${targetProjectId}'.`,
      };
    }

    if (targetWorkspaceId && workspaceId !== targetWorkspaceId) {
      return {
        allowed: false,
        reason: `Cross-workspace access forbidden: current workspace '${workspaceId}' cannot access target workspace '${targetWorkspaceId}'.`,
      };
    }

    return { allowed: true };
  }
}
