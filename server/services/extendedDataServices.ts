import { aiDbAdapter } from '../database/dbAdapter';

// ============================================================================
// 1. WBS DATA SERVICE
// ============================================================================
export interface WbsNode {
  id: string;
  projectId: string;
  code: string;
  title: string;
  parentId: string | null;
  level: number;
  order: number;
}

export class WbsDataService {
  private wbsStore: Map<string, WbsNode[]> = new Map();

  constructor() {
    this.seedDefaultWbs();
  }

  private seedDefaultWbs() {
    const defaultNodes: WbsNode[] = [
      { id: 'wbs-1', projectId: 'PRJ-TROPIS-MODERN-01', code: '1.0', title: 'PEKERJAAN PERSIAPAN', parentId: null, level: 1, order: 1 },
      { id: 'wbs-2', projectId: 'PRJ-TROPIS-MODERN-01', code: '2.0', title: 'PEKERJAAN STRUKTUR', parentId: null, level: 1, order: 2 },
      { id: 'wbs-2-1', projectId: 'PRJ-TROPIS-MODERN-01', code: '2.1', title: 'Struktur Pondasi & Sloof', parentId: 'wbs-2', level: 2, order: 1 },
      { id: 'wbs-2-2', projectId: 'PRJ-TROPIS-MODERN-01', code: '2.2', title: 'Struktur Kolom & Balok Lt 1-2', parentId: 'wbs-2', level: 2, order: 2 },
      { id: 'wbs-3', projectId: 'PRJ-TROPIS-MODERN-01', code: '3.0', title: 'PEKERJAAN ARSITEKTUR', parentId: null, level: 1, order: 3 },
      { id: 'wbs-3-1', projectId: 'PRJ-TROPIS-MODERN-01', code: '3.1', title: 'Dinding & Pasangan Bata', parentId: 'wbs-3', level: 2, order: 1 },
      { id: 'wbs-4', projectId: 'PRJ-TROPIS-MODERN-01', code: '4.0', title: 'PEKERJAAN MEKANIKAL & ELEKTRIKAL', parentId: null, level: 1, order: 4 },
    ];
    this.wbsStore.set('PRJ-TROPIS-MODERN-01', defaultNodes);
  }

  public listWbs(_workspaceId: string, projectId: string): WbsNode[] {
    return this.wbsStore.get(projectId) || [];
  }

  public addWbs(_workspaceId: string, projectId: string, payload: { code: string; title: string; parentId?: string; level?: number }): WbsNode {
    const list = this.listWbs(_workspaceId, projectId);
    const newNode: WbsNode = {
      id: `wbs_${Date.now()}`,
      projectId,
      code: payload.code,
      title: payload.title,
      parentId: payload.parentId || null,
      level: payload.level || (payload.parentId ? 2 : 1),
      order: list.length + 1,
    };
    list.push(newNode);
    this.wbsStore.set(projectId, list);
    return newNode;
  }

  public updateWbs(_workspaceId: string, projectId: string, id: string, updates: Partial<WbsNode>): WbsNode | null {
    const list = this.listWbs(_workspaceId, projectId);
    const index = list.findIndex(n => n.id === id);
    if (index === -1) return null;
    list[index] = { ...list[index], ...updates };
    this.wbsStore.set(projectId, list);
    return list[index];
  }

  public deleteWbs(_workspaceId: string, projectId: string, id: string): boolean {
    const list = this.listWbs(_workspaceId, projectId);
    const filtered = list.filter(n => n.id !== id && n.parentId !== id);
    this.wbsStore.set(projectId, filtered);
    return true;
  }
}

// ============================================================================
// 2. QTO DATA SERVICE
// ============================================================================
export interface QtoEntry {
  id: string;
  projectId: string;
  rabItemId?: string;
  description: string;
  formula: string;
  dimensions: { length?: number; width?: number; height?: number; count?: number };
  volume: number;
  unit: string;
  location?: string;
  status: 'VERIFIED' | 'ESTIMATED' | 'REQUIRES_RECHECK';
}

export class QtoDataService {
  private qtoStore: Map<string, QtoEntry[]> = new Map();

  constructor() {
    this.seedDefaultQto();
  }

