import { UserRole } from '../types';

export interface WorkspaceMember {
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

export interface CreateMemberInput {
  name: string;
  email: string;
  phone?: string;
  role: 'ESTIMATOR' | 'DIREKSI' | 'CLIENT';
  title?: string;
  company?: string;
}

const STORAGE_KEY = 'ezrab_workspace_users_v2';

const INITIAL_USERS: WorkspaceMember[] = [
  {
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'usr-est-02',
    workspaceId: 'ws-default',
    name: 'Budi Santoso, ST.',
    email: 'budi.santoso@ezrab.id',
    phone: '+62 813-8899-0011',
    role: 'ESTIMATOR',
    status: 'ACTIVE',
    title: 'Senior Quantity Surveyor',
    company: 'PT Sinergi Konstruksi Nusantara',
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
  {
    id: 'usr-dir-03',
    workspaceId: 'ws-default',
    name: 'Ir. Hendra Kusuma, MT.',
    email: 'hendra.kusuma@ezrab.id',
    phone: '+62 811-2233-4455',
    role: 'DIREKSI',
    status: 'ACTIVE',
    title: 'Direktur Operasional',
    company: 'PT Sinergi Konstruksi Nusantara',
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
  },
  {
    id: 'usr-cli-04',
    workspaceId: 'ws-default',
    name: 'Bambang Soediro',
    email: 'bambang@investamaproperti.co.id',
    phone: '+62 815-9900-1122',
    role: 'CLIENT',
    status: 'ACTIVE',
    title: 'Owner Representative',
    company: 'PT Investama Properti Indonesia',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
];

export class ClientUserManagementService {
  public static getUsers(workspaceId: string = 'ws-default'): WorkspaceMember[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: WorkspaceMember[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((u) => u.workspaceId === workspaceId || !u.workspaceId);
        }
      }
    } catch (e) {
      console.error('Error reading users from storage:', e);
    }
    return INITIAL_USERS;
  }

  public static getCurrentUser(): WorkspaceMember {
    const users = this.getUsers();
    return users.find((u) => u.role === 'SUPER_ADMIN') || INITIAL_USERS[0];
  }

  public static addUser(
    input: CreateMemberInput,
    workspaceId: string = 'ws-default'
  ): { success: boolean; user?: WorkspaceMember; error?: string } {
    const users = this.getUsers(workspaceId);

    // Validation
    if (!input.name || input.name.trim().length < 2) {
      return { success: false, error: 'Nama lengkap wajib diisi minimal 2 karakter.' };
    }

    if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      return { success: false, error: 'Format alamat email tidak valid.' };
    }

    const cleanEmail = input.email.trim().toLowerCase();
    if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      return { success: false, error: 'Alamat email ini sudah terdaftar sebagai anggota workspace.' };
    }

    const allowedRoles = ['ESTIMATOR', 'DIREKSI', 'CLIENT'];
    if (!allowedRoles.includes(input.role)) {
      return { success: false, error: 'Role yang dipilih tidak valid.' };
    }

    const newId = `usr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();

    const newUser: WorkspaceMember = {
      id: newId,
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

    const updatedUsers = [...users, newUser];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUsers));
    } catch (e) {
      console.error('Failed to persist users:', e);
    }

    return { success: true, user: newUser };
  }

  public static resetToDefault(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_USERS));
    } catch (e) {
      console.error(e);
    }
  }
}
