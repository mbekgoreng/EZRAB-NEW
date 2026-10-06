/**
 * Human-In-The-Loop Approval Service (Priority 4)
 *
 * Enforces two-step human approval for high-risk operations (RAB mutations, price updates,
 * DED commits, deletions, and exports) with expiring tokens and audit records.
 */

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface ApprovalRequest {
  approvalId: string;
  userId: string;
  workspaceId: string;
  projectId: string;
  action: string;
  description: string;
  preview: Record<string, any>;
  expiresAt: string;
  status: ApprovalStatus;
  auditRecord: Record<string, any>;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export class HumanApprovalService {
  private static instance: HumanApprovalService;
  private approvals: Map<string, ApprovalRequest> = new Map();
  private readonly defaultExpiryMs = 15 * 60 * 1000; // 15 minutes

  private constructor() {}

  public static getInstance(): HumanApprovalService {
    if (!HumanApprovalService.instance) {
      HumanApprovalService.instance = new HumanApprovalService();
    }
    return HumanApprovalService.instance;
  }

  /**
   * Create an approval request for a high-risk action
   */
  public createApprovalRequest(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    action: string;
    description: string;
    preview: Record<string, any>;
    expiryMs?: number;
  }): ApprovalRequest {
    const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const expiryMs = input.expiryMs || this.defaultExpiryMs;

    const request: ApprovalRequest = {
      approvalId,
      userId: input.userId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      action: input.action,
      description: input.description,
      preview: input.preview,
      expiresAt: new Date(now.getTime() + expiryMs).toISOString(),
      status: 'PENDING',
      auditRecord: {
        requestedAt: now.toISOString(),
        clientAction: input.action,
        riskLevel: 'HIGH'
      },
      createdAt: now.toISOString()
    };

    this.approvals.set(approvalId, request);
    return request;
  }

  /**
   * Decide on approval request (APPROVE or REJECT) with strict expiry enforcement
   */
  public decideApproval(input: {
    approvalId: string;
    userId: string;
    decision: 'APPROVED' | 'REJECTED';
    reason?: string;
  }): ApprovalRequest {
    const request = this.approvals.get(input.approvalId);
    if (!request) {
      throw new Error(`Permintaan persetujuan ${input.approvalId} tidak ditemukan.`);
    }

    const now = new Date();
    if (new Date(request.expiresAt) < now) {
      request.status = 'EXPIRED';
      throw new Error(`Permintaan persetujuan ${input.approvalId} telah kedaluwarsa (Expired). Tindakan dibatalkan demi keamanan.`);
    }

    if (request.status !== 'PENDING') {
      throw new Error(`Permintaan persetujuan ${input.approvalId} sudah diputuskan sebelumnya (${request.status}).`);
    }

    request.status = input.decision;
    request.decidedAt = now.toISOString();
    request.decidedBy = input.userId;
    request.auditRecord.decisionReason = input.reason || 'Keputusan manual pengguna';

    return request;
  }

  public getApproval(approvalId: string): ApprovalRequest | undefined {
    return this.approvals.get(approvalId);
  }
}

export const humanApprovalService = HumanApprovalService.getInstance();