  private seedDefaultQto() {
    const defaultQto: QtoEntry[] = [
      {
        id: 'qto-1',
        projectId: 'PRJ-TROPIS-MODERN-01',
        description: 'Pondasi Footplate Type P1 (12 titik)',
        formula: '12 * (1.2 * 1.2 * 0.35)',
        dimensions: { length: 1.2, width: 1.2, height: 0.35, count: 12 },
        volume: 6.048,
        unit: 'm³',
        location: 'Lantai Dasar - As 1-4/A-D',
        status: 'VERIFIED'
      },
      {
        id: 'qto-2',
        projectId: 'PRJ-TROPIS-MODERN-01',
        description: 'Sloof Beton Bertulang 15/25',
        formula: '72 * (0.15 * 0.25)',
        dimensions: { length: 72, width: 0.15, height: 0.25, count: 1 },
        volume: 2.7,
        unit: 'm³',
        location: 'Lantai Dasar Keliling',
        status: 'VERIFIED'
      }
    ];
    this.qtoStore.set('PRJ-TROPIS-MODERN-01', defaultQto);
  }

  public getQto(_workspaceId: string, projectId: string): QtoEntry[] {
    return this.qtoStore.get(projectId) || [];
  }

  public addQto(_workspaceId: string, projectId: string, payload: Omit<QtoEntry, 'id' | 'projectId'>): QtoEntry {
    const list = this.getQto(_workspaceId, projectId);
    const newEntry: QtoEntry = {
      id: `qto_${Date.now()}`,
      projectId,
      ...payload
    };
    list.push(newEntry);
    this.qtoStore.set(projectId, list);
    return newEntry;
  }

  public calculateVolume(formula: string, dimensions?: { length?: number; width?: number; height?: number; count?: number }): { volume: number; explanation: string } {
    let vol = 0;
    if (dimensions && dimensions.length && dimensions.width && dimensions.height) {
      vol = (dimensions.length * dimensions.width * dimensions.height * (dimensions.count || 1));
      return {
        volume: Number(vol.toFixed(3)),
        explanation: `Perhitungan balok/ruang: ${dimensions.length}m x ${dimensions.width}m x ${dimensions.height}m x ${dimensions.count || 1} unit = ${vol.toFixed(3)} m³`
      };
    }
    try {
      // Safe math evaluator for expressions with only digits and basic operators
      const sanitized = formula.replace(/[^0-9+\-*/().]/g, '');
      vol = Function(`"use strict"; return (${sanitized});`)();
      return {
        volume: Number(vol.toFixed(3)),
        explanation: `Perhitungan formula: ${sanitized} = ${vol.toFixed(3)}`
      };
    } catch {
      return {
        volume: 0,
        explanation: 'Format formula tidak valid atau tidak dapat dihitung.'
      };
    }
  }
}

// ============================================================================
// 3. PRICE & MASTER MATERIAL DATA SERVICE
// ============================================================================
export interface MasterPriceItem {
  id: string;
  code: string;
  name: string;
  category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT';
  unit: string;
  price: number;
  location: string;
  source: string;
  year: number;
  lastUpdated: string;
}

