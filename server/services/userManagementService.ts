import { UserRole } from '../../src/types';

export interface WorkspaceUser {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: 'ACTIVE' | 'INVITED' | 'INACTIVE';
  title?: string;
  company?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  phone?: string;
  role: 'ESTIMATOR' | 'DIREKSI' | 'CLIENT';
  title?: string;
  company?: string;
}

export interface UserAuditLog {
  id: string;
  action: 'USER_CREATED' | 'USER_ROLE_CHANGED' | 'USER_DEACTIVATED';
  actorUserId: string;
  workspaceId: string;
  targetUserId: string;
  role: UserRole;
  timestamp: string;
}

class UserManagementService {
  private users: Map<string, WorkspaceUser[]> = new Map();
  private auditLogs: UserAuditLog[] = [];

  constructor() {
    // Bootstrap initial workspace and Super Admin
    this.bootstrapWorkspace('ws-default', {
      id: 'usr-admin-01',
      workspaceId: 'ws-default',
      name: 'Ahmad Yusuf, ST.',
      email: 'ahmad.yusuf@ezrab.id',
      phone: '+62 812-3456-7890',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      title: 'Lead Cost Estimator & Super Admin',
      company: 'PT Sinergi Konstruksi Nusantara',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    });
  }

  public bootstrapWorkspace(workspaceId: string, initialAdmin: WorkspaceUser): void {
    const list = this.users.get(workspaceId) || [];
    if (!list.some((u) => u.email.toLowerCase() === initialAdmin.email.toLowerCase())) {
      list.push(initialAdmin);
      this.users.set(workspaceId, list);
    }
  }

  public getWorkspaceUsers(workspaceId: string): WorkspaceUser[] {
    return [...(this.users.get(workspaceId) || [])];
  }

  public getAuditLogs(workspaceId?: string): UserAuditLog[] {
    if (workspaceId) {
      return this.auditLogs.filter((log) => log.workspaceId === workspaceId);
    }
    return [...this.auditLogs];
  }

  public createUser(
    actor: { id: string; role: UserRole; workspaceId: string },
    workspaceId: string,
    input: CreateUserInput
  ): { success: boolean; user?: WorkspaceUser; error?: string } {
    // 1. Authoritative Role Security Check: Only SUPER_ADMIN can add users
    if (actor.role !== 'SUPER_ADMIN') {
      return {
        success: false,
        error: 'FORBIDDEN: Hanya Super Admin yang berwenang menambahkan pengguna ke workspace.',
      };
    }

    // 2. Workspace Mismatch Check
    if (actor.workspaceId !== workspaceId) {
      return {
        success: false,
        error: 'FORBIDDEN: Tidak dapat menambahkan pengguna ke workspace yang berbeda.',
      };
    }

    // 3. Super Admin Escalation Protection: Cannot create Super Admin via regular form
    const targetRole = input.role as string;
    if (targetRole === 'SUPER_ADMIN') {
      return {
        success: false,
        error: 'FORBIDDEN: Penugasan role Super Admin dilindungi dan tidak dapat dibuat secara langsung.',
      };
    }

    // Allowed roles
    const allowedRoles: UserRole[] = ['ESTIMATOR', 'DIREKSI', 'CLIENT'];
    if (!allowedRoles.includes(input.role as UserRole)) {
      return {
        success: false,
        error: 'VALIDATION_ERROR: Role yang dipilih tidak valid. Role yang diizinkan: Estimator, Direksi, Client.',
      };
    }

    // 4. Validate Required Data
    if (!input.name || input.name.trim().length < 2) {
      return {
        success: false,
        error: 'VALIDATION_ERROR: Nama lengkap wajib diisi minimal 2 karakter.',
      };
    }

    if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      return {
        success: false,
        error: 'VALIDATION_ERROR: Format alamat email tidak valid.',
      };
    }

    const cleanEmail = input.email.trim().toLowerCase();
    const currentUsers = this.users.get(workspaceId) || [];

    // 5. Check Duplicate Email within Workspace
    if (currentUsers.some((u) => u.email.toLowerCase() === cleanEmail)) {
      return {
        success: false,
        error: 'DUPLICATE_EMAIL: Alamat email ini sudah terdaftar sebagai anggota workspace.',
      };
    }

    // 6. Create User Object
    const newUserId = `usr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();

    const newUser: WorkspaceUser = {
      id: newUserId,
      workspaceId,
      name: input.name.trim(),
      email: cleanEmail,
      phone: input.phone?.trim() || undefined,
      role: input.role,
      status: 'ACTIVE',
      title: input.title?.trim() || (input.role === 'ESTIMATOR' ? 'Cost Estimator' : input.role === 'DIREKSI' ? 'Direksi' : 'Client Representative'),
      company: input.company?.trim() || 'PT Sinergi Konstruksi Nusantara',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    currentUsers.push(newUser);
    this.users.set(workspaceId, currentUsers);

    // 7. Audit Log Creation (USER_CREATED - no credentials recorded)
    const auditEntry: UserAuditLog = {
      id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      action: 'USER_CREATED',
      actorUserId: actor.id,
      workspaceId,
      targetUserId: newUserId,
      role: input.role,
      timestamp: nowIso,
    };
    this.auditLogs.push(auditEntry);

    return {
      success: true,
      user: newUser,
    };
  }
}

export const userManagementService = new UserManagementService();
