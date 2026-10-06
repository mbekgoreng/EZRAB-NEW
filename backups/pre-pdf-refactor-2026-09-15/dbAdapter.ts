import {
  DbAiConversation,
  DbAiMessage,
  DbAiToolCall,
  DbAiUsage,
  DbAiDocument,
  DbAiContextCache,
  DbAiAuditLog,
} from './types';
import { Project, RabItem, ScheduleTask, KurvaSDataPoint } from '../../src/types';

export class AiDatabaseAdapter {
  private conversations: Map<string, DbAiConversation> = new Map();
  private messages: Map<string, DbAiMessage[]> = new Map(); // conversation_id -> messages
  private toolCalls: Map<string, DbAiToolCall> = new Map();
  private usages: DbAiUsage[] = [];
  private documents: Map<string, DbAiDocument> = new Map();
  private contextCaches: Map<string, DbAiContextCache> = new Map(); // key: workspace:project:type:hash
  private auditLogs: DbAiAuditLog[] = [];

  // Project & Construction data stores (isolated by workspace_id & project_id)
  private projects: Map<string, Project & { workspace_id: string }> = new Map();
  private rabItems: Map<string, (RabItem & { workspace_id: string })[]> = new Map(); // project_id -> items
  private scheduleTasks: Map<string, (ScheduleTask & { workspace_id: string })[]> = new Map(); // project_id -> tasks
  private kurvaSPoints: Map<string, KurvaSDataPoint[]> = new Map(); // project_id -> points

  constructor() {
    this.seedInitialProjectData();
  }

  /**
   * Check if two workspace IDs match (case-insensitive + default alias)
   */
  public matchesWorkspace(w1: string, w2: string): boolean {
    if (!w1 || !w2) return false;
    if (w1.toLowerCase() === w2.toLowerCase()) return true;
    const defaults = ['ws-default-ezrab', 'ws-default-2026'];
    return defaults.includes(w1.toLowerCase()) && defaults.includes(w2.toLowerCase());
  }