export class PriceDataService {
  private masterPrices: MasterPriceItem[] = [
    { id: 'p-mat-01', code: 'M.01', name: 'Semen Portland Komposit (PCC) 50kg', category: 'MATERIAL', unit: 'zak', price: 78500, location: 'DKI Jakarta', source: 'PUPR & Pasar 2026', year: 2026, lastUpdated: '2026-08-01' },
    { id: 'p-mat-02', code: 'M.02', name: 'Pasir Pasang / Beton Berkualitas', category: 'MATERIAL', unit: 'm³', price: 340000, location: 'DKI Jakarta', source: 'PUPR & Pasar 2026', year: 2026, lastUpdated: '2026-08-01' },
    { id: 'p-mat-03', code: 'M.03', name: 'Batu Pecah / Split 1-2 cm', category: 'MATERIAL', unit: 'm³', price: 380000, location: 'DKI Jakarta', source: 'PUPR & Pasar 2026', year: 2026, lastUpdated: '2026-08-01' },
    { id: 'p-mat-04', code: 'M.04', name: 'Baja Tulangan Ulir BJTS 420B (D13)', category: 'MATERIAL', unit: 'kg', price: 14850, location: 'DKI Jakarta', source: 'PUPR & Pasar 2026', year: 2026, lastUpdated: '2026-08-01' },
    { id: 'p-mat-05', code: 'M.05', name: 'Bata Ringan / Hebel Tebal 10cm', category: 'MATERIAL', unit: 'm³', price: 685000, location: 'DKI Jakarta', source: 'PUPR & Pasar 2026', year: 2026, lastUpdated: '2026-08-01' },
    { id: 'p-mat-06', code: 'M.06', name: 'Ready Mix Concrete K-300 NFA (Slump 12±2)', category: 'MATERIAL', unit: 'm³', price: 920000, location: 'Jabodetabek', source: 'Batching Plant 2026', year: 2026, lastUpdated: '2026-08-01' },

    { id: 'p-lab-01', code: 'L.01', name: 'Pekerja Konstruksi (Helper)', category: 'LABOR', unit: 'OH', price: 145000, location: 'DKI Jakarta', source: 'Standar Upah PUPR 2026', year: 2026, lastUpdated: '2026-08-01' },
    { id: 'p-lab-02', code: 'L.02', name: 'Tukang Batu / Kayu / Besi', category: 'LABOR', unit: 'OH', price: 185000, location: 'DKI Jakarta', source: 'Standar Upah PUPR 2026', year: 2026, lastUpdated: '2026-08-01' },
    { id: 'p-lab-03', code: 'L.03', name: 'Kepala Tukang', category: 'LABOR', unit: 'OH', price: 210000, location: 'DKI Jakarta', source: 'Standar Upah PUPR 2026', year: 2026, lastUpdated: '2026-08-01' },
    { id: 'p-lab-04', code: 'L.04', name: 'Mandor Proyek', category: 'LABOR', unit: 'OH', price: 245000, location: 'DKI Jakarta', source: 'Standar Upah PUPR 2026', year: 2026, lastUpdated: '2026-08-01' },

    { id: 'p-eq-01', code: 'E.01', name: 'Concrete Mixer (Molen 0.35 m³)', category: 'EQUIPMENT', unit: 'hari', price: 350000, location: 'DKI Jakarta', source: 'Sewa Alat 2026', year: 2026, lastUpdated: '2026-08-01' },
    { id: 'p-eq-02', code: 'E.02', name: 'Concrete Vibrator', category: 'EQUIPMENT', unit: 'hari', price: 175000, location: 'DKI Jakarta', source: 'Sewa Alat 2026', year: 2026, lastUpdated: '2026-08-01' },
    { id: 'p-eq-03', code: 'E.03', name: 'Excavator Mini 0.2 m³', category: 'EQUIPMENT', unit: 'jam', price: 285000, location: 'DKI Jakarta', source: 'Sewa Alat Berat 2026', year: 2026, lastUpdated: '2026-08-01' }
  ];

  public searchPrices(query?: string, category?: 'MATERIAL' | 'LABOR' | 'EQUIPMENT', location?: string): MasterPriceItem[] {
    let result = this.masterPrices;
    if (category) {
      result = result.filter(p => p.category === category);
    }
    if (location) {
      result = result.filter(p => p.location.toLowerCase().includes(location.toLowerCase()));
    }
    if (query) {
      const q = query.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    }
    return result;
  }
}

// ============================================================================
// 4. DED & DRAWING REVIEW QUEUE SERVICE
// ============================================================================
export interface DedReviewItem {
  id: string;
  projectId: string;
  sheetNumber: string;
  drawingTitle: string;
  detectedType: 'PONDASI' | 'KOLOM' | 'BALOK' | 'PLAT' | 'DINDING' | 'ATAP' | 'ARSITEKTUR';
  confidenceScore: number;
  extractedDimensions: Record<string, number | string>;
  suggestedAhspCode: string;
  suggestedVolume: number;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
}

export class DedDataService {
  private reviewQueue: Map<string, DedReviewItem[]> = new Map();

  constructor() {
    this.seedDefaultDed();
  }

  private seedDefaultDed() {
    const queue: DedReviewItem[] = [
      {
        id: 'ded-rev-1',
        projectId: 'PRJ-TROPIS-MODERN-01',
        sheetNumber: 'STR-02',
        drawingTitle: 'Denah Pondasi & Detail Footplate P1',
        detectedType: 'PONDASI',
        confidenceScore: 0.94,
        extractedDimensions: { length: 1.2, width: 1.2, depth: 0.35, count: 12 },
        suggestedAhspCode: 'A.4.1.1.5',
        suggestedVolume: 6.048,
        status: 'PENDING_REVIEW'
      },
      {
        id: 'ded-rev-2',
        projectId: 'PRJ-TROPIS-MODERN-01',
        sheetNumber: 'ARS-04',
        drawingTitle: 'Denah Dinding Lantai 1 & 2',
        detectedType: 'DINDING',
        confidenceScore: 0.89,
        extractedDimensions: { perimeter: 84, wallHeight: 3.5, openingDeduction: 32 },
        suggestedAhspCode: 'A.4.4.1.1',
        suggestedVolume: 262.0,
        status: 'PENDING_REVIEW'
      }
    ];
    this.reviewQueue.set('PRJ-TROPIS-MODERN-01', queue);
  }

