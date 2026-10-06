/**
 * EZRAB Settings Audit Trail Service
 * Records, persists, and queries configuration changes across Account, Workspace, and Project scopes.
 */

export type SettingsScope = 'ACCOUNT' | 'WORKSPACE' | 'PROJECT';

export type SettingsCategory =
  | 'ACCOUNT'
  | 'WORKSPACE'
  | 'MASTER_DATA'
  | 'ESTIMATOR'
  | 'DED_VOLUME'
  | 'DOCUMENTS'
  | 'SCHEDULE'
  | 'COST'
  | 'INTEGRATION'
  | 'SYSTEM';

export interface SettingsAuditEntry {
  id: string;
  timestamp: string;
  actor: {
    id: string;
    name: string;
    email?: string;
    role?: string;
  };
  scope: SettingsScope;
  projectId?: string;
  projectName?: string;
  category: SettingsCategory;
  field: string;
  fieldLabel: string;
  oldValue: any;
  newValue: any;
  reason?: string;
}

const STORAGE_KEY = 'ezrab_settings_audit_log_v1';
const MAX_LOGS = 500;

export class SettingsAuditService {
  private static instance: SettingsAuditService;

  private constructor() {}

  public static getInstance(): SettingsAuditService {
    if (!SettingsAuditService.instance) {
      SettingsAuditService.instance = new SettingsAuditService();
    }
    return SettingsAuditService.instance;
  }

  public getLogs(filters?: {
    scope?: SettingsScope;
    projectId?: string;
    category?: SettingsCategory;
    limit?: number;
  }): SettingsAuditEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.getInitialSampleLogs();
      let logs: SettingsAuditEntry[] = JSON.parse(raw);

      if (filters?.scope) {
        logs = logs.filter((l) => l.scope === filters.scope);
      }
      if (filters?.projectId) {
        logs = logs.filter((l) => l.projectId === filters.projectId);
      }
      if (filters?.category) {
        logs = logs.filter((l) => l.category === filters.category);
      }
      if (filters?.limit) {
        logs = logs.slice(0, filters.limit);
      }
      return logs;
    } catch (e) {
      console.warn('Error reading settings audit log from storage:', e);
      return this.getInitialSampleLogs();
    }
  }

  public recordChange(entry: Omit<SettingsAuditEntry, 'id' | 'timestamp'>): SettingsAuditEntry {
    const newEntry: SettingsAuditEntry = {
      ...entry,
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
    };

    try {
      const existing = this.getLogs();
      const updated = [newEntry, ...existing].slice(0, MAX_LOGS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Error saving settings audit entry:', e);
    }

    return newEntry;
  }

  public clearLogs(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Error clearing audit logs:', e);
    }
  }

  private getInitialSampleLogs(): SettingsAuditEntry[] {
    return [
      {
        id: 'audit-init-01',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        actor: {
          id: 'usr-admin-01',
          name: 'Ahmad Yusuf, ST.',
          role: 'SUPER_ADMIN',
        },
        scope: 'WORKSPACE',
        category: 'WORKSPACE',
        field: 'defaultTaxPercent',
        fieldLabel: 'Tarif PPN Standar Workspace',
        oldValue: 10,
        newValue: 11,
        reason: 'Penyesuaian regulasi perpajakan pengadaan barang & jasa',
      },
      {
        id: 'audit-init-02',
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        actor: {
          id: 'usr-est-02',
          name: 'Budi Santoso, ST.',
          role: 'ESTIMATOR',
        },
        scope: 'PROJECT',
        projectId: 'PROJ-DEMO-01',
        projectName: 'Rumah Tinggal Modern Tropis',
        category: 'ESTIMATOR',
        field: 'overheadPercent',
        fieldLabel: 'Overhead Proyek',
        oldValue: 8,
        newValue: 10,
        reason: 'Penyesuaian tingkat kesulitan pekerjaan finishing',
      },
      {
        id: 'audit-init-03',
        timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
        actor: {
          id: 'usr-admin-01',
          name: 'Ahmad Yusuf, ST.',
          role: 'SUPER_ADMIN',
        },
        scope: 'WORKSPACE',
        category: 'MASTER_DATA',
        field: 'defaultAhspSource',
        fieldLabel: 'Standar AHSP Default',
        oldValue: 'pupr-2022',
        newValue: 'pupr-2026',
        reason: 'Upgrade standar AHSP resmi Kementerian PUPR 2026',
      },
    ];
  }
}

export const settingsAuditService = SettingsAuditService.getInstance();