  /**
   * Seed canonical portfolio projects so the backend immediately has real project data
   */
  private seedInitialProjectData() {
    const defaultWorkspace = 'ws-default-ezrab';

    const p1: Project & { workspace_id: string } = {
      id: 'PRJ-TROPIS-MODERN-01',
      projectNumber: 'PRJ-2026-001',
      name: 'Rumah Tinggal Tropis Modern 2 Lantai',
      client: 'Bpk. Hendra Kusuma',
      clientName: 'Bpk. Hendra Kusuma',
      location: 'Cilandak, Jakarta Selatan',
      buildingType: 'Rumah Tinggal',
      status: 'in_progress',
      progress: 42.5,
      totalRab: 813111324,
      createdAt: '2026-08-10T10:00:00.000Z',
      updatedAt: '2026-08-14T09:30:00.000Z',
      workspace_id: defaultWorkspace,
      itemsCount: 6,
      sections: [],
      costSummary: {
        directCost: 732532724,
        overheadPercent: 5,
        overheadAmount: 36626636,
        profitPercent: 5,
        profitAmount: 36626636,
        contingencyPercent: 0,
        contingencyAmount: 0,
        directorMarkupPercent: 0,
        directorMarkupNominal: 0,
        directorMarkupTotal: 0,
        showMarkupToEditor: false,
        showMarkupToClient: false,
        subtotalBeforeTax: 805786000,
        taxPercent: 11,
        taxAmount: 7325324,
        grandTotal: 813111324,
        costPerM2: 2450000,
      },
    };

    const p2: Project & { workspace_id: string } = {
      id: 'PRJ-KANTOR-SCBD-02',
      projectNumber: 'PRJ-2026-002',
      name: 'Gedung Kantor Kreatif 4 Lantai',
      client: 'PT Ruang Kreatif Nusantara',
      clientName: 'PT Ruang Kreatif Nusantara',
      location: 'SCBD, Jakarta Selatan',
      buildingType: 'Gedung Kantor',
      status: 'draft',
      progress: 0,
      totalRab: 8940000000,
      createdAt: '2026-08-12T09:00:00.000Z',
      updatedAt: '2026-08-14T11:00:00.000Z',
      workspace_id: defaultWorkspace,
      itemsCount: 14,
      sections: [],
    };

    const p3: Project & { workspace_id: string } = {
      id: 'PRJ-VILLA-BALI-03',
      projectNumber: 'PRJ-2026-003',
      name: 'Villa Cliffside Jimbaran',
      client: 'Bpk. Richard Wijaya',
      clientName: 'Bpk. Richard Wijaya',
      location: 'Jimbaran, Bali',
      buildingType: 'Hotel & Resort',
      status: 'completed',
      progress: 100,
      totalRab: 5750000000,
      createdAt: '2026-07-01T08:00:00.000Z',
      updatedAt: '2026-08-14T12:00:00.000Z',
      workspace_id: defaultWorkspace,
      itemsCount: 22,
      sections: [],
    };

    this.projects.set(p1.id, p1);
    this.projects.set('PRJ-RUMAH-TROPIS-01', { ...p1, id: 'PRJ-RUMAH-TROPIS-01', name: 'Rumah Tinggal Modern Tropis 2 Lantai' });
    this.projects.set(p2.id, p2);
    this.projects.set(p3.id, p3);

    // Initial RAB items for Flagship Project
    const rabP1: (RabItem & { workspace_id: string })[] = [
      {
        id: 'RAB-TROPIS-01',
        projectId: p1.id,
        workspace_id: defaultWorkspace,
        no: 1,
        code: 'A.2.2.1.9',
        category: 'Pekerjaan Persiapan & Pondasi',
        description: 'Pengukuran dan pemasangan Bouwplank profil kayu 5/7',
        volume: 64.0,
        unit: 'm¹',
        unitPrice: 125400,
        amount: 8025600,
        totalPrice: 8025600,
        ahspCode: 'A.2.2.1.9',
      },
      {
        id: 'RAB-TROPIS-02',
        projectId: p1.id,
        workspace_id: defaultWorkspace,
        no: 2,
        code: 'A.2.3.1.1',
        category: 'Pekerjaan Persiapan & Pondasi',
        description: 'Galian tanah pondasi batu kali kedalaman 1 meter',
        volume: 68.2,
        unit: 'm³',
        unitPrice: 86200,
        amount: 5878840,
        totalPrice: 5878840,
        ahspCode: 'A.2.3.1.1',
      },
      {
        id: 'RAB-TROPIS-03',
        projectId: p1.id,
        workspace_id: defaultWorkspace,
        no: 1,
        code: 'A.4.1.1.5',
        category: 'Pekerjaan Struktur Beton Bertulang',
        description: 'Beton K-300 ready mix untuk Kolom & Balok Lt. 1 & 2',
        volume: 184.0,
        unit: 'm³',
        unitPrice: 1250000,
        amount: 230000000,
        totalPrice: 230000000,
        ahspCode: 'A.4.1.1.5',
      },
      {
        id: 'RAB-TROPIS-04',
        projectId: p1.id,
        workspace_id: defaultWorkspace,
        no: 2,
        code: 'A.4.1.1.17',
        category: 'Pekerjaan Struktur Beton Bertulang',
        description: 'Pembesian ulir D13 & D16 baja tulangan BJTS 420B',
        volume: 14250.0,
        unit: 'kg',
        unitPrice: 18144,
        amount: 258552000,
        totalPrice: 258552000,
        ahspCode: 'A.4.1.1.17',
      },
      {
        id: 'RAB-TROPIS-05',
        projectId: p1.id,
        workspace_id: defaultWorkspace,
        no: 1,
        code: 'A.4.4.1.1',
        category: 'Pekerjaan Dinding & Plesteran',
        description: 'Pasangan dinding bata ringan (hebel) tebal 10cm + mortar',
        volume: 485.0,
        unit: 'm²',
        unitPrice: 142000,
        amount: 68870000,
        totalPrice: 68870000,
        ahspCode: 'A.4.4.1.1',
      },
      {
        id: 'RAB-TROPIS-06',
        projectId: p1.id,
        workspace_id: defaultWorkspace,
        no: 1,
        code: 'A.4.4.3.3',
        category: 'Pekerjaan Lantai & Keramik',
        description: 'Pemasangan Granit Tile 60×60cm Glazed Polish ruang utama',
        volume: 320.0,
        unit: 'm²',
        unitPrice: 285000,
        amount: 91200000,
        totalPrice: 91200000,
        ahspCode: 'A.4.4.3.3',
      },
    ];

    this.rabItems.set(p1.id, rabP1);
    this.rabItems.set('PRJ-RUMAH-TROPIS-01', rabP1.map((r) => ({ ...r, projectId: 'PRJ-RUMAH-TROPIS-01' })));

    // Initial Kurva S data points for p1
    const p1KurvaPoints: KurvaSDataPoint[] = [
      { weekIndex: 1, weekLabel: 'Mgg 1', startDate: '2026-08-01', endDate: '2026-08-07', plannedWeeklyPercent: 5.5, cumulativePlannedPercent: 5.5, plannedWeeklyCost: 40000000, cumulativePlannedCost: 40000000, actualProgressPercent: 5.8 },
      { weekIndex: 2, weekLabel: 'Mgg 2', startDate: '2026-08-08', endDate: '2026-08-14', plannedWeeklyPercent: 10.5, cumulativePlannedPercent: 16.0, plannedWeeklyCost: 80000000, cumulativePlannedCost: 120000000, actualProgressPercent: 15.5 },
      { weekIndex: 3, weekLabel: 'Mgg 3', startDate: '2026-08-15', endDate: '2026-08-21', plannedWeeklyPercent: 14.0, cumulativePlannedPercent: 30.0, plannedWeeklyCost: 115000000, cumulativePlannedCost: 235000000, actualProgressPercent: 28.5 },
      { weekIndex: 4, weekLabel: 'Mgg 4', startDate: '2026-08-22', endDate: '2026-08-28', plannedWeeklyPercent: 15.0, cumulativePlannedPercent: 45.0, plannedWeeklyCost: 122000000, cumulativePlannedCost: 357000000, actualProgressPercent: 42.5 },
      { weekIndex: 5, weekLabel: 'Mgg 5', startDate: '2026-08-29', endDate: '2026-09-04', plannedWeeklyPercent: 18.0, cumulativePlannedPercent: 63.0, plannedWeeklyCost: 146000000, cumulativePlannedCost: 503000000 },
      { weekIndex: 6, weekLabel: 'Mgg 6', startDate: '2026-09-05', endDate: '2026-09-11', plannedWeeklyPercent: 16.0, cumulativePlannedPercent: 79.0, plannedWeeklyCost: 130000000, cumulativePlannedCost: 633000000 },
      { weekIndex: 7, weekLabel: 'Mgg 7', startDate: '2026-09-12', endDate: '2026-09-18', plannedWeeklyPercent: 12.0, cumulativePlannedPercent: 91.0, plannedWeeklyCost: 98000000, cumulativePlannedCost: 731000000 },
      { weekIndex: 8, weekLabel: 'Mgg 8', startDate: '2026-09-19', endDate: '2026-09-25', plannedWeeklyPercent: 9.0, cumulativePlannedPercent: 100.0, plannedWeeklyCost: 82111324, cumulativePlannedCost: 813111324 },
    ];
    this.kurvaSPoints.set(p1.id, p1KurvaPoints);
    this.kurvaSPoints.set('PRJ-RUMAH-TROPIS-01', p1KurvaPoints);
  }