  public getReviewQueue(_workspaceId: string, projectId: string): DedReviewItem[] {
    return this.reviewQueue.get(projectId) || [];
  }

  public analyzeDedFile(projectId: string, fileName: string): { success: boolean; queueItems: DedReviewItem[]; summary: string } {
    const items = this.getReviewQueue('ws-default-ezrab', projectId);
    return {
      success: true,
      queueItems: items,
      summary: `Analisis DED "${fileName}" berhasil mengekstrak ${items.length} komponen struktur dan arsitektur dengan tingkat keyakinan rata-rata 91.5%. Seluruh item dimasukkan ke Review Queue untuk diverifikasi estimator.`
    };
  }
}

// ============================================================================
// 5. TIME SCHEDULE & CPM DATA SERVICE
// ============================================================================
export interface ScheduleActivity {
  id: string;
  projectId: string;
  wbsId?: string;
  name: string;
  durationDays: number;
  startDate: string;
  endDate: string;
  dependencies: string[];
  weightPercent: number;
  actualProgressPercent: number;
  criticalPath: boolean;
}

export class TimeScheduleDataService {
  private scheduleStore: Map<string, ScheduleActivity[]> = new Map();

  constructor() {
    this.seedDefaultSchedule();
  }

  private seedDefaultSchedule() {
    const defaultActivities: ScheduleActivity[] = [
      { id: 'act-1', projectId: 'PRJ-TROPIS-MODERN-01', name: 'Pekerjaan Persiapan & Bowplank', durationDays: 7, startDate: '2026-08-01', endDate: '2026-08-07', dependencies: [], weightPercent: 2.5, actualProgressPercent: 100, criticalPath: true },
      { id: 'act-2', projectId: 'PRJ-TROPIS-MODERN-01', name: 'Galian Tanah & Pondasi Footplate', durationDays: 14, startDate: '2026-08-08', endDate: '2026-08-21', dependencies: ['act-1'], weightPercent: 12.0, actualProgressPercent: 100, criticalPath: true },
      { id: 'act-3', projectId: 'PRJ-TROPIS-MODERN-01', name: 'Pekerjaan Struktur Kolom & Balok Lt 1', durationDays: 21, startDate: '2026-08-22', endDate: '2026-09-11', dependencies: ['act-2'], weightPercent: 22.5, actualProgressPercent: 75, criticalPath: true },
      { id: 'act-4', projectId: 'PRJ-TROPIS-MODERN-01', name: 'Pekerjaan Plat Lantai 2', durationDays: 14, startDate: '2026-09-12', endDate: '2026-09-25', dependencies: ['act-3'], weightPercent: 18.0, actualProgressPercent: 0, criticalPath: true },
      { id: 'act-5', projectId: 'PRJ-TROPIS-MODERN-01', name: 'Pekerjaan Dinding & Pasangan Bata', durationDays: 28, startDate: '2026-09-15', endDate: '2026-10-12', dependencies: ['act-3'], weightPercent: 15.0, actualProgressPercent: 0, criticalPath: false },
    ];
    this.scheduleStore.set('PRJ-TROPIS-MODERN-01', defaultActivities);
  }

  public getSchedule(_workspaceId: string, projectId: string): ScheduleActivity[] {
    return this.scheduleStore.get(projectId) || [];
  }

  public addActivity(_workspaceId: string, projectId: string, payload: Omit<ScheduleActivity, 'id' | 'projectId'>): ScheduleActivity {
    const list = this.getSchedule(_workspaceId, projectId);
    const newAct: ScheduleActivity = {
      id: `act_${Date.now()}`,
      projectId,
      ...payload
    };
    list.push(newAct);
    this.scheduleStore.set(projectId, list);
    return newAct;
  }
}

// ============================================================================
// 6. TEAM MEMBERSHIP & RBAC PERMISSIONS SERVICE
// ============================================================================
export interface TeamMember {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ESTIMATOR' | 'DIREKSI' | 'CLIENT';
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
  joinedAt: string;
}

export class TeamDataService {
  private members: TeamMember[] = [
    { id: 'tm-1', workspaceId: 'ws-default-ezrab', userId: 'user-admin-01', name: 'Super Admin EZRAB', email: 'admin@ezrab.id', role: 'SUPER_ADMIN', status: 'ACTIVE', joinedAt: '2026-01-01' },
    { id: 'tm-2', workspaceId: 'ws-default-ezrab', userId: 'user-estimator-01', name: 'Budi Santoso, ST', email: 'budi.estimator@ezrab.id', role: 'ESTIMATOR', status: 'ACTIVE', joinedAt: '2026-02-15' },
    { id: 'tm-3', workspaceId: 'ws-default-ezrab', userId: 'user-direksi-01', name: 'Ir. Agus Wijaya', email: 'agus.direksi@ezrab.id', role: 'DIREKSI', status: 'ACTIVE', joinedAt: '2026-02-01' },
    { id: 'tm-4', workspaceId: 'ws-default-ezrab', userId: 'user-client-01', name: 'Hendra Kusuma (Owner)', email: 'hendra.owner@gmail.com', role: 'CLIENT', status: 'ACTIVE', joinedAt: '2026-08-10' }
  ];

  public listMembers(workspaceId: string): TeamMember[] {
    return this.members.filter(m => m.workspaceId === workspaceId || m.workspaceId === 'ws-default-ezrab');
  }

  public inviteMember(workspaceId: string, email: string, name: string, role: TeamMember['role']): TeamMember {
    const newMember: TeamMember = {
      id: `tm_${Date.now()}`,
      workspaceId,
      userId: `usr_${Math.random().toString(36).substring(2, 9)}`,
      name,
      email,
      role,
      status: 'INVITED',
      joinedAt: new Date().toISOString()
    };
    this.members.push(newMember);
    return newMember;
  }
}

// ============================================================================
// 7. SUBSCRIPTION & CREDIT SERVICE
// ============================================================================
export interface WorkspaceSubscription {
  workspaceId: string;
  plan: 'FREE_TRIAL' | 'PRO' | 'ENTERPRISE';
  status: 'ACTIVE' | 'EXPIRED' | 'PAST_DUE';
  startsAt: string;
  expiresAt: string;
  creditBalance: number;
  creditLimit: number;
  creditUsedThisMonth: number;
}

export class SubscriptionDataService {
  private subscriptions: Map<string, WorkspaceSubscription> = new Map([
    [
      'ws-default-ezrab',
      {
        workspaceId: 'ws-default-ezrab',
        plan: 'PRO',
        status: 'ACTIVE',
        startsAt: '2026-01-01',
        expiresAt: '2027-01-01',
        creditBalance: 8500,
        creditLimit: 10000,
        creditUsedThisMonth: 1500
      }
    ],
    [
      'ws-trial-user',
      {
        workspaceId: 'ws-trial-user',
        plan: 'FREE_TRIAL',
        status: 'ACTIVE',
        startsAt: '2026-09-01',
        expiresAt: '2026-09-30',
        creditBalance: 0, // Depleted trial
        creditLimit: 100,
        creditUsedThisMonth: 100
      }
    ]
  ]);

  public getSubscription(workspaceId: string): WorkspaceSubscription {
    const sub = this.subscriptions.get(workspaceId);
    if (sub) return sub;
    return {
      workspaceId,
      plan: 'FREE_TRIAL',
      status: 'ACTIVE',
      startsAt: '2026-09-01',
      expiresAt: '2026-09-30',
      creditBalance: 50,
      creditLimit: 100,
      creditUsedThisMonth: 50
    };
  }

  public checkCredit(workspaceId: string, cost = 1): boolean {
    const sub = this.getSubscription(workspaceId);
    return sub.creditBalance >= cost;
  }

  public deductCredit(workspaceId: string, amount = 1): boolean {
    const sub = this.getSubscription(workspaceId);
    if (sub.creditBalance < amount) return false;
    sub.creditBalance -= amount;
    sub.creditUsedThisMonth += amount;
    this.subscriptions.set(workspaceId, sub);
    return true;
  }
}

// Singletons
export const wbsDataService = new WbsDataService();
export const qtoDataService = new QtoDataService();
export const priceDataService = new PriceDataService();
export const dedDataService = new DedDataService();
export const timeScheduleDataService = new TimeScheduleDataService();
export const teamDataService = new TeamDataService();
export const subscriptionDataService = new SubscriptionDataService();