  // =========================================================================
  // 1. ISOLATION & PROJECT ENFORCEMENT
  // =========================================================================

  /**
   * Enforces strict workspace and project isolation.
   * Throws Error if project does not belong to the authenticated workspace.
   */
  public async getProjectAuthorized(workspaceId: string, projectId: string): Promise<Project> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`PROJECT_NOT_FOUND: Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }
    if (!this.matchesWorkspace(project.workspace_id, workspaceId)) {
      throw new Error(`AI_PERMISSION_DENIED: Akses ditolak. Proyek '${projectId}' bukan milik workspace '${workspaceId}'.`);
    }
    return project;
  }

  public getProject(workspaceId: string, projectId: string): Project | null {
    const project = this.projects.get(projectId);
    if (!project) return null;
    if (!this.matchesWorkspace(project.workspace_id, workspaceId)) return null;
    return project;
  }

  public getKurvaS(workspaceId: string, projectId: string): KurvaSDataPoint[] {
    const project = this.getProject(workspaceId, projectId);
    if (!project) return [];
    return this.kurvaSPoints.get(projectId) || [];
  }

  public getProjects(workspaceId: string): Project[] {
    const results: Project[] = [];
    for (const p of this.projects.values()) {
      if (this.matchesWorkspace(p.workspace_id, workspaceId)) {
        results.push(p);
      }
    }
    return results;
  }

  public async getProjectsForWorkspace(workspaceId: string): Promise<Project[]> {
    return this.getProjects(workspaceId);
  }

  public createProject(workspaceId: string, projectData: Partial<Project> & { id: string; name: string }): Project {
    const newProject: Project & { workspace_id: string } = {
      id: projectData.id,
      projectNumber: projectData.projectNumber || `PRJ-${Date.now()}`,
      name: projectData.name,
      client: projectData.client || projectData.clientName || 'Klien',
      clientName: projectData.clientName || projectData.client || 'Klien',
      location: projectData.location || 'Indonesia',
      buildingType: projectData.buildingType || 'Umum',
      status: projectData.status || 'draft',
      progress: projectData.progress || 0,
      totalRab: projectData.totalRab || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workspace_id: workspaceId,
      itemsCount: 0,
      sections: [],
    };
    this.projects.set(newProject.id, newProject);
    return newProject;
  }

  // =========================================================================
  // 2. RAB DATA ACCESS & MUTATIONS
  // =========================================================================

  public async getRabItems(workspaceId: string, projectId: string): Promise<RabItem[]> {
    await this.getProjectAuthorized(workspaceId, projectId);
    const items = this.rabItems.get(projectId) || [];
    return items.filter((i) => i.workspace_id === workspaceId);
  }

  public async addRabItem(
    workspaceId: string,
    projectId: string,
    item: Partial<RabItem> & { description: string; volume: number; unit: string; unitPrice: number; ahspCode?: string; category?: string }
  ): Promise<RabItem> {
    await this.getProjectAuthorized(workspaceId, projectId);
    const currentItems = this.rabItems.get(projectId) || [];

    const newItem: RabItem & { workspace_id: string } = {
      id: `RAB-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      projectId,
      workspace_id: workspaceId,
      no: currentItems.length + 1,
      code: item.ahspCode || item.code || 'CUSTOM.01',
      category: item.category || 'Pekerjaan Dinding & Plesteran',
      description: item.description,
      volume: item.volume,
      unit: item.unit,
      unitPrice: item.unitPrice,
      amount: Math.round(item.volume * item.unitPrice),
      totalPrice: Math.round(item.volume * item.unitPrice),
      ahspCode: item.ahspCode,
    };

    currentItems.push(newItem);
    this.rabItems.set(projectId, currentItems);

    // Invalidate caches for this project
    this.invalidateContextCache(workspaceId, projectId);

    // Recalculate project total
    this.recalculateProjectTotal(projectId);

    return newItem;
  }

  public async updateRabItem(
    workspaceId: string,
    projectId: string,
    itemId: string,
    updates: Partial<RabItem>
  ): Promise<RabItem> {
    await this.getProjectAuthorized(workspaceId, projectId);
    const currentItems = this.rabItems.get(projectId) || [];
    const idx = currentItems.findIndex((i) => i.id === itemId && i.workspace_id === workspaceId);

    if (idx === -1) {
      throw new Error(`RAB_ITEM_NOT_FOUND: Item RAB dengan ID '${itemId}' tidak ditemukan.`);
    }

    const before = { ...currentItems[idx] };
    const updated = {
      ...currentItems[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (updates.volume !== undefined || updates.unitPrice !== undefined) {
      const vol = updates.volume ?? updated.volume;
      const price = updates.unitPrice ?? updated.unitPrice;
      updated.amount = Math.round(vol * price);
      updated.totalPrice = updated.amount;
    }

    currentItems[idx] = updated;
    this.rabItems.set(projectId, currentItems);

    this.invalidateContextCache(workspaceId, projectId);
    this.recalculateProjectTotal(projectId);

    return updated;
  }

  public async deleteRabItem(workspaceId: string, projectId: string, itemId: string): Promise<RabItem> {
    await this.getProjectAuthorized(workspaceId, projectId);
    const currentItems = this.rabItems.get(projectId) || [];
    const idx = currentItems.findIndex((i) => i.id === itemId && i.workspace_id === workspaceId);

    if (idx === -1) {
      throw new Error(`RAB_ITEM_NOT_FOUND: Item RAB dengan ID '${itemId}' tidak ditemukan.`);
    }

    const removed = currentItems[idx];
    currentItems.splice(idx, 1);
    this.rabItems.set(projectId, currentItems);

    this.invalidateContextCache(workspaceId, projectId);
    this.recalculateProjectTotal(projectId);

    return removed;
  }

  private recalculateProjectTotal(projectId: string) {
    const p = this.projects.get(projectId);
    if (!p) return;
    const items = this.rabItems.get(projectId) || [];
    const directCost = items.reduce((sum, item) => sum + (item.totalPrice || item.volume * item.unitPrice || 0), 0);
    const overhead = Math.round(directCost * 0.05);
    const profit = Math.round(directCost * 0.05);
    const subtotal = directCost + overhead + profit;
    const tax = Math.round(subtotal * 0.11);
    const grandTotal = subtotal + tax;

    p.totalRab = grandTotal;
    p.updatedAt = new Date().toISOString();
    if (p.costSummary) {
      p.costSummary.directCost = directCost;
      p.costSummary.overheadAmount = overhead;
      p.costSummary.profitAmount = profit;
      p.costSummary.subtotalBeforeTax = subtotal;
      p.costSummary.taxAmount = tax;
      p.costSummary.grandTotal = grandTotal;
    }
  }

  // =========================================================================
  // 3. PROGRESS & KURVA S
  // =========================================================================

  public async getCurveSPoints(workspaceId: string, projectId: string): Promise<KurvaSDataPoint[]> {
    await this.getProjectAuthorized(workspaceId, projectId);
    return this.kurvaSPoints.get(projectId) || [];
  }

  public async updateProjectProgress(workspaceId: string, projectId: string, newProgress: number): Promise<Project> {
    const project = await this.getProjectAuthorized(workspaceId, projectId);
    project.progress = Math.max(0, Math.min(100, Number(newProgress.toFixed(2))));
    project.updatedAt = new Date().toISOString();

    // Update latest curve S actual point if exists
    const points = this.kurvaSPoints.get(projectId);
    if (points && points.length > 0) {
      const activeIdx = points.findIndex((p) => p.actualProgressPercent === undefined);
      const targetPoint = activeIdx !== -1 ? points[Math.max(0, activeIdx - 1)] : points[points.length - 1];
      if (targetPoint) {
        targetPoint.actualProgressPercent = project.progress;
      }
    }

    this.invalidateContextCache(workspaceId, projectId);
    return project;
  }

  // =========================================================================
  // 4. CONVERSATIONS & MESSAGES
  // =========================================================================

  public async createConversation(
    workspaceId: string,
    projectId: string,
    userId: string,
    title: string
  ): Promise<DbAiConversation> {
    await this.getProjectAuthorized(workspaceId, projectId);
    const conv: DbAiConversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      workspace_id: workspaceId,
      project_id: projectId,
      user_id: userId,
      title: title || 'Percakapan Estimasi Baru',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.conversations.set(conv.id, conv);
    this.messages.set(conv.id, []);
    return conv;
  }

  public async getConversations(
    workspaceId: string,
    projectId?: string,
    userId?: string
  ): Promise<DbAiConversation[]> {
    const list: DbAiConversation[] = [];
    for (const c of this.conversations.values()) {
      if (!this.matchesWorkspace(c.workspace_id, workspaceId)) continue;
      if (projectId && c.project_id !== projectId) continue;
      if (userId && c.user_id !== userId) continue;
      list.push(c);
    }
    return list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  public async getConversationById(
    workspaceId: string,
    conversationId: string
  ): Promise<{ conversation: DbAiConversation; messages: DbAiMessage[] }> {
    const conv = this.conversations.get(conversationId);
    if (!conv) {
      throw new Error(`CONVERSATION_NOT_FOUND: Percakapan '${conversationId}' tidak ditemukan.`);
    }
    if (conv.workspace_id !== workspaceId) {
      throw new Error(`AI_PERMISSION_DENIED: Percakapan '${conversationId}' bukan milik workspace Anda.`);
    }
    const msgs = this.messages.get(conversationId) || [];
    return { conversation: conv, messages: msgs };
  }

  public async deleteConversation(workspaceId: string, conversationId: string): Promise<boolean> {
    const conv = this.conversations.get(conversationId);
    if (!conv) return false;
    if (conv.workspace_id !== workspaceId) {
      throw new Error(`AI_PERMISSION_DENIED: Tidak dapat menghapus percakapan dari workspace lain.`);
    }
    this.conversations.delete(conversationId);
    this.messages.delete(conversationId);
    return true;
  }

  public async addMessage(
    conversationId: string,
    role: DbAiMessage['role'],
    content: string,
    messageType: DbAiMessage['message_type'] = 'text',
    metadata?: Record<string, any>
  ): Promise<DbAiMessage> {
    const conv = this.conversations.get(conversationId);
    if (!conv) throw new Error(`Conversation not found: ${conversationId}`);

    const msg: DbAiMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      conversation_id: conversationId,
      role,
      content,
      message_type: messageType,
      metadata,
      created_at: new Date().toISOString(),
    };

    const msgs = this.messages.get(conversationId) || [];
    msgs.push(msg);
    this.messages.set(conversationId, msgs);

    conv.updated_at = msg.created_at;
    return msg;
  }

  // =========================================================================
  // 5. TOOL CALLS & AUDIT LOGS
  // =========================================================================

  public async recordToolCall(toolCall: Omit<DbAiToolCall, 'id' | 'created_at'>): Promise<DbAiToolCall> {
    const entry: DbAiToolCall = {
      ...toolCall,
      id: `tc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      created_at: new Date().toISOString(),
    };
    this.toolCalls.set(entry.id, entry);
    return entry;
  }

  public async recordAuditLog(log: Omit<DbAiAuditLog, 'id' | 'timestamp'>): Promise<DbAiAuditLog> {
    const entry: DbAiAuditLog = {
      ...log,
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
    };
    this.auditLogs.push(entry);
    return entry;
  }

  public async getAuditLogs(workspaceId: string, projectId?: string): Promise<DbAiAuditLog[]> {
    return this.auditLogs.filter((l) => {
      if (!this.matchesWorkspace(l.workspace_id, workspaceId)) return false;
      if (projectId && l.project_id !== projectId) return false;
      return true;
    });
  }

  // =========================================================================
  // 6. TOKEN USAGE & METRICS
  // =========================================================================

  public async recordUsage(usage: Omit<DbAiUsage, 'id' | 'created_at'>): Promise<DbAiUsage> {
    const entry: DbAiUsage = {
      ...usage,
      id: `use-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      created_at: new Date().toISOString(),
    };
    this.usages.push(entry);
    return entry;
  }

  // =========================================================================
  // 7. CONTEXT CACHING
  // =========================================================================

  public getContextCache(workspaceId: string, projectId: string, contextType: string, hash: string): any | null {
    const key = `${workspaceId}:${projectId}:${contextType}:${hash}`;
    const cache = this.contextCaches.get(key);
    if (!cache) return null;
    if (new Date(cache.expires_at).getTime() < Date.now()) {
      this.contextCaches.delete(key);
      return null;
    }
    return cache.data;
  }

  public setContextCache(
    workspaceId: string,
    projectId: string,
    contextType: string,
    hash: string,
    data: any,
    ttlSeconds = 60
  ): void {
    const key = `${workspaceId}:${projectId}:${contextType}:${hash}`;
    const entry: DbAiContextCache = {
      id: `cache-${Date.now()}`,
      workspace_id: workspaceId,
      project_id: projectId,
      context_type: contextType,
      context_hash: hash,
      data,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      created_at: new Date().toISOString(),
    };
    this.contextCaches.set(key, entry);
  }

  public invalidateContextCache(workspaceId: string, projectId: string): void {
    const prefix = `${workspaceId}:${projectId}:`;
    for (const key of this.contextCaches.keys()) {
      if (key.startsWith(prefix)) {
        this.contextCaches.delete(key);
      }
    }
  }

  public createAuditLog(log: {
    workspaceId: string;
    projectId?: string;
    userId: string;
    toolName: string;
    actionType: string;
    entityType: string;
    entityId?: string;
    beforeState?: any;
    afterState?: any;
    ipAddress?: string;
  }): DbAiAuditLog {
    const entry: DbAiAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      workspace_id: log.workspaceId,
      project_id: log.projectId || '',
      user_id: log.userId,
      tool_name: log.toolName,
      action_type: log.actionType,
      entity_type: log.entityType,
      entity_id: log.entityId,
      before_state: log.beforeState,
      after_state: log.afterState,
      ip_address: log.ipAddress,
      timestamp: new Date().toISOString()
    };
    this.auditLogs.unshift(entry);
    return entry;
  }

  // Answer Logging & Feedback Store
  private answerLogs: DbAnswerLog[] = [];
  private answerFeedback: DbAnswerFeedback[] = [];
  private importReports: DbDatasetImportReport[] = [];

  public logAnswer(data: Omit<DbAnswerLog, 'id' | 'created_at'>): DbAnswerLog {
    const entry: DbAnswerLog = {
      id: `ans-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      ...data,
      created_at: new Date().toISOString()
    };
    this.answerLogs.unshift(entry);
    if (this.answerLogs.length > 5000) this.answerLogs.pop();
    return entry;
  }

  public saveFeedback(data: Omit<DbAnswerFeedback, 'id' | 'created_at'>): DbAnswerFeedback {
    const entry: DbAnswerFeedback = {
      id: `fb-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      ...data,
      created_at: new Date().toISOString()
    };
    this.answerFeedback.unshift(entry);
    return entry;
  }

  public getFeedback(conversationId: string): DbAnswerFeedback[] {
    return this.answerFeedback.filter(f => f.conversation_id === conversationId);
  }

  public saveDatasetImportReport(report: Omit<DbDatasetImportReport, 'id' | 'created_at'>): DbDatasetImportReport {
    const entry: DbDatasetImportReport = {
      id: `rep-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      ...report,
      created_at: new Date().toISOString()
    };
    this.importReports.unshift(entry);
    return entry;
  }

  public getDatasetImportReports(): DbDatasetImportReport[] {
    return this.importReports;
  }

  public createToolCall(tc: {
    conversationId: string;
    toolName: string;
    arguments: Record<string, any>;
    result?: any;
    status: any;
    error?: string;
  }): DbAiToolCall {
    const entry: DbAiToolCall = {
      id: `tc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      conversation_id: tc.conversationId,
      tool_name: tc.toolName,
      arguments: tc.arguments,
      result: tc.result,
      status: tc.status,
      created_at: new Date().toISOString()
    };
    this.toolCalls.set(entry.id, entry);
    return entry;
  }

  public getMessages(conversationId: string) {
    return (this.messages.get(conversationId) || []).map(m => ({
      id: m.id,
      conversationId: m.conversation_id,
      role: m.role,
      content: m.content,
      toolCallId: m.metadata?.toolCallId,
      createdAt: m.created_at
    }));
  }

  public getConversation(conversationId: string): DbAiConversation | undefined {
    return this.conversations.get(conversationId);
  }
}

export const defaultDatabaseAdapter = new AiDatabaseAdapter();
export const aiDbAdapter = defaultDatabaseAdapter;


